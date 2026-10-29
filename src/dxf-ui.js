// cantcodecad – DXF-Einstellungen (Export) und DXF-Import-Dialog. Bewusst nicht auf ein bestimmtes Laser-/CAD-Programm
// zugeschnitten: Einheit, Bögen/Linien, Polylinien, Layer und Farben sind einstellbar und gelten für alle DXF-Exporte
// (Abwicklung, Fläche, Skizze, Fertigungspaket, Varianten). Gespeichert im Browser (gilt für alle Dokumente).
import { DXF_DEFAULTS, DXF_ROLES, dxfOptions } from './dxfwriter.js';
import { dxfInfo, dxfToSketch } from './dxfimport.js';
import { icon } from './icons.js';

const KEY = new URLSearchParams(location.search).has('test') ? 'cantcodecad.dxf.test' : 'cantcodecad.dxf';
export function dxfPrefs() {
  try { return dxfOptions(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return dxfOptions({}); }
}
function saveDxfPrefs(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* gesperrt */ } }

export function setupDxfUi(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a), toast = (...a) => ctx.toast(...a);
  const sel = (k, v, opts) => `<select data-dxf="${k}">${opts.map(([val, l]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  function openDxfSettings() {
    const O = dxfPrefs(), d = $('#dialog');
    d.className = 'dialog wide';
    d.innerHTML = `<header>${icon('dxf', 20)}<b class="dtitle">DXF-Einstellungen</b></header><div class="dbody">
      <label class="row"><span>Einheit</span>${sel('units', O.units, [['mm', 'Millimeter'], ['in', 'Zoll']])}</label>
      <label class="row"><span>Bögen</span>${sel('curves', O.curves, [['arcs', 'als Bögen/Kreise'], ['lines', 'in Linien auflösen']])}</label>
      <label class="row"><span>Toleranz</span><span class="num"><input type="number" step="0.005" min="0.001" data-dxf="tol" value="${O.tol}"><em>mm</em></span></label>
      <label class="row"><span>Konturen</span>${sel('contour', O.contour, [['entities', 'einzelne Linien und Bögen'], ['polyline', 'geschlossene Polylinie je Kontur']])}</label>
      <label class="row"><span>Biegelinien</span>${sel('bends', O.bends, [[true, 'ausgeben'], [false, 'weglassen']])}</label>
      <label class="row"><span>Beschriftung</span>${sel('labels', O.labels, [[false, 'keine'], [true, 'Biegewinkel, Richtung, Radius']])}</label>
      <table class="cfgtab"><thead><tr><th>Element</th><th>Layer</th><th>Farbe (1–255)</th></tr></thead><tbody>
      ${DXF_ROLES.map(([r, l]) => `<tr><td>${esc(l)}</td><td><input type="text" data-dxflayer="${r}" value="${esc(O.layers[r])}"></td><td><input type="number" min="1" max="255" step="1" data-dxfcolor="${r}" value="${O.colors[r]}"></td></tr>`).join('')}
      </tbody></table>
      <p class="info small">Gilt für alle DXF-Exporte (Abwicklung, ebene Fläche, Skizze, Fertigungspaket, Varianten). Format R12 – lesen praktisch alle CAD-, Laser- und Nesting-Programme. Farben nach DXF-Farbindex (1 rot, 2 gelb, 3 grün, 4 cyan, 5 blau, 6 magenta, 7 weiß/schwarz). Gleicher Layername für Außen- und Innenkonturen = eine gemeinsame Ebene.</p>
      <div class="btns"><button type="button" class="chip" data-cmd="dxf-reset">Standard wiederherstellen</button></div>
      </div><footer><button type="button" class="btn primary" data-cmd="dxf-ok">OK</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
    d.hidden = false;
    ctx.setMode('filedlg');
  }
  function commitDxfSettings() {
    const d = $('#dialog'), v = k => d.querySelector(`[data-dxf="${k}"]`).value;
    const O = { units: v('units'), curves: v('curves'), tol: Math.max(0.001, Number(v('tol')) || DXF_DEFAULTS.tol), contour: v('contour'), bends: v('bends') === 'true', labels: v('labels') === 'true', layers: {}, colors: {} };
    DXF_ROLES.forEach(([r]) => { O.layers[r] = d.querySelector(`[data-dxflayer="${r}"]`).value.trim() || DXF_DEFAULTS.layers[r]; O.colors[r] = Math.max(1, Math.min(255, Math.round(Number(d.querySelector(`[data-dxfcolor="${r}"]`).value) || DXF_DEFAULTS.colors[r]))); });
    saveDxfPrefs(O);
    ctx.closeFileDialog();
    toast('DXF-Einstellungen gespeichert.');
  }
  function resetDxfSettings() { saveDxfPrefs({}); openDxfSettings(); }

  /* Import: Layer übernehmen / als Hilfslinie / weglassen, Einheit, Ziel (XY oder gewählte ebene Fläche) */
  let pending = null;
  function openDxfImport(text, base) {
    let info;
    try { info = dxfInfo(text); } catch (err) { toast('DXF nicht lesbar: ' + err.message, 6000); return; }
    if (!info.layers.length) { toast('Keine Linien, Kreise oder Bögen in der DXF-Datei gefunden.'); return; }
    const face = ctx.selectedFacePlane();
    pending = { text, base, face };
    const uName = { 1: 'Zoll', 2: 'Fuß', 4: 'Millimeter', 5: 'Zentimeter', 6: 'Meter' }[info.insunits] || 'nicht angegeben (mm)';
    const d = $('#dialog');
    d.className = 'dialog wide';
    d.innerHTML = `<header>${icon('dxf', 20)}<b class="dtitle">DXF importieren</b></header><div class="dbody">
      <label class="row"><span>Einheit</span>${sel('unit', 'auto', [['auto', `aus der Datei: ${uName}`], ['1', 'Millimeter'], ['10', 'Zentimeter'], ['25.4', 'Zoll'], ['1000', 'Meter']])}</label>
      <label class="row"><span>Ziel</span>${sel('target', face ? 'face' : 'xy', face ? [['face', 'gewählte Fläche'], ['xy', 'XY-Ebene']] : [['xy', 'XY-Ebene']])}</label>
      <table class="cfgtab"><thead><tr><th>Layer</th><th>Elemente</th><th>Übernehmen als</th></tr></thead><tbody>
      ${info.layers.map(l => `<tr><td>${esc(l.name)}</td><td>${l.count}</td><td><select data-dxflay="${esc(l.name)}"><option value="use"${l.aux ? '' : ' selected'}>Kontur</option><option value="aux"${l.aux ? ' selected' : ''}>Hilfslinie</option><option value="skip">weglassen</option></select></td></tr>`).join('')}
      </tbody></table>
      <p class="info small">Hilfslinien (z. B. Biegelinien) kommen als Konstruktionslinien in die Skizze und bilden keine Profile.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="dxfimp-ok">Importieren</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
    d.hidden = false;
    ctx.setMode('filedlg');
  }
  function commitDxfImport() {
    if (!pending) return;
    const d = $('#dialog'), unit = d.querySelector('[data-dxf="unit"]').value, target = d.querySelector('[data-dxf="target"]').value;
    const layers = {};
    d.querySelectorAll('[data-dxflay]').forEach(s => { layers[s.dataset.dxflay] = s.value; });
    const plane = target === 'face' && pending.face ? pending.face : ctx.ORIGIN_PLANES.XY;
    let res;
    try { res = dxfToSketch(pending.text, plane, pending.base, { unit: unit === 'auto' ? null : Number(unit), layers }); } catch (err) { toast('Import nicht möglich: ' + err.message, 6000); return; }
    const { sketch, count, skipped } = res;
    if (target === 'face' && pending.face) {
      // auf der Fläche mittig zur Flächenmitte
      const xs = sketch.points.map(p => p.x), ys = sketch.points.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      sketch.points.forEach(p => { p.x -= cx; p.y -= cy; });
    }
    pending = null;
    ctx.closeFileDialog();
    ctx.addSketch(sketch);
    toast(`${count} Kurven als Skizze ${target === 'face' ? 'auf die Fläche' : 'auf XY'} übernommen${skipped ? ` (${skipped} Elemente übersprungen)` : ''}. Jetzt z. B. extrudieren.`, 7000);
  }
  return { openDxfSettings, commitDxfSettings, resetDxfSettings, openDxfImport, commitDxfImport };
}
