// cantcodecad – Topologieoptimierung (hier zwei-dimensional).
// Reiner Rechenkern: Raster herein, Dichten und Umriss heraus. Kennt weder Oberfläche noch OpenCASCADE.
// Einheiten wie im Dokument: mm, N, MPa (N/mm²) – E in N/mm², Kraft in N, Weg in mm.
//
// Verfahren: ebenes Spannungsproblem mit Q4-Elementen (2×2-Integration), Materialverteilung nach
// SIMP (Dichte ρ pro Element, E(ρ) = E0 + ρ^p·(E−E0)), Dichte- und Empfindlichkeitsfilter,
// Volumenziel mit Optimality-Criteria-Update. Gelöst wird jedes Zwischenspiel mit CG.

/* Typische Steifigkeiten der Werkstoffe (E in MPa, Querkontraktionszahl). Näherungswerte –
   wie die Dichten in doc.js als Richtwert für die Berechnung, nicht als Prüfzeugnis. */
/* fy = Streckgrenze bzw. Festigkeit in MPa für den Sicherheitsfaktor (Stahl S235, Edelstahl 1.4301, Alu EN AW-6082 T6,
   Kunststoffe gedruckt eher vorsichtig) – Richtwerte wie die Dichten, kein Prüfzeugnis */
export const ELASTIC = {
  none: { E: 210000, nu: 0.3, fy: 235 },
  steel: { E: 210000, nu: 0.3, fy: 235 },
  stainless: { E: 193000, nu: 0.31, fy: 210 },
  alu: { E: 69000, nu: 0.33, fy: 250 },
  brass: { E: 105000, nu: 0.34, fy: 200 },
  copper: { E: 110000, nu: 0.34, fy: 70 },
  pla: { E: 3500, nu: 0.35, fy: 40 },
  petg: { E: 2100, nu: 0.37, fy: 35 },
  abs: { E: 2300, nu: 0.35, fy: 30 },
  tpu: { E: 30, nu: 0.45, fy: 8 },
  nylon: { E: 1700, nu: 0.35, fy: 40 },
  wood: { E: 10000, nu: 0.35, fy: 30 }
};
export const elasticOf = m => ELASTIC[m] || ELASTIC.none;

const NODE = (nelx, i, j) => j * (nelx + 1) + i;
const EIDX = (nelx, i, j) => j * nelx + i;

/* ---------- Element-Steifigkeit: Q4-Rechteck, ebenes Spannungsproblem, Dicke 1 ----------
   Einheitssteifigkeit mit E = 1; die Materialdichte skaliert sie später als Zahl. */
function q4unit(hx, hy, nu) {
  const D = [1, nu, 0, nu, 1, 0, 0, 0, (1 - nu) / 2].map(v => v / (1 - nu * nu));
  const k = new Float64Array(64), g = 1 / Math.sqrt(3), detJ = hx * hy / 4;
  for (const [xi, eta] of [[-g, -g], [g, -g], [-g, g], [g, g]]) {
    // Formfunktionen der Knoten in Reihenfolge (i,j) (i+1,j) (i+1,j+1) (i,j+1) – gegen den Uhrzeigersinn
    const dN = [[-(1 - eta) / 4, -(1 - xi) / 4], [(1 - eta) / 4, -(1 + xi) / 4], [(1 + eta) / 4, (1 + xi) / 4], [-(1 + eta) / 4, (1 - xi) / 4]];
    const B = new Float64Array(24); // 3 Zeilen (ex, ey, xy) × 8 Spalten
    for (let a = 0; a < 4; a++) {
      const dx = dN[a][0] * 2 / hx, dy = dN[a][1] * 2 / hy;
      B[2 * a] = dx; B[8 + 2 * a + 1] = dy; B[16 + 2 * a] = dy; B[16 + 2 * a + 1] = dx;
    }
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      let s = 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += B[r * 8 + a] * D[r * 3 + c] * B[c * 8 + b];
      k[a * 8 + b] += s * detJ;
    }
  }
  return k;
}

/* ---------- Tragwerk: Raster, Lasten, Halterungen ----------
   lasten/stützen werden in Modellkoordinaten angegeben und auf den nächsten Rasterknoten gesetzt.
   Die Rollen der Markierungspunkte sind dieselben Bezeichnungen, die auch Dialog und Kern benutzen. */
