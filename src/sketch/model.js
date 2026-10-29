// Skizzen-Datenmodell: Punkte, Kurven und Regeln (Bedingungen und Bemaßungen).
// Kurven teilen sich Punkte über ihre IDs; ein gemeinsamer Punkt ist automatisch
// deckungsgleich. Reines JSON, damit Kern-Worker und Oberfläche dasselbe benutzen.

/* Feste Bezugsgeometrie jeder Skizze */
export const ORIGIN = 'O';
export const AXIS_X = 'AX';
export const AXIS_Y = 'AY';
export const VIRTUAL_POINTS = { O: [0, 0], OX: [1, 0], OY: [0, 1] };
export const VIRTUAL_CURVES = { AX: { id: 'AX', type: 'line', p1: 'O', p2: 'OX', cons: true, virtual: true }, AY: { id: 'AY', type: 'line', p1: 'O', p2: 'OY', cons: true, virtual: true } };

export const RULE_LABELS = {
  horizontal: 'Horizontal', vertical: 'Vertikal', parallel: 'Parallel', perpendicular: 'Senkrecht',
  tangent: 'Tangential', equal: 'Gleich', coincident: 'Deckungsgleich', pointOnCurve: 'Punkt auf Kurve',
  midpoint: 'Mittelpunkt', concentric: 'Konzentrisch', fix: 'Fixiert', symmetric: 'Symmetrisch', collinear: 'Kollinear',
  distance: 'Abstand', hdistance: 'Horizontaler Abstand', vdistance: 'Vertikaler Abstand',
  diameter: 'Durchmesser', radius: 'Radius', angle: 'Winkel', offset: 'Versatz', chamfer: 'Fase'
};
export const DIMENSION_TYPES = new Set(['distance', 'hdistance', 'vdistance', 'diameter', 'radius', 'angle', 'offset', 'chamfer']);

let counter = 0;
export function sid(prefix) {
  counter = (counter + 1) % 1e6;
  return prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
}

export function emptySketchGeo() { return { points: [], curves: [], rules: [] }; }

/* ---------- Zugriff ---------- */
export function pointMap(sk) {
  const m = new Map();
  Object.entries(VIRTUAL_POINTS).forEach(([id, xy]) => m.set(id, { id, x: xy[0], y: xy[1], virtual: true }));
  sk.points.forEach(p => m.set(p.id, p));
  return m;
}
export function curveMap(sk) {
  const m = new Map(Object.entries(VIRTUAL_CURVES));
  sk.curves.forEach(c => m.set(c.id, c));
  (sk.helpers || []).forEach(c => m.set(c.id, c));
  return m;
}
/* Unsichtbare Hilfskurven (z. B. für verknüpfte Muster): im Solver, aber nicht in Anzeige, Fang und Profil */
export function addHelper(sk, curve) {
  if (!sk.helpers) sk.helpers = [];
  const c = { id: sid('h'), cons: true, hidden: true, ...curve };
  sk.helpers.push(c);
  if (c.type === 'arc') syncArc(sk, c);
  return c;
}
export const curvePointIds = c => (c.type === 'line' ? [c.p1, c.p2] : c.type === 'circle' ? [c.c] : c.type === 'ellipse' ? [c.c, c.a, c.b] : c.type === 'spline' ? c.pts.slice() : c.type === 'arc3' || c.type === 'circle3' ? [c.p1, c.p2, c.p3] : [c.c, c.s, c.e]);
export const curveEndIds = c => (c.type === 'line' ? [c.p1, c.p2] : c.type === 'arc' ? [c.s, c.e] : c.type === 'arc3' ? [c.p1, c.p3] : c.type === 'spline' && !c.closed ? [c.pts[0], c.pts[c.pts.length - 1]] : []);

/* ---------- Ellipse und Spline ----------
   Ellipse: Mittelpunkt c, Ende der Hauptachse a, Ende der Nebenachse b. Die Achsen sind Konstruktionslinien
   (senkrecht zueinander) – so lassen sich Größe und Lage mit normalen Bemaßungen festlegen.
   Spline: Kurve durch die Punkte pts (zentripetale Catmull-Rom-Kurve), offen oder geschlossen.
   Tangentengriffe (c.tan = { Stützpunkt: { l: Hilfslinie, h: Griffpunkt } }): Die Konstruktionslinie vom
   Stützpunkt zum Griffpunkt gibt die Richtung der Kurve dort an, ihre Länge die Völligkeit. Sie ist eine normale Linie –
   horizontal, Winkel, Länge, parallel oder tangential an einen Bogen gehen mit den üblichen Bedingungen. */
export function ellipseGeom(c, pm) {
  const C = pm.get(c.c), A = pm.get(c.a), B = pm.get(c.b);
  if (!C || !A || !B) return null;
  const ux = A.x - C.x, uy = A.y - C.y, rx = Math.hypot(ux, uy);
  if (rx < 1e-9) return null;
  const ry = Math.abs(-(B.x - C.x) * uy / rx + (B.y - C.y) * ux / rx);
  return { c: [C.x, C.y], rx, ry: ry > 1e-9 ? ry : Math.hypot(B.x - C.x, B.y - C.y), rot: Math.atan2(uy, ux) };
}
export function ellipsePoint(g, t) {
  const cr = Math.cos(g.rot), sr = Math.sin(g.rot), x = g.rx * Math.cos(t), y = g.ry * Math.sin(t);
  return [g.c[0] + x * cr - y * sr, g.c[1] + x * sr + y * cr];
}
/* Stützpunkte eines Splines: [x, y], mit Tangentengriff [x, y, hx, hy] (Griff = Vektor Stützpunkt → Griffpunkt) */
export function splineP(c, pm) {
  const out = [];
  c.pts.forEach(id => {
    const p = pm.get(id);
    if (!p) return;
    if (p.z != null) { out.push([p.x, p.y, p.z]); return; }   // räumlicher Stützpunkt (3D-Skizze, ohne Griffe)
    const t = !c.cv && c.conic == null && c.tan && c.tan[id], h = t && pm.get(t.h);
    out.push(h ? [p.x, p.y, h.x - p.x, h.y - p.y] : [p.x, p.y]);
  });
  return out;
}
/* Spline-Punkte sind Listen beliebiger Dimension ([x, y] in der Skizze, [x, y, z] in der 3D-Skizze).
   Ein Tangentengriff sind zwei weitere Werte (x, y, Griff x, Griff y) – den gibt es nur in der
   ebenen Skizze, und nicht jeder Stützpunkt hat einen. Also immer nach der Zahl der Koordinaten
   rechnen (zwei Werte = ebene Skizze, drei Werte = räumlich), nie nach der Länge der Liste. */
