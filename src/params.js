// cantcodecad – Benutzerparameter („Parameter ändern“).
// Ausdrücke wie "breite/2 + 5 mm", "sqrt(a^2 + b^2)" oder "dicke * 2". Winkelfunktionen rechnen in Grad.
//
// Gerechnet wird nicht nur mit Werten, sondern auch mit deren Größe: breite*tiefe ist mm², breite/tiefe ein
// Verhältnis, und „breite + breite*tiefe“ ist ein Fehler statt einer stillen Zahl. Siehe „Dimensionen“ unten.

const D = Math.PI / 180;
const FUNCS = {
  sin: x => Math.sin(x * D), cos: x => Math.cos(x * D), tan: x => Math.tan(x * D),
  asin: x => Math.asin(x) / D, acos: x => Math.acos(x) / D, atan: x => Math.atan(x) / D,
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, log: Math.log10, ln: Math.log, exp: Math.exp
};
const CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E };
const ID = /^[A-Za-z_äöüÄÖÜß][A-Za-z0-9_äöüÄÖÜß]*/;

export const RESERVED = new Set([...Object.keys(FUNCS), ...Object.keys(CONSTS), 'mm', 'cm', 'm', 'deg', 'rad', 'in']);

/* ── Dimensionen ──────────────────────────────────────────────────────────────
   Die Größe eines Ausdrucks ist eine Kette von Basis und ganzzahliger Potenz, der Basis nach sortiert:
   [] ist eine Zahl, [['mm',1]] eine Länge, [['mm',2]] eine Fläche, [['mm',-1]] „pro mm“, [['mm',1],['deg',1]]
   mm·Grad. Gerechnet wird intern immer in mm und Grad, deshalb kommt in der Kette nie cm oder in vor:
   „5 cm“ ist 50 mit Größe mm. Solange alles eine Länge war, ist die Kette die alte Anzeige-Einheit –
   [['mm',1]] entspricht dem bisherigen „bare: false“. */
export const U_ONE = [], U_LEN = [['mm', 1]], U_ANGLE = [['deg', 1]];
const uMap = u => { const o = {}; for (const [b, e] of u || []) o[b] = (o[b] || 0) + e; return o; };
const uBuild = o => Object.entries(o).filter(([, e]) => e !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([b, e]) => [b, e]);
export function unitMul(a, b) { const o = uMap(a), c = uMap(b); for (const k in c) o[k] = (o[k] || 0) + c[k]; return uBuild(o); }
export function unitDiv(a, b) { const o = uMap(a), c = uMap(b); for (const k in c) o[k] = (o[k] || 0) - c[k]; return uBuild(o); }
/* Potenz einer Größe; null, wenn dabei keine ganzzahlige Potenz herauskommt (mm^1,5 gibt es nicht) */
export function unitPow(a, n) {
  const o = {};
  for (const [b, e] of Object.entries(uMap(a))) {
    const x = e * n;
    if (Math.abs(x - Math.round(x)) > 1e-9) return null;
    o[b] = Math.round(x);
  }
  return uBuild(o);
}
export const unitEq = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = n => String(n).split('').map(c => SUP[c] || c).join('');
/* „mm“, „mm²“, „mm·deg“, „mm⁻¹“ – für Anzeige und Fehlermeldungen */
export const unitStr = u => (u && u.length ? u.map(([b, e]) => b + (e === 1 ? '' : sup(e))).join('·') : 'zahl');
const ist = u => (u && u.length ? unitStr(u) : 'eine Zahl ohne Einheit');
/* Fehler, weil die Größe nicht passt (nicht, weil der Ausdruck falsch geschrieben ist) – die Oberfläche zeigt
   dann den Text, statt ihn in den Hinweis „Zahl oder Ausdruck eingeben“ verschwinden zu lassen. */
