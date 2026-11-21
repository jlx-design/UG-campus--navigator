// Storage namespacing: several campus builds can live on the same web origin (e.g. github.io sub-paths),
// so every localStorage key and cache name carries the campus id (UG keeps its original names).
import { CAMPUS } from '../campus.gen';
export const K = (k: string) => (CAMPUS.id === 'ug' ? `ugnav.${k}` : `ugnav.${CAMPUS.id}.${k}`);
export const CACHE_PREFIX = CAMPUS.id === 'ug' ? 'ugnav-' : `ugnav-${CAMPUS.id}-`;
