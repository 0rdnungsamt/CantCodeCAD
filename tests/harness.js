// Gemeinsame Hilfen der Oberflächen-Prüfstände (ui.js, rundgang.js): App im iframe (?test = eigener Speicherplatz),
// Bedienhilfen, Prüfungen und Ablauf mit Ergebnistabelle.
// Klicks im Modell laufen über vp.cb.onPick, also dieselbe Funktion, die das Ansichtsfenster beim Mausklick aufruft.
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export let W, D, C; // Fenster, Dokument und window.cantcodecad der App

export async function waitFor(fn, ms = 8000, what = 'Bedingung') {
  const t0 = performance.now();
  for (;;) {
    let v; try { v = fn(); } catch (_) { v = null; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`Zeitüberschreitung: ${what}`);
    await sleep(60);
  }
}
/* warten, bis der Kern nach einer Änderung neu gebaut hat */
export async function built(prev, ms = 10000, what = 'Neuaufbau') {
  await waitFor(() => C.lastBuild && C.lastBuild !== prev, ms, what);
  await waitFor(() => D.querySelector('#busy').hidden, ms, 'Kern fertig');
  await sleep(80);
}
export async function act(fn, ms) { const prev = C.lastBuild; await fn(); await built(prev, ms); }

/* ?lang=en: App auf Englisch (eigener Prüfspeicher), fehlende Übersetzungen werden gesammelt (tools/pruefen.mjs --englisch) */
const LANG_EN = new URLSearchParams(location.search).get('lang') === 'en';
export const missingEn = new Set();
const collectMissing = () => { try { (W && W.cantcodecadI18n ? W.cantcodecadI18n.missing : []).forEach(m => missingEn.add(m)); } catch (_) { /* Fenster weg */ } };
export async function loadApp() {
  const fr = $('#app');
  collectMissing();
  if (LANG_EN) { const p = JSON.parse(localStorage.getItem('cc.prefs.test') || '{}'); p.lang = 'en'; localStorage.setItem('cc.prefs.test', JSON.stringify(p)); }
  fr.src = '/index.html?test&t=' + Date.now();
  await new Promise(r => { fr.onload = r; });
  W = fr.contentWindow; D = W.document;
  W.addEventListener('error', e => appErrors.push(e.message));
  C = await waitFor(() => W.cantcodecad, 15000, 'App geladen');
  await waitFor(() => /bereit|ready/.test(D.querySelector('#kstate').textContent), 30000, 'Geometriekern bereit');
}
export let appErrors = [];
/* Die App lädt sich selbst neu (z. B. nach dem Sprachwechsel): auslösen, auf das neue Fenster warten, W/D/C neu setzen */
export async function appReloads(trigger) {
  const fr = $('#app');
  const loaded = new Promise(r => { fr.onload = r; });
  await trigger();
  await loaded;
  W = fr.contentWindow; D = W.document;
  W.addEventListener('error', e => appErrors.push(e.message));
  C = await waitFor(() => W.cantcodecad, 15000, 'App neu geladen');
  await waitFor(() => /bereit|ready/.test(D.querySelector('#kstate').textContent), 30000, 'Geometriekern bereit');
}

/* ---------- Bedienhilfen ---------- */
export const q = s => { const el = D.querySelector(s); if (!el) throw new Error(`Element fehlt: ${s}`); return el; };
export const click = s => q(s).click();
export async function cmd(menu, name) {
  // passenden Reiter wählen (die App merkt sich den zuletzt benutzten)
  const tab = D.querySelector(`[data-rtab="${menu.split(':')[0]}"]`);
  if (tab && tab.getAttribute('aria-selected') !== 'true') { tab.click(); await sleep(120); }
  click(`[data-menu="${menu}"]`); await sleep(120); click(`#fmenu [data-cmd="${name}"]`); await waitFor(() => !D.querySelector('#dialog').hidden, 4000, 'Dialog'); await sleep(150); }
export function num(k, v) { const i = q(`#dialog input[data-k="${k}"]`); i.value = String(v); i.dispatchEvent(new W.Event('input', { bubbles: true })); i.dispatchEvent(new W.Event('change', { bubbles: true })); }
export async function seg(k, v) { const s = D.querySelector(`#dialog select[data-segsel="${k}"]`); if (s) { s.value = v; s.dispatchEvent(new W.Event('change', { bubbles: true })); } else click(`#dialog [data-k="${k}"][data-v="${v}"]`); await sleep(250); }
/* ok(ms): Bestätigen und auf den Neuaufbau warten. ms nur bei Schritten angeben,
   die wirklich lange bauen (großer Import, Vereinfachen) – bei mehreren Prüfständen
   parallel laufen sonst selbst richtige Abläufe in die Grundgrenze. */