const splDim = p => (p.length === 3 ? 3 : 2);
const splDs = (...ps) => Math.min(...ps.map(splDim));
const splIdx = n => Array.from({ length: n }, (_, d) => d);
const splGet = (P, closed, k) => {
  const n = P.length;
  if (closed) return P[((k % n) + n) % n];
  if (k < 0) return splIdx(splDim(P[0])).map(d => 2 * P[0][d] - P[1][d]);
  if (k >= n) return splIdx(splDim(P[n - 1])).map(d => 2 * P[n - 1][d] - P[n - 2][d]);
  return P[k];
};
/* Parameterschritt der zentripetalen Kurve: die Wurzel aus der Sehnenlänge (darum heißt sie zentripetal) */
const splDt = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(...splIdx(splDs(a, b)).map(d => b[d] - a[d]))));
/* Ableitung der zentripetalen Catmull-Rom-Kurve nach ihrem Parameter im Punkt b (Nachbarn a, c) */
const splM = (a, b, c) => { const ta = splDt(a, b), tc = splDt(b, c); return splIdx(splDs(a, b, c)).map(d => (b[d] - a[d]) / ta - (c[d] - a[d]) / (ta + tc) + (c[d] - b[d]) / tc); };
/* Tangente im Stützpunkt i: Catmull-Rom-Ableitung m und Bezugslänge s (Mittel der Parameterschritte links und rechts).
   Ein Griff h ersetzt m · s / 3; so ändert ein neu gesetzter Griff (h = m · s / 3) die Kurve nicht. */
export function splineTangent(P, closed, i) {
  const a = splGet(P, closed, i - 1), b = splGet(P, closed, i), c = splGet(P, closed, i + 1);
  return { m: splM(a, b, c), s: (splDt(a, b) + splDt(b, c)) / 2 };
}
/* Zentripetale Catmull-Rom-Kurve durch P (Liste [x, y]): Punkt im Abschnitt i bei Anteil f ∈ [0, 1] */
function splineSpan(P, closed, i, f) {
  const get = k => splGet(P, closed, k);
  const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
  /* mit Tangentengriff (der Punkt hat vier Werte: x, y, Griff x, Griff y – nur in der ebenen Skizze): der
     Abschnitt als kubische Bézierkurve; Arme aus dem Griff (h · Δt / s) oder wie Catmull-Rom (m · Δt / 3) –
     ohne Griff ist das genau die Catmull-Rom-Kurve, die Nachbarabschnitte schließen glatt an. */
  if (p1.length > 3 || p2.length > 3) {
    const D = splDt(p1, p2);
    const arm = (q, a, c) => (q.length > 2 ? [q[2] * D / ((splDt(a, q) + splDt(q, c)) / 2), q[3] * D / ((splDt(a, q) + splDt(q, c)) / 2)] : splM(a, q, c).map(v => v * D / 3));
    const A = arm(p1, p0, p2), B = arm(p2, p1, p3);
    const b1 = [p1[0] + A[0], p1[1] + A[1]], b2 = [p2[0] - B[0], p2[1] - B[1]], g = 1 - f;
    return [0, 1].map(d => g * g * g * p1[d] + 3 * g * g * f * b1[d] + 3 * g * f * f * b2[d] + f * f * f * p2[d]);
  }
  const tj = (a, b, t) => t + splDt(a, b);
  const t0 = 0, t1 = tj(p0, p1, t0), t2 = tj(p1, p2, t1), t3 = tj(p2, p3, t2);
  const L = (a, b, ta, tb, t) => splIdx(splDs(a, b)).map(d => a[d] * (tb - t) / (tb - ta) + b[d] * (t - ta) / (tb - ta));
  const t = t1 + (t2 - t1) * f;
  const A1 = L(p0, p1, t0, t1, t), A2 = L(p1, p2, t1, t2, t), A3 = L(p2, p3, t2, t3, t);
  const B1 = L(A1, A2, t0, t2, t), B2 = L(A2, A3, t1, t3, t);
  return L(B1, B2, t1, t2, t);
}
/* Kontrollpunkt-Spline („Spline mit Steuerpunkten“): die Punkte sind Steuerpunkte, die Kurve läuft nur durch
   Anfang und Ende. Offen: geklemmter B-Spline vom Grad min(3, n − 1) mit gleichmäßigen Knoten (de Boor); geschlossen:
   periodischer kubischer B-Spline mit gleichmäßigen Knoten. u ∈ [0, 1] über die ganze Kurve. */
