// Statistics (15_STATISTICS_SYSTEM.md): derived ONLY from real listening events.
// Empty history => honest empty state. Includes export + delete.
import React, { useState, useEffect } from 'react';
import { topTracks } from '../core/stats/listeningEvents';
import { db } from '../core/db/database';

interface Row {
  trackUri: string;
  name: string;
  artists: string;
  plays: number;
  ms: number;
}

function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  const s = Math.round((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export const StatsScreen: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'week' | 'month' | 'all'>('month');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const now = Date.now();
      const since = range === 'week' ? now - 7 * 86400_000 : range === 'month' ? now - 30 * 86400_000 : undefined;
      const top = await topTracks(20, since);
      if (cancelled) return;
      const metas = await db.getTracksByUris(top.map((t) => t.trackUri));
      const byUri = new Map(metas.map((m) => [m.uri, m]));
      setRows(
        top.map((t) => {
          const meta = byUri.get(t.trackUri);
          let artists = 'Unknown artist';
          try {
            const raw = JSON.parse(meta?.artistsJson ?? '[]') as { name?: string }[];
            const names = (Array.isArray(raw) ? raw : []).map((a) => a.name).filter(Boolean);
            if (names.length) artists = names.join(', ');
          } catch {}
          return {
            trackUri: t.trackUri,
            name: meta?.name ?? t.trackUri,
            artists,
            plays: t.plays,
            ms: t.ms
          };
        })
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totalMs = rows.reduce((a, r) => a + r.ms, 0);

  const handleExport = async () => {
    const events = await db.getListeningEvents(5000);
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soundscape-listening-history.json';
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Listening history exported as JSON.');
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete all locally stored listening history? This cannot be undone.')) return;
    // Delete via fresh DB connection: open, clear store.
    const req = indexedDB.open('soundscape', 1);
    req.onsuccess = () => {
      const conn = req.result;
      const t = conn.transaction('listening_event', 'readwrite');
      t.objectStore('listening_event').clear();
      t.oncomplete = () => {
        setRows([]);
        setNotice('Listening history deleted.');
        conn.close();
      };
    };
  };

  return (
    <div className="pb-28 pt-2 px-4 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-[#e5e2e1]">Your stats</h2>
        <div className="flex gap-1.5">
          {(['week', 'month', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${
                range === r ? 'bg-[#53e076] text-[#003914]' : 'bg-[#201f1f] text-[#c6c6c7]'
              }`}
            >
              {r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-[#c6c6c7]">
        Built only from tracks you actually played in Soundscape
        {totalMs > 0 && (
          <span className="text-[#e5e2e1] font-bold"> · {fmtMs(totalMs)} listened</span>
        )}
        .
      </p>

      {notice && (
        <p className="text-[11px] text-[#53e076] font-semibold">{notice}</p>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <span className="w-6 h-6 border-2 border-[#53e076] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#c6c6c7]">bar_chart</span>
          <p className="text-sm font-bold text-[#e5e2e1]">No listening history yet</p>
          <p className="text-xs text-[#c6c6c7]">Play something and your stats will appear here. Nothing is fabricated.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={r.trackUri} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#201f1f]">
              <span className="w-6 text-xs font-mono text-[#c6c6c7] text-center">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#e5e2e1] truncate">{r.name}</p>
                <p className="text-[11px] text-[#c6c6c7] truncate">{r.artists}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold text-[#e5e2e1]">{r.plays}×</p>
                <p className="text-[10px] font-mono text-[#c6c6c7]">{fmtMs(r.ms)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex-1 py-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-bold"
          >
            Export JSON
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 py-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#ffb4ab] text-xs font-bold"
          >
            Delete history
          </button>
        </div>
      )}
    </div>
  );
};
