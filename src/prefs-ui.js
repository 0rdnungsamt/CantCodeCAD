// cantcodecad – Einstellungen: Farbschema hell/dunkel/wie Windows, Größe der Oberfläche,
// Startfenster, Sprache (Deutsch/Englisch, src/i18n.js), Einheiten und Nachkommastellen (src/units.js), Bedienung
// (Maus und einige Tasten, mehrere Schemata). Gespeichert in localStorage (cc.prefs, im Prüfstand cc.prefs.test).
// Größe: im Desktop-Programm echter Seitenzoom über den lokalen Server (/__zoom → Tauri set_zoom), damit Menüs,
// Mausauswahl und 3D-Ansicht stimmen. Im reinen Browser zoomt man mit Strg + / − (der Dialog sagt das).
import { icon } from './icons.js';
import { nativeCaps } from './files-native.js';
import { LANG, LANGS } from './i18n.js';
import { LEN_UNITS, DECIMALS } from './units.js';

const TEST = new URLSearchParams(location.search).has('test');
const KEY = TEST ? 'cc.prefs.test' : 'cc.prefs';
const START = 'cc.start';
export const SCALES = [0.9, 1, 1.1, 1.25, 1.5];
const DEF = { theme: 'light', scale: 1, diag: false, ai: false, lang: 'de', unit: 'mm', decLen: 'auto', decAng: 'auto', nav: 'standard', revZoom: false, stepAufbau: true };

export function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEF, ...p }; } catch (_) { return { ...DEF }; }
}
function savePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) { /* gesperrt */ } }
/* Diagnose (Messwerte der Bauzeiten in Statuszeile, Konsole und tools/diagnose.log): im Alltag aus */
let diagAn = loadPrefs().diag === true;
export const diagnose = () => diagAn;

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export const resolvedTheme = p => (p.theme === 'system' ? (media && media.matches ? 'dark' : 'light') : p.theme === 'dark' ? 'dark' : 'light');
/* Farbschema sofort setzen (vor dem ersten Zeichnen, sonst blitzt die helle Oberfläche auf) */
export function applyTheme(p = loadPrefs()) {
  document.documentElement.dataset.theme = resolvedTheme(p);
}
async function applyScale(p) {
  const c = await nativeCaps();
  if (!c || !c.zoom) return false;
  try { await fetch('/__zoom?f=' + encodeURIComponent(p.scale), { headers: { 'X-cantcodecad': '1' }, cache: 'no-store' }); return true; } catch (_) { return false; }
}

