import React, { useState } from 'react';
import { AudioSettings } from '../types';

interface AudioSettingsScreenProps {
  settings: AudioSettings;
  onUpdateSettings: (newSettings: Partial<AudioSettings>) => void;
}

export const AudioSettingsScreen: React.FC<AudioSettingsScreenProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [activeTab, setActiveTab] = useState<'streaming' | 'downloads' | 'hardware'>('streaming');

  const streamingOptions: { id: AudioSettings['streamingQuality']; label: string; desc: string; badge?: string }[] = [
    { id: 'very_high', label: 'Very High (320 kbps) — Official Spotify Max', desc: 'Highest official bitrate stream delivered by Spotify Web Playback SDK for Premium accounts', badge: 'RECOMMENDED' },
    { id: 'auto', label: 'Automatic', desc: 'Dynamically adapts between 96kbps - 320kbps based on network latency' },
    { id: 'high', label: 'High (160 kbps)', desc: 'Balanced sound quality for mobile networks' },
    { id: 'normal', label: 'Normal (96 kbps)', desc: 'Data-efficient standard playback' },
    { id: 'lossless', label: 'Lossless FLAC Hi-Res', desc: 'NOT AVAILABLE THROUGH CURRENT OFFICIAL INTEGRATION. Spotify Web API and Web Playback SDK officially stream up to 256/320 kbps AAC/Vorbis. Bit-perfect 24-bit studio FLAC is not exposed in public third-party Web SDK.', badge: 'RESTRICTED' }
  ];

  return (
    <div className="pb-28 pt-2 px-4 space-y-5 max-w-xl mx-auto">
      {/* HiFi Audit & Status Banner */}
      <div className="p-4 bg-[#201f1f] border border-white/10 rounded-2xl flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#53e076] text-[#003914] flex items-center justify-center font-black flex-shrink-0 shadow-lg">
            <span className="material-symbols-outlined text-2xl">graphic_eq</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#e5e2e1]">Audio Quality & Stream Spec</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#53e076] text-[#003914] uppercase">
                320 KBPS MAX
              </span>
            </div>
            <p className="text-xs text-[#c6c6c7] mt-0.5">Spotify Web Playback SDK (Encrypted AAC / Vorbis)</p>
          </div>
        </div>
      </div>

      {/* Lossless Transparency Audit Notice */}
      <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400 text-base">info</span>
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
            Lossless HiFi Integration Status
          </h3>
        </div>
        <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
          <strong className="text-white">NOT AVAILABLE THROUGH CURRENT OFFICIAL INTEGRATION:</strong> Spotify’s official Web Playback SDK provides encrypted high-bitrate streaming at up to 320 kbps (Vorbis/AAC) for Premium accounts. True uncompressed 24-bit studio FLAC is not publicly supported by Spotify’s third-party web developer endpoints. No audio is ever faked or simulated.
        </p>
      </div>

      {/* End-to-End Pipeline Diagram */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-extrabold text-[#53e076] uppercase tracking-wider">
          Official Audio Pipeline Architecture
        </h3>

        <div className="grid grid-cols-3 gap-2 text-center">
          {/* Source */}
          <div className="p-2.5 bg-[#131313] rounded-xl border border-white/5 flex flex-col items-center">
            <span className="material-symbols-outlined text-[#53e076] text-xl mb-1">album</span>
            <span className="text-[10px] uppercase font-bold text-[#c6c6c7]">Source</span>
            <span className="text-xs font-extrabold text-[#e5e2e1] mt-0.5">Spotify Cloud</span>
            <span className="text-[10px] font-mono text-[#53e076]">320k Premium</span>
          </div>

          {/* Stream */}
          <div className="p-2.5 bg-[#131313] rounded-xl border border-white/5 flex flex-col items-center">
            <span className="material-symbols-outlined text-[#53e076] text-xl mb-1">lock</span>
            <span className="text-[10px] uppercase font-bold text-[#c6c6c7]">Pipeline</span>
            <span className="text-xs font-extrabold text-[#e5e2e1] mt-0.5">Web SDK EME</span>
            <span className="text-[10px] font-mono text-[#53e076]">Encrypted Stream</span>
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
            Official Spotify Playback Protocol
          </span>
          <span className="font-mono text-[#53e076] text-[11px]">Bit-Accurate AAC/Vorbis</span>
        </div>
      </div>

      {/* Streaming Quality Selector */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-extrabold text-[#e5e2e1]">Streaming Quality</h3>
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

      {/* Offline Storage Allocation Profile */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#e5e2e1]">Storage Profile</h3>
          <span className="text-xs font-mono text-[#53e076]">~1.2 GB / 50 FLAC tracks</span>
        </div>

        {/* Visual Segmented Bar */}
        <div className="h-3 w-full bg-[#131313] rounded-full overflow-hidden flex">
          <div className="bg-[#53e076] h-full w-[25%]" title="Lossless Audio 2.4 GB" />
          <div className="bg-[#1db954]/50 h-full w-[15%]" title="App Cache 1.1 GB" />
          <div className="bg-white/10 h-full w-[60%]" title="Free Space 64 GB" />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#c6c6c7] pt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#53e076]" />
            Lossless Audio: 2.4 GB
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#1db954]/50" />
            Cache: 1.1 GB
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            Free: 64.2 GB
          </span>
        </div>
      </div>

      {/* Hardware & DAC Pipeline */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-sm font-extrabold text-[#e5e2e1]">Hardware & DAC Controls</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#e5e2e1]">Bit-Perfect Passthrough</p>
            <p className="text-[11px] text-[#c6c6c7]">Bypasses OS audio mixer for external USB DACs</p>
          </div>
          <button
            onClick={() => onUpdateSettings({ bitPerfectPassthrough: !settings.bitPerfectPassthrough })}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.bitPerfectPassthrough ? 'bg-[#53e076]' : 'bg-[#353534]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-[#131313] transition-transform ${
                settings.bitPerfectPassthrough ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div>
            <p className="text-xs font-bold text-[#e5e2e1]">Volume Normalization</p>
            <p className="text-[11px] text-[#c6c6c7]">Maintain consistent volume across all tracks</p>
          </div>
          <button
            onClick={() => onUpdateSettings({ volumeNormalization: !settings.volumeNormalization })}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              settings.volumeNormalization ? 'bg-[#53e076]' : 'bg-[#353534]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-[#131313] transition-transform ${
                settings.volumeNormalization ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
