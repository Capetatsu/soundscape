import React from 'react';
import { ActiveScreen } from '../types';

interface BottomNavProps {
  currentScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentScreen, onNavigate }) => {
  const isHome = currentScreen === 'home';
  const isSearch = currentScreen === 'search';
  const isLibrary = currentScreen === 'library';

  return (
    <nav className="sticky bottom-0 z-40 bg-[#131313]/95 backdrop-blur-xl border-t border-white/5 px-6 pt-2 pb-safe pb-3 flex items-center justify-around">
      {/* Home Tab */}
      <button
        id="nav-home-btn"
        onClick={() => onNavigate('home')}
        className={`flex flex-col items-center gap-1 transition-colors py-1 px-4 ${
          isHome ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
        }`}
      >
        <span className={`material-symbols-outlined text-2xl ${isHome ? 'fill-1' : ''}`}>
          home
        </span>
        <span className="text-[11px] font-semibold tracking-tight">Home</span>
      </button>

      {/* Search Tab */}
      <button
        id="nav-search-btn"
        onClick={() => onNavigate('search')}
        className={`flex flex-col items-center gap-1 transition-colors py-1 px-4 ${
          isSearch ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
        }`}
      >
        <span className={`material-symbols-outlined text-2xl ${isSearch ? 'fill-1 font-bold' : ''}`}>
          search
        </span>
        <span className="text-[11px] font-semibold tracking-tight">Search</span>
      </button>

      {/* Library Tab */}
      <button
        id="nav-library-btn"
        onClick={() => onNavigate('library')}
        className={`flex flex-col items-center gap-1 transition-colors py-1 px-4 ${
          isLibrary ? 'text-[#53e076]' : 'text-[#c6c6c7] hover:text-[#e5e2e1]'
        }`}
      >
        <span className={`material-symbols-outlined text-2xl ${isLibrary ? 'fill-1' : ''}`}>
          library_music
        </span>
        <span className="text-[11px] font-semibold tracking-tight">Your Library</span>
      </button>
    </nav>
  );
};
