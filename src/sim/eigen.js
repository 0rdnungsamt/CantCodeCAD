// cantcodecad – Eigenwert-Helfer für die Modalanalysen (src/sim/frame.js und src/sim/solid.js). Beides sind dichte
// Verfahren: Cholesky für die kleine Ritz-Gruppe und Jacobi-Rotationen für die symmetrische Matrix. Die großen
// Systeme (Steifigkeit, Masse) bleiben außen vor – die Rechenkerner multiplizieren sie matrixfrei.

/* Cholesky-Zerlegung (dicht, unteres Dreieck in place); null, wenn nicht positiv definit (bewegliches System) */
export function cholesky(A, n) {
  for (let j = 0; j < n; j++) {
    const Aj = A[j];
    let d = Aj[j];
    for (let k = 0; k < j; k++) d -= Aj[k] * Aj[k];
    if (!(d > 0)) return null;
    d = Math.sqrt(d); Aj[j] = d;
    for (let i = j + 1; i < n; i++) {
      const Ai = A[i];
      let s = Ai[j];
      for (let k = 0; k < j; k++) s -= Ai[k] * Aj[k];
      Ai[j] = s / d;
    }
  }
  return A;
}
export function cholSolve(L, b, n) {
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { const Li = L[i]; let s = y[i]; for (let k = 0; k < i; k++) s -= Li[k] * y[k]; y[i] = s / Li[i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * y[k]; y[i] = s / L[i][i]; }
  return y;
}
/* symmetrische Eigenwerte (Jacobi, klein): A = V Λ Vᵀ */
export function jacobi(A, n) {
  const a = A.map(r => Float64Array.from(r)), V = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - sn * akq; a[k][q] = sn * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - sn * aqk; a[q][k] = sn * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - sn * vkq; V[k][q] = sn * vkp + c * vkq; }
    }
  }
  return { w: Array.from({ length: n }, (_, i) => a[i][i]), V };
}

/* Unterraum-Iteration (Bathe) für die kleinsten Eigenwerte von K q = λ M q, wenn K nur als Löser bekannt ist:
   rufen → X, Y = M X, X̃ = K⁻¹ Y, Ritz-Problem über M, neue Startvektoren. löser gibt K⁻¹ y zurück (bei großen
   Systemen ein iteratives Verfahren mit dem Ergebnis des vorigen Durchlaufs als Startwert), antwortet als
   { x, it }. Gibt die geordneten Eigenwerte und die dazu gehörigen Vektoren zurück, fertig bei der gewünschten
   Änderung. */
export function subspace({ p, start, mv, loeser, anzahl, maxIt = 40, tol = 1e-9, fort = () => {} }) {
  let X = start, lam = new Array(p).fill(0), warm = new Array(p).fill(null), schritte = 0;
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  for (let it = 0; it < maxIt; it++) {
    const Y = X.map(mv), Xb = Y.map((y, j) => { const { x, it: n } = loeser(y, warm[j]); schritte += n; return x; });
    const MXb = Xb.map(mv);
    const Kr = Xb.map(a => Y.map(b => dot(a, b))), Mr = Xb.map(a => MXb.map(b => dot(a, b)));
    const L = cholesky(Mr.map(r => Array.from(r)), p);
    if (!L) break;
    // Kr q = λ Mr q über Mr = L Lᵀ ⇒ A = L⁻¹ Kr L⁻ᵀ (symmetrisch, dicht, klein)
    const fw = b => { const y = Array.from(b); for (let i = 0; i < p; i++) { let s = y[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; } return y; };
    const bw = b => { const y = Array.from(b); for (let i = p - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < p; k++) s -= L[k][i] * y[k]; y[i] = s / L[i][i]; } return y; };
    const C1 = Kr.map(fw);
    const A = Array.from({ length: p }, (_, i) => fw(C1.map(col => col[i])));
    const { w, V } = jacobi(A, p);
    const ord = w.map((v, i) => i).sort((a, b) => w[a] - w[b]);
    const lamNeu = ord.map(i => w[i]);
    const Q = ord.map(i => bw(V.map(r => r[i])));
    X = Q.map(qv => { const x = new Float64Array(Xb[0].length); qv.forEach((c, j) => { if (c) for (let k = 0; k < x.length; k++) x[k] += c * Xb[j][k]; }); return x; });
    const fertig = lamNeu.slice(0, anzahl).every((v, i) => Math.abs(v - lam[i]) <= tol * Math.abs(v));
    lam = lamNeu;
    warm = X.map((x, j) => (lam[j] > 1e-30 ? Array.from(x, v => v / lam[j]) : null));
    if (fertig && it > 2) return { lam, X, schritte, laeufe: it + 1 };
    fort((it + 1) / maxIt, it);
  }
  return { lam, X, schritte, laeufe: maxIt };
}
