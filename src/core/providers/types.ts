// Framework-free provider contracts (no React, no DOM).
// Per 06_PROVIDER_ARCHITECTURE.md — capability honesty is normative.

export type Capability =
  | 'auth' | 'library' | 'likedSongs' | 'search' | 'metadata'
  | 'recommendations' | 'lyrics' | 'playback' | 'devices'
  | 'download' | 'write';

export type ProviderId = 'spotify' | 'local' | 'subsonic' | 'lrclib' | 'audius' | 'jamendo' | 'archive' | 'radio';

export class CapabilityError extends Error {
  readonly provider: ProviderId;
  readonly capability: Capability;
  constructor(provider: ProviderId, capability: Capability, detail?: string) {
    super(`${provider} does not support ${capability}${detail ? `: ${detail}` : ''}`);
    this.name = 'CapabilityError';
    this.provider = provider;
    this.capability = capability;
  }
}

export class SoundscapeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly provider?: ProviderId;
  constructor(code: string, message: string, opts?: { retryable?: boolean; provider?: ProviderId }) {
    super(message);
    this.name = 'SoundscapeError';
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.provider = opts?.provider;
  }
}

export interface ProviderStatus {
  connected: boolean;
  detail?: string;
}

export interface ProviderBase {
  readonly id: ProviderId;
  readonly caps: ReadonlySet<Capability>;
  status(): ProviderStatus;
  supports(cap: Capability): boolean;
  require(cap: Capability): void;
}

export abstract class BaseProvider implements ProviderBase {
  abstract readonly id: ProviderId;
  abstract readonly caps: ReadonlySet<Capability>;
  status(): ProviderStatus {
    return { connected: false, detail: 'not implemented' };
  }
  supports(cap: Capability): boolean {
    return this.caps.has(cap);
  }
  require(cap: Capability): void {
    if (!this.caps.has(cap)) throw new CapabilityError(this.id, cap);
  }
}

export interface Page<T> {
  items: T[];
  total: number | null;
  nextCursor: string | null;
}

export interface PlaylistRef {
  uri: string;
  name: string;
  ownerId: string | null;
  isOwner: boolean | null;
  collaborative: boolean;
  imageUrl: string | null;
  snapshotId: string | null;
  trackTotal: number | null;
  description: string | null;
}

export interface TrackRef {
  uri: string;
  name: string;
  artistNames: string[];
  albumName: string | null;
  albumUri: string | null;
  durationMs: number;
  explicit: boolean;
  imageUrl: string | null;
  previewUrl: string | null;
}

export interface SavedTrackRef {
  track: TrackRef;
  addedAt: string;
}

export interface PlaybackFeatures {
  playLocal: boolean;
  seek: boolean;
  volume: boolean;
  nextPrev: boolean;
  eq: boolean;
  crossfade: boolean;
  normalize: boolean;
  queue: boolean;
}

export interface RawPlayerState {
  paused: boolean;
  positionMs: number;
  durationMs: number;
  updatedAt: number;
}

export interface ProviderPlaybackAdapter {
  init(): Promise<void>;
  load(uri: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  onState(cb: (s: RawPlayerState) => void): () => void;
  dispose(): void;
  readonly features: PlaybackFeatures;
}
