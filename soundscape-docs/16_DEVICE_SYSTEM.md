# 16 Device System
Never fake connectivity: the device list is exactly what providers report.
## Sources
- Spotify Connect: `GET /me/player/devices` (id, name, type, is_active, volume). Poll 5 s only while the device picker is open; refresh on SDK `ready`/`not_ready`.
- This browser: Web Playback SDK device (name "Soundscape (<browser>)") when available.
- Local/Subsonic: "This device" only.
## Actions
Transfer: `PUT /me/player {device_ids:[id], play:true|false}`; confirm by re-reading `GET /me/player` until `device.id` matches (timeout 5 s → error, not success).
Volume on remote: `PUT /me/player/volume` (if `supports_volume`).
## State sync
Remote-controlled mode: PlaybackState derived from polling `GET /me/player` every 1 s while active (+ interpolation); badge "Controlling <device>".
## Not available on web
Chromecast/AirPlay for Spotify audio; mDNS discovery (Spotube uses bonsoir natively); external speaker pairing beyond OS Bluetooth. Native phase may add.
## Cross-device Soundscape state
Phase 12: optional account sync of queue/settings through own backend. Not a Spotify feature.
