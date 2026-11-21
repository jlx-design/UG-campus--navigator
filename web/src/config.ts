// Public, non-secret configuration. Secrets (AI key, routing key, DB password) live only in the
// server function's environment. Override at build time with UGNAV_* env vars (see build.mjs).
declare const __UGNAV_CONFIG__: Partial<typeof defaults> | undefined;

const defaults = {
  DATA_API_URL: 'https://ep-withered-boat-bhv75jg9.apirest.c-10.eu-central-1.aws.neon.tech/ugnav/rest/v1',
  API_URL: 'https://br-ancient-sun-bhowhjub-api.compute.c-10.eu-central-1.aws.neon.tech',
  // Vector basemaps (OpenFreeMap, OpenMapTiles schema, OSM data) and Esri World Imagery for satellite.
  STYLE_STREETS: 'https://tiles.openfreemap.org/styles/liberty',
  STYLE_DARK: 'https://tiles.openfreemap.org/styles/dark',
  SATELLITE_TILES: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  SATELLITE_ATTRIBUTION: 'Imagery © Esri, Maxar, Earthstar Geographics',
};

export const CONFIG = { ...defaults, ...(typeof __UGNAV_CONFIG__ !== 'undefined' ? __UGNAV_CONFIG__ : {}) };

// Legon campus frame ([lng, lat] order for MapLibre).
export const CAMPUS_CENTER: [number, number] = [-0.1870, 5.6505];
export const CAMPUS_ZOOM = 15.6;
export const CAMPUS_BOUNDS: [[number, number], [number, number]] = [[-0.205, 5.630], [-0.170, 5.670]];
export const MAX_BOUNDS: [[number, number], [number, number]] = [[-0.33, 5.52], [-0.05, 5.78]];
export const SERVICE_AREA = { minLat: 5.60, maxLat: 5.70, minLng: -0.23, maxLng: -0.15 };
