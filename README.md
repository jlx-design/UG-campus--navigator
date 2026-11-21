# UG Campus Navigator

Campus map, real walking directions, Fresher Hub, verified updates and an AI assistant for the University of Ghana, Legon. Mobile‑first PWA.

## Architecture

| Layer | Technology | Where it lives |
|---|---|---|
| Frontend | React 19 + TypeScript, bundled with esbuild, code‑split; Leaflet 1.9.4 (CDN, SRI‑pinned) | `web/` → static `dist/` (Netlify) |
| Database | Neon Postgres 17, project **icy-cloud-48010088**, db **ugnav** | `db/migrations/001_init.sql` |
| Auth | Neon Auth (Managed Better Auth): email + password, JWT via JWKS | Neon console → Auth |
| Data access | Neon Data API (PostgREST‑compatible) — every table has RLS; anonymous role reads only published public rows | from the browser |
| Server API | Neon Function `api` (Node 24, no dependencies): `/health`, `/route`, `/assistant`, `/admin/import-osm` | `functions/api/index.mjs` |
| Routing | openrouteservice `foot-walking` (server‑side key) | via `/route` |
| AI | Anthropic Messages API (server‑side key), retrieval over the app's own records, `show_location` tool restricted to retrieved IDs | via `/assistant` |
| Campus data | OpenStreetMap (imported as **unverified**), promoted to **verified** only by editors | `locations` table |

Live endpoints (public, non‑secret):
- Data API: `https://ep-withered-boat-bhv75jg9.apirest.c-10.eu-central-1.aws.neon.tech/ugnav/rest/v1`
- Auth: `https://ep-withered-boat-bhv75jg9.neonauth.c-10.eu-central-1.aws.neon.tech/ugnav/auth`
- Function: `https://br-ancient-sun-bhowhjub-api.compute.c-10.eu-central-1.aws.neon.tech`
- Site (after you upload `dist/`): `https://ug-campus-navigator.netlify.app`

## Security model
- RLS on all 13 tables. Anonymous: read published locations/announcements/resources/checklist only. Users: CRUD only their own profile, saved places, checklist progress, read‑state; can file reports.
- Roles live in `app_roles`, which has **no client write path** — roles are granted with SQL by the database owner.
- Publishing announcements is enforced by a trigger: only `admin` can move a row to `published`.
- Audit triggers log every insert/update/delete on locations, announcements, fresher resources, checklist items.
- AI/routing keys and the DB password exist only in the Neon Function environment. CORS on the function is restricted to `ALLOWED_ORIGINS`. Rate limits: assistant 20/h (guest) · 60/h (signed in); routes 240/h.
- Retrieved records are passed to the model as data with explicit injection‑resistance rules; location actions are filtered server‑side to IDs that were actually retrieved.

## Deploy the frontend
`dist/` is ready to publish. Easiest: Netlify → project **ug-campus-navigator** → Deploys → drag the `dist` folder in.
Or with the CLI from `web/`: `npm install && node build.mjs && npx netlify deploy --prod --dir dist --site 15b7fa06-a67c-4742-ae03-4d0b808ddb63`.
`web/netlify.toml` lets Netlify build from a Git repo instead (base directory `web`).
If you host elsewhere, add that origin to (1) Neon Auth trusted domains and (2) the function's `ALLOWED_ORIGINS`.

## Required configuration (still to do)
Set these as **Neon Function environment variables** (Console → Functions → api → Environment), or ask me to deploy them:
| Variable | Purpose | Status |
|---|---|---|
| `ORS_API_KEY` | walking routes (free key at openrouteservice.org) | **missing** → Navigate shows "not configured" |
| `ANTHROPIC_API_KEY` | AI assistant | **missing** → Assistant shows "not configured" |
| `UGNAV_DATABASE_URL`, `NEON_AUTH_JWKS_URL`, `ALLOWED_ORIGINS`, `AI_MODEL` | already set | ✓ |

Recommended for production:
- Neon Auth: turn on **email verification** and turn off **allow localhost**.
- Map tiles: OpenStreetMap's standard tiles are for light use; for real traffic set `UGNAV_TILE_URL` to a commercial/self‑hosted tile service and rebuild.
- Replace the function's DB role (currently the DB owner) with a dedicated role limited to the tables it touches.

## Bootstrap the first administrator
1. Sign up in the app.
2. In the Neon SQL editor (db `ugnav`):
```sql
insert into app_roles (user_id, role, granted_by)
select id, 'admin', 'bootstrap' from neon_auth."user" where email = 'you@example.com';
```
3. Profile → Administration → Locations → **Import from OpenStreetMap** (your browser fetches OSM, the server validates and upserts as *unverified*). Then verify places one by one, and add Fresher Hub content/checklist items with their official UG sources.

## Campus data policy
No place, deadline, fee, phone number or policy is invented. The database ships **empty of campus facts**; the only seed data is the category list. Locations come from OpenStreetMap (labelled "OpenStreetMap · unverified" everywhere, including in assistant answers) until an editor verifies them; official Fresher content must link its UG source (enforced by DB check constraints).

## Tests actually run (2026‑11‑21)
- `tsc` type check of all app code (React itself typed via local shims — `@types/react` was unavailable offline): pass.
- Headless Chrome smoke test (`tests/smoke.mjs`, 390×844 mobile): all 16 routes render, correct active tab, no JS exceptions; theme persists across reload; assistant shows a retryable error when the API is unreachable. External hosts were blocked in the test sandbox, so the map, Data API and auth were **not** exercised there.
- RLS (SQL, impersonating roles): anonymous cannot insert locations or read saved places; an ordinary authenticated user's location insert is rejected; 0 tables without RLS.
- Server function: deployed; `/health` returns DB OK and JWKS configured; the scheduled trigger reaches `/admin/import-osm` authorised.
- **Not yet verified**: the Leaflet CDN integrity hashes (if the map stays blank, remove the two `integrity` attributes in `web/index.html`), sign‑up/sign‑in against Neon Auth from the deployed origin, real route requests (no ORS key), assistant answers (no AI key), OSM import (Overpass refused/timed out from Neon's servers — use the admin button), PWA install and GPS on a physical phone.

## Known limitations
- Overpass refuses connections from Neon's servers, so the weekly server‑side refresh (Sun 02:17 UTC) may fail; the admin button is the reliable path.
- Push notifications are not implemented; the in‑app notification centre (unread badge, mark‑as‑read) is.
- Route accessibility (stairs/ramps) isn't verified and the UI says so.
- Leaflet loads from unpkg (SRI‑pinned); first visit needs that CDN.
