// Dokumentmodell eines Teils: eine geordnete Liste von Features (die Zeitleiste).
import { migrateSketch } from './sketch/model.js';
// Alles hier ist reines JSON, damit Speichern, Rückgängig und der Kern-Worker
// dieselben Daten benutzen.

export const FORMAT_VERSION = 2;

/* Physikalische Materialien (Dichte in g/cm³) mit passender Darstellung */
export const MATERIALS = {
  none: { label: 'Standard', rho: null, color: '#c7cfd8' },
  steel: { label: 'Stahl', rho: 7.85, color: '#8d949c' },
  stainless: { label: 'Edelstahl', rho: 7.9, color: '#b9c0c7' },
  alu: { label: 'Aluminium', rho: 2.7, color: '#d3d8de' },
  brass: { label: 'Messing', rho: 8.5, color: '#c9a14a' },
  copper: { label: 'Kupfer', rho: 8.96, color: '#c27a4a' },
  pla: { label: 'PLA', rho: 1.24, color: '#e8743b' },
  petg: { label: 'PETG', rho: 1.27, color: '#3d86c6' },
  abs: { label: 'ABS', rho: 1.04, color: '#4b5563' },
  tpu: { label: 'TPU', rho: 1.21, color: '#2f2f35' },
  nylon: { label: 'Nylon (PA12)', rho: 1.01, color: '#ece7dc' },
  wood: { label: 'Holz (Fichte)', rho: 0.47, color: '#c9a173' }
};

/* Ursprungsebenen, Z zeigt nach oben. y = n × x */
export const ORIGIN_PLANES = {
  XY: { key: 'XY', label: 'XY · Draufsicht', o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
  XZ: { key: 'XZ', label: 'XZ · Vorderansicht', o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] },
  YZ: { key: 'YZ', label: 'YZ · Seitenansicht', o: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] }
};

export const FEATURE_TYPES = {
  sketch: { label: 'Skizze', icon: 'sketch' },
  extrude: { label: 'Extrusion', icon: 'extrude' },
  revolve: { label: 'Drehung', icon: 'revolve' },
  fillet: { label: 'Verrundung', icon: 'fillet' },
  chamfer: { label: 'Fase', icon: 'chamfer' },
  shell: { label: 'Schale', icon: 'shell' },
  draft: { label: 'Formschräge', icon: 'draft' },
  plane: { label: 'Arbeitsebene', icon: 'wplane' },
  axis: { label: 'Arbeitsachse', icon: 'waxis' },
  point: { label: 'Arbeitspunkt', icon: 'wpoint' },
  bks: { label: 'Benutzerkoordinatensystem', icon: 'bks' },
  hole: { label: 'Bohrung', icon: 'hole' },
  pattern: { label: 'Muster', icon: 'fpattern' },
  mirror: { label: 'Spiegelung', icon: 'fmirror' },
  move: { label: 'Verschieben', icon: 'move' },
  scale: { label: 'Skalieren', icon: 'scale' },
  presspull: { label: 'Drücken/Ziehen', icon: 'presspull' },
  moveface: { label: 'Fläche verschieben', icon: 'presspull' },
  boss: { label: 'Zapfen', icon: 'pcyl' },
  snapfit: { label: 'Schnappverschluss', icon: 'rib' },
  lippe: { label: 'Lippe', icon: 'shell' },
  joint: { label: 'Gelenk', icon: 'joint' },
  jorigin: { label: 'Gelenkursprung', icon: 'jorigin' },
  sweep: { label: 'Sweeping', icon: 'sweep' },
  pipe: { label: 'Rohr', icon: 'pipe' },
  thread: { label: 'Gewinde', icon: 'thread' },
  fastener: { label: 'Normteil', icon: 'fastener' },
  loft: { label: 'Erhebung', icon: 'loft' },
  remove: { label: 'Entfernen', icon: 'trash' },
  rigid: { label: 'Starre Gruppe', icon: 'rigid' },
  motionlink: { label: 'Bewegungsverknüpfung', icon: 'joint' },
  defeature: { label: 'Elemente entfernen', icon: 'defeature' },
  combine: { label: 'Kombinieren', icon: 'combine' },
  sm_base: { label: 'Lasche', icon: 'smbase' },
  sm_flange: { label: 'Lasche an Kante', icon: 'smflange' },
  sm_rip: { label: 'Auftrennung', icon: 'smrip' },
  sm_corner: { label: 'Blechabrundung', icon: 'smcorner' },
  sm_join: { label: 'Durch Biegung verbinden', icon: 'smjoin' },
  sm_loft: { label: 'Übergangslasche', icon: 'smloft' },
  sm_unfold: { label: 'Abwickeln', icon: 'smunfold' },
  sm_refold: { label: 'Zurückfalten', icon: 'smrefold' },
  split: { label: 'Körper teilen', icon: 'split' },
  silsplit: { label: 'Silhouette geteilt', icon: 'splitface' },
  frame: { label: 'Rahmen', icon: 'frame' },
  weld: { label: 'Schweißnaht', icon: 'weld' },
  align: { label: 'Ausrichten', icon: 'align' },
  gusset: { label: 'Knotenblech', icon: 'gusset' },
  endcap: { label: 'Endkappe', icon: 'endcap' },
  sm_contour: { label: 'Konturlasche', icon: 'smcontour' },
  rib: { label: 'Rippe', icon: 'rib' },
  web: { label: 'Steg', icon: 'web' },
  emboss: { label: 'Prägen', icon: 'text' },
  canvas: { label: 'Ansichtsbereich', icon: 'image' },
  bound: { label: 'Begrenzender Volumenkörper', icon: 'pbox' },
  boundfill: { label: 'Begrenzungsfüllung', icon: 'pbox' },
  thicken: { label: 'Verdicken', icon: 'shell' },
  topo: { label: 'Topologieoptimierung', icon: 'topo' },
  gdform: { label: 'Generatives Design', icon: 'topo' },
  gdform3: { label: 'Generatives Design (3D)', icon: 'topo' },
  gitter: { label: 'Volumetrisches Gitter', icon: 'topo' },
  constraint: { label: 'Abhängigkeiten', icon: 'joint' },
  sm_bend: { label: 'Biegen', icon: 'smbend' },
  sm_convert: { label: 'In Blech umwandeln', icon: 'smconvert' },
  import: { label: 'Import', icon: 'import' },
  derive: { label: 'Ableiten', icon: 'derive' },
  coil: { label: 'Spirale', icon: 'coil' },
  primitive: { label: 'Grundkörper', icon: 'pbox' }
};
/* Features, die einen Werkzeugkörper erzeugen und sich mustern/spiegeln lassen */
export const TOOL_FEATURES = new Set(['extrude', 'revolve', 'hole', 'pattern', 'mirror', 'presspull', 'sweep', 'pipe', 'loft', 'sm_base', 'sm_contour', 'rib', 'web', 'coil', 'primitive']);

