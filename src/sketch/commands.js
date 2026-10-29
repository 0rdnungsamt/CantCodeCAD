// Skizzenbefehle als reine Funktionen auf dem Skizzenmodell:
// Stutzen, Ecke verrunden, Langloch, Vieleck, Mittelpunkt-Rechteck, Spiegeln.
// Alle Funktionen verändern sk direkt; der Editor ruft sie auf einer Kopie auf
// und übernimmt das Ergebnis nur, wenn der Solver zustimmt.
import { measure, pointMap, curveMap, addPoint, addLine, addCircle, addArc, addRule, addRect, deleteItems, makeTangentRule, syncArc, ruleRefs, addHelper, curvePointIds, sid, curveSamples, addSpline, isRanged } from './model.js';
import { prim, intersect, paramOf, normAngle, pointAt, polyU } from './geom2d.js';
import { solveSketch } from './solver.js';

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const len = a => Math.hypot(a[0], a[1]);
const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const xy = p => [p.x, p.y];

/* Punkt entfernen, wenn ihn keine Kurve mehr benutzt */
function dropIfOrphan(sk, pid) {
  if (!pid || pid === 'O') return;
  const used = sk.curves.some(c => [c.p1, c.p2, c.c, c.s, c.e].includes(pid));
  if (!used && sk.points.some(p => p.id === pid)) deleteItems(sk, [pid]);
}
const lengthDims = (sk, cid) => sk.rules.filter(r => r.type === 'distance' && r.a === cid && r.b == null).map(r => r.id);

/* ---------- Stutzen ---------- */
/* Schnittpunkte der Kurve mit allen anderen und das Stück unter uv */
function trimSpan(sk, c, uv) {
  const pm = pointMap(sk);
  const P = prim(c, pm);
  if (!P) return null;
  const cuts = [];
  sk.curves.forEach(o => {
    if (o.id === c.id || (c.axes && c.axes.includes(o.id)) || (o.axes && o.axes.includes(c.id))) return;
    intersect(P, prim(o, pm)).forEach(x => cuts.push({ t: x.ta, p: x.p, other: o.id }));
  });
  const tq = paramOf(P, uv);
  if (P.type === 'poly' && P.closed) {
    // geschlossene Ellipse/Spline wie ein Kreis: Parameter im Punktzug, umlaufend
    const n = P.pts.length - 1;
    const rel = cuts.map(x => ({ ...x, d: ((x.t - tq) % n + n) % n })).filter(x => x.d > 1e-7 && x.d < n - 1e-7);
    if (rel.length < 2) return { P, tq, whole: true };
    rel.sort((a, b) => a.d - b.d);
    return { P, tq, nxt: rel[0], prv: rel[rel.length - 1] };
  }
  if (P.type === 'circle') {
    const rel = cuts.map(x => ({ ...x, d: normAngle(x.t, tq) - tq })).filter(x => x.d > 1e-7 && x.d < TAU - 1e-7);
    if (rel.length < 2) return { P, tq, whole: true };
    rel.sort((a, b) => a.d - b.d);
    return { P, tq, nxt: rel[0], prv: rel[rel.length - 1] };
  }
  const lo0 = P.type === 'line' ? 0 : P.type === 'poly' ? 0 : P.a0, hi0 = P.type === 'line' ? 1 : P.type === 'poly' ? P.pts.length - 1 : P.a1;
  const inner = cuts.filter(x => x.t > lo0 + 1e-7 && x.t < hi0 - 1e-7).sort((a, b) => a.t - b.t);
  const lo = [...inner].reverse().find(x => x.t < tq), hi = inner.find(x => x.t > tq);
  return { P, tq, lo, hi, lo0, hi0, whole: !lo && !hi };
}

/* Das Stück, das Stutzen an dieser Stelle entfernen würde, als Punktzug */
export function trimPreview(sk, curveId, uv) {
  const c = sk.curves.find(x => x.id === curveId);
  if (!c || c.ref) return null;
  const S = trimSpan(sk, c, uv);
  if (!S) return null;
  const { P } = S;
  const arcPts = (t0, t1) => { const n = Math.max(8, Math.ceil(Math.abs(t1 - t0) / TAU * 96)), out = []; for (let i = 0; i <= n; i++) out.push(pointAt(P, t0 + (t1 - t0) * i / n)); return out; };
  if (P.type === 'poly') {
    const n = P.pts.length - 1, at = t => pointAt(P, P.closed ? ((t % n) + n) % n : t);
    const range = (t0, t1) => { const m = Math.max(4, Math.ceil(Math.abs(t1 - t0))), out = []; for (let i = 0; i <= m; i++) out.push(at(t0 + (t1 - t0) * i / m)); return out; };
    if (S.whole) return P.pts.slice();
    if (P.closed) return range(S.tq - (n - S.prv.d), S.tq + S.nxt.d);
    return range(S.lo ? S.lo.t : 0, S.hi ? S.hi.t : n);
  }
  if (P.type === 'circle') return S.whole ? arcPts(0, TAU) : arcPts(S.tq - (TAU - S.prv.d), S.tq + S.nxt.d);
  const t0 = S.lo ? S.lo.t : S.lo0, t1 = S.hi ? S.hi.t : S.hi0;
  return P.type === 'line' ? [pointAt(P, t0), pointAt(P, t1)] : arcPts(t0, t1);
}

/* Punkt für ein neues Kurvenende: einen vorhandenen Punkt an dieser Stelle nehmen,
   sonst einen neuen anlegen und an die schneidende Kurve binden */
function endPoint(sk, p, other, curveId) {
  const hit = sk.points.find(q => Math.hypot(q.x - p[0], q.y - p[1]) < 1e-7);
  if (hit) {
    sk.rules = sk.rules.filter(r => !(r.type === 'pointOnCurve' && r.p === hit.id && r.c === curveId));
    return hit.id;
  }
  const q = addPoint(sk, ...p);
  if (other) addRule(sk, { type: 'pointOnCurve', p: q.id, c: other });
  return q.id;
}

export function trimAt(sk, curveId, uv) {
  const c = sk.curves.find(x => x.id === curveId);
  if (!c || c.ref) return { ok: false, msg: 'Projizierte Bezüge lassen sich nicht stutzen.' };
  const S = trimSpan(sk, c, uv);
  if (!S) return { ok: false, msg: 'Diese Kurve lässt sich nicht stutzen.' };
  if (S.whole) { deleteItems(sk, [c.id]); return { ok: true, deleted: true }; }
  const { P, lo, hi } = S;

  if (P.type === 'poly') {
    // Ellipse/Spline: nur der Parameterbereich ändert sich, die Stützpunkte bleiben
    const U = t => polyU(P, t);
    if (P.closed) {
      let u0 = U(S.nxt.t), u1 = U(S.prv.t);
      while (u1 <= u0) u1 += 1;
      c.u0 = u0; c.u1 = u1;
      return { ok: true };
    }
    const u0 = c.u0 ?? 0, u1 = c.u1 ?? 1;
    if (lo && hi) {
      const c2 = { ...JSON.parse(JSON.stringify(c)), id: sid(c.type === 'ellipse' ? 'e' : 's'), u0: U(hi.t), u1 };
      delete c2.axes;
      c.u0 = u0; c.u1 = U(lo.t);
      sk.curves.push(c2);
      return { ok: true };
    }
    if (!lo) { c.u0 = U(hi.t); c.u1 = u1; } else { c.u0 = u0; c.u1 = U(lo.t); }
    return { ok: true };
  }

  if (P.type === 'circle') {
    const s = endPoint(sk, S.nxt.p, S.nxt.other, c.id), e = endPoint(sk, S.prv.p, S.prv.other, c.id);
    c.type = 'arc'; c.s = s; c.e = e;
    syncArc(sk, c);
    return { ok: true };
  }

  if (P.type === 'line') {
    const drop = lengthDims(sk, c.id);
    sk.rules = sk.rules.filter(r => !drop.includes(r.id));
    if (lo && hi) {
      const X1 = endPoint(sk, lo.p, lo.other, c.id), X2 = endPoint(sk, hi.p, hi.other, c.id);
      const oldEnd = c.p2;
      c.p2 = X1;
      const l2 = addLine(sk, X2, oldEnd, !!c.cons);
      sk.rules.filter(r => (r.type === 'horizontal' || r.type === 'vertical') && r.l === c.id).forEach(r => addRule(sk, { type: r.type, l: l2.id }));
      return { ok: true };
    }
    if (!lo) { const old = c.p1; c.p1 = endPoint(sk, hi.p, hi.other, c.id); dropIfOrphan(sk, old); }
    else { const old = c.p2; c.p2 = endPoint(sk, lo.p, lo.other, c.id); dropIfOrphan(sk, old); }
    return { ok: true };
  }

  // Bogen
  if (lo && hi) {
    const X1 = endPoint(sk, lo.p, lo.other, c.id), X2 = endPoint(sk, hi.p, hi.other, c.id);
    const oldEnd = c.e;
    c.e = X1;
    syncArc(sk, c);
    const a2 = addArc(sk, c.c, X2, oldEnd, !!c.cons);
    addRule(sk, { type: 'equal', a: c.id, b: a2.id });
    return { ok: true };
  }
  if (!lo) { const old = c.s; c.s = endPoint(sk, hi.p, hi.other, c.id); syncArc(sk, c); dropIfOrphan(sk, old); }
  else { const old = c.e; c.e = endPoint(sk, lo.p, lo.other, c.id); syncArc(sk, c); dropIfOrphan(sk, old); }
  return { ok: true };
}

