// cantcodecad – Festigkeit von Rahmen (Stahlbau), wie eine Stabwerksrechnung: jeder Rahmenstab ist ein räumlicher
// Biegebalken (Euler-Bernoulli, 6 Freiheitsgrade je Knoten) auf seiner Systemlinie (Skizzenlinie). Einheiten N, mm, MPa.
// Ergebnis: Verschiebungen, Schnittgrößen, Spannung σ = |N|/A + |My|/Wy + |Mz|/Wz (am Rand, ohne Schub und Torsion),
// Sicherheitsfaktor fy/σ und Knicken nach Euler mit Knicklänge = Stablänge (Eulerfall 2).
// Querschnittswerte aus profileShape (steel.js); Hauptachsen und Schwerpunkt werden ausgerechnet (L-Winkel, U).
import { profileShape } from '../steel.js';
import { cholesky, cholSolve, subspace } from './eigen.js';

export const FRAME_MATERIALS = {
  s235: { label: 'Stahl S235', E: 210000, G: 81000, fy: 235, rho: 7.85e-6 },
  s355: { label: 'Stahl S355', E: 210000, G: 81000, fy: 355, rho: 7.85e-6 },
  inox: { label: 'Edelstahl 1.4301', E: 200000, G: 77000, fy: 210, rho: 7.9e-6 },
  alu: { label: 'Aluminium EN AW-6060 T6', E: 69000, G: 26000, fy: 150, rho: 2.7e-6 }
};
const g = 9.81; // m/s² – Eigengewicht in N/mm: ρ [kg/mm³] · A [mm²] · g

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => mul(a, 1 / len(a));

/* Umriss als Vieleck (Kreise und Radien in Stücken) */
function outline(o, n = 16) {
  if (o.poly) return o.poly;
  if (o.rrect) {
    const [w, h, r0] = o.rrect, r = Math.max(0, r0), pts = [];
    [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]].forEach(([cx, cy, a0]) => {
      for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    });
    return pts;
  }
  return null;
}
/* Flächenmomente eines Vielecks um den Ursprung: A, Su = ∫u, Sv = ∫v, Iuu = ∫v², Ivv = ∫u², Iuv = ∫uv */
function polyMoments(P) {
  let A = 0, Su = 0, Sv = 0, Iuu = 0, Ivv = 0, Iuv = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], c = x0 * y1 - x1 * y0;
    A += c / 2; Su += (x0 + x1) * c / 6; Sv += (y0 + y1) * c / 6;
    Iuu += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12; Ivv += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12;
    Iuv += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c / 24;
  }
  const s = A < 0 ? -1 : 1;
  return { A: s * A, Su: s * Su, Sv: s * Sv, Iuu: s * Iuu, Ivv: s * Ivv, Iuv: s * Iuv };
}
function shapeMoments(o) {
  if (o.circle) { const r = o.circle, I = Math.PI * r ** 4 / 4; return { A: Math.PI * r * r, Su: 0, Sv: 0, Iuu: I, Ivv: I, Iuv: 0 }; }
  return polyMoments(outline(o));
}
/* Torsionsträgheit: geschlossene Rohre nach Bredt, offene dünnwandige Profile Σ b·t³/3 */
function torsion(p, A) {
  const w = +p.w, h = +p.h, t = +p.t, tw = +p.tw, tf = +p.tf;
  switch (p.kind) {
    case 'round': { const ro = w / 2, ri = ro - t; return Math.PI / 2 * (ro ** 4 - ri ** 4); }
    case 'bar': return Math.PI / 2 * (w / 2) ** 4;
    case 'square': case 'rect': { const H = p.kind === 'square' ? w : h, Am = (w - t) * (H - t), s = 2 * ((w - t) + (H - t)); return 4 * Am * Am * t / s; }
    case 'flat': { const a = Math.max(w, h), b = Math.min(w, h); return a * b ** 3 * (1 / 3 - 0.21 * b / a * (1 - b ** 4 / (12 * a ** 4))); }
    case 'angle': return ((w - t / 2) + (h - t / 2)) * t ** 3 / 3;
    case 'channel': return (2 * (w - tw / 2) * tf ** 3 + (h - tf) * tw ** 3) / 3;
    case 'ibeam': return (2 * w * tf ** 3 + (h - 2 * tf) * tw ** 3) / 3;
    default: return A * A / 40;
  }
}
/* Querschnittswerte in den Hauptachsen: A, Iy, Iz (um die Hauptachsen y, z), J, Wy, Wz, theta (Drehung der Hauptachse y
   gegen die Profil-x-Achse), cu/cv Schwerpunkt im Profil */
