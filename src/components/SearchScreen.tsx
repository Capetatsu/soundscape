import React, { useState, useEffect, useMemo } from 'react';
import { SpotifyTrack, SpotifyArtist, SpotifyAlbum, SpotifyPlaylist } from '../types';
import { SpotifyApiClient } from '../services/spotifyApi';
import { audiusSearchTracks, type AudiusTrack } from '../core/providers/audius/audiusClient';
import { archiveSearchRecordings, type ArchiveRecording } from '../core/providers/archive/archiveClient';
import {
  jamendoSearchTracks,
  jamendoConfigured,
  jamendoQualityLabel,
  type JamendoTrack
} from '../core/providers/jamendo/jamendoClient';
import { ArtworkImg } from './ArtworkImg';

function jamendoToUiTrack(t: JamendoTrack): SpotifyTrack {
  return {
    id: `jamendo-${t.id}`,
    uri: `jamendo:track:${t.id}`,
    name: t.name,
    artists: [{ name: t.artistName }],
    album: {
      name: t.albumName || 'Jamendo open catalogue',
      images: t.albumImage ? [{ url: t.albumImage }] : []
    },
    duration_ms: t.durationSec * 1000,
    preview_url: null,
    explicit: false,
    lyrics: t.lyrics ? [t.lyrics] : undefined
  };
}

function audiusToUiTrack(t: AudiusTrack): SpotifyTrack {
  return {
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
  };
}