/* ---------- Unterbrechen ----------
   Teilt die Kurve an den beiden Schnittpunkten, die das angeklickte Stück begrenzen; nichts wird entfernt.
   Die Teile teilen sich die Trennpunkte (bleiben verbunden); Linienstücke bleiben über „parallel“ in einer Flucht,
   Bogenstücke behalten den gemeinsamen Mittelpunkt. */
export function breakAt(sk, curveId, uv) {
  const c = sk.curves.find(x => x.id === curveId);
  if (!c || c.ref) return { ok: false, msg: 'Projizierte Bezüge lassen sich nicht unterbrechen.' };
  const S = trimSpan(sk, c, uv);
  if (!S) return { ok: false, msg: 'Diese Kurve lässt sich nicht unterbrechen.' };
  if (S.whole) return { ok: false, msg: 'Die Kurve wird hier von keiner anderen geschnitten – nichts zu unterbrechen.' };
  const { P, lo, hi } = S;
  if (P.type === 'poly') {
    // Ellipse/Spline: Kopien mit Teil-Parameterbereichen (wie beim Stutzen)
    const U = t => polyU(P, t), u0 = c.u0 ?? 0, u1 = c.u1 ?? 1;
    const ranges = P.closed ? [[U(S.prv.t), U(S.nxt.t)], [U(S.nxt.t), U(S.prv.t)]] : [[u0, lo ? U(lo.t) : null], [lo ? U(lo.t) : u0, hi ? U(hi.t) : u1], [hi ? U(hi.t) : null, u1]].filter(r => r[0] != null && r[1] != null);
    ranges.forEach(r => { if (r[1] <= r[0]) r[1] += 1; });
    const [first, ...rest] = ranges;
    rest.forEach(r => { const c2 = { ...JSON.parse(JSON.stringify(c)), id: sid(c.type === 'ellipse' ? 'e' : 's'), u0: r[0], u1: r[1] }; delete c2.axes; sk.curves.push(c2); });
    c.u0 = first[0]; c.u1 = first[1];
    return { ok: true, parts: ranges.length };
  }
  if (P.type === 'circle') {
    const a = endPoint(sk, S.prv.p, S.prv.other, c.id), b = endPoint(sk, S.nxt.p, S.nxt.other, c.id);
    // angeklicktes Stück a → b und der Rest b → a, beide um denselben Mittelpunkt
    c.type = 'arc'; c.s = a; c.e = b;
    syncArc(sk, c);
    addArc(sk, c.c, b, a, !!c.cons);
    sk.rules = sk.rules.filter(r => !((r.type === 'diameter') && r.c === c.id));
    return { ok: true, parts: 2 };
  }
  if (P.type === 'line') {
    const drop = lengthDims(sk, c.id);
    sk.rules = sk.rules.filter(r => !drop.includes(r.id));
    const hv = sk.rules.filter(r => (r.type === 'horizontal' || r.type === 'vertical') && r.l === c.id).map(r => r.type);
    const cuts = [lo, hi].filter(Boolean).map(x => endPoint(sk, x.p, x.other, c.id));
    const ends = [c.p1, ...cuts, c.p2], lines = [c];
    c.p2 = ends[1];
    for (let i = 1; i < ends.length - 1; i++) lines.push(addLine(sk, ends[i], ends[i + 1], !!c.cons));
    lines.slice(1).forEach(l => { if (hv.length) hv.forEach(type => addRule(sk, { type, l: l.id })); else addRule(sk, { type: 'parallel', a: c.id, b: l.id }); });
    return { ok: true, parts: lines.length };
  }
  // Bogen: Teile mit gemeinsamem Mittelpunkt und gemeinsamen Trennpunkten (damit gleicher Radius)
  const cuts = [lo, hi].filter(Boolean).map(x => endPoint(sk, x.p, x.other, c.id));
  const ends = [c.s, ...cuts, c.e];
  c.e = ends[1];
  syncArc(sk, c);
  for (let i = 1; i < ends.length - 1; i++) addArc(sk, c.c, ends[i], ends[i + 1], !!c.cons);
  sk.rules = sk.rules.filter(r => !((r.type === 'radius') && r.c === c.id));
  return { ok: true, parts: ends.length - 1 };
}

/* ---------- Ecke verrunden ---------- */
export function filletCorner(sk, pid, r) {
  const pm = pointMap(sk);
  const lines = sk.curves.filter(c => c.type === 'line' && (c.p1 === pid || c.p2 === pid));
  const others = sk.curves.filter(c => c.type !== 'line' && [c.c, c.s, c.e].includes(pid));
  if (lines.length !== 2 || others.length) return { ok: false, msg: 'Verrunden geht an einer Ecke, an der genau zwei Linien zusammenkommen.' };
  if (lines.some(l => l.ref)) return { ok: false, msg: 'Projizierte Bezüge lassen sich nicht verrunden.' };
  const [L1, L2] = lines;
  const P = xy(pm.get(pid));
  const far = l => xy(pm.get(l.p1 === pid ? l.p2 : l.p1));
  const A = far(L1), B = far(L2);
  const u1 = unit(sub(A, P)), u2 = unit(sub(B, P));
  const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
  const th = Math.acos(cos);
  if (th < 1e-3 || th > Math.PI - 1e-3) return { ok: false, msg: 'An dieser Ecke liegen die Linien in einer Flucht.' };
  const d = r / Math.tan(th / 2);
  if (d >= len(sub(A, P)) - 1e-9 || d >= len(sub(B, P)) - 1e-9) return { ok: false, msg: 'Der Radius ist zu groß für diese Ecke.' };
  const T1 = add(P, mul(u1, d)), T2 = add(P, mul(u2, d));
  const C = add(P, mul(unit(add(u1, u2)), r / Math.sin(th / 2)));
  // Längenmaße der beiden Linien laufen künftig bis zur gedachten Ecke
  let keepCorner = pid === 'O' || !!pm.get(pid).ref;
  [L1, L2].forEach(L => {
    const farId = L.p1 === pid ? L.p2 : L.p1;
    sk.rules.forEach(q => { if (q.type === 'distance' && q.a === L.id && q.b == null) { q.a = farId; q.b = pid; keepCorner = true; } });
  });
  const t1 = addPoint(sk, ...T1), t2 = addPoint(sk, ...T2), cp = addPoint(sk, ...C);
  if (L1.p1 === pid) L1.p1 = t1.id; else L1.p2 = t1.id;
  if (L2.p1 === pid) L2.p1 = t2.id; else L2.p2 = t2.id;
  const ccw = (T1[0] - C[0]) * (T2[1] - C[1]) - (T1[1] - C[1]) * (T2[0] - C[0]) > 0;
  const arc = ccw ? addArc(sk, cp.id, t1.id, t2.id) : addArc(sk, cp.id, t2.id, t1.id);
  addRule(sk, makeTangentRule(sk, L1.id, arc.id));
  addRule(sk, makeTangentRule(sk, L2.id, arc.id));
  const rad = addRule(sk, { type: 'radius', c: arc.id, value: r, off: sub(P, C) });
  // Bezieht sich noch etwas auf die Ecke (Maße, Bedingungen), bleibt sie als
  // gedachter Schnittpunkt der beiden Linien erhalten.
  if (keepCorner || sk.rules.some(q => q.id !== rad.id && ruleRefs(q).includes(pid))) {
    addRule(sk, { type: 'pointOnCurve', p: pid, c: L1.id });
    addRule(sk, { type: 'pointOnCurve', p: pid, c: L2.id });
  } else dropIfOrphan(sk, pid);
  return { ok: true, arcId: arc.id, ruleId: rad.id };
}

/* Radius einer Verrundung ändern: die beiden Linien bleiben liegen, nur Tangentenpunkte und
   Mittelpunkt wandern. Ohne diese Vorlage verschiebt der Solver gern die ganzen Linien. */
