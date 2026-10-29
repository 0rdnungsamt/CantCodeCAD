// cantcodecad – Kaltstart einer großen Baugruppe ohne Fenster messen.
// Aufruf:  node tools/kaltstart.mjs [--datei=/tests/fixtures/_kaltstart.step] [--port=8766] [--nur=grob|fein] [--zweit]
// Misst in je einer frischen Browser-Sitzung: Zeit bis zur Erstanzeige, Bauaufteilung, und bei
// zweistufiger Erzeugung Zeit und Aufteilung des nachziehenden Nachtrags. Mit --zweit wird dieselbe
// Datei zweimal in demselben Profil geöffnet (zweite Öffnung = Dauerspeicher voll), um zu zeigen, was
// eine Rückkehr kostet. Mit --profil=<ordner> wird ein bestehendes Profil weiterbenutzt und nicht
// gelöscht; combined mit --nur=zweit läuft dann nur die zweite Öffnung (Vorlauf entfällt).
// Rückgabewert 0 = beide Messungen durchgelaufen. Benötigt Chrome/Edge und Node ≥ 22.
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
const DATEI = opt('datei', '/tests/fixtures/_kaltstart.step');
const STUFEN = opt('nur', 'fein,grob').split(',');
// Nur die zweite Öffnung: Vorlauf übersprungen, der Dauerspeicher kommt aus `--profil`.
const NUR_ZWEIT = args.includes('--nur=zweit');
const ZWEIT = args.includes('--zweit') || NUR_ZWEIT;
/* Bearbeitung mitten im Nachtrag: eine große Baugruppe wird geöffnet, dann legt der Lauf mitten im
   nachziehenden Netznachtrag ein eigenes Feature an und zieht die Zeitleiste vor diesem Feature
   wieder zurück – das ist der Bauauftrag mit `upTo`. Gemessen wird, was beide Bedienschritte kosten.
   Dafür ist ein kalter Netzbestand nötig, sonst läuft gar kein Nachtrag. Mit `--grobab=1` ist
   derselbe Ablauf auch an einem kleinen Prüfstück durchspielbar. */
const BEARBEITUNG = args.includes('--bearbeitung');
/* Vorgang des eigenen Features: `join` ist die Voreinstellung der Oberfläche, sobald im Dokument
   schon Körper sind, `new` lässt das Verbinden weg. Beides zu messen trennt die Kosten der
   Bearbeitung von denen der Suche nach dem berührten Körper. */
