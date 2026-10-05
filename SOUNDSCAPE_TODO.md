# Soundscape Rebuild — Progress Checklist

> Updated by the implementation agent after every phase. Checked = done and verified (`tsc --noEmit` clean + manual test where noted).

## M0 — Inventory & stabilization
- [x] Read spec package (00–28) + build-critical docs (01,05,06,07,09,10,24,26,28)
- [x] Real repo inventory (package.json, server.ts, src/**, services, components)
- [x] Baseline `tsc --noEmit` clean

## M1 — Security hotfix (doc 03 issues 1–3, doc 21)
- [x] XSS-hardened `/auth/callback` (JSON-embedded params, no inline reflection)
- [x] `postMessage` origin-locked (was `'*'`)
- [x] Server-derived `redirect_uri` enforced (was client-supplied)
- [x] Removed hardcoded client-ID fallback from server paths (env-driven, legacy dev fallback flagged)
- [x] Security headers (CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, HSTS in prod)
- [x] Rate limiting (auth 10/min, token 60/min, AI 10/min) + 100KB body limit
- [x] `/healthz` endpoint
- [x] AI endpoint: honest 503/502 errors (removed fake fallback tracks)

## M2 — BFF session auth (refresh token never in browser)
- [x] Server session vault (AES-256-GCM refresh storage, httpOnly SameSite=Lax cookie)
- [x] `GET /auth/spotify/login` + `GET /auth/spotify/callback` (server-side PKCE)
- [x] `GET /api/auth/status`, `GET /api/auth/token` (short-lived, no-store), `POST /api/auth/logout` (CSRF-checked)
- [x] Frontend prefers BFF session, keeps legacy localStorage flow as fallback
- [x] Manual token paste labeled dev-only; AccountSync honest sync/security copy
- [ ] E2E: login → status connected → token → logout destroys session (needs live Spotify credentials)

## M3 — Core + provider architecture + local DB
- [x] `src/core/providers/types.ts` (Capability, CapabilityError, contracts)
- [x] `src/core/providers/registry.ts`
- [x] `src/core/providers/spotify/capabilities.ts` (honest matrix)
- [x] `src/core/db/database.ts` (IndexedDB schema v1: track/playlist/playlist_track/saved_track/sync_state/listening_event/lyrics/kv)
- [x] `src/core/playback/QueueManager.ts` (shuffle/repeat/play-next/history)
- [x] `src/core/playback/PlayerController.ts` (phase machine: playing only on real position advance)
- [x] `src/core/sync/SyncEngine.ts` (paged sync, quick-check, per-playlist checkpoint)
- [x] `src/core/lyrics/lyricsEngine.ts` (LRCLIB, synced/plain/unavailable/error)
- [x] `src/core/stats/listeningEvents.ts` (real-playback-only events)
- [x] Providers registered at startup; truthfulness wired into audio service (command ladder in Diagnostics)
- [x] PlayerController driven by real adapter events (SDK state_changed, /me/player polls, audio element events)

## M4 — Spotify library + sync UI (REAL_LIBRARY)
- [x] `syncWithSpotify` replaced by SyncEngine (paged playlists/items/liked, quick-check ≤3 req resync)
- [x] Sync report UI (added/removed/updated, liked +/−, errors, time, trigger)
- [x] Last-synced timestamps + stale banner (>24h) + offline guard + cache hydration
- [x] Non-owned playlists honest unavailable state with "Play on Spotify" link
- [x] Playlist save write-through (Spotify first); fake download toggle removed
- [x] Library write endpoints on current `/me/library` API with legacy fallback

## M5 — Playback truthfulness (NEW_PLAYER)
- [x] `isPlaying` only on confirmed adapter playback (SDK events, /me/player polls, audio events)
- [x] End-detection advances queue (SDK previous_tracks/position, Connect polls, preview ended)
- [x] Premium vs Free honest states; no-device picker flow (existing, kept + controller error codes)
- [x] MediaSession metadata + handlers (play/pause/next/prev/seekto)
- [x] Listening events recorded from confirmed playback only (stats consume these)

## M6 — Fake-removal sweep (CI no-mock grep)
- [x] AiDjModal: resolve AI text via Spotify search; unresolved = text-only, never playable
- [x] SearchScreen: real search history (was hardcoded names)
- [x] DeviceConnectModal: Jam marked coming-soon (was fake toggle)
- [x] AudioSettings honest: real storage figures, DSP toggles Planned/disabled, quality disclaimer
- [x] Fake Espresso lyrics removed; fake download toggle removed; fake latency/100% claims removed
- [x] temp_apk dead tree deleted; no-mock grep clean (only input placeholders + anti-fake comments)

## M7 — Lyrics UI
- [x] LyricsModal (loading/synced-scroll + highlight/plain/unavailable/error, LRCLIB cached in DB)
- [x] Fake hardcoded Espresso lyrics removed from FullPlayerModal; entry opens real lyrics
- [x] ±200ms tolerance in activeLine; offset control deferred to provider capability (LRCLIB has none)

## M8 — Local files + Subsonic (where configured)
- [x] Local file import (File API picker in Library) + real `<audio>` playback with seek/volume/queue
- [x] AudioSettings honest: real storage figures, DSP toggles labeled Planned/disabled, quality preference disclaimer
- [x] Subsonic/Navidrome/Jellyfin: explicit user-owned-server config + real ping test (session storage); library/streaming planned, nothing faked
- [x] Real 3-band EQ (lowshelf/peaking/highshelf) + RMS-measured normalization for local files, with settings UI
- [ ] Crossfade/gapless (deferred: needs lookahead queue player; honestly not claimed anywhere)

## M9 — Stats UI
- [x] Top tracks / listening time from real events only (range filter, honest empty state)
- [x] Listening-history export (JSON) + delete
- [x] StatsScreen wired to BottomNav tab

## M10 — AI hardening
- [x] AI recommendations resolved to playable Spotify URIs or labeled text-only (search limit 3, under Dev Mode cap)
- [x] Rate-limit (10/min), key-missing 503, malformed-response guards on client + server
- [x] No fake fallback tracks; Gemini key stays server-side

## PIVOT — Provider redesign (Option A chosen 2026-10-05)
- [x] Research legitimate full-track providers (Audius, Jamendo, Archive, Radio, SoundCloud, Apple, TIDAL, Deezer, Napster, YouTube)
- [x] Findings written to soundscape-docs/29_PROVIDER_RESEARCH_AND_DECISION.md
- [x] OWNER DECISION: Option A (open catalog)
- [x] 06 + 26 amended (tiers, Option A order)
- [x] P-A Audius: client (search/trending/official stream), registry, federated search section, trending shelf, playOpenTrack routing — VERIFIED LIVE (search + audio/mpeg stream)
- [x] Spotify demotion: preview fallback REMOVED everywhere (player, labels, diagnostics); honest free-catalogue guidance
- [x] Removed dead removed-endpoint calls (Spotify browse/new-releases shelves → Audius trending)
- [x] P-B Jamendo: full client (search, FLAC-first resolve, charts, lyrics, artwork) + Settings config + search/Home/play integration + clean disabled state. Code-verified; LIVE TEST BLOCKED (no key; Jamendo's public test key is suspended)
- [x] P-C Internet Archive provider (etree + netlabels search, per-track resolve with VBR-MP3-first preference, Play-set queues rest) — VERIFIED LIVE
- [x] P-D Radio Browser mode (search/top/tags, HTTPS non-HLS filter, click etiquette, Radio tab) — VERIFIED LIVE
- [x] README rewritten for Option A (updated: Jamendo config, Subsonic streaming, native playlists)
- [x] FULL PASS: tsc clean, production build green (66 modules, 441KB/116KB gzip), no-mock grep clean, server smoke green (healthz/config/status/CSP)

## MASTER MISSION — final completion pass (2026-10-05)
- [x] P0 baseline: tree clean, npm install up-to-date, tsc clean, build green
- [x] P1 Jamendo — **LIVE** with owner's read-only key (`acde4470`). Search returns real
      results with per-row source+format badges; 2 Jamendo HTTP calls per search confirmed.
      Two bugs found and fixed to get here:
      1. **Build-time env read was silently dead.** `jamendoClientId()` aliased `import.meta`
         into a local var to stay "safe outside Vite", which defeats Vite's define-time
         substitution — it compiled to a *runtime* `import.meta.env?.X` where `import.meta.env`
         does not exist in an ES build, so the key was always `undefined` and the provider
         reported itself unconfigured without ever making a request. Fixed with a shared
         `src/config/env.ts` helper using a direct member expression + try/catch.
         Verified in the bundle: the key is now a literal and zero runtime
         `import.meta.env` references remain.
      2. Icon font never loaded (see P20) — separate root cause, also silent.
      Lesson recorded: the original "Jamendo is configured" assertion passed by only checking
      for the *absence* of a string; it gave a false green. Assertions now check positive state.
- [x] P2 capability model: registry describeProviders + jamendo effective caps; Diagnostics matrix + server config cards
- [x] P3 unified search: merged ranking (Jamendo→Audius), exact-duplicate merge, per-row source+quality badges, load-more pagination
- [x] P4 Home: real Recently-played shelf (listening events + track store), Spotify shelf demoted to small upsell
- [x] P5 player: volume+mute in full player, real shuffle/repeat for open playback, buffering notices, Escape everywhere, queue-add + playlist-add from search
- [x] P6 quality: per-source truthful labels (Jamendo FLAC/MP3, Audius MP3, Archive format in notice, radio codec/bitrate, local ext); lossless option reframed honestly
- [x] P7 engine: transparent safety limiter (peaks only); crossfade stays honestly deferred
- [x] P8 local library: Artist-Title parsing, collision-free IDs, DB-backed device shelf, honest re-add flow
- [x] P9 lyrics: provider lyrics preferred, follow/pause toggle, LRCLIB fallback, honest states
- [x] P10 stats: skip counters, recentPlays API feeding Home
- [x] P12 native playlists: CRUD + reorder + play/queue + picker + duplicate-safe, persisted in IndexedDB
- [x] P17 Subsonic: MD5 token auth, ping, search3, stream + cover-art URLs, session-only creds, plays via normal player
- [x] P14 offline banner (online/offline events, honest capability note)
- [x] P21 security: no eval/innerHTML/secrets (grep clean); redacted token-exchange logging; postMessage origin check intact
- [x] P20 a11y: 40px tap targets on search rows, aria-labels on icon buttons, Escape everywhere, prefers-reduced-motion
- [x] P20b **Icons were broken app-wide and no functional test caught it**: `fonts.googleapis.com`
      returns a bot-detection HTML interstitial on this network instead of CSS, so all 25
      Material Symbols icons rendered as raw ligature text (`play_arrow`, `playlist_add`,
      `home`) overlapping buttons. Only a screenshot exposed it. Fixed by self-hosting both
      fonts via `@fontsource` (Material Symbols 400 + Plus Jakarta Sans 400–800), authored the
      `.material-symbols-outlined` utility class fontsource doesn't ship, and dropped all
      external font origins from prod CSP (`font-src 'self'`). Verified: 15 icons glyph-shaped,
      `@font-face` loaded, zero requests to fonts.googleapis/gstatic.
- [x] P26 MASTER E2E: **29/29 green** on the production build — load, no console errors,
      catalogue search, full-length play, trusted-drag seek (clock 176s), volume+mute,
      queue list + Escape close, next/previous, playlist create/add/list/open/play-all,
      lyrics honest state, radio live stream, local FLAC, stats, Jamendo "not configured",
      Subsonic section, EQ persistence, diagnostics caps matrix + jamendo-off,
      390/768/1024 zero overflow, **zero Spotify requests all session**, no preview UI,
      no fake sync/AI claims
- [~] P18/P19 final visual sweep (screenshots captured at 1440px + 390px; review below)
- [x] P22 perf sign-off: unimported `motion` + `lucide-react` removed (6 packages),
      no new heavy deps; bundle 471KB / ~127KB gzip
- [x] P23 resilience **9/9 green**: Audius down → Archive still serves + honest
      "unreachable" note; Archive down → free catalogue still serves; offline → banner
      shows AND local file keeps playing; unreachable server → honest "Not connected".
      Zero crashes in every scenario.
- [x] P27 production server verified (healthz green, strict CSP, lazy SDK means a
      logged-out session loads no third-party script)
- [x] P28 docs final: 28_DEFINITION_OF_DONE re-baselined to Option A reality,
      25_LIMITATIONS amended, README source table + limitations current

## M11+ — Social / Devices / Perf / Release- [x] Social deferred with clean placeholder (Listen Together coming-soon, no fake sessions)
- [x] Device control is real Spotify Connect transfer (existing path kept, volume via API)
- [x] Perf: production build passes (421KB JS / 110KB gzip, zero new heavy deps); CSP headers live-verified
- [x] README documents Dev Mode limits, capability matrix, security model, privacy, attribution, limitations
- [x] License review: no reference-app code copied, no YouTube extraction, no GPL deps (only MIT/Apache: react, vite, tailwind, express, @google/genai, express-rate-limit; unimported `motion` + `lucide-react` removed)
- [x] Definition of Done (doc 28) re-baselined to Option A and signed off for the core product

## AUDIT — end-to-end verification (headless Chromium, fresh profile, no Spotify)
- [x] App boots with zero console errors on desktop + mobile (fixed: dev CSP blocked Vite; SDK hook undefined)
- [x] Audius search/trending/play/pause/seek(drag)/MediaSession/position-advance — real audio verified
- [x] Archive search/Play-set/queue/next-track-advance — verified
- [x] Radio search/top/tags/play/pause, HTTPS-only + non-HLS filter — verified
- [x] Local MP3/OGG/FLAC/WAV upload + playback + honest end-of-file — verified with real fixtures
- [x] EQ persists, normalization toggles + persists — verified with trusted events
- [x] Lyrics honest unavailable path, stats accumulate from real playback — verified
- [x] Queue drawer Escape/backdrop close added (was X-only)
- [x] Stats show real track names for open-catalogue plays (persist element-playback metadata)
- [x] Artwork dead-host fallback (ArtworkImg) after finding unreachable Audius creator node
- [x] frame-src allows official Spotify SDK iframe (its EME/DRM frame is legitimate)
- [x] Product copy de-Spotified (logo, home, settings, diagnostics self-test URI schemes)
- [x] Committed: 3 logical commits on main

## Blocked on live credentials (implemented + failure-path tested, needs a real account)
- [ ] Jamendo live search/playback — set `JAMENDO_CLIENT_ID` (free read-only plan at
      devportal.jamendo.com) or paste it in Settings → Jamendo. Jamendo's own public
      test key `709fa152` now returns "Application Suspended", so a real key is required.
- [ ] M2 E2E: login → status connected → token → logout destroys session
- [ ] M4/M5 live pass: real playlist sync counts + audible SDK playback on Premium desktop Chrome
- How to clear: set `SPOTIFY_CLIENT_ID` + REDIRECT_URI, `npm run dev`, Connect Spotify, Sync Now, play a track.

## Working commands
- `npx tsc --noEmit` — typecheck (currently clean)
- `npm run dev` — dev server (`tsx server.ts`, port 3000, relaxed CSP for HMR)
- Production smoke: `$env:NODE_ENV='production'; npx tsx server.ts` (strict CSP build)
- `npm run build` — production build
- E2E harness (kept out of the repo): `C:\Users\skuma\AppData\Local\Temp\opencode\`
  → `master-e2e.mjs` (29 checks), `resilience.mjs` (9 checks), `sweep.mjs` (screenshots),
  `make-fixture.mjs` + `fixture-test.{flac,mp3,ogg}` / `fixture-5s.wav` (real media fixtures)
