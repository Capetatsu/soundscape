// Verification test for Spotify OAuth redirect URI resolution, PKCE flow, and session safety.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, REPO_ROOT, createReporter } from '../lib/harness.mjs';

const { pass, finish } = createReporter('SPOTIFY OAUTH & REDIRECT URI');

/**
 * Read the built client bundle so the "single login path" claims are asserted against the
 * code that actually ships, not against the source tree. Returns '' when there is no build,
 * which makes those checks fail loudly rather than silently pass.
 */
function readBuiltClient() {
  const assetsDir = join(REPO_ROOT, 'dist', 'assets');
  let files;
  try {
    files = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  } catch {
    return '';
  }
  return files.map((f) => readFileSync(join(assetsDir, f), 'utf8')).join('\n');
}

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
      redirectUri === 'http://127.0.0.1:3000/auth/spotify/callback' || redirectUri === 'http://localhost:3000/auth/spotify/callback',
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
      u.searchParams.get('redirect_uri') === 'http://localhost:3000/auth/spotify/callback',
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
      u.searchParams.get('redirect_uri') === 'http://127.0.0.1:3000/auth/spotify/callback',
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

  // ---------- Failure handling: every failure returns to the app, never a dead end ----------

  // Denied / cancelled authorization.
  const deniedRes = await fetch(`${BASE}/auth/spotify/callback?error=access_denied`, { redirect: 'manual' });
  pass('13. denied authorization redirects back to the app',
    deniedRes.status === 302 && (deniedRes.headers.get('location') || '').startsWith('/?auth_error='),
    `status=${deniedRes.status} location=${deniedRes.headers.get('location')}`);

  // Missing code/state must not render a bare error page.
  const missingRes = await fetch(`${BASE}/auth/spotify/callback`, { redirect: 'manual' });
  pass('14. callback without code/state redirects with an error code',
    missingRes.status === 302 && (missingRes.headers.get('location') || '').includes('auth_error=missing_params'),
    `status=${missingRes.status} location=${missingRes.headers.get('location')}`);

  // Unverifiable state (tampered/expired/unknown) is rejected, never exchanged.
  const badStateRes = await fetch(`${BASE}/auth/spotify/callback?code=fake_code&state=not_a_real_state`, {
    redirect: 'manual'
  });
  pass('15. callback rejects an unknown state and returns to the app',
    badStateRes.status === 302 && (badStateRes.headers.get('location') || '').includes('auth_error=invalid_state'),
    `status=${badStateRes.status} location=${badStateRes.headers.get('location')}`);

  // A forged callback must not have created a session.
  const statusAfterForge = await fetch(`${BASE}/api/auth/status`).then((r) => r.json());
  pass('16. a rejected callback creates no session',
    statusAfterForge.state === 'none',
    JSON.stringify(statusAfterForge));

  // The retired popup callback must forward into the canonical BFF login instead of
  // rendering the "Spotify Authorized" spinner that used to hang forever.
  const legacyRes = await fetch(`${BASE}/auth/callback?code=abc&state=xyz`, { redirect: 'manual' });
  pass('17. legacy /auth/callback redirects into the BFF login',
    legacyRes.status === 302 && legacyRes.headers.get('location') === '/auth/spotify/login',
    `status=${legacyRes.status} location=${legacyRes.headers.get('location')}`);

  // The same holds for the trailing-slash variant.
  const legacySlashRes = await fetch(`${BASE}/auth/callback/`, { redirect: 'manual' });
  pass('18. legacy /auth/callback/ redirects into the BFF login',
    legacySlashRes.status === 302 && legacySlashRes.headers.get('location') === '/auth/spotify/login',
    `status=${legacySlashRes.status} location=${legacySlashRes.headers.get('location')}`);

  // ---------- The shipped client must contain exactly ONE login path ----------

  const builtClient = readBuiltClient();
  pass('19. shipped client contains no window.opener popup handshake',
    !/window\.opener/.test(builtClient),
    builtClient ? 'scanned built bundle' : 'bundle not found');
  pass('20. shipped client contains no SPOTIFY_AUTH_CODE postMessage channel',
    !/SPOTIFY_AUTH_CODE/.test(builtClient));
  pass('21. shipped client navigates to the BFF login endpoint',
    /auth\/spotify\/login/.test(builtClient));
  pass('22. shipped client has no client-side authorization_code exchange',
    !/authorization_code/.test(builtClient));
  // Persistence is what matters: the legacy key names may still appear in a scrub list that
  // clears them, but nothing may ever WRITE a Spotify credential to web storage.
  pass('23. shipped client never writes a refresh token to storage',
    !/setItem\(\s*["'`]spotify_refresh_token["'`]/.test(builtClient));
  pass('24. shipped client never writes an access token to storage',
    !/setItem\(\s*["'`]spotify_access_token["'`]/.test(builtClient));
  pass('25. shipped client never writes a PKCE verifier to storage',
    !/setItem\(\s*["'`]spotify_pkce_verifier["'`]/.test(builtClient));
  pass('26. shipped client never writes a client secret to storage',
    !/setItem\(\s*["'`]spotify_client_secret["'`]/.test(builtClient));

  // ---------- The requested scopes must be enough to identify the user ----------

  // Regression guard: GET /me returns 403 without user-read-private / user-read-email. A token
  // missing them still exchanges cleanly, but `user` is populated from /me, so the app would
  // sit at "Disconnected" forever while holding a perfectly valid session. Assert the authorize
  // request actually asks for them.
  const authUrlForScopes = new URL((await fetch(`${BASE}/auth/spotify/login`, { redirect: 'manual' })).headers.get('location'));
  const scopes = authUrlForScopes.searchParams.get('scope') || '';
  const granted = new Set(scopes.split(/\s+/).filter(Boolean));
  pass('27. authorize request includes user-read-private (GET /me returns 403 without it)',
    granted.has('user-read-private'),
    `scopes=${[...granted].join(' ')}`);
  pass('28. authorize request includes user-read-email (GET /me returns 403 without it)',
    granted.has('user-read-email'));
  pass('29. authorize request keeps library + playlist scopes',
    granted.has('user-library-read') && granted.has('playlist-read-private'));
  pass('30. authorize request keeps playback scopes',
    granted.has('streaming') && granted.has('user-read-playback-state'));

  // A loopback session cookie must NOT be marked Secure over plain HTTP, or browsers drop it
  // and the connection silently never establishes.
  const cookieProbe = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST', redirect: 'manual', headers: { 'X-Requested-With': 'Soundscape' }
  });
  const cleared = cookieProbe.headers.get('set-cookie') || '';
  pass('31. session cookie is not marked Secure on a plain-HTTP origin',
    !/;\s*Secure/i.test(cleared),
    `set-cookie=${cleared}`);

} catch (err) {
  pass('Spotify OAuth test encountered error', false, String(err));
}

finish();