export const ROLLEN = [
  ['last', 'Kraft'],
  ['fest', 'Einspannung (Wege in x und y gesperrt)'],
  ['rolle-x', 'Hält in x (y ist frei)'],
  ['rolle-y', 'Hält in y (x ist frei)'],
  ['bereich', 'Bereich bleibt erhalten'],
];
export const ROLLEN_KURZ = { last: 'Kraft', fest: 'Einspannung', 'rolle-x': 'Halten x', 'rolle-y': 'Halten y', bereich: 'erhalten' };
export function makeModel(o) {
  const nelx = Math.max(2, Math.round(o.nelx)), nely = Math.max(2, Math.round(o.nely));
  const hx = o.hx, hy = o.hy, ox = o.ox || 0, oy = o.oy || 0;
  const nE = nelx * nely, nNode = (nelx + 1) * (nely + 1), nDof = nNode * 2;
  // Kopie: unten fallen Teile ohne Halterung heraus, das Feld des Aufrufers bleibt unberührt
  const mask = o.mask instanceof Uint8Array && o.mask.length === nE ? Uint8Array.from(o.mask) : new Uint8Array(nE).fill(1);
  const keep = o.keep instanceof Uint8Array && o.keep.length === nE ? o.keep : new Uint8Array(nE);
  // nächstliegender Rasterknoten: Lasten und Halterungen treffen immer einen Knoten des Netzes
  const nodeAt = (x, y) => NODE(nelx,
    Math.min(nelx, Math.max(0, Math.round((x - ox) / hx))),
    Math.min(nely, Math.max(0, Math.round((y - oy) / hy))));
  /* Knoten mit Material: nur dort darf eine Last oder Halterung angreifen. Liegt der Punkt in einem Loch
     (typisch: Mitte einer Bohrung), gilt der ganze Lochrand – wie ein Bolzen, der die Kraft auf die Bohrungswand
     verteilt. Liegt er außerhalb der Fläche, der nächste Knoten mit Material. */
  const aktiv = new Uint8Array(nNode);
  for (let e = 0; e < nE; e++) {
    if (!mask[e]) continue;
    const i = e % nelx, j = (e - i) / nelx;
    aktiv[NODE(nelx, i, j)] = aktiv[NODE(nelx, i + 1, j)] = aktiv[NODE(nelx, i + 1, j + 1)] = aktiv[NODE(nelx, i, j + 1)] = 1;
  }
  if (!aktiv.some(v => v)) throw new Error('Der Designbereich ist leer');
  const angriff = (x, y) => {
    const n0 = nodeAt(x, y);
    if (aktiv[n0]) return [n0];
    // Hohlraum um den Punkt füllen (Knoten ohne Material, 4er-Nachbarschaft); erreicht er den Rasterrand, ist es kein Loch
    const seen = new Uint8Array(nNode), stack = [n0], rand = new Set();
    let offen = false;
    seen[n0] = 1;
    while (stack.length) {
      const n = stack.pop(), i = n % (nelx + 1), j = (n - i) / (nelx + 1);
      if (i === 0 || j === 0 || i === nelx || j === nely) offen = true;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (a < 0 || b < 0 || a > nelx || b > nely) continue;
        const q = NODE(nelx, a, b);
        if (seen[q]) continue;
        seen[q] = 1;
        if (aktiv[q]) rand.add(q); else stack.push(q);
      }
    }
    if (!offen && rand.size) return [...rand];
    let best = -1, bd = Infinity;
    for (let n = 0; n < nNode; n++) {
      if (!aktiv[n]) continue;
      const i = n % (nelx + 1), j = (n - i) / (nelx + 1), d = Math.hypot(ox + i * hx - x, oy + j * hy - y);
      if (d < bd) { bd = d; best = n; }
    }
    return [best];
  };
  /* Angriffsknoten: ein Punkt (x, y) oder eine Punktliste `punkte` (z. B. die Wand einer Bohrung im Schnitt) –
     jede Stelle auf ihren Knoten, doppelte zusammengefasst */
  const knoten = a => {
    const pts = Array.isArray(a.punkte) && a.punkte.length ? a.punkte : [[a.x, a.y]];
    return [...new Set(pts.flatMap(q => angriff(q[0], q[1])))];
  };
  const fix = new Uint8Array(nDof);
  for (const s of o.stuetzen || []) {
    for (const n of knoten(s)) {
      if (s.art === 'fest') { fix[2 * n] = 1; fix[2 * n + 1] = 1; }
      else if (s.art === 'rolle-x') fix[2 * n] = 1;
      else if (s.art === 'rolle-y') fix[2 * n + 1] = 1;
    }
  }
  // Lastfälle: je Fall ein Lastvektor (alle Lastfälle gleich gewichtet); `lasten` allein = ein Fall
  const faelle = Array.isArray(o.lastfaelle) && o.lastfaelle.length ? o.lastfaelle : [o.lasten || []];
  const loads = faelle.map(fall => {
    const v = new Float64Array(nDof);
    for (const l of fall) {
      const ns = knoten(l), k = 1 / ns.length;
      for (const n of ns) { v[2 * n] += (Number(l.fx) || 0) * k; v[2 * n + 1] += (Number(l.fy) || 0) * k; }
    }
    return v;
  });
  const load = new Float64Array(nDof);
  loads.forEach(v => { for (let d = 0; d < nDof; d++) load[d] += Math.abs(v[d]); }); // nur für Prüfungen: wo greift überhaupt etwas an
  /* Zusammenhang: Elemente, die über eine Kante aneinanderstoßen, bilden ein Teil. Ein Teil mit Kraft, aber ohne
     Halterung, kann nichts tragen (das System wäre singulär) – klar melden. Teile ganz ohne Kraft und Halterung
     fallen heraus, sie würden das System ebenfalls singulär machen. */
  const teil = new Int32Array(nE).fill(-1);
  let nTeile = 0;
  for (let e0 = 0; e0 < nE; e0++) {
    if (!mask[e0] || teil[e0] >= 0) continue;
    const stapel = [e0];
    teil[e0] = nTeile;
    while (stapel.length) {
      const e = stapel.pop(), i = e % nelx, j = (e - i) / nelx;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (a < 0 || b < 0 || a >= nelx || b >= nely) continue;
        const q = EIDX(nelx, a, b);
        if (mask[q] && teil[q] < 0) { teil[q] = nTeile; stapel.push(q); }
      }
    }
    nTeile++;
  }
  const halt = new Uint8Array(nTeile), kraft = new Uint8Array(nTeile);
  for (let e = 0; e < nE; e++) {
    if (!mask[e]) continue;
    const i = e % nelx, j = (e - i) / nelx;
    for (const n of [NODE(nelx, i, j), NODE(nelx, i + 1, j), NODE(nelx, i + 1, j + 1), NODE(nelx, i, j + 1)]) {
      if (fix[2 * n] || fix[2 * n + 1]) halt[teil[e]] = 1;
      if (load[2 * n] || load[2 * n + 1]) kraft[teil[e]] = 1;
    }
  }
  for (let t = 0; t < nTeile; t++) if (kraft[t] && !halt[t]) {
    throw new Error(`Eine Kraft hängt mit keiner Halterung zusammen – der Designbereich besteht aus ${nTeile} getrennten Flächen. Den Designbereich so wählen, dass Kraft und Halterungen auf einer zusammenhängenden Fläche liegen (z. B. eine Fläche des Körpers oder die äußere Kontur der Skizze).`);
  }
  for (let e = 0; e < nE; e++) if (mask[e] && !halt[teil[e]]) mask[e] = 0;
  const fixed = [], free = [];
  for (let d = 0; d < nDof; d++) (fix[d] ? fixed : free).push(d);
  if (!free.length) throw new Error('Das Tragwerk ist vollständig gehalten');
  if (!load.some(v => Math.abs(v) > 0)) throw new Error('Es fehlt eine Last');
  /* Knotennummern je Element und das Spaltenmuster der Steifigkeitsmatrix hängen nur am Raster
     und an den Halterungen – einmal bauen, bei jeder Iteration nur die Werte neu eintragen. */
  const dofsOf = new Int32Array(nE * 8);
  for (let e = 0; e < nE; e++) {
    const i = e % nelx, j = (e - i) / nelx;
    const a = NODE(nelx, i, j), b = NODE(nelx, i + 1, j), c = NODE(nelx, i + 1, j + 1), d = NODE(nelx, i, j + 1);
    [2 * a, 2 * a + 1, 2 * b, 2 * b + 1, 2 * c, 2 * c + 1, 2 * d, 2 * d + 1].forEach((v, k) => { dofsOf[e * 8 + k] = v; });
  }
  /* Spaltenmuster der Steifigkeitsmatrix: gehaltene Zeilen und Spalten fallen ganz weg
     (dort ist die Verschiebung ohnehin 0), damit das System auf die freien Freiheitsgrade schrumpft. */
  const row = new Int32Array(nDof + 1);
  for (let e = 0; e < nE; e++) {
    if (!mask[e]) continue;
    for (let a = 0; a < 8; a++) {
      const r = dofsOf[e * 8 + a];
      if (fix[r]) continue;
      for (let b = 0; b < 8; b++) if (!fix[dofsOf[e * 8 + b]]) row[r + 1]++;
    }
  }
  for (let r = 0; r < nDof; r++) row[r + 1] += row[r];
  const col = new Int32Array(row[nDof]), elemOf = new Int32Array(row[nDof]), kOf = new Int32Array(row[nDof]);
  const at = row.slice(0, nDof);
  for (let e = 0; e < nE; e++) {
    if (!mask[e]) continue;
    for (let a = 0; a < 8; a++) {
      const r = dofsOf[e * 8 + a];
      if (fix[r]) continue;
      for (let b = 0; b < 8; b++) {
        const c = dofsOf[e * 8 + b];
        if (fix[c]) continue;
        const p = at[r]++;
        col[p] = c; elemOf[p] = e; kOf[p] = a * 8 + b;
      }
    }
  }
  // Zeilen nach Spaltennummer sortieren (für die Zerlegung nötig, kurze Zeilen → Einfügensortieren)
  for (let r = 0; r < nDof; r++) {
    const a = row[r], b = row[r + 1];
    for (let i = a + 1; i < b; i++) {
      const c = col[i], em = elemOf[i], kk = kOf[i];
      let j = i - 1;
      while (j >= a && col[j] > c) { col[j + 1] = col[j]; elemOf[j + 1] = elemOf[j]; kOf[j + 1] = kOf[j]; j--; }
      col[j + 1] = c; elemOf[j + 1] = em; kOf[j + 1] = kk;
    }
  }
  // Lage der Diagonaleinträge erst nach dem Sortieren merken (vorher zeigten sie auf verschobene Einträge)
  const dp = [], dr = [];
  for (let r = 0; r < nDof; r++) for (let p = row[r]; p < row[r + 1]; p++) if (col[p] === r) { dp.push(p); dr.push(r); }
  /* Muster der unteren Dreiecksmatrix (IC(0)) und der Zugriff spaltenweise für die Rückwärtsschritte */
  const lrow = new Int32Array(nDof + 1);
  for (let r = 0; r < nDof; r++) for (let p = row[r]; p < row[r + 1]; p++) if (col[p] <= r) lrow[r + 1]++;
  for (let r = 0; r < nDof; r++) lrow[r + 1] += lrow[r];
  const lcol = new Int32Array(lrow[nDof]);
  for (let r = 0; r < nDof; r++) {
    let q = lrow[r];
    for (let p = row[r]; p < row[r + 1]; p++) if (col[p] <= r) lcol[q++] = col[p];
  }
  const ltrow = new Int32Array(nDof + 1);
  for (let q = 0; q < lcol.length; q++) ltrow[lcol[q] + 1]++;
  for (let j = 0; j < nDof; j++) ltrow[j + 1] += ltrow[j];
  const ltEntry = new Int32Array(ltrow[nDof]), ltZeile = new Int32Array(ltrow[nDof]);
  const at2 = ltrow.slice(0, nDof);
  for (let r = 0; r < nDof; r++) for (let q = lrow[r]; q < lrow[r + 1]; q++) {
    const t = at2[lcol[q]]++;
    ltEntry[t] = q; ltZeile[t] = r;
  }
  // Zeilen der gehaltenen Freiheitsgrade bleiben extra erhalten: daraus werden die Lagerkräfte
  const frow = new Int32Array(nDof + 1);
  for (let e = 0; e < nE; e++) {
    if (!mask[e]) continue;
    for (let a = 0; a < 8; a++) { const r = dofsOf[e * 8 + a]; if (fix[r]) frow[r + 1] += 8; }
  }
  for (let r = 0; r < nDof; r++) frow[r + 1] += frow[r];
  const fcol = new Int32Array(frow[nDof]), fElem = new Int32Array(frow[nDof]), fK = new Int32Array(frow[nDof]);
  const at3 = frow.slice(0, nDof);
  for (let e = 0; e < nE; e++) {
    if (!mask[e]) continue;
    for (let a = 0; a < 8; a++) {
      const r = dofsOf[e * 8 + a];
      if (!fix[r]) continue;
      for (let b = 0; b < 8; b++) {
        const p = at3[r]++;
        fcol[p] = dofsOf[e * 8 + b]; fElem[p] = e; fK[p] = a * 8 + b;
      }
    }
  }
  return {
    nelx, nely, hx, hy, ox, oy, nE, nNode, nDof, mask, keep, fix, load, loads, fixed, free, nodeAt,
    dofsOf, row, col, elemOf, kOf, diagP: Int32Array.from(dp), diagR: Int32Array.from(dr),
    lrow, lcol, ltrow, ltEntry, ltZeile, frow, fcol, fElem, fK
  };
}