function cvAt(P, closed, u) {
  const n = P.length;
  if (closed && n >= 3) {
    u = ((u % 1) + 1) % 1;
    const x = u * n, i = Math.min(n - 1, Math.floor(x)), t = x - i, g = k => P[((k % n) + n) % n];
    const b = [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
    const q = [g(i - 1), g(i), g(i + 1), g(i + 2)];
    return splIdx(splDim(q[0])).map(d => q.reduce((s, p, j) => s + p[d] * b[j], 0));
  }
  const k = Math.min(3, n - 1), m = n - k;                  // m Knotenabschnitte
  u = Math.max(0, Math.min(1, u));
  const knot = j => (j <= k ? 0 : j >= n ? 1 : (j - k) / m);
  let s = Math.min(n - 1, k + Math.floor(u * m));
  if (u >= 1) s = n - 1;
  const d = [];
  for (let j = 0; j <= k; j++) d.push(P[s - k + j].slice());
  for (let r = 1; r <= k; r++) for (let j = k; j >= r; j--) {
    const i = s - k + j, den = knot(i + k + 1 - r) - knot(i), a = den > 1e-12 ? (u - knot(i)) / den : 0;
    d[j] = d[j].map((v, dim) => (1 - a) * d[j - 1][dim] + a * v);
  }
  return d[k];
}
/* Konische Kurve: Start P0, Scheitel A (Schnitt der Endtangenten), Ende P2 und ρ ∈ (0, 1) – rationale
   quadratische Bézierkurve mit Gewicht w = ρ / (1 − ρ): ρ = ½ Parabel, kleiner Ellipse, größer Hyperbel
   (ρ = √2 − 1 bei rechtwinkligem, gleichschenkligem Scheitel = Viertelkreis). */
export function conicAt(P, rho, u) {
  const r = Math.max(0.001, Math.min(0.999, Number(rho) || 0.5)), w = r / (1 - r), t = Math.max(0, Math.min(1, u));
  const b0 = (1 - t) * (1 - t), b1 = 2 * w * t * (1 - t), b2 = t * t, s = b0 + b1 + b2;
  return [0, 1].map(d => (P[0][d] * b0 + P[1][d] * b1 + P[2][d] * b2) / s);
}
/* Punkt bei globalem Parameter u ∈ [0, 1] (geschlossene Kurven: u wird umgebrochen) */
export function splineAt(P, closed, u, cv = false) {
  const n = P.length;
  if (cv && n >= 2) return cvAt(P, closed, u);
  if (n < 2) return P[0] ? P[0].slice() : [0, 0];
  const spans = closed ? n : n - 1;
  if (closed) u = ((u % 1) + 1) % 1;
  else u = Math.max(0, Math.min(1, u));
  if (!closed && u >= 1) return P[n - 1].slice();
  const x = u * spans, i = Math.min(spans - 1, Math.floor(x));
  return splineSpan(P, closed, i, x - i);
}
export function splinePoints(P, closed = false, perSpan = 16, cv = false) {
  const n = P.length;
  if (n < 2) return P.slice();
  if (cv) { const m = Math.max(8, perSpan * (closed ? n : n - 1)), out = []; for (let k = 0; k <= m; k++) out.push(cvAt(P, closed, k / m)); return out; }
  const spans = closed ? n : n - 1, out = [];
  for (let i = 0; i < spans; i++) for (let k = 0; k < perSpan; k++) out.push(splineSpan(P, closed, i, k / perSpan));
  out.push(closed ? out[0].slice() : P[n - 1].slice());
  return out;
}
/* Kurvenpunkt bei u ∈ [0, 1] (Ellipse: Winkel u·2π ab der Hauptachse a) */
export function curveAt(c, pm, u) {
  if (c.type === 'ellipse') { const g = ellipseGeom(c, pm); return g ? ellipsePoint(g, u * Math.PI * 2) : [0, 0]; }
  const P = splineP(c, pm);
  if (c.conic != null && P.length === 3) return conicAt(P, c.conic, u);
  return splineAt(P, !!c.closed, u, !!c.cv);
}
export const isRanged = c => c.u0 != null && c.u1 != null;
/* Punktzug einer Ellipse/eines Splines (geschlossene Kurven: letzter Punkt = erster).
   Gestutzte Kurven haben einen Bereich u0…u1 (u1 > u0, darf bei geschlossenen über 1 gehen). */
export function curveSamples(c, pm, seg = 128) {
  if (isRanged(c)) {
    const m = Math.max(4, Math.ceil(seg * (c.u1 - c.u0)));
    const pts = [];
    if (c.type === 'ellipse') {
      const g = ellipseGeom(c, pm);
      if (!g) return [];
      for (let k = 0; k <= m; k++) pts.push(ellipsePoint(g, (c.u0 + (c.u1 - c.u0) * k / m) * Math.PI * 2));
    } else {
      const P = splineP(c, pm);
      if (P.length < 2) return [];
      for (let k = 0; k <= m; k++) { const u = c.u0 + (c.u1 - c.u0) * k / m; pts.push(c.conic != null && P.length === 3 ? conicAt(P, c.conic, u) : splineAt(P, !!c.closed, u, !!c.cv)); }
    }
    return pts;
  }
  if (c.type === 'ellipse') {
    const g = ellipseGeom(c, pm);
    if (!g) return [];
    const pts = [];
    for (let i = 0; i <= seg; i++) pts.push(ellipsePoint(g, i / seg * Math.PI * 2));
    pts[seg] = pts[0].slice();
    return pts;
  }
  if (c.type === 'spline') {
    const P = splineP(c, pm);
    if (c.conic != null && P.length === 3) { const out = []; for (let k = 0; k <= seg; k++) out.push(conicAt(P, c.conic, k / seg)); return out; }
    const spans = c.closed ? P.length : P.length - 1;
    // gleichmäßig in u, damit Parameter und Punktzug zusammenpassen
    return splinePoints(P, !!c.closed, Math.max(4, Math.round(seg / Math.max(1, spans))), !!c.cv);
  }
  return [];
}
export function addEllipse(sk, cId, A, B, cons = false) {
  const a = addPoint(sk, A[0], A[1]), b = addPoint(sk, B[0], B[1]);
  const l1 = addLine(sk, cId, a.id, true), l2 = addLine(sk, cId, b.id, true);
  addRule(sk, { type: 'perpendicular', a: l1.id, b: l2.id });
  const e = { id: sid('e'), type: 'ellipse', c: cId, a: a.id, b: b.id, axes: [l1.id, l2.id] };
  if (cons) e.cons = true;
  sk.curves.push(e);
  return e;
}
/* Tangentengriff an einem Stützpunkt setzen (Richtung und Länge so, dass die Kurve gleich bleibt) bzw. entfernen */
export function addSplineHandle(sk, c, pid) {
  if (!c || c.type !== 'spline' || c.cv || c.conic != null || !c.pts.includes(pid)) return null;
  if (c.tan && c.tan[pid]) return c.tan[pid];
  const pm = pointMap(sk), P = splineP(c, pm), i = c.pts.indexOf(pid), p = pm.get(pid);
  if (!p || P.length < 2) return null;
  const T = splineTangent(P, !!c.closed, i), h = addPoint(sk, p.x + T.m[0] * T.s / 3, p.y + T.m[1] * T.s / 3);
  const l = addLine(sk, pid, h.id, true);
  l.handle = c.id;
  c.tan = { ...(c.tan || {}), [pid]: { l: l.id, h: h.id } };
  return c.tan[pid];
}
export function removeSplineHandle(sk, c, pid) {
  const t = c && c.tan && c.tan[pid];
  if (!t) return false;
  // Tangential mitten auf der Kurve hängt am Griff – ohne ihn gibt es dort keine Tangente mehr (an den Enden schon)
  const mid = c.closed || (c.pts.indexOf(pid) > 0 && c.pts.indexOf(pid) < c.pts.length - 1);
  const rules = mid ? sk.rules.filter(r => r.type === 'tangent' && r.via === pid && (r.a === c.id || r.b === c.id)).map(r => r.id) : [];
  deleteItems(sk, [t.l, t.h, ...rules]);
  return true;
}
export function addSpline(sk, ids, closed = false, cons = false, cv = false, conic = null) {
  const c = { id: sid('s'), type: 'spline', pts: ids.slice(), closed: !!closed };
  if (cv) c.cv = true;
  if (conic != null) { c.conic = conic; c.closed = false; }
  if (cons) c.cons = true;
  sk.curves.push(c);
  return c;
}

export function ruleRefs(r) {
  const ids = [];
  ['a', 'b', 'p', 'c', 'l'].forEach(k => { if (r[k] != null) ids.push(r[k]); });
  if (Array.isArray(r.pairs)) r.pairs.forEach(q => ids.push(q.s, q.d));
  return ids;
}

/* ---------- Anlegen ---------- */
export function addPoint(sk, x, y) {
  const p = { id: sid('p'), x, y };
  sk.points.push(p);
  return p;
}
export function addLine(sk, p1, p2, cons = false) {
  const c = { id: sid('l'), type: 'line', p1, p2 };
  if (cons) c.cons = true;
  sk.curves.push(c);
  return c;
}
export function addCircle(sk, c, r, cons = false) {
  const k = { id: sid('c'), type: 'circle', c, r };
  if (cons) k.cons = true;
  sk.curves.push(k);
  return k;
}
/* Bogen gegen den Uhrzeigersinn von s nach e um den Mittelpunkt c */
export function addArc(sk, c, s, e, cons = false) {
  const a = { id: sid('a'), type: 'arc', c, s, e, r: 1, a0: 0, a1: 1 };
  if (cons) a.cons = true;
  sk.curves.push(a);
  syncArc(sk, a);
  return a;
}
export function addRule(sk, rule) {
  // Punkt auf Spline: der Punkt wird zum Stützpunkt der Spline (sie läuft dann genau durch ihn)
  if (rule.type === 'pointOnCurve') {
    const c = [...sk.curves, ...(sk.helpers || [])].find(x => x.id === rule.c);
    if (c && c.type === 'spline' && !c.cv && c.conic == null && !c.pts.includes(rule.p)) {
      const pm = pointMap(sk), q = pm.get(rule.p), P = splineP(c, pm);
      if (q && P.length >= 2) {
        const spans = c.closed ? P.length : P.length - 1;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < spans; i++) for (let k = 0; k <= 16; k++) { const s = splineSpan(P, !!c.closed, i, k / 16), d = Math.hypot(s[0] - q.x, s[1] - q.y); if (d < bd) { bd = d; bi = i; } }
        c.pts.splice(bi + 1, 0, rule.p);
        delete c.u0; delete c.u1;
        return { id: null, type: 'knot' };
      }
    }
  }
  const r = { id: sid('r'), ...rule };
  sk.rules.push(r);
  return r;
}

