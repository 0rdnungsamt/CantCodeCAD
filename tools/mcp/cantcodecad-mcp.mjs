#!/usr/bin/env node
// cantcodecad – MCP-Server für Claude (Claude Desktop, Claude Code). Ohne Fremdpakete, nur Node.
//
// Claude spricht über stdio (JSON-RPC, eine Nachricht je Zeile) mit diesem Server. Die Werkzeuge führt die offene
// cantcodecad aus: sie holt Aufträge über eine kleine Brücke auf 127.0.0.1:8790 ab (GET /next, lange Abfrage) und
// schickt das Ergebnis zurück (POST /result). cantcodecad selbst bleibt dabei offline – ins Netz geht nur die
// Claude-App. In cantcodecad unter Einstellungen „Claude-Anbindung“ einschalten.
//
// Anleitung: docs/claude-anbindung.md. Selbsttest ohne Browser: node tools/mcp/selbsttest.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.CANTCODECAD_MCP_PORT) || 8790;
const VERSION = '1.0.0';
const log = (...a) => process.stderr.write('[cantcodecad-mcp] ' + a.join(' ') + '\n');

/* ---------- Werkzeuge ---------- */
const PLANE = { description: 'Skizzenebene: „XY“, „XZ“ oder „YZ“, wahlweise mit Versatz entlang der Normalen', type: 'string', enum: ['XY', 'XZ', 'YZ'] };
const TOOLS = [
  { name: 'dokument_lesen', app: true,
    description: 'Liest das offene cantcodecad-Dokument: Features der Zeitleiste (Skizzen gekürzt, außer voll=true), Parameter, Zustand je Feature (ok/Fehler/Hinweis) und die Körper mit Volumen und Hülle. Immer zuerst aufrufen.',
    inputSchema: { type: 'object', properties: { voll: { type: 'boolean', description: 'Skizzen vollständig (Punkte, Kurven, Regeln) statt nur Zusammenfassung' } } } },
  { name: 'beispiele',
    description: 'Zeigt, wie Features im Dokument aussehen – echte Beispiele aus den mitgelieferten Projekten (Projekte/Beispiele). Ohne „typ“: Liste aller Feature-Typen mit Anzahl. Mit „typ“ (z. B. extrude, hole, fillet, sm_flange): bis zu drei Beispiele als JSON. Vor feature_anlegen nutzen, um die Felder zu kennen.',
    inputSchema: { type: 'object', properties: { typ: { type: 'string', description: 'Feature-Typ, z. B. extrude' } } } },
  { name: 'skizze_anlegen', app: true,
    description: 'Legt eine Skizze aus einfachen Formen an (Maße in mm, Winkel in Grad, Koordinaten in der Skizzenebene). Formen: rechteck {x0,y0,x1,y1}, rechteck_mitte {cx,cy,b,h}, kreis {cx,cy,d}, linie {x0,y0,x1,y1}, bogen {cx,cy,r,a0,a1} (gegen den Uhrzeigersinn von a0 nach a1), vieleck {cx,cy,r,n} (Umkreisradius), punkt {x,y}. Mit bemassen=true bekommen Rechtecke und Kreise ihre Maße als Bemaßung. Gibt Skizzen-ID und die Zahl der geschlossenen Profile zurück.',
    inputSchema: { type: 'object', required: ['ebene', 'formen'], properties: {
      ebene: PLANE, versatz: { type: 'number', description: 'Abstand der Ebene vom Ursprung entlang der Normalen in mm' },
      name: { type: 'string' }, bemassen: { type: 'boolean' },
      formen: { type: 'array', items: { type: 'object', required: ['art'], properties: { art: { type: 'string', enum: ['rechteck', 'rechteck_mitte', 'kreis', 'linie', 'bogen', 'vieleck', 'punkt'] }, konstruktion: { type: 'boolean' } }, additionalProperties: true } } } } },
  { name: 'feature_anlegen', app: true,
    description: 'Hängt ein Feature (JSON wie in „beispiele“) am Ende der Zeitleiste an und baut neu. id und name werden ergänzt, wenn sie fehlen. Gibt den Zustand des Features und die Körper zurück. Beispiel Extrusion: {"type":"extrude","sketch":"<Skizzen-ID>","profiles":null,"distance":10,"direction":"normal","op":"new"}.',
    inputSchema: { type: 'object', required: ['feature'], properties: { feature: { type: 'object', additionalProperties: true } } } },
  { name: 'feature_aendern', app: true,
    description: 'Ändert Felder eines vorhandenen Features (flaches Zusammenführen; null entfernt ein Feld) und baut neu.',
    inputSchema: { type: 'object', required: ['id', 'aenderungen'], properties: { id: { type: 'string' }, aenderungen: { type: 'object', additionalProperties: true } } } },
  { name: 'feature_loeschen', app: true,
    description: 'Löscht ein Feature aus der Zeitleiste und baut neu. Abhängige Features melden danach einen Fehler.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'parameter_setzen', app: true,
    description: 'Legt einen Benutzerparameter an oder ändert ihn (Ausdruck wie „200“ oder „breite/2 + 5“) und baut neu.',
    inputSchema: { type: 'object', required: ['name', 'ausdruck'], properties: { name: { type: 'string' }, ausdruck: { type: 'string' }, kommentar: { type: 'string' } } } },
  { name: 'messen', app: true,
    description: 'Eigenschaften der Körper: Volumen (mm³), Oberfläche (mm²), Schwerpunkt, Hülle, Zahl der Flächen und Kanten. Ohne „koerper“ alle.',
    inputSchema: { type: 'object', properties: { koerper: { type: 'string', description: 'Körper-ID' } } } },
  { name: 'ansicht_bild', app: true,
    description: 'Bild der 3D-Ansicht (PNG) aus einer Richtung, um das Ergebnis zu prüfen.',
    inputSchema: { type: 'object', properties: { ansicht: { type: 'string', enum: ['iso', 'front', 'back', 'top', 'bottom', 'left', 'right'] }, breite: { type: 'number', description: 'Bildbreite in Pixeln, höchstens 1200' } } } },
  { name: 'rueckgaengig', app: true,
    description: 'Macht die letzte Änderung am Dokument rückgängig (wie Strg+Z).',
    inputSchema: { type: 'object', properties: {} } }
];

