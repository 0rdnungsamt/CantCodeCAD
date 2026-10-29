// cantcodecad – Endform des Generativen Designs: aus dem Dichtefeld der Optimierung ein Umriss, der vorzeigbar ist und
// genau zur Geometrie passt. Reine Rechnung ohne Oberfläche (Worker und Prüfstand).
//
// Ablauf auf einem feinen Raster (K-fach feiner als die FE-Elemente):
//  1. Dichte bilinear verfeinern, Beibehalten-Geometrie exakt dazu (Abstandsfeld aus ihren Polygonen)
//  2. Schließen (Radius rc) und Öffnen (Radius ro) über Abstandsfelder: Kehlen zwischen Stab und Auge werden zu
//     Rundungen, Ecken außen rund, Grate verschwinden 
//  3. leicht weichzeichnen (Unterpixel-Glätte), dann Beibehalten exakt vereinigen und Bohrungen sowie Hindernisse
//     exakt abziehen (um δ kleiner): der Kern schneidet danach die echten Bohrungen – δ sorgt dafür, dass dabei keine
//     Splitterflächen entstehen. Der Außenrand der Augen ist die Kontur selbst (Spline durch Punkte auf dem Kreis);
//     ein Verschmelzen mit fast deckungsgleichen Flächen wäre in OCC sehr langsam.
//  4. Schwelle so wählen, dass die Fläche genau dem Zielanteil entspricht
//  5. Kontur (Marching Squares, linear), gleichmäßig neu abgetastet – der Kern legt periodische B-Splines hindurch
import { contourAusDichte, flaechenAusSchleifen, polyFlaeche } from './topo.js';
import { linienBoegen, kettePunkte } from './gd-linien.js';

const K = 5;          // Feinheit gegenüber dem FE-Raster
export const DELTA = 0.05; // mm Überlappung zur exakten Geometrie (siehe oben)

/* ---------- Abstandsfelder ---------- */
// 1D-Quadratabstand (Felzenszwalb/Huttenlocher), f: 0 auf Zielpixeln, sonst groß
function dt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
// euklidischer Abstand (in Pixeln) jedes Pixels zum nächsten Pixel mit ziel[i] = 1
function abstand(ziel, nx, ny) {
  const BIG = 1e20, g = new Float64Array(nx * ny), n = Math.max(nx, ny);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = ziel[j * nx + i] ? 0 : BIG;
    dt1(f, ny, d, v, z);
    for (let j = 0; j < ny; j++) g[j * nx + i] = d[j];
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) f[i] = g[j * nx + i];
    dt1(f, nx, d, v, z);
    for (let i = 0; i < nx; i++) g[j * nx + i] = Math.sqrt(d[i]);
  }
  return g;
}
// vorzeichenbehaftetes Abstandsfeld einer Pixelmenge (innen negativ), in mm; ±½ Pixel: Rand liegt zwischen den Pixeln
function sdfAus(innen, nx, ny, h) {
  const aussen = new Uint8Array(innen.length);
  for (let i = 0; i < innen.length; i++) aussen[i] = innen[i] ? 0 : 1;
  const dA = abstand(innen, nx, ny), dI = abstand(aussen, nx, ny), s = new Float64Array(innen.length);
  for (let i = 0; i < s.length; i++) s[i] = innen[i] ? -(dI[i] - 0.5) * h : (dA[i] - 0.5) * h;
  return s;
}
// exaktes Abstandsfeld von Gebieten { poly, holePolys } (innen negativ); fern vom Rand reicht „weit“
function sdfPolys(gebiete, R) {
  const { nx, ny, h, x0, y0 } = R, s = new Float64Array(nx * ny).fill(Infinity);
  const zuege = gebiete.flatMap(g => [g.poly, ...(g.holePolys || [])]);
  if (!zuege.length) return s;
  const innen = new Uint8Array(nx * ny);
  // innen: gerade-ungerade je Zeile über alle Züge (Löcher sind eigene Züge)
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * h, xs = [];
    for (const P of zuege) for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / h - 0.5));
      for (let i = i0; i <= i1; i++) innen[j * nx + i] = 1;
    }
  }
  // Abstand zum Rand: je Kante nur die Pixel in einem Band um ihre Hülle (fern genügt der Pixelabstand)
  const band = 6 * h;
  for (const P of zuege) for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-30;
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - band - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + band - x0) / h));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - band - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + band - y0) / h));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * h, py = y0 + (j + 0.5) * h;
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2));
      const d = Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy), q = j * nx + i;
      if (d < s[q]) s[q] = d;
    }
  }
  // außerhalb des Bandes: Pixelabstand (nur Größenordnung, dort wird nicht konturiert)
  const fern = sdfAus(innen, nx, ny, h);
  for (let q = 0; q < s.length; q++) s[q] = Number.isFinite(s[q]) ? (innen[q] ? -s[q] : s[q]) : fern[q];
  return s;
}
function weich(s, nx, ny, sig) {
  const r = Math.ceil(2.5 * sig), w = [];
  for (let d = -r; d <= r; d++) w.push(Math.exp(-d * d / (2 * sig * sig)));
  const t = new Float64Array(s.length), o = new Float64Array(s.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let a = 0, n = 0;
    for (let d = -r; d <= r; d++) { const q = Math.min(nx - 1, Math.max(0, i + d)); a += w[d + r] * s[j * nx + q]; n += w[d + r]; }
    t[j * nx + i] = a / n;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let a = 0, n = 0;
    for (let d = -r; d <= r; d++) { const q = Math.min(ny - 1, Math.max(0, j + d)); a += w[d + r] * t[q * nx + i]; n += w[d + r]; }
    o[j * nx + i] = a / n;
  }
  return o;
}

