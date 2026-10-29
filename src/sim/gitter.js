// cantcodecad – Gitter als Geometrie: periodische Freiformflächen (Minimalflächen) füllen einen Körper aus.
// Wie „Volumetrisches Gitter“ mit Isosurface-Typen: Die Gitterfläche ist die Nullstelle einer
// periodischen Funktion g, die Wand der Wandstärke d ist der Bereich |g|/|∇g| ≤ d/2. Ausgewertet wird ein
// Dichtefeld auf einem Raster; die Fläche entsteht daraus mit Marching Tetrahedra (sim/gd3d.js) und wird
// wie ein STL-Import zum Netzkörper (kernel-worker: stlSolidFast).
// Begrenzt wird im Feld, nicht durch einen Booleschen Schnitt: der vorzeichenbehaftete Abstand zur
// Körperoberfläche ist ein zweiter Term – min(Gitterband, Körperabstand) endet auf den Flächen des
// Körpers. Ein Boolescher Schnitt mit dem fertigen Gitter wäre exakter, kostet aber an 35 000 Dreiecken
// mehrere Minuten (gemessen) und hängt an der Zahl der Flächen; über das Feld hängt die Arbeit nur an der
// Rasterweite. Die Rasterweite ist ein ganzzahliger Teil der Gitterzelle – dadurch ist das Band periodisch
// und wird einmal auf einer Zelltabelle berechnet, der Rest sind Tabellenzugriffe.
import { oberflaeche, glattNetz } from './gd3d.js';

/* Die Funktionen sind auf u = 2π·achse/zelle genormt und periodisch mit Periode zelle in x, y und z.
   Der Gradient wird numerisch gebildet, damit jede Funktion (auch eine eigene) auf dieselbe Weise funktioniert. */
export const GITTER_TYPEN = {
  gyroid: {
    label: 'Gyroid (Schoen G)',
    hinweis: 'Durchgehend verbundene Freiformfläche ohne gerade Ebenen – steif in alle Richtungen, die übliche Wahl für den 3D-Druck.',
    g: (u, v, w) => Math.sin(u) * Math.cos(v) + Math.sin(v) * Math.cos(w) + Math.sin(w) * Math.cos(u)
  },
  diamant: {
    label: 'Diamant (Schoen D)',
    hinweis: 'Zwei getrennte, ineinandergreifende Flächen – feineres Bild als das Gyroid, mehr einzelne Stege.',
    g: (u, v, w) => Math.sin(u) * Math.sin(v) * Math.sin(w) - Math.sin(u) * Math.cos(v) * Math.cos(w)
      - Math.cos(u) * Math.sin(v) * Math.cos(w) - Math.cos(u) * Math.cos(v) * Math.sin(w)
  },
  schwarz: {
    label: 'Schwarz P',
    hinweis: 'Primitive kubische Minimalfläche – offenes, grobes Gitter mit großen Kammern.',
    g: (u, v, w) => Math.cos(u) + Math.cos(v) + Math.cos(w)
  }
};

/* Abstand zur Gitterfläche: |g|/|∇g| ist die übliche Näherung für den Abstand zur Fläche g = 0; der Gradient
   ist auf einer Minimalfläche nahe bei konstant, die Wandstärke wird dadurch gleichmäßig. Rückgabe:
   positiv innerhalb der Wand, negativ außerhalb. */
export function bandAbstand(typ, zelle, dicke) {
  const T = GITTER_TYPEN[typ];
  if (!T) throw new Error(`Ein Gittertyp „${typ}“ ist nicht bekannt`);
  const k = 2 * Math.PI / zelle, half = Math.max(0.01, dicke) / 2, e = 1e-3;
  return (x, y, z) => {
    const u = k * x, v = k * y, w = k * z;
    const gx = (T.g(u + e, v, w) - T.g(u - e, v, w)) / (2 * e) * k;
    const gy = (T.g(u, v + e, w) - T.g(u, v - e, w)) / (2 * e) * k;
    const gz = (T.g(u, v, w + e) - T.g(u, v, w - e)) / (2 * e) * k;
    const betrag = Math.hypot(gx, gy, gz);
    return half - (betrag > 1e-9 ? Math.abs(T.g(u, v, w)) / betrag : 1e6);
  };
}

