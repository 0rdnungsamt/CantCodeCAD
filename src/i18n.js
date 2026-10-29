// cantcodecad – Sprache der Oberfläche (Einstellungen → Allgemein → Sprache): Deutsch (Standard) oder Englisch.
// Deutsch ist die Quelle: alle Texte stehen deutsch im Code (auch die Meldungen von Geometriekern und Rechen-Workern).
// Für Englisch übersetzt ein MutationObserver alles, was in die Seite kommt – Textknoten sowie title, placeholder und
// aria-label – über das Wörterbuch src/i18n-en.js; dazu alert/confirm/prompt und t() für Texte außerhalb des DOM
// (Beschriftung des Ansichtswürfels). Fehlt ein Text im Wörterbuch, bleibt er deutsch (Rückfall).
// Nicht übersetzt wird, was in einem Element mit translate="no" liegt (Zeichnungsblatt = Dokumentinhalt, Parameternamen),
// sowie Eingabefelder. Die Wahl gilt ab dem nächsten Laden; prefs-ui.js lädt die Oberfläche nach dem Umschalten neu.
import EN_TEXT from './i18n-en.js';

const KEY = new URLSearchParams(location.search).has('test') ? 'cc.prefs.test' : 'cc.prefs';
export const LANGS = [['de', 'Deutsch'], ['en', 'English']];
export const LANG = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}').lang === 'en' ? 'en' : 'de'; } catch (_) { return 'de'; } })();
/* Dezimalzeichen und Zahlenformat der Anzeige: Komma im Deutschen, Punkt im Englischen */
export const DEC = LANG === 'en' ? '.' : ',';
export const NUM_LOCALE = LANG === 'en' ? 'en-US' : 'de-DE';

const norm = s => s.replace(/\s+/g, ' ').trim();
const LETTER = /[A-Za-zÄÖÜäöüß]/;
let exact = null, patterns = null;
const cache = new Map();
/* Texte ohne Übersetzung (zum Nachpflegen des Wörterbuchs: in der Konsole cantcodecadI18n.missing) */
const missing = new Set();

/* Wörterbuch einlesen: Texte ohne Platzhalter in eine Map, Vorlagen mit {n} als Muster (^…$, je Platzhalter eine Gruppe).
   Zusätzlich die Fassung ohne führendes Satzzeichen („, {0} übernommen“ wird an ein anderes Stück gehängt) und ohne
   Platzhalter am Rand, der im DOM ein eigenes Element ist (Symbol vor der Beschriftung). */
