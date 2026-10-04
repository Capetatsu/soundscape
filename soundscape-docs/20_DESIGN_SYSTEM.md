# 20 Design System
Preserve identity observed in server.ts callback page (full UI audit pending M0): dark surface `#131313`, card `#201f1f`, text `#e5e2e1`, muted `#c6c6c7`, border `rgba(255,255,255,.08)`, accent green `#53e076` on `#003914`, Spotify green `#1db954` reserved for Spotify-attribution, radius 20 px cards, font **Plus Jakarta Sans** (system-ui fallback).
## Tokens (CSS variables)
`--bg --surface --surface-2 --text --text-muted --accent --danger --warn --radius-card:20px --radius-ctl:12px --space-1..8 (4px grid) --shadow-1 --motion-fast:120ms --motion-std:240ms`.
## Theming
Dark default; AMOLED (`--bg:#000`); light optional. Dynamic accent from artwork (palette extracted client-side; artwork itself never altered/cropped beyond CSS object-fit; check Spotify design rules).
## Player styles
v1: 2 (Classic, Compact). Mini-player: 2 (bar, floating). Additional styles are a later, low-priority option (AirBeats/Echo offer 9–20 — usability cost).
## Customization (bounded)
Density (compact/comfortable), animation intensity (full/reduced/off, honors `prefers-reduced-motion`), lyrics style, visualizer (off by default, Web Audio analyser for local only), typography scale 90–120%.
## Accessibility
WCAG AA contrast, 44 px targets, focus rings, full keyboard (space/arrows/m/n/p), ARIA live region for track change, screen-reader labels on icon buttons.
## Spotify attribution
Show Spotify logo/link on Spotify-sourced items and open-in-Spotify link per Spotify design guidelines (verify exact rules before release).
