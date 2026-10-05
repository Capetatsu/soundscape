import React, { useState } from 'react';
import { SpotifyDevice, SpotifyTrack } from '../types';

interface DeviceConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: SpotifyDevice[];
  activeDevice: SpotifyDevice | null;
  currentTrack: SpotifyTrack | null;
  volume: number;
  onSelectDevice: (device: SpotifyDevice) => void;
  onVolumeChange: (vol: number) => void;
}

export const DeviceConnectModal: React.FC<DeviceConnectModalProps> = ({
  isOpen,
  onClose,
  devices,
  activeDevice,
  currentTrack,
  volume,
  onSelectDevice,
  onVolumeChange
}) => {
  // Listen Together / Jam is phase-gated (P11). No fake session state:
  // the button below is an honest coming-soon placeholder, not a session toggle.
  const [showScanTip, setShowScanTip] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#201f1f] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#53e076] text-2xl">devices</span>
            <h2 className="text-lg font-extrabold text-[#e5e2e1]">Connect to a device</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#c6c6c7] hover:text-white flex items-center justify-center"
            aria-label="Close device picker"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Now Streaming Banner */}
        {currentTrack && (
          <div className="p-3 bg-[#131313] rounded-2xl border border-white/5 flex items-center justify-between">
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#53e076]">Now Streaming</span>
                <p className="text-xs font-bold text-[#e5e2e1] truncate">{currentTrack.name}</p>
                <p className="text-[11px] text-[#c6c6c7] truncate">{currentTrack.artists?.[0]?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 pr-2">
              <span className="w-1 h-3 bg-[#53e076] rounded-full animate-bounce" />
              <span className="w-1 h-5 bg-[#53e076] rounded-full animate-bounce delay-75" />
              <span className="w-1 h-2 bg-[#53e076] rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}

        {/* Current Device Card */}
        <div className="p-4 bg-gradient-to-br from-[#1db954]/15 to-[#201f1f] border border-[#53e076]/40 rounded-2xl space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#53e076] text-[#003914] flex items-center justify-center font-bold shadow-md">
                <span className="material-symbols-outlined text-xl">speaker</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-[#e5e2e1]">
                    {activeDevice?.name || 'This Phone'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#53e076] text-[#003914] uppercase">
                    CURRENT
                  </span>
                </div>
                <p className="text-[11px] text-[#c6c6c7] mt-0.5">
                  {activeDevice?.subtext || 'Direct DAC Output • 24-bit / 96kHz High-Res'}
                </p>
              </div>
            </div>
          </div>

          {/* Real-time Volume Slider */}
          <div className="pt-2 flex items-center gap-3">
            <span className="material-symbols-outlined text-[#c6c6c7] text-lg">volume_down</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-[#353534] rounded-lg appearance-none cursor-pointer accent-[#53e076]"
            />
            <span className="material-symbols-outlined text-[#c6c6c7] text-lg">volume_up</span>
            <span className="text-xs font-mono text-[#53e076] w-8 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {/* Listen Together (coming soon — phase-gated, no fake session) */}
        <div className="p-4 bg-[#1c1b1b] border border-white/10 rounded-2xl space-y-3 opacity-80">
          <div className="flex items-center gap-2 text-sm font-bold text-[#e5e2e1]">
            <span className="material-symbols-outlined text-[#53e076]">groups</span>
            <span>Listen Together</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#353534] text-[#c6c6c7] uppercase">
              Coming soon
            </span>
          </div>
          <p className="text-xs text-[#c6c6c7] leading-relaxed">
            Synchronized group listening is on the roadmap (P11) and is not available yet.
            Use the Spotify app's built-in Jam feature in the meantime.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              disabled
              title="Listen Together is not implemented yet"
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#2a2a2a] text-[#c6c6c7] cursor-not-allowed"
            >
              Start a shared session (unavailable)
            </button>
            <button
              onClick={() => setShowScanTip(!showScanTip)}
              className="px-3 py-2 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] flex items-center gap-1"
              title="How to use Spotify Jam instead"
            >
              <span className="material-symbols-outlined text-base">qr_code_scanner</span>
              <span>Spotify Jam</span>
            </button>
          </div>
          {showScanTip && (
            <div className="p-2.5 rounded-xl bg-[#131313] border border-[#53e076]/30 text-[11px] text-[#53e076] flex items-center gap-2 animate-in fade-in">
              <span className="material-symbols-outlined text-base">info</span>
              <span>Open Spotify app on your phone, tap Search &gt; Camera to scan and join this Jam.</span>
            </div>
          )}
        </div>

        {/* Device List */}
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-[#c6c6c7] uppercase tracking-wider">
            Select a device
          </h3>
          {devices.map((device) => {
            const isSelected = activeDevice?.id === device.id;
            return (
              <div
                key={device.id}
                onClick={() => onSelectDevice(device)}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-[#1db954]/15 border-[#53e076]'
                    : 'bg-[#1c1b1b] hover:bg-[#2a2a2a] border-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-2xl ${
                      isSelected ? 'text-[#53e076]' : 'text-[#c6c6c7]'
                    }`}
                  >
                    {device.type === 'Speaker'
                      ? 'speaker'
                      : device.type === 'Computer'
                      ? 'laptop'
                      : device.type === 'TV'
                      ? 'tv'
                      : 'headphones'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-xs font-bold ${
                          isSelected ? 'text-[#53e076]' : 'text-[#e5e2e1]'
                        }`}
                      >
                        {device.name}
                      </p>
                      {device.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#353534] text-[#c6c6c7]">
                          {device.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#c6c6c7] mt-0.5">
                      {device.subtext || 'Spotify Connect'}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <span className="material-symbols-outlined text-[#53e076] text-xl">
                    check_circle
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
