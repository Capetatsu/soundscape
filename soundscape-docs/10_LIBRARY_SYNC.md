# 10 Library Sync
## Entities synced
Profile (`GET /me`), Playlists (`GET /me/playlists`, 50/page), Playlist items (`GET /playlists/{id}/items`, owned/collab only), Liked songs (`GET /me/tracks`, 50/page, `added_at`). Albums/artists saved: later.
## Engine
`SyncEngine.run(trigger:'manual'|'auto'|'startup'|'focus')` creates a `SyncJob` (id, trigger, startedAt, status, checkpoint, counters, errors[]). One job at a time (mutex via `navigator.locks`).
### Playlists (incremental)
1. Page `/me/playlists` fully (metadata is cheap).
2. Diff vs local by `playlist.id`: new → ADD; id missing remotely → REMOVE (soft-delete `removed_at`, purge after 30 d); `snapshot_id` changed or metadata changed → UPDATE.
3. For ADD/UPDATE where `owner==me || collaborative`: fetch items (50/page, full pages), replace item rows in one IndexedDB transaction per playlist (all-or-nothing). Unchanged `snapshot_id` → skip items entirely (the incremental win).
4. Playlists not owned: store metadata, `items_available=false`; UI offers "Play on Spotify" using `context_uri` (never shows fake/empty track list without explanation).
### Liked songs
- Quick check: fetch page 1 + `total`. If `total==localCount` and top-50 `(track_id,added_at)` identical → NO CHANGE (1 request).
- Else full reconcile: stream all pages into a temp set; ADD = remote−local; REMOVE = local−remote (unliked elsewhere); keep order by `added_at`. Cost: ceil(N/50) requests (≈ 20 for 1000 tracks).
- Trigger full reconcile at least weekly.
### Details
Playlist/liked responses embed full track objects → no per-track GETs (batch endpoint is gone). Missing fields (`popularity`, etc.) tolerated. Local-only data (play counts, lyrics cache, tags) lives in separate tables keyed by track URI; sync never touches it.
### Duplicates
Track row PK = `spotify:track:<id>` (one row per track). `PlaylistTrack` PK = `(playlist_id, position)` because Spotify allows the same track twice in a playlist. Liked unique by track id.
### Conflicts
Remote is authoritative for synced entities. Local writes (add to playlist / like) are write-through: call Spotify first, on success update local; on failure show error, no optimistic fake. Next sync reconciles.
### Failure & recovery
- Checkpoint after each completed playlist/page-batch. Partial failure → job `partial`, successful parts committed, failed playlists listed with retry button.
- Retry: 3× backoff (1,3,9 s) per request; 429 honored; job-level auto-retry in 5 min (max 3).
- Offline: job not started; status "Offline — showing cached (last sync <time>)".
- Stale-data: `lastSyncedAt` per collection; banner when >24 h and online.
### Scheduling (web limits)
Manual "Sync Now"; on app start if >15 min; on tab focus if >15 min; interval while tab open, default 30 min (options 15 m/1 h/6 h/off). No true background sync on web (documented limitation).
## Sync report (shown after every run; stored in SyncJob)
```
Synced 14:32 · 11.4 s · trigger: manual
PLAYLISTS  +3 added  ~7 updated  -1 removed  (2 not owned: tracks unavailable)
LIKED SONGS  +12  -4   (total 1,284)
Errors: 0   [View details]
```
Counters come from actual DB diff, not request counts.
## Acceptance
Fixture library of 1,200 liked + 40 playlists: first sync correct; second sync ≤3 requests when unchanged; removing a liked track remotely shows −1; killed network mid-run → partial job, retry completes without duplicates.