/* ---------- Brücke zur offenen cantcodecad ---------- */
const queue = [], waiting = [], pending = new Map();
let lastPoll = 0, seq = 0;
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
  res.end(body == null ? '' : JSON.stringify(body));
}
function flush() {
  while (queue.length && waiting.length) { const w = waiting.shift(); clearTimeout(w.t); send(w.res, 200, queue.shift()); }
}
const bridge = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method === 'GET' && url.pathname === '/next') {
    lastPoll = Date.now();
    const w = { res, t: setTimeout(() => { const i = waiting.indexOf(w); if (i >= 0) waiting.splice(i, 1); send(res, 204); }, 20000) };
    req.on('close', () => { const i = waiting.indexOf(w); if (i >= 0) { waiting.splice(i, 1); clearTimeout(w.t); } });
    waiting.push(w);
    return flush();
  }
  if (req.method === 'POST' && url.pathname === '/result') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 30e6) req.destroy(); });
    req.on('end', () => {
      try {
        const m = JSON.parse(body), p = pending.get(m.id);
        if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); }
        send(res, 200, { ok: true });
      } catch (e) { send(res, 400, { ok: false }); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/status') return send(res, 200, { name: 'cantcodecad-mcp', version: VERSION, app: Date.now() - lastPoll < 25000 });
  send(res, 404, { ok: false });
});
bridge.on('error', e => log(`Brücke auf Port ${PORT} nicht gestartet: ${e.message}`));
bridge.listen(PORT, '127.0.0.1', () => log(`Brücke wartet auf cantcodecad unter http://127.0.0.1:${PORT}`));

