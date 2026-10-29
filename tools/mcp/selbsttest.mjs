// Selbsttest des MCP-Servers ohne Browser: spielt Claude (stdio) und cantcodecad (Brücke) nach.
// Aufruf: node tools/mcp/selbsttest.mjs – Rückgabewert 0 = in Ordnung.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8799, BR = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'cantcodecad-mcp.mjs')], { env: { ...process.env, CANTCODECAD_MCP_PORT: String(PORT) }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
const waiters = new Map();
srv.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const m = JSON.parse(line); // alles auf stdout muss JSON-RPC sein
    const w = waiters.get(m.id); if (w) { waiters.delete(m.id); w(m); }
  }
});
let n = 0;
const rpc = (method, params) => new Promise(res => { const id = ++n; waiters.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (ok, text) => { console.log(`${ok ? '✓' : '✗'} ${text}`); if (!ok) bad++; };

try {
  await sleep(300);
  const ini = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selbsttest', version: '1' } });
  check(ini.result && ini.result.serverInfo.name === 'cantcodecad' && ini.result.capabilities.tools, 'initialize');
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await rpc('tools/list', {});
  const names = list.result.tools.map(t => t.name);
  check(['dokument_lesen', 'skizze_anlegen', 'feature_anlegen', 'feature_aendern', 'feature_loeschen', 'parameter_setzen', 'messen', 'ansicht_bild', 'rueckgaengig', 'beispiele'].every(x => names.includes(x)), `tools/list (${names.length} Werkzeuge)`);
  check(list.result.tools.every(t => t.inputSchema && t.inputSchema.type === 'object' && !('app' in t)), 'Eingabeschemas vollständig');
  const ex = await rpc('tools/call', { name: 'beispiele', arguments: { typ: 'extrude' } });
  const exj = JSON.parse(ex.result.content[0].text);
  check(!ex.result.isError && Array.isArray(exj) && exj[0].feature.type === 'extrude', 'beispiele(extrude) liefert echte Features');
  const off = await rpc('tools/call', { name: 'dokument_lesen', arguments: {} });
  check(off.result.isError && /nicht erreichbar/.test(off.result.content[0].text), 'ohne cantcodecad: klare Meldung');
  // cantcodecad nachspielen: Auftrag abholen, Ergebnis zurück
  const poll = fetch(BR + '/next').then(r => r.json());
  await sleep(100);
  const call = rpc('tools/call', { name: 'messen', arguments: { koerper: 'k1' } });
  const job = await poll;
  check(job.tool === 'messen' && job.args.koerper === 'k1', 'Auftrag kommt bei cantcodecad an');
  await fetch(BR + '/result', { method: 'POST', body: JSON.stringify({ id: job.id, ok: true, result: { volumen: 1000 } }) });
  const done = await call;
  check(JSON.parse(done.result.content[0].text).volumen === 1000, 'Ergebnis kommt bei Claude an');
  // Fehler aus cantcodecad und Bilder
  const p2 = fetch(BR + '/next').then(r => r.json());
  await sleep(100);
  const c2 = rpc('tools/call', { name: 'ansicht_bild', arguments: {} });
  const j2 = await p2;
  await fetch(BR + '/result', { method: 'POST', body: JSON.stringify({ id: j2.id, ok: true, result: { bild: 'iVBORw0KGgo=', text: 'Ansicht iso' } }) });
  const r2 = await c2;
  check(r2.result.content[0].type === 'image' && r2.result.content[0].mimeType === 'image/png', 'Bild als image-Inhalt');
  const p3 = fetch(BR + '/next').then(r => r.json());
  await sleep(100);
  const c3 = rpc('tools/call', { name: 'feature_loeschen', arguments: { id: 'x' } });
  const j3 = await p3;
  await fetch(BR + '/result', { method: 'POST', body: JSON.stringify({ id: j3.id, ok: false, error: 'Kein Feature mit der ID „x“.' }) });
  const r3 = await c3;
  check(r3.result.isError && /Kein Feature/.test(r3.result.content[0].text), 'Fehler aus cantcodecad als isError');
  const unk = await rpc('foo/bar', {});
  check(unk.error && unk.error.code === -32601, 'unbekannte Methode → Fehler -32601');
} catch (e) { console.log('✗ Abbruch: ' + e.message); bad++; }
srv.stdin.end();
srv.kill();
console.log(bad ? `${bad} Fehler` : 'MCP-Selbsttest in Ordnung');
process.exit(bad ? 1 : 0);
