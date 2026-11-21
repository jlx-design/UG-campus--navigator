// Build: esbuild bundles src/ → dist/ (code-split ESM), copies public/, stamps the SW version,
// and renders PWA icons with sharp. Usage: node build.mjs   (UGNAV_* env vars override public config)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = new URL('.', import.meta.url).pathname;
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'icons'), { recursive: true });

const cfg = {};
for (const k of ['DATA_API_URL', 'AUTH_URL', 'API_URL', 'TILE_URL', 'TILE_ATTRIBUTION']) if (process.env[`UGNAV_${k}`]) cfg[k] = process.env[`UGNAV_${k}`];

const result = await build({
  entryPoints: { app: join(root, 'src/main.tsx') },
  bundle: true, splitting: true, format: 'esm', outdir: dist, minify: true, sourcemap: false, target: ['es2020', 'safari15'],
  jsx: 'automatic', define: { __UGNAV_CONFIG__: JSON.stringify(cfg), 'process.env.NODE_ENV': '"production"' },
  nodePaths: [process.env.NODE_PATH_EXTRA || '/opt/npm-tools/node_modules'],
  entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]', metafile: true, logLevel: 'warning',
});
cpSync(join(root, 'src/styles.css'), join(dist, 'app.css'));
cpSync(join(root, 'index.html'), join(dist, 'index.html'));
cpSync(join(root, 'public'), dist, { recursive: true });

const buildId = Date.now().toString(36);
const sw = readFileSync(join(dist, 'sw.js'), 'utf8').replace('__BUILD_ID__', buildId);
writeFileSync(join(dist, 'sw.js'), sw);

// Icons (drawn here: a navy tile with a gold compass-pin mark — original artwork).
const sharp = require('sharp');
const svg = (pad) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0b2a5b"/>
  <g transform="translate(256 262) scale(${pad ? 0.72 : 0.92})">
    <path d="M0-190c-80 0-140 60-140 138C-140 50 0 170 0 170S140 50 140-52c0-78-60-138-140-138Z" fill="#c99a2e"/>
    <circle cx="0" cy="-52" r="58" fill="#0b2a5b"/>
    <path d="M0-98 18-52 0-6-18-52Z" fill="#ffffff"/>
  </g></svg>`);
await sharp(svg(false)).resize(192, 192).png().toFile(join(dist, 'icons/icon-192.png'));
await sharp(svg(false)).resize(512, 512).png().toFile(join(dist, 'icons/icon-512.png'));
await sharp(svg(true)).resize(512, 512).png().toFile(join(dist, 'icons/icon-maskable-512.png'));
await sharp(svg(true)).resize(180, 180).png().toFile(join(dist, 'icons/apple-touch-icon.png'));

// Hosting config: SPA fallback + security headers (Netlify format).
writeFileSync(join(dist, '.nojekyll'), '');
writeFileSync(join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
  X-Frame-Options: DENY
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`);

const bytes = Object.entries(result.metafile.outputs).map(([f, o]) => `${f.replace(dist, 'dist')} ${(o.bytes / 1024).toFixed(1)} KB`);
console.log(bytes.join('\n'));
console.log('build', buildId, 'ok', existsSync(join(dist, 'app.js')));
