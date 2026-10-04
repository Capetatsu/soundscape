# 29 — Provider Research & Playback Redesign Decision

Date: 2026-10-05. Status: RESEARCH COMPLETE, DECISION REQUIRED — do not implement until the owner picks a direction.

## 1. The headline (stated plainly, as required)

**There is no legitimate free provider that offers the major-label catalog at high
quality for third-party playback.** Every service with the full commercial catalog
(Spotify, Apple Music, TIDAL, Deezer) puts full-length playback behind the *end
user's paid subscription* and its own official player/SDK. Free + legal +
full-length exists only for independent/open catalogs, radio, and the user's own
files/server. Anyone promising "all of Spotify's catalog, free, in our own player"
is describing scraping or DRM circumvention — both rejected.

## 2. Evaluation results (verified Oct 2026 via official docs)

### Legitimate full-length sources — no payment required

| Provider | Full tracks? | Catalog | Quality | Dev access | Auth | Web | Android | Lyrics/artwork |
|---|---|---|---|---|---|---|---|---|
| **Audius** | YES — `GET /tracks/{id}/stream` (MP3, Range support) | Indie/open, large; NO major labels | Transcoded MP3 (~320k) | Free API key (safe in client), 500k req/mo, `@audius/sdk`, REST | Optional OAuth PKCE ("Login with Audius": favorites, playlists) | YES (SDK) | YES (REST) | Artwork yes; lyrics no (keep LRCLIB) |
| **Jamendo** | YES — `audio` stream URL + `/tracks/file` redirect; formats mp31/mp32/ogg/**flac** | ~500k indie tracks; NO majors | Up to **FLAC** (best free quality found) | Free `client_id` from dev portal; read-only plan default; 35k req/mo non-commercial | Optional OAuth2 (favorites, playlists) | YES | YES | Lyrics includable (`include=lyrics`), artwork yes |
| **Internet Archive** | YES — per-file HTTP (`.../download/<id>/<file>`) | Live concerts (250k+ recordings), netlabels, radio programs; NO studio majors | Varies; **FLAC** where uploaded | No key; advancedsearch API | None needed | YES | YES | Metadata only |
| **Radio Browser** | YES — live station streams (`url_resolved`) | 30k+ stations (radio, NOT on-demand) | Varies (MP3/AAC) | No key; public-domain data; descriptive User-Agent required | None | YES | YES | Station metadata only |
| Local files | YES | User's own | Source quality (incl. FLAC) | n/a | n/a | YES (already built) | n/a | Tags/.lrc |
| Subsonic/Navidrome/Jellyfin | YES | User's own server | Source quality (incl. FLAC) | User's server | User's login | YES | YES | Server metadata |

### Legitimate full-catalog sources — require the user's paid subscription

| Provider | Playback mechanism | Dev cost | User cost | Notes |
|---|---|---|---|---|
| **Apple MusicKit** (web MKJS v3 + API/Android) | Official player only; full songs for authorized subscribers; previews otherwise | Apple Developer Program ($99/yr) for developer token (server-minted) | Paid Apple Music sub | Best major-catalog web story; no offline; explicit-content quirks on fresh accounts |
| **TIDAL SDK** (`@tidal-music/player` web; ExoPlayer Android) | ONLY allowed playback path; client-creds = 30s previews; full length needs user login | Open platform, OAuth 2.1 | Paid TIDAL sub | Guidelines forbid mixing TIDAL audio with other services' content in one experience |
| Spotify (existing) | Web Playback SDK / Connect | Free dev | Premium | Keep, but demote to metadata/library role |

### Ruled out (with reason)

- **Deezer** — official path is 30s previews unless logged-in Premium user; JS SDK unmaintained/deprecated; full tracks otherwise require the undocumented private API + Blowfish decrypt = DRM circumvention. OUT.
- **Napster** — effectively dead as a catalog: after the Mar-2025 Infinite Reality acquisition and Sony lawsuit, Napster removed its music library and pivoted to AI-generated music. OUT.
- **YouTube / YT Music** — Developer Policies explicitly prohibit separating audio, audio-only/background players, and downloads. Scraping (InnerTube/NewPipe) violates ToS and is GPL-encumbered. IFrame embed (foreground video) is the only compliant use — not a music-player engine. OUT as audio source.
- **SoundCloud** — API alive (AAC HLS 160k), but: (a) registering a NEW app requires a paid **Artist Pro** subscription + one app per person; (b) major-label content is mostly `blocked` off-platform; usable catalog ≈ indie/creator uploads (overlaps Audius). VIABLE SECONDARY, not primary. Client secret must stay server-side (fits BFF).
- **Qobuz / Amazon / Pandora / Bandcamp** — partner-only or no third-party playback API. OUT.

## 3. Proposed architecture (replaces the Spotify-centric player)

**Provider tiers** (capability matrix in 06 to be rewritten accordingly):

1. **Open playback (default, free, no subscription): Audius + Jamendo + Internet Archive.**
   Search is federated across all three; results deduplicate by (title, artist, duration±2s);
   playback picks highest quality legitimately available (Jamendo FLAC > Audius MP3 > Archive best file).
2. **Personal library (best quality): local files (built) + Subsonic/Navidrome (built: picker/ping; streaming next).**
3. **Live radio: Radio Browser** as a first-class "Radio" mode (honest: live, unskippable, no on-demand).
4. **Subscriber modules (optional, user-pays): Apple MusicKit, then TIDAL, then Spotify-Connect-as-playback.**
   Each is a separate capability-gated adapter, off by default, enabled only with valid subscription.
5. **Spotify demoted to metadata/library integration only** (OAuth, playlists, liked, sync, artwork, attribution) —
   unless/until its platform permits the required experience (it currently does not without Premium).

**New playback truthfulness rule:** `playbackMode` becomes the provider id
(`audius | jamendo | archive | radio | local | subsonic | apple | tidal | spotify-* | preview-nowhere`).
30-second previews are REMOVED as a playback path entirely (not even fallback);
where only a preview exists, the track is shown as unplayable text with the reason.

**Search → Play becomes:** federated search (open providers always; subscriber providers if connected)
→ unified result cards with source badges + quality labels (e.g. "FLAC · Jamendo")
→ full-length play in Soundscape → queue/playlists (cross-provider, persisted by canonical `(title, artist)` key)
→ lyrics (LRCLIB) → stats (unchanged, real events only).

**What gets deleted/rewired:** preview fallback in `audioPlayer.ts`; "Play on Spotify" links as primary action
(keep one metadata attribution link per Spotify policy); Premium-gated messaging replaced by
source badges; sync stays (library value is real).

## 4. Roadmap delta (26 to be amended on decision)

- P-A (new, first): Audius provider (search/stream/trending/playlists, OAuth optional) + federated search UI.
- P-B: Jamendo provider (needs owner's free `client_id` from devportal.jamendo.com) + FLAC preference.
- P-C: Archive provider (curated: Live Music Archive + netlabels; guard quality variance honestly).
- P-D: Radio mode (Radio Browser) + Spotify demotion (remove preview paths, keep sync).
- P-E (gated): Apple MusicKit subscriber module (needs owner's $99/yr Apple Developer membership).
- P-F (gated): TIDAL subscriber module. SoundCloud secondary only if owner buys Artist Pro.

## 5. Decision required (pick one before implementation resumes)

- **Option A (recommended): open-catalog player.** Audius + Jamendo + Archive + Radio + local + Subsonic; Spotify = library/metadata only. Free for everyone, no subscriptions, no paid dev programs. Trade-off stated openly: no Taylor Swift / Drake studio catalog.
- **Option B: A + subscriber modules.** Everything in A, plus Apple MusicKit (and later TIDAL) for users with subscriptions. Needs owner's Apple Developer membership ($99/yr) + server-minted tokens.
- **Option C: subscriber-first.** Skip open catalogs; build Apple MusicKit (+TIDAL) as THE player. Basically rebuilds the same "pay to play" wall with a different logo — not recommended given the correction.
