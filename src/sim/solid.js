// cantcodecad – Festigkeit von Bauteilen (statische Spannung, linear elastisch), angelehnt an die übliche Simulation
// „Statische Spannung“. Netz: gleich große Würfel (Voxel) im Körper, aus dem Anzeigenetz per Strahltest; Element:
// Hexaeder mit 8 Knoten und inkompatiblen Moden (Wilson/Taylor, gegen Schubversteifung bei Biegung mit wenigen
// Elementen über die Dicke). Alle Elemente sind gleich, daher eine Elementsteifigkeit und ein matrixfreies CG-Verfahren
// mit Jacobi-Vorkonditionierung. Spannungen an den Elementecken (mit den inkompatiblen Moden), an den Knoten gemittelt.
// Einheiten N, mm, MPa. Die Treppenstufen am schrägen oder runden Rand machen dort die Spannung ungenau – zur
// Vorbemessung. Modalanalyse (Modalfrequenzen) am selben Netz: siehe unten.
import { subspace } from './eigen.js';
import { cg } from './cg.js';

/* ---------- Elementmatrizen (Würfel Kante 1, E = 1) ---------- */
export const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
function dMat(nu) {
  const l = nu / ((1 + nu) * (1 - 2 * nu)), m = 1 / (2 * (1 + nu));
  return [[l + 2 * m, l, l, 0, 0, 0], [l, l + 2 * m, l, 0, 0, 0], [l, l, l + 2 * m, 0, 0, 0], [0, 0, 0, m, 0, 0], [0, 0, 0, 0, m, 0], [0, 0, 0, 0, 0, m]];
}
/* Verzerrungs-Verschiebungs-Matrix aus Ableitungen dN/dx (je Ansatzfunktion [dx, dy, dz]) */
function bFrom(dn) {
  const B = Array.from({ length: 6 }, () => new Array(dn.length * 3).fill(0));
  dn.forEach(([x, y, z], a) => {
    B[0][3 * a] = x; B[1][3 * a + 1] = y; B[2][3 * a + 2] = z;
    B[3][3 * a] = y; B[3][3 * a + 1] = x;
    B[4][3 * a + 1] = z; B[4][3 * a + 2] = y;
    B[5][3 * a] = z; B[5][3 * a + 2] = x;
  });
  return B;
}
/* Ableitungen bei (ξ,η,ζ) für Kante 1 (dx = 2 dξ): 8 Knotenfunktionen und 3 inkompatible Moden 1 − ξ² … */
function derivs(xi, et, ze) {
  const du = CORNERS.map(([a, b, c]) => [a * (1 + b * et) * (1 + c * ze) / 8, b * (1 + a * xi) * (1 + c * ze) / 8, c * (1 + a * xi) * (1 + b * et) / 8]);
  const da = [[-2 * xi, 0, 0], [0, -2 * et, 0], [0, 0, -2 * ze]];
  return { du, da };
}
const mm = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const tr = A => A[0].map((_, j) => A.map(r => r[j]));
function invert(M) {
  const n = M.length, a = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[p], a[c]] = [a[c], a[p]];
    const v = a[c][c];
    for (let k = 0; k < 2 * n; k++) a[c][k] /= v;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map(r => r.slice(n));
}
const cache = new Map();
/* Steifigkeit (24×24, kondensiert) und Spannungsmatrizen an den 8 Ecken (je 6×24) für Querdehnzahl nu */
export function hexMatrices(nu) {
  if (cache.has(nu)) return cache.get(nu);
  const D = dMat(nu), g = 1 / Math.sqrt(3), w = 1 / 8; // Gauß 2×2×2, det J = 1/8 für Kante 1
  let Kuu = Array.from({ length: 24 }, () => new Array(24).fill(0)), Kua = Array.from({ length: 24 }, () => new Array(9).fill(0)), Kaa = Array.from({ length: 9 }, () => new Array(9).fill(0));
  for (const a of [-g, g]) for (const b of [-g, g]) for (const c of [-g, g]) {
    const { du, da } = derivs(a, b, c);
    const Bu = bFrom(du.map(d => d.map(v => 2 * v))), Ba = bFrom(da.map(d => d.map(v => 2 * v)));
    const DBu = mm(D, Bu), DBa = mm(D, Ba);
    const add = (K, X, Y) => { const P = mm(tr(X), Y); P.forEach((r, i) => r.forEach((v, j) => { K[i][j] += v * w; })); };
    add(Kuu, Bu, DBu); add(Kua, Bu, DBa); add(Kaa, Ba, DBa);
  }
  const Ki = invert(Kaa), KiKau = mm(Ki, tr(Kua));
  const K = Kuu.map((r, i) => r.map((v, j) => v - Kua[i].reduce((s, x, k) => s + x * KiKau[k][j], 0)));
  const S = CORNERS.map(([a, b, c]) => {
    const { du, da } = derivs(a, b, c);
    const Bu = bFrom(du.map(d => d.map(v => 2 * v))), Ba = bFrom(da.map(d => d.map(v => 2 * v)));
    const Bc = Bu.map((r, i) => Array.from(r, (v, j) => v - Ba[i].reduce((s, x, k) => s + x * KiKau[k][j], 0)));
    return mm(D, Bc);
  });
  const out = { K: Float64Array.from(K.flat()), S: S.map(s => Float64Array.from(s.flat())) };
  cache.set(nu, out);
  return out;
}
export const vonMises = s => Math.sqrt(0.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2));

