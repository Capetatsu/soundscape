import React, { useState } from 'react';
import { SpotifyPlaylist, SpotifyUser } from '../types';

interface LibraryScreenProps {
  playlists: SpotifyPlaylist[];
  likedSongsCount: number;
  user: SpotifyUser | null;
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void;
  onOpenSync: () => void;
  onCreatePlaylist?: () => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  playlists,
  likedSongsCount,
  user,
  onSelectPlaylist,
  onOpenSync
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'playlists'>('all');
  const [isGridView, setIsGridView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'playlists', label: 'Playlists' }
  ];

  const filteredPlaylists = playlists.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pb-28 pt-2 px-4 space-y-4">
      {/* Top Library Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onOpenSync} className="relative" title="Account settings">
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
                user ? 'bg-[#53e076]' : 'bg-amber-400'
              }`}
            />
          </button>
          <h1 className="text-xl font-extrabold text-[#e5e2e1] tracking-tight">Your Library</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSync}
            className="px-3 py-1 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#53e076] border border-[#53e076]/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id as any)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              activeFilter === tab.id
                ? 'bg-[#53e076] text-[#003914]'
                : 'bg-[#201f1f] text-[#e5e2e1] hover:bg-[#2a2a2a] border border-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sorting & Layout View Bar */}
      <div className="flex items-center justify-between text-xs font-semibold text-[#c6c6c7] pt-1">
        <div className="flex items-center gap-1 cursor-pointer hover:text-white">
          <span className="material-symbols-outlined text-sm">swap_vert</span>
          <span>Recents</span>
        </div>

        <button
          onClick={() => setIsGridView(!isGridView)}
          className="w-8 h-8 flex items-center justify-center hover:text-white"
          title={isGridView ? 'Switch to List' : 'Switch to Grid'}
        >
          <span className="material-symbols-outlined text-lg">
            {isGridView ? 'view_list' : 'grid_view'}
          </span>
        </button>
      </div>

      {/* Library Stream */}
      <div className={isGridView ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
        {/* Pinned Liked Songs Entry */}
        <div
          id="library-liked-songs-item"
          onClick={() => {
            const likedPlaylist = playlists.find((p) => p.id === 'liked-songs') || {
              id: 'liked-songs',
              uri: 'spotify:collection:tracks',
              name: 'Liked Songs',
              description: 'Your authentic saved Spotify songs',
              images: [],
              tracks: { total: likedSongsCount },
              owner: { display_name: user?.display_name || 'You', id: user?.id || 'me' }
            };
            onSelectPlaylist(likedPlaylist);
          }}
          className={`group flex ${
            isGridView ? 'flex-col p-3 rounded-2xl' : 'items-center gap-3.5 p-2 rounded-xl'
          } bg-[#201f1f]/50 hover:bg-[#201f1f] cursor-pointer transition-colors`}
        >
          <div
            className={`relative ${
              isGridView ? 'w-full aspect-square mb-2.5 rounded-xl' : 'w-14 h-14 rounded-lg'
            } bg-gradient-to-br from-[#450af5] via-[#8e2de2] to-[#4a00e0] flex items-center justify-center text-white shadow-md flex-shrink-0`}
          >
            <span className="material-symbols-outlined text-2xl fill-1">favorite</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#53e076] text-xs fill-1">push_pin</span>
              <p className="text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                Liked Songs
              </p>
            </div>
            <p className="text-xs text-[#c6c6c7] truncate mt-0.5">
              Playlist • {likedSongsCount} songs
            </p>
          </div>
        </div>

        {/* Dynamic Authentic Spotify Playlists */}
        {filteredPlaylists
          .filter((p) => p.id !== 'liked-songs')
          .map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectPlaylist(item)}
              className={`group flex ${
                isGridView ? 'flex-col p-3 rounded-2xl' : 'items-center gap-3.5 p-2 rounded-xl'
              } bg-[#201f1f]/30 hover:bg-[#201f1f] cursor-pointer transition-colors`}
            >
              <div
                className={`${
                  isGridView ? 'w-full aspect-square mb-2.5 rounded-xl' : 'w-14 h-14 rounded-lg'
                } bg-[#0e0e0e] overflow-hidden flex-shrink-0 shadow-md flex items-center justify-center`}
              >
                {item.images?.[0]?.url ? (
                  <img
                    src={item.images[0].url}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="material-symbols-outlined text-2xl text-[#c6c6c7]">
                    queue_music
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                  {item.name}
                </p>
                <p className="text-xs text-[#c6c6c7] truncate mt-0.5">
                  Playlist • {item.owner?.display_name || 'Spotify'}
                </p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
