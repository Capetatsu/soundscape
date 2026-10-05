// Minimal IndexedDB wrapper — implements schema 17_DATABASE_SCHEMA.md v1.
// Framework-free, no external deps. Same table names a Dexie migration would use.

export interface DbTrack {
  uri: string;
  provider: string;
  name: string;
  albumUri: string | null;
  durationMs: number;
  explicit: boolean;
  artistsJson: string;
  imageUrl: string | null;
  updatedAt: number;
}

export interface DbPlaylist {
  uri: string;
  accountId: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  isOwner: boolean | null;
  collaborative: boolean;
  imageUrl: string | null;
  snapshotId: string | null;
  trackTotal: number | null;
  itemsAvailable: boolean;
  syncedAt: number | null;
  removedAt: number | null;
}

export interface DbPlaylistTrack {
  playlistUri: string;
  position: number;
  trackUri: string;
  addedAt: string | null;
}

export interface DbSavedTrack {
  accountId: string;
  trackUri: string;
  addedAt: string;
}

export interface DbSyncState {
  accountId: string;
  collection: string;
  lastSyncedAt: number | null;
  lastFullAt: number | null;
  total: number | null;
}

export interface DbListeningEvent {
  id?: number;
  trackUri: string;
  startedAt: number;
  playedMs: number;
  durationMs: number;
  completed: boolean;
  contextUri: string | null;
  provider: string;
}

const DB_NAME = 'soundscape';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('track')) {
        const s = db.createObjectStore('track', { keyPath: 'uri' });
        s.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('playlist')) {
        db.createObjectStore('playlist', { keyPath: 'uri' });
      }
      if (!db.objectStoreNames.contains('playlist_track')) {
        const s = db.createObjectStore('playlist_track', { keyPath: ['playlistUri', 'position'] });
        s.createIndex('track', 'trackUri', { unique: false });
      }
      if (!db.objectStoreNames.contains('saved_track')) {
        const s = db.createObjectStore('saved_track', { keyPath: ['accountId', 'trackUri'] });
        s.createIndex('added', 'addedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('sync_state')) {
        db.createObjectStore('sync_state', { keyPath: ['accountId', 'collection'] });
      }
      if (!db.objectStoreNames.contains('listening_event')) {
        const s = db.createObjectStore('listening_event', { keyPath: 'id', autoIncrement: true });
        s.createIndex('time', 'startedAt', { unique: false });
        s.createIndex('track', 'trackUri', { unique: false });
      }
      if (!db.objectStoreNames.contains('lyrics')) {
        db.createObjectStore('lyrics', { keyPath: 'trackKey' });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => {
          resolve(req.result);
          db.close();
        };
        req.onerror = () => {
          reject(req.error);
          db.close();
        };
      })
  );
}

