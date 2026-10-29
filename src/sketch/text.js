// Text in Skizzen: Schriften laden und Umrisse für die Anzeige berechnen.
// Der Geometriekern (replicad) nutzt dieselben Schriftdateien und dieselbe
// Bibliothek (opentype.js), damit Anzeige und Körper übereinstimmen.

export const FONTS = {
  sans: { label: 'Sans', url: '/cdn/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf' },
  bold: { label: 'Sans fett', url: '/cdn/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf' },
  mono: { label: 'Mono', url: '/cdn/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSansMono.ttf' }
};

let otPromise = null;
const fonts = new Map();     // key → opentype.Font
const loading = new Map();   // key → Promise
const cache = new Map();     // font|h|text → { loops, box }

function opentype() {
  if (!otPromise) otPromise = import('/cdn/npm/opentype.js@1.3.4/dist/opentype.module.js').then(m => m.default || m);
  return otPromise;
}

/* Schrift laden; onReady wird einmal aufgerufen, sobald sie da ist */
export function loadFont(key, onReady) {
  key = FONTS[key] ? key : 'sans';
  if (fonts.has(key)) return Promise.resolve(fonts.get(key));
  if (!loading.has(key)) {
    loading.set(key, opentype().then(ot => fetch(FONTS[key].url).then(r => {
      if (!r.ok) throw new Error('Schrift nicht erreichbar');
      return r.arrayBuffer();
    }).then(buf => { const f = ot.parse(buf); fonts.set(key, f); return f; })));
  }
  const p = loading.get(key);
  if (onReady) p.then(onReady, () => {});
  return p;
}

/* Umrisse eines Textes in Textkoordinaten: Grundlinie auf y = 0, Anfang bei x = 0, y nach oben.
   Gibt null zurück, solange die Schrift noch lädt. */
