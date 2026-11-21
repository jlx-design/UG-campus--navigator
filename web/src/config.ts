// Public, non-secret configuration. Secrets (AI key, routing key, DB password) live only in the
// server function's environment. Override at build time with UGNAV_* env vars (see build.mjs).
declare const __UGNAV_CONFIG__: Partial<typeof defaults> | undefined;

const defaults = {
  DATA_API_URL: 'https://ep-withered-boat-bhv75jg9.apirest.c-10.eu-central-1.aws.neon.tech/ugnav/rest/v1',
  AUTH_URL: 'https://ep-withered-boat-bhv75jg9.neonauth.c-10.eu-central-1.aws.neon.tech/ugnav/auth',
  API_URL: 'https://br-ancient-sun-bhowhjub-api.compute.c-10.eu-central-1.aws.neon.tech',
  // Map tiles: OpenStreetMap standard tiles (attribution required; light usage only — see README).
  TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const CONFIG = { ...defaults, ...(typeof __UGNAV_CONFIG__ !== 'undefined' ? __UGNAV_CONFIG__ : {}) };

// Approximate frame of the Legon campus used for the initial view and "back to campus".
export const CAMPUS_CENTER: [number, number] = [5.6505, -0.1870];
export const CAMPUS_ZOOM = 16;
export const CAMPUS_BOUNDS: [[number, number], [number, number]] = [[5.630, -0.205], [5.670, -0.170]];
export const SERVICE_AREA = { minLat: 5.60, maxLat: 5.70, minLng: -0.23, maxLng: -0.15 };
