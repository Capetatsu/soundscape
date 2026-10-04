import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';
import { registerProvider } from './core/providers/registry.ts';
import {
  SpotifyProvider,
  LocalProvider,
  SubsonicProvider,
  LrclibProvider,
  AudiusProvider,
  JamendoProvider,
  ArchiveProvider,
  RadioProvider
} from './core/providers/spotify/capabilities.ts';

// Capability registry: the single source of truth for what each provider can do.
// UI must consult this instead of hardcoding assumptions.
// Playback default (Option A): open catalogue first; Spotify is library/metadata only.
registerProvider(new SpotifyProvider());
registerProvider(new LocalProvider());
registerProvider(new SubsonicProvider());
registerProvider(new LrclibProvider());
registerProvider(new AudiusProvider());
registerProvider(new JamendoProvider());
registerProvider(new ArchiveProvider());
registerProvider(new RadioProvider());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

