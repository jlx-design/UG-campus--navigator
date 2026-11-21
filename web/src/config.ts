// Public, non-secret configuration, generated per campus (white-label) from campus/<id>.json.
// Secrets (AI key, routing key, DB password) live only in the server function's environment.
import { CAMPUS } from './campus.gen';
declare const __UGNAV_CONFIG__: Partial<typeof defaults> | undefined;

const defaults = {
  DATA_API_URL: CAMPUS.api.dataApiUrl as string,
  API_URL: CAMPUS.api.apiUrl as string,
  VAPID_PUBLIC_KEY: CAMPUS.api.vapidPublicKey as string,
  // Vector basemaps (OpenFreeMap, OpenMapTiles schema, OSM data) and Esri World Imagery for satellite.
  STYLE_STREETS: 'https://tiles.openfreemap.org/styles/liberty',
  STYLE_DARK: 'https://tiles.openfreemap.org/styles/dark',
  SATELLITE_TILES: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  SATELLITE_ATTRIBUTION: 'Imagery © Esri, Maxar, Earthstar Geographics',
};

export const CONFIG = { ...defaults, ...(typeof __UGNAV_CONFIG__ !== 'undefined' ? __UGNAV_CONFIG__ : {}) };
export { CAMPUS };
export const APP_NAME = CAMPUS.appName;

// Campus frame ([lng, lat] order for MapLibre).
export const CAMPUS_CENTER = CAMPUS.center as unknown as [number, number];
export const CAMPUS_ZOOM = CAMPUS.zoom;
export const CAMPUS_BOUNDS = CAMPUS.bounds as unknown as [[number, number], [number, number]];
export const MAX_BOUNDS = CAMPUS.maxBounds as unknown as [[number, number], [number, number]];
export const SERVICE_AREA = CAMPUS.serviceArea;
