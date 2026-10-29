import { fitDeviations } from './fits.js';
// cantcodecad – Zeichnungsableitung: Blatt mit Rahmen, Schriftfeld, Normansichten (Projektionsmethode 1) und Gesamtmaßen.
// Alle Maße in mm auf dem Blatt; die Ansichten kommen als SVG-Pfade vom Kern (y bereits nach unten gedreht).

export const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420] };
export const SCALES = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
export const scaleLabel = s => (s >= 1 ? `${+s.toFixed(3)}:1` : `1:${+(1 / s).toFixed(3)}`);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = v => +(+v).toFixed(3);
const fmtNum = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('de-DE');

function viewSize(v, s) {
  if (!v || !v.bb) return [0, 0];
  return [(v.bb[1][0] - v.bb[0][0]) * s, (v.bb[1][1] - v.bb[0][1]) * s];
}

/* Größter Normmaßstab, bei dem die Anordnung in den Bereich passt */
export function fitScale(views, area, gap, opts) {
  for (const s of SCALES) {
    const L = layoutSize(views, s, gap, opts);
    if (L.w <= area.w && L.h <= area.h) return s;
  }
  return SCALES[SCALES.length - 1];
}
function layoutSize(views, s, gap, opts) {
  const [fw, fh] = viewSize(views.front, s), [, th] = viewSize(views.top, s), [lw] = viewSize(views.left, s);
  const [iw, ih] = opts.iso ? viewSize(views.iso, s * opts.isoFactor) : [0, 0];
  const w = fw + gap + Math.max(lw, iw), h = fh + gap + Math.max(th, ih);
  return { w: w + (opts.dims ? 12 : 0), h: h + (opts.dims ? 12 : 0), fw, fh, th, lw, iw, ih };
}

/* Bemaßung (horizontal oder vertikal) in Blattkoordinaten */
function dimLine(x1, y1, x2, y2, side, off, value) {
  const horiz = Math.abs(y1 - y2) < 1e-9;
  const out = [];
  const a = 2.6, b = 0.9;
  if (horiz) {
    const y = y1 + side * off;
    out.push(`<line x1="${n(x1)}" y1="${n(y1 + side * 1.5)}" x2="${n(x1)}" y2="${n(y + side * 2)}"/>`);
    out.push(`<line x1="${n(x2)}" y1="${n(y2 + side * 1.5)}" x2="${n(x2)}" y2="${n(y + side * 2)}"/>`);
    out.push(`<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}"/>`);
    out.push(`<path class="arr" d="M${n(x1)} ${n(y)} l${a} ${-b} v${2 * b}z M${n(x2)} ${n(y)} l${-a} ${-b} v${2 * b}z"/>`);
    out.push(`<text x="${n((x1 + x2) / 2)}" y="${n(y - 1.2)}" text-anchor="middle">${esc(value)}</text>`);
  } else {
    const x = x1 + side * off;
    out.push(`<line x1="${n(x1 + side * 1.5)}" y1="${n(y1)}" x2="${n(x + side * 2)}" y2="${n(y1)}"/>`);
    out.push(`<line x1="${n(x2 + side * 1.5)}" y1="${n(y2)}" x2="${n(x + side * 2)}" y2="${n(y2)}"/>`);
    out.push(`<line x1="${n(x)}" y1="${n(y1)}" x2="${n(x)}" y2="${n(y2)}"/>`);
    out.push(`<path class="arr" d="M${n(x)} ${n(y1)} l${-b} ${a} h${2 * b}z M${n(x)} ${n(y2)} l${-b} ${-a} h${2 * b}z"/>`);
    const ty = (y1 + y2) / 2;
    out.push(`<text x="${n(x - 1.2)}" y="${n(ty)}" text-anchor="middle" transform="rotate(-90 ${n(x - 1.2)} ${n(ty)})">${esc(value)}</text>`);
  }
  return out.join('');
}

/* Ansicht → Blatt: Bildpunkt (u, v) der Ansicht auf Blattkoordinaten */
export function viewToSheet(v, s, px, py) {
  return (u, w) => [px + (u - v.bb[0][0]) * s, py + (v.bb[1][1] - w) * s];
}

let clipSeq = 0;
/* Verdeckte Kanten einer Ansicht (Ansichtskoordinaten); im Ausbruch weggelassen (ISO 128: Ausschnitt = alles außer den
   Ausbruch-Umrissen). Auch für Einzelheiten, damit dort keine Strichlinien im Ausbruch auftauchen. */
function hiddenGroup(v, opts, sw) {
  if (!opts.hidden || !v.hid.length) return '';
  let clip = '', clipRef = '';
  if (v.breakout && v.breakout.length) {
    const cid = `hc${++clipSeq}`, B = v.bb, pad = 1000;
    const outer = `M${n(B[0][0] - pad)} ${n(-B[1][1] - pad)}H${n(B[1][0] + pad)}V${n(-B[0][1] + pad)}H${n(B[0][0] - pad)}Z`;
    clip = `<clipPath id="${cid}" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="${outer}${v.breakout.map(bo => `M${bo.pts.map(q => `${n(q[0])} ${n(-q[1])}`).join('L')}Z`).join('')}"/></clipPath>`;
    clipRef = ` clip-path="url(#${cid})"`;
  }
  return `${clip}<g class="hid"${clipRef} stroke-width="${sw(0.25)}" stroke-dasharray="${sw(2.2)} ${sw(1.2)}">${v.hid.map(d => `<path d="${d}"/>`).join('')}</g>`;
}
/* Eine Ansicht an Position (px, py) = linke obere Ecke auf dem Blatt */
function placeView(v, s, px, py, opts, cls = '', key = null) {
  if (!v || !v.bb) return '';
  const tx = px - v.bb[0][0] * s, ty = py + v.bb[1][1] * s;
  const sw = w => n(w / s);
  const hid = hiddenGroup(v, opts, sw);
  const inner = `${hid}<g class="vis" stroke-width="${sw(cls === 'iso' ? 0.35 : 0.5)}">${v.vis.map(d => `<path d="${d}"/>`).join('')}</g>`;
  /* Zuschneideansicht: Rechteck in Ansichtskoordinaten, alles außerhalb fällt weg (auch im DXF, das die
     Ausschnitte auswertet); Lage und Maßstab der Ansicht bleiben */
  const crop = key && (opts.crops || []).find(c => c.view === key);
  if (crop) {
    const [[u0, v0], [u1, v1]] = crop.box, cid = `cv${++clipSeq}`;
    return `<g class="view ${cls}" transform="translate(${n(tx)} ${n(ty)}) scale(${s})"><clipPath id="${cid}" clipPathUnits="userSpaceOnUse"><rect x="${n(u0)}" y="${n(-v1)}" width="${n(u1 - u0)}" height="${n(v1 - v0)}"/></clipPath><g clip-path="url(#${cid})" data-crop="${esc(crop.id)}">${inner}</g></g>`;
  }
  return `<g class="view ${cls}" transform="translate(${n(tx)} ${n(ty)}) scale(${s})">${inner}</g>`;
}

/* Schraffur der Schnittfläche in Blattkoordinaten (Abstand unabhängig vom Maßstab) */
function hatchView(v, s, px, py) {
  if (!v || !v.bb || !v.hatch || !v.hatch.length) return '';
  const T = viewToSheet(v, s, px, py);
  return `<g class="hatch" fill="url(#hatch)" stroke="url(#hatch)" stroke-width="0.05">${v.hatch.map(t => `<path d="M${t.map(p => T(p[0], p[1]).map(n).join(' ')).join('L')}Z"/>`).join('')}</g>`;
}

