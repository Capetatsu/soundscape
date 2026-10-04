import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActiveScreen,
  SpotifyUser,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyArtist,
  SpotifyDevice,
  AudioSettings
} from './types';
import { DEFAULT_CLIENT_ID } from './data/defaultCatalog';
import { SpotifyAuthService } from './services/spotifyAuth';
import { SpotifyApiClient } from './services/spotifyApi';
import { AudioPlayerService } from './services/audioPlayer';
import { audiusStreamUrl } from './core/providers/audius/audiusClient';
import { archiveResolveTracks, archiveToRef, type ArchiveRecording } from './core/providers/archive/archiveClient';
import { jamendoResolveTrack, jamendoQualityLabel } from './core/providers/jamendo/jamendoClient';
import { SyncEngine, type SyncReport } from './core/sync/SyncEngine';
import { db } from './core/db/database';
import { dbPlaylistToUi, dbTrackToUi } from './core/sync/toUi';

import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayerModal } from './components/FullPlayerModal';
import { HomeScreen } from './components/HomeScreen';
import { SearchScreen } from './components/SearchScreen';
import { LibraryScreen } from './components/LibraryScreen';
import { PlaylistDetailScreen } from './components/PlaylistDetailScreen';
import { AlbumDetailScreen } from './components/AlbumDetailScreen';
import { ArtistDetailScreen } from './components/ArtistDetailScreen';
import { AccountSyncScreen } from './components/AccountSyncScreen';
import { AudioSettingsScreen } from './components/AudioSettingsScreen';
import { DeviceConnectModal } from './components/DeviceConnectModal';
import { QueueDrawer } from './components/QueueDrawer';
import { AiDjModal } from './components/AiDjModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { LyricsModal } from './components/LyricsModal';
import { PlaylistPicker } from './components/PlaylistPicker';
import { StatsScreen } from './components/StatsScreen';
import { RadioScreen } from './components/RadioScreen';
import { radioCountClick, type RadioStation } from './core/providers/radio/radioClient';

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ActiveScreen>('home');
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [likedSongs, setLikedSongs] = useState<SpotifyTrack[]>([]);
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [recentTracks, setRecentTracks] = useState<SpotifyTrack[]>([]);
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<SpotifyDevice | null>(null);
  const [clientId, setClientId] = useState<string>(SpotifyAuthService.getClientId() || DEFAULT_CLIENT_ID);

  // Playback state
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [playbackMode, setPlaybackMode] = useState<string>('idle');
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [queue, setQueue] = useState<SpotifyTrack[]>([]);

  // Modals
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isAiDjOpen, setIsAiDjOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [playlistTarget, setPlaylistTarget] = useState<SpotifyTrack | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Real sync state (M4): report with true DB-diff counters + last-sync timestamps.
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Audio Settings
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    streamingQuality: 'very_high',
    streamOnWifiOnly: false,
    downloadQuality: 'very_high',
    downloadCellular: false,
    bitPerfectPassthrough: true,
    volumeNormalization: false
  });

  const audioService = AudioPlayerService.getInstance();

  // Listen to audio player state changes
  useEffect(() => {
    const unsubscribe = audioService.subscribe((state) => {
      if (state.track) setCurrentTrack(state.track);
      setIsPlaying(state.isPlaying);
      setProgressMs(state.progressMs);
      setDurationMs(state.durationMs);
      setVolume(state.volume);
      setPlaybackMode(state.playbackMode);
      setPlaybackNotice(state.playbackNotice || null);
    });
    return () => unsubscribe();
  }, [audioService]);

  // Real library sync via SyncEngine (M4): paged playlists/items/liked,
  // quick-check resync, per-playlist checkpoints, true DB-diff report.
  // The UI renders ONLY what the engine persisted to IndexedDB.
  const syncWithSpotify = useCallback(async () => {
    if (!SpotifyAuthService.isAuthenticated()) return;
    if (!navigator.onLine) {
      setPlaybackNotice('Offline — showing your cached library. Sync is paused until reconnect.');
      await hydrateFromCache();
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      // 1. User Profile
      const me = await SpotifyApiClient.getMe();
      setUser(me);
      audioService.setUser(me);
      try {
        localStorage.setItem('soundscape_user_profile', JSON.stringify(me));
      } catch {}

      const accountId = `spotify:${me.id}`;
      try {
        await db.kvSet('lastAccountId', accountId);
      } catch {}
      const getToken = async (): Promise<string | null> =>
        SpotifyAuthService.getAccessToken() ?? (await SpotifyAuthService.bffFetchToken());

      // 2+3. Playlists + liked songs via SyncEngine (real pagination + diff).
      const engine = new SyncEngine(accountId, getToken, me.id);
      const report = await engine.run('manual');
      setSyncReport(report);
      setLastSyncAt(report.endedAt);
      if (report.errors.length > 0) {
        setSyncError(report.errors.slice(0, 3).join(' • '));
      }

      // 4. Hydrate UI state from the database (single source of truth).
      await hydrateFromCache(accountId);

      // 5. Recently Played Tracks (best-effort; restricted under Dev Mode).
      try {
        const recents = await SpotifyApiClient.getRecentlyPlayed(20);
        if (recents && recents.length > 0) {
          setRecentTracks(recents);
          if (!currentTrack) {
            setCurrentTrack(recents[0]);
            setDurationMs(recents[0].duration_ms);
          }
        }
      } catch (e) {
        console.warn('Could not load recently played:', e);
      }

      // 6. Top Artists (best-effort; restricted under Dev Mode).
      try {
        const topArtists = await SpotifyApiClient.getMyTopArtists(15);
        if (topArtists && topArtists.length > 0) {
          setArtists(topArtists);
        }
      } catch (e) {
        console.warn('Could not load top artists:', e);
      }

      // 7. Devices (best-effort).
      try {
        const realDevices = await SpotifyApiClient.getDevices();
        if (realDevices && realDevices.length > 0) {
          setDevices(realDevices);
          const active = realDevices.find((d) => d.is_active) || realDevices[0];
          setActiveDevice(active);
          audioService.setActiveExternalDeviceId(active.id);
        }
      } catch (e) {
        console.warn('Could not load devices:', e);
      }

      // 8. Init Web Playback SDK
      audioService.initSdkIfAvailable();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      console.warn('Could not sync library with Spotify API:', err);
      setSyncError(msg);
      // Fall back to whatever the cache holds rather than an empty screen.
      await hydrateFromCache();
    } finally {
      setIsSyncing(false);
    }
  }, [audioService, currentTrack]);

  // Read persisted library into UI state. Never fabricates: empty cache => empty UI.
  const hydrateFromCache = useCallback(async (accountId?: string) => {
    try {
      const all = await db.getPlaylists();
      const mine = (accountId ? all.filter((p) => p.accountId === accountId) : all)
        .filter((p) => !p.removedAt)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (mine.length > 0) setPlaylists(mine.map(dbPlaylistToUi));

      const acct = accountId ?? (await db.kvGet('lastAccountId')) ?? null;
      if (acct) {
        const saved = await db.getSavedTracks(acct);
        if (saved.length > 0) {
          const tracks = await db.getTracksByUris(saved.map((s) => s.trackUri));
          const byUri = new Map(tracks.map((t) => [t.uri, t]));
          const ordered = saved
            .map((s) => byUri.get(s.trackUri))
            .filter((t): t is NonNullable<typeof t> => !!t)
            .map(dbTrackToUi);
          if (ordered.length > 0) {
            setLikedSongs(ordered);
            setSavedTrackIds(new Set(ordered.map((t) => t.id)));
          }
        }
        const lastSyncRaw = await db.kvGet(`lastSync:${acct}`);
        if (lastSyncRaw) setLastSyncAt(Number(lastSyncRaw));
      }
    } catch (e) {
      console.warn('Cache hydration failed:', e);
    }
  }, []);

  // Check saved session on mount & listen to popup postMessage
  useEffect(() => {
    const savedUser = localStorage.getItem('soundscape_user_profile');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }

    if (SpotifyAuthService.isAuthenticated()) {
      syncWithSpotify();
    }

    // Handle OAuth Callback popup communication (origin-locked; callback posts to app origin only)
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'SPOTIFY_AUTH_CODE') {
        const { code, error } = event.data;
        if (code) {
          try {
            setIsSyncing(true);
            const success = await SpotifyAuthService.exchangeCode(code);
            if (success) {
              await syncWithSpotify();
              setCurrentScreen('account_sync');
            }
          } catch (e) {
            console.error('Code exchange failed:', e);
            setPlaybackNotice('Spotify authorization failed. Please verify Client ID and redirect URI.');
          } finally {
            setIsSyncing(false);
          }
        } else if (error) {
          console.warn('Spotify auth returned error:', error);
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [syncWithSpotify]);

  // Handle direct navigation code (if opened without popup)
  // + BFF session init (server-held refresh token preferred over legacy localStorage).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_success') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
      SpotifyAuthService.initBffSession().then((state) => {
        if (state === 'connected') {
          syncWithSpotify();
          setCurrentScreen('account_sync');
        }
      });
      return;
    }
    if (params.get('auth_error')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setPlaybackNotice('Spotify sign-in failed. Please try again.');
      return;
    }
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      SpotifyAuthService.exchangeCode(code)
        .then((success) => {
          if (success) {
            syncWithSpotify();
            setCurrentScreen('account_sync');
          }
        })
        .catch((e) => console.error('Error exchanging direct code', e));
      return;
    }
    // Returning BFF session (page reload with valid HttpOnly cookie).
    SpotifyAuthService.initBffSession().then((state) => {
      if (state === 'connected' || state === 'legacy') {
        syncWithSpotify();
      }
    });
  }, [syncWithSpotify]);

  // Archive recordings: resolved file lists cached per identifier.
  const archiveFiles = useRef(new Map<string, { title: string; artist: string; format: string; url: string }[]>());
  const archiveMeta = useRef(new Map<string, { title: string; artist: string }>());

  // Playback Control Handlers
  const localUrls = useRef(new Map<string, string>());

  const playArchiveTrack = async (uri: string) => {
    // uri = archive:track:<identifier>:<index>
    const rest = uri.slice('archive:track:'.length);
    const idx = Number(rest.slice(rest.lastIndexOf(':') + 1));
    const identifier = rest.slice(0, rest.lastIndexOf(':'));
    if (!identifier || Number.isNaN(idx)) {
      setPlaybackNotice('Could not resolve this archive track.');
      return;
    }
    let files = archiveFiles.current.get(identifier);
    if (!files) {
      setPlaybackNotice('Resolving archive recording…');
      try {
        const resolved = await archiveResolveTracks(identifier);
        files = resolved.map((t) => ({ title: t.title, artist: '', format: t.format, url: t.url }));
        archiveFiles.current.set(identifier, files);
      } catch (e) {
        setPlaybackNotice(e instanceof Error ? `Archive resolve failed: ${e.message}` : 'Archive resolve failed.');
        return;
      }
    }
    const file = files[idx];
    if (!file) {
      setPlaybackNotice('That archive track is no longer in the resolved set.');
      return;
    }
    const meta = archiveMeta.current.get(identifier) ?? { title: identifier, artist: 'Archive recording' };
    await audioService.playOpenTrack({
      name: file.title,
      artist: meta.artist,
      imageUrl: null,
      durationMs: 0,
      url: file.url,
      trackUri: uri,
      trackId: `archive-${identifier}-${idx}`,
      mode: 'archive',
      notice: `Playing from Internet Archive (${file.format}). Quality varies — live recording.`
    });
  };

  const handlePlayStation = (station: RadioStation) => {
    radioCountClick(station.uuid);
    void audioService.playOpenTrack({
      name: station.name,
      artist: station.country || 'Live radio',
      imageUrl: station.favicon,
      durationMs: 0,
      url: station.streamUrl,
      trackUri: `radio:station:${station.uuid}`,
      trackId: `radio-${station.uuid}`,
      mode: 'radio',
      notice: `Live radio (${station.codec}${station.bitrate ? ` ${station.bitrate}k` : ''}). Unskippable live stream.`
    });
  };

  const currentStationUuid =
    currentTrack?.id?.startsWith('radio-') === true ? currentTrack.id.slice('radio-'.length) : null;

  const handlePlayArchiveRecording = async (rec: ArchiveRecording) => {
    const identifier = rec.identifier;
    setPlaybackNotice('Resolving archive recording…');
    try {
      const resolved = await archiveResolveTracks(identifier);
      if (resolved.length === 0) {
        setPlaybackNotice('No playable audio files in this archive recording.');
        return;
      }
      const files = resolved.map((t) => ({ title: t.title, artist: rec.artist, format: t.format, url: t.url }));
      archiveFiles.current.set(identifier, files);
      archiveMeta.current.set(identifier, { title: rec.title, artist: rec.artist });
      const uiTracks: SpotifyTrack[] = resolved.map((t, i) => {
        const ref = archiveToRef(identifier, i);
        return {
          id: ref.id,
          uri: ref.uri,
          name: t.title,
          artists: [{ name: rec.artist }],
          album: { name: rec.title, images: [] },
          duration_ms: 0,
          preview_url: null,
          explicit: false
        };
      });
      const [first, ...rest] = uiTracks;
      if (rest.length > 0) setQueue((prev) => [...prev, ...rest]);
      await playArchiveTrack(first.uri);
    } catch (e) {
      setPlaybackNotice(e instanceof Error ? `Archive resolve failed: ${e.message}` : 'Archive resolve failed.');
    }
  };

  const handlePlayTrack = (track: SpotifyTrack) => {
    if (track.uri?.startsWith('audius:track:')) {
      const aid = track.id.startsWith('audius-') ? track.id.slice('audius-'.length) : track.id;
      void audioService.playOpenTrack({
        name: track.name,
        artist: track.artists?.[0]?.name ?? 'Unknown artist',
        imageUrl: track.album?.images?.[0]?.url ?? null,
        durationMs: track.duration_ms,
        url: audiusStreamUrl(aid),
        trackUri: track.uri,
        trackId: track.id,
        mode: 'audius',
        notice: 'Playing the full track from the Audius open catalogue.'
      });
      return;
    }
    if (track.uri?.startsWith('archive:track:')) {
      void playArchiveTrack(track.uri);
      return;
    }
    if (track.uri?.startsWith('jamendo:track:')) {
      const jid = track.id.startsWith('jamendo-') ? track.id.slice('jamendo-'.length) : track.id;
      setPlaybackNotice('Resolving best Jamendo file…');
      jamendoResolveTrack(jid)
        .then((jt) =>
          audioService.playOpenTrack({
            name: jt.name,
            artist: jt.artistName,
            imageUrl: jt.albumImage,
            durationMs: jt.durationSec * 1000,
            url: jt.audioUrl,
            trackUri: track.uri,
            trackId: track.id,
            mode: 'jamendo',
            notice: `Playing from Jamendo (${jamendoQualityLabel(jt)}).`
          })
        )
        .catch((e) => setPlaybackNotice(e instanceof Error ? e.message : 'Jamendo track unavailable.'));
      return;
    }
    if (track.uri?.startsWith('local:')) {
      const url = localUrls.current.get(track.id);
      if (!url) {
        setPlaybackNotice('Local file is no longer available in this session. Re-add it from Your Library.');
        return;
      }
      void audioService.playLocalFile({
        name: track.name,
        url,
        artist: track.artists?.[0]?.name,
        trackId: track.id,
        trackUri: track.uri
      });
      return;
    }
    void audioService.playTrack(track);
  };

  const handlePlayLocalFiles = (files: File[]) => {
    const parseName = (fileName: string): { title: string; artist: string } => {
      const base = fileName.replace(/\.[a-z0-9]+$/i, '');
      // "Artist - Title" convention; otherwise the filename is the title.
      const sep = base.indexOf(' - ');
      if (sep > 0) {
        return { artist: base.slice(0, sep).trim() || 'Local file', title: base.slice(sep + 3).trim() || base };
      }
      return { title: base, artist: 'Local file' };
    };
    const tracks: SpotifyTrack[] = files.map((f) => {
      const url = URL.createObjectURL(f);
      const { title, artist } = parseName(f.name);
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${f.size}-${f.lastModified}`;
      const id = `local-${slug}`;
      localUrls.current.set(id, url);
      return {
        id,
        uri: `local:${slug}`,
        name: title,
        artists: [{ name: artist }],
        album: { name: 'On this device', images: [] },
        duration_ms: 0,
        preview_url: null,
        explicit: false
      };
    });
    if (tracks.length === 0) return;
    const [first, ...rest] = tracks;
    if (rest.length > 0) setQueue((prev) => [...prev, ...rest]);
    handlePlayTrack(first);
  };

  const handleTogglePlay = () => {
    audioService.togglePlay();
  };

  const handleSeek = (positionMs: number) => {
    audioService.seek(positionMs);
  };

  const handleNext = () => {
    if (repeatMode === 'one' && currentTrack) {
      handlePlayTrack(currentTrack);
      return;
    }
    const pool = queue.length > 0 ? queue : recentTracks.length > 0 ? recentTracks : likedSongs;
    if (queue.length > 0) {
      const nextTrack = queue[0];
      setQueue((prev) => prev.slice(1));
      handlePlayTrack(nextTrack);
      return;
    }
    if (pool.length > 0) {
      // Shuffle is real for open playback: random pick (current excluded when possible).
      const currentIndex = pool.findIndex((t) => t.id === currentTrack?.id);
      let nextIndex: number;
      if (isShuffle && pool.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * pool.length);
        } while (nextIndex === currentIndex);
      } else {
        nextIndex = (currentIndex + 1) % pool.length;
      }
      // repeat off + end of pool + not queue-driven: stop instead of wrapping.
      if (repeatMode === 'off' && !isShuffle && currentIndex >= 0 && nextIndex === 0 && pool === queue) {
        return;
      }
      handlePlayTrack(pool[nextIndex]);
    }
  };

  const handlePrevious = () => {
    if (repeatMode === 'one' && currentTrack) {
      handlePlayTrack(currentTrack);
      return;
    }
    const pool = recentTracks.length > 0 ? recentTracks : likedSongs;
    if (pool.length > 0) {
      const currentIndex = pool.findIndex((t) => t.id === currentTrack?.id);
      const prevIndex = (currentIndex - 1 + pool.length) % pool.length;
      handlePlayTrack(pool[prevIndex]);
    }
  };

  const [muted, setMuted] = useState(false);
  const lastVolume = useRef(0.8);

  const handleVolumeChange = (vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    setVolume(v);
    setMuted(v === 0);
    if (v > 0) lastVolume.current = v;
    audioService.setVolume(v);
  };

  const handleToggleMute = () => {
    if (muted || volume === 0) {
      handleVolumeChange(lastVolume.current || 0.8);
    } else {
      lastVolume.current = volume;
      handleVolumeChange(0);
    }
  };

  // Latest-handler refs so service callbacks (track end, headset keys) never go stale.
  const nextRef = useRef(handleNext);
  const prevRef = useRef(handlePrevious);
  nextRef.current = handleNext;
  prevRef.current = handlePrevious;

  useEffect(() => {
    audioService.setOnTrackEnded(() => nextRef.current());
    audioService.setOnNextRequested(() => nextRef.current());
    audioService.setOnPrevRequested(() => prevRef.current());
    return () => {
      audioService.setOnTrackEnded(null);
      audioService.setOnNextRequested(null);
      audioService.setOnPrevRequested(null);
    };
  }, [audioService]);

  const handleToggleShuffle = () => {
    setIsShuffle(!isShuffle);
    SpotifyApiClient.setShuffle(!isShuffle).catch(() => {});
  };

  const handleToggleRepeat = () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(nextMode);
    SpotifyApiClient.setRepeat(nextMode === 'one' ? 'track' : nextMode === 'all' ? 'context' : 'off').catch(() => {});
  };

  const handleToggleLike = async (track: SpotifyTrack) => {
    const isCurrentlyLiked = savedTrackIds.has(track.id);
    const newSet = new Set(savedTrackIds);

    if (isCurrentlyLiked) {
      newSet.delete(track.id);
      setSavedTrackIds(newSet);
      setLikedSongs((prev) => prev.filter((t) => t.id !== track.id));
      if (SpotifyAuthService.isAuthenticated()) {
        SpotifyApiClient.removeSavedTrack(track.id).catch(() => {});
      }
    } else {
      newSet.add(track.id);
      setSavedTrackIds(newSet);
      setLikedSongs((prev) => [track, ...prev]);
      if (SpotifyAuthService.isAuthenticated()) {
        SpotifyApiClient.saveTrack(track.id).catch(() => {});
      }
    }
  };

  const handleSelectDevice = (device: SpotifyDevice) => {
    setActiveDevice(device);
    audioService.setActiveExternalDeviceId(device.id);
    if (SpotifyAuthService.isAuthenticated()) {
      SpotifyApiClient.transferPlayback(device.id).catch(() => {});
    }
    setIsDeviceModalOpen(false);
  };

  const handleDisconnect = () => {
    SpotifyAuthService.disconnect();
    setUser(null);
    setPlaylists([]);
    setLikedSongs([]);
    setSavedTrackIds(new Set());
    setRecentTracks([]);
    setArtists([]);
    setDevices([]);
    setActiveDevice(null);
    setCurrentTrack(null);
    setCurrentScreen('home');
  };

  const handleConnectWithToken = async (token: string) => {
    SpotifyAuthService.setManualToken(token);
    await syncWithSpotify();
  };

  const handleSelectPlaylist = (playlist: SpotifyPlaylist) => {
    setSelectedPlaylist(playlist);
    setCurrentScreen('playlist');
  };

  const handleSelectAlbum = (albumId: string) => {
    setSelectedAlbumId(albumId);
    setCurrentScreen('album');
  };

  const handleSelectArtist = (artistId: string) => {
    setSelectedArtistId(artistId);
    setCurrentScreen('artist');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#131313] text-[#e5e2e1] select-none font-sans">
      {/* Header */}
      <Header
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        user={user}
        onOpenSync={() => setCurrentScreen('account_sync')}
        onOpenSettings={() => setCurrentScreen('audio_settings')}
        onOpenAiDj={() => setIsAiDjOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-x-hidden">
        {currentScreen === 'home' && (
          <HomeScreen
            playlists={playlists}
            likedSongsCount={likedSongs.length}
            recentTracks={recentTracks}
            artists={artists}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayTrack={handlePlayTrack}
            onSelectPlaylist={handleSelectPlaylist}
            onSelectAlbum={handleSelectAlbum}
            onSelectArtist={handleSelectArtist}
            onOpenSync={() => setCurrentScreen('account_sync')}
            onOpenSettings={() => setCurrentScreen('audio_settings')}
            onOpenAiDj={() => setIsAiDjOpen(true)}
            user={user}
            isAuthenticated={!!user}
          />
        )}

        {currentScreen === 'search' && (
          <SearchScreen
            onPlayTrack={handlePlayTrack}
            onAddToQueue={(track) => {
              setQueue((prev) => [...prev, track]);
              setPlaybackNotice(`Queued: ${track.name}`);
            }}
            onAddToPlaylist={(track) => setPlaylistTarget(track)}
            onPlayArchiveRecording={handlePlayArchiveRecording}
            onSelectPlaylist={handleSelectPlaylist}
            onSelectAlbum={handleSelectAlbum}
            onSelectArtist={handleSelectArtist}
            onOpenSync={() => setCurrentScreen('account_sync')}
            isAuthenticated={!!user}
            featuredTracks={likedSongs.length > 0 ? likedSongs.slice(0, 10) : recentTracks}
          />
        )}

        {currentScreen === 'library' && (
          <LibraryScreen
            playlists={playlists}
            likedSongsCount={likedSongs.length}
            user={user}
            onSelectPlaylist={handleSelectPlaylist}
            onOpenSync={() => setCurrentScreen('account_sync')}
            onPlayLocalFiles={handlePlayLocalFiles}
            onPlayTrack={handlePlayTrack}
            onPlayTracks={(tracks) => {
              if (tracks.length === 0) return;
              const [first, ...rest] = tracks;
              if (rest.length > 0) setQueue((prev) => [...prev, ...rest]);
              handlePlayTrack(first);
            }}
            onQueueTracks={(tracks) => {
              setQueue((prev) => [...prev, ...tracks]);
              setPlaybackNotice(`Queued ${tracks.length} track${tracks.length === 1 ? '' : 's'}.`);
            }}
          />
        )}

        {currentScreen === 'stats' && <StatsScreen />}

        {currentScreen === 'radio' && (
          <RadioScreen
            onPlayStation={handlePlayStation}
            currentStationUuid={currentStationUuid}
            isPlaying={isPlaying}
          />
        )}

        {currentScreen === 'playlist' && selectedPlaylist && (
          <PlaylistDetailScreen
            playlist={selectedPlaylist}
            tracks={selectedPlaylist.id === 'liked-songs' ? likedSongs : []}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayTrack={handlePlayTrack}
            onToggleLike={handleToggleLike}
            savedTrackIds={savedTrackIds}
            onSelectAlbum={handleSelectAlbum}
            onSelectArtist={handleSelectArtist}
            onBack={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'album' && selectedAlbumId && (
          <AlbumDetailScreen
            albumId={selectedAlbumId}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayTrack={handlePlayTrack}
            onToggleLike={handleToggleLike}
            savedTrackIds={savedTrackIds}
            onSelectArtist={handleSelectArtist}
            onBack={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'artist' && selectedArtistId && (
          <ArtistDetailScreen
            artistId={selectedArtistId}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayTrack={handlePlayTrack}
            onToggleLike={handleToggleLike}
            savedTrackIds={savedTrackIds}
            onSelectAlbum={handleSelectAlbum}
            onBack={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'account_sync' && (
          <AccountSyncScreen
            user={user}
            playlistsCount={playlists.length}
            likedSongsCount={likedSongs.length}
            isSyncing={isSyncing}
            onTriggerSync={syncWithSpotify}
            onConnectSpotify={() => SpotifyAuthService.initiateAuth()}
            onDisconnect={handleDisconnect}
            clientId={clientId}
            onUpdateClientId={(newId) => {
              setClientId(newId);
              SpotifyAuthService.setClientId(newId);
            }}
            onConnectWithToken={handleConnectWithToken}
            syncReport={syncReport}
            lastSyncAt={lastSyncAt}
            syncError={syncError}
          />
        )}

        {currentScreen === 'audio_settings' && (
          <AudioSettingsScreen
            settings={audioSettings}
            onUpdateSettings={(newSettings) =>
              setAudioSettings((prev) => ({ ...prev, ...newSettings }))
            }
          />
        )}
      </main>

      {/* Stale-library banner (>24h since last sync) */}
      {user && lastSyncAt && Date.now() - lastSyncAt > 24 * 3600_000 && !isSyncing && (
        <div className="mx-4 mt-2 p-3 rounded-xl bg-[#201f1f] border border-amber-500/30 flex items-center justify-between gap-2">
          <p className="text-[11px] text-amber-200">
            Library last synced {new Date(lastSyncAt).toLocaleDateString()}. Refresh to pick up changes.
          </p>
          <button
            onClick={() => syncWithSpotify()}
            className="px-3 py-1.5 rounded-lg bg-[#53e076] text-[#003914] text-[11px] font-bold flex-shrink-0"
          >
            Sync now
          </button>
        </div>
      )}

      {/* Real-time Playback Notice Capsule */}
      {playbackNotice && (
        <div className="fixed bottom-28 left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md bg-[#131313]/95 backdrop-blur-md border border-amber-500/30 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-2 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-amber-400 text-base flex-shrink-0">info</span>
              <p className="text-[11px] text-amber-200 font-medium truncate">{playbackNotice}</p>
            </div>
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
            >
              Audit
            </button>
          </div>
        </div>
      )}

      {/* Floating MiniPlayer */}
      <MiniPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        progressMs={progressMs}
        durationMs={durationMs}
        activeDevice={activeDevice}
        isLiked={currentTrack ? savedTrackIds.has(currentTrack.id) : false}
        playbackMode={playbackMode}
        onTogglePlay={handleTogglePlay}
        onToggleLike={handleToggleLike}
        onOpenFullPlayer={() => setIsFullPlayerOpen(true)}
        onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
      />

      {/* Pinned Bottom Navigation */}
      <BottomNav currentScreen={currentScreen} onNavigate={setCurrentScreen} />

      {/* Full Player Modal Sheet */}
      <FullPlayerModal
        isOpen={isFullPlayerOpen}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        progressMs={progressMs}
        durationMs={durationMs}
        isShuffle={isShuffle}
        repeatMode={repeatMode}
        activeDevice={activeDevice}
        isLiked={currentTrack ? savedTrackIds.has(currentTrack.id) : false}
        playbackMode={playbackMode}
        playbackNotice={playbackNotice}
        playlistContextName={selectedPlaylist?.name || 'Spotify Playback'}
        onClose={() => setIsFullPlayerOpen(false)}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onToggleShuffle={handleToggleShuffle}
        onToggleRepeat={handleToggleRepeat}
        onToggleLike={handleToggleLike}
        onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
        onOpenQueue={() => setIsQueueOpen(true)}
        onOpenLyrics={() => setIsLyricsOpen(true)}
        volume={volume}
        muted={muted}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onSelectAlbum={handleSelectAlbum}
        onSelectArtist={handleSelectArtist}
      />

      {/* Real lyrics (LRCLIB) */}
      <LyricsModal
        isOpen={isLyricsOpen}
        onClose={() => setIsLyricsOpen(false)}
        track={currentTrack}
        positionMs={progressMs}
      />

      {/* Add track to a Soundscape playlist */}
      {playlistTarget && (
        <PlaylistPicker
          track={playlistTarget}
          onClose={() => setPlaylistTarget(null)}
          onChanged={() => setPlaybackNotice('Playlist updated.')}
        />
      )}

      {/* Spotify Connect & Device Switcher Modal */}
      <DeviceConnectModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        devices={devices}
        activeDevice={activeDevice}
        currentTrack={currentTrack}
        volume={volume}
        onSelectDevice={handleSelectDevice}
        onVolumeChange={handleVolumeChange}
      />

      {/* Queue Drawer Modal */}
      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        currentTrack={currentTrack}
        queue={queue}
        onPlayTrack={handlePlayTrack}
        onRemoveFromQueue={(idx) => setQueue((prev) => prev.filter((_, i) => i !== idx))}
        onClearQueue={() => setQueue([])}
      />

      {/* AI DJ Modal (Gemini 3.8 Flash) */}
      <AiDjModal
        isOpen={isAiDjOpen}
        onClose={() => setIsAiDjOpen(false)}
        currentTrack={currentTrack}
        onPlayTrack={handlePlayTrack}
        onAddToQueue={(track) => setQueue((prev) => [...prev, track])}
      />

      {/* Diagnostics & E2E Test Modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        isAuthenticated={!!user}
        user={user}
        playlistsCount={playlists.length}
        likedSongsCount={likedSongs.length}
        isPlaying={isPlaying}
        currentTrack={currentTrack}
        activeDevice={activeDevice}
        devices={devices}
        onOpenSync={() => setCurrentScreen('account_sync')}
      />
    </div>
  );
};

export default App;
