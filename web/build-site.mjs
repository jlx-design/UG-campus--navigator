// Builds the whole site: the campus chooser at the root, and one app per campus under /<id>/.
// Usage: node build-site.mjs [outDir]   (default: site/)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('.', import.meta.url).pathname;
const out = process.argv[2] || join(root, 'site');
const order = ['ug', 'knust', 'uhas', 'ucc'];
const ids = readdirSync(join(root, 'campus')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const items = []; const campuses = [];
for (const id of ids) {
  execFileSync(process.execPath, [join(root, 'build.mjs')], { cwd: root, env: { ...process.env, CAMPUS: id }, stdio: ['ignore', 'ignore', 'inherit'] });
  cpSync(join(root, 'dist'), join(out, id), { recursive: true });
  const c = JSON.parse(readFileSync(join(root, 'campus', `${id}.json`), 'utf8'));
  campuses.push(c);
  items.push(`<li><a class="campus" data-id="${esc(id)}" href="./${esc(id)}/" style="--c:${esc(c.brand.accent)}"><img class="mono" src="./${esc(id)}/icons/logo.png" alt="" width="44" height="44"><span><b>${esc(c.short)}</b><span class="name">${esc(c.university)}, ${esc(c.campusName)}</span></span><span class="go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span></a></li>`);
  console.log('built', id);
}

// ── Landing-page map: southern Ghana, equirectangular, stylised coastline (decorative, not for navigation). ──
const COAST = [[-5.2, 5.2], [-4.6, 5.24], [-4.0, 5.25], [-3.5, 5.15], [-3.1, 5.09], [-2.8, 5.0], [-2.5, 4.9], [-2.3, 4.86], [-2.09, 4.74], [-1.75, 4.89], [-1.6, 5.0], [-1.25, 5.1],
  [-0.95, 5.2], [-0.62, 5.35], [-0.35, 5.5], [-0.2, 5.55], [0, 5.62], [0.4, 5.75], [0.63, 5.78], [0.99, 5.91], [1.2, 6.1], [1.4, 6.14], [1.8, 6.25], [2.2, 6.35]];
function renderMap({ lng0, lng1, lat0, lat1, W, H, aspect, cls, tagScale = 1, sea = [-1.0, lat0 + (lat1 - lat0) * 0.06] }) {
  const px = (lng, lat) => [((lng - lng0) / (lng1 - lng0)) * W, ((lat1 - lat) / (lat1 - lat0)) * H].map(n => Math.round(n * 10) / 10);
  const pts = COAST.map(([a, b]) => px(a, b));
  const coast = 'M' + pts.map(p => p.join(' ')).join(' L');
  const land = coast + ` L${pts[pts.length - 1][0]} -40 L${pts[0][0]} -40 Z`;
  // Terrain: contour lines that echo the coastline inland, and swell lines offshore.
  const wob = (k, lng) => Math.sin(lng * 3.1 + k * 1.7) * 0.035 + Math.sin(lng * 7.3 + k) * 0.015;
  let contours = '';
  for (let k = 1; k <= 14; k++) {
    const d = 'M' + COAST.map(([lng, lat]) => px(lng, lat + k * 0.2 + wob(k, lng)).join(' ')).join(' L');
    contours += `<path d="${d}" style="opacity:${(0.9 - k * 0.045).toFixed(2)}"/>`;
  }
  let swell = '';
  for (let k = 1; k <= 4; k++) {
    const d = 'M' + COAST.map(([lng, lat]) => px(lng, lat - k * 0.16 - wob(k + 5, lng) * 0.6).join(' ')).join(' L');
    swell += `<path d="${d}" style="opacity:${(0.85 - k * 0.15).toFixed(2)}"/>`;
  }
  const at = Object.fromEntries(campuses.map(c => [c.id, px(c.center[0], c.center[1])]));
  const order = ['knust', 'ucc', 'ug', 'uhas'].filter(i => at[i]).concat(campuses.map(c => c.id).filter(i => !['knust', 'ucc', 'ug', 'uhas'].includes(i)));
  let route = ''; let len = 0;
  order.forEach((id, i) => {
    const [x, y] = at[id];
    if (i === 0) { route = `M${x} ${y}`; return; }
    const [x0, y0] = at[order[i - 1]]; const mx = (x0 + x) / 2, my = (y0 + y) / 2, dx = x - x0, dy = y - y0;
    const cx = Math.round(mx - dy * 0.25), cy = Math.round(my + dx * 0.25);
    route += ` Q${cx} ${cy} ${x} ${y}`;
    let px0 = x0, py0 = y0; for (let t = 0.02; t <= 1.0001; t += 0.02) { const a = (1 - t) ** 2, b2 = 2 * (1 - t) * t, c2 = t * t; const qx = a * x0 + b2 * cx + c2 * x, qy = a * y0 + b2 * cy + c2 * y; len += Math.hypot(qx - px0, qy - py0); px0 = qx; py0 = qy; }
  });
  len = Math.ceil(len) + 4;
  // Each campus is marked by its own badge, with the name and town underneath.
  const r = 30 * tagScale, fs = 18 * tagScale, fs2 = 12.5 * tagScale;
  const pins = campuses.map(c => {
    const [x, y] = at[c.id]; const ty = y + r + 21 * tagScale;
    return `<a class="pin" data-id="${esc(c.id)}" href="./${esc(c.id)}/" style="--c:${esc(c.brand.accent)}" aria-label="${esc(c.short)}, ${esc(c.university)}, ${esc(c.campusName)}">
        <circle class="halo" cx="${x}" cy="${y}" r="${r + 9 * tagScale}"/>
        <image href="./${esc(c.id)}/icons/logo.png" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>
        <text class="name" x="${x}" y="${ty}" font-size="${fs}">${esc(c.short)}</text><text class="city" x="${x}" y="${ty + 16 * tagScale}" font-size="${fs2}">${esc(c.campusName)}</text></a>`;
  }).join('\n      ');
  const [sx, sy] = px(sea[0], sea[1]);
  const mid = `m-${cls}`;
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${aspect}" role="group" aria-label="Map of southern Ghana with the campuses. Select one to open its app.">
      <defs><mask id="${mid}" maskUnits="userSpaceOnUse"><path class="reveal" d="${route}" style="--len:${len}" stroke="#fff" fill="none" stroke-width="${14 * tagScale}"/></mask></defs>
      <path class="land" d="${land}" aria-hidden="true"/>
      <g class="contours" aria-hidden="true">${contours}</g><g class="swell" aria-hidden="true">${swell}</g>
      <path class="coast" d="${coast}" aria-hidden="true"/>
      <text class="sea-label" x="${sx}" y="${sy}" aria-hidden="true" font-size="${15 * tagScale}">Gulf of Guinea</text>
      <path class="route" d="${route}" mask="url(#${mid})" aria-hidden="true" stroke-width="${4.5 * tagScale}" stroke-dasharray="0 ${11 * tagScale}"/>
      ${pins}
    </svg>`;
}
// Wide screens: the map fills the window, framed so the campuses sit to the right of the glass panel.
const mapWide = renderMap({ lng0: -5.15, lng1: 0.95, lat0: 4.15, lat1: 7.45, W: 1220, H: 660, aspect: 'xMaxYMid slice', cls: 'map-wide', tagScale: 0.78 });
// Phones and tablets: a hero crop around the four campuses.
const mapHero = renderMap({ lng0: -2.3, lng1: 1.1, lat0: 4.25, lat1: 7.3, W: 600, H: 540, aspect: 'xMidYMid slice', cls: 'map-hero', tagScale: 1.1, sea: [0.05, 4.9] });
writeFileSync(join(out, 'index.html'), readFileSync(join(root, 'frontdoor/index.html'), 'utf8').replace('__CAMPUS_LIST__', items.join('\n      ')).replace('__CAMPUS_IDS__', JSON.stringify(ids))
  .replace('__MAP_WIDE__', mapWide).replace('__MAP_HERO__', mapHero));
cpSync(join(root, 'frontdoor/sw.js'), join(out, 'sw.js'));
{ // Overall Campus Navigator logo: landing page badge + website icon.
  const { createRequire } = await import('node:module'); const sharp = createRequire(import.meta.url)('sharp');
  const src = join(root, 'frontdoor/logo.png');
  await sharp(src).resize(224, 224, { kernel: 'lanczos3' }).png().toFile(join(out, 'logo.png'));
  await sharp(src).resize(64, 64, { kernel: 'lanczos3' }).png().toFile(join(out, 'favicon-64.png'));
  const b = await sharp(src).resize(170, 170, { kernel: 'lanczos3' }).toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: '#213551' } }).composite([{ input: b, gravity: 'center' }]).png().toFile(join(out, 'apple-touch-icon.png'));
}
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, '404.html'), '<!doctype html><meta charset="utf-8"><title>Not found</title><script>var p=location.pathname.split("/");location.replace("/"+(p[1]?p[1]+"/":""))</script><a href="/">Choose your campus</a>');
// Restore the default (UG) generated config so local dev builds aren't left pointing at the last campus.
execFileSync(process.execPath, [join(root, 'build.mjs')], { cwd: root, env: { ...process.env, CAMPUS: 'ug' }, stdio: 'ignore' });
console.log('site ->', out);
