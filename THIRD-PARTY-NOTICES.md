# Fremdbestandteile und Lizenzen

cantcodecad nutzt die folgenden Bibliotheken und Schriften. Sie liegen unverändert im Ordner `vendor/` und werden
zur Laufzeit von dort geladen (kein Netzzugriff). Bei Weitergabe von cantcodecad (auch als `cantcodecad.exe`) gehören
diese Datei und die Lizenztexte dazu.

| Bestandteil | Version | Ordner | Lizenz |
|---|---|---|---|
| Open CASCADE Technology (Geometriekern), gebaut als WebAssembly in **replicad-opencascadejs** | 1.1.0 | `vendor/jsdelivr/npm/replicad-opencascadejs@1.1.0/` | GNU LGPL 2.1 mit Open-CASCADE-Ausnahme |
| replicad (JavaScript-Schnittstelle zu OpenCASCADE) | 1.1.0 | `vendor/jsdelivr/npm/replicad@1.1.0/` | MIT |
| PlaneGCS (Skizzen-Solver aus FreeCAD), Paket @salusoft89/planegcs | 1.3.0 | `vendor/jsdelivr/npm/@salusoft89/planegcs@1.3.0/` | GNU LGPL 2.1 |
| three.js (3D-Darstellung) | 0.185.1 | `vendor/jsdelivr/npm/three@0.185.1/` | MIT |
| opentype.js (Schriften für Text in Skizzen) | 1.3.4 | `vendor/jsdelivr/npm/opentype.js@1.3.4/` | MIT |
| nasjidwg (DWG-Dateien lesen und schreiben, für „Als DWG speichern“) | 0.18.0 | `vendor/jsdelivr/npm/nasjidwg@0.18.0/` | MIT (enthält von Unicode generierte Zeichen-Zuordnungen, Unicode-Lizenz) |
| DejaVu Fonts | 2.37 | `vendor/jsdelivr/npm/dejavu-fonts-ttf@2.37.3/` | Bitstream-Vera-Lizenz (frei), Änderungen gemeinfrei |
| IBM Plex Sans / IBM Plex Mono | – | `vendor/gstatic/s/` | SIL Open Font License 1.1 |
| Desktop-Hülle: Tauri und Rust-Crates (z. B. tiny_http) | siehe `desktop/Cargo.lock` | `desktop/` | MIT bzw. Apache 2.0 |

## LGPL-Bibliotheken (OpenCASCADE, PlaneGCS)

- Sie werden als eigene, austauschbare Dateien geladen (`replicad_single.wasm`/`.js`, `planegcs_dist`), nicht in
  cantcodecads eigenen Code eingebaut. Wer eine andere oder geänderte Fassung verwenden will, ersetzt die Datei im
  jeweiligen `vendor/`-Ordner.
- Quelltexte: Open CASCADE <https://dev.opencascade.org> bzw. <https://github.com/Open-Cascade-SAS/OCCT>,
  replicad-opencascadejs <https://github.com/sgenoud/replicad>, PlaneGCS <https://github.com/Salusoft89/planegcs>.
- cantcodecads eigener Code ist davon getrennt und nicht an die LGPL gebunden.

## nasjidwg (DWG-Export)

- Reine TypeScript-Bibliothek ohne Nativerweiterung und ohne WebAssembly; sie wird erst beim DWG-Export geladen und
  holt sich aus `dist/` nur, was dafür nötig ist (der DXF-Leser und der DWG-Schreiber für R12). Der Rest des Ordners
  liegt für spätere Erweiterungen bereit (DWG lesen, R2000 schreiben).
- Der mitgelieferte Ordner `dist/` ist unverändert, nur die Typangaben (`.d.ts`) und `cli.js` sind weggelassen.
- NOTICE.txt weist aus, dass `text/dbcs.js` und `text/codepages.js` aus veröffentlichten Unicode-Zuordnungstabellen
  erzeugt sind (Unicode-Lizenz, frei). Die Bibliothek selbst steht unter MIT.

## Lizenztexte (Ordner `licenses/`, am 14.10.2026 von den offiziellen Quellen geladen)

| Datei | Gilt für | Quelle |
|---|---|---|
| `LGPL-2.1.txt` | Open CASCADE (replicad-opencascadejs) | gnu.org |
| `OCCT-LGPL-Ausnahme.txt` | Open CASCADE (Ausnahme zur LGPL 2.1) | github.com/Open-Cascade-SAS/OCCT |
| `planegcs-LGPL-2.1.txt` | PlaneGCS (mitgelieferte Fassung, gleicher Text) | github.com/Salusoft89/planegcs |
| `replicad-MIT.txt` | replicad | github.com/sgenoud/replicad |
| `three.js-MIT.txt` | three.js | github.com/mrdoob/three.js |
| `opentype.js-MIT.txt` | opentype.js | github.com/opentypejs/opentype.js |
| `nasjidwg-MIT.txt`, `nasjidwg-NOTICE.txt` | nasjidwg (NOTICE nennt die Unicode-Zuordnungsdaten) | npmjs.com/package/nasjidwg |
| `IBM-Plex-OFL-1.1.txt` | IBM Plex Sans/Mono | github.com/IBM/plex |
| `DejaVu-Fonts.txt` | DejaVu Fonts | github.com/dejavu-fonts/dejavu-fonts |

Die Desktop-Hülle (Tauri, Rust-Crates) ist MIT/Apache-2.0; ihre Lizenzen stehen in den Crates (`cargo` zeigt sie an).
Bei einem Versionswechsel einer Bibliothek die Tabelle oben und den Lizenztext prüfen.
