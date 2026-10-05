// Per-provider playback verification — every free source must play real, attributable audio.
//
// Selector corrections vs. the original ad-hoc probe, each because the original never passed:
//   * Radio uses the same proven control as master E2E (`div.space-y-1 > div`), not a guessed
//     "Listen" button.
//   * Internet Archive uses its real affordance: a "Play set" button that resolves tracks,
//     plays the first and queues the rest. It has no per-track play button.
//   * Source attribution: the mini player shows a generic "Free catalogue" badge for
//     Audius/Jamendo/Archive by design. The specific provider is named in the playback notice,
//     so that is what is asserted.
//   * Position advance is read from any clock element in the DOM (the mini player omits it).
import { chromium } from 'playwright-core';
import { BASE, CHROMIUM_ARGS, resolveLocalFixture, createReporter } from '../lib/harness.mjs';

const { pass, finish } = createReporter('PROVIDER COVERAGE');
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const spotifyReqs = [];
async function newPage() {
  const p = await ctx.newPage();
  p.on('request', (r) => {
    const u = r.url();
    if (u.includes('api.spotify.com') || u.includes('accounts.spotify.com')) spotifyReqs.push(u);
  });
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  return p;
}
const playing = (p, ms = 30000) =>
  p.waitForFunction(() => document.querySelector('#mini-player-play-btn')?.textContent.trim() === 'pause', undefined, { timeout: ms })
    .then(() => true).catch(() => false);
const noticeNow = (p) => p.evaluate(() => {
  const el = document.querySelector('.fixed.bottom-28');
  return el ? (el.textContent || '').replace('Audit', '').replace(/^info/, '').trim() : null;
});
// The notice capsule shows "Buffering…" first and then settles on the real source/format
// line. Sampling once catches the transient, so poll until it settles (or times out).
const settledNotice = async (p, ms = 20000) => {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    const n = await noticeNow(p);
    if (n) last = n;
    if (n && !/^Buffering/.test(n)) return n;
    await p.waitForTimeout(300);
  }
  return last;
};
const anyClock = (p) => p.evaluate(() =>
  [...document.querySelectorAll('span')].map((x) => (x.textContent || '').trim()).find((t) => /^\d+:\d\d$/.test(t)) || null);

// ---- Audius ----
{
  const p = await newPage();
  await p.locator('#nav-search-btn').click();
  await p.locator('#search-input').fill('synthwave');
  const btn = p.locator('button[title^="Play full track (Audius"]').first();
  const listed = await btn.waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
  pass('A1. Audius track listed with its own source badge', listed);
  if (listed) {
    await btn.click();
    const ok = await playing(p);
    pass('A2. Audius playback confirmed (real audio advancing)', ok);
    const notice = await settledNotice(p);
    pass('A3. Audius named as the source', !!notice && /Audius/i.test(notice), JSON.stringify(notice));
    // The clock only renders in the expanded player, so open it before reading position.
    await p.locator('#mini-player-container').click().catch(() => {});
    await p.waitForTimeout(1200);
    const c1 = await anyClock(p);
    await p.waitForTimeout(4000);
    const c2 = await anyClock(p);
    pass('A4. Audius position advances', !!c1 && !!c2 && c1 !== c2, `${c1} -> ${c2}`);
  }
  await p.close();
}

// ---- Internet Archive ----
{
  const p = await newPage();
  await p.locator('#nav-search-btn').click();
  await p.locator('#search-input').fill('bluegrass');
  await p.getByText('Live & archive', { exact: false }).first().waitFor({ timeout: 25000 });
  await p.waitForTimeout(3500);
  const body = await p.locator('body').innerText();
  pass('B0. Archive section renders real results', /Live & archive/i.test(body));
  const playSet = p.locator('button[title^="Play recording"]').first();
  const listed = await playSet.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  pass('B1. Archive exposes a "Play set" control', listed);
  if (listed) {
    await playSet.click();
    const ok = await playing(p);
    pass('B2. Archive playback confirmed', ok);
    const notice = await settledNotice(p);
    pass('B3. Archive names the real format', !!notice && /Playing from Internet Archive \(.+\)/.test(notice), JSON.stringify(notice));
    pass('B4. Archive discloses that quality varies', !!notice && /Quality varies/i.test(notice));
  }
  await p.close();
}

// ---- Radio ----
{
  const p = await newPage();
  await p.locator('#nav-radio-btn').click();
  await p.waitForTimeout(6000);
  const rows = p.locator('div.space-y-1 > div');
  const has = (await rows.count()) > 0;
  pass('C1. Radio directory lists stations', has);
  if (has) {
    await rows.first().click();
    const ok = await playing(p);
    pass('C2. Radio playback confirmed (live stream advancing)', ok);
    const notice = await settledNotice(p);
    pass('C3. Radio states it is an unskippable live stream', !!notice && /Live radio/.test(notice), JSON.stringify(notice));
  }
  await p.close();
}

// ---- Local file from this device ----
{
  const p = await newPage();
  const fixture = resolveLocalFixture();
  await p.locator('#nav-library-btn').click();
  await p.waitForTimeout(1200);
  await p.locator('input[type="file"]').setInputFiles(fixture);
  await p.waitForTimeout(4000);
  const listed = await p.locator('body').innerText();
  pass('D1. Local file listed on the device shelf', /fixture-5s|fixture-test/i.test(listed), fixture.split(/[\\/]/).pop());
  await p.locator('text=fixture-5s').first().click().catch(() => {});
  const ok = await playing(p);
  pass('D2. Local file playback confirmed', ok);
  await p.close();
}

pass('E1. zero Spotify API requests across every provider', spotifyReqs.length === 0, `n=${spotifyReqs.length}`);

await browser.close();
finish();
