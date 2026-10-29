/* Normteile: Maße nach ISO, metrisches Regelgewinde.
   Gewinde werden nicht modelliert, der Schaft hat den Nenndurchmesser. */

// Gewindesteigung Regelgewinde
export const PITCH = { M3: 0.5, M4: 0.7, M5: 0.8, M6: 1, M8: 1.25, M10: 1.5, M12: 1.75, M16: 2, M20: 2.5, M24: 3 };
export const nominal = size => parseFloat(String(size).slice(1));

export const FASTENERS = {
  // dk Kopf-⌀, k Kopfhöhe, s Innensechskant, t Tiefe
  iso4762: {
    norm: 'ISO 4762', name: 'Zylinderschraube mit Innensechskant', screw: true, keys: ['dk', 'k', 's', 't'],
    dims: { M3: [5.5, 3, 2.5, 1.3], M4: [7, 4, 3, 2], M5: [8.5, 5, 4, 2.5], M6: [10, 6, 5, 3], M8: [13, 8, 6, 4], M10: [16, 10, 8, 5], M12: [18, 12, 10, 6], M16: [24, 16, 14, 8], M20: [30, 20, 17, 10], M24: [36, 24, 19, 12] }
  },
  // s Schlüsselweite, k Kopfhöhe
  iso4017: {
    norm: 'ISO 4017', name: 'Sechskantschraube', screw: true, keys: ['s', 'k'],
    dims: { M3: [5.5, 2], M4: [7, 2.8], M5: [8, 3.5], M6: [10, 4], M8: [13, 5.3], M10: [16, 6.4], M12: [18, 7.5], M16: [24, 10], M20: [30, 12.5], M24: [36, 15] }
  },
  // dk Kopf-⌀ (theoretisch), k Kopfhöhe, s Innensechskant, t Tiefe; Länge einschließlich Kopf, Senkung 90°
  iso10642: {
    norm: 'ISO 10642', name: 'Senkschraube mit Innensechskant', screw: true, countersunk: true, keys: ['dk', 'k', 's', 't'],
    dims: { M3: [6.72, 1.86, 2, 1.1], M4: [8.96, 2.48, 2.5, 1.5], M5: [11.2, 3.1, 3, 1.9], M6: [13.44, 3.72, 4, 2.2], M8: [17.92, 4.96, 5, 3], M10: [22.4, 6.2, 6, 3.6], M12: [26.88, 7.44, 8, 4.3], M16: [33.6, 8.8, 10, 5.6], M20: [40.32, 10.16, 12, 6.4] }
  },
  // s Schlüsselweite, m Mutterhöhe
  iso4032: {
    norm: 'ISO 4032', name: 'Sechskantmutter', keys: ['s', 'm'],
    dims: { M3: [5.5, 2.4], M4: [7, 3.2], M5: [8, 4.7], M6: [10, 5.2], M8: [13, 6.8], M10: [16, 8.4], M12: [18, 10.8], M16: [24, 14.8], M20: [30, 18], M24: [36, 21.5] }
  },
  // d1 Innen-⌀, d2 Außen-⌀, h Dicke
  iso7089: {
    norm: 'ISO 7089', name: 'Scheibe', keys: ['d1', 'd2', 'h'],
    dims: { M3: [3.2, 7, 0.5], M4: [4.3, 9, 0.8], M5: [5.3, 10, 1], M6: [6.4, 12, 1.6], M8: [8.4, 16, 1.6], M10: [10.5, 20, 2], M12: [13, 24, 2.5], M16: [17, 30, 3], M20: [21, 37, 3], M24: [25, 44, 4] }
  }
};
// Vorzugslängen (ISO 4762/4017)
export const LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];
export const lengthsFor = size => { const d = nominal(size); return LENGTHS.filter(L => L >= 1.5 * d && L <= 12 * d); };

export function fastenerDims(kind, size) {
  const k = FASTENERS[kind];
  const row = k && k.dims[size];
  if (!row) return null;
  return Object.fromEntries(k.keys.map((key, i) => [key, row[i]]));
}
/* Bezeichnung wie in der Stückliste: „ISO 4762 M8 × 25“ bzw. „ISO 4032 M8“ */
export function fastenerLabel(f) {
  const k = FASTENERS[f.kind];
  if (!k) return 'Normteil';
  return k.screw ? `${k.norm} ${f.size} × ${f.length}` : `${k.norm} ${f.size}`;
}
/* Größe passend zu einer Bohrung: Durchgangsbohrung (⌀ etwas größer als das Gewinde) oder Kernloch (⌀ ≈ d − P) */
export function sizeForHole(D) {
  const sizes = Object.keys(PITCH);
  const core = sizes.find(s => Math.abs(nominal(s) - PITCH[s] - D) < 0.15);
  if (core) return core;
  const fit = sizes.filter(s => nominal(s) <= D + 0.05);
  return fit.length ? fit[fit.length - 1] : sizes[0];
}