/* ---------- Symbole: Oberflächenzeichen (ISO 1302/21920), Form- und Lagetoleranz (ISO 1101), Bezug ---------- */
export const GDT = {
  straight: 'Geradheit', flat: 'Ebenheit', round: 'Rundheit', cyl: 'Zylinderform', pline: 'Linienform', psurf: 'Flächenform',
  par: 'Parallelität', perp: 'Rechtwinkligkeit', ang: 'Neigung', pos: 'Position', conc: 'Koaxialität', sym: 'Symmetrie', run: 'Lauf', trun: 'Gesamtlauf'
};
export const GDT_DATUM = new Set(['par', 'perp', 'ang', 'pos', 'conc', 'sym', 'run', 'trun']);
/* Kennzeichen als Linien in einer Zelle um (x, y), Kantenlänge etwa 4 mm */
function gdtGlyph(k, x, y) {
  const P = (...q) => `<path d="${q.join('')}"/>`, M = (a, b) => `M${n(x + a)} ${n(y + b)}`, L = (a, b) => `L${n(x + a)} ${n(y + b)}`;
  const C = (a, b, r) => `<circle cx="${n(x + a)}" cy="${n(y + b)}" r="${n(r)}"/>`;
  switch (k) {
    case 'straight': return P(M(-2, 0), L(2, 0));
    case 'flat': return P(M(-2.2, 1.2), L(1.2, 1.2), L(2.2, -1.2), L(-1.2, -1.2), 'Z');
    case 'round': return C(0, 0, 1.6);
    case 'cyl': return C(0, 0, 1.4) + P(M(-1.6, 1.8), L(-0.4, -1.8), M(0.4, 1.8), L(1.6, -1.8));
    case 'pline': return P(M(-2, 0.8), 'A2 2 0 0 1 ' + n(x + 2) + ' ' + n(y + 0.8));
    case 'psurf': return P(M(-2, 0.8), 'A2 2 0 0 1 ' + n(x + 2) + ' ' + n(y + 0.8), 'Z');
    case 'par': return P(M(-1.6, 1.6), L(-0.2, -1.6), M(0.2, 1.6), L(1.6, -1.6));
    case 'perp': return P(M(-2, 1.6), L(2, 1.6), M(0, 1.6), L(0, -1.8));
    case 'ang': return P(M(2, 1.6), L(-2, 1.6), L(1.4, -1.6));
    case 'pos': return C(0, 0, 1.3) + P(M(-2, 0), L(2, 0), M(0, -2), L(0, 2));
    case 'conc': return C(0, 0, 0.9) + C(0, 0, 1.8);
    case 'sym': return P(M(-1.2, -1.1), L(1.2, -1.1), M(-2, 0), L(2, 0), M(-1.2, 1.1), L(1.2, 1.1));
    case 'run': return P(M(-1.4, 1.8), L(1.2, -1.6), M(0.1, -1.6), L(1.2, -1.6), L(1.2, -0.4));
    case 'trun': return P(M(-1.8, 1.8), L(0.4, -1.6), M(-0.6, 1.8), L(1.6, -1.6), M(-0.7, -1.6), L(1.6, -1.6), L(1.6, -0.4), M(-1.8, 1.8), L(-0.6, 1.8));
    default: return '';
  }
}
const leaderArrow = (ax, ay, bx, by, filled = true) => {
  const a = Math.atan2(by - ay, bx - ax), h = 2.4;
  return `<path class="${filled ? 'arr' : ''}" d="M${n(ax)} ${n(ay)}L${n(ax + Math.cos(a + 0.28) * h)} ${n(ay + Math.sin(a + 0.28) * h)}L${n(ax + Math.cos(a - 0.28) * h)} ${n(ay + Math.sin(a - 0.28) * h)}Z"/>`;
};
const tw = (t, fs) => String(t).length * fs * 0.56;
export function noteSvg(t, nt) {
  const [ax, ay] = t(nt.at[0], nt.at[1]), lx = ax + (nt.off ? nt.off[0] : 10), ly = ay + (nt.off ? nt.off[1] : -10);
  const id = esc(String(nt.id || ''));
  if (nt.kind === 'text') {
    // Text (mehrzeilig, Schrifthöhe nach ISO 3098); mit Ansicht: Hinweislinie mit Pfeil und kurzer Bezugslinie unter der ersten Zeile
    const h = Number(nt.size) || 3.5, lines = String(nt.text || 'Text').split('\n'), lh = h * 1.45;
    const w = Math.max(...lines.map(s => tw(s, h)), h);
    const txt = lines.map((s, i) => `<text x="${n(lx)}" y="${n(ly + i * lh)}" class="nt" style="font-size:${n(h)}px">${esc(s)}</text>`).join('');
    if (!nt.view || nt.leader === false) return `<g class="note" data-note="${id}">${txt}</g>`;
    const left = ax < lx + w / 2, sx = left ? lx - 1 : lx + w + 1, sy = ly + h * 0.35;
    const shoulder = `<line x1="${n(left ? sx : lx - 1)}" y1="${n(sy)}" x2="${n(left ? lx + w + 1 : sx)}" y2="${n(sy)}"/>`;
    return `<g class="note" data-note="${id}"><line x1="${n(ax)}" y1="${n(ay)}" x2="${n(sx)}" y2="${n(sy)}"/>${leaderArrow(ax, ay, sx, sy)}${shoulder}${txt}</g>`;
  }
  if (nt.kind === 'surf') {
    // Haken mit Spitze an (sx, ly); Hinweislinie mit Pfeil zur Fläche
    const sx = lx, sy = ly, req = `${nt.param || 'Ra'} ${fmtDe(nt.value)}`, ext = Math.max(8, tw(req, 2.8) + 3);
    let g = `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(sx)}" y2="${n(sy)}"/>` + leaderArrow(ax, ay, sx, sy);
    g += `<path d="M${n(sx - 2)} ${n(sy - 3.5)}L${n(sx)} ${n(sy)}L${n(sx + 4)} ${n(sy - 7)}h${n(ext)}"/>`;
    if (nt.proc === 'mrr') g += `<path d="M${n(sx - 2)} ${n(sy - 3.5)}h${n(4 - 0.25)}"/>`;
    if (nt.proc === 'nmr') g += `<circle cx="${n(sx + 0.15)}" cy="${n(sy - 2.25)}" r="1.15"/>`;
    g += `<text x="${n(sx + 4.6)}" y="${n(sy - 7.8)}" class="nt">${esc(req)}</text>`;
    if (nt.text) g += `<text x="${n(sx + 4.6)}" y="${n(sy - 4.4)}" class="nt">${esc(nt.text)}</text>`;
    return `<g class="note" data-note="${id}">${g}</g>`;
  }
  if (nt.kind === 'datum') {
    // Bezugsdreieck (gefüllt) an der Fläche, Rahmen mit Buchstabe
    const L = String(nt.letter || 'A').slice(0, 2), bw = 6, bx = lx - bw / 2, by = ly - bw / 2;
    const a = Math.atan2(ly - ay, lx - ax), px = -Math.sin(a), py = Math.cos(a), hb = 1.7, hh = 2.6;
    const tri = `<path class="arr" d="M${n(ax + px * hb)} ${n(ay + py * hb)}L${n(ax - px * hb)} ${n(ay - py * hb)}L${n(ax + Math.cos(a) * hh)} ${n(ay + Math.sin(a) * hh)}Z"/>`;
    const ex = Math.max(Math.abs(Math.cos(a)) > 1e-6 ? (bw / 2) / Math.abs(Math.cos(a)) : Infinity, 0), ey = Math.abs(Math.sin(a)) > 1e-6 ? (bw / 2) / Math.abs(Math.sin(a)) : Infinity;
    const cut = Math.min(ex, ey);
    return `<g class="note" data-note="${id}">${tri}<line x1="${n(ax + Math.cos(a) * hh)}" y1="${n(ay + Math.sin(a) * hh)}" x2="${n(lx - Math.cos(a) * cut)}" y2="${n(ly - Math.sin(a) * cut)}"/><rect x="${n(bx)}" y="${n(by)}" width="${bw}" height="${bw}"/><text x="${n(lx)}" y="${n(ly + 1.4)}" text-anchor="middle" class="nt big">${esc(L)}</text></g>`;
  }
  // eingefügtes Bild / eingefügte DXF (freie Lage auf dem Blatt, linke obere Ecke bei lx/ly, Größe in Blatt-mm)
  if (nt.kind === 'image') {
    const w = Number(nt.w) || 50, h = Number(nt.h) || 50;
    return `<g class="note ins" data-note="${id}"><image href="${esc(nt.src || '')}" x="${n(lx)}" y="${n(ly)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none"/></g>`;
  }
  if (nt.kind === 'dxf') {
    const s = Number(nt.scale) || 1, w = (Number(nt.w) || 0) * s, h = (Number(nt.h) || 0) * s;
    return `<g class="note ins" data-note="${id}"><rect class="hit" x="${n(lx)}" y="${n(ly)}" width="${n(w)}" height="${n(h)}"/><path class="dxfi" d="${esc(nt.d || '')}" transform="translate(${n(lx)} ${n(ly)}) scale(${n(s)})"/></g>`;
  }
  // Toleranzrahmen: Kennzeichen | Toleranz | Bezüge
  const H = 6, fs = 3, tol = `${nt.dia ? '⌀' : ''}${fmtDe(nt.value)}`;
  const datums = GDT_DATUM.has(nt.char) ? String(nt.datums || '').split(/[\s,;|]+/).filter(Boolean).slice(0, 3) : [];
  const cells = [H, Math.max(H, tw(tol, fs) + 3), ...datums.map(d => Math.max(H, tw(d, fs) + 3))];
  const W = cells.reduce((a, b) => a + b, 0), fx = lx, fy = ly - H / 2;
  let g = `<rect x="${n(fx)}" y="${n(fy)}" width="${n(W)}" height="${H}"/>`;
  let cx = fx;
  cells.forEach((w, i) => { if (i) g += `<line x1="${n(cx)}" y1="${n(fy)}" x2="${n(cx)}" y2="${n(fy + H)}"/>`; cx += w; });
  g += `<g class="glyph">${gdtGlyph(nt.char, fx + H / 2, ly)}</g>`;
  g += `<text x="${n(fx + H + cells[1] / 2)}" y="${n(ly + 1.05)}" text-anchor="middle" class="nt">${esc(tol)}</text>`;
  let dx = fx + H + cells[1];
  datums.forEach((d, i) => { g += `<text x="${n(dx + cells[2 + i] / 2)}" y="${n(ly + 1.05)}" text-anchor="middle" class="nt">${esc(d)}</text>`; dx += cells[2 + i]; });
  // Hinweislinie vom Rahmen (nächste Seite) zur Fläche
  const sx = ax < fx ? fx : ax > fx + W ? fx + W : ax, sy = ax >= fx && ax <= fx + W ? (ay < ly ? fy : fy + H) : ly;
  g += `<line x1="${n(sx)}" y1="${n(sy)}" x2="${n(ax)}" y2="${n(ay)}"/>` + leaderArrow(ax, ay, sx, sy);
  return `<g class="note" data-note="${id}">${g}</g>`;
}
const fmtDe = v => { const x = Number(v); return isFinite(x) ? String(+x.toFixed(4)).replace('.', ',') : String(v ?? ''); };

/* Ausbruch: Umriss als schmale Freihandlinie (ISO 128), leicht gewellt zwischen den Punkten */
function breakoutLines(v, s, px, py) {
  if (!v || !v.bb || !v.breakout || !v.breakout.length) return '';
  const T = viewToSheet(v, s, px, py);
  return `<g class="brk">${v.breakout.map(bo => {
    // Wellenlinie entlang eines Linienzugs (gleichmäßig in Bogenlänge, Amplitude 0,6 mm alle ~2 mm)
    const wavy = (Q, closed) => {
      const P = Q.map(q => T(q[0], q[1]));
      if (closed) P.push(P[0]);
      let d = `M${n(P[0][0])} ${n(P[0][1])}`, ph = 0;
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 1e-6) continue;
        const k = Math.max(1, Math.round(L / 2)), nx = -dy / L, ny = dx / L;
        for (let j = 1; j <= k; j++) { const t = j / k, tm = (j - 0.5) / k, w = (ph++ % 2 ? -0.6 : 0.6); d += `Q${n(a[0] + dx * tm + nx * w)} ${n(a[1] + dy * tm + ny * w)} ${n(a[0] + dx * t)} ${n(a[1] + dy * t)}`; }
      }
      return d + (closed ? 'Z' : '');
    };
    const id = esc(String(bo.id || ''));
    const pick = `<path class="bpick" d="${wavy(bo.pts, true)}" data-brk="${id}"/>`;
    if (Array.isArray(bo.runs)) return pick + bo.runs.filter(r => r.length > 1).map(r => `<path d="${wavy(r, false)}" data-brk="${id}"/>`).join('');
    return pick.replace('class="bpick" ', '');
  }).join('')}</g>`;
}

/* Mittellinien (Strichpunkt, 0,18 mm) und Bohrungsangaben in Blattkoordinaten */
function centerMarks(v, s, px, py, opts) {
  if (!v || !v.bb || !v.marks || !opts.centers) return '';
  const T = viewToSheet(v, s, px, py), out = [], labels = new Map();
  v.marks.forEach(m => {
    if (m.k === 'circle') {
      const [x, y] = T(m.c[0], m.c[1]), e = m.r * s + 2;
      out.push(`<line x1="${n(x - e)}" y1="${n(y)}" x2="${n(x + e)}" y2="${n(y)}"/><line x1="${n(x)}" y1="${n(y - e)}" x2="${n(x)}" y2="${n(y + e)}"/>`);
      if (opts.holes && m.internal) {
        const tap = (opts.taps || []).find(t => Math.abs(t.d - m.r * 2) < 0.02 || (t.modeled && Math.abs(t.D - m.r * 2) < 0.5));
        if (tap) {
          // Gewinde nach ISO 6410: Dreiviertelkreis (dünn) am Gewindeaußen-⌀
          const R = tap.D / 2 * s;
          out.push(`<path class="thr" d="M${n(x + R)} ${n(y)} A${n(R)} ${n(R)} 0 1 1 ${n(x)} ${n(y - R)}"/>`);
        }
        const key = tap ? tap.label : (m.r * 2).toFixed(2);
        const l = labels.get(key);
        if (l) l.n++; else labels.set(key, { n: 1, x: x + m.r * s * 0.72, y: y - m.r * s * 0.72, d: m.r * 2, tap: tap && tap.label });
      }
    } else {
      const [x1, y1] = T(m.a[0], m.a[1]), [x2, y2] = T(m.b[0], m.b[1]);
      const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      out.push(`<line x1="${n(x1 - ux * 2)}" y1="${n(y1 - uy * 2)}" x2="${n(x2 + ux * 2)}" y2="${n(y2 + uy * 2)}"/>`);
    }
  });
  const lab = [...labels.values()].map(l => `<g class="hl"><line x1="${n(l.x)}" y1="${n(l.y)}" x2="${n(l.x + 5)}" y2="${n(l.y - 5)}"/><line x1="${n(l.x + 5)}" y1="${n(l.y - 5)}" x2="${n(l.x + 17)}" y2="${n(l.y - 5)}"/><text x="${n(l.x + 5.5)}" y="${n(l.y - 6)}">${l.n > 1 ? `${l.n}× ` : ''}${l.tap ? esc(l.tap) : `⌀${fmtNum(l.d, 2)}`}</text></g>`).join('');
  return `<g class="cl">${out.join('')}</g>${lab}`;
}

/* Schnittverlauf in der Vorderansicht (x = cut), Pfeile in Blickrichtung (+x) */
function cutLine(vFront, s, px, py, cut, label) {
  if (!vFront || !vFront.bb || cut == null) return '';
  const T = viewToSheet(vFront, s, px, py);
  const [x, yTop] = T(cut, vFront.bb[1][1]), [, yBot] = T(cut, vFront.bb[0][1]);
  const a = 6, end = (y, dy) => `<line class="cutend" x1="${n(x)}" y1="${n(y)}" x2="${n(x)}" y2="${n(y + dy * 5)}"/><path class="cutarr" d="M${n(x)} ${n(y + dy * 2)} h${a} m0 0 l-2.2 -1 v2 z"/><text class="cutlbl" x="${n(x + a + 1)}" y="${n(y + dy * 2 + 1.3)}">${label}</text>`;
  return `<g class="cut"><line class="cutmid" x1="${n(x)}" y1="${n(yTop - 4)}" x2="${n(x)}" y2="${n(yBot + 4)}"/>${end(yTop - 4, -1)}${end(yBot + 4, 1)}</g>`;
}

/* Freie Schnittlinie (a–b in Ansichtskoordinaten, optional abgesetzt über sp.line):
   strichpunktiert, dicke Enden, Pfeile in Blickrichtung, Kennbuchstaben */
