/* SVG einfügen: Pfade und Grundformen als Skizzenkurven.
   Linien bleiben Linien, Kreisbögen werden Bögen, Bézierkurven werden Splines durch Stützpunkte.
   y wird gespiegelt (SVG zeigt nach unten), Einheiten aus width/height bzw. viewBox (px = 1/96 Zoll). */
import { mul, app, parseTransform, arcCenter, arcPoint } from './drawdxf.js';

const UNIT = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
function lengthMm(s) {
  const m = String(s || '').trim().match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
  return m ? Number(m[1]) * UNIT[(m[2] || '').toLowerCase()] : null;
}

/* Pfaddaten → Teilpfade; Segmente: L (Strecke), C (kubisch), Q (quadratisch), A (Bogen) in Nutzerkoordinaten */
function pathSegments(d) {
  const tok = d.match(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = null, lc = null, lq = null;
  const num = () => Number(tok[i++]);
  const seg = s => { cur.segs.push(s); x = s.p[0]; y = s.p[1]; };
  while (i < tok.length) {
    if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++];
    else if (!cmd) { i++; continue; }
    const C = cmd.toUpperCase(), rel = cmd !== C;
    if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; } lc = lq = null; continue; }
    if (C === 'M') {
      const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; sx = x; sy = y;
      cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); cmd = rel ? 'l' : 'L'; lc = lq = null; continue;
    }
    if (!cur) { cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); }
    const P = (a, b) => (rel ? [x + a, y + b] : [a, b]);
    if (C === 'L') { const a = num(), b = num(); seg({ k: 'L', p: P(a, b) }); lc = lq = null; }
    else if (C === 'H') { const a = num(); seg({ k: 'L', p: [rel ? x + a : a, y] }); lc = lq = null; }
    else if (C === 'V') { const b = num(); seg({ k: 'L', p: [x, rel ? y + b : b] }); lc = lq = null; }
    else if (C === 'C' || C === 'S') {
      let c1;
      if (C === 'C') { const a = num(), b = num(); c1 = P(a, b); } else c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const a2 = num(), b2 = num(), a3 = num(), b3 = num(), c2 = P(a2, b2), p = P(a3, b3);
      seg({ k: 'C', p0: [x, y], c1, c2, p }); lc = c2; lq = null;
    } else if (C === 'Q' || C === 'T') {
      let q;
      if (C === 'Q') { const a = num(), b = num(); q = P(a, b); } else q = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      const a3 = num(), b3 = num(), p = P(a3, b3);
      seg({ k: 'Q', p0: [x, y], q, p }); lq = q; lc = null;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), fa = num(), fs = num(), a = num(), b = num(), p = P(a, b);
      if (rx < 1e-9 || ry < 1e-9 || Math.hypot(p[0] - x, p[1] - y) < 1e-12) seg({ k: 'L', p });
      else seg({ k: 'A', p0: [x, y], arc: arcCenter(x, y, rx, ry, rot * Math.PI / 180, fa, fs, p[0], p[1]), p });
      lc = lq = null;
    } else i++;
  }
  return subs;
}

