// cantcodecad – Prüfstände ohne sichtbares Browserfenster (Chrome/Edge headless, Ergebnis über lokalen Reporter).
// Aufruf:  node tools/pruefen.mjs [kern] [ui] [rundgang] [--nur=Text] [--teile=N] [--software] [--englisch] [--port=8766] [--nacheinander] [--referenz]
// Ohne Auswahl laufen alle drei Prüfstände parallel. Oberfläche und Rundgang laufen dazu in Teilen (Standard je nach
// Prozessorkernen: Oberfläche bis 8, Rundgang bis 4) in eigenen Browsern mit eigenem Profil, also eigenem Speicher; --teile=1 schaltet das ab.
// --englisch: Oberfläche auf Englisch, danach die Texte ohne Übersetzung (für src/i18n-en.js); Abläufe, die deutsche
// Texte prüfen, schlagen dabei erwartungsgemäß fehl – der Rundgang (`rundgang --englisch`) läuft grün durch.
// Startet bei Bedarf tools/server.ps1.
// Ergebnis: Zusammenfassung und alle Fehler; Rückgabewert 0 = alles grün, 1 = Fehler, 2 = Aufbau gescheitert.
// --referenz schreibt nach einem fehlerfreien Kernlauf tests/referenz.json (neues Beispiel annehmen).
// Benötigt nur Node ≥ 22 (eingebautes WebSocket) und einen installierten Chrome oder Edge – keine Pakete.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = Number(opt('port', 8766)), NUR = opt('nur', ''), SEQ = args.includes('--nacheinander'), REF = args.includes('--referenz');
const SOFT = args.includes('--software'), EN = args.includes('--englisch');
/* Teile je Prüfstand: jeder Teil braucht einen eigenen Browser samt Geometriekern (WASM-Worker). Standard nach
   Prozessorkernen: Oberfläche bis 8 (16 Kerne: 590 s → 80 s), Rundgang bis 4 (sein längster Ablauf allein ~100 s). */
const TEILE = opt('teile', null);
const teile = (max, perCore) => Math.max(1, TEILE != null ? Number(TEILE) : Math.min(max, Math.floor(cpus().length / perCore) || 1));
const BENCHES = {
  kern: { url: '/tests/index.html', max: 10 * 60e3, teile: 1 },
  ui: { url: '/tests/ui.html', max: 20 * 60e3, teile: teile(8, 2) },
  rundgang: { url: '/tests/rundgang.html', max: 25 * 60e3, teile: teile(4, 4) }
};
const chosen = args.filter(a => BENCHES[a]);
const run = chosen.length ? chosen : Object.keys(BENCHES);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = `http://localhost:${PORT}`;

async function serverUp() { try { return (await fetch(base + '/index.html', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { return false; } }
async function ensureServer() {
  if (await serverUp()) return null;
  console.log(`Starte Server auf Port ${PORT} …`);
  const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'tools', 'server.ps1'), '-Port', String(PORT), '-NoBrowser'], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 40; i++) { await sleep(250); if (await serverUp()) return p; }
  p.kill();
  throw new Error(`Server auf Port ${PORT} startet nicht`);
}

function findBrowser() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = process.env.LOCALAPPDATA || '';
  const list = [process.env.CANTCODECAD_BROWSER, join(pf, 'Google\\Chrome\\Application\\chrome.exe'), join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), join(la, 'Google\\Chrome\\Application\\chrome.exe'),
    join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')].filter(Boolean);
  return list.find(p => existsSync(p));
}

