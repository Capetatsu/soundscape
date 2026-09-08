import { SpotifyTrack, SpotifyDevice, SpotifyUser } from '../types';
import { SpotifyAuthService } from './spotifyAuth';
import { SpotifyApiClient, PlaybackApiResponse } from './spotifyApi';

export type PlaybackMode = 'sdk' | 'connect' | 'preview' | 'idle';

export interface PlaybackState {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  volume: number;
  playbackMode: PlaybackMode;
  playbackNotice?: string | null;
  lastError?: { code?: number | string; message: string; timestamp: number } | null;
}

export interface PlaybackDiagnostics {
  isAuthenticated: boolean;
  user: SpotifyUser | null;
  accountProduct: string | null;
  tokenValid: boolean;
  tokenExpiresInMs: number;
  scopes: string[];
  sdkScriptLoaded: boolean;
  sdkInitialized: boolean;
  sdkConnected: boolean;
  webPlayerDeviceId: string | null;
  webPlayerReady: boolean;
  activeDeviceId: string | null;
  currentTrackUri: string | null;
  currentTrackName: string | null;
  lastCommandStatus: { code?: number; message: string; timestamp: number; uris?: string[] } | null;
  lastError: { code?: number | string; message: string; timestamp: number } | null;
  playbackMode: PlaybackMode;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  realPlaybackWorking: boolean;
  verdict: 'WORKING' | 'NOT WORKING';
  verdictReason: string;
}

type PlaybackListener = (state: PlaybackState) => void;

export class AudioPlayerService {
  private static instance: AudioPlayerService;
  private audioEl: HTMLAudioElement;
  private webPlayer: any = null;
  private webPlayerDeviceId: string | null = null;
  private webPlayerReady = false;
  private sdkScriptLoaded = false;
  private sdkInitialized = false;
  private sdkConnected = false;
  private currentTrack: SpotifyTrack | null = null;
  private isPlaying = false;
  private progressMs = 0;
  private durationMs = 0;
  private volume = 0.8;
  private playbackMode: PlaybackMode = 'idle';
  private playbackNotice: string | null = null;
  private lastCommandStatus: { code?: number; message: string; timestamp: number; uris?: string[] } | null = null;
  private lastError: { code?: number | string; message: string; timestamp: number } | null = null;
  private listeners: Set<PlaybackListener> = new Set();
  private currentUser: SpotifyUser | null = null;
  private activeExternalDeviceId: string | null = null;
  private syncPollInterval: any = null;

  private constructor() {
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';

    // Official 30-sec preview audio element events
    this.audioEl.addEventListener('timeupdate', () => {
      if (this.playbackMode === 'preview' && this.audioEl.duration) {
        this.progressMs = Math.round(this.audioEl.currentTime * 1000);
        this.durationMs = Math.round(this.audioEl.duration * 1000);
        this.notify();
      }
    });

    this.audioEl.addEventListener('ended', () => {
      if (this.playbackMode === 'preview') {
        this.isPlaying = false;
        this.progressMs = 0;
        this.playbackNotice = 'Official preview playback finished.';
        this.notify();
      }
    });

    this.audioEl.addEventListener('play', () => {
      if (this.playbackMode === 'preview') {
        this.isPlaying = true;
        this.notify();
      }
    });

    this.audioEl.addEventListener('pause', () => {
      if (this.playbackMode === 'preview') {
        this.isPlaying = false;
        this.notify();
      }
    });

    this.checkSdkScriptLoaded();
    this.initSdkIfAvailable();
  }

  static getInstance(): AudioPlayerService {
    if (!AudioPlayerService.instance) {
      AudioPlayerService.instance = new AudioPlayerService();
    }
    return AudioPlayerService.instance;
  }

  public setUser(user: SpotifyUser | null): void {
    this.currentUser = user;
  }

  public setActiveExternalDeviceId(deviceId: string | null): void {
    this.activeExternalDeviceId = deviceId;
  }