const OP = opt('op', null);
const GROBAB = opt('grobab', null);
const PROFIL = opt('profil', null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = `http://localhost:${PORT}`;

// Zeiten gegen Zähler unterscheiden (siehe newPhasen im Kern)
const ZEIT = new Set(['datei', 'uebersetzen', 'fallback', 'stl', 'laden', 'binLesen', 'sichern', 'netze', 'mischen',
  'gesamt', 'gitter', 'kantennetz', 'flaecheninfo', 'kanteninfo', 'volumen', 'huelle', 'umwandeln', 'huelleFallback',
  'dbLesen', 'dbSichern', 'netzLuecken', 'namen', 'vorbereiten', 'bauwerk', 'ergebnis', 'netzLangsam',
  'zielSuche', 'distanz', 'boolesch', 'klonBeschreibungen']);

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
function startBrowser(url, profil) {
  const exe = findBrowser();
  if (!exe) throw new Error('Kein Chrome/Edge gefunden (CANTCODECAD_BROWSER setzen)');
  // `profil` wird durchgereicht, wenn dieselbe Datei ein zweites Mal geöffnet wird: der
  // Dauerspeicher (Netze und umgewandelte Formen) hängt am Profil, ohne gemeinsames Profil ist
  // jede Messung eine Erstöffnung.
  const eigen = !profil;
  if (!profil) profil = mkdtempSync(join(tmpdir(), 'cantcodecad-kaltstart-'));
  const p = spawn(exe, ['--headless=new', `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=Vulkan', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--max-old-space-size=8192', '--window-size=1600,1000', url], { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  return { p, profile: profil, eigen };
}

const s = n => (n / 1000).toFixed(1) + ' s';
const mb = n => ((n || 0) / 1e6).toFixed(0) + ' MB';
function druckePhasen(ph, titel) {
  if (!ph) { console.log(`  ${titel}: keine Aufteilung`); return; }
  const zeiten = Object.entries(ph).filter(([k, v]) => ZEIT.has(k) && typeof v === 'number' && v >= 5).sort((a, b) => b[1] - a[1]);
  const zaehler = Object.entries(ph).filter(([k, v]) => !ZEIT.has(k) && (typeof v === 'number' ? v !== 0 : !!v));
  console.log(`  ${titel}`);
  for (const [k, v] of zeiten) console.log(`      ${k.padEnd(14)} ${s(v)}`);
  console.log('      Zähler: ' + zaehler.map(([k, v]) => `${k}=${v}`).join(' '));
}

async function mess(stufe, profil = null, sauber = true) {
  const token = randomUUID();
  const q = new URLSearchParams({ testToken: token, stufe, datei: DATEI });
  if (!sauber) q.set('sauber', '0');
  if (BEARBEITUNG) q.set('bearbeitung', '1');
  if (OP) q.set('op', OP);
  /* Für die Bearbeitungsschritte ist ein laufender Nachtrag nötig, nicht ein kalter Bestand: mit
     warmem Dauerspeicher ist die Datei in Sekunden im Bild und die feinen Netze ziehen trotzdem nach
     (im Bestand liegen nur grobe). Das macht den Lauf kurz und ist zugleich der Fall, den der
     Bediener hat – er kehrt an eine bekannte Datei zurück. */
  if (BEARBEITUNG && PROFIL) q.set('sauber', '0');
  if (GROBAB) q.set('grobab', GROBAB);
  const browser = startBrowser(`${base}/tests/kaltstart.html?${q}`, profil);
  const t0 = Date.now();
  let r = null;
  try {
    while (Date.now() - t0 < 40 * 60e3) {
      await sleep(2000);
      try {
        const ant = await fetch(`${base}/__testresult?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
        if (ant.status === 200) { r = await ant.json(); break; }
      } catch (_) { /* der Server ist gerade beschäftigt */ }
    }
  } finally {
    browser.p.kill(); await sleep(500);
    if (browser.eigen) { try { rmSync(browser.profile, { recursive: true, force: true }); } catch (_) { /* Profil noch gesperrt */ } }
  }
  if (!r) { console.log(`✗ ${stufe}: kein Ergebnis nach ${Math.round((Date.now() - t0) / 1000)} s`); return null; }
  console.log(`\n=== Kaltstart ${stufe}${sauber ? '' : ' (Zweitöffnung)'} (${Math.round((Date.now() - t0) / 1000)} s Wandzeit) ===`);
  /* Ein Abbruch der Messseite bricht nur den Rest der Messung ab, das Ergebnis kommt trotzdem – ohne
     diese Zeile fehlten Zahlen, ohne dass der Grund zu sehen wäre. */
  if (r.abbruch) console.log(`  Abbruch der Messung: ${r.abbruch}`);
  console.log(`  Körper ${r.koerper}, Dreiecke Erstanzeige ${r.dreieckeErstanzeige}` +
    (r.dreieckeNachtrag != null ? `, nach dem Nachtrag ${r.dreieckeNachtrag}` : ''));
  console.log(`  bis zur Erstanzeige: ${s(r.msBisErstanzeige)}` +
    (r.msBisBild ? `   Bild nach ${s(r.msBisBild)}` : '') +
    (r.msBisNachtrag != null ? `   bis zum feinen Netz: ${s(r.msBisNachtrag)}` : ''));
  /* Die Erstanzeige-Zahl ist die Antwort des Kerns. Das Bild steht später, und ohne diese Zeile wäre
     nicht zu sehen, wofür die Differenz gebraucht wird. */
  if (r.zeitAufteilung) console.log(`      aufgeteilt: Kernanfrage ${s(r.zeitAufteilung.antwortMs)}` +
    (Number.isFinite(r.zeitAufteilung.gewartetMs) ? `, im Kern gewartet ${s(r.zeitAufteilung.gewartetMs)}` : '') +
    (Number.isFinite(r.zeitAufteilung.sperreMs) ? `, in der Kundenwarteschlange ${s(r.zeitAufteilung.sperreMs)}` : '') +
    `, Oberfläche danach ${s(r.zeitAufteilung.oberseiteMs)}` +
    (r.zeitAufteilung.modellMs == null ? '' : ` – davon Netz in die Anzeige ${s(r.zeitAufteilung.modellMs)}, Baum ${s(r.zeitAufteilung.baumMs)}`) +
    (r.zeitAufteilung.speicherMs == null ? '' : `; Füllstand des Dauerspeichers nebenbei abgefragt ${s(r.zeitAufteilung.speicherMs)}`));
  /* Die genauen Volumen kommen nach dem Bild (siehe `volumenVerfeinern` im Kern): diese Zeile sagt,
     wann sie in der Oberfläche ankommen und wie lange der Durchgang selbst dauert. */
  if (r.msBisErstesVolumen != null) console.log(`  Volumen genau: erster Wert nach ${s(r.msBisErstesVolumen)}, Durchgang ${s(r.volumenMs)} (${r.volumenKorper} Körper)`);
  /* Beides zusammen ist die Unterscheidung: ohne vorläufige Volumen ist kein Durchgang nötig, mit
     vorläufigen aber ohne Meldung läuft der Durchgang und kommt nicht zum Abschluss. */
  if (r.korperVorlaeufig >= 0) console.log(`  vorläufige Volumen im Bau: ${r.korperVorlaeufig}, Warten auf den Volumendurchgang: ${s(r.volumenWartenMs)}${r.volumenLaeuftAmEnde ? ' (läuft am Ende noch)' : ''}`);
  if (r.volumenNetzAbw != null) console.log(`  vorläufige Volumen aus den feinen Dreiecken: größter Abstand ${r.volumenNetzAbw} % unter ${r.volumenVerglichen} verglichenen Körpern`);
  /* Die Sonde misst die genaue Bestimmung an Körpern, die aus dem Binärspeicher gelesen wurden.
     Gegenrechnung ist der Erstbau: dort meldet der Durchgang oben 24,8–27,0 s für 797 Körper. */
  if (r.volumenKosten && r.volumenKosten.kosten && r.volumenKosten.kosten.length) {
    const k = r.volumenKosten.kosten;
    const mittl = Math.round(k.reduce((a, b) => a + b, 0) / k.length);
    console.log(`  genaue Bestimmung an ${r.volumenKosten.anzahl} Körpern aus dem Binärspeicher: ` +
      `im Mittel ${mittl} ms, größte ${Math.max(...k)} ms`);
  }
  /* Hüllenbestimmung an einer Stichprobe: der kalte Wert ist das, was ein Feature zahlt, das zum
     ersten Mal nach den Hüllen aller Körper fragt; der warme Wert zeigt, dass der zweite Durchgang
     über dieselben Formen nichts mehr kostet. Die Weite der groben Hülle ist die Zulassung für ihre
     Benutzung als Vorprüfung. */
  if (r.huellenKosten && r.huellenKosten.anzahl) {
    const h = r.huellenKosten, w = (h.weiten || []).filter(x => Number.isFinite(x));
    const mittl = w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0;
    console.log(`  Hülle an ${h.anzahl} Körpern: kalt ${h.kalt} ms, direkt danach ${h.warm} ms` +
      (w.length ? ` – grobe Hülle im Mittel ${mittl.toFixed(1)} %, größten ${h.groesster} % weiter als die genaue` : ''));
    if (h.alle && Number.isFinite(h.grob)) console.log(`  Ausdehnung aller ${h.alle} Körper: grobe Fassung ${h.grob} ms (genaue gemessen: 170800 ms im Quader-Schritt)`);
  }
  druckePhasen(r.phasen, 'Bau:');
  /* Bearbeitung mitten im laufenden Nachtrag: die Zeiten, die eine Änderung in einer großen
     Baugruppe kostet, während die feinen Netze noch nachziehen. */
  if (r.bearbeitung) {
    if (r.zeitTakt) console.log(`  Takt Seite/Worker nachgeprüft: Workerzeitpunkt ${r.zeitTakt.vor} ms nach der Anfrage, ` +
      `${-r.zeitTakt.nach} ms vor der Antwort – ` +
      (r.zeitTakt.nach <= 0 && r.zeitTakt.vor >= -5 ? 'dieselbe Zeitlinie' : 'NICHT vergleichbar'));
    for (const [key, titel] of [['eigeneFunktion', 'Quader angelegt'], ['zeitleiste', 'Zeitleiste zurückgezogen']]) {
      const b = r.bearbeitung[key];
      if (!b) continue;
      console.log(`  ${titel}${b.op ? ` (Vorgang ${b.op})` : ''}${b.nachMs == null ? '' : ` nach ${s(b.nachMs)}`}: ` +
        (b.fehler ? 'fehlgeschlagen: ' + b.fehler :
          `${s(b.ms)} bis zum Bild – ${b.zeit && b.zeit.wiederholt ? 'kein Bau (gleiche Eingabe)' : `Bau ${s(b.bauMs)}`}, ${b.koerper} Körper, Stufe ${b.netzStufe}, ` +
          `${b.netzWartet} Körper warten, ${b.dreiecke} Dreiecke`));
      if (b.zeit) {
        /* Die Zeiten, die ein Bedienschritt braucht, getrennt: der Kern meldet nur seine eigene
           Rechenzeit. Der Rest ist Warteschlange zweier Art (die Kundenwarteschlange der Seite bei
           kurz aufeinanderfolgenden Anfragen, und der laufende Netznachtrag, der den Worker hält –
           gemessen mit der Anfrage vor dem Bauauftrag), das Zusammenschicken des Ergebnisses und die
           Arbeit der Oberfläche danach. */
        const gewartet = Number.isFinite(b.zeit.gewartetMs) ? b.zeit.gewartetMs : null;
        const sperre = Number.isFinite(b.zeit.sperreMs) ? b.zeit.sperreMs : null;
        const rest = b.zeit.antwortMs - b.bauMs - (gewartet || 0) - (sperre || 0);
        console.log(`      aufgeteilt: Kernanfrage ${s(b.zeit.antwortMs)} – ` +
          (b.zeit.wiederholt
            ? 'kein zweiter Bau: dieselbe Eingabe wie der gerade abgeschlossene, Ergebnis wiederverwendet'
            : `Kern selbst ${s(b.bauMs)}` +
              (gewartet == null ? '' : `, im Kern gewartet ${s(gewartet)}`) +
              (sperre == null ? '' : `, in der Kundenwarteschlange ${s(sperre)}`) +
              `, Ergebnis zugeschickt ${s(rest)}`) +
          `; Oberfläche danach ${s(b.zeit.oberseiteMs)}` +
          (b.zeit.modellMs == null ? '' : ` – davon Netz in die Anzeige ${s(b.zeit.modellMs)}, Baum ${s(b.zeit.baumMs)}`) +
          (b.zeit.speicherMs == null ? '' : `; Füllstand des Dauerspeichers nebenbei abgefragt ${s(b.zeit.speicherMs)}`) +
          `, Rest: Bedienung der Messseite`);
        if (b.netzLangsam && b.netzLangsam.ms) console.log(`      längstes Einzelnetz im Kern bisher: ${s(b.netzLangsam.ms)} (${mb(b.netzLangsam.bytes)} Netz, Stufe ${b.netzLangsam.stufe})`);
        if (b.netzVerteilung && b.netzVerteilung.gesamt) console.log(`      Vernetzungen eines Körpers bisher: ${b.netzVerteilung.gesamt} (zusammen ${s(b.netzVerteilung.ms)}), davon über 300 ms: ${b.netzVerteilung.wartend}, über 1 s: ${b.netzVerteilung.lang}`);
        if (b.uebertragen) console.log(`      Netzpuffer übertragen statt kopiert: ${b.uebertragen}`);
      }
      if (b.phasen) druckePhasen(b.phasen, `${titel}:`);
      /* Was in dieser Zeit im Kern lief: läuft der Netznachtrag weiter, hat der Bau also nicht
         angefangen, oder ist er beendet und der Bau selbst braucht die Zeit. */
      const st = b.sondierung;
      if (st && st.length) {
        const ja = st.filter(x => x.laeuft === true).length;
        const antwort = Math.round(st.reduce((a, x) => a + x.antwortMs, 0) / st.length);
        console.log(`    währenddessen: ${st.length} Stichproben, Nachtrag lief in ${ja}, Kernantwort im Mittel ${antwort} ms`);
        const schrittweite = Math.max(1, Math.ceil(st.length / 8));
        for (const p of st.filter((_, i) => i % schrittweite === 0))
          console.log(`      ${p.t} s: Nachtrag ${p.laeuft === true ? 'ja' : p.laeuft === false ? 'nein' : p.laeuft}, ` +
            `Antwort ${p.antwortMs} ms, offene Anfragen ${p.wartend}, Oberfläche beschäftigt ${p.beschaftigt ? 'ja' : 'nein'}`);
      }
    }
  }
  druckePhasen(r.netzPhasen, 'Nachtrag der feinen Netze:');
  console.log('  Dauerspeicher danach: ' + JSON.stringify(r.bestand));
  /* Der Browser-Erlaubnisstand gehört zu diesen Zahlen dazu: ohne dauerhafte Erlaubnis darf der
     Browser die Netze räumen, und die nächste Öffnung ist wieder eine erste. */
  if (r.speicher) console.log(`  Dauerspeicher beim Browser: ${r.speicher.dauerhaft ? 'dauerhaft angemeldet' : 'ohne dauerhafte Erlaubnis'} (${mb(r.speicher.benutzt)} von ${mb(r.speicher.kontingent)}, ${r.speicher.angefragt} Anfrage(n))`);
  return r;
}

