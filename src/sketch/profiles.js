// Profilerkennung: findet geschlossene Flächen in einer Skizze.
// Linien und Bögen werden zu einem ebenen Graphen; jede Fläche wird
// gegen den Uhrzeigersinn umlaufen (Flächen-Traversierung über Halbkanten).
// Damit klappen auch geteilte Flächen und T-Stöße. Kreise sind eigene Schleifen.
// Was in einer anderen Fläche liegt, wird dort zum Loch.
import { pointMap } from './model.js';
import { prim, intersect, pointAt, normAngle } from './geom2d.js';

const TAU = Math.PI * 2;
const MERGE_TOL = 1e-5;

export function sketchRegions(sk, { seg = 48 } = {}) {
  const pm = pointMap(sk);
  const nodes = [];
  const nodeAt = xy => {
    let i = nodes.findIndex(n => Math.abs(n.x - xy[0]) < MERGE_TOL && Math.abs(n.y - xy[1]) < MERGE_TOL);
    if (i < 0) { i = nodes.length; nodes.push({ x: xy[0], y: xy[1] }); }
    return i;
  };

  // Kurven als Grundformen sammeln und an allen Schnittpunkten teilen
  const items = [];
  sk.curves.forEach((c, ci) => {
    if (c.cons) return;
    const p = prim(c, pm);
    if (!p) return;
    if (p.type !== 'line' && p.type !== 'poly' && !(p.r > 1e-9)) return;
    if (p.type === 'line' && Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) < 1e-9) return;
    // ci: Stelle der Kurve in der Skizze – die Teilkanten laufen in Kurvenrichtung (u → v), das hält offene Züge stabil
    items.push({ p, splits: [], ci });
  });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      intersect(items[i].p, items[j].p).forEach(x => { items[i].splits.push(x.ta); items[j].splits.push(x.tb); });
    }
  }
  const uniq = (arr, tol) => { const out = []; arr.sort((a, b) => a - b).forEach(v => { if (!out.length || v - out[out.length - 1] > tol) out.push(v); }); return out; };
  const circles = [], closedPolys = [];
  let edges = [];
  for (const it of items) {
    const p = it.p;
    if (p.type === 'line') {
      const ts = uniq([0, 1, ...it.splits], 1e-9);
      for (let k = 0; k < ts.length - 1; k++) {
        const u = nodeAt(pointAt(p, ts[k])), v = nodeAt(pointAt(p, ts[k + 1]));
        if (u !== v) edges.push({ u, v, ci: it.ci, type: 'line' });
      }
    } else if (p.type === 'poly') {
      const n = p.pts.length - 1;
      if (p.closed) {
        const ts = uniq(it.splits.map(t => ((t % n) + n) % n), 1e-9);
        if (ts.length < 2) { closedPolys.push(p); continue; }
        ts.push(ts[0] + n);
        for (let k = 0; k < ts.length - 1; k++) {
          const u = nodeAt(pointAt(p, ts[k] % n)), v = nodeAt(pointAt(p, ts[k + 1] >= n ? ts[k + 1] - n : ts[k + 1]));
          if (u !== v) edges.push({ u, v, ci: it.ci, type: 'poly', pts: polySub(p, ts[k], ts[k + 1]), ell: p.ell, span: (ts[k + 1] - ts[k]) / n * TAU });
        }
      } else {
        const ts = uniq([0, n, ...it.splits], 1e-9);
        for (let k = 0; k < ts.length - 1; k++) {
          const u = nodeAt(pointAt(p, ts[k])), v = nodeAt(pointAt(p, ts[k + 1]));
          if (u !== v) edges.push({ u, v, ci: it.ci, type: 'poly', pts: polySub(p, ts[k], ts[k + 1]), ell: p.ell, span: (ts[k + 1] - ts[k]) / n * (p.u1 - p.u0) * TAU });
        }
      }
    } else if (p.type === 'arc') {
      const ts = uniq([p.a0, p.a1, ...it.splits.map(t => normAngle(t, p.a0)).filter(t => t <= p.a1 + 1e-12)], 1e-9);
      const full = p.a1 - p.a0 > TAU - 1e-9;
      if (full && ts.length <= 2) { circles.push({ c: p.c, r: p.r }); continue; }
      for (let k = 0; k < ts.length - 1; k++) {
        const u = nodeAt(pointAt(p, ts[k])), v = nodeAt(pointAt(p, ts[k + 1]));
        if (u === v) continue;
        edges.push({ u, v, ci: it.ci, type: 'arc', c: p.c, r: p.r, a0: ts[k], a1: ts[k + 1] });
      }
    } else {
      const base = it.splits.length ? it.splits[0] : 0;
      const ts = uniq(it.splits.map(t => normAngle(t, base)), 1e-9);
      if (ts.length < 2) { circles.push({ c: p.c, r: p.r }); continue; }
      ts.push(ts[0] + TAU);
      for (let k = 0; k < ts.length - 1; k++) {
        const u = nodeAt(pointAt(p, ts[k])), v = nodeAt(pointAt(p, ts[k + 1]));
        if (u === v) continue;
        edges.push({ u, v, ci: it.ci, type: 'arc', c: p.c, r: p.r, a0: ts[k], a1: ts[k + 1] });
      }
    }
  }

  // offene Enden abschneiden – was übrig bleibt, sind die offenen Linienzüge
  let openEnds = 0;
  const dropped = [];
  for (;;) {
    const deg = new Array(nodes.length).fill(0);
    edges.forEach(e => { deg[e.u]++; deg[e.v]++; });
    const keep = edges.filter(e => deg[e.u] > 1 && deg[e.v] > 1);
    if (keep.length === edges.length) break;
    dropped.push(...edges.filter(e => deg[e.u] <= 1 || deg[e.v] <= 1));
    openEnds += edges.length - keep.length;
    edges = keep;
  }

  // Halbkanten
  const half = [];
  edges.forEach((e, i) => {
    half.push(mkHalf(e, true, i));
    half.push(mkHalf(e, false, i));
  });
  function mkHalf(e, fwd, ei) {
    const from = fwd ? e.u : e.v, to = fwd ? e.v : e.u;
    const a = nodes[from], b = nodes[to];
    let ang, bias = 0;
    if (e.type === 'line') ang = Math.atan2(b.y - a.y, b.x - a.x);
    else if (e.type === 'poly') {
      const P = e.pts, q0 = fwd ? P[0] : P[P.length - 1];
      let q1 = fwd ? P[1] : P[P.length - 2];
      for (let k = 1; Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) < 1e-12 && k < P.length - 1; k++) q1 = fwd ? P[k + 1] : P[P.length - 2 - k];
      ang = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
    }
    else if (fwd) { ang = Math.atan2(Math.cos(e.a0), -Math.sin(e.a0)); bias = 1e-7; }
    else { ang = Math.atan2(-Math.cos(e.a1), Math.sin(e.a1)); bias = -1e-7; }
    return { e, ei, fwd, from, to, ang: ang + bias };
  }
  const out = nodes.map(() => []);
  half.forEach((h, i) => out[h.from].push(i));
  out.forEach(list => list.sort((i, j) => half[i].ang - half[j].ang));
  const next = hi => {
    const h = half[hi], twin = hi ^ 1;
    const list = out[h.to];
    const k = list.indexOf(twin);
    return list[(k - 1 + list.length) % list.length];
  };

  // Zusammenhangskomponenten
  const comp = nodes.map((_, i) => i);
  const find = i => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  edges.forEach(e => { comp[find(e.u)] = find(e.v); });

  // Flächen ablaufen
  const seen = new Uint8Array(half.length);
  const faces = [];
  for (let s = 0; s < half.length; s++) {
    if (seen[s]) continue;
    const loop = [];
    let h = s, guard = 0;
    while (!seen[h] && guard++ < 100000) { seen[h] = 1; loop.push(h); h = next(h); }
    const loopEdges = loop.map(hi => halfGeom(half[hi]));
    const poly = loopPoly(loopEdges, seg);
    const area = polyArea(poly);
    faces.push({ edges: loopEdges, poly, area, comp: 'g' + find(half[loop[0]].from) });
  }
  function halfGeom(h) {
    const a = nodes[h.from], b = nodes[h.to];
    if (h.e.type === 'line') return { type: 'line', a: [a.x, a.y], b: [b.x, b.y] };
    if (h.e.type === 'poly') {
      const P = h.fwd ? h.e.pts.slice() : h.e.pts.slice().reverse(); P[0] = [a.x, a.y]; P[P.length - 1] = [b.x, b.y];
      const g = { type: 'spl', a: [a.x, a.y], b: [b.x, b.y], pts: P };
      if (h.e.ell) { g.arc = { ...h.e.ell, span: h.e.span, ccw: h.fwd }; }
      return g;
    }
    const e = h.e, tm = (e.a0 + e.a1) / 2;
    return {
      type: 'arc', a: [a.x, a.y], b: [b.x, b.y], c: e.c, r: e.r, ccw: h.fwd,
      t0: h.fwd ? e.a0 : e.a1, t1: h.fwd ? e.a1 : e.a0,
      mid: [e.c[0] + e.r * Math.cos(tm), e.c[1] + e.r * Math.sin(tm)]
    };
  }

  const EPS = 1e-9;
  const bounded = faces.filter(f => f.area > EPS).map(f => ({ outer: { edges: f.edges }, poly: f.poly, area: f.area, comp: f.comp, holes: [] }));
  const boundaries = faces.filter(f => f.area < -EPS).map(f => ({ loop: { edges: reverseLoop(f.edges) }, poly: f.poly.slice().reverse(), area: -f.area, comp: f.comp }));
  closedPolys.forEach((cp, i) => {
    let pts = cp.pts.slice();
    if (polyArea(pts) < 0) pts = pts.reverse();
    const edge = { type: 'spl', a: pts[0], b: pts[0], pts, closed: true, ell: cp.ell || null };
    const poly = pts.slice(0, -1), area = Math.abs(polyArea(poly));
    bounded.push({ outer: { edges: [edge] }, poly, area, comp: 'q' + i, holes: [] });
    boundaries.push({ loop: { edges: [edge] }, poly, area, comp: 'q' + i });
  });
  circles.forEach((ci, i) => {
    const poly = circlePoly(ci, seg * 2);
    const area = Math.PI * ci.r * ci.r;
    bounded.push({ outer: { circle: ci }, poly, area, comp: 'c' + i, holes: [] });
    boundaries.push({ loop: { circle: ci }, poly, area, comp: 'c' + i });
  });

  // Löcher zuordnen: kleinste fremde Fläche, die die Kontur enthält
  boundaries.forEach(b => {
    let best = null;
    for (const f of bounded) {
      if (f.comp === b.comp || f.area <= b.area + EPS) continue;
      if (!polyInPoly(b.poly, f.poly)) continue;
      if (!best || f.area < best.area) best = f;
    }
    if (best) best.holes.push(b);
  });

  const regions = bounded.map(f => {
    const holePolys = f.holes.map(h => h.poly);
    const sample = interiorPoint(f.poly, holePolys);
    const area = f.area - f.holes.reduce((s, h) => s + h.area, 0);
    return { outer: f.outer, holes: f.holes.map(h => h.loop), poly: f.poly, holePolys, area, sample, comp: f.comp };
  });
  regions.forEach(r => {
    r.depth = bounded.filter(f => f.comp !== r.comp && pointInPoly(r.sample, f.poly)).length;
  });
  regions.sort((a, b) => b.area - a.area);

  /* Offene Linienzüge: die abgeschnittenen Kanten zu geordneten Ketten verbinden
     (dünne Wände entlang der Skizze). Zugrichtung immer gleich: Anfang ist der
     Punkt mit der kleineren Koordinate, damit „Seite 1“ und „Seite 2“ stabil bleiben. */
  const chains = [];
  const adj = nodes.map(() => []);
  dropped.forEach((e, i) => { adj[e.u].push(i); adj[e.v].push(i); });
  const used = dropped.map(() => false);
  const walk = from => {
    const out = [], meta = [];
    let cur = from;
    for (;;) {
      const k = adj[cur].find(i => !used[i]);
      if (k === undefined) break;
      used[k] = true;
      const e = dropped[k], fwd = e.u === cur;
      out.push(halfGeom({ e, fwd, from: e.u, to: e.v }));
      meta.push({ ci: e.ci, fwd });
      cur = fwd ? e.v : e.u;
    }
    out.meta = meta;
    return out;
  };
  for (;;) {
    if (used.every(x => x)) break;
    let start = nodes.findIndex((_, i) => adj[i].length === 1 && adj[i].some(k => !used[k]));
    if (start < 0) { const k = dropped.findIndex((_, i) => !used[i]); start = dropped[k].u; }
    const g = walk(start);
    if (!g.length) break;
    const a = g[0].a, b = g[g.length - 1].b;
    /* Zugrichtung = Richtung der ältesten Kurve des Zugs (p1 → p2). Sie hängt nicht von der Lage der Punkte ab:
       „Seite 1“ einer dünnen Wand bleibt dieselbe Seite, auch wenn man einen Endpunkt über den anderen zieht.
       Ohne Kurvenbezug wie bisher: Anfang ist der Punkt mit der kleineren Koordinate. */
    const m = (g.meta || []).filter(x => Number.isInteger(x.ci)).reduce((best, x) => (!best || x.ci < best.ci ? x : best), null);
    const umdrehen = m ? !m.fwd : b[0] < a[0] - MERGE_TOL || (Math.abs(b[0] - a[0]) <= MERGE_TOL && b[1] < a[1] - MERGE_TOL);
    const ge = umdrehen ? reverseLoop(g) : g;
    chains.push({ edges: ge, a: ge[0].a, b: ge[ge.length - 1].b });
  }
  return { regions, openEnds, chains };
}