export function refillet(sk, arcId, r) {
  const pm = pointMap(sk), cm = curveMap(sk);
  const arc = cm.get(arcId);
  if (!arc || arc.type !== 'arc' || !(r > 0)) return false;
  const tl = sk.rules.filter(q => q.type === 'tangent' && (q.a === arcId || q.b === arcId)).map(q => cm.get(q.a === arcId ? q.b : q.a)).filter(c => c && c.type === 'line');
  const L1 = tl.find(l => l.p1 === arc.s || l.p2 === arc.s), L2 = tl.find(l => l.p1 === arc.e || l.p2 === arc.e);
  if (!L1 || !L2 || L1 === L2) return false;
  const geo = (L, pid) => ({ F: xy(pm.get(L.p1 === pid ? L.p2 : L.p1)), near: pm.get(pid) });
  const g1 = geo(L1, arc.s), g2 = geo(L2, arc.e);
  const n1 = pm.get(arc.s), n2 = pm.get(arc.e), cp = pm.get(arc.c);
  if (!n1 || !n2 || !cp || n1.virtual || n2.virtual || cp.virtual) return false;
  const d1 = sub(xy(n1), g1.F), d2 = sub(xy(n2), g2.F);
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return false;
  const t = ((g2.F[0] - g1.F[0]) * d2[1] - (g2.F[1] - g1.F[1]) * d2[0]) / den;
  const P = add(g1.F, mul(d1, t));
  const u1 = unit(sub(g1.F, P)), u2 = unit(sub(g2.F, P));
  const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  if (th < 1e-3 || th > Math.PI - 1e-3) return false;
  const d = r / Math.tan(th / 2);
  if (d >= len(sub(g1.F, P)) - 1e-9 || d >= len(sub(g2.F, P)) - 1e-9) return false;
  const T1 = add(P, mul(u1, d)), T2 = add(P, mul(u2, d)), C = add(P, mul(unit(add(u1, u2)), r / Math.sin(th / 2)));
  n1.x = T1[0]; n1.y = T1[1]; n2.x = T2[0]; n2.y = T2[1]; cp.x = C[0]; cp.y = C[1];
  return true;
}

/* ---------- Langloch (Mittelpunkt zu Mittelpunkt) ---------- */
export function addSlot(sk, c1, c2, halfWidth, ids = {}) {
  const u = unit(sub(c2, c1)), n = [-u[1], u[0]], h = Math.abs(halfWidth);
  if (len(sub(c2, c1)) < 1e-9 || h < 1e-9) return { ok: false, msg: 'Das Langloch braucht eine Länge und eine Breite.' };
  const C1 = ids.c1 || addPoint(sk, ...c1).id, C2 = ids.c2 || addPoint(sk, ...c2).id;
  const a1 = addPoint(sk, ...add(c1, mul(n, h))), b1 = addPoint(sk, ...add(c2, mul(n, h)));
  const b2 = addPoint(sk, ...add(c2, mul(n, -h))), a2 = addPoint(sk, ...add(c1, mul(n, -h)));
  const top = addLine(sk, a1.id, b1.id), bottom = addLine(sk, b2.id, a2.id);
  const right = addArc(sk, C2, b2.id, b1.id), left = addArc(sk, C1, a1.id, a2.id);
  addLine(sk, C1, C2, true);
  addRule(sk, makeTangentRule(sk, top.id, right.id));
  addRule(sk, makeTangentRule(sk, right.id, bottom.id));
  addRule(sk, makeTangentRule(sk, bottom.id, left.id));
  addRule(sk, makeTangentRule(sk, left.id, top.id));
  addRule(sk, { type: 'equal', a: right.id, b: left.id });
  return { ok: true, arcId: right.id };
}

/* Bogen-Langloch („Mittelpunkt-Bogen-Langloch“): Mittellinie = Bogen um c mit Radius r von t0 über sweep (> 0,
   gegen den Uhrzeigersinn), halbe Breite h. Außen- und Innenbogen konzentrisch, Enden als Halbkreise, tangential. */
export function addArcSlot(sk, c, r, t0, sweep, h, ids = {}) {
  h = Math.abs(h);
  if (!(r > 1e-9) || !(h > 1e-9) || h >= r) return { ok: false, msg: 'Das Bogen-Langloch muss schmaler sein als der Radius der Mittellinie.' };
  if (!(sweep > 1e-6) || sweep >= TAU - 1e-6) return { ok: false, msg: 'Das Bogen-Langloch braucht einen Winkel unter 360°.' };
  const t1 = t0 + sweep, P = (rad, t) => [c[0] + rad * Math.cos(t), c[1] + rad * Math.sin(t)];
  const C = ids.c || addPoint(sk, ...c).id;
  const E0 = addPoint(sk, ...P(r, t0)), E1 = addPoint(sk, ...P(r, t1));
  const o0 = addPoint(sk, ...P(r + h, t0)), o1 = addPoint(sk, ...P(r + h, t1));
  const i0 = addPoint(sk, ...P(r - h, t0)), i1 = addPoint(sk, ...P(r - h, t1));
  const outer = addArc(sk, C, o0.id, o1.id), inner = addArc(sk, C, i0.id, i1.id);
  const cap1 = addArc(sk, E1.id, o1.id, i1.id), cap0 = addArc(sk, E0.id, i0.id, o0.id);
  const mid = addArc(sk, C, E0.id, E1.id, true);
  addRule(sk, makeTangentRule(sk, outer.id, cap1.id));
  addRule(sk, makeTangentRule(sk, cap1.id, inner.id));
  addRule(sk, makeTangentRule(sk, inner.id, cap0.id));
  addRule(sk, makeTangentRule(sk, cap0.id, outer.id));
  // gleich große Enden folgen schon aus den Tangenten an zwei konzentrische Bögen (eine Gleich-Bedingung wäre überzählig)
  return { ok: true, center: C, mid: mid.id, caps: [cap0.id, cap1.id] };
}

/* ---------- Regelmäßiges Vieleck ---------- */
/* c = Mitte, v = erste Ecke (Ecken gegen den Uhrzeigersinn). mode 'in': Hilfskreis durch die Ecken (einbeschrieben),
   'out': Hilfskreis berührt die Kanten in ihrer Mitte (umschrieben, Kreis = Inkreis). Gleich lange Kanten halten es regelmäßig. */
export function addPolygon(sk, c, v, n, ids = {}, mode = 'in') {
  n = Math.max(3, Math.min(64, Math.round(n)));
  const R = len(sub(v, c));
  if (R < 1e-9) return { ok: false, msg: 'Das Vieleck braucht eine Größe.' };
  const C = ids.c || addPoint(sk, ...c).id;
  const phi = Math.atan2(v[1] - c[1], v[0] - c[0]);
  const pts = [];
  for (let k = 0; k < n; k++) { const t = phi + TAU * k / n; pts.push(addPoint(sk, c[0] + R * Math.cos(t), c[1] + R * Math.sin(t))); }
  const lines = pts.map((p, k) => addLine(sk, p.id, pts[(k + 1) % n].id));
  let circ;
  if (mode === 'out') {
    const ri = R * Math.cos(Math.PI / n);
    circ = addCircle(sk, C, ri, true);
    lines.forEach((l, k) => {
      const t = phi + TAU * (k + 0.5) / n, m = addPoint(sk, c[0] + ri * Math.cos(t), c[1] + ri * Math.sin(t));
      addRule(sk, { type: 'midpoint', p: m.id, c: l.id });
      addRule(sk, { type: 'pointOnCurve', p: m.id, c: circ.id });
    });
  } else {
    circ = addCircle(sk, C, R, true);
    pts.forEach(p => addRule(sk, { type: 'pointOnCurve', p: p.id, c: circ.id }));
  }
  lines.slice(1).forEach(l => addRule(sk, { type: 'equal', a: lines[0].id, b: l.id }));
  return { ok: true, circleId: circ.id, center: C, points: pts.map(p => p.id), lines: lines.map(l => l.id) };
}

/* ---------- Rechteck über den Mittelpunkt ---------- */
export function addCenterRect(sk, c, q, ids = {}) {
  const hx = Math.abs(q[0] - c[0]), hy = Math.abs(q[1] - c[1]);
  if (hx < 1e-9 || hy < 1e-9) return { ok: false, msg: 'Das Rechteck braucht eine Breite und eine Höhe.' };
  const r = addRect(sk, c[0] - hx, c[1] - hy, c[0] + hx, c[1] + hy);
  const C = ids.c || addPoint(sk, ...c).id;
  const diag = addLine(sk, r.points[0].id, r.points[2].id, true);
  addRule(sk, { type: 'midpoint', p: C, c: diag.id });
  return { ok: true, rect: r, center: C };
}