/* Radius und Winkel eines Bogens aus seinen Punkten berechnen */
export function syncArc(sk, a, pm = pointMap(sk)) {
  const c = pm.get(a.c), s = pm.get(a.s), e = pm.get(a.e);
  if (!c || !s || !e) return;
  a.r = Math.hypot(s.x - c.x, s.y - c.y) || 1e-6;
  a.a0 = Math.atan2(s.y - c.y, s.x - c.x);
  a.a1 = Math.atan2(e.y - c.y, e.x - c.x);
  if (a.a1 <= a.a0) a.a1 += Math.PI * 2;
}

export function addRect(sk, x0, y0, x1, y1, cons = false) {
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => addPoint(sk, x, y));
  const lines = pts.map((p, i) => addLine(sk, p.id, pts[(i + 1) % 4].id, cons));
  addRule(sk, { type: 'horizontal', l: lines[0].id });
  addRule(sk, { type: 'horizontal', l: lines[2].id });
  addRule(sk, { type: 'vertical', l: lines[1].id });
  addRule(sk, { type: 'vertical', l: lines[3].id });
  return { points: pts, lines };
}

/* ---------- Löschen mit Folgen ---------- */
export function deleteItems(sk, ids) {
  const del = new Set(ids);
  // gelöschte Texte nehmen ihren Ankerpunkt mit
  (sk.texts || []).forEach(t => { if (del.has(t.id)) del.add(t.p); });
  // Punkte löschen zieht Kurven mit
  sk.curves.forEach(c => { if (curvePointIds(c).some(p => del.has(p))) del.add(c.id); });
  // Ellipsen nehmen ihre Achsen mit, Splines ihre Tangentengriffe
  sk.curves.forEach(c => { if (del.has(c.id) && c.axes) c.axes.forEach(x => del.add(x)); });
  sk.curves.forEach(c => { if (del.has(c.id) && c.tan) Object.values(c.tan).forEach(t => { del.add(t.l); del.add(t.h); }); });
  const touched = new Set();
  sk.curves.forEach(c => { if (del.has(c.id)) curvePointIds(c).forEach(p => touched.add(p)); });
  sk.curves = sk.curves.filter(c => !del.has(c.id));
  // Punkte der gelöschten Kurven fallen weg, wenn keine andere sichtbare Kurve sie benutzt
  const used = new Set();
  sk.curves.forEach(c => curvePointIds(c).forEach(p => used.add(p)));
  (sk.texts || []).forEach(t => { if (!del.has(t.id)) used.add(t.p); });
  sk.points = sk.points.filter(p => !del.has(p.id) && (used.has(p.id) || !touched.has(p.id)));
  const pts = new Set(sk.points.map(p => p.id));
  const ok = id => pts.has(id) || id in VIRTUAL_POINTS;
  // Hilfskurven, deren Punkte weg sind, und Texte ohne Anker verschwinden mit
  if (sk.helpers) sk.helpers = sk.helpers.filter(c => !del.has(c.id) && curvePointIds(c).every(ok));
  if (sk.texts) sk.texts = sk.texts.filter(t => !del.has(t.id) && ok(t.p));
  const alive = new Set([...pts, ...sk.curves.map(c => c.id), ...(sk.helpers || []).map(c => c.id), ...Object.keys(VIRTUAL_POINTS), ...Object.keys(VIRTUAL_CURVES)]);
  sk.rules = sk.rules.filter(r => !del.has(r.id) && ruleRefs(r).every(id => alive.has(id)));
  // Griffe, deren Hilfslinie oder Punkt weg ist, und Griffe an entfernten Stützpunkten fallen weg
  const lines = new Set(sk.curves.map(c => c.id));
  sk.curves.forEach(c => {
    if (!c.tan) return;
    Object.keys(c.tan).forEach(pid => { const t = c.tan[pid]; if (!c.pts.includes(pid) || !lines.has(t.l) || !pts.has(t.h)) delete c.tan[pid]; });
    if (!Object.keys(c.tan).length) delete c.tan;
  });
}

