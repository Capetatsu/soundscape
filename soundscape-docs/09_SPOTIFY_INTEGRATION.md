# 09 Spotify Integration
## Platform constraints (verified from Spotify's Feb-2026 migration guide + Feb-6 blog)
- Dev Mode: owner must have active Premium (app stops if it lapses); 5 users/app for new apps; Client IDs per developer 1 (raised to 25 in July 2026 per guide).
- Removed: batch GET /tracks|albums|artists…; browse/new-releases, categories; artist top-tracks; GET /users/{id}(/playlists); /markets.
- Search `limit` max 10 (default 5) → paginate with `offset`.
- Library write/follow/contains moved to `PUT|DELETE /me/library`, `GET /me/library/contains` (Spotify URIs).
- Playlist `/tracks`→`/items`; response field `tracks`→`items`, `item` replaces `track`; items only for playlists the user owns/collaborates on.
- Removed fields: track `popularity`,`available_markets`,`linked_from`; artist `followers`,`popularity`; `/me` `product`,`email`,`country`.
- Previously removed (Nov 2024, from secondary sources): recommendations, audio-features/analysis, related artists, featured playlists. Treat as unavailable; verify in Phase 2 spike.
- VERIFY in Phase 2 spike (not confirmed this session): `GET /me/tracks`, `GET /me/playlists`, `GET /me/player/*`, `PUT /me/player/play` still available in Dev Mode — check Spotify "endpoints still available" list; record results in `docs/spike-results.md`.

## OAuth (Authorization Code + PKCE, BFF variant)
1. `GET /auth/spotify/login`: server creates `state` (random 32B) + `code_verifier` (64–128 chars), stores in short-lived httpOnly cookie/session; redirects to `https://accounts.spotify.com/authorize?response_type=code&client_id&redirect_uri&scope&state&code_challenge_method=S256&code_challenge`.
2. User authorizes at Spotify (Google login handled entirely by Spotify; Soundscape never sees Google/Spotify cookies or passwords).
3. `GET /auth/spotify/callback?code&state`: verify `state`; server POSTs `grant_type=authorization_code` + verifier to `https://accounts.spotify.com/api/token`; stores `{access, refresh, expires_at, scope}` in server session store (encrypted at rest); sets httpOnly `Secure SameSite=Lax` session cookie; redirects to `/`. Callback page contains NO inline script and reflects no params.
4. Browser: `GET /api/auth/token` → `{access_token, expires_at}` (short-lived; kept in memory only).
5. Refresh: server refreshes when <60 s left; persists new `refresh_token` if Spotify rotates it. Concurrent refresh guarded by per-session mutex.
6. Disconnect: `POST /api/auth/logout` → delete server session, clear cookie, client wipes IndexedDB tables for that account (option: keep cache as "offline snapshot" off by default).
7. Revoked/expired: refresh returns `invalid_grant` → session state `REVOKED` → UI "Reconnect Spotify" (cache stays readable, sync/playback disabled).
## Redirect URIs
Register exact-match URIs: prod `https://<domain>/auth/spotify/callback`; dev `http://127.0.0.1:<port>/auth/spotify/callback` (Spotify no longer accepts `localhost`/insecure http—verify against "Migration: Insecure redirect URI" doc). Server derives redirect from `PUBLIC_URL` env; never from request body.
## Scopes (minimum)
`user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public streaming user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played user-top-read`
(Drop write scopes until write features ship; request incrementally.)
## Spotify API client rules
Single `SpotifyClient`: bearer injection, 401→refresh once→retry; 429→`Retry-After` honored with global queue; exponential backoff on 5xx (max 3); max concurrency 4; AbortController per navigation; response zod-validated with tolerant optional fields (many removed).
## Compliance
Use unmodified Spotify artwork, link to Spotify content, show attribution per Spotify Design Guidelines / Developer Policy (review before release). Do not use Spotify data to train ML models. Do not offer downloads/stream-ripping of Spotify content.
## Users
Allowlist in Spotify dashboard (≤5 emails). Document in README.
