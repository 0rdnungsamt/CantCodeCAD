// 2D-Geometrie für Skizzen: Schnittpunkte zwischen Linien, Bögen und Kreisen.
// Grundformen: { type:'line', a, b } · { type:'arc', c, r, a0, a1 } (gegen den Uhrzeigersinn, a1 > a0)
//              { type:'circle', c, r }
// Parameter: Linie t ∈ [0,1], Bogen/Kreis Winkel (bei Bögen in [a0, a1]).

import { curveSamples, ellipseGeom, isRanged } from './model.js';

const TAU = Math.PI * 2;
export const EPS = 1e-9;

export function prim(c, pm) {
  // Ellipse/Spline als Punktzug (Parameter t = Segmentindex + Anteil)
  if (c.type === 'ellipse' || c.type === 'spline') {
    const pts = curveSamples(c, pm, 128);
    if (pts.length < 2) return null;
    const rg = isRanged(c);
    return { type: 'poly', pts, closed: !rg && (c.type === 'ellipse' || !!c.closed), ell: c.type === 'ellipse' ? ellipseGeom(c, pm) : null, kind: c.type, u0: rg ? c.u0 : 0, u1: rg ? c.u1 : 1 };
  }
  if (c.type === 'line') { const a = pm.get(c.p1), b = pm.get(c.p2); return a && b ? { type: 'line', a: [a.x, a.y], b: [b.x, b.y] } : null; }
  const cp = pm.get(c.c);
  if (!cp) return null;
  if (c.type === 'circle') return { type: 'circle', c: [cp.x, cp.y], r: c.r };
  return { type: 'arc', c: [cp.x, cp.y], r: c.r, a0: c.a0, a1: c.a1 };
}

/* Winkel in den Bereich [a0, a0 + 2π) legen */
export function normAngle(t, a0) {
  while (t < a0 - 1e-12) t += TAU;
  while (t >= a0 + TAU - 1e-12) t -= TAU;
  return t;
}
function onArc(p, t) {
  if (p.type === 'circle') return true;
  const u = normAngle(t, p.a0);
  return u <= p.a1 + 1e-9;
}

export function pointAt(p, t) {
  if (p.type === 'poly') {
    const n = p.pts.length - 1;
    if (p.ell) { const g = p.ell, th = polyU(p, t) * TAU, cr = Math.cos(g.rot), sr = Math.sin(g.rot), x = g.rx * Math.cos(th), y = g.ry * Math.sin(th); return [g.c[0] + x * cr - y * sr, g.c[1] + x * sr + y * cr]; }
    let i = Math.floor(t);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    const f = t - i, a = p.pts[i], b = p.pts[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  if (p.type === 'line') return [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t];
  return [p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t)];
}

/* Parameter des Punktes uv auf der Grundform (Projektion) */
export function paramOf(p, uv) {
  if (p.type === 'poly') {
    let best = 0, bd = Infinity;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const L = { type: 'line', a: p.pts[i], b: p.pts[i + 1] };
      const t = Math.max(0, Math.min(1, paramOf(L, uv))), q = pointAt(L, t), d = Math.hypot(q[0] - uv[0], q[1] - uv[1]);
      if (d < bd) { bd = d; best = i + t; }
    }
    return best;
  }
  if (p.type === 'line') {
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], L2 = dx * dx + dy * dy || 1e-18;
    return ((uv[0] - p.a[0]) * dx + (uv[1] - p.a[1]) * dy) / L2;
  }
  const t = Math.atan2(uv[1] - p.c[1], uv[0] - p.c[0]);
  return p.type === 'arc' ? normAngle(t, p.a0) : t;
}

function lineLine(A, B) {
  const [x1, y1] = A.a, [x2, y2] = A.b, [x3, y3] = B.a, [x4, y4] = B.b;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  const la = Math.hypot(x2 - x1, y2 - y1), lb = Math.hypot(x4 - x3, y4 - y3);
  if (Math.abs(d) < 1e-12 * Math.max(1, la * lb)) return [];
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  const ta = 1e-9 / Math.max(la, 1e-9), tb = 1e-9 / Math.max(lb, 1e-9);
  if (t < -ta || t > 1 + ta || u < -tb || u > 1 + tb) return [];
  return [{ p: [x1 + t * (x2 - x1), y1 + t * (y2 - y1)], ta: Math.min(1, Math.max(0, t)), tb: Math.min(1, Math.max(0, u)) }];
}

function lineRound(L, C) {
  const dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1];
  const fx = L.a[0] - C.c[0], fy = L.a[1] - C.c[1];
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - C.r * C.r;
  let disc = b * b - 4 * a * c;
  if (a < 1e-18) return [];
  const tol = 1e-9 * Math.max(1, C.r * C.r) * a;
  if (disc < -tol) return [];
  disc = Math.max(0, disc);
  const sq = Math.sqrt(disc), out = [];
  const ts = sq < 1e-12 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
  const tl = 1e-9 / Math.sqrt(a);
  ts.forEach(t => {
    if (t < -tl || t > 1 + tl) return;
    t = Math.min(1, Math.max(0, t));
    const p = [L.a[0] + t * dx, L.a[1] + t * dy];
    const ang = Math.atan2(p[1] - C.c[1], p[0] - C.c[0]);
    if (!onArc(C, ang)) return;
    out.push({ p, ta: t, tb: C.type === 'arc' ? normAngle(ang, C.a0) : ang });
  });
  return out;
}

