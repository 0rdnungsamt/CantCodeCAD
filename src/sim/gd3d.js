// cantcodecad – Generatives Design räumlich (Fertigung „Uneingeschränkt“): Topologieoptimierung (SIMP) auf
// einem Würfelnetz. Elemente und Steifigkeit wie bei der Festigkeit von Bauteilen (solid.js: Hexaeder mit inkompatiblen
// Moden, matrixfreies CG). Beibehalten-Würfel bleiben voll, Hindernis-Würfel gehören nicht zum Netz, die übrigen Würfel
// im Entwurfsbereich (Startform oder Hülle der Beibehalten-Geometrie) bekommen eine Dichte 0…1. Ziel: steifstes Teil bei
// gegebener Masse (Nachgiebigkeit summiert über die Lastfälle); Dichtefilter (Radius 1,5 Würfel), Optimalitätskriterium,
// Strafexponent p 1 → 3. Ergebnis: Dichtefeld, Masse, Spannung (von Mises an den vollen Würfeln), Sicherheitsfaktor.
// Oberfläche: Marching Tetrahedra auf den Knotendichten (Schwelle 0,5), geglättet (Taubin) – immer geschlossen.
import { voxelize, hexMatrices, vonMises, triDist } from './solid.js';

const CORN = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

/* Netz: Gitter, aktive Würfel, Knoten, Randknoten nahe der Flächen.
   job: { h, bereich: { tris } | { box: [[x,y,z],[x,y,z]] }, beibehalten: [tris], hindernis: [tris], bbox } */
export function gdNetz(job) {
  const { h } = job;
  const B = job.bbox, o = B[0].map(v => v - h * 1.0001);
  const nx = Math.ceil((B[1][0] - o[0]) / h) + 1, ny = Math.ceil((B[1][1] - o[1]) / h) + 1, nz = Math.ceil((B[1][2] - o[2]) / h) + 1;
  const grid = { o, nx, ny, nz };
  const N = nx * ny * nz, art = new Uint8Array(N); // 0 leer, 1 frei, 2 beibehalten
  const fill = (tris, v) => { const g = voxelize(tris, h, null, grid); for (let i = 0; i < N; i++) if (g.cells[i]) art[i] = Math.max(art[i], v); };
  if (job.bereich.tris) fill(job.bereich.tris, 1);
  else {
    const [a, b] = job.bereich.box;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = [o[0] + (i + 0.5) * h, o[1] + (j + 0.5) * h, o[2] + (k + 0.5) * h];
      if (c[0] >= a[0] && c[0] <= b[0] && c[1] >= a[1] && c[1] <= b[1] && c[2] >= a[2] && c[2] <= b[2]) art[(k * ny + j) * nx + i] = 1;
    }
  }
  job.beibehalten.forEach(t => fill(t, 2));
  job.hindernis.forEach(t => { const g = voxelize(t, h, null, grid); for (let i = 0; i < N; i++) if (g.cells[i] && art[i] !== 2) art[i] = 0; });
  const cell = [];
  for (let i = 0; i < N; i++) if (art[i]) cell.push(i);
  const ne = cell.length;
  if (!ne) throw new Error('Der Entwurfsbereich ist leer');
  const NX = nx + 1, NY = ny + 1, map = new Int32Array(NX * NY * (nz + 1)).fill(-1), conn = new Int32Array(ne * 8);
  let nn = 0;
  cell.forEach((c, e) => {
    const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
    CORN.forEach(([a, b, d], q) => { const g = ((k + d) * NY + j + b) * NX + i + a; if (map[g] < 0) map[g] = nn++; conn[8 * e + q] = map[g]; });
  });
  const xyz = new Float64Array(nn * 3);
  for (let g = 0; g < map.length; g++) if (map[g] >= 0) { const n = map[g]; xyz[3 * n] = o[0] + (g % NX) * h; xyz[3 * n + 1] = o[1] + Math.floor(g / NX) % NY * h; xyz[3 * n + 2] = o[2] + Math.floor(g / (NX * NY)) * h; }
  const cnt = new Uint8Array(nn);
  for (let q = 0; q < conn.length; q++) cnt[conn[q]]++;
  const keep = Uint8Array.from(cell, c => (art[c] === 2 ? 1 : 0));
  return { grid, h, cell, conn, xyz, nn, ne, cnt, keep, art };
}
/* Knoten im Abstand ≤ 0,75 h von den Dreiecken einer Fläche (wie solid.js, aber auch innen liegende: die Flächen der
   Beibehalten-Körper liegen ohne Startform oft mitten im Entwurfsbereich) */
export function knotenAn(net, tris) {
  const out = [], lim = 0.75 * net.h, n9 = tris.length / 9;
  const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let q = 0; q < tris.length; q++) { const ax = q % 3; bb[0][ax] = Math.min(bb[0][ax], tris[q]); bb[1][ax] = Math.max(bb[1][ax], tris[q]); }
  for (let n = 0; n < net.nn; n++) {
    const p = [net.xyz[3 * n], net.xyz[3 * n + 1], net.xyz[3 * n + 2]];
    if (p.some((v, ax) => v < bb[0][ax] - lim || v > bb[1][ax] + lim)) continue;
    for (let q = 0; q < n9; q++) {
      if (triDist(p, [tris[9 * q], tris[9 * q + 1], tris[9 * q + 2]], [tris[9 * q + 3], tris[9 * q + 4], tris[9 * q + 5]], [tris[9 * q + 6], tris[9 * q + 7], tris[9 * q + 8]]) <= lim) { out.push(n); break; }
    }
  }
  return out;
}