/* Kreis durch einen Zug (Ausgleich nach Kåsa); nur wenn alle Punkte auf ihm liegen (Abweichung ≤ 0,1 ‰ des Radius) */
function kreisAus(P) {
  if (!P || P.length < 8) return null;
  let sx = 0, sy = 0;
  for (const p of P) { sx += p[0]; sy += p[1]; }
  const mx = sx / P.length, my = sy / P.length;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of P) { const u = p[0] - mx, v = p[1] - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const b1 = 0.5 * (suuu + suvv), b2 = 0.5 * (svvv + svuu);
  const uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det, c = [mx + uc, my + vc];
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / P.length);
  for (const p of P) if (Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r) > 1e-4 * r) return null;
  return { c, r };
}

/* ---------- Vorbereitung je Ergebnis (unabhängig von der Schwelle) ---------- */
export function formRaster(m, geo) {
  const he = Math.min(m.hx, m.hy), h = he / K, rand = 3 * he;
  const x0 = m.ox - rand, y0 = m.oy - rand;
  const nx = Math.ceil((m.nelx * m.hx + 2 * rand) / h), ny = Math.ceil((m.nely * m.hy + 2 * rand) / h);
  const R = { nx, ny, h, x0, y0, he };
  const keep = (geo && geo.keep) || [], hind = (geo && geo.hindernis) || [];
  R.sKeep = sdfPolys(keep, R);
  // Bohrungen = Löcher der Beibehalten-Gebiete (als eigene Gebiete) und Hindernisse
  const loecher = keep.flatMap(g => (g.holePolys || []).map(p => ({ poly: p, holePolys: [] })));
  R.sLoch = sdfPolys([...loecher, ...hind], R);
  // Kreise der Beibehalten-Geometrie (Augen, Bohrungen) für exakte Bögen in der Kontur
  R.kreise = keep.flatMap(g => [g.poly, ...(g.holePolys || [])]).map(kreisAus).filter(Boolean);
  // gerade Kanten der Startform (für Geraden, die genau am Rand entlang laufen)
  R.kanten = ((geo && geo.start) || []).flatMap(g => [g.poly, ...(g.holePolys || [])]).flatMap(P => P.map((a, i) => {
    const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return L >= 2 * he ? { A: a, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] } : null;
  })).filter(Boolean);
  // Startform exakt (Rand des Designbereichs); ohne Angabe gilt nur die Elementmaske
  R.sStart = geo && geo.start && geo.start.length ? sdfPolys(geo.start, R) : null;
  // Bereich, in dem Material sein darf: Elemente des Designbereichs (Maske) – als Pixelmenge
  R.erlaubt = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ex = Math.floor((x0 + (i + 0.5) * h - m.ox) / m.hx), ey = Math.floor((y0 + (j + 0.5) * h - m.oy) / m.hy);
    if (ex >= 0 && ey >= 0 && ex < m.nelx && ey < m.nely && m.mask[ey * m.nelx + ex]) R.erlaubt[j * nx + i] = 1;
  }
  return R;
}
// Dichte bilinear auf das feine Raster (Elementmitten als Stützstellen, außerhalb der Maske 0)
export function feineDichte(x, m, R) {
  const { nx, ny, h, x0, y0 } = R, f = new Float64Array(nx * ny);
  const at = (i, j) => { if (i < 0 || j < 0 || i >= m.nelx || j >= m.nely) return 0; const e = j * m.nelx + i; return m.mask[e] ? x[e] : 0; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = (x0 + (i + 0.5) * h - m.ox) / m.hx - 0.5, v = (y0 + (j + 0.5) * h - m.oy) / m.hy - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(v), a = u - i0, b = v - j0;
    f[j * nx + i] = (1 - a) * (1 - b) * at(i0, j0) + a * (1 - b) * at(i0 + 1, j0) + (1 - a) * b * at(i0, j0 + 1) + a * b * at(i0 + 1, j0 + 1);
  }
  return f;
}

