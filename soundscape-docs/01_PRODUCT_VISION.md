# 01 Product Vision
## WHAT
Soundscape: a personal music app. Connect real Spotify → see real playlists + Liked Songs → search real catalog → play for real. Plus local files / own-server music with a real audio engine, synced lyrics, stats, optional AI DJ.
## WHY
Current repo is an AI-Studio-generated prototype ("open-source spotify") with demo content and fallback fake tracks. Goal: every pixel backed by real data, every "Playing" backed by real audio.
## Core user story (acceptance for v1)
Open → Connect Spotify (official OAuth) → playlists+liked load → tap a track → audio plays within 1.5 s → pause/seek/next work → Sync Now shows +/~/- diff → close app, reopen → cached library shows instantly offline.
## Principles
1. One source of truth for playback (PlayerController). UI renders, never owns.
2. Capability honesty: a provider/UI control exists only if the provider truly supports it.
3. No mock data in production builds (enforced by build flag + CI grep).
4. Local-first: IndexedDB cache; works offline for browsing cached library.
5. Respect provider terms; never bypass DRM.
## Non-goals (v1)
Streaming Spotify audio through our own engine; downloading Spotify tracks; lossless claims for Spotify; multi-tenant public service (blocked by Dev Mode user cap).
## Success metrics
Play-start success ≥98% (Premium, desktop Chrome); sync correctness 100% on fixture libraries; zero fake entities in prod.
