import { BaseProvider, type Capability } from '../types';

// Normative capability matrix (06). Unit-tested expectation:
// - Web API: account/library YES, search YES (<=10/page), lyrics NO, download NO.
// - SDK/Connect: playback YES (Premium only), EQ/crossfade/norm NO.
const SPOTIFY_WEB_CAPS: Capability[] = [
  'auth', 'library', 'likedSongs', 'search', 'metadata', 'devices', 'playback', 'write'
];

export class SpotifyProvider extends BaseProvider {
  readonly id = 'spotify' as const;
  readonly caps: ReadonlySet<Capability> = new Set(SPOTIFY_WEB_CAPS);
}

export class LocalProvider extends BaseProvider {
  readonly id = 'local' as const;
  readonly caps: ReadonlySet<Capability> = new Set<Capability>([
    'search', 'metadata', 'lyrics', 'playback', 'download'
  ]);
  override status() {
    return { connected: true, detail: 'local files (browser File API)' };
  }
}

export class SubsonicProvider extends BaseProvider {
  readonly id = 'subsonic' as const;
  readonly caps: ReadonlySet<Capability> = new Set<Capability>([
    'auth', 'library', 'search', 'metadata', 'lyrics', 'playback', 'devices', 'download', 'write'
  ]);
}

export class LrclibProvider extends BaseProvider {
  readonly id = 'lrclib' as const;
  readonly caps: ReadonlySet<Capability> = new Set<Capability>(['lyrics', 'metadata', 'search']);
  override status() {
    return { connected: true, detail: 'https://lrclib.net (public lyrics API)' };
  }
}

export class AudiusProvider extends BaseProvider {
  readonly id = 'audius' as const;
  // No-auth: full-track search + streaming. With Login-with-Audius: library/write (later).
  readonly caps: ReadonlySet<Capability> = new Set<Capability>([
    'search', 'metadata', 'playback', 'recommendations'
  ]);
  override status() {
    return { connected: true, detail: 'open catalog, no subscription required' };
  }
}

export class JamendoProvider extends BaseProvider {
  readonly id = 'jamendo' as const;
  readonly caps: ReadonlySet<Capability> = new Set<Capability>([
    'search', 'metadata', 'playback', 'recommendations', 'lyrics', 'download'
  ]);
  override status() {
    return { connected: true, detail: 'open catalog, client_id required (P-B)' };
  }
}

export class ArchiveProvider extends BaseProvider {
  readonly id = 'archive' as const;
  readonly caps: ReadonlySet<Capability> = new Set<Capability>([
    'search', 'metadata', 'playback', 'download'
  ]);
  override status() {
    return { connected: true, detail: 'Internet Archive audio (P-C)' };
  }
}

export class RadioProvider extends BaseProvider {
  readonly id = 'radio' as const;
  readonly caps: ReadonlySet<Capability> = new Set<Capability>(['search', 'metadata', 'playback']);
  override status() {
    return { connected: true, detail: 'Radio Browser live streams (P-D)' };
  }
}
