# 19 UI/UX Spec
Global rules: every list screen has Loading (skeleton) / Empty (explanatory + action) / Error (retry + Diagnostics link) / Offline (cached data + banner) states. Mini-player persists on all routes except Now Playing. Virtualized lists >200 rows. Back-stack routing (React Router). Sticky sync-status chip in header.

| Screen | Purpose | Data source | Key components | Actions / Nav | Empty / Error / Offline |
|---|---|---|---|---|---|
| Onboarding | Explain + choose sources | static | 3-step pager | Connect Spotify / Add local music / Skip | n/a |
| Connect account | Spotify OAuth | /auth status | Connect btn, scope list, Premium note | Connect → Spotify → Home | Error: denied/revoked → retry; Offline: disabled |
| Home | Personal start page | DB (recent, recently added, stats), Spotify recently-played | Shelves: Recently played, Recently added, Your playlists, Resume | tap→play/open | Empty: "Sync to fill"; no hardcoded "Top Hits" |
| Search | Find tracks/albums/artists/playlists | Spotify /search (10/page) + local FTS | Search box, type tabs, paged results | play, queue, open | Empty hint; Error retry; Offline: local-only search |
| Library | Hub | DB | Tabs: Playlists, Liked, Albums, Artists, Downloads, Local | open | Empty→Sync Now |
| Liked Songs | Saved tracks | saved_track | Virtual list, sort (added/title/artist), filter, search-in | play all, shuffle, queue, add-to-playlist, unlike | Empty; Offline: cached |
| Playlists | List | playlist | grid/list, owner badge, "tracks unavailable" badge | open, create | Empty: connect/sync |
| Playlist detail | Tracks | playlist_track or context play | header, track rows, sync time | play, shuffle, add queue, remove (owned) | items unavailable → "Play on Spotify" button |
| Album detail | Tracks | Spotify /albums/{id} | art, tracks | play, queue, save | Error retry |
| Artist detail | Albums, bio-lite | Spotify /artists/{id}, albums (no top-tracks) | header, discography | open album | Top tracks NOT shown (API removed) |
| Track detail | Info | track row | meta, lyrics preview, playlists containing | play, like, add | — |
| Now Playing | Full player | PlaybackState | artwork, seek, controls, device chip, lyrics toggle, queue | all controls | Error banner from ErrorManager |
| Mini-player | Persistent controls | PlaybackState | art, title, play/pause, progress | expand | hidden when idle |
| Queue | Manage queue | queue_item | drag reorder, play-next, clear | jump, remove | Empty: "Nothing queued" |
| Lyrics | Synced lyrics | lyrics | karaoke view, offset control | tap line→seek (local only) | None found: "No lyrics" + provider list |
| Discovery | Non-Spotify-browse discovery | user history, ListenBrainz/Last.fm (optional), AI | Mood chips, "Because you played…", AI DJ entry | play | Empty until history exists; no fake charts |
| Downloads | Offline manager | download | list, progress, storage bar | pause/cancel/retry/delete | Empty explains Spotify not downloadable |
| Local music | Local files | local_file | folder add, rescan, tags | play, edit offset | Empty: Add folder |
| Statistics | Insights | listening_event | period tabs, top lists, streaks, heatmap | export/delete | Empty: "Listen for a bit"; privacy toggle |
| AI | DJ/chat | /api/ai + resolution | prompt box, resolved cards | play, save playlist | AI unavailable state |
| Social | Rooms | WS | create/join room, members | invite | feature-flagged off by default |
| Devices | Connect picker | /me/player/devices | list, active mark | transfer | Empty: "Open Spotify on a device" |
| Settings | Config | settings | sections: Account, Sync, Playback, Audio, Lyrics, Appearance, Privacy, Storage | — | — |
| Sync | History + Sync Now | sync_job | report card (doc 10 format), job list, errors | Sync Now, retry failed | Offline disables Sync Now |
| Diagnostics | Truth panel | diagnostics service | ladder per subsystem (Init→Ready→Cmd sent→Accepted→Playing/Paused/Error), tokens expiry (not value), API status, queue, network, cache | copy report | — |
