// MASTER E2E — 30 checks against a running production build, fresh profile,
// Spotify never connected.
import { chromium } from 'playwright-core';
import { BASE, CHROMIUM_ARGS, shotPath, resolveLocalFixture, isAppError, createReporter, jamendoKeyLeakRegex } from '../lib/harness.mjs';

const { pass, finish } = createReporter('MASTER E2E', 32);

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const spotifyRequests = [];
const consoleErrors = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('api.spotify.com') || u.includes('accounts.spotify.com')) spotifyRequests.push(u);
});
page.on('console', (m) => {
  if (m.type() === 'error' && isAppError(m.text())) consoleErrors.push(m.text().slice(0, 160));
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 160)));

const miniIcon = () => page.evaluate(() => document.querySelector('#mini-player-play-btn')?.textContent.trim() || null);
const miniTitle = () => page.evaluate(() => document.querySelector('#mini-player-container')?.textContent.slice(0, 80) || null);
const clock = () => page.evaluate(() => {
  const s = [...document.querySelectorAll('span')].map((x) => x.textContent.trim());
  return s.find((t) => /^\d+:\d\d$/.test(t)) || null;
});
const toSec = (t) => { if (!t) return -1; const [m, s] = t.split(':').map(Number); return m * 60 + s; };

// Wait for CONFIRMED playback instead of sleeping a guessed interval. Jamendo resolves the
// best available file before audio starts, so a fixed sleep is not a contract.
const waitForPlaying = async (timeout = 30000) => {
  try {
    await page.waitForFunction(() => {
      const b = document.querySelector('#mini-player-play-btn');
      return !!b && b.textContent.trim() === 'pause';
    }, undefined, { timeout });
    return true;
  } catch { return false; }
};

// 1. Load
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500);
await page.evaluate(() => document.fonts?.ready.catch(() => {}));
await page.waitForTimeout(500);
pass('1. app loads (production build)', (await page.locator('#nav-home-btn').count()) > 0);
pass('1b. no console errors on load', consoleErrors.filter((e) => !/sdk\.scdn|402|404/.test(e)).length === 0,
  consoleErrors.slice(0, 3).join(' || '));

// 2. Search + play full track
await page.locator('#nav-search-btn').click();
await page.locator('#search-input').fill('synthwave');
await page.getByText('Free catalogue', { exact: false }).first().waitFor({ timeout: 20000 });
pass('2. free catalogue results render', true);
const firstRowTitle = await page.locator('button[title^="Play full track"]').first().getAttribute('title');
await page.locator('button[title^="Play full track"]').first().click();
const playing = await waitForPlaying(30000);
pass('3. full-length track plays', playing, `${firstRowTitle} | ${(await miniTitle()) || ''}`);

// 3. Seek (trusted drag — synthetic events give false failures on media controls)
// Wait for the expanded player to actually render before locating the scrubber. Previously a
// fixed 900 ms sleep was followed by `if (box) {...}`, so if the modal was slow the drag was
// silently skipped and the check then failed as "seek did not work" — a misleading result.
// A missing scrubber is now reported as its own setup failure.
await page.locator('#mini-player-container').click();
let scrubber = page.locator('input[type="range"]').first();
const scrubberReady = await scrubber.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
const box = scrubberReady ? await scrubber.boundingBox() : null;
pass('4a. full player timeline scrubber present', !!box);
if (box) {
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(2500);
}
const seeked = toSec(await clock());
pass('4. seek works (trusted drag)', seeked > 5, `clock=${seeked}s`);

// 4. Volume + mute
await page.locator('#fullplayer-volume').fill('0.4');
await page.waitForTimeout(500);
await page.locator('#fullplayer-mute-btn').click();
await page.waitForTimeout(600);
const mutedLabel = await page.locator('#fullplayer-mute-btn').textContent();
pass('5. volume + mute work', /volume_off/.test(mutedLabel || ''), mutedLabel || '');
await page.locator('#fullplayer-mute-btn').click();

// 5. Queue from search + queue drawer + Escape
await page.locator('#fullplayer-dismiss-btn').click();
await page.waitForTimeout(400);
await page.locator('button[title="Add to queue"]').first().click();
await page.waitForTimeout(600);
await page.locator('#mini-player-container').click();
await page.waitForTimeout(700);
await page.locator('#fullplayer-queue-btn').click();
await page.waitForTimeout(800);
const queueBody = await page.locator('body').innerText();
pass('6. queue drawer lists tracks', /Play Queue/.test(queueBody));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
pass('6b. queue closes with Escape', !(await page.locator('#queue-close-btn').count()));

// 6. Next / previous
await page.locator('#fullplayer-next-btn').click();
await page.waitForTimeout(6000);
pass('7. next plays queued track', (await miniIcon()) === 'pause', (await miniTitle()) || '');
await page.locator('#fullplayer-prev-btn').click();
await page.waitForTimeout(5000);
pass('7b. previous works', (await miniIcon()) === 'pause');