/* ---------- Arbeitsebenen ---------- */
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/* Ebene einer Arbeitsebene aus ihrer Basis und dem Versatz; planes: Map id → Ebene der früheren Arbeitsebenen */
export function workPlaneOf(f, planes) {
  const b = f.base || { kind: 'origin', key: 'XY' };
  let base = null;
  if (b.kind === 'origin' || b.kind === 'face' || b.kind === 'plane') base = planeOfRef(b, planes);
  else if (b.kind === 'mid') {
    // Mittelebene zwischen zwei parallelen Ebenen, Lage und Richtung der ersten
    const a = planeOfRef(b.a, planes), c = planeOfRef(b.b, planes);
    if (!a || !c || Math.abs(dot3(a.n, c.n)) < 1 - 1e-6) return null;
    base = { o: add3(a.o, mul3(a.n, dot3(sub3(c.o, a.o), a.n) / 2)), x: a.x, y: a.y, n: a.n };
  }
  else if (b.kind === 'perp' && b.a) {
    /* Lotrechte Ebene: die neue Ebene steht senkrecht auf einer Ebene oder Fläche und enthält
       deren Normale. Richtung wie bei „+90° um die x-Achse der Basis“ – mit „Winkel“ und „Drehachse“
       danach jede Lage um die Normale der Basis. Lage: durch den angeklickten Punkt (b.p), sonst durch
       den Ursprung der Basis; „Abstand“ verschiebt wie sonst entlang der eigenen Normale. */
    const p = planeOfRef(b.a, planes);
    if (!p) return null;
    base = { o: Array.isArray(b.p) ? b.p.slice() : p.o.slice(), x: p.x, y: p.n, n: mul3(p.y, -1) };
  }
  else if (b.kind === 'tangent' && b.o && b.d && b.p && Number(b.r) > 0) {
    // Tangentialebene an einen Zylinder (Achse o/d, Radius r) an der angeklickten Stelle p; x längs der Achse
    const dl = Math.hypot(...b.d), d = mul3(b.d, 1 / dl), rel = sub3(b.p, b.o), along = dot3(rel, d);
    const rad = sub3(rel, mul3(d, along)), rl = Math.hypot(...rad);
    if (rl < 1e-9) return null;
    const n = mul3(rad, 1 / rl);
    base = { o: add3(b.o, add3(mul3(d, along), mul3(n, Number(b.r)))), x: d, y: cross3(n, d), n };
  }
  else if (b.kind === 'edges' && b.e1 && b.e2) {
    // Ebene durch zwei gerade Kanten (schneidend oder parallel, aber in einer Ebene)
    const l1 = Math.hypot(...b.e1.d), d1 = mul3(b.e1.d, 1 / l1), gap = sub3(b.e2.p, b.e1.p);
    let n = cross3(d1, b.e2.d);
    if (Math.hypot(...n) < 1e-9 * Math.hypot(...b.e2.d)) n = cross3(d1, gap);
    const nl = Math.hypot(...n);
    if (nl < 1e-9) return null;
    n = mul3(n, 1 / nl);
    if (Math.abs(dot3(n, gap)) > 1e-6 * Math.max(1, Math.hypot(...gap))) return null; // windschief
    base = { o: b.e1.p.slice(), x: d1, y: cross3(n, d1), n };
  }
  else if (b.kind === 'path' && Array.isArray(b.pts) && b.pts.length >= 2) {
    // Ebene entlang Pfad: senkrecht zur Kante an der Stelle pos (0–100 % der Länge); x quer zur Kante
    const P = b.pts, seg = [];
    let L = 0;
    for (let i = 1; i < P.length; i++) { const l = Math.hypot(...sub3(P[i], P[i - 1])); seg.push(l); L += l; }
    if (L < 1e-9) return null;
    let s = Math.max(0, Math.min(100, Number(f.pos ?? 50))) / 100 * L, i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const k = seg[i] > 0 ? Math.min(1, s / seg[i]) : 0;
    const o = add3(P[i], mul3(sub3(P[i + 1], P[i]), k));
    // Tangente: an Stützpunkten gemittelt, damit sie bei fein aufgelösten Bögen stetig ist
    const dir = j => { const d = sub3(P[j + 1], P[j]), l = Math.hypot(...d); return l > 0 ? mul3(d, 1 / l) : null; };
    let t = dir(i);
    if (k < 1e-9 && i > 0 && dir(i - 1)) t = add3(t, dir(i - 1));
    else if (k > 1 - 1e-9 && i < seg.length - 1 && dir(i + 1)) t = add3(t, dir(i + 1));
    const tl = Math.hypot(...t);
    if (!(tl > 1e-12)) return null;
    const n = mul3(t, 1 / tl), ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let x = cross3(ref, n);
    x = mul3(x, 1 / Math.hypot(...x));
    base = { o, x, y: cross3(n, x), n };
  }
  else if (b.kind === 'points' && Array.isArray(b.pts) && b.pts.length === 3) {
    // Ebene durch drei Punkte: Ursprung im 1. Punkt, x zum 2. Punkt
    const [p1, p2, p3] = b.pts, u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]], v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], ln = Math.hypot(...nn), lu = Math.hypot(...u);
    if (ln < 1e-9 || lu < 1e-9) return null;
    const n = nn.map(q => q / ln), x = u.map(q => q / lu), y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    base = { o: p1.slice(), x, y, n };
  }
  if (!base) return null;
  const off = Number(f.offset) || 0, s = f.flip ? -1 : 1;
  let n = mul3(base.n, s), y = mul3(base.y, s), x = base.x.slice();
  // Ebene unter Winkel: um die eigene x- oder y-Achse gedreht (durch den Ursprung der versetzten Ebene)
  const ang = (Number(f.angle) || 0) * Math.PI / 180;
  if (Math.abs(ang) > 1e-9) {
    const c = Math.cos(ang), sn = Math.sin(ang);
    if (f.axis === 'y') { const nx = add3(mul3(x, c), mul3(n, -sn)), nn = add3(mul3(x, sn), mul3(n, c)); x = nx; n = nn; }
    else { const ny = add3(mul3(y, c), mul3(n, sn)), nn = add3(mul3(y, -sn), mul3(n, c)); y = ny; n = nn; }
  }
  return { key: 'WP', label: f.name, o: add3(base.o, mul3(base.n, off)), x, y, n };
}
/* Ebenen-Bezug (Ursprungsebene, ebene Körperfläche, Arbeitsebene) → Ebene */
export function planeOfRef(r, planes) {
  if (!r) return null;
  if (r.kind === 'origin') return ORIGIN_PLANES[r.key] || null;
  if (r.kind === 'face') return r.plane || null;
  if (r.kind === 'plane') return planes.get(r.id) || null;
  return null;
}

