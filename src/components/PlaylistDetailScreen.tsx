import React, { useState, useEffect } from 'react';
import { SpotifyPlaylist, SpotifyTrack } from '../types';
import { SpotifyApiClient } from '../services/spotifyApi';

interface PlaylistDetailScreenProps {
  playlist: SpotifyPlaylist;
  tracks: SpotifyTrack[];
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SpotifyTrack) => void;
  onToggleLike: (track: SpotifyTrack) => void;
  savedTrackIds: Set<string>;
  onSelectAlbum: (albumId: string) => void;
  onSelectArtist: (artistId: string) => void;
  onBack?: () => void;
}

export const PlaylistDetailScreen: React.FC<PlaylistDetailScreenProps> = ({
  playlist,
  tracks: initialTracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onToggleLike,
  savedTrackIds,
  onSelectAlbum,
  onSelectArtist,
  onBack
}) => {
  const [tracks, setTracks] = useState<SpotifyTrack[]>(initialTracks);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isSaved, setIsSaved] = useState(playlist.isSaved ?? true);

  // If initialTracks is empty and it's not liked-songs, fetch real playlist tracks from Spotify
  useEffect(() => {
    let isMounted = true;
    if (initialTracks.length > 0) {
      setTracks(initialTracks);
    } else if (playlist.id && playlist.id !== 'liked-songs') {
      setIsLoading(true);
      SpotifyApiClient.getPlaylist(playlist.id)
        .then((fullPl) => {
          if (!isMounted) return;
          const items = fullPl.tracks?.items || [];
          const loadedTracks: SpotifyTrack[] = items
            .map((item: any) => item.track)
            .filter(Boolean);
          setTracks(loadedTracks);
        })
        .catch((err) => {
          console.warn('Could not load playlist tracks:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    } else {
      setTracks([]);
    }

    return () => {
      isMounted = false;
    };
  }, [playlist.id, initialTracks]);

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const coverImage = playlist.images?.[0]?.url;

  return (
    <div className="pb-28">
      {/* Top Back Nav */}
      {onBack && (
        <div className="px-6 pt-4 pb-2">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center border border-white/5 transition-colors"
            title="Go back"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="px-6 pt-4 pb-6 bg-gradient-to-b from-[#201f1f] to-[#131313] flex flex-col items-center text-center sm:flex-row sm:items-end sm:text-left gap-6 border-b border-white/5">
        {/* Artwork */}
        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl overflow-hidden shadow-2xl bg-[#0e0e0e] flex-shrink-0 border border-white/10">
          {playlist.id === 'liked-songs' ? (
            <div className="w-full h-full bg-gradient-to-br from-[#450af5] via-[#8e2de2] to-[#4a00e0] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-6xl fill-1">favorite</span>
            </div>
          ) : coverImage ? (
            <img
              src={coverImage}
              alt={playlist.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#181818] text-[#c6c6c7]">
              <span className="material-symbols-outlined text-6xl">queue_music</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#53e076]">
            PLAYLIST
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-[#e5e2e1] mt-1 tracking-tight truncate">
            {playlist.name}
          </h1>
          <p className="text-xs text-[#c6c6c7] mt-2 line-clamp-2 max-w-xl leading-relaxed">
            {playlist.description || 'Authentic Spotify playlist synced with your account.'}
          </p>
          <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 text-xs font-semibold text-[#c6c6c7]">
            <span className="text-[#e5e2e1]">{playlist.owner?.display_name || 'Spotify'}</span>
            <span>•</span>
            <span>{tracks.length || playlist.tracks?.total || 0} songs</span>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSaved(!isSaved)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isSaved ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-white'
            }`}
            title={isSaved ? 'Saved to library' : 'Save playlist'}
          >
            <span className={`material-symbols-outlined text-2xl ${isSaved ? 'fill-1' : ''}`}>
              favorite
            </span>
          </button>

          <button
            onClick={() => setIsDownloaded(!isDownloaded)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isDownloaded ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-white'
            }`}
            title={isDownloaded ? 'Downloaded offline' : 'Download for offline playback'}
          >
            <span className={`material-symbols-outlined text-2xl ${isDownloaded ? 'fill-1' : ''}`}>
              download_for_offline
            </span>
          </button>
        </div>

        {/* Play & Shuffle Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (tracks.length > 0) {
                const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
                onPlayTrack(randomTrack);
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#c6c6c7] hover:text-[#53e076] hover:bg-white/5 transition-colors"
            title="Shuffle Play"
          >
            <span className="material-symbols-outlined text-2xl">shuffle</span>
          </button>

          <button
            id="playlist-play-btn"
            onClick={() => {
              if (tracks[0]) onPlayTrack(tracks[0]);
            }}
            className="w-14 h-14 rounded-full bg-[#1db954] hover:bg-[#53e076] text-[#003914] flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all"
            title="Play Playlist"
          >
            <span className="material-symbols-outlined text-3xl fill-1">
              {isPlaying && currentTrack ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-[#c6c6c7]">Loading authentic Spotify playlist tracks...</p>
        </div>
      )}

      {/* Empty playlist state */}
      {!isLoading && tracks.length === 0 && (
        <div className="py-12 text-center text-[#c6c6c7] px-6">
          <span className="material-symbols-outlined text-4xl mb-2 text-[#53e076]">music_off</span>
          <p className="text-sm font-bold text-[#e5e2e1]">No tracks in this playlist yet</p>
          <p className="text-xs mt-1">Add tracks on Spotify or like songs to view them here.</p>
        </div>
      )}

      {/* Track List */}
      <div className="px-4 space-y-1">
        {tracks.map((track, index) => {
          const isCurrent = currentTrack?.id === track.id;
          const isLiked = savedTrackIds.has(track.id);
          const artworkUrl = track.album?.images?.[0]?.url;

          return (
            <div
              key={track.id || index}
              onClick={() => onPlayTrack(track)}
              className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors group ${
                isCurrent ? 'bg-[#201f1f]' : 'hover:bg-[#201f1f]/60'
              }`}
            >
              {/* Index or Equalizer */}
              <div className="w-7 flex items-center justify-center text-xs font-semibold text-[#c6c6c7]">
                {isCurrent && isPlaying ? (
                  <div className="flex items-end gap-0.5 h-3">
                    <span className="w-0.5 h-3 bg-[#53e076] animate-bounce" />
                    <span className="w-0.5 h-2 bg-[#53e076] animate-bounce delay-75" />
                    <span className="w-0.5 h-4 bg-[#53e076] animate-bounce delay-150" />
                  </div>
                ) : (
                  <span className="group-hover:hidden">{index + 1}</span>
                )}
                <span className="material-symbols-outlined text-lg hidden group-hover:inline text-white">
                  play_arrow
                </span>
              </div>

              {/* Artwork & Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1 ml-2">
                <div
                  onClick={(e) => {
                    if (track.album?.id) {
                      e.stopPropagation();
                      onSelectAlbum(track.album.id);
                    }
                  }}
                  className="w-10 h-10 rounded-lg overflow-hidden bg-[#131313] flex-shrink-0 shadow-sm hover:opacity-80"
                  title={track.album?.name ? `Open album: ${track.album.name}` : undefined}
                >
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={track.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                      <span className="material-symbols-outlined text-base">music_note</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-bold truncate ${
                      isCurrent ? 'text-[#53e076]' : 'text-[#e5e2e1] group-hover:text-white'
                    }`}
                  >
                    {track.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[#c6c6c7]">
                    {track.explicit && (
                      <span className="px-1 text-[8px] font-bold bg-[#454747] text-[#c6c6c7] rounded uppercase">
                        E
                      </span>
                    )}
                    <span className="truncate">
                      {track.artists?.map((a, aIdx) => (
                        <span key={a.id || a.name}>
                          {aIdx > 0 && ', '}
                          <button
                            type="button"
                            onClick={(e) => {
                              if (a.id) {
                                e.stopPropagation();
                                onSelectArtist(a.id);
                              }
                            }}
                            className="hover:underline hover:text-white"
                          >
                            {a.name}
                          </button>
                        </span>
                      ))}
                    </span>
                    {track.album?.id && (
                      <>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAlbum(track.album.id!);
                          }}
                          className="truncate hover:underline hover:text-white max-w-[120px] sm:max-w-[200px]"
                        >
                          {track.album.name}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Like & Duration */}
              <div className="flex items-center gap-3 ml-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onToggleLike(track)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isLiked ? 'text-[#53e076]' : 'text-[#c6c6c7] opacity-0 group-hover:opacity-100 hover:text-white'
                  }`}
                  title={isLiked ? 'Liked' : 'Like'}
                >
                  <span className={`material-symbols-outlined text-lg ${isLiked ? 'fill-1' : ''}`}>
                    favorite
                  </span>
                </button>
                <span className="text-xs font-mono text-[#c6c6c7] w-10 text-right">
                  {formatDuration(track.duration_ms)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
