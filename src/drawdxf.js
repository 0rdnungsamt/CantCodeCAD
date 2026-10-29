/* Zeichnungsblatt → DXF (R12, mm). Liest das fertig gezeichnete SVG-Blatt (Linien, Pfade, Kreise, Texte),
   rechnet alle Transformationen aus und legt die Elemente nach ihrer Bedeutung auf Layer.
   Schraffuren (im SVG ein Füllmuster) werden als Linien unter 45° im Abstand 3 mm erzeugt. */

const LAYERS = [
  // Name, Farbe, Linientyp
  ['KONTUR', 7, 'CONTINUOUS'], ['VERDECKT', 8, 'HIDDEN'], ['MITTELLINIE', 1, 'CENTER'], ['SCHNITT', 7, 'CONTINUOUS'],
  ['SCHRAFFUR', 8, 'CONTINUOUS'], ['BEMASSUNG', 3, 'CONTINUOUS'], ['TEXT', 7, 'CONTINUOUS'], ['RAHMEN', 7, 'CONTINUOUS'],
  ['BIEGELINIE', 1, 'CENTER'], ['DUENN', 7, 'CONTINUOUS']
];
// Klasse (am Element oder einem Vorfahren, die nächste zählt) → Layer
const LAYER_OF = {
  hatch: 'SCHRAFFUR', hid: 'VERDECKT', cl: 'MITTELLINIE', cutmid: 'MITTELLINIE', fb: 'BIEGELINIE', vis: 'KONTUR', fo: 'KONTUR',
  cutend: 'SCHNITT', cutarr: 'SCHNITT', cut: 'SCHNITT', dim: 'BEMASSUNG', udim: 'BEMASSUNG', hl: 'BEMASSUNG', notes: 'BEMASSUNG',
  weld: 'BEMASSUNG', bal: 'BEMASSUNG', bnum: 'BEMASSUNG', dsrc: 'BEMASSUNG', dring: 'BEMASSUNG', sym: 'RAHMEN', brk: 'DUENN',
  frame: 'RAHMEN', tb: 'RAHMEN', bom: 'RAHMEN', btab: 'RAHMEN'
};
// nicht ausgeben: Vorschau, Klickflächen
const SKIP = new Set(['draft', 'pv', 'bpick', 'hit']);

/* ---------- Matrizen [a b c d e f] wie SVG ---------- */
export const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const app = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const ID = [1, 0, 0, 1, 0, 0];
export function parseTransform(s) {
  let m = ID;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(s))) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let k = ID;
    if (t[1] === 'matrix') k = a.slice(0, 6);
    else if (t[1] === 'translate') k = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (t[1] === 'scale') k = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
    else if (t[1] === 'rotate') {
      const r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), s2 = Math.sin(r), R = [c, s2, -s2, c, 0, 0];
      k = a.length >= 3 ? mul(mul([1, 0, 0, 1, a[1], a[2]], R), [1, 0, 0, 1, -a[1], -a[2]]) : R;
    } else if (t[1] === 'skewX') k = [1, 0, Math.tan(a[0] * Math.PI / 180), 1, 0, 0];
    else k = [1, Math.tan(a[0] * Math.PI / 180), 0, 1, 0, 0];
    m = mul(m, k);
  }
  return m;
}
// Ähnlichkeitsabbildung (gleicher Maßstab in alle Richtungen, ohne Scherung)? Dann bleiben Kreise Kreise.
const similar = m => Math.abs(m[0] - m[3]) < 1e-9 * (1 + Math.abs(m[0])) && Math.abs(m[1] + m[2]) < 1e-9 * (1 + Math.abs(m[1]));
const scaleOf = m => Math.hypot(m[0], m[1]);

