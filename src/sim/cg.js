// cantcodecad – vorkonditioniertes Gradientenverfahren für die großen, matrixfreien Systeme der Bauteilrechnung.
// Dieselbe Routine löst die Statik (Verschiebungen), die Modalanalyse (innen, warm gestartet) und die Wärmeleitung:
// aufgerufen wird nur `anwenden` (eine Multiplikation mit der Matrix), die Diagonale dient als Jacobi-Vorbehandlung.
// Gesperrte Freiheitsgrade (Eintrag in `free` = 0) behalten ihren Vorgabewert: ihre Zeile ist die Identität, ihre
// Spalten wirken weiter auf die freien Zeilen – das ist die übliche Elimination, nur ohne die Matrix zu bauen.

/* n = Zahl der Freiheitsgrade, free = 1 bei freien und 0 bei gesperrten, diag = Diagonale (1 bei gesperrten),
   anwenden(x, y) schreibt y = A x, f = rechte Seite, u0 ein guter Startwert, tol die relative Restnorm.
   Rückgabe: Werte und Zahl der Schritte. */
export function cg({ n, free, diag, anwenden, f, u0 = null, tol = 1e-7, maxIt = 2000, progress = () => {} }) {
  const u = u0 ? Float64Array.from(u0) : new Float64Array(n);
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
  anwenden(u, q);
  for (let i = 0; i < n; i++) r[i] = free[i] ? f[i] - q[i] : 0;
  const fn = Math.sqrt(r.reduce((a, v) => a + v * v, 0)) || 1;
  for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; p[i] = z[i]; }
  let rz = r.reduce((a, v, i) => a + v * z[i], 0), it = 0;
  if (!rz) return { u, it };
  for (; it < maxIt; it++) {
    anwenden(p, q);
    let pq = 0;
    for (let i = 0; i < n; i++) pq += p[i] * q[i];
    const al = rz / pq;
    let rn = 0;
    for (let i = 0; i < n; i++) { u[i] += al * p[i]; r[i] -= al * q[i]; rn += r[i] * r[i]; }
    if (Math.sqrt(rn) < tol * fn) break;
    let rz2 = 0;
    for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
    const be = rz2 / rz;
    rz = rz2;
    for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
    if (it % 25 === 0) progress(Math.min(0.99, Math.log(Math.sqrt(rn) / fn) / Math.log(tol)));
  }
  return { u, it };
}
