// cantcodecad – stationäre Wärmeanalyse (Prüfen → Festigkeit (Bauteil), Studie „Wärme“), angelehnt an die übliche
// Simulation „Thermisch (stationär)“. Dasselbe Würfelnetz und dieselben Knoten wie bei der Statik (solid.js), nur
// ein Freiheitsgrad je Knoten: die Temperatur. Element: Wärmeleitung ∫ k ∇N·∇N über den Würfel, volle Integration –
// alle Elemente sind gleich, also wieder eine Elementmatrix und ein matrixfreies CG (cg.js).
// Einheiten mm, W, K (Temperaturdifferenzen): k in W/(mm·K) – 1 W/(m·K) = 1e-3 W/(mm·K). Am Rand ohne Vorgabe
// fließt nichts ab (adiabat), deshalb braucht die Rechnung eine feste Temperatur oder Konvektion, sonst ist das
// Feld nicht bestimmt.

import { solidModel, CORNERS } from './solid.js';
import { cg } from './cg.js';

/* ---------- Elementmatrix (Würfel Kante 1, k = 1) ----------
   8 Knoten, Dreilinien-Ansätze. Die Ableitungen sind in jeder Richtung linear, die Produkte also quadratisch –
   3-Punkt-Gauß je Richtung ist exakt. Ergebnis: symmetrische 8×8-Matrix, Zeilensumme null (eine konstante
   Temperatur leitet nichts). */
let cached = null;
export function hexConduction() {
  if (cached) return cached;
  const GP = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
  const Ke = new Float64Array(64);
  for (const [xi, wx] of GP) for (const [et, wy] of GP) for (const [ze, wz] of GP) {
    const wq = wx * wy * wz / 8; // Gewichte auf (ξ,η,ζ) mal Jacobi-Determinante des Einheitswürfels (1/8)
    const d = CORNERS.map(([a, b, c]) => [a * (1 + b * et) * (1 + c * ze) / 4, b * (1 + a * xi) * (1 + c * ze) / 4, c * (1 + a * xi) * (1 + b * et) / 4]);
    for (let p = 0; p < 8; p++) for (let q = 0; q < 8; q++) Ke[p * 8 + q] += wq * (d[p][0] * d[q][0] + d[p][1] * d[q][1] + d[p][2] * d[q][2]);
  }
  cached = Ke;
  return Ke;
}

