// Playlist picker sheet (P12): add any playable track to a Soundscape-native playlist.
import React, { useState, useEffect } from 'react';
import type { SpotifyTrack } from '../types';
import {
  listLocalPlaylists,
  createLocalPlaylist,
  addTrackToPlaylist
} from '../core/playlists/localPlaylists';

interface PlaylistPickerProps {
  track: SpotifyTrack;
  onClose: () => void;
  onChanged?: () => void;
}

export const PlaylistPicker: React.FC<PlaylistPickerProps> = ({ track, onClose, onChanged }) => {
  const [playlists, setPlaylists] = useState<{ uri: string; name: string; count: number }[]>([]);
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const reload = () =>
    listLocalPlaylists()
      .then(setPlaylists)
      .catch(() => {});

  useEffect(() => {
    void reload();
  }, []);

  const add = async (uri: string, name: string) => {
    const res = await addTrackToPlaylist(uri, track);
    setNotice(res === 'added' ? `Added to “${name}”.` : `Already in “${name}”.`);
    onChanged?.();
    await reload();
  };

  const createAndAdd = async () => {
    if (!newName.trim()) return;
    try {
      const uri = await createLocalPlaylist(newName);
      setNewName('');
      await add(uri, newName.trim());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not create playlist');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#201f1f] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-black text-[#e5e2e1]">Add to playlist</h2>
            <p className="text-[11px] text-[#c6c6c7] truncate">{track.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2a2a2a] text-[#c6c6c7] flex items-center justify-center flex-shrink-0"
            aria-label="Close playlist picker"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createAndAdd();
            }}
            placeholder="New playlist name"
            maxLength={80}
            className="flex-1 px-3 py-2 bg-[#131313] text-xs text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
            aria-label="New playlist name"
          />
          <button onClick={createAndAdd} className="px-3 py-2 rounded-lg bg-[#53e076] text-[#003914] text-xs font-bold">
            Create
          </button>
        </div>

        {notice && <p className="text-[11px] text-[#53e076] font-semibold">{notice}</p>}

        {playlists.length === 0 ? (
          <p className="text-[11px] text-[#c6c6c7]">No playlists yet — create one above.</p>
        ) : (
          <div className="space-y-1">
            {playlists.map((p) => (
              <button
                key={p.uri}
                onClick={() => void add(p.uri, p.name)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#2a2a2a] text-left"
              >
                <span className="text-xs font-bold text-[#e5e2e1] truncate">{p.name}</span>
                <span className="text-[10px] font-mono text-[#c6c6c7] flex-shrink-0">{p.count} tracks</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