export async function ok(ms) { await act(async () => click('#dialog [data-cmd="ok"]'), ms); }
export const pick = h => C.vp.cb.onPick(h, {});
export const faces = () => C.lastBuild.mesh.faces.map((info, index) => ({ kind: 'face', index, info, point: info.center }));
export const edges = () => C.lastBuild.mesh.edges.map((info, index) => ({ kind: 'edge', index, info, point: info.mid }));
export const vol = async id => (await C.kernel.props(id)).volume;
export const bbox = async id => (await C.kernel.props(id)).bbox;
export async function newDoc(kind = 'part') {
  click('[data-cmd="new"]'); await sleep(150);
  // „Neu“ öffnet das Startfenster: Einzelteil oder Baugruppe wählen
  const tile = D.querySelector(`#start [data-start="${kind}"]`);
  if (tile) { tile.click(); await sleep(150); }
  const ask = D.getElementById('askbox');
  if (ask) [...ask.querySelectorAll('button')].find(b => /Verwerfen|Discard/.test(b.textContent)).click();
  await waitFor(() => C.doc.features.length === 0 && C.doc.kind === kind, 4000, 'leeres Dokument');
  await sleep(200);
  // neue Baugruppe öffnet gleich „Teil einfügen“: hier schließen
  if (kind === 'assembly') { await sleep(150); const c = D.querySelector('#dialog:not([hidden]) [data-cmd="file-cancel"]'); if (c) { c.click(); await sleep(100); } }
}
/* Zeichnung/Abwicklung schließen; Rückfrage „nicht gespeichert“ mit Verwerfen beantworten, bis das Modell da ist */
export async function closeDrawing() {
  click('[data-cmd="drawing-close"]'); await sleep(150);
  const ask = D.getElementById('askbox');
  if (ask) { [...ask.querySelectorAll('button')].find(b => /Verwerfen|Discard/.test(b.textContent)).click(); await sleep(100); }
  await waitFor(() => D.body.dataset.mode === 'model' && C.doc.kind !== 'drawing', 20000, 'zurück im Modell');
  await sleep(200);
}
/* Vergleichsstand erst nach dem Öffnen nehmen: ein später Neuaufbau des vorigen Ablaufs (z. B. nach Abbrechen eines
   Dialogs) kann während des Ladens der Datei fertig werden und zählte sonst schon als Bau des geöffneten Dokuments.
   Gewartet wird damit auch dessen Rest ab (schweres Beispiel nach schwerem Bau, alle Teile parallel): 30 s. */
export async function openExample(name) { await C.open('Beispiele/' + name + '.cantcodecad'); await built(C.lastBuild, 30000); }
export async function box(w, l, h, extra = {}) {
  await cmd('solid:create', 'box'); num('w', w); num('l', l); num('h', h);
  for (const [k, v] of Object.entries(extra)) num(k, v);
  // Quader sind schnell gebaut, aber unter Last mit vielen Körpern im Dokument reichen 10 s nicht immer
  await ok(20000);
}
export async function newComp(name, activate = true) {
  await cmd('asm:create', 'component');
  const nm = q('#dialog [data-comp="name"]'); nm.value = name; nm.dispatchEvent(new W.Event('input', { bubbles: true }));
  const cb = q('#dialog [data-comp="activate"]'); if (cb.checked !== activate) cb.click();
  click('#dialog [data-cmd="comp-ok"]'); await sleep(300);
  return C.doc.components.find(c => c.name === name);
}
export function editTimeline(i) {
  q(`#timeline-items [data-tl="${i}"]`).dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 500 }));
  [...D.querySelectorAll('#ctxmenu button')].find(b => /Bearbeiten/.test(b.textContent)).click();
}

/* ---------- Prüfungen ---------- */
export let checks = [];
export function expect(cond, text) { checks.push({ ok: !!cond, text }); }
export function near(a, b, tol, text) { expect(Math.abs(a - b) <= tol, `${text}: ${typeof a === 'number' ? a.toFixed(3) : a} (erwartet ${b})`); }