/* Profile wählen: gespeicherte Punkte → Flächen, sonst Standard (gerade Verschachtelungstiefe) */
export function selectRegions(regions, refs) {
  if (!refs || !refs.length) return regions.filter(r => r.depth % 2 === 0);
  return regions.filter(r => refs.some(p => pointInRegion(r, p)));
}
export function pointInRegion(r, p) {
  return pointInPoly(p, r.poly) && !r.holePolys.some(h => pointInPoly(p, h));
}

/* ---------- Geometriehilfen ---------- */
function reverseLoop(edges) {
  return edges.slice().reverse().map(e => (e.type === 'line'
    ? { type: 'line', a: e.b, b: e.a }
    : e.type === 'spl' ? { ...e, a: e.b, b: e.a, pts: e.pts.slice().reverse(), ...(e.arc ? { arc: { ...e.arc, ccw: !e.arc.ccw } } : {}) }
    : { ...e, a: e.b, b: e.a, ccw: !e.ccw, t0: e.t1, t1: e.t0 }));
}
/* Teilstück eines Punktzugs zwischen den Parametern t0 < t1 (geschlossene Züge laufen über das Ende hinaus) */
function polySub(p, t0, t1) {
  const n = p.pts.length - 1, wrap = t => (p.closed ? ((t % n) + n) % n : t);
  const out = [pointAt(p, wrap(t0))];
  for (let k = Math.floor(t0) + 1; k < t1 - 1e-12; k++) out.push(p.pts[p.closed ? k % n : k]);
  out.push(pointAt(p, t1 >= n && p.closed ? wrap(t1) : t1));
  return out;
}
function loopPoly(edges, seg) {
  const pts = [];
  edges.forEach(e => {
    if (e.type === 'line') { pts.push(e.a); return; }
    if (e.type === 'spl') { pts.push(...e.pts.slice(0, -1)); return; }
    let span = e.t1 - e.t0;
    if (e.ccw) { while (span <= 0) span += TAU; } else { while (span >= 0) span -= TAU; }
    const n = Math.max(4, Math.ceil(Math.abs(span) / TAU * seg));
    for (let i = 0; i < n; i++) {
      const t = e.t0 + span * i / n;
      pts.push([e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]);
    }
  });
  return pts;
}
export function circlePoly(ci, n = 96) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = i / n * TAU; pts.push([ci.c[0] + ci.r * Math.cos(t), ci.c[1] + ci.r * Math.sin(t)]); }
  return pts;
}
export function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
export function pointInPoly(pt, poly) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyInPoly(inner, outer) {
  // alle Stichproben der inneren Kontur liegen in der äußeren
  const step = Math.max(1, Math.floor(inner.length / 12));
  for (let i = 0; i < inner.length; i += step) if (!pointInPoly(inner[i], outer)) return false;
  return true;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-18;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function polyDist(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}
/* Ein Punkt sicher im Inneren (mit Abstand zum Rand), für Profilauswahl und Beschriftung */
export function interiorPoint(poly, holes = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  poly.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  let best = null, bd = -1;
  const N = 28;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p = [x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N];
    if (!pointInPoly(p, poly) || holes.some(h => pointInPoly(p, h))) continue;
    const d = Math.min(polyDist(p, poly), ...holes.map(h => polyDist(p, h)));
    if (d > bd) { bd = d; best = p; }
  }
  if (best) return best;
  let cx = 0, cy = 0;
  poly.forEach(([x, y]) => { cx += x; cy += y; });
  return [cx / poly.length, cy / poly.length];
}
