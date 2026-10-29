/* Kaltstart-Messung an einer großen Baugruppe (kein Prüfstand, nur Messen).
   Aufruf: tools/kaltstart.mjs – spielt keinen Bedienablauf durch, sondern öffnet die Datei
   `?datei=` in einer frischen Sitzung und meldet Zeit bis zur Erstanzeige, Bauaufteilung und
   (bei zweistufiger Erzeugung) Zeit und Aufteilung des nachziehenden Nachtrags.
   Stufe: `?stufe=grob` = zweistufig wie gebaut, `?stufe=fein` = eingestufig fein wie früher. */
import { loadApp, newDoc, waitFor, W, D, C, cmd, num, ok, seg } from './harness.js';

const $ = s => document.querySelector(s);
const FRAGE = new URLSearchParams(location.search);
const STUFE = FRAGE.get('stufe') === 'fein' ? 'fein' : 'grob';
const DATEI = FRAGE.get('datei') || '/tests/fixtures/_kaltstart.step';
/* `sauber=0` lässt den Dauerspeicher in Ruhe: gemessen wird dann dieselbe Datei ein zweites Mal,
   also das, was eine Rückkehr an eine schon einmal geöffnete Baugruppe kostet. */
const SAUBER = FRAGE.get('sauber') !== '0';
/* `bearbeitung=1` misst den Bedienschritt mitten im Netznachtrag: eine große Importbaugruppe, dann
   ein eigenes Feature, dann die Zeitleiste einen Schritt zurück – der Import bleibt, das eigene
   Feature fällt weg. Obergrenze je Schritt: gemessen wurden für das Anlegen eines Quaders schon
   420 s; läge die Grenze darunter, stünde am Ende kein Wert, sondern nur ein Abbruch. */
const BEARBEITUNG = FRAGE.get('bearbeitung') === '1';
const OBERGRENZE = Number(FRAGE.get('obergrenze')) || 600000;
/* Vorgang des eigenen Features: ohne Angabe stellt die Oberfläche auf `join` (Verbinden), sobald im
   Dokument schon Körper sind – das sucht den berührten Körper an der ganzen Baugruppe. Mit `op=new`
   fällt diese Suche weg, und die beiden Läufe zeigen, ob die Bearbeitung oder die Suche kostet. */
const OP = FRAGE.get('op') === 'new' ? 'new' : FRAGE.get('op') === 'join' ? 'join' : '';
const sagen = t => { $('#summary').textContent = t; };

sagen(`Kaltstart ${STUFE} …`);
// Messlauf: Diagnose an (Einstellungen → Allgemein), sonst fehlen Füllstand und Messwerte in der Statuszeile
try { localStorage.setItem('cc.prefs.test', JSON.stringify({ ...JSON.parse(localStorage.getItem('cc.prefs.test') || '{}'), diag: true })); } catch (_) { /* egal */ }
await loadApp();
sagen('Datei hole …');
const text = await (await fetch(DATEI, { cache: 'no-store' })).text();
sagen(`${(text.length / 1e6).toFixed(1)} MB gelesen, öffne …`);

await newDoc();
/* Stufe einstellen: `fein` = eingestufig wie vor der zweistufigen Erzeugung (die Schwelle für die
   grobe Fassung liegt höher, als es Körper gibt), `grob` = Programmwert. Mit `grobab` lässt sich die
   Schwelle setzen – so ist derselbe Ablauf auch an einem kleinen Prüfstück durchspielbar. */
await C.kernel.call('devEval', { code: `ctx.netzGrobAb(${FRAGE.get('grobab') || (STUFE === 'fein' ? 1e9 : 40)})` });
if (SAUBER) {
  await C.kernel.call('devClearNetz');
  await C.kernel.call('devClearMeshCache');
} else sagen('Dauerspeicher bleibt – gemessen wird die Rückkehr an diese Datei');
/* Der Nachtrag der feinen Netze läuft außerhalb des Baus. Seine Ankunft ist der zweite
   Messpunkt: ab hier ist das feine Netz im Bild. */