export const db = {
  async putTrack(t: DbTrack): Promise<void> {
    await tx('track', 'readwrite', (s) => s.put(t));
  },
  async putTracks(tracks: DbTrack[]): Promise<void> {
    const conn = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction('track', 'readwrite');
      const store = t.objectStore('track');
      for (const tr of tracks) store.put(tr);
      t.oncomplete = () => {
        resolve();
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
    });
  },
  async putPlaylists(playlists: DbPlaylist[]): Promise<void> {
    const conn = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction('playlist', 'readwrite');
      const store = t.objectStore('playlist');
      for (const p of playlists) store.put(p);
      t.oncomplete = () => {
        resolve();
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
    });
  },
  async getPlaylists(): Promise<DbPlaylist[]> {
    return tx('playlist', 'readonly', (s) => s.getAll());
  },
  async getTracksByUris(uris: string[]): Promise<DbTrack[]> {
    const conn = await openDb();
    const out: DbTrack[] = [];
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction('track', 'readonly');
      const store = t.objectStore('track');
      let i = 0;
      const next = () => {
        if (i >= uris.length) return;
        const req = store.get(uris[i++]);
        req.onsuccess = () => {
          if (req.result) out.push(req.result as DbTrack);
          next();
        };
        req.onerror = () => {
          reject(req.error);
        };
      };
      t.oncomplete = () => {
        resolve();
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
      next();
    });
    return out;
  },
  async getTracksByProvider(provider: string, limit = 100): Promise<DbTrack[]> {
    const conn = await openDb();
    return new Promise<DbTrack[]>((resolve, reject) => {
      const out: DbTrack[] = [];
      const t = conn.transaction('track', 'readonly');
      const cursorReq = t.objectStore('track').openCursor();
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c && out.length < limit) {
          const v = c.value as DbTrack;
          if (v.provider === provider) out.push(v);
          c.continue();
        }
      };
      t.oncomplete = () => {
        resolve(out);
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
    });
  },
  async getPlaylistTrackRows(playlistUri: string): Promise<DbPlaylistTrack[]> {
    const all = await tx<DbPlaylistTrack[]>('playlist_track', 'readonly', (s) => s.getAll());
    return (all as DbPlaylistTrack[])
      .filter((r) => r.playlistUri === playlistUri)
      .sort((a, b) => a.position - b.position);
  },
  async getSavedTracks(accountId: string): Promise<DbSavedTrack[]> {
    const all = (await tx<DbSavedTrack[]>('saved_track', 'readonly', (s) => s.getAll())) as DbSavedTrack[];
    return all
      .filter((r) => r.accountId === accountId)
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  },
  async replacePlaylistItems(playlistUri: string, items: DbPlaylistTrack[]): Promise<void> {
    const conn = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction('playlist_track', 'readwrite');
      const store = t.objectStore('playlist_track');
      const range = IDBKeyRange.bound([playlistUri, -Infinity], [playlistUri, Infinity]);
      const cursorReq = store.openCursor(range);
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c) {
          c.delete();
          c.continue();
        } else {
          for (const it of items) store.put(it);
        }
      };
      t.oncomplete = () => {
        resolve();
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
    });
  },
  async putSavedTracks(items: DbSavedTrack[]): Promise<void> {
    const conn = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction('saved_track', 'readwrite');
      const store = t.objectStore('saved_track');
      for (const it of items) store.put(it);
      t.oncomplete = () => {
        resolve();
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
    });
  },
  async clearSavedTracks(accountId: string): Promise<void> {
    const conn = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction('saved_track', 'readwrite');
      const store = t.objectStore('saved_track');
      const range = IDBKeyRange.bound([accountId, ''], [accountId, '\uffff']);
      const cursorReq = store.openCursor(range);
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c) {
          c.delete();
          c.continue();
        }
      };
      t.oncomplete = () => {
        resolve();
        conn.close();
      };
      t.onerror = () => {
        reject(t.error);
        conn.close();
      };
    });
  },
  async getSavedTrackCount(accountId: string): Promise<number> {
    const all = (await tx<DbSavedTrack[]>('saved_track', 'readonly', (s) => s.getAll())) as DbSavedTrack[];
    return all.filter((r) => r.accountId === accountId).length;
  },
  async putSyncState(s: DbSyncState): Promise<void> {
    await tx('sync_state', 'readwrite', (st) => st.put(s));
  },
  async getSyncState(accountId: string, collection: string): Promise<DbSyncState | null> {
    const res = await tx<DbSyncState | undefined>('sync_state', 'readonly', (st) =>
      st.get([accountId, collection])
    );
    return res ?? null;
  },
  async addListeningEvent(e: DbListeningEvent): Promise<void> {
    await tx('listening_event', 'readwrite', (s) => s.add(e as never));
  },
  async getListeningEvents(limit = 500): Promise<DbListeningEvent[]> {
    const all = await tx<DbListeningEvent[]>('listening_event', 'readonly', (s) => s.getAll());
    return (all as DbListeningEvent[]).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  },
  async kvGet(key: string): Promise<string | null> {
    const r = await tx<{ key: string; value: string } | undefined>('kv', 'readonly', (s) => s.get(key));
    return r ? r.value : null;
  },
  async kvSet(key: string, value: string): Promise<void> {
    await tx('kv', 'readwrite', (s) => s.put({ key, value }));
  },
  async putLyrics(trackKey: string, body: string, synced: boolean): Promise<void> {
    await tx('lyrics', 'readwrite', (s) =>
      s.put({ trackKey, body, synced, fetchedAt: Date.now() })
    );
  },
  async getLyrics(trackKey: string): Promise<{ trackKey: string; body: string; synced: boolean } | null> {
    const r = await tx<{ trackKey: string; body: string; synced: boolean } | undefined>(
      'lyrics', 'readonly', (s) => s.get(trackKey)
    );
    return r ?? null;
  }
};
