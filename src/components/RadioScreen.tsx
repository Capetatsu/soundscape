// Live radio screen (P-D): community stations, playable without any account.
// Honest framing throughout: live (unskippable), HTTPS direct streams only.
import React, { useState, useEffect } from 'react';
import {
  radioSearchStations,
  radioTopStations,
  radioStationsByTag,
  type RadioStation
} from '../core/providers/radio/radioClient';

interface RadioScreenProps {
  onPlayStation: (station: RadioStation) => void;
  currentStationUuid: string | null;
  isPlaying: boolean;
}

const TAG_CHIPS = ['rock', 'jazz', 'electronic', 'classical', 'pop', 'news', 'ambient', 'metal'];

export const RadioScreen: React.FC<RadioScreenProps> = ({ onPlayStation, currentStationUuid, isPlaying }) => {
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    radioTopStations(12)
      .then((list) => {
        if (!cancelled) {
          setStations(list);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    setActiveTag(null);
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await radioSearchStations(query, 12);
        if (!cancelled) {
          setStations(list);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const pickTag = async (tag: string) => {
    setActiveTag(tag);
    setQuery('');
    setLoading(true);
    try {
      const list = await radioStationsByTag(tag, 12);
      setStations(list);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-28 pt-2 px-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg font-black text-[#e5e2e1]">Live radio</h2>
        <p className="text-[11px] text-[#c6c6c7]">
          Community stations via Radio Browser — live and unskippable, HTTPS streams only. No account needed.
        </p>
      </div>

      <div className="relative flex items-center">
        <span className="material-symbols-outlined absolute left-3.5 text-[#c6c6c7] text-xl">radio</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a station…"
          className="w-full pl-10 pr-4 py-3 bg-[#201f1f] text-[#e5e2e1] placeholder-[#c6c6c7] rounded-full text-sm font-semibold border border-white/5 focus:border-[#53e076] focus:outline-none"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TAG_CHIPS.map((tag) => (
          <button
            key={tag}
            onClick={() => void pickTag(tag)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
              activeTag === tag ? 'bg-[#53e076] text-[#003914]' : 'bg-[#201f1f] text-[#e5e2e1] border border-white/5'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <span className="w-6 h-6 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : failed && stations.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#c6c6c7]">radio</span>
          <p className="text-sm font-bold text-[#e5e2e1]">Radio directory unreachable</p>
          <p className="text-xs text-[#c6c6c7]">Check your connection and try again.</p>
        </div>
      ) : stations.length === 0 ? (
        <p className="text-xs text-[#c6c6c7] py-6 text-center">No stations found — try another search or tag.</p>
      ) : (
        <div className="space-y-1">
          {stations.map((st) => {
            const isCurrent = st.uuid === currentStationUuid && isPlaying;
            return (
              <div
                key={st.uuid}
                onClick={() => onPlayStation(st)}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#201f1f] cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#131313] flex-shrink-0 flex items-center justify-center text-[#53e076] overflow-hidden">
                  {st.favicon ? (
                    <img
                      src={st.favicon}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  <span className="material-symbols-outlined text-lg">radio</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#e5e2e1] truncate flex items-center gap-2">
                    {st.name}
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-[#53e076] animate-pulse" />}
                  </p>
                  <p className="text-[11px] text-[#c6c6c7] truncate">
                    {[st.country, st.codec + (st.bitrate ? ` ${st.bitrate}k` : ''), st.tags.split(',')[0]]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#c6c6c7] group-hover:text-white">play_arrow</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
