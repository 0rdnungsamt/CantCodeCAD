// Arbeitsbereich Verschachtelung (Nesting): Blech-Abwicklungen auf Tafeln legen.
// Gerechnet wird mit einem externen Blechnesting (Python), das über
// tools/nester_bridge.py auf Port 5057 läuft; cantcodecad liefert die Abwicklungen als DXF und zeigt die Tafeln.
import { Kernel } from './kernel.js';
import { validateDoc, syncWorkPlanes, compAllBodies, MATERIALS, isDefaultPartName } from './doc.js';
import { computeFlat, flatDXF, DEFAULT_RULE } from './sheet.js';
import { icon } from './icons.js';
import { NUM_LOCALE } from './i18n.js';

const PORT = 5057;
const BASE = `http://127.0.0.1:${PORT}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString(NUM_LOCALE);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHEETS = [[3000, 1500], [2500, 1250], [2000, 1000], [4000, 2000], [1500, 3000]];
const SEARCH = [[0, 'Nur Grundrechnung'], [60, '1 Minute weitersuchen'], [300, '5 Minuten weitersuchen'], [-1, 'Automatisch (bis 10 min nichts Besseres)']];
const ROTS = [[90, '90°'], [45, '45°'], [15, '15°'], [5, '5°'], [1, '1°'], [0, 'keine']];

/* ctx: { getDoc, getLastBuild, sheetRule, toast, download, onClose } */
export function createNesting(ctx) {
  const st = {
    open: false, parts: [], group: null, job: null, poll: 0, nester: 'unbekannt', busy: '',
    set: { w: 3000, h: 1500, edge: 10, gap: 5, rot: 90, search: 0, outline: false }
  };
  try { Object.assign(st.set, JSON.parse(localStorage.getItem('cc.nest') || '{}')); } catch (_) { /* egal */ }
  const saveSet = () => { try { localStorage.setItem('cc.nest', JSON.stringify(st.set)); } catch (_) { /* egal */ } };
  let kern = null; // eigener Geometriekern für Teile aus dem Projektordner
  let el = null;

  /* ---------- Nester erreichen ---------- */
  async function ping(ms = 1500) {
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
      const r = await fetch(`${BASE}/api/status`, { signal: c.signal, cache: 'no-store' });
      clearTimeout(t);
      return r.ok;
    } catch (_) { return false; }
  }
  async function ensureNester() {
    if (await ping()) { st.nester = 'bereit'; return true; }
    st.nester = 'startet'; render();
    let info = null;
    try { info = await (await fetch('/__nester?start=1', { cache: 'no-store' })).json(); } catch (_) { info = null; }
    if (!info) { st.nester = 'Der cantcodecad-Server kennt den Nester noch nicht (Server bzw. Desktop-Programm neu starten).'; render(); return false; }
    if (!info.ok) { st.nester = info.dir ? `Im Nester-Ordner fehlt .venv\\Scripts\\python.exe (${info.dir}). Einmal start.bat des Nesters ausführen.` : 'Nester nicht gefunden. Erwartet unter Desktop\\Nester\\…\\app.py oder als Pfad in tools/nester.json: { "dir": "…" }.'; render(); return false; }
    for (let i = 0; i < 40; i++) { await sleep(500); if (await ping(800)) { st.nester = 'bereit'; render(); return true; } }
    st.nester = 'Der Nester startet nicht. Läuft start.bat des Nesters von Hand?'; render();
    return false;
  }

  /* ---------- Teile ---------- */
  const groupKey = p => `${fmt(p.t, 2)} mm · ${p.material}`;
  const matLabel = (d, ids) => {
    const m = (ids || Object.keys(d.bodies || {})).map(id => (d.bodies || {})[id] && d.bodies[id].material).find(k => k && k !== 'none');
    return m && MATERIALS[m] ? MATERIALS[m].label : 'ohne Material';
  };
  function addFlat(name, source, flat, t, material, path) {
    if (!flat || !flat.bb) throw new Error('keine Abwicklung');
    const w = flat.bb[1][0] - flat.bb[0][0], h = flat.bb[1][1] - flat.bb[0][1];
    const same = st.parts.find(p => p.source === source && p.path === path && p.name === name);
    if (same) { same.qty++; return same; }
    const p = { id: Math.random().toString(36).slice(2, 9), name, source, path, t, material, w, h, qty: 1, dxf: flatDXF(flat, { bends: false }), nid: null };
    st.parts.push(p);
    if (!st.group) st.group = groupKey(p);
    return p;
  }
  function addCurrent() {
    const d = ctx.getDoc(), lb = ctx.getLastBuild();
    if (!lb || !lb.sheet) { ctx.toast('Das aktuelle Teil ist kein Blechteil (keine Abwicklung).'); return; }
    const rule = ctx.sheetRule();
    let flat;
    try { flat = computeFlat(d, rule, lb.sheet); } catch (err) { ctx.toast('Abwicklung nicht möglich: ' + err.message); return; }
    addFlat(d.name || 'Teil', 'doc', flat, Number(rule.t) || 0, matLabel(d), d.file || '');
    render();
  }
  async function addFile(path) {
    st.busy = `${path.split('/').pop()} wird abgewickelt …`; render();
    try {
      const r = await fetch('/Projekte/' + path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
      if (!r.ok) throw new Error('Datei nicht gefunden');
      const d = validateDoc(await r.json());
      syncWorkPlanes(d.features);
      const rule = { ...DEFAULT_RULE, ...(d.sheet || {}) };
      if (!kern) { kern = new Kernel(); await kern.init(); }
      const res = await kern.build(d.features, undefined, { hidden: [], components: (d.components || []).map(c => ({ id: c.id, bodies: compAllBodies(d, c.id) })), inserts: d.inserts || [], sheet: rule });
      if (!res || !res.sheet) throw new Error('kein Blechteil');
      addFlat(d.name && !isDefaultPartName(d.name) ? d.name : path.split('/').pop().replace(/\.cantcodecad$/i, ''), 'file', computeFlat(d, rule, res.sheet), Number(rule.t) || 0, matLabel(d), path);
    } catch (err) { ctx.toast(`${path}: ${err.message}`); }
    st.busy = ''; render();
  }
  async function addDxfFiles(files) {
    for (const f of files) {
      const text = await f.text();
      const p = { id: Math.random().toString(36).slice(2, 9), name: f.name.replace(/\.dxf$/i, ''), source: 'dxf', path: f.name, t: 0, material: 'DXF', w: 0, h: 0, qty: 1, dxf: text, nid: null };
      st.parts.push(p);
      if (!st.group) st.group = groupKey(p);
    }
    render();
  }

  /* ---------- Rechnen ---------- */
  async function upload(p) {
    if (p.nid) return p.nid;
    const fd = new FormData();
    fd.append('files', new Blob([p.dxf], { type: 'application/dxf' }), `${p.name.replace(/[\\/:*?"<>|]/g, '_')}.dxf`);
    const r = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: fd })).json();
    if (r.failed && r.failed.length) throw new Error(`${p.name}: ${r.failed[0].error}`);
    const q = r.parts[0];
    p.nid = q.id;
    if (!p.w) { p.w = q.width; p.h = q.height; }
    return p.nid;
  }
  async function start() {
    const parts = st.parts.filter(p => groupKey(p) === st.group && p.qty > 0);
    if (!parts.length) { ctx.toast('Keine Teile mit Stückzahl in dieser Gruppe.'); return; }
    if (!(await ensureNester())) return;
    stopPoll();
    st.busy = 'Teile werden übergeben …'; st.job = null; render();
    try {
      for (const p of parts) await upload(p);
      const s = st.set;
      const body = { parts: parts.map(p => ({ id: p.nid, quantity: p.qty, scale: 1, allow_rotation: s.rot > 0 })), sheet_width: s.w, sheet_height: s.h, edge_distance: s.edge, part_distance: s.gap, rotation_step: s.rot || 90, optimize: s.search, ruhe: 600 };
      const r = await (await fetch(`${BASE}/api/nest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (r.error) throw new Error(r.error);
      st.job = { id: r.job_id, status: 'running', progress: 0, message: 'Wird vorbereitet', version: -1, result: null, group: st.group, names: Object.fromEntries(parts.map(p => [p.nid, p.name])) };
      st.busy = '';
      poll();
    } catch (err) {
      st.busy = '';
      // Der Nester kennt nach einem Neustart die hochgeladenen Teile nicht mehr
      parts.forEach(p => { p.nid = null; });
      ctx.toast('Nesting nicht möglich: ' + err.message, 6000);
    }
    render();
  }
  function stopPoll() { clearTimeout(st.poll); st.poll = 0; }
  async function poll() {
    stopPoll();
    const j = st.job;
    if (!j || !st.open) return;
    try {
      const r = await (await fetch(`${BASE}/api/job/${j.id}?v=${j.version}`, { cache: 'no-store' })).json();
      Object.assign(j, { status: r.status, progress: r.progress, message: r.message, elapsed: r.elapsed, error: r.error });
      if (r.result) { j.result = r.result; j.version = r.version; }
    } catch (err) { j.message = 'Verbindung zum Nester unterbrochen'; }
    renderResult();
    if (st.job === j && j.status === 'running') st.poll = setTimeout(poll, 1000);
  }
  async function stop() { if (st.job) { try { await fetch(`${BASE}/api/job/${st.job.id}/stop`, { method: 'POST' }); } catch (_) { /* egal */ } } }
  async function downloadDxf() {
    const j = st.job;
    if (!j || !j.result) return;
    try {
      const r = await fetch(`${BASE}/api/download/${j.id}?outline=${st.set.outline ? 1 : 0}`);
      if (!r.ok) throw new Error('Download fehlgeschlagen');
      const blob = await r.blob(), multi = j.result.sheets.length > 1;
      ctx.download(`Nesting ${j.group.replace(/[^\w,. -]+/g, '')}${multi ? '.zip' : '.dxf'}`, blob);
    } catch (err) { ctx.toast(err.message); }
  }

  /* ---------- Darstellung ---------- */
  const partName = (nid, j) => (j && j.names && j.names[nid]) || (st.parts.find(p => p.nid === nid) || {}).name || nid;
  const hue = (id, ids) => Math.round((ids.indexOf(id) * 137.5) % 360);
  function sheetSVG(sh, res, ids) {
    const W = sh.width, H = sh.height, e = res.edge || 0;
    const rings = (k, kind) => (res.shapes[k] ? res.shapes[k][kind] : []).map(r => 'M' + r.map(q => `${q[0]} ${q[1]}`).join('L') + 'Z').join('');
    const parts = sh.placements.map(p => `<path d="${rings(p.k, 'shells')}${rings(p.k, 'holes')}" transform="translate(${p.x} ${p.y})" fill="hsl(${hue(p.p, ids)} 55% 62%)" fill-rule="evenodd" stroke="#1f2933" stroke-width="${Math.max(W, H) / 900}"><title>${esc(partName(p.p, st.job))}</title></path>`).join('');
    const rest = sh.rest > 0 ? `<rect x="${e}" y="${H - e - sh.rest}" width="${W - 2 * e}" height="${sh.rest}" fill="#2f8f46" fill-opacity="0.08"/>` : '';
    return `<svg viewBox="${-W * 0.01} ${-H * 0.01} ${W * 1.02} ${H * 1.02}" preserveAspectRatio="xMidYMid meet"><g transform="translate(0 ${H}) scale(1 -1)">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#52606d" stroke-width="${Math.max(W, H) / 500}"/>
      <rect x="${e}" y="${e}" width="${W - 2 * e}" height="${H - 2 * e}" fill="none" stroke="#9aa5b1" stroke-dasharray="${W / 150} ${W / 200}" stroke-width="${Math.max(W, H) / 1500}"/>
      ${rest}${parts}</g></svg>`;
  }
  function renderResult() {
    const box = el && el.querySelector('.nres');
    if (!box) return;
    const j = st.job;
    if (!j) { box.innerHTML = `<p class="info">${st.busy ? esc(st.busy) : 'Gruppe wählen und „Nesting starten“. Die Tafeln erscheinen hier, jede Verbesserung sofort.'}</p>`; return; }
    const r = j.result, running = j.status === 'running';
    const head = `<div class="nstat"><b>${running ? `${Math.round(j.progress * 100)} %` : j.status === 'error' ? 'Fehler' : 'Fertig'}</b><span>${esc(j.error || j.message || '')}</span>${j.elapsed != null ? `<em>${fmt(j.elapsed, 0)} s</em>` : ''}
      ${running ? '<button type="button" class="btn" data-n="stop">Stopp – Ergebnis übernehmen</button>' : ''}${r && r.sheets.length ? '<button type="button" class="btn primary" data-n="dxf">Tafeln als DXF</button>' : ''}</div>`;
    if (!r) { box.innerHTML = head + '<p class="info">Die erste Anordnung wird berechnet …</p>'; return; }
    const ids = [...new Set(r.sheets.flatMap(s => s.placements.map(p => p.p)))];
    const last = r.sheets[r.sheets.length - 1];
    const sum = `<p class="nsum"><b>${r.sheets.length} Tafel${r.sheets.length > 1 ? 'n' : ''}</b> · ${fmt(r.overall, 1)} % genutzt${last ? ` · ${fmt(last.rest, 0)} mm frei auf der letzten Tafel` : ''} · ${esc(r.strategy || '')}${r.unplaced && r.unplaced.length ? ` · <span class="nerr">nicht untergebracht: ${r.unplaced.map(u => `${u.n} × ${esc(partName(u.id, j))}`).join(', ')}</span>` : ''}</p>`;
    box.innerHTML = head + sum + r.sheets.map(sh => `<figure class="nsheet"><figcaption>Tafel ${sh.index + 1} · ${fmt(sh.width, 0)} × ${fmt(sh.height, 0)} · ${fmt(sh.utilization, 1)} % · ${fmt(sh.rest, 0)} mm frei oben · ${sh.counts.map(c => `${c.n} × ${esc(partName(c.id, j))}`).join(', ')}</figcaption>${sheetSVG(sh, r, ids)}</figure>`).join('');
  }
  function render() {
    if (!el) return;
    const groups = [...new Set(st.parts.map(groupKey))];
    if (st.group && !groups.includes(st.group)) st.group = groups[0] || null;
    const s = st.set;
    const sizeKey = `${s.w}x${s.h}`;
    const rows = st.parts.map(p => `<tr data-pid="${p.id}"${groupKey(p) === st.group ? '' : ' class="dim"'}>
        <td>${esc(p.name)}<small>${p.source === 'doc' ? 'aktuelles Teil' : esc(p.path)}</small></td>
        <td>${p.w ? `${fmt(p.w, 0)} × ${fmt(p.h, 0)}` : '–'}</td>
        <td><input type="number" min="0" step="0.5" data-pf="t" value="${p.t}"></td>
        <td><input type="text" data-pf="material" value="${esc(p.material)}"></td>
        <td><input type="number" min="0" step="1" data-pf="qty" value="${p.qty}"></td>
        <td><button type="button" class="iconbtn" data-n="del" title="Entfernen">${icon('close', 14)}</button></td></tr>`).join('');
    el.innerHTML = `<div class="npanel">
      <section class="nparts"><h3>Teile</h3>
        <div class="btns"><button type="button" class="chip" data-n="cur">${icon('smbase', 14)} Aktuelles Teil</button>
          <span class="nfiles"><button type="button" class="chip" data-n="files">${icon('folder', 14)} Aus dem Projektordner …</button><span class="nlist" hidden></span></span>
          <label class="chip">${icon('dxf', 14)} DXF-Dateien …<input type="file" accept=".dxf" multiple hidden data-n="dxffile"></label></div>
        ${st.parts.length ? `<table class="ntab"><thead><tr><th>Teil</th><th>Größe mm</th><th>Dicke</th><th>Material</th><th>Stück</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="info">Noch keine Teile. Blechteile werden automatisch abgewickelt; DXF-Dateien gehen direkt.</p>'}
        ${st.busy ? `<p class="info">${esc(st.busy)}</p>` : ''}
        ${groups.length ? `<h3>Tafelgruppe</h3><div class="btns">${groups.map(g => `<button type="button" class="chip" data-n="group" data-g="${esc(g)}" aria-pressed="${g === st.group}">${esc(g)} (${st.parts.filter(p => groupKey(p) === g).reduce((a, p) => a + (p.qty || 0), 0)} Stück)</button>`).join('')}</div><p class="info small">Jede Blechdicke und jedes Material kommt auf eigene Tafeln.</p>` : ''}
      </section>
      <section class="nset"><h3>Tafel</h3>
        <label class="row"><span>Format</span><select data-ns="size">${SHEETS.map(([w, h]) => `<option value="${w}x${h}"${`${w}x${h}` === sizeKey ? ' selected' : ''}>${w} × ${h}</option>`).join('')}<option value="custom"${SHEETS.some(([w, h]) => `${w}x${h}` === sizeKey) ? '' : ' selected'}>Eigenes Format</option></select></label>
        <label class="row"><span>Breite</span><span class="num"><input type="number" min="1" data-ns="w" value="${s.w}"><em>mm</em></span></label>
        <label class="row"><span>Höhe</span><span class="num"><input type="number" min="1" data-ns="h" value="${s.h}"><em>mm</em></span></label>
        <label class="row"><span>Randabstand</span><span class="num"><input type="number" min="0" step="1" data-ns="edge" value="${s.edge}"><em>mm</em></span></label>
        <label class="row"><span>Teileabstand</span><span class="num"><input type="number" min="0" step="0.5" data-ns="gap" value="${s.gap}"><em>mm</em></span></label>
        <label class="row"><span>Drehung</span><select data-ns="rot">${ROTS.map(([v, l]) => `<option value="${v}"${v === s.rot ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="row"><span>Suche</span><select data-ns="search">${SEARCH.map(([v, l]) => `<option value="${v}"${v === s.search ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="row"><span>Tafelrand in der DXF</span><input type="checkbox" data-ns="outline"${s.outline ? ' checked' : ''}></label>
        <div class="btns"><button type="button" class="btn primary" data-n="start"${st.group ? '' : ' disabled'}>Nesting starten</button></div>
        <p class="info small">Nester: ${esc(st.nester)}. Gerechnet wird mit deinem Blechnesting (Python) im Hintergrund.</p>
      </section>
      <section class="nres"></section></div>`;
    renderResult();
  }

  function wire() {
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-n]');
      if (!b) { if (!e.target.closest('.nfiles')) el.querySelectorAll('.nlist').forEach(x => { x.hidden = true; }); return; }
      const n = b.dataset.n, row = b.closest('[data-pid]');
      if (n === 'cur') addCurrent();
      else if (n === 'files') listFiles(b.nextElementSibling);
      else if (n === 'file') { b.closest('.nlist').hidden = true; addFile(b.dataset.path); }
      else if (n === 'del' && row) { st.parts = st.parts.filter(p => p.id !== row.dataset.pid); render(); }
      else if (n === 'group') { st.group = b.dataset.g; render(); }
      else if (n === 'start') start();
      else if (n === 'stop') stop();
      else if (n === 'dxf') downloadDxf();
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.n === 'dxffile') { addDxfFiles([...t.files]); t.value = ''; return; }
      const row = t.closest('[data-pid]');
      if (row && t.dataset.pf) {
        const p = st.parts.find(x => x.id === row.dataset.pid);
        if (!p) return;
        p[t.dataset.pf] = t.dataset.pf === 'material' ? (t.value.trim() || 'ohne Material') : Math.max(0, Number(t.value) || 0);
        if (t.dataset.pf === 'qty') p.qty = Math.round(p.qty);
        render();
        return;
      }
      const k = t.dataset.ns;
      if (!k) return;
      if (k === 'size') { if (t.value !== 'custom') { const [w, h] = t.value.split('x').map(Number); st.set.w = w; st.set.h = h; } }
      else if (k === 'outline') st.set.outline = t.checked;
      else st.set[k] = Number(t.value) || 0;
      saveSet(); render();
    });
    el.addEventListener('keydown', e => e.stopPropagation());
  }
  async function listFiles(box) {
    box.hidden = !box.hidden;
    if (box.hidden) return;
    box.innerHTML = '<span class="info">Lade …</span>';
    try {
      const files = await (await fetch('/__files', { cache: 'no-store' })).json();
      box.innerHTML = files.length ? files.map(f => `<button type="button" data-n="file" data-path="${esc(f.path.replace(/^\//, ''))}">${esc(f.path.replace(/^\//, ''))}</button>`).join('') : '<span class="info">Keine Dateien im Projektordner.</span>';
    } catch (_) { box.innerHTML = '<span class="info">Projektordner nicht erreichbar.</span>'; }
  }

  return {
    get isOpen() { return st.open; },
    async open(host) {
      st.open = true;
      el = host.querySelector('#nesting');
      if (!el) { el = document.createElement('div'); el.id = 'nesting'; el.className = 'nesting'; host.appendChild(el); wire(); }
      el.hidden = false;
      if (!st.parts.length) { const lb = ctx.getLastBuild(); if (lb && lb.sheet) addCurrent(); }
      render();
      ensureNester().then(render);
      if (st.job && st.job.status === 'running') poll();
    },
    close() { st.open = false; stopPoll(); if (el) el.hidden = true; },
    /* Teile aus „Alle Blechteile abwickeln“: [{ name, flat, t, qty, material }]. Schon übernommene Teile gleichen Namens
       bekommen die neue Abwicklung und Stückzahl; die Tafelgruppe springt auf die des ersten Teils. */
    addFlats(list) {
      let first = null;
      for (const x of list) {
        // Dicke aus der Körperform auf 0,01 mm (1,4999999 → 1,5); gleicher Name mit anderer Dicke ist ein anderes Teil
        const t = Math.round(x.t * 100) / 100;
        const alt = st.parts.find(p => p.source === 'paket' && p.name === x.name && p.t === t);
        if (alt) st.parts.splice(st.parts.indexOf(alt), 1);
        const w = x.flat.bb[1][0] - x.flat.bb[0][0], h = x.flat.bb[1][1] - x.flat.bb[0][1];
        const p = { id: Math.random().toString(36).slice(2, 9), name: x.name, source: 'paket', path: '', t, material: x.material, w, h, qty: x.qty, dxf: flatDXF(x.flat, { bends: false }), nid: null };
        st.parts.push(p);
        if (!first) first = p;
      }
      if (first) st.group = groupKey(first);
      if (st.open) render();
    },
    state: st
  };
}
