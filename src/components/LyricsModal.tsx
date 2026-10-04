// Lyrics panel (12_LYRICS_ENGINE.md): LRCLIB only, cached in IndexedDB.
// States: loading | synced (auto-scroll + highlight) | plain | unavailable | error.
// Never fabricates lyrics.
import React, { useState, useEffect, useRef } from 'react';
import type { SpotifyTrack } from '../types';
import { fetchLyrics, parseLrc, activeLine, type LyricLine } from '../core/lyrics/lyricsEngine';
import { db } from '../core/db/database';

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: SpotifyTrack | null;
  positionMs: number;
}

type View =
  | { kind: 'loading' }
  | { kind: 'synced'; lines: LyricLine[] }
  | { kind: 'plain'; text: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; message: string };

export const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, onClose, track, positionMs }) => {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [lyricSource, setLyricSource] = useState<string>('LRCLIB');
  const activeRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!isOpen || !track) return;
    let cancelled = false;
    // Provider-supplied lyrics first (e.g. Jamendo `include=lyrics`) — real text from the catalogue.
    if (track.lyrics && track.lyrics.length > 0) {
      setLyricSource(track.uri?.startsWith('jamendo:') ? 'Jamendo' : 'Provider');
      setView({ kind: 'plain', text: track.lyrics.join('\n') });
      return;
    }
    setLyricSource('LRCLIB');
    const key = `spotify:${track.id}`;
    const title = track.name;
    const artist = track.artists?.[0]?.name ?? '';
    setView({ kind: 'loading' });
    (async () => {
      try {
        const cached = await db.getLyrics(key);
        if (cancelled) return;
        if (cached) {
          if (cached.synced) {
            const lines = parseLrc(cached.body);
            if (lines.length) {
              setView({ kind: 'synced', lines });
              return;
            }
          } else if (cached.body) {
            setView({ kind: 'plain', text: cached.body });
            return;
          }
        }
        if (!artist) {
          setView({ kind: 'unavailable', reason: 'No artist info to match lyrics.' });
          return;
        }
        const res = await fetchLyrics({
          title,
          artist,
          album: track.album?.name,
          durationSec: Math.round((track.duration_ms || 0) / 1000)
        });
        if (cancelled) return;
        if (res.kind === 'synced') {
          setView(res);
          // Cache raw LRC by re-serializing lines (source of truth stays LRCLIB).
          const raw = res.lines.map((l) => {
            const m = Math.floor(l.timeMs / 60000);
            const s = ((l.timeMs % 60000) / 1000).toFixed(2).padStart(5, '0');
            return `[${m}:${s}]${l.text}`;
          }).join('\n');
          void db.putLyrics(key, raw, true).catch(() => {});
        } else if (res.kind === 'plain') {
          setView(res);
          void db.putLyrics(key, res.text, false).catch(() => {});
        } else {
          setView(res);
        }
      } catch (e) {
        if (!cancelled) setView({ kind: 'error', message: e instanceof Error ? e.message : 'Lyrics failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  if (!isOpen) return null;

  const idx = view.kind === 'synced' ? activeLine(view.lines, positionMs) : -1;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#201f1f] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-black text-[#e5e2e1]">Lyrics</h2>
            <p className="text-[11px] text-[#c6c6c7] truncate">
              {track ? `${track.name} • ${track.artists?.map((a) => a.name).join(', ')}` : 'No track'}
              {'  '}· via {lyricSource}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#c6c6c7] hover:text-white flex items-center justify-center flex-shrink-0"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {view.kind === 'loading' && (
            <div className="py-12 flex flex-col items-center gap-3 text-[#c6c6c7]">
              <span className="w-6 h-6 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Looking up lyrics…</span>
            </div>
          )}
          {view.kind === 'synced' && (
            <div className="space-y-3 py-2">
              {view.lines.map((l, i) => (
                <p
                  key={i}
                  ref={i === idx ? activeRef : undefined}
                  className={`text-base leading-relaxed transition-colors ${
                    i === idx ? 'text-[#e5e2e1] font-bold' : i < idx ? 'text-[#c6c6c7]/60' : 'text-[#c6c6c7]'
                  }`}
                >
                  {l.text}
                </p>
              ))}
            </div>
          )}
          {view.kind === 'plain' && (
            <p className="text-sm text-[#e5e2e1] leading-relaxed whitespace-pre-line">{view.text}</p>
          )}
          {view.kind === 'unavailable' && (
            <div className="py-12 text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-[#c6c6c7]">lyrics</span>
              <p className="text-sm font-bold text-[#e5e2e1]">No lyrics for this track</p>
              <p className="text-xs text-[#c6c6c7]">{view.reason}</p>
            </div>
          )}
          {view.kind === 'error' && (
            <div className="py-12 text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-amber-400">error</span>
              <p className="text-sm font-bold text-[#e5e2e1]">Lyrics lookup failed</p>
              <p className="text-xs text-[#c6c6c7]">{view.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
