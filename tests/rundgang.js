// Rundgang: ruft jeden Befehl der Werkzeugleisten, jedes Skizzenwerkzeug und die Zeichnungsbefehle einmal auf,
// prüft, ob die App reagiert und sich sauber wieder schließen lässt, und sammelt Fehler der App.
// Downloads, Dateiauswahl und Druckdialog werden im Test abgefangen.
import { W, D, C, sleep, waitFor, openExample, newDoc, expect, runSuite, editTimeline, sketchClick } from './harness.js';

/* ---------- Abfangen und Beobachten ---------- */
let downloads = [], toasts = [];
function hook() {
  if (W.__rundgang) return;
  W.__rundgang = true;
  const A = W.HTMLAnchorElement.prototype, aClick = A.click;
  A.click = function () { if (this.download) { downloads.push(this.download); return; } return aClick.call(this); };
  const I = W.HTMLInputElement.prototype, iClick = I.click;
  I.click = function () { if (this.type === 'file') { downloads.push('[Dateiauswahl]'); return; } return iClick.call(this); };
  W.print = () => downloads.push('[Drucken]');
  const t = D.querySelector('#toast');
  if (t) new W.MutationObserver(() => { if (!t.hidden && t.textContent) toasts.push(t.textContent.trim()); }).observe(t, { childList: true, subtree: true, characterData: true, attributes: true });
}
function fire(cmd, data = {}) {
  const b = D.createElement('button');
  b.dataset.cmd = cmd; Object.assign(b.dataset, data); b.hidden = true;
  D.body.appendChild(b); b.click(); b.remove();
}
const visible = s => { const e = D.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; };
function snap() {
  return { mode: D.body.dataset.mode, dialog: visible('#dialog'), dl: downloads.length, toast: toasts.length, props: visible('#propsdlg'), ctx: visible('#ctxmenu') };
}
function reaction(a, b) {
  const out = [];
  if (a.mode !== b.mode) out.push(`Modus ${b.mode}`);
  if (!a.dialog && b.dialog) out.push('Dialog');
  if (b.dl > a.dl) out.push(`Datei: ${downloads.slice(a.dl).join(', ')}`);
  if (b.toast > a.toast) out.push(`Hinweis: „${toasts[toasts.length - 1].slice(0, 70)}“`);
  if (!a.props && b.props) out.push('Eigenschaften');
  return out;
}
/* alles Offene schließen, bis wieder das Modell aktiv ist */
async function closeAll() {
  const key = k => D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true }));
  for (let i = 0; i < 8; i++) {
    const m = D.body.dataset.mode;
    if (m === 'model' && !visible('#dialog') && !visible('#propsdlg')) return true;
    const cancel = ['#dialog [data-cmd="cancel"]', '#dialog [data-cmd="comp-cancel"]', '[data-cmd="file-cancel"]', '#dialog [data-cmd="measure-close"]', '#dialog [data-cmd="oh-close"]', '#dialog [data-cmd="interfere-close"]', '#propsdlg [data-cmd="props-close"]'].find(s => visible(s));
    if (cancel) D.querySelector(cancel).click();
    else if (m === 'drawing') fire('drawing-close');
    else if (m === 'nesting') fire('nest-close');
    else if (m === 'render') fire('render-close');
    else if (m === 'gd') fire('gd-close');
    else if (m === 'sketch') fire('sketch-cancel');
    else if (m === 'measure') fire('measure-close');
    else key('Escape');
    await sleep(250);
    const ask = D.getElementById('askbox');
    if (ask) { const b = [...ask.querySelectorAll('button')].find(x => /Abbrechen|Verwerfen|Nein/.test(x.textContent)) || ask.querySelector('button'); b.click(); await sleep(150); }
  }
  return D.body.dataset.mode === 'model' && !visible('#dialog');
}

