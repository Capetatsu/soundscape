// Verification test for Spotify OAuth redirect URI resolution, PKCE flow, and session safety.
import { BASE, createReporter } from '../lib/harness.mjs';

const { pass, finish } = createReporter('SPOTIFY OAUTH & REDIRECT URI');

try {
  // 1. Initial auth status when disconnected
  const statusRes = await fetch(`${BASE}/api/auth/status`);
  const statusData = await statusRes.json();
  pass('1. /api/auth/status reports disconnected state: "none"', statusData.state === 'none', JSON.stringify(statusData));

  // 2. Start Spotify login with default host
  const loginRes = await fetch(`${BASE}/auth/spotify/login`, {
    redirect: 'manual'
  });
  pass('2. /auth/spotify/login initiates redirect', loginRes.status === 302 || loginRes.status === 303 || loginRes.status === 307);

  const loc = loginRes.headers.get('location');
  pass('3. redirect points to accounts.spotify.com/authorize', !!loc && loc.startsWith('https://accounts.spotify.com/authorize'));

  if (loc) {
    const authUrl = new URL(loc);
    const redirectUri = authUrl.searchParams.get('redirect_uri');
    const clientId = authUrl.searchParams.get('client_id');
    const codeChallenge = authUrl.searchParams.get('code_challenge');
    const state = authUrl.searchParams.get('state');

    pass('4. redirect_uri is an exact match for loopback callback',
      redirectUri === 'http://127.0.0.1:3000/auth/callback' || redirectUri === 'http://localhost:3000/auth/callback',
      `redirect_uri=${redirectUri}`
    );
    pass('5. PKCE code_challenge present', !!codeChallenge && codeChallenge.length >= 43, `challenge_len=${codeChallenge?.length}`);
    pass('6. OAuth state parameter present', !!state && state.length >= 16, `state_len=${state?.length}`);
    pass('7. client_id present', !!clientId && clientId.length === 32, `client_id=${clientId}`);
    pass('8. client_secret is NOT exposed in authorize URL or query', !loc.toLowerCase().includes('secret'), 'secret absent');
  }

  // 3. Test Host header dynamics (localhost:3000 vs 127.0.0.1:3000)
  const localhostUrl = BASE.includes('127.0.0.1') ? BASE.replace('127.0.0.1', 'localhost') : BASE;
  const loginLocalhostRes = await fetch(`${localhostUrl}/auth/spotify/login`, {
    redirect: 'manual'
  });
  const locLocalhost = loginLocalhostRes.headers.get('location');
  if (locLocalhost) {
    const u = new URL(locLocalhost);
    pass('9. localhost:3000 dynamically resolves to localhost redirect_uri',
      u.searchParams.get('redirect_uri') === 'http://localhost:3000/auth/callback',
      `redirect_uri=${u.searchParams.get('redirect_uri')}`
    );
  } else {
    pass('9. localhost:3000 dynamically resolves to localhost redirect_uri', false, 'no location header');
  }

  const loopbackUrl = BASE.includes('localhost') ? BASE.replace('localhost', '127.0.0.1') : BASE;
  const login127Res = await fetch(`${loopbackUrl}/auth/spotify/login`, {
    redirect: 'manual'
  });
  const loc127 = login127Res.headers.get('location');
  if (loc127) {
    const u = new URL(loc127);
    pass('10. 127.0.0.1:3000 dynamically resolves to 127.0.0.1 redirect_uri',
      u.searchParams.get('redirect_uri') === 'http://127.0.0.1:3000/auth/callback',
      `redirect_uri=${u.searchParams.get('redirect_uri')}`
    );
  } else {
    pass('10. 127.0.0.1:3000 dynamically resolves to 127.0.0.1 redirect_uri', false, 'no location header');
  }

  // 4. Test CSRF protection on logout
  const csrfFailRes = await fetch(`${BASE}/api/auth/logout`, { method: 'POST' });
  pass('11. /api/auth/logout rejects request without X-Requested-With (CSRF defense)', csrfFailRes.status === 403);

  // 5. Test legitimate logout endpoint
  const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  pass('12. /api/auth/logout responds 200 with X-Requested-With', logoutRes.status === 200);

} catch (err) {
  pass('Spotify OAuth test encountered error', false, String(err));
}

finish();
