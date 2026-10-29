// cantcodecad – Stahlprofile für das Rahmen-Feature (wie „Rahmen“ / Stahlbau).
// Maße in mm. Querschnitte sind auf ihre Hüllbox zentriert; y zeigt senkrecht zur Skizzenebene.

export const PROFILE_KINDS = {
  square: { label: 'Vierkantrohr', fields: ['w', 't'], sizes: ['20x20x2', '25x25x2', '30x30x2', '30x30x3', '40x40x2', '40x40x3', '40x40x4', '50x50x3', '50x50x4', '60x60x3', '60x60x4', '80x80x4', '100x100x5'] },
  rect: { label: 'Rechteckrohr', fields: ['w', 'h', 't'], sizes: ['30x20x2', '40x20x2', '50x30x3', '60x40x3', '80x40x3', '100x50x4', '120x60x4'] },
  round: { label: 'Rundrohr', fields: ['w', 't'], sizes: ['21.3x2', '26.9x2.3', '33.7x2.6', '42.4x2.6', '48.3x2.9', '60.3x2.9', '76.1x2.9'] },
  bar: { label: 'Rundstahl', fields: ['w'], sizes: ['8', '10', '12', '16', '20', '25', '30'] },
  flat: { label: 'Flachstahl', fields: ['w', 'h'], sizes: ['20x3', '30x5', '40x5', '40x8', '50x8', '60x10', '80x10'] },
  angle: { label: 'Winkel (L)', fields: ['w', 'h', 't'], sizes: ['20x20x3', '30x30x3', '40x40x4', '50x50x5', '60x60x6', '80x80x8', '60x40x5'] },
  channel: { label: 'U-Profil (UPN)', fields: ['h', 'w', 'tw', 'tf'], sizes: ['UPN 50', 'UPN 65', 'UPN 80', 'UPN 100', 'UPN 120', 'UPN 140'] },
  ibeam: { label: 'I-Träger (IPE)', fields: ['h', 'w', 'tw', 'tf'], sizes: ['IPE 80', 'IPE 100', 'IPE 120', 'IPE 140', 'IPE 160', 'IPE 200'] }
};
export const FIELD_NAMES = { w: 'Breite', h: 'Höhe', t: 'Wand', tw: 'Steg', tf: 'Flansch' };
const UPN = { 'UPN 50': [50, 38, 5, 7], 'UPN 65': [65, 42, 5.5, 7.5], 'UPN 80': [80, 45, 6, 8], 'UPN 100': [100, 50, 6, 8.5], 'UPN 120': [120, 55, 7, 9], 'UPN 140': [140, 60, 7, 10] };
const IPE = { 'IPE 80': [80, 46, 3.8, 5.2], 'IPE 100': [100, 55, 4.1, 5.7], 'IPE 120': [120, 64, 4.4, 6.3], 'IPE 140': [140, 73, 4.7, 6.9], 'IPE 160': [160, 82, 5, 7.4], 'IPE 200': [200, 100, 5.6, 8.5] };