export function sectionProps(p) {
  const s = profileShape(p);
  const o = shapeMoments(s.outer), h = s.hole ? shapeMoments(s.hole) : { A: 0, Su: 0, Sv: 0, Iuu: 0, Ivv: 0, Iuv: 0 };
  const A = o.A - h.A, cu = (o.Su - h.Su) / A, cv = (o.Sv - h.Sv) / A;
  const Iuu = o.Iuu - h.Iuu - A * cv * cv, Ivv = o.Ivv - h.Ivv - A * cu * cu, Iuv = o.Iuv - h.Iuv - A * cu * cv;
  const theta = Math.abs(Iuv) < 1e-9 * (Iuu + Ivv) ? 0 : 0.5 * Math.atan2(-2 * Iuv, Iuu - Ivv);
  const c = Math.cos(theta), sn = Math.sin(theta);
  // Hauptachse y' = (c, sn) im Profil; Iy = ∫z'², Iz = ∫y'²
  const Iy = Iuu * c * c + Ivv * sn * sn - 2 * Iuv * c * sn, Iz = Iuu * sn * sn + Ivv * c * c + 2 * Iuv * c * sn;
  // Randabstände in den Hauptachsen
  const pts = s.outer.circle ? null : outline(s.outer, 16);
  let ymax = 0, zmax = 0;
  if (pts) pts.forEach(([u, v]) => { const du = u - cu, dv = v - cv; ymax = Math.max(ymax, Math.abs(du * c + dv * sn)); zmax = Math.max(zmax, Math.abs(-du * sn + dv * c)); });
  else ymax = zmax = s.outer.circle;
  return { A, Iy, Iz, J: torsion(p, A), Wy: Iy / zmax, Wz: Iz / ymax, theta, cu, cv, Imin: Math.min(Iy, Iz) };
}

/* Gleichungssystem K u = F (dicht, Gauß mit Pivotsuche); null bei beweglichem System */
function solve(K, F, n) {
  const a = K.map(r => r.slice()), b = F.slice();
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(a[i][i]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < maxDiag * 1e-11) return null;
    if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; [b[p], b[c]] = [b[c], b[p]]; }
    const pr = a[c], pv = pr[c];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / pv;
      if (f === 0) continue;
      const row = a[r];
      for (let k = c; k < n; k++) row[k] -= f * pr[k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k]; x[r] = s / a[r][r]; }
  return x;
}

/* Rechenmodell aus den Rahmenstäben.
   members: [{ id, A: [x,y,z], B: [x,y,z], px: Profil-x-Achse (Welt), prof }]
   supports: [{ p: [x,y,z], kind: 'fixed' | 'pinned' }], loads: [{ kind: 'node', p, F: [fx,fy,fz] } | { kind: 'member', id, q: [qx,qy,qz] N/mm }]
   opts: { mat, selfWeight, gravity: Richtung (Standard −Z), teile: Elemente je Stab mindestens (Modalanalyse) }
   Gemeinsam für Statik und Modalanalyse: Knoten, Elemente, Steifigkeitsmatrix K (global). */
