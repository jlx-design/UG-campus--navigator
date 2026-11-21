// The front door (campus chooser) lives one level above each campus app: /<repo>/ chooses, /<repo>/<campus>/ is the app.
// Returns the chooser URL when this build is served under a campus sub-path, or null when it isn't (e.g. local preview).
import { CAMPUS } from '../campus.gen';
export function switchCampusHref(): string | null {
  const p = location.pathname;
  const m = p.match(new RegExp(`^(.*/)${CAMPUS.id}/(index\\.html)?$`));
  return m ? `${m[1]}?choose=1` : null;
}