/* Abstandsfeld der Endform zu einer Schwelle t */
export function formFeld(F, R, t, o = {}) {
  const { nx, ny, h, he } = R, n = nx * ny;
  const rc = (o.rc ?? 1.6) * he, ro = (o.ro ?? 0.6) * he;
  const B = new Uint8Array(n);
  for (let q = 0; q < n; q++) B[q] = (R.erlaubt[q] && F[q] >= t) || R.sKeep[q] <= 0 ? 1 : 0;
  // Schließen: erst um rc wachsen, dann um rc schrumpfen → Kehlen werden Rundungen
  let s = sdfAus(B, nx, ny, h);
  for (let q = 0; q < n; q++) B[q] = s[q] <= rc ? 1 : 0;
  s = sdfAus(B, nx, ny, h);
  for (let q = 0; q < n; q++) B[q] = s[q] + rc <= 0 ? 1 : 0;
  // Öffnen: schrumpfen, dann wachsen → Außenecken rund, Grate weg
  s = sdfAus(B, nx, ny, h);
  for (let q = 0; q < n; q++) B[q] = s[q] <= -ro ? 1 : 0;
  s = sdfAus(B, nx, ny, h);
  for (let q = 0; q < n; q++) s[q] -= ro;
  s = weich(s, nx, ny, 1.2);
  // außerhalb des Designbereichs kein Material: Maske grob, Startform exakt
  for (let q = 0; q < n; q++) {
    if (!R.erlaubt[q]) s[q] = Math.max(s[q], h);
    if (R.sStart) s[q] = Math.max(s[q], R.sStart[q]); // innerhalb der Startform (genau am Rand: tangential an Augen, die ihn berühren)
    s[q] = Math.min(s[q], R.sKeep[q]);           // Beibehalten exakt (Außenrand der Augen = Kontur)
    // (Kleine Beulen am Augenkreis glättet erst die Linienanpassung – ein Heranziehen hier kerbte die Kontur dort ein,
    // wo eine Kante oder ein Stab auf das Auge trifft.)
    s[q] = Math.max(s[q], -(R.sLoch[q] + DELTA)); // Bohrungen/Hindernisse exakt, um δ kleiner
  }
  return s;
}
const flaecheVon = (s, R) => { let a = 0; for (let q = 0; q < s.length; q++) if (s[q] <= 0) a++; return a * R.h * R.h; };

