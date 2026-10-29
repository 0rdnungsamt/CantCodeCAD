// cantcodecad – Teilenamen und Farben aus einer STEP-Datei lesen (ohne XCAF: der eingebaute OpenCASCADE-Leser liefert nur die
// Geometrie). Für jeden Festkörper (MANIFOLD_SOLID_BREP) der Name seines Produkts und ein lageunabhängiger
// Fingerabdruck (Zahl der Flächen und Eckpunkte, mittlerer und größter Abstand der Eckpunkte von ihrem Schwerpunkt).
// Der Kern vergleicht ihn mit den gelesenen Körpern – so passt der Name auch für Teile, die in einer Baugruppe
// verschoben, gedreht oder mehrfach eingebaut sind.

/* \X2\00FC\X0\ (UTF-16 hex) und \X\FC (ISO 8859-1) wie in STEP vorgesehen; '' ist ein einfaches Hochkomma */
function stepText(s) {
  return s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, h) => h.match(/.{4}/g).map(x => String.fromCharCode(parseInt(x, 16))).join(''))
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128));
}

/* Argumentliste in Bausteine: Zeichenketten, Verweise (#n als Zahl), Listen, sonstige Werte als Text */
function argsOf(s) {
  let i = 0;
  const liste = () => {
    const out = [];
    i++; // (
    while (i < s.length) {
      const c = s[i];
      if (c === ')') { i++; return out; }
      if (c === ',' || c === ' ' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '(') { out.push(liste()); continue; }
      if (c === "'") {
        let j = i + 1, t = '';
        for (;;) { const k = s.indexOf("'", j); if (k < 0) { t += s.slice(j); j = s.length; break; } if (s[k + 1] === "'") { t += s.slice(j, k + 1); j = k + 2; } else { t += s.slice(j, k); j = k + 1; break; } }
        out.push({ s: stepText(t) }); i = j; continue;
      }
      if (c === '#') { let j = i + 1; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++; out.push(Number(s.slice(i + 1, j))); i = j; continue; }
      let j = i; while (j < s.length && s[j] !== ',' && s[j] !== ')') j++;
      const w = s.slice(i, j).trim();
      // getypter Wert wie LENGTH_MEASURE(1.) – Klammer mitnehmen
      if (s[j] === '(' ) { out.push(w); i = j; continue; }
      out.push(w); i = j;
    }
    return out;
  };
  return liste();
}

const TOPO = new Set(['CLOSED_SHELL', 'OPEN_SHELL', 'ORIENTED_CLOSED_SHELL', 'ADVANCED_FACE', 'FACE_SURFACE', 'FACE_OUTER_BOUND', 'FACE_BOUND', 'EDGE_LOOP', 'ORIENTED_EDGE', 'EDGE_CURVE', 'VERTEX_POINT', 'VERTEX_LOOP', 'BREP_WITH_VOIDS', 'MANIFOLD_SOLID_BREP']);
const FACES = new Set(['ADVANCED_FACE', 'FACE_SURFACE']);