function roundRound(A, B) {
  const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
  if (d < 1e-12) return [];
  if (d > A.r + B.r + 1e-9 || d < Math.abs(A.r - B.r) - 1e-9) return [];
  const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d);
  const h2 = A.r * A.r - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = A.c[0] + a * dx / d, my = A.c[1] + a * dy / d;
  const pts = h < 1e-12 ? [[mx, my]] : [[mx + h * dy / d, my - h * dx / d], [mx - h * dy / d, my + h * dx / d]];
  const out = [];
  pts.forEach(p => {
    const ta = Math.atan2(p[1] - A.c[1], p[0] - A.c[0]), tb = Math.atan2(p[1] - B.c[1], p[0] - B.c[0]);
    if (!onArc(A, ta) || !onArc(B, tb)) return;
    out.push({ p, ta: A.type === 'arc' ? normAngle(ta, A.a0) : ta, tb: B.type === 'arc' ? normAngle(tb, B.a0) : tb });
  });
  return out;
}

/* Punktzug-Parameter t (Segmentindex) ↔ Kurvenparameter u ∈ [u0, u1] */
export const polyU = (p, t) => p.u0 + (p.u1 - p.u0) * t / (p.pts.length - 1);
export const polyT = (p, u) => (u - p.u0) / (p.u1 - p.u0) * (p.pts.length - 1);
const polySegs = p => p.pts.slice(0, -1).map((a, i) => ({ type: 'line', a, b: p.pts[i + 1], i }));
export function intersect(A, B) {
  if (!A || !B) return [];
  if (A.type === 'poly' || B.type === 'poly') {
    const sa = A.type === 'poly' ? polySegs(A) : [A], sb = B.type === 'poly' ? polySegs(B) : [B];
    const out = [];
    sa.forEach(x => sb.forEach(y => intersect(x, y).forEach(h => {
      const ta = A.type === 'poly' ? x.i + h.ta : h.ta, tb = B.type === 'poly' ? y.i + h.tb : h.tb;
      if (!out.some(o => Math.hypot(o.p[0] - h.p[0], o.p[1] - h.p[1]) < 1e-7)) out.push({ p: h.p, ta, tb });
    })));
    // Ellipse gegen Linie/Kreis: Schnittpunkt auf die echte Ellipse nachschärfen
    const refine = (E, O, hit, key) => {
      if (!E.ell || O.type === 'poly') return;
      const n = E.pts.length - 1, g = E.ell;
      const P = th => { const cr = Math.cos(g.rot), sr = Math.sin(g.rot), x = g.rx * Math.cos(th), y = g.ry * Math.sin(th); return [g.c[0] + x * cr - y * sr, g.c[1] + x * sr + y * cr]; };
      const f = th => { const q = P(th); if (O.type === 'line') { const dx = O.b[0] - O.a[0], dy = O.b[1] - O.a[1], L = Math.hypot(dx, dy) || 1; return ((q[0] - O.a[0]) * dy - (q[1] - O.a[1]) * dx) / L; } return Math.hypot(q[0] - O.c[0], q[1] - O.c[1]) - O.r; };
      let t0 = polyU(E, hit[key]) * TAU, t1 = t0 + 1e-4, f0 = f(t0), f1 = f(t1);
      for (let k = 0; k < 20 && Math.abs(f1) > 1e-12 && Math.abs(f1 - f0) > 1e-18; k++) { const t2 = t1 - f1 * (t1 - t0) / (f1 - f0); t0 = t1; f0 = f1; t1 = t2; f1 = f(t1); }
      if (!(Math.abs(f1) < 1e-8) || Math.abs(t1 - polyU(E, hit[key]) * TAU) > TAU / n * 2) return;
      hit.p = P(t1);
      let tt = polyT(E, t1 / TAU);
      if (E.closed) tt = ((tt % n) + n) % n;
      else if (tt < -1e-9 || tt > n + 1e-9) return;
      hit[key] = Math.max(0, Math.min(n, tt));
      if (O.type === 'line') hit[key === 'ta' ? 'tb' : 'ta'] = paramOf(O, hit.p);
      else hit[key === 'ta' ? 'tb' : 'ta'] = O.type === 'arc' ? normAngle(Math.atan2(hit.p[1] - O.c[1], hit.p[0] - O.c[0]), O.a0) : Math.atan2(hit.p[1] - O.c[1], hit.p[0] - O.c[0]);
    };
    out.forEach(h => { if (A.type === 'poly') refine(A, B, h, 'ta'); else refine(B, A, h, 'tb'); });
    return out;
  }
  if (A.type === 'line' && B.type === 'line') return lineLine(A, B);
  if (A.type === 'line') return lineRound(A, B);
  if (B.type === 'line') return lineRound(B, A).map(x => ({ p: x.p, ta: x.tb, tb: x.ta }));
  return roundRound(A, B);
}

/* Liegt der Punkt auf dem Endpunkt der Grundform? */
export function isEndParam(p, t) {
  if (p.type === 'poly') return !p.closed && (t < 1e-7 || t > p.pts.length - 1 - 1e-7);
  if (p.type === 'line') return t < 1e-7 || t > 1 - 1e-7;
  if (p.type === 'arc') return Math.abs(t - p.a0) < 1e-7 || Math.abs(t - p.a1) < 1e-7;
  return false;
}
