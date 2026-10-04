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
| **Jamendo** (next) | Full-length tracks, up to **FLAC** | Free `client_id` from devportal.jamendo.com (owner supplies once) |
| **Internet Archive** | Full live concerts + netlabel releases (quality varies — live tapes, stated honestly) | None |
| **Live radio** | 30k+ community stations (live, unskippable, HTTPS streams) | None |
| **Your files** | FLAC/MP3/AAC/WAV/OGG from this device + 3-band EQ + loudness normalization | None |
| **Your server** | Subsonic/Navidrome/Jellyfin (connection test built in; browsing streams planned) | Your own server |
| **Spotify** (optional) | Library import, playlists, liked songs, artwork, metadata — **not playback** | Free Spotify account; Premium only if you want in-app Spotify audio on a real device |

There is deliberately **no major-label studio catalogue** in the free path: no
legitimate free provider offers one (see `soundscape-docs/29_PROVIDER_RESEARCH_AND_DECISION.md`).
30-second previews are not a playback path anywhere in this app.
Nothing here scrapes YouTube, extracts Spotify streams, or bypasses DRM.

## Spotify library setup (optional)

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add the exact Redirect URI: `http://127.0.0.1:3000/auth/callback`
   (production: `https://<your-domain>/auth/spotify/callback`).
3. Set `SPOTIFY_CLIENT_ID`, `REDIRECT_URI`, and (production) `SESSION_ENCRYPTION_KEY`.
4. Account → **Connect Spotify (recommended)**.

Dev Mode limits (platform restrictions, not bugs): ≤5 users, search ≤10 items,
playlist track lists only for playlists you own/collaborate on, several browse
endpoints removed (the app doesn't call them).

## AI DJ (optional)

Set `GEMINI_API_KEY` to enable it. Without a key the feature says "unavailable"
instead of faking. Suggestions are matched against real catalogues; unmatched
items are shown text-only and can never be played.

## Security model

- Recommended Spotify flow keeps the **refresh token on the server**
  (AES-256-GCM session vault, HttpOnly `SameSite=Lax` cookie); the browser holds
  only a short-lived access token in memory. Legacy/manual-token flow is labeled
  dev-only.
- SoundCloud-style server-held secrets pattern is reserved for future subscriber
  modules; no secret is ever bundled into client code.
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
- Live recordings vary in quality; the UI says so instead of hiding it.
- Radio is live-only (no skipping, no on-demand).
- Mobile background playback follows OS/browser media rules; the framework-free
  `src/core/` is ready for a future native shell.
- Listen Together: roadmap item, shown as coming soon.
- Jamendo activates when the owner adds a free `client_id`.