/* ---------- Spiegeln an einer Linie ---------- */
export function mirrorItems(sk, ids, axisId) {
  const pm = pointMap(sk), cm = curveMap(sk);
  const axis = cm.get(axisId);
  if (!axis || axis.type !== 'line') return { ok: false, msg: 'Die Spiegelachse muss eine Linie sein.' };
  const A = xy(pm.get(axis.p1)), B = xy(pm.get(axis.p2));
  const d = unit(sub(B, A));
  const reflect = p => { const v = sub(p, A), t = v[0] * d[0] + v[1] * d[1]; const f = add(A, mul(d, t)); return sub(mul(f, 2), p); };
  const onAxis = p => { const v = sub(p, A); return Math.abs(v[0] * d[1] - v[1] * d[0]) < 1e-6; };
  const curves = ids.map(id => cm.get(id)).filter(c => c && !c.virtual && !c.ref && c.id !== axisId);
  const freePts = ids.filter(id => pm.has(id) && !cm.has(id) && !pm.get(id).virtual);
  if (!curves.length && !freePts.length) return { ok: false, msg: 'Erst Elemente wählen, dann die Spiegelachse.' };
  const map = new Map();
  sk.rules.forEach(r => { if (r.type === 'symmetric' && r.l === axisId) { map.set(r.a, r.b); map.set(r.b, r.a); } });
  const exists = (type, test) => sk.curves.some(o => o.type === type && test(o));
  const mp = pid => {
    if (map.has(pid)) return map.get(pid);
    const p = xy(pm.get(pid));
    if (pid === 'O' || onAxis(p)) { map.set(pid, pid); return pid; }
    const q = addPoint(sk, ...reflect(p));
    addRule(sk, { type: 'symmetric', a: pid, b: q.id, l: axisId });
    map.set(pid, q.id);
    return q.id;
  };
  curves.forEach(c => {
    if (c.type === 'line') {
      const a = mp(c.p1), b = mp(c.p2);
      if ((a === c.p1 && b === c.p2) || (a === c.p2 && b === c.p1)) return; // liegt auf der Achse oder ist schon symmetrisch
      if (exists('line', o => (o.p1 === a && o.p2 === b) || (o.p1 === b && o.p2 === a))) return;
      addLine(sk, a, b, !!c.cons);
    } else if (c.type === 'circle') {
      const m = mp(c.c);
      if (m === c.c || exists('circle', o => o.c === m)) return;
      const k = addCircle(sk, m, c.r, !!c.cons); addRule(sk, { type: 'equal', a: c.id, b: k.id });
    } else {
      const s2 = mp(c.e), e2 = mp(c.s);
      // Mittelpunkt über gleiche Radien bestimmen statt über eine weitere
      // Symmetrie, sonst wäre der Bogen überbestimmt
      let cc, viaRadius = false;
      if (map.has(c.c) || c.c === 'O' || onAxis(xy(pm.get(c.c)))) cc = mp(c.c);
      else { cc = addPoint(sk, ...reflect(xy(pm.get(c.c)))).id; map.set(c.c, cc); viaRadius = true; }
      if (exists('arc', o => o.c === cc && o.s === s2 && o.e === e2)) return;
      const a = addArc(sk, cc, s2, e2, !!c.cons);
      if (viaRadius) addRule(sk, { type: 'equal', a: c.id, b: a.id });
    }
  });
  freePts.forEach(mp);
  return { ok: true };
}

/* ======================================================================
   Versatz, Verlängern, Fase, Tangentialbogen, Muster
   ====================================================================== */

const BIG = 1e5;
const ends = c => (c.type === 'line' ? [c.p1, c.p2] : [c.s, c.e]);
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

/* ---------- Kette zusammenhängender Kurven ---------- */
/* Ausgehend von einer Kurve alle über gemeinsame Endpunkte verbundenen Linien/Bögen,
   solange an jeder Verbindung genau zwei Kurven zusammenkommen. fwd: Durchlauf von ends[0] nach ends[1]. */
export function chainFrom(sk, cid) {
  const c0 = sk.curves.find(c => c.id === cid);
  if (!c0 || c0.ref) return null;
  if (c0.type === 'circle') return { items: [{ c: c0, fwd: true }], closed: true };
  const usable = c => !c.ref && (c.type === 'line' || c.type === 'arc') && !!c.cons === !!c0.cons;
  const at = pid => sk.curves.filter(c => usable(c) && ends(c).includes(pid));
  const items = [{ c: c0, fwd: true }], seen = new Set([c0.id]);
  let closed = false, cur = items[0];
  for (;;) {
    const tip = cur.fwd ? ends(cur.c)[1] : ends(cur.c)[0];
    const nb = at(tip).filter(c => c.id !== cur.c.id);
    if (nb.length !== 1) break;
    const n = nb[0];
    if (seen.has(n.id)) { closed = n.id === c0.id; break; }
    const it = { c: n, fwd: ends(n)[0] === tip };
    items.push(it); seen.add(n.id); cur = it;
  }
  if (!closed) {
    cur = items[0];
    for (;;) {
      const tail = cur.fwd ? ends(cur.c)[0] : ends(cur.c)[1];
      const nb = at(tail).filter(c => c.id !== cur.c.id);
      if (nb.length !== 1) break;
      const n = nb[0];
      if (seen.has(n.id)) break;
      const it = { c: n, fwd: ends(n)[1] === tail };
      items.unshift(it); seen.add(n.id); cur = it;
    }
  }
  return { items, closed };
}

/* Ein Kettenglied in Durchlaufrichtung: Start, Ende, Richtung an beiden Enden */
function walkElem(it, pm) {
  const c = it.c;
  if (c.type === 'circle') { const cp = xy(pm.get(c.c)); return { type: 'circle', C: cp, r: c.r }; }
  const [i0, i1] = it.fwd ? ends(c) : [ends(c)[1], ends(c)[0]];
  const S = xy(pm.get(i0)), E = xy(pm.get(i1));
  if (c.type === 'line') { const u = unit(sub(E, S)); return { type: 'line', S, E, t0: u, t1: u }; }
  const C = xy(pm.get(c.c));
  const tan = p => { const v = unit(sub(p, C)); return it.fwd ? [-v[1], v[0]] : [v[1], -v[0]]; };
  return { type: 'arc', S, E, C, r: c.r, fwd: it.fwd, t0: tan(S), t1: tan(E) };
}

/* Versetzte Lage eines Kettenglieds; d > 0 heißt links der Durchlaufrichtung */
function offsetElem(g, d) {
  if (g.type === 'line') {
    const n = [-g.t0[1], g.t0[0]];
    return { type: 'line', S: add(g.S, mul(n, d)), E: add(g.E, mul(n, d)) };
  }
  const r = g.type === 'circle' ? g.r - d : (g.fwd ? g.r - d : g.r + d);
  if (!(r > 1e-6)) return null;
  if (g.type === 'circle') return { type: 'circle', C: g.C, r };
  const k = r / g.r;
  return { type: 'arc', C: g.C, r, S: add(g.C, mul(sub(g.S, g.C), k)), E: add(g.C, mul(sub(g.E, g.C), k)) };
}

/* Schnittpunkte der unendlich verlängerten Grundformen */
function infPrim(o) {
  if (o.type === 'line') { const u = unit(sub(o.E, o.S)); return { type: 'line', a: sub(o.S, mul(u, BIG)), b: add(o.E, mul(u, BIG)) }; }
  return { type: 'circle', c: o.C, r: o.r };
}
function joinPoint(a, b) {
  if (len(sub(a.E, b.S)) < 1e-7) return a.E;
  const want = mul(add(a.E, b.S), 0.5);
  const xs = intersect(infPrim(a), infPrim(b));
  if (!xs.length) return null;
  return xs.map(x => x.p).sort((p, q) => len(sub(p, want)) - len(sub(q, want)))[0];
}

