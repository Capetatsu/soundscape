import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { REDIRECT_URI } from './server/config/redirectUri';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '100kb' }));

// ---------- Security headers (helmet-lite, no new deps) ----------
// Dev CSP must allow Vite's inline preamble + HMR websocket; prod stays strict.
// connect/img/media explicitly allow the open-catalogue providers (Audius,
// Internet Archive, Radio Browser, Jamendo) — otherwise the player itself breaks.
app.use((_req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = (_req.headers['x-forwarded-proto'] ?? '').toString().split(',')[0] === 'https';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  const openConnect = [
    'https://discoveryprovider.audius.co',
    'https://*.audius.co',
    'https://archive.org',
    'https://*.archive.org',
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
    'https://*.api.radio-browser.info',
    'https://api.jamendo.com',
    'https://*.jamendo.com'
  ].join(' ');
  const csp = [
    "default-src 'self'",
    isProd
      ? "script-src 'self' https://sdk.scdn.co"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.scdn.co",
    // Fonts are bundled (see src/main.tsx), so no external font origin is granted.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Images are passive content: any HTTPS artwork/favicon is safe to render.
    "img-src 'self' https: data: blob:",
    // Audio elements need arbitrary HTTPS streams (radio + archive hosts).
    "media-src 'self' https: blob:",
    // Spotify's Web Playback SDK runs part of itself from a `data:` module/worker, which then
    // calls api.spotify.com. Without data:/blob: here the browser blocks those requests and
    // Spotify playback silently never initialises.
    `connect-src 'self'${isProd ? '' : ' ws: wss:'} data: blob: https://api.spotify.com https://accounts.spotify.com https://lrclib.net ${openConnect}`,
    "worker-src 'self' blob: data:",
    "frame-src 'self' https://sdk.scdn.co",
    "frame-ancestors 'none'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  if (isProd && isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ---------- Tiny in-memory rate limiter ----------
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(max: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    b.count += 1;
    if (b.count > max) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests, retry later', retryable: true } });
    }
    next();
  };
}

// ---------- Spotify client config (no hardcoded fallback in prod paths) ----------
const ENV_CLIENT_ID = (process.env.SPOTIFY_CLIENT_ID || '').trim();
function effectiveClientId(provided?: unknown): string | null {
  if (typeof provided === 'string' && /^[A-Za-z0-9]{16,64}$/.test(provided.trim())) return provided.trim();
  if (ENV_CLIENT_ID && /^[A-Za-z0-9]{16,64}$/.test(ENV_CLIENT_ID)) return ENV_CLIENT_ID;
  return null;
}

// ---------- BFF session store (server-side token vault) ----------
// Refresh tokens NEVER go to the browser. Access tokens are short-lived, memory-only.
interface ServerSession {
  id: string;
  accessToken: string;
  refreshTokenEnc: string; // AES-256-GCM encrypted
  expiresAt: number;
  scope: string;
  createdAt: number;
  lastUsedAt: number;
}
const sessions = new Map<string, ServerSession>();
const refreshMutex = new Map<string, Promise<boolean>>();

const ENC_KEY = (() => {
  const raw = process.env.SESSION_ENCRYPTION_KEY || '';
  if (raw.length >= 32) return crypto.createHash('sha256').update(raw).digest();
  // Ephemeral key (sessions invalid after restart) — operator should set SESSION_ENCRYPTION_KEY.
  const k = crypto.randomBytes(32);
  console.warn('[Soundscape] SESSION_ENCRYPTION_KEY not set — using ephemeral key. Set a 32+ char value in production.');
  return k;
})();

function enc(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${ct.toString('base64url')}.${tag.toString('base64url')}`;
}
function dec(payload: string): string {
  const [ivB, ctB, tagB] = payload.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
}

function parseCookies(req: express.Request): Record<string, string> {
  const out: Record<string, string> = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
/**
 * Whether this request actually arrived over HTTPS.
 *
 * This must follow the request, not NODE_ENV: `NODE_ENV=production` says nothing about the
 * scheme. Marking the session cookie `Secure` on a plain-HTTP loopback origin makes browsers
 * (and embedded webviews) drop it, which silently breaks the connection even though the token
 * exchange succeeded. `Secure` is therefore set only when the connection really is HTTPS.
 */
function isHttpsRequest(req: express.Request): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded ?? (req.secure ? 'https' : 'http'))
    .toString()
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
}
function setSessionCookie(req: express.Request, res: express.Response, sid: string): void {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `soundscape_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secure}`);
}
function clearSessionCookie(req: express.Request, res: express.Response): void {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `soundscape_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
function getSession(req: express.Request): ServerSession | null {
  const sid = parseCookies(req)['soundscape_sid'];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  s.lastUsedAt = Date.now();
  return s;
}

// PKCE handshake store for BFF login (state -> { verifier, redirectUri }, 10 min TTL)
const pkceStore = new Map<string, { verifier: string; redirectUri: string; expiresAt: number }>();
function b64url(n: number): string {
  return crypto.randomBytes(n).toString('base64url');
}

const ALLOWED_REDIRECT_URIS = new Set<string>([
  REDIRECT_URI,
  'http://127.0.0.1:3000/auth/spotify/callback',
  'http://localhost:3000/auth/spotify/callback'
]);
if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')) {
  ALLOWED_REDIRECT_URIS.add(`${process.env.APP_URL.replace(/\/+$/, '')}/auth/spotify/callback`);
}

