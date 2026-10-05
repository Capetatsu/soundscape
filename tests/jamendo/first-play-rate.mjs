// Jamendo first-play reliability.
//
// Jamendo's free tier intermittently answers an identical query with HTTP 200 and zero
// results (measured ~50%). A single sample therefore proves nothing, so this repeats the
// whole flow N times in fresh pages and requires every attempt to reach confirmed playback.
//
// Usage: node tests/jamendo/first-play-rate.mjs [attempts] [query]
import { chromium } from 'playwright-core';
import { BASE, CHROMIUM_ARGS, createReporter } from '../lib/harness.mjs';

const N = Number(process.argv[2] || 6);
const QUERY = process.argv[3] || 'synthwave';

const { pass, finish } = createReporter(`JAMENDO FIRST-PLAY (${N}x "${QUERY}")`, N);
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

for (let i = 1; i <= N; i++) {
  const p = await ctx.newPage();
  let jamCalls = 0;
  p.on('request', (r) => { if (r.url().includes('api.jamendo.com')) jamCalls++; });
  try {
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(2000);
    await p.locator('#nav-search-btn').click();
    await p.locator('#search-input').fill(QUERY);
    const jam = p.locator('button[title^="Play full track (Jamendo"]').first();
    await jam.waitFor({ timeout: 25000 });
    await jam.click();
    let played = false;
    try {
      await p.waitForFunction(() => document.querySelector('#mini-player-play-btn')?.textContent.trim() === 'pause', undefined, { timeout: 25000 });
      played = true;
    } catch {}
    pass(`attempt ${i}: confirmed playback`, played, `jamApiCalls=${jamCalls}`);
  } catch (e) {
    pass(`attempt ${i}: confirmed playback`, false, String(e).slice(0, 90).replace(/\s+/g, ' '));
  }
  await p.close();
}

await browser.close();
finish();