/* ---------- Voxel-Netz ---------- */
/* Würfel im Körper: Zellmitte innen (Strahl in +x, Anzahl der Schnitte ungerade). tris: Float64Array [x,y,z × 3] je Dreieck */
export function voxelize(tris, h, bbox, grid = null) {
  // grid: { o, nx, ny, nz } – auf ein vorgegebenes Gitter (Generatives Design: Bereich, Beibehalten, Hindernis gleich gerastert)
  const o = grid ? grid.o : bbox[0].map(v => v - h * 0.0001);
  const nx = grid ? grid.nx : Math.max(1, Math.ceil((bbox[1][0] - o[0]) / h)), ny = grid ? grid.ny : Math.max(1, Math.ceil((bbox[1][1] - o[1]) / h)), nz = grid ? grid.nz : Math.max(1, Math.ceil((bbox[1][2] - o[2]) / h));
  const rows = Array.from({ length: ny * nz }, () => []);
  const nt = tris.length / 9;
  for (let t = 0; t < nt; t++) {
    const p = tris.subarray(9 * t, 9 * t + 9);
    const ymin = Math.min(p[1], p[4], p[7]), ymax = Math.max(p[1], p[4], p[7]), zmin = Math.min(p[2], p[5], p[8]), zmax = Math.max(p[2], p[5], p[8]);
    const j0 = Math.max(0, Math.ceil((ymin - o[1]) / h - 0.5)), j1 = Math.min(ny - 1, Math.floor((ymax - o[1]) / h - 0.5));
    const k0 = Math.max(0, Math.ceil((zmin - o[2]) / h - 0.5)), k1 = Math.min(nz - 1, Math.floor((zmax - o[2]) / h - 0.5));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      // Strahl leicht schräg versetzt, damit er nicht genau durch Kanten oder Ecken läuft
      const y = o[1] + (j + 0.5) * h + h * 1.234e-6, z = o[2] + (k + 0.5) * h + h * 2.345e-6;
      const ax = p[1] - y, ay = p[2] - z, bx = p[4] - y, by = p[5] - z, cx = p[7] - y, cy = p[8] - z;
      const w0 = bx * cy - by * cx, w1 = cx * ay - cy * ax, w2 = ax * by - ay * bx, s = w0 + w1 + w2;
      if (Math.abs(s) < 1e-30) continue;
      if (!((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0))) continue;
      rows[k * ny + j].push((w0 * p[0] + w1 * p[3] + w2 * p[6]) / s);
    }
  }
  const cells = new Uint8Array(nx * ny * nz);
  rows.forEach((xs, r) => {
    if (xs.length < 2) return;
    xs.sort((a, b) => a - b);
    const j = r % ny, k = (r - j) / ny;
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - o[0]) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - o[0]) / h - 0.5));
      for (let i = i0; i <= i1; i++) cells[(k * ny + j) * nx + i] = 1;
    }
  });
  return { o, h, nx, ny, nz, cells };
}

/* Mehrere Körper auf einem Gitter (Kontakt): jeder Körper für sich gerastert, der Würfel gehört zum zuerst
   genannten. Zwei Körper, die sich berühren, treffen sich dabei genau auf einer Knotenschicht – das ist die
   Verbindung, über die Kraft und Wärme gehen. ueber zählt die Würfel, die in mehr als einem Körper liegen. */
