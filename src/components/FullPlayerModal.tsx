import React, { useState } from 'react';
import { SpotifyTrack, SpotifyDevice } from '../types';

interface FullPlayerModalProps {
  isOpen: boolean;
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  activeDevice: SpotifyDevice | null;
  isLiked: boolean;
  playbackMode?: string;
  playbackNotice?: string | null;
  playlistContextName?: string;
  onClose: () => void;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleLike: (track: SpotifyTrack) => void;
  onOpenDeviceModal: () => void;
  onOpenQueue: () => void;
  onOpenLyrics?: () => void;
  onSelectAlbum?: (albumId: string) => void;
  onSelectArtist?: (artistId: string) => void;
}

export const FullPlayerModal: React.FC<FullPlayerModalProps> = ({
  isOpen,
  currentTrack,
  isPlaying,
  progressMs,
  durationMs,
  isShuffle,
  repeatMode,
  activeDevice,
  isLiked,
  playbackMode = 'idle',
  playbackNotice,
  playlistContextName = "Spotify Playback",
  onClose,
  onTogglePlay,
  onSeek,
  onNext,
  onPrevious,
  onToggleShuffle,
  onToggleRepeat,
  onToggleLike,
  onOpenDeviceModal,
  onOpenQueue,
  onOpenLyrics,
  onSelectAlbum,
  onSelectArtist
}) => {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !currentTrack) return null;

  const albumImage = currentTrack.album?.images?.[0]?.url;
  const artistNames = currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const currentPosition = isScrubbing ? scrubValue : progressMs;
  const remainingMs = Math.max(0, durationMs - currentPosition);
  const progressPercent = durationMs > 0 ? (currentPosition / durationMs) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#131313] text-[#e5e2e1] overflow-y-auto flex flex-col justify-between animate-in fade-in slide-in-from-bottom duration-300">
      {/* Ambient background glow from artwork */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[120%] h-[500px] opacity-25 blur-3xl pointer-events-none rounded-full"
        style={{
          backgroundImage: `radial-gradient(circle, #53e076 0%, #1db954 30%, transparent 70%)`
        }}
      />

      {/* Top Navigation Bar */}
      <div className="relative z-10 px-6 pt-safe pt-4 pb-2 flex items-center justify-between">
        <button
          id="fullplayer-dismiss-btn"
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#e5e2e1] hover:bg-white/10 transition-colors"
          title="Minimize Player"
        >
          <span className="material-symbols-outlined text-2xl">expand_more</span>
        </button>

        <div className="text-center px-4 flex-1">
          <p className="text-[10px] font-bold tracking-widest text-[#c6c6c7] uppercase">
            PLAYING FROM PLAYLIST
          </p>
          <p className="text-xs font-semibold text-[#e5e2e1] truncate">
            {playlistContextName}
          </p>
        </div>

        <button
          id="fullplayer-menu-btn"
          onClick={onOpenQueue}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#e5e2e1] hover:bg-white/10 transition-colors"
          title="Play Queue"
        >
          <span className="material-symbols-outlined text-xl">queue_music</span>
        </button>
      </div>

      {/* Main Content: Artwork & Metadata */}
      <div className="relative z-10 flex-1 px-8 py-2 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
        {/* Album Artwork with depth shadow */}
        <div
          onClick={() => {
            if (currentTrack.album?.id && onSelectAlbum) {
              onSelectAlbum(currentTrack.album.id);
              onClose();
            }
          }}
          className={`relative w-full aspect-square max-w-[340px] rounded-2xl overflow-hidden shadow-[0_24px_50px_-12px_rgba(0,0,0,0.9)] border border-white/5 group bg-[#181818] flex items-center justify-center ${
            currentTrack.album?.id ? 'cursor-pointer' : ''
          }`}
          title={currentTrack.album?.name ? `View album: ${currentTrack.album.name}` : undefined}
        >
          {albumImage ? (
            <img
              src={albumImage}
              alt={currentTrack.name}
              className="w-full h-full object-cover select-none"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-[#c6c6c7]">
              <span className="material-symbols-outlined text-6xl mb-2">album</span>
              <span className="text-xs">No Official Artwork</span>
            </div>
          )}
          {isPlaying && (
            <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/70 backdrop-blur-md flex items-center gap-1.5 border border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#53e076] animate-pulse" />
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#53e076]">
                {playbackMode === 'connect'
                  ? 'Spotify Connect'
                  : playbackMode === 'local'
                  ? 'Local File'
                  : playbackMode === 'audius'
                  ? 'Audius'
                  : playbackMode === 'jamendo'
                  ? 'Jamendo'
                  : playbackMode === 'archive'
                  ? 'Archive'
                  : playbackMode === 'radio'
                  ? 'Live Radio'
                  : 'Spotify 320k'}
              </span>
            </div>
          )}
        </div>

        {/* Playback Notice if any */}
        {playbackNotice && (
          <div className="w-full mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
            <p className="text-[11px] text-amber-300 font-medium">
              {playbackNotice}
            </p>
          </div>
        )}

        {/* Track Title & Artist & Like Button */}
        <div className="w-full mt-7 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-[#e5e2e1] truncate tracking-tight">
                {currentTrack.name}
              </h2>
              {currentTrack.explicit && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#454747] text-[#c6c6c7] rounded uppercase">
                  E
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm font-semibold text-[#c6c6c7]">
              <div className="truncate">
                {currentTrack.artists?.map((a, i) => (
                  <span key={a.id || a.name}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      onClick={() => {
                        if (a.id && onSelectArtist) {
                          onSelectArtist(a.id);
                          onClose();
                        }
                      }}
                      className="hover:underline hover:text-white"
                    >
                      {a.name}
                    </button>
                  </span>
                ))}
              </div>
              {currentTrack.album?.id && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentTrack.album.id && onSelectAlbum) {
                        onSelectAlbum(currentTrack.album.id);
                        onClose();
                      }
                    }}
                    className="truncate hover:underline hover:text-white max-w-[150px]"
                  >
                    {currentTrack.album.name}
                  </button>
                </>
              )}
            </div>
          </div>

          <button
            id="fullplayer-like-btn"
            onClick={() => onToggleLike(currentTrack)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              isLiked ? 'text-[#53e076] scale-110' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
            }`}
            title={isLiked ? 'Liked' : 'Save Track'}
          >
            <span className={`material-symbols-outlined text-2xl ${isLiked ? 'fill-1' : ''}`}>
              favorite
            </span>
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="w-full mt-5">
          <div className="relative flex items-center group">
            <input
              type="range"
              min={0}
              max={durationMs || 100}
              value={currentPosition}
              onChange={(e) => {
                setIsScrubbing(true);
                setScrubValue(Number(e.target.value));
              }}
              onMouseUp={() => {
                setIsScrubbing(false);
                onSeek(scrubValue);
              }}
              onTouchEnd={() => {
                setIsScrubbing(false);
                onSeek(scrubValue);
              }}
              className="w-full h-1.5 bg-[#353534] rounded-lg appearance-none cursor-pointer accent-[#53e076] focus:outline-none"
              style={{
                background: `linear-gradient(to right, #53e076 0%, #53e076 ${progressPercent}%, #353534 ${progressPercent}%, #353534 100%)`
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#c6c6c7] mt-1.5 font-mono">
            <span>{formatTime(currentPosition)}</span>
            <span>-{formatTime(remainingMs)}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="w-full mt-4 flex items-center justify-between">
          {/* Shuffle */}
          <button
            id="fullplayer-shuffle-btn"
            onClick={onToggleShuffle}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isShuffle ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
            }`}
            title={`Shuffle ${isShuffle ? 'On' : 'Off'}`}
          >
            <span className="material-symbols-outlined text-xl">shuffle</span>
            {isShuffle && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#53e076]" />}
          </button>

          {/* Previous Track */}
          <button
            id="fullplayer-prev-btn"
            onClick={onPrevious}
            className="w-12 h-12 rounded-full flex items-center justify-center text-[#e5e2e1] hover:bg-white/10 active:scale-95 transition-all"
            title="Previous"
          >
            <span className="material-symbols-outlined text-3xl">skip_previous</span>
          </button>

          {/* Play/Pause Button */}
          <button
            id="fullplayer-play-btn"
            onClick={onTogglePlay}
            className="w-16 h-16 rounded-full bg-[#e5e2e1] hover:bg-white text-[#131313] flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-outlined text-4xl fill-1">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>

          {/* Next Track */}
          <button
            id="fullplayer-next-btn"
            onClick={onNext}
            className="w-12 h-12 rounded-full flex items-center justify-center text-[#e5e2e1] hover:bg-white/10 active:scale-95 transition-all"
            title="Next"
          >
            <span className="material-symbols-outlined text-3xl">skip_next</span>
          </button>

          {/* Repeat */}
          <button
            id="fullplayer-repeat-btn"
            onClick={onToggleRepeat}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              repeatMode !== 'off' ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            <span className="material-symbols-outlined text-xl">
              {repeatMode === 'one' ? 'repeat_one' : 'repeat'}
            </span>
            {repeatMode !== 'off' && (
              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#53e076]" />
            )}
          </button>
        </div>

        {/* Connect Device Pill & Bottom Bar */}
        <div className="w-full mt-6 flex items-center justify-between border-t border-white/5 pt-4">
          <button
            id="fullplayer-device-btn"
            onClick={onOpenDeviceModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#53e076] border border-[#53e076]/20 text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-base">devices</span>
            <span className="truncate max-w-[140px]">{activeDevice?.name || 'Soundscape Audio Engine'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              id="fullplayer-share-btn"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: currentTrack.name,
                    text: `Listening to ${currentTrack.name} by ${artistNames} on Soundscape`,
                    url: window.location.href
                  }).catch(() => {});
                } else {
                  navigator.clipboard?.writeText(window.location.href);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#c6c6c7] hover:text-[#e5e2e1] hover:bg-white/10"
              title={copiedLink ? 'Link Copied!' : 'Share Track'}
            >
              <span className={`material-symbols-outlined text-lg ${copiedLink ? 'text-[#53e076]' : ''}`}>
                {copiedLink ? 'check' : 'share'}
              </span>
            </button>

            <button
              id="fullplayer-queue-btn"
              onClick={onOpenQueue}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#c6c6c7] hover:text-[#e5e2e1] hover:bg-white/10"
              title="View Queue"
            >
              <span className="material-symbols-outlined text-lg">queue_music</span>
            </button>
          </div>
        </div>

        {/* Real lyrics entry (LRCLIB via LyricsModal — never fabricated) */}
        <button
          id="fullplayer-lyrics-card"
          onClick={() => onOpenLyrics?.()}
          className="w-full mt-6 bg-[#201f1f] hover:bg-[#2a2a2a] border border-white/10 rounded-2xl p-4 cursor-pointer transition-all shadow-lg relative overflow-hidden group text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#53e076] text-lg">lyrics</span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#53e076]">Lyrics</span>
              {isPlaying && (
                <div className="flex items-center gap-0.5">
                  <span className="w-1 h-3 bg-[#53e076] rounded-full animate-bounce" />
                  <span className="w-1 h-2 bg-[#53e076] rounded-full animate-bounce delay-75" />
                  <span className="w-1 h-4 bg-[#53e076] rounded-full animate-bounce delay-150" />
                </div>
              )}
            </div>
            <span className="text-[11px] font-semibold text-[#c6c6c7] group-hover:text-white flex items-center gap-1">
              View
              <span className="material-symbols-outlined text-sm">open_in_new</span>
            </span>
          </div>
          <p className="text-[11px] text-[#c6c6c7] mt-1.5">
            Synced lyrics from LRCLIB when available. Nothing is shown if the service has no match.
          </p>
        </button>
      </div>
    </div>
  );
};
