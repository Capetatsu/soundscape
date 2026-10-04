// Listening events (15_STATISTICS_SYSTEM.md): only from real playback.
// Never fabricate history. Call recordStart on confirmed playing, recordEnd on pause/end.
import { db } from '../db/database';

interface OpenEvent {
  trackUri: string;
  startedAt: number;
  durationMs: number;
  contextUri: string | null;
  provider: string;
}

let open: OpenEvent | null = null;

export function recordPlaybackStart(e: OpenEvent): void {
  open = e;
}

export async function recordPlaybackEnd(playedMs: number, completed: boolean): Promise<void> {
  if (!open) return;
  const ev = open;
  open = null;
  if (playedMs < 5000) {
    // Short listen = skip (counted, never stored as a play). Ignore sub-second blips.
    if (playedMs >= 1000) void recordSkip(ev.provider);
    return;
  }
  await db.addListeningEvent({
    trackUri: ev.trackUri, startedAt: ev.startedAt,
    playedMs: Math.round(playedMs), durationMs: ev.durationMs,
    completed, contextUri: ev.contextUri, provider: ev.provider
  });
}

export async function topTracks(limit = 10, sinceMs?: number): Promise<{ trackUri: string; plays: number; ms: number }[]> {  const events = await db.getListeningEvents(2000);
  const map = new Map<string, { plays: number; ms: number }>();
  for (const e of events) {
    if (sinceMs && e.startedAt < sinceMs) continue;
    const r = map.get(e.trackUri) ?? { plays: 0, ms: 0 };
    r.plays += 1;
    r.ms += e.playedMs;
    map.set(e.trackUri, r);
  }
  return [...map.entries()]
    .map(([trackUri, v]) => ({ trackUri, ...v }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);
}

export interface RecentPlay {
  trackUri: string;
  startedAt: number;
  playedMs: number;
  completed: boolean;
  provider: string;
}

/** Most recent listening events (real plays only), newest first. */
export async function recentPlays(limit = 10): Promise<RecentPlay[]> {
  const events = await db.getListeningEvents(limit);
  return events.map((e) => ({
    trackUri: e.trackUri,
    startedAt: e.startedAt,
    playedMs: e.playedMs,
    completed: e.completed,
    provider: e.provider
  }));
}

/** Skips: advances with <5s listened. Lightweight counters (never fake plays). */
export async function recordSkip(provider: string): Promise<void> {
  try {
    const raw = await db.kvGet('skipCounts');
    const counts = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    counts[provider] = (counts[provider] ?? 0) + 1;
    counts.total = (counts.total ?? 0) + 1;
    await db.kvSet('skipCounts', JSON.stringify(counts));
  } catch {}
}

export async function skipCounts(): Promise<Record<string, number>> {
  try {
    const raw = await db.kvGet('skipCounts');
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