export function textOutline(text, h, key = 'sans') {
  key = FONTS[key] ? key : 'sans';
  const font = fonts.get(key);
  if (!font) return null;
  const ck = `${key}|${h}|${text}`;
  if (cache.has(ck)) return cache.get(ck);
  const path = font.getPath(text, 0, 0, h);
  const loops = [];
  let cur = null, last = [0, 0];
  const push = p => { cur.push(p); last = p; };
  const SEG = 8;
  for (const c of path.commands) {
    if (c.type === 'M') { cur = []; loops.push(cur); push([c.x, -c.y]); }
    else if (c.type === 'L') push([c.x, -c.y]);
    else if (c.type === 'Q') {
      const [x0, y0] = last;
      for (let i = 1; i <= SEG; i++) {
        const t = i / SEG, u = 1 - t;
        push([u * u * x0 + 2 * u * t * c.x1 + t * t * c.x, u * u * y0 + 2 * u * t * -c.y1 + t * t * -c.y]);
      }
    } else if (c.type === 'C') {
      const [x0, y0] = last;
      for (let i = 1; i <= SEG; i++) {
        const t = i / SEG, u = 1 - t;
        push([u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * y0 + 3 * u * u * t * -c.y1 + 3 * u * t * t * -c.y2 + t * t * t * -c.y]);
      }
    } else if (c.type === 'Z' && cur && cur.length) push(cur[0].slice());
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  loops.forEach(l => l.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  // auch reine Leerzeichen bekommen eine greifbare Box
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = font.getAdvanceWidth(text, h) || h; y1 = h * 0.7; }
  const res = { loops, box: [x0, y0, x1, y1] };
  cache.set(ck, res);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return res;
}

/* ---------- Text entlang einer Kurve ----------
   Der Linienzug der Kurve wird pro Text in einer WeakMap gehalten (bindTextPaths), damit placeText/hitText
   ohne weitere Parameter auskommen und nichts davon im Dokument landet. */
const textPaths = new WeakMap();
export function bindTextPaths(sk, polyOf) {
  (sk.texts || []).forEach(t => {
    if (!t.path) { textPaths.delete(t); return; }
    const c = [...(sk.curves || []), ...(sk.helpers || [])].find(x => x.id === t.path);
    const poly = c ? polyOf(c) : null;
    if (poly && poly.length >= 2) textPaths.set(t, poly); else textPaths.delete(t);
  });
}
/* Lage der Zeichen: Mitte jedes Zeichens auf der Kurve, Grundlinie tangential. Ohne geladene Schrift null. */
export function pathLayout(t, poly, advance) {
  if (!poly || poly.length < 2) return null;
  // Grundrichtung so, dass der Text von links nach rechts lesbar steht (über der Kurve);
  // geschlossene Kurven: Mitte des Textes oben. „Seite wechseln“ (flip) dreht um.
  let P = poly.slice();
  const closed = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6;
  if (closed) {
    P.pop();
    const n = P.length;
    let k = 0;
    P.forEach((q, i) => { if (q[1] > P[k][1]) k = i; });
    const st = (k + Math.floor(n / 2)) % n;
    P = [...P.slice(st), ...P.slice(0, st)];
    P.push(P[0].slice());
    const mid = (k - st + n) % n;
    if (P[mid + 1] && P[mid + 1][0] < P[mid][0]) P.reverse();
  } else if (P[P.length - 1][0] < P[0][0]) P.reverse();
  if (t.flip) P.reverse();
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = L[L.length - 1];
  const chars = [...String(t.text || '')], h = t.h || 5;
  const w = chars.map(ch => advance(ch, h));
  if (w.some(x => x == null)) return null;
  const W = w.reduce((a, b) => a + b, 0);
  const s0 = t.offset != null && isFinite(Number(t.offset)) ? Number(t.offset) : (total - W) / 2;
  const at = s => {
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const a = P[i - 1], b = P[i], seg = (L[i] - L[i - 1]) || 1e-9, f = (s - L[i - 1]) / seg;
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  let x = 0;
  return chars.map((ch, i) => { const q = at(s0 + x + w[i] / 2); const r = { ch, w: w[i], p: q.p, ang: q.ang }; x += w[i]; return r; });
}
const fontAdvance = key => (ch, h) => { const f = fonts.get(FONTS[key] ? key : 'sans'); return f ? f.getAdvanceWidth(ch, h) : null; };
function placeOnPath(t, poly) {
  const lay = pathLayout(t, poly, fontAdvance(t.font));
  if (!lay) return null;
  const loops = [];
  lay.forEach(g => {
    if (!g.ch.trim()) return;
    const o = textOutline(g.ch, t.h || 5, t.font);
    if (!o) return;
    const ca = Math.cos(g.ang), sa = Math.sin(g.ang);
    const tf = ([x, y]) => { const u = x - g.w / 2; return [g.p[0] + u * ca - y * sa, g.p[1] + u * sa + y * ca]; };
    o.loops.forEach(l => loops.push(l.map(tf)));
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  loops.forEach(l => l.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  if (!isFinite(x0)) { const q = poly[0]; x0 = x1 = q[0]; y0 = y1 = q[1]; }
  return { loops, corners: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], box: [x0, y0, x1, y1], tf: q => q };
}

/* Text in Skizzenkoordinaten: drehen um den Anker, dann verschieben */
export function placeText(t, anchor, outline) {
  const pp = t.path && textPaths.get(t);
  if (pp) { const r = placeOnPath(t, pp); if (r) return r; }
  const ca = Math.cos(t.angle || 0), sa = Math.sin(t.angle || 0);
  const tf = ([x, y]) => [anchor[0] + x * ca - y * sa, anchor[1] + x * sa + y * ca];
  const [x0, y0, x1, y1] = outline.box;
  return { loops: outline.loops.map(l => l.map(tf)), corners: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(tf), tf };
}

/* Liegt uv in der (gedrehten) Box des Textes? */
export function hitText(t, anchor, outline, uv, tol = 0) {
  const pp = t.path && textPaths.get(t);
  if (pp) { const r = placeOnPath(t, pp); if (r) { const [x0, y0, x1, y1] = r.box; return uv[0] >= x0 - tol && uv[0] <= x1 + tol && uv[1] >= y0 - tol && uv[1] <= y1 + tol; } }
  const ca = Math.cos(-(t.angle || 0)), sa = Math.sin(-(t.angle || 0));
  const dx = uv[0] - anchor[0], dy = uv[1] - anchor[1];
  const x = dx * ca - dy * sa, y = dx * sa + dy * ca;
  const [x0, y0, x1, y1] = outline.box;
  return x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol;
}
