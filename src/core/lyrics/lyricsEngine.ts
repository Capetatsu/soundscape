// Lyrics engine (12_LYRICS_ENGINE.md): LRCLIB only. No Spotify lyrics.
// Honest states: synced | plain | unavailable | error. Never fabricate.
import { db } from '../db/database';

export type LyricsState =
  | { kind: 'loading' }
  | { kind: 'synced'; lines: LyricLine[] }
  | { kind: 'plain'; text: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; message: string };

export interface LyricLine {
  timeMs: number;
  text: string;
}

export function parseLrc(body: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of body.split('\n')) {
    const m = raw.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (!m) continue;
    const ms = Number(m[1]) * 60000 + Number(m[2]) * 1000;
    const text = m[3].trim();
    if (text) lines.push({ timeMs: Math.round(ms), text });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export async function fetchLyrics(opts: {
  title: string; artist: string; album?: string; durationSec?: number;
}): Promise<LyricsState> {
  const trackKey = `${opts.artist.trim().toLowerCase()}::${opts.title.trim().toLowerCase()}`;

  // 1. Check IndexedDB cache first
  try {
    const cached = await db.getLyrics(trackKey);
    if (cached) {
      if (cached.synced) {
        const lines = parseLrc(cached.body);
        if (lines.length) return { kind: 'synced', lines };
      } else if (cached.body) {
        return { kind: 'plain', text: cached.body };
      }
    }
  } catch (err) {
    console.warn('Lyrics cache read failed:', err);
  }

  // 2. Fetch from LRCLIB
  const q = new URLSearchParams({
    track_name: opts.title,
    artist_name: opts.artist,
    ...(opts.album ? { album_name: opts.album } : {}),
    ...(opts.durationSec ? { duration: String(Math.round(opts.durationSec)) } : {})
  });

  try {
    const res = await fetch(`https://lrclib.net/api/get?${q.toString()}`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return { kind: 'unavailable', reason: 'No lyrics found for this track.' };
    if (!res.ok) return { kind: 'error', message: `Lyrics service returned HTTP ${res.status}` };
    const data = (await res.json()) as { syncedLyrics?: string | null; plainLyrics?: string | null };

    if (data.syncedLyrics) {
      const lines = parseLrc(data.syncedLyrics);
      if (lines.length) {
        // Cache to IndexedDB
        void db.putLyrics(trackKey, data.syncedLyrics, true).catch(() => {});
        return { kind: 'synced', lines };
      }
    }
    if (data.plainLyrics) {
      // Cache to IndexedDB
      void db.putLyrics(trackKey, data.plainLyrics, false).catch(() => {});
      return { kind: 'plain', text: data.plainLyrics };
    }
    return { kind: 'unavailable', reason: 'No lyrics found for this track.' };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Lyrics fetch failed' };
  }
}

export function activeLine(lines: LyricLine[], positionMs: number, offsetMs = 0): number {
  const t = positionMs + offsetMs;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= t + 200) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