/* ---------- Steifigkeitsmatrix: Muster steht im Modell, hier kommen nur die Werte ----------
   (Zeilen gehaltener Freiheitsgrade fehlen; ihre Einheitszeile steckt in der Diagonale) */
function assemble(m, k0, scale) {
  const { row, col, elemOf, kOf, diagP, diagR } = m;
  const val = new Float64Array(col.length);
  for (let p = 0; p < val.length; p++) val[p] = k0[kOf[p]] * scale[elemOf[p]];
  const diag = new Float64Array(m.nDof);
  for (let i = 0; i < diagP.length; i++) diag[diagR[i]] += val[diagP[i]];
  for (const d of m.fixed) diag[d] = 1;
  return { row, col, val, diag, n: m.nDof };
}

function matvec(K, m, x, y) {
  y.fill(0);
  for (let r = 0; r < K.n; r++) {
    let s = 0;
    for (let q = K.row[r]; q < K.row[r + 1]; q++) s += K.val[q] * x[K.col[q]];
    y[r] = s;
  }
  return y;
}

/* ---------- Unvollständige LDLᵗ-Zerlegung IC(0) als Vorconditionierung ----------
   Gleiche Besetzung wie die Matrix, kein Auffüllen, ohne Wurzel (Ldiag trägt D).
   Die Steifigkeitsmatrix der Elastizität ist keine M-Matrix, deshalb bricht IC(0) ohne
   Verschiebung oft ab (negative Pivotwerte). Mit „verschiebung" wird ein Anteil der
   Zeilensumme auf die Diagonale geschlagen – die Zerlegung bleibt positiv. */
function zerlegung(m, K, verschiebung = 0, sicher = false) {
  const n = m.nDof, { lrow, lcol, ltrow, ltEntry, ltZeile, row, col } = m;
  const L = new Float64Array(lcol.length), Ldiag = new Float64Array(n);
  const w = new Float64Array(n), marke = new Int32Array(n);
  let folge = 0;
  const beruehrt = [];
  for (let i = 0; i < n; i++) {
    if (m.fix[i]) continue;
    if (row[i] === row[i + 1]) { Ldiag[i] = 1; continue; }   // Freiheitsgrad ohne Element (Rand eines Hohlraums)
    beruehrt.length = 0;
    folge++;
    const notieren = x => { if (marke[x] !== folge) { marke[x] = folge; beruehrt.push(x); } };
    let rand = 0;
    for (let p = row[i]; p < row[i + 1]; p++) {
      w[col[p]] += K.val[p]; notieren(col[p]);
      if (col[p] !== i) rand += Math.abs(K.val[p]);
    }
    let fehlgeschlagen = false;
    for (let q = lrow[i]; q < lrow[i + 1]; q++) {
      const j = lcol[q];
      if (j === i) continue;
      let v = w[j] / Ldiag[j];
      if (!Number.isFinite(v)) { if (!sicher) { fehlgeschlagen = true; break; } v = 0; }
      L[q] = v;
      /* Rest abziehen: L[i][j] · D[j] · L[c][j] für die Zeilen c mit j < c ≤ i.
         c = i ist der Abzug für die Diagonale, c > i gehört zur oberen Hälfte. */
      const vd = w[j];
      for (let t = ltrow[j]; t < ltrow[j + 1]; t++) {
        const c = ltZeile[t];
        if (c <= j || c > i) continue;
        w[c] -= vd * L[ltEntry[t]];
        notieren(c);
      }
    }
    const piv = w[i] + verschiebung * rand;
    if (fehlgeschlagen || !(piv > 1e-12 * (K.diag[i] || 1))) {
      if (!sicher) { for (const x of beruehrt) w[x] = 0; return null; }
      Ldiag[i] = Math.max(rand, 1) * 1e-9;   // Notnagel: schwach, aber positiv
    } else Ldiag[i] = piv;
    for (const x of beruehrt) w[x] = 0;
  }
  return { L, Ldiag };
}

/* versucht es erst ohne, dann mit Verschiebung; zuletzt mit Notnägeln, damit immer
   eine Vorconditionierung da ist */
function versucheZerlegung(m, K) {
  for (const vs of [0, 0.02, 0.25, 1]) { const P = zerlegung(m, K, vs); if (P) return P; }
  return zerlegung(m, K, 1, true);
}

/* z = (L·D·Lᵗ)⁻¹ r – Vorwärtsschub mit Division durch D, Rückwärtsschub ohne */
function vorgabe(m, P, r, out) {
  const { lrow, lcol, ltrow, ltEntry, ltZeile } = m;
  out.fill(0);
  for (let i = 0; i < m.nDof; i++) {
    if (m.fix[i]) continue;
    let s = r[i];
    for (let q = lrow[i]; q < lrow[i + 1]; q++) {
      const j = lcol[q];
      if (j === i) break;
      s -= P.L[q] * out[j];
    }
    out[i] = s;
  }
  for (let i = m.nDof - 1; i >= 0; i--) {
    if (m.fix[i]) continue;
    let s = out[i] / P.Ldiag[i];
    for (let t = ltrow[i]; t < ltrow[i + 1]; t++) {
      const rr = ltZeile[t];
      if (rr !== i) s -= P.L[ltEntry[t]] * out[rr];
    }
    out[i] = s;
  }
  return out;
}

/* Gelöste Gleichung: CG mit IC(0), hilfsweise Jacobi. Die gehaltener Freiheitsgrade bleiben
   mit Einheitszeile im System – so sind alle Schleifen durchlaufend, was deutlich schneller ist.
   Die Restnorm wird nur alle 25 Schritte nachgerechnet, zwischendurch reicht die fortgeschriebene.
   Mit u0 (der Lösung des vorigen Optimierungsschrittes) braucht der CG deutlich weniger Schritte. */
function solveCG(K, f, m, tol = 1e-9, maxIt = 40000, u0 = null, Pfest = null) {
  const n = K.n, u = u0 ? Float64Array.from(u0) : new Float64Array(n);
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  const normR = () => { let s = 0; for (let i = 0; i < n; i++) s += r[i] * r[i]; return Math.sqrt(s); };
  if (u0) {
    matvec(K, m, u, Ap);
    for (let i = 0; i < n; i++) r[i] = f[i] - Ap[i];
  } else for (let i = 0; i < n; i++) r[i] = f[i];
  const b0 = Math.sqrt(f.reduce((s, v) => s + v * v, 0)) || 1;
  let rz = 0;
  let P = Pfest || versucheZerlegung(m, K);
  if (P) vorgabe(m, P, r, z);
  for (let i = 0; i < n; i++) rz += r[i] * z[i];
  // Zerlegung numerisch unbrauchbar (Überlauf bei fast leeren Bereichen): Jacobi statt Abbruch
  if (!P || !Number.isFinite(rz)) {
    P = null; rz = 0;
    for (let i = 0; i < n; i++) { z[i] = r[i] / (K.diag[i] || 1); rz += r[i] * z[i]; }
  }
  for (let i = 0; i < n; i++) p[i] = z[i];
  let it = 0, res = 1;
  while (it < maxIt && rz > 1e-300) {
    it++;
    matvec(K, m, p, Ap);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (!(pAp > 1e-30)) break;
    const a = rz / pAp;
    for (let i = 0; i < n; i++) { u[i] += a * p[i]; r[i] -= a * Ap[i]; }
    if (it % 25 === 0) {
      res = normR() / b0;
      if (res < tol) break;
    }
    if (P) vorgabe(m, P, r, z);
    else for (let i = 0; i < n; i++) z[i] = r[i] / (K.diag[i] || 1);
    let rz2 = 0;
    for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const b = rz2 / rz;
    for (let i = 0; i < n; i++) p[i] = z[i] + b * p[i];
    rz = rz2;
  }
  return { u, it, res: normR() / b0 };
}