let nachtrag = null, netzVol = [], vorlaeufig = -1;
const vorherigerHandler = C.kernel.onNetz;
C.kernel.onNetz = res => {
  if (res && res.mesh && !nachtrag && C.lastBuild && res.bauId === C.lastBuild.bauId) {
    nachtrag = { ms: res.ms, dreiecke: res.mesh.index.length / 3, phasen: res.phasen };
    /* Die vorläufigen Volumen dieses Nachtrags festhalten: der Vergleich mit den genauen Werten am
       Ende ist die Zahl dafür, was die Verschiebung in der Anzeige bedeutet. */
    netzVol = res.mesh.bodies.filter(b => b.volumeAusNetz && b.volume != null)
      .map(b => [b.id, b.volume]);
  }
  if (vorherigerHandler) vorherigerHandler(res);
};

const vorher = C.lastBuild;
const t0 = performance.now();
/* Der Volumennachtrag (siehe `volumenVerfeinern` im Kern) läuft nach dem Bild und meldet in
   Abschnitten. Gemessen wird, wann der erste genaue Wert ankommt und wann der Durchgang durch ist –
   beides zusammen sagt, ob die Verschiebung etwas bringt. */
let volErstes = null, volEnde = null, volKorper = 0, volMs = 0, volAbw = null, volVerglichen = 0;
let volWartenMs = 0, volLaeuftAmEnde = false;
/* Kosten der genauen Bestimmung an einer Stichprobe (siehe Sonde unten): ohne diese Zahl ist der
   Verdacht, dass frisch gelesene Formen dafür ein Vielfaches brauchen, nur ein Verdacht. */
let volKosten = null;
/* Kosten der Hüllenbestimmung an den Formen dieses Baustands – einmal kalt, einmal direkt danach –,
   dazu wie viel weiter die grobe Hülle ist als die genaue. Das sind die Zahlen zu `bbOf` (der Wert
   hängt jetzt an der Form) und zu `bbGrob` (die Vorprüfung darf nicht zu weit sein). */
let huellenKosten = null;
/* Zeit eines Baus mit zurückgezogener Zeitleiste mitten im Netznachtrag (siehe `bearbeitung=1`). */
let bearbeitung = null;
/* Ob die Seite und der Worker denselben Takt haben. Die Warteschlangen-Zeit des Kerns vergleicht eine
   Zeit der Seite mit einer Zeit des Workers; zulässig ist das nur, wenn beide auf derselben Zeitlinie
   liegen – nachgeprüft statt vorausgesetzt. */
let zeitTakt = null;
/* Bricht die Messung ab, steht der Grund hier – ohne diese Zeile endet ein Lauf still und die
   Zahlen fehlen, ohne dass zu sehen wäre, warum. */
let abbruch = null;
const vorherigerVolHandler = C.kernel.onVolumen;
C.kernel.onVolumen = res => {
  if (res && C.lastBuild && res.bauId === C.lastBuild.bauId) {
    if (volErstes === null) volErstes = performance.now() - t0;
    volEnde = performance.now() - t0;
    volKorper = Math.max(volKorper, res.korper || 0);
    volMs = Math.max(volMs, res.ms || 0);
  }
  if (vorherigerVolHandler) vorherigerVolHandler(res);
};
const feld = D.querySelector('#fileimport'), transfer = new W.DataTransfer();
transfer.items.add(new W.File([text], 'grosse-baugruppe.step'));
feld.files = transfer.files;
feld.dispatchEvent(new W.Event('change', { bubbles: true }));

