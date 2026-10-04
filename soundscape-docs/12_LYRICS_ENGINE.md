# 12 Lyrics Engine
## Provider chain (ordered, per-track fallback)
1. Embedded tags (USLT/SYLT/Vorbis LYRICS) and sidecar `.lrc` (local only)
2. LRCLIB (public API: lookup by artist, title, album, duration; synced + plain) — default online provider
3. Optional word-level providers (Enhanced-LRC/TTML) behind a flag: BetterLyrics/SimpMusic/YouLyPlus/Paxsenix/KuGou as used by Vivi/Echo/ArchiveTune/AirBeats — **unofficial; legal/ToS review per provider before enabling; off by default**
Spotify's own lyrics are not exposed by the public API → none.
## Match rules
Key = normalized(artist)+normalized(title)+round(duration/2s). Accept LRCLIB hit if |duration diff| ≤ 3 s. Prefer synced over plain.
## Formats
Parse LRC (`[mm:ss.xx]`), Enhanced LRC (`<mm:ss.xx>` per word), TTML (word spans). Internal model: `Line{startMs,endMs,text,words?[{startMs,endMs,text}]}`.
## Sync
Render loop driven by `PlaybackState.positionMs` interpolation (rAF), not by timers. Per-track user offset (±5 s, 100 ms steps), stored. For Spotify playback add measured SDK latency compensation (default 0, adjustable).
## Cache
`Lyrics` table keyed by `(track_key, provider)`; TTL 30 d; negative-cache misses 24 h.
## Translation
Optional, via server `/api/ai/translate-lyrics` (user-triggered, shows "machine translated"). Romanization optional.
## UI
Modes: plain, synced-line, karaoke-word; font size, alignment, blur-inactive, animation intensity (respects `prefers-reduced-motion`).