  private checkSdkScriptLoaded(): void {
    if ((window as any).Spotify) {
      this.sdkScriptLoaded = true;
    } else {
      // Look for script tag
      const script = document.querySelector('script[src*="sdk.scdn.co/spotify-player.js"]');
      if (script) {
        this.sdkScriptLoaded = true;
      }
    }
  }

  public initSdkIfAvailable(): void {
    this.checkSdkScriptLoaded();
    const token = SpotifyAuthService.getAccessToken();
    if (!token) return;

    if ((window as any).Spotify && !this.webPlayer) {
      this.setupSpotifyPlayer(token);
    } else {
      // Attach Spotify ready hook
      const previousHook = (window as any).onSpotifyWebPlaybackSDKReady;
      (window as any).onSpotifyWebPlaybackSDKReady = () => {
        if (typeof previousHook === 'function') previousHook();
        this.sdkScriptLoaded = true;
        const freshToken = SpotifyAuthService.getAccessToken();
        if (freshToken) this.setupSpotifyPlayer(freshToken);
      };
    }
  }

  private setupSpotifyPlayer(token: string): void {
    try {
      this.sdkInitialized = true;
      const player = new (window as any).Spotify.Player({
        name: 'Soundscape Web Player',
        getOAuthToken: (cb: (t: string) => void) => {
          const curToken = SpotifyAuthService.getAccessToken() || token;
          cb(curToken);
        },
        volume: this.volume
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('[Spotify Web Playback SDK] Device ready:', device_id);
        this.webPlayerDeviceId = device_id;
        this.webPlayerReady = true;
        this.sdkConnected = true;
        this.notify();
      });

      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.warn('[Spotify Web Playback SDK] Device went offline:', device_id);
        this.webPlayerReady = false;
        this.notify();
      });

      player.addListener('player_state_changed', (state: any) => {
        if (!state) {
          return;
        }

        const current = state.track_window?.current_track;
        if (current) {
          this.currentTrack = {
            id: current.id,
            uri: current.uri,
            name: current.name,
            artists: current.artists.map((a: any) => ({ name: a.name, id: a.uri })),
            album: {
              name: current.album?.name || '',
              images: current.album?.images || []
            },
            duration_ms: state.duration,
            preview_url: null,
            explicit: false
          };
          this.durationMs = state.duration;
          this.progressMs = state.position;
        }

        this.isPlaying = !state.paused;
        this.playbackMode = 'sdk';
        this.playbackNotice = null;
        this.notify();
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.warn('[Spotify Web Playback SDK] Account error:', message);
        this.lastError = {
          code: 403,
          message: `Spotify Web Playback SDK requires a Spotify Premium account: ${message}`,
          timestamp: Date.now()
        };
        this.notify();
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.warn('[Spotify Web Playback SDK] Authentication error:', message);
        this.lastError = {
          code: 401,
          message: `Spotify authentication error: ${message}`,
          timestamp: Date.now()
        };
        SpotifyAuthService.refreshToken();
        this.notify();
      });