const dimErr = msg => Object.assign(new Error(msg), { dim: true });
/* Größe, die ein Feld erwartet – der Text hinter dem Eingabefeld („mm“, „°“). Ohne Treffer: nichts prüfen. */
const WANT = { mm: U_LEN, 'mm²': [['mm', 2]], 'mm³': [['mm', 3]], deg: U_ANGLE };
export const wantUnit = s => WANT[String(s || '').replace(/°/g, 'deg').trim()] || null;

/* Einheiten hinter Zahlen: mm (Standard), cm, m, in, deg/° (Standard für Winkel), rad.
   Dahinter die Größe in internen Einheiten und der Umrechnungsfaktor; cm² und mm³ zählen mit. */
const UNIT = {
  mm: { u: U_LEN, f: 1 }, cm: { u: U_LEN, f: 10 }, m: { u: U_LEN, f: 1000 }, in: { u: U_LEN, f: 25.4 },
  deg: { u: U_ANGLE, f: 1 }, rad: { u: U_ANGLE, f: 1 / D }
};

function clean(s) { return String(s ?? '').replace(/(\d),(\d)/g, '$1.$2').replace(/°/g, 'deg').trim(); }

/* Rechnet einen Ausdruck aus; vars: { name: Zahl } oder { name: { v, u } }. Wirft Fehler mit deutschem Text. */
export function evalExpr(s, vars = {}) { return evalLen(s, vars).v; }

/* Wie evalExpr, für Felder mit einer anderen Anzeigeeinheit (Einstellungen → Einheiten, uf = mm je Einheit) und
   einer erwarteten Größe (want, Standard: Länge). Eine Zahl ohne Einheit gilt dort als Länge in der Anzeigeeinheit,
   sobald sie zu einer Länge addiert wird („breite + 5“) oder allein steht („2“, „60/2“); als Faktor („breite * 2“)
   bleibt sie eine Zahl. In einem Feld, das mm² erwartet, steht „2“ dagegen für 2 mm². „5 mm“ oder „1 in“ wie
   geschrieben; Parameter und Werte mit Einheit sind Längen in mm. expr ist der Ausdruck mit ausgeschriebener
   Einheit („breite + 5 in“), damit er in jeder Anzeigeeinheit dasselbe bedeutet. */
