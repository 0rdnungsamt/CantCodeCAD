# cantcodecad

Parametrisches 3D-CAD, das lokal im Browser oder als Desktop-Programm läuft – ohne Cloud, ohne Konto, ohne Netzzugriff
zur Laufzeit. Schwerpunkte: Blech und Laserzuschnitt (Abwicklung, DXF, Verschachtelung), Stahlbau (Rahmen, Schweißnähte,
Festigkeit), Baugruppen mit Gelenken, Zeichnungen, Simulation und generatives Design. Oberfläche auf Deutsch und Englisch.

## Starten

- **Windows, Browser:** `cantcodecad starten.bat` – startet den kleinen lokalen Server (`tools/server.ps1`) und öffnet
  `http://localhost:8765/`.
- **Andere Systeme:** jeden statischen Webserver auf diesen Ordner richten; Speichern im Projektordner und die
  Windows-Dateidialoge brauchen den mitgelieferten Server.
- **Desktop-Programm:** `desktop/` (Tauri 2), gebaut mit `cantcodecad Desktop bauen.bat` bzw. `cantcodecad Installer bauen.bat`.

## Aufbau

| Teil | Ort |
|---|---|
| Geometriekern (OpenCASCADE über replicad, im Web Worker) | `src/kernel-worker.js` |
| Oberfläche, Dokumentmodell, Skizzen-Editor | `src/`, `src/doc.js`, `src/sketch/` |
| Simulation, Topologieoptimierung | `src/sim/` |
| Lokaler Server (Windows) / Desktop | `tools/server.ps1`, `desktop/` |
| Anbindung an KI-Assistenten über MCP | `tools/mcp/`, `docs/claude-anbindung.md` |
| Beispiele | `Projekte/Beispiele/` |
| Fremdbibliotheken (alle lokal) | `vendor/`, Lizenzen in `THIRD-PARTY-NOTICES.md` und `licenses/` |

## Prüfen

`node tools/pruefen.mjs` startet den Server auf Port 8766 und Chrome/Edge ohne Fenster und lässt drei Prüfstände
laufen: den Geometriekern gegen `tests/referenz.json`, die Bedienabläufe (`tests/ui.js`) und einen Rundgang durch alle
Befehle. Einzeln: `node tools/pruefen.mjs kern`, `ui` oder `rundgang`, Auswahl mit `--nur=Text`.
Im Browser: `http://localhost:8766/tests/`.

## Lizenz

MIT, siehe `LICENSE`. Die Bibliotheken in `vendor/` stehen unter ihren eigenen Lizenzen (u. a. OpenCASCADE und
PlaneGCS unter LGPL 2.1, three.js und replicad unter MIT), siehe `THIRD-PARTY-NOTICES.md`.
