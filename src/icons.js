// Symbole, 24×24. Mehrfarbig nach festen Rollen (Farben in styles.css unter „Symbole“):
//   f/f2/f3 Körper (Ober-, linke, rechte Seite, grau) · n/n2/n3 neue oder geänderte Geometrie (orange)
//   s Skizzenlinie, sf Skizzenprofil, sp Skizzenpunkt (blau) · pl Ebene, ax Achse (gelb)
//   ar/arh Pfeil (blau), oa/oah Pfeil orange, r/rf/rh rot (entfernen, Kollision), g/gf/gh grün (hinzufügen, OK)
//   d dunkle Linie, w weiße Fläche, m gestrichelte Hilfslinie, h Loch (dunkel), y gelb, u Papier
// Ohne Klasse zeichnet die Linie in currentColor (Farbe der Gruppe im Menüband).

const r2 = v => Math.round(v * 100) / 100;
const pt = p => `${r2(p[0])} ${r2(p[1])}`;
const C30 = Math.cos(Math.PI / 6);
/* isometrische Abbildung: (x, y, z) → Bild; o = Bildpunkt des Ursprungs, k = Maßstab */
const iso = (o = [12, 12], k = 1) => (x, y, z) => [o[0] + (x - y) * C30 * k, o[1] + (x + y) * 0.5 * k - z * k];
const poly = (a, c) => `<path class="${c}" d="M${a.map(pt).join('L')}Z"/>`;
const pl = (a, c) => `<path class="${c}" d="M${a.map(pt).join('L')}"/>`;
/* Quader in Isometrie: Oberseite c, Seite y = d c2, Seite x = w c3 */
function blk(o, k, x, y, z, w, d, h, c = 'f') {
  const P = iso(o, k), Q = (a, b, e) => P(x + a, y + b, z + e);
  return poly([Q(0, d, 0), Q(w, d, 0), Q(w, d, h), Q(0, d, h)], c + '2') + poly([Q(w, 0, 0), Q(w, d, 0), Q(w, d, h), Q(w, 0, h)], c + '3')
    + poly([Q(0, 0, h), Q(w, 0, h), Q(w, d, h), Q(0, d, h)], c);
}
/* senkrechter Zylinder (Achse z) in Isometrie */
function cyl(o, k, cx, cy, z, r, h, c = 'f') {
  const P = iso(o, k), b = P(cx, cy, z), t = P(cx, cy, z + h), rx = r * k * 1.2247, ry = r * k * 0.7071;
  return `<path class="${c}2" d="M${r2(b[0] - rx)} ${r2(b[1])}L${r2(t[0] - rx)} ${r2(t[1])}L${r2(t[0] + rx)} ${r2(t[1])}L${r2(b[0] + rx)} ${r2(b[1])}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(b[0] - rx)} ${r2(b[1])}Z"/>`
    + `<ellipse class="${c}" cx="${r2(t[0])}" cy="${r2(t[1])}" rx="${r2(rx)}" ry="${r2(ry)}"/>`;
}
/* waagerechter Kreis (Ebene z) als Ellipse */
function ell(o, k, cx, cy, z, r, c) { const P = iso(o, k), m = P(cx, cy, z); return `<ellipse class="${c}" cx="${r2(m[0])}" cy="${r2(m[1])}" rx="${r2(r * k * 1.2247)}" ry="${r2(r * k * 0.7071)}"/>`; }
/* Pfeil von (x1, y1) nach (x2, y2); c = Linienklasse, Kopf = c + 'h' */
function arr(x1, y1, x2, y2, c = 'ar', h = 3.2) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, bx = x2 - ux * h, by = y2 - uy * h, w = h * 0.55;
  return `<path class="${c}" d="M${r2(x1)} ${r2(y1)}L${r2(bx)} ${r2(by)}"/><path class="${c}h" d="M${r2(x2)} ${r2(y2)}L${r2(bx - uy * w)} ${r2(by + ux * w)}L${r2(bx + uy * w)} ${r2(by - ux * w)}Z"/>`;
}
const dot = (x, y, r = 1.5, c = 'sp') => `<circle class="${c}" cx="${x}" cy="${y}" r="${r}"/>`;
// häufige Bausteine
const SLAB = blk([12, 9], 1, 0, 0, 0, 9, 9, 5);                 // Grundkörper
const PLATE = (o = [12, 10], c = 'f') => blk(o, 1, 0, 0, 0, 10, 10, 1.6, c);  // Blech
const DOC = '<path class="u" d="M5 2.5h9.5l4.5 4.5v14.5H5z"/><path class="d" d="M14.5 2.5V7H19"/>';
const SHEET = '<path class="u" d="M3 4h18v16H3z"/>';
const CROSS = (x, y, s = 3.2) => `<path class="r" d="M${x - s} ${y - s}l${2 * s} ${2 * s}M${x + s} ${y - s}l${-2 * s} ${2 * s}"/>`;