export function voxelizeAll(list, h, bbox) {
  const o = bbox[0].map(v => v - h * 0.0001);
  const nx = Math.max(1, Math.ceil((bbox[1][0] - o[0]) / h)), ny = Math.max(1, Math.ceil((bbox[1][1] - o[1]) / h)), nz = Math.max(1, Math.ceil((bbox[1][2] - o[2]) / h));
  const grid = { o, nx, ny, nz }, emat = new Int8Array(nx * ny * nz).fill(-1);
  let ueber = 0;
  list.forEach((tris, b) => {
    const G = voxelize(tris, h, bbox, grid);
    for (let i = 0; i < G.cells.length; i++) {
      if (!G.cells[i]) continue;
      if (emat[i] < 0) emat[i] = b; else ueber++;
    }
  });
  return { ...grid, emat, ueber };
}

/* Abstand Punkt – Dreieck (Ericson) */
export function triDist(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], dist = q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const at = (s, t) => [a[0] + ab[0] * s + ac[0] * t, a[1] + ab[1] * s + ac[1] * t, a[2] + ab[2] * s + ac[2] * t];
  const d1 = d(ab, ap), d2 = d(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dist(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = d(ab, bp), d4 = d(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dist(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return dist(at(d1 / (d1 - d3), 0));
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = d(ab, cp), d6 = d(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dist(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return dist(at(0, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return dist([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]); }
  const den = 1 / (va + vb + vc);
  return dist(at(vb * den, vc * den));
}

/* ---------- Rechnung ----------
   job: { tris (Körper), bbox, h, E, nu, fixed: [Float64Array Dreiecke je Fläche], forces: [{ tris, F: [fx,fy,fz] }],
          weight: Gewichtsdichte in kg/mm³ für das Eigengewicht (0 = aus), gravity: Richtung (Standard −Z) }
   progress(anteil) wird zwischendurch gerufen. Ergebnis: Knotenwerte (Verschiebung, von Mises) und Gitter. */
/* Modell aus dem Auftrag: Netz, Knoten, feste Knoten, Elementsteifigkeit. Mehrere Lastfälle am selben Körper bauen
   es nur einmal (solveSolidCases) – Voxelnetz und Steifigkeit sind für alle Fälle gleich. */
export function solidModel(job) {
  const { h, E, nu } = job;
  const alle = [{ tris: job.tris, bbox: job.bbox, E, nu, rho: job.rho, k: job.k, name: job.name }, ...(job.mit || [])];
  const bb = [[0, 1, 2].map(ax => Math.min(...alle.map(b => b.bbox[0][ax]))), [0, 1, 2].map(ax => Math.max(...alle.map(b => b.bbox[1][ax])))];
  const G = voxelizeAll(alle.map(b => b.tris), h, bb);
  const { nx, ny, nz, emat, o } = G;
  const NX = nx + 1, NY = ny + 1, nid = (i, j, k) => (k * NY + j) * NX + i;
  const elems = [], em = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const b = emat[(k * ny + j) * nx + i];
    if (b < 0) continue;
    elems.push(i, j, k); em.push(b);
  }
  const ne = elems.length / 3;
  if (!ne) throw new Error('Das Netz ist leer – Körper zu dünn für die Netzfeinheit');
  // aktive Knoten durchnummerieren
  const map = new Int32Array(NX * NY * (nz + 1)).fill(-1);
  const conn = new Int32Array(ne * 8);
  let nn = 0;
  for (let e = 0; e < ne; e++) {
    const i = elems[3 * e], j = elems[3 * e + 1], k = elems[3 * e + 2];
    CORNERS.forEach(([a, b, c], q) => {
      const g = nid(i + (a > 0 ? 1 : 0), j + (b > 0 ? 1 : 0), k + (c > 0 ? 1 : 0));
      if (map[g] < 0) map[g] = nn++;
      conn[8 * e + q] = map[g];
    });
  }
  const xyz = new Float64Array(nn * 3);
  for (let g = 0; g < map.length; g++) if (map[g] >= 0) {
    const i = g % NX, j = Math.floor(g / NX) % NY, k = Math.floor(g / (NX * NY)), n = map[g];
    xyz[3 * n] = o[0] + i * h; xyz[3 * n + 1] = o[1] + j * h; xyz[3 * n + 2] = o[2] + k * h;
  }
  // Randknoten: gehören zu weniger als 8 Elementen
  const cnt = new Uint8Array(nn);
  for (let q = 0; q < conn.length; q++) cnt[conn[q]]++;
  // Knoten nahe einer Fläche (Abstand ≤ 0,75 h, nur Randknoten)
  const nodesNear = trisList => {
    const out = new Set();
    trisList.forEach(t => {
      const n9 = t.length / 9;
      const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
      for (let q = 0; q < t.length; q++) { const ax = q % 3; bb[0][ax] = Math.min(bb[0][ax], t[q]); bb[1][ax] = Math.max(bb[1][ax], t[q]); }
      const lim = 0.75 * h;
      for (let n = 0; n < nn; n++) {
        if (cnt[n] >= 8) continue;
        const p = [xyz[3 * n], xyz[3 * n + 1], xyz[3 * n + 2]];
        if (p.some((v, ax) => v < bb[0][ax] - lim || v > bb[1][ax] + lim)) continue;
        for (let q = 0; q < n9; q++) {
          const a = [t[9 * q], t[9 * q + 1], t[9 * q + 2]], b = [t[9 * q + 3], t[9 * q + 4], t[9 * q + 5]], c = [t[9 * q + 6], t[9 * q + 7], t[9 * q + 8]];
          if (triDist(p, a, b, c) <= lim) { out.add(n); break; }
        }
      }
    });
    return out;
  };
  const fixedNodes = nodesNear(job.fixed || []);
  // ohne feste Flächen geht es nur bei der Wärmeanalyse (dort gibt es keine mechanische Einspannung)
  if ((job.fixed || []).length && !fixedNodes.size) throw new Error('An der festen Fläche liegt kein Netzknoten – Netz feiner wählen');
  const ndof = nn * 3, free = new Uint8Array(ndof).fill(1);
  fixedNodes.forEach(n => { free[3 * n] = free[3 * n + 1] = free[3 * n + 2] = 0; });
  // Elementsteifigkeit: K = E·h·K̂
  /* Werkstoff je Körper: hexMatrices hängt nur an der Querdehnzahl, die Skala E·h kommt dazu. KeList, SList und
     sfList werden nach ebody ausgewählt – ein Körper aus Aluminium neben einem aus Stahl hat seine eigene Matrix. */
  const mats = alle.map(b => ({ E: b.E ?? E, nu: b.nu ?? nu, rho: b.rho, k: b.k, name: b.name || 'Körper' }));
  const hex = mats.map(m => hexMatrices(m.nu));
  const KeList = mats.map((m, b) => hex[b].K.map(v => v * m.E * h));
  const SList = hex.map(x => x.S), sfList = mats.map(m => m.E / h);
  const ebody = Uint8Array.from(em);
  const diag = new Float64Array(ndof);
  for (let e = 0; e < ne; e++) {
    const Ke = KeList[ebody[e]];
    for (let a = 0; a < 8; a++) for (let d = 0; d < 3; d++) diag[3 * conn[8 * e + a] + d] += Ke[(3 * a + d) * 24 + 3 * a + d];
  }
  /* Zusammenhang und Kontakt: Elemente, die sich eine Ecke teilen, gehören zu einem Stück. Zwei Körper sind nur
     verbunden, wenn ihre Würfel aneinanderstoßen; berührt ein Körper keinen anderen, hängt er frei in der Luft und
     die Rechnung löst nicht. Kontakte = benachbarte Würfel verschiedener Körper (ihre gemeinsame Fläche). */
  const zelle = new Int32Array(nx * ny * nz).fill(-1);
  for (let e = 0; e < ne; e++) zelle[(elems[3 * e + 2] * ny + elems[3 * e + 1]) * nx + elems[3 * e]] = e;
  const par = Int32Array.from({ length: ne }, (_, i) => i);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const erster = new Int32Array(nn).fill(-1);
  for (let e = 0; e < ne; e++) for (let q = 0; q < 8; q++) {
    const n = conn[8 * e + q];
    if (erster[n] < 0) erster[n] = e;
    else { const a = find(erster[n]), b = find(e); if (a !== b) par[a] = b; }
  }
  const stueck = new Map(), paare = new Map();
  for (let e = 0; e < ne; e++) {
    const r = find(e);
    if (!stueck.has(r)) stueck.set(r, new Set());
    stueck.get(r).add(ebody[e]);
    const i = elems[3 * e], j = elems[3 * e + 1], k = elems[3 * e + 2], b = ebody[e];
    for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      if (i + di >= nx || j + dj >= ny || k + dk >= nz) continue;
      const q = zelle[((k + dk) * ny + (j + dj)) * nx + (i + di)];
      if (q < 0 || ebody[q] === b) continue;
      const key = Math.min(b, ebody[q]) * 1000 + Math.max(b, ebody[q]);
      paare.set(key, (paare.get(key) || 0) + 1);
    }
  }
  if (alle.length > 1 && stueck.size > 1) {
    const klein = [...stueck.values()].sort((a, b) => a.size - b.size)[0];
    const namen = [...(klein.size === 1 ? [...stueck.values()].filter(s => s.size === 1)[0] : klein)].map(b => `„${mats[b].name}“`).join(' und ');
    throw new Error(`${namen} berührt keinen anderen Körper der Studie – ohne Kontakt löst die Rechnung nicht`);
  }
  const teile = mats.map((m, b) => ({ name: m.name, elements: em.filter(x => x === b).length }));
  const kontakte = [...paare.entries()].map(([key, n]) => ({ a: Math.floor(key / 1000), b: key % 1000, n }));
  /* Körper zu einem Knoten (der erste, der ihn trägt) – für die größte Spannung je Körper */
  const nbody = Uint8Array.from(erster.map(e => ebody[e]));
  return { h, E, nu, o, nx, ny, nz, nn, map, xyz, cnt, conn, ne, free, diag, fixedNodes, nodesNear, ebody, nbody, mats, KeList, SList, sfList, teile, kontakte, ueber: G.ueber };
}

/* Matrixfreie Multiplikation mit der Steifigkeit: alle Elemente eines Körpers sind gleich, es gibt eine Matrix je
   Werkstoff. Gesperrte Freiheitsgrade geben ihre Zeile zurück (bei der Lösung stehen dort Nullen). */
function steifigkeit(M) {
  const { nn, ne, conn, KeList, ebody, free } = M, ndof = nn * 3, ue = new Float64Array(24);
  return (x, y) => {
    y.fill(0);
    for (let e = 0; e < ne; e++) {
      const c = 8 * e, Ke = KeList[ebody[e]];
      for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; ue[3 * a] = x[n]; ue[3 * a + 1] = x[n + 1]; ue[3 * a + 2] = x[n + 2]; }
      for (let r = 0; r < 24; r++) {
        let sum = 0;
        const row = r * 24;
        for (let q = 0; q < 24; q++) sum += Ke[row + q] * ue[q];
        y[3 * conn[c + (r / 3 | 0)] + r % 3] += sum;
      }
    }
    for (let i = 0; i < ndof; i++) if (!free[i]) y[i] = x[i];
  };
}

/* Lösen von K u = f mit dem gemeinsamen vorkonditionierten Gradientenverfahren (cg.js, Jacobi: Diagonale der
   Steifigkeit). u0 ist ein guter Startwert – bei der Modalanalyse die Lösung des vorigen Durchlaufs, dann reichen
   wenige Schritte. tol ist die relative Restnorm. Rückgabe: Verschiebungen und Zahl der Schritte. */
function pcg(M, f, u0 = null, tol = 1e-7, progress = () => {}) {
  const { nn, ne, free, diag } = M, ndof = nn * 3;
  for (let i = 0; i < ndof; i++) if (!free[i]) diag[i] = 1;
  return cg({ n: ndof, free, diag, anwenden: steifigkeit(M), f, u0, tol, progress, maxIt: Math.max(2000, 200 * Math.cbrt(ne)) });
}

/* Ein Lastfall am fertigen Modell: rechte Seite (Kräfte auf Flächen, optional Eigengewicht), Lösung, Spannungen.
   progress bekommt den Anteil innerhalb dieses Lastfalls. */
function solveCase(M, forces, opts, progress) {
  const { h, nn, ne, conn, cnt, free, diag, nodesNear, ebody, mats, SList, sfList } = M, ndof = nn * 3;
  const last = forces || [];   /* ein Fall nur mit Eigengewicht hat keine Flächenlast */
  const f = new Float64Array(ndof);
  last.forEach(L => {
    const ns = [...nodesNear([L.tris])];
    if (!ns.length) throw new Error('An einer Lastfläche liegt kein Netzknoten – Netz feiner wählen');
    // nach Anteil verteilen: Knoten mitten auf der Fläche hängen an mehr Elementen als Kanten- und Eckknoten
    const wsum = ns.reduce((acc, n) => acc + cnt[n], 0);
    ns.forEach(n => { for (let ax = 0; ax < 3; ax++) f[3 * n + ax] += L.F[ax] * cnt[n] / wsum; });
  });
  if (opts.weight) {
    /* Eigengewicht: jedes Element gibt sein Gewicht (ρ [kg/mm³] · g · h³) zu gleichen Teilen an seine 8 Knoten ab –
       bei mehreren Körpern zählt je Element dessen eigene Dichte. */
    const g = 9.81, dir = opts.gravity || [0, 0, -1];
    for (let e = 0; e < ne; e++) {
      const w = (mats[ebody[e]].rho || opts.weight) * g * h ** 3 / 8;
      for (let a = 0; a < 8; a++) { const n = conn[8 * e + a]; for (let ax = 0; ax < 3; ax++) f[3 * n + ax] += w * dir[ax]; }
    }
  }
  if (!last.length && !opts.weight) throw new Error('Keine Last in diesem Lastfall');
  const { u, it } = pcg(M, f, null, 1e-7, progress);
  // Spannungen an den Ecken, an den Knoten gemittelt – je Element nach seinem eigenen Werkstoff
  const sv = new Float64Array(nn), sc = new Uint8Array(nn), sig = new Float64Array(6), ue = new Float64Array(24);
  for (let e = 0; e < ne; e++) {
    const c = 8 * e, Sl = SList[ebody[e]], sf = sfList[ebody[e]];
    for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; ue[3 * a] = u[n]; ue[3 * a + 1] = u[n + 1]; ue[3 * a + 2] = u[n + 2]; }
    for (let a = 0; a < 8; a++) {
      const Sa = Sl[a];
      for (let r6 = 0; r6 < 6; r6++) { let sum = 0; for (let k = 0; k < 24; k++) sum += Sa[r6 * 24 + k] * ue[k]; sig[r6] = sum * sf; }
      const n = conn[c + a];
      sv[n] += vonMises(sig); sc[n]++;
    }
  }
  let smax = 0, dmax = 0;
  for (let n = 0; n < nn; n++) { sv[n] /= sc[n]; smax = Math.max(smax, sv[n]); dmax = Math.max(dmax, Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2])); }
  /* größte Spannung je Körper – bei mehreren Werkstoffen ist der Sicherheitsfaktor je Körper verschieden */
  const smaxTeile = mats.map(() => 0);
  for (let n = 0; n < nn; n++) smaxTeile[M.nbody[n]] = Math.max(smaxTeile[M.nbody[n]], sv[n]);
  return { u, vm: sv, smax, smaxTeile, dmax, iterations: it };
}

