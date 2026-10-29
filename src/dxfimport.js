// cantcodecad – DXF-Import als Skizze: LINE, CIRCLE, ARC, LWPOLYLINE (mit Bögen), POLYLINE/VERTEX.
// Gleiche Endpunkte werden zusammengeführt, damit geschlossene Konturen als Profile erkannt werden.

function pairs(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  return out;
}

/* liefert { entities: [...], unit } – Einheiten nach $INSUNITS */
export function parseDXF(text) {
  const P = pairs(text);
  let unit = 1, insunits = null;
  for (let i = 0; i < P.length - 1; i++) {
    if (P[i][0] === 9 && P[i][1] === '$INSUNITS') { const u = parseInt(P[i + 1][1], 10); insunits = u; unit = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }[u] || 1; break; }
  }
  const start = P.findIndex((p, i) => p[0] === 2 && p[1] === 'ENTITIES' && P[i - 1] && P[i - 1][1] === 'SECTION');
  if (start < 0) throw new Error('Keine ENTITIES-Sektion in der DXF-Datei');
  const ents = [];
  let cur = null;
  const flush = () => { if (cur) ents.push(cur); cur = null; };
  for (let i = start + 1; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === 0) {
      flush();
      if (v === 'ENDSEC') break;
      cur = { type: v, g: [] };
      continue;
    }
    if (cur) cur.g.push([c, v]);
  }
  flush();
  // POLYLINE + VERTEX … SEQEND zusammenfassen
  const merged = [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.type === 'POLYLINE') {
      const verts = [];
      let j = i + 1;
      while (j < ents.length && ents[j].type === 'VERTEX') { verts.push(ents[j]); j++; }
      merged.push({ type: 'POLYV', head: e, verts });
      i = j; // SEQEND überspringen
      continue;
    }
    merged.push(e);
  }
  return { entities: merged, unit, insunits };
}
const layerOf = e => ((e.g || (e.head && e.head.g) || []).find(p => p[0] === 8) || [0, '0'])[1] || '0';
export const AUX_LAYER = /BIEG|BEND|HILF|CONSTR|CENTER|MITTE/i;
/* Layer und Einheit einer DXF-Datei (für den Import-Dialog) */
export function dxfInfo(text) {
  const { entities, unit, insunits } = parseDXF(text);
  const m = new Map();
  entities.forEach(e => { if (['TEXT', 'MTEXT', 'DIMENSION', 'HATCH', 'INSERT', 'POINT'].includes(e.type)) return; const l = layerOf(e); m.set(l, (m.get(l) || 0) + 1); });
  return { unit, insunits, layers: [...m.entries()].map(([name, count]) => ({ name, count, aux: AUX_LAYER.test(name) })).sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}

const num = (g, code, def = 0) => { const x = g.find(p => p[0] === code); return x ? parseFloat(x[1]) : def; };

/* DXF → Skizze (Punkte/Kurven in Skizzenkoordinaten) */
/* opts: { unit: mm je Zeichnungseinheit (sonst aus $INSUNITS), layers: { Name: 'use' | 'aux' | 'skip' } } */
export function dxfToSketch(text, plane, name, opts = {}) {
  const parsed = parseDXF(text), entities = parsed.entities, unit = Number(opts.unit) > 0 ? Number(opts.unit) : parsed.unit;
  const lmode = opts.layers || {};
  const points = [], curves = [], rules = [];
  const pmap = new Map();
  let nid = 0;
  const id = p => `${p}${(nid++).toString(36)}`;
  const pt = (x, y) => {
    x *= unit; y *= unit;
    const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
    if (pmap.has(k)) return pmap.get(k);
    const q = { id: id('p'), x, y };
    points.push(q); pmap.set(k, q.id);
    return q.id;
  };
  const line = (x1, y1, x2, y2) => { if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) return; curves.push({ id: id('l'), type: 'line', p1: pt(x1, y1), p2: pt(x2, y2) }); };
  // Bogen gegen den Uhrzeigersinn von a0 nach a1 (Radiant)
  const arc = (cx, cy, r, a0, a1) => {
    while (a1 <= a0) a1 += Math.PI * 2;
    const c = pt(cx, cy), s = pt(cx + r * Math.cos(a0), cy + r * Math.sin(a0)), e = pt(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    curves.push({ id: id('a'), type: 'arc', c, s, e, r: r * unit, a0, a1 });
  };
  const bulgeSeg = (x1, y1, x2, y2, b) => {
    if (Math.abs(b) < 1e-9) { line(x1, y1, x2, y2); return; }
    const th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, chord = Math.hypot(dx, dy);
    const r = chord / (2 * Math.sin(Math.abs(th) / 2));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, h = Math.sqrt(Math.max(0, r * r - chord * chord / 4));
    const nx = -dy / chord, ny = dx / chord, sgn = (b > 0) === (Math.abs(th) < Math.PI) ? 1 : -1;
    const cx = mx + nx * h * sgn, cy = my + ny * h * sgn;
    const ang = (x, y) => Math.atan2(y - cy, x - cx);
    if (b > 0) arc(cx, cy, r, ang(x1, y1), ang(x2, y2)); else arc(cx, cy, r, ang(x2, y2), ang(x1, y1));
  };
  let skipped = 0;
  entities.forEach(e => {
    const g = e.g || (e.head && e.head.g) || [];
    // Hilfs-/Biegelinien-Ebenen als Konstruktionsgeometrie übernehmen
    const layer = layerOf(e), mode = lmode[layer];
    if (mode === 'skip') return;
    const cons = mode ? mode === 'aux' : AUX_LAYER.test(layer);
    const n0 = curves.length;
    switch (e.type) {
      case 'LINE': line(num(g, 10), num(g, 20), num(g, 11), num(g, 21)); break;
      case 'CIRCLE': curves.push({ id: id('c'), type: 'circle', c: pt(num(g, 10), num(g, 20)), r: num(g, 40) * unit }); break;
      case 'ARC': arc(num(g, 10), num(g, 20), num(g, 40), num(g, 50) * Math.PI / 180, num(g, 51) * Math.PI / 180); break;
      case 'ELLIPSE': {
        const cx = num(g, 10), cy = num(g, 20), mx = num(g, 11), my = num(g, 21), ratio = num(g, 40, 1);
        const t0 = num(g, 41, 0), t1 = num(g, 42, Math.PI * 2), L = Math.hypot(mx, my);
        if (L < 1e-12) break;
        const full = Math.abs((t1 - t0) - Math.PI * 2) < 1e-6 || Math.abs(t1 - t0) < 1e-9;
        const c = pt(cx, cy), a = pt(cx + mx, cy + my), b = pt(cx - my * ratio, cy + mx * ratio);
        const l1 = { id: id('l'), type: 'line', p1: c, p2: a, cons: true }, l2 = { id: id('l'), type: 'line', p1: c, p2: b, cons: true };
        const el = { id: id('e'), type: 'ellipse', c, a, b, axes: [l1.id, l2.id] };
        if (!full) { let e1 = t1; while (e1 <= t0) e1 += Math.PI * 2; el.u0 = t0 / (Math.PI * 2); el.u1 = e1 / (Math.PI * 2); }
        curves.push(l1, l2, el);
        rules.push({ id: id('r'), type: 'perpendicular', a: l1.id, b: l2.id });
        break;
      }
      case 'SPLINE': {
        // Stützpunkte (11/21) bevorzugt, sonst Kontrollpunkte (10/20)
        const fit = [], ctl = [];
        g.forEach(([c, v]) => {
          if (c === 11) fit.push([parseFloat(v), 0]); else if (c === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v);
          if (c === 10) ctl.push([parseFloat(v), 0]); else if (c === 20 && ctl.length) ctl[ctl.length - 1][1] = parseFloat(v);
        });
        let P = fit.length >= 2 ? fit : ctl;
        if (P.length < 2) break;
        const closed = (num(g, 70) & 1) === 1 && P.length >= 3;
        if (closed && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-9) P = P.slice(0, -1);
        curves.push({ id: id('s'), type: 'spline', pts: P.map(q => pt(q[0], q[1])), closed });
        break;
      }
      case 'LWPOLYLINE': {
        const closed = (num(g, 70) & 1) === 1;
        const vs = [];
        g.forEach(([c, v]) => {
          if (c === 10) vs.push({ x: parseFloat(v), y: 0, b: 0 });
          else if (c === 20 && vs.length) vs[vs.length - 1].y = parseFloat(v);
          else if (c === 42 && vs.length) vs[vs.length - 1].b = parseFloat(v);
        });
        for (let i = 0; i < vs.length - (closed ? 0 : 1); i++) { const a = vs[i], b = vs[(i + 1) % vs.length]; bulgeSeg(a.x, a.y, b.x, b.y, a.b); }
        break;
      }
      case 'POLYV': {
        const closed = (num(e.head.g, 70) & 1) === 1;
        const vs = e.verts.map(v => ({ x: num(v.g, 10), y: num(v.g, 20), b: num(v.g, 42) }));
        for (let i = 0; i < vs.length - (closed ? 0 : 1); i++) { const a = vs[i], b = vs[(i + 1) % vs.length]; bulgeSeg(a.x, a.y, b.x, b.y, a.b); }
        break;
      }
      default: if (!['TEXT', 'MTEXT', 'DIMENSION', 'HATCH', 'INSERT', 'POINT'].includes(e.type)) skipped++;
    }
    if (cons) for (let i = n0; i < curves.length; i++) curves[i].cons = true;
  });
  if (!curves.length) throw new Error('Keine Linien, Kreise oder Bögen in der DXF-Datei gefunden');
  return { sketch: { type: 'sketch', name, plane: { ...plane }, points, curves, rules, texts: [] }, count: curves.filter(c => !c.cons).length, skipped };
}
