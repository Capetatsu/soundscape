// DB -> UI mappers. The UI renders ONLY what the sync engine persisted.
import type { DbPlaylist, DbTrack } from '../db/database';
import type { SpotifyPlaylist, SpotifyTrack } from '../../types';

function playlistId(uri: string): string {
  return uri.startsWith('spotify:playlist:') ? uri.slice('spotify:playlist:'.length) : uri;
}

function trackId(uri: string): string {
  return uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : uri;
}

interface ArtistJson {
  name?: string;
  id?: string;
  uri?: string;
}

export function dbPlaylistToUi(p: DbPlaylist): SpotifyPlaylist {
  return {
    id: playlistId(p.uri),
    uri: p.uri,
    name: p.name,
    description: p.description ?? '',
    images: p.imageUrl ? [{ url: p.imageUrl }] : [],
    tracks: { total: p.trackTotal ?? 0 },
    owner: { display_name: p.ownerId ?? 'Spotify', id: p.ownerId ?? '' }
  };
}

export function dbTrackToUi(t: DbTrack): SpotifyTrack {
  let artists: { id?: string; name: string; uri?: string }[] = [];
  try {
    const raw = JSON.parse(t.artistsJson) as ArtistJson[];
    artists = (Array.isArray(raw) ? raw : []).map((a) => ({
      name: typeof a.name === 'string' ? a.name : 'Unknown artist',
      id: typeof a.id === 'string' ? a.id : undefined,
      uri: typeof a.uri === 'string' ? a.uri : undefined
    }));
  } catch {
    artists = [{ name: 'Unknown artist' }];
  }
  return {
    id: trackId(t.uri),
    uri: t.uri,
    name: t.name,
    artists,
    album: {
      name: '',
      images: t.imageUrl ? [{ url: t.imageUrl }] : []
    },
    duration_ms: t.durationMs,
    preview_url: null,
    explicit: t.explicit
  };
}