/* ---------- Arbeitsachsen ---------- */
export const ORIGIN_AXES = {
  X: { o: [0, 0, 0], d: [1, 0, 0], label: 'X-Achse' },
  Y: { o: [0, 0, 0], d: [0, 1, 0], label: 'Y-Achse' },
  Z: { o: [0, 0, 0], d: [0, 0, 1], label: 'Z-Achse' }
};
/* Achse einer Arbeitsachse { o, d } aus ihrer Basis:
   origin (X/Y/Z), geom (Kante/Kreiskante/Zylinder, fest gespeichert), planes (Schnitt zweier Ebenen), points (zwei Punkte) */
export function workAxisOf(f, planes) {
  const b = f.base;
  if (!b) return null;
  let o = null, d = null;
  if (b.kind === 'origin' && ORIGIN_AXES[b.key]) ({ o, d } = ORIGIN_AXES[b.key]);
  else if (b.kind === 'geom' && b.o && b.d) { o = b.o; d = b.d; }
  else if (b.kind === 'points' && Array.isArray(b.pts) && b.pts.length === 2) { o = b.pts[0]; d = sub3(b.pts[1], b.pts[0]); }
  else if (b.kind === 'planes') {
    const p1 = planeOfRef(b.a, planes), p2 = planeOfRef(b.b, planes);
    if (!p1 || !p2) return null;
    const n1 = p1.n, n2 = p2.n, c = dot3(n1, n2), det = 1 - c * c;
    if (det < 1e-10) return null; // parallel
    const h1 = dot3(n1, p1.o), h2 = dot3(n2, p2.o);
    o = add3(mul3(n1, (h1 - h2 * c) / det), mul3(n2, (h2 - h1 * c) / det));
    d = cross3(n1, n2);
  }
  if (!o || !d) return null;
  const l = Math.hypot(...d);
  if (l < 1e-9) return null;
  return { o: o.slice(), d: d.map(v => v / l), label: f.name };
}

/* Lage eines Arbeitspunkts: fest gespeicherter Punkt (Ecke, Kantenmitte, Kreismitte), Koordinaten oder –
   durch zwei Kanten (Schnitt bzw. Mitte der kürzesten Verbindung), durch drei Ebenen, an Kante und Ebene oder entlang
   einer Kante (pos in % ihrer Länge). Ebenen-Bezüge laufen über planes und wandern mit Arbeitsebenen mit. */
export function workPointOf(f, planes = new Map()) {
  const b = f.base;
  if (!b) return null;
  if (b.kind === 'coords') return [Number(b.x) || 0, Number(b.y) || 0, Number(b.z) || 0];
  if (b.kind === 'edges') {
    if (!b.e1 || !b.e2) return null;
    const d1 = b.e1.d, d2 = b.e2.d, w = sub3(b.e1.p, b.e2.p);
    const a = dot3(d1, d1), bb = dot3(d1, d2), c = dot3(d2, d2), d = dot3(d1, w), e = dot3(d2, w), den = a * c - bb * bb;
    if (Math.abs(den) < 1e-12) return null; // parallel
    const s = (bb * e - c * d) / den, t = (a * e - bb * d) / den;
    return mul3(add3(add3(b.e1.p, mul3(d1, s)), add3(b.e2.p, mul3(d2, t))), 0.5);
  }
  if (b.kind === 'planes3') {
    const P = [b.a, b.b, b.c].map(r => planeOfRef(r, planes));
    if (P.some(p => !p)) return null;
    const [n1, n2, n3] = P.map(p => p.n), [h1, h2, h3] = P.map(p => dot3(p.n, p.o));
    const det = dot3(n1, cross3(n2, n3));
    if (Math.abs(det) < 1e-12) return null;
    return mul3(add3(add3(mul3(cross3(n2, n3), h1), mul3(cross3(n3, n1), h2)), mul3(cross3(n1, n2), h3)), 1 / det);
  }
  if (b.kind === 'edgeplane') {
    const pl = b.e && planeOfRef(b.pl, planes);
    if (!pl) return null;
    const den = dot3(pl.n, b.e.d);
    if (Math.abs(den) < 1e-12) return null; // Kante parallel zur Ebene
    return add3(b.e.p, mul3(b.e.d, dot3(pl.n, sub3(pl.o, b.e.p)) / den));
  }
  if (b.kind === 'path' && Array.isArray(b.pts) && b.pts.length >= 2) {
    const Q = b.pts, seg = [];
    let L = 0;
    for (let i = 1; i < Q.length; i++) { const l = Math.hypot(...sub3(Q[i], Q[i - 1])); seg.push(l); L += l; }
    if (L < 1e-9) return null;
    let s = Math.max(0, Math.min(100, Number(f.pos ?? 50))) / 100 * L, i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const k = seg[i] > 0 ? Math.min(1, s / seg[i]) : 0;
    return add3(Q[i], mul3(sub3(Q[i + 1], Q[i]), k));
  }
  return Array.isArray(b.p) && b.p.length === 3 ? b.p.slice() : null;
}

/* ---------- Benutzerkoordinatensystem (BKS) ---------- */
/* Benutzerkoordinatensystem: ein Ursprung mit X-, Y- und Z-Achse. Die Lage ist
   genau die einer Arbeitsebene (Grundebene, Abstand, Winkel um Ebenen-X oder -Y, Richtung), deshalb
   nutzt das BKS workPlaneOf. Dazu kommen die drei Achsen und der Ursprung – sie heißen
   „<Feature-ID>:x/y/z“ (der Ursprung trägt die Feature-ID selbst), damit Skizzen, Drehungen,
   Muster und Punkte ganz normal auf sie zeigen können und alles mitwandert, wenn sich die Basis ändert. */
