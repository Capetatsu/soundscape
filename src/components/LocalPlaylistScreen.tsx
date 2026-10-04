// Soundscape-native playlist detail (P12): rename/delete/play/queue/remove/reorder.
// Fully local — independent of Spotify.
import React, { useState, useEffect } from 'react';
import type { SpotifyTrack } from '../types';
import {
  getLocalPlaylistDetail,
  renameLocalPlaylist,
  deleteLocalPlaylist,
  removeTrackFromPlaylist,
  moveTrackInPlaylist,
  type LocalPlaylistDetail
} from '../core/playlists/localPlaylists';

interface LocalPlaylistScreenProps {
  uri: string;
  onBack: () => void;
  onChanged: () => void;
  onPlayTracks: (tracks: SpotifyTrack[]) => void;
  onQueueTracks: (tracks: SpotifyTrack[]) => void;
  onPlayTrack: (track: SpotifyTrack) => void;
}

export const LocalPlaylistScreen: React.FC<LocalPlaylistScreenProps> = ({
  uri,
  onBack,
  onChanged,
  onPlayTracks,
  onQueueTracks,
  onPlayTrack
}) => {
  const [detail, setDetail] = useState<LocalPlaylistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = async () => {
    try {
      const d = await getLocalPlaylistDetail(uri);
      setDetail(d);
      setName(d.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load playlist');
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const doRename = async () => {
    try {
      await renameLocalPlaylist(uri, name);
      setEditing(false);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    }
  };

  const doDelete = async () => {
    await deleteLocalPlaylist(uri);
    onChanged();
    onBack();
  };

  if (error && !detail) {
    return (
      <div className="pb-28 pt-2 px-4 space-y-4 max-w-2xl mx-auto">
        <button onClick={onBack} className="text-xs font-bold text-[#c6c6c7] hover:text-white">← Library</button>
        <p className="text-sm text-[#ffb4ab]">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-28 pt-2 px-4 space-y-4 max-w-2xl mx-auto">
      <button onClick={onBack} className="text-xs font-bold text-[#c6c6c7] hover:text-white">← Library</button>

      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="flex-1 px-3 py-2 bg-[#131313] text-sm text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
              aria-label="Playlist name"
            />
            <button onClick={doRename} className="px-3 py-2 rounded-lg bg-[#53e076] text-[#003914] text-xs font-bold">Save</button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg bg-[#2a2a2a] text-xs font-bold">Cancel</button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-black text-[#e5e2e1] truncate">{detail?.name ?? '…'}</h2>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-[11px] font-bold" title="Rename playlist">Rename</button>
              {confirmDelete ? (
                <>
                  <button onClick={doDelete} className="px-3 py-1.5 rounded-lg bg-red-900/60 text-[#ffb4ab] text-[11px] font-bold" title="Confirm delete">Delete?</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-[11px] font-bold">Keep</button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-[11px] font-bold text-[#ffb4ab]" title="Delete playlist">Delete</button>
              )}
            </div>
          </>
        )}
      </div>

      {error && <p className="text-[11px] text-[#ffb4ab]">{error}</p>}

      {detail && detail.tracks.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => onPlayTracks(detail.tracks)}
            className="flex-1 py-2.5 rounded-xl bg-[#53e076] text-[#003914] text-xs font-black"
          >
            Play all ({detail.tracks.length})
          </button>
          <button
            onClick={() => onQueueTracks(detail.tracks)}
            className="flex-1 py-2.5 rounded-xl bg-[#2a2a2a] text-xs font-bold"
          >
            Queue all
          </button>
        </div>
      )}
      {detail && detail.missing > 0 && (
        <p className="text-[11px] text-amber-300">
          {detail.missing} saved {detail.missing === 1 ? 'entry has' : 'entries have'} no cached metadata and was skipped.
        </p>
      )}

      {detail && detail.tracks.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#c6c6c7]">queue_music</span>
          <p className="text-sm font-bold text-[#e5e2e1]">Empty playlist</p>
          <p className="text-xs text-[#c6c6c7]">Add tracks from Search with the + button.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {detail?.tracks.map((t, i) => (
            <div key={t.uri} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-[#201f1f] group">
              <span className="w-5 text-[11px] font-mono text-[#c6c6c7] text-center">{i + 1}</span>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPlayTrack(t)}>
                <p className="text-sm font-bold text-[#e5e2e1] truncate">{t.name}</p>
                <p className="text-[11px] text-[#c6c6c7] truncate">{t.artists?.map((a) => a.name).join(', ')}</p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => moveTrackInPlaylist(uri, i, i - 1).then(reload)}
                  disabled={i === 0}
                  className="w-7 h-7 rounded-full text-[#c6c6c7] hover:text-white disabled:opacity-20"
                  title="Move up"
                  aria-label={`Move ${t.name} up`}
                >
                  <span className="material-symbols-outlined text-base">arrow_upward</span>
                </button>
                <button
                  onClick={() => moveTrackInPlaylist(uri, i, i + 1).then(reload)}
                  disabled={detail != null && i === detail.tracks.length - 1}
                  className="w-7 h-7 rounded-full text-[#c6c6c7] hover:text-white disabled:opacity-20"
                  title="Move down"
                  aria-label={`Move ${t.name} down`}
                >
                  <span className="material-symbols-outlined text-base">arrow_downward</span>
                </button>
                <button
                  onClick={() => removeTrackFromPlaylist(uri, t.uri).then(() => { void reload(); onChanged(); })}
                  className="w-7 h-7 rounded-full text-[#c6c6c7] hover:text-[#ffb4ab]"
                  title="Remove from playlist"
                  aria-label={`Remove ${t.name} from playlist`}
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
