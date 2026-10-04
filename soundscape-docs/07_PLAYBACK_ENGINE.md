# 07 Playback Engine
## Components
PlayerController (only writer of PlaybackState) · QueueManager · ProviderPlaybackAdapter(s) · MediaSessionBridge (navigator.mediaSession) · DeviceManager · AudioFocusManager (web: pause on other-tab takeover; native later) · ErrorManager.

## PlaybackState (single source of truth)
```ts
{ phase:'idle'|'loading'|'ready'|'playing'|'paused'|'buffering'|'ended'|'error',
  cmd:{ id:string; type:'play'|'pause'|'seek'|'next'|'prev'; sentAt:number; accepted:boolean|null }|null,
  item:QueueItem|null, positionMs:number, positionAt:number /*timestamp for interpolation*/, durationMs:number,
  volume:number, shuffle:boolean, repeat:'off'|'all'|'one', deviceId:string|null,
  features:PlaybackFeatures, error:SoundscapeError|null }
```
**Rule: `phase` becomes `playing` only when the adapter reports real playback (SDK `paused=false` AND position advanced ≥250 ms, or `<audio>` `playing` + `timeupdate`).** Commands set `cmd.sentAt`; success of the HTTP/SDK call sets `cmd.accepted=true` but not `playing`. This is the Diagnostics ladder (doc 28 / diagnostics): INITIALIZED → READY → COMMAND SENT → COMMAND ACCEPTED → PLAYING | PAUSED | ERROR.

## Queue
QueueManager owns order, shuffle (Fisher-Yates, preserve current), repeat, play-next, add-to-queue, history. Persisted to IndexedDB (`QueueItem`). Context (playlist/album/liked) expands lazily (virtual queue ≥1000).
Spotify adapter plays ONE track at a time (`PUT /me/player/play {uris:[uri], position_ms}`), Soundscape queue advances itself on end-of-track detected from SDK state (previous_tracks contains the track AND paused AND position 0, or position≥duration−250ms). Consequence: no gapless/crossfade between Spotify tracks. For "play this playlist natively" an optional `context_uri` mode hands queue control to Spotify (then Spotify owns next/prev; UI shows reduced controls).

## Spotify adapter
1. Load SDK script; `new Spotify.Player({name:'Soundscape', getOAuthToken: cb=>fetch('/api/auth/token')…})`.
2. On `ready` → `device_id`; `PUT /me/player {device_ids:[id], play:false}` to transfer.
3. Events: `player_state_changed` → map to RawPlayerState; `initialization_error`, `authentication_error`, `account_error` (non-Premium), `playback_error`, `not_ready`.
4. Premium detection: `GET /me` no longer returns `product` → treat `account_error` / 403 on player endpoints as "Premium required" and switch UI to browse-only + Connect-remote-unavailable message.
5. Autoplay policy: first play must follow a user gesture → call `player.activateElement()` on first tap.
6. Token expiry mid-play: SDK asks `getOAuthToken` again; failure → ErrorManager `auth_expired` → pause + reconnect banner, keep queue.
7. Mobile browser: SDK unsupported → adapter `features.playLocal=false`; use Connect remote (`GET /me/player/devices`, transfer, play on selected device).

## Local/Subsonic adapter
`HTMLAudioElement` + Web Audio graph (doc 08). Events map directly. Preload next item for fast advance.

## Errors (ErrorManager)
| Code | Cause | Behavior |
|---|---|---|
| auth_expired | 401/SDK auth error | refresh once; else DISCONNECTED banner; queue kept |
| premium_required | account_error / 403 | disable Spotify play, explain |
| no_active_device | 404 NO_ACTIVE_DEVICE | prompt device picker |
| rate_limited | 429 | honor Retry-After, queue command |
| network_lost | offline event | pause adapter if buffering>10s; resume on online |
| track_unavailable | region/removed | skip to next, toast once |
| adapter_crash | SDK disconnect | re-init up to 3×, backoff 1/2/4s, then error state |
Every error is surfaced in UI + Diagnostics; none silently swallowed.

## MediaSession
Set metadata (title, artist, album, artwork from provider URL), action handlers (play,pause,previoustrack,nexttrack,seekto,seekbackward/forward), `setPositionState` on state change. Works for local audio; with Spotify SDK works in Chromium (SDK owns an audio element) — verify in Phase 3.