/* Stützung beim 3D-Druck (Fertigung „Additiv“): Druckrichtung achse (0/1/2) mit Vorzeichen vz, Überhangwinkel
   winkel (Grad, gegen die Druckplatte). Ein Würfel ist gestützt, wenn in der Schicht darunter ein Würfel im waagrechten
   Abstand ≤ cot(winkel) Würfel liegt (45°: Kreuz aus 5 Würfeln, 30°: 3 × 3, 60°: nur der darunter). Die unterste Schicht
   liegt auf der Druckplatte. Rückgabe: Reihenfolge Schicht für Schicht, Stützwürfel je Würfel, Plattenwürfel. */
export function druckStuetzen(net, druck) {
  const { nx, ny, nz } = net.grid, n = [nx, ny, nz], ax = druck.achse, vz = druck.vz >= 0 ? 1 : -1;
  const u = (ax + 1) % 3, v = (ax + 2) % 3, r = 1 / Math.tan(Math.max(1, Math.min(89, druck.winkel)) * Math.PI / 180) + 1e-9;
  const idx = new Map(net.cell.map((c, e) => [c, e]));
  const ijk = c => [c % nx, Math.floor(c / nx) % ny, Math.floor(c / (nx * ny))];
  const lay = e => { const q = ijk(net.cell[e]); return vz > 0 ? q[ax] : n[ax] - 1 - q[ax]; };
  const L = Int32Array.from({ length: net.ne }, (_, e) => lay(e));
  let lmin = Infinity;
  for (let e = 0; e < net.ne; e++) lmin = Math.min(lmin, L[e]);
  const R = Math.floor(r), sup = [];
  for (let e = 0; e < net.ne; e++) {
    const q = ijk(net.cell[e]), out = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      if (Math.hypot(a, b) > r) continue;
      const p = q.slice(); p[ax] -= vz; p[u] += a; p[v] += b;
      if (p.some((x, k) => x < 0 || x >= n[k])) continue;
      const s = idx.get((p[2] * ny + p[1]) * nx + p[0]);
      if (s != null) out.push(s);
    }
    sup.push(Int32Array.from(out));
  }
  const order = Int32Array.from({ length: net.ne }, (_, e) => e).sort((a, b) => L[a] - L[b]);
  const platte = Uint8Array.from(L, l => (l === lmin ? 1 : 0));
  return { order, sup, platte };
}
/* Zahl der ungestützten vollen Würfel (Beibehalten und Druckplatte zählen als gestützt) */
export function ungestuetzt(net, voll, st) {
  let k = 0;
  for (const e of st.order) if (voll[e] && !net.keep[e] && !st.platte[e] && !st.sup[e].some(s => voll[s])) k++;
  return k;
}
/* Zusammenhängende Stücke der Endform (über gemeinsame Würfelflächen): Zahl der Stücke, die Beibehalten-Würfel enthalten –
   mehr als 1 heißt, die Last kommt nicht zur Halterung (Teil zerfällt) */
export function stuecke(net, voll) {
  const { nx, ny } = net.grid, idx = new Map(net.cell.map((c, e) => [c, e])), teil = new Int32Array(net.ne).fill(-1);
  let n = 0;
  const mitKeep = new Set();
  for (let s = 0; s < net.ne; s++) {
    if (!voll[s] || teil[s] >= 0) continue;
    const q = [s]; teil[s] = n;
    while (q.length) {
      const e = q.pop(), c = net.cell[e];
      if (net.keep[e]) mitKeep.add(n);
      for (const d of [1, -1, nx, -nx, nx * ny, -nx * ny]) { const f = idx.get(c + d); if (f != null && voll[f] && teil[f] < 0) { teil[f] = n; q.push(f); } }
    }
    n++;
  }
  return mitKeep.size;
}
/* Verbindung reparieren: jedes abgetrennte Stück mit Beibehalten-Würfeln über den billigsten Weg aus Würfeln mit
   gemeinsamer Fläche an das größte anschließen (Dijkstra, Kosten 1,05 − Dichte – der Weg folgt den grauen Verbindungen
   der Optimierung). unten(e): Würfel darunter (Fräsen/Additiv: die Spalte bis zur Platte wird mit gefüllt) oder null.
   Rückgabe: Zahl der neuen Würfel. */