function modell(members, supports, loads, opts) {
  const mat = FRAME_MATERIALS[opts.mat] || FRAME_MATERIALS.s235;
  const tol = 1e-3;
  const key = p => p.map(v => Math.round(v / tol)).join(',');
  const nodes = [], nodeIx = new Map();
  const node = p => { const k = key(p); if (!nodeIx.has(k)) { nodeIx.set(k, nodes.length); nodes.push(p.slice()); } return nodeIx.get(k); };
  // Elemente: Stäbe an Knoten anderer Stäbe teilen (T-Stöße, Lager oder Kräfte mitten auf einem Stab)
  const ends = members.flatMap(m => [m.A, m.B]).concat(supports.map(s => s.p), loads.filter(l => l.kind === 'node').map(l => l.p));
  const els = [];
  members.forEach(m => {
    const L = len(sub(m.B, m.A));
    if (L < 1e-6) return;
    const u = norm(sub(m.B, m.A));
    const ts = [0, 1];
    for (let k = 1; k < (opts.teile || 1); k++) ts.push(k / opts.teile);
    ends.forEach(P => {
      const s = dot(sub(P, m.A), u);
      if (s > tol && s < L - tol && len(sub(P, add(m.A, mul(u, s)))) < 0.5) ts.push(s / L);
    });
    const sec = sectionProps(m.prof);
    // Hauptachsen: y = Profil-x um theta gedreht um die Stabachse, z = x × y
    let px = sub(m.px, mul(u, dot(m.px, u)));
    if (len(px) < 1e-9) px = Math.abs(u[2]) < 0.9 ? cross([0, 0, 1], u) : cross([1, 0, 0], u);
    px = norm(px);
    const py = cross(u, px), c = Math.cos(sec.theta), sn = Math.sin(sec.theta);
    const ey = norm(add(mul(px, c), mul(py, sn))), ez = cross(u, ey);
    [...new Set(ts.map(t => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b).forEach((t, k, arr) => {
      if (k === 0) return;
      const P0 = add(m.A, mul(u, arr[k - 1] * L)), P1 = add(m.A, mul(u, t * L));
      els.push({ member: m.id, i: node(P0), j: node(P1), L: (t - arr[k - 1]) * L, ex: u, ey, ez, sec, s0: arr[k - 1] * L });
    });
  });
  const n = nodes.length * 6;
  if (!els.length) throw new Error('Es gibt keine Rahmenstäbe');
  const K = Array.from({ length: n }, () => new Float64Array(n));
  const E = mat.E, G = mat.G;
  els.forEach(e => {
    const { A, Iy, Iz, J } = e.sec, L = e.L;
    const k = Array.from({ length: 12 }, () => new Float64Array(12));
    const set = (r, c, v) => { k[r][c] += v; if (r !== c) k[c][r] += v; };
    const EA = E * A / L, GJ = G * J / L;
    set(0, 0, EA); set(6, 6, EA); set(0, 6, -EA);
    set(3, 3, GJ); set(9, 9, GJ); set(3, 9, -GJ);
    // Biegung in y (um z): v, θz
    const a = 12 * E * Iz / L ** 3, b = 6 * E * Iz / L ** 2, cc = 4 * E * Iz / L, d = 2 * E * Iz / L;
    set(1, 1, a); set(7, 7, a); set(1, 7, -a); set(1, 5, b); set(1, 11, b); set(7, 5, -b); set(7, 11, -b); set(5, 5, cc); set(11, 11, cc); set(5, 11, d);
    // Biegung in z (um y): w, θy
    const a2 = 12 * E * Iy / L ** 3, b2 = 6 * E * Iy / L ** 2, c2 = 4 * E * Iy / L, d2 = 2 * E * Iy / L;
    set(2, 2, a2); set(8, 8, a2); set(2, 8, -a2); set(2, 4, -b2); set(2, 10, -b2); set(8, 4, b2); set(8, 10, b2); set(4, 4, c2); set(10, 10, c2); set(4, 10, d2);
    e.k = k;
    const R = [e.ex, e.ey, e.ez];
    e.R = R;
    // global = Tᵀ k T, T = Blockdiagonale aus R
    const dofs = [...[0, 1, 2, 3, 4, 5].map(q => e.i * 6 + q), ...[0, 1, 2, 3, 4, 5].map(q => e.j * 6 + q)];
    e.dofs = dofs;
    const T = (r, c) => (Math.floor(r / 3) === Math.floor(c / 3) ? R[r % 3][c % 3] : 0);
    const kg = Array.from({ length: 12 }, () => new Float64Array(12));
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
      let s = 0;
      const rb = Math.floor(r / 3) * 3, cb = Math.floor(c / 3) * 3;
      for (let p = rb; p < rb + 3; p++) { const tpr = T(p, r); if (!tpr) continue; for (let q = cb; q < cb + 3; q++) { const tqc = T(q, c); if (tqc) s += tpr * k[p][q] * tqc; } }
      kg[r][c] = s;
    }
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) K[dofs[r]][dofs[c]] += kg[r][c];
    e.q = [0, 0, 0];
  });
  return { mat, key, nodes, nodeIx, els, n, K };
}
/* Lager sperren: Freiheitsgrade der Lagerknoten; dazu eine kleine Drehfeder an jedem Knoten gegen das Verdrehen
   gelenkig gelagerter Stäbe um ihre Achse (rechnerisch ohne Einfluss) */
