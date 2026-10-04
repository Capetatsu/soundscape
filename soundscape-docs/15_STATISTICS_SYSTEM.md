# 15 Statistics (local-first)
## Capture
`ListeningEvent{id, track_uri, provider, startedAt, playedMs, durationMs, completed, source(context uri), device}` written when `playedMs ≥ min(30 s, 50% duration)` (same threshold style as scrobblers) — from real PlaybackState, never simulated.
## Aggregates (computed in IndexedDB via indexed range queries; cached daily)
Play counts; minutes listened; top tracks/artists/albums/genres (genre from MusicBrainz/Last.fm tags — Spotify removed popularity and artist genre availability is unverified); weekly/monthly/yearly; streaks (consecutive days ≥1 qualifying play); hour-of-day heatmap.
## Backfill
Spotify `recently-played` returns only the last 50 → poll on sync to capture. For deep history, user imports Spotify's own "Extended streaming history" export (manual, user-provided JSON) — parsed locally.
## Privacy controls
Stats on/off; export JSON/CSV; delete all/by range; optional submit to ListenBrainz/Last.fm (user token, off by default); no cloud/global stats in v1.