let srv = null;
/* Zweite Öffnung derselben Datei: dasselbe Browser-Profil, der Dauerspeicher bleibt erhalten – genau
   so, wie es beim normalen Arbeiten der Fall ist. Zeigt, was eine Rückkehr kostet, und ob die
   umgewandelte Form der STEP-Datei wirklich wiederverwendet wird (dann heißen die Posten
   `laden`/`binLesen` statt `datei`/`uebersetzen`, und die Netze kommen aus dem Dauerspeicher). */
async function zweitoeffnung() {
  const eigen = !PROFIL;
  const profil = PROFIL || mkdtempSync(join(tmpdir(), 'cantcodecad-kaltstart-profil-'));
  try {
    const erste = NUR_ZWEIT ? null : await mess('grob', profil, true);
    const zweite = await mess('grob', profil, false);
    if (!zweite) return;
    if (!erste) {
      console.log('\n=== Zweite Öffnung allein (Vorlauf übersprungen, Profil ' + profil + ') ===');
      console.log('  Die Zahlen oben sind die einer Öffnung mit vollem Dauerspeicher.');
      return;
    }
    console.log('\n=== Zweite Öffnung derselben Datei (gleiches Profil, Dauerspeicher bleibt) ===');
    console.log(`  Erstanzeige:   erste ${s(erste.msBisErstanzeige)}  →  zweite ${s(zweite.msBisErstanzeige)}  (${(100 * (1 - zweite.msBisErstanzeige / erste.msBisErstanzeige)).toFixed(0)} % früher)`);
    if (zweite.msBisNachtrag != null) console.log(`  feines Netz im Bild: ${s(zweite.msBisNachtrag)}`);
    if (zweite.msBisErstesVolumen != null) console.log(`  Volumen genau: erste ${s(erste.msBisErstesVolumen)} → zweite ${s(zweite.msBisErstesVolumen)} (Durchgang ${s(zweite.volumenMs)}, ${zweite.volumenKorper} Körper)`);
    for (const k of ['datei', 'uebersetzen', 'laden', 'binLesen', 'sichern', 'dbLesen', 'dbSichern', 'netze', 'gitter', 'flaecheninfo', 'kanteninfo', 'volumen', 'netzLuecken']) {
      const x = (erste.phasen || {})[k] || 0, y = (zweite.phasen || {})[k] || 0;
      if (!x && !y) continue;
      console.log(`  ${k.padEnd(13)} ${s(x)} → ${s(y)}`);
    }
    const zaehler = (p, wer) => console.log(`  Zähler ${wer}: ` + Object.entries(p || {})
      .filter(([k, v]) => !ZEIT.has(k) && (typeof v === 'number' ? v !== 0 : !!v)).map(([k, v]) => `${k}=${v}`).join(' '));
    zaehler(erste.phasen, 'erste'); zaehler(zweite.phasen, 'zweite');
    if (zweite.speicher) console.log(`  Dauerspeicher beim Browser: ${zweite.speicher.dauerhaft ? 'dauerhaft angemeldet' : 'ohne dauerhafte Erlaubnis'} (${mb(zweite.speicher.benutzt)} von ${mb(zweite.speicher.kontingent)})`);
    console.log('  Bestand danach: ' + JSON.stringify(zweite.bestand));
  } finally {
    if (eigen) { try { rmSync(profil, { recursive: true, force: true }); } catch (_) { /* Profil noch gesperrt */ } }
  }
}

