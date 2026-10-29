# Claude-Anbindung (MCP)

Mit der Claude-Anbindung konstruiert Claude direkt im offenen cantcodecad-Dokument – aus der Claude-App (Claude Desktop)
oder aus Claude Code. Beispiel: „Platte 200 × 100 × 8 mit vier Bohrungen ⌀ 9, je 15 mm vom Rand“. Claude legt Skizze
und Extrusion an, misst nach und schaut sich das Ergebnis als Bild an. Alles landet in der Zeitleiste und lässt sich
wie jede andere Änderung bearbeiten oder rückgängig machen.

## So hängt es zusammen

```
Claude-App / Claude Code ──stdio (MCP)──► tools/mcp/cantcodecad-mcp.mjs ◄──127.0.0.1:8790── cantcodecad (offen)
```

- Der MCP-Server ist ein Node-Skript ohne Fremdpakete. Claude startet es selbst.
- cantcodecad holt Aufträge beim Server ab (lange Abfrage) und schickt die Ergebnisse zurück. cantcodecad geht dabei
  nicht ins Netz – nur an den eigenen Rechner (127.0.0.1). Ins Internet geht nur die Claude-App.
- Voraussetzung: Node.js (ab Version 18) ist installiert.

## Einrichten

1. In cantcodecad: **Einstellungen → Allgemein → „Claude-Anbindung (MCP)“** einschalten. Die Einstellung bleibt
   gespeichert.
2. Den MCP-Server bei Claude eintragen:

   **Claude Desktop** – Datei `%APPDATA%\Claude\claude_desktop_config.json` (über Einstellungen → Entwickler →
   „Konfiguration bearbeiten“), danach Claude Desktop neu starten:

   ```json
   {
     "mcpServers": {
       "cantcodecad": {
         "command": "node",
         "args": ["C:\\Pfad\\zu\\cantcodecad\\tools\\mcp\\cantcodecad-mcp.mjs"]
       }
     }
   }
   ```

   **Claude Code** – einmal im Terminal:

   ```bash
   claude mcp add cantcodecad -- node C:/Pfad/zu/cantcodecad/tools/mcp/cantcodecad-mcp.mjs
   ```

3. cantcodecad öffnen (exe oder Browser) und Claude bitten, etwas zu konstruieren. Beim ersten Auftrag meldet cantcodecad
   „Claude ist mit cantcodecad verbunden“.

Läuft cantcodecad nicht oder ist die Anbindung aus, antwortet jedes Werkzeug mit einem klaren Hinweis. Ein anderer Port
lässt sich über die Umgebungsvariable `CANTCODECAD_MCP_PORT` setzen (dann auch in `src/ai-bridge.js` anpassen).

## Werkzeuge

| Werkzeug | Zweck |
|---|---|
| `dokument_lesen` | Features, Parameter, Zustand je Feature, Körper mit Volumen und Hülle (Skizzen gekürzt, `voll` = vollständig) |
| `beispiele` | echte Feature-Beispiele aus `Projekte/Beispiele` je Typ – so kennt Claude die Felder |
| `skizze_anlegen` | Skizze auf XY/XZ/YZ (mit Versatz) aus Rechteck, Rechteck um Mitte, Kreis, Linie, Bogen, Vieleck, Punkt; auf Wunsch bemaßt |
| `feature_anlegen` | beliebiges Feature als JSON am Ende der Zeitleiste |
| `feature_aendern` | Felder eines Features ändern (`null` entfernt ein Feld) |
| `feature_loeschen` | Feature löschen (abhängige werden gemeldet) |
| `parameter_setzen` | Benutzerparameter anlegen oder ändern (Ausdrücke erlaubt) |
| `messen` | Volumen, Oberfläche, Schwerpunkt, Hülle, Flächen/Kanten je Körper |
| `ansicht_bild` | PNG der 3D-Ansicht aus iso/front/top/… |
| `rueckgaengig` | letzte Änderung zurücknehmen |

Solange in cantcodecad gerade eine Skizze oder ein Feature bearbeitet wird, lehnen die ändernden Werkzeuge ab – erst
OK oder Abbrechen wählen.

## Sicherheit

Die Brücke hört nur auf 127.0.0.1. Solange die Anbindung eingeschaltet ist, kann jedes Programm auf diesem Rechner,
das den MCP-Server kennt, Aufträge schicken. Deshalb ist sie ab Werk aus. Jede Änderung ist rückgängig zu machen,
gespeichert wird nur, was cantcodecad ohnehin speichert.

## Prüfen

- `node tools/mcp/selbsttest.mjs` – MCP-Protokoll und Brücke ohne Browser.
- Prüfstand Oberfläche, Ablauf „Claude-Anbindung: Platte mit vier Bohrungen über die Werkzeuge“ – die Werkzeuge in
  der App.
