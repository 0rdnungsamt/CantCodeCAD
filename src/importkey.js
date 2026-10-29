// cantcodecad – Schlüssel importierter Dateien, gemeinsam für Seite und Kern.
// Der Kern legt Importformen, Netze und Volumen unter diesem Schlüssel ab (Speicher und IndexedDB).
// Die Seite bildet denselben Schlüssel, damit sie den Dateitext nur einmal schicken muss (siehe
// `Kernel.prep` in src/kernel.js). Beide Seiten müssen exakt gleich rechnen, sonst treffen die
// Dauerspeicher nicht mehr.

/* Stichproben-Prüfsumme: Länge + FNV-1a über höchstens ~50 000 gleichmäßig verteilte Zeichen
   (bei 100 MB sonst spürbar). Unverändert aus dem Kern übernommen. */
export function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i += Math.max(1, Math.floor(str.length / 50000))) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return `${str.length}:${h >>> 0}`; }
/* Schlüssel eines Import-Features: von der Seite mitgegeben (`dataKey`) oder aus dem Dateitext */
export const importKey = f => f.dataKey || `${f.format}:${hashStr(String(f.data || ''))}`;
