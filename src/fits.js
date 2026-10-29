// cantcodecad – ISO-Passungen nach ISO 286 (Auswahl) für Nennmaße bis 500 mm. Werte in µm.
const RANGES = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
const IT = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400]
};
// Grundabmaße Welle: es (f, g, h) bzw. ei (k, m, n, p)
const SHAFT = {
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: Array(13).fill(0),
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68]
};
export const FITS = ['H6', 'H7', 'H8', 'H9', 'H11', 'G7', 'F8', 'JS7', 'h6', 'h7', 'h9', 'h11', 'g6', 'f7', 'js6', 'k6', 'm6', 'n6', 'p6'];

/* Abmaße in mm: { up, lo } oder null, wenn Maß/Kurzzeichen nicht abgedeckt */
export function fitDeviations(nominal, code) {
  const m = /^([A-Za-z]{1,2})(\d{1,2})$/.exec(String(code || ''));
  if (!m || !(nominal > 0) || nominal > 500) return null;
  const i = RANGES.findIndex(r => nominal <= r);
  const it = IT[m[2]] && IT[m[2]][i];
  if (it == null) return null;
  const L = m[1];
  let up, lo;
  if (L === 'H') { lo = 0; up = it; }
  else if (L === 'G') { lo = -SHAFT.g[i]; up = lo + it; }
  else if (L === 'F') { lo = -SHAFT.f[i]; up = lo + it; }
  else if (L === 'JS' || L === 'js') { up = it / 2; lo = -it / 2; }
  else if (L === 'f' || L === 'g' || L === 'h') { up = SHAFT[L][i]; lo = up - it; }
  else if (L === 'k' || L === 'm' || L === 'n' || L === 'p') { lo = SHAFT[L][i]; up = lo + it; }
  else return null;
  return { up: up / 1000, lo: lo / 1000 };
}