export function setupPrefs(ctx) {
  const esc = (...a) => ctx.esc(...a);
  let prefs = loadPrefs(), tab = 'look';
  applyTheme(prefs);
  if (media) media.addEventListener('change', () => { if (prefs.theme === 'system') applyTheme(prefs); });
  if (prefs.scale !== 1) applyScale(prefs);
  function set(k, v) {
    /* Sprache: gilt ab dem nächsten Laden (src/i18n.js) – Dokument sichern und Oberfläche neu laden */
    if (k === 'lang') {
      if (v === LANG) return;
      if (ctx.editing && ctx.editing()) { ctx.toast('Erst die Skizze bzw. das Feature mit OK oder Abbrechen beenden, dann die Sprache wechseln.', 5000); return; }
      prefs = { ...prefs, lang: v };
      savePrefs(prefs);
      if (ctx.onLang) ctx.onLang(v);
      return;
    }
    /* Einheiten und Nachkommastellen: wie die Sprache ab dem nächsten Laden (src/units.js liest sie beim Start) */
    if (k === 'unit' || k === 'decLen' || k === 'decAng') {
      const nv = k === 'unit' ? v : v === 'auto' ? 'auto' : Number(v);
      if (prefs[k] === nv) return;
      if (ctx.editing && ctx.editing()) { ctx.toast('Erst die Skizze bzw. das Feature mit OK oder Abbrechen beenden, dann die Einheiten ändern.', 5000); return; }
      prefs = { ...prefs, [k]: nv };
      savePrefs(prefs);
      if (ctx.onLang) ctx.onLang();
      return;
    }
    prefs = { ...prefs, [k]: v };
    savePrefs(prefs);
    if ((k === 'nav' || k === 'revZoom') && ctx.onNav) ctx.onNav(prefs.nav, prefs.revZoom === true);
    if (k === 'diag') { diagAn = v === true; if (ctx.onDiag) ctx.onDiag(diagAn); }
    if (k === 'ai' && ctx.onAi) ctx.onAi(v === true);
    if (k === 'theme') applyTheme(prefs);
    if (k === 'scale') applyScale(prefs).then(ok => { if (!ok) ctx.toast('Im Browser die Größe mit Strg + / − (oder Strg + Mausrad) einstellen.', 6000); });
    render();
  }
  function close() { const el = document.getElementById('prefs'); if (el) el.remove(); }
  async function render() {
    const el = document.getElementById('prefs');
    if (!el) return;
    const c = await nativeCaps();
    const seg = (k, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" data-pref="${k}" data-v="${v}" role="radio" aria-checked="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
    let startOn = true; try { startOn = localStorage.getItem(START) !== '0'; } catch (_) { /* egal */ }
    const look = `<div class="row col"><span>Sprache</span>${seg('lang', LANGS, LANG)}</div>
      <div class="row col"><span>Farbschema</span>${seg('theme', [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'Wie Windows']], prefs.theme)}</div>
      <div class="row col"><span>Größe der Oberfläche</span>${seg('scale', SCALES.map(s => [s, `${Math.round(s * 100)} %`]), prefs.scale)}</div>
      ${c && c.zoom ? '' : '<p class="info small">Im Browser wirkt die Größe über Strg + / − (bzw. Strg + Mausrad). Im Desktop-Programm stellt cantcodecad sie selbst ein.</p>'}
      <p class="info small">Zeichnungsblätter bleiben auch im dunklen Schema weiß wie Papier.</p>
      <p class="info small">Die Oberfläche wird in der gewählten Sprache neu geladen; das offene Dokument bleibt erhalten. Zeichnungsblätter und Namen, die im Dokument stehen, bleiben wie eingegeben.</p>`;
    const decOpts = (k, max) => DECIMALS.filter(d => d === 'auto' || d <= max).map(d => `<option value="${d}"${String(d) === String(prefs[k]) ? ' selected' : ''}>${d === 'auto' ? 'Automatisch' : d}</option>`).join('');
    const units = `<div class="row col"><span>Längeneinheit</span>${seg('unit', LEN_UNITS.map(([v, l]) => [v, l]), prefs.unit)}</div>
      <label class="row col"><span>Nachkommastellen Länge</span><select data-pref="decLen">${decOpts('decLen', 6)}</select></label>
      <label class="row col"><span>Nachkommastellen Winkel</span><select data-pref="decAng">${decOpts('decAng', 4)}</select></label>
      <p class="info small">Gilt für Feature-Dialoge, Skizzenmaße, Messen, Eigenschaften, Blechregeln, Zuschnittliste und Statusleiste. Intern rechnet cantcodecad weiter in mm, Dateien bleiben gleich. Eine Zahl ohne Einheit gilt in der gewählten Einheit, auch in Ausdrücken (breite + 5); als Faktor bleibt sie eine Zahl (breite * 2), „5 mm“ oder „1 in“ gilt wie geschrieben. Parameter rechnen in mm. Zeichnungsblätter, Verschachtelung und Exporte (DXF, CSV) bleiben in mm wie in der Fertigung.</p>
      <p class="info small">Die Längeneinheit gilt für neue Dokumente. Ein Dokument kann im Browser unter Dokumenteinstellungen → Einheiten eine eigene haben, die beim Öffnen wieder gilt.</p>
      <p class="info small">„Automatisch“ zeigt so viele Stellen wie bisher (in cm und Zoll eine mehr, in m drei mehr). Nach einer Änderung wird die Oberfläche neu geladen; das offene Dokument bleibt erhalten.</p>`;
    const gen = `<div class="row col"><span>Bedienung (Maus und Tasten)</span>${seg('nav', [['standard', 'Standard'], ['mitte', 'Mitte dreht'], ['ftasten', 'Mit F-Tasten'], ['rechts', 'Rechts dreht'], ['altumschalt', 'Alt + Umschalt'], ['mitteumschalt', 'Mitte dreht, Umschalt verschiebt']], prefs.nav)}</div>
      <p class="info small">${prefs.nav === 'rechts' ? 'Rechts dreht: rechte Maustaste ziehen dreht, Umschalt + rechts oder mittlere Maustaste verschiebt, Mausrad zoomt. Rechtsklick ohne Ziehen öffnet weiter das Markierungsmenü. Befehlstasten wie bei „Standard“.' : prefs.nav === 'altumschalt' ? 'Alt + Umschalt: Alt + Umschalt + linke Maustaste dreht, Alt + Umschalt + Mitte verschiebt, Alt + Umschalt + rechts zoomt, Mausrad zoomt. Befehlstasten wie bei „Standard“.' : prefs.nav === 'mitteumschalt' ? 'Mitte dreht, Umschalt verschiebt: mittlere Maustaste dreht, Umschalt + Mitte verschiebt, Strg + Mitte oder Mausrad zoomt. Befehlstasten wie bei „Standard“.' : prefs.nav === 'ftasten' ? 'Mit F-Tasten: mittlere Maustaste verschiebt, Umschalt + Mitte dreht, Mausrad zoomt. F2 Verschieben, F3 Zoomen, F4 Orbit (mit der linken Maustaste, noch einmal = aus), F5 vorherige Ansicht, F6 Startansicht. Die Befehlstasten (E, D, F …) wie bei „Standard“.' : prefs.nav === 'mitte' ? 'Mitte dreht: mittlere Maustaste dreht, Strg + Mitte verschiebt, Umschalt + Mitte oder Mausrad zoomt. F passt ein, Strg + 1…7 Normansichten (vorne, hinten, links, rechts, oben, unten, isometrisch), Strg + 8 senkrecht auf die gewählte Fläche, S sucht Befehle.' : 'Standard: mittlere Maustaste verschiebt, Umschalt + Mitte dreht, Mausrad zoomt. Tasten E Extrusion, D Drehung, F Verrunden, H Bohrung, Q Drücken/Ziehen, M Verschieben, J Gelenk, I Messen, S Befehlssuche, Pos1 Einpassen.'}</p>
      <label class="row chk"><input type="checkbox" data-pref="revZoom"${prefs.revZoom ? ' checked' : ''}> Zoomrichtung des Mausrads umkehren</label>
      <label class="row chk"><input type="checkbox" data-pref="start"${startOn ? ' checked' : ''}> Startfenster beim Programmstart anzeigen</label>
      <label class="row chk"><input type="checkbox" data-pref="stepAufbau"${prefs.stepAufbau !== false ? ' checked' : ''}> STEP-Teil in einem neuen Teil mit eigenen Funktionen aufbauen (Blech: Grundlasche + Biegen, sonst Skizze + Extrusion, bemaßt)</label>
      <label class="row chk"><input type="checkbox" data-pref="diag"${prefs.diag ? ' checked' : ''}> Diagnose anzeigen</label>
      <label class="row chk"><input type="checkbox" data-pref="ai"${prefs.ai ? ' checked' : ''}> Claude-Anbindung (MCP)</label>
      <p class="info small">Claude (Claude-App oder Claude Code) kann dann am offenen Dokument konstruieren – über den MCP-Server <code>tools/mcp/cantcodecad-mcp.mjs</code> auf diesem Rechner. Einrichtung: <code>docs/claude-anbindung.md</code>. Jede Änderung lässt sich rückgängig machen.</p>
      <p class="info small">Messwerte jedes Baus (Import, Netze, Dauerspeicher) in der Statuszeile und in der Konsole, dazu im Protokoll des lokalen Servers. Zum Messen großer Baugruppen; im Alltag aus.</p>`;
    el.querySelector('.pf-body').innerHTML = tab === 'look' ? look : tab === 'units' ? units : gen;
    el.querySelectorAll('[data-pftab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pftab === tab)));
  }
  function open() {
    close();
    const el = document.createElement('div');
    el.id = 'prefs';
    el.className = 'askbox';
    el.innerHTML = `<div class="askcard pf-card" role="dialog" aria-label="Einstellungen">
      <header class="pf-head">${icon('gear', 20)}<b>Einstellungen</b><button type="button" class="iconbtn" data-pf="close" title="Schließen" aria-label="Schließen">${icon('close', 16)}</button></header>
      <div class="pf-tabs"><button type="button" class="pf-tab" data-pftab="look">Darstellung</button><button type="button" class="pf-tab" data-pftab="units">Einheiten</button><button type="button" class="pf-tab" data-pftab="general">Allgemein</button></div>
      <div class="pf-body"></div>
      <div class="askbtns"><button type="button" class="btn primary" data-pf="close">Fertig</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-pf="close"]')) { close(); return; }
      const t = e.target.closest('[data-pftab]');
      if (t) { tab = t.dataset.pftab; render(); return; }
      const b = e.target.closest('button[data-pref]');
      if (b) set(b.dataset.pref, b.dataset.pref === 'scale' ? Number(b.dataset.v) : b.dataset.v);
    });
    el.addEventListener('change', e => {
      if (e.target.matches('[data-pref="start"]')) { try { localStorage.setItem(START, e.target.checked ? '1' : '0'); } catch (_) { /* gesperrt */ } }
      if (e.target.matches('[data-pref="diag"]')) set('diag', e.target.checked);
      if (e.target.matches('[data-pref="ai"]')) set('ai', e.target.checked);
      if (e.target.matches('[data-pref="revZoom"]')) set('revZoom', e.target.checked);
      if (e.target.matches('[data-pref="stepAufbau"]')) set('stepAufbau', e.target.checked);
      if (e.target.matches('select[data-pref]')) set(e.target.dataset.pref, e.target.value);
    });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    render();
  }
  return { openPrefs: open, get prefs() { return prefs; } };
}