/* ein Befehl: aufrufen, Reaktion und Fehler festhalten, schließen */
async function tryCmd(cmd, label) {
  const errs0 = appErrorsNow();
  const a = snap();
  let crash = null;
  try { fire(cmd); } catch (err) { crash = err.message; }
  await sleep(cmd === 'drawing' || cmd === 'render' || cmd === 'nest' ? 2500 : 700);
  const b = snap(), r = reaction(a, b);
  // Schalter wieder aus – sonst rechnet jeder spätere Bau des Rundgangs die Isokurven mit
  if (cmd === 'isocurves' || cmd === 'compcolors') { fire(cmd); await sleep(200); }
  const closed = await closeAll();
  const errs = appErrorsNow().slice(errs0.length);
  const okay = !crash && !errs.length && closed;
  expect(okay, `${label}: ${crash ? 'Ausnahme ' + crash : errs.length ? 'Fehler: ' + errs.join(' | ') : !closed ? 'lässt sich nicht schließen (Modus ' + D.body.dataset.mode + ')' : r.length ? r.join(', ') : 'keine sichtbare Reaktion'}`);
}
let errLog = [];
function appErrorsNow() { return errLog.slice(); }
function watchErrors() {
  if (W.__rgErr) return;
  W.__rgErr = true;
  W.addEventListener('error', e => errLog.push(e.message));
  W.addEventListener('unhandledrejection', e => errLog.push('Promise: ' + (e.reason && e.reason.message || e.reason)));
}
async function prep(example) {
  hook(); watchErrors();
  if (example) await openExample(example); else await newDoc();
  await closeAll();
  downloads = []; toasts = [];
}

const MODEL_CMDS = ['sketch', 'extrude', 'revolve', 'sweep', 'pipe', 'loft', 'rib', 'web', 'emboss', 'splitface', 'hole', 'thread', 'boss', 'snapfit', 'coil', 'box', 'cylinder', 'sphere', 'torus', 'bound', 'boundfill', 'thicken', 'gd-open', 'pattern', 'mirror',
  'presspull', 'moveface', 'fillet', 'chamfer', 'shell', 'draft', 'combine', 'split', 'move', 'scale', 'remove', 'params', 'component', 'joint', 'align', 'insert', 'import-file', 'canvas',
  'plane', 'axis', 'point', 'measure', 'section', 'interfere', 'draftan', 'minrad', 'curvmap', 'isocurves', 'zebra', 'compcolors', 'similar', 'cog', 'solidsim', 'explode', 'bom', 'drawing', 'render', 'export-3mf', 'export-stl', 'export-step', 'face-dxf', 'overhang', 'cutlist'];
const SHEET_CMDS = ['sm_rule', 'sm_base', 'sm_contour', 'sm_flange', 'sm_bend', 'sm_convert', 'flat', 'nest'];
const STEEL_CMDS = ['frame', 'weld', 'gusset', 'endcap', 'cutlist', 'framesim'];
const ASM_CMDS = ['joint', 'jorigin', 'align', 'rigid', 'motionlink', 'move', 'interfere', 'derive', 'motion'];
const SKETCH_TOOLS = ['autodim', 'line', 'rect', 'rectc', 'circle', 'arc', 'tarc', 'polygon', 'polygonc', 'polygone', 'slotov', 'slotc', 'slotarc', 'slotarc3', 'project', 'intersect', 'ellipse', 'slot', 'spline', 'point', 'text', 'mirror',
  'cpattern', 'lpattern', 'dim', 'fillet', 'chamfer', 'trim', 'extend', 'offset', 'move', 'rotate', 'scale'];

