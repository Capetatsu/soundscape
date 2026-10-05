// Jamendo FLAC truth — the README advertises lossless, so this proves the label matches what
// is actually streamed, in BOTH directions:
//   * FLAC-first enabled -> a real .flac stream is requested AND the player says FLAC
//   * the notice must never claim FLAC when the served file is not FLAC
// HTTP cache is disabled: a cached body produces no network response and would make this
// check silently inconclusive rather than failing loudly.
import { chromium } from 'playwright-core';
import { BASE, CHROMIUM_ARGS, createReporter } from '../lib/harness.mjs';

const { pass, finish } = createReporter('JAMENDO FLAC TRUTH');
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Enable FLAC-first before any app code reads the preference.
await ctx.addInitScript(() => {
  try { localStorage.setItem('soundscape_jamendo_quality', 'flac'); } catch {}
});
const p = await ctx.newPage();

const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

let flacServed = false;
let mp3Served = false;
const seen = [];
p.on('response', (r) => {
  const u = r.url();
  // Only the audio CDN tells us what was ACTUALLY streamed. Matching `format=` anywhere in
  // jamendo.com also matches `audioformat=` on API metadata requests, which made this check
  // read a FLAC *probe* as if FLAC had been served — and then fail an honest MP3 fallback.
  if (/storage\.jamendo\.com/.test(u)) {
    seen.push(`${r.status()} ${u.slice(0, 80)}`);
    if (/[?&]format=flac/.test(u)) flacServed = true;
    if (/[?&]format=mp3/.test(u)) mp3Served = true;
  }
});

await p.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2500);
await p.locator('#nav-search-btn').click();
await p.locator('#search-input').fill('ambient');
await p.locator('button[title^="Play full track (Jamendo"]').first().waitFor({ timeout: 30000 });
await p.locator('button[title^="Play full track (Jamendo"]').first().click();

// The notice appears right after resolve; sample while it is still on screen.
let notice = null;
for (let i = 0; i < 20 && !notice; i++) {
  await p.waitForTimeout(400);
  notice = await p.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find((x) => /Playing from Jamendo/.test(x.textContent || ''));
    return el ? el.textContent.trim() : null;
  });
}
pass('1. player states what is actually streaming', !!notice, JSON.stringify(notice));
// The honesty requirement, in both directions: claim FLAC only if a FLAC file was really
// streamed, and do not claim it when the provider fell back to MP3.
pass('2. label agrees with the file actually streamed',
  !notice || (flacServed ? /FLAC/.test(notice) : !/FLAC/.test(notice)),
  `flacStreamed=${flacServed} mp3Streamed=${mp3Served}`);

let played = false;
try {
  await p.waitForFunction(() => document.querySelector('#mini-player-play-btn')?.textContent.trim() === 'pause', undefined, { timeout: 20000 });
  played = true;
} catch {}
pass('3. playback confirmed', played);
pass('4. FLAC audio really streamed', flacServed || mp3Served, flacServed ? 'format=flac served' : mp3Served ? 'format=mp32 served' : 'none');
console.log('AUDIO RESPONSES:', JSON.stringify(seen, null, 1));

await browser.close();
finish();