export function verbinden(net, voll, xp, unten = null) {
  const { nx, ny } = net.grid, idx = new Map(net.cell.map((c, e) => [c, e])), ne = net.ne;
  const nachbarn = e => { const c = net.cell[e], o = []; for (const d of [1, -1, nx, -nx, nx * ny, -nx * ny]) { const f = idx.get(c + d); if (f != null) o.push(f); } return o; };
  let neu = 0;
  for (let runde = 0; runde < 20; runde++) {
    const teil = new Int32Array(ne).fill(-1), keepZahl = [];
    let n = 0;
    for (let s = 0; s < ne; s++) {
      if (!voll[s] || teil[s] >= 0) continue;
      const q = [s]; teil[s] = n; let k = 0;
      while (q.length) { const e = q.pop(); if (net.keep[e]) k++; for (const f of nachbarn(e)) if (voll[f] && teil[f] < 0) { teil[f] = n; q.push(f); } }
      keepZahl.push(k); n++;
    }
    const mitKeep = keepZahl.map((k, i) => (k ? i : -1)).filter(i => i >= 0);
    if (mitKeep.length <= 1) break;
    const haupt = mitKeep.reduce((a, b) => (keepZahl[b] > keepZahl[a] ? b : a));
    // Dijkstra vom Hauptstück bis zum ersten Würfel eines anderen Stücks mit Beibehalten-Würfeln
    const dist = new Float64Array(ne).fill(Infinity), von = new Int32Array(ne).fill(-1), heap = [];
    const push = (e, d) => { heap.push([d, e]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (let e = 0; e < ne; e++) if (teil[e] === haupt) { dist[e] = 0; push(e, 0); }
    let ziel = -1;
    while (heap.length) {
      const [d, e] = pop();
      if (d > dist[e]) continue;
      if (teil[e] >= 0 && teil[e] !== haupt && keepZahl[teil[e]]) { ziel = e; break; }
      for (const f of nachbarn(e)) {
        const w = d + (voll[f] ? 0 : 1.05 - Math.min(1, xp[f]));
        if (w < dist[f]) { dist[f] = w; von[f] = e; push(f, w); }
      }
    }
    if (ziel < 0) break;
    for (let e = von[ziel]; e >= 0 && teil[e] !== haupt; e = von[e]) {
      if (!voll[e]) { voll[e] = 1; neu++; }
      // Fräsen/Additiv: die Spalte darunter bis zur Platte füllen, damit der neue Würfel gestützt ist
      for (let b = unten ? unten(e) : null; b != null && !voll[b]; b = unten(b)) { voll[b] = 1; neu++; }
    }
  }
  return neu;
}
/* Hohlräume beim Gießen: leere Würfel mit vollem Würfel darunter und darüber in derselben Spalte entlang der
   Entformungsrichtung (dort könnte die Form nicht heraus). oben = Würfel direkt darüber (−1: keiner) */
export function hohlraeume(net, voll, st, oben) {
  const ne = net.ne, a = new Uint8Array(ne), b = new Uint8Array(ne);
  for (const e of st.order) { const S = st.sup[e]; a[e] = voll[e] || (S.length && a[S[0]]) ? 1 : 0; }
  for (let q = ne - 1; q >= 0; q--) { const e = st.order[q], o = oben[e]; b[e] = voll[e] || (o >= 0 && b[o]) ? 1 : 0; }
  let k = 0;
  for (let e = 0; e < ne; e++) if (!voll[e] && a[e] && b[e]) k++;
  return { k, a, b };
}
/* Topologieoptimierung. lager: [{ tris, dofs: [0,1,2] }], lastfaelle: [[{ tris, F }]], E, nu, anteil (Volumenanteil der
   freien Würfel), schritte, druck (optional: { achse, vz, winkel, art }) – art 'additiv' (Überhangwinkel), 'fraesen'
   (Werkzeug aus Richtung vz: jede Spalte von unten her voll, keine Hinterschnitte) oder 'giessen' (Entformung entlang
   der Achse, nach beiden Seiten: kein Hohlraum in einer Spalte). Rückgabe: Elementdichten (physikalisch),
   Nachgiebigkeit, Verschiebung, Spannung, ungestützte Würfel bzw. Hohlräume (ohne druck gegen +Z/45°). */
export function gdOptimieren(net, opts, progress = () => {}) {
  const { ne, nn, conn, keep, h } = net, ndof = nn * 3;
  const { E, nu } = opts, Emin = 1e-6;
  const { K: Kh, S } = hexMatrices(nu), Ke = Kh.map(v => v * E * h);
  const free = new Uint8Array(ndof).fill(1);
  opts.lager.forEach(l => knotenAn(net, l.tris).forEach(n => (l.dofs || [0, 1, 2]).forEach(d => { free[3 * n + d] = 0; })));
  if (free.every(v => v)) throw new Error('An den festen Flächen liegt kein Netzknoten');
  const loads = opts.lastfaelle.map(fall => {
    const f = new Float64Array(ndof);
    fall.forEach(L => {
      const ns = knotenAn(net, L.tris);
      if (!ns.length) throw new Error('An einer Lastfläche liegt kein Netzknoten');
      const w = ns.reduce((a, n) => a + net.cnt[n], 0);
      ns.forEach(n => { for (let d = 0; d < 3; d++) f[3 * n + d] += L.F[d] * net.cnt[n] / w; });
    });
    for (let i = 0; i < ndof; i++) if (!free[i]) f[i] = 0;
    return f;
  });
  // Dichtefilter: Nachbarn im Radius 1,5 Würfel (Gewicht rmin − Abstand), über das Gitter gesucht
  const { nx, ny } = net.grid, idx = new Map(net.cell.map((c, e) => [c, e]));
  const nb = [], nw = [];
  for (let e = 0; e < ne; e++) {
    const c = net.cell[e], i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
    const L = [], W = [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const d = Math.hypot(di, dj, dk);
      if (d >= 1.5) continue;
      const q = idx.get(((k + dk) * ny + j + dj) * nx + i + di);
      if (q != null) { L.push(q); W.push(1.5 - d); }
    }
    nb.push(Int32Array.from(L)); nw.push(Float64Array.from(W));
  }
  /* Überhangfilter (nach Langelaar, hier als Begrenzung): Schicht für Schicht von der Platte aus ist die Dichte eines
     Würfels höchstens die größte seiner Stützwürfel – nach dem Dichtefilter, so gilt es für die gedruckte Form */
  const art = opts.druck ? opts.druck.art || 'additiv' : null, guss = art === 'giessen';
  // Fräsen und Gießen: Spalten entlang der Richtung (nur der Würfel direkt darunter stützt, wie Überhang 90°)
  const st = opts.druck ? druckStuetzen(net, art === 'additiv' ? opts.druck : { ...opts.druck, winkel: 89 }) : null;
  const oben = guss ? new Int32Array(ne).fill(-1) : null;
  if (guss) for (let e = 0; e < ne; e++) for (const s of st.sup[e]) oben[s] = e;
  const pm = guss ? new Float64Array(ne) : null, sm = guss ? new Float64Array(ne) : null;
  const ps = guss ? new Int32Array(ne) : null, ss = guss ? new Int32Array(ne) : null;
  /* Jede gefilterte Dichte ist genau eine der ungefilterten (Minimum und Maximum wählen nur aus): src[e] = deren Würfel
     (−1: keine, Dichte 0). Damit gehen die Empfindlichkeiten über die Kettenregel genau dorthin – ohne das zerfielen
     gefräste Ergebnisse in Stücke, weil begrenzte Würfel ihre Ableitung nicht an den Stützwürfel weitergaben */
  const src = st ? new Int32Array(ne) : null;
  const stuetzen = xs => {
    if (!st) return;
    if (guss) {
      // Gießen: in jeder Spalte höchstens das Kleinere aus größter Dichte darunter und darüber – Lücken zwischen Material
      // werden gefüllt (keine Hohlräume, die Form lässt sich nach beiden Seiten abziehen)
      for (const e of st.order) { const b = st.sup[e].length ? st.sup[e][0] : -1; if (b >= 0 && pm[b] > xs[e]) { pm[e] = pm[b]; ps[e] = ps[b]; } else { pm[e] = xs[e]; ps[e] = e; } }
      for (let q = ne - 1; q >= 0; q--) { const e = st.order[q], o = oben[e]; if (o >= 0 && sm[o] > xs[e]) { sm[e] = sm[o]; ss[e] = ss[o]; } else { sm[e] = xs[e]; ss[e] = e; } }
      for (let e = 0; e < ne; e++) { if (pm[e] <= sm[e]) { xs[e] = pm[e]; src[e] = ps[e]; } else { xs[e] = sm[e]; src[e] = ss[e]; } }
      return;
    }
    for (const e of st.order) {
      src[e] = e;
      if (keep[e] || st.platte[e]) continue;
      let m = 0, ms = -1;
      const S = st.sup[e];
      for (let q = 0; q < S.length; q++) if (xs[S[q]] > m) { m = xs[S[q]]; ms = S[q]; }
      if (xs[e] > m) { xs[e] = m; src[e] = ms >= 0 ? src[ms] : -1; }
    }
  };
  const gq = st ? new Float64Array(ne) : null;
  const zurQuelle = d => { gq.fill(0); for (let e = 0; e < ne; e++) { const j = src[e]; if (j >= 0) gq[j] += d[e]; } return gq; };
  const filt = (x, out) => { for (let e = 0; e < ne; e++) { let s = 0, ws = 0; const L = nb[e], W = nw[e]; for (let q = 0; q < L.length; q++) { s += W[q] * x[L[q]]; ws += W[q]; } out[e] = s / ws; } };
  const filtT = (g, out) => { out.fill(0); for (let e = 0; e < ne; e++) { const L = nb[e], W = nw[e]; let ws = 0; for (let q = 0; q < L.length; q++) ws += W[q]; for (let q = 0; q < L.length; q++) out[L[q]] += W[q] / ws * g[e]; } };
  const nfree = ne - keep.reduce((a, v) => a + v, 0);
  const vol = opts.anteil;
  const x = new Float64Array(ne).fill(vol), xp = new Float64Array(ne);
  for (let e = 0; e < ne; e++) if (keep[e]) x[e] = 1;
  const U = loads.map(() => new Float64Array(ndof));
  const ue = new Float64Array(24), fe = new Float64Array(24);
  const Ax = (sc, p, y) => {
    y.fill(0);
    for (let e = 0; e < ne; e++) {
      const s = sc[e], c = 8 * e;
      for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; ue[3 * a] = p[n]; ue[3 * a + 1] = p[n + 1]; ue[3 * a + 2] = p[n + 2]; }
      for (let r = 0; r < 24; r++) { let sum = 0; const row = r * 24; for (let q = 0; q < 24; q++) sum += Ke[row + q] * ue[q]; fe[r] = sum * s; }
      for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; y[n] += fe[3 * a]; y[n + 1] += fe[3 * a + 1]; y[n + 2] += fe[3 * a + 2]; }
    }
    for (let i = 0; i < ndof; i++) if (!free[i]) y[i] = p[i];
  };
  const r = new Float64Array(ndof), z = new Float64Array(ndof), pv = new Float64Array(ndof), q = new Float64Array(ndof), dg = new Float64Array(ndof);
  const cg = (sc, f, u, tol, maxIt) => {
    dg.fill(0);
    for (let e = 0; e < ne; e++) for (let a = 0; a < 8; a++) for (let d = 0; d < 3; d++) dg[3 * conn[8 * e + a] + d] += Ke[(3 * a + d) * 25] * sc[e];
    for (let i = 0; i < ndof; i++) if (!free[i] || !(dg[i] > 0)) dg[i] = 1;
    Ax(sc, u, q);
    let fn = 0;
    for (let i = 0; i < ndof; i++) { r[i] = free[i] ? f[i] - q[i] : 0; fn += f[i] * f[i]; }
    fn = Math.sqrt(fn) || 1;
    let rz = 0;
    for (let i = 0; i < ndof; i++) { z[i] = r[i] / dg[i]; pv[i] = z[i]; rz += r[i] * z[i]; }
    let it = 0;
    for (; it < maxIt; it++) {
      Ax(sc, pv, q);
      let pq = 0; for (let i = 0; i < ndof; i++) pq += pv[i] * q[i];
      const al = rz / pq;
      let rn = 0;
      for (let i = 0; i < ndof; i++) { u[i] += al * pv[i]; r[i] -= al * q[i]; rn += r[i] * r[i]; }
      if (Math.sqrt(rn) < tol * fn) break;
      let rz2 = 0; for (let i = 0; i < ndof; i++) { z[i] = r[i] / dg[i]; rz2 += r[i] * z[i]; }
      const be = rz2 / rz; rz = rz2;
      for (let i = 0; i < ndof; i++) pv[i] = z[i] + be * pv[i];
    }
    return it;
  };
  const sc = new Float64Array(ne), dc = new Float64Array(ne), dcf = new Float64Array(ne), xnew = new Float64Array(ne), dvf = new Float64Array(ne).fill(1);
  const steps = opts.schritte || 40;
  let comp = 0;
  for (let it = 0; it < steps; it++) {
    const pen = Math.min(3, 1 + it * 0.1);
    filt(x, xp);
    for (let e = 0; e < ne; e++) if (keep[e]) xp[e] = 1;
    stuetzen(xp);
    for (let e = 0; e < ne; e++) sc[e] = Emin + Math.pow(xp[e], pen) * (1 - Emin);
    comp = 0; dc.fill(0);
    loads.forEach((f, li) => {
      cg(sc, f, U[li], it < steps - 1 ? 2e-3 : 1e-6, 4000);
      const u = U[li];
      for (let e = 0; e < ne; e++) {
        const c = 8 * e;
        for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; ue[3 * a] = u[n]; ue[3 * a + 1] = u[n + 1]; ue[3 * a + 2] = u[n + 2]; }
        let ce = 0;
        for (let rr = 0; rr < 24; rr++) { let sum = 0; const row = rr * 24; for (let k = 0; k < 24; k++) sum += Ke[row + k] * ue[k]; ce += sum * ue[rr]; }
        comp += sc[e] * ce;
        dc[e] -= pen * (1 - Emin) * Math.pow(xp[e], pen - 1) * ce;
      }
    });
    if (st) {
      filtT(zurQuelle(dc), dcf);
      // Volumen: jede gefilterte Dichte zählt bei ihrer Quelle
      const eins = new Float64Array(ne); for (let e = 0; e < ne; e++) if (!keep[e]) eins[e] = 1;
      filtT(zurQuelle(eins), dvf);
    } else filtT(dc, dcf);
    // Optimalitätskriterium mit Bisektion auf den Volumenanteil der freien Würfel
    let l1 = 0, l2 = 1e9;
    while ((l2 - l1) / (l1 + l2) > 1e-4) {
      const lm = (l1 + l2) / 2;
      for (let e = 0; e < ne; e++) {
        if (keep[e]) { xnew[e] = 1; continue; }
        const be = Math.sqrt(Math.max(1e-12, -dcf[e]) / (lm * Math.max(1e-3, dvf[e])));
        xnew[e] = Math.max(0.001, Math.max(x[e] - 0.2, Math.min(1, Math.min(x[e] + 0.2, x[e] * be))));
      }
      filt(xnew, xp);
      if (st) { for (let e = 0; e < ne; e++) if (keep[e]) xp[e] = 1; stuetzen(xp); }
      let v = 0; for (let e = 0; e < ne; e++) if (!keep[e]) v += xp[e];
      if (v > vol * nfree) l1 = lm; else l2 = lm;
    }
    let ch = 0;
    for (let e = 0; e < ne; e++) { ch = Math.max(ch, Math.abs(xnew[e] - x[e])); x[e] = xnew[e]; }
    progress((it + 1) / steps, comp);
    if (it > 20 && ch < 0.01) break;
  }
  filt(x, xp);
  for (let e = 0; e < ne; e++) if (keep[e]) xp[e] = 1;
  stuetzen(xp);
  /* Endform: die dichtesten freien Würfel, bis ihr Volumen dem Werkstoffanteil entspricht (Summe der Dichten) – eine
     feste Schwelle 0,5 ließe die Graustufen weg und das Teil würde leichter als verlangt; dazu alle Beibehalten-Würfel */
  const ord = [];
  let soll = 0;
  for (let e = 0; e < ne; e++) if (!keep[e]) { ord.push(e); soll += xp[e]; }
  ord.sort((a, b) => xp[b] - xp[a]);
  const voll = new Uint8Array(ne);
  for (let e = 0; e < ne; e++) if (keep[e]) voll[e] = 1;
  let schwelle = ord.length && Math.round(soll) > 0 ? xp[ord[Math.round(soll) - 1]] : 1;
  // gleich dichte Würfel gemeinsam (Fräsen/Gießen erzeugen ganze Spalten gleicher Dichte – eine Hälfte davon ließe das
  // Teil zerfallen)
  for (const e of ord) if (xp[e] >= schwelle - 1e-9) voll[e] = 1;
  /* Zusammenhang: hängen Beibehalten-Stücke nur über Würfelkanten oder -ecken aneinander (rechnet die FE noch als
     verbunden, die geglättete Oberfläche aber nicht – typisch bei Fräsen/Gießen), die nächstdichten Würfel dazunehmen,
     bis alles über Flächen zusammenhängt; höchstens 30 % mehr Würfel */
  if (stuecke(net, voll) > 1) {
    // Würfel direkt darunter in Fertigungsrichtung (Fräsen, Additiv): neue Wegwürfel brauchen eine Stütze
    const ax = opts.druck ? opts.druck.achse : 2, vzA = opts.druck && opts.druck.vz < 0 ? -1 : 1, schritt = [1, net.grid.nx, net.grid.nx * net.grid.ny][ax];
    const idxM = new Map(net.cell.map((c, e) => [c, e]));
    const unten = st && !guss ? e => { if (st.platte[e]) return null; const b = idxM.get(net.cell[e] - vzA * schritt); return b == null ? null : b; } : null;
    const vor = Uint8Array.from(voll);
    verbinden(net, voll, xp, unten);
    for (let e = 0; e < ne; e++) if (voll[e] && !vor[e]) xp[e] = Math.max(xp[e], schwelle);
  }
  // additiv: bei gleich dichten Würfeln kann die Auswahl einen Stützwürfel verfehlen – Schicht für Schicht nachprüfen
  if (guss) { const hr = hohlraeume(net, voll, st, oben); for (let e = 0; e < ne; e++) if (!voll[e] && hr.a[e] && hr.b[e]) { voll[e] = 1; xp[e] = Math.max(xp[e], schwelle); } }
  else if (st) for (const e of st.order) if (voll[e] && !keep[e] && !st.platte[e] && !st.sup[e].some(s => voll[s])) { voll[e] = 0; xp[e] = Math.min(xp[e], 0.49); }
  const ug = guss ? hohlraeume(net, voll, st, oben).k : ungestuetzt(net, voll, st || druckStuetzen(net, { achse: 2, vz: 1, winkel: 45 }));
  // Spannung der Endform: volle Würfel als Werkstoff, übrige leer – noch einmal gerechnet
  for (let e = 0; e < ne; e++) sc[e] = voll[e] ? 1 : Emin;
  let smax = 0, dmax = 0;
  // Verschiebung nur an Knoten der Endform – Knoten, die nur an leeren Würfeln hängen, haben keine sinnvolle Lage
  const imTeil = new Uint8Array(nn);
  for (let e = 0; e < ne; e++) if (voll[e]) for (let a = 0; a < 8; a++) imTeil[conn[8 * e + a]] = 1;
  loads.forEach((f, li) => {
    const u = U[li];
    cg(sc, f, u, 1e-6, 6000);
    for (let n = 0; n < nn; n++) if (imTeil[n]) dmax = Math.max(dmax, Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2]));
    const sig = new Float64Array(6);
    for (let e = 0; e < ne; e++) {
      if (sc[e] < 1) continue;
      const c = 8 * e;
      for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; ue[3 * a] = u[n]; ue[3 * a + 1] = u[n + 1]; ue[3 * a + 2] = u[n + 2]; }
      // Mittelwert der Eckspannungen (Spitzen an einzelnen Treppenstufen nicht überbewerten)
      let vm = 0;
      for (let a = 0; a < 8; a++) { for (let r6 = 0; r6 < 6; r6++) { let sum = 0; for (let k = 0; k < 24; k++) sum += S[a][r6 * 24 + k] * ue[k]; sig[r6] = sum * E / h; } vm += vonMises(sig) / 8; }
      smax = Math.max(smax, vm);
    }
  });
  let vsolid = 0;
  for (let e = 0; e < ne; e++) if (voll[e]) vsolid += h ** 3;
  return { dichte: Float32Array.from(xp), comp, smax, dmax, volumen: vsolid, schwelle, ungestuetzt: ug, stuecke: stuecke(net, voll) };
}