export function evalLen(s, vars = {}, uf = 1, unitName = 'mm', want = null) {
  const src = clean(s);
  if (!src) throw new Error('Ausdruck fehlt');
  let i = 0;
  const edits = []; // [Anfang, Ende, einzelne Zahl, Einheitstext] der Stücke, die eine Einheit bekommen
  const txt = n => src.slice(n.s, n.e).trim();
  /* Eine kahle Zahl bekommt die Größe der anderen Seite: Zahlen in Längenfeldern sind Längen in der
     Anzeigeeinheit, bei mm² entsprechend mm². Nicht umrechenbare Größen (mm·deg) passen nicht zu einer Zahl. */
  const adopt = u => {
    if (!u.length) return { f: 1, text: '' };
    if (u.length === 1 && u[0][0] === 'mm') return { f: uf ** u[0][1], text: unitName + (u[0][1] === 1 ? '' : sup(u[0][1])) };
    if (u.length === 1 && u[0][0] === 'deg') return { f: 1, text: 'deg' };
    return null;
  };
  const scale = (n, u) => {
    const a = adopt(u);
    if (!a) throw dimErr(`„${txt(n)}“ ist eine Zahl, ${ist(u)} passt nicht dazu`);
    if (a.text) edits.push([n.s, n.e, n.lit, a.text]);
    return { ...n, v: n.v * a.f, u, bare: false };
  };
  const ws = () => { while (src[i] === ' ' || src[i] === '\t') i++; };
  const unitAfter = () => {
    ws();
    const m = /^(mm|cm|m|in|deg|rad)([²³])?(?![A-Za-z0-9_äöüÄÖÜß])/.exec(src.slice(i));
    if (!m) return null;
    const base = UNIT[m[1]];
    const exp = m[2] === '²' ? 2 : m[2] === '³' ? 3 : 1;
    i += m[0].length;
    return { u: unitPow(base.u, exp), f: base.f ** exp };
  };
  /* Knoten: v Wert, u Größe, bare = Zahl ohne Einheit und ohne Größe (auch Rechnungen nur aus solchen),
     s/e Lage im Text, lit = eine einzelne Zahl */
  const atom = () => {
    ws();
    const c = src[i], s0 = i;
    if (c === '(') {
      i++; const n = expr(); ws(); if (src[i] !== ')') throw new Error('Klammer ) fehlt'); i++;
      const e0 = i, un = unitAfter();
      return un == null ? { ...n, s: s0, e: e0 } : { v: n.v * un.f, u: unitMul(n.u, un.u), bare: false, s: s0, e: i };
    }
    if (c === '-') { i++; const n = power(); return { ...n, v: -n.v, s: s0, lit: false }; }
    if (c === '+') { i++; const n = power(); return { ...n, s: s0, lit: false }; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      const e0 = i, un = unitAfter();
      return un == null ? { v: parseFloat(num[0]), u: U_ONE, bare: true, s: s0, e: e0, lit: true }
        : { v: parseFloat(num[0]) * un.f, u: un.u, bare: false, s: s0, e: i };
    }
    const m = ID.exec(src.slice(i));
    if (m) {
      const name = m[0];
      i += name.length;
      ws();
      if (src[i] === '(') {
        const fn = FUNCS[name];
        if (!fn) throw new Error(`Unbekannte Funktion „${name}“`);
        i++;
        let args = [expr()];
        ws();
        while (src[i] === ';' || (src[i] === ',' )) { i++; args.push(expr()); ws(); }
        if (src[i] !== ')') throw new Error('Klammer ) fehlt');
        i++;
        return callFn(name, fn, args, s0, i);
      }
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        const raw = vars[name];
        const v = typeof raw === 'number' ? raw : raw && raw.v;
        if (typeof v !== 'number' || !isFinite(v)) throw new Error(`„${name}“ hat keinen gültigen Wert`);
        const un = unitAfter();
        const u = (typeof raw === 'number' ? U_LEN : (raw.u || U_LEN));
        return { v: v * (un ? un.f : 1), u: un ? unitMul(u, un.u) : u, bare: false, s: s0, e: i };
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return { v: CONSTS[name], u: U_ONE, bare: true, s: s0, e: i };
      throw new Error(`Unbekannter Parameter „${name}“`);
    }
    throw new Error(c ? `Unerwartetes Zeichen „${c}“` : 'Ausdruck unvollständig');
  };
  /* sin/cos/tan nehmen einen Winkel und geben ein Verhältnis (Zahl ohne Einheit); asin/acos/atan nehmen ein
     Verhältnis und geben den Winkel in Grad – wie die Funktionen selbst rechnen. log/ln/exp rechnen mit Zahlen.
     abs/round/min/max geben die Größe ihrer Werte weiter, sqrt halbiert sie. */
  const callFn = (name, fn, args, s0, e) => {
    if (/^(sin|cos|tan)$/.test(name)) {
      for (const a of args) if (!a.bare && !unitEq(a.u, U_ANGLE)) throw dimErr(`${name}(...) braucht einen Winkel, nicht ${ist(a.u)}`);
      return { v: fn(...args.map(a => a.v)), u: U_ONE, bare: true, s: s0, e };
    }
    if (/^(asin|acos|atan)$/.test(name)) {
      for (const a of args) if (!a.bare && a.u.length) throw dimErr(`${name}(...) braucht eine Zahl ohne Einheit, nicht ${ist(a.u)}`);
      return { v: fn(...args.map(a => a.v)), u: U_ANGLE, bare: false, s: s0, e };
    }
    if (/^(log|ln|exp)$/.test(name)) {
      for (const a of args) if (!a.bare && a.u.length) throw dimErr(`${name}(...) braucht eine Zahl ohne Einheit, nicht ${ist(a.u)}`);
      return { v: fn(...args.map(a => a.v)), u: U_ONE, bare: true, s: s0, e };
    }
    if (name === 'sqrt') {
      if (args.length !== 1) throw new Error('sqrt braucht genau einen Wert');
      const u = unitPow(args[0].u, 0.5);
      if (!u) throw dimErr(`sqrt(${ist(args[0].u)}) geht nicht – die Potenzen der Einheiten müssen gerade sein`);
      return { v: fn(args[0].v), u, bare: args[0].bare, s: s0, e };
    }
    // min/max/abs/round/floor/ceil: alle Werte mit derselben Größe, Zahlen darin wie beim Addieren
    let u = U_ONE, any = false;
    for (const a of args) {
      if (a.bare) continue;
      if (!any) { u = a.u; any = true; }
      else if (!unitEq(u, a.u)) throw dimErr(`${name}: ${ist(u)} und ${ist(a.u)} passen nicht zusammen`);
    }
    if (any) args = args.map(a => (a.bare ? scale(a, u) : a));
    return { v: fn(...args.map(a => a.v)), u, bare: !any, s: s0, e };
  };
  const power = () => {
    const b = atom(); ws();
    if (src[i] === '^') {
      i++; const x = power();
      if (!x.bare && x.u.length) throw dimErr(`hoch ${ist(x.u)}: der Exponent muss eine Zahl sein`);
      const u = unitPow(b.u, x.v);
      if (!u) throw dimErr(`hoch ${String(x.v).replace('.', ',')}: ${ist(b.u)} hat keine ganzzahlige Potenz – für die Wurzel sqrt() benutzen`);
      return { v: Math.pow(b.v, x.v), u, bare: b.bare && x.bare, s: b.s, e: x.e };
    }
    return b;
  };
  const term = () => {
    let a = power(); ws();
    while (src[i] === '*' || src[i] === '/') {
      const op = src[i++]; const b = power();
      a = { v: op === '*' ? a.v * b.v : a.v / b.v, u: op === '*' ? unitMul(a.u, b.u) : unitDiv(a.u, b.u), bare: a.bare && b.bare, s: a.s, e: b.e };
      ws();
    }
    return a;
  };
  const expr = () => {
    let a = term(); ws();
    while (src[i] === '+' || src[i] === '-') {
      const op = src[i++]; let b = term();
      if (a.bare !== b.bare) { if (a.bare) a = scale(a, b.u); else b = scale(b, a.u); }
      else if (!unitEq(a.u, b.u)) throw dimErr(`„${txt(a)}“ (${ist(a.u)}) und „${txt(b)}“ (${ist(b.u)}) lassen sich nicht ${op === '+' ? 'addieren' : 'subtrahieren'}`);
      a = { v: op === '+' ? a.v + b.v : a.v - b.v, u: a.u, bare: a.bare, s: a.s, e: b.e };
      ws();
    }
    return a;
  };
  let n = expr();
  ws();
  if (i !== src.length) throw new Error(`Unerwartetes Zeichen „${src[i]}“`);
  if (want) {
    if (n.bare) n = scale(n, want);
    else if (!unitEq(n.u, want)) throw dimErr(`„${txt(n)}“ ist ${ist(n.u)}, hier wird ${ist(want)} erwartet`);
  } else if (n.bare) n = scale(n, U_LEN);
  if (!isFinite(n.v)) throw new Error('Ergebnis ist keine gültige Zahl');
  let out = src;
  edits.sort((x, y) => y[0] - x[0]).forEach(([a, b, lit, unit]) => { out = lit ? `${out.slice(0, b)} ${unit}${out.slice(b)}` : `${out.slice(0, a)}(${out.slice(a, b).trim()}) ${unit}${out.slice(b)}`; });
  return { v: n.v, u: n.u, expr: edits.length ? out : String(s).trim() };
}