export const BKS_AXES = ['x', 'y', 'z'];
export const bksAxisId = (id, k) => `${id}:${k}`;
/* Eigentümer eines Achsbezugs: aus „abc:x“ wird „abc“ (eigene Achsen haben keinen Doppelpunkt) */
export const refOwner = id => { const s = String(id == null ? '' : id), i = s.indexOf(':'); return i < 0 ? s : s.slice(0, i); };
/* Name einer Ebene des BKS: ohne Zusatz XY, sonst nach ihrer Normalen (YZ, ZX) */
export const bksPlaneLabel = (name, k) => `${name} (${k === 'x' ? 'YZ' : k === 'y' ? 'ZX' : 'XY'})`;
/* Ebene, Achsen und Ursprung eines BKS; null, wenn die Basis fehlt. „Drehung um Z“ (rot) dreht X und Y
   um die eigene Z-Achse, „Ursprung“ (originP) legt ihn auf einen angeklickten Punkt. */
export function bksOf(f, planes) {
  const p = workPlaneOf(f, planes);
  if (!p) return null;
  const a = (Number(f.rot) || 0) * Math.PI / 180;
  const x = a ? add3(mul3(p.x, Math.cos(a)), mul3(p.y, Math.sin(a))) : p.x.slice();
  const y = a ? sub3(mul3(p.y, Math.cos(a)), mul3(p.x, Math.sin(a))) : p.y.slice();
  const o = Array.isArray(f.originP) ? f.originP.slice() : p.o.slice();
  const plane = { ...p, o, x, y };
  /*: zu einem BKS gehören drei Skizzenebenen – XY (ohne Zusatz) und die Ebenen mit der
     X- bzw. Y-Achse als Normale (YZ und ZX). Ihre IDs tragen :x und :y, wie die Achsen. */
  const sides = { x: { ...plane, x: y, y: p.n, n: x }, y: { ...plane, x: p.n, y: x, n: y } };
  const axes = {};
  const dirs = [x, y, p.n];
  BKS_AXES.forEach((k, i) => { axes[k] = { o: o.slice(), d: dirs[i].slice(), label: `${f.name} ${k.toUpperCase()}-Achse` }; });
  return { plane, sides, axes, point: o };
}

/* Arbeitsebenen und -achsen der Reihe nach auflösen; Skizzen auf Arbeitsebenen und Achsbezüge (axisRef.id) nachführen.
   Gibt die Ebenen zurück (Map id → Ebene), die Achsen hängen als planes.axes (Map id → { o, d }) daran. */
export function syncWorkPlanes(features) {
  const planes = new Map(), axes = new Map(), points = new Map();
  planes.axes = axes; planes.points = points;
  features.forEach(f => {
    if (f.type === 'plane') { const p = workPlaneOf(f, planes); if (p) planes.set(f.id, p); }
    else if (f.type === 'bks') {
      const b = bksOf(f, planes);
      if (!b) return;
      planes.set(f.id, b.plane);
      BKS_AXES.forEach(k => {
        axes.set(bksAxisId(f.id, k), b.axes[k]);
        if (b.sides[k]) planes.set(bksAxisId(f.id, k), b.sides[k]);
      });
      points.set(f.id, b.point);
    }
    else if (f.type === 'axis') { const a = workAxisOf(f, planes); if (a) axes.set(f.id, a); }
    else if (f.type === 'point') { const p = workPointOf(f, planes); if (p) points.set(f.id, p); }
    else if (f.type === 'sketch' && f.planeRef) {
      const p = planes.get(f.planeRef);
      if (p) f.plane = { ...p, label: p.label };
    }
    ['axisRef', 'axis2Ref'].forEach(k => {
      const r = f[k];
      if (!r || !r.id) return;
      const a = axes.get(r.id);
      if (a) f[k] = { ...r, o: a.o, d: a.d, label: a.label };
    });
  });
  return planes;
}

/* Vorgabenamen neuer Dokumente und Features in der Sprache der Oberfläche (main.js setzt bei Englisch t aus i18n.js):
   „Extrude1“ statt „Extrusion1“. Gespeichert wird der Name, wie er entsteht. */
let nameOf = s => s;
export function setDefaultNames(fn) { nameOf = fn; }
export const defaultName = s => nameOf(s);
export const isDefaultPartName = n => n === 'Teil1' || n === nameOf('Teil1');
export const isDefaultAsmName = n => /^Baugruppe\d*$/.test(n) || n === nameOf('Baugruppe1');
export function newDoc(name = nameOf('Teil1'), kind = 'part') {
  return { format: FORMAT_VERSION, app: 'cantcodecad', name, kind, units: 'mm', features: [], bodies: {}, components: [], inserts: [] };
}

/* Dokumentart: 'part' (Bauteilkonstruktion, ein Teil ohne Komponenten und Gelenke),
   'assembly' (Baugruppenkonstruktion: Teile einfügen, Komponenten, Gelenke, Normteile) oder 'drawing' (Zeichnung:
   verweist mit ref auf ein Teil/eine Baugruppe und trägt eine Kopie des Modells für den Fall, dass die Datei fehlt).
   Ältere Dateien ohne Angabe werden nach ihrem Inhalt eingeordnet. */
export const ASM_FEATURES = ['joint', 'fastener', 'constraint'];
export function inferKind(d) {
  if (!d) return 'part';
  if (d.kind === 'part' || d.kind === 'assembly' || d.kind === 'drawing') return d.kind;
  return (d.inserts || []).length || (d.components || []).length || (d.features || []).some(f => ASM_FEATURES.includes(f.type)) ? 'assembly' : 'part';
}
/* Kann das Dokument eine Bauteilkonstruktion sein? (keine Baugruppen-Inhalte) */
export const partCompatible = d => !(d.inserts || []).length && !(d.components || []).length && !(d.features || []).some(f => ASM_FEATURES.includes(f.type));

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

/* nächster freier Name mit Zahl, z. B. „Fläche teilen2“ (für Befehle, die ein vorhandenes Feature mit anderer Art nutzen) */
export function nextFreeName(doc, base) {
  let n = 1;
  const names = new Set(doc.features.map(f => f.name));
  while (names.has(base + n)) n++;
  return base + n;
}
export function nextName(doc, type) {
  const base = nameOf(FEATURE_TYPES[type].label);
  let n = 1;
  const names = new Set(doc.features.map(f => f.name));
  while (names.has(base + n)) n++;
  return base + n;
}

