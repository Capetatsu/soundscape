# 23 Test Plan
Tooling: Vitest (unit/integration), MSW + a **fake Spotify server** (fixtures: 1,200 liked, 40 playlists incl. non-owned, duplicates, 429s, 401s), Playwright (E2E), fake-indexeddb, Lighthouse CI. Real-account smoke checklist run manually before release (Premium account, desktop Chrome).
Layers: UNIT · INTEGRATION · API · PLAYBACK · SYNC · UI · E2E · OFFLINE · ERROR-RECOVERY · PERFORMANCE.

| ID | Area | Case | Expected |
|---|---|---|---|
| OA-1 | Spotify OAuth | login redirect | URL has S256 challenge, state, exact redirect, scopes |
| OA-2 | OAuth | callback bad state | 400, no session |
| OA-3 | OAuth | callback with `<script>` in params | nothing reflected (XSS regression for doc 03 #1) |
| OA-4 | OAuth | user denies | friendly error, no session |
| OA-5 | Token | expiry <60 s → refresh | single refresh under concurrent calls; new refresh token persisted |
| OA-6 | Token | refresh `invalid_grant` | state REVOKED, Reconnect UI, cache readable |
| OA-7 | Account | disconnect | session gone, player stopped, queue cleared, cookie cleared |
| OA-8 | Account | reconnect after revoke | library intact, sync resumes |
| PI-1 | Playlist import | 40 playlists paged 50 | all stored with official URIs |
| PI-2 | Playlist import | non-owned playlist | `items_available=false`, UI explains, "Play on Spotify" works |
| PI-3 | Playlist import | duplicate track in playlist | two rows, positions preserved |
| PI-4 | Playlist import | `items` field absent | no crash |
| LS-1 | Liked import | 1,200 tracks | count 1,200, order by added_at |
| LS-2 | Liked | unlike remotely then sync | −1 in report, row removed |
| LS-3 | Liked | no change | ≤2 requests |
| SY-1 | Manual sync | click Sync Now | report +/~/− matches DB diff |
| SY-2 | Auto sync | interval 15 m (fake timers) | runs once, not concurrently with manual |
| SY-3 | Sync | snapshot unchanged | items not refetched |
| SY-4 | Sync | network drops mid-run | job `partial`, committed parts kept, retry completes, no duplicates |
| SY-5 | Sync | 429 Retry-After | waits, completes |
| SE-1 | Search | query "x" | ≤10/page, paginates via offset |
| SE-2 | Search | offline | local-only results + banner |
| PB-1 | Playback | play Spotify track | phase loading→playing only after position advances; Diagnostics ladder shows each rung |
| PB-2 | Pause | pause | phase paused; command accepted; position frozen |
| PB-3 | Resume | resume from same position (±300 ms) | ok |
| PB-4 | Seek | seek 30 s | position within ±500 ms |
| PB-5 | Next/Prev | next at queue end w/ repeat off | phase ended |
| PB-6 | Shuffle | toggle | order changes, current track kept, deterministic with seeded RNG |
| PB-7 | Repeat | one/all/off | correct transitions |
| PB-8 | Queue | play-next/add/reorder/remove | persisted across reload |
| PB-9 | Non-Premium | account_error | Spotify play disabled with explanation, never shows "Playing" |
| PB-10 | No active device (mobile) | 404 | device picker prompt |
| PB-11 | SDK absent/unsupported | features.playLocal=false | controls adapt |
| PB-12 | Local file | play FLAC/MP3/AAC/WAV | audible (Playwright audio-context check), normalization gain applied |
| UI-1 | Library navigation | tabs/routes/back-stack | state preserved, scroll restored |
| LY-1 | Lyrics | LRCLIB synced hit | active line within ±200 ms of position |
| LY-2 | Lyrics | provider fail → fallback → none | graceful "No lyrics" |
| LY-3 | Lyrics | offset ±1 s | persisted per track |
| DL-1 | Downloads (own server) | queue→done | file in OPFS, plays offline |
| DL-2 | Downloads | cancel / retry / resume after reload | states correct |
| DL-3 | Spotify track | download action | not offered |
| LF-1 | Local files | import folder 500 files | tags parsed, dedupe by hash |
| NL-1 | Network loss | go offline while playing local | continues; Spotify pauses with banner; resumes online |
| TE-1 | Token expiry mid-play | expire during playback | SDK re-fetches token; no audible stop; else pause + reconnect banner |
| PF-1 | Provider failure | Spotify 503 | retries, then typed error, UI usable from cache |
| AI-1 | AI | hallucinated track | unresolved shown non-playable; none fabricated |
| AI-2 | AI | Gemini down | "AI unavailable", no demo tracks |
| NM-1 | No-mock policy | prod build grep for fixtures/demo strings/`oscillator` playback | CI fails if found |
| PERF-1..n | Performance | targets of doc 22 | budgets pass in Lighthouse CI + synthetic 10k library |
Coverage gates: core/ ≥85% lines; sync & playback state machines 100% branch on transitions.