/* Normgröße → Maße */
export function sizeDims(kind, size) {
  if (kind === 'channel') { const v = UPN[size]; return v && { h: v[0], w: v[1], tw: v[2], tf: v[3] }; }
  if (kind === 'ibeam') { const v = IPE[size]; return v && { h: v[0], w: v[1], tw: v[2], tf: v[3] }; }
  const n = String(size).split('x').map(Number);
  if (kind === 'square') return { w: n[0], h: n[0], t: n[2] ?? n[1] };
  if (kind === 'rect' || kind === 'angle') return { w: n[0], h: n[1], t: n[2] };
  if (kind === 'round') return { w: n[0], t: n[1] };
  if (kind === 'bar') return { w: n[0] };
  if (kind === 'flat') return { w: n[0], h: n[1] };
  return null;
}
export function profileLabel(p) {
  const f = v => String(Math.round(v * 100) / 100).replace('.', ',');
  if (!p) return '';
  if (p.size && (p.kind === 'channel' || p.kind === 'ibeam')) return p.size;
  switch (p.kind) {
    case 'square': return `□ ${f(p.w)}×${f(p.w)}×${f(p.t)}`;
    case 'rect': return `▭ ${f(p.w)}×${f(p.h)}×${f(p.t)}`;
    case 'round': return `Ø ${f(p.w)}×${f(p.t)}`;
    case 'bar': return `Ø ${f(p.w)}`;
    case 'flat': return `Fl ${f(p.w)}×${f(p.h)}`;
    case 'angle': return `L ${f(p.w)}×${f(p.h)}×${f(p.t)}`;
    case 'channel': return `U ${f(p.h)}×${f(p.w)}`;
    case 'ibeam': return `I ${f(p.h)}×${f(p.w)}`;
    default: return p.kind;
  }
}
/* Hüllmaße (Breite in x, Höhe in y) */
export function profileBox(p) {
  if (p.kind === 'square') return [p.w, p.w];
  if (p.kind === 'round' || p.kind === 'bar') return [p.w, p.w];
  if (p.kind === 'channel' || p.kind === 'ibeam') return [p.w, p.h];
  return [p.w, p.h];
}
/* Querschnitt als { outer, hole } mit outer/hole = { poly: [[x,y],…] } | { circle: r } | { rrect: [w, h, r] } */
export function profileShape(p) {
  const need = (...ks) => ks.forEach(k => { if (!(Number(p[k]) > 0)) throw new Error(`Profilmaß ${FIELD_NAMES[k] || k} fehlt`); });
  const w = Number(p.w), h = Number(p.h), t = Number(p.t), tw = Number(p.tw), tf = Number(p.tf);
  const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
  switch (p.kind) {
    case 'square': case 'rect': {
      const H = p.kind === 'square' ? w : h;
      need('w', 't'); if (p.kind === 'rect') need('h');
      if (2 * t >= Math.min(w, H)) throw new Error('Wandstärke zu groß für das Rohr');
      return { outer: { rrect: [w, H, Math.min(1.5 * t, Math.min(w, H) / 2 - 0.01)] }, hole: { rrect: [w - 2 * t, H - 2 * t, Math.min(0.5 * t, Math.min(w, H) / 2 - t - 0.01)] } };
    }
    case 'round':
      need('w', 't');
      if (2 * t >= w) throw new Error('Wandstärke zu groß für das Rohr');
      return { outer: { circle: w / 2 }, hole: { circle: w / 2 - t } };
    case 'bar': need('w'); return { outer: { circle: w / 2 } };
    case 'flat': need('w', 'h'); return { outer: { poly: shift([[0, 0], [w, 0], [w, h], [0, h]], -w / 2, -h / 2) } };
    case 'angle':
      need('w', 'h', 't');
      if (t >= Math.min(w, h)) throw new Error('Schenkeldicke zu groß');
      return { outer: { poly: shift([[0, 0], [w, 0], [w, t], [t, t], [t, h], [0, h]], -w / 2, -h / 2) } };
    case 'channel':
      need('w', 'h', 'tw', 'tf');
      if (tw >= w || 2 * tf >= h) throw new Error('Steg oder Flansch zu dick');
      return { outer: { poly: shift([[0, 0], [w, 0], [w, tf], [tw, tf], [tw, h - tf], [w, h - tf], [w, h], [0, h]], -w / 2, -h / 2) } };
    case 'ibeam': {
      need('w', 'h', 'tw', 'tf');
      if (tw >= w || 2 * tf >= h) throw new Error('Steg oder Flansch zu dick');
      const a = (w - tw) / 2;
      return { outer: { poly: shift([[0, 0], [w, 0], [w, tf], [a + tw, tf], [a + tw, h - tf], [w, h - tf], [w, h], [0, h], [0, h - tf], [a, h - tf], [a, tf], [0, tf]], -w / 2, -h / 2) } };
    }
    default: throw new Error('Unbekanntes Profil');
  }
}
/* Querschnittsfläche in mm² (für Masse je Meter) */
export function profileArea(p) {
  const s = profileShape(p);
  const A = o => o.circle ? Math.PI * o.circle * o.circle : o.rrect ? o.rrect[0] * o.rrect[1] - (4 - Math.PI) * o.rrect[2] * o.rrect[2] : Math.abs(o.poly.reduce((a, q, i) => { const r = o.poly[(i + 1) % o.poly.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) / 2);
  return A(s.outer) - (s.hole ? A(s.hole) : 0);
}