/* ---------- Pfaddaten → Teilpfade aus Strecken und Kreisbögen ---------- */
// Bogen nach SVG-Endpunktform → Mittelpunktform (SVG 1.1, Anhang F.6.5)
export function arcCenter(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  const c = Math.cos(phi), s = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = c * dx + s * dy, yp = -s * dx + c * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = k * rx * yp / ry, cyp = -k * ry * xp / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  return { cx, cy, rx, ry, phi, t1, dt };
}
export const arcPoint = (A, t) => { const c = Math.cos(A.phi), s = Math.sin(A.phi), x = A.rx * Math.cos(t), y = A.ry * Math.sin(t); return [A.cx + c * x - s * y, A.cy + s * x + c * y]; };

// Rückgabe: [{ segs: [{k:'L', p:[x,y]} | {k:'A', arc, p}], start, closed }]
function parsePath(d) {
  const tok = d.match(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = null, lc = null, lq = null;
  const num = () => Number(tok[i++]);
  const lineTo = (nx, ny) => { cur.segs.push({ k: 'L', p: [nx, ny] }); x = nx; y = ny; };
  const flat = (pts) => pts.forEach(p => cur.segs.push({ k: 'L', p }));
  while (i < tok.length) {
    if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++];
    else if (!cmd) { i++; continue; }
    const C = cmd.toUpperCase(), rel = cmd !== C;
    if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; } lc = lq = null; continue; }
    if (C === 'M') {
      const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; sx = x; sy = y;
      cur = { start: [x, y], segs: [], closed: false }; subs.push(cur);
      cmd = rel ? 'l' : 'L'; lc = lq = null; continue;
    }
    if (!cur) { cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); }
    if (C === 'L') { const a = num(), b = num(); lineTo(rel ? x + a : a, rel ? y + b : b); lc = lq = null; }
    else if (C === 'H') { const a = num(); lineTo(rel ? x + a : a, y); lc = lq = null; }
    else if (C === 'V') { const b = num(); lineTo(x, rel ? y + b : b); lc = lq = null; }
    else if (C === 'C' || C === 'S') {
      let c1;
      if (C === 'C') { const a = num(), b = num(); c1 = rel ? [x + a, y + b] : [a, b]; } else c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const a2 = num(), b2 = num(), a3 = num(), b3 = num();
      const c2 = rel ? [x + a2, y + b2] : [a2, b2], p = rel ? [x + a3, y + b3] : [a3, b3], p0 = [x, y], pts = [];
      for (let k = 1; k <= 16; k++) { const t = k / 16, u = 1 - t; pts.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p[1]]); }
      flat(pts); x = p[0]; y = p[1]; lc = c2; lq = null;
    } else if (C === 'Q' || C === 'T') {
      let q;
      if (C === 'Q') { const a = num(), b = num(); q = rel ? [x + a, y + b] : [a, b]; } else q = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      const a3 = num(), b3 = num(), p = rel ? [x + a3, y + b3] : [a3, b3], p0 = [x, y], pts = [];
      for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * q[0] + t * t * p[0], u * u * p0[1] + 2 * u * t * q[1] + t * t * p[1]]); }
      flat(pts); x = p[0]; y = p[1]; lq = q; lc = null;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), fa = num(), fs = num(), a = num(), b = num();
      const nx = rel ? x + a : a, ny = rel ? y + b : b;
      if (rx < 1e-9 || ry < 1e-9 || Math.hypot(nx - x, ny - y) < 1e-12) lineTo(nx, ny);
      else { cur.segs.push({ k: 'A', arc: arcCenter(x, y, rx, ry, rot * Math.PI / 180, fa, fs, nx, ny), p: [nx, ny] }); x = nx; y = ny; }
      lc = lq = null;
    } else { i++; }
  }
  return subs;
}

