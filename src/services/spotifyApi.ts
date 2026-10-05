import {
  SpotifyUser,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyDevice,
  SpotifyAlbum,
  SpotifyArtist
} from '../types';
import { SpotifyAuthService } from './spotifyAuth';

const BASE_URL = 'https://api.spotify.com/v1';

export interface PlaybackApiResponse {
  success: boolean;
  status: number;
  message?: string;
  reason?: string;
}

export class SpotifyApiClient {
  private static async fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
    let token = SpotifyAuthService.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated with Spotify');
    }

    if (SpotifyAuthService.isTokenExpired()) {
      const refreshed = await SpotifyAuthService.refreshToken();
      if (refreshed) token = refreshed;
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    let response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Retry once after forced refresh
      const refreshed = await SpotifyAuthService.refreshToken();
      if (refreshed) {
        headers.set('Authorization', `Bearer ${refreshed}`);
        response = await fetch(`${BASE_URL}${endpoint}`, {
          ...options,
          headers
        });
      }
    }

    return response;
  }

  static async getMe(): Promise<SpotifyUser> {
    const res = await this.fetchWithAuth('/me');
    if (!res.ok) throw new Error(`Failed to fetch user profile: ${res.status}`);
    return res.json();
  }

  static async getPlaybackState(): Promise<any | null> {
    try {
      const res = await this.fetchWithAuth('/me/player');
      if (res.status === 204 || !res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  static async getMyPlaylists(limit = 50, offset = 0): Promise<{ items: SpotifyPlaylist[]; total: number }> {
    const res = await this.fetchWithAuth(`/me/playlists?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`Failed to fetch playlists: ${res.status}`);
    return res.json();
  }

  static async getMySavedTracks(limit = 50, offset = 0): Promise<{ items: { track: SpotifyTrack; added_at: string }[]; total: number }> {
    const res = await this.fetchWithAuth(`/me/tracks?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`Failed to fetch saved tracks: ${res.status}`);
    return res.json();
  }

  static async checkSavedTracks(trackIds: string[]): Promise<boolean[]> {
    if (!trackIds.length) return [];
    const ids = trackIds.slice(0, 50).join(',');
    const res = await this.fetchWithAuth(`/me/tracks/contains?ids=${ids}`);
    if (!res.ok) return trackIds.map(() => false);
    return res.json();
  }

  static async saveTrack(trackId: string): Promise<boolean> {
    const res = await this.fetchWithAuth(`/me/tracks?ids=${trackId}`, {
      method: 'PUT'
    });
    return res.ok;
  }

  static async removeSavedTrack(trackId: string): Promise<boolean> {
    const res = await this.fetchWithAuth(`/me/tracks?ids=${trackId}`, {
      method: 'DELETE'
    });
    return res.ok;
  }

  static async followPlaylist(playlistId: string): Promise<boolean> {
    const res = await this.fetchWithAuth(`/playlists/${playlistId}/followers`, {
      method: 'PUT'
    });
    return res.ok;
  }

  static async unfollowPlaylist(playlistId: string): Promise<boolean> {
    const res = await this.fetchWithAuth(`/playlists/${playlistId}/followers`, {
      method: 'DELETE'
    });
    return res.ok;
  }

  static async getRecentlyPlayed(limit = 20): Promise<SpotifyTrack[]> {
    try {
      const res = await this.fetchWithAuth(`/me/player/recently-played?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      const tracks: SpotifyTrack[] = [];
      const seen = new Set<string>();
      for (const item of data.items || []) {
        if (item.track && !seen.has(item.track.id)) {
          seen.add(item.track.id);
          tracks.push(item.track);
        }
      }
      return tracks;
    } catch {
      return [];
    }
  }

  static async getMyTopTracks(limit = 20, timeRange = 'short_term'): Promise<SpotifyTrack[]> {
    try {
      const res = await this.fetchWithAuth(`/me/top/tracks?limit=${limit}&time_range=${timeRange}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }

  static async getMyTopArtists(limit = 20, timeRange = 'medium_term'): Promise<SpotifyArtist[]> {
    try {
      const res = await this.fetchWithAuth(`/me/top/artists?limit=${limit}&time_range=${timeRange}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }

  static async getFeaturedPlaylists(limit = 20): Promise<{ message?: string; playlists: SpotifyPlaylist[] }> {
    try {
      const res = await this.fetchWithAuth(`/browse/featured-playlists?limit=${limit}`);
      if (!res.ok) return { playlists: [] };
      const data = await res.json();
      return {
        message: data.message,
        playlists: data.playlists?.items?.filter(Boolean) || []
      };
    } catch {
      return { playlists: [] };
    }
  }

  static async getNewReleases(limit = 20): Promise<SpotifyAlbum[]> {
    try {
      const res = await this.fetchWithAuth(`/browse/new-releases?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.albums?.items?.filter(Boolean) || [];
    } catch {
      return [];
    }
  }

  static async getAlbum(albumId: string): Promise<SpotifyAlbum | null> {
    try {
      const res = await this.fetchWithAuth(`/albums/${albumId}`);
      if (!res.ok) return null;
      const data = await res.json();
      // Ensure each track has full album info attached
      const tracks = (data.tracks?.items || []).map((t: any) => ({
        ...t,
        album: {
          id: data.id,
          name: data.name,
          images: data.images,
          release_date: data.release_date,
          uri: data.uri
        }
      }));
      return {
        ...data,
        tracks: {
          items: tracks,
          total: data.total_tracks || tracks.length
        }
      };
    } catch {
      return null;
    }
  }

  static async checkSavedAlbums(albumIds: string[]): Promise<boolean[]> {
    try {
      if (!albumIds.length) return [];
      const res = await this.fetchWithAuth(`/me/albums/contains?ids=${albumIds.join(',')}`);
      if (!res.ok) return albumIds.map(() => false);
      return res.json();
    } catch {
      return albumIds.map(() => false);
    }
  }

  static async saveAlbum(albumId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithAuth(`/me/albums?ids=${albumId}`, { method: 'PUT' });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async removeAlbum(albumId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithAuth(`/me/albums?ids=${albumId}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async getArtist(artistId: string): Promise<SpotifyArtist | null> {
    try {
      const res = await this.fetchWithAuth(`/artists/${artistId}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  static async getArtistTopTracks(artistId: string): Promise<SpotifyTrack[]> {
    try {
      let res = await this.fetchWithAuth(`/artists/${artistId}/top-tracks?market=from_token`);
      if (!res.ok) {
        res = await this.fetchWithAuth(`/artists/${artistId}/top-tracks?market=US`);
      }
      if (!res.ok) return [];
      const data = await res.json();
      return data.tracks || [];
    } catch {
      return [];
    }
  }

  static async getArtistAlbums(artistId: string, limit = 20): Promise<SpotifyAlbum[]> {
    try {
      const res = await this.fetchWithAuth(
        `/artists/${artistId}/albums?include_groups=album,single&limit=${limit}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }

  static async checkFollowArtist(artistId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithAuth(`/me/following/contains?type=artist&ids=${artistId}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data[0] || false;
    } catch {
      return false;
    }
  }

  static async followArtist(artistId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithAuth(`/me/following?type=artist&ids=${artistId}`, {
        method: 'PUT'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async unfollowArtist(artistId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithAuth(`/me/following?type=artist&ids=${artistId}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const res = await this.fetchWithAuth(`/playlists/${playlistId}`);
    if (!res.ok) throw new Error(`Failed to fetch playlist: ${res.status}`);
    return res.json();
  }

  static async search(query: string, types = 'track,artist,album,playlist', limit = 20): Promise<{
    tracks?: { items: SpotifyTrack[] };
    artists?: { items: any[] };
    albums?: { items: any[] };
    playlists?: { items: any[] };
  }> {
    const params = new URLSearchParams({
      q: query,
      type: types,
      limit: limit.toString()
    });
    const res = await this.fetchWithAuth(`/search?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to search: ${res.status}`);
    return res.json();
  }

  static async getDevices(): Promise<SpotifyDevice[]> {
    try {
      const res = await this.fetchWithAuth('/me/player/devices');
      if (!res.ok) return [];
      const data = await res.json();
      return data.devices || [];
    } catch {
      return [];
    }
  }

  static async transferPlayback(deviceId: string, play = true): Promise<PlaybackApiResponse> {
    try {
      const res = await this.fetchWithAuth('/me/player', {
        method: 'PUT',
        body: JSON.stringify({
          device_ids: [deviceId],
          play
        })
      });
      if (res.ok || res.status === 204) {
        return { success: true, status: res.status };
      }
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        status: res.status,
        message: errBody.error?.message || `HTTP ${res.status}`,
        reason: errBody.error?.reason
      };
    } catch (e: any) {
      return { success: false, status: 0, message: e.message || 'Network error' };
    }
  }

  static async startPlayback(options: {
    context_uri?: string;
    uris?: string[];
    offset?: { position?: number; uri?: string };
    position_ms?: number;
    device_id?: string;
  }): Promise<PlaybackApiResponse> {
    try {
      const query = options.device_id ? `?device_id=${options.device_id}` : '';
      const body: any = {};
      if (options.context_uri) body.context_uri = options.context_uri;
      if (options.uris) body.uris = options.uris;
      if (options.offset) body.offset = options.offset;
      if (options.position_ms != null) body.position_ms = options.position_ms;

      const res = await this.fetchWithAuth(`/me/player/play${query}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      if (res.ok || res.status === 204) {
        return { success: true, status: res.status, message: 'Playback command accepted' };
      }

      const errBody = await res.json().catch(() => ({}));
      const message = errBody.error?.message || `Spotify API returned status ${res.status}`;
      return {
        success: false,
        status: res.status,
        message,
        reason: errBody.error?.reason
      };
    } catch (e: any) {
      return { success: false, status: 0, message: e.message || 'Failed to send playback command' };
    }
  }

  static async pausePlayback(deviceId?: string): Promise<boolean> {
    const query = deviceId ? `?device_id=${deviceId}` : '';
    const res = await this.fetchWithAuth(`/me/player/pause${query}`, {
      method: 'PUT'
    });
    return res.ok || res.status === 204;
  }

  static async nextTrack(deviceId?: string): Promise<boolean> {
    const query = deviceId ? `?device_id=${deviceId}` : '';
    const res = await this.fetchWithAuth(`/me/player/next${query}`, {
      method: 'POST'
    });
    return res.ok || res.status === 204;
  }

  static async previousTrack(deviceId?: string): Promise<boolean> {
    const query = deviceId ? `?device_id=${deviceId}` : '';
    const res = await this.fetchWithAuth(`/me/player/previous${query}`, {
      method: 'POST'
    });
    return res.ok || res.status === 204;
  }

  static async seek(positionMs: number, deviceId?: string): Promise<boolean> {
    const query = new URLSearchParams({ position_ms: positionMs.toString() });
    if (deviceId) query.set('device_id', deviceId);
    const res = await this.fetchWithAuth(`/me/player/seek?${query.toString()}`, {
      method: 'PUT'
    });
    return res.ok || res.status === 204;
  }

  static async setVolume(volumePercent: number, deviceId?: string): Promise<boolean> {
    const query = new URLSearchParams({ volume_percent: Math.round(volumePercent).toString() });
    if (deviceId) query.set('device_id', deviceId);
    const res = await this.fetchWithAuth(`/me/player/volume?${query.toString()}`, {
      method: 'PUT'
    });
    return res.ok || res.status === 204;
  }

  static async setRepeat(state: 'track' | 'context' | 'off', deviceId?: string): Promise<boolean> {
    const query = new URLSearchParams({ state });
    if (deviceId) query.set('device_id', deviceId);
    const res = await this.fetchWithAuth(`/me/player/repeat?${query.toString()}`, {
      method: 'PUT'
    });
    return res.ok || res.status === 204;
  }

  static async setShuffle(state: boolean, deviceId?: string): Promise<boolean> {
    const query = new URLSearchParams({ state: state.toString() });
    if (deviceId) query.set('device_id', deviceId);
    const res = await this.fetchWithAuth(`/me/player/shuffle?${query.toString()}`, {
      method: 'PUT'
    });
    return res.ok || res.status === 204;
  }
}
