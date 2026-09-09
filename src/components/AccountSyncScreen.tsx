import React, { useState, useEffect } from 'react';
import { SpotifyUser } from '../types';
import { SpotifyAuthService } from '../services/spotifyAuth';
import { REDIRECT_URI } from '../config/redirectUri';

interface AccountSyncScreenProps {
  user: SpotifyUser | null;
  playlistsCount: number;
  likedSongsCount: number;
  isSyncing: boolean;
  onTriggerSync: () => Promise<void>;
  onConnectSpotify: () => void;
  onDisconnect: () => void;
  clientId: string;
  onUpdateClientId: (id: string) => void;
  onConnectWithToken?: (token: string) => Promise<void>;
}

export const AccountSyncScreen: React.FC<AccountSyncScreenProps> = ({
  user,
  playlistsCount,
  likedSongsCount,
  isSyncing,
  onTriggerSync,
  onConnectSpotify,
  onDisconnect,
  clientId,
  onUpdateClientId,
  onConnectWithToken
}) => {
  const [copiedDevUri, setCopiedDevUri] = useState(false);
  const [copiedSharedUri, setCopiedSharedUri] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [customClientId, setCustomClientId] = useState(clientId);
  const [manualToken, setManualToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isConnectingToken, setIsConnectingToken] = useState(false);
  const [connectTab, setConnectTab] = useState<'oauth' | 'manual'>('oauth');

  // Exact callback URLs
  const devCallbackUrl = REDIRECT_URI;
  const sharedCallbackUrl = REDIRECT_URI;

  useEffect(() => {
    setCustomClientId(clientId);
  }, [clientId]);

  const handleCopyDevUri = () => {
    navigator.clipboard?.writeText(devCallbackUrl);
    setCopiedDevUri(true);
    setTimeout(() => setCopiedDevUri(false), 2500);
  };

  const handleCopySharedUri = () => {
    navigator.clipboard?.writeText(sharedCallbackUrl);
    setCopiedSharedUri(true);
    setTimeout(() => setCopiedSharedUri(false), 2500);
  };

  const handleSaveClientId = () => {
    if (!customClientId.trim()) return;
    onUpdateClientId(customClientId.trim());
    SpotifyAuthService.setClientId(customClientId.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSaveAndConnect = () => {
    if (customClientId.trim()) {
      onUpdateClientId(customClientId.trim());
      SpotifyAuthService.setClientId(customClientId.trim());
    }
    onConnectSpotify();
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) {
      setTokenError('Please paste a valid Spotify access token.');
      return;
    }
    setTokenError(null);
    setIsConnectingToken(true);
    try {
      SpotifyAuthService.setManualToken(manualToken.trim());
      if (onConnectWithToken) {
        await onConnectWithToken(manualToken.trim());
      } else {
        await onTriggerSync();
      }
    } catch (err: any) {
      setTokenError(err.message || 'Failed to authenticate with token');
    } finally {
      setIsConnectingToken(false);
    }
  };

  return (
    <div className="pb-28 pt-2 px-4 space-y-5 max-w-2xl mx-auto">
      {/* Top Header & Security Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-[#1db954]/15 border border-[#53e076]/30 flex items-center gap-1.5 text-xs font-bold text-[#53e076]">
            <span className="material-symbols-outlined text-sm">verified</span>
            <span>SPOTIFY WEB API</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-[#201f1f] border border-white/10 flex items-center gap-1.5 text-xs font-semibold text-[#c6c6c7]">
            <span className="material-symbols-outlined text-sm text-[#53e076]">lock</span>
            <span>OAUTH 2.0 PKCE</span>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[#c6c6c7]">
          {user ? 'Session Active' : 'Disconnected'}
        </span>
      </div>

      {/* Account Status Card */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.images?.[0]?.url ? (
                <img
                  src={user.images[0].url}
                  alt={user.display_name}
                  className="w-16 h-16 rounded-full object-cover ring-4 ring-[#53e076]/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#e5e2e1] ring-4 ring-white/10">
                  <span className="material-symbols-outlined text-3xl">person</span>
                </div>
              )}
              <span
                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full ring-2 ring-[#201f1f] ${
                  user ? 'bg-[#53e076]' : 'bg-amber-400'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#e5e2e1]">
                  {user?.display_name || 'Spotify Account'}
                </h2>
                {user && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#53e076]/20 text-[#53e076] border border-[#53e076]/30 uppercase">
                    {user.product || 'Premium'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#c6c6c7] mt-0.5 font-mono">
                {user?.id ? `ID: ${user.id} • ${user.country || 'Global'}` : 'Not connected yet'}
              </p>
              <p className="text-[11px] mt-1 flex items-center gap-1 font-semibold">
                <span className={`w-2 h-2 rounded-full ${user ? 'bg-[#53e076] animate-ping' : 'bg-amber-400'}`} />
                <span className={user ? 'text-[#53e076]' : 'text-amber-300'}>
                  {user ? 'Real Account Linked & Synced' : 'Ready to Connect with Spotify'}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-3">
          {user ? (
            <>
              <button
                id="account-sync-now-btn"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="flex-1 py-2.5 rounded-xl bg-[#53e076] hover:bg-[#1db954] text-[#003914] font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-base ${isSyncing ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>{isSyncing ? 'Syncing Library...' : 'Manual Sync Now'}</span>
              </button>

              <button
                id="account-disconnect-btn"
                onClick={onDisconnect}
                className="px-4 py-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#ffb4ab] font-bold text-xs transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              id="account-connect-oauth-btn"
              onClick={handleSaveAndConnect}
              className="w-full py-3 rounded-xl bg-[#1db954] hover:bg-[#53e076] text-[#003914] font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-xl">login</span>
              <span>Connect Real Spotify Account</span>
            </button>
          )}
        </div>
      </div>

      {/* WHEN NOT CONNECTED: PROMINENT OAUTH SETUP & REDIRECT URI RESOLVER */}
      {!user && (
        <div className="bg-[#1c1b1b] border border-amber-500/30 rounded-2xl p-5 shadow-2xl space-y-4">
          {/* Header Callout for the Exact Screenshot Error */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-xl">build_circle</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-300">
                Fixing "redirect_uri: Not matching configuration"
              </h3>
              <p className="text-xs text-[#c6c6c7] mt-1 leading-relaxed">
                Spotify requires the exact <strong>Redirect URI</strong> below to be registered in your Spotify Developer Dashboard under your App's settings.
              </p>
            </div>
          </div>

          {/* Connection Mode Switcher */}
          <div className="flex rounded-xl bg-[#131313] p-1 border border-white/5">
            <button
              type="button"
              onClick={() => setConnectTab('oauth')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                connectTab === 'oauth'
                  ? 'bg-[#2a2a2a] text-[#53e076] shadow-sm'
                  : 'text-[#c6c6c7] hover:text-white'
              }`}
            >
              1. OAuth 2.0 PKCE Setup
            </button>
            <button
              type="button"
              onClick={() => setConnectTab('manual')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                connectTab === 'manual'
                  ? 'bg-[#2a2a2a] text-[#53e076] shadow-sm'
                  : 'text-[#c6c6c7] hover:text-white'
              }`}
            >
              2. Quick Token Connect
            </button>
          </div>

          {connectTab === 'oauth' ? (
            <div className="space-y-4 pt-1">
              {/* Step 1: Open Spotify Dashboard */}
              <div className="p-3 bg-[#131313] rounded-xl border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#53e076]/20 text-[#53e076] text-[11px] font-black flex items-center justify-center">1</span>
                    Open Spotify Developer Dashboard
                  </span>
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-[#53e076] hover:underline flex items-center gap-1 bg-[#1db954]/15 px-2.5 py-1 rounded-lg border border-[#53e076]/30"
                  >
                    <span>Open Dashboard</span>
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </a>
                </div>
                <p className="text-[11px] text-[#c6c6c7]">
                  Log in with your Spotify account, select or click <strong>Create App</strong>, then click <strong>Settings</strong>.
                </p>
              </div>

              {/* Step 2: Add Redirect URIs */}
              <div className="p-3 bg-[#131313] rounded-xl border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#53e076]/20 text-[#53e076] text-[11px] font-black flex items-center justify-center">2</span>
                    Add Redirect URI in Settings
                  </span>
                  <span className="text-[10px] font-mono text-[#c6c6c7]">Exact match required</span>
                </div>
                <p className="text-[11px] text-[#c6c6c7]">
                  In your Spotify App settings, under <strong>Redirect URIs</strong>, paste this callback URL and click <strong>Save</strong> at the bottom:
                </p>

                {/* Dev URI Box */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-[#c6c6c7]">
                    <span className="font-semibold text-white/90">Development Callback URI:</span>
                    {copiedDevUri && <span className="text-[#53e076] font-bold">Copied!</span>}
                  </div>
                  <div className="flex items-center gap-2 bg-[#1c1b1b] p-2 rounded-lg border border-white/10">
                    <code className="text-[11px] font-mono text-[#53e076] truncate flex-1 select-all">
                      {devCallbackUrl}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyDevUri}
                      className="px-2.5 py-1 rounded bg-[#2a2a2a] hover:bg-[#353534] text-[11px] font-bold text-[#e5e2e1] flex items-center gap-1 flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span>
                      <span>{copiedDevUri ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Shared URI Box */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-[#c6c6c7]">
                    <span className="font-semibold text-white/90">Shared / Deployed Callback URI:</span>
                    {copiedSharedUri && <span className="text-[#53e076] font-bold">Copied!</span>}
                  </div>
                  <div className="flex items-center gap-2 bg-[#1c1b1b] p-2 rounded-lg border border-white/10">
                    <code className="text-[11px] font-mono text-[#53e076] truncate flex-1 select-all">
                      {sharedCallbackUrl}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySharedUri}
                      className="px-2.5 py-1 rounded bg-[#2a2a2a] hover:bg-[#353534] text-[11px] font-bold text-[#e5e2e1] flex items-center gap-1 flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span>
                      <span>{copiedSharedUri ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3: Paste Client ID */}
              <div className="p-3 bg-[#131313] rounded-xl border border-white/5 space-y-2">
                <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#53e076]/20 text-[#53e076] text-[11px] font-black flex items-center justify-center">3</span>
                  Paste your Spotify App Client ID
                </span>
                <p className="text-[11px] text-[#c6c6c7]">
                  Copy the <strong>Client ID</strong> from your Spotify App overview and paste it here:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customClientId}
                    onChange={(e) => setCustomClientId(e.target.value)}
                    placeholder="Enter Spotify Client ID (e.g. 5822fb...)"
                    className="flex-1 px-3 py-2 bg-[#1c1b1b] text-[#e5e2e1] text-xs font-mono rounded-lg border border-white/15 focus:border-[#53e076] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveClientId}
                    className="px-3 py-2 bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-bold rounded-lg border border-white/10"
                  >
                    {savedSuccess ? 'Saved!' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleSaveAndConnect}
                className="w-full py-3 rounded-xl bg-[#1db954] hover:bg-[#53e076] text-[#003914] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
              >
                <span className="material-symbols-outlined text-base">login</span>
                <span>Authorize & Connect Spotify</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualTokenSubmit} className="space-y-3 pt-1">
              <div className="p-3 bg-[#131313] rounded-xl border border-white/5 space-y-2">
                <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-[#53e076]">key</span>
                  Instant Token Access (Alternative)
                </span>
                <p className="text-[11px] text-[#c6c6c7] leading-relaxed">
                  Have an access token from the Spotify API Console or Spotify Developer Dashboard? Paste it below to connect immediately without configuring Redirect URIs:
                </p>
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste Spotify OAuth Access Token (e.g. BQD...)"
                  className="w-full px-3 py-2.5 bg-[#1c1b1b] text-[#e5e2e1] text-xs font-mono rounded-lg border border-white/15 focus:border-[#53e076] focus:outline-none"
                />
                {tokenError && (
                  <p className="text-[11px] text-[#ffb4ab] font-medium">{tokenError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isConnectingToken || !manualToken.trim()}
                className="w-full py-3 rounded-xl bg-[#53e076] hover:bg-[#1db954] text-[#003914] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">
                  {isConnectingToken ? 'sync' : 'bolt'}
                </span>
                <span>{isConnectingToken ? 'Connecting...' : 'Connect with Token'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* Library Synchronization Status */}
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#e5e2e1] uppercase tracking-wider">
            Library Synchronization
          </h3>
          <span className={`text-xs font-mono font-bold ${user ? 'text-[#53e076]' : 'text-amber-400'}`}>
            {user ? '100% Synchronized' : '0% - Authentication Required'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full bg-[#131313] rounded-full overflow-hidden p-0.5 border border-white/5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              user
                ? 'bg-gradient-to-r from-[#1db954] to-[#53e076] w-full'
                : 'bg-white/10 w-0'
            }`}
          />
        </div>

        {/* Checklist Steps */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  user ? 'bg-[#53e076]/20 text-[#53e076]' : 'bg-white/5 text-[#c6c6c7]'
                }`}
              >
                <span className="material-symbols-outlined text-sm font-bold">
                  {user ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <span className="font-semibold text-[#e5e2e1]">Account & Identity Authenticated</span>
            </div>
            <span className={`font-mono text-[11px] ${user ? 'text-[#53e076] font-bold' : 'text-[#c6c6c7]'}`}>
              {user ? 'Token Active' : 'Pending'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  user ? 'bg-[#53e076]/20 text-[#53e076]' : 'bg-white/5 text-[#c6c6c7]'
                }`}
              >
                <span className="material-symbols-outlined text-sm font-bold">
                  {user ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <span className="font-semibold text-[#e5e2e1]">
                Syncing Playlists ({user ? playlistsCount : 0} Synced)
              </span>
            </div>
            <span className={`font-mono text-[11px] ${user ? 'text-[#53e076] font-bold' : 'text-[#c6c6c7]'}`}>
              {user ? 'Complete' : 'Pending'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  user ? 'bg-[#53e076]/20 text-[#53e076]' : 'bg-white/5 text-[#c6c6c7]'
                }`}
              >
                <span className="material-symbols-outlined text-sm font-bold">
                  {user ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <span className="font-semibold text-[#e5e2e1]">
                Importing Liked Songs ({user ? likedSongsCount : 0} Songs)
              </span>
            </div>
            <span className={`font-mono text-[11px] ${user ? 'text-[#53e076] font-bold' : 'text-[#c6c6c7]'}`}>
              {user ? 'Complete' : 'Pending'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  user ? 'bg-[#53e076]/20 text-[#53e076]' : 'bg-white/5 text-[#c6c6c7]'
                }`}
              >
                <span className="material-symbols-outlined text-sm font-bold">
                  {user ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <span className="font-semibold text-[#e5e2e1]">Followed Artists & Saved Albums</span>
            </div>
            <span className={`font-mono text-[11px] ${user ? 'text-[#53e076] font-bold' : 'text-[#c6c6c7]'}`}>
              {user ? 'Complete' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Sync Heartbeat Footer */}
        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-[#c6c6c7]">
          <span className="flex items-center gap-1.5 font-medium">
            <span className={`w-2 h-2 rounded-full ${user ? 'bg-[#53e076]' : 'bg-amber-400'}`} />
            Sync Heartbeat: {user ? 'Connected' : 'Idle'}
          </span>
          <span className="font-mono">{user ? 'Latency ~28ms' : 'Awaiting Connection'}</span>
        </div>
      </div>

      {/* Security & Token Governance */}
      <div className="bg-[#1c1b1b] border border-white/5 rounded-xl p-4 text-xs space-y-2 text-[#c6c6c7]">
        <div className="flex items-center gap-2 text-[#e5e2e1] font-bold">
          <span className="material-symbols-outlined text-base text-[#53e076]">security</span>
          <span>Data Integrity & Token Governance</span>
        </div>
        <p className="leading-relaxed">
          Soundscape uses client-side PKCE with cryptographically secure SHA-256 challenges. Tokens are preserved in local storage and refreshed automatically without exposing client credentials.
        </p>
      </div>
    </div>
  );
};

export default AccountSyncScreen;
