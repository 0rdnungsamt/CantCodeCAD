// cantcodecad – „Alle Blechteile abwickeln“: findet in den sichtbaren Körpern (z. B. einer STEP-Baugruppe) alle Teile
// aus einem Blech gleicher Dicke, wickelt sie ab und speichert je verschiedenem Teil eine DXF mit Stückzahl, dazu eine
// Liste (CSV) – fertig für die Laserschneidanlage. Gleiche Teile („Name“, „Name (2)“ … mit gleicher Abwicklung) zählen
// zusammen. Nur Anzeige und Ausgabe: das Dokument bleibt unverändert.
import { icon } from './icons.js';

/* Grundname ohne Zählung „ (2)“ */
const grundname = n => String(n || '').replace(/ \(\d+\)$/, '');
/* Dateiname ohne Zeichen, die Windows nicht mag; Endungen der CAD-Programme im Teilenamen weg, „Teil: Körper“ → „Teil - Körper“ */
const dateiname = s => String(s).replace(/\.(f3d|ipt|par|psm|sldprt|prt|stp|step)\b/gi, '').replace(/\s*:\s*/g, ' - ')
  .replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Teil';

export function setupBlechpaket(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a), fmt = (...a) => ctx.fmt(...a);
  let teile = null; // [{ key, name, ids, n, flat }]
  let rest = [];   // Körper, die keine Bleche sind: [{ name, error }]
  let roh = [];    // Ergebnis des Kerns, gefiltert wird erst beim Zeichnen (Dicke änderbar ohne neue Rechnung)
  // Dicke bis (mm): ein Prisma ist auch „gleich dick“ – Blöcke sollen nicht als Laserteile erscheinen
  let tMax = 25, beschriften = false;
  // Werkstoff je Blechdicke („1.50“ → Schlüssel aus MATERIALS); gemerkt, weil STEP-Teile meist keinen Werkstoff haben
  let werkstoff = {};
  try {
    tMax = Number(localStorage.getItem('cc.blechpaket.tmax')) || 25; beschriften = localStorage.getItem('cc.blechpaket.mark') === '1';
    werkstoff = JSON.parse(localStorage.getItem('cc.blechpaket.mat') || '{}') || {};
  } catch (_) { /* Vorgabe */ }
  const tKey = t => (Math.round(t * 100) / 100).toFixed(2);
  const matVon = g => werkstoff[tKey(g.flat.t)] || 'none';
  const matName = k => (k && k !== 'none' && ctx.materials[k] ? ctx.materials[k].label : 'ohne Material');

  async function oeffne() {
    const lb = ctx.lastBuild;
    const ids = ((lb && lb.bodies) || []).filter(id => !ctx.bodyHidden(id));
    if (!ids.length) { ctx.toast('Es gibt keinen sichtbaren Körper.'); return; }
    ctx.closeDialog();
    ctx.setMode('filedlg');
    const d = $('#dialog');
    d.className = 'dialog wide';
    d.innerHTML = `<header>${icon('flat', 20)}<b class="dtitle">Alle Blechteile abwickeln</b></header><div class="dbody"><p class="info">Suche Blechteile in ${ids.length} Körper${ids.length === 1 ? '' : 'n'} …</p></div>`;
    d.hidden = false;
    let res;
    try { res = await ctx.kernel.call('unfoldAll', { features: ctx.doc.features, ids, rule: ctx.sheetRule() }); } catch (err) { ctx.toast('Abwickeln nicht möglich: ' + err.message, 6000); ctx.closeFileDialog(); return; }
    if (ctx.mode !== 'filedlg') return; // inzwischen geschlossen
    roh = res.teile.map(r => ({ ...r, name: ctx.bodyName(r.id) }));
    sortiere();
    zeichne();
  }
  /* Teile gruppieren (gleiches Teil: gleicher Grundname, gleiche Dicke, gleiche Abmessung der Abwicklung) und nach
     Dicke filtern: höchstens tMax und weniger als die halbe kleinere Seite der Abwicklung */
  function sortiere() {
    const gruppen = new Map(), alt = new Map((teile || []).map(g => [g.key, g.an]));
    rest = [];
    for (const r of roh) {
      if (!r.ok) { rest.push({ name: r.name, error: r.error }); continue; }
      const f = r.flat, w = f.bb[1][0] - f.bb[0][0], h = f.bb[1][1] - f.bb[0][1];
      if (f.t > tMax + 1e-9) { rest.push({ name: r.name, error: `dicker als ${fmt(tMax, 1)} mm (${fmt(f.t, 2)} mm)` }); continue; }
      if (f.t >= Math.min(w, h) / 2) { rest.push({ name: r.name, error: `Block, kein Blech (${fmt(f.t, 1)} mm bei ${fmt(Math.min(w, h), 1)} mm Breite)` }); continue; }
      const key = `${grundname(r.name)}|${f.t.toFixed(3)}|${Math.round(Math.max(w, h) * 10)}|${Math.round(Math.min(w, h) * 10)}`;
      const g = gruppen.get(key);
      if (g) { g.n++; g.ids.push(r.id); } else gruppen.set(key, { key, name: grundname(r.name), ids: [r.id], n: 1, flat: f, w, h, an: alt.has(key) ? alt.get(key) : true });
    }
    teile = [...gruppen.values()].sort((a, b) => a.flat.t - b.flat.t || a.name.localeCompare(b.name, 'de'));
    // ohne gemerkten Werkstoff für eine Dicke: den der Körper nehmen, falls sie einen haben
    teile.forEach(g => { const k = tKey(g.flat.t); if (!werkstoff[k]) { const m = g.ids.map(id => ctx.bodyMaterial(id)).find(x => x && x !== 'none'); if (m) werkstoff[k] = m; } });
  }
  function zeichne() {
    const d = $('#dialog'), stk = teile.reduce((s, g) => s + g.n, 0);
    d.innerHTML = `<header>${icon('flat', 20)}<b class="dtitle">Alle Blechteile abwickeln</b></header><div class="dbody">
      <p class="info small"><span>${teile.length ? `${teile.length} verschiedene Blechteile (${stk} Stück)` : 'Kein Blechteil gefunden'}</span>${rest.length ? ` <span>· ${rest.length} Körper sind keine Bleche</span>` : ''}. <span>Feste Fläche ist jeweils die größte ebene Fläche, K-Faktor ${fmt(ctx.sheetRule().k, 2)} aus der Blechregel.</span></p>
      <label class="row"><span>Dicke bis</span><span class="num"><input type="number" step="1" min="0.1" data-bp="tmax" value="${tMax}"><em>mm</em></span></label>
      ${teile.length ? `<div class="bpmat"><span>Werkstoff je Dicke</span>${[...new Set(teile.map(g => tKey(g.flat.t)))].map(k => `<label>${fmt(Number(k), 2)} mm <select data-bp="mat" data-t="${k}">${Object.entries(ctx.materials).map(([m, x]) => `<option value="${m}"${(werkstoff[k] || 'none') === m ? ' selected' : ''}>${esc(m === 'none' ? 'ohne Material' : x.label)}</option>`).join('')}</select></label>`).join('')}</div>
      <table class="bptab"><thead><tr><th></th><th>Teil</th><th>Stk.</th><th>Dicke</th><th>Werkstoff</th><th>Abwicklung</th><th>Biegungen</th><th></th></tr></thead><tbody>
        ${teile.map((g, i) => `<tr><td><input type="checkbox" data-bp="an" data-i="${i}"${g.an ? ' checked' : ''}></td><td>${esc(g.name)}</td><td>${g.n}</td><td>${fmt(g.flat.t, 2)} mm</td><td>${esc(matName(matVon(g)))}</td><td>${fmt(g.w, 1)} × ${fmt(g.h, 1)}</td><td>${g.flat.nb}${g.flat.crossings ? ' ⚠' : ''}</td><td><button type="button" class="chip" data-cmd="bp-zeige" data-i="${i}">Ansehen</button></td></tr>`).join('')}
      </tbody></table>` : ''}
      ${rest.length ? `<details class="bprest"><summary>Keine Bleche (${rest.length})</summary><ul>${rest.slice(0, 200).map(r => `<li>${esc(r.name)}: ${esc(r.error)}</li>`).join('')}</ul></details>` : ''}
      <label class="check"><input type="checkbox" data-bp="mark"${beschriften ? ' checked' : ''}> Teile beschriften (Name, Dicke, Stückzahl als Text auf eigenem Layer, z. B. zum Markieren)</label>
      <p class="info small">Die ZIP enthält je Teil eine DXF (Dateiname mit Dicke und Stückzahl) und eine Liste als CSV – die DXF-Einstellungen gelten.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="bp-zip"${teile.length ? '' : ' disabled'}>ZIP speichern</button><button type="button" class="btn" data-cmd="bp-nest"${teile.length ? '' : ' disabled'} title="Ausgewählte Teile mit Stückzahl auf Tafeln legen – je Dicke eine Tafelgruppe">In Verschachtelung</button><button type="button" class="btn" data-cmd="file-cancel">Schließen</button></footer>`;
  }
  function eingabe(t) {
    if (t.dataset.bp === 'tmax') {
      const v = Number(String(t.value).replace(',', '.'));
      if (!(v > 0)) return;
      tMax = v;
      try { localStorage.setItem('cc.blechpaket.tmax', String(v)); } catch (_) { /* nur für diese Sitzung */ }
      sortiere(); zeichne();
      return;
    }
    if (t.dataset.bp === 'mat') {
      werkstoff[t.dataset.t] = t.value;
      try { localStorage.setItem('cc.blechpaket.mat', JSON.stringify(werkstoff)); } catch (_) { /* nur für diese Sitzung */ }
      zeichne();
      return;
    }
    if (t.dataset.bp === 'mark') {
      beschriften = t.checked;
      try { localStorage.setItem('cc.blechpaket.mark', beschriften ? '1' : '0'); } catch (_) { /* nur für diese Sitzung */ }
      return;
    }
    if (!teile || t.dataset.bp !== 'an') return;
    const g = teile[Number(t.dataset.i)];
    if (g) g.an = t.checked;
  }
  function zeige(i) {
    const g = teile && teile[Number(i)];
    if (!g) return;
    ctx.closeFileDialog(); // Liste zu; „Alle Blechteile abwickeln“ öffnet sie wieder (gleiche Rechnung)
    ctx.showFlat(g.flat, `${g.name} · ${g.n} Stück`);
  }
  /* Dateien der ZIP: je Teil eine DXF, dazu die Liste */
  function dateien() {
    const enc = new TextEncoder(), q = v => `"${String(v).replace(/"/g, '""')}"`, used = new Set(), files = [], rows = [];
    teile.filter(g => g.an).forEach(g => {
      // Werkstoff im Dateinamen, sobald einer gewählt ist (z. B. …_t1.5mm_Edelstahl_10x.dxf)
      const m = matVon(g), wst = m !== 'none' ? `_${dateiname(matName(m))}` : '';
      let base = `${dateiname(g.name)}_t${fmt(g.flat.t, 2).replace(',', '.')}mm${wst}_${g.n}x`, n = 2;
      while (used.has(base)) base = `${dateiname(g.name)}_t${fmt(g.flat.t, 2).replace(',', '.')}mm${wst}_${g.n}x_${n++}`;
      used.add(base);
      const mark = beschriften ? `${g.name} ${fmt(g.flat.t, 2).replace(',', '.')}mm ${g.n}x` : '';
      files.push({ name: `${base}.dxf`, data: enc.encode(ctx.flatDXF(g.flat, { ...ctx.dxfPrefs(), ...(mark ? { mark } : {}) })) });
      rows.push([q(g.name), g.n, fmt(g.flat.t, 2), q(matName(m)), fmt(g.w, 1), fmt(g.h, 1), g.flat.nb, q(`${base}.dxf`)].join(';'));
    });
    files.push({ name: 'Blechteile.csv', data: enc.encode('\ufeff' + ['Teil;Stück;Dicke mm;Werkstoff;Breite mm;Höhe mm;Biegungen;Datei'].concat(rows).join('\r\n')) });
    return files;
  }
  /* ausgewählte Teile in die Verschachtelung (je Dicke und Werkstoff eigene Tafeln) */
  function nest() {
    const gew = (teile || []).filter(g => g.an);
    if (!gew.length) { ctx.toast('Kein Teil ausgewählt.'); return; }
    ctx.closeFileDialog();
    ctx.toNesting(gew.map(g => ({ name: g.name, flat: g.flat, t: g.flat.t, qty: g.n, material: matName(matVon(g)) })));
  }
  function zip() {
    if (!teile || !teile.some(g => g.an)) { ctx.toast('Kein Teil ausgewählt.'); return; }
    const files = dateien();
    ctx.download(`${ctx.safeName()}-Blechteile.zip`, ctx.makeZip(files));
    ctx.toast(`${files.length - 1} Abwicklung${files.length - 1 === 1 ? '' : 'en'} als DXF gespeichert.`);
  }
  return { oeffneBlechpaket: oeffne, blechpaketEingabe: eingabe, blechpaketZeige: zeige, blechpaketZip: zip, blechpaketNest: nest, blechpaketDateien: () => (teile ? dateien() : []), get blechpaketTeile() { return teile; } };
}