interface SearchScreenProps {
  onPlayTrack: (track: SpotifyTrack) => void;
  onAddToQueue?: (track: SpotifyTrack) => void;
  onAddToPlaylist?: (track: SpotifyTrack) => void;
  onPlayArchiveRecording?: (rec: ArchiveRecording) => void;
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void;
  onSelectAlbum: (albumId: string) => void;
  onSelectArtist: (artistId: string) => void;
  onOpenSync: () => void;
  isAuthenticated: boolean;
  featuredTracks: SpotifyTrack[];
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  onPlayTrack,
  onAddToQueue,
  onAddToPlaylist,
  onPlayArchiveRecording,
  onSelectPlaylist,
  onSelectAlbum,
  onSelectArtist,
  onOpenSync,
  isAuthenticated,
  featuredTracks
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'songs' | 'artists' | 'albums' | 'playlists'>('all');
  // Real search history: persisted locally, starts empty. Never hardcoded names.
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('soundscape_recent_searches');
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, 8) : [];
    } catch {
      return [];
    }
  });
  const [isSearching, setIsSearching] = useState(false);
  const [audiusTracks, setAudiusTracks] = useState<SpotifyTrack[]>([]);
  const [audiusFailed, setAudiusFailed] = useState(false);
  const [archiveRecs, setArchiveRecs] = useState<ArchiveRecording[]>([]);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [jamendoTracks, setJamendoTracks] = useState<{ track: SpotifyTrack; format: string }[]>([]);
  const [hasMoreAudius, setHasMoreAudius] = useState(false);
  const [hasMoreJamendo, setHasMoreJamendo] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Unified free-catalogue ranking: Jamendo (FLAC-capable) first, then Audius,
  // exact title+artist duplicates merged to the higher-quality source.
  const freeTracks = useMemo(() => {
    const keyOf = (t: SpotifyTrack) => {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      return `${norm(t.name)}|${norm(t.artists?.[0]?.name ?? '')}`;
    };
    const seen = new Set<string>();
    const rows: { track: SpotifyTrack; source: string; format: string }[] = [];
    for (const { track, format } of jamendoTracks) {
      const k = keyOf(track);
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ track, source: 'Jamendo', format });
    }
    for (const track of audiusTracks) {
      const k = keyOf(track);
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ track, source: 'Audius', format: 'MP3' });
    }
    return rows;
  }, [jamendoTracks, audiusTracks]);

  const loadMoreOpen = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const [moreA, moreJ] = await Promise.all([
        hasMoreAudius ? audiusSearchTracks(query, 10, audiusTracks.length).catch(() => []) : [],
        hasMoreJamendo && jamendoConfigured()
          ? jamendoSearchTracks(query, 10, jamendoTracks.length).catch(() => [])
          : []
      ]);
      if (moreA.length > 0) {
        setAudiusTracks((prev) => [...prev, ...moreA.map(audiusToUiTrack)]);
        setHasMoreAudius(moreA.length === 10);
      } else {
        setHasMoreAudius(false);
      }
      if (moreJ.length > 0) {
        setJamendoTracks((prev) => [...prev, ...moreJ.map((t) => ({ track: jamendoToUiTrack(t), format: jamendoQualityLabel(t) }))]);
        setHasMoreJamendo(moreJ.length === 10);
      } else {
        setHasMoreJamendo(false);
      }
    } finally {
      setLoadingMore(false);
    }
  };
  const [searchResults, setSearchResults] = useState<{
    tracks: SpotifyTrack[];
    artists: SpotifyArtist[];
    albums: SpotifyAlbum[];
    playlists: SpotifyPlaylist[];
  }>({
    tracks: [],
    artists: [],
    albums: [],
    playlists: []
  });

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' },
    { id: 'playlists', label: 'Playlists' }
  ];

  const genreCards = [
    { id: 'pop', title: 'Pop', color: 'from-pink-600 to-purple-800' },
    { id: 'dance', title: 'Dance / Electronic', color: 'from-teal-600 to-cyan-900' },
    { id: 'hiphop', title: 'Hip-Hop', color: 'from-amber-600 to-red-900' },
    { id: 'indie', title: 'Indie & Alt', color: 'from-emerald-600 to-teal-900' },
    { id: 'rnb', title: 'R&B / Soul', color: 'from-purple-700 to-indigo-950' },
    { id: 'rock', title: 'Rock', color: 'from-red-600 to-zinc-900' },
    { id: 'chill', title: 'Chill & Ambient', color: 'from-blue-600 to-indigo-900' },
    { id: 'focus', title: 'Deep Focus', color: 'from-emerald-700 to-lime-950' }
  ];

  // Debounced search: Spotify (when connected) + free catalogue (always, no login).
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults({ tracks: [], artists: [], albums: [], playlists: [] });
      setAudiusTracks([]);
      setAudiusFailed(false);
      setArchiveRecs([]);
      setArchiveFailed(false);
      setJamendoTracks([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      recordSearch(query);
      // Free catalogue first: works without any account, full-length tracks.
      try {
        const open = await audiusSearchTracks(query, 10);
        if (!cancelled) {
          setAudiusTracks(open.map(audiusToUiTrack));
          setHasMoreAudius(open.length === 10);
          setAudiusFailed(false);
        }
      } catch {
        if (!cancelled) {
          setAudiusTracks([]);
          setHasMoreAudius(false);
          setAudiusFailed(true);
        }
      }
      // Archive recordings: live concerts + netlabels, no account either.
      try {
        const recs = await archiveSearchRecordings(query, 6);
        if (!cancelled) {
          setArchiveRecs(recs);
          setArchiveFailed(false);
        }
      } catch {
        if (!cancelled) {
          setArchiveRecs([]);
          setArchiveFailed(true);
        }
      }
      // Jamendo: only when configured — otherwise the provider stays off, honestly.
      if (jamendoConfigured()) {
        try {
          const jt = await jamendoSearchTracks(query, 10);
          if (!cancelled) {
            setJamendoTracks(jt.map((t) => ({ track: jamendoToUiTrack(t), format: jamendoQualityLabel(t) })));
            setHasMoreJamendo(jt.length === 10);
          }
        } catch {
          if (!cancelled) {
            setJamendoTracks([]);
            setHasMoreJamendo(false);
          }
        }
      } else if (!cancelled) {
        setJamendoTracks([]);
        setHasMoreJamendo(false);
      }
      if (isAuthenticated) {
        try {
          const res = await SpotifyApiClient.search(query, 'track,artist,album,playlist', 10);
          if (!cancelled) {
            setSearchResults({
              tracks: res.tracks?.items || [],
              artists: res.artists?.items || [],
              albums: res.albums?.items || [],
              playlists: res.playlists?.items?.filter(Boolean) || []
            });
          }
        } catch {
          if (!cancelled) performLocalSearch(query);
        }
      } else {
        performLocalSearch(query);
      }
      if (!cancelled) setIsSearching(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isAuthenticated]);

  const performLocalSearch = (q: string) => {
    const cleanQ = q.toLowerCase();
    const matchedTracks = featuredTracks.filter(
      (t) =>
        t.name.toLowerCase().includes(cleanQ) ||
        t.artists?.some((a) => a.name.toLowerCase().includes(cleanQ)) ||
        t.album?.name?.toLowerCase().includes(cleanQ)
    );
    setSearchResults({
      tracks: matchedTracks,
      artists: [],
      albums: [],
      playlists: []
    });
  };

  const persistRecent = (items: string[]) => {
    setRecentSearches(items);
    try {
      localStorage.setItem('soundscape_recent_searches', JSON.stringify(items));
    } catch {
      // storage full/blocked: history simply won't persist
    }
  };

  const removeRecent = (item: string) => {
    persistRecent(recentSearches.filter((s) => s !== item));
  };

  const recordSearch = (q: string) => {
    const clean = q.trim().slice(0, 80);
    if (!clean) return;
    persistRecent([clean, ...recentSearches.filter((s) => s !== clean)].slice(0, 8));
  };

  const topResult = searchResults.tracks[0];

  return (
    <div className="pb-28 pt-2 px-4 space-y-5">
      {/* Sticky Search Input Bar */}
      <div className="relative flex items-center">
        <span className="material-symbols-outlined absolute left-3.5 text-[#c6c6c7] text-xl">
          search
        </span>
        <input
          id="search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to listen to?"
          className="w-full pl-10 pr-12 py-3 bg-[#201f1f] text-[#e5e2e1] placeholder-[#c6c6c7] rounded-full text-sm font-semibold border border-white/5 focus:border-[#53e076] focus:outline-none transition-all shadow-inner"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3.5 w-7 h-7 flex items-center justify-center text-[#c6c6c7] hover:text-white"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        )}
      </div>

      {/* Filter Pills Bar */}
      {query && (
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
      )}

      {/* Connect Spotify Warning if searching without login */}
      {!isAuthenticated && (
        <div className="p-3.5 rounded-xl bg-[#201f1f] border border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-400 text-lg">info</span>
            <p className="text-xs text-[#c6c6c7]">
              Connect your Spotify account for full global search and official metadata.
            </p>
          </div>
          <button
            onClick={onOpenSync}
            className="px-3 py-1 rounded-full bg-[#1db954] text-[#003914] text-[11px] font-bold"
          >
            Connect
          </button>
        </div>
      )}

      {/* Recent Searches (when query is empty) */}
      {!query && recentSearches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold text-[#e5e2e1]">Recent searches</h2>
            <button
              onClick={() => persistRecent([])}
              className="text-xs font-semibold text-[#c6c6c7] hover:text-[#53e076]"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((item) => (
              <div
                key={item}
                onClick={() => setQuery(item)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#201f1f] hover:bg-[#2a2a2a] border border-white/5 rounded-full text-xs font-semibold text-[#e5e2e1] cursor-pointer transition-colors"
              >
                <span>{item}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecent(item);
                  }}
                  className="text-[#c6c6c7] hover:text-white ml-0.5"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results Display */}
      {query ? (
        <div className="space-y-5">
          {isSearching ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#c6c6c7] gap-3">
              <span className="w-6 h-6 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-medium">Searching Spotify catalog...</span>
            </div>
          ) : (
            <>
              {/* Unified free catalogue: Jamendo first (FLAC-capable), then Audius. Full-length, no login. */}
              {(activeFilter === 'all' || activeFilter === 'songs') && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <h2 className="text-base font-bold text-[#e5e2e1]">Free catalogue</h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#53e076]/20 text-[#53e076] text-[9px] font-extrabold uppercase">
                      Full tracks{jamendoConfigured() ? ' · Jamendo + Audius' : ' · Audius'}
                    </span>
                  </div>
                  {audiusFailed && freeTracks.length === 0 ? (
                    <p className="text-xs text-[#c6c6c7] py-3">
                      Free catalogue is unreachable right now. Spotify results (if connected) still work for discovery.
                    </p>
                  ) : freeTracks.length === 0 && !isSearching ? (
                    <p className="text-xs text-[#c6c6c7] py-3">
                      No free-catalogue match for "{query}" — try different keywords, or browse device files in Your Library.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {freeTracks.map(({ track, source, format }) => (
                          <div
                            key={track.id}
                            onClick={() => onPlayTrack(track)}
                            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#201f1f] cursor-pointer transition-colors group"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#131313] flex-shrink-0">
                                <ArtworkImg
                                  src={track.album?.images?.[0]?.url}
                                  alt={track.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                                  {track.name}
                                </p>
                                <p className="text-xs text-[#c6c6c7] truncate">
                                  {track.artists?.map((a) => a.name).join(', ')} · {source} · {format}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlayTrack(track);
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[#53e076] hover:bg-[#53e076]/10"
                                title={`Play full track (${source}, ${format})`}
                              >
                                <span className="material-symbols-outlined text-xl">play_arrow</span>
                              </button>
                              {onAddToQueue && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddToQueue(track);
                                  }}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#c6c6c7] hover:text-white hover:bg-white/5"
                                  title="Add to queue"
                                >
                                  <span className="material-symbols-outlined text-lg">playlist_add</span>
                                </button>
                              )}
                              {onAddToPlaylist && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddToPlaylist(track);
                                  }}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#c6c6c7] hover:text-white hover:bg-white/5"
                                  title="Add to a Soundscape playlist"
                                >
                                  <span className="material-symbols-outlined text-lg">library_add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {(hasMoreAudius || hasMoreJamendo) && (
                        <button
                          onClick={() => void loadMoreOpen()}
                          disabled={loadingMore}
                          className="mt-2 w-full py-2.5 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] text-xs font-bold disabled:opacity-50"
                        >
                          {loadingMore ? 'Loading…' : 'Show more free-catalogue results'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Live & archive recordings (Internet Archive): full concerts, no login */}
              {(activeFilter === 'all' || activeFilter === 'songs') && (archiveRecs.length > 0 || archiveFailed) && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <h2 className="text-base font-bold text-[#e5e2e1]">Live & archive</h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#53e076]/20 text-[#53e076] text-[9px] font-extrabold uppercase">
                      Concerts · Archive
                    </span>
                  </div>
                  {archiveFailed ? (
                    <p className="text-xs text-[#c6c6c7] py-3">
                      Archive is unreachable right now.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {archiveRecs.map((rec) => (
                        <div
                          key={rec.identifier}
                          onClick={() => onPlayArchiveRecording?.(rec)}
                          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#201f1f] cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-[#131313] flex-shrink-0 flex items-center justify-center text-[#53e076]">
                              <span className="material-symbols-outlined text-lg">live_tv</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                                {rec.title}
                              </p>
                              <p className="text-xs text-[#c6c6c7] truncate">
                                {rec.artist}{rec.date ? ` • ${rec.date.slice(0, 10)}` : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlayArchiveRecording?.(rec);
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#53e076]/10 text-[#53e076] text-[11px] font-bold hover:bg-[#53e076]/20 flex-shrink-0"
                            title="Play recording (resolves tracks, plays first, queues rest)"
                          >
                            Play set
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[#c6c6c7] mt-1.5">
                    Audience recordings vary in quality — that's the nature of live tapes, shown honestly.
                  </p>
                </div>
              )}

              {/* Top Result Card */}
              {(activeFilter === 'all' || activeFilter === 'songs') && topResult && (
                <div>
                  <h2 className="text-base font-bold text-[#e5e2e1] mb-2.5">Top result</h2>
                  <div
                    id="search-top-result"
                    onClick={() => onPlayTrack(topResult)}
                    className="p-4 bg-[#201f1f] hover:bg-[#2a2a2a] border border-white/5 rounded-2xl cursor-pointer transition-all duration-200 group relative shadow-md"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden mb-3 bg-[#131313] shadow-md">
                      {topResult.album?.images?.[0]?.url ? (
                        <img
                          src={topResult.album.images[0].url}
                          alt={topResult.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                          <span className="material-symbols-outlined text-3xl">music_note</span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-lg font-black text-[#e5e2e1] truncate group-hover:text-white">
                      {topResult.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-full bg-[#131313] text-[10px] font-bold uppercase tracking-wider text-[#53e076]">
                        Song
                      </span>
                      <span className="text-xs text-[#c6c6c7] truncate">
                        {topResult.artists?.map((a) => a.name).join(', ')}
                      </span>
                    </div>

                    <div className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-[#53e076] text-[#003914] flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-200">
                      <span className="material-symbols-outlined text-2xl fill-1">play_arrow</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Artists Results */}
              {(activeFilter === 'all' || activeFilter === 'artists') &&
                searchResults.artists.length > 0 && (
                  <div>
                    <h2 className="text-base font-bold text-[#e5e2e1] mb-2.5">Artists</h2>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                      {searchResults.artists.map((artist) => (
                        <div
                          key={artist.id}
                          onClick={() => onSelectArtist(artist.id)}
                          className="w-28 flex-shrink-0 flex flex-col items-center text-center cursor-pointer group"
                        >
                          <div className="w-24 h-24 rounded-full overflow-hidden mb-2 bg-[#1c1c1c] ring-2 ring-transparent group-hover:ring-[#53e076] transition-all">
                            {artist.images?.[0]?.url ? (
                              <img
                                src={artist.images[0].url}
                                alt={artist.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                                <span className="material-symbols-outlined text-3xl">person</span>
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-bold text-[#e5e2e1] truncate w-full group-hover:text-[#53e076]">
                            {artist.name}
                          </p>
                          <p className="text-[10px] text-[#c6c6c7] uppercase">Artist</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Albums Results */}
              {(activeFilter === 'all' || activeFilter === 'albums') &&
                searchResults.albums.length > 0 && (
                  <div>
                    <h2 className="text-base font-bold text-[#e5e2e1] mb-2.5">Albums</h2>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                      {searchResults.albums.map((alb) => (
                        <div
                          key={alb.id}
                          onClick={() => onSelectAlbum(alb.id)}
                          className="w-32 flex-shrink-0 bg-[#201f1f]/60 hover:bg-[#201f1f] p-2.5 rounded-xl border border-white/5 cursor-pointer group"
                        >
                          <div className="w-full aspect-square rounded-lg overflow-hidden mb-2 bg-[#131313]">
                            {alb.images?.[0]?.url ? (
                              <img
                                src={alb.images[0].url}
                                alt={alb.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                                <span className="material-symbols-outlined text-3xl">album</span>
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-bold text-[#e5e2e1] truncate group-hover:text-white">
                            {alb.name}
                          </p>
                          <p className="text-[10px] text-[#c6c6c7] truncate mt-0.5">
                            {alb.artists?.map((a) => a.name).join(', ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Tracks List */}
              {(activeFilter === 'all' || activeFilter === 'songs') &&
                searchResults.tracks.length > 0 && (
                  <div>
                    <h2 className="text-base font-bold text-[#e5e2e1] mb-2.5">Songs</h2>
                    <div className="space-y-1">
                      {searchResults.tracks.slice(0, 10).map((track) => (
                        <div
                          key={track.id}
                          onClick={() => onPlayTrack(track)}
                          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#201f1f] cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              onClick={(e) => {
                                if (track.album?.id) {
                                  e.stopPropagation();
                                  onSelectAlbum(track.album.id);
                                }
                              }}
                              className="w-10 h-10 rounded-lg overflow-hidden bg-[#131313] flex-shrink-0"
                            >
                              {track.album?.images?.[0]?.url ? (
                                <img
                                  src={track.album.images[0].url}
                                  alt={track.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                                  <span className="material-symbols-outlined text-sm">music_note</span>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[#e5e2e1] truncate group-hover:text-white">
                                {track.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-xs text-[#c6c6c7]">
                                {track.explicit && (
                                  <span className="px-1 text-[8px] font-bold bg-[#454747] text-[#c6c6c7] rounded uppercase">
                                    E
                                  </span>
                                )}
                                <span className="truncate">
                                  {track.artists?.map((a, i) => (
                                    <span key={a.id || a.name}>
                                      {i > 0 && ', '}
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
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPlayTrack(track);
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[#c6c6c7] hover:text-white"
                            >
                              <span className="material-symbols-outlined text-xl">play_arrow</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Playlists Results */}
              {(activeFilter === 'all' || activeFilter === 'playlists') &&
                searchResults.playlists.length > 0 && (
                  <div>
                    <h2 className="text-base font-bold text-[#e5e2e1] mb-2.5">Playlists</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {searchResults.playlists.map((pl) => (
                        <div
                          key={pl.id}
                          onClick={() => onSelectPlaylist(pl)}
                          className="bg-[#201f1f]/50 hover:bg-[#201f1f] p-3 rounded-xl border border-white/5 cursor-pointer group"
                        >
                          <div className="aspect-square w-full rounded-lg overflow-hidden mb-2 bg-[#131313]">
                            {pl.images?.[0]?.url ? (
                              <img
                                src={pl.images[0].url}
                                alt={pl.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#c6c6c7]">
                                <span className="material-symbols-outlined text-3xl">queue_music</span>
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-bold text-[#e5e2e1] truncate group-hover:text-white">
                            {pl.name}
                          </p>
                          <p className="text-[10px] text-[#c6c6c7] truncate mt-0.5">
                            By {pl.owner?.display_name || 'Spotify'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* No results message */}
              {searchResults.tracks.length === 0 &&
                searchResults.artists.length === 0 &&
                searchResults.albums.length === 0 && (
                  <div className="py-12 text-center text-[#c6c6c7]">
                    <span className="material-symbols-outlined text-4xl mb-2 text-[#53e076]">
                      search_off
                    </span>
                    <p className="text-sm font-bold text-[#e5e2e1]">No results found for "{query}"</p>
                    <p className="text-xs mt-1">Check spelling or try different keywords.</p>
                  </div>
                )}
            </>
          )}
        </div>
      ) : (
        /* Browse All Genre Tiles */
        <div>
          <h2 className="text-base font-bold text-[#e5e2e1] mb-3 tracking-tight">Browse all</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {genreCards.map((genre) => (
              <div
                key={genre.id}
                onClick={() => setQuery(genre.title)}
                className={`h-24 sm:h-28 rounded-xl p-3.5 bg-gradient-to-br ${genre.color} relative overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-md group`}
              >
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">
                  {genre.title}
                </h3>
                <span className="material-symbols-outlined absolute bottom-2 right-2 text-4xl text-white/20 group-hover:text-white/40 transition-colors">
                  graphic_eq
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
