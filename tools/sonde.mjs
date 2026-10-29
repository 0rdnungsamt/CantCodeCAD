// cantcodecad – Sonde: eine Messseite (tools/sonde-*.html) ohne Fenster im Browser laufen lassen.
// Aufruf:  node tools/sonde.mjs sonde-loft [--port=8766]
// Die Seite schickt ihr Ergebnis an /__testresult?token=… (wie tools/pruefen.mjs) – hier wird es
// nur abgeholt und ausgedruckt. Sinnvoll für Messungen, die (noch) kein Prüfstand-Beispiel sind.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = Number(opt('port', 8766));
const page = (args.find(a => !a.startsWith('--')) || '').replace(/^\/+/, '');
if (!page) { console.error('Seite angeben, z. B. node tools/sonde.mjs sonde-loft'); process.exit(2); }
const base = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

let srv = null;
try {
  srv = await ensureServer();
  const token = randomUUID();
  const profile = mkdtempSync(join(tmpdir(), 'cantcodecad-sonde-'));
  const exe = findBrowser();
  if (!exe) throw new Error('Kein Chrome/Edge gefunden (CANTCODECAD_BROWSER setzen)');
  const p = spawn(exe, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=Vulkan', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=900,600', `${base}/tools/${page}.html?testToken=${token}`], { stdio: 'ignore', windowsHide: true });
  let erg = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60e3) {
    await sleep(1000);
    try {
      const r = await fetch(`${base}/__testresult?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (r.status === 200) { erg = await r.json(); break; }
    } catch (_) { /* Server beschäftigt – nächster Durchlauf */ }
  }
  p.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* Profil noch gesperrt */ }
  if (!erg) { console.error(`kein Ergebnis nach ${Math.round((Date.now() - t0) / 1000)} s`); process.exit(1); }
  console.log(JSON.stringify(erg, null, 2));
} catch (err) {
  console.error('Sonde nicht möglich: ' + err.message);
  process.exit(2);
} finally {
  if (srv) srv.kill();
}
