# 05 Architecture
## Target decision
**Web-first PWA (React+Vite, keep) + framework-free `core/` + Express BFF.** Native Android shell (Kotlin/Media3) is Phase-later, only if Android Auto, USB-DAC/bit-perfect, or guaranteed background playback become requirements.
Why: Spotify playback in a browser works via Web Playback SDK (Premium, desktop browsers); mobile browsers cannot host it → on phone, Soundscape acts as Spotify Connect remote (controls another device). Every Android reference is native Kotlin+Media3 because background/Android Auto need it; that is the honest long-term path, but a native rewrite now would delay "app works" by months.
Keep React/Vite? YES for v1. Reconsider when: native media session on phone is a hard requirement.

## Layout
```
server/            Express BFF: auth, token, AI, health. No business logic.
src/core/          Pure TS (no React, no DOM except adapters)
  providers/       types.ts registry.ts spotify/ local/ subsonic/
  playback/        PlayerController PlaybackState QueueManager MediaSessionBridge
                   DeviceManager AudioFocusManager ErrorManager adapters/
  sync/            SyncEngine diff SyncJob
  db/              schema (Dexie) migrations
  lyrics/ stats/ ai/ diagnostics/
src/ui/            screens/ components/ hooks/ theme/
src/dev/           mocks (excluded from prod by `import.meta.env.PROD` + CI grep)
```
## Rules
- UI talks to core via a store (zustand) subscribed to `PlayerController`; UI never calls provider SDKs.
- Core has no `window` access outside `adapters/` and `MediaSessionBridge`.
- All network goes through `ProviderClient` with retry/429 handling.
- Errors are typed (`SoundscapeError{code,retryable,provider}`).
## Data flow
Spotify API → ProviderClient → SyncEngine → IndexedDB (source for UI) → store → screens.
Tap track → PlayerController.play(queueItem) → adapter for item.provider → real engine → state events → PlaybackState → UI + MediaSession.
## Process model
Single browser tab owns playback (BroadcastChannel lock; second tab shows "playing in another tab").
