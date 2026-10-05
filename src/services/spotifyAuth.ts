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

export class SpotifyAuthService {
  private static clientIdKey = 'soundscape_client_id';
  private static tokenKey = 'spotify_access_token';
  private static refreshTokenKey = 'spotify_refresh_token';
  private static expiresAtKey = 'spotify_token_expires_at';
  private static verifierKey = 'spotify_pkce_verifier';

  // BFF session tokens: memory-only, NEVER persisted (spec 21_SECURITY.md).
  private static memToken: string | null = null;
  private static memExpiresAt = 0;
  private static bffConnected = false;

  /** Prefer the BFF session (server-held refresh token). Falls back to legacy localStorage flow. */
  static async initBffSession(): Promise<'connected' | 'revoked' | 'none' | 'legacy'> {
    try {
      const res = await fetch('/api/auth/status', { headers: { 'X-Requested-With': 'Soundscape' } });
      if (!res.ok) return this.isAuthenticated() ? 'legacy' : 'none';
      const data = await res.json() as { state?: string };
      if (data.state === 'connected') {
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

  /** Full-page redirect into server-side PKCE login (recommended flow). */
  static bffLogin(): void {
    window.location.href = '/auth/spotify/login';
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

  static isBffConnected(): boolean {
    return this.bffConnected && !!this.memToken && Date.now() < this.memExpiresAt - 60_000;
  }

  static getScopes(): string[] {
    return SPOTIFY_SCOPES.split(' ');
  }

  static getTokenExpirationDetails(): { isExpired: boolean; expiresInMs: number; expiresAt: number | null } {
    if (this.memToken) {
      const diff = this.memExpiresAt - Date.now();
      return {
        isExpired: diff <= 0,
        expiresInMs: Math.max(0, diff),
        expiresAt: this.memExpiresAt
      };
    }
    const expiresAtStr = localStorage.getItem(this.expiresAtKey);
    if (!expiresAtStr) return { isExpired: true, expiresInMs: 0, expiresAt: null };
    const expiresAt = parseInt(expiresAtStr, 10);
    const diff = expiresAt - Date.now();
    return {
      isExpired: diff <= 0,
      expiresInMs: Math.max(0, diff),
      expiresAt
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

  // PKCE Crypto Helpers
  private static generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let text = '';
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      text += possible[array[i] % possible.length];
    }
    return text;
  }

  private static async sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
  }

  private static base64UrlEncode(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  static async initiateAuth(): Promise<void> {
    const clientId = this.getClientId();
    const redirectUri = this.getRedirectUri();
    const verifier = this.generateRandomString(64);
    const hashed = await this.sha256(verifier);
    const challenge = this.base64UrlEncode(hashed);

    localStorage.setItem(this.verifierKey, verifier);

    const state = this.generateRandomString(16);
    localStorage.setItem('spotify_auth_state', state);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state: state,
      scope: SPOTIFY_SCOPES
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    // According to AI Studio oauth-integration skill:
    // Container is iframe-only; OAuth popups must open provider URL directly
    const width = 550;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      authUrl,
      'spotify_oauth',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=1`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      console.warn('[Soundscape Auth] Popup blocked or restricted by iframe. Please allow popups or open in a new tab.');
    }
  }

  static async exchangeCode(code: string): Promise<boolean> {
    const verifier = localStorage.getItem(this.verifierKey);
    const clientId = this.getClientId();
    const redirectUri = this.getRedirectUri();

    try {
      // First try backend proxy (which avoids any CORS issues)
      const proxyRes = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          client_id: clientId
        })
      });

      let data: any;
      if (proxyRes.ok) {
        data = await proxyRes.json();
      } else {
        // Fallback directly to accounts.spotify.com (which supports CORS with PKCE)
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier || ''
        });

        const res = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error_description || `OAuth error ${res.status}`);
        }
        data = await res.json();
      }

      if (data.access_token) {
        this.saveTokens(data);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to exchange Spotify auth code:', err);
      throw err;
    }
  }

  static async refreshToken(): Promise<string | null> {
    // BFF session refreshes server-side; never expose the refresh token.
    if (this.bffConnected || this.memToken) {
      const t = await this.bffFetchToken();
      if (t) return t;
    }
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    const clientId = this.getClientId();
    if (!refreshToken) return null;

    try {
      // Try backend proxy
      const proxyRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, client_id: clientId })
      });

      let data: any;
      if (proxyRes.ok) {
        data = await proxyRes.json();
      } else {
        const params = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId
        });

        const res = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });
        if (!res.ok) return null;
        data = await res.json();
      }

      if (data.access_token) {
        this.saveTokens(data);
        return data.access_token;
      }
      return null;
    } catch (err) {
      console.error('Failed to refresh Spotify token:', err);
      return null;
    }
  }

  private static saveTokens(data: { access_token: string; refresh_token?: string; expires_in: number }): void {
    // Decision #5: Tokens never reach localStorage.
    this.memToken = data.access_token;
    this.memExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    // Remove any legacy tokens from localStorage
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.expiresAtKey);
  }

  static disconnect(): void {
    this.memToken = null;
    this.memExpiresAt = 0;
    this.bffConnected = false;
    void this.bffLogout();
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.expiresAtKey);
    localStorage.removeItem(this.verifierKey);
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('soundscape_user_profile');
    localStorage.removeItem('soundscape_cached_playlists');
    localStorage.removeItem('soundscape_cached_liked');
  }
}
