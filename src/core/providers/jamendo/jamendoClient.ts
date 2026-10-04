// Jamendo provider (P1): open catalogue, full-length streams, FLAC where provided.
// Requires a free client_id (devportal.jamendo.com). WITHOUT a key every call
// throws JamendoNotConfigured — the UI stays honest, never faked.
// Docs: https://developer.jamendo.com/v3.0 (verified Oct 2026).

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
  // Safe outside Vite (import.meta.env is undefined under plain node/tsx).
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const env = meta.env?.VITE_JAMENDO_CLIENT_ID?.trim();
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

function mapTrack(raw: RawTrack, requested: JamendoFormat): JamendoTrack | null {
  if (raw.id === undefined || !raw.name || !raw.audio) return null;
  const url = raw.audio;
  const actual: JamendoTrack['audioFormat'] =
    /\.flac(\?|$)/i.test(url) ? 'flac' : /\.ogg(\?|$)/i.test(url) ? 'ogg' : /\.mp3(\?|$)/i.test(url) && requested === 'mp32' ? 'mp32' : 'mp31';
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

/** Search tracks. One request, MP3 VBR (universal). FLAC upgrade happens at play time. */
export async function jamendoSearchTracks(query: string, limit = 10, offset = 0): Promise<JamendoTrack[]> {
  const data = await call('/tracks/', {
    search: query.slice(0, 100),
    include: 'musicinfo+licenses',
    audioformat: 'mp32',
    limit: String(Math.min(20, Math.max(1, limit))),
    offset: String(Math.max(0, offset))
  });
  return (data.results ?? []).map((r) => mapTrack(r, 'mp32')).filter((t): t is JamendoTrack => !!t);
}

/** Resolve the best playable file for a track (FLAC when preferred AND provided). */
export async function jamendoResolveTrack(id: string): Promise<JamendoTrack> {
  const pref = jamendoQualityPref();
  if (pref === 'flac') {
    try {
      const data = await call('/tracks/', { id, audioformat: 'flac', limit: '1' });
      const t = (data.results ?? []).map((r) => mapTrack(r, 'flac')).find(Boolean);
      if (t && t.audioFormat === 'flac') return t;
    } catch {
      // fall through to MP3
    }
  }
  const data = await call('/tracks/', { id, include: 'musicinfo+licenses', audioformat: 'mp32', limit: '1' });
  const t = (data.results ?? []).map((r) => mapTrack(r, 'mp32')).find(Boolean);
  if (!t) throw new Error('Jamendo track unavailable');
  return t;
}

/** Popular chart for discovery shelves (featured selections by Jamendo managers). */
export async function jamendoChart(tag = 'electronic', limit = 8): Promise<JamendoTrack[]> {
  const data = await call('/tracks/', {
    tags: tag,
    featured: '1',
    boost: 'popularity_month',
    groupby: 'artist_id',
    audioformat: 'mp32',
    limit: String(Math.min(20, Math.max(1, limit)))
  });
  return (data.results ?? []).map((r) => mapTrack(r, 'mp32')).filter((t): t is JamendoTrack => !!t);
}

export function jamendoQualityLabel(t: JamendoTrack): string {
  return t.audioFormat === 'flac' ? 'FLAC' : t.audioFormat === 'ogg' ? 'OGG' : 'MP3 VBR';
}
