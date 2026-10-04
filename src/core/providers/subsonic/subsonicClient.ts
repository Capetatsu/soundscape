// Self-hosted music server (P17): Subsonic-compatible API.
// Serves Navidrome, Jellyfin (Subsonic plugin), Gonic, Airsonic, LMS, Symfonium.
// USER-OWNED music only — no third-party catalogue involved.
// Auth: MD5(password+salt) or hex(token) per Subsonic spec; credentials never leave the browser
// except to the user's own server.

export interface SubsonicConfig {
  server: string;
  user: string;
  pass: string;
}

export interface SubsonicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  artistId: string | null;
  albumId: string | null;
  durationSec: number;
  coverUrl: string | null;
  streamUrl: string;
}

export class SubsonicError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'SubsonicError';
  }
}

const STORAGE_KEY = 'soundscape_subsonic';

export function loadSubsonicConfig(): SubsonicConfig | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as SubsonicConfig;
    return cfg.server && cfg.user ? cfg : null;
  } catch {
    return null;
  }
}

export function saveSubsonicConfig(cfg: SubsonicConfig | null): void {
  try {
    if (cfg) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function subsonicConfigured(): boolean {
  return loadSubsonicConfig() !== null;
}

/** Subsonic MD5 token auth (salted). Never persisted beyond session storage. */
async function authParams(cfg: SubsonicConfig, extra: Record<string, string> = {}): Promise<URLSearchParams> {
  const salt = crypto.randomUUID().replace(/-/g, '');
  return new URLSearchParams({
    u: cfg.user,
    t: md5(cfg.pass + salt),
    s: salt,
    v: '1.16.1',
    c: 'Soundscape',
    f: 'json',
    ...extra
  });
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Minimal MD5 (WebCrypto has none) for Subsonic's token scheme. */
function md5(message: string): string {
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
  const M = (s: string) => {
    const b = new TextEncoder().encode(s);
    const len = b.length;
    const withPad = new Uint8Array((((len + 8) >> 6) + 1) << 6);
    withPad.set(b);
    withPad[len] = 0x80;
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 8, len << 3, true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let i = 0; i < withPad.length; i += 64) {
      const MArr = Array.from({ length: 16 }, (_, j) => dv.getUint32(i + j * 4, true));
      let A = a0, B = b0, C = c0, D = d0;
      for (let j = 0; j < 64; j++) {
        let F: number, g: number;
        if (j < 16) { F = (B & C) | (~B & D); g = j; }
        else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
        else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * j) % 16; }
        F = (F + A + K[j] + MArr[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return hex(new Uint8Array([a0, b0, c0, d0].flatMap((w) => [w & 255, (w >> 8) & 255, (w >> 16) & 255, (w >> 24) & 255])));
  };
  return M(message);
}

async function call<T>(cfg: SubsonicConfig, endpoint: string, extra: Record<string, string> = {}): Promise<T> {
  const base = cfg.server.replace(/\/+$/, '');
  const salt = crypto.randomUUID().replace(/-/g, '');
  const token = md5(cfg.pass + salt);
  const params = new URLSearchParams({ u: cfg.user, t: token, s: salt, v: '1.16.1', c: 'Soundscape', f: 'json', ...extra });
  const res = await fetch(`${base}/rest/${endpoint}?${params.toString()}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new SubsonicError(`Server returned HTTP ${res.status}`, `http_${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const root = json['subsonic-response'] as { status?: string; error?: { code?: number; message?: string } } | undefined;
  if (!root || root.status !== 'ok') {
    throw new SubsonicError(root?.error?.message ?? 'Server rejected the request', root?.error?.code ? `err_${root.error.code}` : 'bad_response');
  }
  return json as T;
}

interface RawChild {
  id: string;
  title?: string;
  isDir?: boolean;
  parent?: string;
  artistId?: string;
  albumId?: string;
  artist?: string;
  album?: string;
  suffix?: string;
  contentType?: string;
  duration?: number;
  coverArt?: string;
}

function mapChild(raw: RawChild): SubsonicTrack | null {
  if (raw.isDir) return null;
  return {
    id: raw.id,
    title: raw.title || 'Unknown title',
    artist: raw.artist || 'Unknown artist',
    album: raw.album || '',
    artistId: raw.artistId || null,
    albumId: raw.albumId || null,
    durationSec: raw.duration ? Math.round(raw.duration) : 0,
    coverUrl: raw.coverArt ? `coverArt?id=${encodeURIComponent(raw.coverArt)}` : null,
    streamUrl: `stream?id=${encodeURIComponent(raw.id)}`
  };
}

async function search3<T>(cfg: SubsonicConfig, query: string, artistCount: number, artistOffset: number, albumCount: number, albumOffset: number, songCount: number, songOffset: number): Promise<T> {
  const params = await authParams(cfg, {
    query,
    artistCount: String(artistCount),
    artistOffset: String(artistOffset),
    albumCount: String(albumCount),
    albumOffset: String(albumOffset),
    songCount: String(songCount),
    songOffset: String(songOffset)
  });
  const base = cfg.server.replace(/\/+$/, '');
  const res = await fetch(`${base}/rest/search3?${params.toString()}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new SubsonicError(`Server returned HTTP ${res.status}`, `http_${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const root = json['subsonic-response'] as { status?: string; error?: { message?: string; code?: number } } | undefined;
  if (!root || root.status !== 'ok') throw new SubsonicError(root?.error?.message ?? 'Search rejected', 'search_failed');
  return json as T;
}

export async function subsonicPing(cfg: SubsonicConfig): Promise<{ ok: true; version: string }> {
  const res = await call<{ 'subsonic-response': { status: string; version?: string } }>(cfg, 'ping.view');
  return { ok: true, version: res['subsonic-response']?.version ?? 'unknown' };
}

export async function subsonicSearch(cfg: SubsonicConfig, query: string, limit = 40): Promise<SubsonicTrack[]> {
  const res = await search3<{
    'subsonic-response': { searchResult3?: { song?: RawChild[] } };
  }>(cfg, query, 0, 0, 0, 0, limit, 0);
  const songs = res['subsonic-response']?.searchResult3?.song ?? [];
  return songs.map(mapChild).filter((t): t is SubsonicTrack => !!t);
}

/** Cover art URL requires auth params — resolved by the caller through `subsonicUrl`. */
export async function subsonicUrl(cfg: SubsonicConfig, path: string): Promise<string> {
  const params = await authParams(cfg, path.includes('?') ? {} : {});
  const base = cfg.server.replace(/\/+$/, '');
  return `${base}/rest/${path}${path.includes('?') ? '&' : '?'}${params.toString()}`;
}