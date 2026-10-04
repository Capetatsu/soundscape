# 04 Feature Parity Matrix
Source: READMEs only (claims). Soundscape column = UNVERIFIED until M0 (doc 03), except where server.ts shows it.
Legend: YES / PARTIAL / NO / DIFF (different approach) / N/A

| Feature | Soundscape (now) | Spotube | SpatialFlow | VIVI | Echo | ArchiveTune | AirBeats |
|---|---|---|---|---|---|---|---|
| Spotify account OAuth | PARTIAL (PKCE via proxy) | DIFF (plugins) | NO | PARTIAL | PARTIAL (import) | PARTIAL (import) | PARTIAL |
| Spotify playlist import/sync | UNVERIFIED | DIFF | NO | UNVERIFIED | YES (Fast Sync) | YES (import) | UNVERIFIED |
| Spotify audio playback | UNVERIFIED | NO | NO | NO | NO | NO | NO |
| Provider abstraction | NO | YES (plugins) | PARTIAL | YES (modules) | YES (modules) | YES | YES |
| Local files | UNVERIFIED | YES | YES | NO | YES | YES | YES |
| Offline downloads | NO | YES | N/A | YES | YES | YES | YES |
| Synced lyrics | UNVERIFIED | YES (LRCLIB) | NO (planned) | YES | YES | YES | YES |
| Word-by-word lyrics | NO | NO | NO | YES | YES | YES | PARTIAL |
| Lyrics translation | NO | NO | NO | NO | YES | YES | NO |
| EQ | NO | NO | YES | YES | UNVERIFIED | YES | UNVERIFIED |
| Crossfade | NO | NO | YES | UNVERIFIED | YES | YES | YES |
| Gapless | NO | UNVERIFIED | YES | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Loudness normalization | NO | NO | YES (LUFS) | UNVERIFIED | UNVERIFIED | YES (R128) | UNVERIFIED |
| Stats | NO | PARTIAL (scrobble) | NO | NO | NO | YES | YES (+global) |
| Scrobbling | NO | YES | NO | YES | NO | YES | NO |
| Listen Together | NO | NO | NO | NO | YES | NO | YES |
| AI features | PARTIAL (DJ, fake fallback) | NO | NO | NO | PARTIAL (on-device) | PARTIAL (translation) | PARTIAL |
| Android Auto | NO | NO | NO (planned) | YES | UNVERIFIED | UNVERIFIED | YES |
| Desktop | Web | YES | NO | NO | NO | NO | YES (separate repo) |
| Dynamic artwork color | UNVERIFIED | YES (palette_generator) | YES | YES | YES | YES | YES |
| Device discovery | NO | YES (bonsoir) | NO | NO | NO | NO | PARTIAL (airconnect) |

## Best patterns (by feature)
- Provider abstraction — architecture: Spotube plugins; UX: capability-gated controls (ours).
- Playlist sync — UX: Echo Fast Sync; architecture: snapshot_id diff (doc 10).
- Lyrics — architecture: LRCLIB + embedded tags + provider fallback chain; UX: ArchiveTune/Echo word-level views.
- Loudness — SpatialFlow LUFS target config; ArchiveTune R128.
- Stats — ArchiveTune local-first; reject AirBeats global leaderboard.
- Listen Together — room + host-authoritative position (Echo/AirBeats).
- Downloads — Echo/VIVI download manager; storage manager.