/* Raster eines Gitters: Rasterweite = Gitterzelle / m mit ganzzahligem m, damit das Band über eine Zell-
   tabelle läuft (m Werte pro Richtung, der Wert eines Knotens ist sein Index modulo m). m ist ohne Wunsch
   mindestens so groß, dass eine Zellkante von etwa sieben Schritten und die Wand von mindestens 2,4
   Schritten getroffen wird – sonst wird die Freiformfläche löchrig und aus der Wand ein Streifen.
   Nach oben begrenzt und herabgesetzt, wenn der Körper zu viele Punkte bräuchte: die Arbeit (Feld, Netz,
   Festkörper) hängt an der Zahl der Punkte, und die wächst mit dem Körpervolumen.
   Der Ursprung liegt nicht auf dem Körper, sondern mit einem unregelmäßigen Abstand unter ihm: sonst fallen
   Körperflächen genau auf Rasterknoten, und aus den Nullstellen auf den Kanten werden entartete Dreiecke. */
const URSPRUNG = [0.3137, 0.6711, 0.4729];
export function gitterRaster(lo, hi, zelle, dicke, mWunsch = 0, maxKnoten = 26000) {
  const noetig = Math.ceil(2.4 * zelle / Math.max(0.01, dicke));   // Schritte über die Wand, damit sie eine Wand bleibt
  let m = mWunsch ? Math.min(16, Math.max(3, Math.round(mWunsch))) : Math.min(16, Math.max(7, noetig));
  const achse = (step, i) => {
    const o = lo[i] - step + step * URSPRUNG[i];
    return [o, Math.max(1, Math.ceil((hi[i] - o) / step))];
  };
  const verbrauch = step => {
    const a = [0, 1, 2].map(i => achse(step, i));
    return { o: a.map(x => x[0]), n: a.map(x => x[1]), knoten: a[0][1] * a[1][1] * a[2][1] };
  };
  /* zu großes Raster: Auflösung herabsetzen, bis die Grenze passt – die Auflösung ist eine Wunschangabe,
     der Preis (Netz- und Festkörperbau) hängt an der Zahl der Punkte, und die wächst mit dem Körper */
  let g = verbrauch(zelle / m);
  while (g.knoten > maxKnoten && m > 6) { m--; g = verbrauch(zelle / m); }
  return { m, step: zelle / m, ...g, zuViel: g.knoten > maxKnoten, zuGrob: m < noetig };
}

/* Band auf einer Zelltabelle (m³ Werte): der Wert eines Knotens ist sein Index modulo m. Die Tabelle wird
   auf demselben Raster wie das Feld ausgewertet, der Ursprung ist dabei gleichgültig. */
function bandTabelle(typ, zelle, dicke, step, m, o) {
  const f = bandAbstand(typ, zelle, dicke);
  const t = new Float32Array(m * m * m);
  for (let k = 0; k < m; k++) for (let j = 0; j < m; j++) {
    const q = (k * m + j) * m;
    for (let i = 0; i < m; i++) t[q + i] = f(o[0] + i * step, o[1] + j * step, o[2] + k * step);
  }
  return t;
}

/* Dreiecksnetz als Suchstruktur (Eimer mit Seitengröße c). naechster(p, maxD) gibt den nächsten Punkt bis
   maxD, sonst null. tris: flache Zahlenliste, neun Werte pro Dreieck. */
