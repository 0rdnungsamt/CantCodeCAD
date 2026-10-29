// Projizieren: Körperkanten auf eine Skizzenebene abbilden und, wo möglich,
// der Skizze zuordnen, aus der die Kante entstanden ist. Solche Bezüge
// bleiben stabil, wenn sich das Bauteil später ändert.
import { toLocal, toWorld } from '../doc.js';
import { pointMap, arcPoint } from './model.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const near2 = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

/* Kreis durch drei Raumpunkte: Mittelpunkt, Radius, Normale */
function circle3(p, q, r) {
  const a = sub(q, p), b = sub(r, p), n = cross(a, b), nn = dot(n, n);
  if (nn < 1e-18) return null;
  const t = cross(n, a), u = cross(b, n);
  const c = [
    p[0] + (dot(b, b) * t[0] + dot(a, a) * u[0]) / (2 * nn),
    p[1] + (dot(b, b) * t[1] + dot(a, a) * u[1]) / (2 * nn),
    p[2] + (dot(b, b) * t[2] + dot(a, a) * u[2]) / (2 * nn)
  ];
  const l = Math.sqrt(nn);
  return { c, r: len(sub(p, c)), n: [n[0] / l, n[1] / l, n[2] / l] };
}

/* Kante (aus dem Kern: type, p0, p1, mid, q1, q3) → 2D-Geometrie auf der Ebene */
export function projectEdge(pl, e) {
  const L = p => toLocal(pl, p);
  if (e.type === 'LINE') {
    const a = L(e.p0), b = L(e.p1);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return { kind: 'point', p: a };
    return { kind: 'line', a, b };
  }
  if (e.type === 'CIRCLE') {
    const closed = len(sub(e.p0, e.p1)) < 1e-6;
    const g = closed ? circle3(e.q1, e.mid, e.q3) : circle3(e.p0, e.mid, e.p1);
    if (!g) return null;
    const par = Math.abs(dot(g.n, pl.n));
    if (par < 1 - 1e-6) {
      if (par < 1e-6) {
        // Kreis steht senkrecht auf der Ebene: Projektion ist eine Strecke
        const pts = [e.p0, e.q1, e.mid, e.q3, e.p1].map(L);
        let best = [pts[0], pts[0]], bd = 0;
        for (const a of pts) for (const b of pts) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > bd) { bd = d; best = [a, b]; } }
        return bd > 1e-6 ? { kind: 'line', a: best[0], b: best[1] } : null;
      }
      return null; // Ellipse: noch nicht unterstützt
    }
    const c = L(g.c);
    if (closed) return { kind: 'circle', c, r: g.r };
    const s = L(e.p0), en = L(e.p1), m = L(e.mid);
    // Richtung in Skizzenkoordinaten bestimmen
    const ang = p => Math.atan2(p[1] - c[1], p[0] - c[0]);
    const norm = t => { while (t < 0) t += 2 * Math.PI; while (t >= 2 * Math.PI) t -= 2 * Math.PI; return t; };
    const ccw = norm(ang(m) - ang(s)) < norm(ang(en) - ang(s));
    return { kind: 'arc', c, r: g.r, s: ccw ? s : en, e: ccw ? en : s };
  }
  return null;
}