/* ---------- 3D-Skizzen (ohne Ebene) ----------
   Eine Skizze ohne plane ist räumlich: ihre Punkte liegen in Weltkoordinaten (x, y, z), ihre
   Kurven sind Linien, Bögen und Kreise durch drei Punkte und Splines. Bedingungen, Bemaßungen
   und Profile gibt es hier nicht – die Punkte sind frei und werden durch Ziehen im Raum gesetzt.
   Benutzt wird das für Pfade (Auszug, Rohr, Anordnung entlang Pfad) und als
   Arbeitsebene entlang eines Pfads. */
export const is3D = sk => !sk.plane;
export const pt3 = p => [p.x || 0, p.y || 0, p.z || 0];
export const setPt3 = (p, q) => { p.x = q[0]; p.y = q[1]; p.z = q[2] || 0; };
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function addPoint3(sk, x, y, z) { const p = { id: sid('p'), x, y, z: z || 0 }; sk.points.push(p); return p; }
export const addLine3 = (sk, p1, p2) => addLine(sk, p1, p2);
/* Bogen durch drei Punkte: p1 Anfang, p2 Punkt dazwischen, p3 Ende – der Bogen läuft von p1
   über p2 nach p3. addCircle3 ist die geschlossene Variante: der ganze Kreis durch die Punkte. */
export function addArc3(sk, p1, p2, p3) {
  const c = { id: sid('a'), type: 'arc3', p1, p2, p3 };
  sk.curves.push(c);
  return c;
}
export function addCircle3(sk, p1, p2, p3) {
  const c = { id: sid('a'), type: 'circle3', p1, p2, p3, closed: true };
  sk.curves.push(c);
  return c;
}

/* Kreis durch drei Punkte in Weltkoordinaten: Mittelpunkt m, Radius r, die Achsen ex, ey seiner
   Ebene (n = ex × ey zeigt aus ihr heraus) und die Winkel der drei Punkte in diesem Rahmen. */
export function circum3(a, b, c) {
  const u = sub3(b, a), v = sub3(c, a), n = cross3(u, v), ln = Math.hypot(...n);
  const uw = Math.hypot(...u);
  if (ln < 1e-9 || uw < 1e-9) return null;
  const ex = u.map(q => q / uw), ey = cross3(n, ex).map(q => q / ln);
  const vc = dot3(v, ex), wc = dot3(v, ey);
  if (Math.abs(wc) < 1e-9) return null;                     // die drei Punkte liegen auf einer Geraden
  const mx = uw / 2, my = ((vc * vc + wc * wc) / 2 - mx * vc) / wc;
  const m = [a[0] + mx * ex[0] + my * ey[0], a[1] + mx * ex[1] + my * ey[1], a[2] + mx * ex[2] + my * ey[2]];
  return {
    m, r: Math.hypot(mx, my), ex, ey, n: n.map(q => q / ln),
    ta: Math.atan2(-my, -mx), tb: Math.atan2(-my, uw / 2), tc: Math.atan2(wc - my, vc - mx),
  };
}
/* Bogen von a über b nach c: gegen den Uhrzeigersinn um n, von ta um span */
export function arc3Geom(a, b, c) {
  const g = circum3(a, b, c);
  if (!g) return null;
  let span = g.tc - g.ta;
  while (span <= 1e-9) span += Math.PI * 2;
  while (span > Math.PI * 2) span -= Math.PI * 2;
  return { ...g, span };
}
export const arc3Point = (g, t) => [
  g.m[0] + g.r * (Math.cos(t) * g.ex[0] + Math.sin(t) * g.ey[0]),
  g.m[1] + g.r * (Math.cos(t) * g.ex[1] + Math.sin(t) * g.ey[1]),
  g.m[2] + g.r * (Math.cos(t) * g.ex[2] + Math.sin(t) * g.ey[2]),
];

/* Endpunkte einer räumlichen Kurve, wie sie für einen Zug aneinandergereiht werden
   (eine geschlossene Kurve hat denselben Anfangs- und Endpunkt) */
export const curveEnds3 = c => (c.type === 'arc3' ? [c.p1, c.p3]
  : c.type === 'circle3' ? [c.p1, c.p1]
    : c.type === 'spline' ? [c.pts[0], c.closed ? c.pts[0] : c.pts[c.pts.length - 1]]
      : [c.p1, c.p2]);