/* Knotenfeld für die Oberfläche mit exakt übernommener Beibehalten-Geometrie (Augen, Platten, Bohrungen
   bleiben, wie sie sind). Ohne das formt die geglättete Oberfläche auch die Beibehalten-Körper aus Würfeln nach – klumpig.
   Darum: Freiform-Anteil nur aus den freien Würfeln (Beibehalten-Würfel zählen als leer), die Beibehalten-Körper über ihren
   vorzeichenbehafteten Abstand so, dass ihre Fläche um delta · h INNERHALB der echten Körperfläche liegt; der Kern vereinigt
   danach mit den exakten Körpern (gdform3), deren Flächen also außen bleiben. In den Körpern verstärkt (× 2), damit
   die Stäbe sicher bis in sie hineinreichen. keepTris: je Körper Float32Array (9 Werte je Dreieck).
   Rückgabe { bei(iso) → Knotenfeld, vKeep: Volumen der Körper, vInnen(feld, iso): Netzvolumen innerhalb der Körper } –
   das Volumen des Ergebnisses ist damit ≈ Netzvolumen − vInnen + vKeep (für die Schwelle zur Zielmasse). */
export function beibehaltenFeld(net, dichte, keepTris, delta = 0.35) {
  if (!keepTris || !keepTris.length) { const f = knotenFeld(net, dichte); return { bei: () => f, vKeep: 0, vInnen: () => 0 }; }
  const { grid, h } = net, { nx, ny, nz, o } = grid, NX = nx + 1, NY = ny + 1, NZ = nz + 1, N = NX * NY * NZ;
  const org = knotenFeld(net, Float32Array.from(dichte, (v, e) => (net.keep[e] ? 0 : v)));
  // innen: Knoten als Würfelmitten eines um h/2 versetzten Gitters gerastert
  const innen = new Uint8Array(N), g2 = { o: o.map(v => v - h / 2), nx: NX, ny: NY, nz: NZ };
  keepTris.forEach(t => { const g = voxelize(t, h, null, g2); for (let i = 0; i < N; i++) if (g.cells[i]) innen[i] = 1; });
  // Abstand zur nächsten Dreiecksfläche bis 2 h (Fächer der Kantenlänge 2 h)
  const R = 2 * h, F = new Map(), fk = (a, b, c) => `${a},${b},${c}`, alle = [];
  keepTris.forEach(t => { for (let q = 0; q + 8 < t.length; q += 9) alle.push(t.subarray(q, q + 9)); });
  alle.forEach((p, ti) => {
    const lo = [0, 1, 2].map(a => Math.floor((Math.min(p[a], p[a + 3], p[a + 6]) - R - o[a]) / R)), hi = [0, 1, 2].map(a => Math.floor((Math.max(p[a], p[a + 3], p[a + 6]) + R - o[a]) / R));
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const k = fk(a, b, c); let l = F.get(k); if (!l) F.set(k, l = []); l.push(ti); }
  });
  const sd = new Float32Array(N);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const g = (k * NY + j) * NX + i, P = [o[0] + i * h, o[1] + j * h, o[2] + k * h];
    const l = F.get(fk(Math.floor((P[0] - o[0]) / R), Math.floor((P[1] - o[1]) / R), Math.floor((P[2] - o[2]) / R)));
    let d = R;
    if (l) for (const ti of l) { const p = alle[ti]; d = Math.min(d, triDist(P, [p[0], p[1], p[2]], [p[3], p[4], p[5]], [p[6], p[7], p[8]])); }
    sd[g] = innen[g] ? -d : d;
  }
  const bei = iso => {
    const v = new Float32Array(N);
    for (let g = 0; g < N; g++) {
      const fp = Math.max(0, Math.min(1, iso - (sd[g] + delta * h) / h)), f = org[g];
      v[g] = innen[g] ? Math.max(fp, Math.min(1, 2 * f)) : Math.max(f, fp);
    }
    return v;
  };
  const vol = (P, T) => { let V = 0; for (let t = 0; t < T.length; t += 3) { const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2]; V += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; } return V; };
  const vKeep = keepTris.reduce((a, t) => { let V = 0; for (let q = 0; q + 8 < t.length; q += 9) V += (t[q] * (t[q + 4] * t[q + 8] - t[q + 5] * t[q + 7]) - t[q + 1] * (t[q + 3] * t[q + 8] - t[q + 5] * t[q + 6]) + t[q + 2] * (t[q + 3] * t[q + 7] - t[q + 4] * t[q + 6])) / 6; return a + Math.abs(V); }, 0);
  // Anteil der Netzfassung innerhalb der Körper (dort zählt das exakte Volumen): Feld außen auf 0, ungeglättet
  const vInnen = (v, iso) => { const w = Float32Array.from(v, (x, g) => (innen[g] ? x : 0)), si = oberflaeche(w, grid, h, iso, 0); return vol(si.pos, si.tri); };
  return { bei, vKeep, vInnen };
}