/* ---------- Ausschnitt (clip-path): Teilstücke innerhalb behalten ---------- */
function clipPolyline(pts, inside) {
  const out = [];
  let run = null;
  const edge = (a, b, ina) => { let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (inside(p) === ina) lo = m; else hi = m; } const m = (lo + hi) / 2; return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.25));
    let p = a, ip = inside(a);
    if (ip && !run) run = [a];
    for (let k = 1; k <= n; k++) {
      const q = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], iq = inside(q);
      if (ip && iq) run.push(q);
      else if (ip && !iq) { run.push(edge(p, q, true)); out.push(run); run = null; }
      else if (!ip && iq) { run = [edge(p, q, false), q]; }
      p = q; ip = iq;
    }
  }
  if (run && run.length > 1) out.push(run);
  // gerade Zwischenpunkte wieder zusammenfassen
  return out.map(r => r.filter((q, i) => i === 0 || i === r.length - 1 || Math.abs((q[0] - r[i - 1][0]) * (r[i + 1][1] - q[1]) - (q[1] - r[i - 1][1]) * (r[i + 1][0] - q[0])) > 1e-9));
}
function pointInPolys(polys, p) {
  let c = false;
  polys.forEach(P => { for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } });
  return c;
}

/* ---------- Text: Sonderzeichen als DXF-Steuerfolgen (%%c, %%d …), sonst \U+XXXX ---------- */
function dxfText(s) {
  return String(s).replace(/\s+/g, ' ').trim().replace(/[\u0080-￿]/g, ch => {
    if (ch === '⌀' || ch === 'Ø' || ch === 'ø') return '%%c';
    if (ch === '°') return '%%d';
    if (ch === '±') return '%%p';
    if (ch === '–' || ch === '—') return '-';
    if (ch === '×') return 'x';
    const c = ch.charCodeAt(0);
    return c >= 0xa0 && c <= 0xff ? ch : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
  });
}

/* svg: das gezeichnete Blatt (im Dokument, damit die Stilangaben gelten). Rückgabe: DXF-Text (Zeichen ≤ 0xFF, ANSI 1252). */
/* Geometrie des gezeichneten Blatts in Blatt-mm (y nach oben): Linienzüge, Bögen, Kreise, Flächen, Texte je Layer.
   Grundlage für DXF und PDF. */
