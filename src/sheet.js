// cantcodecad – Blech: Abwicklung (gestreckte Länge über K-Faktor) und DXF-Ausgabe.
// Die Abwicklung wird aus den Features berechnet: Grundlasche (Skizzenprofil), Laschen an Kanten der Grundlasche,
// Bohrungen und Ausschnitte, deren Skizze parallel zur Grundlasche liegt.
import { sketchRegions, selectRegions, pointInRegion } from './sketch/profiles.js';
import { holePoints, migrateSketch, curveSamples, pointMap } from './sketch/model.js';
import { toLocal, toWorld } from './doc.js';
import { createDxf, dxfOptions } from './dxfwriter.js';

const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const DEFAULT_RULE = { t: 2, r: 2, k: 0.44 };
/* Mitgelieferte Blechregeln. Faustwerte fürs Abkanten:
   Stahl R ≈ t, K 0,44 · Aluminium R ≈ 1,5 t, K 0,43 · Edelstahl R ≈ 2 t, K 0,45 */
export const RULE_LIBRARY = [
  ...[1, 1.5, 2, 3, 4, 5, 6].map(t => ({ name: `Stahl ${String(t).replace('.', ',')} mm`, t, r: t, k: 0.44 })),
  ...[1, 1.5, 2, 3, 4, 5].map(t => ({ name: `Aluminium ${String(t).replace('.', ',')} mm`, t, r: 1.5 * t, k: 0.43 })),
  ...[1, 1.5, 2, 3, 4].map(t => ({ name: `Edelstahl ${String(t).replace('.', ',')} mm`, t, r: 2 * t, k: 0.45 }))
];

/* Geometrie einer Lasche bzw. eines Saums – gemeinsam für Kern, Dialogzeile und Abwicklung ohne Kerndaten.
   Rückgabe: th = Biegewinkel (rad), L = gerader Schenkel, rh = Innenradius der Biegung.
   Bis ≈175° ist height das Außenmaß senkrecht zur Blechfläche: H = (r+t)(1−cos θ) + L·sin θ.
   Ab ≈175° ist es ein Saum, Art nach hemKind:
   - 'open' (Vorgabe): 180°, height = Saumlänge, hemGap = Spalt → Innenradius Spalt/2 (ohne Angabe der Biegeradius)
   - 'rolled' (gerollt): Innenradius hemR, Winkel hemAngle (180…350°), kein gerader Schenkel
   - 'teardrop' (Tropfen): Innenradius hemR, Länge height, Spalt hemGap – der Winkel θ > 180° folgt daraus, dass das
     Schenkelende den Spalt zur Fläche hat: r − r·cos θ + L·sin θ = Spalt (Innenkante des Schenkels)
   - 'double' (Doppelsaum): zweimal 180° mit demselben Spalt hemGap (Innenradius Spalt/2), erster Schenkel height,
     zweiter Schenkel height − hemSetback. L ist dann die gestreckte Länge hinter der ersten Biegung
     (L1 + zweite Biegezugabe + L2), double hält die Einzelmaße für Kern und Abwicklung. */
export function hemGeometry(rule, { angle, height, hemGap, hemKind, hemR, hemAngle, hemSetback } = {}) {
  const { t, r } = rule, th0 = (Number(angle) || 90) * Math.PI / 180, H = Number(height);
  const given = v => v != null && v !== '' && Number(v) >= 0;
  if (!(th0 > Math.PI * 175 / 180)) return { hem: false, th: th0, L: (H - (r + t) * (1 - Math.cos(th0))) / Math.sin(th0), rh: r };
  const kind = hemKind === 'rolled' || hemKind === 'teardrop' || hemKind === 'double' ? hemKind : 'open';
  if (kind === 'double') {
    const rh = given(hemGap) ? Math.max(0, Number(hemGap)) / 2 : r, L1 = H, L2 = H - (Number(hemSetback) || 0);
    const BA2 = Math.PI * (rh + (Number(rule.k) >= 0 ? Number(rule.k) : 0.44) * t);
    if (!(L1 > 0.01)) return { hem: true, kind, th: Math.PI, L: 0, rh, error: 'Saumlänge muss größer als 0 sein' };
    if (!(L2 > 0.01) || L2 > L1 + 1e-9) return { hem: true, kind, th: Math.PI, L: L1, rh, error: 'Rücksprung zwischen 0 und Saumlänge wählen' };
    return { hem: true, kind, th: Math.PI, L: L1 + BA2 + L2, rh, double: { L1, L2, BA2 } };
  }
  if (kind === 'rolled') {
    const deg = Math.max(180, Math.min(350, Number(hemAngle) || 270));
    return { hem: true, kind, th: deg * Math.PI / 180, L: 0, rh: given(hemR) ? Number(hemR) : r };
  }
  if (kind === 'teardrop') {
    const rh = given(hemR) ? Number(hemR) : r, g = given(hemGap) ? Number(hemGap) : 0;
    const y = th => rh - rh * Math.cos(th) + H * Math.sin(th);   // Höhe des Schenkelendes über der Fläche
    if (!(H > 0.01)) return { hem: true, kind, th: Math.PI, L: H, rh, error: 'Saumlänge muss größer als 0 sein' };
    if (g >= y(Math.PI)) return { hem: true, kind, th: Math.PI, L: H, rh, error: `Spalt zu groß – höchstens ${+y(Math.PI).toFixed(2)} mm (2 × Radius)` };
    if (g < y(1.5 * Math.PI)) return { hem: true, kind, th: 1.5 * Math.PI, L: H, rh, error: `Spalt zu klein – mindestens ${+Math.max(0, y(1.5 * Math.PI)).toFixed(2)} mm (Radius − Länge)` };
    let a = Math.PI, b = 1.5 * Math.PI;
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (y(m) > g) a = m; else b = m; }
    return { hem: true, kind, th: (a + b) / 2, L: H, rh };
  }
  return { hem: true, kind, th: th0, L: H, rh: given(hemGap) ? Math.max(0, Number(hemGap)) / 2 : r };
}
/* Biegezugabe und gerade Schenkellänge einer Lasche (Höhe = Außenmaß), Saum-Arten siehe hemGeometry */
export function flangeFlat(rule, height, angleDeg, gap = null, opts = {}) {
  const g = hemGeometry(rule, { angle: angleDeg, height, hemGap: gap, ...opts });
  const BA = g.th * (g.rh + rule.k * rule.t);
  return { L: g.L, BA, flat: g.L + BA, r: g.rh, th: g.th, error: g.error };
}

