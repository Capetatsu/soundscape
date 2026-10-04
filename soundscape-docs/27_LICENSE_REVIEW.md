# 27 License Review (not legal advice)
Soundscape's own license: none visible on repo page → decide before reuse of any third-party code.
| Repo | License (from page) | Safe to take inspiration | Do not copy | Flags |
|---|---|---|---|---|
| Spotube | BSD-4-Clause | architecture, plugin idea, feature ideas | source code (advertising clause obligations) | historically YouTube-sourced audio; check plugin ToS |
| SpatialFlow | MIT | most ideas; code reuse allowed with notice | — (still avoid NewPipe-based modules) | depends on NewPipe Extractor (GPL) + YouTube scraping |
| VIVI Music | GPL-3.0 + `rules.md` reuse guidelines | ideas, UX patterns | any code (would force GPL-3.0) | YouTube InnerTube, JioSaavn unofficial APIs; third-party lyrics APIs |
| Echo Music | GPL-3.0 | ideas (Fast Sync UX, Listen Together concept) | any code; BotGuard/age-restriction bypass approaches | README itself claims bypass; ads-on-download |
| ArchiveTune | GPL-3.0; name/logo not licensed | ideas | any code, branding | submodules (core, lyrics) separate repos; YouTube scraping |
| AirBeats | GPL-3.0 | provider-module concept, stats ideas | any code | Firebase backend; global stats privacy |
| Open-Source-Music-Streaming-Apps | CC0 | list usage | — | each listed app has its own license, not reviewed |
## Rules for the build
1. Write Soundscape code from these docs, not from reference source. If any GPL code is ever copied, Soundscape must become GPL-3.0.
2. Third-party runtime dependencies must be permissive (MIT/Apache/BSD/ISC) — CI license check (e.g., license-checker) fails on GPL/AGPL.
3. Provider terms matter independent of code license: Spotify Developer Terms/Policy (no stream ripping, no DRM bypass, attribution, no ML training on content, review sync-with-visuals/lyrics clauses before release); YouTube ToS (no scraping/extraction); LRCLIB usage guidelines (identify app via User-Agent).
4. Spotify artwork/brand assets used per Spotify design guidelines only.
