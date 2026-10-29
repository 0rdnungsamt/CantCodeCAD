/* Gemeinsamer DXF-Schreiber (R12 / AC1009, von praktisch allen CAD-, Laser- und Nesting-Programmen lesbar).
   Einstellbar statt auf ein Programm zugeschnitten: Einheit, Bögen oder Linien, Konturen als Polylinie,
   Layernamen und -farben je Rolle (Außenkontur, Innenkontur, Biegelinie, Hilfslinie, Beschriftung). */

export const DXF_DEFAULTS = {
  units: 'mm',          // 'mm' | 'in'
  curves: 'arcs',       // 'arcs' (ARC/CIRCLE bzw. Bulge) | 'lines' (in Strecken aufgelöst)
  tol: 0.01,            // Sehnenabweichung beim Auflösen in mm
  contour: 'entities',  // 'entities' (LINE/ARC/CIRCLE) | 'polyline' (geschlossene POLYLINE je Kontur)
  bends: true,          // Biegelinien ausgeben
  labels: false,        // Biegebeschriftung (Winkel, Richtung, Radius) ausgeben
  layers: { contour: 'KONTUR', inner: 'KONTUR', bend: 'BIEGUNG', aux: 'HILFE', label: 'BESCHRIFTUNG', mark: 'GRAVUR' },
  colors: { contour: 7, inner: 7, bend: 1, aux: 8, label: 3, mark: 5 }
};
export const DXF_ROLES = [['contour', 'Außenkontur'], ['inner', 'Innenkonturen'], ['bend', 'Biegelinien'], ['aux', 'Hilfslinien'], ['label', 'Beschriftung'], ['mark', 'Teilebeschriftung (Gravur)']];

export function dxfOptions(o) {
  const d = DXF_DEFAULTS, x = o || {};
  return { ...d, ...x, layers: { ...d.layers, ...(x.layers || {}) }, colors: { ...d.colors, ...(x.colors || {}) } };
}
const cleanLayer = s => String(s || '0').replace(/[<>/\\":;?*|=,`]/g, '_').trim().slice(0, 64) || '0';

/* Kreisbogen als Punktfolge mit höchstens tol Sehnenabweichung */
function arcPts(c, r, a0, a1, tol) {
  while (a1 <= a0) a1 += 2 * Math.PI;
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(r, 1e-9))));
  const n = Math.max(2, Math.ceil((a1 - a0) / Math.max(step, 1e-3)));
  const P = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; P.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return P;
}

export function createDxf(opts) {
  const O = dxfOptions(opts), k = O.units === 'in' ? 1 / 25.4 : 1;
  const L = role => cleanLayer(O.layers[role] || O.layers.contour);
  const out = [];
  const g = (...kv) => { for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1])); };
  const n = v => (Math.abs(v * k) < 5e-9 ? 0 : +(v * k).toFixed(6)).toString();
  const used = new Set();
  const lay = role => { const l = L(role); used.add(role); return l; };
  const W = {
    line(a, b, role = 'contour') { if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return; g(0, 'LINE', 8, lay(role), 10, n(a[0]), 20, n(a[1]), 30, 0, 11, n(b[0]), 21, n(b[1]), 31, 0); },
    poly(P, closed, role = 'contour', bulges = null) {
      if (P.length < 2) return;
      g(0, 'POLYLINE', 8, lay(role), 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 1 : 0);
      P.forEach((p, i) => { g(0, 'VERTEX', 8, L(role), 10, n(p[0]), 20, n(p[1]), 30, 0); if (bulges && bulges[i]) g(42, +bulges[i].toFixed(9)); });
      g(0, 'SEQEND', 8, L(role));
    },
    // Bogen gegen den Uhrzeigersinn von a0 nach a1 (Radiant)
    arc(c, r, a0, a1, role = 'contour') {
      if (O.curves === 'lines') { W.poly(arcPts(c, r, a0, a1, O.tol), false, role); return; }
      g(0, 'ARC', 8, lay(role), 10, n(c[0]), 20, n(c[1]), 30, 0, 40, n(r), 50, +(a0 * 180 / Math.PI).toFixed(9), 51, +(a1 * 180 / Math.PI).toFixed(9));
    },
    circle(c, r, role = 'contour') {
      if (O.curves === 'lines') { const P = arcPts(c, r, 0, 2 * Math.PI, O.tol); P.pop(); W.poly(P, true, role); return; }
      g(0, 'CIRCLE', 8, lay(role), 10, n(c[0]), 20, n(c[1]), 30, 0, 40, n(r));
    },
    text(p, h, s, role = 'label', rot = 0) {
      if (!O.labels && role === 'label') return;
      g(0, 'TEXT', 8, lay(role), 10, n(p[0]), 20, n(p[1]), 30, 0, 40, n(h), 1, String(s).replace(/°/g, '%%d').replace(/[⌀Øø]/g, '%%c').replace(/[^\x20-\x7e%]/g, '?'));
      if (rot) g(50, +rot.toFixed(6));
    },
    /* Kontur aus Kanten { type: 'line'|'arc', a, b, mid?, c?, r?, a0?, a1?, ccw? } – als Polylinie (Bögen per Bulge)
       oder als Einzelteile. arc: Mittelpunkt c, Radius r, Startwinkel a0, Endwinkel a1 in Laufrichtung (ccw = gegen den Uhrzeigersinn). */
    loop(edges, role = 'contour') {
      if (O.contour !== 'polyline') {
        edges.forEach(e => { if (e.type === 'arc') { if (e.ccw) W.arc(e.c, e.r, e.a0, e.a1, role); else W.arc(e.c, e.r, e.a1, e.a0, role); } else W.line(e.a, e.b, role); });
        return;
      }
      const P = [], B = [];
      edges.forEach(e => {
        if (e.type === 'arc' && O.curves === 'lines') {
          const pts = e.ccw ? arcPts(e.c, e.r, e.a0, e.a1, O.tol) : arcPts(e.c, e.r, e.a1, e.a0, O.tol).reverse();
          pts.slice(0, -1).forEach(q => { P.push(q); B.push(0); });
        } else if (e.type === 'arc') {
          let sweep = e.ccw ? e.a1 - e.a0 : e.a0 - e.a1;
          while (sweep <= 0) sweep += 2 * Math.PI;
          P.push(e.a); B.push((e.ccw ? 1 : -1) * Math.tan(sweep / 4));
        } else { P.push(e.a); B.push(0); }
      });
      W.poly(P, true, role, B);
    },
    toString() {
      const head = [];
      const h = (...kv) => { for (let i = 0; i < kv.length; i += 2) head.push(String(kv[i]), String(kv[i + 1])); };
      h(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, O.units === 'in' ? 1 : 4, 9, '$MEASUREMENT', 70, O.units === 'in' ? 0 : 1, 0, 'ENDSEC');
      h(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
      const names = new Map();
      [...used].forEach(role => { const l = L(role); if (!names.has(l)) names.set(l, O.colors[role] ?? 7); });
      h(0, 'TABLE', 2, 'LAYER', 70, names.size + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
      names.forEach((col, l) => h(0, 'LAYER', 2, l, 70, 0, 62, Math.max(1, Math.min(255, Math.round(Number(col) || 7))), 6, 'CONTINUOUS'));
      h(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
      return [...head, ...out, '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
    }
  };
  return W;
}
