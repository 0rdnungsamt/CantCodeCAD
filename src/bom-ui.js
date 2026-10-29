// cantcodecad – Stückliste im Modell: Positionen aus Komponenten, eingefügten Teilen,
// Rahmenstäben und Verbindungselementen (gleiche Gruppierung wie die Stückliste der Zeichnung), mit Abmessung,
// Masse je Stück und gesamt; Export als CSV (Semikolon, UTF-8 mit BOM – öffnet direkt in Excel).
import { icon } from './icons.js';

/* Zeilen der Stückliste; bom = computeBom(…) aus dem Arbeitsbereich Zeichnung (mit ids und g),
   single = Ersatz für ein Einzelteil (eine Zeile) */
export function bomRows(bom, bodies, single) {
  const box = new Map((bodies || []).map(b => [b.id, b.bbox]));
  const dims = ids => {
    const bs = (ids || []).map(id => box.get(id)).filter(Boolean);
    if (!bs.length) return null;
    const lo = [0, 1, 2].map(k => Math.min(...bs.map(b => b[0][k]))), hi = [0, 1, 2].map(k => Math.max(...bs.map(b => b[1][k])));
    return lo.map((v, k) => hi[k] - v).sort((a, b) => b - a);
  };
  const rows = (bom && bom.length ? bom : single ? [single] : []).map(r => ({ ...r, dims: dims(r.dimIds || r.ids) }));
  return rows;
}

export function bomCsv(rows, fmt) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const head = 'Pos.;Menge;Benennung;Werkstoff;Abmessung mm;Masse je Stück g;Masse gesamt g';
  const lines = rows.map(r => [r.pos, r.qty, q(r.name), q(r.material), q(r.dims ? r.dims.map(v => fmt(v, 1)).join(' x ') : ''), r.g ? fmt(r.g, 1) : '', r.g ? fmt(r.g * r.qty, 1) : ''].join(';'));
  const tot = rows.reduce((a, r) => a + (r.g || 0) * r.qty, 0), n = rows.reduce((a, r) => a + r.qty, 0);
  return '﻿' + [head, ...lines, ['', n, q('Summe'), '', '', '', tot ? fmt(tot, 1) : ''].join(';')].join('\r\n');
}

export function setupBomWindow(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a), fmt = (...a) => ctx.fmt(...a);
  let last = [];
  function rows() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh;
    if (!m) return [];
    return bomRows(ctx.computeBom(m.bodies), m.bodies, ctx.singleRow());
  }
  function open() {
    if (ctx.editing) ctx.cancelEditing();
    last = rows();
    if (!last.length) { ctx.toast('Es gibt keinen sichtbaren Körper.'); return; }
    const tot = last.reduce((a, r) => a + (r.g || 0) * r.qty, 0), n = last.reduce((a, r) => a + r.qty, 0);
    const d = $('#dialog');
    d.className = 'dialog wide';
    d.innerHTML = `<header>${icon('bom', 20)}<b class="dtitle">Stückliste</b></header><div class="dbody">
      <table class="cuttab bomtab"><thead><tr><th>Pos.</th><th>Menge</th><th>Benennung</th><th>Werkstoff</th><th>Abmessung</th><th>Masse/Stk.</th><th>gesamt</th></tr></thead><tbody>
      ${last.map(r => `<tr><td>${r.pos}</td><td>${r.qty}</td><td>${esc(r.name)}</td><td>${esc(r.material)}</td><td>${r.dims ? r.dims.map(v => fmt(v, 1)).join(' × ') : '–'}</td><td>${esc(r.mass)}</td><td>${r.g ? ctx.fmtMass(r.g * r.qty) : '–'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td></td><td>${n}</td><td>Summe</td><td></td><td></td><td></td><td>${tot ? ctx.fmtMass(tot) : '–'}</td></tr></tfoot></table>
      <p class="info small">Gruppiert wie die Stückliste der Zeichnung: eingefügte Teile nach Datei, sonst Komponenten, sonst Rahmenstäbe gleicher Länge und Verbindungselemente gleicher Größe. Abmessung = Hüllquader eines Stücks (größte zuerst). Werkstoff im Browser am Körper einstellen.</p>
      </div><footer><button type="button" class="btn" data-cmd="bom-csv">CSV speichern</button><button type="button" class="btn primary" data-cmd="file-cancel">Schließen</button></footer>`;
    d.hidden = false;
    ctx.setMode('filedlg');
  }
  function csv() { return bomCsv(last.length ? last : rows(), fmt); }
  function download() { ctx.download(`${ctx.safeName()}-Stückliste.csv`, new Blob([csv()], { type: 'text/csv' })); }
  /* Teileliste einer Zeichnung: aus deren eigener Körperliste, damit Positionen und Mengen zur Tabelle und zu den
     Positionsnummern auf dem Blatt passen (der letzte Aufbau kann im Arbeitsbereich Zeichnung ein anderer sein) */
  function downloadFor(bodies) {
    const r = Array.isArray(bodies) && bodies.length ? bomRows(ctx.computeBom(bodies), bodies, null) : rows();
    if (!r.length) { ctx.toast('Die Zeichnung hat keine Teile für eine Stückliste.'); return; }
    ctx.download(`${ctx.safeName()}-Stückliste.csv`, new Blob([bomCsv(r, fmt)], { type: 'text/csv' }));
  }
  return { openBom: open, bomCsvText: csv, downloadBom: download, downloadBomFor: downloadFor };
}
