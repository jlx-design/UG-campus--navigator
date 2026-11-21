// Smoke test of the built app in headless Chrome (mobile viewport).
// NOTE: this sandbox cannot reach external hosts, so CDN/Data API/tile requests fail here;
// the test checks rendering, routing, error states and absence of JS exceptions.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8765';
const out = process.argv[3] || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
const routes = ['#/explore', '#/navigate', '#/fresher', '#/fresher/checklist', '#/fresher/registration', '#/fresher/halls', '#/updates', '#/assistant', '#/profile', '#/login', '#/register', '#/forgot-password', '#/reset-password?token=x', '#/report', '#/about', '#/admin'];
const results = [];
for (const r of routes) {
  await page.goto(`${base}/${r}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const h1 = await page.locator('h1, .search input, h2').first().textContent().catch(() => null) ?? await page.locator('.search input').first().getAttribute('placeholder').catch(() => null);
  const nav = await page.locator('.bottom-nav a[aria-current="page"]').textContent().catch(() => '');
  results.push(`${r.padEnd(26)} active-tab=${nav?.trim()}  heading=${(h1 || '').trim().slice(0, 40)}`);
  await page.screenshot({ path: `${out}/${r.replace(/[#/?=]/g, '_')}.png` });
}
// Interaction checks
await page.goto(`${base}/#/profile`); await page.waitForTimeout(800);
await page.locator('.seg button', { hasText: 'Dark' }).click();
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
await page.reload(); await page.waitForTimeout(500);
const themeAfterReload = await page.evaluate(() => document.documentElement.dataset.theme);
await page.goto(`${base}/#/assistant`); await page.waitForTimeout(500);
await page.fill('.composer textarea', 'Where is the main library?');
await page.click('.composer button');
await page.waitForTimeout(2500);
const botMsg = await page.locator('.msg.bot').last().textContent();
await page.screenshot({ path: `${out}/assistant_after_send.png` });
console.log(results.join('\n'));
console.log('theme toggle ->', theme, '| after reload ->', themeAfterReload);
console.log('assistant reply when API unreachable ->', botMsg?.slice(0, 120));
console.log('JS errors:', errors.length ? '\n  ' + errors.join('\n  ') : 'none');
await browser.close();