let zeitErstanzeige = null, zeitBild = null, zeitAufteilung = null, phasen = null, dreiecke = null, koerper = 0;
try {
  await waitFor(() => C.lastBuild && C.lastBuild !== vorher && C.lastBuild.mesh, 900000, 'Bau');
  zeitErstanzeige = performance.now() - t0;
  /* Bis hier hat die Oberfläche das Ergebnis nur empfangen. Das Bild steht später – nachdem das Netz
     in die Anzeige gebracht und der Baum gebaut ist. Beides zu trennen ist die Frage, was ein Bediener
     tatsächlich wartet; die früheren Zahlen dieser Messung sind die erste Hälfte. */
  await waitFor(() => D.querySelector('#busy').hidden, 900000, 'Bild steht');
  zeitBild = performance.now() - t0;
  zeitAufteilung = C.lastBuild.zeit || null;
  phasen = C.lastBuild.phasen;
  dreiecke = C.lastBuild.mesh.index.length / 3;
  koerper = C.lastBuild.bodies.length;
  sagen(`Erstanzeige nach ${(zeitErstanzeige / 1000).toFixed(1)} s, Bild nach ${(zeitBild / 1000).toFixed(1)} s (${dreiecke} Dreiecke)`);
  /* Bei einer zweiten Öffnung liegen die feinen Netze schon im Dauerspeicher – mit dem vorläufigen
     Wert, der beim Vernetzen gerechnet wurde. Auch dieser Bestand ist eine Quelle für den Abstand
     zwischen vorläufigem und genauem Volumen. */
  if (C.lastBuild.netzStufe === 'fein' && C.lastBuild.mesh) netzVol = C.lastBuild.mesh.bodies
    .filter(b => b.volumeAusNetz && b.volume != null).map(b => [b.id, b.volume]);
  /* Wie viele Körper dieser Bau mit vorläufigem Volumen bekommt, wird direkt abgelesen: ohne diese
     Zahl ist nicht zu unterscheiden, dass der Dauerspeicher den vorläufigen Wert nicht mitnimmt, und
     dass ein Volumennachtrag läuft, aber nichts meldet. */
  vorlaeufig = C.lastBuild.mesh ? C.lastBuild.mesh.bodies.filter(b => b.volumeAusNetz).length : -1;
  if (BEARBEITUNG) {
    /* Zwei Bedienschritte mitten im laufenden Netznachtrag, beide an der großen Baugruppe: eine
       eigene Funktion anlegen, und die Zeitleiste vor genau dieser Funktion zurückziehen – der Import
       bleibt dabei erhalten, nur das eigene Feature fällt weg. Gemessen wird jeweils die Zeit von der
       Bedienung bis zum Bild, also inklusive der paar Zehntelsekunden, die das Eingabefenster kostet.
       Der zweite Schritt ist der, den die Notizen offenließen: ein Bauauftrag mit `upTo`. */
    /* Vorher die Zeitlinien-Prüfung: der Kern meldet eine Wartezeit, indem er seine Uhr mit der der
       Seite vergleicht. Der Hin- und Rückweg einer Anfrage steckt in beiden Zahlen, deshalb wird von
       beiden Seiten geprüft – liegt der Workerzeitpunkt zwischen den beiden Zeitpunkten der Seite,
       stammen sie aus demselben Takt. */
    {
      const tVor = performance.now();
      const tWorker = await C.kernel.call('devEval', { code: 'return performance.now();' });
      const tNach = performance.now();
      zeitTakt = { vor: Math.round(tWorker - tVor), nach: Math.round(tWorker - tNach) };
      sagen(`Takt Seite/Worker: Workerzeitpunkt ${Math.round(tWorker - tVor)} ms nach der Anfrage, ` +
        `${Math.round(tNach - tWorker)} ms vor der Antwort – ` +
        (zeitTakt.nach <= 0 && zeitTakt.vor >= -5 ? 'derselbe Takt' : 'NICHT vergleichbar'));
    }
    const nachtragLaeuft = async () => {
      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (await C.kernel.call('devEval', { code: 'return ctx.netzLaeuft();' })) return true;
      }
      return false;
    };
    const schritt = async (key, titel, tun) => {
      const alterBau = C.lastBuild, tB = performance.now();
      const sch = { nachMs: Math.round(tB - t0) };
      /* Sonderung für den Fall, dass ein Schritt nicht durchkommt: läuft der Nachtrag in dieser Zeit
         weiter (der Bau wartet vor `netzFeinLaeuft`), oder ist der Nachtrag beendet und der Bau selbst
         rechnet? Beides ist von außen nicht zu sehen, und die Frage entscheidet, wo korrigiert werden
         muss. Die Antwortzeit der Nachfrage gehört mit in den Stichprobenwert: ist der Kern nicht
         ansprechbar, steht das hier. Eine Nachfrage nach der anderen – sonst stauen sich die
         Stichproben im Kern und die Zahl der offenen Anfragen sagt nichts mehr über die Oberfläche. */
      const stichproben = [];
      let sonde = null, frageOffen = false;
      const starten = () => { sonde = setInterval(async () => {
        if (stichproben.length >= 40 || frageOffen) { if (stichproben.length >= 40) clearInterval(sonde); return; }
        frageOffen = true;
        const t = Math.round(performance.now() - tB), anfrage = performance.now();
        let laeuft = null;
        try { laeuft = await C.kernel.call('devEval', { code: 'return ctx.netzLaeuft();' }); } catch (_) { laeuft = 'fehler'; }
        frageOffen = false;
        stichproben.push({ t, laeuft, antwortMs: Math.round(performance.now() - anfrage),
          wartend: C.kernel.pending.size, beschaftigt: !D.querySelector('#busy').hidden });
      }, 5000); };
      const beenden = () => { if (sonde) clearInterval(sonde); sch.sondierung = stichproben; };
      starten();
      try {
        /* Die Bedienung selbst gehört in die Messung: von der ersten Bewegung bis zum Bild. Scheitert
           sie (Dialog nicht gefunden, o. ä.), darf nicht die ganze Messung abbrechen – ohne diese
           Zeile endete der Lauf still und es war keine Zahl zu sehen. */
        await tun();
        await waitFor(() => C.lastBuild && C.lastBuild !== alterBau && C.lastBuild.mesh, OBERGRENZE, titel);
        /* Mit der Antwort des Kerns ist der Schritt nicht zu Ende: danach baut die Oberfläche Browser-
           Baum, Zeitleiste und Statuszeile. Bis hier wird gewartet, sonst fehlt bei einer großen
           Baugruppe genau der Teil, der den Schritt lang macht. */
        await waitFor(() => D.querySelector('#busy').hidden, OBERGRENZE, `${titel} – Oberfläche fertig`);
        sch.ms = Math.round(performance.now() - tB);
        sch.bauMs = C.lastBuild.ms;
        /* Aufteilung der Zeit, die nicht der Kern gemeldet hat: Anfrage bis Antwort (warteschlange und
           das Zusammenschicken des Ergebnisses inbegriffen) und die eigene Arbeit der Oberfläche. */
        sch.zeit = C.lastBuild.zeit || null;
        sch.netzStufe = C.lastBuild.netzStufe;
        sch.netzWartet = C.lastBuild.netzWartet;
        sch.koerper = C.lastBuild.bodies.length;
        sch.dreiecke = C.lastBuild.mesh.index.length / 3;
        sch.phasen = C.lastBuild.phasen;
        /* Nachfragen an den Kern, die diesem Schritt ihre Ursache geben: das längste Einzelnetz, das
           der Kern bis hier gebaut hat, und wie häufig überhaupt einzelne Vernetzungen über 300 ms
           laufen (die Warteschlange eines Baus ist genau diese Zeit, denn der Nachtrag gibt den
           Worker erst nach einem Körper frei), und ob das Ergebnis wirklich übertragen statt kopiert
           wurde (die Prüfung nach `postMessage` im Kern). */
        try {
          const sonde = await C.kernel.call('devEval', { code: 'return { langsam: ctx.netzLangsamWert(), verteilung: ctx.netzVerteilung(), uebertragen: ctx.uebertragen() };' });
          sch.netzLangsam = sonde.langsam; sch.netzVerteilung = sonde.verteilung; sch.uebertragen = sonde.uebertragen;
        } catch (_) { /* egal */ }
        sagen(`${titel}: ${(sch.ms / 1000).toFixed(1)} s (${sch.netzStufe}, ${sch.netzWartet} Körper warten)`);
      } catch (err) { sch.fehler = String(err && err.message); }
      beenden();
      bearbeitung[key] = sch;
    };
    /* Der Quader wird hier Schritt für Schritt gesetzt, nicht mit dem fertigen `box()`-Ablauf: dessen
       Warten auf den Neuaufbau steht auf zehn Sekunden, und die braucht der Bau einer großen
       Baugruppe bei weitem nicht einzuhalten. */
    const legeQuader = async () => {
      await cmd('solid:create', 'box');
      num('w', 20); num('l', 20); num('h', 20);
      if (OP) await seg('op', OP);
      await ok(OBERGRENZE);
    };
    if (!await nachtragLaeuft()) sagen('kein Nachtrag beobachtet – die Schritte laufen ohne ihn');
    else {
      /* Ein Teil des Nachtrags soll erledigt sein: sonst wäre die Messung ein Nachtrag, der nur
         unterbrochen und neu begonnen wurde, und nicht der Rest eines angefangenen. */
      await new Promise(r => setTimeout(r, 20000));
    }
    bearbeitung = {};
    /* Beim ersten Schritt wird zusätzlich gemessen, was das Kopieren der Flächen- und Kantenbeschreibungen
       kostet (Schalter im Kern, siehe die Messung vor `postMessage`): nur so ist zu trennen, ob die
       Sekunden einer Antwort von den Netzpuffern oder von den Beschreibungen kommen. Beim zweiten
       Schritt bleibt der Schalter wieder aus – sonst wäre dieser Schritt durch die Messung selbst
       verlängert und mit den früheren Läufen nicht zu vergleichen. */
    try { await C.kernel.call('devEval', { code: 'return ctx.netzKlonPruefen(true);' }); } catch (_) { /* egal */ }
    await schritt('eigeneFunktion', 'Quader angelegt', legeQuader);
    try { await C.kernel.call('devEval', { code: 'return ctx.netzKlonPruefen(false);' }); } catch (_) { /* egal */ }
    if (bearbeitung.eigeneFunktion) bearbeitung.eigeneFunktion.op = OP || 'Voreinstellung';
    const abermals = await nachtragLaeuft();
    if (abermals) await new Promise(r => setTimeout(r, 10000));
    /* Zeitleiste einen Schritt zurück: der Quader fällt aus dem Modell, der Import bleibt. Ohne
       eigenes Feature gäbe es hier kein `upTo`, sondern nur ein leeres Modell – das wäre keine
       Messung, also wird der Schritt in diesem Fall ausgelassen und steht als Grund da. */
    if (C.doc.features.length < 2) bearbeitung.zeitleiste = { fehler: `kein eigenes Feature angelegt (${C.doc.features.length} Features)` };
    else await schritt('zeitleiste', 'Zeitleiste zurückgezogen',
      async () => D.querySelector('[data-cmd="tl-prev"]').click());
    /* Was die Hüllenbestimmung an den Formen dieses Baustands kostet: der kalte Durchgang ist der
       Fall eines Features, das zum ersten Mal nach den Hüllen aller Körper fragt – Bohrung, „durch
       alles", Rippe, Steg und Zeichnung tun das. Dieselbe Frage hat vor der Korrektur 170,8 s für
       797 Körper gekostet. Der zweite Durchgang über dieselben Formen darf nichts mehr kosten, seit
       der Wert an der Form hängt. Dazu die Weite der groben Hülle: sie ist als Vorprüfung nur
       zulässig, wenn sie nicht deutlich über die genaue hinausgeht. */
    try {
      huellenKosten = await C.kernel.call('devEval', { code: `
         const bs = ctx.bodies().slice(0, 24);
         const zeit = f => { const t = performance.now(); f(); return Math.round(performance.now() - t); };
         const diag = b => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);
         const kalt = zeit(() => ctx.allBounds(bs));
         const warm = zeit(() => ctx.allBounds(bs));
         /* Dasselbe mit der groben Hülle über alle Körper der Baugruppe: das ist die Zahl zu dem
            Feature-Pfad, der die Ausdehnung aller Körper braucht. Die genaue Fassung über alle 797 ist
            schon gemessen (170,8 s im Quader-Schritt) und wird hier nicht noch einmal bezahlt. */
         const alle = ctx.bodies();
         const grob = zeit(() => ctx.allBoundsGrob(alle));
         const weiten = [];
         for (const b of bs) {
           const g = diag(ctx.bbGrob(b.shape)), e = diag(ctx.bbOf(b.shape));
           if (e > 1e-9) weiten.push(Number(((g / e - 1) * 100).toFixed(2)));
         }
         const geordnet = weiten.slice().sort((x, y) => x - y);
         return { anzahl: bs.length, kalt, warm, weiten, alle: alle.length, grob,
           groesster: geordnet.length ? geordnet[geordnet.length - 1] : null };
       ` });
      if (huellenKosten && huellenKosten.anzahl) sagen(`Hülle an ${huellenKosten.anzahl} Körpern: kalt ${huellenKosten.kalt} ms, direkt danach ${huellenKosten.warm} ms`);
    } catch (_) { /* die Sonde darf eine Messung nicht scheitern lassen */ }
  } else if (STUFE === 'grob') {
    /* Bei warmem Dauerspeicher ist die feine Fassung schon da und es läuft kein Nachtrag – ohne
       diese Prüfung würde die Messung 900 s auf etwas warten, das nie kommt. */
    let laeuft = await C.kernel.call('devEval', { code: 'return ctx.netzLaeuft();' });
    if (!laeuft) { try { const st = await C.kernel.call('devMeshStats'); laeuft = (st.grob || 0) > 0; } catch (_) { /* unkritisch */ } }
    if (laeuft) {
      await waitFor(() => nachtrag, 900000, 'Nachtrag der feinen Netze');
      sagen(`Nachtrag nach ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } else sagen('feine Netze bereits im Dauerspeicher – kein Nachtrag nötig');
    /* Der Volumennachtrag läuft nach dem Netz und endet von selbst: gewartet wird, bis der Kern
       keinen Nachtrag mehr meldet. Ohne diese Wartung fehlte die Zahl im Bericht. Gezählt wird auch
       die Wartezeit selbst: ob dieser Durchgang Sekunden oder Minuten braucht, ist der Unterschied
       zwischen einer Rückkehr an eine bekannte Datei und einer ersten Öffnung – bei der Rückkehr
       kommen die Formen frisch aus dem Binärspeicher, ohne jede Vernetzungs-Grundlage. */
    const warteT0 = performance.now();
    let warteschleifen = 0;
    for (; warteschleifen < 3600; warteschleifen++) {
      if (await C.kernel.call('devEval', { code: 'return !ctx.netzLaeuft();' })) break;
      await new Promise(r => setTimeout(r, 250));
    }
    volWartenMs = Math.round(performance.now() - warteT0);
    volLaeuftAmEnde = await C.kernel.call('devEval', { code: 'return ctx.netzLaeuft();' });
    if (volErstes !== null) sagen(`Volumen genau: erster Wert nach ${(volErstes / 1000).toFixed(1)} s, Durchgang nach ${(volEnde / 1000).toFixed(1)} s (${volKorper} Körper)`);
    else sagen('kein Volumennachtrag gelaufen');
    /* Abstand der vorläufigen Werte (aus den feinen Dreiecken) von den genauen: das ist die Zahl
       hinter der Frage, ob man sie in Masse und Stückliste zeigen darf, solange sie nachlaufen. */
    if (netzVol.length && C.lastBuild.mesh) {
      const genau = new Map(C.lastBuild.mesh.bodies
        .filter(b => !b.volumeAusNetz && b.volume != null).map(b => [b.id, b.volume]));
      let max = 0;
      for (const [id, v] of netzVol) {
        const g = genau.get(id);
        if (!g) continue;
        volVerglichen++;
        max = Math.max(max, Math.abs(v - g) / Math.abs(g) * 100);
      }
      if (volVerglichen) volAbw = max;
    }
    /* Kosten der genauen Bestimmung an den Formen dieses Baus, an einer Stichprobe von 12 Körpern.
       Der Verdacht aus dem abgebrochenen Messlauf: auf Formen, die frisch aus dem Binärspeicher
       kommen, ist dieselbe Bestimmung ein Vielfaches teurer als auf gerade vernetzten (24,8 s gegen
       über 13 min für 797 Körper). Gemessen wird nur, wenn in dieser Messung kein Durchgang gelaufen
       ist – sonst hätten die Körper die Bestimmung gerade hinter sich und die Sonde wäre zu günstig.
       Der Vergleichsfall ist der Erstbau: dort meldet der Durchgang selbst 24,8 s für 797 Körper. */
    if (!volKorper) {
      try {
        volKosten = await C.kernel.call('devEval', { code: `
          const bs = ctx.bodies().slice(0, 12), kosten = [];
          for (const b of bs) { const t = performance.now(); ctx.safeVolume(b.shape); kosten.push(Math.round(performance.now() - t)); }
          return { anzahl: bs.length, kosten };
        ` });
        if (volKosten && volKosten.kosten) sagen(`Bestimmung an ${volKosten.anzahl} Körpern aus dem Binärspeicher: ` +
          `${volKosten.kosten.join(', ')} ms`);
      } catch (_) { /* die Sonde darf eine Messung nicht scheitern lassen */ }
    }
  }
} catch (err) {
  abbruch = String(err && err.message);
  sagen('Abbruch: ' + err.message);
}

const ergebnis = {
  stufe: STUFE,
  datei: DATEI,
  koerper,
  msBisErstanzeige: Math.round(zeitErstanzeige || 0),
  /* Zeit bis das Bild wirklich steht, und die Aufteilung der Zeit danach. Die erste Zahl ist die
     Antwort des Kerns – was ein Bediener merkt, ist die zweite. */
  msBisBild: Math.round(zeitBild || 0),
  zeitAufteilung,
  msBisNachtrag: nachtrag ? Math.round(nachtrag.ms) : null,
  dreieckeErstanzeige: dreiecke,
  dreieckeNachtrag: nachtrag ? nachtrag.dreiecke : null,
  netzStufe: C.lastBuild && C.lastBuild.netzStufe,
  phasen,
  netzPhasen: nachtrag ? nachtrag.phasen : (C.lastBuild && C.lastBuild.netzPhasen) || null,
  /* Der Volumennachtrag: Zeit bis zum ersten genauen Wert und bis zum Ende des Durchgangs, beide
     von der Öffnung an gerechnet. Ohne diese Zeilen wäre nicht zu sehen, dass die genauen Volumen
     jetzt nach dem Bild kommen. */
  msBisErstesVolumen: volErstes === null ? null : Math.round(volErstes),
  msBisVolumenFertig: volEnde === null ? null : Math.round(volEnde),
  volumenMs: volMs || null,
  volumenKorper: volKorper,
  /* Was dieser Bau an vorläufigen Volumen vorfand, und wie lange auf den Volumendurchgang gewartet
     werden musste: beides zusammen unterscheidet „kein Durchgang nötig“ von „Durchgang läuft, meldet
     aber nichts“. */
  korperVorlaeufig: vorlaeufig,
  volumenWartenMs: volWartenMs,
  volumenLaeuftAmEnde: volLaeuftAmEnde,
  /* Abstand der vorläufigen (aus den feinen Dreiecken gewonnenen) Volumen von den genauen, in Prozent
     der größte Abstand unter `volumenVerglichen` verglichenen Körpern. */
  volumenNetzAbw: volAbw === null ? null : Number(volAbw.toFixed(4)),
  volumenVerglichen: volVerglichen,
  /* Kosten der genauen Bestimmung an einer Stichprobe von Körpern, die aus dem Binärspeicher kommen:
     unterscheidet „der Durchgang war lang, weil viele Körper da sind“ von „der Durchgang war lang,
     weil jeder Körper teuer war“. */
  volumenKosten: volKosten,
  /* Kosten der Hüllenbestimmung an einer Stichprobe, kalt und direkt danach, und wie viel weiter die
     grobe Hülle ist: ohne diese Zahlen ist die Korrektur an der Hülle nur eine Behauptung. */
  huellenKosten,
  abbruch,
  /* Bearbeitung mitten im Nachtrag: Zeit von der Bedienung bis zum Bild dieses Baus, dazu Stufe,
     Zahl der wartenden Körper und Aufteilung. Ohne diese Zeilen ist nicht messbar, was eine Änderung
     kostet, während die feinen Netze noch nachziehen. */
  bearbeitung,
  /* Prüfergebnis der Zeitlinien-Frage: ob die Wartezeit, die der Kern aus einer Zeit der Seite und
     seiner eigenen Uhr rechnet, überhaupt etwas taugt. */
  zeitTakt,
  /* Erlaubnis und Füllstand des Browser-Speichers: ohne dauerhafte Erlaubnis können die Netze
     zwischen zwei Messläufen verschwunden sein, und dann vergleicht die Messung verschiedene Dinge. */
  speicher: C.speicher || null,
  bestand: await C.kernel.call('devMeshStats')
};
const token = FRAGE.get('testToken');
if (token) {
  try {
    await fetch('/__testresult?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ergebnis)
    });
  } catch (_) { /* ohne Reporter bleibt die Zahl auf dem Schirm stehen */ }
}
sagen(JSON.stringify(ergebnis, null, 1));
