// cantcodecad – Dateien über die Windows-Dateidialoge (Öffnen, Speichern unter, Exporte) statt nur im Ordner Projekte.
// Der lokale Server (desktop/src/main.rs bzw. tools/server.ps1) zeigt den Dialog und liest/schreibt Dateien mit vollem
// Pfad (/__caps, /__dialog, /__fread, /__fwrite, nur mit Kopfzeile X-cantcodecad). Ohne diese Endpunkte (alter Server,
// reiner Browser) und im Prüfstand (?test) bleibt alles beim Bisherigen (Projektordner, Download).
const H = { 'X-cantcodecad': '1' };
const TEST = new URLSearchParams(location.search).has('test');
let caps;

/* null = keine Windows-Dialoge; sonst { dialogs: true, projects: '<Pfad>' } */
export async function nativeCaps() {
  // Prüfstand: nie den echten Dialog; ein Test kann window.__ccNativeStub (Dialog + Dateien) einsetzen
  if (TEST) return window.__ccNativeStub ? window.__ccNativeStub.caps : null;
  if (caps !== undefined) return caps;
  try {
    const r = await fetch('/__caps', { cache: 'no-store' });
    caps = r.ok ? await r.json() : null;
    if (caps && !caps.dialogs) caps = null;
  } catch (_) { caps = null; }
  return caps;
}

/* Voller Windows-Pfad (C:\… oder \\Server\…) statt Pfad im Projektordner */
export const isAbsPath = p => typeof p === 'string' && /^([A-Za-z]:[\\/]|\\\\)/.test(p);
export const baseName = p => String(p || '').split(/[\\/]/).pop();
export const dirName = p => { const s = String(p || ''), i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/')); return i > 0 ? s.slice(0, i) : ''; };

const LASTDIR = TEST ? 'cc.lastdir.test' : 'cc.lastdir';
const RECENT = TEST ? 'cc.recent.test' : 'cc.recent';
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* gesperrt */ } };

const FILTERS = {
  cantcodecad: 'cantcodecad (*.cantcodecad)|*.cantcodecad|Alle Dateien (*.*)|*.*',
  step: 'STEP (*.step;*.stp)|*.step;*.stp|Alle Dateien (*.*)|*.*', stp: 'STEP (*.step;*.stp)|*.step;*.stp|Alle Dateien (*.*)|*.*',
  stl: 'STL (*.stl)|*.stl', '3mf': '3MF (*.3mf)|*.3mf', dxf: 'DXF (*.dxf)|*.dxf', svg: 'SVG (*.svg)|*.svg', pdf: 'PDF (*.pdf)|*.pdf',
  zip: 'ZIP (*.zip)|*.zip', csv: 'CSV (*.csv)|*.csv', webm: 'Video WebM (*.webm)|*.webm', png: 'PNG (*.png)|*.png'
};
export const filterFor = name => FILTERS[(String(name).split('.').pop() || '').toLowerCase()] || 'Alle Dateien (*.*)|*.*';

/* Windows-Dialog; liefert den gewählten Pfad oder null (abgebrochen) */
export async function pickFile(mode, name = '', filter = FILTERS.cantcodecad) {
  if (window.__ccNativeStub) return window.__ccNativeStub.pick(mode, name, filter);
  const c = await nativeCaps();
  const dir = lsGet(LASTDIR) || (c && c.projects) || '';
  const q = new URLSearchParams({ mode, name, dir, filter });
  const r = await fetch('/__dialog?' + q, { headers: H, cache: 'no-store' });
  if (!r.ok) throw new Error('Dateidialog nicht verfügbar');
  const { path } = await r.json();
  if (path) lsSet(LASTDIR, dirName(path));
  return path || null;
}
export async function readFile(path) {
  if (window.__ccNativeStub) return window.__ccNativeStub.read(path);
  const r = await fetch('/__fread?path=' + encodeURIComponent(path), { headers: H, cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'Datei nicht gefunden: ' + path : 'Datei nicht lesbar: ' + path);
  return r.arrayBuffer();
}
export async function readText(path) { return new TextDecoder().decode(await readFile(path)); }
export async function writeFile(path, data) {
  if (window.__ccNativeStub) return window.__ccNativeStub.write(path, data);
  const r = await fetch('/__fwrite?path=' + encodeURIComponent(path), { method: 'POST', headers: H, body: data });
  if (!r.ok) throw new Error('Speichern nicht möglich: ' + path);
}

/* Zuletzt geöffnete Dateien (Startfenster); path = voller Pfad oder Pfad im Projektordner */
export function recentFiles() { try { return JSON.parse(lsGet(RECENT) || '[]'); } catch (_) { return []; } }
export function addRecent(path, name, kind) {
  if (!path) return;
  const list = recentFiles().filter(r => r.path !== path);
  list.unshift({ path, name: name || baseName(path).replace(/\.cantcodecad$/i, ''), t: Date.now(), ...(kind ? { kind } : {}) });
  lsSet(RECENT, JSON.stringify(list.slice(0, 12)));
}
export function forgetRecent(path) { lsSet(RECENT, JSON.stringify(recentFiles().filter(r => r.path !== path))); }
