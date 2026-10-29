// Skizzen-Editor: Zeichnen, Auswählen, Ziehen, Bedingungen und Bemaßungen.
// Arbeitet direkt auf dem Skizzen-Feature (Punkte, Kurven, Regeln) und
// lässt nach jeder Änderung den Solver laufen. Was sich nicht lösen lässt,
// wird zurückgenommen.
import * as THREE from 'three';
import { toWorld, toLocal } from '../doc.js';
import {
  pointMap, curveMap, addPoint, addLine, addCircle, addArc, addRule, addRect, deleteItems,
  measure, curvePolyline, curveDistance, curvatureComb, curvePointIds, makeTangentRule, ruleRefs, DIMENSION_TYPES, RULE_LABELS,
  addEllipse, addSpline, splinePoints, ellipsePoint, conicAt, curveEndOut, addSplineHandle, removeSplineHandle
} from './model.js';
import { autoConstraints, autoBemassung, breakAt, refillet, trimAt, trimPreview, filletCorner, addSlot, addArcSlot, addPolygon, addCenterRect, mirrorItems, chainFrom, offsetPreview, applyOffset, offsetDimPoints, extendAt, extendPreview, chamferCorner, endTangent, tangentArcGeom, signedPolyDist, createPattern, setPatternCount, patternOf, transformItems, copyItems, rotateFn, addText, selectionPoints } from './commands.js';
import { loadFont, textOutline, placeText, hitText, FONTS, bindTextPaths } from './text.js';
import { solveSketch } from './solver.js';
import { evalExpr as evalParamExpr, evalLen, isExpr, U_ANGLE, U_LEN } from '../params.js';
import { fmtLen, parseLen, UNIT } from '../units.js';
import { DEC } from '../i18n.js';
import { punktMaterial } from '../punkte.js';
import { sketchRegions } from './profiles.js';
import { projectEdge, matchSketchRef } from './project.js';