export const clone = o => JSON.parse(JSON.stringify(o));

/* Felder des Schriftfelds, die der Benutzer überschreiben kann (leer = automatisch) */
export const TB_KEYS = ['name', 'number', 'author', 'date', 'material', 'tol', 'rev'];
export const TB_TEMPLATES = ['iso', 'simple', 'custom'];
export const TB_EXTRA_MAX = 9;  // freie Felder des Schriftfelds (Bezeichnung + Wert), je Zeile drei

/* eigene Schriftfeld-Vorlage (bereinigtes SVG, siehe drawing-ws.js): Inhalt, viewBox und Größe in mm */
export const validTbCustom = c => !!c && typeof c === 'object' && typeof c.inner === 'string' && c.inner.length <= 200000
  && Array.isArray(c.vb) && c.vb.length === 4 && c.vb.every(v => Number.isFinite(Number(v))) && Number(c.vb[2]) > 0 && Number(c.vb[3]) > 0
  && Number(c.w) > 0 && Number(c.h) > 0 && Number(c.w) <= 400 && Number(c.h) <= 300;
export function validateDoc(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.features)) throw new Error('Das ist keine cantcodecad-Datei.');
  const features = d.features.map(f => {
    if (!FEATURE_TYPES[f.type]) throw new Error(`Unbekanntes Feature "${f.type}" in der Datei.`);
    if (!f.id) f.id = uid();
    return f.type === 'sketch' ? migrateSketch(f) : f;
  });
  const bodies = {};
  if (d.bodies && typeof d.bodies === 'object') Object.entries(d.bodies).forEach(([id, b]) => { if (b && typeof b === 'object') bodies[id] = { name: String(b.name || '').slice(0, 60), hidden: !!b.hidden, material: MATERIALS[b.material] ? b.material : 'none', color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '' }; });
  // Instanz: Körper sind versetzte Kopien der Original-Komponente `von` (Lage R zeilenweise 3 × 3, t)
  const zahlen = (a, n) => Array.isArray(a) && a.length === n && a.every(v => isFinite(v));
  const inst = x => (x && typeof x.von === 'string' && zahlen(x.R, 9) && zahlen(x.t, 3) ? { von: x.von, R: x.R.map(Number), t: x.t.map(Number) } : null);
  const components = Array.isArray(d.components) ? d.components.filter(c => c && c.id).map(c => ({ id: String(c.id), name: String(c.name || 'Komponente').slice(0, 60), bodies: Array.isArray(c.bodies) ? c.bodies.map(String) : [], parent: c.parent ? String(c.parent) : null, ...(inst(c.instanz) ? { instanz: inst(c.instanz) } : {}) })) : [];
  // Hierarchie: Eltern müssen existieren, keine Kreise
  const cids = new Set(components.map(c => c.id));
  components.forEach(c => { if (c.parent && (!cids.has(c.parent) || c.parent === c.id)) c.parent = null; });
  components.forEach(c => { const seen = new Set([c.id]); let p = c.parent; while (p) { if (seen.has(p)) { c.parent = null; break; } seen.add(p); p = (components.find(x => x.id === p) || {}).parent; } });
  const inserts = Array.isArray(d.inserts) ? d.inserts.filter(i => i && i.id && i.part).map(i => ({
    id: String(i.id), name: String(i.name || 'Teil').slice(0, 60), file: i.file ? String(i.file) : '',
    at: Array.isArray(i.at) && i.at.length === 3 ? i.at.map(Number) : [0, 0, 0],
    rot: i.rot && typeof i.rot === 'object' ? { axis: ['X', 'Y', 'Z'].includes(i.rot.axis) ? i.rot.axis : 'Z', angle: Number(i.rot.angle) || 0 } : null,
    part: validateDoc(i.part)
  })) : [];
  const out = { format: FORMAT_VERSION, app: 'cantcodecad', name: String(d.name || 'Teil1'), kind: inferKind({ ...d, features, components, inserts }), units: 'mm', features, bodies, components, inserts };
  // Dokumenteinstellungen → Einheiten: nur Anzeige und Eingabe, gespeichert wird weiter in mm (units)
  if (['mm', 'cm', 'm', 'in'].includes(d.einheit)) out.einheit = d.einheit;
  if (d.sheet && typeof d.sheet === 'object') out.sheet = { t: Number(d.sheet.t) || 2, r: Number(d.sheet.r) >= 0 ? Number(d.sheet.r) : 2, k: Number(d.sheet.k) || 0.44, ...(typeof d.sheet.name === 'string' && d.sheet.name ? { name: d.sheet.name.slice(0, 80) } : {}), ...(['round', 'none'].includes(d.sheet.cornerRelief) ? { cornerRelief: d.sheet.cornerRelief, ...(d.sheet.cornerRelief === 'round' ? { cornerReliefD: Number(d.sheet.cornerReliefD) > 0 ? Number(d.sheet.cornerReliefD) : null } : {}) } : {}) };
  // Konfigurationen: Spalten p:<Parameter> bzw. s:<Feature-ID> (unterdrückt), Zeilen mit Werten je Spalte
  if (d.configs && Array.isArray(d.configs.cols) && Array.isArray(d.configs.rows) && d.configs.rows.length) {
    const cols = d.configs.cols.filter(c => typeof c === 'string' && /^[ps]:/.test(c)).slice(0, 60);
    const rows = d.configs.rows.filter(r => r && r.id && r.name).slice(0, 200).map(r => ({ id: String(r.id), name: String(r.name).slice(0, 60), vals: Object.fromEntries(cols.map(c => [c, r.vals && r.vals[c] != null ? (c[0] === 's' ? !!r.vals[c] : String(r.vals[c]).slice(0, 200)) : (c[0] === 's' ? false : '')])) }));
    // Regeln: Wenn-Bedingungen auf Spalten, dann Werte in Spalten setzen
    const okCol = c => typeof c === 'string' && /^[ps]:/.test(c), OPS = ['=', '≠', '<', '≤', '>', '≥'];
    const wertVon = (c, w) => (c[0] === 's' ? !!w : String(w ?? '').slice(0, 200));
    const regeln = (Array.isArray(d.configs.regeln) ? d.configs.regeln : []).filter(g => g && g.id && Array.isArray(g.wenn) && Array.isArray(g.dann)).slice(0, 50).map(g => ({
      id: String(g.id), name: String(g.name || 'Regel').slice(0, 60), verkn: g.verkn === 'oder' ? 'oder' : 'und', ...(g.aus ? { aus: true } : {}),
      wenn: g.wenn.filter(b => b && okCol(b.col)).slice(0, 20).map(b => ({ col: b.col, op: OPS.includes(b.op) ? b.op : '=', wert: wertVon(b.col, b.wert) })),
      dann: g.dann.filter(x => x && okCol(x.col)).slice(0, 20).map(x => ({ col: x.col, wert: wertVon(x.col, x.wert) }))
    }));
    out.configs = { cols, rows, active: rows.some(r => r.id === d.configs.active) ? String(d.configs.active) : rows[0].id, ...(regeln.length ? { regeln } : {}) };
  }
  if (Array.isArray(d.params) && d.params.length) out.params = d.params.filter(p => p && p.name).map(p => ({ id: String(p.id || uid()), name: String(p.name).slice(0, 40), expr: String(p.expr ?? '0').slice(0, 200), comment: String(p.comment || '').slice(0, 120), ...(typeof p.src === 'string' ? { src: p.src } : {}) }));
  if (d.file) out.file = String(d.file);
  if (out.kind === 'drawing') {
    if (typeof d.ref === 'string' && d.ref) out.ref = d.ref;
    out.modelName = String(d.modelName || out.name).slice(0, 80);
    out.modelKind = d.modelKind === 'assembly' ? 'assembly' : 'part';
  }
  if (d.activeComp && cids.has(String(d.activeComp))) out.activeComp = String(d.activeComp);
  // Rahmen-Festigkeit (src/framesim-ui.js): Werkstoff, Eigengewicht, Lager und Lasten an Punkten bzw. Stäben
  const pt = p => Array.isArray(p) && p.length === 3 && p.every(v => isFinite(v));
  const lasten = L => (Array.isArray(L) ? L : []).filter(x => x && ((x.kind === 'node' && pt(x.p) && pt(x.F)) || (x.kind === 'member' && typeof x.id === 'string' && pt(x.q)))).map(x => (x.kind === 'node' ? { kind: 'node', p: x.p.map(Number), F: x.F.map(Number) } : { kind: 'member', id: x.id, q: x.q.map(Number) }));
  if (d.frameStudy && typeof d.frameStudy === 'object') out.frameStudy = {
    mat: String(d.frameStudy.mat || 's235'), selfWeight: d.frameStudy.selfWeight !== false, ...(d.frameStudy.art === 'modal' ? { art: 'modal' } : {}),
    supports: (Array.isArray(d.frameStudy.supports) ? d.frameStudy.supports : []).filter(x => x && pt(x.p)).map(x => ({ p: x.p.map(Number), kind: x.kind === 'pinned' ? 'pinned' : 'fixed' })),
    loads: lasten(d.frameStudy.loads)
  };
  // Lastfälle (seit 27.10.2026): alle Fälle mit Namen, Lasten, Eigengewicht; der aktive steht zugleich in loads/selfWeight
  if (out.frameStudy && Array.isArray(d.frameStudy.faelle) && d.frameStudy.faelle.length) {
    const F = out.frameStudy, fall = Math.max(0, Math.min(d.frameStudy.faelle.length - 1, Number(d.frameStudy.fall) || 0));
    F.faelle = d.frameStudy.faelle.slice(0, 50).map((f, i) => (i === fall ? { name: String((f && f.name) || `Lastfall ${i + 1}`).slice(0, 40), loads: F.loads, selfWeight: F.selfWeight } : { name: String((f && f.name) || `Lastfall ${i + 1}`).slice(0, 40), loads: lasten(f && f.loads), selfWeight: !f || f.selfWeight !== false }));
    F.fall = Math.min(fall, F.faelle.length - 1);
  }
  // Festigkeit eines Bauteils (src/solidsim-ui.js): Körper, Werkstoff, Netz, feste Flächen und Kräfte (Flächen als Art, Mitte, Normale)
  const fsig = x => x && typeof x.t === 'string' && pt(x.c) && (x.n == null || pt(x.n));
  const sload = x => x && fsig(x.face) && pt(x.F);
  const stemp = x => x && fsig(x.face) && isFinite(Number(x.T));
  const sflux = x => x && fsig(x.face) && isFinite(Number(x.Q));
  const sconv = x => x && fsig(x.face) && isFinite(Number(x.h)) && isFinite(Number(x.Tamb));
  const sart = d.solidStudy && ['modal', 'waerme'].includes(d.solidStudy.art) ? d.solidStudy.art : 'statisch';
  if (d.solidStudy && typeof d.solidStudy === 'object') out.solidStudy = {
    body: typeof d.solidStudy.body === 'string' ? d.solidStudy.body : null, mat: String(d.solidStudy.mat || 's235'), mesh: ['coarse', 'medium', 'fine'].includes(d.solidStudy.mesh) ? d.solidStudy.mesh : 'medium',
    selfWeight: d.solidStudy.selfWeight === true,
    ...(sart === 'modal' ? { art: 'modal', anzahl: Math.max(1, Math.min(12, Math.round(Number(d.solidStudy.anzahl)) || 6)) } : sart === 'waerme' ? { art: 'waerme' } : {}),
    fixed: (Array.isArray(d.solidStudy.fixed) ? d.solidStudy.fixed : []).filter(fsig),
    loads: (Array.isArray(d.solidStudy.loads) ? d.solidStudy.loads : []).filter(sload),
    // Wärmeanalyse: vorgegebene Temperatur (°C), Leistung (W) und Konvektion (h in W/(m²·K), Umgebung in °C)
    temps: (Array.isArray(d.solidStudy.temps) ? d.solidStudy.temps : []).filter(stemp).map(x => ({ face: x.face, T: Number(x.T) })),
    fluxes: (Array.isArray(d.solidStudy.fluxes) ? d.solidStudy.fluxes : []).filter(sflux).map(x => ({ face: x.face, Q: Number(x.Q) })),
    convs: (Array.isArray(d.solidStudy.convs) ? d.solidStudy.convs : []).filter(sconv).map(x => ({ face: x.face, h: Number(x.h), Tamb: Number(x.Tamb) })),
    // weitere Körper derselben Studie (Kontakt): Körper-id mit eigenem Werkstoff, der Hauptkörper steht in body
    mit: (Array.isArray(d.solidStudy.mit) ? d.solidStudy.mit : [])
      .filter(x => x && typeof x.body === 'string' && x.body !== d.solidStudy.body)
      .map(x => ({ body: x.body, mat: String(x.mat || d.solidStudy.mat || 's235') })),
  };
  // Lastfälle (seit 28.10.2026): wie bei der Rahmen-Festigkeit – der aktive steht zugleich in loads/selfWeight
  if (out.solidStudy && Array.isArray(d.solidStudy.faelle) && d.solidStudy.faelle.length) {
    const F = out.solidStudy, fall = Math.max(0, Math.min(d.solidStudy.faelle.length - 1, Number(d.solidStudy.fall) || 0));
    F.faelle = d.solidStudy.faelle.slice(0, 50).map((f, i) => ({ name: String((f && f.name) || `Lastfall ${i + 1}`).slice(0, 40),
      loads: i === fall ? F.loads : (Array.isArray(f && f.loads) ? f.loads : []).filter(sload), selfWeight: i === fall ? F.selfWeight : !!(f && f.selfWeight) }));
    F.fall = Math.min(fall, F.faelle.length - 1);
  }
  // Bewegungsstudie: Schritte, Dauer, Spuren je Gelenk und Freiheitsgrad mit Stützstellen (Zeit % → Wert)
  if (d.bewegung && typeof d.bewegung === 'object') out.bewegung = {
    schritte: Math.max(2, Math.min(361, Math.round(Number(d.bewegung.schritte)) || 31)), dauer: Math.max(0.5, Math.min(60, Number(d.bewegung.dauer) || 3)),
    spuren: (Array.isArray(d.bewegung.spuren) ? d.bewegung.spuren : []).filter(s => s && typeof s.joint === 'string' && ['angle', 'offset', 'u', 'v'].includes(s.feld) && Array.isArray(s.punkte))
      .map(s => ({ joint: s.joint, feld: s.feld, punkte: s.punkte.filter(p => p && Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.v))).map(p => ({ t: Math.max(0, Math.min(100, Number(p.t))), v: Number(p.v) })) }))
      .filter(s => s.punkte.length)
  };
  // Storyboard der Explosionsansicht: Schritte nacheinander (Gruppe = Komponente oder Körper, Verschiebung, Dauer in s)
  // Drehung w (Grad) um achse x/y/z durch die Gruppenmitte; Ansicht-Schritte (art 'ansicht') mit Kamera { pos, target }
  if (Array.isArray(d.storyboard)) out.storyboard = d.storyboard.filter(s => s && typeof s.g === 'string' && pt(s.d))
    .map(s => ({
      g: s.g, d: s.d.map(Number), t: Math.max(0.1, Math.min(60, Number(s.t) || 1)),
      ...(Number(s.w) ? { w: Number(s.w), achse: ['x', 'y', 'z'].includes(s.achse) ? s.achse : 'z' } : {}),
      ...(s.art === 'ansicht' && s.cam && pt(s.cam.pos) && pt(s.cam.target) ? { art: 'ansicht', cam: { pos: s.cam.pos.map(Number), target: s.cam.target.map(Number) } } : {})
    }));
  // Aufkleber zum Rendern: Bild als data-URL, Lage auf der Fläche, Breite, Drehung
  if (Array.isArray(d.aufkleber)) out.aufkleber = d.aufkleber.filter(a => a && typeof a.img === 'string' && /^data:image\/(png|jpeg);/.test(a.img) && pt(a.p) && pt(a.n))
    .map(a => ({ id: String(a.id || Math.random().toString(36).slice(2, 9)), name: String(a.name || 'Aufkleber').slice(0, 60), img: a.img, p: a.p.map(Number), n: a.n.map(Number), w: Math.max(0.5, Number(a.w) || 20), rot: Number(a.rot) || 0 }));
  // Kunststoffregel: Werkstoff (die Werte stehen als Parameter kst_* in params)
  if (d.kunststoff && typeof d.kunststoff === 'object' && typeof d.kunststoff.material === 'string') out.kunststoff = { material: d.kunststoff.material };
  // Kontakt: Modus und Kontaktsätze aus Gliedern (Komponenten, eingefügte Teile, Körper)
  if (d.kontakt && typeof d.kontakt === 'object') out.kontakt = {
    modus: ['aus', 'saetze', 'alle'].includes(d.kontakt.modus) ? d.kontakt.modus : 'aus',
    saetze: (Array.isArray(d.kontakt.saetze) ? d.kontakt.saetze : []).filter(x => x && typeof x.id === 'string' && Array.isArray(x.glieder))
      .map(x => ({ id: x.id, name: String(x.name || 'Kontaktsatz').slice(0, 60), glieder: x.glieder.filter(g => typeof g === 'string'), ...(x.aus ? { aus: true } : {}) }))
  };
  // Generatives Design: Studie (Einrichtung) und Ergebnisse – Inhalt prüft gd-ui.js beim Öffnen
  if (d.gd && typeof d.gd === 'object') out.gd = { studie: d.gd.studie && typeof d.gd.studie === 'object' ? d.gd.studie : null, ergebnisse: Array.isArray(d.gd.ergebnisse) ? d.gd.ergebnisse.filter(x => x && x.id && Array.isArray(x.flaechen)).slice(0, 60) : [] };
  if (d.drawing && typeof d.drawing === 'object') out.drawing = { opts: d.drawing.opts && typeof d.drawing.opts === 'object' ? d.drawing.opts : {}, dims: Array.isArray(d.drawing.dims) ? d.drawing.dims.filter(x => x && x.view && ((x.a && x.b) || ((x.kind === 'dia' || x.kind === 'rad') && x.c && x.at && x.r > 0) || (x.kind === 'arc' && x.c && x.at && x.r > 0 && x.s && x.e && x.sweep > 0) || (x.kind === 'ord' && x.o && x.p) || (x.kind === 'ang' && x.l1 && x.l2 && x.at))) : [], details: Array.isArray(d.drawing.details) ? d.drawing.details.filter(x => x && x.view && x.c && x.at) : [], offsets: d.drawing.offsets && typeof d.drawing.offsets === 'object' ? d.drawing.offsets : {}, notes: Array.isArray(d.drawing.notes) ? d.drawing.notes.filter(x => x && x.id && (x.view || x.kind === 'text' || x.kind === 'image' || x.kind === 'dxf') && Array.isArray(x.at)) : [], ...(TB_TEMPLATES.includes(d.drawing.tbTemplate) ? { tbTemplate: d.drawing.tbTemplate } : {}), ...(validTbCustom(d.drawing.tbCustom) ? { tbCustom: { name: String(d.drawing.tbCustom.name || 'Vorlage.svg').slice(0, 80), inner: d.drawing.tbCustom.inner, vb: d.drawing.tbCustom.vb.map(Number), w: Number(d.drawing.tbCustom.w), h: Number(d.drawing.tbCustom.h) } } : {}), ...(d.drawing.tb && typeof d.drawing.tb === 'object' ? { tb: Object.fromEntries(Object.entries(d.drawing.tb).filter(([k, v]) => TB_KEYS.includes(k) && typeof v === 'string' && v).map(([k, v]) => [k, v.slice(0, 120)])) } : {}), ...(Array.isArray(d.drawing.tbExtra) && d.drawing.tbExtra.length ? { tbExtra: d.drawing.tbExtra.filter(x => x && (x.label || x.value)).slice(0, TB_EXTRA_MAX).map(x => ({ label: String(x.label || '').slice(0, 40), value: String(x.value || '').slice(0, 120) })) } : {}), ...(Array.isArray(d.drawing.revs) && d.drawing.revs.length ? { revs: d.drawing.revs.filter(x => x && typeof x.rev === 'string' && x.rev).slice(0, 50).map(x => ({ rev: x.rev.slice(0, 8), desc: String(x.desc || '').slice(0, 120), date: String(x.date || '').slice(0, 20), author: String(x.author || '').slice(0, 40) })) } : {}), htabs: Array.isArray(d.drawing.htabs) ? d.drawing.htabs.filter(x => x && x.id && x.view && Array.isArray(x.o) && Array.isArray(x.at)) : [], breakouts: Array.isArray(d.drawing.breakouts) ? d.drawing.breakouts.filter(x => x && x.id && x.view && Array.isArray(x.pts) && x.pts.length >= 3) : [], sheets: Array.isArray(d.drawing.sheets) ? d.drawing.sheets.filter(x => x && x.id).map(x => ({ ...x, views: Array.isArray(x.views) ? x.views.filter(v => v && v.id && v.view) : [] })) : [] };
  return out;
}