/* Umriss aus dem Abstandsfeld: Marching Squares (über ein lineares Hilfsfeld 0…1 mit Rand bei 0,5) */
/* Wert eines Feldes an einer beliebigen Stelle (bilinear zwischen den Pixelmitten) */
function feldAn(f, R, p) {
  const u = (p[0] - R.x0) / R.h - 0.5, v = (p[1] - R.y0) / R.h - 0.5;
  const i = Math.max(0, Math.min(R.nx - 2, Math.floor(u))), j = Math.max(0, Math.min(R.ny - 2, Math.floor(v)));
  const a = Math.max(0, Math.min(1, u - i)), b = Math.max(0, Math.min(1, v - j)), q = j * R.nx + i;
  return (1 - a) * (1 - b) * f[q] + a * (1 - b) * f[q + 1] + (1 - a) * b * f[q + R.nx] + a * b * f[q + R.nx + 1];
}
/* Zug entlang der Bogenlänge glätten, ohne ihn schrumpfen zu lassen: (2G − G²)·P – lange Wellen bleiben fast unverändert,
   kurze (Dickenschwankungen der Stäbe, Elementstufen) verschwinden. Punkte auf der exakten Geometrie (Augen, Bohrungen)
   bleiben stehen, mit weichem Übergang daneben. */
function glaetteZug(P, R, sigma) {
  const n = P.length, d = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) || R.h, sp = sigma / d;
  if (n < 8 || sp < 0.5) return P;
  const r = Math.min(Math.floor(n / 2) - 1, Math.ceil(2.5 * sp)), w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-k * k / (2 * sp * sp)));
  const sw = w.reduce((a, b) => a + b, 0);
  const G = Q => Q.map((_, i) => { let x = 0, y = 0; for (let k = -r; k <= r; k++) { const q = Q[(i + k + n) % n]; x += w[k + r] * q[0]; y += w[k + r] * q[1]; } return [x / sw, y / sw]; });
  const g1 = G(P), g2 = G(g1);
  return P.map((p, i) => {
    const fest = Math.min(Math.abs(feldAn(R.sKeep, R, p)), Math.abs(feldAn(R.sLoch, R, p) + DELTA));
    const t = Math.max(0, Math.min(1, (fest - 0.08 * R.he) / (0.6 * R.he))), a = t * t * (3 - 2 * t);
    return zurueck([p[0] + a * (2 * g1[i][0] - g2[i][0] - p[0]), p[1] + a * (2 * g1[i][1] - g2[i][1] - p[1])], R);
  });
}
/* Erlaubter Bereich = Startform ∪ Beibehalten-Geometrie (Augen dürfen über die Startform hinausragen): Abstand > 0 außen */
const aussenVon = (R, p) => Math.min(feldAn(R.sStart, R, p), feldAn(R.sKeep, R, p));
/* Ein Punkt, den das Glätten aus dem erlaubten Bereich geschoben hat, zurück auf dessen Rand (entlang des Gradienten
   des exakten Abstandsfelds) – gerade Kanten am Rand des Designbereichs bleiben gerade */