/* Fingerabdruck aus Eckpunkten (gleiche Koordinaten zählen einmal) und Flächenzahl */
export function fingerabdruck(pts, flaechen) {
  const key = p => p.map(v => Math.round(v * 1e4)).join(',');
  const uniq = [...new Map(pts.map(p => [key(p), p])).values()];
  const n = uniq.length || 1, c = [0, 1, 2].map(k => uniq.reduce((s, p) => s + p[k], 0) / n);
  const r = uniq.map(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
  return { f: flaechen, v: uniq.length, rm: r.reduce((s, x) => s + x, 0) / n, rx: r.reduce((s, x) => Math.max(s, x), 0) };
}

/* Abweichung zweier Fingerabdrücke: 0 = gleich; Flächen und Eckpunkte zählen stark, Abstände relativ */
export function abstandFP(a, b) {
  const rel = (x, y) => Math.abs(x - y) / Math.max(1e-6, Math.abs(x), Math.abs(y));
  return Math.abs(a.f - b.f) * 10 + Math.abs(a.v - b.v) + rel(a.rm, b.rm) * 200 + rel(a.rx, b.rx) * 200;
}

/* Vordefinierte Farben (DRAUGHTING_PRE_DEFINED_COLOUR) */
const VORDEF = { red: '#ff0000', green: '#00ff00', blue: '#0000ff', yellow: '#ffff00', magenta: '#ff00ff', cyan: '#00ffff', black: '#000000', white: '#ffffff' };
const hex = v => Math.max(0, Math.min(255, Math.round(Number(v) * 255))).toString(16).padStart(2, '0');

/* Liste [{ name, fp, color? }] je Festkörper der Datei; leer, wenn nichts zu finden ist. color = '#rrggbb' aus
   STYLED_ITEM am Festkörper, sonst die häufigste Flächenfarbe. */
export function stepNamen(text) {
  const daten = text.indexOf('DATA;');
  if (daten < 0) return [];
  const E = new Map();
  // Datensätze „#n=TYP(...);“ – Semikolons in Zeichenketten überspringen
  let i = daten + 5;
  const L = text.length;
  while (i < L) {
    const h = text.indexOf('#', i);
    if (h < 0) break;
    const eq = text.indexOf('=', h);
    if (eq < 0) break;
    const id = Number(text.slice(h + 1, eq));
    let j = eq + 1, inStr = false;
    for (; j < L; j++) { const c = text[j]; if (c === "'") inStr = !inStr; else if (c === ';' && !inStr) break; }
    const rec = text.slice(eq + 1, j).trim();
    i = j + 1;
    if (!Number.isFinite(id)) continue;
    if (rec[0] === '(') {
      // zusammengesetzter Datensatz: nur der Name des ersten Teils zählt (für Beziehungen mit Lage → nicht verbinden)
      E.set(id, { t: 'COMPLEX', raw: rec });
      continue;
    }
    const p = rec.indexOf('(');
    if (p < 0) continue;
    E.set(id, { t: rec.slice(0, p).trim().toUpperCase(), raw: rec.slice(p) });
  }
  const args = id => { const e = E.get(id); if (!e) return []; if (!e.a) e.a = argsOf(e.raw); return e.a; };
  const typ = id => (E.get(id) || {}).t;
  // Längeneinheit: OpenCASCADE rechnet in mm
  let scale = 1;
  if (/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\.\s*\)/.test(text) && !/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text)) scale = 1000;
  else if (/SI_UNIT\s*\(\s*\.CENTI\.\s*,\s*\.METRE\.\s*\)/.test(text)) scale = 10;
  else if (/CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(text)) scale = 25.4;
  // Darstellungen, die über einfache SHAPE_REPRESENTATION_RELATIONSHIP zusammengehören (ohne Lage = dasselbe Teil)
  const up = new Map(), find = x => { while (up.has(x) && up.get(x) !== x) x = up.get(x); return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) up.set(ra, rb); };
  const produktDer = new Map(); // Darstellung → Produktname
  const brepIn = new Map(); // Festkörper → Darstellung
  for (const [id, e] of E) {
    if (e.t === 'SHAPE_REPRESENTATION_RELATIONSHIP') { const a = args(id); if (typeof a[2] === 'number' && typeof a[3] === 'number') union(a[2], a[3]); }
    else if (/_REPRESENTATION$/.test(e.t) && e.t !== 'SHAPE_DEFINITION_REPRESENTATION') {
      const a = args(id), items = Array.isArray(a[1]) ? a[1] : [];
      items.forEach(it => { if (typeof it === 'number' && (typ(it) === 'MANIFOLD_SOLID_BREP' || typ(it) === 'BREP_WITH_VOIDS')) brepIn.set(it, id); });
    }
  }
  const produktName = pd => {
    const pdf = args(pd)[2], pr = typeof pdf === 'number' ? args(pdf)[2] : null;
    if (typeof pr !== 'number') return '';
    const a = args(pr), n = (a[1] && a[1].s) || (a[0] && a[0].s) || '';
    return n.trim();
  };
  for (const [id, e] of E) {
    if (e.t !== 'SHAPE_DEFINITION_REPRESENTATION') continue;
    const [pds, rep] = args(id);
    if (typeof pds !== 'number' || typeof rep !== 'number') continue;
    const pd = args(pds)[2];
    if (typeof pd !== 'number' || !/^PRODUCT_DEFINITION$/.test(typ(pd) || '')) continue;
    const n = produktName(pd);
    if (n) produktDer.set(rep, n);
  }
  // Farben: STYLED_ITEM(name, (Stile), Element) – in den Stilen bis zur Farbe suchen
  const farbeVon = new Map();
  const farbeIn = start => {
    const seen = new Set(), stack = [start];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x) || seen.size > 60) continue;
      seen.add(x);
      const t = typ(x), a = args(x);
      if (t === 'COLOUR_RGB' && a.length >= 4) return `#${hex(a[1])}${hex(a[2])}${hex(a[3])}`;
      if (t === 'DRAUGHTING_PRE_DEFINED_COLOUR' && a[0] && VORDEF[String(a[0].s).toLowerCase()]) return VORDEF[String(a[0].s).toLowerCase()];
      const walk = v => { if (typeof v === 'number') stack.push(v); else if (Array.isArray(v)) v.forEach(walk); };
      walk(a);
    }
    return null;
  };
  for (const [id, e] of E) {
    if (e.t !== 'STYLED_ITEM' && e.t !== 'OVER_RIDING_STYLED_ITEM') continue;
    const a = args(id), item = a[2];
    if (typeof item !== 'number' || farbeVon.has(item)) continue;
    const c = farbeIn(Array.isArray(a[1]) ? a[1].find(v => typeof v === 'number') : null);
    if (c) farbeVon.set(item, c);
  }
  const nameZuRep = new Map();
  for (const [rep, n] of produktDer) nameZuRep.set(find(rep), n);
  // je Produkt seine Festkörper (mehrere → „Teil: Körpername“)
  // je Produkt (Darstellungswurzel, nicht Name – verschiedene Teile heißen oft gleich)
  const proProdukt = new Map();
  for (const [brep, rep] of brepIn) {
    const w = find(rep), n = nameZuRep.get(w) || produktDer.get(rep) || '';
    if (!proProdukt.has(w)) proProdukt.set(w, { n, breps: [] });
    proProdukt.get(w).breps.push(brep);
  }
  const out = [];
  for (const { n, breps } of proProdukt.values()) {
    breps.forEach((b, k) => {
      const bn = ((args(b)[0] || {}).s || '').trim();
      const name = breps.length > 1 ? `${n || 'Teil'}: ${bn || `Körper ${k + 1}`}` : n || bn;
      // Platzhalter der Schreibprogramme (OpenCASCADE schreibt seinen eigenen Namen) sind keine Teilenamen
      if (!name || /^Open CASCADE/i.test(name)) return;
      // Eckpunkte und Flächen über die Topologie einsammeln (nicht in Kurven/Flächen-Geometrie hinein)
      const seen = new Set([b]), stack = [b], pts = [], fFarben = new Map();
      let flaechen = 0;
      while (stack.length) {
        const x = stack.pop(), t = typ(x);
        if (FACES.has(t)) { flaechen++; const c = farbeVon.get(x); if (c) fFarben.set(c, (fFarben.get(c) || 0) + 1); }
        if (t === 'VERTEX_POINT') {
          const cp = args(x)[1], c = typeof cp === 'number' ? args(cp)[1] : null;
          if (Array.isArray(c) && c.length === 3) pts.push(c.map(v => Number(v) * scale));
          continue;
        }
        const walk = v => { if (typeof v === 'number') { if (!seen.has(v) && TOPO.has(typ(v))) { seen.add(v); stack.push(v); } } else if (Array.isArray(v)) v.forEach(walk); };
        walk(args(x));
      }
      const color = farbeVon.get(b) || [...fFarben].sort((p, q) => q[1] - p[1]).map(x => x[0])[0] || null;
      // teil = Produkt (Komponente), k/nb = welcher Festkörper des Produkts – für die Komponenten der Baugruppe
      if (pts.length) out.push({ name, teil: n || name, k, nb: breps.length, fp: fingerabdruck(pts, flaechen), ...(color ? { color } : {}) });
    });
  }
  // Festkörper je Produktdefinition (nicht je Name: verschiedene Teile heißen oft gleich, z. B. „Komponente4“)
  const jeWurzel = new Map(), pdWurzel = new Map();
  for (const [, rep] of brepIn) { const w = find(rep); jeWurzel.set(w, (jeWurzel.get(w) || 0) + 1); }
  for (const [id, e] of E) {
    if (e.t !== 'SHAPE_DEFINITION_REPRESENTATION') continue;
    const [pds, rep] = args(id), pd = typeof pds === 'number' ? args(pds)[2] : null;
    if (typeof pd === 'number' && typeof rep === 'number' && typ(pd) === 'PRODUCT_DEFINITION') pdWurzel.set(pd, find(rep));
  }
  out.blaetter = baum(E, args, typ, produktName, pd => jeWurzel.get(pdWurzel.get(pd)) || 0, einbauLage(E, args, typ, find, pdWurzel, scale));
  return out;
}