/* Anteile der Körper und ihre Kontakte für die Ausgabe – dazu die Zahl doppelt getroffener Würfel (sich
   überschneidende Körper, was die Geometrieprüfung sonst schon meldet). */
const info = M => ({ koerper: M.teile, kontakte: M.kontakte, ueber: M.ueber });

export function solveSolid(job, progress = () => {}) {
  const M = solidModel(job);
  const r = solveCase(M, job.forces, { weight: job.weight, gravity: job.gravity }, progress);
  return { grid: { o: M.o, h: M.h, nx: M.nx, ny: M.ny, nz: M.nz }, map: M.map, nn: M.nn, xyz: M.xyz, u: r.u, vm: r.vm, smax: r.smax, smaxTeile: r.smaxTeile, dmax: r.dmax, elements: M.ne, iterations: r.iterations, fixedNodes: M.fixedNodes.size, ...info(M) };
}

/* Mehrere Lastfälle am selben Netz (gleicher Körper, gleiche feste Flächen, eigene Lasten je Fall) und ihre
   Umhüllende: je Knoten der größte Wert aller Fälle – die Ergebnisfläche spannt die Umhüllende. groS/groD/groK
   sind die Nummern des Falls mit der größten Spannung, der größten Verschiebung und der Spannung am Knoten der
   größten Spannung (maßgebender Lastfall). */