/* Punktzug einer räumlichen Kurve in Weltkoordinaten */
export function curvePoints3(sk, c, pm = pointMap(sk), seg = 48) {
  if (c.type === 'line') {
    const a = pm.get(c.p1), b = pm.get(c.p2);
    return a && b ? [pt3(a), pt3(b)] : [];
  }
  if (c.type === 'arc3' || c.type === 'circle3') {
    const a = pm.get(c.p1), b = pm.get(c.p2), d = pm.get(c.p3);
    if (!a || !b || !d) return [];
    const A = pt3(a), B = pt3(b), C = pt3(d);
    const g = circum3(A, B, C);
    if (!g) return c.type === 'circle3' ? [] : [A, B, C];
    const full = c.type === 'circle3' ? Math.PI * 2 : arc3Geom(A, B, C).span;
    const n = Math.max(4, Math.ceil(full / (Math.PI * 2) * seg));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(arc3Point(g, g.ta + full * i / n));
    if (c.type === 'circle3') pts[pts.length - 1] = pts[0].slice();
    return pts;
  }
  return curveSamples(c, pm, seg);
}

/* Ebene aus einem Punktzug: { o, n } wenn alle Punkte in einer Ebene liegen, sonst null.
   Benutzt, wenn ein räumlicher Pfad eine Ebene braucht (Zylinderachse, Verdrehung). */
export function planeFromPoints(pts, rel = 1e-6) {
  if (pts.length < 3) return null;
  const o = pts[0];
  let n = null;
  for (let i = 1; i < pts.length - 1 && !n; i++)
    for (let j = i + 1; j < pts.length && !n; j++) {
      const c = cross3(sub3(pts[i], o), sub3(pts[j], o)), l = Math.hypot(...c);
      if (l > 1e-9) n = c.map(q => q / l);
    }
  if (!n) return null;
  let scale = 0;
  pts.forEach(q => { scale = Math.max(scale, dist3(q, o)); });
  if (scale < 1e-9) return null;
  const tol = Math.max(1e-9, scale * rel);
  return pts.some(q => Math.abs(dot3(sub3(q, o), n)) > tol) ? null : { o, n };
}

/* Kurven zu einem Zug aneinanderfügen (Pfade in ebenen und räumlichen Skizzen).
   endsOf(c) sind die beiden Endpunkte der Kurve. Ergebnis: Reihenfolge mit Richtung
   (flip = Endpunkte vertauschen) und closed. Bei einem Fehler kommt { error }. */
export function chainCurves(curves, endsOf) {
  if (!curves.length) return { error: 'Es stehen keine Kurven zur Verfügung' };
  const deg = new Map();
  curves.forEach(c => endsOf(c).forEach(id => deg.set(id, (deg.get(id) || 0) + 1)));
  if ([...deg.values()].some(v => v > 2)) return { error: 'Der Pfad verzweigt sich' };
  const frei = [...deg.entries()].filter(([, v]) => v === 1);
  const closed = !frei.length;
  const start = closed ? endsOf(curves[0])[0] : frei[0][0];
  const rest = curves.slice(), out = [];
  let cur = start;
  while (rest.length) {
    const i = rest.findIndex(c => { const e = endsOf(c); return e[0] === cur || e[1] === cur; });
    if (i < 0) return { error: closed ? 'Der Pfad ist nicht geschlossen' : 'Der Pfad hat eine Lücke' };
    const c = rest.splice(i, 1)[0], e = endsOf(c), flip = e[0] !== cur;
    out.push({ c, flip });
    cur = e[flip ? 0 : 1];
  }
  if (closed && cur !== start) return { error: 'Der Pfad ist nicht geschlossen' };
  return { order: out, closed };
}

/* ---------- alte Skizzen (Rechteck/Kreis/Linienzug-Elemente) übernehmen ---------- */
export function migrateSketch(sk) {
  if (Array.isArray(sk.points) && Array.isArray(sk.curves)) {
    if (!Array.isArray(sk.rules)) sk.rules = [];
    return sk;
  }
  const out = { ...sk, ...emptySketchGeo() };
  delete out.entities;
  (sk.entities || []).forEach(en => {
    if (en.type === 'rect') {
      const hw = Math.abs(en.w) / 2, hh = Math.abs(en.h) / 2;
      const r = addRect(out, en.cx - hw, en.cy - hh, en.cx + hw, en.cy + hh);
      addRule(out, { type: 'hdistance', a: r.points[0].id, b: r.points[1].id, value: 2 * hw, off: [0, -8] });
      addRule(out, { type: 'vdistance', a: r.points[1].id, b: r.points[2].id, value: 2 * hh, off: [8, 0] });
    } else if (en.type === 'circle') {
      const c = addPoint(out, en.cx, en.cy);
      const k = addCircle(out, c.id, en.d / 2);
      addRule(out, { type: 'diameter', c: k.id, value: en.d, off: [en.d / 2 + 6, en.d / 2 + 6] });
    } else if (en.type === 'poly' && en.pts && en.pts.length >= 3) {
      const pts = en.pts.map(([x, y]) => addPoint(out, x, y));
      pts.forEach((p, i) => addLine(out, p.id, pts[(i + 1) % pts.length].id));
    }
  });
  return out;
}

