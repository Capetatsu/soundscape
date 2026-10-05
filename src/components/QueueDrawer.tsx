import React from 'react';
import { SpotifyTrack } from '../types';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: SpotifyTrack | null;
  queue: SpotifyTrack[];
  onPlayTrack: (track: SpotifyTrack) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  currentTrack,
  queue,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue
}) => {
  // Escape is owned globally by App (topmost-first) — no local competing listener.
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#201f1f] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#53e076] text-2xl">queue_music</span>
            <h2 className="text-lg font-extrabold text-[#e5e2e1]">Play Queue</h2>
          </div>
          <button
            id="queue-close-btn"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#c6c6c7] hover:text-white flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Now Playing */}
        {currentTrack && (
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#53e076]">Now Playing</h3>
            <div className="p-3 bg-[#131313] border border-[#53e076]/30 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {currentTrack.album?.images?.[0]?.url ? (
                  <img
                    src={currentTrack.album.images[0].url}
                    alt={currentTrack.name}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#201f1f] flex items-center justify-center flex-shrink-0 text-[#c6c6c7]">
                    <span className="material-symbols-outlined text-lg">music_note</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#53e076] truncate">{currentTrack.name}</p>
                  <p className="text-xs text-[#c6c6c7] truncate">{currentTrack.artists?.map((a) => a.name).join(', ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 pr-2">
                <span className="w-1 h-3 bg-[#53e076] rounded-full animate-bounce" />
                <span className="w-1 h-5 bg-[#53e076] rounded-full animate-bounce delay-75" />
                <span className="w-1 h-2 bg-[#53e076] rounded-full animate-bounce delay-150" />
              </div>
            </div>
          </div>
        )}

        {/* Next In Queue */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#c6c6c7]">
              Next In Queue ({queue.length})
            </h3>
            {queue.length > 0 && (
              <button
                onClick={onClearQueue}
                className="text-xs font-semibold text-[#c6c6c7] hover:text-[#ffb4ab]"
              >
                Clear queue
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <div className="py-8 text-center text-[#c6c6c7] bg-[#1c1b1b] rounded-2xl border border-white/5">
              <p className="text-xs">No more tracks in queue.</p>
              <p className="text-[11px] text-[#c6c6c7]/60 mt-1">Add tracks from search or playlists to line them up.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {queue.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  onClick={() => onPlayTrack(track)}
                  className="p-2.5 bg-[#1c1b1b] hover:bg-[#2a2a2a] border border-white/5 rounded-xl flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {track.album?.images?.[0]?.url ? (
                      <img
                        src={track.album.images[0].url}
                        alt={track.name}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#201f1f] flex items-center justify-center flex-shrink-0 text-[#c6c6c7]">
                        <span className="material-symbols-outlined text-sm">music_note</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#e5e2e1] truncate group-hover:text-white">
                        {track.name}
                      </p>
                      <p className="text-[11px] text-[#c6c6c7] truncate">
                        {track.artists?.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromQueue(idx);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-[#c6c6c7] hover:text-[#ffb4ab]"
                    title="Remove from queue"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
