import React, { useState, useEffect } from 'react';
import { SpotifyAlbum, SpotifyTrack } from '../types';
import { SpotifyApiClient } from '../services/spotifyApi';

interface AlbumDetailScreenProps {
  albumId: string;
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SpotifyTrack) => void;
  onToggleLike: (track: SpotifyTrack) => void;
  savedTrackIds: Set<string>;
  onSelectArtist: (artistId: string) => void;
  onBack: () => void;
}

export const AlbumDetailScreen: React.FC<AlbumDetailScreenProps> = ({
  albumId,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onToggleLike,
  savedTrackIds,
  onSelectArtist,
  onBack
}) => {
  const [album, setAlbum] = useState<SpotifyAlbum | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAlbum() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await SpotifyApiClient.getAlbum(albumId);
        if (!isMounted) return;
        if (!data) {
          setError('Album could not be loaded from Spotify.');
          setIsLoading(false);
          return;
        }
        setAlbum(data);

        // Check if album is saved in user's Spotify library
        const [saved] = await SpotifyApiClient.checkSavedAlbums([albumId]);
        if (isMounted) setIsSaved(!!saved);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch Spotify album.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (albumId) {
      loadAlbum();
    }

    return () => {
      isMounted = false;
    };
  }, [albumId]);

  const handleToggleSave = async () => {
    if (!album) return;
    if (isSaved) {
      const ok = await SpotifyApiClient.removeAlbum(album.id);
      if (ok) setIsSaved(false);
    } else {
      const ok = await SpotifyApiClient.saveAlbum(album.id);
      if (ok) setIsSaved(true);
    }
  };

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const coverUrl = album?.images?.[0]?.url;
  const tracks = album?.tracks?.items || [];

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-10 h-10 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#e5e2e1]">Loading official Spotify album data...</p>
        <p className="text-xs text-[#c6c6c7] mt-1 font-mono">album_id: {albumId}</p>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          <span className="material-symbols-outlined text-2xl">album</span>
        </div>
        <h2 className="text-lg font-bold text-[#e5e2e1] mb-2">Album Unavailable</h2>
        <p className="text-xs text-[#c6c6c7] max-w-md mb-6">{error || 'Unable to retrieve album details from Spotify.'}</p>
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-full bg-[#201f1f] text-[#e5e2e1] hover:bg-[#2a2a2a] text-xs font-bold transition-all"
        >
          Return to Previous Screen
        </button>
      </div>
    );
  }

  const primaryArtist = album.artists?.[0];

  return (
    <div className="pb-28">
      {/* Top Navigation Bar */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center border border-white/5 transition-colors"
          title="Go back"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
        </button>
        <span className="text-[11px] font-mono text-[#c6c6c7] tracking-wider">
          SPOTIFY ALBUM • {album.id}
        </span>
      </div>

      {/* Hero Header */}
      <div className="px-6 pt-2 pb-6 bg-gradient-to-b from-[#201f1f] to-[#131313] flex flex-col items-center text-center sm:flex-row sm:items-end sm:text-left gap-6 border-b border-white/5">
        {/* Real Album Artwork */}
        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl overflow-hidden shadow-2xl bg-[#0e0e0e] flex-shrink-0 border border-white/10">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={album.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#181818] text-[#c6c6c7]">
              <span className="material-symbols-outlined text-5xl mb-2">album</span>
              <span className="text-xs">Artwork Unavailable</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#53e076]">
            ALBUM
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-[#e5e2e1] mt-1 tracking-tight truncate">
            {album.name}
          </h1>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3 text-xs font-semibold text-[#c6c6c7]">
            {primaryArtist && (
              <button
                onClick={() => primaryArtist.id && onSelectArtist(primaryArtist.id)}
                className="text-[#e5e2e1] font-bold hover:text-[#53e076] hover:underline transition-colors"
              >
                {primaryArtist.name}
              </button>
            )}
            <span>•</span>
            <span>{album.release_date?.slice(0, 4) || 'Unknown'}</span>
            <span>•</span>
            <span>{album.total_tracks} tracks</span>
            {album.label && (
              <>
                <span>•</span>
                <span className="truncate max-w-[200px]">{album.label}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggleSave}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isSaved ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-white'
            }`}
            title={isSaved ? 'Saved in Your Library' : 'Save to Your Library'}
          >
            <span className={`material-symbols-outlined text-2xl ${isSaved ? 'fill-1' : ''}`}>
              favorite
            </span>
          </button>
        </div>

        {/* Play Album Button */}
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
            onClick={() => {
              if (tracks[0]) onPlayTrack(tracks[0]);
            }}
            className="w-14 h-14 rounded-full bg-[#1db954] hover:bg-[#53e076] text-[#003914] flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all"
            title="Play Album"
          >
            <span className="material-symbols-outlined text-3xl fill-1">
              {isPlaying && currentTrack?.album?.id === album.id ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
      </div>

      {/* Official Spotify Tracklist */}
      <div className="px-4 space-y-1">
        {tracks.map((track, index) => {
          const isCurrent = currentTrack?.id === track.id;
          const isLiked = savedTrackIds.has(track.id);

          return (
            <div
              key={track.id || index}
              onClick={() => onPlayTrack(track)}
              className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors group ${
                isCurrent ? 'bg-[#201f1f]' : 'hover:bg-[#201f1f]/60'
              }`}
            >
              {/* Track Number / Equalizer */}
              <div className="w-8 flex items-center justify-center text-xs font-mono text-[#c6c6c7]">
                {isCurrent && isPlaying ? (
                  <div className="flex items-end gap-0.5 h-3">
                    <span className="w-0.5 h-3 bg-[#53e076] animate-bounce" />
                    <span className="w-0.5 h-2 bg-[#53e076] animate-bounce delay-75" />
                    <span className="w-0.5 h-4 bg-[#53e076] animate-bounce delay-150" />
                  </div>
                ) : (
                  <span className="group-hover:hidden">{track.track_number || index + 1}</span>
                )}
                <span className="material-symbols-outlined text-lg hidden group-hover:inline text-white">
                  play_arrow
                </span>
              </div>

              {/* Title & Artist */}
              <div className="min-w-0 flex-1 ml-2">
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
                            e.stopPropagation();
                            if (a.id) onSelectArtist(a.id);
                          }}
                          className="hover:underline hover:text-white"
                        >
                          {a.name}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              </div>

              {/* Like & Duration */}
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

      {/* Album Footer Metadata */}
      <div className="px-6 mt-8 pt-4 border-t border-white/5 text-[11px] text-[#c6c6c7] space-y-1">
        <p>Released {album.release_date || 'Unknown'}</p>
        {album.copyrights?.map((c, i) => (
          <p key={i} className="text-[10px] opacity-75">
            {c.text}
          </p>
        ))}
      </div>
    </div>
  );
};
