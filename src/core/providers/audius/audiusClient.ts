// Audius open-catalog client (P-A).
// Public endpoints need no key: app_name identifies the app. No auth => search + stream.
// Docs: https://docs.audius.co (verified Oct 2026). Free tier: 500k req/mo.
import type { TrackRef } from '../types';

const GATEWAY = 'https://discoveryprovider.audius.co/v1';
const APP_NAME = 'Soundscape';

export interface AudiusTrack {
  id: string;
  title: string;
  artistName: string;
  artistHandle: string;
  durationSec: number;
  artworkUrl: string | null;
  permalink: string;
  genre: string | null;
}

interface RawTrack {
  id?: string | number;
  title?: string;
  duration?: number;
  permalink?: string;
  genre?: string;
  artwork?: Record<string, string>;
  user?: { name?: string; handle?: string };
}

function mapTrack(raw: RawTrack): AudiusTrack | null {
  if (raw.id === undefined || !raw.title) return null;
  const art = raw.artwork ?? {};
  return {
    id: String(raw.id),
    title: raw.title,
    artistName: raw.user?.name ?? 'Unknown artist',
    artistHandle: raw.user?.handle ?? '',
    durationSec: typeof raw.duration === 'number' ? Math.round(raw.duration) : 0,
    artworkUrl: art['480x480'] ?? art['150x150'] ?? art['1000x1000'] ?? null,
    permalink: raw.permalink ?? '',
    genre: raw.genre ?? null
  };
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, app_name: APP_NAME });
  const res = await fetch(`${GATEWAY}${path}?${q.toString()}`, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Audius HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function audiusStreamUrl(trackId: string): string {
  return `${GATEWAY}/tracks/${encodeURIComponent(trackId)}/stream?app_name=${APP_NAME}`;
}

export async function audiusSearchTracks(query: string, limit = 10, offset = 0): Promise<AudiusTrack[]> {
  const data = await get<{ data?: RawTrack[] }>('/tracks/search', {
    query: query.slice(0, 100),
    limit: String(Math.min(25, Math.max(1, limit))),
    offset: String(Math.max(0, offset))
  });
  return (data.data ?? []).map(mapTrack).filter((t): t is AudiusTrack => !!t);
}

export async function audiusTrending(genre?: string, limit = 10): Promise<AudiusTrack[]> {
  const data = await get<{ data?: RawTrack[] }>('/tracks/trending', {
    ...(genre ? { genre } : {}),
    time: 'week',
    limit: String(Math.min(25, Math.max(1, limit)))
  });
  return (data.data ?? []).map(mapTrack).filter((t): t is AudiusTrack => !!t);
}

export function audiusToRef(t: AudiusTrack): TrackRef {
  return {
    uri: `audius:track:${t.id}`,
    name: t.title,
    artistNames: [t.artistName],
    albumName: null,
    albumUri: null,
    durationMs: t.durationSec * 1000,
    explicit: false,
    imageUrl: t.artworkUrl,
    previewUrl: null
  };
}
