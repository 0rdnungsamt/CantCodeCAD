// 3D-Skizze: Kurven im Raum ohne Ebene.
// Die Punkte einer ebenen Skizze sind u/v-Werte einer Ebene – hier sind es Weltkoordinaten
// (x, y, z). Neue Punkte landen dort, wohin man zeigt: der Zeiger trifft
// Modellkanten und -flächen, sonst gilt die Ebene senkrecht zum Blick durch den letzten
// Punkt. Bedingungen und Bemaßungen gibt es nicht, die Punkte bleiben frei.
import * as THREE from 'three';
import { punktMaterial } from '../punkte.js';
import {
  pointMap, curveMap, deleteItems, addPoint3, addLine3, addArc3, addCircle3, addSpline,
  curvePoints3, curveEnds3, chainCurves, pt3, setPt3, dist3,
} from './model.js';

const COL = { geo: 0x2563eb, done: 0x1f2933, cons: 0xd9822b, sel: 0xf97316, hover: 0x7cb2ff, preview: 0xf97316, point: 0x1d4ed8, snap: 0x3b9a4a };
export const TOOLS3D = { point: 'Punkt', line: 'Linie', arc3: 'Bogen durch drei Punkte', circle3: 'Kreis durch drei Punkte', spline: 'Spline' };
const GEO_KEYS = ['points', 'curves', 'rules', 'helpers', 'patterns', 'texts'];
const KEYS3D = { l: 'line', a: 'arc3', c: 'circle3', p: 'point' };   // „s“ ist überall die Befehlssuche
/* Abstand eines Bildpunkts zu einem Streckenzug (in Pixeln) */
function segDist(p, poly) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i], b = poly[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    let t = L > 1e-9 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

export class Sketch3DEditor {
  constructor(vp, feature, cb = {}) {
    this.vp = vp;
    this.f = feature;
    this.cb = cb;
    this.is3D = true;
    this.tool = null;
    this.sel = new Set();
    this.hover = null;
    this.cursor = null;   // Weltpunkt unter dem Zeiger
    this.snap = false;     // dieser Punkt kommt von einer Modellkante oder -fläche
    this.ts = [];          // Punkte des Werkzeugs, das gerade gezeichnet wird
    this.snapModel = true;
    this.drag = null;
    this.undoStack = [];
    this.redoStack = [];
    this.group = new THREE.Group();
    this.dyn = new THREE.Group();
    vp.scene.add(this.group, this.dyn);
    vp.setSketchHandler(this);
    this.render();
    this.emit();
  }

  destroy() {
    this.vp.setSketchHandler(null);
    this.vp.disposeGroup(this.group);
    this.vp.disposeGroup(this.dyn);
    this.vp.scene.remove(this.group, this.dyn);
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
    const selKinds = [...this.sel].map(id => (cm.has(id) ? cm.get(id).type : pm.has(id) ? 'point' : '?'));
    const geo = this.f.curves.filter(c => !c.cons);
    let chain = { error: '' };
    try { chain = chainCurves(geo, curveEnds3); } catch (err) { chain = { error: String((err && err.message) || err) }; }
    this.cb.onChange({
      kind3d: true, tool: this.tool, sel: selKinds, ok: true, conflicts: [], dof: null, regions: 0,
      curves: geo.length, pathClosed: !!chain.closed, pathError: chain.error || '',
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
    });
  }

  /* Änderung ohne Solver: eine 3D-Skizze hat keine Bedingungen, also gilt jede Setzung */
  change(fn, label = 'Die Änderung') {
    const before = this.snapshot();
    const draft = JSON.parse(before);
    const extra = fn(draft);
    if (extra === false) return false;
    if (JSON.stringify(Object.fromEntries(GEO_KEYS.map(k => [k, draft[k] || []]))) === before) return extra === undefined ? true : extra;
    GEO_KEYS.forEach(k => { this.f[k] = draft[k] || []; });
    this.undoStack.push(before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
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
    const alive = new Set([...this.f.points.map(p => p.id), ...this.f.curves.map(c => c.id)]);
    [...this.sel].forEach(id => { if (!alive.has(id)) this.sel.delete(id); });
    this.ts = [];
    this.render();
    this.emit();
  }

  /* ---------- Punkte im Raum ---------- */
  /* Ebene senkrecht zum Blick durch p: hierhin zeigt der Zeiger, wenn er nichts trifft */
  viewPlane(p) {
    const n = this.vp.camera.getWorldDirection(new THREE.Vector3());
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(p[0], p[1], p[2]));
  }
  /* Anker für die Blickebene: der letzte Punkt, sonst der nächste Punkt der Skizze, sonst der Ursprung */
  anchor() {
    if (this.ts.length) return this.ts[this.ts.length - 1].w;
    if (this.hover && this.hover.kind === 'point') { const p = this.pm().get(this.hover.id); if (p) return pt3(p); }
    const pm = this.pm();
    let best = null;
    pm.forEach(p => {
      if (p.virtual) return;
      const w = pt3(p), d = this.vp.toScreen(w);
      if (!best || d[2] < best[2]) best = [d[2], w];
    });
    return best ? best[1] : [0, 0, 0];
  }
  /* Weltpunkt unter dem Zeiger: erst das Modell (Kante oder Fläche), sonst die Blickebene */
  worldAt(e) {
    if (this.snapModel) {
      const p = this.vp.hitAtPointer(e);
      if (p) { this.snap = true; return [p.x, p.y, p.z]; }
    }
    this.snap = false;
    this.vp.ray.setFromCamera(this.vp.ndc(e), this.vp.camera);
    const hit = this.vp.ray.ray.intersectPlane(this.viewPlane(this.anchor()), new THREE.Vector3());
    return hit ? [hit.x, hit.y, hit.z] : null;
  }
  /* Bildschirmlage eines Weltpunkts in Pixeln des Ansichtsfensters (für die Auswahl) */
  pxOf(p) {
    const r = this.vp.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.vp.camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height];
  }
  pointerPx(e) {
    const r = this.vp.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  /* Nächster Skizzenpunkt unter dem Zeiger (in Bildpunkten) – Zeichenwerkzeuge benutzen ihn weiter */
  nearPoint(e) {
    const p = this.pointerPx(e);
    let best = null;
    this.f.points.forEach(q => {
      if (q.virtual) return;
      const s = this.pxOf(pt3(q));
      if (!s) return;
      const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d < 9 && (!best || d < best.d)) best = { kind: 'point', id: q.id, d };
    });
    return best;
  }
  /* Nächster Punkt oder nächste Kurve unter dem Zeiger */
  pickAt(e) {
    const p = this.pointerPx(e), pm = this.pm();
    const best = this.nearPoint(e);
    if (best) return best;
    this.f.curves.forEach(c => {
      const poly = curvePoints3(this.f, c, pm, 20).map(q => this.pxOf(q)).filter(Boolean);
      if (poly.length < 2) return;
      const d = segDist(p, poly);
      if (d < 6 && (!best || d < best.d)) best = { kind: 'curve', id: c.id, d };
    });
    return best;
  }

  /* ---------- Werkzeuge ---------- */
  setTool(t) {
    if (t && !TOOLS3D[t]) return;
    this.tool = this.tool === t ? null : t;
    this.ts = [];
    this.sel.clear();
    this.render();
    this.emit();
  }
  setSnapModel(on) { this.snapModel = !!on; this.renderDyn(); this.emit(); }
  /* Punkte, die das aktuelle Werkzeug schon gesetzt hat, an die Skizze anhängen.
     Ein Eintrag ist { w: Weltpunkt, id: vorhandener Punkt } – id gibt es, wenn der Zeiger
     einen Punkt der Skizze getroffen hat; dann wird dieser benutzt und kein neuer angelegt.
     Nur geteilte Punkte fügen zwei Kurven zu einem Zug zusammen. */
  pointIn(d, p) {
    if (p.id && d.points.some(q => q.id === p.id)) return p.id;
    return addPoint3(d, p.w[0], p.w[1], p.w[2]).id;
  }
  commit() {
    let pts = this.ts;
    this.ts = [];
    if (!pts.length) return false;
    const t = this.tool;
    if (t === 'point') {
      if (pts.length < 1) return false;
      return this.change(d => { pts.forEach(p => this.pointIn(d, p)); });
    }
    if (t === 'line') {
      if (pts.length < 2) return false;
      return this.change(d => {
        let prev = null;
        pts.forEach(p => {
          const id = this.pointIn(d, p);
          if (prev && id !== prev) addLine3(d, prev, id);
          prev = id;
        });
        return { last: prev };
      });
    }
    if (t === 'arc3' || t === 'circle3') {
      if (pts.length < 3) { if (pts.length) this.msg('Für den Bogen drei Punkte anklicken.'); return false; }
      const [a, b, c] = pts;
      return this.change(d => {
        const p1 = this.pointIn(d, a), p2 = this.pointIn(d, b), p3 = this.pointIn(d, c);
        (t === 'circle3' ? addCircle3 : addArc3)(d, p1, p2, p3);
        return { last: p3 };
      });
    }
    if (t === 'spline') {
      if (pts.length < 2) return false;
      // ein geschlossener Zug wiederholt seinen Anfangspunkt nicht
      const closed = pts.length > 2 && (pts[0].id ? pts[0].id === pts[pts.length - 1].id : dist3(pts[0].w, pts[pts.length - 1].w) < 1e-9);
      if (closed) pts = pts.slice(0, -1);
      return this.change(d => {
        const ids = pts.map(p => this.pointIn(d, p));
        addSpline(d, ids, closed);
        return { last: ids[ids.length - 1] };
      });
    }
    return false;
  }
  /* Fangradius in Millimetern: acht Bildpunkte */
  tol() { return Math.max(1e-6, this.vp.worldPerPixel() * 8); }
  /* Klick mit einem Zeichenwerkzeug */
  drawAt(e) {
    const near = this.nearPoint(e);
    let p;
    if (near) { p = pt3(this.pm().get(near.id)); this.snap = true; }
    else {
      p = this.worldAt(e);
      if (!p) return;
    }
    const at = { w: p, id: near ? near.id : null };
    const t = this.tool;
    if (t === 'point') { this.ts = [at]; this.commit(); this.renderDyn(); return; }
    if (t === 'line') {
      // wie in der ebenen Skizze: der Zug geht am letzten Endpunkt weiter
      const last = this.ts.length ? this.ts[this.ts.length - 1] : null;
      if (last && dist3(last.w, p) < this.tol()) return;
      this.ts.push(at);
      if (this.ts.length >= 2) {
        const made = this.commit();
        if (made && made.last) this.ts = [{ w: p, id: made.last }];   // weiterzeichnen am Endpunkt
      }
      this.renderDyn();
      return;
    }
    if (t === 'arc3' || t === 'circle3') {
      if (this.ts.length >= 3) this.ts = [];
      this.ts.push(at);
      if (this.ts.length === 3) this.commit();
      this.renderDyn();
      return;
    }
    if (t === 'spline') {
      const tol = this.tol();
      if (this.ts.length >= 3 && (at.id && at.id === this.ts[0].id || dist3(this.ts[0].w, p) < tol)) { this.ts.push(at); this.commit(); this.renderDyn(); return; }
      const last = this.ts.length ? this.ts[this.ts.length - 1] : null;
      if (last && dist3(last.w, p) < tol) { this.commit(); this.renderDyn(); return; }
      this.ts.push(at);
      this.renderDyn();
    }
  }
  deleteSelection() {
    if (!this.sel.size) return false;
    return this.change(d => { deleteItems(d, [...this.sel]); this.sel.clear(); }) !== false;
  }

  /* ---------- Zeiger ---------- */
  onPointerDown(e) {
    if (this.tool) { this.drawAt(e); return; }
    const hit = this.pickAt(e);
    if (!hit) { this.sel.clear(); this.render(); this.emit(); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { this.sel.has(hit.id) ? this.sel.delete(hit.id) : this.sel.add(hit.id); }
    else this.sel = new Set([hit.id]);
    if (hit.kind === 'point') {
      const p = this.pm().get(hit.id);
      if (p) this.drag = { id: hit.id, start: pt3(p), before: this.snapshot(), moved: false };
    }
    this.render();
    this.emit();
  }
  onPointerMove(e) {
    this.lastEvent = e;
    this.cursor = this.worldAt(e);
    const hit = this.tool ? null : this.pickAt(e);
    const same = (hit && this.hover && hit.id === this.hover.id) || (!hit && !this.hover);
    if (!same) { this.hover = hit; this.render(); }
    if (this.drag && e.buttons & 1) {
      const d = this.drag;
      const p = this.worldAtAt(e, d.start);
      if (p && (d.moved || dist3(p, d.start) / this.vp.worldPerPixel() > 4)) {
        d.moved = true;
        const pm = this.pm().get(d.id);
        if (pm) { setPt3(pm, p); this.render(); }
      }
    }
    this.renderDyn();
  }
  /* Ziehen bleibt in der Ebene durch den gezogenen Punkt senkrecht zum Blick */
  worldAtAt(e, at) {
    this.vp.ray.setFromCamera(this.vp.ndc(e), this.vp.camera);
    const hit = this.vp.ray.ray.intersectPlane(this.viewPlane(at), new THREE.Vector3());
    return hit ? [hit.x, hit.y, hit.z] : null;
  }
  onPointerUp() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (!d.moved) return;
    // Gezogenes ist schon im Dokument – die vorherige Fassung in die Rückgängig-Kette schieben
    this.undoStack.push(d.before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }
  onPointerLeave() { this.cursor = null; this.hover = null; this.render(); }
  onDblClick() {
    if (this.tool === 'spline' && this.ts.length >= 2) { this.commit(); this.renderDyn(); return; }
    if (this.tool) { this.setTool(null); return; }
  }

  onKey(e) {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.shiftKey ? this.redo() : this.undo(); return true; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { this.redo(); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (this.tool === 'spline' && (e.key === 'Enter' || e.key === 'Escape') && this.ts.length >= 2) { this.commit(); this.renderDyn(); return true; }
    if (e.key === 'Escape') {
      if (this.ts.length) { this.ts = []; this.renderDyn(); return true; }
      if (this.tool) { this.setTool(null); return true; }
      if (this.sel.size) { this.sel.clear(); this.render(); this.emit(); return true; }
      return false;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') return this.deleteSelection();
    if (KEYS3D[k]) { this.setTool(KEYS3D[k]); return true; }
    return false;
  }

  onFrame() { /* die Kurven liegen im Raum, ein Bildwechsel ändert nichts an ihnen */ }

  /* ---------- Zeichnen ---------- */
  hiddenCurve(c) { return c.cons && !this.showCons; }
  render() {
    const vp = this.vp;
    vp.disposeGroup(this.group);
    const pm = this.pm();
    const buckets = new Map();
    const put = (key, color, width, extra, arr) => {
      if (!buckets.has(key)) buckets.set(key, { color, width, extra, arr: [] });
      buckets.get(key).arr.push(...arr);
    };
    const segs = (pts) => { const a = []; for (let i = 0; i + 1 < pts.length; i++) a.push(...pts[i], ...pts[i + 1]); return a; };
    const dash = this.vp.worldPerPixel() * 8;
    this.f.curves.forEach(c => {
      const arr = segs(curvePoints3(this.f, c, pm, 64));
      if (!arr.length) return;
      const sel = this.sel.has(c.id), hov = this.hover && this.hover.id === c.id;
      if (c.cons) put(sel ? 'cons-sel' : 'cons', sel ? COL.sel : COL.cons, 1.6, { dashed: true, dashSize: dash, gapSize: dash * 0.4 }, arr);
      else if (sel) put('sel', COL.sel, 3, {}, arr);
      else if (hov) put('hov', COL.hover, 3, {}, arr);
      else put('geo', COL.geo, 2, {}, arr);
    });
    buckets.forEach(b => {
      if (!b.arr.length) return;
      const l = vp.fatLines(b.arr, b.color, b.width, { depthTest: false, ...b.extra });
      l.renderOrder = 6;
      this.group.add(l);
    });
    const pts = { normal: [], sel: [], hov: [] };
    this.f.points.forEach(p => {
      if (p.virtual) return;
      const w = pt3(p);
      if (this.sel.has(p.id)) pts.sel.push(...w);
      else if (this.hover && this.hover.id === p.id) pts.hov.push(...w);
      else pts.normal.push(...w);
    });
    [['normal', COL.point, 6, 'ring'], ['hov', COL.hover, 8, 'rand'], ['sel', COL.sel, 8, 'rand']].forEach(([k, col, size, art]) => {
      if (!pts[k].length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts[k], 3));
      const m = new THREE.Points(g, punktMaterial(col, size, art));
      m.renderOrder = 8;
      this.group.add(m);
    });
    this.renderDyn();
    vp.dirty = true;
  }

  /* Vorschau: was das Werkzeug gerade gesammelt hat und wohin der Zeiger zeigt */
  renderDyn() {
    const vp = this.vp;
    vp.disposeGroup(this.dyn);
    const arr = [], marks = [];
    const segs = (pts) => { for (let i = 0; i + 1 < pts.length; i++) arr.push(...pts[i], ...pts[i + 1]); };
    const t = this.tool, cur = this.cursor, done = this.ts.map(q => q.w);
    if (t && this.ts.length) {
      marks.push(...done.flat());
      segs(done);
      if (cur) {
        const need = t === 'line' ? 2 : t === 'spline' ? this.ts.length + 1 : 3;
        if (this.ts.length < need) segs([done[done.length - 1], cur]);
      }
    }
    if (t && cur && !this.ts.length) marks.push(...cur);
    if (arr.length) {
      const d = this.vp.worldPerPixel() * 8;
      const l = vp.fatLines(arr, COL.preview, 2, { depthTest: false, dashed: true, dashSize: d, gapSize: d * 0.5, transparent: true, opacity: 0.9 });
      l.renderOrder = 6;
      this.dyn.add(l);
    }
    if (marks.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
      const m = new THREE.Points(g, punktMaterial(this.snap ? COL.snap : COL.preview, 7, 'rand'));
      m.renderOrder = 8;
      this.dyn.add(m);
    }
    vp.dirty = true;
  }
}
