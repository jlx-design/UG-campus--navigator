// Scaffold a new white-label campus config.
// Usage: node scripts/new-campus.mjs <id> "<App name>" "<University name>" "<Campus name>" <lat> <lng> ["<OSM university name>"]
// Then fill in: api URLs + VAPID public key (from the new backend), brand colours, and the grading scale WITH its official source.
import { writeFileSync, existsSync } from 'node:fs';
const [id, appName, university, campusName, lat, lng, osmName] = process.argv.slice(2);
if (!id || !appName || !university || !campusName || !lat || !lng) { console.error('Usage: node scripts/new-campus.mjs <id> "<App name>" "<University>" "<Campus>" <lat> <lng> ["<OSM name>"]'); process.exit(1); }
const out = new URL(`../web/campus/${id}.json`, import.meta.url);
if (existsSync(out)) { console.error(`web/campus/${id}.json already exists`); process.exit(1); }
const la = Number(lat), ln = Number(lng), r = (n) => Math.round(n * 1000) / 1000;
const cfg = {
  id, appName, university, campusName, osmName: osmName || university, timezone: 'Africa/Accra',
  center: [ln, la], zoom: 15.6,
  bounds: [[r(ln - 0.02), r(la - 0.02)], [r(ln + 0.02), r(la + 0.02)]],
  maxBounds: [[r(ln - 0.15), r(la - 0.13)], [r(ln + 0.13), r(la + 0.13)]],
  serviceArea: { minLat: r(la - 0.05), maxLat: r(la + 0.05), minLng: r(ln - 0.05), maxLng: r(ln + 0.05) },
  brand: { navy: '#0b1b3a', gold: '#c8961e', accent: '#1d4ed8', accentName: 'Campus Blue' },
  api: { dataApiUrl: 'TODO', apiUrl: 'TODO', vapidPublicKey: 'TODO' },
  grading: { mode: 'gpa', maxPoint: 4, sourceLabel: 'TODO: official grading document', sourceUrl: 'TODO', grades: [], classes: [] },
  languages: ['en'],
};
writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
console.log(`Created web/campus/${id}.json — now follow docs/NEW_CAMPUS.md`);