/* Geometrie des Versatzes (für Vorschau und Anlage) */
/* Versatz von Ellipse/Spline: Punktzug entlang der Normalen verschieben, als neuer Spline (positiv = links) */
export function polyOffsetPoints(sk, c, d, seg = 192) {
  const pm = pointMap(sk), S = curveSamples(c, pm, seg);
  const closed = (c.type === 'ellipse' || c.closed) && !isRanged(c);
  const n = S.length, out = [];
  for (let i = 0; i < n; i++) {
    if (closed && i === n - 1) break;
    const a = S[closed ? (i - 1 + n - 1) % (n - 1) : Math.max(0, i - 1)], b = S[closed ? (i + 1) % (n - 1) : Math.min(n - 1, i + 1)];
    const t = unit(sub(b, a));
    out.push([S[i][0] - t[1] * d, S[i][1] + t[0] * d]);
  }
  return { pts: out, closed };
}
export function signedPolyDist(sk, c, uv) {
  const pm = pointMap(sk), S = curveSamples(c, pm, 192);
  let best = Infinity, sign = 1;
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1], v = sub(b, a), L2 = v[0] * v[0] + v[1] * v[1] || 1e-18;
    const t = Math.max(0, Math.min(1, ((uv[0] - a[0]) * v[0] + (uv[1] - a[1]) * v[1]) / L2));
    const q = [a[0] + v[0] * t, a[1] + v[1] * t], dd = Math.hypot(uv[0] - q[0], uv[1] - q[1]);
    if (dd < best) { best = dd; sign = v[0] * (uv[1] - a[1]) - v[1] * (uv[0] - a[0]) >= 0 ? 1 : -1; }
  }
  return sign * best;
}
function applyPolyOffset(sk, c, d) {
  const { pts, closed } = polyOffsetPoints(sk, c, d);
  if (pts.length < 2) return { ok: false, msg: 'Versatz nicht möglich.' };
  // Stützpunkte gleichmäßig auswählen (genug für eine genaue Kurve)
  const K = closed ? 24 : 16, step = (pts.length - (closed ? 0 : 1)) / K, ids = [];
  for (let k = 0; k < (closed ? K : K + 1); k++) { const q = pts[Math.min(pts.length - 1, Math.round(k * step))]; ids.push(addPoint(sk, q[0], q[1]).id); }
  addSpline(sk, ids, closed, !!c.cons);
  return { ok: true };
}

export function offsetGeometry(sk, curveId, d) {
  const ch = chainFrom(sk, curveId);
  if (!ch) return { ok: false, msg: 'Projizierte Bezüge lassen sich nicht versetzen.' };
  const pm = pointMap(sk);
  const geo = ch.items.map(it => walkElem(it, pm));
  const off = geo.map(g => offsetElem(g, d));
  if (off.some(o => !o)) return { ok: false, msg: 'Der Versatz ist größer als ein Radius der Kette.' };
  if (geo[0].type === 'circle') return { ok: true, ch, geo, off, joints: [] };
  const n = off.length, joints = [];
  for (let i = 0; i < (ch.closed ? n : n - 1); i++) {
    const a = off[i], b = off[(i + 1) % n];
    const p = joinPoint(a, b);
    if (!p) return { ok: false, msg: 'Die versetzten Kurven treffen sich nicht. Kleineren Versatz wählen.' };
    const tangent = Math.abs(cross2(geo[i].t1, geo[(i + 1) % n].t0)) < 1e-6 && dot2(geo[i].t1, geo[(i + 1) % n].t0) > 0;
    joints.push({ p, tangent });
  }
  // Start- und Endpunkte je Glied
  off.forEach((o, i) => {
    o.S2 = ch.closed || i > 0 ? joints[(i - 1 + n) % n].p : o.S;
    o.E2 = ch.closed || i < n - 1 ? joints[i].p : o.E;
    if (o.type === 'line' && len(sub(o.E2, o.S2)) < 1e-7) o.degenerate = true;
  });
  if (off.some(o => o.degenerate)) return { ok: false, msg: 'Bei diesem Versatz verschwindet eine Linie. Kleineren Versatz wählen.' };
  return { ok: true, ch, geo, off, joints };
}

/* Punktzüge der Vorschau */
export function offsetPreview(sk, curveId, d) {
  const pc = sk.curves.find(x => x.id === curveId);
  if (pc && (pc.type === 'ellipse' || pc.type === 'spline')) { const { pts, closed } = polyOffsetPoints(sk, pc, d, 128); return { ok: true, polys: [closed ? [...pts, pts[0]] : pts] }; }
  const g = offsetGeometry(sk, curveId, d);
  if (!g.ok) return { ok: false, msg: g.msg, polys: [] };
  const polys = g.off.map(o => {
    if (o.type === 'line') return [o.S2, o.E2];
    let t0 = 0, t1 = TAU;
    if (o.type === 'arc') {
      const fwd = g.ch.items[g.off.indexOf(o)].fwd;
      const [s, e] = fwd ? [o.S2, o.E2] : [o.E2, o.S2];
      t0 = Math.atan2(s[1] - o.C[1], s[0] - o.C[0]);
      t1 = Math.atan2(e[1] - o.C[1], e[0] - o.C[0]);
      while (t1 <= t0) t1 += TAU;
    }
    const k = Math.max(8, Math.ceil((t1 - t0) / TAU * 96)), pts = [];
    for (let i = 0; i <= k; i++) { const t = t0 + (t1 - t0) * i / k; pts.push([o.C[0] + o.r * Math.cos(t), o.C[1] + o.r * Math.sin(t)]); }
    return pts;
  });
  return { ok: true, polys };
}

/* Versatz anlegen: eine gemeinsame Bemaßung „Versatz“ steuert die ganze Kette */
export function applyOffset(sk, curveId, d) {
  const pc = sk.curves.find(x => x.id === curveId);
  if (pc && (pc.type === 'ellipse' || pc.type === 'spline')) return applyPolyOffset(sk, pc, d);
  const g = offsetGeometry(sk, curveId, d);
  if (!g.ok) return g;
  const { ch, off, joints } = g, n = off.length;
  const src = ch.items.map(it => it.c);
  const cons = !!src[0].cons;
  const pairs = [];
  if (off[0].type === 'circle') {
    const k = addCircle(sk, src[0].c, off[0].r, cons);
    pairs.push({ s: src[0].id, d: k.id, sign: off[0].r > src[0].r ? 1 : -1 });
  } else {
    const jp = joints.map(j => addPoint(sk, ...j.p).id);
    const startId = i => (ch.closed || i > 0 ? jp[(i - 1 + n) % n] : addPoint(sk, ...off[i].S2).id);
    const endId = i => (ch.closed || i < n - 1 ? jp[i] : addPoint(sk, ...off[i].E2).id);
    const dst = off.map((o, i) => {
      const a = startId(i), b = endId(i);
      if (o.type === 'line') return addLine(sk, a, b, cons);
      return ch.items[i].fwd ? addArc(sk, src[i].c, a, b, cons) : addArc(sk, src[i].c, b, a, cons);
    });
    // tangentiale Übergänge bleiben tangential; eine Linie neben einem solchen Bogen
    // ist dadurch schon festgelegt und bekommt kein eigenes Abstandsmaß
    const tanCount = new Array(n).fill(0);
    joints.forEach((j, i) => {
      const A = dst[i], B = dst[(i + 1) % n];
      if (!j.tangent || (A.type === 'line' && B.type === 'line')) return;
      addRule(sk, makeTangentRule(sk, A.id, B.id));
      if (A.type === 'line') tanCount[i]++;
      if (B.type === 'line') tanCount[(i + 1) % n]++;
    });
    dst.forEach((c, i) => {
      if (c.type === 'line') {
        // zwischen zwei tangentialen Bögen liegt die Linie schon fest
        if (tanCount[i] < 2) addRule(sk, { type: 'parallel', a: src[i].id, b: c.id });
        if (!tanCount[i]) pairs.push({ s: src[i].id, d: c.id });
      } else pairs.push({ s: src[i].id, d: c.id, sign: c.r > src[i].r ? 1 : -1 });
    });
  }
  // Maß zuerst an einer Linie zeigen, sonst am ersten Bogen
  pairs.sort((a, b) => (sk.curves.find(c => c.id === a.d).type === 'line' ? -1 : 1) - (sk.curves.find(c => c.id === b.d).type === 'line' ? -1 : 1));
  const rule = addRule(sk, { type: 'offset', value: Math.abs(d), pairs });
  return { ok: true, ruleId: rule.id };
}

/* Zwei Punkte, zwischen denen die Versatz-Bemaßung gezeichnet wird */
export function offsetDimPoints(r, pm, cm) {
  const q = r.pairs && r.pairs[0];
  if (!q) return null;
  const S = cm.get(q.s), D = cm.get(q.d);
  if (!S || !D) return null;
  if (S.type === 'line') {
    const a = xy(pm.get(D.p1)), b = xy(pm.get(D.p2)), m = mul(add(a, b), 0.5);
    const s1 = xy(pm.get(S.p1)), s2 = xy(pm.get(S.p2)), u = unit(sub(s2, s1));
    const f = add(s1, mul(u, dot2(sub(m, s1), u)));
    return [f, m];
  }
  const C = xy(pm.get(S.c));
  const t = S.type === 'arc' ? (S.a0 + S.a1) / 2 : Math.PI / 4;
  const v = [Math.cos(t), Math.sin(t)];
  return [add(C, mul(v, S.r)), add(C, mul(v, D.r))];
}