function zurueck(p, R) {
  if (!R.sStart) return p;
  for (let k = 0; k < 3; k++) {
    const d = aussenVon(R, p);
    if (!(d > 1e-6)) break;
    const e = 0.25 * R.h, gx = (aussenVon(R, [p[0] + e, p[1]]) - aussenVon(R, [p[0] - e, p[1]])) / (2 * e), gy = (aussenVon(R, [p[0], p[1] + e]) - aussenVon(R, [p[0], p[1] - e])) / (2 * e), g = Math.hypot(gx, gy) || 1;
    p = [p[0] - d * gx / g, p[1] - d * gy / g];
  }
  return p;
}
export function umrissAus(s, R, abstandPunkte, sigma = 1.6 * R.he, o = {}) {
  const { nx, ny, h, x0, y0 } = R, x = new Float64Array(nx * ny);
  for (let q = 0; q < x.length; q++) x[q] = Math.max(0, Math.min(1, 0.5 - s[q] / (4 * h)));
  const m = { nelx: nx, nely: ny, hx: h, hy: h, ox: x0, oy: y0 };
  const schleifen = contourAusDichte(x, m, 0.5).filter(l => l.length >= 4);
  const dicht = l => glaetteZug(gleichmaessig(l, 2 * h), R, sigma);
  /* Jede Kontur als Kette aus Geraden und tangentialen Bögen (gd-linien.js). Toleranz 0,1 Element, an der exakten
     Beibehalten-Geometrie (Augen) 0,01 mm – dort sollen die Bögen auf dem echten Kreis liegen. Gespeichert werden die
     Kette (`segmente`, für den Kern) und ein Punktzug daraus (Vorschau, Fläche). Ohne brauchbare Kette: Punktzug wie
     bisher (der Kern legt dann eine Spline-Kurve hindurch). */
  const tolAll = (o.tol ?? 0.3) * R.he;
  const ausZug = P0 => {
    const P = gleichmaessig(P0, 2 * h);
    if (o.linien === false) return { punkte: gleichmaessig(P0, abstandPunkte || 0.8 * R.he) };
    // eine Kontur, an der die Anpassung scheitert, bleibt Punktzug (Spline im Kern) – der Versuch geht nicht verloren
    let k = null;
    try { k = linienBoegen(P, i => (Math.abs(feldAn(R.sKeep, R, P[i])) < 0.1 ? 0.01 : tolAll), { minLinie: 2 * R.he, kreise: R.kreise, kanten: R.kanten, lueckenTol: tolAll, kehlTol: 0.6 * R.he, kehlTolAn: 1.5 * R.he, feld: X => feldAn(s, R, X), debug: o.debug, aussen: R.sStart ? X => aussenVon(R, X) : null }); } catch (_) { k = null; }
    return k ? { punkte: kettePunkte(k, Math.min(0.3, 0.5 * R.he)), segmente: k } : { punkte: gleichmaessig(P0, abstandPunkte || 0.8 * R.he) };
  };
  return flaechenAusSchleifen(schleifen.map(dicht), 0)
    .map(f => {
      const a = ausZug(f.punkte), loecher = f.loecher.map(l => { const b = ausZug(l.punkte); return { ...b, flaeche: Math.abs(polyFlaeche(b.punkte)) }; });
      return { ...a, flaeche: Math.abs(polyFlaeche(a.punkte)), loecher };
    });
}
// geschlossenen Zug nach Bogenlänge gleichmäßig abtasten
export function gleichmaessig(P, d) {
  const n = P.length, L = [0];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; L.push(L[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const ges = L[n], k = Math.max(8, Math.round(ges / d)), out = [];
  let seg = 0;
  for (let t = 0; t < k; t++) {
    const s = t * ges / k;
    while (seg < n - 1 && L[seg + 1] < s) seg++;
    const a = P[seg], b = P[(seg + 1) % n], u = (s - L[seg]) / ((L[seg + 1] - L[seg]) || 1);
    out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
  }
  return out;
}

/* Endform zum Zielanteil: Schwelle per Halbierung so, dass die Fläche dem Ziel entspricht. Glättungsstufen von kräftig
   bis schwach: genommen wird die erste, die nicht mehr Teile ergibt als das rohe Dichtefeld (dünne Stäbe dürfen beim
   Glätten nicht verschwinden). */
export const STUFEN = [
  { rc: 2.5, ro: 0.6, glaetten: 1.2, sigma: 3 },
  { rc: 2, ro: 0.5, glaetten: 0.8, sigma: 2.2 },
  { rc: 1.6, ro: 0.4, glaetten: 0.5, sigma: 1.6 },
  { rc: 1, ro: 0, glaetten: 0, sigma: 1 }
];
export function endform(x, m, anteil, geo, o = {}) {
  const R = formRaster(m, geo), roh = feineDichte(x, m, R);
  let bereich = 0;
  for (let e = 0; e < m.mask.length; e++) if (m.mask[e]) bereich += m.hx * m.hy;
  const ziel = anteil * bereich;
  /* Zusammenhang geht vor Zielfläche: Ziel ist ein Teil je zusammenhängendem Designbereich (meist eins). Eine
     Glättungsstufe zählt nur, wenn die Form dabei nicht zerfällt; schafft das keine Stufe, wird mit der schwächsten die
     Schwelle gesenkt (mehr Werkstoff), bis die Teile wieder zusammenhängen. Die Masse kommt ohnehin aus der Kontur. */
  const teileZiel = Math.max(1, teileVon(Float64Array.from(R.erlaubt, (v, q) => (v || R.sKeep[q] <= 0 ? -1 : 1)), R));
  const stufen = o.stufe ? [o.stufe] : STUFEN;
  let erg = null, letzte = null;
  for (const st of stufen) {
    // das projizierte Feld ist fast 0/1 mit Elementstufen – vor der Schwelle weichzeichnen
    const F = st.glaetten ? weich(roh, R.nx, R.ny, st.glaetten * K) : roh;
    let lo = 0.02, hi = 0.98, best = null;
    for (let k = 0; k < 16; k++) {
      const t = (lo + hi) / 2, s = formFeld(F, R, t, st), A = flaecheVon(s, R);
      if (!best || Math.abs(A - ziel) < Math.abs(best.A - ziel)) best = { t, s, A };
      if (A > ziel) lo = t; else hi = t;
      if (Math.abs(A - ziel) < 0.002 * ziel) break;
    }
    letzte = { st, F, best };
    if (teileVon(best.s, R) <= teileZiel) { erg = { st, F, best }; break; }
  }
  if (!erg) {
    // Schwelle senken: größte Schwelle unter der flächengerechten, bei der die Form zusammenhängt
    const { st, F, best } = letzte;
    let lo = 0.02, hi = best.t, gut = null;
    const s0 = formFeld(F, R, lo, st);
    if (teileVon(s0, R) <= teileZiel) {
      gut = { t: lo, s: s0 };
      for (let k = 0; k < 12; k++) {
        const t = (lo + hi) / 2, s2 = formFeld(F, R, t, st);
        if (teileVon(s2, R) <= teileZiel) { gut = { t, s: s2 }; lo = t; } else hi = t;
      }
    }
    erg = { st, F, best: gut || best, zusammen: !!gut };
  }
  const bau = b => ({ R, feld: b.s, schwelle: b.t, stufe: erg.st, flaechen: umrissAus(b.s, R, o.abstand, erg.st.sigma * R.he, o) });
  let res = bau(erg.best);
  /* Geraden und Kehlen setzen Werkstoff an oder nehmen ihn weg (Kehlen füllen Dellen großzügig): die Fläche der fertigen
     Kontur auf das Ziel nachführen – Schwelle um den gemessenen Unterschied verschieben, zwei Runden. Nicht, wenn die
     Schwelle schon für den Zusammenhang gesenkt wurde. */
  const netto = fl => fl.reduce((a, f) => a + f.flaeche - f.loecher.reduce((b, h) => b + h.flaeche, 0), 0);
  for (let runde = 0; runde < 2 && !erg.zusammen; runde++) {
    const A = netto(res.flaechen);
    if (Math.abs(A - ziel) < 0.004 * ziel) break;
    const zielFeld = flaecheVon(res.feld, R) - (A - ziel);
    let lo = 0.02, hi = 0.98, b2 = null;
    for (let k = 0; k < 16; k++) {
      const t = (lo + hi) / 2, s2 = formFeld(erg.F, R, t, erg.st), A2 = flaecheVon(s2, R);
      if (!b2 || Math.abs(A2 - zielFeld) < Math.abs(b2.A - zielFeld)) b2 = { t, s: s2, A: A2 };
      if (A2 > zielFeld) lo = t; else hi = t;
      if (Math.abs(A2 - zielFeld) < 0.001 * ziel) break;
    }
    if (teileVon(b2.s, R) > teileZiel) break;
    const neu = bau(b2);
    if (Math.abs(netto(neu.flaechen) - ziel) >= Math.abs(A - ziel)) break;
    res = neu;
  }
  // Feld der wirklich entstehenden Kontur (Geraden und Bögen weichen bis 0,3 Element vom geglätteten Feld ab):
  // daraus rechnen Masse, Spannung und Knicken
  res.feldEnd = feldAusFlaechen(res.flaechen, R);
  return res;
}

/* Anzahl zusammenhängender Pixelgebiete mit s ≤ 0 (4er-Nachbarschaft); Splitter unter 4 Elementflächen zählen nicht */
function teileVon(s, R) {
  const { nx, ny } = R, seen = new Uint8Array(nx * ny), stack = [], klein = 4 * K * K;
  let n = 0;
  for (let q0 = 0; q0 < s.length; q0++) {
    if (seen[q0] || !(s[q0] <= 0)) continue;
    let groesse = 0;
    seen[q0] = 1; stack.push(q0);
    while (stack.length) {
      const q = stack.pop(), i = q % nx, j = (q - i) / nx;
      groesse++;
      if (i > 0 && !seen[q - 1] && s[q - 1] <= 0) { seen[q - 1] = 1; stack.push(q - 1); }
      if (i < nx - 1 && !seen[q + 1] && s[q + 1] <= 0) { seen[q + 1] = 1; stack.push(q + 1); }
      if (j > 0 && !seen[q - nx] && s[q - nx] <= 0) { seen[q - nx] = 1; stack.push(q - nx); }
      if (j < ny - 1 && !seen[q + nx] && s[q + nx] <= 0) { seen[q + nx] = 1; stack.push(q + nx); }
    }
    if (groesse >= klein) n++;
  }
  return n;
}

/* Pixelmenge einer Kontur (gerade-ungerade über Außen- und Lochzüge): −1 innen, +1 außen */
export function feldAusFlaechen(flaechen, R) {
  const { nx, ny, h, x0, y0 } = R, s = new Float64Array(nx * ny).fill(1);
  const zuege = flaechen.flatMap(f => [f.punkte, ...f.loecher.map(l => l.punkte)]);
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * h, xs = [];
    for (const P of zuege) for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / h - 0.5));
      for (let i = i0; i <= i1; i++) s[j * nx + i] = -1;
    }
  }
  return s;
}

/* Endform auf das FE-Raster zurück: Anteil jedes Elements, der in der Form liegt (für die Nachrechnung) */
export function elementAnteile(s, R, m) {
  const a = new Float64Array(m.nelx * m.nely), n = new Float64Array(m.nelx * m.nely);
  for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) {
    const ex = Math.floor((R.x0 + (i + 0.5) * R.h - m.ox) / m.hx), ey = Math.floor((R.y0 + (j + 0.5) * R.h - m.oy) / m.hy);
    if (ex < 0 || ey < 0 || ex >= m.nelx || ey >= m.nely) continue;
    const e = ey * m.nelx + ex;
    n[e]++;
    if (s[j * R.nx + i] <= 0) a[e]++;
  }
  for (let e = 0; e < a.length; e++) a[e] = n[e] ? a[e] / n[e] : 0;
  return a;
}