function secLine(t, sp, draft) {
  const P = t(sp.a[0], sp.a[1]), Q = t(sp.b[0], sp.b[1]);
  if (sp.aux && !draft) {
    // Hilfsansicht: Blickpfeil senkrecht auf die Kante (von der Betrachterseite) mit Kennbuchstaben
    let mx = sp.arrow[0], my = -sp.arrow[1];
    const M = Math.hypot(mx, my) || 1; mx /= M; my /= M;
    const C = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2], T2 = [C[0] - mx * 2, C[1] - my * 2], S0 = [C[0] - mx * 12, C[1] - my * 12], B = [T2[0] - mx * 2.4, T2[1] - my * 2.4];
    return `<g class="cut"><line class="cutend" style="stroke-width:0.35" x1="${n(S0[0])}" y1="${n(S0[1])}" x2="${n(B[0])}" y2="${n(B[1])}"/><path class="cutarr" d="M${n(T2[0])} ${n(T2[1])}L${n(B[0] - my * 0.9)} ${n(B[1] + mx * 0.9)}L${n(B[0] + my * 0.9)} ${n(B[1] - mx * 0.9)}Z"/>`
      + `<text class="cutlbl" x="${n(S0[0] - mx * 3)}" y="${n(S0[1] - my * 3 + 1.4)}" text-anchor="middle">${esc(sp.label || '')}</text></g>`;
  }
  const poly = Array.isArray(sp.line) && sp.line.length >= 3 ? sp.line.map(q => t(q[0], q[1])) : [P, Q];
  const dirOf = (A, B) => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; return [(B[0] - A[0]) / L, (B[1] - A[1]) / L]; };
  const segs = (pts, cls, style) => pts.slice(1).map((E, i) => `<line ${cls} x1="${n(pts[i][0])}" y1="${n(pts[i][1])}" x2="${n(E[0])}" y2="${n(E[1])}"${style || ''}/>`).join('');
  if (draft) return segs(poly, 'stroke="#2563eb" stroke-width="0.35" stroke-dasharray="6 1 0.6 1"');
  let mx = sp.arrow[0], my = -sp.arrow[1];
  const M = Math.hypot(mx, my) || 1; mx /= M; my /= M;
  const end = (E, sg, ux, uy) => {
    const O = [E[0] + sg * ux * 4, E[1] + sg * uy * 4], T2 = [O[0] + mx * 7, O[1] + my * 7], B = [T2[0] - mx * 2.4, T2[1] - my * 2.4];
    const lp = [O[0] + sg * ux * 3 + mx * 4, O[1] + sg * uy * 3 + my * 4 + 1.4];
    return `<line class="cutend" x1="${n(E[0])}" y1="${n(E[1])}" x2="${n(O[0])}" y2="${n(O[1])}"/><line class="cutend" style="stroke-width:0.35" x1="${n(O[0])}" y1="${n(O[1])}" x2="${n(B[0])}" y2="${n(B[1])}"/>`
      + `<path class="cutarr" d="M${n(T2[0])} ${n(T2[1])}L${n(B[0] - my * 0.9)} ${n(B[1] + mx * 0.9)}L${n(B[0] + my * 0.9)} ${n(B[1] - mx * 0.9)}Z"/><text class="cutlbl" x="${n(lp[0])}" y="${n(lp[1])}" text-anchor="middle">${esc(sp.label || '')}</text>`;
  };
  const last = poly.length - 1, [ux0, uy0] = dirOf(poly[0], poly[1]), [ux1, uy1] = dirOf(poly[last - 1], poly[last]);
  return `<g class="cut">${segs(poly, 'class="cutmid"')}${end(poly[0], -1, ux0, uy0)}${end(poly[last], 1, ux1, uy1)}</g>`;
}

/* Stückliste über dem Schriftfeld; items = [{pos, qty, name, material, mass}] */
function bomTable(x, yBottom, w, items) {
  if (!items || !items.length) return '';
  const rh = 5, cols = [0, 10, 22, w - 62, w - 26, w];
  const h = rh * (items.length + 1), y = yBottom - h;
  const row = (it, i) => { const yy = y + rh * (items.length - 1 - i); return `<text x="${x + cols[0] + 5}" y="${n(yy + 3.6)}" text-anchor="middle">${it.pos}</text><text x="${x + cols[1] + 6}" y="${n(yy + 3.6)}" text-anchor="middle">${it.qty}</text><text x="${x + cols[2] + 1.5}" y="${n(yy + 3.6)}">${esc(it.name)}</text><text x="${x + cols[3] + 1.5}" y="${n(yy + 3.6)}">${esc(it.material)}</text><text x="${x + cols[5] - 1.5}" y="${n(yy + 3.6)}" text-anchor="end">${esc(it.mass)}</text>`; };
  const lines = [];
  for (let i = 0; i <= items.length + 1; i++) lines.push(`<line x1="${x}" y1="${n(y + i * rh)}" x2="${x + w}" y2="${n(y + i * rh)}"/>`);
  cols.forEach(c => lines.push(`<line x1="${x + c}" y1="${n(y)}" x2="${x + c}" y2="${n(y + h)}"/>`));
  const head = `<text x="${x + 5}" y="${n(y + h - rh + 3.6)}" text-anchor="middle" class="bh">Pos.</text><text x="${x + 16}" y="${n(y + h - rh + 3.6)}" text-anchor="middle" class="bh">Menge</text><text x="${x + cols[2] + 1.5}" y="${n(y + h - rh + 3.6)}" class="bh">Benennung</text><text x="${x + cols[3] + 1.5}" y="${n(y + h - rh + 3.6)}" class="bh">Werkstoff</text><text x="${x + cols[5] - 1.5}" y="${n(y + h - rh + 3.6)}" text-anchor="end" class="bh">Masse</text>`;
  return `<g class="bom">${lines.join('')}${head}${items.map(row).join('')}</g>`;
}

/* Positionsnummern an der Iso-Ansicht */
const ISO = (() => { const d = [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)], x = [1 / Math.SQRT2, 1 / Math.SQRT2, 0]; const y = [d[1] * x[2] - d[2] * x[1], d[2] * x[0] - d[0] * x[2], d[0] * x[1] - d[1] * x[0]]; return { x, y }; })();
function balloons(vIso, s, px, py, items) {
  if (!vIso || !vIso.bb || !items || !items.length) return '';
  const T = viewToSheet(vIso, s, px, py);
  const cu = (vIso.bb[0][0] + vIso.bb[1][0]) / 2, cv = (vIso.bb[0][1] + vIso.bb[1][1]) / 2;
  const [cx, cy] = T(cu, cv);
  return `<g class="bal">${items.filter(it => it.p3).map(it => {
    const p = it.p3, u = p[0] * ISO.x[0] + p[1] * ISO.x[1] + p[2] * ISO.x[2], w = p[0] * ISO.y[0] + p[1] * ISO.y[1] + p[2] * ISO.y[2];
    const [x, y] = T(u, w);
    let dx = x - cx, dy = y - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const bx = x + dx * 14, by = y + dy * 14;
    return `<circle class="dot" cx="${n(x)}" cy="${n(y)}" r="0.5"/><line x1="${n(x)}" y1="${n(y)}" x2="${n(bx - dx * 3.5)}" y2="${n(by - dy * 3.5)}"/><circle cx="${n(bx)}" cy="${n(by)}" r="3.5"/><text x="${n(bx)}" y="${n(by + 1.3)}" text-anchor="middle">${it.pos}</text>`;
  }).join('')}</g>`;
}

/* Schweißsymbole nach ISO 2553 in der isometrischen Ansicht: Pfeillinie zur Naht, Bezugslinie mit Kehlnaht-Dreieck,
   links die Nahtdicke a, rechts Anzahl × Länge; Kreis am Knick = ringsum */
function weldSymbols(vIso, s, px, py, welds, maxX = Infinity) {
  if (!vIso || !vIso.bb || !welds || !welds.length) return '';
  const T = viewToSheet(vIso, s, px, py);
  const [rightX] = T(vIso.bb[1][0], 0);
  const proj = p => T(p[0] * ISO.x[0] + p[1] * ISO.x[1] + p[2] * ISO.x[2], p[0] * ISO.y[0] + p[1] * ISO.y[1] + p[2] * ISO.y[2]);
  // je Naht die am weitesten rechts liegende Stelle; Symbole rechts neben der Ansicht untereinander
  const items = welds.filter(w => w.seams && w.seams.length).map(w => {
    let best = null;
    w.seams.forEach(q => { const xy = proj(q.p); if (!best || xy[0] > best[0]) best = xy; });
    return { w, x: best[0], y: best[1] };
  }).sort((a, b) => a.y - b.y);
  let lastY = -Infinity;
  return `<g class="weld">${items.map(({ w, x, y }) => {
    const kx = Math.min(Math.max(rightX + 20, x + 6), maxX - 32);  // rechts neben den Positionsnummern, aber im Blatt
    const ky = Math.max(y - 6, lastY + 7);
    lastY = ky;
    return weldGlyph(w, x, y, kx, ky);
  }).join('')}</g>`;
}
/* Ein Schweißsymbol: Pfeil von (x, y) zum Knick (kx, ky), Bezugslinie nach rechts, Nahtzeichen und Maße */
function weldGlyph(w, x, y, kx, ky) {
    const ex = kx + 26, tx = kx + 9;
    const Ls = [...new Set(w.seams.map(q => Math.round(q.L)))];
    const right = w.all && w.loops ? `${w.loops > 1 ? `${w.loops}× ` : ''}${fmtNum(w.length / w.loops, 0)}` : `${w.seams.length > 1 ? `${w.seams.length}× ` : ''}${Ls.length === 1 ? Ls[0] : fmtNum(w.length, 0)}`;
    const ah = 2.2, ang = Math.atan2(ky - y, kx - x), a1 = ang + 0.3, a2 = ang - 0.3;
    return `<g><line x1="${n(x)}" y1="${n(y)}" x2="${n(kx)}" y2="${n(ky)}"/>`
      + `<path class="arr" d="M${n(x)} ${n(y)}L${n(x + Math.cos(a1) * ah)} ${n(y + Math.sin(a1) * ah)}L${n(x + Math.cos(a2) * ah)} ${n(y + Math.sin(a2) * ah)}Z"/>`
      + `<line x1="${n(kx)}" y1="${n(ky)}" x2="${n(ex)}" y2="${n(ky)}"/>`
      + (w.all ? `<circle cx="${n(kx)}" cy="${n(ky)}" r="1.2"/>` : '')
      + `<path d="${w.kind === 'i' ? `M${n(tx)} ${n(ky)}V${n(ky + 2.6)}M${n(tx + 1.4)} ${n(ky)}V${n(ky + 2.6)}` : w.kind === 'v' ? `M${n(tx - 1.3)} ${n(ky + 2.6)}L${n(tx)} ${n(ky)}L${n(tx + 1.3)} ${n(ky + 2.6)}` : w.kind === 'hv' ? `M${n(tx)} ${n(ky + 2.6)}V${n(ky)}L${n(tx + 1.6)} ${n(ky + 2.6)}` : `M${n(tx)} ${n(ky)}V${n(ky + 2.6)}L${n(tx + 2.6)} ${n(ky)}`}"/>`
      + `<text x="${n(tx - (w.kind === 'v' ? 2 : 0.8))}" y="${n(ky + 2.5)}" text-anchor="end">${w.kind && w.kind !== 'fillet' ? 's' : 'a'}${fmtNum(w.a, 1)}</text>`
      + `<text x="${n(tx + 3.4)}" y="${n(ky + 2.5)}">${right}</text></g>`;
}

/* Schweißsymbole in den Normansichten (ISO 2553): jede Naht in der Ansicht, in der sie am längsten erscheint.
   Symbole über Vorder- und Seitenansicht bzw. unter der Draufsicht, nebeneinander nach x sortiert. */
const STD_AX = { front: { x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] }, top: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] }, left: { x: [0, -1, 0], y: [0, 0, 1], n: [-1, 0, 0] } };
function weldSymbolsStd(views, places, welds, frame) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vis = (q, ax) => q.L * (q.d ? Math.sqrt(Math.max(0, 1 - dot(q.d, ax.n) ** 2)) : 1);
  const groups = { front: [], top: [], left: [] };
  (welds || []).filter(w => w.seams && w.seams.length).forEach(w => {
    let best = null, bl = -1;
    Object.keys(STD_AX).forEach(k => {
      if (!views[k] || !views[k].bb || !places[k]) return;
      const L = w.seams.reduce((s, q) => s + vis(q, STD_AX[k]), 0);
      if (L > bl + 1e-6) { bl = L; best = k; }
    });
    if (!best) return;
    const ax = STD_AX[best], P = places[best], T = viewToSheet(views[best], P.s, P.px, P.py);
    const q = w.seams.reduce((m, x) => (!m || vis(x, ax) > vis(m, ax) + 1e-6 ? x : m), null);
    const [x, y] = T(dot(q.p, ax.x), dot(q.p, ax.y));
    groups[best].push({ w, x, y });
  });
  const out = [];
  Object.entries(groups).forEach(([k, items]) => {
    if (!items.length) return;
    const v = views[k], P = places[k], T = viewToSheet(v, P.s, P.px, P.py);
    const topY = T(v.bb[0][0], v.bb[1][1])[1], botY = T(v.bb[0][0], v.bb[0][1])[1];
    items.sort((a, b) => a.x - b.x);
    let lastX = -Infinity;
    items.forEach((it, i) => {
      // über der Ansicht (Platz für Gesamtmaße lassen), bei der Draufsicht darunter; gestaffelt, damit sich nichts überdeckt
      const ky = k === 'top' ? Math.min(botY + 10 + (i % 3) * 6, frame.y + frame.h - 4) : Math.max(topY - 18 - (i % 3) * 6, frame.y + 4);
      const kx = Math.min(Math.max(it.x + 4, lastX + 30), frame.x + frame.w - 32);
      lastX = kx;
      out.push(weldGlyph(it.w, it.x, it.y, kx, ky));
    });
  });
  return out.length ? `<g class="weld">${out.join('')}</g>` : '';
}

