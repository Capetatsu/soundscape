# Soundscape — a real music player (rebuild v2, Option A)

Search → play **complete songs** in high quality, no subscription required.
Playback comes from legitimate open catalogues, your own files/server, and live
radio. Spotify is an *optional* library/metadata integration — never the player.

## Quick start

```bash
npm install
npm run dev      # http://127.0.0.1:3000
npm run build    # production bundle -> dist/
npm start        # serve production bundle
```

No account, no API keys needed for the default experience: open Search or Home and press play.

## What plays what (capability honesty)

| Source | What you get | Requirements |
|---|---|---|
| **Audius** (default) | Full-length tracks, trending, search | None — open catalogue, no login |
| **Jamendo** | Full-length tracks, up to **FLAC** (FLAC-first optional) | Free `client_id` from devportal.jamendo.com — Settings → Jamendo free catalogue, or `VITE_JAMENDO_CLIENT_ID`. Without it the provider stays off, honestly. |
| **Internet Archive** | Full live concerts + netlabel releases (quality varies — live tapes, stated honestly) | None |
| **Live radio** | 30k+ community stations (live, unskippable, HTTPS streams) | None |
| **Your files** | FLAC/MP3/AAC/WAV/OGG from this device + 3-band EQ + loudness normalization | None |
| **Your server** | Subsonic/Navidrome/Jellyfin/Gonic search + streaming + cover art | Your own server (Settings → Your music server, session-only credentials) |
| **Your playlists** | Create/rename/delete/add/remove/reorder/play/queue, stored on device | None |
| **Spotify** (optional) | Library import, playlists, liked songs, artwork, metadata — **not playback** | Free Spotify account; Premium only if you want in-app Spotify audio on a real device |

There is deliberately **no major-label studio catalogue** in the free path: no
legitimate free provider offers one (see `soundscape-docs/29_PROVIDER_RESEARCH_AND_DECISION.md`).
30-second previews are not a playback path anywhere in this app.
Nothing here scrapes YouTube, extracts Spotify streams, or bypasses DRM.

## Spotify library setup (optional)

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add **exactly** this Redirect URI:
   `http://127.0.0.1:3000/auth/spotify/callback`
   (production: `https://<your-domain>/auth/spotify/callback`).
   Spotify compares redirect URIs literally — a trailing slash, `localhost` vs `127.0.0.1`,
   or the old `/auth/callback` path will all fail with
   `redirect_uri: Not matching configuration`.
3. Set `SPOTIFY_CLIENT_ID`, `REDIRECT_URI`, and (production) `SESSION_ENCRYPTION_KEY`.
4. Account → **Connect Spotify (recommended)**.

### How the connection works

Spotify sign-in is a **backend-for-frontend (BFF)** flow, and it is the only one:

```
Connect button
  -> GET /auth/spotify/login        server generates state + PKCE verifier, redirects
  -> accounts.spotify.com/authorize user approves
  -> GET /auth/spotify/callback     server validates state, exchanges the code itself,
                                     stores the refresh token encrypted, sets an HttpOnly
                                     session cookie, redirects to /?auth_success=1
  -> GET /api/auth/status           the client confirms the session and shows Connected
```

The browser never holds a refresh token and never performs a code exchange. The only
credential it receives is a short-lived access token, kept in memory for the tab.

Failure is always explicit and always returns you to the app — a cancelled or denied
authorization, an expired or unverifiable `state`, or a rejected code produces a specific
message instead of an endless spinner:

| `?auth_error=` | Meaning |
|---|---|
| `access_denied` | You cancelled or denied the request |
| `invalid_state` | The sign-in could not be verified; start again |
| `expired` | The sign-in took too long; start again |
| `missing_params` | Spotify returned an incomplete response |
| `exchange_failed` | Spotify rejected the code — usually a redirect URI mismatch |
| `server_error` | Soundscape could not complete the exchange |

`/auth/callback` is retired: it forwards to `/auth/spotify/login` so an old bookmark lands
somewhere honest. The old popup + `window.opener.postMessage` handshake was removed — with
the exchange on the server it could never complete, which left the Connect button spinning.

### What Spotify does and does not do here

- **Does:** full catalogue search (artists, albums, tracks, playlists), artist pages with
  real discographies, album pages with real track lists, playlist pages, library import,
  and playback commands sent to your own Spotify devices.
