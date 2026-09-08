import React from 'react';
import { ActiveScreen, SpotifyUser } from '../types';

interface HeaderProps {
  currentScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  user: SpotifyUser | null;
  onOpenSync: () => void;
  onOpenSettings: () => void;
  onOpenAiDj: () => void;
  onOpenDiagnostics: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  onNavigate,
  user,
  onOpenSync,
  onOpenSettings,
  onOpenAiDj,
  onOpenDiagnostics
}) => {
  const isSubScreen = currentScreen !== 'home' && currentScreen !== 'search' && currentScreen !== 'library';

  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'playlist':
        return 'Playlist';
      case 'account_sync':
        return 'Connected Account';
      case 'audio_settings':
        return 'Lossless & Audio';
      case 'connect_device':
        return 'Connect Device';
      case 'queue':
        return 'Play Queue';
      case 'ai_dj':
        return 'AI DJ';
      case 'diagnostics':
        return 'System Diagnostics';
      default:
        return '';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#131313]/90 backdrop-blur-md px-4 pt-safe pt-3 pb-2.5 flex items-center justify-between border-b border-white/5 transition-all">
      {isSubScreen ? (
        <div className="flex items-center gap-3">
          <button
            id="header-back-btn"
            onClick={() => onNavigate('home')}
            className="w-9 h-9 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center transition-colors"
            title="Back to Home"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h1 className="text-base font-bold text-[#e5e2e1] tracking-tight">{getScreenTitle()}</h1>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => onNavigate('home')}>
            <div className="w-7 h-7 rounded-full bg-[#1db954] flex items-center justify-center shadow-[0_0_12px_rgba(83,224,118,0.4)]">
              <span className="material-symbols-outlined text-[#003914] text-lg font-bold">graphic_eq</span>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-[#e5e2e1] leading-none">Soundscape</span>
              <span className="text-[9px] font-semibold tracking-wider text-[#53e076] uppercase leading-tight">HiFi Lossless</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Icons */}
      <div className="flex items-center gap-1.5">
        {/* AI DJ Button */}
        <button
          id="header-ai-dj-btn"
          onClick={onOpenAiDj}
          className="relative px-2.5 py-1 rounded-full bg-gradient-to-r from-[#1db954]/20 to-[#34e36a]/10 border border-[#53e076]/30 text-[#53e076] hover:bg-[#53e076]/20 flex items-center gap-1 text-xs font-semibold transition-all shadow-sm"
          title="AI DJ & Smart Recommendations"
        >
          <span className="material-symbols-outlined text-sm animate-pulse">auto_awesome</span>
          <span className="hidden sm:inline">AI DJ</span>
        </button>

        {/* Audio Quality / HiFi shortcut */}
        <button
          id="header-hifi-btn"
          onClick={onOpenSettings}
          className="w-8 h-8 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c6c6c7] hover:text-[#53e076] flex items-center justify-center transition-colors"
          title="Audio Quality & HiFi Settings"
        >
          <span className="material-symbols-outlined text-lg">tune</span>
        </button>

        {/* Diagnostics & E2E Test Report */}
        <button
          id="header-diagnostics-btn"
          onClick={onOpenDiagnostics}
          className="w-8 h-8 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c6c6c7] hover:text-[#e5e2e1] flex items-center justify-center transition-colors"
          title="System Diagnostics & E2E Test"
        >
          <span className="material-symbols-outlined text-lg">verified</span>
        </button>

        {/* User Account / Sync Status Avatar */}
        <button
          id="header-account-btn"
          onClick={onOpenSync}
          className="relative ml-1 flex items-center"
          title={user ? `Signed in as ${user.display_name}` : 'Connect Spotify Account'}
        >
          {user?.images?.[0]?.url ? (
            <img
              src={user.images[0].url}
              alt={user.display_name}
              className="w-8 h-8 rounded-full object-cover border border-white/10 ring-2 ring-[#53e076]/40"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] border border-white/10 flex items-center justify-center text-[#e5e2e1]">
              <span className="material-symbols-outlined text-lg">person</span>
            </div>
          )}
          {/* Status Indicator Dot */}
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#131313] ${
              user ? 'bg-[#53e076]' : 'bg-amber-400'
            }`}
          />
        </button>
      </div>
    </header>
  );
};