// Initialize server-side Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
};

// API: Health
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, version: '2.0.0-bff', time: new Date().toISOString() });
});

function extractAppUrl(redirectUri: string): string {
  // Extract base URL from redirect URI (remove /auth/spotify/callback or /auth/callback suffix)
  return redirectUri.replace(/\/auth\/(spotify\/)?callback$/, '');
}

// API: Config check (no secrets)
app.get('/api/config', (_req, res) => {
  res.json({
    clientId: ENV_CLIENT_ID || null,
    hasEnvClientId: !!ENV_CLIENT_ID,
    appUrl: extractAppUrl(REDIRECT_URI),
    redirectUri: REDIRECT_URI,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    bffAuth: true
  });
});

// ---------- BFF OAuth (recommended flow) ----------
// `user-read-private` / `user-read-email` are REQUIRED: GET /me returns 403 without them, and
// /me is what tells the client who is signed in. Omitting them produced a token that
// exchanged fine but left the UI permanently "Disconnected".
const SPOTIFY_SCOPES = [
  'user-read-private', 'user-read-email',
  'user-library-read', 'user-library-modify',
  'playlist-read-private', 'playlist-read-collaborative',
  'playlist-modify-private', 'playlist-modify-public',
  'streaming', 'user-read-playback-state', 'user-modify-playback-state',
  'user-read-currently-playing', 'user-read-recently-played', 'user-top-read',
  'user-follow-read', 'user-follow-modify'
].join(' ');