try {
  srv = await ensureServer();
  if (BEARBEITUNG) {
    console.log(`Bearbeitung mitten im Nachtrag an ${DATEI} …`);
    await mess('grob', PROFIL, true);
  } else if (ZWEIT) {
    console.log(`Zweitöffnungs-Messung an ${DATEI} …`);
    await zweitoeffnung();
  } else {
    console.log(`Kaltstart-Messung an ${DATEI}, Stufen: ${STUFEN.join(', ')} …`);
    const ergebnisse = {};
    for (const stufe of STUFEN) ergebnisse[stufe] = await mess(stufe);
    const a = ergebnisse.fein, b = ergebnisse.grob;
    if (a && b) {
      console.log('\n=== Vergleich ===');
      console.log(`  Erstanzeige:   fein ${s(a.msBisErstanzeige)}  →  grob ${s(b.msBisErstanzeige)}  (${(100 * (1 - b.msBisErstanzeige / a.msBisErstanzeige)).toFixed(0)} % früher)`);
      if (b.msBisNachtrag != null) console.log(`  feines Netz im Bild: ${s(b.msBisNachtrag)} (grob) gegen ${s(a.msBisErstanzeige)} (fein)`);
      for (const k of ['gitter', 'flaecheninfo', 'volumen', 'kantennetz', 'kanteninfo', 'netzLuecken']) {
        const x = (a.phasen || {})[k] || 0, y = (b.phasen || {})[k] || 0;
        console.log(`  ${k.padEnd(13)} ${s(x)} → ${s(y)}`);
      }
    }
  }
} catch (err) {
  console.error('Messung nicht möglich: ' + err.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