/* ---------- Dichtefilter (TOP99-Art): weiche Grenzen, kein Schachbrett ---------- */
function buildFilter(m, rmin) {
  const { nelx, nely, nE } = m, R = Math.max(0.5, rmin);
  const rowStart = new Int32Array(nE + 1), idx = [], w = [];
  for (let e = 0; e < nE; e++) {
    const i = e % nelx, j = (e - i) / nelx;
    const s = Math.ceil(R);
    for (let dj = -s; dj <= s; dj++) for (let di = -s; di <= s; di++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nelx || b >= nely) continue;
      const d = Math.hypot(di, dj);
      if (d >= R) continue;
      idx.push(EIDX(nelx, a, b)); w.push(R - d);
    }
    rowStart[e + 1] = idx.length;
  }
  const sum = new Float64Array(nE);
  for (let e = 0; e < nE; e++) for (let q = rowStart[e]; q < rowStart[e + 1]; q++) sum[e] += w[q];
  return { rowStart, idx: Int32Array.from(idx), w: Float64Array.from(w), sum };
}
const applyFilter = (F, xOut, xIn) => {
  for (let e = 0; e < F.sum.length; e++) {
    let s = 0;
    for (let q = F.rowStart[e]; q < F.rowStart[e + 1]; q++) s += F.w[q] * xIn[F.idx[q]];
    xOut[e] = s / F.sum[e];
  }
};
/* Empfindlichkeiten zurückfiltern (gleiche Gewichte, transponiert) */
const applyFilterT = (F, out, in_) => {
  out.fill(0);
  for (let e = 0; e < F.sum.length; e++) {
    const s = 1 / F.sum[e];
    for (let q = F.rowStart[e]; q < F.rowStart[e + 1]; q++) out[F.idx[q]] += F.w[q] * in_[e] * s;
  }
};

/* ---------- Optimierung ----------
   o: { nelx, nely, hx, hy, ox, oy, mask, keep, lasten, stuetzen, dichte (Zielanteil 0..1),
        abstrafung (SIMP p), filter (Radius in Elementen), wiederholungen, E, nu, dicke, eben,
        projektion (Heaviside, Vorgabe an), betaMax (Schärfe am Ende, Vorgabe 16) }
   Heaviside-Projektion (Guest/Wang/Sigmund): die gefilterte Dichte x̃ wird über eine glatte Stufe
   xPhys = (tanh(βη) + tanh(β(x̃−η))) / (tanh(βη) + tanh(β(1−η))) gegen 0/1 gedrückt; β wächst stufenweise
   (Fortsetzung), sonst bleibt die Optimierung in einem schlechten Nebenminimum hängen. Ohne Projektion bleibt
   ein breiter Graubereich, dessen Umriss deutlich mehr Fläche hat als der gerechnete Anteil. */