/* Schleife (Profil-Kanten) in Ebene a → Ebene b umrechnen */
function mapLoop(loop, from, to) {
  const m = p => toLocal(to, toWorld(from, p[0], p[1]));
  if (loop.circle) return { circle: { c: m(loop.circle.c), r: loop.circle.r } };
  return { edges: loop.edges.map(e => ({ type: e.type, a: m(e.a), b: m(e.b), mid: e.mid ? m(e.mid) : null })) };
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit2 = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const lerp2 = (a, v, k) => [a[0] + v[0] * k, a[1] + v[1] * k];

/* Abwicklung. meta (vom Kern): Grundlasche und je Lasche Kante/Biegeseite/Schenkel; ohne meta nur Laschen an der Grundlasche. */
export function computeFlat(doc, rule, meta) {
  rule = { ...DEFAULT_RULE, ...(rule || {}) };
  // In Blech umwandeln: der Kern hat die Abwicklung schon aus der Körperform berechnet
  if (meta && meta.unfold && (meta.unfold.fromBend || doc.features.some(f => ['sm_convert', 'sm_refold', 'sm_loft', 'sm_corner', 'sm_join'].includes(f.type) && !f.suppressed))) return meta.unfold;
  // Ellipsen/Splines (Punktzüge) als Linienstücke weiterreichen
  const flat = lp => (lp.circle ? lp : { ...lp, edges: lp.edges.flatMap(e => (e.type === 'spl' ? e.pts.slice(1).map((q, i) => ({ type: 'line', a: e.pts[i], b: q })) : [e])) });
  const fs = doc.features;
  const base = fs.find(f => f.type === 'sm_base' && !f.suppressed);
  // eigene Blechregel der Grundlasche (STEP-Blechteil als Features): Dicke und Radius des Teils
  if (base && base.regel) rule = { ...rule, ...(Number(base.regel.t) > 0 ? { t: Number(base.regel.t) } : {}), ...(Number(base.regel.r) >= 0 ? { r: Number(base.regel.r) } : {}) };
  const C = !base && meta && meta.contour;
  if (!base && !C) throw new Error('Keine Grundlasche oder Konturlasche (Blech) im Teil');
  const t = rule.t;
  let outer, holes, segs, region = null, pl = null;
  const strips = [], bends = [];
  if (C) {
    // Konturlasche: Rechteck Breite × abgewickelte Länge, gerade Stücke als Segmente
    pl = C.plane;
    const W = C.W;
    outer = { edges: [[0, 0], [W, 0], [W, C.total], [0, C.total]].map((a, i, q) => ({ type: 'line', a, b: q[(i + 1) % 4], mid: null })) };
    holes = [];
    const wOf = q => dot3(sub3(q, pl.o), pl.n) - C.w0;
    segs = C.straights.map(st => ({
      kind: 'contour',
      map: q => [wOf(q), st.Y + dot3(sub3(q, st.S), st.d)],
      contains: q => { const a = dot3(sub3(q, st.S), st.d), h = dot3(sub3(q, st.S), st.s), w = wOf(q); return a > -1e-3 && a < st.l + 1e-3 && h > -1e-3 && h < C.t + 1e-3 && w > -1e-3 && w < W + 1e-3; }
    }));
    C.bends.forEach(b => bends.push({ a: [0, b.Y0 + b.BA / 2], b: [W, b.Y0 + b.BA / 2], label: `${b.angle}° ${b.up ? '↑' : '↓'} R${C.r}` }));
  } else {
    const sk = fs.find(f => f.id === base.sketch);
    if (!sk) throw new Error('Skizze der Grundlasche fehlt');
    pl = (meta && meta.base && meta.base.plane) || sk.plane;
    const regions = selectRegions(sketchRegions(migrateSketch(JSON.parse(JSON.stringify(sk)))).regions, base.profiles);
    if (!regions.length) throw new Error('Die Grundlasche hat kein Profil');
    region = { ...regions[0], outer: flat(regions[0].outer), holes: regions[0].holes.map(flat) };
    outer = region.outer.circle ? { circle: region.outer.circle } : { edges: region.outer.edges.map(e => ({ type: e.type, a: e.a, b: e.b, mid: e.mid || null })) };
    holes = region.holes.map(h => (h.circle ? { circle: h.circle } : { edges: h.edges.map(e => ({ type: e.type, a: e.a, b: e.b, mid: e.mid || null })) }));
    // Segmente: Abbildung 3D → Abwicklung und Test, ob ein Punkt auf dem Segment liegt
    const inBase2 = q2 => [[0, 0], [0.02, 0], [-0.02, 0], [0, 0.02], [0, -0.02]].some(o => pointInRegion(region, [q2[0] + o[0], q2[1] + o[1]]));
    segs = [{
      kind: 'base',
      map: q => toLocal(pl, q),
      contains: q => Math.abs(dot3(sub3(q, pl.o), pl.n)) <= t + 1e-3 && inBase2(toLocal(pl, q))
    }];
  }
  const flanges = meta && meta.flanges ? meta.flanges : null;
  if (flanges) {
    flanges.forEach(F => {
      const mid = add3(F.edgeStart, mul3(F.d, F.L0 / 2));
      const parent = segs.slice().reverse().find(S => S.contains(mid));
      if (!parent) return;
      const A = parent.map(F.edgeStart), B = parent.map(add3(F.edgeStart, mul3(F.d, F.L0)));
      const dv = unit2([B[0] - A[0], B[1] - A[1]]);
      const oo = parent.map(add3(F.edgeStart, F.o)), ov = unit2([oo[0] - A[0], oo[1] - A[1]]);
      const BA = F.th * (F.r + rule.k * F.t), flat = BA + F.L;
      const P0 = lerp2(A, ov, BA), nLeg = cross3(F.d, F.legDir);
      segs.push({
        kind: 'flange',
        map: q => { const w = dot3(sub3(q, F.legStart), F.d), sL = dot3(sub3(q, F.legStart), F.legDir); return [P0[0] + dv[0] * w + ov[0] * sL, P0[1] + dv[1] * w + ov[1] * sL]; },
        contains: q => { const w = dot3(sub3(q, F.O), F.d), sL = dot3(sub3(q, F.legStart), F.legDir), h = dot3(sub3(q, F.legStart), nLeg); return w > -1e-3 && w < F.L0 + 1e-3 && sL > -1e-3 && sL < F.L + 1e-3 && Math.abs(h) <= F.t + 1e-3; }
      });
      /* Doppelsaum: die zweite Lage liegt um 2r + t weiter auf der Biegeseite (n) über der ersten und läuft zurück
         (sL von L1 bis L1 − L2); in der Abwicklung folgt sie hinter der zweiten Biegezone: BA + L1 + BA2 + (L1 − sL) */
      const xb = (F.extraBends || [])[0];
      if (xb && F.n) {
        const L1 = xb.at, BA2 = xb.BA, L2 = F.L - L1 - BA2, h0 = 2 * F.r + F.t;
        segs.push({
          kind: 'flange2',
          map: q => { const w = dot3(sub3(q, F.legStart), F.d), sL = dot3(sub3(q, F.legStart), F.legDir), s2 = L1 + BA2 + (L1 - sL); return [P0[0] + dv[0] * w + ov[0] * s2, P0[1] + dv[1] * w + ov[1] * s2]; },
          contains: q => { const w = dot3(sub3(q, F.O), F.d), sL = dot3(sub3(q, F.legStart), F.legDir), h = dot3(sub3(q, F.legStart), F.n); return w > -1e-3 && w < F.L0 + 1e-3 && sL > L1 - L2 - 1e-3 && sL < L1 + 1e-3 && h > h0 - 1e-3 && h < h0 + F.t + 1e-3; }
        });
      }
      const far = k => lerp2(k, ov, flat);
      // geschlossene Ecke: Schenkel ab der Biegezone um extS/extE verlängert
      const eS = F.extS || 0, eE = F.extE || 0, Ab = lerp2(A, ov, BA), Bb = lerp2(B, ov, BA);
      const q = [A, B];
      if (eE > 1e-6) q.push(Bb, lerp2(Bb, dv, eE), lerp2(far(B), dv, eE)); else q.push(far(B));
      if (eS > 1e-6) q.push(lerp2(far(A), dv, -eS), lerp2(Ab, dv, -eS), Ab); else q.push(far(A));
      if (F.relief) q.relief = { ...F.relief, inward: [-ov[0], -ov[1]] };
      strips.push(q);
      bends.push({ a: lerp2(A, ov, BA / 2), b: lerp2(B, ov, BA / 2), label: `${F.angle}° ${F.flip ? '↓' : '↑'} R${F.r}` });
      // weitere Biegungen derselben Lasche (Doppelsaum): Lage = erste Biegezone + Abstand + halbe eigene Zone
      (F.extraBends || []).forEach(xb => { const s2 = BA + xb.at + xb.BA / 2; bends.push({ a: lerp2(A, ov, s2), b: lerp2(B, ov, s2), label: `${xb.angle}° ${xb.flip ? '↓' : '↑'} R${xb.r}` }); });
    });
  } else if (!C) {
    // ohne Kerndaten: Laschen nur an Kanten der Grundlasche
    fs.filter(f => f.type === 'sm_flange' && !f.suppressed).forEach(f => {
      const { BA, flat, r: rEff } = flangeFlat(rule, Number(f.height), Number(f.angle) || 90, f.hemGap, { hemKind: f.hemKind, hemR: f.hemR, hemAngle: f.hemAngle });
      (f.edges || []).forEach(es => {
        const p = toLocal(pl, es.ref.p), dd = [dot3(es.ref.d, pl.x), dot3(es.ref.d, pl.y)];
        const seg = (outer.edges || []).find(e => {
          if (e.type !== 'line') return false;
          const v = [e.b[0] - e.a[0], e.b[1] - e.a[1]], l = Math.hypot(v[0], v[1]);
          return Math.abs(v[0] * (p[1] - e.a[1]) - v[1] * (p[0] - e.a[0])) / l < 1e-3 && Math.abs(Math.abs((v[0] * dd[0] + v[1] * dd[1]) / l) - 1) < 1e-6;
        });
        if (!seg) return;
        const v = unit2([seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]]);
        let nrm = [v[1], -v[0]];
        const mid = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
        if (pointInRegion(region, lerp2(mid, nrm, 0.01))) nrm = [-nrm[0], -nrm[1]];
        strips.push([seg.a, seg.b, lerp2(seg.b, nrm, flat), lerp2(seg.a, nrm, flat)]);
        bends.push({ a: lerp2(seg.a, nrm, BA / 2), b: lerp2(seg.b, nrm, BA / 2), label: `${Number(f.angle) || 90}° ${f.flip ? '↓' : '↑'} R${rEff}` });
      });
    });
  }

  // Biegungen entlang Skizzenlinien (sm_bend) auf der Grundlasche
  if (!C && meta && meta.bendLines) meta.bendLines.forEach(bl => {
    const a = toLocal(pl, bl.a), b = toLocal(pl, bl.b);
    // Linie über die ganze Grundlasche verlängern
    const v = unit2([b[0] - a[0], b[1] - a[1]]), ext = 1e4, pa = lerp2(a, v, -ext), pb = lerp2(a, v, ext);
    bends.push({ a: pa, b: pb, label: `${bl.angle}° ${bl.up ? '↑' : '↓'} R${bl.r}`, clip: true });
  });

  // Bohrungen und Ausschnitte: Segment über einen Punkt bestimmen und abbilden
  const segOf = q => segs.slice().reverse().find(S => S.contains(q));
  /* Schnitte durch mehrere Lagen (Saum, Doppelsaum über der Grundfläche): alle Segmente, die die Schnittlinie durch
     den Profilpunkt entlang der Skizzennormale innerhalb der Ausdehnung trifft. span = [von, bis] entlang der Normale;
     ohne bekannte Ausdehnung (Start versetzt, bis Fläche) bleibt es beim Segment am Profilpunkt. */
  const segsAlong = (q, n, span) => {
    if (!span) { const S = segOf(q); return S ? [S] : []; }
    const lo = Math.max(span[0], -2000), hi = Math.min(span[1], 2000), step = Math.max(0.05, Math.min(0.5, t / 4));
    const hit = new Set();
    for (let s = lo; s <= hi + 1e-9; s += step) { const S = segs.slice().reverse().find(X => X.contains(add3(q, mul3(n, s)))); if (S) hit.add(S); }
    return [...hit];
  };
  const cutSpan = f => {
    if (f.start === 'offset' || f.start === 'object' || f.extent === 'toface') return null;
    if (f.extent === 'all') return f.direction === 'reverse' ? [-1e5, 0] : f.direction === 'symmetric' || f.direction === 'two' ? [-1e5, 1e5] : [0, 1e5];
    const d = Number(f.distance) || 0;
    if (f.direction === 'reverse') return [-d, 0];
    if (f.direction === 'symmetric') return [-d / 2, d / 2];
    if (f.direction === 'two') return [-(Number(f.dist2) || 0), d];
    return [0, d];
  };
  fs.forEach(f => {
    if (f.suppressed) return;
    const fsk = fs.find(x => x.id === f.sketch && x.type === 'sketch');
    if (!fsk || f.type === 'sm_base' || f.type === 'sm_contour') return;
    if (f.type === 'hole') {
      holePoints(migrateSketch(JSON.parse(JSON.stringify(fsk)))).forEach(([u, v]) => {
        const q = toWorld(fsk.plane, u, v), S = segOf(q);
        if (S) holes.push({ circle: { c: S.map(q), r: Number(f.d) / 2 } });
      });
    } else if (f.type === 'extrude' && f.op === 'cut') {
      try {
        selectRegions(sketchRegions(migrateSketch(JSON.parse(JSON.stringify(fsk)))).regions, f.profiles).forEach(r => {
          const lp = flat(r.outer);
          // Profilpunkt etwas innerhalb des Profils (eine Ecke kann genau auf einer Lagenkante liegen)
          const rep = lp.circle ? lp.circle.c : (() => { const P = lp.edges.map(e => e.a), c = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length], [0, 0]); return pointInRegion(r, c) ? c : lp.edges[0].a; })();
          segsAlong(toWorld(fsk.plane, rep[0], rep[1]), fsk.plane.n, cutSpan(f)).forEach(S => {
            const m = p => S.map(toWorld(fsk.plane, p[0], p[1]));
            holes.push(lp.circle ? { circle: { c: m(lp.circle.c), r: lp.circle.r } } : { edges: lp.edges.map(e => ({ type: e.type, a: m(e.a), b: m(e.b), mid: e.mid ? m(e.mid) : null })) });
          });
        });
      } catch (_) { /* Skizze ohne Profil */ }
    }
  });

  // Außenkontur: alle Kanten (Grundlasche + Streifen), gemeinsame Kanten entfallen, dann zu Schleifen verketten
  const contour = [];
  if (outer.circle) contour.push({ circle: outer.circle });
  else {
    let edges = outer.edges.slice();
    // Laschen über einen Teil der Kante: die Grundkante an den Laschenenden teilen
    const onSeg = (e, p) => { const v = [e.b[0] - e.a[0], e.b[1] - e.a[1]], l = Math.hypot(v[0], v[1]); if (l < 1e-9) return -1; const w = [p[0] - e.a[0], p[1] - e.a[1]]; if (Math.abs(v[0] * w[1] - v[1] * w[0]) / l > 1e-4) return -1; const t = (v[0] * w[0] + v[1] * w[1]) / (l * l); return t > -1e-6 && t < 1 + 1e-6 ? t : -1; };
    const cornerHeads = []; // Kanten vom Laschenende zum inneren Eckpunkt (für runde Eckfreischnitte)
    strips.forEach(q => {
      const [A, B] = q;
      const i = edges.findIndex(e => e.type === 'line' && onSeg(e, A) >= 0 && onSeg(e, B) >= 0 && !(d2(e.a, A) < 1e-6 && d2(e.b, B) < 1e-6) && !(d2(e.a, B) < 1e-6 && d2(e.b, A) < 1e-6));
      if (i < 0) return;
      const e = edges[i], aFirst = onSeg(e, A) < onSeg(e, B), [P1, P2] = aFirst ? [A, B] : [B, A];
      // Freischnitt: Kerbe neben dem Laschenende (Breite w, Tiefe dep in die Grundfläche)
      const rl = q.relief, notchAt = (X, other, has) => {
        if (!rl || !has) return { end: X, lines: [] };
        const u = unit2([X[0] - other[0], X[1] - other[1]]), X2 = lerp2(X, u, rl.w);
        const a1 = lerp2(X2, rl.inward, rl.dep), a2 = lerp2(X, rl.inward, rl.dep);
        return { end: X2, lines: [{ type: 'line', a: X2, b: a1 }, { type: 'line', a: a1, b: a2 }, { type: 'line', a: a2, b: X }] };
      };
      const n1 = notchAt(P1, P2, aFirst ? rl && rl.start : rl && rl.end), n2 = notchAt(P2, P1, aFirst ? rl && rl.end : rl && rl.start);
      // Eckfreischnitt: das Stück von der Ecke bis zur Lasche entfällt, nur die Kante ins Blech bleibt (die Nachbarlasche liefert die andere)
      const corner1 = rl && (aFirst ? rl.cornerStart : rl.cornerEnd), corner2 = rl && (aFirst ? rl.cornerEnd : rl.cornerStart);
      const head = corner1 ? [{ type: 'line', a: P1, b: lerp2(P1, rl.inward, rl.dep), inward: rl.inward }] : [{ type: 'line', a: e.a, b: n1.end }, ...n1.lines];
      const tail = corner2 ? [{ type: 'line', a: P2, b: lerp2(P2, rl.inward, rl.dep), inward: rl.inward }] : [...n2.lines, { type: 'line', a: n2.end, b: e.b }];
      if (corner1) cornerHeads.push(head[0]);
      if (corner2) cornerHeads.push(tail[0]);
      const parts = [...head, ...tail, { type: 'line', a: P1, b: P2 }].filter(g => d2(g.a, g.b) > 1e-6);
      edges.splice(i, 1, ...parts);
    });
    // runder Eckfreischnitt (Blechregel): innere Ecke des Freischnitts durch einen 270°-Bogen um den Eckpunkt ersetzen
    if (rule.cornerRelief === 'round') {
      const used = new Set();
      cornerHeads.forEach((h1, i) => {
        if (used.has(i)) return;
        const j = cornerHeads.findIndex((h2, k) => k !== i && !used.has(k) && d2(h2.b, h1.b) < 1e-6);
        if (j < 0) return;
        used.add(i); used.add(j);
        const h2 = cornerHeads[j], K = h1.b, gap = d2(h1.a, K);
        const rho = Math.min((Number(rule.cornerReliefD) || 2 * rule.t) / 2, 0.95 * gap);
        const e1 = lerp2(K, h1.inward, -rho), e2 = lerp2(K, h2.inward, -rho), m = unit2([h1.inward[0] + h2.inward[0], h1.inward[1] + h2.inward[1]]);
        h1.b = e1; h2.b = e2;
        edges.push({ type: 'arc', a: e1, b: e2, mid: lerp2(K, m, rho) });
      });
    }
    strips.forEach(q => { for (let i = 0; i < q.length; i++) edges.push({ type: 'line', a: q[i], b: q[(i + 1) % q.length] }); });
    const same = (e, g) => e.type === 'line' && g.type === 'line' && ((d2(e.a, g.b) < 1e-6 && d2(e.b, g.a) < 1e-6) || (d2(e.a, g.a) < 1e-6 && d2(e.b, g.b) < 1e-6));
    const drop = new Set();
    edges.forEach((e, i) => { if (drop.has(i)) return; edges.forEach((g, j) => { if (j > i && !drop.has(j) && same(e, g)) { drop.add(i); drop.add(j); } }); });
    edges = edges.filter((_, i) => !drop.has(i));
    // teilweise überdeckte Kanten (Lasche schmaler als Kante gibt es noch nicht) bleiben stehen
    contour.push(...chainLoops(edges));
  }
  // verlängerte Biegelinien auf die Außenkontur kürzen
  bends.forEach(bn => {
    if (!bn.clip) return;
    const a = bn.a, v = [bn.b[0] - a[0], bn.b[1] - a[1]];
    const ts = [];
    contour.forEach(lp => (lp.edges || []).forEach(e => {
      const w = [e.b[0] - e.a[0], e.b[1] - e.a[1]], den = v[0] * w[1] - v[1] * w[0];
      if (Math.abs(den) < 1e-12) return;
      const q = [e.a[0] - a[0], e.a[1] - a[1]], tt = (q[0] * w[1] - q[1] * w[0]) / den, ss = (q[0] * v[1] - q[1] * v[0]) / den;
      if (ss > -1e-9 && ss < 1 + 1e-9) ts.push(tt);
    }));
    if (ts.length >= 2) { const t0 = Math.min(...ts), t1 = Math.max(...ts); bn.a = [a[0] + v[0] * t0, a[1] + v[1] * t0]; bn.b = [a[0] + v[0] * t1, a[1] + v[1] * t1]; }
    delete bn.clip;
  });
  const pts = [];
  const addLoop = lp => { if (lp.circle) pts.push([lp.circle.c[0] - lp.circle.r, lp.circle.c[1] - lp.circle.r], [lp.circle.c[0] + lp.circle.r, lp.circle.c[1] + lp.circle.r]); else lp.edges.forEach(e => { pts.push(e.a, e.b); if (e.mid) pts.push(e.mid); }); };
  contour.forEach(addLoop);
  const bb = [[Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))], [Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]];
  return { contour, holes, bends, bb, rule, flanges: strips.length };
}

