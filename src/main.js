// cantcodecad – Steuerung: Dokument, Werkzeuge, Dialoge, Zeitleiste.
import { Kernel } from './kernel.js';
import { Viewport } from './viewport.js';
import { MATERIALS, ORIGIN_PLANES, ORIGIN_AXES, FEATURE_TYPES, TOOL_FEATURES, newDoc, uid, nextName, setDefaultNames, defaultName, isDefaultPartName, isDefaultAsmName, nextFreeName, clone, validateDoc, dependents, syncWorkPlanes, toWorld, compSubtree, compAllBodies, compPath, inferKind, partCompatible, bksAxisId, BKS_AXES, bksPlaneLabel, refOwner } from './doc.js';
import { icon } from './icons.js';
import { dimValue, renderSheet, SHEETS, SCALES, scaleLabel } from './drawing.js';
import { GDT, GDT_DATUM } from './drawing.js';
import { sheetToDxf, dxfBytes } from './drawdxf.js';
import { sheetToDwg } from './drawdwg.js';
import { sheetsToPdf } from './drawpdf.js';
import { makeZip } from './zip.js';
import { FASTENERS, lengthsFor, sizeForHole, fastenerLabel } from './fasteners.js';
import { computeFlat, flatSVG, flatDXF, flangeFlat, DEFAULT_RULE, RULE_LIBRARY, sketchDXF, skizzeAlsAbwicklung } from './sheet.js';
import { dxfToSketch } from './dxfimport.js';
import { createDxf } from './dxfwriter.js';
import { createNesting } from './nesting.js';
import { setupDrawingWorkspace } from './drawing-ws.js';
import { setupParams } from './params-ui.js';
import { createRender } from './render.js';
import { build3MF } from './export3mf.js';
import { dxfPrefs, setupDxfUi } from './dxf-ui.js';
import { setupExplode } from './explode-ui.js';
import { setupDraftAnalysis } from './draft-ui.js';
import { setupFrameSim } from './framesim-ui.js';
import { setupSolidSim } from './solidsim-ui.js';
import { setupSimilar } from './similar-ui.js';
import { setupMotion } from './motion-ui.js';
import { setupKontakt } from './kontakt-ui.js';
import { setupKunststoff } from './kunststoff-ui.js';
import { setupBlechpaket } from './blechpaket-ui.js';
import { setupAntrieb } from './antrieb-ui.js';
import { setupBomWindow } from './bom-ui.js';
import { setupFeatureDialogs } from './feature-dialogs.js';
import { setupUiBars } from './ui-bars.js';
import { setupStart, startOnLaunch } from './start-ui.js';
import { nativeCaps, isAbsPath, baseName, pickFile, readText, writeFile, filterFor, addRecent } from './files-native.js';
import { svgToSketch } from './svgimport.js';
import { FITS, fitDeviations } from './fits.js';
import { PROFILE_KINDS, FIELD_NAMES, sizeDims, profileLabel, profileArea } from './steel.js';
import { setupPrefs, applyTheme, diagnose, loadPrefs } from './prefs-ui.js';
import { startI18n, DEC, LANG, t as tr18 } from './i18n.js';
import { UNIT, UF, LEN_UNITS, setDocUnit, fmtLen, fmtLenU, fmtArea, fmtVol, fmtAng, parseLen, lenToField } from './units.js';
import { setupAiBridge } from './ai-bridge.js';
import { setupGenerativeDesign } from './gd-ui.js';
import { SketchEditor } from './sketch/editor.js';
import { Sketch3DEditor } from './sketch/editor3d.js';
import { loadSolver, solveSketch } from './sketch/solver.js';
import { autoBemassung } from './sketch/commands.js';
import { evalExpr, evalLen, isExpr, paramValues, paramUmgebung, wertMitEinheit, exprNames, validName, wantUnit, renameInExpr } from './params.js';
import { sketchRegions, selectRegions, pointInRegion } from './sketch/profiles.js';
import { emptySketchGeo, holePoints, migrateSketch } from './sketch/model.js';

/* Sprache der Oberfläche (Englisch: Übersetzer über das DOM, vor dem Aufbau der Oberfläche) */
startI18n();
if (LANG === 'en') setDefaultNames(s => tr18(s));

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => {
  if (x == null || !isFinite(x)) return '–';
  const m = 10 ** d, r = Math.round(x * m) / m;
  return String(Object.is(r, -0) ? 0 : r).replace('.', DEC);
};
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

/* ---------------- Zustand ---------------- */
// ?test (Oberflächen-Prüfstand): eigener Speicherplatz, der Arbeitsstand bleibt unberührt
const STORE = new URLSearchParams(location.search).has('test') ? 'cantcodecad.doc.test' : 'cantcodecad.doc.v1';
let doc = loadStored() || newDoc();
/* Parameterwerte zusammen mit ihrer Größe (params.js) – ein Feld prüft damit, ob ein Ausdruck die Größe hat,
   die das Feld erwartet: „flaeche“ (mm²) in einem Längenfeld ist ein Fehler, nicht still eine Zahl. */
const paramEnv = () => paramUmgebung(doc.params);
const hist = { undo: [], redo: [] };
let editing = null;        // { feature, index, isNew }
let editor = null;         // aktiver Skizzen-Editor
let mode = 'model';        // model | pickPlane | sketch | feature
let lastBuild = null;
/* Die Netzmeldung der Statuszeile, wie sie der Nachtrag aufgeschrieben hat – der Volumennachtrag
   braucht sie, um dieselbe Zeile ohne den Hinweis auf vorläufige Massen neu zu melden. */
let netzStatus = null;
/* Die Statuszeile des letzten Baus, geteilt in sichtbaren Teil und Titel. Die nachziehende
   Netzverfeinerung (siehe `kernel.onNetz`) ändert daran nur den Zusatz – ohne diese beiden Werte
   müsste sie die Zeile ein zweites Mal zusammenbauen. */
let statusZeile = '', statusTitel = '';
/* Letzter Bau für die Statuszeile: Umschalten der Diagnose zeigt sie sofort mit bzw. ohne Messwerte */
let statusBau = null;
function statusNeu() {
  if (!statusBau || lastBuild !== statusBau.res) return;
  const { res, grund } = statusBau, d = diagnose(), nb = (res.bodies || []).length;
  statusZeile = nb && d ? grund + phaseText(res.phasen) : grund;
  statusTitel = grund + (nb && d ? phaseText(res.phasen, true) : '');
  const wartet = res.netzWartet && lastBuild.netzWartet !== 0;
  setStatus(wartet ? `${statusZeile} · ${d ? `Netze grob, Verfeinerung läuft (${res.netzWartet})` : 'Netze werden verfeinert …'}` : statusZeile, statusTitel);
}
let kernelReady = false;
let buildTimer = 0, buildWunsch = 0; // Wunsch: zählt jede Bauanforderung (siehe `runBuild`)
let firstFit = true;
let sketchState = null;    // letzter Zustand aus dem Editor

function loadStored() {
  try { const s = localStorage.getItem(STORE); return s ? validateDoc(JSON.parse(s)) : null; } catch (_) { return null; }
}
function store() {
  try { localStorage.setItem(STORE, JSON.stringify(doc)); } catch (_) { /* voll oder gesperrt */ }
}
function pushHistory() {
  hist.undo.push(JSON.stringify(doc));
  if (hist.undo.length > 100) hist.undo.shift();
  hist.redo.length = 0;
  updateUndoButtons();
}
function undo() {
  if (editor) { editor.undo(); return; }
  if (editing) { cancelEditing(); return; }
  if (!hist.undo.length) return;
  hist.redo.push(JSON.stringify(doc));
  doc = JSON.parse(hist.undo.pop());
  afterDocChange();
}
function redo() {
  if (editor) { editor.redo(); return; }
  if (editing || !hist.redo.length) return;
  hist.undo.push(JSON.stringify(doc));
  doc = JSON.parse(hist.redo.pop());
  afterDocChange();
}
function afterDocChange() {
  store();
  if (mode === 'gd') queueMicrotask(() => gdRender());
  $('#docname').value = doc.name;
  updateUndoButtons();
  renderAll();
  ribbonSync();
  scheduleBuild(0);
  if (mode === 'drawing' && drawing.open && drawing.data) renderDrawing();
}
function updateUndoButtons() {
  const u = $('[data-cmd="undo"]'), r = $('[data-cmd="redo"]');
  if (!u || !r) return;
  if (editor) { u.disabled = !(sketchState && sketchState.canUndo); r.disabled = !(sketchState && sketchState.canRedo); return; }
  u.disabled = !hist.undo.length && !editing;
  r.disabled = !hist.redo.length || !!editing;
}

/* ---------------- Kern und Ansicht ---------------- */
const kernel = new Kernel();
const vp = new Viewport($('#viewport'), { onPick, onFps, onBoxSelect, onPaint: h => onPaint(h), onPaintEnd: () => onPaintEnd(), onDblPick: (h, e) => onDblPick(h, e) });
/* Bedienung (Einstellungen → Allgemein): Maus in der Ansicht, einige Tasten */
const navPrefs = { nav: loadPrefs().nav, revZoom: loadPrefs().revZoom };
vp.setNavScheme(navPrefs.nav, navPrefs.revZoom);
const gpu = vp.gpuName();
const idleStatus = () => `Einheiten ${UNIT} · Z zeigt nach oben · Grafik: ${gpu.short}`;
$('.status-right').textContent = `Einheiten ${UNIT} · Z zeigt nach oben`;
function onFps(fps) {
  const el = $('.status-right');
  el.textContent = (fps ? `${fps} Bilder/s · Grafik: ${gpu.short}` : idleStatus()) + (gpu.software ? ' · ohne Grafikkarte!' : '');
  if (gpu.software && !el.classList.contains('warn')) {
    el.classList.add('warn');
    el.title = 'Die 3D-Ansicht läuft ohne Grafikkarte (Software). Abhilfe: cantcodecad in Chrome öffnen (nicht in einer eingebetteten Ansicht), unter Einstellungen → System „Grafikbeschleunigung verwenden, wenn verfügbar“ einschalten, Chrome neu starten und unter chrome://gpu prüfen.';
  }
}
onFps(null);

/* ---------------- Diagnose ----------------
   Der lokale Server schreibt diese Meldungen nach tools/diagnose.log,
   damit Claude Fehler und Messwerte aus deinem Browser lesen kann. */
function sendDiag(obj) {
  try {
    fetch('/__diag', { method: 'POST', body: JSON.stringify({ t: new Date().toISOString(), ...obj }), keepalive: true }).catch(() => {});
  } catch (_) { /* egal */ }
}
window.addEventListener('error', e => sendDiag({ kind: 'error', msg: String(e.message), src: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error && e.error.stack }));
window.addEventListener('unhandledrejection', e => sendDiag({ kind: 'rejection', msg: String((e.reason && (e.reason.stack || e.reason.message)) || e.reason) }));

async function measureDisplay() {
  if (document.visibilityState !== 'visible') { document.addEventListener('visibilitychange', measureDisplay, { once: true }); return; }
  const rafHz = await new Promise(res => {
    let n = 0, t0 = 0;
    const f = t => { if (!t0) t0 = t; else n++; if (t - t0 < 1000) requestAnimationFrame(f); else res(n * 1000 / (t - t0)); };
    requestAnimationFrame(f);
  });
  const renderMs = vp.benchmark(30);
  const c = vp.renderer.domElement;
  const d = { kind: 'display', ua: navigator.userAgent, gpu: gpu.raw, dpr: devicePixelRatio, canvas: [c.width, c.height], rafHz: Math.round(rafHz), renderMs: Math.round(renderMs * 100) / 100, cores: navigator.hardwareConcurrency };
  window.cantcodecad.display = d;
  sendDiag(d);
  if (gpu.software) toast('Der Browser rechnet die 3D-Ansicht ohne Grafikkarte. In den Browser-Einstellungen unter System die Hardwarebeschleunigung einschalten und den Browser neu starten.', 14000);
  else if (rafHz < 45) toast(`Der Browser liefert nur ${Math.round(rafHz)} Bilder pro Sekunde, egal was cantcodecad zeichnet. Meist ist der Energiesparmodus an (Edge: Effizienzmodus, Chrome: Energiesparmodus) oder der Monitor läuft mit 30 Hz.`, 14000);
  else if (renderMs > 12) toast(`Ein Bild braucht ${fmt(renderMs, 1)} ms. Die Grafik ist langsamer als erwartet.`, 10000);
}
setTimeout(measureDisplay, 2500);

kernel.onFatal = err => setKernelState('err', 'Kern nicht verfügbar: ' + err.message);
/* Die feinen Netze kommen nach dem Bau nach (`netzVerfeinern` im Kern): die grobe Fassung einer
   großen Baugruppe ist nach einem Bruchteil der Zeit im Bild, die feine folgt, während nichts zu tun
   ist. Der Nachtrag trägt die Kennung des Baus, zu dem er gehört – ist inzwischen ein anderer Bau
   gelaufen, gehört das Netz nicht mehr zur Anzeige und wird verworfen.
   Auswahl und Analyse hängen an geometrischen Verweisen, nicht an Feldnummern, deshalb genügt nach
   dem Tausch `syncSelection()`; die Modi mit eigener Flächenbewertung (Überhang, Entformung,
   Explosion) leiten sich danach neu ab. */
kernel.onNetz = async res => {
  if (!res || !res.mesh || !lastBuild || lastBuild.bauId !== res.bauId) return;
  /* Der Nachtrag ist der Augenblick, in dem der Netzspeicher am vollsten ist – hier wird der
     Füllstand neu gemessen, damit die Zahl darunter der Wirklichkeit entspricht. */
  const nachMessen = speicherNachMessen(res.phasen);
  lastBuild.mesh = res.mesh;
  lastBuild.netzWartet = 0;
  lastBuild.netzPhasen = res.phasen;   // zum Nachmessen im Programm: cantcodecad.lastBuild.netzPhasen
  vp.setModel(res.mesh);
  syncSelection();
  if (mode === 'overhang') renderOverhang();
  if (mode === 'explode') refreshExplode();
  if (mode === 'draftan') renderDraftAnalysis();
  if (mode === 'framesim') renderFrameSim();
  if (mode === 'solidsim') renderSolidSim();
  if (mode === 'similar') refreshSimilar();
  if (nachMessen) await nachMessen;
  /* Was hier in der Statuszeile steht, gehört gemerkt: der Volumennachtrag meldet dieselbe Zeile
     noch einmal, ohne den Hinweis auf vorläufige Massen. */
  netzStatus = { bauId: res.bauId, ms: res.ms, phasen: res.phasen || {} };
  if (!diagnose()) { setStatus(statusZeile, statusTitel); return; }
  setStatus(statusZeile, statusTitel + `\nNetze verfeinert in ${res.ms} ms${phaseText(res.phasen, true)}`);
  const ph = res.phasen || {};
  console.log(`Netze verfeinert: ${res.mesh.index.length / 3} Dreiecke in ${res.ms} ms` +
    `${ph.fGleich ? ` (Flächen- und Kantenbeschreibung übernommen: ${ph.fGleich}/${ph.eGleich}, Kernanfragen ${ph.fKern})` : ''}` +
    phaseText(res.phasen, true));
  sendDiag({ kind: 'netzfein', ms: res.ms, dreiecke: res.mesh.index.length / 3, phasen: ph });
};
/* Die genauen Volumen, nachgeliefert nach der feinen Netzfassung (siehe `volumenVerfeinern` im
   Kern): das Bild hängt nicht am Volumen, und an einer großen Baugruppe sind das 22,0 s. Bis diese
   Nachricht kommt, stehen in den Feldern die aus den Dreiecken gewonnenen Werte – als vorläufig
   gekennzeichnet und in der Anzeige mit `≈` versehen. Nach der Nachricht verschwindet das Zeichen
   von selbst, weil die Felder jetzt genau sind; nachgezählt werden Massen im Körperbaum, der
   Schwerpunkt und was sich aus den Volumenfeldern ableitet. */
kernel.onVolumen = res => {
  if (!res || !lastBuild || lastBuild.bauId !== res.bauId || !lastBuild.mesh) return;
  const m = lastBuild.mesh;
  if (!m.bodies || !res.volumina) return;
  const wo = new Map(m.bodies.map(b => [b.id, b]));
  let getroffen = 0;
  for (const [id, vol] of res.volumina) {
    const mb = wo.get(id);
    if (!mb || vol == null) continue;
    mb.volume = vol; delete mb.volumeAusNetz; getroffen++;
  }
  if (!getroffen) return;
  if (m.bodies.every(b => b.volume != null)) m.volume = m.bodies.reduce((a, b) => a + (b.volume || 0), 0);
  const offen = m.bodies.reduce((a, b) => a + (b.volumeAusNetz ? 1 : 0), 0);
  if (offen) m.volumeAusNetz = offen; else delete m.volumeAusNetz;
  renderBrowser();
  /* Der Schwerpunkt ist eine Kernanfrage: sie gehört an das Ende des Durchgangs, nicht an jeden
     Abschnitt – sonst würde sie mit dem Nachtrag um den Worker streiten. */
  if (res.fertig && cogOn) refreshCog();
  if (res.fertig && diagnose()) {
    console.log(`Volumen genau nachgetragen: ${res.korper} Körper in ${res.ms} ms`);
    sendDiag({ kind: 'volumen', ms: res.ms, korper: res.korper });
    /* Die Statuszeile der Netzmeldung nennt „Massen vorläufig“, weil sie aus den Phasenzahlen des
       Nachtrags kommt. Die sind überholt: dieselbe Zeile wird ohne diesen Hinweis und mit der Zeit
       des Volumendurchgangs gemeldet. Die Phasenzahlen selbst bleiben unangetastet. */
    if (netzStatus && netzStatus.bauId === res.bauId) {
      setStatus(statusZeile, statusTitel + `\nNetze verfeinert in ${netzStatus.ms} ms` +
        phaseText({ ...netzStatus.phasen, vAusNetz: undefined }, true) +
        `\nVolumen genau nachgetragen in ${res.ms} ms (${res.korper} Körper)`);
    }
  }
};
kernel.init().then(() => {
  kernelReady = true;
  setKernelState('ok', 'Geometriekern bereit');
  scheduleBuild(0);
}).catch(err => setKernelState('err', 'Kern konnte nicht laden. Besteht eine Internetverbindung? ' + err.message));
loadSolver().catch(err => sendDiag({ kind: 'solver', msg: String(err && err.message || err) }));

function setKernelState(kind, text) {
  const el = $('#kstate');
  el.dataset.state = kind;
  el.textContent = text;
}

function buildInput() {
  const inp = buildInputRaw();
  syncWorkPlanes(inp.features);
  return inp;
}
/* Zeitleisten-Marker: null = Ende, sonst Anzahl der ausgeführten Features */
let timelinePos = null;
function setTimelinePos(p) {
  if (p != null && (p >= doc.features.length || p < 0)) p = p < 0 ? 0 : null;
  if (p === timelinePos) return;
  timelinePos = p;
  renderTimeline();
  scheduleBuild(0);
}
function buildInputRaw() {
  // Beim Bearbeiten einer Skizze wird das Modell auf den Stand davor zurückgerollt
  if (editing && editing.feature.type === 'sketch') return { features: doc.features, upTo: editing.isNew ? (timelinePos == null ? undefined : editing.index) : editing.index };
  if (!editing) return { features: doc.features, upTo: timelinePos == null ? undefined : timelinePos };
  const fs = doc.features.slice();
  if (editing.isNew) fs.splice(editing.index, 0, editing.feature);
  else fs[editing.index] = editing.feature;
  const ef = editing.feature;
  const picks = (ef.type === 'jorigin' && !ef.sel) || ['fillet', 'chamfer', 'weld', 'gusset', 'endcap', 'shell', 'defeature', 'draft', 'remove', 'combine', 'split', 'thicken', 'lippe', 'bound', 'gitter'].includes(ef.type) || (ef.type === 'sm_flange' && !(ef.edges || []).length) || ef.type === 'sm_corner' || (ef.type === 'sm_join' && (ef.edges || []).length < 2) || (ef.type === 'fastener' && !ef.edge) || ef.type === 'sm_rip' || (ef.type === 'hole' && (ef.place === 'center' || ef.place === 'edges' || ef.place === 'onedge')) || (!!editing.pickTarget && editing.pickTarget !== 'holeface' && editing.pickTarget !== 'bf-planes') || (ef.type === 'topo' && !editing.topoVorschau) || ((ef.type === 'joint' || ef.type === 'align') && !(ef.o1 && ef.o2)) || ef.type === 'thread' || ((ef.type === 'sm_convert' || ef.type === 'sm_unfold') && !ef.face) || (ef.type === 'sm_unfold' && Array.isArray(ef.bends) && !ef.bends.length);
  return { features: fs, upTo: picks ? editing.index : (editing.isNew && timelinePos != null ? editing.index + 1 : undefined) };
}

/* Vorschau für Features, bei denen am Ausgangsmodell gewählt wird (Verrundung, Fase, Wandstärke …):
   zweiter Aufbau mit dem Feature, als halbtransparente Überlagerung */
let pickPrevTimer = 0, pickPrevSeq = 0;
function schedulePickPreview() {
  clearTimeout(pickPrevTimer);
  const inp = editing && mode === 'feature' ? buildInputRaw() : null;
  const ef = editing && editing.feature;
  const hasSel = ef && ((ef.edges || []).length || (ef.faces || []).length || ef.all || ef.face || (ef.bodies || []).length);
  if (!inp || inp.upTo !== editing.index || !hasSel || ef.type === 'sketch') { vp.setPreviewMesh(null); return; }
  const seq = ++pickPrevSeq;
  pickPrevTimer = setTimeout(async () => {
    try {
      syncWorkPlanes(inp.features);
      const res = await kernel.build(inp.features, editing.index + 1, kctx());
      if (seq !== pickPrevSeq || !editing) return;
      const st = res && res.status && res.status[ef.id];
      vp.setPreviewMesh(st && st.ok && res.mesh ? res.mesh : null);
    } catch (_) { if (seq === pickPrevSeq) vp.setPreviewMesh(null); }
  }, 60);
}
function scheduleBuild(delay = 80) {
  clearTimeout(buildTimer);
  buildWunsch++;
  buildTimer = setTimeout(runBuild, delay);
}

async function runBuild() {
  if (!kernelReady) return;
  const wunsch = buildWunsch;
  const { features, upTo } = buildInput();
  $('#busy').hidden = false;
  /* Zeit des Kernpfads von der Anfrage bis zur Antwort, Warteschlange und das Zusammenschicken des
     Ergebnisses mitgerechnet, und Zeit der eigenen Arbeit danach bis das Fenster wieder frei ist. Die
     Bauzeit, die der Kern meldet (`res.ms`), sagt über beide nichts aus – ein Bedienschritt in einer
     großen Baugruppe braucht mehrere Sekunden, obwohl der Kern in Zehntelsekunden fertig ist, und ohne
     diese Aufteilung ist nicht zu sehen, wo die Sekunden hingehen. */
  const tAnfrage = performance.now();
  let antwort = null;
  try {
    const res = await kernel.build(features, upTo, kctx());
    /* Während des Baus schon ein neuer angefordert (anderes Dokument geöffnet, Rückgängig …): dieses Ergebnis
       gehört zu einem überholten Stand. Übernommen würde es Körpernamen und Zuordnungen des alten Dokuments ins
       neue schreiben und als `lastBuild` gelten, obwohl der Kern gleich das neue baut – im Prüflauf las ein
       Ablauf so die Körper des vorigen Dokuments („Körper nicht gefunden“). Der angeforderte Bau liefert. */
    if (!res || wunsch !== buildWunsch) return;
    const tAntwort = performance.now();
    antwort = {
      antwortMs: Math.round(tAntwort - tAnfrage),
      /* Wie lange dieser Auftrag im Kern gewartet hat – vom Kern selbst gemessen, mit einer Anfrage,
         die vor ihm in derselben Warteschlange liegt. */
      gewartetMs: Number.isFinite(res.gewartetMs) ? res.gewartetMs : null,
      /* Zeit, die dieser Auftrag in der Kundenwarteschlange der Seite lag (siehe `build()`): ohne sie
         wäre ein zweiter Bau kurz nach dem ersten als langes Zusammenschicken des Ergebnisses zu lesen. */
      sperreMs: Number.isFinite(res.sperreMs) ? res.sperreMs : null,
      /* Kennzeichnet einen Bau, den es nicht gab: dieselbe Eingabe wie der gerade abgeschlossene Bau
         wird nicht noch einmal durch den Kern geschickt (siehe `build()`). */
      wiederholt: !!res.wiederholt,
      oberseiteMs: 0, an: tAntwort,
    };
    res.zeit = antwort;
    lastBuild = res;
    /* Füllstand des Netzspeichers nachziehen, bevor die Statuszeile gebaut wird: beim zweiten
       Öffnen einer großen Datei gibt es keinen Nachtrag, und ohne diese Nachfrage bliebe dort die
       Startmeldung von 0 MB stehen, obwohl 446 MB im Speicher liegen. */
    const nachMessen = speicherNachMessen(res.phasen);
    const fresh = (res.bodies || []).filter(id => !(doc.bodies || {})[id]);
    nameBodies(res.bodies, res.copies, res.frames, res.welds, res.parts);
    if (assignOwnedBodies(fresh)) { store(); }
    // STEP-Importe aus älteren Dateien (vor der Gruppierung) bekommen ihre Baugruppenstruktur einmal nachträglich
    const altImport = (res.bodies || []).filter(id => { const f = doc.features.find(x => x.id === id.split(':')[0]); return f && f.type === 'import' && f.format === 'step' && !f.komp; });
    const inKomp = new Set((doc.components || []).flatMap(c => c.bodies));
    const nachholen = altImport.filter(id => !fresh.includes(id) && !altImport.some(x => x.split(':')[0] === id.split(':')[0] && inKomp.has(x)));
    if (importKomponenten([...fresh, ...nachholen], res.parts)) { store(); renderBrowser(); }
    if (stepAufbau) {
      const fid = stepAufbau, ids = (res.bodies || []).filter(b => b === fid || b.startsWith(fid + ':'));
      if (ids.length || res.status[fid]) {
        stepAufbau = null;
        // ein Teil (ein Körper): gleich mit eigenen Funktionen aufbauen; eine Baugruppe bleibt eingelesen, ihre Teile per
        // Rechtsklick „Alle Teile dieses Imports aufbauen“ (Komponenten, Instanzen und Gelenke hängen an den Körpern)
        if (ids.length === 1) setTimeout(() => stepAlsFeatures(ids), 0);
        else if (ids.length > 1) toast(`Die STEP-Datei hat ${ids.length} Körper – sie bleibt als Baugruppe eingelesen. Teile mit eigenen Funktionen aufbauen: Rechtsklick auf einen Körper → „Als Blechteil aufbauen“, „Als Skizze und Extrusion aufbauen“ oder „Alle Teile dieses Imports aufbauen“.`, 10000);
      }
    }
    if (instanzKoerper(fresh)) { store(); renderBrowser(); }
    vp.setBodyColors(bodyColorMap()); vp.setFaded(fadedBodies());
    mergeSolvedSketches(res.sketches);
    applyPointMap(res.ptMap);
    applyRefMap(res.refMap);
    refreshWorkPlanes();
    /* Zwei Teile der eigenen Arbeit getrennt gemessen: das Netz in die Anzeige bringen und den Baum
       bauen. Beides wächst mit der Zahl der Körper, aber auf verschiedene Weise – ohne die Trennung
       wäre auch nach der Messung nicht klar, welcher von beiden zu ändern ist. */
    const tModell = performance.now();
    vp.setModel(res.mesh);
    // beim Bearbeiten nicht jede Vorschau nachrechnen – der Worker wäre sonst mit den Isokurven belegt
    if (isoOn && !editing) refreshIso();
    if (firstFit && res.mesh && !editor) { firstFit = false; if (!editing) vp.view('iso'); }
    if (antwort) antwort.modellMs = Math.round(performance.now() - tModell);
    const tBaum = performance.now();
    renderTimeline();
    renderBrowser();
    if (antwort) antwort.baumMs = Math.round(performance.now() - tBaum);
    syncSelection();
    if (editing && mode === 'feature') renderFeatureDialog(false);
    if (mode === 'overhang') renderOverhang();
    if (mode === 'explode') refreshExplode();
    if (mode === 'draftan') renderDraftAnalysis();
    if (mode === 'framesim') renderFrameSim();
    if (mode === 'solidsim') renderSolidSim();
    if (mode === 'similar') refreshSimilar();
    if (cogOn) refreshCog();
    if (flatNach) flatNachBau();
    const err = Object.values(res.status).filter(s => !s.ok).length;
    const nb = res.bodies.length;
    const grund = nb
      ? `${nb > 1 ? `${nb} Körper · ` : ''}${res.mesh ? res.mesh.faces.length : 0} Flächen · ${res.mesh.edges.length} Kanten · ${res.wiederholt ? 'unverändert, ohne neue Berechnung' : `${res.ms} ms`}${err ? ` · ${err} Feature${err > 1 ? 's' : ''} mit Fehler` : ''}`
      : (features.length ? 'Noch kein Körper' : 'Leeres Teil');
    const diag = diagnose(), aufgeteilt = nb && diag ? phaseText(res.phasen, true) : '';
    // Die Unter-Aufteilung passt nicht in die 24-px-Zeile, und aus dem `title` lässt sie sich nicht
    // kopieren. Für die Messung großer Bauten steht sie deshalb in der Konsole – und als Zahlen beim
    // lokalen Server in tools/diagnose.log. Ablesen muss sie dann niemand: es geht bei jeder Messung
    // um die eine Frage, welcher Schritt als nächstes wegfallen muss.
    if (aufgeteilt.includes('davon')) {
      console.log('Bau:', grund + aufgeteilt);
      sendDiag({ kind: 'bau', ms: res.ms, koerper: nb, flaechen: res.mesh ? res.mesh.faces.length : 0, kanten: res.mesh ? res.mesh.edges.length : 0, phasen: res.phasen, netzStufe: res.netzStufe, netzWartet: res.netzWartet });
    }
    /* Zweistufiger Bau (siehe `netzVerfeinern` im Kern): die grobe Fassung ist sichtbar, die feine
       zieht nach. Der Hinweis bleibt stehen, bis der Nachtrag da ist – sonst sieht ein schneller
       Erstbau wie ein fertiger aus, und die Facetten wirken wie ein Anzeigefehler. */
    statusZeile = nb && diag ? grund + phaseText(res.phasen) : grund;
    statusTitel = grund + aufgeteilt;
    statusBau = { res, grund };
    setStatus(res.netzWartet ? (diag ? `${statusZeile} · Netze grob, Verfeinerung läuft (${res.netzWartet})` : `${statusZeile} · Netze werden verfeinert …`) : statusZeile, statusTitel);
    if (nb && !res.mesh) setStatus(`${nb} Körper, alle ausgeblendet`);
    if (nachMessen && diag) {
      /* Auf den Füllstand des Dauerspeichers wird hier bewusst nicht gewartet: er ist eine Zahl im
         Hinweis, und die Abfrage braucht bei vollem Netzspeicher Sekunden – ein Messlauf zeigte 4,4 s
         „Oberfläche danach“, während das Netz in 0,2 s in der Anzeige stand und der Baum 0,0 s brauchte.
         Ist die Abfrage fertig, wird der Hinweis nachgezogen, solange dieser Bau noch der letzte ist. */
      const tFuell = performance.now();
      nachMessen.then(() => {
        if (antwort) antwort.speicherMs = Math.round(performance.now() - tFuell);
        if (lastBuild !== res || !diagnose()) return;
        statusTitel = grund + phaseText(res.phasen, true);
        setStatus(statusZeile, statusTitel);
      }).catch(() => { /* die Abfrage ist Zusatz, nichts hält deshalb etwas auf */ });
    }
  } catch (e) {
    setStatus('Fehler im Kern: ' + e.message);
  } finally {
    /* Die eigene Arbeit bis hierher wird gemessen, bevor das Fenster als frei gilt: der Bedienschritt
       ist erst zu Ende, wenn Oberfläche und Statuszeile durch sind, nicht schon mit der Antwort. */
    if (antwort) antwort.oberseiteMs = Math.round(performance.now() - antwort.an);
    $('#busy').hidden = true;
  }
}

function setStatus(t, titel = t) { const el = $('#status-left'); el.textContent = t; el.title = titel; }

/* Ob der Browser den Dauerspeicher des Kerns behalten darf. Ohne die dauerhafte Erlaubnis ist der
   Netzspeicher gewöhnlicher best-effort-Speicher und darf bei Platzmangel geräumt werden – gemessen
   an der großen Baugruppe: mit vollständigem Speicher 8,6 s für die zweite Öffnung, mit geräumtem
   20 s, weil 595 von 797 Netzen neu gerechnet werden mussten. `persist()` wird ohne Nutzeraktion
   selten gewährt (gemessen: false), deshalb fragen wir beim Start und noch einmal bei der ersten
   echten Bedienung. Gefragt wird hier und nicht im Kern: im Worker fehlt `navigator.storage.persist`
   (gemessen), und der Kern soll von alledem nichts wissen. */
const speicher = { dauerhaft: false, benutzt: 0, kontingent: 0, angefragt: 0, gemessen: 0 };
async function speicherPruefen(mitAnfrage = true) {
  try {
    const st = navigator.storage;
    if (!st || !st.estimate) return;
    if (mitAnfrage && st.persist) { speicher.dauerhaft = await st.persist(); speicher.angefragt++; }
    const sch = await st.estimate();
    speicher.benutzt = sch.usage || 0; speicher.kontingent = sch.quota || 0;
    speicher.gemessen = Date.now();
  } catch (_) { /* die Abfrage ist Zusatz, nichts hält deshalb einen Bau auf */ }
}
/* Füllstand nach einem Bau neu messen: direkt nach dem Start meldet `estimate()` 0 MB, obwohl der
   Netzspeicher gefüllt ist (gemessen: 0 MB bei 446 MB Bestand). Ohne diese Nachfrage stünde eine
   Zahl in der Statuszeile, die nicht stimmt. Nur bei Bauten, die den Netzspeicher berührt haben,
   und nicht öfter als alle zehn Sekunden – die Abfrage ist Zusatzarbeit. */
function speicherNachMessen(p) {
  if (!p || (!p.dbGesetzt && !p.dbBestand)) return null;
  /* Die Abfrage beim Start meldet 0 MB – sie taugt nicht als Füllstand und darf deshalb auch nicht
     als „bereits gemessen“ zählen. Echte Messungen werden nur alle zehn Sekunden wiederholt. */
  if (speicher.benutzt && Date.now() - speicher.gemessen < 10000) return null;
  return speicherPruefen(false);
}
function speicherAnfordern() {
  speicherPruefen();
  if (!navigator.storage || !navigator.storage.persist) return;
  // Zweite Chance mit Nutzeraktion: ohne Eingabe lehnt der Browser erfahrungsgemäß ab.
  const beiBedienung = () => {
    removeEventListener('pointerdown', beiBedienung); removeEventListener('keydown', beiBedienung);
    if (!speicher.dauerhaft) speicherPruefen();
  };
  addEventListener('pointerdown', beiBedienung); addEventListener('keydown', beiBedienung);
}

/* Bauzeiten je Phase (nur Diagnose, kein Verhalten): der Kern misst Import und Vernetzung getrennt,
   weil `ms` alles verbirgt, was vor dem Bauverlauf liegt. In der Statuszeile stehen die Beträge der
   großen Schritte, die Aufteilung darunter (detailliert) nur im Titel – die Zeile ist 24 px hoch, und
   sonst wäre ausgerechnet der Teil abgeschnitten, um den es geht. Gezeigt wird ab 50 ms. */
function phaseText(p, detailliert = false) {
  if (!p) return '';
  const ms = v => Math.round(v || 0);
  const mb = v => `${((v || 0) / 1e6).toFixed(0)} MB`;
  const importSumme = ms(p.datei) + ms(p.uebersetzen) + ms(p.fallback) + ms(p.stl) + ms(p.laden) + ms(p.binLesen) + ms(p.sichern);
  const teile = [];
  if (importSumme >= 50) {
    const schritte = [];
    if (ms(p.datei)) schritte.push(`Datei ${fmt(p.datei, 0)}`);
    if (ms(p.uebersetzen)) schritte.push(`Übersetzen ${fmt(p.uebersetzen, 0)}`);
    if (ms(p.fallback)) schritte.push(`Kern-Import ${fmt(p.fallback, 0)}`);
    if (ms(p.stl)) schritte.push(`STL ${fmt(p.stl, 0)}`);
    if (ms(p.laden) + ms(p.binLesen)) schritte.push(`Cache lesen ${fmt(p.laden + p.binLesen, 0)}`);
    if (ms(p.sichern)) schritte.push(`Cache sichern ${fmt(p.sichern, 0)}`);
    teile.push(`Import ${fmt(importSumme, 0)} ms (${schritte.join(' · ')})${p.wurzeln ? ` · ${p.wurzeln} Körper in der Datei` : ''}`);
  }
  const netzSumme = ms(p.netze) + ms(p.dbLesen) + ms(p.dbSichern);
  if (netzSumme >= 50) {
    const z = [];
    if (p.netzeNeu) z.push(`${p.netzeNeu} neu`);
    if (p.netzeAusCache) z.push(`${p.netzeAusCache} aus Speicher`);
    if (p.netzeAusDB) z.push(`${p.netzeAusDB} aus Dauerspeicher`);
    /* Nachtrag: die feinen Netze der selbst geformten Körper (ohne Netz-Schlüssel, also in keinem
       Bestand wiederzufinden) kommen aus dem Bau selbst. Ohne diesen Weg würden sie in der
       Verfeinerung ein zweites Mal trianguliert. */
    if (p.netzeAusBau) z.push(`${p.netzeAusBau} aus diesem Bau`);
    // Verdrängt und deshalb trotzdem neu trianguliert: dieser Fall hat 595 von 797 Netzen einer
    // Baugruppe unnötig neu erzeugt und war in den bisherigen Zahlen nicht zu sehen.
    if (p.netzVerdraengt) z.push(`${p.netzVerdraengt} Netze verdrängt und neu gerechnet`);
    /* Zweistufige Netzerzeugung: `grob` heißt, dass diese Zahlen die Erstfassung beschreiben und die
       feine Fassung noch läuft. Ohne diesen Hinweis ist ein schneller Erstbau nicht von einer
       fehlgeschlagenen Verfeinerung zu unterscheiden. `dbGrob` zählt die Körper, deren grobes Netz
       aus dem Dauerspeicher für die feine Fassung neu gerechnet werden musste. */
    if (p.netzStufe === 'grob') z.push(`${p.netzWartet || 0} Körper grob – feine Fassung folgt`);
    // Die grobe Fassung rechnet Volumen aus dem Netz (siehe `netzVolumen`): unter einem Prozent
    // Abstand, aber eine Zahl, die mit der feinen Fassung noch wandert, soll das auch sagen.
    if (p.vAusNetz) z.push(`${p.vAusNetz} Volumen aus dem Netz – Massen vorläufig`);
    if (p.dbGrob) z.push(`${p.dbGrob} grobe Netze neu gerechnet`);
    // Flächen, die der Mescher auch nachgefragt nicht vernetzt: in der Anzeige sind das Löcher,
    // deren Kanten aber gezeichnet werden. Nur wenn es vorkommt, und dann soll es auffallen.
    if (p.fOhneNetz) z.push(`${p.fOhneNetz} Flächen ohne Dreiecke`);
    // Was nicht gespeichert wurde, ist für die nächste Öffnung wirksam – das gehört in die Zeile.
    if (p.dbFehl) z.push(`${p.dbFehl} Netze nicht gespeichert`);
    else if (p.netzeNeu && !p.dbBestand && !p.dbGesetzt) z.push('Dauerspeicher leer');
    /* Der Dauerspeicher ist nur dann ein Gewinn, wenn er bis zur nächsten Öffnung bleibt. Ohne die
       dauerhafte Erlaubnis des Browsers darf er bei Platzmangel geräumt werden – dann ist jede
       zweite Öffnung wieder eine erste (gemessen 8,6 s gegen 52,6 s). Aufgefallen als Netzspeicher,
       der Netze enthält, aber genau diese Netze nicht mehr hat: der Bestand ist da, die Datei
       trotzdem wieder bei null. Das soll nicht unbemerkt bleiben, weil es sonst wie ein plötzlicher
       Geschwindigkeitsverlust aussieht. */
    if (speicher.angefragt && !speicher.dauerhaft && p.dbFehlt && p.dbBestand)
      z.push('Netze ohne dauerhafte Erlaubnis – der Browser darf sie räumen');
    if (detailliert) {
      const u = [];
      if (ms(p.huelle)) u.push(`Hüllbox ${fmt(p.huelle, 0)}${p.huelleFallback ? ` (${p.huelleFallback}× exakt gefragt)` : ''}`);
      if (ms(p.gitter)) u.push(`Dreiecke ${fmt(p.gitter, 0)}`);
      if (ms(p.kantennetz)) u.push(`Kantenlinien ${fmt(p.kantennetz, 0)}`);
      if (ms(p.netzLuecken)) u.push(`Flächen nachgefragt ${fmt(p.netzLuecken, 0)} (${p.fFlicken || 0} geflickt${p.fOhneNetz ? `, ${p.fOhneNetz} ohne Dreiecke geblieben` : ''})`);
      if (ms(p.flaecheninfo)) {
        // Der Anteil kernfreier Flächen entscheidet, was die Flächenbeschreibung kostet – ohne diese
        // Zahlen ist der Gewinn an einer großen Baugruppe nicht nachvollziehbar.
        const a = (p.fEben || p.fGewellt || p.fKern) ? ` (${p.fEben} ebene und ${p.fGewellt || 0} gekrümmte Flächen aus dem Netz, ${p.fKern} aus dem Kern${p.fNotfall ? `, davon ${p.fNotfall} notfallweise` : ''}${p.fGleich ? `, ${p.fGleich} übernommen` : ''})` : '';
        u.push(`Flächenbeschreibung ${fmt(p.flaecheninfo, 0)}${a}`);
      }
      if (ms(p.kanteninfo)) u.push(`Kantenbeschreibung ${fmt(p.kanteninfo, 0)}${p.eGleich ? ` (${p.eGleich} übernommen)` : ''}`);
      if (ms(p.volumen)) u.push(`Volumen ${fmt(p.volumen, 0)}${p.vAusNetz ? ` (${p.vAusNetz} aus dem Netz)` : ''}`);
      if (ms(p.umwandeln)) u.push(`Zahlenfelder ${fmt(p.umwandeln, 0)}`);
      if (ms(p.dbLesen)) {
        // Die drei Wege, die bei einer großen Baugruppe 70 s Triangulation bedeuten können: Körper
        // ohne Schlüssel (der Dauerspeicher kann ihnen nicht helfen), gefragte Schlüssel, die nicht
        // da sind, und Einträge, die da sind aber kein Netz enthalten.
        const d = [`${p.netzeAusDB} von ${p.dbGefragt || p.netzeAusDB + p.dbFehlt} gefunden`];
        if (p.dbFehlt) d.push(`${p.dbFehlt} nicht vorhanden`);
        if (p.dbUnbrauchbar) d.push(`${p.dbUnbrauchbar} Eintrag ohne Netz`);
        if (p.netzeOhneSchluessel) d.push(`${p.netzeOhneSchluessel} Körper ohne Schlüssel`);
        d.push(`Bestand ${p.dbBestand}`);
        u.push(`Dauerspeicher lesen ${fmt(p.dbLesen, 0)} (${d.join(', ')})`);
      }
      if (ms(p.dbSichern)) u.push(`Dauerspeicher schreiben ${fmt(p.dbSichern, 0)} (${p.dbGesetzt} von ${p.dbGesetzt + p.dbFehl}, ${mb(p.dbBytes)}${p.dbVerworfen ? `, ${p.dbVerworfen} alte verworfen` : ''}${p.dbBestandNach ? `, Bestand danach ${p.dbBestandNach}` : ''})`);
      // Füllstand und Erlaubnis des Browsers: ab hier ist zu sehen, ob die Netze einer großen Datei
      // beim nächsten Öffnen noch da sind.
      if (speicher.gemessen) u.push(`Dauerspeicher beim Browser ${speicher.dauerhaft ? 'dauerhaft angemeldet' : 'ohne dauerhafte Erlaubnis'} (${mb(speicher.benutzt)} von ${mb(speicher.kontingent)})`);
      if (u.length) z.push(`davon ${u.join(' · ')}`);
    }
    teile.push(`Netze ${fmt(netzSumme, 0)} ms${z.length ? ` (${z.join(', ')})` : ''}`);
  }
  if (ms(p.mischen) >= 50) teile.push(`Netze zusammenfügen ${fmt(p.mischen, 0)} ms`);
  return teile.length ? ` · ${teile.join(' · ')}` : '';
}

/* ---------------- Körper (Namen und Sichtbarkeit gehören zum Dokument) ---------------- */
function bodyInfo(id) {
  if (!doc.bodies) doc.bodies = {};
  return doc.bodies[id] || null;
}
function kctx() { return { hidden: hiddenBodies(), components: compsPayload(), inserts: doc.inserts || [], sheet: sheetRule() }; }
function sheetRule() { return { ...DEFAULT_RULE, ...(doc.sheet || {}) }; }
function compsPayload() { return (doc.components || []).map(c => ({ id: c.id, bodies: compAllBodies(doc, c.id), ...(c.instanz && (doc.components || []).some(o => o.id === c.instanz.von) ? { instanz: c.instanz } : {}) })); }
function compOf(bodyId) {
  if (bodyId && bodyId.includes('/')) return bodyId.split('/')[0];
  const c = (doc.components || []).find(x => x.bodies.includes(bodyId)); return c ? c.id : null;
}
function compName(id) {
  const c = (doc.components || []).find(x => x.id === id) || (doc.inserts || []).find(x => x.id === id);
  return c ? c.name : 'Komponente fehlt';
}
function insertBodies(insId) { return ((lastBuild && lastBuild.bodies) || []).filter(id => id.startsWith(insId + '/')); }
/* Körper eines eingefügten Teils: Name und Material kommen aus dem Teil */
function insertBodyDefaults(id) {
  const [insId, bid] = [id.slice(0, id.indexOf('/')), id.slice(id.indexOf('/') + 1)];
  const ins = (doc.inserts || []).find(x => x.id === insId);
  const pb = ins && ins.part.bodies ? ins.part.bodies[bid.split('/')[0]] : null;
  return { name: `${ins ? ins.name : 'Teil'}: ${pb ? pb.name : 'Körper'}`, hidden: false, material: pb ? pb.material || 'none' : 'none', color: pb ? pb.color || '' : '' };
}
function hiddenBodies() { return Object.entries(doc.bodies || {}).filter(([, b]) => b.hidden).map(([id]) => id); }
/* Neue Körper bekommen beim ersten Auftauchen einen festen Namen */
/* Nachgeführte Bezüge (Kern fand eine verschobene Fläche/Kante) ins Dokument übernehmen, damit sie beim nächsten Mal exakt passen */
/* Arbeitspunkte/-ebenen/-achsen, deren Punkte der Kern an Körperecken mitgeführt hat */
function applyPointMap(map) {
  if (!map || !Object.keys(map).length) return;
  let n = 0;
  const set = f => {
    if (!f || !map[f.id]) return;
    const m = map[f.id];
    // Verschieben „Punkt zu Punkt": Lage der beiden Punkte merken, damit der nächste Aufbau denselben Eckpunkt meint
    if (m.from || m.to) { ['from', 'to'].forEach(k => { if (f[k] && m[k] && JSON.stringify(f[k]) !== JSON.stringify(m[k])) { f[k] = m[k]; n++; } }); return; }
    // Benutzerkoordinatensystem: der angeklickte Ursprungpunkt wurde an einer Körperecke nachgeführt
    if (m.originP) { if (f.originP && JSON.stringify(f.originP) !== JSON.stringify(m.originP)) { f.originP = m.originP; n++; } return; }
    // Arbeitspunkte/-ebenen/-achsen: der Kartenwert ist die Basis selbst
    if (f.base && JSON.stringify(f.base) !== JSON.stringify(m)) { f.base = m; n++; }
  };
  doc.features.forEach(set);
  if (editing) set(editing.feature);
  if (n) { store(); refreshWorkPlanes(); }
}
function applyRefMap(map) {
  if (!map || !Object.keys(map).length) return;
  let n = 0;
  const fix = r => { if (!r || typeof r !== 'object') return r; const k = JSON.stringify(r); if (map[k]) { n++; return map[k]; } return r; };
  const walk = f => {
    if (Array.isArray(f.edges)) f.edges = f.edges.map(e => (e && e.ref ? { ...e, ref: fix(e.ref) } : fix(e)));
    if (Array.isArray(f.faces)) f.faces = f.faces.map(fix);
    if (f.face) f.face = fix(f.face);
    if (f.toFace) f.toFace = fix(f.toFace);
    if (f.startRef) f.startRef = fix(f.startRef);
    ['o1', 'o2'].forEach(k => { if (f[k] && f[k].ref) f[k] = { ...f[k], ref: fix(f[k].ref) }; });
    if (f.base && Array.isArray(f.base.refs)) f.base.refs = f.base.refs.map(r => (r && r.e ? { ...r, e: fix(r.e) } : r));
    if (f.base && f.base.ref && f.base.ref.e) f.base.ref = { ...f.base.ref, e: fix(f.base.ref.e) };
  };
  doc.features.forEach(walk);
  if (editing && editing.feature) walk(editing.feature);
  if (n) store();
}
function nameBodies(ids, copies = {}, frames = [], welds = [], parts = []) {
  if (!doc.bodies) doc.bodies = {};
  let changed = false;
  const used = new Set(Object.values(doc.bodies).map(b => b.name));
  const frameOf = new Map((frames || []).map(x => [x.id, x]));
  (ids || []).forEach(id => {
    if (doc.bodies[id]) return;
    if (id.includes('/') && !id.includes(':')) { doc.bodies[id] = insertBodyDefaults(id); changed = true; return; }
    const dv = doc.features.find(x => x.type === 'derive' && id.startsWith(x.id + ':'));
    const dvb = dv && (dv.part && dv.part.bodies || {})[id.slice(dv.id.length + 1)];
    if (dvb) {
      const pb = dvb;
      let name = pb.name || 'Körper', k = 2; while (used.has(name)) name = `${pb.name || 'Körper'} (${k++})`;
      doc.bodies[id] = { name, hidden: false, material: pb.material || 'none', color: pb.color || '' };
      used.add(name); changed = true; return;
    }
    // Kopie einer Instanz: Name, Werkstoff und Farbe des Originalkörpers
    const tilde = id.indexOf('~');
    if (tilde > 0 && doc.bodies[id.slice(tilde + 1)]) {
      const src = doc.bodies[id.slice(tilde + 1)];
      doc.bodies[id] = { name: src.name, hidden: false, ...(src.material ? { material: src.material } : {}), ...(src.color ? { color: src.color } : {}) };
      changed = true; return;
    }
    const pm = (parts || []).find(x => x.id === id);
    if (pm && pm.importName) {
      // Name und Farbe aus der STEP-Datei (Teilename); mehrfach eingebaute Teile „Name (2)“ …
      let name = pm.base, n = 2; while (used.has(name)) name = `${pm.base} (${n++})`;
      doc.bodies[id] = { name, hidden: false, ...(pm.color ? { color: pm.color } : {}) }; // Farbe aus der Datei
      used.add(name); changed = true; return;
    }
    if (pm && pm.fastener) {
      let name = pm.base, n = 2; while (used.has(name)) name = `${pm.base} (${n++})`;
      doc.bodies[id] = { name, hidden: false, material: 'steel', color: '#9aa3ad' };
      used.add(name); changed = true; return;
    }
    if (pm) {
      let n = 1; while (used.has(`${pm.base} ${n}`)) n++;
      doc.bodies[id] = { name: `${pm.base} ${n}`, hidden: false, material: 'steel', color: '' };
      used.add(`${pm.base} ${n}`); changed = true; return;
    }
    if ((welds || []).some(w => w.id === id)) {
      let n = 1; while (used.has('Naht ' + n)) n++;
      doc.bodies[id] = { name: 'Naht ' + n, hidden: false, material: 'steel', color: '#c9a227' };
      used.add('Naht ' + n); changed = true; return;
    }
    if (frameOf.has(id)) {
      // Rahmenstäbe heißen „Stab 1“ … und sind aus Stahl
      let n = 1; while (used.has('Stab ' + n)) n++;
      doc.bodies[id] = { name: 'Stab ' + n, hidden: false, material: 'steel', color: '' };
      used.add('Stab ' + n); changed = true; return;
    }
    // Kopien heißen „Name (1)“ und behalten Werkstoff und Farbe
    const src = copies[id] && doc.bodies[copies[id]];
    let name;
    if (src) { let n = 1; while (used.has(`${src.name} (${n})`)) n++; name = `${src.name} (${n})`; }
    else { let n = 1; while (used.has('Körper' + n)) n++; name = 'Körper' + n; }
    doc.bodies[id] = { name, hidden: false, ...(src && src.material ? { material: src.material } : {}), ...(src && src.color ? { color: src.color } : {}) };
    used.add(name);
    changed = true;
  });
  if (changed) store();
}
function bodyColor(b) { return (b && (b.color || (MATERIALS[b.material] || MATERIALS.none).color)) || MATERIALS.none.color; }
/* Körper außerhalb der aktiven Komponente (werden durchscheinend gezeigt) */
function fadedBodies() {
  if (!doc.activeComp || !(doc.components || []).some(c => c.id === doc.activeComp)) return [];
  const own = new Set(compAllBodies(doc, doc.activeComp));
  return ((lastBuild && lastBuild.bodies) || []).filter(id => !own.has(id));
}
function bodyColorMap() {
  const o = {};
  Object.entries(doc.bodies || {}).forEach(([id, b]) => { o[id] = bodyColor(b); });
  // „Komponentenfarben anzeigen“ (Prüfen): jede Komponente eine eigene Farbe, Körper ohne Komponente wie gewohnt
  if (compColorsOn) Object.keys(o).forEach(id => { const c = compOf(id); if (c) o[id] = compColor(c); });
  // Generatives Design: Rollen der Körper in Signalfarben (grün/rot/gelb, der Rest grau)
  const gdf = typeof gdFarben === 'function' && gdFarben();
  if (gdf) Object.assign(o, gdf);
  return o;
}
let compColorsOn = false;
const compColor = id => {
  // Farbton nach der Reihenfolge der Komponenten im Goldenen Winkel verteilt – Nachbarn unterscheiden sich deutlich
  const all = [...(doc.components || []).map(c => c.id), ...(doc.inserts || []).map(c => c.id)], i = Math.max(0, all.indexOf(id));
  const h = (i * 137.508 + 20) % 360, s = 0.65, l = 0.55, k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
};
function fmtMass(g) { return g >= 1000 ? `${fmt(g / 1000, 3)} kg` : `${fmt(g, 1)} g`; }
let openBody = null;
function setBodyProp(id, k, v) {
  const b = bodyInfo(id);
  if (!b) return;
  pushHistory();
  b[k] = v;
  if (k === 'material') b.color = '';
  store();
  vp.setBodyColors(bodyColorMap()); vp.setFaded(fadedBodies());
  if (k === 'material' && cogOn) refreshCog();
  renderBrowser();
}
function bodyName(id) { const b = bodyInfo(id); return b ? b.name : 'Körper'; }
/* Körper, die es vor dem bearbeiteten Feature gibt (meldet der Kern je Feature) */
function bodiesBefore(f) {
  const st = lastBuild && lastBuild.status[f.id];
  if (st && st.before) return st.before;
  if (!lastBuild || !lastBuild.bodies) return [];
  return lastBuild.bodies.filter(id => id !== f.id && !id.startsWith(f.id + ':'));
}
/* Auswahl von Körpern als Chips; field = 'targets' (leer = automatisch) oder 'bodies' */
function bodyChips(f, field) {
  const ids = bodiesBefore(f), sel = f[field] || [];
  const auto = field === 'targets' ? `<button type="button" class="chip" data-cmd="targets-auto" aria-pressed="${!sel.length}">Automatisch</button>` : '';
  const chips = ids.map(id => `<button type="button" class="chip" data-cmd="body-pick" data-field="${field}" data-id="${esc(id)}" aria-pressed="${sel.includes(id)}">${icon('body', 14)} ${esc(bodyName(id))}</button>`).join('');
  const missing = sel.filter(id => !ids.includes(id)).length;
  return `<div class="btns bchips" data-field="${field}">${auto}${chips || '<span class="info">Noch keine Körper</span>'}${missing ? `<span class="info">${missing} fehlt</span>` : ''}</div>`;
}
function compChips(f) {
  const comps = [...(doc.components || []), ...(doc.inserts || [])], sel = f.comps || [];
  if (!comps.length) return '<span class="info">Noch keine Komponenten</span>';
  return `<div class="btns bchips cchips">${comps.map(c => `<button type="button" class="chip" data-cmd="comp-pick" data-id="${esc(c.id)}" aria-pressed="${sel.includes(c.id)}">${icon('component', 14)} ${esc(c.name)}</button>`).join('')}</div>`;
}
function bodyIdAtFace(info) {
  const m = lastBuild && lastBuild.mesh;
  const b = m && info && m.bodies[info.body];
  return b ? b.id : null;
}
/* Massenmittelpunkt aller sichtbaren Körper (Prüfen → Massenmittelpunkt): nach Masse gewichtet (Material), Körper ohne
   Material zählen mit ihrem Volumen (Dichte 1). Bleibt eingeschaltet und rechnet nach jedem Aufbau neu. */
let cogOn = false, cog = null, cogSeq = 0;
async function refreshCog(say = false) {
  if (!cogOn) { cog = null; vp.setCog(null); return; }
  const seq = ++cogSeq, ids = ((lastBuild && lastBuild.bodies) || []).filter(id => !(bodyInfo(id) || {}).hidden);
  if (!ids.length) { cog = null; vp.setCog(null); if (say) toast('Kein sichtbarer Körper.'); return; }
  let m = 0, s = [0, 0, 0], noMat = 0;
  for (const id of ids) {
    let r;
    try { r = await kernel.props(id); } catch (_) { continue; }
    if (seq !== cogSeq) return;
    const rho = (MATERIALS[(bodyInfo(id) || {}).material] || MATERIALS.none).rho;
    if (!rho) noMat++;
    const w = r.volume / 1000 * (rho || 1);
    m += w; s = s.map((v, k) => v + w * r.com[k]);
  }
  if (!(m > 0)) return;
  cog = { p: s.map(v => v / m), mass: noMat === ids.length ? null : m, bodies: ids.length, noMat };
  vp.setCog(cog.p);
  if (say) toast(`Massenmittelpunkt X ${fmtLen(cog.p[0], 2)} · Y ${fmtLen(cog.p[1], 2)} · Z ${fmtLen(cog.p[2], 2)} ${UNIT}${cog.mass ? ` · Masse ${fmtMass(cog.mass)}` : ''}${noMat ? ` (${noMat} Körper ohne Material: nach Volumen gewichtet)` : ''}`, 8000);
}
function toggleCog() {
  cogOn = !cogOn;
  $$('#ribbon [data-cmd="cog"]').forEach(b => b.setAttribute('aria-pressed', String(cogOn)));
  refreshCog(true);
}
function toggleBody(id) {
  const b = bodyInfo(id);
  if (!b) return;
  b.hidden = !b.hidden;
  store();
  renderBrowser();
  scheduleBuild(0);
}
function renameBody(id, el) {
  const b = bodyInfo(id);
  if (!b) return;
  const span = el.querySelector('span');
  const inp = document.createElement('input');
  inp.className = 'b-rename';
  inp.value = b.name;
  inp.spellcheck = false;
  span.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    const v = inp.value.trim().slice(0, 60);
    if (ok && v && v !== b.name) { pushHistory(); b.name = v; store(); }
    renderBrowser();
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}

/* Skizzen mit projizierten Bezügen hat der Kern neu gelöst: Ergebnis übernehmen */
function mergeSolvedSketches(map) {
  if (!map) return;
  let changed = false;
  Object.entries(map).forEach(([id, geo]) => {
    if (editing && editing.feature.id === id) return;
    const f = doc.features.find(x => x.id === id);
    if (!f) return;
    const a = JSON.stringify({ p: f.points, c: f.curves }), b = JSON.stringify({ p: geo.points, c: geo.curves });
    if (a === b) return;
    f.points = geo.points;
    f.curves = geo.curves;
    changed = true;
  });
  if (changed) { store(); renderSketchesInView(); }
}

/* ---------------- Arbeitsebenen ---------------- */
function featuresWithDraft() {
  const fs = doc.features.slice();
  if (editing && editing.feature.type !== 'sketch') {
    if (editing.isNew) fs.splice(editing.index, 0, editing.feature); else fs[editing.index] = editing.feature;
  }
  return fs;
}
function refreshWorkPlanes() {
  const fs = featuresWithDraft();
  const planes = syncWorkPlanes(fs);
  const act = editing && ['plane', 'bks'].includes(editing.feature.type) ? editing.feature.id : null;
  /* Ebenen zum Anklicken: Arbeitsebenen wie bisher, ein BKS gibt drei (XY, YZ, ZX) */
  const wpl = [];
  fs.forEach(f => {
    if (f.type === 'plane' && planes.has(f.id)) wpl.push({ id: f.id, name: f.name, plane: planes.get(f.id), active: f.id === act });
    else if (f.type === 'bks') ['', 'x', 'y'].forEach(k => {
      const id = k ? bksAxisId(f.id, k) : f.id;   // dieselbe ID-Form wie die Achsen, hier für die Ebene
      if (planes.has(id)) wpl.push({ id, name: bksPlaneLabel(f.name, k), plane: planes.get(id), active: f.id === act });
    });
  });
  vp.setWorkPlanes(wpl);
  /* Aufkleber (Ansichtsbereich auf einer ebenen Körperfläche): Ebene durch die Flächenmitte,
     0,02 mm über der Fläche gegen Flimmern; x waagrecht in der Fläche (bei waagrechter Fläche entlang X) */
  const facePlane = r => {
    const n = vnorm(r.n), up = Math.abs(n[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
    let x = vnorm(vcross(up, n)); if (Math.abs(n[2]) > 0.999) x = [1, 0, 0];
    const y = vcross(n, x);
    return { o: [r.p[0] + n[0] * 0.02, r.p[1] + n[1] * 0.02, r.p[2] + n[2] * 0.02], x, y, n };
  };
  vp.setCanvases(fs.filter(f => f.type === 'canvas' && !f.suppressed && f.img && (f.cplane !== 'face' || (f.face && f.face.n))).map(f => {
    const pl = f.cplane === 'face' ? facePlane(f.face) : ORIGIN_PLANES[f.cplane || 'XY'] || ORIGIN_PLANES.XY, w = Number(f.w) > 0 ? Number(f.w) : 100;
    return { id: f.id, plane: pl, img: f.img, w, h: w * (Number(f.ar) > 0 ? Number(f.ar) : 1), cx: Number(f.cx) || 0, cy: Number(f.cy) || 0, rot: Number(f.rot) || 0, opacity: Math.max(0.05, Math.min(1, Number(f.opacity) || 0.6)) };
  }));
  vp.setWorkPoints(fs.filter(f => (f.type === 'point' || f.type === 'bks') && planes.points.has(f.id)).map(f => ({ id: f.id, name: f.name, p: planes.points.get(f.id), active: !!editing && editing.feature.id === f.id })));
  const jo = fs.filter(f => f.type === 'jorigin' && !f.suppressed && lastBuild && lastBuild.status[f.id] && lastBuild.status[f.id].frame).map(f => ({ id: f.id, name: f.name, axis: lastBuild.status[f.id].frame, active: !!editing && editing.feature.id === f.id }));
  /* Achsen des Benutzerkoordinatensystems: X/Y/Z als farbige Pfeile, anklickbar wie Arbeitsachsen */
  const bksAx = fs.filter(f => f.type === 'bks').flatMap(f => BKS_AXES.map(k => bksAxisId(f.id, k)).filter(id => planes.axes.has(id)).map(id => ({ id, name: planes.axes.get(id).label, axis: planes.axes.get(id), tag: id.slice(id.lastIndexOf(':') + 1).toUpperCase(), active: !!editing && editing.feature.id === f.id })));
  vp.setWorkAxes(fs.filter(f => f.type === 'axis' && planes.axes.has(f.id)).map(f => ({ id: f.id, name: f.name, axis: planes.axes.get(f.id), active: !!editing && editing.feature.id === f.id })).concat(bksAx, jo));
  return planes;
}
function planeLabel(ref) {
  if (!ref) return '–';
  if (ref.kind === 'origin') return ORIGIN_PLANES[ref.key] ? ORIGIN_PLANES[ref.key].label : ref.key;
  if (ref.kind === 'face') return 'Ebene Fläche des Körpers';
  if (ref.kind === 'points') return `${(ref.pts || []).length} von 3 Punkten`;
  if (ref.kind === 'tangent') return ref.p ? `Tangential an Zylinder Ø${fmt(2 * ref.r, 2)}` : 'Zylinderfläche anklicken …';
  if (ref.kind === 'edges') return `${(ref.e1 ? 1 : 0) + (ref.e2 ? 1 : 0)} von 2 Kanten`;
  if (ref.kind === 'path') { if (!ref.pts) return 'Kante als Pfad anklicken …'; let L = 0; for (let i = 1; i < ref.pts.length; i++) L += Math.hypot(...ref.pts[i].map((v, k) => v - ref.pts[i - 1][k])); return `Kante, ${fmt(L, 2)} mm lang`; }
  if (ref.kind === 'mid') return ref.a && ref.b ? `Mitte: ${planeLabel(ref.a)} | ${planeLabel(ref.b)}` : `${ref.a ? 1 : 0} von 2 Ebenen`;
  if (ref.kind === 'perp') return ref.a ? `Lotrecht auf ${planeLabel(ref.a)}` : 'Ebene oder ebene Fläche anklicken …';
  const w = doc.features.find(x => x.id === refOwner(ref.id));
  if (!w) return 'Arbeitsebene fehlt';
  const k = String(ref.id).slice(refOwner(ref.id).length + 1);   // Ebene eines BKS: „<ID>:x“ ist die YZ-Ebene
  return k ? bksPlaneLabel(w.name, k) : w.name;
}
/* Klick im Modell → Ebenen-Bezug; null, wenn er nicht passt */
function planeRefFromPick(h) {
  if (!h) return null;
  if (h.kind === 'plane') return { kind: 'origin', key: h.plane.key };
  if (h.kind === 'face') {
    const p = h.info.plane;
    if (!p) return null;
    return { kind: 'face', plane: { key: 'FACE', label: 'Fläche des Körpers', o: round9(p.o), x: round9(p.x), y: round9(p.y), n: round9(p.n) } };
  }
  if (h.kind === 'workplane') {
    const idx = doc.features.findIndex(x => x.id === refOwner(h.id));   // auch eine Ebene des BKS (ihre ID trägt :x/:y/:z)
    if (editing && (refOwner(h.id) === editing.feature.id || idx < 0 || (!editing.isNew && idx >= editing.index))) { toast('Diese Arbeitsebene kommt erst später in der Zeitleiste.'); return null; }
    return { kind: 'plane', id: h.id };
  }
  return null;
}

/* Regelgewinde ISO 261: Größe → Steigung */
const THREADS = { M2: 0.4, 'M2.5': 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1, M8: 1.25, M10: 1.5, M12: 1.75, M14: 2, M16: 2, M20: 2.5, M24: 3 };

/* ---------------- Bohrungen: Normwerte ---------------- */
const SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];
const HOLE_STD = {
  clear: { label: 'Durchgang', kinds: ['simple'], v: { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11, M12: 13.5 } },
  tap: { label: 'Kernloch', kinds: ['simple'], v: { M2: 1.6, 'M2.5': 2.05, M3: 2.5, M4: 3.3, M5: 4.2, M6: 5, M8: 6.8, M10: 8.5, M12: 10.2 } },
  insert: { label: 'Gewindeeinsatz', kinds: ['simple'], v: { M2: 3.2, 'M2.5': 3.6, M3: 4, M4: 5.6, M5: 6.4 } },
  cb: { label: 'Zylinderkopf ISO 4762', kinds: ['cbore'], v: { M3: [3.4, 6.5, 3.4], M4: [4.5, 8, 4.4], M5: [5.5, 10, 5.4], M6: [6.6, 11, 6.4], M8: [9, 15, 8.6] } },
  csk: { label: 'Senkkopf 90°', kinds: ['csk'], v: { M3: [3.4, 6.9], M4: [4.5, 9], M5: [5.5, 11], M6: [6.6, 13], M8: [9, 17] } }
};
function presetOptions(kind) {
  const out = [];
  Object.entries(HOLE_STD).forEach(([std, d]) => {
    if (!d.kinds.includes(kind)) return;
    SIZES.filter(sz => d.v[sz] != null).forEach(sz => {
      const v = d.v[sz];
      out.push([`${std}:${sz}`, `${d.label} ${sz} · ⌀ ${fmt(Array.isArray(v) ? v[0] : v)}`]);
    });
  });
  return out;
}
function applyPreset(f, val) {
  f.preset = val || '';
  if (!val) return;
  const [std, sz] = val.split(':');
  const v = HOLE_STD[std] && HOLE_STD[std].v[sz];
  if (v == null) { f.preset = ''; return; }
  if (Array.isArray(v)) {
    f.d = v[0]; f.cd = v[1];
    if (std === 'cb') f.cdepth = v[2];
    if (std === 'csk') f.cangle = 90;
  } else f.d = v;
}
/* Beim Wechsel der Art die Gewindegröße mitnehmen */
function presetForKind(f) {
  const sz = (f.preset || 'clear:M3').split(':')[1] || 'M3';
  const std = f.kind === 'cbore' ? 'cb' : f.kind === 'csk' ? 'csk' : (['clear', 'tap', 'insert'].includes((f.preset || '').split(':')[0]) ? f.preset.split(':')[0] : 'clear');
  const v = HOLE_STD[std].v;
  applyPreset(f, `${std}:${v[sz] != null ? sz : 'M3'}`);
}
function holeCount(f) {
  const sk = doc.features.find(x => x.id === f.sketch);
  if (!sk) return 0;
  try { return holePoints(migrateSketch(clone(sk))).length; } catch (_) { return 0; }
}

/* ---------------- Auswahl über Geometrie (wie im Kern) ---------------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const round9 = a => a.map(v => Math.round(v * 1e9) / 1e9);

function edgeRef(info) {
  return info.type === 'LINE' ? { t: 'LINE', p: round9(info.mid), d: round9(info.dir) } : { t: info.type, p: round9(info.mid) };
}
function faceRef(info) {
  if (info.type === 'PLANE') return { t: 'PLANE', n: round9(info.n), dist: Math.round(info.dist * 1e9) / 1e9, p: round9(info.center) };
  const ref = { t: info.type, p: round9(info.center) };
  if (info.radius != null) ref.r = Math.round(info.radius * 1e6) / 1e6;
  return ref;
}
function sameEdge(ref, info) {
  if (ref.t === 'LINE' && info.type === 'LINE') {
    if (Math.abs(Math.abs(dot(ref.d, info.dir)) - 1) > 1e-6) return false;
    const ap = sub(ref.p, info.mid), t = dot(ap, info.dir);
    return vlen(sub(ap, info.dir.map(v => v * t))) < 1e-4;
  }
  if (ref.t === 'LINE' || info.type === 'LINE') return false;
  return vlen(sub(ref.p, info.mid)) < 1e-3;
}
function sameFace(ref, info) {
  if (ref.t === 'PLANE' && info.type === 'PLANE') return dot(ref.n, info.n) > 1 - 1e-6 && Math.abs(ref.dist - info.dist) < 1e-4;
  if (ref.t === 'PLANE' || info.type === 'PLANE') return false;
  if (vlen(sub(ref.p, info.center)) >= 1e-3) return false;
  return ref.r == null || info.radius == null || Math.abs(ref.r - info.radius) < 1e-3;
}

/* für die Auswahl-Anzeige: koplanare Flächen (z. B. Oberkanten mehrerer Zapfen) nicht mitmarkieren */
function sameFaceSel(ref, info) {
  if (!sameFace(ref, info)) return false;
  return ref.t !== 'PLANE' || !ref.p || !info.center || vlen(sub(ref.p, info.center)) < 1e-3;
}
function syncSelection() {
  schedulePickPreview();
  const m = lastBuild && lastBuild.mesh;
  vp.boxSelect = !!(editing && mode === 'feature' && ['fillet', 'chamfer', 'weld', 'gusset'].includes(editing.feature.type)) || (!editing && mode === 'model');
  if (m && !editing && mode === 'model') {
    const faces = m.faces.map((fi, i) => (modelSel.faces.some(r => sameFaceSel(r.ref, fi)) ? i : -1)).filter(i => i >= 0), edges = m.edges.map((e, i) => (modelSel.edges.some(r => sameEdge(r.ref, e)) ? i : -1)).filter(i => i >= 0);
    vp.setSelection({ faces, edges });
    // Browser: Körper der Auswahl markieren und ihren Pfad aufklappen
    const ids = new Set([...faces.map(i => m.faces[i].body), ...edges.map(i => m.edges[i].body)].filter(b => b != null).map(b => (m.bodies[b] || {}).id).filter(Boolean));
    browserAuswahl([...ids]);
    return;
  }
  if (!m || !editing || mode !== 'feature') { vp.setSelection({}); return; }
  const f = editing.feature;
  if (f.type === 'fastener') {
    vp.setSelection({ edges: f.edge ? m.edges.map((e, i) => (sameEdge(f.edge.ref, e) ? i : -1)).filter(i => i >= 0) : [] });
  } else if (f.type === 'hole' && (f.place === 'center' || f.place === 'edges' || f.place === 'onedge')) {
    const refs = f.place === 'center' ? f.rings || [] : f.place === 'onedge' ? [f.edgeP].filter(Boolean) : [f.edgeA, f.edgeB].filter(Boolean);
    vp.setSelection({ edges: m.edges.map((e, i) => (refs.some(r => sameEdge(r, e)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'sm_rip' && f.mode === 'face') {
    vp.setSelection({ faces: f.face ? m.faces.map((x, i) => (sameFaceSel(f.face, x) ? i : -1)).filter(i => i >= 0) : [] });
  } else if (f.type === 'sm_flange' || f.type === 'sm_rip' || f.type === 'sm_corner' || f.type === 'sm_join') {
    const all = [...(f.edges || []), ...((f.type === 'sm_corner' && f.sets) || []).flatMap(x => x.edges || [])];
    vp.setSelection({ edges: m.edges.map((e, i) => (all.some(r => sameEdge(r.ref, e)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'fillet' || f.type === 'chamfer' || f.type === 'weld' || f.type === 'gusset') {
    const all = [...f.edges, ...((f.sets || []).flatMap(x => x.edges || []))];
    const idx = f.all ? m.edges.map((_, i) => i) : m.edges.map((e, i) => (all.some(r => sameEdge(r, e)) ? i : -1)).filter(i => i >= 0);
    const ff = f.fromFaces || [];
    vp.setSelection({ edges: idx, faces: m.faces.map((fi, i) => (ff.some(r => sameFace(r, fi)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'split' && f.mode === 'faces' && (f.faces || []).length) {
    vp.setSelection({ faces: m.faces.map((fi, i) => (f.faces.some(r => sameFace(r, fi)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'shell' || f.type === 'endcap' || f.type === 'draft' || f.type === 'defeature' || f.type === 'thicken' || f.type === 'lippe') {
    vp.setSelection({ faces: m.faces.map((fi, i) => (f.faces.some(r => sameFace(r, fi)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'constraint') {
    const fr = (f.items || []).flatMap(it => [it.a, it.b]).filter(x => x && x.kind === 'face').map(x => x.ref), er = (f.items || []).flatMap(it => [it.a, it.b]).filter(x => x && x.kind === 'edge').map(x => x.ref);
    vp.setSelection({ faces: m.faces.map((fi, i) => (fr.some(r => sameFace(r, fi)) ? i : -1)).filter(i => i >= 0), edges: m.edges.map((e, i) => (er.some(r => sameEdge(r, e)) ? i : -1)).filter(i => i >= 0) });
  } else if ((f.type === 'thread' || f.type === 'sm_convert' || f.type === 'sm_unfold') && (f.face || (f.bends || []).length)) {
    const refs = [f.face, ...(f.type === 'sm_unfold' ? f.bends || [] : []), ...(f.type === 'thread' ? (f.more || []).map(x => x.face) : [])].filter(Boolean);
    vp.setSelection({ faces: m.faces.map((fi, i) => (refs.some(r => sameFace(r, fi)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'presspull' && f.face) {
    const moved = { ...f.face, dist: f.face.dist + (Number(f.distance) || 0) }, more = (f.more || []).map(x => x.face);
    vp.setSelection({ faces: m.faces.map((fi, i) => (sameFace(moved, fi) || sameFace(f.face, fi) || more.some(r => sameFace(r, fi)) ? i : -1)).filter(i => i >= 0) });
  } else if (f.type === 'combine' && m.bodies) {
    const faces = [];
    const ids = new Set([...(f.target || []), ...(f.tools || [])]);
    m.bodies.forEach(b => { if (ids.has(b.id)) for (let i = b.faces[0]; i < b.faces[1]; i++) faces.push(i); });
    vp.setSelection({ faces });
  } else if ((f.type === 'move' || f.type === 'scale' || f.type === 'remove' || f.type === 'bound' || f.type === 'boundfill' || f.type === 'gitter') && m.bodies) {
    const faces = [];
    const ids = new Set([...(f.bodies || []), ...((f.comps || []).flatMap(c => compAllBodies(doc, c)))]);
    m.bodies.forEach(b => { if (ids.has(b.id)) for (let i = b.faces[0]; i < b.faces[1]; i++) faces.push(i); });
    vp.setSelection({ faces });
  } else if (f.type === 'joint' || f.type === 'align') {
    const faces = [], edges = [];
    [f.o1, f.o2].forEach(o => {
      if (!o || o.kind === 'jorigin') return;
      if (o.kind === 'face') m.faces.forEach((fi, i) => { if (sameFace(o.ref, fi)) faces.push(i); });
      else m.edges.forEach((e, i) => { if (sameEdge(o.ref, e)) edges.push(i); });
    });
    vp.setSelection({ faces, edges });
  } else vp.setSelection({});
}

/* ---------------- Profile für Extrusion und Drehung ---------------- */
function profileRegions(f) {
  const sk = doc.features.find(x => x.id === f.sketch);
  if (!sk || !sk.plane) return null;   // eine 3D-Skizze (ohne Ebene) hat keine Profile
  // die offenen Linienzüge mitzählen: „Dünn extrudieren" macht daraus eine Wand
  try { const r = sketchRegions(sk); return { sk, regions: r.regions, chains: r.chains || [] }; } catch (_) { return null; }
}
function showProfiles() {
  const f = editing && editing.feature;
  if (!f || (f.type !== 'extrude' && f.type !== 'revolve' && f.type !== 'sweep' && f.type !== 'sm_base' && f.type !== 'topo') || (f.type === 'topo' && f.bereich === 'flaeche')) { vp.setRegions(null); if (f && f.type === 'topo') vp.setPickMode(pickModeFor(f)); return; }
  const pr = profileRegions(f);
  if (!pr) { vp.setRegions(null); return; }
  const chosen = new Set(selectRegions(pr.regions, f.profiles));
  vp.setRegions(pr.sk.plane, pr.regions, pr.regions.map(r => chosen.has(r)));
  vp.setPickMode('region');
}
function toggleProfile(index) {
  const f = editing.feature;
  const pr = profileRegions(f);
  if (!pr) return;
  const r = pr.regions[index];
  if (!r) return;
  // beim ersten Klick die automatische Auswahl als Ausgangspunkt nehmen
  let refs = f.profiles ? f.profiles.slice() : selectRegions(pr.regions, null).map(x => x.sample);
  const hit = refs.findIndex(p => pointInRegion(r, p));
  if (hit >= 0) refs.splice(hit, 1); else refs.push(r.sample.map(v => Math.round(v * 1e6) / 1e6));
  f.profiles = refs.length ? refs : null;
  if (!refs.length) toast('Keine Fläche gewählt, es gilt wieder die automatische Auswahl.');
  showProfiles();
  renderFeatureDialog(false);
  scheduleBuild(0);
}

/* ---------------- Picking ---------------- */
/* Fensterauswahl: alle Kanten im Rahmen zu Verrunden/Fase/Schweißnaht hinzufügen */
function onBoxSelect(idx) {
  const m = lastBuild && lastBuild.mesh;
  if (m && !editing && mode === 'model') {
    idx.forEach(i => { const e = m.edges[i]; if (e && !modelSel.edges.some(r => sameEdge(r.ref, e))) modelSel.edges.push({ ref: edgeRef(e), info: e }); });
    syncSelection(); updateHint();
    return;
  }
  if (!m || !editing || !['fillet', 'chamfer', 'weld', 'gusset'].includes(editing.feature.type)) return;
  const f = editing.feature;
  if (f.all) { f.all = false; f.edges = []; }
  if (f.fromFaces) { delete f.fromFaces; editing.pickTarget = null; vp.setPickMode(pickModeFor(f)); }
  let n = 0;
  idx.forEach(i => { const e = m.edges[i]; if (e && !f.edges.some(r => sameEdge(r, e))) { f.edges.push(edgeRef(e)); n++; } });
  syncSelection();
  renderFeatureDialog(false);
  scheduleBuild(0);
  toast(n ? `${n} Kante${n === 1 ? '' : 'n'} hinzugefügt.` : 'Im Rahmen liegt keine neue Kante.');
}
/* Farbauswahl: jede überstrichene Fläche bzw. Kante kommt zur Auswahl dazu (nie weg). Im Modell als
   Vorauswahl (Filter Körper: der ganze Körper), beim Abrunden/Fase/Schweißnaht/Rippenblech als Kanten des Features. */
let malZaehler = 0;
function onPaint(h) {
  const m = lastBuild && lastBuild.mesh;
  if (!m) return;
  if (!editing && mode === 'model') {
    if (h.kind === 'face' && (navState.filter === 'body' || navState.prio === 'koerper')) {
      const mb = m.bodies.find(b => h.index >= b.faces[0] && h.index < b.faces[1]);
      if (mb) for (let i = mb.faces[0]; i < mb.faces[1]; i++) if (!modelSel.faces.some(r => sameFace(r.ref, m.faces[i]))) { modelSel.faces.push({ ref: faceRef(m.faces[i]), info: m.faces[i], point: null }); malZaehler++; }
    } else if (h.kind === 'face') { if (!modelSel.faces.some(r => sameFace(r.ref, h.info))) { modelSel.faces.push({ ref: faceRef(h.info), info: h.info, point: h.point || null }); malZaehler++; } }
    else if (!modelSel.edges.some(r => sameEdge(r.ref, h.info))) { modelSel.edges.push({ ref: edgeRef(h.info), info: h.info, point: h.point || null }); malZaehler++; }
    syncSelection();
    return;
  }
  if (editing && ['fillet', 'chamfer', 'weld', 'gusset'].includes(editing.feature.type) && h.kind === 'edge') {
    const f = editing.feature;
    if (f.all) { f.all = false; f.edges = []; }
    if (!f.edges.some(r => sameEdge(r, h.info))) { f.edges.push(edgeRef(h.info)); malZaehler++; syncSelection(); }
  }
}
function onPaintEnd() {
  if (editing && ['fillet', 'chamfer', 'weld', 'gusset'].includes(editing.feature.type)) { renderFeatureDialog(false); scheduleBuild(0); }
  updateHint();
  if (malZaehler) toast(`Farbauswahl: ${malZaehler} dazu.`);
  malZaehler = 0;
}
/* ---------- Vorauswahl im Modell: erst wählen, dann Befehl ---------- */
const modelSel = { faces: [], edges: [] };
/* Auswahl nach Größe: Bohrungen/Zapfen nach ⌀, Rundungen nach R, Körper nach
   Volumen. Ergebnis ist die normale Vorauswahl (Flächen), die Befehle wie Elemente entfernen, Abrunden oder Gewinde übernehmen. */
const SIZE_KINDS = { hole: ['Bohrungen', '⌀', 'mm'], pin: ['Zapfen/Wellen', '⌀', 'mm'], fillet: ['Rundungen (Teilzylinder)', 'R', 'mm'], body: ['Körper', 'Volumen', 'cm³'], name: ['Körper nach Name', 'Name', ''] };
const sizeSel = { kind: 'hole', lo: 0, hi: 10, text: '' };
/* Namensmuster: * und ? als Platzhalter, sonst „enthält“; Groß-/Kleinschreibung egal */
function nameMatcher(text) {
  const t = String(text || '').trim();
  if (!t) return () => false;
  if (!/[*?]/.test(t)) { const lo = t.toLowerCase(); return s => s.toLowerCase().includes(lo); }
  const re = new RegExp('^' + t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return s => re.test(s);
}
function sizeMatches(kind, lo, hi) {
  const m = lastBuild && lastBuild.mesh;
  if (!m) return [];
  const inR = v => v >= lo - 1e-6 && v <= hi + 1e-6, out = [];
  if (kind === 'name') {
    // Körpername oder Name der Komponente, in der der Körper liegt
    const hit = nameMatcher(sizeSel.text);
    m.bodies.forEach(b => { const c = compOf(b.id); if (hit(bodyName(b.id)) || (c && hit(compName(c)))) for (let i = b.faces[0]; i < b.faces[1]; i++) out.push(i); });
    return out;
  }
  if (kind === 'body') {
    m.bodies.forEach(b => { if (inR((b.volume || 0) / 1000)) for (let i = b.faces[0]; i < b.faces[1]; i++) out.push(i); });
    return out;
  }
  m.faces.forEach((f, i) => {
    if (f.type !== 'CYLINDRE' || !(f.radius > 0)) return;
    const full = f.full !== false;
    if (kind === 'hole' && f.internal && full && inR(2 * f.radius)) out.push(i);
    if (kind === 'pin' && !f.internal && full && inR(2 * f.radius)) out.push(i);
    if (kind === 'fillet' && !full && inR(f.radius)) out.push(i);
  });
  return out;
}
function openSizeSelect() {
  if (editing) cancelEditing();
  const K = SIZE_KINDS[sizeSel.kind], isName = sizeSel.kind === 'name';
  const d = $('#dialog');
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('filter', 20)}<b class="dtitle">Nach Größe auswählen</b></header><div class="dbody">
    <label class="row"><span>Art</span><select data-sz="kind">${Object.entries(SIZE_KINDS).map(([k, x]) => `<option value="${k}"${k === sizeSel.kind ? ' selected' : ''}>${x[0]}</option>`).join('')}</select></label>
    ${isName ? `<label class="row"><span>Name</span><input type="text" data-sz="text" value="${esc(sizeSel.text)}" placeholder="z. B. Rohr* oder Blech"></label>`
    : `<label class="row"><span>${K[1]} von</span><span class="num"><input type="number" step="0.5" min="0" data-sz="lo" value="${sizeSel.lo}"><em>${K[2]}</em></span></label>
    <label class="row"><span>${K[1]} bis</span><span class="num"><input type="number" step="0.5" min="0" data-sz="hi" value="${sizeSel.hi}"><em>${K[2]}</em></span></label>`}
    <p class="info szinfo">${sizeInfo()}</p>
    ${isName ? '<p class="info small">Ohne Platzhalter: Name enthält den Text. Mit * (beliebig viele Zeichen) und ? (ein Zeichen) muss der ganze Name passen. Auch der Name der Komponente zählt.</p>' : ''}
    <p class="info small">Die Auswahl wird zur Vorauswahl im Modell – danach z. B. „Elemente entfernen“, „Abrunden“ oder „Gewinde“ aufrufen, oder mit Shift-Klick ergänzen.</p>
    </div><footer><button type="button" class="btn" data-cmd="szsel-add">Hinzufügen</button><button type="button" class="btn primary" data-cmd="szsel-ok">Auswählen</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
  d.hidden = false;
  setMode('filedlg');
}
function sizeInfo() {
  const idx = sizeMatches(sizeSel.kind, sizeSel.lo, sizeSel.hi), n = idx.length;
  if (sizeSel.kind !== 'name') return `${n} Fläche${n === 1 ? '' : 'n'} passen.`;
  const m = lastBuild && lastBuild.mesh, k = m ? m.bodies.filter(b => idx.includes(b.faces[0])).length : 0;
  return `${k} Körper passen.`;
}
function applySizeSelect(add) {
  const m = lastBuild && lastBuild.mesh, idx = sizeMatches(sizeSel.kind, sizeSel.lo, sizeSel.hi);
  closeFileDialog();
  if (!m) return;
  const fs = idx.map(i => ({ ref: faceRef(m.faces[i]), info: m.faces[i], point: null }));
  modelSel.edges = add ? modelSel.edges : [];
  modelSel.faces = add ? [...modelSel.faces, ...fs.filter(x => !modelSel.faces.some(r => sameFace(r.ref, x.info)))] : fs;
  if (navState.filter === 'edge') { navState.filter = 'all'; saveNav(); renderNavbar(); vp.setPickMode(modelPickMode()); }
  syncSelection(); updateHint();
  toast(sizeSel.kind === 'name' ? `${new Set(idx.map(i => m.bodies.findIndex(b => i >= b.faces[0] && i < b.faces[1]))).size} Körper ausgewählt.` : `${idx.length} ${SIZE_KINDS[sizeSel.kind][0]}-Fläche${idx.length === 1 ? '' : 'n'} ausgewählt.`);
}
$('#dialog').addEventListener('input', e => {
  // Maß einer weiteren Kantengruppe (Abrunden/Fase)
  const t0 = e.target;
  if (t0.dataset && t0.dataset.cv != null && editing && editing.feature.type === 'constraint') {
    const v = num(t0.value), it = editing.feature.items[Number(t0.dataset.cv)];
    if (it && Number.isFinite(v)) { it.value = v; scheduleBuild(0); }
    return;
  }
  if (t0.dataset && t0.dataset.vpt != null && editing && editing.feature.vpts) {
    // Zwischenpunkt (variable Rundung): Lage in %, Radius in mm
    const v = num(t0.value), p = editing.feature.vpts[Number(t0.dataset.vpt)];
    if (p && Number.isFinite(v)) { if (t0.dataset.vk === 't') { if (v > 0 && v < 100) p.t = v / 100; } else if (v > 0) p.r = v; }
    return;
  }
  if (t0.dataset && t0.dataset.fset != null && editing && editing.feature.sets) {
    const v = num(t0.value), s = editing.feature.sets[Number(t0.dataset.fset)];
    if (s && Number.isFinite(v) && v > 0) s.value = v;
    return;
  }
});
$('#dialog').addEventListener('input', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.sz) return;
  if (t.dataset.sz === 'kind') { sizeSel.kind = t.value; const dflt = { hole: [0, 10], pin: [0, 20], fillet: [0, 5], body: [0, 1000], name: [0, 0] }[t.value]; sizeSel.lo = dflt[0]; sizeSel.hi = dflt[1]; openSizeSelect(); return; }
  if (t.dataset.sz === 'text') sizeSel.text = t.value;
  else { const v = num(t.value); if (Number.isFinite(v) && v >= 0) sizeSel[t.dataset.sz] = v; }
  const el = $('#dialog .szinfo');
  if (el) el.textContent = sizeInfo();
});
function clearModelSel() { modelSel.faces = []; modelSel.edges = []; syncSelection(); updateHint(); }
function selCount() { return modelSel.faces.length + modelSel.edges.length; }
function modelPick(h, e) {
  const add = e && (e.shiftKey || e.ctrlKey || e.metaKey);
  if (!h || (h.kind !== 'face' && h.kind !== 'edge')) { if (!add) clearModelSel(); return; }
  if ((navState.filter === 'body' || navState.prio === 'koerper') && h.kind === 'face') {
    const m = lastBuild && lastBuild.mesh, mb = m && m.bodies && m.bodies.find(b => h.index >= b.faces[0] && h.index < b.faces[1]);
    if (mb) {
      const fs = [];
      for (let i = mb.faces[0]; i < mb.faces[1]; i++) fs.push({ ref: faceRef(m.faces[i]), info: m.faces[i], point: null });
      const already = fs.every(x => modelSel.faces.some(r => sameFace(r.ref, x.info)));
      if (add) modelSel.faces = already ? modelSel.faces.filter(r => !fs.some(x => sameFace(r.ref, x.info))) : [...modelSel.faces, ...fs];
      else { const only = already && modelSel.faces.length === fs.length && !modelSel.edges.length; modelSel.edges = []; modelSel.faces = only ? [] : fs; }
      syncSelection(); updateHint();
      return;
    }
  }
  const list = h.kind === 'face' ? modelSel.faces : modelSel.edges;
  const same = h.kind === 'face' ? (r => sameFace(r.ref, h.info)) : (r => sameEdge(r.ref, h.info));
  const i = list.findIndex(same);
  if (!add) { const had = i >= 0 && selCount() === 1; modelSel.faces = []; modelSel.edges = []; if (had) { syncSelection(); updateHint(); return; } }
  const l2 = h.kind === 'face' ? modelSel.faces : modelSel.edges;
  const j = l2.findIndex(same);
  if (j >= 0) l2.splice(j, 1); else l2.push({ ref: h.kind === 'face' ? faceRef(h.info) : edgeRef(h.info), info: h.info, point: h.point || null });
  syncSelection();
  updateHint();
}
/* Doppelklick: Kante → tangentiale Kantenkette, Fläche → alle Randkanten der Fläche */
function edgeEnds(m, i) {
  const e = m.edges[i], P = m.edgePositions, a = e.start, b = e.start + e.count - 1;
  const pt = k => [P[3 * k], P[3 * k + 1], P[3 * k + 2]];
  const dir = (k0, k1) => { const p = pt(k0), q = pt(k1), d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l = Math.hypot(...d) || 1; return d.map(v => v / l); };
  // Kantenpolylinien bestehen aus Segmentpaaren (a,b),(b,c)… – Endpunkte und Endrichtungen
  return { p0: pt(a), p1: pt(b), t0: dir(a, a + 1), t1: dir(b - 1, b) };
}
function tangentChain(m, seed) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-3;
  const ends = m.edges.map((_, i) => edgeEnds(m, i));
  const out = new Set([seed]), stack = [seed];
  while (stack.length) {
    const i = stack.pop(), E = ends[i];
    [[E.p0, E.t0], [E.p1, E.t1]].forEach(([p, t]) => {
      ends.forEach((F, j) => {
        if (out.has(j)) return;
        const tj = near(F.p0, p) ? F.t0 : near(F.p1, p) ? F.t1 : null;
        if (tj && Math.abs(t[0] * tj[0] + t[1] * tj[1] + t[2] * tj[2]) > 0.985) { out.add(j); stack.push(j); }
      });
    });
  }
  return [...out];
}
function faceBoundaryEdges(m, fi) {
  const f = m.faces[fi], P = m.positions, I = m.index, keys = new Set();
  const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
  for (let t = f.start; t < f.start + f.count; t++) { const v = I[t]; keys.add(key(P[3 * v], P[3 * v + 1], P[3 * v + 2])); }
  const E = m.edgePositions, out = [];
  m.edges.forEach((e, i) => {
    let all = true;
    for (let k = e.start; k < e.start + e.count && all; k++) all = keys.has(key(E[3 * k], E[3 * k + 1], E[3 * k + 2]));
    if (all) out.push(i);
  });
  return out;
}
function onDblPick(h) {
  if (h && (h.kind === 'workaxis' || h.kind === 'workpoint') && mode === 'model' && !editing) { const i = doc.features.findIndex(x => x.id === h.id); if (i >= 0) editFeature(i); return; }
  const m = lastBuild && lastBuild.mesh;
  if (!m || !h || mode !== 'model' || editing) return;
  const idx = h.kind === 'edge' ? tangentChain(m, h.index) : h.kind === 'face' ? faceBoundaryEdges(m, h.index) : [];
  if (!idx.length) return;
  if (h.kind === 'face') modelSel.faces = modelSel.faces.filter(r => !sameFace(r.ref, h.info));
  idx.forEach(i => { const e = m.edges[i]; if (!modelSel.edges.some(r => sameEdge(r.ref, e))) modelSel.edges.push({ ref: edgeRef(e), info: e }); });
  syncSelection(); updateHint();
}
/* Vorauswahl in ein neues Feature übernehmen */
/* Randkanten einer Fläche: Kanten, deren Netzpunkte alle zu den Dreiecken der Fläche gehören */
function boundaryEdges(m, fi) {
  const P = m.positions, I = m.index, F = m.faces[fi], E = m.edgePositions;
  if (!P || !I || !F || !E) return [];
  const key = (A, i) => `${Math.round(A[i] * 1e3)},${Math.round(A[i + 1] * 1e3)},${Math.round(A[i + 2] * 1e3)}`;
  const set = new Set();
  for (let t = F.start; t < F.start + F.count; t++) set.add(key(P, I[t] * 3));
  return m.edges.filter(e => {
    if (!e.count) return false;
    let hit = 0;
    for (let v = e.start; v < e.start + e.count; v++) if (set.has(key(E, v * 3))) hit++;
    return hit >= e.count * 0.9;
  });
}
/* Griff für Drücken/Ziehen: bei Zylindern radial an der Klickstelle (nur Anzeige, nicht im Dokument nötig) */
function setPullHandle(f, info, point) {
  delete f.handle;
  if (info.type !== 'CYLINDRE' || !info.axis || !info.axisO) return;
  const a = info.axis, o = info.axisO, q = point || info.center;
  const t = (q[0] - o[0]) * a[0] + (q[1] - o[1]) * a[1] + (q[2] - o[2]) * a[2];
  const r = q.map((v, i) => v - o[i] - a[i] * t), l = Math.hypot(...r);
  if (l < 1e-9) return;
  f.handle = { p: round9(q), n: round9(r.map(v => v / l * (info.internal ? -1 : 1))) };
}
function applyModelSel(f) {
  if (!selCount()) return;
  const edges = modelSel.edges.map(r => r.ref), faces = modelSel.faces;
  if (['fillet', 'chamfer', 'weld', 'gusset'].includes(f.type) && edges.length) f.edges = edges.slice();
  // gewählte Fläche + Verrunden/Fase = alle Randkanten dieser Fläche
  if ((f.type === 'fillet' || f.type === 'chamfer') && faces.length) {
    const m = lastBuild && lastBuild.mesh;
    if (m) {
      const add = [];
      faces.forEach(r => { const fi = m.faces.findIndex(x => sameFaceSel(r.ref, x)); if (fi >= 0) boundaryEdges(m, fi).forEach(e => add.push(edgeRef(e))); });
      add.forEach(ref => { if (!f.edges.some(x => JSON.stringify(x) === JSON.stringify(ref))) f.edges.push(ref); });
    }
  }
  if (f.type === 'endcap' && faces.length) f.faces = faces.filter(r => r.info.type === 'PLANE').map(r => r.ref);
  if ((f.type === 'shell' || f.type === 'draft' || f.type === 'defeature') && faces.length) f.faces = faces.map(r => r.ref);
  if (f.type === 'presspull' && faces.length === 1 && (faces[0].info.type === 'PLANE' || faces[0].info.type === 'CYLINDRE')) { f.face = faces[0].ref; f.faceBody = bodyIdAtFace(faces[0].info); setPullHandle(f, faces[0].info, faces[0].point); }
  if ((f.type === 'sm_convert' || f.type === 'sm_unfold') && faces.length === 1 && faces[0].info.type === 'PLANE') { f.face = faces[0].ref; f.faceBody = bodyIdAtFace(faces[0].info); }
  if (f.type === 'sm_unfold') { const cy = faces.filter(r => r.info.type === 'CYLINDRE'); if (cy.length) f.bends = cy.map(r => r.ref); }
  if (f.type === 'hole' && f.place === 'center') { const cr = edges.filter(r => r.info.type === 'CIRCLE'); if (cr.length) f.rings = cr.map(r => r.ref); }
  if (f.type === 'hole' && f.place === 'edges' && edges.length >= 2) { f.edgeA = edges[0].ref; f.edgeB = edges[1].ref; }
  if (f.type === 'thread' && faces.length === 1 && faces[0].info.type === 'CYLINDRE') { f.face = faces[0].ref; f.faceBody = bodyIdAtFace(faces[0].info); }
  if (f.type === 'remove' || f.type === 'move' || f.type === 'scale') { const ids = [...new Set(faces.map(r => bodyIdAtFace(r.info)).filter(Boolean))]; if (ids.length) f.bodies = ids; }
  modelSel.faces = []; modelSel.edges = [];
}
/* Entf im Modell: Körper der gewählten Flächen entfernen (rückgängig machbar) */
function deleteModelSel() {
  const ids = [...new Set(modelSel.faces.map(r => bodyIdAtFace(r.info)).filter(Boolean))];
  if (!ids.length) { toast(modelSel.edges.length ? 'Kanten lassen sich nicht einzeln löschen. Eine Fläche des Körpers wählen, um den Körper zu entfernen.' : 'Nichts gewählt.'); return; }
  pushHistory();
  const f = { id: uid(), type: 'remove', name: nextName(doc, 'remove'), bodies: ids };
  const at = timelinePos == null ? doc.features.length : timelinePos;
  doc.features.splice(at, 0, f);
  if (timelinePos != null) timelinePos = at + 1;
  modelSel.faces = []; modelSel.edges = [];
  store(); renderAll(); scheduleBuild(0);
  toast(`${ids.length === 1 ? bodyName(ids[0]) : ids.length + ' Körper'} entfernt (Strg+Z macht es rückgängig).`);
}
/* Achse aus einer Auswahl (Kante, Kreiskante = Mittelachse, Zylinderfläche = Zylinderachse) */
function axisFromPick(h) {
  const S = (a, b) => a.map((v, i) => v - b[i]), X = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const D = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], N = a => { const l = Math.hypot(...a); return l > 1e-12 ? a.map(v => v / l) : null; };
  if (h && h.kind === 'workaxis') {
    const idx = doc.features.findIndex(x => x.id === refOwner(h.id));
    if (editing && (refOwner(h.id) === editing.feature.id || idx < 0 || (!editing.isNew && idx >= editing.index))) { toast('Diese Arbeitsachse kommt erst später in der Zeitleiste.'); return null; }
    if (idx < 0) return null;
    // Gelenkursprung: Lage übernehmen (kein mitgeführter Achsbezug)
    if (doc.features[idx].type === 'jorigin') return { o: round9(h.axis.o), d: round9(h.axis.d), label: h.name };
    return { o: round9(h.axis.o), d: round9(h.axis.d), label: h.name, id: h.id };
  }
  if (!h || !h.info) return null;
  const i = h.info;
  if (h.kind === 'edge' && i.type === 'LINE' && i.dir) return { o: round9(i.mid), d: round9(i.dir), label: 'Gerade Kante' };
  if (h.kind === 'edge' && (i.type === 'CIRCLE' || i.type === 'ELLIPSE') && i.q1 && i.q3) {
    const a = i.p0, b = i.q1, c = i.mid, ab = S(b, a), ac = S(c, a), n = X(ab, ac), nn = D(n, n);
    if (nn < 1e-12) return null;
    const t = X(n, ab).map(v => v * D(ac, ac)), u = X(ac, n).map(v => v * D(ab, ab));
    const o = a.map((v, k) => v + (t[k] + u[k]) / (2 * nn));
    return { o: round9(o), d: round9(N(n)), label: 'Kreiskante (Mittelachse)' };
  }
  if (h.kind === 'face' && i.type === 'CYLINDRE' && i.axis && i.axisO) return { o: round9(i.axisO), d: round9(i.axis), label: 'Zylinderachse' };
  return null;
}
/* Herkunft eines angeklickten Punkts: Arbeitspunkt oder Kante (+ Ende/Mitte/Kreismitte), damit der Kern ihn mitführt */
const ptOrigin = (h, at = 'end') => (h.kind === 'workpoint' ? { pt: h.id } : h.kind === 'edge' && h.info ? { e: edgeRef(h.info), at } : null);
/* Punkt für „Verschieben: Punkt zu Punkt“ mit Herkunft, damit der Kern ihn an Körperecken mitführt */
function movePointRef(h) {
  if (h.kind === 'workpoint') return { pt: h.id, p: round9(h.p) };
  if (h.kind !== 'edge' || !h.info || !h.info.p0) return null;
  const ax = h.info.type !== 'LINE' && axisFromPick(h);
  if (ax) return { e: edgeRef(h.info), at: 'center', p: round9(ax.o) };
  const q = h.point || h.info.mid;
  const d0 = Math.hypot(...h.info.p0.map((v, i) => v - q[i])), d1 = Math.hypot(...h.info.p1.map((v, i) => v - q[i]));
  return { e: edgeRef(h.info), at: 'end', p: round9(d0 <= d1 ? h.info.p0 : h.info.p1) };
}
function onPick(h, e) {
  if (mode === 'gd') { gdPick(h); return; }
  if (mode === 'model' && !editing && navState.tool !== 'lookat') { modelPick(h, e); return; }
  if (navState.tool === 'lookat') {
    if (h && h.kind === 'face' && h.info && h.info.n) {
      vp.lookDir(h.info.n);
      setNavTool('lookat');
    } else toast('Bitte eine ebene Fläche anklicken.');
    return;
  }
  // Instanz-Kopien werden bei jedem Bau aus dem Original neu gebaut – eine Änderung an ihnen ginge verloren
  if (editing && h && (h.kind === 'face' || h.kind === 'edge') && h.info && !['joint', 'jorigin', 'align', 'plane', 'axis', 'point', 'sketch', 'rigid'].includes(editing.feature.type)) {
    const bid = bodyIdAtFace(h.info), c = bid && bid.includes('~') && (doc.components || []).find(x => x.id === bid.split('~')[0]);
    // Verschieben: ein Klick auf die Kopie wählt die ganze Instanz (sie bewegt sich als Einbau)
    if (c && c.instanz && editing.feature.type === 'move') {
      const f = editing.feature;
      f.comps = (f.comps || []).includes(c.id) ? f.comps.filter(x => x !== c.id) : [...(f.comps || []), c.id];
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (c && c.instanz) { const o = (doc.components || []).find(x => x.id === c.instanz.von); toast(`„${c.name}“ ist eine Instanz von „${o ? o.name : 'Original'}“. Bitte am Original ändern (Rechtsklick → Bearbeiten), das gilt dann für alle Einbauten.`, 6000); return; }
  }
  if (mode === 'measure') { measurePick(h); return; }
  if (mode === 'framesim') { frameSimPick(h); return; }
  if (mode === 'solidsim') { solidSimPick(h); return; }
  if (mode === 'similar') { similarPick(h); return; }
  if (mode === 'facedxf') { faceDXFPick(h); return; }
  if (mode === 'kontakt') { kontaktUi.pick(h); return; }
  if (mode === 'component') {
    if (!h || h.kind !== 'face' || !compDraft) return;
    const id = bodyIdAtFace(h.info);
    if (!id) return;
    compDraft.bodies = compDraft.bodies.includes(id) ? compDraft.bodies.filter(x => x !== id) : [...compDraft.bodies, id];
    renderComponentDialog();
    return;
  }
  if (mode === 'pickPlane') {
    if (!h) return;
    let plane;
    if (h.kind === 'plane') plane = clone(h.plane);
    else if (h.kind === 'workplane') {
      const sk = newSketch({ ...clone(h.plane) });
      sk.planeRef = h.id;
      startSketchEdit(sk, doc.features.length, true);
      return;
    } else {
      const p = h.info.plane;
      plane = { key: 'FACE', label: 'Fläche des Körpers', o: round9(p.o), x: round9(p.x), y: round9(p.y), n: round9(p.n) };
    }
    startSketchEdit(newSketch(plane), doc.features.length, true);
    return;
  }
  if (mode === 'feature' && editing && h) {
    const f = editing.feature;
    if (h.kind === 'region') { toggleProfile(h.index); return; }
    if (f.type === 'plane' && f.base && f.base.kind === 'points') {
      // Ebene durch drei Punkte: Klick auf eine Kante nimmt deren nächsten Endpunkt
      if (h.kind !== 'workpoint' && (h.kind !== 'edge' || !h.info || !h.info.p0)) { toast('Eckpunkte über die Kanten oder Arbeitspunkte anklicken (bei Kanten zählt der nähere Endpunkt).'); return; }
      const q = h.kind === 'workpoint' ? h.p : (h.point || h.info.mid), d0 = h.kind === 'workpoint' ? 0 : Math.hypot(...h.info.p0.map((v, i) => v - q[i])), d1 = h.kind === 'workpoint' ? 1 : Math.hypot(...h.info.p1.map((v, i) => v - q[i]));
      const pt = round9(h.kind === 'workpoint' ? h.p : d0 <= d1 ? h.info.p0 : h.info.p1);
      const restart = (f.base.pts || []).length >= 3;
      const pts = restart ? [] : (f.base.pts || []).slice(), refs = restart ? [] : pts.map((_, i) => (f.base.refs || [])[i] || null);
      if (pts.some(p => Math.hypot(...p.map((v, i) => v - pt[i])) < 1e-6)) { toast('Diesen Punkt hast du schon.'); return; }
      pts.push(pt); refs.push(ptOrigin(h));
      f.base = { kind: 'points', pts, refs };
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'point' && ['edges', 'planes3', 'edgeplane', 'path'].includes(f.mode)) {
      // weitere Punktarten: aus Kanten- und Ebenenbezügen berechnet (doc.js workPointOf)
      const line = () => (h.kind === 'edge' && h.info && h.info.type === 'LINE' ? { p: round9(h.info.p0), d: round9(h.info.dir) } : null);
      if (f.mode === 'edges') {
        const e = line();
        if (!e) { toast('Eine gerade Kante anklicken.'); return; }
        f.base = f.base && f.base.e1 && !f.base.e2 ? { ...f.base, e2: e } : { kind: 'edges', e1: e };
      } else if (f.mode === 'planes3') {
        const r = planeRefFromPick(h);
        if (!r) { toast('Ursprungsebene, Arbeitsebene oder ebene Fläche anklicken.'); return; }
        const b = f.base && f.base.kind === 'planes3' && !f.base.c ? f.base : { kind: 'planes3' };
        f.base = !b.a ? { ...b, a: r } : !b.b ? { ...b, b: r } : { ...b, c: r };
      } else if (f.mode === 'edgeplane') {
        const b = f.base && f.base.kind === 'edgeplane' ? f.base : { kind: 'edgeplane' };
        if (h.kind === 'edge') { const e = line(); if (!e) { toast('Eine gerade Kante anklicken.'); return; } f.base = { ...b, e }; }
        else { const r = planeRefFromPick(h); if (!r) { toast('Eine gerade Kante und eine Ebene anklicken.'); return; } f.base = { ...b, pl: r }; }
      } else {
        const m = lastBuild && lastBuild.mesh;
        if (h.kind !== 'edge' || !m || !m.edges[h.index]) { toast('Eine Kante anklicken (gerade, Bogen oder Kurve).'); return; }
        const e = m.edges[h.index], E = m.edgePositions, pts = [];
        for (let k = e.start; k < e.start + e.count; k++) {
          const q = [E[3 * k], E[3 * k + 1], E[3 * k + 2]].map(v => Math.round(v * 1e6) / 1e6), l = pts[pts.length - 1];
          if (!l || Math.hypot(q[0] - l[0], q[1] - l[1], q[2] - l[2]) > 1e-6) pts.push(q);
        }
        if (pts.length < 2) { toast('Diese Kante ist zu kurz.'); return; }
        const step = Math.ceil(pts.length / 200);
        f.base = { kind: 'path', pts: pts.filter((_, i) => i % step === 0 || i === pts.length - 1) };
        if (f.pos == null) f.pos = 50;
      }
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'point') {
      if (h.kind === 'workpoint') { f.base = { kind: 'vertex', p: round9(h.p), ref: ptOrigin(h) }; }
      else if (h.kind !== 'edge' || !h.info) { toast('Eine Kante anklicken.'); return; }
      else if (f.mode === 'vertex') {
        const q = h.point || h.info.mid, d0 = Math.hypot(...h.info.p0.map((v, i) => v - q[i])), d1 = Math.hypot(...h.info.p1.map((v, i) => v - q[i]));
        f.base = { kind: 'vertex', p: round9(d0 <= d1 ? h.info.p0 : h.info.p1), ref: ptOrigin(h, 'end') };
      } else if (f.mode === 'mid') {
        if (!h.info.mid) { toast('Diese Kante hat keine Mitte.'); return; }
        f.base = { kind: 'mid', p: round9(h.info.mid), ref: ptOrigin(h, 'mid') };
      } else if (f.mode === 'center') {
        const ax = axisFromPick(h);
        if (!ax || h.info.type === 'LINE') { toast('Eine Kreis- oder Bogenkante anklicken.'); return; }
        f.base = { kind: 'center', p: ax.o, ref: ptOrigin(h, 'center') };
      } else return;
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'axis') {
      if (f.mode === 'geom') {
        const ax = axisFromPick(h);
        if (!ax) { toast('Gerade Kante, Kreiskante, Zylinderfläche oder andere Arbeitsachse anklicken.'); return; }
        f.base = { kind: 'geom', o: ax.o, d: ax.d, label: ax.label };
      } else if (f.mode === 'normal') {
        // durch die Klickstelle, senkrecht zur ebenen Fläche
        if (h.kind !== 'face' || !h.info || h.info.type !== 'PLANE' || !h.info.plane || !h.point) { toast('Eine ebene Fläche an der Stelle anklicken, durch die die Achse gehen soll.'); return; }
        f.base = { kind: 'geom', o: round9(h.point), d: round9(h.info.plane.n), label: 'Lotrecht zur Fläche' };
      } else if (f.mode === 'planes') {
        const ref = planeRefFromPick(h);
        if (!ref) return;
        f.base = f.base && f.base.a && !f.base.b ? { ...f.base, b: ref } : { kind: 'planes', a: ref };
      } else if (f.mode === 'points') {
        if (h.kind !== 'workpoint' && (h.kind !== 'edge' || !h.info || !h.info.p0)) { toast('Punkte über die Kanten oder Arbeitspunkte anklicken (bei Kanten zählt der nähere Endpunkt).'); return; }
        const q = h.kind === 'workpoint' ? h.p : (h.point || h.info.mid), d0 = h.kind === 'workpoint' ? 0 : Math.hypot(...h.info.p0.map((v, i) => v - q[i])), d1 = h.kind === 'workpoint' ? 1 : Math.hypot(...h.info.p1.map((v, i) => v - q[i]));
        const pt = round9(h.kind === 'workpoint' ? h.p : d0 <= d1 ? h.info.p0 : h.info.p1);
        const keep = f.base && (f.base.pts || []).length === 1;
        const pts = keep ? f.base.pts.slice() : [], refs = keep ? [(f.base.refs || [])[0] || null] : [];
        if (pts.some(p => Math.hypot(...p.map((v, i) => v - pt[i])) < 1e-6)) { toast('Diesen Punkt hast du schon.'); return; }
        pts.push(pt); refs.push(ptOrigin(h));
        f.base = { kind: 'points', pts, refs };
      } else return;
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'move' && editing.pickTarget) {
      const t = editing.pickTarget;
      if (t === 'move-from' || t === 'move-to') {
        const r = movePointRef(h);
        if (!r) { toast('Eine Kante anklicken (es zählt der nähere Eckpunkt), einen Kreis (seine Mitte) oder einen Arbeitspunkt.'); return; }
        f[t === 'move-from' ? 'from' : 'to'] = r;
      } else if (t === 'move-edge') {
        if (h.kind !== 'edge' || !h.info) { toast('Eine Kante anklicken – gerade oder Kreis- bzw. Bogenkante.'); return; }
        f.edge = { ref: edgeRef(h.info), body: bodyIdAtFace(h.info) };
        // Kreis- und Bogenkanten: Achse beim Anklicken festhalten – sie legt den Drehsinn fest (gerade Kanten: ref.d)
        if (h.info.type !== 'LINE') { const ax = axisFromPick(h); if (ax && ax.d) f.edge.axis = round9(ax.d); }
      } else if (t === 'move-axis') {
        const ax = axisFromPick(h);
        if (!ax) { toast('Eine gerade Kante, Kreiskante, Zylinderfläche oder Arbeitsachse anklicken.'); return; }
        f.axisRef = ax;
      } else return;
      editing.pickTarget = null;
      vp.setPickMode(pickModeFor(f));
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'plane' && f.base && f.base.kind === 'tangent') {
      const i = h.info;
      if (h.kind !== 'face' || !i || i.type !== 'CYLINDRE' || !i.axis || !i.axisO || !h.point) { toast('Eine Zylinderfläche an der gewünschten Berührstelle anklicken.'); return; }
      f.base = { kind: 'tangent', o: round9(i.axisO), d: round9(i.axis), r: Math.round(i.radius * 1e6) / 1e6, p: round9(h.point) };
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'plane' && f.base && f.base.kind === 'path') {
      const m = lastBuild && lastBuild.mesh;
      if (h.kind !== 'edge' || !m || !m.edges[h.index]) { toast('Eine Kante als Pfad anklicken (gerade, Bogen oder Kurve).'); return; }
      const e = m.edges[h.index], E = m.edgePositions, pts = [];
      for (let k = e.start; k < e.start + e.count; k++) {
        const q = [E[3 * k], E[3 * k + 1], E[3 * k + 2]].map(v => Math.round(v * 1e6) / 1e6), l = pts[pts.length - 1];
        if (!l || Math.hypot(q[0] - l[0], q[1] - l[1], q[2] - l[2]) > 1e-6) pts.push(q);
      }
      if (pts.length < 2) { toast('Diese Kante ist zu kurz.'); return; }
      // höchstens 200 Stützpunkte speichern
      const step = Math.ceil(pts.length / 200), red = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      f.base = { kind: 'path', pts: red, type: e.type || '' };
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'plane' && f.base && f.base.kind === 'edges') {
      if (h.kind !== 'edge' || !h.info || h.info.type !== 'LINE' || !h.info.dir) { toast('Eine gerade Kante anklicken.'); return; }
      const e = { p: round9(h.info.p0 || h.info.mid), d: round9(h.info.dir) };
      f.base = f.base.e1 && !f.base.e2 ? { ...f.base, e2: e } : { kind: 'edges', e1: e };
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'plane' && f.base && f.base.kind === 'mid') {
      const ref = planeRefFromPick(h);
      if (!ref) return;
      f.base = f.base.a && !f.base.b ? { ...f.base, b: ref } : { kind: 'mid', a: ref };
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'plane' && f.base && f.base.kind === 'perp') {
      // erst die Ebene, auf der sie steht, danach optional den Punkt, durch sie hindurchgeht
      if (editing.pickTarget === 'perp-point') {
        const r = movePointRef(h);
        if (!r) { toast('Einen Eckpunkt (über einer Kante), eine Kreismitte oder einen Arbeitspunkt anklicken.'); return; }
        const { p, ...ref } = r;
        f.base = { ...f.base, p, ref };
        editing.pickTarget = null;
        vp.setPickMode(pickModeFor(f));
      } else {
        const ref = planeRefFromPick(h);
        if (!ref) return;
        f.base = { ...f.base, a: ref };
      }
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'pattern' && editing.pickTarget === 'ptsface') {
      // Anordnung an Punkten, an einer Fläche ausgerichtet: die Fläche
      if (h.kind !== 'face') { toast('Eine Fläche anklicken (eben oder gekrümmt).'); return; }
      f.face = faceRef(h.info); f.faceBody = bodyIdAtFace(h.info);
      editing.pickTarget = null; vp.setPickMode(pickModeFor(f)); showProfiles();
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if ((f.type === 'pattern' && (editing.pickTarget === 'patternaxis' || editing.pickTarget === 'patternaxis2')) || (f.type === 'revolve' && editing.pickTarget === 'revaxis')) {
      const ax = axisFromPick(h);
      if (!ax) { toast('Eine gerade Kante, eine Kreiskante oder eine Zylinderfläche anklicken.'); return; }
      f[editing.pickTarget === 'patternaxis2' ? 'axis2Ref' : 'axisRef'] = ax;
      editing.pickTarget = null; vp.setPickMode(pickModeFor(f)); showProfiles();
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'draft') {
      // erst die neutrale Ebene (bestimmt die Zugrichtung), danach Flächen hinzufügen/entfernen
      if (!f.plane || editing.pickTarget === 'draftplane') {
        const ref = planeRefFromPick(h);
        if (!ref) { toast('Neutrale Ebene: Ursprungsebene, Arbeitsebene oder ebene Fläche anklicken.'); return; }
        f.plane = ref; editing.pickTarget = null;
      } else if (h.kind === 'face') {
        const i = f.faces.findIndex(r => sameFace(r, h.info));
        if (i >= 0) f.faces.splice(i, 1); else f.faces.push(faceRef(h.info));
      } else return;
      vp.setPickMode(pickModeFor(f));
      syncSelection(); renderFeatureDialog(true, false); updateHint(); scheduleBuild(0);
      return;
    }
    if (f.type === 'silsplit') {
      // Blickrichtung = Normale einer ebenen Fläche
      if (h.kind !== 'face' || h.info.type !== 'PLANE') { toast('Eine ebene Fläche anklicken – ihre Normale ist die Blickrichtung.'); return; }
      f.richtungFlaeche = faceRef(h.info);
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'split' && editing.pickTarget === 'split-faces') {
      // nur die angeklickten Flächen teilen
      if (h.kind !== 'face') { toast('Eine Fläche anklicken, die geteilt werden soll.'); return; }
      const i = (f.faces || (f.faces = [])).findIndex(r => sameFace(r, h.info));
      if (i >= 0) f.faces.splice(i, 1); else f.faces.push(faceRef(h.info));
      syncSelection(); renderFeatureDialog(true, false); updateHint(); scheduleBuild(0);
      return;
    }
    if (f.type === 'split' && f.tool === 'body') {
      const bid = h.kind === 'face' || h.kind === 'edge' ? bodyIdAtFace(h.info) : null;
      if (!bid) { toast('Eine Fläche des Werkzeugkörpers anklicken.'); return; }
      f.toolBody = bid;
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'bks') {
      // Basis wie bei der Arbeitsebene; der Ursprung optional auf einer Ecke, einer Kreismitte oder einem Arbeitspunkt
      if (editing.pickTarget === 'bks-origin') {
        const r = movePointRef(h);
        if (!r) { toast('Einen Eckpunkt (über einer Kante), eine Kreismitte oder einen Arbeitspunkt anklicken.'); return; }
        const { p, ...ref } = r;
        f.originRef = ref;
        f.originP = p;
        editing.pickTarget = null;
        vp.setPickMode(pickModeFor(f));
      } else {
        const ref = planeRefFromPick(h);
        if (!ref) return;
        f.base = ref;
      }
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'plane' || f.type === 'mirror' || f.type === 'split' || f.type === 'coil' || f.type === 'primitive') {
      const ref = planeRefFromPick(h);
      if (!ref) return;
      if (f.type === 'plane') f.base = ref; else f.plane = ref;
      renderFeatureDialog(true, false);
      refreshWorkPlanes();
      scheduleBuild(0);
      return;
    }
    if (f.type === 'fastener' && h.kind === 'edge') {
      if (h.info.type !== 'CIRCLE') { toast('Für ein Normteil einen Bohrungsrand (Kreiskante) anklicken.'); return; }
      const [a, b, c] = [h.info.p0, h.info.q1, h.info.q3];
      // Bohrungs-⌀ aus drei Punkten der Kante → passende Größe
      const ab = a.map((v, i) => b[i] - v), ac = a.map((v, i) => c[i] - v), dd = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], nn = dd(cr, cr);
      if (nn > 1e-12) {
        const D = Math.sqrt(dd(ab, ab) * dd(ac, ac) * dd(b.map((v, i) => v - c[i]), b.map((v, i) => v - c[i])) / nn);
        const s = sizeForHole(D);
        if (FASTENERS[f.kind].dims[s]) f.size = s;
        const Ls = lengthsFor(f.size); if (FASTENERS[f.kind].screw && !Ls.includes(Number(f.length))) f.length = Ls.find(L => L >= 3 * parseFloat(f.size.slice(1))) || Ls[0];
      }
      f.edge = { ref: edgeRef(h.info), body: bodyIdAtFace(h.info) };
      if (f.autoName) f.name = fastenerLabel(f);
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'sm_join' && h.kind === 'edge') {
      if (h.info.type !== 'LINE') { toast('Eine gerade Endkante des Blechs anklicken.'); return; }
      const i = f.edges.findIndex(r => sameEdge(r.ref, h.info)), body = bodyIdAtFace(h.info);
      if (i >= 0) f.edges.splice(i, 1);
      else {
        const j = f.edges.findIndex(r => r.body === body);
        if (j >= 0) f.edges.splice(j, 1); // je Körper eine Kante
        f.edges.push({ ref: edgeRef(h.info), body });
        if (f.edges.length > 2) f.edges.shift();
      }
      syncSelection(); renderFeatureDialog(true, false); if (f.edges.length === 2) scheduleBuild(0);
      return;
    }
    if (f.type === 'sm_corner' && h.kind === 'edge') {
      const t = sheetRule().t, L = h.info.type === 'LINE' ? Math.hypot(...h.info.p1.map((v, i) => v - h.info.p0[i])) : 0;
      if (h.info.type !== 'LINE' || Math.abs(L - t) > Math.max(1e-3, t * 1e-3)) { toast(`Nur Ecken: gerade Kanten in Dickenrichtung (Länge ${fmt(t, 2)} mm = Blechdicke).`); return; }
      f.all = false;
      // aktive Eckgruppe wie bei Abrunden/Fase: 0 = erste Gruppe (edges), sonst sets[k − 1]; eine Ecke gehört zu genau einer Gruppe
      const g = editing.grp > 0 && f.sets && f.sets[editing.grp - 1] ? f.sets[editing.grp - 1].edges : f.edges;
      const i = g.findIndex(r => sameEdge(r.ref, h.info));
      if (i >= 0) g.splice(i, 1);
      else {
        [f.edges, ...((f.sets || []).map(x => x.edges))].forEach(arr => { const j = arr.findIndex(r => sameEdge(r.ref, h.info)); if (j >= 0) arr.splice(j, 1); });
        g.push({ ref: edgeRef(h.info), body: bodyIdAtFace(h.info) });
      }
      syncSelection(); renderFeatureDialog(true, false);
      return;
    }
    if (f.type === 'sm_rip' && f.mode === 'face' && h.kind === 'face') {
      if (h.info.type !== 'PLANE') { toast('Für die Flächenauftrennung eine ebene Blechfläche anklicken.'); return; }
      f.face = faceRef(h.info); f.faceBody = bodyIdAtFace(h.info);
      syncSelection(); renderFeatureDialog(true, false);
      return;
    }
    if (f.type === 'sm_rip' && f.mode === 'points' && h.kind === 'face') {
      if (h.info.type !== 'PLANE' || !h.point) { toast('Für die Auftrennung zwischen zwei Punkten eine ebene Blechfläche anklicken.'); return; }
      const p = h.point.map(v => Math.round(v * 1e6) / 1e6);
      if (!f.a || f.b) f.a = { face: faceRef(h.info), body: bodyIdAtFace(h.info), p };
      else f.b = { face: faceRef(h.info), body: bodyIdAtFace(h.info), p };
      syncSelection(); renderFeatureDialog(true, false);
      return;
    }
    if ((f.type === 'sm_flange' || f.type === 'sm_rip') && h.kind === 'edge') {
      if (h.info.type !== 'LINE') { toast(f.type === 'sm_rip' ? 'Für die Auftrennung eine gerade Eckkante anklicken.' : 'Für eine Lasche eine gerade Blechkante anklicken.'); return; }
      const i = f.edges.findIndex(r => sameEdge(r.ref, h.info));
      if (i >= 0) f.edges.splice(i, 1); else f.edges.push({ ref: edgeRef(h.info), body: bodyIdAtFace(h.info) });
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if ((f.type === 'fillet' || f.type === 'chamfer') && editing.pickTarget === 'face-edges') {
      // Kanten der gewählten Flächen (wie „Regel-Abrundung“ auf Flächen): Flächen aus- und abwählen
      if (h.kind !== 'face') { toast('Eine Fläche des Körpers anklicken, alle ihre Ecken werden gerundet.'); return; }
      const arr = f.fromFaces || (f.fromFaces = []);
      const i = arr.findIndex(r => sameFace(r, h.info));
      if (i >= 0) arr.splice(i, 1); else arr.push(faceRef(h.info));
      if (!arr.length) delete f.fromFaces;
      f.all = false; f.edges = []; delete f.sets; editing.grp = 0;
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if ((f.type === 'fillet' || f.type === 'chamfer' || f.type === 'weld' || f.type === 'gusset') && h.kind === 'edge') {
      if (f.all) { f.all = false; f.edges = []; }
      if (f.fromFaces) { delete f.fromFaces; editing.pickTarget = null; vp.setPickMode(pickModeFor(f)); }
      // aktive Kantengruppe (Abrunden/Fase): 0 = erste Gruppe (edges), sonst sets[k − 1]; eine Kante gehört zu genau einer Gruppe
      const g = (f.type === 'fillet' || f.type === 'chamfer') && editing.grp > 0 && f.sets && f.sets[editing.grp - 1] ? f.sets[editing.grp - 1].edges : f.edges;
      const i = g.findIndex(r => sameEdge(r, h.info));
      if (i >= 0) g.splice(i, 1);
      else {
        [f.edges, ...((f.sets || []).map(x => x.edges))].forEach(arr => { const j = arr.findIndex(r => sameEdge(r, h.info)); if (j >= 0) arr.splice(j, 1); });
        g.push(edgeRef(h.info));
      }
      syncSelection();
      renderFeatureDialog(false);
      if (f.type === 'weld' || f.type === 'gusset') scheduleBuild(0);
    }
    if (f.type === 'hole' && f.place === 'center' && h.kind === 'edge') {
      // Lage „Kreismitte“: runde Kante an- oder abwählen, die Bohrung kommt in ihre Mitte
      if (h.info.type !== 'CIRCLE') { toast('Für diese Lage eine runde Kante anklicken.'); return; }
      const i = (f.rings || []).findIndex(r => sameEdge(r, h.info));
      if (i >= 0) f.rings.splice(i, 1); else (f.rings || (f.rings = [])).push(edgeRef(h.info));
      syncSelection(); renderFeatureDialog(true, false);
      return;
    }
    if (f.type === 'emboss' && h.kind === 'face') {
      // Prägen: Fläche und Klickstelle (dort wird geprägt – nicht auf der Rückseite)
      f.face = faceRef(h.info); f.faceBody = bodyIdAtFace(h.info); f.facePt = round9(h.point || h.info.center);
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'hole' && f.place === 'onedge' && h.kind === 'edge') {
      // Lage „Auf Kante“: eine gerade Kante, die Stelle (Anfang/Mitte/Ende) kommt aus dem Dialog
      if (h.info.type !== 'LINE') { toast('Für diese Lage eine gerade Kante anklicken.'); return; }
      f.edgeP = f.edgeP && sameEdge(f.edgeP, h.info) ? null : edgeRef(h.info);
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'hole' && f.place === 'edges' && h.kind === 'edge') {
      // Lage „zwei Kanten“: erste und zweite Kante, derselbe Klick nimmt sie wieder weg
      if (h.info.type !== 'LINE') { toast('Für diese Lage eine gerade Kante anklicken.'); return; }
      const r = edgeRef(h.info);
      if (f.edgeA && sameEdge(f.edgeA, h.info)) { f.edgeA = f.edgeB; f.edgeB = null; }
      else if (f.edgeB && sameEdge(f.edgeB, h.info)) f.edgeB = null;
      else if (!f.edgeA) f.edgeA = r;
      else if (!f.edgeB) f.edgeB = r;
      else { toast('Es werden nur zwei Kanten gebraucht.'); return; }
      syncSelection(); renderFeatureDialog(true, false);
      return;
    }
    if (f.type === 'hole' && (!f.place || f.place === 'sketch') && (editing.pickTarget === 'holeface' || !f.sketch) && h.kind === 'face') {
      // Bohrung auf Fläche: Skizze auf der Fläche mit Punkt an der Klickstelle
      if (h.info.type !== 'PLANE' || !h.info.plane || !h.point) { toast('Für die Bohrung eine ebene Fläche anklicken.'); return; }
      const P = h.info.plane, q = h.point, uv = [0, 1].map(i => { const ax = i ? P.y : P.x; return Math.round(((q[0] - P.o[0]) * ax[0] + (q[1] - P.o[1]) * ax[1] + (q[2] - P.o[2]) * ax[2]) * 100) / 100; });
      let sk = f.sketch && f.autoSketch ? doc.features.find(x => x.id === f.sketch) : null;
      const plane = { key: 'FACE', label: 'Fläche des Körpers', o: round9(P.o), x: round9(P.x), y: round9(P.y), n: round9(P.n) };
      const samePlane = sk && sk.plane && Math.abs((sk.plane.n[0] * P.n[0] + sk.plane.n[1] * P.n[1] + sk.plane.n[2] * P.n[2]) - 1) < 1e-6 && Math.abs((P.o[0] - sk.plane.o[0]) * P.n[0] + (P.o[1] - sk.plane.o[1]) * P.n[1] + (P.o[2] - sk.plane.o[2]) * P.n[2]) < 1e-6;
      if (!samePlane) {
        sk = { ...newSketch(plane), name: nextName(doc, 'sketch').replace(/^Skizze/, 'Bohrungsskizze').replace(/^Sketch/, 'Hole Sketch') };
        doc.features.splice(editing.index, 0, sk);
        editing.index++;
        f.sketch = sk.id; f.autoSketch = true;
      }
      // Punkt im Skizzensystem der (evtl. älteren) Skizze
      const S = sk.plane, uv2 = [0, 1].map(i => { const ax = i ? S.y : S.x; return Math.round(((q[0] - S.o[0]) * ax[0] + (q[1] - S.o[1]) * ax[1] + (q[2] - S.o[2]) * ax[2]) * 100) / 100; });
      sk.points.push({ id: uid(), x: samePlane ? uv2[0] : uv[0], y: samePlane ? uv2[1] : uv[1] });
      store();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if (f.type === 'extrude' && editing.pickTarget === 'exface' && h.kind === 'face') {
      if (h.info.type !== 'PLANE') { toast('Als Profil eine ebene Fläche anklicken.'); return; }
      f.fromFace = { face: faceRef(h.info), body: bodyIdAtFace(h.info) };
      editing.pickTarget = null;
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if ((editing.pickTarget === 'toface' || editing.pickTarget === 'startface') && h.kind === 'face') {
      if (h.info.type !== 'PLANE') { toast('Bitte eine ebene Fläche wählen.'); return; }
      f[editing.pickTarget === 'toface' ? 'toFace' : 'startRef'] = faceRef(h.info);
      editing.pickTarget = null;
      showProfiles();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if (f.type === 'jorigin' && (h.kind === 'face' || h.kind === 'edge')) {
      const bid = bodyIdAtFace(h.info);
      if (!bid) return;
      f.sel = { kind: h.kind, ref: h.kind === 'face' ? faceRef(h.info) : edgeRef(h.info), body: bid };
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'constraint' && (h.kind === 'face' || h.kind === 'edge') && /^c[ab]:\d+$/.test(editing.pickTarget || '')) {
      // Abhängigkeiten: Seite a (bewegte Komponente) bzw. b der Abhängigkeit i
      const [side, idx] = [editing.pickTarget[1], Number(editing.pickTarget.slice(3))], it = f.items[idx];
      const bid = bodyIdAtFace(h.info);
      if (!it || !bid) return;
      const sel = { kind: h.kind, ref: h.kind === 'face' ? faceRef(h.info) : edgeRef(h.info), body: bid };
      if (side === 'a') {
        const c = compOf(bid);
        if (!c) { toast('Die erste Auswahl muss auf einer Komponente liegen – sie wird bewegt.'); return; }
        if (f.comp && c !== f.comp) { toast('Alle ersten Auswahlen müssen auf derselben (bewegten) Komponente liegen.'); return; }
        f.comp = c; it.a = sel;
        editing.pickTarget = it.b ? null : `cb:${idx}`;
      } else {
        if (f.comp && compOf(bid) === f.comp) { toast('Die zweite Auswahl liegt auf einem anderen Teil als die bewegte Komponente.'); return; }
        it.b = sel; editing.pickTarget = null;
      }
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    const joPick = (f.type === 'joint' || f.type === 'align') && h.kind === 'workaxis' && doc.features.find(x => x.id === h.id && x.type === 'jorigin');
    if ((f.type === 'joint' || f.type === 'align') && (h.kind === 'face' || h.kind === 'edge' || joPick)) {
      if (f.o1 && f.o2) return;
      if (joPick && doc.features.indexOf(joPick) > (editing.isNew ? doc.features.length : editing.index)) { toast('Dieser Gelenkursprung kommt erst später in der Zeitleiste.'); return; }
      const bid = joPick ? (joPick.sel && joPick.sel.body) : bodyIdAtFace(h.info);
      if (!bid) return;
      const sel = joPick ? { kind: 'jorigin', id: joPick.id, body: bid } : { kind: h.kind, ref: h.kind === 'face' ? faceRef(h.info) : edgeRef(h.info), body: bid };
      if (!f.o1) { f.o1 = sel; f.comp = compOf(bid); f.body1 = bid; }
      else {
        const c2 = compOf(bid);
        if (bid === f.body1 || (f.comp && c2 === f.comp)) { toast('Ursprung 2 muss auf einem anderen Körper bzw. einer anderen Komponente liegen.'); return; }
        f.o2 = sel;
      }
      syncSelection();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if ((f.type === 'sm_convert' || f.type === 'sm_unfold') && h.kind === 'face') {
      if (f.type === 'sm_unfold' && h.info.type === 'CYLINDRE') {
        // runde Biegefläche: Biegung zum Abwickeln an- oder abwählen
        if (!Array.isArray(f.bends)) f.bends = [];
        const ref = faceRef(h.info);
        const i = f.bends.findIndex(r => sameFace(r, h.info));
        if (i >= 0) f.bends.splice(i, 1); else f.bends.push(ref);
        syncSelection();
        renderFeatureDialog(true, false);
        scheduleBuild(0);
        return;
      }
      if (h.info.type !== 'PLANE') { toast('Als feste Fläche eine ebene Blechfläche anklicken.'); return; }
      f.face = faceRef(h.info);
      f.faceBody = bodyIdAtFace(h.info);
      syncSelection();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if (f.type === 'thread' && h.kind === 'face') {
      if (h.info.type !== 'CYLINDRE') { toast('Für ein Gewinde eine Zylinderfläche anklicken (Bolzen oder Bohrung).'); return; }
      // weitere Zylinderflächen: Klick nimmt auf oder heraus
      if (f.face && !sameFace(f.face, h.info)) {
        const list = f.more || (f.more = []), j = list.findIndex(x => sameFace(x.face, h.info));
        if (j >= 0) list.splice(j, 1); else list.push({ face: faceRef(h.info), body: bodyIdAtFace(h.info) });
        if (!list.length) delete f.more;
        syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
        return;
      }
      if (f.face && f.more && f.more.length) { const nx = f.more.shift(); f.face = nx.face; f.faceBody = nx.body; if (!f.more.length) delete f.more; syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0); return; }
      f.face = faceRef(h.info);
      f.faceBody = bodyIdAtFace(h.info);
      syncSelection();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if (f.type === 'canvas' && f.cplane === 'face' && h.kind === 'face') {
      if (h.info.type !== 'PLANE') { toast('Für einen Aufkleber eine ebene Fläche anklicken.'); return; }
      f.face = faceRef(h.info);
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    if (f.type === 'moveface') {
      const t = editing.pickTarget;
      if (t === 'mf-axis') {
        const ax = axisFromPick(h);
        if (!ax) { toast('Eine gerade Kante, Kreiskante, Zylinderfläche oder Arbeitsachse anklicken.'); return; }
        f.axisRef = ax;
      } else if (t === 'mf-target') {
        if (h.kind !== 'face' || h.info.type !== 'PLANE') { toast('Eine ebene Fläche als Ziel anklicken.'); return; }
        f.target = faceRef(h.info);
      } else if (t === 'mf-faces' && h.kind === 'face') {
        if (h.info.type !== 'PLANE' && h.info.type !== 'CYLINDRE') { toast('Ebene Flächen oder Zylinderflächen anklicken.'); return; }
        const j = f.faces.findIndex(x => sameFace(x.face, h.info));
        if (j >= 0) f.faces.splice(j, 1); else f.faces.push({ face: faceRef(h.info), body: bodyIdAtFace(h.info) });
        renderFeatureDialog(true, false); scheduleBuild(0);
        return;
      } else return;
      editing.pickTarget = null;
      vp.setPickMode(pickModeFor(f));
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'presspull' && h.kind === 'face' && editing.pickTarget === 'ppmore') {
      // weitere Flächen mit demselben Abstand: Klick nimmt auf oder heraus
      if (h.info.type !== 'PLANE' && h.info.type !== 'CYLINDRE') { toast('Drücken/Ziehen geht mit ebenen Flächen und Zylinderflächen.'); return; }
      if (f.face && sameFace(f.face, h.info)) return;
      const list = f.more || (f.more = []), j = list.findIndex(x => sameFace(x.face, h.info));
      if (j >= 0) list.splice(j, 1); else list.push({ face: faceRef(h.info), body: bodyIdAtFace(h.info) });
      if (!list.length) delete f.more;
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'presspull' && h.kind === 'face') {
      if (h.info.type !== 'PLANE' && h.info.type !== 'CYLINDRE') { toast('Drücken/Ziehen geht mit ebenen Flächen und Zylinderflächen.'); return; }
      const moved = f.face && f.face.t === 'PLANE' && { ...f.face, dist: f.face.dist + (Number(f.distance) || 0) };
      if (moved && sameFace(moved, h.info)) return;
      f.face = faceRef(h.info);
      setPullHandle(f, h.info, h.point);
      f.faceBody = bodyIdAtFace(h.info);
      syncSelection();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if (f.type === 'combine' && h.kind === 'face') {
      const id = bodyIdAtFace(h.info);
      if (!id) return;
      if (!f.target.length) f.target = [id];
      else if (f.target[0] === id) f.target = [];
      else { const i = f.tools.indexOf(id); if (i >= 0) f.tools.splice(i, 1); else f.tools.push(id); }
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'topo' && f.bereich === 'flaeche' && h.kind === 'face') {
      // Designbereich = ebene Fläche eines Körpers
      if (h.info.type !== 'PLANE') { toast('Als Designbereich eine ebene Fläche anklicken.'); return; }
      const bid = bodyIdAtFace(h.info);
      if (bid === f.id) return;
      f.face = faceRef(h.info); f.faceBody = bid;
      editing.topoVorschau = false;
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if (f.type === 'boundfill' && editing.pickTarget === 'bf-planes') {
      // Werkzeugebene an-/abwählen: Arbeitsebene, Ursprungsebene oder ebene Fläche
      const ref = planeRefFromPick(h);
      if (!ref) return;
      const same = r => r.kind === ref.kind && (ref.kind === 'origin' ? r.key === ref.key : ref.kind === 'plane' ? r.id === ref.id : r.plane && ref.plane.o.every((v, i) => Math.abs(v - r.plane.o[i]) < 1e-6) && ref.plane.n.every((v, i) => Math.abs(v - r.plane.n[i]) < 1e-6));
      const i = (f.planes || (f.planes = [])).findIndex(same);
      if (i >= 0) f.planes.splice(i, 1); else f.planes.push(ref);
      f.cells = null;
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    if ((f.type === 'move' || f.type === 'scale' || f.type === 'remove' || f.type === 'bound' || f.type === 'boundfill' || f.type === 'gitter') && h.kind === 'face') {
      const id = bodyIdAtFace(h.info);
      if (!id || id === f.id || id.startsWith(f.id + ':')) return; // nicht das eigene Ergebnis
      if (f.type === 'boundfill') f.cells = null; // andere Werkzeuge → andere Zellen
      const i = f.bodies.indexOf(id);
      if (i >= 0) f.bodies.splice(i, 1); else f.bodies.push(id);
      syncSelection();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    if ((f.type === 'shell' || f.type === 'endcap' || f.type === 'defeature' || f.type === 'thicken' || f.type === 'lippe') && h.kind === 'face') {
      if (f.type === 'endcap' && h.info.type !== 'PLANE') { toast('Für eine Endkappe die ebene Stirnfläche eines Stabs anklicken.'); return; }
      if (f.type === 'lippe' && h.info.type !== 'PLANE') { toast('Die ebene Randfläche der Schale anklicken (oben auf der Wand).'); return; }
      const i = f.faces.findIndex(r => sameFace(r, h.info));
      if (i >= 0) f.faces.splice(i, 1); else f.faces.push(faceRef(h.info));
      syncSelection();
      if (f.type === 'thicken') { renderFeatureDialog(true, false); return; }
      if (f.type === 'lippe') { renderFeatureDialog(true, false); scheduleBuild(0); return; }
      renderFeatureDialog(false);
      if (f.type === 'endcap') scheduleBuild(0);
      if (f.type === 'defeature') renderFeatureDialog(true, false);
    }
  }
}

/* ---------------- Komponenten (aus Körpern erstellen) ---------------- */
/* Neue Features merken sich die aktive Komponente (owner); ihre neuen Körper kommen dorthin */
function ownNew(f) { if (doc.activeComp && (doc.components || []).some(c => c.id === doc.activeComp) && f.type !== 'sketch') f.owner = doc.activeComp; }
function assignOwnedBodies(fresh) {
  const comps = doc.components || [];
  if (!fresh.length || !comps.length) return false;
  const owner = new Map([...doc.features, ...(editing && editing.isNew ? [editing.feature] : [])].filter(f => f.owner).map(f => [f.id, f.owner]));
  if (!owner.size) return false;
  const inComp = new Set(comps.flatMap(c => c.bodies));
  let changed = false;
  fresh.forEach(id => {
    if (inComp.has(id) || id.includes('/')) return;
    const c = comps.find(x => x.id === owner.get(id.split(':')[0]));
    if (c) { c.bodies.push(id); changed = true; }
  });
  if (changed) renderBrowser();
  return changed;
}
/* STEP-Baugruppe → Komponenten: beim ersten Auftauchen der Körper eines Imports mit mehreren Festkörpern
   eine Komponente mit dem Namen der Datei, darunter die Unterbaugruppen der Datei (`pfad` aus dem Kern) und je Einbau
   eines Teils (`occ`) eine Komponente; Namen je Ebene eindeutig („Name (2)“). Ohne Baum (ältere gespeicherte Namen):
   alle Teile flach, mehrere Festkörper eines Produkts bilden einen Einbau, bis derselbe Festkörper (k) wieder kommt.
   Mehrfach eingebaute Teile sind (noch) getrennte Komponenten, keine Instanzen. */
function importKomponenten(fresh, parts) {
  const meta = new Map((parts || []).filter(p => p.importName).map(p => [p.id, p]));
  const neu = (fresh || []).filter(id => meta.has(id));
  if (!neu.length) return false;
  if (!doc.components) doc.components = [];
  const inComp = new Set(doc.components.flatMap(c => c.bodies));
  const proImport = new Map();
  neu.forEach(id => { if (inComp.has(id)) return; const f = id.split(':')[0]; if (!proImport.has(f)) proImport.set(f, []); proImport.get(f).push(id); });
  let geaendert = false;
  for (const [fid, ids] of proImport) {
    const imp = doc.features.find(x => x.id === fid);
    if (!imp || imp.type !== 'import') continue;
    if (imp.format === 'step') { if (!imp.komp) geaendert = true; imp.komp = true; } // Gruppierung erledigt (auch nach Auflösen nicht noch einmal)
    if (ids.length < 2) continue;
    const parent = doc.activeComp && doc.components.some(c => c.id === doc.activeComp) ? doc.activeComp : null;
    const oben = { id: uid(), name: String(imp.name || 'STEP-Baugruppe').slice(0, 60), bodies: [], parent };
    doc.components.push(oben);
    const namen = new Set(doc.components.map(c => c.name)), offen = new Map(); // Teil → laufender Einbau
    // Namen je Ebene eindeutig: „Schraube“, „Schraube (2)“ … unter derselben Unterbaugruppe
    const ebenenNamen = new Map(), eindeutig = (parentId, n0) => {
      const s = ebenenNamen.get(parentId) || new Set(); ebenenNamen.set(parentId, s);
      let n = n0, k = 2; while (s.has(n)) n = `${n0} (${k++})`;
      s.add(n); return n;
    };
    const gruppen = new Map(), einbau = new Map(); // Pfad-Schlüssel → Komponente, Einbau-Nummer → Komponente
    const gruppe = pfad => {
      let parentId = oben.id;
      for (const p of pfad || []) {
        let c = gruppen.get(p.key);
        if (!c) { c = { id: uid(), name: eindeutig(parentId, String(p.name || 'Baugruppe').slice(0, 60)), bodies: [], parent: parentId }; doc.components.push(c); gruppen.set(p.key, c); }
        parentId = c.id;
      }
      return parentId;
    };
    ids.sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1])).forEach(id => {
      const m = meta.get(id), teil = String(m.teil || m.base).slice(0, 60);
      if (Number.isInteger(m.occ)) {
        let c = einbau.get(m.occ);
        if (!c) { const pid = gruppe(m.pfad); c = { id: uid(), name: eindeutig(pid, teil), bodies: [], parent: pid }; doc.components.push(c); einbau.set(m.occ, c); }
        // Instanz: die Komponente bekommt die Lage zum Original, der eingelesene Festkörper fällt weg (der Kern baut die
        // Kopie des Originals); das Original ist der erste Einbau und steht deshalb schon in `einbau`
        const orig = m.inst && einbau.get(m.inst.von);
        if (orig && orig !== c) {
          c.instanz = { von: orig.id, R: m.inst.R, t: m.inst.t };
          imp.ohne = [...new Set([...(imp.ohne || []), importNr(id)])];
          return;
        }
        c.bodies.push(id);
        return;
      }
      let ein = offen.get(teil);
      if (!ein || ein.k.has(m.k) || (m.nb || 1) < 2) {
        let name = teil, n = 2; while (namen.has(name)) name = `${teil} (${n++})`;
        namen.add(name);
        ein = { c: { id: uid(), name, bodies: [], parent: oben.id }, k: new Set() };
        doc.components.push(ein.c);
        offen.set(teil, ein);
      }
      ein.k.add(m.k);
      ein.c.bodies.push(id);
    });
    geaendert = true;
    if (imp.ohne && imp.ohne.length) scheduleBuild(0); // Instanzen: ohne die ersetzten Festkörper, mit den Kopien neu bauen
  }
  return geaendert;
}
/* Kopien der Instanzen („Instanz-ID~Körper-ID“) beim ersten Auftauchen in ihre Instanz-Komponente legen */
function instanzKoerper(fresh) {
  let geaendert = false;
  (fresh || []).forEach(id => {
    const i = id.indexOf('~');
    if (i < 0) return;
    const c = (doc.components || []).find(x => x.id === id.slice(0, i));
    if (c && !c.bodies.includes(id)) { c.bodies.push(id); geaendert = true; }
  });
  return geaendert;
}
/* Komponente als eigenes Teil (wie „Speichern unter“ einer Komponente): ihre Körper als STEP in ein neues
   Bauteil-Dokument, die untere Ecke an den Ursprung geschoben; Namen, Werkstoff und Farbe der Körper bleiben.
   Ergebnis { name, doc } – gespeichert wird in `compAlsTeilSpeichern`. */
async function compAlsTeil(id) {
  const c = (doc.components || []).find(x => x.id === id);
  if (!c) throw new Error('Komponente fehlt');
  const ids = compAllBodies(doc, id).filter(b => (lastBuild && lastBuild.bodies || []).includes(b));
  if (!ids.length) throw new Error('Die Komponente hat keinen Körper');
  const wahl = new Set(ids), m = lastBuild.mesh;
  const { buf } = await kernel.exportFile(doc.features, 'step', { ...kctx(), hidden: lastBuild.bodies.filter(b => !wahl.has(b)) });
  const bs = m.bodies.filter(b => wahl.has(b.id));
  const lo = [0, 1, 2].map(k => Math.min(...bs.map(b => b.bbox[0][k])));
  const name = c.name, teil = newDoc(name);
  const f = { id: uid(), type: 'import', name, format: 'step', file: `${name}.step`, dx: -lo[0], dy: -lo[1], dz: -lo[2], data: new TextDecoder().decode(buf) };
  teil.features.push(f);
  // Körper-IDs im neuen Teil: ein Festkörper → Import-ID, mehrere → „ID:k“ in der Reihenfolge des Exports
  const reihe = lastBuild.bodies.filter(b => wahl.has(b));
  reihe.forEach((b, k) => { const src = bodyInfo(b) || {}; teil.bodies[reihe.length > 1 ? `${f.id}:${k}` : f.id] = { name: src.name || 'Körper', hidden: false, ...(src.material ? { material: src.material } : {}), ...(src.color ? { color: src.color } : {}) }; });
  return { name, doc: teil };
}
async function compAlsTeilSpeichern(id) {
  let r;
  try { r = await compAlsTeil(id); } catch (err) { toast('Als Teil speichern nicht möglich: ' + err.message); return; }
  const json = JSON.stringify(r.doc, null, 1), datei = `${r.name.replace(/[\\/:*?"<>|]+/g, '_')}.cantcodecad`;
  let path = null;
  if (await nativeCaps()) {
    try { path = await pickFile('save', datei); } catch (err) { toast(err.message); return; }
    if (!path) return;
    if (!/\.cantcodecad$/i.test(path)) path += '.cantcodecad';
    try { await writeFile(path, json); } catch (err) { toast(err.message); return; }
  } else if (await projectFiles()) {
    path = datei;
    const res = await fetch('/__save?path=' + encodeURIComponent(path), { method: 'POST', body: json }).catch(() => null);
    if (!res || !res.ok) { toast('Speichern im Projektordner nicht möglich.'); return; }
  } else { download(datei, new Blob([json], { type: 'application/json' })); toast(`„${r.name}“ als ${datei} gespeichert (Download).`); return; }
  addRecent(path, r.name, 'part');
  if (await askConfirm(`„${r.name}“ ist als eigenes Teil gespeichert (${fileLabel(path)}). Jetzt öffnen?`, 'Öffnen')) openProjectFile(path);
}
/* Komponente bearbeiten: aktivieren (die übrigen werden durchscheinend, neue Features landen darin) und
   heranzoomen; die Leiste oben im Fenster zeigt, was bearbeitet wird, „Fertig“ führt zur obersten Ebene zurück. */
function bearbeiteComp(id) {
  const c0 = (doc.components || []).find(c => c.id === id);
  if (!c0) return;
  // Instanz: bearbeitet wird das Original (die Änderung gilt für alle Einbauten)
  const orig = c0.instanz && (doc.components || []).find(c => c.id === c0.instanz.von);
  if (orig) { toast(`„${c0.name}“ ist eine Instanz von „${orig.name}“ – bearbeitet wird das Original, Änderungen gelten für alle Einbauten.`, 6000); id = orig.id; }
  activateComp(id, true); // die Leiste oben sagt es schon
  const ids = new Set(compAllBodies(doc, id)), m = lastBuild && lastBuild.mesh;
  const bs = ((m && m.bodies) || []).filter(b => ids.has(b.id) && b.bbox);
  if (bs.length) vp.fitBox([[0, 1, 2].map(k => Math.min(...bs.map(b => b.bbox[0][k]))), [0, 1, 2].map(k => Math.max(...bs.map(b => b.bbox[1][k])))]);
}
function zeigeCompLeiste() {
  let el = $('#compbar');
  const c = doc.activeComp && (doc.components || []).find(x => x.id === doc.activeComp);
  if (!c) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('div'); el.id = 'compbar'; el.className = 'compbar'; $('#viewport').appendChild(el); }
  el.innerHTML = `${icon('component', 15)}<span>Komponente bearbeiten: <b>${esc(compPath(doc, c.id))}</b></span><button type="button" class="btn primary" data-cmd="comp-activate" data-id="">Fertig</button>`;
  el.hidden = false;
}
function activateComp(id, leise = false) {
  if (id && !(doc.components || []).some(c => c.id === id)) return;
  if ((doc.activeComp || null) === (id || null)) return;
  if (id) doc.activeComp = id; else delete doc.activeComp;
  store(); renderBrowser(); updateHint(); vp.setFaded(fadedBodies()); zeigeCompLeiste();
  ribbonSync(id ? 'solid' : 'asm');
  if (!leise) toast(id ? `${compPath(doc, id)} ist aktiv. Neue Körper kommen in diese Komponente.` : `${doc.name} (oberste Ebene) ist aktiv.`);
}
function renameComp(id, el) {
  const c = (doc.components || []).find(x => x.id === id);
  if (!c || !el) return;
  const span = el.querySelector('span');
  const inp = document.createElement('input');
  inp.className = 'b-rename'; inp.value = c.name; inp.spellcheck = false;
  span.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = inp.value.trim().slice(0, 60);
    if (ok && v && v !== c.name) { pushHistory(); c.name = v; store(); }
    renderBrowser(); updateHint();
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}
/* Körper in die aktive Komponente bzw. auf die oberste Ebene */
function moveBodyToComp(bodyId, compId) {
  pushHistory();
  (doc.components || []).forEach(c => { c.bodies = c.bodies.filter(b => b !== bodyId); });
  if (compId) { const c = doc.components.find(x => x.id === compId); if (c) c.bodies.push(bodyId); }
  store(); renderBrowser(); scheduleBuild(0);
}
let compDraft = null;
function openComponentDialog() {
  if (editing) cancelEditing();
  if (mode === 'measure') closeMeasure();
  let n = 1; const names = new Set((doc.components || []).map(c => c.name));
  while (names.has('Komponente' + n)) n++;
  compDraft = { name: 'Komponente' + n, bodies: [], activate: true };
  setMode('component');
  vp.setPickMode('face');
  renderComponentDialog();
}
function renderComponentDialog() {
  const d = $('#dialog'), ids = (lastBuild && lastBuild.bodies) || [];
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('component', 20)}<input class="dname" data-comp="name" value="${esc(compDraft.name)}" aria-label="Name"></header><div class="dbody">
    <div class="row col"><span>Körper</span><div class="btns bchips">${ids.map(id => `<button type="button" class="chip" data-cmd="compdraft-pick" data-id="${esc(id)}" aria-pressed="${compDraft.bodies.includes(id)}">${icon('body', 14)} ${esc(bodyName(id))}${compOf(id) ? ` <em>(${esc(compName(compOf(id)))})</em>` : ''}</button>`).join('')}</div></div>
    <label class="check"><input type="checkbox" data-comp="activate"${compDraft.activate ? ' checked' : ''}> Aktivieren (neue Körper kommen hinein)</label>
    <p class="info">${doc.activeComp ? `Wird angelegt in: <b>${esc(compPath(doc, doc.activeComp))}</b>. ` : ''}Vorhandene Körper im Modell anklicken oder oben wählen, oder leer anlegen und danach konstruieren. Ein Körper gehört zu genau einer Komponente; Gelenke bewegen die Komponente samt Unterkomponenten.</p>
    </div><footer><button type="button" class="btn primary" data-cmd="comp-ok">OK</button><button type="button" class="btn" data-cmd="comp-cancel">Abbrechen</button></footer>`;
  d.hidden = false;
  const m = lastBuild && lastBuild.mesh, faces = [];
  if (m) m.bodies.forEach(b => { if (compDraft.bodies.includes(b.id)) for (let i = b.faces[0]; i < b.faces[1]; i++) faces.push(i); });
  vp.setSelection({ faces });
}
function closeComponentDialog() { compDraft = null; closeDialog(); vp.setSelection({}); vp.setPickMode('none'); setMode('model'); }
function commitComponent() {
  if (!compDraft) return;
  pushHistory();
  if (!doc.components) doc.components = [];
  doc.components.forEach(c => { c.bodies = c.bodies.filter(id => !compDraft.bodies.includes(id)); });
  const parent = doc.activeComp && doc.components.some(c => c.id === doc.activeComp) ? doc.activeComp : null;
  const nc = { id: uid(), name: compDraft.name.trim().slice(0, 60) || 'Komponente', bodies: compDraft.bodies.slice(), parent };
  doc.components.push(nc);
  if (compDraft.activate) doc.activeComp = nc.id;
  const act = compDraft.activate;
  store();
  closeComponentDialog();
  renderBrowser(); updateHint(); vp.setFaded(fadedBodies());
  ribbonSync(act ? 'solid' : undefined);
  toast(act ? `${nc.name} ist aktiv. Neue Körper kommen in diese Komponente.` : 'Komponente erstellt. Mit Gelenk (J) lässt sie sich an andere Teile setzen.');
}
async function dissolveComponent(id) {
  const c = (doc.components || []).find(x => x.id === id);
  if (!c) return;
  const deps = dependents(doc, id);
  if (deps.length && !(await askConfirm(`${c.name} wird von ${deps.map(d => d.name).join(', ')} benutzt. Trotzdem auflösen?`, 'Auflösen'))) return;
  pushHistory();
  const up = c.parent || null, pc = up && doc.components.find(x => x.id === up);
  if (pc) pc.bodies.push(...c.bodies);
  doc.components.forEach(x => { if (x.parent === id) x.parent = up; });
  doc.features.forEach(f => { if (f.owner === id) { if (up) f.owner = up; else delete f.owner; } });
  if (doc.activeComp === id) { if (up) doc.activeComp = up; else delete doc.activeComp; }
  doc.components = doc.components.filter(x => x.id !== id);
  store();
  renderBrowser(); updateHint(); ribbonSync();
  scheduleBuild(0);
}
function toggleComp(id) {
  const ins = (doc.inserts || []).find(x => x.id === id);
  const c = ins ? { bodies: insertBodies(id) } : (doc.components || []).some(x => x.id === id) ? { bodies: compAllBodies(doc, id) } : null;
  if (!c) return;
  const allHidden = c.bodies.every(b => bodyInfo(b) && bodyInfo(b).hidden);
  c.bodies.forEach(b => { const bi = bodyInfo(b); if (bi) bi.hidden = !allHidden; });
  store();
  renderBrowser();
  scheduleBuild(0);
}
$('#dialog').addEventListener('input', e => {
  if (e.target.dataset.comp === 'name' && compDraft) compDraft.name = e.target.value;
  if (e.target.dataset.kontakt) kontaktUi.eingabe(e.target);
  if (e.target.dataset.pt && editing && editing.feature.type === 'point') { const f = editing.feature; f.base = { ...(f.base || { kind: 'coords' }), kind: 'coords', [e.target.dataset.pt]: Number(e.target.value) || 0 }; refreshWorkPlanes(); scheduleBuild(140); }
  if (e.target.dataset.comp === 'activate' && compDraft) compDraft.activate = e.target.checked;
  const jr = e.target.dataset.jrange;
  if (jr && editing && (editing.feature.type === 'joint' || editing.feature.type === 'align')) {
    const v = num(e.target.value), alt = Number(editing.feature[jr]) || 0;
    editing.feature[jr] = v;
    if (editing.feature.type === 'joint') kontaktPruefe(editing.feature, jr, alt);
    const inp = $(`#dialog [data-k="${jr}"]`);
    if (inp) inp.value = inp.dataset.u === 'len' ? lenToField(v) : v;
    scheduleBuild(30);
  }
});
$('#dialog').addEventListener('click', e => {
  const b = e.target.closest('[data-cmd="compdraft-pick"]');
  if (!b || !compDraft) return;
  const id = b.dataset.id;
  compDraft.bodies = compDraft.bodies.includes(id) ? compDraft.bodies.filter(x => x !== id) : [...compDraft.bodies, id];
  renderComponentDialog();
});

/* Gelenk bewegen: Winkel bzw. Versatz einmal durchlaufen lassen */
let jointAnim = false;
async function playJoint() {
  if (!editing || (editing.feature.type !== 'joint' && editing.feature.type !== 'align')) return;
  if (jointAnim) { jointAnim = false; return; }
  const f = editing.feature, key = f.kind === 'slider' ? 'offset' : 'angle', cyl = f.kind === 'cylindrical';
  const v0 = Number(f[key]) || 0, o0 = Number(f.offset) || 0, steps = 48, span = key === 'angle' ? 360 : 40;
  const lim = f.limits && Number.isFinite(Number(f.lmin)) && Number.isFinite(Number(f.lmax));
  const lo = lim ? Math.min(f.lmin, f.lmax) : 0, hi = lim ? Math.max(f.lmin, f.lmax) : 0;
  const r2 = v => Math.round(v * 100) / 100;
  jointAnim = true;
  renderFeatureDialog(true, false);
  let vor = { [key]: v0, offset: o0 };
  for (let i = 1; i <= steps && jointAnim && editing && editing.feature === f; i++) {
    const t = i / steps, wave = (1 - Math.cos(t * Math.PI * 2)) / 2; // 0 → 1 → 0
    if (lim && !cyl) f[key] = r2(lo + (hi - lo) * wave);
    else {
      f[key] = r2(key === 'angle' ? v0 + span * t : v0 + span * Math.sin(t * Math.PI * 2));
      if (key === 'angle' && f[key] > 180) f[key] -= 360;
    }
    if (cyl) f.offset = r2(lim ? lo + (hi - lo) * wave : o0 + 20 * Math.sin(t * Math.PI * 2));
    if (kontaktUi.aktiv()) {
      const felder = { [key]: [vor[key], f[key]] };
      if (cyl) felder.offset = [vor.offset, f.offset];
      let r = null;
      try { r = await kontaktUi.begrenze(f, felder); } catch (_) { r = null; }
      if (r) {
        Object.assign(f, r.werte);
        await runBuild();
        toast(kontaktUi.meldung(r.paar));
        await new Promise(ok => setTimeout(ok, 900)); // Kontaktstellung kurz zeigen
        break;
      }
      vor = { [key]: f[key], offset: f.offset };
    }
    await runBuild();
  }
  if (editing && editing.feature === f) { f[key] = v0; if (cyl) f.offset = o0; jointAnim = false; renderFeatureDialog(true, false); scheduleBuild(0); }
  jointAnim = false;
}

const { insertOnSheet, computeBom, openRevEditor, renderSheetsForExport, DVIEWS, applyDrawOpt, curDims, drawSheets, drawing, openDrawing, renderDrawRibbon, renderDrawing, setCurDims, startPlaceView } = setupDrawingWorkspace({ get doc() { return doc; }, get editing() { return editing; }, get lastBuild() { return lastBuild; }, get mode() { return mode; }, get kernel() { return kernel; }, get caretSvg() { return caretSvg; }, get $() { return $; }, get angTxt() { return angTxt; }, get bodyInfo() { return bodyInfo; }, get bodyName() { return bodyName; }, get cancelEditing() { return cancelEditing; }, get closeMeasure() { return closeMeasure; }, get closeNesting() { return closeNesting; }, get closeRender() { return closeRender; }, get cutListRows() { return cutListRows; }, get esc() { return esc; }, get fmt() { return fmt; }, get fmtMass() { return fmtMass; }, get hasBody() { return hasBody; }, get insertBodies() { return insertBodies; }, get kctx() { return kctx; }, get pushHistory() { return pushHistory; }, get setMode() { return setMode; }, get setStatus() { return setStatus; }, get sheetRule() { return sheetRule; }, get showCtx() { return showCtx; }, get store() { return store; }, get toast() { return toast; }, get weldRows() { return weldRows; } });
/* ---------------- Arbeitsbereich Rendern (src/render.js) ---------------- */
const rendering = createRender({
  getMesh: () => lastBuild && lastBuild.mesh,
  bodyLook: id => { const b = bodyInfo(id) || {}; return { color: bodyColor(b), material: b.material || 'none' }; },
  getView: () => ({ position: vp.camera.position.toArray(), target: vp.controls.target.toArray(), up: vp.camera.up.toArray(), fov: vp.perspCam.fov }),
  toast, download: (n, b) => download(n, b), fileName: () => safeName(),
  getDoc: () => doc, store: () => store()
});
function openRender() {
  if (editing) cancelEditing();
  if (mode === 'measure') closeMeasure();
  if (mode === 'drawing') closeDrawing();
  if (mode === 'nesting') closeNesting();
  if (!hasBody()) { toast('Erst einen Körper erstellen.'); return; }
  setMode('render');
  renderWsRibbon('Rendern', 'render', 'Bild mit Licht und Material', 'render-close');
  rendering.open($('#viewport'));
}
function closeRender() {
  rendering.close();
  closeRibbonMenu();
  renderRibbon();
  setMode('model');
  scheduleBuild(0);
}
/* Werkzeugleiste eines einfachen Arbeitsbereichs: Arbeitsbereich-Knopf, Kurzbeschreibung, Schließen */
function renderWsRibbon(title, ic, label, closeCmd) {
  $('#ribbon').innerHTML = `
    <div class="rtabs">
      <button type="button" class="wsbtn" data-menu="ws">${esc(title)} ${caretSvg}</button>
      <span class="rtab" aria-selected="true">${esc(title)}</span>
    </div>
    <div class="rbody">
      <div class="fgroup g-dcreate"><div class="ftools"><span class="nhint">${icon(ic, 28)}</span></div><span class="fglabel static">${esc(label)}</span></div>
      <div class="fgroup g-dfinish"><div class="ftools"><button type="button" class="fbtn finish stop" data-cmd="${closeCmd}" title="${esc(title)} schließen" aria-label="${esc(title)} schließen">${icon('close', 28)}</button></div><span class="fglabel static">Schließen</span></div>
    </div>`;
}

/* ---------------- Arbeitsbereich Verschachtelung (Nesting, src/nesting.js) ---------------- */
const nesting = createNesting({ getDoc: () => doc, getLastBuild: () => lastBuild, sheetRule: () => sheetRule(), toast, download: (n, b) => download(n, b) });
function openNesting() {
  if (editing) cancelEditing();
  if (mode === 'measure') closeMeasure();
  if (mode === 'drawing') closeDrawing();
  if (mode === 'render') closeRender();
  setMode('nesting');
  renderNestRibbon();
  nesting.open($('#viewport'));
}
function closeNesting() {
  nesting.close();
  closeRibbonMenu();
  renderRibbon();
  setMode('model');
  scheduleBuild(0);
}
function renderNestRibbon() {
  $('#ribbon').innerHTML = `
    <div class="rtabs">
      <button type="button" class="wsbtn" data-menu="ws">Verschachtelung ${caretSvg}</button>
      <span class="rtab" aria-selected="true">Verschachtelung</span>
    </div>
    <div class="rbody">
      <div class="fgroup g-dcreate"><div class="ftools"><span class="nhint">${icon('nest', 28)}</span></div><span class="fglabel static">Blechteile auf Tafeln</span></div>
      <div class="fgroup g-dfinish"><div class="ftools"><button type="button" class="fbtn finish stop" data-cmd="nest-close" title="Verschachtelung schließen" aria-label="Verschachtelung schließen">${icon('close', 28)}</button></div><span class="fglabel static">Schließen</span></div>
    </div>`;
}
function closeDrawing() {
  drawing.open = false;
  drawing.placing = null;
  const el = $('#drawing');
  if (el) el.hidden = true;
  closeRibbonMenu();
  renderRibbon();
  setMode('model');
  scheduleBuild(0);
}
function drawingPrint() {
  if (!drawing.last || !drawing.data) return;
  const { W, H } = drawing.last;
  // alle Blätter, je Seite eines
  const svg = drawSheets().map((_, i) => (i === drawing.sheet ? drawing.last.svg : renderSheet(drawing.data, { ...sheetOpts(i), draft: null }).svg)).join('<div style="break-after:page"></div>');
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.name)}</title><style>@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0}svg{width:${W}mm;height:${H}mm;display:block}</style></head><body>${svg}</body></html>`;
  fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Drucken nicht möglich: ' + e.message); } setTimeout(() => fr.remove(), 60000); };
  document.body.appendChild(fr);
}
/* DWG für das aktuelle Blatt: dasselbe Blatt wie beim DXF-Export, nur als binäre DWG-Datei (R12). */
async function drawingDwg() {
  const svg = $('#drawing .sheet svg');
  if (!svg) return;
  toast('DWG-Datei wird geschrieben …');
  try {
    const data = await sheetToDwg(svg);
    download(`${safeName()}-Zeichnung${drawing.sheet ? `-Blatt${drawing.sheet + 1}` : ''}.dwg`, new Blob([data], { type: 'application/octet-stream' }));
  } catch (e) {
    toast('DWG-Export nicht möglich: ' + (e && e.message || e));
  }
}
document.addEventListener('change', e => {
  const t = e.target.closest('[data-dopt]');
  if (!t) return;
  drawing.opts[t.dataset.dopt] = t.type === 'checkbox' ? t.checked : t.value;
  applyDrawOpt(t.dataset.dopt);
});

const { openBom, downloadBom, downloadBomFor } = setupBomWindow({
  get lastBuild() { return lastBuild; }, get editing() { return editing; }, cancelEditing: () => cancelEditing(),
  esc: (...a) => esc(...a), fmt: (...a) => fmt(...a), fmtMass: g => fmtMass(g), toast: (...a) => toast(...a), setMode: m => setMode(m),
  download: (n, b) => download(n, b), safeName: () => safeName(),
  computeBom: bodies => computeBom(bodies),
  // Einzelteil: eine Zeile (wie im Fertigungspaket)
  singleRow() {
    const ids = ((lastBuild && lastBuild.bodies) || []).filter(id => !(bodyInfo(id) || {}).hidden), vol = new Map(((lastBuild && lastBuild.mesh && lastBuild.mesh.bodies) || []).map(b => [b.id, b.volume || 0]));
    if (!ids.length) return null;
    const mat = MATERIALS[(bodyInfo(ids[0]) || {}).material] || MATERIALS.none, g = mat.rho ? ids.reduce((a, id) => a + (vol.get(id) || 0) / 1000 * mat.rho, 0) : 0;
    return { pos: 1, qty: 1, name: doc.name || 'Teil', material: mat.rho ? mat.label : '–', mass: g ? fmtMass(g) : '–', g, ids };
  }
});
const { openDraftAnalysis, closeDraftAnalysis, renderDraftAnalysis, draftState } = setupDraftAnalysis({
  get lastBuild() { return lastBuild; }, get mode() { return mode; }, vp,
  toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog()
});
/* Festigkeit von Rahmen (Extras → Stahlbau): Stabwerk aus den Rahmenstäben, src/framesim-ui.js */
const { openFrameSim, closeFrameSim, frameSimPick, renderFrameSim, frameSimCmd, frameSimInput } = setupFrameSim({
  get lastBuild() { return lastBuild; }, get doc() { return doc; }, get mode() { return mode; }, vp,
  esc: (...a) => esc(...a), toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog(),
  pushHistory: () => pushHistory(), store: () => store(), bodyIdAtFace: i => bodyIdAtFace(i), bodyName: id => bodyName(id),
  isHidden: id => !!(bodyInfo(id) || {}).hidden
});
$('#dialog').addEventListener('change', e => { if (mode === 'framesim' && e.target.dataset.fs) frameSimInput(e.target); });
$('#dialog').addEventListener('input', e => { if (mode === 'framesim' && (e.target.dataset.fs === 'F' || e.target.dataset.fs === 'q')) frameSimInput(e.target); });
/* Festigkeit eines Bauteils (Prüfen): Voxel-FEM im Worker, src/solidsim-ui.js */
const { openSolidSim, closeSolidSim, solidSimPick, renderSolidSim, solidSimCmd, solidSimInput } = setupSolidSim({
  get lastBuild() { return lastBuild; }, get doc() { return doc; }, get mode() { return mode; }, vp,
  esc: (...a) => esc(...a), toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog(),
  pushHistory: () => pushHistory(), store: () => store(), bodyIdAtFace: i => bodyIdAtFace(i), bodyName: id => bodyName(id),
  isHidden: id => !!(bodyInfo(id) || {}).hidden, selectedBody: () => (modelSel.faces[0] ? bodyIdAtFace(modelSel.faces[0].info) : null)
});
$('#dialog').addEventListener('change', e => { if (mode === 'solidsim' && e.target.dataset.ss) solidSimInput(e.target); });
$('#dialog').addEventListener('input', e => { if (mode === 'solidsim' && e.target.dataset.ss === 'F') solidSimInput(e.target); });
const { openSimilar, closeSimilar, similarPick, similarCmd, similarInput, refreshSimilar } = setupSimilar({
  get lastBuild() { return lastBuild; }, get mode() { return mode; }, get kernel() { return kernel; }, vp,
  esc: (...a) => esc(...a), fmt: (...a) => fmt(...a), toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog(),
  bodyIdAtFace: i => bodyIdAtFace(i), bodyName: id => bodyName(id), compOf: id => compOf(id), compName: id => compName(id),
  isHidden: id => !!(bodyInfo(id) || {}).hidden, selectedBody: () => (modelSel.faces[0] ? bodyIdAtFace(modelSel.faces[0].info) : null),
  bodyColorMap: () => bodyColorMap(), fadedBodies: () => fadedBodies()
});
$('#dialog').addEventListener('input', e => { if (mode === 'similar' && e.target.dataset.sim) similarInput(e.target); });
var kontaktUi = setupKontakt({ // var: renderBrowser kann vor dieser Zeile laufen
  get doc() { return doc; }, get lastBuild() { return lastBuild; }, get kernel() { return kernel; }, vp,
  esc: (...a) => esc(...a), toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog(),
  kctx: () => kctx(), bodyName: id => bodyName(id), compOf: id => compOf(id), compAllBodies: id => compAllBodies(doc, id),
  insertBodies: id => insertBodies(id), bodyIdAtFace: info => bodyIdAtFace(info), uid: () => uid(),
  pushHistory: () => pushHistory(), store: () => store(), renderBrowser: () => renderBrowser()
});
/* Kontaktsätze: ein neuer Gelenkwert wird geprüft; berührt dabei ein Glied ein anderes, hält das Gelenk am Kontakt an.
   Gezählt wird vom zuletzt erlaubten Wert aus (Schieberegler: nur die letzte Eingabe zählt). */
const kontaktStand = new WeakMap();
let kontaktZug = 0, kontaktUhr = 0, kontaktOffen = null;
function kontaktPruefe(f, k, alt) {
  if (!kontaktUi.aktiv()) return;
  // noch offene Prüfung desselben Felds (Tippen „9“, „90“): von deren Ausgangswert aus rechnen
  const von = kontaktOffen && kontaktOffen.f === f && kontaktOffen.k === k ? kontaktOffen.von : (kontaktStand.get(f) || {})[k] ?? alt;
  const nach = Number(f[k]), zug = ++kontaktZug;
  kontaktOffen = { f, k, von };
  clearTimeout(kontaktUhr);
  kontaktUhr = setTimeout(async () => {
    let r = null;
    try { r = await kontaktUi.begrenze(f, { [k]: [von, nach] }); } catch (_) { kontaktOffen = null; return; }
    if (zug !== kontaktZug || !editing || editing.feature !== f) return;
    kontaktOffen = null;
    const ok = r ? r.werte[k] : nach;
    kontaktStand.set(f, { ...(kontaktStand.get(f) || {}), [k]: ok });
    if (r) { f[k] = ok; renderFeatureDialog(true, false); scheduleBuild(0); toast(kontaktUi.meldung(r.paar)); }
  }, 120);
}
const { oeffneAntrieb, antriebEingabe, antriebSchliessen } = setupAntrieb({
  get doc() { return doc; }, kontakt: kontaktUi, esc: (...a) => esc(...a), toast: (...a) => toast(...a), setMode: m => setMode(m),
  closeDialog: () => closeDialog(), scheduleBuild: (...a) => scheduleBuild(...a), pushHistory: () => pushHistory(), store: () => store()
});
$('#dialog').addEventListener('change', e => { if (mode === 'antrieb' && e.target.dataset && e.target.dataset.antrieb) antriebEingabe(e.target); });
const { openMotion, closeMotion, motionCmd, motionInput } = setupMotion({
  get doc() { return doc; }, get mode() { return mode; }, get kernel() { return kernel; }, vp, kontakt: kontaktUi,
  esc: (...a) => esc(...a), fmt: (...a) => fmt(...a), toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog(),
  kctx: () => kctx(), bodyName: id => bodyName(id), bodyColorMap: () => bodyColorMap(), scheduleBuild: (...a) => scheduleBuild(...a),
  pushHistory: () => pushHistory(), store: () => store()
});
// Schieberegler sofort, Zahlenfelder bei Bestätigung (sonst verliert das Feld beim Neuzeichnen den Fokus)
$('#dialog').addEventListener('input', e => { if (mode === 'motion' && e.target.dataset.mot === 'pos') motionInput(e.target); });
$('#dialog').addEventListener('change', e => { if (mode === 'motion' && (e.target.dataset.mot && e.target.dataset.mot !== 'pos' || e.target.dataset.motSpur)) motionInput(e.target); });
const { openExplode, closeExplode, playExplode, refreshExplode, explodeVideo } = setupExplode({
  get lastBuild() { return lastBuild; }, get mode() { return mode; }, get doc() { return doc; }, vp, compOf: id => compOf(id),
  compName: id => compName(id), bodyName: id => bodyName(id), esc: (...a) => esc(...a), store: () => store(), pushHistory: () => pushHistory(),
  toast: (...a) => toast(...a), setMode: m => setMode(m), closeDialog: () => closeDialog(),
  download: (n, b) => download(n, b), fileName: () => safeName()
});
const { openDxfSettings, commitDxfSettings, resetDxfSettings, openDxfImport, commitDxfImport } = setupDxfUi({
  get esc() { return esc; }, get toast() { return toast; }, get setMode() { return setMode; }, get closeFileDialog() { return closeFileDialog; }, get ORIGIN_PLANES() { return ORIGIN_PLANES; },
  selectedFacePlane() { const f = modelSel.faces.length === 1 && modelSel.faces[0].info && modelSel.faces[0].info.type === 'PLANE' ? modelSel.faces[0].info.plane : null; return f ? { key: 'FACE', label: 'Fläche des Körpers', o: round9(f.o), x: round9(f.x), y: round9(f.y), n: round9(f.n) } : null; },
  addSketch(sk) { pushHistory(); doc.features.push({ id: uid(), ...sk }); store(); renderAll(); scheduleBuild(0); }
});
const { oeffneKunststoffRegel, kunststoffEingabe, kunststoffOk, kunststoffVorgaben } = setupKunststoff({
  get doc() { return doc; }, get lastBuild() { return lastBuild; }, esc: (...a) => esc(...a), toast: (...a) => toast(...a),
  setMode: m => setMode(m), closeFileDialog: () => closeFileDialog(), pushHistory: () => pushHistory(), applyParams: () => applyParams(),
  store: () => store(), renderAll: () => renderAll(), scheduleBuild: (...a) => scheduleBuild(...a), materialName: k => (MATERIALS[k] || {}).label || k
});
$('#dialog').addEventListener('change', e => { if (e.target.dataset && e.target.dataset.kst) kunststoffEingabe(e.target); });
const blechpaket = setupBlechpaket({
  get doc() { return doc; }, get lastBuild() { return lastBuild; }, get mode() { return mode; }, kernel,
  esc: (...a) => esc(...a), fmt: (...a) => fmt(...a), toast: (...a) => toast(...a), setMode: m => setMode(m),
  closeDialog: () => closeDialog(), closeFileDialog: () => closeFileDialog(), bodyName: id => bodyName(id),
  bodyHidden: id => !!(bodyInfo(id) || {}).hidden, sheetRule: () => sheetRule(), flatDXF: (...a) => flatDXF(...a),
  dxfPrefs: () => dxfPrefs(), download: (n, b) => download(n, b), safeName: () => safeName(), makeZip: f => makeZip(f),
  showFlat: (f, t) => showFlat(f, t),
  materials: MATERIALS, bodyMaterial: id => (bodyInfo(id) || {}).material || 'none',
  toNesting: list => { nesting.addFlats(list); openNesting(); }
});
$('#dialog').addEventListener('change', e => { if (e.target.dataset && e.target.dataset.bp) blechpaket.blechpaketEingabe(e.target); });
const { cfgRegelCmd, exportConfigs, activateConfig, applyParams, cfgAddCol, cfgAddRow, cfgDelCol, cfgDelRow, commitConfigs, commitParams, featureExpr, openConfigs, openParams, paramsAdd, paramsDel } = setupParams({ get packageFiles() { return packageFiles; }, get download() { return download; }, get safeName() { return safeName; }, get kctx() { return kctx; }, get sheetRule() { return sheetRule; }, get kernel() { return kernel; }, get lastBuild() { return lastBuild; }, get building() { return !$('#busy').hidden; }, get doc() { return doc; }, get editing() { return editing; }, get $() { return $; }, get $$() { return $$; }, get cancelEditing() { return cancelEditing; }, get closeFileDialog() { return closeFileDialog; }, get esc() { return esc; }, get fmt() { return fmt; }, get pushHistory() { return pushHistory; }, get renderAll() { return renderAll; }, get scheduleBuild() { return scheduleBuild; }, get setMode() { return setMode; }, get store() { return store; }, get toast() { return toast; } });
/* ---------------- Blech: Regel und Abwicklung ---------------- */
/* Eigene Blechregeln: gelten für alle Dokumente (Browser-Speicher), mitgelieferte stehen in RULE_LIBRARY */
const RULES_STORE = new URLSearchParams(location.search).has('test') ? 'cantcodecad.smrules.test' : 'cantcodecad.smrules';
function userRules() {
  try { const a = JSON.parse(localStorage.getItem(RULES_STORE) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.name === 'string' && Number(x.t) > 0) : []; } catch (_) { return []; }
}
function saveUserRules(a) { try { localStorage.setItem(RULES_STORE, JSON.stringify(a)); return true; } catch (_) { return false; } }
const allRules = () => [...RULE_LIBRARY.map(x => ({ ...x, lib: true })), ...userRules()];
function ruleOptions(sel) {
  const o = x => `<option value="${esc(x.name)}"${x.name === sel ? ' selected' : ''}>${esc(x.name)}</option>`, u = userRules();
  return `<option value=""${sel ? '' : ' selected'}>– eigene Werte –</option><optgroup label="Mitgeliefert">${RULE_LIBRARY.map(o).join('')}</optgroup>`
    + (u.length ? `<optgroup label="Eigene">${u.map(o).join('')}</optgroup>` : '');
}
function openSheetRule() {
  if (editing) cancelEditing();
  const R0 = sheetRule(), d = $('#dialog');
  const known = R0.name && allRules().some(x => x.name === R0.name) ? R0.name : '';
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('smrule', 20)}<b class="dtitle">Blechregel</b></header><div class="dbody">
    <label class="row"><span>Bibliothek</span><select data-rule="lib">${ruleOptions(known)}</select></label>
    <label class="row"><span>Name</span><input type="text" data-rule="name" value="${esc(R0.name || '')}" placeholder="z. B. Stahl 2 mm, Kunde X"></label>
    <label class="row"><span>Dicke</span><span class="num"><input type="number" step="${UF === 1 ? 0.1 : 'any'}" min="0" data-rule="t" value="${lenToField(R0.t)}"><em>${UNIT}</em></span></label>
    <label class="row"><span>Biegeradius innen</span><span class="num"><input type="number" step="${UF === 1 ? 0.1 : 'any'}" min="0" data-rule="r" value="${lenToField(R0.r)}"><em>${UNIT}</em></span></label>
    <label class="row"><span>Eckfreischnitt</span><select data-rule="cornerRelief" title="quadratisch oder rund: Eckfreischnitt an Laschenecken und an gebogenen Ecken der Abwicklung eines umgewandelten Körpers. „ohne“ betrifft nur den umgewandelten Körper – ohne Freischnitt steht die Ecke, die Abwicklung bekommt dort eine ausgefranste Kontur (Laschen ohne Freischnitt: „Reißecke“ am Feature). Breite: ⌀-Feld, sonst 2 × Dicke bei Laschen und Dicke beim umgewandelten Körper."><option value="square"${R0.cornerRelief === 'round' || R0.cornerRelief === 'none' ? '' : ' selected'}>quadratisch</option><option value="round"${R0.cornerRelief === 'round' ? ' selected' : ''}>rund</option><option value="none"${R0.cornerRelief === 'none' ? ' selected' : ''}>ohne</option></select></label>
    <label class="row"><span>⌀ Eckfreischnitt</span><span class="num"><input type="number" step="${UF === 1 ? 0.5 : 'any'}" min="0" data-rule="cornerReliefD" value="${R0.cornerReliefD ? lenToField(R0.cornerReliefD) : ''}" placeholder="2 × Dicke"><em>${UNIT}</em></span></label>
    <label class="row"><span>K-Faktor</span><span class="num"><input type="number" step="0.01" min="0" max="1" data-rule="k" value="${R0.k}"><em></em></span></label>
    <p class="info small">Faustwerte: Stahl R ≈ t, K 0,44 · Alu R ≈ 1,5 t, K 0,43 · Edelstahl R ≈ 2 t, K 0,45. Gilt für alle Blechfeatures dieses Teils.</p>
    <div class="row"><span>Bibliothek</span><span class="btnpair"><button type="button" class="btn" data-cmd="sm-rule-save" title="Unter dem Namen in der Bibliothek speichern">Speichern</button> <button type="button" class="btn" data-cmd="sm-rule-del" title="Gewählte eigene Regel aus der Bibliothek löschen"${userRules().some(x => x.name === known) ? '' : ' disabled'}>Löschen</button></span></div>
    </div><footer><button type="button" class="btn primary" data-cmd="sm-rule-ok">OK</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
  d.hidden = false;
  setMode('filedlg');
  const lib = d.querySelector('[data-rule="lib"]');
  lib.addEventListener('change', () => {
    const x = allRules().find(q => q.name === lib.value);
    const del = d.querySelector('[data-cmd="sm-rule-del"]');
    if (del) del.disabled = !(x && !x.lib);
    if (!x) return;
    d.querySelector('[data-rule="name"]').value = x.name;
    ['t', 'r', 'k'].forEach(k => { d.querySelector(`[data-rule="${k}"]`).value = k === 'k' ? x[k] : lenToField(x[k]); });
  });
  // Werte von Hand geändert → nicht mehr die Bibliotheksregel
  ['t', 'r', 'k'].forEach(k => d.querySelector(`[data-rule="${k}"]`).addEventListener('input', () => {
    const x = allRules().find(q => q.name === lib.value);
    if (x && Math.abs(num(d.querySelector(`[data-rule="${k}"]`).value) * (k === 'k' ? 1 : UF) - x[k]) > 1e-6) lib.value = '';
  }));
}
function ruleFromDialog() {
  // Dicke und Radius in der Anzeigeeinheit (Einstellungen → Einheiten), gespeichert in mm
  const v = k => num($(`#dialog [data-rule="${k}"]`).value);
  const t = v('t') * UF, r = v('r') * UF, k = v('k'), name = ($('#dialog [data-rule="name"]').value || '').trim().slice(0, 80);
  if (!(t > 0) || !(r >= 0) || !(k >= 0 && k <= 1)) { toast('Bitte gültige Werte eingeben.'); return null; }
  const cr = $('#dialog [data-rule="cornerRelief"]').value, crd = num($('#dialog [data-rule="cornerReliefD"]').value) * UF;
  return { t, r, k, ...(name ? { name } : {}), ...(cr === 'round' ? { cornerRelief: 'round', cornerReliefD: crd > 0 ? crd : null } : cr === 'none' ? { cornerRelief: 'none' } : {}) };
}
function commitSheetRule() {
  const R = ruleFromDialog();
  if (!R) return;
  pushHistory();
  doc.sheet = R;
  store();
  closeFileDialog();
  scheduleBuild(0);
  toast(`Blechregel${R.name ? ' ' + R.name : ''}: ${fmtLenU(R.t, 2)}, R ${fmtLen(R.r, 2)}, K ${fmt(R.k, 2)}`);
}
function saveRuleToLibrary() {
  const R = ruleFromDialog();
  if (!R) return;
  if (!R.name) { toast('Bitte erst einen Namen eingeben.'); $('#dialog [data-rule="name"]').focus(); return; }
  if (RULE_LIBRARY.some(x => x.name === R.name)) { toast('Mitgelieferte Regeln lassen sich nicht überschreiben. Bitte einen anderen Namen wählen.'); return; }
  const u = userRules().filter(x => x.name !== R.name);
  u.push(R);
  u.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (!saveUserRules(u)) { toast('Speichern nicht möglich (Browser-Speicher gesperrt).'); return; }
  const lib = $('#dialog [data-rule="lib"]');
  lib.innerHTML = ruleOptions(R.name);
  const del = $('#dialog [data-cmd="sm-rule-del"]'); if (del) del.disabled = false;
  toast(`„${R.name}“ in der Bibliothek gespeichert.`);
}
function deleteRuleFromLibrary() {
  const lib = $('#dialog [data-rule="lib"]'), name = lib && lib.value;
  if (!name || !userRules().some(x => x.name === name)) return;
  askConfirm(`Regel „${name}“ aus der Bibliothek löschen? Dokumente, die sie verwenden, behalten ihre Werte.`, 'Löschen', true).then(ok => {
    if (!ok) return;
    saveUserRules(userRules().filter(x => x.name !== name));
    lib.innerHTML = ruleOptions('');
    const del = $('#dialog [data-cmd="sm-rule-del"]'); if (del) del.disabled = true;
  });
}
let flatLast = null;
/* Abwicklung erstellen bei Körpern ohne Blech-Features (z. B. STEP-Import): erst die feste Fläche wählen.
   Dafür startet „In Blech umwandeln“; nach OK und Neuaufbau erscheint die Abwicklung von selbst (flatNach = Feature). */
let flatNach = null;
function flatUeberUmwandeln() {
  const sel = modelSel.faces.length === 1 && modelSel.faces[0].info && modelSel.faces[0].info.type === 'PLANE';
  startFeature('sm_convert');
  if (!editing || editing.feature.type !== 'sm_convert') return;
  flatNach = editing.feature.id;
  if (sel && editing.feature.face) { commitEditing(); return; }
  toast('Abwicklung erstellen: die feste ebene Fläche des Blechteils anklicken und OK – danach erscheint die Abwicklung.', 7000);
}
function flatNachBau() {
  if (!flatNach || editing) return;
  const id = flatNach, st = lastBuild && lastBuild.status[id];
  flatNach = null;
  if (!doc.features.some(f => f.id === id)) return; // abgebrochen
  if (st && st.ok) openFlat(); else if (st) toast(`Abwicklung nicht möglich: ${st.error}`, 7000);
}
function openFlat() {
  if (editing) cancelEditing();
  const meta = lastBuild && lastBuild.sheet, hatKoerper = !!(lastBuild && lastBuild.bodies && lastBuild.bodies.length);
  // gewählte ebene Fläche eines anderen Körpers als des umgewandelten: diesen Körper abwickeln (mehrere Blechteile, z. B. STEP)
  const fl = modelSel.faces.length === 1 && modelSel.faces[0].info && modelSel.faces[0].info.type === 'PLANE' ? modelSel.faces[0].info : null;
  if (fl && meta && meta.unfold && meta.unfold.body && bodyIdAtFace(fl) !== meta.unfold.body && doc.features.some(f => f.type === 'sm_convert' && !f.suppressed)) { flatUeberUmwandeln(); return; }
  let flat;
  try { flat = computeFlat(doc, sheetRule(), meta); } catch (err) {
    if (hatKoerper && !doc.features.some(f => ['sm_base', 'sm_contour', 'sm_convert'].includes(f.type) && !f.suppressed)) { flatUeberUmwandeln(); return; }
    toast(err.message, 5000); return;
  }
  showFlat(flat);
}
/* Abwicklung zeigen (auch aus „Alle Blechteile abwickeln“): Maße, DXF/SVG speichern */
/* Abwicklung als Skizze: Konturen und Biegelinien (Konstruktion) über die
   DXF-Ausgabe in eine Skizze auf XY, rechts neben das Modell gelegt; die Skizze merkt sich Versatz, Blechregel und
   Biegebeschriftungen (f.abwicklung), ihr DXF-Export läuft wieder als Abwicklung. Ein Abzug: ändert sich das Modell,
   bleibt die Skizze, wie sie ist. */
let flatTitel = '';
function abwicklungAlsSkizze() {
  const fl = flatLast;
  if (!fl) return;
  const { sketch } = dxfToSketch(flatDXF(fl, {}), ORIGIN_PLANES.XY, `Abwicklung ${flatTitel || doc.name}`.slice(0, 60), { unit: 1 });
  const m = lastBuild && lastBuild.mesh, gr = m ? m.bbox : null;
  const off = gr ? [Math.round(gr[1][0] + 50 - fl.bb[0][0]), Math.round(gr[0][1] - fl.bb[0][1])] : [-fl.bb[0][0], -fl.bb[0][1]];
  sketch.points.forEach(p => { p.x += off[0]; p.y += off[1]; });
  // Biegelinien: Konstruktionslinien gleicher Lage bekommen ihre Beschriftung
  const pm = new Map(sketch.points.map(p => [p.id, p])), bends = {};
  sketch.curves.filter(c => c.cons && c.type === 'line').forEach(c => {
    const a = pm.get(c.p1), b = pm.get(c.p2);
    const t = fl.bends.find(x => [[x.a, x.b], [x.b, x.a]].some(([u, v]) => Math.hypot(u[0] + off[0] - a.x, u[1] + off[1] - a.y) < 1e-4 && Math.hypot(v[0] + off[0] - b.x, v[1] + off[1] - b.y) < 1e-4));
    if (t && t.label) bends[c.id] = t.label;
  });
  sketch.abwicklung = { off, bends, rule: fl.rule ? { t: fl.rule.t, r: fl.rule.r, k: fl.rule.k } : null };
  closeDrawing();
  pushHistory();
  const f = { id: uid(), ...sketch };
  doc.features.push(f);
  store(); renderAll(); scheduleBuild(0);
  editFeature(doc.features.length - 1);
  toast('Abwicklung als Skizze rechts neben dem Modell: ändern, ergänzen, dann „Skizze fertig“ und im Browser per Rechtsklick auf die Skizze als DXF speichern.', 9000);
}
/* STEP-Körper als eigene Features: viele Programme behalten importierte Körper als Basiselement und ändern sie direkt;
   hier wird ein prismatischer Körper (Platte, Laserteil, Profilabschnitt) erkannt (Kern: `extrusionErkennen`) und als
   Skizze auf seiner Deckfläche + Extrusion neu aufgebaut – Maße, Bohrungen und Dicke sind dann über die Zeitleiste
   änderbar. Der eingelesene Festkörper fällt im Import weg (imp.ohne), Name, Werkstoff, Farbe und Komponente gehen
   auf den neuen Körper über. */
function importKoerper(id) {
  const [fid, k] = String(id).split(':'), f = doc.features.find(x => x.id === fid);
  return f && f.type === 'import' && f.format === 'step' && (k == null || /^\d+$/.test(k)) ? f : null;
}
// Nummer des Festkörpers im Import (ein Import mit nur einem Festkörper hat keine Nummer in der Körper-ID → 0)
const importNr = id => Number(String(id).split(':')[1] || 0);
async function alsFeaturesAufbauen(id, still = false) {
  const imp = importKoerper(id);
  if (!imp) return 'fehler';
  if (editing) cancelEditing();
  let r;
  try { r = await kernel.extrusionErkennen(id); } catch (err) { if (!still) toast(err.message, 9000); return 'nicht'; }
  const W = createDxf({});
  r.kanten.forEach(k => { if (k.art === 'linie') W.line(k.a, k.b, 'contour'); else if (k.art === 'kreis') W.circle(k.c, k.r, 'contour'); else W.arc(k.c, k.r, k.a0, k.a1, 'contour'); });
  const b = bodyInfo(id) || {}, name = String(b.name || imp.name || 'Teil').slice(0, 50);
  const plane = { key: 'FACE', label: 'Deckfläche', o: round9(r.ebene.o), x: round9(r.ebene.x), y: round9(r.ebene.y), n: round9(r.ebene.n) };
  const { sketch } = dxfToSketch(W.toString(), plane, `Skizze ${name}`.slice(0, 60), { unit: 1 });
  ursprungAnEcke([sketch], plane);
  const bem = await bemassen(sketch);
  const comp = (doc.components || []).find(c => c.bodies.includes(id));
  pushHistory();
  const sk = { id: uid(), ...sketch, plane };
  const ex = { id: uid(), type: 'extrude', name: `Extrusion ${name}`.slice(0, 60), sketch: sk.id, profiles: null, distance: Math.round(r.dist * 1e6) / 1e6, direction: 'normal', op: 'new' };
  if (comp) { sk.owner = comp.id; ex.owner = comp.id; }
  doc.features.push(sk, ex);
  imp.ohne = [...new Set([...(imp.ohne || []), importNr(id)])];
  // Eigenschaften und Komponente auf den neuen Körper (ID = Feature-ID der Extrusion)
  doc.bodies = doc.bodies || {};
  doc.bodies[ex.id] = { ...b, hidden: false };
  if (comp) comp.bodies = comp.bodies.map(x => (x === id ? ex.id : x));
  delete doc.bodies[id];
  const prev = lastBuild;
  store(); renderAll(); scheduleBuild(0);
  await whenBuilt(prev);
  // Gegenprobe wie beim Blech: Freiformkanten werden als Linienzug genähert – weicht das Volumen ab, zurück
  let v = null;
  try { if (lastBuild && lastBuild.status[ex.id] && lastBuild.status[ex.id].ok) v = (await kernel.props(ex.id)).volume; } catch (_) { v = null; }
  if (r.volumen > 0 && (!(v > 0) || Math.abs(v - r.volumen) > 0.002 * r.volumen)) {
    const p2 = lastBuild;
    undo();
    await whenBuilt(p2);
    if (!still) toast(`Als Skizze und Extrusion nicht genau genug nachbaubar (Volumen ${v ? fmt(v / r.volumen * 100, 1) : '–'} % des Teils, z. B. Freiformkanten) – zurückgenommen.`, 9000);
    return 'nicht';
  }
  if (!still) toast(`${name}: als Skizze (${sketch.curves.length} Kurven, ${bem ? bem.dims : 0} Maße) und Extrusion ${fmtLenU(r.dist, 2)} aufgebaut – Maße in der Skizze und Dicke in der Zeitleiste änderbar.`, 8000);
  return 'extrusion';
}
/* Erzeugte Skizzen wie von Hand gezeichnet: Ursprung der Skizze an die linke untere Ecke (Maße ab dort positiv), dann
   vollständig bemaßt (Auto-Abhängigkeit vom Ursprung) – das Teil lässt sich per Maßänderung bearbeiten */
function ursprungAnEcke(sks, plane) {
  const P = sks[0].points;
  if (!P.length) return [0, 0];
  const dx = Math.min(...P.map(p => p.x)), dy = Math.min(...P.map(p => p.y));
  sks.forEach(sk => sk.points.forEach(p => { p.x = Math.round((p.x - dx) * 1e9) / 1e9; p.y = Math.round((p.y - dy) * 1e9) / 1e9; }));
  plane.o = round9(plane.o.map((v, k) => v + plane.x[k] * dx + plane.y[k] * dy));
  return [dx, dy];
}
async function bemassen(sk) {
  try { await loadSolver(); sk.rules = sk.rules || []; return autoBemassung(sk, 'O'); } catch (_) { return null; }
}
/* STEP in ein neues, leeres Teil: jeden Körper als Features aufbauen – Blechteile als Grundlasche +
   Biegen, prismatische Teile als Skizze + Extrusion; was keins von beiden ist, bleibt eingelesen */
let stepAufbau = null; // Import-Feature, dessen Körper nach dem ersten Bau aufgebaut werden
async function stepAlsFeatures(ids) {
  const n = { blech: 0, extrusion: 0, nicht: 0 };
  for (const id of ids) {
    let e = await alsBlechAufbauen(id, true);
    if (e !== 'blech') e = await alsFeaturesAufbauen(id, true);
    n[e === 'blech' || e === 'extrusion' ? e : 'nicht']++;
  }
  const teile = [n.blech && `${n.blech} Blechteil${n.blech === 1 ? '' : 'e'} (Grundlasche + Biegen)`, n.extrusion && `${n.extrusion} Teil${n.extrusion === 1 ? '' : 'e'} als Skizze + Extrusion`].filter(Boolean).join(', ');
  toast(teile ? `STEP mit eigenen Funktionen aufgebaut: ${teile}${n.nicht ? `; ${n.nicht} Körper bleib${n.nicht === 1 ? 't' : 'en'} eingelesen (Freiform)` : ''}. Maße in den Skizzen ändern das Teil.` : 'Kein Körper der STEP-Datei ließ sich als Blech oder Extrusion aufbauen – sie bleiben eingelesen.', 10000);
  return n;
}
/* STEP-Blechteil als Blech-Features (wie ein in cantcodecad konstruiertes Blech): Kern `blechErkennen` wickelt die
   Körperform ab (feste Fläche = größte ebene Fläche). Daraus: Skizze der Abwicklung (Kontur + Ausschnitte) auf der
   festen Fläche → Grundlasche in Teiledicke, Skizze der Biegelinien → „Biegen“ mit Winkel, Richtung und Radius je
   Linie. Dicke und Radius stehen als eigene Blechregel an beiden Features (eine Baugruppe hat oft mehrere Dicken), der
   K-Faktor kommt vom Dokument – Abwickeln und Biegen mit demselben K ergibt wieder die Form. Gegenprobe nach dem Bau:
   weicht das Volumen um mehr als 0,2 % ab, wird alles zurückgenommen. */
async function alsBlechAufbauen(id, still = false) {
  const imp = importKoerper(id);
  if (!imp) return 'fehler';
  if (editing) cancelEditing();
  let r;
  try { r = await kernel.blechErkennen(id, sheetRule()); } catch (err) { if (!still) toast(`Als Blechteil nicht möglich: ${err.message}`, 9000); return 'nicht'; }
  if (!r.bends.length) { if (!still) toast('Das Teil hat keine Biegungen – „Als Skizze und Extrusion aufbauen“ passt besser.', 7000); return 'nicht'; }
  const b = bodyInfo(id) || {}, name = String(b.name || imp.name || 'Blech').slice(0, 50);
  const plane = { key: 'FACE', label: 'Feste Fläche', o: round9(r.ebene.o), x: round9(r.ebene.x), y: round9(r.ebene.y), n: round9(r.ebene.n) };
  const W = createDxf({});
  const loop = lp => { if (lp.circle) { W.circle(lp.circle.c, lp.circle.r, 'contour'); return; } lp.edges.forEach(e => { if (e.type === 'arc' && e.mid) { const ax = e.a[0], ay = e.a[1], bx = e.mid[0], by = e.mid[1], cx = e.b[0], cy = e.b[1], D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(D) > 1e-12) { const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D, uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D, rr = Math.hypot(ax - ux, ay - uy), w = (x, y) => Math.atan2(y - uy, x - ux), ccw = ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > 0; W.arc([ux, uy], rr, ccw ? w(ax, ay) : w(cx, cy), ccw ? w(cx, cy) : w(ax, ay), 'contour'); return; } } W.line(e.a, e.b, 'contour'); }); };
  r.contour.forEach(loop); r.holes.forEach(loop);
  const { sketch: skA } = dxfToSketch(W.toString(), plane, `Abwicklung ${name}`.slice(0, 60), { unit: 1 });
  /* Fluchtende Teilbiegungen gleicher Art (Biegung durch einen Schlitz oder Ausschnitt geteilt) zu einer Linie über
     die ganze Länge – „Biegen“ braucht Material an der Linienmitte */
  const zus = [];
  r.bends.forEach(x => {
    const d = [x.b[0] - x.a[0], x.b[1] - x.a[1]], l = Math.hypot(...d), u = [d[0] / l, d[1] / l];
    const g = zus.find(y => y.angle === x.angle && y.up === x.up && Math.abs(y.r - x.r) < 1e-6 && Math.abs(u[0] * y.u[1] - u[1] * y.u[0]) < 1e-9 && Math.abs((x.a[0] - y.a[0]) * y.u[1] - (x.a[1] - y.a[1]) * y.u[0]) < 1e-6);
    if (!g) { zus.push({ ...x, u }); return; }
    const s = q => (q[0] - g.a[0]) * g.u[0] + (q[1] - g.a[1]) * g.u[1], ss = [0, s(g.b), s(x.a), s(x.b)], lo = Math.min(...ss), hi = Math.max(...ss), A0 = g.a;
    g.a = [A0[0] + g.u[0] * lo, A0[1] + g.u[1] * lo]; g.b = [A0[0] + g.u[0] * hi, A0[1] + g.u[1] * hi];
  });
  // Biegelinien: erste die nächste am Mittelpunkt der festen Fläche (Ursprung der Ebene); feste Seite dort
  const lin = zus.map(x => ({ ...x, m: [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2] })).sort((p, q) => Math.hypot(...p.m) - Math.hypot(...q.m));
  const pts = [], curves = [], linien = {};
  lin.forEach((x, i) => {
    pts.push({ id: `bp${i}a`, x: x.a[0], y: x.a[1] }, { id: `bp${i}b`, x: x.b[0], y: x.b[1] });
    curves.push({ id: `bl${i}`, type: 'line', p1: `bp${i}a`, p2: `bp${i}b` });
    linien[`bl${i}`] = { angle: x.angle, flip: !x.up, r: x.r };
  });
  const d0 = [lin[0].b[0] - lin[0].a[0], lin[0].b[1] - lin[0].a[1]], u0 = [-d0[1], d0[0]];
  const side = -(lin[0].m[0] * u0[0] + lin[0].m[1] * u0[1]) > 0; // Ursprung (feste Fläche) auf der bewegten Seite → umdrehen
  const regel = { t: Math.round(r.t * 1e6) / 1e6, r: Math.round(r.r * 1e6) / 1e6 };
  const skB = { type: 'sketch', name: `Biegelinien ${name}`.slice(0, 60), plane, points: pts, curves, rules: [] };
  ursprungAnEcke([skA, skB], plane);
  const bem = await bemassen(skA);
  await bemassen(skB);
  const comp = (doc.components || []).find(c => c.bodies.includes(id));
  pushHistory();
  const sk1 = { id: uid(), ...skA, plane };
  const base = { id: uid(), type: 'sm_base', name: `Grundlasche ${name}`.slice(0, 60), sketch: sk1.id, profiles: null, flip: true, op: 'new', regel };
  const sk2 = { id: uid(), ...skB, plane };
  const bend = { id: uid(), type: 'sm_bend', name: `Biegen ${name}`.slice(0, 60), sketch: sk2.id, angle: lin[0].angle, flip: !lin[0].up, side, linien, regel };
  [sk1, base, sk2, bend].forEach(f => { if (comp) f.owner = comp.id; doc.features.push(f); });
  imp.ohne = [...new Set([...(imp.ohne || []), importNr(id)])];
  doc.bodies = doc.bodies || {};
  doc.bodies[base.id] = { ...b, hidden: false };
  if (comp) comp.bodies = comp.bodies.map(x => (x === id ? base.id : x));
  delete doc.bodies[id];
  const prev = lastBuild;
  store(); renderAll(); scheduleBuild(0);
  await whenBuilt(prev);
  const st = lastBuild && lastBuild.status[bend.id];
  let v = null;
  try { if (st && st.ok) v = (await kernel.props(base.id)).volume; } catch (_) { v = null; }
  if (!(v > 0) || Math.abs(v - r.volumen) > 0.002 * r.volumen) {
    const p2 = lastBuild;
    undo();
    await whenBuilt(p2);
    if (!still) toast(`Als Blechteil nicht sauber nachbaubar (${st && !st.ok ? st.error : `Volumen ${v ? fmt(v / r.volumen * 100, 1) : '–'} % des Teils`}) – zurückgenommen. „In Blech umwandeln“ wickelt es trotzdem ab.`, 9000);
    return 'nicht';
  }
  if (!still) toast(`${name}: als Grundlasche und ${lin.length} Biegung${lin.length === 1 ? '' : 'en'} aufgebaut (Dicke ${fmtLenU(r.t, 2)}, R ${fmtLenU(r.r, 2)}, ${bem ? bem.dims : 0} Maße) – Kontur, Winkel und Radien jetzt änderbar.`, 9000);
  return 'blech';
}
function showFlat(flat, titel = '') {
  closeDialog();
  flatLast = flat; flatTitel = titel;
  drawing.open = false;
  let el = $('#drawing');
  if (!el) { el = document.createElement('div'); el.id = 'drawing'; el.className = 'drawing'; $('#viewport').appendChild(el); }
  el.hidden = false;
  const R0 = flat.rule, w = flat.bb[1][0] - flat.bb[0][0], h = flat.bb[1][1] - flat.bb[0][1];
  el.innerHTML = `<div class="dtools"><b>${icon('flat', 18)} Abwicklung${titel ? ` · ${esc(titel)}` : ''}</b>
    <span>${fmtLen(w, 2)} × ${fmtLen(h, 2)} ${UNIT} · t ${fmtLen(R0.t, 2)} · R ${fmtLen(R0.r, 2)} · K ${fmt(R0.k, 2)} · ${flat.nb != null ? `${flat.nb} Biegung${flat.nb === 1 ? '' : 'en'} (aus Körperform)` : `${flat.flanges} Lasche${flat.flanges === 1 ? '' : 'n'}`} · ${flat.holes.length} Ausschnitt${flat.holes.length === 1 ? '' : 'e'}</span>
    <span class="grow"></span>
    <button type="button" class="chip" data-cmd="flat-sketch" title="Die Abwicklung als Skizze neben das Modell legen: Konturen ändern, Löcher oder Gravuren ergänzen, dann im Browser über die Skizze als DXF speichern">Als Skizze bearbeiten</button>
    <button type="button" class="chip" data-cmd="flat-dxf">DXF speichern</button><button type="button" class="chip" data-cmd="dxf-settings" title="Einheit, Bögen/Linien, Polylinien, Layer und Farben">DXF-Einstellungen</button>
    <button type="button" class="chip" data-cmd="flat-svg">SVG speichern</button>
    <button type="button" class="btn" data-cmd="drawing-close">Schließen</button></div>
    <div class="sheetwrap"><div class="sheet flatsheet">${flatSVG(flat, { name: doc.name })}</div></div>`;
  const svg = el.querySelector('.sheet svg');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  setMode('drawing');
}

/* ---------------- Querschnittsanalyse ---------------- */
const section = { on: false, axis: 'Z', pos: 0, flip: false };
const AXV = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
function sectionRange() {
  const m = lastBuild && lastBuild.mesh;
  const k = 'XYZ'.indexOf(section.axis);
  return m ? [m.bbox[0][k], m.bbox[1][k]] : [-50, 50];
}
function applySection() {
  if (!section.on) { vp.setSection(null); updateSectionBtn(); return; }
  const s = section.flip ? -1 : 1;
  vp.setSection({ n: AXV[section.axis].map(v => v * s), d: section.pos * s });
  updateSectionBtn();
}
function updateSectionBtn() { $$('#ribbon [data-cmd="section"]').forEach(b => b.setAttribute('aria-pressed', String(section.on))); }
function openSection() {
  if (editing) cancelEditing();
  if (mode === 'measure') closeMeasure();
  if (!hasBody()) { toast('Es gibt noch keinen Körper.'); return; }
  if (!section.on) { const [a, b] = sectionRange(); section.pos = Math.round((a + b) / 2 * 10) / 10; section.on = true; }
  applySection();
  renderSection();
}
function renderSection() {
  const [a, b] = sectionRange();
  const d = $('#dialog');
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('section', 20)}<b class="dtitle">Querschnittsanalyse</b></header><div class="dbody">
    ${fieldSeg('axis', 'Schnittebene', section.axis, [['X', 'YZ (X)'], ['Y', 'XZ (Y)'], ['Z', 'XY (Z)']], true).replace(/data-k="axis"/g, 'data-sec="axis"')}
    <label class="row col"><span>Lage</span><input type="range" class="secrange" min="${a}" max="${b}" step="${Math.max((b - a) / 400, 0.01)}" value="${section.pos}" data-sec="pos"></label>
    <label class="row"><span>Position</span><span class="num"><input type="number" step="0.5" data-sec="posn" value="${fmtIn(section.pos)}"><em>mm</em></span></label>
    ${fieldSeg('flip', 'Seite', section.flip, [[false, 'Normal'], [true, 'Umgekehrt']]).replace(/data-k="flip"/g, 'data-sec="flip"')}
    <p class="info">Die Schnittfläche ist orange gefüllt. Der Schnitt bleibt beim Weiterarbeiten sichtbar.</p>
    </div><footer><button type="button" class="btn primary" data-cmd="section-ok">OK</button><button type="button" class="btn" data-cmd="section-off">Schnitt entfernen</button></footer>`;
  d.hidden = false;
}
const fmtIn = v => String(Math.round(v * 1000) / 1000);
$('#dialog').addEventListener('input', e => {
  const t = e.target, k = t.dataset.sec;
  if (!k) return;
  if (k === 'pos' || k === 'posn') {
    const v = num(t.value);
    if (v == null) return;
    section.pos = v;
    const other = $(`#dialog [data-sec="${k === 'pos' ? 'posn' : 'pos'}"]`);
    if (other) other.value = k === 'pos' ? fmtIn(v) : v;
    applySection();
  }
});
$('#dialog').addEventListener('click', e => {
  const b = e.target.closest('button[data-sec]');
  if (!b) return;
  const k = b.dataset.sec, v = b.dataset.v;
  if (k === 'axis') { section.axis = v; const [lo, hi] = sectionRange(); section.pos = Math.round((lo + hi) / 2 * 10) / 10; }
  if (k === 'flip') section.flip = v === 'true';
  applySection();
  renderSection();
});

/* ---------------- Messen (I) ---------------- */
const measure = { sels: [], items: null, busy: false };
function startMeasure() {
  if (editing) cancelEditing();
  if (!hasBody()) { toast('Es gibt noch keinen Körper zum Messen.'); return; }
  measure.sels = []; measure.items = null;
  setMode('measure');
  vp.setPickMode('any');
  renderMeasure();
}
function closeMeasure() {
  measure.sels = []; measure.items = null;
  closeDialog();
  vp.setSelection({});
  vp.setPickMode('none');
  setMode('model');
}
function measurePick(h) {
  if (!h || (h.kind !== 'face' && h.kind !== 'edge')) return;
  const ref = h.kind === 'face' ? faceRef(h.info) : edgeRef(h.info);
  const same = measure.sels.findIndex(s => s.kind === h.kind && s.index === h.index);
  if (same >= 0) measure.sels.splice(same, 1);
  else { if (measure.sels.length >= 2) measure.sels = []; measure.sels.push({ kind: h.kind, index: h.index, ref, type: h.info.type, body: bodyIdAtFace(h.info) }); }
  renderMeasure();
}
const SEL_NAMES = { PLANE: 'Ebene Fläche', CYLINDRE: 'Zylinderfläche', CONE: 'Kegelfläche', SPHERE: 'Kugelfläche', LINE: 'Gerade Kante', CIRCLE: 'Kreiskante' };
async function renderMeasure() {
  const sels = measure.sels;
  vp.setSelection({ faces: sels.filter(s => s.kind === 'face').map(s => s.index), edges: sels.filter(s => s.kind === 'edge').map(s => s.index) });
  const d = $('#dialog');
  const head = sels.length ? sels.map((s, i) => `<div class="row"><span>Auswahl ${i + 1}</span><b class="pref">${esc(SEL_NAMES[s.type] || (s.kind === 'face' ? 'Fläche' : 'Kante'))}</b></div>`).join('') : '<p class="info">Fläche oder Kante im Modell anklicken.</p>';
  const draw = items => {
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('measure', 20)}<b class="dtitle">Messen</b></header><div class="dbody">${head}
      ${items ? `<dl class="mres">${items.map(([l, v, u]) => `<div><dt>${esc(l)}</dt><dd>${u === 'mm' ? fmtLenU(v, 3) : u === 'mm²' ? fmtArea(v, 3) : u === '°' ? fmtAng(v, 2) + ' °' : fmt(v, 3) + ' ' + u}</dd></div>`).join('')}</dl>` : (sels.length ? '<p class="info">rechnet …</p>' : '')}
      </div><footer><button type="button" class="btn" data-cmd="measure-clear">Neu</button><button type="button" class="btn primary" data-cmd="measure-close">Schließen</button></footer>`;
    d.hidden = false;
  };
  draw(null);
  if (!sels.length) return;
  const key = JSON.stringify(sels.map(s => s.ref));
  measure.key = key;
  try {
    const { items } = await kernel.measure(sels.map(s => ({ kind: s.kind, ref: s.ref, body: s.body })));
    if (measure.key !== key || mode !== 'measure') return;
    draw(items);
  } catch (err) {
    if (measure.key === key) { draw([]); toast('Messen nicht möglich: ' + err.message); }
  }
}

/* ---------------- Modi ---------------- */
function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  $('#ribbon').hidden = m === 'sketch';
  $('#sketchbar').hidden = m !== 'sketch';
  /* die Werkzeugleiste passt sich der Skizze an: eine 3D-Skizze hat andere Werkzeuge */
  if (m === 'sketch' && uiBarsReady) renderSketchbar();
  vp.setWorkPlanesVisible(m !== 'sketch');
  updateUndoButtons();
  updateHint();
  // im Modell: Flächen und Kanten anklicken = Vorauswahl
  if (m === 'model') queueMicrotask(() => { if (mode === 'model' && !editing) { vp.setPickMode(modelPickMode()); syncSelection(); } });
}

const SKETCH_HINTS = {
  null: 'Klicken wählt aus, Shift-Klick wählt mehrere. Punkte und Linien lassen sich ziehen. Eine Körperkante anklicken übernimmt sie als violetten Bezug. Entf löscht.',
  line: 'Linie: Punkte nacheinander klicken. Doppelklick oder Esc beendet den Linienzug. Fängt an Skizze und Körper (violett: Körperpunkt/-kante, wird automatisch projiziert).',
  rect: 'Rechteck: erste Ecke klicken, dann die gegenüberliegende.',
  rectc: 'Mittelpunkt-Rechteck: Mitte klicken, dann eine Ecke.',
  cline: 'Mittelpunktlinie: Mitte klicken, dann ein Ende. Die Linie wächst nach beiden Seiten gleich, die Mitte bleibt ihr Mittelpunkt.',
  rect3: 'Rechteck mit 3 Punkten: Anfang und Ende der ersten Kante klicken (beliebig schräg), dann die Breite.',
  circle2: 'Kreis mit 2 Punkten: die beiden Enden eines Durchmessers klicken. Vorhandene Punkte liegen danach auf dem Kreis.',
  circle3: 'Kreis mit 3 Punkten: drei Punkte auf dem Kreis klicken. Vorhandene Punkte liegen danach auf dem Kreis.',
  tcircle2: 'Kreis tangential an 2 Linien: zwei Linien anklicken, dann Lage und Größe im Winkel zwischen ihnen. Bleibt tangential.',
  tcircle3: 'Kreis tangential an 3 Linien: drei Linien anklicken, z. B. die Seiten eines Dreiecks (Inkreis). Bleibt tangential.',
  carc: 'Bogen mit Mittelpunkt: Mitte klicken, dann den Anfang (legt den Radius fest), dann das Ende. Der Bogen folgt der Mausbewegung.',
  circle: 'Kreis: Mittelpunkt klicken, dann einen Punkt auf dem Rand. Körperkanten und -punkte fangen mit.',
  ellipse: 'Ellipse: Mittelpunkt, dann Ende der Hauptachse, dann die Breite. Die Achsen sind Hilfslinien – mit Bemaßung ihrer Längen und Winkel wird die Ellipse bestimmt.',
  spline: 'Spline: Punkte nacheinander klicken, die Kurve läuft glatt durch alle. Doppelklick oder Enter beendet, Klick auf den ersten Punkt schließt sie. Punkte lassen sich ziehen und bemaßen.',
  arc: 'Bogen: Anfang klicken, dann Ende, dann einen Punkt, durch den der Bogen läuft.',
  polygon: 'Vieleck: Mitte klicken, dann eine Ecke. Anzahl der Ecken mit + und − oder in der Palette.',
  slot: 'Langloch: erste Mitte, zweite Mitte, dann die Breite klicken.',
  project: 'Projizieren: Körperkante anklicken übernimmt sie, eine Fläche anklicken übernimmt ihren ganzen Rand. Projizierte Geometrie ist violett und folgt dem Modell.',
  point: 'Punkt: klicken. Liegt er auf einer Kurve oder Körperkante, bleibt er daran gebunden.',
  brk: 'Unterbrechen: Kurve anklicken – sie wird an den nächsten Schnittpunkten links und rechts davon geteilt, nichts wird entfernt.',
  trim: 'Stutzen: das Kurvenstück anklicken, das weg soll (rot markiert). Ohne Schnittpunkte wird die ganze Kurve gelöscht.',
  fillet: 'Verrunden: Ecke zweier Linien anklicken, dann den Radius eintippen. Maße zur Ecke bleiben erhalten.',
  mirror: 'Spiegeln: erst die Spiegelachse anklicken, dann die Elemente. Vorher gewählte Elemente werden sofort gespiegelt.',
  dim: 'Bemaßung: Linie, Kreis oder zwei Elemente anklicken, auch Körperkanten. Kreis + Linie bemaßt sofort vom Mittelpunkt, ebenso Punkt + Linie und zwei parallele Linien. Sonst den Platz klicken. Dann den Wert eintippen.',
  offset: 'Versatz: Kurve anklicken (zusammenhängende Ketten werden ganz genommen), Seite und Abstand mit der Maus zeigen, klicken. Ein gemeinsames Maß steuert die ganze Kette.',
  extend: 'Verlängern: eine Linie oder einen Bogen nahe am freien Ende anklicken. Er läuft bis zur nächsten Kurve, Körperkante oder Achse.',
  chamfer: 'Fase: Ecke zweier Linien anklicken, dann das Maß eintippen. Beide Schenkel sind gleich lang.',
  tarc: 'Tangentialbogen: am freien Ende einer Linie oder eines Bogens beginnen, dann den Endpunkt klicken. Es geht direkt mit dem nächsten Bogen weiter, Esc beendet.',
  cpattern: 'Kreismuster: vorher Elemente wählen, dann den Mittelpunkt klicken. Die Kopien bleiben an die Vorlage gebunden. Anzahl später: ein Element des Musters wählen und in der Palette ändern.',
  lpattern: 'Lineares Muster: vorher Elemente wählen, dann zwei Punkte für Richtung und Abstand. Die Achse ist eine Konstruktionslinie mit Maß, sie lässt sich bemaßen und ausrichten.',
  move: 'Verschieben: vorher Elemente wählen, dann Basispunkt und Zielpunkt klicken. Mit Strg (oder „Als Kopie“) wird kopiert.',
  scale: 'Skalieren: vorher Elemente wählen, dann den Basispunkt klicken und den Faktor eintippen (z. B. 2 oder 1/2). Kreise, Texte und Maße der Auswahl wachsen mit. Strg = Kopie.',
  rotate: 'Drehen: vorher Elemente wählen, dann Drehpunkt, Bezugsrichtung und Zielrichtung klicken. 5°-Schritte am Raster, Strg = Kopie.',
  text: 'Text: Anfangspunkt klicken, Text tippen, Enter. Höhe und Schrift in der Palette. Doppelklick auf einen Text ändert ihn. Liegt der Text in einer Fläche, wird er beim Extrudieren ausgespart.'
};
const FEATURE_HINTS = {
  plane: 'Basis anklicken: Ursprungsebene, ebene Körperfläche oder andere Arbeitsebene. Abstand im Dialog. Skizzen darauf wandern mit.',
  point: 'Kante im Modell anklicken (Art im Dialog). Der Punkt hilft beim Aufspannen von Ebenen und Achsen.',
  axis: 'Basis der Achse im Modell anklicken (Art im Dialog). Drehung und Muster können die Achse danach als Drehachse anklicken.',
  hole: 'Bohrungen sitzen auf den einzelnen Punkten der Skizze (ohne Punkte: auf den Kreismitten). „Kreismitte“ bohrt in der Mitte einer runden Kante im Modell, „Zwei Kanten“ setzt die Bohrung nach Abständen in eine Fläche. Sie gehen automatisch ins Material, „Umgekehrt“ dreht die Richtung.',
  pattern: 'Features ankreuzen, die vervielfältigt werden. Kreismuster drehen um eine Achse durch den Ursprung, rechteckige gehen in ein oder zwei Richtungen – je Abstand oder Gesamtmaß, wahlweise symmetrisch und mit einer Richtung auf einer Bauteilkante, „Entlang Pfad“ folgt den Kurven einer Skizze.',
  mirror: 'Spiegelebene wählen: Ursprungsebene, ebene Körperfläche oder Arbeitsebene anklicken.',
  combine: 'Kombinieren: zuerst den Zielkörper anklicken, dann die Werkzeugkörper.',
  align: 'Ausrichten: erst Fläche oder Kreiskante am Teil anklicken, das bewegt werden soll, dann das Ziel. Flächen werden bündig, Kreise mittig gesetzt.',
  move: 'Körper oder Komponenten wählen. „Abstand/Winkel“ wie bisher; „Punkt zu Punkt“ setzt einen Eckpunkt auf einen anderen; „Entlang Kante“ gleitet an einer Kante entlang (Kreis- oder Bogenkante: drehen um ihre Mittelachse); „Drehen um Kante“ nimmt eine Kante, Kreiskante oder Achse aus dem Modell als Drehachse.',
  coil: 'Spirale / Feder: Basisebene wählen (XY, XZ, YZ, Fläche oder Arbeitsebene), Durchmesser, Windungen und Querschnitt einstellen.',
  split: 'Körper teilen: Ebene wählen (Ursprungsebene, Fläche oder Arbeitsebene). Ohne Auswahl werden alle getroffenen Körper geteilt.',
  thread: 'Gewinde: Bolzen- oder Bohrungsfläche anklicken. Größe wird erkannt (Bohrung = Kernloch oder Nenndurchmesser), modelliert nach ISO.',
  sm_base: 'Lasche: geschlossenes Skizzenprofil wird zum Blech in der Dicke der Blechregel.',
  sm_convert: 'In Blech umwandeln: ebene Fläche eines gleich dicken Körpers anklicken. Sie bleibt in der Abwicklung liegen.',
  fastener: 'Normteil einfügen: Bohrungsrand (Kreiskante) anklicken – Größe passt sich der Bohrung an, Kopf bzw. Auflage sitzt auf der Fläche. Ohne Klick frei am Punkt X/Y/Z.',
  sm_loft: 'Übergangslasche: zwei Profil-Skizzen auf verschiedenen Ebenen wählen (z. B. Rechteck → Kreis). Dicke und K-Faktor aus der Blechregel.',
  sm_unfold: 'Abwickeln: feste ebene Blechfläche anklicken. Das Blech liegt danach flach; skizzieren und schneiden, dann „Zurückfalten“. Für „nur ausgewählte Biegungen“ die runden Biegeflächen anklicken – die anderen bleiben stehen.',
  sm_refold: 'Zurückfalten: Schnitte aus dem flachen Zustand werden auf das gebogene Blech übertragen.',
  sm_flange: 'Lasche an Kante: gerade Kanten der Blechfläche anklicken. Höhe ist das Außenmaß, Biegeradius und Dicke aus der Blechregel.',
  sm_join: 'Durch Biegung verbinden: je eine gerade Endkante zweier Bleche anklicken. Dazwischen entsteht eine Biegung mit dem Radius der Blechregel; die Bleche werden verlängert oder gekürzt.',
  sm_corner: 'Blechabrundung / -fase: Ecken des Zuschnitts anklicken (Kanten in Dickenrichtung) oder „Alle Ecken“. Die Abwicklung zeigt die Rundungen.',
  sm_rip: 'Auftrennung: gerade Eckkanten zwischen zwei Blechwänden anklicken (außen oder innen) – oder „Zwischen zwei Punkten“ wählen und zwei Punkte auf einer ebenen Blechfläche anklicken. Die Ecke wird mit dem Spalt aufgeschnitten, danach lässt sich das Teil abwickeln.',
  sweep: 'Sweeping: Profil-Skizze und Pfad-Skizze wählen. Das Profil sollte am Pfadanfang quer zum Pfad liegen, z. B. auf einer Arbeitsebene.',
  loft: 'Erhebung: Profile der Reihe nach wählen, z. B. auf versetzten Arbeitsebenen.',
  joint: 'Gelenk: zuerst Kante oder Fläche an der Komponente anklicken, die sich bewegt (Kreiskante = Mitte und Achse), dann das Gegenstück. Winkel und Versatz im Dialog.',
  presspull: 'Ebene Fläche oder Zylinderfläche anklicken und den Abstand eingeben: positiv zieht heraus, negativ drückt hinein.',
  move: 'Körper im Modell anklicken (oder oben wählen), dann Versatz und Drehung eingeben. „Kopie“ lässt das Original stehen.',
  remove: 'Körper anklicken, die ab hier nicht mehr zum Teil gehören. Die Features davor bleiben erhalten.'
};
/* 3D-Skizze: Hinweise für die Werkzeuge, die es ohne Ebene gibt */
const SKETCH3D_HINTS = {
  null: 'Klicken wählt aus, einen Punkt kann man im Raum ziehen. Neue Punkte liegen auf Modellkanten und -flächen, sonst in der Ebene senkrecht zum Blick durch den letzten Punkt. Entf löscht.',
  point: 'Punkt: klicken. Er liegt auf der Modellkante unter dem Zeiger, sonst in der Ebene senkrecht zum Blick.',
  line: 'Linie: Punkte nacheinander klicken, der Zug läuft am letzten Endpunkt weiter. Doppelklick oder Esc beendet den Linienzug.',
  arc3: 'Bogen: Anfang, Ende und einen Punkt anklicken, durch den der Bogen läuft. Die drei Punkte dürfen im Raum liegen – der Bogen liegt dann in ihrer Ebene.',
  circle3: 'Kreis: drei Punkte auf dem Kreis anklicken. Der Kreis liegt dann in der Ebene dieser Punkte.',
  spline: 'Spline: Punkte nacheinander klicken, die Kurve läuft glatt durch alle. Doppelklick oder Enter beendet, Klick auf den ersten Punkt schließt sie.',
};
function updateHint() {
  let t;
  if (mode === 'sketch') {
    const hints = sketchState && sketchState.kind3d ? SKETCH3D_HINTS : SKETCH_HINTS;
    t = hints[sketchState ? sketchState.tool : null] || hints.null;
  }
  else t = {
    model: selCount() ? `${[modelSel.faces.length ? `${modelSel.faces.length} Fläche${modelSel.faces.length > 1 ? 'n' : ''}` : '', modelSel.edges.length ? `${modelSel.edges.length} Kante${modelSel.edges.length > 1 ? 'n' : ''}` : ''].filter(Boolean).join(' und ')} gewählt. Jetzt einen Befehl starten (z. B. F verrunden, Q drücken/ziehen) oder Rechtsklick. Umschalt-Klick ergänzt, Esc hebt auf, Entf entfernt den Körper.`
      : doc.features.length ? (navPrefs.nav === 'mitte' ? 'Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Mitte dreht, Strg + Mitte verschiebt, Umschalt + Mitte oder Rad zoomt, F passt ein, Strg + 1…8 Ansichten, S sucht Befehle.' : navPrefs.nav === 'ftasten' ? 'Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Umschalt + Mitte dreht, Mitte verschiebt, Rad zoomt, F2/F3/F4 Verschieben/Zoomen/Orbit, F5 vorherige Ansicht, F6 Startansicht, S sucht Befehle.' : navPrefs.nav === 'rechts' ? 'Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Rechts ziehen dreht, Mitte oder Umschalt + rechts verschiebt, Rad zoomt, Rechtsklick öffnet das Markierungsmenü, S sucht Befehle.' : navPrefs.nav === 'altumschalt' ? 'Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Alt + Umschalt + links/Mitte/rechts dreht/verschiebt/zoomt, Rad zoomt, S sucht Befehle.' : navPrefs.nav === 'mitteumschalt' ? 'Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Mitte dreht, Umschalt + Mitte verschiebt, Strg + Mitte oder Rad zoomt, S sucht Befehle.' : 'Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Umschalt + Mitte dreht, Mitte verschiebt, Rad zoomt, Rechtsklick öffnet das Markierungsmenü, S sucht Befehle.') : 'Fang mit einer Skizze an: Skizze erstellen und die XY-Ebene anklicken.',
    component: 'Körper anklicken, die zur neuen Komponente gehören. Name oben im Dialog.',
    measure: 'Messen: Fläche oder Kante anklicken, dann optional eine zweite. Ein dritter Klick fängt neu an. Esc schließt.',
    pickPlane: 'Ursprungsebene, Arbeitsebene (orange) oder ebene Fläche des Körpers anklicken. Esc bricht ab.',
    feature: editing && editing.feature.type === 'draft' ? (!editing.feature.plane || editing.pickTarget === 'draftplane' ? 'Neutrale Ebene anklicken: Ursprungsebene, Arbeitsebene oder ebene Fläche. Ihre Normale ist die Zugrichtung.' : 'Flächen anklicken, die geneigt werden. Sie drehen sich um ihre Schnittlinie mit der neutralen Ebene.')
      : editing && editing.feature.type === 'move' && editing.pickTarget ? (/move-(from|to)/.test(editing.pickTarget) ? (editing.pickTarget === 'move-to' ? 'Zielpunkt anklicken: Kante (es zählt der nähere Eckpunkt), Kreis (seine Mitte) oder Arbeitspunkt. Esc bricht ab.' : 'Punkt am Körper anklicken: Kante (es zählt der nähere Eckpunkt), Kreis (seine Mitte) oder Arbeitspunkt, danach den Zielpunkt. Esc bricht ab.')
        : editing.pickTarget === 'move-edge' ? 'Eine Kante anklicken – gerade oder Kreis- bzw. Bogenkante. Esc bricht ab.'
        : 'Eine gerade Kante, Kreiskante, Zylinderfläche oder Arbeitsachse anklicken. Esc bricht ab.')
      : editing && editing.pickTarget ? (/axis/.test(editing.pickTarget) ? 'Eine gerade Kante, Kreiskante oder Zylinderfläche anklicken. Esc bricht ab.'
        : editing.pickTarget === 'startface' ? 'Ebene Fläche als Start anklicken – die Extrusion beginnt auf dieser Fläche. Esc bricht ab.'
        : 'Ebene Zielfläche anklicken. Esc bricht ab.')
      : editing && FEATURE_HINTS[editing.feature.type] ? FEATURE_HINTS[editing.feature.type]
      : editing && (editing.feature.type === 'fillet' || editing.feature.type === 'chamfer') ? 'Kanten anklicken, um sie hinzuzufügen oder zu entfernen.'
      : editing && editing.feature.type === 'weld' ? 'Kanten an den Innenecken anklicken (z. B. wo ein Stab auf den anderen trifft).'
      : editing && editing.feature.type === 'shell' ? 'Flächen anklicken, die offen bleiben sollen.'
        : editing && (editing.feature.type === 'extrude' || editing.feature.type === 'revolve') ? 'Flächen der Skizze anklicken, um Profile auszuwählen. Die Vorschau rechnet mit.'
        : editing && editing.feature.type === 'topo' ? 'Designbereich anklicken, Punkten eine Rolle geben – dann „Vorschau berechnen“ oder OK (rechnet einige Sekunden).' : 'Werte anpassen, die Vorschau rechnet mit.'
  }[mode];
  if (mode === 'model' && doc.activeComp && (doc.components || []).some(c => c.id === doc.activeComp)) t = `Aktive Komponente: ${compPath(doc, doc.activeComp)}. ${t || ''}`;
  $('#hint').textContent = t || '';
}

function closeEditor() {
  if (editor) { editor.destroy(); editor = null; sketchState = null; }
  if (sketchSlice) { sketchSlice = false; applySection(); } // „Aufschneiden“ endet mit der Skizze
}
/* „Aufschneiden“ der Skizzenpalette: das Modell vor der Skizzenebene ausblenden */
let sketchSlice = false;
function setSketchSlice(on) {
  sketchSlice = !!on;
  const pl = editing && editing.feature.plane;
  if (sketchSlice && pl) vp.setSection({ n: pl.n.slice(), d: pl.n.reduce((a, v, i) => a + v * pl.o[i], 0) + 1e-6 });
  else applySection();
}

function cancelEditing() {
  closeEditor();
  // beim Abbrechen einer neuen Bohrung die dafür angelegte Bohrungsskizze wieder entfernen
  if (editing && editing.isNew && editing.feature.autoSketch) doc.features = doc.features.filter(x => x.id !== editing.feature.sketch);
  editing = null;
  updateManip();
  closeDialog();
  vp.setRegions(null);
  setMode('model');
  vp.setPickMode('none');
  vp.setSelection({});
  renderAll();
  scheduleBuild(0);
}

/* Fehlende Pflichtangaben (OK erst, wenn alles gewählt ist) */
function missingInput(f) {
  switch (f.type) {
    case 'thread': return f.face ? '' : 'Erst eine Zylinderfläche anklicken.';
    case 'emboss': return f.face ? '' : 'Erst die Fläche anklicken, auf die geprägt wird.';
    case 'constraint': return (f.items || []).some(it => it.a && it.b) ? '' : 'Erst beide Seiten einer Abhängigkeit anklicken.';
    case 'thicken': return (f.faces || []).length ? '' : 'Erst die Flächen anklicken, die verdickt werden.';
    case 'lippe': return (f.faces || []).length ? '' : 'Erst die ebene Randfläche der Schale anklicken.';
    case 'topo': {
      if (!f.sketch) return 'Erst eine Skizze mit dem Designbereich zeichnen.';
      if (f.bereich === 'flaeche' && !f.face) return 'Erst die ebene Fläche des Körpers anklicken, die der Designbereich ist.';
      const rollen = Object.values(f.rolle || {}).filter(r => r && r.art);
      if (!rollen.some(r => r.art === 'last')) return 'Mindestens einen Punkt der Skizze als Kraft festlegen.';
      return rollen.some(r => r.art === 'fest' || r.art === 'rolle-x' || r.art === 'rolle-y') ? '' : 'Mindestens einen Punkt als Halterung festlegen.';
    }
    case 'boundfill': return (f.bodies || []).length ? '' : 'Erst die Werkzeugkörper anklicken, die den Raum einschließen.';
    case 'canvas': return !f.img ? 'Erst ein Bild laden.' : f.cplane === 'face' && !f.face ? 'Erst die ebene Fläche anklicken, auf die der Aufkleber kommt.' : '';
    case 'hole': return f.place === 'center' ? ((f.rings || []).length ? '' : 'Erst eine runde Kante im Modell anklicken.')
      : f.place === 'edges' ? (f.edgeA && f.edgeB ? '' : 'Erst zwei Kanten einer Fläche anklicken.')
      : f.place === 'onedge' ? (f.edgeP ? '' : 'Erst eine gerade Kante anklicken.')
      : f.depthMode === 'toface' && !f.toFace ? 'Erst die Zielfläche wählen.'
      : (f.sketch ? '' : 'Erst die Fläche an der Stelle der Bohrung anklicken.');
    case 'sm_convert': return f.face ? '' : 'Erst die feste ebene Fläche anklicken.';
    case 'sm_unfold': return !f.face ? 'Erst die feste ebene Fläche anklicken.'
      : Array.isArray(f.bends) && !f.bends.length ? 'Erst eine Biegung anklicken oder „Alle Biegungen“ wählen.' : '';
    case 'sm_flange': return (f.edges || []).length ? '' : 'Erst Blechkanten anklicken.';
    case 'sm_loft': { const ids = [f.skA, f.skB, ...(f.more || [])]; return ids.every(Boolean) && new Set(ids).size === ids.length ? '' : 'Lauter verschiedene Profil-Skizzen wählen.'; }
    case 'sm_join': return (f.edges || []).length === 2 ? '' : 'Je eine Endkante beider Bleche anklicken.';
    case 'sm_corner': return f.all || (f.edges || []).length || (f.sets || []).some(x => x.edges.length) ? (Number(f.size) > 0 ? '' : 'Maß muss größer als 0 sein.') : 'Erst Ecken anklicken oder „Alle Ecken“ wählen.';
    case 'sm_rip': return f.mode === 'face' ? (f.face ? '' : 'Erst eine ebene Blechfläche anklicken.') : Number(f.gap) > 0
      ? (f.mode === 'points' ? (f.a && f.b ? '' : 'Erst zwei Punkte auf der Blechfläche anklicken.')
        : (f.edges || []).length ? '' : 'Erst Eckkanten anklicken.')
      : 'Spalt muss größer als 0 sein.';
    case 'presspull': return f.face ? '' : 'Erst eine ebene Fläche oder Zylinderfläche anklicken.';
    case 'boss': case 'snapfit': return f.sketch ? '' : 'Erst eine Skizze mit Punkten wählen.';
    case 'moveface': return !(f.faces || []).length ? 'Erst Flächen anklicken.' : f.mode === 'rotate' && !f.axisRef ? 'Erst eine Drehachse anklicken.' : f.mode === 'to' && !f.target ? 'Erst eine Zielfläche anklicken.' : '';
    case 'joint': return f.o1 && f.o2 ? '' : 'Erst beide Gelenk-Ursprünge anklicken.';
    case 'rigid': return (f.comps || []).length >= 2 ? '' : 'Mindestens zwei Komponenten wählen.';
    case 'motionlink': return f.a && f.b && f.a !== f.b ? '' : 'Zwei verschiedene Gelenke wählen.';
    case 'align': return f.o1 && f.o2 ? '' : 'Erst die Fläche/Kante am bewegten Teil, dann das Ziel anklicken.';
    case 'combine': return (f.target || []).length && (f.tools || []).length ? '' : 'Ziel- und Werkzeugkörper wählen.';
    case 'scale': return (f.bodies || []).length || (f.comps || []).length ? '' : 'Erst Körper oder Komponenten wählen.';
    case 'move': {
      if (!(f.bodies || []).length && !(f.comps || []).length) return 'Erst Körper oder Komponenten wählen.';
      if (f.mode === 'points') return f.from && f.to ? '' : 'Erst zwei Punkte wählen: erst den Punkt am Körper, dann den Zielpunkt.';
      if (f.mode === 'pointpos') return f.from ? '' : 'Erst den Punkt am Körper anklicken.';
      if (f.mode === 'edge') return f.edge ? '' : 'Erst eine Kante anklicken, entlang der verschoben werden soll.';
      if (f.mode === 'axis') return f.axisRef ? '' : 'Erst eine Kante, Kreiskante oder Achse als Drehachse anklicken.';
      return '';
    }
    case 'remove': return (f.bodies || []).length ? '' : 'Erst Körper wählen.';
    case 'fillet': case 'chamfer': return f.all || (f.edges || []).length || (f.fromFaces || []).length ? '' : 'Erst Kanten anklicken.';
    case 'weld': case 'gusset': return (f.edges || []).length ? '' : 'Erst Kanten an den Innenecken anklicken.';
    case 'endcap': return (f.faces || []).length ? '' : 'Erst die Stirnflächen der Stäbe anklicken.';
    case 'shell': return f.hollow || (f.faces || []).length ? '' : 'Erst eine Fläche zum Öffnen anklicken.';
    case 'defeature': return (f.faces || []).length || Number(f.autoHoles) > 0 || Number(f.autoFillets) > 0 ? '' : 'Flächen anklicken oder eine Automatik einstellen.';
    case 'point': return refreshWorkPlanes().points.has(f.id) ? '' : 'Erst eine Kante anklicken.';
    case 'axis': return refreshWorkPlanes().axes.has(f.id) ? '' : f.mode === 'planes' && f.base && f.base.b ? 'Die beiden Ebenen sind parallel, sie schneiden sich nicht.' : 'Erst die Basis der Achse anklicken.';
    case 'plane': {
      const b = f.base || {}, ok = refreshWorkPlanes().has(f.id);
      if (b.kind === 'mid') return !b.b ? 'Erst zwei parallele Ebenen anklicken.' : ok ? '' : 'Die beiden Ebenen sind nicht parallel.';
      if (b.kind === 'perp') return !b.a ? 'Erst die Ebene oder Fläche anklicken, auf der die neue Ebene senkrecht stehen soll.' : ok ? '' : 'Diese Ebene fehlt.';
      if (b.kind === 'tangent') return b.p ? '' : 'Erst die Zylinderfläche an der Berührstelle anklicken.';
      if (b.kind === 'edges') return !b.e2 ? 'Erst zwei gerade Kanten anklicken.' : ok ? '' : 'Die beiden Kanten liegen nicht in einer Ebene.';
      if (b.kind === 'points') return (b.pts || []).length < 3 ? 'Erst drei Punkte anklicken.' : ok ? '' : 'Die drei Punkte liegen auf einer Geraden.';
      return '';
    }
    case 'draft': return !f.plane ? 'Erst die neutrale Ebene wählen.' : (f.faces || []).length ? '' : 'Erst die Flächen anklicken, die geneigt werden.';
    case 'extrude': return f.src === 'face' ? (f.fromFace ? '' : 'Erst eine ebene Körperfläche als Profil anklicken.') : f.extent === 'toface' && !f.toFace ? 'Erst die Zielfläche wählen.'
      : f.start === 'object' && !f.startRef ? 'Erst die Startfläche wählen.' : '';
    default: return '';
  }
}

function commitEditing() {
  if (!editing) return;
  const f = editing.feature;
  const miss = f.type !== 'sketch' ? missingInput(f) : '';
  if (miss) { toast(miss); return; }
  if (f.type === 'sketch' && !f.curves.length && !(f.texts || []).length && !f.points.length) { cancelEditing(); return; }
  pushHistory();
  /* Vorgang „Neue Komponente“: Komponente anlegen (in der aktiven) und die Körper hineinlegen. Körper aus der
     Vorschau gibt es schon – sie zählen nach OK nicht mehr als neu, also gleich hinein. */
  const newComp = ids => {
    if (!doc.components) doc.components = [];
    const parent = doc.activeComp && doc.components.some(c => c.id === doc.activeComp) ? doc.activeComp : null;
    let n = 1; while (doc.components.some(c => c.name === `Komponente ${n}`)) n++;
    doc.components.forEach(c => { c.bodies = c.bodies.filter(id => !ids.includes(id)); });
    const nc = { id: uid(), name: `Komponente ${n}`, bodies: ids, parent };
    doc.components.push(nc);
    return nc;
  };
  if (f.op === 'newcomp') {
    f.owner = newComp(((lastBuild && lastBuild.bodies) || []).filter(id => id === f.id || id.startsWith(f.id + ':'))).id;
    f.op = 'new';
  }
  // Kombinieren mit „Ergebnis: Neue Komponente“: der Zielkörper (er trägt das Ergebnis) wandert in die neue Komponente
  if (f.type === 'combine' && f.newComp) { newComp((f.target || []).slice(0, 1)); delete f.newComp; }
  if (editing.isNew) { doc.features.splice(editing.index, 0, f); if (timelinePos != null) timelinePos = editing.index + 1; }
  else doc.features[editing.index] = f;
  const wasSketch = f.type === 'sketch' && editing.isNew;
  closeEditor();
  editing = null;
  updateManip();
  closeDialog();
  vp.setRegions(null);
  setMode('model');
  vp.setPickMode('none');
  vp.setSelection({});
  store();
  renderAll();
  scheduleBuild(0);
  if (wasSketch) toast(`${f.name} ist fertig. Mit E extrudieren.`);
}

/* ---------------- Befehle ---------------- */
const lastSketch = () => [...doc.features.slice(0, timelinePos == null ? undefined : timelinePos)].reverse().find(f => f.type === 'sketch');
const hasBody = () => !!(lastBuild && lastBuild.bodies && lastBuild.bodies.length);
/* Standard-Vorgang: Verbinden, wenn es (in der aktiven Komponente) schon einen Körper gibt, sonst Neuer Körper */
const defOp = () => {
  const ac = doc.activeComp && (doc.components || []).find(c => c.id === doc.activeComp);
  if (!ac) return hasBody() ? 'join' : 'new';
  const live = new Set((lastBuild && lastBuild.bodies) || []);
  return ac.bodies.some(b => live.has(b)) ? 'join' : 'new';
};
const newSketch = plane => {
  const sk = { id: uid(), type: 'sketch', name: nextName(doc, 'sketch'), plane, ...emptySketchGeo() };
  if (doc.activeComp && (doc.components || []).some(c => c.id === doc.activeComp)) sk.owner = doc.activeComp; // gehört zur aktiven Komponente
  return sk;
};
/* 3D-Skizze: ohne Ebene – ihre Punkte liegen in Weltkoordinaten im Raum */
const newSketch3D = () => {
  const sk = { id: uid(), type: 'sketch', name: nextName(doc, 'sketch'), ...emptySketchGeo() };
  if (doc.activeComp && (doc.components || []).some(c => c.id === doc.activeComp)) sk.owner = doc.activeComp;
  return sk;
};

function cmdSketch() {
  if (editing) cancelEditing();
  // ist eine ebene Fläche vorgewählt, kommt die Skizze direkt darauf
  const fsel = modelSel.faces.length === 1 && !modelSel.edges.length ? modelSel.faces[0] : null;
  if (fsel && fsel.info.type === 'PLANE' && fsel.info.plane) {
    const p = fsel.info.plane;
    modelSel.faces = [];
    startSketchEdit(newSketch({ key: 'FACE', label: 'Fläche des Körpers', o: round9(p.o), x: round9(p.x), y: round9(p.y), n: round9(p.n) }), doc.features.length, true);
    return;
  }
  setMode('pickPlane');
  vp.setPickMode('plane');
}

function startSketchOn(planeKey) {
  if (editing) cancelEditing();
  startSketchEdit(newSketch(clone(ORIGIN_PLANES[planeKey])), doc.features.length, true);
}

/* 3D-Skizze: keine Ebene, es wird direkt im Raum gezeichnet.
   Der Befehl beginnt sofort – eine Ebene wäre hier gerade das, was weggelassen wird. */
function cmdSketch3D() {
  if (editing) cancelEditing();
  startSketchEdit(newSketch3D(), doc.features.length, true);
}

async function startSketchEdit(feature, index, isNew) {
  const spatial = !feature.plane;   // 3D-Skizze: ohne Ebene, der Solver wird hier nicht gebraucht
  if (!spatial) { try { await loadSolver(); } catch (err) { toast('Der Skizzen-Solver konnte nicht laden: ' + err.message, 6000); setMode('model'); vp.setPickMode('none'); return; } }
  // neue Skizze am Zeitleisten-Marker einfügen
  editing = { feature, index: isNew ? (timelinePos == null ? doc.features.length : timelinePos) : index, isNew };
  setMode('sketch');
  vp.setPickMode('none');
  editor = spatial ? new Sketch3DEditor(vp, feature, {
    onChange: st => { sketchState = st; renderSketchState(); },
    onMessage: m => toast(m, 4500),
  }) : new SketchEditor(vp, feature, {
    onChange: st => { sketchState = st; renderSketchState(); },
    onMessage: m => toast(m, 4500),
    params: () => paramEnv(),
    sectionCurves: pl => kernel.sectionCurves(pl),
    priorSketches: () => doc.features.slice(0, editing ? editing.index : doc.features.length).filter(x => x.type === 'sketch')
  });
  editor.setTool(feature.curves.length ? null : 'line');
  if (!spatial) vp.lookAtPlane(feature.plane); // beim Skizzieren senkrecht auf die Ebene schauen
  renderSketchDialog();
  renderSketchesInView();
  renderTimeline();
  if (!isNew) scheduleBuild(0);
}

function pickModeFor(f) {
  if (f.type === 'draft') return !f.plane || (editing && editing.pickTarget === 'draftplane') ? 'plane' : 'face';
  if (f.type === 'move') return f.mode && f.mode !== 'free' ? 'any' : 'face';
  if (f.type === 'shell' || f.type === 'defeature' || f.type === 'scale' || f.type === 'remove' || f.type === 'bound' || f.type === 'gitter' || f.type === 'thicken' || f.type === 'lippe' || f.type === 'presspull' || f.type === 'moveface' || f.type === 'thread' || f.type === 'combine' || f.type === 'sm_convert' || f.type === 'sm_unfold') return 'face';
  if (f.type === 'silsplit') return f.richtung === 'flaeche' ? 'face' : 'none';
  if (f.type === 'split' && f.mode === 'faces' && editing && editing.pickTarget === 'split-faces') return 'face';
  if (f.type === 'split' && f.tool === 'body') return 'face';
  if (f.type === 'split' && f.tool === 'sketch') return 'none';
  if (f.type === 'split' || f.type === 'coil' || f.type === 'primitive') return 'plane';
  if (f.type === 'boundfill') return editing && editing.pickTarget === 'bf-planes' ? 'plane' : 'face';
  if (f.type === 'topo') return f.bereich === 'flaeche' ? 'face' : 'region';
  if (f.type === 'emboss') return 'face';
  if (f.type === 'canvas' && f.cplane === 'face') return 'face';
  if (f.type === 'joint' || f.type === 'align' || f.type === 'jorigin') return 'any';
  if (f.type === 'sm_rip') return f.mode === 'points' || f.mode === 'face' ? 'face' : 'edge';
  if (f.type === 'fillet' || f.type === 'chamfer') return editing && editing.pickTarget === 'face-edges' ? 'face' : 'edge';
  if (f.type === 'sm_flange' || f.type === 'sm_corner' || f.type === 'sm_join' || f.type === 'fastener' || f.type === 'weld' || f.type === 'gusset') return 'edge';
  if (f.type === 'endcap') return 'face';
  if (f.type === 'bks') return editing && editing.pickTarget === 'bks-origin' ? 'edge' : 'plane';
  if (f.type === 'plane' && f.base && f.base.kind === 'perp') return editing && editing.pickTarget === 'perp-point' ? 'edge' : 'plane';
  if (f.type === 'plane' && f.base && (f.base.kind === 'points' || f.base.kind === 'edges' || f.base.kind === 'path')) return 'edge';
  if (f.type === 'plane' && f.base && f.base.kind === 'tangent') return 'face';
  if (f.type === 'axis') return { geom: 'any', planes: 'plane', points: 'edge', normal: 'face' }[f.mode] || 'none';
  if (f.type === 'point') return f.mode === 'coords' ? 'none' : f.mode === 'planes3' ? 'plane' : f.mode === 'edgeplane' ? 'any' : 'edge';
  if (f.type === 'hole') return f.place === 'center' || f.place === 'edges' || f.place === 'onedge' ? 'edge' : (!f.sketch || f.autoSketch ? 'face' : 'none');
  if (f.type === 'plane' || f.type === 'mirror') return 'plane';
  return 'none';
}

function startFeature(type) {
  if (editing) cancelEditing();
  let primKind = null, splitFaces = false;
  if (['box', 'cylinder', 'sphere', 'torus'].includes(type)) { primKind = type; type = 'primitive'; }
  if (type === 'splitface') { splitFaces = true; type = 'split'; }
  const base = { id: uid(), type, name: splitFaces ? nextFreeName(doc, defaultName('Fläche teilen')) : nextName(doc, type) };
  let f;
  if (type === 'extrude' || type === 'revolve') {
    const sk = lastSketch();
    // ohne Skizze: Extrusion mit Körperfläche als Profil, sonst wie bisher die letzte Skizze
    if (!sk && !(type === 'extrude' && doc.features.length)) { toast('Erst eine Skizze erstellen.'); return; }
    f = type === 'extrude'
      ? (sk ? { ...base, sketch: sk.id, distance: 10, direction: 'normal', op: defOp(), profiles: null } : { ...base, src: 'face', sketch: null, distance: 10, direction: 'normal', op: defOp(), profiles: null })
      : { ...base, sketch: sk.id, axis: 'y', angle: 360, op: defOp(), profiles: null };
  } else if (type === 'plane') {
    f = { ...base, base: { kind: 'origin', key: 'XY' }, offset: 10, flip: false };
  } else if (type === 'bks') {
    f = { ...base, base: { kind: 'origin', key: 'XY' }, offset: 0, angle: 0, rot: 0, flip: false, originRef: null };
  } else if (type === 'axis') {
    f = { ...base, mode: 'geom', base: null };
  } else if (type === 'point') {
    f = { ...base, mode: 'vertex', base: null };
  } else if (type === 'frame') {
    const sk = lastSketch();
    if (!sk) { toast('Erst eine Skizze mit Linien für die Stäbe erstellen.'); return; }
    f = { ...base, sketch: sk.id, kind: 'square', size: '40x40x3', ...sizeDims('square', '40x40x3'), corners: 'miter', rot: 0 };
  } else if (type === 'topo') {
    const sk = lastSketch();
    if (!sk) { toast('Erst eine Skizze mit dem Designbereich zeichnen.'); return; }
    f = { ...base, sketch: sk.id, profiles: null, rolle: {}, anteil: 40, dicke: 5, element: 0, wiederholungen: 60, abstrafung: 3, weich: 0, glaettung: 0, material: 'steel' };
  } else if (type === 'sm_bend') {
    const sk = lastSketch();
    if (!hasBody()) { toast('Erst ein Blech (Lasche) erstellen.'); return; }
    if (!sk) { toast('Erst eine Skizze auf der Blechfläche mit einer Linie als Biegelinie zeichnen.'); return; }
    f = { ...base, sketch: sk.id, angle: 90, flip: false, side: false };
  } else if (type === 'sm_contour') {
    const sk = lastSketch();
    if (!sk) { toast('Erst eine Skizze mit dem Querschnitt als offenen Linienzug zeichnen.'); return; }
    f = { ...base, sketch: sk.id, width: 50, direction: 'normal', flip: false, op: defOp() };
  } else if (type === 'primitive') {
    const kind = primKind || 'box';
    f = { id: base.id, type, name: primName(kind), kind, plane: { kind: 'origin', key: 'XY' }, cx: 0, cy: 0, w: 20, l: 20, h: 20, d: 20, d2: 6, flip: false, op: defOp() };
  } else if (type === 'coil') {
    f = { ...base, plane: { kind: 'origin', key: 'XY' }, cx: 0, cy: 0, diameter: 20, pos: 'center', mode: 'pitch', pitch: 5, height: 40, turns: 8, section: 'circle', size: 2, left: false, flat: false, flip: false, angle: 0, op: defOp() };
  } else if (type === 'sm_base') {
    const sk = lastSketch();
    if (!sk) { toast('Erst eine Skizze mit dem Blechumriss erstellen.'); return; }
    f = { ...base, sketch: sk.id, profiles: null, flip: false, op: defOp() };
  } else {
    if (!hasBody() && type !== 'sweep' && type !== 'loft' && type !== 'pipe' && type !== 'canvas') { toast('Dafür braucht es einen Körper. Erst eine Skizze extrudieren.'); return; }
    const toolFs = doc.features.filter(x => TOOL_FEATURES.has(x.type));
    if (type === 'hole') {
      // ohne passende Skizze gleich auf eine Fläche klicken; mit Skizze an deren Punkten
      const sk = lastSketch();
      let pts = [];
      try { pts = sk ? holePoints(migrateSketch(clone(sk))) : []; } catch (_) { pts = []; }
      f = { ...base, sketch: sk && pts.length ? sk.id : null, kind: 'simple', preset: 'clear:M3', d: 3.4, depthMode: 'through', depth: 10, tip: 'drill', cd: 6.5, cdepth: 3.4, cangle: 90, flip: false };
    }
    if (type === 'boss' || type === 'snapfit') {
      // an den Punkten einer Skizze auf der Fläche (zuletzt erstellte Skizze mit Punkten)
      const sk = [...doc.features].reverse().find(x => { if (x.type !== 'sketch') return false; try { return holePoints(migrateSketch(clone(x))).length > 0; } catch (_) { return false; } });
      if (!sk) { toast('Erst eine Skizze auf der Fläche mit Punkten (oder Kreisen) für die Lage erstellen.'); return; }
      f = type === 'boss'
        ? { ...base, sketch: sk.id, d: 8, h: 10, draft: 1, hole: 'core', dh: 2.5, hd: 8, ribs: 0, rt: 1.2, rl: 4, rh: 6, flip: false }
        : { ...base, sketch: sk.id, t: 1.5, L: 12, w: 6, hook: 1, alpha: 30, angle: 0, flip: false };
    }
    if (type === 'pattern' || type === 'mirror') {
      if (!toolFs.length) { toast('Es gibt noch kein Feature zum Vervielfältigen.'); return; }
      const last = toolFs[toolFs.length - 1].id;
      f = type === 'pattern'
        ? { ...base, features: [last], kind: 'circular', axis: 'Z', count: 4, spacing: 20, angle: 360 }
        : { ...base, features: [last], plane: { kind: 'origin', key: 'YZ' }, mode: 'features', result: 'new' };
    }
    if (type === 'presspull') f = { ...base, face: null, distance: 5 };
    if (type === 'moveface') f = { ...base, faces: [], mode: 'move', dx: 0, dy: 0, dz: 5, angle: 10 };
    if (type === 'constraint') f = { ...base, comp: null, items: [{ type: 'mate', a: null, b: null, value: 0 }] };
    if (type === 'thicken') f = { ...base, faces: [], thickness: 2, side: 'out', op: 'new' };
    if (type === 'lippe') f = { ...base, faces: [], art: 'lippe', seite: 'innen', w: 1, h: 2, spiel: 0.1 };
    if (type === 'bound') f = { ...base, bodies: [], shape: 'box', axis: 'Z', offset: 0 };
    if (type === 'boundfill') f = { ...base, bodies: [], planes: [], cells: null, removeTools: false };
    if (type === 'gitter') f = { ...base, bodies: [], typ: 'gyroid', zelle: 12, dicke: 3, auflsung: 0, op: 'new' };
    if (type === 'canvas') f = { ...base, cplane: 'XY', img: null, w: 100, ar: 1, cx: 0, cy: 0, rot: 0, opacity: 0.6 };
    if (type === 'emboss') {
      const sk = lastSketch();
      if (!sk) { toast('Erst eine Skizze mit dem Profil oder Text zeichnen (z. B. auf einer Ebene vor der Fläche).'); return; }
      f = { ...base, sketch: sk.id, profiles: null, face: null, depth: 1, mode: 'deboss', wrap: true };
    }
    if (type === 'web') {
      const sk = lastSketch();
      if (!sk) { toast('Erst eine Skizze mit Linien für den Steg zeichnen (z. B. auf dem Boden einer Schale).'); return; }
      f = { ...base, sketch: sk.id, thickness: 2, depth: 10, extend: true, flip: false };
    }
    if (type === 'rib') {
      const sk = lastSketch();
      if (!sk) { toast('Erst eine Skizze mit einer Linie für die Rippe zeichnen (Ebene quer durch die Ecke).'); return; }
      f = { ...base, sketch: sk.id, thickness: 3, flip: false };
    }
    if (type === 'sm_convert' || type === 'sm_unfold') f = { ...base, face: null, faceBody: null };
    if (type === 'sm_refold') f = { ...base };
    if (type === 'fastener') { f = { ...base, kind: 'iso4762', size: 'M8', length: 25, edge: null, px: 0, py: 0, pz: 0, offset: 0, flip: false, autoName: true }; f.name = fastenerLabel(f); }
    if (type === 'sm_loft') {
      const sks = doc.features.filter(x => x.type === 'sketch');
      if (sks.length < 2) { toast('Übergangslasche braucht zwei Skizzen mit je einem geschlossenen Profil (z. B. Rechteck unten, Kreis oben).'); return; }
      f = { ...base, skA: sks[sks.length - 2].id, skB: sks[sks.length - 1].id, side: 'out', mode: 'brake', facets: 4, op: 'new' };
    }
    if (type === 'thread') f = { ...base, face: null, size: 'auto', pitch: 0, fit: 0, full: true, length: 10, fromEnd: false, left: false };
    if (type === 'pipe') {
      const sk = lastSketch();
      if (!sk) { toast('Erst eine Skizze mit dem Pfad zeichnen (Linien, Bögen, Spline oder ein Kreis).'); return; }
      f = { ...base, path: sk.id, section: 'circle', size: 20, hollow: true, wall: 2, corners: 'right', op: defOp() };
    }
    if (type === 'sweep' || type === 'loft') {
      const sks = doc.features.filter(x => x.type === 'sketch');
      if (sks.length < 2) { toast(type === 'sweep' ? 'Sweeping braucht zwei Skizzen: einen Pfad und ein Profil.' : 'Erhebung braucht mindestens zwei Skizzen mit Profilen.'); return; }
      /* eine 3D-Skizze (ohne Ebene) ist als Pfad gemeint, das Profil braucht eine Ebene */
      const p3 = sks.filter(s => !s.plane), plan = sks.filter(s => s.plane);
      const a = type === 'sweep' && p3.length ? p3[p3.length - 1] : sks[sks.length - 2];
      const b = type === 'sweep' && plan.length && plan[plan.length - 1].id !== a.id ? plan[plan.length - 1] : sks[sks.length - 1];
      f = type === 'sweep'
        ? { ...base, sketch: b.id, path: a.id, profiles: null, corners: 'right', op: defOp() }
        : { ...base, sections: [{ sketch: a.id, profile: null }, { sketch: b.id, profile: null }], ruled: false, op: defOp() };
    }
    if (type === 'jorigin') f = { ...base, sel: null, dx: 0, dy: 0, dz: 0, flip: false };
    if (type === 'joint') f = { ...base, kind: 'rigid', o1: null, o2: null, comp: null, body1: null, angle: 0, offset: 0, flip: false };
    if (type === 'align') f = { ...base, kind: 'rigid', o1: null, o2: null, comp: null, body1: null, angle: 0, offset: 0, flip: false };
    if (type === 'rigid') f = { ...base, comps: [] };
    if (type === 'motionlink') {
      // Vorgabe: die ersten beiden beweglichen Gelenke, 360° ↔ 360° bzw. 10 mm
      const js = doc.features.filter(x => x.type === 'joint' && x.kind !== 'rigid');
      const fa = js[0] && js[0].kind === 'slider' ? 'offset' : 'angle', fb = js[1] && js[1].kind === 'slider' ? 'offset' : 'angle';
      f = { ...base, a: js[0] ? js[0].id : null, fa, va: fa === 'angle' ? 360 : 10, b: js[1] ? js[1].id : null, fb, vb: fb === 'angle' ? 360 : 10, reverse: false };
    }
    if (type === 'move') f = { ...base, comps: [], bodies: [], dx: 0, dy: 0, dz: 0, axis: 'Z', angle: 0, px: 0, py: 0, pz: 0, copy: false };
    if (type === 'remove') f = { ...base, bodies: [] };
    if (type === 'scale') f = { ...base, comps: [], bodies: [], factor: 1, point: 'origin', px: 0, py: 0, pz: 0 };
    if (type === 'sm_flange') f = { ...base, edges: [], height: 30, angle: 90, flip: false };
    if (type === 'sm_rip') f = { ...base, edges: [], kind: 'butt', flip: false, gap: 0.5 };
    if (type === 'sm_join') f = { ...base, edges: [] };
    if (type === 'defeature') f = { ...base, faces: [], autoHoles: 0, autoFillets: 0 };
    if (type === 'sm_corner') f = { ...base, edges: [], all: false, kind: 'round', size: 5 };
    if (type === 'combine') f = { ...base, target: [], tools: [], op: 'join', keep: false };
    if (type === 'split') f = { ...base, bodies: [], faces: [], plane: { kind: 'origin', key: 'XY' }, ...(splitFaces ? { mode: 'faces' } : {}) };
    if (type === 'silsplit') f = { ...base, bodies: [], richtung: 'Z' };
    if (type === 'fillet') f = { ...base, radius: 2, all: false, edges: [] };
    if (type === 'weld') f = { ...base, a: 3, edges: [], allAround: false, kind: 'fillet' };
    if (type === 'gusset') f = { ...base, edges: [], size: 60, thickness: 5, chamfer: 10 };
    if (type === 'endcap') f = { ...base, faces: [], thickness: 3, overhang: 0, shape: 'rect' };
    if (type === 'chamfer') f = { ...base, distance: 1, all: false, edges: [] };
    if (type === 'shell') f = { ...base, thickness: 2, faces: [], tangent: true };
    if (type === 'draft') f = { ...base, angle: 3, plane: null, faces: [], flip: false, tangent: true };
  }
  kunststoffVorgaben(f); // Kunststoffregel: verknüpfte Startwerte
  ownNew(f);
  applyModelSel(f);
  editing = { feature: f, index: timelinePos == null ? doc.features.length : timelinePos, isNew: true };
  if (f.type === 'moveface' && !f.faces.length) editing.pickTarget = 'mf-faces';
  setMode('feature');
  vp.setPickMode(pickModeFor(f));
  refreshWorkPlanes();
  showProfiles();
  renderFeatureDialog(true);
  renderTimeline();
  scheduleBuild(0);
}

function editFeature(index) {
  if (editing) cancelEditing();
  editFeatureObject(clone(doc.features[index]), index);
}

/* Dialog für ein Feature öffnen, das schon an dieser Stelle der Zeitleiste steht – auch für ein
   Feature, das ein bestehendes ersetzen soll (siehe „Durch Grundkörper ersetzen“) */
function editFeatureObject(f, index) {
  if (f.type === 'sketch') { startSketchEdit(f, index, false); return; }
  editing = { feature: f, index, isNew: false };
  setMode('feature');
  vp.setPickMode(pickModeFor(f));
  refreshWorkPlanes();
  showProfiles();
  renderFeatureDialog(true);
  renderTimeline();
  scheduleBuild(0);
}

const PRIM_NAME = { box: 'Quader', cylinder: 'Zylinder', sphere: 'Kugel', torus: 'Torus' };
function primName(kind) {
  const lab = defaultName(PRIM_NAME[kind] || 'Quader');
  let n = 1; while (doc.features.some(x => x.name === lab + n)) n++;
  return lab + n;
}

/* Grundkörper, der den bisherigen Körper ausfüllt (Vorschau für „Durch Grundkörper ersetzen“):
   Maße aus dem Begrenzungsrahmen. Die Ebene kommt von der Skizze des ersetzten Features – der
   Quader sitzt dann genau wie die bisherige Extrusion. Ohne passende Ebene gilt die waagerechte
   Ebene unter dem Körper. Der Körper behält Namen und Eigenschaften – nur sein Grundkörper wird ausgetauscht. */
function primAusKoerper(alt, bb) {
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const [lo, hi] = bb, L = hi.map((v, k) => v - lo[k]);
  const f = {
    id: alt.id, type: 'primitive', name: alt.name, kind: 'box',
    plane: { kind: 'face', plane: { key: 'FACE', label: 'Fläche des Körpers', o: round9(lo), x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] } },
    cx: r6((lo[0] + hi[0]) / 2), cy: r6((lo[1] + hi[1]) / 2),
    w: r6(L[0]), l: r6(L[1]), h: r6(L[2]),
    d: r6(Math.max(L[0], L[1])), d2: r6(Math.min(...L) / 2), flip: false, op: 'new',
  };
  if (alt.owner) f.owner = alt.owner;
  // Ebene der Skizze übernehmen: für eine gerade Extrusion ist das die Ebene des Körpers unten
  const skf = alt.sketch && doc.features.find(x => x.id === alt.sketch);
  const raw = skf && skf.plane;
  const pl = raw && (raw.o && raw.x ? raw : raw.plane && raw.plane.o && raw.plane.x ? raw.plane : null);
  if (!pl) return f;
  const sc = (p, a) => dot(p, a) - dot(pl.o, a);
  const U = [], V = [], N = [];
  for (let i = 0; i < 8; i++) {
    const p = [lo[0] + (i & 1) * L[0], lo[1] + ((i >> 1) & 1) * L[1], lo[2] + ((i >> 2) & 1) * L[2]];
    U.push(sc(p, pl.x)); V.push(sc(p, pl.y)); N.push(sc(p, pl.n));
  }
  const min = a => Math.min(...a), max = a => Math.max(...a);
  f.plane = { kind: 'face', plane: { key: 'FACE', label: 'Fläche des Körpers', o: round9(pl.o), x: round9(pl.x), y: round9(pl.y), n: round9(pl.n) } };
  f.cx = r6((min(U) + max(U)) / 2); f.cy = r6((min(V) + max(V)) / 2);
  f.w = r6(max(U) - min(U)); f.l = r6(max(V) - min(V)); f.h = r6(max(N) - min(N));
  f.d = r6(Math.max(f.w, f.l)); f.d2 = r6(Math.min(f.w, f.l) / 2);
  f.flip = max(N) <= 0;   // Körper liegt unterhalb der Ebene: Grundkörper in negaler Richtung
  return f;
}

/* Durch Grundkörper ersetzen: das Feature, das den Körper erzeugt, wird durch einen
   Grundkörper ersetzt – alle folgenden Features bauen sich daran wieder auf. Der Körper behält
   seine Identität (der Grundkörper bekommt die Feature-ID des bisherigen Körpers). */
async function cmdReplaceBase(id) {
  if (editing) cancelEditing();
  const idx = doc.features.findIndex(f => f.id === id);
  if (idx < 0) { toast('Dieser Körper kommt nicht aus einem Feature der Zeitleiste – bei eingelesenen Teilen zuerst „Als Skizze und Extrusion aufbauen“.', 8000); return; }
  const alt = doc.features[idx];
  if (alt.type === 'primitive') { editFeatureObject(clone(alt), idx); return; }
  let r;
  try { r = await kernel.props(id); } catch (err) { toast('Der Körper ist nicht vermessbar: ' + err.message, 6000); return; }
  if (!editing) { toast('Der Grundkörper steht an der Stelle des bisherigen Körpers – mit OK ersetzen. Danach bauen sich alle folgenden Features neu auf.', 8000); }
  editFeatureObject(primAusKoerper(alt, r.bbox), idx);
}

async function deleteFeature(index) {
  const f = doc.features[index];
  const deps = dependents(doc, f.id);
  if (deps.length && !(await askConfirm(`${f.name} wird von ${deps.map(d => d.name).join(', ')} benutzt. Trotzdem löschen?`, 'Löschen', true))) return;
  if (editing) cancelEditing();
  pushHistory();
  doc.features.splice(index, 1);
  store();
  renderAll();
  scheduleBuild(0);
}

function toggleSketchVisible(id) {
  const f = doc.features.find(x => x.id === id);
  if (!f) return;
  f.show = !sketchVisible(f);
  store();
  renderBrowser();
  renderSketchesInView();
}
function sketchVisible(f) {
  if (typeof f.show === 'boolean') return f.show;
  return !dependents(doc, f.id).length;
}
function renderSketchesInView() {
  const list = doc.features.filter(f => f.type === 'sketch' && sketchVisible(f) && !(editing && editing.feature.id === f.id));
  vp.setSketches(list);
}

/* ---------------- Dateien ---------------- */
function download(name, blob) {
  // mit Windows-Dialogen (Desktop-Programm/Server): Speicherort wählen statt Download-Ordner
  nativeCaps().then(async c => {
    if (!c) return downloadBrowser(name, blob);
    try {
      const path = await pickFile('save', name, filterFor(name));
      if (!path) return;
      await writeFile(path, blob);
      toast(`Gespeichert: ${path}`);
    } catch (err) { toast(err.message); }
  });
}
function downloadBrowser(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const safeName = () => (doc.name || 'Teil').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Teil';

/* Eigener Rückfrage-Dialog (statt des Browser-Fensters „127.0.0.1 meldet …“) */
/* Rückfrage mit mehreren Antworten, z. B. Speichern / Verwerfen / Abbrechen; liefert den Schlüssel (Esc = letzter) */
function askChoice(text, choices) {
  return new Promise(resolve => {
    const old = document.getElementById('askbox'); if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'askbox';
    box.className = 'askbox';
    box.innerHTML = `<div class="askcard" role="dialog" aria-modal="true"><p>${esc(text)}</p><div class="askbtns">${choices.map(([k, l], i) => `<button type="button" class="btn${i === 0 ? ' primary' : ''}" data-a="${k}">${esc(l)}</button>`).join('')}</div></div>`;
    const last = choices[choices.length - 1][0];
    const done = v => { box.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(last); } };
    box.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.a; if (a) done(a); else if (e.target === box) done(last); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(box);
    box.querySelector('[data-a]').focus();
  });
}
function askConfirm(text, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    const old = document.getElementById('askbox'); if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'askbox';
    box.className = 'askbox';
    box.innerHTML = `<div class="askcard" role="dialog" aria-modal="true"><p>${esc(text)}</p><div class="askbtns"><button type="button" class="btn${danger ? ' danger' : ' primary'}" data-a="ok">${esc(okLabel)}</button><button type="button" class="btn" data-a="no">Abbrechen</button></div></div>`;
    const done = v => { box.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } };
    box.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.a; if (a) done(a === 'ok'); else if (e.target === box) done(false); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(box);
    box.querySelector('[data-a="ok"]').focus();
  });
}
/* Ungespeicherte Änderungen: Stand der Features beim letzten Speichern/Öffnen */
let savedSnap = null;
// Zeichnung: zählt nur das Blatt (das Modell kommt aus der verknüpften Datei)
const markSaved = () => { savedSnap = JSON.stringify(doc.kind === 'drawing' ? doc.drawing || null : doc.features); };
const isDirty = () => doc.kind === 'drawing' ? JSON.stringify(doc.drawing || null) !== savedSnap : doc.features.length > 0 && JSON.stringify(doc.features) !== savedSnap;
/* Startfenster: neues Einzelteil / neue Baugruppe (danach gleich „Teil einfügen“) / neue Zeichnung aus einer Datei */
async function newDocument(kind, quiet = false) {
  if (!quiet && isDirty() && !(await askConfirm(`Neue ${kind === 'assembly' ? 'Baugruppe' : 'Bauteilkonstruktion'} anfangen? Ungespeicherte Änderungen gehen verloren.`, 'Verwerfen und neu', true))) return false;
  if (editing) cancelEditing();
  pushHistory();
  clearModelSel(); // Auswahl des alten Dokuments nicht in die neue Konstruktion mitnehmen
  doc = kind === 'assembly' ? newDoc(defaultName('Baugruppe1'), 'assembly') : newDoc();
  $('#docname').value = doc.name;
  firstFit = true;
  afterDocChange();
  vp.view('iso');
  markSaved();
  if (kind === 'assembly' && !quiet) { toast('Neue Baugruppe: erstes Teil auswählen. Weitere mit Baugruppe → Einfügen, verbinden mit Gelenk (J).', 7000); setTimeout(() => openFileDialog('insert'), 50); }
  return true;
}
/* Bauteil → neue Baugruppe, die dieses (gespeicherte) Teil verknüpft enthält (Zusammenfügen → Zu Baugruppe hinzufügen) */
async function toAssembly() {
  if (inferKind(doc) === 'assembly') return;
  if (editing) commitEditing();
  if (!doc.features.length) { toast('Erst das Teil konstruieren, dann zu einer Baugruppe hinzufügen.'); return; }
  if (!doc.file || isDirty()) {
    if (!(await askConfirm('Für die Baugruppe wird das Teil zuerst gespeichert und dann verknüpft eingefügt.', 'Speichern', false))) return;
    await cmdSave();
    if (!doc.file || isDirty()) { toast('Nach dem Speichern noch einmal „Zu Baugruppe hinzufügen“ wählen.', 6000); return; }
  }
  const path = doc.file, name = doc.name;
  if (!(await newDocument('assembly', true))) return;
  doc.name = `${name} Baugruppe`;
  $('#docname').value = doc.name;
  store();
  fileDlgKind = 'insert';
  await filePicked(path);
  toast(`Neue Baugruppe mit ${name}. Weitere Teile über Baugruppe → Einfügen, verbinden mit Gelenk (J).`, 7000);
}
/* Dokumenteinstellungen: Bauteil ↔ Baugruppe (eine Baugruppe nur, solange sie keine Baugruppen-Inhalte hat) */
function switchDocKind() {
  const k = inferKind(doc);
  if (k === 'assembly' && !partCompatible(doc)) { toast('Die Baugruppe enthält Komponenten, eingefügte Teile, Gelenke oder Normteile und bleibt deshalb eine Baugruppe.', 7000); return; }
  pushHistory();
  doc.kind = k === 'assembly' ? 'part' : 'assembly';
  delete doc.activeComp;
  afterDocChange();
  toast(doc.kind === 'assembly' ? 'Jetzt Baugruppenkonstruktion: Teile einfügen, Komponenten, Gelenke, Normteile.' : 'Jetzt Bauteilkonstruktion.');
}
async function newDrawing() {
  // Zeichnung braucht ein Modell: Datei wählen, öffnen, nach dem Aufbau den Arbeitsbereich Zeichnung öffnen
  if (isDirty() && !(await askConfirm('Für die Zeichnung ein anderes Dokument öffnen? Ungespeicherte Änderungen gehen verloren.', 'Verwerfen und öffnen', true))) return;
  let path = null;
  if (await nativeCaps()) { try { path = await pickFile('open'); } catch (err) { toast(err.message); return; } }
  else { toast('Teil oder Baugruppe öffnen, dann Dienstprogramme → Zeichnung.', 6000); openFileDialog('open'); return; }
  if (!path) return;
  const prev = lastBuild;
  if (!(await openProjectFile(path))) return;
  if (doc.kind === 'drawing') return;  // eine Zeichnung gewählt: öffnet sich selbst
  await whenBuilt(prev);
  if (!hasBody()) { toast('Das Dokument hat keinen sichtbaren Körper für eine Zeichnung.'); return; }
  createDrawingDoc();
}
/* warten, bis nach einem Dokumentwechsel der Aufbau da ist */
async function whenBuilt(prev, ms = 30000) {
  const t0 = performance.now();
  while ((lastBuild === prev || !$('#busy').hidden) && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 100));
}
/* Zeichnung aus Konstruktion (eigenes Zeichnungsdokument). Verweis auf die gespeicherte Datei des Modells,
   dazu eine Kopie des Modells (für ungespeicherte Modelle und falls die Datei fehlt). */
function createDrawingDoc() {
  if (doc.kind === 'drawing') return openDrawing();
  if (editing) cancelEditing();
  if (!hasBody()) { toast('Für eine Zeichnung braucht es einen Körper.'); return; }
  const model = doc, ref = model.file || null, dirty = isDirty();
  pushHistory();
  doc = { ...clone(model), kind: 'drawing', name: `${model.name} Zeichnung`, modelName: model.name, modelKind: inferKind(model) === 'assembly' ? 'assembly' : 'part' };
  delete doc.file; delete doc.activeComp; delete doc.ref;
  if (ref) doc.ref = ref;
  $('#docname').value = doc.name;
  store(); markSaved(); updateUndoButtons();
  openDrawing();
  renderAll();
  if (!ref) toast('Das Modell ist noch nicht gespeichert: Die Zeichnung enthält eine Kopie davon (ohne Verknüpfung).', 7000);
  else if (dirty) toast('Das Modell hat ungespeicherte Änderungen. Die Zeichnung zeigt sie; beim nächsten Öffnen gilt die gespeicherte Datei.', 7000);
}
/* Zeichnungsdokument verlassen: mit Verknüpfung das Modell öffnen, sonst zum mitgespeicherten Modell zurück */
async function leaveDrawingDoc() {
  if (doc.kind !== 'drawing') return closeDrawing();
  const d = doc;
  if (d.ref && isDirty()) {
    const a = await askChoice(`Die Zeichnung „${d.name}“ ist nicht gespeichert.`, [['save', 'Speichern'], ['discard', 'Verwerfen'], ['cancel', 'Abbrechen']]);
    if (doc !== d || a === 'cancel') return;
    if (a === 'save') { await cmdSave(); if (doc !== d || isDirty()) return; }
  }
  if (doc !== d) return;
  closeDrawing();
  if (d.ref && (await openProjectFile(d.ref))) return;
  pushHistory();
  doc = { ...clone(d), kind: d.modelKind || 'part', name: d.modelName || d.name };
  delete doc.modelName; delete doc.modelKind; delete doc.ref; delete doc.file;
  afterDocChange();
  markSaved();
}
async function cmdNew() {
  if (isDirty() && !(await askConfirm('Neues Teil anfangen? Ungespeicherte Änderungen gehen verloren.', 'Verwerfen und neu', true))) return;
  if (editing) cancelEditing();
  pushHistory();
  doc = newDoc();
  firstFit = true;
  afterDocChange();
  vp.view('iso');
  markSaved();
}
/* ---------------- Projektordner (Server: /__files, /__save) ---------------- */
let serverFiles = null; // null = Server ohne Projektordner (alte Version)
async function projectFiles() {
  try {
    const r = await fetch('/__files', { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
function downloadSave() {
  download(`${safeName()}.cantcodecad`, new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }));
  toast('Gespeichert als ' + safeName() + '.cantcodecad (Download). Für den Projektordner cantcodecad einmal neu starten.', 6000);
}
const fileLabel = p => (isAbsPath(p) ? p : 'Projekte/' + p);
async function savePath(path) {
  doc.file = path;
  if (isAbsPath(path)) {
    try { await writeFile(path, JSON.stringify(doc, null, 1)); } catch (err) { toast(err.message); return false; }
  } else {
    const r = await fetch('/__save?path=' + encodeURIComponent(path), { method: 'POST', body: JSON.stringify(doc, null, 1) }).catch(() => null);
    if (!r || !r.ok) { toast('Speichern im Projektordner nicht möglich.'); return false; }
  }
  store();
  markSaved();
  addRecent(path, doc.name, inferKind(doc));
  toast(`Gespeichert: ${fileLabel(path)}`);
  return true;
}
/* Speichern unter mit dem Windows-Dialog */
async function saveAsNative() {
  if (editing) commitEditing();
  let path;
  try { path = await pickFile('save', doc.file ? baseName(doc.file) : safeName() + '.cantcodecad'); } catch (err) { toast(err.message); return; }
  if (!path) return;
  if (!/\.cantcodecad$/i.test(path)) path += '.cantcodecad';
  const base = baseName(path).replace(/\.cantcodecad$/i, '');
  if (!doc.features.length || isDefaultPartName(doc.name) || isDefaultAsmName(doc.name)) { doc.name = base; $('#docname').value = base; }
  await savePath(path);
}
async function cmdSave() {
  if (editing) commitEditing();
  if (doc.file && (isAbsPath(doc.file) || (await projectFiles()))) { await savePath(doc.file); return; }
  if (await nativeCaps()) return saveAsNative();
  if (!(await projectFiles())) { downloadSave(); return; }
  openSaveDialog();
}
async function openSaveDialog() {
  if (await nativeCaps()) return saveAsNative();
  if (editing) commitEditing();
  const files = await projectFiles();
  if (!files) { downloadSave(); return; }
  const d = $('#dialog');
  const folders = [...new Set(files.map(f => f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '').filter(Boolean))];
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('saveas', 20)}<b class="dtitle">Speichern unter</b></header><div class="dbody">
    <label class="row col"><span>Name (Unterordner mit „/“, z. B. Kran/Stütze)</span><input type="text" class="txt" data-save="name" value="${esc((doc.file || safeName() + '.cantcodecad').replace(/\.cantcodecad$/i, ''))}" list="savefolders"></label>
    <datalist id="savefolders">${folders.map(f => `<option value="${esc(f)}/">`).join('')}</datalist>
    <p class="info">Gespeichert wird im Ordner <b>Projekte</b> neben cantcodecad. Die vorige Fassung landet in Projekte/.backup.</p>
    </div><footer><button type="button" class="btn primary" data-cmd="save-ok">Speichern</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
  d.hidden = false;
  setMode('filedlg');
  const inp = d.querySelector('[data-save="name"]');
  inp.focus(); inp.select();
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') saveFromDialog(); if (e.key === 'Escape') closeFileDialog(); });
}
async function saveFromDialog() {
  const inp = $('#dialog [data-save="name"]');
  if (!inp) return;
  let p = inp.value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/[:*?"<>|]+/g, '_');
  if (!p) { toast('Bitte einen Namen eingeben.'); return; }
  if (!/\.cantcodecad$/i.test(p)) p += '.cantcodecad';
  const files = (await projectFiles()) || [];
  if (files.some(f => f.path.toLowerCase() === p.toLowerCase()) && p !== doc.file && !(await askConfirm(`Projekte/${p} gibt es schon. Überschreiben?`, 'Überschreiben', true))) return;
  const base = baseName(p).replace(/\.cantcodecad$/i, '');
  if (!doc.features.length || isDefaultPartName(doc.name)) { doc.name = base; $('#docname').value = base; }
  if (await savePath(p)) closeFileDialog();
}
function closeFileDialog() { closeDialog(); setMode('model'); }
let fileDlgKind = 'open';
async function openFileDialog(kind) {
  if (editing) cancelEditing();
  if (await nativeCaps()) {
    // Windows-Dialog: Datei überall wählbar; Einfügen/Ableiten verknüpft über den vollen Pfad
    let path;
    try { path = await pickFile('open'); } catch (err) { toast(err.message); return; }
    if (!path) return;
    if (kind !== 'open' && doc.file && path.toLowerCase() === String(doc.file).toLowerCase()) { toast('Das ist das geöffnete Dokument selbst.'); return; }
    fileDlgKind = kind;
    return filePicked(path);
  }
  const files = await projectFiles();
  if (!files) {
    if (kind === 'open') { $('#fileopen').click(); return; }
    toast('Für Baugruppen braucht cantcodecad den Projektordner: Bitte das schwarze Server-Fenster schließen und „cantcodecad starten.bat“ neu starten.', 8000);
    return;
  }
  fileDlgKind = kind;
  const list = files.filter(f => kind === 'open' || f.path !== doc.file).sort((a, b) => b.mtime - a.mtime);
  const d = $('#dialog');
  d.className = 'dialog filedlg';
  d.innerHTML = `<header>${icon(kind === 'insert' ? 'insert' : 'folder', 20)}<b class="dtitle">${kind === 'insert' ? 'Teil einfügen' : kind === 'derive' ? 'Ableiten aus …' : 'Öffnen'}</b></header><div class="dbody">
    <input type="search" class="txt" data-fsearch placeholder="Suchen …">
    <div class="flist2">${list.length ? list.map(f => `<button type="button" class="frow" data-cmd="file-pick" data-path="${esc(f.path)}"><span>${icon('file', 15)} ${esc(f.path.replace(/\.cantcodecad$/i, ''))}</span><em>${new Date(f.mtime).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</em></button>`).join('') : '<p class="info">Im Ordner Projekte liegt noch nichts. Erst ein Teil mit Strg+S speichern.</p>'}</div>
    ${kind === 'derive' ? '<p class="info">Die Körper des Dokuments werden an ihrer Lage übernommen und bleiben verknüpft: Änderst und speicherst du das Dokument, aktualisiert sich die Ableitung beim Öffnen oder mit „Teile aktualisieren“.</p>' : ''}
    ${kind === 'insert' ? '<p class="info">Das Teil wird verknüpft: Änderst und speicherst du es, aktualisiert sich die Baugruppe beim Öffnen oder mit „Teile aktualisieren“.</p>' : ''}
    </div><footer>${kind === 'open' ? '<button type="button" class="btn" data-cmd="file-local">Vom Rechner …</button>' : ''}<button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
  d.hidden = false;
  setMode('filedlg');
  const s = d.querySelector('[data-fsearch]');
  s.focus();
  s.addEventListener('input', () => { const q = s.value.toLowerCase(); d.querySelectorAll('.frow').forEach(r => { r.hidden = !r.dataset.path.toLowerCase().includes(q); }); });
  s.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeFileDialog(); });
}
async function fetchRaw(path) {
  if (isAbsPath(path)) return JSON.parse(await readText(path));
  const r = await fetch('/Projekte/' + path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
  if (!r.ok) throw new Error('Datei nicht gefunden: ' + path);
  return r.json();
}
/* Teil oder Baugruppe (für Einfügen, Ableiten, Verweis einer Zeichnung) */
async function fetchPart(path) {
  const raw = await fetchRaw(path);
  if (raw && raw.kind === 'drawing') throw new Error('Das ist eine Zeichnung, kein Teil und keine Baugruppe.');
  return validateDoc(raw);
}
/* Dokument öffnen; eine Zeichnung holt ihr Modell frisch aus der verknüpften Datei (sonst die mitgespeicherte Kopie) */
async function fetchDoc(path) {
  const raw = await fetchRaw(path);
  if (!raw || raw.kind !== 'drawing') return validateDoc(raw);
  let d = validateDoc(raw);
  if (d.ref) {
    try {
      const m = await fetchPart(d.ref);
      d = validateDoc({ ...m, kind: 'drawing', name: d.name, ref: d.ref, modelName: m.name, modelKind: inferKind(m), drawing: d.drawing });
    } catch (err) { toast(`Modell ${fileLabel(d.ref)} nicht lesbar (${err.message}). Die Zeichnung zeigt den mitgespeicherten Stand.`, 8000); }
  }
  return d;
}
async function openProjectFile(path) {
  try {
    const prevB = lastBuild;
    const d = await fetchDoc(path);
    if (editing) cancelEditing();
    if (mode === 'drawing') closeDrawing();
    pushHistory();
    doc = d;
    doc.file = path;
    firstFit = true;
    afterDocChange();
    markSaved();
    addRecent(path, doc.name, inferKind(doc));
    toast(`${fileLabel(path)} geöffnet.`);
    refreshInserts(true);
    if (doc.kind === 'drawing') { const dd = doc; whenBuilt(prevB).then(() => { if (doc === dd && mode !== 'drawing') { openDrawing(); renderBrowser(); } }); }
    return true;
  } catch (err) { toast('Öffnen nicht möglich: ' + err.message); return false; }
}
async function filePicked(path) {
  closeFileDialog();
  if (fileDlgKind === 'open') return openProjectFile(path);
  if (fileDlgKind === 'derive') {
    try {
      const part = await fetchPart(path);
      if (doc.file && path === doc.file) { toast('Ein Dokument kann nicht von sich selbst ableiten.'); return; }
      delete part.file;
      const base = baseName(path).replace(/\.cantcodecad$/i, '');
      pushHistory();
      const f = { id: uid(), type: 'derive', name: nextFreeName(doc, `Abgeleitet ${base} `).replace(/ (\d+)$/, ' $1'), file: path, part, bodies: [] };
      ownNew(f);
      doc.features.push(f);
      store(); renderAll(); scheduleBuild(0);
      toast(`${base} abgeleitet. Doppelklick in der Zeitleiste wählt einzelne Körper.`);
    } catch (err) { toast('Ableiten nicht möglich: ' + err.message); }
    return;
  }
  try {
    const part = await fetchPart(path);
    if (doc.file && (part.inserts || []).some(i => i.file === doc.file)) { toast('Das Teil enthält diese Baugruppe selbst.'); return; }
    pushHistory();
    if (!doc.inserts) doc.inserts = [];
    const base = baseName(path).replace(/\.cantcodecad$/i, '');
    let name = base, k = 1;
    while (doc.inserts.some(i => i.name === name)) name = `${base} (${++k})`;
    const bb = lastBuild && lastBuild.mesh ? lastBuild.mesh.bbox : null;
    const at = bb ? [Math.round(bb[1][0] + 20), 0, 0] : [0, 0, 0];
    delete part.file;
    doc.inserts.push({ id: uid(), name, file: path, at, rot: null, part });
    store();
    renderBrowser();
    scheduleBuild(0);
    toast(`${name} eingefügt. Mit Gelenk (J) oder Verschieben (M) ausrichten.`);
  } catch (err) { toast('Einfügen nicht möglich: ' + err.message); }
}
/* Ableiten: Parameter und Skizzen des Dokuments als verknüpfte Kopien (Parameter mit src, Skizzen mit derivedFrom).
   Parameter werden als feste Werte übernommen; eigene Parameter gleichen Namens haben Vorrang. Skizzen: Ebene als
   feste Lage, Körperbezüge (projizierte Kanten) werden normale Geometrie; Maßausdrücke nur mit übernommenen Parametern. */
function syncDerived(f) {
  const part = f.part || {}, base = baseName(f.file || 'Dokument').replace(/\.cantcodecad$/i, '');
  let changed = false, skipped = 0;
  // Parameter
  doc.params = doc.params || [];
  const src = part.params || [], { vals, units } = paramValues(src);
  if (f.withParams) {
    src.forEach(p => {
      const v = vals[p.name];
      if (!Number.isFinite(v)) return;
      const ex = doc.params.find(x => x.name === p.name);
      if (ex && ex.src !== f.id) { skipped++; return; }
      // mit Einheit übernehmen („30 deg“, „100 mm“), sonst würde aus einem Winkel eine bloße Zahl
      const expr = wertMitEinheit(v, units[p.name]);
      if (ex) { if (ex.expr !== expr) { ex.expr = expr; changed = true; } }
      else { doc.params.push({ id: uid(), name: p.name, expr, comment: `aus ${base}${p.comment ? ` – ${p.comment}` : ''}`, src: f.id }); changed = true; }
    });
  }
  const keepP = f.withParams ? new Set(src.map(p => p.name)) : new Set();
  const before = doc.params.length;
  doc.params = doc.params.filter(p => p.src !== f.id || keepP.has(p.name));
  if (doc.params.length !== before) changed = true;
  // Skizzen
  const want = new Set(f.sketches || []);
  let at = doc.features.indexOf(f);
  (part.features || []).filter(s => s.type === 'sketch' && want.has(s.id)).forEach(s => {
    const ex = doc.features.find(x => x.derivedFrom && x.derivedFrom.f === f.id && x.derivedFrom.s === s.id);
    const c = JSON.parse(JSON.stringify(s));
    c.id = ex ? ex.id : uid();
    c.name = ex ? ex.name : `${s.name} (abgeleitet)`;
    c.derivedFrom = { f: f.id, s: s.id };
    const pl = s.plane || {};
    c.plane = { key: 'FACE', label: `abgeleitet aus ${base}`, o: pl.o, x: pl.x, y: pl.y, n: pl.n };
    (c.points || []).forEach(p => { delete p.ref; });
    (c.curves || []).forEach(k => { delete k.ref; });
    if (!f.withParams) (c.rules || []).forEach(r => { delete r.expr; });
    delete c.owner;
    if (ex) { const i = doc.features.indexOf(ex); if (JSON.stringify(ex) !== JSON.stringify(c)) { doc.features[i] = c; changed = true; } }
    else { doc.features.splice(++at, 0, c); changed = true; }
  });
  // abgewählte Skizzen entfernen, sofern nichts darauf aufbaut
  doc.features.filter(x => x.derivedFrom && x.derivedFrom.f === f.id && !want.has(x.derivedFrom.s)).forEach(x => {
    if (dependents(doc, x.id).length) return;
    doc.features = doc.features.filter(y => y !== x); changed = true;
  });
  return { changed, skipped };
}
/* Verknüpfte Teile neu laden; Name/Material der Teilkörper übernehmen */
async function refreshInserts(silent) {
  const list = (doc.inserts || []).filter(i => i.file), derived = doc.features.filter(f => f.type === 'derive' && f.file);
  if (!list.length && !derived.length) { if (!silent) toast('Keine verknüpften Teile.'); return; }
  let changed = 0, missing = 0, paramsDirty = false;
  for (const f of derived) {
    try {
      const part = await fetchPart(f.file);
      delete part.file;
      if (JSON.stringify(part) !== JSON.stringify(f.part)) { f.part = part; changed++; if ((f.sketches || []).length || f.withParams) { syncDerived(f); paramsDirty = true; } }
    } catch (_) { missing++; }
  }
  for (const ins of list) {
    try {
      const part = await fetchPart(ins.file);
      delete part.file;
      if (JSON.stringify(part) !== JSON.stringify(ins.part)) {
        ins.part = part;
        changed++;
        Object.keys(doc.bodies || {}).filter(id => id.startsWith(ins.id + '/')).forEach(id => { const d = insertBodyDefaults(id); Object.assign(doc.bodies[id], { name: d.name, material: d.material, color: d.color }); });
      }
    } catch (_) { missing++; }
  }
  if (paramsDirty) await applyParams();
  if (changed) { store(); renderAll(); scheduleBuild(0); }
  if (!silent || changed || missing) toast(`${changed ? `${changed} Teil${changed > 1 ? 'e' : ''} aktualisiert` : 'Alle Teile aktuell'}${missing ? ` · ${missing} nicht gefunden` : ''}.`);
}
async function removeInsert(id) {
  const ins = (doc.inserts || []).find(x => x.id === id);
  if (!ins) return;
  const deps = dependents(doc, id);
  if (deps.length && !(await askConfirm(`${ins.name} wird von ${deps.map(d => d.name).join(', ')} benutzt. Trotzdem entfernen?`, 'Entfernen', true))) return;
  pushHistory();
  doc.inserts = doc.inserts.filter(x => x.id !== id);
  store();
  renderBrowser();
  scheduleBuild(0);
}
/* Eingefügtes Teil duplizieren (Kopieren/Einfügen bzw. „Mit Gelenken duplizieren“). Mit Gelenken: gleiche Lage,
   jedes Gelenk, das das Teil bewegt, wird mit der Kopie wiederholt (danach Ursprung 2 auf die nächste Stelle setzen).
   Ohne Gelenke: daneben abgelegt. Körper-Eigenschaften (Material, Farbe) gehen mit. */
function duplicateInsert(id, withJoints) {
  const ins = (doc.inserts || []).find(x => x.id === id);
  if (!ins) return;
  if (editing) cancelEditing();
  pushHistory();
  const nid = uid(), base = ins.name.replace(/ \(\d+\)$/, '');
  let k = 2;
  while (doc.inserts.some(x => x.name === `${base} (${k})`)) k++;
  const copy = { ...clone(ins), id: nid, name: `${base} (${k})` };
  if (!withJoints) {
    const bb = insertBodies(id).map(b => lastBuild && lastBuild.mesh && lastBuild.mesh.bodies.find(mb => mb.id === b)).filter(Boolean).map(mb => mb.bbox);
    const w = bb.length ? Math.max(...bb.map(b => b[1][0])) - Math.min(...bb.map(b => b[0][0])) : 50;
    copy.at = [ins.at[0] + Math.ceil(w) + 10, ins.at[1], ins.at[2]];
  }
  doc.inserts.push(copy);
  Object.keys(doc.bodies || {}).forEach(b => { if (b.startsWith(id + '/')) doc.bodies[nid + b.slice(id.length)] = clone(doc.bodies[b]); });
  let nj = 0;
  if (withJoints) {
    // Bezüge auf Körper der Vorlage („<id>/…“) auf die Kopie umschreiben
    const rebase = f => JSON.parse(JSON.stringify(f).split(`"${id}/`).join(`"${nid}/`));
    doc.features.filter(f => (f.type === 'joint' || f.type === 'align') && f.comp === id).forEach(f => {
      const g = rebase(f);
      g.id = uid(); g.comp = nid; g.name = nextName(doc, f.type);
      doc.features.splice(doc.features.indexOf(f) + 1, 0, g);
      nj++;
    });
  }
  store(); renderAll(); scheduleBuild(0);
  toast(withJoints ? `${copy.name} mit ${nj} Gelenk${nj === 1 ? '' : 'en'} dupliziert. Gelenk bearbeiten und Ursprung 2 auf die neue Stelle setzen.` : `${copy.name} neben ${ins.name} eingefügt.`, 7000);
}
function cmdOpen() { openFileDialog('open'); }
$('#fileopen').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = validateDoc(JSON.parse(await file.text()));
    if (editing) cancelEditing();
    pushHistory();
    doc = d;
    firstFit = true;
    afterDocChange();
    toast(`${file.name} geöffnet.`);
  } catch (err) {
    toast('Datei konnte nicht geöffnet werden: ' + err.message);
  }
});
/* 3MF: ein Objekt je sichtbarem Körper mit Name und Farbe (für Bambu Studio, PrusaSlicer, Orca, Cura) */
/* ---------------- Import: STEP/STL als Körper, DXF als Skizze ---------------- */
function toBase64(buf) {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
$('#fileimport').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase(), base = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
  try {
    if (ext === 'svg') {
      // gewählte ebene Fläche → SVG mittig darauf, sonst XY in den SVG-Koordinaten
      const fsel = modelSel.faces.length === 1 && modelSel.faces[0].info && modelSel.faces[0].info.type === 'PLANE' ? modelSel.faces[0].info.plane : null;
      const plane = fsel ? { key: 'FACE', label: 'Fläche des Körpers', o: round9(fsel.o), x: round9(fsel.x), y: round9(fsel.y), n: round9(fsel.n) } : ORIGIN_PLANES.XY;
      const { sketch, count, skipped, size } = svgToSketch(await file.text(), plane, base);
      if (fsel) {
        const xs = sketch.points.map(p => p.x), ys = sketch.points.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        sketch.points.forEach(p => { p.x -= cx; p.y -= cy; });
      }
      pushHistory();
      doc.features.push({ id: uid(), ...sketch });
      store(); renderAll(); scheduleBuild(0);
      toast(`${file.name}: ${count} Kurven als Skizze ${fsel ? 'auf die Fläche' : 'auf XY'} (${fmt(size[0], 1)} × ${fmt(size[1], 1)} mm)${skipped ? `, ${skipped} Texte/Bilder übersprungen – Texte vorher in Pfade umwandeln` : ''}. Jetzt z. B. extrudieren oder gravieren.`, 8000);
      return;
    }
    if (ext === 'dxf') { openDxfImport(await file.text(), base); return; }
    if (file.size > 100 * 1024 * 1024) { toast('Die Datei ist größer als 100 MB – bitte kleiner exportieren.'); return; }
    const f = { id: uid(), type: 'import', name: base, format: ext === 'stl' ? 'stl' : 'step', file: file.name, dx: 0, dy: 0, dz: 0 };
    // STEP in ein neues, leeres Teil: nach dem Einlesen mit eigenen Funktionen aufbauen (stepAlsFeatures)
    if (f.format === 'step' && !doc.features.length && inferKind(doc) !== 'drawing' && loadPrefs().stepAufbau !== false) stepAufbau = f.id;
    // Zeiten des Einlesens und Sicherns: beides läuft im Hauptthread und skaliert mit der Dateigröße.
    let tL = performance.now();
    f.data = f.format === 'stl' ? toBase64(await file.arrayBuffer()) : await file.text();
    const readMs = Math.round(performance.now() - tL);
    ownNew(f);
    pushHistory();
    doc.features.push(f);
    tL = performance.now();
    store();
    const storeMs = Math.round(performance.now() - tL);
    renderAll(); scheduleBuild(0);
    firstFit = true;
    toast(`${file.name} wird eingelesen …${readMs >= 100 && diagnose() ? ` Datei eingelesen in ${readMs} ms${storeMs >= 50 ? `, Dokument gesichert in ${storeMs} ms` : ''}.` : ''}${f.format === 'stl' && file.size > 2 * 1024 * 1024 ? ' Die Dreiecke werden zu einem Körper zusammengesetzt, das dauert bei großen Dateien einige Sekunden.' : ''}${file.size > 3 * 1024 * 1024 ? ' Große Datei: bitte das Teil im Projektordner speichern, der Browserspeicher reicht dafür nicht.' : ''}`, 6000);
  } catch (err) { toast('Import nicht möglich: ' + err.message, 6000); }
});

/* ---------------- DXF: Skizze oder ebene Fläche (Laser, Wasserstrahl, Plasma) ---------------- */
function exportSketchDXF(i) {
  const sk = doc.features[i];
  if (!sk || sk.type !== 'sketch') return;
  if (!sk.plane) { toast('Eine 3D-Skizze (ohne Ebene) geht nicht als DXF – DXF-Kurven liegen in einer Ebene.'); return; }
  if (sk.abwicklung) {
    // bearbeitete Abwicklung: Außen-/Innenkontur und Biegelinien wie bei der Abwicklung selbst
    const fl = skizzeAlsAbwicklung(migrateSketch(clone(sk)));
    if (!fl.contour.length) { toast('Die Skizze hat keine geschlossene Kontur.'); return; }
    download(`${safeName()}-${sk.name.replace(/[\\/:*?"<>|]+/g, '_')}.dxf`, new Blob([flatDXF(fl, dxfPrefs())], { type: 'application/dxf' }));
    toast(`${sk.name} als DXF gespeichert (Außenkonturen ${fl.contour.length}, Ausschnitte ${fl.holes.length}, Biegelinien ${fl.bends.length}).${fl.offen ? ` Offene Züge, nicht ausgegeben: ${fl.offen}.` : ''}`, 7000);
    return;
  }
  const { dxf, count } = sketchDXF(migrateSketch(clone(sk)), dxfPrefs());
  if (!count) { toast('Die Skizze hat keine Kurven.'); return; }
  download(`${safeName()}-${sk.name.replace(/[\\/:*?"<>|]+/g, '_')}.dxf`, new Blob([dxf], { type: 'application/dxf' }));
  toast(`${sk.name} als DXF gespeichert (${count} Kurve${count === 1 ? '' : 'n'}).`);
}
function startFaceDXF() {
  if (editing) cancelEditing();
  if (!hasBody()) { toast('Es gibt noch keinen Körper.'); return; }
  setMode('facedxf');
  vp.setPickMode('face');
  toast('Ebene Fläche anklicken – sie wird als DXF gespeichert (mit Löchern). Esc beendet.', 6000);
}
function endFaceDXF() { vp.setPickMode('none'); vp.setSelection({}); setMode('model'); }
async function faceDXFPick(h) {
  if (!h || h.kind !== 'face') return;
  if (h.info.type !== 'PLANE') { toast('Bitte eine ebene Fläche wählen.'); return; }
  try {
    const flat = await kernel.faceOutline({ kind: 'face', ref: faceRef(h.info), body: bodyIdAtFace(h.info) });
    download(`${safeName()}-Fläche.dxf`, new Blob([flatDXF(flat, dxfPrefs())], { type: 'application/dxf' }));
    toast(`Fläche als DXF gespeichert (${flat.holes.length} ${flat.holes.length === 1 ? 'Loch' : 'Löcher'}).`);
  } catch (err) { toast('DXF nicht möglich: ' + err.message); }
  endFaceDXF();
}

/* ---------------- Zuschnittliste für Rahmenstäbe (Stahlbau) ---------------- */
function cutListRows() {
  // Stäbe und ihre Kopien (Verschieben/Kopieren, Muster) zählen
  const base = new Map(((lastBuild && lastBuild.frames) || []).map(x => [x.id, x]));
  const cp = (lastBuild && lastBuild.copies) || {};
  const src = id => { let k = id, n = 0; while (!base.has(k) && cp[k] && n++ < 20) k = cp[k]; return base.get(k); };
  const fr = ((lastBuild && lastBuild.bodies) || []).map(id => { const x = src(id); return x && { ...x, id }; }).filter(x => x && !(bodyInfo(x.id) || {}).hidden);
  const groups = new Map();
  fr.forEach(x => {
    const ang = x.angles.map(a => Math.round(a * 10) / 10);
    const k = `${x.label}|${Math.round(x.Lmax * 2) / 2}|${[...ang].sort((a, b) => a - b).join('/')}`;
    if (!groups.has(k)) groups.set(k, { label: x.label, L: x.Lmax, angles: ang, n: 0, names: [], ids: [] });
    const g = groups.get(k); g.n++; g.names.push(bodyName(x.id)); g.ids.push(x.id);
  });
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || b.L - a.L);
}
const angTxt = a => a.map(v => `${fmt(v > 0.05 ? v : 0, 1)}°`).join(' / ');
function openCutList() {
  if (editing) cancelEditing();
  const rows = cutListRows(), welds = weldRows(), plates = plateRows();
  if (!rows.length && !welds.length && !plates.length) { toast('Es gibt keine Rahmenstäbe. Erst mit „Rahmen“ Stäbe aus einer Skizze erzeugen.'); return; }
  const tot = new Map();
  rows.forEach(r => tot.set(r.label, (tot.get(r.label) || 0) + r.L * r.n));
  const d = $('#dialog');
  d.className = 'dialog wide';
  d.innerHTML = `<header>${icon('cutlist', 20)}<b class="dtitle">Zuschnittliste</b></header><div class="dbody">
    <table class="cuttab"><thead><tr><th>Pos</th><th>Profil</th><th>Länge</th><th>Schnitt</th><th>Stk</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr title="${esc(r.names.join(', '))}"><td>${i + 1}</td><td>${esc(r.label)}</td><td>${fmtLenU(r.L, 1)}</td><td>${esc(angTxt(r.angles))}</td><td>${r.n}</td></tr>`).join('')}
    </tbody></table>
    <div class="cuttot">${[...tot.entries()].map(([l, L]) => `<span>${esc(l)}</span><b>${UF === 1 ? `${fmt(L / 1000, 3)} m` : fmtLenU(L, 1)}</b>`).join('')}</div>
    <p class="info small">Länge = längste Kante (Spitze der Gehrung). Schnitt = Gehrungswinkel an beiden Enden (0° = gerader Schnitt).</p>
    ${plates.length ? `<h4 class="subh">Bleche</h4><table class="cuttab"><thead><tr><th>Teil</th><th>Dicke</th><th>Maße</th><th>Stk</th></tr></thead><tbody>
    ${plates.map(p => `<tr><td>${esc(p.base)}</td><td>${fmtLenU(p.t, 1)}</td><td>${p.L.map(v => fmtLen(v, 1)).join(' × ')} ${UNIT}</td><td>${p.n}</td></tr>`).join('')}</tbody></table>` : ''}
    ${welds.length ? `<h4 class="subh">Schweißnähte</h4><table class="cuttab"><thead><tr><th>Naht</th><th>Art</th><th>a</th><th>Anz.</th><th>Länge</th></tr></thead><tbody>
    ${welds.map(w => `<tr><td>${esc(w.name)}</td><td>${weldKind(w.kind)}${w.all ? ' ringsum' : ''}</td><td>${fmtLenU(w.a, 1)}</td><td>${w.all && w.loops ? w.loops : w.count}</td><td>${fmtLenU(w.length, 0)}</td></tr>`).join('')}
    </tbody></table><div class="cuttot"><span>Nahtlänge gesamt</span><b>${UF === 1 ? `${fmt(welds.reduce((t, w) => t + w.length, 0) / 1000, 3)} m` : fmtLenU(welds.reduce((t, w) => t + w.length, 0), 0)}</b><span>Schweißgut ca.</span><b>${fmt(welds.reduce((t, w) => t + w.a * w.a * w.length, 0) * 7.85e-3, 0)} g</b></div>` : ''}
    </div><footer><button type="button" class="btn" data-cmd="cutlist-csv">CSV speichern</button><button type="button" class="btn primary" data-cmd="file-cancel">Schließen</button></footer>`;
  d.hidden = false;
  setMode('filedlg');
}
/* Blechteile (Knotenbleche, Endkappen): gleiche Art und gleiche Maße zusammenfassen */
function plateRows() {
  const m = lastBuild && lastBuild.mesh;
  const groups = new Map();
  ((lastBuild && lastBuild.parts) || []).forEach(p => {
    if (p.fastener || (bodyInfo(p.id) || {}).hidden) return;
    const mb = m && m.bodies.find(b => b.id === p.id);
    if (!mb) return;
    const L = mb.bbox[1].map((v, k) => v - mb.bbox[0][k]).sort((a, b) => b - a);
    const dims = `${fmt(L[0], 1)} × ${fmt(L[1], 1)}`, key = `${p.base}|${dims}|${p.t}`;
    if (!groups.has(key)) groups.set(key, { base: p.base, dims, L: L.slice(0, 2), t: p.t, n: 0 });
    groups.get(key).n++;
  });
  return [...groups.values()];
}
const weldKind = k => ({ i: 'I-Naht', v: 'V-Naht', hv: 'HV-Naht' })[k] || 'Kehlnaht';
/* Schweißnähte aus dem letzten Bauen (nur sichtbare Nahtkörper) */
function weldRows() {
  return ((lastBuild && lastBuild.welds) || []).filter(w => !(bodyInfo(w.id) || {}).hidden).map(w => ({ ...w, name: bodyName(w.id) }));
}
function downloadCutList() {
  download(`${safeName()}-Zuschnitt.csv`, new Blob(['\ufeff' + cutListCsv()], { type: 'text/csv;charset=utf-8' }));
}
function cutListCsv() {
  const rows = cutListRows(), welds = weldRows(), plates = plateRows();
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const csv = ['Pos;Profil;Länge mm;Schnitt Ende 1;Schnitt Ende 2;Stück;Körper']
    .concat(rows.map((r, i) => [i + 1, q(r.label), fmt(r.L, 1), q(fmt(r.angles[0] > 0.05 ? r.angles[0] : 0, 1) + '°'), q(fmt(r.angles[1] > 0.05 ? r.angles[1] : 0, 1) + '°'), r.n, q(r.names.join(', '))].join(';')))
    .concat(plates.length ? ['', 'Blech;Dicke mm;Maße mm;Stück'].concat(plates.map(p => [q(p.base), fmt(p.t, 1), q(p.dims), p.n].join(';'))) : [])
    .concat(welds.length ? ['', 'Naht;Art;a mm;Anzahl;Länge mm'].concat(welds.map(w => [q(w.name), q(weldKind(w.kind) + (w.all ? ' ringsum' : '')), fmt(w.a, 1), w.all && w.loops ? w.loops : w.count, fmt(w.length, 0)].join(';'))) : []).join('\r\n');
  return csv;
}

/* ---------------- Fertigungspaket: alles für die Werkstatt in einer ZIP ----------------
   STEP, Abwicklung (DXF, bei Blech), Zeichnung (PDF + DXF je Blatt), Stückliste (CSV), Zuschnittliste (bei Rahmen). */
async function packageFiles(prefix = '') {
  const files = [], notes = [], base = safeName(), enc = new TextEncoder(), P = prefix ? prefix + '/' : '';
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  try { const { buf } = await kernel.exportFile(doc.features, 'step', kctx()); files.push({ name: `${P}${base}.step`, data: new Uint8Array(buf) }); } catch (err) { notes.push('STEP: ' + err.message); }
  if (lastBuild && lastBuild.sheet) {
    try { const flat = computeFlat(doc, sheetRule(), lastBuild.sheet); files.push({ name: `${P}${base}-Abwicklung.dxf`, data: enc.encode(flatDXF(flat, dxfPrefs())) }); } catch (err) { notes.push('Abwicklung: ' + err.message); }
  }
  try {
    const { svgs, bom } = await renderSheetsForExport();
    // zum Auslesen der Stile kurz unsichtbar ins Dokument hängen
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;opacity:0;pointer-events:none'; // nicht visibility:hidden – sonst fehlen die Texte
    document.body.appendChild(host);
    try {
      const els = svgs.map(s => { const d = document.createElement('div'); d.innerHTML = s; host.appendChild(d); return d.querySelector('svg'); });
      files.push({ name: `${P}${base}-Zeichnung.pdf`, data: sheetsToPdf(els, doc.name || base) });
      els.forEach((el, i) => files.push({ name: `${P}${base}-Zeichnung${els.length > 1 ? `-Blatt${i + 1}` : ''}.dxf`, data: dxfBytes(sheetToDxf(el)) }));
    } finally { host.remove(); }
    // Einzelteil: Stückliste mit einer Zeile
    const rows = bom && bom.length ? bom : (() => {
      const ids = (lastBuild.bodies || []).filter(id => !(bodyInfo(id) || {}).hidden), vol = new Map(((lastBuild.mesh && lastBuild.mesh.bodies) || []).map(b => [b.id, b.volume || 0]));
      const mat = MATERIALS[(bodyInfo(ids[0]) || {}).material] || MATERIALS.none, g = mat.rho ? ids.reduce((a, id) => a + (vol.get(id) || 0) / 1000 * mat.rho, 0) : 0;
      return ids.length ? [{ pos: 1, qty: 1, name: doc.name || base, material: mat.rho ? mat.label : '–', mass: g ? fmtMass(g) : '–' }] : [];
    })();
    if (rows.length) files.push({ name: `${P}${base}-Stückliste.csv`, data: enc.encode('\ufeff' + ['Pos.;Menge;Benennung;Werkstoff;Masse'].concat(rows.map(b => [b.pos, b.qty, q(b.name), q(b.material), q(b.mass)].join(';'))).join('\r\n')) });
  } catch (err) { notes.push('Zeichnung: ' + err.message); }
  if (cutListRows().length || plateRows().length || weldRows().length) files.push({ name: `${P}${base}-Zuschnitt.csv`, data: enc.encode('\ufeff' + cutListCsv()) });
  return { files, notes };
}
async function exportPackage() {
  if (!hasBody()) { toast('Es gibt noch keinen Körper.'); return; }
  toast('Fertigungspaket wird erstellt …', 30000);
  const { files, notes } = await packageFiles();
  if (!files.length) { toast('Nichts exportiert: ' + notes.join(' · '), 7000); return; }
  download(`${safeName()}-Fertigung.zip`, makeZip(files));
  toast(`Fertigungspaket mit ${files.length} Dateien gespeichert${notes.length ? ` – Hinweise: ${notes.slice(0, 2).join(' · ')}` : ''}.`, notes.length ? 8000 : 3500);
}

/* ---------------- Überhang-Analyse und Druckausrichtung (3D-Druck) ---------------- */
// Sechs Lagen: welche Seite des Teils liegt auf dem Druckbett. down = Richtung, die beim Drucken nach unten zeigt.
const PRINT_DIRS = {
  'z-': { label: 'Unterseite (−Z)', down: [0, 0, -1], map: (x, y, z) => [x, y, z] },
  'z+': { label: 'Oberseite (+Z)', down: [0, 0, 1], map: (x, y, z) => [x, -y, -z] },
  'x-': { label: 'Links (−X)', down: [-1, 0, 0], map: (x, y, z) => [-z, y, x] },
  'x+': { label: 'Rechts (+X)', down: [1, 0, 0], map: (x, y, z) => [z, y, -x] },
  'y-': { label: 'Vorne (−Y)', down: [0, -1, 0], map: (x, y, z) => [x, -z, y] },
  'y+': { label: 'Hinten (+Y)', down: [0, 1, 0], map: (x, y, z) => [x, z, -y] }
};
const overhang = { dir: 'z-', angle: 45, stats: null, sup: { style: 'none', gap: 0.2, spacing: 6, res: null, error: null, laeuft: false } };
/* Fläche mit Überhang, Auflagefläche und Bauhöhe je Lage aus dem Anzeigenetz */
function overhangStats(mesh, angle) {
  const P = mesh.positions, I = mesh.index, lim = Math.sin(angle * Math.PI / 180), out = {};
  let total = 0;
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    tris.push([nx / l, ny / l, nz / l, l / 2, a, b, c]);
    total += l / 2;
  }
  for (const [key, D] of Object.entries(PRINT_DIRS)) {
    const [dx, dy, dz] = D.down;
    let low = -Infinity, high = Infinity;
    for (let i = 0; i < P.length; i += 3) { const h = P[i] * dx + P[i + 1] * dy + P[i + 2] * dz; if (h > low) low = h; if (h < high) high = h; }
    let over = 0, contact = 0;
    tris.forEach(([nx, ny, nz, A, a, b, c]) => {
      const sdn = nx * dx + ny * dy + nz * dz;
      if (sdn <= lim + 1e-6) return;
      const onBed = sdn > 0.999 && [a, b, c].every(k => P[k] * dx + P[k + 1] * dy + P[k + 2] * dz > low - 0.01);
      if (onBed) contact += A; else over += A;
    });
    out[key] = { over, contact, height: low - high };
  }
  const best = Object.keys(out).sort((p, q) => (out[p].over - out[q].over) || (out[q].contact - out[p].contact) || (out[p].height - out[q].height))[0];
  return { dirs: out, total, best };
}
function openOverhang() {
  if (editing) cancelEditing();
  if (!hasBody() || !lastBuild || !lastBuild.mesh) { toast('Es gibt keinen sichtbaren Körper.'); return; }
  setMode('overhang');
  renderOverhang();
}
function renderOverhang() {
  const m = lastBuild && lastBuild.mesh;
  if (!m) { closeOverhang(); return; }
  const st = overhang.stats = overhangStats(m, overhang.angle);
  const cur = st.dirs[overhang.dir];
  const sup = overhang.sup;
  vp.setOverhang({ angle: overhang.angle, down: PRINT_DIRS[overhang.dir].down });
  const supInfo = sup.style === 'none' ? ''
    : sup.laeuft ? '<p class="info small">Rechne die Stützstruktur …</p>'
      : sup.error ? `<p class="derr">Stützstruktur: ${esc(sup.error)}</p>`
        : sup.res && sup.res.volume > 0
          ? `<div class="ohsum"><span>Stützmaterial</span><b>${fmt(sup.res.volume, 0)} mm³${m.volume ? ` (${fmt(sup.res.volume / m.volume * 100, 0)} % des Teils)` : ''}</b>
             <span>Höhe bis zum Bett</span><b>${fmt(sup.res.bbox ? Math.abs(sup.res.bbox[1][2] - sup.res.bbox[0][2]) : 0, 1)} mm</b></div>
             <p class="info small">Grau im Modell: das Stützmaterial. Das Gitter lässt Stege von halber Rasterweite stehen, der Abstand hält die Stütze vom Werkstück fern – beides spart Material. „3MF in dieser Lage“ gibt es als zweites Objekt mit aus – im Drucker lässt es sich abbrechen oder abschneiden.</p>`
          : '<p class="info small">In dieser Lage braucht das Teil keine Stützen.</p>';
  const d = $('#dialog');
  const focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.oh;
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('overhang', 20)}<b class="dtitle">Überhang (3D-Druck)</b></header><div class="dbody">
    <label class="row"><span>Grenzwinkel</span><span class="num"><input type="number" step="5" min="5" max="85" data-oh="angle" value="${overhang.angle}"><em>°</em></span></label>
    <div class="row col"><span>Auf dem Druckbett liegt</span></div>
    <div class="ohlist">${Object.entries(PRINT_DIRS).map(([k, D]) => {
      const x = st.dirs[k];
      return `<button type="button" class="ohrow" data-cmd="oh-dir" data-dir="${k}" aria-pressed="${k === overhang.dir}"><span>${esc(D.label)}${k === st.best ? ' <b class="best">★ beste</b>' : ''}</span><em>${fmt(x.over, 0)} mm²</em></button>`;
    }).join('')}</div>
    <div class="ohsum"><span><i class="sw red"></i>Überhang</span><b>${fmt(cur.over, 0)} mm² (${fmt(st.total ? cur.over / st.total * 100 : 0, 1)} %)</b>
      <span><i class="sw green"></i>Auflage</span><b>${fmt(cur.contact, 0)} mm²</b>
      <span>Bauhöhe</span><b>${fmt(cur.height, 1)} mm</b></div>
    <p class="info small">Rot: Flächen, die flacher als ${overhang.angle}° zur Senkrechten nach unten zeigen und Stützen brauchen. Orange: knapp an der Grenze. Fasen statt Rundungen an Unterkanten helfen.</p>
    <div class="row col"><span>Stützstruktur</span><span class="btns">${[['none', 'Keine'], ['block', 'Vollblock'], ['grid', 'Gitter']].map(([k, l]) => `<button type="button" class="chip" data-cmd="oh-sup" data-style="${k}" aria-pressed="${sup.style === k}">${l}</button>`).join('')}</span></div>
    ${sup.style === 'none' ? '' : `<div class="row"><span>Abstand zum Teil</span><span class="num"><input type="number" step="0.1" min="0" max="5" data-oh="gap" value="${sup.gap}"><em>mm</em></span></div>`}${sup.style === 'grid' ? `<div class="row"><span>Rasterweite</span><span class="num"><input type="number" step="1" min="2" max="40" data-oh="spacing" value="${sup.spacing}"><em>mm</em></span></div>` : ''}${supInfo}
    </div><footer><button type="button" class="btn" data-cmd="oh-3mf" title="Exportiert das Teil so gedreht, dass die gewählte Seite unten liegt">3MF in dieser Lage</button><button type="button" class="btn primary" data-cmd="oh-close">Schließen</button></footer>`;
  d.hidden = false;
  if (focus) { const i = d.querySelector(`[data-oh="${focus}"]`); if (i) { i.focus(); const v = i.value; i.value = ''; i.value = v; } }
}
$('#dialog').addEventListener('change', e => {
  const t = e.target;
  if ((t.dataset.dvs != null || t.dataset.dvp != null) && editing && editing.feature.type === 'derive') {
    // Parameter/Skizzen sofort ins Dokument übernehmen (eigene Einträge neben dem Feature)
    const ef = editing.feature, df = doc.features.find(x => x.id === ef.id);
    if (!df) return;
    pushHistory();
    const sk = [...document.querySelectorAll('#dialog [data-dvs]')].filter(x => x.checked).map(x => x.dataset.dvs), wp = !!(document.querySelector('#dialog [data-dvp]') || {}).checked;
    ef.sketches = df.sketches = sk; ef.withParams = df.withParams = wp;
    const r = syncDerived(df);
    editing.index = doc.features.indexOf(df);
    store(); renderTimeline(); renderBrowser();
    applyParams().then(() => scheduleBuild(0));
    if (r.skipped) toast(`${r.skipped} Parameter nicht übernommen – eigener Parameter gleichen Namens hat Vorrang.`);
    return;
  }
  if (t.dataset.dv != null && editing && editing.feature.type === 'derive') {
    editing.feature.bodies = [...document.querySelectorAll('#dialog [data-dv]')].filter(x => x.checked).map(x => x.dataset.dv);
    scheduleBuild(0);
    return;
  }
  if (t.dataset.oh == null) return;
  const v = num(t.value);
  if (t.dataset.oh === 'angle') {
    if (!(v >= 5 && v <= 85)) { t.value = overhang.angle; return; }
    overhang.angle = v;
    renderOverhang();
    scheduleSupports();
    return;
  }
  if (t.dataset.oh === 'gap') {
    if (!(v >= 0 && v <= 5)) { t.value = overhang.sup.gap; return; }
    overhang.sup.gap = v;
    scheduleSupports();
    return;
  }
  if (t.dataset.oh === 'spacing') {
    if (!(v >= 2 && v <= 40)) { t.value = overhang.sup.spacing; return; }
    overhang.sup.spacing = v;
    scheduleSupports();
  }
});
let supSeq = 0, supTimer = null;
function scheduleSupports() {
  clearTimeout(supTimer);
  supTimer = setTimeout(runSupports, 250);
}
/* Stützstruktur neu berechnen und als grauen Zusatzkörper zeigen */
async function runSupports() {
  const sup = overhang.sup;
  const seq = ++supSeq;
  clearTimeout(supTimer);
  vp.setMarkMeshes(null);
  if (mode !== 'overhang' || sup.style === 'none') { sup.res = null; sup.error = null; return; }
  if (!kernelReady) return;
  sup.laeuft = true;
  sup.error = null;
  renderOverhang();
  try {
    const res = await kernel.supports(doc.features, kctx(), {
      down: PRINT_DIRS[overhang.dir].down, angle: overhang.angle, style: sup.style,
      gap: sup.gap, spacing: sup.spacing, tolerance: 0.05
    });
    if (seq !== supSeq || mode !== 'overhang') return;
    sup.res = res;
    if (res.vertices) vp.setMarkMeshes([{ positions: res.vertices, index: res.triangles, color: 0x9aa3ad, solid: true }]);
  } catch (err) {
    if (seq !== supSeq || mode !== 'overhang') return;
    sup.res = null;
    sup.error = err.message;
  }
  sup.laeuft = false;
  if (mode === 'overhang') renderOverhang();
}
function closeOverhang() { vp.setOverhang(null); vp.setMarkMeshes(null); closeDialog(); setMode('model'); }

async function cmdExport3MF(orient) {
  if (editing) commitEditing();
  if (!kernelReady) { toast('Der Geometriekern lädt noch.'); return; }
  try {
    toast('3MF wird erzeugt …');
    const { items } = await kernel.mesh3mf(doc.features, kctx(), 0.01);
    if (!items.length) { toast('Es gibt keinen sichtbaren Körper.'); return; }
    const D = typeof orient === 'string' && PRINT_DIRS[orient];
    /* Stützstruktur passt nur zur Lage, für die sie gerechnet wurde */
    const sup = D && orient === overhang.dir && overhang.sup.res && overhang.sup.res.vertices ? overhang.sup.res : null;
    if (sup) items.push({ id: null, vertices: new Float32Array(sup.vertices), triangles: new Uint32Array(sup.triangles) });
    if (D && orient !== 'z-') {
      // in Druckausrichtung drehen und aufs Bett (z = 0) legen
      let zmin = Infinity;
      items.forEach(it => { const v = it.vertices; for (let i = 0; i < v.length; i += 3) { const q = D.map(v[i], v[i + 1], v[i + 2]); v[i] = q[0]; v[i + 1] = q[1]; v[i + 2] = q[2]; if (q[2] < zmin) zmin = q[2]; } });
      items.forEach(it => { const v = it.vertices; for (let i = 2; i < v.length; i += 3) v[i] -= zmin; });
    }
    const blob = build3MF(items.map(it => it.id
      ? { name: bodyName(it.id), color: bodyColor(bodyInfo(it.id)), vertices: it.vertices, triangles: it.triangles }
      : { name: 'Stützmaterial', color: '#9aa3ad', vertices: it.vertices, triangles: it.triangles }), doc.name);
    download(`${safeName()}.3mf`, blob);
    toast(`${safeName()}.3mf exportiert (${items.length} Objekt${items.length > 1 ? 'e' : ''}).`);
  } catch (err) {
    toast('3MF-Export nicht möglich: ' + err.message);
  }
}

/* ---------------- Kollisionsprüfung (Prüfen → Kollision) ---------------- */
async function openInterference() {
  if (editing) cancelEditing();
  if (!hasBody()) { toast('Es gibt noch keine Körper.'); return; }
  const d = $('#dialog');
  d.className = 'dialog';
  d.innerHTML = `<header>${icon('interfere', 20)}<b class="dtitle">Kollision</b></header><div class="dbody"><p class="info">Prüfe alle sichtbaren Körper …</p></div><footer><button type="button" class="btn primary" data-cmd="interfere-close">Schließen</button></footer>`;
  d.hidden = false;
  setMode('interfere');
  try {
    const { hits, pairs } = await kernel.interfere(doc.features, kctx());
    if (mode !== 'interfere') return;
    vp.setMarkMeshes(hits.map(h => ({ positions: h.positions, index: h.index })));
    const body = hits.length
      ? `<p class="info">${hits.length} Überschneidung${hits.length > 1 ? 'en' : ''} (rot):</p><div class="flist2 ilist">${hits.map(h => `<div class="frow"><span>${esc(bodyName(h.a))} ↔ ${esc(bodyName(h.b))}</span><em>${fmt(h.volume, 2)} mm³</em></div>`).join('')}</div>`
      : `<p class="info">Keine Überschneidungen zwischen ${pairs} Körperpaar${pairs === 1 ? '' : 'en'}. Berührungen zählen nicht.</p>`;
    d.querySelector('.dbody').innerHTML = body;
  } catch (err) {
    d.querySelector('.dbody').innerHTML = `<p class="derr">Prüfung nicht möglich: ${esc(err.message)}</p>`;
  }
}
function closeInterference() { vp.setMarkMeshes(null); closeDialog(); setMode('model'); }

async function cmdExport(format) {
  if (editing) commitEditing();
  if (!kernelReady) { toast('Der Geometriekern lädt noch.'); return; }
  try {
    toast(format === 'stl' ? 'STL wird erzeugt …' : 'STEP wird erzeugt …');
    const { buf } = await kernel.exportFile(doc.features, format, kctx());
    download(`${safeName()}.${format}`, new Blob([buf], { type: format === 'stl' ? 'model/stl' : 'application/step' }));
    toast(`${safeName()}.${format} exportiert.`);
  } catch (err) {
    toast('Export nicht möglich: ' + err.message);
  }
}

async function exportBodySTL(id) {
  if (!kernelReady) { toast('Der Geometriekern lädt noch.'); return; }
  try {
    const others = ((lastBuild && lastBuild.bodies) || []).filter(x => x !== id);
    const { buf } = await kernel.exportFile(doc.features, 'stl', { ...kctx(), hidden: others });
    const name = (bodyName(id) || 'Koerper').replace(/[\\/:*?"<>|]+/g, '_');
    download(`${name}.stl`, new Blob([buf], { type: 'model/stl' }));
    toast(`${name}.stl exportiert.`);
  } catch (err) { toast('Export nicht möglich: ' + err.message); }
}

const { RCMD, SEL_FILTERS, caretSvg, closeRibbonMenu, modelPickMode, navState, openCmdSearch, renderNavbar, renderRibbon, renderSketchbar, saveNav, setNavTool, syncRibbon } = setupUiBars({ get navScheme() { return navPrefs.nav; }, docKind: () => inferKind(doc), get editing() { return editing; }, activeComp: () => { const c = doc.activeComp && (doc.components || []).find(x => x.id === doc.activeComp); return c ? c.name : null; }, get DVIEWS() { return DVIEWS; }, get drawing() { return drawing; }, get editor() { return editor; }, get lastCmd() { return lastCmd; }, get measure() { return measure; }, get mode() { return mode; }, get modelSel() { return modelSel; }, get nesting() { return nesting; }, get overhang() { return overhang; }, get section() { return section; }, get sketchState() { return sketchState; }, get vp() { return vp; }, get $() { return $; }, get $$() { return $$; }, get esc() { return esc; }, get redo() { return redo; }, get runCmd() { return runCmd; }, get selCount() { return selCount; }, get toast() { return toast; }, get undo() { return undo; }, get updateSectionBtn() { return updateSectionBtn; } });
let lastCmd = null;
const ASM_CMDS = new Set(['insert', 'fastener', 'component', 'joint', 'rigid', 'motionlink']);
function runCmd(cmd, el) {
  if (ASM_CMDS.has(cmd) && inferKind(doc) !== 'assembly') {
    toast(`${RCMD[cmd][1]} gibt es nur in einer Baugruppe: Zusammenfügen → Zu Baugruppe hinzufügen, oder in den Dokumenteinstellungen auf Baugruppe umstellen.`, 7000);
    return;
  }
  if (RCMD[cmd] && cmd !== 'measure') lastCmd = cmd;
  if (cmd.startsWith('gd-')) return gdCmd(cmd, el);
  if (cmd.startsWith('fs-')) return frameSimCmd(cmd, el);
  if (cmd.startsWith('ss-')) return solidSimCmd(cmd, el);
  if (cmd.startsWith('sim-')) return similarCmd(cmd, el);
  if (cmd.startsWith('mot-')) return motionCmd(cmd, el);
  if (/^cfg-(regel|wenn|dann)-/.test(cmd)) return cfgRegelCmd(cmd, el);
  if (cmd === 'kstregel') { if (editing) cancelEditing(); return oeffneKunststoffRegel(); }
  if (cmd === 'antrieb') { if (editing) cancelEditing(); return oeffneAntrieb(); }
  if (cmd === 'antrieb-ok') return antriebSchliessen(true);
  if (cmd === 'antrieb-abbrechen') return antriebSchliessen(false);
  if (cmd === 'kst-ok') return kunststoffOk();
  if (cmd === 'flat-all') { if (editing) cancelEditing(); return blechpaket.oeffneBlechpaket(); }
  if (cmd === 'bp-zeige') return blechpaket.blechpaketZeige(el && el.dataset.i);
  if (cmd === 'bp-zip') return blechpaket.blechpaketZip();
  if (cmd === 'bp-nest') return blechpaket.blechpaketNest();
  if (cmd.startsWith('kontakt-')) {
    if (inferKind(doc) !== 'assembly' && ['kontakt-neu', 'kontakt-saetze', 'kontakt-alle'].includes(cmd)) { toast('Kontakt gibt es nur in einer Baugruppe.'); return; }
    if (editing && ['kontakt-neu', 'kontakt-bearbeiten'].includes(cmd)) cancelEditing();
    return kontaktUi.cmd(cmd, el);
  }
  switch (cmd) {
    case 'to-assembly': return toAssembly();
    case 'doc-kind': return switchDocKind();
    case 'sketch': return cmdSketch();
    case 'sketch3d': return cmdSketch3D();
    case 'extrude': case 'revolve': case 'fillet': case 'chamfer': case 'shell': case 'draft':
    case 'canvas': case 'bound': case 'boundfill': case 'gitter': case 'thicken': case 'lippe': case 'topo': case 'constraint':
    case 'plane': case 'axis': case 'point': case 'bks': case 'hole': case 'pattern': case 'mirror': case 'move': case 'scale': case 'remove': case 'presspull': case 'joint': case 'jorigin': case 'align': case 'rigid': case 'motionlink': case 'moveface': case 'boss': case 'snapfit': case 'sweep': case 'pipe': case 'loft': case 'thread': case 'combine': case 'split': case 'splitface': case 'silsplit': case 'sm_base': case 'sm_flange': case 'fastener': case 'defeature': case 'sm_corner': case 'sm_join': case 'sm_rip': case 'sm_loft': case 'sm_unfold': case 'sm_refold': case 'sm_contour': case 'sm_bend': case 'sm_convert': case 'frame': case 'rib': case 'web': case 'emboss': case 'coil': case 'box': case 'cylinder': case 'sphere': case 'torus': case 'weld': case 'gusset': case 'endcap': return startFeature(cmd);
    case 'sm_rule': return openSheetRule();
    case 'params': return openParams();
    case 'configs': return openConfigs();
    case 'cfg-add': return cfgAddRow(el.dataset.from);
    case 'cfg-del': return cfgDelRow(el.dataset.id);
    case 'cfg-col': return cfgAddCol(el.dataset.col);
    case 'cfg-coldel': return cfgDelCol(el.dataset.col);
    case 'cfg-ok': return commitConfigs();
    case 'cfg-export': return exportConfigs(el.dataset.v);
    case 'par-add': return paramsAdd();
    case 'par-del': return paramsDel(el.dataset.id);
    case 'par-ok': return commitParams();
    case 'sm-rule-ok': return commitSheetRule();
    case 'sm-rule-save': return saveRuleToLibrary();
    case 'sm-rule-del': return deleteRuleFromLibrary();
    case 'flat': return openFlat();
    case 'flat-dxf': if (flatLast) download(`${safeName()}-Abwicklung.dxf`, new Blob([flatDXF(flatLast, dxfPrefs())], { type: 'application/dxf' })); return;
    case 'dxf-settings': if (editing) cancelEditing(); return openDxfSettings();
    case 'dxf-ok': return commitDxfSettings();
    case 'dxf-reset': return resetDxfSettings();
    case 'dxfimp-ok': return commitDxfImport();
    case 'flat-sketch': return abwicklungAlsSkizze();
    case 'body-features': return alsFeaturesAufbauen(el.dataset.id);
    case 'body-replacebase': return cmdReplaceBase(el.dataset.id);
    case 'body-blech': return alsBlechAufbauen(el.dataset.id);
    case 'import-features': { const imp = importKoerper(el.dataset.id); if (imp) stepAlsFeatures((lastBuild.bodies || []).filter(b => importKoerper(b) === imp)); return; }
    case 'flat-svg': if (flatLast) download(`${safeName()}-Abwicklung.svg`, new Blob([flatSVG(flatLast, { name: doc.name })], { type: 'image/svg+xml' })); return;
    case 'loft-add': {
      if (!editing) return;
      const sks = doc.features.slice(0, editing.index).filter(x => x.type === 'sketch');
      const used = new Set(editing.feature.sections.map(s => s.sketch));
      const next = sks.find(s => !used.has(s.id)) || sks[sks.length - 1];
      editing.feature.sections.push({ sketch: next.id, profile: null });
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'sml-add': {
      // Übergangslasche: weiteres Profil (die nächste noch nicht benutzte Skizze)
      if (!editing) return;
      const f = editing.feature, sks = doc.features.slice(0, editing.index).filter(x => x.type === 'sketch');
      const used = new Set([f.skA, f.skB, ...(f.more || [])]);
      const next = sks.find(s => !used.has(s.id));
      if (!next) { toast('Es gibt keine weitere Skizze für ein Profil.'); return; }
      (f.more || (f.more = [])).push(next.id);
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'sml-del': {
      if (!editing || !editing.feature.more) return;
      editing.feature.more.splice(+el.dataset.i, 1);
      if (!editing.feature.more.length) delete editing.feature.more;
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'loft-del': {
      if (!editing) return;
      editing.feature.sections.splice(+el.dataset.i, 1);
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'component': return openComponentDialog();
    case 'insert': return openFileDialog('insert');
    case 'derive': return openFileDialog('derive');
    case 'saveas': return openSaveDialog();
    case 'file-pick': return filePicked(el.dataset.path);
    case 'file-local': closeFileDialog(); return $('#fileopen').click();
    case 'file-cancel': return closeFileDialog();
    case 'save-ok': return saveFromDialog();
    case 'inserts-refresh': return refreshInserts(false);
    case 'insert-remove': return removeInsert(el.dataset.id);
    case 'insert-dup': return duplicateInsert(el.dataset.id, false);
    case 'insert-dupj': return duplicateInsert(el.dataset.id, true);
    case 'insert-open': { const ins = (doc.inserts || []).find(x => x.id === el.dataset.id); if (ins && ins.file) openProjectFile(ins.file); return; }
    case 'comp-ok': return commitComponent();
    case 'comp-cancel': return closeComponentDialog();
    case 'comp-dissolve': return dissolveComponent(el.dataset.id);
    case 'toggle-comp': return toggleComp(el.dataset.id);
    case 'comp-activate': return activateComp(el.dataset.id || null);
    case 'comp-edit': return bearbeiteComp(el.dataset.id);
    case 'comp-als-teil': return compAlsTeilSpeichern(el.dataset.id);
    case 'comp-rename': { const r = $(`#browser [data-comp="${CSS.escape(el.dataset.id)}"]`); if (r) renameComp(el.dataset.id, r); return; }
    case 'comp-new-in': { activateComp(el.dataset.id); return openComponentDialog(); }
    case 'body-to-active': return moveBodyToComp(el.dataset.id, doc.activeComp || null);
    case 'body-to-root': return moveBodyToComp(el.dataset.id, null);
    case 'comp-pick': {
      if (!editing) return;
      const f = editing.feature, id = el.dataset.id;
      f.comps = (f.comps || []).filter(x => x !== id);
      if (el.getAttribute('aria-pressed') !== 'true') f.comps.push(id);
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'joint-reset': {
      if (!editing) return;
      const f = editing.feature;
      if (el.dataset.n === '1') { f.o1 = null; f.comp = null; f.body1 = null; }
      f.o2 = null;
      syncSelection(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'joint-play': return playJoint();
    case 'measure': return startMeasure();
    case 'section': return openSection();
    case 'drawing': return createDrawingDoc();
    case 'nest': return openNesting();
    case 'render': return openRender();
    case 'render-close': return closeRender();
    case 'nest-close': return closeNesting();
    case 'drawing-close': return leaveDrawingDoc();
    case 'drawing-img': return insertOnSheet('image');
    case 'drawing-dxfins': return insertOnSheet('dxf');
    case 'drawing-surf': case 'drawing-gdt': case 'drawing-datum': case 'drawing-text': {
      const kind = cmd.slice(8);
      drawing.noteMode = drawing.noteMode && drawing.noteMode.kind === kind ? null : { kind, at: null };
      drawing.secMode = null; drawing.setMode = null; drawing.breakMode = null; drawing.detailMode = null; drawing.dimMode = false; renderDrawRibbon();
      if (drawing.noteMode) toast(kind === 'text' ? 'Text: in eine Ansicht klicken (dann mit Hinweislinie, danach die Lage des Textes) oder auf eine freie Stelle des Blatts.' : { surf: 'Oberflächenzeichen', gdt: 'Toleranzrahmen', datum: 'Bezug' }[kind] + ': erst die Fläche (Kante in der Ansicht) anklicken, dann die Lage des Zeichens.', 6000);
      return;
    }
    case 'drawing-breakout': drawing.secMode = null; drawing.setMode = null; drawing.breakMode = drawing.breakMode ? null : { view: null, pts: [] }; drawing.detailMode = null; drawing.dimMode = false; renderDrawRibbon(); if (drawing.breakMode) toast('Ausbruch: Punkte des Umrisses in einer Ansicht anklicken. Klick auf den ersten Punkt schließt den Umriss.', 6000); else renderDrawing(); return;
    case 'drawing-auxview':
      drawing.secMode = drawing.secMode && drawing.secMode.aux ? null : { step: 0, aux: true }; drawing.setMode = null; drawing.breakMode = null; drawing.detailMode = null; drawing.dimMode = false; drawing.noteMode = null;
      renderDrawRibbon(); renderDrawing();
      if (drawing.secMode) toast('Hilfsansicht: gerade Kante der schrägen Fläche in einer Ansicht anklicken, dann die Lage der Ansicht.', 6000);
      return;
    case 'drawing-secview':
      drawing.secMode = drawing.secMode && !drawing.secMode.aux ? null : { step: 0 }; drawing.setMode = null; drawing.breakMode = null; drawing.detailMode = null; drawing.dimMode = false; drawing.noteMode = null;
      renderDrawRibbon(); renderDrawing();
      if (drawing.secMode) toast('Schnittansicht: Anfang und Ende der Schnittlinie in einer Ansicht anklicken, dann die Lage der Schnittansicht (auf der Seite, in die geblickt wird). Abgesetzte Schnittlinie: mit Umschalt+Klick weitere Abschnitte setzen.', 9000);
      return;
    case 'drawing-crop': drawing.secMode = null; drawing.setMode = null; drawing.breakMode = null; drawing.detailMode = null; drawing.dimMode = false; drawing.cropMode = drawing.cropMode ? null : { view: null }; renderDrawRibbon(); if (drawing.cropMode) toast('Zuschneiden: zwei Ecken des Bereichs in einer Ansicht anklicken. Zweimal dieselbe Stelle hebt den Zuschnitt auf.', 6000); return;
    case 'drawing-detail': drawing.secMode = null; drawing.setMode = null; drawing.breakMode = null; drawing.detailMode = drawing.detailMode ? null : { step: 0 }; drawing.dimMode = false; renderDrawRibbon(); if (drawing.detailMode) toast('Einzelheit: Mitte des Bereichs in einer Ansicht anklicken, dann die Stelle für die vergrößerte Darstellung.', 6000); return;
    case 'drawing-dim': drawing.secMode = null; drawing.setMode = null; drawing.detailMode = null; drawing.dimMode = !drawing.dimMode; drawing.draft = { pts: [] }; renderDrawRibbon(); if (drawing.dimMode) toast('Bemaßen: zwei Punkte einer Ansicht anklicken, dann die Lage des Maßes. Klick auf ein Maß löscht es.', 5000); renderDrawing(); return;
    case 'drawing-dimbase': case 'drawing-dimchain': case 'drawing-dimord': case 'drawing-holetab': {
      const kind = cmd === 'drawing-holetab' ? 'htab' : cmd.slice(11);
      drawing.setMode = drawing.setMode && drawing.setMode.kind === kind ? null : { kind, view: null, pts: [] };
      drawing.secMode = null; drawing.breakMode = null; drawing.detailMode = null; drawing.dimMode = false; drawing.noteMode = null;
      renderDrawRibbon(); renderDrawing();
      if (drawing.setMode) toast(kind === 'htab' ? 'Bohrungstabelle: Nullpunkt (Eck- oder Mittelpunkt) in einer Ansicht anklicken, dann die Lage der Tabelle.' : { base: 'Basislinie: zuerst den Bezugspunkt', chain: 'Kette: Punkte der Reihe nach', ord: 'Koordinaten: zuerst den Nullpunkt' }[kind] + ', dann weitere Punkte derselben Ansicht anklicken. Ein Klick ins Freie legt die Lage der Maße fest.', 7000);
      return;
    }
    case 'drawing-revtab': return openRevEditor(null);
    case 'drawing-dimclear': if (curDims().length) askConfirm('Alle Einzelmaße dieses Blatts löschen?', 'Löschen', true).then(ok => { if (ok) { pushHistory(); setCurDims([]); store(); renderDrawing(); } }); return;
    case 'drawing-print': return drawingPrint();
    case 'drawing-dxf': { const svg = $('#drawing .sheet svg'); if (svg) download(`${safeName()}-Zeichnung${drawing.sheet ? `-Blatt${drawing.sheet + 1}` : ''}.dxf`, new Blob([dxfBytes(sheetToDxf(svg))], { type: 'application/dxf' })); return; }
    case 'drawing-dwg': return drawingDwg();
    case 'drawing-svg': if (drawing.last) download(`${safeName()}-Zeichnung.svg`, new Blob([drawing.last.svg], { type: 'image/svg+xml' })); return;
    case 'drawing-csv': return downloadBomFor(drawing.data && drawing.data.bodies);
    case 'section-ok': return closeDialog();
    case 'section-off': section.on = false; applySection(); return closeDialog();
    case 'measure-clear': measure.sels = []; return renderMeasure();
    case 'measure-close': return closeMeasure();
    case 'hole-face': {
      if (!editing || editing.feature.type !== 'hole') return;
      if (!editing.feature.autoSketch) editing.feature.sketch = null;
      editing.pickTarget = 'holeface';
      vp.setPickMode('face');
      renderFeatureDialog(true, false);
      return;
    }
    case 'draft-plane': {
      if (!editing || editing.feature.type !== 'draft') return;
      editing.pickTarget = 'draftplane';
      vp.setPickMode('plane');
      renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'canvas-load': {
      // Bild für den Ansichtsbereich: als Daten-URL in der Datei (offline, beim Weitergeben dabei), höchstens 4 MB
      if (!editing || editing.feature.type !== 'canvas') return;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.hidden = true; inp.id = 'canvasfile';
      const old = document.getElementById('canvasfile'); if (old) old.remove();
      document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const file = inp.files && inp.files[0];
        inp.remove();
        if (!file || !editing || editing.feature.type !== 'canvas') return;
        if (file.size > 4 * 1024 * 1024) { toast('Das Bild ist zu groß (höchstens 4 MB).'); return; }
        const rd = new FileReader();
        rd.onload = () => {
          const img = new Image();
          img.onload = () => {
            const f = editing && editing.feature;
            if (!f || f.type !== 'canvas') return;
            f.img = rd.result; f.ar = img.naturalHeight / Math.max(1, img.naturalWidth); f.imgName = file.name.slice(0, 80);
            renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
          };
          img.src = rd.result;
        };
        rd.readAsDataURL(file);
      });
      inp.click();
      return;
    }
    case 'pp-more': {
      if (!editing || editing.feature.type !== 'presspull') return;
      editing.pickTarget = editing.pickTarget === 'ppmore' ? null : 'ppmore';
      vp.setPickMode('face'); renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'cons-add': {
      if (!editing || editing.feature.type !== 'constraint') return;
      const f = editing.feature;
      f.items.push({ type: el.dataset.t || 'mate', a: null, b: null, value: 0 });
      editing.pickTarget = `ca:${f.items.length - 1}`;
      vp.setPickMode('any'); renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'cons-pick': {
      if (!editing || editing.feature.type !== 'constraint') return;
      editing.pickTarget = `c${el.dataset.side}:${el.dataset.i}`;
      vp.setPickMode('any'); renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'cons-del': {
      if (!editing || editing.feature.type !== 'constraint') return;
      editing.feature.items.splice(Number(el.dataset.i), 1);
      if (!editing.feature.items.some(it => it.a)) delete editing.feature.comp;
      editing.pickTarget = null;
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'pick-exface': {
      if (!editing || editing.feature.type !== 'extrude') return;
      editing.pickTarget = 'exface';
      vp.setPickMode('face'); renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'pick-toface': case 'pick-startface': {
      if (!editing) return;
      editing.pickTarget = cmd === 'pick-toface' ? 'toface' : 'startface';
      vp.setPickMode('face');
      updateHint();
      scheduleBuild(0);
      return;
    }
    case 'mf-faces': case 'mf-axis': case 'mf-target': {
      if (!editing || editing.feature.type !== 'moveface') return;
      editing.pickTarget = editing.pickTarget === cmd ? null : cmd;
      vp.setPickMode(editing.pickTarget === 'mf-axis' ? 'any' : 'face');
      updateHint(); renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'move-from': case 'move-to': case 'move-edge': case 'move-axis': {
      if (!editing || editing.feature.type !== 'move') return;
      editing.pickTarget = cmd;
      vp.setPickMode('any');
      updateHint();
      renderFeatureDialog(true, false);
      return;
    }
    case 'sketch-wp': {
      const id = el.dataset.id, w = doc.features.find(x => x.id === refOwner(id));   // auch eine Ebene des BKS (ihre ID trägt :x/:y)
      if (!w) return;
      if (editing) cancelEditing();
      const planes = syncWorkPlanes(doc.features.slice());
      const p = planes.get(id);
      if (!p) { toast('Die Basis dieser Arbeitsebene fehlt.'); return; }
      const sk = newSketch({ ...clone(p) });
      sk.planeRef = id;
      return startSketchEdit(sk, doc.features.length, true);
    }
    case 'body-pick': {
      if (!editing) return;
      const f = editing.feature, k = el.dataset.field, id = el.dataset.id;
      const arr = (f[k] = (f[k] || []).filter(x => x !== id));
      if (el.getAttribute('aria-pressed') !== 'true') { if (k === 'target') { arr.length = 0; f.tools = (f.tools || []).filter(x => x !== id); } arr.push(id); }
      syncSelection();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    case 'targets-auto': {
      if (!editing) return;
      editing.feature.targets = [];
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    case 'bf-oplane': case 'bf-planes': case 'bf-cell': {
      // Begrenzungsfüllung: Ursprungsebene umschalten, Ebenen anklicken an/aus, Zelle an/aus
      if (!editing || editing.feature.type !== 'boundfill') return;
      const f = editing.feature;
      if (cmd === 'bf-oplane') {
        const k = el.dataset.key, i = (f.planes || (f.planes = [])).findIndex(p => p.kind === 'origin' && p.key === k);
        if (i >= 0) f.planes.splice(i, 1); else f.planes.push({ kind: 'origin', key: k });
        f.cells = null;
      } else if (cmd === 'bf-planes') {
        editing.pickTarget = editing.pickTarget === 'bf-planes' ? null : 'bf-planes';
        vp.setPickMode(pickModeFor(f)); refreshWorkPlanes();
        renderFeatureDialog(true, false);
        return;
      } else {
        const st = lastBuild && lastBuild.status[f.id], n = ((st && st.cells) || []).length, i = Number(el.dataset.i);
        const cur = Array.isArray(f.cells) ? f.cells.slice() : [...Array(n).keys()];
        f.cells = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort((a, b) => a - b);
      }
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'mplane': {
      if (!editing) return;
      editing.feature.plane = { kind: 'origin', key: el.dataset.key };
      if (editing.feature.type === 'split' || editing.feature.type === 'coil' || editing.feature.type === 'primitive') refreshWorkPlanes();
      renderFeatureDialog(true, false);
      scheduleBuild(0);
      return;
    }
    case 'ws-design': if (mode === 'gd') return gdClose(); if (mode === 'drawing') return leaveDrawingDoc(); if (mode === 'nesting') closeNesting(); if (mode === 'render') closeRender(); return;
    case 'drawing-resetviews': if (doc.drawing && doc.drawing.offsets) { pushHistory(); doc.drawing.offsets = {}; store(); renderDrawing(); } return;
    case 'flange-hem': case 'flange-90': if (editing && editing.feature.type === 'sm_flange') { editing.feature.angle = cmd === 'flange-hem' ? 180 : 90; if (cmd === 'flange-hem' && Number(editing.feature.height) > 30) editing.feature.height = 10; renderFeatureDialog(true, false); scheduleBuild(0); } return;
    case 'dview-place': return startPlaceView(el.dataset.v);
    case 'dview-del': { const sh = drawSheets()[drawing.sheet]; pushHistory(); sh.views = (sh.views || []).filter(v => v.id !== el.dataset.id); store(); return renderDrawing(); }
    case 'dview-scale': { const ev = (drawSheets()[drawing.sheet].views || []).find(v => v.id === el.dataset.id); if (ev) { pushHistory(); ev.scale = Number(el.dataset.v); store(); renderDrawing(); } return; }
    case 'dsheet': if (mode !== 'drawing') return; drawing.sheet = +el.dataset.i; drawing.secMode = null; drawing.setMode = null; drawing.dimMode = false; drawing.detailMode = null; drawing.breakMode = null; drawing.noteMode = null; renderDrawRibbon(); renderBrowser(); return renderDrawing();
    case 'dsheet-add': { pushHistory(); drawSheets().push({ id: uid(), views: [] }); drawing.sheet = drawSheets().length - 1; store(); renderDrawRibbon(); renderDrawing(); renderBrowser(); return toast('Neues Blatt. Mit „Basisansicht“ Ansichten einfügen.'); }
    case 'dsheet-del': { const sh = drawSheets(), i = +el.dataset.i; if (sh.length < 2) return toast('Das letzte Blatt bleibt.'); pushHistory(); sh.splice(i, 1); drawing.sheet = Math.min(drawing.sheet, sh.length - 1); store(); renderBrowser(); return renderDrawing(); }
    case 'dopt-toggle': { const k = el.dataset.k; drawing.opts[k] = k === 'flat' ? drawing.opts.flat === false : !drawing.opts[k]; return applyDrawOpt(k); }
    case 'nav-orbit': return setNavTool('orbit');
    case 'sel-clear': return clearModelSel();
    case 'sel-delete': return deleteModelSel();
    case 'sel-lookat': { const fsel = modelSel.faces[0]; if (fsel && fsel.info.n) vp.lookDir(fsel.info.n); return; }
    case 'sel-props': { const fsel = modelSel.faces[0], id = fsel && bodyIdAtFace(fsel.info); if (id) openBodyProps(id); return; }
    case 'nav-pan': return setNavTool('pan');
    case 'nav-zoom': return setNavTool('zoom');
    case 'lookat': return setNavTool('lookat');
    case 'nav-grid': navState.grid = !navState.grid; vp.setGridVisible(navState.grid); saveNav(); return renderNavbar();
    case 'vstyle': navState.style = el.dataset.v; vp.setVisualStyle(navState.style); saveNav(); return;
    case 'vproj': navState.proj = el.dataset.v; vp.setProjection(navState.proj); saveNav(); closeRibbonMenu(); return;
    case 'szsel': closeRibbonMenu(); return openSizeSelect();
    case 'szsel-ok': return applySizeSelect(false);
    case 'szsel-add': return applySizeSelect(true);
    case 'selprio': {
      navState.prio = el.dataset.v; vp.pickPrio = el.dataset.v; closeRibbonMenu(); renderNavbar();
      toast(el.dataset.v === 'koerper' ? 'Körperpriorität: ein Klick auf eine Fläche wählt den ganzen Körper.' : el.dataset.v === 'flaeche' ? 'Flächenpriorität: Flächen vor Kanten.' : 'Auswahlpriorität Standard: Kanten nahe am Zeiger zuerst.');
      return;
    }
    case 'seltool': {
      navState.selTool = el.dataset.v; vp.selTool = el.dataset.v; closeRibbonMenu(); renderNavbar();
      toast(el.dataset.v === 'paint' ? 'Farbauswahl: mit gedrückter linker Taste über Flächen oder Kanten malen.' : el.dataset.v === 'freeform' ? 'Freiformauswahl: eine Schleife um die Kanten ziehen.' : 'Fensterauswahl: Rahmen aufziehen.');
      return;
    }
    case 'selfilter': {
      navState.filter = el.dataset.v; saveNav(); closeRibbonMenu(); renderNavbar();
      if (mode === 'model' && !editing) { vp.setPickMode(modelPickMode()); if (navState.filter === 'face') modelSel.edges = []; if (navState.filter === 'edge') modelSel.faces = []; syncSelection(); }
      toast(`Auswahlfilter: ${SEL_FILTERS.find(x => x[0] === navState.filter)[1]}`);
      return;
    }
    case 'tl-start': if (!editing) setTimelinePos(0); return;
    case 'tl-prev': if (!editing) setTimelinePos((timelinePos == null ? doc.features.length : timelinePos) - 1); return;
    case 'tl-next': if (!editing && timelinePos != null) setTimelinePos(timelinePos + 1); return;
    case 'tl-end': if (!editing) setTimelinePos(null); return;
    case 'fit': return vp.fit();
    case 'home': return vp.view('iso');
    case 'export-stl': return cmdExport('stl');
    case 'export-3mf': return cmdExport3MF();
    case 'interfere': return openInterference();
    case 'overhang': return openOverhang();
    case 'explode': if (editing) cancelEditing(); return openExplode();
    case 'draftan': if (editing) cancelEditing(); return openDraftAnalysis();
    case 'minrad': if (editing) cancelEditing(); return openDraftAnalysis('minrad');
    case 'access': if (editing) cancelEditing(); return openDraftAnalysis('access');
    case 'curvmap': if (editing) cancelEditing(); return openDraftAnalysis('curv');
    case 'compcolors': {
      compColorsOn = !compColorsOn;
      vp.setBodyColors(bodyColorMap());
      toast(compColorsOn ? ((doc.components || []).length || (doc.inserts || []).length ? 'Komponentenfarben an: jede Komponente in eigener Farbe. Noch einmal wählen zum Ausschalten.' : 'Komponentenfarben an – das Dokument hat noch keine Komponenten.') : 'Komponentenfarben aus.');
      return;
    }
    case 'topo-preview': if (editing && editing.feature.type === 'topo') { editing.topoVorschau = true; renderFeatureDialog(true, false); scheduleBuild(0); } return;
    case 'sketch-lookat': if (editing && editing.feature.type === 'sketch' && editing.feature.plane) vp.lookAtPlane(editing.feature.plane); return;
    case 'zebra': {
      // Zebra-Analyse an/aus: Streifen zeigen, wo Flächen nicht tangential bzw. nicht krümmungsstetig anschließen
      const on = vp.zebra !== 'zebra';
      vp.setZebra(on ? 'zebra' : false);
      toast(on ? 'Zebra-Analyse an: Knicke in den Streifen = Kante ohne tangentialen Übergang. Noch einmal wählen zum Ausschalten.' : 'Zebra-Analyse aus.');
      return;
    }
    case 'envmap': {
      // Umgebungs-Map-Analyse an/aus: gespiegelte Studio-Umgebung; Zebra geht dabei aus
      const on = vp.zebra !== 'umgebung', eigen = rendering.umgebungsTextur;
      // eigenes Umgebungsbild aus „Rendern“, sonst die feste Studio-Umgebung
      vp.setUmgebungsBild(eigen && eigen.tex, eigen && eigen.oben, eigen && eigen.dreh, eigen && eigen.hdr);
      vp.setZebra(on ? 'umgebung' : false);
      toast(!on ? 'Umgebungs-Map aus.' : eigen ? `Umgebungs-Map an mit dem eigenen Bild „${rendering.umgebungsbild}“ aus Rendern. Noch einmal wählen zum Ausschalten.`
        : 'Umgebungs-Map an: die Umgebung spiegelt sich in den Flächen – Knicke oder Sprünge in Horizont und Leuchtflächen zeigen unsaubere Übergänge. Modell drehen, noch einmal wählen zum Ausschalten.');
      return;
    }
    case 'isocurves': {
      // Isokurven an/aus: u/v-Linien der gekrümmten Flächen, folgen jedem Neuaufbau
      isoOn = !isoOn;
      if (isoOn) refreshIso(true); else vp.setIsoLines(null);
      if (!isoOn) toast('Isokurven aus.');
      return;
    }
    case 'draftan-close': return closeDraftAnalysis();
    case 'explode-play': return playExplode();
    case 'explode-video': return explodeVideo();
    case 'explode-close': return closeExplode();
    case 'cutlist': return openCutList();
    case 'framesim': if (editing) cancelEditing(); return openFrameSim();
    case 'pattern-face': if (editing) { editing.pickTarget = editing.pickTarget === 'ptsface' ? null : 'ptsface'; vp.setPickMode(editing.pickTarget ? 'face' : pickModeFor(editing.feature)); renderFeatureDialog(true, false); } return;
    case 'solidsim': if (editing) cancelEditing(); return openSolidSim();
    case 'similar': if (editing) cancelEditing(); return openSimilar();
    case 'motion': if (editing) cancelEditing(); return openMotion();
    case 'bom': return openBom();
    case 'bom-csv': return downloadBom();
    case 'cutlist-csv': return downloadCutList();
    case 'oh-dir': overhang.dir = el.dataset.dir; renderOverhang(); scheduleSupports(); return;
    case 'oh-sup': {
      overhang.sup.style = el.dataset.style;
      overhang.sup.error = null;
      renderOverhang();
      runSupports();
      return;
    }
    case 'oh-close': return closeOverhang();
    case 'oh-3mf': return cmdExport3MF(overhang.dir);
    case 'interfere-close': return closeInterference();
    case 'export-step': return cmdExport('step');
    case 'mfg-package': if (editing) cancelEditing(); return exportPackage();
    case 'new': return openStart();
    case 'prefs': return openPrefs();
    case 'open': return cmdOpen();
    case 'save': return cmdSave();
    case 'plane-mode': if (editing && editing.feature.type === 'plane') { const f = editing.feature; f.base = el.dataset.m === 'pts' ? { kind: 'points', pts: [] } : el.dataset.m === 'mid' ? { kind: 'mid' } : el.dataset.m === 'tan' ? { kind: 'tangent' } : el.dataset.m === 'edges' ? { kind: 'edges' } : el.dataset.m === 'path' ? { kind: 'path' } : el.dataset.m === 'perp' ? { kind: 'perp' } : { kind: 'origin', key: 'XY' }; editing.pickTarget = null; if (el.dataset.m !== 'ref') { f.offset = 0; f.angle = 0; } vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0); } return;
    case 'perp-point': {
      if (!editing || editing.feature.type !== 'plane') return;
      editing.pickTarget = 'perp-point';
      vp.setPickMode('edge');
      renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'perp-pt-clear': {
      if (!editing || editing.feature.type !== 'plane' || !editing.feature.base || editing.feature.base.kind !== 'perp') return;
      const f = editing.feature;
      f.base = { ...f.base, p: undefined, ref: undefined };
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    case 'bks-origin': {
      if (!editing || editing.feature.type !== 'bks') return;
      editing.pickTarget = 'bks-origin';
      vp.setPickMode('edge');
      renderFeatureDialog(true, false); updateHint();
      return;
    }
    case 'bks-origin-clear': {
      if (!editing || editing.feature.type !== 'bks') return;
      editing.feature.originRef = null;
      editing.feature.originP = null;
      renderFeatureDialog(true, false); refreshWorkPlanes(); scheduleBuild(0);
      return;
    }
    case 'text-path': if (editor) editor.textToPath(el.dataset.m); return;
    case 'spline-handle': if (editor) editor.toggleSplineHandle(); return;
    case 'undo': return undo();
    case 'redo': return redo();
    case 'sketch-finish': return commitEditing();
    case 'sketch-cancel': return cancelEditing();
    case 'construction': return editor && editor.toggleConsMode();
    case 'cons-sel': {
      // gewählte Kurven umschalten (nicht den Modus für neue Geometrie)
      if (!editor) return;
      if (!kurvenGewaehlt(sketchState)) { toast('Erst Linien, Bögen oder Kreise der Skizze wählen.'); return; }
      return editor.toggleConsMode();
    }
    case 'ok': return commitEditing();
    case 'cancel': return cancelEditing();
    case 'edit': return editFeature(+el.dataset.index);
    case 'delete': return deleteFeature(+el.dataset.index);
    case 'tl-suppress': return toggleSuppress(+el.dataset.index);
    case 'tl-dxf': return exportSketchDXF(+el.dataset.index);
    case 'face-dxf': return startFaceDXF();
    case 'import-file': if (editing) cancelEditing(); return $('#fileimport').click();
    case 'insert-svg': {
      // auf die gewählte ebene Fläche, sonst auf XY
      if (editing) cancelEditing();
      const inp = $('#fileimport'), old = inp.accept;
      inp.accept = '.svg'; inp.click(); setTimeout(() => { inp.accept = old; }, 0);
      return;
    }
    case 'tl-move': return moveFeature(+el.dataset.index, +el.dataset.to);
    case 'sketch-on': return startSketchOn(el.dataset.plane);
    case 'toggle-sketch': return toggleSketchVisible(el.dataset.id);
    case 'toggle-body': { const r = toggleBody(el.dataset.id); if (cogOn) refreshCog(); return r; }
    case 'cog': return toggleCog();
    case 'body-props': return openBodyProps(el.dataset.id);
    case 'props-close': { const p = $('#propsdlg'); if (p) p.hidden = true; return; }
    case 'body-rename': { const r = $(`#browser [data-body="${CSS.escape(el.dataset.id)}"]`); if (r) renameBody(el.dataset.id, r); return; }
    case 'body-material': openBody = el.dataset.id; return renderBrowser();
    case 'body-isolate': (lastBuild ? lastBuild.bodies : []).forEach(id => { const b = bodyInfo(id); if (b) b.hidden = id !== el.dataset.id; }); store(); renderBrowser(); return scheduleBuild(0);
    case 'bodies-show-all': (lastBuild ? lastBuild.bodies : []).forEach(id => { const b = bodyInfo(id); if (b) b.hidden = false; }); store(); renderBrowser(); return scheduleBuild(0);
    case 'export-body-stl': return exportBodySTL(el.dataset.id);
    case 'profiles-auto': {
      if (!editing) return;
      editing.feature.profiles = null;
      showProfiles();
      renderFeatureDialog(false);
      scheduleBuild(0);
      return;
    }
    case 'all-edges': {
      if (!editing) return;
      editing.feature.all = !editing.feature.all;
      if (editing.feature.all) { editing.feature.edges = []; delete editing.feature.fromFaces; editing.pickTarget = null; } else delete editing.feature.allKind;
      vp.setPickMode(pickModeFor(editing.feature));
      syncSelection();
      renderFeatureDialog(true, false);
      return;
    }
    case 'face-edges': {
      // Kanten der gewählten Flächen (wie „Regel-Abrundung“ auf Flächen/Features)
      if (!editing) return;
      const f = editing.feature;
      if (editing.pickTarget === 'face-edges') editing.pickTarget = null;
      else {
        editing.pickTarget = 'face-edges';
        f.all = false; delete f.allKind; f.edges = []; delete f.sets; editing.grp = 0;
      }
      vp.setPickMode(pickModeFor(f));
      syncSelection();
      renderFeatureDialog(true, false);
      return;
    }
    case 'split-faces': {
      // Flächen für „nur diese Flächen teilen“ an-/abwählen (Modus bleibt sonst bei allen getroffenen Flächen)
      if (!editing) return;
      const f = editing.feature;
      if (editing.pickTarget === 'split-faces') editing.pickTarget = null;
      else {
        editing.pickTarget = 'split-faces';
        if (!Array.isArray(f.faces)) f.faces = [];
      }
      vp.setPickMode(pickModeFor(f));
      syncSelection();
      renderFeatureDialog(true, false);
      return;
    }
    case 'fset-add': {
      // weitere Kantengruppe mit eigenem Maß; sie wird gleich die aktive
      if (!editing) return;
      const f = editing.feature;
      (f.sets || (f.sets = [])).push({ edges: [], value: Number(f.type === 'fillet' ? f.radius : f.type === 'sm_corner' ? f.size : f.distance) || 1 });
      editing.grp = f.sets.length;
      renderFeatureDialog(true, false); syncSelection();
      return;
    }
    case 'vpt-add': {
      if (!editing) return;
      const f = editing.feature, list = f.vpts || (f.vpts = []);
      list.push({ t: 0.5, r: (Number(f.radius) + Number(f.radius2 ?? f.radius)) / 2 || 1 });
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'vpt-del': {
      if (!editing || !editing.feature.vpts) return;
      editing.feature.vpts.splice(Number(el.dataset.i), 1);
      if (!editing.feature.vpts.length) delete editing.feature.vpts;
      renderFeatureDialog(true, false); scheduleBuild(0);
      return;
    }
    case 'fset-pick': if (editing) { editing.grp = Number(el.dataset.i) || 0; renderFeatureDialog(true, false); } return;
    case 'fset-del': {
      if (!editing || !editing.feature.sets) return;
      editing.feature.sets.splice(Number(el.dataset.i), 1);
      if (!editing.feature.sets.length) delete editing.feature.sets;
      editing.grp = 0;
      renderFeatureDialog(true, false); syncSelection();
      return;
    }
    case 'clear-sel': {
      if (!editing) return;
      if (editing.feature.sets) delete editing.feature.sets;
      editing.grp = 0;
      if (editing.feature.edges) editing.feature.edges = [];
      if (editing.feature.fromFaces) { delete editing.feature.fromFaces; if (editing.pickTarget === 'face-edges') editing.pickTarget = null; }
      if (editing.feature.faces) editing.feature.faces = [];
      if (editing.feature.rings) editing.feature.rings = [];
      if (editing.feature.type === 'hole') { editing.feature.edgeA = null; editing.feature.edgeB = null; editing.feature.edgeP = null; }
      editing.feature.all = false;
      vp.setPickMode(pickModeFor(editing.feature));
      syncSelection();
      renderFeatureDialog(false);
      if (['weld', 'gusset', 'endcap', 'split'].includes(editing.feature.type)) scheduleBuild(0);
      return;
    }
    default:
  }
}

const { closeDialog, dialogShell, fieldSeg, renderFeatureDialog, updateManip } = setupFeatureDialogs({ get THREADS() { return THREADS; }, get doc() { return doc; }, get editing() { return editing; }, get jointAnim() { return jointAnim; }, get lastBuild() { return lastBuild; }, get mode() { return mode; }, get overhang() { return overhang; }, get section() { return section; }, get vp() { return vp; }, get $() { return $; }, get bodyChips() { return bodyChips; }, get bodyName() { return bodyName; }, get compChips() { return compChips; }, get compName() { return compName; }, get esc() { return esc; }, get featureChecklist() { return featureChecklist; }, get fmt() { return fmt; }, get holeInfo() { return holeInfo; }, get num() { return num; }, get planeLabel() { return planeLabel; }, get presetOptions() { return presetOptions; }, get profileRegions() { return profileRegions; }, get refreshWorkPlanes() { return refreshWorkPlanes; }, get scheduleBuild() { return scheduleBuild; }, get selectionInfo() { return selectionInfo; }, get sheetRule() { return sheetRule; }, get featureExpr() { return featureExpr; } });

let isoOn = false;
async function refreshIso(say) {
  try {
    const r = await kernel.isocurves({ n: 8, hidden: [...hiddenBodies()] });
    if (!isoOn) return;
    vp.setIsoLines(r.positions);
    if (say) toast(r.faces ? `Isokurven an: ${r.faces} gekrümmte Fläche${r.faces > 1 ? 'n' : ''}${r.skipped ? ` (${r.skipped} weitere ohne Linien)` : ''}. Noch einmal wählen zum Ausschalten.` : 'Isokurven an – das Modell hat keine gekrümmten Flächen.');
  } catch (e) { toast(`Isokurven: ${e.message || e}`); }
}

/* Topologieoptimierung: Rollen der Skizzenpunkte und Kräfte; jede Änderung nimmt die Vorschau zurück (sie rechnet Sekunden) */
$('#dialog').addEventListener('change', e => {
  const t = e.target, f = editing && editing.feature;
  if (!f || f.type !== 'topo') return;
  if (t.dataset.topoRolle != null) {
    const r = { ...((f.rolle || {})[t.dataset.topoRolle] || {}), art: t.value };
    f.rolle = { ...(f.rolle || {}) };
    if (!t.value) delete f.rolle[t.dataset.topoRolle];
    else { if (t.value !== 'last') { delete r.fx; delete r.fy; } else if (r.fx == null && r.fy == null) { r.fx = 0; r.fy = -100; } f.rolle[t.dataset.topoRolle] = r; }
  }
  if (t.dataset.k === 'sketch') f.rolle = {};
  editing.topoVorschau = false;
  renderFeatureDialog(true, false);
  scheduleBuild(0);
});
$('#dialog').addEventListener('input', e => {
  const t = e.target, f = editing && editing.feature;
  if (!f || f.type !== 'topo') return;
  if (t.dataset.topoF != null) {
    const v = Number(String(t.value).replace(',', '.'));
    if (Number.isFinite(v) && f.rolle && f.rolle[t.dataset.topoF]) f.rolle[t.dataset.topoF] = { ...f.rolle[t.dataset.topoF], [t.dataset.ax]: v };
  }
  if (editing.topoVorschau) { editing.topoVorschau = false; const b = $('#dialog [data-cmd="topo-preview"]'); if (b) b.setAttribute('aria-pressed', 'false'); scheduleBuild(0); }
});

/* Generatives Design (eigener Arbeitsbereich, src/gd-ui.js) */
const { gdOpen, gdClose, gdCmd, gdPick, gdEingabe, gdFarben, gdRender } = setupGenerativeDesign({ get doc() { return doc; }, get lastBuild() { return lastBuild; }, get editing() { return editing; }, get mode() { return mode; }, get kernel() { return kernel; }, get vp() { return vp; }, get caretSvg() { return caretSvg; }, esc: (...a) => esc(...a), fmt: (...a) => fmt(...a), toast: (...a) => toast(...a), setMode: m => setMode(m), pushHistory: () => pushHistory(), store: () => store(), renderAll: () => renderAll(), scheduleBuild: (...a) => scheduleBuild(...a), bodyName: id => bodyName(id), bodyIdAtFace: i => bodyIdAtFace(i), faceRef: i => faceRef(i), sameFace: (r, i) => sameFace(r, i), bodyColorMap: () => bodyColorMap(), fadedBodies: () => fadedBodies(), closeDialog: () => closeDialog(), renderRibbon: () => renderRibbon(), cancelEditing: () => cancelEditing() });
document.addEventListener('change', e => { if (mode === 'gd' && e.target.closest('#dialog, #gdexplore')) gdEingabe(e.target); }, true);
document.addEventListener('input', e => { if (mode === 'gd' && e.target.closest('#dialog') && e.target.type !== 'checkbox') gdEingabe(e.target); }, true);

function holeInfo(f) {
  if (f.type !== 'hole') return '';
  const n = holeCount(f);
  return n ? `${n} Bohrung${n > 1 ? 'en' : ''} an den Punkten der Skizze.` : 'Die Skizze hat keine einzelnen Punkte oder Kreise.';
}
function featureChecklist(f) {
  const before = doc.features.slice(0, editing.index).filter(x => TOOL_FEATURES.has(x.type));
  if (!before.length) return '<p class="info">Noch keine Features zum Vervielfältigen.</p>';
  return `<div class="row col"><span>Features</span><div class="flist">${before.map(x => `<label class="check"><input type="checkbox" data-feat="${x.id}"${f.features.includes(x.id) ? ' checked' : ''}> ${icon(FEATURE_TYPES[x.type].icon, 16)} ${esc(x.name)}</label>`).join('')}</div></div>`;
}

function selectionInfo(f) {
  if (f.type === 'thicken') return f.faces.length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''} gewählt.` : 'Flächen eines Körpers anklicken (eben oder gekrümmt).';
  if (f.type === 'shell') return f.faces.length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''} gewählt. Diese bleiben offen.` : 'Fläche im Modell anklicken, die offen bleiben soll, zum Beispiel die Oberseite.';
  if (f.all) return 'Alle Kanten des Körpers.';
  if ((f.type === 'fillet' || f.type === 'chamfer') && (f.fromFaces || []).length) return `${f.fromFaces.length} Fläche${f.fromFaces.length > 1 ? 'n' : ''} gewählt – alle Ecken dieser Flächen.`;
  if ((f.type === 'fillet' || f.type === 'chamfer') && (f.sets || []).length) {
    const g = editing && editing.grp > 0 ? f.sets[editing.grp - 1] : null, n = g ? g.edges.length : f.edges.length;
    return `Gruppe ${g ? editing.grp + 1 : 1}: ${n} Kante${n === 1 ? '' : 'n'} – Klicks gehen in diese Gruppe.`;
  }
  return f.edges.length ? `${f.edges.length} Kante${f.edges.length > 1 ? 'n' : ''} gewählt.` : 'Kanten im Modell anklicken – mehrere auf einmal mit dem Rahmen oder frei mit Alt.';
}

/* Skizzenpalette: Zustand der Skizze, Optionen, Fertig */
function renderSketchDialog() {
  const d = $('#dialog'), f = editing && editing.feature;
  if (!f) return;
  /* 3D-Skizze: ohne Ebene gibt es keine Rasterfängerei, Bedingungen, Bemaßungen und Profilanzeige */
  if (!f.plane) {
    const body = `<p class="plane">3D-Skizze: Punkte direkt im Raum</p>
      <div class="skstate" id="skstate"></div>
      <label class="check"><input type="checkbox" data-opt="snap3d" checked> Modellkanten und -flächen treffen</label>
      <div class="btns"><button type="button" class="chip" data-cmd="undo">${icon('undo', 14)} Rückgängig</button><button type="button" class="chip" data-cmd="redo">${icon('redo', 14)} Wiederholen</button></div>
      <p class="info small">Punkte liegen dort, wohin der Zeiger zeigt: auf Modellkanten und -flächen, sonst in der Ebene senkrecht zum Blick durch den letzten Punkt. Einen Punkt mit der Maus im Raum verschieben.</p>
      <p class="info small">Eine 3D-Skizze ist für räumliche Pfade da: Auszug, Rohr und Anordnung entlang Pfad folgen ihr, ebenso eine Arbeitsebene entlang eines Pfads. Abhängigkeiten und Bemaßungen gibt es hier nicht.</p>`;
    d.className = 'dialog sketchdlg';
    d.innerHTML = dialogShell(f, body, { okLabel: 'Skizze fertig', noErr: true });
    d.hidden = false;
    renderSketchState();
    return;
  }
  const body = `<p class="plane">Ebene: ${esc(f.plane.label || f.plane.key)}</p>
    <div class="skstate" id="skstate"></div>
    <label class="check"><input type="checkbox" data-opt="grid" checked> Am Raster fangen</label>
    <label class="check"><input type="checkbox" data-opt="cons"> Neue Geometrie als Konstruktion (X)</label>
    <div class="btns skopt" data-for="cursel" hidden><button type="button" class="chip" data-cmd="cons-sel" title="Gewählte Linien, Bögen und Kreise zu Konstruktionsgeometrie machen oder zurück (X)">${icon('line', 14)} Normal/Konstruktion (X)</button></div>
    <label class="check"><input type="checkbox" data-opt="glyphs"> Alle Bedingungen zeigen</label>
    <label class="check"><input type="checkbox" data-opt="comb"> Krümmungskamm</label>
    <details class="skshow"><summary>Anzeigen</summary>
      <label class="check"><input type="checkbox" data-show="points" checked> Punkte</label>
      <label class="check"><input type="checkbox" data-show="dims" checked> Bemaßungen</label>
      <label class="check"><input type="checkbox" data-show="projected" checked> Projizierte Geometrie</label>
      <label class="check"><input type="checkbox" data-show="cons" checked> Konstruktionsgeometrie</label>
      <label class="check"><input type="checkbox" data-opt="slice"> Aufschneiden</label>
      <div class="btns"><button type="button" class="chip" data-cmd="sketch-lookat">Ausrichten nach</button></div>
    </details>
    <label class="row skopt" data-for="conic" hidden><span>ρ (Rho)</span><span class="num"><input type="number" step="0.05" min="0.01" max="0.99" data-opt="rho" value="0.5"><em></em></span></label>
    <label class="row skopt" data-for="polygon polygonc polygone" hidden><span>Ecken</span><span class="num"><input type="number" step="1" min="3" max="64" data-opt="sides" value="6"><em></em></span></label>
    <label class="row skopt" data-for="cpattern lpattern" hidden><span>Anzahl</span><span class="num"><input type="number" step="1" min="2" max="200" data-opt="count" value="6"><em>Stück</em></span></label>
    <label class="row skopt" data-for="patsel" hidden><span>Muster</span><span class="num"><input type="number" step="1" min="2" max="100" data-opt="patcount" value="6"><em>Stück</em></span></label>
    <label class="row skopt" data-for="text textsel" hidden><span>Schrifthöhe</span><span class="num"><input type="number" step="0.5" min="0.5" max="500" data-opt="texth" value="5"><em>mm</em></span></label>
    <label class="row skopt" data-for="text textsel" hidden><span>Schrift</span><select data-opt="textfont"><option value="sans">Sans</option><option value="bold">Sans fett</option><option value="mono">Mono</option></select></label>
    <div class="btns skopt" data-for="textsel" hidden><button type="button" class="chip" data-cmd="text-path" data-m="on" title="Text und Kurve wählen">Auf Kurve legen</button><button type="button" class="chip" data-cmd="text-path" data-m="flip">Seite wechseln</button><button type="button" class="chip" data-cmd="text-path" data-m="off">Lösen</button></div>
    <div class="btns skopt" data-for="splpt" hidden><button type="button" class="chip" data-cmd="spline-handle" title="Tangentengriff am gewählten Stützpunkt: Richtung und Länge der Kurve dort, bemaßbar und mit Bedingungen">Tangentengriff</button></div>
    <label class="check skopt" data-for="move rotate scale" hidden><input type="checkbox" data-opt="copy"> Als Kopie (oder Strg beim Klick)</label>
    <div class="btns"><button type="button" class="chip" data-cmd="undo">${icon('undo', 14)} Rückgängig</button><button type="button" class="chip" data-cmd="redo">${icon('redo', 14)} Wiederholen</button></div>
    <p class="info small">Maße mit Doppelklick ändern, auch als Rechnung wie 60/2. Bedingungen gelten für die gewählten Elemente. Was der Skizze widerspricht, wird nicht übernommen.</p>
    <p class="info small">Alle Körperkanten fangen automatisch, auch verdeckte. Benutzt werden sie als violette Bezüge in die Skizze projiziert. Mit X werden projizierte Kanten Teil des Profils.</p>`;
  d.className = 'dialog sketchdlg';
  d.innerHTML = dialogShell(f, body, { okLabel: 'Skizze fertig', noErr: true });
  d.hidden = false;
  renderSketchState();
}

/* Skizzenkurven in der Auswahl (für „Normal/Konstruktion“) */
function kurvenGewaehlt(st) { return !!(st && st.sel && st.sel.some(k => k !== 'point' && k !== 'text' && k !== 'rule' && k !== '?')); }
function renderSketchState() {
  const st = sketchState;
  if (!st) return;
  const box = $('#skstate');
  if (box) {
    if (st.kind3d) {
      /* 3D-Skizze: ohne Solver zählt hier nur, ob die Kurven einen Zug ergeben – daraus entsteht der Pfad */
      const cls = st.curves && !st.pathError ? 'done' : 'open';
      const info = !st.curves ? 'noch keine Kurve'
        : st.pathError ? st.pathError
          : st.pathClosed ? 'ein geschlossener Zug' : 'ein durchgehender Zug';
      box.className = 'skstate ' + cls;
      box.innerHTML = `<b>${st.curves} Kurve${st.curves === 1 ? '' : 'n'} im Raum</b><span>${esc(info)}</span>`;
    } else {
      let cls = 'open', text;
      if (st.conflicts && st.conflicts.length) { cls = 'bad'; text = 'Widersprüchliche Bedingungen'; }
      else if (st.dof === 0) { cls = 'done'; text = 'Vollständig bestimmt'; }
      else if (st.dof == null) text = 'Solver lädt …';
      else text = `${st.dof} Freiheitsgrad${st.dof === 1 ? '' : 'e'} offen`;
      box.className = 'skstate ' + cls;
      box.innerHTML = `<b>${esc(text)}</b><span>${st.regions ? `${st.regions} geschlossene${st.regions === 1 ? 's Profil' : ' Profile'}` : 'noch kein geschlossenes Profil'}</span>`;
    }
  }
  $$('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === st.tool)));
  const cbtn = $('#sketchbar [data-cmd="construction"]');
  if (cbtn) cbtn.setAttribute('aria-pressed', String(!!st.consMode));
  const cons = $('#dialog [data-opt="cons"]');
  if (cons) cons.checked = !!st.consMode;
  const grid = $('#dialog [data-opt="grid"]');
  if (grid) grid.checked = !!st.snapGrid;
  const gly = $('#dialog [data-opt="glyphs"]');
  if (gly) gly.checked = !!st.showGlyphs;
  $$('#dialog .skopt').forEach(o => { o.hidden = !o.dataset.for.split(' ').some(k => k === st.tool || (k === 'textsel' && st.textSel && !st.tool) || (k === 'patsel' && st.pattern && !st.tool) || (k === 'splpt' && st.splPt && !st.tool) || (k === 'cursel' && kurvenGewaehlt(st))); });
  const sh = $('#dialog [data-cmd="spline-handle"]');
  if (sh && st.splPt) { sh.textContent = st.splPt.handle ? 'Griff entfernen' : 'Tangentengriff'; sh.setAttribute('aria-pressed', String(!!st.splPt.handle)); }
  const pc = $('#dialog [data-opt="patcount"]');
  if (pc && st.pattern && document.activeElement !== pc) pc.value = st.pattern.count;
  const th = $('#dialog [data-opt="texth"]'), tf = $('#dialog [data-opt="textfont"]');
  const tv = st.textSel || { h: st.textH, font: st.textFont };
  if (th && document.activeElement !== th) th.value = tv.h;
  if (tf && document.activeElement !== tf) tf.value = tv.font;
  const cp = $('#dialog [data-opt="copy"]');
  if (cp) cp.checked = !!st.copyMode;
  const sides = $('#dialog [data-opt="sides"]');
  if (sides && document.activeElement !== sides) sides.value = st.polySides || 6;
  const count = $('#dialog [data-opt="count"]');
  if (count && document.activeElement !== count) count.value = st.patternCount || 6;
  // Bedingungen je nach Auswahl hervorheben
  const s = st.sel || [];
  const n = k => s.filter(x => x === k).length;
  const lines = n('line'), rounds = n('circle') + n('arc'), pts = n('point'), curves = lines + rounds;
  const can = {
    hv: lines >= 1 || pts === 2, parallel: lines >= 2 && !rounds, perpendicular: lines === 2 && !rounds,
    tangent: curves === 2 && rounds >= 1, equal: (lines >= 2 && !rounds) || (rounds >= 2 && !lines),
    coincident: (pts === 2 && !curves) || (pts === 1 && curves === 1), midpoint: pts === 1 && lines === 1,
    concentric: rounds === 2 && !lines, fix: pts + curves > 0, collinear: lines >= 2 && !rounds && !pts, polygon: lines >= 3 && !rounds && !pts,
    symmetric: lines >= 1 && ((pts === 2 && lines === 1 && !rounds) || (lines === 3 && !pts && !rounds) || (n('circle') === 2 && lines === 1 && !pts && !n('arc')))
  };
  $$('[data-constraint]').forEach(b => b.classList.toggle('ready', !!can[b.dataset.constraint]));
  updateUndoButtons();
  $$('#dialog [data-cmd="undo"]').forEach(b => { b.disabled = !st.canUndo; });
  $$('#dialog [data-cmd="redo"]').forEach(b => { b.disabled = !st.canRedo; });
  updateHint();
}

$('#dialog').addEventListener('input', e => {
  const t = e.target;
  if (!editing) return;
  const f = editing.feature;
  if (t.dataset.opt === 'sides' && editor) { editor.setPolySides(t.value); return; }
  if (t.dataset.opt === 'rho' && editor) { editor.setConicRho(t.value); return; }
  if (t.dataset.opt === 'count' && editor) { editor.setPatternCount(t.value); return; }
  if (t.dataset.opt === 'texth' && editor) { const v = num(t.value); if (v > 0) editor.setTextProps({ h: v }); return; }
  if (t.dataset.k === 'name') { f.name = t.value.slice(0, 60); f.autoName = false; return; }
  if (t.dataset.k && t.type === 'checkbox') { if (t.checked) f[t.dataset.k] = true; else delete f[t.dataset.k]; scheduleBuild(0); return; }
  if (t.dataset.k && (t.type === 'number' || t.dataset.nx)) {
    let v;
    // Länge in der Anzeigeeinheit (Einstellungen → Einheiten): reine Zahlen und Rechnungen umrechnen, Parameter-Ausdrücke gelten in mm
    const len = t.dataset.u === 'len';
    // Größe, die das Feld erwartet (aus der Einheit dahinter): ein Ausdruck mit anderer Größe ist ein Fehler
    const want = wantUnit(t.dataset.dim);
    if (t.dataset.nx && isExpr(t.value)) {
      let e = t.value.trim();
      try { if (len) ({ v, expr: e } = parseLen(t.value, paramEnv(), want)); else v = evalLen(t.value, paramEnv(), 1, 'deg', want).v; } catch (err) { t.classList.add('bad'); t.title = err.message; return; }
      f.exprs = { ...(f.exprs || {}), [t.dataset.k]: { e, v } };
      t.parentElement.classList.add('fx');
    } else {
      v = t.dataset.nx ? (() => { try { return len ? parseLen(t.value, {}, want).v : evalLen(t.value, {}, 1, 'deg', want).v; } catch (_) { return null; } })() : num(t.value);
      if (v == null) { if (t.dataset.nx && t.value.trim()) t.classList.add('bad'); return; }
      if (len && !t.dataset.nx) v *= UF;
      if (f.exprs) { delete f.exprs[t.dataset.k]; if (!Object.keys(f.exprs).length) delete f.exprs; }
      t.parentElement.classList.remove('fx');
    }
    t.classList.remove('bad'); t.title = t.dataset.nx ? `= ${len ? fmtLenU(v, 3) : fmt(v, 3)}` : '';
    const altWert = f[t.dataset.k];
    f[t.dataset.k] = v;
    if (f.type === 'joint' && ['angle', 'offset', 'u', 'v'].includes(t.dataset.k)) kontaktPruefe(f, t.dataset.k, Number(altWert) || 0);
    // Zapfen: Rippenfelder erst bei Rippen > 0 (neu zeichnen nur beim Wechsel – sonst verliert das Feld den Fokus)
    if (f.type === 'boss' && t.dataset.k === 'ribs' && (Number(altWert) > 0) !== (v > 0)) renderFeatureDialog(true, false);
    if (f.type === 'frame' && ['w', 'h', 't', 'tw', 'tf'].includes(t.dataset.k) && f.size) {
      f.size = '';
      const ss = $('#dialog [data-k="size"]');
      if (ss) ss.value = '';
    }
    if (f.type === 'hole' && ['d', 'cd', 'cdepth', 'cangle'].includes(t.dataset.k) && f.preset) {
      f.preset = '';
      const ps = $('#dialog [data-k="preset"]');
      if (ps) ps.value = '';
    }
    if (f.type === 'plane' || f.type === 'axis' || f.type === 'point') refreshWorkPlanes();
    if (f.type === 'joint' && (t.dataset.k === 'lmin' || t.dataset.k === 'lmax')) {
      const r = $(`#dialog input[type=range][data-jrange="${f.kind === 'revolute' ? 'angle' : 'offset'}"]`);
      if (r) { r.min = Math.min(f.lmin, f.lmax); r.max = Math.max(f.lmin, f.lmax); }
    }
    if (t.dataset.k === 'distance' || ['dx', 'dy', 'dz'].includes(t.dataset.k)) updateManip();
    scheduleBuild(140);
  }
});
/* Zahlenfelder mit Ausdrücken: Pfeiltasten zählen wie bei type=number */
$('#dialog').addEventListener('keydown', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.nx || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || isExpr(t.value)) return;
  let v; try { v = evalExpr(t.value || '0'); } catch (_) { return; }
  const st = Number(t.dataset.step) || 1;
  v = Math.round((v + (e.key === 'ArrowUp' ? st : -st)) / st) * st;
  t.value = String(Math.round(v * 1e6) / 1e6);
  e.preventDefault();
  t.dispatchEvent(new Event('input', { bubbles: true }));
});
$('#dialog').addEventListener('change', e => {
  const t = e.target;
  if (!editing) return;
  if (t.dataset.opt === 'grid' && editor) { editor.setSnapGrid(t.checked); return; }
  if (t.dataset.opt === 'snap3d' && editor) { editor.setSnapModel(t.checked); return; }
  if (t.dataset.opt === 'glyphs' && editor) { editor.setShowGlyphs(t.checked); return; }
  if (t.dataset.opt === 'comb' && editor) { editor.setShowComb(t.checked); return; }
  if (t.dataset.show && editor) { editor.setShow(t.dataset.show, t.checked); return; }
  if (t.dataset.opt === 'slice' && editor) { setSketchSlice(t.checked); return; }
  if (t.dataset.opt === 'copy' && editor) { editor.setCopyMode(t.checked); return; }
  if (t.dataset.opt === 'textfont' && editor) { editor.setTextProps({ font: t.value }); return; }
  if (t.dataset.opt === 'patcount' && editor) { editor.setSelPatternCount(t.value); return; }
  if (t.dataset.opt === 'cons' && editor) { if (!!sketchState.consMode !== t.checked) editor.toggleConsMode(); return; }
  if (t.dataset.fsk && editing.feature.type === 'frame') {
    const f = editing.feature, id = t.dataset.fsk;
    f.sketches = (f.sketches || []).filter(x => x !== id);
    if (t.checked) f.sketches.push(id);
    if (!f.sketches.length) delete f.sketches;
    scheduleBuild(0);
    return;
  }
  if (t.dataset.feat) {
    const f = editing.feature, id = t.dataset.feat;
    f.features = f.features.filter(x => x !== id);
    if (t.checked) f.features.push(id);
    scheduleBuild(0);
    return;
  }
  if (t.dataset.k === 'preset') {
    applyPreset(editing.feature, t.value);
    renderFeatureDialog(true, false);
    scheduleBuild(0);
    return;
  }
  // Abhängigkeiten: Art und „bündig“ je Zeile
  if (t.dataset.ct != null && editing.feature.type === 'constraint') { const it = editing.feature.items[Number(t.dataset.ct)]; if (it) { it.type = t.value; renderFeatureDialog(true, false); scheduleBuild(0); } return; }
  if (t.dataset.cf != null && editing.feature.type === 'constraint') { const it = editing.feature.items[Number(t.dataset.cf)]; if (it) { it.flip = t.checked; scheduleBuild(0); } return; }
  if (t.dataset.smlmore != null && editing.feature.type === 'sm_loft') {
    editing.feature.more[+t.dataset.smlmore] = t.value;
    scheduleBuild(0);
    return;
  }
  if (t.dataset.loft != null && editing.feature.type === 'loft') {
    editing.feature.sections[+t.dataset.loft].sketch = t.value;
    scheduleBuild(0);
    return;
  }
  if (t.tagName === 'SELECT' && t.dataset.k && editing.feature.type === 'frame' && (t.dataset.k === 'kind' || t.dataset.k === 'size')) {
    const f = editing.feature;
    if (t.dataset.k === 'kind') { f.kind = t.value; f.size = PROFILE_KINDS[f.kind].sizes[Math.min(2, PROFILE_KINDS[f.kind].sizes.length - 1)]; }
    else f.size = t.value;
    if (f.size) {
      Object.assign(f, sizeDims(f.kind, f.size));
      if (f.exprs) { ['w', 'h', 't', 'tw', 'tf'].forEach(k => delete f.exprs[k]); if (!Object.keys(f.exprs).length) delete f.exprs; }
    }
    renderFeatureDialog(true, false);
    scheduleBuild(0);
    return;
  }
  if (t.tagName === 'SELECT' && t.dataset.k) {
    editing.feature[t.dataset.k] = t.value;
    if (t.dataset.k === 'sketch') { editing.feature.profiles = null; showProfiles(); renderFeatureDialog(false); }
    if (t.dataset.k === 'center' && editing.feature.type === 'loft' && !t.value) delete editing.feature.center;
    if ((t.dataset.k === 'rail1' || t.dataset.k === 'rail2') && editing.feature.type === 'loft' && !t.value) delete editing.feature[t.dataset.k];
    if (editing.feature.type === 'loft' && ['center', 'rail1', 'rail2'].includes(t.dataset.k) && t.value && editing.feature.closed) {
      // Geschlossen gibt es nur ohne Mittellinie und ohne Schienen – der Schalter verschwindet mit der Auswahl
      delete editing.feature.closed;
      renderFeatureDialog(true, false);
    }
    if (t.dataset.k === 'tclass' && !t.value) delete editing.feature.tclass;
    if (t.dataset.k === 'rail' && editing.feature.type === 'sweep') {
      // Führungsschiene: ohne Schiene kein Feld in der Datei; mit Schiene erscheint „Profil an der Schiene“
      if (!t.value) { delete editing.feature.rail; delete editing.feature.railScale; }
      renderFeatureDialog(true, false);
    }
    scheduleBuild(0);
  }
  // „Spalt (offener Saum)“ gibt es erst ab einem Saum: nach dem Eingeben neu bauen
  // ebenso „Symmetrisch“ bei der runden Anordnung (nur unter 360°)
  if (t.tagName === 'INPUT' && t.dataset.k === 'angle' && (editing.feature.type === 'sm_flange' || editing.feature.type === 'pattern')) renderFeatureDialog(true, false);
});
$('#dialog').addEventListener('change', e => {
  const t = e.target.closest('select[data-segsel]');
  if (t && editing) applySeg(t.dataset.segsel, t.value, null);
});
$('#dialog').addEventListener('click', e => {
  const b = e.target.closest('button[data-k][data-v]');
  if (!b || !editing) return;
  applySeg(b.dataset.k, b.dataset.v, b);
});
function applySeg(k, raw, b) {
  const f = editing.feature;
  const v = raw === 'true' ? true : raw === 'false' ? false : raw;
  if (f.type === 'revolve' && k === 'axis') {
    if (v === 'edge') { editing.pickTarget = 'revaxis'; vp.setPickMode('any'); renderFeatureDialog(true, false); scheduleBuild(0); return; }
    delete f.axisRef; if (editing.pickTarget === 'revaxis') { editing.pickTarget = null; vp.setPickMode(pickModeFor(f)); showProfiles(); }
  }
  if (f.type === 'pattern' && (k === 'axis' || k === 'axis2')) {
    // Richtung 1 oder 2 auf eine Kante, Kreiskante oder Zylinderfläche legen
    const ref = k === 'axis' ? 'axisRef' : 'axis2Ref', target = k === 'axis' ? 'patternaxis' : 'patternaxis2';
    if (v === 'edge') { editing.pickTarget = target; vp.setPickMode('any'); renderFeatureDialog(true, false); scheduleBuild(0); return; }
    delete f[ref]; if (editing.pickTarget === target) { editing.pickTarget = null; vp.setPickMode(pickModeFor(f)); }
  }
  if (f.type === 'pattern' && (k === 'sym' || k === 'sym2')) {
    // symmetrisch verteilt die Kopien um das Original – das sitzt in der Mitte, also nur mit ungerader Anzahl
    f[k] = v;
    const key = k === 'sym' ? 'count' : 'count2';
    const c = Math.round(Number(f[key])) || 3;
    if (v && c % 2 === 0) f[key] = c + 1;
    renderFeatureDialog(true, false); scheduleBuild(0);
    return;
  }
  if (f.type === 'move' && k === 'mode') {
    /* Verschieben: Punkt zu Punkt, entlang einer Kante oder um eine gewählte Achse.
       Ohne dieses Feld bleibt alles beim bisherigen Abstand/Winkel – alte Dateien unverändert. */
    ['from', 'to', 'edge', 'distance', 'flip', 'axisRef', 'tx', 'ty', 'tz'].forEach(x => delete f[x]);
    if (v === 'free') delete f.mode; else f.mode = v;
    if (v === 'edge' && !(Number(f.distance) > 0)) f.distance = 10;
    editing.pickTarget = v === 'points' || v === 'pointpos' ? 'move-from' : v === 'edge' ? 'move-edge' : v === 'axis' ? 'move-axis' : null;
    vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); updateHint(); scheduleBuild(0);
    return;
  }
  if (f.type === 'move' && k === 'flip' && v === false) { delete f.flip; renderFeatureDialog(true, false); scheduleBuild(0); return; }
  if (f.type === 'point' && k === 'mode') {
    f.mode = v; f.base = v === 'coords' ? { kind: 'coords', x: 0, y: 0, z: 0 } : null;
    vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); refreshWorkPlanes(); updateHint(); scheduleBuild(0);
    return;
  }
  if (f.type === 'axis' && (k === 'mode' || k === 'okey')) {
    if (k === 'mode') { f.mode = v; f.base = v === 'origin' ? { kind: 'origin', key: 'Z' } : null; }
    else f.base = { kind: 'origin', key: v };
    vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); refreshWorkPlanes(); updateHint(); scheduleBuild(0);
    return;
  }
  const altWert = Number(f[k]) || 0;
  f[k] = v;
  if (f.type === 'joint' && ['angle', 'offset', 'u', 'v'].includes(k)) kontaktPruefe(f, k, altWert);
  if (f.type === 'boss' && k === 'hole') { renderFeatureDialog(true, false); scheduleBuild(0); return; }
  if (f.type === 'moveface' && k === 'mode') {
    // andere Art: Achs- bzw. Zielauswahl der alten Art beenden
    if (editing.pickTarget === 'mf-axis' || editing.pickTarget === 'mf-target') { editing.pickTarget = null; vp.setPickMode('face'); }
    renderFeatureDialog(true, false); updateHint(); scheduleBuild(0);
    return;
  }
  if (f.type === 'motionlink' && (k === 'a' || k === 'b')) {
    // neues Gelenk: Bewegung und Einheit passend zur Gelenkart
    const j = doc.features.find(x => x.id === v), fk = k === 'a' ? 'fa' : 'fb', vk = k === 'a' ? 'va' : 'vb';
    const ok = j && { revolute: ['angle'], slider: ['offset'], cylindrical: ['angle', 'offset'], pinslot: ['angle', 'u'], planar: ['u', 'v', 'angle'], ball: ['angle'] }[j.kind];
    if (ok && !ok.includes(f[fk])) { f[fk] = ok[0]; f[vk] = ok[0] === 'angle' ? 360 : 10; }
    renderFeatureDialog(true, false); scheduleBuild(0);
    return;
  }
  if (f.type === 'motionlink' && (k === 'fa' || k === 'fb')) { renderFeatureDialog(true, false); scheduleBuild(0); return; }
  if (f.type === 'fastener' && ['kind', 'size', 'length'].includes(k)) {
    const K = FASTENERS[f.kind];
    if (!K.dims[f.size]) f.size = K.dims.M8 ? 'M8' : Object.keys(K.dims)[0];
    if (K.screw) { const Ls = lengthsFor(f.size); f.length = Number(f.length); if (k !== 'length' && !Ls.includes(f.length)) f.length = Ls.find(L => L >= f.length) || Ls[Ls.length - 1]; }
    if (f.autoName) f.name = fastenerLabel(f);
    renderFeatureDialog(true, false); scheduleBuild(0);
    return;
  }
  if (f.type === 'joint' && k === 'limits' && v && !(Number.isFinite(Number(f.lmin)) && Number.isFinite(Number(f.lmax)))) { if (f.kind === 'revolute') { f.lmin = -90; f.lmax = 90; } else { f.lmin = 0; f.lmax = 50; } }
  if (f.type === 'joint' && k === 'limits') renderFeatureDialog(true, false);
  if (f.type === 'split' && k === 'tool' && v === 'sketch' && !f.sketch) { const sk = lastSketch(); if (sk) f.sketch = sk.id; }
  if (f.type === 'split' && (k === 'tool' || k === 'mode')) { vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); }
  if (f.type === 'silsplit' && k === 'richtung') { vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); }
  if (f.type === 'scale' && k === 'mode') { if (v === 'xyz') ['sx', 'sy', 'sz'].forEach(q => { if (f[q] == null) f[q] = Number(f.factor) || 1; }); renderFeatureDialog(true, false); }
  if (f.type === 'sm_rip' && k === 'mode') { vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); scheduleBuild(0); return; }
  if (f.type === 'hole' && k === 'place') {
    // Lage wechseln: ohne Feld bleibt es bei Skizze/Fläche, die Maße der anderen Lage kommen weg
    if (v === 'sketch') ['place', 'rings', 'edgeA', 'edgeB', 'offA', 'offB', 'edgeP', 'edgePos'].forEach(x => delete f[x]);
    if (v !== 'onedge') { delete f.edgeP; delete f.edgePos; }
    if (v === 'edges' && !(Number(f.offA) >= 0)) { f.offA = 20; f.offB = 20; }
    vp.setPickMode(pickModeFor(f)); renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'sweep' && k === 'railScale') {
    // „nur ausrichten“ ist die Vorgabe und kommt nicht in die Datei
    if (v === 'none') delete f.railScale;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'sweep' && k === 'orient') {
    // senkrecht ist die Vorgabe und kommt nicht in die Datei
    if (v === 'perp') delete f.orient;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'revolve' && k === 'rdir') {
    // eine Seite ist die Vorgabe; der zweite Winkel gehört nur zu „Zwei Seiten“
    if (v === 'one') delete f.rdir;
    if (v === 'two') { if (!(Number(f.angle2) > 0)) f.angle2 = 90; } else delete f.angle2;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'shell' && (k === 'dir' || k === 'hollow')) {
    // Vorgaben (innen, angeklickte Flächen offen) kommen nicht in die Datei
    if (k === 'dir' && v === 'inside') delete f.dir;
    if (k === 'dir') { if (v === 'both') { if (!(Number(f.thickness2) > 0)) f.thickness2 = Number(f.thickness) || 1; } else delete f.thickness2; }
    if (k === 'hollow' && !v) delete f.hollow;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'sm_loft' && k === 'facetMode') {
    // Facettensteuerung: nur das Feld der gewählten Art bleibt in der Datei („Anzahl je 90°“ = ohne Angabe wie bisher)
    if (v === 'number') delete f.facetMode;
    if (v !== 'angle') delete f.facetAngle; else if (!(Number(f.facetAngle) > 0)) f.facetAngle = 22.5;
    if (v !== 'length') delete f.facetLength; else if (!(Number(f.facetLength) > 0)) f.facetLength = 20;
    if (v !== 'chord') delete f.chordTol; else if (!(Number(f.chordTol) > 0)) f.chordTol = 0.5;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'sm_flange' && k === 'hemKind') {
    // Saumart: Vorgaben je Art, Felder der anderen Arten fallen aus der Datei (offen = ohne Angabe wie bisher)
    if (v === 'open') { delete f.hemKind; delete f.hemR; delete f.hemAngle; delete f.hemSetback; }
    else {
      if (!(Number(f.hemR) > 0)) f.hemR = sheetRule().r;
      if (v === 'rolled') { if (!(Number(f.hemAngle) >= 180)) f.hemAngle = 270; }
      else { delete f.hemAngle; if (!(Number(f.hemGap) >= 0)) f.hemGap = 0; }
      if (v === 'double') { delete f.hemR; if (!(Number(f.hemSetback) >= 0)) f.hemSetback = 0; } else delete f.hemSetback;
    }
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'sm_join' && k === 'ownR') {
    // eigener Biegeradius: Feld mit dem Wert der Blechregel öffnen; zurück auf die Regel nimmt das Feld aus der Datei
    if (v) { if (!(Number(f.radius) >= 0)) f.radius = sheetRule().r; } else { delete f.ownR; delete f.radius; }
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'sm_unfold' && k === 'bends') {
    // „nur ausgewählte“: die Biegeflächen werden im Modell angeklickt
    if (v === 'some') { if (!Array.isArray(f.bends)) f.bends = []; }
    else delete f.bends;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'extrude' && (k === 'direction' || k === 'start' || k === 'thin' || k === 'wall')) {
    // zwei Seiten: eigene Ausdehnung je Seite; „Start: Versatz“ rückt die Startebene von der Profilebene
    if (k === 'direction') {
      if (v === 'two') { if (!(Number(f.dist2) > 0)) f.dist2 = Number(f.distance) || 10; }
      else { delete f.dist2; delete f.taper2; }
    } else if (k === 'start') {
      if (v === 'offset') { f.startOffset = Number.isFinite(Number(f.startOffset)) ? Number(f.startOffset) : 0; delete f.startRef; }
      else if (v === 'object') delete f.startRef;   // „Von Objekt“: die Startfläche wird im Modell angeklickt
      else { delete f.start; delete f.startOffset; delete f.startRef; }
    } else if (k === 'thin') {
      // dünne Wand: Kontur mit eigener Dicke; „Seite 1“ ist voreingestellt und kommt nicht in die Datei
      if (v === true) { if (!(Number(f.thickness) > 0)) f.thickness = 2; }
      else { delete f.thin; delete f.thickness; delete f.wall; }
    } else if (v === 'side1') delete f.wall;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'pattern' && k === 'kind' && v === 'path' && !f.path) { const sk = lastSketch(); if (sk) f.path = sk.id; }
  if (f.type === 'pattern' && k === 'kind' && v === 'points' && !f.ptsSketch) { const sk = lastSketch(); if (sk) f.ptsSketch = sk.id; }
  if (f.type === 'pattern' && (k === 'dist' || k === 'dist2')) {
    // „Ausdehnung“ ist das Gesamtmaß von erster bis letzter Kopie: Feld mit brauchbarem Wert öffnen
    const ext = k === 'dist' ? 'extent' : 'extent2';
    if (v === 'extent' && !(Number(f[ext]) > 0)) f[ext] = 100;
    renderFeatureDialog(true, false); scheduleBuild(0); return;
  }
  if (f.type === 'topo') { editing.topoVorschau = false; if (k === 'bereich') { showProfiles(); renderFeatureDialog(true, false); scheduleBuild(0); return; } }
  if (f.type === 'hole' && k === 'kind') presetForKind(f);
  if ((['hole', 'pattern', 'mirror', 'joint', 'thread'].includes(f.type) && k === 'full') || (f.type === 'hole' && k === 'tFull') || (['hole', 'pattern', 'mirror', 'joint', 'align', 'weld', 'primitive'].includes(f.type) && ['kind', 'depthMode', 'mode', 'tapMode'].includes(k)) || k === 'op' || k === 'extent' || (f.type === 'sm_flange' && k === 'corners') || (f.type === 'sm_rip' && k === 'kind') || (f.type === 'sm_corner' && (k === 'kind' || k === 'all')) || (f.type === 'coil' && k === 'mode') || (f.type === 'draft' && k === 'mode') || (f.type === 'revolve' && k === 'rext') || (f.type === 'presspull' && k === 'ppTo') || (f.type === 'canvas' && k === 'cplane') || (f.type === 'bound' && k === 'shape') || (f.type === 'combine' && k === 'newComp') || (f.type === 'topo' && k === 'bereich') || ((f.type === 'extrude' || f.type === 'sweep') && k === 'src') || (f.type === 'sm_loft' && k === 'mode') || (f.type === 'scale' && k === 'point') || (f.type === 'fillet' && (k === 'variable' || k === 'chord')) || (f.type === 'chamfer' && k === 'ctype') || (f.type === 'pipe' && (k === 'section' || k === 'hollow'))) renderFeatureDialog(true, false);
  else if (b) $$(`#dialog button[data-k="${k}"]`).forEach(x => x.setAttribute('aria-checked', String(x === b)));
  if (f.type === 'plane') refreshWorkPlanes();
  scheduleBuild(0);
}

/* ---------------- Zeitleiste und Browser ---------------- */
function renderTimeline() {
  if (timelinePos != null && timelinePos >= doc.features.length) timelinePos = null;
  const st = lastBuild ? lastBuild.status : {};
  const pos = timelinePos == null ? doc.features.length : timelinePos;
  const items = doc.features.map((f, i) => {
    const s = st[f.id];
    const bad = s && !s.ok, warn = s && s.ok && s.warn;
    const active = editing && !editing.isNew && editing.index === i;
    const rolled = (editing && editing.feature.type === 'sketch' && !editing.isNew && i > editing.index) || (editing && editing.isNew && timelinePos != null && i >= editing.index) || (!editing && i >= pos);
    return `<div class="tl-item${bad ? ' bad' : ''}${warn ? ' warn' : ''}${active ? ' active' : ''}${rolled ? ' rolled' : ''}${f.suppressed ? ' supp' : ''}" draggable="${editing ? 'false' : 'true'}" data-tl="${i}" title="${esc(f.name)}${f.suppressed ? ' – unterdrückt' : ''}${bad ? ' – ' + esc(s.error) : warn ? ' – ' + esc(s.warn) : ''} · Klick: bearbeiten, Rechtsklick: Menü, Ziehen: umsortieren">
      <button type="button" class="tl-btn" data-cmd="edit" data-index="${i}">${icon(FEATURE_TYPES[f.type].icon, 20)}</button>
      <button type="button" class="tl-del" data-cmd="delete" data-index="${i}" aria-label="${esc(f.name)} löschen">${icon('close', 10)}</button></div>`;
  });
  if (editing && editing.isNew) {
    const f = editing.feature;
    items.splice(editing.index, 0, `<div class="tl-item active draft" title="${esc(f.name)}"><span class="tl-btn">${icon(FEATURE_TYPES[f.type].icon, 20)}</span></div>`);
  }
  if (!editing && items.length) items.splice(pos, 0, '<div class="tl-marker" title="Marker ziehen, um das Modell zurückzurollen"></div>');
  $('#timeline-items').innerHTML = items.length ? items.join('') : '<span class="tl-empty">Die Zeitleiste füllt sich mit jedem Schritt. Jeder Schritt lässt sich später ändern.</span>';
}
/* Abspieltasten und Marker ziehen */
$('#timeline-ctl').innerHTML = [['tl-start', 'tlstart', 'An den Anfang'], ['tl-prev', 'tlprev', 'Einen Schritt zurück'], ['tl-next', 'tlnext', 'Einen Schritt vor'], ['tl-end', 'tlend', 'Ans Ende']]
  .map(([c, ic, t]) => `<button type="button" data-cmd="${c}" title="${t}" aria-label="${t}">${icon(ic, 14)}</button>`).join('');
$('#timeline-items').addEventListener('pointerdown', e => {
  const mk = e.target.closest('.tl-marker');
  if (!mk || editing) return;
  e.preventDefault();
  const move = ev => {
    const its = $$('#timeline-items .tl-item');
    let p = its.length;
    for (let i = 0; i < its.length; i++) { const r = its[i].getBoundingClientRect(); if (ev.clientX < r.left + r.width / 2) { p = i; break; } }
    setTimelinePos(p >= doc.features.length ? null : p);
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
});

/* ---------- Zeitleiste: Kontextmenü (Unterdrücken, Bearbeiten, Löschen) und Umsortieren per Ziehen ---------- */
function refsOf(f) {
  const ids = new Set();
  const addId = v => { if (v) ids.add(String(v).split(/[:/]/)[0]); };
  ['sketch', 'path', 'planeRef', 'comp', 'faceBody', 'body1'].forEach(k => addId(f[k]));
  if (f.base && f.base.id) addId(f.base.id);
  if (f.plane && f.plane.id) addId(f.plane.id);
  if (f.base) [f.base.a, f.base.b].forEach(r => addId(r && r.id));
  if (f.axisRef) addId(f.axisRef.id);
  if (f.axis2Ref) addId(f.axis2Ref.id);
  ['features', 'targets', 'bodies', 'target', 'tools', 'sketches', 'more'].forEach(k => (Array.isArray(f[k]) ? f[k] : []).forEach(addId));
  (f.sections || []).forEach(s => addId(s && s.sketch));
  (f.edges || []).forEach(e => addId(e && e.body));
  [f.o1, f.o2].forEach(o => addId(o && o.body));
  return ids;
}
/* Reihenfolge gültig? Jedes Feature darf nur auf frühere Features verweisen (Komponenten/Einfügungen zählen nicht) */
function orderProblem(fs) {
  const pos = new Map(fs.map((f, i) => [f.id, i]));
  for (let i = 0; i < fs.length; i++) {
    for (const id of refsOf(fs[i])) { if (pos.has(id) && pos.get(id) >= i) return `${fs[i].name} braucht ${fs[pos.get(id)].name} davor.`; }
  }
  return '';
}
function moveFeature(from, to) {
  if (from === to || editing) return;
  const fs = doc.features.slice(), [f] = fs.splice(from, 1);
  fs.splice(to, 0, f);
  const bad = orderProblem(fs);
  if (bad) { toast('Umsortieren nicht möglich: ' + bad, 5000); return; }
  pushHistory();
  doc.features = fs;
  store(); renderAll(); scheduleBuild(0);
}
function toggleSuppress(i) {
  const f = doc.features[i];
  if (!f) return;
  if (editing) cancelEditing();
  pushHistory();
  f.suppressed = !f.suppressed;
  store(); renderAll(); scheduleBuild(0);
  toast(f.suppressed ? `${f.name} unterdrückt.` : `${f.name} wieder aktiv.`);
}
function showTimelineMenu(i, x, y) {
  const f = doc.features[i];
  let m = $('#ctxmenu');
  if (!m) { m = document.createElement('div'); m.id = 'ctxmenu'; m.className = 'ctxmenu'; document.body.appendChild(m); }
  m.innerHTML = `<button type="button" data-cmd="edit" data-index="${i}">Bearbeiten</button>
    <button type="button" data-cmd="tl-suppress" data-index="${i}">${f.suppressed ? 'Aktivieren' : 'Unterdrücken'}</button>
    ${f.type === 'sketch' ? `<button type="button" data-cmd="tl-dxf" data-index="${i}">Als DXF speichern</button>` : ''}
    ${i > 0 ? `<button type="button" data-cmd="tl-move" data-index="${i}" data-to="${i - 1}">Nach vorn</button>` : ''}
    ${i < doc.features.length - 1 ? `<button type="button" data-cmd="tl-move" data-index="${i}" data-to="${i + 1}">Nach hinten</button>` : ''}
    <button type="button" data-cmd="delete" data-index="${i}" class="danger">Löschen</button>`;
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.max(6, y - r.height - 4) + 'px';
}
document.addEventListener('pointerdown', e => { const m = $('#ctxmenu'); if (m && !m.hidden && !e.target.closest('#ctxmenu')) m.hidden = true; });
document.addEventListener('click', e => { if (e.target.closest('#ctxmenu button')) setTimeout(() => { const m = $('#ctxmenu'); if (m) m.hidden = true; }, 0); });
$('#timeline-items').addEventListener('contextmenu', e => {
  const it = e.target.closest('[data-tl]');
  if (!it) return;
  e.preventDefault();
  showTimelineMenu(+it.dataset.tl, e.clientX, e.clientY);
});
let tlDrag = null;
$('#timeline-items').addEventListener('dragstart', e => { const it = e.target.closest('[data-tl]'); if (!it) return; tlDrag = +it.dataset.tl; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(tlDrag)); } catch (_) { /* egal */ } });
$('#timeline-items').addEventListener('dragover', e => { if (tlDrag == null) return; const it = e.target.closest('[data-tl]'); if (!it) return; e.preventDefault(); $$('#timeline-items .tl-item').forEach(x => x.classList.toggle('dropto', x === it)); });
$('#timeline-items').addEventListener('drop', e => { const it = e.target.closest('[data-tl]'); $$('#timeline-items .tl-item').forEach(x => x.classList.remove('dropto')); if (tlDrag == null || !it) return; e.preventDefault(); const from = tlDrag; tlDrag = null; moveFeature(from, +it.dataset.tl); });
$('#timeline-items').addEventListener('dragend', () => { tlDrag = null; $$('#timeline-items .tl-item').forEach(x => x.classList.remove('dropto')); });

/* Browser einer Zeichnung: Dokumenteinstellungen, Blätter, verknüpftes Modell */
function renderDrawingBrowser() {
  const sheets = (doc.drawing && doc.drawing.sheets && doc.drawing.sheets.length) ? doc.drawing.sheets : [{}];
  const o = (doc.drawing && doc.drawing.opts) || {};
  const cur = drawing.open ? drawing.sheet : -1;
  $('#browser').innerHTML = `
    <div class="b-head">Browser</div>
    <details class="b-root" open><summary>${icon('caret', 12)}${icon('drawing', 15)}<span>${esc(doc.name)}</span></summary><div class="b-kids">
    <details class="b-fold"><summary>${icon('caret', 12)}${icon('gear', 15)}<span>Dokumenteinstellungen</span></summary><div class="b-kids">
      <div class="b-row static" data-dockind="drawing">${icon('drawing', 15)}<span>Zeichnung</span></div>
      <div class="b-row static">${icon('dim', 15)}<span>Einheiten: mm · Format ${esc(o.format || 'A4')}</span></div>
    </div></details>
    <details class="b-fold" open><summary>${icon('caret', 12)}${icon('folder', 15)}<span>Blätter</span><em>${sheets.length}</em></summary><div class="b-kids">
      ${sheets.map((_, i) => `<button type="button" class="b-row${i === cur ? ' on' : ''}" data-cmd="dsheet" data-i="${i}">${icon('drawing', 15)}<span>Blatt ${i + 1}</span></button>`).join('')}
    </div></details>
    <details class="b-fold" open><summary>${icon('caret', 12)}${icon('folder', 15)}<span>Modell</span></summary><div class="b-kids">
      <div class="b-line"><div class="b-row static" title="${esc(doc.ref ? 'Verknüpft: ' + fileLabel(doc.ref) : 'Kopie in der Zeichnung, nicht verknüpft')}">${icon(doc.modelKind === 'assembly' ? 'component' : 'body', 15)}<span>${esc(doc.modelName || '')}${doc.ref ? '' : ' (Kopie)'}</span></div><button type="button" class="iconbtn" data-cmd="drawing-close" title="Modell öffnen">${icon('folder', 14)}</button></div>
    </div></details>
    </div></details>`;
}
function renderBrowser() {
  zeigeCompLeiste(); // „Komponente bearbeiten“-Leiste folgt Rückgängig, Öffnen, Neu
  if (doc.kind === 'drawing') return renderDrawingBrowser();
  const sketches = doc.features.map((f, i) => [f, i]).filter(([f]) => f.type === 'sketch');
  /* Ebenen zum Skizzieren: eigene Arbeitsebenen und die drei Ebenen jedes Benutzerkoordinatensystems */
  const wps = doc.features.filter(f => f.type === 'plane').map(f => ({ id: f.id, name: f.name, bks: false }))
    .concat(doc.features.filter(f => f.type === 'bks').flatMap(f => ['', 'x', 'y'].map(k => ({ id: k ? bksAxisId(f.id, k) : f.id, name: bksPlaneLabel(f.name, k), bks: true }))));
  const wax = doc.features.map((f, i) => [f, i]).filter(([f]) => f.type === 'axis' || f.type === 'point' || f.type === 'bks');
  const m = lastBuild && lastBuild.mesh;
  const dims = m ? m.bbox[1].map((v, k) => v - m.bbox[0][k]) : null;
  const ids = (lastBuild && lastBuild.bodies) || [];
  const comps = doc.components || [];
  const inserts = doc.inserts || [];
  const inComp = new Set(comps.flatMap(c => c.bodies));
  const loose = ids.filter(id => !inComp.has(id) && !id.includes('/'));
  let totalMass = 0;
  if (m) m.bodies.forEach(mb => { const b = bodyInfo(mb.id), mat = MATERIALS[(b || {}).material] || MATERIALS.none; if (mat.rho && mb.volume) totalMass += mb.volume / 1000 * mat.rho; });
  /* Solange die grobe Netzfassung läuft, stammen die Volumen aus ihren Dreiecken (siehe
     `netzVolumen`): unter einem Prozent Abstand, bis die feine Fassung nachgezogen ist. Eine Zahl,
     die sich ändert, soll das hier auch sagen. */
  const vorl = m && m.volumeAusNetz ? '≈ ' : '';
  const bodyRow = id => {
        const b = bodyInfo(id) || { name: 'Körper', hidden: false };
        const mb = m && m.bodies.find(x => x.id === id);
        const unscharf = mb && mb.volumeAusNetz ? '≈ ' : '';
        const tip = mb ? `${mb.bbox[1].map((v, k) => fmtLen(v - mb.bbox[0][k], 1)).join(' × ')} ${UNIT}${mb.volume ? ` · ${unscharf}${fmtVol(mb.volume, 2)}` : ''} · Doppelklick benennt um` : 'ausgeblendet';
        const mat = MATERIALS[b.material] || MATERIALS.none;
        const mass = mb && mb.volume && mat.rho ? `${unscharf}${fmtMass(mb.volume / 1000 * mat.rho)}` : null;
        const props = openBody === id ? `<div class="b-bodyprops">
          <label><span>Material</span><select data-bodyprop="material" data-id="${esc(id)}">${Object.entries(MATERIALS).map(([k, m]) => `<option value="${k}"${k === (b.material || 'none') ? ' selected' : ''}>${esc(m.label)}${m.rho ? ` · ${fmt(m.rho, 2)} g/cm³` : ''}</option>`).join('')}</select></label>
          <label><span>Farbe</span><input type="color" data-bodyprop="color" data-id="${esc(id)}" value="${bodyColor(b)}"></label>
          ${mb ? `<div><span>Abmessung</span><b>${mb.bbox[1].map((v, k) => fmtLen(v - mb.bbox[0][k], 1)).join(' × ')} ${UNIT}</b></div>` : ''}
          ${mb && mb.volume ? `<div><span>Volumen</span><b>${unscharf}${fmtVol(mb.volume, 2)}</b></div>` : ''}
          ${mass ? `<div><span>Masse</span><b>${mass}</b></div>` : (mb ? '<p class="b-empty">Für die Masse ein Material wählen.</p>' : '')}
        </div>` : '';
        return `<div class="b-line${b.hidden ? ' off' : ''}"><div class="b-row" data-body="${esc(id)}" title="${esc(tip)}"><i class="swatch" style="background:${bodyColor(b)}"></i><span data-nm>${esc(b.name)}</span>${mass ? `<em class="b-mass">${mass}</em>` : ''}</div><button type="button" class="iconbtn" data-cmd="toggle-body" data-id="${esc(id)}" title="${b.hidden ? 'Einblenden' : 'Ausblenden'}">${icon(b.hidden ? 'eyeOff' : 'eye', 16)}</button></div>${props}`;
      };
  const act = doc.activeComp && comps.some(c => c.id === doc.activeComp) ? doc.activeComp : null;
  const actBtn = id => `<button type="button" class="b-act${act === id ? ' on' : ''}" data-cmd="comp-activate" data-id="${esc(id || '')}" title="${act === id ? 'Aktiv' : 'Aktivieren'}" aria-pressed="${act === id}"></button>`;
  const sketchRow = ([f, i]) => `<div class="b-line"><button type="button" class="b-row" data-cmd="edit" data-index="${i}">${icon('sketch', 15)}<span data-nm>${esc(f.name)}</span></button><button type="button" class="iconbtn" data-cmd="toggle-sketch" data-id="${f.id}" title="${sketchVisible(f) ? 'Ausblenden' : 'Einblenden'}">${icon(sketchVisible(f) ? 'eye' : 'eyeOff', 16)}</button></div>`;
  const compIds = new Set(comps.map(c => c.id));
  const rootSketches = sketches.filter(([f]) => !f.owner || !compIds.has(f.owner));
  const compNode = c => {
    const all = compAllBodies(doc, c.id), live = c.bodies.filter(b => ids.includes(b)), kids = comps.filter(x => x.parent === c.id);
    const csk = sketches.filter(([f]) => f.owner === c.id);
    const allHidden = all.length && all.every(b => (bodyInfo(b) || {}).hidden);
    return `<details class="b-comp" data-compfold="${esc(c.id)}"${compOffen(c) ? ' open' : ''}><summary>${icon('caret', 12)}<div class="b-line${act === c.id ? ' act' : ''}"><div class="b-row static" data-comp="${esc(c.id)}" title="${esc(compPath(doc, c.id))}${c.instanz ? ` · Instanz von ${esc(compPath(doc, c.instanz.von))}` : ''} · Rechtsklick für Befehle">${actBtn(c.id)}${icon('component', 15)}<span data-nm>${esc(c.name)}</span>${c.instanz ? '<em class="b-inst" title="Instanz – Änderungen am Original gelten auch hier">↻</em>' : ''}</div><button type="button" class="iconbtn" data-cmd="toggle-comp" data-id="${esc(c.id)}" title="${allHidden ? 'Einblenden' : 'Ausblenden'}">${icon(allHidden ? 'eyeOff' : 'eye', 16)}</button><button type="button" class="iconbtn" data-cmd="comp-dissolve" data-id="${esc(c.id)}" title="Komponente auflösen (Inhalt geht eine Ebene höher)">${icon('close', 14)}</button></div></summary>
      <div class="b-nest">${kids.map(compNode).join('')}${live.map(bodyRow).join('')}${csk.length ? fold('Skizzen', csk.length, csk.map(sketchRow).join(''), false) : ''}${!kids.length && !live.length && !csk.length ? '<p class="b-empty">leer</p>' : ''}</div></details>`;
  };
  const fold = (label, n, body, open = true, cls = '') => `<details class="b-fold ${cls}"${open ? ' open' : ''}><summary>${icon('caret', 12)}${icon('folder', 15)}<span>${label}</span>${n != null ? `<em>${n}</em>` : ''}</summary><div class="b-kids">${body}</div></details>`;
  const props = m ? `<dl class="b-props"><div><dt>Abmessung</dt><dd>${dims.map(v => fmtLen(v, 1)).join(' × ')} ${UNIT}</dd></div>
        ${m.volume ? `<div><dt>Volumen</dt><dd>${vorl}${fmtVol(m.volume, 2)}</dd></div>` : ''}${totalMass ? `<div><dt>Masse</dt><dd>${vorl}${fmtMass(totalMass)}</dd></div>` : ''}</dl>` : '';
  $('#browser').innerHTML = `
    <div class="b-head">Browser</div>
    <details class="b-root" open><summary>${icon('caret', 12)}${actBtn(null)}<span>${esc(doc.name)}</span></summary><div class="b-kids">
    ${doc.configs && doc.configs.rows.length ? `<label class="b-row b-cfg">${icon('config', 15)}<select data-cfgsel aria-label="Aktive Konfiguration">${doc.configs.rows.map(r => `<option value="${esc(r.id)}"${r.id === doc.configs.active ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    <details class="b-fold"><summary>${icon('caret', 12)}${icon('gear', 15)}<span>Dokumenteinstellungen</span></summary><div class="b-kids">
      <div class="b-line"><div class="b-row static" data-dockind="${inferKind(doc)}">${icon(inferKind(doc) === 'assembly' ? 'component' : 'body', 15)}<span>${inferKind(doc) === 'assembly' ? 'Baugruppenkonstruktion' : 'Bauteilkonstruktion'}</span></div><button type="button" class="chip" data-cmd="doc-kind" title="${inferKind(doc) === 'assembly' ? 'In eine Bauteilkonstruktion umwandeln (nur ohne Komponenten, Teile, Gelenke)' : 'In eine Baugruppenkonstruktion umwandeln'}">${inferKind(doc) === 'assembly' ? 'Bauteil' : 'Baugruppe'}</button></div>
      <label class="b-row b-cfg" title="Einheit dieses Dokuments für Anzeige und Eingabe; neue Dokumente nehmen die Einheit aus den Einstellungen">${icon('dim', 15)}<span>Einheiten</span><select data-docunit aria-label="Einheiten des Dokuments">${LEN_UNITS.map(([v, l]) => `<option value="${v}"${v === UNIT ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <button type="button" class="b-row" data-cmd="params">${icon('params', 15)}<span>Parameter ändern</span></button>
      <button type="button" class="b-row" data-cmd="configs">${icon('config', 15)}<span>Konfigurationen</span></button>
      <button type="button" class="b-row" data-cmd="sm_rule">${icon('smrule', 15)}<span>Blechregel</span></button>
    </div></details>
    ${fold('Ursprung', null, Object.values(ORIGIN_PLANES).map(p => `<button type="button" class="b-row" data-cmd="sketch-on" data-plane="${p.key}" title="Skizze auf ${esc(p.label)}">${icon('plane', 15)}<span>${esc(p.label)}</span></button>`).join(''), false)}
    ${wps.length + wax.length ? fold('Konstruktion', wps.length + wax.length, wps.map(w => `<button type="button" class="b-row" data-cmd="sketch-wp" data-id="${w.id}" title="Skizze auf ${esc(w.name)}">${icon(w.bks ? 'bks' : 'wplane', 15)}<span>${esc(w.name)}</span></button>`).join('') + wax.map(([w, i]) => `<button type="button" class="b-row" data-cmd="edit" data-index="${i}" title="${esc(w.name)} bearbeiten">${icon(w.type === 'point' ? 'wpoint' : w.type === 'bks' ? 'bks' : 'waxis', 15)}<span>${esc(w.name)}</span></button>`).join('')) : ''}
    ${inserts.length ? fold('Eingefügte Teile', inserts.length, inserts.map(ins => {
        const ib = insertBodies(ins.id), st = lastBuild && lastBuild.status[ins.id];
        const allHidden = ib.length && ib.every(b => (bodyInfo(b) || {}).hidden);
        return `<div class="b-line"><div class="b-row static" data-ins="${esc(ins.id)}" title="${esc(ins.file ? fileLabel(ins.file) : 'eingebettet')} · Rechtsklick für Befehle">${icon('insert', 15)}<span data-nm>${esc(ins.name)}</span>${st && !st.ok ? `<em class="b-err">${esc(st.error)}</em>` : st && st.warn ? `<em class="b-err">${esc(st.warn)}</em>` : ''}</div><button type="button" class="iconbtn" data-cmd="toggle-comp" data-id="${esc(ins.id)}" title="${allHidden ? 'Einblenden' : 'Ausblenden'}">${icon(allHidden ? 'eyeOff' : 'eye', 16)}</button>${ins.file ? `<button type="button" class="iconbtn" data-cmd="insert-open" data-id="${esc(ins.id)}" title="Teil öffnen und bearbeiten">${icon('folder', 14)}</button>` : ''}<button type="button" class="iconbtn" data-cmd="insert-remove" data-id="${esc(ins.id)}" title="Aus der Baugruppe entfernen">${icon('close', 14)}</button></div>
          <div class="b-nest">${ib.map(bodyRow).join('') || '<p class="b-empty">keine Körper</p>'}</div>`;
      }).join('') + '<div class="btns b-actions"><button type="button" class="chip" data-cmd="inserts-refresh">Teile aktualisieren</button></div>') : ''}
    ${comps.length ? fold('Komponenten', comps.length, comps.filter(c => !c.parent).map(compNode).join('')) : ''}
    ${fold('Körper', loose.length, loose.length ? loose.map(bodyRow).join('') : `<p class="b-empty">${ids.length ? 'Alle in Komponenten' : 'Noch keiner'}</p>`)}
    ${fold('Skizzen', rootSketches.length, rootSketches.length ? rootSketches.map(sketchRow).join('') : `<p class="b-empty">${sketches.length ? 'Alle in Komponenten' : 'Noch keine'}</p>`)}
    ${kontaktUi ? kontaktUi.browserOrdner(fold) : ''}
    </div></details>
    ${props ? `<div class="b-propbox"><div class="b-head sub">Eigenschaften</div>${props}</div>` : ''}`;
  browserAuswahl();
}
/* Aufgeklappte Komponenten im Browser (für diese Sitzung): oberste Ebene offen, darunter zu; Auswahl in
   der Ansicht klappt den Pfad auf */
var offeneComps = new Map(); // var: renderBrowser läuft schon vor dieser Zeile
function compOffen(c) { return offeneComps && offeneComps.has(c.id) ? offeneComps.get(c.id) : !c.parent; }
$('#browser').addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.compfold) offeneComps.set(d.dataset.compfold, d.open); }, true);
/* Auswahl in der Ansicht → Browser markiert die Körperzeile und klappt ihren Pfad auf (Komponenten, Ordner) */
var browserSel = [];
function browserAuswahl(ids = browserSel) {
  browserSel = ids || [];
  const B = $('#browser');
  B.querySelectorAll('.b-row.sel, .b-row.pfad').forEach(r => r.classList.remove('sel', 'pfad'));
  let erste = null;
  for (const id of browserSel) {
    const r = B.querySelector(`.b-row[data-body="${CSS.escape(id)}"]`);
    if (!r) continue;
    r.classList.add('sel');
    erste = erste || r;
    for (let d = r.parentElement; d && d !== B; d = d.parentElement) {
      if (d.tagName !== 'DETAILS') continue;
      if (!d.open) d.open = true;
      if (d.dataset.compfold && offeneComps) { offeneComps.set(d.dataset.compfold, true); const cr = d.querySelector(':scope > summary .b-row[data-comp]'); if (cr) cr.classList.add('pfad'); }
    }
  }
  if (erste) erste.scrollIntoView({ block: 'nearest' });
}
/* Browser verschieben (Kopf ziehen) und Breite merken; Doppelklick auf den Kopf setzt ihn zurück */
{
  const B = $('#browser'), KEY = 'cc.browser';
  const lage = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } })();
  const anwenden = () => {
    B.style.left = lage.x ? `${lage.x}px` : ''; B.style.top = lage.y ? `${lage.y}px` : '';
    B.style.maxHeight = lage.y ? `calc(100% - ${lage.y}px)` : ''; // unten bleibt er in der Ansicht
    if (lage.w) B.style.width = `${lage.w}px`;
  };
  const sichern = () => { try { localStorage.setItem(KEY, JSON.stringify(lage)); } catch (_) { /* egal */ } };
  anwenden();
  B.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.target.closest('#browser > .b-head:first-child')) return;
    const vr = $('#viewport').getBoundingClientRect(), x0 = e.clientX - (lage.x || 0), y0 = e.clientY - (lage.y || 0);
    const move = ev => {
      lage.x = Math.round(Math.max(0, Math.min(vr.width - 60, ev.clientX - x0)));
      lage.y = Math.round(Math.max(0, Math.min(vr.height - 40, ev.clientY - y0)));
      anwenden();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); sichern(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    e.preventDefault();
  });
  B.addEventListener('dblclick', e => { if (e.target.closest('#browser > .b-head:first-child')) { delete lage.x; delete lage.y; delete lage.w; B.style.width = ''; anwenden(); sichern(); } });
  // Breite über den Griff rechts unten (CSS resize)
  if (window.ResizeObserver) new ResizeObserver(() => { const w = Math.round(B.getBoundingClientRect().width); if (B.style.width && w && w !== lage.w) { lage.w = w; sichern(); } }).observe(B);
}

/* Menüband an Dokumentart und aktive Komponente anpassen (setupUiBars ist erst weiter unten angelegt) */
var uiBarsReady = false;
function ribbonSync(prefer) { if (uiBarsReady) syncRibbon(prefer); }
function renderAll() {
  // Einheit des Dokuments (Dokumenteinstellungen) gilt, solange es offen ist – auch nach Öffnen, Neu, Rückgängig
  if (setDocUnit(doc.kind === 'drawing' ? null : doc.einheit)) onFps(0);
  refreshWorkPlanes();
  renderTimeline();
  renderBrowser();
  renderSketchesInView();
  updateHint();
}

$('#browser').addEventListener('change', e => {
  if (e.target.matches('[data-cfgsel]')) { activateConfig(e.target.value); return; }
  if (e.target.matches('[data-docunit]')) {
    if (editing || editor) { toast('Erst den laufenden Befehl abschließen, dann die Einheit ändern.'); renderBrowser(); return; }
    pushHistory();
    doc.einheit = e.target.value;
    afterDocChange();
    toast(`Einheiten des Dokuments: ${UNIT}. Werte bleiben gleich, nur die Anzeige rechnet um.`);
    return;
  }
  const t = e.target.closest('[data-bodyprop]');
  if (t) setBodyProp(t.dataset.id, t.dataset.bodyprop, t.value);
});
$('#browser').addEventListener('input', e => {
  const t = e.target.closest('[data-bodyprop="color"]');
  if (!t) return;
  const map = bodyColorMap();
  map[t.dataset.id] = t.value;
  vp.setBodyColors(map);
});
let bodyClickT = 0;
$('#browser').addEventListener('click', e => {
  const r = e.target.closest('div.b-row[data-body]');
  if (!r || r.querySelector('.b-rename')) return;
  clearTimeout(bodyClickT);
  bodyClickT = setTimeout(() => { openBody = openBody === r.dataset.body ? null : r.dataset.body; renderBrowser(); }, 230);
});
/* Kontextmenü im Browser: Körper und Skizzen */
function showCtx(html, x, y) {
  let m = $('#ctxmenu');
  if (!m) { m = document.createElement('div'); m.id = 'ctxmenu'; m.className = 'ctxmenu'; document.body.appendChild(m); }
  m.innerHTML = html;
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
}
$('#browser').addEventListener('click', e => { if (e.target.closest('summary [data-cmd]')) e.preventDefault(); }, true);
$('#browser').addEventListener('contextmenu', e => {
  const br = e.target.closest('[data-body]');
  const sr = e.target.closest('[data-cmd="edit"][data-index]');
  const cr = e.target.closest('[data-comp]');
  const ir = e.target.closest('[data-ins]');
  if (!br && !sr && !cr && !ir) return;
  e.preventDefault();
  if (ir) {
    const id = ir.dataset.ins, ins = (doc.inserts || []).find(x => x.id === id), nj = doc.features.filter(f => (f.type === 'joint' || f.type === 'align') && f.comp === id).length;
    showCtx(`<button type="button" data-cmd="insert-dupj" data-id="${esc(id)}"${nj ? '' : ' disabled'}>${icon('joint', 15)} Mit Gelenken duplizieren${nj ? ` (${nj})` : ''}</button>
      <button type="button" data-cmd="insert-dup" data-id="${esc(id)}">${icon('insert', 15)} Duplizieren (daneben)</button>
      ${ins && ins.file ? `<button type="button" data-cmd="insert-open" data-id="${esc(id)}">${icon('folder', 15)} Teil öffnen</button>` : ''}
      <button type="button" data-cmd="toggle-comp" data-id="${esc(id)}">${icon('eye', 15)} Aus-/Einblenden</button>
      <hr><button type="button" data-cmd="insert-remove" data-id="${esc(id)}" class="danger">${icon('trash', 15)} Aus der Baugruppe entfernen</button>`, e.clientX, e.clientY);
    return;
  }
  if (cr) {
    const id = cr.dataset.comp, active = doc.activeComp === id;
    showCtx(`${active ? '' : `<button type="button" data-cmd="comp-edit" data-id="${esc(id)}">${icon('component', 15)} Bearbeiten</button>`}<button type="button" data-cmd="comp-activate" data-id="${active ? '' : esc(id)}">${icon('component', 15)} ${active ? 'Oberste Ebene aktivieren' : 'Aktivieren'}</button>
      <button type="button" data-cmd="comp-new-in" data-id="${esc(id)}">${icon('component', 15)} Neue Komponente darin</button>
      <button type="button" data-cmd="comp-rename" data-id="${esc(id)}">${icon('sketch', 15)} Umbenennen</button>
      <button type="button" data-cmd="comp-als-teil" data-id="${esc(id)}">${icon('save', 15)} Als eigenes Teil speichern …</button>
      <button type="button" data-cmd="toggle-comp" data-id="${esc(id)}">${icon('eye', 15)} Aus-/Einblenden</button>
      <hr><button type="button" data-cmd="comp-dissolve" data-id="${esc(id)}" class="danger">${icon('close', 15)} Auflösen</button>`, e.clientX, e.clientY);
    return;
  }
  if (br) {
    const id = br.dataset.body, b = bodyInfo(id) || {};
    showCtx(`<button type="button" data-cmd="body-props" data-id="${esc(id)}">${icon('measure', 15)} Eigenschaften</button>
      <button type="button" data-cmd="body-rename" data-id="${esc(id)}">${icon('sketch', 15)} Umbenennen</button>
      <button type="button" data-cmd="body-material" data-id="${esc(id)}">${icon('body', 15)} Material und Farbe</button>
      ${doc.features.some(f => f.id === id) ? `<hr><button type="button" data-cmd="body-replacebase" data-id="${esc(id)}" title="Das Feature, das diesen Körper erzeugt, durch einen Grundkörper (Quader, Zylinder, Kugel, Torus) ersetzen – alle folgenden Features bauen sich daran neu auf">${icon('pbox', 15)} Durch Grundkörper ersetzen …</button>` : ''}
      <hr><button type="button" data-cmd="toggle-body" data-id="${esc(id)}">${icon(b.hidden ? 'eye' : 'eyeOff', 15)} ${b.hidden ? 'Einblenden' : 'Ausblenden'}</button>
      <button type="button" data-cmd="body-isolate" data-id="${esc(id)}">${icon('eye', 15)} Isolieren</button>
      <button type="button" data-cmd="bodies-show-all">${icon('eye', 15)} Alle einblenden</button>
      ${!id.includes('/') && doc.activeComp && !(((doc.components || []).find(c => c.id === doc.activeComp) || { bodies: [] }).bodies.includes(id)) ? `<hr><button type="button" data-cmd="body-to-active" data-id="${esc(id)}">${icon('component', 15)} In aktive Komponente verschieben</button>` : ''}
      ${!id.includes('/') && (doc.components || []).some(c => c.bodies.includes(id)) ? `${doc.activeComp ? '' : '<hr>'}<button type="button" data-cmd="body-to-root" data-id="${esc(id)}">${icon('component', 15)} Aus Komponente lösen</button>` : ''}
      ${importKoerper(id) ? `<hr><button type="button" data-cmd="body-features" data-id="${esc(id)}" title="Erkennt eine Extrusion (Platte, Profil mit Bohrungen) und baut sie als Skizze + Extrusion in der Zeitleiste neu auf">${icon('extrude', 15)} Als Skizze und Extrusion aufbauen</button>
        <button type="button" data-cmd="body-blech" data-id="${esc(id)}" title="Gebogenes Blechteil als Grundlasche und Biegungen neu aufbauen: Kontur, Ausschnitte, Biegewinkel und Radien in der Zeitleiste änderbar">${icon('smbase', 15)} Als Blechteil aufbauen</button>
        <button type="button" data-cmd="import-features" data-id="${esc(id)}" title="Jeden Körper dieses STEP-Imports als Blech oder Skizze + Extrusion aufbauen">${icon('extrude', 15)} Alle Teile dieses Imports aufbauen</button>` : ''}
      <hr><button type="button" data-cmd="export-body-stl" data-id="${esc(id)}">${icon('stl', 15)} Als STL speichern</button>`, e.clientX, e.clientY);
  } else {
    const i = +sr.dataset.index, f = doc.features[i];
    showCtx(`<button type="button" data-cmd="edit" data-index="${i}">${icon('sketch', 15)} Skizze bearbeiten</button>
      <button type="button" data-cmd="toggle-sketch" data-id="${f.id}">${icon(sketchVisible(f) ? 'eyeOff' : 'eye', 15)} ${sketchVisible(f) ? 'Ausblenden' : 'Einblenden'}</button>
      <button type="button" data-cmd="tl-dxf" data-index="${i}">${icon('dxf', 15)} Als DXF speichern</button>
      <hr><button type="button" data-cmd="delete" data-index="${i}" class="danger">${icon('trash', 15)} Löschen</button>`, e.clientX, e.clientY);
  }
});

/* Eigenschaften-Fenster eines Körpers */
async function openBodyProps(id) {
  let r;
  try { r = await kernel.props(id); } catch (err) { toast('Eigenschaften nicht verfügbar: ' + err.message); return; }
  const b = bodyInfo(id) || {}, mat = MATERIALS[b.material] || MATERIALS.none;
  const mass = mat.rho ? r.volume / 1000 * mat.rho : null;
  const L = r.bbox[1].map((v, k) => v - r.bbox[0][k]);
  let p = $('#propsdlg');
  if (!p) { p = document.createElement('section'); p.id = 'propsdlg'; p.className = 'propsdlg'; $('#viewport').appendChild(p); }
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  p.innerHTML = `<header>${icon('measure', 16)}<b>Eigenschaften</b><span>${esc(b.name || id)}</span><button type="button" class="iconbtn" data-cmd="props-close" aria-label="Schließen">${icon('close', 14)}</button></header>
    <div class="pbody">
      <h5>Physisch</h5><dl>${row('Material', esc(mat.label))}${mat.rho ? row('Dichte', `${fmt(mat.rho, 3)} g/cm³`) : ''}${row('Masse', mass != null ? fmtMass(mass) : '– (Material wählen)')}${row('Volumen', fmtVol(r.volume, 3))}${row('Oberfläche', UF === 1 ? `${fmt(r.area / 100, 3)} cm²` : fmtArea(r.area, 3))}</dl>
      <h5>Begrenzungsrahmen</h5><dl>${row('Länge (X)', fmtLenU(L[0], 2))}${row('Breite (Y)', fmtLenU(L[1], 2))}${row('Höhe (Z)', fmtLenU(L[2], 2))}</dl>
      <h5>Schwerpunkt</h5><dl>${['X', 'Y', 'Z'].map((a, k) => row(a, fmtLenU(r.com[k], 2))).join('')}</dl>
      <h5>Topologie</h5><dl>${row('Flächen', r.faces)}${row('Kanten', r.edges)}</dl>
    </div>`;
  p.hidden = false;
}

$('#browser').addEventListener('dblclick', e => {
  clearTimeout(bodyClickT);
  const r = e.target.closest('[data-body]');
  if (r) renameBody(r.dataset.body, r);
});

/* ---------------- Meldungen ---------------- */
let toastT = 0;
function toast(t, ms = 3200) {
  const el = $('#toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, ms);
}
$('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

/* ---------------- Tastatur ---------------- */
document.addEventListener('keydown', e => {
  const typing = e.target instanceof Element && e.target.closest('input, textarea, select');
  const k = e.key.toLowerCase();
  // S öffnet die Befehlssuche (Modell und Skizze)
  if (!typing && k === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && (mode === 'model' || mode === 'sketch')) { e.preventDefault(); openCmdSearch(); return; }
  if (mode === 'sketch' && editor && !typing) {
    if (editor.onKey(e)) { e.preventDefault(); return; }
  }
  /* Mitte dreht: Strg + 1…7 Normansichten, Strg + 8 senkrecht auf die gewählte Fläche */
  if (navPrefs.nav === 'mitte' && (e.ctrlKey || e.metaKey) && !e.altKey && !typing && /^[1-8]$/.test(e.key) && (mode === 'model' || mode === 'sketch')) {
    e.preventDefault();
    if (e.key === '8') runCmd(mode === 'sketch' ? 'sketch-lookat' : modelSel.faces.length ? 'sel-lookat' : 'lookat');
    else vp.view(['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'][+e.key - 1]);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y' && !typing) { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); e.shiftKey ? openSaveDialog() : cmdSave(); }
    else if (k === 'o') { e.preventDefault(); cmdOpen(); }
    else if (k === 'n' && !typing) { e.preventDefault(); cmdNew(); }
    return;
  }
  if (e.key === 'Escape') {
    if (mode === 'measure') { closeMeasure(); return; }
    if (mode === 'interfere') { closeInterference(); return; }
    if (mode === 'overhang') { closeOverhang(); return; }
    if (mode === 'explode') { closeExplode(); return; }
    if (mode === 'draftan') { closeDraftAnalysis(); return; }
    if (mode === 'framesim') { closeFrameSim(); return; }
    if (mode === 'solidsim') { closeSolidSim(); return; }
    if (mode === 'similar') { closeSimilar(); return; }
    if (mode === 'motion') { closeMotion(); return; }
    if (mode === 'facedxf') { endFaceDXF(); return; }
    if (mode === 'filedlg') { closeFileDialog(); return; }
    if (mode === 'drawing') {
      // Esc beendet nur das laufende Werkzeug (erst den angefangenen Schritt), die Zeichnung bleibt offen
      if (drawing.placing) { drawing.placing = null; renderDrawRibbon(); return; }
      if (drawing.dimMode && drawing.draft.pts.length) { drawing.draft = { pts: [] }; renderDrawing(); return; }
      if (drawing.secMode && drawing.secMode.step) { drawing.secMode = { step: 0 }; renderDrawing(); return; }
      if (drawing.setMode && drawing.setMode.pts.length) { drawing.setMode.pts = []; drawing.setMode.view = null; renderDrawing(); return; }
      if (drawing.secMode || drawing.setMode || drawing.dimMode || drawing.detailMode || drawing.breakMode || drawing.noteMode) {
        drawing.secMode = null; drawing.setMode = null; drawing.dimMode = false; drawing.detailMode = null; drawing.breakMode = null; drawing.noteMode = null; drawing.draft = { pts: [] };
        renderDrawRibbon(); renderDrawing();
      }
      return;
    }
    if (mode === 'component') { closeComponentDialog(); return; }
    if (mode === 'kontakt') { kontaktUi.schliesse(); return; }
    if (mode === 'antrieb') { antriebSchliessen(false); return; }
    if (editing && editing.pickTarget) { editing.pickTarget = null; vp.setPickMode(pickModeFor(editing.feature)); showProfiles(); updateHint(); renderFeatureDialog(true, false); scheduleBuild(0); return; }
    if (mode === 'feature' || mode === 'pickPlane') cancelEditing();
    // Querschnittsanalyse: Esc schließt den Dialog, der Schnitt bleibt (wie OK)
    if (mode === 'model' && !$('#dialog').hidden && $('#dialog [data-cmd="section-ok"]')) { runCmd('section-ok'); return; }
    if (mode === 'model' && selCount()) clearModelSel();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'model' && !typing && selCount()) { e.preventDefault(); deleteModelSel(); return; }
  if (e.key === 'Enter' && mode === 'filedlg' && !(typing && typing.tagName === 'TEXTAREA')) {
    const ok = $('#dialog:not([hidden]) footer .btn.primary');
    if (ok) { e.preventDefault(); ok.click(); }
    return;
  }
  if (e.key === 'Enter') {
    // Enter übernimmt den Befehl, auch direkt aus einem Wertefeld
    if (mode === 'feature' && (!typing || typing.type === 'number' || (typing.dataset && typing.dataset.nx) || typing.tagName === 'SELECT')) { e.preventDefault(); if (typing && typing.dataset && typing.dataset.nx) typing.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(commitEditing, 0); }
    return;
  }
  if (typing) return;
  /* Mit F-Tasten: F2 Verschieben, F3 Zoomen, F4 Orbit (Werkzeug mit links, noch einmal = aus), F5 vorherige Ansicht, F6 Startansicht */
  if (navPrefs.nav === 'ftasten' && /^F[2-6]$/.test(e.key) && (mode === 'model' || mode === 'sketch')) {
    e.preventDefault();
    if (e.key === 'F2') runCmd('nav-pan'); else if (e.key === 'F3') runCmd('nav-zoom'); else if (e.key === 'F4') runCmd('nav-orbit');
    else if (e.key === 'F5') vp.prevView(); else runCmd('home');
    return;
  }
  if (mode === 'model') {
    if (k === 'e') startFeature('extrude');
    else if (k === 'd') startFeature('revolve');
    else if (k === 'f') { if (navPrefs.nav === 'mitte') vp.fit(); else startFeature('fillet'); }
    else if (k === 'h') startFeature('hole');
    else if (k === 'm') startFeature('move');
    else if (k === 'q') startFeature('presspull');
    else if (k === 'j') runCmd('joint');
    else if (k === 'i') startMeasure();
    else if (e.key === 'Home' || e.key === 'F6') { e.preventDefault(); vp.fit(); }
  }
});

/* ---------------- Start ---------------- */
$('#docname').value = doc.name;
$('#docname').addEventListener('change', e => {
  pushHistory();
  doc.name = e.target.value.trim().slice(0, 60) || defaultName('Teil1');
  e.target.value = doc.name;
  store();
  renderBrowser();
});
// Einstellungen (Farbschema, Größe): Schema so früh wie möglich, damit nichts hell aufblitzt
applyTheme();
const { setAiEnabled, aiRun } = setupAiBridge({ get doc() { return doc; }, get lastBuild() { return lastBuild; }, get editing() { return editing; }, get building() { return !$('#busy').hidden; }, get kernel() { return kernel; }, get vp() { return vp; }, applyParams: (...a) => applyParams(...a), bodyName: (...a) => bodyName(...a), pushHistory: () => pushHistory(), renderAll: () => renderAll(), scheduleBuild: (...a) => scheduleBuild(...a), store: () => store(), toast: (...a) => toast(...a), undo: () => undo() });
const { openPrefs, prefs: prefsNow } = setupPrefs({ esc: (...a) => esc(...a), toast: (...a) => toast(...a), onDiag: () => statusNeu(), editing: () => !!(editing || editor), onLang: () => { store(); location.reload(); }, onNav: (nav, revZoom) => { navPrefs.nav = nav; navPrefs.revZoom = revZoom; vp.setNavScheme(nav, revZoom); renderNavbar(); updateHint(); }, onAi: on => { setAiEnabled(on); toast(on ? 'Claude-Anbindung an: cantcodecad wartet auf Aufträge vom MCP-Server.' : 'Claude-Anbindung aus.'); } });
if (prefsNow.ai) setAiEnabled(true);
$('#prefsbtn').innerHTML = icon('gear', 18);
$('#menu').innerHTML = `
  <button type="button" data-cmd="new" title="Neu: Einzelteil, Baugruppe oder Zeichnung">${icon('file', 18)}<span>Neu</span></button>
  <button type="button" data-cmd="open" title="Öffnen (Strg+O)">${icon('folder', 18)}<span>Öffnen</span></button>
  <button type="button" data-cmd="save" title="Speichern (Strg+S)">${icon('save', 18)}<span>Speichern</span></button>
  <button type="button" data-cmd="saveas" title="Speichern unter (Strg+Umschalt+S)">${icon('saveas', 18)}<span>Speichern unter</span></button>
  <span class="sep"></span>
  <button type="button" data-cmd="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">${icon('undo', 18)}</button>
  <button type="button" data-cmd="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen">${icon('redo', 18)}</button>`;
renderRibbon();
uiBarsReady = true;
renderSketchbar();
renderNavbar();
setMode('model');
renderAll();
updateUndoButtons();
window.cantcodecad = { get cog() { return cog; }, draftState, rendering, blechpaket, compAlsTeil, get doc() { return doc; }, vp, kernel, get editor() { return editor; }, get editing() { return editing; }, get drawing() { return drawing; }, get lastBuild() { return lastBuild; }, get speicher() { return speicher; }, open: openProjectFile, moveFeature, toggleSuppress, applyParams, openParams, paramValues, aiRun };
speicherAnfordern();
if ((doc.inserts || []).length || doc.features.some(f => f.type === 'derive')) refreshInserts(true);
const { openStart } = setupStart({ get doc() { return doc; }, docKind: () => inferKind(doc), esc: (...a) => esc(...a), newDocument, newDrawing, openDialog: () => cmdOpen(), openPath: p => openProjectFile(p) });
if (startOnLaunch()) openStart();
// zuletzt eine Zeichnung offen: nach dem ersten Aufbau wieder im Arbeitsbereich Zeichnung
if (doc.kind === 'drawing') { const dd = doc; whenBuilt(null, 60000).then(() => { if (doc === dd && mode === 'model' && hasBody()) { openDrawing(); renderBrowser(); } }); }

/* Offline: Schriften und opentype einmal vorab laden, damit der lokale Zwischenspeicher (vendor/) vollständig ist */
setTimeout(() => {
  import('./sketch/text.js').then(t => Object.values(t.FONTS).forEach(f => fetch(f.url).catch(() => {}))).catch(() => {});
  fetch('/cdn/npm/opentype.js@1.3.4/dist/opentype.module.js').catch(() => {});
}, 6000);