// 7. Playlists (add + create + open)
await page.locator('#fullplayer-dismiss-btn').click();
await page.waitForTimeout(400);
await page.locator('button[title="Add to a Soundscape playlist"]').first().click();
await page.waitForTimeout(900);
await page.locator('input[aria-label="New playlist name"]').fill('E2E Mix');
await page.locator('button:has-text("Create")').click();
await page.waitForTimeout(1200);
const pickerText = await page.locator('body').innerText();
pass('8. playlist created + track added', /Added to/.test(pickerText));
await page.locator('button[aria-label="Close playlist picker"]').click();
await page.locator('#nav-library-btn').click();
await page.waitForTimeout(1200);
const libText = await page.locator('body').innerText();
pass('9. playlist appears in Library', /E2E Mix/.test(libText));
await page.locator('text=E2E Mix').first().click();
await page.waitForTimeout(1200);
const plText = await page.locator('body').innerText();
pass('9b. playlist opens with Play all', /Play all \(1\)/.test(plText));
await page.locator('button:has-text("Queue all")').click();
await page.waitForTimeout(500);
await page.locator('button:has-text("← Library")').click();
await page.waitForTimeout(800);

// 8. Lyrics
await page.locator('#mini-player-container').click();
await page.waitForTimeout(700);
await page.locator('#fullplayer-lyrics-card').click();
await page.waitForTimeout(5000);
const lyrics = await page.locator('body').innerText();
pass('10. lyrics shows an honest state', /No lyrics for this track|Lyrics lookup failed|Looking up lyrics/.test(lyrics));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('#fullplayer-dismiss-btn').click();

// 9. Radio
await page.locator('#nav-radio-btn').click();
await page.waitForTimeout(6000);
const rows = page.locator('div.space-y-1 > div');
if ((await rows.count()) > 0) {
  await rows.first().click();
  await page.waitForTimeout(8000);
  pass('11. radio station plays', (await miniIcon()) === 'pause', (await miniTitle()) || '');
} else pass('11. radio station plays', false, 'no stations');
await page.locator('#mini-player-play-btn').click();

// 10. Local lossless file from this device.
// The committed fixture-test.flac is genuine lossless FLAC (see fixtures/make-flac-fixture.mjs),
// so this exercises the FLAC decode path on a fresh clone rather than only PCM.
const fixture = resolveLocalFixture();
pass('12a. lossless FLAC fixture in use', /fixture-test\.flac$/i.test(fixture), fixture.split(/[\\/]/).pop());
await page.locator('#nav-library-btn').click();
await page.waitForTimeout(800);
await page.locator('input[type="file"]').setInputFiles(fixture);
// Wait for confirmed playback rather than a fixed sleep: the upload auto-plays, and the
// contract under test is "real audio advancing", not "N seconds elapsed".
pass('12. local FLAC plays', await waitForPlaying(25000), `${fixture.split(/[\\/]/).pop()} | ${(await miniTitle()) || ''}`);
await page.locator('#mini-player-play-btn').click();

// 11. Stats after real playback
await page.locator('#nav-stats-btn').click();
await page.waitForTimeout(1500);
const stats = await page.locator('body').innerText();
pass('13. stats reflect real playback', !/No listening history yet/.test(stats));
await page.screenshot({ path: shotPath('master-stats.png') });

// 12. Settings: EQ + Jamendo honest state + Subsonic
await page.locator('#header-hifi-btn').click();
await page.waitForTimeout(900);
const settingsText = await page.locator('body').innerText();
// Jamendo is configured via VITE_JAMENDO_CLIENT_ID, so the honest state is "live and
// configured" — never the disabled copy, and never the key itself.
pass('14. Jamendo live: configured, not the disabled state',
  /Jamendo free catalogue/i.test(settingsText) && !/not configured/i.test(settingsText));
pass('14a. Jamendo client id never rendered', !jamendoKeyLeakRegex().test(settingsText));
pass('14b. Subsonic server section present', /Your music server/.test(settingsText));
const bass = page.locator('input[aria-label*="Bass"]');
await bass.first().focus();
await page.keyboard.press('End');
await page.waitForTimeout(400);
pass('15. EQ persists', (await page.evaluate(() => localStorage.getItem('soundscape_eq'))) !== null);
await page.screenshot({ path: shotPath('master-settings.png') });

// 13. Diagnostics provider matrix
await page.locator('#header-diagnostics-btn').click();
await page.waitForTimeout(1500);
const diag = await page.locator('body').innerText();
pass('16. diagnostics shows provider caps matrix', /Provider capabilities/.test(diag) && /audius/.test(diag) && /jamendo/.test(diag));
pass('16b. diagnostics reports jamendo enabled with caps', !/off — needs key/i.test(diag) && /jamendo/i.test(diag));
await page.screenshot({ path: shotPath('master-diagnostics.png') });
await page.keyboard.press('Escape');

// 14. Responsive
for (const vp of [{ w: 390, h: 844, tag: 'mobile' }, { w: 768, h: 1024, tag: 'tablet' }, { w: 1024, h: 768, tag: 'laptop' }]) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.locator('#nav-home-btn').click();
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  pass(`17. ${vp.tag} (${vp.w}px): no horizontal overflow`, overflow <= 1, `overflow=${overflow}px`);
  await page.screenshot({ path: shotPath(`master-${vp.tag}.png`) });
}

// 15. Spotify isolation + no fake data
pass('18. ZERO Spotify API requests in entire session', spotifyRequests.length === 0, spotifyRequests.slice(0, 2).join(' | '));
const fake = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    preview: /30s Preview|preview_url|OFFICIAL PREVIEW/i.test(t),
    fakeLatency: /Latency ~|100% Synchronized/i.test(t),
    fakeTracks: /Fred again\.?\.?|Mazzy Star|Bicep/.test(t)
  };
});
pass('19. no preview UI anywhere', !fake.preview);
pass('19b. no fake sync claims', !fake.fakeLatency);
pass('19c. no fake AI/demo tracks rendered', !fake.fakeTracks);

await ctx.close();
await browser.close();
finish();
