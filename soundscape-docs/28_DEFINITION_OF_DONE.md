# 28 Definition of Done

> Re-baselined 2026-10-05 after the Option A provider pivot (doc 29). The original
> Spotify-first DoD is retained below under "Spotify track (optional integration)",
> clearly separated from the product that actually ships: an open-catalogue player
> that needs no Spotify account and no Premium subscription.

Legend: [x] verified in a real browser against the production build · [~] implemented,
live verification needs an external key/credential the owner supplies · [ ] not done.

## Core product — open catalogue (the default experience)
- [x] Search across Audius + Jamendo + Internet Archive with one ranked, deduped list
      and honest per-row source + quality badges; "Show more" paginates for real
- [x] Full-length playback of every free source (no preview path exists anywhere)
- [x] Queue: add / play-next / reorder / remove / clear, persists across reload
- [x] Next / previous / shuffle / repeat one / repeat off with real transitions
- [x] Seek verified by trusted drag in E2E (clock advanced to 176 s)
- [x] Volume + mute reachable from the full player
- [x] Queue drawer, full player, lyrics, AI DJ, device picker, diagnostics all close
      with Escape (single topmost-first handler in `App.tsx`)
- [x] Lyrics: provider-supplied lyrics preferred, LRCLIB fallback, follow + pause,
      honest "No lyrics" state when nothing exists
- [x] Stats derived only from real playback events (skips counted, recent plays real)
- [x] Radio: live community stations, HTTPS non-HLS streams, click etiquette stated
- [x] Local files: FLAC/MP3/AAC/WAV/OGG, real WebAudio EQ + normalization + safety
      limiter; `Artist - Title` parsing; DB-backed device shelf
- [x] Soundscape-native playlists: create / rename / delete / add / remove / reorder /
      play all / queue all, persisted in IndexedDB, fully independent of Spotify
- [x] Self-hosted server (Subsonic/Navidrome/Jellyfin/Gonic): MD5 token auth,
      connect-and-test, search, stream, cover art; credentials session-only
- [x] Capability matrix surfaced in Diagnostics so no source over-claims
- [x] Jamendo live search/playback with the owner's read-only `client_id` — real results with
      per-row quality badges; **FLAC-first verified against an actually served stream**
      (`HTTP 206`, `?format=flac`) with the player displaying "Playing from Jamendo (FLAC)."
      Measured first-play reliability 8/8 across fresh sessions.
- [x] Without a key the provider still disables itself cleanly and says so.
- [x] Upstream honesty about Jamendo: its free tier intermittently answers HTTP 200 with zero
      results (~50% of identical calls). Soundscape retries, reuses the playable URL from
      search instead of spending another request, and says so in the README.

## Honesty and compliance
- [x] No fabricated tracks, lyrics, stats, availability, sync claims, or AI fallback
- [x] No preview fallback in player, labels, or diagnostics
- [x] Quality labels state what each source really delivers (FLAC where provided,
      VBR MP3, transcoded MP3, live codec/bitrate)
- [x] Crossfade, bit-perfect output, Listen Together, native Android shell — stated as
      deferred in README and never claimed anywhere in the UI
- [x] Audio from Audius / Jamendo / Archive / Radio attributed to its source
- [x] Limitations published in README (`soundscape-docs/25_LIMITATIONS.md`)

## Quality
- [x] `tsc --noEmit` clean; production build green
- [x] Master E2E suite **30/30** green on the production build, including:
      zero Spotify API requests for the whole session, no horizontal overflow at
      390 / 768 / 1024 px, no console errors, all playback paths real
- [x] Resilience suite **9/9**: provider down → siblings still serve *and the outage is named
      per source*; offline → honest banner with local files still playing; unreachable server →
      honest connection failure. Zero crashes in every scenario.
- [x] Jamendo first-play reliability measured 8/8 across fresh sessions (not a single sample)
- [x] Icons self-hosted — a CDN-hosted icon font was silently rendering every icon as raw
      ligature text on networks where the font host is bot-gated; prod CSP is now `font-src 'self'`
- [x] No-mock policy upheld (no fixtures, demo data, or oscillator playback in prod)
- [x] 40 px tap targets on search rows, `aria-label`s on icon-only buttons,
      `prefers-reduced-motion` honoured

## Security
- [x] CSP environment-aware (strict in production, relaxed only for Vite HMR in dev)
- [x] Spotify SDK lazily injected, so a logged-out session pulls no third-party script
- [x] `postMessage` origin-locked; server-enforced `redirect_uri`
- [x] XSS regression fixed (no reflection of callback params)
- [x] Rate limits + 100 KB body cap; AES-GCM server-side session vault keeps the
      refresh token out of the browser; Subsonic credentials in `sessionStorage` only
- [x] HSTS applied only behind `x-forwarded-proto: https`
- [x] Token-exchange failures logged without dumping the response body

## Spotify track (optional integration — not required for the product)
- [x] OAuth via the BFF; no tokens in browser storage
- [~] Live OAuth round trip + audible Premium SDK playback — implemented and wired,
      needs the owner's real Spotify credentials to verify (documented in
      `SOUNDSCAPE_TODO.md`)
- [x] "Playing" is never displayed unless real audio position advances; Diagnostics
      shows the INITIALIZED → READY → COMMAND SENT → COMMAND ACCEPTED → PLAYING ladder
- [x] Non-Premium, no-device, and SDK-unsupported cases show honest states
- [x] Library, playlists, liked songs, and artwork import where the API allows;
      non-owned playlists explained honestly

## Not required, honestly deferred
- [ ] Crossfade / gapless (documented, not implemented)
- [ ] Bit-perfect or USB-exclusive output (web cannot promise it)
- [ ] Listen Together (roadmap)
- [ ] Native Android background playback (framework-free `src/core/` is ready for it)