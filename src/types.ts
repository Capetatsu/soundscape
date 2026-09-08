export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  country?: string;
  product?: string; // 'premium' | 'free' | 'open'
  images?: { url: string; height?: number; width?: number }[];
  followers?: { total: number };
  uri?: string;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: { id?: string; name: string; uri?: string }[];
  album: {
    id?: string;
    name: string;
    images: { url: string; height?: number; width?: number }[];
    release_date?: string;
    uri?: string;
  };
  duration_ms: number;
  preview_url: string | null;
  explicit: boolean;
  popularity?: number;
  track_number?: number;
  disc_number?: number;
  audio_url?: string;
  lyrics?: string[];
}

export interface SpotifyPlaylist {
  id: string;
  uri: string;
  name: string;
  description: string;
  images: { url: string; height?: number; width?: number }[];
  tracks: { total: number; items?: { track: SpotifyTrack }[] };
  owner: { display_name: string; id: string };
  isSaved?: boolean;
}

export interface SpotifyArtist {
  id: string;
  uri: string;
  name: string;
  images: { url: string; height?: number; width?: number }[];
  genres?: string[];
  followers?: { total: number };
  popularity?: number;
  monthly_listeners?: string;
}

export interface SpotifyAlbum {
  id: string;
  uri: string;
  name: string;
  images: { url: string; height?: number; width?: number }[];
  artists: { id?: string; name: string; uri?: string }[];
  release_date: string;
  total_tracks: number;
  label?: string;
  copyrights?: { text: string; type: string }[];
  tracks?: { items: SpotifyTrack[]; total?: number };
}

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session?: boolean;
  is_restricted?: boolean;
  name: string;
  type: string;
  volume_percent: number;
  supports_volume?: boolean;
  subtext?: string;
  badge?: string;
}

export interface AudioSettings {
  streamingQuality: 'auto' | 'low' | 'normal' | 'high' | 'very_high' | 'lossless';
  streamOnWifiOnly: boolean;
  downloadQuality: 'normal' | 'high' | 'very_high' | 'lossless';
  downloadCellular: boolean;
  bitPerfectPassthrough: boolean;
  volumeNormalization: boolean;
}

export type ActiveScreen = 
  | 'home' 
  | 'search' 
  | 'library' 
  | 'playlist' 
  | 'album'
  | 'artist'
  | 'account_sync' 
  | 'audio_settings' 
  | 'connect_device' 
  | 'queue' 
  | 'ai_dj'
  | 'diagnostics';

export interface SyncStepStatus {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  status: 'done' | 'processing' | 'queued';
  details?: string;
}

export interface FeatureReportItem {
  feature: string;
  status: 'WORKING' | 'PARTIAL' | 'UNAVAILABLE' | 'BLOCKED BY SPOTIFY LIMITATION';
  notes: string;
}