app.get('/auth/spotify/login', rateLimit(10, 60_000), (req, res) => {
  const clientId = effectiveClientId();
  if (!clientId) return res.status(500).json({ error: { code: 'no_client_id', message: 'Server Spotify client ID not configured', retryable: false } });

  const host = req.get('host') || '';
  const proto = (req.headers['x-forwarded-proto'] ?? (req.secure ? 'https' : 'http')).toString().split(',')[0];
  const candidate = `${proto}://${host}/auth/spotify/callback`;
  const redirectUri = ALLOWED_REDIRECT_URIS.has(candidate) ? candidate : REDIRECT_URI;

  const state = b64url(32);
  const verifier = b64url(64);
  pkceStore.set(state, { verifier, redirectUri, expiresAt: Date.now() + 10 * 60_000 });
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
    code_challenge_method: 'S256', code_challenge: challenge, state, scope: SPOTIFY_SCOPES
  });
  // state bound via HttpOnly cookie-less server map; verifier never leaves server
  res.redirect(302, `https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/auth/spotify/callback', rateLimit(10, 60_000), async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const err = typeof req.query.error === 'string' ? req.query.error : '';
  if (err) return res.redirect(302, `/?auth_error=${encodeURIComponent(err)}`);
  // Never strand the person on a bare error page: every failure below returns to the app
  // with an explicit, actionable code that the UI renders.
  if (!code || !state) return res.redirect(302, '/?auth_error=missing_params');
  const rec = pkceStore.get(state);
  pkceStore.delete(state);
  if (!rec) return res.redirect(302, '/?auth_error=invalid_state');
  if (Date.now() > rec.expiresAt) return res.redirect(302, '/?auth_error=expired');
  const clientId = effectiveClientId();
  if (!clientId) return res.redirect(302, '/?auth_error=server_error');
  try {
    const redirectUri = rec.redirectUri || REDIRECT_URI;
    const params = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      client_id: clientId, code_verifier: rec.verifier
    });
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params
    });
    const data = await tokenRes.json() as Record<string, unknown>;
    if (!tokenRes.ok || !data['access_token']) {
      console.error('BFF token exchange failed:', { status: tokenRes.status, error: data['error'] ?? 'unknown' });
      return res.redirect(302, '/?auth_error=exchange_failed');
    }
    const sid = b64url(32);
    sessions.set(sid, {
      id: sid,
      accessToken: String(data['access_token']),
      refreshTokenEnc: enc(String(data['refresh_token'] || '')),
      expiresAt: Date.now() + (Number(data['expires_in'] || 3600)) * 1000,
      scope: String(data['scope'] || ''),
      createdAt: Date.now(), lastUsedAt: Date.now()
    });
    setSessionCookie(req, res, sid);
    return res.redirect(302, '/?auth_success=1');
  } catch (e) {
    console.error('BFF callback error:', e);
    return res.redirect(302, '/?auth_error=server_error');
  }
});

async function refreshSession(s: ServerSession): Promise<boolean> {
  const existing = refreshMutex.get(s.id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const refreshToken = dec(s.refreshTokenEnc);
      if (!refreshToken) return false;
      const clientId = effectiveClientId();
      if (!clientId) return false;
      const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
      const r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params
      });
      const data = await r.json() as Record<string, unknown>;
      if (!r.ok || !data['access_token']) {
        if (data['error'] === 'invalid_grant') {
          sessions.delete(s.id);
        }
        return false;
      }
      s.accessToken = String(data['access_token']);
      if (data['refresh_token']) s.refreshTokenEnc = enc(String(data['refresh_token']));
      s.expiresAt = Date.now() + (Number(data['expires_in'] || 3600)) * 1000;
      return true;
    } catch {
      return false;
    } finally {
      refreshMutex.delete(s.id);
    }
  })();
  refreshMutex.set(s.id, p);
  return p;
}

app.get('/api/auth/status', async (req, res) => {
  const s = getSession(req);
  if (!s) return res.json({ state: 'none' });
  if (Date.now() > s.expiresAt - 60_000) {
    const ok = await refreshSession(s);
    if (!ok) {
      if (!sessions.has(s.id)) return res.json({ state: 'revoked' });
      return res.json({ state: 'connected', expiring: true });
    }
  }
  res.json({ state: 'connected', scope: s.scope, expiresAt: s.expiresAt });
});

app.get('/api/auth/token', rateLimit(60, 60_000), async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: { code: 'unauthorized', message: 'Not connected', retryable: false } });
  if (Date.now() > s.expiresAt - 60_000) {
    const ok = await refreshSession(s);
    if (!ok) return res.status(401).json({ error: { code: 'revoked', message: 'Session revoked, reconnect Spotify', retryable: false } });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ access_token: s.accessToken, expires_at: s.expiresAt });
});

/**
 * Connection diagnostic.
 *
 * Answers the only question that matters when sign-in "succeeds" but nothing syncs: is the
 * TOKEN bad, or is the ACCOUNT not permitted? It probes two endpoints with the server-held
 * token — `/me` (needs user-read-private) and `/search` (needs no special scope):
 *
 *   search 200 + me 403  -> token is valid, Spotify refuses to identify this account
 *   both 403             -> the whole app is restricted for this account
 *   both 200             -> the token is fine and the browser path is at fault
 *
 * Returns only status codes, response text, and the granted scope list. The access and refresh
 * tokens are never included.
 */
app.get('/api/auth/diagnose', rateLimit(20, 60_000), async (req, res) => {
  if (!req.headers['x-requested-with']) {
    return res.status(403).json({ error: { code: 'csrf', message: 'Missing X-Requested-With header', retryable: false } });
  }
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: { code: 'not_connected', message: 'No Spotify session', retryable: false } });
  if (Date.now() > s.expiresAt - 60_000) {
    const ok = await refreshSession(s);
    if (!ok) return res.status(401).json({ error: { code: 'revoked', message: 'Session revoked — reconnect Spotify', retryable: false } });
  }

  const probe = async (label: string, path: string) => {
    try {
      const r = await fetch(`https://api.spotify.com/v1${path}`, {
        headers: { Authorization: `Bearer ${s.accessToken}` }
      });
      const text = await r.text();
      return { label, status: r.status, ok: r.ok, body: text.slice(0, 400) };
    } catch (e: unknown) {
      return { label, status: 0, ok: false, body: e instanceof Error ? e.message : 'network error' };
    }
  };

  const [me, search] = await Promise.all([
    probe('me', '/me'),
    probe('search', '/search?q=daft&type=track&limit=1')
  ]);

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    grantedScopes: s.scope.split(/\s+/).filter(Boolean),
    tokenExpiresInSeconds: Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000)),
    probes: { me, search },
    verdict:
      search.ok && !me.ok
        ? 'Token is valid, but Spotify refuses to identify this account. This is a Spotify app-permission issue (User Management / app restrictions), not a Soundscape bug.'
        : !search.ok && !me.ok
          ? 'Spotify is refusing every call for this app. Read the message above: the usual cause is that the Spotify account which OWNS this app in the Developer Dashboard does not have an active Premium subscription. Soundscape itself is fine.'
          : me.ok
            ? 'The token and profile both work. If the app still shows a problem, the fault is in the browser request path.'
            : 'Unexpected result.'
  });
});