function callApp(tool, args) {
  // cantcodecad fragt ständig nach; ohne Abfrage in den letzten 25 s ist sie zu oder die Anbindung aus
  if (!waiting.length && Date.now() - lastPoll > 25000) {
    return Promise.resolve({ ok: false, error: 'cantcodecad ist nicht erreichbar. cantcodecad öffnen und unter Einstellungen → Allgemein „Claude-Anbindung“ einschalten.' });
  }
  const id = ++seq;
  return new Promise(resolve => {
    const t = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'cantcodecad hat nicht innerhalb von 120 s geantwortet.' }); }, 120000);
    pending.set(id, { resolve, t });
    queue.push({ id, tool, args: args || {} });
    flush();
  });
}

/* ---------- Werkzeug „beispiele“: direkt aus den Beispieldateien ---------- */
function examples(typ) {
  const dir = path.join(ROOT, 'Projekte', 'Beispiele');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.cantcodecad')); } catch (_) { return { ok: false, error: 'Beispielordner nicht gefunden: ' + dir }; }
  const all = [];
  for (const f of files) {
    try { (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features || []).forEach(x => all.push({ datei: f.replace(/\.cantcodecad$/, ''), f: x })); } catch (_) { /* kaputte Datei überspringen */ }
  }
  if (!typ) {
    const n = {};
    all.forEach(({ f }) => { n[f.type] = (n[f.type] || 0) + 1; });
    return { ok: true, result: { typen: n, hinweis: 'Mit beispiele({typ}) die Felder eines Typs ansehen.' } };
  }
  const hit = all.filter(x => x.f.type === typ);
  if (!hit.length) return { ok: false, error: `Kein Beispiel für „${typ}“. Typen: ${[...new Set(all.map(x => x.f.type))].sort().join(', ')}` };
  // kleine Beispiele zuerst, Skizzen sind sonst sehr lang
  hit.sort((a, b) => JSON.stringify(a.f).length - JSON.stringify(b.f).length);
  return { ok: true, result: hit.slice(0, 3).map(x => ({ aus: x.datei, feature: x.f })) };
}

/* ---------- MCP über stdio ---------- */
function reply(id, result, error) {
  if (id === undefined || id === null) return;
  process.stdout.write(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }) + '\n');
}
function toContent(r) {
  if (!r.ok) return { content: [{ type: 'text', text: r.error || 'Fehler' }], isError: true };
  const out = r.result;
  if (out && out.bild) return { content: [{ type: 'image', data: out.bild, mimeType: 'image/png' }, { type: 'text', text: out.text || '' }] };
  return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] };
}
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'cantcodecad', version: VERSION },
      instructions: 'cantcodecad ist ein parametrisches CAD (Volumenkörper, Blech, Stahlbau). Ablauf: dokument_lesen → skizze_anlegen → feature_anlegen (Felder über beispiele) → messen/ansicht_bild zum Prüfen. Maße in mm. Jede Änderung landet in der Zeitleiste und lässt sich mit rueckgaengig zurücknehmen.' });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map(({ app, ...t }) => t) });
  if (method === 'tools/call') {
    const name = params && params.name, args = (params && params.arguments) || {}, t = TOOLS.find(x => x.name === name);
    if (!t) return reply(id, null, { code: -32602, message: `Unbekanntes Werkzeug ${name}` });
    let r;
    try { r = t.app ? await callApp(name, args) : examples(args.typ); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
    return reply(id, toContent(r));
  }
  if (method && method.startsWith('notifications/')) return;
  reply(id, null, { code: -32601, message: `Unbekannte Methode ${method}` });
}
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return reply(null, null, { code: -32700, message: 'Kein JSON' }); }
  handle(msg).catch(e => reply(msg.id, null, { code: -32603, message: String(e && e.message || e) }));
});
rl.on('close', () => { bridge.close(); process.exit(0); });