const P = {
  /* ---------- Erstellen ---------- */
  sketch: poly([[2, 16], [12, 11], [22, 16], [12, 21]], 'pl') + '<path class="s" d="M7 16.3l5-2.5 5 2.5-5 2.5z"/>' + dot(7, 16.3, 1.1) + dot(17, 16.3, 1.1)
    + '<path class="y" d="M17.2 2.2l3.2 3.2-8.6 8.6-4.2 1 1-4.2z"/><path class="d" d="M8.6 10.8l3.2 3.2M15.6 3.8l3.2 3.2"/>',
  extrude: '<path class="sf" d="M2.5 18.5l7-3.5 7 3.5-7 3.5z"/>' + blk([9.5, 15], 1, 0.8, 0.8, 0, 6.4, 6.4, 8, 'n') + arr(20.5, 18, 20.5, 3.5),
  revolve: '<path class="ax" d="M12 1.5v21"/>' + cyl([12, 14], 1, 0, 0, 0, 6.5, 6, 'n') + '<path class="s" d="M12 8.2h6.4v6.6"/>'
    + '<path class="oa" d="M4.5 4.6a8.5 3.2 0 0 1 15 0"/><path class="oah" d="M20.6 6.4l-3.5-.7 2.6-2.5z"/>',
  sweep: '<path class="nt" d="M4 19c4 0 4-12 9-12s5 6 8 6"/><path class="s" d="M4 19c4 0 4-12 9-12s5 6 8 6"/><ellipse class="sf" cx="4" cy="19" rx="1.6" ry="3"/>',
  loft: '<path class="n2" d="M3.5 18l3-8.6h11l3 8.6"/><path class="sf" d="M3.5 18l8.5 3.5 8.5-3.5L12 14.5z"/><ellipse class="sf" cx="12" cy="9.4" rx="5.5" ry="2.2"/>',
  pipe: '<path class="nt" d="M4.5 20.5v-8a6 6 0 0 1 6-6h9"/><ellipse class="n" cx="19.6" cy="6.5" rx="1.6" ry="2.6"/><ellipse class="n" cx="4.5" cy="20.4" rx="2.6" ry="1.4"/>',
  rib: blk([13, 13], 1, 0, 0, 0, 11, 6, 2) + blk([13, 13], 1, 0, 0, 2, 2, 6, 10) + poly([iso([13, 13], 1)(2, 3, 2), iso([13, 13], 1)(10, 3, 2), iso([13, 13], 1)(2, 3, 11)], 'n') + pl([iso([13, 13], 1)(2, 3, 11), iso([13, 13], 1)(10, 3, 2)], 'nw'),
  web: poly([[3, 9], [12, 4.5], [21, 9], [12, 13.5]], 'f') + '<path class="nw" d="M7.5 11.2l9-4.5M7.5 6.8l9 4.5"/>' + poly([[3, 9], [12, 13.5], [12, 19], [3, 14.5]], 'f2') + poly([[21, 9], [12, 13.5], [12, 19], [21, 14.5]], 'f3'),
  hole: SLAB + ell([12, 9], 1, 4.5, 4.5, 5, 2.4, 'h') + '<path class="ax" d="M12 1.5v6.2"/>',
  thread: cyl([12, 17], 1, 0, 0, 0, 4.5, 13, 'f') + '<path class="nw" d="M6.5 15.5l11-3.2M6.5 12l11-3.2M6.5 8.5l11-3.2"/>',
  coil: '<path class="cb" d="M19 5.5A7 2.6 0 0 0 5 8M19 9.5A7 2.6 0 0 0 5 12M19 13.5A7 2.6 0 0 0 5 16"/><path class="cf" d="M5 4A7 2.6 0 0 0 19 5.5M5 8A7 2.6 0 0 0 19 9.5M5 12A7 2.6 0 0 0 19 13.5M5 16A7 2.6 0 0 0 19 17.5"/>',
  pbox: blk([12, 7], 1, 0, 0, 0, 9, 9, 8),
  pcyl: cyl([12, 17], 1, 0, 0, 0, 7, 11),
  psphere: '<circle class="f2" cx="12" cy="12" r="9"/><ellipse class="f" cx="9.5" cy="9" rx="4" ry="3.2"/><ellipse class="m" cx="12" cy="12" rx="9" ry="3"/>',
  ptorus: '<ellipse class="f2" cx="12" cy="12.5" rx="10" ry="6"/><ellipse class="w" cx="12" cy="11.6" rx="4.2" ry="2.1"/><path class="d" d="M5 11a7 3 0 0 1 14 0" fill="none"/>',
  fpattern: blk([7, 7], 0.55, 0, 0, 0, 6, 6, 4, 'n') + blk([16, 11.5], 0.55, 0, 0, 0, 6, 6, 4) + blk([7, 16], 0.55, 0, 0, 0, 6, 6, 4) + blk([16, 20.5], 0.55, 0, 0, 0, 6, 6, 4),
  fmirror: '<path class="pl" d="M12 2l3 2v18l-3-2z"/>' + blk([5, 10], 0.75, 0, 0, 0, 6, 6, 7) + blk([18.5, 10], 0.75, 0, 0, 0, 6, 6, 7, 'n'),
  jorigin: '<circle class="m" cx="12" cy="13" r="9"/><path class="axx" d="M12 13l7 4"/><path class="axy" d="M12 13l-7 4"/><path class="axz" d="M12 13V3"/><circle class="w" cx="12" cy="13" r="2.2"/>',
  /* ---------- Ändern ---------- */
  presspull: blk([12, 11], 1, 0, 0, 0, 9, 9, 4) + poly([iso([12, 11], 1)(0, 0, 4), iso([12, 11], 1)(9, 0, 4), iso([12, 11], 1)(9, 9, 4), iso([12, 11], 1)(0, 9, 4)], 'n') + arr(12, 10, 12, 1.5, 'oa') + arr(12, 1.5, 12, 1.4, 'oa', 0),
  fillet: '<path class="f2" d="M3 21V11a8 8 0 0 1 8-8h10v18z"/><path class="nt" d="M3 11a8 8 0 0 1 8-8"/><path class="d" d="M11 11L5.4 5.4"/>' + dot(11, 11, 1.2, 'dd'),
  chamfer: '<path class="f2" d="M3 21V10l7-7h11v18z"/><path class="nt" d="M3 10l7-7"/><path class="m" d="M3 3h7M3 3v7"/>',
  shell: blk([12, 8], 1, 0, 0, 0, 9, 9, 7) + poly([iso([12, 8], 1)(1.5, 1.5, 7), iso([12, 8], 1)(7.5, 1.5, 7), iso([12, 8], 1)(7.5, 7.5, 7), iso([12, 8], 1)(1.5, 7.5, 7)], 'h') + poly([iso([12, 8], 1)(1.5, 1.5, 7), iso([12, 8], 1)(1.5, 7.5, 7), iso([12, 8], 1)(1.5, 7.5, 3), iso([12, 8], 1)(1.5, 1.5, 3)], 'n3'),
  draft: '<path class="f2" d="M4 21l3-15h10l3 15z"/><path class="n2" d="M17 6l3 15h-3z"/><path class="m" d="M17 6v15"/><path class="oa" d="M17 11a5 5 0 0 1 1 0"/>',
  defeature: SLAB + ell([12, 9], 1, 4.5, 4.5, 5, 2.4, 'h') + CROSS(12, 9.6, 3.6),
  combine: blk([9, 9], 0.85, 0, 0, 0, 7, 7, 7) + blk([15, 12], 0.85, 0, 0, 0, 7, 7, 7, 'n'),
  split: blk([10.5, 11], 0.9, 0, 0, 0, 5, 8, 8) + blk([15, 13.5], 0.9, 0, 0, 0, 5, 8, 8, 'n') + '<path class="pl" d="M12.5 2l3 1.7v17l-3-1.7z"/>',
  splitface: blk([12, 8], 1, 0, 0, 0, 9, 9, 7) + poly([iso([12, 8], 1)(0, 9, 0), iso([12, 8], 1)(4.5, 9, 0), iso([12, 8], 1)(4.5, 9, 7), iso([12, 8], 1)(0, 9, 7)], 'n2') + pl([iso([12, 8], 1)(4.5, 9, 0), iso([12, 8], 1)(4.5, 9, 7)], 's'),
  move: blk([12, 9.5], 0.7, 0, 0, 0, 7, 7, 6) + arr(12, 15, 12, 22.5) + arr(12, 4, 12, 0.8) + arr(7, 11.5, 1.2, 11.5) + arr(17, 11.5, 22.8, 11.5),
  scale: blk([8.5, 14], 0.7, 0, 0, 0, 6, 6, 6) + '<path class="m" d="M10 9.5l6-3.5 6 3.5v9l-6 3.5"/>' + arr(13, 10, 20.5, 3.5),
  align: blk([7, 9], 0.75, 0, 0, 0, 6, 6, 5) + blk([16, 14], 0.75, 0, 0, 0, 6, 6, 5, 'n') + '<path class="ax" d="M2 15.5h20"/>' + arr(19, 3, 19, 8.5, 'oa'),
  trash: '<path class="rf" d="M6 7.5l1 13.5h10l1-13.5z"/><path class="d" d="M4 7.5h16M9.5 7.5V4.5h5v3M10 10.5v8M14 10.5v8"/>',
  params: '<rect class="u" x="3" y="3" width="18" height="18" rx="2"/><path class="d" d="M8 18c1.4 0 1.8-1 2.1-2.8l1.4-7.4c.3-1.8.8-2.8 2.2-2.8"/><path class="d" d="M8 10.5h6.5"/><path class="ar" d="M14.8 13.5l3.6 4.5M18.4 13.5l-3.6 4.5"/>',
  config: '<rect class="u" x="2.5" y="3.5" width="19" height="17" rx="1.5"/><path class="d" d="M2.5 8.5h19M9 3.5v17"/>' + blk([15.5, 13.5], 0.45, 0, 0, 0, 6, 6, 5, 'n') + '<path class="s" d="M4.5 12h3M4.5 15.5h3M4.5 19h3"/>',
  /* ---------- Konstruieren ---------- */
  wplane: poly([[2, 18], [9, 14], [22, 18], [15, 22]], 'f2') + poly([[2, 9], [9, 5], [22, 9], [15, 13]], 'pl') + arr(12, 17, 12, 10.5, 'oa'),
  waxis: cyl([12, 17], 1, 0, 0, 0, 5, 9) + '<path class="ax" d="M12 1v22"/>' + dot(12, 3, 1.4, 'yh'),
  wpoint: poly([[2, 15], [12, 10], [22, 15], [12, 20]], 'f') + '<path class="ax" d="M12 3v12"/><circle class="yh" cx="12" cy="15" r="2.6"/>',
  // Achskreuz in den Farben des Ansichtungswürfels (X rot, Y grün, Z blau)
  bks: '<path class="axx" d="M12 15.5l7.6 4.3"/><path class="axy" d="M12 15.5l-7.6 4.3"/><path class="axz" d="M12 15.5V3.2"/>'
    + '<path fill="none" class="axx" d="M17.4 17.1l2.4 1.3-2.6.6"/><path fill="none" class="axy" d="M6.6 17.1l-2.4 1.3 2.6.6"/><path fill="none" class="axz" d="M10.2 5.4 12 3.1l1.8 2.3"/>'
    + dot(12, 15.5, 1.9, 'yh'),
  plane: poly([[2, 15], [9, 7], [22, 9], [15, 17]], 'pl'),
  /* ---------- Prüfen ---------- */
  measure: '<path class="y" d="M2 15.5L15.5 2 22 8.5 8.5 22z"/><path class="d" d="M5 12.5l2 2M8 9.5l2.6 2.6M11 6.5l2 2M14 3.5l2.6 2.6"/>',
  section: (() => { const Q = iso([12, 8], 1); return poly([Q(0, 9, 0), Q(4.5, 9, 0), Q(4.5, 9, 8), Q(0, 9, 8)], 'f2') + poly([Q(0, 0, 8), Q(4.5, 0, 8), Q(4.5, 9, 8), Q(0, 9, 8)], 'f') + poly([Q(4.5, 0, 0), Q(4.5, 9, 0), Q(4.5, 9, 8), Q(4.5, 0, 8)], 'hatch') + pl([Q(4.5, 2, 0), Q(4.5, 0, 2)], 'rt') + pl([Q(4.5, 6, 0), Q(4.5, 0, 6)], 'rt') + pl([Q(4.5, 9, 1), Q(4.5, 1, 8)], 'rt') + pl([Q(4.5, 9, 5), Q(4.5, 5, 8)], 'rt') + poly([Q(4.5, -2, -1), Q(4.5, 11, -1), Q(4.5, 11, 10), Q(4.5, -2, 10)], 'plo'); })(),
  interfere: blk([8.5, 10], 0.8, 0, 0, 0, 8, 8, 8) + blk([15.5, 12], 0.8, 0, 0, 0, 8, 8, 8, 'n') + '<path class="rf" d="M12 13.5l3.5 2v4.5L12 18z"/>',
  draftan: '<path class="gf" d="M4 20l2-14h4v14z"/><path class="yf" d="M10 6h4v14h-4z"/><path class="rf" d="M14 6h4l2 14h-6z"/><path class="d" d="M4 20h16"/>',
  overhang: '<path class="d" d="M2 21h20"/><path class="f2" d="M4 21V5h15v6H10v10z"/><path class="r" d="M10 11.2h9" stroke-width="2.6"/>' + arr(12.5, 13, 12.5, 18, 'r', 2.4) + arr(17, 13, 17, 18, 'r', 2.4),
  cog: '<circle class="w" cx="12" cy="12" r="8.5"/><path class="dd" d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12zM12 20.5A8.5 8.5 0 0 1 3.5 12H12z"/><circle class="d" cx="12" cy="12" r="8.5"/>',
  bom: '<rect class="u" x="3" y="3" width="18" height="18" rx="1.5"/><path class="hb" d="M3 3h18v4H3z"/><path class="d" d="M3 11h18M3 15h18M8 7v14"/>' + dot(5.5, 13, 1.1, 'sp') + dot(5.5, 17.5, 1.1, 'sp'),
  /* ---------- Zusammenfügen / Baugruppe ---------- */
  component: blk([12, 8], 1, 0, 0, 0, 9, 9, 8) + '<path class="g" d="M3 3h4M3 3v4M21 3h-4M21 3v4M3 21h4M3 21v-4M21 21h-4M21 21v-4"/>',
  joint: blk([7, 13], 0.7, 0, 0, 0, 7, 7, 5) + blk([17, 7], 0.7, 0, 0, 0, 7, 7, 5, 'n') + '<circle class="w" cx="12" cy="11.5" r="3.6"/><circle class="dd" cx="12" cy="11.5" r="1.4"/><path class="d" d="M12 7.9v7.2"/>',
  rigid: blk([7, 11], 0.7, 0, 0, 0, 7, 7, 6) + blk([17, 11], 0.7, 0, 0, 0, 7, 7, 6, 'n') + '<rect class="dd" x="8.5" y="6" width="7" height="2.6" rx="1.3"/>',
  insert: blk([14, 10], 0.85, 0, 0, 0, 8, 8, 7) + arr(2, 4.5, 9, 9.5, 'g') + '<circle class="gf" cx="5" cy="17" r="4"/><path class="w0" d="M5 14.8v4.4M2.8 17h4.4"/>',
  derive: DOC + blk([15.5, 14.5], 0.6, 0, 0, 0, 7, 7, 6, 'n') + arr(7, 8, 11.5, 13.5, 'g'),
  fastener: '<path class="f2" d="M6 6.5l6-3 6 3v3l-6 3-6-3z"/><path class="f" d="M6 6.5l6 3 6-3-6-3z"/><path class="n2" d="M9.6 11.3h4.8V21l-2.4 1.2L9.6 21z"/><path class="d" d="M9.6 13.5l4.8-1.2M9.6 16l4.8-1.2M9.6 18.5l4.8-1.2"/>',
  explode: blk([6, 15], 0.6, 0, 0, 0, 7, 7, 6) + blk([18, 9], 0.6, 0, 0, 0, 7, 7, 6, 'n') + arr(10, 11, 13.2, 8.5, 'oa', 2.4) + arr(7.2, 7.2, 4.6, 3, 'oa', 2.4) + arr(17, 16, 20, 20.5, 'oa', 2.4),
  /* ---------- Blech ---------- */
  smbase: '<path class="sf" d="M2 15l10-5 10 5-10 5z"/>' + blk([12, 13], 1, 0, 0, 0, 10, 10, 1.6, 'n'),
  smflange: blk([10, 13], 1, 0, 0, 0, 10, 10, 1.6) + blk([10, 13], 1, 0, 0, 1.6, 10, 1.6, 8, 'n'),
  smcontour: '<path class="n2" d="M3 19V9l5-3 13 7v4L8 10v9z"/><path class="s" d="M3 19V9l5-3"/>',
  smloft: '<path class="n2" d="M4 18l2.5-9h11l2.5 9"/><path class="f" d="M4 18l8 3.5 8-3.5-8-3.5z"/><ellipse class="n" cx="12" cy="9" rx="5.5" ry="2"/>',
  smbend: blk([10, 13], 1, 0, 0, 0, 10, 6, 1.6) + blk([10, 13], 1, 0, 0, 1.6, 10, 1.6, 7, 'n') + '<path class="s" d="M3 14.5l8.7-4.4" stroke-dasharray="2 1.5"/>',
  smjoin: '<path class="gt" d="M2.5 19h10M19 2.5v10"/><path class="nt" d="M12.5 19a6.5 6.5 0 0 0 6.5-6.5"/>',
  smconvert: blk([6, 11], 0.6, 0, 0, 0, 8, 8, 8) + arr(10, 12, 14, 12, 'oa', 2.4) + blk([17.5, 13], 0.6, 0, 0, 0, 8, 8, 1.6, 'n') + blk([17.5, 13], 0.6, 0, 0, 1.6, 8, 1.6, 7, 'n'),
  smrule: '<path class="f2" d="M3 20V9a6 6 0 0 1 6-6h12v3H9a3 3 0 0 0-3 3v11z"/><path class="ar" d="M9 9l-2.4-2.4"/><path class="d" d="M14 12h7M14 9.5h7M14 14.5h4"/>',
  smrip: blk([12, 9], 1, 0, 0, 0, 9, 9, 7) + poly([iso([12, 9], 1)(1, 1, 7), iso([12, 9], 1)(8, 1, 7), iso([12, 9], 1)(8, 8, 7), iso([12, 9], 1)(1, 8, 7)], 'h') + pl([iso([12, 9], 1)(9, 9, 0), iso([12, 9], 1)(9, 9, 7)], 'r') + CROSS(12, 21.5, 0),
  smcorner: '<path class="f2" d="M3 21V10a7 7 0 0 1 7-7h11v18z"/><path class="nt" d="M3 10a7 7 0 0 1 7-7"/><path class="s" d="M3 21L21 3" stroke-dasharray="1.6 1.6" opacity=".5"/>',
  smunfold: blk([9, 13], 0.9, 0, 0, 0, 10, 7, 1.6) + '<path class="m" d="M13 5.5l-0.2 7"/>' + blk([9, 13], 0.9, 0, -7, 0, 10, 7, 1.6, 'n') + '<path class="oa" d="M19.5 3a5 5 0 0 1 1.8 6"/><path class="oah" d="M22 9.6l-2.8-1.4 2.6-1.4z"/>',
  smrefold: blk([9, 13], 0.9, 0, 0, 0, 10, 7, 1.6) + blk([9, 13], 0.9, 0, 0, 1.6, 10, 1.6, 7, 'n') + '<path class="oa" d="M21 9a5 5 0 0 0-2-6"/><path class="oah" d="M17.4 2.2l3.1-.2-1 3z"/>',
  flat: '<path class="n" d="M2 7h6v-4h8v4h6v10h-6v4H8v-4H2z"/><path class="s" d="M8 7v10M16 7v10M8 7h8M8 17h8" stroke-dasharray="2 1.4"/>',
  nest: '<rect class="u" x="2" y="3" width="20" height="18" rx="1"/><path class="n" d="M4 5h7v6H4z"/><path class="n2" d="M13 5h7v4h-3v4h-4z"/><path class="n3" d="M4 13h6v6H4z"/><path class="n" d="M12 15h8v4h-8z"/>',
  'face-dxf': 0,
  /* ---------- Generatives Design ---------- */
  topo: '<rect class="m" x="3" y="6.5" width="18" height="14" rx="1.2"/><path class="cf" d="M5.2 8.8h13.6M6.4 9.4 12 18.8l5.6-9.4"/>' + arr(12, 1.4, 12, 6.1, 'oa', 2.6),
  /* ---------- Stahlbau ---------- */
  frame: '<path class="f2" d="M4 21V4l5 5v12z"/><path class="n2" d="M4 4h16v5H9z"/><path class="d" d="M4 4l5 5"/><path class="m" d="M6.5 20V9M10 6.5h9"/>',
  weld: blk([5, 15], 0.85, 0, 0, 0, 16, 7, 2) + blk([5, 15], 0.85, 7, 0, 2, 2, 7, 10) + '<path class="n" d="M14.2 12.5l2.4 1.4-2.4 1.2-2.4-1.2z"/><path class="nt" d="M12 14.5l4.5-2.4"/>',
  gusset: blk([12, 16], 0.85, 0, 0, 0, 12, 8, 1.8) + blk([12, 16], 0.85, 0, 0, 1.8, 1.8, 8, 10) + poly([iso([12, 16], 0.85)(1.8, 4, 1.8), iso([12, 16], 0.85)(9, 4, 1.8), iso([12, 16], 0.85)(1.8, 4, 9)], 'n'),
  endcap: blk([10, 17], 0.85, 0, 0, 0, 5, 5, 12) + blk([10, 17], 0.85, -0.6, -0.6, 12, 6.2, 6.2, 1.4, 'n'),
  cutlist: '<rect class="u" x="3" y="3" width="13" height="18" rx="1"/><path class="d" d="M5.5 7.5h8M5.5 11h8M5.5 14.5h6"/><path class="n2" d="M17 4h4v17h-4z"/><path class="r" d="M15.5 10h7"/>',
  /* ---------- Ausgabe / Dateien ---------- */
  drawing: SHEET + '<path class="d" d="M5 6h6v5H5zM13 6h6v5h-6zM5 13h6v5H5z"/><path class="hb" d="M13 15h6v3h-6z"/>' + blk([16.5, 12], 0.35, 0, 0, 0, 6, 6, 5, 'n') ,
  render: '<circle class="n2" cx="12" cy="11" r="7"/><ellipse class="w" cx="9.3" cy="8.2" rx="2.6" ry="1.8"/><path class="m" d="M3 21h18"/><ellipse class="f2" cx="12" cy="19.6" rx="6" ry="1.3"/>',
  step: DOC + blk([12, 14], 0.55, 0, 0, 0, 8, 8, 7, 'n'),
  stl: '<path class="n2" d="M12 2l9 5v10l-9 5-9-5V7z"/><path class="d" d="M3 7l9 5 9-5M12 12v10M3 7l9 15M21 7l-9 15M12 2v10"/>',
  dxf: DOC + '<path class="s" d="M8 17l3-6 3 3 2.5-4"/>' + dot(8, 17, 1.2) + dot(16.5, 10, 1.2),
  svg: DOC + '<path class="n" d="M7.5 17c0-5 9-1 9-6" fill="none"/><path class="s" d="M7.5 17c0-5 9-1 9-6"/>' + dot(7.5, 17, 1.2) + dot(16.5, 11, 1.2),
  import: '<path class="u" d="M3 14v6h18v-6"/>' + arr(12, 2, 12, 15, 'g', 4),
  package: '<path class="bx2" d="M3 8l9 4v10l-9-4z"/><path class="bx3" d="M21 8l-9 4v10l9-4z"/><path class="bx" d="M3 8l9-4 9 4-9 4z"/><path class="d" d="M7.5 6l9 4"/>',
  save: '<path class="sv" d="M4 3h13l3 3v15H4z"/><path class="u" d="M7 3v6h9V3"/><path class="u" d="M7 21v-7h10v7"/>',
  saveas: '<path class="sv" d="M3 4h12l3 3v13H3z"/><path class="u" d="M6 4v5h8V4M6 20v-6h9v6"/><path class="y" d="M19 9.5l2.5 2.5-6.5 6.5-3.2.8.8-3.2z"/>',
  print: '<path class="u" d="M7 3h10v5H7z"/><rect class="f2" x="3" y="8" width="18" height="9" rx="1.5"/><path class="u" d="M7 13h10v8H7z"/><path class="d" d="M9 16h6M9 18.5h4"/>' + dot(18, 10.5, 1, 'gh'),
  image: '<rect class="u" x="2.5" y="4" width="19" height="16" rx="1.5"/><path class="gf" d="M3.5 19l5.5-6.5 4 4 3-3 4.5 5.5z"/><circle class="yh" cx="16.5" cy="8.5" r="2"/>',
  file: DOC,
  folder: '<path class="fo" d="M2.5 6.5a1.5 1.5 0 0 1 1.5-1.5h5l2 2h9a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"/><path class="fo2" d="M2.5 10h19v8.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"/>',
  /* ---------- Skizze ---------- */
  line: '<path class="s" d="M5 19L19 5"/>' + dot(5, 19, 1.9) + dot(19, 5, 1.9),
  cline: '<path class="s" d="M4 19.5L20 4.5"/>' + dot(12, 12, 2, 'oh') + dot(4, 19.5, 1.4) + dot(20, 4.5, 1.4),
  rect: '<rect class="sf" x="4" y="6" width="16" height="12"/>' + dot(4, 6, 1.8) + dot(20, 18, 1.8),
  rectc: '<rect class="sf" x="3.5" y="5.5" width="17" height="13"/>' + dot(12, 12, 1.9, 'oh') + dot(20.5, 18.5, 1.6) + '<path class="m" d="M12 12l8.5 6.5"/>',
  rect3: '<path class="sf" d="M4 15l9-9 7 7-9 9z"/>' + dot(4, 15, 1.6) + dot(13, 6, 1.6) + dot(20, 13, 1.6),
  circle: '<circle class="sf" cx="12" cy="12" r="8.5"/>' + dot(12, 12, 1.7, 'oh') + '<path class="m" d="M12 12l6-6"/>',
  circle2: '<circle class="sf" cx="12" cy="12" r="8.5"/><path class="m" d="M4 15l16-6"/>' + dot(4, 15, 1.7) + dot(20, 9, 1.7),
  circle3: '<circle class="sf" cx="12" cy="12" r="8.5"/>' + dot(3.6, 13.5, 1.6) + dot(15.5, 4.3, 1.6) + dot(16, 19.5, 1.6),
  tcircle2: '<path class="d" d="M3 20h18M3 20L14 3"/><circle class="sf" cx="13.4" cy="14" r="6"/>',
  tcircle3: '<path class="d" d="M2 21h20M4 21L12 3l8 18"/><circle class="sf" cx="12" cy="15.4" r="4.8"/>',
  arc: '<path class="s" d="M4 18a9 9 0 0 1 16 0"/>' + dot(4, 18, 1.7) + dot(20, 18, 1.7) + dot(12, 9.5, 1.4, 'oh'),
  carc: '<path class="s" d="M19 12a7 7 0 0 1-7 7"/><path class="m" d="M12 12h7M12 12v7"/>' + dot(12, 12, 1.8, 'oh') + dot(19, 12, 1.5) + dot(12, 19, 1.5),
  tarc: '<path class="d" d="M3 18h8"/><path class="s" d="M11 18a6 6 0 0 0 6-6V5"/>' + dot(11, 18, 1.6, 'oh') + dot(17, 5, 1.6),
  polygon: '<path class="sf" d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>' + dot(12, 12, 1.5, 'oh') + dot(12, 3, 1.4) + '<circle class="m" cx="12" cy="12" r="9"/>',
  poly: '<path class="s" d="M4 18l4-11 7 3 5-5"/>' + dot(4, 18, 1.5) + dot(8, 7, 1.5) + dot(15, 10, 1.5) + dot(20, 5, 1.5),
  ellipse: '<ellipse class="sf" cx="12" cy="12" rx="9.5" ry="5.5" transform="rotate(-20 12 12)"/>' + dot(12, 12, 1.5, 'oh') + '<path class="m" d="M3 15.3L21 8.7"/>',
  slot: '<rect class="sf" x="2.5" y="7.5" width="19" height="9" rx="4.5"/><path class="m" d="M7 12h10"/>' + dot(7, 12, 1.4, 'oh') + dot(17, 12, 1.4, 'oh'),
  spline: '<path class="s" d="M3 17c3-9 6-9 9-3s6 6 9-6"/>' + dot(3, 17, 1.6) + dot(12, 14, 1.6) + dot(21, 8, 1.6),
  point: '<path class="m" d="M12 4v16M4 12h16"/>' + dot(12, 12, 2.6),
  text: '<path class="s" d="M5 5h14M12 5v15M9 20h6"/><path class="m" d="M3 22h18"/>',
  mirror: '<path class="ax" d="M12 2v20"/><path class="d" d="M3 17l5-10 2 10z"/><path class="s" d="M21 17l-5-10-2 10z"/>',
  cpattern: '<circle class="m" cx="12" cy="12" r="7.5"/>' + dot(12, 4.5, 2.2, 'oh') + dot(19.5, 12, 2.2) + dot(12, 19.5, 2.2) + dot(4.5, 12, 2.2) + dot(12, 12, 1.2, 'dd'),
  lpattern: '<rect class="sf" x="3" y="4" width="5" height="5"/><rect class="sf" x="10" y="4" width="5" height="5"/><rect class="sf" x="17" y="4" width="4" height="5"/><rect class="sf" x="3" y="12" width="5" height="5"/>' + arr(5.5, 19, 21, 19, 'oa', 2.6),
  project: blk([12, 7], 0.8, 0, 0, 0, 8, 8, 5) + '<path class="m" d="M6.4 9.5v6M17.6 9.5v6M12 12.5v6"/><path class="s" d="M3 17.5l9 4.5 9-4.5-9-4.5z"/>',
  offset: '<path class="d" d="M4 20V10a6 6 0 0 1 6-6h10"/><path class="s" d="M8 20v-9.5a2.5 2.5 0 0 1 2.5-2.5H20"/>' + arr(5, 6, 8.2, 9.2, 'oa', 2.2),
  trim: '<path class="d" d="M3 12h18"/><path class="s" d="M12 3v9"/><path class="r" d="M12 12v9" stroke-dasharray="2 1.5"/>' + CROSS(17, 17, 2.4),
  extend: '<path class="d" d="M21 3v18"/><path class="s" d="M3 12h9"/><path class="oa" d="M12 12h8.5" stroke-dasharray="2 1.5"/><path class="oah" d="M21 12l-3.2 1.8v-3.6z"/>',
  brk: '<path class="s" d="M3 12h7M14 12h7"/><path class="d" d="M12 3v18" stroke-dasharray="2 1.6"/>' + dot(10, 12, 1.6, 'oh') + dot(14, 12, 1.6, 'oh'),
  sfillet: '<path class="d" d="M4 20V12M12 4h8"/><path class="s" d="M4 12a8 8 0 0 1 8-8"/><path class="m" d="M4 4h8M4 4v8"/>',
  schamfer: '<path class="d" d="M4 20v-9M13 4h7"/><path class="s" d="M4 11l9-7"/><path class="m" d="M4 4h9M4 4v7"/>',
  rotate: '<path class="sf" d="M7 15l5-9 5 9z"/><path class="oa" d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path class="oah" d="M19.6 2.8l-.2 5.2-5-1.4z"/>',
  construction: '<path class="m" d="M4 20L20 4"/><circle class="m" cx="12" cy="12" r="6.5"/>',
  dim: '<path class="d" d="M4 6v12M20 6v12"/>' + arr(12, 12, 4.5, 12, 'ar', 2.6) + arr(12, 12, 19.5, 12, 'ar', 2.6) + '<path class="s" d="M9 8.5h6"/>',
  centermark: '<circle class="d" cx="12" cy="12" r="7"/><path class="ax" d="M12 2v20M2 12h20"/>',
  hiddenl: (() => { const Q = iso([12, 9], 1), A = Q(0, 0, 7), B = Q(9, 0, 7), Cc = Q(9, 6, 7), D = Q(0, 6, 7), E = Q(9, 0, 0), F = Q(9, 6, 0), G = Q(0, 6, 0), H = Q(0, 0, 0); return poly([A, B, E, F, G, D], 'w') + pl([H, E], 'hid') + pl([H, G], 'hid') + pl([H, A], 'hid') + pl([D, Cc, B], 'd') + pl([Cc, F], 'd') + poly([A, B, E, F, G, D], 'do'); })(),
  /* ---------- Zeichnung ---------- */
  dimbase: '<path class="d" d="M3 3v18"/>' + arr(3, 17, 21, 17, 'ar', 2.4) + arr(3, 12, 15, 12, 'ar', 2.4) + arr(3, 7, 9, 7, 'ar', 2.4),
  dimchain: '<path class="d" d="M3 8v10M9 8v10M15 8v10M21 8v10"/><path class="ar" d="M3 13h18"/><path class="arh" d="M3 13l2.4-1.3v2.6zM9 13l-2.4-1.3v2.6zM9 13l2.4-1.3v2.6zM15 13l-2.4-1.3v2.6zM15 13l2.4-1.3v2.6zM21 13l-2.4-1.3v2.6z"/>',
  dimord: '<path class="d" d="M3 21V3M3 21h18"/><path class="ar" d="M8 21V12M14 21V8M20 21V5"/>' + dot(3, 21, 1.8, 'oh'),
  dimall: '<rect class="w" x="5" y="4" width="12" height="10"/>' + arr(11, 19, 5.2, 19, 'ar', 2.4) + arr(11, 19, 16.8, 19, 'ar', 2.4) + arr(21, 9, 21, 4.2, 'ar', 2.4) + arr(21, 9, 21, 13.8, 'ar', 2.4) + '<path class="m" d="M5 15v5.5M17 15v5.5M18 4h4.5M18 14h4.5"/>',
  revtab: '<rect class="u" x="3" y="4" width="18" height="16" rx="1"/><path class="hb" d="M3 4h18v4H3z"/><path class="d" d="M3 12h18M3 16h18M8 4v16"/><path class="oa" d="M4.8 10h1.6"/>',
  holetab: '<rect class="u" x="3" y="11" width="18" height="10" rx="1"/><path class="d" d="M3 16h18M9 11v10"/><circle class="h" cx="7" cy="5.5" r="2.5"/><circle class="h" cx="16" cy="5.5" r="2.5"/>',
  auxview: '<path class="f2" d="M3 20l6-12h6l-6 12z"/><path class="n" d="M14 4l7 0 0 7-7 0z" transform="rotate(25 17.5 7.5)"/>' + arr(10, 11, 14.5, 8.5, 'ar', 2.4),
  surf: '<path class="d" d="M3 20h18"/><path class="n" d="M6 20l-3-5h5z" opacity="0"/><path class="d" d="M5 13l3 7 6-14h7"/><path class="s" d="M14 6h7"/>',
  gdt: '<rect class="w" x="2" y="8" width="20" height="8"/><path class="d" d="M8 8v8M15 8v8"/><path class="s" d="M3.5 14l3-4M3.5 10l3 4" opacity="0"/><circle class="s" cx="5" cy="12" r="2"/><path class="d" d="M10 12h3M17.5 10.5h2.5v3h-2.5z"/>',
  datum: '<rect class="w" x="7" y="2.5" width="10" height="9"/><path class="d" d="M12 11.5v5"/><path class="dd" d="M12 16.5l-4 5h8z"/><path class="s" d="M10 9.5l2-5 2 5M10.7 8h2.6"/>',
  breakout: (() => { const Q = iso([12, 7], 1); return blk([12, 7], 1, 0, 0, 0, 9, 9, 9) + poly([Q(1, 9, 1.2), Q(3, 9, 0.7), Q(5.5, 9, 1.4), Q(7.4, 9, 3), Q(7, 9, 6), Q(4.5, 9, 7.6), Q(2.2, 9, 6.8), Q(1.2, 9, 4.4)], 'hatch') + pl([Q(2, 9, 2), Q(5, 9, 5)], 'rt') + pl([Q(3.5, 9, 1.5), Q(6.5, 9, 4.5)], 'rt') + pl([Q(1.5, 9, 4), Q(3.5, 9, 6)], 'rt'); })(),
  zoom: '<circle class="w" cx="10" cy="10" r="6.5"/><path class="d" d="M15 15l6 6" stroke-width="2.4"/><path class="s" d="M7 10h6M10 7v6"/>',
  /* ---------- Weitere ---------- */
  surface: 0,
  filter: '<path class="fu" d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  gear: '<path class="f2" d="M10.3 2.5h3.4l.5 2.6 2 .9 2.2-1.5 2.4 2.4-1.5 2.2.9 2 2.6.5v3.4l-2.6.5-.9 2 1.5 2.2-2.4 2.4-2.2-1.5-2 .9-.5 2.6h-3.4l-.5-2.6-2-.9-2.2 1.5-2.4-2.4 1.5-2.2-.9-2-2.6-.5v-3.4l2.6-.5.9-2-1.5-2.2 2.4-2.4 2.2 1.5 2-.9z"/><circle class="w" cx="12" cy="12" r="3.2"/>',
  orbit: '<ellipse class="m" cx="12" cy="12" rx="10" ry="4.5"/><circle class="f2" cx="12" cy="12" r="4.5"/><path class="oa" d="M18 7.6a10 4.5 0 0 1 3.6 2.6"/><path class="oah" d="M22.4 11.6l-3.1-.2 1.6-2.6z"/>',
  pan: '<path class="f2" d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L3 13.5a1.5 1.5 0 0 1 2.4-1.8z"/>',
  lookat: blk([12, 12], 0.8, 0, 0, 0, 8, 8, 6) + poly([iso([12, 12], 0.8)(0, 0, 6), iso([12, 12], 0.8)(8, 0, 6), iso([12, 12], 0.8)(8, 8, 6), iso([12, 12], 0.8)(0, 8, 6)], 'n') + arr(12, 1, 12, 7, 'ar', 2.6),
  display: blk([12, 8], 1, 0, 0, 0, 9, 9, 8) + '<path class="d" d="M12 8v9.5" opacity=".6"/>',
  grid: '<path class="m" d="M3 8h18M3 12h18M3 16h18M7 4v16M12 4v16M17 4v16" stroke-dasharray="none"/><rect class="d" x="3" y="4" width="18" height="16"/>',
  fit: '<path class="ar" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' + blk([12, 11], 0.6, 0, 0, 0, 8, 8, 6),
  home: '<path class="f2" d="M5 10.5V20h14v-9.5"/><path class="n" d="M3 11.5L12 4l9 7.5"/><path class="u" d="M10 20v-5h4v5"/>',
  tlstart: '<path d="M6 5v14M18 5l-9 7 9 7z"/>',
  tlprev: '<path d="M16 5l-9 7 9 7z"/>',
  tlnext: '<path d="M8 5l9 7-9 7z"/>',
  tlend: '<path d="M18 5v14M6 5l9 7-9 7z"/>',
  check: '<path class="g" d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  caret: '<path d="M9 6l6 6-6 6"/>',
  undo: '<path class="ar" d="M4 9h11a5 5 0 0 1 0 10h-3"/><path class="arh" d="M3 9l5.5-4.5v9z"/>',
  redo: '<path class="ar" d="M20 9H9a5 5 0 0 0 0 10h3"/><path class="arh" d="M21 9l-5.5-4.5v9z"/>',
  eye: '<path class="w" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle class="ir" cx="12" cy="12" r="3.2"/>',
  eyeOff: '<path class="m" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path class="d" d="M4 4l16 16"/>',
  body: blk([12, 6.5], 0.9, 0, 0, 0, 9, 9, 9),
  /* ---------- Sonstiges aus dem Menüband ---------- */
  smbase2: 0,
  dxfin: 0,
  surfx: 0
};
// Platzhalter ohne eigenes Bild entfernen
Object.keys(P).forEach(k => { if (!P[k]) delete P[k]; });
P['face-dxf'] = P.dxf;

export const ICON_NAMES = Object.keys(P);
export function icon(name, size = 20) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
