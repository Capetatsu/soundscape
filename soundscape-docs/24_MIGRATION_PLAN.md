# 24 Migration Plan (incremental; no big-bang rewrite)
Why not "rewrite everything": Express/Vite shell, PKCE concept, Gemini server pattern and visual identity are reusable; the risk is concentrated in auth, playback and data layers, which are replaced module-by-module behind feature flags so the app stays runnable at each stage. File names below beyond server.ts/server/config are from the repo listing; contents unverified → M0 confirms.
Rollback for every stage: git tag `pre-Mx`, feature flag off, revert PR.

| Stage | Goal | Files/modules affected | New | Deprecated | Deps | Risks | Tests | Rollback |
|---|---|---|---|---|---|---|---|---|
| M0 Inventory | Read everything, amend doc 03, spike Spotify endpoints | read-only | `docs/spike-results.md`, inventory list of mocks | — | Spotify dev app (Premium owner) | endpoint availability differs | manual spike script | none needed |
| M1 Security hotfix | Fix XSS/postMessage/redirect trust, remove hardcoded IDs, remove AI fake fallback | server.ts, server/config/redirectUri | zod, express-rate-limit, helmet | inline callback script | none | breaking login if URIs mismatch | OA-1..4, AI-2 | tag, revert |
| M2 BFF auth | Server-held refresh token + `/api/auth/*` | server.ts → `server/auth/*`, src/services (auth) | session store (sqlite/file), crypto | `/api/auth/token`(proxy), `/refresh` | M1 | session store ops | OA-5..8 | flag `BFF_AUTH` off → old PKCE proxy |
| M3 core + DB | Introduce `src/core/`, Dexie schema, provider interfaces | src/types.ts, src/config/* | core/providers, db | duplicated types | M2 | type churn | schema/migration tests | additive; unused if reverted |
| M4 Spotify library + sync | Real playlists/liked → DB → UI; Sync Now/auto | src/services/* (spotify client), src/App.tsx (screens split) | SpotifyClient, SyncEngine, Library/Liked/Playlist/Sync screens | any mock library data in src/data/* | M3 | Dev-Mode endpoint limits | PI-*, LS-*, SY-* | flag `REAL_LIBRARY` |
| M5 Playback | PlayerController + Spotify SDK adapter + Diagnostics | playback code in src/services/* / App.tsx | core/playback/*, Diagnostics screen | oscillator/tone playback, "fake playing" | M2, M4 | SDK/browser quirks | PB-1..11, TE-1 | flag `NEW_PLAYER` |
| M6 Remove mocks | Delete src/data demo content, generated art, temp_apk; add CI no-mock grep | src/data/*, public/assets (generated art), temp_apk | NM-1 CI step | all mock data | M4,M5 | missing empty states | NM-1, UI-* | revert PR |
| M7+ | Local playback, lyrics, search/discovery, offline, stats, customization, AI, social, devices → roadmap doc 26 | | | | | | | per phase |
Order is strict: M1 before anything touching features; M5 only after M4 gives real tracks.