export function dreieckSucher(tris, c) {
  const nt = Math.floor(tris.length / 9);
  if (!nt) throw new Error('Der Körper hat keine Oberfläche');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < nt; t++) for (let v = 0; v < 3; v++) {
    const q = 9 * t + 3 * v;
    for (let i = 0; i < 3; i++) { const w = tris[q + i]; if (w < lo[i]) lo[i] = w; if (w > hi[i]) hi[i] = w; }
  }
  const n = [0, 1, 2].map(i => Math.max(1, Math.ceil((hi[i] - lo[i]) / c) + 1));
  const eimer = new Map(), bid = (i, j, k) => (k * n[1] + j) * n[0] + i;
  for (let t = 0; t < nt; t++) {
    const q = 9 * t;
    const b = [0, 1, 2].map(i => Math.min(...[0, 1, 2].map(v => Math.max(0, Math.floor((tris[q + 3 * v + i] - lo[i]) / c)))));
    const e = [0, 1, 2].map(i => Math.min(n[i] - 1, Math.max(0, Math.max(...[0, 1, 2].map(v => Math.floor((tris[q + 3 * v + i] - lo[i]) / c))))));
    for (let i = b[0]; i <= e[0]; i++) for (let j = b[1]; j <= e[1]; j++) for (let k = b[2]; k <= e[2]; k++) {
      const id = bid(i, j, k); let l = eimer.get(id); if (!l) eimer.set(id, l = []); l.push(t);
    }
  }
  /* liegt ein Punkt im Körper: Zahl der Höhen, in denen eine Senkrechte durch (x, y) die Vernetzung schneidet –
     ungerade = innen. Genau das macht die Klassifikation eines Körpers, und die Vernetzung ist geschlossen.
     Eimer über der Ebene (x, y): ein Punkt braucht nur seinen Eimer. Die Normale der nächstliegenden Fläche
     wäre billiger, stimmt aber an konkaven Kanten nicht (der Punkt liegt vor der Flächenebene, obwohl er
     innerhalb des Körpers liegt). */
  const ebene = new Map(), eid = (i, j) => j * n[0] + i;
  for (let t = 0; t < nt; t++) {
    const q = 9 * t;
    const b = [0, 1].map(i => Math.max(0, Math.floor((Math.min(tris[q + i], tris[q + 3 + i], tris[q + 6 + i]) - lo[i]) / c)));
    const e = [0, 1].map(i => Math.min(n[i] - 1, Math.ceil((Math.max(tris[q + i], tris[q + 3 + i], tris[q + 6 + i]) - lo[i]) / c)));
    for (let i = b[0]; i <= e[0]; i++) for (let j = b[1]; j <= e[1]; j++) {
      const id = eid(i, j); let l = ebene.get(id); if (!l) ebene.set(id, l = []); l.push(t);
    }
  }
  function innen(px, py, pz) {
    const i = Math.floor((px - lo[0]) / c), j = Math.floor((py - lo[1]) / c);
    if (i < 0 || j < 0 || i >= n[0] || j >= n[1]) return false;
    const z = [];                                   // Höhen der Flächen über (x, y), aufsteigend
    let k = 0;
    for (const t of ebene.get(eid(i, j)) || []) {
      const q = 9 * t;
      const ax = tris[q], ay = tris[q + 1], az = tris[q + 2];
      const bx = tris[q + 3], by = tris[q + 4], bz = tris[q + 5];
      const cx = tris[q + 6], cy = tris[q + 7], cz = tris[q + 8];
      const e1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const e2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const e3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      if (!((e1 >= 0 && e2 >= 0 && e3 >= 0) || (e1 <= 0 && e2 <= 0 && e3 <= 0))) continue;
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (!d) continue;                            // lotrechte Fläche: die Senkrechte liegt in ihrer Ebene
      const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
      const w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      const h = w1 * az + w2 * bz + (1 - w1 - w2) * cz;
      /* liegt (x, y) auf einer Kante der Vernetzung, treffen zwei Dreiecke in derselben Höhe – über die
         gemeinsame Kante ist die Höhe beider gleich. Gezählt wird die Höhe deshalb nur einmal. */
      let neu = true;
      for (let u = 0; u < k; u++) if (Math.abs(z[u] - h) < 1e-9 * (1 + Math.abs(h))) { neu = false; break; }
      if (neu) z[k++] = h;
    }
    let schnitte = 0;
    for (let u = 0; u < k; u++) if (z[u] > pz) schnitte++;
    return schnitte % 2 === 1;
  }
  /* nächster Punkt auf einem Dreieck (über die sieben Bereiche des Umlaufs) */
  const aufDreieck = (t, px, py, pz) => {
    const q = 9 * t;
    const ax = tris[q], ay = tris[q + 1], az = tris[q + 2];
    const bx = tris[q + 3], by = tris[q + 4], bz = tris[q + 5];
    const cx = tris[q + 6], cy = tris[q + 7], cz = tris[q + 8];
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return [ax, ay, az];
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return [bx, by, bz];
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const s = d1 / (d1 - d3); return [ax + abx * s, ay + aby * s, az + abz * s]; }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return [cx, cy, cz];
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const s = d2 / (d2 - d6); return [ax + acx * s, ay + acy * s, az + acz * s]; }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const s = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      return [bx + (cx - bx) * s, by + (cy - by) * s, bz + (cz - bz) * s];
    }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
  };
  const zell = (p, i) => Math.min(n[i] - 1, Math.max(0, Math.floor((p[i] - lo[i]) / c)));
  return {
    naechster(px, py, pz, maxD) {
      const i0 = zell([px, py, pz], 0), j0 = zell([px, py, pz], 1), k0 = zell([px, py, pz], 2);
      const rMax = Math.ceil(maxD / c);
      let best = Infinity, bx = 0, by = 0, bz = 0;
      for (let r = 0; r <= rMax; r++) {
        for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) for (let k = k0 - r; k <= k0 + r; k++) {
          if (r > 0 && Math.max(Math.abs(i - i0), Math.abs(j - j0), Math.abs(k - k0)) !== r) continue;
          if (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2]) continue;
          const l = eimer.get(bid(i, j, k)); if (!l) continue;
          for (const t of l) {
            const q = aufDreieck(t, px, py, pz);
            const d = Math.hypot(q[0] - px, q[1] - py, q[2] - pz);
            if (d < best) { best = d; bx = q[0]; by = q[1]; bz = q[2]; }
          }
        }
        if (best <= r * c) break;   // Ringe ab r + 1 liegen weiter als r · c – ein Punkt in seiner Zelle ist näher nicht möglich
      }
      return best <= maxD ? { d: best, x: bx, y: by, z: bz } : null;
    },
    innen
  };
}

