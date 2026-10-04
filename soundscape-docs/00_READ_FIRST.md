# Soundscape Spec Package — Read First
Date: 2026-10-05. Audience: the coding agent that will build Soundscape.

## What this package is
28 numbered docs (01–28). Written from: server.ts (full), repo root listing, READMEs of the 7 reference repos + the list repo, and Spotify's Feb-2026 migration guide. Everything else is marked UNVERIFIED.

## What was NOT inspected (do M0 first — see 24_MIGRATION_PLAN)
- `src/**`, `package.json`, `.env.example`, `vite.config.ts`, `metadata.json`, `temp_apk/` — GitHub blocked automated access to `/tree/` pages after the first fetches. Doc 03 therefore audits only what was read. The agent must run the M0 inventory and amend doc 03.
- Reference-repo SOURCE CODE. Only READMEs/root file lists were read. Doc 02/04 claims are "README claims", not verified behavior.
- The ~80 apps in the list repo: only names catalogued.

## The five decisions that make the app actually work
1. **Spotify audio can only play through Spotify's own players** (Web Playback SDK in a desktop browser, or Spotify Connect devices). A custom audio engine cannot decode Spotify streams. So: Spotify = library + metadata + remote/SDK playback. EQ/crossfade/LUFS apply only to non-Spotify sources.
2. **Spotify Dev Mode (since Feb/Mar 2026): owner needs Premium, 5 authorized users, search limit 10, no batch GETs, no browse/new-releases/artist-top-tracks, playlist items only for playlists you own/collaborate on, `GET /me` no longer returns `product`.** Soundscape is a personal/small-circle app unless Extended Quota is granted.
3. **Do not copy the YouTube-Music-scraping pattern** used by Vivi/Echo/ArchiveTune/AirBeats/SpatialFlow (InnerTube/NewPipe extractors). It violates YouTube ToS and is GPL-encumbered. Non-Spotify playback = local files, user's own Subsonic/Navidrome/Jellyfin server, open-licensed catalogs.
4. **Web-first PWA now (keep React/Vite), with a framework-free TypeScript `core/`** so a native Android shell (Kotlin/Media3, like every Android reference) can be added later for Android Auto / bit-perfect / true background playback.
5. **Tokens never reach localStorage.** Server (BFF) holds the refresh token; browser gets short-lived access tokens.

## Reading order
01→05→06→07→09→10 are the build-critical docs. The rest are phase-gated by 26_IMPLEMENTATION_ROADMAP.