/* Lose Kanten zu geschlossenen Schleifen verketten (Richtung wird bei Bedarf umgedreht) */
function chainLoops(edges) {
  const left = edges.slice(), loops = [];
  const rev = e => ({ ...e, a: e.b, b: e.a });
  while (left.length) {
    const loop = [left.shift()];
    let guard = 0;
    while (guard++ < 10000) {
      const end = loop[loop.length - 1].b;
      if (d2(end, loop[0].a) < 1e-6) break;
      const i = left.findIndex(e => d2(e.a, end) < 1e-6 || d2(e.b, end) < 1e-6);
      if (i < 0) break;
      const e = left.splice(i, 1)[0];
      loop.push(d2(e.a, end) < 1e-6 ? e : rev(e));
    }
    loops.push({ edges: loop });
  }
  return loops;
}

/* Kreisbogen durch drei Punkte → Mittelpunkt, Radius, Winkel (gegen den Uhrzeigersinn von a1 nach a2) */
function arc3(a, m, b) {
  const ax = a[0], ay = a[1], bx = m[0], by = m[1], cx = b[0], cy = b[1];
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-12) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  const ang = p => Math.atan2(p[1] - uy, p[0] - ux);
  const norm = x => { while (x < 0) x += Math.PI * 2; while (x >= Math.PI * 2) x -= Math.PI * 2; return x; };
  const t0 = ang(a), tm = norm(ang(m) - t0), t1 = norm(ang(b) - t0);
  const ccw = tm < t1;
  return { c: [ux, uy], r: d2([ux, uy], a), a0: ccw ? ang(a) : ang(b), a1: ccw ? ang(b) : ang(a), ccw };
}