export function topOptimize(o) {
  const m = makeModel(o);
  const E = Number(o.E) || 210000, nu = Math.min(0.49, Math.max(0.05, Number(o.nu) || 0.3));
  const p = Math.min(6, Math.max(1, Number(o.abstrafung) || 3));
  const rmin = Math.min(6, Math.max(0.6, Number(o.filter) || 1.6));
  const iters = Math.min(500, Math.max(5, Math.round(Number(o.wiederholungen) || 60)));
  // Steifigkeit leerer Elemente als Bruchteil von E: 1/1000 hält den Hohlraum weich und die Matrix gutartig
  const E0 = E * Math.min(0.1, Math.max(1e-9, Number(o.leersteifigkeit) || 1e-3));
  const dick = Math.max(1e-3, Number(o.dicke) || 1);
  // Gewicht je Element auf die Nachgiebigkeit (gewichtete Nachgiebigkeit): > 1 = dort lohnt Material mehr – so werden
  // z. B. knickgefährdete Druckstäbe kräftiger, ohne die Masse zu ändern
  const gewicht = o.gewicht instanceof Float64Array && o.gewicht.length === m.nE ? o.gewicht : null;
  const k0 = q4unit(m.hx, m.hy, nu);
  const F = buildFilter(m, rmin);
  const design = [], nDomain = m.mask.reduce((s, v) => s + (v ? 1 : 0), 0);
  for (let e = 0; e < m.nE; e++) if (m.mask[e] && !m.keep[e]) design.push(e);
  const nKeep = m.mask.reduce((s, v, e) => s + (v && m.keep[e] ? 1 : 0), 0);
  if (!design.length) throw new Error('Es bleibt nichts zum Optimieren – der Zielanteil ist zu hoch');
  const ziel = Math.max(0, Math.min(1, Number(o.dichte) || 0.4)) * nDomain - nKeep;
  if (ziel < 0) throw new Error('Die erhaltenen Bereiche sind größer als der Zielanteil');
  let x = new Float64Array(m.nE), xPhys = new Float64Array(m.nE);
  const xTil = new Float64Array(m.nE), dProj = new Float64Array(m.nE), eta = 0.5;
  const proj = o.projektion !== false, betaMax = Math.min(64, Math.max(1, Number(o.betaMax) || 16));
  let beta = proj ? 1 : 0;
  // gleich lange Stufen 1, 2, 4 … betaMax; die letzte Stufe darf bis zum Ende laufen
  const stufe = Math.max(6, Math.floor(iters / (Math.log2(betaMax) + 1)));
  /* gefiltert → projiziert, dazu die Ableitung dxPhys/dx̃; erhaltene und leere Elemente bleiben fest */
  const physik = (xin, out, dOut) => {
    applyFilter(F, xTil, xin);
    const tb = beta ? Math.tanh(beta * eta) : 0, nenner = beta ? tb + Math.tanh(beta * (1 - eta)) : 1;
    for (let e = 0; e < m.nE; e++) {
      if (m.keep[e] || !m.mask[e]) { out[e] = m.keep[e] ? 1 : 0; if (dOut) dOut[e] = 0; continue; }
      if (!beta) { out[e] = xTil[e]; if (dOut) dOut[e] = 1; continue; }
      const t = Math.tanh(beta * (xTil[e] - eta));
      out[e] = (tb + t) / nenner;
      if (dOut) dOut[e] = beta * (1 - t * t) / nenner;
    }
  };
  for (let e = 0; e < m.nE; e++) x[e] = m.keep[e] ? 1 : (m.mask[e] ? Math.max(1e-3, Math.min(1, ziel / design.length)) : 0);
  physik(x, xPhys, dProj);
  const hist = [];
  let lastC = null, used = 0, uVor = null; // uVor: Lösungen je Lastfall
  const skalar = () => {
    const scale = new Float64Array(m.nE);
    for (let e = 0; e < m.nE; e++) scale[e] = m.mask[e] ? (E0 + Math.pow(xPhys[e], p) * (E - E0)) * dick : 0;
    return scale;
  };
  for (let it = 0; it < iters; it++) {
    used = it + 1;
    /* Unterwegs reicht eine Nachgiebigkeit auf 1e-7 – die Empfindlichkeiten ändern sich
       erst in zweiter Ordnung, wenn u noch einen Rest hat. Der Endstand wird genau gerechnet. */
    const { us, C, res } = stand(m, k0, skalar(), uVor, 1e-7);
    uVor = us;
    if (!(res < 1e-4)) throw new Error('Das Tragwerk lässt sich nicht lösen – Halterungen prüfen (mechanisches System)');
    // Empfindlichkeit der Nachgiebigkeit gegen die Dichte
    const dC = new Float64Array(m.nE);
    for (let e = 0; e < m.nE; e++) {
      if (!m.mask[e]) continue;
      let s = 0;
      for (const u of us) for (let a = 0; a < 8; a++) {
        const ua = u[m.dofsOf[e * 8 + a]];
        if (ua === 0) continue;
        for (let b = 0; b < 8; b++) s += ua * k0[a * 8 + b] * u[m.dofsOf[e * 8 + b]];
      }
      dC[e] = -p * Math.pow(Math.max(xPhys[e], 1e-9), p - 1) * (E - E0) * dick * s * (gewicht ? gewicht[e] : 1);
    }
    // Kettenregel: Projektion, dann Filter rückwärts – für Nachgiebigkeit und Volumen
    const dCdx = new Float64Array(m.nE), dVdx = new Float64Array(m.nE), tmp = new Float64Array(m.nE);
    for (let e = 0; e < m.nE; e++) tmp[e] = dC[e] * dProj[e];
    applyFilterT(F, dCdx, tmp);
    for (let e = 0; e < m.nE; e++) tmp[e] = m.mask[e] && !m.keep[e] ? dProj[e] : 0;
    applyFilterT(F, dVdx, tmp);
    /* Optimality Criteria: Dichten so anpassen, dass das Volumenziel gerade gehalten wird – gezählt wird das
       projizierte Volumen, also für jeden Versuch filtern und projizieren */
    const move = 0.2, daempf = 0.5, xt = new Float64Array(m.nE);
    let l1 = 0, l2 = 1e9, xn = new Float64Array(m.nE);
    for (let k = 0; k < 60 && (l2 - l1) / (l1 + l2 + 1e-20) > 1e-3; k++) {
      const lm = 0.5 * (l1 + l2);
      for (let e = 0; e < m.nE; e++) {
        if (!m.mask[e]) { xn[e] = 0; continue; }
        if (m.keep[e]) { xn[e] = 1; continue; }
        const be = Math.max(1e-9, -dCdx[e] / (lm * Math.max(dVdx[e], 1e-12)));
        const lo = Math.max(0, x[e] - move), hi = Math.min(1, x[e] + move);
        xn[e] = Math.min(hi, Math.max(lo, x[e] * Math.pow(be, daempf)));
      }
      physik(xn, xt, null);
      let vol = 0;
      for (let e = 0; e < m.nE; e++) if (m.mask[e]) vol += xt[e];
      if (vol > ziel + nKeep) l1 = lm; else l2 = lm;
    }
    let change = 0;
    for (let e = 0; e < m.nE; e++) {
      if (m.keep[e] || !m.mask[e]) continue;
      change = Math.max(change, Math.abs(xn[e] - x[e]));
      x[e] = xn[e];
    }
    physik(x, xPhys, dProj);
    hist.push({ it: used, C, vol: xPhys.reduce((s, v, e) => s + (m.mask[e] ? v : 0), 0) / nDomain, change, beta });
    if (o.fortschritt) o.fortschritt(used, iters, xPhys);
    // Fortsetzung: β verdoppeln nach jeder Stufe oder wenn sich kaum noch etwas tut; Ende erst bei voller Schärfe
    if (beta && beta < betaMax && ((it + 1) % stufe === 0 || change < 0.01)) { beta = Math.min(betaMax, beta * 2); physik(x, xPhys, dProj); }
    else if (lastC !== null && change < 1e-3) break;
    lastC = C;
  }
  const vol = xPhys.reduce((s, v, e) => s + (m.mask[e] ? v : 0), 0) / nDomain;
  // Endstand nachrechnen: die letzte Dichteanpassung ist in der Nachgiebigkeit noch nicht enthalten
  const { u, C, res, umax, reak } = stand(m, k0, skalar());
  if (!(res < 1e-4)) throw new Error('Das Tragwerk lässt sich nicht lösen – Halterungen prüfen (mechanisches System)');
  /* Das fertige Teil (Dichte ≥ 0,5 = Material, sonst leer) noch einmal rechnen: Weg und Vergleichsspannung des Teils,
     das wirklich entsteht – das graue Zwischenfeld der Optimierung zählt Steifigkeit, die es nicht gibt */
  const voll = Float64Array.from(xPhys, (v, e) => (m.mask[e] && v >= 0.5 ? 1 : 0));
  const sc = new Float64Array(m.nE);
  for (let e = 0; e < m.nE; e++) sc[e] = m.mask[e] ? (E * 1e-6 + voll[e] * E) * dick : 0;
  const teil = stand(m, k0, sc);
  const sp = vonMises(m, E, nu, voll, teil.us);
  return {
    modell: m, dichten: xPhys, rohdichten: x, u, nachgiebigkeit: C, wegmax: umax, lager: reak,
    teil: { weg: teil.umax, nachgiebigkeit: teil.C, spannung: sp.max, ok: teil.res < 1e-4 },
    verlauf: hist, iterationen: used, anteil: vol, beta, elemente: { nelx: m.nelx, nely: m.nely, hx: m.hx, hy: m.hy }
  };
}

/* ---------- Ein Dichtefeld nachrechnen: Nachgiebigkeit, Verschiebung, Lagerkräfte ---------- */
/* Je Lastfall lösen: C ist die Summe der Nachgiebigkeiten (alle Fälle gleich gewichtet), umax/res das Schlechteste.
   u0s = Lösungen des vorigen Schritts (eine je Fall); u und reak gehören zum ersten Fall. */
function stand(m, k0, scale, u0s = null, tol = 1e-9) {
  const K = assemble(m, k0, scale), us = [], reaks = [];
  let C = 0, res = 0, umax = 0, it = 0;
  m.loads.forEach((L, c) => {
    const f = new Float64Array(m.nDof);
    for (const d of m.free) f[d] = L[d];
    const r = solveCG(K, f, m, tol, 40000, u0s && u0s[c]);
    const u = r.u;
    us.push(u); it += r.it; res = Math.max(res, r.res);
    for (const d of m.free) C += f[d] * u[d];
    for (let i = 0; i < m.nNode; i++) umax = Math.max(umax, Math.hypot(u[2 * i], u[2 * i + 1]));
    // Rückwirkung der Lager: Kraft = (K·u) an den gehaltenen Freiheitsgraden (dort steht keine äußere Last)
    const reak = new Float64Array(m.nDof);
    for (const d of m.fixed) {
      let s = 0;
      for (let p = m.frow[d]; p < m.frow[d + 1]; p++) s += k0[m.fK[p]] * scale[m.fElem[p]] * u[m.fcol[p]];
      reak[d] = s;
    }
    reaks.push(reak);
  });
  return { u: us[0], us, C, it, res, umax, reak: reaks[0], reaks };
}

/* ---------- Vergleichsspannung nach von Mises (ebener Spannungszustand) ----------
   je Element in der Mitte: ε = B·u, σ = E/(1−ν²)·[[1,ν,0],[ν,1,0],[0,0,(1−ν)/2]]·ε; gezählt werden Elemente mit Dichte
   ≥ schwelle. Elemente direkt an Kraft- und Halterungsknoten bleiben außen vor – dort ist die Spannung im Raster
   unendlich groß (Punktkraft) und sagt nichts über das Bauteil. */
export function vonMises(m, E, nu, x, us, schwelle = 0.5) {
  const g = [[-1, -1], [1, -1], [1, 1], [-1, 1]], k = E / (1 - nu * nu), feld = new Float32Array(m.nE);
  const rand = new Uint8Array(m.nNode);
  for (let n = 0; n < m.nNode; n++) if (m.fix[2 * n] || m.fix[2 * n + 1] || m.load[2 * n] || m.load[2 * n + 1]) rand[n] = 1;
  let max = 0, wo = -1;
  for (let e = 0; e < m.nE; e++) {
    if (!m.mask[e] || x[e] < schwelle) continue;
    let amRand = false;
    for (let a = 0; a < 4; a++) if (rand[m.dofsOf[e * 8 + 2 * a] / 2]) amRand = true;
    for (const u of us) {
      let ex = 0, ey = 0, gxy = 0;
      for (let a = 0; a < 4; a++) {
        const dx = g[a][0] / (2 * m.hx), dy = g[a][1] / (2 * m.hy);
        const ux = u[m.dofsOf[e * 8 + 2 * a]], uy = u[m.dofsOf[e * 8 + 2 * a + 1]];
        ex += dx * ux; ey += dy * uy; gxy += dy * ux + dx * uy;
      }
      const sx = k * (ex + nu * ey), sy = k * (nu * ex + ey), t = k * (1 - nu) / 2 * gxy;
      const vm = Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * t * t);
      if (vm > feld[e]) feld[e] = vm;
      if (!amRand && vm > max) { max = vm; wo = e; }
    }
  }
  return { max, wo, feld };
}

