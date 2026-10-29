// cantcodecad – Parameter ändern und Konfigurationen (Teilefamilie).
// Ausdrücke rechnet params.js; hier Dialoge, Übernahme in Features/Skizzen und das Umschalten der Varianten.
import { uid } from './doc.js';
import { icon } from './icons.js';
import { evalExpr, exprNames, paramValues, paramUmgebung, renameInExpr, unitStr, validName } from './params.js';
import { loadSolver, solveSketch } from './sketch/solver.js';
import { computeFlat, flatDXF } from './sheet.js';
import { makeZip } from './zip.js';
import { dxfPrefs } from './dxf-ui.js';

/* Aus main.js ausgelagert. ctx liefert den Zustand der Hauptdatei über Getter (immer der aktuelle Wert):
   doc, editing; Funktionen werden weitergereicht. */
export function setupParams(ctx) {
  const download = (...a) => ctx.download(...a), safeName = () => ctx.safeName(), kctx = () => ctx.kctx(), sheetRule = () => ctx.sheetRule();
  const $ = (...a) => ctx.$(...a);
  const $$ = (...a) => ctx.$$(...a);
  const cancelEditing = (...a) => ctx.cancelEditing(...a);
  const closeFileDialog = (...a) => ctx.closeFileDialog(...a);
  const esc = (...a) => ctx.esc(...a);
  const fmt = (...a) => ctx.fmt(...a);
  const pushHistory = (...a) => ctx.pushHistory(...a);
  const renderAll = (...a) => ctx.renderAll(...a);
  const scheduleBuild = (...a) => ctx.scheduleBuild(...a);
  const setMode = (...a) => ctx.setMode(...a);
  const store = (...a) => ctx.store(...a);
  const toast = (...a) => ctx.toast(...a);
  /* ---------------- Parameter ändern ---------------- */
  // doc.params = [{ id, name, expr, comment }]. Feature-Felder merken sich Ausdrücke in f.exprs[k] = { e, v },
  // Skizzenmaße in rule.expr. Nach jeder Änderung werden alle Ausdrücke neu ausgerechnet, Skizzen neu gelöst und das Modell neu gebaut.
  function featureExpr(f, k) {
    const x = f.exprs && f.exprs[k];
    return x && Math.abs((Number(f[k]) || 0) - x.v) < 1e-9 ? x.e : null;
  }
  async function applyParams() {
    const { vals, units } = paramValues(ctx.doc.params);
    // Werte zusammen mit ihrer Größe einsetzen, damit „breite*tiefe“ in einem Längenfeld als mm² auffällt
    const env = Object.fromEntries(Object.keys(vals).map(k => [k, { v: vals[k], u: units[k] }]));
    const bad = [];
    let changed = 0, sketchesNeedSolver = ctx.doc.features.some(f => f.type === 'sketch' && (f.rules || []).some(r => r.expr));
    if (sketchesNeedSolver) { try { await loadSolver(); } catch (err) { bad.push('Skizzen-Solver nicht geladen'); sketchesNeedSolver = false; } }
    ctx.doc.features.forEach(f => {
      if (f.exprs) {
        for (const [k, x] of Object.entries(f.exprs)) {
          if (!x || Math.abs((Number(f[k]) || 0) - x.v) > 1e-9) { delete f.exprs[k]; continue; } // Wert wurde anders überschrieben
          try { const v = evalExpr(x.e, env); if (Math.abs(v - f[k]) > 1e-12) { f[k] = v; changed++; } x.v = v; } catch (err) { bad.push(`${f.name}: ${err.message}`); }
        }
        if (!Object.keys(f.exprs).length) delete f.exprs;
      }
      if (f.type === 'sketch' && sketchesNeedSolver) {
        const before = JSON.stringify({ points: f.points, curves: f.curves, rules: f.rules });
        let touched = false;
        (f.rules || []).forEach(r => {
          if (!r.expr) return;
          try {
            const v = evalExpr(r.expr, env), sign = r.value < 0 ? -1 : 1;
            if (r.type === 'angle' ? !(v > 0 && v < 180) : !(v > 0)) throw new Error(`Maß ${r.expr} = ${fmt(v, 3)} ist ungültig`);
            if (Math.abs(Math.abs(r.value) - v) > 1e-12) { r.value = sign * v; touched = true; }
          } catch (err) { bad.push(`${f.name}: ${err.message}`); }
        });
        if (touched) {
          const res = solveSketch(f);
          if (!res.ok || res.conflicts.length) { Object.assign(f, JSON.parse(before)); bad.push(`${f.name}: lässt sich mit den neuen Werten nicht lösen`); }
          else changed++;
        }
      }
    });
    return { changed, bad };
  }
  /* Wo wird welcher Parameter benutzt? */
  function paramUses() {
    const uses = [];
    ctx.doc.features.forEach(f => {
      Object.keys(f.exprs || {}).forEach(k => { const e = featureExpr(f, k); if (e) uses.push({ where: `${f.name} · ${FIELD_LABELS[k] || k}`, expr: e, value: f[k] }); });
      if (f.type === 'sketch') (f.rules || []).forEach(r => { if (r.expr) uses.push({ where: `${f.name} · ${({ distance: 'Abstand', hdistance: 'Abstand X', vdistance: 'Abstand Y', diameter: 'Durchmesser', radius: 'Radius', angle: 'Winkel', offset: 'Versatz', chamfer: 'Fase' })[r.type] || 'Maß'}`, expr: r.expr, value: Math.abs(r.value) }); });
    });
    return uses;
  }
  const FIELD_LABELS = { distance: 'Abstand', distance2: 'Abstand 2', angle: 'Winkel', d: 'Durchmesser', depth: 'Tiefe', cd: 'Senk-⌀', cdepth: 'Senktiefe', cangle: 'Senkwinkel', count: 'Anzahl', spacing: 'Abstand', height: 'Höhe', length: 'Länge', offset: 'Versatz', toOffset: 'Versatz', pitch: 'Steigung', thickness: 'Wandstärke', fit: 'Spiel', r: 'Radius' };
  let parDraft = null;
  /* Umbenennungen im Entwurf: Ausdrücke so umschreiben, als wären die neuen Namen schon überall eingetragen */
  function renameFixer(list) {
    const ren = list.filter(p => p.orig && p.orig !== p.name && p.name).map(p => [p.orig, p.name]);
    if (!ren.length) return s => s;
    return s => ren.reduce((acc, [, b], i) => renameInExpr(acc, `__ren${i}__`, b), ren.reduce((acc, [a], i) => renameInExpr(acc, a, `__ren${i}__`), s));
  }
  function draftValues() {
    const fix = renameFixer(parDraft);
    return paramValues(parDraft.filter(p => p.name).map(p => ({ ...p, expr: fix(p.expr) })));
  }
  function openParams() {
    if (ctx.editing) cancelEditing();
    parDraft = (ctx.doc.params || []).map(p => ({ ...p, orig: p.name }));
    if (!parDraft.length) parDraft.push({ id: uid(), name: 'breite', expr: '40', comment: '' });
    renderParams();
    setMode('filedlg');
  }
  /* Wert in der Spalte „Wert“: Zahl und ihre Größe, wie sie der Ausdruck hat – „35 mm“, „1225 mm²“,
     eine Verhältniszahl ohne Einheit nur als Zahl. */
  const paramWert = (v, u) => `${fmt(v, 3)}${u && u.length ? ` ${unitStr(u)}` : ''}`;
  function renderParams(focusId) {
    const d = $('#dialog');
    const { vals, units, errors } = draftValues();
    const names = new Map();
    parDraft.forEach(p => names.set(p.name, (names.get(p.name) || 0) + 1));
    const rows = parDraft.map(p => {
      const nameErr = !p.name ? 'Name fehlt' : !validName(p.name) ? 'Nur Buchstaben, Ziffern und _ (nicht mit Ziffer beginnen, keine Funktionsnamen)' : names.get(p.name) > 1 ? 'Name doppelt' : '';
      const err = nameErr || errors[p.name] || '';
      return `<div class="prow${err ? ' bad' : ''}" data-id="${p.id}">
        <input type="text" data-par="name" value="${esc(p.name)}" placeholder="Name" spellcheck="false" autocomplete="off">
        <input type="text" data-par="expr" value="${esc(p.expr)}" placeholder="Ausdruck" spellcheck="false" autocomplete="off">
        <span class="pval" title="${esc(err)}">${err ? '⚠' : esc(paramWert(vals[p.name], units[p.name]))}</span>
        <input type="text" data-par="comment" value="${esc(p.comment || '')}" placeholder="Kommentar">
        <button type="button" class="ibtn" data-cmd="par-del" data-id="${p.id}" title="Parameter löschen">${icon('trash', 16)}</button>
        ${err ? `<small class="perr">${esc(err)}</small>` : ''}</div>`;
    }).join('');
    const uses = paramUses();
    d.className = 'dialog wide';
    d.innerHTML = `<header>${icon('params', 20)}<b class="dtitle">Parameter ändern</b></header><div class="dbody">
      <div class="phead"><span>Name</span><span>Ausdruck</span><span>Wert</span><span>Kommentar</span><span></span></div>
      <div class="plist">${rows}</div>
      <button type="button" class="chip" data-cmd="par-add">+ Parameter</button>
      <p class="info small">In jedem Maß- oder Zahlenfeld kann statt einer Zahl ein Ausdruck stehen, z. B. <b>breite/2</b> oder <b>dicke*2 + 1 mm</b>. Erlaubt: + − * / ^, Klammern, sqrt, sin/cos/tan (Grad), min/max (mit ; trennen), pi.</p>
      <p class="info small">Einheiten rechnen mit: 5 cm sind 50 mm und breite*tiefe ist mm² – passt die Größe eines Ausdrucks nicht zu dem, was ein Feld erwartet, meldet das Feld einen Fehler.</p>
      ${uses.length ? `<div class="puses"><b>Im Modell verwendet</b>${uses.map(u => `<div><span>${esc(u.where)}</span><code>${esc(u.expr)}</code><em>${esc(fmt(u.value, 3))}</em></div>`).join('')}</div>` : ''}
      </div><footer><button type="button" class="btn primary" data-cmd="par-ok">OK</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
    d.hidden = false;
    if (focusId) { const i = d.querySelector(`.prow[data-id="${focusId}"] [data-par="name"]`); if (i) { i.focus(); i.select(); } }
  }
  function paramsAdd() {
    let n = 1;
    while (parDraft.some(p => p.name === 'p' + n)) n++;
    const p = { id: uid(), name: 'p' + n, expr: '10', comment: '' };
    parDraft.push(p);
    renderParams(p.id);
  }
  function paramsDel(id) {
    const p = parDraft.find(x => x.id === id);
    if (!p) return;
    const usedBy = [...parDraft.filter(x => x !== p && exprNames(x.expr).has(p.name)).map(x => x.name), ...paramUses().filter(u => exprNames(u.expr).has(p.orig || p.name)).map(u => u.where)];
    if (usedBy.length) { toast(`„${p.name}“ wird noch benutzt: ${usedBy.slice(0, 3).join(', ')}${usedBy.length > 3 ? ' …' : ''}`, 5000); return; }
    parDraft = parDraft.filter(x => x !== p);
    renderParams();
  }
  $('#dialog').addEventListener('input', e => {
    const t = e.target, k = t.dataset.par;
    if (!k || !parDraft) return;
    const p = parDraft.find(x => x.id === t.closest('.prow').dataset.id);
    if (!p) return;
    p[k] = k === 'name' ? t.value.trim() : t.value;
    if (k === 'comment') return;
    // Werte und Fehler live aktualisieren, ohne das Eingabefeld neu zu bauen
    const { vals, units, errors } = draftValues();
    const counts = new Map(); parDraft.forEach(x => counts.set(x.name, (counts.get(x.name) || 0) + 1));
    $$('#dialog .prow').forEach(row => {
      const q = parDraft.find(x => x.id === row.dataset.id);
      const err = !q.name ? 'Name fehlt' : !validName(q.name) ? 'Ungültiger Name' : counts.get(q.name) > 1 ? 'Name doppelt' : errors[q.name] || '';
      row.classList.toggle('bad', !!err);
      const pv = row.querySelector('.pval'); pv.textContent = err ? '⚠' : paramWert(vals[q.name], units[q.name]); pv.title = err;
      let pe = row.querySelector('.perr');
      if (err && !pe) { pe = document.createElement('small'); pe.className = 'perr'; row.appendChild(pe); }
      if (pe) { if (err) pe.textContent = err; else pe.remove(); }
    });
  });
  async function commitParams() {
    if (!parDraft) return;
    if ($$('#dialog .prow.bad').length) { toast('Bitte zuerst die markierten Parameter korrigieren.'); return; }
    pushHistory();
    // Umbenennungen in allen Ausdrücken nachziehen
    const renamed = parDraft.filter(p => p.orig && p.orig !== p.name);
    if (renamed.length) {
      const fix = renameFixer(parDraft);
      parDraft.forEach(p => { p.expr = fix(p.expr); });
      ctx.doc.features.forEach(f => {
        Object.values(f.exprs || {}).forEach(x => { x.e = fix(x.e); });
        if (f.type === 'sketch') (f.rules || []).forEach(r => { if (r.expr) r.expr = fix(r.expr); });
      });
      // Teilefamilien speichern Parameter über ihren Namen in Spalten und
      // Zeilenwerten. Diese Verweise müssen beim Umbenennen mitziehen, sonst
      // würde ein späterer Variantenwechsel den umbenannten Wert verlieren.
      const cfg = ctx.doc.configs;
      if (cfg) {
        const names = new Map(renamed.map(p => [p.orig, p.name]));
        cfg.cols = (cfg.cols || []).map(c => c.startsWith('p:') && names.has(c.slice(2)) ? 'p:' + names.get(c.slice(2)) : c);
        (cfg.rows || []).forEach(row => {
          const vals = { ...(row.vals || {}) };
          names.forEach((to, from) => {
            const oldKey = 'p:' + from, newKey = 'p:' + to;
            if (Object.prototype.hasOwnProperty.call(vals, oldKey)) { vals[newKey] = vals[oldKey]; delete vals[oldKey]; }
          });
          row.vals = vals;
        });
      }
    }
    ctx.doc.params = parDraft.map(({ id, name, expr, comment }) => ({ id, name, expr: String(expr).trim(), comment: comment || '' }));
    parDraft = null;
    closeFileDialog();
    const { changed, bad } = await applyParams();
    store(); renderAll(); scheduleBuild(0);
    if (bad.length) toast('Nicht übernommen: ' + bad.slice(0, 3).join(' · '), 7000);
    else toast(changed ? `Parameter übernommen, ${changed} Wert${changed === 1 ? '' : 'e'} aktualisiert.` : 'Parameter gespeichert.');
  }

  /* ---------------- Konfigurationen ----------------
     doc.configs = { cols: ['p:<Parameter>' | 's:<Feature-ID>'], rows: [{ id, name, vals: { col: Ausdruck | unterdrückt } }], active }.
     Aktivieren schreibt die Ausdrücke in die Parameter und die Unterdrückung in die Features, dann wird neu gerechnet. */
  let cfgDraft = null;
  const cfgFeatures = () => ctx.doc.features.filter(f => f.type !== 'sketch');
  function cfgColLabel(c) {
    if (c[0] === 'p') return c.slice(2);
    const f = ctx.doc.features.find(x => x.id === c.slice(2));
    return f ? `${f.name} unterdrückt` : 'Feature fehlt';
  }
  function cfgCurrentVals(cols) {
    return Object.fromEntries(cols.map(c => {
      if (c[0] === 'p') { const p = (ctx.doc.params || []).find(x => x.name === c.slice(2)); return [c, p ? p.expr : '']; }
      const f = ctx.doc.features.find(x => x.id === c.slice(2)); return [c, !!(f && f.suppressed)];
    }));
  }
  function openConfigs() {
    if (ctx.editing) cancelEditing();
    if (!(ctx.doc.params || []).length && !cfgFeatures().length) { toast('Zuerst Parameter anlegen (Parameter ändern) oder Features erstellen – sie werden die Spalten der Tabelle.'); return; }
    cfgDraft = ctx.doc.configs ? JSON.parse(JSON.stringify(ctx.doc.configs)) : { cols: (ctx.doc.params || []).slice(0, 4).map(p => 'p:' + p.name), rows: [], active: null };
    if (!cfgDraft.rows.length) { const id = uid(); cfgDraft.rows.push({ id, name: 'Standard', vals: cfgCurrentVals(cfgDraft.cols) }); cfgDraft.active = id; }
    renderConfigs();
    setMode('filedlg');
  }
  /* ---------- Regeln ----------
     C.regeln = [{ id, name, wenn: [{ col, op, wert }], verkn: 'und'|'oder', dann: [{ col, wert }], aus }].
     Für jede Zeile der Reihe nach: trifft die Bedingung zu, setzt die Regel die genannten Zellen (spätere Regeln sehen
     schon die gesetzten Werte). Parameterspalten werden mit allen Werten der Zeile ausgerechnet (Ausdrücke wie
     breite*2 gehen auf beiden Seiten), Feature-Spalten heißen „unterdrückt“ ja/nein. */
  const OPS = ['=', '≠', '<', '≤', '>', '≥'];
  function zeilenWerte(C, r) {
    const params = (ctx.doc.params || []).map(p => { const c = 'p:' + p.name; return C.cols.includes(c) && String(r.vals[c] ?? '') !== '' ? { ...p, expr: String(r.vals[c]) } : p; });
    return paramUmgebung(params); // Werte mit Größe: { name: { v, u } }
  }
  function regelnAnwenden(C) {
    const gesetzt = new Map();
    for (const r of C.rows) for (const g of C.regeln || []) {
      if (g.aus || !g.wenn.length || !g.dann.length) continue;
      const vals = zeilenWerte(C, r);
      const pruef = b => {
        if (!C.cols.includes(b.col)) return false;
        if (b.col[0] === 's') { const ist = !!r.vals[b.col], soll = !!b.wert; return b.op === '≠' ? ist !== soll : ist === soll; }
        const a = (vals[b.col.slice(2)] || {}).v;
        let w = NaN;
        try { w = evalExpr(String(b.wert), vals); } catch (_) { w = NaN; }
        if (!Number.isFinite(a) || !Number.isFinite(w)) return false;
        const eps = 1e-9 * Math.max(1, Math.abs(a), Math.abs(w));
        return { '=': Math.abs(a - w) <= eps, '≠': Math.abs(a - w) > eps, '<': a < w - eps, '≤': a <= w + eps, '>': a > w + eps, '≥': a >= w - eps }[b.op] || false;
      };
      if (!(g.verkn === 'oder' ? g.wenn.some(pruef) : g.wenn.every(pruef))) continue;
      for (const d of g.dann) {
        if (!C.cols.includes(d.col)) continue;
        r.vals[d.col] = d.col[0] === 's' ? !!d.wert : String(d.wert);
        gesetzt.set(r.id + '|' + d.col, g.name);
      }
    }
    return gesetzt;
  }
  function regelHtml(C, g, gi) {
    const spalte = (art, i, col) => `<select data-cfgr="${gi}" data-art="${art}-col" data-i="${i}" aria-label="Spalte">${C.cols.map(c => `<option value="${esc(c)}"${c === col ? ' selected' : ''}>${esc(cfgColLabel(c))}</option>`).join('')}</select>`;
    const wert = (art, i, b) => (b.col && b.col[0] === 's'
      ? `<select data-cfgr="${gi}" data-art="${art}-wert" data-i="${i}" aria-label="Wert"><option value="1"${b.wert ? ' selected' : ''}>ja</option><option value=""${b.wert ? '' : ' selected'}>nein</option></select>`
      : `<input type="text" data-cfgr="${gi}" data-art="${art}-wert" data-i="${i}" value="${esc(b.wert ?? '')}" spellcheck="false" aria-label="Wert">`);
    const wenn = g.wenn.map((b, i) => `<div class="cfgrz">${spalte('wenn', i, b.col)}<select data-cfgr="${gi}" data-art="wenn-op" data-i="${i}" aria-label="Vergleich">${(b.col && b.col[0] === 's' ? ['=', '≠'] : OPS).map(o => `<option${o === b.op ? ' selected' : ''}>${o}</option>`).join('')}</select>${wert('wenn', i, b)}${g.wenn.length > 1 ? `<button type="button" class="ibtn" data-cmd="cfg-wenn-weg" data-g="${gi}" data-i="${i}" title="Bedingung entfernen">×</button>` : ''}</div>`).join('');
    const dann = g.dann.map((d, i) => `<div class="cfgrz">${spalte('dann', i, d.col)}<span>=</span>${wert('dann', i, d)}${g.dann.length > 1 ? `<button type="button" class="ibtn" data-cmd="cfg-dann-weg" data-g="${gi}" data-i="${i}" title="Aktion entfernen">×</button>` : ''}</div>`).join('');
    return `<div class="cfgregel${g.aus ? ' aus' : ''}">
      <div class="cfgrz"><input type="text" data-cfgr="${gi}" data-art="name" value="${esc(g.name)}" aria-label="Name der Regel"><label class="check"><input type="checkbox" data-cfgr="${gi}" data-art="an"${g.aus ? '' : ' checked'}> an</label><button type="button" class="ibtn" data-cmd="cfg-regel-weg" data-g="${gi}" title="Regel löschen">${icon('trash', 14)}</button></div>
      <div class="cfgrk"><b>Wenn</b>${g.wenn.length > 1 ? `<select data-cfgr="${gi}" data-art="verkn" aria-label="Verknüpfung"><option value="und"${g.verkn !== 'oder' ? ' selected' : ''}>alle Bedingungen</option><option value="oder"${g.verkn === 'oder' ? ' selected' : ''}>eine Bedingung</option></select>` : ''}</div>${wenn}<button type="button" class="chip" data-cmd="cfg-wenn-neu" data-g="${gi}">+ Bedingung</button>
      <div class="cfgrk"><b>dann</b></div>${dann}<button type="button" class="chip" data-cmd="cfg-dann-neu" data-g="${gi}">+ Wert setzen</button>
    </div>`;
  }
  function cfgRegelCmd(cmd, el) {
    if (!cfgDraft) return;
    const C = cfgDraft;
    if (!Array.isArray(C.regeln)) C.regeln = [];
    const g = C.regeln[Number(el && el.dataset.g)], i = Number(el && el.dataset.i), erste = C.cols[0] || '';
    const leer = col => ({ col, op: col[0] === 's' ? '=' : '≥', wert: col[0] === 's' ? true : '' });
    if (cmd === 'cfg-regel-neu') {
      if (!C.cols.length) { toast('Erst Spalten anlegen – Regeln setzen Werte in Spalten.'); return; }
      C.regeln.push({ id: uid(), name: `Regel ${C.regeln.length + 1}`, wenn: [leer(erste)], verkn: 'und', dann: [{ col: C.cols[C.cols.length - 1], wert: C.cols[C.cols.length - 1][0] === 's' ? true : '' }] });
    }
    else if (!g) return;
    else if (cmd === 'cfg-regel-weg') C.regeln.splice(C.regeln.indexOf(g), 1);
    else if (cmd === 'cfg-wenn-neu') g.wenn.push(leer(erste));
    else if (cmd === 'cfg-wenn-weg' && g.wenn.length > 1) g.wenn.splice(i, 1);
    else if (cmd === 'cfg-dann-neu') g.dann.push({ col: erste, wert: erste[0] === 's' ? true : '' });
    else if (cmd === 'cfg-dann-weg' && g.dann.length > 1) g.dann.splice(i, 1);
    renderConfigs();
  }
  function cfgRegelEingabe(t) {
    const C = cfgDraft, g = C && C.regeln && C.regeln[Number(t.dataset.cfgr)], art = t.dataset.art, i = Number(t.dataset.i);
    if (!g) return;
    if (art === 'name') { g.name = t.value.trim().slice(0, 60) || g.name; return; }
    if (art === 'an') g.aus = !t.checked;
    else if (art === 'verkn') g.verkn = t.value === 'oder' ? 'oder' : 'und';
    else {
      const [teil, feld] = art.split('-'), liste = teil === 'wenn' ? g.wenn : g.dann, b = liste[i];
      if (!b) return;
      if (feld === 'col') { b.col = t.value; if (b.col[0] === 's') { b.wert = true; if (b.op) b.op = '='; } else if (typeof b.wert === 'boolean') b.wert = ''; }
      else if (feld === 'op') b.op = OPS.includes(t.value) ? t.value : '=';
      else b.wert = b.col && b.col[0] === 's' ? t.value === '1' : t.value.trim();
    }
    renderConfigs();
  }
  function renderConfigs() {
    const d = $('#dialog'), C = cfgDraft;
    const { vals } = paramValues(ctx.doc.params || []);
    if (!Array.isArray(C.regeln)) C.regeln = [];
    const gesetzt = regelnAnwenden(C);
    const regelTitel = (r, c) => { const n = gesetzt.get(r.id + '|' + c); return n ? ` class="regel" title="${esc(`gesetzt von ${n}`)}"` : ''; };
    const cell = (r, c) => c[0] === 's'
      ? `<td${regelTitel(r, c)}><input type="checkbox" data-cfg="${esc(r.id)}" data-col="${esc(c)}"${r.vals[c] ? ' checked' : ''} aria-label="${esc(cfgColLabel(c))}"></td>`
      : `<td${regelTitel(r, c)}><input type="text" data-cfg="${esc(r.id)}" data-col="${esc(c)}" value="${esc(r.vals[c] ?? '')}" spellcheck="false" aria-label="${esc(cfgColLabel(c))}"></td>`;
    const freeP = (ctx.doc.params || []).filter(p => !C.cols.includes('p:' + p.name)), freeS = cfgFeatures().filter(f => !C.cols.includes('s:' + f.id));
    d.className = 'dialog wide';
    d.innerHTML = `<header>${icon('config', 20)}<b class="dtitle">Konfigurationen</b></header><div class="dbody">
      <div class="cfgwrap"><table class="cfgtab"><thead><tr><th>Aktiv</th><th>Name</th>${C.cols.map(c => `<th>${esc(cfgColLabel(c))}<button type="button" class="ibtn" data-cmd="cfg-coldel" data-col="${esc(c)}" title="Spalte entfernen">×</button></th>`).join('')}<th></th></tr></thead>
      <tbody>${C.rows.map(r => `<tr><td><input type="radio" name="cfgact" data-cfgact="${esc(r.id)}"${r.id === C.active ? ' checked' : ''} aria-label="aktiv"></td><td><input type="text" data-cfgname="${esc(r.id)}" value="${esc(r.name)}"></td>${C.cols.map(c => cell(r, c)).join('')}<td><button type="button" class="ibtn" data-cmd="cfg-add" data-from="${esc(r.id)}" title="Zeile kopieren">⧉</button><button type="button" class="ibtn" data-cmd="cfg-del" data-id="${esc(r.id)}" title="Zeile löschen">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>
      <div class="btns"><button type="button" class="chip" data-cmd="cfg-add">+ Konfiguration</button>
    <button type="button" class="chip" data-cmd="cfg-export" data-v="dxf" title="Für jede Variante die Abwicklung als DXF (Laser), zusammen in einer ZIP-Datei">Alle als DXF</button>
    <button type="button" class="chip" data-cmd="cfg-export" data-v="step" title="Für jede Variante eine STEP-Datei, zusammen in einer ZIP-Datei">Alle als STEP</button>
    <button type="button" class="chip" data-cmd="cfg-export" data-v="pack" title="Für jede Variante das Fertigungspaket (STEP, Abwicklung, Zeichnung, Stückliste) in einem eigenen Ordner der ZIP-Datei">Alle als Fertigungspaket</button>
      ${freeP.length || freeS.length ? `<select data-cfgcol aria-label="Spalte hinzufügen"><option value="">+ Spalte …</option>${freeP.map(p => `<option value="p:${esc(p.name)}">Parameter ${esc(p.name)} (${esc(fmt(vals[p.name], 3))})</option>`).join('')}${freeS.map(f => `<option value="s:${esc(f.id)}">${esc(f.name)} unterdrücken</option>`).join('')}</select>` : ''}</div>
      <details class="gdgrp cfgregeln"${C.regeln.length ? ' open' : ''}><summary>Regeln <em>${C.regeln.length}</em></summary>
        ${C.regeln.map((g, gi) => regelHtml(C, g, gi)).join('')}
        <button type="button" class="chip" data-cmd="cfg-regel-neu">+ Regel</button>
        <p class="info small">Konfigurationsregeln: „Wenn … dann …“ setzt Zellen jeder Zeile, deren Werte die Bedingung erfüllen (blau markiert). Bedingungen und Werte dürfen Ausdrücke sein, z. B. breite/12.</p>
      </details>
      <p class="info small">Teilefamilie: jede Zeile ist eine Variante. Parameterspalten nehmen Ausdrücke (z. B. 60 oder breite*2), Feature-Spalten unterdrücken das Feature. Die aktive Zeile wird nach OK übernommen; umschalten geht auch oben im Browser.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="cfg-ok">OK</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
    d.hidden = false;
  }
  function cfgAddRow(fromId) {
    const src = cfgDraft.rows.find(r => r.id === fromId) || cfgDraft.rows[cfgDraft.rows.length - 1];
    let n = cfgDraft.rows.length + 1;
    while (cfgDraft.rows.some(r => r.name === 'Variante ' + n)) n++;
    cfgDraft.rows.push({ id: uid(), name: 'Variante ' + n, vals: src ? { ...src.vals } : cfgCurrentVals(cfgDraft.cols) });
    renderConfigs();
  }
  function cfgDelRow(id) {
    if (cfgDraft.rows.length <= 1) { toast('Mindestens eine Konfiguration bleibt.'); return; }
    cfgDraft.rows = cfgDraft.rows.filter(r => r.id !== id);
    if (cfgDraft.active === id) cfgDraft.active = cfgDraft.rows[0].id;
    renderConfigs();
  }
  function cfgAddCol(c) {
    if (!c || cfgDraft.cols.includes(c)) return;
    cfgDraft.cols.push(c);
    const cur = cfgCurrentVals([c])[c];
    cfgDraft.rows.forEach(r => { r.vals[c] = cur; });
    renderConfigs();
  }
  function cfgDelCol(c) { cfgDraft.cols = cfgDraft.cols.filter(x => x !== c); renderConfigs(); }
  $('#dialog').addEventListener('change', e => {
    if (!cfgDraft) return;
    const t = e.target;
    if (t.matches('[data-cfgcol]')) { cfgAddCol(t.value); return; }
    if (t.matches('[data-cfgact]')) { cfgDraft.active = t.dataset.cfgact; return; }
    if (t.matches('[data-cfgr]')) { cfgRegelEingabe(t); return; }
    if (t.matches('[data-cfg]')) {
      const r = cfgDraft.rows.find(x => x.id === t.dataset.cfg);
      if (r) r.vals[t.dataset.col] = t.type === 'checkbox' ? t.checked : t.value.trim();
      // Regeln hängen an den Werten: nach jeder Änderung neu anwenden und zeigen
      if ((cfgDraft.regeln || []).length) renderConfigs();
      return;
    }
    if (t.matches('[data-cfgname]')) { const r = cfgDraft.rows.find(x => x.id === t.dataset.cfgname); if (r) r.name = t.value.trim().slice(0, 60) || r.name; }
  });
  async function commitConfigs() {
    if (!cfgDraft) return;
    regelnAnwenden(cfgDraft);
    // Ausdrücke vorab prüfen
    const bad = [];
    cfgDraft.rows.forEach(r => cfgDraft.cols.filter(c => c[0] === 'p').forEach(c => {
      const params = (ctx.doc.params || []).map(p => (p.name === c.slice(2) ? { ...p, expr: r.vals[c] } : p));
      const { errors } = paramValues(params);
      if (!String(r.vals[c] || '').trim() || errors[c.slice(2)]) bad.push(`${r.name} · ${c.slice(2)}`);
    }));
    if (bad.length) { toast('Ungültige Werte: ' + bad.slice(0, 3).join(', '), 6000); return; }
    pushHistory();
    ctx.doc.configs = cfgDraft;
    const act = cfgDraft.active;
    cfgDraft = null;
    closeFileDialog();
    await activateConfig(act, true);
  }
  async function activateConfig(id, noHistory) {
    const C = ctx.doc.configs, r = C && C.rows.find(x => x.id === id);
    if (!r) return;
    if (!noHistory) pushHistory();
    C.active = r.id;
    C.cols.forEach(c => {
      if (c[0] === 'p') { const p = (ctx.doc.params || []).find(x => x.name === c.slice(2)); if (p && r.vals[c] !== '') p.expr = String(r.vals[c]); }
      else { const f = ctx.doc.features.find(x => x.id === c.slice(2)); if (f) f.suppressed = !!r.vals[c]; }
    });
    const { bad } = await applyParams();
    store(); renderAll(); scheduleBuild(0);
    toast(bad.length ? `Konfiguration „${r.name}“ – nicht übernommen: ${bad.slice(0, 2).join(' · ')}` : `Konfiguration „${r.name}“ aktiv.`, bad.length ? 7000 : 2500);
  }

  /* Alle Varianten exportieren: nacheinander aktivieren, Neubau abwarten, DXF-Abwicklung bzw. STEP, alles in eine ZIP */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitRebuilt(prev) {
    for (let i = 0; i < 300; i++) { await sleep(100); if (ctx.lastBuild && ctx.lastBuild !== prev && !ctx.building) return true; }
    return false;
  }
  async function exportConfigs(kind) {
    if (cfgDraft) { await commitConfigs(); }
    const C = ctx.doc.configs;
    if (!C || !C.rows.length) { toast('Keine Konfigurationen vorhanden.'); return; }
    const keep = C.active, files = [], skipped = [], base = safeName(), enc = new TextEncoder();
    const fname = s => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Variante';
    toast(`Exportiere ${C.rows.length} Varianten …`, 60000);
    try {
      for (const r of C.rows) {
        const prev = ctx.lastBuild;
        await activateConfig(r.id, true);
        if (!(await waitRebuilt(prev))) { skipped.push(`${r.name} (Neubau dauert zu lange)`); continue; }
        if (kind === 'pack') {
          const { files: fs, notes } = await ctx.packageFiles(fname(r.name));
          files.push(...fs);
          if (notes.length) skipped.push(`${r.name} (${notes[0]})`);
          continue;
        }
        if (kind === 'dxf') {
          let flat = null;
          try { flat = computeFlat(ctx.doc, sheetRule(), ctx.lastBuild.sheet); } catch (err) { skipped.push(`${r.name} (${err.message})`); continue; }
          files.push({ name: `${base}-${fname(r.name)}.dxf`, data: enc.encode(flatDXF(flat, dxfPrefs())) });
        } else {
          const { buf } = await ctx.kernel.exportFile(ctx.doc.features, 'step', kctx());
          files.push({ name: `${base}-${fname(r.name)}.step`, data: new Uint8Array(buf) });
        }
      }
    } finally {
      const prev = ctx.lastBuild;
      await activateConfig(keep, true);
      await waitRebuilt(prev);
    }
    if (!files.length) { toast('Nichts exportiert' + (skipped.length ? ': ' + skipped.slice(0, 2).join(' · ') : '.'), 7000); return; }
    download(`${base}-Konfigurationen-${kind === 'pack' ? 'Fertigung' : kind.toUpperCase()}.zip`, makeZip(files));
    toast(`${files.length} Datei${files.length === 1 ? '' : 'en'} als ZIP gespeichert${skipped.length ? ` – übersprungen: ${skipped.slice(0, 2).join(' · ')}` : ''}.`, skipped.length ? 8000 : 3500);
  }
  return { cfgRegelCmd, exportConfigs, activateConfig, applyParams, cfgAddCol, cfgAddRow, cfgDelCol, cfgDelRow, commitConfigs, commitParams, featureExpr, openConfigs, openParams, paramsAdd, paramsDel };
}
