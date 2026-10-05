import React, { useState, useEffect } from 'react';
import { AudioSettings } from '../types';
import { AudioPlayerService } from '../services/audioPlayer';
import { SubsonicBrowser, type SubsonicPlayTarget } from './SubsonicBrowser';
import { readEnvKey } from '../config/env';

interface AudioSettingsScreenProps {
  settings: AudioSettings;
  onUpdateSettings: (newSettings: Partial<AudioSettings>) => void;
  onPlaySubsonic: (target: SubsonicPlayTarget) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

export const AudioSettingsScreen: React.FC<AudioSettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  onPlaySubsonic
}) => {
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  // Real storage figures from the browser — never fabricated.
  useEffect(() => {
    let cancelled = false;
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((e) => {
        if (!cancelled) setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const streamingOptions: { id: AudioSettings['streamingQuality']; label: string; desc: string; badge?: string }[] = [
    { id: 'very_high', label: 'Very High (320 kbps) — Official Spotify Max', desc: 'Highest official bitrate stream delivered by Spotify Web Playback SDK for Premium accounts', badge: 'RECOMMENDED' },
    { id: 'auto', label: 'Automatic', desc: 'Dynamically adapts between 96kbps - 320kbps based on network latency' },
    { id: 'high', label: 'High (160 kbps)', desc: 'Balanced sound quality for mobile networks' },
    { id: 'normal', label: 'Normal (96 kbps)', desc: 'Data-efficient standard playback' },
    { id: 'lossless', label: 'Lossless FLAC Hi-Res', desc: 'AVAILABLE for your own files (local/FLAC uploads play bit-for-bit) and Jamendo FLAC where artists provide it. Not available through Spotify Web SDK (max 320 kbps there).', badge: 'LOCAL + JAMENDO' }
  ];

  return (
    <div className="pb-28 pt-2 px-4 space-y-5 max-w-xl mx-auto">
      {/* Audio Pipeline Status Banner */}
      <div className="p-4 bg-[#201f1f] border border-white/10 rounded-2xl flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#53e076] text-[#003914] flex items-center justify-center font-black flex-shrink-0 shadow-lg">
            <span className="material-symbols-outlined text-2xl">graphic_eq</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#e5e2e1]">Audio Quality & Stream Spec</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#53e076] text-[#003914] uppercase">
                FLAC-ready
              </span>
            </div>
            <p className="text-xs text-[#c6c6c7] mt-0.5">Open catalogue + local files (real DSP) · Spotify SDK for subscriber playback</p>
          </div>
        </div>
      </div>

      {/* Quality Transparency Notice */}
      <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400 text-base">info</span>
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
            Quality Transparency
          </h3>
        </div>
        <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
          <strong className="text-white">What each source really delivers:</strong> Jamendo up to FLAC where
          artists provide it · Audius transcoded MP3 · Internet Archive VBR MP3 for streaming (FLAC
          originals where uploaded) · your own files bit-for-bit · Spotify Web Playback up to
          320 kbps for Premium sessions only. No audio is ever faked, upscaled, or mislabeled.
        </p>
      </div>

      {/* End-to-End Pipeline Diagram */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-extrabold text-[#53e076] uppercase tracking-wider">
          Audio Pipeline Architecture
        </h3>

        <div className="grid grid-cols-3 gap-2 text-center">
          {/* Source */}
          <div className="p-2.5 bg-[#131313] rounded-xl border border-white/5 flex flex-col items-center">
            <span className="material-symbols-outlined text-[#53e076] text-xl mb-1">album</span>
            <span className="text-[10px] uppercase font-bold text-[#c6c6c7]">Source</span>
            <span className="text-xs font-extrabold text-[#e5e2e1] mt-0.5">Open Catalogue</span>
            <span className="text-[10px] font-mono text-[#53e076]">Full-length</span>
          </div>

          {/* Stream */}
          <div className="p-2.5 bg-[#131313] rounded-xl border border-white/5 flex flex-col items-center">
            <span className="material-symbols-outlined text-[#53e076] text-xl mb-1">tune</span>
            <span className="text-[10px] uppercase font-bold text-[#c6c6c7]">Pipeline</span>
            <span className="text-xs font-extrabold text-[#e5e2e1] mt-0.5">WebAudio DSP</span>
            <span className="text-[10px] font-mono text-[#53e076]">EQ + Normalize</span>
          </div>

          {/* DAC Output */}
          <div className="p-2.5 bg-[#131313] rounded-xl border border-white/5 flex flex-col items-center">
            <span className="material-symbols-outlined text-[#53e076] text-xl mb-1">headphones</span>
            <span className="text-[10px] uppercase font-bold text-[#c6c6c7]">Output</span>
            <span className="text-xs font-extrabold text-[#e5e2e1] mt-0.5">Browser Audio</span>
            <span className="text-[10px] font-mono text-[#53e076]">Native AudioContext</span>
          </div>
        </div>

        <div className="p-2.5 bg-[#131313]/60 rounded-xl flex items-center justify-between text-xs text-[#c6c6c7]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#53e076]" />
            Direct HTTPS streams + local DSP
          </span>
          <span className="font-mono text-[#53e076] text-[11px]">Spotify SDK only for subscriber playback</span>
        </div>
      </div>

      {/* Streaming Quality Selector (stored preference; the Web SDK chooses the actual stream) */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-extrabold text-[#e5e2e1]">Streaming Quality</h3>
        <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
          Saved preference only — Spotify's Web Playback SDK chooses the actual delivered bitrate.
        </p>
        <div className="space-y-2">
          {streamingOptions.map((opt) => {
            const isSelected = settings.streamingQuality === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => onUpdateSettings({ streamingQuality: opt.id })}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-[#1db954]/10 border-[#53e076] text-[#e5e2e1]'
                    : 'bg-[#1c1b1b] border-white/5 text-[#c6c6c7] hover:bg-[#2a2a2a]'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-[#e5e2e1]">{opt.label}</p>
                  <p className="text-[11px] text-[#c6c6c7] mt-0.5">{opt.desc}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ml-3 ${
                    isSelected ? 'border-[#53e076] bg-[#53e076]' : 'border-[#c6c6c7]/40'
                  }`}
                >
                  {isSelected && <span className="w-2 h-2 rounded-full bg-[#003914]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Wi-Fi Only Toggle */}
        <div className="pt-3 border-t border-white/5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#e5e2e1]">Stream Lossless on Wi-Fi only</p>
            <p className="text-[11px] text-[#c6c6c7]">Conserves mobile data plan bandwidth</p>
          </div>
          <button
            onClick={() => onUpdateSettings({ streamOnWifiOnly: !settings.streamOnWifiOnly })}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.streamOnWifiOnly ? 'bg-[#53e076]' : 'bg-[#353534]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-[#131313] transition-transform ${
                settings.streamOnWifiOnly ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Offline Storage Allocation Profile (real browser figures only) */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#e5e2e1]">Storage Profile</h3>
          <span className="text-xs font-mono text-[#53e076]">
            {storage ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}` : 'Measuring…'}
          </span>
        </div>

        <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
          Cached library metadata and lyrics. Spotify audio is never stored (Spotify policy);
          only your own local files and server streams can be kept offline.
        </p>

        {storage && storage.quota > 0 && (
          <div className="h-3 w-full bg-[#131313] rounded-full overflow-hidden flex">
            <div
              className="bg-[#53e076] h-full"
              style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Hardware & DAC Pipeline: real DSP for local files, honest labels elsewhere */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-sm font-extrabold text-[#e5e2e1]">Hardware & DAC Controls</h3>
        <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
          The equalizer and normalization below drive a real WebAudio chain that applies
          <strong className="text-white"> only to files played from this device</strong>.
          Spotify streams are untouched (Spotify's players don't allow it).
        </p>
        <LocalDspControls />

        <div className="flex items-center justify-between pt-2 border-t border-white/5 opacity-60">
          <div>
            <p className="text-xs font-bold text-[#e5e2e1]">
              Bit-Perfect Passthrough <span className="text-[9px] font-extrabold bg-[#353534] text-[#c6c6c7] rounded px-1.5 py-0.5 uppercase ml-1">Planned</span>
            </p>
            <p className="text-[11px] text-[#c6c6c7]">Bypasses OS audio mixer for external USB DACs</p>
          </div>
          <button
            disabled
            title="Not implemented in this build"
            className="w-12 h-6 rounded-full bg-[#353534] relative p-0.5 cursor-not-allowed"
          >
            <div className="w-5 h-5 rounded-full bg-[#131313]" />
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5 opacity-60">
          <div>
            <p className="text-xs font-bold text-[#e5e2e1]">
              Bit-Perfect Passthrough <span className="text-[9px] font-extrabold bg-[#353534] text-[#c6c6c7] rounded px-1.5 py-0.5 uppercase ml-1">Planned</span>
            </p>
            <p className="text-[11px] text-[#c6c6c7]">Bypasses OS audio mixer for external USB DACs</p>
          </div>
          <button
            disabled
            title="Not implemented in this build"
            className="w-12 h-6 rounded-full bg-[#353534] relative p-0.5 cursor-not-allowed"
          >
            <div className="w-5 h-5 rounded-full bg-[#131313]" />
          </button>
        </div>
      </div>

      {/* Own music server (Subsonic/Navidrome/Jellyfin): real connect + search + play */}
      <SubsonicBrowser onPlay={onPlaySubsonic} />

      {/* Free catalogue: Jamendo (full tracks, FLAC where provided) */}
      <JamendoSection />
    </div>
  );
};

const JamendoSection: React.FC = () => {
  const [clientId, setClientId] = useState(() => {
    try {
      return localStorage.getItem('soundscape_jamendo_client_id') ?? '';
    } catch {
      return '';
    }
  });
  const [quality, setQuality] = useState<'mp32' | 'flac'>(() => {
    try {
      return localStorage.getItem('soundscape_jamendo_quality') === 'flac' ? 'flac' : 'mp32';
    } catch {
      return 'mp32';
    }
  });
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [detail, setDetail] = useState('');
  const envKey = readEnvKey('VITE_JAMENDO_CLIENT_ID') ?? '';

  const test = async () => {
    const id = clientId.trim();
    if (!id && !envKey) {
      setStatus('fail');
      setDetail('Enter a client ID from devportal.jamendo.com first (free read-only plan).');
      return;
    }
    if (id) {
      try {
        localStorage.setItem('soundscape_jamendo_client_id', id);
      } catch {}
    }
    setStatus('testing');
    setDetail('');
    try {
      const { jamendoSearchTracks } = await import('../core/providers/jamendo/jamendoClient');
      const res = await jamendoSearchTracks('rock', 1);
      if (res.length === 0) throw new Error('No results — key may be invalid or quota exceeded');
      setStatus('ok');
      setDetail(`Connected. Sample: “${res[0].name}” by ${res[0].artistName}.`);
    } catch (e) {
      setStatus('fail');
      setDetail(e instanceof Error ? e.message : 'Connection failed');
    }
  };

  return (
    <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-[#e5e2e1]">Jamendo free catalogue</h3>
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${envKey || clientId.trim() ? 'bg-[#53e076]/20 text-[#53e076]' : 'bg-[#353534] text-[#c6c6c7]'}`}>
          {envKey || clientId.trim() ? 'Configured' : 'Not configured'}
        </span>
      </div>
      <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
        Independent music, full-length streams, FLAC where artists provide it. Free client ID from{' '}
        <span className="font-mono text-[#e5e2e1]">devportal.jamendo.com</span> (read-only plan).
        Without a key this provider stays off — nothing is faked.
      </p>
      {!envKey && (
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Jamendo client ID"
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-2 bg-[#131313] text-xs font-mono text-[#e5e2e1] rounded-lg border border-white/10 focus:border-[#53e076] focus:outline-none"
        />
      )}
      {envKey && (
        <p className="text-[11px] text-[#53e076]">Using the client ID from app configuration.</p>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-[#c6c6c7]">Preferred quality:</span>
        {(['mp32', 'flac'] as const).map((q) => (
          <button
            key={q}
            onClick={() => {
              setQuality(q);
              try {
                localStorage.setItem('soundscape_jamendo_quality', q);
              } catch {}
            }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${
              quality === q ? 'bg-[#53e076] text-[#003914]' : 'bg-[#2a2a2a] text-[#e5e2e1]'
            }`}
          >
            {q === 'mp32' ? 'MP3 VBR' : 'FLAC first'}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[#c6c6c7]">
        “FLAC first” tries FLAC per track and falls back to MP3 VBR when the artist didn't provide it.
      </p>
      <button
        onClick={test}
        disabled={status === 'testing'}
        className="w-full py-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-bold disabled:opacity-50"
      >
        {status === 'testing' ? 'Testing…' : 'Save & test connection'}
      </button>
      {status === 'ok' && <p className="text-[11px] text-[#53e076] font-semibold">{detail}</p>}
      {status === 'fail' && <p className="text-[11px] text-[#ffb4ab]">Not connected: {detail}</p>}
    </div>
  );
};

const LocalDspControls: React.FC = () => {
  const svc = AudioPlayerService.getInstance();
  const [eq, setEq] = useState(svc.getEq());
  const [norm, setNorm] = useState(svc.isNormalizationOn());

  const bands: { id: 'low' | 'mid' | 'high'; label: string }[] = [
    { id: 'low', label: 'Bass' },
    { id: 'mid', label: 'Mid' },
    { id: 'high', label: 'Treble' }
  ];

  return (
    <div className="space-y-3 p-3 bg-[#131313] rounded-xl border border-white/5">
      {bands.map((b) => (
        <div key={b.id} className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-[#c6c6c7] w-12">{b.label}</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={eq[b.id]}
            onChange={(e) => {
              const v = Number(e.target.value);
              svc.setEq(b.id, v);
              setEq(svc.getEq());
            }}
            className="flex-1 h-1.5 accent-[#53e076]"
            aria-label={`${b.label} EQ gain in decibels`}
          />
          <span className="text-[11px] font-mono text-[#53e076] w-12 text-right">
            {eq[b.id] > 0 ? `+${eq[b.id]}` : eq[b.id]} dB
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <div>
          <p className="text-xs font-bold text-[#e5e2e1]">Volume Normalization</p>
          <p className="text-[11px] text-[#c6c6c7]">Measures each local file (RMS) and evens out loudness</p>
        </div>
        <button
          onClick={() => {
            svc.setNormalization(!norm);
            setNorm(svc.isNormalizationOn());
          }}
          className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
            norm ? 'bg-[#53e076]' : 'bg-[#353534]'
          }`}
          role="switch"
          aria-checked={norm}
        >
          <div
            className={`w-5 h-5 rounded-full bg-[#131313] transition-transform ${
              norm ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