/* ---------- Nachrechnung einer festen Dichteverteilung (für Handvergleich und Prüfstand) ---------- */
export function feAnalyse(o) {
  const m = makeModel(o);
  const E = Number(o.E) || 210000, nu = Math.min(0.49, Math.max(0.05, Number(o.nu) || 0.3));
  const dick = Math.max(1e-3, Number(o.dicke) || 1);
  const k0 = q4unit(m.hx, m.hy, nu);
  const x = o.dichten instanceof Float64Array ? o.dichten : Float64Array.from(o.dichten || new Array(m.nE).fill(1));
  const scale = new Float64Array(m.nE);
  for (let e = 0; e < m.nE; e++) scale[e] = m.mask[e] ? (Number(o.E0) || E * 1e-6) + x[e] * E * dick : 0;
  return { modell: m, ...stand(m, k0, scale) };
}

/* ---------- Knicken (lineare Stabilität in der Ebene) ----------
   (K + λ·K_G)·φ = 0: K_G ist die geometrische Steifigkeit aus den Membranspannungen der Bezugslast; λ ist der Faktor auf
   die Last, bei dem das Teil ausknickt. Gesucht das kleinste positive λ (Druck). Elementspannung in der Mitte, mit dem
   Werkstoffanteil gewichtet (leere Elemente tragen keine Vorspannung – sonst gäbe es Scheinmoden im Hohlraum).
   Löser: Unterraumiteration (p Vektoren) mit K⁻¹·K_G, Rayleigh-Ritz im kleinen Raum; eine Zerlegung für alle Lösungen. */
function q4geo(hx, hy) {
  // ∫ ∂Na/∂x·∂Nb/∂x, ∫ ∂Na/∂y·∂Nb/∂y, ∫ ∂Na/∂x·∂Nb/∂y über das Element (2×2 Gauß)
  const xx = new Float64Array(16), yy = new Float64Array(16), xy = new Float64Array(16), g = 1 / Math.sqrt(3), detJ = hx * hy / 4;
  for (const [xi, eta] of [[-g, -g], [g, -g], [-g, g], [g, g]]) {
    const dN = [[-(1 - eta) / 4, -(1 - xi) / 4], [(1 - eta) / 4, -(1 + xi) / 4], [(1 + eta) / 4, (1 + xi) / 4], [-(1 + eta) / 4, (1 - xi) / 4]].map(([a, b]) => [a * 2 / hx, b * 2 / hy]);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      xx[a * 4 + b] += dN[a][0] * dN[b][0] * detJ; yy[a * 4 + b] += dN[a][1] * dN[b][1] * detJ; xy[a * 4 + b] += dN[a][0] * dN[b][1] * detJ;
    }
  }
  return { xx, yy, xy };
}
function elementSpannungen(m, E, nu, u) {
  const g = [[-1, -1], [1, -1], [1, 1], [-1, 1]], k = E / (1 - nu * nu), out = new Float64Array(m.nE * 3);
  for (let e = 0; e < m.nE; e++) {
    if (!m.mask[e]) continue;
    let ex = 0, ey = 0, gxy = 0;
    for (let a = 0; a < 4; a++) {
      const dx = g[a][0] / (2 * m.hx), dy = g[a][1] / (2 * m.hy), ux = u[m.dofsOf[e * 8 + 2 * a]], uy = u[m.dofsOf[e * 8 + 2 * a + 1]];
      ex += dx * ux; ey += dy * uy; gxy += dy * ux + dx * uy;
    }
    out[3 * e] = k * (ex + nu * ey); out[3 * e + 1] = k * (nu * ex + ey); out[3 * e + 2] = k * (1 - nu) / 2 * gxy;
  }
  return out;
}
// symmetrische n×n-Matrix: Jacobi-Drehungen → Eigenwerte und -vektoren (Spalten)
function kleineEigen(A, n) {
  const a = Float64Array.from(A), v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i * n + j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p * n + q]) < 1e-300) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * a[p * n + q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const x = a[k * n + p], y = a[k * n + q]; a[k * n + p] = c * x - sn * y; a[k * n + q] = sn * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p * n + k], y = a[q * n + k]; a[p * n + k] = c * x - sn * y; a[q * n + k] = sn * x + c * y; }
      for (let k = 0; k < n; k++) { const x = v[k * n + p], y = v[k * n + q]; v[k * n + p] = c * x - sn * y; v[k * n + q] = sn * x + c * y; }
    }
  }
  return { werte: Array.from({ length: n }, (_, i) => a[i * n + i]), vektoren: v };
}
// Beitrag eines Elements zu φᵀ·K_G·ψ
function kgElement(m, G, sig, e, w, phi, psi) {
  let s = 0;
  for (let a = 0; a < 8; a++) for (let b = a & 1; b < 8; b += 2) {
    const na = a >> 1, nb = b >> 1, i = na * 4 + nb;
    s += phi[m.dofsOf[e * 8 + a]] * w * (sig[3 * e] * G.xx[i] + sig[3 * e + 1] * G.yy[i] + sig[3 * e + 2] * (G.xy[i] + G.xy[nb * 4 + na])) * psi[m.dofsOf[e * 8 + b]];
  }
  return s;
}
/* o wie feAnalyse (Modell, E, nu, dicke, dichten); Ergebnis: { lambda (kleinster positiver Knickfaktor, Infinity ohne
   Druck), fall (Lastfall), energie (Anteil jedes Elements an der Knickform, Summe 1), mode } */
