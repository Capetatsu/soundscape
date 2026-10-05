import React, { useState } from 'react';
import { SpotifyTrack } from '../types';
import { SpotifyApiClient } from '../services/spotifyApi';

interface AiRecommendation {
  title: string;
  artist: string;
  album: string;
  reason: string;
  energyLevel?: string;
}

interface ResolvedRecommendation extends AiRecommendation {
  resolved: SpotifyTrack | null;
}

interface AiDjModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: SpotifyTrack | null;
  onPlayTrack: (track: SpotifyTrack) => void;
  onAddToQueue: (track: SpotifyTrack) => void;
}

export const AiDjModal: React.FC<AiDjModalProps> = ({
  isOpen,
  onClose,
  currentTrack,
  onPlayTrack,
  onAddToQueue
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [djResponse, setDjResponse] = useState<{
    djIntro: string;
    vibeDescription: string;
    recommendedTracks: AiRecommendation[];
  } | null>(null);
  const [resolved, setResolved] = useState<ResolvedRecommendation[] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const moodPills = [
    'Late Night Cyberpunk Synth',
    'Morning Espresso Energy',
    'Deep Focus FLAC Flow',
    'Acoustic Sunset Melancholy',
    'High-Energy UK Garage Club'
  ];

  // Resolve AI text suggestions to real Spotify tracks.
  // Unresolved items stay text-only and are NEVER playable (no synthetic URIs).
  const resolveRecommendations = async (items: AiRecommendation[]) => {
    setResolving(true);
    try {
      const out: ResolvedRecommendation[] = [];
      for (const item of items.slice(0, 5)) {
        try {
          const res = await SpotifyApiClient.search(`${item.title} ${item.artist}`, 'track', 3);
          const match = res.tracks?.items?.[0] ?? null;
          out.push({ ...item, resolved: match });
        } catch {
          out.push({ ...item, resolved: null });
        }
      }
      setResolved(out);
    } finally {
      setResolving(false);
    }
  };

  const handleGenerate = async (query: string) => {
    setLoading(true);
    setAiError(null);
    setResolved(null);
    try {
      const res = await fetch('/api/ai/dj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          currentTrack: currentTrack ? { name: currentTrack.name, artists: currentTrack.artists } : null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data?.error?.message || 'AI DJ is currently unavailable.');
        setDjResponse(null);
        return;
      }
      if (!data || !Array.isArray(data.recommendedTracks)) {
        setAiError('AI returned an unexpected response. Try again.');
        setDjResponse(null);
        return;
      }
      setDjResponse(data);
      await resolveRecommendations(data.recommendedTracks);
    } catch (e) {
      console.error('DJ API error', e);
      setAiError('Could not reach the AI DJ service. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#201f1f] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#1db954] to-[#34e36a] flex items-center justify-center text-[#003914] shadow-md">
              <span className="material-symbols-outlined text-xl font-bold animate-spin-slow">
                auto_awesome
              </span>
            </div>
            <div>
              <h2 className="text-lg font-black text-[#e5e2e1] leading-tight">Soundscape AI DJ</h2>
              <p className="text-[10px] text-[#53e076] font-semibold">Powered by Gemini 3.8 Flash</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#c6c6c7] hover:text-white flex items-center justify-center"
            aria-label="Close AI DJ"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Input Bar */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptInput.trim()) {
                  handleGenerate(promptInput);
                }
              }}
              placeholder="e.g. Dreamy slowcore like Mazzy Star..."
              className="flex-1 px-4 py-3 bg-[#131313] text-[#e5e2e1] placeholder-[#c6c6c7] rounded-xl text-xs font-semibold border border-white/10 focus:border-[#53e076] focus:outline-none"
            />
            <button
              onClick={() => {
                if (promptInput.trim()) handleGenerate(promptInput);
              }}
              disabled={loading}
              className="px-4 py-3 rounded-xl bg-[#53e076] hover:bg-[#1db954] text-[#003914] font-black text-xs flex items-center gap-1 shadow-md disabled:opacity-50"
            >
              <span>Mix</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>

          {/* Preset Mood Pills */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {moodPills.map((pill) => (
              <button
                key={pill}
                onClick={() => {
                  setPromptInput(pill);
                  handleGenerate(pill);
                }}
                className="px-3 py-1 rounded-full bg-[#1c1b1b] hover:bg-[#2a2a2a] border border-white/5 text-[11px] font-semibold text-[#c6c6c7] hover:text-[#53e076] whitespace-nowrap transition-colors"
              >
                {pill}
              </button>
            ))}
          </div>
        </div>

        {/* Loading Animation */}
        {loading && (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-6 bg-[#53e076] rounded-full animate-bounce" />
              <span className="w-2 h-10 bg-[#53e076] rounded-full animate-bounce delay-75" />
              <span className="w-2 h-5 bg-[#53e076] rounded-full animate-bounce delay-150" />
            </div>
            <p className="text-xs font-semibold text-[#53e076]">
              Gemini AI is analyzing acoustic harmonies & crafting your custom mix...
            </p>
          </div>
        )}

        {/* AI error (honest, no fake tracks) */}
        {aiError && !loading && (
          <div className="p-4 bg-[#1c1b1b] border border-red-500/30 rounded-2xl flex items-start gap-2">
            <span className="material-symbols-outlined text-red-400 text-lg">error</span>
            <p className="text-xs text-[#e5e2e1] leading-relaxed">{aiError}</p>
          </div>
        )}

        {/* AI DJ Response Card */}
        {djResponse && !loading && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Spoken DJ Quote Banner */}
            <div className="p-4 bg-gradient-to-r from-[#1db954]/20 via-[#201f1f] to-[#1c1b1b] border border-[#53e076]/40 rounded-2xl relative overflow-hidden">
              <div className="flex items-center gap-2 mb-2 text-[#53e076]">
                <span className="material-symbols-outlined text-lg">mic</span>
                <span className="text-[11px] font-bold uppercase tracking-wider">AI DJ On-Air</span>
              </div>
              <p className="text-sm font-semibold italic text-[#e5e2e1] leading-relaxed">
                "{djResponse.djIntro}"
              </p>
              <p className="text-xs text-[#c6c6c7] mt-2 border-t border-white/5 pt-2">
                <strong className="text-white">Acoustic signature:</strong> {djResponse.vibeDescription}
              </p>
            </div>

            {/* Recommendations List (only Spotify-matched tracks are playable) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#c6c6c7]">
                  Curated Frequency Mix ({(resolved ?? djResponse.recommendedTracks).length})
                </h3>
              </div>
              {resolving && (
                <p className="text-[11px] text-[#53e076] font-semibold">
                  Matching suggestions to the Spotify catalog…
                </p>
              )}

              {(resolved ?? djResponse.recommendedTracks.map((item) => ({ ...item, resolved: null as SpotifyTrack | null }))).map((item, idx) => {
                const playable = item.resolved;
                return (
                  <div
                    key={idx}
                    className="p-3 bg-[#1c1b1b] hover:bg-[#2a2a2a] border border-white/5 rounded-xl flex items-center justify-between transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#e5e2e1] truncate">{item.title}</p>
                        {item.energyLevel && (
                          <span className="px-1.5 py-0.2 text-[8px] font-bold bg-[#353534] text-[#53e076] rounded uppercase">
                            {item.energyLevel}
                          </span>
                        )}
                        {!resolving && !playable && (
                          <span className="px-1.5 py-0.2 text-[8px] font-bold bg-[#353534] text-[#c6c6c7] rounded uppercase" title="Not found in the Spotify catalog — text suggestion only">
                            Text only
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#c6c6c7] truncate">{item.artist} • {item.album}</p>
                      <p className="text-[10px] text-[#53e076] mt-0.5 line-clamp-1 italic">
                        {item.reason}
                      </p>
                      {!resolving && !playable && (
                        <p className="text-[10px] text-[#c6c6c7] mt-0.5">
                          Not matched on Spotify — suggestion only, cannot play.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => playable && onPlayTrack(playable)}
                        disabled={!playable}
                        className="w-8 h-8 rounded-full bg-[#53e076] text-[#003914] flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
                        title={playable ? 'Play on Spotify' : 'Not available on Spotify'}
                      >
                        <span className="material-symbols-outlined text-base fill-1">play_arrow</span>
                      </button>
                      <button
                        onClick={() => playable && onAddToQueue(playable)}
                        disabled={!playable}
                        className="w-8 h-8 rounded-full bg-[#201f1f] text-[#c6c6c7] hover:text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                        title={playable ? 'Add to Queue' : 'Not available on Spotify'}
                      >
                        <span className="material-symbols-outlined text-base">playlist_add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
