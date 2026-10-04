// Subsonic-backed UI section: connect, ping (real), search, and play into the player.
// User-owned music only. Credentials live in session storage (this tab).
import React, { useState } from 'react';
import {
  loadSubsonicConfig,
  saveSubsonicConfig,
  subsonicPing,
  subsonicSearch,
  subsonicUrl,
  type SubsonicConfig,
  type SubsonicTrack
} from '../core/providers/subsonic/subsonicClient';

export interface SubsonicPlayTarget {
  track: SubsonicTrack;
  streamUrl: string;
  imageUrl: string | null;
}

interface SubsonicBrowserProps {
  onPlay: (target: SubsonicPlayTarget) => void;
}

export const SubsonicBrowser: React.FC<SubsonicBrowserProps> = ({ onPlay }) => {
  const initial = loadSubsonicConfig();
  const [server, setServer] = useState(initial?.server ?? '');
  const [user, setUser] = useState(initial?.user ?? '');
  const [pass, setPass] = useState(initial?.pass ?? '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [detail, setDetail] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubsonicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  const connect = async () => {
    const cfg: SubsonicConfig = { server: server.trim().replace(/\/+$/, ''), user: user.trim(), pass };
    if (!cfg.server || !cfg.user) {
      setStatus('fail');
      setDetail('Enter the server URL and username first.');
      return;
    }
    setStatus('testing');
    setDetail('');
    try {
      const res = await subsonicPing(cfg);
      saveSubsonicConfig(cfg);
      setStatus('ok');
      setDetail(`Connected (Subsonic API ${res.version}). Credentials kept in this tab only.`);
    } catch (e) {
      setStatus('fail');
      setDetail(e instanceof Error ? e.message : 'Connection failed');
    }
  };

  const disconnect = () => {
    saveSubsonicConfig(null);
    setStatus('idle');
    setDetail('');
    setResults([]);
    setServer('');
    setUser('');
    setPass('');
  };

  const doSearch = async () => {
    const cfg = loadSubsonicConfig();
    if (!cfg || !query.trim()) return;
    setSearching(true);
    setSearchNote(null);
    try {
      const rows = await subsonicSearch(cfg, query.trim(), 40);
      setResults(rows);
      setSearchNote(rows.length === 0 ? `No match on your server for “${query.trim()}”.` : null);
    } catch (e) {
      setResults([]);
      setSearchNote(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const play = async (t: SubsonicTrack) => {
    const cfg = loadSubsonicConfig();
    if (!cfg) return;
    try {
      const streamUrl = await subsonicUrl(cfg, t.streamUrl);
      const imageUrl = t.coverUrl ? await subsonicUrl(cfg, t.coverUrl) : null;
      onPlay({ track: t, streamUrl, imageUrl });
    } catch (e) {
      setSearchNote(e instanceof Error ? e.message : 'Could not resolve stream URL');
    }
  };

  return (
    <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-[#e5e2e1] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#53e076] text-lg">dns</span>
          Your music server
        </h3>
        {status === 'ok' && (
          <button onClick={disconnect} className="text-[11px] font-bold text-[#ffb4ab]">
            Disconnect
          </button>
        )}
      </div>
      <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
        Subsonic-compatible servers: <strong>Navidrome</strong>, <strong>Jellyfin</strong> (Subsonic plugin),
        Gonic, Airsonic-Advanced. Your own music, your own server — credentials stay in this tab.
      </p>

      {status !== 'ok' ? (
        <>
          <div className="grid grid-cols-1 gap-2">
            <input
              type="url"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="https://music.example.com"
              className="w-full px-3 py-2 bg-[#131313] text-xs font-mono text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
              aria-label="Server URL"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Username"
                autoComplete="username"
                className="px-3 py-2 bg-[#131313] text-xs text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
                aria-label="Username"
              />
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="px-3 py-2 bg-[#131313] text-xs text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
                aria-label="Password"
              />
            </div>
          </div>
          <button
            onClick={connect}
            disabled={status === 'testing'}
            className="w-full py-2.5 rounded-xl bg-[#53e076] text-[#003914] text-xs font-black disabled:opacity-50"
          >
            {status === 'testing' ? 'Connecting…' : 'Connect & test'}
          </button>
          {status === 'fail' && <p className="text-[11px] text-[#ffb4ab]">Not connected: {detail}</p>}
        </>
      ) : (
        <>
          <p className="text-[11px] text-[#53e076] font-semibold">{detail}</p>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doSearch();
              }}
              placeholder="Search your library…"
              className="flex-1 px-3 py-2 bg-[#131313] text-xs text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
              aria-label="Search your server"
            />
            <button onClick={doSearch} disabled={searching} className="px-4 py-2 rounded-lg bg-[#53e076] text-[#003914] text-xs font-bold">
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {searchNote && <p className="text-[11px] text-[#c6c6c7]">{searchNote}</p>}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {results.map((t) => (
              <button
                key={t.id}
                onClick={() => void play(t)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#2a2a2a] text-left"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[#e5e2e1] truncate block">{t.title}</span>
                  <span className="text-[11px] text-[#c6c6c7] truncate block">
                    {t.artist}{t.album ? ` · ${t.album}` : ''}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[#53e076] flex-shrink-0">play_arrow</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};