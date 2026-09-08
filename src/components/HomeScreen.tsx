import React, { useState, useEffect } from 'react';
import { SpotifyPlaylist, SpotifyTrack, SpotifyArtist, SpotifyAlbum, SpotifyUser } from '../types';
import { SpotifyApiClient } from '../services/spotifyApi';

interface HomeScreenProps {
  playlists: SpotifyPlaylist[];
  likedSongsCount: number;
  recentTracks: SpotifyTrack[];
  artists: SpotifyArtist[];
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SpotifyTrack) => void;
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void;
  onSelectAlbum: (albumId: string) => void;
  onSelectArtist: (artistId: string) => void;
  onOpenSync: () => void;
  onOpenSettings: () => void;
  onOpenAiDj: () => void;
  user: SpotifyUser | null;
  isAuthenticated: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  playlists,
  likedSongsCount,
  recentTracks,
  artists,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onSelectPlaylist,
  onSelectAlbum,
  onSelectArtist,
  onOpenSync,
  onOpenSettings,
  onOpenAiDj,
  user,
  isAuthenticated
}) => {
  const [featuredPlaylists, setFeaturedPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [newReleases, setNewReleases] = useState<SpotifyAlbum[]>([]);
  const [featuredMessage, setFeaturedMessage] = useState<string>('Featured by Spotify');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load official Spotify featured playlists and new releases when authenticated
  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated) {
      setIsLoadingMore(true);
      Promise.all([
        SpotifyApiClient.getFeaturedPlaylists(10),
        SpotifyApiClient.getNewReleases(10)
      ])
        .then(([featuredRes, releasesRes]) => {
          if (!isMounted) return;
          if (featuredRes.playlists.length > 0) {
            setFeaturedPlaylists(featuredRes.playlists);
            if (featuredRes.message) setFeaturedMessage(featuredRes.message);
          }
          if (releasesRes.length > 0) {
            setNewReleases(releasesRes);
          }
        })
        .catch((err) => {
          console.warn('Could not fetch featured/releases from Spotify:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingMore(false);
        });
    } else {
      setFeaturedPlaylists([]);
      setNewReleases([]);
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Build top 6 quick access items
  const quickItems: Array<{
    id: string;
    name: string;
    image?: string;
    isLiked?: boolean;
    onClick: () => void;
  }> = [
    {
      id: 'liked-songs',
      name: 'Liked Songs',
      isLiked: true,
      onClick: () =>
        onSelectPlaylist({
          id: 'liked-songs',
          uri: 'spotify:collection:tracks',
          name: 'Liked Songs',
          description: 'Your authentic saved Spotify songs',
          images: [],
          tracks: { total: likedSongsCount },
          owner: { display_name: user?.display_name || 'You', id: user?.id || 'me' }
        })
    },
    ...playlists.slice(0, 5).map((pl) => ({
      id: pl.id,
      name: pl.name,
      image: pl.images?.[0]?.url,
      onClick: () => onSelectPlaylist(pl)
    }))
  ];

  return (
    <div className="pb-28 pt-2 space-y-7">
      {/* Top App Bar */}
      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSync}
            className="relative transition-transform active:scale-95"
            title="Account settings & sync"
          >
            {user?.images?.[0]?.url ? (
              <img
                src={user.images[0].url}
                alt={user.display_name}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-[#53e076]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#201f1f] border border-white/10 flex items-center justify-center text-[#e5e2e1]">
                <span className="material-symbols-outlined text-xl">person</span>
              </div>
            )}
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#131313] ${
                isAuthenticated ? 'bg-[#53e076]' : 'bg-amber-400'
              }`}
            />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#e5e2e1] tracking-tight">
              {getGreeting()}
              {user?.display_name ? `, ${user.display_name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-[11px] font-mono text-[#c6c6c7] flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isAuthenticated ? 'bg-[#53e076] animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{isAuthenticated ? 'Connected to Spotify API' : 'Spotify Account Disconnected'}</span>
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAiDj}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-[#53e076]/40 text-[#53e076] text-xs font-bold hover:brightness-110 active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">graphic_eq</span>
            <span>AI DJ</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c6c6c7] hover:text-white flex items-center justify-center transition-colors"
            title="Settings"
          >
            <span className="material-symbols-outlined text-lg">settings</span>
          </button>
        </div>
      </div>

      {/* If Not Authenticated: Prompt to Connect Spotify Account */}
      {!isAuthenticated && (
        <div className="mx-4 p-5 rounded-2xl bg-gradient-to-br from-[#1c2e20] via-[#162319] to-[#131313] border border-[#53e076]/30 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1db954] text-[#003914] flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="material-symbols-outlined text-2xl font-bold">radio</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight">
                Connect Your Spotify Account
              </h2>
              <p className="text-xs text-[#c6c6c7] mt-1 leading-relaxed">
                Authorize Soundscape with your Spotify account to load your real Liked Songs, authentic playlists, recently played tracks, top artists, and official Spotify album artwork.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={onOpenSync}
                  className="px-5 py-2.5 rounded-full bg-[#1db954] hover:bg-[#53e076] text-[#003914] text-xs font-extrabold flex items-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm fill-1">lock_open</span>
                  <span>Connect Spotify Account</span>
                </button>
                <button
                  onClick={onOpenSync}
                  className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-[#e5e2e1] text-xs font-semibold border border-white/10 transition-colors"
                >
                  Configure Client ID
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Access 6-Item Grid (Liked Songs + User Playlists) */}
      {isAuthenticated && quickItems.length > 0 && (
        <div className="px-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {quickItems.map((item) => (
              <div
                key={item.id}
                onClick={item.onClick}
                className="group flex items-center bg-[#201f1f]/70 hover:bg-[#201f1f] rounded-lg overflow-hidden cursor-pointer border border-white/5 transition-all duration-150 h-14"
              >
                {/* Image */}
                <div className="w-14 h-14 flex-shrink-0 bg-[#131313] relative overflow-hidden flex items-center justify-center">
                  {item.isLiked ? (
                    <div className="w-full h-full bg-gradient-to-br from-[#450af5] via-[#8e2de2] to-[#4a00e0] flex items-center justify-center text-white">
                      <span className="material-symbols-outlined text-xl fill-1">favorite</span>
                    </div>
                  ) : item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-2xl text-[#c6c6c7]">
                      queue_music
                    </span>
                  )}
                </div>

                <div className="flex-1 px-3 min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                    {item.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jump Back In / Recently Played Tracks Carousel */}
      {recentTracks.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#e5e2e1] tracking-tight">Jump Back In</h2>
              <p className="text-xs text-[#c6c6c7]">Recently played on your Spotify account</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {recentTracks.map((track) => {
              const isPlayingThis = isPlaying && currentTrack?.id === track.id;
              const artworkUrl = track.album?.images?.[0]?.url;

              return (
                <div
                  key={track.id}
                  id={`jump-back-${track.id}`}
                  className="group w-36 sm:w-44 flex-shrink-0 bg-[#201f1f]/60 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 transition-all duration-200"
                >
                  <div
                    onClick={() => onPlayTrack(track)}
                    className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 bg-[#131313] shadow-md cursor-pointer"
                  >
                    {artworkUrl ? (
                      <img
                        src={artworkUrl}
                        alt={track.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#181818] text-[#c6c6c7]">
                        <span className="material-symbols-outlined text-4xl">music_note</span>
                      </div>
                    )}
                    {isPlayingThis ? (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-4 bg-[#53e076] rounded-full animate-bounce" />
                          <span className="w-1.5 h-6 bg-[#53e076] rounded-full animate-bounce delay-75" />
                          <span className="w-1.5 h-3 bg-[#53e076] rounded-full animate-bounce delay-150" />
                        </div>
                      </div>
                    ) : (
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-9 h-9 rounded-full bg-[#53e076] text-[#003914] flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-xl fill-1">play_arrow</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <p
                    onClick={() => onPlayTrack(track)}
                    className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate hover:text-[#53e076] cursor-pointer"
                    title={track.name}
                  >
                    {track.name}
                  </p>

                  <p className="text-[11px] text-[#c6c6c7] truncate mt-0.5">
                    {track.artists?.map((a, i) => (
                      <span key={a.id || a.name}>
                        {i > 0 && ', '}
                        <button
                          type="button"
                          onClick={() => a.id && onSelectArtist(a.id)}
                          className="hover:underline hover:text-white"
                        >
                          {a.name}
                        </button>
                      </span>
                    ))}
                  </p>

                  {track.album?.id && (
                    <p className="text-[10px] text-[#53e076]/70 truncate mt-1">
                      <button
                        type="button"
                        onClick={() => onSelectAlbum(track.album.id!)}
                        className="hover:underline hover:text-[#53e076]"
                      >
                        {track.album.name}
                      </button>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Official Spotify Featured Playlists */}
      {featuredPlaylists.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#e5e2e1] tracking-tight">{featuredMessage}</h2>
              <p className="text-xs text-[#c6c6c7]">Curated playlists directly from Spotify</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {featuredPlaylists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => onSelectPlaylist(pl)}
                className="group w-36 sm:w-44 flex-shrink-0 bg-[#201f1f]/60 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 cursor-pointer transition-all duration-200"
              >
                <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 bg-[#131313] shadow-md">
                  {pl.images?.[0]?.url ? (
                    <img
                      src={pl.images[0].url}
                      alt={pl.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                      <span className="material-symbols-outlined text-4xl">queue_music</span>
                    </div>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                  {pl.name}
                </p>
                <p className="text-[11px] text-[#c6c6c7] line-clamp-2 mt-0.5 leading-relaxed">
                  {pl.description || `By ${pl.owner?.display_name || 'Spotify'}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Official Spotify New Releases */}
      {newReleases.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#e5e2e1] tracking-tight">New Releases</h2>
              <p className="text-xs text-[#c6c6c7]">Latest albums and singles on Spotify</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {newReleases.map((alb) => (
              <div
                key={alb.id}
                onClick={() => onSelectAlbum(alb.id)}
                className="group w-36 sm:w-44 flex-shrink-0 bg-[#201f1f]/60 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 cursor-pointer transition-all duration-200"
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
                  {alb.artists?.map((a) => a.name).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Made For You / User's Playlists Carousel */}
      {playlists.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#e5e2e1] tracking-tight">Your Playlists</h2>
              <p className="text-xs text-[#c6c6c7]">From your authentic Spotify account</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => onSelectPlaylist(pl)}
                className="group w-36 sm:w-44 flex-shrink-0 bg-[#201f1f]/60 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 cursor-pointer transition-all duration-200"
              >
                <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 bg-[#131313] shadow-md">
                  {pl.images?.[0]?.url ? (
                    <img
                      src={pl.images[0].url}
                      alt={pl.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                      <span className="material-symbols-outlined text-4xl">queue_music</span>
                    </div>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate">{pl.name}</p>
                <p className="text-[11px] text-[#c6c6c7] line-clamp-2 mt-0.5 leading-relaxed">
                  {pl.description || `${pl.tracks?.total || 0} songs`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popular / User's Top Artists Carousel (Circular Avatars) */}
      {artists.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[#e5e2e1] tracking-tight">Your Favorite Artists</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {artists.map((artist) => (
              <div
                key={artist.id}
                onClick={() => onSelectArtist(artist.id)}
                className="w-28 sm:w-32 flex-shrink-0 flex flex-col items-center text-center cursor-pointer group"
              >
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden mb-2 shadow-lg ring-2 ring-transparent group-hover:ring-[#53e076] transition-all bg-[#1c1c1c]">
                  {artist.images?.[0]?.url ? (
                    <img
                      src={artist.images[0].url}
                      alt={artist.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                      <span className="material-symbols-outlined text-4xl">person</span>
                    </div>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate w-full group-hover:text-[#53e076]">
                  {artist.name}
                </p>
                <p className="text-[10px] text-[#c6c6c7] uppercase tracking-wider mt-0.5">
                  Artist
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State when Authenticated but no playlists or tracks yet */}
      {isAuthenticated &&
        playlists.length === 0 &&
        recentTracks.length === 0 &&
        artists.length === 0 &&
        !isLoadingMore && (
          <div className="px-4 py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-[#53e076] mb-2">library_music</span>
            <h3 className="text-base font-bold text-[#e5e2e1]">Your Spotify library is ready</h3>
            <p className="text-xs text-[#c6c6c7] mt-1 max-w-sm mx-auto">
              Start listening on Spotify or save tracks to your library to populate your personalized Soundscape dashboard.
            </p>
          </div>
        )}
    </div>
  );
};