/* Maus in der Skizze: Skizzenpunkt (u, v) → Bildschirm → Editor (wie ein echter Klick ohne Ziehen) */
export function sketchEvt(u, v) {
  const ed = C.editor, w = [0, 1, 2].map(k => ed.pl.o[k] + ed.pl.x[k] * u + ed.pl.y[k] * v);
  const s = C.vp.toScreen(w), r = C.vp.canvas.getBoundingClientRect();
  return { clientX: r.left + s[0], clientY: r.top + s[1], button: 0, buttons: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} };
}
export function sketchClick(u, v) { const e = sketchEvt(u, v); C.editor.onPointerMove(e); C.editor.onPointerUp(e, false); }
/* Klick in einer 3D-Skizze: der Weltpunkt liegt ohne Ebene direkt im Raum.
   Der 3D-Editor zeichnet schon beim Drücken, also erst down, dann up. */
export function sketch3dEvt(w) {
  const s = C.vp.toScreen(w), r = C.vp.canvas.getBoundingClientRect();
  return { clientX: r.left + s[0], clientY: r.top + s[1], button: 0, buttons: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} };
}
export function sketch3dClick(w) { const e = sketch3dEvt(w); C.editor.onPointerMove(e); C.editor.onPointerDown(e); C.editor.onPointerUp(e); }

function row(name, cls, status, lines, ms) {
  const tr = document.createElement('tr');
  tr.className = cls;
  tr.innerHTML = `<td>${esc(name)}</td><td class="st">${esc(status)}</td><td class="ms">${ms == null ? '' : ms + ' ms'}</td><td>${lines.map(l => `<div class="${l.ok ? 'pass' : 'failline'}">${l.ok ? '✓' : '✗'} ${esc(l.text)}</div>`).join('')}</td>`;
  $('#rows').append(tr);
}

export async function runSuite(SCENARIOS) {
  $('#rows').innerHTML = '';
  document.body.dataset.state = '';
  $('#summary').textContent = 'App startet …';
  appErrors = [];
  await loadApp();
  const filter = new URLSearchParams(location.search).get('nur');
  let list = filter ? SCENARIOS.filter(([n]) => n.toLowerCase().includes(filter.toLowerCase())) : SCENARIOS;
  /* Nur ein zusammenhängender Abschnitt (tools/pruefen.mjs startet die Teile in eigenen Browsern parallel):
     ?teil=k/n = k-ter von n gleich langen Abschnitten, ?teil=a-b = Abläufe a bis b−1 (b leer = bis zum Ende) */
  const tp = new URLSearchParams(location.search).get('teil') || '';
  let m = /^(\d+)\/(\d+)$/.exec(tp);
  if (m && +m[2] > 1) { const k = +m[1], n = +m[2]; list = list.slice(Math.floor(k * list.length / n), Math.floor((k + 1) * list.length / n)); }
  m = /^(\d+)-(\d*)$/.exec(tp);
  if (m) list = list.slice(+m[1], m[2] === '' ? undefined : +m[2]);
  const count = { ok: 0, fail: 0 }, t0 = performance.now(), results = [];
  for (const [i, [name, fn]] of list.entries()) {
    $('#summary').textContent = `${i + 1} / ${list.length}: ${name}`;
    checks = []; const errs0 = appErrors.length, s0 = performance.now();
    let crash = null;
    try { await fn(); } catch (err) { crash = err.message; }
    const lines = checks.slice();
    if (crash) lines.push({ ok: false, text: 'Abbruch: ' + crash });
    appErrors.slice(errs0).forEach(m => lines.push({ ok: false, text: 'Fehler in der App: ' + m }));
    const good = lines.every(l => l.ok);
    count[good ? 'ok' : 'fail']++;
    results.push({ name, ok: good, lines, ms: Math.round(performance.now() - s0) });
    row(name, good ? 'ok' : 'fail', good ? 'OK' : 'Fehler', lines, Math.round(performance.now() - s0));
    if (crash) { try { await loadApp(); } catch (_) { /* nächster Versuch */ } }
    collectMissing();
  }
  $('#summary').textContent = `${list.length} Abläufe in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${count.ok} OK${count.fail ? `, ${count.fail} mit Fehler` : ''}`;
  document.body.dataset.state = count.fail ? 'fail' : 'ok';
  window.testResult = { count, results };
  // Der Headless-Prüfstand liest das Ergebnis beim lokalen Entwicklungsserver
  // ab. So muss er nicht während langer WebGL-/WASM-Aufbauten in den Renderer
  // hinein auswerten.
  const token = new URLSearchParams(location.search).get('testToken');
  if (token) {
    try {
      await fetch('/__testresult?token=' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, results, seconds: (performance.now() - t0) / 1000, ...(LANG_EN ? { missing: [...missingEn] } : {}) })
      });
    } catch (_) { /* Der Prüflauf bleibt auch ohne Reporter aussagekräftig. */ }
  }
}
