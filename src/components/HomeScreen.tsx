import React, { useState, useEffect } from 'react';
import { SpotifyPlaylist, SpotifyTrack, SpotifyArtist, SpotifyUser } from '../types';
import { audiusTrending, type AudiusTrack } from '../core/providers/audius/audiusClient';
import { ArtworkImg } from './ArtworkImg';

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
  const [trending, setTrending] = useState<SpotifyTrack[]>([]);
  const [trendingFailed, setTrendingFailed] = useState(false);

  // Discovery shelf: Audius trending (free catalogue, no login).
  // Spotify browse/new-releases endpoints were removed under Dev Mode — not called.
  useEffect(() => {
    let isMounted = true;
    audiusTrending(undefined, 10)
      .then((items: AudiusTrack[]) => {
        if (!isMounted) return;
        setTrending(
          items.map((t) => ({
            id: `audius-${t.id}`,
            uri: `audius:track:${t.id}`,
            name: t.title,
            artists: [{ name: t.artistName }],
            album: {
              name: 'Audius open catalogue',
              images: t.artworkUrl ? [{ url: t.artworkUrl }] : []
            },
            duration_ms: t.durationSec * 1000,
            preview_url: null,
            explicit: false
          }))
        );
      })
      .catch((err) => {
        console.warn('Could not fetch Audius trending:', err);
        if (isMounted) setTrendingFailed(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
                  isAuthenticated ? 'bg-[#53e076] animate-pulse' : 'bg-[#53e076]'
                }`}
              />
              <span>{isAuthenticated ? 'Spotify library connected' : 'Free catalogue ready — no login needed'}</span>
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

      {/* If Not Authenticated: small optional Spotify library upsell (never the focus) */}
      {!isAuthenticated && (
        <div className="mx-4 p-4 rounded-2xl bg-[#1c1b1b] border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1db954]/15 text-[#53e076] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl">library_add</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#e5e2e1]">
                Have Spotify playlists? Import them.
              </p>
              <p className="text-[11px] text-[#c6c6c7] mt-0.5">
                Optional library sync — the free catalogue already plays without any account.
              </p>
            </div>
            <button
              onClick={onOpenSync}
              className="px-4 py-2 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-bold flex-shrink-0"
            >
              Connect
            </button>
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

      {/* Trending now: free catalogue, playable without any account */}
      {trending.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-[#e5e2e1] tracking-tight">Trending now</h2>
              <p className="text-xs text-[#c6c6c7]">Full tracks from the free catalogue · Audius</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {trending.map((track) => (
              <div
                key={track.id}
                onClick={() => onPlayTrack(track)}
                className="group w-36 sm:w-44 flex-shrink-0 bg-[#201f1f]/60 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 cursor-pointer transition-all duration-200"
              >
                <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 bg-[#131313] shadow-md">
                  <ArtworkImg
                    src={track.album?.images?.[0]?.url}
                    alt={track.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    fallbackIcon="music_note"
                  />
                  <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-[#53e076] text-[#003914] items-center justify-center shadow-xl hidden group-hover:flex">
                    <span className="material-symbols-outlined text-xl fill-1">play_arrow</span>
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                  {track.name}
                </p>
                <p className="text-[11px] text-[#c6c6c7] truncate mt-0.5">
                  {track.artists?.map((a) => a.name).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {trendingFailed && trending.length === 0 && (
        <div className="px-4">
          <p className="text-xs text-[#c6c6c7]">
            Trending shelf is unreachable right now — search still works for the free catalogue.
          </p>
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
        artists.length === 0 && (
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