/* Dichtefeld für das Gitter in einem Körper: min(Abstand zur Gitterfläche, vorzeichenbehafteter Abstand
   zur Körperoberfläche). Nullstelle = Oberfläche des Gitterkörpers. Das Vorzeichen kommt aus der
   Klassifikation des Körpers (sucher.innen), der Abstand aus der Suche im Dreiecksnetz – gesucht wird
   nur außerhalb des Gitterwerkstoffs und nur bis zur halben Wandstärke, alles andere trägt das Band. */
export function gitterFeld({ typ, zelle, dicke, raster, tris }) {
  const { m, step, o, n } = raster;
  const [NX, NY, NZ] = n.map(v => v + 1);   // Feldwerte auf Knoten, n zählt die Würfel
  const band = bandAbstand(typ, zelle, dicke);
  const tafel = bandTabelle(typ, zelle, dicke, step, m, o);
  const c = Math.max(step, Math.max(...[0, 1, 2].map(i => n[i] * step)) / 96);
  const sucher = dreieckSucher(tris, c);
  const maxD = dicke / 2 + 1.5 * step;
  const f = new Float32Array(NX * NY * NZ);
  for (let iz = 0; iz < NZ; iz++) {
    const kz = iz % m, zo = o[2] + iz * step;
    for (let iy = 0; iy < NY; iy++) {
      const ky = iy % m, yo = o[1] + iy * step, row = (iz * NY + iy) * NX;
      for (let ix = 0; ix < NX; ix++) {
        const i = row + ix, x = o[0] + ix * step;
        const b = tafel[(kz * m + ky) * m + ix % m];
        if (b <= 0) { f[i] = b; continue; }
        if (!sucher.innen(x, yo, zo)) { f[i] = -2 * dicke; continue; }   // außerhalb des Körpers: kein Gitter
        const nr = sucher.naechster(x, yo, zo, maxD);
        f[i] = nr ? Math.min(b, nr.d) : b;
      }
    }
  }
  return { f, o, n, step, sucher, band, c, maxD };
}

