import { DEFAULT_CLIENT_ID } from '../data/defaultCatalog';
import { REDIRECT_URI } from '../config/redirectUri';

const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'streaming',
  'app-remote-control',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-follow-read',
  'user-follow-modify'
].join(' ');

/**
 * localStorage keys an older build used to persist Spotify credentials under. The BFF flow
 * keeps every token in memory, so these are only ever removed — never written or read.
 */
const LEGACY_TOKEN_KEYS = [
  'spotify_access_token',
  'spotify_refresh_token',
  'spotify_token_expires_at',
  'spotify_pkce_verifier'
] as const;

export class SpotifyAuthService {
  private static clientIdKey = 'soundscape_client_id';

  // BFF session tokens: memory-only, NEVER persisted (spec 21_SECURITY.md).
  private static memToken: string | null = null;
  private static memExpiresAt = 0;
  private static bffConnected = false;
  private static grantedScope = '';

  /** Scopes Spotify actually granted this token (space-separated), for diagnostics. */
  static getGrantedScopes(): string[] {
    return this.grantedScope.split(/\s+/).filter(Boolean);
  }

  /** Prefer the BFF session (server-held refresh token). Falls back to legacy localStorage flow. */
  static async initBffSession(): Promise<'connected' | 'revoked' | 'none' | 'legacy'> {
    try {
      const res = await fetch('/api/auth/status', { headers: { 'X-Requested-With': 'Soundscape' } });
      if (!res.ok) return this.isAuthenticated() ? 'legacy' : 'none';
      const data = await res.json() as { state?: string };
      if (data.state === 'connected') {
        // Keep the granted scope list: it is the only way to tell "the server is running old
        // code" apart from "Spotify refused this token" when /me comes back 403.
        this.grantedScope = typeof (data as any).scope === 'string' ? (data as any).scope : '';
        const tok = await this.bffFetchToken();
        this.bffConnected = !!tok;
        return tok ? 'connected' : 'revoked';
      }
      if (data.state === 'revoked') {
        this.bffConnected = false;
        this.memToken = null;
        return 'revoked';
      }
      return this.isAuthenticated() ? 'legacy' : 'none';
    } catch {
      return this.isAuthenticated() ? 'legacy' : 'none';
    }
  }

  static async bffFetchToken(): Promise<string | null> {
    try {
      const res = await fetch('/api/auth/token', { headers: { 'X-Requested-With': 'Soundscape' } });
      if (!res.ok) {
        this.memToken = null;
        return null;
      }
      const data = await res.json() as { access_token?: string; expires_at?: number };
      if (data.access_token) {
        this.memToken = data.access_token;
        this.memExpiresAt = data.expires_at || Date.now() + 3600_000;
        this.bffConnected = true;
        return data.access_token;
      }
      return null;
    } catch {
      return null;
    }
  }

  static async bffLogout(): Promise<void> {
    this.memToken = null;
    this.memExpiresAt = 0;
    this.bffConnected = false;
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-Requested-With': 'Soundscape' }
      });
    } catch {
      // logout is best-effort client-side; server cookie may already be gone
    }
  }

  /**
 * Ask the server to probe Spotify with the server-held token.
 *
 * Separates "the token is bad" from "Spotify will not identify this account" — the two look
 * identical from the browser. Never returns tokens; only status codes, response text, and the
 * granted scope list.
 */
static async diagnose(): Promise<{
    grantedScopes: string[];
    tokenExpiresInSeconds: number;
    verdict: string;
    probes: Record<string, { label: string; status: number; ok: boolean; body: string }>;
  } | null> {
    try {
      const res = await fetch('/api/auth/diagnose', { headers: { 'X-Requested-With': 'Soundscape' } });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  static isBffConnected(): boolean {
    return this.bffConnected && !!this.memToken && Date.now() < this.memExpiresAt - 60_000;
  }

  static getScopes(): string[] {
    return SPOTIFY_SCOPES.split(' ');
  }

  static getTokenExpirationDetails(): { isExpired: boolean; expiresInMs: number; expiresAt: number | null } {
    if (!this.memToken) return { isExpired: true, expiresInMs: 0, expiresAt: null };
    const diff = this.memExpiresAt - Date.now();
    return {
      isExpired: diff <= 0,
      expiresInMs: Math.max(0, diff),
      expiresAt: this.memExpiresAt
    };
  }

  static getClientId(): string {
    return localStorage.getItem(this.clientIdKey) || DEFAULT_CLIENT_ID;
  }

  static setClientId(id: string): void {
    if (id && id.trim()) {
      localStorage.setItem(this.clientIdKey, id.trim());
    }
  }

  static getRedirectUri(): string {
    return REDIRECT_URI;
  }

  static setRedirectUri(uri: string): void {
    // No-op: redirect URI is now controlled via VITE_REDIRECT_URI environment variable
    console.warn('[Soundscape Auth] setRedirectUri is deprecated. Use VITE_REDIRECT_URI env var instead.');
  }

  static setManualToken(token: string, expiresIn = 3600): void {
    if (!token || !token.trim()) return;
    const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
    this.saveTokens({
      access_token: cleanToken,
      expires_in: expiresIn
    });
  }

  static getAccessToken(): string | null {
    // Memory-only access token (Decision #5: never persisted to localStorage)
    if (this.memToken && Date.now() < this.memExpiresAt - 60_000) return this.memToken;
    return this.memToken;
  }

  static isTokenExpired(): boolean {
    if (this.memToken && Date.now() < this.memExpiresAt - 60_000) return false;
    return true;
  }

  static isAuthenticated(): boolean {
    return !!(this.memToken && Date.now() < this.memExpiresAt - 60_000);
  }

  /**
   * The single active "Connect Spotify" entry point.
   *
   * The server owns PKCE, the code exchange, and the refresh token; the browser only ever
   * receives a short-lived access token in memory. The previous popup + window.opener
   * handshake was removed because the server-side callback can no longer postMessage to an
   * opener, which left the connect button spinning forever.
   */
  static bffLogin(): void {
    window.location.href = '/auth/spotify/login';
  }

  /**
   * Renew the in-memory access token.
   *
   * The server holds the refresh token and performs the refresh itself, so this simply asks
   * the BFF for a fresh short-lived access token. There is deliberately no client-side
   * refresh-token path any more.
   */
  static async refreshToken(): Promise<string | null> {
    return this.bffFetchToken();
  }

  private static saveTokens(data: { access_token: string; refresh_token?: string; expires_in: number }): void {
    // Tokens live in memory only; the refresh token never reaches the browser.
    this.memToken = data.access_token;
    this.memExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    // Scrub any tokens persisted by an older build.
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  }

  static disconnect(): void {
    this.memToken = null;
    this.memExpiresAt = 0;
    this.bffConnected = false;
    void this.bffLogout();
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('soundscape_user_profile');
    localStorage.removeItem('soundscape_cached_playlists');
    localStorage.removeItem('soundscape_cached_liked');
  }
}
