# 26 Implementation Roadmap
> AMENDED by 29_PROVIDER_RESEARCH_AND_DECISION.md (owner chose Option A, 2026-10-05).
> New phase order: P-A Audius → P-B Jamendo → P-C Archive → P-D Radio + Spotify demotion
> (remove preview paths) → P-E/F gated subscriber modules. P0–P3 below are DONE as built.

Each phase: Deliverables · Depends · Tests · Acceptance · Failure condition (stop & fix).

**P0 Audit & cleanup** — D: M0+M1 (doc 24), spike results, single lockfile, security fixes. Dep: none. T: OA-1..4, AI-2. A: no reflected params; no hardcoded IDs; spike doc lists which Spotify endpoints work. F: any Spotify core endpoint unavailable → re-plan before P2.
**P1 Provider abstraction** — D: core/ skeleton, provider interfaces, capability matrix tests, Dexie schema v1, typed errors, store. Dep: P0. T: caps-vs-matrix unit tests, migration tests. A: UI compiles against interfaces only; Spotify provider stub reports true caps. F: any provider claims unsupported cap.
**P2 Spotify account + library sync** — D: BFF auth, SpotifyClient, SyncEngine, Library/Liked/Playlists/Sync screens, Sync report. Dep: P1. T: OA-*, PI-*, LS-*, SY-*. A: real account shows real playlists+liked; Sync Now report accurate; unchanged resync ≤3 req. F: duplicate rows, wrong diff, tokens in storage.
**P3 Real playback** — D: PlayerController, QueueManager, Spotify SDK adapter, MediaSession, Diagnostics ladder, device picker, error handling. Dep: P2. T: PB-1..11, TE-1, PF-1. A: tap track → audio ≤1.5 s; pause/seek/next/prev/shuffle/repeat/queue verified on real Premium account; non-Premium shows honest state. F: "Playing" shown while silent.
**P4 Local playback** — D: local file import, tag parser, Web Audio graph, EQ, normalization, crossfade/gapless, own-server (Subsonic) provider. Dep: P3. T: PB-12, LF-1, audio-graph tests. A: FLAC/MP3/AAC/WAV play; −14 LUFS target within ±1 LU; crossfade verified. F: clipping, gap>50 ms in gapless FLAC test.
**P5 Lyrics** — D: lyric providers, parsers, cache, synced/karaoke UI. Dep: P3/P4. T: LY-*. A: LRCLIB synced within ±200 ms. F: unbounded provider calls / ToS-unreviewed provider enabled.
**P6 Search & discovery** — D: Search (paged), Home shelves from history, Discovery (history + optional ListenBrainz/Last.fm). Dep: P2. T: SE-*. A: no hardcoded content anywhere. F: demo strings found by NM-1.
**P7 Offline** — D: download manager, OPFS, storage UI, offline queue. Dep: P4. T: DL-*, NL-1. A: downloaded own-server tracks play in airplane mode. F: Spotify download option appears.
**P8 Statistics** — D: ListeningEvent capture, aggregates, Stats screen, export/delete, optional ListenBrainz. Dep: P3. T: threshold, aggregation, privacy tests. A: counts match fixtures; delete wipes all. F: events logged without real playback.
**P9 Customization** — D: themes (dark/AMOLED/light/dynamic), 2 player styles, density, animation, lyrics style. Dep: P3. T: visual regression, a11y. A: AA contrast all themes; reduced-motion honored. F: unusable combination reachable.
**P10 AI** — D: DJ, NL search, playlist generation, resolution pipeline. Dep: P6. T: AI-1/2. A: 100% of displayed-playable items resolved. F: any unresolved item playable.
**P11 Social** — D: WS rooms, Listen Together, sharing. Dep: P3. T: sync drift tests (±1.5 s), room lifecycle. A: 2 clients stay within 1.5 s over 10 min. F: audio relayed through server.
**P12 Devices / cross-device** — D: Connect transfer verification, remote-control mode, optional state sync. Dep: P3. T: transfer confirm/timeouts. A: transfer confirmed by re-read. F: UI shows device change before confirmation.
**P13 Performance & hardening** — D: budgets in CI, virtualization audit, CSP, pen-test checklist, error budget. Dep: all. T: PERF-*, security checklist. A: doc 22 targets met. F: budget regression.
**P14 Release prep** — D: docs, README (Dev-Mode limits, allowlist how-to), privacy policy, Spotify compliance review, real-account smoke checklist. Dep: P13. T: full E2E + manual smoke. A: doc 28 all checked. F: any DoD item unchecked.
(Optional later: native Android shell for Android Auto/background — separate roadmap.)
