// Resilience — 9 checks. A failing or unreachable provider must never break the app,
// must never be silently hidden, and must never crash the page.
import { chromium } from 'playwright-core';
import { BASE, CHROMIUM_ARGS, resolveLocalFixture, createReporter } from '../lib/harness.mjs';

const { pass, finish } = createReporter('RESILIENCE', 9);
const browser = await chromium.launch({ args: CHROMIUM_ARGS });

const open = async (p) => {
  await p.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(2500);
};

// Archive/other providers answer at their own pace, and an aborted Audius makes the search
// slower, so wait for the rendered condition instead of sleeping a fixed interval.
const bodyHas = async (p, re, ms = 25000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const body = await p.locator('body').innerText();
    if (re.test(body)) return body;
    await p.waitForTimeout(500);
  }
  return p.locator('body').innerText();
};

// 1. Audius dead -> Archive still serves, and the outage is named
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/discoveryprovider\.audius\.co/, (r) => r.abort());
  const p = await ctx.newPage();
  let crashed = false;
  p.on('pageerror', () => (crashed = true));
  await open(p);
  await p.locator('#nav-search-btn').click();
  await p.locator('#search-input').fill('bluegrass');
  // Give the aborted Audius search time to surface its own failure notice too.
  await p.waitForTimeout(4000);
  const body = await bodyHas(p, /Live & archive/);
  pass('R1. Audius dead -> Archive section still serves', /Live & archive/.test(body));
  pass('R1b. no crash with provider down', !crashed);
  pass('R1c. honest Audius failure note', /unreachable/.test(body));
  await ctx.close();
}

// 2. Archive dead -> the rest of the free catalogue still serves
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/archive\.org/, (r) => r.abort());
  const p = await ctx.newPage();
  let crashed = false;
  p.on('pageerror', () => (crashed = true));
  await open(p);
  await p.locator('#nav-search-btn').click();
  await p.locator('#search-input').fill('synthwave');
  const body = await bodyHas(p, /Free catalogue/);
  pass('R2. Archive dead -> free catalogue still serves', /Free catalogue/.test(body));
  pass('R2b. no crash with provider down', !crashed);
  await ctx.close();
}

// 3. Fully offline -> honest banner, and local files still play
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await open(p);
  await ctx.setOffline(true);
  await p.locator('#nav-library-btn').click();
  await p.waitForTimeout(1000);
  const body = await p.locator('body').innerText();
  pass('R3. offline banner shows', /offline/i.test(body));
  await p.locator('input[type="file"]').setInputFiles(resolveLocalFixture());
  await p.waitForTimeout(3000);
  const icon = await p.evaluate(() => document.querySelector('#mini-player-play-btn')?.textContent.trim() || null);
  pass('R3b. local file plays while offline', icon === 'pause');
  await ctx.setOffline(false);
  await ctx.close();
}

// 4. Subsonic host unreachable -> honest connection failure
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  let crashed = false;
  p.on('pageerror', () => (crashed = true));
  await open(p);
  await p.locator('#header-hifi-btn').click();
  await p.waitForTimeout(800);
  await p.locator('input[aria-label="Server URL"]').fill('http://127.0.0.1:9');
  await p.locator('input[aria-label="Username"]').fill('nobody');
  await p.locator('button:has-text("Connect & test")').click();
  await p.waitForTimeout(4000);
  const body = await p.locator('body').innerText();
  pass('R4. unreachable server -> honest failure', /Not connected/.test(body));
  pass('R4b. no crash on connection failure', !crashed);
  await ctx.close();
}

await browser.close();
finish();
