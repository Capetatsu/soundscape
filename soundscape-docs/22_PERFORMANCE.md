# 22 Performance Targets
Reference device: mid-range Android (Chrome), 4G; and 2020 laptop. Measure with Lighthouse CI + custom marks.
| Area | Target (p75) |
|---|---|
| Cold start → interactive (cached library) | ≤ 2.5 s; ≤ 1.2 s warm |
| Navigation between screens | ≤ 150 ms (data from IndexedDB) |
| Liked Songs 10k rows scroll | 60 fps (virtualized), first paint ≤ 300 ms |
| Playlist open (500 tracks) | ≤ 250 ms from cache |
| Search first results (Spotify) | ≤ 800 ms after debounce 250 ms |
| Image load | lazy + `srcset` using Spotify CDN sizes (64/300/640); placeholder instantly; no layout shift |
| Tap-to-audio (Spotify SDK warm) | ≤ 1.5 s; cold SDK init ≤ 4 s |
| Local file play | ≤ 300 ms |
| Sync: 1,200 liked + 40 playlists first run | ≤ 25 s (≈ 24 + ~60 requests, concurrency 4); unchanged re-sync ≤ 2 s |
| Memory | ≤ 200 MB tab with 10k-track library |
| JS bundle | ≤ 250 KB gz initial; lazy-load lyrics/stats/AI/social |
| Battery/network | no polling when tab hidden except playback state; device polling only when picker open; sync auto-pauses on hidden tab |
Budgets enforced in CI (bundle-size check, Lighthouse thresholds).