/* Punkte des Netzes, die auf einer Fläche des Körpers liegen: der Abstand zur Körperfläche trägt dort den
   kleineren der beiden Feldterme, der Punkt gehört zur Begrenzung. Diese Punkte bleiben bei der Glättung an
   ihrer Stelle – Marching Tetrahedra trifft ebene Flächen bei exaktem Abstand genau, und gekrümmte auf
   Rasterweite / 8 genau; nur das Glätten würde sie von den Flächen des Körpers wegziehen.
   Punkte, die außerhalb des Körpers liegen, werden auf die nächste Körperfläche gezogen: an einer Kante oder
   Ecke ist der Abstand zu den Flächen über eine Rasterkante nicht linear (außerhalb eines Körpers ist er
   abgerundet), die Nullstelle der linearen Interpolation rückt dort bis etwa eine halbe Rasterweite hinaus.
   Ohne diese Korrektur steht das Gitter an Kanten und Ecken sichtbar über den Flächen des Körpers. */
export function randAufKorper(pos, tri, feld) {
  const { sucher, band, step, c } = feld;
  const fest = new Uint8Array(pos.length / 3);
  let getroffen = 0, verschoben = 0;
  const versch = [];
  for (let v = 0; v < pos.length; v++) {
    const q = 3 * v;
    const nr = sucher.naechster(pos[q], pos[q + 1], pos[q + 2], 0.6 * step + c);
    const aussen = !sucher.innen(pos[q], pos[q + 1], pos[q + 2]);
    if (!nr) continue;
    if (!aussen && !(nr.d < band(pos[q], pos[q + 1], pos[q + 2]))) continue;   // Punkt trägt das Gitter, nicht der Körper
    if (!aussen && nr.d > 0.6 * step) continue;
    fest[v] = 1; getroffen++;
    if (!aussen) continue;
    versch.push(q, pos[q], pos[q + 1], pos[q + 2]);
    pos[q] = nr.x; pos[q + 1] = nr.y; pos[q + 2] = nr.z;
    verschoben++;
  }
  /* fallen zwei Punkte eines Dreiecks zusammen, wäre es entartet und der Netzkörper bekäme Löcher:
     die Punkte dieser Dreiecke bleiben an ihrer Stelle */
  const kaputt = new Set();
  for (let t = 0; t < tri.length; t += 3) {
    const a = 3 * tri[t], b = 3 * tri[t + 1], d = 3 * tri[t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-12) continue;
    for (const p of [a, b, d]) if (fest[p / 3]) kaputt.add(p);
  }
  for (let i = 0; i < versch.length; i += 4) {
    const q = versch[i];
    if (!kaputt.has(q)) continue;
    pos[q] = versch[i + 1]; pos[q + 1] = versch[i + 2]; pos[q + 2] = versch[i + 3];
    fest[q / 3] = 0; verschoben--;
  }
  return { fest, getroffen, verschoben, rueckgaengig: kaputt.size };
}

/* Gitter in einem Körper als Dreiecksnetz: Dichtefeld → Marching Tetrahedra → geglättet (der Rand an den
   Körperflächen bleibt liegen). Rückgabe wie sim/gd3d.js: { pos, tri }; der Netzkörper entsteht daraus im
   Kern wie bei einem STL-Import (stlSolidFast). */
export function gitterNetz({ typ, zelle, dicke, lo, hi, tris, m = 0, glatt = 8, maxKnoten = 26000 }) {
  const raster = gitterRaster(lo, hi, zelle, dicke, m, maxKnoten);
  if (raster.zuViel) throw new Error(`Der Körper ist für dieses Gitter zu groß (${raster.knoten} Rasterpunkte) – eine größere Gitterzelle oder eine geringere Wandstärke wählen`);
  const feld = gitterFeld({ typ, zelle, dicke, raster, tris });
  const netz = oberflaeche(feld.f, { o: feld.o, nx: feld.n[0], ny: feld.n[1], nz: feld.n[2] }, feld.step, 0, 0);
  const { fest, getroffen, verschoben, rueckgaengig } = randAufKorper(netz.pos, netz.tri, feld);
  if (glatt > 0) glattNetz(netz.pos, netz.tri, glatt, fest);
  return { netz, raster, feld, fest, getroffen, verschoben, rueckgaengig };
}
