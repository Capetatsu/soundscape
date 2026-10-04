# 21 Security
| Area | Requirement |
|---|---|
| OAuth | PKCE S256 + `state` verified; redirect URIs exact-match, derived from server env; no `postMessage('*')`; callback reflects nothing |
| Tokens | Refresh token server-side only (encrypted at rest, AES-256-GCM, key from env/KMS). Access token in browser memory only; never localStorage/IndexedDB/URL/logs |
| Session | httpOnly, Secure, SameSite=Lax cookie; 7-day idle / 30-day absolute; rotate on login; CSRF header on POST |
| Secrets | `.env` only; `.env.example` has placeholders; remove hardcoded client-ID fallbacks; Gemini key server-side only; secret scanning in CI |
| Headers | CSP (`default-src 'self'; script-src 'self' https://sdk.scdn.co; img-src 'self' https://i.scdn.co data: blob:; connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://lrclib.net`), HSTS, X-Content-Type-Options, Referrer-Policy strict-origin-when-cross-origin, frame-ancestors 'none' |
| API | zod validation, rate limiting, request size limit 100 KB, generic error messages, redacted logs |
| Local data | IndexedDB holds metadata only (no tokens). Optional passphrase-encrypted export. Local file handles are origin-private |
| Privacy | Stats local by default; AI context opt-in & minimized; no third-party analytics; crash reports opt-in, scrubbed |
| Logout cleanup | Server session destroyed; client clears in-memory token, stops player, clears queue persisted for that account, optional wipe of library cache; SDK `disconnect()` |
| Supply chain | Single lockfile; `npm audit`/Dependabot; pin SDK script via official URL only |
| Known current issues | See doc 03 findings 1–3 (XSS, postMessage, body-supplied redirect_uri) — fix in M1 before any feature work |