export function solveSolidCases(job, faelle, progress = () => {}) {
  const M = solidModel(job), anzahl = Math.max(1, faelle.length);
  const alle = faelle.map((fa, i) => ({ name: fa.name || `Lastfall ${i + 1}`, ...solveCase(M, fa.forces, { weight: fa.weight, gravity: fa.gravity }, p => progress(Math.min(0.99, (i + p) / anzahl))) }));
  progress(1);
  const vm = new Float64Array(M.nn);
  alle.forEach(a => { for (let n = 0; n < M.nn; n++) if (a.vm[n] > vm[n]) vm[n] = a.vm[n]; });
  let smax = 0, kn = 0;
  for (let n = 0; n < M.nn; n++) if (vm[n] > smax) { smax = vm[n]; kn = n; }
  const groS = alle.reduce((a, b, i) => (b.smax > alle[a].smax ? i : a), 0);
  const groD = alle.reduce((a, b, i) => (b.dmax > alle[a].dmax ? i : a), 0);
  const groK = alle.reduce((a, b, i) => (b.vm[kn] > alle[a].vm[kn] ? i : a), 0);
  const smaxTeile = M.teile.map((_, b) => Math.max(...alle.map(a => a.smaxTeile[b])));
  return {
    grid: { o: M.o, h: M.h, nx: M.nx, ny: M.ny, nz: M.nz }, map: M.map, nn: M.nn, xyz: M.xyz, u: alle[groD].u, vm, smax, smaxTeile,
    dmax: alle[groD].dmax, elements: M.ne, iterations: alle.reduce((s, a) => s + a.iterations, 0), fixedNodes: M.fixedNodes.size,
    umh: true, faelle: alle.map(a => ({ name: a.name, smax: a.smax, smaxTeile: a.smaxTeile, dmax: a.dmax, iterations: a.iterations })), groS, groD, groK, ...info(M)
  };
}

