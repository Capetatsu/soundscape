import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
// Self-hosted fonts. Bundled deliberately instead of linked from Google Fonts: a blocked,
// throttled, or bot-gated font CDN turns every Material Symbols ligature into visible raw
// text ("play_arrow") across the whole app and leaves icons overlapping their buttons.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/material-symbols-outlined/400.css';
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

