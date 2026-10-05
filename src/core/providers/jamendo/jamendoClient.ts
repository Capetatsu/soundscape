// Jamendo provider (P1): open catalogue, full-length streams, FLAC where provided.
// Requires a free client_id (devportal.jamendo.com). WITHOUT a key every call
// throws JamendoNotConfigured — the UI stays honest, never faked.
// Docs: https://developer.jamendo.com/v3.0 (verified Oct 2026).

import { readEnvKey } from '../../../config/env';

export class JamendoNotConfigured extends Error {
  constructor() {
    super('Jamendo client ID not configured. Add one in Settings → Free catalogue.');
    this.name = 'JamendoNotConfigured';
  }
}

export type JamendoFormat = 'mp32' | 'flac';

export interface JamendoTrack {
  id: string;
  name: string;
  artistName: string;
  artistId: string;
  albumName: string;
  albumId: string;
  albumImage: string | null;
  durationSec: number;
  audioUrl: string;
  audioFormat: JamendoFormat | 'mp31' | 'ogg';
  downloadAllowed: boolean;
  license: string | null;
  lyrics: string | null;
}

const API = 'https://api.jamendo.com/v3.0';

export function jamendoClientId(): string | null {
  // Build-time env first, then a Settings-entered value stored in this tab.
  const env = readEnvKey('VITE_JAMENDO_CLIENT_ID');
  if (env) return env;
  try {
    const stored = localStorage.getItem('soundscape_jamendo_client_id')?.trim();
    return stored || null;
  } catch {
    return null;
  }
}

export function jamendoConfigured(): boolean {
  return !!jamendoClientId();
}

export function jamendoQualityPref(): JamendoFormat {
  try {
    return localStorage.getItem('soundscape_jamendo_quality') === 'flac' ? 'flac' : 'mp32';
  } catch {
    return 'mp32';
  }
}

/**
 * Tracks already resolved by a search/chart call, keyed by id.
 *
 * Jamendo's free tier returns an empty result set for roughly half of all requests, so every
 * extra round-trip is another ~50% coin flip. Search responses already contain the playable
 * `audio` URL, so re-resolving at play time bought nothing but latency and failure. Cached
 * entries are only reused when their format matches what the user actually asked for —
 * with "FLAC first" enabled the cached MP3 is correctly ignored and a real resolve happens.
 */
const resolved = new Map<string, JamendoTrack>();

function remember(track: JamendoTrack): void {
  resolved.set(track.id, track);
}

function cachedForPref(id: string): JamendoTrack | null {
  const hit = resolved.get(id);
  if (!hit) return null;
  return jamendoQualityPref() === 'flac' ? hit.audioFormat === 'flac' ? hit : null : hit;
}

interface RawTrack {
  id?: string | number;
  name?: string;
  duration?: number;
  audio?: string;
  album_image?: string;
  album_id?: string | number;
  album_name?: string;
  artist_id?: string | number;
  artist_name?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
  lyrics?: string;
}

/**
 * Work out what Jamendo will actually stream.
 *
 * Jamendo returns audio as a `format=` QUERY PARAMETER, e.g.
 *   https://prod-1.storage.jamendo.com/?trackid=1348699&format=flac&from=...
 * There is no file extension at all. Matching on `\.flac` therefore never matched, FLAC was
 * reported as MP3, and "FLAC first" could never return a FLAC stream even though the API
 * happily serves one — verified live 2026-10-05. The extension checks remain as a fallback for
 * any other URL shape.
 */
function detectAudioFormat(url: string, requested: JamendoFormat): JamendoTrack['audioFormat'] {
  const q = /[?&]format=([a-z0-9]+)/i.exec(url)?.[1]?.toLowerCase();
  if (q === 'flac') return 'flac';
  if (q === 'mp32') return 'mp32';
  if (q === 'mp31') return 'mp31';
  if (q === 'ogg') return 'ogg';
  if (/\.flac(\?|$)/i.test(url)) return 'flac';
  if (/\.ogg(\?|$)/i.test(url)) return 'ogg';
  if (/\.mp3(\?|$)/i.test(url)) return requested === 'mp32' ? 'mp32' : 'mp31';
  return requested === 'mp32' ? 'mp32' : 'mp31';
}

function mapTrack(raw: RawTrack, requested: JamendoFormat): JamendoTrack | null {
  if (raw.id === undefined || !raw.name || !raw.audio) return null;
  const url = raw.audio;
  const actual = detectAudioFormat(url, requested);
  return {
    id: String(raw.id),
    name: raw.name,
    artistName: raw.artist_name ?? 'Unknown artist',
    artistId: String(raw.artist_id ?? ''),
    albumName: raw.album_name ?? '',
    albumId: String(raw.album_id ?? ''),
    albumImage: raw.album_image || null,
    durationSec: typeof raw.duration === 'number' ? raw.duration : 0,
    audioUrl: url,
    audioFormat: actual,
    downloadAllowed: !!raw.audiodownload_allowed,
    license: raw.license_ccurl ?? null,
    lyrics: typeof raw.lyrics === 'string' && raw.lyrics.trim() ? raw.lyrics : null
  };
}

