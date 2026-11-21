// Builds the whole site: the campus chooser at the root, and one app per campus under /<id>/.
// Usage: node build-site.mjs [outDir]   (default: site/)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('.', import.meta.url).pathname;
const out = process.argv[2] || join(root, 'site');
const order = ['ug', 'knust', 'ucc'];
const ids = readdirSync(join(root, 'campus')).map(f => f.replace(/\.json$/, '')).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const items = [];
for (const id of ids) {
  execFileSync(process.execPath, [join(root, 'build.mjs')], { cwd: root, env: { ...process.env, CAMPUS: id }, stdio: ['ignore', 'ignore', 'inherit'] });
  cpSync(join(root, 'dist'), join(out, id), { recursive: true });
  const c = JSON.parse(readFileSync(join(root, 'campus', `${id}.json`), 'utf8'));
  items.push(`<li><a class="campus" data-id="${esc(id)}" href="./${esc(id)}/" style="--c:${esc(c.brand.navy)}"><span class="mark"><img src="./${esc(id)}/icons/icon-192.png" alt="" width="52" height="52"></span><span class="txt"><b>${esc(c.short)}</b><span>${esc(c.university)} · ${esc(c.campusName)}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`);
  console.log('built', id);
}
writeFileSync(join(out, 'index.html'), readFileSync(join(root, 'frontdoor/index.html'), 'utf8').replace('__CAMPUS_LIST__', items.join('\n    ')).replace('__CAMPUS_IDS__', JSON.stringify(ids)));
cpSync(join(root, 'frontdoor/sw.js'), join(out, 'sw.js'));
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, '404.html'), '<!doctype html><meta charset="utf-8"><title>Not found</title><script>var p=location.pathname.split("/");location.replace("/"+(p[1]?p[1]+"/":""))</script><a href="/">Choose your campus</a>');
// Restore the default (UG) generated config so local dev builds aren't left pointing at the last campus.
execFileSync(process.execPath, [join(root, 'build.mjs')], { cwd: root, env: { ...process.env, CAMPUS: 'ug' }, stdio: 'ignore' });
console.log('site ->', out);