function startBrowser(url) {
  const exe = findBrowser();
  if (!exe) throw new Error('Kein Chrome/Edge gefunden (CANTCODECAD_BROWSER setzen)');
  const profile = mkdtempSync(join(tmpdir(), 'cantcodecad-pruefen-'));
  const log = { text: '' };
  const p = spawn(exe, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    // Mit Grafikkarte (ANGLE/D3D11): SwiftShader zeichnet auf dem Prozessor und bremst parallele Teile auf die Hälfte.
    // --software für Rechner ohne nutzbaren Grafiktreiber.
    ...(SOFT ? ['--disable-features=Vulkan', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist']),
    '--window-size=1600,1000', url], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', data => { log.text = (log.text + data).slice(-2000); });
  return { p, profile, log };
}

async function testResult(token) {
  let r;
  // ein einzelner langsamer Abruf (Server beschäftigt) bricht nicht ab – beim nächsten Durchlauf wieder fragen
  try { r = await fetch(`${base}/__testresult?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' }); }
  catch (err) { if (err.name === 'TimeoutError' || err.name === 'AbortError') return null; throw err; }
  if (r.status === 204) return null;
  if (r.status === 404) throw new Error('Der laufende cantcodecad-Server ist älter als der Prüfstand. Server beenden und neu starten.');
  if (!r.ok) throw new Error(`Test-Reporter antwortet mit HTTP ${r.status}`);
  return r.json();
}
/* Dauer jedes Ablaufs aus dem letzten vollständigen Lauf (nur auf diesem Rechner, nicht im Repo): damit werden die
   zusammenhängenden Abschnitte so geschnitten, dass alle Teile etwa gleich lang laufen */
const DAUER = join(tmpdir(), 'cantcodecad-pruefen-dauer.json');
const dauern = () => { try { return JSON.parse(readFileSync(DAUER, 'utf8')); } catch (_) { return {}; } };
function schnitte(name, n) {
  const ms = dauern()[name];
  if (!Array.isArray(ms) || ms.length < n) return [...Array(n).keys()].map(k => `${k}/${n}`);
  // kleinste längste Teildauer bei zusammenhängenden, nicht leeren Abschnitten (lineare Aufteilung, dynamisch)
  const m = ms.length, pre = [0];
  ms.forEach(v => pre.push(pre[pre.length - 1] + v));
  const best = [pre.map(v => v)], cut = [pre.map(() => 0)];
  for (let k = 1; k < n; k++) {
    best.push([]); cut.push([]);
    for (let i = 0; i <= m; i++) {
      best[k][i] = Infinity;
      for (let j = k; j < i; j++) { const v = Math.max(best[k - 1][j], pre[i] - pre[j]); if (v < best[k][i]) { best[k][i] = v; cut[k][i] = j; } }
    }
  }
  const cuts = [];
  for (let k = n - 1, i = m; k > 0; k--) { i = cut[k][i]; cuts.unshift(i); }
  cuts.unshift(0);
  return cuts.map((a, k) => `${a}-${k + 1 < cuts.length ? cuts[k + 1] : ''}`);
}
/* Ein Prüfstand in n Teilen: je Teil ein Browser, die Ergebnisse werden zusammengelegt (Abläufe in der Reihenfolge) */
async function runBench(name) {
  const B = BENCHES[name], n = NUR ? 1 : B.teile;
  if (n <= 1) return runPart(name, null);
  const t0 = Date.now();
  const parts = await Promise.all(schnitte(name, n).map(t => runPart(name, t)));
  const s = Math.round((Date.now() - t0) / 1000);
  // ein hängender Teil kostet nicht das Ergebnis der anderen: er zählt als ein Fehler mit seiner Meldung
  const good = parts.filter(p => p.raw), broken = parts.filter(p => !p.raw);
  const results = good.flatMap(p => p.raw.results).concat(broken.map(p => ({ name: p.sum, ok: false, lines: [] }))), c = { ok: 0, fail: broken.length };
  const missing = [...new Set(good.flatMap(p => p.raw.missing || []))];
  good.forEach(p => { c.ok += Number(p.raw.count.ok || 0); c.fail += Number(p.raw.count.fail || 0); });
  const sec = Math.max(0, ...good.map(p => Number(p.raw.seconds || 0)));
  if (!broken.length && results.every(r => r.ms != null)) { const d = dauern(); d[name] = results.map(r => r.ms); try { writeFileSync(DAUER, JSON.stringify(d)); } catch (_) { /* egal */ } }
  return summarize(name, { count: c, results, seconds: sec, missing }, s, ` in ${n} Teilen (${parts.map(p => (p.raw ? Math.round(p.raw.seconds || 0) : '–')).join(' / ')} s)`);
}
async function runPart(name, teil) {
  const B = BENCHES[name], t0 = Date.now();
  const token = randomUUID();
  const q = new URLSearchParams({ testToken: token }); if (NUR) q.set('nur', NUR); if (teil) q.set('teil', teil); if (EN) q.set('lang', 'en');
  const browser = startBrowser(`${base}${B.url}?${q}`);
  let result = null;
  try {
    while (Date.now() - t0 < B.max) {
      await sleep(1000);
      result = await testResult(token);
      if (result) break;
    }
  } finally {
    browser.p.kill(); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* Profil noch gesperrt */ }
  }
  const s = Math.round((Date.now() - t0) / 1000);
  if (!result || !result.count || !result.results) return { name, ok: false, sum: `kein Ergebnis nach ${s} s${teil ? ` (Teil ${teil})` : ''}${browser.log.text ? ' (Browser beendet oder blockiert)' : ''}`, bad: [], s };
  if (teil) return { name, raw: result, s };
  return summarize(name, result, s, '');
}
function summarize(name, result, s, extra) {
  const c = result.count, sec = Number(result.seconds || s).toFixed(1);
  if (!Array.isArray(result.results)) {
    // Kern: results = { Beispielpfad: Ergebnis }, count = { ok, diff, fail, neu }
    const total = Object.keys(result.results).length;
    const parts = [`${c.ok} OK`, c.diff && `${c.diff} mit Abweichung`, c.fail && `${c.fail} abgebrochen`, c.neu && `${c.neu} ohne Referenz`].filter(Boolean);
    const bad = (result.bad || []).map(b => `  ✗ ${b}`).slice(0, 40);
    return { name, ok: !c.diff && !c.fail, sum: `${total} Beispiele in ${sec} s: ${parts.join(', ')}`, bad, s, text: result.text };
  }
  const bad = result.results.filter(r => !r.ok).flatMap(r => [`  ✗ ${r.name}`, ...(r.lines || []).filter(l => !l.ok).map(l => `      ${l.text}`)]).slice(0, 40);
  const total = Number(c.ok || 0) + Number(c.fail || 0);
  const sum = `${total} Abläufe in ${sec} s${extra}: ${c.ok} OK${c.fail ? `, ${c.fail} mit Fehler` : ''}`;
  return { name, ok: !c.fail, sum, bad, s, missing: result.missing };
}

const LABEL = { kern: 'Kern', ui: 'Oberfläche', rundgang: 'Befehlsrundgang' };
let srv = null, code = 0;
try {
  srv = await ensureServer();
  console.log(`Prüfe ${run.map(n => LABEL[n]).join(', ')}${NUR ? ` (nur „${NUR}“)` : ''} – ohne Fenster …`);
  const results = [];
  if (SEQ) for (const n of run) results.push(await runBench(n));
  else results.push(...await Promise.all(run.map(n => runBench(n))));
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${LABEL[r.name].padEnd(16)} ${r.sum}  (${r.s} s)`);
    r.bad.slice(0, 40).forEach(l => console.log(l));
    if (EN && r.missing) {
      // deutsch aussehende Texte ohne Übersetzung (Namen aus Beispielen und Zahlen fallen meist heraus)
      const de = r.missing.filter(m => /[äöüÄÖÜß„“]|(der|die|das|und|mit|ist|nicht|ein|eine|einen|im|auf|für|zu|von|bei|aus|oder|wird|werden|noch|nur|als|den|dem|des|kein|keine|bis|neu|gewählt|anklicken)/i.test(m));
      console.log(`  Ohne Übersetzung: ${r.missing.length} Texte, davon ${de.length} deutsch aussehend:`);
      de.sort().forEach(m => console.log('    ' + m));
    }
    if (!r.ok) code = 1;
  }
  if (REF) {
    // Gewollte Änderungen annehmen: derselbe Text, den der Prüfstand im Browser als Datei anbietet
    const kern = results.find(r => r.name === 'kern');
    if (!kern || !kern.text) console.log('--referenz: kein Kernlauf – tests/referenz.json bleibt unverändert');
    else if (!kern.ok) console.log('--referenz: Kernlauf mit Abweichungen – tests/referenz.json bleibt unverändert');
    else { writeFileSync(join(ROOT, 'tests', 'referenz.json'), kern.text); console.log('tests/referenz.json geschrieben'); }
  }
} catch (err) {
  console.error('Prüfen nicht möglich: ' + err.message);
  code = 2;
} finally {
  if (srv) srv.kill();
}
process.exit(code);