function lagern(M, supports) {
  const { K, n, nodes, nodeIx, key } = M, fixed = new Set(), used = [];
  supports.forEach(s => {
    const i = nodeIx.get(key(s.p));
    if (i == null) return;
    used.push(i);
    const lock = s.kind === 'pinned' ? [0, 1, 2] : [0, 1, 2, 3, 4, 5];
    lock.forEach(r => fixed.add(i * 6 + r));
  });
  if (!fixed.size) throw new Error('Es fehlt ein Lager');
  let kmax = 0;
  for (let i = 0; i < n; i++) kmax = Math.max(kmax, K[i][i]);
  for (let i = 0; i < nodes.length; i++) for (let r = 3; r < 6; r++) K[i * 6 + r][i * 6 + r] += kmax * 1e-9;
  return { fixed, used };
}
/* Lokale Verschiebungen eines Elements → Biegelinie an 11 Stellen (Hermite; Streckenlast-Anteil nur in der Statik) */
function linie(e, ul, nodes, E, q) {
  const { Iy, Iz } = e.sec, L = e.L, curve = [];
  let dmax = 0;
  for (let s = 0; s <= 10; s++) {
    const xx = L * s / 10, t = s / 10, h1 = 1 - 3 * t * t + 2 * t ** 3, h2 = L * (t - 2 * t * t + t ** 3), h3 = 3 * t * t - 2 * t ** 3, h4 = L * (-t * t + t ** 3);
    const v = h1 * ul[1] + h2 * ul[5] + h3 * ul[7] + h4 * ul[11] + (q ? q[1] * xx * xx * (L - xx) ** 2 / (24 * E * Iz) : 0);
    const w = h1 * ul[2] - h2 * ul[4] + h3 * ul[8] - h4 * ul[10] + (q ? q[2] * xx * xx * (L - xx) ** 2 / (24 * E * Iy) : 0);
    const uax = (1 - t) * ul[0] + t * ul[6];
    const dg = add(add(mul(e.ex, uax), mul(e.ey, v)), mul(e.ez, w));
    dmax = Math.max(dmax, len(dg));
    curve.push({ p: add(nodes[e.i], mul(e.ex, xx)), d: dg });
  }
  return { curve, dmax };
}
const lokal = (e, U) => {
  const ug = e.dofs.map(d => U[d]), ul = [];
  for (let blk = 0; blk < 4; blk++) for (let r = 0; r < 3; r++) { let s = 0; for (let c = 0; c < 3; c++) s += e.R[r][c] * ug[blk * 3 + c]; ul.push(s); }
  return ul;
};