const SCENARIOS = [
  ['Befehle im leeren Dokument', async () => { await prep(null); for (const c of [...MODEL_CMDS, ...SHEET_CMDS, ...STEEL_CMDS]) await tryCmd(c, c); }],
  ['Befehle am Volumenkörper (Winkel mit Rippe)', async () => { await prep('Winkel mit Rippe'); for (const c of MODEL_CMDS) await tryCmd(c, c); }],
  ['Blech-Befehle (Kasten Blech 2mm)', async () => { await prep('Kasten Blech 2mm'); for (const c of [...SHEET_CMDS, 'drawing', 'export-step']) await tryCmd(c, c); }],
  ['Stahlbau-Befehle (Tischgestell geschweißt)', async () => { await prep('Tischgestell geschweißt'); for (const c of [...STEEL_CMDS, 'drawing']) await tryCmd(c, c); }],
  ['Baugruppe (Beispiel-Baugruppe)', async () => { await prep('Beispiel-Baugruppe'); for (const c of [...ASM_CMDS, 'drawing']) await tryCmd(c, c); }],
  ['Skizzenwerkzeuge', async () => {
    await prep('Winkel mit Rippe');
    editTimeline(0);
    await waitFor(() => C.editor, 4000, 'Skizze offen'); await sleep(300);
    for (const t of SKETCH_TOOLS) {
      const n0 = errLog.length;
      let crash = null;
      try {
        C.editor.setTool(t); await sleep(60);
        sketchClick(5, 5); await sleep(40); sketchClick(30, 12); await sleep(40); sketchClick(18, 30); await sleep(60);
        for (let i = 0; i < 3; i++) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(40); }
        const ti = D.querySelector('.sk-textinput, #textinput'); if (ti) ti.remove();
      } catch (err) { crash = err.message; }
      const errs = errLog.slice(n0);
      expect(!crash && !errs.length && C.editor, `${t}: ${crash ? 'Ausnahme ' + crash : errs.length ? 'Fehler: ' + errs.join(' | ') : !C.editor ? 'Skizze unerwartet geschlossen' : 'ok'}`);
      if (!C.editor) { editTimeline(0); await waitFor(() => C.editor, 4000, 'Skizze offen'); }
    }
    fire('sketch-cancel'); await sleep(300); await closeAll();
  }],
  ['Zeichnung: alle Befehle', async () => {
    await prep('Winkel mit Rippe');
    fire('drawing');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const btns = [...D.querySelectorAll('#ribbon [data-cmd]')].map(b => ({ cmd: b.dataset.cmd, k: b.dataset.k, label: b.title || b.dataset.cmd }))
      .filter(b => !['drawing-close', 'drawing-print'].includes(b.cmd));
    for (const b of btns) {
      const n0 = errLog.length, d0 = downloads.length;
      try { fire(b.cmd, b.k ? { k: b.k } : {}); } catch (err) { errLog.push('Ausnahme ' + err.message); }
      await sleep(600);
      if (b.cmd === 'dopt-toggle') { fire(b.cmd, { k: b.k }); await sleep(500); }  // wieder zurück
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150);
      const errs = errLog.slice(n0);
      expect(!errs.length && D.body.dataset.mode === 'drawing', `${b.label}${b.k ? ' (' + b.k + ')' : ''}: ${errs.length ? 'Fehler: ' + errs.join(' | ') : D.body.dataset.mode !== 'drawing' ? 'Zeichnung verlassen' : downloads.length > d0 ? 'Datei ' + downloads.slice(d0).join(', ') : 'ok'}`);
      if (D.body.dataset.mode !== 'drawing') { fire('drawing'); await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung'); }
    }
    fire('drawing-close'); await sleep(400);
  }],
  ['Alle Beispiele öffnen, Zeichnung und Export', async () => {
    hook(); watchErrors();
    const files = (await (await W.fetch('/__files', { cache: 'no-store' })).json()).map(f => f.path.replace(/^\//, '')).filter(p => p.startsWith('Beispiele/')).sort();
    for (const p of files) {
      const n0 = errLog.length, name = p.replace(/^Beispiele\//, '').replace(/\.cantcodecad$/, '');
      try {
        await openExample(name);
        const bad = Object.values(C.lastBuild.status).filter(s => !s.ok).map(s => s.error);
        fire('drawing');
        await waitFor(() => D.querySelector('#drawing .sheet svg') || D.querySelector('#drawing .derr'), 30000, 'Zeichnung');
        const derr = D.querySelector('#drawing .derr');
        fire('drawing-close'); await sleep(200);
        const d0 = downloads.length;
        fire('export-step');
        try { await waitFor(() => downloads.length > d0, 20000, 'STEP-Datei'); } catch (_) { /* unten gemeldet */ }
        const errs = errLog.slice(n0);
        expect(!bad.length && !derr && !errs.length && downloads.length > d0, `${name}: ${bad.length ? 'Feature-Fehler ' + bad.join(' | ') : derr ? 'Zeichnung: ' + derr.textContent : errs.length ? 'Fehler: ' + errs.join(' | ') : downloads.length > d0 ? 'ok (' + downloads[downloads.length - 1] + ')' : 'kein STEP-Export'}`);
      } catch (err) { expect(false, `${name}: Abbruch ${err.message}`); }
      await closeAll();
    }
  }]
];

document.querySelector('#run').onclick = () => runSuite(SCENARIOS);
runSuite(SCENARIOS);