/* Endpunkte aus SVG-Pfaddaten (M, L, A, C, Q, H, V) in Ansichtskoordinaten (v nach oben) */
function pathPoints(d) {
  const out = [], tok = d.match(/[MLHVACQZmlhvacqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0, cmd = 'M', x = 0, y = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z' || cmd === 'z') continue; }
    const C = cmd.toUpperCase(), rel = cmd !== C;
    if (C === 'M' || C === 'L') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'H') { const a = num(); x = rel ? x + a : a; }
    else if (C === 'V') { const b = num(); y = rel ? y + b : b; }
    else if (C === 'A') { i += 5; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'C') { i += 4; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'Q') { i += 2; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else { i++; continue; }
    if (isFinite(x) && isFinite(y)) out.push([x, -y]);
  }
  return out;
}
/* Kreisbögen aus SVG-Pfaddaten (A-Befehle mit rx = ry): Mittelpunkt und Radius in Ansichtskoordinaten (v nach oben) */
function pathArcs(d) {
  const out = [], tok = d.match(/[MLHVACQZmlhvacqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0, cmd = 'M', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z' || cmd === 'z') { x = sx; y = sy; continue; } }
    const C = cmd.toUpperCase(), rel = cmd !== C;
    if (C === 'M') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; sx = x; sy = y; if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l'; }
    else if (C === 'L') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'H') { const a = num(); x = rel ? x + a : a; }
    else if (C === 'V') { const b = num(); y = rel ? y + b : b; }
    else if (C === 'A') {
      const rx = num(), ry = num(); i++; const fa = num(), fs = num(), a = num(), b = num();
      const x2 = rel ? x + a : a, y2 = rel ? y + b : b;
      if (rx > 1e-6 && Math.abs(rx - ry) < 1e-6 * Math.max(1, rx)) {
        const dx = (x - x2) / 2, dy = (y - y2) / 2, d2 = dx * dx + dy * dy;
        if (d2 > 1e-12) {
          const r = Math.max(rx, Math.sqrt(d2)), k = Math.sqrt(Math.max(0, (r * r - d2) / d2)) * (fa === fs ? -1 : 1);
          const cx = k * dy + (x + x2) / 2, cy = -k * dx + (y + y2) / 2;
          // überstrichener Winkel (großer Bogen über die Flagge), Anfang/Ende in Ansichtskoordinaten (y nach oben)
          const ch = Math.min(1, Math.sqrt(d2) / r), small = 2 * Math.asin(ch);
          out.push({ c: [cx, -cy], r, s: [x, -y], e: [x2, -y2], sweep: fa ? 2 * Math.PI - small : small });
        }
      }
      x = x2; y = y2;
    }
    else if (C === 'C') { i += 4; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'Q') { i += 2; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else i++;
  }
  return out;
}
/* Gerade Stücke aus SVG-Pfaddaten (M/L/H/V/Z) in Ansichtskoordinaten (v nach oben) */
function pathSegments(d) {
  const out = [], tok = d.match(/[MLHVACQZmlhvacqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0, cmd = 'M', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(tok[i++]);
  const seg = (x0, y0, x1, y1) => { if (Math.hypot(x1 - x0, y1 - y0) > 1e-6) out.push([[x0, -y0], [x1, -y1]]); };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z' || cmd === 'z') { seg(x, y, sx, sy); x = sx; y = sy; continue; } }
    const C = cmd.toUpperCase(), rel = cmd !== C, x0 = x, y0 = y;
    if (C === 'M') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; seg(x0, y0, x, y); }
    else if (C === 'H') { const a = num(); x = rel ? x + a : a; seg(x0, y0, x, y); }
    else if (C === 'V') { const b = num(); y = rel ? y + b : b; seg(x0, y0, x, y); }
    else if (C === 'A') { i += 5; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'C') { i += 4; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else if (C === 'Q') { i += 2; const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; }
    else i++;
  }
  return out;
}
/* Winkelmaß: Schnittpunkt der beiden Linien und die zwei Strahlen, zwischen denen die Textlage at liegt */
function angleGeom(dm) {
  const [a1, b1] = [dm.l1.a, dm.l1.b], [a2, b2] = [dm.l2.a, dm.l2.b];
  const d1 = [b1[0] - a1[0], b1[1] - a1[1]], d2 = [b2[0] - a2[0], b2[1] - a2[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9 * Math.hypot(...d1) * Math.hypot(...d2)) return null;
  const t = ((a2[0] - a1[0]) * d2[1] - (a2[1] - a1[1]) * d2[0]) / den, X = [a1[0] + d1[0] * t, a1[1] + d1[1] * t];
  const ang = v => Math.atan2(v[1], v[0]), norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const rays = [norm(ang(d1)), norm(ang(d1) + Math.PI), norm(ang(d2)), norm(ang(d2) + Math.PI)].sort((p, q) => p - q);
  const ac = norm(Math.atan2(dm.at[1] - X[1], dm.at[0] - X[0]));
  let s0 = rays[3], s1 = rays[0] + 2 * Math.PI;
  for (let k = 0; k < 4; k++) { const lo = rays[k], hi = k < 3 ? rays[k + 1] : rays[0] + 2 * Math.PI; const c2 = ac < lo ? ac + 2 * Math.PI : ac; if (c2 >= lo && c2 <= hi) { s0 = lo; s1 = hi; break; } }
  return { X, s0, s1, R: Math.hypot(dm.at[0] - X[0], dm.at[1] - X[1]) };
}
/* Wert eines Maßes (Länge in mm bzw. Winkel in Grad) */
export function dimValue(dm) {
  if (dm.kind === 'dia') return 2 * dm.r;
  if (dm.kind === 'rad') return dm.r;
  if (dm.kind === 'arc') return dm.r * dm.sweep;
  if (dm.kind === 'ang') { const g = angleGeom(dm); return g ? (g.s1 - g.s0) * 180 / Math.PI : 0; }
  if (dm.kind === 'ord') return Math.abs(dm.dir === 'v' ? dm.p[1] - dm.o[1] : dm.p[0] - dm.o[0]);
  if (dm.dir === 'a') return Math.hypot(dm.b[0] - dm.a[0], dm.b[1] - dm.a[1]);
  return dm.dir === 'v' ? Math.abs(dm.b[1] - dm.a[1]) : Math.abs(dm.b[0] - dm.a[0]);
}
function angleDim(T, dm, fmtNum) {
  const g = angleGeom(dm);
  if (!g) return '';
  const N = 32, pts = [];
  for (let k = 0; k <= N; k++) { const a = g.s0 + (g.s1 - g.s0) * k / N; pts.push(T(g.X[0] + Math.cos(a) * g.R, g.X[1] + Math.sin(a) * g.R)); }
  const p0 = pts[0], p1 = pts[N], q0 = pts[1], q1 = pts[N - 1];
  const am = (g.s0 + g.s1) / 2, [mx, my] = T(g.X[0] + Math.cos(am) * g.R, g.X[1] + Math.sin(am) * g.R), [cx, cy] = T(g.X[0], g.X[1]);
  const ux = mx - cx, uy = my - cy, ul = Math.hypot(ux, uy) || 1;
  // Hilfslinien vom Schnittpunkt bis über den Bogen hinaus
  const ext = (a) => { const [ex, ey] = T(g.X[0] + Math.cos(a) * g.R, g.X[1] + Math.sin(a) * g.R), dx = ex - cx, dy = ey - cy, l = Math.hypot(dx, dy) || 1; return `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(ex + dx / l * 2)}" y2="${n(ey + dy / l * 2)}" class="thin"/>`; };
  const label = dimLabel(dimValue(dm), { ...dm, prefix: dm.prefix || '' }, (v, d) => fmtNum(v, Math.min(d, 1))).replace(/^([^<]*)/, '$1°');
  return ext(g.s0) + ext(g.s1) + `<path d="M${pts.map(q => `${n(q[0])} ${n(q[1])}`).join('L')}" fill="none"/>`
    + arrowAt(p0[0], p0[1], p0[0] - q0[0], p0[1] - q0[1]) + arrowAt(p1[0], p1[1], p1[0] - q1[0], p1[1] - q1[1])
    + `<text x="${n(mx + ux / ul * 3)}" y="${n(my + uy / ul * 3 + 1)}" text-anchor="middle" data-dim="${dm.id}">${label}</text>`;
}
/* schräges (paralleles) Längenmaß: Maßlinie parallel zu a–b im Abstand at */
function alignedDim(T, dm, fmtNum) {
  const dx = dm.b[0] - dm.a[0], dy = dm.b[1] - dm.a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const P1 = T(dm.a[0], dm.a[1]), P2 = T(dm.b[0], dm.b[1]), Q1 = T(dm.a[0] + nx * dm.at, dm.a[1] + ny * dm.at), Q2 = T(dm.b[0] + nx * dm.at, dm.b[1] + ny * dm.at);
  const ex = (P, Q) => { const vx = Q[0] - P[0], vy = Q[1] - P[1], l = Math.hypot(vx, vy); if (l < 1e-6) return ''; return `<line x1="${n(P[0] + vx / l)}" y1="${n(P[1] + vy / l)}" x2="${n(Q[0] + vx / l * 2)}" y2="${n(Q[1] + vy / l * 2)}"/>`; };
  let ang = Math.atan2(Q2[1] - Q1[1], Q2[0] - Q1[0]) * 180 / Math.PI;
  if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
  const mx = (Q1[0] + Q2[0]) / 2, my = (Q1[1] + Q2[1]) / 2, r = ang * Math.PI / 180, tx = mx + Math.sin(r) * 1.2, ty = my - Math.cos(r) * 1.2;
  return ex(P1, Q1) + ex(P2, Q2) + `<line x1="${n(Q1[0])}" y1="${n(Q1[1])}" x2="${n(Q2[0])}" y2="${n(Q2[1])}"/>`
    + arrowAt(Q1[0], Q1[1], Q1[0] - Q2[0], Q1[1] - Q2[1]) + arrowAt(Q2[0], Q2[1], Q2[0] - Q1[0], Q2[1] - Q1[1])
    + `<text x="${n(tx)}" y="${n(ty)}" text-anchor="middle" transform="rotate(${n(ang)} ${n(tx)} ${n(ty)})" data-dim="${dm.id}">${dimLabel(dimValue(dm), dm, fmtNum)}</text>`;
}
/* Pfeil mit Spitze in (tx, ty) in Richtung (dx, dy) */
const arrowAt = (tx, ty, dx, dy) => { const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, a = 2.6, b = 0.9; return `<path class="arr" d="M${n(tx)} ${n(ty)}L${n(tx - ux * a - uy * b)} ${n(ty - uy * a + ux * b)}L${n(tx - ux * a + uy * b)} ${n(ty - uy * a - ux * b)}Z"/>`; };
/* Bogenlängenmaß (ISO 129): Maßbogen konzentrisch im Abstand |at − c|, Hilfslinien radial, Bogenzeichen vor der Zahl */
function arcLenDim(T, dm, fmtNum) {
  const wrap = a => { while (a < 0) a += 2 * Math.PI; while (a >= 2 * Math.PI) a -= 2 * Math.PI; return a; };
  const as = Math.atan2(dm.s[1] - dm.c[1], dm.s[0] - dm.c[0]), ae = Math.atan2(dm.e[1] - dm.c[1], dm.e[0] - dm.c[0]);
  // gegen den Uhrzeigersinn von a0 aus um sweep (Anfang/Ende so wählen, dass es passt)
  const a0 = Math.abs(wrap(ae - as) - dm.sweep) < 1e-3 ? as : ae;
  const R = Math.max(dm.r * 1.05, Math.hypot(dm.at[0] - dm.c[0], dm.at[1] - dm.c[1])), N = 48, pts = [];
  for (let k = 0; k <= N; k++) { const a = a0 + dm.sweep * k / N; pts.push(T(dm.c[0] + Math.cos(a) * R, dm.c[1] + Math.sin(a) * R)); }
  const ext = a => { const p = T(dm.c[0] + Math.cos(a) * dm.r, dm.c[1] + Math.sin(a) * dm.r), q = T(dm.c[0] + Math.cos(a) * R, dm.c[1] + Math.sin(a) * R), dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return `<line x1="${n(p[0] + dx / l)}" y1="${n(p[1] + dy / l)}" x2="${n(q[0] + dx / l * 2)}" y2="${n(q[1] + dy / l * 2)}"/>`; };
  const am = a0 + dm.sweep / 2, [mx, my] = T(dm.c[0] + Math.cos(am) * R, dm.c[1] + Math.sin(am) * R), [cx, cy] = T(dm.c[0], dm.c[1]);
  const ux = mx - cx, uy = my - cy, ul = Math.hypot(ux, uy) || 1, p0 = pts[0], p1 = pts[N];
  return ext(a0) + ext(a0 + dm.sweep) + `<path d="M${pts.map(q => `${n(q[0])} ${n(q[1])}`).join('L')}" fill="none"/>`
    + arrowAt(p0[0], p0[1], p0[0] - pts[1][0], p0[1] - pts[1][1]) + arrowAt(p1[0], p1[1], p1[0] - pts[N - 1][0], p1[1] - pts[N - 1][1])
    + `<text x="${n(mx + ux / ul * 3)}" y="${n(my + uy / ul * 3 + 1)}" text-anchor="middle" data-dim="${dm.id}">${dimLabel(dimValue(dm), { ...dm, prefix: '⌒' + (dm.prefix || '') }, fmtNum)}</text>`;
}
/* Durchmesser- (⌀) bzw. Radiusmaß (R): Maßlinie durch den Mittelpunkt zur Textlage at, Pfeile am Kreis */
function radialDim(T, dm, fmtNum) {
  const [cx, cy] = T(dm.c[0], dm.c[1]), q = T(dm.c[0] + dm.r, dm.c[1]), rs = Math.hypot(q[0] - cx, q[1] - cy);
  const [lx, ly] = T(dm.at[0], dm.at[1]);
  let dx = lx - cx, dy = ly - cy;
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const p1 = [cx + dx * rs, cy + dy * rs], dia = dm.kind === 'dia';
  const value = dia ? 2 * dm.r : dm.r;
  const label = dimLabel(value, { ...dm, prefix: (dia ? '⌀' : 'R') + (dm.prefix || '') }, fmtNum);
  const right = dx >= 0, sh = 6, tx = right ? lx + 0.8 : lx - 0.8;
  let g = '';
  if (dia) {
    const p0 = [cx - dx * rs, cy - dy * rs];
    g += `<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(lx)}" y2="${n(ly)}"/>` + arrowAt(p0[0], p0[1], -dx, -dy) + arrowAt(p1[0], p1[1], dx, dy);
  } else {
    g += `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(lx)}" y2="${n(ly)}"/>` + arrowAt(p1[0], p1[1], dx, dy);
  }
  // kurze waagerechte Bezugslinie, darauf der Maßtext
  g += `<line x1="${n(lx)}" y1="${n(ly)}" x2="${n(lx + (right ? sh : -sh))}" y2="${n(ly)}"/>`;
  g += `<text x="${n(tx)}" y="${n(ly - 1.2)}" text-anchor="${right ? 'start' : 'end'}" data-dim="${dm.id}">${label}</text>`;
  return g;
}
/* Benutzermaß: waagerecht (h, misst Δu) oder senkrecht (v, misst Δv); at = Lage der Maßlinie in Ansichtskoordinaten */
/* Maßtext mit Präfix und Toleranz (±, Abmaße oder ISO-Passung) */
function dimLabel(value, dm, fmtNum) {
  const fdev = v => (Math.abs(v) < 1e-9 ? '0' : (v > 0 ? '+' : '−') + fmtNum(Math.abs(v), 3));
  const main = `${dm.prefix || ''}${fmtNum(value, 2)}`;
  const t = dm.tol;
  if (!t || !t.kind) return esc(main);
  const small = txt => `<tspan class="tol" dx="0.8">${esc(txt)}</tspan>`;
  if (t.kind === 'sym') return esc(main) + small(`±${fmtNum(Math.abs(Number(t.v) || 0), 3)}`);
  if (t.kind === 'dev') return esc(main) + small(`${fdev(Number(t.up) || 0)}/${fdev(Number(t.lo) || 0)}`);
  if (t.kind === 'fit') {
    const d = fitDeviations(value, t.code);
    return esc(`${main} ${t.code}`) + (d && t.show !== false ? small(`(${fdev(d.up)}/${fdev(d.lo)})`) : '');
  }
  return esc(main);
}
/* Koordinatenmaß: Hinweislinie vom Punkt zur Maßlage, Wert = Abstand zum Nullpunkt o entlang u (h) bzw. v (v).
   t = Lage des Textes entlang der Messrichtung (beim Anlegen auseinandergezogen), sonst am Punkt. */
function ordDim(T, dm, fmtNum) {
  const P = T(dm.p[0], dm.p[1]), label = dimLabel(dimValue(dm), dm, fmtNum);
  if (dm.dir === 'v') {
    const x = T(dm.at, 0)[0], sg = x < P[0] ? -1 : 1, ty = T(0, dm.t ?? dm.p[1])[1], xj = x - sg * 3;
    return `<line x1="${n(P[0] + sg)}" y1="${n(P[1])}" x2="${n(xj)}" y2="${n(P[1])}"/><line x1="${n(xj)}" y1="${n(P[1])}" x2="${n(x)}" y2="${n(ty)}"/>`
      + `<text x="${n(x + sg * 0.8)}" y="${n(ty + 1.1)}" text-anchor="${sg > 0 ? 'start' : 'end'}" data-dim="${dm.id}">${label}</text>`;
  }
  const y = T(0, dm.at)[1], sg = y < P[1] ? -1 : 1, tx = T(dm.t ?? dm.p[0], 0)[0], yj = y - sg * 3;
  return `<line x1="${n(P[0])}" y1="${n(P[1] + sg)}" x2="${n(P[0])}" y2="${n(yj)}"/><line x1="${n(P[0])}" y1="${n(yj)}" x2="${n(tx)}" y2="${n(y)}"/>`
    + `<text x="${n(tx + 1.1)}" y="${n(y + sg * 0.8)}" text-anchor="${sg > 0 ? 'end' : 'start'}" transform="rotate(-90 ${n(tx + 1.1)} ${n(y + sg * 0.8)})" data-dim="${dm.id}">${label}</text>`;
}
function userDim(T, dm, fmtNum) {
  if (dm.kind === 'ord') return ordDim(T, dm, fmtNum);
  if (dm.kind === 'dia' || dm.kind === 'rad') return radialDim(T, dm, fmtNum);
  if (dm.kind === 'arc') return arcLenDim(T, dm, fmtNum);
  if (dm.kind === 'ang') return angleDim(T, dm, fmtNum);
  if (dm.dir === 'a') return alignedDim(T, dm, fmtNum);
  const p1 = T(dm.a[0], dm.a[1]), p2 = T(dm.b[0], dm.b[1]);
  const value = dm.dir === 'v' ? Math.abs(dm.b[1] - dm.a[1]) : Math.abs(dm.b[0] - dm.a[0]);
  const a = 2.6, b = 0.9, out = [];
  if (dm.dir === 'v') {
    const x = T(dm.at, 0)[0];
    const sg = x < p1[0] ? -1 : 1;
    out.push(`<line x1="${n(p1[0] + sg * 1)}" y1="${n(p1[1])}" x2="${n(x + sg * 2)}" y2="${n(p1[1])}"/><line x1="${n(p2[0] + sg * 1)}" y1="${n(p2[1])}" x2="${n(x + sg * 2)}" y2="${n(p2[1])}"/>`);
    const [ya, yb] = p1[1] < p2[1] ? [p1[1], p2[1]] : [p2[1], p1[1]];
    out.push(`<line x1="${n(x)}" y1="${n(ya)}" x2="${n(x)}" y2="${n(yb)}"/><path class="arr" d="M${n(x)} ${n(ya)} l${-b} ${a} h${2 * b}z M${n(x)} ${n(yb)} l${-b} ${-a} h${2 * b}z"/>`);
    const ty = (ya + yb) / 2;
    out.push(`<text x="${n(x - 1.2)}" y="${n(ty)}" text-anchor="middle" transform="rotate(-90 ${n(x - 1.2)} ${n(ty)})" data-dim="${dm.id}">${dimLabel(value, dm, fmtNum)}</text>`);
  } else {
    const y = T(0, dm.at)[1];
    const sg = y < p1[1] ? -1 : 1;
    out.push(`<line x1="${n(p1[0])}" y1="${n(p1[1] + sg * 1)}" x2="${n(p1[0])}" y2="${n(y + sg * 2)}"/><line x1="${n(p2[0])}" y1="${n(p2[1] + sg * 1)}" x2="${n(p2[0])}" y2="${n(y + sg * 2)}"/>`);
    const [xa, xb] = p1[0] < p2[0] ? [p1[0], p2[0]] : [p2[0], p1[0]];
    out.push(`<line x1="${n(xa)}" y1="${n(y)}" x2="${n(xb)}" y2="${n(y)}"/><path class="arr" d="M${n(xa)} ${n(y)} l${a} ${-b} v${2 * b}z M${n(xb)} ${n(y)} l${-a} ${-b} v${2 * b}z"/>`);
    out.push(`<text x="${n((xa + xb) / 2)}" y="${n(y - 1.2)}" text-anchor="middle" data-dim="${dm.id}">${dimLabel(value, dm, fmtNum)}</text>`);
  }
  return out.join('');
}

/* Projektionssymbol Methode 1 (Kegelstumpf) */
function projSymbol(x, y) {
  return `<g class="sym" transform="translate(${x} ${y})"><path d="M0 0 L8 1.6 L8 6.4 L0 8 Z"/><line x1="-1" y1="4" x2="9" y2="4" class="cl"/><circle cx="15" cy="4" r="4"/><circle cx="15" cy="4" r="2"/><line x1="10" y1="4" x2="20" y2="4" class="cl"/></g>`;
}

/* Schriftfeld (vereinfacht nach DIN EN ISO 7200) */
/* Eigene Schriftfeld-Vorlage (SVG): Platzhalter {Benennung}, {Zeichnungsnummer}, … und {Bezeichnung} jedes freien Felds
   werden durch die Werte ersetzt; unbekannte Platzhalter bleiben stehen, damit Tippfehler auffallen. Die Vorlage wird auf
   ihre Größe in mm gesetzt (viewBox → Breite/Höhe). */
export const TB_PLACEHOLDERS = ['Benennung', 'Zeichnungsnummer', 'Gezeichnet', 'Datum', 'Werkstoff', 'Masse', 'Maßstab', 'Format', 'Blatt', 'Änderung', 'Allgemeintoleranz', 'Einheit'];
function customTitleBlock(x, y, w, h, info) {
  const c = info.custom, vb = c.vb;
  const val = { Benennung: info.name, Zeichnungsnummer: info.number, Nummer: info.number, Gezeichnet: info.author, Datum: info.date, Werkstoff: info.material, Masse: info.mass, 'Maßstab': info.scale, Format: info.format, Blatt: info.sheetLabel || '1 / 1', 'Änderung': info.rev, Allgemeintoleranz: info.tol || 'ISO 2768-m', Einheit: 'mm' };
  (info.extra || []).forEach(e => { if (e && e.label) val[e.label] = e.value; });
  const inner = c.inner.replace(/\{([^{}<>]{1,40})\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(val, k.trim()) ? esc(val[k.trim()] ?? '') : m));
  return `<g class="tb tbc" data-tb="1" transform="translate(${n(x)} ${n(y)}) scale(${n(w / vb[2])} ${n(h / vb[3])}) translate(${n(-vb[0])} ${n(-vb[1])})">${inner}</g>`;
}
function titleBlock(x, y, w, h, info) {
  if (info.template === 'custom' && info.custom) return customTitleBlock(x, y, w, h, info);
  const ex = (info.extra || []).filter(e => e && (e.label || e.value)).slice(0, 9), eh = Math.ceil(ex.length / 3) * 8;
  const base = info.template === 'simple' ? simpleTitleBlock(x, y + eh, w, h - eh, info) : isoTitleBlock(x, y + eh, w, h - eh, info);
  if (!ex.length) return base;
  // freie Felder (Bezeichnung klein, Wert darunter), drei je Zeile über dem eigentlichen Schriftfeld
  const cw = w / 3, rows = Math.ceil(ex.length / 3);
  let g = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(eh)}"/>`;
  for (let i = 1; i < rows; i++) g += `<line x1="${n(x)}" y1="${n(y + i * 8)}" x2="${n(x + w)}" y2="${n(y + i * 8)}"/>`;
  ex.forEach((e, i) => {
    const cx = x + (i % 3) * cw, cy = y + Math.floor(i / 3) * 8;
    if (i % 3) g += `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx)}" y2="${n(cy + 8)}"/>`;
    g += `<text x="${n(cx + 1.5)}" y="${n(cy + 3)}" class="lbl">${esc(e.label)}</text><text x="${n(cx + 1.5)}" y="${n(cy + 6.6)}" class="val">${esc(e.value)}</text>`;
  });
  return base + `<g class="tb tbx" data-tb="1">${g}</g>`;
}
function isoTitleBlock(x, y, w, h, info) {
  const r = h / 4, c1 = 28, c2 = w - 62, c3 = w - 34;
  const cell = (cx, cy, label, value, big) => `<text x="${n(cx + 1.5)}" y="${n(cy + 3)}" class="lbl">${esc(label)}</text><text x="${n(cx + 1.5)}" y="${n(cy + r - 2)}" class="${big ? 'big' : 'val'}">${esc(value)}</text>`;
  return `<g class="tb" data-tb="1">
    <rect x="${x}" y="${y}" width="${w}" height="${h}"/>
    <line x1="${x}" y1="${y + 2 * r}" x2="${x + w}" y2="${y + 2 * r}"/><line x1="${x}" y1="${y + 3 * r}" x2="${x + w}" y2="${y + 3 * r}"/>
    <line x1="${x + c2}" y1="${y}" x2="${x + c2}" y2="${y + h}"/><line x1="${x + c3}" y1="${y}" x2="${x + c3}" y2="${y + 2 * r}"/>
    <line x1="${x + c2}" y1="${y + r}" x2="${x + w}" y2="${y + r}"/>
    <line x1="${x + c1}" y1="${y + 2 * r}" x2="${x + c1}" y2="${y + h}"/><line x1="${x + c1 * 2.6}" y1="${y + 2 * r}" x2="${x + c1 * 2.6}" y2="${y + h}"/>
    ${cell(x, y, 'Benennung', info.name, true).replace(`y="${n(y + r - 2)}"`, `y="${n(y + 2 * r - 4)}"`)}
    ${cell(x + c2, y, 'Maßstab', info.scale)}${cell(x + c3, y, 'Format', info.format)}
    ${cell(x + c2, y + r, 'Projektion', '')}${projSymbol(x + c2 + 14, y + r + 2.2)}
    ${cell(x, y + 2 * r, 'Masse', info.mass)}${cell(x + c1, y + 2 * r, 'Datum', info.date)}${cell(x + c1 * 2.6, y + 2 * r, 'Werkstoff', info.material)}
    ${cell(x + c2, y + 2 * r, 'Zeichnungsnummer', info.number)}
    ${cell(x, y + 3 * r, 'Gezeichnet', info.author)}${cell(x + c1, y + 3 * r, 'Einheit', 'mm')}${cell(x + c1 * 2.6, y + 3 * r, 'Allgemeintoleranz', info.tol || 'ISO 2768-m')}
    ${cell(x + c2, y + 3 * r, 'Blatt', info.sheetLabel || '1 / 1')}${info.rev ? `<line x1="${x + c2 + 24}" y1="${y + 3 * r}" x2="${x + c2 + 24}" y2="${y + h}"/>${cell(x + c2 + 24, y + 3 * r, 'Änderung', info.rev)}` : ''}
  </g>`;
}

/* Kompaktes Schriftfeld für interne Fertigungszeichnungen: weniger Zellen, große Benennung. */
function simpleTitleBlock(x, y, w, h, info) {
  const r = h / 4, split = x + w * 0.62, cell = (cx, cy, label, value, big = false) => `<text x="${n(cx + 1.5)}" y="${n(cy + 3)}" class="lbl">${esc(label)}</text><text x="${n(cx + 1.5)}" y="${n(cy + r - 2)}" class="${big ? 'big' : 'val'}">${esc(value)}</text>`;
  return `<g class="tb" data-tb="1"><rect x="${x}" y="${y}" width="${w}" height="${h}"/>
    <line x1="${x}" y1="${y + 2 * r}" x2="${x + w}" y2="${y + 2 * r}"/><line x1="${x}" y1="${y + 3 * r}" x2="${x + w}" y2="${y + 3 * r}"/><line x1="${split}" y1="${y}" x2="${split}" y2="${y + h}"/>
    ${cell(x, y, 'Benennung', info.name, true).replace(`y="${n(y + r - 2)}"`, `y="${n(y + 2 * r - 4)}"`)}${cell(split, y, 'Zeichnungsnummer', info.number)}
    ${cell(split, y + r, 'Blatt · Maßstab', `${info.sheetLabel || '1 / 1'} · ${info.scale}`)}${cell(x, y + 2 * r, 'Werkstoff · Masse', `${info.material} · ${info.mass}`)}
    ${cell(split, y + 2 * r, 'Datum', info.date)}${cell(x, y + 3 * r, 'Gezeichnet · Toleranz', `${info.author} · ${info.tol || 'ISO 2768-m'}`)}${cell(split, y + 3 * r, 'Änderung', info.rev || '–')}</g>`;
}

/* Abwicklung in Blattkoordinaten: Kontur, Ausschnitte, Biegelinien (Strichpunkt) mit Winkel, Gesamtmaße */
function arcPts(a, m, b, seg = 16) {
  const ax = a[0], ay = a[1], bx = m[0], by = m[1], cx = b[0], cy = b[1];
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-12) return [a, b];
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  const r = Math.hypot(ax - ux, ay - uy), ang = p => Math.atan2(p[1] - uy, p[0] - ux);
  const wrap = x => { while (x < 0) x += 2 * Math.PI; while (x >= 2 * Math.PI) x -= 2 * Math.PI; return x; };
  const t0 = ang(a), tm = wrap(ang(m) - t0), t1 = wrap(ang(b) - t0);
  const span = tm < t1 ? t1 : t1 - 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= seg; i++) { const t = t0 + span * i / seg; out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); }
  return out;
}
function flatView(flat, s, px, py, factor) {
  const bb = flat.bb, T = p => [px + (p[0] - bb[0][0]) * s, py + (bb[1][1] - p[1]) * s];
  const loopD = lp => {
    if (lp.circle) { const [x, y] = T(lp.circle.c), r = lp.circle.r * s; return `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}Z`; }
    const pts = [];
    lp.edges.forEach((e, i) => { const seg = e.type === 'arc' && e.mid ? arcPts(e.a, e.mid, e.b) : [e.a, e.b]; (i ? seg.slice(1) : seg).forEach(q => pts.push(T(q))); });
    return 'M' + pts.map(q => q.map(n).join(' ')).join('L') + 'Z';
  };
  const outline = [...flat.contour, ...flat.holes].map(loopD).join('');
  const w = (bb[1][0] - bb[0][0]) * s, h = (bb[1][1] - bb[0][1]) * s;
  const bends = flat.bends.map((b, i) => {
    const [x1, y1] = T(b.a), [x2, y2] = T(b.b);
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    // Nummer an das obere bzw. linke Ende – unten und rechts stehen die Gesamtmaße der Abwicklung
    const startAtA = Math.abs(uy) >= Math.abs(ux) ? y1 <= y2 : x1 <= x2;
    const bx = startAtA ? x1 - ux * 4 : x2 + ux * 4, by = startAtA ? y1 - uy * 4 : y2 + uy * 4;
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/><text x="${n((x1 + x2) / 2)}" y="${n((y1 + y2) / 2 - 0.8)}" text-anchor="middle">${esc(b.label)}</text>`
      + `<g class="bnum"><circle cx="${n(bx)}" cy="${n(by)}" r="2"/><text x="${n(bx)}" y="${n(by + 0.8)}" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  const dims = dimLine(px, py + h, px + w, py + h, 1, 7, fmtNum(bb[1][0] - bb[0][0], 2)) + dimLine(px + w, py, px + w, py + h, 1, 7, fmtNum(bb[1][1] - bb[0][1], 2));
  const title = `<text class="vtitle" x="${n(px + w / 2)}" y="${n(py - (flat.bends.length ? 8 : 3))}" text-anchor="middle">Abwicklung${factor !== 1 ? ` (M ${scaleLabel(s)})` : ''}</text>`;
  return `<g class="flatv"><path class="fo" d="${outline}" fill-rule="evenodd"/><g class="fb">${bends}</g><g class="dim">${dims}</g>${title}</g>`;
}

/* Bohrungstabelle: Bohrungen einer Ansicht mit Kennung (Buchstabe je Größe, Nummer je Bohrung),
   X/Y ab dem gewählten Nullpunkt und Größe; Kennungen an den Bohrungen, Nullpunkt markiert */
export function holeRows(v, o, taps) {
  const seen = new Set(), holes = [];
  (v.marks || []).forEach(m => {
    if (m.k !== 'circle' || !m.internal || m.full === false) return;
    const key = [m.c[0], m.c[1], m.r].map(q => Math.round(q * 1000)).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const tap = (taps || []).find(t => Math.abs(t.d - m.r * 2) < 0.02 || (t.modeled && Math.abs(t.D - m.r * 2) < 0.5));
    holes.push({ c: m.c, r: m.r, size: tap ? tap.label : `⌀${fmtNum(m.r * 2, 2)}`, x: m.c[0] - o[0], y: m.c[1] - o[1] });
  });
  const sizes = [...new Set(holes.slice().sort((a, b) => a.r - b.r).map(h => h.size))];
  const rows = [];
  sizes.forEach((sz, gi) => {
    const L = gi < 26 ? String.fromCharCode(65 + gi) : `Z${gi - 25}`;
    holes.filter(h => h.size === sz).sort((a, b) => a.x - b.x || a.y - b.y).forEach((h, i) => rows.push({ ...h, id: `${L}${i + 1}` }));
  });
  return rows;
}
function holeTable(t, s, ht, rows) {
  const out = [];
  // Nullpunkt: Kreuz mit Kreis
  const [ox, oy] = t(ht.o[0], ht.o[1]);
  out.push(`<g class="hto"><circle cx="${n(ox)}" cy="${n(oy)}" r="1.5"/><line x1="${n(ox - 3)}" y1="${n(oy)}" x2="${n(ox + 3)}" y2="${n(oy)}"/><line x1="${n(ox)}" y1="${n(oy - 3)}" x2="${n(ox)}" y2="${n(oy + 3)}"/><text x="${n(ox - 1.8)}" y="${n(oy + 4.6)}" text-anchor="end">X0 Y0</text></g>`);
  rows.forEach(h => { const [x, y] = t(h.c[0], h.c[1]), d = h.r * s * 0.72 + 0.6; out.push(`<text class="htag" x="${n(x + d)}" y="${n(y + d + 2.2)}">${h.id}</text>`); });
  const [X, Y] = ht.at, rh = 4.5, cols = [0, 13, 33, 53, 75], w = 75, h = rh * (rows.length + 1);
  for (let i = 0; i <= rows.length + 1; i++) out.push(`<line x1="${n(X)}" y1="${n(Y + i * rh)}" x2="${n(X + w)}" y2="${n(Y + i * rh)}"/>`);
  cols.forEach(c => out.push(`<line x1="${n(X + c)}" y1="${n(Y)}" x2="${n(X + c)}" y2="${n(Y + h)}"/>`));
  ['Kennung', 'X', 'Y', 'Größe'].forEach((tx, k) => out.push(`<text class="bh" x="${n(X + cols[k] + 1.2)}" y="${n(Y + 3.2)}">${tx}</text>`));
  rows.forEach((r, i) => [r.id, fmtNum(r.x, 2), fmtNum(r.y, 2), r.size].forEach((tx, k) => out.push(`<text x="${n(k === 1 || k === 2 ? X + cols[k + 1] - 1.2 : X + cols[k] + 1.2)}" y="${n(Y + rh * (i + 1) + 3.2)}"${k === 1 || k === 2 ? ' text-anchor="end"' : ''}>${esc(tx)}</text>`)));
  return `<g class="btab htab">${out.join('')}<text class="bh" x="${n(X)}" y="${n(Y - 1.2)}" data-htab="${ht.id}">Bohrungstabelle</text></g>`;
}

/* Revisionstabelle (Änderungen) oben rechts im Rahmen: Änderung, Beschreibung, Datum, Name; neueste unten */
export const REV_ROW = 4.5;
function revTable(xr, y, revs) {
  const cols = [0, 12, 78, 100, 130], w = 130, x = xr - w, rh = REV_ROW, h = rh * (revs.length + 1), out = [];
  for (let i = 0; i <= revs.length + 1; i++) out.push(`<line x1="${n(x)}" y1="${n(y + i * rh)}" x2="${n(x + w)}" y2="${n(y + i * rh)}"/>`);
  cols.forEach(c => out.push(`<line x1="${n(x + c)}" y1="${n(y)}" x2="${n(x + c)}" y2="${n(y + h)}"/>`));
  ['Änd.', 'Beschreibung', 'Datum', 'Name'].forEach((t, k) => out.push(`<text class="bh" x="${n(x + cols[k] + 1.2)}" y="${n(y + 3.2)}">${t}</text>`));
  revs.forEach((r, i) => [r.rev, r.desc, r.date, r.author].forEach((t, k) => out.push(`<text x="${n(x + cols[k] + 1.2)}" y="${n(y + rh * (i + 1) + 3.2)}">${esc(t || '')}</text>`)));
  return `<g class="btab rtab" data-rev="1"><rect x="${n(x)}" y="${n(y)}" width="${w}" height="${n(h)}" style="fill:rgba(0,0,0,0);stroke:none"/>${out.join('')}</g>`;
}

/* Biegetabelle: Nr, Winkel, Richtung, Innenradius */
function bendTable(x, yBottom, bends) {
  if (!bends || !bends.length) return '';
  const rows = bends.map((b, i) => { const m = /^([\d.,]+)°\s*([↑↓])?\s*R([\d.,]+)/.exec(b.label || '') || []; return [String(i + 1), m[1] ? `${m[1]}°` : '', m[2] === '↓' ? 'nach unten' : 'nach oben', m[3] ? `R ${m[3]}` : '']; });
  const rh = 4.5, cols = [0, 9, 25, 47, 62], w = 62, h = rh * (rows.length + 1), y = yBottom - h;
  const out = [];
  for (let i = 0; i <= rows.length + 1; i++) out.push(`<line x1="${x}" y1="${n(y + i * rh)}" x2="${x + w}" y2="${n(y + i * rh)}"/>`);
  cols.forEach(c => out.push(`<line x1="${x + c}" y1="${n(y)}" x2="${x + c}" y2="${n(y + h)}"/>`));
  ['Nr.', 'Winkel', 'Richtung', 'Radius'].forEach((t, k) => out.push(`<text class="bh" x="${n(x + cols[k] + 1.2)}" y="${n(y + 3.2)}">${t}</text>`));
  rows.forEach((r, i) => r.forEach((t, k) => out.push(`<text x="${n(x + cols[k] + 1.2)}" y="${n(y + rh * (i + 1) + 3.2)}">${esc(t)}</text>`)));
  return `<g class="btab">${out.join('')}<text class="bh" x="${x}" y="${n(y - 1.2)}">Biegetabelle</text></g>`;
}

/* Ganzes Blatt als SVG-Zeichenkette */
export function renderSheet(data, opts) {
  const [W, H] = SHEETS[opts.format] || SHEETS.A4;
  // freie Felder: je drei als zusätzliche Zeile (8 mm) über dem Schriftfeld; alles darüber (Stückliste) rückt mit
  const tbx = ((opts.info && opts.info.extra) || []).filter(e => e && (e.label || e.value)).slice(0, 9);
  // eigene Vorlage: Größe aus der Vorlage (freie Felder stehen dann als Platzhalter in ihr)
  const cust = opts.info && opts.info.template === 'custom' && opts.info.custom;
  const fl = 20, fo = 10, tbw = cust ? Math.min(cust.w, W - fl - fo) : Math.min(180, W - fl - fo), tbh = cust ? cust.h * Math.min(1, (W - fl - fo) / cust.w) : 32 + Math.ceil(tbx.length / 3) * 8;
  const inner = { x: fl, y: fo, w: W - fl - fo, h: H - 2 * fo };
  const noStd = !!opts.noStd;
  const bomH = !noStd && opts.bom && data.bom && data.bom.length ? 5 * (data.bom.length + 1) : 0;
  const revs = opts.revs || [], revH = revs.length ? REV_ROW * (revs.length + 1) : 0;
  const area = { x: inner.x + 8, y: inner.y + 8 + revH, w: inner.w - 16, h: inner.h - tbh - bomH - 16 - revH };
  const allViews = data.views || {};
  let views = noStd ? {} : allViews;
  const gap = 24;
  // Blechteil: Abwicklung statt Iso-Ansicht rechts unten (im Zeichnungsmaßstab, notfalls halb so groß)
  const flat = !noStd && opts.flat !== false && data.flat ? data.flat : null;
  if (flat) views = { ...views, iso: { bb: flat.bb } };
  const o = { iso: (opts.iso || !!flat) && !!views.iso, isoFactor: flat ? 1 : 0.8, dims: opts.dims };
  let s = noStd ? (opts.sheetScale || 1) : opts.scale === 'auto' || !opts.scale ? fitScale(views, area, gap, o) : Number(opts.scale);
  if (!noStd && (opts.scale === 'auto' || !opts.scale) && o.iso) {
    // lieber die Iso-Ansicht kleiner als alle Ansichten einen Normmaßstab kleiner
    const s2 = fitScale(views, area, gap, { ...o, isoFactor: flat ? 0.5 : 0.45 });
    if (s2 > s) { s = s2; o.isoFactor = flat ? 0.5 : 0.45; }
  }
  const L = layoutSize(views, s, gap, o);
  const ox = area.x + Math.max(0, (area.w - L.w) / 2) + (opts.dims ? 12 : 0);
  const oy = area.y + Math.max(0, (area.h - L.h) / 2) + (opts.dims ? 12 : 0);
  const parts = [];
  // Vom Benutzer verschobene Ansichten: Vorderansicht nimmt Drauf- und Seitenansicht mit,
  // die Draufsicht bewegt sich nur senkrecht, die Seitenansicht nur waagerecht, die Iso-Ansicht frei
  const off = opts.offsets || {};
  const go = k => off[k] || [0, 0];
  const [fx, fy] = go('front'), ty = go('top')[1], lx = go('left')[0], [ix, iy] = go('iso');
  const OX = ox + fx, OY = oy + fy;
  const rects = {};
  const vsz = (v, sc) => (v && v.bb ? [(v.bb[1][0] - v.bb[0][0]) * sc, (v.bb[1][1] - v.bb[0][1]) * sc] : [0, 0]);
  // Vorderansicht, darunter Draufsicht, rechts Seitenansicht von links, Iso rechts unten
  const places = { front: { px: OX, py: OY, s } };
  parts.push(hatchView(views.front, s, OX, OY), placeView(views.front, s, OX, OY, opts, '', 'front'), breakoutLines(views.front, s, OX, OY), centerMarks(views.front, s, OX, OY, opts));
  if (views.front && views.front.bb) rects.front = [OX, OY, ...vsz(views.front, s)];
  // Ausrichtung nach Norm: Draufsicht x-gleich, Seitenansicht höhengleich zur Vorderansicht
  const F0 = views.front && views.front.bb;
  const topX = views.top && views.top.bb && F0 ? OX + (views.top.bb[0][0] - F0[0][0]) * s : OX;
  const sideY = views.left && views.left.bb && F0 ? OY + (F0[1][1] - views.left.bb[1][1]) * s : OY;
  if (views.top) {
    const tY = OY + L.fh + gap + ty;
    places.top = { px: topX, py: tY, s };
    parts.push(hatchView(views.top, s, topX, tY), placeView(views.top, s, topX, tY, opts, '', 'top'), breakoutLines(views.top, s, topX, tY), centerMarks(views.top, s, topX, tY, opts));
    rects.top = [topX, tY, ...vsz(views.top, s)];
  }
  let sx = OX + L.fw + gap + lx;
  if (views.left) {
    places.left = { px: sx, py: sideY, s };
    parts.push(hatchView(views.left, s, sx, sideY), placeView(views.left, s, sx, sideY, opts, '', 'left'), breakoutLines(views.left, s, sx, sideY), centerMarks(views.left, s, sx, sideY, opts));
    rects.left = [sx, sideY, ...vsz(views.left, s)];
    if (views.left.cut != null) {
      parts.push(cutLine(views.front, s, OX, OY, views.left.cut, 'A'));
      parts.push(`<text class="vtitle" x="${n(sx + L.lw / 2)}" y="${n(sideY - (opts.dims ? 16 : 4))}" text-anchor="middle">Schnitt A–A</text>`);
    }
  }
  const isoX = ox + L.fw + gap + ix, isoY = oy + L.fh + gap + iy;
  if (flat) { parts.push(flatView(flat, s * o.isoFactor, isoX, isoY, o.isoFactor)); parts.push(bendTable(inner.x + 4, inner.y + inner.h - 4, flat.bends)); rects.iso = [isoX, isoY, ...vsz(views.iso, s * o.isoFactor)]; }
  else if (o.iso) {
    parts.push(placeView(views.iso, s * o.isoFactor, isoX, isoY, { ...opts, hidden: false }, 'iso'));
    if (opts.bom && data.bom) parts.push(balloons(views.iso, s * o.isoFactor, isoX, isoY, data.bom));
    if (opts.welds && opts.welds.length && !opts.weldStd) parts.push(weldSymbols(views.iso, s * o.isoFactor, isoX, isoY, opts.welds, inner.x + inner.w));
    rects.iso = [isoX, isoY, ...vsz(views.iso, s * o.isoFactor)];
  }
  if (!noStd && opts.weldStd && opts.welds && opts.welds.length) parts.push(weldSymbolsStd(views, places, opts.welds, inner));
  if (!noStd && opts.bom && data.bom && data.bom.length) parts.push(bomTable(inner.x + inner.w - tbw, inner.y + inner.h - tbh, tbw, data.bom));
  // Gesamtmaße
  if (!noStd && opts.dims && data.bbox) {
    const size = [0, 1, 2].map(k => data.bbox[1][k] - data.bbox[0][k]);
    const dims = [];
    dims.push(dimLine(OX, OY, OX + L.fw, OY, -1, 8, fmtNum(size[0])));
    dims.push(dimLine(OX, OY, OX, OY + L.fh, -1, 8, fmtNum(size[2])));
    if (views.left) dims.push(dimLine(sx, sideY, sx + L.lw, sideY, -1, 8, fmtNum(size[1])));
    parts.push(`<g class="dim">${dims.join('')}</g>`);
  }
  const vmap = { ...views }, viewOf = {};
  // Frei eingefügte Ansichten (Basisansicht einfügen): eigene Lage und eigener Maßstab
  const VNAMES = { front: 'Vorderansicht', back: 'Rückansicht', top: 'Draufsicht', bottom: 'Untersicht', left: 'Seitenansicht von links', right: 'Seitenansicht von rechts', iso: 'Isometrie', iso2: 'Isometrie von hinten', isoP: 'Perspektive (Fluchtpunkt)' };
  (opts.extraViews || []).forEach(ev => {
    const v = allViews[ev.view];
    if (!v || !v.bb) return;
    const sc = ev.scale || s, isoLike = ev.view.startsWith('iso');
    if (!isoLike) parts.push(hatchView(v, sc, ev.x, ev.y));
    parts.push(placeView(v, sc, ev.x, ev.y, isoLike ? { ...opts, hidden: false } : opts, isoLike ? 'iso' : '', ev.view));
    if (!isoLike) parts.push(breakoutLines(v, sc, ev.x, ev.y), centerMarks(v, sc, ev.x, ev.y, opts));
    const [w, h] = vsz(v, sc);
    parts.push(`<text class="vtitle" x="${n(ev.x + w / 2)}" y="${n(ev.y + h + 6)}" text-anchor="middle">${esc(ev.sec ? (ev.sec.aux ? `Ansicht ${ev.sec.label}` : `Schnitt ${ev.sec.label}–${ev.sec.label}`) : VNAMES[ev.view] || ev.view)}${Math.abs(sc - s) > 1e-9 ? ` (${scaleLabel(sc)})` : ''}</text>`);
    rects['x:' + ev.id] = [ev.x, ev.y, w, h];
    // für Maße, Fangpunkte und Einzelheiten wie eine Normansicht ansprechbar
    vmap['x:' + ev.id] = v; places['x:' + ev.id] = { px: ev.x, py: ev.y, s: sc }; viewOf['x:' + ev.id] = ev.view;
  });
  const labels = [];
  if (o.iso && !flat) labels.push(`<text class="vlabel" x="${n(isoX)}" y="${n(isoY - 3)}">Isometrie (verkleinert)</text>`);
  // Benutzermaße und Fangpunkte
  const T = k => vmap[k] && vmap[k].bb && places[k] ? viewToSheet(vmap[k], places[k].s, places[k].px, places[k].py) : null;
  const ud = (opts.userDims || []).map(dm => { const t = T(dm.view); return t ? userDim(t, dm, fmtNum) : ''; }).join('');
  if (ud) parts.push(`<g class="dim udim">${ud}</g>`);
  // freie Schnittlinien in ihrer Ausgangsansicht (auch für Schnittansichten auf anderen Blättern)
  const sl = (opts.secLines || []).map(sp => { const t = T(sp.parent); return t ? secLine(t, sp) : ''; }).join('');
  if (sl) parts.push(sl);
  if (opts.secDraft && opts.secDraft.b && T(opts.secDraft.parent)) parts.push(`<g class="draft">${secLine(T(opts.secDraft.parent), opts.secDraft, true)}</g>`);
  // freie Texte (ohne Ansicht) stehen in Blattkoordinaten
  const nts = (opts.notes || []).map(nt => { const t = nt.view ? T(nt.view) : (x, y) => [x, y]; return t && nt.at ? noteSvg(t, nt) : ''; }).join('');
  if (nts) parts.push(`<g class="notes">${nts}</g>`);
  // Einzelheiten (Detailansichten): Kreis in der Ansicht, vergrößerter Ausschnitt an frei gewählter Stelle
  const det = [];
  (opts.details || []).forEach((d, i) => {
    const v = vmap[d.view], pl = places[d.view];
    if (!v || !v.bb || !pl) return;
    const t = T(d.view), [cx, cy] = t(d.c[0], d.c[1]), S = d.S || pl.s * (d.k || 2), R = d.r * S;
    const [X, Y] = d.at;
    const sw = w => n(w / S);
    det.push(`<g class="dsrc"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(d.r * pl.s)}"/><text x="${n(cx + d.r * pl.s * 0.75 + 1)}" y="${n(cy - d.r * pl.s * 0.75 - 1)}" data-det="${d.id}">${esc(d.label)}</text></g>`);
    det.push(`<clipPath id="dclip${i}"><circle cx="${n(X)}" cy="${n(Y)}" r="${n(R)}"/></clipPath>`);
    const hid = hiddenGroup(v, opts, sw);
    det.push(`<g clip-path="url(#dclip${i})"><g class="view" transform="translate(${n(X - d.c[0] * S)} ${n(Y + d.c[1] * S)}) scale(${n(S)})">${hid}<g class="vis" stroke-width="${sw(0.5)}">${v.vis.map(q => `<path d="${q}"/>`).join('')}</g></g></g>`);
    det.push(`<circle class="dring" cx="${n(X)}" cy="${n(Y)}" r="${n(R)}"/><text class="vtitle" x="${n(X)}" y="${n(Y + R + 6)}" text-anchor="middle" data-det="${d.id}">${esc(d.label)} (${scaleLabel(S)})</text>`);
  });
  if (det.length) parts.push(`<g class="details">${det.join('')}</g>`);
  (opts.holeTables || []).forEach(ht => { const v = vmap[ht.view], t = T(ht.view); if (v && t) parts.push(holeTable(t, places[ht.view].s, ht, holeRows(v, ht.o, opts.taps))); });
  const snaps = [], circles = [], lines = [];
  ['front', 'top', 'left', ...Object.keys(viewOf).filter(k => !viewOf[k].startsWith('iso'))].forEach(k => {
    const t = T(k);
    if (!t) return;
    // Kreise (Bohrungen, ganze Kreise) und Bögen für Durchmesser-/Radiusmaße
    const cseen = new Map(), sc = places[k].s;
    const addC = (c, r, full, arc) => { const key = [c[0], c[1], r].map(q => Math.round(q * 1000) || 0).join(','); const o = cseen.get(key); if (o) { o.full = o.full || full; if (!o.arc && arc) o.arc = arc; return; } const [x, y] = t(c[0], c[1]); const e = { view: k, c, r, full, x, y, rs: r * sc, ...(arc ? { arc } : {}) }; cseen.set(key, e); circles.push(e); };
    (vmap[k].marks || []).forEach(m => { if (m.k === 'circle') addC(m.c, m.r, m.full !== false); });
    vmap[k].vis.forEach(d => { const arcs = pathArcs(d); arcs.forEach(a => addC(a.c, a.r, false, { s: a.s, e: a.e, sweep: a.sweep })); });
    vmap[k].vis.forEach(d => pathSegments(d).forEach(([a, b]) => { const p = t(a[0], a[1]), q = t(b[0], b[1]); lines.push({ view: k, a, b, x1: p[0], y1: p[1], x2: q[0], y2: q[1] }); }));
    const seen = new Set();
    const add = (u, v) => { const key = `${u.toFixed(4)},${v.toFixed(4)}`; if (seen.has(key)) return; seen.add(key); const [x, y] = t(u, v); snaps.push({ view: k, u, v, x, y }); };
    vmap[k].vis.forEach(d => pathPoints(d).forEach(([u, v]) => add(u, v)));
    (vmap[k].marks || []).forEach(m => { if (m.k === 'circle') add(m.c[0], m.c[1]); });
  });
  if (opts.draft) {
    const ln = (opts.draft.lines || []).map(l => { const t = T(l.view); if (!t) return ''; const p = t(l.a[0], l.a[1]), q = t(l.b[0], l.b[1]); return `<line x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(q[0])}" y2="${n(q[1])}" stroke="#2563eb" stroke-width="0.6"/>`; }).join('');
    const mk = ln + (opts.draft.pts || []).map(p => { const t = T(p.view); if (!t) return ''; const [x, y] = t(p.u, p.v); return `<circle cx="${n(x)}" cy="${n(y)}" r="1.1" fill="none" stroke="#2563eb" stroke-width="0.35"/>`; }).join('');
    const pv = opts.draft.preview && T(opts.draft.preview.view) ? userDim(T(opts.draft.preview.view), opts.draft.preview, fmtNum) : '';
    parts.push(`<g class="draft">${mk}<g class="dim udim pv">${pv}</g></g>`);
  }
  // Punkte der Basislinien-/Ketten-/Koordinatenbemaßung, die schon gewählt sind
  if (opts.draftPts && opts.draftPts.length) parts.push(`<g class="draft">${opts.draftPts.map((p, i) => { const t = T(p.view); if (!t) return ''; const [x, y] = t(p.u, p.v); return `<circle cx="${n(x)}" cy="${n(y)}" r="${i ? 1.1 : 1.6}" fill="none" stroke="#2563eb" stroke-width="0.35"/>`; }).join('')}</g>`);
  const info = { ...opts.info, scale: scaleLabel(s), format: opts.format, sheetLabel: opts.sheetLabel, ...(!opts.info || !opts.info.revSet ? { rev: revs.length ? revs[revs.length - 1].rev : (opts.info && opts.info.rev) || '' } : {}) };
  if (revs.length) parts.push(revTable(inner.x + inner.w, inner.y, revs));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="'IBM Plex Sans', Arial, sans-serif">
<style>
  .frame { fill: none; stroke: #000; stroke-width: 0.7; }
  .view path { fill: none; stroke: #000; stroke-linecap: round; stroke-linejoin: round; }
  .hid path { stroke: #333; }
  .dim line { stroke: #000; stroke-width: 0.25; }
  .dim .arr { fill: #000; stroke: none; }
  .dim text { font-size: 3.5px; fill: #000; }
  .tb rect, .tb line { fill: none; stroke: #000; stroke-width: 0.35; }
  .tb { cursor: pointer; }
  .tb > rect { fill: rgba(0,0,0,0); }
  .tb .lbl { font-size: 2px; fill: #444; }
  .tb .val { font-size: 3px; fill: #000; }
  .tb .big { font-size: 5px; fill: #000; font-weight: 600; }
  .sym path, .sym circle { fill: none; stroke: #000; stroke-width: 0.35; }
  .sym .cl { stroke: #000; stroke-width: 0.18; stroke-dasharray: 2 0.6 0.4 0.6; }
  .vlabel { font-size: 2.5px; fill: #555; }
  .cl line { stroke: #000; stroke-width: 0.18; stroke-dasharray: 6 1 0.6 1; }
  .cl .thr { fill: none; stroke: #000; stroke-width: 0.25; }
  .hto circle, .hto line { fill: none; stroke: #000; stroke-width: 0.25; }
  .hto text, .htag { font-size: 2.2px; fill: #000; }
  .htab [data-htab], .rtab { cursor: pointer; }
  .tol { font-size: 2.1px; }
  .btab text { font-size: 2.4px; } .btab line { stroke: #000; stroke-width: 0.25; } .btab .bh { font-weight: 600; }
  .bnum circle { fill: #fff; stroke: #000; stroke-width: 0.2; } .bnum text { font-size: 2.2px; }
  .flatv .fo { fill: none; stroke: #000; stroke-width: 0.5; }
  .flatv .fb line { stroke: #000; stroke-width: 0.25; stroke-dasharray: 6 1 0.6 1; }
  .flatv .fb text { font-size: 2.2px; fill: #000; }
  .hl line { stroke: #000; stroke-width: 0.18; }
  .hl text, .bal text { font-size: 3px; fill: #000; }
  .notes line, .notes path, .notes rect, .notes circle { fill: none; stroke: #000; stroke-width: 0.25; }
  .notes .arr { fill: #000; } .notes .note { cursor: pointer; } .notes .glyph path, .notes .glyph circle { stroke-width: 0.3; }
  .notes text { font-size: 3px; fill: #000; stroke: none; } .notes .big { font-size: 3.6px; font-weight: 600; }
  .notes .hit { fill: transparent; stroke: none; } .notes .dxfi { fill: none; stroke: #000; stroke-width: 0.35; vector-effect: non-scaling-stroke; } .notes .ins { cursor: move; }
  .brk path { fill: none; stroke: #000; stroke-width: 0.25; cursor: pointer; pointer-events: stroke; }
  .brk .bpick { stroke: transparent; stroke-width: 2; }
  .cut .cutmid { stroke: #000; stroke-width: 0.18; stroke-dasharray: 6 1 0.6 1; }
  .cut .cutend { stroke: #000; stroke-width: 0.7; }
  .cut .cutarr { fill: #000; stroke: #000; stroke-width: 0.35; }
  .cut .cutlbl { font-size: 4px; font-weight: 600; }
  .vtitle { font-size: 4px; font-weight: 600; }
  .bom line { stroke: #000; stroke-width: 0.25; }
  .bom text { font-size: 2.6px; fill: #000; }
  .bom .bh { font-weight: 600; }
  .bal line, .bal circle { stroke: #000; stroke-width: 0.25; fill: #fff; }
  .bal .dot { fill: #000; }
  .weld line, .weld path, .weld circle { stroke: #000; stroke-width: 0.25; fill: none; }
  .weld .arr { fill: #000; }
  .weld text { font-size: 3px; fill: #000; }
  .udim text { cursor: pointer; }
  .dsrc circle { fill: none; stroke: #000; stroke-width: 0.25; } .dsrc text { font-size: 4px; font-weight: 600; cursor: pointer; }
  .dring { fill: none; stroke: #000; stroke-width: 0.25; } .details .vtitle { cursor: pointer; }
  .pv line, .pv path { stroke: #2563eb; fill: #2563eb; }
  .pv text { fill: #2563eb; }
</style>
<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><rect width="3" height="3" fill="#fff"/><line x1="0" y1="0" x2="0" y2="3" stroke="#000" stroke-width="0.25"/></pattern></defs>
<rect width="${W}" height="${H}" fill="#fff"/>
<rect class="frame" x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}"/>
${parts.join('\n')}
${labels.join('')}
${titleBlock(inner.x + inner.w - tbw, inner.y + inner.h - tbh, tbw, tbh, info)}
</svg>`;
  // Bögen, die zusammen einen ganzen Kreis bilden, gelten als Kreis (Durchmesser statt Radius)
  return { svg, scale: s, W, H, places, snaps, circles, lines, rects, viewOf };
}