export function knicken(o) {
  // leere Elemente fallen ganz heraus: kleineres, gut konditioniertes System (sie tragen weder Steifigkeit noch Vorspannung)
  // Ein Element Rand um das Material bleibt: dünne schräge Stäbe berühren sich sonst nur an Elementecken und das
  // Modell zerfiele (Kraft ohne Halterung)
  const d0 = o.dichten, maske = o.mask instanceof Uint8Array ? Uint8Array.from(o.mask) : null;
  if (maske && d0) {
    const nx = Math.round(o.nelx), ny = Math.round(o.nely), voll = e => d0[e] > 0.02;
    for (let e = 0; e < maske.length; e++) {
      if (!maske[e] || voll(e)) continue;
      const i = e % nx, j = (e - i) / nx;
      let nah = false;
      for (let dj = -1; dj <= 1 && !nah; dj++) for (let di = -1; di <= 1 && !nah; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < ny && voll(b * nx + a)) nah = true;
      }
      if (!nah) maske[e] = 0;
    }
  }
  const m = makeModel(maske ? { ...o, mask: maske } : o);
  const E = Number(o.E) || 210000, nu = Math.min(0.49, Math.max(0.05, Number(o.nu) || 0.3)), dick = Math.max(1e-3, Number(o.dicke) || 1);
  const x = o.dichten instanceof Float64Array ? o.dichten : Float64Array.from(o.dichten || new Array(m.nE).fill(1));
  const k0 = q4unit(m.hx, m.hy, nu), G = q4geo(m.hx, m.hy);
  const scale = new Float64Array(m.nE);
  for (let e = 0; e < m.nE; e++) scale[e] = m.mask[e] ? (Number(o.E0) || E * 1e-4) + x[e] * E * dick : 0;
  const K = assemble(m, k0, scale), P = versucheZerlegung(m, K);
  const loese = (f, u0) => solveCG(K, f, m, 1e-6, 40000, u0, P).u;
  const n = m.nDof, pz = Math.min(6, Math.max(2, Number(o.vektoren) || 4));
  const dot = (a, b) => { let s = 0; for (const d of m.free) s += a[d] * b[d]; return s; };
  let best = { lambda: Infinity, fall: -1, energie: new Float64Array(m.nE), mode: null, schritte: 0 };
  m.loads.forEach((L, fall) => {
    const f = new Float64Array(n);
    for (const d of m.free) f[d] = L[d];
    const u = loese(f, null), sig = elementSpannungen(m, E, nu, u);
    // K_G-Werte im Muster von K: nur gleiche Verschiebungsrichtung koppelt (x mit x, y mit y)
    const gv = new Float64Array(m.col.length);
    for (let q = 0; q < gv.length; q++) {
      const e = m.elemOf[q], ab = m.kOf[q], a = ab >> 3, b = ab & 7;
      if ((a & 1) !== (b & 1)) continue;
      const na = a >> 1, nb = b >> 1, i = na * 4 + nb;
      gv[q] = x[e] * dick * (sig[3 * e] * G.xx[i] + sig[3 * e + 1] * G.yy[i] + sig[3 * e + 2] * (G.xy[i] + G.xy[nb * 4 + na]));
    }
    const KG = { row: m.row, col: m.col, val: gv, n };
    // Startvektoren: Lastweg, dann Pseudo-Zufall (fest, damit Läufe gleich ausgehen)
    let seed = 12345;
    const zufall = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    let X = [];
    for (let j = 0; j < pz; j++) { const v = new Float64Array(n); for (const d of m.free) v[d] = j === 0 ? u[d] : zufall(); X.push(v); }
    let theta = 0, vor = null, it = 0, c = 0;
    const warm = new Array(pz).fill(null), tmp = new Float64Array(n);
    for (; it < 40; it++) {
      /* Y = (K⁻¹·(−K_G) + c)·X. Ohne Verschiebung c setzen sich die betragsgrößten Eigenwerte durch – das können
         negative sein (Knicken bei umgekehrter Last), dann ginge der gesuchte positive verloren. c = Betrag des
         kleinsten bisher gefundenen Ritz-Werts schiebt alle negativen Richtung 0. */
      const Y = X.map((v, j) => {
        matvec(KG, m, v, tmp);
        const r = new Float64Array(n);
        for (const d of m.free) r[d] = -tmp[d];
        const y = loese(r, warm[j]);
        warm[j] = Float64Array.from(y);
        if (c) for (const d of m.free) y[d] += c * v[d];
        return y;
      });
      // Rayleigh-Ritz: Kr = Yᵀ K Y, Gr = Yᵀ (−K_G) Y; Kr = L Lᵀ, C = L⁻¹ Gr L⁻ᵀ
      const KY = Y.map(y => matvec(K, m, y, new Float64Array(n)));
      const GY = Y.map(y => { const g = matvec(KG, m, y, new Float64Array(n)); for (let d = 0; d < n; d++) g[d] = -g[d]; return g; });
      const Kr = new Float64Array(pz * pz), Gr = new Float64Array(pz * pz);
      for (let i = 0; i < pz; i++) for (let j = 0; j < pz; j++) { Kr[i * pz + j] = dot(Y[i], KY[j]); Gr[i * pz + j] = dot(Y[i], GY[j]); }
      const Lc = new Float64Array(pz * pz);
      for (let i = 0; i < pz; i++) for (let j = 0; j <= i; j++) {
        let s2 = Kr[i * pz + j];
        for (let k = 0; k < j; k++) s2 -= Lc[i * pz + k] * Lc[j * pz + k];
        Lc[i * pz + j] = i === j ? Math.sqrt(Math.max(s2, 1e-300)) : s2 / Lc[j * pz + j];
      }
      const Li = new Float64Array(pz * pz); // L⁻¹ (untere Dreiecksmatrix)
      for (let c = 0; c < pz; c++) for (let i = 0; i < pz; i++) { let s2 = i === c ? 1 : 0; for (let k = 0; k < i; k++) s2 -= Lc[i * pz + k] * Li[k * pz + c]; Li[i * pz + c] = s2 / Lc[i * pz + i]; }
      const C = new Float64Array(pz * pz);
      for (let i = 0; i < pz; i++) for (let j = 0; j < pz; j++) { let s2 = 0; for (let a2 = 0; a2 < pz; a2++) for (let b2 = 0; b2 < pz; b2++) s2 += Li[i * pz + a2] * Gr[a2 * pz + b2] * Li[j * pz + b2]; C[i * pz + j] = s2; }
      const eig = kleineEigen(C, pz);
      // Eigenvektoren zurück (z = L⁻ᵀ w), neue Basis X = Y·Z, nach Eigenwert absteigend
      const ord = eig.werte.map((w, i) => [w, i]).sort((a2, b2) => b2[0] - a2[0]);
      X = ord.map(([, i]) => {
        const z = new Float64Array(pz);
        for (let r = 0; r < pz; r++) { let s2 = 0; for (let k = 0; k < pz; k++) s2 += Li[k * pz + r] * eig.vektoren[k * pz + i]; z[r] = s2; }
        const v = new Float64Array(n);
        for (let j = 0; j < pz; j++) { const y = Y[j], c = z[j]; for (const d of m.free) v[d] += c * y[d]; }
        const nn = Math.sqrt(dot(v, v)) || 1;
        for (const d of m.free) v[d] /= nn;
        return v;
      });
      theta = ord[0][0];
      c = Math.max(c, -ord[pz - 1][0]);
      if (vor !== null && Math.abs(theta - vor) <= 5e-4 * Math.abs(theta)) break; // λ auf 0,05 % – genug für eine Sicherheit
      vor = theta;
    }
    if (!(theta > 0)) return; // kein Druck in diesem Fall
    const lam = 1 / theta;
    if (lam < best.lambda) {
      const phi = X[0], en = new Float64Array(m.nE);
      let sum = 0;
      for (let e = 0; e < m.nE; e++) {
        if (!m.mask[e]) continue;
        en[e] = Math.max(0, -kgElement(m, G, sig, e, x[e] * dick, phi, phi)); // Arbeit der Druckspannung in der Knickform
        sum += en[e];
      }
      if (sum > 0) for (let e = 0; e < m.nE; e++) en[e] /= sum;
      best = { lambda: lam, fall, energie: en, mode: phi, schritte: it + 1 };
    }
  });
  return best;
}

/* ---------- Umriss aus der Dichteverteilung ----------
   Marching Squares über einem um einen Rand erweiterten Abtastgitter: bei scharfem 0/1-Feld
   trifft die Linie genau auf die Elementkante, bei weichem Verlauf folgt sie der Dichte. */
export function contourAusDichte(x, m, level = 0.5) {
  const { nelx, nely, hx, hy, ox, oy } = m;
  const nx = nelx + 2, ny = nely + 2;
  const S = new Float64Array(nx * ny);
  for (let j = 0; j < nely; j++) for (let i = 0; i < nelx; i++) S[(j + 1) * nx + (i + 1)] = x[EIDX(nelx, i, j)];
  const gx = I => ox + (I - 0.5) * hx, gy = J => oy + (J - 0.5) * hy;
  const segs = [];
  const at = (I, J) => S[J * nx + I];
  const ip = (a, b) => {
    const d = b - a;
    return Math.abs(d) < 1e-12 ? 0.5 : (level - a) / d;
  };
  for (let J = 0; J < ny - 1; J++) for (let I = 0; I < nx - 1; I++) {
    const v0 = at(I, J), v1 = at(I + 1, J), v2 = at(I + 1, J + 1), v3 = at(I, J + 1);
    let code = 0;
    if (v0 >= level) code |= 1;
    if (v1 >= level) code |= 2;
    if (v2 >= level) code |= 4;
    if (v3 >= level) code |= 8;
    if (code === 0 || code === 15) continue;
    const P = [];
    const top = () => [gx(I) + ip(v0, v1) * hx, gy(J)];
    const right = () => [gx(I + 1), gy(J) + ip(v1, v2) * hy];
    const bottom = () => [gx(I) + ip(v3, v2) * hx, gy(J + 1)];
    const left = () => [gx(I), gy(J) + ip(v0, v3) * hy];
    const add = (a, b) => P.push([a, b]);
    switch (code) {
      case 1: case 14: add(left(), top()); break;
      case 2: case 13: add(top(), right()); break;
      case 3: case 12: add(left(), right()); break;
      case 4: case 11: add(right(), bottom()); break;
      case 6: case 9: add(top(), bottom()); break;
      case 7: case 8: add(left(), bottom()); break;
      /* Sattelpunkte: zwei gegenüberliegende Ecken innen. Die Mitte entscheidet, ob die inneren Ecken verbunden
         sind (dann werden die äußeren Ecken abgeschnitten) – sonst kreuzen sich bei scharfen 0/1-Feldern
         Konturen an diagonal berührenden Stäben und die Fläche stimmt nicht mehr */
      case 5: if ((v0 + v1 + v2 + v3) / 4 >= level) { add(top(), right()); add(left(), bottom()); } else { add(left(), top()); add(right(), bottom()); } break;
      case 10: if ((v0 + v1 + v2 + v3) / 4 >= level) { add(left(), top()); add(right(), bottom()); } else { add(top(), right()); add(left(), bottom()); } break;
    }
    for (const [a, b] of P) segs.push([a, b]);
  }
  return schleifenAusSegmenten(segs);
}

