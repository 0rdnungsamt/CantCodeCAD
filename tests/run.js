// Prüfstand: baut alle Beispiele aus Projekte/Beispiele mit dem Geometriekern auf
// und vergleicht Körper, Volumen, Flächen und Hüllbox mit tests/referenz.json.
import { Kernel } from '../src/kernel.js';
import { validateDoc, syncWorkPlanes, compAllBodies } from '../src/doc.js';
import { DEFAULT_RULE } from '../src/sheet.js';

const TIMEOUT = 120000;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let kernel = null;
async function freshKernel() {
  if (kernel) kernel.worker.terminate();
  kernel = new Kernel();
  await kernel.init();
}
const round = (v, n) => { const r = Math.round(v * 10 ** n) / 10 ** n; return Object.is(r, -0) ? 0 : r; };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`Zeitüberschreitung nach ${ms / 1000} s`)), ms))]);

/* Messwerte eines Beispiels: alles, was sich bei einer Änderung am Kern nicht verschieben darf */
async function measure(path) {
  const r = await fetch('/Projekte/' + path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
  if (!r.ok) throw new Error('Datei nicht gefunden');
  const doc = validateDoc(await r.json());
  syncWorkPlanes(doc.features);
  const ctx = {
    hidden: [],
    components: (doc.components || []).map(c => ({ id: c.id, bodies: compAllBodies(doc, c.id) })),
    inserts: doc.inserts || [],
    sheet: { ...DEFAULT_RULE, ...(doc.sheet || {}) }
  };
  const t0 = performance.now();
  const res = await withTimeout(kernel.build(doc.features, undefined, ctx), TIMEOUT);
  const ms = Math.round(performance.now() - t0);
  const names = Object.fromEntries(doc.features.map(f => [f.id, f.name]));
  const errors = Object.entries(res.status).filter(([, s]) => !s.ok).map(([id, s]) => `${names[id] || id}: ${s.error || s.msg || 'Fehler'}`).sort();
  const bodies = {};
  for (const id of [...res.bodies].sort()) {
    const p = await kernel.props(id);
    bodies[id] = { volume: round(p.volume, 3), area: round(p.area, 3), faces: p.faces, edges: p.edges, bbox: p.bbox.map(c => c.map(v => round(v, 4))) };
  }
  return { ms, result: { features: doc.features.length, errors, bodies, flat: !!res.sheet } };
}

/* Referenz lesbar: ein Körper pro Zeile */
function pretty(ref) {
  const ex = Object.entries(ref.examples).map(([path, r]) => {
    const bodies = Object.entries(r.bodies).map(([id, b]) => `    ${JSON.stringify(id)}: ${JSON.stringify(b)}`).join(',\n');
    return `  ${JSON.stringify(path)}: {\n   "features": ${r.features}, "flat": ${r.flat}, "errors": ${JSON.stringify(r.errors)},\n   "bodies": {\n${bodies}\n   }\n  }`;
  }).join(',\n');
  return `{\n "created": ${JSON.stringify(ref.created)},\n "examples": {\n${ex}\n }\n}\n`;
}

/* Abweichungen gegen die Referenz als lesbare Liste */
const relDiff = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
function compare(ref, cur) {
  const out = [];
  if (ref.features !== cur.features) out.push(`Features: ${ref.features} → ${cur.features}`);
  const re = new Set(ref.errors), ce = new Set(cur.errors);
  cur.errors.filter(e => !re.has(e)).forEach(e => out.push(`neuer Fehler: ${e}`));
  ref.errors.filter(e => !ce.has(e)).forEach(e => out.push(`Fehler behoben: ${e}`));
  if (ref.flat !== cur.flat) out.push(`Abwicklung: ${ref.flat ? 'ja' : 'nein'} → ${cur.flat ? 'ja' : 'nein'}`);
  const ids = new Set([...Object.keys(ref.bodies), ...Object.keys(cur.bodies)]);
  for (const id of ids) {
    const a = ref.bodies[id], b = cur.bodies[id];
    if (!a) { out.push(`Körper ${id} ist neu`); continue; }
    if (!b) { out.push(`Körper ${id} fehlt`); continue; }
    if (relDiff(a.volume, b.volume) > 1e-5) out.push(`${id}: Volumen ${a.volume.toFixed(3)} → ${b.volume.toFixed(3)} mm³`);
    if (relDiff(a.area, b.area) > 1e-5) out.push(`${id}: Oberfläche ${a.area.toFixed(3)} → ${b.area.toFixed(3)} mm²`);
    if (a.faces !== b.faces) out.push(`${id}: Flächen ${a.faces} → ${b.faces}`);
    if (a.edges !== b.edges) out.push(`${id}: Kanten ${a.edges} → ${b.edges}`);
    const bb = (a.bbox || []).flat(), cb = (b.bbox || []).flat();
    if (bb.length !== cb.length || bb.some((v, i) => Math.abs(v - cb[i]) > 1e-3)) out.push(`${id}: Hüllbox ${JSON.stringify(a.bbox)} → ${JSON.stringify(b.bbox)}`);
  }
  return out;
}

function row(path, cls, status, detail, ms) {
  const tr = document.createElement('tr');
  tr.className = cls;
  tr.innerHTML = `<td>${esc(path.replace(/^\/?Beispiele\//, ''))}</td><td class="st">${esc(status)}</td><td class="ms">${ms == null ? '' : ms + ' ms'}</td><td>${detail.map(d => `<div>${esc(d)}</div>`).join('')}</td>`;
  $('#rows').append(tr);
  return tr;
}

async function run() {
  $('#rows').innerHTML = '';
  $('#save').disabled = true;
  $('#summary').textContent = 'Geometriekern startet …';
  const files = (await (await fetch('/__files', { cache: 'no-store' })).json()).map(f => f.path.replace(/^\//, '')).filter(p => p.startsWith('Beispiele/')).sort();
  const filter = new URLSearchParams(location.search).get('nur');
  const list = filter ? files.filter(p => p.toLowerCase().includes(filter.toLowerCase())) : files;
  let ref = null;
  try { const r = await fetch('referenz.json', { cache: 'no-store' }); if (r.ok) ref = await r.json(); } catch (_) { /* keine Referenz */ }
  await freshKernel();
  const results = {};
  const count = { ok: 0, diff: 0, fail: 0, neu: 0 };
  const t0 = performance.now();
  for (const [i, path] of list.entries()) {
    $('#summary').textContent = `${i + 1} / ${list.length}: ${path}`;
    try {
      const { ms, result } = await measure(path);
      results[path] = result;
      const base = ref && ref.examples[path];
      if (!base) { count.neu++; row(path, 'neu', 'neu', result.errors.length ? result.errors : [`${Object.keys(result.bodies).length} Körper`], ms); continue; }
      const d = compare(base, result);
      if (d.length) { count.diff++; row(path, 'diff', 'Abweichung', d, ms); }
      else { count.ok++; row(path, 'ok', 'OK', [], ms); }
    } catch (err) {
      count.fail++;
      row(path, 'fail', 'Abbruch', [err.message], null);
      await freshKernel();
    }
  }
  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  const missing = ref && !filter ? Object.keys(ref.examples).filter(p => !list.includes(p)) : [];
  missing.forEach(p => { count.diff++; row(p, 'diff', 'fehlt', ['Beispiel ist in der Referenz, aber nicht mehr im Ordner'], null); });
  const parts = [`${count.ok} OK`, count.diff && `${count.diff} mit Abweichung`, count.fail && `${count.fail} abgebrochen`, count.neu && `${count.neu} ohne Referenz`].filter(Boolean);
  $('#summary').textContent = `${list.length} Beispiele in ${sec} s: ${parts.join(', ')}`;
  document.body.dataset.state = count.diff || count.fail ? 'fail' : 'ok';
  const next = { created: new Date().toISOString(), examples: filter && ref ? { ...ref.examples, ...results } : results };
  window.testResult = { count, results, reference: next, text: pretty(next) };
  // Der Headless-Prüfstand holt das Ergebnis beim lokalen Entwicklungsserver
  // ab. Dadurch muss er während langer WebGL-/WASM-Aufbauten nicht in den
  // Renderer hinein auswerten.
  const token = new URLSearchParams(location.search).get('testToken');
  if (token) {
    try {
      await fetch('/__testresult?token=' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, results, text: pretty(next), bad: [...document.querySelectorAll('#rows tr.diff, #rows tr.fail')].map(e => e.textContent.replace(/\s+/g, ' ').trim()), seconds: (performance.now() - t0) / 1000 })
      });
    } catch (_) { /* Der Prüflauf bleibt auch ohne Reporter aussagekräftig. */ }
  }
  $('#save').disabled = false;
  $('#save').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([pretty(next)], { type: 'application/json' }));
    a.download = 'referenz.json';
    a.click();
  };
}

$('#run').onclick = run;
run();