function compile() {
  exact = new Map(); patterns = [];
  const addPat = (de, en) => {
    const parts = de.split(/\{(\d+#?)\}/);
    let re = '', lit = '';
    const order = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2) {
        /* Mehrzahl-Platzhalter ({1:s} im Englischen): direkt am Wort nur die deutsche Endung („Fläche{1}“), sonst ein Wort/eine Zahl */
        const k = parseInt(parts[i], 10), plural = en.includes('{' + k + ':');
        re += parts[i].endsWith('#') ? '([\\d.,]+)' : plural ? (LETTER.test(parts[i - 1].slice(-1)) ? '([a-zäöüß]{0,3})' : '(\\S*)') : '(.*?)';
        order.push(k);
      } else { re +=parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (parts[i].length > lit.length) lit = parts[i]; }
    }
    patterns.push({ re: new RegExp('^' + re + '$'), order, en, lit: lit.trim(), len: parts.filter((_, i) => !(i % 2)).join('').length });
  };
  const add = (de, en) => {
    if (!de || !LETTER.test(de)) return;
    if (/\{\d+#?\}/.test(de)) addPat(de, en); else if (!exact.has(de)) exact.set(de, en);
  };
  for (const line of EN_TEXT.split('\n')) {
    const i = line.indexOf(' ⇒ ');
    if (i < 0) continue;
    const de = norm(line.slice(0, i).replace(/\\n/g, ' ')), en = line.slice(i + 3).trim();
    add(de, en);
  }
  for (const line of EN_TEXT.split('\n')) {
    const i = line.indexOf(' ⇒ ');
    if (i < 0) continue;
    const de = norm(line.slice(0, i).replace(/\\n/g, ' ')), en = line.slice(i + 3).trim();
    const lead = /^[,·–:.;]\s*/;
    if (lead.test(de) && lead.test(en)) add(de.replace(lead, ''), en.replace(lead, ''));
    /* Platzhalter vorn („{1} Teil öffnen“ mit Symbol davor): im DOM ist das ein eigenes Element */
    const m = /^\{(\d+)\} (.+)$/.exec(de);
    if (m) {
      const en2 = en.replace(new RegExp('\\{' + m[1] + '(:[^}]*)?\\}\\s*'), '').trim();
      if (/\{\d+#?\}/.test(m[2])) add(m[2], en2); else if (!exact.has(m[2])) exact.set(m[2], en2);
    }
    /* „Fehler im Kern:“ auch ohne Doppelpunkt (wenn die Meldung dahinter angehängt ist) */
    const end = /\s*(:|…|\.)$/;
    if (!/\{\d+\}/.test(de) && end.test(de) && end.test(en) && !exact.has(de.replace(end, ''))) exact.set(de.replace(end, ''), en.replace(end, ''));
  }
  /* Genaueste Vorlage zuerst: „{0} Fläche{1}“ darf nicht vor „Isokurven an: {0} gekrümmte Fläche{1}{2}. …“ greifen */
  patterns.sort((a, b) => b.len - a.len);
}

/* Englische Vorlage füllen: {n} = Wert n (selbst übersetzt, z. B. Feature-Namen), {n:mehr|eins} nach Anzahl/Endung. */
function fill(en, vals) {
  return en.replace(/\{(\d+)(?::([^}|]*)(?:\|([^}]*))?)?\}/g, (_, k, many, one) => {
    const v = vals[+k] ?? '';
    if (many === undefined) return tr(v) ?? v;
    return v !== '' && v !== '1' ? many : (one ?? '');
  });
}

const SEPS = [' · ', ' – ', ' — ', ' | ', ': ', '; ', '. ', ', ', ' → '];
/* Teilstücke merken: das stückweise Zerlegen fragt dieselben Reste sonst immer wieder ab */
const memo = new Map();
function lookup(n, depth) {
  if (memo.has(n)) return memo.get(n);
  const r = lookup1(n, depth);
  if (memo.size > 50000) memo.clear();
  memo.set(n, r);
  return r;
}
function lookup1(n, depth) {
  const e = exact.get(n);
  if (e !== undefined) return e;
  for (const p of patterns) {
    if (p.lit && !n.includes(p.lit)) continue;
    const m = p.re.exec(n);
    if (!m) continue;
    const vals = [];
    p.order.forEach((k, i) => { vals[k] = m[i + 1]; });
    return fill(p.en, vals);
  }
  /* Name mit Nummer (Skizze3, Extrusion12, Stab 4 …); „Körper# ⇒ Body“ im Wörterbuch für die Einzahl */
  let m = /^(\D*?\D)( ?)(\d+)$/.exec(n);
  if (m && (exact.has(m[1] + '#') || exact.has(m[1]))) return (exact.get(m[1] + '#') ?? exact.get(m[1])) + m[2] + m[3];
  /* Zusatz in Klammern: Tastenkürzel „Extrusion (E)“, Werte „Ø 2,74 (Zahl tippen)“ */
  m = /^(.*\S) \(([^()]*)\)$/.exec(n);
  if (m && depth < 4) {
    const core = LETTER.test(m[1]) ? lookup(m[1], depth + 1) : null, inner = LETTER.test(m[2]) ? lookup(m[2], depth + 1) : null;
    if (core != null || inner != null) return (core ?? m[1]) + ' (' + (inner ?? m[2]) + ')';
  }
  /* Satzzeichen am Rand */
  m = /^([•·–\-(]\s*)?(.*?)(\s*[.:…!?)]+)?$/.exec(n);
  if (m && (m[1] || m[3]) && m[2] && LETTER.test(m[2])) {
    const core = lookup(m[2], depth + 1);
    if (core != null) return (m[1] || '') + core + (m[3] || '');
  }
  /* Zusammengesetzte Meldungen („Fehler im Kern: …“, „Bereit · 3 Körper“) stückweise */
  if (depth < 8) {
    for (const sep of SEPS) {
      const i = n.indexOf(sep);
      if (i < 0) continue;
      /* am ersten Trenner teilen, der Rest wird wieder als Ganzes gesucht (er kann selbst „ – “ enthalten) */
      const a = n.slice(0, i), b = n.slice(i + sep.length);
      const ta = LETTER.test(a) ? lookup(a, depth + 1) : null, tb = LETTER.test(b) ? lookup(b, depth + 1) : null;
      if (ta != null || tb != null) return (ta ?? a) + sep + (tb ?? b);
    }
  }
  return null;
}
function defaultName(n) {
  const m = /^(\D*?\D)( ?)(\d+)$/.exec(n);
  return m && (exact.has(m[1] + '#') || exact.has(m[1])) ? (exact.get(m[1] + '#') ?? exact.get(m[1])) + m[2] + m[3] : null;
}
function tr(s) {
  if (!s || !LETTER.test(s)) return null;
  if (cache.has(s)) return cache.get(s);
  const n = norm(s);
  const r = lookup(n, 0);
  if (r == null) missing.add(n);
  if (cache.size > 20000) cache.clear();
  cache.set(s, r);
  return r;
}

/* Für Code außerhalb des DOM: t('OBEN') → 'TOP' im Englischen; {0} … wie im Wörterbuch */
export function t(de, ...vals) {
  const s = vals.length ? de.replace(/\{(\d+)\}/g, (_, k) => String(vals[+k] ?? '')) : de;
  if (LANG !== 'en') return s;
  return tr(s) ?? s;
}

const ATTRS = ['title', 'placeholder', 'aria-label'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
function skipped(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (SKIP.has(e.tagName.toUpperCase()) || e.getAttribute('translate') === 'no' || e.isContentEditable) return true;
  }
  return false;
}
/* Selbst geschriebene Werte merken, damit die eigene Änderung nicht noch einmal übersetzt wird
   (englische Wörter können zugleich deutsche Schlüssel sein, z. B. „Profile“). */
const written = new WeakMap();
/* Zahlen im Text mit Dezimalkomma („12,5 mm“) bekommen im Englischen den Punkt */
const decPoint = s => s.replace(/(\d),(\d)/g, '$1.$2');
function doText(node) {
  const v = node.nodeValue;
  if (!v || written.get(node) === v) return;
  if (!LETTER.test(v)) {
    if (/\d,\d/.test(v) && !skipped(node.parentElement)) { node.nodeValue = decPoint(v); written.set(node, node.nodeValue); }
    return;
  }
  if (skipped(node.parentElement)) return;
  /* Namen im Browser (data-nm): nur die Vorgabenamen „Körper3“ → „Body3“, eigene Namen bleiben wie eingegeben */
  const nm = node.parentElement && node.parentElement.closest('[data-nm]');
  let r = nm ? defaultName(norm(v)) : tr(v);
  if (!nm) r = decPoint(r ?? norm(v));
  if (r == null || r === norm(v)) return;
  const lead = /^\s*/.exec(v)[0], trail = /\s*$/.exec(v)[0];
  node.nodeValue = lead + r + trail;
  written.set(node, node.nodeValue);
}
function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !LETTER.test(v)) continue;
    let w = written.get(el);
    if (w && w[a] === v) continue;
    const r = decPoint(tr(v) ?? v);
    if (r === v) continue;
    el.setAttribute(a, r);
    if (!w) written.set(el, w = {});
    w[a] = r;
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeType === 1 && (SKIP.has(n.tagName.toUpperCase()) || n.getAttribute('translate') === 'no') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}

/* Einmal beim Start (vor dem Aufbau der Oberfläche) aufrufen. Deutsch: nichts zu tun. */
export function startI18n() {
  if (LANG !== 'en') return;
  compile();
  document.documentElement.lang = 'en';
  window.cantcodecadI18n = { missing, tr };
  for (const k of ['alert', 'confirm', 'prompt']) {
    const f = window[k].bind(window);
    window[k] = (msg, ...rest) => f(msg == null ? msg : t(String(msg)), ...rest);
  }
  walk(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes' && !skipped(m.target)) doAttrs(m.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