/* Lagen: { R: 3 × 3 zeilenweise, t } – Punkt p im Teil liegt bei R·p + t. */
const EINS = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
export const lageMal = (P, Q) => ({ R: [0, 1, 2].flatMap(r => [0, 1, 2].map(c => P.R[3 * r] * Q.R[c] + P.R[3 * r + 1] * Q.R[3 + c] + P.R[3 * r + 2] * Q.R[6 + c])), t: [0, 1, 2].map(r => P.R[3 * r] * Q.t[0] + P.R[3 * r + 1] * Q.t[1] + P.R[3 * r + 2] * Q.t[2] + P.t[r]) });
export const lageInv = P => { const R = [P.R[0], P.R[3], P.R[6], P.R[1], P.R[4], P.R[7], P.R[2], P.R[5], P.R[8]]; return { R, t: [0, 1, 2].map(r => -(R[3 * r] * P.t[0] + R[3 * r + 1] * P.t[1] + R[3 * r + 2] * P.t[2])) }; };
export const lageAuf = (P, p) => [0, 1, 2].map(r => P.R[3 * r] * p[0] + P.R[3 * r + 1] * p[1] + P.R[3 * r + 2] * p[2] + P.t[r]);

/* Einbaulage je NEXT_ASSEMBLY_USAGE_OCCURRENCE: CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(Beziehung, PDS des Einbaus) mit
   REPRESENTATION_RELATIONSHIP(…, rep_1, rep_2) und ITEM_DEFINED_TRANSFORMATION(…, item_1, item_2): die Platzierung im
   Teil wird auf die in der Baugruppe gelegt. Welche Darstellung das Teil ist, steht in der Datei nicht fest (beide
   Reihenfolgen kommen vor) – entschieden wird über die Darstellung des eingebauten Teils. Ergebnis: (Einbau, Teil-PD)
   → Lage Teil → Baugruppe, oder null. */
