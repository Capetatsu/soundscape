# 11 Offline Storage
## What can be offline
| Content | Offline? |
|---|---|
| Spotify metadata/playlists/liked (cache) | YES — browse/search cached library |
| Spotify audio | NO. Never. (No DRM bypass, no stream capture.) |
| Local files user imports | YES (OPFS / File System Access handles) |
| Own Subsonic/Jellyfin server tracks | YES via Download Manager |
| Open-licensed catalogs (if enabled) | YES where license allows |
## Storage
Metadata: IndexedDB (Dexie). Audio blobs: OPFS (`navigator.storage.getDirectory()`); fallback Cache Storage. Request `navigator.storage.persist()`; show `estimate()` usage; configurable cap; LRU eviction only for auto-cached items, never user-pinned downloads.
## Download manager
States: `queued → downloading(progress) → verifying → done | failed(retryable) | cancelled`. Concurrency 2, Range-resume, retry 3× backoff, checksum/size verify, pause/resume/cancel, survives reload (state persisted). Service Worker for background fetch where supported (Background Fetch API Chromium); else foreground-only with notice.
## Offline behavior
`navigator.onLine` + failed-fetch detection → offline mode: Spotify playback disabled with explanation; offline queue plays only downloaded/local items; UI badges show availability per track.
## Local files
Import via directory picker; parse tags (music-metadata WASM/JS): title, artist, album, track no., duration, embedded art, ReplayGain, USLT/SYLT lyrics. Dedupe by content hash. Rescan on demand.
