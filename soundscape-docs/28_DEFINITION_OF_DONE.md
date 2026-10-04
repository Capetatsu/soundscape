# 28 Definition of Done
## Product (v1)
- [ ] Connect Spotify via official OAuth; no tokens in browser storage (inspect localStorage/IndexedDB/cookies in E2E)
- [ ] Real playlists + Liked Songs displayed; counts match Spotify
- [ ] Sync Now report shows accurate +/~/−; auto-sync interval configurable; last-sync time + status visible
- [ ] Spotify track plays audibly via SDK on Premium desktop Chrome; pause/resume/seek/next/prev/shuffle/repeat/queue work
- [ ] "Playing" is never displayed unless real audio position advances; Diagnostics shows INITIALIZED→READY→COMMAND SENT→COMMAND ACCEPTED→PLAYING/PAUSED/ERROR truthfully
- [ ] Non-Premium and no-device cases show honest states
- [ ] Offline: cached library browsable; Spotify playback disabled with explanation; local files play
- [ ] Local FLAC/MP3/AAC/WAV playback with EQ + normalization + crossfade
- [ ] Synced lyrics for ≥80% of a 50-track test set (LRCLIB-dependent)
## Quality
- [ ] doc 23 cases pass in CI; real-account smoke checklist signed
- [ ] doc 22 budgets pass
- [ ] CI no-mock grep passes (no fixtures/demo data/oscillator playback/generated album art in prod bundle)
- [ ] License check clean; no GPL deps
## Security
- [ ] doc 21 checklist complete; XSS/postMessage/redirect issues from doc 03 verified fixed by tests OA-3
## Compliance
- [ ] Spotify attribution + Developer Policy review done; Dev-Mode limits documented in README
## Honesty
- [ ] 25_LIMITATIONS shown in README; no UI claims beyond provider capability
