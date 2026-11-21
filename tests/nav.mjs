// Turn-by-turn UI test with stubbed network (TEST FIXTURES ONLY — never shipped).
// The sandbox can't reach Neon/CDNs, so the Data API and /route responses are faked here to drive the UI.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8765';
const out = process.argv[3] || '/tmp/shots';
const DEST = { id: '00000000-0000-0000-0000-000000000001', name: 'Test Destination', category: 'library', description: null, lat: 5.6520, lng: -0.1860,
  location_context: null, alt_names: [], accessibility: null, source_label: 'Test fixture', source_url: null, verification: 'unverified', last_verified_at: null, is_published: true, updated_at: '2026-01-01' };
// A simple L-shaped path: north 200 m, then east ~110 m.
const coords = [[5.6500, -0.1870], [5.6509, -0.1870], [5.6518, -0.1870], [5.6518, -0.1865], [5.6520, -0.1860]];
const ROUTE = { provider: 'test', profile: 'foot-walking', distance_m: 330, duration_s: 240, coordinates: coords, attribution: 'test',
  steps: [
    { instruction: 'Head north on Test Road', name: 'Test Road', distance_m: 200, duration_s: 144, type: 11, way_points: [0, 2] },
    { instruction: 'Turn right onto Library Walk', name: 'Library Walk', distance_m: 130, duration_s: 96, type: 1, way_points: [2, 4] },
    { instruction: 'Arrive at Test Destination', name: '', distance_m: 0, duration_s: 0, type: 10, way_points: [4, 4] } ] };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
async function setup(ctx) {
  await ctx.route(/apirest/, r => r.fulfill({ json: [] })); // registered first = lowest priority
  await ctx.route(/apirest.*\/locations/, r => r.fulfill({ json: [DEST] }));
  await ctx.route(/apirest.*location_categories/, r => r.fulfill({ json: [{ slug: 'library', label: 'Libraries', icon: 'book', sort_order: 1 }] }));
  await ctx.route(/apirest.*search_locations/, r => r.fulfill({ json: [DEST] }));
  await ctx.route(/anonymous-token/, r => r.fulfill({ json: { token: 'x.eyJleHAiOjk5OTk5OTk5OTl9.x' } }));
  await ctx.route(/\/route$/, r => r.fulfill({ json: ROUTE }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => console.log('PAGE CRASHED')); page.on('console', m => { if (m.type() === 'error' && !/Failed to load|ERR_|net::/.test(m.text())) console.log('console:', m.text().slice(0, 300)); });
  return page;
}
// 1) No permission yet → app must ask first.
let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let page = await setup(ctx);
await page.goto(`${base}/#/map`); await page.waitForTimeout(1500);
await page.evaluate(id => { location.hash = '#/navigate'; }, DEST.id);
await page.evaluate(() => {}); await page.waitForTimeout(300);
// choose destination through search box
await page.fill('.search input', 'Test'); await page.waitForTimeout(1200);
await page.locator('.result').first().click(); await page.waitForTimeout(800);
const asked = await page.locator('#loc-ask-t').textContent().catch(() => null);
await page.screenshot({ path: `${out}/nav_1_ask.png` });
console.log('1. consent dialog ->', asked);
await ctx.close();

// 2) Permission granted → route preview → start → walk along the route.
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 5.6500, longitude: -0.1870, accuracy: 8 } });
page = await setup(ctx);
await page.goto(`${base}/#/navigate`); await page.waitForTimeout(1500);
await page.fill('.search input', 'Test'); await page.waitForTimeout(1200);
await page.locator('.result').first().click(); await page.waitForTimeout(2000);
console.log('2. preview ->', (await page.locator('.sheet').textContent())?.slice(0, 80));
await page.screenshot({ path: `${out}/nav_2_preview.png` });
await page.click('.start-btn'); await page.waitForTimeout(1200);
const read = async () => ((await page.locator('.hud').textContent()) || '').replace(/\s+/g, ' ');
console.log('3. start ->', await read(), '| then:', await page.locator('.hud-then').count());
await page.screenshot({ path: `${out}/nav_3_start.png` });
await ctx.setGeolocation({ latitude: 5.65155, longitude: -0.1870, accuracy: 8 }); await page.waitForTimeout(1500);
console.log('4. 30 m before turn ->', await read());
await page.screenshot({ path: `${out}/nav_4_near.png` });
await ctx.setGeolocation({ latitude: 5.6518, longitude: -0.18665, accuracy: 8 }); await page.waitForTimeout(1500);
console.log('5. after turn ->', await read(), '| eta:', (await page.locator('.eta').textContent())?.replace(/\s+/g, ' '));
await page.click('[aria-label="All steps"]'); await page.waitForTimeout(400);
console.log('   current step ->', await page.locator('.steps li.current').textContent());
await page.screenshot({ path: `${out}/nav_5_steps.png` });
await page.click('[aria-label="All steps"]');
const reqs = []; page.on('request', r => { if (/\/route$/.test(r.url())) reqs.push(1); });
const txt = async sel => (await page.locator(sel).count()) ? await page.locator(sel).first().textContent() : '-';
for (const d of [0, 0.00002, 0.00004, 0.00006]) { await ctx.setGeolocation({ latitude: 5.6514 + d, longitude: -0.1850, accuracy: 8 }); await page.waitForTimeout(700); }
console.log('6. walked off route -> reroute requests:', reqs.length, '| toast:', await txt('.toast'));
await ctx.setGeolocation({ latitude: 5.65199, longitude: -0.18601, accuracy: 8 }); await page.waitForTimeout(1500);
console.log('7. at destination ->', await read());
await page.screenshot({ path: `${out}/nav_7_arrived.png` });
console.log('JS errors:', errors.length ? errors : 'none');
await browser.close();