/* Knotenfeld aus den Elementdichten (Mittel der anliegenden Würfel, außen 0), auf dem ganzen Gitter */
export function knotenFeld(net, dichte) {
  const { nx, ny, nz } = net.grid, NX = nx + 1, NY = ny + 1, v = new Float32Array(NX * NY * (nz + 1)), c = new Uint8Array(v.length);
  net.cell.forEach((cl, e) => {
    const i = cl % nx, j = Math.floor(cl / nx) % ny, k = Math.floor(cl / (nx * ny));
    CORN.forEach(([a, b, d]) => { const g = ((k + d) * NY + j + b) * NX + i + a; v[g] += dichte[e]; c[g]++; });
  });
  for (let g = 0; g < v.length; g++) v[g] = v[g] / 8; // Mittel über 8 Würfel, fehlende zählen als leer
  return v;
}

/* Marching Tetrahedra (jeder Würfel in 6 Tetraeder entlang der Raumdiagonale) → geschlossenes Dreiecksnetz, geglättet.
   feld: Knotenwerte auf (nx+1)(ny+1)(nz+1), Rand muss < iso sein. Rückgabe { pos: Float32Array, tri: Uint32Array } */
export function oberflaeche(feld, grid, h, iso = 0.5, glatt = 12) {
  const { nx, ny, nz, o } = grid, NX = nx + 1, NY = ny + 1, gid = (i, j, k) => (k * NY + j) * NX + i;
  const val = g => feld[g] - iso + (feld[g] === iso ? 1e-6 : 0);
  const vmap = new Map(), pos = [], tri = [];
  const vert = (a, b) => {
    const key = a < b ? a * 2147483647 + b : b * 2147483647 + a;
    let i = vmap.get(key);
    if (i != null) return i;
    const va = val(a), vb = val(b), t = va / (va - vb);
    const p = g => [o[0] + (g % NX) * h, o[1] + Math.floor(g / NX) % NY * h, o[2] + Math.floor(g / (NX * NY)) * h];
    const A = p(a), B = p(b);
    i = pos.length / 3;
    pos.push(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
    vmap.set(key, i);
    return i;
  };
  const P = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const TETS = [[0, 6, 1, 2], [0, 6, 2, 3], [0, 6, 3, 7], [0, 6, 7, 4], [0, 6, 4, 5], [0, 6, 5, 1]];
  const ctr = [0, 0, 0];
  const emit = (a, b, c, inside) => {
    // nach außen zeigen: Normale weg vom inneren Punkt
    const pa = pos.slice(3 * a, 3 * a + 3), pb = pos.slice(3 * b, 3 * b + 3), pc = pos.slice(3 * c, 3 * c + 3);
    const n = [(pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]), (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]), (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])];
    const d = (inside[0] - pa[0]) * n[0] + (inside[1] - pa[1]) * n[1] + (inside[2] - pa[2]) * n[2];
    if (d > 0) tri.push(a, c, b); else tri.push(a, b, c);
  };
  const gp = g => [o[0] + (g % NX) * h, o[1] + Math.floor(g / NX) % NY * h, o[2] + Math.floor(g / (NX * NY)) * h];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const g = P.map(([a, b, c]) => gid(i + a, j + b, k + c));
    let any = false, all = true;
    for (const q of g) { if (val(q) > 0) any = true; else all = false; }
    if (!any || all) continue;
    for (const T of TETS) {
      const t = T.map(q => g[q]), ins = t.filter(q => val(q) > 0), out = t.filter(q => val(q) <= 0);
      if (!ins.length || !out.length) continue;
      const inP = ins.map(gp).reduce((a, p) => [a[0] + p[0] / ins.length, a[1] + p[1] / ins.length, a[2] + p[2] / ins.length], ctr.slice());
      if (ins.length === 1) emit(vert(ins[0], out[0]), vert(ins[0], out[1]), vert(ins[0], out[2]), inP);
      else if (ins.length === 3) emit(vert(out[0], ins[0]), vert(out[0], ins[1]), vert(out[0], ins[2]), inP);
      else {
        const a = vert(ins[0], out[0]), b = vert(ins[0], out[1]), c = vert(ins[1], out[1]), d = vert(ins[1], out[0]);
        emit(a, b, c, inP); emit(a, c, d, inP);
      }
    }
  }
  // Taubin-Glättung (schrumpft kaum) – ohne Punkte, die auf einer Körperoberfläche liegen (siehe glattNetz)
  const P2 = Float64Array.from(pos);
  glattNetz(P2, tri, glatt);
  return { pos: Float32Array.from(P2), tri: Uint32Array.from(tri) };
}

