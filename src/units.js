// cantcodecad – Einheiten und Nachkommastellen der Anzeige (Einstellungen → Einheiten) „Voreinstellungen →
// Einheiten und Werteanzeige“. Intern bleibt alles in mm und Grad; umgerechnet wird nur beim Anzeigen und Eintippen:
// Feature-Dialoge, Skizzenmaße und -vorschau, Messen, Eigenschaften im Browser, Massenmittelpunkt, Statusleiste.
// Blechregeln, Verschachtelung und Zeichnungsblätter bleiben in mm (Fertigung, Normzeichnung).
// Eingabe (params.js evalLen): eine Zahl ohne Einheit gilt als Länge in der gewählten Einheit („2“, „60/2“,
// „breite + 5“), als Faktor bleibt sie Zahl („breite * 2“); „5 mm“ oder „1 in“ wie geschrieben; Parameter sind mm.
// Gespeicherte Ausdrücke bekommen die Einheit ausgeschrieben („breite + 5 in“), sie bedeuten in jeder Anzeige dasselbe.
//
// Ein Ausdruck hat nicht nur einen Wert, sondern auch eine Größe: Zahl, mm, mm², mm³, Grad, mm⁻¹ … Aufgeschrieben in
// params.js als Kette von Basis und ganzzahliger Potenz ([['mm',2]] für mm²), intern immer auf mm und Grad bezogen –
// „5 cm“ ist 50 mit Größe mm. Das entscheidet, was eine kahl geschriebene Zahl in einem Feld bedeutet (in einem
// Feld, das mm² erwartet, ist „2“ = 2 mm²), und dass „breite + breite*tiefe“ ein Fehler ist statt einer stillen
// Zahl. Anzeigeeinheit und Größe sind verschieden: die Einheit rechnet um, die Größe prüft.
import { evalLen, isExpr, U_LEN } from './params.js';
import { DEC } from './i18n.js';

const KEY = new URLSearchParams(location.search).has('test') ? 'cc.prefs.test' : 'cc.prefs';
export const LEN_UNITS = [['mm', 'mm', 1], ['cm', 'cm', 10], ['m', 'm', 1000], ['in', 'in', 25.4]];
export const DECIMALS = ['auto', 0, 1, 2, 3, 4, 5, 6];

const P = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } })();
const prefU = LEN_UNITS.find(u => u[0] === P.unit) || LEN_UNITS[0];
/* Voreinstellung (Einstellungen → Einheiten): gilt für neue Dokumente und Dokumente ohne eigene Einheit */
export const PREF_UNIT = prefU[0];
const decLen = DECIMALS.includes(P.decLen) ? P.decLen : 'auto', decAng = DECIMALS.includes(P.decAng) ? P.decAng : 'auto';
/* Anzeigeeinheit; UF = Faktor: 1 Anzeigeeinheit = UF mm. „let“: die anderen Module sehen über die Importbindung
   immer den aktuellen Wert, auch nach setDocUnit. */
export let UNIT, UF, DEFAULT_DISPLAY;
/* „Automatisch“ = wie bisher je Stelle; bei größeren Einheiten entsprechend mehr Stellen (2 Stellen in mm ≈ 3 in cm/in) */
let extra;
function setze(u) {
  UNIT = u[0]; UF = u[2]; extra = Math.round(Math.log10(UF));
  /* nichts umzurechnen: bisherige Anzeige unverändert */
  DEFAULT_DISPLAY = UF === 1 && decLen === 'auto' && decAng === 'auto';
}
setze(prefU);
/* Dokumenteinstellungen → Einheiten: Einheit des offenen Dokuments, ohne Angabe die Voreinstellung.
   Rückgabe true, wenn sich die Anzeigeeinheit geändert hat (dann neu zeichnen). */
export function setDocUnit(u) {
  const n = LEN_UNITS.find(x => x[0] === u) || prefU;
  if (n[0] === UNIT) return false;
  setze(n);
  return true;
}

function fmtNumber(x, d) {
  if (x == null || !isFinite(x)) return '–';
  const m = 10 ** d, r = Math.round(x * m) / m;
  return String(Object.is(r, -0) ? 0 : r).replace('.', DEC);
}
/* Länge in mm → Zahl in der Anzeigeeinheit (ohne Einheit); d = Stellen, die die Stelle bei mm zeigen würde */
export function fmtLen(mm, d = 2) { return fmtNumber(mm / UF, decLen === 'auto' ? d + extra : decLen); }
/* mit Einheit: „12,5 mm“ */
export function fmtLenU(mm, d = 2) { return `${fmtLen(mm, d)} ${UNIT}`; }
export function fmtArea(mm2, d = 2) { return `${fmtNumber(mm2 / UF / UF, decLen === 'auto' ? d + 2 * extra : decLen)} ${UNIT}²`; }
/* Volumen: bei mm wie bisher in cm³ */
export function fmtVol(mm3, d = 2) {
  if (UF === 1) return `${fmtNumber(mm3 / 1000, decLen === 'auto' ? d : decLen)} cm³`;
  return `${fmtNumber(mm3 / UF ** 3, decLen === 'auto' ? d + 2 * extra : decLen)} ${UNIT}³`;
}
export function fmtAng(deg, d = 1) { return fmtNumber(deg, decAng === 'auto' ? d : decAng); }

/* Eingabefelder: Wert in mm → Text in der Anzeigeeinheit (Punkt als Dezimalzeichen wie bisher in den Feldern) */
export function lenToField(mm) { const v = Number(mm); return isFinite(v) ? String(Math.round(v / UF * 1e6) / 1e6) : String(mm ?? ''); }
/* Eingetippte Länge → { v in mm, expr: zu speichernder Ausdruck oder null (nur Zahlen, wird als Wert gespeichert) }.
   want ist die Größe, die das Feld erwartet (Standard: Länge); eine Zahl ohne Einheit gilt in ihr, „2“ in einem
   mm²-Feld ist also 2 mm², und ein Ausdruck mit anderer Größe wird abgelehnt. */
export function parseLen(text, vars = {}, want = U_LEN) {
  const r = evalLen(text, vars, UF, UNIT, want);
  return { v: r.v, expr: isExpr(text) ? r.expr : null };
}
