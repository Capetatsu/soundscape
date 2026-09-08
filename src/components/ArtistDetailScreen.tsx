import React, { useState, useEffect } from 'react';
import { SpotifyArtist, SpotifyTrack, SpotifyAlbum } from '../types';
import { SpotifyApiClient } from '../services/spotifyApi';

interface ArtistDetailScreenProps {
  artistId: string;
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SpotifyTrack) => void;
  onToggleLike: (track: SpotifyTrack) => void;
  savedTrackIds: Set<string>;
  onSelectAlbum: (albumId: string) => void;
  onBack: () => void;
}

export const ArtistDetailScreen: React.FC<ArtistDetailScreenProps> = ({
  artistId,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onToggleLike,
  savedTrackIds,
  onSelectAlbum,
  onBack
}) => {
  const [artist, setArtist] = useState<SpotifyArtist | null>(null);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadArtistData() {
      setIsLoading(true);
      setError(null);
      try {
        const [artistData, tracksData, albumsData, followStatus] = await Promise.all([
          SpotifyApiClient.getArtist(artistId),
          SpotifyApiClient.getArtistTopTracks(artistId),
          SpotifyApiClient.getArtistAlbums(artistId),
          SpotifyApiClient.checkFollowArtist(artistId)
        ]);

        if (!isMounted) return;
        if (!artistData) {
          setError('Artist details could not be retrieved from Spotify.');
          setIsLoading(false);
          return;
        }

        setArtist(artistData);
        setTopTracks(tracksData);
        setAlbums(albumsData);
        setIsFollowing(followStatus);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch Spotify artist.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (artistId) {
      loadArtistData();
    }

    return () => {
      isMounted = false;
    };
  }, [artistId]);

  const handleToggleFollow = async () => {
    if (!artist) return;
    if (isFollowing) {
      const ok = await SpotifyApiClient.unfollowArtist(artist.id);
      if (ok) setIsFollowing(false);
    } else {
      const ok = await SpotifyApiClient.followArtist(artist.id);
      if (ok) setIsFollowing(true);
    }
  };

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatNumber = (num?: number) => {
    if (!num) return '0';
    return new Intl.NumberFormat().format(num);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-10 h-10 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#e5e2e1]">Loading official Spotify artist profile...</p>
        <p className="text-xs text-[#c6c6c7] mt-1 font-mono">artist_id: {artistId}</p>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          <span className="material-symbols-outlined text-2xl">person</span>
        </div>
        <h2 className="text-lg font-bold text-[#e5e2e1] mb-2">Artist Unavailable</h2>
        <p className="text-xs text-[#c6c6c7] max-w-md mb-6">{error || 'Unable to retrieve artist profile.'}</p>
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-full bg-[#201f1f] text-[#e5e2e1] hover:bg-[#2a2a2a] text-xs font-bold transition-all"
        >
          Return to Previous Screen
        </button>
      </div>
    );
  }

  const artistImageUrl = artist.images?.[0]?.url;

  return (
    <div className="pb-28">
      {/* Top Bar with Back Button */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center border border-white/5 transition-colors"
          title="Go back"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
        </button>
        <span className="text-[11px] font-mono text-[#c6c6c7] tracking-wider">
          SPOTIFY ARTIST • {artist.id}
        </span>
      </div>

      {/* Artist Hero Banner */}
      <div className="relative px-6 pt-6 pb-8 bg-gradient-to-b from-[#252525] to-[#131313] border-b border-white/5">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
          {/* Artist Circular Photo */}
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden shadow-2xl bg-[#1c1c1c] flex-shrink-0 border-2 border-white/10 ring-4 ring-black/30">
            {artistImageUrl ? (
              <img
                src={artistImageUrl}
                alt={artist.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#181818] text-[#c6c6c7]">
                <span className="material-symbols-outlined text-6xl">person</span>
              </div>
            )}
          </div>

          {/* Artist Identity */}
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="material-symbols-outlined text-[#53e076] text-sm fill-1">verified</span>
              <span className="text-[11px] font-bold tracking-wider text-[#53e076] uppercase">
                Verified Artist
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-[#e5e2e1] mt-1 tracking-tight truncate">
              {artist.name}
            </h1>
            <p className="text-xs text-[#c6c6c7] mt-2">
              {formatNumber(artist.followers?.total)} Spotify followers
            </p>
            {artist.genres && artist.genres.length > 0 && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mt-3">
                {artist.genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold text-[#e5e2e1] capitalize"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggleFollow}
            className={`px-5 py-2 rounded-full text-xs font-bold border transition-all ${
              isFollowing
                ? 'bg-transparent text-[#53e076] border-[#53e076]'
                : 'bg-white text-black border-white hover:scale-105'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>

        {/* Play Top Track */}
        {topTracks.length > 0 && (
          <button
            onClick={() => onPlayTrack(topTracks[0])}
            className="w-14 h-14 rounded-full bg-[#1db954] hover:bg-[#53e076] text-[#003914] flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all"
            title="Play Artist Top Tracks"
          >
            <span className="material-symbols-outlined text-3xl fill-1">
              {isPlaying && currentTrack?.artists?.[0]?.name === artist.name ? 'pause' : 'play_arrow'}
            </span>
          </button>
        )}
      </div>

      {/* Popular Tracks Section */}
      <div className="px-6 mb-8">
        <h2 className="text-lg font-bold text-[#e5e2e1] mb-3 tracking-tight">Popular</h2>
        <div className="space-y-1">
          {topTracks.slice(0, 5).map((track, index) => {
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
                <div className="w-6 text-center text-xs font-mono text-[#c6c6c7]">
                  {isCurrent && isPlaying ? (
                    <span className="material-symbols-outlined text-base text-[#53e076] animate-pulse">
                      equalizer
                    </span>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 min-w-0 flex-1 ml-3">
                  <img
                    src={track.album?.images?.[0]?.url}
                    alt={track.name}
                    className="w-10 h-10 rounded-md object-cover bg-[#131313] flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-bold truncate ${
                        isCurrent ? 'text-[#53e076]' : 'text-[#e5e2e1] group-hover:text-white'
                      }`}
                    >
                      {track.name}
                    </p>
                    <p className="text-xs text-[#c6c6c7] truncate">
                      {track.album?.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onToggleLike(track)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      isLiked ? 'text-[#53e076]' : 'text-[#c6c6c7] opacity-0 group-hover:opacity-100 hover:text-white'
                    }`}
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

      {/* Discography / Albums & Singles */}
      <div className="px-6">
        <h2 className="text-lg font-bold text-[#e5e2e1] mb-3 tracking-tight">Discography</h2>
        {albums.length === 0 ? (
          <p className="text-xs text-[#c6c6c7]">No releases available for this artist.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {albums.map((alb) => (
              <div
                key={alb.id}
                onClick={() => onSelectAlbum(alb.id)}
                className="group bg-[#201f1f]/50 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 cursor-pointer transition-all duration-200"
              >
                <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 bg-[#131313] shadow-md">
                  {alb.images?.[0]?.url ? (
                    <img
                      src={alb.images[0].url}
                      alt={alb.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                      <span className="material-symbols-outlined text-4xl">album</span>
                    </div>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                  {alb.name}
                </p>
                <p className="text-[11px] text-[#c6c6c7] truncate mt-0.5">
                  {alb.release_date?.slice(0, 4)} • {alb.total_tracks} tracks
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