/* ---------- Messen (aktueller Ist-Wert einer Bemaßung) ---------- */
export function measure(sk, r, pm = pointMap(sk), cm = curveMap(sk)) {
  const P = id => pm.get(id);
  const ends = id => { const c = cm.get(id); return c && c.type === 'line' ? [P(c.p1), P(c.p2)] : null; };
  if (r.type === 'distance') {
    if (r.b == null) { const e = ends(r.a); return e ? Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y) : 0; }
    const A = P(r.a), B = P(r.b), lb = ends(r.b), la = ends(r.a);
    if (A && B) return Math.hypot(B.x - A.x, B.y - A.y);
    const pt = A || B, ln = A ? lb : la;
    if (pt && ln) return pointLineDist(pt, ln[0], ln[1]);
    if (la && lb) return pointLineDist(la[0], lb[0], lb[1]);
    return 0;
  }
  if (r.type === 'hdistance' || r.type === 'vdistance') {
    const A = P(r.a), B = P(r.b);
    if (!A || !B) return 0;
    return r.type === 'hdistance' ? B.x - A.x : B.y - A.y;
  }
  if (r.type === 'chamfer') { const A = P(r.p), B = P(r.a); return A && B ? Math.hypot(B.x - A.x, B.y - A.y) : 0; }
  if (r.type === 'offset') return Math.abs(r.value);
  if (r.type === 'diameter' || r.type === 'radius') {
    const c = cm.get(r.c);
    return c ? (r.type === 'diameter' ? 2 * c.r : c.r) : 0;
  }
  if (r.type === 'angle') {
    const a = ends(r.a), b = ends(r.b);
    if (!a || !b) return 0;
    const t1 = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x), t2 = Math.atan2(b[1].y - b[0].y, b[1].x - b[0].x);
    let d = t2 - t1;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    return d * 180 / Math.PI;
  }
  return 0;
}
export function pointLineDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-12;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
}

/* Arcs: Punkt bei Winkel t */
export const arcPoint = (c, r, t) => [c.x + r * Math.cos(t), c.y + r * Math.sin(t)];

/* Kurve als Punktzug in Skizzenkoordinaten (für die Anzeige) */
export function curvePolyline(c, pm, seg = 64) {
  if (c.type === 'ellipse' || c.type === 'spline') return curveSamples(c, pm, Math.max(64, seg * 2));
  if (c.type === 'line') { const a = pm.get(c.p1), b = pm.get(c.p2); return a && b ? [[a.x, a.y], [b.x, b.y]] : []; }
  const cp = pm.get(c.c);
  if (!cp) return [];
  if (c.type === 'circle') {
    const pts = [];
    for (let i = 0; i <= seg; i++) pts.push(arcPoint(cp, c.r, i / seg * Math.PI * 2));
    return pts;
  }
  const span = c.a1 - c.a0, n = Math.max(6, Math.ceil(span / (Math.PI * 2) * seg));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(arcPoint(cp, c.r, c.a0 + span * i / n));
  return pts;
}

/* Abstand eines Punktes zu einer Kurve (Skizzenkoordinaten) */
export function curveDistance(c, pm, x, y) {
  if (c.type === 'ellipse' || c.type === 'spline') {
    const pts = curveSamples(c, pm, 128);
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-18;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
    }
    return d;
  }
  if (c.type === 'line') {
    const a = pm.get(c.p1), b = pm.get(c.p2);
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-18;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  }
  const cp = pm.get(c.c), d = Math.hypot(x - cp.x, y - cp.y);
  if (c.type === 'circle') return Math.abs(d - c.r);
  let t = Math.atan2(y - cp.y, x - cp.x);
  while (t < c.a0) t += Math.PI * 2;
  if (t <= c.a1) return Math.abs(d - c.r);
  const s = arcPoint(cp, c.r, c.a0), e = arcPoint(cp, c.r, c.a1);
  return Math.min(Math.hypot(x - s[0], y - s[1]), Math.hypot(x - e[0], y - e[1]));
}

/* Ende einer offenen Kurve, das uv am nächsten liegt, mit der Richtung, in der die Kurve dort hinausläuft
   (Linie, Bogen, offener Spline; für die Verschmelzungskurve) */
export function curveEndOut(c, pm, uv) {
  const P = id => pm.get(id), d2 = (p, q) => Math.hypot(p.x - q[0], p.y - q[1]);
  const nrm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  if (c.type === 'line') {
    const a = P(c.p1), b = P(c.p2);
    if (!a || !b) return null;
    return d2(a, uv) <= d2(b, uv) ? { id: c.p1, p: [a.x, a.y], d: nrm([a.x - b.x, a.y - b.y]) } : { id: c.p2, p: [b.x, b.y], d: nrm([b.x - a.x, b.y - a.y]) };
  }
  if (c.type === 'arc') {
    const s = P(c.s), e = P(c.e);
    if (!s || !e) return null;
    return d2(s, uv) <= d2(e, uv) ? { id: c.s, p: [s.x, s.y], d: [Math.sin(c.a0), -Math.cos(c.a0)] } : { id: c.e, p: [e.x, e.y], d: [-Math.sin(c.a1), Math.cos(c.a1)] };
  }
  if (c.type === 'spline' && !c.closed && c.pts.length >= 2) {
    const f = P(c.pts[0]), f2 = P(c.pts[1]), l = P(c.pts[c.pts.length - 1]), l2 = P(c.pts[c.pts.length - 2]);
    if (c.conic != null) return null;
    const hd = (id, sg) => { const t = c.tan && c.tan[id], h = t && P(t.h), p = P(id); return h ? nrm([sg * (h.x - p.x), sg * (h.y - p.y)]) : null; };
    return d2(f, uv) <= d2(l, uv) ? { id: c.pts[0], p: [f.x, f.y], d: hd(c.pts[0], -1) || nrm([f.x - f2.x, f.y - f2.y]) } : { id: c.pts[c.pts.length - 1], p: [l.x, l.y], d: hd(c.pts[c.pts.length - 1], 1) || nrm([l.x - l2.x, l.y - l2.y]) };
  }
  return null;
}
/* Krümmungskamm: n Stellen entlang der Kurve mit Punkt p, Einheitsnormale nz zur Krümmungsmitte hin und
   Krümmung k = 1/Radius (Menger-Krümmung aus drei eng benachbarten Kurvenpunkten). Für Spline, konische Kurve,
   Ellipse und Bogen; Linien und Kreise haben einen trivialen Kamm und werden nicht gezeigt. */
