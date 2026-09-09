import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { REDIRECT_URI } from './server/config/redirectUri';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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

// API: Config check
app.get('/api/config', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID || '5822fb3ce1814fc4916d228c580a8a0a';
  res.json({
    clientId,
    appUrl: REDIRECT_URI.replace('/auth/callback', ''),
    redirectUri: REDIRECT_URI,
    hasGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

// API: OAuth Token Exchange Proxy (handles PKCE authorization code grant)
app.post('/api/auth/token', async (req, res) => {
  try {
    const { code, code_verifier, redirect_uri, client_id } = req.body;
    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'Missing code or code_verifier' });
    }

    const effectiveClientId = client_id || process.env.SPOTIFY_CLIENT_ID || '5822fb3ce1814fc4916d228c580a8a0a';
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      client_id: effectiveClientId,
      code_verifier
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
  } catch (err: any) {
    console.error('Proxy token exchange error:', err);
    return res.status(500).json({ error: err.message || 'Internal proxy error' });
  }
});

// API: OAuth Token Refresh Proxy
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh_token, client_id } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Missing refresh_token' });
    }

    const effectiveClientId = client_id || process.env.SPOTIFY_CLIENT_ID || '5822fb3ce1814fc4916d228c580a8a0a';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: effectiveClientId
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
  } catch (err: any) {
    console.error('Proxy token refresh error:', err);
    return res.status(500).json({ error: err.message || 'Internal proxy error' });
  }
});

// API: AI DJ & Smart Curation via Gemini API
app.post('/api/ai/dj', async (req, res) => {
  try {
    const { prompt, currentTrack, mood, userLibrarySample } = req.body;
    const ai = getGeminiClient();

    const systemInstruction = `You are Soundscape AI DJ, a charismatic, deeply knowledgeable audio curator specializing in music history, sound synthesis, acoustics, genre evolution, and smart playlist recommendations. Keep responses vibrant, scannable, and formatted as clean JSON.`;

    const userPrompt = `
      User prompt or mood: ${prompt || mood || 'Late night ambient synthwave'}
      Current listening track: ${currentTrack ? `${currentTrack.name} by ${currentTrack.artists?.[0]?.name}` : 'None'}
      User library context: ${userLibrarySample ? JSON.stringify(userLibrarySample) : 'Diverse modern tracks'}

      Generate:
      1. djIntro: A punchy, cool, 1-2 sentence DJ spoken radio-style voice intro.
      2. vibeDescription: What sonic qualities make this vibe special (e.g. 808 sub bass, analog tape flutter, bit-perfect depth).
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
  } catch (err: any) {
    console.error('AI DJ generation error:', err);
    // Graceful fallback response if Gemini key is not configured
    res.json({
      djIntro: "Welcome back to Soundscape. Spinning pure bit-perfect frequencies handpicked for your nocturnal flow.",
      vibeDescription: "Rich harmonic analog warmth paired with crisp modern rhythmic syncopation.",
      recommendedTracks: [
        { title: "Danielle (smile on my face)", artist: "Fred again..", album: "Actual Life 3", reason: "Atmospheric house groove with authentic vocal chops", energyLevel: "medium" },
        { title: "Glue", artist: "Bicep", album: "Bicep", reason: "Iconic UK breakbeat with euphoric nostalgic pads", energyLevel: "medium" },
        { title: "So U Kno", artist: "Overmono", album: "Fabric Presents", reason: "Sub-heavy club precision with rolling percussion", energyLevel: "high" },
        { title: "Reckoner", artist: "Radiohead", album: "In Rainbows", reason: "Masterful dynamic percussion and golden falsetto", energyLevel: "chill" },
        { title: "Solar Power", artist: "Lorde", album: "Solar Power", reason: "Sunlit acoustic warmth and breezy organic textures", energyLevel: "chill" }
      ]
    });
  }
});

// OAuth Callback Route (popup callback)
app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
  const code = req.query.code || '';
  const error = req.query.error || '';
  const state = req.query.state || '';

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
        const code = "${code}";
        const error = "${error}";
        const state = "${state}";

        if (window.opener) {
          window.opener.postMessage({
            type: 'SPOTIFY_AUTH_CODE',
            code,
            error,
            state
          }, '*');
          setTimeout(() => {
            window.close();
          }, 400);
        } else {
          // If not opened in popup, redirect back to home root
          const targetUrl = '/?code=' + encodeURIComponent(code) + (error ? '&error=' + encodeURIComponent(error) : '');
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Soundscape server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
