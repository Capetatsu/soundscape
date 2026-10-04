# 06 Provider Architecture
> SUPERSEDED IN PART by 29_PROVIDER_RESEARCH_AND_DECISION.md (owner chose Option A, 2026-10-05):
> Playback tiers are now (1) open catalog: audius/jamendo/archive (free, full-length, default),
> (2) personal: local/subsonic, (3) radio: radio-browser (live), (4) subscriber modules (gated),
> (5) spotify: metadata/library ONLY. `playbackMode` = provider id. Previews are NOT a playback path.
> The interfaces below still apply; the capability matrix lives in 29 §2–3.

Three roles, separate interfaces (a provider implements any subset):
```ts
type Cap = 'auth'|'library'|'likedSongs'|'search'|'metadata'|'recommendations'|'lyrics'|'playback'|'devices'|'download'|'write';
interface ProviderBase { id:string; caps:ReadonlySet<Cap>; status():ProviderStatus }
interface AccountProvider extends ProviderBase { connect():Promise<void>; disconnect():Promise<void>;
  getUserPlaylists(cur?:Cursor):Page<PlaylistRef>; getPlaylistItems(id,cur?):Page<TrackRef>|Unavailable;
  getLikedSongs(cur?):Page<SavedTrack>; setLiked(uris,liked):Promise<void> }
interface CatalogProvider extends ProviderBase { search(q,types,cur?):Page<Entity>; getTrack(id); getAlbum(id); getArtist(id) }
interface PlaybackProvider extends ProviderBase { createAdapter():ProviderPlaybackAdapter }
interface ProviderPlaybackAdapter { init(); load(item); play(); pause(); seek(ms); setVolume(v);
  onState(cb:(s:RawPlayerState)=>void); dispose(); readonly features:PlaybackFeatures }
```
Unsupported calls throw `CapabilityError` — never return empty fake data. UI hides/disables controls from `features`.

## Capability matrix (as of 2026-10-05; Spotify rows from Spotify docs read; others from general knowledge—verify in Phase 1 spike)
| Capability | Spotify Web API | Spotify Web Playback SDK / Connect | Local files | Subsonic/Navidrome/Jellyfin (own server) | LRCLIB |
|---|---|---|---|---|---|
| Account/library | YES (OAuth) | — | N/A | YES (user creds) | N/A |
| Liked songs | YES | — | N/A | PARTIAL (starred) | — |
| Playlist items | PARTIAL: owned/collab only | — | N/A | YES | — |
| Search | YES, max 10/page | — | local index | YES | search lyrics only |
| Recommendations / audio features / browse / new releases / artist top tracks | NO (removed) | — | — | — | — |
| Playback | — | YES, Premium; SDK desktop browsers; Connect remote elsewhere | YES | YES (stream) | — |
| Seek/volume/next | — | YES | YES | YES | — |
| EQ/crossfade/normalization | — | NO (outside our control) | YES | YES | — |
| Lyrics | NO | NO | tags/.lrc | via server if present | YES (plain+synced) |
| Download/offline | NO (never) | NO | already local | YES | — |
| Devices | — | YES (Connect list/transfer) | this device | N/A | — |
A provider's `caps` must be unit-tested against this table.

## Provider selection
Per queue item: `item.playbackProvider`. Spotify track played via Spotify; "play via another source" (match by title/artist/duration) is an explicit user action on a user-owned source only; never silently substitute.
Optional adapters (off by default, legal check required): YouTube IFrame Player API (official embed, foreground only), Internet Archive, Jamendo (CC), Audius.