/* ---------- Modalanalyse ----------
   K φ = ω² M φ am selben Würfelnetz wie die Statik. Massenmatrix: konsistent (Hexaeder mit 8 Knoten – Zeilensumme
   je Knoten und Richtung = ein Achtel der Würfelmasse), damit Biegeschwingungen über wenige Elemente nicht zu steif
   sind. Kleinste Eigenwerte wieder durch Unterraum-Iteration (eigen.js); die inneren Löseschritte sind das selbe
   matrixfreie CG wie die Statik, warm gestartet mit der Lösung des vorigen Durchlaufs. Einheiten: N und mm – die
   Masseneinheit ist daraus die Tonne, die Dichten der Werkstoffe (kg/mm³) kommen mit dem Faktor 1e-3 dazu. Eine
   feste Fläche braucht es – ein freier Körper schwingt als Ganzes. */

/* Multiplikation mit der konsistenten Massenmatrix: ρ h³/216 · (8 auf der Diagonalen, 4 für kanten-, 2 für
   flächenbenachbarte und 1 für den gegenüberliegenden Eckknoten) – Zeilensumme = ρ h³/8, also ein Achtel der
   Würfelmasse je Knoten, wie es sich für die acht Ecken eines Würfels gehört. Bei mehreren Körpern gilt je Element
   dessen eigene Dichte (Gewichtstabellen-Gewicht des Verbunds).
   Einheiten: gerechnet wird in N und mm, die Masseneinheit ist daraus die Tonne (1 N = 1 t·mm/s²). Die Werkstoffe
   führen die Dichte in kg/mm³ – wie beim Rahmen (frame.js) kommt hier der Faktor 1e-3 dazu. */