/* SVG-Pfad einer Schleife (y nach unten gedreht) */
function loopPath(lp) {
  const f = v => +v.toFixed(4);
  if (lp.circle) { const { c, r } = lp.circle; return `M${f(c[0] - r)} ${f(-c[1])}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`; }
  let d = '';
  lp.edges.forEach((e, i) => {
    if (i === 0 || d2(e.a, lp.edges[i - 1].b) > 1e-6) d += `M${f(e.a[0])} ${f(-e.a[1])}`;
    if (e.type === 'arc' && e.mid) {
      const A = arc3(e.a, e.mid, e.b);
      if (A) {
        let sweep = A.a1 - A.a0; while (sweep < 0) sweep += Math.PI * 2;
        d += `A${f(A.r)} ${f(A.r)} 0 ${sweep > Math.PI ? 1 : 0} ${A.ccw ? 0 : 1} ${f(e.b[0])} ${f(-e.b[1])}`;
        return;
      }
    }
    d += `L${f(e.b[0])} ${f(-e.b[1])}`;
  });
  return d + 'z';
}

export function flatSVG(flat, info = {}) {
  const pad = 22, [[x0, y0], [x1, y1]] = flat.bb;
  const W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad;
  const vb = `${x0 - pad} ${-y1 - pad} ${W} ${H}`;
  const sw = Math.max(W, H) / 400;
  const f = v => +v.toFixed(3);
  const dims = `<g class="fdim" stroke="#2563eb" fill="#2563eb" stroke-width="${f(sw * 0.6)}" font-size="${f(sw * 9)}">
    <line x1="${f(x0)}" y1="${f(-y1 - pad * 0.45)}" x2="${f(x1)}" y2="${f(-y1 - pad * 0.45)}"/><text x="${f((x0 + x1) / 2)}" y="${f(-y1 - pad * 0.6)}" text-anchor="middle" stroke="none">${(x1 - x0).toFixed(2).replace('.', ',')}</text>
    <line x1="${f(x0 - pad * 0.45)}" y1="${f(-y1)}" x2="${f(x0 - pad * 0.45)}" y2="${f(-y0)}"/><text x="${f(x0 - pad * 0.6)}" y="${f(-(y0 + y1) / 2)}" text-anchor="middle" stroke="none" transform="rotate(-90 ${f(x0 - pad * 0.6)} ${f(-(y0 + y1) / 2)})">${(y1 - y0).toFixed(2).replace('.', ',')}</text></g>`;
  const body = `<path d="${[...flat.contour, ...flat.holes].map(loopPath).join('')}" fill="#dfe6ee" fill-rule="evenodd" stroke="#111" stroke-width="${f(sw)}"/>`;
  const bends = flat.bends.map(b => `<line x1="${f(b.a[0])}" y1="${f(-b.a[1])}" x2="${f(b.b[0])}" y2="${f(-b.b[1])}" stroke="#c2410c" stroke-width="${f(sw * 0.8)}" stroke-dasharray="${f(sw * 6)} ${f(sw * 3)}"/><text x="${f((b.a[0] + b.b[0]) / 2)}" y="${f(-(b.a[1] + b.b[1]) / 2 - sw * 4)}" text-anchor="middle" font-size="${f(sw * 8)}" fill="#c2410c">${b.label}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${f(W)}mm" height="${f(H)}mm" font-family="'IBM Plex Sans', Arial, sans-serif"><title>${info.name || 'Abwicklung'}</title>${body}${bends}${dims}</svg>`;
}

/* DXF R12 (mm): Layer KONTUR (Schneidkontur) und BIEGUNG (Biegelinien) */
/* Abwicklung als DXF; bends: false lässt die Biegelinien weg (nur Schnittkonturen, z. B. fürs Nesting) */
/* Abwicklung als DXF. opts: siehe dxfwriter.js (Einheit, Bögen/Linien, Polylinie, Layer, Biegelinien, Beschriftung).
   Ohne opts: mm, Einzelteile, Layer KONTUR/BIEGUNG – so bekommt auch der Nester seine Daten. */
/* Platz für eine Teilebeschriftung in der Abwicklung: Punkt mit dem größten Abstand zu allen Konturen, der im
   Material liegt (in der Außenkontur, außerhalb der Ausschnitte). Schrifthöhe so, dass das Textfeld (Breite ≈ 0,6 ·
   Höhe je Zeichen) in den freien Kreis passt, höchstens hMax. Ergebnis: Einfügepunkt links unten und Höhe, oder null,
   wenn weniger als 1 mm Schrift Platz hat. */
export function textPlatz(flat, text, hMax = 5) {
  const ringe = [];
  const ring = lp => {
    if (lp.circle) { const P = []; for (let i = 0; i < 48; i++) { const a = i / 48 * 2 * Math.PI; P.push([lp.circle.c[0] + lp.circle.r * Math.cos(a), lp.circle.c[1] + lp.circle.r * Math.sin(a)]); } return P; }
    const P = [];
    lp.edges.forEach(e => {
      if (e.type === 'arc' && e.mid) {
        const A = arc3(e.a, e.mid, e.b);
        if (A) { let a0 = Math.atan2(e.a[1] - A.c[1], e.a[0] - A.c[0]), a1 = Math.atan2(e.b[1] - A.c[1], e.b[0] - A.c[0]); if (A.ccw) { while (a1 <= a0) a1 += 2 * Math.PI; } else { while (a1 >= a0) a1 -= 2 * Math.PI; } for (let i = 0; i < 16; i++) { const a = a0 + (a1 - a0) * i / 16; P.push([A.c[0] + A.r * Math.cos(a), A.c[1] + A.r * Math.sin(a)]); } return; }
      }
      P.push(e.a);
    });
    return P;
  };
  flat.contour.forEach(lp => ringe.push({ P: ring(lp), aussen: true }));
  flat.holes.forEach(lp => ringe.push({ P: ring(lp), aussen: false }));
  const innen = (P, q) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const segAbst = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l)) : 0; return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
  const [[x0, y0], [x1, y1]] = flat.bb, N = 40;
  let best = null;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const q = [x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N];
    if (!ringe.filter(r => r.aussen).some(r => innen(r.P, q)) || ringe.some(r => !r.aussen && innen(r.P, q))) continue;
    let d = Infinity;
    ringe.forEach(r => { for (let k = 0; k < r.P.length; k++) d = Math.min(d, segAbst(q, r.P[k], r.P[(k + 1) % r.P.length])); });
    if (!best || d > best.d) best = { q, d };
  }
  if (!best) return null;
  const L = String(text).length, h = Math.min(hMax, 0.9 * best.d / Math.sqrt(0.09 * L * L + 0.25));
  if (!(h >= 1)) return null;
  return { p: [best.q[0] - 0.3 * h * L, best.q[1] - h / 2], h };
}
export function flatDXF(flat, opts = {}) {
  const W = createDxf(opts), O = dxfOptions(opts);
  const edge = e => {
    if (e.type === 'arc' && e.mid) {
      const A = arc3(e.a, e.mid, e.b);
      if (A) return { type: 'arc', a: e.a, b: e.b, c: A.c, r: A.r, a0: A.ccw ? A.a0 : A.a1, a1: A.ccw ? A.a1 : A.a0, ccw: A.ccw };
    }
    return { type: 'line', a: e.a, b: e.b };
  };
  const loop = (lp, role) => { if (lp.circle) W.circle(lp.circle.c, lp.circle.r, role); else W.loop(lp.edges.map(edge), role); };
  flat.contour.forEach(lp => loop(lp, 'contour'));
  flat.holes.forEach(lp => loop(lp, 'inner'));
  // Teilebeschriftung (z. B. Name, Dicke, Stückzahl) auf eigenem Layer – im Laserprogramm zum Markieren
  if (opts.mark) { const tp = textPlatz(flat, opts.mark); if (tp) W.text(tp.p, tp.h, opts.mark, 'mark'); }
  if (O.bends) flat.bends.forEach(b => {
    W.line(b.a, b.b, 'bend');
    if (b.label) {
      const ang = Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]) * 180 / Math.PI, up = ang > 90 || ang <= -90 ? ang + 180 : ang;
      W.text([(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], 2.5, b.label.replace(/\s*↑\s*/, ' nach oben ').replace(/\s*↓\s*/, ' nach unten ').trim(), 'label', up);
    }
  });
  return W.toString();
}

