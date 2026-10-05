// SyncEngine — real Spotify library sync (10_LIBRARY_SYNC.md).
// Remote authoritative. Local writes are write-through (Spotify first).
// Quick-check: page1 + total; full reconcile otherwise. Per-playlist checkpoint.

import { db } from '../db/database';

interface SpotifyPage<T> {
  items: T[];
  total?: number;
  next?: string | null;
}

export interface SyncReport {
  trigger: 'manual' | 'auto' | 'startup' | 'focus';
  startedAt: number;
  endedAt: number;
  playlistsAdded: number;
  playlistsRemoved: number;
  playlistsUpdated: number;
  likedAdded: number;
  likedRemoved: number;
  likedTotal: number;
  requests: number;
  errors: string[];
}

type FetchFn = (url: string) => Promise<{ status: number; body: unknown; retryAfterMs: number }>;

async function fetchWithRetry(fetchFn: FetchFn, url: string, onRequest: () => void): Promise<{ status: number; body: unknown }> {
  let last: { status: number; body: unknown } = { status: 0, body: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    onRequest();
    const r = await fetchFn(url);
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, r.retryAfterMs || 1000 * (attempt + 1)));
      continue;
    }
    if (r.status >= 500) {
      await new Promise((res) => setTimeout(res, [1000, 3000, 9000][attempt]));
      last = r;
      continue;
    }
    return r;
  }
  return last;
}

export class SyncEngine {
  private running = false;
  constructor(
    private accountId: string,
    private getToken: () => Promise<string | null>,
    private userId: string
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  private async authedFetch(url: string): Promise<{ status: number; body: unknown; retryAfterMs: number }> {
    const token = await this.getToken();
    if (!token) return { status: 401, body: null, retryAfterMs: 0 };
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const retryAfter = Number(res.headers.get('Retry-After') || 0) * 1000;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body, retryAfterMs: retryAfter };
  }

  async run(trigger: SyncReport['trigger'] = 'manual'): Promise<SyncReport> {
    if (this.running) throw new Error('Sync already running');
    if (!navigator.onLine) throw new Error('Offline — showing cached library');
    this.running = true;
    const startedAt = Date.now();
    const report: SyncReport = {
      trigger, startedAt, endedAt: 0,
      playlistsAdded: 0, playlistsRemoved: 0, playlistsUpdated: 0,
      likedAdded: 0, likedRemoved: 0, likedTotal: 0, requests: 0, errors: []
    };
    const count = () => {
      report.requests += 1;
    };
    try {
      await this.syncPlaylists(report, count);
      await this.syncLiked(report, count);
      await db.putSyncState({
        accountId: this.accountId, collection: 'library',
        lastSyncedAt: Date.now(), lastFullAt: Date.now(), total: report.likedTotal
      });
      await db.kvSet(`lastSync:${this.accountId}`, String(Date.now()));
    } finally {
      report.endedAt = Date.now();
      this.running = false;
    }
    return report;
  }

  private async syncPlaylists(report: SyncReport, count: () => void): Promise<void> {
    // Page playlist metadata fully (50/page), diff by id.
    const remote = new Map<string, Record<string, unknown>>();
    let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50&offset=0';
    while (url) {
      const r = await fetchWithRetry((u) => this.authedFetch(u), url, count);
      if (r.status !== 200) {
        report.errors.push(`playlists: HTTP ${r.status}`);
        break;
      }
      const page = r.body as SpotifyPage<Record<string, unknown>>;
      for (const p of page.items || []) remote.set(String(p['uri'] || p['id']), p);
      url = (page.next as string) || null;
    }
    const local = await db.getPlaylists();
    const localByUri = new Map(local.filter((p) => p.accountId === this.accountId).map((p) => [p.uri, p]));
    const toPut = [];
    for (const [uri, p] of remote) {
      const id = String(p['id'] ?? '');
      const existing = localByUri.get(uri) || localByUri.get(`spotify:playlist:${id}`);
      const snap = (p['snapshot_id'] as string) ?? null;
      const canon: Parameters<typeof db.putPlaylists>[0][number] = {
        uri: uri.startsWith('spotify:') ? uri : `spotify:playlist:${id}`,
        accountId: this.accountId,
        name: String(p['name'] ?? 'Untitled'),
        description: (p['description'] as string) ?? null,
        ownerId: ((p['owner'] as Record<string, unknown> | undefined)?.['id'] as string) ?? null,
        isOwner: null, collaborative: Boolean(p['collaborative']),
        imageUrl: Array.isArray(p['images']) && (p['images'] as unknown[]).length
          ? String(((p['images'] as Record<string, unknown>[])[0] as Record<string, unknown>)['url'] ?? '') || null
          : null,
        snapshotId: snap,
        trackTotal: (p['tracks'] as Record<string, unknown> | undefined)?.['total'] as number ?? null,
        itemsAvailable: true,
        syncedAt: Date.now(), removedAt: null
      };
      if (!existing) {
        report.playlistsAdded += 1;
      } else if (existing.snapshotId !== snap || existing.name !== canon.name) {
        report.playlistsUpdated += 1;
      } else {
        localByUri.delete(existing.uri);
        continue;
      }
      localByUri.delete(existing?.uri ?? '');
      toPut.push(canon);
      // Fetch items for added/updated owned playlists (checkpoint per playlist).
      try {
        await this.syncPlaylistItems(canon.uri, id, count);
      } catch (e) {
        report.errors.push(`items ${canon.uri}: ${e instanceof Error ? e.message : 'failed'}`);
        canon.itemsAvailable = false;
      }
    }
    if (toPut.length) await db.putPlaylists(toPut);
    // Soft-delete removed (purge policy 30d handled by UI note).
    const removed = [...localByUri.values()];
    if (removed.length) {
      report.playlistsRemoved = removed.length;
      await db.putPlaylists(removed.map((p) => ({ ...p, removedAt: Date.now() })));
    }
  }

