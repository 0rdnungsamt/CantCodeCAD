// cantcodecad – Arbeitsbereich Zeichnung: Blätter, Ansichten, Maße, Werkzeuge.
// Die Darstellung des Blatts steht in drawing.js, hier die Bedienung.
import { MATERIALS, uid, isDefaultPartName } from './doc.js';
import { icon } from './icons.js';
import { dimValue, holeRows, renderSheet, SHEETS, SCALES, scaleLabel, GDT, GDT_DATUM, TB_PLACEHOLDERS } from './drawing.js';
import { computeFlat } from './sheet.js';
import { dxfToSketch } from './dxfimport.js';
import { ORIGIN_PLANES } from './doc.js';
import { FITS, fitDeviations } from './fits.js';

/* Aus main.js ausgelagert. ctx liefert den Zustand der Hauptdatei über Getter (immer der aktuelle Wert):
   doc, editing, lastBuild, mode, kernel, caretSvg; Funktionen werden weitergereicht. */
export function setupDrawingWorkspace(ctx) {
  const $ = (...a) => ctx.$(...a);
  const angTxt = (...a) => ctx.angTxt(...a);
  const bodyInfo = (...a) => ctx.bodyInfo(...a);
  const bodyName = (...a) => ctx.bodyName(...a);
  const cancelEditing = (...a) => ctx.cancelEditing(...a);
  const closeMeasure = (...a) => ctx.closeMeasure(...a);
  const closeNesting = (...a) => ctx.closeNesting(...a);
  const closeRender = (...a) => ctx.closeRender(...a);
  const cutListRows = (...a) => ctx.cutListRows(...a);
  const esc = (...a) => ctx.esc(...a);
  const fmt = (...a) => ctx.fmt(...a);
  const fmtMass = (...a) => ctx.fmtMass(...a);
  const hasBody = (...a) => ctx.hasBody(...a);
  const insertBodies = (...a) => ctx.insertBodies(...a);
  const kctx = (...a) => ctx.kctx(...a);
  const pushHistory = (...a) => ctx.pushHistory(...a);
  const setMode = (...a) => ctx.setMode(...a);
  const setStatus = (...a) => ctx.setStatus(...a);
  const sheetRule = (...a) => ctx.sheetRule(...a);
  const showCtx = (...a) => ctx.showCtx(...a);
  const store = (...a) => ctx.store(...a);
  const toast = (...a) => ctx.toast(...a);
  const weldRows = (...a) => ctx.weldRows(...a);
  /* ---------------- Zeichnung (Zeichnung aus Konstruktion) ---------------- */
  const drawing = { data: null, opts: { format: 'A4', scale: 'auto', hidden: true, iso: true, dims: true, centers: true, holes: true, section: false, bom: true }, last: null };
  /* Stückliste: eingefügte Teile gruppiert nach Datei, sonst Komponenten, sonst Körper (ab zwei) */
  function computeBom(boxes) {
    const vol = new Map(((ctx.lastBuild && ctx.lastBuild.mesh && ctx.lastBuild.mesh.bodies) || []).map(b => [b.id, b.volume || 0]));
    const box = new Map((boxes || []).map(b => [b.id, b.bbox]));
    const center = ids => {
      const bs = ids.map(id => box.get(id)).filter(Boolean);
      if (!bs.length) return null;
      const lo = [0, 1, 2].map(k => Math.min(...bs.map(b => b[0][k]))), hi = [0, 1, 2].map(k => Math.max(...bs.map(b => b[1][k])));
      return lo.map((v, k) => (v + hi[k]) / 2);
    };
    const massOf = ids => ids.reduce((a, id) => { const b = bodyInfo(id) || {}, m = MATERIALS[b.material] || MATERIALS.none; return a + (m.rho ? (vol.get(id) || 0) / 1000 * m.rho : 0); }, 0);
    const matOf = ids => [...new Set(ids.map(id => (MATERIALS[(bodyInfo(id) || {}).material] || MATERIALS.none)).filter(m => m.rho).map(m => m.label))].join(', ') || '–';
    const groups = [];
    const ins = ctx.doc.inserts || [];
    if (ins.length) {
      const map = new Map();
      ins.forEach(i => { const key = i.file || i.part.name || i.name; if (!map.has(key)) map.set(key, []); map.get(key).push(i); });
      map.forEach((list, key) => { const ids = insertBodies(list[0].id); groups.push({ name: list[0].part.name && !isDefaultPartName(list[0].part.name) ? list[0].part.name : key.split('/').pop().replace(/\.cantcodecad$/i, ''), qty: list.length, ids }); });
    } else if ((ctx.doc.components || []).length) {
      /*: Instanzen zählen beim Original, gleiche Komponenten (Grundname ohne „ (2)“, gleiches Volumen, gleiche
         Abmessungen) zusammen – eine STEP-Baugruppe ergibt so je Teil eine Zeile mit Stückzahl statt je Einbau */
      const comps = ctx.doc.components, alle = new Set(comps.map(c => c.id)), sig = new Map();
      const grund = n => String(n).replace(/ \(\d+\)$/, '');
      const masse = ids => { const bs = ids.map(id => box.get(id)).filter(Boolean); if (!bs.length) return ''; const lo = [0, 1, 2].map(k => Math.min(...bs.map(b => b[0][k]))), hi = [0, 1, 2].map(k => Math.max(...bs.map(b => b[1][k]))); return lo.map((v, k) => hi[k] - v).sort((a, b) => b - a).map(v => v.toFixed(1)).join('x'); };
      comps.filter(c => c.bodies.length).forEach(c => {
        const orig = c.instanz && alle.has(c.instanz.von) ? comps.find(x => x.id === c.instanz.von) : c;
        const v = c.bodies.reduce((a, id) => a + (vol.get(id) || 0), 0);
        const key = `${grund(orig.name)}|${v.toFixed(2)}|${masse(c.bodies)}`;
        const g = sig.get(key);
        if (g) g.qty++; else { const n = { name: grund(orig.name), qty: 1, ids: c.bodies }; sig.set(key, n); groups.push(n); }
      });
    } else if (((ctx.lastBuild && ctx.lastBuild.bodies) || []).length > 1) {
      // Rahmenstäbe gleicher Länge und gleichen Zuschnitts zusammenfassen
      const rows = cutListRows(), inRows = new Set(rows.flatMap(r => r.ids));
      const fast = new Map();
      ((ctx.lastBuild && ctx.lastBuild.parts) || []).filter(p => p.fastener && !(bodyInfo(p.id) || {}).hidden).forEach(p => { inRows.add(p.id); if (!fast.has(p.base)) fast.set(p.base, []); fast.get(p.base).push(p.id); });
      rows.forEach(r => groups.push({ name: `${r.label} L=${fmt(r.L, 0)}${r.angles.some(a => a > 0.05) ? ` (${angTxt(r.angles)})` : ''}`, qty: r.n, ids: r.ids, single: r.ids[0] }));
      const weldIds = new Set(((ctx.lastBuild && ctx.lastBuild.welds) || []).map(w => w.id));
      ctx.lastBuild.bodies.filter(id => !inRows.has(id) && !weldIds.has(id) && !(bodyInfo(id) || {}).hidden).forEach(id => groups.push({ name: bodyName(id), qty: 1, ids: [id] }));
      fast.forEach((ids, base) => groups.push({ name: base, qty: ids.length, ids, single: ids[0] }));
    }
    return groups.map((g, i) => { const m = massOf(g.single ? [g.single] : g.ids); return { pos: i + 1, qty: g.qty, name: g.name, material: matOf(g.ids), mass: m ? fmtMass(m) : '–', g: m, ids: g.ids, dimIds: g.single ? [g.single] : g.ids, p3: center(g.single ? [g.single] : g.ids) }; });
  }
  /* Gewindebohrungen (Kernloch-Norm) für die Zeichnung: Kernloch-⌀ → „M6“ mit Gewindeaußen-⌀ */
  function drawingTaps() {
    return ctx.doc.features.filter(f => f.type === 'hole' && !f.suppressed && String(f.preset || '').startsWith('tap:')).map(f => {
      const sz = f.preset.split(':')[1];
      // Toleranzklasse wie „M8-6H“ (ISO 965) an die Bezeichnung
      return { d: Number(f.d), label: f.tclass ? `${sz}-${f.tclass}` : sz, D: parseFloat(sz.slice(1)), modeled: f.tapMode === 'modeled' };
    });
  }
  const DRAW_DEFAULTS = { format: 'A4', scale: 'auto', hidden: true, iso: true, dims: true, centers: true, holes: true, section: false, bom: true, cutX: '' };
  /* Alle Blätter für Export/Fertigungspaket zeichnen (SVG-Texte), ohne die offene Zeichnung zu verändern */
  async function renderSheetsForExport() {
    if (!hasBody()) throw new Error('Für eine Zeichnung braucht es einen Körper');
    const keep = { opts: drawing.opts, data: drawing.data, sheet: drawing.sheet, mainScale: drawing.mainScale, last: drawing.last, dimMode: drawing.dimMode, secMode: drawing.secMode, setMode: drawing.setMode, placing: drawing.placing, draft: drawing.draft };
    try {
      drawing.opts = { ...DRAW_DEFAULTS, ...((ctx.doc.drawing && ctx.doc.drawing.opts) || {}) };
      drawing.dimMode = false; drawing.secMode = null; drawing.setMode = null; drawing.placing = null; drawing.draft = { pts: [] };
      await loadDrawingData();
      return { bom: drawing.data.bom, svgs: drawSheets().map((_, i) => { const r = renderSheet(drawing.data, sheetOpts(i)); if (i === 0) drawing.mainScale = r.scale; return r.svg; }) };
    } finally { Object.assign(drawing, keep); }
  }
  async function openDrawing() {
    if (ctx.editing) cancelEditing();
    if (ctx.mode === 'render') closeRender();
    if (ctx.mode === 'nesting') closeNesting();
    drawing.opts = { ...DRAW_DEFAULTS, ...((ctx.doc.drawing && ctx.doc.drawing.opts) || {}) };
    drawing.dimMode = false; drawing.draft = { pts: [] }; drawing.open = true;
    if (ctx.mode === 'measure') closeMeasure();
    if (!hasBody()) { toast('Für eine Zeichnung braucht es einen Körper.'); return; }
    let el = $('#drawing');
    if (!el) { el = document.createElement('div'); el.id = 'drawing'; el.className = 'drawing'; $('#viewport').appendChild(el); }
    el.hidden = false;
    el.innerHTML = `<div class="sheetwrap"><div class="sheet"><p class="info">Ansichten werden berechnet …</p></div></div>`;
    if (!el.dataset.wired) { el.dataset.wired = '1'; wireDrawingEvents(el); el.addEventListener('contextmenu', drawingContext); }
    drawing.sheet = 0;
    setMode('drawing');
    renderDrawRibbon();
    try {
      await loadDrawingData();
      renderDrawing();
    } catch (err) {
      el.querySelector('.sheet').innerHTML = `<p class="derr">Zeichnung nicht möglich: ${esc(err.message)}</p>`;
    }
  }
  /* Arbeitsbereich Zeichnung: eigene Werkzeugleiste statt Optionszeile */
  function renderDrawRibbon() {
    const o = drawing.opts;
    const tg = (k, ic, label, on) => `<button type="button" class="fbtn" data-cmd="dopt-toggle" data-k="${k}" aria-pressed="${!!on}" title="${esc(label)} ein/aus" aria-label="${esc(label)}">${icon(ic, 28)}</button>`;
    const cb = (cmd, ic, label, pressed) => `<button type="button" class="fbtn" data-cmd="${cmd}"${pressed != null ? ` aria-pressed="${!!pressed}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${icon(ic, 28)}</button>`;
    const grp = (id, label, inner) => `<div class="fgroup g-${id}"><div class="ftools">${inner}</div><span class="fglabel static">${esc(label)}</span></div>`;
    $('#ribbon').innerHTML = `
      <div class="rtabs">
        <button type="button" class="wsbtn" data-menu="ws">Zeichnung ${ctx.caretSvg}</button>
        <span class="rtab" aria-selected="true">Zeichnung</span>
        ${ctx.doc.kind === 'drawing' ? `<span class="rref" title="${esc(ctx.doc.ref ? 'Verknüpft mit ' + ctx.doc.ref : 'Modell ist in der Zeichnung gespeichert (ohne Verknüpfung)')}">${icon(ctx.doc.modelKind === 'assembly' ? 'component' : 'body', 14)} ${esc(ctx.doc.modelName || '')}${ctx.doc.ref ? '' : ' (Kopie)'}</span>` : ''}
      </div>
      <div class="rbody">
        ${grp('dcreate', 'Erstellen', `<button type="button" class="fbtn" data-menu="dview" aria-pressed="${!!drawing.placing}" title="Basisansicht einfügen" aria-label="Basisansicht einfügen">${icon('insert', 28)}</button>` + tg('iso', 'extrude', 'Isometrische Ansicht', o.iso) + tg('section', 'section', 'Schnittansicht A–A', o.section) + cb('drawing-secview', 'section', 'Schnittansicht mit freier Schnittlinie: zwei Punkte in einer Ansicht, dann die Lage der Ansicht', !!(drawing.secMode && !drawing.secMode.aux)) + cb('drawing-auxview', 'auxview', 'Hilfsansicht: Kante einer schrägen Fläche anklicken, dann die Lage – zeigt die Fläche in wahrer Größe', !!(drawing.secMode && drawing.secMode.aux)) + cb('drawing-detail', 'zoom', 'Detailansicht: Kreis um den Ausschnitt ziehen', drawing.detailMode) + cb('drawing-crop', 'section', 'Zuschneiden: zwei Ecken in einer Ansicht anklicken (zweimal dieselbe Stelle hebt den Zuschnitt auf)', drawing.cropMode) + cb('drawing-breakout', 'breakout', 'Ausbruch: Umriss in einer Ansicht anklicken, Klick auf den ersten Punkt schließt', drawing.breakMode) + (ctx.lastBuild && ctx.lastBuild.sheet ? tg('flat', 'flat', 'Abwicklung', o.flat !== false) : ''))}
        ${grp('dmodify', 'Ändern', cb('drawing-resetviews', 'move', 'Ansichten zurücksetzen: verschobene Ansichten an die Normlage') + cb('drawing-dimclear', 'trash', 'Eigene Maße dieses Blatts löschen'))}
        ${grp('dgeom', 'Geometrie', tg('centers', 'centermark', 'Mittellinien und Mittelpunktmarken', o.centers) + tg('hidden', 'hiddenl', 'Verdeckte Kanten', o.hidden))}
        ${grp('ddim', 'Abmessungen', cb('drawing-dim', 'dim', 'Bemaßung: zwei Punkte anklicken, dann die Lage', drawing.dimMode) + cb('drawing-dimbase', 'dimbase', 'Basislinienbemaßung: Bezugspunkt, dann weitere Punkte, Klick ins Freie legt die Lage fest', !!(drawing.setMode && drawing.setMode.kind === 'base')) + cb('drawing-dimchain', 'dimchain', 'Kettenbemaßung: Punkte der Reihe nach, Klick ins Freie legt die Lage fest', !!(drawing.setMode && drawing.setMode.kind === 'chain')) + cb('drawing-dimord', 'dimord', 'Koordinatenbemaßung: Nullpunkt, dann weitere Punkte, Klick ins Freie legt die Lage fest', !!(drawing.setMode && drawing.setMode.kind === 'ord')) + tg('dims', 'dimall', 'Gesamtmaße', o.dims) + tg('holes', 'hole', 'Bohrungsbeschriftungen', o.holes))}
        ${grp('dtext', 'Text', cb('drawing-text', 'text', 'Text / Hinweis: in einer Ansicht anklicken (mit Hinweislinie) oder auf freies Blatt', drawing.noteMode && drawing.noteMode.kind === 'text'))}
        ${grp('dsym', 'Symbole', cb('drawing-surf', 'surf', 'Oberflächenzeichen: Fläche anklicken, dann Lage', drawing.noteMode && drawing.noteMode.kind === 'surf') + cb('drawing-gdt', 'gdt', 'Form- und Lagetoleranz: Fläche anklicken, dann Lage des Rahmens', drawing.noteMode && drawing.noteMode.kind === 'gdt') + cb('drawing-datum', 'datum', 'Bezug: Fläche anklicken, dann Lage des Buchstabens', drawing.noteMode && drawing.noteMode.kind === 'datum'))}
        ${grp('dinsert', 'Einfügen', cb('drawing-img', 'image', 'Bild einfügen (PNG, JPG, SVG): Datei wählen, dann die Lage auf dem Blatt anklicken', drawing.noteMode && drawing.noteMode.kind === 'image') + cb('drawing-dxfins', 'dxf', 'DXF einfügen (Linien, Kreise, Bögen, Polylinien im Maßstab 1:1): Datei wählen, dann die Lage anklicken', drawing.noteMode && drawing.noteMode.kind === 'dxf'))}
        ${grp('dtable', 'Tabellen', tg('bom', 'bom', 'Stückliste mit Positionsnummern', o.bom) + cb('drawing-revtab', 'revtab', 'Revisionstabelle: Änderung eintragen (Buchstabe, Beschreibung, Datum, Name)') + cb('drawing-holetab', 'holetab', 'Bohrungstabelle: Nullpunkt in einer Ansicht anklicken, dann die Lage der Tabelle', !!(drawing.setMode && drawing.setMode.kind === 'htab')) + (weldRows().length ? tg('weldStd', 'weld', 'Schweißsymbole in den Normansichten (statt an der Iso-Ansicht)', o.weldStd) : ''))}
        <div class="fgroup g-dsheet"><div class="ftools dsheet">
          <label>Format <select data-dopt="format">${Object.keys(SHEETS).map(k => `<option${k === o.format ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
          <label>Maßstab <select data-dopt="scale"><option value="auto"${o.scale === 'auto' ? ' selected' : ''}>Automatisch</option>${SCALES.map(s => `<option value="${s}"${String(s) === String(o.scale) ? ' selected' : ''}>${scaleLabel(s)}</option>`).join('')}</select></label>
          ${o.section ? `<label>Schnitt bei X <input type="number" step="1" class="cutx" data-dopt="cutX" value="${o.cutX ?? ''}" placeholder="Mitte"> mm</label>` : ''}
        </div><span class="fglabel static">Blatt</span></div>
        ${grp('doutput', 'Exportieren', cb('drawing-print', 'print', 'Drucken / als PDF speichern') + cb('drawing-svg', 'save', 'Als SVG speichern') + cb('drawing-dxf', 'save', 'Als DXF speichern (Layer für Kontur, verdeckte Kanten, Mittellinien, Maße, Schraffur)') + cb('drawing-dwg', 'save', 'Als DWG speichern (dasselbe Blatt wie der DXF-Export, binär im Format R12 – für Programme, die DWG lesen)') + cb('drawing-csv', 'bom', 'Stückliste als CSV speichern (dieselben Spalten wie im Fenster Stückliste)'))}
        <div class="fgroup g-dfinish"><div class="ftools"><button type="button" class="fbtn finish stop" data-cmd="drawing-close" title="${ctx.doc.kind === 'drawing' ? 'Zeichnung schließen und das Modell öffnen' : 'Zeichnung schließen'}" aria-label="Zeichnung schließen">${icon('close', 28)}</button></div><span class="fglabel static">${ctx.doc.kind === 'drawing' ? 'Zum Modell' : 'Zeichnung schließen'}</span></div>
      </div>`;
  }
  /* Umschalter der Zeichnung (gleiche Wirkung wie früher die Häkchen) */
  function applyDrawOpt(k) {
    saveDrawingOpts();
    renderDrawRibbon();
    if (k === 'section' || (k === 'cutX' && drawing.opts.section)) {
      const sheet = $('#drawing .sheet');
      if (sheet) sheet.style.opacity = '0.5';
      loadDrawingData().then(() => { if (sheet) sheet.style.opacity = ''; renderDrawing(); }).catch(err => toast('Schnitt nicht möglich: ' + err.message));
      return;
    }
    renderDrawing();
  }
  async function loadDrawingData() {
    const o = drawing.opts;
    const extra = drawSheets().flatMap(x => (x.views || []).map(v => v.view)).concat(drawing.placing ? [drawing.placing] : []);
    const want = [...new Set(['front', 'top', 'left', 'iso', ...extra])];
    const brk = {};
    ((ctx.doc.drawing && ctx.doc.drawing.breakouts) || []).forEach(b => { (brk[b.view] = brk[b.view] || []).push({ id: b.id, pts: b.pts, depth: b.depth }); });
    const secs = {};
    drawSheets().forEach(x => (x.views || []).forEach(v => { if (v.sec) secs[v.view] = v.sec; }));
    drawing.data = await ctx.kernel.drawing(ctx.doc.features, kctx(), want, o.section ? (o.cutX !== '' && o.cutX != null && isFinite(Number(o.cutX)) ? Number(o.cutX) : true) : false, brk, secs);
    drawing.data.bom = computeBom(drawing.data.bodies);
    // Blechteil: Abwicklung mit auf das Blatt
    drawing.data.flat = null;
    if (ctx.lastBuild && ctx.lastBuild.sheet) { try { drawing.data.flat = computeFlat(ctx.doc, sheetRule(), ctx.lastBuild.sheet); } catch (_) { drawing.data.flat = null; } }
  }
  function drawingInfo() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh;
    const mats = new Set();
    let mass = 0;
    if (m) m.bodies.forEach(mb => { const b = bodyInfo(mb.id) || {}, mat = MATERIALS[b.material] || MATERIALS.none; if (mat.rho) { mats.add(mat.label); mass += (mb.volume || 0) / 1000 * mat.rho; } });
    const d = new Date();
    const auto = { name: ctx.doc.kind === 'drawing' ? (ctx.doc.modelName || ctx.doc.name) : ctx.doc.name, material: mats.size ? [...mats].join(', ') : '–', mass: mass ? fmtMass(mass) : '–', date: d.toLocaleDateString('de-DE'), author: 'cantcodecad', number: '', tol: 'ISO 2768-m', rev: '' };
    // Einträge aus „Schriftfeld bearbeiten“ haben Vorrang
    const tb = (ctx.doc.drawing && ctx.doc.drawing.tb) || {};
    const tpl = (ctx.doc.drawing && ctx.doc.drawing.tbTemplate) || 'iso', custom = ctx.doc.drawing && ctx.doc.drawing.tbCustom;
    return { ...auto, ...tb, template: tpl === 'custom' && !custom ? 'iso' : tpl, custom: tpl === 'custom' ? custom : null, revSet: !!tb.rev, extra: (ctx.doc.drawing && ctx.doc.drawing.tbExtra) || [] };
  }
  /* Blätter der Zeichnung: Blatt 1 = Normanordnung + eingefügte Ansichten, weitere Blätter nur eingefügte Ansichten */
  function drawSheets() {
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    if (!Array.isArray(ctx.doc.drawing.sheets) || !ctx.doc.drawing.sheets.length) ctx.doc.drawing.sheets = [{ id: uid(), views: [] }];
    return ctx.doc.drawing.sheets;
  }
  function sheetOpts(i) {
    const sh = drawSheets(), sheet = sh[i] || sh[0];
    const base = { ...drawing.opts, revs: (ctx.doc.drawing && ctx.doc.drawing.revs) || [], info: drawingInfo(), taps: drawingTaps(), welds: weldRows(), extraViews: sheet.views || [], sheetLabel: `${i + 1} / ${sh.length}`, secLines: sh.flatMap(x => (x.views || []).filter(v => v.sec).map(v => v.sec)), ...(drawing.setMode ? { draftPts: drawing.setMode.pts.map(q => ({ view: drawing.setMode.view, u: q[0], v: q[1] })) } : {}), secDraft: drawing.secMode && drawing.secMode.step >= 1 && drawing.secMode.cur ? { parent: drawing.secMode.view, a: drawing.secMode.a, b: drawing.secMode.cur, ...(drawing.secMode.pts && drawing.secMode.pts.length >= 3 ? { line: drawing.secMode.pts } : {}) } : null };
    if (i > 0) return { ...base, noStd: true, crops: sheet.crops || [], sheetScale: sheet.scale || drawing.mainScale || 1, notes: sheet.notes || [], userDims: sheet.dims || [], details: sheet.details || [], holeTables: sheet.htabs || [], draft: drawing.dimMode ? drawing.draft : null };
    return { ...base, crops: (ctx.doc.drawing && ctx.doc.drawing.crops) || [], notes: (ctx.doc.drawing && ctx.doc.drawing.notes) || [], offsets: (ctx.doc.drawing && ctx.doc.drawing.offsets) || {}, details: (ctx.doc.drawing && ctx.doc.drawing.details) || [], holeTables: (ctx.doc.drawing && ctx.doc.drawing.htabs) || [], userDims: (ctx.doc.drawing && ctx.doc.drawing.dims) || [], draft: drawing.dimMode ? drawing.draft : null };
  }
  function renderSheetTabs(el) {
    const sh = drawSheets();
    let bar = el.querySelector('.sheettabs');
    if (!bar) { bar = document.createElement('div'); bar.className = 'sheettabs'; el.appendChild(bar); }
    bar.innerHTML = sh.map((x, i) => `<button type="button" class="stab" data-cmd="dsheet" data-i="${i}" aria-selected="${i === drawing.sheet}" title="Rechtsklick: Blatt löschen">Blatt ${i + 1}</button>`).join('')
      + '<button type="button" class="stab add" data-cmd="dsheet-add" title="Neues Blatt" aria-label="Neues Blatt">+</button>';
  }
  function renderDrawing() {
    const el = $('#drawing');
    if (!el || !drawing.data) return;
    const sh = drawSheets();
    if (!(drawing.sheet >= 0 && drawing.sheet < sh.length)) drawing.sheet = 0;
    const r = renderSheet(drawing.data, sheetOpts(drawing.sheet));
    if (drawing.sheet === 0) drawing.mainScale = r.scale;
    drawing.last = r;
    renderSheetTabs(el);
    el.querySelector('.sheet').innerHTML = r.svg;
    const svg = el.querySelector('.sheet svg');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('translate', 'no'); // Blattinhalt gehört zum Dokument (wie PDF/DXF), die Sprache der Oberfläche ändert ihn nicht
    svg.style.aspectRatio = `${r.W} / ${r.H}`;
    setStatus(`Zeichnung ${drawing.opts.format} · Maßstab ${scaleLabel(r.scale)}`);
  }
  /* ---------- Einzelmaße in der Zeichnung ---------- */
  function saveDrawingOpts() {
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: {}, dims: [] };
    ctx.doc.drawing.opts = { ...drawing.opts };
    store();
  }
  function sheetPoint(e) {
    const svg = $('#drawing .sheet svg');
    if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  }
  /* Maße/Einzelheiten des aktuellen Blatts (Blatt 1 wie bisher in doc.drawing, weitere im Blatt selbst) */
  function curDims() {
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    if (!drawing.sheet) return (ctx.doc.drawing.dims = ctx.doc.drawing.dims || []);
    const sh = drawSheets()[drawing.sheet]; return (sh.dims = sh.dims || []);
  }
  function setCurDims(a) { if (!drawing.sheet) ctx.doc.drawing.dims = a; else drawSheets()[drawing.sheet].dims = a; }
  function curDetails() {
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    if (!drawing.sheet) return (ctx.doc.drawing.details = ctx.doc.drawing.details || []);
    const sh = drawSheets()[drawing.sheet]; return (sh.details = sh.details || []);
  }
  function curNotes() {
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    if (!drawing.sheet) return (ctx.doc.drawing.notes = ctx.doc.drawing.notes || []);
    const sh = drawSheets()[drawing.sheet]; return (sh.notes = sh.notes || []);
  }
  function setCurNotes(a) { if (!drawing.sheet) ctx.doc.drawing.notes = a; else drawSheets()[drawing.sheet].notes = a; }
  function curHtabs() {
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    if (!drawing.sheet) return (ctx.doc.drawing.htabs = ctx.doc.drawing.htabs || []);
    const sh = drawSheets()[drawing.sheet]; return (sh.htabs = sh.htabs || []);
  }
  function setCurHtabs(a) { if (!drawing.sheet) ctx.doc.drawing.htabs = a; else drawSheets()[drawing.sheet].htabs = a; }
  function setCurDetails(a) { if (!drawing.sheet) ctx.doc.drawing.details = a; else drawSheets()[drawing.sheet].details = a; }
  const dView = k => drawing.data.views[(drawing.last && drawing.last.viewOf && drawing.last.viewOf[k]) || k];
  function toViewUV(view, x, y) {
    const pl = drawing.last && drawing.last.places[view], v = dView(view);
    if (!pl || !v || !v.bb) return null;
    return [(x - pl.px) / pl.s + v.bb[0][0], v.bb[1][1] - (y - pl.py) / pl.s];
  }
  function placementFor(p, a, b) {
    const uv = toViewUV(a.view, p[0], p[1]);
    if (!uv) return null;
    const [u0, u1] = [Math.min(a.u, b.u), Math.max(a.u, b.u)], [v0, v1] = [Math.min(a.v, b.v), Math.max(a.v, b.v)];
    const du = uv[0] < u0 ? u0 - uv[0] : uv[0] > u1 ? uv[0] - u1 : 0, dv = uv[1] < v0 ? v0 - uv[1] : uv[1] > v1 ? uv[1] - v1 : 0;
    // zwischen den Punkten (weder darüber/darunter noch daneben) und schräge Lage → paralleles Maß
    if (du === 0 && dv === 0 && Math.abs(a.u - b.u) > 1e-6 && Math.abs(a.v - b.v) > 1e-6) {
      const L = Math.hypot(b.u - a.u, b.v - a.v), nx = -(b.v - a.v) / L, ny = (b.u - a.u) / L;
      return { id: 'pv', view: a.view, a: [a.u, a.v], b: [b.u, b.v], dir: 'a', at: (uv[0] - a.u) * nx + (uv[1] - a.v) * ny };
    }
    let dir = dv >= du ? 'h' : 'v';
    if (dir === 'h' && Math.abs(a.u - b.u) < 1e-6) dir = 'v';
    if (dir === 'v' && Math.abs(a.v - b.v) < 1e-6) dir = 'h';
    return { id: 'pv', view: a.view, a: [a.u, a.v], b: [b.u, b.v], dir, at: dir === 'h' ? uv[1] : uv[0] };
  }
  let dimRaf = 0;
  /* Schnittansicht mit freier Schnittlinie: 1./2. Klick = Linie in einer Normalansicht, 3. Klick = Lage der Ansicht */
  function secViews() { const vo = (drawing.last && drawing.last.viewOf) || {}; return [...Object.keys(vo).filter(k => !vo[k].startsWith('iso') && !vo[k].startsWith('sec:')), ...(drawing.sheet ? [] : ['front', 'top', 'left'])]; }
  function secPoint(S, p, uv, anchor) {
    // Fangpunkt in derselben Ansicht, sonst waagerecht/senkrecht einrasten (±3°)
    let best = null, bd = 3;
    drawing.last.snaps.forEach(sn => { if (sn.view !== S.view) return; const d = Math.hypot(sn.x - p[0], sn.y - p[1]); if (d < bd) { bd = d; best = sn; } });
    if (best) return [best.u, best.v];
    const A = anchor || S.a;
    if (!A) return uv;
    const du = uv[0] - A[0], dv = uv[1] - A[1], t = Math.tan(3 * Math.PI / 180);
    if (Math.abs(du) <= t * Math.abs(dv)) return [A[0], uv[1]];
    if (Math.abs(dv) <= t * Math.abs(du)) return [uv[0], A[1]];
    return uv;
  }
  async function secClick(p, shift) {
    if (!p) return;
    const S = drawing.secMode, r2 = v => Math.round(v * 1000) / 1000;
    if (S.step === 0 && S.aux) {
      // Hilfsansicht: gerade Kante (Linie) in einer Normalansicht
      const keys = new Set(secViews());
      let best = null, bd = 1.5;
      (drawing.last.lines || []).forEach(l => { if (!keys.has(l.view)) return; const vx = l.x2 - l.x1, vy = l.y2 - l.y1, ll = vx * vx + vy * vy || 1, tt = Math.max(0, Math.min(1, ((p[0] - l.x1) * vx + (p[1] - l.y1) * vy) / ll)), d = Math.hypot(l.x1 + vx * tt - p[0], l.y1 + vy * tt - p[1]); if (d < bd) { bd = d; best = l; } });
      if (!best) { toast('Bitte eine gerade Kante der schrägen Fläche in einer Normalansicht anklicken.'); return; }
      S.view = best.view; S.a = best.a.slice(); S.b = best.b.slice(); S.cur = S.b; S.pts = [S.a, S.b]; S.step = 2;
      renderDrawing();
      toast('Jetzt die Lage der Hilfsansicht anklicken. Geblickt wird senkrecht auf die Kante, zu dieser Seite hin.');
      return;
    }
    if (S.step === 0) {
      const hit = secViews().find(k => { const uv = toViewUV(k, p[0], p[1]), v = dView(k), g = 5 / ((drawing.last.places[k] || {}).s || 1); return uv && v && v.bb && uv[0] >= v.bb[0][0] - g && uv[0] <= v.bb[1][0] + g && uv[1] >= v.bb[0][1] - g && uv[1] <= v.bb[1][1] + g; });
      if (!hit) { toast('Bitte in eine Normalansicht klicken (keine Isometrie, keine Schnittansicht).'); return; }
      S.view = hit; S.a = secPoint({ view: hit }, p, toViewUV(hit, p[0], p[1])); S.pts = [S.a]; S.step = 1;
      toast('Jetzt das Ende der Schnittlinie anklicken.');
      return;
    }
    if (S.step >= 1 && shift && !S.aux && S.pts.length >= 2) {
      // Absetzung: der neue Abschnitt steht senkrecht auf dem letzten
      const uv = toViewUV(S.view, p[0], p[1]);
      if (!uv) return;
      const last = S.pts[S.pts.length - 1], prev = S.pts[S.pts.length - 2];
      if (S.pts.length >= 11) { toast('Mehr als neun Absetzungen sind nicht möglich.'); return; }
      const q = secPoint(S, p, uv, last), du = last[0] - prev[0], dv = last[1] - prev[1];
      const b = Math.abs(dv) >= Math.abs(du) ? [q[0], last[1]] : [last[0], q[1]];
      if (Math.abs(b[0] - last[0]) < 1 && Math.abs(b[1] - last[1]) < 1) { toast('Die Absetzung ist zu kurz.'); return; }
      S.pts.push(b.map(v => Math.round(v * 1000) / 1000)); S.cur = b; S.step = 2;
      renderDrawing();
      toast(`Absetzung ${S.pts.length - 2} gesetzt. Weitere Absetzungen mit Umschalt+Klick, ohne Umschalttaste die Lage der Schnittansicht anklicken.`);
      return;
    }
    if (S.step === 1) {
      const uv = toViewUV(S.view, p[0], p[1]);
      if (!uv) return;
      const b = secPoint(S, p, uv);
      if (Math.hypot(b[0] - S.a[0], b[1] - S.a[1]) < 1) { toast('Die Schnittlinie ist zu kurz.'); return; }
      S.b = b; S.cur = b; S.pts.push(b); S.step = 2;
      renderDrawing();
      toast('Jetzt die Lage der Schnittansicht anklicken. Geblickt wird zu dieser Seite hin. Mit Umschalt+Klick folgt eine Absetzung.');
      return;
    }
    const uv = toViewUV(S.view, p[0], p[1]);
    if (!uv) return;
    const du = S.b[0] - S.a[0], dv = S.b[1] - S.a[1], m = [-dv, du], ml = Math.hypot(...m);
    // Schnitt: geblickt wird zur Seite, auf die die Ansicht gelegt wird. Hilfsansicht: immer von außen auf die Fläche
    // (Pfeil zeigt zur Mitte der Ausgangsansicht), die Ansicht selbst darf irgendwo liegen.
    const pb = dView(S.view).bb, toward = S.aux ? [(pb[0][0] + pb[1][0]) / 2, (pb[0][1] + pb[1][1]) / 2] : uv;
    const sg = Math.sign(m[0] * (toward[0] - (S.a[0] + S.b[0]) / 2) + m[1] * (toward[1] - (S.a[1] + S.b[1]) / 2)) || 1;
    const used = new Set(drawSheets().flatMap(x => (x.views || []).filter(v => v.sec).map(v => v.sec.label)));
    const label = 'BCDEFGHJKLMNPRSTUVW'.split('').find(c => !used.has(c)) || 'Z';
    const vo = drawing.last.viewOf || {}, id = uid(), sh = drawSheets()[drawing.sheet];
    const sc = drawing.sheet === 0 ? (drawing.last.scale || 1) : (sh.scale || drawing.mainScale || 1);
    const ev = { id, view: 'sec:' + id, x: p[0], y: p[1], scale: sc, sec: { parent: S.view, pview: vo[S.view] || S.view, a: S.a.map(r2), b: S.b.map(r2), ...(S.pts.length >= 3 ? { line: S.pts.map(q => q.map(r2)) } : {}), arrow: [r2(m[0] * sg / ml), r2(m[1] * sg / ml)], label, ...(S.aux ? { aux: true } : {}) } };
    drawing.secMode = null;
    pushHistory();
    (sh.views = sh.views || []).push(ev);
    renderDrawRibbon();
    const el = $('#drawing .sheet'); if (el) el.style.opacity = '0.5';
    try { await loadDrawingData(); } catch (err) { toast('Schnittansicht nicht möglich: ' + err.message); } finally { if (el) el.style.opacity = ''; }
    const sv = drawing.data && drawing.data.views[ev.view];
    if (!sv || !sv.bb) { sh.views = sh.views.filter(v => v !== ev); toast(S.aux ? 'Hilfsansicht nicht möglich.' : 'Die Schnittlinie trifft das Teil nicht.'); renderDrawing(); return; }
    // Ansicht mittig an die angeklickte Stelle
    ev.x = Math.round((p[0] - (sv.bb[1][0] - sv.bb[0][0]) * sc / 2) * 2) / 2; ev.y = Math.round((p[1] - (sv.bb[1][1] - sv.bb[0][1]) * sc / 2) * 2) / 2;
    store();
    renderDrawing();
    toast(`${S.aux ? `Ansicht ${label}` : `Schnitt ${label}–${label}`} angelegt. Rechtsklick auf die Ansicht: Maßstab oder löschen.`);
  }
  /* Basislinien-, Ketten- und Koordinatenbemaßung: Punkte sammeln, Klick ins Freie = Lage */
  function setDimClick(p) {
    if (!p) return;
    const S = drawing.setMode;
    if (S.kind === 'htab' && S.pts.length) {
      // Bohrungstabelle: zweiter Klick legt die linke obere Ecke der Tabelle fest
      const v = dView(S.view), rows = v ? holeRows(v, S.pts[0], drawingTaps()) : [];
      if (!rows.length) { toast('In dieser Ansicht sind keine Bohrungen zu sehen.'); drawing.setMode = { kind: 'htab', view: null, pts: [] }; renderDrawing(); return; }
      pushHistory();
      curHtabs().push({ id: uid(), view: S.view, o: S.pts[0].map(q => Math.round(q * 1e4) / 1e4), at: [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2] });
      store();
      drawing.setMode = null;
      renderDrawRibbon(); renderDrawing();
      toast(`Bohrungstabelle mit ${rows.length} Bohrung${rows.length === 1 ? '' : 'en'} angelegt. Klick auf die Überschrift: löschen.`);
      return;
    }
    let best = null, bd = 3;
    drawing.last.snaps.forEach(sn => { if (S.view && sn.view !== S.view) return; const d = Math.hypot(sn.x - p[0], sn.y - p[1]); if (d < bd) { bd = d; best = sn; } });
    if (best) {
      if (!S.view) S.view = best.view;
      if (!S.pts.some(q => Math.abs(q[0] - best.u) < 1e-6 && Math.abs(q[1] - best.v) < 1e-6)) S.pts.push([best.u, best.v]);
      renderDrawing();
      if (S.kind === 'htab') toast('Jetzt die Lage der Tabelle anklicken (linke obere Ecke).');
      return;
    }
    if (S.kind === 'htab') { toast('Zuerst den Nullpunkt (Eck- oder Mittelpunkt) in einer Ansicht anklicken.'); return; }
    if (S.pts.length < 2) { toast(S.pts.length ? 'Noch mindestens einen weiteren Punkt anklicken.' : 'Einen Eckpunkt in einer Ansicht anklicken.'); return; }
    const uv = toViewUV(S.view, p[0], p[1]);
    if (!uv) return;
    const pl = drawing.last.places[S.view], gap = 7 / pl.s, r2 = v => Math.round(v * 1e4) / 1e4;
    const us = S.pts.map(q => q[0]), vs = S.pts.map(q => q[1]);
    const du = uv[0] < Math.min(...us) ? Math.min(...us) - uv[0] : uv[0] > Math.max(...us) ? uv[0] - Math.max(...us) : 0;
    const dv = uv[1] < Math.min(...vs) ? Math.min(...vs) - uv[1] : uv[1] > Math.max(...vs) ? uv[1] - Math.max(...vs) : 0;
    const dir = dv >= du ? 'h' : 'v', k = dir === 'h' ? 0 : 1, at = uv[1 - k], out = (dir === 'h' ? uv[1] > Math.max(...vs) : uv[0] > Math.max(...us)) ? 1 : -1;
    const pts = S.pts.map(q => q.map(r2)), dims = [];
    if (S.kind === 'chain') {
      const sorted = pts.slice().sort((a, b) => a[k] - b[k]).filter((q, i, A) => i === 0 || Math.abs(q[k] - A[i - 1][k]) > 1e-6);
      for (let i = 1; i < sorted.length; i++) dims.push({ id: uid(), view: S.view, a: sorted[i - 1], b: sorted[i], dir, at: r2(at) });
    } else if (S.kind === 'base') {
      const b0 = pts[0], rest = pts.slice(1).filter(q => Math.abs(q[k] - b0[k]) > 1e-6).sort((a, b) => Math.abs(a[k] - b0[k]) - Math.abs(b[k] - b0[k]));
      rest.forEach((q, i) => dims.push({ id: uid(), view: S.view, a: b0, b: q, dir, at: r2(at + out * i * gap) }));
    } else {
      // Koordinaten: Texte entlang der Messrichtung mindestens 4 mm (Blatt) auseinander
      const o = pts[0], step = 4 / pl.s, sorted = pts.slice().sort((a, b) => a[k] - b[k]);
      const tpos = sorted.map(q => q[k]);
      for (let i = 1; i < tpos.length; i++) if (tpos[i] - tpos[i - 1] < step) tpos[i] = tpos[i - 1] + step;
      // zurück zur Mitte schieben, damit die Gruppe nicht nur in eine Richtung wandert
      const shift = (tpos.reduce((s, v) => s + v, 0) - sorted.reduce((s, q) => s + q[k], 0)) / tpos.length;
      sorted.forEach((q, i) => dims.push({ id: uid(), view: S.view, kind: 'ord', o, p: q, dir, at: r2(at), t: r2(tpos[i] - shift) }));
    }
    if (!dims.length) { toast('Die Punkte liegen in dieser Richtung übereinander – keine Maße.'); return; }
    pushHistory();
    curDims().push(...dims);
    store();
    drawing.setMode = { kind: S.kind, view: null, pts: [] };
    renderDrawing();
    toast(`${dims.length} Maß${dims.length === 1 ? '' : 'e'} angelegt. Weitere Reihe anklicken oder Esc.`);
  }
  const DETAIL_SCALES = [0.2, 0.5, 1, 2, 5, 10, 20, 50];
  /* Einzelheit anlegen: 1. Klick = Mitte in einer Ansicht, 2. Klick = Lage auf dem Blatt */
  /* Zuschneideansicht: zwei Ecken in derselben Normalansicht; zweimal dieselbe Stelle = Zuschnitt aufheben */
  function cropClick(p) {
    if (!p) return;
    const C = drawing.cropMode;
    const vo = (drawing.last && drawing.last.viewOf) || {};
    const keys = [...Object.keys(vo).filter(k => !vo[k].startsWith('iso')), ...(drawing.sheet ? [] : ['front', 'top', 'left'])];
    const inView = k => { const uv = toViewUV(k, p[0], p[1]), v = dView(k); return uv && v && v.bb && uv[0] >= v.bb[0][0] - 1 && uv[0] <= v.bb[1][0] + 1 && uv[1] >= v.bb[0][1] - 1 && uv[1] <= v.bb[1][1] + 1; };
    const list = drawing.sheet ? (drawSheets()[drawing.sheet].crops = drawSheets()[drawing.sheet].crops || []) : (ctx.doc.drawing.crops = ctx.doc.drawing.crops || []);
    if (!C.view) {
      const hit = keys.find(inView);
      if (!hit) { toast('Bitte in eine Normalansicht klicken.'); return; }
      C.view = hit; C.a = toViewUV(hit, p[0], p[1]);
      toast('Jetzt die gegenüberliegende Ecke anklicken.');
      return;
    }
    const b = toViewUV(C.view, p[0], p[1]);
    pushHistory();
    const keep = list.filter(c => c.view !== C.view);
    if (Math.hypot(b[0] - C.a[0], b[1] - C.a[1]) < 0.5) {
      list.length = 0; keep.forEach(c => list.push(c));
      toast('Zuschnitt aufgehoben.');
    } else {
      list.length = 0; keep.forEach(c => list.push(c));
      list.push({ id: uid(), view: C.view, box: [[Math.min(C.a[0], b[0]), Math.min(C.a[1], b[1])], [Math.max(C.a[0], b[0]), Math.max(C.a[1], b[1])]].map(q => q.map(v => Math.round(v * 100) / 100)) });
    }
    store();
    drawing.cropMode = null;
    renderDrawRibbon();
    renderDrawing();
  }
  function detailClick(p) {
    if (!p) return;
    const D = drawing.detailMode;
    if (D.step === 0) {
      const vo = (drawing.last && drawing.last.viewOf) || {};
      const keys = [...Object.keys(vo).filter(k => !vo[k].startsWith('iso')), ...(drawing.sheet ? [] : ['front', 'top', 'left'])];
      const hit = keys.find(k => { const uv = toViewUV(k, p[0], p[1]), v = dView(k); return uv && v && v.bb && uv[0] >= v.bb[0][0] - 1 && uv[0] <= v.bb[1][0] + 1 && uv[1] >= v.bb[0][1] - 1 && uv[1] <= v.bb[1][1] + 1; });
      if (!hit) { toast('Bitte in eine Normalansicht klicken (keine Isometrie).'); return; }
      const v = dView(hit);
      D.view = hit; D.c = toViewUV(hit, p[0], p[1]); D.r = Math.max(2, 0.12 * Math.min(v.bb[1][0] - v.bb[0][0], v.bb[1][1] - v.bb[0][1]));
      D.step = 1;
      toast('Jetzt die Stelle für die vergrößerte Einzelheit anklicken.');
      return;
    }
    const s = drawing.last.places[D.view].s;
    // Gesamtmaßstab der Einzelheit als Normmaßstab, mindestens doppelt so groß wie die Ansicht
    const std = DETAIL_SCALES.filter(q => q >= 2 * s - 1e-9);
    const S = std.length ? std.reduce((a, q) => (Math.abs(2 * D.r * q - 40) < Math.abs(2 * D.r * a - 40) ? q : a), std[0]) : 2 * s;

    const used = new Set(drawSheets().flatMap((x, i) => (i ? x.details || [] : (ctx.doc.drawing.details || []))).map(d => d.label));
    const label = 'ZYXWVUTSRQ'.split('').find(c => !used.has(c)) || 'Z';
    pushHistory();
    curDetails().push({ id: uid(), view: D.view, c: D.c, r: D.r, S, at: p, label });
    store();
    drawing.detailMode = null;
    const b = $('#drawing [data-cmd="drawing-detail"]'); if (b) b.setAttribute('aria-pressed', 'false');
    renderDrawing();
    toast(`Einzelheit ${label} angelegt. Klick auf den Buchstaben ändert Maßstab und Größe.`);
  }
  /* Bild oder DXF aufs Blatt (Zeichnung → Einfügen): Datei wählen, dann Lage anklicken */
  function insertOnSheet(kind) {
    if (drawing.noteMode && drawing.noteMode.kind === kind) { drawing.noteMode = null; renderDrawRibbon(); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = kind === 'image' ? '.png,.jpg,.jpeg,.gif,.webp,.svg' : '.dxf';
    inp.hidden = true;
    inp.id = 'sheetfile';
    const old = document.getElementById('sheetfile'); if (old) old.remove();
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      try {
        const data = kind === 'image' ? await imageData(f) : dxfData(await f.text(), f.name);
        drawing.secMode = null; drawing.setMode = null; drawing.breakMode = null; drawing.detailMode = null; drawing.dimMode = false;
        drawing.noteMode = { kind, data };
        renderDrawRibbon();
        toast(`${kind === 'image' ? 'Bild' : 'DXF'} „${f.name}“: jetzt die Lage (linke obere Ecke) auf dem Blatt anklicken. Esc bricht ab.`, 6000);
      } catch (err) { toast(`${kind === 'image' ? 'Bild' : 'DXF'} nicht lesbar: ${err.message}`, 6000); }
    });
    inp.click();
    return inp;
  }
  async function imageData(f) {
    if (f.size > 2e6) throw new Error('größer als 2 MB (das Bild wird in der Zeichnung gespeichert)');
    const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Datei nicht lesbar')); r.readAsDataURL(f); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('kein Bild')); i.src = src; });
    const ar = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1, w = 50;
    return { src, w, h: Math.round(w * ar * 10) / 10, name: f.name.slice(0, 80) };
  }
  /* DXF → ein SVG-Pfad in Blatt-mm (y nach unten, linke obere Ecke bei 0/0); Hilfs-/Biegelinien weglassen */
  function dxfData(text, name) {
    const { sketch } = dxfToSketch(text, ORIGIN_PLANES.XY, name);
    const P = new Map(sketch.points.map(q => [q.id, q]));
    const cur = sketch.curves.filter(c => !c.cons);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, -y); y1 = Math.max(y1, -y); };
    cur.forEach(c => {
      if (c.type === 'circle' || c.type === 'arc') { const m = P.get(c.c); grow(m.x - c.r, m.y - c.r); grow(m.x + c.r, m.y + c.r); }
      else if (c.type === 'line') { [c.p1, c.p2].forEach(i => grow(P.get(i).x, P.get(i).y)); }
      else if (c.type === 'spline') c.pts.forEach(i => grow(P.get(i).x, P.get(i).y));
    });
    if (!isFinite(x0)) throw new Error('keine Linien, Kreise oder Bögen');
    const r3 = v => Math.round(v * 1000) / 1000;
    const X = x => r3(x - x0), Y = y => r3(-y - y0);
    const d = cur.map(c => {
      if (c.type === 'line') { const a = P.get(c.p1), b = P.get(c.p2); return `M${X(a.x)} ${Y(a.y)}L${X(b.x)} ${Y(b.y)}`; }
      if (c.type === 'circle') { const m = P.get(c.c); return `M${X(m.x + c.r)} ${Y(m.y)}A${r3(c.r)} ${r3(c.r)} 0 1 0 ${X(m.x - c.r)} ${Y(m.y)}A${r3(c.r)} ${r3(c.r)} 0 1 0 ${X(m.x + c.r)} ${Y(m.y)}`; }
      if (c.type === 'arc') { const a = P.get(c.s), b = P.get(c.e); let sw = c.a1 - c.a0; while (sw <= 0) sw += Math.PI * 2; return `M${X(a.x)} ${Y(a.y)}A${r3(c.r)} ${r3(c.r)} 0 ${sw > Math.PI ? 1 : 0} 0 ${X(b.x)} ${Y(b.y)}`; }
      if (c.type === 'spline') { const q = c.pts.map(i => P.get(i)); return `M${q.map(p => `${X(p.x)} ${Y(p.y)}`).join('L')}${c.closed ? 'Z' : ''}`; }
      return '';
    }).join('');
    return { d, w: r3(x1 - x0), h: r3(y1 - y0), scale: 1, name: String(name || '').slice(0, 80) };
  }
  /* Symbole (Oberfläche, Toleranzrahmen, Bezug): 1. Klick = Stelle an der Fläche, 2. Klick = Lage des Zeichens */
  function noteClick(p, ev) {
    if (!p) return;
    const N = drawing.noteMode;
    if (N.kind === 'image' || N.kind === 'dxf') {
      // linke obere Ecke an die angeklickte Stelle
      const nt = { id: uid(), kind: N.kind, view: null, at: p.map(v => Math.round(v * 10) / 10), off: [0, 0], ...N.data };
      pushHistory(); curNotes().push(nt); store();
      drawing.noteMode = null; renderDrawRibbon(); renderDrawing();
      toast(`${N.kind === 'image' ? 'Bild' : 'DXF'} eingefügt. Mit der Maus verschieben, Klick darauf ändert die Größe.`);
      return;
    }
    if (N.kind === 'text' && !N.at && !viewAtSheet(p)) {
      const nt = { id: uid(), kind: 'text', view: null, at: p.map(v => Math.round(v * 10) / 10), off: [0, 0], text: 'Text', size: 3.5 };
      pushHistory(); curNotes().push(nt); store();
      drawing.noteMode = null; renderDrawRibbon(); renderDrawing(); openNoteEditor(nt.id, ev);
      return;
    }
    if (!N.at) {
      const k = viewAtSheet(p), vo = (drawing.last && drawing.last.viewOf) || {};
      if (!k || (N.kind !== 'text' && (vo[k] || k).startsWith('iso'))) { toast('Bitte eine Kante in einer Normalansicht anklicken.'); return; }
      let best = null, bd = 2.5;
      (drawing.last.snaps || []).forEach(sn => { const d = Math.hypot(sn.x - p[0], sn.y - p[1]); if (sn.view === k && d < bd) { bd = d; best = sn; } });
      const uv = best ? [best.u, best.v] : toViewUV(k, p[0], p[1]);
      if (!uv) return;
      N.view = k; N.at = uv; N.p = best ? [best.x, best.y] : p;
      toast(N.kind === 'text' ? 'Jetzt die Lage des Textes anklicken.' : 'Jetzt die Lage des Zeichens anklicken.');
      return;
    }
    const used = new Set(curNotes().filter(x => x.kind === 'datum').map(x => x.letter));
    const base = { id: uid(), kind: N.kind, view: N.view, at: N.at.map(v => Math.round(v * 1000) / 1000), off: [Math.round((p[0] - N.p[0]) * 10) / 10, Math.round((p[1] - N.p[1]) * 10) / 10] };
    const nt = N.kind === 'text' ? { ...base, text: 'Text', size: 3.5, leader: true }
      : N.kind === 'surf' ? { ...base, param: 'Ra', value: 3.2, proc: 'mrr', text: '' }
      : N.kind === 'datum' ? { ...base, letter: 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('').find(c => !used.has(c)) || 'A' }
        : { ...base, char: 'flat', value: 0.05, dia: false, datums: '' };
    pushHistory();
    curNotes().push(nt);
    store();
    drawing.noteMode = null;
    renderDrawRibbon();
    renderDrawing();
    openNoteEditor(nt.id, ev);
  }
  function openNoteEditor(id, ev) {
    const nt = curNotes().find(x => x.id === id);
    if (!nt) return;
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
    let body = '';
    if (nt.kind === 'image') {
      body = `<b>Bild${nt.name ? ' · ' + esc(nt.name) : ''}</b>
        <label>Breite <input type="text" inputmode="decimal" data-ne="w" value="${fmt(nt.w, 1)}"> mm</label>
        <p class="info small">Die Höhe folgt dem Seitenverhältnis (${fmt(nt.h, 1)} mm). Mit der Maus verschieben.</p>`;
    } else if (nt.kind === 'dxf') {
      body = `<b>DXF${nt.name ? ' · ' + esc(nt.name) : ''}</b>
        <label>Maßstab <select data-ne="scale">${[[2, '2:1'], [1, '1:1'], [0.5, '1:2'], [0.2, '1:5'], [0.1, '1:10'], [0.05, '1:20']].map(([q, l]) => opt(q, l, nt.scale || 1)).join('')}</select></label>
        <p class="info small">${fmt(nt.w, 1)} × ${fmt(nt.h, 1)} mm in der Datei. Mit der Maus verschieben.</p>`;
    } else if (nt.kind === 'text') {
      body = `<b>Text</b>
        <label class="col">Inhalt<textarea data-ne="text" rows="3">${esc(nt.text || '')}</textarea></label>
        <label>Schrifthöhe <select data-ne="size">${[2.5, 3.5, 5, 7].map(q => opt(q, `${fmt(q, 1)} mm`, nt.size || 3.5)).join('')}</select></label>
        ${nt.view ? `<label class="chk"><input type="checkbox" data-ne="leader"${nt.leader !== false ? ' checked' : ''}> Hinweislinie mit Pfeil</label>` : ''}
        <p class="info small">Mehrere Zeilen mit Enter. Den Text kann man mit der Maus verschieben.</p>`;
    } else if (nt.kind === 'surf') {
      body = `<b>Oberflächenzeichen</b>
        <label>Kenngröße <select data-ne="param">${['Ra', 'Rz', 'Rmax'].map(q => opt(q, q, nt.param)).join('')}</select></label>
        <label>Wert <input type="text" inputmode="decimal" data-ne="value" value="${fmt(nt.value, 3)}"> µm</label>
        <label>Bearbeitung <select data-ne="proc">${opt('any', 'beliebig', nt.proc)}${opt('mrr', 'spanend (Material abtragen)', nt.proc)}${opt('nmr', 'ohne Materialabtrag', nt.proc)}</select></label>
        <label>Verfahren <input type="text" data-ne="text" value="${esc(nt.text || '')}" placeholder="z. B. geschliffen"></label>`;
    } else if (nt.kind === 'datum') {
      body = `<b>Bezug</b><label>Buchstabe <input type="text" maxlength="2" data-ne="letter" value="${esc(nt.letter || 'A')}"></label>`;
    } else {
      body = `<b>Form- und Lagetoleranz</b>
        <label>Eigenschaft <select data-ne="char">${Object.entries(GDT).map(([k, l]) => opt(k, l, nt.char)).join('')}</select></label>
        <label>Toleranz <input type="text" inputmode="decimal" data-ne="value" value="${fmt(nt.value, 3)}"> mm</label>
        <label class="chk"><input type="checkbox" data-ne="dia"${nt.dia ? ' checked' : ''}> Durchmesser ⌀ (zylindrische Zone)</label>
        <label>Bezüge <input type="text" data-ne="datums" value="${esc(nt.datums || '')}" placeholder="z. B. A B"></label>
        <p class="info small">Bezüge gelten für Richtungs-, Orts- und Lauftoleranzen.</p>`;
    }
    box.innerHTML = body + `<div class="debtns"><button type="button" class="btn primary" data-ne="ok">OK</button><button type="button" class="btn" data-ne="del">Löschen</button><button type="button" class="btn" data-ne="x">Abbrechen</button></div>`;
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(ev.clientX - r.left, r.width - 270)) + 'px';
    box.style.top = Math.max(6, Math.min(ev.clientY - r.top + 10, r.height - 260)) + 'px';
    box.hidden = false;
    box.onchange = null;
    box.onclick = e2 => {
      const a = e2.target.dataset.ne;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'del') { pushHistory(); setCurNotes(curNotes().filter(x => x.id !== id)); store(); box.hidden = true; renderDrawing(); return; }
      if (a !== 'ok') return;
      pushHistory();
      box.querySelectorAll('[data-ne]').forEach(inp => {
        const k = inp.dataset.ne;
        if (!['param', 'value', 'proc', 'text', 'letter', 'char', 'dia', 'datums', 'size', 'leader', 'w', 'scale'].includes(k)) return;
        if (k === 'w') { const v = parseFloat(String(inp.value).replace(',', '.')); if (isFinite(v) && v > 0) { nt.h = nt.h * v / (nt.w || v); nt.w = v; } }
        else if (k === 'scale') nt.scale = Number(inp.value) || 1;
        else if (k === 'dia') nt.dia = inp.checked;
        else if (k === 'leader') nt.leader = inp.checked;
        else if (k === 'size') nt.size = Number(inp.value) || 3.5;
        else if (k === 'text' && nt.kind === 'text') nt.text = String(inp.value).replace(/\r/g, '').slice(0, 2000) || 'Text';
        else if (k === 'value') { const v = parseFloat(String(inp.value).replace(',', '.')); if (isFinite(v)) nt.value = v; }
        else if (k === 'letter') nt.letter = String(inp.value).toUpperCase().slice(0, 2) || 'A';
        else nt[k] = inp.value;
      });
      if (nt.kind === 'gdt' && !GDT_DATUM.has(nt.char)) nt.datums = '';
      store(); box.hidden = true; renderDrawing();
    };
  }
  /* Ausbruch: Umriss in einer Normalansicht anklicken, Tiefe ab der Vorderkante */
  function breakClick(p) {
    if (!p) return;
    const B = drawing.breakMode;
    const vo = (drawing.last && drawing.last.viewOf) || {};
    if (!B.key) {
      const keys = [...Object.keys(vo).filter(k => !vo[k].startsWith('iso')), ...(drawing.sheet ? [] : ['front', 'top', ...(drawing.opts.section ? [] : ['left'])])];
      const hit = keys.find(k => { const uv = toViewUV(k, p[0], p[1]), v = dView(k); return uv && v && v.bb && uv[0] >= v.bb[0][0] - 1 && uv[0] <= v.bb[1][0] + 1 && uv[1] >= v.bb[0][1] - 1 && uv[1] <= v.bb[1][1] + 1; });
      if (!hit) { toast('Bitte in eine Normalansicht klicken (keine Isometrie, kein Schnitt).'); return; }
      B.key = hit; B.view = vo[hit] || hit;
    }
    const first = B.pts[0];
    if (first && B.pts.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) < 2.5) { finishBreakout(); return; }
    B.pts.push(p);
    // Entwurf auf dem Blatt zeigen
    const svg = $('#drawing .sheet svg');
    if (svg) {
      let pl = svg.querySelector('.brkdraft');
      if (!pl) { pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); pl.setAttribute('class', 'brkdraft'); pl.setAttribute('style', 'fill:rgba(37,99,235,.08);stroke:#2563eb;stroke-width:0.35;stroke-dasharray:1.5 1'); svg.appendChild(pl); }
      pl.setAttribute('points', B.pts.map(q => q.join(',')).join(' '));
    }
    if (B.pts.length === 3) toast('Weitere Punkte anklicken, zum Schließen auf den ersten Punkt.');
  }
  async function finishBreakout() {
    const B = drawing.breakMode;
    drawing.breakMode = null;
    renderDrawRibbon();
    const uv = B.pts.map(q => toViewUV(B.key, q[0], q[1])).filter(Boolean);
    if (uv.length < 3) { renderDrawing(); return; }
    // Vorgabe-Tiefe: halbe Teiletiefe in Blickrichtung
    const bb = drawing.data && drawing.data.bbox, ax = { front: 1, back: 1, top: 2, bottom: 2, left: 0, right: 0 }[B.view];
    const depth = bb && ax != null ? Math.round((bb[1][ax] - bb[0][ax]) / 2 * 10) / 10 : 10;
    pushHistory();
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    if (!Array.isArray(ctx.doc.drawing.breakouts)) ctx.doc.drawing.breakouts = [];
    ctx.doc.drawing.breakouts.push({ id: uid(), view: B.view, pts: uv.map(q => q.map(v => Math.round(v * 100) / 100)), depth });
    store();
    await reloadDrawing();
    toast(`Ausbruch angelegt, Tiefe ${fmt(depth, 1)} mm. Klick auf den Umriss ändert die Tiefe.`);
  }
  async function reloadDrawing() {
    const sheet = $('#drawing .sheet');
    if (sheet) sheet.style.opacity = '0.5';
    try { await loadDrawingData(); } catch (err) { toast('Zeichnung nicht möglich: ' + err.message); }
    if (sheet) sheet.style.opacity = '';
    renderDrawing();
  }
  function openBreakEditor(id, ev) {
    const list = (ctx.doc.drawing && ctx.doc.drawing.breakouts) || [], b = list.find(x => x.id === id);
    if (!b) return;
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    box.innerHTML = `<b>Ausbruch</b>
      <label>Tiefe <input type="text" inputmode="decimal" data-be="d" value="${fmt(b.depth, 2)}"> mm</label>
      <p class="info small">Gemessen ab der vordersten Kante des Teils in Blickrichtung.</p>
      <div class="debtns"><button type="button" class="btn primary" data-be="ok">OK</button><button type="button" class="btn" data-be="del">Löschen</button><button type="button" class="btn" data-be="x">Abbrechen</button></div>`;
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(ev.clientX - r.left, r.width - 250)) + 'px';
    box.style.top = Math.max(6, Math.min(ev.clientY - r.top + 10, r.height - 180)) + 'px';
    box.hidden = false;
    box.onchange = null;
    box.onclick = e2 => {
      const a = e2.target.dataset.be;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'del') { pushHistory(); ctx.doc.drawing.breakouts = list.filter(x => x.id !== id); store(); box.hidden = true; reloadDrawing(); return; }
      if (a !== 'ok') return;
      const dv = parseFloat(String(box.querySelector('[data-be="d"]').value).replace(',', '.'));
      if (dv > 0) { pushHistory(); b.depth = dv; store(); }
      box.hidden = true; reloadDrawing();
    };
  }
  function openHtabEditor(id, ev) {
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    box.innerHTML = `<b>Bohrungstabelle</b><div class="debtns"><button type="button" class="btn" data-he="del">Löschen</button><button type="button" class="btn" data-he="x">Abbrechen</button></div>`;
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(ev.clientX - r.left, r.width - 250)) + 'px';
    box.style.top = Math.max(6, Math.min(ev.clientY - r.top + 10, r.height - 120)) + 'px';
    box.hidden = false;
    box.onchange = null;
    box.onclick = e2 => {
      const a = e2.target.dataset.he;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'del') { pushHistory(); setCurHtabs(curHtabs().filter(x => x.id !== id)); store(); box.hidden = true; renderDrawing(); }
    };
  }
  /* Eigene Schriftfeld-Vorlage aus einer SVG-Datei: bereinigt (keine Skripte, Stile, eingebetteten Fremdinhalte oder
     externen Verweise) und im Dokument gespeichert, damit sie offline und beim Weitergeben dabei ist. Größe in mm aus
     width/height (mm, cm, in, pt, px = 96 dpi) oder sonst aus der viewBox (1 Einheit = 1 mm). */
  function readTbTemplate(text, name) {
    const docx = new DOMParser().parseFromString(text, 'image/svg+xml'), root = docx.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || docx.querySelector('parsererror')) throw new Error('Keine gültige SVG-Datei');
    root.querySelectorAll('script, style, foreignObject, iframe, image, use[href^="http"], a').forEach(el => el.remove());
    root.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => {
      const nm = a.name.toLowerCase();
      if (nm.startsWith('on') || ((nm === 'href' || nm === 'xlink:href') && !String(a.value).startsWith('#'))) el.removeAttribute(a.name);
    }));
    const unit = v => { const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|px)?\s*$/.exec(String(v || '')); if (!m) return null; const k = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 }[m[2] || 'mm']; return Number(m[1]) * k; };
    let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    let w = unit(root.getAttribute('width')), h = unit(root.getAttribute('height'));
    if (vb.length !== 4 || vb.some(v => !Number.isFinite(v)) || !(vb[2] > 0 && vb[3] > 0)) vb = [0, 0, w || 180, h || 32];
    if (!(w > 0) || !(h > 0)) { w = vb[2]; h = vb[3]; }
    // höchstens 180 × 100 mm (Breite des ISO-Schriftfelds), Seitenverhältnis bleibt
    const k = Math.min(1, 180 / w, 100 / h); w *= k; h *= k;
    const inner = [...root.childNodes].map(nd => new XMLSerializer().serializeToString(nd)).join('').replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    if (inner.length > 200000) throw new Error('Die Vorlage ist zu groß (höchstens 200 KB)');
    return { name: String(name || 'Vorlage.svg').slice(0, 80), inner, vb, w: Math.round(w * 1000) / 1000, h: Math.round(h * 1000) / 1000 };
  }
  /* Schriftfeld bearbeiten (Attribute des Schriftfelds); leeres Feld = automatischer Wert */
  const TB_FIELDS = [['name', 'Benennung'], ['number', 'Zeichnungsnummer'], ['author', 'Gezeichnet'], ['date', 'Datum'], ['material', 'Werkstoff'], ['tol', 'Allgemeintoleranz'], ['rev', 'Änderung']];
  function openTbEditor(ev) {
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    const cur = (ctx.doc.drawing && ctx.doc.drawing.tb) || {};
    box.innerHTML = `<b>Schriftfeld</b><label>Vorlage <select data-tb-template><option value="iso"${((ctx.doc.drawing && ctx.doc.drawing.tbTemplate) || 'iso') === 'iso' ? ' selected' : ''}>ISO 7200</option><option value="simple"${((ctx.doc.drawing && ctx.doc.drawing.tbTemplate) || 'iso') === 'simple' ? ' selected' : ''}>Kompakt Fertigung</option>${ctx.doc.drawing && ctx.doc.drawing.tbCustom ? `<option value="custom"${((ctx.doc.drawing && ctx.doc.drawing.tbTemplate) || 'iso') === 'custom' ? ' selected' : ''}>Eigene: ${esc(ctx.doc.drawing.tbCustom.name)}</option>` : ''}</select></label><div class="debtns"><button type="button" class="btn" data-te="tbload">Eigene Vorlage (SVG) laden …</button></div><p class="info small">Platzhalter in der Vorlage: ${TB_PLACEHOLDERS.map(k => '{' + k + '}').join(' ')} und {Bezeichnung} jedes freien Felds.</p>${TB_FIELDS.map(([k, l]) => `<label>${esc(l)} <input type="text" data-tb="${k}" value="${esc(cur[k] || '')}" placeholder="${esc(k === 'name' ? ctx.doc.name : k === 'date' ? new Date().toLocaleDateString('de-DE') : k === 'material' ? 'aus dem Körper' : k === 'tol' ? 'ISO 2768-m' : k === 'author' ? 'cantcodecad' : '')}"></label>`).join('')}
      <p class="info small">Leere Felder werden automatisch gefüllt.</p>
      <b>Freie Felder</b>
      <div class="tbx-edit">${(() => { const ex = (ctx.doc.drawing && ctx.doc.drawing.tbExtra) || []; const nr = Math.min(9, Math.max(3, Math.ceil((ex.length + 1) / 3) * 3)); return Array.from({ length: nr }, (_, i) => `<div class="row"><input type="text" data-tbx-l="${i}" value="${esc((ex[i] || {}).label || '')}" placeholder="Bezeichnung, z. B. Kunde"><input type="text" data-tbx-v="${i}" value="${esc((ex[i] || {}).value || '')}" placeholder="Wert"></div>`).join(''); })()}</div>
      <p class="info small">Erscheinen als eigene Zeilen über dem Schriftfeld, drei je Zeile (höchstens neun).</p>
      <div class="debtns"><button type="button" class="btn primary" data-te="ok">OK</button><button type="button" class="btn" data-te="x">Abbrechen</button></div>`;
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(ev.clientX - r.left - 260, r.width - 290)) + 'px';
    box.style.top = Math.max(6, Math.min(ev.clientY - r.top - 330, r.height - 360)) + 'px';
    box.hidden = false;
    box.onchange = null;
    box.onclick = e2 => {
      const a = e2.target.dataset.te;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'tbload') {
        // Datei wählen; die Vorlage wird gleich gespeichert und ausgewählt
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.svg'; inp.hidden = true; inp.id = 'tbfile';
        const old = document.getElementById('tbfile'); if (old) old.remove();
        document.body.appendChild(inp);
        inp.addEventListener('change', async () => {
          const file = inp.files && inp.files[0];
          inp.remove();
          if (!file) return;
          try {
            const tc = readTbTemplate(await file.text(), file.name);
            pushHistory();
            if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
            ctx.doc.drawing.tbCustom = tc; ctx.doc.drawing.tbTemplate = 'custom';
            store(); box.hidden = true; renderDrawing();
            toast(`Schriftfeld-Vorlage „${tc.name}“: ${fmt(tc.w, 1)} × ${fmt(tc.h, 1)} mm.`);
          } catch (err) { toast('Vorlage nicht lesbar: ' + err.message, 6000); }
        });
        inp.click();
        return;
      }
      if (a !== 'ok') return;
      const tb = {};
      box.querySelectorAll('[data-tb]').forEach(i => { const v = i.value.trim(); if (v) tb[i.dataset.tb] = v.slice(0, 120); });
      pushHistory();
      if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
      if (Object.keys(tb).length) ctx.doc.drawing.tb = tb; else delete ctx.doc.drawing.tb;
      const ex = [...box.querySelectorAll('[data-tbx-l]')].map(i => ({ label: i.value.trim().slice(0, 40), value: (box.querySelector(`[data-tbx-v="${i.dataset.tbxL}"]`) || {}).value?.trim().slice(0, 120) || '' })).filter(e => e.label || e.value);
      if (ex.length) ctx.doc.drawing.tbExtra = ex; else delete ctx.doc.drawing.tbExtra;
      const template = box.querySelector('[data-tb-template]').value;
      if (template === 'simple' || (template === 'custom' && ctx.doc.drawing.tbCustom)) ctx.doc.drawing.tbTemplate = template; else delete ctx.doc.drawing.tbTemplate;
      store(); box.hidden = true; renderDrawing();
    };
  }
  /* Revisionstabelle: Änderungen eintragen und löschen; die neueste erscheint im Schriftfeld */
  function openRevEditor(ev) {
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
    const revs = ctx.doc.drawing.revs || [];
    const last = revs.length ? revs[revs.length - 1].rev : '';
    const next = !last ? 'A' : /^[A-Y]$/.test(last) ? String.fromCharCode(last.charCodeAt(0) + 1) : /^\d+$/.test(last) ? String(+last + 1) : '';
    const tb = ctx.doc.drawing.tb || {};
    box.classList.add('wide');
    box.innerHTML = `<b>Revisionstabelle</b>
      ${revs.length ? `<div class="revlist">${revs.map((r, i) => `<div class="revrow"><span>${esc(r.rev)} · ${esc(r.desc)} · ${esc(r.date)}${r.author ? ` · ${esc(r.author)}` : ''}</span><button type="button" class="chip mini" data-re="del" data-i="${i}" title="Zeile löschen">×</button></div>`).join('')}</div>` : '<p class="info small">Noch keine Änderung eingetragen.</p>'}
      <label>Änderung <input type="text" data-rv="rev" value="${esc(next)}"></label>
      <label>Beschreibung <input type="text" data-rv="desc" placeholder="z. B. Bohrung ⌀9 statt ⌀8"></label>
      <label>Datum <input type="text" data-rv="date" value="${esc(new Date().toLocaleDateString('de-DE'))}"></label>
      <label>Name <input type="text" data-rv="author" value="${esc(tb.author || '')}"></label>
      <div class="debtns"><button type="button" class="btn primary" data-re="add">Eintragen</button><button type="button" class="btn" data-re="x">Schließen</button></div>`;
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min((ev ? ev.clientX - r.left : r.width / 2) - 140, r.width - 300)) + 'px';
    box.style.top = Math.max(6, Math.min(ev ? ev.clientY - r.top + 10 : 80, r.height - 340)) + 'px';
    box.hidden = false;
    box.onchange = null;
    box.onclick = e2 => {
      const a = e2.target.dataset.re;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'del') { pushHistory(); revs.splice(+e2.target.dataset.i, 1); if (!revs.length) delete ctx.doc.drawing.revs; store(); renderDrawing(); openRevEditor(ev); return; }
      if (a !== 'add') return;
      const v = k => box.querySelector(`[data-rv="${k}"]`).value.trim();
      if (!v('rev')) { toast('Bitte einen Änderungsbuchstaben eintragen.'); return; }
      pushHistory();
      ctx.doc.drawing.revs = [...revs, { rev: v('rev').slice(0, 8), desc: v('desc').slice(0, 120), date: v('date').slice(0, 20), author: v('author').slice(0, 40) }];
      store(); renderDrawing(); openRevEditor(ev);
    };
  }
  function openDetailEditor(id, ev) {
    const d = curDetails().find(x => x.id === id);
    if (!d) return;
    const ps = (drawing.last.places[d.view] || { s: 1 }).s;
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    box.innerHTML = `<b>Einzelheit ${esc(d.label)}</b>
      <label>Maßstab <select data-de="k">${DETAIL_SCALES.filter(q => q > ps + 1e-9).map(q => `<option value="${q}"${Math.abs(q - (d.S || ps * d.k)) < 1e-9 ? ' selected' : ''}>${scaleLabel(q)}</option>`).join('')}</select></label>
      <label>Radius <input type="text" inputmode="decimal" data-de="r" value="${fmt(d.r, 2)}"> mm</label>
      <div class="debtns"><button type="button" class="btn primary" data-de="ok">OK</button><button type="button" class="btn" data-de="del">Löschen</button><button type="button" class="btn" data-de="x">Abbrechen</button></div>`;
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(ev.clientX - r.left, r.width - 250)) + 'px';
    box.style.top = Math.max(6, Math.min(ev.clientY - r.top + 10, r.height - 180)) + 'px';
    box.hidden = false;
    box.onchange = null;
    box.onclick = e2 => {
      const a = e2.target.dataset.de;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'del') { pushHistory(); setCurDetails(curDetails().filter(x => x.id !== id)); store(); box.hidden = true; renderDrawing(); return; }
      if (a !== 'ok') return;
      const rv = parseFloat(String(box.querySelector('[data-de="r"]').value).replace(',', '.'));
      pushHistory();
      d.S = Number(box.querySelector('[data-de="k"]').value) || 2 * ps; delete d.k;
      if (rv > 0) d.r = rv;
      store(); box.hidden = true; renderDrawing();
    };
  }
  /* Maß bearbeiten: Präfix, Toleranz (±, Abmaße, ISO-Passung), löschen */
  function openDimEditor(id, ev) {
    const dm = curDims().find(d => d.id === id);
    if (!dm) return;
    const el = $('#drawing');
    let box = el.querySelector('.dimedit');
    if (!box) { box = document.createElement('div'); el.appendChild(box); }
    box.className = 'dimedit';
    const value = dimValue(dm);
    const t = dm.tol || { kind: '' };
    const render = () => {
      const kind = box.querySelector('[data-de="kind"]') ? box.querySelector('[data-de="kind"]').value : t.kind || '';
      const code = (box.querySelector('[data-de="code"]') || {}).value || t.code || 'H7';
      const dev = fitDeviations(value, code);
      box.querySelector('.dekind').innerHTML = kind === 'sym' ? `<label>± <input type="text" inputmode="decimal" data-de="v" value="${esc(t.v ?? '0,1')}"> mm</label>`
        : kind === 'dev' ? `<label>oben <input type="text" inputmode="decimal" data-de="up" value="${esc(t.up ?? '+0,1')}"></label><label>unten <input type="text" inputmode="decimal" data-de="lo" value="${esc(t.lo ?? '0')}"></label>`
        : kind === 'fit' ? `<label>Passung <select data-de="code">${FITS.map(f => `<option${f === code ? ' selected' : ''}>${f}</option>`).join('')}</select></label><span class="small">${dev ? `${dev.up >= 0 ? '+' : ''}${fmt(dev.up, 3)} / ${dev.lo >= 0 ? (dev.lo ? '+' : '') : ''}${fmt(dev.lo, 3)} mm` : 'Nennmaß nicht abgedeckt'}</span>`
        : '';
    };
    const canArc = (dm.kind === 'rad' || dm.kind === 'arc') && dm.s && dm.e && dm.sweep > 0;
    box.innerHTML = `<b>Maß ${fmt(value, 2)} mm</b>
      ${canArc ? `<label>Art <select data-de="akind"><option value="rad"${dm.kind === 'rad' ? ' selected' : ''}>Radius R ${fmt(dm.r, 2)}</option><option value="arc"${dm.kind === 'arc' ? ' selected' : ''}>Bogenlänge ⌒ ${fmt(dm.r * dm.sweep, 2)}</option></select></label>` : ''}
      <label>Präfix <select data-de="prefix">${['', 'Ø', 'R', '□'].map(p => `<option value="${p}"${(dm.prefix || '') === p ? ' selected' : ''}>${p || '–'}</option>`).join('')}</select></label>
      <label>Toleranz <select data-de="kind">${[['', 'keine'], ['sym', '±'], ['dev', 'Abmaße'], ['fit', 'ISO-Passung']].map(([k, l]) => `<option value="${k}"${(t.kind || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="dekind"></div>
      <div class="debtns"><button type="button" class="btn primary" data-de="ok">OK</button><button type="button" class="btn" data-de="del">Löschen</button><button type="button" class="btn" data-de="x">Abbrechen</button></div>`;
    render();
    const r = el.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(ev.clientX - r.left, r.width - 250)) + 'px';
    box.style.top = Math.max(6, Math.min(ev.clientY - r.top + 10, r.height - 220)) + 'px';
    box.hidden = false;
    box.onchange = e2 => { if (e2.target.dataset.de === 'kind' || e2.target.dataset.de === 'code') render(); };
    box.onclick = e2 => {
      const a = e2.target.dataset.de;
      if (a === 'x') { box.hidden = true; return; }
      if (a === 'del') { pushHistory(); setCurDims(curDims().filter(d => d.id !== id)); store(); box.hidden = true; renderDrawing(); toast('Maß gelöscht (Strg+Z holt es zurück).'); return; }
      if (a !== 'ok') return;
      const q = k => (box.querySelector(`[data-de="${k}"]`) || {}).value;
      const kind = q('kind');
      const pnum = v => { const x = parseFloat(String(v || '0').replace(',', '.').replace('−', '-')); return isFinite(x) ? x : 0; };
      pushHistory();
      if (canArc && q('akind')) dm.kind = q('akind') === 'arc' ? 'arc' : 'rad';
      dm.prefix = q('prefix') || '';
      if (!dm.prefix) delete dm.prefix;
      if (kind === 'sym') dm.tol = { kind, v: Math.abs(pnum(q('v'))) };
      else if (kind === 'dev') dm.tol = { kind, up: pnum(q('up')), lo: pnum(q('lo')) };
      else if (kind === 'fit') dm.tol = { kind, code: q('code') };
      else delete dm.tol;
      store(); box.hidden = true; renderDrawing();
    };
  }
  /* Ansicht unter dem Zeiger (Blattkoordinaten) */
  function viewAtSheet(p) {
    const R = drawing.last && drawing.last.rects;
    if (!R || !p) return null;
    const pad = 3;
    const keys = [...Object.keys(R).filter(k => k.startsWith('x:')).reverse(), 'iso', 'left', 'top', 'front'];
    for (const k of keys) { const r = R[k]; if (r && p[0] >= r[0] - pad && p[0] <= r[0] + r[2] + pad && p[1] >= r[1] - pad && p[1] <= r[1] + r[3] + pad) return k; }
    return null;
  }
  function wireDrawingEvents(el) {
    // Ansichten ziehen: Vorderansicht nimmt die abgeleiteten Ansichten mit
    let drag = null, dragged = false, dragRaf = 0;
    el.addEventListener('pointerdown', e => {
      // Symbole mit der Maus verschieben (Lage relativ zur Stelle an der Fläche)
      const tn = e.button === 0 && !drawing.dimMode && !drawing.noteMode && e.target.closest('[data-note]');
      if (tn) {
        const nt = curNotes().find(x => x.id === tn.dataset.note);
        if (nt) { drag = { note: nt, p0: sheetPoint(e), o0: [...(nt.off || [10, -10])], hist: false }; dragged = false; el.setPointerCapture(e.pointerId); }
        return;
      }
      if (e.button !== 0 || drawing.secMode || drawing.setMode || drawing.dimMode || drawing.detailMode || drawing.breakMode || drawing.noteMode || !e.target.closest('.sheet svg') || e.target.closest('[data-dim], [data-det], [data-note], [data-brk], [data-htab], [data-tb], [data-rev]')) return;
      const p = sheetPoint(e), k = viewAtSheet(p);
      if (!k) return;
      if (!ctx.doc.drawing) ctx.doc.drawing = { opts: { ...drawing.opts }, dims: [] };
      if (!ctx.doc.drawing.offsets) ctx.doc.drawing.offsets = {};
      const ev = k.startsWith('x:') ? (drawSheets()[drawing.sheet].views || []).find(v => 'x:' + v.id === k) : null;
      drag = { k, ev, p0: p, o0: ev ? [ev.x, ev.y] : [...(ctx.doc.drawing.offsets[k] || [0, 0])], hist: false };
      dragged = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!drag) {
        if (!drawing.secMode && !drawing.setMode && !drawing.dimMode && !drawing.detailMode && !drawing.breakMode && !drawing.noteMode) { const k = viewAtSheet(sheetPoint(e)); const svg = el.querySelector('.sheet svg'); if (svg) svg.style.cursor = k ? 'move' : ''; }
        return;
      }
      const p = sheetPoint(e);
      if (!p) return;
      let dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
      if (!dragged && Math.hypot(dx, dy) < 1) return;
      if (!drag.hist) { pushHistory(); drag.hist = true; }
      dragged = true;
      if (drag.note) drag.note.off = [Math.round((drag.o0[0] + dx) * 2) / 2, Math.round((drag.o0[1] + dy) * 2) / 2];
      else if (drag.ev) { drag.ev.x = Math.round((drag.o0[0] + dx) * 2) / 2; drag.ev.y = Math.round((drag.o0[1] + dy) * 2) / 2; }
      else {
        if (drag.k === 'top') dx = 0;
        if (drag.k === 'left') dy = 0;
        ctx.doc.drawing.offsets[drag.k] = [Math.round((drag.o0[0] + dx) * 2) / 2, Math.round((drag.o0[1] + dy) * 2) / 2];
      }
      cancelAnimationFrame(dragRaf);
      dragRaf = requestAnimationFrame(renderDrawing);
    });
    el.addEventListener('pointerup', () => { if (drag && dragged) store(); drag = null; });
    el.addEventListener('click', e => {
      if (dragged) { dragged = false; return; }
      if (e.target.closest('.dimedit')) return;
      if (drawing.placing && e.target.closest('.sheet svg')) { placeDrawView(sheetPoint(e)); return; }
      const t = e.target.closest('[data-dim]');
      if (t && t.dataset.dim !== 'pv' && drawing.last) { openDimEditor(t.dataset.dim, e); return; }
      const trv = e.target.closest('[data-rev]');
      if (trv && drawing.last && !drawing.setMode && !drawing.dimMode && !drawing.secMode && !drawing.detailMode && !drawing.breakMode && !drawing.noteMode) { openRevEditor(e); return; }
      const tbk = e.target.closest('[data-tb="1"]');
      if (tbk && drawing.last && !drawing.setMode && !drawing.dimMode && !drawing.secMode && !drawing.detailMode && !drawing.breakMode && !drawing.noteMode) { openTbEditor(e); return; }
      const th = e.target.closest('[data-htab]');
      if (th && drawing.last && !drawing.setMode) { openHtabEditor(th.dataset.htab, e); return; }
      const td = e.target.closest('[data-det]');
      if (td && drawing.last) { openDetailEditor(td.dataset.det, e); return; }
      if (drawing.secMode && drawing.last && e.target.closest('.sheet')) { secClick(sheetPoint(e), e.shiftKey); return; }
      if (drawing.setMode && drawing.last && e.target.closest('.sheet')) { setDimClick(sheetPoint(e)); return; }
      if (drawing.detailMode && drawing.last && e.target.closest('.sheet')) { detailClick(sheetPoint(e)); return; }
      if (drawing.cropMode && drawing.last && e.target.closest('.sheet')) { cropClick(sheetPoint(e)); return; }
      if (drawing.breakMode && drawing.last && e.target.closest('.sheet')) { breakClick(sheetPoint(e)); return; }
      if (drawing.noteMode && drawing.last && e.target.closest('.sheet')) { noteClick(sheetPoint(e), e); return; }
      const tn = e.target.closest('[data-note]');
      if (tn && drawing.last) { openNoteEditor(tn.dataset.note, e); return; }
      const tb = e.target.closest('[data-brk]');
      if (tb && drawing.last) { openBreakEditor(tb.dataset.brk, e); return; }
      if (!drawing.dimMode || !drawing.last || !e.target.closest('.sheet')) return;
      const p = sheetPoint(e);
      if (!p) return;
      const D = drawing.draft;
      if (D.radial) {
        const uv = toViewUV(D.radial.view, p[0], p[1]);
        if (!uv) return;
        pushHistory();
        // Bogen: Anfang/Ende/Winkel mitspeichern, damit das Maß auf Bogenlänge umgestellt werden kann
        const arc = !D.radial.full && D.radial.arc ? { s: D.radial.arc.s.map(v => Math.round(v * 1e4) / 1e4), e: D.radial.arc.e.map(v => Math.round(v * 1e4) / 1e4), sweep: D.radial.arc.sweep } : {};
        curDims().push({ id: uid(), view: D.radial.view, kind: D.radial.full ? 'dia' : 'rad', c: D.radial.c.map(v => Math.round(v * 1e4) / 1e4), r: Math.round(D.radial.r * 1e4) / 1e4, at: uv.map(v => Math.round(v * 100) / 100), ...arc });
        store();
        drawing.draft = { pts: [] };
        renderDrawing();
        return;
      }
      const lineAt = (q, view) => { let best = null, bd = 0.8; (drawing.last.lines || []).forEach(l => { if (view && l.view !== view) return; const vx = l.x2 - l.x1, vy = l.y2 - l.y1, ll = vx * vx + vy * vy; const t = ll ? Math.max(0, Math.min(1, ((q[0] - l.x1) * vx + (q[1] - l.y1) * vy) / ll)) : 0; const d = Math.hypot(l.x1 + t * vx - q[0], l.y1 + t * vy - q[1]); if (d < bd) { bd = d; best = l; } }); return best; };
      const nearSnap = q => drawing.last.snaps.reduce((m, sn) => Math.min(m, Math.hypot(sn.x - q[0], sn.y - q[1])), Infinity);
      const asPt = (l, k) => ({ view: l.view, u: l[k][0], v: l[k][1] });
      if (D.lines && D.lines.length === 2) {
        const uv = toViewUV(D.lines[0].view, p[0], p[1]);
        if (!uv) return;
        pushHistory();
        curDims().push({ id: uid(), view: D.lines[0].view, kind: 'ang', l1: { a: D.lines[0].a, b: D.lines[0].b }, l2: { a: D.lines[1].a, b: D.lines[1].b }, at: uv.map(v => Math.round(v * 100) / 100) });
        store(); drawing.draft = { pts: [] }; renderDrawing();
        return;
      }
      if (D.lines && D.lines.length === 1) {
        const l2 = nearSnap(p) > 1.0 ? lineAt(p, D.lines[0].view) : null;
        if (l2 && l2 !== D.lines[0]) {
          const d1 = [D.lines[0].b[0] - D.lines[0].a[0], D.lines[0].b[1] - D.lines[0].a[1]], d2 = [l2.b[0] - l2.a[0], l2.b[1] - l2.a[1]];
          if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2)) { toast('Die Linien sind parallel. Für einen Abstand zwei Punkte anklicken.'); return; }
          D.lines.push(l2); toast('Winkel: jetzt die Lage des Maßbogens anklicken (bestimmt auch, welcher Winkel).'); renderDrawing();
          return;
        }
        // sonst: Länge der gewählten Linie, Lage an dieser Stelle
        const pv = placementFor(p, asPt(D.lines[0], 'a'), asPt(D.lines[0], 'b'));
        if (!pv) return;
        pushHistory(); curDims().push({ ...pv, id: uid() }); store(); drawing.draft = { pts: [] }; renderDrawing();
        return;
      }
      if (D.pts.length === 2) {
        const pv = placementFor(p, D.pts[0], D.pts[1]);
        if (!pv) return;
        pushHistory();
        curDims().push({ ...pv, id: uid() });
        store();
        drawing.draft = { pts: [] };
        renderDrawing();
        return;
      }
      // Klick auf einen Kreisumfang (nicht an einem Eckpunkt) → Durchmesser- bzw. Radiusmaß
      if (!D.pts.length) {
        let near = Infinity;
        drawing.last.snaps.forEach(sn => { near = Math.min(near, Math.hypot(sn.x - p[0], sn.y - p[1])); });
        let circ = null, cd = 1.2;
        (drawing.last.circles || []).forEach(ci => { const d = Math.abs(Math.hypot(ci.x - p[0], ci.y - p[1]) - ci.rs); if (d < cd) { cd = d; circ = ci; } });
        if (circ && near > 0.6) { drawing.draft = { pts: [], radial: circ }; toast(`${circ.full ? 'Durchmesser' : 'Radius'}: jetzt die Lage des Maßes anklicken.`); renderDrawing(); return; }
        const ln = near > 1.0 ? lineAt(p) : null;
        if (ln) { drawing.draft = { pts: [], lines: [ln] }; toast('Linie gewählt: zweite Linie für einen Winkel anklicken oder die Lage für die Länge.'); renderDrawing(); return; }
      }
      let best = null, bd = 3;
      drawing.last.snaps.forEach(sn => { const d = Math.hypot(sn.x - p[0], sn.y - p[1]); if (d < bd && (!D.pts.length || sn.view === D.pts[0].view)) { bd = d; best = sn; } });
      if (!best) { toast(D.pts.length ? 'Zweiten Punkt in derselben Ansicht anklicken (Ecke oder Bohrungsmitte).' : 'Eckpunkt oder Bohrungsmitte einer Ansicht anklicken.'); return; }
      if (D.pts.length === 1 && Math.abs(D.pts[0].u - best.u) < 1e-9 && Math.abs(D.pts[0].v - best.v) < 1e-9) return;
      D.pts.push(best);
      renderDrawing();
    });
    let secRaf = 0;
    el.addEventListener('mousemove', e => {
      const S = drawing.secMode;
      if (!S || S.step !== 1) return;
      const p = sheetPoint(e), uv = p && toViewUV(S.view, p[0], p[1]);
      if (!uv) return;
      cancelAnimationFrame(secRaf);
      secRaf = requestAnimationFrame(() => { S.cur = secPoint(S, p, uv); renderDrawing(); });
    });
    el.addEventListener('mousemove', e => {
      const DL = drawing.draft.lines || [];
      if (!drawing.dimMode || (drawing.draft.pts.length !== 2 && !drawing.draft.radial && !DL.length)) return;
      const p = sheetPoint(e);
      if (!p) return;
      cancelAnimationFrame(dimRaf);
      dimRaf = requestAnimationFrame(() => {
        const R = drawing.draft.radial, uv = R && toViewUV(R.view, p[0], p[1]);
        const L0 = DL[0], luv = L0 && toViewUV(L0.view, p[0], p[1]);
        drawing.draft.preview = R ? (uv && { id: 'pv', view: R.view, kind: R.full ? 'dia' : 'rad', c: R.c, r: R.r, at: uv })
          : DL.length === 2 ? (luv && { id: 'pv', view: L0.view, kind: 'ang', l1: { a: DL[0].a, b: DL[0].b }, l2: { a: DL[1].a, b: DL[1].b }, at: luv })
            : DL.length === 1 ? placementFor(p, { view: L0.view, u: L0.a[0], v: L0.a[1] }, { view: L0.view, u: L0.b[0], v: L0.b[1] })
              : placementFor(p, drawing.draft.pts[0], drawing.draft.pts[1]);
        renderDrawing();
      });
    });
  }

  /* Basisansicht einfügen: Richtung wählen, dann aufs Blatt klicken */
  const DVIEWS = [['front', 'Vorderansicht'], ['back', 'Rückansicht'], ['top', 'Draufsicht'], ['bottom', 'Untersicht'], ['left', 'Seitenansicht von links'], ['right', 'Seitenansicht von rechts'], ['iso', 'Isometrie'], ['iso2', 'Isometrie von hinten'], ['isoP', 'Perspektive (Fluchtpunkt)']];
  async function startPlaceView(v) {
    drawing.placing = v; drawing.dimMode = false; drawing.detailMode = null;
    renderDrawRibbon();
    if (!drawing.data.views[v]) {
      const sheet = $('#drawing .sheet'); if (sheet) sheet.style.opacity = '0.5';
      try { await loadDrawingData(); } catch (err) { toast('Ansicht nicht möglich: ' + err.message); drawing.placing = null; return; } finally { if (sheet) sheet.style.opacity = ''; }
      renderDrawing();
    }
    toast(`${DVIEWS.find(x => x[0] === v)[1]}: auf dem Blatt an die gewünschte Stelle klicken. Esc bricht ab.`, 6000);
  }
  function placeDrawView(p) {
    const v = drawing.placing, dv = drawing.data.views[v];
    drawing.placing = null;
    if (!p || !dv || !dv.bb) return;
    const sh = drawSheets()[drawing.sheet];
    const sc = drawing.sheet === 0 ? (drawing.last.scale || 1) : (sh.scale || drawing.mainScale || 1);
    const k = v.startsWith('iso') && drawing.sheet === 0 ? sc * 0.6 : sc;
    const w = (dv.bb[1][0] - dv.bb[0][0]) * k, h = (dv.bb[1][1] - dv.bb[0][1]) * k;
    pushHistory();
    (sh.views = sh.views || []).push({ id: uid(), view: v, x: Math.round((p[0] - w / 2) * 2) / 2, y: Math.round((p[1] - h / 2) * 2) / 2, scale: k });
    store();
    renderDrawRibbon();
    renderDrawing();
  }
  function drawingContext(e) {
    const tab = e.target.closest('.stab[data-i]');
    if (tab) { e.preventDefault(); const i = +tab.dataset.i; showCtx(`<button type="button" data-cmd="dsheet-del" data-i="${i}" class="danger">${icon('trash', 15)} Blatt ${i + 1} löschen</button>`, e.clientX, e.clientY - 40); return; }
    const k = viewAtSheet(sheetPoint(e));
    if (!k || !k.startsWith('x:')) return;
    e.preventDefault();
    const id = k.slice(2);
    showCtx([['1', '1:1'], ['0.5', '1:2'], ['0.2', '1:5'], ['0.1', '1:10'], ['2', '2:1'], ['5', '5:1']].map(([v, l]) => `<button type="button" data-cmd="dview-scale" data-id="${id}" data-v="${v}">${icon('zoom', 15)} Maßstab ${l}</button>`).join('')
      + `<hr><button type="button" data-cmd="dview-del" data-id="${id}" class="danger">${icon('trash', 15)} Ansicht löschen</button>`, e.clientX, e.clientY);
  }
  return { insertOnSheet, computeBom, openRevEditor, renderSheetsForExport, DVIEWS, applyDrawOpt, curDims, drawSheets, drawing, openDrawing, renderDrawRibbon, renderDrawing, setCurDims, startPlaceView };
}