/* Fläche einer Dreiecksliste (mm²) – für den Wärmeübergang an einer Konvektionsfläche */
function flaeche(tris) {
  let A = 0;
  for (let q = 0; q + 8 < tris.length; q += 9) {
    const ux = tris[q + 3] - tris[q], uy = tris[q + 4] - tris[q + 1], uz = tris[q + 5] - tris[q + 2];
    const vx = tris[q + 6] - tris[q], vy = tris[q + 7] - tris[q + 1], vz = tris[q + 8] - tris[q + 2];
    A += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return A;
}

/* ---------- Rechnung ----------
   job: { tris (Körper), bbox, h, k (W/(mm·K)), fixed: [] ,
          temps: [{ tris, T }], fluxes: [{ tris, P }], convs: [{ tris, h (W/(mm²·K)), Tamb }] }
   progress(anteil) wird zwischendurch gerufen. Ergebnis: Temperatur je Knoten (°C), größter und kleinster Wert,
   Wärmeströme der Temperaturflächen (Vorzeichen: in den Körper hinein) und die Bilanz der Konvektion. */
export function solveSolidThermal(job, progress = () => {}) {
  const M = solidModel({ ...job, fixed: [] }), { nn, ne, conn, cnt, h, ebody, mats } = M;
  /* Wärmeleitfähigkeit je Körper – ein Aluminiumblech an einem Kunststoffgehäuse leitet unterschiedlich */
  const ks = mats.map(m => m.k ?? job.k);
  if (ks.some(k => !(k > 0))) throw new Error('Für die Wärmeanalyse gehört ein Werkstoff mit Wärmeleitfähigkeit dazu');
  const rand = s => [...M.nodesNear([s.tris])];
  const temps = (job.temps || []).map(t => ({ T: t.T, nodes: rand(t) }));
  const convs = (job.convs || []).map(c => ({ tris: c.tris, h: c.h, Tamb: c.Tamb, nodes: rand(c) }));
  const fluxe = (job.fluxes || []).map(q => ({ P: q.P, nodes: rand(q) }));
  if (temps.some(t => !t.nodes.length) || convs.some(c => !c.nodes.length) || fluxe.some(q => !q.nodes.length))
    throw new Error('An einer Wärmefläche liegt kein Netzknoten – Netz feiner wählen');
  if (!temps.length && !convs.length) throw new Error('Ohne feste Temperatur oder Konvektion ist das Temperaturfeld nicht bestimmt');

  const fix = new Uint8Array(nn), T0 = new Float64Array(nn);
  temps.forEach(t => t.nodes.forEach(n => { if (!fix[n]) { fix[n] = 1; T0[n] = t.T; } }));
  const gc = new Float64Array(nn), tb = new Float64Array(nn);
  convs.forEach(c => {
    const A = flaeche(c.tris), ws = c.nodes.reduce((s, n) => s + cnt[n], 0) || 1;
    // Gewichte je Knoten mitgemerkt – daraus zählt der Rechner die Wärme, die diese Fläche abgibt
    c.w = [];
    c.nodes.forEach(n => { if (fix[n]) return; const w = c.h * A * cnt[n] / ws; gc[n] += w; tb[n] += w * c.Tamb; c.w.push([n, w]); });
  });
  const f = Float64Array.from(tb);
  let qIn = 0;
  fluxe.forEach(q => {
    const ws = q.nodes.reduce((s, n) => s + cnt[n], 0) || 1;
    q.nodes.forEach(n => { f[n] += q.P * cnt[n] / ws; });
    qIn += q.P;
  });

  const Grund = hexConduction();
  const KeList = ks.map(k => Grund.map(v => v * k * h));
  const diag = new Float64Array(nn);
  for (let e = 0; e < ne; e++) { const Ke = KeList[ebody[e]]; for (let a = 0; a < 8; a++) diag[conn[8 * e + a]] += Ke[a * 8 + a]; }
  const free = new Uint8Array(nn);
  for (let n = 0; n < nn; n++) if (!fix[n]) { free[n] = 1; diag[n] += gc[n]; } else diag[n] = 1;
  if (!free.includes(1)) throw new Error('Das ganze Netz ist auf Temperatur gesetzt – nichts zu rechnen');

  const t = new Float64Array(8);
  const lap = (x, y) => {
    y.fill(0);
    for (let e = 0; e < ne; e++) {
      const c = 8 * e, Ke = KeList[ebody[e]];
      for (let a = 0; a < 8; a++) t[a] = x[conn[c + a]];
      for (let a = 0; a < 8; a++) {
        let s = 0;
        for (let q = 0; q < 8; q++) s += Ke[a * 8 + q] * t[q];
        y[conn[c + a]] += s;
      }
    }
    for (let n = 0; n < nn; n++) if (gc[n]) y[n] += gc[n] * x[n];
  };
  const anwenden = (x, y) => { lap(x, y); for (let n = 0; n < nn; n++) if (fix[n]) y[n] = x[n]; };
  // Start: die vorgegebenen Temperaturen, im Inneren der Mittelwert aller Vorgaben – dann läuft das CG kürzer
  const vorgaben = [...temps.map(t => t.T), ...convs.map(c => c.Tamb)].filter(v => isFinite(v));
  const mitte = vorgaben.length ? vorgaben.reduce((a, b) => a + b, 0) / vorgaben.length : 0;
  const start = Float64Array.from({ length: nn }, (_, n) => (fix[n] ? T0[n] : mitte));
  const { u, it } = cg({ n: nn, free, diag, anwenden, f, u0: start, tol: 1e-9, maxIt: Math.max(2000, 200 * Math.cbrt(ne)), progress });

  // Wärmeströme: an den Temperaturflächen die Reaktion (W, in den Körper hinein), bei der Konvektion die Wärme,
  // die jede Fläche an die Umgebung abgibt (W). Bilanz: zugeführte Leistungen und Abfluss müssen gleich groß sein.
  const y = new Float64Array(nn);
  lap(u, y);
  const qFix = temps.map(tn => { let s = 0; tn.nodes.forEach(n => { s += y[n] - f[n]; }); return s; });
  const qConv = convs.map(c => c.w.reduce((s, [n, w]) => s + w * (u[n] - c.Tamb), 0));
  const qConvSum = qConv.reduce((a, b) => a + b, 0);
  let tmin = Infinity, tmax = -Infinity;
  for (let n = 0; n < nn; n++) { tmin = Math.min(tmin, u[n]); tmax = Math.max(tmax, u[n]); }
  progress(1);
  return {
    grid: { o: M.o, h: M.h, nx: M.nx, ny: M.ny, nz: M.nz }, map: M.map, nn, xyz: M.xyz, T: u, tmin, tmax,
    qFix, qIn, qConv, qConvSum, elements: ne, iterations: it, fixedNodes: temps.reduce((s, t2) => s + t2.nodes.length, 0), warm: true,
    koerper: M.teile, kontakte: M.kontakte, ueber: M.ueber
  };
}
