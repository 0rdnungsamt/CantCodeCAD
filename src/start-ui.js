// cantcodecad – Startfenster: neues Einzelteil, neue Baugruppe, neue Zeichnung, Öffnen,
// zuletzt geöffnete Dateien und „Weiter mit …“ für das zuletzt bearbeitete Dokument.
import { icon } from './icons.js';
import { recentFiles, forgetRecent, isAbsPath } from './files-native.js';

const TEST = new URLSearchParams(location.search).has('test');
const KEY = 'cc.start';
export const startOnLaunch = () => { if (TEST) return false; try { return localStorage.getItem(KEY) !== '0'; } catch (_) { return true; } };

export function setupStart(ctx) {
  const esc = (...a) => ctx.esc(...a);
  function close() { const el = document.getElementById('start'); if (el) el.remove(); }
  function open() {
    close();
    const doc = ctx.doc, cont = doc.features.length > 0;
    const rec = recentFiles();
    // Dokumentart wie im Browser: Bauteil, Baugruppe, Zeichnung
    const KIND = { part: ['body', 'Bauteil'], assembly: ['component', 'Baugruppe'], drawing: ['drawing', 'Zeichnung'] };
    const kindOf = k => KIND[k] || ['file', ''];
    const tile = (k, ic, t, s) => `<button type="button" class="st-tile" data-start="${k}">${icon(ic, 34)}<b>${t}</b><span>${s}</span></button>`;
    const el = document.createElement('div');
    el.id = 'start';
    el.innerHTML = `<div class="st-card" role="dialog" aria-label="Start">
      <header><b>cantcodecad</b><span>Parametrisches CAD – lokal und offline</span><button type="button" class="iconbtn st-x" data-start="close" title="Schließen" aria-label="Schließen">${icon('close', 16)}</button></header>
      <div class="st-body">
        <div class="st-new"><h3>Neu</h3>
          ${tile('part', 'extrude', 'Einzelteil', 'Skizzen, Körper, Blech')}
          ${tile('assembly', 'joint', 'Baugruppe', 'Teile einfügen und mit Gelenken verbinden')}
          ${tile('drawing', 'drawing', 'Zeichnung', 'aus einem vorhandenen Teil oder einer Baugruppe')}
        </div>
        <div class="st-open"><h3>Öffnen</h3>
          ${cont ? `<button type="button" class="st-row st-cont" data-start="continue">${icon(kindOf(ctx.docKind()).at(0), 16)}<span><b>Weiter mit „${esc(doc.name)}“</b><em>${esc(kindOf(ctx.docKind())[1])} · ${doc.file ? esc(doc.file) : 'noch nicht gespeichert'}</em></span></button>` : ''}
          <button type="button" class="st-row" data-start="open">${icon('folder', 16)}<span><b>Datei öffnen …</b><em>Bauteil, Baugruppe oder Zeichnung (.cantcodecad)</em></span></button>
          ${rec.length ? `<h4>Zuletzt geöffnet</h4>${rec.map(r => `<button type="button" class="st-row" data-start="recent" data-path="${esc(r.path)}" data-kind="${esc(r.kind || '')}" title="${esc(isAbsPath(r.path) ? r.path : 'Projekte/' + r.path)}">${icon(kindOf(r.kind)[0], 16)}<span><b>${esc(r.name)}</b><em>${kindOf(r.kind)[1] ? esc(kindOf(r.kind)[1]) + ' · ' : ''}${esc(isAbsPath(r.path) ? r.path : 'Projekte/' + r.path)} · ${new Date(r.t).toLocaleDateString('de-DE')}</em></span></button>`).join('')}` : ''}
        </div>
      </div>
      <footer><label class="chk"><input type="checkbox" data-start="onlaunch"${startOnLaunch() || TEST ? ' checked' : ''}> Beim Start anzeigen</label></footer>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-start]');
      if (!b && e.target === el) { close(); return; }
      if (!b) return;
      const k = b.dataset.start;
      if (k === 'onlaunch') { try { localStorage.setItem(KEY, b.checked ? '1' : '0'); } catch (_) { /* gesperrt */ } return; }
      if (k === 'close' || k === 'continue') { close(); return; }
      if (k === 'part' || k === 'assembly') { if (await ctx.newDocument(k)) close(); return; }
      if (k === 'drawing') { close(); ctx.newDrawing(); return; }
      if (k === 'open') { close(); ctx.openDialog(); return; }
      if (k === 'recent') {
        const p = b.dataset.path;
        close();
        if (!(await ctx.openPath(p))) { forgetRecent(p); }
      }
    });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    const first = el.querySelector('.st-tile');
    if (first) first.focus();
  }
  return { openStart: open, closeStart: close };
}