const COL = {
  geo: 0x2563eb, done: 0x1f2933, cons: 0xd9822b, sel: 0xf97316, hover: 0x7cb2ff, preview: 0xf97316,
  ref: 0x8b5cf6, trim: 0xe0362c, dim: 0x3b4652, axisX: 0xd2443b, axisY: 0x3b9a4a, grid: 0x2563eb, point: 0x1d4ed8, fixed: 0xc2412b, region: 0x60a5fa
};
const TOOLS = {
  line: 'Linie', cline: 'Mittelpunktlinie', rect: 'Rechteck', rectc: 'Mittelpunkt-Rechteck', rect3: 'Rechteck mit 3 Punkten', circle: 'Kreis', circle2: 'Kreis mit 2 Punkten', circle3: 'Kreis mit 3 Punkten', tcircle2: 'Kreis tangential an 2 Linien', tcircle3: 'Kreis tangential an 3 Linien', arc: 'Bogen', carc: 'Bogen mit Mittelpunkt', polygon: 'Vieleck (einbeschrieben)', polygonc: 'Vieleck (umschrieben)', polygone: 'Vieleck über Kante', slot: 'Langloch (Mitte zu Mitte)', slotov: 'Langloch (Gesamtlänge)', slotc: 'Langloch (Mittelpunkt)', slotarc: 'Bogen-Langloch (Mittelpunkt)', slotarc3: 'Bogen-Langloch (3 Punkte)', point: 'Punkt',
  trim: 'Stutzen', brk: 'Unterbrechen', fillet: 'Verrunden', mirror: 'Spiegeln', dim: 'Bemaßung',
  offset: 'Versatz', extend: 'Verlängern', chamfer: 'Fase', tarc: 'Tangentialbogen', cpattern: 'Kreismuster', lpattern: 'Lineares Muster',
  move: 'Verschieben', rotate: 'Drehen', scale: 'Skalieren', text: 'Text', ellipse: 'Ellipse', spline: 'Spline', cvspline: 'Spline (Steuerpunkte)', conic: 'Konische Kurve', blend: 'Verschmelzungskurve', autocons: 'Abhängigkeiten automatisch', autodim: 'Auto-Abhängigkeit von Bezug', project: 'Projizieren', intersect: 'Schnittkurve'
};
const DRAW_TOOLS = new Set(['ellipse', 'spline', 'cvspline', 'conic', 'line', 'cline', 'rect', 'rectc', 'rect3', 'circle', 'circle2', 'circle3', 'tcircle2', 'tcircle3', 'arc', 'carc', 'polygon', 'polygonc', 'polygone', 'slot', 'slotov', 'slotc', 'slotarc', 'slotarc3', 'point', 'tarc', 'cpattern', 'lpattern', 'move', 'rotate', 'scale', 'text']);
const PICK_TOOLS = new Set(['mirror', 'cpattern', 'lpattern', 'move', 'rotate', 'scale']);
/* Werte beim Zeichnen eintippen: Felder je Werkzeug, Tab wechselt, Enter übernimmt */
const VIN_FIELDS = { line: ['Länge', 'Winkel'], rect: ['Breite', 'Höhe'], rectc: ['Breite', 'Höhe'], circle: ['Ø'], polygon: ['Ø'], polygonc: ['Ø'] };
const GEO_KEYS = ['points', 'curves', 'rules', 'helpers', 'patterns', 'texts'];
const niceDown = x => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
const nice = x => { const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
export const fmtNum = (x, d = 2) => { const m = 10 ** d, r = Math.round(x * m) / m; return String(Object.is(r, -0) ? 0 : r).replace('.', DEC); };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const GLYPH = { horizontal: '—', vertical: '|', parallel: '∥', perpendicular: '⊥', tangent: 'T', equal: '=', coincident: '◉', pointOnCurve: '◌', midpoint: 'M', concentric: '◎', fix: 'Fix', symmetric: '⇔', collinear: '≡' };

/* Rechner für Eingaben wie "60/2+5" oder "breite/2" (Benutzerparameter, siehe params.js) */
export function evalExpr(s, vars = {}) { return evalParamExpr(s, vars); }

export class SketchEditor {
  constructor(vp, feature, cb = {}) {
    this.vp = vp;
    this.f = feature;
    this.pl = feature.plane;
    this.cb = cb;
    this.tool = null;
    this.ts = {};
    this.sel = new Set();
    this.hover = null;
    this.cursor = null;
    this.snapGrid = true;
    this.showGlyphs = false;
    this.showComb = false;
    // Sichtbarkeit Skizzenpalette: Punkte, Bemaßungen, projizierte und Konstruktionsgeometrie
    this.show = { points: true, dims: true, projected: true, cons: true };
    this.consMode = false;
    this.polySides = 6;
    this.conicRho = 0.5;
    this.patternCount = 6;
    this.filletR = null;
    this.chamferD = null;
    this.textH = 5;
    this.textFont = 'sans';
    this.copyMode = false;
    if (!feature.texts) feature.texts = [];
    (feature.texts || []).forEach(t => loadFont(t.font, () => this.render()));
    this.undoStack = [];
    this.redoStack = [];
    this.status = { ok: true, dof: null, conflicts: [], redundant: [] };
    this.drag = null;
    this.group = new THREE.Group();
    this.dyn = new THREE.Group();
    vp.scene.add(this.group, this.dyn);
    this.layer = el('div', 'sk-layer');
    vp.overlay.appendChild(this.layer);
    this.cursorLabel = el('div', 'sk-cursor');
    this.cursorLabel.hidden = true;
    vp.overlay.appendChild(this.cursorLabel);
    this.htmlItems = [];
    this.htmlEls = new Map();
    this.initLayerEvents();
    vp.setSketchHandler(this);
    this.status = solveSketch(this.f);
    this.render();
    const box = new THREE.Box3();
    pointMap(this.f).forEach(p => { if (!p.virtual) box.expandByPoint(new THREE.Vector3(...toWorld(this.pl, p.x, p.y))); });
    vp.focusPlane(this.pl, box);
    this.emit();
  }

  destroy() {
    this.closeEditor();
    this.vp.hoverEdge(null);
    this.vp.setSketchHandler(null);
    this.vp.disposeGroup(this.group);
    this.vp.disposeGroup(this.dyn);
    this.vp.scene.remove(this.group, this.dyn);
    this.layer.remove();
    this.cursorLabel.remove();
    this.vp.dirty = true;
  }

  /* ---------- Zustand ---------- */
  pm() { return pointMap(this.f); }
  cm() { return curveMap(this.f); }
  snapshot() { const o = {}; GEO_KEYS.forEach(k => { o[k] = this.f[k] || []; }); return JSON.stringify(o); }
  restore(s) { const o = JSON.parse(s); GEO_KEYS.forEach(k => { this.f[k] = o[k] || []; }); }
  msg(t) { if (this.cb.onMessage) this.cb.onMessage(t); }
  emit() {
    if (!this.cb.onChange) return;
    const cm = this.cm(), pm = this.pm();
    const texts = this.f.texts || [];
    const selKinds = [...this.sel].map(id => (cm.has(id) ? cm.get(id).type : pm.has(id) ? 'point' : texts.some(t => t.id === id) ? 'text' : this.f.rules.some(r => r.id === id) ? 'rule' : '?'));
    const tsel = texts.find(t => this.sel.has(t.id));
    let pat = null;
    for (const id of this.sel) { const P = patternOf(this.f, id); if (P) { pat = { id: P.id, count: P.count, kind: P.kind }; break; } }
    const sp = this.splineAtPoint();
    this.cb.onChange({ splPt: sp ? { handle: !!(sp.c.tan && sp.c.tan[sp.pid]) } : null, dof: this.status.dof, conflicts: this.status.conflicts, ok: this.status.ok, tool: this.tool, sel: selKinds, consMode: this.consMode, snapGrid: this.snapGrid, showGlyphs: this.showGlyphs, regions: this.regionCount || 0, polySides: this.polySides, patternCount: this.patternCount, textH: this.textH, textFont: this.textFont, textSel: tsel ? { h: tsel.h, font: tsel.font } : null, pattern: pat, copyMode: this.copyMode, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  /* Änderung auf einer Kopie ausprobieren; nur übernehmen, wenn der Solver zustimmt. */
  vars() { try { return (this.cb.params && this.cb.params()) || {}; } catch (_) { return {}; } }
  change(fn, { label = 'Die Änderung', check = true, allowRedundant = false } = {}) {
    const before = this.snapshot();
    const draft = JSON.parse(before);
    const oldRules = new Set(draft.rules.map(r => r.id));
    const extra = fn(draft);
    if (extra === false) return false;
    if (JSON.stringify(Object.fromEntries(GEO_KEYS.map(k => [k, draft[k] || []]))) === before) return extra === undefined ? true : extra;
    const res = solveSketch(draft);
    const newIds = draft.rules.filter(r => !oldRules.has(r.id)).map(r => r.id);
    if (check) {
      if (res.conflicts.length) { this.msg(`${label} widerspricht den vorhandenen Bedingungen.`); return false; }
      if (!allowRedundant && res.redundant.some(id => newIds.includes(id))) { this.msg(`${label} ist schon durch andere Bedingungen festgelegt.`); return false; }
      if (!res.ok) { this.msg(`${label} lässt sich so nicht lösen.`); return false; }
    }
    GEO_KEYS.forEach(k => { this.f[k] = draft[k] || []; });
    this.undoStack.push(before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.status = res;
    this.render();
    this.emit();
    return extra === undefined ? true : extra;
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.afterRestore();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.afterRestore();
  }
  afterRestore() {
    const alive = new Set([...this.f.points.map(p => p.id), ...this.f.curves.map(c => c.id), ...this.f.rules.map(r => r.id), ...(this.f.texts || []).map(t => t.id)]);
    [...this.sel].forEach(id => { if (!alive.has(id)) this.sel.delete(id); });
    this.status = solveSketch(this.f);
    this.render();
    this.emit();
  }

  /* ---------- Werkzeuge ---------- */
  /* eingetippter Wert eines Feldes (Rechnungen und Parameter erlaubt), sonst null */
  vinVal(i) {
    const v = this.vin && this.vin.vals[i];
    if (!v || !v.trim()) return null;
    // Längen in der Anzeigeeinheit (Einstellungen → Einheiten), der Winkel der Linie in Grad
    const s = String(v).replace(/,/g, '.'), x = this.tool === 'line' && i === 1 ? evalExpr(s, this.vars()) : parseLen(s, this.vars()).v;
    return isFinite(x) ? x : null;
  }
  /* Endpunkt aus eingetippten Werten; Richtung/Vorzeichen kommen vom Zeiger */
  typedPoint(t, a, p) {
    const dx = p[0] - a[0], dy = p[1] - a[1], dist = Math.hypot(dx, dy);
    if (t === 'line') {
      const L = this.vinVal(0) ?? dist, an = this.vinVal(1);
      const ang = an != null ? an * Math.PI / 180 : Math.atan2(dy, dx);
      return [a[0] + L * Math.cos(ang), a[1] + L * Math.sin(ang)];
    }
    if (t === 'rect' || t === 'rectc') {
      const k = t === 'rectc' ? 0.5 : 1, sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
      const w = this.vinVal(0), h = this.vinVal(1);
      return [w != null ? a[0] + sx * Math.abs(w) * k : p[0], h != null ? a[1] + sy * Math.abs(h) * k : p[1]];
    }
    if (t === 'circle' || t === 'polygon' || t === 'polygonc') {
      const D = this.vinVal(0);
      if (D == null) return p;
      const u = dist > 1e-9 ? [dx / dist, dy / dist] : [1, 0];
      return [a[0] + u[0] * Math.abs(D) / 2, a[1] + u[1] * Math.abs(D) / 2];
    }
    return p;
  }
  /* Enter nach Eingabe: Geometrie mit genau diesen Maßen anlegen, Maße als Bemaßung */
  commitTyped() {
    const t = this.tool, st = this.ts.start;
    if (!st || !this.cursor) return;
    // nahezu waagrecht/senkrecht gezeichnete Linie bekommt die Bedingung, auch mit getippter Länge
    const inf = t === 'line' && this.vinVal(1) == null ? this.inferLine(st, this.snapAt(this.cursor)) : null;
    const p = this.typedPoint(t, st.uv, inf ? inf.uv : this.cursor);
    const L = this.vinVal(0), M = this.vinVal(1);
    this.vin = null;
    if (Math.hypot(p[0] - st.uv[0], p[1] - st.uv[1]) < 1e-9) return;
    if (t === 'line') {
      let endId = null;
      const ok = this.change(d => {
        const a = this.resolvePoint(d, st), b = addPoint(d, p[0], p[1]).id;
        const l = addLine(d, a, b, this.consMode);
        if (L != null) addRule(d, { type: 'distance', a: l.id, value: Math.abs(L), off: this.dimOff(d, l.id) });
        if (M != null) { const m = ((M % 360) + 360) % 360; if (m === 0 || m === 180) addRule(d, { type: 'horizontal', l: l.id }); else if (m === 90 || m === 270) addRule(d, { type: 'vertical', l: l.id }); }
        else if (inf && inf.h) addRule(d, { type: 'horizontal', l: l.id });
        else if (inf && inf.v) addRule(d, { type: 'vertical', l: l.id });
        endId = b;
      }, { label: 'Die Linie' });
      if (ok) { const q = this.pm().get(endId); this.ts = { start: { uv: q ? [q.x, q.y] : p, pointId: endId } }; }
      this.renderDyn();
      return;
    }
    if (t === 'rect') {
      if (Math.abs(p[0] - st.uv[0]) < 1e-9 || Math.abs(p[1] - st.uv[1]) < 1e-9) return;
      this.change(d => {
        const r = addRect(d, st.uv[0], st.uv[1], p[0], p[1], this.consMode);
        this.attachPoint(d, r.points[0].id, st);
        this.rectDims(d, r.lines, L, M);
      }, { label: 'Das Rechteck' });
    } else if (t === 'rectc') {
      this.change(d => {
        const r = addCenterRect(d, st.uv, p, { c: this.resolvePoint(d, st) });
        if (!r.ok) { this.msg(r.msg); return false; }
        if (this.consMode) r.rect.lines.forEach(l => { l.cons = true; });
        this.rectDims(d, r.rect.lines, L, M);
      }, { label: 'Das Rechteck' });
    } else if (t === 'circle') {
      const r = Math.hypot(p[0] - st.uv[0], p[1] - st.uv[1]);
      this.change(d => { const c = addCircle(d, this.resolvePoint(d, st), r, this.consMode); if (L != null) addRule(d, { type: 'diameter', c: c.id, value: Math.abs(L) }); }, { label: 'Der Kreis' });
    } else if (t === 'polygon' || t === 'polygonc') {
      const g = this.polyGeom(t, st.uv, p);
      this.change(d => {
        const r = addPolygon(d, g.c, g.v, this.polySides, { c: this.resolvePoint(d, st) }, t === 'polygonc' ? 'out' : 'in');
        if (!r.ok) { this.msg(r.msg); return false; }
        if (this.consMode) d.curves.forEach(c => { if (r.lines.includes(c.id)) c.cons = true; });
      }, { label: 'Das Vieleck' });
    }
    this.ts = {};
    this.renderDyn();
  }
  /* Auto-Abhängigkeit von Bezug (KI schlägt Varianten vor; hier ein fester Ablauf): erst die automatischen
     Abhängigkeiten, Bezugspunkt fixieren (außer Ursprung), dann Größenmaße (Kreise, Bögen, Linienlängen) und Lagemaße
     waagrecht/senkrecht ab dem Bezug. Jedes Maß bleibt nur, wenn es einen Freiheitsgrad nimmt (Solver: dof sinkt, nichts
     redundant); Werte = aktuelle Lage, die Skizze bewegt sich nicht. */
  autoDimFrom(datum) {
    let n = null;
    const ok = this.change(d => {
      n = autoBemassung(d, datum, Math.max(1e-3, this.tol() * 0.05));
      return n ? undefined : false;
    }, { label: 'Auto-Abhängigkeit von Bezug' });
    if (ok && n) this.msg(`Ergänzt: ${n.hv + n.coincident + n.tangent} Abhängigkeiten, ${n.dims} Maße${n.fixed ? ', Bezugspunkt fixiert' : ''} – ${n.dof === 0 ? 'Skizze vollständig bestimmt.' : `noch ${n.dof} Freiheitsgrad${n.dof === 1 ? '' : 'e'} (z. B. Splines, Ellipsen).`}`);
    this.lastAuto = n;
    return n;
  }
  setTool(t) {
    this.vin = null;
    if (t === 'intersect') { this.runIntersect(); t = null; }
    if (t === 'autocons') {
      // sofort ausführen: Abhängigkeiten automatisch ergänzen
      let n = null;
      this.change(d => { n = autoConstraints(d, Math.max(1e-3, this.tol() * 0.05)); }, { label: 'Automatische Abhängigkeiten' });
      if (n) this.msg(`Ergänzt: ${n.hv} waagrecht/senkrecht, ${n.coincident} deckungsgleich, ${n.tangent} tangential.`);
      this.lastAuto = n;
      t = null;
    }
    this.tool = t && TOOLS[t] ? t : null;
    this.ts = {};
    this.hoverBody = null;
    this.vp.hoverEdge(null);
    if (PICK_TOOLS.has(this.tool)) {
      // vorher gewählte Elemente werden gespiegelt bzw. vervielfältigt
      const pm = this.pm(), cm = this.cm();
      this.ts.items = [...this.sel].filter(id => (cm.has(id) && !cm.get(id).virtual && !cm.get(id).ref) || (pm.has(id) && !cm.has(id) && !pm.get(id).virtual));
      (this.f.texts || []).forEach(t => { if (this.sel.has(t.id)) this.ts.items.push(t.id); });
      if (this.tool !== 'mirror' && !this.ts.items.length) this.msg(`Für „${TOOLS[this.tool]}“ zuerst die Elemente auswählen (ohne Werkzeug anklicken, Shift für mehrere).`);
    }
    if (this.hover && this.tool && DRAW_TOOLS.has(this.tool)) { this.hover = null; this.render(); }
    this.renderDyn();
    this.emit();
  }
  setCopyMode(v) { this.copyMode = !!v; this.emit(); }
  /* Schrifthöhe/Schrift: gilt für gewählte Texte, sonst für den nächsten neuen Text */
  /* Gewählten Text an die gewählte Kurve legen (Text auf Pfad), lösen oder die Seite wechseln */
  textToPath(mode) {
    const texts = (this.f.texts || []).filter(t => this.sel.has(t.id));
    if (!texts.length) { this.msg('Erst einen Text wählen (und für „Auf Kurve“ zusätzlich eine Kurve).'); return; }
    const cm = this.cm(), curve = [...this.sel].find(id => cm.has(id));
    if (mode === 'on' && !curve) { this.msg('Zum Text zusätzlich die Kurve wählen (Strg/Umschalt-Klick).'); return; }
    const ids = texts.map(t => t.id);
    this.change(d => d.texts.forEach(t => {
      if (!ids.includes(t.id)) return;
      if (mode === 'on') { t.path = curve; delete t.offset; }
      else if (mode === 'off') { delete t.path; delete t.flip; delete t.offset; }
      else if (mode === 'flip' && t.path) t.flip = !t.flip;
    }), { check: false });
  }
  setTextProps({ h, font }) {
    const ids = (this.f.texts || []).filter(t => this.sel.has(t.id)).map(t => t.id);
    if (h != null && h > 0) this.textH = h;
    if (font && FONTS[font]) { this.textFont = font; loadFont(font, () => this.render()); }
    if (ids.length) this.change(d => { d.texts.forEach(t => { if (ids.includes(t.id)) { if (h != null && h > 0) t.h = h; if (font && FONTS[font]) t.font = font; } }); }, { check: false });
    else this.emit();
  }
  /* Anzahl eines bestehenden Musters ändern */
  setSelPatternCount(n) {
    let P = null;
    for (const id of this.sel) { P = patternOf(this.f, id); if (P) break; }
    n = Math.round(Number(n));
    if (!P || !(n >= 2) || n === P.count) return;
    const pid = P.id;
    this.change(d => { const r = setPatternCount(d, pid, n); if (!r.ok) { this.msg(r.msg); return false; } }, { label: 'Das Muster', allowRedundant: true });
    // Auswahl auf die Quelle legen, damit die Anzahl weiter änderbar bleibt
    const Q = (this.f.patterns || []).find(x => x.id === pid);
    this.sel = new Set(Q ? Q.items.filter(id => this.cm().has(id) || this.pm().has(id)) : []);
    this.render();
    this.emit();
  }
  setPatternCount(n) {
    n = Math.round(Number(n));
    if (!(n >= 2)) return;
    this.patternCount = Math.min(200, n);
    this.renderDyn();
    this.emit();
  }
  /* ρ der konischen Kurve: für das Werkzeug, und bei einer gewählten konischen Kurve auch für diese */
  setConicRho(v) {
    const r = Number(v);
    if (!(r > 0 && r < 1)) return;
    this.conicRho = r;
    const cm = this.cm(), ids = [...this.sel].filter(id => { const c = cm.get(id); return c && c.type === 'spline' && c.conic != null; });
    if (ids.length) this.change(d => { d.curves.forEach(c => { if (ids.includes(c.id)) c.conic = r; }); }, { label: 'ρ der konischen Kurve' });
    this.renderDyn();
    this.emit();
  }
  /* Genau ein Stützpunkt eines Splines (Kurve durch Punkte) gewählt → { c, pid } */
  splineAtPoint() {
    if (this.sel.size !== 1) return null;
    const pid = [...this.sel][0], c = this.f.curves.find(x => x.type === 'spline' && !x.cv && x.conic == null && x.pts.includes(pid));
    return c ? { c, pid } : null;
  }
  /* Tangentengriff am gewählten Stützpunkt ein- oder ausschalten (Griff aktivieren) */
  toggleSplineHandle(on = null) {
    const sp = this.splineAtPoint();
    if (!sp) { this.msg('Einen Stützpunkt eines Splines wählen.'); return false; }
    const has = !!(sp.c.tan && sp.c.tan[sp.pid]);
    if (on === has) return true;
    this.change(d => { const c = d.curves.find(x => x.id === sp.c.id); if (has) removeSplineHandle(d, c, sp.pid); else addSplineHandle(d, c, sp.pid); }, { label: has ? 'Griff entfernt' : 'Tangentengriff', check: false });
    this.emit();
    return true;
  }
  setPolySides(n) {
    n = Math.round(Number(n));
    if (!(n >= 3)) return;
    this.polySides = Math.min(64, n);
    this.renderDyn();
    this.emit();
  }
  toggleConsMode() {
    // ausgewählte Kurven umschalten (auch projizierte: dann zählen sie zum Profil), sonst den Modus für neue Kurven
    const curves = [...this.sel].filter(id => this.f.curves.some(c => c.id === id));
    if (curves.length) {
      this.change(d => { d.curves.forEach(c => { if (curves.includes(c.id)) { if (c.cons) delete c.cons; else c.cons = true; } }); }, { check: false });
      return;
    }
    this.consMode = !this.consMode;
    this.emit();
  }
  setSnapGrid(v) { this.snapGrid = !!v; this.emit(); }
  setShowGlyphs(v) { this.showGlyphs = !!v; this.render(); this.emit(); }
  setShowComb(v) { this.showComb = !!v; this.render(); this.emit(); }
  setShow(k, v) { if (k in this.show) { this.show[k] = !!v; this.render(); this.emit(); } }
  /* ausgeblendete Kurven (projizierte bzw. Konstruktionsgeometrie) werden weder gezeichnet noch angeklickt */
  hiddenCurve(c) { return (c.ref && !this.show.projected) || (!c.ref && c.cons && !c.virtual && !this.show.cons); }

  tol() { return this.vp.uvPerPixel(this.pl, ...(this.cursor || [0, 0])) * 8; }
  gridStep() { return Math.max(0.01, nice(this.vp.uvPerPixel(this.pl, ...(this.cursor || [0, 0])) * 6)); }

  /* Fang: Skizzenpunkte → Körperpunkte → Skizzenkurven → Körperkanten → Achsen → Raster.
     Körpergeometrie wird erst beim Benutzen in die Skizze projiziert (resolvePoint). */
  snapAt(uv, { exclude = new Set(), curves = true, body = true } = {}) {
    const tol = this.tol(), pm = this.pm();
    let best = null, bd = tol;
    pm.forEach(p => {
      if (p.id === 'OX' || p.id === 'OY' || exclude.has(p.id)) return;
      const d = Math.hypot(p.x - uv[0], p.y - uv[1]);
      if (d < bd) { bd = d; best = { uv: [p.x, p.y], pointId: p.id }; }
    });
    if (best) return best;
    if (body) {
      const b = this.bodyPointAt(uv);
      if (b) return { uv: b.uv.slice(), bodyPoint: b };
    }
    if (curves) {
      let bc = null, bcd = tol;
      this.f.curves.forEach(c => {
        if (exclude.has(c.id)) return;
        const d = curveDistance(c, pm, uv[0], uv[1]);
        if (d < bcd) { bcd = d; bc = c; }
      });
      if (bc) return { uv: projectOnCurve(bc, pm, uv), curveId: bc.id };
      if (body) {
        const hit = this.bodyEdgeAt(uv);
        if (hit) return { uv: hit.uv, bodyEdge: hit.info, edgeIndex: hit.index, proj: hit.proj, seg: hit.seg };
      }
      if (Math.abs(uv[1]) < tol) return { uv: [this.gridRound(uv[0]), 0], curveId: 'AX' };
      if (Math.abs(uv[0]) < tol) return { uv: [0, this.gridRound(uv[1])], curveId: 'AY' };
    }
    return { uv: [this.gridRound(uv[0]), this.gridRound(uv[1])] };
  }
  gridRound(v) { if (!this.snapGrid) return v; const s = this.gridStep(); return Math.round(v / s) * s; }
  snapped(sn) { return !!(sn && (sn.pointId || sn.curveId || sn.bodyPoint || sn.bodyEdge)); }

  /* ---------- Körpergeometrie ---------- */
  screenOf(uv) { return this.vp.toScreen(toWorld(this.pl, uv[0], uv[1])); }

  /* Eckpunkte und Kreismittelpunkte des Körpers, einmal je Modellstand berechnet */
  bodySnaps() {
    const m = this.vp.model;
    if (!m) return [];
    if (this.bodyCache && this.bodyCache.model === m) return this.bodyCache.list;
    const list = [], seen = new Set();
    const key = a => a.map(v => Math.round(v * 1e4)).join(',');
    const add = (world, uv, center = false) => {
      const k = key(world) + (center ? 'c' : '');
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ world, uv: uv || toLocal(this.pl, world).slice(0, 2), center });
    };
    m.data.edges.forEach(e => {
      const closed = Math.hypot(e.p0[0] - e.p1[0], e.p0[1] - e.p1[1], e.p0[2] - e.p1[2]) < 1e-6;
      if (!closed) { add(e.p0); add(e.p1); }
      if (e.type === 'CIRCLE') {
        const pr = projectEdge(this.pl, e);
        if (pr && (pr.kind === 'circle' || pr.kind === 'arc')) add(toWorld(this.pl, pr.c[0], pr.c[1]), pr.c.slice(0, 2), true);
      }
    });
    this.bodyCache = { model: m, list };
    return list;
  }

  /* Körperpunkt in Zeigernähe – entweder seine Projektion oder (wenn sichtbar) er selbst */
  bodyPointAt(uv) {
    const list = this.bodySnaps();
    if (!list.length) return null;
    const s = this.screenOf(uv), px = 10;
    const cands = [];
    list.forEach(b => {
      const q = this.screenOf(b.uv);
      const d1 = Math.hypot(q[0] - s[0], q[1] - s[1]);
      let d2 = Infinity;
      if (!b.center) { const w = this.vp.toScreen(b.world); d2 = Math.hypot(w[0] - s[0], w[1] - s[1]); }
      if (d1 < px || d2 < px) cands.push({ b, d1, d2 });
    });
    cands.sort((a, b) => Math.min(a.d1, a.d2) - Math.min(b.d1, b.d2));
    for (const c of cands) if (c.d1 < px || this.vp.isVisible(c.b.world)) return c.b;
    return null;
  }

  /* Alle Körperkanten, auf die Skizzenebene abgebildet (einmal je Modellstand).
     Gefangen wird in der Ebene – sichtbare und verdeckte Kanten gleichermaßen. */
  bodyEdges() {
    const m = this.vp.model;
    if (!m) return [];
    if (this.edgeCache && this.edgeCache.model === m) return this.edgeCache.list;
    const pl = this.pl, list = [];
    m.data.edges.forEach((info, index) => {
      const proj = this.edgeProjection(info);
      if (!proj || proj.kind === 'point') return;
      const d = info.mid;
      const depth = Math.abs((d[0] - pl.o[0]) * pl.n[0] + (d[1] - pl.o[1]) * pl.n[1] + (d[2] - pl.o[2]) * pl.n[2]);
      list.push({ info, index, proj, depth });
    });
    this.edgeCache = { model: m, list };
    return list;
  }
  /* Nächste abgebildete Körperkante; bei Gleichstand die, die näher an der Skizzenebene liegt */
  bodyEdgeAt(uv, tol = this.tol() * 1.4) {
    let best = null;
    for (const e of this.bodyEdges()) {
      const q = nearestOnProj(e.proj, uv);
      if (!q) continue;
      const d = Math.hypot(q.uv[0] - uv[0], q.uv[1] - uv[1]);
      if (d > tol) continue;
      if (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) <= 1e-6 && e.depth < best.e.depth)) best = { e, d, q };
    }
    return best ? { info: best.e.info, index: best.e.index, proj: best.e.proj, uv: best.q.uv, seg: best.q.seg } : null;
  }

  /* Körperkante → 2D-Geometrie auf der Skizzenebene; was sich nicht exakt abbilden
     lässt (Ellipsen, Freiformkanten), wird als Linienzug angenähert. */
  edgeProjection(info) {
    const pr = projectEdge(this.pl, info);
    if (pr) return pr;
    const m = this.vp.model;
    if (!m) return null;
    const pos = m.data.edgePositions, pts = [];
    for (let v = info.start; v < info.start + info.count; v++) {
      const uv = toLocal(this.pl, [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]]);
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(uv[0] - last[0], uv[1] - last[1]) > 1e-6) pts.push([uv[0], uv[1]]);
    }
    if (pts.length < 2) return pts.length ? { kind: 'point', p: pts[0] } : null;
    let out = pts;
    if (pts.length > 65) { out = []; for (let i = 0; i <= 64; i++) out.push(pts[Math.round(i / 64 * (pts.length - 1))]); }
    return { kind: 'poly', pts: out };
  }

  /* Bezugspunkt an dieser Stelle (vorhandenen nehmen oder anlegen) */
  ensureRefPoint(d, uv, { standalone = true } = {}) {
    const same = d.points.find(p => p.ref && Math.hypot(p.x - uv[0], p.y - uv[1]) < 1e-6);
    if (same) return same.id;
    const p = addPoint(d, uv[0], uv[1]);
    if (standalone) {
      const prior = this.cb.priorSketches ? this.cb.priorSketches() : [];
      p.ref = matchSketchRef(this.pl, { kind: 'point', p: uv }, prior) || { kind: 'edge' };
    } else p.ref = true;
    return p.id;
  }

  /* Projektion einer Körperkante in der Skizze d sicherstellen → { curve } | { segs } | { point } */
  ensureProjection(d, info, pr = this.edgeProjection(info)) {
    if (!pr) return null;
    if (pr.kind === 'point') return { point: this.ensureRefPoint(d, pr.p) };
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5;
    const P = uv => this.ensureRefPoint(d, uv, { standalone: false });
    if (pr.kind === 'poly') {
      const r4 = a => a.map(v => v.toFixed(4)).join(',');
      const key = `${pr.pts.length}|${r4(pr.pts[0])}|${r4(pr.pts[pr.pts.length >> 1])}|${r4(pr.pts[pr.pts.length - 1])}`;
      const have = d.curves.filter(c => c.ref && c.ref.poly === key).sort((a, b) => a.ref.seg - b.ref.seg);
      if (have.length) return { segs: have.map(c => c.id) };
      const closed = near(pr.pts[0], pr.pts[pr.pts.length - 1]);
      const ids = pr.pts.map((uv, i) => (closed && i === pr.pts.length - 1 ? null : P(uv)));
      if (closed) ids[ids.length - 1] = ids[0];
      const segs = [];
      for (let i = 0; i < ids.length - 1; i++) {
        if (ids[i] === ids[i + 1]) continue;
        const l = addLine(d, ids[i], ids[i + 1], true);
        l.ref = { kind: 'edge', poly: key, seg: i };
        segs.push(l.id);
      }
      return { segs };
    }
    const prior = this.cb.priorSketches ? this.cb.priorSketches() : [];
    const ref = matchSketchRef(this.pl, pr, prior) || { kind: 'edge' };
    const pm = pointMap(d);
    const same = d.curves.find(c => {
      if (!c.ref) return false;
      if (ref.kind === 'sketch' && c.ref.kind === 'sketch') return c.ref.sketch === ref.sketch && c.ref.curve === ref.curve;
      if (c.type === 'line' && pr.kind === 'line') { const a = pm.get(c.p1), b = pm.get(c.p2); return (near([a.x, a.y], pr.a) && near([b.x, b.y], pr.b)) || (near([a.x, a.y], pr.b) && near([b.x, b.y], pr.a)); }
      if (c.type === pr.kind && (c.type === 'circle' || c.type === 'arc')) {
        const cp = pm.get(c.c);
        if (!near([cp.x, cp.y], pr.c) || Math.abs(c.r - pr.r) > 1e-5) return false;
        if (c.type === 'circle') return true;
        const s = pm.get(c.s), e = pm.get(c.e);
        return near([s.x, s.y], pr.s) && near([e.x, e.y], pr.e);
      }
      return false;
    });
    if (same) return { curve: same.id };
    let k;
    if (pr.kind === 'line') k = addLine(d, P(pr.a), P(pr.b), true);
    else if (pr.kind === 'circle') k = addCircle(d, P(pr.c), pr.r, true);
    else k = addArc(d, P(pr.c), P(pr.s), P(pr.e), true);
    k.ref = ref;
    return { curve: k.id };
  }

  /* Kurve, an die ein gefangener Punkt gebunden wird (Skizzenkurve oder projizierte Körperkante) */
  snapCurve(d, sn) {
    if (sn.curveId) return sn.curveId;
    if (!sn.bodyEdge) return null;
    const pj = this.ensureProjection(d, sn.bodyEdge, sn.proj);
    if (!pj) return null;
    if (pj.curve) return pj.curve;
    if (pj.segs) return pj.segs[Math.min(pj.segs.length - 1, sn.seg || 0)];
    return null;
  }

  /* Punkt für eine neue Kurve: vorhandenen nehmen oder anlegen (mit Fang an Kurve oder Körper) */
  /* Lage eingetippter Maße: außen neben der Kante mit Hilfslinien und Pfeilen, nicht auf der Linie.
     Linie: Seite links der Zeichenrichtung (bei Waagrechten oben); Rechteck: Breite an der unteren, Höhe an der linken Kante. */
  dimOff(d, lineId, side) {
    const pm = pointMap(d), c = curveMap(d).get(lineId), a = pm.get(c.p1), b = pm.get(c.p2);
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, gap = this.vp.uvPerPixel(this.pl, a.x, a.y) * 32;
    let n = [-(b.y - a.y) / L, (b.x - a.x) / L];
    if (side && n[0] * side[0] + n[1] * side[1] < 0) n = [-n[0], -n[1]];
    return [n[0] * gap, n[1] * gap];
  }
  rectDims(d, lines, L, M) {
    const pm = pointMap(d), mid = l => { const a = pm.get(l.p1), b = pm.get(l.p2); return [(a.x + b.x) / 2, (a.y + b.y) / 2]; };
    // lines[0]/[2] waagrecht, [1]/[3] senkrecht (addRect); gleich lang über Horizontal/Vertikal
    const hor = [lines[0], lines[2]].sort((p, q) => mid(p)[1] - mid(q)[1])[0], ver = [lines[1], lines[3]].sort((p, q) => mid(p)[0] - mid(q)[0])[0];
    if (L != null) addRule(d, { type: 'distance', a: hor.id, value: Math.abs(L), off: this.dimOff(d, hor.id, [0, -1]) });
    if (M != null) addRule(d, { type: 'distance', a: ver.id, value: Math.abs(M), off: this.dimOff(d, ver.id, [-1, 0]) });
  }
  resolvePoint(d, sn) {
    if (sn.pointId) return sn.pointId;
    if (sn.bodyPoint) return this.ensureRefPoint(d, sn.bodyPoint.uv);
    const p = addPoint(d, sn.uv[0], sn.uv[1]);
    const c = this.snapCurve(d, sn);
    if (c) addRule(d, { type: 'pointOnCurve', p: p.id, c });
    return p.id;
  }
  /* Einen schon angelegten Punkt an die Fangstelle binden */
  attachPoint(d, pid, sn) {
    const target = sn.pointId || (sn.bodyPoint ? this.ensureRefPoint(d, sn.bodyPoint.uv) : null);
    if (target) { if (target !== pid) addRule(d, { type: 'coincident', a: pid, b: target }); return; }
    const c = this.snapCurve(d, sn);
    if (c) addRule(d, { type: 'pointOnCurve', p: pid, c });
  }

  /* Was liegt unter dem Zeiger? */
  pickAt(uv, { points = true } = {}) {
    { const pm0 = this.pm(); bindTextPaths(this.f, c => curvePolyline(c, pm0, 64)); }
    const tol = this.tol(), pm = this.pm();
    let best = null, bd = tol;
    if (points) pm.forEach(p => {
      if (p.id === 'OX' || p.id === 'OY') return;
      const d = Math.hypot(p.x - uv[0], p.y - uv[1]);
      if (d < bd) { bd = d; best = { kind: 'point', id: p.id }; }
    });
    if (best) return best;
    bd = tol;
    this.f.curves.forEach(c => {
      if (this.hiddenCurve(c)) return;
      const d = curveDistance(c, pm, uv[0], uv[1]);
      if (d < bd) { bd = d; best = { kind: 'curve', id: c.id }; }
    });
    if (best) return best;
    for (const t of this.f.texts || []) {
      const a = pm.get(t.p), o = a && textOutline(t.text, t.h, t.font);
      if (o && hitText(t, [a.x, a.y], o, uv, tol * 0.5)) return { kind: 'text', id: t.id };
    }
    if (Math.abs(uv[1]) < tol * 0.7) return { kind: 'curve', id: 'AX' };
    if (Math.abs(uv[0]) < tol * 0.7) return { kind: 'curve', id: 'AY' };
    return null;
  }

  /* Verschmelzungskurve: zwei Kurven nahe an ihren Enden anklicken – dazwischen ein Spline mit Steuerpunkten
     (kubisch: Ende, Ende + Richtung·L/3, …), tangential angeschlossen und über Tangential-Regeln so gehalten */
  blendClick(uv) {
    const h = this.pickAt(uv, { points: false });
    const c = h && h.kind === 'curve' ? this.cm().get(h.id) : null;
    const end = c && curveEndOut(c, this.pm(), uv);
    if (!end) { this.msg('Linie, Bogen oder offenen Spline nahe an seinem Ende anklicken.'); return; }
    if (!this.ts.first) { this.ts.first = { cid: c.id, end }; this.msg('Jetzt die zweite Kurve nahe an ihrem Ende anklicken.'); this.renderDyn(); return; }
    const A = this.ts.first;
    if (A.cid === c.id && A.end.id === end.id) return;
    const E1 = A.end.p, E2 = end.p, L = Math.hypot(E2[0] - E1[0], E2[1] - E1[1]);
    if (L < 1e-6) { this.msg('Die beiden Enden liegen aufeinander.'); return; }
    const k = L / 3, C1 = [E1[0] + A.end.d[0] * k, E1[1] + A.end.d[1] * k], C2 = [E2[0] + end.d[0] * k, E2[1] + end.d[1] * k];
    this.change(d => {
      const p1 = addPoint(d, C1[0], C1[1]), p2 = addPoint(d, C2[0], C2[1]);
      const s = addSpline(d, [A.end.id, p1.id, p2.id, end.id], false, this.consMode, true);
      addRule(d, makeTangentRule(d, s.id, A.cid));
      addRule(d, makeTangentRule(d, s.id, c.id));
    }, { label: 'Die Verschmelzungskurve' });
    this.ts = {};
    this.renderDyn();
  }

  /* Ecke aus genau zwei Linien in Zeigernähe (für Verrunden) */
  cornerAt(uv) {
    const tol = this.tol() * 1.5, pm = this.pm();
    let best = null, bd = tol;
    pm.forEach(p => {
      if (p.virtual && p.id !== 'O') return;
      const d = Math.hypot(p.x - uv[0], p.y - uv[1]);
      if (d >= bd) return;
      const lines = this.f.curves.filter(c => c.type === 'line' && !c.ref && (c.p1 === p.id || c.p2 === p.id));
      const others = this.f.curves.some(c => c.type !== 'line' && [c.c, c.s, c.e].includes(p.id));
      if (lines.length === 2 && !others) { bd = d; best = p.id; }
    });
    return best;
  }
  /* Vorgabe-Radius: der zuletzt benutzte, wenn er passt, sonst ein runder Wert */
  filletRadius(pid) {
    const pm = this.pm(), P = pm.get(pid);
    const lines = this.f.curves.filter(c => c.type === 'line' && (c.p1 === pid || c.p2 === pid));
    if (lines.length !== 2) return null;
    const far = l => pm.get(l.p1 === pid ? l.p2 : l.p1);
    const A = far(lines[0]), B = far(lines[1]);
    const la = Math.hypot(A.x - P.x, A.y - P.y), lb = Math.hypot(B.x - P.x, B.y - P.y);
    const cos = Math.max(-1, Math.min(1, ((A.x - P.x) * (B.x - P.x) + (A.y - P.y) * (B.y - P.y)) / (la * lb || 1)));
    const rmax = Math.min(la, lb) * Math.tan(Math.acos(cos) / 2);
    if (this.filletR && this.filletR < rmax * 0.98) return this.filletR;
    return niceDown(rmax * 0.3);
  }

  /* ---------- Zeiger ---------- */
  onPointerDown(e) {
    if (this.editing) return;
    const uv = this.vp.planeUV(e, this.pl);
    if (!uv) return;
    this.cursor = uv;
    if (this.tool) return;
    const hit = this.pickAt(uv);
    if (!hit || hit.id === 'O' || hit.id === 'AX' || hit.id === 'AY') return;
    const pm = this.pm(), cm = this.cm();
    if ((hit.kind === 'point' && pm.get(hit.id).ref) || (hit.kind === 'curve' && cm.get(hit.id).ref)) return;
    if (hit.kind === 'text') {
      const t = this.f.texts.find(x => x.id === hit.id), a = pm.get(t.p);
      this.drag = { kind: 'text', id: t.p, start: uv, a0: [a.x, a.y], before: this.snapshot(), moved: false };
      return;
    }
    if (hit.kind === 'point') {
      // Stützpunkt mit Tangentengriff: der Griffpunkt wandert mit
      const sp = this.f.curves.find(c => c.tan && c.tan[hit.id]), hp = sp && pm.get(sp.tan[hit.id].h), p0 = pm.get(hit.id);
      this.drag = { kind: 'point', id: hit.id, start: uv, before: this.snapshot(), moved: false, ...(hp ? { handle: { id: hp.id, dx: hp.x - p0.x, dy: hp.y - p0.y } } : {}) };
    } else {
      const c = cm.get(hit.id);
      if (c.type === 'line') {
        const a = pm.get(c.p1), b = pm.get(c.p2);
        this.drag = { kind: 'line', c, start: uv, a0: [a.x, a.y], b0: [b.x, b.y], before: this.snapshot(), moved: false };
      } else {
        this.drag = { kind: 'radius', c, start: uv, before: this.snapshot(), moved: false };
      }
    }
  }

  onPointerMove(e) {
    this.lastEvent = e;
    const uv = this.vp.planeUV(e, this.pl);
    if (!uv) return;
    this.cursor = uv;
    if (this.labelDrag) { this.moveLabel(uv); return; }
    if (this.drag && e.buttons & 1) {
      const d = this.drag;
      const moved = Math.hypot(uv[0] - d.start[0], uv[1] - d.start[1]) / this.vp.uvPerPixel(this.pl, ...uv);
      if (!d.moved && moved < 4) return;
      d.moved = true;
      let drag;
      if (d.kind === 'point') drag = { points: [{ id: d.id, x: uv[0], y: uv[1] }, ...(d.handle ? [{ id: d.handle.id, x: uv[0] + d.handle.dx, y: uv[1] + d.handle.dy }] : [])] };
      else if (d.kind === 'text') drag = { points: [{ id: d.id, x: d.a0[0] + uv[0] - d.start[0], y: d.a0[1] + uv[1] - d.start[1] }] };
      else if (d.kind === 'line') {
        const dx = uv[0] - d.start[0], dy = uv[1] - d.start[1];
        drag = { points: [{ id: d.c.p1, x: d.a0[0] + dx, y: d.a0[1] + dy }, { id: d.c.p2, x: d.b0[0] + dx, y: d.b0[1] + dy }] };
      } else {
        const cp = this.pm().get(d.c.c);
        drag = { radius: { id: d.c.id, r: Math.max(0.01, Math.hypot(uv[0] - cp.x, uv[1] - cp.y)) } };
      }
      const res = solveSketch(this.f, { drag });
      if (res.ok) this.status = { ...this.status, dof: res.dof };
      this.render();
      return;
    }
    if (e.buttons) return;
    // Vorschau der Werkzeuge und Hervorhebung (Zeichenwerkzeuge fangen in renderDyn)
    const t = this.tool;
    const sketchHit = (!t || t === 'dim' || t === 'mirror') ? this.pickAt(uv) : (t === 'trim' || t === 'brk' || t === 'offset' || t === 'extend') ? this.pickAt(uv, { points: false }) : null;
    if (!t || t === 'dim' || t === 'mirror') {
      this.hoverBody = sketchHit || (t === 'mirror' && !this.ts.axis) ? null : this.bodyPointAt(uv);
      const edge = !sketchHit && !this.hoverBody ? this.bodyEdgeAt(uv) : null;
      this.hoverEdgeHit = edge;
      this.vp.hoverEdge(edge ? edge.index : null);
    } else if (t === 'project') {
      const edge = this.bodyEdgeAt(uv);
      this.hoverEdgeHit = edge;
      this.vp.hoverEdge(edge ? edge.index : null);
    } else { this.hoverEdgeHit = null; if (!DRAW_TOOLS.has(t)) this.vp.hoverEdge(null); }
    const h = (!t || t === 'mirror') ? sketchHit : null;
    const key = h ? h.id : '';
    if (key !== (this.hover ? this.hover.id : '')) { this.hover = h; this.render(); }
    this.renderDyn();
  }

  onPointerUp(e, moved) {
    this.lastEvent = e;
    if (this.labelDrag) { this.endLabelDrag(); return; }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.moved) {
        this.undoStack.push(d.before);
        this.redoStack = [];
        this.status = solveSketch(this.f);
        this.render();
        this.emit();
        return;
      }
    }
    if (moved) return;
    const uv = this.vp.planeUV(e, this.pl);
    if (!uv) return;
    this.cursor = uv;
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!this.tool) {
      // Klick auf eine Körperkante übernimmt sie als Bezug und wählt sie aus
      if (!this.pickAt(uv)) {
        const id = this.projectAt(e, uv);
        if (id) { if (!add) this.sel.clear(); this.sel.add(id); this.render(); this.emit(); return; }
      }
      this.clickSelect(uv, add);
      return;
    }
    this.toolClick(uv, e);
  }

  onPointerLeave() { this.cursor = null; this.cursorLabel.hidden = true; this.renderDyn(); }

  onDblClick() {
    if (this.tool === 'line') { this.ts = {}; this.renderDyn(); return; }
    if (this.tool === 'spline' || this.tool === 'cvspline') { this.finishSpline(false); return; }
    if (this.tool || !this.cursor) return;
    const h = this.pickAt(this.cursor);
    if (h && h.kind === 'text') {
      const t = this.f.texts.find(x => x.id === h.id), a = this.pm().get(t.p);
      this.openTextInput([a.x, a.y], t.text, text => this.change(d => { d.texts.find(x => x.id === h.id).text = text; }, { check: false }));
    }
  }

  /* Eingabefeld für Text direkt im Ansichtsfenster */
  openTextInput(uv, initial, onDone, placeholder) {
    this.closeEditor();
    const inp = el('input', 'sk-input sk-text');
    inp.value = initial || '';
    inp.placeholder = placeholder || 'Text eingeben, Enter';
    inp.spellcheck = false;
    this.layer.appendChild(inp);
    const s = this.vp.toScreen(toWorld(this.pl, uv[0], uv[1]));
    inp.style.transform = `translate(${s[0].toFixed(0)}px, ${(s[1] - 14).toFixed(0)}px) translate(0, -50%)`;
    this.editing = { ruleId: null, inp, text: true };
    inp.focus(); inp.select();
    const finish = ok => {
      if (!this.editing || this.editing.inp !== inp) return;
      const v = inp.value;
      this.closeEditor();
      if (ok && v.trim()) onDone(v);
    };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => setTimeout(() => finish(true), 120));
  }

  clickSelect(uv, add) {
    const h = this.pickAt(uv);
    if (!add) this.sel.clear();
    if (h && h.id !== 'OX' && h.id !== 'OY') {
      if (add && this.sel.has(h.id)) this.sel.delete(h.id); else this.sel.add(h.id);
    }
    this.render();
    this.emit();
  }

  /* ---------- Zeichnen ---------- */
  toolClick(uv, e) {
    const t = this.tool, ts = this.ts;
    if (t === 'project') { this.projectClick(e, uv); return; }
    if (t === 'dim') { this.dimClick(uv); return; }
    if (t === 'trim') { this.trimClick(uv); return; }
    if (t === 'brk') { this.breakClick(uv); return; }
    if (t === 'fillet') { this.filletClick(uv); return; }
    if (t === 'blend') { this.blendClick(uv); return; }
    if (t === 'mirror') { this.mirrorClick(uv); return; }
    if (t === 'offset') { this.offsetClick(uv); return; }
    if (t === 'extend') { this.extendClick(uv); return; }
    if (t === 'chamfer') { this.chamferClick(uv); return; }
    if (t === 'tcircle2' || t === 'tcircle3') { this.tanCircleClick(uv); return; }
    const sn = this.snapAt(uv);
    const done = () => { this.ts = {}; this.renderDyn(); };
    if (t === 'autodim') {
      if (!sn.pointId) { this.msg('Einen Punkt der Skizze oder den Ursprung als Bezug anklicken.'); return; }
      this.autoDimFrom(sn.pointId);
      this.setTool(null);
      return;
    }
    const far = (a, b) => Math.hypot(b.uv[0] - a.uv[0], b.uv[1] - a.uv[1]) > 1e-9;
    if (t === 'tarc') {
      if (!ts.start) {
        const tg = sn.pointId && endTangent(this.f, sn.pointId);
        if (!tg) { this.msg('Am freien Ende einer Linie oder eines Bogens beginnen.'); return; }
        ts.start = { uv: sn.uv, pointId: sn.pointId, tan: tg };
        this.renderDyn();
        return;
      }
      const st = ts.start, g = tangentArcGeom(st.uv, st.tan.dir, sn.uv);
      if (!g || !far(st, sn)) { this.msg('Der Endpunkt liegt in Verlängerung der Kurve.'); return; }
      let endId = null;
      const ok = this.change(d => {
        const e = this.resolvePoint(d, sn);
        if (e === st.pointId) return false;
        const c = addPoint(d, ...g.C);
        const a = g.ccw ? addArc(d, c.id, st.pointId, e, this.consMode) : addArc(d, c.id, e, st.pointId, this.consMode);
        addRule(d, makeTangentRule(d, st.tan.curve, a.id));
        endId = e;
      }, { label: 'Der Bogen' });
      // weiter mit dem nächsten tangentialen Bogen ab dem neuen Ende
      const tg = ok && endId ? endTangent(this.f, endId) : null;
      const q = endId && this.pm().get(endId);
      this.ts = tg && q ? { start: { uv: [q.x, q.y], pointId: endId, tan: tg } } : {};
      this.renderDyn();
      return;
    }
    if (t === 'text') {
      this.openTextInput(sn.uv, '', text => {
        let tid = null;
        this.change(d => { const tx = addText(d, sn.uv, text, { h: this.textH, font: this.textFont }); this.attachPoint(d, tx.p, sn); tid = tx.id; }, { label: 'Der Text' });
        loadFont(this.textFont, () => this.render());
        if (tid) { this.sel = new Set([tid]); this.render(); this.emit(); }
      });
      return;
    }
    if (PICK_TOOLS.has(t) && t !== 'mirror') {
      if (!ts.items || !ts.items.length) { this.msg(`Für „${TOOLS[t]}“ zuerst die Elemente auswählen (ohne Werkzeug anklicken, Shift für mehrere).`); return; }
      const items = ts.items;
      if (t === 'cpattern') {
        let pid = null;
        this.change(d => { const r = createPattern(d, 'circular', items, { centerId: this.resolvePoint(d, sn), count: this.patternCount }); if (!r.ok) { this.msg(r.msg); return false; } pid = r.id; }, { label: 'Das Muster', allowRedundant: true });
        this.sel = new Set(items);
        this.setTool(null);
        return;
      }
      if (t === 'lpattern') {
        if (!ts.start) { ts.start = sn; this.renderDyn(); return; }
        if (!far(ts.start, sn)) return;
        const step = [sn.uv[0] - ts.start.uv[0], sn.uv[1] - ts.start.uv[1]];
        let dim = null;
        this.change(d => { const r = createPattern(d, 'linear', items, { step, count: this.patternCount }); if (!r.ok) { this.msg(r.msg); return false; } dim = r.dimId; }, { label: 'Das Muster', allowRedundant: true });
        this.sel = new Set(items);
        this.setTool(null);
        if (dim) this.openEditor(dim);
        return;
      }
      if (t === 'move') {
        if (!ts.start) { ts.start = sn; this.renderDyn(); return; }
        const v = [sn.uv[0] - ts.start.uv[0], sn.uv[1] - ts.start.uv[1]];
        this.applyXf(items, q => [q[0] + v[0], q[1] + v[1]], 0, this.copyMode || (e && (e.ctrlKey || e.metaKey)));
        return;
      }
      if (t === 'scale') {
        // Basispunkt wählen, Faktor eingeben (Rechnungen wie 1/2 erlaubt)
        const base = sn.uv.slice(), copy = this.copyMode || (e && (e.ctrlKey || e.metaKey));
        this.openTextInput(base, '2', txt => {
          const k = evalExpr(String(txt), this.vars());
          if (!(k > 0) || !isFinite(k)) { this.msg('Bitte einen Faktor größer als 0 eingeben, z. B. 2 oder 1/2.'); return; }
          this.applyScale(items, base, k, copy);
        }, 'Faktor, Enter');
        return;
      }
      if (t === 'rotate') {
        if (!ts.center) { ts.center = sn; this.renderDyn(); return; }
        if (!ts.ref) { if (far(ts.center, sn)) ts.ref = sn; this.renderDyn(); return; }
        const a = this.rotAngle(sn);
        if (Math.abs(a) < 1e-9) return;
        this.applyXf(items, rotateFn(ts.center.uv, a), a, this.copyMode || (e && (e.ctrlKey || e.metaKey)));
        return;
      }
    }
    if (t === 'conic') {
      // konische Kurve: Start, Ende, Scheitelpunkt; ρ aus dem Feld
      if (!ts.start) { ts.start = sn; this.renderDyn(); return; }
      if (!ts.end) { if (far(ts.start, sn)) ts.end = sn; this.renderDyn(); return; }
      if (!far(ts.start, sn) || !far(ts.end, sn)) return;
      const s0 = ts.start, e0 = ts.end, rho = this.conicRho;
      this.change(d => { const a = this.resolvePoint(d, s0), apex = this.resolvePoint(d, sn), b = this.resolvePoint(d, e0); addSpline(d, [a, apex, b], false, this.consMode, false, rho); }, { label: 'Die konische Kurve' });
      return done();
    }
    if (t === 'spline' || t === 'cvspline') {
      // Punkte nacheinander; Doppelklick/Enter beendet, Klick auf den ersten Punkt schließt die Kurve
      if (!ts.pts) ts.pts = [];
      const first = ts.pts[0];
      if (first && ts.pts.length >= 3 && Math.hypot(sn.uv[0] - first.uv[0], sn.uv[1] - first.uv[1]) < this.tol() * 1.2) { this.finishSpline(true); return; }
      const last = ts.pts[ts.pts.length - 1];
      if (last && !far(last, sn)) return;
      ts.pts.push(sn);
      this.renderDyn();
      return;
    }
    if (t === 'ellipse') {
      if (!ts.start) { ts.start = sn; this.renderDyn(); return; }
      if (!ts.end) { if (far(ts.start, sn)) ts.end = sn; this.renderDyn(); return; }
      const B = this.ellipseMinor(uv);
      if (!B) return;
      const c0 = ts.start, a0 = ts.end;
      this.change(d => { addEllipse(d, this.resolvePoint(d, c0), a0.uv, B, this.consMode); }, { label: 'Die Ellipse' });
      return done();
    }
    if (t === 'point') {
      if (sn.pointId) { this.msg('Hier liegt schon ein Punkt.'); return; }
      this.change(d => { this.resolvePoint(d, sn); }, { label: 'Der Punkt' });
      return;
    }
    if (t === 'line') {
      if (!ts.start) { ts.start = sn; this.renderDyn(); return; }
      const end = this.inferLine(ts.start, sn);
      if (!far(ts.start, end)) return;
      let endId = null;
      const ok = this.change(d => {
        const a = this.resolvePoint(d, ts.start), b = this.resolvePoint(d, end);
        if (a === b) return false;
        const l = addLine(d, a, b, this.consMode);
        if (end.h) addRule(d, { type: 'horizontal', l: l.id });
        if (end.v) addRule(d, { type: 'vertical', l: l.id });
        endId = b;
      }, { label: 'Die Linie' });
      if (ok) { const q = this.pm().get(endId); ts.start = end.pointId ? null : { uv: q ? [q.x, q.y] : end.uv, pointId: endId }; }
      this.renderDyn();
      return;
    }
    if (!ts.start) { ts.start = sn; this.renderDyn(); return; }
    const a = ts.start;
    if (t === 'rect') {
      const b = sn;
      if (Math.abs(b.uv[0] - a.uv[0]) < 1e-9 || Math.abs(b.uv[1] - a.uv[1]) < 1e-9) return;
      this.change(d => {
        const r = addRect(d, a.uv[0], a.uv[1], b.uv[0], b.uv[1], this.consMode);
        this.attachPoint(d, r.points[0].id, a);
        this.attachPoint(d, r.points[2].id, b);
      }, { label: 'Das Rechteck' });
      return done();
    }
    if (t === 'rectc') {
      if (Math.abs(sn.uv[0] - a.uv[0]) < 1e-9 || Math.abs(sn.uv[1] - a.uv[1]) < 1e-9) return;
      this.change(d => {
        const r = addCenterRect(d, a.uv, sn.uv, { c: this.resolvePoint(d, a) });
        if (!r.ok) { this.msg(r.msg); return false; }
        if (this.consMode) r.rect.lines.forEach(l => { l.cons = true; });
        if (this.snapped(sn)) {
          const corner = r.rect.points.reduce((b, p) => (Math.hypot(p.x - sn.uv[0], p.y - sn.uv[1]) < Math.hypot(b.x - sn.uv[0], b.y - sn.uv[1]) ? p : b));
          this.attachPoint(d, corner.id, sn);
        }
      }, { label: 'Das Rechteck' });
      return done();
    }
    if (t === 'cline') {
      // Mittelpunktlinie: Mitte, dann ein Ende; das andere Ende liegt gespiegelt, die Mitte bleibt Mittelpunkt
      if (!far(a, sn)) return;
      const q = [2 * a.uv[0] - sn.uv[0], 2 * a.uv[1] - sn.uv[1]];
      this.change(d => {
        const c = this.resolvePoint(d, a), e1 = addPoint(d, q[0], q[1]), e2 = addPoint(d, sn.uv[0], sn.uv[1]);
        const l = addLine(d, e1.id, e2.id, this.consMode);
        addRule(d, { type: 'midpoint', p: c, c: l.id });
        if (Math.abs(sn.uv[1] - a.uv[1]) < 1e-9) addRule(d, { type: 'horizontal', l: l.id });
        else if (Math.abs(sn.uv[0] - a.uv[0]) < 1e-9) addRule(d, { type: 'vertical', l: l.id });
        this.attachPoint(d, e2.id, sn);
      }, { label: 'Die Linie' });
      return done();
    }
    if (t === 'circle2' || t === 'circle3') {
      // Kreis durch 2 Punkte (Durchmesser) bzw. 3 Punkte; vorhandene Punkte werden auf den Kreis gebunden
      if (t === 'circle3' && !ts.end) { if (far(a, sn)) ts.end = sn; this.renderDyn(); return; }
      const g = t === 'circle2' ? { c: [(a.uv[0] + sn.uv[0]) / 2, (a.uv[1] + sn.uv[1]) / 2], r: Math.hypot(sn.uv[0] - a.uv[0], sn.uv[1] - a.uv[1]) / 2 } : arcThrough(a.uv, ts.end.uv, sn.uv);
      if (!g || !(g.r > 1e-6)) { this.msg(t === 'circle3' ? 'Die drei Punkte liegen auf einer Linie.' : 'Die Punkte fallen zusammen.'); return; }
      const on = t === 'circle2' ? [a, sn] : [a, ts.end, sn];
      this.change(d => {
        const c = addPoint(d, g.c[0], g.c[1]), k = addCircle(d, c.id, g.r, this.consMode);
        on.forEach(q => { if (q.pointId && !['OX', 'OY'].includes(q.pointId)) addRule(d, { type: 'pointOnCurve', p: q.pointId, c: k.id }); });
      }, { label: 'Der Kreis' });
      return done();
    }
    if (t === 'rect3') {
      // gedrehtes Rechteck: erste Kante a → b, dann die Breite; waagerechte/senkrechte Kante bekommt H/V statt Winkelbedingungen
      if (!ts.end) { if (far(a, sn)) ts.end = sn; this.renderDyn(); return; }
      const R = rect3Corners(a.uv, ts.end.uv, uv);
      if (!R) return;
      const b0 = ts.end;
      this.change(d => {
        const pts = R.pts.map(q => addPoint(d, q[0], q[1]));
        const lines = pts.map((p, i) => addLine(d, p.id, pts[(i + 1) % 4].id, this.consMode));
        if (R.axis === 'h') { addRule(d, { type: 'horizontal', l: lines[0].id }); addRule(d, { type: 'horizontal', l: lines[2].id }); addRule(d, { type: 'vertical', l: lines[1].id }); addRule(d, { type: 'vertical', l: lines[3].id }); }
        else if (R.axis === 'v') { addRule(d, { type: 'vertical', l: lines[0].id }); addRule(d, { type: 'vertical', l: lines[2].id }); addRule(d, { type: 'horizontal', l: lines[1].id }); addRule(d, { type: 'horizontal', l: lines[3].id }); }
        else { addRule(d, { type: 'parallel', a: lines[0].id, b: lines[2].id }); addRule(d, { type: 'parallel', a: lines[1].id, b: lines[3].id }); addRule(d, { type: 'perpendicular', a: lines[0].id, b: lines[1].id }); }
        this.attachPoint(d, pts[0].id, a);
        this.attachPoint(d, pts[1].id, b0);
      }, { label: 'Das Rechteck' });
      return done();
    }
    if (t === 'carc') {
      // Bogen um den Mittelpunkt: Mitte, Anfang (legt den Radius fest), Ende; Drehsinn folgt der Mausbewegung
      if (!ts.end) { if (far(a, sn)) { ts.end = sn; ts.sweep = 0; } this.renderDyn(); return; }
      const g = this.carcGeom(uv);
      if (!g || Math.abs(g.sweep) < 1e-6) return;
      const s0 = ts.end;
      this.change(d => {
        const c = this.resolvePoint(d, a), s = this.resolvePoint(d, s0), e2 = addPoint(d, g.e[0], g.e[1]);
        if (g.sweep > 0) addArc(d, c, s, e2.id, this.consMode); else addArc(d, c, e2.id, s, this.consMode);
      }, { label: 'Der Bogen' });
      return done();
    }
    if (t === 'circle') {
      const r = Math.hypot(sn.uv[0] - a.uv[0], sn.uv[1] - a.uv[1]);
      if (r < 1e-6) return;
      this.change(d => { addCircle(d, this.resolvePoint(d, a), r, this.consMode); }, { label: 'Der Kreis' });
      return done();
    }
    if (t === 'polygon' || t === 'polygonc' || t === 'polygone') {
      if (!far(a, sn)) return;
      const g = this.polyGeom(t, a.uv, sn.uv);
      this.change(d => {
        // über Kante: die beiden Klicks sind die ersten zwei Ecken, die Mitte ergibt sich
        const r = addPolygon(d, g.c, g.v, this.polySides, t === 'polygone' ? {} : { c: this.resolvePoint(d, a) }, t === 'polygonc' ? 'out' : 'in');
        if (!r.ok) { this.msg(r.msg); return false; }
        if (this.consMode) d.curves.forEach(c => { if (r.lines.includes(c.id)) c.cons = true; });
        if (t === 'polygon' && this.snapped(sn)) this.attachPoint(d, r.points[0], sn);
        if (t === 'polygone') { if (this.snapped(a)) this.attachPoint(d, r.points[0], a); if (this.snapped(sn)) this.attachPoint(d, r.points[1], sn); }
      }, { label: 'Das Vieleck' });
      return done();
    }
    if (t === 'slotarc3') {
      // Anfang, Ende, Punkt auf dem Bogen, dann die Breite
      if (!ts.end) { if (far(a, sn)) ts.end = sn; this.renderDyn(); return; }
      if (!ts.arc) { const g = this.arc3Geom(a.uv, ts.end.uv, uv); if (g) ts.arc = g; else this.msg('Die drei Punkte liegen auf einer Linie.'); this.renderDyn(); return; }
      const g = ts.arc, h = Math.abs(Math.hypot(uv[0] - g.c[0], uv[1] - g.c[1]) - g.r);
      this.change(d => {
        const r = addArcSlot(d, g.c, g.r, g.t0, g.sweep, h);
        if (!r.ok) { this.msg(r.msg); return false; }
      }, { label: 'Das Bogen-Langloch' });
      return done();
    }
    if (t === 'slotarc') {
      // Mitte, Anfang (Radius der Mittellinie), Ende (Drehsinn folgt der Maus), dann die Breite
      if (!ts.end) { if (far(a, sn)) { ts.end = sn; ts.sweep = 0; } this.renderDyn(); return; }
      if (!ts.arc) { const g = this.carcGeom(uv); if (g && Math.abs(g.sweep) > 1e-6) ts.arc = g; this.renderDyn(); return; }
      const g = ts.arc, h = Math.abs(Math.hypot(uv[0] - g.c[0], uv[1] - g.c[1]) - g.r);
      const t0 = g.sweep > 0 ? g.a0 : g.a0 + g.sweep;
      this.change(d => {
        const r = addArcSlot(d, g.c, g.r, t0, Math.abs(g.sweep), h, { c: this.resolvePoint(d, a) });
        if (!r.ok) { this.msg(r.msg); return false; }
      }, { label: 'Das Bogen-Langloch' });
      return done();
    }
    if (t === 'slot' || t === 'slotov' || t === 'slotc') {
      if (!ts.end) { if (far(a, sn)) ts.end = sn; this.renderDyn(); return; }
      const h = this.slotHalfWidth(uv);
      if (!(h > 1e-6)) return;
      const b = ts.end, sc = this.slotCenters(t, a.uv, b.uv, h);
      if (!sc) { this.msg('Das Langloch ist kürzer als breit.'); return; }
      this.change(d => {
        // Mitte zu Mitte: Klickpunkte sind die Bogenmitten; sonst liegen die Mitten anders und werden neu angelegt
        const r = addSlot(d, sc[0], sc[1], h, t === 'slot' ? { c1: this.resolvePoint(d, a), c2: this.resolvePoint(d, b) } : {});
        if (!r.ok) { this.msg(r.msg); return false; }
      }, { label: 'Das Langloch' });
      return done();
    }
    if (t === 'arc') {
      if (!ts.end) { if (far(a, sn)) ts.end = sn; this.renderDyn(); return; }
      const g = arcThrough(a.uv, ts.end.uv, uv);
      if (!g) { this.msg('Die drei Punkte liegen auf einer Linie.'); return; }
      const e0 = ts.end;
      this.change(d => {
        const s = this.resolvePoint(d, a), en = this.resolvePoint(d, e0);
        const c = addPoint(d, g.c[0], g.c[1]);
        if (g.ccw) addArc(d, c.id, s, en, this.consMode); else addArc(d, c.id, en, s, this.consMode);
      }, { label: 'Der Bogen' });
      return done();
    }
  }

  /* Linie als Punkt + Richtung + Normale (auch die Achsen der Skizze) */
  lineGeom(id) {
    const c = this.cm().get(id), pm = this.pm();
    if (!c || c.type !== 'line') return null;
    const A = pm.get(c.p1), B = pm.get(c.p2);
    if (!A || !B) return null;
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-9) return null;
    const u = [(B.x - A.x) / L, (B.y - A.y) / L];
    return { id, P: [A.x, A.y], u, n: [-u[1], u[0]] };
  }
  /* Kreis tangential an 2 Linien (Lage/Größe aus dem Zeiger) bzw. an 3 Linien (Seite aus den Klickstellen) */
  tanCircleGeom(lines, m) {
    const side = (L, q) => (q[0] - L.P[0]) * L.n[0] + (q[1] - L.P[1]) * L.n[1];
    const G = lines.map(x => ({ ...this.lineGeom(x.id), q: x.q }));
    if (G.some(g => !g.u)) return null;
    if (G.length === 2) {
      const [A, B] = G, s1 = Math.sign(side(A, m)) || 1, s2 = Math.sign(side(B, m)) || 1;
      const cr = A.u[0] * B.u[1] - A.u[1] * B.u[0];
      if (Math.abs(cr) < 1e-9) {
        // parallel: Mitte auf der Mittellinie, Radius = halber Abstand, Lage entlang der Linien am Zeiger
        const gap = side(A, B.P), r = Math.abs(gap) / 2;
        if (r < 1e-9) return null;
        const t = (m[0] - A.P[0]) * A.u[0] + (m[1] - A.P[1]) * A.u[1];
        return { c: [A.P[0] + A.u[0] * t + A.n[0] * gap / 2, A.P[1] + A.u[1] * t + A.n[1] * gap / 2], r };
      }
      // Schnittpunkt, Winkelhalbierende des Quadranten mit dem Zeiger, Mitte = Lot vom Zeiger darauf
      const k = ((B.P[0] - A.P[0]) * B.u[1] - (B.P[1] - A.P[1]) * B.u[0]) / cr, X = [A.P[0] + A.u[0] * k, A.P[1] + A.u[1] * k];
      let b = [s1 * A.n[0] + s2 * B.n[0], s1 * A.n[1] + s2 * B.n[1]];
      const bl = Math.hypot(b[0], b[1]);
      if (bl < 1e-9) return null;
      b = [b[0] / bl, b[1] / bl];
      const t = (m[0] - X[0]) * b[0] + (m[1] - X[1]) * b[1];
      if (!(t > 1e-9)) return null;
      const c = [X[0] + b[0] * t, X[1] + b[1] * t];
      return { c, r: Math.abs(side(A, c)) };
    }
    // drei Linien: n_i·c − n_i·P_i = s_i·r; Seite s_i = wo die Klickstellen der anderen beiden Linien liegen
    const s = G.map((g, i) => Math.sign(G.reduce((a, h, j) => a + (j === i ? 0 : side(g, h.q)), 0)) || 1);
    const M = G.map((g, i) => [g.n[0], g.n[1], -s[i]]), rhs = G.map(g => g.n[0] * g.P[0] + g.n[1] * g.P[1]);
    const det = Q => Q[0][0] * (Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1]) - Q[0][1] * (Q[1][0] * Q[2][2] - Q[1][2] * Q[2][0]) + Q[0][2] * (Q[1][0] * Q[2][1] - Q[1][1] * Q[2][0]);
    const D = det(M);
    if (Math.abs(D) < 1e-12) return null;
    const x = [0, 1, 2].map(col => det(M.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)))) / D);
    return x[2] > 1e-9 ? { c: [x[0], x[1]], r: x[2] } : null;
  }
  tanCircleClick(uv) {
    const t = this.tool, ts = this.ts, need = t === 'tcircle2' ? 2 : 3;
    ts.lines = ts.lines || [];
    if (ts.lines.length < need) {
      const h = this.pickAt(uv, { points: false });
      if (!h || !this.lineGeom(h.id)) { this.msg('Bitte eine Linie anklicken (auch die Achsen gehen).'); return; }
      if (ts.lines.some(x => x.id === h.id)) return;
      ts.lines.push({ id: h.id, q: uv });
      if (ts.lines.length < need) { this.renderDyn(); return; }
      if (t === 'tcircle2') { this.renderDyn(); return; }
    }
    const g = this.tanCircleGeom(ts.lines, uv);
    if (!g) { this.msg(t === 'tcircle2' ? 'Hier passt kein Kreis zwischen die Linien – Zeiger in den Winkel zwischen den Linien bewegen.' : 'Die drei Linien haben keinen gemeinsamen Berührkreis (z. B. alle parallel).'); if (t === 'tcircle3') { this.ts = {}; this.renderDyn(); } return; }
    const L = ts.lines.map(x => x.id);
    this.change(d => {
      const c = addPoint(d, g.c[0], g.c[1]), k = addCircle(d, c.id, g.r, this.consMode);
      L.forEach(id => addRule(d, { type: 'tangent', a: id, b: k.id }));
    }, { label: 'Der Kreis' });
    this.ts = {};
    this.renderDyn();
  }
  /* Bogen mit Mittelpunkt: überstrichener Winkel stetig mitführen, damit der Drehsinn der Mausbewegung folgt */
  carcGeom(uv) {
    const ts = this.ts, c = ts.start.uv, s = ts.end.uv, r = Math.hypot(s[0] - c[0], s[1] - c[1]);
    if (!(r > 1e-9) || Math.hypot(uv[0] - c[0], uv[1] - c[1]) < 1e-9) return null;
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    let raw = Math.atan2(uv[1] - c[1], uv[0] - c[0]) - a0;
    const prev = ts.sweep || 0;
    raw += Math.round((prev - raw) / (2 * Math.PI)) * 2 * Math.PI;
    if (raw > 2 * Math.PI - 1e-3) raw = 2 * Math.PI - 1e-3;
    if (raw < -2 * Math.PI + 1e-3) raw = -2 * Math.PI + 1e-3;
    ts.sweep = raw;
    return { c, r, a0, sweep: raw, e: [c[0] + r * Math.cos(a0 + raw), c[1] + r * Math.sin(a0 + raw)] };
  }
  /* Nebenachsenende der Ellipse aus dem Zeiger (Abstand zur Hauptachse) */
  ellipseMinor(uv) {
    const c = this.ts.start.uv, a = this.ts.end.uv, ux = a[0] - c[0], uy = a[1] - c[1], L = Math.hypot(ux, uy);
    if (L < 1e-9) return null;
    const nx = -uy / L, ny = ux / L, h = (uv[0] - c[0]) * nx + (uv[1] - c[1]) * ny;
    if (Math.abs(h) < 1e-6) return null;
    return [c[0] + nx * h, c[1] + ny * h];
  }
  finishSpline(closed) {
    const pts = (this.ts.pts || []).slice();
    if (pts.length < 2) { this.ts = {}; this.renderDyn(); return; }
    const cv = this.tool === 'cvspline';
    this.change(d => { const ids = pts.map(sn => this.resolvePoint(d, sn)); addSpline(d, ids, closed && pts.length >= 3, this.consMode, cv); }, { label: 'Der Spline' });
    this.ts = {};
    this.renderDyn();
  }

  /* Drehwinkel aus Mittelpunkt, Bezugspunkt und Zeiger (am Raster in 5°-Schritten) */
  rotAngle(sn) {
    const C = this.ts.center.uv, R0 = this.ts.ref.uv;
    let a = Math.atan2(sn.uv[1] - C[1], sn.uv[0] - C[0]) - Math.atan2(R0[1] - C[1], R0[0] - C[0]);
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    if (this.snapGrid && !this.snapped(sn)) a = Math.round(a / (Math.PI / 36)) * (Math.PI / 36);
    return a;
  }
  /* Auswahl um einen Basispunkt skalieren; Kreise, Texte und Maße, die nur an der Auswahl hängen, wachsen mit */
  applyScale(items, b, k, copy) {
    const xf = q => [b[0] + (q[0] - b[0]) * k, b[1] + (q[1] - b[1]) * k];
    let made = [];
    const ok = this.change(d => {
      const ids = copy ? (made = copyItems(d, items, xf)) : items;
      if (!ids.length) { this.msg('Erst Elemente der Skizze wählen.'); return false; }
      const pts = selectionPoints(d, ids), inSel = new Set([...ids, ...pts]);
      if (!copy) { const r = transformItems(d, ids, xf); if (!r.ok) { this.msg(r.msg); return false; } }
      d.curves.forEach(c => { if (c.type === 'circle' && inSel.has(c.id)) c.r *= k; });
      (d.texts || []).forEach(t => { if (inSel.has(t.id)) t.h = (t.h || 5) * k; });
      d.rules.forEach(r => {
        if (!DIMENSION_TYPES.has(r.type) || r.type === 'angle' || typeof r.value !== 'number') return;
        const refs = ruleRefs(r);
        if (refs.length && refs.every(id => inSel.has(id))) { r.value *= k; delete r.expr; }
      });
    }, { label: 'Das Skalieren', allowRedundant: true });
    if (ok) this.msg(`Skaliert mit Faktor ${String(+k.toFixed(4)).replace('.', DEC)}.`);
    this.sel = new Set(copy ? made : items);
    this.setTool(null);
    this.render();
    this.emit();
  }

  /* Auswahl verschieben/drehen oder als Kopie anlegen */
  applyXf(items, xf, dAngle, copy) {
    const pts = selectionPoints(this.f, items), pm = this.pm();
    const want = new Map([...pts].map(id => { const p = pm.get(id); return [id, p ? xf([p.x, p.y]) : null]; }));
    let made = [];
    const ok = this.change(d => {
      if (copy) { made = copyItems(d, items, xf, { dAngle }); if (!made.length) { this.msg('Erst Elemente der Skizze wählen.'); return false; } return; }
      const r = transformItems(d, items, xf, { dAngle });
      if (!r.ok) { this.msg(r.msg); return false; }
    }, { label: copy ? 'Das Kopieren' : 'Das Verschieben', allowRedundant: true });
    if (ok && !copy) {
      const pm2 = this.pm();
      const held = [...want].some(([id, q]) => { const p = pm2.get(id); return q && p && Math.hypot(p.x - q[0], p.y - q[1]) > 1e-3; });
      if (held) this.msg('Bemaßungen oder Bedingungen halten die Auswahl teilweise fest. Gegebenenfalls Maße löschen.');
    }
    this.sel = new Set(copy ? made : items);
    this.setTool(null);
    this.render();
    this.emit();
  }

  /* Vieleck: Mitte und erste Ecke je Art (a = erster Klick, p = zweiter Klick) */
  polyGeom(t, a, p) {
    const n = this.polySides;
    if (t === 'polygone') {
      const dx = p[0] - a[0], dy = p[1] - a[1], s = Math.hypot(dx, dy) || 1e-12, k = (s / 2) / Math.tan(Math.PI / n);
      return { c: [(a[0] + p[0]) / 2 - dy / s * k, (a[1] + p[1]) / 2 + dx / s * k], v: a };
    }
    if (t === 'polygonc') {
      // Zeiger = Mitte einer Kante (Inkreis); die Ecke liegt um π/n gedreht auf dem Umkreis
      const R = Math.hypot(p[0] - a[0], p[1] - a[1]) / Math.cos(Math.PI / n), ph = Math.atan2(p[1] - a[1], p[0] - a[0]) + Math.PI / n;
      return { c: a, v: [a[0] + R * Math.cos(ph), a[1] + R * Math.sin(ph)] };
    }
    return { c: a, v: p };
  }
  /* Bogen durch Anfang s, Ende e und Punkt m: Mitte, Radius, Startwinkel und Winkel gegen den Uhrzeigersinn */
  arc3Geom(s, e, m) {
    const g = arcThrough(s, e, m);
    if (!g) return null;
    const ang = p => Math.atan2(p[1] - g.c[1], p[0] - g.c[0]), wrap = x => { while (x <= 0) x += 2 * Math.PI; while (x > 2 * Math.PI) x -= 2 * Math.PI; return x; };
    return g.ccw ? { c: g.c, r: g.r, t0: ang(s), sweep: wrap(ang(e) - ang(s)) } : { c: g.c, r: g.r, t0: ang(e), sweep: wrap(ang(s) - ang(e)) };
  }
  /* Langloch: Mitten der beiden Bögen je Art (a, b = erste zwei Klicks, h = halbe Breite) */
  slotCenters(t, a, b, h) {
    if (t === 'slotc') return [[2 * a[0] - b[0], 2 * a[1] - b[1]], b];
    if (t === 'slotov') {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L <= 2 * h + 1e-9) return null;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      return [[a[0] + u[0] * h, a[1] + u[1] * h], [b[0] - u[0] * h, b[1] - u[1] * h]];
    }
    return [a, b];
  }
  /* halbe Breite des Langlochs: Abstand des Zeigers von der Mittellinie */
  slotHalfWidth(uv) {
    const a = this.ts.start.uv, b = this.ts.end.uv;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-12;
    const h = Math.abs((uv[0] - a[0]) * dy - (uv[1] - a[1]) * dx) / L;
    return this.snapGrid ? Math.max(this.gridStep() / 2, Math.round(h * 2 / this.gridStep()) * this.gridStep() / 2) : h;
  }

  /* Waagerecht/senkrecht erkennen, wenn der Endpunkt frei ist */
  inferLine(start, sn) {
    // Punkte fangen immer; an einer Kurve (z. B. Achse) gewinnt die Waagrecht-/Senkrecht-Erkennung
    if (sn && (sn.pointId || sn.bodyPoint)) return sn;
    const onCurve = this.snapped(sn);
    const dx = sn.uv[0] - start.uv[0], dy = sn.uv[1] - start.uv[1];
    const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    const tolDeg = 2.5;
    if (Math.hypot(dx, dy) > 1e-9 && (ang < tolDeg || ang > 180 - tolDeg)) return { uv: [sn.uv[0], start.uv[1]], h: true };
    if (Math.hypot(dx, dy) > 1e-9 && Math.abs(ang - 90) < tolDeg) return { uv: [start.uv[0], sn.uv[1]], v: true };
    return onCurve ? sn : sn;
  }

  /* ---------- Ändern: Stutzen, Verrunden, Spiegeln ---------- */
  trimClick(uv) {
    const h = this.pickAt(uv, { points: false });
    const c = h && this.cm().get(h.id);
    if (!c || c.virtual) return;
    if (c.ref) { this.msg('Projizierte Kanten lassen sich nicht stutzen. Zum Entfernen auswählen und Entf drücken.'); return; }
    const ok = this.change(d => { const r = trimAt(d, h.id, uv); if (!r.ok) { this.msg(r.msg); return false; } }, { label: 'Das Stutzen' });
    if (ok) { this.sel.delete(h.id); this.hover = null; this.render(); }
  }

  breakClick(uv) {
    const h = this.pickAt(uv, { points: false });
    const c = h && this.cm().get(h.id);
    if (!c || c.virtual) return;
    if (c.ref) { this.msg('Projizierte Kanten lassen sich nicht unterbrechen.'); return; }
    let n = 0;
    const ok = this.change(d => { const r = breakAt(d, h.id, uv); if (!r.ok) { this.msg(r.msg); return false; } n = r.parts; }, { label: 'Das Unterbrechen' });
    if (ok) { this.sel.delete(h.id); this.hover = null; this.msg(`In ${n} Teile unterbrochen.`); this.render(); }
  }

  filletClick(uv) {
    const pid = this.cornerAt(uv);
    if (!pid) { this.msg('Eine Ecke anklicken, an der genau zwei Linien zusammenkommen.'); return; }
    const r0 = this.filletRadius(pid);
    let res = null;
    const ok = this.change(d => { res = filletCorner(d, pid, r0); if (!res.ok) { this.msg(res.msg); return false; } }, { label: 'Die Verrundung' });
    if (ok && res && res.ok) { this.filletRule = res.ruleId; this.openEditor(res.ruleId); }
  }

  /* Versatz mit getipptem Abstand: Seite von der Maus, Wert exakt (die Ausgangskurve bleibt liegen) */
  offsetTyped(first) {
    const ts = this.ts, cur = this.cursor;
    const side = Math.sign(this.offsetDist(cur)) || 1;
    const inp = el('input', 'sk-input');
    inp.value = first;
    inp.title = 'Abstand in mm, Enter legt an';
    const s = this.vp.toScreen(toWorld(this.pl, cur[0], cur[1]));
    inp.style.transform = `translate(${s[0].toFixed(0)}px, ${s[1].toFixed(0)}px) translate(-50%, -150%)`;
    this.layer.appendChild(inp);
    inp.focus();
    const close = () => { inp.remove(); };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      let v;
      try { v = parseLen(inp.value.replace(/,/g, '.'), this.vars()).v; } catch (_) { v = NaN; }
      if (!(v > 0)) { inp.classList.add('bad'); this.msg('Bitte einen Abstand größer als 0 eingeben.'); return; }
      close();
      let rid = null;
      const ok = this.change(dd => { const r = applyOffset(dd, ts.curve, side * v); if (!r.ok) { this.msg(r.msg); return false; } rid = r.ruleId; }, { label: 'Der Versatz', allowRedundant: true });
      this.ts = {};
      this.renderDyn();
      if (ok) this.msg(`Versatz ${fmtLen(v)} ${UNIT} angelegt.`);
    });
    inp.addEventListener('blur', () => setTimeout(close, 150));
  }

  /* Versatz: Kurve anklicken, Seite und Abstand mit der Maus, zweiter Klick legt an */
  offsetClick(uv) {
    const ts = this.ts;
    if (!ts.curve) {
      const h = this.pickAt(uv, { points: false });
      const c = h && this.cm().get(h.id);
      if (!c || c.virtual) { this.msg('Eine Linie, einen Bogen oder Kreis der Skizze anklicken.'); return; }
      if (c.ref) { this.msg('Projizierte Kanten lassen sich nicht versetzen. Mit X zum Profil machen oder nachzeichnen.'); return; }
      ts.curve = h.id;
      this.renderDyn();
      return;
    }
    const d = this.offsetDist(uv);
    if (!(Math.abs(d) > 1e-6)) return;
    let rid = null;
    const ok = this.change(dd => { const r = applyOffset(dd, ts.curve, d); if (!r.ok) { this.msg(r.msg); return false; } rid = r.ruleId; }, { label: 'Der Versatz', allowRedundant: true });
    this.ts = {};
    this.renderDyn();
    if (ok && rid) this.openEditor(rid);
  }
  /* vorzeichenbehafteter Abstand des Zeigers: positiv = links der Durchlaufrichtung */
  offsetDist(uv) {
    const pc = this.cm().get(this.ts.curve);
    if (pc && (pc.type === 'ellipse' || pc.type === 'spline')) {
      let dd = signedPolyDist(this.f, pc, uv);
      if (this.snapGrid) { const g = this.gridStep(); dd = Math.sign(dd || 1) * Math.max(g, Math.round(Math.abs(dd) / g) * g); }
      return dd;
    }
    const ch = chainFrom(this.f, this.ts.curve);
    if (!ch) return 0;
    const it = ch.items.find(i => i.c.id === this.ts.curve), c = it.c, pm = this.pm();
    let dist, sign;
    if (c.type === 'line') {
      const [i0, i1] = it.fwd ? [c.p1, c.p2] : [c.p2, c.p1];
      const S = pm.get(i0), E = pm.get(i1), ux = E.x - S.x, uy = E.y - S.y, L = Math.hypot(ux, uy) || 1;
      const cr = (ux * (uv[1] - S.y) - uy * (uv[0] - S.x)) / L;
      dist = Math.abs(cr); sign = cr > 0 ? 1 : -1;
    } else {
      const C = pm.get(c.c), dd = Math.hypot(uv[0] - C.x, uv[1] - C.y);
      dist = Math.abs(dd - c.r);
      sign = (dd < c.r) === (c.type === 'circle' ? true : it.fwd) ? 1 : -1;
    }
    if (this.snapGrid) { const g = this.gridStep(); dist = Math.max(g, Math.round(dist / g) * g); }
    return sign * dist;
  }

  extendClick(uv) {
    const h = this.pickAt(uv, { points: false });
    const c = h && this.cm().get(h.id);
    if (!c || c.virtual) { this.msg('Eine Linie oder einen Bogen nahe am Ende anklicken, das verlängert werden soll.'); return; }
    this.change(d => { const r = extendAt(d, h.id, uv); if (!r.ok) { this.msg(r.msg); return false; } }, { label: 'Das Verlängern' });
  }

  chamferClick(uv) {
    const pid = this.cornerAt(uv);
    if (!pid) { this.msg('Eine Ecke anklicken, an der genau zwei Linien zusammenkommen.'); return; }
    const d0 = this.chamferDist(pid);
    let res = null;
    const ok = this.change(d => { res = chamferCorner(d, pid, d0); if (!res.ok) { this.msg(res.msg); return false; } }, { label: 'Die Fase' });
    if (ok && res && res.ok) { this.chamferRule = res.ruleId; this.openEditor(res.ruleId); }
  }
  chamferDist(pid) {
    const pm = this.pm(), P = pm.get(pid);
    const lines = this.f.curves.filter(c => c.type === 'line' && (c.p1 === pid || c.p2 === pid));
    if (lines.length !== 2) return null;
    const lmin = Math.min(...lines.map(l => { const q = pm.get(l.p1 === pid ? l.p2 : l.p1); return Math.hypot(q.x - P.x, q.y - P.y); }));
    if (this.chamferD && this.chamferD < lmin * 0.98) return this.chamferD;
    return niceDown(lmin * 0.3);
  }

  mirrorClick(uv) {
    const ts = this.ts;
    let hit = this.pickAt(uv);
    if (!ts.axis) {
      if (!hit && this.lastEvent) { const id = this.projectAt(this.lastEvent, uv, { wholeEdge: true }); if (id) hit = { kind: 'curve', id }; }
      const c = hit && this.cm().get(hit.id);
      if (!c || c.type !== 'line') { this.msg('Als Spiegelachse eine Linie oder eine Achse anklicken.'); return; }
      ts.axis = hit.id;
      if (ts.items && ts.items.length) { this.mirror(ts.items); ts.items = []; this.sel.clear(); this.render(); }
      this.renderDyn();
      this.emit();
      return;
    }
    if (!hit || hit.id === ts.axis || hit.id === 'AX' || hit.id === 'AY') return;
    this.mirror([hit.id]);
  }
  mirror(ids) {
    return this.change(d => { const r = mirrorItems(d, ids, this.ts.axis); if (!r.ok) { this.msg(r.msg); return false; } }, { label: 'Das Spiegeln', allowRedundant: true });
  }

  /* Schnittkurve: wo die Skizzenebene die Körper schneidet, wird der Schnittumriss als Bezug übernommen */
  async runIntersect() {
    if (!this.cb.sectionCurves) return;
    let res;
    try { res = await this.cb.sectionCurves(this.pl); } catch (err) { this.msg('Schnittkurve nicht möglich: ' + err.message); return; }
    const edges = (res && res.edges) || [];
    if (!edges.length) { this.msg('Die Skizzenebene schneidet keinen Körper.'); return; }
    let n = 0;
    this.change(d => {
      edges.forEach(info => {
        let pr = projectEdge(this.pl, info);
        if (!pr) pr = { kind: 'poly', pts: info.pts.map(p => { const q = toLocal(this.pl, p); return [q[0], q[1]]; }) };
        if (this.ensureProjection(d, info, pr)) n++;
      });
    }, { check: false });
    this.msg(`Schnittkurve: ${n} Kante${n === 1 ? '' : 'n'} übernommen.`);
  }

  /* ---------- Projizieren (Taste P): Kante anklicken = diese Kante, Fläche anklicken = ganzer Rand ---------- */
  projectClick(e, uv) {
    const hit = this.bodyEdgeAt(uv);
    if (hit) { const id = this.projectAt(e, uv, { wholeEdge: true }); if (id) { this.sel.clear(); this.sel.add(id); this.render(); this.emit(); } return; }
    const fi = this.vp.faceIndexAt ? this.vp.faceIndexAt(e) : null;
    const m = this.vp.model;
    if (fi == null || !m) { this.msg('Körperkante oder Fläche anklicken.'); return; }
    const D = m.data, f = D.faces[fi], P = D.positions, I = D.index, E = D.edgePositions, keys = new Set();
    const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
    for (let t = f.start; t < f.start + f.count; t++) { const v = I[t]; keys.add(key(P[3 * v], P[3 * v + 1], P[3 * v + 2])); }
    const edges = D.edges.filter(ed => { for (let k = ed.start; k < ed.start + ed.count; k++) if (!keys.has(key(E[3 * k], E[3 * k + 1], E[3 * k + 2]))) return false; return true; });
    if (!edges.length) { this.msg('Diese Fläche hat keine Randkanten zum Projizieren.'); return; }
    let n = 0;
    this.change(d => { edges.forEach(info => { if (this.ensureProjection(d, info)) n++; }); }, { check: false });
    this.msg(`${n} Kante${n === 1 ? '' : 'n'} projiziert.`);
  }

  /* ---------- Körperkanten projizieren ---------- */
  /* Projiziert die Kante unter dem Zeiger (oder nur den Körperpunkt daneben) und liefert die ID in der Skizze. */
  projectAt(e, uv, { wholeEdge = false } = {}) {
    if (!wholeEdge) {
      const b = this.bodyPointAt(uv);
      if (b) { let id = null; this.change(d => { id = this.ensureRefPoint(d, b.uv); }, { check: false }); return id; }
    }
    const hit = this.bodyEdgeAt(uv);
    if (!hit) return null;
    const pr = hit.proj;
    let res = null;
    this.change(d => { res = this.ensureProjection(d, hit.info, pr); }, { check: false });
    if (!res) return null;
    if (res.point) return res.point;
    if (res.curve) return res.curve;
    if (res.segs && res.segs.length) {
      const q = nearestOnProj(pr, uv);
      return res.segs[Math.min(res.segs.length - 1, q && q.seg != null ? q.seg : 0)];
    }
    return null;
  }

  /* ---------- Bemaßen ---------- */
  dimClick(uv) {
    const ts = this.ts;
    let hit = this.pickAt(uv);
    if (!hit && this.lastEvent) {
      const id = this.projectAt(this.lastEvent, uv);
      if (id) hit = { kind: this.f.curves.some(c => c.id === id) ? 'curve' : 'point', id };
    }
    const cm = this.cm();
    const round = id => cm.has(id) && (cm.get(id).type === 'circle' || cm.get(id).type === 'arc');
    if (!ts.refs) {
      if (!hit || hit.id === 'AX' || hit.id === 'AY') return;
      ts.refs = [hit.id];
      ts.show = [hit.id];
      this.renderDyn();
      return;
    }
    // zweites Element: Kreise und Bögen zählen dann über ihren Mittelpunkt
    if (ts.refs.length === 1 && hit && hit.id !== ts.refs[0]) {
      const a = round(ts.refs[0]) ? cm.get(ts.refs[0]).c : ts.refs[0];
      const b = round(hit.id) ? cm.get(hit.id).c : hit.id;
      if (a !== b) {
        ts.refs = [a, b];
        ts.show.push(hit.id);
        // Eindeutige Paare (Punkt/Mittelpunkt zu Linie, parallele Linien) sofort bemaßen
        if (this.autoDim()) return;
        this.renderDyn();
        return;
      }
    }
    const rule = this.previewDim(uv);
    if (!rule) { this.ts = {}; this.renderDyn(); return; }
    const made = this.change(d => { const r = addRule(d, rule); return r.id; }, { label: 'Das Maß' });
    this.ts = {};
    this.renderDyn();
    if (made) this.openEditor(made);
  }

  /* Bemaßung ohne Platzierungsklick anlegen, wenn die zwei Elemente sie eindeutig festlegen */
  autoDim() {
    const refs = this.ts.refs;
    const pm = this.pm(), cm = this.cm();
    const kind = id => (cm.has(id) ? cm.get(id).type : pm.has(id) ? 'point' : null);
    const ks = refs.map(kind);
    if (!((ks[0] === 'point' && ks[1] === 'line') || (ks[0] === 'line' && ks[1] === 'point') || (ks[0] === 'line' && ks[1] === 'line'))) return false;
    const r = this.previewDim(this.cursor || [0, 0]);
    if (!r || r.type !== 'distance' || r.b == null) return false;
    const pair = dimPoints(r, pm, cm);
    if (!pair) return false;
    const [A, B] = pair, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    const k = this.vp.uvPerPixel(this.pl, ...A) * 26;
    r.off = [-dy / L * k, dx / L * k];
    const made = this.change(d => addRule(d, r).id, { label: 'Das Maß' });
    this.ts = {};
    this.renderDyn();
    if (made) this.openEditor(made);
    return true;
  }

  /* Welche Bemaßung entsteht aus den gewählten Elementen und der Zeigerposition? */
  previewDim(uv) {
    const refs = this.ts.refs;
    if (!refs || !uv) return null;
    const pm = this.pm(), cm = this.cm();
    const kind = id => (cm.has(id) ? cm.get(id).type : pm.has(id) ? 'point' : null);
    const P = id => pm.get(id);
    let r;
    if (refs.length === 1) {
      const k = kind(refs[0]);
      if (k === 'circle') r = { type: 'diameter', c: refs[0] };
      else if (k === 'arc') r = { type: 'radius', c: refs[0] };
      else if (k === 'line') {
        const c = cm.get(refs[0]);
        r = this.pointPairDim(P(c.p1), P(c.p2), uv, refs[0]);
      } else return null;
    } else {
      const [a, b] = refs, ka = kind(a), kb = kind(b);
      if (ka === 'point' && kb === 'point') r = this.pointPairDim(P(a), P(b), uv);
      else if (ka === 'point' && kb === 'line') r = { type: 'distance', a, b };
      else if (ka === 'line' && kb === 'point') r = { type: 'distance', a: b, b: a };
      else if (ka === 'line' && kb === 'line') {
        const A = cm.get(a), B = cm.get(b);
        const t1 = Math.atan2(P(A.p2).y - P(A.p1).y, P(A.p2).x - P(A.p1).x), t2 = Math.atan2(P(B.p2).y - P(B.p1).y, P(B.p2).x - P(B.p1).x);
        const par = Math.abs(Math.sin(t2 - t1)) < 1e-6;
        r = par ? { type: 'distance', a, b } : { type: 'angle', a, b };
      } else return null;
    }
    const sk = this.f;
    r.value = measure(sk, r, pm, cm);
    if (r.type !== 'hdistance' && r.type !== 'vdistance' && r.type !== 'angle') r.value = Math.abs(r.value);
    if (r.type === 'distance' && r.value < 1e-9) return null;
    const anchor = dimAnchor(sk, r, pm, cm);
    r.off = anchor ? [uv[0] - anchor[0], uv[1] - anchor[1]] : [0, 0];
    return r;
  }
  pointPairDim(A, B, uv, lineId) {
    const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
    const outsideY = uv[1] > y1 || uv[1] < y0, outsideX = uv[0] > x1 || uv[0] < x0;
    const horizontalish = Math.abs(B.y - A.y) < 1e-9, verticalish = Math.abs(B.x - A.x) < 1e-9;
    if (lineId && (horizontalish || verticalish)) return { type: 'distance', a: lineId };
    if (outsideY && !outsideX && !horizontalish) return { type: 'hdistance', a: A.id, b: B.id };
    if (outsideX && !outsideY && !verticalish) return { type: 'vdistance', a: A.id, b: B.id };
    return lineId ? { type: 'distance', a: lineId } : { type: 'distance', a: A.id, b: B.id };
  }

  /* Maß direkt im Ansichtsfenster eintippen */
  openEditor(ruleId) {
    this.closeEditor();
    const r = this.f.rules.find(x => x.id === ruleId);
    if (!r || !DIMENSION_TYPES.has(r.type)) return;
    const item = this.htmlItems.find(h => h.rule === ruleId && h.kind === 'dim');
    const inp = el('input', 'sk-input');
    inp.value = r.expr || (r.type === 'angle' ? fmtNum(Math.abs(r.value), 3) : fmtLen(Math.abs(r.value), 3));
    inp.title = 'Zahl oder Ausdruck, z. B. 40, 60/2 oder breite/2 (Parameter ändern)';
    inp.spellcheck = false;
    this.layer.appendChild(inp);
    this.editing = { ruleId, inp, item };
    this.positionEditor();
    // sofort fokussieren, damit direkt getippte Ziffern ankommen; danach absichern
    inp.focus(); inp.select();
    setTimeout(() => { if (document.activeElement !== inp && this.editing && this.editing.inp === inp) { inp.focus(); inp.select(); } }, 0);
    const apply = () => {
      let v;
      let lenExpr = null;
      try { if (r.type === 'angle') v = evalLen(inp.value, this.vars(), 1, 'deg', U_ANGLE).v; else ({ v, expr: lenExpr } = parseLen(inp.value, this.vars(), U_LEN)); } catch (err) { inp.classList.add('bad'); this.msg(err.dim || /Parameter|Funktion/.test(err.message) ? err.message + '.' : 'Bitte eine Zahl oder einen Ausdruck eingeben, zum Beispiel 40, 60/2 oder breite/2.'); return; }
      // reine Rechnungen in einer anderen Anzeigeeinheit werden zur Zahl (der Ausdruck gilt sonst in mm)
      // Längen: Ausdruck mit ausgeschriebener Anzeigeeinheit (units.js parseLen), reine Zahlen als Wert
      const expr = r.type === 'angle' ? (isExpr(inp.value) ? inp.value.trim() : null) : lenExpr;
      if (r.type === 'angle' ? !(v > 0 && v < 180) : !(v > 0)) { inp.classList.add('bad'); this.msg(r.type === 'angle' ? 'Winkel zwischen 0 und 180°.' : 'Das Maß muss größer als 0 sein.'); return; }
      const sign = r.value < 0 ? -1 : 1;
      const ok = this.change(d => { const x = d.rules.find(q => q.id === ruleId); x.value = sign * v; if (expr) x.expr = expr; else delete x.expr; if (x.type === 'radius') refillet(d, x.c, v); }, { label: 'Das Maß' });
      if (!ok) { inp.classList.add('bad'); return; }
      if (ruleId === this.filletRule) this.filletR = v;
      if (ruleId === this.chamferRule) this.chamferD = v;
      this.closeEditor();
    };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeEditor(); }
    });
    const fitW = () => { inp.style.width = Math.max(92, Math.min(260, inp.value.length * 8 + 24)) + 'px'; };
    fitW();
    inp.addEventListener('input', () => { inp.classList.remove('bad'); fitW(); });
    inp.addEventListener('blur', () => { if (this.editing && this.editing.inp === inp) setTimeout(() => { if (this.editing && this.editing.inp === inp) this.closeEditor(); }, 120); });
  }
  closeEditor() {
    if (!this.editing) return;
    this.editing.inp.remove();
    this.editing = null;
  }
  positionEditor() {
    if (!this.editing || this.editing.text) return;
    const r = this.f.rules.find(x => x.id === this.editing.ruleId);
    if (!r) { this.closeEditor(); return; }
    const g = dimGeom(this.f, r, this.pm(), this.cm(), 1);
    if (!g) return;
    const s = this.vp.toScreen(toWorld(this.pl, g.label[0], g.label[1]));
    this.editing.inp.style.transform = `translate(${s[0].toFixed(0)}px, ${s[1].toFixed(0)}px) translate(-50%, -50%)`;
  }

  /* ---------- Bedingungen auf die Auswahl anwenden ---------- */
  applyConstraint(type) {
    const ids = [...this.sel];
    const cm = this.cm(), pm = this.pm();
    const lines = ids.filter(id => cm.get(id) && cm.get(id).type === 'line');
    const rounds = ids.filter(id => cm.get(id) && (cm.get(id).type === 'circle' || cm.get(id).type === 'arc'));
    const curves = ids.filter(id => cm.has(id));
    const points = ids.filter(id => pm.has(id) && !cm.has(id));
    const need = t => { this.msg(t); return false; };
    const add = rules => this.change(d => { rules.forEach(r => addRule(d, r)); }, { label: `„${RULE_LABELS[rules[0] && rules[0].type] || 'Bedingung'}“` });
    switch (type) {
      case 'hv': {
        if (lines.length) {
          return add(lines.map(l => { const c = cm.get(l), a = pm.get(c.p1), b = pm.get(c.p2); return { type: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical', l }; }));
        }
        if (points.length === 2) { const a = pm.get(points[0]), b = pm.get(points[1]); return add([{ type: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical', a: a.id, b: b.id }]); }
        return need('Für Horizontal/Vertikal eine oder mehrere Linien wählen, oder zwei Punkte.');
      }
      case 'parallel':
      case 'perpendicular':
        if (lines.length < 2) return need('Dafür zwei Linien wählen.');
        return add(lines.slice(1).map(l => ({ type, a: lines[0], b: l })));
      case 'equal':
        if (lines.length >= 2 && !rounds.length) return add(lines.slice(1).map(l => ({ type: 'equal', a: lines[0], b: l })));
        if (rounds.length >= 2 && !lines.length) return add(rounds.slice(1).map(c => ({ type: 'equal', a: rounds[0], b: c })));
        return need('Für Gleich zwei Linien oder zwei Kreise/Bögen wählen.');
      case 'tangent': {
        const kinds = curves.map(id => cm.get(id).type), curvy = kinds.some(t => t === 'ellipse' || t === 'spline');
        if (curves.length !== 2 || (!rounds.length && !curvy)) return need('Für Tangential eine Linie und einen Bogen/Kreis/eine Ellipse wählen, oder zwei Kurven.');
        const r = makeTangentRule(this.f, curves[0], curves[1]);
        if (kinds.includes('spline') && !r.via) return need('Ein Spline wird an einem Stützpunkt tangential: Stützpunkt erst auf die andere Kurve legen oder mit ihr verbinden.');
        if (kinds.includes('spline') && kinds.every(t => t === 'spline') === false && kinds.some(t => t === 'ellipse')) return need('Spline und Ellipse tangential geht noch nicht.');
        /* Stützpunkt mitten auf dem Spline (oder Spline mit Griff): die Tangente ist der Tangentengriff – er wird bei
           Bedarf angelegt; liegt der Punkt nur auf der anderen Kurve, wird er dort festgehalten */
        const sps = curves.map(id => cm.get(id)).filter(c => c.type === 'spline' && !c.cv && c.conic == null && c.pts.includes(r.via));
        const mid = c => c.closed || (c.pts.indexOf(r.via) > 0 && c.pts.indexOf(r.via) < c.pts.length - 1) || (c.tan && c.tan[r.via]);
        if (sps.some(mid) || r._on) {
          const { _on, ...rr } = r;
          return this.change(d => {
            sps.forEach(c0 => { if (mid(c0) || _on) addSplineHandle(d, d.curves.find(x => x.id === c0.id), r.via); });
            if (_on) addRule(d, { type: 'pointOnCurve', p: r.via, c: _on });
            addRule(d, rr);
          }, { label: '„Tangential“' });
        }
        return add([r]);
      }
      case 'polygon': {
        // Polygon-Abhängigkeit: geschlossene Linienkette → gleiche Seiten, Ecken auf einem Hilfskreis
        // (zusammen = regelmäßiges Vieleck); Ecken über gemeinsame Punkte oder gleiche Lage verknüpft
        if (lines.length < 3 || rounds.length) return need('Für Polygon eine geschlossene Kette aus drei oder mehr Linien wählen.');
        const key = id => { const p = pm.get(id); return `${Math.round(p.x * 1e6)}:${Math.round(p.y * 1e6)}`; };
        const verts = new Map(), deg = new Map();
        lines.forEach(l => { const c = cm.get(l); [c.p1, c.p2].forEach(id => { const k = key(id); if (!verts.has(k)) verts.set(k, id); deg.set(k, (deg.get(k) || 0) + 1); }); });
        if (verts.size !== lines.length || [...deg.values()].some(v => v !== 2)) return need('Die gewählten Linien bilden keine geschlossene Kette (jede Ecke genau zwei Linien).');
        const ids = [...verts.values()], P = ids.map(id => pm.get(id));
        const cx = P.reduce((a, p) => a + p.x, 0) / P.length, cy = P.reduce((a, p) => a + p.y, 0) / P.length;
        const R = P.reduce((a, p) => a + Math.hypot(p.x - cx, p.y - cy), 0) / P.length;
        return this.change(d => {
          const C = addPoint(d, cx, cy), circ = addCircle(d, C.id, R, true);
          ids.forEach(id => addRule(d, { type: 'pointOnCurve', p: id, c: circ.id }));
          lines.slice(1).forEach(l => addRule(d, { type: 'equal', a: lines[0], b: l }));
        }, { label: '„Polygon“', allowRedundant: true });
      }
      case 'collinear': {
        // Linien auf eine gemeinsame Gerade; Endpunkte, die schon auf einem Ende der ersten Linie liegen, zählen nicht
        if (lines.length < 2) return need('Für Kollinear zwei oder mehr Linien wählen.');
        const L0 = cm.get(lines[0]), e0 = [pm.get(L0.p1), pm.get(L0.p2)];
        const rules = [];
        for (const l of lines.slice(1)) {
          const c = cm.get(l), pts = [c.p1, c.p2].filter(id => !e0.some(q => q.id === id || Math.hypot(q.x - pm.get(id).x, q.y - pm.get(id).y) < 1e-9));
          if (!pts.length) return need('Diese Linien liegen schon aufeinander.');
          rules.push({ type: 'collinear', a: lines[0], b: l, pts });
        }
        return add(rules);
      }
      case 'concentric':
        if (rounds.length !== 2) return need('Für Konzentrisch zwei Kreise oder Bögen wählen.');
        return add([{ type: 'concentric', a: rounds[0], b: rounds[1] }]);
      case 'coincident':
        if (points.length === 2 && !curves.length) return add([{ type: 'coincident', a: points[0], b: points[1] }]);
        if (points.length === 1 && curves.length === 1) return add([{ type: 'pointOnCurve', p: points[0], c: curves[0] }]);
        return need('Für Deckungsgleich zwei Punkte wählen, oder einen Punkt und eine Kurve.');
      case 'midpoint':
        if (points.length === 1 && lines.length === 1) return add([{ type: 'midpoint', p: points[0], c: lines[0] }]);
        return need('Für Mittelpunkt einen Punkt und eine Linie wählen.');
      case 'symmetric': {
        // Symmetrielinie ist die zuletzt gewählte Linie
        const axis = [...lines].reverse()[0];
        if (!axis) return need('Für Symmetrisch zwei Punkte, zwei Linien oder zwei Kreise wählen und zuletzt die Symmetrielinie.');
        const ls = lines.filter(l => l !== axis);
        if (points.length === 2 && !ls.length && !rounds.length) return add([{ type: 'symmetric', a: points[0], b: points[1], l: axis }]);
        if (ls.length === 2 && !points.length && !rounds.length) {
          const A = cm.get(ls[0]), B = cm.get(ls[1]), X = cm.get(axis);
          const a1 = pm.get(X.p1), a2 = pm.get(X.p2);
          const dx = a2.x - a1.x, dy = a2.y - a1.y, L2 = dx * dx + dy * dy || 1e-18;
          const refl = p => { const t = ((p.x - a1.x) * dx + (p.y - a1.y) * dy) / L2; return [2 * (a1.x + t * dx) - p.x, 2 * (a1.y + t * dy) - p.y]; };
          const q = refl(pm.get(A.p1)), d1 = Math.hypot(q[0] - pm.get(B.p1).x, q[1] - pm.get(B.p1).y), d2 = Math.hypot(q[0] - pm.get(B.p2).x, q[1] - pm.get(B.p2).y);
          const pairs = d1 <= d2 ? [[A.p1, B.p1], [A.p2, B.p2]] : [[A.p1, B.p2], [A.p2, B.p1]];
          return add(pairs.map(([a, b]) => (a === b ? { type: 'pointOnCurve', p: a, c: axis } : { type: 'symmetric', a, b, l: axis })).sort((x, y) => (x.type === 'symmetric' ? -1 : 1) - (y.type === 'symmetric' ? -1 : 1)));
        }
        if (rounds.length === 2 && !points.length && !ls.length) {
          const A = cm.get(rounds[0]), B = cm.get(rounds[1]);
          if (A.type !== 'circle' || B.type !== 'circle') return need('Bei Bögen die Mittelpunkte oder Endpunkte einzeln symmetrisch setzen.');
          return add([{ type: 'symmetric', a: A.c, b: B.c, l: axis }, { type: 'equal', a: A.id, b: B.id }]);
        }
        return need('Für Symmetrisch zwei Punkte, zwei Linien oder zwei Kreise wählen und zuletzt die Symmetrielinie.');
      }
      case 'fix': {
        const pts = new Set(points.filter(p => p !== 'O'));
        curves.forEach(c => { const k = cm.get(c); if (!k.virtual) curvePointIds(k).forEach(p => pts.add(p)); });
        const already = new Set(this.f.rules.filter(r => r.type === 'fix').map(r => r.p));
        const todo = [...pts].filter(p => !already.has(p) && p !== 'O');
        if (!todo.length) return need('Punkte oder Kurven wählen, die fixiert werden sollen.');
        return add(todo.map(p => ({ type: 'fix', p })));
      }
      default:
        return false;
    }
  }

  deleteSelection() {
    const ids = [...this.sel].filter(id => !['O', 'OX', 'OY', 'AX', 'AY'].includes(id));
    if (!ids.length) return false;
    this.change(d => { deleteItems(d, ids); }, { check: false });
    this.sel.clear();
    this.render();
    this.emit();
    return true;
  }

  onKey(e) {
    if (this.editing) return false;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.shiftKey ? this.redo() : this.undo(); return true; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { this.redo(); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if ((this.tool === 'spline' || this.tool === 'cvspline') && (e.key === 'Enter' || e.key === 'Escape') && this.ts.pts && this.ts.pts.length >= 2) { this.finishSpline(false); return true; }
    if (VIN_FIELDS[this.tool] && this.ts.start) {
      const nF = VIN_FIELDS[this.tool].length;
      const vin = () => (this.vin = this.vin || { vals: Array(nF).fill(''), idx: 0 });
      if (/^[0-9.,]$/.test(e.key) || (e.key === '-' && this.tool === 'line') || ((e.key === '*' || e.key === '/' || e.key === '(' || e.key === ')') && this.vin)) { const v = vin(); v.vals[v.idx] += e.key; this.renderDyn(); return true; }
      if (e.key === 'Tab') { const v = vin(); v.idx = (v.idx + (e.shiftKey ? nF - 1 : 1)) % nF; this.renderDyn(); return true; }
      if (e.key === 'Backspace' && this.vin && this.vin.vals[this.vin.idx]) { this.vin.vals[this.vin.idx] = this.vin.vals[this.vin.idx].slice(0, -1); this.renderDyn(); return true; }
      if (e.key === 'Enter' && this.vin && this.vin.vals.some(x => x.trim())) { this.commitTyped(); return true; }
    }
    // Versatz: nach dem Anklicken der Kurve gleich den Abstand tippen (Seite = wo die Maus steht)
    if (this.tool === 'offset' && this.ts.curve && this.cursor && /^[0-9.,]$/.test(e.key)) { this.offsetTyped(e.key); return true; }
    if (e.key === 'Escape') {
      if (this.vin) { this.vin = null; this.renderDyn(); return true; }
      if (Object.keys(this.ts).length) { this.ts = {}; this.renderDyn(); }
      else if (this.tool) this.setTool(null);
      else if (this.sel.size) { this.sel.clear(); this.render(); this.emit(); }
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') return this.deleteSelection();
    if (/^polygon/.test(this.tool || '') && (e.key === '+' || e.key === '-')) { this.setPolySides(this.polySides + (e.key === '+' ? 1 : -1)); return true; }
    if ((this.tool === 'cpattern' || this.tool === 'lpattern') && (e.key === '+' || e.key === '-')) { this.setPatternCount(this.patternCount + (e.key === '+' ? 1 : -1)); return true; }
    const map = { l: 'line', r: e.shiftKey ? 'rectc' : 'rect', c: 'circle', a: e.shiftKey ? 'tarc' : 'arc', p: 'project', t: 'trim', f: e.shiftKey ? 'chamfer' : 'fillet', m: 'mirror', d: 'dim', o: 'offset', e: 'extend', v: e.shiftKey ? 'rotate' : 'move' };
    if (k === 't' && e.shiftKey) { this.setTool('text'); return true; }
    // die Taste des aktiven Werkzeugs startet es neu (schaltet es nicht ab)
    if (map[k]) { this.setTool(map[k]); return true; }
    if (k === 'x') { this.toggleConsMode(); return true; }
    return false;
  }

  /* ---------- Beschriftungen ziehen und anklicken ---------- */
  initLayerEvents() {
    this.layer.addEventListener('pointerdown', e => {
      const t = e.target.closest('[data-rule]');
      if (!t || e.button !== 0) return;
      e.stopPropagation();
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!add) this.sel.clear();
      if (add && this.sel.has(t.dataset.rule)) this.sel.delete(t.dataset.rule); else this.sel.add(t.dataset.rule);
      this.render();
      this.emit();
      if (t.classList.contains('sk-dim')) {
        const uv = this.vp.planeUV(e, this.pl);
        const r = this.f.rules.find(x => x.id === t.dataset.rule);
        if (uv && r) { let off0 = r.off ? r.off.slice() : [0, 0]; if (!r.off && (r.type === 'diameter' || r.type === 'radius')) { const an = dimAnchor(this.f, r, this.pm(), this.cm()), g = dimGeom(this.f, r, this.pm(), this.cm(), this.vp.uvPerPixel(this.pl, ...uv)); if (an && g) off0 = [g.label[0] - an[0], g.label[1] - an[1]]; } this.labelDrag = { rule: r, start: uv, off0, before: this.snapshot(), moved: false }; try { t.setPointerCapture(e.pointerId); } catch (_) { /* egal */ } }
      }
    });
    this.layer.addEventListener('pointermove', e => {
      if (!this.labelDrag) return;
      const uv = this.vp.planeUV(e, this.pl);
      if (uv) this.moveLabel(uv);
    });
    this.layer.addEventListener('pointerup', () => { if (this.labelDrag) this.endLabelDrag(); });
    this.layer.addEventListener('dblclick', e => {
      const t = e.target.closest('.sk-dim');
      if (t) { e.stopPropagation(); this.openEditor(t.dataset.rule); }
    });
  }
  moveLabel(uv) {
    const d = this.labelDrag;
    d.moved = true;
    d.rule.off = [d.off0[0] + uv[0] - d.start[0], d.off0[1] + uv[1] - d.start[1]];
    this.render();
  }
  endLabelDrag() {
    const d = this.labelDrag;
    this.labelDrag = null;
    if (d.moved) { this.undoStack.push(d.before); this.redoStack = []; this.emit(); }
  }

  /* ---------- Darstellung ---------- */
  render() {
    { const pm0 = this.pm(); bindTextPaths(this.f, c => curvePolyline(c, pm0, 64)); }
    const vp = this.vp, pl = this.pl, sk = this.f;
    vp.disposeGroup(this.group);
    const pm = this.pm(), cm = this.cm();
    const W = (u, v) => toWorld(pl, u, v);
    const scale = vp.uvPerPixel(pl, ...(this.cursor || [0, 0]));
    this.lastScale = scale;
    const done = this.status.dof === 0 && this.status.ok;

    // Raster und Achsen
    const step = nice(scale * 60);
    const span = step * 40, c0 = this.cursor || [0, 0];
    const gx0 = Math.floor((c0[0] - span / 2) / step) * step, gy0 = Math.floor((c0[1] - span / 2) / step) * step;
    // Hauptlinien jede fünfte Teilung kräftiger, daran Zahlen entlang der Achsen
    const garr = [], gmaj = [], major = v => Math.abs(Math.round(v / step) % 5) === 0, num = v => Math.abs(Math.round(v / step) % 2) === 0;
    this.axisNums = [];
    for (let i = 0; i <= 40; i++) {
      const x = gx0 + i * step, y = gy0 + i * step;
      (major(x) ? gmaj : garr).push(...W(x, gy0), ...W(x, gy0 + 40 * step));
      (major(y) ? gmaj : garr).push(...W(gx0, y), ...W(gx0 + 40 * step, y));
      if (num(x) && Math.abs(x) > step / 2) this.axisNums.push({ uv: [x, 0], text: fmtLen(x), axis: 'x' });
      if (num(y) && Math.abs(y) > step / 2) this.axisNums.push({ uv: [0, y], text: fmtLen(y), axis: 'y' });
    }
    this.group.add(lineSegs(garr, COL.grid, 0.07));
    this.group.add(lineSegs(gmaj, COL.grid, 0.18));
    const ax = span * 3;
    this.group.add(vp.fatLines([...W(-ax, 0), ...W(ax, 0)], COL.axisX, 1, { transparent: true, opacity: 0.55, dashed: true, dashSize: scale * 8, gapSize: scale * 5 }));
    this.group.add(vp.fatLines([...W(0, -ax), ...W(0, ax)], COL.axisY, 1, { transparent: true, opacity: 0.55, dashed: true, dashSize: scale * 8, gapSize: scale * 5 }));

    // geschlossene Profile leicht füllen
    let regs = [];
    try { regs = sketchRegions(sk).regions; } catch (_) { regs = []; }
    this.regionCount = regs.length;
    regs.forEach(r => {
      const tri = triangulate(r, W);
      if (tri) { const m = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: COL.region, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); m.renderOrder = 3; this.group.add(m); }
    });

    // Kurven
    const buckets = new Map();
    const put = (key, color, width, extra, arr) => {
      if (!buckets.has(key)) buckets.set(key, { color, width, extra, arr: [] });
      buckets.get(key).arr.push(...arr);
    };
    const conflictRefs = new Set();
    sk.rules.filter(r => this.status.conflicts.includes(r.id)).forEach(r => ['a', 'b', 'c', 'l', 'p'].forEach(k => r[k] && conflictRefs.add(r[k])));
    sk.curves.forEach(c => {
      if (this.hiddenCurve(c)) return;
      const pts = curvePolyline(c, pm, 96).map(p => W(p[0], p[1]));
      const arr = [];
      for (let i = 0; i < pts.length - 1; i++) arr.push(...pts[i], ...pts[i + 1]);
      const sel = this.sel.has(c.id), hov = this.hover && this.hover.id === c.id;
      if (c.ref && c.cons) put(sel ? 'ref-sel' : hov ? 'ref-hov' : 'ref', sel ? COL.sel : hov ? COL.hover : COL.ref, sel || hov ? 2.6 : 1.8, { dashed: true, dashSize: scale * 9, gapSize: scale * 3 }, arr);
      else if (c.ref) put(sel ? 'refp-sel' : hov ? 'refp-hov' : 'refp', sel ? COL.sel : hov ? COL.hover : COL.ref, sel || hov ? 3 : 2.4, {}, arr);
      else if (c.cons) put(sel ? 'cons-sel' : hov ? 'cons-hov' : 'cons', sel ? COL.sel : hov ? COL.hover : COL.cons, sel || hov ? 2.2 : 1.4, { dashed: true, dashSize: scale * 7, gapSize: scale * 4 }, arr);
      else if (sel) put('sel', COL.sel, 3, {}, arr);
      else if (hov) put('hov', COL.hover, 3, {}, arr);
      else if (conflictRefs.has(c.id)) put('bad', COL.fixed, 2.4, {}, arr);
      else put('geo', done ? COL.done : COL.geo, 2, {}, arr);
      // Krümmungskamm: Zähne von der Kurve weg gegen die Krümmungsmitte, Länge ∝ Krümmung, dazu die Hüllkurve
      if (this.showComb && !c.virtual) {
        const comb = curvatureComb(c, pm, 48);
        if (comb.length) {
          (this.combMax = this.combMax || {})[c.id] = Math.max(...comb.map(q => q.k));
          const km = Math.max(1e-9, ...Object.values(this.combMax)), Lpx = 60 * scale, tips = [], ca = [];
          comb.forEach(q => { const tip = [q.p[0] - q.nz[0] * q.k / km * Lpx, q.p[1] - q.nz[1] * q.k / km * Lpx]; tips.push(tip); ca.push(...W(q.p[0], q.p[1]), ...W(tip[0], tip[1])); });
          for (let i = 0; i < tips.length - 1; i++) ca.push(...W(tips[i][0], tips[i][1]), ...W(tips[i + 1][0], tips[i + 1][1]));
          put('comb', 0xb05cff, 1, {}, ca);
          this.combLines = (this.combLines || 0) + comb.length;
        }
      }
      // Steuerpolygon eines Kontrollpunkt-Splines gestrichelt
      if (c.type === 'spline' && (c.cv || c.conic != null) && !done) {
        const cp = c.pts.map(id => pm.get(id)).filter(Boolean).map(q => W(q.x, q.y)), pa = [];
        const seq = c.closed ? [...cp, cp[0]] : cp;
        for (let i = 0; i < seq.length - 1; i++) pa.push(...seq[i], ...seq[i + 1]);
        put('cvpoly', COL.cons, 1, { dashed: true, dashSize: scale * 4, gapSize: scale * 4 }, pa);
      }
    });
    (sk.texts || []).forEach(t => {
      const a = pm.get(t.p);
      if (!a) return;
      const o = textOutline(t.text, t.h, t.font);
      if (!o) { loadFont(t.font, () => this.render()); return; }
      const P = placeText(t, [a.x, a.y], o), arr = [];
      P.loops.forEach(l => { for (let i = 0; i < l.length - 1; i++) arr.push(...W(l[i][0], l[i][1]), ...W(l[i + 1][0], l[i + 1][1])); });
      const sel = this.sel.has(t.id), hov = this.hover && this.hover.id === t.id;
      put(sel ? 'tx-sel' : hov ? 'tx-hov' : 'tx', sel ? COL.sel : hov ? COL.hover : done ? COL.done : COL.geo, sel || hov ? 2 : 1.4, {}, arr);
      if (sel || hov) {
        const b = [];
        P.corners.forEach((c, i) => { const n = P.corners[(i + 1) % 4]; b.push(...W(c[0], c[1]), ...W(n[0], n[1])); });
        put(sel ? 'txb-sel' : 'txb-hov', sel ? COL.sel : COL.hover, 1, { dashed: true, dashSize: scale * 4, gapSize: scale * 3 }, b);
      }
    });
    ['AX', 'AY'].forEach(id => {
      if (!this.sel.has(id) && !(this.hover && this.hover.id === id)) return;
      put('axsel', this.sel.has(id) ? COL.sel : COL.hover, 2.4, {}, id === 'AX' ? [...W(-ax, 0), ...W(ax, 0)] : [...W(0, -ax), ...W(0, ax)]);
    });
    buckets.forEach(b => {
      if (!b.arr.length) return;
      const l = vp.fatLines(b.arr, b.color, b.width, { depthTest: false, ...b.extra });
      l.renderOrder = 6;
      this.group.add(l);
    });

    // Punkte
    const fixed = new Set(sk.rules.filter(r => r.type === 'fix').map(r => r.p));
    const pts = { normal: [], sel: [], fixed: [], hov: [], ref: [] };
    sk.points.forEach(p => {
      const w = W(p.x, p.y);
      if (this.sel.has(p.id)) pts.sel.push(...w);
      else if (this.hover && this.hover.id === p.id) pts.hov.push(...w);
      else if (!this.show.points) return;
      else if (p.ref) pts.ref.push(...w);
      else if (fixed.has(p.id)) pts.fixed.push(...w);
      else pts.normal.push(...w);
    });
    const oSel = this.sel.has('O') || (this.hover && this.hover.id === 'O');
    (oSel ? pts.sel : pts.fixed).push(...W(0, 0));
    // rund: normale Punkte weiß mit Rand, feste gefüllt, Zeiger und Auswahl gefüllt mit weißem Rand
    [['normal', done ? COL.done : COL.point, 6, 'ring'], ['ref', COL.ref, 6, 'ring'], ['fixed', COL.fixed, 6, 'voll'], ['hov', COL.hover, 8, 'rand'], ['sel', COL.sel, 8, 'rand']].forEach(([k, col, size, art]) => {
      if (!pts[k].length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts[k], 3));
      const p = new THREE.Points(g, punktMaterial(col, size, art));
      p.renderOrder = 8;
      this.group.add(p);
    });

    // Bemaßungen und Symbole (HTML-Elemente werden wiederverwendet, damit Ziehen nicht abreißt)
    this.htmlItems = [];
    const used = new Set();
    const getEl = (key, cls, text, rule, title) => {
      let e = this.htmlEls.get(key);
      if (!e) { e = el('div'); this.layer.appendChild(e); this.htmlEls.set(key, e); }
      e.className = cls;
      if (e.textContent !== text) e.textContent = text;
      e.dataset.rule = rule;
      e.title = title;
      used.add(key);
      return e;
    };
    const dimArr = [], dimSel = [], dimBad = [];
    sk.rules.forEach(r => {
      if (!DIMENSION_TYPES.has(r.type) || !this.show.dims) return;
      const g = dimGeom(sk, r, pm, cm, scale);
      if (!g) return;
      const target = this.sel.has(r.id) ? dimSel : this.status.conflicts.includes(r.id) ? dimBad : dimArr;
      g.segs.forEach(s => target.push(...W(s[0], s[1]), ...W(s[2], s[3])));
      const e = getEl('d:' + r.id, 'sk-dim' + (this.sel.has(r.id) ? ' sel' : '') + (this.status.conflicts.includes(r.id) ? ' bad' : ''), g.text, r.id, `${RULE_LABELS[r.type]} – Doppelklick zum Ändern, ziehen zum Verschieben`);
      this.htmlItems.push({ kind: 'dim', rule: r.id, el: e, world: W(g.label[0], g.label[1]) });
    });
    [[dimArr, COL.dim], [dimSel, COL.sel], [dimBad, COL.fixed]].forEach(([arr, col]) => {
      if (!arr.length) return;
      const l = vp.fatLines(arr, col, 1.2, { depthTest: false });
      l.renderOrder = 7;
      this.group.add(l);
    });
    // Bedingungssymbole nur an Elementen unter der Maus oder in der Auswahl (oder alle, wenn eingeschaltet)
    const focus = new Set([...this.sel]);
    if (this.hover) focus.add(this.hover.id);
    [...focus].forEach(id => { const c = cm.get(id); if (c && !c.virtual) curvePointIds(c).forEach(q => focus.add(q)); });
    const slots = new Map();
    sk.rules.forEach(r => {
      if (!GLYPH[r.type]) return;
      if (!this.showGlyphs && !focus.has(r.id) && !this.status.conflicts.includes(r.id) && !ruleRefs(r).some(id => focus.has(id))) return;
      glyphAnchors(sk, r, pm, cm).forEach((a, gi) => {
        const n = slots.get(a.key) || 0;
        slots.set(a.key, n + 1);
        const e = getEl(`g:${r.id}:${gi}`, 'sk-glyph' + (this.sel.has(r.id) ? ' sel' : '') + (this.status.conflicts.includes(r.id) ? ' bad' : ''), GLYPH[r.type], r.id, RULE_LABELS[r.type]);
        this.htmlItems.push({ kind: 'glyph', rule: r.id, el: e, world: W(a.uv[0], a.uv[1]), dir: a.dir ? [W(a.uv[0], a.uv[1]), W(a.uv[0] + a.dir[0], a.uv[1] + a.dir[1])] : null, slot: n });
      });
    });
    (this.axisNums || []).forEach((a, i) => {
      const e = getEl(`ax:${i}`, 'sk-axnum', a.text, '', '');
      this.htmlItems.push({ kind: 'axis', axis: a.axis, el: e, world: W(a.uv[0], a.uv[1]) });
    });
    this.htmlEls.forEach((e, k) => { if (!used.has(k)) { e.remove(); this.htmlEls.delete(k); } });
    this.positionHtml();
    this.renderDyn();
    vp.dirty = true;
  }

  /* Vorschau des aktiven Werkzeugs */
  renderDyn() {
    const vp = this.vp, pl = this.pl;
    vp.disposeGroup(this.dyn);
    const W = (u, v) => toWorld(pl, u, v);
    const cur = this.cursor;
    this.cursorLabel.hidden = true;
    if (!cur) { vp.dirty = true; return; }
    const ts = this.ts, t = this.tool;
    const arr = [], red = [], marks = [], bodyMarks = [];
    let text = '';
    const poly = pts => { for (let i = 0; i < pts.length - 1; i++) arr.push(...W(pts[i][0], pts[i][1]), ...W(pts[i + 1][0], pts[i + 1][1])); };
    const curveOf = (id, target = arr) => { const c = this.cm().get(id); if (!c) return; const pts = curvePolyline(c, this.pm(), 96).map(p => W(p[0], p[1])); for (let i = 0; i < pts.length - 1; i++) target.push(...pts[i], ...pts[i + 1]); };
    const circ = (c, r, a0 = 0, a1 = Math.PI * 2) => { const n = Math.max(12, Math.ceil(Math.abs(a1 - a0) / (Math.PI * 2) * 96)), pts = []; for (let i = 0; i <= n; i++) { const u = a0 + (a1 - a0) * i / n; pts.push([c[0] + r * Math.cos(u), c[1] + r * Math.sin(u)]); } poly(pts); };

    const violet = [], violetSel = [];
    const projLine = pr => { const pts = projPolyline(pr); for (let i = 0; i < pts.length - 1; i++) violet.push(...W(pts[i][0], pts[i][1]), ...W(pts[i + 1][0], pts[i + 1][1])); };
    if (this.hoverEdgeHit && (!t || t === 'dim' || t === 'mirror')) projLine(this.hoverEdgeHit.proj);
    if (!t) {
      if (this.hoverBody) bodyMarks.push(this.hoverBody.uv);
      if (this.hoverEdgeHit) text = 'Körperkante · Klick übernimmt sie';
    } else if (t === 'dim') {
      const r = this.previewDim(cur);
      if (r) {
        const g = dimGeom(this.f, r, this.pm(), this.cm(), vp.uvPerPixel(pl, ...cur));
        if (g) { g.segs.forEach(q => arr.push(...W(q[0], q[1]), ...W(q[2], q[3]))); text = g.text; }
      } else {
        const h = this.pickAt(cur);
        text = ts.refs ? 'zweites Element oder Platz für das Maß' : h || this.hoverBody ? 'anklicken zum Bemaßen' : '';
      }
      if (this.hoverBody) bodyMarks.push(this.hoverBody.uv);
      if (ts.refs) {
        const pm = this.pm(), cm = this.cm();
        new Set([...(ts.show || []), ...ts.refs]).forEach(id => {
          if (cm.has(id)) curveOf(id);
          else if (pm.has(id)) marks.push([pm.get(id).x, pm.get(id).y]);
        });
      }
    } else if (t === 'trim') {
      const h = this.pickAt(cur, { points: false });
      const c = h && this.cm().get(h.id);
      if (c && !c.virtual && !c.ref) {
        const pts = trimPreview(this.f, h.id, cur);
        if (pts) for (let i = 0; i < pts.length - 1; i++) red.push(...W(pts[i][0], pts[i][1]), ...W(pts[i + 1][0], pts[i + 1][1]));
        text = 'Stück entfernen';
      } else text = 'Kurvenstück anklicken';
    } else if (t === 'brk') {
      const h = this.pickAt(cur, { points: false });
      const c = h && this.cm().get(h.id);
      if (c && !c.virtual && !c.ref) {
        const pts = trimPreview(this.f, h.id, cur);
        if (pts) { poly(pts); marks.push(pts[0], pts[pts.length - 1]); }
        text = 'hier unterbrechen';
      } else text = 'Kurvenstück anklicken';
    } else if (t === 'fillet') {
      const pid = this.cornerAt(cur);
      if (pid) {
        const p = this.pm().get(pid);
        marks.push([p.x, p.y]);
        text = `Ecke verrunden · R ${fmtLen(this.filletRadius(pid))}`;
      } else text = 'Ecke anklicken';
    } else if (t === 'offset') {
      if (ts.curve) {
        const ch = chainFrom(this.f, ts.curve);
        if (ch) ch.items.forEach(i => curveOf(i.c.id, violetSel));
        const d = this.offsetDist(cur), pv = offsetPreview(this.f, ts.curve, d);
        pv.polys.forEach(poly);
        text = pv.ok ? `Versatz ${fmtLen(Math.abs(d))} · klicken` : pv.msg;
      } else {
        const h = this.pickAt(cur, { points: false });
        const ch = h && !['AX', 'AY'].includes(h.id) ? chainFrom(this.f, h.id) : null;
        if (ch) { ch.items.forEach(i => curveOf(i.c.id)); text = ch.items.length > 1 ? `Kette aus ${ch.items.length} Kurven` : 'Kurve versetzen'; }
        else text = 'Kurve oder Kette anklicken';
      }
    } else if (t === 'extend') {
      const h = this.pickAt(cur, { points: false });
      const c = h && this.cm().get(h.id);
      const pts = c && !c.virtual ? extendPreview(this.f, h.id, cur) : null;
      if (pts) { poly(pts); text = 'bis zur nächsten Kurve verlängern'; } else text = c && !c.virtual ? 'Ende ist nicht frei oder keine Kurve in Verlängerung' : 'Linie oder Bogen nahe am Ende anklicken';
    } else if (t === 'chamfer') {
      const pid = this.cornerAt(cur);
      if (pid) { const p = this.pm().get(pid); marks.push([p.x, p.y]); text = `Ecke fasen · ${fmtLen(this.chamferDist(pid))}`; }
      else text = 'Ecke anklicken';
    } else if (t === 'mirror') {
      if (ts.axis) { curveOf(ts.axis); text = 'Element zum Spiegeln anklicken'; }
      else text = ts.items && ts.items.length ? `Spiegelachse anklicken (${ts.items.length} Element${ts.items.length > 1 ? 'e' : ''})` : 'Spiegelachse anklicken';
      if (this.hoverBody) bodyMarks.push(this.hoverBody.uv);
    } else {
      // Zeichenwerkzeuge
      const sn = this.snapAt(cur);
      vp.hoverEdge(sn.bodyEdge ? sn.edgeIndex : null);
      if (sn.bodyEdge && sn.proj) projLine(sn.proj);
      let p = sn.uv;
      if (t === 'line' && ts.start) { const inf = this.inferLine(ts.start, sn); p = inf.uv; if (inf.h) text = 'H  '; if (inf.v) text = 'V  '; }
      if (!ts.start && this.vin) this.vin = null;
      if (this.vin && ts.start && VIN_FIELDS[t]) p = this.typedPoint(t, ts.start.uv, p);
      if (sn.bodyPoint || sn.bodyEdge) bodyMarks.push(p); else marks.push(p);
      const a = ts.start && ts.start.uv;
      if (t === 'line' && a) {
        poly([a, p]);
        text += fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]));
      } else if (t === 'rect' && a) {
        poly([a, [p[0], a[1]], p, [a[0], p[1]], a]);
        text = `${fmtLen(Math.abs(p[0] - a[0]))} × ${fmtLen(Math.abs(p[1] - a[1]))}`;
      } else if (t === 'rectc' && a) {
        const hx = Math.abs(p[0] - a[0]), hy = Math.abs(p[1] - a[1]);
        poly([[a[0] - hx, a[1] - hy], [a[0] + hx, a[1] - hy], [a[0] + hx, a[1] + hy], [a[0] - hx, a[1] + hy], [a[0] - hx, a[1] - hy]]);
        marks.push(a);
        text = `${fmtLen(2 * hx)} × ${fmtLen(2 * hy)}`;
      } else if (t === 'ellipse' && a) {
        marks.push(a);
        if (!ts.end) { poly([a, p]); text = `Hauptachse ${fmtLen(2 * Math.hypot(p[0] - a[0], p[1] - a[1]))}`; }
        else {
          const B = this.ellipseMinor(cur), A = ts.end.uv;
          if (B) {
            const g = { c: a, rx: Math.hypot(A[0] - a[0], A[1] - a[1]), ry: Math.hypot(B[0] - a[0], B[1] - a[1]), rot: Math.atan2(A[1] - a[1], A[0] - a[0]) };
            const pts = []; for (let i = 0; i <= 96; i++) pts.push(ellipsePoint(g, i / 96 * Math.PI * 2));
            poly(pts); poly([a, A]); poly([a, B]);
            text = `${fmtLen(2 * g.rx)} × ${fmtLen(2 * g.ry)}`;
          }
        }
      } else if (t === 'conic') {
        if (!ts.start) text = 'Konische Kurve: Startpunkt klicken';
        else if (!ts.end) { poly([ts.start.uv, p]); text = 'Endpunkt klicken'; }
        else {
          const P = [ts.start.uv, p, ts.end.uv], pts = [];
          for (let k = 0; k <= 48; k++) pts.push(conicAt(P, this.conicRho, k / 48));
          poly(pts); poly([ts.start.uv, p, ts.end.uv]);
          text = `Scheitelpunkt · ρ ${fmtNum(this.conicRho)} (${this.conicRho < 0.5 ? 'Ellipse' : this.conicRho > 0.5 ? 'Hyperbel' : 'Parabel'})`;
        }
      } else if (t === 'spline' || t === 'cvspline') {
        const P = (ts.pts || []).map(q => q.uv), cv = t === 'cvspline';
        P.forEach(q => marks.push(q));
        if (P.length) { if (cv) poly([...P, p]); poly(splinePoints([...P, p], false, 16, cv)); text = `${P.length + 1} ${cv ? 'Steuerpunkte' : 'Punkte'} · Doppelklick/Enter beendet, Klick auf den ersten Punkt schließt`; }
        else text = cv ? 'Spline mit Steuerpunkten: Punkte nacheinander klicken – die Kurve läuft nur durch Anfang und Ende' : 'Spline: Punkte nacheinander klicken';
      } else if (t === 'circle' && a) {
        const r = Math.hypot(p[0] - a[0], p[1] - a[1]);
        circ(a, r);
        text = `Ø ${fmtLen(2 * r)}`;
      } else if (t === 'tcircle2' || t === 'tcircle3') {
        const L = ts.lines || [], need = t === 'tcircle2' ? 2 : 3;
        L.forEach(x => curveOf(x.id));
        if (L.length < need) text = `${L.length + 1}. Linie anklicken`;
        else { const g = this.tanCircleGeom(L, p); if (g) { circ(g.c, g.r); text = `Ø ${fmtLen(2 * g.r)} · klicken`; } else text = 'Zeiger in den Winkel zwischen den Linien bewegen'; }
      } else if (t === 'cline' && a) {
        poly([[2 * a[0] - p[0], 2 * a[1] - p[1]], p]); marks.push(a);
        text = `${fmtLen(2 * Math.hypot(p[0] - a[0], p[1] - a[1]))}`;
      } else if (t === 'circle2' && a) {
        const c = [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2], r = Math.hypot(p[0] - a[0], p[1] - a[1]) / 2;
        circ(c, r); marks.push(a);
        text = `Ø ${fmtLen(2 * r)}`;
      } else if (t === 'circle3' && a) {
        marks.push(a);
        if (!ts.end) { poly([a, p]); text = 'zweiten Punkt auf dem Kreis klicken'; }
        else { marks.push(ts.end.uv); const g = arcThrough(a, ts.end.uv, p); if (g) { circ(g.c, g.r); text = `Ø ${fmtLen(2 * g.r)}`; } else text = 'Punkte liegen auf einer Linie'; }
      } else if (t === 'rect3' && a) {
        if (!ts.end) { poly([a, p]); text = `${fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]))} · Ende der ersten Kante`; }
        else { const R = rect3Corners(a, ts.end.uv, p); if (R) { poly([...R.pts, R.pts[0]]); text = `${fmtLen(R.len)} × ${fmtLen(Math.abs(R.w))}`; } }
      } else if (t === 'carc' && a) {
        marks.push(a);
        if (!ts.end) { poly([a, p]); text = `R ${fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]))} · Anfang des Bogens`; }
        else {
          const g = this.carcGeom(p);
          if (g) { const t0 = g.sweep >= 0 ? g.a0 : g.a0 + g.sweep, t1 = g.sweep >= 0 ? g.a0 + g.sweep : g.a0; circ(g.c, g.r, t0, t1); poly([g.c, g.e]); text = `R ${fmtLen(g.r)} · ${fmtNum(Math.abs(g.sweep) * 180 / Math.PI)}°`; }
        }
      } else if ((t === 'polygon' || t === 'polygonc' || t === 'polygone') && a) {
        const g = this.polyGeom(t, a, p), c0 = g.c;
        const R = Math.hypot(g.v[0] - c0[0], g.v[1] - c0[1]), phi = Math.atan2(g.v[1] - c0[1], g.v[0] - c0[0]), n = this.polySides, pts = [];
        for (let k = 0; k <= n; k++) pts.push([c0[0] + R * Math.cos(phi + k / n * Math.PI * 2), c0[1] + R * Math.sin(phi + k / n * Math.PI * 2)]);
        poly(pts);
        marks.push(a);
        text = t === 'polygonc' ? `${n}-Eck · Schlüsselweite ${fmtLen(2 * R * Math.cos(Math.PI / n))}  (+/− Ecken)` : t === 'polygone' ? `${n}-Eck · Kante ${fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]))}  (+/− Ecken)` : `${n}-Eck · Umkreis Ø ${fmtLen(2 * R)}  (+/− Ecken)`;
      } else if (t === 'slotarc3' && a) {
        if (!ts.end) { poly([a, p]); text = `Sehne ${fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]))}`; }
        else {
          const g = ts.arc || this.arc3Geom(a, ts.end.uv, p);
          if (g) {
            const t1 = g.t0 + g.sweep;
            if (!ts.arc) { circ(g.c, g.r, g.t0, t1); text = `R ${fmtLen(g.r)} · ${fmtNum(g.sweep * 180 / Math.PI)}°`; }
            else {
              const h = Math.min(Math.abs(Math.hypot(p[0] - g.c[0], p[1] - g.c[1]) - g.r), g.r * 0.999);
              const E = t => [g.c[0] + g.r * Math.cos(t), g.c[1] + g.r * Math.sin(t)];
              circ(g.c, g.r + h, g.t0, t1); circ(g.c, g.r - h, g.t0, t1);
              circ(E(t1), h, t1, t1 + Math.PI); circ(E(g.t0), h, g.t0 + Math.PI, g.t0 + 2 * Math.PI);
              text = `R ${fmtLen(g.r)} · ${fmtNum(g.sweep * 180 / Math.PI)}° · Breite ${fmtLen(2 * h)}`;
            }
          }
          marks.push(a, ts.end.uv);
        }
      } else if (t === 'slotarc' && a) {
        if (!ts.end) { poly([a, p]); text = `Radius ${fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]))}`; }
        else {
          const g = ts.arc || this.carcGeom(p);
          if (g) {
            const t0 = g.sweep >= 0 ? g.a0 : g.a0 + g.sweep, t1 = t0 + Math.abs(g.sweep);
            if (!ts.arc) { circ(g.c, g.r, t0, t1); text = `R ${fmtLen(g.r)} · ${fmtNum(Math.abs(g.sweep) * 180 / Math.PI)}°`; }
            else {
              const h = Math.min(Math.abs(Math.hypot(p[0] - g.c[0], p[1] - g.c[1]) - g.r), g.r * 0.999);
              const E = t => [g.c[0] + g.r * Math.cos(t), g.c[1] + g.r * Math.sin(t)];
              circ(g.c, g.r + h, t0, t1); circ(g.c, g.r - h, t0, t1);
              circ(E(t1), h, t1, t1 + Math.PI); circ(E(t0), h, t0 + Math.PI, t0 + 2 * Math.PI);
              text = `R ${fmtLen(g.r)} · ${fmtNum(Math.abs(g.sweep) * 180 / Math.PI)}° · Breite ${fmtLen(2 * h)}`;
            }
          }
        }
        marks.push(a);
      } else if ((t === 'slot' || t === 'slotov' || t === 'slotc') && a) {
        if (!ts.end) { poly([a, p]); text = `${t === 'slotov' ? 'Gesamtlänge' : t === 'slotc' ? 'Halber Abstand' : 'Abstand'} ${fmtLen(Math.hypot(p[0] - a[0], p[1] - a[1]))}`; }
        else {
          const h = this.slotHalfWidth(cur), sc = this.slotCenters(t, a, ts.end.uv, h) || [a, ts.end.uv];
          const A = sc[0], b = sc[1];
          const dx = b[0] - A[0], dy = b[1] - A[1], L = Math.hypot(dx, dy) || 1e-12, n = [-dy / L * h, dx / L * h];
          const ang = Math.atan2(dy, dx);
          poly([[A[0] + n[0], A[1] + n[1]], [b[0] + n[0], b[1] + n[1]]]);
          poly([[A[0] - n[0], A[1] - n[1]], [b[0] - n[0], b[1] - n[1]]]);
          circ(b, h, ang - Math.PI / 2, ang + Math.PI / 2);
          circ(A, h, ang + Math.PI / 2, ang + Math.PI * 1.5);
          marks.push(a, ts.end.uv);
          text = `${fmtLen(L + 2 * h)} × ${fmtLen(2 * h)}`;
        }
      } else if (t === 'tarc') {
        if (ts.start) {
          const g = tangentArcGeom(a, ts.start.tan.dir, p);
          if (g) {
            const ang = q => Math.atan2(q[1] - g.C[1], q[0] - g.C[0]);
            let t0 = ang(g.ccw ? a : p), t1 = ang(g.ccw ? p : a);
            while (t1 <= t0) t1 += Math.PI * 2;
            circ(g.C, g.r, t0, t1);
            text = `R ${fmtLen(g.r)}`;
          }
        } else text = 'freies Ende einer Linie oder eines Bogens';
      } else if (t === 'text') {
        text = 'Anfangspunkt des Textes klicken';
      } else if (t === 'move' || t === 'rotate' || t === 'cpattern' || t === 'lpattern') {
        const items = ts.items || [];
        const shadow = xf => items.forEach(id => {
          const c = this.cm().get(id);
          if (c) { poly(curvePolyline(c, this.pm(), 64).map(xf)); return; }
          const tx = (this.f.texts || []).find(x => x.id === id);
          if (tx) {
            const an = this.pm().get(tx.p), o = an && textOutline(tx.text, tx.h, tx.font);
            if (o) placeText(tx, [an.x, an.y], o).loops.forEach(l => poly(l.map(xf)));
            return;
          }
          const q = this.pm().get(id); if (q) marks.push(xf([q.x, q.y]));
        });
        if (!items.length) text = 'Erst Elemente auswählen';
        else if (t === 'move') {
          items.forEach(id => { if (this.cm().has(id)) curveOf(id, violetSel); });
          if (a) { const v = [p[0] - a[0], p[1] - a[1]]; shadow(q => [q[0] + v[0], q[1] + v[1]]); poly([a, p]); text = `${fmtLen(v[0])}  ${fmtLen(v[1])}${this.copyMode ? ' · Kopie' : ''}  (Strg = Kopie)`; }
          else text = 'Basispunkt klicken';
        } else if (t === 'rotate') {
          items.forEach(id => { if (this.cm().has(id)) curveOf(id, violetSel); });
          if (!ts.center) text = 'Drehpunkt klicken';
          else {
            marks.push(ts.center.uv);
            if (!ts.ref) { poly([ts.center.uv, p]); text = 'Bezugsrichtung klicken'; }
            else {
              const an = this.rotAngle({ uv: p }), C = ts.center.uv;
              shadow(rotateFn(C, an));
              poly([C, ts.ref.uv]); poly([C, p]);
              text = `${fmtNum(an * 180 / Math.PI, 1)}°${this.copyMode ? ' · Kopie' : ''}  (Strg = Kopie)`;
            }
          }
        } else {
          const n = this.patternCount;
          items.forEach(id => { if (this.cm().has(id)) curveOf(id, violetSel); });
          if (t === 'cpattern') {
            for (let k = 1; k < n; k++) { const an = Math.PI * 2 * k / n, ca = Math.cos(an), sa = Math.sin(an); shadow(q => [p[0] + (q[0] - p[0]) * ca - (q[1] - p[1]) * sa, p[1] + (q[0] - p[0]) * sa + (q[1] - p[1]) * ca]); }
            text = `${n}× um diesen Mittelpunkt  (+/− Anzahl)`;
          } else if (a) {
            const st = [p[0] - a[0], p[1] - a[1]];
            for (let k = 1; k < n; k++) shadow(q => [q[0] + st[0] * k, q[1] + st[1] * k]);
            poly([a, p]);
            text = `${n}× · Abstand ${fmtLen(Math.hypot(st[0], st[1]))}  (+/− Anzahl)`;
          } else text = `${n}× · Startpunkt des Abstands klicken`;
        }
      } else if (t === 'arc' && a) {
        if (!ts.end) { poly([a, p]); text = 'Endpunkt des Bogens'; }
        else {
          const g = arcThrough(a, ts.end.uv, p);
          if (g) {
            const [s, e] = g.ccw ? [a, ts.end.uv] : [ts.end.uv, a];
            const t0 = Math.atan2(s[1] - g.c[1], s[0] - g.c[0]); let t1 = Math.atan2(e[1] - g.c[1], e[0] - g.c[0]);
            while (t1 <= t0) t1 += Math.PI * 2;
            circ(g.c, g.r, t0, t1);
            text = `R ${fmtLen(g.r)}`;
          }
        }
      } else {
        text = `${fmtLen(p[0])}  ${fmtLen(p[1])}`;
        if (sn.bodyPoint) text = 'Körperpunkt · ' + text;
        else if (sn.bodyEdge) text = 'auf Körperkante · ' + text;
      }
    }
    const lines = (a, col, w) => { if (!a.length) return; const l = vp.fatLines(a, col, w, { depthTest: false }); l.renderOrder = 9; this.dyn.add(l); };
    lines(violet, COL.ref, 2.6);
    lines(violetSel, COL.sel, 3);
    lines(arr, COL.preview, 2);
    lines(red, COL.trim, 3.5);
    [[marks, COL.preview], [bodyMarks, COL.ref]].forEach(([m, col]) => {
      if (!m.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.flatMap(q => W(q[0], q[1])), 3));
      const pts = new THREE.Points(g, punktMaterial(col, 8, 'rand'));
      pts.renderOrder = 10;
      this.dyn.add(pts);
    });
    if (VIN_FIELDS[this.tool] && ts.start) {
      // Eingabefelder: aktuelles Feld markiert, Tab wechselt
      const F = VIN_FIELDS[this.tool], a2 = ts.start.uv, pc = this.typedPoint(this.tool, a2, this.cursor || a2);
      const live = [this.tool === 'line' ? Math.hypot(pc[0] - a2[0], pc[1] - a2[1]) : this.tool === 'circle' || this.tool === 'polygon' || this.tool === 'polygonc' ? 2 * Math.hypot(pc[0] - a2[0], pc[1] - a2[1]) : Math.abs(pc[0] - a2[0]) * (this.tool === 'rectc' ? 2 : 1),
        this.tool === 'line' ? Math.atan2(pc[1] - a2[1], pc[0] - a2[0]) * 180 / Math.PI : Math.abs(pc[1] - a2[1]) * (this.tool === 'rectc' ? 2 : 1)];
      text = F.map((nm, i) => {
        const typed = this.vin && this.vin.vals[i];
        const val = typed ? typed : i === 1 && this.tool === 'line' ? fmtNum(live[i], 1) + '°' : fmtLen(live[i]);
        return this.vin && this.vin.idx === i ? `▸${nm} ${val}▏` : `${nm} ${val}`;
      }).join('   ') + (this.vin ? '   ⏎' : '   (Zahl tippen)');
    }
    if (text) {
      this.cursorLabel.textContent = text;
      this.cursorLabel.hidden = false;
      this.cursorWorld = W(cur[0], cur[1]);
      this.positionCursor();
    }
    vp.dirty = true;
  }

  positionCursor() {
    if (this.cursorLabel.hidden || !this.cursorWorld) return;
    const s = this.vp.toScreen(this.cursorWorld);
    this.cursorLabel.style.transform = `translate(${(s[0] + 16).toFixed(0)}px, ${(s[1] + 14).toFixed(0)}px)`;
  }

  positionHtml() {
    const vp = this.vp;
    this.htmlItems.forEach(h => {
      const s = vp.toScreen(h.world);
      let x = s[0], y = s[1];
      if (h.kind === 'axis') { if (h.axis === 'x') y += 11; else x -= 14; }
      if (h.kind === 'glyph') {
        let nx = 0, ny = -1, tx = 1, ty = 0;
        if (h.dir) {
          const b = vp.toScreen(h.dir[1][0] != null ? h.dir[1] : h.dir[1]);
          const dx = b[0] - s[0], dy = b[1] - s[1], L = Math.hypot(dx, dy) || 1;
          tx = dx / L; ty = dy / L; nx = -ty; ny = tx;
          if (ny > 0) { nx = -nx; ny = -ny; }
        }
        x += nx * 17 + tx * 18 * h.slot;
        y += ny * 17 + ty * 18 * h.slot;
        if (!h.dir) { x += 12 + 18 * h.slot; y -= 10; }
      }
      h.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%)`;
    });
  }

  /* jedes gezeichnete Bild: HTML nachführen; bei starkem Zoom neu aufbauen */
  onFrame() {
    this.positionHtml();
    this.positionCursor();
    this.positionEditor();
    const s = this.vp.uvPerPixel(this.pl, ...(this.cursor || [0, 0]));
    if (this.lastScale && Math.abs(s / this.lastScale - 1) > 0.25 && !this.drag) this.render();
  }
}

/* ---------- Geometriehilfen ---------- */
function lineSegs(arr, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  l.renderOrder = 1;
  return l;
}

function triangulate(r, W) {
  try {
    const contour = r.poly.map(p => new THREE.Vector2(p[0], p[1]));
    const holes = r.holePolys.map(h => h.map(p => new THREE.Vector2(p[0], p[1])));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...r.poly, ...r.holePolys.flat()];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(all.flatMap(p => W(p[0], p[1])), 3));
    g.setIndex(tris.flat());
    return g;
  } catch (_) { return null; }
}

function projectOnCurve(c, pm, uv) {
  if (c.type === 'line') {
    const a = pm.get(c.p1), b = pm.get(c.p2);
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-18;
    const t = ((uv[0] - a.x) * dx + (uv[1] - a.y) * dy) / L2;
    return [a.x + t * dx, a.y + t * dy];
  }
  const cp = pm.get(c.c), d = Math.hypot(uv[0] - cp.x, uv[1] - cp.y) || 1e-12;
  return [cp.x + (uv[0] - cp.x) / d * c.r, cp.y + (uv[1] - cp.y) / d * c.r];
}

/* Abgebildete Körperkante als Punktzug */
function projPolyline(pr) {
  if (pr.kind === 'line') return [pr.a, pr.b];
  if (pr.kind === 'poly') return pr.pts;
  if (pr.kind === 'point') return [];
  const n = 96, out = [];
  let t0 = 0, t1 = Math.PI * 2;
  if (pr.kind === 'arc') {
    t0 = Math.atan2(pr.s[1] - pr.c[1], pr.s[0] - pr.c[0]);
    t1 = Math.atan2(pr.e[1] - pr.c[1], pr.e[0] - pr.c[0]);
    while (t1 <= t0) t1 += Math.PI * 2;
  }
  const k = Math.max(8, Math.ceil((t1 - t0) / (Math.PI * 2) * n));
  for (let i = 0; i <= k; i++) { const u = t0 + (t1 - t0) * i / k; out.push([pr.c[0] + pr.r * Math.cos(u), pr.c[1] + pr.r * Math.sin(u)]); }
  return out;
}

/* Nächster Punkt auf einer projizierten Körperkante (Linie, Kreis, Bogen, Linienzug) */
function nearestOnSeg(a, b, uv) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-18;
  const t = Math.max(0, Math.min(1, ((uv[0] - a[0]) * dx + (uv[1] - a[1]) * dy) / L2));
  return [a[0] + t * dx, a[1] + t * dy];
}
function nearestOnProj(pr, uv) {
  if (pr.kind === 'point') return { uv: pr.p.slice() };
  if (pr.kind === 'line') return { uv: nearestOnSeg(pr.a, pr.b, uv) };
  if (pr.kind === 'poly') {
    let best = null, bd = Infinity;
    for (let i = 0; i < pr.pts.length - 1; i++) {
      const q = nearestOnSeg(pr.pts[i], pr.pts[i + 1], uv), d = Math.hypot(q[0] - uv[0], q[1] - uv[1]);
      if (d < bd) { bd = d; best = { uv: q, seg: i }; }
    }
    return best;
  }
  const d = Math.hypot(uv[0] - pr.c[0], uv[1] - pr.c[1]) || 1e-12;
  const q = [pr.c[0] + (uv[0] - pr.c[0]) / d * pr.r, pr.c[1] + (uv[1] - pr.c[1]) / d * pr.r];
  if (pr.kind === 'arc') {
    const ang = p => Math.atan2(p[1] - pr.c[1], p[0] - pr.c[0]);
    const norm = x => { while (x < 0) x += Math.PI * 2; while (x >= Math.PI * 2) x -= Math.PI * 2; return x; };
    if (norm(ang(q) - ang(pr.s)) > norm(ang(pr.e) - ang(pr.s))) {
      const ds = Math.hypot(uv[0] - pr.s[0], uv[1] - pr.s[1]), de = Math.hypot(uv[0] - pr.e[0], uv[1] - pr.e[1]);
      return { uv: (ds < de ? pr.s : pr.e).slice(0, 2) };
    }
  }
  return { uv: q };
}

/* Rechteck mit 3 Punkten: Kante a → b, Breite = Abstand von p zu dieser Kante (mit Vorzeichen) */
export function rect3Corners(a, b, p) {
  const ux = b[0] - a[0], uy = b[1] - a[1], len = Math.hypot(ux, uy);
  if (len < 1e-9) return null;
  const nx = -uy / len, ny = ux / len, w = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny;
  if (Math.abs(w) < 1e-6) return null;
  const axis = Math.abs(uy) < 1e-9 ? 'h' : Math.abs(ux) < 1e-9 ? 'v' : null;
  return { pts: [a, b, [b[0] + nx * w, b[1] + ny * w], [a[0] + nx * w, a[1] + ny * w]], len, w, axis };
}

/* Kreis durch drei Punkte; ccw = ob der Weg s → e gegen den Uhrzeigersinn über m führt */
export function arcThrough(s, e, m) {
  const ax = s[0], ay = s[1], bx = e[0], by = e[1], cx = m[0], cy = m[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const ang = p => Math.atan2(p[1] - uy, p[0] - ux);
  const norm = t => { while (t < 0) t += Math.PI * 2; while (t >= Math.PI * 2) t -= Math.PI * 2; return t; };
  const tm = norm(ang(m) - ang(s)), te = norm(ang(e) - ang(s));
  return { c: [ux, uy], r, ccw: tm < te };
}

/* Bezugspunkt einer Bemaßung (der Text sitzt bei Bezug + Versatz) */
export function dimAnchor(sk, r, pm, cm) {
  const P = id => pm.get(id);
  const lineEnds = id => { const c = cm.get(id); return c && c.type === 'line' ? [P(c.p1), P(c.p2)] : null; };
  if (r.type === 'diameter' || r.type === 'radius') { const c = cm.get(r.c); const cp = c && P(c.c); return cp ? [cp.x, cp.y] : null; }
  if (r.type === 'angle') {
    const a = lineEnds(r.a), b = lineEnds(r.b);
    if (!a || !b) return null;
    const X = intersect(a, b);
    return X || [(a[0].x + b[0].x) / 2, (a[0].y + b[0].y) / 2];
  }
  const pair = dimPoints(r, pm, cm);
  return pair ? [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2] : null;
}
function dimPoints(r, pm, cm) {
  const P = id => pm.get(id);
  if (r.type === 'chamfer') { const A = P(r.p), B = P(r.a); return A && B ? [[A.x, A.y], [B.x, B.y]] : null; }
  if (r.type === 'offset') return offsetDimPoints(r, pm, cm);
  const lineEnds = id => { const c = cm.get(id); return c && c.type === 'line' ? [P(c.p1), P(c.p2)] : null; };
  if (r.type === 'distance' && r.b == null) { const e = lineEnds(r.a); return e ? [[e[0].x, e[0].y], [e[1].x, e[1].y]] : null; }
  const A = P(r.a), B = P(r.b), la = lineEnds(r.a), lb = lineEnds(r.b);
  if (A && B) return [[A.x, A.y], [B.x, B.y]];
  const pt = A || (la && lb ? la[0] : null), ln = A ? lb : lb;
  if (pt && ln) {
    const dx = ln[1].x - ln[0].x, dy = ln[1].y - ln[0].y, L2 = dx * dx + dy * dy || 1e-18;
    const t = ((pt.x - ln[0].x) * dx + (pt.y - ln[0].y) * dy) / L2;
    return [[pt.x, pt.y], [ln[0].x + t * dx, ln[0].y + t * dy]];
  }
  return null;
}
function intersect(a, b) {
  const x1 = a[0].x, y1 = a[0].y, x2 = a[1].x, y2 = a[1].y, x3 = b[0].x, y3 = b[0].y, x4 = b[1].x, y4 = b[1].y;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/* Linien einer Bemaßung in Skizzenkoordinaten (scale = mm pro Pixel, für Pfeile) */
export function dimGeom(sk, r, pm, cm, scale) {
  const g = dimGeomRaw(sk, r, pm, cm, scale);
  if (g && r.expr) g.text = 'fx: ' + g.text;
  return g;
}
function dimGeomRaw(sk, r, pm, cm, scale) {
  const anchor = dimAnchor(sk, r, pm, cm);
  if (!anchor) return null;
  let off = r.off || [0, 0];
  // Durchmesser/Radius ohne eigene Lage: Beschriftung schräg außerhalb, nicht auf dem Mittelpunkt
  if ((r.type === 'diameter' || r.type === 'radius') && Math.hypot(off[0], off[1]) < 1e-9) {
    const cc = cm.get(r.c), d = cc ? cc.r + Math.max(cc.r * 0.35, scale * 28) : 0;
    off = [d * Math.SQRT1_2, d * Math.SQRT1_2];
  }
  const L = [anchor[0] + off[0], anchor[1] + off[1]];
  const segs = [];
  const ah = scale * 9, gap = scale * 3, over = scale * 6;
  const arrow = (tip, dir) => {
    const [dx, dy] = dir, nx = -dy, ny = dx;
    segs.push([tip[0], tip[1], tip[0] - dx * ah + nx * ah * 0.35, tip[1] - dy * ah + ny * ah * 0.35]);
    segs.push([tip[0], tip[1], tip[0] - dx * ah - nx * ah * 0.35, tip[1] - dy * ah - ny * ah * 0.35]);
  };
  const val = Math.abs(r.value);
  let text = r.type === 'angle' ? fmtNum(val) : fmtLen(val);
  if (r.type === 'distance' || r.type === 'hdistance' || r.type === 'vdistance' || r.type === 'chamfer' || r.type === 'offset') {
    const pair = dimPoints(r, pm, cm);
    if (!pair) return null;
    const [A, B] = pair;
    let a2, b2, n;
    if (r.type === 'hdistance') { a2 = [A[0], L[1]]; b2 = [B[0], L[1]]; }
    else if (r.type === 'vdistance') { a2 = [L[0], A[1]]; b2 = [L[0], B[1]]; }
    else {
      const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1e-12;
      n = [-dy / len, dx / len];
      const s = (L[0] - anchor[0]) * n[0] + (L[1] - anchor[1]) * n[1];
      a2 = [A[0] + n[0] * s, A[1] + n[1] * s];
      b2 = [B[0] + n[0] * s, B[1] + n[1] * s];
    }
    // Hilfslinien
    [[A, a2], [B, b2]].forEach(([p, q]) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      if (l < gap) return;
      const ux = dx / l, uy = dy / l;
      segs.push([p[0] + ux * gap, p[1] + uy * gap, q[0] + ux * over, q[1] + uy * over]);
    });
    const dx = b2[0] - a2[0], dy = b2[1] - a2[1], l = Math.hypot(dx, dy) || 1e-12, ux = dx / l, uy = dy / l;
    segs.push([a2[0], a2[1], b2[0], b2[1]]);
    // Maßlinie bis zum Text verlängern, wenn er außerhalb liegt
    const tL = (L[0] - a2[0]) * ux + (L[1] - a2[1]) * uy;
    if (tL < 0) segs.push([a2[0], a2[1], a2[0] + ux * tL, a2[1] + uy * tL]);
    if (tL > l) segs.push([b2[0], b2[1], a2[0] + ux * tL, a2[1] + uy * tL]);
    arrow(a2, [-ux, -uy]);
    arrow(b2, [ux, uy]);
    const labelPos = [a2[0] + ux * Math.min(Math.max(tL, -l), 2 * l), a2[1] + uy * Math.min(Math.max(tL, -l), 2 * l)];
    return { segs, label: labelPos, text };
  }
  if (r.type === 'diameter' || r.type === 'radius') {
    const c = cm.get(r.c), cp = pm.get(c.c);
    let ux = off[0], uy = off[1];
    const ol = Math.hypot(ux, uy);
    if (ol < 1e-9) { ux = 1; uy = 0; } else { ux /= ol; uy /= ol; }
    const p1 = [cp.x + ux * c.r, cp.y + uy * c.r];
    if (r.type === 'diameter') {
      const p0 = [cp.x - ux * c.r, cp.y - uy * c.r];
      segs.push([p0[0], p0[1], p1[0], p1[1]]);
      arrow(p0, [-ux, -uy]);
      text = 'Ø' + text;
    } else {
      segs.push([cp.x, cp.y, p1[0], p1[1]]);
      text = 'R' + text;
    }
    arrow(p1, [ux, uy]);
    if (ol > c.r) segs.push([p1[0], p1[1], L[0], L[1]]);
    return { segs, label: L, text };
  }
  if (r.type === 'angle') {
    const P = id => pm.get(id);
    const A = cm.get(r.a), B = cm.get(r.b);
    if (!A || !B) return null;
    const ta = Math.atan2(P(A.p2).y - P(A.p1).y, P(A.p2).x - P(A.p1).x), tb = ta + r.value * Math.PI / 180;
    const rho = Math.max(scale * 20, Math.hypot(off[0], off[1]));
    const n = 40;
    for (let i = 0; i < n; i++) {
      const t0 = ta + (tb - ta) * i / n, t1 = ta + (tb - ta) * (i + 1) / n;
      segs.push([anchor[0] + rho * Math.cos(t0), anchor[1] + rho * Math.sin(t0), anchor[0] + rho * Math.cos(t1), anchor[1] + rho * Math.sin(t1)]);
    }
    segs.push([anchor[0], anchor[1], anchor[0] + (rho + over) * Math.cos(ta), anchor[1] + (rho + over) * Math.sin(ta)]);
    segs.push([anchor[0], anchor[1], anchor[0] + (rho + over) * Math.cos(tb), anchor[1] + (rho + over) * Math.sin(tb)]);
    const tm = (ta + tb) / 2;
    return { segs, label: [anchor[0] + rho * 1.18 * Math.cos(tm), anchor[1] + rho * 1.18 * Math.sin(tm)], text: fmtNum(val, 1) + '°' };
  }
  return null;
}

/* Wo das Symbol einer Bedingung sitzt (pro beteiligtem Element) */
function glyphAnchors(sk, r, pm, cm) {
  const out = [];
  const atCurve = id => {
    const c = cm.get(id);
    if (!c) return;
    if (c.virtual) { out.push({ key: id, uv: id === 'AX' ? [10, 0] : [0, 10], dir: id === 'AX' ? [1, 0] : [0, 1] }); return; }
    if (c.type === 'line') {
      const a = pm.get(c.p1), b = pm.get(c.p2);
      // bei 30 % der Linie statt in der Mitte – dort sitzen die Maße
      out.push({ key: id, uv: [a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3], dir: [b.x - a.x, b.y - a.y] });
    } else {
      const cp = pm.get(c.c);
      if (!cp || c.r == null) return;                                         // Spline, Ellipse: kein Kreismittelpunkt
      const t = c.type === 'arc' ? (c.a0 + c.a1) / 2 : Math.PI / 4;
      out.push({ key: id, uv: [cp.x + c.r * Math.cos(t), cp.y + c.r * Math.sin(t)], dir: [-Math.sin(t), Math.cos(t)] });
    }
  };
  const atPoint = id => { const p = pm.get(id); if (p) out.push({ key: id, uv: [p.x, p.y] }); };
  switch (r.type) {
    case 'horizontal': case 'vertical':
      if (r.l) atCurve(r.l); else { atPoint(r.a); atPoint(r.b); }
      break;
    case 'tangent':
      // an einem gemeinsamen Punkt (Spline-Stützpunkt, Endpunkt) dort, sonst an beiden Kurven
      if (r.via && pm.get(r.via)) atPoint(r.via); else { atCurve(r.a); atCurve(r.b); }
      break;
    case 'parallel': case 'perpendicular': case 'equal': case 'concentric':
      atCurve(r.a); atCurve(r.b);
      break;
    case 'coincident': atPoint(r.a); break;
    case 'symmetric': atPoint(r.a); atPoint(r.b); break;
    case 'pointOnCurve': case 'midpoint': atPoint(r.p); break;
    case 'fix': atPoint(r.p); break;
    default:
  }
  return out;
}