/* ---------- Verlängern ---------- */
function extendSpan(sk, curveId, uv) {
  const c = sk.curves.find(x => x.id === curveId);
  if (!c || c.ref || (c.type !== 'line' && c.type !== 'arc')) return { ok: false, msg: 'Linien und Bögen lassen sich verlängern.' };
  const pm = pointMap(sk);
  const [e0, e1] = ends(c);
  const P0 = xy(pm.get(e0)), P1 = xy(pm.get(e1));
  const atEnd1 = len(sub(uv, P1)) <= len(sub(uv, P0));
  const pid = atEnd1 ? e1 : e0;
  if (pid === 'O' || pm.get(pid).ref || sk.curves.some(o => o.id !== c.id && [o.p1, o.p2, o.c, o.s, o.e].includes(pid))) {
    return { ok: false, msg: 'Nur freie Enden lassen sich verlängern.' };
  }
  const targets = sk.curves.filter(o => o.id !== c.id).map(o => ({ id: o.id, P: prim(o, pm) }));
  targets.push({ id: 'AX', P: { type: 'line', a: [-BIG, 0], b: [BIG, 0] } }, { id: 'AY', P: { type: 'line', a: [0, -BIG], b: [0, BIG] } });
  let best = null;
  if (c.type === 'line') {
    const from = atEnd1 ? P0 : P1, tip = atEnd1 ? P1 : P0, u = unit(sub(tip, from));
    const ray = { type: 'line', a: tip, b: add(tip, mul(u, BIG)) };
    targets.forEach(t => intersect(ray, t.P).forEach(x => {
      const dist = x.ta * BIG;
      if (dist > 1e-6 && (!best || dist < best.dist)) best = { dist, p: x.p, target: t.id };
    }));
    if (!best) return { ok: false, msg: 'In Verlängerung liegt keine Kurve.' };
    return { ok: true, c, pid, tip, p: best.p, target: best.target, kind: 'line' };
  }
  // Bogen: auf dem Vollkreis weiterlaufen
  const C = xy(pm.get(c.c)), full = { type: 'circle', c: C, r: c.r };
  targets.forEach(t => intersect(full, t.P).forEach(x => {
    const ang = Math.atan2(x.p[1] - C[1], x.p[0] - C[0]);
    const adv = atEnd1 ? normAngle(ang, c.a1) - c.a1 : c.a0 - (normAngle(ang, c.a0 - TAU + 1e-12));
    const span = c.a1 - c.a0;
    if (adv > 1e-7 && adv < TAU - span - 1e-7 && (!best || adv < best.adv)) best = { adv, p: x.p, target: t.id };
  }));
  if (!best) return { ok: false, msg: 'In Verlängerung liegt keine Kurve.' };
  return { ok: true, c, pid, p: best.p, target: best.target, kind: 'arc', C, atEnd1, adv: best.adv };
}

export function extendPreview(sk, curveId, uv) {
  const x = extendSpan(sk, curveId, uv);
  if (!x.ok) return null;
  if (x.kind === 'line') return [x.tip, x.p];
  const c = x.c, pts = [];
  const t0 = x.atEnd1 ? c.a1 : c.a0 - x.adv, t1 = x.atEnd1 ? c.a1 + x.adv : c.a0;
  const k = Math.max(6, Math.ceil((t1 - t0) / TAU * 96));
  for (let i = 0; i <= k; i++) { const t = t0 + (t1 - t0) * i / k; pts.push([x.C[0] + c.r * Math.cos(t), x.C[1] + c.r * Math.sin(t)]); }
  return pts;
}

export function extendAt(sk, curveId, uv) {
  const x = extendSpan(sk, curveId, uv);
  if (!x.ok) return x;
  const c = x.c;
  // Längenmaße der Linie würden die Verlängerung verhindern
  sk.rules = sk.rules.filter(r => !(r.type === 'distance' && r.a === c.id && r.b == null) && !(r.type === 'pointOnCurve' && r.p === x.pid) && !(r.type === 'fix' && r.p === x.pid));
  const hit = sk.points.find(q => q.id !== x.pid && Math.hypot(q.x - x.p[0], q.y - x.p[1]) < 1e-7);
  if (hit) {
    if (c.p1 === x.pid) c.p1 = hit.id; else if (c.p2 === x.pid) c.p2 = hit.id; else if (c.s === x.pid) c.s = hit.id; else c.e = hit.id;
    dropIfOrphan(sk, x.pid);
  } else {
    const p = sk.points.find(q => q.id === x.pid);
    p.x = x.p[0]; p.y = x.p[1];
    addRule(sk, { type: 'pointOnCurve', p: x.pid, c: x.target });
  }
  if (c.type === 'arc') syncArc(sk, c);
  return { ok: true };
}

/* ---------- Ecke fasen (gleiche Schenkel) ---------- */
export function chamferCorner(sk, pid, dist) {
  const pm = pointMap(sk);
  const lines = sk.curves.filter(c => c.type === 'line' && (c.p1 === pid || c.p2 === pid));
  const others = sk.curves.filter(c => c.type !== 'line' && [c.c, c.s, c.e].includes(pid));
  if (lines.length !== 2 || others.length) return { ok: false, msg: 'Fasen geht an einer Ecke, an der genau zwei Linien zusammenkommen.' };
  if (lines.some(l => l.ref)) return { ok: false, msg: 'Projizierte Bezüge lassen sich nicht fasen.' };
  const [L1, L2] = lines;
  const P = xy(pm.get(pid));
  const far = l => xy(pm.get(l.p1 === pid ? l.p2 : l.p1));
  const A = far(L1), B = far(L2);
  if (dist >= len(sub(A, P)) - 1e-9 || dist >= len(sub(B, P)) - 1e-9) return { ok: false, msg: 'Die Fase ist zu groß für diese Ecke.' };
  const u1 = unit(sub(A, P)), u2 = unit(sub(B, P));
  if (Math.abs(cross2(u1, u2)) < 1e-6) return { ok: false, msg: 'An dieser Ecke liegen die Linien in einer Flucht.' };
  [L1, L2].forEach(L => {
    const farId = L.p1 === pid ? L.p2 : L.p1;
    sk.rules.forEach(q => { if (q.type === 'distance' && q.a === L.id && q.b == null) { q.a = farId; q.b = pid; } });
  });
  const t1 = addPoint(sk, ...add(P, mul(u1, dist))), t2 = addPoint(sk, ...add(P, mul(u2, dist)));
  if (L1.p1 === pid) L1.p1 = t1.id; else L1.p2 = t1.id;
  if (L2.p1 === pid) L2.p1 = t2.id; else L2.p2 = t2.id;
  addLine(sk, t1.id, t2.id, !!L1.cons);
  // die Ecke bleibt als gedachter Schnittpunkt, von ihr aus wird die Fase gemessen
  addRule(sk, { type: 'pointOnCurve', p: pid, c: L1.id });
  addRule(sk, { type: 'pointOnCurve', p: pid, c: L2.id });
  const ang = Math.atan2(u1[1] + u2[1], u1[0] + u2[0]);
  const r = addRule(sk, { type: 'chamfer', p: pid, a: t1.id, b: t2.id, value: dist, off: [-Math.cos(ang) * dist * 0.6, -Math.sin(ang) * dist * 0.6] });
  return { ok: true, ruleId: r.id };
}

/* ---------- Tangentialbogen am Ende einer Kurve ---------- */
/* Richtung, in der die Kurve an ihrem freien Ende weiterläuft */
export function endTangent(sk, pid) {
  const pm = pointMap(sk);
  const at = sk.curves.filter(c => !c.virtual && (c.type === 'line' || c.type === 'arc') && ends(c).includes(pid));
  if (at.length !== 1) return null;
  const c = at[0], P = xy(pm.get(pid));
  if (c.type === 'line') { const o = xy(pm.get(c.p1 === pid ? c.p2 : c.p1)); return { curve: c.id, dir: unit(sub(P, o)) }; }
  const C = xy(pm.get(c.c)), v = unit(sub(P, C));
  return { curve: c.id, dir: pid === c.e ? [-v[1], v[0]] : [v[1], -v[0]] };
}
/* Mittelpunkt des Bogens, der in S mit Richtung t beginnt und durch E geht */
export function tangentArcGeom(S, t, E) {
  const d = sub(E, S), n = [-t[1], t[0]];
  const den = 2 * dot2(d, n);
  if (Math.abs(den) < 1e-9) return null;
  const k = dot2(d, d) / den;
  return { C: add(S, mul(n, k)), r: Math.abs(k), ccw: k > 0 };
}