  private async syncPlaylistItems(playlistUri: string, playlistId: string, count: () => void): Promise<void> {
    const items: { playlistUri: string; position: number; trackUri: string; addedAt: string | null }[] = [];
    const tracks: Parameters<typeof db.putTracks>[0] = [];
    let url: string | null =
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50&offset=0`;
    let position = 0;
    while (url) {
      const r = await fetchWithRetry((u) => this.authedFetch(u), url, count);
      if (r.status === 403) {
        // Non-owned playlist: items unavailable (Dev Mode / permissions). Honest flag.
        await db.putPlaylists([{
          uri: playlistUri, accountId: this.accountId, name: 'Playlist', description: null,
          ownerId: null, isOwner: false, collaborative: false, imageUrl: null,
          snapshotId: null, trackTotal: null, itemsAvailable: false, syncedAt: Date.now(), removedAt: null
        }]);
        return;
      }
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const page = r.body as SpotifyPage<Record<string, unknown>>;
      for (const entry of page.items || []) {
        const item = (entry['item'] ?? entry['track']) as Record<string, unknown> | null;
        if (!item) {
          position += 1;
          continue;
        }
        const tid = String(item['id'] ?? '');
        if (!tid) {
          position += 1;
          continue;
        }
        const trackUri = `spotify:track:${tid}`;
        items.push({ playlistUri, position, trackUri, addedAt: (entry['added_at'] as string) ?? null });
        tracks.push({
          uri: trackUri, provider: 'spotify', name: String(item['name'] ?? 'Unknown'),
          albumUri: null, durationMs: Number(item['duration_ms'] ?? 0), explicit: Boolean(item['explicit']),
          artistsJson: JSON.stringify(item['artists'] ?? []),
          imageUrl: Array.isArray((item['album'] as Record<string, unknown> | undefined)?.['images'])
            ? String((((item['album'] as Record<string, unknown>)['images'] as Record<string, unknown>[])[0] as Record<string, unknown>)['url'] ?? '') || null
            : null,
          updatedAt: Date.now()
        });
        position += 1;
      }
      url = (page.next as string) || null;
    }
    if (tracks.length) await db.putTracks(tracks);
    await db.replacePlaylistItems(playlistUri, items);
  }

  private async syncLiked(report: SyncReport, count: () => void): Promise<void> {
    // Quick-check: first page + total compare.
    const first = await fetchWithRetry(
      (u) => this.authedFetch(u),
      'https://api.spotify.com/v1/me/tracks?limit=50&offset=0', count
    );
    if (first.status !== 200) {
      report.errors.push(`liked: HTTP ${first.status}`);
      return;
    }
    const page = first.body as SpotifyPage<Record<string, unknown>> & { total?: number };
    const remoteTotal = page.total ?? (page.items || []).length;
    const localCount = await db.getSavedTrackCount(this.accountId);
    const topKey = (page.items || []).slice(0, 50).map((e) => String((e['track'] as Record<string, unknown> | undefined)?.['id'] ?? e['id'] ?? '')).join(',');
    const lastTop = await db.kvGet(`likedTop:${this.accountId}`);
    if (lastTop === topKey && localCount === remoteTotal && remoteTotal > 0) {
      report.likedTotal = localCount;
      return; // NO CHANGE — 1 request.
    }
    // Full reconcile.
    const seen = new Set<string>();
    const saveRows: { accountId: string; trackUri: string; addedAt: string }[] = [];
    const tracks: Parameters<typeof db.putTracks>[0] = [];
    let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50&offset=0';
    let firstPage = true;
    while (url) {
      const r: { status: number; body: unknown } = firstPage
        ? { status: first.status, body: first.body }
        : await fetchWithRetry((u) => this.authedFetch(u), url, count);
      firstPage = false;
      if (r.status !== 200) {
        report.errors.push(`liked page: HTTP ${r.status}`);
        break;
      }
      const pg = r.body as SpotifyPage<Record<string, unknown>>;
      for (const entry of pg.items || []) {
        const t = (entry['track'] ?? entry) as Record<string, unknown>;
        const tid = String(t['id'] ?? '');
        if (!tid) continue;
        const uri = `spotify:track:${tid}`;
        seen.add(uri);
        saveRows.push({ accountId: this.accountId, trackUri: uri, addedAt: String(entry['added_at'] ?? '') });
        tracks.push({
          uri, provider: 'spotify', name: String(t['name'] ?? 'Unknown'),
          albumUri: null, durationMs: Number(t['duration_ms'] ?? 0), explicit: Boolean(t['explicit']),
          artistsJson: JSON.stringify(t['artists'] ?? []),
          imageUrl: Array.isArray((t['album'] as Record<string, unknown> | undefined)?.['images'])
            ? String((((t['album'] as Record<string, unknown>)['images'] as Record<string, unknown>[])[0] as Record<string, unknown>)['url'] ?? '') || null
            : null,
          updatedAt: Date.now()
        });
      }
      url = (pg.next as string) || null;
    }
    await db.clearSavedTracks(this.accountId);
    if (saveRows.length) await db.putSavedTracks(saveRows);
    if (tracks.length) await db.putTracks(tracks);
    await db.kvSet(`likedTop:${this.accountId}`, topKey);
    report.likedTotal = saveRows.length;
    report.likedAdded = Math.max(0, saveRows.length - localCount);
    report.likedRemoved = Math.max(0, localCount - saveRows.length);
  }
}