/* Bearbeitete Abwicklung (Skizze aus „Als Skizze bearbeiten“, f.abwicklung) zurück in die Form einer Abwicklung, damit
   die DXF-Ausgabe wie bei der Abwicklung selbst läuft (Außen-/Innenkontur, Biegelinien, Layer aus den DXF-Einstellungen):
   Kurven ohne Konstruktion zu geschlossenen Zügen verketten; Züge, die in keinem anderen liegen, sind Außenkonturen,
   die übrigen Ausschnitte; Konstruktionslinien sind die Biegelinien (Beschriftung aus f.abwicklung.bends).
   Koordinaten um f.abwicklung.off zurückgeschoben, so dass die DXF in der Lage der ursprünglichen Abwicklung bleibt. */
export function skizzeAlsAbwicklung(sk) {
  const ab = sk.abwicklung || {}, off = ab.off || [0, 0];
  const pm = pointMap({ points: [], ...sk }), P = id => { const q = pm.get(id); return q ? [q.x - off[0], q.y - off[1]] : null; };
  const kanten = [], kreise = [], bends = [];
  (sk.curves || []).forEach(c => {
    if (c.ref) return;
    if (c.cons) {
      if (c.type === 'line') { const a = P(c.p1), b = P(c.p2); if (a && b) bends.push({ a, b, label: (ab.bends || {})[c.id] || '' }); }
      return;
    }
    if (c.type === 'line') { const a = P(c.p1), b = P(c.p2); if (a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) kanten.push({ type: 'line', a, b }); }
    else if (c.type === 'circle') { const m = P(c.c); if (m) kreise.push({ circle: { c: m, r: c.r } }); }
    else if (c.type === 'arc') {
      const m = P(c.c), a = P(c.s), b = P(c.e);
      if (!m || !a || !b) return;
      const w0 = Math.atan2(a[1] - m[1], a[0] - m[0]);
      let w1 = Math.atan2(b[1] - m[1], b[0] - m[0]);
      while (w1 <= w0 + 1e-12) w1 += 2 * Math.PI;
      const wm = (w0 + w1) / 2;
      kanten.push({ type: 'arc', a, b, mid: [m[0] + c.r * Math.cos(wm), m[1] + c.r * Math.sin(wm)] });
    } else if (c.type === 'ellipse' || c.type === 'spline') {
      const S = curveSamples(c, pm, 96).map(q => [q[0] - off[0], q[1] - off[1]]);
      for (let i = 1; i < S.length; i++) kanten.push({ type: 'line', a: S[i - 1], b: S[i] });
    }
  });
  // verketten über die Endpunkte
  const key = p => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`, frei = kanten.slice(), zuege = [], offen = [];
  while (frei.length) {
    const zug = [frei.shift()], start = key(zug[0].a);
    let ende = zug[0].b;
    for (;;) {
      if (key(ende) === start) break;
      const k = frei.findIndex(e => key(e.a) === key(ende) || key(e.b) === key(ende));
      if (k < 0) break;
      let e = frei.splice(k, 1)[0];
      if (key(e.a) !== key(ende)) e = { ...e, a: e.b, b: e.a };
      zug.push(e); ende = e.b;
    }
    (key(ende) === start ? zuege : offen).push({ edges: zug });
  }
  const poly = lp => (lp.circle ? Array.from({ length: 32 }, (_, i) => [lp.circle.c[0] + lp.circle.r * Math.cos(i * Math.PI / 16), lp.circle.c[1] + lp.circle.r * Math.sin(i * Math.PI / 16)]) : lp.edges.flatMap(e => (e.mid ? [e.a, e.mid] : [e.a])));
  const innen = (p, Q) => { let ein = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const a = Q[i], b = Q[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) ein = !ein; } return ein; };
  const alle = [...zuege, ...kreise].map(lp => ({ lp, Q: poly(lp) }));
  const contour = [], holes = [];
  alle.forEach(x => (alle.some(y => y !== x && innen(x.Q[0], y.Q) && !innen(y.Q[0], x.Q)) ? holes : contour).push(x.lp));
  const pts = alle.flatMap(x => x.Q);
  const bb = pts.length ? [[Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))], [Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]] : [[0, 0], [0, 0]];
  return { contour, holes, bends, bb, rule: ab.rule || null, offen: offen.length };
}

/* Skizze als DXF: Linien, Kreise, Bögen; Ellipsen und Splines als Polylinien (R12); Konstruktionslinien als Hilfslinien */
export function sketchDXF(sk, opts = {}) {
  const W = createDxf(opts);
  const pm = pointMap({ points: [], ...sk });
  let count = 0;
  (sk.curves || []).forEach(c => {
    if (c.ref && c.cons) return;
    const role = c.cons ? 'aux' : 'contour';
    if (c.type === 'line') {
      const a = pm.get(c.p1), b = pm.get(c.p2);
      if (!a || !b) return;
      W.line([a.x, a.y], [b.x, b.y], role);
    } else if (c.type === 'circle') {
      const m = pm.get(c.c);
      if (!m) return;
      W.circle([m.x, m.y], c.r, role);
    } else if (c.type === 'arc') {
      const m = pm.get(c.c);
      if (!m) return;
      W.arc([m.x, m.y], c.r, c.a0, c.a1, role);
    } else if (c.type === 'ellipse' || c.type === 'spline') {
      const P = curveSamples(c, pm, 128);
      if (P.length < 2) return;
      const closed = c.type === 'spline' ? !!c.closed : c.u0 == null;
      W.poly(closed && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-9 ? P.slice(0, -1) : P, closed, role);
    } else return;
    if (!c.cons) count++;
  });
  return { dxf: W.toString(), count };
}