/* ---------- Kopieren mit Abbildung (Verschieben/Drehen als Kopie) ---------- */
export function copyItems(sk, ids, xf, { dAngle = 0 } = {}) {
  const pm = pointMap(sk), cm = curveMap(sk);
  const curves = ids.map(id => sk.curves.find(c => c.id === id)).filter(c => c && !c.ref);
  const texts = ids.map(id => (sk.texts || []).find(t => t.id === id)).filter(Boolean);
  const pts = ids.filter(id => sk.points.some(p => p.id === id && !p.ref) && !cm.has(id));
  const map = new Map();
  const mp = pid => { if (!map.has(pid)) map.set(pid, addPoint(sk, ...xf(xy(pm.get(pid)))).id); return map.get(pid); };
  const out = [];
  curves.forEach(c => {
    let k;
    if (c.type === 'line') k = addLine(sk, mp(c.p1), mp(c.p2), !!c.cons);
    else if (c.type === 'circle') { k = addCircle(sk, mp(c.c), c.r, !!c.cons); addRule(sk, { type: 'equal', a: c.id, b: k.id }); }
    else { k = addArc(sk, mp(c.c), mp(c.s), mp(c.e), !!c.cons); addRule(sk, { type: 'equal', a: c.id, b: k.id }); }
    out.push(k.id);
  });
  texts.forEach(t => {
    const nt = { ...t, id: sid('t'), p: mp(t.p), angle: (t.angle || 0) + dAngle };
    sk.texts.push(nt);
    out.push(nt.id);
  });
  pts.forEach(p => out.push(mp(p)));
  return out;
}

/* ---------- Verschieben und Drehen ---------- */
/* Punkte der Auswahl (Kurvenpunkte, freie Punkte, Textanker) */
export function selectionPoints(sk, ids) {
  const pts = new Set();
  ids.forEach(id => {
    const c = sk.curves.find(x => x.id === id);
    if (c) { if (!c.ref) curvePointIds(c).forEach(q => pts.add(q)); return; }
    const t = (sk.texts || []).find(x => x.id === id);
    if (t) { pts.add(t.p); return; }
    const p = sk.points.find(x => x.id === id);
    if (p && !p.ref) pts.add(id);
  });
  pts.delete('O');
  return pts;
}
export function transformItems(sk, ids, xf, { dAngle = 0 } = {}) {
  const pts = selectionPoints(sk, ids);
  if (!pts.size) return { ok: false, msg: 'Erst Elemente der Skizze wählen.' };
  sk.points.forEach(p => { if (pts.has(p.id) && !p.ref) { const q = xf([p.x, p.y]); p.x = q[0]; p.y = q[1]; } });
  sk.curves.forEach(c => { if (c.type === 'arc' && curvePointIds(c).some(q => pts.has(q))) syncArc(sk, c); });
  if (dAngle) (sk.texts || []).forEach(t => { if (ids.includes(t.id)) t.angle = (t.angle || 0) + dAngle; });
  return { ok: true, moved: [...pts] };
}
export const rotateFn = (C, a) => { const ca = Math.cos(a), sa = Math.sin(a); return p => { const v = sub(p, C); return [C[0] + v[0] * ca - v[1] * sa, C[1] + v[0] * sa + v[1] * ca]; }; };

/* ---------- Verknüpfte Muster ----------
   Ein Muster ist ein Eintrag in sk.patterns. Die Kopien tragen pat: <id>. Gebunden werden sie über
   unsichtbare Hilfskurven: beim Kreismuster ein Hilfsbogen Mittelpunkt → Quellpunkt → Kopie mit festem
   Öffnungswinkel, beim linearen Muster eine Hilfslinie je Schritt, parallel und gleich lang zur
   sichtbaren Achse (Konstruktionslinie mit Abstandsmaß). Ändert sich die Quelle, folgen die Kopien. */
function patternSources(sk, P) {
  const curves = P.items.map(id => sk.curves.find(c => c.id === id)).filter(c => c && !c.ref && !c.pat);
  const free = P.items.filter(id => sk.points.some(p => p.id === id && !p.ref && !p.pat));
  const texts = P.items.map(id => (sk.texts || []).find(t => t.id === id)).filter(t => t && !t.pat);
  const pts = [...new Set([...curves.flatMap(c => curvePointIds(c)), ...free, ...texts.map(t => t.p)])];
  return { curves, texts, pts };
}

/* Ein kopierter Bogen ist durch Mittelpunkt, Anfang und Ende schon überbestimmt (Bogenregel).
   Je Bogen wird darum ein Punkt nur einfach gebunden (Richtung bzw. Abstand), den Rest erledigt der Bogen. */
function reducedPoints(src, center) {
  const red = new Set();
  src.curves.filter(c => c.type === 'arc').forEach(c => {
    const pick = [c.c, c.s, c.e].find(id => id !== center && !red.has(id));
    if (pick) red.add(pick);
  });
  return red;
}

function genPattern(sk, P) {
  const pm = pointMap(sk), cm = curveMap(sk);
  const src = patternSources(sk, P);
  if (!src.pts.length) return false;
  const red = reducedPoints(src, P.center);
  const n = P.count;
  let C = null, v = null;
  if (P.kind === 'circular') C = xy(pm.get(P.center));
  else { const ax = cm.get(P.axis); v = sub(xy(pm.get(ax.p2)), xy(pm.get(ax.p1))); }
  const hiddenRule = r => addRule(sk, { ...r, hidden: true, pat: P.id });
  let prev = new Map(src.pts.map(id => [id, id]));
  for (let k = 1; k < n; k++) {
    const map = new Map(), a = TAU * k / n;
    src.pts.forEach(id => {
      const p0 = xy(pm.get(id));
      if (P.kind === 'circular') {
        if (id === P.center || len(sub(p0, C)) < 1e-9) { map.set(id, id); return; }
        const q = rotateFn(C, a)(p0);
        const np = addPoint(sk, ...q); np.pat = P.id;
        map.set(id, np.id);
        const h = addHelper(sk, { type: 'arc', c: P.center, s: id, e: np.id, pat: P.id });
        if (!red.has(id)) hiddenRule({ type: 'patAngle', c: h.id, value: a });
        return;
      }
      let nid;
      if (k === 1 && id === P.anchor) nid = P.step;
      else { const np = addPoint(sk, ...add(p0, mul(v, k))); np.pat = P.id; nid = np.id; }
      map.set(id, nid);
      if (k === 1 && id === P.anchor) return;
      const h = addHelper(sk, { type: 'line', p1: prev.get(id), p2: nid, pat: P.id });
      hiddenRule({ type: 'parallel', a: P.axis, b: h.id });
      if (!red.has(id)) hiddenRule({ type: 'equal', a: P.axis, b: h.id });
    });
    src.curves.forEach(c => {
      let q;
      if (c.type === 'line') q = addLine(sk, map.get(c.p1), map.get(c.p2), !!c.cons);
      else if (c.type === 'circle') { q = addCircle(sk, map.get(c.c), c.r, !!c.cons); hiddenRule({ type: 'equal', a: c.id, b: q.id }); }
      else q = addArc(sk, map.get(c.c), map.get(c.s), map.get(c.e), !!c.cons);
      q.pat = P.id;
    });
    src.texts.forEach(t => {
      const nt = { ...t, id: sid('t'), p: map.get(t.p), pat: P.id, angle: (t.angle || 0) + (P.kind === 'circular' ? a : 0) };
      sk.texts.push(nt);
    });
    prev = map;
  }
  return true;
}

export function createPattern(sk, kind, items, opts) {
  const count = Math.max(2, Math.min(100, Math.round(opts.count)));
  if (!sk.patterns) sk.patterns = [];
  if (!sk.texts) sk.texts = [];
  const P = { id: sid('m'), kind, items: items.slice(), count };
  const src = patternSources(sk, P);
  if (!src.pts.length) return { ok: false, msg: 'Erst Elemente der Skizze wählen (keine projizierten Kanten).' };
  let dimId = null;
  if (kind === 'circular') P.center = opts.centerId;
  else {
    const pm = pointMap(sk);
    const red = reducedPoints(src, null);
    P.anchor = src.pts.find(id => !red.has(id)) || src.pts[0];
    const A = xy(pm.get(P.anchor)), S = addPoint(sk, ...add(A, opts.step));
    S.patStep = P.id;
    const axis = addLine(sk, P.anchor, S.id, true);
    axis.patAxis = P.id;
    P.step = S.id; P.axis = axis.id;
    const L = len(opts.step), u = unit(opts.step);
    dimId = addRule(sk, { type: 'distance', a: axis.id, value: L, off: [-u[1] * Math.max(4, L * 0.15), u[0] * Math.max(4, L * 0.15)] }).id;
  }
  sk.patterns.push(P);
  genPattern(sk, P);
  return { ok: true, id: P.id, dimId };
}

