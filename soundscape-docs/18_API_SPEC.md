# 18 API Spec (Express BFF)
Spotify Web API is called directly by the browser with the short-lived access token (CORS-enabled). The BFF exposes only:
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /healthz | none | liveness |
| GET | /api/config | none | `{clientId, redirectUri, features:{ai:boolean}}` — no secrets, no fallback IDs |
| GET | /auth/spotify/login | none | start PKCE (sets state/verifier cookie, 302) |
| GET | /auth/spotify/callback | state cookie | code exchange, create session, 302 `/` |
| GET | /api/auth/status | session | `{state:'connected'|'revoked'|'none', scopes, expiresAt}` |
| GET | /api/auth/token | session | `{access_token, expires_at}` (Cache-Control: no-store) |
| POST | /api/auth/logout | session+CSRF | destroy session |
| POST | /api/ai/dj | session | AI suggestions (doc 13) |
| POST | /api/ai/translate-lyrics | session | optional |
| WS | /ws/rooms | session | Listen Together (Phase 11) |
## Conventions
JSON; errors `{ "error": { "code":"auth_expired", "message":"…", "retryable":false } }` with HTTP 400/401/403/429/502/503. Validation: zod on every body/query; unknown fields rejected. CSRF: SameSite=Lax cookie + `X-Requested-With`/custom header on POST. Rate limits (express-rate-limit): auth 10/min/IP, token 60/min/session, AI 10/min/session. Timeouts: upstream 10 s; retries only for idempotent GETs. Logging: structured, redact tokens/codes. CORS: same-origin only.
## Client-facing Spotify call set (browser→Spotify)
GET /me · GET /me/playlists · GET /playlists/{id}/items · GET /me/tracks · GET /search (limit≤10) · GET /tracks|albums|artists/{id} · GET /me/player(/devices) · PUT /me/player · PUT /me/player/play|pause|seek|volume · POST /me/player/next|previous · PUT|DELETE /me/library · GET /me/library/contains · GET /me/player/recently-played. (Availability to be confirmed in Phase-2 spike.)
