// Internet Archive honesty check — proves the app discloses what it is actually playing
// rather than implying studio quality. HTTP cache is disabled so a cached body cannot make
// the stream check silently inconclusive.
import { chromium } from 'playwright-core';
import { BASE, CHROMIUM_ARGS, createReporter } from '../lib/harness.mjs';

const { pass, finish } = createReporter('ARCHIVE HONESTY');
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

const audio = [];
p.on('response', (r) => {
  const ct = (r.headers()['content-type'] || '').split(';')[0];
  if (/audio|mpeg|mp3|ogg|mp4|flac/.test(ct)) audio.push(`${r.status()} ${ct}`);
});

await p.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2500);
await p.locator('#nav-search-btn').click();
await p.locator('#search-input').fill('bluegrass');
await p.getByText('Live & archive', { exact: false }).first().waitFor({ timeout: 25000 });
await p.waitForTimeout(3500);
await p.locator('button[title^="Play recording"]').first().click();

// Sample the notice repeatedly from the moment of the click; capture every distinct text.
const seen = new Set();
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(300);
  const n = await p.evaluate(() => {
    const el = document.querySelector('.fixed.bottom-28');
    return el ? (el.textContent || '').replace('Audit', '').trim() : null;
  });
  if (n) seen.add(n);
  if (seen.size >= 2 && i > 12) break;
}
const all = [...seen];
const archiveNotice = all.find((t) => /Internet Archive/i.test(t));
pass('1. Archive source named to the user', !!archiveNotice, JSON.stringify(archiveNotice));
pass('2. real served format named, not a generic claim', !!archiveNotice && /\(.+\)/.test(archiveNotice));
pass('3. honest quality caveat shown', !!archiveNotice && /Quality varies/i.test(archiveNotice));
pass('4. audio stream really fetched (cache disabled)', audio.length > 0, `n=${audio.length}`);
console.log('NOTICES:', JSON.stringify(all));
console.log('AUDIO:', JSON.stringify(audio.slice(0, 4)));

await browser.close();
finish();
