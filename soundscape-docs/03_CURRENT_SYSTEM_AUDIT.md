# 03 Current System Audit (partial — see 00)
Repo: Capetatsu/soundscape, 3 commits, generated from google-gemini/aistudio-repository-template. Root: public/assets/aistudio, server/config, src, temp_apk, .env.example, bun.lock + package-lock.json (two lockfiles), index.html, metadata.json, server.ts, vite.config.ts.

## Read in full: server.ts (269 lines, Express + Vite middleware, port 3000 hardcoded)
| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | `/auth/callback` interpolates `code`,`error`,`state` query params raw into an inline `<script>` template string → reflected XSS | HIGH | Rewrite: never interpolate; send via JSON/`textContent`, or handle code server-side |
| 2 | `window.opener.postMessage(..., '*')` leaks auth code to any opener origin | HIGH | Use exact origin; better: server-side code exchange (BFF) |
| 3 | `/api/auth/token` & `/refresh` accept `redirect_uri` and `client_id` from the request body | MED | Ignore client values; use server config + allowlist |
| 4 | Hardcoded fallback Spotify client ID in 3 places | LOW (public ID) / process | Remove; fail loudly if env missing |
| 5 | `/api/ai/dj` returns hardcoded demo tracks on any error (and Gemini model id `gemini-3.8-flash` hardcoded) | HIGH (violates no-mock) | Return 503 with typed error; model from env |
| 6 | AI output is displayed as recommendations without catalog resolution | HIGH | Resolution pipeline (doc 13) |
| 7 | Refresh token handled by browser (proxy just forwards) | MED | BFF session (doc 09) |
| 8 | No rate limiting, validation, CORS/CSP/cookie hardening, logging | MED | doc 18/21 |
| 9 | Two lockfiles (bun + npm) | LOW | Pick one |
| 10 | `temp_apk/` committed | LOW | Remove or document |

## UNVERIFIED (must inspect in M0)
src/App.tsx (monolith?), src/types.ts, src/services/* (Spotify client, playback), src/config/*, src/data/* (suspected mock content), src/components/*, styling, build config, `.env.example`. Questions M0 must answer: How does current "playback" work (Web Playback SDK vs oscillator/tones)? Where do demo tracks/generated art live? Any localStorage tokens?

## Retain / Refactor / Rewrite / Remove / Replace (provisional)
- RETAIN: PKCE concept, Express+Vite dev server, visual identity (doc 20), Gemini-on-server pattern.
- REFACTOR: OAuth (to BFF), AI endpoint.
- REWRITE: playback layer, library/sync layer, state management.
- REMOVE: all mock/demo data & generated artwork from prod, fallback fake tracks, temp_apk.
- REPLACE: App.tsx monolith with routed screens + core/ modules.
