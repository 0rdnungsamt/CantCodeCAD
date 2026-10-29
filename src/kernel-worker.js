// cantcodecad – Geometrie-Kern im Hintergrund-Thread.
// OpenCASCADE (über replicad) baut aus der Feature-Liste den Körper und
// liefert Dreiecksnetz, Kanten und Flächeninfos an die Oberfläche zurück.
import * as R from '/cdn/npm/replicad@1.1.0/+esm';
import opencascade from '/cdn/npm/replicad-opencascadejs@1.1.0/dist/replicad_single.js';
import { sketchRegions, selectRegions, pointInRegion } from './sketch/profiles.js';
import { FONTS, loadFont as loadFontOT, pathLayout } from './sketch/text.js';
import { migrateSketch, holePoints, holePoints3, markerPoints, curveSamples, curvePolyline, pointMap, pt3, circum3, curveEnds3, curvePoints3, chainCurves, planeFromPoints } from './sketch/model.js';
import { workPlaneOf, workAxisOf, workPointOf, bksOf, bksAxisId, BKS_AXES } from './doc.js';
import { loadSolver, solveSketch } from './sketch/solver.js';
import { resolveSketchRef, applyRefGeometry } from './sketch/project.js';
import { profileShape, profileBox, profileLabel } from './steel.js';
import { FASTENERS, fastenerDims, fastenerLabel, nominal } from './fasteners.js';
import { oberflaeche as gdOberflaeche } from './sim/gd3d.js';
import { GITTER_TYPEN, gitterNetz } from './sim/gitter.js';
import { hashStr, importKey } from './importkey.js';
import { stepNamen, fingerabdruck, abstandFP, lageMal, lageInv, lageAuf } from './step-namen.js';
import { hemGeometry } from './sheet.js';
import { topOptimize, niveauFuerAnteil, flaechenAusSchleifen, elasticOf } from './sim/topo.js';

const WASM_URL = '/cdn/npm/replicad-opencascadejs@1.1.0/dist/replicad_single.wasm';
const topoCache = new Map(); // Topologieoptimierung: Eingabe → Umriss und Kennzahlen (siehe case 'topo')

let readyPromise = null;
function init() {
  if (!readyPromise) {
    readyPromise = Promise.all([
      opencascade({ locateFile: () => WASM_URL }).then(OC => { R.setOC(OC); patchTopology(); }),
      loadSolver()
    ]).then(() => true);
  }
  return readyPromise;
}

/* replicad 1.1 sucht Doppelte in .faces/.edges quadratisch (3 700 Flächen ≈ 1 s, STL mit 30 000 Dreiecken
   mehrere Minuten). Ersatz mit Streuwert-Tabelle, gleiche Reihenfolge (erstes Auftreten). */
const TOPO_ORIG = {};
function patchTopology() {
  const oc = R.getOC();
  const box = R.makeBox([0, 0, 0], [1, 1, 1]);
  let proto = Object.getPrototypeOf(box);
  while (proto && !Object.getOwnPropertyDescriptor(proto, 'faces')) proto = Object.getPrototypeOf(proto);
  if (!proto || !oc.ReplicadShapeHasher || !oc.TopExp_Explorer) return;
  const T = oc.TopAbs_ShapeEnum;
  const kinds = {
    faces: [T.TopAbs_FACE, s => oc.TopoDS.Face(s), box.faces[0].constructor],
    edges: [T.TopAbs_EDGE, s => oc.TopoDS.Edge(s), box.edges[0].constructor],
    wires: [T.TopAbs_WIRE, s => oc.TopoDS.Wire(s), box.wires[0].constructor],
    solids: [T.TopAbs_SOLID, s => oc.TopoDS.Solid(s), box.solids[0].constructor]
  };
  for (const [name, [ty, cast, C]] of Object.entries(kinds)) {
    TOPO_ORIG[name] = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, {
      configurable: true,
      get() {
        const ex = new oc.TopExp_Explorer(this.wrapped, ty, T.TopAbs_SHAPE);
        const seen = new Map(), res = [];
        try {
          for (; ex.More(); ex.Next()) {
            const it = ex.Current();
            const h = oc.ReplicadShapeHasher.HashCode(it, 2147483647);
            const bucket = seen.get(h);
            if (bucket && bucket.some(o => o.IsSame(it))) continue;
            const d = cast(it);
            if (bucket) bucket.push(d); else seen.set(h, [d]);
            res.push(new C(d));
          }
        } finally { ex.delete(); }
        return res;
      }
    });
  }
  box.delete && box.delete();
}

/* ---------- kleine Vektorhilfen ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const ORIGIN = {
  XY: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
  XZ: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] },
  YZ: { o: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] }
};

/* Feste x-Richtung für eine Skizzenebene mit Normale n (gleiche Regel wie in doc.js) */
function frameX(n) {
  const helper = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  return norm(cross(helper, n));
}

function makePlane(p, offset = 0) {
  return new R.Plane(add(p.o, mul(p.n, offset)), p.x, p.n);
}

/* ---------- Skizze → 2D-Zeichnung aus erkannten Profilen ---------- */
function loopDrawing(loop) {
  if (loop.circle) return R.drawCircle(loop.circle.r).translate(loop.circle.c[0], loop.circle.c[1]);
  const E = loop.edges;
  // ganze Ellipse exakt
  if (E.length === 1 && E[0].type === 'spl' && E[0].ell) {
    const g = E[0].ell;
    try {
      let d = g.rx >= g.ry ? R.drawEllipse(g.rx, g.ry) : R.drawEllipse(g.ry, g.rx).rotate(90, [0, 0]);
      if (Math.abs(g.rot) > 1e-12) d = d.rotate(g.rot * 180 / Math.PI, [0, 0]);
      return d.translate(g.c[0], g.c[1]);
    } catch (_) { /* weiter mit Kurvenzug */ }
  }
  let pen = R.draw(E[0].a);
  E.forEach((e, i) => {
    const last = i === E.length - 1;
    if (e.type === 'line') { if (!last) pen = pen.lineTo(e.b); }
    else if (e.type === 'spl') pen = splPen(pen, e);
    else pen = pen.threePointsArcTo(e.b, e.mid);
  });
  return pen.close();
}
/* Punktzug (Ellipse/Spline) als glatte Folge kubischer Bézier-Kurven (Catmull-Rom → Bézier) */
function splPen(pen, e) {
  // Teilstück einer Ellipse exakt als Ellipsenbogen
  if (e.arc) {
    try { return pen.ellipseTo(e.b, e.arc.rx, e.arc.ry, e.arc.rot * 180 / Math.PI, e.arc.span > Math.PI, !!e.arc.ccw); } catch (_) { /* weiter */ }
  }
  // Spline als eine glatte B-Spline-Kurve durch die Punkte
  try {
    const crv = R.drawPointsInterpolation(e.pts).blueprint.curves[0];
    // saveCurve rückt den Stift nicht weiter (das tun nur lineTo & Co.) – ohne das begann die nächste Kante am
    // Anfang der Spline, und jeder Umriss aus Spline + weiteren Kanten wurde falsch (Viertelkreis 56,3 statt 78,5 mm²)
    if (crv) { pen.saveCurve(crv); pen.pointer = e.b.slice(); return pen; }
  } catch (_) { /* weiter mit Bézier-Kette */ }
  const P = e.pts, n = P.length;
  const closed = !!e.closed;
  const at = i => {
    if (closed) { const m = n - 1; return P[((i % m) + m) % m]; }
    if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
    if (i >= n) return [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
    return P[i];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 1e-9) continue;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    pen = pen.cubicBezierCurveTo(i === n - 2 ? e.b : p2, c1, c2);
  }
  return pen;
}
const regionDrawing = r => r.holes.reduce((d, h) => d.cut(loopDrawing(h)), loopDrawing(r.outer));

/* Schriften werden vor dem Aufbau geladen (replicad braucht sie synchron) */
const fontsLoaded = new Map();
async function ensureFonts(features) {
  const need = new Set();
  (features || []).forEach(f => { if (f.type === 'sketch') (f.texts || []).forEach(t => need.add(FONTS[t.font] ? t.font : 'sans')); });
  // für Text auf Kurven die Laufweiten der Zeichen (opentype)
  await Promise.all([...need].map(k => loadFontOT(k).then(f => otFonts.set(k, f)).catch(() => {})));
  await Promise.all([...need].map(k => {
    if (!fontsLoaded.has(k)) fontsLoaded.set(k, R.loadFont(FONTS[k].url, k).catch(err => { fontsLoaded.delete(k); throw new Error('Schrift konnte nicht geladen werden: ' + err.message); }));
    return fontsLoaded.get(k);
  }));
}

/* ---------- Zeitmessung der teuren Phasen (nur Diagnose, kein Verhalten) ----------
   Jeder Bau setzt PHASEN zurück; Import und Vernetzung tragen ihre Zeiten bei, das Ergebnis
   liefert sie an die Statusleiste. Ohne PHASEN (andere Aufträge, Prüfstände) messen die
   Kernfunktionen nicht. So wird sichtbar, ob eine große STEP-Datei am Einlesen, am Übersetzen,
   am Sichern oder an der Triangulation hängt – der Bau-`ms` allein verbirgt alles vor `ensureImports`. */
let PHASEN = null;
const newPhasen = () => ({
  datei: 0, uebersetzen: 0, namen: 0, fallback: 0, stl: 0, laden: 0, binLesen: 0, sichern: 0, netze: 0, mischen: 0, gesamt: 0,
  /* Die restliche Bauzeit, aufgeteilt: Vorbereiten (Schriften, Import-Grundlagen), Eigenes bauen
     (`buildFeatures`) und das Ergebnis zusammenstellen. Ohne diese drei ist `gesamt` durch nichts
     zu erklären – gemessen an einer großen Baugruppe 172,9 s Gesamtzeit bei 0,24 s vermessener
     Schritte. */
  vorbereiten: 0, bauwerk: 0, ergebnis: 0,
  // Körper, deren Beschreibungen die Seite schon hatte und die deshalb nicht noch einmal mitgingen
  netzVerwiesen: 0,
  gitter: 0, kantennetz: 0, flaecheninfo: 0, kanteninfo: 0, volumen: 0, huelle: 0, umwandeln: 0,
  huelleFallback: 0, dbLesen: 0, dbSichern: 0, netzLuecken: 0,
  /* Längste Einzelzeit eines Vernetzens samt zugehörigem Schlüssel: abgegeben wird nur zwischen zwei
     Körpern, eine einzelne Form kann den Kern also minutenlang blockieren, ohne dass ein Bau
     durchkommt. Ein abgebrochener Nachtrag meldet seine Zeiten gar nicht – ohne diesen Wert wäre
     so eine Blockade nicht zu finden. */
  netzLangsam: 0, netzLangsamSchluessel: '', netzLangsamNetz: 0, netzLangsamStufe: '',
  /* Verbinden mit einem vorhandenen Körper: zuerst die Suche nach dem betroffenen Körper (Hüllen- und
     Entfernungsprüfung an jedem Körper der Baugruppe), dann das Verschmelzen. Beides getrennt gemessen
     und gezählt – ein Quader im Ursprung einer großen Baugruppe hat 170 s gebraucht, und ohne diese
     Zahlen wäre die Ursache nur zu raten. */
  zielSuche: 0, distanz: 0, boolesch: 0, huellePruefungen: 0, distanzPruefungen: 0,
  dbFehlt: 0, dbBestand: 0, dbGesetzt: 0, dbFehl: 0, dbVerworfen: 0, dbBytes: 0,
  dbGefragt: 0, dbGefunden: 0, dbUnbrauchbar: 0, dbGrob: 0, dbBestandNach: 0,
  imports: 0, ausCache: 0, netzeNeu: 0, netzeAusCache: 0, netzeAusDB: 0, netzeAusBau: 0, koerper: 0, wurzeln: 0,
  netzeOhneSchluessel: 0, netzVerdraengt: 0, netzSchluessel: '',
  // Zweistufige Netzerzeugung: welche Feinheit dieser Bau tatsächlich gebaut hat, und wie viele
  // Körper auf die feine Fassung noch warten. Ohne diese beiden Zahlen ist ein schneller Erstbau
  // nicht von einer fehlgeschlagenen Verfeinerung zu unterscheiden.
  netzStufe: '', netzWartet: 0,
  // Flächenbeschreibung aufteilen: woher der Flächenmittelpunkt kommt – aus den fertigen
  // Dreiecken (ebene bzw. gekrümmte Fläche) oder doch aus einer Kernanfrage (Notfall).
  fEben: 0, fGewellt: 0, fKern: 0, fNotfall: 0,
  // Flächen, die der Mescher nicht vernetzt: geflickte und verbliebene Löcher (siehe `netzLuecken`).
  fFlicken: 0, fOhneNetz: 0,
  // Übernommen aus der anderen Feinheit desselben Körpers (siehe `meshBody`): zeigt, ob die
  // nachziehende Verfeinerung die Beschreibungen wirklich wiederverwendet oder doch alles neu fragt.
  fGleich: 0, eGleich: 0,
  // Körper, deren Volumen in dieser Stufe aus dem Netz genommen wurde statt aus der genauen
  // Bestimmung (grobe Fassung). Ohne diese Zahl ist nicht zu sehen, dass ein schneller Erstbau
  // vorläufige Massen bedeutet.
  vAusNetz: 0,
  // Gefundener und geschriebener Volumen-Vorrat im Dauerspeicher (siehe `VOL_PREFIX`). Beides
  // zusammen zeigt, ob eine erneut geöffnete Datei ihre genauen Massen wiederfindet oder neu
  // rechnen muss.
  volAusDB: 0, volGesetzt: 0, volFehlt: 0, volNetzAbw: 0
});
function pAdd(key, t0) { if (PHASEN) PHASEN[key] += performance.now() - t0; }
function pCount(key) { if (PHASEN) PHASEN[key]++; }
/* Merkt die längste Einzelzeit eines Vernetzens mitsamt dem Schlüssel, der dazu gehört – siehe
   `netzLangsam` in `newPhasen`. */
/* Dieselbe Zeit bleibt auch über den Bau hinaus stehen. Der Netznachtrag läuft, nachdem das
   Bauergebnis weggeschickt ist, und seine PHASEN erreichen die Oberfläche nie – was ein späterer
   Bauauftrag an Warteschlange vorfindet, ist genau diese Zeit, denn der Nachtrag gibt den Worker
   erst nach einem Körper frei. */
let netzLangsamWert = { ms: 0, bytes: 0, stufe: '', schluessel: '' };
/* Verteilung der Einzelnetze über alle Bäume und Nachträge hinweg. Das längste Netz allein reicht
   nicht, um eine Begrenzung je Körper zu beurteilen: erst die Häufigkeit sagt, was sie kostet.
   Zählt auf Worker-Ebene, weil die PHASEN des Netznachtrags die Oberfläche nie erreichen.
   `wartend` sind die Netze, die eine Bedienung schon spüren (ab 300 ms), `lang` die, die einen
   Bau oder Nachtrag deutlich aufhalten (ab 1 s). */
let netzVerteilung = { gesamt: 0, ms: 0, wartend: 0, lang: 0 };
function pLangsam(t0, schluessel, bytes, stufe) {
  const d = Math.round(performance.now() - t0);
  netzVerteilung.gesamt++; netzVerteilung.ms += d;
  if (d >= 300) netzVerteilung.wartend++;
  if (d >= 1000) netzVerteilung.lang++;
  if (d > netzLangsamWert.ms) netzLangsamWert = { ms: d, bytes: bytes || 0, stufe: String(stufe || ''), schluessel: String(schluessel || 'ohne Schlüssel') };
  if (!PHASEN) return;
  if (d <= PHASEN.netzLangsam) return;
  PHASEN.netzLangsam = d;
  PHASEN.netzLangsamSchluessel = String(schluessel || 'ohne Schlüssel');
  PHASEN.netzLangsamBytes = bytes || 0;
  PHASEN.netzLangsamStufe = String(stufe || '');
}
function pN(key, n) { if (PHASEN) PHASEN[key] += n; }

/* ---------- Import (STEP/STL): Dateien vor dem Bauen einlesen und nach Inhalt zwischenspeichern ---------- */
const importCache = new Map();
// Zusätzlich zum CAD-Import die erzeugten Anzeige-Netze unveränderter
// STEP-Körper halten. So wird eine große Baugruppe nach Änderungen an anderen
// Features nicht erneut trianguliert.
const importMeshCache = new Map();
let importMeshBytes = 0;
const IMPORT_MESH_CACHE_LIMIT = 320e6;
/* Anzeige-Netze unveränderter Importe auch dauerhaft im Browser halten. Der Speicher-Cache fällt beim
   Neuladen weg, ohne das hier wird eine große Baugruppe bei jedem Öffnen neu trianguliert – gemessen an
   einer Baugruppe mit 797 Körpern: 321,6 s von 321,8 s Bauzeit stecken in der Netzerzeugung, die
   Formkörper selbst kommen aus dem Dauerspeicher in 139 ms. Genutzt wird derselbe IndexedDB-Speicher
   wie für die Importkörper, die Schlüssel tragen den Vorbau `netz:` (kein neues Objektstore, damit ein
   offener zweiter Programmteil die Datenbank nicht in der Versionsprüfung hält). Grenzen: `NETZ_MAX`
   ein einzelner Netzteil darüber gar nicht versucht, `NETZ_BATCH` Größe eines Schreibvorgangs und
   `NETZ_READ` Zahl der Schlüssel pro Lesevorgang (hunderte Netze in einem Vorgang schlagen eher fehl,
   und ein abgebrochener Vorgang gilt ganzzahlig), `NETZ_FREI` wie viel freigegeben wird, wenn der
   Browser ablehnt. */
const NETZ_PREFIX = 'netz:', NETZ_MAX = 60e6, NETZ_BATCH = 8e6, NETZ_READ = 200, NETZ_FREI = 60e6;
/* Genaue Volumenwerte getrennt von den Netzen speichern. Der Wert hängt an der Form, nicht an der
   Netzdichte – als winziger eigener Eintrag (`vol:` + Netzschlüssel) überlebt er jedes Verwerfen
   eines Netzes und muss bei einer erneut geöffneten Datei nicht neu bestimmt werden. Ohne das hier
   war es genau das: gemessen über 13 min Nacharbeit an einer Baugruppe, deren Bild in 4,2 s steht,
   weil die frisch aus dem Binärspeicher geholten Formen für die genaue Bestimmung weit teurer sind
   als die gerade vernetzten (24,8 s im ersten Öffnen). Vorbau `vol:` statt eines neuen Objektstores
   (siehe `NETZ_PREFIX`); die Netzverdrängung arbeitet nur im `netz:`-Bereich und lässt diese
   Einträge bewusst in Ruhe. */
const VOL_PREFIX = 'vol:';
/* Zwei Feinheiten des Anzeigenetzes. Maßgeblich für die analytischen Flächen (Zylinder, Kegel, Kugel,
   Torus) ist die Winkeltoleranz: sie setzt die Zahl der Segmente im Umlauf direkt und unabhängig vom
   Radius (2π/θ: bei 0,2 rad 32 Segmente, bei 0,8 rad 8). Die Sehnenabweichung dazu ist
   r·(1 − cos(θ/2)) – bei 0,8 rad sind das 2,4 mm an einem 30-mm-Radius, in der Übersicht einer
   Baugruppe unsichtbar, beim Hereinzoomen an einem Einzelteil sichtbar.
   Die lineare Toleranz ist dagegen nur bei Freiformflächen maßgeblich. An drei Bauteilen aus
   ebenen und analytischen Flächen ändert sie nichts (Faktor 1, 2, 4, 8, 16 – die Dreieckszahl bleibt
   auf das Dreieck gleich); an einer extrudierten Freiformfläche sinkt die Dreieckszahl bei Faktor 4
   auf 36 %, bei Faktor 16 auf 24 %, während die Winkeltoleranz dort nur 13 % bringt. An der großen
   Baugruppe stecken 45 % aller Dreiecke auf 2 866 Freiformflächen – ohne die lineare Toleranz
   bliebe genau dieser Teil in der groben Fassung unangetastet.
   Deshalb zweistufig: `grob` bringt eine große Baugruppe schnell ins Bild, `fein` zieht danach nach
   (`netzVerfeinern`, außerhalb des Bauauftrags). `NETZ_GROB_AB` sagt, ab wie vielen neu zu rechnenden
   Netzen sich das lohnt – gemessen rund 226 ms je Körper, bei 40 Körpern also rund 9 s Triangulation,
   die die grobe Fassung früher sichtbar macht. Kleinere Modelle bleiben einstufig. */
const NETZ_WINKEL = { fein: 0.2, grob: 0.8 };
const NETZ_TOL = { fein: 1, grob: 4 };
let NETZ_GROB_AB = 40;
/* Stufen für Flächen, die im Netz gar keine Dreiecke haben (siehe `netzLuecken`): jeweils
   Vielfaches der Toleranz dieser Stufe und Winkeltoleranz. Die erste Stufe ist die, die an der
   großen Baugruppe 100 von 130 offenen Flächen vernetzt. */
const NETZ_NACHHOL = [[4, 0.8], [16, 1.0]];
/* Die Verfeinerung läuft außerhalb des Auftrags, also neben möglichen Folgeaufträgen. Ein neuer Bau
   setzt `netzAbbruch` und wartet, bis sie wirklich steht – sonst griffen zwei Bauten gleichzeitig auf
   `PHASEN`, `meshGeschuetzt` und die Körper des letzten Baus zu. */
let netzFeinLaeuft = null, netzAbbruch = false;
/* Beschreibungen nur für neue Körpernetze schicken: jedes Körpernetz trägt eine feste Kennung `uid`
   (bleibt, solange dasselbe Netzobjekt benutzt wird – Speicher-Cache, Vorrat des Baus). Die Seite
   sagt mit jedem Bau, welche Kennungen sie hält (`payload.have`); für diese Körper schickt das
   Mischen keine Flächen- und Kantenbeschreibungen, die Seite übernimmt sie aus ihrem vorigen Netz
   (`Kernel.resolveMesh`). Gemessen an der großen Baugruppe: das Kopieren von rund 51 000 Flächen- und
   137 000 Kantenbeschreibungen kostete je Antwort 0,4 s, die Netzpuffer selbst werden übertragen.
   `seiteHat` gilt für das gerade laufende Mischen, `zuletztGesendet` sind die Kennungen der letzten
   Antwort – darauf bezieht sich der Nachtrag der feinen Netze. */
const NETZ_SITZUNG = Math.random().toString(36).slice(2, 8);
let netzSeq = 0, seiteHat = null, zuletztGesendet = new Set();
/* Körper ohne `meshCacheKey` (alles, was das Programm selbst geformt hat) können nirgends wieder-
   gefunden werden und werden bei jedem Bau neu trianguliert. Bei zweistufiger Erzeugung würden sie
   erst grob und dann noch einmal fein gerechnet – also doppelt, ohne dass etwas gespart wäre.
   Deshalb: diese Körper bekommen in beiden Stufen die feine Fassung, und die nachziehende
   Verfeinerung übernimmt sie aus dem laufenden Bau statt sie neu zu rechnen. Ein Bau macht den
   Vorrat neu, damit ein abgebrochener Nachtrag keine Netze eines früheren Baus einschleust. */
let netzFeinVorrat = new WeakMap();
/* Rechnet die reinen Anzeigefelder zusammen. Die Flächen- und Kantenbeschreibung fehlt darin – die
   Größe ist also eine Unterschätzung, als Grenze für einen Schreibvorgang aber die verlässlichere. */
const partBytes = part => part.positions.byteLength + part.normals.byteLength + part.index.byteLength + part.edgePositions.byteLength;
function dropImportMesh(key) {
  const old = importMeshCache.get(key);
  if (old) importMeshBytes -= old.bytes || 0;
  importMeshCache.delete(key);
}
/* Netze, die dieser Bau noch braucht, dürfen nicht verdrängt werden (`meshGeschuetzt`). Ohne diese
   Rücksicht entsteht eine Kette: beim Planen des Baus liegen die Netze aller Körper im Speicher, also
   wird keiner ihrer Schlüssel im Dauerspeicher angefragt. Beim Abarbeiten verdrängt jedes neu eingefügte
   Netz das älteste – und das älteste ist genau das des nächsten Körpers. Der findet es weder im Speicher
   (gerade verdrängt) noch im Dauerspeicher (nie angefragt) und trianguliert neu. Gemessen an einer
   Baugruppe mit 797 Körpern: 202 Netze aus dem Dauerspeicher, 595 neu trianguliert, 110 s Bauzeit –
   während dasselbe Projekt nach dem Neuladen (Speicher-Cache leer, alles im Dauerspeicher angefragt)
   964 ms braucht. Lässt sich kein Netz verdrängen, bleibt das neue einfach ungecacht; es steht im
   Dauerspeicher und ist beim nächsten Bau wieder da. */
let meshGeschuetzt = null;
function cacheImportMesh(key, part, fein = true) {
  const bytes = partBytes(part);
  if (bytes > IMPORT_MESH_CACHE_LIMIT) return part;
  for (const k of importMeshCache.keys()) {
    if (importMeshBytes + bytes <= IMPORT_MESH_CACHE_LIMIT) break;
    if (meshGeschuetzt && meshGeschuetzt.has(k)) continue;
    dropImportMesh(k);
  }
  if (importMeshBytes + bytes > IMPORT_MESH_CACHE_LIMIT) return part;
  importMeshCache.set(key, { part, bytes, fein });
  importMeshBytes += bytes;
  return part;
}
/* Darf ein gespeicherter Netzbestand für die gewünschte Feinheit benutzt werden? Die grobe Fassung
   nimmt jedes Netz – auch ein feines ist besser als neu rechnen. Die feine Fassung nimmt nur ein
   feines. Einträge aus einer früheren Programmversion haben kein `fein`-Feld; sie sind immer die
   feine Fassung, weil die bis dahin einzige Einstellung 0,2 rad war. */
const netzPasst = (wert, stufe) => !!wert && !!wert.part && (stufe === 'grob' || wert.fein !== false);
function invalidateMesh(b) { if (b && b.meshCacheKey) delete b.meshCacheKey; }
// hashStr und importKey: src/importkey.js (die Seite bildet denselben Schlüssel und schickt den Dateitext nur einmal)
function collectImports(features, inserts, out = []) {
  (features || []).forEach(f => { if (f.type === 'import') out.push(f); if (f.type === 'derive' && f.part) collectImports(f.part.features, f.part.inserts, out); });
  (inserts || []).forEach(i => i.part && collectImports(i.part.features, i.part.inserts, out));
  return out;
}
/* STL (binär oder Text) → Dreiecke → Flächen → vernähter Festkörper */
function stlTriangles(u8) {
  const tris = [];
  const head = new TextDecoder().decode(u8.subarray(0, Math.min(u8.length, 512)));
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const nBin = u8.length >= 84 ? dv.getUint32(80, true) : 0;
  if (u8.length >= 84 && 84 + nBin * 50 === u8.length) {
    for (let i = 0; i < nBin; i++) {
      const o = 84 + i * 50 + 12, v = k => [dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)];
      tris.push([v(0), v(1), v(2)]);
    }
  } else if (/^\s*solid/i.test(head)) {
    const txt = new TextDecoder().decode(u8), re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m, cur = [];
    while ((m = re.exec(txt))) { cur.push([+m[1], +m[2], +m[3]]); if (cur.length === 3) { tris.push(cur); cur = []; } }
  } else throw new Error('Unbekanntes STL-Format');
  if (!tris.length) throw new Error('Die STL-Datei enthält keine Dreiecke');
  if (tris.length > 150000) throw new Error(`Zu viele Dreiecke (${tris.length}) – bitte gröber exportieren (max. 150 000)`);
  return tris;
}
/* Schnellweg: gemeinsame Punkte und Kanten direkt aufbauen statt vernähen (≈ 3–4× schneller).
   Geht nur bei einem sauberen, geschlossenen Netz mit einheitlichem Umlaufsinn – sonst null. */
function stlSolidFast(tris) {
  const vmap = new Map(), P = [], T = [];
  const vid = p => { const k = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`; let i = vmap.get(k); if (i === undefined) { i = P.length; vmap.set(k, i); P.push(p); } return i; };
  tris.forEach(t => {
    const [a, b, c] = t.map(vid);
    if (a === b || b === c || a === c) return;
    if (len(cross(sub(P[b], P[a]), sub(P[c], P[a]))) < 1e-12) return;
    T.push([a, b, c]);
  });
  if (P.length >= 4194304) return null;
  const K = (i, j) => i * 4194304 + j;
  // doppelte Dreiecke (gleiche drei Punkte) entfernen – kommt in exportierten Netzen öfter vor
  { const seen = new Set(), keep = [];
    for (const t of T) { const k = [...t].sort((x, y) => x - y).join(','); if (!seen.has(k)) { seen.add(k); keep.push(t); } }
    T.length = 0; for (const t of keep) T.push(t); }   // kein push(...keep): ab ~100 000 Dreiecken läuft der Stapel über
  // Umlaufsinn vereinheitlichen: über gemeinsame Kanten von Dreieck zu Dreieck gehen und falsch herum liegende umdrehen.
  // Jede Kante muss genau zwei Dreiecke haben (geschlossen, mannigfaltig), sonst Rückfall aufs Vernähen.
  const adj = new Map();
  T.forEach((t, ti) => { for (let e = 0; e < 3; e++) { const i = t[e], j = t[(e + 1) % 3], k = K(Math.min(i, j), Math.max(i, j)); let l = adj.get(k); if (!l) adj.set(k, l = []); l.push(ti); } });
  for (const l of adj.values()) if (l.length !== 2) return null;
  const done = new Uint8Array(T.length);
  const hasDir = (t, i, j) => (t[0] === i && t[1] === j) || (t[1] === i && t[2] === j) || (t[2] === i && t[0] === j);
  for (let s0 = 0; s0 < T.length; s0++) {
    if (done[s0]) continue;
    done[s0] = 1;
    const stack = [s0];
    while (stack.length) {
      const ti = stack.pop(), t = T[ti];
      for (let e = 0; e < 3; e++) {
        const i = t[e], j = t[(e + 1) % 3], l = adj.get(K(Math.min(i, j), Math.max(i, j)));
        const ni = l[0] === ti ? l[1] : l[0], n = T[ni];
        const same = hasDir(n, i, j); // Nachbar läuft dieselbe Richtung → falsch herum
        if (!done[ni]) { if (same) T[ni] = [n[0], n[2], n[1]]; done[ni] = 1; stack.push(ni); }
        else if (same) return null; // nicht orientierbar
      }
    }
  }
  const oc = R.getOC();
  const ANY = oc.TopAbs_ShapeEnum.TopAbs_SHAPE, EDGE = oc.TopAbs_ShapeEnum.TopAbs_EDGE, VERT = oc.TopAbs_ShapeEnum.TopAbs_VERTEX, FWD = oc.TopAbs_Orientation.TopAbs_FORWARD;
  const V = P.map(p => { const g = new oc.gp_Pnt(p[0], p[1], p[2]); const mv = new oc.BRepBuilderAPI_MakeVertex(g); const v = mv.Vertex(); g.delete(); mv.delete(); return v; });
  const E = new Map();
  const edge = (i, j) => { const lo = Math.min(i, j), hi = Math.max(i, j), k = K(lo, hi); let e = E.get(k); if (!e) { const me = new oc.BRepBuilderAPI_MakeEdge(V[lo], V[hi]); e = me.Edge(); me.delete(); E.set(k, e); } return e; };
  // zusammenhängende Teile (mehrere Körper in einer STL) getrennt zu Festkörpern machen
  const parent = P.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const [a, b, c] of T) { const ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra; }
  const groups = new Map();
  for (const t of T) { const r = find(t[0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  const near = (g, i) => Math.abs(g.X() - P[i][0]) + Math.abs(g.Y() - P[i][1]) + Math.abs(g.Z() - P[i][2]) < 1e-9;
  const B = new oc.TopoDS_Builder();
  const solids = [];
  for (const tg of groups.values()) {
    const shell = new oc.TopoDS_Shell();
    B.MakeShell(shell);
    for (const [a, b, c] of tg) {
      const mw = new oc.BRepBuilderAPI_MakeWire();
      mw.Add(edge(a, b)); mw.Add(edge(b, c)); mw.Add(edge(c, a));
      const mf = new oc.BRepBuilderAPI_MakeFace(mw.Wire(), true);
      let f = mf.Face();
      // Umlaufsinn der fertigen Fläche prüfen: die erste Kante muss a→b, b→c oder c→a laufen
      const ex = new oc.TopExp_Explorer(f, EDGE, ANY), vx = new oc.TopExp_Explorer(oc.TopoDS.Edge(ex.Current()), VERT, ANY);
      let ip = -1, iq = -1;
      for (; vx.More(); vx.Next()) {
        const vv = oc.TopoDS.Vertex(vx.Current()), g = oc.BRep_Tool.Pnt(vv);
        const idx = near(g, a) ? 0 : near(g, b) ? 1 : 2;
        if (vv.Orientation() === FWD) ip = idx; else iq = idx;
        g.delete();
      }
      vx.delete(); ex.delete();
      if ((ip + 1) % 3 !== iq) f = f.Reversed();
      B.Add(shell, f);
      mf.delete(); mw.delete();
    }
    const ms = new oc.BRepBuilderAPI_MakeSolid(shell);
    let solid = R.cast(ms.Solid());
    ms.delete();
    const vol = safeVolume(solid);
    if (vol != null && vol < 0) solid = R.cast(solid.wrapped.Reversed());
    solids.push(solid);
  }
  return solids.length === 1 ? solids[0] : R.makeCompound(solids);
}
function stlSolid(u8) {
  const tris = stlTriangles(u8);
  try { const s = stlSolidFast(tris); if (s) return s; } catch (_) { /* Rückfall: Vernähen */ }
  // Punkte zusammenführen, damit das Vernähen sicher klappt
  const key = p => p.map(v => Math.round(v * 1e4)).join(','), pts = new Map();
  const P = p => { const k = key(p); if (!pts.has(k)) pts.set(k, p); return pts.get(k); };
  const faces = [];
  tris.forEach(t => {
    const [a, b, c] = t.map(P);
    if (a === b || b === c || a === c) return;
    if (len(cross(sub(b, a), sub(c, a))) < 1e-12) return;
    try { faces.push(R.makePolygon([a, b, c])); } catch (_) { /* entartet */ }
  });
  try { return R.makeSolid(faces); } catch (_) { return R.makeCompound(faces); }
}
/* Fertig umgewandelte Importkörper im Browser speichern (IndexedDB, Binärformat von OpenCASCADE),
   damit große oder unsaubere STL-Dateien nach dem Neuladen nicht erneut vernäht werden müssen. */
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise(res => {
    try {
      const rq = indexedDB.open('cantcodecad-import', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('shapes');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch (_) { res(null); }
  });
  return idbP;
}
async function idbDo(mode, fn) {
  const db = await idb();
  if (!db) return null;
  return new Promise(res => {
    try {
      const tx = db.transaction('shapes', mode), rq = fn(tx.objectStore('shapes'));
      rq.onsuccess = () => res(rq.result ?? null);
      rq.onerror = () => res(null);
    } catch (_) { res(null); }
  });
}
/* Mehrere Schlüssel in einem Durchgang: bei einer großen Baugruppe sind das hunderte Netze, und
   jede einzelne Transaktion kostet eigene Zeit. In Portionen, damit ein abgebrochener Durchgang
   nicht die schon gefundenen Netze mitnimmt – ein einziger großer Lesevorgang schlägt bei hunderten
   Einträgen eher fehl. Gefunden wird nur, was da ist; Fehler sind egal, dann greift wie bisher der
   Weg über die Triangulation. */
async function idbGets(schluessel) {
  const db = await idb();
  const out = new Map();
  if (!db) return out;
  for (let i = 0; i < schluessel.length; i += NETZ_READ) {
    const stueck = schluessel.slice(i, i + NETZ_READ);
    await new Promise(res => {
      try {
        const tx = db.transaction('shapes', 'readonly'), st = tx.objectStore('shapes');
        for (const k of stueck) {
          const rq = st.get(k);
          rq.onsuccess = () => { if (rq.result != null) out.set(k, rq.result); };
        }
        tx.oncomplete = () => res();
        tx.onerror = tx.onabort = () => res();
      } catch (_) { res(); }
    });
  }
  return out;
}
async function idbPuts(entries) {
  const db = await idb();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction('shapes', 'readwrite'), st = tx.objectStore('shapes');
      for (const [wert, schluessel] of entries) st.put(wert, schluessel);
      tx.oncomplete = () => res(true);
      tx.onerror = tx.onabort = () => res(false);
    } catch (_) { res(false); }
  });
}
/* Wie viele Netze tatsächlich im Dauerspeicher liegen. Nur Diagnose: ohne diese Zahl ist nicht zu
   unterscheiden, ob nichts geschrieben wurde oder ob geschrieben wurde und das Wiederfinden nicht
   klappt – beides fühlt sich im Programm gleich an (alles wird neu trianguliert). */
async function idbCountNetz() {
  const db = await idb();
  if (!db) return -1;
  return new Promise(res => {
    try {
      let n = 0;
      const tx = db.transaction('shapes', 'readonly');
      const rq = tx.objectStore('shapes').openKeyCursor(IDBKeyRange.bound(NETZ_PREFIX, NETZ_PREFIX + '\uffff'));
      rq.onsuccess = () => { const c = rq.result; if (c) { n++; c.continue(); } };
      tx.oncomplete = () => res(n);
      tx.onerror = tx.onabort = () => res(n);
    } catch (_) { res(-1); }
  });
}
/* Schlüssel eines Bereichs aufzählen. Ein Geschwindigkeitsindex fehlt in diesem Speicher, also hilft
   das Durchgehen – gebraucht, um den Volumen-Vorrat (`VOL_PREFIX`) mit denselben Prüfständen zu
   leeren wie die Netze. */
async function idbKeys(bereich) {
  const db = await idb();
  if (!db) return [];
  return new Promise(res => {
    const out = [];
    try {
      const tx = db.transaction('shapes', 'readonly');
      const rq = tx.objectStore('shapes').openKeyCursor(bereich);
      rq.onsuccess = () => { const c = rq.result; if (!c) return; out.push(c.key); c.continue(); };
      tx.oncomplete = () => res(out);
      tx.onerror = tx.onabort = () => res(out);
    } catch (_) { res([]); }
  });
}
/* Gespeicherte Netze aufzählen (Alter, Schlüssel, Größe) und welche löschen. Ein Geschwindigkeits-
   index fehlt in diesem Speicher, also hilft das Durchgehen – brauchbar bei einigen hundert Einträgen
   und nötig, bevor überhaupt etwas verworfen werden kann: ein voller Browser-Speicher lehnt jedes
   weitere Netz ab, und dann wäre die ganze Arbeit dieser Zwischenspeicherung weg. */
const netzBereich = () => IDBKeyRange.bound(NETZ_PREFIX, NETZ_PREFIX + '\uffff');
async function idbListNetz() {
  const db = await idb();
  if (!db) return [];
  return new Promise(res => {
    const out = [];
    try {
      const tx = db.transaction('shapes', 'readonly');
      const rq = tx.objectStore('shapes').openCursor(netzBereich());
      rq.onsuccess = () => {
        const c = rq.result;
        if (!c) return;
        const w = c.value || {};
        const p = w.part;
        // Viertes Feld: enthält der Eintrag ein brauchbares Netz? Ein Eintrag ohne Netz fühlt sich
        // im Bau genauso an wie ein fehlender – deshalb ist das hier sichtbar gemacht.
        // Fünftes Feld: Feinheit. Einträge aus einer früheren Version haben kein `fein`-Feld; sie
        // sind die feine Fassung, weil die bis dahin einzige Einstellung 0,2 rad war.
        out.push([(w.ts || 0), c.key, (w.bytes || 0), p && p.positions && p.index ? 1 : 0, w.fein === false ? 0 : 1]);
        c.continue();
      };
      tx.oncomplete = () => res(out);
      tx.onerror = tx.onabort = () => res(out);
    } catch (_) { res(out); }
  });
}
/* Ob der Browser diesen Speicher wirklich behält, fragt die Seite nach – im Worker gibt es
   `navigator.storage.persist` nicht (gemessen), und der Kern soll davon nichts wissen. */
async function idbDelete(schluessel) {
  const db = await idb();
  if (!db || !schluessel.length) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction('shapes', 'readwrite'), st = tx.objectStore('shapes');
      for (const k of schluessel) st.delete(k);
      tx.oncomplete = () => res(true);
      tx.onerror = tx.onabort = () => res(false);
    } catch (_) { res(false); }
  });
}
let binSeq = 0;
function shapeToBin(shape) {
  const oc = R.getOC(), path = `/imp${++binSeq}.bin`, pr = new oc.Message_ProgressRange();
  try { oc.BinTools.Write(shape.wrapped, path, pr); return oc.FS.readFile(path); }
  finally { pr.delete(); try { oc.FS.unlink(path); } catch (_) { /* egal */ } }
}
function binToShape(bytes) {
  const oc = R.getOC(), path = `/imp${++binSeq}.bin`, pr = new oc.Message_ProgressRange();
  try {
    oc.FS.writeFile(path, bytes);
    const sh = new oc.TopoDS_Shape();
    oc.BinTools.Read(sh, path, pr);
    if (sh.IsNull()) throw new Error('leer');
    return R.cast(sh);
  } finally { pr.delete(); try { oc.FS.unlink(path); } catch (_) { /* egal */ } }
}
/* STEP direkt lesen statt über R.importSTEP: dieselben Schritte wie replicad (Datei ins Emscripten-FS,
   STEPControl_Reader.ReadFile, TransferRoots, OneShape), aber die beiden Phasen getrennt gemessen.
   Nur so sieht man, ob die Datei beim Einlesen oder beim Übersetzen in TopoDS hängt – das entscheidet,
   ob sich ein Leseparameter (siehe NOTIZEN „Import“) lohnt. Fehlt der direkte Weg, zurück auf R.importSTEP. */
async function readSTEP(text) {
  const oc = R.getOC(), path = `/imp${++binSeq}.step`;
  oc.FS.writeFile(path, new TextEncoder().encode(text));
  try {
    const rd = new oc.STEPControl_Reader();
    try {
      let t0 = performance.now();
      const ok = rd.ReadFile(path.slice(1));
      pAdd('datei', t0);
      if (!ok) throw new Error('Datei konnte nicht gelesen werden');
      if (PHASEN) { try { PHASEN.wurzeln = rd.NbRootsForTransfer(); } catch (_) { /* egal */ } }
      t0 = performance.now();
      rd.TransferRoots();
      const sh = rd.OneShape();
      pAdd('uebersetzen', t0);
      if (sh.IsNull()) throw new Error('leer');
      return R.cast(sh);
    } finally { rd.delete(); }
  } catch (err) {
    const t0 = performance.now();
    try { return await R.importSTEP(new Blob([text])); }
    finally { pAdd('fallback', performance.now() - t0); }
  } finally {
    try { oc.FS.unlink(path); } catch (_) { /* egal */ }
  }
}
/* Namen und Farben der Festkörper eines STEP-Imports: Fingerabdruck jedes gelesenen Körpers mit denen aus der Datei
   vergleichen. Ergebnis je Körper-Index (wie `shape.solids` sie liefert): { name, color? } oder null. Gespeicherte
   Einträge früherer Versionen sind reine Namen (Zeichenketten). */
function importNamen(shape, text) {
  let liste;
  try { liste = stepNamen(text); } catch (_) { return null; }
  if (!liste.length) return null;
  let sols = [];
  try { sols = shape.solids || []; } catch (_) { return null; }
  const oc = R.getOC(), VERT = oc.TopAbs_ShapeEnum.TopAbs_VERTEX, FACE = oc.TopAbs_ShapeEnum.TopAbs_FACE, ANY = oc.TopAbs_ShapeEnum.TopAbs_SHAPE;
  /* Gemessen an einer großen Baugruppe (797 Körper): 545 000 Eckpunkt-Besuche 1,3 s, Text lesen 0,5 s. Flächen zählt der
     Explorer (0,02 s) statt `faces` von replicad, das für jede Fläche ein Objekt anlegt (0,12 s). */
  const punkte = [];
  const res = sols.map((so, si) => {
    try {
      const pts = [];
      punkte[si] = pts;
      const ex = new oc.TopExp_Explorer(so.wrapped, VERT, ANY);
      for (; ex.More(); ex.Next()) { const g = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex(ex.Current())); pts.push([g.X(), g.Y(), g.Z()]); g.delete(); }
      ex.delete();
      let nf = 0;
      const fx = new oc.TopExp_Explorer(so.wrapped, FACE, ANY);
      for (; fx.More(); fx.Next()) nf++;
      fx.delete();
      const fp = fingerabdruck(pts, nf);
      let best = null, bd = 3;
      for (const x of liste) { const d = abstandFP(fp, x.fp); if (d < bd) { bd = d; best = x; } }
      return best ? { name: best.name, teil: best.teil || best.name, k: best.k || 0, nb: best.nb || 1, ...(best.color ? { color: best.color } : {}) } : null;
    } catch (_) { return null; }
  });
  einbauten(res, liste.blaetter || []);
  instanzenFinden(res, liste.blaetter || [], punkte);
  return res;
}
/* Instanzen: Einbauten desselben Teils (gleiche Produktdefinition) werden Kopien des ersten Einbaus. Die
   Lage kommt aus der Datei (T = Lage_j · Lage_1⁻¹); übernommen nur, wenn die verschobenen Eckpunkte des ersten Einbaus
   wirklich auf Eckpunkten des Einbaus j liegen (Toleranz 1e-4 der Größe) – sonst bleibt der Einbau ein eigenes Teil.
   Ergebnis je Körper `inst: { von, R, t }` (von = Nummer des Original-Einbaus). */
function instanzenFinden(res, blaetter, punkte) {
  const jeEinbau = new Map(); // occ → [Körper-Index]
  res.forEach((z, i) => { if (z && Number.isInteger(z.occ)) { if (!jeEinbau.has(z.occ)) jeEinbau.set(z.occ, []); jeEinbau.get(z.occ).push(i); } });
  const jePd = new Map();
  [...jeEinbau.keys()].sort((a, b) => a - b).forEach(j => {
    const b = blaetter[j];
    if (!b || !b.lage || jeEinbau.get(j).length !== b.nb) return;
    if (!jePd.has(b.pd)) jePd.set(b.pd, []);
    jePd.get(b.pd).push(j);
  });
  const passt = (T, iA, iB) => {
    const A = punkte[iA], B = punkte[iB];
    if (!A || !B || !A.length || A.length !== B.length) return false;
    const lo = [0, 1, 2].map(k => Math.min(...B.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...B.map(p => p[k])));
    const tol = 1e-4 * Math.max(1, Math.hypot(...hi.map((v, k) => v - lo[k])));
    const probe = A.length <= 12 ? A : Array.from({ length: 12 }, (_, s) => A[Math.floor(s * A.length / 12)]);
    return probe.every(p => { const q = lageAuf(T, p); return B.some(r => Math.abs(r[0] - q[0]) <= tol && Math.abs(r[1] - q[1]) <= tol && Math.abs(r[2] - q[2]) <= tol); });
  };
  for (const occs of jePd.values()) {
    if (occs.length < 2) continue;
    const m = occs[0], Lm = lageInv(blaetter[m].lage);
    const vonK = new Map(jeEinbau.get(m).map(i => [res[i].k, i]));
    occs.slice(1).forEach(j => {
      const T = lageMal(blaetter[j].lage, Lm), ids = jeEinbau.get(j);
      if (!ids.every(i => vonK.has(res[i].k) && passt(T, vonK.get(res[i].k), i))) return;
      ids.forEach(i => { res[i].inst = { von: m, R: T.R.map(v => +v.toFixed(12)), t: T.t.map(v => +v.toFixed(9)) }; });
    });
  }
}
/* Körper den Einbauten des Baugruppenbaums zuordnen (`blaetter` aus step-namen.js, in derselben Reihenfolge, in der
   OpenCASCADE die Festkörper überträgt): der nächste noch offene Einbau desselben Teils nimmt so viele Körper auf, wie
   das Teil Festkörper hat. Ergebnis je Körper `occ` (Nummer des Einbaus) und `pfad` (Unterbaugruppen darüber). Passt
   die Reihenfolge einmal nicht, wird der erste freie Einbau des Teils genommen. */
function einbauten(res, blaetter) {
  if (!blaetter.length) return;
  const voll = new Array(blaetter.length).fill(0);
  let p = 0, offen = -1;
  res.forEach(z => {
    if (!z) return;
    const passt = j => blaetter[j].teil === z.teil && voll[j] < blaetter[j].nb;
    let j = offen >= 0 && passt(offen) ? offen : -1;
    if (j < 0) { for (let i = p; i < blaetter.length; i++) if (blaetter[i].teil === z.teil && voll[i] === 0) { j = i; break; } }
    if (j < 0) { for (let i = 0; i < blaetter.length; i++) if (passt(i)) { j = i; break; } }
    if (j < 0) return;
    voll[j]++;
    offen = j; p = Math.max(p, j);
    z.occ = j;
    z.pfad = blaetter[j].pfad;
  });
}
async function ensureImports(payload) {
  const list = collectImports(payload.features, payload.inserts);
  /* Die Seite schickt den Dateitext nur, solange sie nicht weiß, dass der Kern die Form schon hat
     (siehe `Kernel.prep`). Fehlt er doch – Form aus `importCache` verdrängt und nicht in der
     IndexedDB –, wird er hier angefordert: der Auftrag scheitert mit NEED_DATA, die Seite schickt ihn
     einmal mit Dateitext nach. */
  const fehlen = [];
  for (const f of list) {
    const key = importKey(f);
    if (importCache.has(key)) continue;
    let t0 = performance.now();
    const stored = await idbDo('readonly', st => st.get(key));
    pAdd('laden', t0);
    if (stored) {
      try {
        t0 = performance.now();
        const shape = binToShape(stored);
        pAdd('binLesen', t0);
        pCount('ausCache');
        let namen = null;
        try { const j = await idbDo('readonly', st => st.get(key + ':namen')); namen = j ? JSON.parse(j) : null; } catch (_) { /* ohne Namen */ }
        // Form aus einer früheren Version ohne Namen: aus dem Dateitext nachholen, wenn er mitkam
        if (!namen && f.format !== 'stl' && typeof f.data === 'string') {
          namen = importNamen(shape, f.data);
          if (namen) { try { await idbDo('readwrite', st => st.put(JSON.stringify(namen), key + ':namen')); } catch (_) { /* egal */ } }
        }
        importCache.set(key, { shape, namen });
        continue;
      } catch (_) { /* neu einlesen */ }
    }
    if (typeof f.data !== 'string') { fehlen.push(key); continue; }
    try {
      let shape;
      if (f.format === 'stl') {
        t0 = performance.now();
        const bin = atob(String(f.data || ''));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        shape = stlSolid(u8);
        pAdd('stl', t0);
      } else {
        shape = await readSTEP(String(f.data || ''));
      }
      pCount('imports');
      let namen = null;
      if (f.format !== 'stl') { t0 = performance.now(); namen = importNamen(shape, String(f.data || '')); pAdd('namen', t0); }
      importCache.set(key, { shape, namen });
      if (namen) { try { await idbDo('readwrite', st => st.put(JSON.stringify(namen), key + ':namen')); } catch (_) { /* nur Beschleunigung */ } }
      try {
        t0 = performance.now();
        const bytes = shapeToBin(shape);
        if (bytes.length < 200e6) await idbDo('readwrite', st => st.put(bytes, key));
        pAdd('sichern', t0);
      } catch (_) { /* nur Beschleunigung */ }
    } catch (err) {
      importCache.set(key, { error: 'Datei konnte nicht gelesen werden' + (err instanceof Error && err.message ? ': ' + err.message : ' (Fehler im Geometriekern)') });
    }
    if (importCache.size > 30) importCache.delete(importCache.keys().next().value);
  }
  if (fehlen.length) throw new Error('NEED_DATA:' + [...new Set(fehlen)].join('|'));
}

const otFonts = new Map();
function textDrawing(t, pm, sk) {
  const a = pm.get(t.p);
  if (!a || !String(t.text || '').trim()) return null;
  // Text auf einer Kurve: jedes Zeichen einzeln, Mitte auf der Kurve, tangential gedreht
  const pc = t.path && sk ? [...(sk.curves || []), ...(sk.helpers || [])].find(c => c.id === t.path) : null;
  const font = otFonts.get(FONTS[t.font] ? t.font : 'sans');
  if (pc && font) {
    const lay = pathLayout(t, curvePolyline(pc, pm, 128), (ch, h) => font.getAdvanceWidth(ch, h));
    let out = null;
    (lay || []).forEach(g => {
      if (!g.ch.trim()) return;
      let d = R.drawText(g.ch, { fontSize: t.h || 5, fontFamily: FONTS[t.font] ? t.font : 'sans', startX: 0, startY: 0 });
      d = d.translate(-g.w / 2, 0).rotate(g.ang * 180 / Math.PI, [0, 0]).translate(g.p[0], g.p[1]);
      out = out ? out.fuse(d) : d;
    });
    if (out) return out;
  }
  let d = R.drawText(String(t.text), { fontSize: t.h || 5, fontFamily: FONTS[t.font] ? t.font : 'sans', startX: 0, startY: 0 });
  if (t.angle) d = d.rotate(t.angle * 180 / Math.PI, [0, 0]);
  return d.translate(a.x, a.y);
}

/* Profile, Rippen und dergleichen liegen in einer Skizze mit Ebene – eine 3D-Skizze (ohne Ebene)
   geht dafür noch nicht, sie ist nur für Pfade und Arbeitsebenen entlang eines Pfads da. */
const NO_PLANE = 'Eine Skizze ohne Ebene ist eine 3D-Skizze – als Profil bitte eine Skizze auf einer Ebene wählen';
const needPlane = sk => { if (!sk.plane) throw new Error(NO_PLANE); return sk.plane; };
function sketchDrawing(sk, refs) {
  sk = migrateSketch(sk);
  needPlane(sk);
  const { regions, openEnds } = sketchRegions(sk);
  const texts = (sk.texts || []);
  if (!regions.length && !texts.length) throw new Error(openEnds ? `${sk.name} hat kein geschlossenes Profil (offene Enden)` : `${sk.name} hat kein geschlossenes Profil`);
  const chosen = regions.length ? selectRegions(regions, refs) : [];
  if (regions.length && !chosen.length && !texts.length) throw new Error('Die gewählten Profile gibt es in der Skizze nicht mehr');
  let d = chosen.length ? chosen.map(regionDrawing).reduce((a, b) => a.fuse(b)) : null;
  // Text in einer gewählten Fläche wird ausgespart (Gravur), sonst als eigene Fläche genommen
  const pm = pointMap(sk);
  texts.forEach(t => {
    const td = textDrawing(t, pm, sk);
    if (!td) return;
    const bb = td.boundingBox.bounds, c = [(bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2];
    if (d && chosen.some(r => pointInRegion(r, c))) d = d.cut(td);
    else d = d ? d.fuse(td) : td;
  });
  if (!d) throw new Error(`${sk.name} hat kein geschlossenes Profil`);
  return d;
}

/* Seitenflächen eines Körpers neigen (OCC-Formschräge): dir = Zugrichtung, neutrale Ebene durch o, Winkel in Grad (positiv = nach innen) */
function draftSides(shape, dir, o, deg) {
  const oc = R.getOC();
  const dr = new oc.BRepOffsetAPI_DraftAngle(shape.wrapped);
  const D = new oc.gp_Dir(dir[0], dir[1], dir[2]);
  const P = new oc.gp_Pln(new oc.gp_Pnt(o[0], o[1], o[2]), D);
  let n = 0;
  for (const fc of shape.faces) {
    if (fc.geomType === 'PLANE' && Math.abs(dot(norm(fc.normalAt().toTuple()), dir)) > 0.999) continue;
    dr.Add(fc.wrapped, D, deg * Math.PI / 180, P, true);
    n++;
  }
  if (!n) return shape;
  dr.Build(new oc.Message_ProgressRange());
  if (!dr.IsDone()) throw new Error('Verjüngung nicht möglich (Winkel kleiner wählen)');
  return R.cast(dr.Shape());
}

/* ---------- dünne Wand ----------
   Die Berandungen der gewählten Profile werden zu einer Wand mit eigener Dicke:
   „Seite 1“ nach innen in das Material, „Mitte“ nach beiden Seiten, „Seite 2“ nach außen.
   Aus einem geschlossenen Profil wird ein Hohlkörper; der Rand bleibt überall gleich dick,
   auch an Ecken und Bögen (Gehrungsecken wie beim Umriss-Versetzen). */
function thinWall(sk, f, off, dist) {
  needPlane(sk);
  const t = Number(f.thickness);
  if (!(t > 0)) throw new Error('Wanddicke muss größer als 0 sein');
  sk = migrateSketch(sk);
  const { regions, openEnds, chains } = sketchRegions(sk);
  const chosen = selectRegions(regions, f.profiles);
  if (!chosen.length && !chains.length) throw new Error(regions.length ? 'Die gewählten Profile gibt es in der Skizze nicht mehr'
    : `${sk.name} hat ${openEnds ? 'kein geschlossenes Profil (offene Enden)' : 'kein geschlossenes Profil'}`);
  const oc = R.getOC(), pl = sk.plane, JOIN = oc.GeomAbs_JoinType.GeomAbs_Intersection;
  /* Skizzenkoordinaten in die Startebene (Profilebene + Startversatz) */
  const welt = q => add(add(add(pl.o, mul(pl.x, q[0])), mul(pl.y, q[1])), mul(pl.n, off));
  const pt = q => { const p = welt(q); return new oc.gp_Pnt(p[0], p[1], p[2]); };
  const addEdges = (mw, loop) => {
    if (loop.circle) {
      const c = loop.circle;
      mw.Add(new oc.BRepBuilderAPI_MakeEdge(new oc.gp_Circ(new oc.gp_Ax2(pt(c.c), new oc.gp_Dir(pl.n[0], pl.n[1], pl.n[2])), c.r)).Edge());
    } else for (const e of loop.edges) {
      if (e.type === 'line') mw.Add(new oc.BRepBuilderAPI_MakeEdge(pt(e.a), pt(e.b)).Edge());
      else if (e.type === 'arc') {
        /* Bogen über seinen Kreis bauen – die Drei-Punkt-Variante kennt der Kern nicht.
           Rückwärts gelaufene Bögen: nur die Achse umdrehen, Anfang und Ende bleiben so stehen. */
        const n = e.ccw ? pl.n : mul(pl.n, -1);
        mw.Add(new oc.BRepBuilderAPI_MakeEdge(new oc.gp_Circ(new oc.gp_Ax2(pt(e.c), new oc.gp_Dir(n[0], n[1], n[2])), e.r), pt(e.a), pt(e.b)).Edge());
      }
      else for (let i = 0; i + 1 < e.pts.length; i++) mw.Add(new oc.BRepBuilderAPI_MakeEdge(pt(e.pts[i]), pt(e.pts[i + 1])).Edge());
    }
  };
  const wireOf = loop => {
    const mw = new oc.BRepBuilderAPI_MakeWire();
    addEdges(mw, loop);
    if (!mw.IsDone()) throw new Error('Die Profilkontur lässt sich nicht schließen');
    return oc.TopoDS.Wire(mw.Wire());
  };
  const fl = new Map();
  const areaOf = w => {
    let a = fl.get(w);
    if (a === undefined) {
      try {
        const g = new oc.GProp_GProps();
        oc.BRepGProp.SurfaceProperties(new oc.BRepBuilderAPI_MakeFace(w, false).Face(), g, false, false);
        a = g.Mass();
        g.delete();
      } catch (_) { a = 0; }
      fl.set(w, a);
    }
    return a;
  };
  const tryOff = (w, d) => {
    try {
      const mk = new oc.BRepOffsetAPI_MakeOffset(w, JOIN, false);
      mk.Perform(d, 0);
      const o = mk.IsDone() ? oc.TopoDS.Wire(mk.Shape()) : null;
      mk.delete();
      return o;
    } catch (_) { return null; }
  };
  /* Berandung um d versetzen – die Fläche muss wachsen (grow) oder schrumpfen.
     Welche Seite „+“ ist, hängt von der Umlaufrichtung ab, also beide versucht. */
  const shift = (w, d, grow) => {
    if (!(d > 1e-9)) return w;
    const a0 = areaOf(w);
    for (const dd of [d, -d]) {
      const o = tryOff(w, dd);
      if (o && areaOf(o) > 1e-9 && (areaOf(o) > a0) === grow) return o;
    }
    throw new Error('Die Wand ist zu dick für die Kontur – Wanddicke kleiner wählen');
  };
  const faceOf = w => {
    const mf = new oc.BRepBuilderAPI_MakeFace(w, false);
    if (!mf.IsDone()) throw new Error('Die Wandfläche lässt sich nicht bauen');
    return mf.Face();
  };
  const prism = face => {
    const v = mul(pl.n, dist), mp = new oc.BRepPrimAPI_MakePrism(face, new oc.gp_Vec(v[0], v[1], v[2]), false, true);
    if (!mp.IsDone()) throw new Error('Die Wand lässt sich nicht extrudieren');
    return R.cast(mp.Shape());
  };
  /* delta > 0: die Berandung rückt vom Material weg, das Profil wird größer.
     Wand = großer Körper minus kleinerer Körper, deshalb immer außen vor innen.
     Löcher werden wie in `regionDrawing` durch Boolesche Operationen frei gelegt. */
  const wall = f.wall || 'side1';
  const dA = wall === 'side1' ? 0 : wall === 'side2' ? t : t / 2;
  const dB = wall === 'side1' ? -t : wall === 'side2' ? 0 : -t / 2;
  let tool = null;
  for (const r of chosen) {
    const base = { outer: wireOf(r.outer), holes: r.holes.map(h => wireOf(h)) };
    const set = delta => ({
      outer: shift(base.outer, Math.abs(delta), delta > 0),
      holes: base.holes.map(w => shift(w, Math.abs(delta), delta < 0))
    });
    const A = set(dA), B = set(dB);
    let w = bool(prism(faceOf(A.outer)), prism(faceOf(B.outer)), 'cut');
    // die inneren Löcher sind wieder Material, die äußeren bleiben frei
    B.holes.forEach(h => { const p = prism(faceOf(h)); w = w ? bool(w, p, 'join') : p; });
    A.holes.forEach(h => { w = bool(w, prism(faceOf(h)), 'cut'); });
    if (!w || (safeVolume(w) || 0) < 1e-9) throw new Error('Die Wand ist zu dick für die Kontur – Wanddicke kleiner wählen');
    tool = tool ? tool.fuse(w) : w;
  }
  /* Offene Linienzüge: ein Band entlang der Kette mit senkrechten Deckeln an den Enden.
     „Seite 1“ liegt links von der Zugrichtung, „Seite 2“ rechts, „Mitte“ beidseits.
     Die Zugrichtung kommt festgelegt aus der Skizze (Anfang = kleinere Koordinate). */
  const richung = e => {
    if (e.type === 'arc') { const s = e.ccw ? 1 : -1; return [-(e.a[1] - e.c[1]) * s, (e.a[0] - e.c[0]) * s]; }
    if (e.type === 'line') return [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const P = e.pts;
    return [P[1][0] - P[0][0], P[1][1] - P[0][1]];
  };
  const linksNormal = e => { const d = richung(e), L = Math.hypot(d[0], d[1]) || 1; return [-d[1] / L, d[0] / L]; };
  /* Weltkoordinaten zurück in Skizzenkoordinaten */
  const skizze = p => [dot(sub(p, pl.o), pl.x), dot(sub(p, pl.o), pl.y)];
  const endPunkte = e => [e.startPoint.toTuple(), e.endPoint.toTuple()];
  const entfernt = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  /* Auf welcher Seite der Kette liegt ein fertiger Versatz? Der Versatzanfang sitzt
     genau in Richtung der Randnormalen, deshalb reicht der Abstand zum Kettenanfang. */
  const seite = (es, kette) => {
    const n = linksNormal(kette.edges[0]), A = welt(kette.a);
    let best = null, bester = Infinity;
    es.forEach(e => endPunkte(e).forEach(q => { const d = entfernt(A, q); if (d < bester) { bester = d; best = q; } }));
    if (!best) return 0;
    const u = skizze(best);
    return Math.sign((u[0] - kette.a[0]) * n[0] + (u[1] - kette.a[1]) * n[1]);
  };
  /* Einseitiger Versatz einer offenen Kette. Das Vorzeichen, das der Kern dafür
     benutzt, hängt von den Kurven ab – also nachprüfen und gegebenenfalls umdrehen. */
  const versatzKanten = (w, kette, seiteGewuenscht, d) => {
    for (const dd of [d, -d]) {
      let es = null;
      try {
        const mk = new oc.BRepOffsetAPI_MakeOffset(w, JOIN, true);
        mk.Perform(dd, 0);
        if (mk.IsDone()) es = R.cast(mk.Shape()).edges || [];
        mk.delete();
      } catch (_) { es = null; }
      if (es && es.length && seite(es, kette) === seiteGewuenscht) return es;
    }
    // eine einzelne gerade Linie versetzt der Kern nicht – die Kante selbst bauen
    const e = kette.edges[0];
    if (kette.edges.length === 1 && e.type === 'line') {
      const n = linksNormal(e), s = seiteGewuenscht * d;
      const q = p => [p[0] + n[0] * s, p[1] + n[1] * s];
      return [R.makeLine(welt(q(e.a)), welt(q(e.b)))];
    }
    throw new Error('Die Wand ist zu dick für die Kontur – Wanddicke kleiner wählen');
  };
  /* Geschlossene Berandung des Bandes: Kette, Deckel, Versatz zurück, Deckel.
     Der Versatz liegt im Abstand d von der Kette, der erste Randabschnitt wird deshalb
     ohne Abstandsbedingung gesucht – nur die weiteren müssen aneinander stoßen. */
  const bandBerandung = (kette, es) => {
    const benutzt = es.map(() => false);
    const naechster = (cur, grenze) => {
      let bi = -1, an = null, abstand = Infinity;
      es.forEach((e, i) => {
        if (benutzt[i]) return;
        endPunkte(e).forEach(q => { const d = entfernt(cur, q); if (d < abstand) { abstand = d; bi = i; an = q; } });
      });
      if (bi < 0 || (grenze !== null && abstand > grenze)) return null;
      benutzt[bi] = true;
      const q = endPunkte(es[bi]);
      return { e: es[bi], an, weiter: entfernt(cur, q[0]) <= entfernt(cur, q[1]) ? q[1] : q[0] };
    };
    const pfad = [];
    const erster = naechster(welt(kette.a), null);
    if (!erster) throw new Error('Die Randlinien der Wand passen nicht zusammen');
    pfad.push(erster);
    let cur = erster.weiter;
    for (;;) {
      const weiter = naechster(cur, 1e-4);
      if (!weiter) break;
      pfad.push(weiter);
      cur = weiter.weiter;
    }
    const mw = new oc.BRepBuilderAPI_MakeWire();
    addEdges(mw, { edges: kette.edges });
    mw.Add(new oc.BRepBuilderAPI_MakeEdge(pt(kette.b), new oc.gp_Pnt(cur[0], cur[1], cur[2])).Edge());
    for (let i = pfad.length - 1; i >= 0; i--) mw.Add(pfad[i].e.wrapped);
    const anfang = pfad[0].an;
    mw.Add(new oc.BRepBuilderAPI_MakeEdge(new oc.gp_Pnt(anfang[0], anfang[1], anfang[2]), pt(kette.a)).Edge());
    if (!mw.IsDone()) throw new Error('Die Randlinien der Wand passen nicht zusammen');
    return oc.TopoDS.Wire(mw.Wire());
  };
  for (const kette of chains) {
    let schritt = 'Kette';
    try {
      schritt = 'Berandung'; const w = wireOf({ edges: kette.edges });
      const seiten = wall === 'middle' ? [1, -1] : [wall === 'side2' ? -1 : 1];
      const dicke = wall === 'middle' ? t / 2 : t;
      let stueck = null;
      for (const s of seiten) {
        schritt = 'Versatz'; const es = versatzKanten(w, kette, s, dicke);
        schritt = 'Band'; const band = bandBerandung(kette, es);
        schritt = 'Fläche'; const fl = faceOf(band);
        schritt = 'Prisma'; const p = prism(fl);
        stueck = stueck ? bool(stueck, p, 'join') : p;
      }
      if (!stueck || (safeVolume(stueck) || 0) < 1e-9) throw new Error('Die Wand ist zu dick für die Kontur – Wanddicke kleiner wählen');
      tool = tool ? tool.fuse(stueck) : stueck;
    } catch (err) {
      /* Eigene Meldungen behalten, sonst ist nur die Wanddicke ein zureichbarer Grund. */
      if (err instanceof Error && /^Die (Wand|Randlinien|Profilkontur|Wandfläche)/.test(err.message)) throw err;
      throw new Error('Die Wand lässt sich entlang des Linienzugs nicht bauen (' + schritt + ') – Wanddicke kleiner wählen');
    }
  }
  return tool;
}

/* ---------- Sweeping und Ausformung ---------- */
/* Gewählte Profile einer Skizze als Flächenbereiche */
function chosenRegions(sk, refs) {
  needPlane(sk);
  const { regions } = sketchRegions(migrateSketch(sk));
  if (!regions.length) throw new Error(`${sk.name} hat kein geschlossenes Profil`);
  const chosen = selectRegions(regions, refs);
  if (!chosen.length) throw new Error('Die gewählten Profile gibt es in der Skizze nicht mehr');
  return chosen;
}
const loopWire = (loop, pl) => loopDrawing(loop).sketchOnPlane(makePlane(pl)).wire;
/* Pfad aus den (nicht Konstruktions-)Kurven einer Skizze, als zusammenhängende Kette geordnet */
function pathWire(sk) {
  sk = migrateSketch(sk);
  const curves = sk.curves.filter(c => !c.cons && !c.ref);
  if (!curves.length) throw new Error(`${sk.name} hat keine Kurven für den Pfad`);
  if (!sk.plane) return pathWire3(sk, curves);
  const pl = sk.plane, pm = pointMap(sk);
  const W = id => { const p = pm.get(id); return toWorld(pl, p.x, p.y); };
  const circ = curves.find(c => c.type === 'circle');
  if (circ) {
    if (curves.length > 1) throw new Error('Ein Kreis als Pfad muss allein in der Skizze stehen');
    return R.assembleWire([R.makeCircle(circ.r, W(circ.c), pl.n)]);
  }
  if (curves.some(c => c.type === 'ellipse')) throw new Error('Eine Ellipse als Pfad geht noch nicht');
  const ends = c => c.type === 'line' ? [c.p1, c.p2] : c.type === 'spline' ? [c.pts[0], c.pts[c.pts.length - 1]] : [c.s, c.e];
  const deg = new Map();
  curves.forEach(c => ends(c).forEach(id => deg.set(id, (deg.get(id) || 0) + 1)));
  if ([...deg.values()].some(v => v > 2)) throw new Error('Der Pfad verzweigt sich');
  let start = [...deg.entries()].find(([, v]) => v === 1);
  start = start ? start[0] : ends(curves[0])[0];
  const left = curves.slice(), edges = [];
  let at = start;
  while (left.length) {
    const i = left.findIndex(c => ends(c).includes(at));
    if (i < 0) break;
    const c = left.splice(i, 1)[0];
    const [a, b] = ends(c), next = a === at ? b : a;
    if (c.type === 'line') edges.push(R.makeLine(W(at), W(next)));
    else if (c.type === 'spline') {
      let q = curveSamples(c, pm, 128).map(([u, v]) => toWorld(pl, u, v));
      if (a !== at) q = q.reverse();
      edges.push(R.makeBSplineApproximation(q, { tolerance: 1e-4, smoothing: null, degMax: 3 }));
    } else {
      const cp = pm.get(c.c), m = (c.a0 + c.a1) / 2;
      const mid = toWorld(pl, cp.x + Math.cos(m) * c.r, cp.y + Math.sin(m) * c.r);
      edges.push(R.makeThreePointArc(W(at), mid, W(next)));
    }
    at = next;
  }
  if (left.length) throw new Error('Der Pfad ist nicht zusammenhängend');
  return R.assembleWire(edges);
}
/* Pfad aus einer 3D-Skizze: die Punkte sind Weltkoordinaten, es gibt keine Ebene.
   Aneinandergereiht werden Linien, Bögen und Kreise durch drei Punkte und Splines. */
function pathWire3(sk, curves) {
  const pm = pointMap(sk);
  const W = id => pt3(pm.get(id));
  const chain = chainCurves(curves, curveEnds3);
  if (chain.error) throw new Error(chain.error);
  const edges = [];
  for (const { c, flip } of chain.order) {
    if (c.type === 'line') edges.push(R.makeLine(W(c.p1), W(c.p2)));
    else if (c.type === 'circle3') {
      const g = circum3(W(c.p1), W(c.p2), W(c.p3));
      if (!g) throw new Error('Ein Kreis braucht drei verschiedene Punkte');
      edges.push(R.makeCircle(g.r, g.m, g.n));
    } else if (c.type === 'arc3') {
      const A = W(c.p1), B = W(c.p2), C = W(c.p3);
      if (!circum3(A, B, C)) throw new Error('Die drei Punkte des Bogens liegen auf einer Geraden');
      edges.push(R.makeThreePointArc(flip ? C : A, B, flip ? A : C));
    } else if (c.type === 'spline') {
      let q = curvePoints3(sk, c, pm, 200);
      if (flip) q = q.reverse();
      edges.push(R.makeBSplineApproximation(q, { tolerance: 1e-4, smoothing: null, degMax: 3 }));
    } else throw new Error(`${c.type} geht als räumlicher Pfad noch nicht`);
  }
  return R.assembleWire(edges);
}
/* Normale der Ebene, in der ein Pfad liegt: bei einer ebenen Skizze ihre Normale, bei einer
   räumlichen aus den Pfadpunkten – ein räumlicher Pfad muss dafür eben sein. */
function pathPlaneNormal(ps, S) {
  if (ps.plane) return norm(ps.plane.n);
  const pts = [];
  for (let k = 0; k <= 64; k++) pts.push(S.at(S.length * k / 64).p);
  const fp = planeFromPoints(pts);
  if (!fp) throw new Error('Der räumliche Pfad liegt nicht in einer Ebene – das geht nur mit einem ebenen räumlichen Pfad');
  return fp.n;
}
/* ---------- Schweißnaht (Kehlnaht) ----------
   An der gewählten Kante wird ringsum geprüft, wo Material ist (alle Körper, also auch getrennte Rahmenstäbe).
   Die freie Ecke mit weniger als 180° ist die Innenecke; dort sitzt die Naht als Dreieck mit Nahtdicke a. */
let weldMeta = [];
function weldWedge(bodies, P, d, flush = false) {
  const u = norm(Math.abs(d[2]) < 0.9 ? cross(d, [0, 0, 1]) : cross(d, [1, 0, 0])), w = cross(d, u);
  const eps = 0.05, M = 36;
  const dirAt = a => add(mul(u, Math.cos(a)), mul(w, Math.sin(a)));
  const sols = bodies.sols || solidsOf(bodies);
  const solid = a => insideAny(sols, add(P, mul(dirAt(a), eps)));
  const st = [];
  for (let i = 0; i < M; i++) st.push(solid(i * 2 * Math.PI / M));
  if (st.every(x => x) || st.every(x => !x)) return null;
  // freie Bereiche als Winkelintervalle (über 0 hinweg verbunden)
  const start = st.findIndex((x, i) => x && !st[(i + 1) % M]);
  const gaps = [];
  for (let k = 0; k < M; k++) {
    const i = (start + 1 + k) % M;
    if (!st[i] && st[(i - 1 + M) % M]) {
      let j = i; while (!st[(j + 1) % M]) j = (j + 1) % M;
      gaps.push([i, j]);
    }
  }
  // Grenzen genau suchen (Halbierung zwischen Material und frei)
  const refine = (aSolid, aFree) => { for (let k = 0; k < 14; k++) { const m = (aSolid + aFree) / 2; if (solid(m)) aSolid = m; else aFree = m; } return (aSolid + aFree) / 2; };
  const step = 2 * Math.PI / M;
  let best = null;
  for (const [i, j] of gaps) {
    const a0 = refine((i - 1) * step, i * step);
    let a1 = refine((j + 1) * step, j * step);
    while (a1 < a0) a1 += 2 * Math.PI;
    const span = a1 - a0;
    if (flush) { if (Math.abs(span - Math.PI) < 0.12 && (!best || Math.abs(span - Math.PI) < Math.abs(best.span - Math.PI))) best = { v1: dirAt(a0), v2: dirAt(a1), n: dirAt((a0 + a1) / 2), span }; continue; }
    if (span < Math.PI - 0.05 && span > 0.2 && (!best || span < best.span)) best = { v1: dirAt(a0), v2: dirAt(a1), span };
  }
  return best;
}
function weldTool(f, bodies) {
  const a = Number(f.a);
  if (!(a > 0)) throw new Error('Nahtdicke a muss größer als 0 sein');
  if (!(f.edges && f.edges.length)) throw new Error('Kanten an den Innenecken wählen');
  const kind = ['i', 'v', 'hv'].includes(f.kind) ? f.kind : 'fillet', flush = kind !== 'fillet';
  const beads = [], seams = [], grooves = [];
  let total = 0, miss = 0;
  const probeB = Object.assign(bodies.slice(), { sols: solidsOf(bodies) });
  const wcache = new Map();
  const wedgeOf = e => {
    const m = e.pointAt(0.5).toTuple(), k = m.map(v => Math.round(v * 1e4)).join(',');
    if (!wcache.has(k)) { let r = null; try { r = weldWedge(probeB, m, norm(e.tangentAt(0.5).toTuple()), flush); } catch (_) { r = null; } wcache.set(k, r); }
    return wcache.get(k);
  };
  // Liste der Nahtkanten; „ringsum“: ganze Kontur (Drahtschleife) der Fläche, in der die Kante liegt
  const mid = e => e.pointAt(0.5).toTuple();
  const list = [], seen = [], owner = [];
  let loops = 0, cur = null;
  const addEdge = e => { const m = mid(e); if (seen.some(q => len(sub(q, m)) < 1e-6)) return; seen.push(m); list.push(e); owner.push(cur); };
  f.edges.forEach(ref => {
    const hit = findSel(bodies, 'edge', ref);
    if (!hit) { miss++; return; }
    cur = hit.body;
    if (!f.allAround) { addEdge(hit.shape); return; }
    const m0 = mid(hit.shape);
    let best = null;
    for (const fc of hit.body.shape.faces) {
      let ws = [];
      try { ws = fc.wires; } catch (_) { ws = []; }
      for (const w of ws) {
        const es = w.edges;
        if (!es.some(e => len(sub(mid(e), m0)) < 1e-6)) continue;
        const good = es.filter(e => !!wedgeOf(e));
        if (good.length < 2) continue;
        // kleinste Kontur nehmen (Querschnitt am Stoß, nicht die lange Seitenfläche des Stabs)
        const pts = es.flatMap(e => [e.startPoint.toTuple(), e.endPoint.toTuple(), mid(e)]);
        const size = len(sub(pts.reduce((a, q) => a.map((v, i) => Math.max(v, q[i])), [-1e9, -1e9, -1e9]), pts.reduce((a, q) => a.map((v, i) => Math.min(v, q[i])), [1e9, 1e9, 1e9])));
        if (!best || size < best.size - 1e-6 || (Math.abs(size - best.size) <= 1e-6 && good.length > best.es.length)) best = { es: good, size };
      }
    }
    // ringsum: alle Kanten der Kontur, an denen eine Innenecke ist (bündige Seiten bleiben frei)
    if (best) { const before = list.length; best.es.forEach(addEdge); if (list.length > before) loops++; } else addEdge(hit.shape);
  });
  // Stumpfnaht-Querschnitt (x quer zur Naht auf der Oberfläche, y aus dem Material heraus): Fuge + Nahtüberhöhung
  const hCap = Math.min(1.5, 0.1 * a + 0.5);
  // Nahtvorbereitung nach ISO 9692-1: Spalt b an der Wurzel, Steg c (nicht angefaster Teil der Tiefe s)
  const gap = Math.max(0, Number(f.gap) || 0), root = Math.max(0, Math.min(a, Number(f.root) || 0));
  if (flush && kind !== 'i' && root >= a - 1e-9) throw new Error('Der Steg c muss kleiner als die Nahttiefe s sein');
  // Punktzug ohne doppelte und ohne Punkte auf einer Geraden
  const clean = pts => {
    let out = pts.filter((q, i) => { const p = pts[(i - 1 + pts.length) % pts.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9; });
    out = out.filter((q, i) => { const p = out[(i - 1 + out.length) % out.length], r = out[(i + 1) % out.length]; return Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) > 1e-12; });
    return out.length >= 3 ? out : null;
  };
  const flushProfile = (sg) => {
    const hb = gap / 2;
    if (kind === 'i') {
      const w = Math.max(1 + a / 4, hb + 1);
      if (hb < 1e-9) return { bead: [[-w, 0], [w, 0], [0.6 * w, hCap], [-0.6 * w, hCap]], groove: null };
      return { bead: clean([[-hb, -a], [hb, -a], [hb, 0], [w, 0], [0.6 * w, hCap], [-0.6 * w, hCap], [-w, 0], [-hb, 0]]), groove: clean([[-hb, -a], [hb, -a], [hb, 0], [-hb, 0]]) };
    }
    // Fase über die Tiefe s − c: V 30° je Seite, HV 45° nur auf der Seite sg
    const fz = a - root, w = kind === 'v' ? fz * Math.tan(Math.PI / 6) : fz;
    const R0 = kind === 'v' || sg > 0 ? hb + w : hb, L0 = kind === 'v' || sg < 0 ? -hb - w : -hb;
    const groove = [[-hb, -a], [hb, -a], [hb, -fz], [R0, 0], [L0, 0], [-hb, -fz]];
    const bead = [[-hb, -a], [hb, -a], [hb, -fz], [R0, 0], [R0 + 1, 0], [R0 + 0.6, hCap], [L0 - 0.6, hCap], [L0 - 1, 0], [L0, 0], [-hb, -fz]];
    return { bead: clean(bead), groove: clean(groove) };
  };
  list.forEach((e, ei) => {
    const straight = e.geomType === 'LINE';
    const P = e.pointAt(0.5).toTuple(), d = norm(e.tangentAt(0.5).toTuple());
    const wg = wedgeOf(e);
    if (!wg) { miss++; return; }
    if (flush) {
      // Querrichtung auf der Oberfläche; HV: Fase am angeklickten Teil
      const nn = wg.n, sx = norm(sub(wg.v1, mul(nn, dot(wg.v1, nn))));
      let sg = 1;
      if (kind === 'hv' && owner[ei]) { try { sg = insideAny(solidsOf([owner[ei]]), add(add(P, mul(sx, 0.3)), mul(nn, -0.3))) ? 1 : -1; } catch (_) { sg = 1; } }
      if (f.flip) sg = -sg;
      const pr = flushProfile(sg);
      const at = (Q, q) => add(add(Q, mul(sx, q[0])), mul(nn, q[1]));
      let L = 0;
      if (straight) L = len(sub(e.endPoint.toTuple(), e.startPoint.toTuple()));
      else { let q = e.pointAt(0).toTuple(); for (let i = 1; i <= 96; i++) { const r = e.pointAt(i / 96).toTuple(); L += len(sub(r, q)); q = r; } }
      const make = poly => {
        if (straight) { const p0 = e.startPoint.toTuple(), p1 = e.endPoint.toTuple(); return R.basicFaceExtrusion(R.makePolygon(poly.map(q => at(p0, q))), new R.Vector(sub(p1, p0))); }
        if (e.geomType !== 'CIRCLE') throw new Error('Kurve');
        const q0 = e.pointAt(0).toTuple(), q1 = e.pointAt(0.25).toTuple(), q2 = e.pointAt(0.5).toTuple();
        const ab = sub(q1, q0), ac = sub(q2, q0), nc = cross(ab, ac), n2 = dot(nc, nc);
        if (n2 < 1e-18) throw new Error('Kreis');
        const c = add(q0, mul(add(mul(cross(nc, ab), dot(ac, ac)), mul(cross(ac, nc), dot(ab, ab))), 1 / (2 * n2)));
        const ang = L / len(sub(q0, c)), ax = norm(nc);
        return R.revolution(R.makePolygon(poly.map(q => at(P, q))).rotate(-ang / 2 * 180 / Math.PI, c, ax), c, ax, ang * 180 / Math.PI);
      };
      try {
        beads.push(make(pr.bead));
        if (pr.groove) grooves.push(make(pr.groove));
      } catch (_) { miss++; return; }
      total += L;
      seams.push({ p: P.map(v => Math.round(v * 1e4) / 1e4), L: Math.round(L * 100) / 100, d: d.map(v => Math.round(v * 1e6) / 1e6) });
      return;
    }
    const z = a / Math.cos(wg.span / 2);
    let L = 0;
    if (straight) L = len(sub(e.endPoint.toTuple(), e.startPoint.toTuple()));
    else { let q = e.pointAt(0).toTuple(); for (let i = 1; i <= 96; i++) { const r = e.pointAt(i / 96).toTuple(); L += len(sub(r, q)); q = r; } }
    const triAt = (Q, w) => R.makePolygon([Q, add(Q, mul(w.v1, z)), add(Q, mul(w.v2, z))]);
    let bead;
    try {
      if (straight) {
        const p0 = e.startPoint.toTuple(), p1 = e.endPoint.toTuple();
        bead = R.basicFaceExtrusion(triAt(p0, wg), new R.Vector(sub(p1, p0)));
      } else if (e.geomType === 'CIRCLE') {
        // Bogen/Kreis: Nahtquerschnitt in der Mitte bilden, an den Anfang zurückdrehen und um die Kreisachse drehen
        const q0 = e.pointAt(0).toTuple(), q1 = e.pointAt(0.25).toTuple(), q2 = e.pointAt(0.5).toTuple();
        const ab = sub(q1, q0), ac = sub(q2, q0), nn = cross(ab, ac), n2 = dot(nn, nn);
        if (n2 < 1e-18) throw new Error('Kreis');
        const c = add(q0, mul(add(mul(cross(nn, ab), dot(ac, ac)), mul(cross(ac, nn), dot(ab, ab))), 1 / (2 * n2)));
        const rad = len(sub(q0, c));
        const ax = norm(nn);                          // Umlaufsinn Anfang → Mitte
        const ang = L / rad;                          // Gesamtwinkel
        const tri = triAt(P, wg).rotate(-ang / 2 * 180 / Math.PI, c, ax);
        bead = R.revolution(tri, c, ax, ang * 180 / Math.PI);
      } else {
        const P0 = e.pointAt(0).toTuple(), d0 = norm(e.tangentAt(0).toTuple());
        const w0 = weldWedge(probeB, add(P0, mul(d0, 1e-3)), d0);
        if (!w0) throw new Error('Anfang');
        const A = P0, B = add(P0, mul(w0.v1, z)), C = add(P0, mul(w0.v2, z));
        bead = R.genericSweep(R.assembleWire([R.makeLine(A, B), R.makeLine(B, C), R.makeLine(C, A)]), R.assembleWire([e]), { frenet: true });
      }
    } catch (_) { miss++; return; }
    total += L;
    seams.push({ p: P.map(v => Math.round(v * 1e4) / 1e4), L: Math.round(L * 100) / 100, d: d.map(v => Math.round(v * 1e6) / 1e6) });
    beads.push(bead);
  });
  if (!beads.length) throw new Error(flush ? 'An den gewählten Kanten gibt es keinen bündigen Stoß (Flächen in einer Ebene)' : 'An den gewählten Kanten gibt es keine Innenecke für eine Kehlnaht');
  let tool = beads[0];
  for (let i = 1; i < beads.length; i++) { try { tool = tool.fuse(beads[i]); } catch (_) { tool = R.makeCompound([tool, beads[i]]); } }
  return { tool, grooves, info: { count: beads.length, length: total, miss, seams, loops, kind } };
}
/* ---------- Knotenblech (Stahlbau): Dreiecksblech in der Innenecke an der gewählten Kante, mittig auf der Kante ----------
   Schenkel `size` entlang der beiden Flächen, Dicke `thickness` quer, innere Ecke um `chamfer` abgeschrägt (Platz für die Naht). */
function gussetTool(f, bodies) {
  const sz = Number(f.size), t = Number(f.thickness), c = Math.max(0, Number(f.chamfer) || 0);
  if (!(sz > 0) || !(t > 0)) throw new Error('Größe und Dicke müssen größer als 0 sein');
  if (c >= sz * 0.9) throw new Error('Die Fase ist zu groß für das Blech');
  if (!(f.edges && f.edges.length)) throw new Error('Kanten an den Innenecken wählen');
  // Schweißnähte zählen nicht als Material (das Blech sitzt über der Naht, die Eckfase gibt ihr Platz)
  const weldIds = new Set(weldMeta.map(w => w.id));
  const solidBodies = bodies.filter(b => !weldIds.has(b.id));
  const probeB = Object.assign(solidBodies.slice(), { sols: solidsOf(solidBodies) });
  const plates = [];
  let miss = 0;
  f.edges.forEach(ref => {
    const hit = findSel(bodies, 'edge', ref);
    if (!hit) { miss++; return; }
    const e = hit.shape, P = e.pointAt(0.5).toTuple(), d = norm(e.tangentAt(0.5).toTuple());
    const wg = weldWedge(probeB, P, d);
    if (!wg) { miss++; return; }
    const pts = c > 1e-6 ? [add(P, mul(wg.v1, c)), add(P, mul(wg.v1, sz)), add(P, mul(wg.v2, sz)), add(P, mul(wg.v2, c))] : [P, add(P, mul(wg.v1, sz)), add(P, mul(wg.v2, sz))];
    const shift = mul(d, -t / 2);
    const face = R.makePolygon(pts.map(q => add(q, shift)));
    plates.push(R.basicFaceExtrusion(face, new R.Vector(mul(d, t))));
  });
  if (!plates.length) throw new Error('An den gewählten Kanten gibt es keine Innenecke für ein Knotenblech');
  return { plates, miss };
}
/* ---------- Endkappe (Stahlbau): Platte auf der Stirnfläche eines Stabs, Umriss der Außenkontur, Dicke nach außen ---------- */
function endcapTool(f, bodies) {
  const t = Number(f.thickness), ov = Math.max(0, Number(f.overhang) || 0);
  if (!(t > 0)) throw new Error('Dicke muss größer als 0 sein');
  if (!(f.faces && f.faces.length)) throw new Error('Stirnflächen der Stäbe wählen');
  const caps = [];
  let miss = 0;
  f.faces.forEach(ref => {
    const hit = findSel(bodies, 'face', ref);
    if (!hit || hit.shape.geomType !== 'PLANE') { miss++; return; }
    const fc = hit.shape;
    let n = fc.normalAt().toTuple();
    // Normale nach außen: Probepunkt knapp vor der Fläche darf nicht im Körper liegen
    const ctr = fc.center.toTuple();
    if (insideAny(solidsOf([hit.body]), add(ctr, mul(n, 0.05)))) n = mul(n, -1);
    // Außenkontur = Drahtschleife mit der größten Ausdehnung; Kappe = Hüllrechteck dieser Kontur in der Flächenebene (+ Überstand)
    let ws = [];
    try { ws = fc.wires; } catch (_) { ws = []; }
    if (!ws.length) { miss++; return; }
    const ux = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0])), uy = cross(n, ux);
    let best = null;
    ws.forEach(w => {
      const q = [];
      w.edges.forEach(e => { for (let i = 0; i <= 8; i++) q.push(e.pointAt(i / 8).toTuple()); });
      const us = q.map(p => dot(sub(p, ctr), ux)), vs = q.map(p => dot(sub(p, ctr), uy));
      const box = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
      const ext = (box[1] - box[0]) * (box[3] - box[2]);
      if (!best || ext > best.ext) best = { box, ext, w };
    });
    let cap;
    if (f.shape === 'contour' && ov < 1e-6) {
      // genau die Außenkontur (z. B. Rundrohr), ohne Überstand
      cap = R.basicFaceExtrusion(R.makeFace(best.w), new R.Vector(mul(n, t)));
    } else {
      const [u0, u1, v0, v1] = best.box, P = (u, v) => add(ctr, add(mul(ux, u), mul(uy, v)));
      const face = R.makePolygon([P(u0 - ov, v0 - ov), P(u1 + ov, v0 - ov), P(u1 + ov, v1 + ov), P(u0 - ov, v1 + ov)]);
      cap = R.basicFaceExtrusion(face, new R.Vector(mul(n, t)));
    }
    caps.push(cap);
  });
  if (!caps.length) throw new Error('Keine ebene Stirnfläche gefunden');
  return { caps, miss };
}
let partMeta = [];
let partSink = null; // Teilinfos (Normteile, Bleche) beim Bau eingefügter/abgeleiteter Dokumente
/* Pfad gleichmäßig nach Bogenlänge abtasten: at(s) → Punkt p und Tangente t */
function pathSampler(wire) {
  const pts = [];
  let last = null;
  wire.edges.forEach(e => {
    const m = 256, q = [];
    for (let i = 0; i <= m; i++) q.push(e.pointAt(i / m).toTuple());
    if (last && len(sub(q[0], last)) > len(sub(q[m], last))) q.reverse();
    (pts.length ? q.slice(1) : q).forEach(p => pts.push(p));
    last = pts[pts.length - 1];
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = cum[cum.length - 1], closed = len(sub(pts[0], pts[pts.length - 1])) < 1e-6;
  const tan = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; return norm(sub(b, a)); };
  const at = sv => {
    if (closed) sv = ((sv % L) + L) % L;
    sv = Math.max(0, Math.min(L, sv));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= sv) lo = mid; else hi = mid; }
    const u = cum[hi] > cum[lo] ? (sv - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    const p = add(pts[lo], mul(sub(pts[hi], pts[lo]), u));
    // Tangente: Richtung des aktuellen Abschnitts (an Ecken ohne Mittelung)
    const t = len(sub(pts[hi], pts[lo])) > 1e-12 ? norm(sub(pts[hi], pts[lo])) : tan(lo);
    return { p, t };
  };
  return { length: L, closed, at };
}
/* Volumenkörper entlang Pfad (Sweeping mit Körper, z. B. Fräser): OpenCASCADE kann keinen Körper ziehen.
   Exakt gebaut werden die beiden Werkzeugformen aus der Praxis – der Körper wandert so, dass sein Bezugspunkt (Kugelmitte
   bzw. Zylinder-Bodenmitte) auf dem nächstgelegenen Pfadende beginnt:
   – Kugel: Rohr mit Kreisquerschnitt und runden Ecken + Kugel an beiden Enden (V = π r² L + 4/3 π r³)
   – Zylinder, Achse senkrecht zur Pfadebene: Rechteck 2r × h entlang des Pfads (Binormale = Achse, runde Ecken) +
     Zylinder an beiden Enden (V = h · (2 r L + π r²)). Andere Körper: Meldung. */
function solidSweepTool(f, bodies, solved, byId) {
  const tb = bodies.find(b => b.id === f.toolBody);
  if (!tb) throw new Error('Den Werkzeugkörper gibt es nicht mehr');
  const ps = solved.get(f.path) || byId[f.path];
  if (!ps || ps.type !== 'sketch') throw new Error('Die Pfad-Skizze fehlt');
  const S = pathSampler(pathWire(JSON.parse(JSON.stringify(ps))));
  if (S.closed) throw new Error('Mit einem Körper geht nur ein offener Pfad');
  const fcs = tb.shape.faces, types = fcs.map(x => x.geomType);
  const p0 = S.at(0).p, p1 = S.at(S.length).p;
  const pick = ref => { const back = len(sub(p1, ref)) < len(sub(p0, ref)); return { start: back ? p1 : p0, end: back ? p0 : p1, t0: back ? mul(S.at(S.length).t, -1) : S.at(0).t }; };
  /* je Pfadkante ein eigener Zug ohne Ecke, an jedem Eckpunkt das Werkzeug selbst – zusammen genau die Minkowski-Summe
     (eine durchgehende Bahn mit runden Ecken überschneidet sich innen selbst, OpenCASCADE zählt das dort verkehrt) */
  const pieces = (T, mkProf, mkAt, cfg) => {
    const es = pathWire(JSON.parse(JSON.stringify(ps))).edges;
    let out = null;
    const addS = x => { out = out ? out.fuse(x) : x; };
    const verts = [];
    es.forEach(e => {
      const a = add(e.startPoint.toTuple(), T), b = add(e.endPoint.toTuple(), T), t = norm(e.tangentAt(0).toTuple());
      addS(R.genericSweep(mkProf(a, t), R.assembleWire([e.translate(...T)]), cfg));
      [a, b].forEach(q => { if (!verts.some(v => len(sub(v, q)) < 1e-6)) verts.push(q); });
    });
    verts.forEach(q => addS(mkAt(q)));
    return out;
  };
  if (types.length === 1 && types[0] === 'SPHERE') {
    const bb = bbOf(tb.shape), C = mul(add(bb[0], bb[1]), 0.5), r = (bb[1][0] - bb[0][0]) / 2;
    const { start } = pick(C), T = sub(C, start);
    const tool = pieces(T, (a, t) => R.assembleWire([R.makeCircle(r, a, t)]), q => R.makeSphere(r).translate(...q), { frenet: true });
    return { tool, kind: `Kugel ⌀${+(2 * r).toFixed(3)}` };
  }
  const cyl = fcs.filter(x => x.geomType === 'CYLINDRE');
  if (fcs.length === 3 && cyl.length === 1 && types.filter(t => t === 'PLANE').length === 2) {
    const info = cylinderInfo(cyl[0]), a = info.a, r = info.r, h = info.L;
    if (Math.abs(Math.abs(dot(pathPlaneNormal(ps, S), a)) - 1) > 1e-6) throw new Error('Die Zylinderachse muss senkrecht auf der Pfadebene stehen');
    const B = info.o, { start } = pick(B), T = sub(B, start), oc = R.getOC();
    const rect = (q, t) => { const w = norm(cross(a, t)), Pp = [add(q, mul(w, -r)), add(q, mul(w, r)), add(add(q, mul(w, r)), mul(a, h)), add(add(q, mul(w, -r)), mul(a, h))]; return R.assembleWire(Pp.map((x, i) => R.makeLine(x, Pp[(i + 1) % 4]))); };
    const tool = pieces(T, rect, q => R.makeCylinder(r, h, q, a), { support: new oc.gp_Dir(...a) });
    return { tool, kind: `Zylinder ⌀${+(2 * r).toFixed(3)} × ${+h.toFixed(3)}` };
  }
  throw new Error('Als Werkzeugkörper gehen eine Kugel oder ein Zylinder (Achse senkrecht zur Pfadebene)');
}
function sweepTool(f, solved, byId) {
  const sk = solved.get(f.sketch) || byId[f.sketch];
  const ps = solved.get(f.path) || byId[f.path];
  if (!sk || sk.type !== 'sketch') throw new Error('Die Profil-Skizze fehlt');
  if (!ps || ps.type !== 'sketch') throw new Error('Die Pfad-Skizze fehlt');
  if (ps.id === sk.id) throw new Error('Profil und Pfad müssen in verschiedenen Skizzen liegen');
  /* Teilstrecke und Verdrehwinkel (distanceOne, twistAngle). Anfang ist das Pfadende auf der
     Profilebene. Verdreht wird über eine Hilfsleitlinie (auxiliarySpine) im Abstand 1 um den Pfad:
     P(s) + cos φ·N + sin φ·B mit φ = Winkel · s / gezogene Länge, B = Normale der Pfadebene, N = B × Tangente.
     Die Teilstrecke wird nach dem Ziehen senkrecht zur Pfadtangente abgeschnitten (wie die Endfläche). */
  const twist = (Number(f.twist) || 0) * Math.PI / 180;
  /* Ausrichtung: senkrecht (Vorgabe, das Profil dreht mit der Pfadtangente) oder parallel (das Profil
     behält seine Lage und wird nur verschoben – fester Bezugsrahmen, MakePipeShell.SetMode(gp_Ax2)) */
  const parallel = f.orient === 'parallel';
  if (parallel && Math.abs(twist) > 1e-9) throw new Error('Verdrehwinkel geht nur bei Ausrichtung senkrecht');
  /* Führungsschiene (guideRail): die Schiene ist die Hilfsleitlinie – das Profil dreht sich so, dass seine
     Lage zur Schiene erhalten bleibt. Skalieren (profileScaling „Skalieren“): Faktor = Abstand Pfad–Schiene in der
     Normalebene des Pfads / Abstand am Profil, als interpoliertes Gesetz (Law_Interpol über die Bogenlänge). */
  const rs = f.rail ? solved.get(f.rail) || byId[f.rail] : null;
  if (f.rail && (!rs || rs.type !== 'sketch')) throw new Error('Die Skizze der Führungsschiene fehlt');
  if (rs && (rs.id === ps.id || rs.id === sk.id)) throw new Error('Die Führungsschiene braucht eine eigene Skizze');
  if (rs && (parallel || Math.abs(twist) > 1e-9)) throw new Error('Mit Führungsschiene gehen weder Verdrehwinkel noch Ausrichtung parallel');
  const railW = () => pathWire(JSON.parse(JSON.stringify(rs)));
  const frac = f.pathFrac != null && f.pathFrac !== '' ? Math.max(1, Math.min(100, Number(f.pathFrac) || 100)) / 100 : 1;
  const S = pathSampler(pathWire(JSON.parse(JSON.stringify(ps))));
  const pl = needPlane(sk), pn = norm(pl.n), sd = q => dot(sub(q, pl.o), pn), onPl = q => Math.abs(sd(q));
  /* Profil mitten auf einem offenen Pfad (Pfad auf beiden Seiten des Profils): OpenCASCADE zieht dann
     von selbst in beide Richtungen. Seite 1 läuft in Richtung der Profilnormale, Seite 2 dagegen (wie distanceTwo);
     die Teilstrecken zählen je Seite ab dem Profil. sP = Bogenlänge, an der der Pfad die Profilebene kreuzt (bei
     mehreren Kreuzungen die nächste zum Profil). */
  let sP = null;
  if (!S.closed && onPl(S.at(0).p) > 1e-6 && onPl(S.at(S.length).p) > 1e-6) {
    const ring = chosenRegions(sk, f.profiles).flatMap(r => profileRing(r.outer, pl, 8));
    const cen = ring.length ? mul(ring.reduce((a, q) => add(a, q), [0, 0, 0]), 1 / ring.length) : pl.o;
    const N = 400; let best = Infinity;
    for (let k = 0; k < N; k++) {
      let a = S.length * k / N, b = S.length * (k + 1) / N, fa = sd(S.at(a).p);
      if (fa * sd(S.at(b).p) > 0) continue;
      for (let it = 0; it < 60; it++) { const m = (a + b) / 2, fm = sd(S.at(m).p); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
      const s = (a + b) / 2, dd = len(sub(S.at(s).p, cen));
      if (dd < best) { best = dd; sP = s; }
    }
  }
  const mid = sP != null, sg = mid && dot(S.at(sP).t, pn) < 0 ? -1 : 1;
  const L1 = mid ? (sg > 0 ? S.length - sP : sP) : S.length, L2 = mid ? S.length - L1 : 0;
  const frac2 = f.pathFrac2 != null && f.pathFrac2 !== '' ? Math.max(1, Math.min(100, Number(f.pathFrac2) || 100)) / 100 : 1;
  const fromEnd = !mid && !S.closed && onPl(S.at(S.length).p) < onPl(S.at(0).p);
  const at = s => { const r = S.at(fromEnd ? S.length - s : s); return fromEnd ? { p: r.p, t: mul(r.t, -1) } : r; };
  const Ls = mid ? L1 * frac + L2 * frac2 : S.length * frac;
  const pathNormal = () => pathPlaneNormal(ps, S);
  const aux = () => {
    const B = pathNormal(), n = Math.max(32, Math.ceil(Math.abs(twist) * 180 / Math.PI / 3)), pts = [];
    for (let k = 0; k <= n; k++) {
      const s = S.length * k / n, { p, t } = at(s), N = norm(cross(B, t)), ph = twist * (mid ? s - sP : s) / Ls;
      pts.push(add(p, add(mul(N, Math.cos(ph)), mul(B, Math.sin(ph)))));
    }
    return R.assembleWire([R.makeBSplineApproximation(pts, { tolerance: 1e-5, degMax: 5 })]);
  };
  const tm = f.corners === 'round' ? 'round' : 'right';
  /* Verjüngungswinkel (taperAngle, negativ = nach innen): das Profil wird entlang des Pfads linear um den
     Pfadpunkt skaliert, so dass sein äußerster Punkt (Abstand ρ vom Pfadanfang) unter dem Winkel läuft:
     Faktor(s) = 1 + s·tan α / ρ. Bei einem Kreis mittig auf dem Pfad ist das genau der Kegel. Das Gesetz läuft über
     die ganze Pfadlänge in Richtung der Pfadkurve, beginnt also am Pfadende, wenn das Profil dort sitzt. */
  const taper = (Number(f.taper) || 0) * Math.PI / 180;
  let lawEnds = null;
  if (rs && Math.abs(taper) > 1e-9) throw new Error('Mit Führungsschiene geht keine Verjüngung');
  let railLaw = null;
  if (rs && f.railScale === 'scale') {
    const RS = pathSampler(railW());
    const railDist = s => {
      const { p, t } = S.at(s), g = u => dot(sub(RS.at(u).p, p), t), N = 200;
      let best = Infinity;
      for (let k = 0; k < N; k++) {
        let a = RS.length * k / N, b = RS.length * (k + 1) / N, ga = g(a), gb = g(b);
        if (ga * gb > 0 && Math.min(Math.abs(ga), Math.abs(gb)) > 1e-6) continue;   // Schienenende genau in der Normalebene zählt
        if (ga * gb > 0) { best = Math.min(best, len(sub(RS.at(Math.abs(ga) < Math.abs(gb) ? a : b).p, p))); continue; }
        for (let it = 0; it < 50; it++) { const m = (a + b) / 2, gm = g(m); if (ga * gm <= 0) b = m; else { a = m; ga = gm; } }
        best = Math.min(best, len(sub(RS.at((a + b) / 2).p, p)));
      }
      return best;
    };
    const s0 = mid ? sP : fromEnd ? S.length : 0, d0 = railDist(s0);
    if (!isFinite(d0) || d0 < 1e-6) throw new Error('Die Führungsschiene muss neben dem Pfad liegen und die Profilebene kreuzen');
    const n = 48, pts = [];
    for (let k = 0; k <= n; k++) {
      const s = S.length * k / n, dd = railDist(s);
      if (!isFinite(dd)) throw new Error('Die Führungsschiene reicht nicht über den ganzen Pfad');
      pts.push([s, dd / d0]);
    }
    railLaw = pts;
  }
  if (Math.abs(taper) > 1e-9) {
    if (Math.abs(taper) >= 89 * Math.PI / 180) throw new Error('Verjüngungswinkel zu groß');
    if (mid) throw new Error('Verjüngung geht nur, wenn das Profil an einem Pfadende sitzt');
    const p0 = at(0).p;
    let rho = 0;
    chosenRegions(sk, f.profiles).forEach(r => profileRing(r.outer, pl, 24).forEach(q => { rho = Math.max(rho, len(sub(q, p0))); }));
    if (!(rho > 1e-6)) throw new Error('Das Profil liegt auf dem Pfadpunkt');
    const fe = 1 + S.length * Math.tan(taper) / rho;
    if (!(fe > 1e-3)) throw new Error('Verjüngung zu stark: das Profil schrumpft vor dem Pfadende auf null');
    lawEnds = fromEnd ? [fe, 1] : [1, fe];
  }
  const law = () => {
    if (railLaw) {
      const oc = R.getOC(), arr = new oc.NCollection_Array1_gp_Pnt2d(1, railLaw.length);
      railLaw.forEach(([s, v], i) => arr.SetValue(i + 1, new oc.gp_Pnt2d(s, v)));
      const l = new oc.Law_Interpol();
      l.Set(arr, false);
      return l.Trim(0, S.length, 1e-6);
    }
    if (!lawEnds) return null;
    const oc = R.getOC(), l = new oc.Law_Linear();
    l.Set(0, lawEnds[0], S.length, lawEnds[1]);
    return l.Trim(0, S.length, 1e-6);
  };
  const fixed = () => { const oc = R.getOC(); return new oc.gp_Ax2(new oc.gp_Pnt(...pl.o), new oc.gp_Dir(...norm(pl.n))); };
  const cfg = () => ({ ...(parallel ? { support: fixed(), transitionMode: tm } : rs ? { auxiliarySpine: railW(), transitionMode: tm } : Math.abs(twist) > 1e-9 ? { auxiliarySpine: aux(), transitionMode: tm } : { frenet: true, transitionMode: tm }), ...(lawEnds || railLaw ? { law: law() } : {}) });
  let tool = null;
  chosenRegions(sk, f.profiles).forEach(r => {
    let t = R.genericSweep(loopWire(r.outer, pl), pathWire(ps), cfg());
    r.holes.forEach(h => { t = t.cut(R.genericSweep(loopWire(h, pl), pathWire(ps), cfg())); });
    tool = tool ? tool.fuse(t) : t;
  });
  // Teilstrecke: am Ende senkrecht zur Pfadtangente abschneiden (parallel: parallel zur Profilebene);
  // keepBack = behalten wird der Teil vor der Stelle (kleinere Bogenlänge)
  const endCut = (s, keepBack) => {
    const e = S.at(s), bb = bbOf(tool), big = len(sub(bb[1], bb[0])) * 2 + 10;
    const nn = parallel ? mul(pn, dot(pn, e.t) < 0 ? -1 : 1) : e.t;
    tool = bool(tool, halfSpace(e.p, mul(nn, keepBack ? -1 : 1), big), 'intersect');
    if (!tool) throw new Error('Von der Teilstrecke bleibt nichts übrig');
  };
  if (tool && mid) {
    if (frac < 1 - 1e-9) endCut(sP + sg * frac * L1, sg > 0);
    if (tool && frac2 < 1 - 1e-9) endCut(sP - sg * frac2 * L2, sg < 0);
  } else if (tool && frac < 1 - 1e-9) {
    endCut(fromEnd ? S.length - Ls : Ls, !fromEnd);
  }
  return tool;
}
/* Rohr: Querschnitt (Kreis/Quadrat/Dreieck) am Pfadanfang senkrecht aufstellen und entlang ziehen, hohl mit Wandstärke */
function pipeTool(f, solved, byId) {
  const ps = solved.get(f.path) || byId[f.path];
  if (!ps || ps.type !== 'sketch') throw new Error('Die Pfad-Skizze fehlt');
  const spine = () => pathWire(JSON.parse(JSON.stringify(ps)));
  const es = spine().edges, e0 = es[0];
  const a = e0.startPoint.toTuple(), b = e0.endPoint.toTuple();
  let start = a, t = norm(e0.tangentAt(0).toTuple());
  if (es.length > 1) {
    // Anfang = das Ende der ersten Kante, das nicht an der zweiten hängt
    const c = es[1].startPoint.toTuple(), d = es[1].endPoint.toTuple();
    const near = p => Math.min(len(sub(p, c)), len(sub(p, d)));
    if (near(a) < near(b)) { start = b; t = mul(norm(e0.tangentAt(1).toTuple()), -1); }
  }
  const s = Number(f.size), kind = f.section || 'circle';
  if (!(s > 1e-6)) throw new Error('Die Größe muss größer als 0 sein');
  const x = anyPerp(t), y = cross(t, x);
  const prof = q => {
    if (kind === 'circle') return R.assembleWire([R.makeCircle(q / 2, start, t)]);
    const uv = kind === 'square'
      ? [[-q / 2, -q / 2], [q / 2, -q / 2], [q / 2, q / 2], [-q / 2, q / 2]]
      : [90, 210, 330].map(g => [q / Math.sqrt(3) * Math.cos(g * Math.PI / 180), q / Math.sqrt(3) * Math.sin(g * Math.PI / 180)]);
    const P = uv.map(([u, v]) => add(start, add(mul(x, u), mul(y, v))));
    return R.assembleWire(P.map((p, i) => R.makeLine(p, P[(i + 1) % P.length])));
  };
  const cfg = { frenet: true, transitionMode: f.corners === 'round' ? 'round' : 'right' };
  let tool = R.genericSweep(prof(s), spine(), cfg);
  if (f.hollow) {
    const w = Number(f.wall);
    // innen gleiche Form, Wand überall gleich dick (Dreieck: Inkreis um w kleiner)
    const inner = kind === 'triangle' ? s - 2 * Math.sqrt(3) * w : s - 2 * w;
    if (!(w > 1e-6) || !(inner > 1e-6)) throw new Error('Die Wandstärke ist zu groß für den Querschnitt');
    tool = tool.cut(R.genericSweep(prof(inner), spine(), cfg));
  }
  /* Teilstrecke (Abstand 1 und 2 des Rohrs): das vordere Ende sitzt am Pfadanfang oder bei „Teilstrecke ab“,
     das hintere bei „Teilstrecke bis“ – jedes Ende senkrecht zum Pfad abgeschnitten. Wie überall in cantcodecad in %
     der Pfadlänge statt in mm; der Querschnitt bleibt gleich groß. */
  const frac = f.pathFrac != null && f.pathFrac !== '' ? Math.max(1, Math.min(100, Number(f.pathFrac) || 100)) / 100 : 1;
  const frac0 = f.pathFrac0 != null && f.pathFrac0 !== '' ? Math.max(0, Math.min(99, Number(f.pathFrac0) || 0)) / 100 : 0;
  if (frac < 1 - 1e-9 || frac0 > 1e-9) {
    const S = pathSampler(spine()), back = len(sub(S.at(0).p, start)) > len(sub(S.at(S.length).p, start));
    const at = u => S.at(back ? S.length * (1 - u) : S.length * u);   // u in % vom Querschnitt aus gerechnet
    const bb = bbOf(tool), big = len(sub(bb[1], bb[0])) * 2 + 10;
    if (frac < 1 - 1e-9) { const e = at(frac); tool = bool(tool, halfSpace(e.p, mul(e.t, back ? 1 : -1), big), 'intersect'); }
    if (tool && frac0 > 1e-9) { const e = at(frac0); tool = bool(tool, halfSpace(e.p, mul(e.t, back ? -1 : 1), big), 'intersect'); }
    if (!tool || !(safeVolume(tool) > 1e-6)) throw new Error('Von der Teilstrecke bleibt nichts übrig');
  }
  return tool;
}
/* Erhebung mit Schienen (Führungsschienen): OpenCASCADE (ThruSections) kennt keine Schienen. Darum
   viele Zwischenschnitte: beide Profile gleich weit aufgeteilt (Start am Berührpunkt von Schiene 1, bei zwei Schienen
   je die Hälfte der Punkte bis zum Berührpunkt von Schiene 2), linear überblendet und dann so ähnlich abgebildet, dass
   die Bezugspunkte auf den Schienen liegen – eine Schiene: Drehung um die Normale und gleichmäßige Skalierung um die
   Mitte, Ebene durch den Schienenpunkt; zwei Schienen: die Strecke der beiden Bezugspunkte geht auf die Strecke der
   beiden Schienenpunkte. Durch diese Schnitte läuft eine Erhebung mit geraden Übergängen. */
function railLoft(f, regs, rails) {
  if (regs.length !== 2) throw new Error('Mit Schienen gehen genau zwei Profile');
  if (regs.some(x => x.r.holes.length)) throw new Error('Mit Schienen gehen nur Profile ohne Löcher');
  if (rails.length > 2) throw new Error('Höchstens zwei Schienen');
  const ring = ({ r, pl }) => profileRing(r.outer, pl, 24);
  let PA = ring(regs[0]), PB = ring(regs[1]);
  const cen = P => mul(P.reduce((a, q) => add(a, q), [0, 0, 0]), 1 / P.length);
  const cA = cen(PA), cB = cen(PB);
  let nA = norm(regs[0].pl.n), nB = norm(regs[1].pl.n);
  if (dot(nA, sub(cB, cA)) < 0) nA = mul(nA, -1);
  if (dot(nB, sub(cB, cA)) < 0) nB = mul(nB, -1);
  const ccw = (P, n) => { let s = 0; P.forEach((p, i) => { s += dot(cross(sub(p, cen(P)), sub(P[(i + 1) % P.length], cen(P))), n); }); return s < 0 ? P.slice().reverse() : P; };
  PA = ccw(PA, nA); PB = ccw(PB, nB);
  // Schienen vom ersten zum zweiten Profil ausgerichtet
  const onA = p => Math.abs(dot(sub(p, cA), nA)), onB = p => Math.abs(dot(sub(p, cB), nB));
  const R2 = rails.map(S => {
    const rev = onA(S.at(S.length).p) < onA(S.at(0).p);
    const at = t => S.at(rev ? S.length * (1 - t) : S.length * t).p;
    if (onA(at(0)) > 0.05 || onB(at(1)) > 0.05) throw new Error('Jede Schiene muss auf dem ersten Profil beginnen und auf dem zweiten enden');
    return at;
  });
  // Ring ab dem Punkt, der q am nächsten liegt (genau auf dem Umriss eingefügt)
  const startAt = (P, q) => {
    let best = Infinity, bi = 0, bp = P[0];
    P.forEach((a, i) => { const b = P[(i + 1) % P.length], ab = sub(b, a), u = Math.max(0, Math.min(1, dot(sub(q, a), ab) / Math.max(1e-12, dot(ab, ab)))), x = add(a, mul(ab, u)), d = len(sub(x, q)); if (d < best) { best = d; bi = i; bp = x; } });
    if (best > 0.05) throw new Error('Eine Schiene berührt ein Profil nicht (Abstand > 0,05 mm)');
    const rest = [...P.slice(bi + 1), ...P.slice(0, bi + 1)];
    return len(sub(rest[0], bp)) < 1e-9 ? rest : [bp, ...rest];
  };
  // gleich weit aufteilen: n Punkte von P[0] bis zum Punkt bei Bogenlänge sEnd (ohne ihn)
  const arc = P => { const c = [0]; for (let i = 1; i <= P.length; i++) c.push(c[i - 1] + len(sub(P[i % P.length], P[i - 1]))); return c; };
  const pointAt = (P, c, s) => { let i = 0; while (i < P.length - 1 && c[i + 1] < s) i++; const a = P[i], b = P[(i + 1) % P.length], u = (s - c[i]) / Math.max(1e-12, c[i + 1] - c[i]); return add(a, mul(sub(b, a), Math.max(0, Math.min(1, u)))); };
  const N = 96;
  const split = (P, q2) => {
    const c = arc(P), L = c[c.length - 1];
    if (!q2) return Array.from({ length: N }, (_, k) => pointAt(P, c, L * k / N));
    let best = Infinity, s2 = 0;
    for (let k = 0; k < 2000; k++) { const s = L * k / 2000, d = len(sub(pointAt(P, c, s), q2)); if (d < best) { best = d; s2 = s; } }
    const h = N / 2;
    return [...Array.from({ length: h }, (_, k) => pointAt(P, c, s2 * k / h)), ...Array.from({ length: h }, (_, k) => pointAt(P, c, s2 + (L - s2) * k / h))];
  };
  const QA = split(startAt(PA, R2[0](0)), R2[1] && R2[1](0)), QB = split(startAt(PB, R2[0](1)), R2[1] && R2[1](1));
  const rot = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a); return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); };
  const M = 40, secs = [];
  for (let j = 0; j <= M; j++) {
    const t = j / M, Q = QA.map((a, i) => add(mul(a, 1 - t), mul(QB[i], t)));
    let P;
    if (R2.length === 1) {
      const n = norm(add(mul(nA, 1 - t), mul(nB, t))), c0 = add(mul(cA, 1 - t), mul(cB, t)), r1 = R2[0](t);
      const c = add(c0, mul(n, dot(sub(r1, c0), n)));
      const pr = v => sub(v, mul(n, dot(v, n)));
      const v = pr(sub(Q[0], c0)), w = pr(sub(r1, c));
      if (!(len(v) > 1e-9)) throw new Error('Die Schiene beginnt in der Profilmitte');
      const s = len(w) / len(v), ang = Math.atan2(dot(cross(v, w), n), dot(v, w));
      P = Q.map(q => { const d = sub(q, c0), dn = mul(n, dot(d, n)); return add(add(c, dn), mul(rot(sub(d, dn), n, ang), s)); });
    } else {
      const r1 = R2[0](t), r2 = R2[1](t), a = sub(Q[N / 2], Q[0]), b = sub(r2, r1);
      if (!(len(a) > 1e-9)) throw new Error('Die beiden Schienen berühren das Profil am selben Punkt');
      const s = len(b) / len(a), ax = cross(a, b), sa = len(ax), ang = Math.atan2(sa, dot(a, b)), k = sa > 1e-12 ? mul(ax, 1 / sa) : norm(add(nA, nB));
      P = Q.map(q => add(r1, mul(rot(sub(q, Q[0]), k, ang), s)));
    }
    secs.push(R.assembleWire(P.map((q, i) => R.makeLine(q, P[(i + 1) % P.length]))));
  }
  return R.loft(secs, { ruled: true });
}
function loftTool(f, solved, byId) {
  const secs = (f.sections || []).filter(s => s && s.sketch);
  if (secs.length < 2) throw new Error('Mindestens zwei Profile wählen');
  /* Je Skizze das gewählte bzw. erste Profil. Löcher: haben alle Profile gleich viele, wird Loch k durch alle
     Profile mitgeführt und abgezogen (Zuordnung nach dem Winkel um die Profilmitte, bei einem Loch eindeutig). */
  const regs = secs.map(s => {
    const sk = solved.get(s.sketch) || byId[s.sketch];
    if (!sk || sk.type !== 'sketch') throw new Error('Eine Profil-Skizze fehlt');
    const r = chosenRegions(sk, s.profile ? [s.profile] : null)[0];
    if (!r) throw new Error(`Skizze „${sk.name}“ hat kein geschlossenes Profil`);
    return { r, pl: sk.plane };
  });
  const nh = regs[0].r.holes.length, withHoles = nh > 0 && regs.every(x => x.r.holes.length === nh);
  const order = ({ r }) => {
    const c = lp => { const P = profileRing(lp, { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] }, 8); return P.reduce((a, q) => [a[0] + q[0] / P.length, a[1] + q[1] / P.length], [0, 0]); };
    const co = c(r.outer);
    return r.holes.map(h => { const ch = c(h); return { h, a: Math.atan2(ch[1] - co[1], ch[0] - co[0]) }; }).sort((x, y) => x.a - y.a).map(x => x.h);
  };
  const holeSets = withHoles ? regs.map(order) : [];
  /* Mittellinie (centerLineOrRails): die Profile werden entlang der Mittellinie (Kette einer Skizze) ineinander
     übergeführt – MakePipeShell mit mehreren Profilen, Bezugsrahmen nach Frenet. Die Profile müssen der Reihe nach auf
     der Mittellinie liegen. */
  let cs = null;
  if (f.center) {
    cs = solved.get(f.center) || byId[f.center];
    if (!cs || cs.type !== 'sketch') throw new Error('Die Skizze der Mittellinie fehlt');
    if (secs.some(s => s.sketch === cs.id)) throw new Error('Die Mittellinie braucht eine eigene Skizze');
    if (f.closed) throw new Error('Eine geschlossene Erhebung geht ohne Mittellinie');
  }
  /* Geschlossen: die Erhebung läuft vom letzten Profil zurück zum ersten. Die Erhebung in
     OpenCASCADE kennt kein „geschlossen“ – gesetzt wird der Ring, indem das erste Profil am Ende noch einmal
     aufgeführt wird (Probe 20.10.2026: glatter Ring aus acht Kreisprofilen 74033 mm³ gegen 74022 mm³ nach dem
     Satz des Guldin, geradlinig die zugehörige Vielecknäherung). Mit zwei Profilen wäre der Rückweg der
     Hinweg – deshalb mindestens drei, und ohne Mittellinie oder Schienen (dort baut die Erhebung auf der
     Pfadkurve auf, die selbst geschlossen sein kann: „Rohr“). */
  const closed = !!f.closed;
  if (closed && secs.length < 3) throw new Error('Für eine geschlossene Erhebung mindestens drei Profile');
  const make = wires => {
    if (!cs) return R.loft(closed ? [...wires, wires[0].clone()] : wires, { ruled: !!f.ruled });
    const oc = R.getOC(), ps = new oc.BRepOffsetAPI_MakePipeShell(pathWire(JSON.parse(JSON.stringify(cs))).wrapped);
    ps.SetMode(true);
    wires.forEach(w => ps.Add(w.wrapped, false, false));
    ps.Build(new oc.Message_ProgressRange());
    if (!ps.IsDone()) { ps.delete(); throw new Error('Erhebung entlang der Mittellinie nicht möglich – liegen die Profile der Reihe nach auf ihr?'); }
    ps.MakeSolid();
    const sh = R.cast(ps.Shape());
    ps.delete();
    if (safeVolume(sh) < 0) sh.wrapped.Reverse();
    return sh;
  };
  const railIds = [f.rail1, f.rail2].filter(Boolean);
  if (railIds.length) {
    if (cs) throw new Error('Mittellinie oder Schienen – beides zusammen geht nicht');
    if (f.closed) throw new Error('Eine geschlossene Erhebung geht ohne Schienen');
    const rails = railIds.map(id => {
      const rs = solved.get(id) || byId[id];
      if (!rs || rs.type !== 'sketch') throw new Error('Die Skizze einer Schiene fehlt');
      if (secs.some(s => s.sketch === rs.id)) throw new Error('Jede Schiene braucht eine eigene Skizze');
      return pathSampler(pathWire(JSON.parse(JSON.stringify(rs))));
    });
    return railLoft(f, regs, rails);
  }
  let tool = make(regs.map(({ r, pl }) => loopWire(r.outer, pl)));
  for (let k = 0; k < (withHoles ? nh : 0); k++) {
    const hole = make(regs.map(({ pl }, i) => loopWire(holeSets[i][k], pl)));
    const cut = bool(tool, hole, 'cut');
    if (!cut) throw new Error('Das Loch füllt die ganze Erhebung');
    tool = cut;
  }
  return tool;
}

/* ---------- Übergangslasche (wie „Übergangslasche“/Lofted Flange) ----------
   Zwei Profile auf verschiedenen Ebenen, verbunden durch einen Dreiecksstreifen (je Schritt die kürzere Diagonale –
   bei Rechteck → Rund entstehen so die üblichen Fächer an den Ecken). Blech = Fläche um t versetzt; Abwicklung =
   Dreiecke der neutralen Faser der Reihe nach in die Ebene gelegt, Naht in der Mitte der längsten Profilseite. */
/* fq: Facetten je 90° (Zahl) oder eine Funktion (Radius, Bogenwinkel) → Anzahl der Facetten dieses Bogens */
function profileRing(loop, pl, fq) {
  const P3 = q => add(add(pl.o, mul(pl.x, q[0])), mul(pl.y, q[1]));
  const out = [];
  const segs = typeof fq === 'function' ? fq : (r, span) => Math.ceil(Math.abs(span) / (Math.PI / 2 / fq) - 1e-9);
  const arcPts = (c, r, a0, span) => { const n = Math.max(1, Math.min(720, segs(r, span) || 1)); for (let i = 0; i < n; i++) { const a = a0 + span * i / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } };
  if (loop.circle) arcPts(loop.circle.c, loop.circle.r, 0, 2 * Math.PI);
  else loop.edges.forEach(e => {
    if (e.type === 'line') out.push(e.a);
    else if (e.type === 'spl') e.pts.slice(0, -1).forEach(q => out.push(q));
    else {
      const cc = circleCenter([...e.a, 0], [...e.mid, 0], [...e.b, 0]);
      if (!cc) { out.push(e.a); return; }
      const c = [cc[0], cc[1]], r = Math.hypot(e.a[0] - c[0], e.a[1] - c[1]);
      const ang = q => Math.atan2(q[1] - c[1], q[0] - c[0]), a0 = ang(e.a);
      const norm2 = v => { while (v < 0) v += 2 * Math.PI; while (v >= 2 * Math.PI) v -= 2 * Math.PI; return v; };
      const dm = norm2(ang(e.mid) - a0), db = norm2(ang(e.b) - a0);
      arcPts(c, r, a0, dm < db ? db : db - 2 * Math.PI);
    }
  });
  return out.filter((q, i) => Math.hypot(q[0] - out[(i + 1) % out.length][0], q[1] - out[(i + 1) % out.length][1]) > 1e-7).map(P3);
}
/* Facetten beim Abkanten: Anzahl je 90° (Vorgabe), höchstens ein Winkel je Facette,
   höchstens eine Länge je Facette (Bogenlänge auf dem Profil) oder höchstens eine Sehnenabweichung h
   (Facettenwinkel φ = 2·arccos(1 − h/r)). Rückgabe: Zahl je 90° oder Funktion (Radius, Bogenwinkel) → Facetten */
function facetCount(f) {
  const ceil = v => Math.ceil(v - 1e-9);
  if (f.facetMode === 'angle') {
    const a = Number(f.facetAngle) * Math.PI / 180;
    if (!(a > 1e-3 && a <= Math.PI)) throw new Error('Facettenwinkel zwischen 0,1° und 180°');
    return (r, span) => ceil(Math.abs(span) / a);
  }
  if (f.facetMode === 'length') {
    const L = Number(f.facetLength);
    if (!(L > 1e-3)) throw new Error('Facettenlänge muss größer als 0 sein');
    return (r, span) => ceil(r * Math.abs(span) / L);
  }
  if (f.facetMode === 'chord') {
    const h = Number(f.chordTol);
    if (!(h > 1e-6)) throw new Error('Sehnentoleranz muss größer als 0 sein');
    return (r, span) => (h >= r ? 1 : ceil(Math.abs(span) / (2 * Math.acos(1 - h / r))));
  }
  return Math.max(1, Math.min(24, Math.round(Number(f.facets) || 4)));
}
/* Übergangslasche über mehr als zwei Profile (wie „Übergangslasche“ mit mehreren Profilen). Ein gemeinsames
   Dreiecksnetz über alle Profile: die Naht läuft durch alle Profile (jeweils in Verlängerung der Naht davor), zwischen
   je zwei Nachbarprofilen wird wie beim Paar trianguliert. Weil die Punkte eines Zwischenprofils zu beiden Streifen
   gehören, haben sie nur eine Versatzrichtung – keine Lücke, keine Überlappung. Abgewickelt wird per Breitensuche:
   ein Dreieck wird gelegt, sobald zwei seiner Ecken liegen; geknickte gemeinsame Kanten sind Biegelinien. */
function loftedFlangeMulti(f, solved, byId, rule) {
  const ids = [f.skA, f.skB, ...(f.more || [])];
  if (ids.some(x => !x) || new Set(ids).size !== ids.length) throw new Error('Lauter verschiedene Profil-Skizzen wählen');
  const fq = f.mode === 'formed' ? 12 : facetCount(f);
  let rings = ids.map(id => {
    const sk = solved.get(id) || byId[id];
    if (!sk || sk.type !== 'sketch') throw new Error('Eine Profil-Skizze fehlt');
    const r = chosenRegions(sk, null)[0];
    if (!r) throw new Error(`Skizze „${sk.name}“ hat kein geschlossenes Profil`);
    const P = profileRing(r.outer, sk.plane, fq);
    if (P.length < 3) throw new Error('Profil zu einfach');
    return P;
  });
  const t = Number(rule.t) || 2, k = Number(rule.k) >= 0 ? Number(rule.k) : 0.44, K = rings.length;
  const cen = P => mul(P.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / P.length);
  const C = rings.map(cen);
  for (let q = 1; q < K; q++) if (len(sub(C[q], C[q - 1])) < 1e-6) throw new Error('Zwei Profile liegen aufeinander');
  // Achse je Profil (zentral gemittelt) und Ebenenrahmen dazu
  const axisAt = q => norm(sub(C[Math.min(K - 1, q + 1)], C[Math.max(0, q - 1)]));
  const frame = d => { const e1 = norm(anyPerp(d)); return { e1, e2: cross(d, e1) }; };
  const pr2 = (p, c, fr) => { const v = sub(p, c); return [dot(v, fr.e1), dot(v, fr.e2)]; };
  rings = rings.map((P, q) => {
    const fr = frame(axisAt(q));
    let s = 0; P.forEach((p, i) => { const a = pr2(p, C[q], fr), b = pr2(P[(i + 1) % P.length], C[q], fr); s += a[0] * b[1] - b[0] * a[1]; });
    return s < 0 ? P.slice().reverse() : P;
  });
  // Naht: Mitte der längsten Seite des ersten Profils, dann je Profil der Strahl in derselben Richtung
  { let li = 0, ll = -1; const A = rings[0];
    A.forEach((p, i) => { const l = len(sub(A[(i + 1) % A.length], p)); if (l > ll) { ll = l; li = i; } });
    const sA = mul(add(A[li], A[(li + 1) % A.length]), 0.5);
    rings[0] = [sA, ...A.slice(li + 1), ...A.slice(0, li + 1)]; }
  for (let q = 1; q < K; q++) {
    const fr = frame(axisAt(q)), B = rings[q], s3 = sub(rings[q - 1][0], C[q - 1]);
    const dir = [dot(s3, fr.e1), dot(s3, fr.e2)], th = Math.atan2(dir[1], dir[0]), ray = [Math.cos(th), Math.sin(th)];
    let bi = -1, bp = null, bt = Infinity;
    B.forEach((p, i) => {
      const a = pr2(p, C[q], fr), b = pr2(B[(i + 1) % B.length], C[q], fr), sv = [b[0] - a[0], b[1] - a[1]], den = ray[0] * sv[1] - ray[1] * sv[0];
      if (Math.abs(den) < 1e-12) return;
      const tr = (a[0] * sv[1] - a[1] * sv[0]) / den, u = (a[0] * ray[1] - a[1] * ray[0]) / den;
      if (tr > 0 && u >= -1e-9 && u <= 1 + 1e-9 && tr < bt) { bt = tr; bi = i; bp = add(p, mul(sub(B[(i + 1) % B.length], p), Math.max(0, Math.min(1, u)))); }
    });
    if (bi < 0) throw new Error('Profile passen nicht zueinander (Naht nicht gefunden)');
    const nr = (p, x) => len(sub(p, x)) < 1e-6;
    rings[q] = nr(bp, B[bi]) ? [...B.slice(bi), ...B.slice(0, bi)] : nr(bp, B[(bi + 1) % B.length]) ? [...B.slice(bi + 1), ...B.slice(0, bi + 1)] : [bp, ...B.slice(bi + 1), ...B.slice(0, bi + 1)];
  }
  const nOf = q => rings[q].length;
  const key = (q, i) => q + ':' + i, P = kk => { const [q, i] = kk.split(':').map(Number); return rings[q][i % nOf(q)]; };
  const base = kk => { const [q, i] = kk.split(':').map(Number); return q + ':' + (i % nOf(q)); };
  // Dreiecke je Nachbarpaar (Kanten nach dem Winkel ihrer Außennormalen gemischt, wie beim Paar)
  const tris = [], pairOf = [];
  for (let q = 0; q + 1 < K; q++) {
    const fr = frame(norm(sub(C[q + 1], C[q])));
    const nAng = (qq, i) => { const a = pr2(P(key(qq, i)), C[qq], fr), b = pr2(P(key(qq, i + 1)), C[qq], fr); return Math.atan2(-(b[0] - a[0]), b[1] - a[1]); };
    const th0 = nAng(q, 0) - 1e-4, rel = v => { let r = v - th0; while (r < 0) r += 2 * Math.PI; while (r >= 2 * Math.PI) r -= 2 * Math.PI; return r; };
    const angs = qq => { const out = []; let prev = -Infinity; for (let i = 0; i < nOf(qq); i++) { let r = rel(nAng(qq, i)); if (r < prev) r = r + 2 * Math.PI - prev < Math.PI ? r + 2 * Math.PI : prev; out.push(r); prev = r; } return out; };
    const gA = angs(q), gB = angs(q + 1);
    let i = 0, j = 0;
    while (i < nOf(q) || j < nOf(q + 1)) {
      const advA = j >= nOf(q + 1) || (i < nOf(q) && gA[i] <= gB[j]);
      if (advA) { tris.push([key(q, i), key(q + 1, j), key(q, i + 1)]); i++; } else { tris.push([key(q, i), key(q + 1, j), key(q + 1, j + 1)]); j++; }
      pairOf.push(q);
    }
  }
  // Flächennormalen nach außen (weg von der Achse des Streifens), Punktnormalen ausgeglichen wie beim Paar
  const fn = tris.map((T, ti) => {
    const [p, q2, r] = T.map(P); let nn = cross(sub(q2, p), sub(r, p));
    if (len(nn) < 1e-12) return null;
    nn = norm(nn);
    const g = mul(add(add(p, q2), r), 1 / 3), q = pairOf[ti], c = C[q], d = norm(sub(C[q + 1], c)), v = sub(g, c), rad = sub(v, mul(d, dot(v, d)));
    return dot(nn, rad) < 0 ? mul(nn, -1) : nn;
  });
  const acc = new Map();
  tris.forEach((T, ti) => { if (!fn[ti]) return; T.forEach(kk => { const b = base(kk); acc.set(b, [...(acc.get(b) || []), fn[ti]]); }); });
  const vn = new Map();
  acc.forEach((ns, b) => {
    const m0 = norm(ns.reduce((s, x) => add(s, x), [0, 0, 0])), lam = 1e-4 * ns.length;
    const Mx = [[lam, 0, 0], [0, lam, 0], [0, 0, lam]], rhs = mul(m0, lam);
    ns.forEach(x => { for (let r = 0; r < 3; r++) { rhs[r] += x[r]; for (let c = 0; c < 3; c++) Mx[r][c] += x[r] * x[c]; } });
    const det3 = X => X[0][0] * (X[1][1] * X[2][2] - X[1][2] * X[2][1]) - X[0][1] * (X[1][0] * X[2][2] - X[1][2] * X[2][0]) + X[0][2] * (X[1][0] * X[2][1] - X[1][1] * X[2][0]);
    const D0 = det3(Mx);
    let m = m0;
    if (Math.abs(D0) > 1e-12) m = [0, 1, 2].map(c => det3(Mx.map((row, r) => row.map((v, cc) => (cc === c ? rhs[r] : v)))) / D0);
    if (!(len(m) > 0.5 && len(m) < 3) || dot(m, m0) <= 0) { const cc = ns.reduce((s, x) => s + dot(m0, x), 0) / ns.length; m = mul(m0, 1 / Math.max(0.5, cc)); }
    vn.set(b, m);
  });
  const mid = f.side === 'mid', sg = f.side === 'in' ? -1 : 1, h0 = mid ? -t / 2 : 0, h1 = h0 + t;
  const off = (kk, h) => add(P(kk), mul(vn.get(base(kk)) || [0, 0, 0], sg * h));
  const faces = [];
  const tri = (a, b, c) => { if (len(cross(sub(b, a), sub(c, a))) > 1e-10) faces.push(R.makePolygon([a, b, c])); };
  const I = kk => off(kk, h0), O = kk => off(kk, h1);
  tris.forEach(T => { tri(...T.map(I)); tri(...T.map(O).reverse()); });
  const rim = q => { for (let i = 0; i < nOf(q); i++) { const a = key(q, i), b = key(q, i + 1); tri(I(a), I(b), O(b)); tri(I(a), O(b), O(a)); } };
  rim(0); rim(K - 1);
  // Nahtwände zwischen den Profilen gibt es nicht (die Naht liegt im Netz); offene Enden schließen nur die Ränder
  let shape;
  try { shape = R.makeSolid(faces); } catch (err) { throw new Error('Übergangslasche ließ sich nicht als Körper schließen'); }
  // Abwicklung der neutralen Faser per Breitensuche über gemeinsame Kanten
  const hn = mid ? k * t - t / 2 : f.side === 'in' ? t - k * t : k * t, Q = kk => off(kk, hn);
  const pos = new Map();
  const place = (a, b, c, other) => {
    const pa = pos.get(a), pb = pos.get(b), lab = len(sub(Q(b), Q(a))), lac = len(sub(Q(c), Q(a))), lbc = len(sub(Q(c), Q(b)));
    const ux = (pb[0] - pa[0]) / lab, uy = (pb[1] - pa[1]) / lab, x = (lac * lac - lbc * lbc + lab * lab) / (2 * lab), y = Math.sqrt(Math.max(0, lac * lac - x * x));
    let s = 1;
    if (other) { const po = pos.get(other), so = (po[0] - pa[0]) * -uy + (po[1] - pa[1]) * ux; s = so > 0 ? -1 : 1; }
    pos.set(c, [pa[0] + ux * x - uy * y * s, pa[1] + uy * x + ux * y * s]);
  };
  const ek = (a, b) => (a < b ? a + '|' + b : b + '|' + a), byEdge = new Map();
  tris.forEach((T, ti) => [[0, 1], [1, 2], [2, 0]].forEach(([u, v]) => { const e = ek(T[u], T[v]); byEdge.set(e, [...(byEdge.get(e) || []), ti]); }));
  const done = new Array(tris.length).fill(false), bends = [];
  const T0 = tris[0];
  pos.set(T0[0], [0, 0]); pos.set(T0[1], [0, len(sub(Q(T0[1]), Q(T0[0])))]);
  place(T0[0], T0[1], T0[2], null); done[0] = true;
  const queue = [0];
  while (queue.length) {
    const ti = queue.shift(), T = tris[ti];
    [[0, 1], [1, 2], [2, 0]].forEach(([u, v]) => {
      (byEdge.get(ek(T[u], T[v])) || []).forEach(tj => {
        if (done[tj]) return;
        const S = tris[tj], third = S.find(x => x !== T[u] && x !== T[v]), other = T.find(x => x !== T[u] && x !== T[v]);
        if (!pos.has(third)) place(T[u], T[v], third, other);
        done[tj] = true; queue.push(tj);
        if (fn[ti] && fn[tj] && f.mode !== 'formed') {
          const ang = Math.acos(Math.max(-1, Math.min(1, dot(fn[ti], fn[tj])))) * 180 / Math.PI;
          if (ang > 0.25) bends.push({ a: pos.get(T[u]), b: pos.get(T[v]), label: `${ang.toFixed(1).replace('.', ',')}°` });
        }
      });
    });
  }
  if (done.some(x => !x)) throw new Error('Abwicklung unvollständig – Profile passen nicht zueinander');
  // Umriss: erstes Profil, Naht (Ende), letztes Profil rückwärts, Naht (Anfang) zurück
  const pts = [];
  for (let i = 0; i <= nOf(0); i++) pts.push(pos.get(key(0, i)));
  for (let q = 1; q < K; q++) pts.push(pos.get(key(q, nOf(q))));
  for (let i = nOf(K - 1) - 1; i >= 0; i--) pts.push(pos.get(key(K - 1, i)));
  for (let q = K - 2; q >= 1; q--) pts.push(pos.get(key(q, 0)));
  const edges = pts.map((p, i) => ({ type: 'line', a: p, b: pts[(i + 1) % pts.length], mid: null })).filter(e => Math.hypot(e.a[0] - e.b[0], e.a[1] - e.b[1]) > 1e-7);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bb = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  const flat = { contour: [{ edges }], holes: [], bends, bb, rule: { ...rule, t, k }, flanges: 0, t, nb: bends.length, faces: tris.length, skipped: 0 };
  return { shape, flat, info: `${K} Profile · ${tris.length} Facetten${f.mode === 'formed' ? ' (gerollt)' : `, ${bends.length} Biegelinien`} · Zuschnitt ${+(bb[1][0] - bb[0][0]).toFixed(1)} × ${+(bb[1][1] - bb[0][1]).toFixed(1)} mm` };
}
function loftedFlange(f, solved, byId, rule) {
  if (Array.isArray(f.more) && f.more.length) return loftedFlangeMulti(f, solved, byId, rule);
  const prof = id => {
    const sk = solved.get(id) || byId[id];
    if (!sk || sk.type !== 'sketch') throw new Error('Eine Profil-Skizze fehlt');
    const r = chosenRegions(sk, null)[0];
    if (!r) throw new Error(`Skizze „${sk.name}“ hat kein geschlossenes Profil`);
    return profileRing(r.outer, sk.plane, f.mode === 'formed' ? 12 : facetCount(f));
  };
  if (!f.skA || !f.skB || f.skA === f.skB) throw new Error('Zwei verschiedene Profil-Skizzen wählen');
  let A = prof(f.skA), B = prof(f.skB);
  if (A.length < 3 || B.length < 3) throw new Error('Profil zu einfach');
  const t = Number(rule.t) || 2, k = Number(rule.k) >= 0 ? Number(rule.k) : 0.44;
  const cen = P => mul(P.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / P.length);
  const cA = cen(A), cB = cen(B), axv = sub(cB, cA);
  if (len(axv) < 1e-6) throw new Error('Die Profile liegen aufeinander');
  const d = norm(axv), e1 = norm(anyPerp(d)), e2 = cross(d, e1);
  const pr = (p, c) => { const v = sub(p, c); return [dot(v, e1), dot(v, e2)]; };
  const area = (P, c) => { let s = 0; P.forEach((p, i) => { const a = pr(p, c), b = pr(P[(i + 1) % P.length], c); s += a[0] * b[1] - b[0] * a[1]; }); return s / 2; };
  if (area(A, cA) < 0) A = A.reverse();
  if (area(B, cB) < 0) B = B.reverse();
  // Naht: Mitte der längsten Seite von A, auf B in derselben Richtung
  let li = 0, ll = -1;
  A.forEach((p, i) => { const l = len(sub(A[(i + 1) % A.length], p)); if (l > ll) { ll = l; li = i; } });
  const sA = mul(add(A[li], A[(li + 1) % A.length]), 0.5);
  A = [sA, ...A.slice(li + 1), ...A.slice(0, li + 1)];
  const dir = pr(sA, cA), th = Math.atan2(dir[1], dir[0]), ray = [Math.cos(th), Math.sin(th)];
  let bi = -1, bp = null, bt = Infinity;
  B.forEach((p, i) => {
    const a = pr(p, cB), b = pr(B[(i + 1) % B.length], cB), s = [b[0] - a[0], b[1] - a[1]], den = ray[0] * s[1] - ray[1] * s[0];
    if (Math.abs(den) < 1e-12) return;
    const tr = (a[0] * s[1] - a[1] * s[0]) / den, u = (a[0] * ray[1] - a[1] * ray[0]) / den;
    if (tr > 0 && u >= -1e-9 && u <= 1 + 1e-9 && tr < bt) { bt = tr; bi = i; bp = add(p, mul(sub(B[(i + 1) % B.length], p), Math.max(0, Math.min(1, u)))); }
  });
  if (bi < 0) throw new Error('Profile passen nicht zueinander (Naht nicht gefunden)');
  const near = (p, q) => len(sub(p, q)) < 1e-6;
  if (near(bp, B[bi])) B = [...B.slice(bi), ...B.slice(0, bi)];
  else if (near(bp, B[(bi + 1) % B.length])) B = [...B.slice(bi + 1), ...B.slice(0, bi + 1)];
  else B = [bp, ...B.slice(bi + 1), ...B.slice(0, bi + 1)];
  const nA = A.length, nB = B.length;
  const VA = i => A[i % nA], VB = j => B[j % nB];
  // Dreiecksstreifen: Knoten 'a'+i (0…nA) und 'b'+j (0…nB); i = nA bzw. j = nB ist die Naht auf der anderen Seite.
  // Verbunden wird nach gleicher Normalenrichtung (Kanten beider Profile nach dem Winkel ihrer Außennormalen
  // gemischt): jede Rundung fächert zur passenden Ecke, jede gerade Seite wird ein Dreieck.
  const nAng = (P2, c, q) => { const a = pr(P2(q), c), b = pr(P2(q + 1), c); return Math.atan2(-(b[0] - a[0]), b[1] - a[1]); };
  const th0 = nAng(VA, cA, 0) - 1e-4, rel = v => { let r = v - th0; while (r < 0) r += 2 * Math.PI; while (r >= 2 * Math.PI) r -= 2 * Math.PI; return r; };
  // fortlaufend (nicht fallend) machen, auch bei nicht konvexen Profilen
  const angs = (P2, c, n) => { const out = []; let prev = -Infinity; for (let q = 0; q < n; q++) { let r = rel(nAng(P2, c, q)); if (r < prev) r = r + 2 * Math.PI - prev < Math.PI ? r + 2 * Math.PI : prev; out.push(r); prev = r; } return out; };
  const gA = angs(VA, cA, nA), gB = angs(VB, cB, nB);
  const tris = [];
  let i = 0, j = 0;
  while (i < nA || j < nB) {
    const advA = j >= nB || (i < nA && gA[i] <= gB[j]);
    if (advA) { tris.push(['a' + i, 'b' + j, 'a' + (i + 1)]); i++; } else { tris.push(['a' + i, 'b' + j, 'b' + (j + 1)]); j++; }
  }
  const P = key => (key[0] === 'a' ? VA(+key.slice(1)) : VB(+key.slice(1)));
  const base = key => key[0] + (+key.slice(1) % (key[0] === 'a' ? nA : nB)); // gleicher Raumpunkt an der Naht
  // Flächennormalen nach außen (weg von der Achse), Punktnormalen gemittelt
  const fn = tris.map(T => {
    const [p, q, r] = T.map(P); let n = cross(sub(q, p), sub(r, p));
    if (len(n) < 1e-12) return null;
    n = norm(n);
    const g = mul(add(add(p, q), r), 1 / 3), v = sub(g, cA), rad = sub(v, mul(d, dot(v, d)));
    return dot(n, rad) < 0 ? mul(n, -1) : n;
  });
  const acc = new Map();
  tris.forEach((T, ti) => { if (!fn[ti]) return; T.forEach(kk => { const b = base(kk); acc.set(b, [...(acc.get(b) || []), fn[ti]]); }); });
  const vn = new Map();
  // Versatzrichtung m je Punkt: Ausgleich, damit m·n ≈ 1 für jede angrenzende Facette (Abstand t zu jeder Facette)
  acc.forEach((ns, b) => {
    const m0 = norm(ns.reduce((s, n) => add(s, n), [0, 0, 0])), lam = 1e-4 * ns.length;
    const Mx = [[lam, 0, 0], [0, lam, 0], [0, 0, lam]], rhs = mul(m0, lam);
    ns.forEach(n => { for (let r = 0; r < 3; r++) { rhs[r] += n[r]; for (let c = 0; c < 3; c++) Mx[r][c] += n[r] * n[c]; } });
    const det3 = X => X[0][0] * (X[1][1] * X[2][2] - X[1][2] * X[2][1]) - X[0][1] * (X[1][0] * X[2][2] - X[1][2] * X[2][0]) + X[0][2] * (X[1][0] * X[2][1] - X[1][1] * X[2][0]);
    const D0 = det3(Mx);
    let m = m0;
    if (Math.abs(D0) > 1e-12) m = [0, 1, 2].map(c => det3(Mx.map((row, r) => row.map((v, cc) => (cc === c ? rhs[r] : v)))) / D0);
    if (!(len(m) > 0.5 && len(m) < 3) || dot(m, m0) <= 0) { const c = ns.reduce((s, n) => s + dot(m0, n), 0) / ns.length; m = mul(m0, 1 / Math.max(0.5, c)); }
    vn.set(b, m);
  });
  /* Lage des Blechs zu den Profilen: 'out' = Profile sind Innenmaß (Blech nach
     außen), 'in' = Außenmaß (Blech nach innen), 'mid' = Profile liegen in der Blechmitte (je t/2 nach beiden Seiten) */
  const mid = f.side === 'mid', sg = f.side === 'in' ? -1 : 1, h0 = mid ? -t / 2 : 0, h1 = h0 + t;
  const off = (key, h) => add(P(key), mul(vn.get(base(key)) || [0, 0, 0], sg * h));
  // Körper aus Dreiecken: Profilfläche, versetzte Fläche, Ränder oben/unten
  const faces = [];
  const tri = (p, q, r) => { if (len(cross(sub(q, p), sub(r, p))) > 1e-10) faces.push(R.makePolygon([p, q, r])); };
  const I = kk => off(kk, h0), O = kk => off(kk, h1);
  tris.forEach(T => { tri(...T.map(I)); tri(...T.map(O).reverse()); });
  const rim = (n, pre) => { for (let q = 0; q < n; q++) { const a = pre + q, b = pre + (q + 1); tri(I(a), I(b), O(b)); tri(I(a), O(b), O(a)); } };
  rim(nA, 'a'); rim(nB, 'b');
  let shape;
  try { shape = R.makeSolid(faces); } catch (err) { throw new Error('Übergangslasche ließ sich nicht als Körper schließen'); }
  // Abwicklung der neutralen Faser
  // neutrale Faser k·t von der Innenseite des Blechs (gemessen in Richtung sg ab der Profilfläche)
  const hn = mid ? k * t - t / 2 : f.side === 'in' ? t - k * t : k * t;
  const Q = key => off(key, hn);
  const pos = new Map();
  const place = (a, b, c, other) => {
    const pa = pos.get(a), pb = pos.get(b), lab = len(sub(Q(b), Q(a))), lac = len(sub(Q(c), Q(a))), lbc = len(sub(Q(c), Q(b)));
    const ux = (pb[0] - pa[0]) / lab, uy = (pb[1] - pa[1]) / lab, x = (lac * lac - lbc * lbc + lab * lab) / (2 * lab), y = Math.sqrt(Math.max(0, lac * lac - x * x));
    let s = 1;
    if (other) { const po = pos.get(other), so = (po[0] - pa[0]) * -uy + (po[1] - pa[1]) * ux; s = so > 0 ? -1 : 1; }
    pos.set(c, [pa[0] + ux * x - uy * y * s, pa[1] + uy * x + ux * y * s]);
  };
  const T0 = tris[0];
  pos.set(T0[0], [0, 0]); pos.set(T0[1], [0, len(sub(Q(T0[1]), Q(T0[0])))]);
  place(T0[0], T0[1], T0[2], null);
  const bends = [];
  for (let ti = 1; ti < tris.length; ti++) {
    const T = tris[ti], prev = tris[ti - 1];
    const other = prev.find(x => !T.includes(x));
    place(T[0], T[1], T[2], other);
    // gemeinsame Kante = Biegelinie (Abkanten), wenn die Facetten einen Knick haben
    if (fn[ti] && fn[ti - 1] && f.mode !== 'formed') {
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(fn[ti], fn[ti - 1])))) * 180 / Math.PI;
      if (ang > 0.25) bends.push({ a: pos.get(T[0]), b: pos.get(T[1]), label: `${ang.toFixed(1).replace('.', ',')}°` });
    }
  }
  const ring = [...Array(nA + 1).keys()].map(q => pos.get('a' + q)), ringB = [...Array(nB + 1).keys()].map(q => pos.get('b' + q)).reverse();
  const pts = [...ring, ...ringB];
  const edges = pts.map((p, q) => ({ type: 'line', a: p, b: pts[(q + 1) % pts.length], mid: null })).filter(e => Math.hypot(e.a[0] - e.b[0], e.a[1] - e.b[1]) > 1e-7);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bb = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  const flat = { contour: [{ edges }], holes: [], bends, bb, rule: { ...rule, t, k }, flanges: 0, t, nb: bends.length, faces: tris.length, skipped: 0 };
  return { shape, flat, info: `${tris.length} Facetten${f.mode === 'formed' ? ' (gerollt)' : `, ${bends.length} Biegelinien`} · Zuschnitt ${+(bb[1][0] - bb[0][0]).toFixed(1)} × ${+(bb[1][1] - bb[0][1]).toFixed(1)} mm` };
}

/* ---------- Elemente entfernen ----------
   OpenCASCADE-Defeaturing fehlt in der WASM-Fassung, daher eigene Werkzeuge je Fläche, berechnet am unveränderten Körper:
   Bohrung (ganzer Innenzylinder, ggf. mit Bohrspitze) → mit Zylinder füllen; Rundung (Teilzylinder zwischen zwei Ebenen)
   und Fase (schmale Ebene zwischen zwei Ebenen) → Keil bis zur scharfen Ecke ergänzen (außen) bzw. abziehen (innen). */
function solve3(A, b) {
  const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-12) return null;
  return [0, 1, 2].map(c => det(A.map((row, r) => row.map((v, cc) => (cc === c ? b[r] : v)))) / D);
}
function defeatureTools(b, picked, opts) {
  const faces = b.shape.faces, tools = [], skipped = [];
  const count = { holes: 0, fillets: 0, chamfers: 0 };
  const nb = (fc, e) => faces.find(o => { try { return o !== fc && !o.isSame(fc) && o.edges.some(x => x.isSame(e)); } catch (_) { return false; } });
  // Materialtest auf dem Volumenkörper (importierte Körper sind oft Verbund-Formen, dort scheitert der Schnitt still)
  let solidOf = b.shape;
  try { const sols = b.shape.solids; if (sols && sols.length === 1) solidOf = sols[0]; } catch (_) { /* wie gehabt */ }
  const solidAt = q => { try { const c2 = bool(solidOf.clone(), R.makeBox(q.map(v => v - 0.02), q.map(v => v + 0.02)), 'intersect'); return !!c2 && (safeVolume(c2) || 0) > 1e-8; } catch (_) { return false; } };
  const planeOf = fc => ({ n: norm(fc.normalAt().toTuple()), p: fc.center.toTuple() });
  // Keil im Schnitt senkrecht zu u: Ecke P der beiden Nachbarebenen, Profil prof (Punkte im Raum, in der Schnittebene), Länge L
  const wedge = (o, u, L, n1, p1, n2, p2, prof, testQ) => {
    const P = solve3([n1, n2, u], [dot(n1, p1), dot(n2, p2), dot(u, o)]);
    if (!P) return null;
    const pts = [P, ...prof];
    const solid = R.basicFaceExtrusion(R.makePolygon(pts), new R.Vector(mul(u, L)));
    // Prüfpunkt in der Mitte der Länge (am Ende kann das Teil schon aufhören)
    const Q = add(testQ(P), mul(u, L / 2));
    return { tool: solid, op: solidAt(Q) ? 'cut' : 'fuse' };
  };
  const handle = (fc, auto) => {
    try {
      if (fc.geomType === 'CYLINDRE') {
        const ci = cylinderInfo(fc), uv = fc.UVBounds, full = uv.uMax - uv.uMin >= 2 * Math.PI - 1e-3;
        if (full && ci.internal) {
          if (auto && !(auto.holes > 0 && 2 * ci.r <= auto.holes + 1e-9)) return;
          // Bereich entlang der Achse, Bohrspitze (Kegel) einschließen
          let t0 = 0, t1 = ci.L;
          fc.edges.forEach(e => { const o = nb(fc, e); if (o && o.geomType === 'CONE') { const bb = bbOf(o); [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => { const t = dot(sub([bb[i & 1][0], bb[(i >> 1) & 1][1], bb[(i >> 2) & 1][2]], ci.o), ci.a); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }); } });
          if (!(t1 - t0 > 1e-6)) { if (!auto) skipped.push('Bohrung ohne Länge'); return; }
          tools.push({ tool: R.makeCylinder(ci.r, t1 - t0, add(ci.o, mul(ci.a, t0)), ci.a), op: 'fuse' });
          count.holes++;
          return;
        }
        if (full) { if (!auto) skipped.push('Zapfen (Außenzylinder) wird nicht entfernt'); return; }
        // Rundung: gerade Randkanten parallel zur Achse, beiderseits ebene Nachbarflächen
        if (auto && !(auto.fillets > 0 && ci.r <= auto.fillets + 1e-9)) return;
        const side = fc.edges.filter(e => e.geomType === 'LINE' && Math.abs(Math.abs(dot(norm(sub(e.endPoint.toTuple(), e.startPoint.toTuple())), ci.a)) - 1) < 1e-6);
        const ns = side.map(e => nb(fc, e)).filter(Boolean);
        if (side.length !== 2 || ns.length !== 2 || ns.some(o => o.geomType !== 'PLANE')) { if (!auto) skipped.push(`Rundung R ${+ci.r.toFixed(3)} nicht zwischen zwei ebenen Flächen`); return; }
        const [A1, A2] = ns.map(planeOf);
        const T = pl => sub(ci.o, mul(pl.n, dot(sub(ci.o, pl.p), pl.n)));
        const T1 = T(A1), T2 = T(A2);
        const v1 = norm(sub(T1, ci.o)), v2 = norm(sub(T2, ci.o)), ang = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2))));
        const w = norm(sub(v2, mul(v1, dot(v1, v2)))), Rr = ci.r - 0.02, N = Math.max(4, Math.ceil(ang / (Math.PI / 24)));
        const arc = []; for (let i = 0; i <= N; i++) { const t = ang * i / N; arc.push(add(ci.o, add(mul(v1, Rr * Math.cos(t)), mul(w, Rr * Math.sin(t))))); }
        const mid = add(ci.o, mul(norm(add(v1, v2)), ci.r));
        const r = wedge(ci.o, ci.a, ci.L, A1.n, A1.p, A2.n, A2.p, [T1, ...arc.slice(1, -1), T2], P => mul(add(P, mid), 0.5));
        if (!r) { if (!auto) skipped.push('Rundung zwischen parallelen Flächen'); return; }
        tools.push(r); count.fillets++;
        return;
      }
      if (fc.geomType === 'PLANE' && !auto) {
        // Fase: zwei parallele gerade Randkanten, deren Nachbarn eben sind
        const L = fc.edges.filter(e => e.geomType === 'LINE');
        let pair = null;
        for (let i = 0; i < L.length && !pair; i++) for (let j = i + 1; j < L.length && !pair; j++) {
          const di = norm(sub(L[i].endPoint.toTuple(), L[i].startPoint.toTuple())), dj = norm(sub(L[j].endPoint.toTuple(), L[j].startPoint.toTuple()));
          if (Math.abs(Math.abs(dot(di, dj)) - 1) < 1e-6) {
            const a = nb(fc, L[i]), c = nb(fc, L[j]);
            // Nachbarebenen dürfen nicht parallel sein (sonst ist es das Paar der Stirnkanten)
            if (a && c && a.geomType === 'PLANE' && c.geomType === 'PLANE' && Math.abs(dot(norm(a.normalAt().toTuple()), norm(c.normalAt().toTuple()))) < 0.999) pair = [L[i], L[j], a, c, di];
          }
        }
        if (!pair) { skipped.push('ebene Fläche ist keine Fase zwischen zwei Ebenen'); return; }
        const [e1, e2, f1, f2, u] = pair;
        const o = e1.startPoint.toTuple(), Lh = R.measureLength(e1), A = o, B0 = e2.startPoint.toTuple();
        const B = sub(B0, mul(u, dot(sub(B0, o), u)));
        const A1 = planeOf(f1), A2 = planeOf(f2);
        // Achsrichtung so, dass die Extrusion von o aus entlang der Kante läuft
        const ue = dot(sub(e1.endPoint.toTuple(), o), u) >= 0 ? u : mul(u, -1);
        const r = wedge(o, ue, Lh, A1.n, A1.p, A2.n, A2.p, [A, B], P => mul(add(P, mul(add(A, B), 0.5)), 0.5));
        if (!r) { skipped.push('Fase zwischen parallelen Flächen'); return; }
        tools.push(r); count.chamfers++;
        return;
      }
      if (!auto) skipped.push(`Fläche (${fc.geomType}) wird nicht unterstützt`);
    } catch (err) { skipped.push(err.message); }
  };
  if (picked) picked.forEach(fc => handle(fc, null));
  if (opts && (opts.holes > 0 || opts.fillets > 0)) faces.forEach(fc => { if (!picked || !picked.some(p => { try { return p.isSame(fc); } catch (_) { return false; } })) handle(fc, opts); });
  return { tools, skipped, count };
}

/* ---------- Durch Biegung verbinden ----------
   Je eine gerade Endkante zweier Bleche. Im Schnitt senkrecht zur Kante: Mittellinien beider Bleche schneiden sich
   in P; Biegung mit Mittelradius r + t/2 tangential an beide; Bleche bis zu den Tangentenpunkten verlängern oder
   zurückschneiden; alles zu einem Körper. */
function plateEnd(b, e) {
  // an der Kante: große Seitenfläche (Blechnormale) und Stirnfläche (Endrichtung)
  const fs = b.shape.faces.filter(fc => { try { return fc.geomType === 'PLANE' && fc.edges.some(x => x.isSame(e)); } catch (_) { return false; } });
  if (fs.length !== 2) throw new Error('Kante liegt nicht zwischen Blechfläche und Stirnseite');
  const [side, rim] = fs.map(fc => ({ fc, a: R.measureArea(fc), n: norm(fc.normalAt().toTuple()) })).sort((x, y) => y.a - x.a);
  return { n: side.n, out: rim.n, p: e.startPoint.toTuple(), q: e.endPoint.toTuple() };
}
function joinByBend(f, bodies, rule) {
  const es = Array.isArray(f.edges) ? f.edges : [];
  if (es.length !== 2) throw new Error('Je eine Endkante beider Bleche anklicken');
  const hits = es.map(x => { const b = bodies.find(y => y.id === x.body) || bodies.find(y => findSel([y], 'edge', x.ref, y.id)); const h = b && findSel([b], 'edge', x.ref, b.id); return h ? { b, e: h.shape } : null; });
  if (hits.some(h => !h)) throw new Error('Gewählte Kante nicht mehr gefunden');
  if (hits[0].b === hits[1].b) throw new Error('Die Kanten müssen zu zwei verschiedenen Körpern gehören');
  if (hits.some(h => h.e.geomType !== 'LINE')) throw new Error('Nur gerade Kanten');
  // Biegeradius: aus der Blechregel oder eigener Wert (innen)
  const rr = f.ownR && Number(f.radius) >= 0 ? Number(f.radius) : Number(rule.r);
  const t = Number(rule.t) || 2, r = Math.max(0, rr || 0), Rm = r + t / 2;
  const [A, B] = hits.map(h => plateEnd(h.b, h.e));
  const u = norm(sub(A.q, A.p));
  if (Math.abs(Math.abs(dot(u, norm(sub(B.q, B.p)))) - 1) > 1e-6) throw new Error('Die Kanten müssen parallel sein');
  // Schnittebene: e1, e2 senkrecht zu u; 2D-Koordinaten bezogen auf A.p
  const e1 = norm(anyPerp(u)), e2 = cross(u, e1), O = A.p;
  const to2 = p => { const v = sub(p, O); return [dot(v, e1), dot(v, e2)]; }, d2 = v => [dot(v, e1), dot(v, e2)];
  const n2 = v => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  // Mittellinie: Kantenpunkt − n·t/2, Richtung ins Blech = −Stirnnormale
  const line = (P) => { const p = to2(add(P.p, mul(P.n, -t / 2))), dIn = n2(d2(mul(P.out, -1))), nn = n2(d2(P.n)); return { p, dIn, nn }; };
  const LA = line(A), LB = line(B);
  const cr = LA.dIn[0] * LB.dIn[1] - LA.dIn[1] * LB.dIn[0];
  if (Math.abs(cr) < 1e-6) throw new Error('Die Bleche sind parallel – keine Biegung möglich');
  // Schnittpunkt P der Mittellinien
  const w = [LB.p[0] - LA.p[0], LB.p[1] - LA.p[1]], sA = (w[0] * LB.dIn[1] - w[1] * LB.dIn[0]) / cr;
  const P = [LA.p[0] + LA.dIn[0] * sA, LA.p[1] + LA.dIn[1] * sA];
  const phi = Math.acos(Math.max(-1, Math.min(1, LA.dIn[0] * LB.dIn[0] + LA.dIn[1] * LB.dIn[1])));
  if (phi < 1e-3 || Math.PI - phi < 1e-3) throw new Error('Die Bleche liegen in einer Ebene oder sind parallel');
  const tl = Rm / Math.tan(phi / 2), bis = n2([LA.dIn[0] + LB.dIn[0], LA.dIn[1] + LB.dIn[1]]);
  const C = [P[0] + bis[0] * Rm / Math.sin(phi / 2), P[1] + bis[1] * Rm / Math.sin(phi / 2)];
  const T = L => [P[0] + L.dIn[0] * tl, P[1] + L.dIn[1] * tl];
  const sEnd = L => (L.p[0] - P[0]) * L.dIn[0] + (L.p[1] - P[1]) * L.dIn[1]; // Lage des Blechendes auf der Mittellinie
  // Ausdehnung entlang u: Überlappung beider Kanten
  const span = h => { const a = dot(h.p, u), b = dot(h.q, u); return [Math.min(a, b), Math.max(a, b)]; };
  const sa = span(A), sb = span(B), u0 = Math.max(sa[0], sb[0]), u1 = Math.min(sa[1], sb[1]);
  if (u1 - u0 < 1e-6) throw new Error('Die Kanten überlappen sich nicht');
  const base = add(O, mul(u, u0 - dot(O, u))), pl = () => new R.Plane(base, e1, u);
  // Punkt seitlich der Mittellinie (q = +1 außen, −1 innen bezogen auf den Biegemittelpunkt)
  const off = (L, s, q) => { const m = [P[0] + L.dIn[0] * s, P[1] + L.dIn[1] * s], nn = [-L.dIn[1], L.dIn[0]], sg = Math.sign((C[0] - m[0]) * nn[0] + (C[1] - m[1]) * nn[1]) || 1; return [m[0] - nn[0] * sg * q * t / 2, m[1] - nn[1] * sg * q * t / 2]; };
  const ends = [LA, LB].map(L => Math.max(sEnd(L), tl));
  const TA = T(LA), TB = T(LB), ang = p => Math.atan2(p[1] - C[1], p[0] - C[0]);
  const aA = ang(TA), aB = ang(TB);
  let da = aB - aA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const arcPt = (rad, a) => [C[0] + rad * Math.cos(a), C[1] + rad * Math.sin(a)];
  const Ro = Rm + t / 2, Ri = Rm - t / 2, am = aA + da / 2;
  // Umriss: außen am Blech A, Außenbogen, Blech B, innen zurück; Strecken der Länge 0 (Blech gekürzt) auslassen
  let last = off(LA, ends[0], 1), pen = R.draw(last);
  const to = q => { if (Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-7) { pen = pen.lineTo(q); last = q; } };
  const arcTo = (q, mid) => { pen = pen.threePointsArcTo(q, mid); last = q; };
  to(off(LA, tl, 1)); arcTo(off(LB, tl, 1), arcPt(Ro, am)); to(off(LB, ends[1], 1)); to(off(LB, ends[1], -1)); to(off(LB, tl, -1));
  if (Ri > 1e-6) arcTo(off(LA, tl, -1), arcPt(Ri, am)); else to(off(LA, tl, -1));
  if (Math.hypot(...[0, 1].map(i => off(LA, ends[0], -1)[i] - last[i])) > 1e-7) to(off(LA, ends[0], -1));
  const prof = pen.close();
  const bridge = prof.sketchOnPlane(pl()).extrude(u1 - u0);
  // Bleche, die über den Tangentenpunkt hinaus in die Biegung ragen, zurückschneiden
  let [bA, bB] = hits.map(h => h.b.shape);
  const trim = (shape, L) => {
    if (sEnd(L) >= tl - 1e-6) return shape;
    const big = 1e4, nn = [-L.dIn[1], L.dIn[0]];
    const Q = (s, k) => [P[0] + L.dIn[0] * s + nn[0] * k, P[1] + L.dIn[1] * s + nn[1] * k];
    let pn = R.draw(Q(tl, -t)); [Q(-big, -t), Q(-big, t), Q(tl, t)].forEach(q => { pn = pn.lineTo(q); });
    const cut = pn.close().sketchOnPlane(pl()).extrude(u1 - u0);
    return bool(shape, cut, 'cut') || shape;
  };
  bA = trim(bA, LA); bB = trim(bB, LB);
  const joined = tidy(bA.fuse(bridge).fuse(bB));
  return { shape: joined, keep: hits[0].b, drop: hits[1].b, info: `Biegung ${Math.round((Math.PI - phi) * 180 / Math.PI)}°, R ${+r.toFixed(2)} · Blech verlängert um ${+Math.max(0, sEnd(LA) - tl).toFixed(2)} / ${+Math.max(0, sEnd(LB) - tl).toFixed(2)} mm` };
}

/* ---------- Normteile (Schrauben, Muttern, Scheiben) ----------
   Lage: an einer Kreiskante (Bohrungsrand) – Kopf bzw. Auflage auf der ebenen Fläche, Schaft in die Bohrung –
   oder frei an einem Punkt mit Achse Z. w = Richtung aus dem Material heraus. */
function fastenerPlace(f, bodies) {
  let c = [Number(f.px) || 0, Number(f.py) || 0, Number(f.pz) || 0], w = [0, 0, 1];
  if (f.edge && f.edge.ref) {
    const b = bodies.find(x => x.id === f.edge.body) || bodies.find(x => findSel([x], 'edge', f.edge.ref, x.id));
    const h = b && findSel([b], 'edge', f.edge.ref, b.id);
    if (!h || h.shape.geomType !== 'CIRCLE') throw new Error('Bohrungsrand (Kreiskante) nicht mehr gefunden');
    const e = h.shape, p0 = e.pointAt(0).toTuple(), q1 = e.pointAt(0.3).toTuple(), q2 = e.pointAt(0.6).toTuple();
    c = circleCenter(p0, q1, q2);
    if (!c) throw new Error('Kreiskante ohne Mittelpunkt');
    const ax = norm(cross(sub(q1, p0), sub(q2, p0)));
    const pf = b.shape.faces.find(fc => { try { return fc.geomType === 'PLANE' && Math.abs(Math.abs(dot(norm(fc.normalAt().toTuple()), ax)) - 1) < 1e-6 && fc.edges.some(x => x.isSame(e)); } catch (_) { return false; } });
    w = pf ? norm(pf.normalAt().toTuple()) : ax;
  }
  if (f.flip) w = mul(w, -1);
  c = add(c, mul(w, Number(f.offset) || 0));
  return { c, w, x: norm(anyPerp(w)) };
}
function fastenerTool(f, bodies) {
  const K = FASTENERS[f.kind], D = fastenerDims(f.kind, f.size);
  if (!K || !D) throw new Error('Normteil oder Größe unbekannt');
  const d = nominal(f.size), L = Number(f.length);
  if (K.screw && !(L > 0)) throw new Error('Länge muss größer als 0 sein');
  const { c, w, x } = fastenerPlace(f, bodies);
  // Umdrehungsprofil (u radial, v entlang w) bzw. Prismen entlang w
  const rev = pts => { let pen = R.draw(pts[0]); pts.slice(1).forEach(q => { pen = pen.lineTo(q); }); return pen.close().sketchOnPlane(new R.Plane(c, x, mul(norm(cross(w, x)), -1))).revolve(w, { origin: c }); };
  const prism = (drw, v0, v1) => drw.sketchOnPlane(new R.Plane(add(c, mul(w, v0)), x, w)).extrude(v1 - v0);
  const hex = (s, v0, v1) => prism(R.drawPolysides(s / Math.sqrt(3), 6), v0, v1);
  let shape;
  if (f.kind === 'iso4762') {
    shape = rev([[0, D.k], [D.dk / 2, D.k], [D.dk / 2, 0], [d / 2, 0], [d / 2, -L], [0, -L]]);
    shape = shape.cut(hex(D.s, D.k - D.t, D.k + 1));
  } else if (f.kind === 'iso4017') {
    shape = hex(D.s, 0, D.k).fuse(rev([[0, 0.01], [d / 2, 0.01], [d / 2, -L], [0, -L]]));
  } else if (f.kind === 'iso10642') {
    const hc = (D.dk - d) / 2; // Senkung 90°: Höhe des Kegels
    shape = rev([[0, 0], [D.dk / 2, 0], [d / 2, -hc], [d / 2, -L], [0, -L]]);
    shape = shape.cut(hex(D.s, -D.t, 1));
  } else if (f.kind === 'iso4032') {
    shape = hex(D.s, 0, D.m).cut(prism(R.drawCircle(d / 2), -1, D.m + 1));
  } else if (f.kind === 'iso7089') {
    shape = rev([[D.d1 / 2, 0], [D.d2 / 2, 0], [D.d2 / 2, D.h], [D.d1 / 2, D.h]]);
  } else throw new Error('Normteil unbekannt');
  return { shape, label: fastenerLabel(f) };
}

/* ---------- Gewinde (modelliert, metrisch ISO) ---------- */
const ISO_COARSE = { M2: [2, 0.4], 'M2.5': [2.5, 0.45], M3: [3, 0.5], M4: [4, 0.7], M5: [5, 0.8], M6: [6, 1], M8: [8, 1.25], M10: [10, 1.5], M12: [12, 1.75], M14: [14, 2], M16: [16, 2], M20: [20, 2.5], M24: [24, 3] };
/* Zylinderfläche → Achse, Radius, Länge, innen/außen (pointOnSurface nimmt normierte Parameter) */
function cylinderInfo(face) {
  const P = (u, v) => face.pointOnSurface(u, v).toTuple();
  const a0 = P(0, 0), a1 = P(0.25, 0), a2 = P(0.5, 0), top = P(0, 1);
  const c = circleCenter(a0, a1, a2);
  if (!c) throw new Error('Zylinderachse nicht bestimmbar');
  const axis = sub(top, a0), L = len(axis);
  const n = face.normalAt(face.pointOnSurface(0, 0)).toTuple();
  return { o: c, a: norm(axis), L, r: len(sub(a0, c)), internal: dot(n, sub(a0, c)) < 0 };
}
/* Kegelfläche: Spitze A, Achse a (von der Spitze weg), halber Öffnungswinkel beta, Radius r(h) = h · tan beta (h = Abstand
   von der Spitze entlang a); internal = Normale zeigt zur Achse (Innenseite einer Biegung) */
function coneInfo(face) {
  const P = (u, v) => face.pointOnSurface(u, v).toTuple();
  const c0 = circleCenter(P(0, 0), P(0.25, 0), P(0.5, 0)), c1 = circleCenter(P(0, 1), P(0.25, 1), P(0.5, 1));
  if (!c0 || !c1) throw new Error('Kegelachse nicht bestimmbar');
  const r0 = len(sub(P(0, 0), c0)), r1 = len(sub(P(0, 1), c1)), L = len(sub(c1, c0));
  if (!(L > 1e-9) || Math.abs(r1 - r0) < 1e-9) throw new Error('Kegel nicht bestimmbar');
  let a = norm(sub(c1, c0));
  if (r1 < r0) a = mul(a, -1);                                   // Achse zeigt dorthin, wo der Kegel weiter wird
  const rs = Math.min(r0, r1), cs = r1 < r0 ? c1 : c0, tb = Math.abs(r1 - r0) / L;
  const A = sub(cs, mul(a, rs / tb));
  const p = P(0.5, 0.5), n = face.normalAt(face.pointOnSurface(0.5, 0.5)).toTuple(), v = sub(p, A);
  const rad = sub(v, mul(a, dot(v, a)));
  return { A, o: A, a, beta: Math.atan(tb), internal: dot(n, rad) < 0 };
}
/* Fläche verschieben mit schrägen Nachbarn (Fasen, Trapezflanken): Sind alle Kanten der Fläche gerade und
   alle Nachbarflächen eben, wandert jede Ecke entlang der Schnittgeraden ihrer beiden Nachbarebenen auf die neue Ebene –
   die Nachbarn laufen in ihrer eigenen Ebene weiter. Der Körper zwischen alter und neuer Fläche (Seiten in den
   Nachbarebenen, Löcher der Fläche abgezogen) kommt dazu oder fällt weg. null = nicht anwendbar (gekrümmte Nachbarn,
   gleich laufende Nachbarebenen an einer Ecke, neue Ebene schneidet die Fläche) → bisheriger Weg. */
function ersetzeEbeneNachbarn(shape, face, n, o2, n2) {
  const ebene = fc => ({ n: norm(fc.normalAt().toTuple()), c: fc.center.toTuple() });
  const alle = shape.faces;
  const nachbar = e => alle.find(fc => { try { return !fc.isSame(face) && fc.edges.some(x => x.isSame(e)); } catch (_) { return false; } });
  const schleifen = [];
  for (const w of face.wires) {
    const kanten = w.edges.map(e => ({ e, a: e.startPoint.toTuple(), b: e.endPoint.toTuple() }));
    if (kanten.some(k => k.e.geomType !== 'LINE')) return null;
    // Kanten zu einer Schleife verketten (die Reihenfolge des Drahts ist nicht zugesichert)
    const lauf = [kanten.shift()];
    while (kanten.length) {
      const end = lauf[lauf.length - 1].b;
      const i = kanten.findIndex(k => len(sub(k.a, end)) < 1e-6 || len(sub(k.b, end)) < 1e-6);
      if (i < 0) return null;
      const k = kanten.splice(i, 1)[0];
      lauf.push(len(sub(k.a, end)) < 1e-6 ? k : { ...k, a: k.b, b: k.a });
    }
    const pl = [];
    for (const k of lauf) { const nb = nachbar(k.e); if (!nb || nb.geomType !== 'PLANE') return null; pl.push(ebene(nb)); }
    const alt = lauf.map(k => k.a), neu = [];
    for (let i = 0; i < lauf.length; i++) {
      const p = pl[(i + lauf.length - 1) % lauf.length], q = pl[i]; // Ecke alt[i] liegt zwischen Kante i−1 und i
      if (len(cross(p.n, q.n)) < 1e-6) return null;
      const x = solve3([n2, p.n, q.n], [dot(n2, o2), dot(p.n, p.c), dot(q.n, q.c)]);
      if (!x) return null;
      neu.push(x);
    }
    schleifen.push({ alt, neu });
  }
  // Richtung: alle Ecken unter der neuen Ebene → Material dazu, alle darüber → weg, gemischt → bisheriger Weg
  const s = schleifen.flatMap(l => l.alt.map(p => dot(sub(p, o2), n2)));
  if (s.every(v => Math.abs(v) < 1e-9)) return shape;
  const dazu = s.every(v => v <= 1e-9), weg = s.every(v => v >= -1e-9);
  if (!dazu && !weg) return null;
  const koerper = ({ alt, neu }) => {
    const m = alt.length;
    for (let i = 0; i < m; i++) {
      // laufen die Nachbarn vor der neuen Ebene zusammen, kehrt sich eine Kante um – so weit geht es nicht
      const j = (i + 1) % m;
      if (dot(sub(neu[j], neu[i]), sub(alt[j], alt[i])) < -1e-9) throw new Error('So weit geht es nicht: die schrägen Nachbarflächen laufen vorher zusammen');
    }
    const faces = [R.makePolygon(alt), R.makePolygon(neu.slice().reverse())];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, q = [alt[i], alt[j], neu[j], neu[i]].filter((p, k, a) => len(sub(p, a[(k + 1) % a.length])) > 1e-9);
      if (q.length >= 3) faces.push(R.makePolygon(q));
    }
    let so = R.makeSolid(faces);
    if ((safeVolume(so) || 0) < 0) so = R.cast(so.wrapped.Reversed());
    return so;
  };
  // größte Schleife (in der Flächenebene gemessen) ist die Außenkontur, die übrigen sind Löcher
  const fl = l => len(l.alt.reduce((acc, p, i) => add(acc, cross(p, l.alt[(i + 1) % l.alt.length])), [0, 0, 0])) / 2;
  schleifen.sort((a, b) => fl(b) - fl(a));
  let werkzeug = koerper(schleifen[0]);
  schleifen.slice(1).forEach(l => { werkzeug = bool(werkzeug, koerper(l), 'cut'); });
  if (!werkzeug || !((Math.abs(safeVolume(werkzeug) || 0)) > 1e-9)) return null;
  return tidy(bool(shape, werkzeug, dazu ? 'fuse' : 'cut'));
}
/* Ebene Fläche auf eine neue Ebene (Punkt o2, Normale n2) setzen – Kern von „Fläche verschieben“: Über der Fläche
   (Säule entlang ihrer Normalen n) kommt Material bis zur neuen Ebene dazu, unter ihr fällt weg, was über der neuen Ebene
   liegt. Die Nachbarflächen laufen damit entlang n weiter – genau richtig, wenn sie senkrecht auf der Fläche stehen
   (prismatische Teile); schräge ebene Nachbarn verlängert `ersetzeEbeneNachbarn` entlang ihrer Ebene. */
function ersetzeEbene(shape, face, n, o2, n2, L) {
  try { const s2 = ersetzeEbeneNachbarn(shape, face, n, o2, n2); if (s2) return s2; } catch (err) { if (/So weit geht es nicht/.test(String(err && err.message))) throw err; /* sonst bisheriger Weg */ }
  const up = R.basicFaceExtrusion(face, new R.Vector(mul(n, L))), down = R.basicFaceExtrusion(face, new R.Vector(mul(n, -L)));
  const x = anyPerp(n2);
  const halb = von => R.drawRectangle(8 * L, 8 * L).sketchOnPlane(new R.Plane(von, x, n2)).extrude(L);
  const dazu = bool(up, halb(sub(o2, mul(n2, L))), 'intersect'), weg = bool(down, halb(o2), 'intersect');
  let s = shape;
  if (dazu && (safeVolume(dazu) || 0) > 1e-9) s = bool(s, dazu, 'fuse');
  if (weg && (safeVolume(weg) || 0) > 1e-9) s = bool(s, weg, 'cut');
  return tidy(s);
}
/* Drücken/Ziehen an einer Zylinderfläche: Ring bzw. Ringsektor zwischen altem und neuem Radius */
function cylPullTool(face, dist) {
  const ci = cylinderInfo(face);
  const out = ci.internal ? -1 : 1;              // Flächennormale zeigt bei Bohrungen zur Achse
  const r2 = ci.r + out * dist;
  if (!(r2 > 1e-6)) throw new Error(`So weit geht es nicht: der Radius (${ci.r.toFixed(2)} mm) würde 0 oder negativ`);
  const rin = Math.min(ci.r, r2), rout = Math.max(ci.r, r2);
  const uv = face.UVBounds, span = Math.min(2 * Math.PI, uv.uMax - uv.uMin);
  const p0 = face.pointOnSurface(0, 0).toTuple(), p1 = face.pointOnSurface(0.01, 0).toTuple();
  const e0 = norm(sub(p0, ci.o));
  const turn = dot(cross(e0, sub(p1, ci.o)), ci.a) >= 0 ? ci.a : mul(ci.a, -1);
  const pts = [add(ci.o, mul(e0, rin)), add(ci.o, mul(e0, rout)), add(add(ci.o, mul(e0, rout)), mul(ci.a, ci.L)), add(add(ci.o, mul(e0, rin)), mul(ci.a, ci.L))];
  const prof = R.makePolygon(pts);
  return R.revolution(prof, ci.o, turn, span >= 2 * Math.PI - 1e-6 ? 360 : span * 180 / Math.PI);
}
function threadSize(f, info) {
  if (f.size && f.size !== 'auto' && ISO_COARSE[f.size]) return f.size;
  const d = info.r * 2;
  let best = null, bd = Infinity;
  Object.entries(ISO_COARSE).forEach(([k, [D, P]]) => {
    const err = info.internal ? Math.min(Math.abs(d - (D - P)), Math.abs(d - D)) : Math.abs(d - D);
    if (err < bd) { bd = err; best = k; }
  });
  return best;
}
/* Gewindegang (lokal: Achse z, 0…L) und Wegnahme-Körper; der Gang liegt ohne Überlappung am Kern an */
function threadParts(D, P, L, internal, fit, rBody) {
  const big = D * 4 + L + 20;
  let pts, remove;
  if (!internal) {
    const Rmaj = D / 2 - fit, core = Rmaj - 0.6134 * P, hb = 0.4999 * P, hc = 0.0625 * P;
    remove = R.makeCylinder(Math.max(rBody, Rmaj) + 0.3, L).cut(R.makeCylinder(core, L));
    pts = [[core, -hb], [Rmaj, -hc], [Rmaj, hc], [core, hb]].reverse();
  } else {
    const Rmaj = D / 2 + fit, rmin = D / 2 - 0.5413 * P + fit, hb = 0.4999 * P, hc = 0.125 * P;
    if (rBody > Rmaj + 1e-6) throw new Error('Die Bohrung ist größer als das Gewinde');
    remove = R.makeCylinder(Rmaj, L);
    pts = [[Rmaj, -hb], [rmin, -hc], [rmin, hc], [Rmaj, hb]];
  }
  let pen = R.draw(pts[0]); pts.slice(1).forEach(q => { pen = pen.lineTo(q); });
  const prof = pen.close().sketchOnPlane(new R.Plane([0, 0, -P], [1, 0, 0], [0, -1, 0])).wire;
  const helix = R.makeHelix(P, L + 2 * P, D / 2, [0, 0, -P], [0, 0, 1], !!(this && this.left));
  let ridge = R.genericSweep(prof, helix, { frenet: true });
  ridge = ridge.cut(R.makeBox([-big, -big, -big], [big, big, 0])).cut(R.makeBox([-big, -big, L], [big, big, big]));
  return { ridge, remove };
}
/* Feder / Spirale: Querschnitt in der Achsebene entlang einer Schraubenlinie.
   Lokal: Achse z ab 0, Start auf +x. Maße in mm. */
/* Grundkörper (Quader, Zylinder, Kugel, Torus) auf einer Ebene um einen Mittelpunkt */
function primTool(f, planes) {
  const mpl = f.plane || { kind: 'origin', key: 'XY' };
  const pl = mpl.kind === 'face' ? mpl.plane : mpl.kind === 'plane' ? planes.get(mpl.id) : ORIGIN[mpl.key || 'XY'];
  if (!pl) throw new Error('Die Basisebene fehlt');
  const n = norm(f.flip ? mul(pl.n, -1) : pl.n), x = norm(pl.x);
  const c = add(pl.o, add(mul(pl.x, Number(f.cx) || 0), mul(pl.y, Number(f.cy) || 0)));
  const P = (cc, xd, nd) => new R.Plane(cc, xd, nd);
  const pos = v => { if (!(Number(v) > 0)) throw new Error('Maße müssen größer als 0 sein'); return Number(v); };
  if (f.kind === 'cylinder') return R.drawCircle(pos(f.d) / 2).sketchOnPlane(P(c, x, n)).extrude(pos(f.h));
  if (f.kind === 'sphere') return R.makeSphere(pos(f.d) / 2).translate(...c);
  if (f.kind === 'torus') {
    const Rm = pos(f.d) / 2, r = pos(f.d2) / 2;
    if (r >= Rm) throw new Error('Der Rohrdurchmesser muss kleiner als der Torusdurchmesser sein');
    return R.drawCircle(r).translate(Rm, 0).sketchOnPlane(P(c, x, mul(norm(cross(n, x)), -1))).revolve(n, { origin: c });
  }
  return R.drawRectangle(pos(f.w), pos(f.l)).sketchOnPlane(P(c, x, n)).extrude(pos(f.h));
}
function coilTool(f, planes) {
  const mpl = f.plane || { kind: 'origin', key: 'XY' };
  const pl = mpl.kind === 'face' ? mpl.plane : mpl.kind === 'plane' ? planes.get(mpl.id) : ORIGIN[mpl.key || 'XY'];
  if (!pl) throw new Error('Die Basisebene fehlt');
  const D = Number(f.diameter), s = Number(f.size), sec = f.section || 'circle';
  let P = Number(f.pitch), N = Number(f.turns);
  /* Arten: Windungen + Steigung (Vorgabe), Windungen + Höhe, Höhe + Steigung (Windungen = Höhe / Steigung)
     und flache Spirale (Steigung = Abstand je Windung nach außen, in der Basisebene) */
  const spiral = f.mode === 'spiral';
  if (f.mode === 'hp') {
    const Hh = Number(f.height) - (f.flat ? 2 * s * 1.02 : 0);
    if (!(P > 0) || !(Hh > 0)) throw new Error(f.flat ? 'Die Höhe reicht nicht für die geschlossenen Endwindungen' : 'Höhe und Steigung müssen größer als 0 sein');
    N = Hh / P;
  }
  if (!(D > 0) || !(s > 0) || !(N > 0)) throw new Error('Durchmesser, Querschnitt und Windungen müssen größer als 0 sein');
  const pos = f.pos || 'center';
  const r0 = pos === 'inside' ? D / 2 - s / 2 : pos === 'outside' ? D / 2 + s / 2 : D / 2;
  if (r0 - s / 2 <= 1e-6) throw new Error('Der Querschnitt ist zu groß für den Durchmesser');
  // geschlossene Endwindung (Druckfeder): Steigung knapp über der Drahtstärke
  const c = s * 1.02;
  if (f.mode === 'height') P = (Number(f.height) - (f.flat ? 2 * c : 0)) / N;
  if (spiral && P < s * 1.0001) throw new Error(`Der Abstand je Windung (${(P || 0).toFixed(2)} mm) ist kleiner als der Querschnitt – die Windungen würden sich berühren`);
  if (!(P > 0)) throw new Error(f.flat ? 'Die Höhe reicht nicht für die geschlossenen Endwindungen' : 'Steigung bzw. Höhe muss größer als 0 sein');
  if (P < s * 1.0001) throw new Error(`Die Steigung (${P.toFixed(2)} mm) ist kleiner als der Querschnitt – die Windungen würden sich durchdringen`);
  // Querschnitt in der x-z-Ebene um (r0, 0)
  let d;
  if (sec === 'square') d = R.drawRectangle(s, s).translate(r0, 0);
  else if (sec === 'tri_out' || sec === 'tri_in') {
    const h = s * Math.sqrt(3) / 2, k = sec === 'tri_out' ? 1 : -1;
    d = R.draw([r0 - k * h / 3, -s / 2]).lineTo([r0 + k * 2 * h / 3, 0]).lineTo([r0 - k * h / 3, s / 2]).close();
  } else d = R.drawCircle(s / 2).translate(r0, 0);
  const sweep = (pitch, height, z0, rot) => {
    const prof = d.sketchOnPlane(new R.Plane([0, 0, 0], [1, 0, 0], [0, -1, 0])).wire;
    let sh = R.genericSweep(prof, R.makeHelix(pitch, height, r0, [0, 0, 0], [0, 0, 1], !!f.left), { frenet: true });
    if (rot) sh = sh.rotate(rot, [0, 0, 0], [0, 0, 1]);
    return z0 ? sh.translate(0, 0, z0) : sh;
  };
  let coil, H, wire;
  if (spiral) {
    // archimedische Spirale r = r0 + P·φ/2π in der Ebene z = 0 (Drehrichtung wie bei der Schraube), Querschnitt entlang gezogen
    const sg = f.left ? -1 : 1, n = Math.max(12, Math.ceil(N * 24)), pts = [];
    for (let k = 0; k <= n; k++) { const ph = 2 * Math.PI * N * k / n, rr = r0 + P * ph / (2 * Math.PI); pts.push([rr * Math.cos(ph), sg * rr * Math.sin(ph), 0]); }
    const path = R.assembleWire([R.makeBSplineApproximation(pts, { tolerance: 1e-4, degMax: 5 })]);
    // Querschnitt senkrecht zur Anfangstangente (radial nach außen = x des Querschnitts), dann V = Fläche · Bogenlänge
    const t0 = norm([P / (2 * Math.PI), sg * r0, 0]), rx = norm(sub([1, 0, 0], mul(t0, dot([1, 0, 0], t0))));
    coil = R.genericSweep(d.translate(-r0, 0).sketchOnPlane(new R.Plane([r0, 0, 0], rx, mul(t0, -1))).wire, path, { frenet: true });
    H = s;
    // Bogenlänge numerisch: ∫ √(r² + (P/2π)²) dφ
    const a = P / (2 * Math.PI), m = 2000;
    wire = 0;
    for (let k = 0; k < m; k++) { const ph = 2 * Math.PI * N * (k + 0.5) / m, rr = r0 + a * ph; wire += Math.hypot(rr, a) * 2 * Math.PI * N / m; }
  } else if (f.flat) {
    // Enden geschlossen (je eine Windung mit Steigung ≈ Drahtstärke) und plan geschliffen
    const sign = f.left ? -1 : 1, frac = N - Math.floor(N);
    const mid = sweep(P, P * N, c);
    const bot = sweep(c, c, 0), top = sweep(c, c, c + P * N, sign * frac * 360);
    H = 2 * c + P * N;
    coil = bot.fuse(mid).fuse(top);
    const big = D * 2 + s * 4 + 10;
    coil = coil.cut(R.makeBox([-big, -big, -big], [big, big, 0])).cut(R.makeBox([-big, -big, H], [big, big, H + big]));
    wire = 2 * Math.hypot(2 * Math.PI * r0, c) + N * Math.hypot(2 * Math.PI * r0, P);
  } else {
    H = P * N;
    coil = sweep(P, H, 0);
    wire = N * Math.hypot(2 * Math.PI * r0, P);
  }
  // in die Basisebene legen: z → Normale, x → Ebenen-x, Mitte um (cx, cy) in der Ebene verschoben
  const n = norm(pl.n), x = pl.x ? norm(pl.x) : frameX(n), y = cross(n, x);
  const ang = Number(f.angle) || 0;
  if (ang) coil = coil.rotate(ang, [0, 0, 0], [0, 0, 1]);
  const o = add(add(pl.o, mul(x, Number(f.cx) || 0)), mul(y, Number(f.cy) || 0));
  const flipN = f.flip ? -1 : 1;
  // Drehung z→n und x→x über zwei Schritte
  let t = coil;
  const z = [0, 0, 1], nn = mul(n, flipN);
  const cz = dot(z, nn);
  let rx = [1, 0, 0];
  if (cz < 1 - 1e-9) {
    let ax = cross(z, nn);
    ax = len(ax) < 1e-9 ? [1, 0, 0] : norm(ax);
    const a = Math.acos(Math.max(-1, Math.min(1, cz)));
    t = t.rotate(a * 180 / Math.PI, [0, 0, 0], ax);
    rx = rotVec([1, 0, 0], ax, a);
  }
  // danach x in der Ebene ausrichten (Drehung um die Normale)
  const xa = Math.atan2(dot(cross(rx, x), nn), dot(rx, x));
  if (Math.abs(xa) > 1e-9) t = t.rotate(xa * 180 / Math.PI, [0, 0, 0], nn);
  return { tool: t.translate(...o), info: spiral ? `Flache Spirale · ${+N.toFixed(3)} Windungen · ${P.toFixed(2)} mm je Windung · Außen-⌀ ${(2 * (r0 + P * N) + s).toFixed(2)} mm · Drahtlänge ≈ ${wire.toFixed(1)} mm`
    : `${f.mode === 'hp' ? `${+N.toFixed(3)} Windungen · ` : ''}Steigung ${P.toFixed(2)} mm · Höhe ${H.toFixed(2)} mm${f.flat ? ` (mit 2 geschlossenen Endwindungen)` : ''} · Drahtlänge ≈ ${wire.toFixed(0)} mm` };
}
function rotVec(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v);
  return [0, 1, 2].map(i => v[i] * c + kv[i] * s + k[i] * kd * (1 - c));
}
function placeLocal(shape, info) {
  const z = [0, 0, 1], c = dot(z, info.a);
  let s = shape;
  if (c < 1 - 1e-9) {
    let ax = cross(z, info.a);
    ax = len(ax) < 1e-9 ? [1, 0, 0] : norm(ax);
    s = s.rotate(Math.acos(Math.max(-1, c)) * 180 / Math.PI, [0, 0, 0], ax);
  }
  return s.translate(...info.o);
}

/* ---------- Auswahl über Geometrie wiederfinden ---------- */
function edgeMatcher(refs) {
  return el => {
    const t = el.geomType;
    return refs.some(r => {
      if (r.t === 'LINE' && t === 'LINE') {
        const a = el.startPoint.toTuple(), b = el.endPoint.toTuple();
        const L = len(sub(b, a));
        if (L < 1e-9) return false;
        const d = mul(sub(b, a), 1 / L);
        if (Math.abs(Math.abs(dot(d, r.d)) - 1) > 1e-6) return false;
        const ap = sub(r.p, a), tp = dot(ap, d);
        return len(sub(ap, mul(d, tp))) < 1e-4 && tp > -1e-4 && tp < L + 1e-4;
      }
      if (r.t === 'LINE' || t === 'LINE') return false;
      return len(sub(el.pointAt(0.5).toTuple(), r.p)) < 1e-3;
    });
  };
}
function faceMatcher(refs) {
  return el => {
    const t = el.geomType;
    return refs.some(r => {
      if (r.t === 'PLANE' && t === 'PLANE') {
        const n = el.normalAt().toTuple();
        if (dot(n, r.n) < 1 - 1e-6) return false;
        return Math.abs(dot(n, el.center.toTuple()) - r.dist) < 1e-4;
      }
      if (r.t === 'PLANE' || t === 'PLANE') return false;
      if (len(sub(el.center.toTuple(), r.p)) >= 1e-3) return false;
      if (r.r != null && t === 'CYLINDRE') { try { return Math.abs(cylinderInfo(el).r - r.r) < 1e-3; } catch (_) { return false; } }
      return true;
    });
  };
}

/* Fläche/Kante zu einem Bezug finden: optional auf einen Körper beschränkt, bei mehreren Treffern die nächste zum Bezugspunkt.
   Passt nichts exakt (weil sich frühere Maße geändert haben), wird die ähnlichste Fläche/Kante gleicher Art und Richtung
   genommen und der Bezug nachgeführt (refMap → Oberfläche schreibt ihn ins Dokument zurück). */
let refMap = new Map();
let ptMap = {};
/* Körper mit Freiform-Sweeps (Spirale/Feder, auch gemustert/gespiegelt): die exakte Verdeckt-Kanten-Rechnung (HLRBRep)
   braucht dafür Minuten. In der Zeichnung werden sie deshalb aus dem Netz gezeichnet (meshProjection). */
let heavyIds = new Set(); // Feature-ID → nachgeführte Basis (Punkte), geht an die Oberfläche zurück
const r9 = v => Math.round(v * 1e9) / 1e9;
function freshRef(kind, s) {
  if (kind === 'edge') {
    const mid = s.pointAt(0.5).toTuple().map(r9);
    if (s.geomType === 'LINE') return { t: 'LINE', p: mid, d: norm(sub(s.endPoint.toTuple(), s.startPoint.toTuple())).map(r9) };
    return { t: s.geomType, p: mid };
  }
  const c = s.center.toTuple().map(r9);
  if (s.geomType === 'PLANE') { const n = s.normalAt().toTuple().map(r9); return { t: 'PLANE', n, dist: r9(dot(n, c)), p: c }; }
  const out = { t: s.geomType, p: c };
  if (s.geomType === 'CYLINDRE') { try { out.r = r9(cylinderInfo(s).r); } catch (_) { /* egal */ } }
  return out;
}
function fuzzyScore(kind, ref, s) {
  const t = s.geomType;
  if (kind === 'edge') {
    if ((ref.t === 'LINE') !== (t === 'LINE')) return Infinity;
    if (t === 'LINE') {
      const a = s.startPoint.toTuple(), b = s.endPoint.toTuple(), L = len(sub(b, a));
      if (L < 1e-9 || !ref.d) return Infinity;
      const d = mul(sub(b, a), 1 / L);
      if (Math.abs(Math.abs(dot(d, ref.d)) - 1) > 1e-6) return Infinity;
      const ap = sub(ref.p, a), tp = dot(ap, d), perp = len(sub(ap, mul(d, tp)));
      return perp + Math.max(0, -tp, tp - L) * 0.5;
    }
    if (ref.t && ref.t !== t) return Infinity;
    return len(sub(s.pointAt(0.5).toTuple(), ref.p));
  }
  if ((ref.t === 'PLANE') !== (t === 'PLANE')) return Infinity;
  if (t === 'PLANE') {
    const n = s.normalAt().toTuple();
    if (dot(n, ref.n) < 1 - 1e-6) return Infinity;
    const c = s.center.toTuple();
    return Math.abs(dot(n, c) - ref.dist) + (ref.p ? 0.2 * len(sub(c, ref.p)) : 0);
  }
  if (ref.t && ref.t !== t) return Infinity;
  let sc = ref.p ? len(sub(s.center.toTuple(), ref.p)) : 0;
  if (ref.r != null && t === 'CYLINDRE') { try { sc += 2 * Math.abs(cylinderInfo(s).r - ref.r); } catch (_) { return Infinity; } }
  return sc;
}
function findSel(bodies, kind, ref, bodyId) {
  const m = kind === 'edge' ? edgeMatcher([ref]) : faceMatcher([ref]);
  let best = null, bd = Infinity;
  const pool = bodyId && bodies.some(b => b.id === bodyId) ? bodies.filter(b => b.id === bodyId) : bodies;
  for (const b of pool) {
    for (const s of (kind === 'edge' ? b.shape.edges : b.shape.faces)) {
      if (!m(s)) continue;
      let d = 0;
      try { d = ref.p ? len(sub(kind === 'edge' ? s.pointAt(0.5).toTuple() : s.center.toTuple(), ref.p)) : 0; } catch (_) { d = 0; }
      if (d < bd) { bd = d; best = { shape: s, body: b }; }
    }
  }
  if (best || !ref) return best;
  // unscharfe Suche
  let fb = null, fs = Infinity;
  const bbs = pool.map(b => bbOf(b.shape));
  const diag = bbs.length ? Math.max(...bbs.map(q => len(sub(q[1], q[0])))) : 100;
  const tol = Math.max(10, 0.6 * diag);
  for (const b of pool) {
    for (const s of (kind === 'edge' ? b.shape.edges : b.shape.faces)) {
      let sc;
      try { sc = fuzzyScore(kind, ref, s); } catch (_) { sc = Infinity; }
      if (sc < fs) { fs = sc; fb = { shape: s, body: b }; }
    }
  }
  if (!fb || fs > tol) return null;
  try { refMap.set(JSON.stringify(ref), freshRef(kind, fb.shape)); } catch (_) { /* egal */ }
  return fb;
}
/* Bezugsliste auflösen (exakt oder nachgeführt) → frische Bezüge für die strengen Matcher */
/* Mitgeführte Punkte (Arbeitspunkt, Ebene durch drei Punkte, Achse durch zwei Punkte):
   r = { e: Kantenbezug, at: 'end' | 'mid' | 'center' } oder { pt: Arbeitspunkt-ID }; old = bisherige Lage */
function trackPt(r, old, bodies, wpts) {
  if (!r) return null;
  if (r.pt) return wpts.get(r.pt) || null;
  if (!r.e) return null;
  const h = findSel(bodies, 'edge', r.e);
  if (!h) return null;
  const e = h.shape;
  if (r.at === 'mid') return e.pointAt(0.5).toTuple();
  if (r.at === 'center') return circleCenter(e.pointAt(0).toTuple(), e.pointAt(0.25).toTuple(), e.pointAt(0.5).toTuple());
  const a = e.startPoint.toTuple(), b = e.endPoint.toTuple();
  return !old || len(sub(a, old)) <= len(sub(b, old)) ? a : b;
}
/* Punkte einer Basis nachführen; true, wenn sich etwas bewegt hat */
function trackBase(b, bodies, wpts) {
  let moved = false;
  const upd = (r, old) => { const p = trackPt(r, old, bodies, wpts); if (!p) return old; const q = p.map(v => Math.round(v * 1e9) / 1e9); if (!old || len(sub(q, old)) > 1e-9) moved = true; return q; };
  if (Array.isArray(b.refs) && Array.isArray(b.pts)) b.pts = b.pts.map((p, i) => upd(b.refs[i], p));
  if (b.ref && Array.isArray(b.p)) b.p = upd(b.ref, b.p);
  return moved;
}
function resolveRefs(bodies, kind, refs) {
  return (refs || []).map(r => { const h = findSel(bodies, kind, r); try { return h ? freshRef(kind, h.shape) : r; } catch (_) { return r; } });
}

/* ---------- Blech (Blechregel, Lasche, Lasche an Kante) ---------- */
const DEFAULT_SHEET_RULE = { t: 2, r: 2, k: 0.44 };
let sheetRule = { ...DEFAULT_SHEET_RULE };

/* ---------- In Blech umwandeln: beliebigen Körper gleicher Dicke abwickeln ----------
   Von der festen ebenen Fläche aus werden alle Flächen derselben Blechseite (Gegenfläche im Abstand t) über gemeinsame
   Kanten besucht. Zylinder = Biegung (neutrale Faser r + k·t), scharfe Kanten = Biegung mit r = 0, Ringschlüsse = Trennkanten. */
const rigidI = () => ({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], T: [0, 0, 0] });
const rgApply = (M, p) => [0, 1, 2].map(i => M.R[i][0] * p[0] + M.R[i][1] * p[1] + M.R[i][2] * p[2] + M.T[i]);
const rgVec = (M, v) => [0, 1, 2].map(i => M.R[i][0] * v[0] + M.R[i][1] * v[1] + M.R[i][2] * v[2]);
const rgComp = (A, B) => ({ R: [0, 1, 2].map(i => [0, 1, 2].map(j => A.R[i][0] * B.R[0][j] + A.R[i][1] * B.R[1][j] + A.R[i][2] * B.R[2][j])), T: add(rgVec(A, B.T), A.T) });
function rgRot(o, a, ang) {
  const [x, y, z] = norm(a), c = Math.cos(ang), s = Math.sin(ang), C = 1 - c;
  const R = [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
  const M = { R, T: [0, 0, 0] };
  M.T = sub(o, rgVec(M, o));
  return M;
}
const rgMove = v => ({ R: rigidI().R, T: v.slice() });
/* Linienzüge an gemeinsamen Endpunkten zu einem geschlossenen Umriss verketten */
function chainPolylines(polys) {
  const left = polys.filter(p => p.length > 1).map(p => p.slice());
  if (!left.length) return [];
  const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const out = left.shift();
  while (left.length) {
    const end = out[out.length - 1];
    let bi = -1, rev = false, bd = 1e-3;
    left.forEach((p, i) => { const da = d2(p[0], end), db = d2(p[p.length - 1], end); if (da < bd) { bd = da; bi = i; rev = false; } if (db < bd) { bd = db; bi = i; rev = true; } });
    if (bi < 0) break;
    const p = left.splice(bi, 1)[0];
    (rev ? p.reverse() : p).slice(1).forEach(q => out.push(q));
  }
  if (out.length > 1 && d2(out[0], out[out.length - 1]) < 1e-3) out.pop();
  return out;
}
/* starre Abbildung {R, T} auf einen Körper anwenden (Drehung um den Ursprung, dann Verschiebung) */
function rigidShape(shape, M) {
  const Q = M.R, tr = Q[0][0] + Q[1][1] + Q[2][2], ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  let s = shape;
  if (ang > 1e-12) {
    let ax;
    if (Math.PI - ang > 1e-6) ax = norm([Q[2][1] - Q[1][2], Q[0][2] - Q[2][0], Q[1][0] - Q[0][1]]);
    else {
      // 180°: Achse aus der Diagonale
      const xx = Math.sqrt(Math.max(0, (Q[0][0] + 1) / 2)), yy = Math.sqrt(Math.max(0, (Q[1][1] + 1) / 2)), zz = Math.sqrt(Math.max(0, (Q[2][2] + 1) / 2));
      ax = xx >= yy && xx >= zz ? [xx, Q[0][1] / (2 * xx), Q[0][2] / (2 * xx)] : yy >= zz ? [Q[0][1] / (2 * yy), yy, Q[1][2] / (2 * yy)] : [Q[0][2] / (2 * zz), Q[1][2] / (2 * zz), zz];
      ax = norm(ax);
    }
    s = s.rotate(ang * 180 / Math.PI, [0, 0, 0], ax);
  }
  if (len(M.T) > 1e-12) s = s.translate(...M.T);
  return s;
}
/* Umriss um d nach außen versetzen (Gehrungsecken, auf 3·d begrenzt) */
function offsetPoly(P, d) {
  let A = 0;
  P.forEach((p, i) => { const q = P[(i + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; });
  const sg = A >= 0 ? 1 : -1, N = P.length;
  const nrm = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [sg * dy / l, -sg * dx / l]; };
  return P.map((p, i) => {
    const n1 = nrm(P[(i - 1 + N) % N], p), n2 = nrm(p, P[(i + 1) % N]);
    const c = 1 + n1[0] * n2[0] + n1[1] * n2[1], k = c > 1e-6 ? Math.min(3, 1 / c * 1) : 0;
    const m = c > 1e-6 ? [(n1[0] + n2[0]) * k, (n1[1] + n2[1]) * k] : n2;
    return [p[0] + m[0] * d, p[1] + m[1] * d];
  });
}
const rgInv = M => { const Rt = [0, 1, 2].map(i => [0, 1, 2].map(j => M.R[j][i])); return { R: Rt, T: mul([0, 1, 2].map(i => Rt[i][0] * M.T[0] + Rt[i][1] * M.T[1] + Rt[i][2] * M.T[2]), -1) }; };
/* Zurückfalten: was im flachen Zustand weggeschnitten wurde, auf das gebogene Teil übertragen.
   Ebene Flächen starr zurück, Biegungen in schmalen Winkelscheiben (je ≤ 3°) starr um ihre Mitte. */
function refoldCuts(U, current) {
  const fr = U.frame, t = U.t, n = fr.n;
  const removed = bool(U.flat0.clone(), current.clone(), 'cut');
  const rv = removed ? safeVolume(removed) || 0 : 0;
  const added = bool(current.clone(), U.flat0.clone(), 'cut'), av = added ? safeVolume(added) || 0 : 0;
  if (rv < 1e-6) return { shape: U.folded, pieces: 0, added: av > 1e-6 };
  // durchgehende Schnitte über die Blechflächen hinaus verlängern (saubere Schnitte nach dem Biegen)
  const P3 = (q, h) => add(add(add(fr.O, mul(fr.xd, q[0])), mul(fr.yd, q[1])), mul(n, h));
  let src = removed;
  try {
    let sols = removed.solids; if (!sols || !sols.length) sols = [removed];
    const ext = sols.map(s => {
      const bb = bbOf(s), cs = [0, 1, 2, 3, 4, 5, 6, 7].map(i => dot([bb[i & 1][0], bb[(i >> 1) & 1][1], bb[(i >> 2) & 1][2]], n));
      if (Math.max(...cs) - Math.min(...cs) < t - 1e-4) return s;
      return [s.clone().translate(...mul(n, 0.6)), s.clone().translate(...mul(n, -0.6))].reduce((acc, x) => acc.fuse(x), s);
    });
    src = ext.length === 1 ? ext[0] : R.makeCompound(ext);
  } catch (_) { src = removed; }
  const prism = pts2 => R.basicFaceExtrusion(R.makePolygon(pts2.map(q => P3(q, 1.5))), new R.Vector(mul(n, -(t + 3))));
  const tools = [];
  let planarHit = 0;
  const take = (piece, M) => { if (piece && (safeVolume(piece) || 0) > 1e-9) tools.push(rigidShape(piece, rgInv(M))); };
  U.zones.forEach(z => {
    const A = z.A || z.M; // bei teilweiser Abwicklung: Lage der Zone im teilgeöffneten Zustand
    if (z.kind === 'c' && z.keep) {
      // Biegung bleibt stehen: ihre Ecke liegt an Ort und Stelle, also als ein Stück zurückschneiden
      const tool = bendCornerTool(z, t);
      if (!tool) return;
      take(bool(src.clone(), tool, 'intersect'), A);
      return;
    }
    let zp;
    // leicht vergrößert, damit sich die Stücke an den Zonengrenzen (Biegelinien) überlappen
    try { zp = prism(offsetPoly(z.pts2, 0.1)); } catch (_) { return; }
    if (U.kept) zp = rigidShape(zp, rgComp(A, rgInv(z.M)));
    const inZone = bool(src.clone(), zp, 'intersect');
    if (!inZone || (safeVolume(inZone) || 0) < 1e-9) return;
    if (z.kind === 'p') { planarHit++; take(inZone, A); return; }
    const c = z.cyl;
    if (!c || !(c.th > 1e-9)) return;
    const N = Math.max(1, Math.ceil(c.th / (3 * Math.PI / 180))), dphi = c.th / N;
    const W = rgVec(A, c.w), P0 = rgApply(A, c.A), ax = norm(rgVec(A, c.a));
    const eps = Math.max(0.02, (c.Rn + t + 1 - c.Rn) * dphi * 0.6);
    for (let kk = 0; kk < N; kk++) {
      const p0 = c.th * kk / N, p1 = c.th * (kk + 1) / N, pm = (p0 + p1) / 2;
      // Scheibe senkrecht zu W zwischen Rn·p0 und Rn·p1 (etwas überlappend)
      const big = 1e4, a0 = c.Rn * p0 - eps, a1 = c.Rn * p1 + eps;
      const C = (u, v) => add(add(P0, mul(W, u)), mul(ax, v));
      const slab = R.basicFaceExtrusion(R.makePolygon([add(C(a0, -big), mul(n, big)), add(C(a1, -big), mul(n, big)), add(C(a1, big), mul(n, big)), add(C(a0, big), mul(n, big))]), new R.Vector(mul(n, -2 * big)));
      const piece = bool(inZone.clone(), slab, 'intersect');
      const G = rgComp(rgMove(mul(c.w, c.Rn * pm)), rgRot(c.o, c.a, -c.s * pm));
      take(piece, rgComp(A, G));
    }
  });
  let shape = U.folded;
  tools.forEach(tl => { const r = bool(shape, tl, 'cut'); if (r) shape = r; });
  // bei scharfen Kanten (Radius 0) überlappen die Flächenbilder; ein Schnitt über die Kante ist dann nur angenähert
  return { shape, pieces: tools.length, added: av > 1e-6, approx: U.sharp > 0 && planarHit > 1 };
}
/* Bereich einer Biegungsecke im teilgeöffneten Zustand: zwischen den Radial-Ebenen am Bogenanfang
   und -ende, begrenzt auf die unmittelbare Umgebung der Biegung. A = Lage der Biegung. */
function bendCornerTool(z, t) {
  const c = z.cyl, A = z.A || z.M;
  if (!c || !(c.th > 1e-9)) return null;
  const big = 1e4, rr = c.Rn + t + 2;
  const o = rgApply(A, c.o), a = norm(rgVec(A, c.a));
  const w0 = norm(rgVec(A, c.w)), w1 = norm(rgVec(rgRot(c.o, c.a, c.s * c.th), c.w));
  const blk = (p, v, h, hz) => {
    const u1 = anyPerp(v), u2 = cross(v, u1);
    return rigidShape(R.makeBox([-h, -h, 0], [h, h, hz]), { R: [0, 1, 2].map(i => [u1[i], u2[i], v[i]]), T: p });
  };
  let tool = bool(blk(o, w0, big, big), blk(o, mul(w1, -1), big, big), 'intersect');
  tool = tool && bool(tool, blk(o, a, rr, big), 'intersect');
  return tool || null;
}
/* Teil-Abwicklung: nur die gewählten Biegungen werden flachgelegt, die anderen bleiben stehen.
   Die ebenen Stücke der Abwicklung kommen starr an ihre Stelle im teilgeöffneten Zustand,
   die Ecken der Biegungen, die stehen bleiben, unverändert aus dem Modell. */
function partialUnfold(orig, uf, flat) {
  const fr = uf.frame, t = uf.t, n = fr.n;
  const P3 = (q, h) => add(add(add(fr.O, mul(fr.xd, q[0])), mul(fr.yd, q[1])), mul(n, h));
  const parts = [];
  uf.zones.forEach(z => {
    if (z.kind === 'c' && z.keep) {
      const c = z.cyl;
      if (!c || !(c.th > 1e-9)) return;
      const tool = bendCornerTool({ ...z, A: rigidI() }, t); // im Modell: A ist die Abbildung des Modells
      const corner = tool && bool(orig.clone(), tool, 'intersect');
      if (corner && (safeVolume(corner) || 0) > 1e-9) parts.push(rigidShape(corner, z.A || z.M));
      return;
    }
    let piece;
    try { piece = bool(flat.clone(), R.basicFaceExtrusion(R.makePolygon(z.pts2.map(q => P3(q, 0))), new R.Vector(mul(n, -t))), 'intersect'); } catch (_) { return; }
    if (!piece || (safeVolume(piece) || 0) < 1e-9) return;
    parts.push(rigidShape(piece, rgComp(z.A || z.M, rgInv(z.M))));
  });
  let out = null;
  parts.forEach(p => { out = out ? out.fuse(p) : p; });
  return out;
}
/* Eckfreischnitt an gebogenen Ecken: liegt an einer Ecke
   die Biegezone als Zylinderfläche mit der Achse senkrecht zur festen Fläche, würde ohne
   Schnitt das ganze Eckband an einem Schenkel hängen – die Abwicklung bekommt dort eine
   ausgefranste Kontur. Darum wird in der Winkelhalbierenden der Biegezone ein dünner
   Schnitt durch die Ecke gelegt, bevor abgewickelt wird. Geschnitten wird nur die Form
   für die Abwicklung; das Modell selbst bleibt unverändert. */
function cornerKerfs(shape, fixed, rule) {
  if (!fixed || fixed.geomType !== 'PLANE' || rule.cornerRelief === 'none') return [];
  const faces = shape.faces;
  const info = faces.map(fc => {
    try {
      if (fc.geomType === 'PLANE') return { kind: 'p', n: norm(fc.normalAt().toTuple()), c: fc.center.toTuple() };
      if (fc.geomType === 'CYLINDRE') return { kind: 'c', ...cylinderInfo(fc) };
      if (fc.geomType === 'CONE') return { kind: 'k', ...coneInfo(fc) };
    } catch (_) { /* egal */ }
    return { kind: 'x' };
  });
  const fi0 = faces.findIndex(fc => fc.wrapped.IsSame(fixed.wrapped));
  if (fi0 < 0) return [];
  const F = info[fi0];
  let t = Infinity;
  info.forEach((g, i) => { if (i !== fi0 && g.kind === 'p' && dot(g.n, F.n) < -0.99999) { const d = -dot(sub(g.c, F.c), F.n); if (d > 1e-6 && d < t) t = d; } });
  if (!isFinite(t)) return [];
  const tol = Math.max(1e-4, t * 1e-3);
  const axDist = (A, B) => { const v = sub(B.o, A.o); return len(sub(v, mul(A.a, dot(v, A.a)))); };
  // zusammengehörige Biegeflächen: Zylinder auf derselben Achse (ein Blech hat zwei Seiten), Kegel auf derselben Achse
  // mit gleichem Öffnungswinkel (Ecken einer Wanne mit Formschräge)
  const groups = [];
  info.forEach((g, i) => {
    if (g.kind !== 'c' && g.kind !== 'k') return;
    let q = groups.find(w => w.kind === g.kind && Math.abs(Math.abs(dot(w.a, g.a)) - 1) < 1e-6 && axDist(w, g) < tol && (g.kind === 'c' || Math.abs(w.beta - g.beta) < 1e-6));
    if (!q) { q = { kind: g.kind, o: g.o, a: g.a, beta: g.beta, idx: [] }; groups.push(q); }
    q.idx.push(i);
  });
  const gw = Number(rule.cornerReliefD) > 0 ? Number(rule.cornerReliefD) : t;   // Breite des Freischnitts
  const round = rule.cornerRelief === 'round';
  const out = [];
  groups.forEach(gr => {
    if (Math.abs(dot(gr.a, F.n)) < 0.9999) return;                             // nur Achsen parallel zur Flächennormalen sind Ecken
    const kegel = gr.kind === 'k';
    // Radien: Zylinder fest; Kegel über Stichproben (Abstand von der Achse), Wanddicke = Spitzenabstand · sin beta
    const radOf = p => { const v = sub(p, gr.o); return len(sub(v, mul(gr.a, dot(v, gr.a)))); };
    const hA = i => dot(sub(info[i].A, gr.o), gr.a);
    let rA, rB;
    if (kegel) {
      const hs = gr.idx.map(hA);
      if (Math.abs((Math.max(...hs) - Math.min(...hs)) * Math.sin(gr.beta) - t) > tol) return;
      const rad = gr.idx.flatMap(i => [0, 0.5, 1].flatMap(u => [0, 1].map(v => radOf(faces[i].pointOnSurface(u, v).toTuple()))));
      rA = Math.max(...rad); rB = Math.min(...rad);
    } else {
      const rr = gr.idx.map(i => info[i].r);
      rA = Math.max(...rr); rB = Math.min(...rr);
      if (!(rA - rB > 1e-6) || Math.abs(rA - rB - t) > tol) return;            // keine Biegezone (Verrundung, Vollmaterial)
    }
    // Winkelbereich der Biegezone abtasten: eine durchgehende Biegung (Rohr) bekommt keinen Eckfreischnitt
    const u0 = anyPerp(gr.a), v0 = cross(gr.a, u0), ang = [];
    gr.idx.forEach(i => {
      if (!kegel && Math.abs(info[i].r - rA) > tol) return;
      for (let s = 0; s <= 16; s++) {
        const p = sub(faces[i].pointOnSurface(s / 16, 0.5).toTuple(), gr.o);
        ang.push(Math.round(Math.atan2(dot(p, v0), dot(p, u0)) * 1e6) / 1e6);
      }
    });
    if (!ang.length) return;
    const as = [...new Set(ang)].sort((x, y) => x - y);
    let gapI = 0, gapV = -1;
    for (let i = 0; i < as.length; i++) {
      const nx = i + 1 < as.length ? as[i + 1] : as[0] + 2 * Math.PI, d = nx - as[i];
      if (d > gapV) { gapV = d; gapI = i; }
    }
    const span = 2 * Math.PI - gapV;
    if (!(span > 0.01) || span > 5.2) return;                                  // volle Runde: keine Ecke
    const mid = as[gapI] + gapV + span / 2;                                    // Winkelhalbierende der Biegezone
    const dir = add(mul(u0, Math.cos(mid)), mul(v0, Math.sin(mid)));           // radiale Richtung des Schnitts
    // axialer Bereich: der Schnitt geht durch die ganze Biegezone, auch durch den Rand der festen Fläche
    let h0 = Infinity, h1 = -Infinity;
    gr.idx.forEach(i => [0, 1].forEach(s => {
      const h = dot(sub(faces[i].pointOnSurface(0.5, s).toTuple(), gr.o), gr.a);
      if (h < h0) h0 = h;
      if (h > h1) h1 = h;
    }));
    if (!isFinite(h0)) return;
    const ends = [h0, h1];
    h0 -= 0.5; h1 += 0.5;
    if (Math.abs(h1 - h0) < 1e-6) return;
    const w = gw / 2, s0 = rB - 0.5, s1 = rA + 0.5;
    let pen = R.draw([s0, -w]).lineTo([s1, -w]).lineTo([s1, w]).lineTo([s0, w]);
    const cap = Math.min(w, s0 - 0.05);                                        // runder Freischnitt: darf nicht über die Achse laufen
    if (round && cap > 0.05) pen = pen.threePointsArcTo([s0, -w], [s0 - cap, 0]);
    out.push(pen.close().sketchOnPlane(new R.Plane(add(gr.o, mul(gr.a, Math.min(h0, h1))), dir, gr.a)).extrude(Math.abs(h1 - h0)));
    /* Dreifach-Ecke (wie „Eckfreischnitt“ an drei Biegungen): endet das Eckband an einer Platte quer zur
       Achse (Boden), gehen dort zwei scharfe Biegungen ab. Abgewickelt rückt jede Wand an der scharfen Kante um
       BA − 2t in den Boden, und das halbe Eckband an der Wand reicht dann in die Rundung der Bodenecke – die Kontur
       überschneidet sich selbst. Ein Zylinder um die Eckachse nimmt deshalb die Bodenecke und den unteren Teil des
       Eckbands weg. Die Platte erkennt man daran, dass sie die Eckachse selbst enthält (ein Rand oben nicht). */
    const hr = t + gw;
    ends.forEach((e, ei) => {
      const q = add(gr.o, mul(gr.a, e));
      // Kegel: größter Radius zwischen dem Ende und dem oberen Rand des Freischnitts
      const hi = e + (ei === 0 ? 1 : -1) * Math.sign(h1 - h0) * (hr + 0.5);
      const relief = kegel ? Math.max(...gr.idx.flatMap(i => [e, hi].map(h => Math.abs(h - hA(i)) * Math.tan(gr.beta)))) + 0.5 : rA + 0.5;
      const plate = info.some((g, j) => {
        if (g.kind !== 'p' || Math.abs(dot(g.n, gr.a)) < 0.9999 || Math.abs(dot(sub(g.c, gr.o), gr.a) - e) > tol) return false;
        try { return R.measureDistanceBetween(faces[j], R.makeVertex(q)) < 1e-6; } catch (_) { return false; }
      });
      if (!plate) return;
      const into = ei === 0 ? (h1 > h0 ? 1 : -1) : (h1 > h0 ? -1 : 1);     // vom Ende in das Eckband hinein
      const base = add(q, mul(gr.a, -0.5 * into));
      if (round) out.push(R.makeCylinder(relief, 0.5 + hr, base, mul(gr.a, into)));
      else {
        // quadratisch: Seiten parallel zu den beiden Wänden (radiale Richtungen an den Enden des Eckbands)
        const e1 = add(mul(u0, Math.cos(mid - span / 2)), mul(v0, Math.sin(mid - span / 2)));
        out.push(R.drawRectangle(2 * relief, 2 * relief).sketchOnPlane(new R.Plane(base, e1, mul(gr.a, into))).extrude(0.5 + hr));
      }
      out.reliefs = (out.reliefs || 0) + 1;
    });
  });
  return out;
}
/* Fläche mit derselben Ebene wiederfinden – nach einem Schnitt ist sie ein neues Objekt.
   Der Schwerpunkt verschiebt sich durch den Schnitt, darum zählt nur die Lage der Ebene. */
function findPlaneFace(shape, n, dist) {
  let best = null, bd = Infinity;
  let fs = null;
  try { fs = shape.faces; } catch (_) { fs = null; }
  (fs || []).forEach(fc => {
    if (fc.geomType !== 'PLANE') return;
    try {
      const m = norm(fc.normalAt().toTuple());
      if (dot(m, n) < 1 - 1e-6) return;
      const p = fc.pointOnSurface(0.5, 0.5).toTuple();
      const d = Math.abs(dot(m, p) - dist);
      if (d < 1e-6 && d < bd) { bd = d; best = fc; }
    } catch (_) { /* egal */ }
  });
  return best;
}
/* Abwicklung für die Ausgabe (Flachmuster, DXF): an gebogenen Ecken zuerst die Eckfreischnitte setzen.
   Gilt für jede Neuberechnung (Umwandeln, Auftrennen, Blechabrundung, Verbinden, Zurückfalten),
   sonst fehlen die Freischnitte nach dem nächsten Blech-Feature wieder. Das Modell bleibt unverändert. */
function kerfedForUnfold(shape, fixed, rule) {
  const kerfs = cornerKerfs(shape, fixed, rule);
  if (kerfs.length) {
    const n0 = norm(fixed.normalAt().toTuple()), d0 = dot(n0, fixed.pointOnSurface(0.5, 0.5).toTuple());
    const cut = tidy(bool(shape, kerfs.reduce((a, b) => a.fuse(b)), 'cut'));
    const nf = cut && findPlaneFace(cut, n0, d0);
    if (nf) return { shape: cut, fixed: nf, kerfs: kerfs.length - (kerfs.reliefs || 0), reliefs: kerfs.reliefs || 0 };
  }
  return { shape, fixed, kerfs: 0 };
}
/* Fläche einer Abwicklung: Außenkontur minus Ausschnitte. Sehnenvieleck nach der Gaußschen Formel, dazu je Bogen das
   vorzeichenbehaftete Kreissegment zwischen Sehne und Bogen (Bogenmitte rechts der Sehne a → b: positiv). */
function flaecheAbwicklung(uf) {
  const poly = lp => {
    if (lp.circle) return Math.PI * lp.circle.r * lp.circle.r;
    const P = [];
    let seg = 0;
    lp.edges.forEach(e => {
      P.push(e.a);
      if (Array.isArray(e.pts)) e.pts.slice(1, -1).forEach(q => P.push(q));
      if (e.mid) {
        const c = circleCenter([...e.a, 0], [...e.mid, 0], [...e.b, 0]);
        if (!c) return;
        const r = Math.hypot(e.a[0] - c[0], e.a[1] - c[1]), ch = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        const kr = (e.b[0] - e.a[0]) * (e.mid[1] - e.a[1]) - (e.b[1] - e.a[1]) * (e.mid[0] - e.a[0]);
        // Mittelpunktswinkel: größer als 180°, wenn die Bogenmitte weiter als r von der Sehne weg liegt
        const hm = Math.abs(kr) / (ch || 1);
        let th = 2 * Math.asin(Math.min(1, ch / (2 * r)));
        if (hm > r) th = 2 * Math.PI - th;
        seg += -Math.sign(kr) * r * r / 2 * (th - Math.sin(th));
      }
    });
    let A = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
    // der Umlauf a → Bogenmitte → b → a hat genau dieses Vorzeichen, gleich wie herum die Kontur läuft
    return Math.abs(A / 2 + seg);
  };
  return poly(uf.contour[0]) - (uf.holes || []).reduce((s, h) => s + poly(h), 0);
}
function unfoldSheet(shape, fixed, rule) {
  const k = kerfedForUnfold(shape, fixed, rule);
  return { ...unfoldBody(k.shape, k.fixed, rule), kerfs: k.kerfs };
}
/* Kreuzungen einer geschlossenen Kontur mit sich selbst (Bögen über ihren Mittelpunkt angenähert, Punktzüge über
   ihre Punkte). Eine überschnittene Kontur ergibt einen Zuschnitt, den der Laser nicht sauber schneidet, und eine
   Fläche, an der die Abstandsmessung von OpenCASCADE falsch rechnet – deshalb wird sie gemeldet. */
function loopCrossings(loop) {
  if (!loop || loop.circle || !Array.isArray(loop.edges)) return 0;
  const P = [];
  loop.edges.forEach(e => { P.push(e.a); if (e.mid) P.push(e.mid); else if (Array.isArray(e.pts)) e.pts.slice(1, -1).forEach(q => P.push(q)); });
  const n = P.length;
  if (n < 4) return 0;
  const x = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const opp = (u, v) => (u > 1e-9 && v < -1e-9) || (u < -1e-9 && v > 1e-9);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = P[j], d = P[(j + 1) % n];
      if (opp(x(c, d, a), x(c, d, b)) && opp(x(a, b, c), x(a, b, d))) k++;
    }
  }
  return k;
}
function unfoldBody(shape, fixed, rule, bendSel = null) {
  const k = Number(rule.k) >= 0 ? Number(rule.k) : 0.44;
  const faces = shape.faces;
  if (!fixed || fixed.geomType !== 'PLANE') throw new Error('Feste Fläche muss eben sein');
  const fi0 = faces.findIndex(fc => fc.wrapped.IsSame(fixed.wrapped));
  if (fi0 < 0) throw new Error('Feste Fläche nicht im Körper');
  const info = faces.map(fc => {
    try {
      if (fc.geomType === 'PLANE') return { kind: 'p', n: norm(fc.normalAt().toTuple()), c: fc.center.toTuple() };
      if (fc.geomType === 'CYLINDRE') { const ci = cylinderInfo(fc); return { kind: 'c', ...ci }; }
      if (fc.geomType === 'CONE') return { kind: 'k', ...coneInfo(fc) };
    } catch (_) { /* egal */ }
    return { kind: 'x' };
  });
  // nur ausgewählte Biegungen abwickeln: Biegeflächen, die nicht gewählt sind, bleiben im Modell stehen
  const selBend = bendSel ? new Set() : null;
  if (bendSel) bendSel.forEach(rs => {
    const i = faces.findIndex(fc => fc.wrapped.IsSame(rs.wrapped));
    if (i < 0) throw new Error('Eine gewählte Biegung gibt es nicht mehr');
    if (info[i].kind !== 'c') throw new Error('Die gewählte Fläche ist keine Biegung');
    // die gleiche Biegung ist auch auf der anderen Blechseite (Zylinder gleicher Achse)
    const g = info[i];
    faces.forEach((fc, j) => {
      const h = info[j];
      if (h.kind === 'c' && Math.abs(dot(h.a, g.a)) > 1 - 1e-6 && len(cross(sub(h.o, g.o), g.a)) < 1e-3) selBend.add(j);
    });
  });
  // Blechdicke: nächste Gegenfläche hinter der festen Fläche
  const F = info[fi0];
  let t = Infinity;
  info.forEach((g, i) => { if (i !== fi0 && g.kind === 'p' && dot(g.n, F.n) < -0.99999) { const d = -dot(sub(g.c, F.c), F.n); if (d > 1e-6 && d < t) t = d; } });
  if (!isFinite(t)) throw new Error('Keine Gegenfläche gefunden – ist der Körper ein Blech gleicher Dicke?');
  const tol = Math.max(1e-4, t * 1e-3);
  const axDist = (A, B) => { const v = sub(B.o, A.o); return len(sub(v, mul(A.a, dot(v, A.a)))); };
  // Punkte, die sicher auf der ebenen Fläche liegen (Schwerpunkt oder nach innen versetzte Kantenmitten).
  // Mehrere Kandidaten: nach Auftrennungen oder Ausschnitten kann der Schwerpunkt außerhalb der Fläche liegen.
  const dOn = (sh, p) => { try { return R.measureDistanceBetween(sh, R.makeVertex(p)); } catch (_) { return Infinity; } };
  const ptsOn = i => {
    const fc = faces[i], c = info[i].c, out = [];
    if (dOn(fc, c) < 1e-6) out.push(c);
    for (const e of fc.edges) {
      if (out.length >= 12) break;
      const m = e.pointAt(0.5).toTuple(), v = sub(c, m), l = len(v);
      if (l < 1e-9) continue;
      for (const d of [0.01, 0.1, 0.5]) { const q = add(m, mul(v, Math.min(d, l / 2) / l)); if (dOn(fc, q) < 1e-6) { out.push(q); break; } }
    }
    return out;
  };
  const side = info.map((g, i) => {
    if (g.kind === 'p') {
      const cand = info.map((h, j) => j).filter(j => j !== i && info[j].kind === 'p' && dot(info[j].n, g.n) < -0.99999 && Math.abs(dot(sub(info[j].c, g.c), g.n) + t) < tol);
      if (!cand.length) return false;
      return ptsOn(i).some(q => { const qp = sub(q, mul(g.n, t)); return cand.some(j => dOn(faces[j], qp) < tol); });
    }
    if (g.kind === 'c') return info.some((h, j) => j !== i && h.kind === 'c' && Math.abs(Math.abs(dot(h.a, g.a)) - 1) < 1e-6 && axDist(g, h) < tol && Math.abs(Math.abs(h.r - g.r) - t) < tol);
    // Kegel: Gegenkegel auf derselben Achse mit gleichem Winkel, Flächenabstand = Spitzenabstand · sin beta
    if (g.kind === 'k') return info.some((h, j) => j !== i && h.kind === 'k' && dot(h.a, g.a) > 1 - 1e-6 && axDist(g, h) < tol && Math.abs(h.beta - g.beta) < 1e-6 && Math.abs(Math.abs(dot(sub(h.A, g.A), g.a)) * Math.sin(g.beta) - t) < tol);
    return false;
  });
  // Kanten der Seitenflächen und ihre Nachbarn
  const E = [], edgesOf = faces.map(() => []);
  faces.forEach((fc, i) => {
    if (!side[i]) return;
    fc.edges.forEach(e => {
      let id = E.findIndex(x => x.e.wrapped.IsSame(e.wrapped));
      if (id < 0) { id = E.length; E.push({ e, faces: [] }); }
      if (!E[id].faces.includes(i)) E[id].faces.push(i);
      edgesOf[i].push(id);
    });
  });
  const nAt = (i, p) => norm(faces[i].normalAt(p).toTuple());
  // Abwicklungsebene: feste Fläche, x entlang ihrer längsten geraden Kante
  let xd = null, bestL = 0;
  edgesOf[fi0].forEach(id => { const e = E[id].e; if (e.geomType !== 'LINE') return; const v = sub(e.endPoint.toTuple(), e.startPoint.toTuple()); if (len(v) > bestL) { bestL = len(v); xd = norm(v); } });
  if (!xd) xd = norm(anyPerp(F.n));
  const yd = norm(cross(F.n, xd)), O = F.c;
  const to2 = p => [dot(sub(p, O), xd), dot(sub(p, O), yd)];
  // Baum aufbauen (Breitensuche)
  const map = new Map(), consumed = new Set(), extra = [], bendsOut = [];
  map.set(fi0, { M: rigidI(), Ml: rigidI(), f: q => q });
  const queue = [fi0];
  let nb = 0, nSharp = 0, nbKeep = 0;
  const radien = []; // Innenradien der Biegungen (für die Angabe in der Abwicklung: R des Körpers, nicht der Blechregel)
  while (queue.length) {
    const i = queue.shift(), me = map.get(i), gi = info[i];
    for (const id of edgesOf[i]) {
      const ed = E[id];
      for (const j of ed.faces) {
        if (j === i || map.has(j)) continue;
        const e = ed.e, m = e.pointAt(0.5).toTuple();
        const ni = nAt(i, m), nj = nAt(j, m);
        const tang = dot(ni, nj) > 0.9999;
        // Rahmen, in dem Fläche j (bei Zylinder: ihr Anfang) starr liegt
        let base = me.M, basel = me.Ml;
        if (gi.kind === 'c' || gi.kind === 'k') {
          if (!tang || !me.U) continue;
          base = me.childM(e);
          if (!base) continue;
          basel = me.childMl();
        }
        if (info[j].kind === 'p') {
          if (tang) { map.set(j, { M: base, Ml: basel, f: q => rgApply(base, q) }); queue.push(j); continue; }
          if (gi.kind !== 'p' || e.geomType !== 'LINE') continue; // scharfe Kante nur zwischen Ebenen
          const A = e.startPoint.toTuple(), B = e.endPoint.toTuple(), ax = norm(sub(B, A));
          const al = Math.acos(Math.max(-1, Math.min(1, dot(gi.n, info[j].n))));
          let R = null;
          for (const s of [1, -1]) { const Rt = rgRot(A, ax, -s * al); if (dot(rgVec(Rt, info[j].n), gi.n) > 0.9999) { R = Rt; break; } }
          if (!R) continue;
          const cq = faces[j].center.toTuple(), cr = rgApply(R, cq);
          const w = norm((v => sub(v, mul(ax, dot(v, ax))))(sub(cr, A)));
          const concave = dot(sub(cq, A), gi.n) > 0;
          const BA = k * t * al, D = concave ? BA : BA - 2 * t * Math.tan(al / 2);
          const Mj = rgComp(base, rgComp(rgMove(mul(w, D)), R)), Mlj = rgComp(basel, rgComp(rgMove(mul(w, D)), R));
          map.set(j, { M: Mj, Ml: Mlj, f: q => rgApply(Mj, q) });
          queue.push(j);
          consumed.add(id);
          // Füllstücke an beiden Kantenenden und Biegelinie in der Mitte der Biegezone
          extra.push([to2(rgApply(base, A)), to2(rgApply(Mj, A))], [to2(rgApply(base, B)), to2(rgApply(Mj, B))]);
          const c0 = concave ? 0 : -t * Math.tan(al / 2);
          const sh = mul(w, c0 + BA / 2);
          bendsOut.push({ a: to2(rgApply(base, add(A, sh))), b: to2(rgApply(base, add(B, sh))), label: `${Math.round(al * 180 / Math.PI)}° ${concave ? '↑' : '↓'} R0` });
          nb++; nSharp++;
          continue;
        }
        if (info[j].kind === 'c') {
          if (!tang || e.geomType !== 'LINE') continue;
          const C = info[j], a = C.a, o = C.o;
          const radial = p => { const v = sub(p, o); return norm(sub(v, mul(a, dot(v, a)))); };
          const r0 = radial(m);
          const raw = p => { const r = radial(p); return Math.atan2(dot(a, cross(r0, r)), dot(r0, r)); };
          const cc = faces[j].center.toTuple();
          const s = raw(cc) >= 0 ? 1 : -1;
          const phi = p => { let v = s * raw(p); if (v < -1e-7) v += 2 * Math.PI; return Math.max(0, v); };
          const tg = norm(cross(a, r0)), w = dot(tg, sub(cc, m)) >= 0 ? tg : mul(tg, -1);
          const concave = C.internal;
          const rin = concave ? C.r : C.r - t, Rn = rin + k * t;
          radien.push(Math.round(rin * 1000) / 1000);
          const M0 = base, Ml0 = basel;
          const lam = !selBend || selBend.has(j) ? 1 : 0;
          const f = q => { const p = phi(q); return rgApply(M0, add(rgApply(rgRot(o, a, -s * p), q), mul(w, Rn * p))); };
          // Endkante der Biegung (die andere gerade Kante) → Winkel
          let th = 0;
          edgesOf[j].forEach(id2 => { if (id2 === id) return; const e2 = E[id2].e; if (e2.geomType !== 'LINE') return; const v = phi(e2.pointAt(0.5).toTuple()); if (v > th) th = v; });
          const U = rgComp(rgMove(mul(w, Rn * th)), rgRot(o, a, -s * th));
          const node = { M: M0, Ml: Ml0, f, U, childM: () => rgComp(M0, U), childMl: () => rgComp(Ml0, lam ? U : rigidI()), cyl: { o, a, s, w, Rn, th, A: e.startPoint.toTuple() }, keep: 1 - lam };
          map.set(j, node);
          queue.push(j);
          const A = e.startPoint.toTuple(), B = e.endPoint.toTuple(), sh = mul(w, Rn * th / 2);
          bendsOut.push({ a: to2(rgApply(M0, add(A, sh))), b: to2(rgApply(M0, add(B, sh))), label: `${Math.round(th * 180 / Math.PI)}° ${concave ? '↑' : '↓'} R${+rin.toFixed(2)}` });
          nb++;
          if (!lam) nbKeep++;
          continue;
        }
        if (info[j].kind === 'k') {
          /* Kegel (Ecke einer Wanne mit Formschräge) ist abwickelbar: die neutrale Kegelfläche wird um ihre Spitze in die
             Ebene der Anschlussfläche gerollt – Abstand zur Spitze bleibt, Umfangswinkel φ wird ψ = φ · sin beta.
             Neutral wie bei Zylindern: Innenseite + k·t, Außenseite − (1 − k)·t senkrecht zur Fläche */
          if (!tang || e.geomType !== 'LINE') continue;
          const C = info[j], a = C.a, o = C.A, sb = Math.sin(C.beta);
          const radial = p => { const v = sub(p, o); return norm(sub(v, mul(a, dot(v, a)))); };
          const r0 = radial(m);
          const raw = p => { const r = radial(p); return Math.atan2(dot(a, cross(r0, r)), dot(r0, r)); };
          const cc = faces[j].center.toTuple();
          const s = raw(cc) >= 0 ? 1 : -1;
          const phi = p => { let v = s * raw(p); if (v < -1e-7) v += 2 * Math.PI; return Math.max(0, v); };
          const tg = norm(cross(a, r0)), w = dot(tg, sub(cc, m)) >= 0 ? tg : mul(tg, -1);
          const g0 = norm(sub(m, o));
          const nOut = p => { const g = norm(sub(p, o)), r = radial(p); return norm(sub(r, mul(g, dot(r, g)))); }; // von der Achse weg
          const n0 = nOut(m), concave = C.internal, del = concave ? k * t : -(1 - k) * t;
          // Spitze des neutralen Kegels: die neutrale Mantellinie durch m schneidet die Achse
          const mn = add(m, mul(n0, del)), An = add(mn, mul(g0, -dot(sub(mn, o), r0) / dot(g0, r0)));
          const dev = q => { const qn = add(q, mul(nOut(q), del)), rho = len(sub(qn, An)), ps = phi(q) * sb; return add(add(An, mul(add(mul(g0, Math.cos(ps)), mul(w, Math.sin(ps))), rho)), mul(n0, -del)); };
          const M0 = base, Ml0 = basel;
          const f = q => rgApply(M0, dev(q));
          // Winkel = größter Umfangswinkel der Kantenenden. Weiter zur nächsten Fläche geht es nur über eine Endkante, die
          // eine Mantellinie ist (gleicher Winkel überall) – nach einem Eckfreischnitt ist sie eine Hyperbel, dort endet das Blech
          let th = 0, far = null;
          edgesOf[j].forEach(id2 => {
            if (id2 === id) return;
            const e2 = E[id2].e, ws = [0, 0.5, 1].map(x => phi(e2.pointAt(x).toTuple()));
            th = Math.max(th, ...ws);
            if (Math.max(...ws) - Math.min(...ws) < 1e-6 && (!far || ws[1] > far.v)) far = { e: e2, v: ws[1] };
          });
          far = far && far.v >= th - 1e-6 ? far.e : null;
          let U = null;
          if (far && th > 1e-6) {
            const P1 = far.startPoint.toTuple(), P2 = far.endPoint.toTuple(), g1 = norm(sub(P2, P1)), n1 = nOut(P1), b1 = cross(g1, n1);
            const D1 = dev(P1), g1d = norm(sub(dev(P2), D1)), b1d = cross(g1d, n0);
            const Rm = [0, 1, 2].map(r => [0, 1, 2].map(c => g1d[r] * g1[c] + n0[r] * n1[c] + b1d[r] * b1[c]));
            U = { R: Rm, T: sub(D1, [0, 1, 2].map(r => Rm[r][0] * P1[0] + Rm[r][1] * P1[1] + Rm[r][2] * P1[2])) };
          }
          map.set(j, { M: M0, Ml: Ml0, f, U, childM: () => rgComp(M0, U), childMl: () => rgComp(Ml0, U), keep: 0 });
          queue.push(j);
          // Biegelinie: Mantellinie in der Mitte des Kegelstücks
          const A3 = e.startPoint.toTuple(), B3 = e.endPoint.toTuple();
          let Rh = rgRot(o, a, s * th / 2);
          if (Math.abs(phi(rgApply(Rh, A3)) - th / 2) > 1e-6) Rh = rgRot(o, a, -s * th / 2);
          bendsOut.push({ a: to2(f(rgApply(Rh, A3))), b: to2(f(rgApply(Rh, B3))), label: `${Math.round(th * 180 / Math.PI)}° ${concave ? '↑' : '↓'} Kegel` });
          nb++;
        }
      }
    }
  }
  // Kanten abbilden
  const segs = [], circles = [];
  const keyP = p => p.map(v => Math.round(v * 1e4)).join(',');
  map.forEach((nd, i) => {
    const fm = q => to2(nd.f(q));
    edgesOf[i].forEach(id => {
      if (consumed.has(id)) return;
      const e = E[id].e, gt = e.geomType;
      const a3 = e.startPoint.toTuple(), b3 = e.endPoint.toTuple();
      if (gt === 'LINE') { segs.push({ type: 'line', a: fm(a3), b: fm(b3), mid: null, f: i }); return; }
      if (gt === 'CIRCLE' && info[i].kind === 'p') {
        if (len(sub(a3, b3)) < 1e-7) { const p = [0, 1 / 3, 2 / 3].map(u => fm(e.pointAt(u).toTuple())); const cc = circleCenter([...p[0], 0], [...p[1], 0], [...p[2], 0]); if (cc) circles.push({ circle: { c: [cc[0], cc[1]], r: Math.hypot(p[0][0] - cc[0], p[0][1] - cc[1]) }, f: i }); return; }
        segs.push({ type: 'arc', a: fm(a3), b: fm(b3), mid: fm(e.pointAt(0.5).toTuple()), f: i });
        return;
      }
      const n = 24;
      let prev = fm(e.pointAt(0).toTuple());
      for (let s = 1; s <= n; s++) { const q = fm(e.pointAt(s / n).toTuple()); segs.push({ type: 'line', a: prev, b: q, mid: null, f: i }); prev = q; }
    });
  });
  extra.forEach(([a, b]) => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) segs.push({ type: 'line', a, b, mid: null }); });
  // doppelte Kanten (Übergang zwischen zwei abgewickelten Flächen) heben sich auf
  const kOf = s => [keyP(s.a), keyP(s.b)].sort().join('|') + (s.mid ? '|' + keyP(s.mid) : '');
  const cnt = new Map();
  segs.forEach(s => { const kk = kOf(s); cnt.set(kk, (cnt.get(kk) || 0) + 1); });
  const live = segs.filter(s => cnt.get(kOf(s)) % 2 === 1 && Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]) > 1e-7);
  // zu Schleifen verketten
  const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const left = live.map(s => ({ type: s.type, a: s.a, b: s.b, mid: s.mid })), loops = [];
  while (left.length) {
    const lp = [left.shift()];
    for (let g = 0; g < 100000; g++) {
      const end = lp[lp.length - 1].b;
      if (d2(end, lp[0].a) < 1e-4) break;
      let bi = -1, bd = 1e-3;
      left.forEach((s, ii) => { const da = d2(s.a, end), db = d2(s.b, end); if (Math.min(da, db) < bd) { bd = Math.min(da, db); bi = ii; } });
      if (bi < 0) break;
      const s = left.splice(bi, 1)[0];
      lp.push(d2(s.a, end) <= d2(s.b, end) ? s : { ...s, a: s.b, b: s.a });
    }
    // gerade Stücke auf einer Linie zusammenfassen (auch Rücksprünge an scharfen Außenbiegungen)
    const out = [];
    lp.forEach(s => {
      const p = out[out.length - 1];
      if (p && p.type === 'line' && s.type === 'line') {
        const u = [p.b[0] - p.a[0], p.b[1] - p.a[1]], v = [s.b[0] - p.a[0], s.b[1] - p.a[1]];
        const lu = Math.hypot(u[0], u[1]) || 1;
        if (Math.abs(u[0] * v[1] - u[1] * v[0]) / lu < 1e-5 && Math.abs(((s.a[0] - p.a[0]) * u[1] - (s.a[1] - p.a[1]) * u[0])) / lu < 1e-5) { p.b = s.b; if (d2(p.a, p.b) < 1e-7) out.pop(); return; }
      }
      out.push({ ...s });
    });
    if (out.length > 1) { const a0 = out[0], z = out[out.length - 1]; if (a0.type === 'line' && z.type === 'line') { const u = [z.b[0] - z.a[0], z.b[1] - z.a[1]], lu = Math.hypot(u[0], u[1]) || 1; if (Math.abs((a0.b[0] - z.a[0]) * u[1] - (a0.b[1] - z.a[1]) * u[0]) / lu < 1e-5) { z.b = a0.b; out.shift(); } } }
    if (out.length) loops.push({ edges: out });
  }
  const area = lp => { let A = 0; lp.edges.forEach(e => { A += e.a[0] * e.b[1] - e.b[0] * e.a[1]; }); return Math.abs(A / 2); };
  loops.sort((p, q) => area(q) - area(p));
  if (!loops.length) throw new Error('Abwicklung ergab keine Kontur');
  const contour = [loops[0]], holes = [...loops.slice(1), ...circles.map(c => ({ circle: c.circle }))];
  const pts = [];
  contour[0].edges.forEach(e => { pts.push(e.a, e.b); if (e.mid) pts.push(e.mid); });
  const bb = [[Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))], [Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]];
  const skipped = faces.filter((_, i) => side[i] && !map.has(i) && dot(info[i].n || [0, 0, 0], F.n) > -2).length;
  // Bild jeder abgewickelten Fläche (Umriss in der Abwicklung) mit ihrer Abbildung – fürs Zurückfalten
  const zones = [];
  map.forEach((nd, i) => {
    try {
      const polys = faces[i].outerWire().edges.map(e => { const n = e.geomType === 'LINE' ? 1 : 16, P = []; for (let s = 0; s <= n; s++) P.push(to2(nd.f(e.pointAt(s / n).toTuple()))); return P; });
      const pts2 = chainPolylines(polys);
      if (pts2.length >= 3) zones.push({ kind: info[i].kind, i, pts2, M: nd.M, A: nd.Ml || nd.M, cyl: nd.cyl || null, keep: nd.keep || 0 });
    } catch (_) { /* Fläche übergehen */ }
  });
  // häufigster Innenradius der Biegungen (scharfe Kanten ohne Zylinder zählen nicht)
  const rKoerper = radien.length ? radien.slice().sort((a, b) => radien.filter(x => x === b).length - radien.filter(x => x === a).length)[0] : null;
  return { contour, holes, bends: bendsOut, bb, rule: { ...rule, t, k, ...(rKoerper != null ? { r: rKoerper } : {}) }, flanges: 0, t, nb, faces: map.size, skipped, sharp: nSharp, kept: nbKeep, crossings: loopCrossings(contour[0]), zones, frame: { O, xd, yd, n: F.n } };
}
/* Lasche an einer geraden Kante: Biegung (Innenradius r) + gerader Schenkel, Höhe als Außenmaß */
function flangeTool(body, edgeSel, f, auto = { o1: 0, o2: 0 }) {
  const hit = findSel([body], 'edge', edgeSel.ref, body.id);
  if (!hit || hit.shape.geomType !== 'LINE') throw new Error('Gerade Blechkante nicht gefunden');
  const e = hit.shape;
  // ursprüngliche Kantenendpunkte (frühere Laschen derselben Funktion können die Kante durch Eckfreischnitte schon gekürzt haben)
  const p0 = auto.p0 || e.startPoint.toTuple(), p1 = auto.p1 || e.endPoint.toTuple();
  const d = norm(sub(p1, p0)), mid = mul(add(p0, p1), 0.5), L0 = len(sub(p1, p0));
  const t = sheetRule.t, r = sheetRule.r;
  // die beiden ebenen Flächen an der Kante: Blechfläche (groß) und Stirnfläche (dünn)
  const adj = body.shape.faces.filter(fc => {
    if (fc.geomType !== 'PLANE') return false;
    const n = fc.normalAt().toTuple();
    return Math.abs(dot(n, d)) < 1e-6 && Math.abs(dot(n, sub(mid, fc.center.toTuple()))) < 1e-5;
  }).map(fc => ({ fc, n: fc.normalAt().toTuple(), area: R.measureArea(fc) })).sort((a, b) => b.area - a.area);
  if (adj.length < 1) throw new Error('Blechfläche an der Kante nicht gefunden');
  let n = adj[0].n;
  let o = adj[1] ? adj[1].n : norm(cross(d, n));
  if (!adj[1] && dot(o, sub(mid, adj[0].fc.center.toTuple())) < 0) o = mul(o, -1);
  // Lasche nur über einen Teil der Kante: Versatz vom Kantenanfang/-ende
  const o1 = (f.extent === 'partial' ? Math.max(0, Number(f.off1) || 0) : 0) + auto.o1, o2 = (f.extent === 'partial' ? Math.max(0, Number(f.off2) || 0) : 0) + auto.o2;
  if (o1 + o2 > L0 - 0.1) throw new Error('Die Versätze sind länger als die Kante');
  const e0 = add(p0, mul(d, o1)), Lw = L0 - o1 - o2;
  const nBase = n;
  let origin = e0;
  if (f.flip) { origin = add(e0, mul(n, -t)); n = mul(n, -1); }
  const th0 = (Number(f.angle) || 90) * Math.PI / 180;
  if (!(th0 > 0.01 && th0 <= Math.PI + 1e-9)) throw new Error('Winkel zwischen 1° und 180°');
  /* Höhe = Außenmaß senkrecht zur Blechfläche; ab ≈175° ein Saum: offen (Spalt = 2 × Innenradius), gerollt (Radius,
     Winkel, kein Schenkel) oder Tropfen (Radius, Länge, Spalt → Winkel über 180°) – siehe hemGeometry in sheet.js */
  const hg = hemGeometry({ t, r, k: sheetRule.k }, f);
  if (hg.error) throw new Error(hg.error);
  const th = hg.th, L = hg.L, rh = hg.rh, rolled = hg.kind === 'rolled', dbl = hg.double || null;
  if (!rolled && !(L > 0.01)) throw new Error('Laschenhöhe zu klein für Biegeradius und Dicke');
  if (rolled && !(rh > 1e-6)) throw new Error('Radius des gerollten Saums muss größer als 0 sein');
  const P = (rad, ph) => [rad * Math.cos(ph), rh + rad * Math.sin(ph)];
  const ph0 = -Math.PI / 2, phe = ph0 + th, phm = ph0 + th / 2;
  const dir = [Math.cos(th), Math.sin(th)];
  const oe = P(rh + t, phe), ie = P(rh, phe);
  const q1 = [oe[0] + dir[0] * L, oe[1] + dir[1] * L], q2 = [ie[0] + dir[0] * L, ie[1] + dir[1] * L];
  let prof;
  if (dbl) {
    /* Doppelsaum: erste Biegung 180° um C1 = (0, rh), erster Schenkel zurück bis x = −L1, zweite Biegung 180° um
       C2 = (−L1, 3rh + t) nach oben, zweiter Schenkel wieder nach vorn bis x = −L1 + L2. Spalt 0 (rh = 0): die
       Innenbahnen fallen auf Punkte. */
    const { L1, L2 } = dbl, y1 = 2 * rh + t, c2 = y1 + rh, y2 = c2 + rh;
    let pd = R.draw([0, -t]).threePointsArcTo([0, y1], [rh + t, rh]).lineTo([-L1, y1]);
    if (rh > 1e-6) pd = pd.threePointsArcTo([-L1, y2], [-L1 - rh, c2]);
    pd = pd.lineTo([-L1 + L2, y2]).lineTo([-L1 + L2, y2 + t]).lineTo([-L1, y2 + t]).threePointsArcTo([-L1, 2 * rh], [-L1 - rh - t, c2]).lineTo([0, 2 * rh]);
    prof = (rh > 1e-6 ? pd.threePointsArcTo([0, 0], [rh, rh]) : pd).close();
  } else {
    // gerollter Saum ohne geraden Schenkel: vom Bogenende direkt über die Stirn auf die Innenbahn
    const pen = rolled ? R.draw([0, -t]).threePointsArcTo(oe, P(rh + t, phm)).lineTo(ie)
      : R.draw([0, -t]).threePointsArcTo(oe, P(rh + t, phm)).lineTo(q1).lineTo(q2).lineTo(ie);
    // Spalt 0 = flach an der Fläche: die Innenbahn fällt auf einen Punkt, es bleibt die scharfe Außenbahn
    prof = (rh > 1e-6 ? pen.threePointsArcTo([0, 0], P(rh, phm)) : pen).close();
  }
  const nrm = norm(cross(o, n));
  const sgn = dot(nrm, d) > 0 ? 1 : -1;
  let tool = prof.sketchOnPlane(new R.Plane(origin, o, nrm)).extrude(sgn * Lw);
  // geschlossene Ecke: nur der gerade Schenkel wird über die Ecke verlängert (Biegezone behält den Eckfreischnitt)
  const extS = Math.max(0, auto.extS || 0), extE = Math.max(0, auto.extE || 0);
  if (!rolled && !dbl && (extS > 1e-6 || extE > 1e-6)) {
    const leg = R.draw(oe).lineTo(q1).lineTo(q2).lineTo(ie).close();
    if (extS > 1e-6) tool = tool.fuse(leg.sketchOnPlane(new R.Plane(add(origin, mul(d, -extS)), o, nrm)).extrude(sgn * extS));
    if (extE > 1e-6) tool = tool.fuse(R.draw(oe).lineTo(q1).lineTo(q2).lineTo(ie).close().sketchOnPlane(new R.Plane(add(origin, mul(d, Lw)), o, nrm)).extrude(sgn * extE));
  }
  // Freischnitt (rechteckig, Breite t, Tiefe r + t) an Laschenenden mitten auf der Kante
  // an Ecken (auto) wird das ganze Eckquadrat ausgeschnitten, sonst eine schmale Kerbe neben dem Laschenende
  const cs = auto.o1 > 1e-6, ce = auto.o2 > 1e-6;
  const relief = (o1 > 1e-6 || o2 > 1e-6) && f.relief !== 'none' ? { w: t, dep: r + t, start: o1 > 1e-6 && !cs, end: o2 > 1e-6 && !ce, cornerStart: cs, cornerEnd: ce } : null;
  let reliefCut = null;
  if (relief) {
    const yS = dot(cross(nBase, d), o) > 0 ? 1 : -1; // y-Achse der Ebene (n × d) gegen o
    const box = (x0, x1) => {
      const pts = [[x0, -relief.dep * yS], [x1, -relief.dep * yS], [x1, 0.01 * yS], [x0, 0.01 * yS]];
      let pen = R.draw(pts[0]); pts.slice(1).forEach(q => { pen = pen.lineTo(q); });
      return pen.close().sketchOnPlane(new R.Plane(sub(p0, mul(nBase, t + 1)), d, nBase)).extrude(2 * t + 2);
    };
    const add1 = b => { reliefCut = reliefCut ? reliefCut.fuse(b) : b; };
    if (relief.start) add1(box(o1 - relief.w, o1));
    if (relief.end) add1(box(o1 + Lw, o1 + Lw + relief.w));
    if (cs) add1(box(-0.01, o1));
    if (ce) add1(box(o1 + Lw, L0 + 0.01));
  }
  // Lage für die Abwicklung: Kantenanfang, Kantenrichtung, außen, Biegeseite, Schenkelanfang/-richtung
  const legDir = add(mul(o, Math.cos(th)), mul(n, Math.sin(th)));
  const legStart = add(origin, add(mul(o, rh * Math.sin(th)), mul(n, rh - rh * Math.cos(th))));
  const meta = { feature: f.id, O: origin, edgeStart: e0, d, o, n, th, r: rh, t, L, L0: Lw, relief, legStart, legDir, flip: !!f.flip, angle: Number(f.angle) || 90, extS, extE,
    // Doppelsaum: zweite Biegelinie in der Abwicklung, L1 hinter der ersten Biegezone (Gegenrichtung)
    ...(dbl ? { extraBends: [{ at: dbl.L1, BA: dbl.BA2, r: rh, angle: 180, flip: !f.flip }] } : {}) };
  return { tool, meta, reliefCut };
}
let sheetMeta = null;

/* ---------- Biegung entlang Skizzenlinie (wie „Biegen“ im Blech) ----------
   Die Linie liegt auf einer Blechfläche und ist die Mitte der Biegezone. Teil auf der festen Seite bleibt, die Biegezone
   (Breite BA = θ·(r + k·t)) wird zum Bogen, der Rest wird um BA zurückgeschoben und um θ um die Biegeachse gedreht. */
/* Punkt bzw. Richtung um eine Achse drehen (Rechtssinn, wie replicad rotate) */
function rotAbout(p, o, k, ang) {
  const v = sub(p, o), c = Math.cos(ang), s = Math.sin(ang);
  return add(o, add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))));
}
/* Falten an Skizzenlinien. Die erste Linie legt mit „Bewegte Seite“ fest, was stehen bleibt;
   jede weitere Linie bewegt die Seite, die von diesem festen Teil abgewandt ist. Abgearbeitet wird vom festen Teil
   nach außen; eine Linie auf einer schon bewegten Seite wandert mit derselben starren Bewegung mit. Für die
   Abwicklung bleiben die Linien an ihrer Stelle im flachen Blech (meta). */
function bendSheet(f, sk, bodies) {
  needPlane(sk);
  const t = sheetRule.t, r = sheetRule.r, k = sheetRule.k;
  const pm = pointMap(sk);
  const lines = sk.curves.filter(c => c.type === 'line' && !c.cons && !c.ref && pm.get(c.p1) && pm.get(c.p2));
  if (!lines.length) throw new Error('Die Skizze braucht eine Linie als Biegelinie');
  const th = (Number(f.angle) || 90) * Math.PI / 180;
  if (!(th > 0.01 && th < Math.PI - 0.01)) throw new Error('Winkel zwischen 1° und 179°');
  const BA = th * (r + k * t), pl = sk.plane;
  /* je Linie eigene Werte (f.linien[Linien-ID] = { angle, flip, r }, z. B. aus einem STEP-Blechteil), sonst die des
     Features; die Eckfreischnitte sich kreuzender Linien rechnen mit den Feature-Werten */
  const je = c => { const o = (f.linien && f.linien[c.id]) || {}, a = (Number(o.angle) || Number(f.angle) || 90) * Math.PI / 180, ri = Number(o.r) >= 0 ? Number(o.r) : r; return { th: a, flip: o.flip != null ? !!o.flip : !!f.flip, r: ri, BA: a * (ri + k * t) }; };
  let L = lines.map(c => {
    const A = toWorld(pl, pm.get(c.p1).x, pm.get(c.p1).y), B = toWorld(pl, pm.get(c.p2).x, pm.get(c.p2).y);
    return { A, B, n0: pl.n, A0: A, B0: B, ...je(c) };
  }).filter(x => len(sub(x.B, x.A)) > 1e-6);
  if (L.some(x => !(x.th > 0.01 && x.th < Math.PI - 0.01))) throw new Error('Winkel zwischen 1° und 179°');
  if (!L.length) throw new Error('Die Skizze braucht eine Linie als Biegelinie');
  // fester Bezugspunkt: neben der ersten Linie auf der Seite, die stehen bleibt
  const d1 = norm(sub(L[0].B, L[0].A)), u1 = mul(norm(cross(L[0].n0, d1)), f.side ? -1 : 1);
  const S0 = sub(mul(add(L[0].A, L[0].B), 0.5), mul(u1, L[0].BA / 2 + Math.max(1, t)));
  const distS = x => { const d = norm(sub(x.B, x.A)), w = sub(S0, x.A); return len(sub(w, mul(d, dot(w, d)))); };
  L = [L[0], ...L.slice(1).sort((a, b) => distS(a) - distS(b))];
  /* Sich kreuzende Linien (z. B. Kasten aus einem Zuschnitt): an jeder Kreuzung Eckfreischnitt – es entfällt, was
     jenseits der festen Kante beider Biegezonen liegt (Viereck mit Spitze im Schnittpunkt der um BA/2 zur festen Seite
     versetzten Linien). Die bewegte Seite je Linie wie unten: erste Linie nach „Bewegte Seite“, sonst vom festen
     Bezugspunkt weg. Danach endet jede Lasche und Biegezone an der Nachbarlinie. */
  const uFlat = (x, li) => { const d = norm(sub(x.B, x.A)); let u = norm(cross(x.n0, d)); if (li === 0) return mul(u, f.side ? -1 : 1); return dot(sub(S0, mul(add(x.A, x.B), 0.5)), u) > 0 ? mul(u, -1) : u; };
  const reliefs = [];
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    const p = L[a], q = L[b], d = sub(p.B, p.A), e = sub(q.B, q.A), w = sub(q.A, p.A), n = p.n0;
    const den = dot(cross(d, e), n);
    if (Math.abs(den) < 1e-9) continue;
    const s1 = dot(cross(w, e), n) / den, s2 = dot(cross(w, d), n) / den;
    if (!(s1 > 1e-6 && s1 < 1 - 1e-6 && s2 > 1e-6 && s2 < 1 - 1e-6)) continue;
    const X = add(p.A, mul(d, s1)), da = norm(d), db = norm(e), ua = uFlat(p, a), ub = uFlat(q, b);
    const C0 = add(add(X, mul(da, -BA / 2 / dot(da, ub))), mul(db, -BA / 2 / dot(db, ua)));
    reliefs.push({ C0, ra: mul(da, Math.sign(dot(da, ub))), rb: mul(db, Math.sign(dot(db, ua))), n });
  }
  const metas = [];
  let body = null, S = S0;
  if (reliefs.length) {
    const vM = R.makeVertex(mul(add(L[0].A, L[0].B), 0.5));
    const b0 = bodies.find(b => { try { return R.measureDistanceBetween(b.shape, vM) < 1e-4; } catch (_) { return false; } });
    if (!b0) throw new Error('Die Biegelinie liegt auf keinem Blech');
    const bb = bbOf(b0.shape), SZ = len(sub(bb[1], bb[0])) * 2 + 20;
    reliefs.forEach(({ C0, ra, rb, n }) => {
      const P = [C0, add(C0, mul(ra, SZ)), add(add(C0, mul(ra, SZ)), mul(rb, SZ)), add(C0, mul(rb, SZ))].map(x => add(x, mul(n, -(t + 1))));
      const cut = bool(b0.shape, R.basicFaceExtrusion(R.makePolygon(P), new R.Vector(mul(n, 2 * t + 2))), 'cut');
      if (cut) b0.shape = tidy(cut);
    });
  }
  for (let li = 0; li < L.length; li++) {
    const { A, B, n0, A0, B0, th, r, BA } = L[li], fl = L[li].flip;
    const d = norm(sub(B, A));
    /* Bezugspunkt auf der Linie, an dem Material ist: die Mitte, sonst die nächste Stelle daneben (Biegung durch einen
       Schlitz geteilt – die Linie läuft über die ganze Biegung, ihre Mitte liegt im Schlitz) */
    let M = mul(add(A, B), 0.5), bd0 = null;
    for (const q of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9, 0.03, 0.97]) {
      const P = add(A, mul(sub(B, A), q)), vP = R.makeVertex(P);
      bd0 = bodies.find(b => { try { return R.measureDistanceBetween(b.shape, vP) < 1e-4; } catch (_) { return false; } });
      if (bd0) { M = P; break; }
    }
    if (!bd0) throw new Error(L.length > 1 ? `Biegelinie ${li + 1} liegt auf keinem Blech` : 'Die Biegelinie liegt auf keinem Blech');
    if (body && bd0 !== body) throw new Error('Alle Biegelinien müssen auf demselben Blech liegen');
    body = bd0;
    const sMat = materialSideAt([body], M, n0);
    if (!sMat) throw new Error('Die Biegelinie muss auf einer Blechfläche liegen');
    const bd = fl ? mul(n0, -1) : n0;
    // bewegte Seite: bei der ersten Linie nach „Bewegte Seite“, danach die vom festen Bezugspunkt abgewandte
    let u = norm(cross(n0, d));
    if (li === 0) u = mul(u, f.side ? -1 : 1);
    else if (dot(sub(S, M), u) > 0) u = mul(u, -1);
    const hLo = Math.min(0, sMat * t), hHi = Math.max(0, sMat * t);
    const hi = fl ? hLo : hHi; // Innenseite (in Biegerichtung)
    const bb = bbOf(body.shape), SZ = len(sub(bb[1], bb[0])) * 2 + 20;
    const P0 = sub(M, mul(u, BA / 2)), P1 = add(M, mul(u, BA / 2));
    let fixed = body.shape.intersect(halfSpace(P0, mul(u, -1), SZ));
    /* Streifen und bewegte Seite nur, soweit sie an DIESER Biegelinie hängen: die Ebenen schneiden bei gebogenen
       Teilen auch andere Laschen gleicher Höhe (Hutprofil, Kasten) – die bleiben, wo sie sind */
    const teile = sh => { try { const x = sh.solids; return x && x.length ? x : [sh]; } catch (_) { return [sh]; } };
    const nah = (x, y) => { try { return R.measureDistanceBetween(x, y) < 1e-4; } catch (_) { return false; } };
    const linieE = R.makeLine(A, B), rest = [];
    const stripTeile = teile(body.shape.intersect(halfSpace(P0, u, SZ)).intersect(halfSpace(P1, mul(u, -1), SZ))).filter(x => (safeVolume(x) || 0) > 1e-9);
    const stripAn = stripTeile.filter(x => nah(x, linieE));
    stripTeile.forEach(x => { if (!stripAn.includes(x)) rest.push(x); });
    if (!stripAn.length) throw new Error('Die Biegelinie kreuzt das Blech nicht');
    const movTeile = teile(body.shape.intersect(halfSpace(P1, u, SZ))).filter(x => (safeVolume(x) || 0) > 1e-9);
    const movAn = movTeile.filter(x => stripAn.some(y => nah(x, y)));
    movTeile.forEach(x => { if (!movAn.includes(x)) rest.push(x); });
    const strip = stripAn.slice(1).reduce((a, x) => a.fuse(x), stripAn[0]);
    let moving = movAn.length ? movAn.slice(1).reduce((a, x) => a.fuse(x), movAn[0]) : null;
    const aufBewegt = P => movAn.some(x => nah(x, R.makeVertex(P)));
    // Breite der Biegezone entlang der Linie aus dem Blechstreifen
    const sb = bbOf(strip);
    const ds = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(q => dot(sub([sb[i][0], sb[j][1], sb[q][2]], P0), d))));
    const dmin = Math.min(...ds), dmax = Math.max(...ds);
    if (!(dmax - dmin > 1e-3)) throw new Error('Die Biegelinie kreuzt das Blech nicht');
    const kAx = norm(cross(u, bd));
    const Ax = add(add(P0, mul(n0, hi)), mul(bd, r));
    // welche späteren Linien auf der bewegten Seite liegen, vor dem Drehen prüfen
    /* eine spätere Linie wandert mit, wenn sie auf dem bewegten Teil liegt und nirgends auf dem festen – geprüft an Stellen
       entlang der Linie, denn gezeichnete Biegelinien ragen meist über das Blech hinaus, und eine Linie, die diese kreuzt
       (Kasten aus einem Zuschnitt), liegt auf beiden Seiten und bleibt */
    const mitBewegt = L.map((x, lj) => {
      if (lj <= li) return false;
      const P = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map(q => add(x.A, mul(sub(x.B, x.A), q)));
      return P.some(aufBewegt) && !P.some(q => nah(fixed, R.makeVertex(q)));
    });
    if (moving) moving = moving.translate(...mul(u, -BA)).rotate(th * 180 / Math.PI, Ax, kAx);
    // Biegezone: Querschnitt an der festen Kante um die Achse drehen – nur wo an der Biegelinie Material ist (eine durch
    // einen Schlitz geteilte Biegung bleibt geteilt): Abschnitte aus dem Schnitt einer Linie in Blechmitte mit dem Streifen
    const ny = cross(mul(u, -1), d), sy = dot(ny, n0) > 0 ? 1 : -1;
    let spans = [[dmin, dmax]];
    try {
      const Q = add(M, mul(n0, (hLo + hHi) / 2)), q0 = dot(sub(Q, P0), d);
      const lineE = R.makeLine(add(Q, mul(d, dmin - 1 - q0)), add(Q, mul(d, dmax + 1 - q0)));
      const oc = R.getOC(), op = new oc.BRepAlgoAPI_Common(), LA = new oc.NCollection_List_TopoDS_Shape(), LT = new oc.NCollection_List_TopoDS_Shape();
      try {
        LA.Append(lineE.wrapped); LT.Append(strip.wrapped); op.SetArguments(LA); op.SetTools(LT); op.Build();
        if (!op.HasErrors()) {
          const st = R.cast(op.Shape()).edges.map(e => [dot(sub(e.startPoint.toTuple(), P0), d), dot(sub(e.endPoint.toTuple(), P0), d)].sort((x, y) => x - y)).filter(([x, y]) => y - x > 1e-6).sort((x, y) => x[0] - y[0]);
          const zu = [];
          st.forEach(([x, y]) => { const l = zu[zu.length - 1]; if (l && x <= l[1] + 1e-6) l[1] = Math.max(l[1], y); else zu.push([x, y]); });
          // nur die Lücken übernehmen: die äußeren Enden wie bisher aus der Ausdehnung des Streifens (schräge Biegelinie)
          if (zu.length) { zu[0][0] = Math.min(zu[0][0], dmin); zu[zu.length - 1][1] = Math.max(zu[zu.length - 1][1], dmax); spans = zu; }
        }
      } finally { op.delete(); LA.delete(); LT.delete(); }
    } catch (_) { spans = [[dmin, dmax]]; }
    let zone = null;
    for (const [s0, s1] of spans) {
      const pts = [[s0, hLo * sy], [s1, hLo * sy], [s1, hHi * sy], [s0, hHi * sy]];
      let pen = R.draw(pts[0]); pts.slice(1).forEach(q => { pen = pen.lineTo(q); });
      const z = pen.close().sketchOnPlane(new R.Plane(P0, d, mul(u, -1))).revolve(kAx, { origin: Ax, angle: th * 180 / Math.PI });
      zone = zone ? zone.fuse(z) : z;
    }
    let neu = fixed.fuse(zone);
    if (moving) neu = neu.fuse(moving);
    rest.forEach(x => { neu = neu.fuse(x); });
    body.shape = tidy(neu);
    metas.push({ a: A0, b: B0, angle: Math.round(th * 1800 / Math.PI) / 10, up: !fl, r });
    // weitere Linien auf der bewegten Seite wandern mit: verschieben um −u·BA, dann um die Biegeachse drehen
    const mv = p => rotAbout(add(p, mul(u, -BA)), Ax, kAx, th);
    for (let lj = li + 1; lj < L.length; lj++) {
      const x = L[lj];
      if (mitBewegt[lj]) L[lj] = { ...x, A: mv(x.A), B: mv(x.B), n0: norm(rotAbout(add(x.n0, Ax), Ax, kAx, th).map((v, ii) => v - Ax[ii])) };
    }
  }
  return { body, meta: metas[0], metas, reliefs: reliefs.length, fixedAt: S0, n0: pl.n };
}

/* ---------- Rahmen aus Stahlprofilen ----------
   Jede Skizzenlinie wird ein eigener Körper. Ecken mit genau zwei Stäben: Gehrung (Winkelhalbierende) oder stumpf
   (der frühere Stab läuft durch, der spätere stößt an). Liefert die Zuschnittliste in frameMeta. */
let frameMeta = [];
/* ---------- Rippe ----------
   Jede Skizzenlinie wird eine Wand der Dicke t (mittig zur Skizzenebene), die bis zum Körper reicht.
   Weg: großer Streifen von der Linie zum Körper hin, Körper abziehen, das Stück an der Linie behalten. */
function ribTool(f, sk, bodies) {
  needPlane(sk);
  const t = Number(f.thickness);
  if (!(t > 0)) throw new Error('Dicke muss größer als 0 sein');
  if (!bodies.length) throw new Error('Eine Rippe braucht einen vorhandenen Körper');
  const pl = sk.plane, pm = pointMap(sk);
  const lines = sk.curves.filter(c => c.type === 'line' && !c.cons && !c.ref);
  if (!lines.length) throw new Error('Die Skizze braucht eine Linie für die Rippe');
  const bb = allBoundsGrob(bodies), big = len(sub(bb[1], bb[0])) * 2 + 10;
  const ctr = mul(add(bb[0], bb[1]), 0.5), c2 = [dot(sub(ctr, pl.o), pl.x), dot(sub(ctr, pl.o), pl.y)];
  let out = null;
  lines.forEach(c => {
    const A = [pm.get(c.p1).x, pm.get(c.p1).y], B = [pm.get(c.p2).x, pm.get(c.p2).y];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-6) return;
    const d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nr = [-d[1], d[0]], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const tryside = side => {
      const v = [nr[0] * side, nr[1] * side];
      const P = (q, a, b) => [q[0] + d[0] * a + v[0] * b, q[1] + d[1] * a + v[1] * b];
      const pts = [P(A, -big, 0), P(B, big, 0), P(B, big, big), P(A, -big, big)];
      let rest;
      const dr = Math.max(0, Math.min(30, Number(f.draft) || 0)) * Math.PI / 180;
      if (dr > 1e-9) {
        // Formschräge: die Rippe wird zum Körper hin breiter (halbe Dicke t/2 + s·tan α)
        const W2 = q => toWorld(pl, q[0], q[1]), Dw = add(mul(pl.x, d[0]), mul(pl.y, d[1])), Vw = add(mul(pl.x, v[0]), mul(pl.y, v[1])), N = pl.n;
        const S = sub(W2(A), mul(Dw, big)), wb = t / 2 + big * Math.tan(dr);
        const quad = [add(S, mul(N, t / 2)), add(S, mul(N, -t / 2)), add(add(S, mul(Vw, big)), mul(N, -wb)), add(add(S, mul(Vw, big)), mul(N, wb))];
        rest = R.basicFaceExtrusion(R.makePolygon(quad), new R.Vector(mul(Dw, L + 2 * big)));
      } else {
        let pen = R.draw(pts[0]); pts.slice(1).forEach(q => { pen = pen.lineTo(q); });
        rest = pen.close().sketchOnPlane(makePlane(pl, -t / 2)).extrude(t);
      }
      bodies.forEach(b => { if (bbOverlap(bbGrob(b.shape), bbGrob(rest), 1e-4)) rest = rest.cut(b.shape); });
      let sols = [];
      try { sols = rest.solids || [rest]; } catch (_) { sols = [rest]; }
      const probe = R.makeVertex(toWorld(pl, M[0] + v[0] * 0.05, M[1] + v[1] * 0.05));
      const pc = sols.find(sl => { try { return R.measureDistanceBetween(sl, probe) < 1e-7; } catch (_) { return false; } });
      if (!pc) return null;
      const pb = bbOf(pc);
      return len(sub(pb[1], pb[0])) > big * 0.9 ? null : pc;
    };
    // Seite zum Körper: die Seite, auf der der Streifen vom Körper begrenzt wird
    const first = (c2[0] - M[0]) * nr[0] + (c2[1] - M[1]) * nr[1] < 0 ? -1 : 1;
    const cands = [first, -first].map(sd => ({ sd, pc: tryside(sd) })).filter(x => x.pc);
    if (!cands.length) throw new Error('Die Rippe trifft den Körper nicht – liegt die Linie in einer offenen Ecke?');
    const piece = (f.flip && cands.length > 1 ? cands[1] : cands[0]).pc;
    out = out ? out.fuse(piece) : piece;
  });
  if (!out) throw new Error('Keine gültige Linie für die Rippe');
  return out;
}

/* Steg: jede Linie der Skizze wird eine Wand der Dicke t (mittig zur Linie), die von der
   Skizzenebene um die Tiefe in Normalenrichtung (oder entgegen) wächst. „Bis zum Körper verlängern“: die Linie wird
   beidseitig verlängert und an den Wänden des Körpers abgeschnitten (das Stück, in dem die Linie liegt). */
function webTool(f, sk, bodies) {
  needPlane(sk);
  const t = Number(f.thickness), depth = Number(f.depth);
  if (!(t > 0)) throw new Error('Dicke muss größer als 0 sein');
  if (!(depth > 0)) throw new Error('Tiefe muss größer als 0 sein');
  const pl = sk.plane, pm = pointMap(sk);
  const lines = sk.curves.filter(c => c.type === 'line' && !c.cons && !c.ref);
  if (!lines.length) throw new Error('Die Skizze braucht Linien für den Steg');
  const sgn = f.flip ? -1 : 1, ext = f.extend !== false && bodies.length;
  const bb = bodies.length ? allBoundsGrob(bodies) : null, big = bb ? len(sub(bb[1], bb[0])) * 2 + 10 : 0;
  const prism = (A, B) => {
    const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L], n2 = [-u[1] * t / 2, u[0] * t / 2];
    const pts = [[A[0] + n2[0], A[1] + n2[1]], [B[0] + n2[0], B[1] + n2[1]], [B[0] - n2[0], B[1] - n2[1]], [A[0] - n2[0], A[1] - n2[1]]];
    let pen = R.draw(pts[0]); pts.slice(1).forEach(q => { pen = pen.lineTo(q); });
    return pen.close().sketchOnPlane(makePlane(pl, sgn > 0 ? 0 : -depth)).extrude(depth);
  };
  let out = null, extended = 0;
  lines.forEach(c => {
    const A = [pm.get(c.p1).x, pm.get(c.p1).y], B = [pm.get(c.p2).x, pm.get(c.p2).y], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-6) return;
    let piece = null;
    if (ext) {
      const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], A2 = [A[0] - u[0] * big, A[1] - u[1] * big], B2 = [B[0] + u[0] * big, B[1] + u[1] * big];
      let rest = prism(A2, B2);
      bodies.forEach(b => { if (bbOverlap(bbGrob(b.shape), bbGrob(rest), 1e-4)) rest = rest.cut(b.shape); });
      let sols = [];
      try { sols = rest.solids || [rest]; } catch (_) { sols = [rest]; }
      const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], probe = R.makeVertex(add(toWorld(pl, M[0], M[1]), mul(pl.n, sgn * depth / 2)));
      const pc = sols.find(sl => { try { return R.measureDistanceBetween(sl, probe) < 1e-7; } catch (_) { return false; } });
      // nur nehmen, wenn das Stück beidseitig von Wänden begrenzt ist
      if (pc) { const pb = bbOf(pc); if (len(sub(pb[1], pb[0])) < big * 0.9) { piece = pc; extended++; } }
    }
    if (!piece) piece = prism(A, B);
    out = out ? out.fuse(piece) : piece;
  });
  if (!out) throw new Error('Keine gültige Linie für den Steg');
  return { tool: out, extended, count: lines.length };
}

/* Zeichnungen: Gewinde nur kosmetisch (Helix-Flächen machen die Ansichtsberechnung sehr langsam) */
let cosmeticThreads = false;

/* ---------- Konturlasche ----------
   Offener Linienzug = eine Blechoberfläche. Dicke zur gewählten Seite, an jedem Knick ein Biegeradius
   (innen r, außen r + t). Liefert Körper und Abwicklungsdaten. */
function chain2D(sk) {
  const pm = pointMap(sk);
  const curves = sk.curves.filter(c => !c.cons && !c.ref);
  if (!curves.length) throw new Error(`${sk.name} hat keine Linien`);
  if (curves.some(c => c.type !== 'line')) throw new Error('Die Kontur darf nur aus Linien bestehen (Biegungen entstehen automatisch)');
  const deg = new Map();
  curves.forEach(c => [c.p1, c.p2].forEach(id => deg.set(id, (deg.get(id) || 0) + 1)));
  if ([...deg.values()].some(v => v > 2)) throw new Error('Die Kontur verzweigt sich');
  const ends = [...deg.entries()].filter(([, v]) => v === 1).map(([k]) => k);
  if (ends.length !== 2) throw new Error('Die Kontur muss ein offener Linienzug sein');
  const left = curves.slice(), out = [ends[0]];
  let at = ends[0];
  while (left.length) {
    const i = left.findIndex(c => c.p1 === at || c.p2 === at);
    if (i < 0) throw new Error('Die Kontur ist nicht zusammenhängend');
    const c = left.splice(i, 1)[0];
    at = c.p1 === at ? c.p2 : c.p1;
    out.push(at);
  }
  return out.map(id => [pm.get(id).x, pm.get(id).y]);
}
function contourTool(f, sk, rule) {
  needPlane(sk);
  const t = rule.t, r = rule.r, k = rule.k;
  if (!(t > 0)) throw new Error('Blechdicke fehlt (Blechregel)');
  let P = chain2D(sk);
  if (f.reverseChain) P = P.reverse();
  // gerade durchlaufende Punkte entfernen
  P = P.filter((q, i) => {
    if (i === 0 || i === P.length - 1) return true;
    const a = [q[0] - P[i - 1][0], q[1] - P[i - 1][1]], b = [P[i + 1][0] - q[0], P[i + 1][1] - q[1]];
    return Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-9 * Math.hypot(...a) * Math.hypot(...b) || a[0] * b[0] + a[1] * b[1] < 0;
  });
  const side = f.flip ? -1 : 1, n = P.length - 1;
  const V = (a, b) => [b[0] - a[0], b[1] - a[1]], A2 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];
  const U2 = v => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  const d = [], L = [];
  for (let i = 0; i < n; i++) { const v = V(P[i], P[i + 1]); L[i] = Math.hypot(v[0], v[1]); if (L[i] < 1e-6) throw new Error('Die Kontur hat eine Linie der Länge 0'); d[i] = [v[0] / L[i], v[1] / L[i]]; }
  const sv = d.map(di => [-di[1] * side, di[0] * side]);
  const corners = [];
  for (let i = 1; i < n; i++) {
    const a = d[i - 1], b = d[i], cr = a[0] * b[1] - a[1] * b[0];
    const th = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    if (th > Math.PI - 1e-3) throw new Error('Eine Biegung um 180° geht nicht');
    const turnLeft = cr > 0, inside = (side > 0) === turnLeft;
    const Rl = inside ? r + t : r, Ro = inside ? r : r + t;
    const T = Rl * Math.tan(th / 2);
    const nl = turnLeft ? [-a[1], a[0]] : [a[1], -a[0]];
    const A = A2(P[i], a, -T), B = A2(P[i], b, T), C = A2(A, nl, Rl);
    corners[i] = { th, Rl, Ro, T, A, B, C, inside };
  }
  for (let i = 0; i < n; i++) {
    const ts = corners[i] ? corners[i].T : 0, te = corners[i + 1] ? corners[i + 1].T : 0;
    if (ts + te > L[i] + 1e-6) throw new Error(`Linie ${i + 1} ist zu kurz für die Biegeradien (mind. ${(ts + te).toFixed(2)} mm)`);
  }
  const mid = (c, R) => { const m = U2(A2(V(c.C, c.A), V(c.C, c.B))); return A2(c.C, m, R); };
  const sc = (c, q, R) => A2(c.C, V(c.C, q), R / c.Rl);
  let pen = R.draw(P[0]);
  for (let i = 1; i < n; i++) { const c = corners[i]; pen = pen.lineTo(c.A); pen = pen.threePointsArcTo(c.B, mid(c, c.Rl)); }
  pen = pen.lineTo(P[n]).lineTo(A2(P[n], sv[n - 1], t));
  for (let i = n - 1; i >= 1; i--) { const c = corners[i]; pen = pen.lineTo(sc(c, c.B, c.Ro)); pen = pen.threePointsArcTo(sc(c, c.A, c.Ro), mid(c, c.Ro)); }
  pen = pen.lineTo(A2(P[0], sv[0], t));
  const drawing = pen.close();
  const W = Number(f.width);
  if (!(W > 0)) throw new Error('Breite muss größer als 0 sein');
  const pl = sk.plane;
  let off = 0, ext = W;
  if (f.direction === 'reverse') ext = -W;
  if (f.direction === 'symmetric') off = -W / 2;
  const tool = drawing.sketchOnPlane(makePlane(pl, off)).extrude(ext);
  // Abwicklung: gerade Stücke und Biegezonen entlang der neutralen Faser
  const w3 = (u, v) => toWorld(pl, u, v), d3 = v => add(mul(pl.x, v[0]), mul(pl.y, v[1]));
  const straights = [], bends = [];
  let Y = 0;
  for (let i = 0; i < n; i++) {
    const ts = corners[i] ? corners[i].T : 0, te = corners[i + 1] ? corners[i + 1].T : 0, l = L[i] - ts - te;
    straights.push({ S: w3(...A2(P[i], d[i], ts)), d: d3(d[i]), s: d3(sv[i]), Y, l });
    Y += l;
    const c = corners[i + 1];
    if (c) { const BA = c.th * (r + k * t); bends.push({ Y0: Y, BA, angle: Math.round(c.th * 180 / Math.PI * 10) / 10, up: c.inside }); Y += BA; }
  }
  const w0 = Math.min(off, off + ext);
  return { tool, meta: { feature: f.id, plane: pl, t, r, k, W, w0, straights, bends, total: Y } };
}
/* Punkt auf eine Fläche gelegt (nächster Flächenpunkt) und die Flächennormale dort, mit der Lage der Fläche */
function surfaceAt(fc, q) {
  const oc = R.getOC();
  const [u, v] = fc.uvCoordinates(q);
  const pnt = new oc.gp_Pnt(0, 0, 0), vec = new oc.gp_Vec(0, 0, 0), bf = new oc.BRepGProp_Face(fc.wrapped, false);
  bf.Normal(u, v, pnt, vec);
  const out = { p: [pnt.X(), pnt.Y(), pnt.Z()], n: norm([vec.X(), vec.Y(), vec.Z()]) };
  pnt.delete(); vec.delete(); bf.delete();
  return out;
}
function profileDrawing(p) {
  const s = profileShape(p);
  const D = o => {
    if (o.circle) return R.drawCircle(o.circle);
    if (o.rrect) return o.rrect[2] > 0.01 ? R.drawRoundedRectangle(o.rrect[0], o.rrect[1], o.rrect[2]) : R.drawRectangle(o.rrect[0], o.rrect[1]);
    let pen = R.draw(o.poly[0]);
    o.poly.slice(1).forEach(q => { pen = pen.lineTo(q); });
    return pen.close();
  };
  let d = D(s.outer);
  if (s.hole) d = d.cut(D(s.hole));
  return d;
}
function halfSpace(P, n, S) {
  return R.drawRectangle(2 * S, 2 * S).sketchOnPlane(new R.Plane(P, anyPerp(n), n)).extrude(S);
}
function frameTool(f, solved, byId) {
  // Stablinien aus einer oder mehreren Skizzen (z. B. Rahmen oben + Beine)
  const ids = [...new Set([f.sketch, ...(Array.isArray(f.sketches) ? f.sketches : [])].filter(Boolean))];
  const sks = ids.map(id => { const k = solved.get(id) || byId[id]; if (!k || k.type !== 'sketch') throw new Error('Eine Skizze mit Stablinien fehlt'); return migrateSketch(k); });
  const prof = { kind: f.kind, size: f.size, w: Number(f.w), h: Number(f.h), t: Number(f.t), tw: Number(f.tw), tf: Number(f.tf) };
  if (prof.kind === 'square') prof.h = prof.w;
  if (prof.kind === 'round' || prof.kind === 'bar') prof.h = prof.w;
  profileShape(prof); // prüft die Maße
  const [bw, bh] = profileBox(prof), big = Math.hypot(bw, bh) * 3 + 10;
  const lines = sks.flatMap(sk => {
    const pm = pointMap(sk);
    const W = p => sk.plane ? toWorld(sk.plane, p.x, p.y) : pt3(p);   // Stäbe dürfen aus einer 3D-Skizze kommen
    return sk.curves.filter(c => c.type === 'line' && !c.cons && !c.ref && (!Array.isArray(f.lines) || !f.lines.length || f.lines.includes(c.id)))
      .map(c => ({ c, sk, A: W(pm.get(c.p1)), B: W(pm.get(c.p2)) }));
  });
  if (!lines.length) throw new Error('Die Skizze hat keine Linien für Stäbe');
  const rot = (Number(f.rot) || 0) * Math.PI / 180;
  const key = q => q.map(v => Math.round(v * 1e4)).join(',');
  const M = lines.map(({ c, sk, A, B }, i) => {
    const L = len(sub(B, A));
    if (L < 1e-6) return null;
    const u = norm(sub(B, A));
    const n = sk.plane ? norm(sk.plane.n) : anyPerp(u);   // 3D-Skizze: ohne Ebene, die Lage des Profils ist frei
    let px = norm(cross(n, u));
    if (len(cross(n, u)) < 1e-9) px = anyPerp(u);
    const py = cross(u, px);
    const q = px;
    px = norm(add(mul(px, Math.cos(rot)), mul(py, Math.sin(rot))));
    return { i, A, B, L, u, px, py: cross(u, px), q, n, sk: sk.id, line: c.id };
  }).filter(Boolean);
  // Lage des Profils: bündig oben/unten zur Skizzenebene, innen/außen zur Mitte aller Stäbe
  const G = M.reduce((a, m) => add(a, mul(add(m.A, m.B), 0.5 / M.length)), [0, 0, 0]);
  M.forEach(m => {
    const n = m.n, eN = Math.abs(dot(n, m.px)) * bw / 2 + Math.abs(dot(n, m.py)) * bh / 2;
    const eQ = Math.abs(dot(m.q, m.px)) * bw / 2 + Math.abs(dot(m.q, m.py)) * bh / 2;
    const inSign = dot(sub(G, mul(add(m.A, m.B), 0.5)), m.q) < 0 ? -1 : 1;
    // Stäbe aus weiteren Skizzen (z. B. Beine): auch quer zur eigenen Skizze nach innen/außen statt oben/unten
    const inN = dot(sub(G, mul(add(m.A, m.B), 0.5)), n) < 0 ? -1 : 1;
    const oN = m.sk === f.sketch
      ? (f.alignY === 'top' ? -eN : f.alignY === 'bottom' ? eN : 0)
      : (f.alignX === 'inside' ? inN * eN : f.alignX === 'outside' ? -inN * eN : 0);
    const oQ = f.alignX === 'inside' ? inSign * eQ : f.alignX === 'outside' ? -inSign * eQ : 0;
    m.off = add(mul(n, oN), mul(m.q, oQ));
    m.ox = dot(m.off, m.px); m.oy = dot(m.off, m.py);
  });
  const joints = new Map();
  M.forEach(m => [[m.A, 0], [m.B, 1]].forEach(([P, end]) => { const k = key(P); if (!joints.has(k)) joints.set(k, []); joints.get(k).push({ m, end }); }));
  // halbe Ausdehnung des Querschnitts von m in Richtung d
  const half = (m, d) => dot(d, m.off) + Math.abs(dot(d, m.px)) * bw / 2 + Math.abs(dot(d, m.py)) * bh / 2;
  const made = [];
  M.forEach((m, k) => {
    const ends = [[m.A, 0, m.u], [m.B, 1, mul(m.u, -1)]].map(([P, end, ui]) => {
      const js = joints.get(key(P)).filter(j => j.m !== m);
      if (!js.length && f.corners !== 'none') {
        // T-Stoß: Ende liegt mitten auf einem anderen Stab → dort stumpf anstoßen
        const o = M.find(q => { if (q === m) return false; const s = dot(sub(P, q.A), q.u); return s > 1e-6 && s < q.L - 1e-6 && len(sub(P, add(q.A, mul(q.u, s)))) < 1e-5; });
        if (o && Math.abs(dot(ui, o.u)) < 0.999) {
          const e = half(o, ui);
          return { P, ui, cut: { at: add(P, mul(ui, e)), n: ui }, ext: big, longExt: -e, angle: 0 };
        }
      }
      if (js.length >= 2 && f.corners !== 'none') {
        // Knoten mit 3+ Stäben: zwei Stäbe derselben Skizze bilden die Ecke, die übrigen stoßen stumpf an
        const all = [{ m, end }, ...js];
        let pair = null;
        for (let a = 0; a < all.length && !pair; a++) for (let b = a + 1; b < all.length && !pair; b++) {
          if (all[a].m.sk === all[b].m.sk && Math.abs(dot(all[a].m.u, all[b].m.u)) < 0.999) pair = [all[a], all[b]];
        }
        if (pair && pair.some(x => x.m === m)) {
          js.splice(0, js.length, pair.find(x => x.m !== m));
        } else if (pair) {
          const e = Math.max(...pair.map(x => (Math.abs(dot(ui, x.m.u)) < 0.999 ? half(x.m, ui) : 0)));
          return { P, ui, cut: { at: add(P, mul(ui, e)), n: ui }, ext: big, longExt: -e, angle: 0 };
        }
      }
      if (js.length !== 1 || f.corners === 'none') return { P, ui, cut: null, ext: 0, longExt: 0, angle: 0 };
      const o = js[0].m, uj = js[0].end === 0 ? o.u : mul(o.u, -1);
      if (len(sub(ui, uj)) < 1e-9) return { P, ui, cut: null, ext: 0, longExt: 0, angle: 0 };
      if (f.corners === 'butt') {
        if (Math.abs(dot(ui, uj)) > 0.999) return { P, ui, cut: null, ext: 0, longExt: 0, angle: 0 };
        const through = m.i < o.i;
        const e = through ? half(o, mul(ui, -1)) : half(o, ui);
        const at = through ? sub(P, mul(ui, e)) : add(P, mul(ui, e));
        return { P, ui, cut: { at, n: ui }, ext: big, longExt: through ? e : -e, angle: 0 };
      }
      const nm = norm(sub(ui, uj)), c = dot(ui, nm);
      const longExt = (dot(nm, m.off) + Math.abs(dot(nm, m.px)) * bw / 2 + Math.abs(dot(nm, m.py)) * bh / 2) / c;
      return { P, ui, cut: { at: P, n: nm }, ext: big, longExt, angle: Math.acos(Math.min(1, c)) * 180 / Math.PI };
    });
    const start = sub(m.A, mul(m.u, ends[0].ext)), total = m.L + ends[0].ext + ends[1].ext;
    let d2 = profileDrawing(prof);
    if (Math.abs(m.ox) > 1e-9 || Math.abs(m.oy) > 1e-9) d2 = d2.translate(m.ox, m.oy);
    let tool = d2.sketchOnPlane(new R.Plane(start, m.px, m.u)).extrude(total);
    // Halbraum groß genug für den ganzen Stab (sonst würde ein langer Stab am anderen Ende gekappt)
    ends.forEach(e => { if (e.cut) tool = tool.intersect(halfSpace(e.cut.at, e.cut.n, total + big * 4)); });
    const id = `${f.id}:${k}`;
    made.push({ id, tool, line: m.line });
    // A/B/px/prof: Systemlinie (Skizzenlinie) und Profilachse für die Rahmen-Festigkeit (src/sim/frame.js)
    frameMeta.push({ id, feature: f.id, label: profileLabel(prof), L: m.L, Lmax: m.L + ends[0].longExt + ends[1].longExt, angles: [ends[0].angle, ends[1].angle], kind: prof.kind, A: m.A, B: m.B, px: m.px, prof });
  });
  return made;
}

/* ---------- Bohrung ---------- */
/* Lagen der Bohrungen: einzelne Punkte der Skizze, sonst Kreismittelpunkte */
const toWorld = (pl, u, v) => [pl.o[0] + pl.x[0] * u + pl.y[0] * v, pl.o[1] + pl.x[1] * u + pl.y[1] * v, pl.o[2] + pl.x[2] * u + pl.y[2] * v];

/* Halber Querschnitt der Bohrung in (Radius, Tiefe): Tiefe 0 = Skizzenebene, positiv ins Material */
function holeProfile(f, depth) {
  const r = Number(f.d) / 2;
  if (!(r > 1e-6)) throw new Error('Bohrungsdurchmesser muss größer als 0 sein');
  const pts = [[0, -1]];
  if (f.kind === 'cbore') {
    const R2 = Number(f.cd) / 2, h = Number(f.cdepth);
    if (!(R2 > r)) throw new Error('Senkdurchmesser muss größer als die Bohrung sein');
    if (!(h > 0 && h < depth)) throw new Error('Senktiefe passt nicht zur Bohrtiefe');
    pts.push([R2, -1], [R2, h], [r, h]);
  } else if (f.kind === 'csk') {
    const R2 = Number(f.cd) / 2, ang = (Number(f.cangle) || 90) * Math.PI / 180;
    if (!(R2 > r)) throw new Error('Senkdurchmesser muss größer als die Bohrung sein');
    const h = (R2 - r) / Math.tan(ang / 2);
    if (!(h < depth)) throw new Error('Die Senkung ist tiefer als die Bohrung');
    pts.push([R2, -1], [R2, 0], [r, h]);
  } else pts.push([r, -1]);
  pts.push([r, depth]);
  // Bohrspitze mit einstellbarem Winkel (Vorgabe 118°): Kegelhöhe r / tan(Winkel / 2)
  const tipA = Number(f.tipAngle) > 0 ? Math.min(179, Math.max(1, Number(f.tipAngle))) : 118;
  if (f.tip === 'drill' && f.depthMode !== 'through') pts.push([0, depth + r / Math.tan(tipA / 2 * Math.PI / 180)]);
  else pts.push([0, depth]);
  return pts;
}
/* Richtung ins Material: zur Seite der Ebene, auf der mehr vom Körper liegt (bei Gleichstand gegen die Normale) */
function intoMaterial(pl, bb) {
  let lo = Infinity, hi = -Infinity;
  for (const x of [bb[0][0], bb[1][0]]) for (const y of [bb[0][1], bb[1][1]]) for (const z of [bb[0][2], bb[1][2]]) {
    const s = dot(sub([x, y, z], pl.o), pl.n);
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  return hi > -lo + 1e-6 ? 1 : -1;
}
/* Materialseite direkt am Bohrpunkt: Probepunkte knapp über/unter der Skizzenebene */
/* Einzelne Festkörper der Körper: der Abstand zu einem Verbund (Compound) misst nur bis zur Oberfläche,
   bei einem Festkörper ist ein Punkt im Inneren dagegen Abstand 0 */
function solidsOf(bodies) {
  const out = [];
  bodies.forEach(b => {
    let ss = [];
    try { ss = b.shape.solids || []; } catch (_) { ss = []; }
    (ss.length ? ss : [b.shape]).forEach(sh => { let bb = null; try { bb = bbGrob(sh); } catch (_) { bb = null; } out.push({ sh, bb }); });
  });
  return out;
}
function insideAny(solids, p) {
  let v = null;
  return solids.some(({ sh, bb }) => {
    // schneller Vorfilter über die Hüllbox
    if (bb && (p[0] < bb[0][0] - 1e-3 || p[1] < bb[0][1] - 1e-3 || p[2] < bb[0][2] - 1e-3 || p[0] > bb[1][0] + 1e-3 || p[1] > bb[1][1] + 1e-3 || p[2] > bb[1][2] + 1e-3)) return false;
    if (!v) v = R.makeVertex(p);
    try { return R.measureDistanceBetween(sh, v) < 1e-7; } catch (_) { return false; }
  });
}
function materialSideAt(bodies, P, n) {
  const sols = solidsOf(bodies);
  const probe = s => insideAny(sols, add(P, mul(n, s * 0.05)));
  const up = probe(1), down = probe(-1);
  if (up && !down) return 1;
  if (down && !up) return -1;
  return 0;
}
/* Bohrplätze: P = Anfang auf der Fläche, x = Richtung in der Fläche, a = Achse ins Material.
   Drei Lagen: Punkte der Skizze, Mitte einer Kreiskante, Abstände zu zwei Kanten. */
function sketchHolePlaces(f, sk, bb, bodies) {
  const pl = needPlane(sk);
  const pts0 = holePoints(sk);
  if (!pts0.length) throw new Error('Die Skizze hat keine einzelnen Punkte oder Kreise für Bohrungen');
  let auto = 0;
  if (bodies) auto = materialSideAt(bodies, toWorld(pl, pts0[0][0], pts0[0][1]), pl.n);
  const a = mul(pl.n, (auto || intoMaterial(pl, bb)) * (f.flip ? -1 : 1));
  return pts0.map(([u, v]) => ({ P: toWorld(pl, u, v), x: pl.x, a }));
}
/* Bohrung in der Mitte einer gewählten runden Kante (ganzer Kreis oder Bogen) */
function ringHolePlaces(f, bodies, bb) {
  const refs = Array.isArray(f.rings) ? f.rings : [];
  if (!refs.length) throw new Error('Erst eine Kreiskante anklicken');
  return refs.map(r => {
    const e = (findSel(bodies, 'edge', r) || {}).shape;
    if (!e) throw new Error('Eine gewählte Kreiskante gibt es nicht mehr');
    if (e.geomType !== 'CIRCLE') throw new Error('Als Lage nur runde Kanten anklicken');
    const p0 = e.pointAt(0).toTuple(), p1 = e.pointAt(0.25).toTuple(), p2 = e.pointAt(0.5).toTuple();
    const C = circleCenter(p0, p1, p2), w = cross(sub(p1, p0), sub(p2, p0));
    if (!C || len(w) < 1e-9) throw new Error('Die gewählte Kreiskante passt nicht');
    const n = norm(w);
    const a = mul(n, materialSideAt(bodies, C, n) || toMiddle(bb, C, n));
    return { P: C, x: norm(sub(p0, C)), a: mul(a, f.flip ? -1 : 1) };
  });
}
/* Bohrung über Abstände zu zwei Kanten: die gemeinsame ebene Fläche ist die Bohrfläche,
   gemessen wird immer nach innen in die Fläche hinein */
/* Bohrung auf einer Kante: Anfang, Mitte oder Ende einer geraden Kante, gebohrt in der
   größten ebenen Fläche an dieser Kante. Anfang/Ende nach der beim Klick gespeicherten Kantenrichtung (ref.d) – die
   Orientierung der Kante im Kern kann nach einem Umbau kippen. */
function onEdgeHolePlaces(f, bodies, bb) {
  const h = f.edgeP && findSel(bodies, 'edge', f.edgeP);
  if (!h) throw new Error(f.edgeP ? 'Die gewählte Kante gibt es nicht mehr' : 'Erst eine gerade Kante anklicken');
  if (h.shape.geomType !== 'LINE') throw new Error('Als Lage nur eine gerade Kante anklicken');
  let p0 = h.shape.startPoint.toTuple(), p1 = h.shape.endPoint.toTuple();
  if (Array.isArray(f.edgeP.d) && dot(sub(p1, p0), f.edgeP.d) < 0) [p0, p1] = [p1, p0];
  const P = f.edgePos === 'start' ? p0 : f.edgePos === 'end' ? p1 : mul(add(p0, p1), 0.5);
  let fc = null, best = -1;
  bodies.forEach(b => b.shape.faces.forEach(g => {
    if (g.geomType !== 'PLANE') return;
    try {
      if (!g.edges.some(x => x.isSame(h.shape))) return;
      const a = R.measureArea(g);
      if (a > best) { best = a; fc = g; }
    } catch (_) { /* Fläche ist für die Lage nicht zu gebrauchen */ }
  }));
  if (!fc) throw new Error('An der Kante liegt keine ebene Fläche');
  const n = norm(fc.normalAt().toTuple());
  const a = mul(n, materialSideAt(bodies, P, n) || toMiddle(bb, P, n));
  return [{ P, x: norm(sub(p1, p0)), a: mul(a, f.flip ? -1 : 1) }];
}
function edgeHolePlaces(f, bodies, bb) {
  const ha = findSel(bodies, 'edge', f.edgeA), hb = findSel(bodies, 'edge', f.edgeB);
  if (!ha || !hb) throw new Error('Eine gewählte Kante gibt es nicht mehr');
  if (ha.shape.geomType !== 'LINE' || hb.shape.geomType !== 'LINE') throw new Error('Als Lage nur gerade Kanten anklicken');
  const dA = Number(f.offA), dB = Number(f.offB);
  if (!(dA >= 0) || !(dB >= 0)) throw new Error('Die Abstände müssen 0 oder größer sein');
  let fc = null, best = -1;
  bodies.forEach(b => b.shape.faces.forEach(g => {
    if (g.geomType !== 'PLANE') return;
    try {
      if (!g.edges.some(x => x.isSame(ha.shape)) || !g.edges.some(x => x.isSame(hb.shape))) return;
      const a = R.measureArea(g);
      if (a > best) { best = a; fc = g; }
    } catch (_) { /* Fläche ist für die Lage nicht zu gebrauchen */ }
  }));
  if (!fc) throw new Error('Die beiden Kanten liegen nicht in einer Fläche');
  const n = norm(fc.normalAt().toTuple()), o = fc.center.toTuple();
  const offset = (e, d) => {
    const p0 = e.startPoint.toTuple(), p1 = e.endPoint.toTuple();
    const w = cross(n, norm(sub(p1, p0)));
    if (len(w) < 1e-9) throw new Error('Eine gewählte Kante liegt nicht in der Fläche');
    let u = norm(w); const mid = mul(add(p0, p1), 0.5);
    if (dot(sub(o, mid), u) < 0) u = mul(u, -1);
    return { u, c: dot(u, mid) + d };
  };
  const A = offset(ha.shape, dA), B = offset(hb.shape, dB);
  const P = solve3([A.u, B.u, n], [A.c, B.c, dot(n, o)]);
  if (!P) throw new Error('Die beiden Kanten sind parallel – die Lage ist nicht bestimmt');
  let outside = false;
  try { outside = R.measureDistanceBetween(fc, R.makeVertex(P)) > 1e-6; } catch (_) { /* nicht prüfbar */ }
  if (outside) throw new Error('Mit den Abständen liegt die Bohrung außerhalb der Fläche');
  const a = mul(n, materialSideAt(bodies, P, n) || toMiddle(bb, P, n));
  return [{ P, x: A.u, a: mul(a, f.flip ? -1 : 1) }];
}
/* Richtung, in der ein Körper liegt – für Mittelpunkte außerhalb des Materials */
const toMiddle = (bb, P, n) => (dot(sub([(bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2], P), n) >= 0 ? 1 : -1);
function holePlaces(f, sk, bb, bodies) {
  if (f.place === 'center') return ringHolePlaces(f, bodies, bb);
  if (f.place === 'edges') return edgeHolePlaces(f, bodies, bb);
  if (f.place === 'onedge') return onEdgeHolePlaces(f, bodies, bb);
  if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
  return sketchHolePlaces(f, sk, bb, bodies);
}
/* Tangentiale Kette (isTangentChain): ausgehend von den gewählten Flächen alle Nachbarflächen dazunehmen,
   die an der gemeinsamen Kante tangential anschließen (Normalen in der Kantenmitte gleich gerichtet). */
function tangentChain(shape, start) {
  const faces = shape.faces, out = [...start];
  const has = fc => out.some(x => { try { return x.isSame(fc); } catch (_) { return false; } });
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    let eds = [];
    try { eds = a.edges; } catch (_) { eds = []; }
    eds.forEach(e => {
      faces.forEach(fc => {
        if (has(fc)) return;
        try {
          if (!fc.edges.some(x => x.isSame(e))) return;
          const p = e.pointAt(0.5).toTuple();
          if (dot(norm(a.normalAt(p).toTuple()), norm(fc.normalAt(p).toTuple())) > 1 - 1e-6) out.push(fc);
        } catch (_) { /* Kante ohne Punkt */ }
      });
    });
  }
  return out;
}
/* Versetzter Kern eines Körpers (BRepOffsetAPI_MakeThickSolid ohne offene Fläche, scharfe Ecken): d < 0 nach innen,
   d > 0 nach außen. Nach außen kommt er verkehrt herum orientiert und wird umgedreht. */
function offsetCore(shape, d, round = false) {
  const oc = R.getOC(), l = new oc.NCollection_List_TopoDS_Shape(), mk = new oc.BRepOffsetAPI_MakeThickSolid();
  mk.MakeThickSolidByJoin(shape.wrapped, l, d, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, round ? oc.GeomAbs_JoinType.GeomAbs_Arc : oc.GeomAbs_JoinType.GeomAbs_Intersection, false);
  const r = R.cast(mk.Shape());
  mk.delete(); l.delete();
  try { const g = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(r.wrapped, g, false, false, false); if (g.Mass() < 0) r.wrapped.Reverse(); g.delete(); } catch (_) { /* Orientierung bleibt */ }
  return r;
}
/* Prägen auf ebene und gekrümmte Flächen: Haut des Körpers in Prägetiefe (Körper − Kern beim
   Gravieren, Kern außen − Körper beim Erhabenen), geschnitten mit dem durch alles gezogenen Profil. Übrig bleiben nur
   die Stücke an der angeklickten Stelle – auf der Rückseite trifft das Profil die Haut ja auch. Das Profil wird
   entlang der Skizzennormalen projiziert. */
/* Prägen: Versatz waagrecht/senkrecht (Skizzen-x/y) und Drehwinkel um die Profilmitte
   (horizontalDistance, verticalDistance, rotationAngle) – in der Skizzenebene, vor dem Projizieren/Abwickeln */
function embossDrawing(f, sk) {
  let dr = sketchDrawing(sk, f.profiles);
  const rot = Number(f.rot) || 0, dx = Number(f.offH) || 0, dy = Number(f.offV) || 0;
  if (Math.abs(rot) > 1e-9) dr = dr.rotate(rot, dr.boundingBox.center);
  if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) dr = dr.translate(dx, dy);
  return dr;
}
/* Abwickeln auf eine Zylinderfläche: längentreu – Skizzenmaß quer zur Achse wird Bogenlänge auf
   dem Zylinder, Maß längs der Achse bleibt. Die Skizzenebene muss parallel zur Achse liegen; die Seite, auf die
   gewickelt wird, gibt die Klickstelle P. Die Skizze wird in die Parameter der Fläche umgerechnet (x = R·Winkel ab der
   X-Richtung des Zylinders zur Seite A × X, y = Höhe längs A ab dem Ursprung) und mit replicads sketchOnFace
   („original“: x/R) auf die Fläche gelegt; das Werkzeug ist diese Flächeninsel radial genau um die Tiefe aufgedickt
   (MakeThickSolidBySimple) – in den Körper (gravieren) bzw. aus ihm heraus (erhaben). Keine Haut wie beim Projizieren:
   die würde an einer Körperkante auch den Deckel mit eindrücken. */
function wrapEmbossTool(f, sk, face, P, body, d) {
  needPlane(sk);
  const oc = R.getOC(), ad = new oc.BRepAdaptor_Surface(face.wrapped), cy = ad.Cylinder(), ax = cy.Position();
  const v3 = g => [g.X(), g.Y(), g.Z()], A = norm(v3(ax.Direction())), XD = norm(v3(ax.XDirection())), Lo = v3(ax.Location()), Rc = cy.Radius();
  const pl = sk.plane, n = norm(pl.n), px = norm(pl.x), py = norm(pl.y);
  if (Math.abs(dot(n, A)) > 1e-6) throw new Error('Zum Abwickeln muss die Skizzenebene parallel zur Zylinderachse liegen');
  const rad = sub(sub(P, Lo), mul(A, dot(sub(P, Lo), A)));
  const e1 = mul(n, dot(rad, n) < 0 ? -1 : 1), e2 = cross(A, e1), YD = cross(A, XD);
  const phi1 = Math.atan2(dot(e1, YD), dot(e1, XD));
  const M = [[dot(px, e2), dot(py, e2)], [dot(px, A), dot(py, A)]], det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  let dr = embossDrawing(f, sk);
  if (det < 0) dr = dr.mirror([1, 0], [0, 0], 'plane');
  const m00 = M[0][0], m10 = M[1][0];
  dr = dr.rotate(Math.atan2(m10, m00) * 180 / Math.PI, [0, 0]).translate(Rc * phi1 + dot(sub(pl.o, Lo), e2), dot(sub(pl.o, Lo), A));
  const on = dr.sketchOnFace(face, 'original');
  const facesOf = s => (s && Array.isArray(s.sketches) ? s.sketches.flatMap(facesOf) : [s.face()]);
  const thickSimple = (F, off) => { const mk = new oc.BRepOffsetAPI_MakeThickSolid(); mk.MakeThickSolidBySimple(F.wrapped, off); const r = R.cast(mk.Shape()); mk.delete(); if (safeVolume(r) < 0) r.wrapped.Reverse(); return r; };  // kommt je nach Seite verkehrt orientiert
  const out = f.mode === 'emboss', parts = [];
  // nur der Teil auf der angeklickten Fläche (sonst baut „erhaben“ über eine Kante hinaus frei weiter)
  const clipped = facesOf(on).flatMap(F => { try { const cm = new oc.BRepAlgoAPI_Common(F.wrapped, face.wrapped); const c = R.cast(cm.Shape()); cm.delete(); return c.faces; } catch (_) { return []; } });
  if (!clipped.length) throw new Error('Das Profil trifft die gewählte Fläche nicht');
  clipped.forEach(F => {
    // welche Seite im Material liegt, entscheidet die Überlappung mit dem Körper (Fläche kann außen oder innen sein)
    const a = thickSimple(F, d), b = thickSimple(F, -d);
    const inA = safeVolume(bool(a.clone(), body.shape.clone(), 'intersect') || a.clone()) , inB = safeVolume(bool(b.clone(), body.shape.clone(), 'intersect') || b.clone());
    const inside = inA >= inB ? a : b, outside = inA >= inB ? b : a;
    parts.push(out ? outside : inside);
  });
  if (!parts.length) throw new Error('Das Profil ließ sich nicht auf die Fläche legen');
  if (!out && d >= Rc) throw new Error('Prägetiefe größer als der Zylinderradius');
  return { tool: parts.length === 1 ? parts[0] : parts.reduce((x, y) => bool(x, y, 'join')), count: parts.length };
}
function embossTool(f, sk, body, P, face) {
  needPlane(sk);
  const d = Number(f.depth);
  if (!(d > 1e-6)) throw new Error('Prägetiefe muss größer als 0 sein');
  const pl = sk.plane, n = norm(pl.n), bb = bbOf(body.shape), L = len(sub(bb[1], bb[0])) * 2 + 10;
  const wrap = !!f.wrap && face && face.geomType !== 'PLANE';
  if (wrap && face.geomType !== 'CYLINDRE') throw new Error('Abwickeln geht auf Zylinderflächen – sonst „Projizieren“ wählen');
  if (wrap) return wrapEmbossTool(f, sk, face, P, body, d);
  // Größe des Profils in der Ebene (hauchdünn extrudiert, damit es eine Hülle hat)
  const fb = bbOf(embossDrawing(f, sk).sketchOnPlane(makePlane(pl)).extrude(0.01)), diag = len(sub(fb[1], fb[0]));
  const out = f.mode === 'emboss';
  const skin = out ? bool(offsetCore(body.shape, d), body.shape.clone(), 'cut') : bool(body.shape.clone(), offsetCore(body.shape, -d), 'cut');
  if (!skin) throw new Error('Die Haut des Körpers ließ sich nicht bilden – Prägetiefe kleiner wählen');
  const prism = embossDrawing(f, sk).sketchOnPlane(makePlane(pl, -L)).extrude(2 * L);
  const all = bool(skin, prism, 'intersect');
  let sols = [];
  try { sols = all ? (all.solids && all.solids.length ? all.solids : [all]) : []; } catch (_) { sols = all ? [all] : []; }
  const keep = sols.filter(sl => { const b = bbOf(sl), c = mul(add(b[0], b[1]), 0.5); return Math.abs(dot(sub(c, P), n)) <= diag + d + 1; });
  if (!keep.length) throw new Error('Das Profil trifft die gewählte Fläche nicht');
  return { tool: keep.length === 1 ? keep[0] : keep.reduce((a, b) => a.fuse(b)), count: keep.length };
}
function holeTool(f, places, through, frames = null) {
  /* Tiefe „Bis Fläche“ (setOneSideToExtent): je Bohrstelle der Abstand entlang der Bohrachse bis zur Ebene
     der Zielfläche, plus Versatz (negativ = davor) */
  const toFace = f.depthMode === 'toface';
  if (toFace && !(f.toFace && f.toFace.n)) throw new Error('Zielfläche wählen');
  const depthAt = (P, a) => {
    if (f.depthMode === 'through') return through;
    if (!toFace) return Number(f.depth);
    const n = f.toFace.n, c = dot(n, a);
    if (Math.abs(c) < 1e-6) throw new Error('Die Zielfläche liegt parallel zur Bohrachse');
    return (f.toFace.dist - dot(n, P)) / c + (Number(f.toOffset) || 0);
  };
  let tool = null;
  places.forEach(({ P, x, a }) => {
    const depth = depthAt(P, a);
    if (!(depth > 1e-6)) throw new Error(toFace ? 'Die Zielfläche liegt nicht in Bohrrichtung (oder der Versatz ist zu groß)' : 'Bohrtiefe muss größer als 0 sein');
    const prof = holeProfile(f, depth);
    let pen = R.draw(prof[0]);
    prof.slice(1).forEach(q => { pen = pen.lineTo(q); });
    const t = pen.close().sketchOnPlane(new R.Plane(P, x, cross(x, a))).revolve(a, { origin: P });
    if (frames) frames.push({ P, a, depth });
    tool = tool ? tool.fuse(t) : t;
  });
  return tool;
}

/* ---------- Muster und Spiegeln: Werkzeugkörper früherer Features wiederverwenden ---------- */
const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
function collectTools(f, tools) {
  const ids = Array.isArray(f.features) ? f.features : [];
  if (!ids.length) throw new Error('Keine Features gewählt');
  const list = [];
  ids.forEach(id => { const t = tools.get(id); if (t) list.push(...t); });
  if (!list.length) throw new Error('Die gewählten Features haben keinen gültigen Körper');
  return list;
}

/* ---------- Körper ----------
   bodies: [{ id, shape }] in Entstehungsreihenfolge. id = ID des Features, das den Körper angelegt hat. */
/* Die Hülle einer Form gehört zur Form, nicht zum Aufruf. Gefragt wird sie an Bohrung, „durch alles",
   Rippe, Steg, Schweißnaht, Zeichnung, Körper-Eigenschaften und bei der unscharfen Auswahl – Rippe,
   Steg und Schweißnaht stehen mit dieser Frage auch noch in der Schleife über alle Körper, bei der
   Zeichnung und beim Bohren kommt sie zusätzlich zur Länge des Werkzeugs. Der Preis ist gemessen:
   rund 200 ms je importierter Form, 170,8 s für 797 Körper. Also hängt der Wert an der Form selbst:
   Formen werden ersetzt, nie verändert (genau deshalb gibt es `invalidateMesh`), und mit der Form
   verschwindet der Wert von selbst – ein Eintrag kann also nicht zu einer anderen Form gehören.
   Geteilt wird der Wert, nicht eine Kopie davon: alle Aufrufstellen lesen ihn nur. */
const huellenWert = new WeakMap();
function bbOf(shape) {
  const bekannt = huellenWert.get(shape);
  if (bekannt) return bekannt;
  const b = shape.boundingBox.bounds;
  huellenWert.set(shape, b);
  return b;
}
/* Hülle als Vorprüfung: billig und bewusst höchstens etwas zu weit. `shape.boundingBox` fragt im Kern
   die genaue Hülle ab (AddOptimal) und kostet an einer importierten Form rund 200 ms – gemessen
   170,8 s für einen einzigen Bedienschritt, weil ein Verbund-Feature vor dem Verbinden jeden Körper
   der Baugruppe prüft und nur zwei davon berührt sind. Die grobe Hülle (dieselbe Kernfunktion ohne
   die genaue Berechnung) kommt aus den Ausdehnungen der Flächen und ist nie enger als der Körper:
   was hier durchfällt, kann sich nicht berühren, und für den Rest entscheidet die folgende
   Entfernungsprüfung. Für Zahlen, die wirklich aus der Hülle kommen (Werkzeuggrößen, Mitten,
   Maßangaben), bleibt `bbOf` zuständig. */
function bbGrob(shape) {
  const oc = R.getOC(), box = new oc.Bnd_Box();
  try {
    oc.BRepBndLib.Add(shape.wrapped, box, false);
    const a = box.CornerMin(), b = box.CornerMax();
    const out = [[a.X(), a.Y(), a.Z()], [b.X(), b.Y(), b.Z()]];
    a.delete(); b.delete();
    return out;
  } catch (_) { return bbOf(shape); }
  finally { box.delete(); }
}
function bbOverlap(a, b, tol = 1e-6) {
  for (let k = 0; k < 3; k++) if (a[0][k] > b[1][k] + tol || b[0][k] > a[1][k] + tol) return false;
  return true;
}
/* Berührt oder schneidet das Werkzeug den Körper? Die Hülle des Werkzeugs kommt von außen: sie würde
   sonst für jeden Körper neu berechnet. Gezählt wird beides, weil in einer großen Baugruppe schon die
   Prüfung aller Körper teuer sein kann – gemessen 170 s für ein einzelnes Feature. */
function touches(body, tool, toolBB) {
  pCount('huellePruefungen');
  if (!bbOverlap(bbGrob(body.shape), toolBB, 1e-4)) return false;
  pCount('distanzPruefungen');
  const t = performance.now();
  try { return R.measureDistanceBetween(body.shape, tool) < 1e-5; }
  catch (_) { return true; }
  finally { pAdd('distanz', t); }
}
function targetBodies(bodies, f, tool) {
  if (Array.isArray(f.targets) && f.targets.length) return bodies.filter(b => f.targets.includes(b.id));
  const toolBB = bbGrob(tool);
  // in einer aktiven Komponente angelegt → Verbinden nur mit Körpern dieser Komponente
  if (f.owner && (f.op || 'new') === 'join' && compMap.has(f.owner)) {
    const own = new Set(compMap.get(f.owner));
    return bodies.filter(b => own.has(b.id) && touches(b, tool, toolBB));
  }
  return bodies.filter(b => touches(b, tool, toolBB));
}
/* Boolesche Operation, bei Verbünden (z. B. Körper + Gewindegang) je Festkörper.
   join: nur der größte Festkörper wird verschmolzen. Rückgabe null = nichts übrig. */
function bool(shape, tool, op) {
  let sols = null;
  try { sols = shape.solids; } catch (_) { sols = null; }
  if (!sols || sols.length <= 1) return op === 'cut' ? shape.cut(tool) : op === 'intersect' ? shape.intersect(tool) : shape.fuse(tool);
  if (op === 'join') {
    let iMax = 0, vMax = -1;
    sols.forEach((s, i) => { const v = safeVolume(s) || 0; if (v > vMax) { vMax = v; iMax = i; } });
    return R.makeCompound(sols.map((s, i) => (i === iMax ? s.fuse(tool) : s)));
  }
  const parts = sols.map(s => (op === 'cut' ? s.cut(tool.clone()) : s.intersect(tool.clone()))).filter(s => (safeVolume(s) || 0) > 1e-9);
  return parts.length === 1 ? parts[0] : parts.length ? R.makeCompound(parts) : null;
}
function setShape(bodies, b, shape) {
  invalidateMesh(b);
  if (shape) b.shape = shape; else bodies.splice(bodies.indexOf(b), 1);
}

/* Werkzeugkörper mit dem Vorgang auf die Körperliste anwenden (Verbinden, Ausschneiden, Schnittmenge, Neuer Körper) */
/* Unnötige Kanten/Flächen entfernen (z. B. Halbkreise aus 2D-Booleschen Operationen) zusammenhängende Flächen zeigt */
/* Vereinigen ohne Zusammenfassen gleicher Flächen (replicad fasst bei fuse immer zusammen): für „Fläche teilen“ */
function fuseKeepFaces(a, b) {
  const oc = R.getOC(), op = new oc.BRepAlgoAPI_Fuse(a.wrapped, b.wrapped);
  try {
    op.Build();
    if (!op.IsDone()) return null;
    const res = R.cast(op.Shape());
    let sols = null;
    try { sols = res.solids; } catch (_) { sols = null; }
    return sols && sols.length === 1 ? sols[0] : res;
  } finally { op.delete(); }
}
/* Nur gewählte Flächen an einem Werkzeug teilen: der Splitter
   zerschneidet die Flächen, aus den Stücken und den ungeteilten Flächen werden mit Nähen wieder Hülle und
   Körper – alle anderen Flächen bleiben ganz. Gibt null zurück, wenn kein Stück entsteht (Werkzeug trifft nicht). */
/* Importiertes Blechteil als Blech-Features: aus der Abwicklung der Körperform (wie „In Blech
   umwandeln“, feste Fläche = größte ebene Fläche) Kontur, Ausschnitte und Biegelinien mit Winkel, Richtung und
   Innenradius. Die Seite baut daraus Grundlasche (Kontur in Blechdicke) + „Biegen“ an den Linien; Abwickeln und
   Wiederbiegen mit demselben K-Faktor ergibt wieder die Körperform. Nicht nachbaubar: Kegel (Formschräge), scharfe
   Kanten ohne Biegeradius, Körper aus mehreren Blechdicken. */
function blechErkennen(shape) {
  const ebene = shape.faces.filter(fc => fc.geomType === 'PLANE').map(fc => ({ fc, a: R.measureArea(fc) })).sort((x, y) => y.a - x.a);
  if (!ebene.length) throw new Error('Keine ebene Fläche – kein Blechteil');
  const fixed = ebene[0].fc;
  const uf = unfoldSheet(shape, fixed, sheetRule);
  const vK = safeVolume(shape) || 0, vA = flaecheAbwicklung(uf) * uf.t;
  if (vK > 0 && Math.abs(vA - vK) > 0.02 * vK) throw new Error(`Kein Blech gleicher Dicke: die Abwicklung erfasst ${Math.round(100 * vA / vK)} % des Volumens`);
  if (uf.sharp) throw new Error('Das Teil hat scharfe Kanten ohne Biegeradius – so nicht als Biegungen nachbaubar');
  const bends = uf.bends.map(b => {
    const m = /^(\d+(?:\.\d+)?)° ([↑↓]) R(\d+(?:\.\d+)?)$/.exec(b.label || '');
    if (!m) throw new Error('Das Teil hat Biegungen, die sich nicht als Biegen an einer Linie nachbauen lassen (Kegel, Formschräge)');
    return { a: b.a, b: b.b, angle: Number(m[1]), up: m[2] === '↑', r: Number(m[3]) };
  });
  const { O, xd, yd, n } = uf.frame;
  return { ebene: { o: O, x: xd, y: yd, n }, t: uf.t, r: uf.rule.r, contour: uf.contour, holes: uf.holes, bends, volumen: vK, kerfs: uf.kerfs || 0 };
}
/* Importierten Körper als Extrusion erkennen (STEP-Teil → Skizze + Extrusion, damit er über die Zeitleiste änderbar wird):
   zwei parallele ebene Deckflächen mit entgegengesetzter Normale, alle übrigen Flächen laufen parallel zur Richtung
   (Normalen an 9 Stellen senkrecht dazu: Wände, Bohrungen, Radien). Geprüft wird zusätzlich Volumen = Deckfläche ×
   Abstand. Bei mehreren Möglichkeiten gewinnt die größte Deckfläche (Platte, nicht Stirnseite). Rückgabe: Ebene der
   Skizze (auf der ersten Deckfläche, Normale in den Körper), Abstand und die Kanten der Deckfläche in Skizzenkoordinaten
   als Linien, Kreise und Bögen (gegen den Uhrzeigersinn) – Freiformkanten als Linienzug. */
function extrusionErkennen(shape) {
  const bb = bbOf(shape), gr = Math.max(1, len(sub(bb[1], bb[0]))), vol = safeVolume(shape) || 0;
  const flaechen = shape.faces.map(F => {
    let n = null, o = null, area = 0;
    if (F.geomType === 'PLANE') { try { o = F.center; n = norm(F.normalAt(o).toTuple()); o = o.toTuple ? o.toTuple() : o; } catch (_) { n = null; } }
    try { area = R.measureArea ? R.measureArea(F) : 0; } catch (_) { area = 0; }
    return { F, n, o, area };
  });
  const normalen = f => { const P = []; for (const u of [0.15, 0.5, 0.85]) for (const v of [0.15, 0.5, 0.85]) { try { P.push(f.F.normalAt(f.F.pointOnSurface(u, v)).toTuple()); } catch (_) { /* Rand */ } } return P; };
  const kandidaten = [];
  for (let i = 0; i < flaechen.length; i++) for (let j = i + 1; j < flaechen.length; j++) {
    const a = flaechen[i], b = flaechen[j];
    if (!a.n || !b.n || dot(a.n, b.n) > -1 + 1e-9) continue;
    const dist = Math.abs(dot(sub(b.o, a.o), a.n));
    if (dist < 1e-6 * gr) continue;
    kandidaten.push({ a, b, dist });
  }
  kandidaten.sort((x, y) => y.a.area - x.a.area);
  for (const k of kandidaten) {
    const d = k.a.n;
    const ok = flaechen.every(f => f === k.a || f === k.b || (f.n ? Math.abs(dot(f.n, d)) < 1e-7 : normalen(f).every(m => Math.abs(dot(norm(m), d)) < 1e-6)));
    if (!ok) continue;
    if (k.a.area > 0 && Math.abs(k.a.area * k.dist - vol) > 1e-4 * vol) continue;
    // Skizzenebene auf der Deckfläche a, Normale in den Körper (−n_a), x waagerecht wenn möglich
    const n = mul(d, -1), x = norm(Math.abs(n[2]) > 0.999 ? [1, 0, 0] : cross([0, 0, 1], n)), y = cross(n, x), o = k.a.o;
    const P2 = p => { const q = sub(p, o); return [dot(q, x), dot(q, y)]; };
    const kreis3 = (p, q, r) => { const ax = p[0], ay = p[1], bx = q[0], by = q[1], cx = r[0], cy = r[1], D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(D) < 1e-12) return null; const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D, uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D; return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) }; };
    const kanten = [];
    for (const e of k.a.F.edges) {
      const s = P2(e.startPoint.toTuple()), t = P2(e.endPoint.toTuple()), m = P2(e.pointAt(0.5).toTuple());
      const zu = Math.hypot(s[0] - t[0], s[1] - t[1]) < 1e-7 * gr;
      if (e.geomType === 'LINE') { kanten.push({ art: 'linie', a: s, b: t }); continue; }
      if (e.geomType === 'CIRCLE') {
        const K = zu ? kreis3(s, P2(e.pointAt(1 / 3).toTuple()), P2(e.pointAt(2 / 3).toTuple())) : kreis3(s, m, t);
        if (K && zu) { kanten.push({ art: 'kreis', c: K.c, r: K.r }); continue; }
        if (K) {
          // Drehsinn s → m → t: gegen den Uhrzeigersinn, sonst Anfang und Ende tauschen
          const w = (p) => Math.atan2(p[1] - K.c[1], p[0] - K.c[0]), ccw = ((m[0] - s[0]) * (t[1] - s[1]) - (m[1] - s[1]) * (t[0] - s[0])) < 0;
          kanten.push({ art: 'bogen', c: K.c, r: K.r, a0: ccw ? w(s) : w(t), a1: ccw ? w(t) : w(s) });
          continue;
        }
      }
      const N = 24, P = [];
      for (let i = 0; i <= N; i++) P.push(P2(e.pointAt(i / N).toTuple()));
      for (let i = 1; i <= N; i++) kanten.push({ art: 'linie', a: P[i - 1], b: P[i] });
    }
    return { ebene: { o, x, y, n }, dist: k.dist, kanten, volumen: vol };
  }
  throw new Error('Der Körper ist keine einfache Extrusion (zwei parallele Deckflächen, alle Wände senkrecht dazu) – für Blechteile „In Blech umwandeln“ nutzen, sonst direkt bearbeiten (Drücken/Ziehen, Fläche verschieben)');
}
/* Umrisslinien (Silhouette) eines Körpers aus Blickrichtung d als 3D-Kanten: sichtbare Umrisse von +d und von −d,
   doppelte (gleiche Enden und Mitte) entfernt */
function silhouetteKanten(shape, d) {
  const oc = R.getOC(), kanten = [];
  for (const sg of [1, -1]) {
    const algo = new oc.HLRBRep_Algo();
    try {
      algo.Add(shape.wrapped, 0);
      const ax = new oc.gp_Ax2(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(sg * d[0], sg * d[1], sg * d[2]));
      algo.Projector(new oc.HLRAlgo_Projector(ax)); algo.Update(); algo.Hide();
      const c = new oc.HLRBRep_HLRToShape(algo).OutLineVCompound3d();
      if (!c.IsNull()) kanten.push(...R.cast(c).edges);
    } catch (_) { /* keine Umrisse aus dieser Richtung */ }
  }
  const schluessel = e => [e.startPoint.toTuple(), e.pointAt(0.5).toTuple(), e.endPoint.toTuple()];
  const gleich = (a, b) => { const A = schluessel(a), B = schluessel(b); const eq = (p, q) => len(sub(p, q)) < 1e-6; return eq(A[1], B[1]) && ((eq(A[0], B[0]) && eq(A[2], B[2])) || (eq(A[0], B[2]) && eq(A[2], B[0]))); };
  return kanten.filter((e, i) => !kanten.slice(0, i).some(x => gleich(x, e)));
}
/* Ebene durch Punkte: drei weit auseinanderliegende Punkte geben die Normale, dev = größter Abstand aller Punkte */
function ebeneDurch(pts) {
  if (pts.length < 3) return null;
  const a = pts[0], b = pts.reduce((m, p) => (len(sub(p, a)) > len(sub(m, a)) ? p : m), a);
  let c = null, fl = 0;
  for (const p of pts) { const x = len(cross(sub(b, a), sub(p, a))); if (x > fl) { fl = x; c = p; } }
  if (!c || fl < 1e-9 * Math.max(1, len(sub(b, a)) ** 2)) return null;
  const n = norm(cross(sub(b, a), sub(c, a)));
  return { o: a, n, dev: Math.max(...pts.map(p => Math.abs(dot(sub(p, a), n)))) };
}
/* Körper an einer gekrümmten Trennlinie teilen (Silhouette geteilt, „Körper teilen“, wenn die Umrisslinie nicht eben ist,
   auch Hohl- und Schalenkörper):
   1. alle Flächen an ihren Umrisslinien teilen – Umrisse je Fläche gerechnet, damit auch verdeckte (Innenwand) zählen,
   2. jedes Stück ist dann der Blickrichtung zu- (+) oder abgewandt (−); die Kanten zwischen + und − sind die Trennlinie
      (wie die Formteilungslinie im Werkzeugbau, auch entlang scharfer Kanten),
   3. Trennlinie zu geschlossenen Schleifen, in der Ebene quer zu d verschachtelt: die äußere Schleife bekommt eine
      Füllfläche, mit einer Schleife darin (Hohlraum, Loch) stattdessen einen Regelflächenring bis dorthin und eine Füllfläche
      über dem Hohlraum; dazu ein Kragen nach außen, damit die Trennfläche die Wand quer schneidet statt sie nur zu berühren,
   4. der Splitter teilt den Körper an diesen Flächen. Rückgabe: Liste der Teilkörper (≥ 2) oder Fehler. */
function teilKoerperGekruemmt(shape, d) {
  const oc = R.getOC(), bb = bbOf(shape), gr = Math.max(1, len(sub(bb[1], bb[0]))), tol = 1e-5 * gr;
  // 1. Umrisse je Fläche
  const kanten = [];
  for (const F of shape.faces) {
    if (F.geomType === 'PLANE') continue;
    for (const e of silhouetteKanten(F, d)) kanten.push(e);
  }
  let geteilt = kanten.length ? teilFlaechen(shape, shape.faces, kanten) : null;
  if (!geteilt) geteilt = shape;
  // 2. Seite je Fläche: Normale an einem Punkt der Fläche (Schwerpunkt auf die Fläche gezogen)
  const flaechen = geteilt.faces.map(F => { let s = 0; try { const n = F.normalAt(F.center).toTuple(), x = dot(n, d); s = x > 1e-6 ? 1 : x < -1e-6 ? -1 : 0; } catch (_) { s = 0; } return { F, s, kanten: F.edges }; });
  // Kanten zwischen einer zu- und einer abgewandten Fläche
  const trenn = [];
  for (let i = 0; i < flaechen.length; i++) {
    if (flaechen[i].s !== 1) continue;
    for (const e of flaechen[i].kanten) {
      const gegen = flaechen.some((g, j) => j !== i && g.s === -1 && g.kanten.some(x => { try { return x.isSame(e); } catch (_) { return false; } }));
      if (gegen && !trenn.some(x => x.isSame(e))) trenn.push(e);
    }
  }
  if (!trenn.length) throw new Error('Keine Trennlinie zwischen zu- und abgewandten Flächen – „Flächen teilen“ zeigt die Umrisslinie');
  // 3. Schleifen
  const gleich = (p, q) => len(sub(p, q)) < tol * 10;
  const offen = trenn.map(e => ({ e, a: e.startPoint.toTuple(), b: e.endPoint.toTuple() }));
  const schleifen = [];
  while (offen.length) {
    const erst = offen.shift(), kette = [erst.e], start = erst.a;
    let ende = erst.b;
    while (!gleich(ende, start)) {
      const k = offen.findIndex(x => gleich(x.a, ende) || gleich(x.b, ende));
      if (k < 0) throw new Error('Die Trennlinie ist nicht geschlossen – „Körper teilen“ geht hier nicht, „Flächen teilen“ schon');
      const x = offen.splice(k, 1)[0];
      kette.push(x.e);
      ende = gleich(x.a, ende) ? x.b : x.a;
    }
    schleifen.push(kette);
  }
  // Lage quer zu d: Vieleck, Fläche, Schwerpunkt
  const u = norm(Math.abs(d[2]) < 0.9 ? cross(d, [0, 0, 1]) : cross(d, [1, 0, 0])), v = cross(d, u);
  const info = schleifen.map(kette => {
    const pts = kette.flatMap(e => Array.from({ length: 16 }, (_, i) => e.pointAt(i / 16).toTuple()));
    const poly = pts.map(p => [dot(p, u), dot(p, v)]);
    let fl = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; fl += p[0] * q[1] - q[0] * p[1]; }
    const c = pts.reduce((m, p) => add(m, p), [0, 0, 0]).map(x => x / pts.length);
    return { kette, pts, poly, flaeche: Math.abs(fl / 2), c };
  });
  const innen = (P, poly) => { let ein = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) ein = !ein; } return ein; };
  for (const s of info) s.eltern = info.filter(t => t !== s && t.flaeche > s.flaeche && innen(s.poly[0], t.poly));
  if (info.some(s => s.eltern.length > 1)) throw new Error('Die Trennlinie ist mehrfach verschachtelt – das geht noch nicht');
  const wire = kette => R.assembleWire(kette.map(e => e.clone()));
  /* Kragen: jede Kante der Schleife quer zu d vom Schwerpunkt weg nach außen gezogen (Höhe entlang d bleibt), als
     Regelfläche zwischen Schleife und gezogener Kopie */
  const kragen = s => {
    const weit = p => { const r = sub(p, s.c), h = dot(r, d), q = sub(r, mul(d, h)), lq = len(q) || 1; return add(add(s.c, mul(d, h)), mul(q, 1 + gr / lq)); };
    const aussen = s.kette.map(e => {
      if (e.geomType === 'LINE') return R.makeLine(weit(e.startPoint.toTuple()), weit(e.endPoint.toTuple()));
      return R.makeBSplineApproximation(Array.from({ length: 17 }, (_, i) => weit(e.pointAt(i / 16).toTuple())), { tolerance: 1e-4 * gr, smoothing: null, degMax: 3 });
    });
    return R.loft([wire(s.kette), R.assembleWire(aussen)], { ruled: true }, true);
  };
  const werkzeuge = [];
  for (const s of info.filter(t => !t.eltern.length)) {
    werkzeuge.push(kragen(s));
    const kinder = info.filter(t => t.eltern[0] === s);
    if (kinder.length > 1) throw new Error('Mehr als ein Hohlraum in einer Trennlinie – das geht noch nicht');
    if (kinder.length) { werkzeuge.push(R.loft([wire(s.kette), wire(kinder[0].kette)], { ruled: true }, true)); werkzeuge.push(R.makeNonPlanarFace(wire(kinder[0].kette))); }
    else werkzeuge.push(R.makeNonPlanarFace(wire(s.kette)));
  }
  // 4. teilen
  const op = new oc.BRepAlgoAPI_Splitter(), A = new oc.NCollection_List_TopoDS_Shape(), T = new oc.NCollection_List_TopoDS_Shape();
  try {
    A.Append(geteilt.wrapped);
    for (const w of werkzeuge) T.Append(w.wrapped);
    op.SetArguments(A); op.SetTools(T); op.Build();
    if (op.HasErrors()) throw new Error('Teilen an der gekrümmten Trennfläche ist fehlgeschlagen');
    const teile = R.cast(op.Shape()).solids.filter(x => (safeVolume(x) || 0) > 1e-9 * gr ** 3);
    if (teile.length < 2) throw new Error('Die gekrümmte Trennfläche teilt den Körper nicht');
    return teile;
  } finally { try { op.delete(); A.delete(); T.delete(); } catch (_) { /* egal */ } }
}
function teilFlaechen(shape, gewaehlt, werkzeuge) {
  const oc = R.getOC(), op = new oc.BRepAlgoAPI_Splitter();
  const A = new oc.NCollection_List_TopoDS_Shape(), T = new oc.NCollection_List_TopoDS_Shape();
  const same = (x, y) => { try { return x.isSame(y); } catch (_) { return false; } };
  try {
    for (const F of gewaehlt) A.Append(F.wrapped);
    for (const w of werkzeuge) T.Append(w.wrapped);
    op.SetArguments(A); op.SetTools(T);
    op.Build();
    if (op.HasErrors()) return null;
    const stuecke = R.cast(op.Shape()).faces;
    if (stuecke.length <= gewaehlt.length) return null;
    const sew = new oc.BRepBuilderAPI_Sewing();
    try {
      for (const F of shape.faces) if (!gewaehlt.some(G => same(G, F))) sew.Add(F.wrapped);
      for (const F of stuecke) sew.Add(F.wrapped);
      sew.Perform();
      const fest = R.makeSolid([R.cast(sew.SewedShape())]);
      if ((safeVolume(fest) || 0) < 0) fest.wrapped.Reverse();
      return fest;
    } finally { try { sew.delete(); } catch (_) { /* egal */ } }
  } catch (_) { return null; }
  finally { try { op.delete(); A.delete(); T.delete(); } catch (_) { /* egal */ } }
}
/* Zellen einer Begrenzungsfüllung: ein großer Quader um alle Werkzeuge wird an Körpern und Ebenen zerteilt. Zellen sind
   die Stücke, die den Rand des Quaders nicht berühren (rundum von Werkzeugen eingeschlossen) und nicht im Inneren eines
   Werkzeugkörpers liegen. Reihenfolge fest nach Schwerpunkt (x, dann y, dann z), damit die Auswahl im Dokument hält. */
function boundCells(tools, planes) {
  const oc = R.getOC(), bs = tools.map(t => bbOf(t));
  planes.forEach(pl => bs.push([pl.o, pl.o]));
  const lo = [0, 1, 2].map(i => Math.min(...bs.map(b => b[0][i]))), hi = [0, 1, 2].map(i => Math.max(...bs.map(b => b[1][i])));
  const M = len(sub(hi, lo)) / 2 + 10, B0 = lo.map(v => v - M), B1 = hi.map(v => v + M), S = len(sub(B1, B0)) + 10;
  const op = new oc.BRepAlgoAPI_Splitter(), A = new oc.NCollection_List_TopoDS_Shape(), T = new oc.NCollection_List_TopoDS_Shape();
  const keep = [];
  let pieces;
  try {
    const box = R.makeBox(B0, B1);
    A.Append(box.wrapped);
    tools.forEach(t => T.Append(t.wrapped));
    planes.forEach(pl => { const f = planeFace(pl.o, pl.n, S); keep.push(f); T.Append(f.wrapped); });
    op.SetArguments(A); op.SetTools(T); op.Build();
    if (op.HasErrors()) throw new Error('Die Werkzeuge lassen sich nicht miteinander schneiden');
    const res = R.cast(op.Shape());
    try { pieces = res.solids; } catch (_) { pieces = [res]; }
  } finally { try { op.delete(); A.delete(); T.delete(); } catch (_) { /* egal */ } }
  const cells = [];
  for (const p of pieces || []) {
    const v = safeVolume(p) || 0, bb = bbOf(p);
    if (v < 1e-6) continue;
    if ([0, 1, 2].some(i => bb[0][i] <= B0[i] + 1e-6 || bb[1][i] >= B1[i] - 1e-6)) continue; // offen zum Rand
    if (tools.some(t => { const c = bool(p.clone(), t.clone(), 'intersect'); return c && (safeVolume(c) || 0) > v * (1 - 1e-6); })) continue; // im Werkzeug
    const com = volumenEigenschaften(p).centerOfMass;
    cells.push({ shape: p, volume: v, center: com.map(x => Math.round(x * 1e6) / 1e6) });
  }
  cells.sort((a, b) => a.center[0] - b.center[0] || a.center[1] - b.center[1] || a.center[2] - b.center[2]);
  return cells;
}
/* Teilung einer Freiformkante (B-Spline) in Strecken: etwa 0,2 mm je Strecke, mindestens 24 – eine ganze Kontur des
   Generativen Designs ist eine einzige Kante, 24 Strecken wären dort viel zu grob (Laser-DXF) */
function kurvenTeile(e) {
  let L = 0, q = e.pointAt(0).toTuple();
  for (let i = 1; i <= 64; i++) { const r = e.pointAt(i / 64).toTuple(); L += len(sub(r, q)); q = r; }
  return Math.max(24, Math.min(6000, Math.ceil(L / 0.2)));
}
/* Ebene Körperfläche als Bereich in Skizzenkoordinaten (Topologieoptimierung): Außendraht und Lochdrähte abgetastet
   (Geraden mit zwei Punkten, Kurven mit 32), Kanten in Laufrichtung des Drahts aneinandergehängt */
function topoFlaeche(face, pl) {
  const n = norm(face.normalAt(face.pointOnSurface(0.5, 0.5)).toTuple());
  if (Math.abs(dot(n, pl.n)) < 1 - 1e-6) throw new Error('Die Fläche des Designbereichs liegt nicht parallel zur Skizzenebene');
  const zug = w => {
    const es = w.edges, pts = [];
    es.forEach((e, k) => {
      const m = e.geomType === 'LINE' ? 1 : e.geomType === 'CIRCLE' ? 32 : kurvenTeile(e), q = [];
      for (let i = 0; i <= m; i++) q.push(e.pointAt(i / m).toTuple());
      if (pts.length) {
        const last = pts[pts.length - 1];
        if (len(sub(q[0], last)) > len(sub(q[q.length - 1], last))) q.reverse();
        q.shift();
      } else if (es.length > 1) {
        const a = es[1].startPoint.toTuple(), b = es[1].endPoint.toTuple(), d = p => Math.min(len(sub(p, a)), len(sub(p, b)));
        if (d(q[0]) < d(q[q.length - 1])) q.reverse();
      }
      pts.push(...q);
    });
    if (pts.length > 1 && len(sub(pts[0], pts[pts.length - 1])) < 1e-7) pts.pop();
    return pts.map(p => { const r = sub(p, pl.o); return [dot(r, pl.x), dot(r, pl.y)]; });
  };
  // wie faceOutline: alle Drähte, der größte ist die Außenkontur (outerWire/innerWires gaben freigegebene Objekte)
  const zuege = face.wires.map(zug), fl = q => Math.abs(q.reduce((a, p, i) => { const b = q[(i + 1) % q.length]; return a + p[0] * b[1] - b[0] * p[1]; }, 0));
  let iA = 0;
  zuege.forEach((q, i) => { if (fl(q) > fl(zuege[iA])) iA = i; });
  return { poly: zuege[iA], holePolys: zuege.filter((_, i) => i !== iA) };
}
/* ---------- Generatives Design: Geometrie auf die Schneidebene abbilden (2-Achsen-Schneiden) ----------
   Achsen der Ebene je Schneidrichtung, rechtshändig (x × y = n) */
const GD_EBENEN = { X: { x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] }, Y: { x: [0, 0, 1], y: [1, 0, 0], n: [0, 1, 0] }, Z: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] } };
function gdSpanne(shape, n) {
  const bb = bbOf(shape), ecken = [];
  for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) ecken.push(dot([bb[a][0], bb[b][1], bb[c][2]], n));
  return [Math.min(...ecken), Math.max(...ecken)];
}
/* Schnitt eines Körpers mit der Ebene auf halber Höhe des Körpers: Flächen als { poly, holePolys } in Ebenenkoordinaten */
function gdFussabdruck(shape, e) {
  const [z0, z1] = gdSpanne(shape, e.n), P = mul(e.n, (z0 + z1) / 2);
  const S = len(sub(bbOf(shape)[1], bbOf(shape)[0])) + 10;
  const scheibe = planeFace(P, e.n, S);
  let schnitt = null;
  try { schnitt = shape.clone().intersect(scheibe); } catch (_) { schnitt = null; }
  if (!schnitt) return [];
  let fl = [];
  try { fl = schnitt.faces; } catch (_) { fl = []; }
  return fl.map(f => topoFlaeche(f, { o: [0, 0, 0], x: e.x, y: e.y, n: e.n }));
}
/* Fläche (Kraft/Abhängigkeit) als Punktliste in der Ebene: Schnittlinie mit der Ebene auf halber Höhe des Körpers,
   bei einer Fläche parallel zur Ebene ihr Umriss */
function gdFlaechenPunkte(face, koerper, e) {
  const oc = R.getOC(), [z0, z1] = gdSpanne(koerper, e.n), P = mul(e.n, (z0 + z1) / 2);
  const in2 = q => [dot(q, e.x), dot(q, e.y)], out = [];
  const nf = norm(face.normalAt(face.pointOnSurface(0.5, 0.5)).toTuple());
  if (!(face.geomType === 'PLANE' && Math.abs(dot(nf, e.n)) > 0.999)) {
    const sec = new oc.BRepAlgoAPI_Section(face.wrapped, planeFace(P, e.n, len(sub(bbOf(koerper)[1], bbOf(koerper)[0])) + 10).wrapped, true);
    try {
      sec.Build();
      const kanten = R.cast(sec.Shape()).edges || [];
      kanten.forEach(k => { const m = k.geomType === 'LINE' ? 4 : 24; for (let i = 0; i <= m; i++) out.push(in2(k.pointAt(i / m).toTuple())); });
    } catch (_) { /* leer */ } finally { try { sec.delete(); } catch (_) { /* egal */ } }
  }
  if (!out.length) face.wires.forEach(w => w.edges.forEach(k => { const m = k.geomType === 'LINE' ? 4 : 24; for (let i = 0; i <= m; i++) out.push(in2(k.pointAt(i / m).toTuple())); }));
  return out;
}
/* Glatte Konstruktion aus einem Ergebnis: jede Kontur eine periodische kubische B-Spline-Kurve (C2, ohne Naht), die
   genau durch die gespeicherten Punkte läuft. Danach die echten Bohrungen der Beibehalten-Körper exakt ausschneiden (die
   Kontur reicht dort um δ hinein), Beibehalten-Körper vereinigen, Hindernisse abziehen. */
function gdSplineKante(P2, e, z) {
  const oc = R.getOC(), n = P2.length;
  // Pole so bestimmen, dass die Kurve durch die Punkte läuft: Kurvenpunkt am Knoten = (P[i−1] + 4 P[i] + P[i+1]) / 6
  let P = P2.map(q => q.slice());
  for (let it = 0; it < 40; it++) {
    let fehler = 0;
    const S = P.map((q, i) => { const a = P[(i + n - 1) % n], b = P[(i + 1) % n]; return [(a[0] + 4 * q[0] + b[0]) / 6, (a[1] + 4 * q[1] + b[1]) / 6]; });
    P = P.map((q, i) => { const dx = P2[i][0] - S[i][0], dy = P2[i][1] - S[i][1]; fehler = Math.max(fehler, Math.abs(dx), Math.abs(dy)); return [q[0] + dx, q[1] + dy]; });
    if (fehler < 1e-6) break;
  }
  const o = e.o || [0, 0, 0], w = q => add(add(add(o, mul(e.x, q[0])), mul(e.y, q[1])), mul(e.n, z));
  const poles = new oc.NCollection_Array1_gp_Pnt(1, n), knots = new oc.NCollection_Array1_double(1, n + 1), mults = new oc.NCollection_Array1_int(1, n + 1);
  P.forEach((q, i) => { const [x, y, zz] = w(q); const g = new oc.gp_Pnt(x, y, zz); poles.SetValue(i + 1, g); g.delete(); });
  for (let i = 0; i <= n; i++) { knots.SetValue(i + 1, i); mults.SetValue(i + 1, 1); }
  const kurve = new oc.Geom_BSplineCurve(poles, knots, mults, 3, true);
  // gleiche Kurve, aber nicht periodisch (eine Naht, dort weiter C2): OCC integriert Volumen über periodische Splines
  // deutlich falsch (Lasche: −15 %), über die nicht periodische Form richtig
  kurve.SetNotPeriodic();
  const mk = new oc.BRepBuilderAPI_MakeEdge(kurve);
  if (!mk.IsDone()) throw new Error('Kontur des Ergebnisses lässt sich nicht als Kurve bauen');
  const kante = new R.Edge(mk.Edge());
  [poles, knots, mults, mk].forEach(x => { try { x.delete(); } catch (_) { /* egal */ } });
  return kante;
}
function gdGlatt(f, bodies) {
  const e = f.ebene, z0 = Number(f.z0), dz = Number(f.z1) - z0, hoch = new R.Vector(mul(e.n, dz));
  const prisma = pts => R.basicFaceExtrusion(R.makeFace(R.assembleWire([gdSplineKante(pts, e, z0)])), hoch);
  /* Kette aus Geraden und Bögen (gd-linien.js): echte Strecken und Kreisbögen – im DXF LINE/ARC, im Körper Ebenen und
     Zylinderflächen. Der letzte Punkt ist genau der Anfang. */
  const kette = k => {
    let d = R.draw(k.start);
    k.teile.forEach((t, i) => {
      const p = i === k.teile.length - 1 ? k.start : t.p;
      d = t.typ === 'l' ? d.lineTo(p) : d.threePointsArcTo(p, t.m);
    });
    return d.close().sketchOnPlane(makePlane({ o: e.o || [0, 0, 0], x: e.x, y: e.y, n: e.n }, z0)).extrude(dz);
  };
  const koerper = q => (q.segmente && q.segmente.teile && q.segmente.teile.length >= 2 ? kette(q.segmente) : prisma(q.punkte));
  let tool = null;
  for (const q of f.flaechen) {
    let k = koerper(q);
    for (const l of q.loecher || []) k = k.cut(koerper(l));
    tool = tool ? tool.fuse(k) : k;
  }
  if (!tool) throw new Error('Das Ergebnis enthält keinen Umriss');
  for (const id of f.beibehalten || []) {
    const b = bodies.find(x => x.id === id);
    if (!b) continue;
    // Bohrungen exakt: innere Drähte des Schnitts auf halber Höhe, über die Spanne des Körpers ausgeschnitten
    const [b0, b1] = gdSpanne(b.shape, e.n), P = mul(e.n, (b0 + b1) / 2);
    let schnitt = null;
    try { schnitt = b.shape.clone().intersect(planeFace(P, e.n, len(sub(bbOf(b.shape)[1], bbOf(b.shape)[0])) + 10)); } catch (_) { schnitt = null; }
    let schnittFlaeche = 0;
    for (const fc of (schnitt && schnitt.faces) || []) {
      try { schnittFlaeche += R.measureShapeSurfaceProperties(fc).area; } catch (_) { schnittFlaeche = NaN; }
      const ws = fc.wires;
      if (ws.length < 2) continue;
      const gr = w => { const bb = bbOf(w); return len(sub(bb[1], bb[0])); };
      const iA = ws.reduce((a, w, i) => (gr(w) > gr(ws[a]) ? i : a), 0);
      ws.forEach((w, i) => {
        if (i === iA) return;
        try {
          const loch = R.basicFaceExtrusion(R.makeFace(w).translate(mul(e.n, b0 - (b0 + b1) / 2 - 1)), new R.Vector(mul(e.n, b1 - b0 + 2)));
          tool = tool.cut(loch);
        } catch (_) { /* Loch nicht baubar: dann bleibt die Kontur (um δ zu klein) */ }
      });
    }
    /* Ein Prisma über die ganze Dicke (Volumen = Schnittfläche · Höhe) steckt schon in der Kontur – dann nicht vereinigen
       (fast deckungsgleiche Flächen: in OCC sekundenlang). Sonst (Absatz, Bund, andere Höhe) vereinigen. */
    const prisma = Math.abs(b0 - z0) < 1e-4 && Math.abs(b1 - z0 - dz) < 1e-4 && Math.abs((safeVolume(b.shape) || 0) - schnittFlaeche * (b1 - b0)) < 1e-3 * schnittFlaeche * (b1 - b0);
    if (!prisma) tool = tool.fuse(b.shape.clone());
  }
  for (const id of f.hindernis || []) { const b = bodies.find(x => x.id === id); if (b) tool = tool.cut(b.shape.clone()); }
  return tool;
}
function planeFace(P, n, S) {
  // große ebene Fläche in der Ebene durch P mit Normale n – Werkzeug zum Flächen teilen
  return R.drawRectangle(2 * S, 2 * S).sketchOnPlane(new R.Plane(P, anyPerp(n), n)).face();
}
function tidy(shape) {
  try { return shape.simplify(); } catch (_) { return shape; }
}
function applyOp(bodies, tool, op, f, newId) {
  tool = tidy(tool);
  if (op === 'new') { bodies.push({ id: newId, shape: tool }); return; }
  /* Suchen und Verschmelzen getrennt gemessen: in einer importierten Baugruppe mit hunderten Körpern
     ist beides für sich ein möglicher Engpass, und ohne die Trennung wäre nicht zu entscheiden, was
     korrigiert werden muss. */
  const tZ = performance.now();
  const hit = targetBodies(bodies, f, tool);
  pAdd('zielSuche', tZ);
  const tO = performance.now();
  verbinde(bodies, hit, tool, op, f, newId);
  pAdd('boolesch', tO);
}
const crossWarn = n => `Abwicklung: Kontur überschneidet sich (${n} Kreuzung${n === 1 ? '' : 'en'}) – Zuschnitt prüfen, z. B. Eckfreischnitt in der Blechregel`;
let cutMiss = 0;   // Ausschneiden, die keinen Körper getroffen haben (je Feature, siehe buildFeatures)
function verbinde(bodies, hit, tool, op, f, newId) {
  if (op === 'cut') {
    if (!bodies.length) throw new Error('Ausschneiden braucht einen vorhandenen Körper');
    if (!hit.length) cutMiss++;
    hit.slice().forEach(b => setShape(bodies, b, bool(b.shape, tool, 'cut')));
    return;
  }
  if (op === 'intersect') {
    if (!hit.length) throw new Error('Das Werkzeug schneidet keinen Körper');
    hit.slice().forEach(b => setShape(bodies, b, bool(b.shape, tool, 'intersect')));
    return;
  }
  // Verbinden: alle berührten Körper verschmelzen zum ersten, sonst entsteht ein neuer Körper
  if (!hit.length) { bodies.push({ id: newId, shape: tool }); return; }
  // (tool ist bereits vereinfacht)
  const first = hit[0];
  invalidateMesh(first);
  first.shape = bool(first.shape, tool, 'join');
  hit.slice(1).forEach(b => { invalidateMesh(b); first.shape = bool(first.shape, b.shape, 'join'); bodies.splice(bodies.indexOf(b), 1); });
  first.shape = tidy(first.shape);
}
function allBounds(bodies) {
  const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  bodies.forEach(b => { const q = bbOf(b.shape); for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], q[0][k]); bb[1][k] = Math.max(bb[1][k], q[1][k]); } });
  return bb;
}
/* Wie `allBounds`, aber mit der groben Hülle – für jede Stelle, die aus der Ausdehnung nur die
   Reichweite eines Werkzeugs macht (Bohrtiefe, Rippen- und Stegreichweite, „durch alles", Schnitt-
   ebene) und für die Richtungsfrage `intoMaterial`. Die grobe Hülle ist nie enger, das Werkzeug wird
   also höchstens weiter; gemessen an einer großen Baugruppe ist sie im Mittel 0,4 % und im
   schlechtesten 5,1 % weiter. Der Preis der genauen Fassung ist gemessen: 8,5 s für 24 Körper, die
   aus dem Binärspeicher gelesen wurden – ein Feature, das die Ausdehnung aller 797 Körper dieser
   Baugruppe braucht, zahlt damit über zwei Minuten. */
function allBoundsGrob(bodies) {
  const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  bodies.forEach(b => { const q = bbGrob(b.shape); for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], q[0][k]); bb[1][k] = Math.max(bb[1][k], q[1][k]); } });
  return bb;
}
/* Mehrere Körper zu einem Verbund (für Export) */
function compoundOf(shapes) {
  if (shapes.length === 1) return shapes[0];
  try { return R.makeCompound(shapes); } catch (_) { return shapes.reduce((a, b) => a.fuse(b)); }
}

/* ---------- Stützstruktur für den 3D-Druck ----------
   Wie die Stützen der Druckvorbereitung: jede Fläche, die flacher als der Grenzwinkel nach unten
   zeigt (dieselbe Regel wie die Überhang-Analyse: Anteil der Flächennormalen nach unten über
   sin(Grenzwinkel)), bekommt Material bis zum Druckbett. Das Bett liegt am tiefsten Punkt aller
   sichtbaren Körper. „block“ füllt den vollen Querschnitt, „grid“ setzt quadratische Säulen im
   Raster. Die selbsttragende Regel des Slicers (kein Stützmaterial, wenn unter einem Punkt in
   Grenzwinkel-Neigung schon Material oder das Bett ist) fehlt – sie hängt an der Netzauswertung
   und wäre ohne dünnwandige Stützen ohnehin nur eine Ersparnis. */
/* Stützstruktur für den 3D-Druck: zu jeder überhängenden Fläche ein Prisma in Druckrichtung
   bis zum Druckbett. Vollblock = voller Umriss, Raster = Vollblock mit herausgeschnittenen
   Feldern, also ein stehendes Gitter. */
function supportShape(shown, opts = {}) {
  const down = norm(opts.down || [0, 0, -1]), up = mul(down, -1);
  const lim = Math.sin(Math.min(85, Math.max(5, Number(opts.angle) || 45)) * Math.PI / 180);
  const gap = Math.max(0, Number(opts.gap) || 0);
  const step = Math.max(1.5, Number(opts.spacing) || 6);
  /* Höhe wird entlang der Druckrichtung gemessen: der größte Wert von Punkt·down ist der tiefste
     Punkt, also das Druckbett; der kleinste ist die Oberseite. */
  const ecken = shown.flatMap(b => { const q = bbOf(b.shape); return [0, 1, 2, 3, 4, 5, 6, 7].map(i => [q[i & 1][0], q[(i >> 1) & 1][1], q[(i >> 2) & 1][2]]); });
  const hBed = Math.max(...ecken.map(p => dot(p, down))), hTop = Math.min(...ecken.map(p => dot(p, down)));
  const L = hBed - hTop + 10, bed = mul(down, hBed);
  /* Normale nach außen wenden: liegt der Punkt neben der Fläche im Körper, zeigt sie nach innen */
  const outN = (F, solid) => {
    let n; try { n = norm(F.normalAt().toTuple()); } catch (_) { return null; }
    try {
      const c = F.center && F.center.toTuple ? F.center.toTuple() : F.pointOnSurface(0.5, 0.5).toTuple();
      return R.measureDistanceBetween(R.makeVertex(add(c, mul(n, 0.05))), solid) < 1e-6 ? mul(n, -1) : n;
    } catch (_) { return n; }
  };
  const prisms = [];
  shown.forEach(b => b.shape.faces.forEach(F => {
    const n = outN(F, b.shape);
    if (!n || dot(n, down) <= lim) return;
    try { prisms.push(R.basicFaceExtrusion(gap > 1e-6 ? F.clone().translate(...mul(down, gap)) : F.clone(), new R.Vector(mul(down, L)))); } catch (_) { /* Umriss einer gekrümmten Fläche fehlt */ }
  }));
  if (!prisms.length) return null;
  const model = compoundOf(shown.map(b => b.shape.clone()));
  let S = null;
  /* der Reihe nach: jeder Balken wird erst vom Körper und dann vom schon fertigen Teil befreit,
     sonst zählen sich überlappende Balken im Volumen doppelt */
  prisms.forEach(p => {
    const frei = bool(p, model, 'cut');
    if (!frei || (safeVolume(frei) || 0) <= 1e-9) return;
    const neu = S ? bool(frei, S, 'cut') : frei;
    if (!neu || (safeVolume(neu) || 0) <= 1e-9) return;
    S = S ? S.fuse(neu) : neu;
  });
  if (!S) return null;
  /* unter dem Druckbett abschneiden: die Prismen reichen bis über das Bett hinaus */
  S = bool(S, halfSpace(bed, up, L + 10), 'intersect');
  if (!S) return null;
  if (opts.style === 'grid') {
    /* Raster: aus dem Vollblock werden senkrechte Felder herausgeschnitten,
       zurück bleibt ein stehendes Gitter mit Stegen von step/2 Stärke */
    const q = bbOf(S);
    const u = anyPerp(up), v = norm(cross(up, u));
    const e2 = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [q[i & 1][0], q[(i >> 1) & 1][1], q[(i >> 2) & 1][2]]);
    const lo = a => Math.min(...e2.map(p => dot(p, a))), hi = a => Math.max(...e2.map(p => dot(p, a)));
    const u0 = lo(u), u1 = hi(u), v0 = lo(v), v1 = hi(v);
    const feld = Math.max(0.6, step / 2), wand = step - feld;
    const anzahl = Math.ceil((u1 - u0) / step) * Math.ceil((v1 - v0) / step);
    if (anzahl > 600) throw new Error('Das Raster wird zu fein – die Teilung vergrößern');
    const holes = [];
    for (let uu = u0 + step / 2; uu < u1 + 1e-9; uu += step) {
      for (let vv = v0 + step / 2; vv < v1 + 1e-9; vv += step) {
        const P = add(add(bed, mul(u, uu)), mul(v, vv));
        try { holes.push(R.drawRectangle(feld, feld).sketchOnPlane(new R.Plane(P, u, up)).extrude(L)); } catch (_) { /* Feld überspringen */ }
      }
    }
    if (!holes.length) return S && (safeVolume(S) || 0) > 1e-9 ? S : null;
    S = bool(S, compoundOf(holes), 'cut');
  }
  return S && (safeVolume(S) || 0) > 1e-9 ? S : null;
}

/* ---------- Zeichnung: Normansichten per verdeckter-Kanten-Projektion ----------
   Kamera: dir zeigt zum Betrachter, x = Bildschirm-rechts (wie gp_Ax2). Projektionsmethode 1 (DIN ISO 5456-2). */
const VIEW_CAMS = {
  front: { dir: [0, -1, 0], x: [1, 0, 0] },
  top: { dir: [0, 0, 1], x: [1, 0, 0] },
  left: { dir: [-1, 0, 0], x: [0, -1, 0] },
  right: { dir: [1, 0, 0], x: [0, 1, 0] },
  back: { dir: [0, 1, 0], x: [-1, 0, 0] },
  bottom: { dir: [0, 0, -1], x: [1, 0, 0] },
  iso: { dir: norm([1, -1, 1]), x: norm([1, 1, 0]) },
  iso2: { dir: norm([-1, 1, 1]), x: norm([-1, -1, 0]) },
  // perspektivisch (Fluchtpunkt) aus der Richtung der Isometrie
  isoP: { dir: norm([1, -1, 1]), x: norm([1, 1, 0]), persp: true }
};
/* Perspektivische Ansicht: verdeckte Kanten mit dem Fluchtpunkt-Projektor von OpenCASCADE.
   Bildebene durch die Mitte des Körpers, Auge im Abstand 3 × Diagonale davor. Sichtbare Kanten und Umrisslinien
   gekrümmter Flächen; Bildkoordinaten wie die übrigen Ansichten (u = Weltlage entlang x, v entlang dir × x). */
function perspProjection(shape, c) {
  const oc = R.getOC(), bb = bbOf(shape), ctr = mul(add(bb[0], bb[1]), 0.5), diag = Math.max(1, len(sub(bb[1], bb[0])));
  const yv = cross(c.dir, c.x), u0 = dot(ctr, c.x), v0 = dot(ctr, yv);
  const algo = new oc.HLRBRep_Algo();
  const pfade = [];
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  try {
    algo.Add(shape.wrapped, 0);
    const ax = new oc.gp_Ax2(new oc.gp_Pnt(...ctr), new oc.gp_Dir(...c.dir), new oc.gp_Dir(...c.x));
    algo.Projector(new oc.HLRAlgo_Projector(ax, 3 * diag)); algo.Update(); algo.Hide();
    const h = new oc.HLRBRep_HLRToShape(algo);
    for (const comp of [h.VCompound(), h.OutLineVCompound()]) {
      if (!comp || comp.IsNull()) continue;
      for (const e of R.cast(comp).edges) {
        const n = e.geomType === 'LINE' ? 1 : 24, P = [];
        // die y-Achse des Projektors läuft hier entgegen der übrigen Ansichten (im Blatt geprüft: sonst steht das Bild Kopf)
        for (let i = 0; i <= n; i++) { const p = e.pointAt(i / n).toTuple(), q = [p[0] + u0, v0 - p[1]]; P.push(q); lo = [Math.min(lo[0], q[0]), Math.min(lo[1], q[1])]; hi = [Math.max(hi[0], q[0]), Math.max(hi[1], q[1])]; }
        pfade.push('M' + P.map(q => `${q[0].toFixed(4)} ${q[1].toFixed(4)}`).join(' L'));
      }
    }
  } finally { algo.delete(); }
  return { vis: pfade, hid: [], bb: pfade.length ? [lo, hi] : null };
}
function svgPaths(drawing) {
  try { const p = drawing.toSVGPaths(); return (Array.isArray(p) ? p : [p]).flat(Infinity).filter(Boolean); } catch (_) { return []; }
}
/* Bildkoordinaten einer Ansicht: u = p·x, v = p·(dir × x) (wie drawProjection) */
const viewUV = (c, p) => { const y = cross(c.dir, c.x); return [dot(p, c.x), dot(p, y)]; };
/* Zylinder der Körper → Mittelkreuze (Achse zur Blickrichtung) und Mittellinien (Achse quer) */
function cylinderMarks(shape, c) {
  const marks = [], seen = new Set();
  let faces = [];
  try { faces = shape.faces; } catch (_) { faces = []; }
  faces.forEach(fc => {
    if (fc.geomType !== 'CYLINDRE') return;
    let ci;
    try { ci = cylinderInfo(fc); } catch (_) { return; }
    const al = Math.abs(dot(ci.a, c.dir));
    if (al > 0.999) {
      const [u, v] = viewUV(c, ci.o), key = `c${u.toFixed(3)},${v.toFixed(3)},${ci.r.toFixed(3)}`;
      if (seen.has(key)) return; seen.add(key);
      // ganzer Zylinder (Bohrung, Bolzen) oder nur ein Teil davon (Biegung, Abrundung) → Durchmesser bzw. Radius
      let full = true;
      try { const b = fc.UVBounds; full = b.uMax - b.uMin >= 2 * Math.PI - 1e-3; } catch (_) { full = true; }
      marks.push({ k: 'circle', c: [u, v], r: ci.r, internal: ci.internal, full });
    } else if (al < 0.001) {
      const a = viewUV(c, ci.o), b = viewUV(c, add(ci.o, mul(ci.a, ci.L))), key = `l${a.map(x => x.toFixed(3))}${b.map(x => x.toFixed(3))}`;
      if (seen.has(key)) return; seen.add(key);
      marks.push({ k: 'axis', a, b, r: ci.r });
    }
  });
  return marks;
}
/* Ebene Flächen in der Schnittebene → Dreiecke für die Schraffur */
function sectionHatch(shape, c, n, d) {
  const tris = [];
  try {
    const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.3 });
    const byFace = new Map(m.faceGroups.map(g => [g.faceId, g]));
    shape.faces.forEach(fc => {
      if (fc.geomType !== 'PLANE') return;
      const fn = fc.normalAt().toTuple();
      if (Math.abs(Math.abs(dot(fn, n)) - 1) > 1e-6 || Math.abs(dot(n, fc.center.toTuple()) - d) > 1e-4) return;
      const g = byFace.get(fc.hashCode);
      if (!g) return;
      for (let i = g.start; i < g.start + g.count; i += 3) {
        tris.push([0, 1, 2].map(k => { const vi = m.triangles[i + k] * 3; return viewUV(c, [m.vertices[vi], m.vertices[vi + 1], m.vertices[vi + 2]]); }));
      }
    });
  } catch (_) { /* ohne Schraffur */ }
  return tris;
}
/* Ansicht eines Körpers aus seinem Netz: Silhouette (Vorder-/Rückseite wechseln), scharfe Kanten (> 35°) und offene Ränder.
   Verdeckung über einen Tiefenpuffer; Rückgabe wie drawProjection: Pfade in Bildkoordinaten (u, v) und Hüllbox. */
function meshProjection(shape, c) {
  const m = shape.mesh({ tolerance: 0.08, angularTolerance: 0.3 });
  const V = m.vertices, Tr = m.triangles, yv = cross(c.dir, c.x);
  // gleiche Punkte verschmelzen (das Netz hat je Fläche eigene Punkte)
  const idx = new Map(), pts = [], map = new Int32Array(V.length / 3);
  for (let i = 0; i < V.length / 3; i++) {
    const p = [V[3 * i], V[3 * i + 1], V[3 * i + 2]], k = p.map(x => Math.round(x * 1e4)).join(',');
    let j = idx.get(k);
    if (j === undefined) { j = pts.length; idx.set(k, j); pts.push(p); }
    map[i] = j;
  }
  const uvw = pts.map(p => [dot(p, c.x), dot(p, yv), dot(p, c.dir)]);
  const nT = Tr.length / 3, tn = [], edges = new Map();
  for (let t = 0; t < nT; t++) {
    const a = map[Tr[3 * t]], b = map[Tr[3 * t + 1]], d = map[Tr[3 * t + 2]];
    const n = cross(sub(pts[b], pts[a]), sub(pts[d], pts[a])), l = len(n);
    tn.push(l > 1e-15 ? mul(n, 1 / l) : [0, 0, 0]);
    [[a, b], [b, d], [d, a]].forEach(([p, q]) => { if (p === q) return; const k = p < q ? `${p},${q}` : `${q},${p}`; const e = edges.get(k); if (e) e.push(t); else edges.set(k, [p, q, t]); });
  }
  // Tiefenpuffer (größere w = näher am Betrachter)
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  uvw.forEach(([u, v]) => { u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); });
  const span = Math.max(u1 - u0, v1 - v0, 1e-6), N = 700, cell = span / N;
  const NX = Math.ceil((u1 - u0) / cell) + 2, NY = Math.ceil((v1 - v0) / cell) + 2, zb = new Float32Array(NX * NY).fill(-Infinity);
  for (let t = 0; t < nT; t++) {
    const P = [0, 1, 2].map(k => uvw[map[Tr[3 * t + k]]]);
    const xs = P.map(q => (q[0] - u0) / cell), ys = P.map(q => (q[1] - v0) / cell);
    const den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
    if (Math.abs(den) < 1e-12) continue;
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(NY - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(NX - 1, Math.ceil(Math.max(...xs))); x++) {
        const l0 = ((ys[1] - ys[2]) * (x - xs[2]) + (xs[2] - xs[1]) * (y - ys[2])) / den, l1 = ((ys[2] - ys[0]) * (x - xs[2]) + (xs[0] - xs[2]) * (y - ys[2])) / den, l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        const w = l0 * P[0][2] + l1 * P[1][2] + l2 * P[2][2], i = y * NX + x;
        if (w > zb[i]) zb[i] = w;
      }
    }
  }
  const eps = Math.max(0.01 * span, 3 * cell);
  const seen = (u, v, w) => { const x = Math.round((u - u0) / cell), y = Math.round((v - v0) / cell); let z = -Infinity; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < NX && yy < NY) z = Math.max(z, zb[yy * NX + xx]); } return w >= z - eps; };
  const vis = [], hid = [], cosSharp = Math.cos(35 * Math.PI / 180);
  edges.forEach(e => {
    const [p, q] = e, ts = e.slice(2);
    let take = ts.length === 1;
    if (ts.length === 2) {
      const f0 = dot(tn[ts[0]], c.dir) > 0, f1 = dot(tn[ts[1]], c.dir) > 0;
      take = f0 !== f1 || dot(tn[ts[0]], tn[ts[1]]) < cosSharp;
    }
    if (!take) return;
    const A = uvw[p], B = uvw[q], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    (seen(...M) ? vis : hid).push([A, B]);
  });
  // Teilstücke zu Linienzügen verbinden (kleinere SVG-Pfade)
  const chain = segs => {
    const key = q => `${q[0].toFixed(4)},${q[1].toFixed(4)}`, at = new Map(), used = new Uint8Array(segs.length), out = [];
    segs.forEach((s, i) => [0, 1].forEach(k => { const kk = key(s[k]); if (!at.has(kk)) at.set(kk, []); at.get(kk).push(i); }));
    segs.forEach((s, i) => {
      if (used[i]) return;
      used[i] = 1;
      const line = [s[0], s[1]];
      for (const end of [1, 0]) {
        for (;;) {
          const tip = end ? line[line.length - 1] : line[0];
          const nx = (at.get(key(tip)) || []).find(j => !used[j]);
          if (nx === undefined) break;
          used[nx] = 1;
          const o = key(segs[nx][0]) === key(tip) ? segs[nx][1] : segs[nx][0];
          if (end) line.push(o); else line.unshift(o);
        }
      }
      out.push('M' + line.map(q => `${q[0].toFixed(4)} ${q[1].toFixed(4)}`).join(' L'));
    });
    return out;
  };
  return { vis: chain(vis), hid: chain(hid), bb: [[u0, v0], [u1, v1]] };
}
/* Freie Schnittansicht: Schnittlinie a–b in einer Normalansicht (pview), Blick in Pfeilrichtung.
   Die Schnittebene enthält die Linie und die Blickrichtung der Ausgangsansicht. */
function secCam(sp) {
  const pc = VIEW_CAMS[sp.pview];
  if (!pc || sp.pview.startsWith('iso') || !Array.isArray(sp.a) || !Array.isArray(sp.b) || !Array.isArray(sp.arrow)) return null;
  const yv = cross(pc.dir, pc.x), W = uv => add(mul(pc.x, uv[0]), mul(yv, uv[1]));
  const du = sp.b[0] - sp.a[0], dv = sp.b[1] - sp.a[1];
  if (Math.hypot(du, dv) < 1e-6) return null;
  const L3 = norm(sub(W(sp.b), W(sp.a))), nrm = norm(cross(L3, pc.dir));
  const arrow = dot(nrm, W(sp.arrow)) >= 0 ? nrm : mul(nrm, -1), dir = mul(arrow, -1);
  // Achsen wie in der Ausgangsansicht: steile Linie → bleibt senkrecht, flache Linie → bleibt waagerecht
  const x = Math.abs(dv) >= Math.abs(du) ? cross(mul(L3, Math.sign(dv)), dir) : mul(L3, Math.sign(du) || 1);
  return { dir, x: norm(x), p0: W(sp.a), L3, pdir: pc.dir, W };
}
/* Abgesetzte Schnittlinie: jeder Abschnitt parallel zur Schnittlinie liegt in einer eigenen
   Ebene, und zwar nur zwischen den benachbarten Absetzungen. Die Abschnitte grenzen bündig
   aneinander, zusammen ergeben sie den gleichen Streifen wie eine durchgehende Linie. */
function secStepped(sc, sp, bb) {
  const big = len(sub(bb[1], bb[0])) + 50;
  const P = sp.line.map(q => sc.W(q));
  const along = P.map(q => dot(q, sc.L3)), deep = P.map(q => dot(q, sc.dir));
  const out = [];
  for (let i = 0; i + 1 < P.length; i++) {
    if (Math.abs(along[i + 1] - along[i]) < 1e-6) continue;   // Absetzung: verbindet zwei Ebenen
    const O = sub(P[i], mul(sc.L3, along[i]));
    const Q = (s, t) => add(add(O, mul(sc.L3, s)), mul(sc.pdir, t));
    const [l0, l1] = [Math.min(along[i], along[i + 1]), Math.max(along[i], along[i + 1])];
    try {
      const pr = R.basicFaceExtrusion(R.makePolygon([Q(l0, -big), Q(l1, -big), Q(l1, big), Q(l0, big)]), new R.Vector(mul(sc.dir, 2 * big)));
      if (pr) out.push({ prism: pr, d: deep[i] });
    } catch (_) { /* Abschnitt überspringen */ }
  }
  return out;
}
/* Halbraum auf der Betrachterseite der Schnittebene als Prisma (zum Abziehen) */
function secPrism(sc, bb) {
  const ctr = mul(add(bb[0], bb[1]), 0.5), big = len(sub(bb[1], bb[0])) + 50;
  const c0 = sub(ctr, mul(sc.dir, dot(sub(ctr, sc.p0), sc.dir)));
  const P = (s, t) => add(add(c0, mul(sc.L3, s * big)), mul(sc.pdir, t * big));
  return R.basicFaceExtrusion(R.makePolygon([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)]), new R.Vector(mul(sc.dir, 2 * big)));
}
function projectViews(shape, keys, opts = {}) {
  const out = {};
  keys.forEach(k => {
    const sp = opts.secs && opts.secs[k], sc = sp ? secCam(sp) : null;
    const c = VIEW_CAMS[k] || sc;
    if (!c) return;
    let src = shape, hatch = null, cut = null, heavyK = opts.heavy || [];
    if (sc && sp.aux) {
      // Hilfsansicht: nur die Blickrichtung senkrecht zur gewählten Kante, kein Schnitt
    } else if (sc) {
      // freie Schnittansicht: Material auf der Betrachterseite entfernen, Schnittfläche schraffieren
      const boxes = [shape, ...heavyK].filter(Boolean).map(bbOf);
      if (!boxes.length) return;
      const bb = [[0, 1, 2].map(i => Math.min(...boxes.map(b => b[0][i]))), [0, 1, 2].map(i => Math.max(...boxes.map(b => b[1][i])))];
      const abgesetzt = Array.isArray(sp.line) && sp.line.length >= 3;
      const pieces = abgesetzt ? secStepped(sc, sp, bb) : [{ prism: secPrism(sc, bb), d: dot(sc.dir, sc.p0) }];
      if (!pieces.length) return;
      if (shape) {
        src = pieces.reduce((s, pc2) => { try { return s ? bool(s, pc2.prism.clone(), 'cut') : null; } catch (_) { return null; } }, shape.clone());
        if (src) pieces.forEach(pc2 => { hatch = (hatch || []).concat(sectionHatch(src, c, sc.dir, pc2.d)); });
      }
      heavyK = heavyK.map(h => pieces.reduce((s, pc2) => { try { return s ? bool(s, pc2.prism.clone(), 'cut') : null; } catch (_) { return null; } }, h.clone())).filter(Boolean);
      cut = true;
    }
    if (k === 'left' && opts.section && shape) {
      // Schnitt A–A: Ebene x = Mitte, Teil vor der Ebene (Betrachterseite −x) entfernen
      const bb = bbOf(shape), big = len(sub(bb[1], bb[0])) + 50;
      const cx = typeof opts.section === 'number' && opts.section > bb[0][0] && opts.section < bb[1][0] ? opts.section : (bb[0][0] + bb[1][0]) / 2;
      src = bool(shape.clone(), R.makeBox([cx - big, bb[0][1] - big, bb[0][2] - big], [cx, bb[1][1] + big, bb[1][2] + big]), 'cut');
      if (!src) return;
      hatch = sectionHatch(src, c, [1, 0, 0], cx);
      cut = cx;
    }
    // Ausbruch: geschlossener Umriss in der Ansicht, Material bis zur Tiefe ab der Vorderkante entfernen
    const brk = ((opts.breakouts || {})[k] || []).filter(b => Array.isArray(b.pts) && b.pts.length >= 3 && Number(b.depth) > 0);
    const brkOut = [];
    if (brk.length && !k.startsWith('iso') && src) {
      const yv = cross(c.dir, c.x), bb = bbOf(src);
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [bb[i & 1][0], bb[(i >> 1) & 1][1], bb[(i >> 2) & 1][2]]);
      const front = Math.max(...corners.map(q => dot(q, c.dir))) + 1, back = Math.min(...corners.map(q => dot(q, c.dir))) - 1;
      const orig = src;
      // Umrissteile, die über dem Teil liegen (Strahl in Blickrichtung trifft Material) → nur dort die Freihandlinie
      const runsOf = pts => {
        const W2 = (uv, w) => add(add(mul(c.x, uv[0]), mul(yv, uv[1])), mul(c.dir, w));
        const per = pts.reduce((a, q, i) => a + Math.hypot(pts[(i + 1) % pts.length][0] - q[0], pts[(i + 1) % pts.length][1] - q[1]), 0);
        const step = Math.max(0.4, per / 240), samples = [];
        pts.forEach((q, i) => { const r = pts[(i + 1) % pts.length], L = Math.hypot(r[0] - q[0], r[1] - q[1]), m = Math.max(1, Math.ceil(L / step)); for (let j = 0; j < m; j++) samples.push([q[0] + (r[0] - q[0]) * j / m, q[1] + (r[1] - q[1]) * j / m]); });
        const hit = samples.map(uv => { try { return R.measureDistanceBetween(orig, R.makeLine(W2(uv, front + 1), W2(uv, back - 1))) < 1e-6; } catch (_) { return true; } });
        if (hit.every(Boolean)) return null;
        const runs = [];
        let cur = null;
        const N = samples.length, start = hit.findIndex(h => !h);
        for (let k = 1; k <= N; k++) { const i = (start + k) % N; if (hit[i]) { (cur = cur || []).push(samples[i]); } else if (cur) { cur.push(samples[i]); runs.push(cur); cur = null; } }
        if (cur) runs.push(cur);
        return runs.map(r => r.map(q => q.map(v => Math.round(v * 1000) / 1000)));
      };
      brk.forEach(b => {
        try {
          const W = (uv, w) => add(add(mul(c.x, uv[0]), mul(yv, uv[1])), mul(c.dir, w));
          const prism = R.basicFaceExtrusion(R.makePolygon(b.pts.map(q => W(q, front))), new R.Vector(mul(c.dir, -(1 + Number(b.depth)))));
          const cutShape = bool(src, prism, 'cut');
          if (!cutShape) return;
          src = cutShape;
          (hatch = hatch || []).push(...sectionHatch(src, c, c.dir, front - 1 - Number(b.depth)));
          let runs = null; try { runs = runsOf(b.pts); } catch (_) { runs = null; }
          brkOut.push({ id: b.id, pts: b.pts, runs });
        } catch (_) { /* Ausbruch übergehen */ }
      });
    }
    let vis = [], hid = [], bb = null;
    if (src && c.persp) {
      try { const r = perspProjection(src, c); vis = r.vis; bb = r.bb; } catch (_) { const r = meshProjection(src, c); vis = r.vis; bb = r.bb; }
    } else if (src) {
      let pr = null;
      try { pr = R.drawProjection(src, new R.ProjectionCamera([0, 0, 0], c.dir, c.x)); } catch (_) { pr = null; }
      if (pr) {
        vis = svgPaths(pr.visible); hid = svgPaths(pr.hidden);
        try { bb = pr.visible.boundingBox.bounds; } catch (_) { bb = null; }
      } else {
        // die exakte Projektion scheitert an manchen Flächen (z. B. parallel gezogen): Ansicht aus dem Netz
        const r = meshProjection(src, c);
        vis = r.vis; hid = r.hid; bb = r.bb;
      }
    }
    heavyK.forEach(h => {
      try {
        const r = meshProjection(h, c);
        vis.push(...r.vis); hid.push(...r.hid);
        bb = bb ? [[Math.min(bb[0][0], r.bb[0][0]), Math.min(bb[0][1], r.bb[0][1])], [Math.max(bb[1][0], r.bb[1][0]), Math.max(bb[1][1], r.bb[1][1])]] : r.bb;
      } catch (_) { /* Körper übergehen */ }
    });
    out[k] = { vis, hid: k === 'iso' || cut != null ? [] : hid, bb, marks: k === 'iso' || !src ? [] : cylinderMarks(src, c), hatch, cut, breakout: brkOut };
  });
  return out;
}

/* ---------- Messen (am zuletzt gebauten Stand) ---------- */
let lastBodies = [];
function circleCenter(a, b, c) {
  // Umkreismittelpunkt dreier Raumpunkte
  const ab = sub(b, a), ac = sub(c, a), n = cross(ab, ac), nn = dot(n, n);
  if (nn < 1e-18) return null;
  const t1 = mul(cross(n, ab), dot(ac, ac)), t2 = mul(cross(ac, n), dot(ab, ab));
  return add(a, mul(add(t1, t2), 1 / (2 * nn)));
}
function findShape(sel) {
  const hit = findSel(lastBodies, sel.kind, sel.ref, sel.body);
  return hit ? hit.shape : null;
}
function describe(sel, s) {
  const d = { kind: sel.kind, type: s.geomType };
  if (sel.kind === 'edge') {
    d.length = R.measureLength(s);
    if (s.geomType === 'LINE') d.dir = norm(sub(s.endPoint.toTuple(), s.startPoint.toTuple()));
    else if (s.geomType === 'CIRCLE') {
      const a = s.pointAt(0).toTuple(), b = s.pointAt(0.3).toTuple(), c = s.pointAt(0.6).toTuple();
      d.center = circleCenter(a, b, c);
      if (d.center) d.radius = len(sub(a, d.center));
    }
  } else {
    d.area = R.measureArea(s);
    if (s.geomType === 'PLANE') d.dir = s.normalAt().toTuple();
  }
  return d;
}
/* Ebene Fläche als 2D-Umriss (für DXF): Außenkontur und Löcher in einem Flächen-Koordinatensystem */
function faceOutline(sel) {
  const face = findShape(sel);
  if (!face) throw new Error('Fläche nicht mehr gefunden');
  if (face.geomType !== 'PLANE') throw new Error('Nur ebene Flächen lassen sich als DXF speichern');
  const o = face.pointOnSurface(0.5, 0.5).toTuple(), nz = norm(face.normalAt(face.pointOnSurface(0.5, 0.5)).toTuple());
  // x-Achse möglichst entlang einer Weltachse in der Fläche
  let x = [1, 0, 0];
  if (Math.abs(dot(x, nz)) > 0.9) x = [0, 1, 0];
  x = norm(sub(x, mul(nz, dot(x, nz))));
  const y = cross(nz, x);
  const to2 = p => { const d = sub(p, o); return [dot(d, x), dot(d, y)]; };
  const loopOf = wire => {
    const edges = [];
    let circle = null;
    wire.edges.forEach(e => {
      const a = to2(e.startPoint.toTuple()), b = to2(e.endPoint.toTuple());
      const g = e.geomType;
      if (g === 'LINE') { edges.push({ type: 'line', a, b }); return; }
      if (g === 'CIRCLE') {
        const m = to2(e.pointAt(0.5).toTuple());
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) {
          const q = to2(e.pointAt(0.25).toTuple());
          const c = [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2];
          circle = { c, r: Math.hypot(a[0] - c[0], a[1] - c[1]) };
          void q;
          return;
        }
        edges.push({ type: 'arc', a, b, mid: m });
        return;
      }
      let prev = a;
      const nk = kurvenTeile(e);
      for (let i = 1; i <= nk; i++) { const q = to2(e.pointAt(i / nk).toTuple()); edges.push({ type: 'line', a: prev, b: q }); prev = q; }
    });
    return circle && !edges.length ? { circle } : { edges: circle ? edges.concat([]) : edges };
  };
  // alle Drähte der Fläche; der mit der größten Ausdehnung ist die Außenkontur
  const loops = face.wires.map(loopOf);
  const ext = lp => { const pts = lp.circle ? [[lp.circle.c[0] - lp.circle.r, lp.circle.c[1] - lp.circle.r], [lp.circle.c[0] + lp.circle.r, lp.circle.c[1] + lp.circle.r]] : lp.edges.flatMap(e => [e.a, e.b, ...(e.mid ? [e.mid] : [])]); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
  let iOut = 0;
  loops.forEach((lp, i) => { if (ext(lp) > ext(loops[iOut])) iOut = i; });
  // Nullpunkt in die linke untere Ecke legen
  const allPts = loops.flatMap(lp => lp.circle ? [[lp.circle.c[0] - lp.circle.r, lp.circle.c[1] - lp.circle.r]] : lp.edges.flatMap(e => [e.a, e.b, ...(e.mid ? [e.mid] : [])]));
  const mx = Math.min(...allPts.map(p => p[0])), my = Math.min(...allPts.map(p => p[1]));
  const sh = p => [p[0] - mx, p[1] - my];
  loops.forEach(lp => { if (lp.circle) lp.circle.c = sh(lp.circle.c); else lp.edges.forEach(e => { e.a = sh(e.a); e.b = sh(e.b); if (e.mid) e.mid = sh(e.mid); }); });
  const outer = loops[iOut], holes = loops.filter((_, i) => i !== iOut);
  return { contour: [outer], holes, bends: [] };
}
function measureSel(sels) {
  const shapes = sels.map(findShape);
  if (shapes.some(s => !s)) throw new Error('Auswahl nicht mehr gefunden');
  const ds = sels.map((s, i) => describe(s, shapes[i]));
  const out = [];
  if (ds.length === 1) {
    const d = ds[0];
    if (d.length != null) out.push(['Länge', d.length, 'mm']);
    if (d.radius != null) { out.push(['Radius', d.radius, 'mm']); out.push(['Durchmesser', d.radius * 2, 'mm']); }
    if (d.area != null) out.push(['Fläche', d.area, 'mm²']);
  } else if (ds.length === 2) {
    out.push(['Abstand (kürzester)', R.measureDistanceBetween(shapes[0], shapes[1]), 'mm']);
    const [a, b] = ds;
    if (a.dir && b.dir) {
      const c = Math.min(1, Math.abs(dot(a.dir, b.dir)));
      const lineVsPlane = (a.kind === 'edge') !== (b.kind === 'edge');
      const ang = Math.acos(c) * 180 / Math.PI;
      out.push(['Winkel', lineVsPlane ? 90 - ang : ang, '°']);
    }
    if (a.center && b.center) out.push(['Mitte – Mitte', len(sub(a.center, b.center)), 'mm']);
    ds.forEach((d, i) => { if (d.radius != null) out.push([`Durchmesser ${i + 1}`, d.radius * 2, 'mm']); });
  }
  return out;
}

/* ---------- Feature-Liste abspielen ---------- */
/* Komponenten: id → Körper-IDs (für Verschieben und Gelenke) */
let compMap = new Map();
function compBodies(id) { return compMap.get(id) || []; }

/* Gelenk-Ursprung aus Kante oder Fläche: { o, z } */
/* Gelenkursprünge: Definition je Feature-ID, bei jeder Verwendung aus der aktuellen Geometrie neu berechnet */
let joriginDefs = new Map();
function joriginFrame(def, bodies) {
  const F = jointFrame(def.sel, bodies);
  if (!F) return null;
  const z = def.flip ? mul(F.z, -1) : F.z, X = anyPerp(F.z), Y = cross(F.z, X);
  const o = add(F.o, add(add(mul(X, Number(def.dx) || 0), mul(Y, Number(def.dy) || 0)), mul(F.z, Number(def.dz) || 0)));
  return { o, z, body: F.body };
}
function jointFrame(sel, bodies) {
  if (!sel) return null;
  if (sel.kind === 'jorigin') { const def = joriginDefs.get(sel.id); return def && def.sel && def.sel.kind !== 'jorigin' ? joriginFrame(def, bodies) : null; }
  const hit = findSel(bodies, sel.kind, sel.ref, sel.body);
  for (const b of hit ? [hit.body] : []) {
    const s = hit.shape;
    if (sel.kind === 'face') {
      if (s.geomType === 'PLANE') return { o: s.center.toTuple(), z: s.normalAt().toTuple(), body: b.id };
      return { o: s.center.toTuple(), z: s.normalAt().toTuple(), body: b.id };
    }
    if (s.geomType === 'CIRCLE') {
      const a = s.pointAt(0).toTuple(), p = s.pointAt(0.3).toTuple(), c = s.pointAt(0.6).toTuple();
      const ctr = circleCenter(a, p, c) || s.pointAt(0.5).toTuple();
      let z = norm(cross(sub(p, a), sub(c, a)));
      // Achse aus der ebenen Fläche heraus, auf der der Kreis liegt (eindeutig)
      let onPlane = false;
      for (const fc of b.shape.faces) {
        if (fc.geomType !== 'PLANE') continue;
        const n = fc.normalAt().toTuple();
        if (Math.abs(Math.abs(dot(n, z)) - 1) < 1e-6 && Math.abs(dot(n, sub(ctr, fc.center.toTuple()))) < 1e-5) { z = n; onPlane = true; break; }
      }
      // sonst (z. B. Fasen- oder Rundungskante): vom Körper weg zeigen lassen
      if (!onPlane) { const bb = bbOf(b.shape), mc = mul(add(bb[0], bb[1]), 0.5); if (dot(z, sub(ctr, mc)) < 0) z = mul(z, -1); }
      return { o: ctr, z, body: b.id };
    }
    const p0 = s.startPoint.toTuple(), p1 = s.endPoint.toTuple();
    return { o: mul(add(p0, p1), 0.5), z: norm(sub(p1, p0)), body: b.id };
  }
  return null;
}
function anyPerp(v) { return norm(Math.abs(v[0]) < 0.9 ? cross(v, [1, 0, 0]) : cross(v, [0, 1, 0])); }

/* ---------- Baugruppen: eingefügte Teile ----------
   Jedes Teil wird für sich gebaut (zwischengespeichert nach Inhalt) und als Komponente mit Lage `at` eingesetzt.
   Körper-IDs: `<Einfügung>/<Körper im Teil>`. */
const partCache = new Map();
function partBodies(part) {
  const key = JSON.stringify([part.features, part.inserts || [], cosmeticThreads]);
  let hit = partCache.get(key);
  if (!hit) {
    const saved = compMap, savedSink = partSink;
    compMap = new Map((part.components || []).map(c => [c.id, c.bodies || []]));
    partSink = [];
    let res;
    try { res = buildFeatures(part.features || [], undefined, part.inserts || [], 1); } finally { compMap = saved; }
    const meta = partSink;
    partSink = savedSink;
    const bad = Object.values(res.status).filter(s => !s.ok).length;
    hit = { bodies: res.bodies, bad, meta };
    partCache.set(key, hit);
    if (partCache.size > 40) partCache.delete(partCache.keys().next().value);
  }
  return hit;
}
function placeInserts(inserts, bodies, status, depth) {
  (inserts || []).forEach(ins => {
    try {
      if (!ins.part || !Array.isArray(ins.part.features)) throw new Error('Teil fehlt');
      if (depth > 4) throw new Error('Baugruppen zu tief verschachtelt');
      const { bodies: pb, bad } = partBodies({ ...ins.part, inserts: ins.part.inserts || [] });
      const at = Array.isArray(ins.at) ? ins.at : [0, 0, 0];
      const ids = [];
      pb.forEach(b => {
        let s = b.shape.clone();
        if (ins.rot) s = s.rotate(Number(ins.rot.angle) || 0, [0, 0, 0], AXES[ins.rot.axis] || AXES.Z);
        if (len(at) > 1e-12) s = s.translate(...at);
        const id = `${ins.id}/${b.id}`;
        bodies.push({ id, shape: s });
        ids.push(id);
      });
      compMap.set(ins.id, ids);
      status[ins.id] = bad ? { ok: true, warn: `${bad} Feature${bad > 1 ? 's' : ''} im Teil mit Fehler` } : { ok: true };
    } catch (err) {
      status[ins.id] = { ok: false, error: niceError(err) };
    }
  });
}

/* Bewegungsverknüpfung: Gelenk 2 folgt Gelenk 1 im Verhältnis Wert 2 / Wert 1 (umgekehrt mit −). Vor dem Bau
   auf Kopien der Gelenke angewandt, der Reihe nach (Ketten A → B → C gehen) – so gilt sie für Modell, Kollision und
   Bewegungsstudie gleich. Unterdrückte Verknüpfungen zählen nicht. */
function applyMotionLinks(features) {
  if (!features.some(f => f.type === 'motionlink' && !f.suppressed)) return features;
  const out = features.slice(), at = new Map(out.map((f, i) => [f.id, i]));
  out.forEach(l => {
    if (l.type !== 'motionlink' || l.suppressed) return;
    const ia = at.get(l.a), ib = at.get(l.b), va = Number(l.va), vb = Number(l.vb);
    if (ia == null || ib == null || ia === ib || !(Math.abs(va) > 1e-12)) return;
    const A = out[ia], fa = l.fa || 'angle', fb = l.fb || 'angle';
    const wert = (Number(A[fa]) || 0) * (vb / va) * (l.reverse ? -1 : 1);
    out[ib] = { ...out[ib], [fb]: Math.round(wert * 1e9) / 1e9 };
  });
  return out;
}
function buildFeatures(features, upTo, inserts, depth = 0) {
  features = applyMotionLinks(features);
  const byId = {};
  features.forEach(f => { byId[f.id] = f; });
  const status = {};
  const tools = new Map();
  const planes = new Map(), wpts = new Map(), waxes = new Map(); // Arbeitsebenen, -punkte, -achsen dieses Aufbaus
  const solved = new Map();
  const updated = {};
  const bodies = [];
  const copies = {};
  const unfolds = new Map(); // Körper-ID → Zustand zwischen Abwickeln und Zurückfalten
  // Starre Gruppen: bewegt ein Gelenk oder Verschieben eine Komponente, gehen alle der Gruppe mit
  const rigid = [];
  const withGroup = ids => {
    const out = new Set(ids);
    for (let grew = true; grew;) { grew = false; rigid.forEach(g => { if ([...g].some(c => out.has(c)) && [...g].some(c => !out.has(c))) { g.forEach(c => out.add(c)); grew = true; } }); }
    return [...out];
  };
  if (!depth) joriginDefs = new Map();
  if (!depth) { sheetMeta = { base: null, flanges: [], bendLines: [] }; frameMeta = []; weldMeta = []; partMeta = []; refMap = new Map(); ptMap = {}; heavyIds = new Set(); instStand = new Map(); }
  placeInserts(inserts, bodies, status, depth);
  const n = upTo == null ? features.length : upTo;
  for (let i = 0; i < n; i++) {
    // „Neue Komponente“ baut wie „Neuer Körper“ – die Komponente legt die Oberfläche an (Feature-Besitzer)
    const f = features[i].op === 'newcomp' ? { ...features[i], op: 'new' } : features[i];
    if (f.suppressed) { status[f.id] = { ok: true, suppressed: true }; continue; }
    // Ein nachfolgendes Feature kann importierte Körper verändern, dann ist ihr
    // gespeichertes Anzeige-Netz veraltet. Gemerkt wird nur die Form selbst:
    // Verglichen wird nach dem Feature gegen den Stand davor, also bleibt der
    // Cache erhalten, wenn das Feature andere Körper verändert oder nur neue
    // Körper entstehen (wie in einer großen STEP-Baugruppe mit eigenem Teil).
    const meshSrc = bodies.some(b => b.meshCacheKey) ? new Map(bodies.filter(b => b.meshCacheKey).map(b => [b.id, b.shape])) : null;
    const before = bodies.map(b => b.id);
    cutMiss = 0;
    const heavySrc = f.type === 'coil' || ((f.type === 'pattern' || f.type === 'mirror') && (f.features || []).some(id => byId[id] && byId[id].type === 'coil'));
    const preShapes = heavySrc ? new Map(bodies.map(b => [b.id, b.shape])) : null;
    // Achsbezug auf eine Arbeitsachse: Lage aus diesem Aufbau (sie kann mit Körperecken gewandert sein)
    ['axisRef', 'axis2Ref'].forEach(k => {
      if (f[k] && f[k].id && waxes.has(f[k].id)) { const a = waxes.get(f[k].id); f[k] = { ...f[k], o: a.o, d: a.d }; }
    });
    // eigene Blechregel des Features (z. B. aus einem STEP-Blechteil: Dicke und Radius je Teil), K-Faktor vom Dokument
    const regelVorher = sheetRule;
    if (f.regel && typeof f.regel === 'object') sheetRule = { ...sheetRule, ...(Number(f.regel.t) > 0 ? { t: Number(f.regel.t) } : {}), ...(Number(f.regel.r) >= 0 ? { r: Number(f.regel.r) } : {}) };
    try {
      switch (f.type) {
        case 'sketch': {
          const sk = migrateSketch(JSON.parse(JSON.stringify(f)));
          if (f.planeRef && planes.has(f.planeRef)) sk.plane = { ...planes.get(f.planeRef) };
          if (!sk.curves.length && !(sk.texts || []).length && !sk.points.length) throw new Error('Skizze ist leer');
          const warn = refreshRefs(sk, solved, byId);
          solved.set(sk.id, sk);
          if (warn !== null) updated[sk.id] = { points: sk.points, curves: sk.curves };
          if (warn) { status[f.id] = { ok: true, warn }; continue; }
          break;
        }
        case 'extrude': {
          /* Profil = ebene Körperfläche (profile: BRepFace): die Fläche wird entlang ihrer Außennormale
             extrudiert – Abstand oder „Alle“, Richtung normal/umgekehrt/symmetrisch/zwei Seiten, beliebige Operation */
          if (f.src === 'face') {
            if (!f.fromFace || !f.fromFace.face) throw new Error('Ebene Körperfläche als Profil anklicken');
            const hit = findSel(bodies, 'face', f.fromFace.face, f.fromFace.body);
            if (!hit) throw new Error('Die gewählte Fläche gibt es nicht mehr');
            if (hit.shape.geomType !== 'PLANE') throw new Error('Als Profil geht nur eine ebene Fläche');
            if (f.thin || Math.abs(Number(f.taper) || 0) > 1e-9 || f.extent === 'toface') throw new Error('Mit einer Körperfläche als Profil gehen nur Abstand oder „Alle“, ohne Verjüngung und dünne Wand');
            const n = norm(hit.shape.normalAt().toTuple());
            let d, off = 0;
            if (f.extent === 'all') {
              const bb = allBoundsGrob(bodies), L = len(sub(bb[1], bb[0])) * 2 + 10;
              d = f.direction === 'reverse' ? -L : L;
              if (f.direction === 'symmetric' || f.direction === 'two') { off = -L; d = 2 * L; }
            } else {
              const dist = Number(f.distance);
              if (!(dist > 1e-6)) throw new Error('Abstand muss größer als 0 sein');
              d = f.direction === 'reverse' ? -dist : dist;
              if (f.direction === 'symmetric') { if (f.symHalf) { off = -dist; d = 2 * dist; } else off = -dist / 2; }
              if (f.direction === 'two') { const d2 = Number(f.dist2); if (!(d2 > 1e-6)) throw new Error('Abstand der zweiten Seite muss größer als 0 sein'); off = -d2; d = dist + d2; }
            }
            let face = hit.shape.clone();
            if (Math.abs(off) > 1e-12) face = face.translate(...mul(n, off));
            const tool = R.basicFaceExtrusion(face, new R.Vector(mul(n, d)));
            applyOp(bodies, tool, f.op, f, f.id);
            tools.set(f.id, [{ tool, op: f.op }]);
            break;
          }
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          let off = 0, d, taper2 = null;
          const pl = needPlane(sk);
          const taper = Number(f.taper) || 0;
          /* Start „Versatz ab Profilebene“ oder „Von Objekt“: die Startebene wandert
             in die Richtung, in der das Material wächst. Ohne das Feld bleibt sie die Profilebene.
             Bei „Von Objekt“ ist die Startebene die Ebene der angeklickten Fläche, der Versatz gilt ab ihr. */
          const so = f.start === 'offset' || f.start === 'object' ? Number(f.startOffset) || 0 : 0;
          let base = 0;
          if (f.start === 'object') {
            const s = f.startRef;
            if (!s || !s.n) throw new Error('Startfläche wählen');
            const c = dot(s.n, pl.n);
            if (Math.abs(c) < 1e-6) throw new Error('Die Startfläche liegt nicht parallel zur Skizze');
            base = (s.dist - dot(s.n, pl.o)) / c;
          }
          if (f.extent === 'toface') {
            // bis zu einer ebenen Fläche (parallel zur Skizze)
            const t = f.toFace;
            if (!t || !t.n) throw new Error('Zielfläche wählen');
            const c = dot(t.n, pl.n);
            if (Math.abs(c) < 1e-6) throw new Error('Die Zielfläche liegt nicht parallel zur Skizze');
            d = (t.dist - dot(t.n, pl.o)) / c + (Number(f.toOffset) || 0) * Math.sign((t.dist - dot(t.n, pl.o)) / c || 1);
            if (Math.abs(d) < 1e-6) throw new Error('Die Zielfläche liegt in der Skizzenebene');
            off = base + so * Math.sign(d);
            d -= off;
            if (Math.abs(d) < 1e-6) throw new Error('Der Start liegt auf der Zielfläche');
          } else if (f.extent === 'all') {
            const bb = bodies.length ? allBoundsGrob(bodies) : [[-500, -500, -500], [500, 500, 500]];
            const L = len(sub(bb[1], bb[0])) + len(sub(pl.o, bb[0])) + 10;
            d = f.direction === 'reverse' ? -L : L;
            if (f.direction === 'symmetric') { off = -L; d = 2 * L; }
            // „Alle“ geht durch alles: der Dialog zeigt dort keinen Start, also auch keinen versteckt anwenden
          } else {
            const dist = Number(f.distance);
            if (!(dist > 1e-6)) throw new Error('Abstand muss größer als 0 sein');
            d = dist;
            if (f.direction === 'reverse') d = -dist;
            // symmetrisch: Maß als ganze Länge (Vorgabe) oder je Seite (isFullLength = false)
            if (f.direction === 'symmetric') { if (f.symHalf) { d = 2 * dist; off = -dist; } else off = -dist / 2; }
            if (f.direction === 'two') {
              /* zwei Seiten: eigene Ausdehnung und eigene Verjüngung je Seite.
                 Ohne Verjüngung reicht ein Körper – die zweite Seite kommt unter der Profilebene heraus. */
              const d2 = Number(f.dist2);
              if (!(d2 > 1e-6)) throw new Error('Abstand der zweiten Seite muss größer als 0 sein');
              taper2 = Number(f.taper2) || 0;
              // dünne Wand: keine Verjüngung (im Dialog ausgeblendet, kann aber noch in der Datei stehen)
              if ((!taper && !taper2) || f.thin) { off -= d2; d = dist + d2; }
            }
            off += base + so * Math.sign(d);
          }
          let tool;
          if (f.thin) {
            // dünne Wand: die Profilkontur wird mit eigener Dicke extrudiert, Verjüngung gibt es dazu nicht
            tool = thinWall(sk, f, off, d);
          } else if (taper2 !== null && (taper || taper2)) {
            // je Seite eigene Verjüngung: zwei Körper an der Profilebene, dann vereinigt
            const d2 = Number(f.dist2);
            if (Math.abs(taper2) >= 89) throw new Error('Verjüngungswinkel zu groß');
            const prism = (o, dd, tk) => {
              let s = sketchDrawing(sk, f.profiles).sketchOnPlane(makePlane(pl, o)).extrude(dd);
              if (Math.abs(tk) > 1e-9) s = draftSides(s, mul(pl.n, Math.sign(dd)), add(pl.o, mul(pl.n, o)), -tk);
              return s;
            };
            tool = fuseKeepFaces(prism(off, d, taper), prism(off, -d2, taper2));
            if (!tool) throw new Error('Die beiden Seiten lassen sich nicht verbinden');
          } else {
            if (Math.abs(taper) > 1e-9 && f.direction === 'symmetric') {
              /* symmetrisch mit Verjüngung: beide Hälften von der Profilebene weg mit demselben Winkel,
                 als zwei Körper an der Profilebene vereinigt */
              if (Math.abs(taper) >= 89) throw new Error('Verjüngungswinkel zu groß');
              const o0 = off + d / 2, half = d / 2;
              const prism = (dd) => draftSides(sketchDrawing(sk, f.profiles).sketchOnPlane(makePlane(pl, o0)).extrude(dd), mul(pl.n, Math.sign(dd)), add(pl.o, mul(pl.n, o0)), -taper);
              tool = fuseKeepFaces(prism(half), prism(-half));
              if (!tool) throw new Error('Die beiden Hälften lassen sich nicht verbinden');
            } else {
              tool = sketchDrawing(sk, f.profiles).sketchOnPlane(makePlane(pl, off)).extrude(d);
              if (Math.abs(taper) > 1e-9) {
                // Verjüngungswinkel (negativ = nach innen): Seitenflächen um die Skizzenebene geneigt
                if (Math.abs(taper) >= 89) throw new Error('Verjüngungswinkel zu groß');
                tool = draftSides(tool, mul(pl.n, Math.sign(d)), add(pl.o, mul(pl.n, off)), -taper);
              }
            }
          }
          applyOp(bodies, tool, f.op, f, f.id);
          tools.set(f.id, [{ tool, op: f.op }]);
          break;
        }
        case 'revolve': {
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          let ang1 = Number(f.angle);
          if (f.rext !== 'toface' && !(ang1 > 0 && ang1 <= 360)) throw new Error('Winkel zwischen 0 und 360°');
          /* Richtung: eine Seite, symmetrisch (Winkel je zur Hälfte beidseits der Skizze) oder zwei Seiten
             mit eigenem Winkel. Gedreht wird über den ganzen Winkel, danach um den Anteil der zweiten Seite zurück. */
          const ang2 = f.rdir === 'two' ? Number(f.angle2) : 0, rToFace = f.rext === 'toface';
          if (f.rdir === 'two' && !(ang2 > 0)) throw new Error('Winkel der zweiten Seite muss größer als 0 sein');

            needPlane(sk);
            const W = (u, v) => add(sk.plane.o, add(mul(sk.plane.x, u), mul(sk.plane.y, v)));
          let ao = sk.plane.o, axis = f.axis === 'x' ? sk.plane.x : sk.plane.y;
          if (f.axisRef && f.axisRef.d) { ao = f.axisRef.o; axis = norm(f.axisRef.d); }
          else if (f.axis && f.axis !== 'x' && f.axis !== 'y') {
            const c = (sk.curves || []).find(x => x.id === f.axis && x.type === 'line');
            const pm = new Map((sk.points || []).map(p => [p.id, p]));
            const a = c && pm.get(c.p1), b = c && pm.get(c.p2);
            if (!a || !b) throw new Error('Die Achslinie gibt es in der Skizze nicht mehr');
            ao = W(a.x, a.y); axis = norm(sub(W(b.x, b.y), ao));
          }
          // Achse in die Skizzenebene projizieren (isProjectAxis), z. B. eine Kante neben der Skizze
          if (f.projAxis) {
            const n = norm(sk.plane.n), ax2 = sub(axis, mul(n, dot(axis, n)));
            if (len(ax2) < 1e-9) throw new Error('Die Achse steht senkrecht auf der Skizzenebene und lässt sich nicht projizieren');
            ao = sub(ao, mul(n, dot(sub(ao, sk.plane.o), n))); axis = norm(ax2);
          }
          /* Bis Objekt (Ausdehnung „Bis“): ebene Zielfläche, die die Achse enthält. Winkel = vom Profil (Richtung
             zum Schwerpunkt seiner Punkte) bis zur ersten Lage der Zielebene in Drehrichtung (rechte Hand um die Achse). */
          if (f.rext === 'toface') {
            const t = f.toFace;
            if (!t || !t.n) throw new Error('Zielfläche wählen');
            const tn = norm(t.n);
            if (Math.abs(dot(tn, axis)) > 1e-6 || Math.abs(dot(tn, ao) - t.dist) > 1e-4) throw new Error('Die Zielfläche muss die Drehachse enthalten (eine Ebene durch die Achse)');
            const used = new Set(); (sk.curves || []).forEach(c => { if (!c.cons) [c.p1, c.p2, c.c, ...(c.pts || [])].forEach(id => id && used.add(id)); });
            const P = (sk.points || []).filter(p => used.has(p.id)).map(p => W(p.x, p.y));
            if (!P.length) throw new Error('Die Skizze hat kein Profil');
            const c = mul(P.reduce((s, q) => add(s, q), [0, 0, 0]), 1 / P.length), u0 = norm(sub(sub(c, ao), mul(axis, dot(sub(c, ao), axis))));
            const w = norm(cross(tn, axis));
            const angTo = v => { let a = Math.atan2(dot(cross(u0, v), axis), dot(u0, v)) * 180 / Math.PI; if (a <= 1e-6) a += 360; return a; };
            ang1 = Math.min(angTo(w), angTo(mul(w, -1))) + (Number(f.toOffset) || 0);
            if (!(ang1 > 1e-6 && ang1 <= 360)) throw new Error('Die Zielfläche liegt in der Skizzenebene');
          }
          const ang = ang1 + ang2, back = f.rdir === 'sym' && !rToFace ? ang1 / 2 : ang2;
          if (ang > 360 + 1e-9) throw new Error('Beide Seiten zusammen höchstens 360°');
          let tool;
          try { tool = sketchDrawing(sk, f.profiles).sketchOnPlane(makePlane(sk.plane)).revolve(axis, { origin: ao, angle: ang }); }
          catch (err) {
            // häufigster Grund: das Profil liegt auf beiden Seiten der Achse
            const nrm = norm(cross(axis, sk.plane.n));
            const used = new Set(); (sk.curves || []).forEach(c => { if (!c.cons) [c.p1, c.p2, c.c, ...(c.pts || [])].forEach(id => id && used.add(id)); });
            const sd = (sk.points || []).filter(p => used.has(p.id)).map(p => dot(sub(W(p.x, p.y), ao), nrm));
            if (sd.some(d => d > 1e-6) && sd.some(d => d < -1e-6)) throw new Error('Das Profil liegt auf beiden Seiten der Drehachse. Es muss ganz auf einer Seite liegen (die Achse darf es berühren).');
            throw err;
          }
          if (back > 1e-9 && ang < 360 - 1e-9) tool = tool.rotate(-back, ao, axis);
          applyOp(bodies, tool, f.op, f, f.id);
          tools.set(f.id, [{ tool, op: f.op }]);
          break;
        }
        case 'pipe': {
          const tool = pipeTool(f, solved, byId);
          applyOp(bodies, tool, f.op || 'new', f, f.id);
          tools.set(f.id, [{ tool, op: f.op || 'new' }]);
          break;
        }
        case 'sweep':
        case 'loft': {
          if (f.type === 'sweep' && f.src === 'body') {
            const { tool, kind } = solidSweepTool(f, bodies, solved, byId);
            // der Werkzeugkörper selbst bleibt unberührt
            applyOp(bodies, tool, f.op, f.op === 'new' ? f : { ...f, targets: bodies.filter(b => b.id !== f.toolBody).map(b => b.id) }, f.id);
            tools.set(f.id, [{ tool, op: f.op }]);
            status[f.id] = { ok: true, before, info: `${kind} entlang des Pfads` };
            continue;
          }
          const tool = f.type === 'sweep' ? sweepTool(f, solved, byId) : loftTool(f, solved, byId);
          applyOp(bodies, tool, f.op, f, f.id);
          tools.set(f.id, [{ tool, op: f.op }]);
          break;
        }
        case 'frame': {
          const saved = frameMeta;
          if (depth) frameMeta = [];
          const made = frameTool(f, solved, byId);
          if (depth) frameMeta = saved;
          made.forEach(m => applyOp(bodies, m.tool, 'new', {}, m.id));
          tools.set(f.id, made.map(m => ({ tool: m.tool, op: 'join' })));
          break;
        }
        case 'plane': {
          const bk = f.base ? f.base.kind : '';
          if ((bk === 'points' && f.base.refs) || (bk === 'perp' && f.base.ref)) { if (trackBase(f.base, bodies, wpts)) ptMap[f.id] = JSON.parse(JSON.stringify(f.base)); }
          const p = workPlaneOf(f, planes);
          if (!p) throw new Error('Die Basis der Arbeitsebene fehlt');
          planes.set(f.id, p);
          break;
        }
        case 'point': {
          if (f.base && f.base.ref && trackBase(f.base, bodies, wpts)) ptMap[f.id] = JSON.parse(JSON.stringify(f.base));
          const p = workPointOf(f, planes);
          if (!p) throw new Error(f.base && ['edges', 'planes3', 'edgeplane'].includes(f.base.kind) ? 'Die Bezüge schneiden sich nicht in einem Punkt (parallel?)' : 'Die Lage des Punkts fehlt');
          wpts.set(f.id, p);
          break;
        }
        case 'axis': {
          if (f.base && f.base.kind === 'points' && f.base.refs && trackBase(f.base, bodies, wpts)) ptMap[f.id] = JSON.parse(JSON.stringify(f.base));
          const ax = workAxisOf(f, planes);
          if (!ax) throw new Error(f.base && f.base.kind === 'planes' ? 'Die beiden Ebenen sind parallel oder fehlen' : 'Die Basis der Achse fehlt');
          waxes.set(f.id, ax);
          break;
        }
        case 'bks': {
          /* Benutzerkoordinatensystem: Lage wie eine Arbeitsebene, dazu ihre drei Achsen und ihr Ursprung.
             Alles reine Referenzgeometrie – ein Körper entsteht dadurch nicht. */
          const t = { ref: f.originRef || null, p: Array.isArray(f.originP) ? f.originP.slice() : null };
          if (t.ref && t.p && trackBase(t, bodies, wpts)) ptMap[f.id] = { originP: t.p };
          const b = bksOf(t.p ? { ...f, originP: t.p } : f, planes);
          if (!b) throw new Error('Die Basis des Benutzerkoordinatensystems fehlt');
          planes.set(f.id, b.plane);
          BKS_AXES.forEach(k => {
            waxes.set(bksAxisId(f.id, k), b.axes[k]);
            if (b.sides[k]) planes.set(bksAxisId(f.id, k), b.sides[k]);
          });
          wpts.set(f.id, b.point);
          break;
        }
        case 'hole': {
          if (!bodies.length) throw new Error('Bohren braucht einen vorhandenen Körper');
          const useSk = !f.place || f.place === 'sketch';
          const sk = useSk ? solved.get(f.sketch) || byId[f.sketch] : null;
          /* Bohrtiefe und Richtungsfrage brauchen nur die Reichweite der Baugruppe – die grobe Hülle
             ist nie enger, das Bohrwerkzeug reicht also höchstens weiter und schneidet nicht weniger. */
          const bb = allBoundsGrob(bodies);
          const through = len(sub(bb[1], bb[0])) * 2 + 10;
          const frames = [];
          const tool = holeTool(f, holePlaces(f, sk && migrateSketch(JSON.parse(JSON.stringify(sk))), bb, bodies), through, frames);
          const pre = bodies.map(b => ({ b, s: b.shape }));
          applyOp(bodies, tool, 'cut', f, f.id);
          tools.set(f.id, [{ tool, op: 'cut' }]);
          const tap = String(f.preset || '').startsWith('tap:') ? f.preset.split(':')[1] : null;
          if (tap && f.tapMode === 'modeled' && ISO_COARSE[tap] && !cosmeticThreads) {
            // modelliertes Innengewinde (3D-Druck): Länge = Material entlang der Achse, höchstens Bohrtiefe
            const [D, P] = ISO_COARSE[tap];
            let made = 0;
            frames.forEach(fr => {
              const probe = placeLocal(R.makeCylinder(0.05, fr.depth + 2), { o: sub(fr.P, mul(fr.a, 1)), a: fr.a });
              for (const { b, s: shp } of pre) {
                if (!bodies.includes(b)) continue;
                let hitS;
                try { hitS = shp.intersect(probe); } catch (_) { continue; }
                if (!hitS || hitS.isNull) continue;
                let bbh; try { bbh = bbOf(hitS); } catch (_) { continue; }
                if (!isFinite(bbh[0][0])) continue;
                const cs = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => dot(sub([bbh[i][0], bbh[j][1], bbh[k][2]], fr.P), fr.a))));
                let s0 = Math.max(0, Math.min(...cs)), s1 = Math.min(Math.max(...cs), f.depthMode === 'through' ? Infinity : fr.depth);
                /* Gewindelänge (isFullLength = false, threadLength, threadOffset): ab dem Bohrungsanfang um den
                   Versatz nach innen gerückt, höchstens bis zum Ende des Materials */
                if (f.tFull === false) { s0 += Math.max(0, Number(f.tOff) || 0); if (Number(f.tLen) > 0) s1 = Math.min(s1, s0 + Number(f.tLen)); }
                const L = s1 - s0;
                if (!(L > P)) continue;
                const { ridge, remove } = threadParts.call({ left: false }, D, P, L, true, Number(f.fit) || 0, Number(f.d) / 2);
                const info = { o: add(fr.P, mul(fr.a, s0)), a: fr.a };
                b.shape = bool(b.shape, placeLocal(remove, info), 'cut');
                b.shape = R.makeCompound([b.shape, placeLocal(ridge, info)]);
                made++;
                break;
              }
            });
            status[f.id] = { ok: true, before, info: `${made} × ${tap} modelliert` };
            continue;
          }
          break;
        }
        case 'pattern': {
          const src = collectTools(f, tools);
          const n = f.kind === 'points' ? 2 : Math.round(Number(f.count));
          if (!(n >= 2 && n <= 200)) throw new Error('Anzahl zwischen 2 und 200');
          const dir = AXES[f.axis] || AXES.X;
          const made = [];
          // Lage jeder Kopie als Funktion, die ein Werkzeug umformt
          let places = [];
          if (f.kind === 'points') {
            /* Geometrische Anordnung an Punkten (Kopien an Punkten): die einzelnen Punkte einer Skizze; der Punkt,
               der der Mitte des Originals am nächsten liegt, ist dessen Bezug – an jeden anderen kommt eine Kopie */
            const ps = solved.get(f.ptsSketch) || byId[f.ptsSketch];
            if (!ps || ps.type !== 'sketch') throw new Error('Skizze mit den Punkten wählen');
            const P = ps.plane
              ? holePoints(migrateSketch(JSON.parse(JSON.stringify(ps)))).map(([u, v]) => toWorld(ps.plane, u, v))
              : holePoints3(migrateSketch(JSON.parse(JSON.stringify(ps))));   // 3D-Skizze: Punkte in Weltkoordinaten
            if (P.length < 2) throw new Error('Die Skizze braucht mindestens zwei einzelne Punkte');
            if (P.length > 401) throw new Error('Höchstens 400 Kopien');
            const bs = src.map(x => bbOf(x.tool)), c = mul(add([0, 1, 2].map(i => Math.min(...bs.map(b => b[0][i]))), [0, 1, 2].map(i => Math.max(...bs.map(b => b[1][i])))), 0.5);
            const onPl = ps.plane ? q => sub(q, mul(norm(ps.plane.n), dot(sub(q, ps.plane.o), norm(ps.plane.n)))) : q => q;
            const cp = onPl(c);
            let ri = 0; P.forEach((q, i) => { if (len(sub(q, cp)) < len(sub(P[ri], cp))) ri = i; });
            if (f.orient === 'face') {
              /* an einer Fläche ausgerichtet (Ausrichtung „Flächennormale“): jeder Punkt wird auf die Fläche
                 gelegt, die Kopie dreht die Normale am Bezugspunkt auf die Normale dort und wandert an den Flächenpunkt */
              if (!f.face) throw new Error('Fläche für die Ausrichtung anklicken');
              const hit = findSel(bodies, 'face', f.face, f.faceBody);
              if (!hit) throw new Error('Die gewählte Fläche gibt es nicht mehr');
              const S = P.map(q => surfaceAt(hit.shape, q)), s0 = S[ri];
              S.forEach((sp, i) => {
                if (i === ri) return;
                places.push(t => {
                  let r = t.clone();
                  const ax = cross(s0.n, sp.n), c = Math.max(-1, Math.min(1, dot(s0.n, sp.n)));
                  if (len(ax) > 1e-9) r = r.rotate(Math.acos(c) * 180 / Math.PI, s0.p, norm(ax));
                  else if (c < 0) r = r.rotate(180, s0.p, anyPerp(s0.n));
                  return r.translate(...sub(sp.p, s0.p));
                });
              });
            } else P.forEach((q, i) => { if (i !== ri) { const d = sub(q, P[ri]); places.push(t => t.clone().translate(...d)); } });
          } else if (f.kind === 'path') {
            const ps = solved.get(f.path) || byId[f.path];
            if (!ps || ps.type !== 'sketch') throw new Error('Pfad-Skizze wählen');
            const P = pathSampler(pathWire(JSON.parse(JSON.stringify(ps))));
            const nn = ps.plane ? norm(ps.plane.n) : null;   // räumlicher Pfad: ohne feste Normale, es gilt die Tangente
            /* Startpunkt (startPoint): dort auf dem Pfad liegt das Original, in % der Pfadlänge. Ohne Angabe der
               Pfadanfang (umgekehrt: das Pfadende). „Ganze Länge“ verteilt vom Start bis zum Ende in Laufrichtung;
               symmetrisch liegen die Kopien beidseits des Starts (ganze Länge: bis zum näheren Ende), ungerade Anzahl. */
            const Lp = P.length, sp = f.startPos != null && f.startPos !== '' ? Math.max(0, Math.min(100, Number(f.startPos) || 0)) / 100 * Lp : null;
            const s0 = sp != null ? sp : (f.flip ? Lp : 0), dirS = f.flip ? -1 : 1, sym = !!f.sym && !P.closed;
            if (sym && n % 2 !== 1) throw new Error('Symmetrische Anordnung braucht eine ungerade Anzahl – das Original sitzt in der Mitte');
            const room = sym ? 2 * Math.min(s0, Lp - s0) : (f.flip ? s0 : Lp - s0);
            const step = f.dist === 'spacing' ? Number(f.spacing) : (P.closed ? Lp / n : room / (n - 1));
            if (!(step > 1e-9)) throw new Error(f.dist === 'spacing' ? 'Abstand muss größer als 0 sein' : 'Vom Startpunkt aus ist auf dem Pfad kein Platz – Startpunkt verschieben');
            const offs = Array.from({ length: n }, (_, k) => (sym ? k - (n - 1) / 2 : k) * step * dirS).filter(o => Math.abs(o) > 1e-12);
            if (!P.closed && offs.some(o => s0 + o < -1e-6 || s0 + o > Lp + 1e-6)) throw new Error(`Der Pfad ist nur ${Lp.toFixed(2)} mm lang – ${n} Stück mit ${step.toFixed(2)} mm Abstand passen nicht`);
            const from = P.at(s0);
            for (const o of offs) {
              const q = P.at(P.closed ? ((s0 + o) % Lp + Lp) % Lp : s0 + o);
              places.push(t => {
                let r = t.clone();
                if (f.orient === 'path') {
                  /* Ausrichtung entlang dem Pfad: in einer Pfadebene um die Achse der Ebene, sonst um
                     die Achse, die beide Tangenten aufeinander dreht (räumlicher Pfad) */
                  const ax = nn || cross(from.t, q.t);
                  const a = nn ? Math.atan2(dot(cross(from.t, q.t), nn), dot(from.t, q.t))
                    : Math.acos(Math.max(-1, Math.min(1, dot(from.t, q.t))));
                  if (len(ax) > 1e-9 && Math.abs(a) > 1e-9) r = r.rotate(a * 180 / Math.PI, from.p, norm(ax));
                }
                return r.translate(...sub(q.p, from.p));
              });
            }
          } else if (f.kind === 'circular') {
            const total = Number(f.angle) || 360;
            const full = Math.abs(total - 360) < 1e-9, st = full ? 360 / n : total / (n - 1);
            const ax = f.axisRef && f.axisRef.d ? { o: f.axisRef.o, d: norm(f.axisRef.d) } : { o: [0, 0, 0], d: dir };
            // symmetrisch: der Gesamtwinkel verteilt sich je zur Hälfte auf beide Seiten des Originals –
            // das Original sitzt in der Mitte, also ungerade Anzahl (bei 360° ohne Wirkung)
            if (f.sym && !full) {
              if (n % 2 !== 1) throw new Error('Symmetrische Anordnung braucht eine ungerade Anzahl – das Original sitzt in der Mitte');
              for (let k = 0; k < n; k++) { const a = (k - (n - 1) / 2) * st; if (Math.abs(a) > 1e-12) places.push(t => t.clone().rotate(a, ax.o, ax.d)); }
            } else for (let k = 1; k < n; k++) places.push(t => t.clone().rotate(st * k, ax.o, ax.d));
          } else {
            // rechteckiges Muster: zwei Richtungen, je Anzahl und Abstand oder Ausdehnung
            // (Gesamtmaß von Mitte erster bis Mitte letzter Kopie), wahlweise symmetrisch zum Original
            const d1 = f.axisRef && f.axisRef.d ? norm(f.axisRef.d) : dir;
            const d2 = f.two ? (f.axis2Ref && f.axis2Ref.d ? norm(f.axis2Ref.d) : (AXES[f.axis2] || AXES.Y)) : null;
            const n2 = f.two ? Math.round(Number(f.count2)) : 1;
            if (f.two && !(n2 >= 1 && n2 <= 200)) throw new Error('Anzahl Richtung 2 zwischen 1 und 200');
            // Abstand aus der gewählten Art: Vorgabe ist der Abstand, „Ausdehnung“ das Gesamtmaß
            const step = (cnt, mode, ext, sp, msgNull, msgExt) => {
              if (mode !== 'extent') {
                const s = Number(sp);
                if (!(Math.abs(s) > 1e-9)) throw new Error(msgNull);
                return s;
              }
              // ohne Wert dieselbe Vorgabe wie der Dialog (100 mm) – z. B. Dateien, in denen nur dist: 'extent' steht
              const e = Number(ext ?? 100);
              if (!(Math.abs(e) > 1e-9)) throw new Error(msgExt);
              return e / (cnt - 1);
            };
            const sp = step(n, f.dist, f.extent, f.spacing, 'Abstand darf nicht 0 sein', 'Ausdehnung muss größer als 0 sein');
            const sp2 = n2 > 1 ? step(n2, f.dist2, f.extent2, f.spacing2, 'Abstand Richtung 2 darf nicht 0 sein', 'Ausdehnung Richtung 2 muss größer als 0 sein') : 0;
            if (n2 > 1 && Math.abs(Math.abs(dot(d1, d2)) - 1) < 1e-9) throw new Error('Die beiden Richtungen müssen verschieden sein');
            if (n * n2 > 400) throw new Error('Höchstens 400 Kopien');
            // Lage der Kopien: Abstand vom Original. Symmetrisch verteilt die Anzahl um das Original –
            // das sitzt dann in der Mitte, also nur bei ungerader Anzahl.
            const offs = (cnt, st, sym) => Array.from({ length: cnt }, (_, k) => (sym ? k - (cnt - 1) / 2 : k) * st);
            if (f.sym && n % 2 !== 1) throw new Error('Symmetrische Anordnung braucht eine ungerade Anzahl – das Original sitzt in der Mitte');
            if (f.sym2 && n2 > 1 && n2 % 2 !== 1) throw new Error('Symmetrische Anordnung Richtung 2 braucht eine ungerade Anzahl');
            const o1 = offs(n, sp, f.sym), o2 = n2 > 1 ? offs(n2, sp2, f.sym2) : [0];
            o1.forEach(a => o2.forEach(b => {
              if (!a && !b) return;   // das Original bleibt, wie es ist
              const v = add(mul(d1, a), mul(d2 || [0, 0, 0], b));
              places.push(t => t.clone().translate(...v));
            }));
          }
          places.forEach((place, k) => {
            src.forEach(({ tool, op }) => {
              const t = place(tool);
              applyOp(bodies, t, op, {}, `${f.id}:${k + 1}:${made.length}`);
              made.push({ tool: t, op });
            });
          });
          tools.set(f.id, made);
          break;
        }
        case 'mirror': {
          const mpl = f.plane || { kind: 'origin', key: 'YZ' };
          const pl = mpl.kind === 'face' ? mpl.plane : mpl.kind === 'plane' ? planes.get(mpl.id) : ORIGIN[mpl.key || 'YZ'];
          if (!pl) throw new Error('Spiegelebene fehlt');
          const mp = new R.Plane(pl.o, pl.x, pl.n);
          if (f.mode === 'body') {
            if (!bodies.length) throw new Error('Kein Körper vorhanden');
            const src = Array.isArray(f.targets) && f.targets.length ? bodies.filter(b => f.targets.includes(b.id)) : bodies.slice();
            if (!src.length) throw new Error('Die gewählten Körper gibt es nicht mehr');
            // (isCombine): sonst bleibt jede Spiegelung ein eigener Körper, auch wenn sie das
            // Original berührt (linkes/rechtes Teil getrennt in Stückliste und Abwicklung). Ältere Dateien ohne Angabe verbinden.
            const op = f.result === 'new' ? 'new' : 'join';
            const made = src.map(b => ({ tool: b.shape.clone().mirror(mp), op }));
            // eigene IDs für neue Körper: „…:0“ hat die Vorschau im Modus „Features“ schon vergeben (und benannt)
            made.forEach(({ tool }, i) => {
              const id = op === 'new' ? `${f.id}:b${i}` : `${f.id}:${i}`;
              applyOp(bodies, tool, op, {}, id);
              if (op === 'new') copies[id] = src[i].id;
            });
            tools.set(f.id, made);
          } else {
            const made = collectTools(f, tools).map(({ tool, op }) => ({ tool: tool.clone().mirror(mp), op }));
            made.forEach(({ tool, op }, i) => applyOp(bodies, tool, op, {}, `${f.id}:${i}`));
            tools.set(f.id, made);
          }
          break;
        }
        case 'presspull': {
          // Fläche versetzen: raus = anfügen, rein = wegnehmen (nur am eigenen Körper)
          if (!f.face) throw new Error('Fläche anklicken');
          /* Bis Fläche (wie „Fläche ersetzen“ mit ebener Zielfläche): jede gewählte ebene Fläche wandert bis zur
             parallelen Zielebene – der Abstand ergibt sich je Fläche */
          const toF = f.ppTo === 'face' ? f.toFace : null;
          if (f.ppTo === 'face' && !(toF && toF.n)) throw new Error('Zielfläche wählen');
          const dist = toF ? 1 : Number(f.distance);
          if (!(Math.abs(dist) > 1e-6)) throw new Error('Abstand darf nicht 0 sein');
          /* weitere Flächen mit demselben Abstand (wie „Fläche versetzen“ mit mehreren Flächen): je Fläche ein
             Werkzeug, alle zusammen angefügt bzw. weggenommen – alle Treffer vor dem ersten Ändern gesucht */
          const picks = [{ face: f.face, body: f.faceBody }, ...(Array.isArray(f.more) ? f.more : [])];
          const hits = picks.map(p => findSel(bodies, 'face', p.face, p.body));
          if (hits.some(h => !h)) throw new Error('Eine gewählte Fläche gibt es nicht mehr');
          const list = [];
          hits.forEach(hit => {
            const face = hit.shape;
            let tool, d = dist;
            if (toF) {
              if (face.geomType !== 'PLANE') throw new Error('„Bis Fläche“ geht mit ebenen Flächen');
              const n = norm(face.normalAt().toTuple()), tn = norm(toF.n), c = dot(tn, n);
              if (Math.abs(Math.abs(c) - 1) > 1e-6) throw new Error('Die Zielfläche muss parallel zur gewählten Fläche liegen');
              d = (toF.dist - dot(tn, face.center.toTuple())) / c;
              if (Math.abs(d) < 1e-6) return;   // liegt schon dort
            }
            if (face.geomType === 'CYLINDRE') tool = cylPullTool(face, d);
            else if (face.geomType === 'PLANE') { const n = face.normalAt().toTuple(); tool = R.basicFaceExtrusion(face, new R.Vector(mul(n, d))); }
            else throw new Error('Drücken/Ziehen geht mit ebenen Flächen und Zylinderflächen');
            list.push({ tool, owner: hit.body.id, op: d > 0 ? 'join' : 'cut', d });
          });
          list.forEach(({ tool, owner, op }) => applyOp(bodies, tool, op, { targets: [owner] }, f.id));
          tools.set(f.id, list.map(({ tool, op }) => ({ tool, op })));
          if (toF) { status[f.id] = { ok: true, before, info: list.length ? `${list.length} Fläche${list.length === 1 ? '' : 'n'} bis zur Zielfläche (${list.map(x => +x.d.toFixed(3)).join(' / ')} mm)` : 'liegt schon auf der Zielfläche' }; continue; }
          if (list.length > 1) { status[f.id] = { ok: true, before, info: `${list.length} Flächen um ${+dist.toFixed(3)} mm versetzt` }; continue; }
          break;
        }
        case 'boss':
        case 'snapfit': {
          /* Kunststoff (Reiter KUNSTSTOFF): an den Punkten einer Skizze auf einer Fläche, aus dem Material heraus.
             Zapfen: Rotationskörper Außen-⌀ d, Höhe h, Formschräge außen, Rippen (Dreiecke am Fuß), Loch leer / Kernloch
             (Tiefe) / Durchgang. Schnappverschluss: Biegebalken Dicke t, Länge L, Breite w mit Haken (Hinterschnitt d,
             Einführschräge unter α zur Balkenachse, Rastfläche quer), Richtung des Hakens als Winkel in der Skizzenebene. */
          if (!bodies.length) throw new Error('Braucht einen vorhandenen Körper (Skizze auf dessen Fläche)');
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Skizze mit Punkten wählen');
          const skc = migrateSketch(JSON.parse(JSON.stringify(sk))), pl = needPlane(skc);
          const places = sketchHolePlaces({ flip: !!f.flip }, skc, allBoundsGrob(bodies), bodies);
          let anz = 0;
          places.forEach(({ P, a }) => {
            const up = mul(a, -1), xd = norm(sub(pl.x, mul(up, dot(pl.x, up)))), td = cross(up, xd);
            const W = (r, z, dirX = xd) => add(add(P, mul(dirX, r)), mul(up, z));
            if (f.type === 'boss') {
              const D = Number(f.d), H = Number(f.h), dh = f.hole === 'none' ? 0 : Number(f.dh) || 0;
              if (!(D > 0 && H > 0)) throw new Error('Außendurchmesser und Höhe müssen größer als 0 sein');
              if (dh >= D) throw new Error('Das Loch ist größer als der Zapfen');
              const R0 = D / 2, R1 = R0 - H * Math.tan((Number(f.draft) || 0) * Math.PI / 180);
              if (!(R1 > dh / 2)) throw new Error('Formschräge zu groß für Höhe und Loch');
              let tool = R.revolution(R.makePolygon([W(0, 0), W(R0, 0), W(R1, H), W(0, H)]), P, up, 360);
              const n = Math.max(0, Math.min(12, Math.round(Number(f.ribs) || 0)));
              if (n) {
                const rt = Number(f.rt) || 1, rl = Number(f.rl) || R0, rh = Math.min(H, Number(f.rh) || H * 0.7);
                for (let i = 0; i < n; i++) {
                  const ang = 2 * Math.PI * i / n, dr = add(mul(xd, Math.cos(ang)), mul(td, Math.sin(ang))), tq = cross(up, dr);
                  // Rippe: Dreieck am Fuß, innen 0,2 mm im Zapfen (sauber verbunden), außen bis Länge rl, oben bis Höhe rh
                  const tri = [W(R0 - 0.2, 0, dr), W(R0 + rl, 0, dr), W(R0 - 0.2 - rh * Math.tan((Number(f.draft) || 0) * Math.PI / 180), rh, dr)].map(q => sub(q, mul(tq, rt / 2)));
                  tool = tool.fuse(R.basicFaceExtrusion(R.makePolygon(tri), new R.Vector(mul(tq, rt))));
                }
              }
              applyOp(bodies, tool, 'join', f, f.id);
              if (dh > 0) {
                const tief = f.hole === 'through' ? len(sub(allBoundsGrob(bodies)[1], allBoundsGrob(bodies)[0])) * 2 + 10 : Math.max(0.1, Number(f.hd) || H);
                applyOp(bodies, R.makeCylinder(dh / 2, tief, W(0, H), mul(up, -1)), 'cut', f, f.id);
              }
            } else {
              const t = Number(f.t), L = Number(f.L), w = Number(f.w), d = Number(f.hook), al = (Number(f.alpha) || 30) * Math.PI / 180;
              if (!(t > 0 && L > 0 && w > 0 && d > 0)) throw new Error('Dicke, Länge, Breite und Hinterschnitt müssen größer als 0 sein');
              const Lh = d / Math.tan(al);
              if (!(Lh < L)) throw new Error('Haken länger als der Balken – Einführwinkel größer oder Hinterschnitt kleiner');
              const g = (Number(f.angle) || 0) * Math.PI / 180, ud = add(mul(xd, Math.cos(g)), mul(td, Math.sin(g))), wd = cross(up, ud);
              const prof = [[-t / 2, 0], [t / 2, 0], [t / 2, L - Lh], [t / 2 + d, L - Lh], [t / 2, L], [-t / 2, L]].map(([x, y]) => sub(W(x, y, ud), mul(wd, w / 2)));
              applyOp(bodies, R.basicFaceExtrusion(R.makePolygon(prof), new R.Vector(mul(wd, w))), 'join', f, f.id);
            }
            anz++;
          });
          status[f.id] = { ok: true, before, info: `${anz} ${f.type === 'boss' ? (anz === 1 ? 'Zapfen' : 'Zapfen') : (anz === 1 ? 'Schnappverschluss' : 'Schnappverschlüsse')}` };
          continue;
        }
        case 'moveface': {
          /* Fläche verschieben: ebene Flächen verschieben (es zählt der Anteil entlang der Normalen), um eine
             Achse drehen oder bis zu einer (auch schrägen) Zielfläche führen („Fläche ersetzen“); Zylinderflächen
             (Bohrungen, Zapfen) wandern als Ganzes um den Vektor: alte Stelle füllen bzw. wegnehmen, neue schneiden bzw. anfügen */
          const picks = Array.isArray(f.faces) ? f.faces : [];
          if (!picks.length) throw new Error('Flächen anklicken');
          const hits = picks.map(p => findSel(bodies, 'face', p.face, p.body));
          if (hits.some(h => !h)) throw new Error('Eine gewählte Fläche gibt es nicht mehr');
          const mode = f.mode || 'move', v = [Number(f.dx) || 0, Number(f.dy) || 0, Number(f.dz) || 0];
          if (mode === 'rotate' && !(f.axisRef && f.axisRef.d)) throw new Error('Drehachse wählen (Kante oder Achse)');
          if (mode === 'to' && !(f.target && f.target.n)) throw new Error('Zielfläche wählen');
          const bbA = allBounds(bodies), L = 2 * len(sub(bbA[1], bbA[0])) + 10;
          // erst alle Flächen auswerten (danach ändern sich die Körper), Zylinder derselben Bohrung nur einmal
          const jobs = [], zyl = [];
          hits.forEach(hit => {
            const face = hit.shape;
            if (face.geomType === 'PLANE') {
              const nn = norm(face.normalAt().toTuple()), c = face.center.toTuple();
              let o2, n2;
              if (mode === 'move') { const d = dot(v, nn); if (Math.abs(d) < 1e-9) return; o2 = add(c, mul(nn, d)); n2 = nn; }
              else if (mode === 'rotate') { const M = rgRot(f.axisRef.o, norm(f.axisRef.d), (Number(f.angle) || 0) * Math.PI / 180); o2 = rgApply(M, c); n2 = norm(rgVec(M, nn)); }
              else { n2 = norm(f.target.n); if (dot(n2, nn) < 0) n2 = mul(n2, -1); o2 = f.target.p ? f.target.p.slice() : mul(norm(f.target.n), f.target.dist); }
              if (dot(n2, nn) < 0.05) throw new Error('Die neue Lage steht zu schräg zur Fläche (fast senkrecht)');
              jobs.push({ art: 'ebene', owner: hit.body, face, nn, o2, n2 });
            } else if (face.geomType === 'CYLINDRE') {
              if (mode !== 'move') throw new Error('Zylinderflächen (Bohrungen, Zapfen) lassen sich nur verschieben');
              const ci = cylinderInfo(face);
              const z = zyl.find(q => q.owner === hit.body && Math.abs(q.ci.r - ci.r) < 1e-6 && len(cross(sub(ci.o, q.ci.o), q.ci.a)) < 1e-6 && Math.abs(Math.abs(dot(ci.a, q.ci.a)) - 1) < 1e-9);
              if (z) { // zweite Hälfte derselben Bohrung: Länge zusammenführen
                const h0 = dot(sub(ci.o, z.ci.o), z.ci.a), h1 = h0 + dot(ci.a, z.ci.a) * ci.L, lo = Math.min(0, h0, h1), hi = Math.max(z.ci.L, h0, h1);
                z.ci = { ...z.ci, o: add(z.ci.o, mul(z.ci.a, lo)), L: hi - lo };
                return;
              }
              zyl.push({ art: 'zyl', owner: hit.body, ci });
            } else throw new Error('Fläche verschieben geht mit ebenen Flächen und Zylinderflächen');
          });
          if (len(v) < 1e-9 && mode === 'move' && zyl.length) throw new Error('Verschiebung ist 0');
          jobs.forEach(j => { j.owner.shape = ersetzeEbene(j.owner.shape, j.face, j.nn, j.o2, j.n2, L); });
          zyl.forEach(({ owner, ci }) => {
            const alt = R.makeCylinder(ci.r, ci.L, ci.o, ci.a), neu = R.makeCylinder(ci.r, ci.L, add(ci.o, v), ci.a);
            owner.shape = ci.internal ? tidy(bool(bool(owner.shape, alt, 'fuse'), neu, 'cut')) : tidy(bool(bool(owner.shape, alt, 'cut'), neu, 'fuse'));
          });
          const nE = jobs.length, nZ = zyl.length;
          status[f.id] = { ok: true, before, info: [nE ? `${nE} ebene Fläche${nE === 1 ? '' : 'n'}` : '', nZ ? `${nZ} ${nZ === 1 ? 'Zylinder' : 'Zylinder'} ${zyl.some(z => z.ci.internal) ? '(Bohrung)' : '(Zapfen)'}` : ''].filter(Boolean).join(', ') || 'keine Änderung' };
          continue;
        }
        case 'thread': {
          if (!f.face) throw new Error('Zylinderfläche anklicken');
          if (cosmeticThreads) { status[f.id] = { ok: true, before, info: 'kosmetisch' }; continue; }
          /* mehrere Zylinderflächen in einem Feature (inputFaces): je Fläche eigene Größe (automatisch aus dem
             Durchmesser), sonst dieselben Einstellungen; alle Flächen vor dem ersten Ändern gesucht */
          const tHits = [{ face: f.face, body: f.faceBody }, ...(Array.isArray(f.more) ? f.more : [])].map(p => findSel(bodies, 'face', p.face, p.body));
          if (tHits.some(h => !h)) throw new Error('Eine gewählte Fläche gibt es nicht mehr');
          const infos = tHits.map(hit => {
            const owner = hit.body, face = hit.shape;
            if (face.geomType !== 'CYLINDRE') throw new Error('Gewinde gehen nur auf Zylinderflächen');
            const info = cylinderInfo(face);
            const size = threadSize(tHits.length > 1 ? { ...f, size: 'auto' } : f, info);
            const [D, Pstd] = ISO_COARSE[size];
            const P = Number(f.pitch) > 0 && tHits.length === 1 ? Number(f.pitch) : Pstd;
            /* Teillänge (threadLength, threadOffset, threadLocation): Länge ab dem gewählten Ende, um den Versatz
               nach innen gerückt; was über die Fläche hinausginge, wird gekürzt */
            const off = f.full === false ? Math.max(0, Number(f.offset) || 0) : 0;
            const L = f.full === false && Number(f.length) > 0 ? Math.min(Number(f.length), info.L - off) : info.L;
            if (!(L > 1e-3)) throw new Error('Mit dem Versatz bleibt für das Gewinde keine Länge übrig');
            return { owner, info, size, D, P, L, off };
          });
          const label = x => `${x.size}×${x.P}${f.tclass ? `-${f.tclass}` : ''} ${x.info.internal ? 'innen' : 'außen'} · ${Math.round(x.L * 100) / 100} mm`;
          const all = (infos.length > 1 ? `${infos.length} Gewinde: ` : '') + infos.map(label).join(' · ');
          // kosmetisch (isModeled = false): nur Kennzeichnung, die Fläche bleibt glatt
          if (f.cosmetic) { status[f.id] = { ok: true, before, info: `${all} · kosmetisch` }; continue; }
          infos.forEach(({ owner, info, D, P, L, off }) => {
            const { ridge, remove } = threadParts.call({ left: f.left }, D, P, L, info.internal, Number(f.fit) || 0, info.r);
            const startInfo = f.full === false ? { ...info, o: add(info.o, mul(info.a, f.fromEnd ? info.L - L - off : off)) } : info;
            owner.shape = bool(owner.shape, placeLocal(remove, startInfo), 'cut');
            owner.shape = R.makeCompound([owner.shape, placeLocal(ridge, startInfo)]);
          });
          status[f.id] = { ok: true, before, info: all };
          continue;
        }
        case 'gusset':
        case 'endcap': {
          if (!bodies.length) throw new Error('Kein Körper vorhanden');
          const r = f.type === 'gusset' ? gussetTool(f, bodies) : endcapTool(f, bodies);
          const list = f.type === 'gusset' ? r.plates : r.caps;
          list.forEach((sh, k) => {
            const id = `${f.id}:${k}`;
            bodies.push({ id, shape: sh });
            if (!depth) partMeta.push({ id, base: f.type === 'gusset' ? 'Knotenblech' : 'Endkappe', t: Number(f.thickness) });
          });
          status[f.id] = { ok: true, before, info: `${list.length} ${f.type === 'gusset' ? (list.length === 1 ? 'Knotenblech' : 'Knotenbleche') : (list.length === 1 ? 'Endkappe' : 'Endkappen')}${r.miss ? ` · ${r.miss} Auswahl ohne Ergebnis` : ''}` };
          continue;
        }
        case 'weld': {
          if (!bodies.length) throw new Error('Kein Körper vorhanden');
          const { tool, grooves, info } = weldTool(f, bodies);
          // Nahtvorbereitung (V/HV): Fuge aus den Teilen schneiden, die Naht füllt sie
          if (grooves && grooves.length) {
            const isWeld = id => { const ff = byId[String(id).split(':')[0]]; return !!ff && ff.type === 'weld'; };
            bodies.forEach(b => {
              if (isWeld(b.id)) return;
              grooves.forEach(g => { try { const bb = bbGrob(b.shape), gb = bbGrob(g); if (bb[0].some((v, i) => v > gb[1][i] + 1e-6) || bb[1].some((v, i) => v < gb[0][i] - 1e-6)) return; b.shape = bool(b.shape, g, 'cut'); } catch (_) { /* egal */ } });
            });
          }
          bodies.push({ id: f.id, shape: tool });
          if (!depth) weldMeta.push({ id: f.id, name: f.name, a: Number(f.a), kind: info.kind, count: info.count, length: info.length, all: !!f.allAround, seams: info.seams, loops: info.loops });
          status[f.id] = { ok: true, before, info: `${info.loops ? `${info.loops}× ringsum (${info.count} Kanten)` : `${info.count} ${info.count === 1 ? 'Naht' : 'Nähte'}`} · ${({ fillet: 'Kehlnaht a', i: 'I-Naht s', v: 'V-Naht s', hv: 'HV-Naht s' })[info.kind]}${Number(f.a)} · ${info.length.toFixed(0)} mm${info.miss ? ` · ${info.miss} Kante${info.miss === 1 ? '' : 'n'} ${info.kind === 'fillet' ? 'ohne Innenecke' : 'ohne bündigen Stoß'}` : ''}` };
          continue;
        }
        case 'primitive': {
          const tool = primTool(f, planes);
          applyOp(bodies, tool, f.op || 'new', f, f.id);
          tools.set(f.id, [{ tool, op: f.op || 'new' }]);
          break;
        }
        case 'coil': {
          const { tool, info } = coilTool(f, planes);
          applyOp(bodies, tool, f.op || 'new', f, f.id);
          tools.set(f.id, [{ tool, op: f.op || 'new' }]);
          status[f.id] = { ok: true, before, info };
          continue;
        }
        case 'combine': {
          // „Kombinieren“: Zielkörper mit Werkzeugkörpern verbinden, ausschneiden oder schneiden
          const tid = (f.target || [])[0];
          const tgt = bodies.find(b => b.id === tid);
          if (!tgt) throw new Error('Zielkörper wählen');
          const tl = bodies.filter(b => (f.tools || []).includes(b.id) && b !== tgt);
          if (!tl.length) throw new Error('Werkzeugkörper wählen');
          tl.forEach(b => {
            const t = b.shape.clone();
            tgt.shape = bool(tgt.shape, t, f.op === 'cut' ? 'cut' : f.op === 'intersect' ? 'intersect' : 'join') || tgt.shape;
          });
          if (!f.keep) tl.forEach(b => bodies.splice(bodies.indexOf(b), 1));
          break;
        }
        case 'split': {
          // Werkzeuge für alle Arten des Teilens: Ebene, Skizze (Kontur beidseitig durch alles) und Werkzeugkörper
          const groesse = o => { const bb = allBoundsGrob(bodies); return len(sub(bb[1], bb[0])) + len(sub(o, bb[0])) + 10; };
          const teilEbene = () => {
            const mpl = f.plane || { kind: 'origin', key: 'XY' };
            const pl = mpl.kind === 'face' ? mpl.plane : mpl.kind === 'plane' ? planes.get(mpl.id) : ORIGIN[mpl.key || 'XY'];
            if (!pl) throw new Error('Teilungsebene fehlt');
            return pl;
          };
          const teilSkizze = () => {
            const sk = solved.get(f.sketch) || byId[f.sketch];
            if (!sk || sk.type !== 'sketch') throw new Error('Skizze für die Teilung wählen');
            if (!bodies.length) throw new Error('Kein Körper zum Teilen');
            const L = groesse(needPlane(sk).o);
            try { return sketchDrawing(sk).sketchOnPlane(makePlane(sk.plane, -L)).extrude(2 * L); } catch (_) { throw new Error('Die Skizze braucht eine geschlossene Kontur'); }
          };
          const teilKoerper = () => {
            const tb = bodies.find(b => b.id === f.toolBody);
            if (!tb) throw new Error(f.toolBody ? 'Der Werkzeugkörper fehlt' : 'Werkzeugkörper anklicken');
            return tb;
          };
          /* Nur bestimmte Flächen teilen: das Werkzeug
             zerschneidet ausschließlich die gewählten Flächen, alle anderen bleiben ganz. */
          const sel = f.mode === 'faces' && Array.isArray(f.faces) ? f.faces.filter(Boolean) : [];
          if (sel.length) {
            const pl = f.tool === 'body' || f.tool === 'sketch' ? null : teilEbene();
            const werkz = f.tool === 'body' ? teilKoerper().shape : f.tool === 'sketch' ? teilSkizze() : planeFace(pl.o, pl.n, groesse(pl.o));
            const hits = sel.map(r => findSel(bodies, 'face', r));
            if (hits.some(h => !h)) throw new Error('Eine gewählte Fläche gibt es nicht mehr');
            const gruppen = new Map();
            hits.forEach(h => { const a = gruppen.get(h.body.id) || []; a.push(h.shape); gruppen.set(h.body.id, a); });
            let made = 0;
            gruppen.forEach((gew, id) => {
              const b = bodies.find(x => x.id === id);
              if (!b || (f.bodies && f.bodies.length && !f.bodies.includes(id))) return;
              const neu = teilFlaechen(b.shape, gew, [werkz]);
              if (!neu) return;
              made += Math.max(0, neu.faces.length - b.shape.faces.length);
              b.shape = neu;
            });
            if (!made) throw new Error('Das Teilungswerkzeug trifft keine der gewählten Flächen');
            status[f.id] = { ok: true, before, info: `${made} Flächen dazu` };
            continue;
          }
          if (f.tool === 'body' || f.tool === 'sketch') {
            // Teilen mit einem Körper: außerhalb bleibt der Körper, jedes Stück
            // innerhalb des Werkzeugs wird ein neuer Körper; das Werkzeug bleibt erhalten.
            // Mit Skizze: geschlossene Profile beidseitig durch alles extrudiert als (nicht bleibendes) Werkzeug
            const tb = f.tool === 'sketch' ? { id: null, shape: teilSkizze() } : teilKoerper();
            const src = (f.bodies && f.bodies.length ? bodies.filter(b => f.bodies.includes(b.id)) : bodies.slice()).filter(b => b !== tb);
            let made = 0;
            src.forEach((b, k) => {
              if (!bbOverlap(bbGrob(b.shape), bbGrob(tb.shape), 1e-6)) return;
              const inside = bool(b.shape.clone(), tb.shape.clone(), 'intersect'), outside = bool(b.shape.clone(), tb.shape.clone(), 'cut');
              const sols = s => { if (!s) return []; let a = []; try { a = s.solids || [s]; } catch (_) { a = [s]; } return a.filter(x => (safeVolume(x) || 0) > 1e-6); };
              const ins = sols(inside), outs = sols(outside);
              if (!ins.length || !outs.length) return; // Werkzeug trifft den Körper nicht oder umschließt ihn ganz
              if (f.mode === 'faces') {
                // Flächen teilen: beide Teile ohne Zusammenfassen gleicher Flächen wieder vereinigen → Flächen entlang der Kontur geteilt
                const nf0 = b.shape.faces.length;
                const fused = fuseKeepFaces(outs.length === 1 ? outs[0] : R.makeCompound(outs), ins.length === 1 ? ins[0] : R.makeCompound(ins));
                if (!fused) return;
                b.shape = fused;
                made += Math.max(0, fused.faces.length - nf0);
                return;
              }
              b.shape = outs.length === 1 ? outs[0] : R.makeCompound(outs);
              ins.forEach((s, j) => { const id = `${f.id}:${k}${ins.length > 1 ? '.' + j : ''}`; bodies.push({ id, shape: s }); copies[id] = b.id; });
              made += ins.length;
            });
            if (!made) throw new Error(f.tool === 'sketch' ? 'Die Kontur trennt keinen der Körper' : 'Der Werkzeugkörper schneidet keinen der Körper');
            status[f.id] = { ok: true, before, info: f.mode === 'faces' ? `${made} Flächen dazu` : `${made} Teil${made === 1 ? '' : 'e'} abgetrennt` };
            continue;
          }
          // Körper an einer Ebene teilen (z. B. für Druckteile): Seite gegen die Normale bleibt, die andere wird ein neuer Körper
          const pl = teilEbene();
          const src = (f.bodies && f.bodies.length) ? bodies.filter(b => f.bodies.includes(b.id)) : bodies.slice();
          if (!src.length) throw new Error('Kein Körper zum Teilen');
          const big = groesse(pl.o);
          const half = up => placeLocal(R.makeBox([-big, -big, up ? 0 : -big], [big, big, up ? big : 0]), { o: pl.o, a: pl.n });
          let made = 0;
          src.forEach((b, k) => {
            const lower = bool(b.shape.clone(), half(true), 'cut');
            const upper = bool(b.shape.clone(), half(false), 'cut');
            const vl = lower ? safeVolume(lower) || 0 : 0, vu = upper ? safeVolume(upper) || 0 : 0;
            if (vl < 1e-6 || vu < 1e-6) return; // Ebene trifft den Körper nicht
            if (f.mode === 'faces') {
              // Fläche teilen: beide Hälften wieder vereinigen, ohne gleiche Flächen zusammenzufassen –
              // ein Körper, aber alle von der Ebene getroffenen Flächen sind an der Ebene geteilt
              const fused = fuseKeepFaces(lower, upper);
              if (!fused) return;
              const nf0 = b.shape.faces.length;
              b.shape = fused;
              status[f.id] = { ok: true, before, info: `${fused.faces.length - nf0} Flächen dazu (${fused.faces.length} statt ${nf0})` };
              made++;
              return;
            }
            b.shape = lower;
            bodies.push({ id: `${f.id}:${k}`, shape: upper });
            copies[`${f.id}:${k}`] = b.id;
            made++;
          });
          if (!made) throw new Error('Die Ebene schneidet keinen der Körper');
          if (f.mode === 'faces') continue;
          break;
        }
        case 'silsplit': {
          /* Silhouette geteilt (Art „Flächen teilen“): Umrisslinien (dort steht die Fläche senkrecht zur
             Blickrichtung) aus der versteckten-Kanten-Rechnung (HLR) in 3D, von beiden Seiten (die Enum für verdeckte
             Umrisse fehlt im Build – was von +d verdeckt ist, ist von −d sichtbar), doppelte entfernt; damit alle Flächen
             teilen (Splitter) und wieder zum Körper vernähen. */
          let d = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.richtung] || [0, 0, 1];
          if (f.richtung === 'flaeche') {
            const h = f.richtungFlaeche && findSel(bodies, 'face', f.richtungFlaeche);
            if (!h) throw new Error('Ebene Fläche für die Blickrichtung anklicken');
            if (h.shape.geomType !== 'PLANE') throw new Error('Die Fläche für die Blickrichtung muss eben sein');
            d = norm(h.shape.normalAt(h.shape.pointOnSurface(0.5, 0.5)).toTuple());
          }
          const src = f.bodies && f.bodies.length ? bodies.filter(b => f.bodies.includes(b.id)) : bodies.slice();
          if (!src.length) throw new Error('Kein Körper zum Teilen');
          let made = 0;
          if (f.art === 'koerper') {
            /* Körper teilen: liegt die Silhouette in einer Ebene (Zylinder, Kugel, Drehteile quer zur Achse gesehen), teilt
               diese Ebene den Körper exakt in zwei; sonst eine gekrümmte Trennfläche (teilKoerperGekruemmt) */
            src.forEach((b, k) => {
              const kanten = silhouetteKanten(b.shape, d);
              const pts = kanten.flatMap(e => Array.from({ length: 9 }, (_, i) => e.pointAt(i / 8).toTuple()));
              const bb = bbOf(b.shape), gr = len(sub(bb[1], bb[0])), E = kanten.length ? ebeneDurch(pts) : null;
              if (!E || E.dev > 1e-4 * gr) {
                const teile = teilKoerperGekruemmt(b.shape, d);
                b.shape = teile[0];
                teile.slice(1).forEach((t, j) => { const id = `${f.id}:${k}${j ? `.${j}` : ''}`; bodies.push({ id, shape: t }); copies[id] = b.id; });
                made++;
                return;
              }
              const big = gr + len(sub(E.o, bb[0])) + 10;
              const half = up => placeLocal(R.makeBox([-big, -big, up ? 0 : -big], [big, big, up ? big : 0]), { o: E.o, a: E.n });
              const unten = bool(b.shape.clone(), half(true), 'cut'), oben = bool(b.shape.clone(), half(false), 'cut');
              if ((unten ? safeVolume(unten) || 0 : 0) < 1e-6 || (oben ? safeVolume(oben) || 0 : 0) < 1e-6) return;
              b.shape = unten;
              bodies.push({ id: `${f.id}:${k}`, shape: oben });
              copies[`${f.id}:${k}`] = b.id;
              made++;
            });
            if (!made) throw new Error('Keine Silhouette zum Teilen – nur gekrümmte Flächen haben eine Umrisslinie, ebene enden an ihren Kanten');
            status[f.id] = { ok: true, before, info: `${made} Körper an der Silhouette geteilt` };
            continue;
          }
          for (const b of src) {
            const kanten = silhouetteKanten(b.shape, d);
            if (!kanten.length) continue;
            const neu = teilFlaechen(b.shape, b.shape.faces, kanten);
            if (!neu) continue;
            made += Math.max(0, neu.faces.length - b.shape.faces.length);
            b.shape = neu;
          }
          if (!made) throw new Error('Keine Silhouette zum Teilen – nur gekrümmte Flächen haben eine Umrisslinie, ebene enden an ihren Kanten');
          status[f.id] = { ok: true, before, info: `${made} Flächen dazu` };
          continue;
        }
        case 'sm_base': {
          // Grundlasche: geschlossenes Profil in Blechdicke
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          const t = sheetRule.t;
          if (!(t > 0)) throw new Error('Blechdicke fehlt (Blechregel)');
          const tool = sketchDrawing(sk, f.profiles).sketchOnPlane(makePlane(sk.plane)).extrude(f.flip ? -t : t);
          if (!depth && sheetMeta && !sheetMeta.base) sheetMeta.base = { feature: f.id, plane: sk.plane, t, flip: !!f.flip };
          applyOp(bodies, tool, f.op || 'new', f, f.id);
          tools.set(f.id, [{ tool, op: f.op || 'new' }]);
          break;
        }
        case 'rib': {
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          const tool = ribTool(f, migrateSketch(JSON.parse(JSON.stringify(sk))), bodies);
          applyOp(bodies, tool, 'join', f, f.id);
          tools.set(f.id, [{ tool, op: 'join' }]);
          break;
        }
        case 'emboss': {
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          if (!f.face) throw new Error('Fläche anklicken, auf die geprägt wird');
          const hit = findSel(bodies, 'face', f.face, f.faceBody);
          if (!hit) throw new Error('Die gewählte Fläche gibt es nicht mehr');
          const P = Array.isArray(f.facePt) ? f.facePt : hit.shape.center.toTuple();
          const { tool, count } = embossTool(f, migrateSketch(JSON.parse(JSON.stringify(sk))), hit.body, P, hit.shape);
          hit.body.shape = tidy(bool(hit.body.shape, tool, f.mode === 'emboss' ? 'join' : 'cut'));
          status[f.id] = { ok: true, before, info: `${count} Stück ${f.mode === 'emboss' ? 'erhaben' : 'graviert'}, ${+Number(f.depth).toFixed(3)} mm${f.wrap && hit.shape.geomType === 'CYLINDRE' ? ', abgewickelt' : ''}` };
          continue;
        }
        case 'web': {
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          const { tool, extended, count } = webTool(f, migrateSketch(JSON.parse(JSON.stringify(sk))), bodies);
          applyOp(bodies, tool, bodies.length ? 'join' : 'new', f, f.id);
          tools.set(f.id, [{ tool, op: 'join' }]);
          status[f.id] = { ok: true, before, info: `${count} Steg${count === 1 ? '' : 'e'}${f.extend !== false && bodies.length ? `, ${extended} bis zum Körper verlängert` : ''}` };
          continue;
        }
        case 'derive': {
          // Ableiten: Körper eines anderen Dokuments an ihrer Lage übernehmen, verknüpft über die Datei
          if (!f.part || !Array.isArray(f.part.features)) throw new Error('Das abgeleitete Dokument fehlt');
          if (depth > 3) throw new Error('Zu tief verschachtelt');
          const { bodies: pb, bad, meta } = partBodies({ ...f.part, inserts: f.part.inserts || [] });
          const want = Array.isArray(f.bodies) && f.bodies.length ? new Set(f.bodies) : null;
          const hiddenIn = new Set(Object.entries(f.part.bodies || {}).filter(([, b]) => b && b.hidden).map(([id]) => id));
          let n = 0;
          pb.forEach(b => {
            if (want ? !want.has(b.id) : hiddenIn.has(b.id)) return;
            bodies.push({ id: `${f.id}:${b.id}`, shape: b.shape.clone() });
            const pm = (meta || []).find(m => m.id === b.id);
            if (pm && !depth) partMeta.push({ ...pm, id: `${f.id}:${b.id}` });
            n++;
          });
          const pbn = f.part.bodies || {};
          const avail = pb.map(b => { const pm = (meta || []).find(m => m.id === b.id); return { id: b.id, name: (pbn[b.id] && pbn[b.id].name) || (pm && pm.base) || b.id, hidden: !!(pbn[b.id] && pbn[b.id].hidden) }; });
          if (!n) throw new Error(want ? 'Die gewählten Körper gibt es im Dokument nicht mehr' : 'Das Dokument hat keine sichtbaren Körper');
          status[f.id] = { ok: true, before, avail, info: `${n} Körper übernommen`, ...(bad ? { warn: `${bad} Feature${bad > 1 ? 's' : ''} im Dokument mit Fehler` } : {}) };
          continue;
        }
        case 'import': {
          const hit = importCache.get(importKey(f));
          if (!hit) throw new Error('Importdatei noch nicht geladen');
          if (hit.error) throw new Error(hit.error);
          let stage = 'kopieren';
          try {
            let shp;
            try { shp = hit.shape.clone(); } catch (_) { shp = hit.shape; }
            stage = 'verschieben';
            const dx = Number(f.dx) || 0, dy = Number(f.dy) || 0, dz = Number(f.dz) || 0;
            if (dx || dy || dz) shp = shp.translate(dx, dy, dz);
            stage = 'aufteilen';
            // ein Verbund mehrerer Festkörper (Baugruppe im STEP) wird zu einzelnen Körpern
            let sols = [];
            try { sols = shp.solids || []; } catch (_) { sols = []; }
            // Dateiinhalt und Lage bestimmen ein wiederverwendbares Anzeige-Netz.
            const meshKey = `${importKey(f)}:${dx},${dy},${dz}`;
            // `ohne`: Festkörper, die als Instanz (Kopie des Original-Einbaus) entstehen, nicht noch einmal einlesen
            const ohne = new Set(Array.isArray(f.ohne) ? f.ohne : []);
            if (sols.length > 1 && f.split !== false) sols.forEach((so, k) => { if (!ohne.has(k)) bodies.push({ id: `${f.id}:${k}`, shape: so, meshCacheKey: `${meshKey}:${k}` }); });
            else if (!ohne.has(0)) bodies.push({ id: f.id, shape: shp, meshCacheKey: `${meshKey}:0` }); // einzelner Festkörper, als Features nachgebaut
            // Teilenamen aus der STEP-Datei (die Seite vergibt sie beim ersten Auftauchen eines Körpers)
            if (!depth && Array.isArray(hit.namen)) {
              const meta = (n, id) => { const z = typeof n === 'string' ? { name: n } : n; if (z && z.name) partMeta.push({ id, base: z.name, importName: true, teil: z.teil || z.name, k: z.k || 0, nb: z.nb || 1, ...(z.color ? { color: z.color } : {}), ...(Number.isInteger(z.occ) ? { occ: z.occ, pfad: z.pfad || [] } : {}), ...(z.inst ? { inst: z.inst } : {}) }); };
              if (sols.length > 1 && f.split !== false) hit.namen.forEach((n, k) => meta(n, `${f.id}:${k}`));
              else meta(hit.namen[0], f.id);
            }
          } catch (err) { throw new Error(`Import fehlgeschlagen (${stage})`); }
          break;
        }
        case 'sm_bend': {
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          const { metas, reliefs, body: bb, fixedAt, n0 } = bendSheet(f, migrateSketch(JSON.parse(JSON.stringify(sk))), bodies);
          if (!depth && sheetMeta) metas.forEach(m => sheetMeta.bendLines.push(m));
          if (reliefs) {
            /* mit Eckfreischnitten stimmt die Abwicklung aus Grundlasche + Linien nicht mehr (Kerben): aus dem Körper
               abwickeln, feste Fläche = ebene Fläche am festen Bezugspunkt */
            let note = '';
            if (!depth && sheetMeta) {
              const fixedFace = bb.shape.faces.find(fc => { try { return fc.geomType === 'PLANE' && Math.abs(Math.abs(dot(norm(fc.normalAt().toTuple()), norm(n0))) - 1) < 1e-6 && R.measureDistanceBetween(fc, R.makeVertex(fixedAt)) < sheetRule.t + 1e-3; } catch (_) { return false; } });
              if (fixedFace) {
                try { const { zones: _z, frame: _f, ...uf } = unfoldSheet(bb.shape, fixedFace, sheetRule); sheetMeta.unfold = { ...uf, feature: f.id, body: bb.id, fromBend: true }; note = ` · Abwicklung aus dem Körper (${uf.faces} Flächen)`; } catch (_) { note = ' · Abwicklung nicht möglich'; }
              }
            }
            status[f.id] = { ok: true, before, info: `${metas.length} Biegungen · ${reliefs} Eckfreischnitt${reliefs === 1 ? '' : 'e'}${note}` };
            continue;
          }
          break;
        }
        case 'sm_contour': {
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze fehlt');
          const { tool, meta } = contourTool(f, migrateSketch(JSON.parse(JSON.stringify(sk))), sheetRule);
          if (!depth && sheetMeta && !sheetMeta.base && !sheetMeta.contour) sheetMeta.contour = meta;
          applyOp(bodies, tool, f.op || 'new', f, f.id);
          tools.set(f.id, [{ tool, op: f.op || 'new' }]);
          break;
        }
        case 'sm_flange': {
          const edges = Array.isArray(f.edges) ? f.edges : [];
          if (!edges.length) throw new Error('Blechkanten anklicken');
          let done = 0;
          // Ecken: zwei gewählte Kanten mit gemeinsamem Endpunkt → beide Laschen dort um r + t zurücknehmen (offene Ecke mit Freischnitt)
          const ends = edges.map(es => {
            const b = bodies.find(x => x.id === es.body) || bodies.find(x => findSel([x], 'edge', es.ref, x.id));
            const h = b && findSel([b], 'edge', es.ref, b.id);
            return h && h.shape.geomType === 'LINE' ? { b, p0: h.shape.startPoint.toTuple(), p1: h.shape.endPoint.toTuple() } : null;
          });
          const cornerGap = sheetRule.r + sheetRule.t;
          const partner = (i, p) => ends.findIndex((e, j) => j !== i && e && ends[i] && e.b === ends[i].b && (len(sub(e.p0, p)) < 1e-6 || len(sub(e.p1, p)) < 1e-6));
          // Reißecke: wie beim Blechbiegen ohne Freischnitt. Die Schenkel reichen
          // bis in die Ecke; die gemeinsame Kante bleibt in der Abwicklung erhalten.
          const shared = (i, p) => f.corners !== 'overlap' && f.corners !== 'tear' && partner(i, p) >= 0;
          // geschlossene Ecke: die erste Lasche deckt die Ecke ganz (r + t), die zweite stößt mit Spalt dagegen
          const gap = Math.max(0, Number(f.gap) || 0.2);
          const extAt = (i, p) => { if (f.corners !== 'closed') return 0; const j = partner(i, p); if (j < 0) return 0; return j > i ? 2 * cornerGap : cornerGap + Math.max(0, sheetRule.r - gap); };
          edges.forEach((es, i) => {
            const b = bodies.find(x => x.id === es.body) || bodies.find(x => findSel([x], 'edge', es.ref, x.id));
            if (!b) return;
            const auto = ends[i] ? { o1: shared(i, ends[i].p0) ? cornerGap : 0, o2: shared(i, ends[i].p1) ? cornerGap : 0, p0: ends[i].p0, p1: ends[i].p1, extS: extAt(i, ends[i].p0), extE: extAt(i, ends[i].p1) } : { o1: 0, o2: 0 };
            const { tool, meta, reliefCut } = flangeTool(b, es, f, auto);
            if (!depth && sheetMeta) sheetMeta.flanges.push(meta);
            if (reliefCut) b.shape = bool(b.shape, reliefCut, 'cut');
            b.shape = tidy(bool(b.shape, tool, 'join'));
            done++;
          });
          if (!done) throw new Error('Die gewählten Kanten gibt es nicht mehr');
          // runder Eckfreischnitt (Blechregel): Zylinder durch den Boden um den inneren Eckpunkt des Freischnitts
          if (sheetRule.cornerRelief === 'round' && (f.corners || 'relief') === 'relief' && f.relief !== 'none') {
            const rho = Math.min((Number(sheetRule.cornerReliefD) || 2 * sheetRule.t) / 2, 0.95 * cornerGap), seen = new Set();
            ends.forEach((e, i) => {
              if (!e) return;
              [e.p0, e.p1].forEach(p => {
                const j = partner(i, p), key = p.map(v => v.toFixed(4)).join();
                if (j < 0 || seen.has(key)) return;
                seen.add(key);
                const e2 = ends[j], o1 = len(sub(e.p0, p)) < 1e-6 ? e.p1 : e.p0, o2 = len(sub(e2.p0, p)) < 1e-6 ? e2.p1 : e2.p0;
                const d1 = norm(sub(o1, p)), d2 = norm(sub(o2, p)), ax = norm(cross(d1, d2));
                const Kc = add(add(p, mul(d1, cornerGap)), mul(d2, cornerGap)), h = sheetRule.t + 1;
                const cut = bool(e.b.shape, R.makeCylinder(rho, 2 * h, add(Kc, mul(ax, -h)), ax), 'cut');
                if (cut) e.b.shape = tidy(cut);
              });
            });
          }
          break;
        }
        case 'defeature': {
          const refs = Array.isArray(f.faces) ? f.faces : [];
          const auto = { holes: Number(f.autoHoles) || 0, fillets: Number(f.autoFillets) || 0 };
          if (!refs.length && !(auto.holes > 0) && !(auto.fillets > 0)) throw new Error('Flächen anklicken oder eine Automatik einstellen');
          const total = { holes: 0, fillets: 0, chamfers: 0 }, skipped = [];
          bodies.forEach(b => {
            const picked = refs.map(r => findSel([b], 'face', r, b.id)).filter(h => h && h.body === b).map(h => h.shape);
            if (!picked.length && !(auto.holes > 0) && !(auto.fillets > 0)) return;
            const res = defeatureTools(b, picked.length ? picked : null, auto);
            skipped.push(...res.skipped);
            Object.keys(total).forEach(k => { total[k] += res.count[k]; });
            // importierte Körper sind oft Verbund-Formen: Boolesche Schritte auf dem einzelnen Volumenkörper
            let shape = b.shape, done = 0;
            try { const sols = b.shape.solids; if (sols && sols.length === 1) shape = sols[0]; } catch (_) { /* wie gehabt */ }
            // einzeln anwenden; misslingt ein Schritt, bleibt die bisherige Form (Fehler wird gemeldet)
            [...res.tools.filter(t => t.op === 'fuse'), ...res.tools.filter(t => t.op === 'cut')].forEach(t => {
              try { const r = bool(shape.clone(), t.tool, t.op === 'fuse' ? 'join' : 'cut'); if (r && (safeVolume(r) || 0) > 0) { shape = r; done++; } else skipped.push('Boolesche Operation ohne Ergebnis'); }
              catch (err) { skipped.push('Boolesche Operation: ' + err.message); }
            });
            if (done) b.shape = tidy(shape);
          });
          const n = total.holes + total.fillets + total.chamfers;
          if (!n) throw new Error(skipped[0] || 'Nichts gefunden, das entfernt werden kann');
          const part = [total.holes && `${total.holes} Bohrung${total.holes === 1 ? '' : 'en'}`, total.fillets && `${total.fillets} Rundung${total.fillets === 1 ? '' : 'en'}`, total.chamfers && `${total.chamfers} Fase${total.chamfers === 1 ? '' : 'n'}`].filter(Boolean).join(', ');
          status[f.id] = { ok: true, before, info: `${part} entfernt`, ...(skipped.length ? { warn: `${skipped.length} übergangen: ${skipped[0]}` } : {}) };
          continue;
        }
        case 'sm_join': {
          const j = joinByBend(f, bodies, sheetRule);
          j.keep.shape = j.shape;
          bodies.splice(bodies.indexOf(j.drop), 1);
          if (!depth && sheetMeta) {
            const fixed = j.shape.faces.filter(fc => fc.geomType === 'PLANE').map(fc => ({ fc, a: R.measureArea(fc) })).sort((x, y) => y.a - x.a).map(x => x.fc)[0];
            try { const { zones: _z, frame: _f, ...uf } = unfoldSheet(j.shape, fixed, sheetRule); sheetMeta.unfold = { ...uf, feature: f.id, body: j.keep.id }; } catch (_) { /* ohne Abwicklung */ }
          }
          status[f.id] = { ok: true, before, info: j.info };
          continue;
        }
        case 'sm_corner': {
          // Blechabrundung/-fase: nur Kanten in Dickenrichtung (Ecken des Zuschnitts)
          const r = Number(f.size), t = sheetRule.t;
          if (!(r > 1e-6)) throw new Error('Maß muss größer als 0 sein');
          // Dickenkante: gerade, Länge = Blechdicke, zwischen zwei ebenen Flächen
          const isThick = (b, e) => {
            try {
              if (e.geomType !== 'LINE' || Math.abs(R.measureLength(e) - t) > Math.max(1e-3, t * 1e-3)) return false;
              const fs = b.shape.faces.filter(fc => fc.edges.some(x => x.isSame(e)));
              if (fs.length !== 2 || fs.some(fc => fc.geomType !== 'PLANE')) return false;
              const c = dot(norm(fs[0].normalAt().toTuple()), norm(fs[1].normalAt().toTuple()));
              return Math.abs(c) < 0.9999;
            } catch (_) { return false; }
          };
          /* weitere Eckgruppen mit eigenem Maß (wie bei Abrunden/Fase, `sets: [{ edges, value }]`): alle Gruppen in einem
             Aufruf, die Funktion gibt je Ecke das Maß ihrer Gruppe */
          const sets = !f.all && Array.isArray(f.sets) ? f.sets.filter(x => x && Array.isArray(x.edges) && x.edges.length && Number(x.value) > 1e-6) : [];
          const picked = f.all ? null : (Array.isArray(f.edges) ? f.edges : []);
          if (picked && !picked.length && !sets.length) throw new Error('Ecken (Kanten in Dickenrichtung) anklicken');
          let done = 0, wrong = 0;
          const touched = [];
          bodies.forEach(b => {
            const pick = list => {
              const hits = list.filter(es => !es.body || es.body === b.id).map(es => findSel([b], 'edge', es.ref, b.id)).filter(Boolean).map(h => h.shape);
              const ok = hits.filter(e => isThick(b, e));
              wrong += hits.length - ok.length;
              return ok;
            };
            const groups = [{ sel: picked ? pick(picked) : b.shape.edges.filter(e => isThick(b, e)), v: r }, ...sets.map(x => ({ sel: pick(x.edges), v: Number(x.value) }))];
            const has = (g, el) => g.sel.some(x => { try { return x.isSame(el); } catch (_) { return false; } });
            const sel = groups.flatMap(g => g.sel);
            if (!sel.length) return;
            const m = el => sel.some(x => { try { return x.isSame(el); } catch (_) { return false; } });
            const val = (el, q) => { const g = groups.find(x => has(x, el)); return g ? g.v * q / r : null; };
            const run = q => (sets.length
              ? (f.kind === 'chamfer' ? b.shape.chamfer(e => (m(e) ? val(e, q) : null)) : b.shape.fillet(e => (m(e) ? val(e, q) : null)))
              : f.kind === 'chamfer' ? b.shape.chamfer(q, e => e.when(({ element }) => m(element))) : b.shape.fillet(q, e => e.when(({ element }) => m(element))));
            try { b.shape = run(r); } catch (err) { try { b.shape = run(r * (1 - 5e-4)); } catch (_) { throw new Error(`${f.kind === 'chamfer' ? 'Fase' : 'Rundung'} ${r} mm passt nicht an die Ecke`); } }
            done += sel.length;
            touched.push(b);
          });
          if (!done) throw new Error(wrong ? 'Nur Kanten in Dickenrichtung (Länge = Blechdicke) sind möglich' : 'Keine passenden Ecken gefunden');
          // Abwicklung aus der neuen Form (feste Fläche: die der Umwandlung, sonst die größte ebene Fläche)
          if (!depth && sheetMeta && touched.length) {
            const b = touched[0];
            let fixed = null;
            if (sheetMeta.unfold && sheetMeta.unfold.body === b.id && byId[sheetMeta.unfold.feature] && byId[sheetMeta.unfold.feature].face) { const h = findSel([b], 'face', byId[sheetMeta.unfold.feature].face, b.id); fixed = h && h.shape; }
            if (!fixed || fixed.geomType !== 'PLANE') fixed = b.shape.faces.filter(fc => fc.geomType === 'PLANE').map(fc => ({ fc, a: R.measureArea(fc) })).sort((x, y) => y.a - x.a).map(x => x.fc)[0];
            try { const { zones: _z, frame: _f, ...uf } = unfoldSheet(b.shape, fixed, sheetRule); sheetMeta.unfold = { ...uf, feature: f.id, body: b.id }; } catch (_) { /* Abwicklung bleibt */ }
          }
          status[f.id] = { ok: true, before, info: `${done} Ecke${done === 1 ? '' : 'n'} ${f.kind === 'chamfer' ? 'gefast' : 'gerundet'}`, ...(wrong ? { warn: `${wrong} Kante${wrong === 1 ? '' : 'n'} übergangen (nicht in Dickenrichtung)` } : {}) };
          continue;
        }
        case 'fastener': {
          // Normteil einfügen: eigener Körper aus Stahl, Name nach Norm und Größe
          const { shape, label } = fastenerTool(f, bodies);
          bodies.push({ id: f.id, shape });
          if (!depth) partMeta.push({ id: f.id, base: label, fastener: true }); else if (partSink) partSink.push({ id: f.id, base: label, fastener: true });
          status[f.id] = { ok: true, before, info: label };
          continue;
        }
        case 'sm_loft': {
          const { shape, flat, info } = loftedFlange(f, solved, byId, sheetRule);
          applyOp(bodies, shape, f.op || 'new', f, f.id);
          if (!depth && sheetMeta) sheetMeta.unfold = { ...flat, feature: f.id, body: f.id };
          status[f.id] = { ok: true, before, info };
          continue;
        }
        case 'sm_unfold': {
          // Abwickeln: Blech im Modell flachlegen, damit über Biegungen hinweg skizziert und geschnitten werden kann
          if (!f.face) throw new Error('Feste ebene Fläche anklicken');
          const hit = findSel(bodies, 'face', f.face, f.faceBody);
          if (!hit) throw new Error('Die gewählte Fläche gibt es nicht mehr');
          if (hit.shape.geomType !== 'PLANE') throw new Error('Die feste Fläche muss eben sein');
          const b = hit.body;
          if (unfolds.has(b.id)) throw new Error('Dieses Blech ist schon abgewickelt');
          // nur ausgewählte Biegungen: gewählte zylindrische Biegeflächen (ohne Angabe alle)
          let bendSel = null;
          if (Array.isArray(f.bends)) {
            bendSel = [];
            f.bends.forEach(rf => {
              const hb = findSel([b], 'face', rf, b.id);
              if (!hb) throw new Error('Eine gewählte Biegung gibt es nicht mehr');
              if (hb.shape.geomType !== 'CYLINDRE') throw new Error('Als Biegung nur eine runde Biegefläche anklicken');
              bendSel.push(hb.shape);
            });
          }
          /* Bei voller Abwicklung wie beim Umwandeln mit Eckfreischnitten: das flache Blech im Modell und
             die Zonen fürs Zurückfalten kommen dann aus der geschnittenen Form, gefaltet wird aber der
             ungeschnittene Körper zurück (U.folded) – der Freischnitt gehört nur zum Zuschnitt.
             Teilweise Abwicklung ohne Freischnitte: die gewählten Biegeflächen gehören zum ungeschnittenen Körper. */
          const kf = bendSel ? { shape: b.shape, fixed: hit.shape, kerfs: 0 } : kerfedForUnfold(b.shape, hit.shape, sheetRule);
          const uf = unfoldBody(kf.shape, kf.fixed, sheetRule, bendSel), fr = uf.frame;
          let dr = loopDrawing(uf.contour[0]);
          uf.holes.forEach(h => { try { dr = dr.cut(loopDrawing(h)); } catch (_) { /* Loch übergehen */ } });
          const flat = dr.sketchOnPlane(new R.Plane(fr.O, fr.xd, fr.n)).extrude(-uf.t);
          // Abwicklung bleibt vollständig; im Modell bleiben die nicht gewählten Biegungen stehen
          const part = uf.kept ? partialUnfold(b.shape, uf, flat) : null;
          unfolds.set(b.id, { folded: b.shape, flat0: (part || flat).clone(), zones: uf.zones, frame: fr, t: uf.t, sharp: uf.sharp, kept: uf.kept, face: f.face, feature: f.id });
          b.shape = part || flat;
          status[f.id] = { ok: true, before, ...(uf.crossings ? { warn: crossWarn(uf.crossings) } : {}), info: `${uf.kept ? `${uf.nb - uf.kept} von ${uf.nb} Biegungen abgewickelt, ${uf.kept} stehen gelassen` : `${uf.nb} Biegung${uf.nb === 1 ? '' : 'en'} abgewickelt`} · ${+(uf.bb[1][0] - uf.bb[0][0]).toFixed(2)} × ${+(uf.bb[1][1] - uf.bb[0][1]).toFixed(2)} mm${kf.kerfs ? ` · ${kf.kerfs} Eckfreischnitt${kf.kerfs === 1 ? '' : 'e'}` : ''}` };
          continue;
        }
        case 'sm_refold': {
          // Zurückfalten: Schnitte aus dem flachen Zustand auf das gebogene Teil übertragen
          if (!unfolds.size) throw new Error('Kein abgewickeltes Blech – erst „Abwickeln“');
          let pieces = 0, warn = '';
          unfolds.forEach((U, id) => {
            const b = bodies.find(x => x.id === id);
            if (!b) return;
            const r = refoldCuts(U, b.shape);
            b.shape = tidy(r.shape);
            pieces += r.pieces;
            if (r.added) warn = 'Im flachen Zustand hinzugefügtes Material wird beim Zurückfalten nicht übernommen';
            else if (r.approx) warn = 'Schnitt über eine scharfe Kante (Radius 0) – nur angenähert übertragen. Für genaue Schnitte über Biegungen einen Biegeradius verwenden.';
            // Abwicklung des zurückgefalteten Teils (mit den neuen Ausschnitten)
            if (!depth && sheetMeta) {
              const hit = findSel([b], 'face', U.face, b.id);
              if (hit && hit.shape.geomType === 'PLANE') { try { const { zones: _z, frame: _f, ...pub } = unfoldSheet(b.shape, hit.shape, sheetRule); sheetMeta.unfold = { ...pub, feature: f.id, body: b.id }; } catch (_) { /* Abwicklung bleibt */ } }
            }
          });
          unfolds.clear();
          status[f.id] = { ok: true, before, info: pieces ? `zurückgefaltet, ${pieces} Schnittstück${pieces === 1 ? '' : 'e'} übertragen` : 'zurückgefaltet (keine Schnitte im flachen Zustand)', ...(warn ? { warn } : {}) };
          continue;
        }
        case 'sm_rip': {
          // Auftrennung: Ecke zwischen zwei ebenen Blechwänden mit Spalt aufschneiden,
          // oder ein gerader Schnitt zwischen zwei Punkten auf einer Blechwand.
          // Stumpf (Vorgabe, laserrecht): Wand 1 läuft durch, Wand 2 endet mit Spalt davor.
          // Gehrung: dünne Scheibe in der Winkelhalbierenden der Ecke.
          const g = Math.max(0.01, Number(f.gap) || 0.5), t = sheetRule.t;
          let done = 0;
          const touched = new Set(), problems = [];
          // steht die Umwandlung in Blech schon davor: Abwicklung mit der aufgetrennten Form neu rechnen
          const finish = info => {
            let note = '';
            if (!depth && sheetMeta && sheetMeta.unfold && touched.has(sheetMeta.unfold.body)) {
              const cf = byId[sheetMeta.unfold.feature], b = bodies.find(x => x.id === sheetMeta.unfold.body);
              const hit = cf && b && findSel([b], 'face', cf.face, b.id);
              if (hit && hit.shape.geomType === 'PLANE') {
                const { zones: _z, frame: _f, ...uf } = unfoldSheet(b.shape, hit.shape, sheetRule);
                sheetMeta.unfold = { ...uf, feature: cf.id, body: b.id };
                note = ` · Abwicklung neu (${uf.faces} Flächen)`;
              }
            }
            status[f.id] = { ok: true, before, info: `${info}${note}`, ...(problems.length ? { warn: `${problems.length} Kante${problems.length === 1 ? '' : 'n'} übergangen: ${problems[0]}` } : {}) };
          };
          if (f.mode === 'face') {
            /* an einer Fläche: die Blechwand hinter der gewählten ebenen Fläche wird
               entfernt – die Fläche um die Wanddicke (Abstand zur Gegenfläche) ins Material gezogen und abgezogen. Die
               Nachbarwände enden stumpf an der Stelle, das Teil ist an allen Kanten der Fläche aufgetrennt. */
            if (!f.face) throw new Error('Ebene Blechfläche anklicken');
            const hf = findSel(bodies, 'face', f.face, f.faceBody);
            if (!hf) throw new Error('Die gewählte Fläche gibt es nicht mehr');
            if (hf.shape.geomType !== 'PLANE') throw new Error('Die Fläche muss eben sein');
            const n = norm(hf.shape.normalAt().toTuple()), c0 = hf.shape.center.toTuple();
            let tw = Infinity;
            hf.body.shape.faces.forEach(fc => {
              try {
                if (fc.geomType !== 'PLANE' || dot(norm(fc.normalAt().toTuple()), n) > -0.99999) return;
                const d = -dot(sub(fc.center.toTuple(), c0), n);
                if (d > 1e-6 && d < tw) tw = d;
              } catch (_) { /* egal */ }
            });
            if (!isFinite(tw)) tw = t;
            const eps = 1e-3, fl = hf.shape.clone().translate(n.map(v => v * eps));
            const slab = R.basicFaceExtrusion(fl, new R.Vector(mul(n, -(tw + eps)))); // innen genau bis zur Gegenfläche
            const vor = safeVolume(hf.body.shape) || 0;
            const cut = bool(hf.body.shape, slab, 'cut');
            if (!cut) throw new Error('Auftrennung fehlgeschlagen');
            hf.body.shape = tidy(cut);
            touched.add(hf.body.id);
            finish(`Wand an der Fläche entfernt (${+R.measureArea(hf.shape).toFixed(1)} mm², Dicke ${+tw.toFixed(3)} mm, −${+(vor - (safeVolume(hf.body.shape) || 0)).toFixed(1)} mm³)`);
            continue;
          }
          if (f.mode === 'points') {
            // zwischen zwei Punkten: schlitzförmiger Schnitt durch eine Blechwand. Beide Punkte müssen
            // auf derselben ebenen Wand liegen – sonst ist nicht bestimmbar, durch was geschnitten wird.
            const pa = f.a, pb = f.b;
            if (!pa || !pb || !pa.face || !pb.face) throw new Error('Zwei Punkte auf einer Blechfläche anklicken');
            const ha = findSel(bodies, 'face', pa.face, pa.body), hb = findSel(bodies, 'face', pb.face, pb.body);
            if (!ha || !hb) throw new Error('Die gewählte Fläche gibt es nicht mehr');
            if (ha.shape.geomType !== 'PLANE' || hb.shape.geomType !== 'PLANE') throw new Error('Beide Punkte müssen auf einer ebenen Fläche liegen');
            const n = norm(ha.shape.normalAt().toTuple()), ca = ha.shape.center.toTuple();
            if (Math.abs(Math.abs(dot(n, norm(hb.shape.normalAt().toTuple()))) - 1) > 1e-6
              || Math.abs(dot(sub(hb.shape.center.toTuple(), ca), n)) > 1e-6) throw new Error('Beide Punkte müssen auf derselben Blechwand liegen');
            const pr = p => sub(p, mul(n, dot(sub(p, ca), n)));   // auf die Ebene gezogen: die Wand kann sich bewegt haben
            const A = pr(pa.p), B = pr(pb.p), L = len(sub(B, A));
            if (!(L > 0.01)) throw new Error('Die beiden Punkte liegen aufeinander');
            // Wanddicke wie beim Abwickeln: nächste Gegenfläche hinter der gewählten, sonst die Blechregel
            let tw = Infinity;
            ha.body.shape.faces.forEach(fc => {
              try {
                if (fc.geomType !== 'PLANE') return;
                if (dot(norm(fc.normalAt().toTuple()), n) > -0.99999) return;
                const d = -dot(sub(fc.center.toTuple(), ca), n);
                if (d > 1e-6 && d < tw) tw = d;
              } catch (_) { /* egal */ }
            });
            if (!isFinite(tw)) tw = t;
            const u = norm(sub(B, A)), w = norm(cross(n, u));
            const O = add(A, mul(w, -g / 2));   // der Schlitz liegt mittig auf der Linie zwischen den Punkten
            const P = (s, h) => add(add(O, mul(u, s)), mul(n, h));
            /* Versatz (pointOneOffset/pointTwoOffset): positiv rückt das Ende des Schnitts vom Punkt nach
               innen, negativ verlängert ihn. Ohne Versatz läuft der Schnitt 1 mm über die Punkte hinaus, damit er an
               einer Kante sauber durchgeht; mit Versatz endet er genau dort. */
            const o1 = Number(f.off1) || 0, o2 = Number(f.off2) || 0;
            const s0 = o1 ? o1 : -1, s1 = o2 ? L - o2 : L + 1;
            if (!(s1 - s0 > 0.01)) throw new Error('Mit dem Versatz bleibt vom Schnitt nichts übrig');
            const slab = R.basicFaceExtrusion(R.makePolygon([P(s0, 0.02), P(s1, 0.02), P(s1, -(tw + 0.5)), P(s0, -(tw + 0.5))]), new R.Vector(mul(w, g)));
            const cut = bool(ha.body.shape, slab, 'cut');
            if (!cut) throw new Error('Auftrennung fehlgeschlagen');
            ha.body.shape = tidy(cut);
            touched.add(ha.body.id);
            finish(`Auftrennung zwischen zwei Punkten über ${+L.toFixed(1)} mm${o1 || o2 ? ` (Schnitt ${+(s1 - s0).toFixed(1)} mm)` : ''}, Spalt ${+g.toFixed(3)} mm`);
            continue;
          }
          const edges = Array.isArray(f.edges) ? f.edges : [];
          if (!edges.length) throw new Error('Eckkanten anklicken');
          edges.forEach(es => {
            const b = bodies.find(x => x.id === es.body) || bodies.find(x => findSel([x], 'edge', es.ref, x.id));
            const h = b && findSel([b], 'edge', es.ref, b.id);
            if (!h) { problems.push('Kante nicht mehr gefunden'); return; }
            const e = h.shape;
            if (e.geomType !== 'LINE') { problems.push('nur gerade Kanten'); return; }
            const p0 = e.startPoint.toTuple(), p1 = e.endPoint.toTuple(), L = len(sub(p1, p0)), u = norm(sub(p1, p0)), mid = mul(add(p0, p1), 0.5);
            const fs = b.shape.faces.filter(fc => { try { return fc.edges.some(x => x.isSame(e)); } catch (_) { return false; } });
            if (fs.length !== 2 || fs.some(fc => fc.geomType !== 'PLANE')) { problems.push('Kante liegt nicht zwischen zwei ebenen Wänden'); return; }
            // Wand 1 (läuft durch) = größere Fläche, „Andere Wand“ tauscht
            const area = fc => { try { return R.measureArea(fc); } catch (_) { return 0; } };
            if ((area(fs[1]) > area(fs[0]) + 1e-6) !== !!f.flip) fs.reverse();
            const [n1, n2] = fs.map(fc => norm(fc.normalAt().toTuple()));
            const c = Math.max(-1, Math.min(1, dot(n1, n2)));
            if (c > 0.985 || c < -0.985) { problems.push('Kante ist keine Ecke'); return; }
            const a0 = -L / 2 - 1, a1 = L / 2 + 1;
            let slab;
            if (f.kind === 'miter') {
              // d zeigt aus dem Material heraus (bei Außen- wie Innenkante), pn = Normale der Schnittebene
              const d = norm(add(n1, n2)), pn = norm(sub(n1, n2)), D = t / Math.cos(Math.acos(c) / 2) + 0.2;
              const P = (a, s) => add(add(add(mid, mul(u, a)), mul(d, s)), mul(pn, -g / 2));
              slab = R.basicFaceExtrusion(R.makePolygon([P(a0, 1), P(a1, 1), P(a1, -D), P(a0, -D)]), new R.Vector(mul(pn, g)));
            } else {
              // gerechnet an der Außenkante; bei gewählter Innenkante die Außenkante derselben Ecke suchen
              let m0 = mid, q0 = p0, q1 = p1;
              if (dot(sub(fs[1].center.toTuple(), mid), n1) > 0) {
                const o = add(mid, mul(add(n1, n2), -t));
                // Außenflächen haben die Normalen −n1, −n2: Ecke liegt um t hinter beiden Innenflächen
                const outer = b.shape.edges.find(x => { try { if (x.geomType !== 'LINE') return false; const a = x.startPoint.toTuple(), z = x.endPoint.toTuple(), v = norm(sub(z, a)); if (Math.abs(Math.abs(dot(v, u)) - 1) > 1e-6) return false; const w = sub(o, a); return len(sub(w, mul(v, dot(w, v)))) < 1e-4; } catch (_) { return false; } });
                if (!outer) { problems.push('Außenkante der Ecke nicht gefunden'); return; }
                q0 = outer.startPoint.toTuple(); q1 = outer.endPoint.toTuple();
                if (dot(sub(q1, q0), u) < 0) [q0, q1] = [q1, q0];
                m0 = mul(add(q0, q1), 0.5);
                n1.forEach((v, i) => { n1[i] = -v; }); n2.forEach((v, i) => { n2[i] = -v; });
              }
              const Lo = len(sub(q1, q0));
              // Punkt im Körper? (kleiner Würfel ∩ Körper hat Volumen)
              const solidAt = q => { try { const c2 = bool(b.shape.clone(), R.makeBox(q.map(v => v - 0.05), q.map(v => v + 0.05)), 'intersect'); return !!c2 && (safeVolume(c2) || 0) > 1e-7; } catch (_) { return false; } };
              // An einem Ende sitzt eine dritte Wand (Boden), wenn neben Wand 2 im Spalt dort Material ist → Eckfreischnitt statt Schlitz
              const floorAt = (v, w) => solidAt(add(add(add(v, mul(w, t / 2)), mul(n2, -(t + 1))), mul(n1, -(t + g / 2))));
              const f0 = floorAt(q0, u), f1 = floorAt(q1, mul(u, -1));
              const A = (a, s, dd) => add(add(add(m0, mul(u, a)), mul(n2, -s)), mul(n1, -dd));
              const box = (a, b2, s0, s1, d0, d1) => R.basicFaceExtrusion(R.makePolygon([A(a, s0, d0), A(b2, s0, d0), A(b2, s1, d0), A(a, s1, d0)]), new R.Vector(mul(n1, -(d1 - d0))));
              const sa = f0 ? -Lo / 2 + t : -Lo / 2 - 1, sb = f1 ? Lo / 2 - t : Lo / 2 + 1;
              const parts = [box(sa, sb, -0.5, t + 0.01, t, t + g)];
              if (f0) parts.push(box(-Lo / 2 - 1, -Lo / 2 + t, -0.5, t, -0.5, t + g));
              if (f1) parts.push(box(Lo / 2 - t, Lo / 2 + 1, -0.5, t, -0.5, t + g));
              slab = parts.reduce((acc, p) => (acc ? bool(acc, p, 'join') : p), null);
            }
            const cut = bool(b.shape, slab, 'cut');
            if (!cut) { problems.push('Schnitt fehlgeschlagen'); return; }
            b.shape = tidy(cut);
            touched.add(b.id);
            done++;
          });
          if (!done) throw new Error(problems[0] || 'Keine Kante aufgetrennt');
          finish(`${done} Kante${done === 1 ? '' : 'n'} aufgetrennt, Spalt ${+g.toFixed(3)} mm`);
          continue;
        }
        case 'sm_convert': {
          // In Blech umwandeln: Körper bleibt, die Abwicklung entsteht aus seiner Form
          if (!f.face) throw new Error('Feste ebene Fläche anklicken');
          const hit = findSel(bodies, 'face', f.face, f.faceBody);
          if (!hit) throw new Error('Die gewählte Fläche gibt es nicht mehr');
          if (hit.shape.geomType !== 'PLANE') throw new Error('Die feste Fläche muss eben sein');
          /* Gebogene Ecken: vor dem Abwickeln einen Freischnitt durch die Biegezone legen.
             Geschnitten wird nur die Form für die Abwicklung, der Körper bleibt unverändert. */
          const { kerfs: nKerf, ...uf } = unfoldSheet(hit.body.shape, hit.shape, sheetRule);
          /* Gegenprobe: Fläche der Abwicklung × Dicke ≈ Volumen des Körpers. Weicht es stark ab, ist der Körper kein gleich
             dickes Blech (z. B. ein verschweißtes Teil aus zwei Blechdicken aus einem STEP) – dann keine falsche Abwicklung */
          const vK = safeVolume(hit.body.shape) || 0, vA = flaecheAbwicklung(uf) * uf.t;
          if (vK > 0 && Math.abs(vA - vK) > 0.15 * vK) throw new Error(`Der Körper ist kein Blech gleicher Dicke: die Abwicklung erfasst ${Math.round(100 * vA / vK)} % seines Volumens. Nur Körper aus einem Blech lassen sich abwickeln (Schweißteile vorher mit „Körper teilen“ trennen).`);
          if (!depth && sheetMeta) { const { zones: _z, frame: _f, ...pub } = uf; sheetMeta.unfold = { ...pub, feature: f.id, body: hit.body.id }; }
          // die Abwicklung rechnet mit der Dicke des Körpers (z. B. STEP-Import) – eine andere Regeldicke ist keine Warnung wert
          status[f.id] = { ok: true, before, info: `Dicke ${+uf.t.toFixed(3)} mm · ${uf.nb} Biegung${uf.nb === 1 ? '' : 'en'} · ${uf.faces} Flächen abgewickelt${nKerf ? ` · ${nKerf} Eckfreischnitt${nKerf === 1 ? '' : 'e'}` : ''}` };
          continue;
        }
        case 'move': {
          const ids = [...new Set([...(Array.isArray(f.bodies) ? f.bodies : []), ...(Array.isArray(f.comps) ? withGroup(f.comps).flatMap(compBodies) : [])])];
          if (!ids.length) throw new Error('Keine Körper gewählt');
          const src = bodies.filter(b => ids.includes(b.id));
          if (!src.length) throw new Error('Die gewählten Körper gibt es nicht mehr');
          // Instanz als Kopie verschieben ergäbe einen Körper, der beim nächsten Abgleich wieder verschwindet
          if (f.copy && src.some(b => String(b.id).includes('~'))) throw new Error('Instanzen lassen sich nicht als Kopie verschieben – erst das Original bearbeiten');
          let ang = Number(f.angle) || 0, d = [Number(f.dx) || 0, Number(f.dy) || 0, Number(f.dz) || 0];
          let pivot = [Number(f.px) || 0, Number(f.py) || 0, Number(f.pz) || 0], axis = AXES[f.axis] || AXES.Z;
          if (f.mode === 'pointpos') {
            // Punkt auf Position: der gewählte Punkt wandert auf die eingegebenen Koordinaten
            const a = f.from && trackPt(f.from, f.from.p, bodies, wpts);
            if (!a) throw new Error('Punkt auf Position: erst einen Punkt im Modell wählen');
            d = sub([Number(f.tx) || 0, Number(f.ty) || 0, Number(f.tz) || 0], a); ang = 0;
          }
          if (f.mode === 'points') {
            /* Punkt zu Punkt: der erste Punkt wandert auf den zweiten. Beide Punkte führt der
               Kern über ihre Herkunft nach (Kantenende, Kantenmitte, Kreismitte oder Arbeitspunkt). */
            const a = f.from && trackPt(f.from, f.from.p, bodies, wpts), b = f.to && trackPt(f.to, f.to.p, bodies, wpts);
            if (!a || !b) throw new Error('Punkt zu Punkt: erst zwei Punkte im Modell wählen');
            d = sub(b, a); ang = 0;
            /* Lage der beiden Punkte ins Dokument zurückschreiben: beim nächsten Aufbau ist wieder
               derselbe Eckpunkt gemeint, auch wenn der Referenzkörper vorher gewandert ist */
            if ((f.from.p && len(sub(f.from.p, a)) > 1e-9) || (f.to.p && len(sub(f.to.p, b)) > 1e-9))
              ptMap[f.id] = { from: { ...f.from, p: a.map(r9) }, to: { ...f.to, p: b.map(r9) } };
          } else if (f.mode === 'axis') {
            /* Drehen um eine beliebige Achse: gerade Kante, Kreiskante, Zylinderachse oder Arbeitsachse */
            const ax = f.axisRef && f.axisRef.d ? { o: f.axisRef.o || [0, 0, 0], d: norm(f.axisRef.d) } : null;
            if (!ax) throw new Error('Drehen um Kante: erst eine Kante oder Achse wählen');
            axis = ax.d; pivot = ax.o; d = [0, 0, 0];
          } else if (f.mode === 'edge') {
            /* entlang einer Kante verschieben: gerade Kante → schieben, Kreis- oder Bogenkante → um ihre
               eigene Achse drehen (Abstand = Bogenlänge, wie beim Abrollen auf der Kante) */
            const h = f.edge && findSel(bodies, 'edge', f.edge.ref, f.edge.body);
            if (!h) throw new Error('Entlang Kante: erst eine Kante wählen');
            const L = Number(f.distance) * (f.flip ? -1 : 1);
            if (!(Math.abs(L) > 1e-9)) throw new Error('Abstand entlang der Kante muss größer als 0 sein');
            const e = h.shape;
            /* Richtung aus dem gespeicherten Bezug: Anfang und Ende einer Kante legt OpenCASCADE fest, und das kann
               sich nach einem Umbau umdrehen – „Richtung“ würde dann ohne Zutun kippen */
            if (e.geomType === 'LINE') {
              let u = norm(sub(e.endPoint.toTuple(), e.startPoint.toTuple()));
              const rd = f.edge.ref && f.edge.ref.d;
              if (Array.isArray(rd) && dot(u, rd) < 0) u = mul(u, -1);
              d = mul(u, L); ang = 0;
            } else {
              const a = e.pointAt(0).toTuple(), b = e.pointAt(0.3).toTuple(), c = e.pointAt(0.6).toTuple();
              const o = circleCenter(a, b, c);
              if (!o) throw new Error('Diese Kante hat keine Mittelachse');
              const r = len(sub(a, o));
              if (!(r > 1e-9)) throw new Error('Der Radius dieser Kante ist zu klein');
              axis = norm(cross(sub(b, a), sub(c, a))); pivot = o;
              if (Array.isArray(f.edge.axis) && dot(axis, f.edge.axis) < 0) axis = mul(axis, -1);
              ang = L * 180 / (Math.PI * r); d = [0, 0, 0];
            }
          }
          src.forEach((b, k) => {
            let t = b.shape.clone();
            if (Math.abs(ang) > 1e-9) t = t.rotate(ang, pivot, axis);
            if (len(d) > 1e-9) t = t.translate(...d);
            if (f.copy) { bodies.push({ id: `${f.id}:${k}`, shape: t }); copies[`${f.id}:${k}`] = b.id; }
            else b.shape = t;
          });
          if (src.length < ids.length) { status[f.id] = { ok: true, warn: `${ids.length - src.length} gewählte Körper nicht mehr gefunden`, before }; continue; }
          break;
        }
        case 'scale': {
          // Skalieren (gleichmäßig): Körper um einen Bezugspunkt vergrößern/verkleinern
          const ids = [...(Array.isArray(f.bodies) ? f.bodies : []), ...(Array.isArray(f.comps) ? f.comps.flatMap(compBodies) : [])];
          if (!ids.length) throw new Error('Keine Körper gewählt');
          const src = bodies.filter(b => ids.includes(b.id));
          if (!src.length) throw new Error('Die gewählten Körper gibt es nicht mehr');
          let c = [0, 0, 0];
          if (f.point === 'center') { const bb = allBounds(src); c = mul(add(bb[0], bb[1]), 0.5); }
          else if (f.point === 'custom') c = [Number(f.px) || 0, Number(f.py) || 0, Number(f.pz) || 0];
          if (f.mode === 'xyz') {
            /* ungleichmäßig (Maßstabstyp „ungleichmäßig“): je Achse ein Faktor. Dieses OpenCASCADE kennt keine
               Verzerrung exakter Flächen (kein BRepBuilderAPI_GTransform) – der Körper wird fein vernetzt, die Punkte
               skaliert und als Netzkörper wieder aufgebaut (wie ein STL-Import, Rundungen werden Facetten) */
            const k = ['sx', 'sy', 'sz'].map(a => Number(f[a]));
            if (!k.every(v => v > 1e-6)) throw new Error('Die Faktoren müssen größer als 0 sein');
            if (k.some(v => Math.abs(v - 1) > 1e-12)) src.forEach(b => {
              const bb = bbOf(b.shape), size = Math.max(...[0, 1, 2].map(i => bb[1][i] - bb[0][i]));
              const m = b.shape.mesh({ tolerance: Math.max(0.005, size * 2e-4), angularTolerance: 0.1 });
              const V = m.vertices, Tr = m.triangles, tris = [];
              const pt = i => [0, 1, 2].map(a => c[a] + (V[3 * i + a] - c[a]) * k[a]);
              for (let t = 0; t < Tr.length; t += 3) tris.push([pt(Tr[t]), pt(Tr[t + 1]), pt(Tr[t + 2])]);
              if (tris.length > 150000) throw new Error(`Zu viele Dreiecke (${tris.length}) für ungleichmäßiges Skalieren`);
              const sh = stlSolidFast(tris);
              if (!sh) throw new Error('Ungleichmäßiges Skalieren: das Netz des Körpers ist nicht geschlossen');
              b.shape = sh;
            });
            status[f.id] = { ok: true, before, info: `ungleichmäßig ${k.map(v => +v.toFixed(4)).join(' × ')} · facettierter Körper` };
            continue;
          }
          const s = Number(f.factor);
          if (!(s > 1e-6)) throw new Error('Der Faktor muss größer als 0 sein');
          if (Math.abs(s - 1) > 1e-12) src.forEach(b => { b.shape = b.shape.scale(s, c); });
          if (src.length < ids.length) { status[f.id] = { ok: true, warn: `${ids.length - src.length} gewählte Körper nicht mehr gefunden`, before }; continue; }
          break;
        }
        case 'rigid': {
          const cs = (Array.isArray(f.comps) ? f.comps : []).filter(c => compMap.has(c));
          if (cs.length < 2) throw new Error('Mindestens zwei Komponenten wählen');
          rigid.push(new Set(cs));
          status[f.id] = { ok: true, before, info: `${cs.length} Komponenten starr verbunden` };
          continue;
        }
        case 'motionlink': {
          // wirkt schon vor dem Bau (applyMotionLinks); hier nur prüfen und melden
          const A = byId[f.a], B = byId[f.b];
          if (!A || !B || A.type !== 'joint' || B.type !== 'joint') throw new Error('Zwei Gelenke wählen');
          if (f.a === f.b) throw new Error('Zwei verschiedene Gelenke wählen');
          if (!(Math.abs(Number(f.va)) > 1e-12)) throw new Error('Wert 1 darf nicht 0 sein');
          const k = Number(f.vb) / Number(f.va) * (f.reverse ? -1 : 1);
          status[f.id] = { ok: true, before, info: `${B.name} = ${+k.toFixed(6)} × ${A.name}` };
          continue;
        }
        case 'jorigin': {
          if (!f.sel) throw new Error('Fläche oder Kante für den Ursprung anklicken');
          const fr = joriginFrame(f, bodies);
          if (!fr) throw new Error('Die Basis des Gelenkursprungs gibt es nicht mehr');
          joriginDefs.set(f.id, f);
          status[f.id] = { ok: true, before, frame: { o: fr.o, d: fr.z }, body: fr.body };
          continue;
        }
        case 'constraint': {
          /* Baugruppen-Abhängigkeiten: Paare aus Flächen/Kanten der bewegten Komponente (a) und eines anderen
             Teils (b). Geometrie: ebene Fläche = Ebene (Punkt, Normale), Zylinderfläche/Kreiskante = Achse, gerade Kante =
             Linie. Gesucht ist eine Lage (Drehvektor ω um die Mitte der Komponente, Verschiebung t), die alle Abhängigkeiten
             zugleich erfüllt – Levenberg-Marquardt mit kleiner Dämpfung, also möglichst kleine Bewegung. Freiheitsgrade =
             6 − Rang der Jacobimatrix in der Lösung. */
          const items = (Array.isArray(f.items) ? f.items : []).filter(it => it && it.a && it.b);
          if (!items.length) throw new Error('Mindestens eine Abhängigkeit mit beiden Seiten wählen');
          if (!f.comp) throw new Error('Die bewegte Komponente fehlt');
          const moveIds = withGroup([f.comp]).flatMap(compBodies);
          const geomOf = sel => {
            const hit = findSel(bodies, sel.kind, sel.ref, sel.body);
            if (!hit) return null;
            const s = hit.shape;
            if (sel.kind === 'face') {
              if (s.geomType === 'PLANE') return { k: 'plane', p: s.center.toTuple(), d: norm(s.normalAt().toTuple()), body: hit.body.id };
              if (s.geomType === 'CYLINDRE') { const ci = cylinderInfo(s); return { k: 'axis', p: ci.o, d: ci.a, body: hit.body.id }; }
              return null;
            }
            if (s.geomType === 'CIRCLE') { const a = s.pointAt(0).toTuple(), q = s.pointAt(0.3).toTuple(), c = s.pointAt(0.6).toTuple(); return { k: 'axis', p: circleCenter(a, q, c), d: norm(cross(sub(q, a), sub(c, a))), body: hit.body.id }; }
            if (s.geomType === 'LINE') { const p0 = s.startPoint.toTuple(), p1 = s.endPoint.toTuple(); return { k: 'axis', p: p0, d: norm(sub(p1, p0)), body: hit.body.id }; }
            return null;
          };
          const G = items.map(it => ({ it, A: geomOf(it.a), B: geomOf(it.b) }));
          G.forEach(({ A, B }, i) => {
            if (!A || !B) throw new Error(`Abhängigkeit ${i + 1}: eine Auswahl gibt es nicht mehr`);
            if (!moveIds.includes(A.body)) throw new Error(`Abhängigkeit ${i + 1}: die erste Auswahl muss auf der bewegten Komponente liegen`);
            if (moveIds.includes(B.body)) throw new Error(`Abhängigkeit ${i + 1}: beide Auswahlen liegen auf der bewegten Komponente`);
          });
          const mb = bodies.filter(b => moveIds.includes(b.id)).map(b => bbOf(b.shape));
          const C0 = mul(add([0, 1, 2].map(k => Math.min(...mb.map(b => b[0][k]))), [0, 1, 2].map(k => Math.max(...mb.map(b => b[1][k])))), 0.5);
          const rotV = (v, w) => { const th = len(w); if (th < 1e-15) return v; const k = mul(w, 1 / th), c = Math.cos(th), s = Math.sin(th); return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); };
          const xf = (x, g) => ({ ...g, p: add(add(rotV(sub(g.p, C0), x.slice(0, 3)), C0), x.slice(3)), d: rotV(g.d, x.slice(0, 3)) });
          const res = x => {
            const r = [];
            G.forEach(({ it, A: A0, B }) => {
              const A = xf(x, A0), v = Number(it.value) || 0;
              if (it.type === 'mate') {
                // Flächen gegeneinander (Normalen entgegengesetzt) bzw. bündig (gleich), Abstand entlang der Normale von b
                if (A.k !== 'plane' || B.k !== 'plane') throw new Error('Deckungsgleich braucht zwei ebene Flächen');
                const tgt = it.flip ? B.d : mul(B.d, -1), cr = cross(A.d, tgt);
                r.push(cr[0], cr[1], cr[2], dot(sub(A.p, B.p), B.d) - v);
              } else if (it.type === 'concentric') {
                if (A.k !== 'axis' || B.k !== 'axis') throw new Error('Konzentrisch braucht zwei Achsen (Zylinderflächen oder Kreiskanten)');
                const cr = cross(A.d, B.d), w = sub(A.p, B.p), perp = sub(w, mul(B.d, dot(w, B.d)));
                r.push(cr[0], cr[1], cr[2], perp[0], perp[1], perp[2]);
              } else if (it.type === 'parallel') {
                const cr = cross(A.d, B.d); r.push(cr[0], cr[1], cr[2]);
              } else if (it.type === 'perpendicular') {
                r.push(dot(A.d, B.d));
              } else if (it.type === 'angle') {
                r.push(Math.acos(Math.max(-1, Math.min(1, dot(A.d, B.d)))) - v * Math.PI / 180);
              } else throw new Error('Unbekannte Abhängigkeit');
            });
            return r;
          };
          const nrm2 = r => r.reduce((s, q) => s + q * q, 0);
          const jac = x => { const r0 = res(x), h = 1e-7; return { r0, J: [0, 1, 2, 3, 4, 5].map(j => { const y = x.slice(); y[j] += h; return res(y).map((q, i) => (q - r0[i]) / h); }) }; };
          const solve6 = (M, b) => {
            const A = M.map((row, i) => [...row, b[i]]);
            for (let c = 0; c < 6; c++) {
              let p = c; for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
              [A[c], A[p]] = [A[p], A[c]];
              if (Math.abs(A[c][c]) < 1e-30) return null;
              for (let r = 0; r < 6; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let q = c; q < 7; q++) A[r][q] -= k * A[c][q]; }
            }
            return A.map((row, i) => row[6] / row[i]);
          };
          let x = [0, 0, 0, 0, 0, 0], mu = 1e-6, err = nrm2(res(x));
          for (let itn = 0; itn < 200 && err > 1e-22; itn++) {
            const { r0, J } = jac(x), JTJ = [0, 1, 2, 3, 4, 5].map(a => [0, 1, 2, 3, 4, 5].map(b => J[a].reduce((s, q, i) => s + q * J[b][i], 0) + (a === b ? mu : 0)));
            const g = [0, 1, 2, 3, 4, 5].map(a => -J[a].reduce((s, q, i) => s + q * r0[i], 0));
            const dx = solve6(JTJ, g);
            if (!dx) break;
            const xn = x.map((q, i) => q + dx[i]), en = nrm2(res(xn));
            if (en < err) { x = xn; err = en; mu = Math.max(1e-12, mu / 3); } else mu *= 10;
          }
          if (Math.sqrt(err) > 1e-6) throw new Error('Die Abhängigkeiten widersprechen sich – so lässt sich die Komponente nicht legen');
          // Freiheitsgrade: Rang von JᵀJ in der Lösung (Eigenwerte über Jacobi-Drehungen grob genug: Pivot-Elimination)
          const { J } = jac(x), M = [0, 1, 2, 3, 4, 5].map(a => [0, 1, 2, 3, 4, 5].map(b => J[a].reduce((s, q, i) => s + q * J[b][i], 0)));
          let rank = 0;
          { const A = M.map(r => r.slice()), used = new Array(6).fill(false), scale = Math.max(1e-12, ...A.map((r, i) => Math.abs(r[i])));
            for (let c = 0; c < 6; c++) {
              let p = -1, best = 1e-8 * scale;
              for (let r = 0; r < 6; r++) if (!used[r] && Math.abs(A[r][c]) > best) { best = Math.abs(A[r][c]); p = r; }
              if (p < 0) continue;
              used[p] = true; rank++;
              for (let r = 0; r < 6; r++) if (r !== p) { const k = A[r][c] / A[p][c]; for (let q = c; q < 6; q++) A[r][q] -= k * A[p][q]; }
            } }
          const w = x.slice(0, 3), th = len(w), t = x.slice(3);
          bodies.forEach(b => {
            if (!moveIds.includes(b.id)) return;
            let s = b.shape;
            if (th > 1e-12) s = s.rotate(th * 180 / Math.PI, C0, mul(w, 1 / th));
            if (len(t) > 1e-12) s = s.translate(...t);
            b.shape = s;
          });
          const free = 6 - rank;
          status[f.id] = { ok: true, before, info: `${items.length} Abhängigkeit${items.length === 1 ? '' : 'en'} · ${free ? `noch ${free} Freiheitsgrad${free === 1 ? '' : 'e'}` : 'vollständig bestimmt'}`, free };
          continue;
        }
        case 'align':
        case 'joint': {
          // Gelenk (Ausrichten = starres Gelenk ohne Bewegung): Ursprung 1 (bewegte Komponente) auf Ursprung 2 setzen, dann Winkel/Versatz um die Achse
          if (!f.o1 || !f.o2) throw new Error('Beide Gelenk-Ursprünge wählen');
          const F1 = jointFrame(f.o1, bodies), F2 = jointFrame(f.o2, bodies);
          if (!F1 || !F2) throw new Error('Gelenk-Ursprung nicht mehr gefunden');
          const moveIds = f.comp ? withGroup([f.comp]).flatMap(compBodies) : [F1.body];
          if (moveIds.includes(F2.body)) throw new Error(f.comp && withGroup([f.comp]).length > 1 && !compBodies(f.comp).includes(F2.body) ? 'Beide Ursprünge liegen in derselben starren Gruppe' : 'Beide Ursprünge liegen auf derselben Komponente');
          const target = f.flip ? F2.z : mul(F2.z, -1);
          const c = Math.max(-1, Math.min(1, dot(F1.z, target)));
          let ax = cross(F1.z, target), ang = Math.acos(c) * 180 / Math.PI;
          if (len(ax) < 1e-9) ax = c > 0 ? [0, 0, 1] : anyPerp(F1.z); else ax = norm(ax);
          let turn = Number(f.angle) || 0, off = Number(f.offset) || 0;
          // Bewegungsgrenzen: Winkel (Drehgelenk) bzw. Versatz (Schieber, Zylindrisch) bleibt im Bereich
          if (f.type === 'joint' && f.limits && Number.isFinite(Number(f.lmin)) && Number.isFinite(Number(f.lmax))) {
            const lo = Math.min(Number(f.lmin), Number(f.lmax)), hi = Math.max(Number(f.lmin), Number(f.lmax));
            if (f.kind === 'revolute') turn = Math.max(lo, Math.min(hi, turn));
            else if (f.kind === 'slider' || f.kind === 'cylindrical') off = Math.max(lo, Math.min(hi, off));
          }
          const shift = sub(F2.o, F1.o);
          // Ebenenrichtungen am Ursprung 2 für Planar, Stift-Nut und Kugel (x quer zur Achse, y = z × x)
          const X2 = anyPerp(F2.z), Y2 = cross(F2.z, X2), jk = f.type === 'joint' ? f.kind : 'rigid';
          const u = (jk === 'planar' || jk === 'pinslot') ? Number(f.u) || 0 : 0, v = jk === 'planar' ? Number(f.v) || 0 : 0;
          const tilt = jk === 'ball' ? Number(f.tilt) || 0 : 0, tilt2 = jk === 'ball' ? Number(f.tilt2) || 0 : 0;
          let n = 0;
          bodies.forEach(b => {
            if (!moveIds.includes(b.id)) return;
            let t = b.shape;
            if (ang > 1e-9) t = t.rotate(ang, F1.o, ax);
            if (len(shift) > 1e-12) t = t.translate(...shift);
            if (Math.abs(turn) > 1e-9) t = t.rotate(turn, F2.o, F2.z);
            if (Math.abs(tilt) > 1e-9) t = t.rotate(tilt, F2.o, X2);
            if (Math.abs(tilt2) > 1e-9) t = t.rotate(tilt2, F2.o, Y2);
            if (Math.abs(off) > 1e-12) t = t.translate(...mul(F2.z, off));
            if (Math.abs(u) > 1e-12 || Math.abs(v) > 1e-12) t = t.translate(...add(mul(X2, u), mul(Y2, v)));
            b.shape = t; n++;
          });
          if (!n) throw new Error('Die bewegte Komponente hat keine Körper');
          break;
        }
        case 'remove': {
          const ids = Array.isArray(f.bodies) ? f.bodies : [];
          if (!ids.length) throw new Error('Keine Körper gewählt');
          let gone = 0;
          for (let k = bodies.length - 1; k >= 0; k--) if (ids.includes(bodies[k].id)) { bodies.splice(k, 1); gone++; }
          if (!gone) throw new Error('Die gewählten Körper gibt es nicht mehr');
          break;
        }
        case 'fillet':
        case 'chamfer': {
          if (!bodies.length) throw new Error('Kein Körper vorhanden');
          const r = Number(f.type === 'fillet' ? f.radius : f.distance);
          if (!(r > 1e-6)) throw new Error('Maß muss größer als 0 sein');
          /* Regel-Abrundung („Rundungen“ = konvexe Kanten, „Kehlen“ = konkave Kanten) bei „Alle Kanten“:
             je Kante in der Mitte die Außennormale n1 der einer Fläche und die Richtung t2, die von der Kante in die andere
             Fläche hineinführt. t2 · n1 < 0 → konvex (die zweite Fläche fällt hinter die erste ab), sonst konkav.
             Kanten, die nicht an genau zwei Flächen stoßen (Nahtkante) oder tangential weiterlaufen, sind keine Ecken. */
          const kindOf = (b, e) => {
            try {
              const adj = b.shape.faces.filter(fc => fc.edges.some(ed => ed.isSame(e)));
              if (adj.length !== 2) return null;
              const p = e.pointAt(0.5).toTuple(), d = norm(e.tangentAt(0.5).toTuple());
              const n1 = norm(adj[0].normalAt(p).toTuple()), n2 = norm(adj[1].normalAt(p).toTuple());
              if (Math.abs(dot(n1, n2)) > 1 - 1e-9) return null;   // tangential: weder noch
              let t2 = norm(cross(n2, d));
              const eps = 0.05, on = q => R.measureDistanceBetween(R.makeVertex(q), adj[1]) < eps * 0.2;
              if (!on(add(p, mul(t2, eps)))) t2 = mul(t2, -1);
              return dot(t2, n1) < 0 ? 'convex' : 'concave';
            } catch (_) { return null; }
          };
          /* die Kanten einer Auswahl in einem Aufruf runden bzw. fasen; passt das Maß knapp nicht, noch einmal mit 0,05 % weniger */
          const filletSet = (b, sel, what) => {
            const m = el => sel.some(x => { try { return x.isSame(el); } catch (_) { return false; } });
            const run = q => (f.type === 'fillet' ? b.shape.fillet(q, e => e.when(({ element }) => m(element))) : b.shape.chamfer(q, e => e.when(({ element }) => m(element))));
            try { b.shape = run(r); } catch (err) { try { b.shape = run(r * (1 - 5e-4)); } catch (_) { throw new Error(`${f.type === 'fillet' ? 'Rundung' : 'Fase'} ${r} mm passt nicht an alle ${what}`); } }
          };
          if (f.all && (f.allKind === 'convex' || f.allKind === 'concave')) {
            let done = 0;
            bodies.forEach(b => {
              const sel = b.shape.edges.filter(e => kindOf(b, e) === f.allKind);
              if (!sel.length) return;
              filletSet(b, sel, f.allKind === 'convex' ? 'Außenkanten' : 'Innenkanten');
              done += sel.length;
            });
            if (!done) throw new Error(f.allKind === 'convex' ? 'Keine Außenkanten gefunden' : 'Keine Innenkanten (Kehlen) gefunden');
            status[f.id] = { ok: true, before, info: `${done} ${f.allKind === 'convex' ? 'Außenkanten' : 'Innenkanten'} ${f.type === 'fillet' ? 'gerundet' : 'gefast'}` };
            continue;
          }
          /* Kanten der gewählten Flächen (wie „Regel-Abrundung“ auf Flächen/Features): alle Ecken dieser Flächen,
             eine Kante zwischen zwei gewählten Flächen zählt einmal. Tangentale Nachbarn nimmt OpenCASCADE ohnehin mit. */
          if (!f.all && Array.isArray(f.fromFaces) && f.fromFaces.length) {
            const fm = faceMatcher(resolveRefs(bodies, 'face', f.fromFaces));
            const same = (x, y) => { try { return x.isSame(y); } catch (_) { return false; } };
            let done = 0;
            bodies.forEach(b => {
              const sel = [];
              b.shape.faces.forEach(fc => {
                if (!fm(fc)) return;
                fc.edges.forEach(e => { if (kindOf(b, e) && !sel.some(x => same(x, e))) sel.push(e); });
              });
              if (!sel.length) return;
              filletSet(b, sel, 'Kanten der gewählten Flächen');
              done += sel.length;
            });
            if (!done) throw new Error('Keine Ecken an den gewählten Flächen');
            status[f.id] = { ok: true, before, info: `${done} Kante${done === 1 ? '' : 'n'} der gewählten Flächen ${f.type === 'fillet' ? 'gerundet' : 'gefast'}` };
            continue;
          }
          /* weitere Kantengruppen mit eigenem Maß: nur bei konstantem Radius bzw.
             Fase mit gleichem Abstand; alle Gruppen in einem Aufruf, die Funktion gibt je Kante das Maß ihrer Gruppe */
          const sets = !f.all && Array.isArray(f.sets) ? f.sets.filter(x => x && Array.isArray(x.edges) && x.edges.length && Number(x.value) > 1e-6) : [];
          if (!f.all && !(f.edges && f.edges.length) && !sets.length) throw new Error('Keine Kanten gewählt');
          const m0 = edgeMatcher(f.all ? [] : resolveRefs(bodies, 'edge', f.edges || []));
          const setM = sets.map(x => ({ m: edgeMatcher(resolveRefs(bodies, 'edge', x.edges)), v: Number(x.value) }));
          const m = f.all ? m0 : e => m0(e) || setM.some(x => x.m(e));
          const filter = f.all ? undefined : e => e.when(({ element }) => m(element));
          // Abrundung mit variablem Radius: linear vom Anfang zum Ende jeder Kante
          const r2 = Number(f.radius2), variable = f.type === 'fillet' && f.variable && r2 > 1e-6;
          // Fase: gleicher Abstand, zwei Abstände oder Abstand und Winkel. Asymmetrisch braucht OpenCASCADE je
          // Kante die Bezugsfläche (Abstand 1 liegt auf ihr); es ist die erste angrenzende Fläche, „Seite tauschen“ nimmt die zweite.
          const ct = f.type === 'chamfer' ? f.ctype || 'equal' : 'equal';
          const d2 = Number(f.distance2), ca = Number(f.angle);
          if (ct === 'two' && !(d2 > 1e-6)) throw new Error('Abstand 2 muss größer als 0 sein');
          if (ct === 'angle' && !(ca > 0 && ca < 90)) throw new Error('Der Winkel muss zwischen 0° und 90° liegen');
          if (setM.length && (variable || ct !== 'equal')) throw new Error('Weitere Kantengruppen gehen nur mit konstantem Radius bzw. gleichem Abstand');
          /* Sehnenlänge statt Radius (chord length): Abstand der beiden Berührlinien. Schließen die Normalen der
             Nachbarflächen den Winkel α ein (= Bogenwinkel der Rundung), ist c = 2r·sin(α/2), also r = c / (2 sin(α/2)) –
             je Kante aus den Normalen in der Kantenmitte. */
          const chord = f.type === 'fillet' && !!f.chord && !variable;
          /* Zwischenpunkte (variabler Radius mit weiteren Punkten): Lage 0…1 entlang der Kante, eigener Radius.
             OpenCASCADE: MakeFillet.Add, dann SetRadius mit (Lage, Radius)-Paaren – es interpoliert glatt dazwischen und
             normiert die Lage auf die Kante. */
          const vpts = variable && Array.isArray(f.vpts) ? f.vpts.filter(p => p && Number(p.t) > 0 && Number(p.t) < 1 && Number(p.r) > 1e-6).map(p => [Number(p.t), Number(p.r)]).sort((a, b) => a[0] - b[0]) : [];
          const oc0 = R.getOC();
          const filletPts = (shape, edgesSel, q) => {
            const mk = new oc0.BRepFilletAPI_MakeFillet(shape.wrapped, oc0.ChFi3d_FilletShape.ChFi3d_Rational);
            const k = q / r;
            edgesSel.forEach(e => {
              let pts = [[0, r], ...vpts, [1, r2]];
              if (f.vflip) pts = pts.map(([t, v]) => [1 - t, v]).reverse();
              mk.Add(q, e.wrapped);
              const arr = new oc0.NCollection_Array1_gp_Pnt2d(1, pts.length);
              pts.forEach(([t, v], i) => arr.SetValue(i + 1, new oc0.gp_Pnt2d(t, v * k)));
              mk.SetRadius(arr, mk.NbContours(), 1);
            });
            mk.Build(new oc0.Message_ProgressRange());
            if (!mk.IsDone()) { mk.delete(); throw new Error('Rundung mit Zwischenpunkten nicht möglich'); }
            const out = R.cast(mk.Shape()); mk.delete();
            return out;
          };
          const groupVal = (e, q) => (m0(e) ? q : (setM.find(x => x.m(e)) || {}).v * q / r || null);
          let done = 0;
          bodies.forEach(b => {
            if (!f.all && !b.shape.edges.some(m)) return;
            const faceList = ct === 'equal' ? null : b.shape.faces.map(fc => ({ fc, eds: fc.edges }));
            const asym = (e, q) => {
              const adj = faceList.filter(x => x.eds.some(ed => ed.isSame(e))).map(x => x.fc);
              const F = adj[f.cflip ? 1 : 0] || adj[0];
              if (!F) return q;
              const selectedFace = ff => ff.when(({ element }) => element.isSame(F));
              return ct === 'two' ? { distances: [q, d2 * q / r], selectedFace } : { distance: q, angle: ca, selectedFace };
            };
            const chordR = (e, c) => {
              try {
                const adj = b.shape.faces.filter(fc => fc.edges.some(ed => ed.isSame(e)));
                if (adj.length < 2) return c / Math.SQRT2;
                const p = e.pointAt(0.5), n1 = norm(adj[0].normalAt(p).toTuple()), n2 = norm(adj[1].normalAt(p).toTuple());
                const al = Math.acos(Math.max(-1, Math.min(1, dot(n1, n2))));
                if (!(al > 1e-6)) throw new Error('tangential');
                return c / (2 * Math.sin(al / 2));
              } catch (err) { if (err && err.message === 'tangential') throw new Error('An einer tangentialen Kante gibt es keine Sehne'); return c / Math.SQRT2; }
            };
            const run = q => vpts.length
              ? filletPts(b.shape, b.shape.edges.filter(e => f.all || m(e)), q)
              : chord
              ? b.shape.fillet(e => (f.all || m(e) ? chordR(e, setM.length ? groupVal(e, q) : q) : null))
              : (setM.length
              ? (f.type === 'fillet' ? b.shape.fillet(e => (m(e) ? groupVal(e, q) : null)) : b.shape.chamfer(e => (m(e) ? groupVal(e, q) : null)))
              : variable
              ? b.shape.fillet(e => (f.all || m(e) ? (f.vflip ? [r2 * q / r, q] : [q, r2 * q / r]) : null))
              : f.type === 'fillet' ? b.shape.fillet(q, filter)
                : ct === 'equal' ? b.shape.chamfer(q, filter) : b.shape.chamfer(e => (f.all || m(e) ? asym(e, q) : null)));
            // OpenCASCADE scheitert, wenn sich zwei Fasen/Rundungen genau treffen (z. B. 1 mm an beiden Kanten einer 2-mm-Wand).
            // Andere Programme schaffen das; hier mit einem winzig kleineren Maß nachgeben (Unterschied < 1 µm pro mm).
            try { b.shape = run(r); } catch (err) { try { b.shape = run(r * (1 - 5e-4)); } catch (_) { throw err; } }
            done++;
          });
          if (!done) throw new Error('Gewählte Kanten nicht mehr gefunden');
          break;
        }
        case 'shell': {
          if (!bodies.length) throw new Error('Kein Körper vorhanden');
          const t = Number(f.thickness);
          if (!(t > 1e-6)) throw new Error('Wandstärke muss größer als 0 sein');
          const out = f.dir === 'outside', both = f.dir === 'both', hollow = !!f.hollow, sel = Array.isArray(f.faces) ? f.faces : [];
          // beidseitig (innen und außen): Wandstärke innen t, außen thickness2
          const t2 = both ? Number(f.thickness2) : 0;
          if (both && !(t2 > 1e-6)) throw new Error('Wandstärke außen muss größer als 0 sein');
          if (!hollow && !sel.length) throw new Error('Keine Fläche zum Öffnen gewählt');
          // nur die angeklickte Fläche öffnen, nicht alle in derselben Ebene (z. B. Zapfenoberseiten)
          const exact = sel.map(r => findSel(bodies, 'face', r)).filter(Boolean).map(h => h.shape);
          const loose = faceMatcher(resolveRefs(bodies, 'face', sel));
          const m = exact.length === sel.length
            ? el => exact.some(x => { try { return x.isSame(el); } catch (_) { return false; } })
            : loose;
          /* Wandstärke nach außen und hohle Schale (wie „Außen“ bzw. ohne offene Fläche) direkt über
             BRepOffsetAPI_MakeThickSolid mit scharfen Ecken; nach innen mit offenen Flächen wie bisher über replicad.
             Ohne offene Fläche liefert OpenCASCADE den versetzten Kern, die Wand ist dann Körper minus Kern
             (innen) bzw. versetzter Körper minus Körper (außen). */
          const thick = (shape, faces, d) => {
            const oc = R.getOC(), l = new oc.NCollection_List_TopoDS_Shape();
            faces.forEach(fc => l.Append(fc.wrapped));
            const mk = new oc.BRepOffsetAPI_MakeThickSolid();
            // Ecken „scharf“ (Vorgabe) oder „gerundet“: beim Versetzen nach außen Bögen um die Kanten (Radius = Wand)
            mk.MakeThickSolidByJoin(shape.wrapped, l, d, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, f.corners === 'round' ? oc.GeomAbs_JoinType.GeomAbs_Arc : oc.GeomAbs_JoinType.GeomAbs_Intersection, false);
            const r = R.cast(mk.Shape());
            mk.delete(); l.delete();
            // ohne offene Fläche und nach außen kommt der Kern verkehrt herum orientiert (Volumen negativ): umdrehen
            try { const g = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(r.wrapped, g, false, false, false); if (g.Mass() < 0) r.wrapped.Reverse(); g.delete(); } catch (_) { /* Orientierung bleibt */ }
            return r;
          };
          /* Wand ≥ Radius einer äußeren Rundung: OpenCASCADE müsste die Rundung um t nach innen versetzen (Radius R − t ≤ 0)
             und gibt auf. Die Innenecke wird dann scharf – und das ist genau: eine gerundete konvexe Ecke um t ≥ R
             nach innen versetzt ergibt dieselbe Innenkontur wie die scharfe Ecke. Also: konvexe Rundungen bis R ≤ t entfernen
             (Keile wie „Vereinfachen“), den scharfen Körper schalen, dessen Hohlraum aus dem gerundeten Körper schneiden.
             Hohlkehlen (konkav) bleiben – nach innen wächst ihr Radius, das kann OpenCASCADE. */
          let scharfeEcken = 0;
          const schaleScharf = (shape, hits, err) => {
            const konvex = defeatureTools({ shape }, null, { holes: 0, fillets: t + 1e-6 }).tools.filter(x => x.op === 'fuse');
            /* Kugelecken (alle Kanten gerundet): Würfel zwischen Kugelmitte und scharfer Ecke auffüllen – die Ecke ist der
               Schnitt der drei Ebenen, die die Kugel berühren (nur bei rechtwinkligen Ecken) */
            const ebenenK = shape.faces.filter(fc => fc.geomType === 'PLANE').map(fc => { const n = norm(fc.normalAt().toTuple()); return { n, d: dot(n, fc.center.toTuple()) }; });
            shape.faces.forEach(fc => {
              if (fc.geomType !== 'SPHERE') return;
              try {
                const q = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.5, 0.5]].map(([u, v]) => fc.pointOnSurface(u, v).toTuple());
                const c = solve3([1, 2, 3].map(i => mul(sub(q[i], q[0]), 2)), [1, 2, 3].map(i => dot(q[i], q[i]) - dot(q[0], q[0])));
                if (!c) return;
                const r = len(sub(q[0], c)), aussen = dot(norm(fc.normalAt(fc.pointOnSurface(0.5, 0.5)).toTuple()), sub(q[3], c)) > 0;
                if (!aussen || r > t + 1e-6) return;
                const tang = ebenenK.filter(e => Math.abs(dot(e.n, c) + r - e.d) < 1e-6).map(e => e.n);
                const drei = [];
                tang.forEach(n => { if (!drei.some(m => dot(m, n) > 1 - 1e-6)) drei.push(n); });
                if (drei.length !== 3 || Math.abs(dot(drei[0], drei[1])) > 1e-6 || Math.abs(dot(drei[0], drei[2])) > 1e-6 || Math.abs(dot(drei[1], drei[2])) > 1e-6) return;
                const [n1, n2, n3] = drei.map(n => mul(n, r));
                konvex.push({ tool: R.basicFaceExtrusion(R.makePolygon([c, add(c, n1), add(add(c, n1), n2), add(c, n2)]), new R.Vector(n3)), op: 'fuse' });
              } catch (_) { /* Ecke übergehen */ }
            });
            if (!konvex.length || hits.some(h => h.geomType !== 'PLANE')) throw err;
            let scharf = shape.clone();
            konvex.forEach(x => { scharf = bool(scharf, x.tool, 'join'); });
            scharf = tidy(scharf);
            const ebenen = hits.map(h => { const n = norm(h.normalAt().toTuple()); return { n, d: dot(n, h.center.toTuple()) }; });
            const offen = el => { try { if (el.geomType !== 'PLANE') return false; const n = norm(el.normalAt().toTuple()); return ebenen.some(e => dot(n, e.n) > 1 - 1e-6 && Math.abs(dot(e.n, el.center.toTuple()) - e.d) < 1e-6); } catch (_) { return false; } };
            const hohl = bool(scharf.clone(), scharf.clone().shell(t, fi => fi.when(({ element }) => offen(element))), 'cut');
            scharfeEcken += konvex.length;
            return tidy(bool(shape, hohl, 'cut'));
          };
          let done = 0, m0shell = m;
          bodies.forEach(b => {
            let hits = b.shape.faces.filter(m);
            if (f.tangent && hits.length && !hollow) {
              hits = tangentChain(b.shape, hits);
              const all = hits;
              // replicad-shell und MakeThickSolid nehmen dieselbe (erweiterte) Liste
              m0shell = el => all.some(x => { try { return x.isSame(el); } catch (_) { return false; } });
            } else m0shell = m;
            if (!hollow && !hits.length) return;
            if (hollow && sel.length && !hits.length) return;   // hohl: angeklickte Flächen wählen nur den Körper
            if (hollow) b.shape = both ? bool(offsetCore(b.shape, t2, f.corners === 'round'), offsetCore(b.shape, -t), 'cut') : out ? bool(thick(b.shape, [], t), b.shape, 'cut') : bool(b.shape, thick(b.shape, [], -t), 'cut');
            else if (both) b.shape = bool(b.shape.clone().shell(t, fi => fi.when(({ element }) => m0shell(element))), thick(b.shape, hits, t2), 'join');
            else if (out) b.shape = thick(b.shape, hits, t);
            else {
              try {
                const v0 = safeVolume(b.shape) || 0, s = b.shape.clone().shell(t, fi => fi.when(({ element }) => m0shell(element)));
                // OpenCASCADE gibt bei zu dicker Wand manchmal still den unveränderten Körper zurück
                if (v0 > 0 && !((safeVolume(s) || 0) < v0 * 0.9999)) throw new Error('Schale nicht möglich – Wand zu dick oder Form zu komplex?');
                b.shape = s;
              } catch (err) { b.shape = schaleScharf(b.shape, hits, err); }
            }
            done++;
          });
          if (!done) throw new Error('Gewählte Flächen nicht mehr gefunden');
          if (scharfeEcken) { status[f.id] = { ok: true, before, info: `Wand ${+t.toFixed(3)} mm ≥ Rundungsradius: ${scharfeEcken} Rundung${scharfeEcken === 1 ? '' : 'en'} innen scharf` }; continue; }
          break;
        }
        case 'draft': {
          // Formschräge (feste Ebene): Flächen um ihre Schnittlinie mit der neutralen Ebene neigen.
          // Positiver Winkel = Teil wird in Zugrichtung schlanker (entformbar).
          if (!bodies.length) throw new Error('Kein Körper vorhanden');
          const deg = Number(f.angle);
          if (!(Math.abs(deg) > 1e-6 && Math.abs(deg) < 89)) throw new Error('Winkel muss zwischen 0° und 89° liegen');
          const mpl = f.plane;
          const pl = !mpl ? null : mpl.kind === 'face' ? mpl.plane : mpl.kind === 'plane' ? planes.get(mpl.id) : ORIGIN[mpl.key || 'XY'];
          if (!pl) throw new Error('Neutrale Ebene fehlt');
          if (!(f.faces && f.faces.length)) throw new Error('Keine Flächen gewählt');
          const exact = f.faces.map(r => findSel(bodies, 'face', r)).filter(Boolean).map(h => h.shape);
          const m = exact.length === f.faces.length
            ? el => exact.some(x => { try { return x.isSame(el); } catch (_) { return false; } })
            : faceMatcher(resolveRefs(bodies, 'face', f.faces));
          // Körperfläche als neutrale Ebene: Zugrichtung zeigt ins Material (Grundfläche wählen → Teil wird nach oben schlanker)
          const n = norm(mpl.kind === 'face' ? pl.n.map(v => -v) : pl.n), dir = f.flip ? n.map(v => -v) : n;
          const oc = R.getOC();
          const draftWith = (shape, faces, dv, a) => {
            const dr = new oc.BRepOffsetAPI_DraftAngle(shape.wrapped);
            const D = new oc.gp_Dir(dv[0], dv[1], dv[2]), P = new oc.gp_Pln(new oc.gp_Pnt(pl.o[0], pl.o[1], pl.o[2]), D);
            faces.forEach(fc => {
              if (fc.geomType === 'PLANE' && Math.abs(dot(norm(fc.normalAt().toTuple()), dv)) > 0.999) throw new Error('Flächen parallel zur neutralen Ebene lassen sich nicht neigen');
              dr.Add(fc.wrapped, D, a * Math.PI / 180, P, true);
              if (!dr.AddDone()) throw new Error('Eine gewählte Fläche lässt sich nicht neigen (Winkel kleiner wählen oder Nachbarflächen mitwählen)');
            });
            dr.Build(new oc.Message_ProgressRange());
            if (!dr.IsDone()) throw new Error('Formschräge nicht möglich (Winkel kleiner wählen)');
            return R.cast(dr.Shape());
          };
          /* Symmetrisch / zwei Winkel: die neutrale Ebene teilt die gewählten Flächen, jede Seite wird von
             der Ebene weg geneigt (Seite 1 in Zugrichtung mit dem Winkel, Seite 2 dagegen mit demselben bzw. dem
             zweiten Winkel). Weg: Körper an der Ebene teilen, jede Hälfte mit ihrer Zugrichtung neigen, wieder vereinen.
             Die Flächen der Hälften findet ein Punkt auf ihnen, der auf einer gewählten Fläche liegt. */
          const split = f.mode === 'sym' || f.mode === 'two';
          const deg2 = f.mode === 'two' ? Number(f.angle2) : deg;
          if (split && !(Math.abs(deg2) > 1e-6 && Math.abs(deg2) < 89)) throw new Error('Winkel 2 muss zwischen 0° und 89° liegen');
          let done = 0;
          bodies.forEach(b => {
            let faces = b.shape.faces.filter(m);
            if (!faces.length) return;
            if (f.tangent) faces = tangentChain(b.shape, faces);
            if (!split) { b.shape = draftWith(b.shape, faces, dir, deg); done++; return; }
            const bb = bbOf(b.shape), big = len(sub(bb[1], bb[0])) * 2 + 10;
            const onSel = fc => { try { const q = fc.pointOnSurface(0.5, 0.5); const v = R.makeVertex(q.toTuple ? q.toTuple() : q); return faces.some(sf => R.measureDistanceBetween(v, sf) < 1e-6); } catch (_) { return false; } };
            const parts = [[dir, deg], [mul(dir, -1), deg2]].map(([dv, a]) => {
              const half = bool(b.shape.clone(), halfSpace(pl.o, dv, big), 'intersect');
              if (!half || !(safeVolume(half) > 1e-9)) return null;
              const hf = half.faces.filter(onSel);
              return hf.length ? draftWith(half, hf, dv, a) : half;
            });
            if (!parts[0] || !parts[1]) throw new Error('Für symmetrisch / zwei Winkel muss die neutrale Ebene den Körper teilen');
            b.shape = tidy(parts[0].fuse(parts[1]));
            done++;
          });
          if (!done) throw new Error('Gewählte Flächen nicht mehr gefunden');
          break;
        }
        case 'canvas':
          // Ansichtsbereich (Bild als Vorlage): nur Anzeige, keine Geometrie
          break;
        case 'lippe': {
          /* Lippe / Absatz (Kunststoff): auf der ebenen Randfläche einer Schale ein Band entlang der Innen- oder
             Außenkante – Lippe: Breite w, Höhe h nach außen aufgesetzt; Absatz (Gegenstück am anderen Gehäuseteil): Breite
             w + Spiel, Tiefe h + Spiel eingeschnitten. Das Band entsteht aus der Kante und ihrem Versatz in der Ebene
             (scharfe Ecken wie die Wand), als Differenz zweier Prismen. */
          const faces = Array.isArray(f.faces) ? f.faces : [];
          if (!faces.length) throw new Error('Ebene Randfläche der Schale anklicken');
          const absatz = f.art === 'absatz', sp = absatz ? Math.max(0, Number(f.spiel) || 0) : 0;
          const w = (Number(f.w) || 0) + sp, h = (Number(f.h) || 0) + sp;
          if (!(w > 0 && h > 0)) throw new Error('Breite und Höhe müssen größer als 0 sein');
          const oc = R.getOC(), JOIN = oc.GeomAbs_JoinType.GeomAbs_Intersection;
          const flaeche = wire => { const g = new oc.GProp_GProps(); try { oc.BRepGProp.SurfaceProperties(new oc.BRepBuilderAPI_MakeFace(wire, false).Face(), g, false, false); return Math.abs(g.Mass()); } catch (_) { return 0; } finally { g.delete(); } };
          const versatz = (wire, d, wachsen) => {
            const a0 = flaeche(wire);
            for (const dd of [d, -d]) {
              try {
                const mk = new oc.BRepOffsetAPI_MakeOffset(wire, JOIN, false);
                mk.Perform(dd, 0);
                const o = mk.IsDone() ? oc.TopoDS.Wire(mk.Shape()) : null;
                mk.delete();
                if (o && flaeche(o) > 1e-9 && (flaeche(o) > a0) === wachsen) return o;
              } catch (_) { /* andere Seite */ }
            }
            throw new Error('Die Lippe ist breiter als die Wand erlaubt');
          };
          const prisma = (wire, v) => R.cast(new oc.BRepPrimAPI_MakePrism(new oc.BRepBuilderAPI_MakeFace(wire, false).Face(), new oc.gp_Vec(v[0], v[1], v[2]), false, true).Shape());
          let made = 0;
          for (const ref of faces) {
            const hit = findSel(bodies, 'face', ref);
            if (!hit) throw new Error('Eine gewählte Fläche gibt es nicht mehr');
            if (hit.shape.geomType !== 'PLANE') throw new Error('Die Randfläche muss eben sein');
            const n = norm(hit.shape.normalAt(hit.shape.pointOnSurface(0.5, 0.5)).toTuple());
            const ws = hit.shape.wires, gr = x => { const bb = bbOf(x); return len(sub(bb[1], bb[0])); };
            const iA = ws.reduce((a, x, i) => (gr(x) > gr(ws[a]) ? i : a), 0);
            const paare = f.seite === 'aussen'
              ? [[ws[iA].wrapped, versatz(ws[iA].wrapped, w, false)]]
              : ws.filter((_, i) => i !== iA).map(x => [versatz(x.wrapped, w, true), x.wrapped]);
            if (!paare.length) throw new Error('Die Randfläche hat keine Innenkante – „Außen“ wählen');
            const v = absatz ? mul(n, -h) : mul(n, h);
            for (const [gross, klein] of paare) {
              const band = bool(prisma(gross, v), prisma(klein, v), 'cut');
              if (!band) throw new Error('Das Band der Lippe lässt sich nicht bauen');
              const b = bodies.find(x => x.id === hit.body.id);
              const neu = bool(b.shape, band, absatz ? 'cut' : 'fuse');
              if (!neu) throw new Error(absatz ? 'Der Absatz lässt sich nicht einschneiden' : 'Die Lippe lässt sich nicht anfügen');
              b.shape = neu;
              made++;
            }
          }
          status[f.id] = { ok: true, before, info: `${made} ${absatz ? 'Absatz' : 'Lippe'}${made === 1 ? '' : absatz ? 'ätze' : 'n'}` };
          continue;
        }
        case 'thicken': {
          /* Verdicken – hier für Flächen von Körpern (cantcodecad hat keine Flächenkörper): jede gewählte Fläche
             wird zur Schicht der Dicke t (MakeThickSolidBySimple, ohne Fugen zwischen Nachbarflächen), außen = entlang der
             Flächennormale, innen = dagegen, mittig = je t/2. Schicht mit negativem Volumen wird umgedreht. */
          const t = Number(f.thickness);
          if (!(t > 1e-6)) throw new Error('Dicke muss größer als 0 sein');
          const refs = Array.isArray(f.faces) ? f.faces : [];
          if (!refs.length) throw new Error('Flächen anklicken, die verdickt werden');
          const hits = refs.map(r => findSel(bodies, 'face', r));
          if (hits.some(h => !h)) throw new Error('Eine gewählte Fläche gibt es nicht mehr');
          const oc = R.getOC();
          /* eben: Extrusion entlang der Normale; Zylinder: Ring bzw. Ringsektor wie bei Drücken/Ziehen (MakeThickSolidBySimple
             kommt bei einem vollen, periodischen Mantel nicht zurück); sonst MakeThickSolidBySimple */
          const layer = (F, off) => {
            if (F.geomType === 'PLANE') {
              const n = norm(F.normalAt().toTuple());
              return off > 0 ? R.basicFaceExtrusion(F, new R.Vector(mul(n, off))) : R.basicFaceExtrusion(F.clone().translate(...mul(n, off)), new R.Vector(mul(n, -off)));
            }
            if (F.geomType === 'CYLINDRE') return cylPullTool(F, off);
            if (F.geomType === 'SPHERE' || F.geomType === 'TORUS') throw new Error('Kugel- und Torusflächen lassen sich noch nicht verdicken');
            const mk = new oc.BRepOffsetAPI_MakeThickSolid(); mk.MakeThickSolidBySimple(F.wrapped, off); const r = R.cast(mk.Shape()); mk.delete(); if (safeVolume(r) < 0) r.wrapped.Reverse(); return r;
          };
          let tool = null;
          const addT = x => { tool = tool ? bool(tool, x, 'join') : x; };
          hits.forEach(({ shape: F }) => {
            if (f.side === 'mid') { addT(layer(F, t / 2)); addT(layer(F, -t / 2)); }
            else addT(layer(F, f.side === 'in' ? -t : t));
          });
          const op = f.op || 'new';
          applyOp(bodies, tool, op, op === 'new' ? f : { ...f, targets: [...new Set(hits.map(h => h.body.id))] }, f.id);
          tools.set(f.id, [{ tool, op }]);
          status[f.id] = { ok: true, before, info: `${hits.length} Fläche${hits.length === 1 ? '' : 'n'} · ${+t.toFixed(3)} mm ${f.side === 'in' ? 'nach innen' : f.side === 'mid' ? 'mittig' : 'nach außen'}` };
          continue;
        }
        case 'topo': {
          /* Topologieoptimierung: die gewählten Skizzenflächen bilden den
             Designbereich, Punkte der Skizze tragen Kräfte, Halterungen und erhaltene Bereiche. Die
             Optimierung verteilt Material (SIMP) innerhalb dieses Bereichs, der Umriss des Dichtefelds wird
             als Vieleck gezeichnet und als Körper extrudiert – DXF, STEP und Stückliste folgen wie sonst. */
          const sk = solved.get(f.sketch) || byId[f.sketch];
          if (!sk || sk.type !== 'sketch') throw new Error('Die Skizze des Designbereichs fehlt');
          const { regions } = sketchRegions(sk);
          const pl = needPlane(sk);
          /* Designbereich: gewählte Skizzenflächen oder Startform – eine ebene Fläche eines Körpers
             (Außenkontur und Löcher in Skizzenkoordinaten; die Fläche muss parallel zur Skizzenebene liegen) */
          const ausFlaeche = f.bereich === 'flaeche';
          let gebiet;
          if (ausFlaeche) {
            if (!f.face) throw new Error('Designbereich: eine ebene Fläche eines Körpers anklicken');
            const hit = findSel(bodies, 'face', f.face, f.faceBody);
            if (!hit) throw new Error('Die Fläche des Designbereichs gibt es nicht mehr');
            gebiet = [topoFlaeche(hit.shape, pl)];
          } else {
            gebiet = selectRegions(regions, f.profiles);
            if (!gebiet.length) throw new Error('Designbereich: eine geschlossene Fläche der Skizze wählen');
          }
          const flaeche = g => Math.abs(g.poly.reduce((a, q, i) => { const b = g.poly[(i + 1) % g.poly.length]; return a + q[0] * b[1] - b[0] * q[1]; }, 0) / 2);
          const gebietFl = gebiet.reduce((a, g) => a + flaeche(g), 0);
          // kleinste geschlossene Skizzenfläche um einen Punkt (Kreis um eine Bohrung, Rechteck um eine Auflage …)
          const umPunkt = p => regions.filter(g => pointInRegion(g, [p.x, p.y])).sort((a, b) => flaeche(a) - flaeche(b))[0];

          // Zuordnung der Skizzenpunkte: Kraft, Halterung oder erhaltener Bereich
          const rollen = f.rolle || {};
          const lasten = [], stuetzen = [], erhalten = [];
          markerPoints(sk).forEach(p => {
            const r = rollen[p.id];
            if (!r || !r.art) return;
            if (r.art === 'bereich') {
              const fl = umPunkt(p);
              if (!fl) throw new Error('Für einen erhaltenen Bereich braucht der Punkt eine geschlossene Fläche um sich herum');
              if (gebiet.includes(fl)) throw new Error('Ein erhaltener Bereich braucht eine eigene geschlossene Fläche um den Punkt (z. B. einen Kreis) – dieser Punkt liegt direkt im Designbereich');
              if (!erhalten.includes(fl)) erhalten.push(fl);
              return;
            }
            if (r.art === 'last') lasten.push({ x: p.x, y: p.y, fx: Number(r.fx) || 0, fy: Number(r.fy) || 0 });
            else if (r.art === 'fest' || r.art === 'rolle-x' || r.art === 'rolle-y') stuetzen.push({ x: p.x, y: p.y, art: r.art });
            else return;
            /* (Kräfte und Halterungen sitzen auf „Beibehalten“-Geometrie): liegt der Punkt in einer eigenen
               kleinen Skizzenfläche, die nicht zum Designbereich gehört (Kreis um eine Bohrung), bleibt sie Material */
            const fl = umPunkt(p);
            if (fl && !gebiet.includes(fl) && !erhalten.includes(fl) && flaeche(fl) < 0.5 * gebietFl) erhalten.push(fl);
          });
          if (!lasten.length) throw new Error('Es fehlt eine Kraft – in der Skizze einen Punkt als Kraft festlegen');
          if (!stuetzen.length) throw new Error('Es fehlt eine Halterung – einen Punkt als Einspannung oder Halterung festlegen');

          /* Raster über dem Designbereich (und den erhaltenen Bereichen): ohne Vorgabe so groß, dass die
             Rechnung auch ohne Rückfrage in vertretbarer Zeit durchläuft – die Elementzahl ist begrenzt. */
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          const spur = poly => poly.forEach(q => {
            x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
          });
          [...gebiet, ...erhalten].forEach(r => { spur(r.poly); r.holePolys.forEach(spur); });
          const breite = x1 - x0, hoehe = y1 - y0;
          if (!(breite > 1e-6 && hoehe > 1e-6)) throw new Error('Der Designbereich ist zu klein');
          const MAXE = 4000;
          const vorgegeben = Number(f.element) > 0 ? Number(f.element) : Math.max(breite, hoehe) / 60;
          let nelx = Math.max(6, Math.round(breite / vorgegeben)), nely = Math.max(6, Math.round(hoehe / vorgegeben));
          while (nelx * nely > MAXE) { nelx = Math.max(6, Math.floor(nelx / 1.3)); nely = Math.max(6, Math.floor(nely / 1.3)); }
          const hx = breite / nelx, hy = hoehe / nely;
          const mittig = e => [x0 + (e % nelx + 0.5) * hx, y0 + (Math.floor(e / nelx) + 0.5) * hy];
          const mask = new Uint8Array(nelx * nely), keep = new Uint8Array(nelx * nely);
          for (let e = 0; e < mask.length; e++) if (gebiet.some(r => pointInRegion(r, mittig(e)))) mask[e] = 1;
          if (!mask.some(v => v)) throw new Error('Zum Designbereich passt kein Rasterelement – Elementgröße kleiner wählen');
          // bei einer Körperfläche nur innerhalb der Fläche erhalten – sonst füllte ein Kreis um eine Bohrung die Bohrung
          erhalten.forEach(fl => {
            for (let e = 0; e < mask.length; e++) if (pointInRegion(fl, mittig(e)) && (!ausFlaeche || pointInRegion(gebiet[0], mittig(e)))) { mask[e] = 1; keep[e] = 1; }
          });

          const werkstoff = elasticOf(f.material || 'steel');
          const anteil = Math.min(0.98, Math.max(0.02, (Number(f.anteil) || 40) / 100));
          const dicke = Math.max(0.01, Number(f.dicke) || 5);
          // Weichzeichnung und Glättung in mm, der Rechner arbeitet in Elementen
          const kante = Math.min(hx, hy);
          const gl = Number(f.glaettung) > 0 ? Number(f.glaettung) : 0.5 * kante; // 0,5 Elemente: glättet die Rastertreppe, dünne Stäbe bleiben ganz (0,7 zerriss sie); der Anteil wird mit derselben Glättung nachgeregelt
          const eingabe = { nelx, nely, hx, hy, ox: x0, oy: y0, mask, keep, lasten, stuetzen,
            dichte: anteil, abstrafung: f.abstrafung, filter: Number(f.weich) > 0 ? Number(f.weich) / kante : 1.6,
            wiederholungen: f.wiederholungen, E: werkstoff.E, nu: werkstoff.nu, dicke, projektion: f.projektion !== false };
          /* Die Optimierung dauert Sekunden: Ergebnis (Umriss + Kennzahlen) je Eingabe merken, damit ein Neuaufbau
             wegen eines späteren Features sie nicht noch einmal rechnet. Schlüssel = alles, was die Rechnung bestimmt. */
          // Zahlen gerundet: der Skizzen-Solver verschiebt Punkte bei jedem Aufbau um Rundungsreste
          const schluessel = JSON.stringify({ ...eingabe, mask: Array.from(mask).join(''), keep: Array.from(keep).join(''), gl }, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
          let erg = topoCache.get(schluessel), aus = !!erg;
          if (!erg) {
            const opt = topOptimize(eingabe);
            /* Niveau so wählen, dass die Fläche dem Zielanteil entspricht – die 0,5-Linie eines grauen
               Feldes wäre zu groß. Danach wird der Umriss für die Skizze vereinfacht. */
            const schnitt = niveauFuerAnteil(opt.dichten, opt.modell, anteil, gl);
            const fl = flaechenAusSchleifen(schnitt.schleifen, gl);
            if (!fl.length) throw new Error('Aus dem Dichtefeld entsteht keine Fläche – Zielanteil erhöhen');
            /* Der Umriss liegt wegen der grauen Übergänge meist etwas über dem gerechneten Anteil – beides anzeigen */
            const netto = fl.reduce((a, q) => a + q.flaeche - q.loecher.reduce((b, h) => b + h.flaeche, 0), 0), bereich = mask.reduce((a, v) => a + v, 0) * hx * hy;
            erg = { flaechen: fl, info: `${opt.elemente.nelx}×${opt.elemente.nely} Rasterelemente · ${opt.iterationen} Schritte · Nachgiebigkeit ${opt.nachgiebigkeit.toPrecision(4)} N·mm · Weg an der Last ${opt.wegmax.toFixed(4)} mm · Werkstoffanteil gerechnet ${(opt.anteil * 100).toFixed(1)} %, Umriss ${(netto / bereich * 100).toFixed(1)} %${fl.length > 1 ? ` · ${fl.length} getrennte Teile` : ''}` };
            topoCache.set(schluessel, erg);
            if (topoCache.size > 12) topoCache.delete(topoCache.keys().next().value);
          }
          const flaechen = erg.flaechen;
          const zug = pts0 => {
            // ohne doppelte Punkte (auch nicht Ende = Anfang): replicad verträgt keine Strecken der Länge 0
            const pts = pts0.filter((q, i) => { const r = pts0[(i + pts0.length - 1) % pts0.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-9; });
            let d = R.draw(pts[0]); pts.slice(1).forEach(q => { d = d.lineTo(q); }); return d.close();
          };
          let zeichnung = null;
          flaechen.forEach(fl => {
            let d = zug(fl.punkte);
            fl.loecher.forEach(l => { d = d.cut(zug(l.punkte)); });
            zeichnung = zeichnung ? zeichnung.fuse(d) : d;
          });
          let tool = zeichnung.sketchOnPlane(makePlane(pl, 0)).extrude(dicke);
          /* Die Kontur läuft am Rand bis zu einem halben Element über den Designbereich hinaus
             auf den Bereich (und die erhaltenen Flächen) beschneiden */
          if (ausFlaeche) {
            /* Körperfläche: erhaltene Ringe als Skizzengeometrie dazu, dann mit der echten Fläche beschneiden (auf die
               Skizzenebene geschoben und um die Dicke extrudiert) – so bleiben Bohrungen exakte Kreise statt Rasterecken,
               wichtig für die Laser-DXF */
            try {
              let ring = null;
              erhalten.forEach(r => { const d = zug(r.poly); ring = ring ? ring.fuse(d) : d; });
              if (ring) tool = tool.fuse(ring.sketchOnPlane(makePlane(pl, 0)).extrude(dicke));
              const hit2 = findSel(bodies, 'face', f.face, f.faceBody);
              const fp = hit2.shape.pointOnSurface(0.5, 0.5).toTuple(), auf = mul(pl.n, dot(sub(pl.o, fp), pl.n));
              const flaecheAufEbene = hit2.shape.clone().translate(...auf);
              tool = tool.intersect(R.basicFaceExtrusion(flaecheAufEbene, new R.Vector(mul(pl.n, dicke))));
            } catch (_) { /* ohne Beschnitt weiter */ }
          } else {
            let raum = null;
            [...gebiet, ...erhalten].forEach(r => {
              let d = zug(r.poly);
              r.holePolys.forEach(h => { d = d.cut(zug(h)); });
              raum = raum ? raum.fuse(d) : d;
            });
            try { tool = tool.intersect(raum.sketchOnPlane(makePlane(pl, 0)).extrude(dicke)); } catch (_) { /* ohne Beschnitt weiter */ }
          }
          applyOp(bodies, tool, 'new', {}, f.id);
          // continue statt break: der allgemeine Status nach dem switch würde info sonst überschreiben
          status[f.id] = { ok: true, before, info: erg.info, ...(aus ? { cached: true } : {}) };
          continue;
        }
        case 'gdform': {
          /* Ergebnis des Generativen Designs als Konstruktion:
             gespeicherter Umriss in der Schneidebene, über die Spanne z0…z1 extrudiert, Beibehalten-Körper dazu,
             Hindernis-Körper abgezogen – so bleiben Bohrungen und Augen exakt (Laser-DXF) */
          const e = f.ebene, fl = Array.isArray(f.flaechen) ? f.flaechen : [];
          if (!e || !fl.length) throw new Error('Das Ergebnis enthält keinen Umriss');
          const zug = pts0 => {
            const pts = pts0.filter((q, i) => { const r = pts0[(i + pts0.length - 1) % pts0.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-9; });
            let d = R.draw(pts[0]); pts.slice(1).forEach(q => { d = d.lineTo(q); }); return d.close();
          };
          const dz = Number(f.z1) - Number(f.z0);
          if (!(dz > 1e-6)) throw new Error('Die Dicke des Ergebnisses ist 0');
          if (f.glatt) {
            bodies.push({ id: f.id, shape: tidy(gdGlatt(f, bodies)) });
            status[f.id] = { ok: true, before, info: f.info || 'Ergebnis des Generativen Designs' };
            continue;
          }
          let zeichnung = null;
          fl.forEach(q => {
            let d = zug(q.punkte);
            (q.loecher || []).forEach(l => { d = d.cut(zug(l.punkte)); });
            zeichnung = zeichnung ? zeichnung.fuse(d) : d;
          });
          let tool = zeichnung.sketchOnPlane(makePlane({ o: e.o || [0, 0, 0], x: e.x, y: e.y, n: e.n }, Number(f.z0))).extrude(dz);
          for (const id of f.beibehalten || []) { const b = bodies.find(x => x.id === id); if (b) tool = tool.fuse(b.shape.clone()); }
          for (const id of f.hindernis || []) { const b = bodies.find(x => x.id === id); if (b) tool = tool.cut(b.shape.clone()); }
          bodies.push({ id: f.id, shape: tidy(tool) });
          status[f.id] = { ok: true, before, info: f.info || 'Ergebnis des Generativen Designs' };
          continue;
        }
        case 'gdform3': {
          /* räumliches Ergebnis (Fertigung uneingeschränkt): Oberfläche aus dem gespeicherten Knotendichtefeld
             (Marching Tetrahedra, geglättet) als Netzkörper wie ein STL-Import; Hindernis-Körper abgezogen */
          const F = f.feld;
          if (!F || !F.d || !(F.h > 0)) throw new Error('Das Ergebnis enthält kein Dichtefeld');
          const bin = atob(F.d), v = new Float32Array(bin.length);
          for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i) / 255;
          if (v.length !== (F.nx + 1) * (F.ny + 1) * (F.nz + 1)) throw new Error('Das Dichtefeld passt nicht zum Raster');
          const s = gdOberflaeche(v, { o: F.o, nx: F.nx, ny: F.ny, nz: F.nz }, F.h, Number(F.iso) || 0.5);
          const P = s.pos, T = s.tri, tris = [];
          for (let t = 0; t < T.length; t += 3) tris.push([0, 1, 2].map(q => { const i = 3 * T[t + q]; return [P[i], P[i + 1], P[i + 2]]; }));
          if (!tris.length) throw new Error('Das Ergebnis ist leer');
          if (tris.length > 150000) throw new Error(`Zu viele Dreiecke (${tris.length}) – Rasterweite größer wählen`);
          let tool = stlSolidFast(tris);
          if (!tool) throw new Error('Die Oberfläche ist nicht geschlossen');
          let warn = null;
          /* Beibehalten-Körper exakt dazu (das Feld legt die Freiform dort knapp innerhalb ihrer Flächen, siehe
             feldMitBeibehalten), danach Hindernisse ab – Augen, Platten und Bohrungen bleiben wie konstruiert */
          for (const id of f.beibehalten || []) {
            const b = bodies.find(x => x.id === id);
            if (b) try { tool = tool.fuse(b.shape.clone()); } catch (_) { warn = 'Beibehalten-Körper nicht vereinigt'; }
          }
          for (const id of f.hindernis || []) {
            const b = bodies.find(x => x.id === id);
            if (b) try { tool = tool.cut(b.shape.clone()); } catch (_) { warn = 'Hindernis nicht abgezogen'; }
          }
          bodies.push({ id: f.id, shape: tool });
          status[f.id] = { ok: true, before, info: `${f.info || 'Ergebnis des Generativen Designs'} · Netzkörper, ${tris.length} Dreiecke`, ...(warn ? { warn } : {}) };
          continue;
        }
        case 'gitter': {
          /* Volumetrisches Gitter: eine periodische Minimalfläche (Gyroid,
             Diamant, Schwarz P) füllt den Körper als Wand der gewählten Dicke. Die Begrenzung liegt in den
             Flächen des Körpers – geschnitten wird im Dichtefeld und nicht nachträglich mit dem Netz: ein
             Boolescher Schnitt hinge an der Zahl der Dreiecke (35 000: über 15 Minuten, gemessen), das Feld
             nur an der Rasterweite. Ergebnis wie bei einem STL-Import und beim Generativen Design (3D): ein
             Netzkörper aus ebenen Dreiecksflächen, ohne Verrundungen an den Stegen. */
          const ids = Array.isArray(f.bodies) ? f.bodies : [];
          const src = ids.length ? bodies.filter(b => ids.includes(b.id)) : bodies.slice();
          if (!src.length) throw new Error(ids.length ? 'Die gewählten Körper gibt es nicht mehr' : 'Kein Körper vorhanden');
          const typ = GITTER_TYPEN[f.typ] ? f.typ : 'gyroid';
          const zelle = Math.max(0.5, Number(f.zelle) || 10), dicke = Math.max(0.05, Number(f.dicke) || 3);
          if (dicke >= zelle) throw new Error('Wandstärke muss kleiner sein als die Gitterzelle');
          /* Oberfläche der Körper: sie gibt die Begrenzung (Vorzeichen und Abstand der Flächen) und die Hülle */
          const anteile = [];
          for (const b of src) {
            const mm = b.shape.mesh({ tolerance: Math.max(0.002, Math.min(zelle, dicke) / 25), angularTolerance: 0.3 });
            const V = mm.vertices, TI = mm.triangles;   // TI: flache Liste von Vertex-Indices, drei je Dreieck
            const st = new Float64Array((TI.length / 3) * 9);   // neun Werte pro Dreieck (sim/gitter.js)
            for (let t = 0; t < TI.length / 3; t++) for (let v = 0; v < 3; v++) {
              const q = 3 * TI[3 * t + v], s = 9 * t + 3 * v;
              st[s] = V[q]; st[s + 1] = V[q + 1]; st[s + 2] = V[q + 2];
            }
            if (st.length) anteile.push(st);
          }
          let nwert = 0;
          for (const st of anteile) nwert += st.length;
          const tris = new Float64Array(nwert);
          let versetzt = 0;
          for (const st of anteile) { tris.set(st, versetzt); versetzt += st.length; }
          if (!tris.length) throw new Error('Die Körper haben keine Oberfläche');
          const bs = src.map(b => bbOf(b.shape));
          const lo = [0, 1, 2].map(i => Math.min(...bs.map(b => b[0][i]))), hi = [0, 1, 2].map(i => Math.max(...bs.map(b => b[1][i])));
          const g = gitterNetz({ typ, zelle, dicke, lo, hi, tris, m: Number(f.auflsung) || 0 });
          const P = g.netz.pos, T = g.netz.tri, netz = [];
          for (let t = 0; t < T.length; t += 3) netz.push([0, 1, 2].map(q => { const i = 3 * T[t + q]; return [P[i], P[i + 1], P[i + 2]]; }));
          if (!netz.length) throw new Error('Das Gitter passt nicht in den Körper – eine kleinere Gitterzelle wählen');
          const tool = stlSolidFast(netz);
          if (!tool) throw new Error('Das Gitter ist nicht geschlossen – Wandstärke oder Auflösung ändern');
          let gv = 0;   // Rauminhalt des Netzes (dasselbe Verfahren wie netzVolumen, hier auf den eigenen Punkten)
          for (let t = 0; t < T.length; t += 3) {
            const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
            gv += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
                + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
          }
          gv = Math.abs(gv / 6);
          let srcVol = 0;
          for (const b of src) { try { srcVol += volumenEigenschaften(b.shape).volume || 0; } catch (_) { /* ohne Anteil */ } }
          if (f.op === 'replace') for (const b of src) bodies.splice(bodies.indexOf(b), 1);
          bodies.push({ id: f.id, shape: tool });
          const warn = g.raster.zuGrob ? `Auflösung zu grob für diese Wandstärke – nur ${g.raster.m} Schritte pro Gitterzelle` : null;
          status[f.id] = {
            ok: true, before,
            info: `${GITTER_TYPEN[typ].label}, Gitterzelle ${+zelle.toFixed(2)} mm, Wand ${+dicke.toFixed(2)} mm`
              + ` · Netzkörper, ${netz.length} Dreiecke, ${+gv.toFixed(1)} mm³`
              + (srcVol > 0 ? `, ${Math.round((100 * gv) / srcVol)} % Material` : ''),
            ...(warn ? { warn } : {})
          };
          continue;
        }
        case 'boundfill': {
          /* Begrenzungsfüllung: Werkzeuge (Körper und Ebenen) schließen Zellen ein, die gewählten Zellen werden
             ein neuer Körper. Werkzeugkörper bleiben, außer „Werkzeuge entfernen“. */
          const ids = Array.isArray(f.bodies) ? f.bodies : [];
          const tools = bodies.filter(b => ids.includes(b.id));
          if (ids.length && tools.length < ids.length) throw new Error('Ein Werkzeugkörper fehlt');
          const pls = (Array.isArray(f.planes) ? f.planes : []).map(mpl => (mpl.kind === 'face' ? mpl.plane : mpl.kind === 'plane' ? planes.get(mpl.id) : ORIGIN[mpl.key || 'XY']));
          if (pls.some(p => !p)) throw new Error('Eine Werkzeugebene fehlt');
          if (!tools.length) throw new Error('Mindestens einen Werkzeugkörper wählen');
          const cells = boundCells(tools.map(b => b.shape), pls);
          if (!cells.length) throw new Error('Die Werkzeuge schließen keinen Raum ein');
          const pick = Array.isArray(f.cells) ? f.cells.filter(i => i >= 0 && i < cells.length) : cells.map((_, i) => i);
          const info = { cells: cells.map(c => ({ volume: c.volume, center: c.center })) };
          if (!pick.length) { status[f.id] = { ok: true, before, warn: 'Keine Zelle gewählt', ...info }; continue; }
          let shp = cells[pick[0]].shape;
          for (const i of pick.slice(1)) shp = shp.fuse(cells[i].shape);
          if (f.removeTools) for (const t of tools) bodies.splice(bodies.indexOf(t), 1);
          bodies.push({ id: f.id, shape: tidy(shp) });
          const vol = pick.reduce((a, i) => a + cells[i].volume, 0);
          status[f.id] = { ok: true, before, info: `${pick.length} von ${cells.length} Zelle${cells.length === 1 ? '' : 'n'}, ${+vol.toFixed(3)} mm³`, ...info };
          continue;
        }
        case 'bound': {
          /* Begrenzender Volumenkörper: Quader um die genaue Hülle oder Zylinder um eine Achse X/Y/Z durch die
             Mitte der Hülle (Radius = größter Abstand der Kantenpunkte von der Achse), jeweils um den Abstand größer */
          const ids = Array.isArray(f.bodies) ? f.bodies : [];
          const src = ids.length ? bodies.filter(b => ids.includes(b.id)) : bodies.slice();
          if (!src.length) throw new Error(ids.length ? 'Die gewählten Körper gibt es nicht mehr' : 'Kein Körper vorhanden');
          const o = Math.max(0, Number(f.offset) || 0), bs = src.map(b => bbOf(b.shape));
          const lo = [0, 1, 2].map(i => Math.min(...bs.map(b => b[0][i]))), hi = [0, 1, 2].map(i => Math.max(...bs.map(b => b[1][i])));
          let tool;
          if (f.shape === 'cylinder') {
            const ax = f.axis === 'X' ? 0 : f.axis === 'Y' ? 1 : 2, u = (ax + 1) % 3, v = (ax + 2) % 3;
            const cu = (lo[u] + hi[u]) / 2, cv = (lo[v] + hi[v]) / 2;
            let r = 0;
            src.forEach(b => b.shape.edges.forEach(e => { for (let k = 0; k <= 16; k++) { const p = e.pointAt(k / 16).toTuple(); r = Math.max(r, Math.hypot(p[u] - cu, p[v] - cv)); } }));
            const base = [0, 0, 0], dir = [0, 0, 0];
            base[ax] = lo[ax] - o; base[u] = cu; base[v] = cv; dir[ax] = 1;
            tool = R.makeCylinder(r + o, hi[ax] - lo[ax] + 2 * o, base, dir);
            status[f.id] = { ok: true, before, info: `Zylinder ⌀${+(2 * (r + o)).toFixed(3)} × ${+(hi[ax] - lo[ax] + 2 * o).toFixed(3)} mm` };
          } else {
            tool = R.makeBox(lo.map(x => x - o), hi.map(x => x + o));
            status[f.id] = { ok: true, before, info: `Quader ${hi.map((x, i) => +(x - lo[i] + 2 * o).toFixed(3)).join(' × ')} mm` };
          }
          bodies.push({ id: f.id, shape: tool });
          continue;
        }
        default:
          throw new Error('Unbekanntes Feature');
      }
      /* Wie üblich („kein Zielkörper“), aber als Warnung, damit ältere Dateien weiter aufbauen: ein Schnitt, der
         nichts trifft, ändert nichts – meist liegt die Skizze daneben oder die Richtung stimmt nicht. Muster und
         Spiegeln ausgenommen, dort dürfen einzelne Kopien neben dem Körper liegen. */
      const CUT_DIRECT = ['extrude', 'revolve', 'hole', 'sweep', 'loft', 'pipe', 'coil', 'primitive'];
      status[f.id] = { ok: true, before, ...(cutMiss && CUT_DIRECT.includes(f.type) && (f.op === 'cut' || f.type === 'hole') ? { warn: 'Ausschneiden trifft keinen Körper – Lage oder Richtung prüfen' } : {}) };
    } catch (err) {
      status[f.id] = { ok: false, error: niceError(err, f.type), before };
    } finally {
      sheetRule = regelVorher;
      // neue oder veränderte Körper eines Freiform-Features merken
      if (preShapes) bodies.forEach(b => { if (preShapes.get(b.id) !== b.shape) heavyIds.add(b.id); });
      // Anzeige-Netz nur bei Körpern verwerfen, deren Form ausgetauscht wurde
      if (meshSrc) bodies.forEach(b => { if (b.meshCacheKey && meshSrc.get(b.id) !== b.shape) invalidateMesh(b); });
      if (!depth) instanzSync(bodies);
    }
  }
  // Abwicklung mit überschnittener Kontur: am Feature melden, das sie zuletzt gerechnet hat
  if (!depth && sheetMeta && sheetMeta.unfold && sheetMeta.unfold.crossings && status[sheetMeta.unfold.feature] && status[sheetMeta.unfold.feature].ok) {
    const st = status[sheetMeta.unfold.feature], w = crossWarn(sheetMeta.unfold.crossings);
    st.warn = st.warn ? `${st.warn} · ${w}` : w;
  }
  if (!depth) { instanzSync(bodies); instanzNetzSchluessel(bodies); }
  if (!depth) lastBodies = bodies;
  return { bodies, status, sketches: updated, copies };
}
/* Instanzen (Komponenten mit `instanz: { von, R, t }`): je Körper der Original-Komponente eine versetzte
   Kopie „Instanz-ID~Körper-ID“. Abgleich nach jedem Feature (`instanzSync`): sobald die Körper des Originals da sind,
   entstehen die Kopien in der Einbaulage L; ändert ein Feature das Original, werden sie aus ihm neu gebaut (Änderung
   gilt für alle); bewegt ein Feature eine Kopie (Verschieben, Gelenk, Ausrichten …), wird die starre Bewegung aus den
   Eckpunkten vorher/nachher bestimmt und in L übernommen – so bleibt die Bewegung erhalten, wenn das Original sich
   später ändert. */
let instanzListe = [], instStand = new Map(); // Instanz-ID → { L, orig: Map(Körper-ID → Form), kopie: Map(ID → Form) }
/* die ersten `max` Eckpunkte in der Reihenfolge des Explorers – bei einer starren Bewegung bleibt sie gleich. Gemerkt
   werden Punkte, nicht die Form: Drehen/Verschieben von replicad gibt die alte Form frei. */
const eckpunkte = (shape, max = 24) => {
  const oc = R.getOC(), pts = [], ex = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More() && pts.length < max; ex.Next()) { const g = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex(ex.Current())); pts.push([g.X(), g.Y(), g.Z()]); g.delete(); }
  ex.delete();
  return pts;
};
/* Starre Bewegung B mit B(P[i]) ≈ Q[i] für alle i (gleiche Reihenfolge der Eckpunkte), sonst null */
function starreBewegung(P, Q) {
  if (!P.length || P.length !== Q.length) return null;
  const a = 0;
  let b = 1; for (let i = 1; i < P.length; i++) if (len(sub(P[i], P[a])) > len(sub(P[b], P[a]))) b = i;
  const u = norm(sub(P[b], P[a]));
  let c = -1, best = 0;
  for (let i = 0; i < P.length; i++) { const w = sub(P[i], P[a]), h = len(sub(w, mul(u, dot(w, u)))); if (h > best) { best = h; c = i; } }
  const rahmen = (A, B, C) => { const x = norm(sub(B, A)), z = norm(cross(x, sub(C, A))), y = cross(z, x); return [x, y, z]; };
  let R;
  if (c < 0 || best < 1e-6) R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // alle Ecken auf einer Linie: nur Verschiebung
  else {
    const [px, py, pz] = rahmen(P[a], P[b], P[c]), [qx, qy, qz] = rahmen(Q[a], Q[b], Q[c]);
    R = [0, 1, 2].flatMap(r => [0, 1, 2].map(k => qx[r] * px[k] + qy[r] * py[k] + qz[r] * pz[k]));
  }
  const B = { R, t: [0, 1, 2].map(r => Q[a][r] - (R[3 * r] * P[a][0] + R[3 * r + 1] * P[a][1] + R[3 * r + 2] * P[a][2])) };
  // Rundungsfehler wachsen mit der Lage im Raum (Baugruppen liegen oft Meter vom Ursprung entfernt)
  const gross = Math.max(1, len(sub(P[b], P[a]))), weit = Math.max(1, ...P.concat(Q).map(p => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))));
  return P.every((p, i) => len(sub(lageAuf(B, p), Q[i])) < 1e-6 * gross + 1e-9 * weit + 1e-7) ? B : null;
}
function instanzSync(bodies) {
  if (!instanzListe.length) return;
  const byId = new Map(bodies.map(b => [b.id, b]));
  for (const inst of instanzListe) {
    const origIds = compBodies(inst.von).filter(id => !String(id).includes('~') && byId.has(id));
    if (!origIds.length) continue;
    let st = instStand.get(inst.id);
    const baue = (L, alt) => {
      const M = { R: [L.R.slice(0, 3), L.R.slice(3, 6), L.R.slice(6, 9)], T: L.t }, kopie = new Map();
      origIds.forEach(bid => {
        const id = `${inst.id}~${bid}`;
        let shape;
        try { shape = rigidShape(byId.get(bid).shape.clone(), M); } catch (_) { return; }
        const k = byId.get(id);
        if (k) k.shape = shape; else { bodies.push({ id, shape }); byId.set(id, bodies[bodies.length - 1]); }
        kopie.set(id, { shape, pts: eckpunkte(shape) });
      });
      // Kopien eines nicht mehr vorhandenen Originalkörpers fallen weg
      if (alt) for (const id of alt.keys()) if (!kopie.has(id)) { const i = bodies.findIndex(b => b.id === id); if (i >= 0) bodies.splice(i, 1); }
      return { L, orig: new Map(origIds.map(bid => [bid, byId.get(bid).shape])), kopie };
    };
    if (!st) { instStand.set(inst.id, baue({ R: inst.R, t: inst.t })); continue; }
    // eine Kopie bewegt (und das Original nicht geändert)? → starre Bewegung in die Lage übernehmen
    const origGeaendert = origIds.length !== st.orig.size || origIds.some(bid => st.orig.get(bid) !== byId.get(bid).shape);
    let L = st.L;
    for (const [id, vorher] of st.kopie) {
      const k = byId.get(id);
      if (!k || k.shape === vorher.shape) continue;
      let B = null;
      try { B = starreBewegung(vorher.pts, eckpunkte(k.shape)); } catch (_) { B = null; }
      if (B) { L = lageMal(B, st.L); break; }
    }
    const bewegt = L !== st.L, kopieAnders = [...st.kopie].some(([id, s]) => !byId.get(id) || byId.get(id).shape !== s.shape);
    if (origGeaendert || (kopieAnders && !bewegt)) instStand.set(inst.id, baue(L, st.kopie));
    else if (bewegt) instStand.set(inst.id, { ...st, L, kopie: new Map([...st.kopie.keys()].map(id => { const s = byId.get(id).shape; return [id, { shape: s, pts: eckpunkte(s) }]; })) });
  }
}
/* Netz-Schlüssel der Kopien: nur wenn das Original unverändert importiert ist; die Lage gehört zum Schlüssel */
function instanzNetzSchluessel(bodies) {
  const byId = new Map(bodies.map(b => [b.id, b]));
  for (const [iid, st] of instStand) {
    const lage = st.L.R.concat(st.L.t).map(v => v.toFixed(6)).join(',');
    for (const id of st.kopie.keys()) {
      const k = byId.get(id), o = byId.get(id.slice(id.indexOf('~') + 1));
      if (k && o && o.meshCacheKey && k.shape === st.kopie.get(id).shape) k.meshCacheKey = `${o.meshCacheKey}@${iid}@${lage}`;
    }
  }
}

/* Projizierte Bezüge einer Skizze auf den aktuellen Stand bringen und neu lösen.
   Rückgabe: null = keine Bezüge, '' = ok, sonst Warnung. */
function refreshRefs(sk, solved, byId) {
  if (!sk.plane) return null;      // eine 3D-Skizze hat keine projizierten Bezüge auf andere Skizzen
  const items = [...sk.curves.filter(c => c.ref && c.ref.kind === 'sketch'), ...sk.points.filter(p => p.ref && p.ref.kind === 'sketch')];
  if (!items.length) return null;
  let missing = 0;
  items.forEach(it => {
    const src = solved.get(it.ref.sketch) || (byId[it.ref.sketch] && migrateSketch(JSON.parse(JSON.stringify(byId[it.ref.sketch]))));
    const geo = resolveSketchRef(sk.plane, it.ref, src);
    if (!applyRefGeometry(sk, it, geo)) missing++;
  });
  const res = solveSketch(sk);
  if (!res.ok) return 'Die Skizze lässt sich mit den geänderten Bezügen nicht lösen';
  return missing ? `${missing} projizierte${missing === 1 ? 's Element' : ' Elemente'} nicht mehr gefunden` : '';
}

const KERNEL_FAIL = {
  fillet: 'Verrundung nicht möglich – Radius zu groß für eine der Kanten?',
  chamfer: 'Fase nicht möglich – Maß zu groß für eine der Kanten?',
  shell: 'Schale nicht möglich – Wand zu dick oder Form zu komplex?',
  coil: 'Spirale nicht möglich – Querschnitt zu groß für Durchmesser oder Steigung?',
  sweep: 'Sweeping nicht möglich – Profil zu groß für die Pfadkrümmung oder nicht quer zum Pfad?',
  sm_bend: 'Biegen nicht möglich – Linie nicht quer über das Blech oder Biegung stößt an?',
  rib: 'Rippe nicht möglich – Linie liegt nicht in einer offenen Ecke des Körpers?',
  sm_contour: 'Konturlasche nicht möglich – Linien zu kurz für die Biegeradien oder Kontur überschneidet sich?',
  frame: 'Rahmen nicht möglich – Profil zu groß für die Linienlängen oder Linien überlappen?',
  loft: 'Erhebung nicht möglich – Profile passen nicht zueinander?',
  thread: 'Gewinde nicht möglich – Fläche zu kurz oder Größe passt nicht?',
  hole: 'Bohrung nicht möglich – Maße prüfen.',
  presspull: 'Drücken/Ziehen nicht möglich.',
  split: 'Teilen nicht möglich.'
};
function niceError(err, type) {
  const msg = String((err && err.message) || err || 'Fehler');
  if (/WebAssembly\.Exception|^\d+$|^\[object/.test(msg)) return KERNEL_FAIL[type] || 'Der Geometriekern konnte diesen Schritt nicht ausführen.';
  if (/no edge was selected/i.test(msg)) return 'Gewählte Kanten nicht mehr gefunden';
  if (/fillet/i.test(msg)) return 'Verrundung nicht möglich (Radius zu groß?)';
  if (/chamfer/i.test(msg)) return 'Fase nicht möglich (Maß zu groß?)';
  if (/shell/i.test(msg)) return 'Schale nicht möglich (Wand zu dick?)';
  if (/^\d+$/.test(msg)) return 'Interner Fehler im Geometriekern';
  return msg;
}

/* ---------- Netz für die Anzeige ---------- */
/* Ein Netz kommt aus drei Quellen, in dieser Reihenfolge: Speicher-Cache des Arbeitsprogramms,
   Dauerspeicher im Browser, neu triangulieren. Der Dauerspeicher ist der Grund, warum dasselbe
   große Projekt nach dem Neuladen nicht wieder fünf Minuten braucht. */
async function meshBodies(list, stufe = 'fein', nachlassen = false) {
  // Was nicht im Speicher liegt, wird in einem Durchgang geholt und am Ende einer geschrieben.
  // Gezählt wird dabei jeder Zweig dieser Entscheidung – ohne diese Zahlen ist nicht zu
  // unterscheiden, ob Körpern der Schlüssel fehlt, ob der Dauerspeicher nichts hergibt, oder ob er
  // zwar einen Eintrag liefert, der aber kein brauchbares Netz enthält. Bei einer Baugruppe mit
  // 797 Körpern entscheidet genau das über 70 s Triangulation.
  const fehlend = [], zuSpeichern = [], volSchluessel = [];
  let ohneSchluessel = 0;
  /* Netze dieses Baus gegen Verdrängung schützen (siehe `cacheImportMesh`) und notieren, welche schon
     im Speicher lagen: fällt einer dieser Schlüssel beim Abarbeiten trotzdem weg, zählt das
     `netzVerdraengt` – der Beweis für die Kette, die 595 unnötige Triangulierungen erzeugt hat.
     Gleichzeitig zählt `ohneFeines`, wem eine feine Fassung fehlt – das entscheidet über die grobe
     Erstfassung, die eine große Baugruppe eher ins Bild bringt. */
  meshGeschuetzt = new Set();
  const schonImCache = new Set();
  let ohneFeines = 0;
  for (const b of list) {
    if (!b.meshCacheKey) { ohneSchluessel++; continue; }
    meshGeschuetzt.add(b.meshCacheKey);
    const imSpeicher = importMeshCache.get(b.meshCacheKey);
    if (imSpeicher) {
      schonImCache.add(b.meshCacheKey);
      if (imSpeicher.fein === false) ohneFeines++;
      // Nur ein Netz mit vorläufigem Wert braucht den genauen aus dem Vorrat.
      if (imSpeicher.part.volumeAusNetz) volSchluessel.push(VOL_PREFIX + b.meshCacheKey);
    } else {
      fehlend.push(NETZ_PREFIX + b.meshCacheKey);
      // Ob dieses Netz vorläufig ist, entscheidet sich erst beim Lesen – der kleine Wert wird
      // gleich mitgefragt, damit dafür kein eigener Durchgang durch den Dauerspeicher nötig ist.
      volSchluessel.push(VOL_PREFIX + b.meshCacheKey);
    }
  }
  pN('netzeOhneSchluessel', ohneSchluessel);
  if (PHASEN) {
    // Fingerabdruck der verwendeten Schlüssel, sortiert: zwei Bauten derselben Datei haben denselben
    // Fingerabdruck, sobald sich an der Zuordnung Körper -> Schlüssel nichts geändert hat.
    PHASEN.netzSchluessel = hashStr(list.map(b => b.meshCacheKey || '').sort().join('|'));
  }
  let gespeichert = new Map(), volVorrat = new Map();
  // Netze und Volumenwerte in demselben Durchgang fragen: die Werte sind winzig, und ein eigener
  // Lesevorgang pro Körper wäre an einer großen Baugruppe teurer als die Bestimmung selbst.
  const angefragt = fehlend.concat(volSchluessel);
  if (angefragt.length) {
    const tD = performance.now();
    gespeichert = await idbGets(angefragt);
    for (const k of [...gespeichert.keys()]) {
      if (!k.startsWith(VOL_PREFIX)) continue;
      volVorrat.set(k, gespeichert.get(k));
      gespeichert.delete(k);
    }
    pN('dbGefragt', fehlend.length);
    pN('dbGefunden', gespeichert.size);
    pN('dbFehlt', fehlend.length - gespeichert.size);
    pN('dbBestand', await idbCountNetz());
    pAdd('dbLesen', tD);
  }
  const parts = [];
  /* Körper, deren genaues Volumen erst nach der feinen Anzeige nachgeliefert wird (siehe
     `volumenVerfeinern`). Gesammelt wird hier, weil nur dieser Durchgang weiß, welche Netze gerade
     vorläufig gerechnet wurden oder mit einem vorläufigen Wert aus dem Bestand kommen. */
  const volumina = [];
  /* Feinheit für die Netze, die hier neu gerechnet werden. Erst nach dem Lesen des Dauerspeichers
     ist bekannt, wie vielen Körpern eine feine Fassung fehlt; ab NETZ_GROB_AB lohnt die grobe
     Erstfassung, die feine zieht danach nach (`netzVerfeinern`). Vorhandene feine Netze werden
     weiterbenutzt, was hier auch gewählt wird – die grobe Fassung nimmt jedes Netz an. */
  if (stufe === 'auto') {
    let offen = ohneFeines;
    for (const k of fehlend) if (!netzPasst(gespeichert.get(k), 'fein')) offen++;
    stufe = offen >= NETZ_GROB_AB ? 'grob' : 'fein';
  }
  if (PHASEN) PHASEN.netzStufe = stufe;
  let wartet = 0, abgabe = performance.now();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    /* Feinheit für diesen Körper: Körper ohne Schlüssel sind in keinem Bestand wiederzufinden, sie
       bekommen immer die feine Fassung und kommen im Nachtrag aus dem Vorrat dieses Baus. */
    const stufeB = b.meshCacheKey ? stufe : 'fein';
    let part = null, woher = 'neu', fein = stufeB === 'fein', vorher = null;
    const vorrat = netzFeinVorrat.get(b);
    if (vorrat) { part = vorrat; woher = 'bau'; }
    else if (b.meshCacheKey) {
      const hit = importMeshCache.get(b.meshCacheKey);
      if (hit && netzPasst(hit, stufe)) { part = hit.part; fein = hit.fein !== false; woher = 'speicher'; }
      // Kein passendes Netz, aber ein anderes: diese Beschreibung gehört zu derselben Form und kann
      // übernommen werden (siehe `meshBody`).
      else if (hit && hit.part) vorher = hit.part;
      // Zugriff als LRU werten, damit häufig sichtbare Baugruppen im Cache bleiben.
      if (hit) { importMeshCache.delete(b.meshCacheKey); importMeshCache.set(b.meshCacheKey, hit); }
      else if (schonImCache.has(b.meshCacheKey)) pCount('netzVerdraengt');
    }
    if (!part && b.meshCacheKey) {
      const stored = gespeichert.get(NETZ_PREFIX + b.meshCacheKey);
      if (netzPasst(stored, stufe)) {
        part = stored.part; fein = stored.fein !== false; woher = 'dauer';
        cacheImportMesh(b.meshCacheKey, part, fein);
      } else if (stored && stored.part) {
        // Da ist ein Netz, aber nur die grobe Fassung: für die erste Anzeige reicht sie, für die
        // endgültige nicht. Zählt mit, weil sonst nicht zu sehen ist, warum hier neu gerechnet wird.
        pCount('dbGrob');
        if (!vorher) vorher = stored.part;
      } else if (stored) {
        // Eintrag vorhanden, aber ohne brauchbares Netz (anderes Format, unvollständig geschrieben).
        // Zählt mit, weil der Fall sich sonst genauso anfühlt wie ein fehlender Eintrag.
        pCount('dbUnbrauchbar');
      }
    }
    if (!part) {
      const tM = performance.now();
      part = meshBody(b.shape, stufeB, vorher, nachlassen && stufeB === 'fein');
      pAdd('netze', tM);
      let bytes = partBytes(part);
      pLangsam(tM, b.meshCacheKey, bytes, stufeB);
      if (b.meshCacheKey) {
        part = cacheImportMesh(b.meshCacheKey, part, stufeB === 'fein');
        bytes = partBytes(part);
        if (bytes < NETZ_MAX) zuSpeichern.push([{ part, bytes, ts: Date.now(), fein: stufeB === 'fein' }, NETZ_PREFIX + b.meshCacheKey]);
      } else if (fein && stufe === 'grob') {
        // Ohne Schlüssel kein Bestand: die feine Fassung dieses Baus ist die einzige, die der
        // Nachtrag finden kann. Nur eintragen, wenn dieser Bau grob läuft – sonst ist es dieselbe.
        netzFeinVorrat.set(b, part);
      }
    }
    /* Körper mit vorläufigem Volumen kommen in die spätere genaue Bestimmung – auch die, deren Netz
       aus dem Bestand stammt, denn dessen Wert ist genauso vorläufig: der Dauerspeicher kennt nur
       den Wert, der beim Vernetzen gerechnet wurde. Was die grobe Fassung hier sammelt, verfällt –
       die feine rechnet den Wert ohnehin neu und meldet ihn dann. */
    if (part.volumeAusNetz) {
      /* Zuerst im Volumen-Vorrat nachsehen: derselbe Wert wurde bei einer früheren Öffnung dieser
         Datei schon bestimmt. Auf frisch aus dem Binärspeicher geholten Formen ist die Bestimmung
         weit teurer als auf gerade vernetzten (gemessen: über 13 min statt 24,8 s an derselben
         Baugruppe) – ohne diesen Schritt wiederholte sie sich bei jeder Rückkehr an die Datei. */
      const genau = b.meshCacheKey ? volVorrat.get(VOL_PREFIX + b.meshCacheKey) : null;
      if (genau != null) {
        /* Nebenbei die Zahl der Körper, deren Netzmasse deutlich daneben lag. Ohne sie ist nicht zu
           sehen, wie weit die vorläufige Masse in der Praxis führt – gemessen ist ein Körper mit
           über 300 % Abstand, und die Masse steht dann mit `≈` im Baum, bis der genaue Wert kommt. */
        if (part.volume != null && Math.abs(part.volume - genau) > 0.05 * Math.abs(genau)) pCount('volNetzAbw');
        part.volume = genau;
        delete part.volumeAusNetz;
        pCount('volAusDB');
      } else {
        pCount('volFehlt');
        volumina.push({ id: b.id, shape: b.shape, part, key: b.meshCacheKey });
      }
    }
    if (!fein) wartet++;
    pCount(woher === 'speicher' ? 'netzeAusCache' : woher === 'dauer' ? 'netzeAusDB' :
      woher === 'bau' ? 'netzeAusBau' : 'netzeNeu');
    if (!part.uid) part.uid = `${NETZ_SITZUNG}:${++netzSeq}`;
    parts.push({ ...part, id: b.id });
    // Dieser Körper ist abgearbeitet, sein Netz braucht nicht mehr geschützt zu werden und kann
    // den Platz für die folgenden freigeben.
    if (b.meshCacheKey) meshGeschuetzt.delete(b.meshCacheKey);
    /* Die Verfeinerung darf einen neuen Bau nicht aufhalten: zwischen zwei Körpern wird abgegeben,
       damit ein Abbruch ankommen kann. Ohne diese Abgabe wäre die Verfeinerung einer großen
       Baugruppe (gemessen 150 s) ein Block, in dem keine Änderung durchkäme. */
    if (nachlassen && performance.now() - abgabe > 30) {
      await new Promise(r => setTimeout(r, 0));
      abgabe = performance.now();
      if (netzAbbruch) { meshGeschuetzt = null; gespeichert.clear(); return { abgebrochen: true }; }
    }
  }
  meshGeschuetzt = null;
  if (PHASEN) PHASEN.netzWartet = wartet;
  if (zuSpeichern.length) {
    const tS = performance.now();
    // In Portionen schreiben, nicht in einem Vorgang: bei einer großen Baugruppe sind das hunderte
    // Netze, und ein einzelner großer Vorgang schlägt eher fehl – dann wäre alles verloren und die
    // nächste Öffnung wieder komplett neu zu triangulieren.
    let batch = [], batchBytes = 0, gesetzt = 0, fehl = 0, bytes = 0, verworfen = 0;
    const flush = async () => {
      if (!batch.length) return;
      if (await idbPuts(batch)) gesetzt += batch.length;
      else {
        // Abgelehnt wird fast immer aus Platzmangel. Älteste Netze wegwerfen und es noch einmal
        // versuchen – sonst bliebe genau die Arbeit hängen, die dieser Speicher sparen soll, und
        // zwar für alle künftigen Öffnungen.
        const alte = await idbListNetz();
        alte.sort((a, b) => a[0] - b[0]);
        const weg = [];
        let frei = 0;
        for (const [, k, b] of alte) { if (frei >= NETZ_FREI) break; weg.push(k); frei += b; }
        if (weg.length) { await idbDelete(weg); verworfen += weg.length; }
        if (await idbPuts(batch)) gesetzt += batch.length; else fehl += batch.length;
      }
      batch = []; batchBytes = 0;
    };
    for (const [wert, schluessel] of zuSpeichern) {
      batch.push([wert, schluessel]); batchBytes += wert.bytes; bytes += wert.bytes;
      if (batchBytes >= NETZ_BATCH) await flush();
    }
    await flush();
    pAdd('dbSichern', tS);
    pN('dbGesetzt', gesetzt); pN('dbFehl', fehl); pN('dbBytes', bytes); pN('dbVerworfen', verworfen);
    // Bestand danach: zusammen mit `dbBestand` davor und `dbGesetzt` zeigt das, ob neue Schlüssel
    // geschrieben wurden (Bestand steigt) oder dieselben überschrieben wurden (Bestand gleich).
    pN('dbBestandNach', await idbCountNetz());
  }
  gespeichert.clear();
  if (PHASEN) PHASEN.koerper = list.length;
  const t0 = performance.now();
  const nV = parts.reduce((a, p) => a + p.positions.length, 0), nI = parts.reduce((a, p) => a + p.index.length, 0), nE = parts.reduce((a, p) => a + p.edgePositions.length, 0);
  const positions = new Float32Array(nV), normals = new Float32Array(nV), index = new Uint32Array(nI), edgePositions = new Float32Array(nE);
  const faces = [], edges = [], bodiesOut = [];
  let oV = 0, oI = 0, oE = 0, zF = 0, zE = 0, verwiesen = 0;
  parts.forEach((p, bi) => {
    positions.set(p.positions, oV); normals.set(p.normals, oV);
    const base = oV / 3;
    for (let k = 0; k < p.index.length; k++) index[oI + k] = p.index[k] + base;
    edgePositions.set(p.edgePositions, oE);
    const f0 = zF, e0 = zE;
    // Hat die Seite dieses Körpernetz schon, bleiben seine Beschreibungen hier (siehe `seiteHat`)
    const verweis = !!(seiteHat && p.uid && seiteHat.has(p.uid));
    if (verweis) verwiesen++;
    else {
      p.faces.forEach(f => faces.push({ ...f, start: f.start + oI, body: bi }));
      p.edges.forEach(e => edges.push({ ...e, start: e.start + oE / 3, body: bi }));
    }
    zF += p.faces.length; zE += p.edges.length;
    const koerper = { id: p.id, uid: p.uid, bbox: p.bbox, volume: p.volume, faces: [f0, zF], edges: [e0, zE], tris: [oI, oI + p.index.length], verts: [oV / 3, (oV + p.positions.length) / 3], evs: [oE / 3, (oE + p.edgePositions.length) / 3] };
    if (verweis) koerper.ref = true;
    // Kennzeichnet ein Volumen aus der groben Netzfassung: Massen und Stückliste sind damit vorläufig.
    if (p.volumeAusNetz) koerper.volumeAusNetz = true;
    bodiesOut.push(koerper);
    oV += p.positions.length; oI += p.index.length; oE += p.edgePositions.length;
  });
  const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  parts.forEach(p => { for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], p.bbox[0][k]); bb[1][k] = Math.max(bb[1][k], p.bbox[1][k]); } });
  const vol = parts.every(p => p.volume != null) ? parts.reduce((a, p) => a + p.volume, 0) : null;
  const vNetz = parts.reduce((a, p) => a + (p.volumeAusNetz ? 1 : 0), 0);
  pAdd('mischen', t0);
  pN('netzVerwiesen', verwiesen);
  zuletztGesendet = new Set(bodiesOut.map(b => b.uid));
  // `delta`: faces/edges enthalten nur die Beschreibungen der neu geschickten Körper, `nFaces`/`nEdges` die Gesamtzahl
  const mesh = { positions, normals, index, edgePositions, faces, edges, bodies: bodiesOut, bbox: bb, volume: vol, volumeAusNetz: vNetz || undefined };
  if (verwiesen) { mesh.delta = true; mesh.nFaces = zF; mesh.nEdges = zE; }
  return { mesh, stufe, wartet, volumina };
}

/* Die feine Fassung nachziehen, Körper für Körper. Läuft außerhalb des Bauauftrags: die Oberfläche
   hat ihre Antwort und kann weiterarbeiten, sobald die grobe Fassung im Bild ist. Der Nachtrag kommt
   als eigene Nachricht (`typ: 'netz'`) mit der Kennung des Baus, zu dem er gehört – die Oberfläche
   verwirft ihn, wenn inzwischen ein anderer Bau gelaufen ist.
   Abbricht die Schleife, bleiben die groben Netze in den Speichern stehen (als grob markiert); der
   nächste Bau rechnet sie erneut grob und startet die Verfeinerung von vorn. Das ist gewollt:
   ohne diese Fortsetzung wäre eine große Baugruppe dauerhaft grob. */
/* Nach einem Bau eine kurze Pause, bevor die Verfeinerung den nächsten Körper anfängt: beim Bearbeiten kommen
   die Bauten dicht hintereinander (jede Wertänderung im Dialog, dann OK), und ein einzelnes Körpernetz ist
   unteilbar (gemessen bis 2,5 s). Ohne die Pause landete der nächste Bau zeitlich gewichtet meist in einem
   langen Netz (im Mittel 0,8 s „im Kern gewartet“). Die Pause bricht ab, sobald ein Bau kommt. */
const NETZ_PAUSE_MS = 1500;
async function netzVerfeinern(list, bauId) {
  netzAbbruch = false;
  const tP = performance.now();
  while (performance.now() - tP < NETZ_PAUSE_MS) {
    await new Promise(r => setTimeout(r, 50));
    if (netzAbbruch) return null;
  }
  const t0 = performance.now();
  const alt = PHASEN;
  const ph = newPhasen();
  PHASEN = ph;
  let r;
  seiteHat = new Set(zuletztGesendet);
  try { r = await meshBodies(list, 'fein', true); } finally { PHASEN = alt; seiteHat = null; }
  if (r.abgebrochen) return null;
  ph.gesamt = performance.now() - t0;
  const m = r.mesh;
  self.postMessage({
    id: null, typ: 'netz', ok: true,
    result: { mesh: m, phasen: ph, ms: Math.round(ph.gesamt), bauId },
  }, m ? [m.positions.buffer, m.normals.buffer, m.index.buffer, m.edgePositions.buffer] : []);
  /* Die feine Fassung ist im Bild, und genau hier ist der Augenblick, an dem es weitergeht: was
     jetzt noch aussteht, sind die genauen Volumen – gemessen 22,0 s von 161,0 s dieses Nachtrags,
     ohne dass das Bild daran hängt. Nachgeliefert wird in einer eigenen Nachricht; der Aufrufer nimmt
     sie nicht in `netzFeinLaeuft` auf, damit ein neuer Bau nicht auf diese Bestimmung warten muss. */
  return r.volumina && r.volumina.length ? r.volumina : null;
}

/* Genaue Volumen nach der feinen Netzfassung bestimmen und nachliefern (siehe `netzVerfeinern`).
   Der Wert kommt in das Netz zurück, das im Speicher liegt – ein Folgebau derselben Datei braucht
   die Bestimmung dann nicht noch einmal. Zwischen den Körpern wird abgegeben, damit ein Bau
   dazwischen durchkommt; ein neuer Bau oder ein neuer Nachtrag beendet diesen Durchgang.
   Geteilte Netze (Kopien und Einfügungen derselben Form) werden nur einmal gerechnet.
   Gemeldet wird in Abschnitten: an einer großen Baugruppe dauert dieser Durchgang über zwanzig
   Sekunden, und eine Masse, die nach und nach genau wird, ist besser als eine, die am Ende springt. */
let volumenLaeuft = 0, volumenAktiv = 0;
async function volumenVerfeinern(eintrag, bauId) {
  const folge = ++volumenLaeuft;
  volumenAktiv = folge;
  const t0 = performance.now();
  let abgabe = t0, melden = t0, gerechnet = 0, zuMerken = [];
  const ergebnis = [], erledigt = new Set();
  const senden = (fertig = false) => {
    if (!ergebnis.length) return;
    self.postMessage({
      id: null, typ: 'volumen', ok: true,
      result: { bauId, volumina: ergebnis.splice(0), ms: Math.round(performance.now() - t0), korper: gerechnet, fertig },
    });
    melden = performance.now();
  };
  /* Jeden bestimmten Wert sofort im Dauerspeicher merken: er hängt an der Form, nicht an diesem Bau.
     Was hier steht, findet die nächste Öffnung wieder – und die Bestimmung auf frisch gelesenen
     Formen ist der teuerste Weg, den es für denselben Wert gibt. */
  const merken = async () => {
    if (!zuMerken.length) return;
    if (await idbPuts(zuMerken)) pN('volGesetzt', zuMerken.length);
    zuMerken = [];
  };
  try {
    for (const e of eintrag) {
      /* Abbruch allein über die eigene Zählnummer: ein Bau erhöht sie (siehe `volumenLaeuft` dort),
         und ein weiterer Volumendurchgang ebenso. Über `netzAbbruch` dürfte dieser Durchgang gar nicht
         abbrechen – dieser Schalter wird bei jedem Bau gesetzt und nur von der Netzverfeinerung wieder
         gelöscht. Genau daran brach der Durchgang bei einer erneut geöffneten Datei sofort ab: dort
         läuft keine Netzverfeinerung, die ihn hätte löschen können (gemessen: 797 Körper mit
         vorläufigem Volumen, kein einziger genauer Wert). */
      if (folge !== volumenLaeuft) return;
      if (!erledigt.has(e.part)) {
        const vol = safeVolume(e.shape);
        if (vol == null) continue;
        e.part.volume = vol;
        delete e.part.volumeAusNetz;
        erledigt.add(e.part);
        gerechnet++;
        if (e.key) zuMerken.push([vol, VOL_PREFIX + e.key]);
      }
      ergebnis.push([e.id, e.part.volume]);
      const jetzt = performance.now();
      if (jetzt - abgabe > 30) {
        await new Promise(r => setTimeout(r, 0));
        abgabe = performance.now();
        if (zuMerken.length >= NETZ_READ) await merken();
        if (performance.now() - melden > 2000) senden();
      }
    }
    senden(true);
  } finally {
    /* Abbruch oder Ende: was schon gerechnet ist, geht in jedem Fall hinaus – die Oberfläche erkennt
       an der Baukennung, ob sie die Werte noch brauchen kann. Ebenso die Werte in den
       Dauerspeicher: ein abgebrochener Durchgang hat für die nächsten Öffnungen sonst nichts
       hinterlassen. */
    senden();
    try { await merken(); } catch (_) { /* Speicher nicht erreichbar: dann bleibt es beim Netzweg */ }
    if (volumenAktiv === folge) volumenAktiv = 0;
  }
}

/* Hüllbox ohne exakte Berandung. replicad fragt für `boundingBox` BRepBndLib::AddOptimal, und das
   ist bei großen Baugruppen der teuerste Einzelschritt eines Baus: an einer Baugruppe mit 797
   Körpern steckten 193 s von 406 s Netzerzeugung in dieser einen Anfrage (gemessen, weil sie
   außerhalb aller Messstellen lag). BRepBndLib::Add nimmt stattdessen die Stützpolygonen der
   Flächen und ist rund 50× schneller – Versuch mit 80 Körpern aus je drei gekrümmten Flächen:
   2,53 ms gegen 0,05 ms je Körper. Dafür ist die Hülle etwas zu groß (Zylinder: exakt, Torus:
   8 % zu groß). Sie dient hier nur der Größenabschätzung für die Vernetzungstoleranz, die
   ohnehin eine Faustzahl ist (0,0006 der Raumdiagonalen, nach oben begrenzt). Für die Anzeige
   gilt die Hülle des Netzes, siehe bbAusNetz. */
function bbAbschaetzung(shape) {
  try {
    const oc = R.getOC(), box = new oc.Bnd_Box();
    try {
      oc.BRepBndLib.Add(shape.wrapped, box, false);
      const lo = box.CornerMin(), hi = box.CornerMax();
      const bb = [[lo.X(), lo.Y(), lo.Z()], [hi.X(), hi.Y(), hi.Z()]];
      lo.delete(); hi.delete();
      // Eine leere Hülle steht im Kern auf „verkehrt herum“ (min > max); damit ist nichts anzufangen.
      if (!bb[0].concat(bb[1]).every(Number.isFinite) || bb[0].some((v, k) => v > bb[1][k])) return null;
      return bb;
    } finally { box.delete(); }
  } catch (_) { return null; }
}
/* Hüllbox aus den fertigen Anzeigedaten: Dreiecke und Kantenlinien zusammen. Die Dreiecke reichen
   bis höchstens der Vernetzungstoleranz an die Fläche heran, also ist diese Hülle auf höchstens
   diese Größe zu klein – für Ansichtsrahmen und Körperkästen die beste der beiden und dazu
   kostenlos, weil die Zahlenfelder schon vorliegen.
   Beide zusammen sind nötig: importierte Dateien enthalten oft Kanten ohne Fläche (Hilfsdrähte,
   Werkzeugpfade). Am Prüfstandteil NIST CTC-01 messen die Flächen nur 800×450 mm, die zugehörigen
   Kanten reichen bis 1 170×650 mm – wer nur die Dreiecke sieht, verliert die Hälfte des Bildes. */
function bbAusNetz(...felder) {
  const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const V of felder) {
    if (!V) continue;
    for (let k = 0; k + 2 < V.length; k += 3) {
      for (let a = 0; a < 3; a++) {
        const v = V[k + a];
        if (v < bb[0][a]) bb[0][a] = v;
        if (v > bb[1][a]) bb[1][a] = v;
      }
    }
  }
  return bb[0].every((v, k) => v <= bb[1][k]) ? bb : null;
}

/* Schwerpunkt der Dreiecke einer Fläche, flächengewichtet. Bei einer ebenen Fläche liegen alle
   Dreiecke exakt auf ihr – der Schwerpunkt ist damit der der Fläche (bis auf die Vernetzung ihrer
   Berandung). Das ist der Grund, warum diese Fläche den Kern nicht braucht: ihr Schwerpunkt ist die
   teuerste einzelne Anfrage der Flächenbeschreibung, eine Oberflächenintegration von rund 0,3 ms. */
function flaechenSchwerpunkt(m, g) {
  const V = m.vertices, I = m.triangles;
  let ax = 0, ay = 0, az = 0, aw = 0;
  for (let k = g.start; k + 2 < g.start + g.count; k += 3) {
    const i0 = I[k] * 3, i1 = I[k + 1] * 3, i2 = I[k + 2] * 3;
    const x0 = V[i0], y0 = V[i0 + 1], z0 = V[i0 + 2];
    const ex = V[i1] - x0, ey = V[i1 + 1] - y0, ez = V[i1 + 2] - z0;
    const fx = V[i2] - x0, fy = V[i2 + 1] - y0, fz = V[i2 + 2] - z0;
    const cx = ey * fz - ez * fy, cy = ez * fx - ex * fz, cz = ex * fy - ey * fx;
    const w = Math.hypot(cx, cy, cz);            // Zweifaches Dreiecksvolumen, der Faktor kürzt sich
    if (!(w > 0)) continue;
    ax += w * (x0 + V[i1] + V[i2]) / 3; ay += w * (y0 + V[i1 + 1] + V[i2 + 1]) / 3; az += w * (z0 + V[i1 + 2] + V[i2 + 2]) / 3;
    aw += w;
  }
  if (aw > 0) return [ax / aw, ay / aw, az / aw];
  if (g.count > 0) {
    // Nur entartete Dreiecke: immerhin der Mittelwert ihrer Ecken.
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (let k = g.start; k < g.start + g.count; k++) { const v = I[k] * 3; cx += V[v]; cy += V[v + 1]; cz += V[v + 2]; n++; }
    return [cx / n, cy / n, cz / n];
  }
  return null;
}

/* Volumen aus den fertigen Dreiecken: Summe der Spatprodukte über die Hülle, durch sechs geteilt.
   Für eine geschlossene, gleichmäßig orientierte Hülle ist das das Volumen der Vernetzung – dasselbe
   Verfahren wie die genaue Bestimmung des Kerns, nur auf den Dreiecken statt auf der Fläche. Gemessen
   am STEP-Prüfteil 0,007 % unter dem genauen Wert (feine Fassung) und 0,11 % (grobe), an einer Kugel
   0,30 % bzw. 1,16 %, an einem Prisma exakt 0 %, an einem Rohr 0,15 % bzw. 0,44 %. Kostet 0,05 ms
   gegenüber 10,6 ms für die genaue Bestimmung an demselben Prüfteil. Eine offene Fläche ergibt – wie
   die genaue Bestimmung – keinen Rauminhalt. */
function netzVolumen(m) {
  const V = m.vertices, T = m.triangles;
  let s = 0;
  for (let k = 0; k + 2 < T.length; k += 3) {
    const a = T[k] * 3, b = T[k + 1] * 3, c = T[k + 2] * 3;
    s += V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1])
      - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c])
      + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c]);
  }
  const v = Math.abs(s / 6);            // Richtung der Hülle darf keine Rolle spielen
  return Number.isFinite(v) ? v : null;
}

/* Der Mescher gibt für manche Flächen gar nichts zurück – kein Fehler, einfach ein leeres Netz.
   An der großen Baugruppe bleiben so 130 von 50 909 Flächen ohne einziges Dreieck, fast alles
   Kegel an Anschliffen und Fasen von 23 bis 413 mm². Sichtbar ist das als Loch: die Kanten dieser
   Flächen werden gezeichnet, ihre Fläche nicht. Nachgefragt hilft nur, beides grob zu machen – bei
   ×1 bis ×64 linearer Toleranz für sich allein kommt nichts heraus (Winkel 0,2 bis 1,0
   durchprobiert), ×4 zusammen mit Winkel 0,8 vernetzt 100 der 130; die übrigen 30 bleiben auch bei
   ×16 und Winkel 1,0 ohne Dreieck. Für sich und im Verband vernetzt der Kern dieselbe Fläche dabei
   auf 0,0000 mm gleich und mit derselben Richtung (gemessen an Körper 114: 129 und 150 Dreiecke,
   Richtungszeiger 1,000), also dürfen diese Dreiecke an das Netz des Körpers gehängt werden. */
function netzLuecken(faceList, m, tolStufe) {
  const vorhanden = new Map(m.faceGroups.map(g => [g.faceId, g.count]));
  let geflickt = 0, offen = 0;
  for (const f of faceList) {
    if ((vorhanden.get(f.hashCode) || 0) > 0) continue;
    let geschafft = false;
    for (const [tolF, winkel] of NETZ_NACHHOL) {
      let fm = null;
      try { fm = R.cast(f.wrapped).mesh({ tolerance: tolStufe * tolF, angularTolerance: winkel }); } catch (_) { fm = null; }
      if (!fm || !fm.triangles.length || !fm.faceGroups.length || fm.normals.length !== fm.vertices.length) continue;
      const versatz = m.vertices.length / 3;
      for (const v of fm.vertices) m.vertices.push(v);
      for (const v of fm.normals) m.normals.push(v);
      const start = m.triangles.length;
      for (const t of fm.triangles) m.triangles.push(t + versatz);
      m.faceGroups.push({ start, count: fm.triangles.length, faceId: f.hashCode });
      geschafft = true;
      break;
    }
    if (geschafft) geflickt++; else offen++;
  }
  return { geflickt, offen };
}

/* `vorher` ist das fertige Netz desselben Körpers in einer anderen Feinheit. Typ, Mittelpunkt,
   Normale, Zylinderangaben und Volumen hängen an der Form, nicht am Netz – nur `start`/`count`
   (wo die Dreiecke einer Fläche im Feld stehen) ändern sich mit der Feinheit. Wer ein Netz
   nachzieht, braucht diese Anfragen nicht noch einmal; die Flächenbeschreibung und das Volumen
   einer großen Baugruppe sind zusammen rund 120 s. Schlüssel ist `h`, der Flächen- bzw.
   Kantenbezug des Kerns. Ohne ihn (ältere gespeicherte Netze, Netzkörper mit tausenden Flächen)
   wird wie bisher alles neu beschrieben. */
function meshBody(body, stufe = 'fein', vorher = null, volVerschieben = false) {
  let t0 = performance.now();
  const bbS = bbAbschaetzung(body);
  // Zählt nur, wenn der schnelle Weg nicht da ist (etwa nach einer Erneuerung der vendierten
  // Bindungen) – dann fällt meshBody auf die exakte Anfrage zurück, die messbar langsam ist.
  if (!bbS) pCount('huelleFallback');
  const bb = bbS || body.boundingBox.bounds;
  pAdd('huelle', t0);
  const diag = len(sub(bb[1], bb[0])) || 1;
  const tolFein = Math.min(0.5, Math.max(0.005, diag * 0.0006));
  const stufeT = NETZ_TOL[stufe] != null ? NETZ_TOL[stufe] : NETZ_TOL.fein;
  const opts = { tolerance: tolFein * stufeT, angularTolerance: NETZ_WINKEL[stufe] != null ? NETZ_WINKEL[stufe] : NETZ_WINKEL.fein };
  // Die Netzerzeugung ist bei großen Baugruppen der mit Abstand teuerste Teil eines Baus.
  // Deshalb einzeln gemessen: Dreiecke der Flächen, Linien der Kanten, und die beiden
  // Beschreibungs-Schleifen, die je Fläche und je Kante den Kern fragen.
  t0 = performance.now();
  const m = body.mesh(opts);
  pAdd('gitter', t0);
  t0 = performance.now();
  const em = body.meshEdges(opts);
  pAdd('kantennetz', t0);
  /* Flächen ohne einziges Dreieck nachholen – vor der Hülle, damit ihre Dreiecke auch darin
     stehen. Netzkörper mit tausenden Flächen ausgenommen: dort ist eine fehlende Dreiecksgruppe
     nicht zu sehen, und die Nachfrage für jede Einzelfläche wäre teuer. */
  const faceList = body.faces;
  if (faceList.length <= 3000) {
    t0 = performance.now();
    const { geflickt, offen } = netzLuecken(faceList, m, opts.tolerance);
    pAdd('netzLuecken', t0);
    pN('fFlicken', geflickt); pN('fOhneNetz', offen);
  }
  // Die Hülle für die Anzeige folgt hier, nicht am Schluss: beide Auswege aus meshBody nutzen sie.
  // Beide Zahlenfelder zusammen, sonst fehlen Kanten ohne Fläche (siehe bbAusNetz).
  t0 = performance.now();
  const anz = bbAusNetz(m.vertices, em.lines) || bb;
  pAdd('huelle', t0);
  t0 = performance.now();
  const fg = new Map(m.faceGroups.map(g => [g.faceId, g]));
  const eg = new Map(em.edgeGroups.map(g => [g.edgeId, g]));
  if (faceList.length > 3000) return meshBodyFaceted(body, anz, m, em, faceList, fg, eg);
  const faces = [];
  const alt = vorher && vorher.faces && vorher.faces.length && vorher.faces[0].h != null
    ? new Map(vorher.faces.map(f => [f.h, f])) : null;
  for (const f of faceList) {
    const g = fg.get(f.hashCode);
    if (!g) continue;
    const type = f.geomType;
    const a = alt ? alt.get(f.hashCode) : null;
    // Übernehmen darf nur, was zum Flächenbezug und zum Flächentyp passt; sonst gilt der Notfallweg.
    if (a && a.type === type) { pCount('fGleich'); faces.push({ ...a, start: g.start, count: g.count }); continue; }
    if (type === 'PLANE') {
      // Ebene Fläche: ihr Schwerpunkt kommt aus den fertigen Dreiecken, gefragt wird nur noch die
      // Flächennormale (rund 10 µs statt rund 300 µs). Normale und Ebenengleichung bleiben so
      // berechnet wie vorher – die Auswahl von Flächen im Modell hängt an beiden.
      let center = flaechenSchwerpunkt(m, g);
      if (!center) { pCount('fNotfall'); pCount('fKern'); center = f.center.toTuple(); } else pCount('fEben');
      const n = f.normalAt().toTuple();
      faces.push({ h: f.hashCode, start: g.start, count: g.count, type, center, n, dist: dot(n, center), plane: { o: center, n, x: frameX(n), y: cross(n, frameX(n)) } });
      continue;
    }
    // Auch der Mittelpunkt gekrümmter Flächen kommt aus den fertigen Dreiecken. Der Kernweg
    // (`f.center` → Oberflächenintegration der Fläche) wächst mit der Fläche: an der großen
    // Baugruppe waren 35 413 nicht-ebene Flächen 22,6 s von 90 s eines Baus (2,3 ms je Fläche),
    // und sie sind damit der zweitgrößte Einzelposten. Der Dreiecksschwerpunkt ist der
    // Flächenschwerpunkt der Vernetzung; am Prüfteil weicht er an Zylindern und Kegeln höchstens
    // 0,04 mm vom Kernwert ab und kostet 0,002 ms. Für die Flächenauswahl zählt nur, dass er an
    // derselben Form über alle Bauten gleich bleibt – das leistet er besser als die Kernanfrage.
    let center = flaechenSchwerpunkt(m, g);
    if (center) pCount('fGewellt');
    else { pCount('fNotfall'); pCount('fKern'); center = f.center.toTuple(); }
    const info = { h: f.hashCode, start: g.start, count: g.count, type, center };
    if (type === 'CYLINDRE') {
      try { const ci = cylinderInfo(f); info.radius = ci.r; info.axis = ci.a; info.axisO = ci.o; info.internal = ci.internal; } catch (_) { /* egal */ }
      try { const uv = f.UVBounds; info.full = uv.uMax - uv.uMin >= 2 * Math.PI - 1e-3; } catch (_) { /* egal */ }
    }
    faces.push(info);
  }
  pAdd('flaecheninfo', t0);
  t0 = performance.now();
  const edges = [];
  const altE = vorher && vorher.edges && vorher.edges.length && vorher.edges[0].h != null
    ? new Map(vorher.edges.map(e => [e.h, e])) : null;
  for (const e of body.edges) {
    const g = eg.get(e.hashCode);
    if (!g) continue;
    const type = e.geomType;
    const a = altE ? altE.get(e.hashCode) : null;
    if (a && a.type === type) { pCount('eGleich'); edges.push({ ...a, start: g.start, count: g.count }); continue; }
    const info = { h: e.hashCode, start: g.start, count: g.count, type, mid: e.pointAt(0.5).toTuple(), p0: e.startPoint.toTuple(), p1: e.endPoint.toTuple() };
    if (type === 'LINE') info.dir = norm(sub(info.p1, info.p0));
    else { info.q1 = e.pointAt(0.25).toTuple(); info.q3 = e.pointAt(0.75).toTuple(); }
    edges.push(info);
  }
  pAdd('kanteninfo', t0);
  t0 = performance.now();
  /* Volumen: hängt an der Form, nicht am Netz – aber seine genaue Bestimmung ist teuer und wächst
     mit der Bauteilkomplexität (gemessen 10,6 ms am STEP-Prüfteil mit 139 Flächen, 0,1 ms an einem
     Prisma; an der großen Baugruppe 46,0 s von 314,6 s eines Kaltstarts, 58 ms je Körper). Die grobe
     Fassung nimmt es deshalb aus ihren eigenen Dreiecken – dasselbe Verfahren auf der Vernetzung,
     0,05 ms, gemessen 0,11 % unter dem genauen Wert. In der Erstanzeige einer Baugruppe liest das
     niemand ab (Masse, Stückliste und Größenfilter ändern sich im Promillebereich). Die feine Fassung
     übernahm den genauen Wert – bis gemessen wurde, dass dieser Schritt im Nachtrag der feinen Netze
     22,0 s von 161,0 s kostet (siehe `volumenVerfeinern`), ohne dass das Bild am Volumen hängt. */
  let vol = null, ausNetz = false;
  if (stufe === 'grob') {
    vol = netzVolumen(m);
    if (vol == null) vol = safeVolume(body); else { ausNetz = true; pCount('vAusNetz'); }
  } else if (vorher && vorher.volume != null && !vorher.volumeAusNetz) vol = vorher.volume;
  else if (volVerschieben) {
    /* Nachtrag bei einer großen Baugruppe: bis der Kern den genauen Wert nachliefert, steht der aus
       den feinen Dreiecken gewonnene. Er ist als vorläufig gekennzeichnet (`volumeAusNetz`, in der
       Anzeige mit `≈`), und wie weit er vom genauen Wert entfernt liegt, misst der Prüfstand. */
    vol = netzVolumen(m);
    if (vol == null) vol = safeVolume(body); else { ausNetz = true; pCount('vAusNetz'); }
  } else vol = safeVolume(body);
  pAdd('volumen', t0);
  // Aus den Zahlenfeldern des Kerns werden die Felder für die Anzeige. Bis hier war das
  // ungemessen; zusammen mit der Hülle ergibt es die Differenz, die in der Aufteilung fehlte.
  t0 = performance.now();
  const part = {
    positions: new Float32Array(m.vertices),
    normals: new Float32Array(m.normals),
    index: new Uint32Array(m.triangles),
    edgePositions: new Float32Array(em.lines),
    faces, edges,
    bbox: anz,
    volume: vol
  };
  if (ausNetz) part.volumeAusNetz = true;
  pAdd('umwandeln', t0);
  return part;
}

/* Netzkörper (z. B. aus STL) mit Tausenden ebener Dreiecksflächen: Flächen- und Kantendaten aus dem
   Anzeigenetz ableiten statt je Fläche den Kern zu fragen, und Kanten zwischen fast gleich gerichteten
   Flächen (< 20°) ausblenden – sonst sieht man nur noch Dreiecksgitter. */
function meshBodyFaceted(body, bb, m, em, faceList, fg, eg) {
  const V = m.vertices, N = m.normals, I = m.triangles, L = em.lines;
  const kp = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
  const ekey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const edgeNormals = new Map();
  const faces = [];
  let t0 = performance.now();
  for (const f of faceList) {
    const g = fg.get(f.hashCode);
    if (!g) continue;
    const type = f.geomType;
    if (type !== 'PLANE') {
      pCount('fKern');
      const info = { start: g.start, count: g.count, type, center: f.center.toTuple() };
      if (type === 'CYLINDRE') { try { const ci = cylinderInfo(f); info.radius = ci.r; info.axis = ci.a; info.internal = ci.internal; } catch (_) { /* egal */ } }
      // Kugel- und Torusradius (Torus: kleiner Radius = Rundungsradius) für die Mindestradius-Analyse
      else if (type === 'SPHERE' || type === 'TORUS') { try { const oc = R.getOC(), ad = new oc.BRepAdaptor_Surface(f.wrapped, true); info.radius = type === 'SPHERE' ? ad.Sphere().Radius() : ad.Torus().MinorRadius(); ad.delete(); } catch (_) { /* egal */ } }
      faces.push(info);
      continue;
    }
    const c = flaechenSchwerpunkt(m, g);
    let center;
    if (c) { pCount('fEben'); center = c; }
    else {
      // Notfall ohne Dreiecke dieser Fläche: dann doch die Kernanfrage.
      pCount('fNotfall'); pCount('fKern'); center = f.center.toTuple();
    }
    const v0 = I[g.start] * 3;
    const n = norm([N[v0], N[v0 + 1], N[v0 + 2]]);
    faces.push({ start: g.start, count: g.count, type, center, n, dist: dot(n, center), plane: { o: center, n, x: frameX(n), y: cross(n, frameX(n)) } });
    for (let k = g.start; k < g.start + g.count; k += 3) {
      const ks = [0, 1, 2].map(j => { const v = I[k + j] * 3; return kp(V[v], V[v + 1], V[v + 2]); });
      for (let j = 0; j < 3; j++) {
        const key = ekey(ks[j], ks[(j + 1) % 3]);
        const list = edgeNormals.get(key);
        if (list) list.push(n); else edgeNormals.set(key, [n]);
      }
    }
  }
  pAdd('flaecheninfo', t0);
  const COS = Math.cos(20 * Math.PI / 180);
  t0 = performance.now();
  const edges = [], lines = [];
  for (const e of body.edges) {
    const g = eg.get(e.hashCode);
    if (!g) continue;
    const s = g.start * 3, t = (g.start + g.count - 1) * 3;
    const p0 = [L[s], L[s + 1], L[s + 2]], p1 = [L[t], L[t + 1], L[t + 2]];
    const type = e.geomType;
    let info;
    if (type === 'LINE') {
      const ns = edgeNormals.get(ekey(kp(...p0), kp(...p1)));
      if (ns && ns.length >= 2 && ns.every(q => dot(q, ns[0]) > COS)) continue;
      info = { type, mid: mul(add(p0, p1), 0.5), p0, p1, dir: norm(sub(p1, p0)) };
    } else {
      info = { type, mid: e.pointAt(0.5).toTuple(), p0: e.startPoint.toTuple(), p1: e.endPoint.toTuple(), q1: e.pointAt(0.25).toTuple(), q3: e.pointAt(0.75).toTuple() };
    }
    info.start = lines.length / 3;
    info.count = g.count;
    for (let k = s; k < s + g.count * 3; k++) lines.push(L[k]);
    edges.push(info);
  }
  pAdd('kanteninfo', t0);
  t0 = performance.now();
  const vol = safeVolume(body);
  pAdd('volumen', t0);
  return {
    positions: new Float32Array(V), normals: new Float32Array(N), index: new Uint32Array(I),
    edgePositions: new Float32Array(lines), faces, edges, bbox: bb, volume: vol
  };
}

function safeVolume(body) {
  try { return volumenEigenschaften(body).volume; } catch (_) { return null; }
}
/* Volumen und Schwerpunkt. OCCs Standardintegration (feste Gauß-Ordnung je Fläche) ist auf Freiformflächen mit vielen
   Knoten grob falsch – die Kontur eines Generativen-Design-Ergebnisses (B-Spline, ~200 Knoten) kam auf +7 %. Dann die
   adaptive Gauß-Kronrod-Integration mit Fehlerschranke; analytische Körper (Ebene, Zylinder, Kegel, Kugel, Torus)
   bleiben beim schnellen Standardweg. */
const ANALYTISCH = new Set(['PLANE', 'CYLINDRE', 'CONE', 'SPHERE', 'TORUS']);
function volumenEigenschaften(shape) {
  let frei = false;
  try { frei = shape.faces.some(f => !ANALYTISCH.has(f.geomType)); } catch (_) { frei = false; }
  if (!frei) return R.measureShapeVolumeProperties(shape);
  const oc = R.getOC(), p = new oc.GProp_GProps();
  try {
    oc.BRepGProp.VolumePropertiesGK(shape.wrapped, p, 1e-6, false, true, false, false, false);
    const c = p.CentreOfMass(), com = [c.X(), c.Y(), c.Z()];
    c.delete();
    return { volume: p.Mass(), centerOfMass: com };
  } finally { p.delete(); }
}

/* Formkennung eines Körpers für „Ähnliche Komponenten suchen“: Größen, die sich beim Drehen und Verschieben nicht
   ändern – Volumen, Oberfläche, Zahl der Flächen/Kanten und die drei Hauptträgheitsmomente (Eigenwerte des
   Trägheitstensors um den Schwerpunkt, Dichte 1, aufsteigend) */
function formKennung(shape) {
  const oc = R.getOC(), g = new oc.GProp_GProps();
  try {
    oc.BRepGProp.VolumeProperties(shape.wrapped, g, false, false, false);
    // Trägheitstensor über Momente um Achsen durch den Schwerpunkt (gp_Mat ist in diesem Build nicht gebunden):
    // J_nn = nᵀ J n → Diagonale aus x, y, z, Nebenglieder aus den Diagonalen: J_xy = J_(x+y)/√2 − (J_xx + J_yy)/2
    const c = g.CentreOfMass();
    const mom = d => { const n = norm(d), dir = new oc.gp_Dir(n[0], n[1], n[2]), ax = new oc.gp_Ax1(c, dir); try { return g.MomentOfInertia(ax); } finally { ax.delete(); dir.delete(); } };
    const xx = mom([1, 0, 0]), yy = mom([0, 1, 0]), zz = mom([0, 0, 1]);
    const xy = mom([1, 1, 0]) - (xx + yy) / 2, xz = mom([1, 0, 1]) - (xx + zz) / 2, yz = mom([0, 1, 1]) - (yy + zz) / 2;
    c.delete();
    const m = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
    let nf = 0, ne = 0;
    try { nf = shape.faces.length; ne = shape.edges.length; } catch (_) { /* egal */ }
    return { V: Math.abs(g.Mass()), A: R.measureShapeSurfaceProperties(shape).area, nf, ne, I: eigenSym3(m).map(Math.abs).sort((a, b) => a - b) };
  } finally { g.delete(); }
}
/* Eigenwerte einer symmetrischen 3×3-Matrix (Jacobi-Drehungen) */
function eigenSym3(m) {
  const a = m.map(r => r.slice());
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-30 * (1 + a[0][0] * a[0][0] + a[1][1] * a[1][1] + a[2][2] * a[2][2])) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
      for (let k = 0; k < 3; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
    }
  }
  return [a[0][0], a[1][1], a[2][2]];
}

/* ---------- Nachrichten ---------- */
/* Prüfergebnis der letzten Bauantwort: sind die großen Netzpuffer übertragen (»ja«) oder kopiert
   (»nein«)? Siehe die Prüfung nach `postMessage`. */
let netzUebertragen = 'noch kein Bau';
/* Messschalter von außen (über `devEval`): kopiert die Beschreibungen einmal durch, um den Anteil
   am Zusammenschicken zu kennen. Im Regelbetrieb aus, weil es diese Arbeit doppelt tut. */
let netzKlonPruefen = false;
/* Nebenbau (Zeichnung, Stützen, Kollision, 3MF, Export): baut eine eigene Feature-Liste – das Bauteil einer Zeichnung,
   einen Schritt der Bewegungsstudie – und darf dabei den Stand des letzten Baus nicht überschreiben. `props`, `measure`,
   Auswahl und Abwicklung lesen `lastBodies` und die Metadaten des Baus, den die Oberfläche zeigt; ein Nebenbau, der
   nach einem Bau fertig wird (er wartet vorher auf Schriften und Importe), ließ sonst dessen Körper verschwinden
   („Körper nicht gefunden“). Der Rückruf muss ohne `await` auskommen, sonst greift ein Bau dazwischen auf den Zwischenstand. */
function nebenbau(payload, fn) {
  const alt = { lastBodies, compMap, sheetRule, joriginDefs, sheetMeta, frameMeta, weldMeta, partMeta, refMap, ptMap, heavyIds };
  compMap = new Map((payload.components || []).map(c => [c.id, c.bodies || []]));
  const instAlt = instanzListe;
  instanzListe = (payload.components || []).filter(c => c.instanz && Array.isArray(c.instanz.R)).map(c => ({ id: c.id, ...c.instanz }));
  if (payload.sheet) sheetRule = { ...DEFAULT_SHEET_RULE, ...payload.sheet };
  try { return fn(() => buildFeatures(payload.features, undefined, payload.inserts)); } finally { ({ lastBodies, compMap, sheetRule, joriginDefs, sheetMeta, frameMeta, weldMeta, partMeta, refMap, ptMap, heavyIds } = alt); instanzListe = instAlt; }
}
self.onmessage = async e => {
  const { id, type, payload } = e.data;
  try {
    await init();
    if (type === 'init') { self.postMessage({ id, ok: true, result: { ready: true } }); return; }
    /* Nur eine Antwort, sonst nichts: wer diese Anfrage vor einem Bauauftrag schickt, misst damit, wann
       der Worker wieder frei wird (siehe `build()` in `src/kernel.js`). */
    if (type === 'ping') { self.postMessage({ id, ok: true, result: true }); return; }
    /* Ein Bau wartet, bis eine laufende Netzverfeinerung wirklich steht: beide greifen auf `PHASEN`,
       `meshGeschuetzt` und die Körper des letzten Baus zu. Die Verfeinerung bemerkt den Abbruch an
       ihrem nächsten Abgabepunkt, also nach spätestens einem Körper. Fehlt sie, ist das kein Grund,
       diesen Bau scheitern zu lassen – die groben Netze stehen als Bestand. */
    if (type === 'build') {
      netzAbbruch = true;
      /* Ein Bau beendet auch einen laufenden Volumennachtrag: die Workerzeit gehört jetzt ihm, und
         die Werte dieses Baus werden ohnehin neu bestimmt. */
      volumenLaeuft++;
      if (netzFeinLaeuft) { try { await netzFeinLaeuft; } catch (_) { /* egal */ } }
      // Netze eines früheren Baus dürfen nicht in diesen hineinreichen (siehe `netzFeinVorrat`).
      netzFeinVorrat = new WeakMap();
    }
    let tAuftrag = 0;
    if (type === 'build') { PHASEN = newPhasen(); tAuftrag = performance.now(); }
    const tVor = performance.now();
    // jeder Auftrag, der Features baut (auch Zeichnung, Kollision, 3MF): Texte brauchen ihre Schrift, sonst fehlt
    // der Text-Körper, wenn vorher noch kein Bau sie geladen hat (gesehen im Befehlsrundgang unter Last)
    if (payload && payload.features) await ensureFonts(payload.features);
    if (payload && payload.features) await ensureImports(payload);
    if (type === 'build' && PHASEN) PHASEN.vorbereiten = performance.now() - tVor;
    if (type === 'build') {
      const t0 = performance.now();
      compMap = new Map((payload.components || []).map(c => [c.id, c.bodies || []]));
      instanzListe = (payload.components || []).filter(c => c.instanz && Array.isArray(c.instanz.R)).map(c => ({ id: c.id, ...c.instanz }));
      // Nicht mit der vorherigen Regel zusammenführen: sonst bleiben optionale
      // Werte wie cornerRelief beim Öffnen eines anderen Dokuments hängen.
      if (payload.sheet) sheetRule = { ...DEFAULT_SHEET_RULE, ...payload.sheet };
      const tBau = performance.now();
      const { bodies, status, sketches, copies } = buildFeatures(payload.features, payload.upTo, payload.inserts);
      const hidden = new Set(payload.hidden || []);
      const all = bodies.map(b => b.id);
      const shown = bodies.filter(b => !hidden.has(b.id) && !b.shape.isNull);
      if (PHASEN) PHASEN.bauwerk = performance.now() - tBau;
      /* Zweistufig auch bei einem Bau mit zurückgezogener Zeitleiste: `auto` entscheidet erst nach
         dem Lesen der Bestände, und hat jeder Körper ein feines Netz, kommt dabei genau wie bisher
         die feine Stufe heraus. Fehlt sie aber bei vielen – der Fall eines laufenden Nachtrags –,
         bringt die grobe Fassung das Bild sofort, und die feinen Netze ziehen nach. Vorhandene feine
         Netze werden weiterbenutzt, die Anzeigequalität wechselt also nicht; erzwungenes Fein hätte
         dagegen die ganze Vorarbeit des Nachtrags verworfen und sie innerhalb des Baus neu gerechnet. */
      seiteHat = new Set(payload.have || []);
      let netz;
      try { netz = shown.length ? await meshBodies(shown, 'auto') : { mesh: null, stufe: 'fein', wartet: 0 }; }
      finally { seiteHat = null; }
      if (!netz.mesh) zuletztGesendet = new Set();
      const mesh = netz.mesh;
      const tE = performance.now();
      const result = { status, mesh, sketches, bodies: all, copies, sheet: sheetMeta && (sheetMeta.base || sheetMeta.contour || sheetMeta.unfold) ? sheetMeta : null, frames: frameMeta.filter(x => all.includes(x.id)), welds: weldMeta.filter(x => all.includes(x.id)), parts: partMeta.filter(x => all.includes(x.id)), refMap: Object.fromEntries(refMap), ptMap, ms: Math.round(performance.now() - t0), phasen: PHASEN, netzStufe: netz.stufe, netzWartet: netz.wartet, bauId: id };
      const transfer = mesh ? [mesh.positions.buffer, mesh.normals.buffer, mesh.index.buffer, mesh.edgePositions.buffer] : [];
      /* Nur auf Anfrage (Messung, nicht Regelbetrieb): was das Kopieren der Beschreibungen kostet.
         Alles nicht Übertragene kopiert der Browser beim Zusammenschicken selbst – ob die Sekunden
         einer Antwort von den Netzpuffern oder von den Flächen- und Kantenbeschreibungen kommen,
         ist sonst nicht zu trennen. */
      if (netzKlonPruefen && mesh && PHASEN) {
        const tK = performance.now();
        structuredClone({ faces: mesh.faces, edges: mesh.edges, bodies: mesh.bodies });
        PHASEN.klonBeschreibungen = Math.round(performance.now() - tK);
      }
      if (PHASEN && mesh) {
        /* Was in diesem Ergebnis steckt. Die vier Puffer werden übertragen, alles andere wird kopiert –
           ohne diese Zahlen ist eine Übertragungszeit von Sekunden keiner der beiden Seiten zuzuordnen. */
        PHASEN.sendeBytes = transfer.reduce((a, bf) => a + bf.byteLength, 0);
        PHASEN.sendeFlaechen = mesh.faces.length;
        PHASEN.sendeKanten = mesh.edges.length;
        PHASEN.sendeKoerper = (mesh.bodies || []).length;
        /* Auch die Nachschlagetabellen gehören zum Ergebnis und werden kopiert: bei einer importierten
           Baugruppe stehen darin Einträge je Fläche und je Kante. */
        PHASEN.sendeNachschlagetabellen = refMap.size + Object.keys(ptMap).length;
      }
      self.postMessage({ id, ok: true, result }, transfer);
      /* Prüfen, ob die großen Puffer wirklich übertragen und nicht kopiert wurden: ein übertragener
         Puffer ist im Kern danach leer. Kopiert zu werden wäre bei den Netzen einer großen Baugruppe
         der teure Fall, und von außen ist er von einer langen Warteschlange nicht zu unterscheiden. */
      netzUebertragen = mesh ? (mesh.positions.buffer.byteLength === 0 ? 'ja' : 'nein') : 'kein Netz';
      if (PHASEN) {
        // Rechenarbeit und Zusammenschicken getrennt: `gesamt` war bisher durch nichts zu erklären.
        PHASEN.ergebnis = performance.now() - tE;
        PHASEN.gesamt = performance.now() - tAuftrag;
      }
      /* Die grobe Fassung ist im Bild – jetzt zieht die feine nach, außerhalb dieses Auftrags.
         `shown` sind dieselben Körper, ihre Formen bleiben über die Referenz lebendig. */
      if (netz.wartet && mesh) {
        const p = netzVerfeinern(shown, id);
        netzFeinLaeuft = p;
        p.then(
          volumina => {
            if (netzFeinLaeuft === p) netzFeinLaeuft = null;
            /* Die genauen Volumen laufen getrennt von der Netzfassung: sie gehören nicht zu dem
               Vorgang, auf den ein neuer Bau warten muss (`netzFeinLaeuft`). */
            if (volumina) volumenVerfeinern(volumina, id)
              .catch(err => console.warn('Volumennachtrag fehlgeschlagen:', err && err.message));
          },
          err => { if (netzFeinLaeuft === p) netzFeinLaeuft = null; console.warn('Netzverfeinerung fehlgeschlagen:', err && err.message); }
        );
      } else if (netz.volumina.length && mesh && payload.upTo == null) {
        /* Kein Nachtrag, aber vorläufige Volumen: die stammen aus dem Dauerspeicher, wo nur der Wert
           liegt, der beim Vernetzen gerechnet wurde – bei einer erneut geöffneten Datei ist das der
           Regelfall. Auch sie werden nach dem Bild genau bestimmt; ein neuer Bau unterbricht. Bei
           einer Vorschau beim Bearbeiten unterbleibt der Durchgang, dort gehört die Workerzeit dem
           nächsten Änderungsschritt. */
        volumenVerfeinern(netz.volumina, id)
          .catch(err => console.warn('Volumennachtrag fehlgeschlagen:', err && err.message));
      }
      return;
    }
    if (type === 'drawing') {
      const result = nebenbau(payload, bau => {
        cosmeticThreads = true;
        let built;
        try { built = bau(); } finally { cosmeticThreads = false; }
        const { bodies } = built;
        const hidden = new Set(payload.hidden || []);
        const shown = bodies.filter(b => !hidden.has(b.id));
        if (!shown.length) throw new Error('Es gibt keinen sichtbaren Körper für die Zeichnung');
        const light = shown.filter(b => !heavyIds.has(b.id)), heavy = shown.filter(b => heavyIds.has(b.id));
        const shape = light.length ? compoundOf(light.map(b => b.shape.clone())) : null;
        const views = projectViews(shape, payload.views || ['front', 'top', 'left', 'iso'], { section: payload.section, breakouts: payload.breakouts || {}, secs: payload.secs || {}, heavy: heavy.map(b => b.shape) });
        const bodyBoxes = shown.map(b => ({ id: b.id, bbox: bbOf(b.shape) }));
        return { views, bbox: allBounds(shown), bodies: bodyBoxes };
      });
      self.postMessage({ id, ok: true, result });
      return;
    }
    if (type === 'supports') {
      /* Stützstruktur für den 3D-Druck: Form berechnen und als Netz zurückschicken */
      const S = nebenbau(payload, bau => {
        const { bodies } = bau();
        const hidden = new Set(payload.hidden || []);
        const shown = bodies.filter(b => !hidden.has(b.id) && !b.shape.isNull);
        if (!shown.length) throw new Error('Es gibt keinen sichtbaren Körper.');
        return supportShape(shown, payload);
      });
      if (!S) { self.postMessage({ id, ok: true, result: { volume: 0, area: 0, bbox: null, vertices: null, triangles: null } }); return; }
      const m = S.mesh({ tolerance: Number(payload.tolerance) || 0.05, angularTolerance: 0.3 });
      const vertices = new Float32Array(m.vertices), triangles = new Uint32Array(m.triangles);
      self.postMessage({ id, ok: true, result: { volume: safeVolume(S) || 0, area: R.measureArea(S) || 0, bbox: bbOf(S), vertices, triangles } }, [vertices.buffer, triangles.buffer]);
      return;
    }
    if (type === 'interfere' || type === 'mesh3mf') {
      nebenbau(payload, bau => {
        const { bodies } = bau();
        const hidden = new Set(payload.hidden || []);
        const shown = bodies.filter(b => !hidden.has(b.id));
        if (type === 'mesh3mf') {
          // feines Netz je Körper für den 3D-Druck
          const tol = Number(payload.tolerance) || 0.01;
          const items = shown.map(b => { const m = b.shape.mesh({ tolerance: tol, angularTolerance: 0.1 }); return { id: b.id, vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles) }; });
          self.postMessage({ id, ok: true, result: { items } }, items.flatMap(it => [it.vertices.buffer, it.triangles.buffer]));
          return;
        }
        // Kollision: Schnittmenge aller Körperpaare mit überlappender Hüllbox. Die Hülle gehört vor die
        // Paarschleife: sonst steht sie für jedes Paar neu da, bei 797 Körpern 635 000 Mal, und die
        // genaue Fassung kostet an einer importierten Form rund 200 ms.
        const huellen = shown.map(b => bbGrob(b.shape));
        const hits = [];
        for (let i = 0; i < shown.length; i++) {
          for (let j = i + 1; j < shown.length; j++) {
            const A = shown[i], B = shown[j];
            if (!bbOverlap(huellen[i], huellen[j], -1e-6)) continue;
            let inter = null;
            try { inter = bool(A.shape.clone(), B.shape.clone(), 'intersect'); } catch (_) { inter = null; }
            const vol = inter ? safeVolume(inter) || 0 : 0;
            if (vol > 1e-6) {
              const m = inter.mesh({ tolerance: 0.05, angularTolerance: 0.3 });
              hits.push({ a: A.id, b: B.id, volume: vol, bbox: bbOf(inter), positions: Array.from(m.vertices), index: Array.from(m.triangles) });
            }
          }
        }
        self.postMessage({ id, ok: true, result: { hits, pairs: shown.length * (shown.length - 1) / 2 } });
      });
      return;
    }
    if (type === 'kontakt') {
      /* Kontaktsätze: ein Gelenk von `von` nach `nach` bewegen und an der ersten Berührung zwischen Gliedern
         eines Satzes anhalten. payload.joint = Gelenk-ID, payload.felder = { angle: [von, nach], offset: [...] } (linear
         gemeinsam), payload.saetze = [[[Körper-IDs eines Glieds], [Körper eines anderen Glieds], …], …]. Geprüft wird an
         Zwischenstellungen (höchstens 2° bzw. 0,5 mm Schritt, bis 24), am ersten Treffer per Halbierung bis 1/1000 des
         Schritts. Berührung ohne Durchdringung (Volumen ≤ 1e-6 mm³, wie Kollision) zählt nicht. Ergebnis: { s (0…1, erlaubter Anteil),
         werte, paar, schonAmStart }. */
      const P = payload, felder = Object.entries(P.felder || {});
      const wertBei = t => Object.fromEntries(felder.map(([k, [a, b]]) => [k, a + (b - a) * t]));
      const paarBei = t => nebenbau({ ...P, features: P.features.map(f => (f.id === P.joint ? { ...f, ...wertBei(t) } : f)) }, bau => {
        const { bodies } = bau();
        const form = new Map(bodies.map(b => [b.id, b.shape]));
        for (const satz of P.saetze || []) {
          for (let g1 = 0; g1 < satz.length; g1++) for (let g2 = g1 + 1; g2 < satz.length; g2++) {
            for (const a of satz[g1]) for (const b of satz[g2]) {
              const A = form.get(a), B = form.get(b);
              if (!A || !B || a === b || !bbOverlap(bbGrob(A), bbGrob(B), -1e-6)) continue;
              let inter = null;
              try { inter = bool(A.clone(), B.clone(), 'intersect'); } catch (_) { inter = null; }
              if (inter && (safeVolume(inter) || 0) > 1e-6) return [a, b]; // wie Prüfen → Kollision
            }
          }
        }
        return null;
      });
      const weit = felder.reduce((m, [k, [a, b]]) => Math.max(m, Math.abs(b - a) / (k === 'angle' ? 2 : 0.5)), 0);
      const n = Math.max(1, Math.min(24, Math.ceil(weit)));
      let ergebnis = { s: 1, werte: wertBei(1), paar: null, schonAmStart: false };
      if (paarBei(0)) ergebnis = { s: 1, werte: wertBei(1), paar: null, schonAmStart: true };
      else for (let k = 1; k <= n; k++) {
        const pk = paarBei(k / n);
        if (!pk) continue;
        let lo = (k - 1) / n, hi = k / n, paar = pk;
        for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2, pm = paarBei(m); if (pm) { hi = m; paar = pm; } else lo = m; }
        ergebnis = { s: lo, werte: wertBei(lo), paar, schonAmStart: false };
        break;
      }
      self.postMessage({ id, ok: true, result: ergebnis });
      return;
    }
    if (type === 'probe') {
      const pen = R.draw([0, 0]);
      const names = []; let o = Object.getPrototypeOf(pen); while (o && o !== Object.prototype) { names.push(...Object.getOwnPropertyNames(o)); o = Object.getPrototypeOf(o); }
      const ocKeys = payload && payload.oc ? Object.keys(R.getOC()).filter(k => new RegExp(payload.oc).test(k)) : undefined;
      self.postMessage({ id, ok: true, result: { pen: names, R: Object.keys(R).filter(k => /draw|spline|ellipse/i.test(k)), oc: ocKeys } });
      return;
    }
    if (type === 'devMeshStats') {
      // Nur Diagnose im Programm (cantcodecad.kernel.call('devMeshStats')): was liegt tatsächlich im
      // Dauerspeicher? Ohne diese Zahl ist ein „595 neu“ nicht von einem fehlgeschlagenen Schreiben
      // zu unterscheiden – beides sieht im Bau identisch aus.
      const liste = await idbListNetz();
      const bytes = liste.reduce((a, r) => a + (r[2] || 0), 0);
      const zeiten = liste.map(r => r[0]).filter(t => t).sort((a, b) => a - b);
      // Wie viele Einträge kein Netz enthalten, und welche Grund-Schlüssel (Datei + Lage) mit wie
      // vielen Körpern darin vorkommen. Beides trennt „Schlüssel geändert“ von „Eintrag kaputt“.
      const ohneNetz = liste.filter(r => !r[3]).length;
      // Wie viele Einträge nur die grobe Fassung enthalten. Das ist der Stand der nachziehenden
      // Verfeinerung: bleibt diese Zahl nach einem Bau hoch, ist die Verfeinerung nicht gelaufen.
      const grob = liste.filter(r => r[3] && !r[4]).length;
      const grund = new Map();
      for (const r of liste) { const b = String(r[1]).replace(/:\d+$/, ''); grund.set(b, (grund.get(b) || 0) + 1); }
      self.postMessage({ id, ok: true, result: {
        netze: liste.length, bytes, ohneNetz, grob,
        // Zahl der gefundenen genauen Volumenwerte: ohne diese Zahl ist eine erneute Öffnung, die
        // ihre Massen wiederfindet, nicht von einer zu unterscheiden, die sie neu rechnet.
        volVorrat: (await idbKeys(IDBKeyRange.bound(VOL_PREFIX, VOL_PREFIX + '\uffff'))).length,
        grundlagen: [...grund.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
        aeltestes: zeiten[0] || 0, neuestes: zeiten[zeiten.length - 1] || 0,
        imSpeicher: importMeshCache.size, speicherBytes: importMeshBytes
      } });
      return;
    }
    if (type === 'devClearVol') {
      // Nur für den Prüfstand: den Vorrat der genauen Volumenwerte leeren, die Netze aber behalten.
      // Ohne diesen Auftrag ist nicht messbar, ob ein Bau seine Massen wiederfindet oder neu
      // bestimmt – und der Weg „Netz aus dem Bestand, Wert muss neu gerechnet werden“ wäre unprüfbar.
      const keys = await idbKeys(IDBKeyRange.bound(VOL_PREFIX, VOL_PREFIX + '\uffff'));
      const geloescht = keys.length ? await idbDelete(keys) : true;
      self.postMessage({ id, ok: true, result: { werte: geloescht ? keys.length : 0 } });
      return;
    }
    if (type === 'testForgetImport') {
      // Nur für den Prüfstand: Importformen vergessen (Speicher und IndexedDB), ohne dass die Seite es
      // erfährt – der Fall, in dem der Kern den Dateitext nachfordern muss (NEED_DATA in ensureImports).
      const keys = (payload && payload.keys) || [];
      keys.forEach(k => importCache.delete(k));
      if (keys.length) await idbDelete(keys);
      self.postMessage({ id, ok: true, result: keys.length });
      return;
    }
    if (type === 'devClearMeshCache') {
      // Nur für den Prüfstand: ohne diesen Auftrag ist nicht prüfbar, ob ein Netz aus dem
      // Dauerspeicher kommt – der Speicher-Cache würde sonst immer zuerst treffen.
      importMeshCache.clear();
      importMeshBytes = 0;
      self.postMessage({ id, ok: true, result: true });
      return;
    }
    if (type === 'devClearNetz') {
      // Nur Diagnose im Programm (cantcodecad.kernel.call('devClearNetz')): den Dauerspeicher der Netze
      // leeren. Ohne das ist ein erster Bau im laufenden Programm nicht mehr zu messen – der
      // Dauerspeicher trifft sonst immer, und ein Neuladen der Seite löscht ihn gerade nicht.
      // Die genauen Volumenwerte gehören mit dazu: sonst fände ein „erster“ Bau seine Massen trotzdem
      // wieder und die Messung wäre keine erste Öffnung.
      const liste = await idbListNetz();
      const keys = liste.map(r => r[1]).concat(await idbKeys(IDBKeyRange.bound(VOL_PREFIX, VOL_PREFIX + '\uffff')));
      const geloescht = keys.length ? await idbDelete(keys) : true;
      self.postMessage({ id, ok: true, result: { netze: geloescht ? keys.length : 0, bytes: liste.reduce((a, r) => a + (r[2] || 0), 0) } });
      return;
    }
    if (type === 'devEval') {
      const fn = new (Object.getPrototypeOf(async function () {}).constructor)('R', 'oc', 'ctx', payload.code);
      const result = await fn(R, R.getOC(), { stlSolid, safeVolume, payload, TOPO_ORIG, loopCrossings, coilTool, buildFeatures, weldTool, weldWedge, freshRef, findSel, unfoldBody, bbOf, bbGrob, allBounds, allBoundsGrob, bodies: () => lastBodies, netzGrobAb: n => { NETZ_GROB_AB = n; return NETZ_GROB_AB; }, netzLaeuft: () => !!netzFeinLaeuft || volumenAktiv !== 0, netzLangsamWert: () => ({ ...netzLangsamWert }), uebertragen: () => netzUebertragen, netzKlonPruefen: v => { netzKlonPruefen = !!v; return netzKlonPruefen; }, netzTol: f => { NETZ_TOL.grob = f; return [NETZ_TOL.fein, NETZ_TOL.grob]; }, netzVerteilung: () => ({ ...netzVerteilung }), netzNachhol: l => { const alt = NETZ_NACHHOL.map(x => x.slice()); if (l !== undefined) { NETZ_NACHHOL.length = 0; (l || []).forEach(x => NETZ_NACHHOL.push(x)); } return alt; } });
      self.postMessage({ id, ok: true, result });
      return;
    }
    if (type === 'blechErkennen') {
      const b = lastBodies.find(x => x.id === payload.body);
      if (!b) throw new Error('Körper nicht gefunden');
      if (payload.sheet) sheetRule = { ...DEFAULT_SHEET_RULE, ...payload.sheet };
      self.postMessage({ id, ok: true, result: blechErkennen(b.shape) });
      return;
    }
    if (type === 'extrusionErkennen') {
      const b = lastBodies.find(x => x.id === payload.body);
      if (!b) throw new Error('Körper nicht gefunden');
      self.postMessage({ id, ok: true, result: extrusionErkennen(b.shape) });
      return;
    }
    if (type === 'faceOutline') {
      self.postMessage({ id, ok: true, result: faceOutline(payload.sel) });
      return;
    }
    if (type === 'sectionCurves') {
      // Schnittkurve: Körper des letzten Baustands mit der Skizzenebene schneiden, Randkanten liefern
      const pl = payload.plane, out = [];
      const bb = allBoundsGrob(lastBodies.length ? lastBodies : []);
      if (!lastBodies.length) throw new Error('Kein Körper vorhanden');
      const L = len(sub(bb[1], bb[0])) * 4 + 100;
      // Ebene durch die Skizze, groß genug für alle Körper, Mitte über dem Modell
      const c = add(bb[0], mul(sub(bb[1], bb[0]), 0.5));
      const cl = [dot(sub(c, pl.o), pl.x), dot(sub(c, pl.o), cross(pl.n, pl.x))];
      const face = R.drawRectangle(L, L).translate(cl[0], cl[1]).sketchOnPlane(makePlane(pl)).face();
      lastBodies.forEach(b => {
        let sec = null;
        try { sec = b.shape.intersect(face); } catch (_) { sec = null; }
        if (!sec) return;
        let edges = [];
        try { edges = sec.edges; } catch (_) { edges = []; }
        edges.forEach(e => {
          const P = t => e.pointAt(t).toTuple();
          const pts = []; for (let i = 0; i <= 48; i++) pts.push(P(i / 48));
          out.push({ type: e.geomType, p0: P(0), p1: P(1), mid: P(0.5), q1: P(0.25), q3: P(0.75), pts });
        });
      });
      self.postMessage({ id, ok: true, result: { edges: out } });
      return;
    }
    if (type === 'gdGeometrie') {
      /* Generatives Design: Körper der Studie (Beibehalten, Hindernis, Startform) und die Flächen der Kräfte und
         Abhängigkeiten auf die Ebene quer zur Schneidrichtung abbilden; Spanne entlang der Schneidrichtung für die Dicke */
      const e = GD_EBENEN[payload.achse] || GD_EBENEN.Z;
      const find = id => { const b = lastBodies.find(x => x.id === id); if (!b) throw new Error(`Körper ${id} gibt es nicht mehr`); return b.shape; };
      const rollen = {};
      let z0 = Infinity, z1 = -Infinity;
      for (const r of ['beibehalten', 'hindernis', 'startform']) {
        rollen[r] = (payload[r] || []).map(id => {
          const sh = find(id), [a, b] = gdSpanne(sh, e.n);
          if (r !== 'hindernis') { z0 = Math.min(z0, a); z1 = Math.max(z1, b); }
          return { id, flaechen: gdFussabdruck(sh, e), z: [a, b] };
        });
      }
      const ziele = {};
      for (const z of payload.ziele || []) {
        const hit = findSel(lastBodies, 'face', z.face, z.body);
        if (!hit) throw new Error('Eine Fläche einer Kraft oder Abhängigkeit gibt es nicht mehr');
        ziele[z.key] = gdFlaechenPunkte(hit.shape, hit.body.shape, e);
      }
      self.postMessage({ id, ok: true, result: { ebene: { o: [0, 0, 0], ...e }, z0, z1, ...rollen, ziele } });
      return;
    }
    if (type === 'isocurves') {
      /* Isokurven: je gekrümmter Fläche n − 1 Linien in u und in v, abgetastet auf der
         Trägerfläche; nur Stücke, deren Punkte auf der getrimmten Fläche liegen (Abstand zur Fläche ≈ 0), werden gezeigt –
         sonst liefen die Linien durch Bohrungen und über abgeschnittene Teile. Rückgabe: Strecken als Punktpaare. */
      const n = Math.max(2, Math.min(20, Math.round(Number(payload.n) || 8))), M = 32, hidden = new Set(payload.hidden || []);
      const oc = R.getOC(), seg = [];
      let faces = 0, skipped = 0;
      for (const b of lastBodies) {
        if (hidden.has(b.id) || !b.shape || b.shape.isNull) continue;
        for (const F of b.shape.faces) {
          if (F.geomType === 'PLANE') continue;
          // shortcut: höchstens 200 gekrümmte Flächen (je Fläche ≈ 450 Abstandsrechnungen), bei Bedarf Abtastung verfeinern
          if (faces >= 200) { skipped++; continue; }
          faces++;
          const ds = new oc.BRepExtrema_DistShapeShape();
          try {
            ds.LoadS1(F.wrapped);
            const on = p => { const v = R.makeVertex(p); try { ds.LoadS2(v.wrapped); ds.Perform(); return ds.IsDone() && ds.Value() < 1e-3; } finally { v.delete(); } };
            for (const dir of [0, 1]) for (let i = 1; i < n; i++) {
              let prev = null;
              for (let j = 0; j <= M; j++) {
                const p = F.pointOnSurface(dir ? j / M : i / n, dir ? i / n : j / M).toTuple(), ok = on(p);
                if (ok && prev) seg.push(...prev, ...p);
                prev = ok ? p : null;
              }
            }
          } finally { ds.delete(); }
        }
      }
      const positions = new Float32Array(seg);
      self.postMessage({ id, ok: true, result: { positions, faces, skipped } }, [positions.buffer]);
      return;
    }
    if (type === 'shapeSigs') {
      const out = [];
      for (const b of lastBodies) { try { out.push({ id: b.id, ...formKennung(b.shape) }); } catch (err) { out.push({ id: b.id, fehler: err.message || String(err) }); } }
      self.postMessage({ id, ok: true, result: { sigs: out } });
      return;
    }
    if (type === 'unfoldAll') {
      /* Alle Blechteile abwickeln (z. B. einer STEP-Baugruppe): je sichtbarem Körper die größte ebene Fläche als feste
         Fläche, Abwicklung aus der Körperform und dieselbe Gegenprobe wie „In Blech umwandeln“ (Fläche × Dicke ≈
         Volumen). Körper mit Freiformflächen oder ohne Gegenfläche gelten als „kein Blech“. */
      const rule = { ...DEFAULT_SHEET_RULE, ...(payload.rule || {}) }, ids = new Set(payload.ids || []), out = [];
      for (const b of lastBodies) {
        if (ids.size && !ids.has(b.id)) continue;
        try {
          const faces = b.shape.faces;
          if (faces.some(fc => !['PLANE', 'CYLINDRE', 'CONE'].includes(fc.geomType))) { out.push({ id: b.id, ok: false, error: 'Freiformflächen' }); continue; }
          let best = null, ba = 0;
          faces.forEach(fc => { if (fc.geomType !== 'PLANE') return; const a = R.measureArea(fc); if (a > ba) { ba = a; best = fc; } });
          if (!best) { out.push({ id: b.id, ok: false, error: 'keine ebene Fläche' }); continue; }
          const { zones: _z, frame: _f, kerfs, ...uf } = unfoldSheet(b.shape, best, rule);
          const vK = safeVolume(b.shape) || 0, vA = flaecheAbwicklung(uf) * uf.t;
          if (!(vK > 0) || Math.abs(vA - vK) > 0.15 * vK) { out.push({ id: b.id, ok: false, error: `kein Blech gleicher Dicke (${Math.round(100 * vA / (vK || 1))} %)` }); continue; }
          out.push({ id: b.id, ok: true, flat: { ...uf, kerfs } });
        } catch (err) { out.push({ id: b.id, ok: false, error: String((err && err.message) || err) }); }
      }
      self.postMessage({ id, ok: true, result: { teile: out } });
      return;
    }
    if (type === 'props') {
      // Eigenschaften eines Körpers: Volumen, Oberfläche, Schwerpunkt, Hüllbox
      const b = lastBodies.find(x => x.id === payload.id);
      if (!b) throw new Error('Körper nicht gefunden');
      const vp = volumenEigenschaften(b.shape), sp = R.measureShapeSurfaceProperties(b.shape), bb = bbOf(b.shape);
      let faces = 0, edges = 0;
      try { faces = b.shape.faces.length; edges = b.shape.edges.length; } catch (_) { /* egal */ }
      self.postMessage({ id, ok: true, result: { volume: vp.volume, com: vp.centerOfMass, area: sp.area, bbox: bb, faces, edges } });
      return;
    }
    if (type === 'measure') {
      self.postMessage({ id, ok: true, result: { items: measureSel(payload.sels) } });
      return;
    }
    if (type === 'export') {
      const blob = nebenbau(payload, bau => {
        const { bodies } = bau();
        const hidden = new Set(payload.hidden || []);
        const shown = bodies.filter(b => !hidden.has(b.id));
        if (!shown.length) throw new Error('Es gibt keinen sichtbaren Körper zum Exportieren');
        const body = compoundOf(shown.map(b => b.shape));
        return payload.format === 'step'
          ? body.blobSTEP()
          : body.blobSTL({ binary: true, tolerance: payload.tolerance || 0.01, angularTolerance: 0.1 });
      });
      const buf = await blob.arrayBuffer();
      self.postMessage({ id, ok: true, result: { buf } }, [buf]);
      return;
    }
    throw new Error('Unbekannter Auftrag: ' + type);
  } catch (err) {
    // Anforderung des Dateitexts unverändert weitergeben (die Seite erkennt sie am Vorsatz)
    const raw = String((err && err.message) || '');
    self.postMessage({ id, ok: false, error: raw.startsWith('NEED_DATA:') ? raw : niceError(err) });
  }
};