export function solveFrame(members, supports, loads, opts = {}) {
  const M = modell(members, supports, loads, opts), { mat, key, nodes, nodeIx, els, n, K } = M, E = mat.E;
  const F = new Float64Array(n);
  // Streckenlasten (global) und Eigengewicht
  const gdir = opts.gravity || [0, 0, -1];
  els.forEach(e => {
    let q = [0, 0, 0];
    loads.filter(l => l.kind === 'member' && l.id === e.member).forEach(l => { q = add(q, l.q); });
    if (opts.selfWeight) q = add(q, mul(gdir, mat.rho * e.sec.A * g));
    const ql = e.R.map(r => dot(r, q)); // lokal
    e.q = ql;
    const L = e.L;
    // Volleinspannkräfte (lokal) → Ersatzknotenlasten
    const fe = [ql[0] * L / 2, ql[1] * L / 2, ql[2] * L / 2, 0, -ql[2] * L * L / 12, ql[1] * L * L / 12,
      ql[0] * L / 2, ql[1] * L / 2, ql[2] * L / 2, 0, ql[2] * L * L / 12, -ql[1] * L * L / 12];
    e.fe = fe;
    for (let blk = 0; blk < 4; blk++) for (let r = 0; r < 3; r++) {
      let s = 0;
      for (let c = 0; c < 3; c++) s += e.R[c][r] * fe[blk * 3 + c];
      F[e.dofs[blk * 3 + r]] += s;
    }
  });
  loads.filter(l => l.kind === 'node').forEach(l => {
    const i = nodeIx.get(key(l.p));
    if (i == null) return;
    for (let r = 0; r < 3; r++) F[i * 6 + r] += l.F[r];
  });
  const { fixed, used } = lagern(M, supports);
  const free = [...Array(n).keys()].filter(d => !fixed.has(d));
  const idx = new Map(free.map((d, k) => [d, k]));
  const Kf = free.map(r => Float64Array.from(free, c => K[r][c])), Ff = free.map(d => F[d]);
  const x = solve(Kf.map(r => Array.from(r)), Ff, free.length);
  if (!x) throw new Error('Das Tragwerk ist beweglich – Lager prüfen');
  const U = new Float64Array(n);
  free.forEach((d, k) => { U[d] = x[k]; });
  // Auflagerkräfte
  const reactions = used.map(i => {
    const r = [0, 0, 0];
    for (let c = 0; c < 3; c++) { let s = -F[i * 6 + c]; for (let d = 0; d < n; d++) s += K[i * 6 + c][d] * U[d]; r[c] = s; }
    return { p: nodes[i], F: r };
  });
  // Schnittgrößen und Spannungen je Element (an 11 Stellen), Biegelinie für die Anzeige
  const res = new Map();
  let dmax = 0;
  els.forEach(e => {
    const ul = lokal(e, U);
    const f = e.k.map((row, r) => row.reduce((s, v, c) => s + v * ul[c], 0) - e.fe[r]);
    const { A, Wy, Wz, Imin } = e.sec, L = e.L, q = e.q;
    let smax = 0, Nmax = 0, Mmax = 0, Nmin = 0;
    for (let s = 0; s <= 10; s++) {
      const xx = L * s / 10;
      // Schnitt bei x: linkes Stück [0, x] im Gleichgewicht mit Endkraft f_i und Last q·x
      const Fi = [f[0], f[1], f[2]], Mi = [f[3], f[4], f[5]];
      const Rf = mul(add(Fi, mul(q, xx)), -1);
      const arm = [-xx, 0, 0], armQ = [-xx / 2, 0, 0];
      const Mc = mul(add(add(Mi, cross(arm, Fi)), cross(armQ, mul(q, xx))), -1);
      const N = Rf[0]; // Normalkraft am Schnitt (Zug positiv): Kraft des rechten Teils auf das linke in +x
      const sg = Math.abs(N) / A + Math.abs(Mc[1]) / Wy + Math.abs(Mc[2]) / Wz;
      smax = Math.max(smax, sg); Nmax = Math.max(Nmax, Math.abs(N)); Mmax = Math.max(Mmax, Math.hypot(Mc[1], Mc[2]));
      Nmin = Math.min(Nmin, N);
    }
    // Durchbiegung: Hermite plus Anteil der Streckenlast, Verschiebung längs linear
    const bl = linie(e, ul, nodes, E, q), curve = bl.curve;
    dmax = Math.max(dmax, bl.dmax);
    // Knicken: Druck (N < 0 am Stab) gegen Euler, Knicklänge = Stablänge des ganzen Rahmenstabs
    const r = res.get(e.member) || { id: e.member, smax: 0, Nmax: 0, Mmax: 0, Ncomp: 0, Lb: 0, Imin, curves: [] };
    r.smax = Math.max(r.smax, smax); r.Nmax = Math.max(r.Nmax, Nmax); r.Mmax = Math.max(r.Mmax, Mmax);
    r.Ncomp = Math.max(r.Ncomp, -Nmin); // größte Druckkraft (N < 0 = Druck)
    r.Lb += L;
    r.curves.push(curve);
    res.set(e.member, r);
  });
  const out = [...res.values()].map(r => {
    const Ncr = Math.PI ** 2 * E * r.Imin / (r.Lb * r.Lb);
    const sfStress = r.smax > 1e-9 ? mat.fy / r.smax : Infinity, sfBuck = r.Ncomp > 1e-6 ? Ncr / r.Ncomp : Infinity;
    return { ...r, sf: Math.min(sfStress, sfBuck), sfStress, sfBuck, Ncr };
  });
  return { nodes, members: out, dmax, reactions, mat, U };
}