/* Namen, auf die ein Ausdruck verweist (ohne Funktionen, Konstanten und Einheiten) */
export function exprNames(s) {
  const src = clean(s), out = new Set();
  const re = /[A-Za-z_äöüÄÖÜß][A-Za-z0-9_äöüÄÖÜß]*/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src[m.index - 1];
    if (before && /[0-9.]/.test(before) && /^(e[+-]?\d*|mm|cm|m|in|deg|rad)$/i.test(m[0])) continue;
    if (RESERVED.has(m[0])) continue;
    out.add(m[0]);
  }
  return out;
}

/* Enthält der Text einen Parameterbezug? Dann wird er als Ausdruck gespeichert. */
export const isExpr = s => exprNames(s).size > 0;

export const validName = n => ID.test(n) && ID.exec(n)[0] === n && !RESERVED.has(n);

/* Alle Benutzerparameter ausrechnen (Reihenfolge egal, Zirkelbezüge werden erkannt).
   vals: Werte in mm bzw. Grad, units: die Größe dazu – ein Parameter ohne eigene Größe ist eine Länge in mm,
   „dicke*2“ bleibt mm, „breite*tiefe“ ist mm². */
export function paramValues(params = []) {
  const vals = {}, units = {}, errors = {};
  const byName = new Map(params.map(p => [p.name, p]));
  const state = {};
  const env = () => Object.fromEntries(Object.keys(vals).map(k => [k, { v: vals[k], u: units[k] || U_LEN }]));
  const visit = (name, stack) => {
    if (state[name] === 'done') return;
    if (state[name] === 'busy') throw new Error(`Zirkelbezug: ${[...stack, name].join(' → ')}`);
    state[name] = 'busy';
    const p = byName.get(name);
    try {
      for (const dep of exprNames(p.expr)) {
        if (!byName.has(dep)) continue;
        visit(dep, [...stack, name]);
        if (errors[dep]) throw new Error(`„${dep}“ ist fehlerhaft`);
      }
      const r = evalLen(p.expr, env());
      vals[name] = r.v; units[name] = r.u;
    } catch (err) {
      if (!errors[name]) errors[name] = err.message;
    }
    state[name] = 'done';
  };
  params.forEach(p => { try { visit(p.name, []); } catch (err) { errors[p.name] = err.message; state[p.name] = 'done'; } });
  return { vals, units, errors };
}
/* Parameter mit ihrer Größe als Umgebung für evalExpr/evalLen ({ name: { v, u } }). Wer nur paramValues().vals
   übergibt, macht aus jedem Parameter eine Länge – sin(winkel) wäre dann ein Fehler. */
export function paramUmgebung(params = []) {
  const { vals, units } = paramValues(params);
  return Object.fromEntries(Object.keys(vals).map(k => [k, { v: vals[k], u: units[k] || U_LEN }]));
}
/* Wert als Ausdruck mit ausgeschriebener Einheit, damit er seine Größe behält („30 deg“, „100 mm“, „2450 mm²“);
   eine Zahl ohne Einheit bleibt Zahl, Größen ohne Schreibweise (mm·deg) ebenso */
export function wertMitEinheit(v, u) {
  const n = String(Math.round(v * 1e6) / 1e6);
  if (u && u.length === 1) {
    const [b, e] = u[0];
    if ((b === 'mm' && e >= 1 && e <= 3) || (b === 'deg' && e === 1)) return `${n} ${b}${e === 2 ? '²' : e === 3 ? '³' : ''}`;
  }
  return n;
}

/* Parameter umbenennen: alle ganzen Wörter im Ausdruck ersetzen */
export function renameInExpr(s, from, to) {
  return String(s).replace(/[A-Za-z_äöüÄÖÜß][A-Za-z0-9_äöüÄÖÜß]*/g, (w, idx, all) => (w === from && !/[0-9.]/.test(all[idx - 1] || '') ? to : w));
}