export function sheetEntities(svg) {
  const vb = (svg.getAttribute('viewBox') || '0 0 297 210').split(/[\s,]+/).map(Number), H = vb[3];
  const win = svg.ownerDocument.defaultView, css = el => win.getComputedStyle(el);
  const ents = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const D = p => { const q = [p[0], H - p[1]]; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); return q; };
  const f = v => (Math.abs(v) < 5e-7 ? 0 : Math.round(v * 1e6) / 1e6).toString();

  const ctm = new Map([[svg, parseTransform(svg.getAttribute('transform'))]]);
  const matOf = el => { if (ctm.has(el)) return ctm.get(el); const m = mul(matOf(el.parentNode), parseTransform(el.getAttribute('transform'))); ctm.set(el, m); return m; };
  const layerOf = (el, dflt) => {
    for (let e = el; e && e !== svg; e = e.parentNode) for (const c of (e.getAttribute('class') || '').split(/\s+/)) if (LAYER_OF[c]) return LAYER_OF[c];
    return dflt;
  };
  const skipped = el => { for (let e = el; e && e !== svg; e = e.parentNode) { const t = e.tagName.toLowerCase(); if (t === 'defs' || t === 'clippath' || t === 'pattern' || t === 'style' || t === 'mask') return true; if ((e.getAttribute('class') || '').split(/\s+/).some(c => SKIP.has(c))) return true; if (e.getAttribute('display') === 'none' || e.getAttribute('visibility') === 'hidden') return true; } return false; };
  /* Ausschnitt eines Vorfahren als Punkt-Test in Blattkoordinaten. Mehrere Ausschnitte untereinander (z. B.
     Zuschneidekasten der Ansicht und Ausbruch-Umriss der verdeckten Kanten) gelten wie im SVG gemeinsam:
     ein Punkt muss in allen liegen. */
  const clipOf = el => {
    const tests = [];
    for (let e = el; e && e !== svg; e = e.parentNode) {
      const cp = e.getAttribute('clip-path'), id = cp && (cp.match(/url\(#([^)]+)\)/) || [])[1];
      if (!id) continue;
      const node = svg.querySelector(`[id="${id}"]`);
      if (!node) continue;
      const m = matOf(e), polys = [], circles = [];
      [...node.children].forEach(s => {
        const t = s.tagName.toLowerCase(), sm = mul(m, parseTransform(s.getAttribute('transform')));
        if (t === 'circle') { const c = app(sm, [+s.getAttribute('cx'), +s.getAttribute('cy')]); circles.push([c, +s.getAttribute('r') * scaleOf(sm)]); }
        else if (t === 'path') parsePath(s.getAttribute('d') || '').forEach(sp => { const P = [sp.start, ...sp.segs.map(g => g.p)].map(p => app(sm, p)); polys.push(P); });
        else if (t === 'rect') { const x = +s.getAttribute('x') || 0, y = +s.getAttribute('y') || 0, w = +s.getAttribute('width'), h = +s.getAttribute('height'); polys.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => app(sm, p))); }
        else if (t === 'polygon') { const n = (s.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); polys.push(n.map((_, i) => app(sm, [n[i], n[i + 1]])).filter(p => isFinite(p[0]) && isFinite(p[1]))); }
      });
      if (circles.length || polys.length) tests.push(p => circles.some(([c, r]) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= r) || (polys.length > 0 && pointInPolys(polys, p)));
    }
    return tests.length ? p => tests.every(t => t(p)) : null;
  };

  // Strichstärke und Strichmuster des gerade gelesenen Elements (für das PDF)
  let pen = { w: 0.25, dash: null };
  const poly = (layer, P, closed) => { if (P.length < 2) return; ents.push({ t: 'POLY', layer, P: P.map(D), closed, ...pen }); };
  const solid = (layer, P) => ents.push({ t: 'SOLID', layer, P: P.map(D), ...pen });
  // ein Teilpfad mit Matrix m: Strecken als Polylinie, echte Kreisbögen als ARC (wenn ohne Ausschnitt möglich)
  const emitSub = (layer, sp, m, clip, filled) => {
    const keepArcs = !clip && similar(m) && m[0] * m[3] - m[1] * m[2] > 0;
    let run = [app(m, sp.start)];
    const pts = [sp.start];
    const flush = () => { if (run.length > 1) (clip ? clipPolyline(run, clip).forEach(r => poly(layer, r, false)) : poly(layer, run, false)); };
    let prev = sp.start, hasArc = false;
    sp.segs.forEach(g => {
      if (g.k === 'A') {
        const A = g.arc, n = Math.max(8, Math.ceil(Math.abs(A.dt) / (Math.PI / 24)));
        if (keepArcs && Math.abs(A.rx - A.ry) < 1e-9 * (1 + A.rx)) {
          hasArc = true;
          flush(); run = [app(m, g.p)];
          // Bildschirm: positiver Winkel = im Uhrzeigersinn; nach der y-Spiegelung ist das gegen den Uhrzeigersinn
          const c = D(app(m, [A.cx, A.cy])), r = A.rx * scaleOf(m), pa = D(app(m, prev)), pb = D(app(m, g.p));
          let s = Math.atan2(pa[1] - c[1], pa[0] - c[0]), e = Math.atan2(pb[1] - c[1], pb[0] - c[0]);
          if (A.dt < 0) [s, e] = [e, s];
          if (Math.abs(Math.abs(A.dt) - 2 * Math.PI) < 1e-9) ents.push({ t: 'CIRCLE', layer, c, r, ...pen });
          else ents.push({ t: 'ARC', layer, c, r, s: s * 180 / Math.PI, e: e * 180 / Math.PI, ...pen });
        } else {
          for (let k = 1; k <= n; k++) { const q = arcPoint(A, A.t1 + A.dt * k / n); run.push(app(m, q)); pts.push(q); }
        }
      } else { run.push(app(m, g.p)); pts.push(g.p); }
      prev = g.p;
    });
    if (sp.closed && Math.hypot(prev[0] - sp.start[0], prev[1] - sp.start[1]) > 1e-9) run.push(app(m, sp.start));
    // gefüllte Drei-/Vierecke (Pfeilspitzen) als SOLID
    const uniq = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-9);
    if (uniq.length > 1 && Math.hypot(uniq[0][0] - uniq[uniq.length - 1][0], uniq[0][1] - uniq[uniq.length - 1][1]) < 1e-9) uniq.pop();
    if (filled && !clip && !hasArc && sp.closed && (uniq.length === 3 || uniq.length === 4)) { const W = uniq.map(q => app(m, q)); solid(layer, uniq.length === 3 ? [W[0], W[1], W[2], W[2]] : [W[0], W[1], W[3], W[2]]); return; }
    if (!clip && !hasArc && sp.closed && run.length > 2) { run.pop(); poly(layer, run, true); return; }
    flush();
  };

  // Schraffur: Linien p·(1,1)/√2 = 3k (Muster „hatch“ um 45° gedreht), je Dreieck geschnitten, dann zusammengefasst
  const hatchGroups = new Map();
  const hatchTri = (g, P) => {
    const nr = [Math.SQRT1_2, Math.SQRT1_2], dr = [-Math.SQRT1_2, Math.SQRT1_2], sp = 3;
    const pr = P.map(p => p[0] * nr[0] + p[1] * nr[1]);
    const lo = Math.ceil(Math.min(...pr) / sp - 1e-9), hi = Math.floor(Math.max(...pr) / sp + 1e-9);
    let H2 = hatchGroups.get(g); if (!H2) hatchGroups.set(g, (H2 = new Map()));
    for (let k = lo; k <= hi; k++) {
      const c = k * sp, ts = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], da = pr[i] - c, db = pr[(i + 1) % P.length] - c;
        if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) { if (Math.abs(da - db) < 1e-12) continue; const t = da / (da - db), q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; ts.push(q[0] * dr[0] + q[1] * dr[1]); }
      }
      if (ts.length < 2) continue;
      const a = Math.min(...ts), b = Math.max(...ts);
      if (b - a < 1e-6) continue;
      if (!H2.has(k)) H2.set(k, []);
      H2.get(k).push([a, b]);
    }
  };

  svg.querySelectorAll('line, path, circle, ellipse, rect, polyline, polygon, text').forEach(el => {
    if (skipped(el)) return;
    const tag = el.tagName.toLowerCase(), st = css(el), m = matOf(el);
    const da = st.strokeDasharray && st.strokeDasharray !== 'none' ? st.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter(v => v >= 0).map(v => v * scaleOf(m)) : null;
    pen = { w: (parseFloat(st.strokeWidth) || 0.25) * scaleOf(m), dash: da && da.some(v => v > 0) ? da : null };
    if (tag === 'text') {
      // Toleranzen (tspan) mit Abstand anhängen
      const s = [...el.childNodes].map(c => (c.nodeType === 3 ? c.nodeValue : ' ' + c.textContent)).join('');
      if (!s || !s.trim() || st.fill === 'none' || st.visibility === 'hidden') return;
      const fs = parseFloat(st.fontSize) || 3, x = parseFloat(el.getAttribute('x')) || 0, y = parseFloat(el.getAttribute('y')) || 0;
      const anc = el.getAttribute('text-anchor') || st.textAnchor || 'start';
      const p = D(app(m, [x, y])), rot = -Math.atan2(m[1], m[0]) * 180 / Math.PI;
      ents.push({ t: 'TEXT', layer: 'TEXT', p, h: 0.7 * fs * scaleOf(m), s: dxfText(s), raw: s.replace(/\s+/g, ' ').trim(), bold: parseInt(st.fontWeight, 10) >= 600, rot, j: anc === 'middle' ? 1 : anc === 'end' ? 2 : 0 });
      return;
    }
    const hatchG = el.closest('.hatch');
    if (hatchG) {
      parsePath(el.getAttribute('d') || '').forEach(sp => { const P = [sp.start, ...sp.segs.map(g => g.p)].map(p => app(m, p)); if (P.length >= 3) hatchTri(hatchG, P); });
      return;
    }
    const stroked = st.stroke && st.stroke !== 'none' && !/rgba\([^)]*,\s*0\)$/.test(st.stroke) && st.stroke !== 'transparent' && parseFloat(st.strokeWidth) !== 0;
    const filled = st.fill && st.fill !== 'none' && !/rgba\([^)]*,\s*0\)$/.test(st.fill) && !/^rgb\(255,\s*255,\s*255\)$/.test(st.fill) && st.fill !== '#fff';
    if (!stroked && !filled) return;
    // Hintergrund und weiße Flächen ohne Rand
    if (!stroked && tag === 'rect') return;
    const layer = layerOf(el, 'DUENN'), clip = clipOf(el);
    const A = k => parseFloat(el.getAttribute(k)) || 0;
    if (tag === 'line') { const P = [app(m, [A('x1'), A('y1')]), app(m, [A('x2'), A('y2')])]; if (clip) clipPolyline(P, clip).forEach(r => poly(layer, r, false)); else poly(layer, P, false); return; }
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = A('cx'), cy = A('cy'), rx = tag === 'circle' ? A('r') : A('rx'), ry = tag === 'circle' ? A('r') : A('ry');
      if (rx <= 0 || ry <= 0) return;
      if (!clip && similar(m) && Math.abs(rx - ry) < 1e-9) { ents.push({ t: 'CIRCLE', layer, c: D(app(m, [cx, cy])), r: rx * scaleOf(m), ...pen }); return; }
      const P = []; for (let k = 0; k <= 72; k++) { const t = k / 72 * 2 * Math.PI; P.push(app(m, [cx + rx * Math.cos(t), cy + ry * Math.sin(t)])); }
      if (clip) clipPolyline(P, clip).forEach(r => poly(layer, r, false)); else { P.pop(); poly(layer, P, true); }
      return;
    }
    if (tag === 'rect') { const x = A('x'), y = A('y'), w = A('width'), h = A('height'); emitSub(layer, { start: [x, y], segs: [[x + w, y], [x + w, y + h], [x, y + h]].map(p => ({ k: 'L', p })), closed: true }, m, clip, false); return; }
    if (tag === 'polyline' || tag === 'polygon') {
      const v = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number), P = [];
      for (let i = 0; i + 1 < v.length; i += 2) P.push([v[i], v[i + 1]]);
      if (P.length > 1) emitSub(layer, { start: P[0], segs: P.slice(1).map(p => ({ k: 'L', p })), closed: tag === 'polygon' }, m, clip, filled && tag === 'polygon');
      return;
    }
    if (tag === 'path') parsePath(el.getAttribute('d') || '').forEach(sp => emitSub(layer, sp, m, clip, filled));
  });
  pen = { w: 0.25, dash: null };
  hatchGroups.forEach(H2 => H2.forEach((iv, k) => {
    const nr = [Math.SQRT1_2, Math.SQRT1_2], dr = [-Math.SQRT1_2, Math.SQRT1_2], c = k * 3;
    iv.sort((a, b) => a[0] - b[0]);
    const merged = [];
    iv.forEach(([a, b]) => { const l = merged[merged.length - 1]; if (l && a <= l[1] + 1e-4) l[1] = Math.max(l[1], b); else merged.push([a, b]); });
    merged.forEach(([a, b]) => poly('SCHRAFFUR', [[nr[0] * c + dr[0] * a, nr[1] * c + dr[1] * a], [nr[0] * c + dr[0] * b, nr[1] * c + dr[1] * b]], false));
  }));

  if (!isFinite(x0)) { x0 = y0 = 0; x1 = vb[2]; y1 = H; }
  return { ents, W: vb[2], H, ext: [x0, y0, x1, y1] };
}