/* Modalanalyse: Eigenfrequenzen und Eigenformen des gelagerten Rahmens.
   K φ = ω² M φ mit konsistenter Massenmatrix des räumlichen Balkens (Masse ρ A L, Drehträgheit ρ (Iy + Iz) L), jeder Stab
   in mindestens 8 Elemente geteilt; Unterraum-Iteration (Bathe) für die kleinsten Eigenwerte. Einheiten N, mm, t, s:
   ρ [kg/mm³] · 1e-3 = t/mm³, dann ist ω² in 1/s². Eigenformen auf größte Verschiebung 1 normiert (Kurven wie die
   Biegelinie). Formen, die nur die Ersatz-Drehfedern der Gelenklager halten (Drehen um die Stabachse), fallen weg. */
export function frameModes(members, supports, opts = {}, anzahl = 6) {
  const M0 = modell(members, supports, [], { ...opts, teile: Math.max(8, opts.teile || 0) }), { mat, nodes, els, n, K } = M0;
  const Mm = Array.from({ length: n }, () => new Float64Array(n)), rho = mat.rho * 1e-3;
  els.forEach(e => {
    const { A, Iy, Iz } = e.sec, L = e.L, m = rho * A * L, mt = rho * (Iy + Iz) * L;
    const k = Array.from({ length: 12 }, () => new Float64Array(12));
    const set = (r, c, v) => { k[r][c] += v; if (r !== c) k[c][r] += v; };
    set(0, 0, m / 3); set(6, 6, m / 3); set(0, 6, m / 6);
    set(3, 3, mt / 3); set(9, 9, mt / 3); set(3, 9, mt / 6);
    const b = m / 420;
    // v, θz (1, 5, 7, 11)
    set(1, 1, 156 * b); set(7, 7, 156 * b); set(1, 7, 54 * b); set(5, 5, 4 * L * L * b); set(11, 11, 4 * L * L * b); set(5, 11, -3 * L * L * b);
    set(1, 5, 22 * L * b); set(1, 11, -13 * L * b); set(7, 5, 13 * L * b); set(7, 11, -22 * L * b);
    // w, θy (2, 4, 8, 10): Vorzeichen der Kopplung wie in der Steifigkeit gedreht
    set(2, 2, 156 * b); set(8, 8, 156 * b); set(2, 8, 54 * b); set(4, 4, 4 * L * L * b); set(10, 10, 4 * L * L * b); set(4, 10, -3 * L * L * b);
    set(2, 4, -22 * L * b); set(2, 10, 13 * L * b); set(8, 4, -13 * L * b); set(8, 10, 22 * L * b);
    const R = e.R;
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
      let s = 0;
      const rb = Math.floor(r / 3) * 3, cb = Math.floor(c / 3) * 3;
      for (let p = rb; p < rb + 3; p++) { const tpr = R[p % 3][r % 3]; if (!tpr) continue; for (let q = cb; q < cb + 3; q++) { const tqc = R[q % 3][c % 3]; if (tqc) s += tpr * k[p][q] * tqc; } }
      Mm[e.dofs[r]][e.dofs[c]] += s;
    }
  });
  const { fixed } = lagern(M0, supports);
  const free = [...Array(n).keys()].filter(d => !fixed.has(d)), nf = free.length;
  if (!nf) throw new Error('Alles ist gelagert – nichts kann schwingen');
  const Kf = free.map(r => Float64Array.from(free, c => K[r][c])), Mf = free.map(r => Float64Array.from(free, c => Mm[r][c]));
  const L = cholesky(Kf.map(r => Float64Array.from(r)), nf);
  if (!L) throw new Error('Das Tragwerk ist beweglich – Lager prüfen');
  const mv = x => Mf.map(r => { let s = 0; for (let k = 0; k < nf; k++) s += r[k] * x[k]; return s; });
  const p = Math.min(nf, Math.max(2 * anzahl, anzahl + 8));
  // Startvektoren: Diagonale von M, dann Einheitsvektoren an den Stellen mit kleinstem K/M (wie Bathe)
  const ratio = free.map((_, i) => ({ i, r: Mf[i][i] > 0 ? Kf[i][i] / Mf[i][i] : Infinity })).sort((a, b) => a.r - b.r);
  const start = Array.from({ length: p }, (_, j) => { const x = new Float64Array(nf); if (j === 0) for (let i = 0; i < nf; i++) x[i] = Mf[i][i]; else x[ratio[(j - 1) % nf].i] = 1; return x; });
  // dasselbe Verfahren wie bei den Bauteilen (eigen.js), nur mit dem dichten Löser der kleinen Matrix
  const { lam, X } = subspace({ p, start, mv, anzahl, maxIt: 80, loeser: y => ({ x: cholSolve(L, y, nf), it: 0 }) });
  // Formen der Ersatz-Drehfedern aussortieren: Eigenwert winzig gegen die typische Steifigkeit je Masse
  const med = ratio[Math.floor(nf / 2)].r;
  const modes = [];
  for (let j = 0; j < p && modes.length < anzahl; j++) {
    if (!(lam[j] > 1e-6 * med)) continue;
    const U = new Float64Array(n);
    free.forEach((d, k) => { U[d] = X[j][k]; });
    let dmax = 0;
    const curves = [];
    els.forEach(e => { const bl = linie(e, lokal(e, U), nodes, mat.E, null); dmax = Math.max(dmax, bl.dmax); curves.push(bl.curve); });
    if (dmax > 0) curves.forEach(c => c.forEach(x => { x.d = mul(x.d, 1 / dmax); }));
    modes.push({ f: Math.sqrt(lam[j]) / (2 * Math.PI), omega: Math.sqrt(lam[j]), curves });
  }
  return { modes, mat, nodes };
}