export function svgToSketch(text, plane, name) {
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = xml.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || xml.querySelector('parsererror')) throw new Error('Keine gültige SVG-Datei');
  // Maßstab Nutzereinheit → mm
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).filter(Boolean).map(Number);
  const W = lengthMm(svg.getAttribute('width')), H = lengthMm(svg.getAttribute('height'));
  let sx = 25.4 / 96, sy = 25.4 / 96, ox = 0, oy = 0;
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    ox = vb[0]; oy = vb[1];
    if (W) sx = W / vb[2]; if (H) sy = H / vb[3];
    if (W && !H) sy = sx; if (H && !W) sx = sy;
  }
  // Wurzelmatrix: Nutzerkoordinaten → mm, y nach oben; Unterkante der Zeichenfläche auf y = 0
  const hUser = vb.length === 4 && vb[3] > 0 ? vb[3] : (H ? H / sy : 0);
  const root = [sx, 0, 0, -sy, -ox * sx, (oy + hUser) * sy];
  const points = [], curves = [], pmap = new Map();
  let nid = 0, skipped = 0;
  const id = p => `${p}${(nid++).toString(36)}`;
  const pt = q => {
    const k = `${Math.round(q[0] * 1e4)},${Math.round(q[1] * 1e4)}`;
    if (pmap.has(k)) return pmap.get(k);
    const o = { id: id('p'), x: q[0], y: q[1] };
    points.push(o); pmap.set(k, o.id);
    return o.id;
  };
  const line = (a, b) => { if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-7) curves.push({ id: id('l'), type: 'line', p1: pt(a), p2: pt(b) }); };
  const spline = P => { if (P.length >= 2) curves.push({ id: id('s'), type: 'spline', pts: P.map(pt), closed: false }); };
  const similar = m => Math.abs(Math.abs(m[0]) - Math.abs(m[3])) < 1e-9 * (1 + Math.abs(m[0])) && Math.abs(Math.abs(m[1]) - Math.abs(m[2])) < 1e-9 * (1 + Math.abs(m[1])) && Math.abs(m[0] * m[1] + m[2] * m[3]) < 1e-9 * (1 + m[0] * m[0]);
  const det = m => m[0] * m[3] - m[1] * m[2];
  const sub = (sp, m) => {
    let prev = sp.start;
    sp.segs.forEach(g => {
      if (g.k === 'L') line(app(m, prev), app(m, g.p));
      else if (g.k === 'C' || g.k === 'Q') {
        const n = 8, P = [];
        for (let s = 0; s <= n; s++) {
          const t = s / n, u = 1 - t;
          P.push(app(m, g.k === 'C'
            ? [u * u * u * g.p0[0] + 3 * u * u * t * g.c1[0] + 3 * u * t * t * g.c2[0] + t * t * t * g.p[0], u * u * u * g.p0[1] + 3 * u * u * t * g.c1[1] + 3 * u * t * t * g.c2[1] + t * t * t * g.p[1]]
            : [u * u * g.p0[0] + 2 * u * t * g.q[0] + t * t * g.p[0], u * u * g.p0[1] + 2 * u * t * g.q[1] + t * t * g.p[1]]));
        }
        // fast gerade Kurve → Linie
        const a = P[0], b = P[n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dev = L > 1e-9 ? Math.max(...P.map(q => Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L)) : Infinity;
        if (dev < 1e-4) line(a, b); else spline(P);
      } else if (g.k === 'A') {
        const A = g.arc;
        if (Math.abs(A.rx - A.ry) < 1e-9 * (1 + A.rx) && similar(m)) {
          const c = app(m, [A.cx, A.cy]), a = app(m, prev), b = app(m, g.p), r = Math.hypot(a[0] - c[0], a[1] - c[1]);
          // Drehsinn: positiver Winkel in Nutzerkoordinaten bleibt erhalten, eine Spiegelung (det < 0) kehrt ihn um
          const ccw = (A.dt > 0) === (det(m) > 0);
          const ang = q => Math.atan2(q[1] - c[1], q[0] - c[0]);
          let a0 = ccw ? ang(a) : ang(b), a1 = ccw ? ang(b) : ang(a);
          while (a1 <= a0) a1 += 2 * Math.PI;
          if (Math.abs(Math.abs(A.dt) - 2 * Math.PI) < 1e-9) curves.push({ id: id('c'), type: 'circle', c: pt(c), r });
          else curves.push({ id: id('a'), type: 'arc', c: pt(c), s: pt(ccw ? a : b), e: pt(ccw ? b : a), r, a0, a1 });
        } else {
          const n = Math.max(8, Math.ceil(Math.abs(A.dt) / (Math.PI / 16))), P = [];
          for (let s = 0; s <= n; s++) P.push(app(m, arcPoint(A, A.t1 + A.dt * s / n)));
          spline(P);
        }
      }
      prev = g.p;
    });
    if (sp.closed) line(app(m, prev), app(m, sp.start));
  };
  const matOf = el => { const chain = []; for (let e = el; e && e !== svg; e = e.parentNode) chain.unshift(e); return chain.reduce((M, e) => mul(M, parseTransform(e.getAttribute && e.getAttribute('transform'))), mul(root, parseTransform(svg.getAttribute('transform')))); };
  const hidden = el => { for (let e = el; e && e !== svg; e = e.parentNode) { const t = (e.nodeName || '').toLowerCase(); if (['defs', 'clippath', 'mask', 'pattern', 'symbol', 'marker', 'style', 'metadata'].includes(t)) return true; if (e.getAttribute && (e.getAttribute('display') === 'none' || e.getAttribute('visibility') === 'hidden')) return true; } return false; };
  const A = (el, k) => parseFloat(el.getAttribute(k)) || 0;
  xml.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, image, use').forEach(el => {
    if (hidden(el)) return;
    const t = el.nodeName.toLowerCase(), m = matOf(el);
    if (t === 'text' || t === 'image' || t === 'use') { skipped++; return; }
    if (t === 'path') { pathSegments(el.getAttribute('d') || '').forEach(sp => sub(sp, m)); return; }
    if (t === 'line') { line(app(m, [A(el, 'x1'), A(el, 'y1')]), app(m, [A(el, 'x2'), A(el, 'y2')])); return; }
    if (t === 'polyline' || t === 'polygon') {
      const v = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number), P = [];
      for (let k = 0; k + 1 < v.length; k += 2) P.push([v[k], v[k + 1]]);
      if (P.length > 1) sub({ start: P[0], segs: P.slice(1).map(p => ({ k: 'L', p })), closed: t === 'polygon' }, m);
      return;
    }
    if (t === 'rect') {
      const x = A(el, 'x'), y = A(el, 'y'), w = A(el, 'width'), h = A(el, 'height');
      let rx = el.hasAttribute('rx') ? A(el, 'rx') : A(el, 'ry'), ry = el.hasAttribute('ry') ? A(el, 'ry') : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!(w > 0 && h > 0)) return;
      if (rx > 0 && ry > 0) {
        const d = `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
        pathSegments(d).forEach(sp => sub(sp, m));
      } else sub({ start: [x, y], segs: [[x + w, y], [x + w, y + h], [x, y + h]].map(p => ({ k: 'L', p })), closed: true }, m);
      return;
    }
    if (t === 'circle' || t === 'ellipse') {
      const cx = A(el, 'cx'), cy = A(el, 'cy'), rx = t === 'circle' ? A(el, 'r') : A(el, 'rx'), ry = t === 'circle' ? A(el, 'r') : A(el, 'ry');
      if (!(rx > 0 && ry > 0)) return;
      if (Math.abs(rx - ry) < 1e-9 && similar(m)) { const c = app(m, [cx, cy]), q = app(m, [cx + rx, cy]); curves.push({ id: id('c'), type: 'circle', c: pt(c), r: Math.hypot(q[0] - c[0], q[1] - c[1]) }); return; }
      // Ellipse als zwei Halbbögen (Splines)
      pathSegments(`M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`).forEach(sp => sub(sp, m));
    }
  });
  if (!curves.length) throw new Error('Keine Pfade oder Formen in der SVG-Datei gefunden');
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const size = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  return { sketch: { type: 'sketch', name, plane: { ...plane }, points, curves, rules: [], texts: [] }, count: curves.length, skipped, size };
}
