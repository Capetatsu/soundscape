# 02 Reference Research
Depth: README + root listing only (see 00). "Claim" = stated by README, not code-verified.

| Repo | Stack | Playback | Sources | Notable | License |
|---|---|---|---|---|---|
| Spotube | Flutter/Dart; Riverpod, drift (SQLite), auto_route | media_kit (mpv), audio_service, smtc_windows, MPRIS | Plugin system (Hetu script) for metadata/audio; historically Spotify metadata + YouTube audio | Plugin-based provider abstraction; time-synced lyrics via LRCLIB regardless of plugin; Last.fm/ListenBrainz scrobble; bonsoir (mDNS) for device discovery; download w/ tags (metadata_god); no telemetry | BSD-4-Clause |
| SpatialFlow | Kotlin, Compose, Media3, Ktor, Koin, Coil; MVI-ish | Media3 | Local files (MP3/FLAC/AAC/WAV/OGG/M4A) + YouTube Music via NewPipe extractor | LUFS normalization (−14 default), gapless, crossfade, multiband EQ/bass boost/reverb, dynamic color, AMOLED. Lyrics/Android Auto only "planned" | MIT |
| VIVI Music | Kotlin/Compose; modules: innertube, jiosaavn, spotify, lastfm, lyricsProvider, kizzy (Discord RPC), shazamkit | Media3 (claim) | YouTube Music, JioSaavn | Word-by-word lyrics (BetterLyrics/SimpMusic/YouLyPlus), animated canvas, EQ, downloads, Android Auto, zero telemetry. rules.md governs code reuse | GPL-3.0 |
| Echo Music | Kotlin; modules: innertube, kugou, lrclib, betterlyrics, youlyplus, simpmusic, paxsenixlyrics, unison, playback, core | "InnerTubeX" engine, chunked cache, read-ahead | YouTube Music | Spotify playlist import + one-tap Fast Sync; Listen Together (Jam-like); crossfade; download manager; on-device "Echo Brain" queue injection; FOSS vs GMS flavors; data saver. README claims bypassing age restriction/BotGuard | GPL-3.0 |
| ArchiveTune | Kotlin/Compose, MVVM; spotifycore, lastfm, lyrics, canvas submodules | Media3-style; EBU R128 normalization; crossfade; tempo/pitch | YouTube Music + local files | 9 player styles/8 backgrounds, Spotify playlist import, Last.fm + ListenBrainz, Discord RPC, stats, multi-account. Branding not licensed | GPL-3.0 |
| AirBeats | Kotlin; modules airconnect, betterlyrics, discordrpc, innertube, kugou, lrclib, spotify, shazamkit; Firebase | Android media session, Android Auto, AOD, "Dynamic Island" | YouTube Music, JioSaavn (provider-based) | Cloud backup/sync, global + personal stats, cross-platform Listen Together (Android↔desktop), 20+ player styles, crash reporting, separate desktop repo | GPL-3.0 |
| Open-Source-Music-Streaming-Apps | Curated list (CC0): ~30 Android streaming clients, 16 offline players, desktop (Nuclear, Pear Desktop, muffon, Harmonoid, Nora, Supersonic, Tauon…), web (Monochrome) | — | — | Only names catalogued; not inspected | CC0 |

## Cross-cutting findings
- Provider-abstraction exemplars: Spotube (plugins), AirBeats (provider modules), VIVI/Echo (per-source Gradle modules).
- Every Android ref uses Media3 + MediaSession → the native route to lock-screen/Android Auto is proven.
- Lyrics: LRCLIB is the common legitimate base; BetterLyrics/SimpMusic/YouLyPlus/KuGou/Paxsenix are unofficial → optional, per-provider legal check.
- Spotify in these apps = playlist IMPORT only (metadata), audio from elsewhere. None play Spotify audio via own engine — consistent with decision 1 in doc 00.
## Ideas to adopt
Provider interface + capability flags (Spotube/AirBeats); LRCLIB lyrics; Fast Sync UX (Echo); local-first stats + ListenBrainz export (ArchiveTune); LUFS target config (SpatialFlow); download manager state machine (Echo/VIVI); Listen Together room model (Echo/AirBeats).
## Ideas NOT to adopt
InnerTube/NewPipe scraping and BotGuard bypass; Firebase global leaderboards (privacy); 20 player styles (usability cost); in-app APK updaters (not applicable to web); ads-on-download monetization.