      player.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('[Spotify Web Playback SDK] Initialization error:', message);
        this.lastError = {
          code: 'INIT_ERROR',
          message: `Web Playback SDK initialization error: ${message}`,
          timestamp: Date.now()
        };
        this.notify();
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.warn('[Spotify Web Playback SDK] Playback error:', message);
        this.lastError = {
          code: 'PLAYBACK_ERROR',
          message: `Playback stream error: ${message}`,
          timestamp: Date.now()
        };
        this.notify();
      });

      player.connect().then((connected: boolean) => {
        this.sdkConnected = connected;
      }).catch((err: any) => {
        console.warn('[Spotify Web Playback SDK] connect() failed:', err);
      });

      this.webPlayer = player;
    } catch (e: any) {
      console.warn('[Spotify Web Playback SDK] setup error:', e);
      this.lastError = {
        code: 'SETUP_EXCEPTION',
        message: e?.message || 'Failed to setup Spotify Web Playback SDK',
        timestamp: Date.now()
      };
    }
  }

  public subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): PlaybackState {
    return {
      track: this.currentTrack,
      isPlaying: this.isPlaying,
      progressMs: this.progressMs,
      durationMs: this.durationMs,
      volume: this.volume,
      playbackMode: this.playbackMode,
      playbackNotice: this.playbackNotice,
      lastError: this.lastError
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }

  /**
   * PRIMARY PLAYBACK ENTRY POINT:
   * Strictly attempts REAL SPOTIFY PLAYBACK.
   * Never synthesizes fake tones, beeps, or waveforms.
   */
  public async playTrack(track: SpotifyTrack, playlistUri?: string): Promise<{ success: boolean; mode: PlaybackMode; error?: string }> {
    this.currentTrack = track;
    this.durationMs = track.duration_ms || 180000;
    this.progressMs = 0;
    this.lastError = null;
    this.playbackNotice = null;

    // Check if user is authenticated
    const token = SpotifyAuthService.getAccessToken();
    if (!token) {
      const msg = 'Spotify account not connected. Please connect your Spotify account to enable real playback.';
      this.isPlaying = false;
      this.playbackMode = 'idle';
      this.lastError = { code: 401, message: msg, timestamp: Date.now() };
      this.notify();
      return { success: false, mode: 'idle', error: msg };
    }

    // Try unlocking browser media audio context on user interaction
    if (this.webPlayer && typeof this.webPlayer.activateElement === 'function') {
      try {
        await this.webPlayer.activateElement();
      } catch {}
    }

    // Validate track URI
    const trackUri = track.uri && track.uri.startsWith('spotify:track:') ? track.uri : `spotify:track:${track.id}`;

    // Target device priority:
    // 1. Web Player Device ID (Soundscape Web Player in browser)
    // 2. Active external Spotify Connect device
    const targetDeviceId = this.webPlayerDeviceId || this.activeExternalDeviceId || undefined;

    // 1. Send real playback command to Spotify Web API
    const playbackOptions: any = {
      uris: [trackUri]
    };
    if (targetDeviceId) {
      playbackOptions.device_id = targetDeviceId;
    }

    const res: PlaybackApiResponse = await SpotifyApiClient.startPlayback(playbackOptions);

    this.lastCommandStatus = {
      code: res.status,
      message: res.message || (res.success ? 'Playback command accepted' : 'Playback command failed'),
      timestamp: Date.now(),
      uris: [trackUri]
    };

    if (res.success) {
      // Real Spotify playback command accepted!
      this.isPlaying = true;
      this.playbackMode = this.webPlayerDeviceId ? 'sdk' : 'connect';
      this.playbackNotice = this.webPlayerDeviceId 
        ? 'Streaming real Spotify audio via Web Playback SDK'
        : 'Playing on connected Spotify device via Spotify Connect';
      this.notify();
      return { success: true, mode: this.playbackMode };
    }

    // 2. Playback command rejected by Spotify
    console.warn(`[Playback Engine] Spotify playback rejected (${res.status}):`, res.message);

    // Analyze rejection reason
    const isPremiumError = res.status === 403 || 
      (res.message && res.message.toLowerCase().includes('premium')) ||
      (this.currentUser && this.currentUser.product === 'free');

    const isNoDeviceError = res.status === 404 || 
      (res.message && res.message.toLowerCase().includes('device'));

    // Check if an official 30-second preview MP3 is provided by Spotify
    const officialPreviewUrl = track.preview_url || track.audio_url;

    if (isPremiumError) {
      this.lastError = {
        code: 403,
        message: 'Spotify Web Playback SDK requires a Spotify Premium subscription according to official Spotify API terms.',
        timestamp: Date.now()
      };

      if (officialPreviewUrl) {
        // Fall back ONLY to the official 30-second Spotify preview MP3, clearly labelled
        try {
          this.audioEl.src = officialPreviewUrl;
          this.audioEl.volume = this.volume;
          await this.audioEl.play();
          this.isPlaying = true;
          this.playbackMode = 'preview';
          this.playbackNotice = 'Playing official 30-second Spotify preview (Free account limited in Web SDK).';
          this.notify();
          return { success: true, mode: 'preview' };
        } catch (e: any) {
          console.warn('Failed to play official preview:', e);
        }
      }

      // No fake fallback! Explicitly report playback could not start
      this.isPlaying = false;
      this.playbackMode = 'idle';
      this.playbackNotice = 'Cannot play track: Spotify Web Playback SDK requires Spotify Premium, and no official 30s preview is available for this song.';
      this.notify();
      return {
        success: false,
        mode: 'idle',
        error: 'Spotify Web Playback SDK requires Spotify Premium. No official preview available.'
      };
    }

    if (isNoDeviceError) {
      this.lastError = {
        code: 404,
        message: 'No active Spotify playback device found. Please wait for Soundscape Web Player to register or open Spotify on desktop/mobile.',
        timestamp: Date.now()
      };

      if (officialPreviewUrl) {
        try {
          this.audioEl.src = officialPreviewUrl;
          this.audioEl.volume = this.volume;
          await this.audioEl.play();
          this.isPlaying = true;
          this.playbackMode = 'preview';
          this.playbackNotice = 'Playing official 30-second preview while device initializes.';
          this.notify();
          return { success: true, mode: 'preview' };
        } catch {}
      }

      this.isPlaying = false;
      this.playbackMode = 'idle';
      this.notify();
      return {
        success: false,
        mode: 'idle',
        error: 'No active playback device ready.'
      };
    }

    // Other API errors
    this.lastError = {
      code: res.status,
      message: res.message || 'Spotify playback rejected request',
      timestamp: Date.now()
    };
    this.isPlaying = false;
    this.playbackMode = 'idle';
    this.notify();
    return { success: false, mode: 'idle', error: res.message };
  }

  public async togglePlay(): Promise<void> {
    if (!this.currentTrack) return;
    if (this.isPlaying) {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  public async pause(): Promise<void> {
    this.isPlaying = false;

    if (this.playbackMode === 'preview') {
      if (this.audioEl.src && !this.audioEl.paused) {
        this.audioEl.pause();
      }
    } else if (this.playbackMode === 'sdk' && this.webPlayer) {
      this.webPlayer.pause().catch(() => {});
    } else {
      // Send Spotify API pause command
      SpotifyApiClient.pausePlayback(this.webPlayerDeviceId || this.activeExternalDeviceId || undefined).catch(() => {});
    }

    this.notify();
  }

  public async resume(): Promise<void> {
    if (!this.currentTrack) return;

    if (this.playbackMode === 'preview') {
      if (this.audioEl.src) {
        try {
          await this.audioEl.play();
          this.isPlaying = true;
          this.notify();
          return;
        } catch {}
      }
    }

    if (this.playbackMode === 'sdk' && this.webPlayer) {
      this.webPlayer.resume().then(() => {
        this.isPlaying = true;
        this.notify();
      }).catch(() => {
        // Fallback to API call
        this.playTrack(this.currentTrack!);
      });
      return;
    }

    // Attempt API resume or playTrack
    await this.playTrack(this.currentTrack);
  }

  public seek(positionMs: number): void {
    this.progressMs = Math.max(0, Math.min(this.durationMs, positionMs));

    if (this.playbackMode === 'preview') {
      if (this.audioEl.src && this.audioEl.duration) {
        this.audioEl.currentTime = positionMs / 1000;
      }
    } else if (this.webPlayer && this.playbackMode === 'sdk') {
      this.webPlayer.seek(positionMs).catch(() => {});
    } else {
      SpotifyApiClient.seek(positionMs, this.webPlayerDeviceId || this.activeExternalDeviceId || undefined).catch(() => {});
    }

    this.notify();
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audioEl.volume = this.volume;

    if (this.webPlayer) {
      this.webPlayer.setVolume(this.volume).catch(() => {});
    }

    if (this.activeExternalDeviceId) {
      SpotifyApiClient.setVolume(Math.round(this.volume * 100), this.activeExternalDeviceId).catch(() => {});
    }

    this.notify();
  }

  public getDeviceId(): string | null {
    return this.webPlayerDeviceId;
  }

  public isWebPlayerReady(): boolean {
    return this.webPlayerReady;
  }

  public getPlaybackMode(): PlaybackMode {
    return this.playbackMode;
  }

  public getLastError(): { code?: number | string; message: string; timestamp: number } | null {
    return this.lastError;
  }

  public getLastCommandStatus(): { code?: number; message: string; timestamp: number; uris?: string[] } | null {
    return this.lastCommandStatus;
  }

  /**
   * Diagnostic Snapshot for the Diagnostics Panel
   */
  public getDiagnostics(): PlaybackDiagnostics {
    const isAuth = SpotifyAuthService.isAuthenticated();
    const token = SpotifyAuthService.getAccessToken();
    const tokenExp = SpotifyAuthService.getTokenExpirationDetails();
    const scopes = SpotifyAuthService.getScopes();

    const isPremium = this.currentUser?.product === 'premium';
    const isRealPlayback = (this.playbackMode === 'sdk' || this.playbackMode === 'connect') && this.isPlaying;

    let verdict: 'WORKING' | 'NOT WORKING' = 'NOT WORKING';
    let verdictReason = 'Playback is idle. Press play on any track to start.';

    if (!isAuth) {
      verdictReason = 'Spotify account is not connected. OAuth authorization required.';
    } else if (tokenExp.isExpired) {
      verdictReason = 'Spotify access token has expired and requires refresh.';
    } else if (!isPremium && this.playbackMode !== 'preview') {
      verdictReason = 'Account tier is Free. Spotify Web Playback SDK strictly requires Spotify Premium.';
    } else if (isRealPlayback) {
      verdict = 'WORKING';
      verdictReason = `Real Spotify audio is streaming on ${
        this.playbackMode === 'sdk' ? 'Soundscape Web Player (Web Playback SDK)' : 'Spotify Connect device'
      }.`;
    } else if (this.playbackMode === 'preview' && this.isPlaying) {
      verdict = 'WORKING';
      verdictReason = 'Playing official 30-second Spotify preview MP3.';
    } else if (this.lastError) {
      verdictReason = this.lastError.message;
    }

    return {
      isAuthenticated: isAuth,
      user: this.currentUser,
      accountProduct: this.currentUser?.product || null,
      tokenValid: !!token && !tokenExp.isExpired,
      tokenExpiresInMs: tokenExp.expiresInMs,
      scopes,
      sdkScriptLoaded: this.sdkScriptLoaded,
      sdkInitialized: this.sdkInitialized,
      sdkConnected: this.sdkConnected,
      webPlayerDeviceId: this.webPlayerDeviceId,
      webPlayerReady: this.webPlayerReady,
      activeDeviceId: this.activeExternalDeviceId,
      currentTrackUri: this.currentTrack?.uri || null,
      currentTrackName: this.currentTrack ? `${this.currentTrack.name} - ${this.currentTrack.artists.map(a => a.name).join(', ')}` : null,
      lastCommandStatus: this.lastCommandStatus,
      lastError: this.lastError,
      playbackMode: this.playbackMode,
      isPlaying: this.isPlaying,
      progressMs: this.progressMs,
      durationMs: this.durationMs,
      realPlaybackWorking: isRealPlayback,
      verdict,
      verdictReason
    };
  }
}