async function call(path: string, params: Record<string, string>): Promise<{ results?: RawTrack[]; headers?: { results_count?: number } }> {
  const clientId = jamendoClientId();
  if (!clientId) throw new JamendoNotConfigured();
  const q = new URLSearchParams({ client_id: clientId, format: 'json', ...params });
  const res = await fetch(`${API}${path}?${q.toString()}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Jamendo HTTP ${res.status}`);
  return res.json();
}

/** Search tracks. One request, MP3 VBR (universal). FLAC upgrade happens at play time.
 *
 *  Measured 2026-10-05: Jamendo's free read-only tier intermittently answers an identical
 *  query with HTTP 200 + `results_count: 0` (roughly half of calls in testing, alternating
 *  10/0/10/0...). That is upstream flakiness, not an empty result set. One short retry
 *  recovers it; without the retry the UI silently showed Audius-only results for half of all
 *  searches even though Jamendo had matches.
 */
export async function jamendoSearchTracks(query: string, limit = 10, offset = 0): Promise<JamendoTrack[]> {
  const params = {
    search: query.slice(0, 100),
    include: 'musicinfo+licenses',
    audioformat: 'mp32',
    limit: String(Math.min(20, Math.max(1, limit))),
    offset: String(Math.max(0, offset))
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await call('/tracks/', params);
    const mapped = (data.results ?? []).map((r) => mapTrack(r, 'mp32')).filter((t): t is JamendoTrack => !!t);
    mapped.forEach(remember);
    // 4 attempts at a ~50% per-call empty rate leaves roughly a 6% chance of a false "no
    // matches". Below that threshold, showing Audius-only results is the honest outcome.
    if (mapped.length > 0 || attempt === 3) return mapped;
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

/** Resolve the best playable file for a track (FLAC when preferred AND provided).
 *
 *  Retries like search: Jamendo's free tier intermittently returns HTTP 200 + zero rows for
 *  an id query too, which without a retry made roughly half of all first-plays fail with
 *  "Jamendo track unavailable" even though the track was playable.
 */
export async function jamendoResolveTrack(id: string): Promise<JamendoTrack> {
  const pref = jamendoQualityPref();
  if (pref === 'flac') {
    try {
      const data = await call('/tracks/', { id, audioformat: 'flac', limit: '1' });
      const t = (data.results ?? []).map((r) => mapTrack(r, 'flac')).find(Boolean);
      if (t && t.audioFormat === 'flac') {
        remember(t);
        return t;
      }
    } catch {
      // fall through to MP3
    }
  }
  // A search/chart response already carried a playable URL for this id — reuse it instead of
  // spending another ~50%-failure-rate request. With FLAC-first on, a cached MP3 is skipped.
  const cached = cachedForPref(id);
  if (cached) return cached;
  const params = { id, include: 'musicinfo+licenses', audioformat: 'mp32', limit: '1' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await call('/tracks/', params);
    const t = (data.results ?? []).map((r) => mapTrack(r, 'mp32')).find(Boolean);
    if (t) {
      remember(t);
      return t;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Jamendo track unavailable');
}

/** Popularity chart for discovery shelves.
 *
 *  Query corrected 2026-10-05 against the live API. The original
 *  `tags=electronic + featured=1 + boost=popularity_month + groupby=artist_id` returned
 *  HTTP 200 with `results_count: 0` for a read-only client — the shelf was permanently
 *  empty. Measured: `sort=popularity_total` returns 8 tracks on 6/6 calls, while adding
 *  `tags=electronic` drops it to 1/6. So the chart is a real all-genre popularity ordering
 *  and the tag filter stays opt-in for callers that have verified it returns data.
 */
export async function jamendoChart(limit = 8, tag?: string): Promise<JamendoTrack[]> {
  const params: Record<string, string> = {
    sort: 'popularity_total',
    include: 'musicinfo+licenses',
    audioformat: 'mp32',
    limit: String(Math.min(20, Math.max(1, limit))),
    offset: '0'
  };
  if (tag) params.tags = tag;
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await call('/tracks/', params);
    const mapped = (data.results ?? []).map((r) => mapTrack(r, 'mp32')).filter((t): t is JamendoTrack => !!t);
    mapped.forEach(remember);
    if (mapped.length > 0 || attempt === 3) return mapped;
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

export function jamendoQualityLabel(t: JamendoTrack): string {
  return t.audioFormat === 'flac' ? 'FLAC' : t.audioFormat === 'ogg' ? 'OGG' : 'MP3 VBR';
}