/* Taubin-Glättung eines Dreiecksnetzes (schrumpft kaum): Nachbarn je Punkt aus den Dreiecken.
   pos wird in-place geändert. fest: Punkte, die nicht bewegt werden – null für alle frei. */
export function glattNetz(pos, tri, schritte = 12, fest = null) {
  const nv = pos.length / 3, nbr = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) { const a = tri[t + e], b = tri[t + (e + 1) % 3]; nbr[a].add(b); nbr[b].add(a); }
  const P2 = pos, tmp = new Float64Array(P2.length);
  const step = lam => {
    for (let v = 0; v < nv; v++) {
      if (fest && fest[v]) { tmp[3 * v] = P2[3 * v]; tmp[3 * v + 1] = P2[3 * v + 1]; tmp[3 * v + 2] = P2[3 * v + 2]; continue; }
      let sx = 0, sy = 0, sz = 0, c = 0;
      for (const w of nbr[v]) { sx += P2[3 * w]; sy += P2[3 * w + 1]; sz += P2[3 * w + 2]; c++; }
      if (!c) { tmp[3 * v] = P2[3 * v]; tmp[3 * v + 1] = P2[3 * v + 1]; tmp[3 * v + 2] = P2[3 * v + 2]; continue; }
      tmp[3 * v] = P2[3 * v] + lam * (sx / c - P2[3 * v]); tmp[3 * v + 1] = P2[3 * v + 1] + lam * (sy / c - P2[3 * v + 1]); tmp[3 * v + 2] = P2[3 * v + 2] + lam * (sz / c - P2[3 * v + 2]);
    }
    P2.set(tmp);
  };
  for (let s = 0; s < schritte; s++) { step(0.5); step(-0.53); }
  return pos;
}
