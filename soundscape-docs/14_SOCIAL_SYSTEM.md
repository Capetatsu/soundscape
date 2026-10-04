# 14 Social System (modular, Phase 11)
Isolated module `core/social`; app works fully without it. Requires backend state (rooms) → separate service flag.
## Shared/collaborative playlists
Use Spotify-native playlists (collaborative flag, share links). Soundscape does not host copies of Spotify playlists. Other users' playlist items are NOT readable via API unless owned/collaborating (Dev Mode).
## Listen Together
Host-authoritative room over WebSocket: `{roomId, hostId, queue, position@timestamp, state}`. Each participant plays through THEIR OWN provider account (Spotify Premium each; Dev-Mode user cap applies). No audio relay. Sync: host broadcasts `(trackUri, positionMs, serverTime)` every 5 s + on seek/pause; guests correct drift if |Δ|>1.5 s via seek; hard-resync on track change. Join by link/code; host can kick; guests can suggest tracks.
## Profiles/sharing/messaging
Minimal profile (display name, avatar, optional now-playing share). Share = Spotify link or Soundscape room link. Messaging: out of scope until Listen Together is stable; if added, ephemeral room chat only.
## Privacy
Opt-in presence; no public leaderboards; room data deleted on close.