function einbauLage(E, args, typ, find, pdWurzel, scale) {
  const platz = id => {
    if (typ(id) !== 'AXIS2_PLACEMENT_3D') return null;
    const a = args(id), num = v => Number(v);
    const p = typeof a[1] === 'number' ? (args(a[1])[1] || []).map(v => num(v) * scale) : [0, 0, 0];
    const dir = (ref, d) => { const v = typeof ref === 'number' ? (args(ref)[1] || []).map(num) : d; const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
    const z = dir(a[2], [0, 0, 1]), x0 = dir(a[3], [1, 0, 0]);
    const xs = x0.map((v, i) => v - z[i] * (x0[0] * z[0] + x0[1] * z[1] + x0[2] * z[2])), lx = Math.hypot(...xs) || 1, x = xs.map(v => v / lx);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return { R: [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], t: p };
  };
  const proEinbau = new Map();
  for (const [id, e] of E) {
    if (e.t !== 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION') continue;
    const [rr, pds] = args(id), nauo = typeof pds === 'number' ? args(pds)[2] : null;
    if (typeof rr !== 'number' || typeof nauo !== 'number') continue;
    const raw = (E.get(rr) || {}).raw || '';
    const NAME = "(?:'(?:[^']|'')*'|\\$)"; // Name und Beschreibung als Text oder $ (bei manchen Exportern)
    const rel = new RegExp(`REPRESENTATION_RELATIONSHIP\\s*\\(\\s*${NAME}\\s*,\\s*${NAME}\\s*,\\s*#(\\d+)\\s*,\\s*#(\\d+)\\s*\\)`).exec(raw), tr = /REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\s*\(\s*#(\d+)\s*\)/.exec(raw);
    if (!rel || !tr || typ(Number(tr[1])) !== 'ITEM_DEFINED_TRANSFORMATION') continue;
    const it = args(Number(tr[1])), A1 = platz(it[2]), A2 = platz(it[3]);
    if (A1 && A2) proEinbau.set(nauo, { rep1: Number(rel[1]), A1, A2 });
  }
  return (nauo, pdTeil) => {
    const x = proEinbau.get(nauo);
    if (!x) return null;
    const teilIst1 = find(x.rep1) === pdWurzel.get(pdTeil);
    return teilIst1 ? lageMal(x.A2, lageInv(x.A1)) : lageMal(x.A1, lageInv(x.A2));
  };
}

/* Baugruppenbaum (NEXT_ASSEMBLY_USAGE_OCCURRENCE: übergeordnete → eingebaute Produktdefinition), in Dateireihenfolge
   der Tiefe nach durchlaufen – so überträgt OpenCASCADE auch die Festkörper. Ergebnis: je Einbau eines Teils mit
   Festkörpern { teil, nb, pfad: [{ name, key }], pd, lage }, pfad = die Unterbaugruppen darüber (ohne die oberste), key
   unterscheidet zwei Einbauten derselben Unterbaugruppe, pd = Produktdefinition (gleiches pd = gleiches Teil), lage =
   Lage des Teils in der Datei (aus allen Einbaulagen darüber) oder null, wenn eine fehlt. */
function baum(E, args, typ, produktName, festkoerper, lageVon) {
  const kinder = new Map(), eingebaut = new Set();
  for (const [id, e] of E) {
    if (e.t !== 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') continue;
    const a = args(id), oben = a[3], unten = a[4];
    if (typeof oben !== 'number' || typeof unten !== 'number') continue;
    if (!kinder.has(oben)) kinder.set(oben, []);
    kinder.get(oben).push({ id, pd: unten });
    eingebaut.add(unten);
  }
  const wurzeln = [];
  for (const [id, e] of E) if (e.t === 'PRODUCT_DEFINITION' && !eingebaut.has(id)) wurzeln.push(id);
  const blaetter = [];
  const lauf = (pd, pfad, tiefe, lage) => {
    if (tiefe > 40) return;
    const n = produktName(pd), nb = festkoerper(pd);
    if (nb) blaetter.push({ teil: n, nb, pfad, pd, lage });
    for (const k of kinder.get(pd) || []) {
      const unter = kinder.has(k.pd), T = lage && lageVon ? lageVon(k.id, k.pd) : null;
      lauf(k.pd, unter ? [...pfad, { name: produktName(k.pd) || 'Baugruppe', key: `${pfad.length ? pfad[pfad.length - 1].key : ''}/${k.id}` }] : pfad, tiefe + 1, T ? lageMal(lage, T) : null);
    }
  };
  wurzeln.forEach(pd => lauf(pd, [], 0, EINS));
  return blaetter;
}