/* Segmenten zu geschlossenen Zügen verbinden. Die Segen aus Marching Squares haben keine
   einheitliche Richtung – deshalb wird über beide Endpunkte und über verbrauchte Segen gelaufen. */
function schleifenAusSegmenten(segs) {
  const key = p => `${Math.round(p[0] * 1e6)}:${Math.round(p[1] * 1e6)}`;
  const adj = new Map();
  const push = (k, e) => { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(e); };
  segs.forEach(([a, b], si) => { push(key(a), { to: b, si }); push(key(b), { to: a, si }); });
  const used = new Uint8Array(segs.length), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const start = segs[s0][0];
    const loop = [start, segs[s0][1]];
    let cur = segs[s0][1], guard = 0;
    while (guard++ <= segs.length) {
      if (key(cur) === key(start)) break;
      const nx = (adj.get(key(cur)) || []).find(o => !used[o.si]);
      if (!nx) break;
      used[nx.si] = 1;
      loop.push(nx.to);
      cur = nx.to;
    }
    if (key(cur) === key(start)) loop.pop();   // geschlossener Zug, ohne den Startpunkt zu wiederholen
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/* Flächeninhalt eines geschlossenen Punktzugs (vorzeichenbehaftet) */
export const polyFlaeche = pts => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};

/* Punkte auf geraden Ketten zusammenfassen: bei einer scharfen Dichte verläuft die Kontur
   exakt entlang der Elementkanten, das ergibt hundert Punkte für eine gerade Kante. */
function geradeZusammenfassen(pts) {
  const p = pts.slice();
  while (p.length > 2 && gleich(p[0], p[p.length - 1])) p.pop();
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const b = p[i], a = out.length ? out[out.length - 1] : p[(i - 1 + n) % n];
    if (out.length && gleich(a, b)) continue;                     // Doppelpunkt
    const c = p[(i + 1) % n];
    if (punktAbstandLinie(b, a, c) <= 1e-9 * (Math.hypot(c[0] - a[0], c[1] - a[1]) + 1)) continue;
    out.push(b);
  }
  return out.length > 2 ? out : pts;
}
const gleich = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;

/* Überzählige Punkte eines geschlossenen Zugs entfernen: erst gerade Ketten zusammenfassen,
   dann Ramer–Douglas–Peucker. Die Abweichung der erzeugten Linie vom Original bleibt dabei
   unter tol – im Gegensatz zum wiederholten Wegwerfen einzelner Punkte, das große Züge
   verschieben kann. */
export function vereinfache(pts, tol) {
  let out = geradeZusammenfassen(pts);
  if (!(tol > 0) || out.length < 5) return out;
  let i0 = 0, i1 = 1, weiteste = -1;
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const d = (out[i][0] - out[j][0]) ** 2 + (out[i][1] - out[j][1]) ** 2;
      if (d > weiteste) { weiteste = d; i0 = i; i1 = j; }
    }
  }
  if (!(weiteste > 0)) return out;
  const zug = kette => {
    const erg = rdp(kette, tol);
    if (erg.length > 2) return erg;
    /* Alles liegt innerhalb von tol um die Sehne: der Punkt mit dem größten Abstand bleibt
       trotzdem stehen, sonst würde der geschlossene Zug zu einer Linie. */
    let groesste = -1, knick = 0;
    for (let i = 1; i < kette.length - 1; i++) {
      const d = punktAbstandLinie(kette[i], kette[0], kette[kette.length - 1]);
      if (d > groesste) { groesste = d; knick = i; }
    }
    return groesste > 0 ? [kette[0], kette[knick], kette[kette.length - 1]] : erg;
  };
  // zweite Hälfte rundherum: von i1 über das Ende des Zugs bis zurück zu i0 (die Punkte vor i0 gehören dazu)
  const erg = zug(out.slice(i0, i1 + 1)).concat(zug(out.slice(i1).concat(out.slice(0, i0 + 1))).slice(1, -1));
  return erg.length > 2 ? erg : out;
}

/* RDP für einen offenen Punktzug: die Randpunkte des betrachteten Stücks bleiben stehen */
function rdp(pts, tol) {
  const halten = new Uint8Array(pts.length);
  const teil = (a, b) => {
    halten[a] = halten[b] = 1;
    if (b - a < 2) return;
    let groesste = -1, knick = -1;
    for (let i = a + 1; i < b; i++) {
      const d = punktAbstandLinie(pts[i], pts[a], pts[b]);
      if (d > groesste) { groesste = d; knick = i; }
    }
    if (!(groesste > tol)) return;
    teil(a, knick);
    teil(knick, b);
  };
  teil(0, pts.length - 1);
  return pts.filter((_, i) => halten[i]);
}
const punktAbstandLinie = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  return L < 1e-12 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
};

/* Umriss in Flächen und Löcher ordnen – über die Verschachtelung, nicht über die Umlaufrichtung:
   ein Zug, der in keiner anderen Fläche liegt, ist eine Außengrenze, jeder Zug darin ein Loch. */
export function flaechenAusSchleifen(loops, tol = 0) {
  const zs = loops.map(l => vereinfache(l, tol)).filter(l => l.length > 2);
  const tiefe = zs.map((l, i) => zs.reduce((d, o, j) => j !== i && punktInPoly(l[0], o) ? d + 1 : d, 0));
  const aussen = [], loecher = [];
  zs.forEach((l, i) => {
    const fl = Math.abs(polyFlaeche(l));
    if (tiefe[i] % 2 === 0) aussen.push({ punkte: l, flaeche: fl, tiefe: tiefe[i], loecher: [] });
    else loecher.push({ punkte: l, flaeche: fl, tiefe: tiefe[i] });
  });
  for (const lo of loecher) {
    let owner = null;
    for (const f of aussen) if (f.tiefe === lo.tiefe - 1 && punktInPoly(lo.punkte[0], f.punkte)) {
      if (!owner || f.flaeche < owner.flaeche) owner = f;
    }
    if (owner) owner.loecher.push(lo);
  }
  return aussen.filter(f => f.flaeche > 1e-9);
}

/* Niveau der Kontur so wählen, daß die Fläche dem Zielanteil entspricht. Die 0,5-Niveaufläche
   einer gefilterten Dichte ist wegen der grauen Übergänge einige Prozent zu groß; über die
   Halbbierung wird sie auf das Volumen gebracht, das die Optimierung gemeldet hat. */
export function niveauFuerAnteil(x, m, zielAnteil, tol = 0, schritte = 14) {
  const gesamt = m.mask.reduce((s, v) => s + (v ? 1 : 0), 0) * m.hx * m.hy;
  const ziel = Math.max(0, Math.min(1, zielAnteil)) * gesamt;
  const flaeche = (l) => flaechenAusSchleifen(contourAusDichte(x, m, l), tol)
    .reduce((s, f) => s + f.flaeche - f.loecher.reduce((q, h) => q + h.flaeche, 0), 0);
  const toleranz = 0.002 * Math.max(ziel, 1);
  let niveau = 0.5, schleifen = contourAusDichte(x, m, niveau);
  let fl = flaechenAusSchleifen(schleifen, tol).reduce((s, f) => s + f.flaeche - f.loecher.reduce((q, h) => q + h.flaeche, 0), 0);
  if (Math.abs(fl - ziel) > toleranz) {
    let lo = 0.02, hi = 0.98;
    for (let k = 0; k < schritte; k++) {
      niveau = 0.5 * (lo + hi);
      fl = flaeche(niveau);
      if (fl > ziel) lo = niveau; else hi = niveau;
      if (Math.abs(fl - ziel) <= toleranz) break;
    }
    schleifen = contourAusDichte(x, m, niveau);
  }
  return { niveau, flaeche: fl, schleifen };
}

export function punktInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