/* Liegt die Projektion genau auf einem Element einer früheren, parallelen Skizze? */
export function matchSketchRef(pl, proj, priorSketches, tol = 1e-4) {
  for (const S of priorSketches) {
    if (Math.abs(Math.abs(dot(S.plane.n, pl.n)) - 1) > 1e-6) continue;
    const pm = pointMap(S);
    const P = id => { const p = pm.get(id); return p ? toLocal(pl, toWorld(S.plane, p.x, p.y)) : null; };
    if (proj.kind === 'point') {
      for (const p of S.points) { const q = P(p.id); if (q && near2(q, proj.p, tol)) return { kind: 'sketch', sketch: S.id, point: p.id }; }
      continue;
    }
    for (const c of S.curves) {
      if (proj.kind === 'line' && c.type === 'line') {
        const a = P(c.p1), b = P(c.p2);
        if ((near2(a, proj.a, tol) && near2(b, proj.b, tol)) || (near2(a, proj.b, tol) && near2(b, proj.a, tol))) return { kind: 'sketch', sketch: S.id, curve: c.id };
      }
      if ((proj.kind === 'circle' && c.type === 'circle') || (proj.kind === 'arc' && c.type === 'arc')) {
        const cc = P(c.c);
        if (cc && near2(cc, proj.c, tol) && Math.abs(c.r - proj.r) < tol) {
          if (proj.kind === 'circle') return { kind: 'sketch', sketch: S.id, curve: c.id };
          const s = P(c.s), e = P(c.e);
          if ((near2(s, proj.s, tol) && near2(e, proj.e, tol)) || (near2(s, proj.e, tol) && near2(e, proj.s, tol))) return { kind: 'sketch', sketch: S.id, curve: c.id };
        }
      }
    }
  }
  return null;
}

/* Aktuelle Lage eines Bezugs auf eine andere Skizze, in Koordinaten der Zielskizze */
export function resolveSketchRef(pl, ref, src) {
  if (!src) return null;
  const pm = pointMap(src);
  const P = id => { const p = pm.get(id); return p ? toLocal(pl, toWorld(src.plane, p.x, p.y)) : null; };
  if (ref.point) { const p = P(ref.point); return p ? { kind: 'point', p } : null; }
  const c = src.curves.find(x => x.id === ref.curve);
  if (!c) return null;
  if (c.type === 'line') { const a = P(c.p1), b = P(c.p2); return a && b ? { kind: 'line', a, b } : null; }
  const cc = P(c.c);
  if (!cc) return null;
  if (c.type === 'circle') return { kind: 'circle', c: cc, r: c.r };
  // Bogen: Umlaufsinn kann sich durch eine gespiegelte Ebene umkehren
  const cp = pm.get(c.c);
  const s = P(c.s), e = P(c.e), m = toLocal(pl, toWorld(src.plane, ...arcPoint(cp, c.r, (c.a0 + c.a1) / 2)));
  const ang = p => Math.atan2(p[1] - cc[1], p[0] - cc[0]);
  const norm = t => { while (t < 0) t += 2 * Math.PI; while (t >= 2 * Math.PI) t -= 2 * Math.PI; return t; };
  const ccw = norm(ang(m) - ang(s)) < norm(ang(e) - ang(s));
  return { kind: 'arc', c: cc, r: c.r, s: ccw ? s : e, e: ccw ? e : s };
}

/* Bezugsgeometrie in einer Skizze auf eine neue Lage setzen (Punkte bleiben dieselben IDs) */
export function applyRefGeometry(sk, curveOrPoint, geo) {
  const pm = new Map(sk.points.map(p => [p.id, p]));
  const set = (id, uv) => { const p = pm.get(id); if (p && uv) { p.x = uv[0]; p.y = uv[1]; } };
  const it = curveOrPoint;
  if (!geo) return false;
  if (it.type === undefined) { if (geo.kind !== 'point') return false; set(it.id, geo.p); return true; }
  if (it.type === 'line' && geo.kind === 'line') { set(it.p1, geo.a); set(it.p2, geo.b); return true; }
  if (it.type === 'circle' && geo.kind === 'circle') { set(it.c, geo.c); it.r = geo.r; return true; }
  if (it.type === 'arc' && geo.kind === 'arc') {
    set(it.c, geo.c); set(it.s, geo.s); set(it.e, geo.e);
    it.r = geo.r;
    it.a0 = Math.atan2(geo.s[1] - geo.c[1], geo.s[0] - geo.c[0]);
    it.a1 = Math.atan2(geo.e[1] - geo.c[1], geo.e[0] - geo.c[0]);
    while (it.a1 <= it.a0) it.a1 += 2 * Math.PI;
    return true;
  }
  return false;
}
