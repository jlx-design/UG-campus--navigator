# Launching the app for another campus (white-label)

Each university gets **its own copy** of the app: its own website, its own database and its own server function.
No data is shared between campuses, which is what institutions expect when they license software.
The code is the same for every campus — only `web/campus/<id>.json` and the server's environment differ.

## 1. Collect verified campus facts (never guess)
| What | Where to get it |
|---|---|
| Official university and campus name | University website |
| Campus centre (lat, lng) | OpenStreetMap — right-click the main gate → "Show address" |
| Name of the university area in OpenStreetMap | openstreetmap.org → search the university → the `name` tag of the `amenity=university` area |
| Grading scale and class-of-degree boundaries | The university's **official** handbook / academic regulations (link it) |
| Emergency and campus security numbers | Official university pages only |

## 2. Create the backend (Neon) — about 10 minutes
1. New Neon project (region close to the campus), database e.g. `campusnav`.
2. Enable **Neon Auth** (email + password, email verification ON) and the **Data API** (anonymous role `anonymous`).
3. Run every file in `db/migrations/` **in order** (001 → latest).
4. Deploy `functions/api/index.mjs` as a Neon Function named `api` with these environment variables:
   - `UGNAV_DATABASE_URL`, `NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL`, `DATA_API_URL`
   - `ALLOWED_ORIGINS` — the campus website's origin
   - `CAMPUS_NAME` (e.g. `Kwame Nkrumah University of Science and Technology, Kumasi`), `CAMPUS_OSM_NAME`, `CAMPUS_TZ`
   - `CAMPUS_AREA` — JSON `{"minLat":…,"maxLat":…,"minLng":…,"maxLng":…}` (same as `serviceArea`)
   - `ORS_API_KEY` (free, account.heigit.org), `GROQ_API_KEY` (free, console.groq.com)
   - `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT` — generate a new key pair per campus (see below)
5. Add a scheduled trigger: path `/cron/reminders`, cron `*/5 * * * *`.
6. Add the website origin to Neon Auth **trusted domains**.
7. Insert the first admin invite: `insert into admin_invites(email, role) values ('owner@example.com', 'admin');`

Generate VAPID keys:
```bash
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});console.log('VAPID_PRIVATE_JWK=',JSON.stringify(k));console.log('public key:',Buffer.concat([Buffer.from([4]),Buffer.from(k.x,'base64url'),Buffer.from(k.y,'base64url')]).toString('base64url'))"
```

## 3. Create the campus config and build
```bash
node scripts/new-campus.mjs knust "KNUST Navigator" "Kwame Nkrumah University of Science and Technology" "Kumasi" <lat> <lng> "<OSM name>"
# edit web/campus/knust.json: api URLs, VAPID public key, brand colours, grading (with official source)
cd web && CAMPUS=knust node build.mjs      # output in web/dist
```
Publish `web/dist` to that campus's site (GitHub Pages repo, Netlify, Vercel…).

## 4. Load the campus directory
Sign in as the admin → Administration → Places → **Import from OpenStreetMap**, then verify places, add rooms,
opening hours, emergency numbers, shuttle routes and guide content — each with its source.

## Notes
- Grading differs by university (some use CWA / percentages rather than a 4.0 GPA). Enter the campus's own scale;
  the GPA screen reads it from the config. A CWA mode needs a small addition to `Gpa.tsx` before launch.
- Satellite imagery (Esri) has licence terms for commercial products — check before selling.