app.post('/api/auth/logout', (req, res) => {
  const csrf = req.headers['x-requested-with'];
  if (!csrf) return res.status(403).json({ error: { code: 'csrf', message: 'Missing X-Requested-With header', retryable: false } });
  const s = getSession(req);
  if (s) sessions.delete(s.id);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// ---------- Legacy PKCE proxy (compat for existing localStorage flow; refresh token never logged) ----------
app.post('/api/auth/token', rateLimit(10, 60_000), async (req, res) => {
  try {
    const { code, code_verifier, redirect_uri, client_id } = req.body || {};
    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'Missing code or code_verifier' });
    }
    const reqRedirectUri = String(redirect_uri || '');
    if (!ALLOWED_REDIRECT_URIS.has(reqRedirectUri)) {
      return res.status(400).json({ error: 'Invalid redirect_uri' });
    }
    const resolvedClientId = effectiveClientId(client_id);
    if (!resolvedClientId) return res.status(500).json({ error: 'Server client ID not configured' });
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: reqRedirectUri,
      client_id: resolvedClientId,
      code_verifier: String(code_verifier)
    });

    const spotifyRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const data = await spotifyRes.json();
    return res.status(spotifyRes.status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal proxy error';
    console.error('Proxy token exchange error');
    return res.status(500).json({ error: msg });
  }
});

// NOTE: the legacy `POST /api/auth/refresh` proxy was removed. It existed only to trade a
// browser-supplied refresh token for a new access token, which is exactly what the BFF
// session prevents: `refreshSession()` performs the refresh with the server-held, encrypted
// refresh token, and `GET /api/auth/token` hands the browser only a short-lived access token.

// API: AI DJ & Smart Curation via Gemini API (honest errors, no fake tracks)
app.post('/api/ai/dj', rateLimit(10, 60_000), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: { code: 'ai_unavailable', message: 'AI DJ is unavailable: server AI key not configured.', retryable: false } });
    }
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid request body', retryable: false } });
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 500) : '';
    const mood = typeof body.mood === 'string' ? body.mood.slice(0, 120) : '';
    const currentTrack = body.currentTrack && typeof body.currentTrack === 'object' ? body.currentTrack : null;
    const userLibrarySample = Array.isArray(body.userLibrarySample) ? body.userLibrarySample.slice(0, 20) : [];
    const ai = getGeminiClient();

    const systemInstruction = `You are Soundscape AI DJ, a charismatic, deeply knowledgeable audio curator specializing in music history, sound synthesis, acoustics, genre evolution, and smart playlist recommendations. Keep responses vibrant, scannable, and formatted as clean JSON. Recommend only real, well-known tracks. Never invent artists.`;

    const trackCtx = currentTrack && typeof (currentTrack as Record<string, unknown>)['name'] === 'string'
      ? `${String((currentTrack as Record<string, unknown>)['name'])}`
      : 'None';

    const userPrompt = `
      User prompt or mood: ${prompt || mood || 'Late night ambient synthwave'}
      Current listening track: ${trackCtx}
      User library context: ${JSON.stringify(userLibrarySample).slice(0, 2000)}

      Generate JSON with:
      1. djIntro: 1-2 sentence DJ intro.
      2. vibeDescription: sonic qualities.
      3. recommendedTracks: Array of 5 track objects with { title, artist, album, reason, energyLevel: "chill"|"high"|"medium" }.
    `;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI generation failed';
    console.error('AI DJ generation error');
    res.status(502).json({ error: { code: 'ai_failed', message: msg, retryable: true } });
  }
});

// Legacy popup callback path, retired.
//
// This route used to render a "Spotify Authorized" page that posted the authorization code
// to `window.opener` and waited for the parent window to exchange it. The BFF flow made that
// handshake impossible (the server owns the exchange now), so the page spun forever on a
// message nobody was listening for. The route is kept only so a stale redirect URI or an old
// bookmark lands somewhere honest instead of a dead spinner: it forwards straight into the
// one canonical login flow.
app.get(['/auth/callback', '/auth/callback/'], (_req, res) => {
  res.redirect(302, '/auth/spotify/login');
});

// Vite middleware in dev or static serving in production
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Soundscape server listening on http://0.0.0.0:${PORT}`);
  });
}

start();

