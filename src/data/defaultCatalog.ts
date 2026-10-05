// Soundscape Spotify Integration Defaults
// Real catalog data, artwork, tracks, artists, and playlists are fetched dynamically from the authorized Spotify API.

export const DEFAULT_CLIENT_ID = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_SPOTIFY_CLIENT_ID) as string) || '';