/* Anzahl ändern: Kopien entfernen und neu erzeugen (Achse und Abstandsmaß bleiben) */
export function setPatternCount(sk, pid, count) {
  const P = (sk.patterns || []).find(x => x.id === pid);
  if (!P) return { ok: false, msg: 'Muster nicht gefunden.' };
  const ids = [...sk.curves.filter(c => c.pat === pid).map(c => c.id), ...sk.points.filter(p => p.pat === pid).map(p => p.id), ...(sk.texts || []).filter(t => t.pat === pid).map(t => t.id)];
  deleteItems(sk, ids);
  sk.rules = sk.rules.filter(r => r.pat !== pid);
  sk.helpers = (sk.helpers || []).filter(h => h.pat !== pid);
  P.count = Math.max(2, Math.min(100, Math.round(count)));
  if (!genPattern(sk, P)) { sk.patterns = sk.patterns.filter(x => x.id !== pid); return { ok: false, msg: 'Die Ausgangselemente des Musters gibt es nicht mehr.' }; }
  return { ok: true };
}
/* Zu welchem Muster gehört ein Element (Kopie, Quelle oder Achse)? */
export function patternOf(sk, id) {
  const c = sk.curves.find(x => x.id === id), p = sk.points.find(x => x.id === id), t = (sk.texts || []).find(x => x.id === id);
  const tag = (c && (c.pat || c.patAxis)) || (p && (p.pat || p.patStep)) || (t && t.pat);
  if (tag) return (sk.patterns || []).find(P => P.id === tag) || null;
  return (sk.patterns || []).find(P => P.items.includes(id)) || null;
}

/* ---------- Text ---------- */
export function addText(sk, uv, text, opts = {}) {
  if (!sk.texts) sk.texts = [];
  const p = addPoint(sk, uv[0], uv[1]);
  const t = { id: sid('t'), p: p.id, text, h: opts.h || 5, font: opts.font || 'sans', angle: opts.angle || 0 };
  sk.texts.push(t);
  return t;
}

/* Abhängigkeiten automatisch (praktisch nach DXF-/SVG-Import): fast waagrechte
   bzw. senkrechte Linien (≤ 0,5°) → Horizontal/Vertikal, Kurvenenden, die sich fast decken (≤ tol), aber verschiedene
   Punkte sind → Deckungsgleich, Linie–Bogen bzw. Bogen–Bogen an einem gemeinsamen Ende mit fast gleicher Richtung
   (≤ 0,5°) → Tangential. Vorhandene Regeln werden nicht doppelt angelegt. Gibt die Anzahlen zurück. */
export function autoConstraints(sk, tol = 1e-3, angDeg = 0.5) {
  const pm = pointMap(sk), lim = Math.sin(angDeg * Math.PI / 180), out = { hv: 0, coincident: 0, tangent: 0 };
  const has = (type, test) => sk.rules.some(r => r.type === type && test(r));
  const curves = sk.curves.filter(c => !c.ref && !c.virtual);
  curves.filter(c => c.type === 'line').forEach(c => {
    const a = pm.get(c.p1), b = pm.get(c.p2);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9 || has('horizontal', r => r.l === c.id) || has('vertical', r => r.l === c.id) || has('angle', r => r.a === c.id || r.b === c.id)) return;
    if (Math.abs(dy) / L <= lim) { addRule(sk, { type: 'horizontal', l: c.id }); out.hv++; }
    else if (Math.abs(dx) / L <= lim) { addRule(sk, { type: 'vertical', l: c.id }); out.hv++; }
  });
  const endsOf = c => (c.type === 'line' ? [c.p1, c.p2] : c.type === 'arc' ? [c.s, c.e] : c.type === 'spline' && !c.closed ? [c.pts[0], c.pts[c.pts.length - 1]] : []);
  const ids = [...new Set(curves.flatMap(endsOf))];
  const linked = (a, b) => has('coincident', r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = pm.get(ids[i]), b = pm.get(ids[j]);
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) <= tol && !linked(ids[i], ids[j])) { addRule(sk, { type: 'coincident', a: ids[i], b: ids[j] }); out.coincident++; }
  }
  // Richtung, in der die Kurve am Ende pid hinausläuft
  const dirAt = (c, pid) => {
    if (c.type === 'line') { const a = pm.get(c.p1), b = pm.get(c.p2), s = pid === c.p2 ? 1 : -1, L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [s * (b.x - a.x) / L, s * (b.y - a.y) / L]; }
    if (c.type === 'arc') return pid === c.e ? [-Math.sin(c.a1), Math.cos(c.a1)] : [Math.sin(c.a0), -Math.cos(c.a0)];
    return null;
  };
  const tcands = curves.filter(c => c.type === 'line' || c.type === 'arc');
  for (let i = 0; i < tcands.length; i++) for (let j = i + 1; j < tcands.length; j++) {
    const A = tcands[i], B = tcands[j];
    if (A.type === 'line' && B.type === 'line') continue;
    const shared = endsOf(A).find(id => endsOf(B).includes(id));
    if (!shared || has('tangent', r => (r.a === A.id && r.b === B.id) || (r.a === B.id && r.b === A.id))) continue;
    const da = dirAt(A, shared), db = dirAt(B, shared);
    if (!da || !db) continue;
    // tangential, wenn beide Kurven am gemeinsamen Ende in entgegengesetzte Richtungen hinauslaufen
    if (Math.abs(da[0] * db[1] - da[1] * db[0]) <= lim && da[0] * db[0] + da[1] * db[1] < 0) { addRule(sk, makeTangentRule(sk, A.id, B.id)); out.tangent++; }
  }
  return out;
}

/* Auto-Abhängigkeit von Bezug: erst waagerecht/senkrecht/deckungsgleich/tangential, dann
   Maße – Durchmesser, Radien, Linienlängen – und die Lage aller Punkte ab dem Bezugspunkt (waagerecht und senkrecht),
   jedes Maß nur, wenn es einen Freiheitsgrad nimmt. Für das Werkzeug im Skizzeneditor und für Skizzen, die cantcodecad
   selbst erzeugt (STEP-Teil als Features), damit sie per Maßänderung bearbeitbar sind. Rückgabe { hv, coincident,
   tangent, dims, fixed, dof } oder null. */
export function autoBemassung(d, datum, tol = 1e-3) {
  const auto = autoConstraints(d, tol);
  const res0 = solveSketch(d, { write: false });
  if (!res0.ok || res0.dof == null) return null;
  let dof = res0.dof, dims = 0, fixed = 0, k = 0;
  const pm = pointMap(d), cm = curveMap(d), D = pm.get(datum);
  const curves = d.curves.filter(c => !c.ref && !c.virtual);
  const ids = [...new Set(curves.flatMap(c => curvePointIds(c)))].filter(id => id !== datum && pm.has(id) && !pm.get(id).virtual && !pm.get(id).ref);
  const xs = ids.map(id => pm.get(id).x), ys = ids.map(id => pm.get(id).y);
  const S = Math.max(10, Math.max(...xs, D.x) - Math.min(...xs, D.x), Math.max(...ys, D.y) - Math.min(...ys, D.y)), step = S * 0.06;
  const tryRule = r => {
    if (dof <= 0) return false;
    const rr = addRule(d, r), t = solveSketch(d, { write: false });
    if (!t.ok || t.conflicts.length || t.redundant.includes(rr.id) || !(t.dof < dof)) { d.rules.splice(d.rules.indexOf(rr), 1); return false; }
    dof = t.dof;
    return true;
  };
  const dim = (r, off) => {
    r.value = measure(d, r, pm, cm);
    if (r.type !== 'hdistance' && r.type !== 'vdistance') r.value = Math.abs(r.value);
    if (r.type === 'distance' && r.value < 1e-9) return;
    r.off = off;
    if (tryRule(r)) dims++;
  };
  if (datum !== 'O' && !d.rules.some(r => r.type === 'fix' && r.p === datum) && tryRule({ type: 'fix', p: datum })) fixed++;
  // Größen zuerst: Durchmesser, Radien, Linienlängen (Maß seitlich der Linie)
  curves.forEach(c => {
    if (c.type === 'circle') dim({ type: 'diameter', c: c.id }, [step, step]);
    else if (c.type === 'arc') dim({ type: 'radius', c: c.id }, [step, step]);
    else if (c.type === 'line') {
      const a = pm.get(c.p1), b = pm.get(c.p2), L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      dim({ type: 'distance', a: c.id }, [-(b.y - a.y) / L * step, (b.x - a.x) / L * step]);
    }
  });
  // Lage ab dem Bezug, nächste Punkte zuerst
  ids.sort((a, b) => Math.hypot(pm.get(a).x - D.x, pm.get(a).y - D.y) - Math.hypot(pm.get(b).x - D.x, pm.get(b).y - D.y));
  for (const id of ids) {
    if (dof <= 0) break;
    k++;
    dim({ type: 'hdistance', a: datum, b: id }, [0, -step * (1 + k * 0.6)]);
    dim({ type: 'vdistance', a: datum, b: id }, [-step * (1 + k * 0.6), 0]);
  }
  return { ...auto, dims, fixed, dof };
}
