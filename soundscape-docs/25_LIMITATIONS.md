# 25 Limitations (what cannot / will not be done)
> Amended 2026-10-05 (Option A): Soundscape's DEFAULT player is the open catalogue
> (Audius/Jamendo/Archive/radio/local/server) — items 1–10 below constrain the OPTIONAL
> Spotify integration only, never the core experience. No major-label studio catalogue
> exists in any legitimate free path (see 29). Previews are not a playback path anywhere.

1. **Spotify audio runs only inside Spotify's players.** No EQ, crossfade, gapless, LUFS, visualizer-from-audio, or recording for Spotify tracks.
2. **Spotify playback needs Premium**; Web Playback SDK targets desktop browsers; on phones Soundscape is a remote for another Connect device.
3. **Dev Mode caps**: 5 users, owner Premium, search 10/page, limited endpoints. Wide public release needs Spotify Extended Quota approval, which is not granted for generic player clones (criteria tightened April 2025 — per secondary source; verify).
4. **No Spotify discovery APIs** (recommendations, audio features, browse, new releases, artist top tracks, related artists): Discovery uses user history, optional ListenBrainz/Last.fm/MusicBrainz, AI + resolution.
5. **Playlists you don't own: no track listing** via API. Playable only as Spotify context.
6. **Spotify lyrics not available**; lyrics come from LRCLIB/tags/optional providers.
7. **No Spotify downloads/offline audio**, ever.
8. **Web can't**: guarantee background sync, run Android Auto, bit-perfect/USB-exclusive output, background playback on iOS Safari reliably, Chromecast/AirPlay for Spotify audio.
9. `/me` no longer exposes plan → Premium detected by failure, not by flag.
10. Non-Spotify mainstream catalogs (YouTube Music) are **not** integrated by scraping. Optional official-embed adapter is foreground-only.
11. Research limits: src/ and reference source code not read (doc 00).
12. Gapless for MP3 depends on encoder-padding metadata; documented per-codec.
13. Listen Together requires each participant's own Spotify Premium and Dev-Mode allowlisting.
