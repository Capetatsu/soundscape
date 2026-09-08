import React, { useState, useEffect, useCallback } from 'react';
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
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Fetch real Spotify user data and library
  const syncWithSpotify = useCallback(async () => {
    if (!SpotifyAuthService.isAuthenticated()) return;
    setIsSyncing(true);
    try {
      // 1. User Profile
      const me = await SpotifyApiClient.getMe();
      setUser(me);
      audioService.setUser(me);
      localStorage.setItem('soundscape_user_profile', JSON.stringify(me));

      // 2. Playlists
      const playlistsData = await SpotifyApiClient.getMyPlaylists(50);
      if (playlistsData.items && playlistsData.items.length > 0) {
        setPlaylists(playlistsData.items);
      }

      // 3. Liked Songs
      const likedData = await SpotifyApiClient.getMySavedTracks(50);
      if (likedData.items && likedData.items.length > 0) {
        const tracks = likedData.items.map((i: any) => i.track).filter(Boolean);
        setLikedSongs(tracks);
        setSavedTrackIds(new Set(tracks.map((t: SpotifyTrack) => t.id)));
      }

      // 4. Recently Played Tracks
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

      // 5. Top Artists
      try {
        const topArtists = await SpotifyApiClient.getMyTopArtists(15);
        if (topArtists && topArtists.length > 0) {
          setArtists(topArtists);
        }
      } catch (e) {
        console.warn('Could not load top artists:', e);
      }

      // 6. Devices
      const realDevices = await SpotifyApiClient.getDevices();
      if (realDevices && realDevices.length > 0) {
        setDevices(realDevices);
        const active = realDevices.find((d) => d.is_active) || realDevices[0];
        setActiveDevice(active);
        audioService.setActiveExternalDeviceId(active.id);
      }

      // 7. Init Web Playback SDK
      audioService.initSdkIfAvailable();
    } catch (err) {
      console.warn('Could not sync library with Spotify API:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [audioService, currentTrack]);

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

    // Handle OAuth Callback popup communication
    const handleOAuthMessage = async (event: MessageEvent) => {
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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
    }
  }, [syncWithSpotify]);

  // Playback Control Handlers
  const handlePlayTrack = (track: SpotifyTrack) => {
    audioService.playTrack(track);
  };

  const handleTogglePlay = () => {
    audioService.togglePlay();
  };

  const handleSeek = (positionMs: number) => {
    audioService.seek(positionMs);
  };

  const handleNext = () => {
    if (queue.length > 0) {
      const nextTrack = queue[0];
      setQueue((prev) => prev.slice(1));
      handlePlayTrack(nextTrack);
    } else if (recentTracks.length > 0) {
      const currentIndex = recentTracks.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % recentTracks.length;
      handlePlayTrack(recentTracks[nextIndex]);
    } else if (likedSongs.length > 0) {
      const currentIndex = likedSongs.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % likedSongs.length;
      handlePlayTrack(likedSongs[nextIndex]);
    }
  };

  const handlePrevious = () => {
    const pool = recentTracks.length > 0 ? recentTracks : likedSongs;
    if (pool.length > 0) {
      const currentIndex = pool.findIndex((t) => t.id === currentTrack?.id);
      const prevIndex = (currentIndex - 1 + pool.length) % pool.length;
      handlePlayTrack(pool[prevIndex]);
    }
  };

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

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    audioService.setVolume(vol);
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
        onSelectAlbum={handleSelectAlbum}
        onSelectArtist={handleSelectArtist}
      />

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
