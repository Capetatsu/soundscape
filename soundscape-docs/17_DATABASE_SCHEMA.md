# 17 Database Schema
Client: IndexedDB via Dexie (v1). Same logical schema as SQLite for server/native (DDL below). Canonical ID: Spotify URI string (`spotify:track:<id>`), local files `local:<sha256>`, Subsonic `subsonic:<server>:<id>`.
```sql
CREATE TABLE provider_account(id TEXT PRIMARY KEY, provider TEXT NOT NULL, external_user_id TEXT, display_name TEXT, status TEXT CHECK(status IN('connected','revoked','disconnected')), connected_at INT, last_error TEXT);
CREATE TABLE artist(uri TEXT PRIMARY KEY, name TEXT NOT NULL, image_url TEXT, updated_at INT);
CREATE TABLE album(uri TEXT PRIMARY KEY, name TEXT NOT NULL, artist_uri TEXT REFERENCES artist(uri), release_date TEXT, image_url TEXT, total_tracks INT, updated_at INT);
CREATE TABLE track(uri TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL, album_uri TEXT, duration_ms INT, explicit INT, track_no INT, isrc TEXT, artists_json TEXT NOT NULL, image_url TEXT, local_path TEXT, updated_at INT);
CREATE INDEX track_name ON track(name); 
CREATE TABLE playlist(uri TEXT PRIMARY KEY, account_id TEXT, name TEXT, description TEXT, owner_id TEXT, is_owner INT, collaborative INT, image_url TEXT, snapshot_id TEXT, track_total INT, items_available INT, synced_at INT, removed_at INT);
CREATE TABLE playlist_track(playlist_uri TEXT, position INT, track_uri TEXT, added_at INT, PRIMARY KEY(playlist_uri,position));
CREATE INDEX pt_track ON playlist_track(track_uri);
CREATE TABLE saved_track(account_id TEXT, track_uri TEXT, added_at INT, PRIMARY KEY(account_id,track_uri));
CREATE INDEX st_added ON saved_track(account_id, added_at DESC);
CREATE TABLE sync_state(account_id TEXT, collection TEXT, last_synced_at INT, last_full_at INT, total INT, etag TEXT, PRIMARY KEY(account_id,collection));
CREATE TABLE sync_job(id TEXT PRIMARY KEY, trigger TEXT, started_at INT, ended_at INT, status TEXT, checkpoint_json TEXT, counters_json TEXT, errors_json TEXT);
CREATE TABLE queue_item(position INT PRIMARY KEY, track_uri TEXT, context_uri TEXT, source TEXT, added_by TEXT);
CREATE TABLE playback_state(id INT PRIMARY KEY CHECK(id=1), item_uri TEXT, position_ms INT, volume REAL, shuffle INT, repeat TEXT, device_id TEXT, updated_at INT);
CREATE TABLE lyrics(track_key TEXT, provider TEXT, synced INT, format TEXT, body TEXT, offset_ms INT DEFAULT 0, fetched_at INT, PRIMARY KEY(track_key,provider));
CREATE TABLE device(id TEXT PRIMARY KEY, provider TEXT, name TEXT, type TEXT, last_seen INT);
CREATE TABLE listening_event(id TEXT PRIMARY KEY, track_uri TEXT, started_at INT, played_ms INT, duration_ms INT, completed INT, context_uri TEXT, provider TEXT);
CREATE INDEX le_time ON listening_event(started_at); CREATE INDEX le_track ON listening_event(track_uri);
CREATE TABLE download(id TEXT PRIMARY KEY, track_uri TEXT, state TEXT, bytes_done INT, bytes_total INT, path TEXT, attempts INT, error TEXT, created_at INT);
CREATE TABLE local_file(hash TEXT PRIMARY KEY, handle_key TEXT, path TEXT, size INT, mtime INT, lufs REAL, true_peak REAL, track_uri TEXT);
CREATE TABLE recommendation(id TEXT PRIMARY KEY, source TEXT, prompt TEXT, resolved_json TEXT, unresolved_json TEXT, created_at INT);
CREATE TABLE settings(key TEXT PRIMARY KEY, value_json TEXT);
```
`User` table omitted client-side (single local user); server session store holds user→tokens.
## Caching & invalidation
Entity rows refreshed when `updated_at` older than 7 d or on sync touch. Images: browser HTTP cache + SW cache-first (artwork URLs from Spotify CDN unmodified).
## Migrations
Dexie `version(n).stores(...).upgrade(tx=>…)`; every migration has a test that opens a v(n−1) fixture DB. Never drop user tables (stats, downloads, settings) without export prompt.
## Offline-first
UI reads only from DB; network writes into DB; live queries re-render.