export function curvatureComb(c, pm, n = 64) {
  let at;
  if (c.type === 'arc') { const cp = pm.get(c.c); if (!cp) return []; at = u => [cp.x + c.r * Math.cos(c.a0 + (c.a1 - c.a0) * u), cp.y + c.r * Math.sin(c.a0 + (c.a1 - c.a0) * u)]; }
  else if (c.type === 'spline' || c.type === 'ellipse') {
    const u0 = isRanged(c) ? c.u0 : 0, u1 = isRanged(c) ? c.u1 : 1;
    at = u => curveAt(c, pm, u0 + (u1 - u0) * u);
  } else return [];
  const out = [], h = 1e-4;
  for (let i = 0; i <= n; i++) {
    // an den Enden einseitig: die drei Stellen rücken nach innen
    const u = i / n, uc = Math.max(h, Math.min(1 - h, u));
    const a = at(uc - h), b = at(uc + h), pc = at(uc), p = at(u);
    const ab = [pc[0] - a[0], pc[1] - a[1]], bc = [b[0] - pc[0], b[1] - pc[1]], ac = [b[0] - a[0], b[1] - a[1]];
    const cr = ab[0] * bc[1] - ab[1] * bc[0], den = Math.hypot(...ab) * Math.hypot(...bc) * Math.hypot(...ac);
    const k = den > 1e-30 ? 2 * cr / den : 0, L = Math.hypot(...ac) || 1, t = [ac[0] / L, ac[1] / L];
    const nl = [-t[1], t[0]], sg = k >= 0 ? 1 : -1;
    out.push({ p, nz: [nl[0] * sg, nl[1] * sg], k: Math.abs(k) });
  }
  return out;
}
/* Tangential-Regel: an einem gemeinsamen Endpunkt über den Tangentenwinkel */
export function makeTangentRule(sk, a, b) {
  const cm = curveMap(sk), pm = pointMap(sk);
  const A = cm.get(a), B = cm.get(b);
  // Spline: auch ein Stützpunkt mitten auf der Kurve – gemeinsamer Punkt oder Stützpunkt auf der anderen Kurve
  const ids = c => (c.type === 'spline' && !c.cv && c.conic == null ? c.pts : curveEndIds(c));
  let shared = ids(A).find(id => ids(B).includes(id));
  let on = null;
  if (!shared) {
    const sp = A.type === 'spline' ? A : B.type === 'spline' ? B : null, other = sp === A ? B : A;
    if (sp && !sp.cv && sp.conic == null && other.type !== 'spline') {
      const L = Math.max(1, ...curveSamples(sp, pm, 32).map(q => Math.hypot(q[0], q[1])));
      let bd = Infinity;
      sp.pts.forEach(id => { const q = pm.get(id), d = q ? curveDistance(other, pm, q.x, q.y) : Infinity; if (d < bd) { bd = d; on = id; } });
      if (bd > 1e-6 * L) on = null;
      shared = on;
    }
  }
  if (!shared) return { type: 'tangent', a, b };
  const ta = tangentAt(A, shared, pm), tb = tangentAt(B, shared, pm);
  // _on: der Stützpunkt liegt nur auf der anderen Kurve – der Editor legt ihn dort fest (Punkt auf Kurve)
  return { type: 'tangent', a, b, via: shared, flip: ta[0] * tb[0] + ta[1] * tb[1] < 0, ...(on ? { _on: A.type === 'spline' ? b : a } : {}) };
}
function tangentAt(c, pid, pm) {
  if (c.type === 'line') { const p1 = pm.get(c.p1), p2 = pm.get(c.p2); return [p2.x - p1.x, p2.y - p1.y]; }
  if (c.type === 'spline') {
    const i = c.pts.indexOf(pid), t = c.tan && c.tan[pid], a = pm.get(pid), h = t && pm.get(t.h);
    if (a && h) return [h.x - a.x, h.y - a.y];
    if (i > 0 && i < c.pts.length - 1 || c.closed) return splineTangent(splineP(c, pm), !!c.closed, i).m;
    const nb = i === 0 ? c.pts[1] : c.pts[c.pts.length - 2], b = pm.get(nb);
    return a && b ? (i === 0 ? [b.x - a.x, b.y - a.y] : [a.x - b.x, a.y - b.y]) : [1, 0];
  }
  if (c.type !== 'arc') return [1, 0];
  const t = pid === c.s ? c.a0 : c.a1;
  return [-Math.sin(t), Math.cos(t)];
}

/* Punkte, die ein Feature als Markierung benutzen kann: alle echten Punkte der Skizze –
   auch Ecken und Mittelpunkte von Kurven, denn Halterungen und Lasten liegen gern auf Geometrie.
   Ausgelassen werden Konstruktionspunkte von Mustern und Texten. Mit der id, damit eine
   Zuordnung (z. B. „dieser Punkt ist eine Last“) auch nach dem Verschieben noch stimmt. */
export function markerPoints(sk) {
  const skip = new Set();
  (sk.texts || []).forEach(t => skip.add(t.p));
  (sk.patterns || []).forEach(P => P.center && skip.add(P.center));
  return sk.points
    .filter(p => !p.ref && !p.patStep && !skip.has(p.id))
    .map(p => ({ id: p.id, x: p.x, y: p.y, ...(p.z != null ? { z: p.z } : {}) })); // Reihenfolge der Skizze: holePoints und Muster-Kopien hängen daran
}

/* Mittelpunkte für Bohrungen: freie Skizzenpunkte, sonst die Mitten der Kreise */
function freePoints(sk) {
  const used = new Set();
  [...sk.curves, ...(sk.helpers || [])].forEach(c => [c.p1, c.p2, c.p3, c.c, c.s, c.e, c.a, c.b, ...(c.pts || [])].forEach(id => id && used.add(id)));
  let pts = markerPoints(sk).filter(p => !used.has(p.id));
  if (!pts.length) {
    const ids = new Set(sk.curves.filter(c => c.type === 'circle' && !c.ref).map(c => c.c));
    pts = sk.points.filter(p => ids.has(p.id));
  }
  return pts;
}
export function holePoints(sk) { return freePoints(sk).map(p => [p.x, p.y]); }
/* dieselben freien Punkte einer räumlichen Skizze in Weltkoordinaten */
export const holePoints3 = sk => freePoints(sk).map(pt3);
