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
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // Images are passive content: any HTTPS artwork/favicon is safe to render.
    "img-src 'self' https: data: blob:",
    // Audio elements need arbitrary HTTPS streams (radio + archive hosts).
    "media-src 'self' https: blob:",
    `connect-src 'self'${isProd ? '' : ' ws: wss:'} https://api.spotify.com https://accounts.spotify.com https://lrclib.net ${openConnect}`,
    "frame-src 'self' https://sdk.scdn.co",
    "frame-ancestors 'none'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  if (isProd) {
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

function appOrigin(): string {
  try {
    const u = new URL(REDIRECT_URI);
    return u.origin;
  } catch {
    return '';
  }
}

// ---------- Spotify client config (no hardcoded fallback in prod paths) ----------
const ENV_CLIENT_ID = (process.env.SPOTIFY_CLIENT_ID || '').trim();
const LEGACY_FALLBACK_CLIENT_ID = '5822fb3ce1814fc4916d228c580a8a0a';
function effectiveClientId(provided?: unknown): string | null {
  if (typeof provided === 'string' && /^[A-Za-z0-9]{16,64}$/.test(provided.trim())) return provided.trim();
  if (ENV_CLIENT_ID && /^[A-Za-z0-9]{16,64}$/.test(ENV_CLIENT_ID)) return ENV_CLIENT_ID;
  // Legacy fallback retained only for local dev continuity; flagged in diagnostics.
  return LEGACY_FALLBACK_CLIENT_ID;
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
function setSessionCookie(res: express.Response, sid: string): void {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `soundscape_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secure ? '; Secure' : ''}`);
}
function clearSessionCookie(res: express.Response): void {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `soundscape_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}
function getSession(req: express.Request): ServerSession | null {
  const sid = parseCookies(req)['soundscape_sid'];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  s.lastUsedAt = Date.now();
  return s;
}

// PKCE handshake store for BFF login (state -> verifier, 10 min TTL)
const pkceStore = new Map<string, { verifier: string; expiresAt: number }>();
function b64url(n: number): string {
  return crypto.randomBytes(n).toString('base64url');
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

// API: Config check (no secrets)
app.get('/api/config', (_req, res) => {
  res.json({
    clientId: ENV_CLIENT_ID || null,
    hasEnvClientId: !!ENV_CLIENT_ID,
    appUrl: REDIRECT_URI.replace('/auth/callback', ''),
    redirectUri: REDIRECT_URI,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    bffAuth: true
  });
});

// ---------- BFF OAuth (recommended flow) ----------
const SPOTIFY_SCOPES = [
  'user-library-read', 'user-library-modify',
  'playlist-read-private', 'playlist-read-collaborative',
  'playlist-modify-private', 'playlist-modify-public',
  'streaming', 'user-read-playback-state', 'user-modify-playback-state',
  'user-read-currently-playing', 'user-read-recently-played', 'user-top-read'
].join(' ');

app.get('/auth/spotify/login', rateLimit(10, 60_000), (_req, res) => {
  const clientId = effectiveClientId();
  if (!clientId) return res.status(500).json({ error: { code: 'no_client_id', message: 'Server Spotify client ID not configured', retryable: false } });
  const state = b64url(32);
  const verifier = b64url(64);
  pkceStore.set(state, { verifier, expiresAt: Date.now() + 10 * 60_1000 });
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
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
  if (!code || !state) return res.status(400).send('Missing code/state');
  const rec = pkceStore.get(state);
  pkceStore.delete(state);
  if (!rec || Date.now() > rec.expiresAt) return res.status(400).send('Expired login session. Please try again.');
  const clientId = effectiveClientId();
  if (!clientId) return res.status(500).send('Server client ID not configured');
  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
      client_id: clientId, code_verifier: rec.verifier
    });
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params
    });
    const data = await tokenRes.json() as Record<string, unknown>;
    if (!tokenRes.ok || !data['access_token']) {
      console.error('BFF token exchange failed:', data);
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
    setSessionCookie(res, sid);
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

app.post('/api/auth/logout', (req, res) => {
  const csrf = req.headers['x-requested-with'];
  if (!csrf) return res.status(403).json({ error: { code: 'csrf', message: 'Missing X-Requested-With header', retryable: false } });
  const s = getSession(req);
  if (s) sessions.delete(s.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---------- Legacy PKCE proxy (compat for existing localStorage flow; refresh token never logged) ----------
app.post('/api/auth/token', rateLimit(10, 60_000), async (req, res) => {
  try {
    const { code, code_verifier, redirect_uri, client_id } = req.body || {};
    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'Missing code or code_verifier' });
    }
    if (redirect_uri !== REDIRECT_URI) {
      return res.status(400).json({ error: 'Invalid redirect_uri' });
    }
    const resolvedClientId = effectiveClientId(client_id);
    if (!resolvedClientId) return res.status(500).json({ error: 'Server client ID not configured' });
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT_URI,
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

// API: OAuth Token Refresh Proxy (legacy compat)
app.post('/api/auth/refresh', rateLimit(10, 60_000), async (req, res) => {
  try {
    const { refresh_token, client_id } = req.body || {};
    if (!refresh_token) {
      return res.status(400).json({ error: 'Missing refresh_token' });
    }

    const resolvedClientId = effectiveClientId(client_id);
    if (!resolvedClientId) return res.status(500).json({ error: 'Server client ID not configured' });
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(refresh_token),
      client_id: resolvedClientId
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
    console.error('Proxy token refresh error');
    return res.status(500).json({ error: msg });
  }
});

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
      model: 'gemini-3.8-flash',
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

// OAuth Callback Route (legacy popup callback) — XSS-hardened, origin-locked postMessage
app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const origin = appOrigin();

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Spotify Authentication - Soundscape</title>
      <style>
        body {
          background-color: #131313;
          color: #e5e2e1;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          text-align: center;
          padding: 20px;
        }
        .card {
          background: #201f1f;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px;
          max-width: 380px;
          box-shadow: 0 16px 32px rgba(0,0,0,0.6);
        }
        .icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #1db954;
          color: #003914;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          font-size: 28px;
          font-weight: bold;
        }
        h2 { margin: 0 0 8px; font-size: 20px; }
        p { color: #c6c6c7; font-size: 14px; margin: 0 0 20px; line-height: 1.5; }
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(83,224,118,0.2);
          border-top-color: #53e076;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 12px auto 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✓</div>
        <h2>Spotify Authorized</h2>
        <p>Connecting your Spotify library to Soundscape. This window will close automatically.</p>
        <div class="spinner"></div>
      </div>
      <script>
        var code = ${JSON.stringify(code).replace(/</g, '\\u003c')};
        var error = ${JSON.stringify(error).replace(/</g, '\\u003c')};
        var state = ${JSON.stringify(state).replace(/</g, '\\u003c')};
        var targetOrigin = ${JSON.stringify(origin).replace(/</g, '\\u003c')};

        if (window.opener) {
          window.opener.postMessage({
            type: 'SPOTIFY_AUTH_CODE',
            code: code,
            error: error,
            state: state
          }, targetOrigin || window.location.origin);
          setTimeout(function () {
            window.close();
          }, 400);
        } else {
          var targetUrl = '/?code=' + encodeURIComponent(code) + (error ? '&error=' + encodeURIComponent(error) : '');
          window.location.href = targetUrl;
        }
      </script>
    </body>
    </html>
  `);
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

