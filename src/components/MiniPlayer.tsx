import React from 'react';
import { SpotifyTrack, SpotifyDevice } from '../types';

interface MiniPlayerProps {
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  activeDevice: SpotifyDevice | null;
  isLiked: boolean;
  playbackMode?: string;
  onTogglePlay: () => void;
  onToggleLike: (track: SpotifyTrack) => void;
  onOpenFullPlayer: () => void;
  onOpenDeviceModal: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  currentTrack,
  isPlaying,
  progressMs,
  durationMs,
  activeDevice,
  isLiked,
  playbackMode = 'idle',
  onTogglePlay,
  onToggleLike,
  onOpenFullPlayer,
  onOpenDeviceModal
}) => {
  if (!currentTrack) return null;

  const progressPercent = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;
  const albumImage = currentTrack.album?.images?.[0]?.url;
  const artistNames = currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 px-3 pb-1 pointer-events-none">
      <div
        id="mini-player-container"
        onClick={onOpenFullPlayer}
        className="pointer-events-auto mx-auto max-w-2xl bg-[#201f1f]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 flex items-center justify-between cursor-pointer hover:bg-[#2a2a2a]/95 transition-all group overflow-hidden relative"
      >
        {/* Track Info & Artwork */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-md bg-[#131313] flex items-center justify-center">
            {albumImage ? (
              <img
                src={albumImage}
                alt={currentTrack.name}
                className={`w-full h-full object-cover transition-transform duration-500 ${isPlaying ? 'scale-105' : 'scale-100'}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="material-symbols-outlined text-base text-[#c6c6c7]">music_note</span>
            )}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-[#53e076] animate-ping" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-[#e5e2e1] truncate group-hover:text-white transition-colors">
                {currentTrack.name}
              </span>
              {currentTrack.explicit && (
                <span className="px-1 py-0.2 text-[9px] font-bold bg-[#454747] text-[#c6c6c7] rounded uppercase leading-none">
                  E
                </span>
              )}
              {(playbackMode === 'audius' ||
                playbackMode === 'jamendo' ||
                playbackMode === 'archive' ||
                playbackMode === 'radio' ||
                playbackMode === 'local') && (
                <span className="px-1.5 py-0.5 text-[8px] font-extrabold bg-[#53e076]/20 text-[#53e076] border border-[#53e076]/30 rounded uppercase tracking-wider flex-shrink-0">
                  {playbackMode === 'local'
                    ? 'On device'
                    : playbackMode === 'radio'
                    ? 'Live'
                    : 'Free catalogue'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#c6c6c7]">
              <span className="truncate">{artistNames}</span>
              {activeDevice && (
                <>
                  <span className="text-[10px] text-white/30">•</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDeviceModal();
                    }}
                    className="flex items-center gap-1 text-[11px] text-[#53e076] hover:underline"
                  >
                    <span className="material-symbols-outlined text-[13px]">speaker</span>
                    <span className="truncate max-w-[110px]">{activeDevice.name}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Like Button */}
          <button
            id="mini-player-like-btn"
            onClick={() => onToggleLike(currentTrack)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              isLiked ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
            }`}
            title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          >
            <span className={`material-symbols-outlined text-xl ${isLiked ? 'fill-1' : ''}`}>
              favorite
            </span>
          </button>

          {/* Play/Pause Button */}
          <button
            id="mini-player-play-btn"
            onClick={onTogglePlay}
            className="w-10 h-10 rounded-full bg-[#e5e2e1] hover:bg-white text-[#131313] flex items-center justify-center shadow-lg transition-transform active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-outlined text-2xl fill-1">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>

        {/* Micro Progress Bar (pinned at very bottom of card) */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-[#1db954] to-[#53e076] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