export function sheetToDxf(svg) {
  const { ents, W, H, ext: [x0, y0, x1, y1] } = sheetEntities(svg), vb = [0, 0, W, H];
  const f = v => (Math.abs(v) < 5e-7 ? 0 : Math.round(v * 1e6) / 1e6).toString();
  /* ---------- Ausgabe ---------- */
  const o = [];
  const g = (code, v) => o.push(String(code), String(v));
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
  g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMIN'); g(10, f(x0)); g(20, f(y0)); g(30, 0);
  g(9, '$EXTMAX'); g(10, f(x1)); g(20, f(y1)); g(30, 0);
  g(9, '$LIMMIN'); g(10, 0); g(20, 0);
  g(9, '$LIMMAX'); g(10, f(vb[2])); g(20, f(H));
  g(9, '$LTSCALE'); g(40, 1);
  g(9, '$MEASUREMENT'); g(70, 1);
  g(9, '$INSUNITS'); g(70, 4);
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  const LT = [['CONTINUOUS', 'Solid line', []], ['HIDDEN', '__ __ __', [2.2, -1.2]], ['CENTER', '____ _ ____', [6, -1, 0.6, -1]]];
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, LT.length);
  LT.forEach(([nm, ds, pat]) => { g(0, 'LTYPE'); g(2, nm); g(70, 0); g(3, ds); g(72, 65); g(73, pat.length); g(40, f(pat.reduce((a, b) => a + Math.abs(b), 0))); pat.forEach(v => g(49, f(v))); });
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, LAYERS.length + 1);
  [['0', 7, 'CONTINUOUS'], ...LAYERS].forEach(([nm, col, lt]) => { g(0, 'LAYER'); g(2, nm); g(70, 0); g(62, col); g(6, lt); });
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
  g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  ents.forEach(e => {
    if (e.t === 'POLY') {
      if (e.P.length === 2 && !e.closed) { g(0, 'LINE'); g(8, e.layer); g(10, f(e.P[0][0])); g(20, f(e.P[0][1])); g(30, 0); g(11, f(e.P[1][0])); g(21, f(e.P[1][1])); g(31, 0); return; }
      g(0, 'POLYLINE'); g(8, e.layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.closed ? 1 : 0);
      e.P.forEach(p => { g(0, 'VERTEX'); g(8, e.layer); g(10, f(p[0])); g(20, f(p[1])); g(30, 0); });
      g(0, 'SEQEND'); g(8, e.layer);
    } else if (e.t === 'CIRCLE') { g(0, 'CIRCLE'); g(8, e.layer); g(10, f(e.c[0])); g(20, f(e.c[1])); g(30, 0); g(40, f(e.r)); }
    else if (e.t === 'ARC') { g(0, 'ARC'); g(8, e.layer); g(10, f(e.c[0])); g(20, f(e.c[1])); g(30, 0); g(40, f(e.r)); g(50, f(e.s)); g(51, f(e.e)); }
    else if (e.t === 'SOLID') { g(0, 'SOLID'); g(8, e.layer); e.P.forEach((p, i) => { g(10 + i, f(p[0])); g(20 + i, f(p[1])); g(30 + i, 0); }); }
    else if (e.t === 'TEXT') {
      g(0, 'TEXT'); g(8, e.layer); g(10, f(e.p[0])); g(20, f(e.p[1])); g(30, 0); g(40, f(e.h)); g(1, e.s);
      if (Math.abs(e.rot) > 1e-9) g(50, f(e.rot));
      if (e.j) { g(72, e.j); g(11, f(e.p[0])); g(21, f(e.p[1])); g(31, 0); }
    }
  });
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

/* Text (Zeichen ≤ 0xFF) → Bytes für die Datei */
export function dxfBytes(text) {
  const b = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); b[i] = c < 256 ? c : 63; }
  return b;
}