const TONNEN = 1e-3;
function massMatrix(M, rho) {
  const { nn, ne, conn, free, h, ebody, mats } = M, ndof = nn * 3;
  const dichte = e => (mats[ebody[e]].rho || rho) * TONNEN;
  const wList = mats.map(m => {
    const w = new Float64Array(64), r0 = (m.rho || rho) * TONNEN;
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      let d = 0;
      for (let k = 0; k < 3; k++) if (CORNERS[a][k] !== CORNERS[b][k]) d++;
      w[a * 8 + b] = r0 * h ** 3 / 216 * (8 >> d);
    }
    return w;
  });
  const ue = new Float64Array(24);
  const mv = x => {
    const y = new Float64Array(ndof);
    for (let e = 0; e < ne; e++) {
      const c = 8 * e, w = wList[ebody[e]];
      for (let a = 0; a < 8; a++) { const n = 3 * conn[c + a]; for (let d = 0; d < 3; d++) ue[3 * a + d] = x[n + d]; }
      for (let a = 0; a < 8; a++) {
        const n = conn[c + a], row = a * 8;
        for (let d = 0; d < 3; d++) {
          let s = 0;
          for (let j = 0; j < 8; j++) s += w[row + j] * ue[3 * j + d];
          y[3 * n + d] += s;
        }
      }
    }
    for (let i = 0; i < ndof; i++) if (!free[i]) y[i] = 0;
    return y;
  };
  const lump = new Float64Array(ndof);
  for (let e = 0; e < ne; e++) { const w = dichte(e) * h ** 3 / 8; for (let a = 0; a < 8; a++) { const n = conn[8 * e + a]; for (let d = 0; d < 3; d++) lump[3 * n + d] += w; } }
  return { mv, lump };
}

