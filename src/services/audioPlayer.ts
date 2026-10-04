import { SpotifyTrack, SpotifyDevice, SpotifyUser } from '../types';
import { SpotifyAuthService } from './spotifyAuth';
import { SpotifyApiClient, PlaybackApiResponse } from './spotifyApi';
import { PlayerController } from '../core/playback/PlayerController';
import { recordPlaybackStart, recordPlaybackEnd } from '../core/stats/listeningEvents';
import { db } from '../core/db/database';

export type PlaybackMode = 'sdk' | 'connect' | 'audius' | 'jamendo' | 'archive' | 'radio' | 'local' | 'idle';

export interface OpenTrackMeta {
  name: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number;
  url: string;
  trackUri: string;
  trackId: string;
  mode: 'audius' | 'jamendo' | 'archive' | 'radio' | 'local';
  notice: string;
}

const OPEN_MODE_LABEL: Record<OpenTrackMeta['mode'], string> = {
  audius: 'Audius',
  jamendo: 'Jamendo',
  archive: 'Internet Archive',
  radio: 'live radio',
  local: 'this device'
};

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
  controllerPhase: string;
  commandLadder: string[];
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

  // M5 truthfulness: sole phase machine + confirmation machinery.
  private controller = new PlayerController();
  private onTrackEnded: (() => void) | null = null;
  private onNextRequested: (() => void) | null = null;
  private onPrevRequested: (() => void) | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private statePollTimer: ReturnType<typeof setInterval> | null = null;
  private playStartWall = 0;
  private playStartPositionMs = 0;
  private statsOpen = false;
  private localObjectUrl: string | null = null;

  // Local-file DSP chain (WebAudio). Spotify streams NEVER route through this.
  private dsp: {
    ctx: AudioContext;
    low: BiquadFilterNode;
    mid: BiquadFilterNode;
    high: BiquadFilterNode;
    norm: GainNode;
    limiter: DynamicsCompressorNode;
  } | null = null;
  private eqGains = { low: 0, mid: 0, high: 0 };
  private normalizationOn = false;

  private constructor() {
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.loadAudioPrefs();

    // Open catalogue + user-owned local files share the element path.
    // Real element events drive state — nothing is simulated.
    this.audioEl.addEventListener('timeupdate', () => {
      if (this.isElementMode() && this.audioEl.duration) {
        this.progressMs = Math.round(this.audioEl.currentTime * 1000);
        this.durationMs = Math.round(this.audioEl.duration * 1000);
        this.notify();
      }
    });

    this.audioEl.addEventListener('loadedmetadata', () => {
      if (this.isElementMode() && this.audioEl.duration) {
        this.durationMs = Math.round(this.audioEl.duration * 1000);
        if (this.currentTrack) this.currentTrack = { ...this.currentTrack, duration_ms: this.durationMs };
        this.notify();
      }
    });

    // Buffering signals (element path): honest loading state, never fake progress.
    this.audioEl.addEventListener('waiting', () => {
      if (this.isElementMode() && this.isPlaying) {
        this.playbackNotice = 'Buffering…';
        this.notify();
      }
    });
    const clearBuffering = () => {
      if (this.playbackNotice === 'Buffering…') {
        this.playbackNotice = null;
        this.notify();
      }
    };
    this.audioEl.addEventListener('playing', clearBuffering);
    this.audioEl.addEventListener('canplay', clearBuffering);

    this.audioEl.addEventListener('ended', () => {
      if (this.isElementMode()) {
        this.isPlaying = false;
        this.progressMs = 0;
        this.playbackNotice = this.playbackMode === 'local'
          ? 'Local file finished.'
          : 'Track finished.';
        this.closeStats(true);
        this.notify();
        this.onTrackEnded?.();
      }
    });

    this.audioEl.addEventListener('play', () => {
      if (this.isElementMode()) {
        this.isPlaying = true;
        this.controller.reportPlayback(false, Math.round(this.audioEl.currentTime * 1000), this.durationMs);
        if (!this.statsOpen && this.currentTrack) {
          this.statsOpen = true;
          this.playStartWall = Date.now();
          this.playStartPositionMs = Math.round(this.audioEl.currentTime * 1000);
          recordPlaybackStart({
            trackUri: this.currentTrack.uri,
            startedAt: Date.now(),
            durationMs: this.durationMs,
            contextUri: null,
            provider: this.playbackMode === 'idle' ? 'unknown' : this.playbackMode
          });
        }
        this.notify();
      }
    });

    this.audioEl.addEventListener('pause', () => {
      if (this.isElementMode()) {
        this.isPlaying = false;
        this.controller.reportPlayback(true, Math.round(this.audioEl.currentTime * 1000), this.durationMs);
        this.closeStats(false);
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

  public getController(): PlayerController {
    return this.controller;
  }
  public setOnTrackEnded(cb: (() => void) | null): void {
    this.onTrackEnded = cb;
  }

  public setOnNextRequested(cb: (() => void) | null): void {
    this.onNextRequested = cb;
  }

  public setOnPrevRequested(cb: (() => void) | null): void {
    this.onPrevRequested = cb;
  }

  private isElementMode(): boolean {
    return (
      this.playbackMode === 'local' ||
      this.playbackMode === 'audius' ||
      this.playbackMode === 'jamendo' ||
      this.playbackMode === 'archive' ||
      this.playbackMode === 'radio'
    );
  }

  /** Lazily build the local-file DSP graph (first user-gestured playback). Flat by default. */
  private ensureDsp(): void {
    if (this.dsp) {
      if (this.dsp.ctx.state === 'suspended') void this.dsp.ctx.resume();
      return;
    }
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return; // No WebAudio: local files still play dry through the element.
    const ctx = new Ctx();
    const src = ctx.createMediaElementSource(this.audioEl);
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 250;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 4000;
    const norm = ctx.createGain();
    norm.gain.value = 1;
    src.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(norm);
    norm.connect(ctx.destination);
    this.dsp = { ctx, low, mid, high, norm };
    this.applyEq();
  }

  private applyEq(): void {
    if (!this.dsp) return;
    const t = this.dsp.ctx.currentTime;
    this.dsp.low.gain.setTargetAtTime(this.eqGains.low, t, 0.05);
    this.dsp.mid.gain.setTargetAtTime(this.eqGains.mid, t, 0.05);
    this.dsp.high.gain.setTargetAtTime(this.eqGains.high, t, 0.05);
  }

  public setEq(band: 'low' | 'mid' | 'high', db: number): void {
    this.eqGains[band] = Math.max(-12, Math.min(12, db));
    this.applyEq();
    try {
      localStorage.setItem('soundscape_eq', JSON.stringify(this.eqGains));
    } catch {}
  }

  public getEq(): { low: number; mid: number; high: number } {
    return { ...this.eqGains };
  }

  public setNormalization(on: boolean): void {
    this.normalizationOn = on;
    try {
      localStorage.setItem('soundscape_norm', on ? '1' : '0');
    } catch {}
    if (!on && this.dsp) this.dsp.norm.gain.setTargetAtTime(1, this.dsp.ctx.currentTime, 0.05);
  }

  public isNormalizationOn(): boolean {
    return this.normalizationOn;
  }

  public loadAudioPrefs(): void {
    try {
      const eq = localStorage.getItem('soundscape_eq');
      if (eq) {
        const p = JSON.parse(eq) as Partial<Record<'low' | 'mid' | 'high', number>>;
        for (const b of ['low', 'mid', 'high'] as const) {
          if (typeof p[b] === 'number') this.eqGains[b] = Math.max(-12, Math.min(12, p[b] as number));
        }
      }
      this.normalizationOn = localStorage.getItem('soundscape_norm') === '1';
    } catch {}
  }

  /** Measure file loudness (RMS) and set a corrective gain. Real analysis, no guessing. */
  private async analyzeAndNormalize(url: string): Promise<void> {
    if (!this.normalizationOn) return;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const Ctx: typeof OfflineAudioContext | undefined =
        window.OfflineAudioContext ??
        (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      if (!Ctx) return;
      const sampleLen = 44100 * 30; // analyze up to ~30s mono-mix worth of frames
      const off = new Ctx(1, sampleLen, 44100);
      const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
        // Copy: decodeAudioData detaches in some browsers.
        off.decodeAudioData(buf.slice(0), resolve, reject);
      });
      const ch = decoded.getChannelData(0);
      let sum = 0;
      const step = Math.max(1, Math.floor(ch.length / 200000));
      let n = 0;
      for (let i = 0; i < ch.length; i += step) {
        sum += ch[i] * ch[i];
        n += 1;
      }
      const rms = Math.sqrt(sum / Math.max(1, n));
      if (rms > 0.001 && this.dsp) {
        const gain = Math.max(0.25, Math.min(4, 0.18 / rms));
        this.dsp.norm.gain.setTargetAtTime(gain, this.dsp.ctx.currentTime, 0.1);
      }
    } catch {
      // Analysis failed: play at unity gain rather than guessing.
    }
  }

  /**
   * Shared element playback for everything that is NOT Spotify:
   * local files + open-catalogue streams (Audius/Jamendo/Archive) + live radio.
   * Real <audio> playback with EQ/DSP where available. Spotify streams NEVER route here.
   */
  private async startElementPlayback(meta: OpenTrackMeta, ownBlobUrl?: string): Promise<{ success: boolean; mode: PlaybackMode; error?: string }> {
    this.clearTimers();
    this.closeStats(false);
    if (this.localObjectUrl && this.localObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.localObjectUrl);
      this.localObjectUrl = null;
    }
    // Stop any Spotify playback first (best-effort).
    try {
      if (this.playbackMode === 'sdk' && this.webPlayer) await this.webPlayer.pause();
      else if (this.playbackMode === 'connect') await SpotifyApiClient.pausePlayback(undefined);
    } catch {}
    this.audioEl.pause();
    this.audioEl.src = meta.url;
    if (ownBlobUrl) this.localObjectUrl = ownBlobUrl;
    this.audioEl.volume = this.volume;
    this.ensureDsp();

    this.currentTrack = {
      id: meta.trackId,
      uri: meta.trackUri,
      name: meta.name,
      artists: [{ name: meta.artist }],
      album: { name: OPEN_MODE_LABEL[meta.mode], images: meta.imageUrl ? [{ url: meta.imageUrl }] : [] },
      duration_ms: meta.durationMs,
      preview_url: null,
      explicit: false
    };
    this.durationMs = meta.durationMs;
    this.progressMs = 0;
    this.lastError = null;
    this.playbackMode = meta.mode;
    this.playbackNotice = meta.notice;
    this.controller.commandSent('play', meta.trackUri);
    // Persist open-catalogue metadata so stats/library can resolve real names later.
    if (this.currentTrack) {
      const ct = this.currentTrack;
      void db
        .putTrack({
          uri: ct.uri,
          provider: meta.mode,
          name: ct.name,
          albumUri: null,
          durationMs: ct.duration_ms,
          explicit: false,
          artistsJson: JSON.stringify(ct.artists.map((a) => ({ name: a.name }))),
          imageUrl: ct.album?.images?.[0]?.url ?? null,
          updatedAt: Date.now()
        })
        .catch(() => {});
    }
    this.setupMediaSession(this.currentTrack);
    try {
      await this.audioEl.play();
      this.controller.commandAccepted(this.controller.snapshot().cmd?.id ?? '');
      this.notify();
      return { success: true, mode: meta.mode };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not play this stream';
      this.isPlaying = false;
      this.playbackMode = 'idle';
      this.lastError = { code: 'OPEN_PLAY_FAILED', message: msg, timestamp: Date.now() };
      this.controller.reportError('OPEN_PLAY_FAILED', msg);
      this.notify();
      return { success: false, mode: 'idle', error: msg };
    }
  }

  /**
   * Play a user-owned local audio file (File API / same-origin URL).
   * Real <audio> playback — EQ/normalization apply (local DSP chain).
   */
  public async playLocalFile(input: { name: string; url: string; type?: string }): Promise<{ success: boolean; mode: PlaybackMode; error?: string }> {
    const base = input.name.replace(/\.[a-z0-9]+$/i, '');
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'file';
    if (!this.normalizationOn && this.dsp) {
      this.dsp.norm.gain.setTargetAtTime(1, this.dsp.ctx.currentTime, 0.05);
    } else if (this.normalizationOn) {
      void this.analyzeAndNormalize(input.url);
    }
    return this.startElementPlayback(
      {
        name: base,
        artist: 'Local file',
        imageUrl: null,
        durationMs: 0,
        url: input.url,
        trackUri: `local:${slug}`,
        trackId: `local-${slug}`,
        mode: 'local',
        notice: 'Playing a file from this device. Spotify EQ/DSP does not apply.'
      },
      input.url.startsWith('blob:') ? input.url : undefined
    );
  }

  /**
   * Play a full-length open-catalogue stream (Audius/Jamendo/Archive) or live radio.
   * The URL must come from the provider's official stream endpoint — never scraped.
   */
  public async playOpenTrack(meta: OpenTrackMeta): Promise<{ success: boolean; mode: PlaybackMode; error?: string }> {
    if (!/^https:\/\//.test(meta.url)) {
      return { success: false, mode: 'idle', error: 'Refusing non-HTTPS stream URL.' };
    }
    return this.startElementPlayback(meta);
  }

  private setupMediaSession(track: SpotifyTrack): void {
    try {
      const ms = navigator.mediaSession;
      if (!ms) return;
      ms.metadata = new MediaMetadata({
        title: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album?.name || '',
        artwork: (track.album?.images || []).map((i) => ({ src: i.url })).filter((a) => !!a.src)
      });
      ms.setActionHandler('play', () => void this.resume());
      ms.setActionHandler('pause', () => void this.pause());
      ms.setActionHandler('previoustrack', () => this.onPrevRequested?.());
      ms.setActionHandler('nexttrack', () => this.onNextRequested?.());
      ms.setActionHandler('seekto', (d) => {
        if (typeof d.seekTime === 'number') this.seek(Math.round(d.seekTime * 1000));
      });
    } catch {
      // MediaSession unavailable (older browsers) — player still works.
    }
  }

  private clearTimers(): void {
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
    if (this.statePollTimer) {
      clearInterval(this.statePollTimer);
      this.statePollTimer = null;
    }
  }

  private closeStats(completed: boolean): void {
    if (!this.statsOpen) return;
    this.statsOpen = false;
    const playedMs = this.progressMs - this.playStartPositionMs + (Date.now() - this.playStartWall);
    void recordPlaybackEnd(Math.max(0, Math.round(playedMs)), completed);
  }

  /** Mark real, confirmed playback. The ONLY place Spotify isPlaying becomes true. */
  private confirmRealPlayback(mode: 'sdk' | 'connect', positionMs: number, durationMs: number): void {
    this.clearTimers();
    this.isPlaying = true;
    this.playbackMode = mode;
    this.progressMs = positionMs;
    if (durationMs) this.durationMs = durationMs;
    this.playbackNotice =
      mode === 'sdk'
        ? 'Streaming real Spotify audio via Web Playback SDK'
        : 'Playing on connected Spotify device via Spotify Connect';
    this.controller.reportPlayback(false, positionMs, this.durationMs);
    this.playStartWall = Date.now();
    this.playStartPositionMs = positionMs;
    if (!this.statsOpen && this.currentTrack) {
      this.statsOpen = true;
      recordPlaybackStart({
        trackUri: this.currentTrack.uri,
        startedAt: Date.now(),
        durationMs: this.durationMs,
        contextUri: null,
        provider: 'spotify'
      });
    }
    try {
      if (navigator.mediaSession) void navigator.mediaSession.setPositionState?.();
    } catch {}
    this.notify();
    // Keep polling Connect-device state for progress + end detection.
    if (mode === 'connect') this.startConnectPolling();
  }

  /** Single verification read after a play command. Returns true when real playback confirmed. */
  private async verifyPlaybackOnce(expectedUri: string): Promise<boolean> {
    try {
      const st = await SpotifyApiClient.getPlaybackState();
      const item = st?.item as { uri?: string; duration_ms?: number } | null;
      if (st?.is_playing && item?.uri === expectedUri) {
        this.confirmRealPlayback(this.webPlayerDeviceId ? 'sdk' : 'connect', st.progress_ms ?? 0, this.durationMs);
        return true;
      }
      if (!st?.is_playing && this.controller.snapshot().phase === 'loading') {
        this.playbackNotice = 'Spotify accepted the command but no audio confirmed yet…';
        this.notify();
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Poll /me/player to confirm + track progress on non-SDK devices. */
  private startConnectPolling(): void {
    if (this.statePollTimer) return;
    this.statePollTimer = setInterval(() => void this.pollConnectState(), 5000);
  }

  private async pollConnectState(): Promise<void> {
    if (!this.currentTrack || (this.playbackMode !== 'connect' && this.playbackMode !== 'sdk')) return;
    try {
      const st = await SpotifyApiClient.getPlaybackState();
      if (!st) return;
      const item = st.item as { uri?: string; duration_ms?: number } | null;
      if (item?.uri && this.currentTrack && item.uri !== this.currentTrack.uri) return; // something else is playing
      this.progressMs = typeof st.progress_ms === 'number' ? st.progress_ms : this.progressMs;
      this.controller.reportPlayback(!st.is_playing, this.progressMs, this.durationMs);
      try {
        navigator.mediaSession?.setPositionState?.({
          duration: this.durationMs / 1000,
          playbackRate: st.is_playing ? 1 : 0,
          position: Math.min(this.progressMs, this.durationMs) / 1000
        });
      } catch {}
      if (!st.is_playing && this.isPlaying) {
        // Paused elsewhere or track ended.
        if (this.progressMs >= this.durationMs - 1000 && this.durationMs > 0) {
          this.handleTrackEnded(true);
        } else {
          this.closeStats(false);
          this.isPlaying = false;
          this.notify();
        }
      } else if (st.is_playing && !this.isPlaying) {
        this.confirmRealPlayback('connect', this.progressMs, this.durationMs);
      } else if (st.is_playing && this.progressMs >= this.durationMs - 250 && this.durationMs > 30000) {
        this.handleTrackEnded(true);
      } else {
        this.notify();
      }
    } catch {
      // Transient network failure: keep last known state, don't fake anything.
    }
  }

  private handleTrackEnded(completed: boolean): void {
    this.closeStats(completed);
    this.clearTimers();
    this.isPlaying = false;
    this.controller.reportEnded();
    this.notify();
    this.onTrackEnded?.();
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
    }
    // Late SDK arrival is handled by the module-level onSpotifyWebPlaybackSDKReady
    // hook installed below (chains any pre-existing hook, e.g. from index.html).
  }

  /** Called when the Spotify SDK script reports ready (even pre-login). */
  public handleSdkScriptReady(): void {
    this.sdkScriptLoaded = true;
    this.initSdkIfAvailable();
    this.notify();
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
        const prevIds: string[] = Array.isArray(state.track_window?.previous_tracks)
          ? state.track_window.previous_tracks.map((t: any) => String(t?.id ?? ''))
          : [];
        if (current) {
          const cid = String(current.id ?? '');
          // Track changed under us: close previous stats, open on confirm below.
          if (this.currentTrack && this.currentTrack.id !== cid && this.statsOpen) {
            this.closeStats(false);
          }
          this.currentTrack = {
            id: cid,
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

        const paused = !!state.paused;
        this.controller.reportPlayback(paused, state.position, state.duration);

        // End detection: previous_tracks contains current AND paused at 0, or position at end.
        const ended =
          (current &&
            prevIds.includes(String(current.id ?? '')) &&
            paused &&
            (state.position || 0) < 1500) ||
          (state.duration > 30000 && state.position >= state.duration - 500);

        if (ended) {
          this.playbackMode = 'sdk';
          this.handleTrackEnded(true);
          return;
        }

        if (!paused) {
          // Real SDK playback confirmed (not an HTTP accept — actual audio state).
          if (this.currentTrack) this.setupMediaSession(this.currentTrack);
          this.confirmRealPlayback('sdk', state.position, state.duration);
        } else {
          if (this.isPlaying) {
            this.closeStats(false);
            this.isPlaying = false;
            this.playbackNotice = null;
            this.notify();
          } else {
            this.progressMs = state.position;
            this.notify();
          }
        }
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
    this.clearTimers();
    this.closeStats(false);
    this.currentTrack = track;
    this.durationMs = track.duration_ms || 180000;
    this.progressMs = 0;
    this.isPlaying = false;
    this.lastError = null;
    this.playbackNotice = null;
    this.setupMediaSession(track);

    // Validate track URI (synthetic AI URIs like spotify:track:ai_* are rejected here)
    const trackUri = track.uri && track.uri.startsWith('spotify:track:') ? track.uri : `spotify:track:${track.id}`;
    if (!/^spotify:track:[A-Za-z0-9]{10,40}$/.test(trackUri)) {
      const msg = 'This item has no real Spotify track URI and cannot be played.';
      this.lastError = { code: 'NO_URI', message: msg, timestamp: Date.now() };
      this.controller.reportError('NO_URI', msg);
      this.notify();
      return { success: false, mode: 'idle', error: msg };
    }
    const cmd = this.controller.commandSent('play', trackUri);
    void playlistUri;

    // Check if user is authenticated
    const token = SpotifyAuthService.getAccessToken();
    if (!token) {
      const msg = 'Spotify account not connected. Please connect your Spotify account to enable real playback.';
      this.isPlaying = false;
      this.playbackMode = 'idle';
      this.lastError = { code: 401, message: msg, timestamp: Date.now() };
      this.controller.reportError('auth_expired', msg);
      this.notify();
      return { success: false, mode: 'idle', error: msg };
    }

    // Try unlocking browser media audio context on user interaction
    if (this.webPlayer && typeof this.webPlayer.activateElement === 'function') {
      try {
        await this.webPlayer.activateElement();
      } catch {}
    }

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
      // Command ACCEPTED by Spotify — not yet real playback.
      // isPlaying flips only when the adapter confirms (SDK event or /me/player poll).
      this.controller.commandAccepted(cmd.id);
      this.playbackNotice = 'Starting playback on Spotify…';
      this.notify();

      const expectSdk = !!this.webPlayerDeviceId;
      if (expectSdk) {
        // SDK confirmation arrives via player_state_changed; safety net polls once.
        this.confirmTimer = setTimeout(() => void this.verifyPlaybackOnce(trackUri), 4000);
        return { success: true, mode: 'sdk' };
      }
      // Connect/unknown device: confirm via polling (1s × 8).
      let attempts = 0;
      const tick = async () => {
        attempts += 1;
        const confirmed = await this.verifyPlaybackOnce(trackUri);
        if (!confirmed && attempts < 8 && this.controller.snapshot().cmd?.id === cmd.id) {
          this.confirmTimer = setTimeout(() => void tick(), 1000);
        }
      };
      void tick();
      return { success: true, mode: 'connect' };
    }

    // 2. Playback command rejected by Spotify
    console.warn(`[Playback Engine] Spotify playback rejected (${res.status}):`, res.message);

    // Analyze rejection reason
    const isPremiumError = res.status === 403 || 
      (res.message && res.message.toLowerCase().includes('premium')) ||
      (this.currentUser && this.currentUser.product === 'free');

    const isNoDeviceError = res.status === 404 || 
      (res.message && res.message.toLowerCase().includes('device'));

    // No preview fallback: 30-second previews are not a playback path in Soundscape.
    // Full-length options: the free catalogue (Audius/Jamendo/Archive search),
    // files from this device, or a Premium Spotify session on a real device.

    if (isPremiumError) {
      this.lastError = {
        code: 403,
        message: 'Spotify needs Premium for in-app playback. Search the free catalogue (Audius/Jamendo) for full-length tracks, or play it on a Spotify device.',
        timestamp: Date.now()
      };
      this.controller.reportError('premium_required', this.lastError.message);

      // Explicitly report playback could not start
      this.isPlaying = false;
      this.playbackMode = 'idle';
      this.playbackNotice = this.lastError.message;
      this.notify();
      return {
        success: false,
        mode: 'idle',
        error: 'Spotify Web Playback SDK requires Spotify Premium. Try the free catalogue instead.'
      };
    }

    if (isNoDeviceError) {
      this.lastError = {
        code: 404,
        message: 'No active Spotify playback device found. Open Spotify on desktop/mobile and pick the device, or play the free catalogue in Soundscape.',
        timestamp: Date.now()
      };
      this.controller.reportError('no_active_device', this.lastError.message);

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
    this.controller.reportError('track_unavailable', this.lastError.message);
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
    this.controller.commandSent('pause', this.currentTrack?.uri ?? null);
    this.closeStats(false);
    this.isPlaying = false;

    if (this.isElementMode()) {
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

    if (this.isElementMode()) {
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
      this.playbackNotice = 'Resuming…';
      this.notify();
      this.webPlayer.resume().catch(() => {
        // Fallback to API call
        void this.playTrack(this.currentTrack!);
      });
      return;
    }

    // Attempt API resume or playTrack
    await this.playTrack(this.currentTrack);
  }

  public seek(positionMs: number): void {
    this.progressMs = Math.max(0, Math.min(this.durationMs, positionMs));

    if (this.isElementMode()) {
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
    const ctrl = this.controller.snapshot();

    const isPremium = this.currentUser?.product === 'premium';
    const isSpotifyPlayback = (this.playbackMode === 'sdk' || this.playbackMode === 'connect') && this.isPlaying;
    const isOpenPlayback =
      (this.playbackMode === 'audius' ||
        this.playbackMode === 'jamendo' ||
        this.playbackMode === 'archive' ||
        this.playbackMode === 'radio' ||
        this.playbackMode === 'local') &&
      this.isPlaying;

    let verdict: 'WORKING' | 'NOT WORKING' = 'NOT WORKING';
    let verdictReason = 'Playback is idle. Press play on any track to start.';

    if (isOpenPlayback) {
      verdict = 'WORKING';
      verdictReason = `Playing full-length audio from ${
        this.playbackMode === 'local' ? 'this device' : this.playbackMode === 'radio' ? 'live radio' : OPEN_MODE_LABEL[this.playbackMode]
      }.`;
    } else if (isSpotifyPlayback) {
      verdict = 'WORKING';
      verdictReason = `Real Spotify audio is streaming on ${
        this.playbackMode === 'sdk' ? 'Soundscape Web Player (Web Playback SDK)' : 'Spotify Connect device'
      }.`;
    } else if (!isAuth && !isOpenPlayback) {
      verdictReason = 'No Spotify session and nothing playing. The free catalogue needs no login — just search and play.';
    } else if (tokenExp.isExpired) {
      verdictReason = 'Spotify access token has expired and requires refresh.';
    } else if (!isPremium) {
      verdictReason = 'Account tier is Free. Spotify in-app playback needs Premium; the free catalogue plays without it.';
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
      realPlaybackWorking: isSpotifyPlayback || isOpenPlayback,
      verdict,
      verdictReason,
      controllerPhase: ctrl.phase,
      commandLadder: ctrl.ladder
    };
  }
}

// Module-level Spotify SDK hook: installed at import time so the SDK's ready
// callback never fires into the void (index.html installs a no-op first; chain it).
if (typeof window !== 'undefined') {
  const w = window as unknown as { onSpotifyWebPlaybackSDKReady?: () => void };
  const prev = w.onSpotifyWebPlaybackSDKReady;
  w.onSpotifyWebPlaybackSDKReady = () => {
    if (typeof prev === 'function') {
      try {
        prev();
      } catch {}
    }
    try {
      AudioPlayerService.getInstance().handleSdkScriptReady();
    } catch {}
  };
}
