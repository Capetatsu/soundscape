import React, { useState, useEffect } from 'react';
import { SpotifyPlaylist, SpotifyUser, SpotifyTrack } from '../types';
import { db } from '../core/db/database';
import { dbTrackToUi } from '../core/sync/toUi';
import { listLocalPlaylists } from '../core/playlists/localPlaylists';
import { LocalPlaylistScreen } from './LocalPlaylistScreen';

interface LibraryScreenProps {
  playlists: SpotifyPlaylist[];
  likedSongsCount: number;
  user: SpotifyUser | null;
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void;
  onOpenSync: () => void;
  onCreatePlaylist?: () => void;
  onPlayLocalFiles?: (files: File[]) => void;
  onPlayTrack?: (track: SpotifyTrack) => void;
  onPlayTracks?: (tracks: SpotifyTrack[]) => void;
  onQueueTracks?: (tracks: SpotifyTrack[]) => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  playlists,
  likedSongsCount,
  user,
  onSelectPlaylist,
  onOpenSync,
  onPlayLocalFiles,
  onPlayTrack,
  onPlayTracks,
  onQueueTracks
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'playlists'>('all');
  const [isGridView, setIsGridView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localTracks, setLocalTracks] = useState<SpotifyTrack[]>([]);
  const [myPlaylists, setMyPlaylists] = useState<{ uri: string; name: string; count: number }[]>([]);
  const [selectedPlaylistUri, setSelectedPlaylistUri] = useState<string | null>(null);
  const [playlistRefresh, setPlaylistRefresh] = useState(0);

  // Previously played device files (metadata only — blobs don't survive reload).
  useEffect(() => {
    let live = true;
    db.getTracksByProvider('local', 50)
      .then((rows) => {
        if (live && rows.length > 0) setLocalTracks(rows.map(dbTrackToUi));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Soundscape-native playlists.
  useEffect(() => {
    let live = true;
    listLocalPlaylists()
      .then((rows) => {
        if (live) setMyPlaylists(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [playlistRefresh]);

  if (selectedPlaylistUri) {
    return (
      <LocalPlaylistScreen
        uri={selectedPlaylistUri}
        onBack={() => setSelectedPlaylistUri(null)}
        onChanged={() => setPlaylistRefresh((n) => n + 1)}
        onPlayTracks={onPlayTracks ?? (() => {})}
        onQueueTracks={onQueueTracks ?? (() => {})}
        onPlayTrack={onPlayTrack ?? (() => {})}
      />
    );
  }

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

      {/* Local files: your own audio, played on-device (FLAC/MP3/AAC/WAV/OGG) */}
      <div className="p-3.5 rounded-2xl bg-[#201f1f] border border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="material-symbols-outlined text-[#53e076] text-xl">folder_open</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#e5e2e1]">Play files from this device</p>
            <p className="text-[11px] text-[#c6c6c7] truncate">Your own FLAC, MP3, AAC, WAV or OGG files</p>
          </div>
        </div>
        <label className="px-3 py-2 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-bold cursor-pointer flex-shrink-0">
          Choose files
          <input
            type="file"
            accept="audio/*,.flac,.mp3,.m4a,.aac,.wav,.ogg,.opus"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length === 0) return;
              const bad = files.find((f) => !f.type.startsWith('audio/') && !/\.(flac|mp3|m4a|aac|wav|ogg|opus)$/i.test(f.name));
              if (bad) {
                setLocalError(`"${bad.name}" is not a supported audio file.`);
                return;
              }
              setLocalError(null);
              onPlayLocalFiles?.(files);
            }}
          />
        </label>
      </div>
      {localError && <p className="text-[11px] text-[#ffb4ab]">{localError}</p>}

      {/* Soundscape playlists (local, no account needed) */}
      {myPlaylists.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-[#e5e2e1] mb-2">Your playlists</h2>
          <div className="space-y-1">
            {myPlaylists.map((p) => (
              <div
                key={p.uri}
                onClick={() => setSelectedPlaylistUri(p.uri)}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#201f1f] cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#53e076]/10 flex-shrink-0 flex items-center justify-center text-[#53e076]">
                  <span className="material-symbols-outlined text-lg">playlist_play</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#e5e2e1] truncate">{p.name}</p>
                  <p className="text-[11px] text-[#c6c6c7]">{p.count} tracks · stored on this device</p>
                </div>
                <span className="material-symbols-outlined text-[#c6c6c7] group-hover:text-white">chevron_right</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previously played device files: metadata persists, audio needs re-adding after reload */}
      {localTracks.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-[#e5e2e1] mb-2">On this device · heard before</h2>
          <div className="space-y-1">
            {localTracks.map((t) => (
              <div
                key={t.id}
                onClick={() => onPlayTrack?.(t)}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#201f1f] cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#131313] flex-shrink-0 flex items-center justify-center text-[#c6c6c7]">
                  <span className="material-symbols-outlined text-lg">audio_file</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#e5e2e1] truncate">{t.name}</p>
                  <p className="text-[11px] text-[#c6c6c7] truncate">
                    {t.artists?.map((a) => a.name).join(', ')} · needs re-adding after reload
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#c6c6c7] group-hover:text-white">play_arrow</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