- **Does not:** stream Spotify audio itself unless you have a Premium account and an active
  device. If playback is unavailable, the app says so plainly — it never substitutes an
  unrelated Audius/Jamendo/Archive track for the track you asked for.
- **When disconnected:** search still works across the open catalogues, each row labelled
  with its real source. Soundscape never fabricates Spotify artists, albums, or playlists,
  and prompts you to connect instead.

### Known Spotify limitations

These are platform rules, not defects:

- **The app owner must have active Spotify Premium.** If the Spotify account that owns the app
  in the Developer Dashboard is not Premium, Spotify answers *every* Web API request with
  `403 Forbidden` and an empty body — sign-in appears to succeed and then nothing syncs.
  After any subscription change, Spotify can take **a few hours** before requests are allowed
  again.
- **Premium is required for in-app audio.** Spotify Connect/Web Playback needs Premium plus an
  active device.
- **Development Mode:** apps only serve accounts added under **User Management**.
- **Dev Mode ceilings:** ≤5 users, search ≤10 items per page, and playlist track lists only
  for playlists you own or collaborate on.

If sign-in succeeds but the library will not sync, press **Diagnose connection** on the
Account & Sync screen. It asks the server to probe Spotify with the server-held token and
prints Spotify's own explanation, so a platform restriction is never mistaken for an app bug.

## AI DJ (optional)

Set `GEMINI_API_KEY` to enable it. Without a key the feature says "unavailable"
instead of faking. Suggestions are matched against real catalogues; unmatched
items are shown text-only and can never be played.

## Security model

- Spotify sign-in uses a single BFF path. The **refresh token stays on the server**
  (AES-256-GCM session vault, HttpOnly `SameSite=Lax` cookie); the browser holds only a
  short-lived access token in memory and never writes a token to storage. PKCE, `state`
  validation, and the code exchange all happen server-side; the client secret is never sent
  to the browser. The manual-token flow is labeled dev-only.
- The Spotify Web Playback SDK script is injected **lazily**, only once a Spotify
  session exists — a logged-out Soundscape session loads no third-party script at all.
- Your Subsonic/Navidrome/Jellyfin credentials stay in `sessionStorage` for the tab
  only, and authenticate with the standard salted-MD5 token scheme, never a raw password.
- Jamendo uses a read-only `client_id`, which Jamendo's API design publishes to clients.
- No secret is ever bundled into client code.
- Secrets live in `.env` (never committed). Rate limits: auth 10/min, token
  60/min, AI 10/min. JSON bodies capped at 100 KB. CSP enforced.

## Privacy

- Library cache, lyrics cache, and listening stats live in your browser's IndexedDB.
- Listening history export/delete is in Stats. No third-party analytics.
- AI DJ sends only your prompt + current track + a small library sample, and only
  when you ask.

## Attribution

- Audius / Jamendo / Internet Archive / Radio Browser content belongs to its
  artists and uploaders — shown with source labels and links back.
- Spotify metadata/artwork shown unmodified with links back.
- Lyrics via [LRCLIB](https://lrclib.net).
- Built with React + Vite + Tailwind + Express. No reference-app code copied.

## Known limitations

- Open catalogues are independent music: you won't find major-label studio albums there.
- Jamendo activates with a free read-only `client_id` (`VITE_JAMENDO_CLIENT_ID`, or paste
  it in Settings). Without one the provider stays off and says so. Jamendo's own public
  demo key is suspended by Jamendo, so it does not work as a default.
- Jamendo's free tier intermittently answers an identical query with HTTP 200 and zero
  results (measured: roughly half of calls). Soundscape retries up to 4 attempts before
  concluding a query has no matches, which recovers nearly all of them. Because the search
  response already carries a playable URL, a Jamendo track found by searching starts without
  any extra request. Only a cold track id — and the FLAC upgrade when "FLAC first" is enabled —
  costs an additional resolve request, which is where the latency shows up.
- Live recordings vary in quality; the UI says so instead of hiding it.
- Radio is live-only (no skipping, no on-demand).
- Device-file audio doesn't survive a page reload (browser blob URLs) — metadata does; re-adding a file restores it.
- Mobile background playback follows OS/browser media rules; the framework-free
  `src/core/` is ready for a future native shell.
- Crossfade, bit-perfect passthrough: honestly deferred, never claimed.
- Listen Together: roadmap item, shown as coming soon.