/* ---------- Komponenten-Hierarchie ---------- */
/* Komponente und alle Unterkomponenten (IDs, Komponente zuerst) */
export function compSubtree(doc, id) {
  const comps = doc.components || [], out = [id];
  for (let i = 0; i < out.length; i++) comps.forEach(c => { if (c.parent === out[i]) out.push(c.id); });
  return out;
}
/* Alle Körper einer Komponente samt Unterkomponenten */
export function compAllBodies(doc, id) {
  const ids = new Set(compSubtree(doc, id));
  return (doc.components || []).filter(c => ids.has(c.id)).flatMap(c => c.bodies);
}
/* Pfad einer Komponente von oben, z. B. „Gestell / Bein links“ */
export function compPath(doc, id) {
  const comps = doc.components || [], names = [];
  let c = comps.find(x => x.id === id), guard = 0;
  while (c && guard++ < 50) { names.unshift(c.name); c = c.parent ? comps.find(x => x.id === c.parent) : null; }
  return names.join(' / ');
}

/* Welche Features verweisen auf eine Skizze? */
export function dependents(doc, id) {
  const has = (a, x) => Array.isArray(a) && a.some(v => v === x || String(v).startsWith(x + ':'));
  const ref = (r, x) => !!r && (r.id === x || String(r.id || '').startsWith(x + ':')); // auch eine Achse des BKS
  return doc.features.filter(f => f.comp === id || has(f.comps, id) || f.path === id || (Array.isArray(f.sections) && f.sections.some(s => s && s.sketch === id)) || f.sketch === id || f.planeRef === id || (f.base && (f.base.id === id || (f.base.a && f.base.a.id === id) || (f.base.b && f.base.b.id === id))) || (f.plane && f.plane.id === id) || (f.originRef && f.originRef.pt === id) || ref(f.axisRef, id) || ref(f.axis2Ref, id) || has(f.features, id) || has(f.targets, id) || has(f.bodies, id) || has(f.target, id) || has(f.tools, id) || has(f.sketches, id) || has(f.more, id));
}