/* job wie bei solveSolid, dazu job.rho (Dichte in kg/mm³). anzahl Eigenformen. Rückgabe wie solveSolid (grid, map,
   xyz für die Fläche) und modes: Frequenz, ω und die Eigenform auf größte Auslenkung 1 normiert. */
export function solidModes(job, anzahl = 4, progress = () => {}) {
  const M = solidModel(job), { nn, ne, free, diag, h } = M, ndof = nn * 3;
  const rho = job.rho;
  if (!(rho > 0)) throw new Error('Für die Modalanalyse gehört ein Werkstoff mit Dichte dazu');
  const m = Math.max(1, Math.min(20, Math.round(anzahl) || 4));
  const { mv, lump } = massMatrix(M, rho);
  const frei = [];
  for (let i = 0; i < ndof; i++) if (free[i]) frei.push(i);
  if (frei.length < 2 * m + 2) throw new Error('Das Netz hat zu wenige freie Knoten – weniger Eigenformen oder feineres Netz');
  // Startvektoren: Einheitslasten an den weichsten Freiheitsgraden (kleinste Steifigkeit je Masse) und Zufallslasten
  const weich = frei.map(i => ({ i, r: diag[i] / (lump[i] || 1) })).sort((a, b) => a.r - b.r);
  const p = Math.min(frei.length, Math.max(m + 4, 2 * m));
  const benutzt = new Set();
  let zeiger = 0, seed = 2463534242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const start = Array.from({ length: p }, (_, j) => {
    const x = new Float64Array(ndof);
    if (j % 2) {
      while (zeiger < weich.length && benutzt.has((weich[zeiger].i / 3) | 0)) zeiger++;
      if (zeiger >= weich.length) { zeiger = 0; benutzt.clear(); }
      x[weich[zeiger++].i] = 1;
    } else for (const i of frei) x[i] = rnd();
    return x;
  });
  const { lam, X, schritte } = subspace({
    p, start, anzahl: m, maxIt: 40, tol: 1e-6,
    mv,
    loeser: (y, warm) => { const r = pcg(M, y, warm, 1e-6, () => {}); return { x: r.u, it: r.it }; },
    fort: (a, it) => progress(Math.min(0.98, a))
  });
  progress(1);
  const modes = [];
  for (let j = 0; j < p && modes.length < m; j++) {
    if (!(lam[j] > 0)) continue;
    let dmax = 0;
    for (let n = 0; n < nn; n++) dmax = Math.max(dmax, Math.hypot(X[j][3 * n], X[j][3 * n + 1], X[j][3 * n + 2]));
    if (!(dmax > 1e-12)) continue;
    const w = Math.sqrt(lam[j]);
    modes.push({ f: w / (2 * Math.PI), omega: w, u: Float64Array.from(X[j], v => v / dmax) });
  }
  // größte Ausdehnung des Netzes – die Oberfläche überhöht die gezeichnete Eigenform mit 8 % davon
  return { grid: { o: M.o, h: M.h, nx: M.nx, ny: M.ny, nz: M.nz }, map: M.map, nn, xyz: M.xyz, modes, size: Math.max(M.nx, M.ny, M.nz) * h, elements: ne, iterations: schritte, fixedNodes: M.fixedNodes.size, ...info(M) };
}

/* Knotenwert an einem Punkt: nächster aktiver Knoten des Gitters (für die Färbung des Anzeigenetzes) */
export function sampleNodes(res, values, p) {
  const n = nearestNode(res, p);
  return n < 0 ? 0 : values[n];
}

/* Verschiebung an einem Punkt als Vektor – für die gezeichnete Eigenform */
export function sampleVec(res, u, p) {
  const n = nearestNode(res, p);
  return n < 0 ? [0, 0, 0] : [u[3 * n], u[3 * n + 1], u[3 * n + 2]];
}

function nearestNode(res, p) {
  const { o, h, nx, ny } = res.grid, NX = nx + 1, NY = ny + 1;
  const i0 = Math.round((p[0] - o[0]) / h), j0 = Math.round((p[1] - o[1]) / h), k0 = Math.round((p[2] - o[2]) / h);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= 2 && best < 0; r++) {
    for (let k = k0 - r; k <= k0 + r; k++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (i < 0 || j < 0 || k < 0 || i > nx || j > ny || k > res.grid.nz) continue;
      const n = res.map[(k * NY + j) * NX + i];
      if (n < 0) continue;
      const d = (p[0] - res.xyz[3 * n]) ** 2 + (p[1] - res.xyz[3 * n + 1]) ** 2 + (p[2] - res.xyz[3 * n + 2]) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
  }
  return best;
}