/* Hilfen für Ebenen-Koordinaten (Skizze ↔ Welt) */
export const toWorld = (pl, u, v) => [
  pl.o[0] + pl.x[0] * u + pl.y[0] * v,
  pl.o[1] + pl.x[1] * u + pl.y[1] * v,
  pl.o[2] + pl.x[2] * u + pl.y[2] * v
];
export const toLocal = (pl, p) => {
  const d = [p[0] - pl.o[0], p[1] - pl.o[1], p[2] - pl.o[2]];
  return [d[0] * pl.x[0] + d[1] * pl.x[1] + d[2] * pl.x[2], d[0] * pl.y[0] + d[1] * pl.y[1] + d[2] * pl.y[2]];
};

/* Umriss eines Skizzenelements als geschlossener Punktzug in Ebenenkoordinaten */
export function entityOutline(en, seg = 64) {
  if (en.type === 'rect') {
    const hw = Math.abs(en.w) / 2, hh = Math.abs(en.h) / 2;
    return [[en.cx - hw, en.cy - hh], [en.cx + hw, en.cy - hh], [en.cx + hw, en.cy + hh], [en.cx - hw, en.cy + hh]];
  }
  if (en.type === 'circle') {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2;
      pts.push([en.cx + Math.cos(a) * en.d / 2, en.cy + Math.sin(a) * en.d / 2]);
    }
    return pts;
  }
  return en.pts.map(p => [p[0], p[1]]);
}

/* Fangpunkte eines Elements: Ecken, Mitte */
export function entitySnapPoints(en) {
  if (en.type === 'rect') return [...entityOutline(en), [en.cx, en.cy]];
  if (en.type === 'circle') return [[en.cx, en.cy], [en.cx + en.d / 2, en.cy], [en.cx - en.d / 2, en.cy], [en.cx, en.cy + en.d / 2], [en.cx, en.cy - en.d / 2]];
  return en.pts.map(p => [p[0], p[1]]);
}
