// cantcodecad – englisches Wörterbuch der Oberfläche (src/i18n.js). Je Zeile „deutscher Text ⇒ englischer Text“.
// Der deutsche Text steht so im Code; {0}, {1} … sind die eingesetzten Werte (Vorlagen-${…} der Quelle), im Englischen
// beliebig umstellbar. {1:s} hängt „s“ an, wenn Wert 1 nicht leer und nicht „1“ ist (deutsche Mehrzahlendung oder Anzahl),
// {1:ies|y} wählt zwischen Mehrzahl und Einzahl. {0#} im deutschen Text passt nur auf eine Zahl. Begriffe. Fehlt ein Text, bleibt er deutsch.
export default String.raw`
Zugänglichkeitsanalyse (aus einer Richtung erreichbare Flächen) ⇒ Accessibility Analysis (faces reachable from a direction)
Zugänglichkeit ⇒ Accessibility
zugänglich ⇒ accessible
nicht zugänglich ⇒ not accessible
Zugänglichkeitsanalyse: grün, wo ein Werkzeug die Fläche geradlinig aus der Richtung erreicht (z. B. Fräser von oben, Sicht, Lackierpistole); rot, wo die Fläche wegzeigt, senkrecht zur Richtung steht oder vom Teil selbst verdeckt wird. ⇒ Accessibility Analysis: green where a tool reaches the face in a straight line from the direction (e.g. a cutter from above, line of sight, a spray gun); red where the face points away, is perpendicular to the direction or is hidden by the part itself.
Auswahlpriorität ⇒ Selection priority
Standard (Kanten zuerst) ⇒ Default (edges first)
Flächenpriorität ⇒ Select Face Priority
Körperpriorität ⇒ Select Body Priority
Körperpriorität: ein Klick auf eine Fläche wählt den ganzen Körper. ⇒ Body priority: clicking a face selects the whole body.
Flächenpriorität: Flächen vor Kanten. ⇒ Face priority: faces before edges.
Auswahlpriorität Standard: Kanten nahe am Zeiger zuerst. ⇒ Default selection priority: edges near the cursor first.
Körper teilen: der Körper wird an seiner Silhouette in zwei Körper getrennt (z. B. zwei Formhälften). Das geht, wenn die Umrisslinie in einer Ebene liegt – bei Zylindern, Kugeln und Drehteilen quer zur Achse gesehen. ⇒ Split body: the body is separated into two bodies at its silhouette (e.g. two mold halves). This works when the silhouette lies in a plane – for cylinders, spheres and turned parts seen across their axis.
Die Silhouette liegt nicht in einer Ebene – „Körper teilen“ geht hier nicht, „Flächen teilen“ schon ⇒ The silhouette is not planar – “Split body” is not possible here, “Split faces” is
{0} Körper an der Silhouette geteilt ⇒ {0} bod{0:ies|y} split at the silhouette
Lippe / Absatz (Kunststoff: Band auf der Randfläche einer Schale bzw. Gegenstück) ⇒ Lip / Groove (plastic: band on the rim face of a shell, or its counterpart)
Lippe ⇒ Lip
Absatz ⇒ Groove
Randfläche ⇒ Rim face
Die ebene Randfläche oben auf der Wand anklicken. ⇒ Click the planar rim face on top of the wall.
Absatz: das Gegenstück zur Lippe am anderen Gehäuseteil – Breite und Tiefe wachsen um das Spiel, damit die Lippe hineinpasst. ⇒ Groove: the counterpart of the lip on the other housing half – width and depth grow by the clearance so the lip fits.
Lippe: ein Band entlang der Innen- oder Außenkante der Randfläche, nach außen aufgesetzt – zentriert zwei Gehäusehälften. ⇒ Lip: a band along the inner or outer edge of the rim face, added outward – centers two housing halves.
Die ebene Randfläche der Schale anklicken (oben auf der Wand). ⇒ Click the planar rim face of the shell (on top of the wall).
Erst die ebene Randfläche der Schale anklicken. ⇒ First click the planar rim face of the shell.
Ebene Randfläche der Schale anklicken ⇒ Click the planar rim face of the shell
Breite und Höhe müssen größer als 0 sein ⇒ Width and height must be greater than 0
Die Lippe ist breiter als die Wand erlaubt ⇒ The lip is wider than the wall allows
Die Randfläche muss eben sein ⇒ The rim face must be planar
Die Randfläche hat keine Innenkante – „Außen“ wählen ⇒ The rim face has no inner edge – choose “Outside”
Das Band der Lippe lässt sich nicht bauen ⇒ The lip band cannot be built
Der Absatz lässt sich nicht einschneiden ⇒ The groove cannot be cut
Die Lippe lässt sich nicht anfügen ⇒ The lip cannot be added
{0} Lippe ⇒ {0} lip
{0} Lippen ⇒ {0} lips
{0} Absatz ⇒ {0} groove
{0} Absätze ⇒ {0} grooves
Auswahlwerkzeug ⇒ Selection tool
Fensterauswahl ⇒ Window Selection
Freiformauswahl ⇒ Freeform Selection
Farbauswahl (über das Modell malen) ⇒ Paint Selection (paint over the model)
Farbauswahl: mit gedrückter linker Taste über Flächen oder Kanten malen. ⇒ Paint Selection: hold the left mouse button and paint over faces or edges.
Freiformauswahl: eine Schleife um die Kanten ziehen. ⇒ Freeform Selection: draw a loop around the edges.
Fensterauswahl: Rahmen aufziehen. ⇒ Window Selection: drag a box.
Farbauswahl: {0} dazu. ⇒ Paint Selection: {0} added.
Umgebungs-Map-Analyse (Spiegelung einer Umgebung, ein/aus) ⇒ Environment Map Analysis (reflection of an environment, on/off)
Umgebungs-Map an: die Umgebung spiegelt sich in den Flächen – Knicke oder Sprünge in Horizont und Leuchtflächen zeigen unsaubere Übergänge. Modell drehen, noch einmal wählen zum Ausschalten. ⇒ Environment map on: the environment is reflected in the faces – kinks or jumps in the horizon and light panels reveal poor transitions. Rotate the model; choose again to turn off.
Umgebungs-Map aus. ⇒ Environment map off.
Silhouette geteilt (Flächen entlang der Umrisslinie aus einer Richtung teilen) ⇒ Silhouette Split (split faces along the silhouette seen from a direction)
Silhouette geteilt ⇒ Silhouette Split
Blickrichtung ⇒ View direction
Ebene Fläche anklicken … ⇒ Click a planar face …
ebene Fläche ✓ ⇒ planar face ✓
Eine ebene Fläche anklicken – ihre Normale ist die Blickrichtung. ⇒ Click a planar face – its normal is the view direction.
Ebene Fläche für die Blickrichtung anklicken ⇒ Click a planar face for the view direction
Die Fläche für die Blickrichtung muss eben sein ⇒ The face for the view direction must be planar
Keine Silhouette zum Teilen – nur gekrümmte Flächen haben eine Umrisslinie, ebene enden an ihren Kanten ⇒ No silhouette to split – only curved faces have a silhouette; planar faces end at their edges
Silhouette geteilt: gekrümmte Flächen werden entlang ihrer Umrisslinie aus der Blickrichtung geteilt (dort steht die Fläche senkrecht zur Blickrichtung) – z. B. die Trennlinie für eine Gussform oder eine Formschräge. Der Körper bleibt ganz. ⇒ Silhouette Split: curved faces are split along their silhouette seen from the view direction (where the face is perpendicular to it) – e.g. the parting line for a mold or a draft. The body stays whole.
Regeln ⇒ Rules
Wenn ⇒ If
dann ⇒ then
alle Bedingungen ⇒ all conditions
eine Bedingung ⇒ any condition
+ Bedingung ⇒ + Condition
+ Wert setzen ⇒ + Set value
+ Regel ⇒ + Rule
an ⇒ on
ja ⇒ yes
nein ⇒ no
Spalte ⇒ Column
Vergleich ⇒ Comparison
Verknüpfung ⇒ Logic
Name der Regel ⇒ Rule name
Bedingung entfernen ⇒ Remove condition
Aktion entfernen ⇒ Remove action
Regel löschen ⇒ Delete rule
gesetzt von {0} ⇒ set by {0}
Erst Spalten anlegen – Regeln setzen Werte in Spalten. ⇒ Add columns first – rules set values in columns.
Konfigurationsregeln: „Wenn … dann …“ setzt Zellen jeder Zeile, deren Werte die Bedingung erfüllen (blau markiert). Bedingungen und Werte dürfen Ausdrücke sein, z. B. breite/12. ⇒ Configuration rules: “If … then …” sets cells in every row whose values meet the condition (marked blue). Conditions and values may be expressions, e.g. breite/12.
Neuer Kontaktsatz (Teile, die sich beim Bewegen nicht durchdringen) ⇒ New Contact Set (parts that must not penetrate each other while moving)
Kontaktsätze aktivieren ⇒ Enable Contact Sets
Kontakt aller Komponenten ⇒ Enable All Contact
Kontaktanalyse deaktivieren ⇒ Disable Contact
Kontaktsätze ⇒ Contact Sets
Kontaktanalyse aus ⇒ Contact analysis off
Kontaktsätze aktiv ⇒ Contact sets active
Komponenten / Körper ⇒ Components / Bodies
Teile im Modell anklicken oder oben wählen (mindestens zwei). Bewegt ein Gelenk eines davon, hält es an, sobald es ein anderes Glied dieses Satzes berührt. ⇒ Click parts in the model or choose them above (at least two). When a joint moves one of them, it stops as soon as it touches another member of this set.
Wirkt, wenn unter Kontakt „Kontaktsätze aktivieren“ gewählt ist. ⇒ Takes effect when “Enable Contact Sets” is selected under Contact.
Kontaktanalyse deaktiviert. ⇒ Contact analysis disabled.
Kontakt aller Komponenten: Gelenke halten an, sobald sich Teile berühren. ⇒ All contact enabled: joints stop as soon as parts touch.
Kontaktsätze aktiviert. ⇒ Contact sets enabled.
Kontaktsätze aktiviert – mit „Neuer Kontaktsatz“ Teile wählen, die sich nicht durchdringen sollen. ⇒ Contact sets enabled – use “New Contact Set” to choose parts that must not penetrate each other.
Kontaktsatz gespeichert. Gelenke halten jetzt an, sobald sich diese Teile berühren. ⇒ Contact set saved. Joints now stop as soon as these parts touch.
Kontakt: {0} berührt {1} – Gelenk angehalten. ⇒ Contact: {0} touches {1} – joint stopped.
Kontakt: Gelenk angehalten. ⇒ Contact: joint stopped.
Kontakt gibt es nur in einer Baugruppe. ⇒ Contact is only available in an assembly.
Kontakt: Gelenk angehalten ab Schritt {0} ({1} ↔ {2}). ⇒ Contact: joint stopped from step {0} ({1} ↔ {2}).
RECHTS ⇒ RIGHT
LINKS ⇒ LEFT
OBEN ⇒ TOP
UNTEN ⇒ BOTTOM
VORNE ⇒ FRONT
HINTEN ⇒ BACK
Sprache ⇒ Language
Erst die Skizze bzw. das Feature mit OK oder Abbrechen beenden, dann die Sprache wechseln. ⇒ First finish the sketch or feature with OK or Cancel, then switch the language.
Die Oberfläche wird in der gewählten Sprache neu geladen; das offene Dokument bleibt erhalten. Zeichnungsblätter und Namen, die im Dokument stehen, bleiben wie eingegeben. ⇒ The interface reloads in the chosen language; the open document is kept. Drawing sheets and names stored in the document stay as entered.
– (Material wählen) ⇒ – (choose material)
– bereit zum Erzeugen. ⇒ – ready to generate.
– eigene Werte – ⇒ – custom values –
– Hinweise: {0} ⇒ – Notes: {0}
– Knicken ⇒ – Buckling
– Skizze wählen – ⇒ – Select sketch –
– Spannung ⇒ – Stress
– übersprungen: {0} ⇒ – skipped: {0}
– unterdrückt ⇒ – suppressed
, {0} alte verworfen ⇒ , {0} old ones discarded
, {0} Biegelinien ⇒ , {0} bend lines
, {0} bis zum Körper verlängert ⇒ , {0} extended to the body
, {0} ohne Dreiecke geblieben ⇒ , {0} left without triangles
, {0} Texte/Bilder übersprungen – Texte vorher in Pfade umwandeln ⇒ , {0} texts/images skipped – convert texts to paths first
, {0} übernommen ⇒ , {0} taken over
, abgewickelt ⇒ , unfolded
, Bestand danach {0} ⇒ , stock afterwards {0}
, Bezugspunkt fixiert ⇒ , reference point fixed
, dann weitere Punkte derselben Ansicht anklicken. Ein Klick ins Freie legt die Lage der Maße fest. ⇒ , then click further points of the same view. A click into empty space sets the position of the dimensions.
, davon {0} notfallweise ⇒ , {0} of them as fallback
, Dokument gesichert in {0} ms ⇒ , document saved in {0} ms
: erst die Fläche (Kante in der Ansicht) anklicken, dann die Lage des Zeichens. ⇒ : first click the face (edge in the view), then the position of the symbol.
. Jede Änderung lässt sich rückgängig machen. ⇒ . Every change can be undone.
.cantcodecad (Download). Für den Projektordner cantcodecad einmal neu starten. ⇒ .cantcodecad (download). Restart once for the cantcodecad project folder.
· {0} Auswahl ohne Ergebnis ⇒ · {0} selection{0:s} without result
· {0} Eckfreischnitt{1} ⇒ · {0} corner relief{1:s}
· {0} Feature{1} mit Fehler ⇒ · {0} feature{1:s} with errors
· {0} getrennte Teile ⇒ · {0} separate parts
· {0} Kante{1} {2} ⇒ · {0} edge{1:s} {2}
· {0} Körper in der Datei ⇒ · {0} bodies in the file
· {0} mm frei auf der letzten Tafel ⇒ · {0} mm free on the last sheet
· {0} nicht gefunden ⇒ · {0} not found
· {2} % genutzt{3} · {4}{5} ⇒ · {2} % used{3} · {4}{5}
· Abwicklung aus dem Körper ({0} Flächen) ⇒ · Flat pattern from the body ({0} faces)
· Abwicklung neu ({0} Flächen) ⇒ · Flat pattern recomputed ({0} faces)
· Abwicklung nicht möglich ⇒ · Flat pattern not possible
· Biegewinkel {0}° ⇒ · Bend angle {0}°
· ca. {0} kg Stahl ⇒ · approx. {0} kg steel
· der Schenkel liegt {0} mm über der Fläche, „0“ liegt flach an ⇒ · the flange sits {0} mm above the face, “0” lies flat
· Kopie ⇒ · Copy
· Masse {0} ⇒ · Mass {0}
· ohne Grafikkarte! ⇒ · without graphics card!
„{0}“ hat keinen gültigen Wert ⇒ “{0}” has no valid value
„{0}“ in der Bibliothek gespeichert. ⇒ “{0}” saved in the library.
„{0}“ ist fehlerhaft ⇒ “{0}” is faulty
„{0}“ wird noch benutzt: {1}{2} ⇒ “{0}” is still used: {1}{2}
„Bis Fläche“ geht mit ebenen Flächen ⇒ “To Face” works with planar faces
„Konstruktion erstellen“ legt das Ergebnis als Körper in die Zeitleiste (Umriss über die Dicke extrudiert, Beibehalten-Körper dazu, Hindernisse abgezogen) und blendet Startform und Beibehalten-Körper aus. ⇒ “Create Design” puts the result into the timeline as a body (outline extruded through the thickness, Preserve bodies added, obstacles subtracted) and hides the starting shape and Preserve bodies.
„Polygon“ ⇒ “Polygon”
({0} % des Teils) ⇒ ({0} % of the part)
({0} aus dem Netz) ⇒ ({0} from the mesh)
({0} ebene und {1} gekrümmte Flächen aus dem Netz, {2} aus dem Kern{3}{4}) ⇒ ({0} planar and {1} curved faces from the mesh, {2} from the kernel{3}{4})
({0} Elemente übersprungen) ⇒ ({0} entities skipped)
({0} Körper ohne Material: nach Volumen gewichtet) ⇒ ({0} bodies without material: weighted by volume)
({0} übernommen) ⇒ ({0} taken over)
({0} weitere ohne Linien) ⇒ ({0} more without lines)
({0}× exakt gefragt) ⇒ ({0}× queried exactly)
(Fehler im Geometriekern) ⇒ (error in the geometry kernel)
(Flächen- und Kantenbeschreibung übernommen: {0}/{1}, Kernanfragen {2}) ⇒ (face and edge description taken over: {0}/{1}, kernel queries {2})
(mit 2 geschlossenen Endwindungen) ⇒ (with 2 closed end coils)
(Schnitt {0} mm) ⇒ (cut {0} mm)
(Zahl tippen) ⇒ (type a number)
) – Wanddicke kleiner wählen ⇒ ) – choose a smaller wall thickness
{0} – Doppelklick zum Ändern, ziehen zum Verschieben ⇒ {0} – double-click to edit, drag to move
{0} · Druckstäbe verstärken ⇒ {0} · reinforce compression members
{0} · Netze grob, Verfeinerung läuft ({1}) ⇒ {0} · meshes coarse, refinement running ({1})
{0} · Netze werden verfeinert … ⇒ {0} · meshes are being refined …
{0} „{1}“: jetzt die Lage (linke obere Ecke) auf dem Blatt anklicken. Esc bricht ab. ⇒ {0} “{1}”: now click the position (top left corner) on the sheet. Esc cancels.
{0} {1} · Doppelklick/Enter beendet, Klick auf den ersten Punkt schließt ⇒ {0} {1} · double-click/Enter finishes, click on the first point closes
{0} {1}-Fläche{2} ausgewählt. ⇒ {0} {1} face{2:s} selected.
{0} abgeleitet. Doppelklick in der Zeitleiste wählt einzelne Körper. ⇒ {0} derived. Double-click in the timeline selects individual bodies.
{0} Abhängigkeit{1} · {2} ⇒ {0} constraint{1:s} · {2}
{0} angelegt. Rechtsklick auf die Ansicht: Maßstab oder löschen. ⇒ {0} created. Right-click the view: scale or delete.
{0} Biegung{1} (aus Körperform) ⇒ {0} bend{1:s} (from body shape)
{0} Biegung{1} gewählt ⇒ {0} bend{1:s} selected
{0} eingefügt. Mit der Maus verschieben, Klick darauf ändert die Größe. ⇒ {0} inserted. Move with the mouse, click on it to change the size.
{0} eingefügt. Mit Gelenk (J) oder Verschieben (M) ausrichten. ⇒ {0} inserted. Align with Joint (J) or Move (M).
{0} entfernt (Strg+Z macht es rückgängig). ⇒ {0} removed (Ctrl+Z undoes it).
{0} Fläche{1} ⇒ {0} face{1:s}
{0} Fläche{1} · {2} mm {3} ⇒ {0} face{1:s} · {2} mm {3}
{0} Fläche{1} bis zur Zielfläche ({2} mm) ⇒ {0} face{1:s} up to the target face ({2} mm)
{0} Fläche{1} gewählt – alle Ecken dieser Flächen. ⇒ {0} face{1:s} selected – all corners of these faces.
{0} Fläche{1} gewählt – nur diese werden geteilt. ⇒ {0} face{1:s} selected – only these are split.
{0} Fläche{1} gewählt. ⇒ {0} face{1:s} selected.
{0} Fläche{1} gewählt. Diese bleiben offen. ⇒ {0} face{1:s} selected. These stay open.
{0} Fläche{1} passen. ⇒ {0} face{1:s} match.
{0} Flächen dazu ⇒ {0} faces added
{0} Flächen dazu ({1} statt {2}) ⇒ {0} faces added ({1} instead of {2})
{0} Flächen ohne Dreiecke ⇒ {0} faces without triangles
{0} Flächen um {1} mm versetzt ⇒ {0} faces offset by {1} mm
{0} geöffnet. ⇒ {0} opened.
{0} gewählt. Jetzt einen Befehl starten (z. B. F verrunden, Q drücken/ziehen) oder Rechtsklick. Umschalt-Klick ergänzt, Esc hebt auf, Entf entfernt den Körper. ⇒ {0} selected. Now start a command (e.g. F fillet, Q press pull) or right-click. Shift-click adds, Esc clears, Del deletes the body.
{0} gewählte Körper nicht mehr gefunden ⇒ {0} selected bodies no longer found
{0} gibt es nur in einer Baugruppe: Zusammenfügen → Zu Baugruppe hinzufügen, oder in den Dokumenteinstellungen auf Baugruppe umstellen. ⇒ {0} exists only in an assembly: Assemble → Add to Assembly, or switch to Assembly in the document settings.
{0} hat keine Kurven für den Pfad ⇒ {0} has no curves for the path
{0} ist aktiv. Neue Körper kommen in diese Komponente. ⇒ {0} is active. New bodies go into this component.
{0} Kante{1} der gewählten Flächen {2} ⇒ {0} edge{1:s} of the selected faces {2}
{0} Kante{1} gewählt. ⇒ {0} edge{1:s} selected.
{0} Kante{1} hinzugefügt. ⇒ {0} edge{1:s} added.
{0} Kante{1} übergangen (nicht in Dickenrichtung) ⇒ {0} edge{1:s} skipped (not in thickness direction)
{0} Kante{1} übergangen: {2} ⇒ {0} edge{1:s} skipped: {2}
{0} Körper · ⇒ {0} bodies ·
{0} Körper ausgewählt. ⇒ {0} bodies selected.
{0} Körper grob – feine Fassung folgt ⇒ {0} bodies coarse – fine version follows
{0} Körper ohne Schlüssel ⇒ {0} bodies without key
{0} Körper passen. ⇒ {0} bodies match.
{0} Körper übernommen ⇒ {0} bodies taken over
{0} Körper, alle ausgeblendet ⇒ {0} bodies, all hidden
{0} Kurven als Skizze {1} übernommen{2}. Jetzt z. B. extrudieren. ⇒ {0} curves taken over as sketch {1}{2}. Now e.g. extrude.
{0} lässt sich so nicht lösen. ⇒ {0} cannot be solved this way.
{0} Maß{1} angelegt. Weitere Reihe anklicken oder Esc. ⇒ {0} dimension{1:s} created. Click another row or Esc.
{0} neben {1} eingefügt. ⇒ {0} inserted next to {1}.
{0} Netze verdrängt und neu gerechnet ⇒ {0} meshes evicted and recomputed
{0} Parameter nicht übernommen – eigener Parameter gleichen Namens hat Vorrang. ⇒ {0} parameters not taken over – your own parameter with the same name takes precedence.
{0} runde Kante{1} gewählt – je eine Bohrung in ihrer Mitte. ⇒ {0} round edge{1:s} selected – one hole at the center of each.
{0} Stäbe · zusammen {1} mm{2} ⇒ {0} members · total {1} mm{2}
{0} Steht „In Blech umwandeln“ davor, wird die Abwicklung neu gerechnet. Vorschau nach OK. ⇒ {0} If “Convert to Sheet Metal” comes before it, the flat pattern is recomputed. Preview after OK.
{0} Stirnfläche{1} gewählt. ⇒ {0} end face{1:s} selected.
{0} Stück {1}, {2} mm{3} ⇒ {0} pcs {1}, {2} mm{3}
{0} übergangen: {1} ⇒ {0} skipped: {1}
{0} Überschneidung{1} (rot): ⇒ {0} interference{1:s} (red):
{0} unterdrückt ⇒ {0} suppressed
{0} unterdrückt. ⇒ {0} suppressed.
{0} Volumen aus dem Netz – Massen vorläufig ⇒ {0} volumes from the mesh – masses preliminary
{0} von {1} Flächen gewählt. ⇒ {0} of {1} faces selected.
{0} wird abgewickelt … ⇒ {0} is being unfolded …
{0} wird eingelesen …{1}{2}{3} ⇒ {0} is being read …{1}{2}{3}
{0} wird von {1} benutzt. Trotzdem auflösen? ⇒ {0} is used by {1}. Dissolve anyway?
{0} wird von {1} benutzt. Trotzdem löschen? ⇒ {0} is used by {1}. Delete anyway?
{0}-Eck · Schlüsselweite {1} (+/− Ecken) ⇒ {0}-gon · across flats {1} (+/− corners)
{0}-Fläche.dxf ⇒ {0}-Face.dxf
{0}-Stückliste.csv ⇒ {0}-BOM.csv
{0}: „{1}“ fehlt oder ist keine Zahl. ⇒ {0}: “{1}” is missing or not a number.
{0}: auf dem Blatt an die gewünschte Stelle klicken. Esc bricht ab. ⇒ {0}: click the desired position on the sheet. Esc cancels.
{0}: jetzt die Lage des Maßes anklicken. ⇒ {0}: now click the position of the dimension.
{0}: lässt sich mit den neuen Werten nicht lösen ⇒ {0}: cannot be solved with the new values
{0}: Schritt {1} von höchstens {2} ⇒ {0}: step {1} of at most {2}
{0}{1} Flächen · {2} Kanten · {3}{4} ⇒ {0}{1} faces · {2} edges · {3}{4}
{0}{1}-Stückliste.csv ⇒ {0}{1}-BOM.csv
{0}Steigung {1} mm · Höhe {2} mm{3} · Drahtlänge ≈ {4} mm ⇒ {0}Pitch {1} mm · Height {2} mm{3} · Wire length ≈ {4} mm
{1} – erst Elemente wählen ⇒ {1} – select entities first
{1} · Rechtsklick für Befehle ⇒ {1} · right-click for commands
{1} Ansicht löschen ⇒ {1} Delete view
{1} Aus dem Projektordner … ⇒ {1} From the project folder …
{1} Blatt {2} löschen ⇒ {1} Delete sheet {2}
{1} Rückgängig ⇒ {1} Undo
{1} Teil öffnen ⇒ {1} Open part
{1} unterdrücken ⇒ {1} Suppress
{10} Auflösen ⇒ {10} Dissolve
{13} löschen ⇒ {13} Delete
{2} · Rechtsklick für Befehle ⇒ {2} · right-click for commands
{2} ({3} Stück) ⇒ {2} ({3} pcs)
{2} Aus Komponente lösen ⇒ {2} Remove from component
{2} DXF-Dateien … ⇒ {2} DXF files …
{2} Fläche{3} ⇒ {2} face{3:s}
{2} Maßstab {3} ⇒ {2} Scale {3}
{4} Fläche{5} ⇒ {4} face{5:s}
{4}Vorhandene Körper im Modell anklicken oder oben wählen, oder leer anlegen und danach konstruieren. Ein Körper gehört zu genau einer Komponente; Gelenke bewegen die Komponente samt Unterkomponenten. ⇒ {4}Click existing bodies in the model or choose above, or create empty and model afterwards. A body belongs to exactly one component; joints move the component together with its subcomponents.
{6} schließen ⇒ {6} Close
{7} schließen ⇒ {7} Close
{7}{8}{9} · Klick: bearbeiten, Rechtsklick: Menü, Ziehen: umsortieren ⇒ {7}{8}{9} · Click: edit, right-click: menu, drag: reorder
{8} Löschen ⇒ {8} Delete
+ {0} Ebene{1} ⇒ + {0} plane{1:s}
+ Abhängigkeit ⇒ + Constraint
+ Eckgruppe ⇒ + Corner group
+ Kantengruppe ⇒ + Edge set
+ Konfiguration ⇒ + Configuration
+ Profil ⇒ + Profile
+ Spalte … ⇒ + Column …
+ Zwischenpunkt ⇒ + Intermediate point
⌀ Eckfreischnitt ⇒ ⌀ Corner relief
★ beste ⇒ ★ best
0 = Regelgewinde nach ISO. ⇒ 0 = coarse thread per ISO.
1 Minute weitersuchen ⇒ Search 1 more minute
2 × Dicke ⇒ 2 × thickness
2-Achsen-Schneiden · Richtung {2} ⇒ 2-axis cutting · direction {2}
3D-Druck (3MF) ⇒ 3D Print (3MF)
3MF in dieser Lage ⇒ 3MF in this orientation
3MF wird erzeugt … ⇒ Generating 3MF …
3MF-Export nicht möglich: ⇒ 3MF export not possible:
4h (Bolzen) ⇒ 4h (bolt)
5 Minuten weitersuchen ⇒ Search 5 more minutes
5H (Mutter) ⇒ 5H (nut)
6g (Bolzen) ⇒ 6g (bolt)
6G (Mutter) ⇒ 6G (nut)
6h (Bolzen) ⇒ 6h (bolt)
6H (Mutter) ⇒ 6H (nut)
7H (Mutter) ⇒ 7H (nut)
8g (Bolzen) ⇒ 8g (bolt)
Abbrechen ⇒ Cancel
Abgeleitet {0} ⇒ Derived {0}
abgeleitet aus {0} ⇒ derived from {0}
Abgewickelte Länge {0} mm · {1} Biegung{2} ⇒ Developed length {0} mm · {1} bend{2:s}
Abhängigkeit ⇒ Constraint
Abhängigkeit {0}: beide Auswahlen liegen auf der bewegten Komponente ⇒ Constraint {0}: both selections are on the moved component
Abhängigkeit {0}: die erste Auswahl muss auf der bewegten Komponente liegen ⇒ Constraint {0}: the first selection must be on the moved component
Abhängigkeit {0}: eine Auswahl gibt es nicht mehr ⇒ Constraint {0}: a selection no longer exists
Abhängigkeit: {0} ⇒ Constraint: {0}
Abhängigkeit: Fläche einer Beibehalten-Geometrie festhalten (z. B. Bohrungswand) ⇒ Constraint: fix a face of a Preserve Geometry (e.g. hole wall)
Abhängigkeiten ⇒ Constraints
Abhängigkeiten (Flächen aufeinander, konzentrisch, …) ⇒ Constraints (faces mated, concentric, …)
Abhängigkeiten automatisch ⇒ Auto constraints
Abhängigkeiten automatisch (waagrecht/senkrecht, deckungsgleich, tangential) ⇒ Auto constraints (horizontal/vertical, coincident, tangent)
Abkanten ⇒ Bending
Ableiten ⇒ Derive
Ableiten (Körper aus einem anderen Dokument, verknüpft) ⇒ Derive (bodies from another document, linked)
Ableiten aus … ⇒ Derive from …
Ableiten nicht möglich: ⇒ Derive not possible:
Abmaße ⇒ Deviations
Abmessung ⇒ Dimension
Abmessungen ⇒ Dimensions
Abrundung ⇒ Fillet
Absetzung {0} gesetzt. Weitere Absetzungen mit Umschalt+Klick, ohne Umschalttaste die Lage der Schnittansicht anklicken. ⇒ Offset {0} set. Further offsets with Shift+click; without Shift, click the position of the section view.
Abspielen ⇒ Play
Abstand ⇒ Distance
Abstand (kürzester) ⇒ Distance (shortest)
Abstand = Mitte-zu-Mitte zwischen zwei Kopien, Ausdehnung = Gesamtmaß von Mitte erster bis Mitte letzter Kopie. Symmetrisch steht das Original in der Mitte, braucht also eine ungerade Anzahl – die Zahl rückt beim Einschalten auf die nächste ungerade.{0} ⇒ Distance = center-to-center between two copies, Extent = overall size from the center of the first to the center of the last copy. Symmetric puts the original in the middle and therefore needs an odd count – the number moves to the next odd one when switched on.{0}
Abstand 1 ⇒ Distance 1
Abstand 1 liegt auf einer der beiden Flächen an der Kante. Passt die Seite nicht, „Getauscht“ wählen. ⇒ Distance 1 lies on one of the two faces at the edge. If the side is wrong, choose “Flipped”.
Abstand 2 ⇒ Distance 2
Abstand 2 muss größer als 0 sein ⇒ Distance 2 must be greater than 0
Abstand darf nicht 0 sein ⇒ Distance must not be 0
Abstand der zweiten Seite muss größer als 0 sein ⇒ Distance of the second side must be greater than 0
Abstand entlang der Kante muss größer als 0 sein ⇒ Distance along the edge must be greater than 0
Abstand gilt ⇒ Distance applies
Abstand in mm, Enter legt an ⇒ Distance in mm, Enter creates
Abstand je Windung ⇒ Distance per turn
Abstand muss größer als 0 sein ⇒ Distance must be greater than 0
Abstand nach außen ⇒ Outward distance
Abstand Richtung 2 darf nicht 0 sein ⇒ Distance in direction 2 must not be 0
Abstand Seite 1 ⇒ Distance side 1
Abstand Seite 2 ⇒ Distance side 2
Abstand und Winkel ⇒ Distance and angle
Abstand X ⇒ Distance X
Abstand Y ⇒ Distance Y
Abstand zu Kante 1 ⇒ Distance to edge 1
Abstand zu Kante 2 ⇒ Distance to edge 2
Abstand zum Teil ⇒ Distance to part
Abstandsart ⇒ Extent type
Abstandsart 2 ⇒ Extent type 2
Abstrafung (SIMP p) ⇒ Penalization (SIMP p)
Abwickeln ⇒ Unfold
Abwickeln geht auf Zylinderflächen – sonst „Projizieren“ wählen ⇒ Unfolding works on cylindrical faces – otherwise choose “Project”
Abwickeln: feste ebene Blechfläche anklicken. Das Blech liegt danach flach; skizzieren und schneiden, dann „Zurückfalten“. Für „nur ausgewählte Biegungen“ die runden Biegeflächen anklicken – die anderen bleiben stehen. ⇒ Unfold: click a stationary planar sheet metal face. The sheet then lies flat; sketch and cut, then “Refold”. For “selected bends only”, click the round bend faces – the others stay standing.
Abwicklung ⇒ Flat Pattern
Abwicklung ergab keine Kontur ⇒ Flat pattern produced no contour
Abwicklung erstellen ⇒ Create Flat Pattern
Abwicklung nicht möglich: ⇒ Flat pattern not possible:
Abwicklung unvollständig – Profile passen nicht zueinander ⇒ Flat pattern incomplete – profiles do not fit together
Abwicklung: Kontur überschneidet sich ({0} Kreuzung{1}) – Zuschnitt prüfen, z. B. Eckfreischnitt in der Blechregel ⇒ Flat pattern: contour intersects itself ({0} crossing{1:s}) – check the blank, e.g. corner relief in the sheet metal rule
Achse ⇒ Axis
Achse ✓ ⇒ Axis ✓
Achse durch den Ursprung. ⇒ Axis through the origin.
Achse projizieren ⇒ Project axis
Achtung ⇒ Attention
aenderungen fehlt. ⇒ changes missing.
Aktiv ⇒ Active
Aktive Komponente: {0}. {1} ⇒ Active component: {0}. {1}
Aktive Konfiguration ⇒ Active configuration
Aktivieren ⇒ Activate
Aktivieren (neue Körper kommen hinein) ⇒ Activate (new bodies go into it)
aktuelles Teil ⇒ current part
Alle ⇒ All
Alle als DXF ⇒ All as DXF
Alle als Fertigungspaket ⇒ All as manufacturing package
Alle als STEP ⇒ All as STEP
Alle Bedingungen zeigen ⇒ Show all conditions
Alle Biegelinien müssen auf demselben Blech liegen ⇒ All bend lines must lie on the same sheet
alle Biegungen ⇒ all bends
Alle Biegungen ⇒ All bends
Alle Bohrungen bis ⌀ ⇒ All holes up to ⌀
Alle Dateien (*.*)|*.* ⇒ All files (*.*)|*.*
alle Ecken ⇒ all corners
Alle Ecken ⇒ All corners
Alle Einzelmaße dieses Blatts löschen? ⇒ Delete all individual dimensions of this sheet?
Alle ersten Auswahlen müssen auf derselben (bewegten) Komponente liegen. ⇒ All first selections must lie on the same (moved) component.
Alle in Komponenten ⇒ All in components
Alle Kanten ⇒ All edges
Alle Kanten des Körpers. ⇒ All edges of the body.
Alle Körperkanten fangen automatisch, auch verdeckte. Benutzt werden sie als violette Bezüge in die Skizze projiziert. Mit X werden projizierte Kanten Teil des Profils. ⇒ All body edges snap automatically, including hidden ones. When used, they are projected into the sketch as purple references. With X, projected edges become part of the profile.
Alle Rundungen bis R ⇒ All fillets up to R
Alle Teile aktuell ⇒ All parts up to date
Alles ⇒ Everything
Allgemein ⇒ General
Allgemeintoleranz ⇒ General tolerance
Als Biegung nur eine runde Biegefläche anklicken ⇒ Click only one round bend face as the bend
als Bögen/Kreise ⇒ as arcs/circles
Als Designbereich eine ebene Fläche anklicken. ⇒ Click a planar face as the design space.
Als DWG speichern ⇒ Save as DWG
Als DWG speichern (dasselbe Blatt wie der DXF-Export, binär im Format R12 – für Programme, die DWG lesen) ⇒ Save as DWG (same sheet as the DXF export, binary R12 format – for programs that read DWG)
Als DXF speichern ⇒ Save as DXF
Als DXF speichern (Layer für Kontur, verdeckte Kanten, Mittellinien, Maße, Schraffur) ⇒ Save as DXF (layers for contour, hidden edges, center lines, dimensions, hatching)
Als ein Körper ⇒ As one body
Als feste Fläche eine ebene Blechfläche anklicken. ⇒ Click a planar sheet metal face as the stationary face.
Als Kopie (oder Strg beim Klick) ⇒ As copy (or Ctrl while clicking)
Als Lage nur eine gerade Kante anklicken ⇒ Click only one straight edge as the location
Als Lage nur gerade Kanten anklicken ⇒ Click only straight edges as the location
Als Lage nur runde Kanten anklicken ⇒ Click only round edges as the location
Als Profil eine ebene Fläche anklicken. ⇒ Click a planar face as the profile.
Als Profil geht nur eine ebene Fläche ⇒ Only a planar face works as the profile
Als Spiegelachse eine Linie oder eine Achse anklicken. ⇒ Click a line or an axis as the mirror line.
Als SVG speichern ⇒ Save as SVG
Als Werkzeugkörper gehen eine Kugel oder ein Zylinder (Achse senkrecht zur Pfadebene) ⇒ A sphere or a cylinder (axis perpendicular to the path plane) works as the tool body
Aluminium ⇒ Aluminum
Aluminium {0} mm ⇒ Aluminum {0} mm
Am freien Ende einer Linie oder eines Bogens beginnen. ⇒ Start at the free end of a line or arc.
Am Raster fangen ⇒ Snap to grid
An ⇒ On
An den Anfang ⇒ To the start
An den gewählten Kanten gibt es keine Innenecke für ein Knotenblech ⇒ There is no inside corner for a gusset at the selected edges
An den gewählten Kanten gibt es keine Innenecke für eine Kehlnaht ⇒ There is no inside corner for a fillet weld at the selected edges
An den gewählten Kanten gibt es keinen bündigen Stoß (Flächen in einer Ebene) ⇒ There is no flush joint at the selected edges (faces in one plane)
An der Kante liegt keine ebene Fläche ⇒ No planar face lies at the edge
An dieser Ecke liegen die Linien in einer Flucht. ⇒ At this corner the lines are aligned.
An einer tangentialen Kante gibt es keine Sehne ⇒ There is no chord at a tangent edge
An Punkten ⇒ At points
Änd. ⇒ Rev.
Andere Basis im Modell anklicken. ⇒ Click another base in the model.
Andere Seite ⇒ Other side
Andere Wand ⇒ Other wall
Ändern ⇒ Modify
Änderung ⇒ Change
Änderungen gelten sofort für die gewählte Last (Pfeil im Modell). Weitere Fläche anklicken = neue Last mit diesen Werten. ⇒ Changes apply immediately to the selected load (arrow in the model). Clicking another face = new load with these values.
Anfang ⇒ Start
Anfangspunkt des Textes klicken ⇒ Click the start point of the text
Angeklickte ⇒ Clicked
Angeklicktes Teil ⇒ Clicked part
anklicken … ⇒ click …
anklicken zum Bemaßen ⇒ click to dimension
Ans Ende ⇒ To the end
Ansicht {0} ⇒ View {0}
Ansicht {0}, {1} × {2} px ⇒ View {0}, {1} × {2} px
Ansicht auf ⇒ Look At
Ansicht auf: Fläche anklicken ⇒ Look At: click a face
Ansicht nicht möglich: ⇒ View not possible:
Ansichten werden berechnet … ⇒ Computing views …
Ansichten zurücksetzen: verschobene Ansichten an die Normlage ⇒ Reset views: moved views back to the standard position
Ansichtsbereich ⇒ Canvas
Ansichtsbereich (Bild als Vorlage) ⇒ Canvas (image as reference)
Ansichtswürfel ⇒ ViewCube
Anzahl ⇒ Quantity
Anzahl 2 ⇒ Quantity 2
Anzahl je 90° ⇒ Count per 90°
Anzahl Richtung 2 zwischen 1 und 200 ⇒ Quantity in direction 2 between 1 and 200
Anzahl zwischen 2 und 200 ⇒ Quantity between 2 and 200
Anzeigeeinstellungen ⇒ Display settings
Anzeigen ⇒ Show
Arbeitsachse ⇒ Construction Axis
Arbeitsebene ⇒ Construction Plane
Arbeitsebene fehlt ⇒ Construction plane missing
Arbeitsebene oder ebene Fläche anklicken (noch einmal = abwählen). ⇒ Click a construction plane or planar face (again = deselect).
Arbeitspunkt ⇒ Construction Point
Arbeitspunkte lassen sich bei „Ebene durch drei Punkte“ und „Achse durch zwei Punkte“ anklicken. ⇒ Construction points can be clicked for “Plane Through Three Points” and “Axis Through Two Points”.
Art ⇒ Type
Auf dem Druckbett liegt ⇒ Lies on the print bed
auf die Fläche ⇒ onto the face
Auf die Fläche ⇒ Onto the face
auf diesem Rechner. Einrichtung: ⇒ on this computer. Setup:
Auf Fläche klicken ⇒ Click on face
Auf Kante ⇒ On edge
auf Körperkante · ⇒ on body edge ·
Auf Kurve legen ⇒ Place on curve
auf XY ⇒ on XY
Auflage ⇒ Support
Auflösen ⇒ Dissolve
Aufschneiden ⇒ Cut open
Auftrennen ⇒ Rip
Auftrennung ⇒ Rip
Auftrennung fehlgeschlagen ⇒ Rip failed
Auftrennung zwischen zwei Punkten über {0} mm{1}, Spalt {2} mm ⇒ Rip between two points over {0} mm{1}, gap {2} mm
Auftrennung: gerade Eckkanten zwischen zwei Blechwänden anklicken (außen oder innen) – oder „Zwischen zwei Punkten“ wählen und zwei Punkte auf einer ebenen Blechfläche anklicken. Die Ecke wird mit dem Spalt aufgeschnitten, danach lässt sich das Teil abwickeln. ⇒ Rip: click straight corner edges between two sheet metal walls (outside or inside) – or choose “Between two points” and click two points on a planar sheet metal face. The corner is cut open with the gap, after which the part can be unfolded.
Aus ⇒ Off
aus {0}{1} ⇒ from {0}{1}
Aus Blechregel ⇒ From sheet metal rule
Aus dem Dichtefeld entsteht keine Fläche – Zielanteil erhöhen ⇒ No surface results from the density field – increase the target fraction
aus dem Körper ⇒ from the body
Aus der Baugruppe entfernen ⇒ Remove from assembly
aus der Datei: {0} ⇒ from the file: {0}
aus einem vorhandenen Teil oder einer Baugruppe ⇒ from an existing part or assembly
Ausblenden ⇒ Hide
Ausbruch ⇒ Break-Out
Ausbruch angelegt, Tiefe {0} mm. Klick auf den Umriss ändert die Tiefe. ⇒ Break-out created, depth {0} mm. Click the outline to change the depth.
Ausbruch: Punkte des Umrisses in einer Ansicht anklicken. Klick auf den ersten Punkt schließt den Umriss. ⇒ Break-out: click the points of the outline in a view. Clicking the first point closes the outline.
Ausbruch: Umriss in einer Ansicht anklicken, Klick auf den ersten Punkt schließt ⇒ Break-out: click the outline in a view, clicking the first point closes
Ausdehnung ⇒ Extent
Ausdehnung (Gesamtmaß) ⇒ Extent (overall size)
Ausdehnung 2 ⇒ Extent 2
Ausdehnung muss größer als 0 sein ⇒ Extent must be greater than 0
Ausdehnung Richtung 2 muss größer als 0 sein ⇒ Extent in direction 2 must be greater than 0
Ausdruck ⇒ Expression
Ausdruck „{0}“: {1} ⇒ Expression “{0}”: {1}
Ausdruck fehlt ⇒ Expression missing
Ausdruck unvollständig ⇒ Expression incomplete
Ausführung ⇒ Version
Ausgabe ⇒ Output
Ausrichten ⇒ Align
Ausrichten nach ⇒ Align to
Ausrichten: erst Fläche oder Kreiskante am Teil anklicken, das bewegt werden soll, dann das Ziel. Flächen werden bündig, Kreise mittig gesetzt. ⇒ Align: first click a face or circular edge on the part to be moved, then the target. Faces are made flush, circles centered.
Ausrichtung ⇒ Orientation
Ausschneiden ⇒ Cut
Ausschneiden braucht einen vorhandenen Körper ⇒ Cut needs an existing body
Ausschneiden trifft keinen Körper – Lage oder Richtung prüfen ⇒ Cut does not hit any body – check position or direction
außen ⇒ outside
Außen ⇒ Outside
Außen-⌀ ⇒ Outer ⌀
Außenkante der Ecke nicht gefunden ⇒ Outer edge of the corner not found
Außenkanten ⇒ Outer edges
Außenkontur ⇒ Outer contour
Außenmaß ⇒ Outer dimension
Auswahl ⇒ Selection
Auswahl {0} ⇒ Selection {0}
Auswahl aufheben ⇒ Clear selection
Auswahl nicht mehr gefunden ⇒ Selection no longer found
Auswählen ⇒ Select
Auswahlfilter ⇒ Selection filter
Auswahlfilter: {0} ⇒ Selection filter: {0}
Auto-Abhängigkeit von Bezug ⇒ Auto constrain from reference
Auto-Abhängigkeit von Bezug (Bezugspunkt anklicken, dann Maße bis die Skizze bestimmt ist) ⇒ Auto constrain from reference (click the reference point, then dimensions until the sketch is fully defined)
Automatisch ⇒ Automatic
Automatisch (bis 10 min nichts Besseres) ⇒ Automatic (until nothing better for 10 min)
Automatisch: {0} von {1} Flächen (innere Formen werden zu Löchern). ⇒ Automatic: {0} of {1} faces (inner shapes become holes).
Automatische Abhängigkeiten ⇒ Automatic constraints
Basis ⇒ Base
Basis anklicken: Ursprungsebene, ebene Körperfläche oder andere Arbeitsebene. Abstand im Dialog. Skizzen darauf wandern mit. ⇒ Click the base: origin plane, planar body face or another construction plane. Distance in the dialog. Sketches on it move along.
Basis der Achse im Modell anklicken (Art im Dialog). Drehung und Muster können die Achse danach als Drehachse anklicken. ⇒ Click the base of the axis in the model (type in the dialog). Revolve and pattern can then click the axis as the axis of rotation.
Basisansicht einfügen ⇒ Insert base view
Basisebene ⇒ Base plane
Basislinie: zuerst den Bezugspunkt ⇒ Baseline: first the reference point
Basislinienbemaßung: Bezugspunkt, dann weitere Punkte, Klick ins Freie legt die Lage fest ⇒ Baseline dimension: reference point, then further points, a click into empty space sets the position
Basispunkt klicken ⇒ Click the base point
Baugruppe ⇒ Assembly
Baugruppe1 ⇒ Assembly1
Baugruppen zu tief verschachtelt ⇒ Assemblies nested too deeply
Baugruppenkonstruktion ⇒ Assembly design
Bauhöhe ⇒ Build height
Bauteil ⇒ Part
Bauteil, Baugruppe oder Zeichnung (.cantcodecad) ⇒ Part, assembly or drawing (.cantcodecad)
Bauteilkonstruktion ⇒ Part design
Bearbeiten ⇒ Edit
Bearbeitung ⇒ Machining
Bedingung ⇒ Condition
Befehl suchen ⇒ Search command
Befehl suchen … ⇒ Search command …
Beginnt am ⇒ Starts at
Begrenzender Volumenkörper ⇒ Bounding Solid
Begrenzungsfüllung ⇒ Boundary Fill
Begrenzungsfüllung (eingeschlossene Zellen füllen) ⇒ Boundary Fill (fill enclosed cells)
Begrenzungsrahmen ⇒ Bounding box
Behalten ⇒ Keep
Bei 360° verteilt sich die Anzahl gleichmäßig.{0} ⇒ At 360° the quantity is distributed evenly.{0}
Bei Bögen die Mittelpunkte oder Endpunkte einzeln symmetrisch setzen. ⇒ For arcs, set the center points or end points symmetric individually.
Bei diesem Versatz verschwindet eine Linie. Kleineren Versatz wählen. ⇒ At this offset a line disappears. Choose a smaller offset.
Beibehalten-Geometrie ⇒ Preserve Geometry
Beibehalten-Geometrie: Körper, die im Ergebnis bleiben (Augen, Anschlussflächen) – grün ⇒ Preserve Geometry: bodies that remain in the result (bosses, mounting faces) – green
Beide Gelenk-Ursprünge wählen ⇒ Select both joint origins
Beide Kanten gewählt – die Bohrung sitzt nach den Abständen in ihrer gemeinsamen Fläche. ⇒ Both edges selected – the hole sits at the distances in their common face.
Beide Punkte müssen auf derselben Blechwand liegen ⇒ Both points must lie on the same sheet metal wall
Beide Punkte müssen auf einer ebenen Fläche liegen ⇒ Both points must lie on a planar face
Beide Seiten zusammen höchstens 360° ⇒ Both sides together at most 360°
Beide Ursprünge liegen auf derselben Komponente ⇒ Both origins lie on the same component
Beide Ursprünge liegen in derselben starren Gruppe ⇒ Both origins lie in the same rigid group
Beidseitig ⇒ Two sides
Beidseitig: Flächen dürfen zu beiden Formhälften zeigen. ⇒ Two sides: faces may point to both mold halves.
Beim OK kommt der Zielkörper mit dem Ergebnis in eine neue Komponente. ⇒ On OK, the target body with the result goes into a new component.
Beim Start anzeigen ⇒ Show at startup
Bemaßen: zwei Punkte einer Ansicht anklicken, dann die Lage des Maßes. Klick auf ein Maß löscht es. ⇒ Dimension: click two points of a view, then the position of the dimension. Clicking a dimension deletes it.
Bemaßung ⇒ Dimension
Bemaßung: Linie, Kreis oder zwei Elemente anklicken, auch Körperkanten. Kreis + Linie bemaßt sofort vom Mittelpunkt, ebenso Punkt + Linie und zwei parallele Linien. Sonst den Platz klicken. Dann den Wert eintippen. ⇒ Dimension: click a line, circle or two entities, also body edges. Circle + line dimensions immediately from the center, likewise point + line and two parallel lines. Otherwise click the position. Then type the value.
Bemaßung: zwei Punkte anklicken, dann die Lage ⇒ Dimension: click two points, then the position
Bemaßungen ⇒ Dimensions
Bemaßungen oder Bedingungen halten die Auswahl teilweise fest. Gegebenenfalls Maße löschen. ⇒ Dimensions or conditions partly hold the selection. Delete dimensions if necessary.
Benennung ⇒ Title
Benutzerkoordinatensystem ⇒ User coordinate system
Benutzerkoordinatensystem (eigener Nullpunkt und Achsen für Skizzen und Muster) ⇒ User coordinate system (own origin and axes for sketches and patterns)
Berandung ⇒ Boundary
Bereich bleibt erhalten ⇒ Region is kept
Bereit ⇒ Ready
Beschreibung ⇒ Description
Beschriftung ⇒ Label
Bestand {0} ⇒ Stock {0}
Betrag ⇒ Magnitude
Betrag und Richtung einstellen, dann die Fläche einer Beibehalten-Geometrie anklicken (z. B. Bohrungswand). ⇒ Set magnitude and direction, then click the face of a Preserve Geometry (e.g. hole wall).
Bewegt ⇒ Moved
bewegt … ⇒ moving …
Bewegt wird ⇒ Moved part
Bewegte Seite ⇒ Moved side
Bewegung ⇒ Motion
Bewegung abspielen ⇒ Play motion
Bezeichnung, z. B. Kunde ⇒ Name, e.g. customer
Beziehungen ⇒ Relationships
Bezug ⇒ Reference
Bezug ist der Anfang des Pfads: das Original sollte dort liegen. Abstände werden entlang der Kurve gemessen; bei einem geschlossenen Pfad verteilt „Ganze Länge“ ringsum. ⇒ The reference is the start of the path: the original should lie there. Distances are measured along the curve; on a closed path “Full length” distributes all around.
Bezug: Fläche anklicken, dann Lage des Buchstabens ⇒ Datum: click a face, then the position of the letter
Bezüge ⇒ Datums
Bezüge gelten für Richtungs-, Orts- und Lauftoleranzen. ⇒ Datums apply to orientation, location and runout tolerances.
Bezugspunkt ⇒ Reference point
Bezugsrichtung klicken ⇒ Click the reference direction
Bibliothek ⇒ Library
Biegelinie ⇒ Bend line
Biegelinie {0} liegt auf keinem Blech ⇒ Bend line {0} does not lie on any sheet
Biegelinien ⇒ Bend lines
Biegen ⇒ Bend
Biegen nicht möglich – Linie nicht quer über das Blech oder Biegung stößt an? ⇒ Bend not possible – line not across the sheet, or bend collides?
Biegeradius ⇒ Bend radius
Biegeradius innen ⇒ Inner bend radius
Biegetabelle ⇒ Bend table
Biegewinkel ⇒ Bend angle
Biegewinkel, Richtung, Radius ⇒ Bend angle, direction, radius
Biegung {0}°, R {1} · Blech verlängert um {2} / {3} mm ⇒ Bend {0}°, R {1} · sheet extended by {2} / {3} mm
Biegungen ⇒ Bends
Bild ⇒ Image
Bild {0} × {1}: {2} von {3} Durchgängen … ⇒ Image {0} × {1}: {2} of {3} passes …
Bild ✓ ⇒ Image ✓
Bild einfügen (PNG, JPG, SVG): Datei wählen, dann die Lage auf dem Blatt anklicken ⇒ Insert image (PNG, JPG, SVG): choose a file, then click the position on the sheet
Bild laden … ⇒ Load image …
Bild mit Licht und Material ⇒ Image with lighting and material
Bild nicht möglich: ⇒ Image not possible:
Bild speichern ⇒ Save image
Bis ⇒ To
Bis Fläche ⇒ To Face
Bis Fläche: die gewählten ebenen Flächen wandern bis zur parallelen Zielfläche. Positiv zieht die Fläche heraus, negativ drückt sie hinein. Weitere Flächen bekommen denselben Abstand – „Hinzufügen …“ drücken, dann anklicken. ⇒ To Face: the selected planar faces move up to the parallel target face. Positive pulls the face out, negative pushes it in. Further faces get the same distance – press “Add …”, then click.
Bis zum Körper verlängern ⇒ Extend to the body
bis zur nächsten Kurve verlängern ⇒ extend to the next curve
Bitte eine ebene Fläche anklicken. ⇒ Please click a planar face.
Bitte eine ebene Fläche wählen. ⇒ Please select a planar face.
Bitte eine gerade Kante der schrägen Fläche in einer Normalansicht anklicken. ⇒ Please click a straight edge of the inclined face in a normal view.
Bitte eine Kante in einer Normalansicht anklicken. ⇒ Please click an edge in a normal view.
Bitte eine Linie anklicken (auch die Achsen gehen). ⇒ Please click a line (the axes work too).
Bitte eine Zahl oder einen Ausdruck eingeben, zum Beispiel 40, 60/2 oder breite/2. ⇒ Please enter a number or an expression, for example 40, 60/2 or width/2.
Bitte einen Abstand größer als 0 eingeben. ⇒ Please enter a distance greater than 0.
Bitte einen Änderungsbuchstaben eintragen. ⇒ Please enter a revision letter.
Bitte einen Faktor größer als 0 eingeben, z. B. 2 oder 1/2. ⇒ Please enter a factor greater than 0, e.g. 2 or 1/2.
Bitte einen Namen eingeben. ⇒ Please enter a name.
Bitte erst einen Namen eingeben. ⇒ Please enter a name first.
Bitte gültige Werte eingeben. ⇒ Please enter valid values.
Bitte in eine Normalansicht klicken (keine Isometrie, kein Schnitt). ⇒ Please click into a normal view (no isometric, no section).
Bitte in eine Normalansicht klicken (keine Isometrie, keine Schnittansicht). ⇒ Please click into a normal view (no isometric, no section view).
Bitte in eine Normalansicht klicken (keine Isometrie). ⇒ Please click into a normal view (no isometric).
Bitte in eine Normalansicht klicken. ⇒ Please click into a normal view.
Bitte zuerst die markierten Parameter korrigieren. ⇒ Please correct the marked parameters first.
Blatt ⇒ Sheet
Blatt · Maßstab ⇒ Sheet · Scale
Blatt {2} ⇒ Sheet {2}
Blatt {3} ⇒ Sheet {3}
Blätter ⇒ Sheets
Blech ⇒ Sheet Metal
Blech;Dicke mm;Maße mm;Stück ⇒ Sheet;Thickness mm;Size mm;Qty
Blechabrundung ⇒ Sheet Metal Fillet
Blechabrundung / -fase ⇒ Sheet metal fillet / chamfer
Blechabrundung / -fase: Ecken des Zuschnitts anklicken (Kanten in Dickenrichtung) oder „Alle Ecken“. Die Abwicklung zeigt die Rundungen. ⇒ Sheet metal fillet / chamfer: click corners of the blank (edges in thickness direction) or “All corners”. The flat pattern shows the rounds.
Blechdicke ⇒ Sheet thickness
Blechdicke fehlt (Blechregel) ⇒ Sheet thickness missing (sheet metal rule)
Bleche ⇒ Sheets
Blechfläche an der Kante nicht gefunden ⇒ Sheet metal face at the edge not found
Blechfläche anklicken … ⇒ Click a sheet metal face …
Blechkanten anklicken ⇒ Click sheet metal edges
Blechmitte ⇒ Sheet middle
Blechregel ⇒ Sheet Metal Rule
Blechregel{0}: {1} mm, R {2}, K {3} ⇒ Sheet metal rule{0}: {1} mm, R {2}, K {3}
Blechregeln ⇒ Sheet Metal Rules
Blechteile auf Tafeln ⇒ Sheet metal parts on sheets
Boden mit Schatten ⇒ Ground with shadow
Bogen ⇒ Arc
Bögen ⇒ Arcs
Bogen durch 3 Punkte ⇒ 3-Point Arc
Bogen mit Mittelpunkt ⇒ Center Point Arc
Bogen mit Mittelpunkt: Mitte klicken, dann den Anfang (legt den Radius fest), dann das Ende. Der Bogen folgt der Mausbewegung. ⇒ Center point arc: click the center, then the start (sets the radius), then the end. The arc follows the mouse.
Bogen-Langloch (3 Punkte) ⇒ 3-Point Arc Slot
Bogen-Langloch (Mittelpunkt) ⇒ Center Point Arc Slot
Bogen: Anfang klicken, dann Ende, dann einen Punkt, durch den der Bogen läuft. ⇒ Arc: click the start, then the end, then a point the arc passes through.
Bogen: r muss größer als 0 sein. ⇒ Arc: r must be greater than 0.
Bogenlänge ⌒ {3} ⇒ Arc length ⌒ {3}
Bohren braucht einen vorhandenen Körper ⇒ Drilling needs an existing body
Bohrgrund ⇒ Hole bottom
Bohrtiefe ⇒ Hole depth
Bohrtiefe muss größer als 0 sein ⇒ Hole depth must be greater than 0
Bohrung ⇒ Hole
Bohrung nicht möglich – Maße prüfen. ⇒ Hole not possible – check dimensions.
Bohrung ohne Länge ⇒ Hole without length
Bohrung, Rundung oder Fase anklicken … ⇒ Click a hole, fillet or chamfer …
Bohrungen ⇒ Holes
Bohrungen sitzen auf den einzelnen Punkten der Skizze (ohne Punkte: auf den Kreismitten). „Kreismitte“ bohrt in der Mitte einer runden Kante im Modell, „Zwei Kanten“ setzt die Bohrung nach Abständen in eine Fläche. Sie gehen automatisch ins Material, „Umgekehrt“ dreht die Richtung. ⇒ Holes sit on the individual points of the sketch (without points: on the circle centers). “Circle center” drills at the center of a round edge in the model, “Two edges” places the hole in a face by distances. They go into the material automatically, “Reversed” flips the direction.
Bohrungsbeschriftungen ⇒ Hole callouts
Bohrungsdurchmesser muss größer als 0 sein ⇒ Hole diameter must be greater than 0
Bohrungsrand ⇒ Hole edge
Bohrungsrand (Kreiskante) nicht mehr gefunden ⇒ Hole edge (circular edge) no longer found
Bohrungsrand anklicken … (sonst frei) ⇒ Click a hole edge … (otherwise free)
Bohrungsskizze ⇒ Hole sketch
Bohrungstabelle ⇒ Hole Table
Bohrungstabelle mit {0} Bohrung{1} angelegt. Klick auf die Überschrift: löschen. ⇒ Hole table with {0} hole{1:s} created. Click on the heading: delete.
Bohrungstabelle: Nullpunkt (Eck- oder Mittelpunkt) in einer Ansicht anklicken, dann die Lage der Tabelle. ⇒ Hole table: click the origin (corner or center point) in a view, then the position of the table.
Bohrungstabelle: Nullpunkt in einer Ansicht anklicken, dann die Lage der Tabelle ⇒ Hole table: click the origin in a view, then the position of the table
Bolzen oder Bohrung anklicken … ⇒ Click a bolt or hole …
Boolesche Operation ohne Ergebnis ⇒ Boolean operation without result
Boolesche Operation: ⇒ Boolean operation:
Breite ⇒ Width
Breite (Y) ⇒ Width (Y)
Breite muss größer als 0 sein ⇒ Width must be greater than 0
Buchstabe ⇒ Letter
bündig ⇒ flush
Cache lesen {0} ⇒ Read cache {0}
Cache sichern {0} ⇒ Save cache {0}
Claude (Claude-App oder Claude Code) kann dann am offenen Dokument konstruieren – über den MCP-Server ⇒ Claude (Claude app or Claude Code) can then design on the open document – via the MCP server
Claude ist mit cantcodecad verbunden. ⇒ Claude is connected to cantcodecad.
Claude-Anbindung (MCP) ⇒ Claude connection (MCP)
Claude-Anbindung an: cantcodecad wartet auf Aufträge vom MCP-Server. ⇒ Claude connection on: cantcodecad is waiting for jobs from the MCP server.
Claude-Anbindung aus. ⇒ Claude connection off.
cantcodecad (*.cantcodecad)|*.cantcodecad|Alle Dateien (*.*)|*.* ⇒ cantcodecad (*.cantcodecad)|*.cantcodecad|All files (*.*)|*.*
CSV speichern ⇒ Save CSV
Dafür braucht es einen Körper. Erst eine Skizze extrudieren. ⇒ This needs a body. Extrude a sketch first.
Dafür zwei Linien wählen. ⇒ Select two lines for this.
Darstellung ⇒ Appearance
Darüber ⇒ Above
Darunter ⇒ Below
Das abgeleitete Dokument fehlt ⇒ The derived document is missing
Das aktuelle Teil ist kein Blechteil (keine Abwicklung). ⇒ The current part is not a sheet metal part (no flat pattern).
Das Bild ist zu groß (höchstens 4 MB). ⇒ The image is too large (at most 4 MB).
Das Bogen-Langloch ⇒ The arc slot
Das Bogen-Langloch braucht einen Winkel unter 360°. ⇒ The arc slot needs an angle below 360°.
Das Bogen-Langloch muss schmaler sein als der Radius der Mittellinie. ⇒ The arc slot must be narrower than the radius of the center line.
Das Dokument hat keine sichtbaren Körper ⇒ The document has no visible bodies
Das Dokument hat keinen sichtbaren Körper für eine Zeichnung. ⇒ The document has no visible body for a drawing.
Das Ergebnis enthält keinen Umriss ⇒ The result contains no outline
Das ist das geöffnete Dokument selbst. ⇒ This is the open document itself.
Das ist eine Zeichnung, kein Teil und keine Baugruppe. ⇒ This is a drawing, not a part and not an assembly.
Das ist keine cantcodecad-Datei. ⇒ This is not a cantcodecad file.
Das Kopieren ⇒ Copying
Das Langloch ⇒ The slot
Das Langloch braucht eine Länge und eine Breite. ⇒ The slot needs a length and a width.
Das Langloch ist kürzer als breit. ⇒ The slot is shorter than it is wide.
Das letzte Blatt bleibt. ⇒ The last sheet stays.
Das Loch füllt die ganze Erhebung ⇒ The hole fills the whole boss
Das Maß ⇒ The dimension
Das Maß muss größer als 0 sein. ⇒ The dimension must be greater than 0.
Das Modell hat ungespeicherte Änderungen. Die Zeichnung zeigt sie; beim nächsten Öffnen gilt die gespeicherte Datei. ⇒ The model has unsaved changes. The drawing shows them; on the next opening the saved file applies.
Das Modell ist noch nicht gespeichert: Die Zeichnung enthält eine Kopie davon (ohne Verknüpfung). ⇒ The model is not saved yet: the drawing contains a copy of it (without link).
Das Muster ⇒ The pattern
Das Profil liegt auf beiden Seiten der Drehachse. Es muss ganz auf einer Seite liegen (die Achse darf es berühren). ⇒ The profile lies on both sides of the axis. It must lie entirely on one side (the axis may touch it).
Das Profil liegt auf dem Pfadpunkt ⇒ The profile lies on the path point
Das Profil ließ sich nicht auf die Fläche legen ⇒ The profile could not be placed on the face
Das Profil trifft die gewählte Fläche nicht ⇒ The profile does not hit the selected face
Das Raster wird zu fein – die Teilung vergrößern ⇒ The grid gets too fine – increase the spacing
Das Rechteck ⇒ The rectangle
Das Rechteck braucht eine Breite und eine Höhe. ⇒ The rectangle needs a width and a height.
Das Skalieren ⇒ Scaling
Das Spiegeln ⇒ Mirroring
Das Stutzen ⇒ Trimming
Das Teil enthält diese Baugruppe selbst. ⇒ The part contains this assembly itself.
Das Teil wird verknüpft: Änderst und speicherst du es, aktualisiert sich die Baugruppe beim Öffnen oder mit „Teile aktualisieren“. ⇒ The part is linked: if you change and save it, the assembly updates on opening or with “Update parts”.
Das Teilungswerkzeug trifft keine der gewählten Flächen ⇒ The splitting tool does not hit any of the selected faces
Das Tragwerk ist vollständig gehalten ⇒ The structure is fully supported
Das Tragwerk lässt sich nicht lösen – Halterungen prüfen (mechanisches System) ⇒ The structure cannot be solved – check the supports (mechanism)
Das Unterbrechen ⇒ Breaking
Das Verlängern ⇒ Extending
Das Verschieben ⇒ Moving
Das Vieleck ⇒ The polygon
Das Vieleck braucht eine Größe. ⇒ The polygon needs a size.
Das Werkzeug schneidet keinen Körper ⇒ The tool does not cut any body
Datei ⇒ File
Datei {0} ⇒ File {0}
Datei eingelesen in {0} ms{1}. ⇒ File read in {0} ms{1}.
Datei konnte nicht gelesen werden ⇒ File could not be read
Datei konnte nicht geöffnet werden: ⇒ File could not be opened:
Datei nicht gefunden ⇒ File not found
Datei nicht gefunden: ⇒ File not found:
Datei nicht lesbar ⇒ File not readable
Datei nicht lesbar: ⇒ File not readable:
Datei öffnen … ⇒ Open file …
Dateidialog nicht verfügbar ⇒ File dialog not available
Datum ⇒ Date
Dauerspeicher beim Browser {0} ({1} von {2}) ⇒ Persistent storage in the browser {0} ({1} of {2})
Dauerspeicher leer ⇒ Persistent storage empty
Dauerspeicher lesen {0} ({1}) ⇒ Read persistent storage {0} ({1})
Dauerspeicher schreiben {0} ({1} von {2}, {3}{4}{5}) ⇒ Write persistent storage {0} ({1} of {2}, {3}{4}{5})
davon {0} ⇒ of which {0}
Dazu offene Linienzüge ({0}) als Wand. ⇒ Plus open polylines ({0}) as wall.
Deckkraft ⇒ Opacity
Deckungsgleich ⇒ Coincident
Deckungsgleich (Flächen) ⇒ Coincident (faces)
Deckungsgleich braucht zwei ebene Flächen ⇒ Coincident needs two planar faces
Definieren ⇒ Define
Dehnen ⇒ Stretch
Dem Pfad folgen ⇒ Follow path
Den Punkt am Körper anklicken und die Zielkoordinaten eingeben – der Körper wandert so, dass der Punkt dort liegt. ⇒ Click the point on the body and enter the target coordinates – the body moves so that the point lies there.
Den Werkzeugkörper gibt es nicht mehr ⇒ The tool body no longer exists
Der Abstand je Windung ({0} mm) ist kleiner als der Querschnitt – die Windungen würden sich berühren ⇒ The distance per turn ({0} mm) is smaller than the cross-section – the turns would touch
Der Bogen ⇒ The arc
Der Browser liefert nur {0} Bilder pro Sekunde, egal was cantcodecad zeichnet. Meist ist der Energiesparmodus an (Edge: Effizienzmodus, Chrome: Energiesparmodus) oder der Monitor läuft mit 30 Hz. ⇒ The browser delivers only {0} frames per second, no matter what cantcodecad draws. Usually power saving is on (Edge: efficiency mode, Chrome: energy saver) or the monitor runs at 30 Hz.
Der Browser rechnet die 3D-Ansicht ohne Grafikkarte. In den Browser-Einstellungen unter System die Hardwarebeschleunigung einschalten und den Browser neu starten. ⇒ The browser computes the 3D view without a graphics card. Turn on hardware acceleration in the browser settings under System and restart the browser.
Der cantcodecad-Server kennt den Nester noch nicht (Server bzw. Desktop-Programm neu starten). ⇒ The cantcodecad server does not know the nester yet (restart the server or desktop program).
Der Designbereich ist leer ⇒ The design space is empty
Der Designbereich ist zu klein ⇒ The design space is too small
Der Endpunkt liegt in Verlängerung der Kurve. ⇒ The end point lies on the extension of the curve.
Der Faktor muss größer als 0 sein ⇒ The factor must be greater than 0
Der Geometriekern konnte diesen Schritt nicht ausführen. ⇒ The geometry kernel could not perform this step.
Der Geometriekern konnte nicht starten ⇒ The geometry kernel could not start
Der Geometriekern lädt noch. ⇒ The geometry kernel is still loading.
Der Körper bleibt ganz; alle Flächen, die die Ebene trifft, werden an ihr geteilt (z. B. Trennlinie für eine Formschräge, Markierung auf Blech). Mit „Nur gewählte Flächen“ trifft die Teilung ausschließlich die angeklickten Flächen. ⇒ The body stays whole; all faces hit by the plane are split at it (e.g. parting line for a draft, marking on sheet metal). With “Only selected faces” the split affects only the clicked faces.
Der Körper muss überall gleich dick sein (z. B. Schale, Profil oder importiertes Blechteil). Rundungen werden zu Biegungen, scharfe Kanten zu Biegungen mit Radius 0, Ecken zu Trennstellen. K-Faktor {0} aus der Blechregel. ⇒ The body must be equally thick everywhere (e.g. shell, profile or imported sheet metal part). Rounds become bends, sharp edges become bends with radius 0, corners become rips. K-factor {0} from the sheet metal rule.
Der Kreis ⇒ The circle
Der Nester startet nicht. Läuft start.bat des Nesters von Hand? ⇒ The nester does not start. Does the nester's start.bat run by hand?
Der Neuaufbau dauert länger als 120 s. ⇒ The rebuild takes longer than 120 s.
Der Pfad ist nicht zusammenhängend ⇒ The path is not continuous
Der Pfad ist nur {0} mm lang – {1} Stück mit {2} mm Abstand passen nicht ⇒ The path is only {0} mm long – {1} pieces with {2} mm spacing do not fit
Der Pfad sind alle normalen Kurven der Pfad-Skizze als zusammenhängende Kette (Linien, Bögen oder ein Kreis). Profile mit Loch ergeben Rohre. ⇒ The path is all normal curves of the path sketch as a continuous chain (lines, arcs or a circle). Profiles with a hole result in tubes.
Der Pfad sind alle normalen Kurven der Skizze als zusammenhängende Kette. Der Querschnitt sitzt mittig auf dem Pfad, ohne eigene Profilskizze. Teilstrecke: vom Pfadanfang bzw. von „ab“ bis „bis“, jedes Ende senkrecht zum Pfad abgeschnitten Abstand 1 und 2, nur in % der Pfadlänge. ⇒ The path is all normal curves of the sketch as a continuous chain. The cross-section sits centered on the path, without its own profile sketch. Partial length: from the path start or from “from” to “to”, each end cut perpendicular to the path – distance 1 and 2, only in % of the path length.
Der Pfad verzweigt sich ⇒ The path branches
Der Punkt ⇒ The point
Der Querschnitt ist zu groß für den Durchmesser ⇒ The cross-section is too large for the diameter
Der Radius dieser Kante ist zu klein ⇒ The radius of this edge is too small
Der Radius ist zu groß für diese Ecke. ⇒ The radius is too large for this corner.
Der Ring braucht mindestens drei Profile; er wird an der Stelle des ersten Profils geschlossen. ⇒ The closed loft needs at least three profiles; it is closed at the position of the first profile.
Der Rohrdurchmesser muss kleiner als der Torusdurchmesser sein ⇒ The tube diameter must be smaller than the torus diameter
Der Skizzen-Solver konnte nicht laden: ⇒ The sketch solver could not load:
Der Spline ⇒ The spline
Der Start liegt auf der Zielfläche ⇒ The start lies on the target face
Der Steg c muss kleiner als die Nahttiefe s sein ⇒ The web c must be smaller than the weld depth s
Der Teil auf der Normalenseite wird ein neuer Körper. ⇒ The part on the normal side becomes a new body.
Der Text ⇒ The text
Der Versatz ⇒ The offset
Der Versatz ist größer als ein Radius der Kette. ⇒ The offset is larger than a radius of the chain.
Der Werkzeugkörper fehlt ⇒ The tool body is missing
Der Werkzeugkörper schneidet keinen der Körper ⇒ The tool body does not cut any of the bodies
Der Winkel muss zwischen 0° und 90° liegen ⇒ The angle must be between 0° and 90°
Designbereich ⇒ Design Space
Designbereich anklicken, Punkten eine Rolle geben – dann „Vorschau berechnen“ oder OK (rechnet einige Sekunden). ⇒ Click the design space, give points a role – then “Compute preview” or OK (takes a few seconds).
Designbereich: eine ebene Fläche eines Körpers anklicken ⇒ Design space: click a planar face of a body
Designbereich: eine geschlossene Fläche der Skizze wählen ⇒ Design space: select a closed region of the sketch
Designbereich: Flächen der Skizze im Modell anklicken (ohne Auswahl alle äußeren Flächen mit ihren Löchern). ⇒ Design space: click regions of the sketch in the model (without selection, all outer regions with their holes).
Detailansicht: Kreis um den Ausschnitt ziehen ⇒ Detail view: drag a circle around the detail
Diagnose anzeigen ⇒ Show diagnostics
Dichte ⇒ Density
Dichtefeld ⇒ Density field
Dicke ⇒ Thickness
Dicke {0} mm · {1} Biegung{2} · {3} Flächen abgewickelt{4} ⇒ Thickness {0} mm · {1} bend{2:s} · {3} faces unfolded{4}
Dicke {0} mm aus der Blechregel (Biegeradius {1}, K-Faktor {2}). ⇒ Thickness {0} mm from the sheet metal rule (bend radius {1}, K-factor {2}).
Dicke {0} mm weicht von der Blechregel ({1} mm) ab ⇒ Thickness {0} mm differs from the sheet metal rule ({1} mm)
Dicke muss größer als 0 sein ⇒ Thickness must be greater than 0
dicke*2 + 1 mm ⇒ thickness*2 + 1 mm
Die 3D-Ansicht läuft ohne Grafikkarte (Software). Abhilfe: cantcodecad in Chrome öffnen (nicht in einer eingebetteten Ansicht), unter Einstellungen → System „Grafikbeschleunigung verwenden, wenn verfügbar“ einschalten, Chrome neu starten und unter chrome://gpu prüfen. ⇒ The 3D view runs without a graphics card (software). Remedy: open cantcodecad in Chrome (not in an embedded view), turn on “Use graphics acceleration when available” under Settings → System, restart Chrome and check under chrome://gpu.
Die Abhängigkeiten widersprechen sich – so lässt sich die Komponente nicht legen ⇒ The constraints contradict each other – the component cannot be placed this way
Die Absetzung ist zu kurz. ⇒ The offset is too short.
Die Abstände müssen 0 oder größer sein ⇒ The distances must be 0 or greater
Die Achse steht senkrecht auf der Skizzenebene und lässt sich nicht projizieren ⇒ The axis is perpendicular to the sketch plane and cannot be projected
Die Achslinie gibt es in der Skizze nicht mehr ⇒ The axis line no longer exists in the sketch
Die Änderung ⇒ The change
Die angeklickte Fläche (mit ihren Bohrungen) ist der Designbereich – sie muss parallel zur Skizze liegen. Kräfte und Halterungen in eigenen kleinen Skizzenflächen (z. B. Kreis um eine Bohrung) bleiben automatisch als Material erhalten Beibehalten-Geometrie. ⇒ The clicked face (with its holes) is the design space – it must be parallel to the sketch. Forces and supports in their own small sketch regions (e.g. a circle around a hole) are kept as material automatically Preserve Geometry.
Die Ausgangselemente des Musters gibt es nicht mehr. ⇒ The source entities of the pattern no longer exist.
Die Auswahl wird zur Vorauswahl im Modell – danach z. B. „Elemente entfernen“, „Abrunden“ oder „Gewinde“ aufrufen, oder mit Shift-Klick ergänzen. ⇒ The selection becomes the preselection in the model – then e.g. call “Defeature”, “Fillet” or “Thread”, or add with Shift-click.
Die Basis der Achse fehlt ⇒ The base of the axis is missing
Die Basis der Arbeitsebene fehlt ⇒ The base of the construction plane is missing
Die Basis des Benutzerkoordinatensystems fehlt ⇒ The base of the user coordinate system is missing
Die Basis des Gelenkursprungs gibt es nicht mehr ⇒ The base of the joint origin no longer exists
Die Basis dieser Arbeitsebene fehlt. ⇒ The base of this construction plane is missing.
Die Basisebene fehlt ⇒ The base plane is missing
Die Baugruppe enthält Komponenten, eingefügte Teile, Gelenke oder Normteile und bleibt deshalb eine Baugruppe. ⇒ The assembly contains components, inserted parts, joints or fasteners and therefore remains an assembly.
Die Beibehalten-Geometrie schneidet die Ebene nicht – Schneidrichtung prüfen. ⇒ The Preserve Geometry does not intersect the plane – check the cutting direction.
Die beiden Ebenen sind nicht parallel. ⇒ The two planes are not parallel.
Die beiden Ebenen sind parallel oder fehlen ⇒ The two planes are parallel or missing
Die beiden Ebenen sind parallel, sie schneiden sich nicht. ⇒ The two planes are parallel, they do not intersect.
Die beiden Enden liegen aufeinander. ⇒ The two ends lie on top of each other.
Die beiden Hälften lassen sich nicht verbinden ⇒ The two halves cannot be joined
Die beiden Kanten liegen nicht in einer Ebene. ⇒ The two edges do not lie in one plane.
Die beiden Kanten liegen nicht in einer Fläche ⇒ The two edges do not lie in one face
Die beiden Kanten sind parallel – die Lage ist nicht bestimmt ⇒ The two edges are parallel – the position is not defined
Die beiden Punkte liegen aufeinander ⇒ The two points lie on top of each other
Die beiden Richtungen müssen verschieden sein ⇒ The two directions must be different
Die beiden Schienen berühren das Profil am selben Punkt ⇒ The two rails touch the profile at the same point
Die beiden Seiten lassen sich nicht verbinden ⇒ The two sides cannot be joined
Die bewegte Komponente fehlt ⇒ The moved component is missing
Die bewegte Komponente hat keine Körper ⇒ The moved component has no bodies
Die Bezüge schneiden sich nicht in einem Punkt (parallel?) ⇒ The references do not intersect in one point (parallel?)
Die Biegelinie kreuzt das Blech nicht ⇒ The bend line does not cross the sheet
Die Biegelinie liegt auf keinem Blech ⇒ The bend line does not lie on any sheet
Die Biegelinie muss auf einer Blechfläche liegen ⇒ The bend line must lie on a sheet metal face
Die Bleche liegen in einer Ebene oder sind parallel ⇒ The sheets lie in one plane or are parallel
Die Bleche sind parallel – keine Biegung möglich ⇒ The sheets are parallel – no bend possible
Die Bohrung ist größer als das Gewinde ⇒ The hole is larger than the thread
Die Datei ist größer als 100 MB – bitte kleiner exportieren. ⇒ The file is larger than 100 MB – please export smaller.
Die Dicke des Ergebnisses ist 0 ⇒ The thickness of the result is 0
Die drei Linien haben keinen gemeinsamen Berührkreis (z. B. alle parallel). ⇒ The three lines have no common tangent circle (e.g. all parallel).
Die drei Punkte liegen auf einer Geraden. ⇒ The three points lie on a straight line.
Die drei Punkte liegen auf einer Linie. ⇒ The three points lie on a line.
Die Dreiecke werden zu einem Körper zusammengesetzt, das dauert bei großen Dateien einige Sekunden. ⇒ The triangles are assembled into one body, which takes a few seconds for large files.
Die Ebene schneidet keinen der Körper ⇒ The plane does not intersect any of the bodies
Die Ellipse ⇒ The ellipse
Die erhaltenen Bereiche sind größer als der Zielanteil ⇒ The preserved regions are larger than the target fraction
Die erste Anordnung wird berechnet … ⇒ Computing the first arrangement …
Die erste Auswahl muss auf einer Komponente liegen – sie wird bewegt. ⇒ The first selection must lie on a component – it will be moved.
Die Explosionsansicht braucht mindestens zwei sichtbare Körper. ⇒ The exploded view needs at least two visible bodies.
Die Extrusion beginnt auf der angeklickten ebenen Fläche. Der Versatz gilt von dieser Fläche aus, entlang der Extrusionsrichtung. ⇒ The extrusion starts on the clicked planar face. The offset applies from this face, along the extrude direction.
Die Fase ⇒ The chamfer
Die Fase ist zu groß für das Blech ⇒ The chamfer is too large for the sheet
Die Fase ist zu groß für diese Ecke. ⇒ The chamfer is too large for this corner.
Die feste Fläche muss eben sein ⇒ The stationary face must be planar
Die Fläche des Designbereichs gibt es nicht mehr ⇒ The face of the design space no longer exists
Die Fläche des Designbereichs liegt nicht parallel zur Skizzenebene ⇒ The face of the design space is not parallel to the sketch plane
Die Führungsschiene braucht eine eigene Skizze ⇒ The guide rail needs its own sketch
Die Führungsschiene muss neben dem Pfad liegen und die Profilebene kreuzen ⇒ The guide rail must lie beside the path and cross the profile plane
Die Führungsschiene reicht nicht über den ganzen Pfad ⇒ The guide rail does not reach over the whole path
Die gewählte Fläche gibt es nicht mehr ⇒ The selected face no longer exists
Die gewählte Fläche ist keine Biegung ⇒ The selected face is not a bend
Die gewählte Kante gibt es nicht mehr ⇒ The selected edge no longer exists
Die gewählte Kreiskante passt nicht ⇒ The selected circular edge does not fit
Die gewählten Features haben keinen gültigen Körper ⇒ The selected features have no valid body
Die gewählten Kanten gibt es nicht mehr ⇒ The selected edges no longer exist
Die gewählten Komponenten bewegen sich ab hier wie ein Teil: Ein Gelenk oder Verschieben an einer von ihnen nimmt alle anderen mit. ⇒ From here on, the selected components move like one part: a joint or move on one of them takes all the others along.
Die gewählten Körper gibt es im Dokument nicht mehr ⇒ The selected bodies no longer exist in the document
Die gewählten Körper gibt es nicht mehr ⇒ The selected bodies no longer exist
Die gewählten Linien bilden keine geschlossene Kette (jede Ecke genau zwei Linien). ⇒ The selected lines do not form a closed chain (exactly two lines at each corner).
Die gewählten Profile gibt es in der Skizze nicht mehr ⇒ The selected profiles no longer exist in the sketch
Die Größe muss größer als 0 sein ⇒ The size must be greater than 0
Die Grundlasche hat kein Profil ⇒ The base flange has no profile
Die Haut des Körpers ließ sich nicht bilden – Prägetiefe kleiner wählen ⇒ The skin of the body could not be formed – choose a smaller emboss depth
Die Höhe folgt dem Seitenverhältnis ({2} mm). Mit der Maus verschieben. ⇒ The height follows the aspect ratio ({2} mm). Move with the mouse.
Die Höhe reicht nicht für die geschlossenen Endwindungen ⇒ The height is not enough for the closed end coils
Die Kanten müssen parallel sein ⇒ The edges must be parallel
Die Kanten müssen zu zwei verschiedenen Körpern gehören ⇒ The edges must belong to two different bodies
Die Kanten überlappen sich nicht ⇒ The edges do not overlap
Die konische Kurve ⇒ The conic curve
Die Kontur darf nur aus Linien bestehen (Biegungen entstehen automatisch) ⇒ The contour may consist only of lines (bends are created automatically)
Die Kontur der Profile wird zur Wand mit eigener Dicke – aus einem geschlossenen Profil wird ein Hohlkörper. „Seite 1“ liegt im Profil, „Seite 2“ außerhalb, „Mitte“ beidseitig. Auch offene Linienzüge funktionieren, z. B. die Mittellinie eines U-Profils: „Seite 1“ ist dann links von der Zugrichtung, „Seite 2“ rechts. ⇒ The contour of the profiles becomes a wall with its own thickness – a closed profile becomes a hollow body. “Side 1” lies inside the profile, “Side 2” outside, “Center” on both sides. Open polylines also work, e.g. the center line of a U-profile: “Side 1” is then left of the extrude direction, “Side 2” right.
Die Kontur hat eine Linie der Länge 0 ⇒ The contour has a line of length 0
Die Kontur ist nicht zusammenhängend ⇒ The contour is not continuous
Die Kontur muss ein offener Linienzug sein ⇒ The contour must be an open polyline
Die Kontur trennt keinen der Körper ⇒ The contour does not separate any of the bodies
Die Kontur verzweigt sich ⇒ The contour branches
Die Körper des Dokuments werden an ihrer Lage übernommen und bleiben verknüpft: Änderst und speicherst du das Dokument, aktualisiert sich die Ableitung beim Öffnen oder mit „Teile aktualisieren“. ⇒ The bodies of the document are taken over at their position and remain linked: if you change and save the document, the derive updates on opening or with “Update parts”.
Die Körper haben entlang der Schneidrichtung keine Dicke. ⇒ The bodies have no thickness along the cutting direction.
Die Körper verschwinden ab dieser Stelle der Zeitleiste. Features davor bleiben unverändert. ⇒ The bodies disappear from this point of the timeline. Features before it stay unchanged.
Die Kurve wird hier von keiner anderen geschnitten – nichts zu unterbrechen. ⇒ The curve is not intersected by any other here – nothing to break.
Die Lage des Punkts fehlt ⇒ The position of the point is missing
Die Linie ⇒ The line
Die Linie liegt auf der Blechfläche und ist die Mitte der Biegezone. Biegezugabe {0} mm (t {1}, R {2}, K {3}). ⇒ The line lies on the sheet metal face and is the center of the bend zone. Bend allowance {0} mm (t {1}, R {2}, K {3}).
Die Linien sind parallel. Für einen Abstand zwei Punkte anklicken. ⇒ The lines are parallel. Click two points for a distance.
Die Mittellinie braucht eine eigene Skizze ⇒ The center line needs its own sketch
Die Pfad-Skizze fehlt ⇒ The path sketch is missing
Die Profil-Skizze fehlt ⇒ The profile sketch is missing
Die Profile liegen aufeinander ⇒ The profiles lie on top of each other
Die Profilkontur lässt sich nicht schließen ⇒ The profile contour cannot be closed
Die Punkte fallen zusammen. ⇒ The points coincide.
Die Punkte liegen in dieser Richtung übereinander – keine Maße. ⇒ The points lie on top of each other in this direction – no dimensions.
Die Randlinien der Wand passen nicht zusammen ⇒ The edge lines of the wall do not fit together
Die Rippe trifft den Körper nicht – liegt die Linie in einer offenen Ecke? ⇒ The rib does not hit the body – does the line lie in an open corner?
Die Schiene beginnt in der Profilmitte ⇒ The rail starts at the profile center
Die Schnittfläche ist orange gefüllt. Der Schnitt bleibt beim Weiterarbeiten sichtbar. ⇒ The section face is filled orange. The section stays visible while you continue working.
Die Schnittlinie ist zu kurz. ⇒ The section line is too short.
Die Schnittlinie trifft das Teil nicht. ⇒ The section line does not hit the part.
Die Senkung ist tiefer als die Bohrung ⇒ The countersink is deeper than the hole
Die Skizze braucht eine geschlossene Kontur ⇒ The sketch needs a closed contour
Die Skizze braucht eine Linie als Biegelinie ⇒ The sketch needs a line as the bend line
Die Skizze braucht eine Linie für die Rippe ⇒ The sketch needs a line for the rib
Die Skizze braucht Linien für den Steg ⇒ The sketch needs lines for the web
Die Skizze braucht mindestens zwei einzelne Punkte ⇒ The sketch needs at least two individual points
Die Skizze der Führungsschiene fehlt ⇒ The sketch of the guide rail is missing
Die Skizze der Mittellinie fehlt ⇒ The sketch of the center line is missing
Die Skizze des Designbereichs fehlt ⇒ The sketch of the design space is missing
Die Skizze einer Schiene fehlt ⇒ The sketch of a rail is missing
Die Skizze fehlt ⇒ The sketch is missing
Die Skizze hat kein geschlossenes Profil, aber offene Linienzüge ({0}) – die werden als Wand mit eigener Dicke extrudiert. ⇒ The sketch has no closed profile, but open polylines ({0}) – these are extruded as a wall with its own thickness.
Die Skizze hat kein Profil ⇒ The sketch has no profile
Die Skizze hat keine einzelnen Punkte oder Kreise für Bohrungen ⇒ The sketch has no individual points or circles for holes
Die Skizze hat keine einzelnen Punkte oder Kreise. ⇒ The sketch has no individual points or circles.
Die Skizze hat keine Kurven. ⇒ The sketch has no curves.
Die Skizze hat keine Linien für Stäbe ⇒ The sketch has no lines for members
Die Skizze hat keine Punkte – Ecken, Kreismitten oder einzelne Punkte zeichnen. ⇒ The sketch has no points – draw corners, circle centers or individual points.
Die Skizze hat noch kein geschlossenes Profil. ⇒ The sketch has no closed profile yet.
Die Skizze lässt sich mit den geänderten Bezügen nicht lösen ⇒ The sketch cannot be solved with the changed references
Die Skizzenebene schneidet keinen Körper. ⇒ The sketch plane does not intersect any body.
Die Spiegelachse muss eine Linie sein. ⇒ The mirror line must be a line.
Die Startfläche liegt nicht parallel zur Skizze ⇒ The start face is not parallel to the sketch
Die Steigung ({0} mm) ist kleiner als der Querschnitt – die Windungen würden sich durchdringen ⇒ The pitch ({0} mm) is smaller than the cross-section – the turns would intersect
Die STL-Datei enthält keine Dreiecke ⇒ The STL file contains no triangles
Die Verrundung ⇒ The fillet
Die Versätze sind länger als die Kante ⇒ The setbacks are longer than the edge
Die Verschmelzungskurve ⇒ The blend curve
Die versetzten Kurven treffen sich nicht. Kleineren Versatz wählen. ⇒ The offset curves do not meet. Choose a smaller offset.
Die Vorlage ist zu groß (höchstens 200 KB) ⇒ The template is too large (at most 200 KB)
Die Wand ist zu dick für die Kontur – Wanddicke kleiner wählen ⇒ The wall is too thick for the contour – choose a smaller wall thickness
Die Wand lässt sich entlang des Linienzugs nicht bauen ( ⇒ The wall cannot be built along the polyline (
Die Wand lässt sich nicht extrudieren ⇒ The wall cannot be extruded
Die Wandfläche lässt sich nicht bauen ⇒ The wall face cannot be built
Die Wandstärke ist zu groß für den Querschnitt ⇒ The wall thickness is too large for the cross-section
Die Werkzeuge lassen sich nicht miteinander schneiden ⇒ The tools cannot be intersected with each other
Die Werkzeuge schließen keinen Raum ein ⇒ The tools do not enclose any space
Die Zeichnung „{0}“ ist nicht gespeichert. ⇒ The drawing “{0}” is not saved.
Die Zeichnung hat keine Teile für eine Stückliste. ⇒ The drawing has no parts for a BOM.
Die Zeitleiste füllt sich mit jedem Schritt. Jeder Schritt lässt sich später ändern. ⇒ The timeline fills with every step. Every step can be changed later.
Die Zielfläche liegt in der Skizzenebene ⇒ The target face lies in the sketch plane
Die Zielfläche liegt nicht in Bohrrichtung (oder der Versatz ist zu groß) ⇒ The target face is not in the drilling direction (or the offset is too large)
Die Zielfläche liegt nicht parallel zur Skizze ⇒ The target face is not parallel to the sketch
Die Zielfläche liegt parallel zur Bohrachse ⇒ The target face is parallel to the hole axis
Die Zielfläche muss die Drehachse enthalten (eine Ebene durch die Achse) ⇒ The target face must contain the axis of rotation (a plane through the axis)
Die Zielfläche muss parallel zur gewählten Fläche liegen ⇒ The target face must be parallel to the selected face
Die zweite Auswahl liegt auf einem anderen Teil als die bewegte Komponente. ⇒ The second selection lies on a different part than the moved component.
Die Zylinderachse muss senkrecht auf der Pfadebene stehen ⇒ The cylinder axis must be perpendicular to the path plane
Dienstprogramme ⇒ Utilities
Diese Arbeitsachse kommt erst später in der Zeitleiste. ⇒ This construction axis comes only later in the timeline.
Diese Arbeitsebene kommt erst später in der Zeitleiste. ⇒ This construction plane comes only later in the timeline.
Diese Ebene fehlt. ⇒ This plane is missing.
Diese Fläche hat keine Randkanten zum Projizieren. ⇒ This face has no boundary edges to project.
Diese Kante hat keine Mitte. ⇒ This edge has no midpoint.
Diese Kante hat keine Mittelachse ⇒ This edge has no center axis
Diese Kante ist zu kurz. ⇒ This edge is too short.
Diese Kurve lässt sich nicht stutzen. ⇒ This curve cannot be trimmed.
Diese Kurve lässt sich nicht unterbrechen. ⇒ This curve cannot be broken.
Diese Linien liegen schon aufeinander. ⇒ These lines already lie on top of each other.
Diesen Punkt hast du schon. ⇒ You already have this point.
Dieser Browser kann keine Videos aufnehmen. ⇒ This browser cannot record videos.
Dieser Gelenkursprung kommt erst später in der Zeitleiste. ⇒ This joint origin comes only later in the timeline.
Dieses Blech ist schon abgewickelt ⇒ This sheet is already unfolded
Dokument ⇒ Document
Dokumenteinstellungen ⇒ Document Settings
Doppelt ⇒ Double
Download fehlgeschlagen ⇒ Download failed
Drahtkörper ⇒ Wire body
Draufsicht ⇒ Top view
Drehachse ⇒ Axis of rotation
Drehen ⇒ Rotate
Drehen um Achse ⇒ Rotate about axis
Drehen um Kante ⇒ Rotate about edge
Drehen um Kante: erst eine Kante oder Achse wählen ⇒ Rotate about edge: first select an edge or axis
Drehen: vorher Elemente wählen, dann Drehpunkt, Bezugsrichtung und Zielrichtung klicken. 5°-Schritte am Raster, Strg = Kopie. ⇒ Rotate: select entities first, then click the pivot, reference direction and target direction. 5° steps on the grid, Ctrl = copy.
Drehgelenk ⇒ Revolute joint
Drehpunkt ⇒ Pivot point
Drehpunkt klicken ⇒ Click the pivot point
Drehrichtung ⇒ Direction of rotation
Drehung ⇒ Revolve
Drehung um Z ⇒ Rotation about Z
Drehung, Muster und weitere Achsen können die Arbeitsachse anklicken. Ändert sich ihre Basis, wandern diese mit. ⇒ Revolve, pattern and further axes can click the construction axis. If its base changes, they move along.
Drehwinkel ⇒ Angle of rotation
Drei Ebenen anklicken (Ursprungs-, Arbeitsebene oder ebene Fläche) – der Punkt liegt in ihrem Schnitt. Ein vierter Klick ersetzt die dritte. ⇒ Click three planes (origin plane, construction plane or planar face) – the point lies at their intersection. A fourth click replaces the third.
Drei Eckpunkte anklicken: jeweils eine Kante nahe dem gewünschten Endpunkt. Ein vierter Klick beginnt neu. ⇒ Click three corner points: each time an edge near the desired end point. A fourth click starts over.
Dreieck ⇒ Triangle
Dreieck außen ⇒ Triangle outside
Dreieck innen ⇒ Triangle inside
Dreiecke {0} ⇒ Triangles {0}
Dreiecksblech mittig auf der Kante, Schenkel entlang beider Flächen. Die Eckfase lässt Platz für die Schweißnaht. ⇒ Triangular plate centered on the edge, legs along both faces. The corner chamfer leaves room for the weld.
Drucken / als PDF speichern ⇒ Print / save as PDF
Drucken nicht möglich: ⇒ Printing not possible:
Drücken/Ziehen ⇒ Press Pull
Drücken/Ziehen geht mit ebenen Flächen und Zylinderflächen ⇒ Press Pull works with planar faces and cylindrical faces
Drücken/Ziehen geht mit ebenen Flächen und Zylinderflächen. ⇒ Press Pull works with planar faces and cylindrical faces.
Drücken/Ziehen nicht möglich. ⇒ Press Pull not possible.
Dunkel ⇒ Dark
Dünn extrudieren ⇒ Thin extrude
Durch Biegung verbinden ⇒ Join by Bend
Durch Biegung verbinden: je eine gerade Endkante zweier Bleche anklicken. Dazwischen entsteht eine Biegung mit dem Radius der Blechregel; die Bleche werden verlängert oder gekürzt. ⇒ Join by bend: click one straight end edge each on two sheets. A bend with the radius of the sheet metal rule is created between them; the sheets are extended or shortened.
Durch drei Ebenen ⇒ Through three planes
Durch drei Punkte ⇒ Through three points
Durch Kante/Zylinder ⇒ Through edge/cylinder
Durch Punkt ⇒ Through point
Durch zwei Kanten ⇒ Through two edges
Durch zwei Punkte ⇒ Through two points
Durchgang ⇒ Clearance
Durchgang {0} von {1} ⇒ Pass {0} of {1}
Durchgehend ⇒ Through
Durchlaufend ⇒ Continuous
Durchmesser ⇒ Diameter
Durchmesser {0} ⇒ Diameter {0}
Durchmesser ⌀ (zylindrische Zone) ⇒ Diameter ⌀ (cylindrical zone)
Durchmesser ist ⇒ Diameter is
Durchmesser, Querschnitt und Windungen müssen größer als 0 sein ⇒ Diameter, cross-section and turns must be greater than 0
Durchsuchen ⇒ Browse
DWG-Datei wird geschrieben … ⇒ Writing the DWG file …
DWG-Export nicht möglich: ⇒ DWG export failed:
DXF aus ebener Fläche ⇒ DXF from planar face
DXF einfügen (Linien, Kreise, Bögen, Polylinien im Maßstab 1:1): Datei wählen, dann die Lage anklicken ⇒ Insert DXF (lines, circles, arcs, polylines at scale 1:1): choose a file, then click the position
DXF importieren ⇒ Import DXF
DXF nicht lesbar: ⇒ DXF not readable:
DXF nicht möglich: ⇒ DXF not possible:
DXF speichern ⇒ Save DXF
DXF-Einstellungen (Export) ⇒ DXF settings (export)
DXF-Einstellungen gespeichert. ⇒ DXF settings saved.
Ebene ⇒ Plane
Ebene anklicken ⇒ Click a plane
Ebene anklicken … ⇒ Click a plane …
Ebene Fläche ⇒ Planar face
Ebene Fläche ✓ ⇒ Planar face ✓
Ebene Fläche als Start anklicken – die Extrusion beginnt auf dieser Fläche. Esc bricht ab. ⇒ Click a planar face as the start – the extrusion starts on this face. Esc cancels.
Ebene Fläche an der Stelle anklicken … ⇒ Click a planar face at the location …
Ebene Fläche an der Stelle der Bohrung anklicken. Jeder weitere Klick setzt eine weitere Bohrung. ⇒ Click a planar face at the location of the hole. Each further click places another hole.
ebene Fläche anklicken ⇒ click a planar face
Ebene Fläche anklicken – die Achse steht an der Klickstelle senkrecht auf ihr. Ein neuer Klick setzt sie neu. ⇒ Click a planar face – the axis stands perpendicular to it at the clicked point. A new click places it again.
Ebene Fläche anklicken – sie wird als DXF gespeichert (mit Löchern). Esc beendet. ⇒ Click a planar face – it is saved as DXF (with holes). Esc ends.
Ebene Fläche des Körpers ⇒ Planar face of the body
Ebene Fläche durch die Drehachse: gedreht wird vom Profil bis dorthin. ⇒ Planar face through the axis of rotation: revolves from the profile up to there.
ebene Fläche ist keine Fase zwischen zwei Ebenen ⇒ planar face is not a chamfer between two planes
Ebene Fläche oder Zylinderfläche anklicken und den Abstand eingeben: positiv zieht heraus, negativ drückt hinein. ⇒ Click a planar face or cylindrical face and enter the distance: positive pulls out, negative pushes in.
Ebene Körperfläche als Profil anklicken ⇒ Click a planar body face as the profile
Ebene Körperfläche anklicken … ⇒ Click a planar body face …
ebene muss XY, XZ oder YZ sein. ⇒ plane must be XY, XZ or YZ.
Ebene oder ebene Fläche anklicken – die neue Ebene steht senkrecht darauf und enthält ihre Normale. „Durch Punkt“ legt sie durch eine Ecke, eine Kreismitte oder einen Arbeitspunkt; ohne Punkt steht sie im Ursprung der Basis. „Winkel“ dreht sie um die Normale der Basis, „Abstand“ verschiebt sie seitlich. ⇒ Click a plane or planar face – the new plane stands perpendicular to it and contains its normal. “Through point” places it through a corner, a circle center or a construction point; without a point it stands at the origin of the base. “Angle” rotates it about the normal of the base, “Distance” shifts it sideways.
Ebene oder ebene Fläche anklicken … ⇒ Click a plane or planar face …
Ebene Zielfläche anklicken. Esc bricht ab. ⇒ Click a planar target face. Esc cancels.
Ebene, ebene Fläche oder Arbeitsebene anklicken - die Z-Achse steht senkrecht auf ihr. Ohne Punkt liegt der Ursprung im Ursprung der Basis. "Drehung um Z" dreht X und Y, "Abstand" verschiebt den Ursprung entlang Z. ⇒ Click a plane, planar face or construction plane - the Z axis stands perpendicular to it. Without a point, the origin lies at the origin of the base. "Rotation about Z" rotates X and Y, "Distance" moves the origin along Z.
Ebene: {0} ⇒ Plane: {0}
Ebene: XY/XZ/YZ oder eine ebene Fläche bzw. Arbeitsebene im Modell anklicken. Der Mittelpunkt liegt in dieser Ebene. ⇒ Plane: XY/XZ/YZ or click a planar face or construction plane in the model. The center point lies in this plane.
Ebenen ⇒ Planes
Ebenen-X ⇒ Plane X
Ebenen-Y ⇒ Plane Y
Ebenheit ⇒ Flatness
Ecke ⇒ Corner
Ecke anklicken ⇒ Click a corner
Ecke anklicken … ⇒ Click a corner …
Ecke fasen · {0} ⇒ Chamfer corner · {0}
Ecke verrunden · R {0} ⇒ Fillet corner · R {0}
Ecken ⇒ Corners
Ecken (Kanten in Dickenrichtung) anklicken ⇒ Click corners (edges in thickness direction)
Ecken außen ⇒ Outside corners
Eckfase ⇒ Corner chamfer
Eckfreischnitt ⇒ Corner relief
Eckgruppen ⇒ Corner groups
Eckkante anklicken … ⇒ Click a corner edge …
Eckkanten anklicken ⇒ Click corner edges
Eckpunkt ⇒ Corner point
Eckpunkt oder Bohrungsmitte einer Ansicht anklicken. ⇒ Click a corner point or hole center of a view.
Eckpunkte über die Kanten oder Arbeitspunkte anklicken (bei Kanten zählt der nähere Endpunkt). ⇒ Click corner points via the edges or construction points (for edges the nearer end point counts).
Eckspalt ⇒ Corner gap
Edelstahl ⇒ Stainless steel
Edelstahl {0} mm ⇒ Stainless steel {0} mm
Eigene ⇒ Custom
Eigene Maße ⇒ Custom dimensions
Eigene Maße dieses Blatts löschen ⇒ Delete custom dimensions of this sheet
Eigene Vorlage (SVG) laden … ⇒ Load custom template (SVG) …
Eigene: {1} ⇒ Custom: {1}
Eigener ⇒ Custom
eigener Wert ⇒ custom value
Eigenes Format ⇒ Custom format
Eigenschaft ⇒ Property
Eigenschaften ⇒ Properties
Eigenschaften des Körpers ⇒ Body properties
Eigenschaften nicht verfügbar: ⇒ Properties not available:
Ein ⇒ On
Ein Bild braucht {0} ms. Die Grafik ist langsamer als erwartet. ⇒ One frame takes {0} ms. The graphics are slower than expected.
Ein Dokument kann nicht von sich selbst ableiten. ⇒ A document cannot derive from itself.
Ein erhaltener Bereich braucht eine eigene geschlossene Fläche um den Punkt (z. B. einen Kreis) – dieser Punkt liegt direkt im Designbereich ⇒ A preserved region needs its own closed region around the point (e.g. a circle) – this point lies directly in the design space
Ein Körper der Studie gibt es nicht mehr ({0}). ⇒ A body of the study no longer exists ({0}).
Ein Körper ist zugleich Beibehalten- und Hindernis-Geometrie. ⇒ A body is Preserve and Obstacle Geometry at the same time.
Ein Kreis als Pfad muss allein in der Skizze stehen ⇒ A circle as path must be alone in the sketch
Ein Werkzeugkörper fehlt ⇒ A tool body is missing
Einblenden ⇒ Show
Eine Biegung um 180° geht nicht ⇒ A bend of 180° is not possible
Eine ebene Fläche an der Stelle anklicken, durch die die Achse gehen soll. ⇒ Click a planar face at the location the axis should pass through.
Eine Ecke anklicken, an der genau zwei Linien zusammenkommen. ⇒ Click a corner where exactly two lines meet.
Eine Ellipse als Pfad geht noch nicht ⇒ An ellipse as path is not supported yet
Eine Fläche anklicken, die geteilt werden soll. ⇒ Click a face to be split.
Eine Fläche des Körpers anklicken, alle ihre Ecken werden gerundet. ⇒ Click a face of the body, all its corners are rounded.
Eine Fläche des Werkzeugkörpers anklicken. ⇒ Click a face of the tool body.
Eine Fläche einer Kraft oder Abhängigkeit gibt es nicht mehr ⇒ A face of a force or constraint no longer exists
Eine gerade Endkante des Blechs anklicken. ⇒ Click a straight end edge of the sheet.
Eine gerade Kante anklicken. ⇒ Click a straight edge.
Eine gerade Kante und eine Ebene anklicken – der Punkt liegt dort, wo die Kante (verlängert) die Ebene trifft. ⇒ Click a straight edge and a plane – the point lies where the (extended) edge meets the plane.
Eine gerade Kante und eine Ebene anklicken. ⇒ Click a straight edge and a plane.
Eine gerade Kante, eine Kreiskante oder eine Zylinderfläche anklicken. ⇒ Click a straight edge, a circular edge or a cylindrical face.
Eine gerade Kante, Kreiskante oder Zylinderfläche anklicken. Esc bricht ab. ⇒ Click a straight edge, circular edge or cylindrical face. Esc cancels.
Eine gerade Kante, Kreiskante, Zylinderfläche oder Arbeitsachse anklicken. ⇒ Click a straight edge, circular edge, cylindrical face or construction axis.
Eine gerade Kante, Kreiskante, Zylinderfläche oder Arbeitsachse anklicken. Esc bricht ab. ⇒ Click a straight edge, circular edge, cylindrical face or construction axis. Esc cancels.
Eine geschlossene Erhebung geht ohne Mittellinie ⇒ A closed loft works without a center line
Eine geschlossene Erhebung geht ohne Schienen ⇒ A closed loft works without rails
Eine gewählte Biegung gibt es nicht mehr ⇒ A selected bend no longer exists
Eine gewählte Fläche gibt es nicht mehr ⇒ A selected face no longer exists
Eine gewählte Fläche lässt sich nicht neigen (Winkel kleiner wählen oder Nachbarflächen mitwählen) ⇒ A selected face cannot be tilted (choose a smaller angle or also select neighboring faces)
Eine gewählte Kante gibt es nicht mehr ⇒ A selected edge no longer exists
Eine gewählte Kante liegt nicht in der Fläche ⇒ A selected edge does not lie in the face
Eine gewählte Kreiskante gibt es nicht mehr ⇒ A selected circular edge no longer exists
Eine Kante als Pfad anklicken (gerade, Bogen oder Kurve). ⇒ Click an edge as the path (straight, arc or curve).
Eine Kante anklicken – gerade oder Kreis- bzw. Bogenkante. ⇒ Click an edge – straight or circular/arc edge.
Eine Kante anklicken – gerade oder Kreis- bzw. Bogenkante. Esc bricht ab. ⇒ Click an edge – straight or circular/arc edge. Esc cancels.
Eine Kante anklicken (es zählt der nähere Eckpunkt), einen Kreis (seine Mitte) oder einen Arbeitspunkt. ⇒ Click an edge (the nearer corner point counts), a circle (its center) or a construction point.
Eine Kante anklicken (gerade, Bogen oder Kurve). ⇒ Click an edge (straight, arc or curve).
Eine Kante anklicken. ⇒ Click an edge.
Eine Kraft hängt mit keiner Halterung zusammen – der Designbereich besteht aus {0} getrennten Flächen. Den Designbereich so wählen, dass Kraft und Halterungen auf einer zusammenhängenden Fläche liegen (z. B. eine Fläche des Körpers oder die äußere Kontur der Skizze). ⇒ A force is not connected to any support – the design space consists of {0} separate regions. Choose the design space so that force and supports lie on one connected region (e.g. a face of the body or the outer contour of the sketch).
Eine Kreis- oder Bogenkante anklicken. ⇒ Click a circular or arc edge.
Eine Linie oder einen Bogen nahe am Ende anklicken, das verlängert werden soll. ⇒ Click a line or arc near the end to be extended.
Eine Linie, einen Bogen oder Kreis der Skizze anklicken. ⇒ Click a line, arc or circle of the sketch.
Eine Profil-Skizze fehlt ⇒ A profile sketch is missing
Eine Richtung über „Kante/Achse anklicken“ auf das Bauteil legen – dann sitzt das Muster an der Kante und nicht auf der Weltachse. ⇒ Place a direction on the part via “Click edge/axis” – then the pattern sits at the edge and not on the world axis.
Eine Rippe braucht einen vorhandenen Körper ⇒ A rib needs an existing body
Eine Schiene berührt ein Profil nicht (Abstand > 0,05 mm) ⇒ A rail does not touch a profile (distance > 0.05 mm)
Eine Seite ⇒ One side
Eine Skizze mit Stablinien fehlt ⇒ A sketch with member lines is missing
Eine Spline ist nur an ihrem Endpunkt tangential: Endpunkt erst mit der anderen Kurve verbinden. ⇒ A spline is tangent only at its end point: connect the end point to the other curve first.
Eine Werkzeugebene fehlt ⇒ A tool plane is missing
Eine Zylinderfläche an der gewünschten Berührstelle anklicken. ⇒ Click a cylindrical face at the desired point of contact.
Einen Eckpunkt (über einer Kante), eine Kreismitte oder einen Arbeitspunkt anklicken. ⇒ Click a corner point (via an edge), a circle center or a construction point.
Einen Eckpunkt in einer Ansicht anklicken. ⇒ Click a corner point in a view.
Einen Punkt der Skizze oder den Ursprung als Bezug anklicken. ⇒ Click a point of the sketch or the origin as the reference.
Einen Schritt vor ⇒ One step forward
Einen Schritt zurück ⇒ One step back
Einfach ⇒ Simple
Einfügen ⇒ Insert
Einfügen nicht möglich: ⇒ Insert not possible:
Eingefügte Teile ⇒ Inserted parts
Einheit ⇒ Unit
Einheit, Bögen/Linien, Polylinien, Layer und Farben ⇒ Unit, arcs/lines, polylines, layers and colors
Einheiten mm · Z zeigt nach oben ⇒ Units mm · Z points up
Einheiten mm · Z zeigt nach oben · Grafik: {0} ⇒ Units mm · Z points up · Graphics: {0}
Einheiten: mm · Format {7} ⇒ Units: mm · Format {7}
Einpassen ⇒ Fit
Einpassen (Pos1) ⇒ Fit (Home)
Einseitig: die Form öffnet in Zugrichtung; beidseitig: zwei Formhälften mit Trennebene. Formschräge = Winkel zwischen Fläche und Zugrichtung. Gelb: Wände, die steiler als die Mindestschräge stehen – hier hilft „Formschräge“. {10} ⇒ One side: the mold opens in the pull direction; two sides: two mold halves with a parting plane. Draft = angle between face and pull direction. Yellow: walls steeper than the minimum draft – “Draft” helps here. {10}
Einspannung ⇒ Fixed
Einspannung (Wege in x und y gesperrt) ⇒ Fixed (displacements in x and y locked)
Einstellungen ⇒ Preferences
Einstellungen (Farbschema, Größe der Oberfläche) ⇒ Preferences (color scheme, size of the interface)
Eintragen ⇒ Enter
Einzelheit {0} ⇒ Detail {0}
Einzelheit {0} angelegt. Klick auf den Buchstaben ändert Maßstab und Größe. ⇒ Detail {0} created. Click the letter to change scale and size.
Einzelheit: Mitte des Bereichs in einer Ansicht anklicken, dann die Stelle für die vergrößerte Darstellung. ⇒ Detail: click the center of the area in a view, then the location for the enlarged view.
Einzeln ⇒ Individual
einzelne Linien und Bögen ⇒ individual lines and arcs
Einzelteil ⇒ Single part
Element ⇒ Entity
Element zum Spiegeln anklicken ⇒ Click the entity to mirror
Elemente ⇒ Entities
Elemente entfernen ⇒ Defeature
Elemente entfernen (Bohrungen, Rundungen, Fasen) ⇒ Defeature (holes, fillets, chamfers)
Ellipse: Mittelpunkt, dann Ende der Hauptachse, dann die Breite. Die Achsen sind Hilfslinien – mit Bemaßung ihrer Längen und Winkel wird die Ellipse bestimmt. ⇒ Ellipse: center, then the end of the major axis, then the width. The axes are construction lines – dimensioning their lengths and angles defines the ellipse.
Ende ⇒ End
Ende ist nicht frei oder keine Kurve in Verlängerung ⇒ End is not free or no curve in extension
Enden ⇒ Ends
Endkante am ersten Blech anklicken … ⇒ Click the end edge on the first sheet …
Endkappe ⇒ End Cap
Endkappen ⇒ End caps
Endpunkt des Bogens ⇒ End point of the arc
Endpunkt klicken ⇒ Click the end point
Entfernen ⇒ Remove
Entlang der Kante ⇒ Along the edge
Entlang Kante ⇒ Along edge
Entlang Kante: erst eine Kante wählen ⇒ Along edge: first select an edge
Entlang Pfad ⇒ Along path
entlang X ⇒ along X
entlang Y ⇒ along Y
entlang Z ⇒ along Z
Entwurfsbedingungen ⇒ Design conditions
Entwurfsbereich ⇒ Design space
Ergänzt: {0} Abhängigkeiten, {1} Maße{2} – {3} ⇒ Added: {0} constraints, {1} dimensions{2} – {3}
Ergänzt: {0} waagrecht/senkrecht, {1} deckungsgleich, {2} tangential. ⇒ Added: {0} horizontal/vertical, {1} coincident, {2} tangent.
Ergebnis ⇒ Result
Ergebnis als Konstruktion angelegt – Startform und Beibehalten-Körper sind ausgeblendet (im Browser wieder einblenden). ⇒ Result created as design – starting shape and Preserve bodies are hidden (show them again in the browser).
Ergebnis des Generativen Designs ⇒ Generative Design result
Ergebnis ist keine gültige Zahl ⇒ Result is not a valid number
Ergebnis: {0} ⇒ Result: {0}
Ergebnis: {0}{1} ⇒ Result: {0}{1}
Ergebnisse ⇒ Results
Ergebnisse ({30}) ⇒ Results ({30})
Ergebnisse durchsuchen ({0}) ⇒ Explore results ({0})
Erhaben ⇒ Raised
Erhebung ⇒ Loft
Erhebung braucht mindestens zwei Skizzen mit Profilen. ⇒ Loft needs at least two sketches with profiles.
Erhebung entlang der Mittellinie nicht möglich – liegen die Profile der Reihe nach auf ihr? ⇒ Loft along the center line not possible – do the profiles lie on it in order?
Erhebung nicht möglich – Profile passen nicht zueinander? ⇒ Loft not possible – profiles do not fit together?
Erhebung: Profile der Reihe nach wählen, z. B. auf versetzten Arbeitsebenen. ⇒ Loft: select the profiles in order, e.g. on offset construction planes.
Erscheinen als eigene Zeilen über dem Schriftfeld, drei je Zeile (höchstens neun). ⇒ Appear as separate rows above the title block, three per row (at most nine).
Erst beide Gelenk-Ursprünge anklicken. ⇒ First click both joint origins.
Erst beide Seiten einer Abhängigkeit anklicken. ⇒ First click both sides of a constraint.
Erst Blechkanten anklicken. ⇒ First click sheet metal edges.
Erst das Teil konstruieren, dann zu einer Baugruppe hinzufügen. ⇒ Design the part first, then add it to an assembly.
Erst den Betrag der Kraft eingeben (Newton). ⇒ First enter the magnitude of the force (newtons).
Erst den Punkt am Körper anklicken. ⇒ First click the point on the body.
Erst den Punkt am Körper, dann den Zielpunkt anklicken – der Körper wandert genau dorthin. ⇒ First click the point on the body, then the target point – the body moves exactly there.
Erst die Basis der Achse anklicken. ⇒ First click the base of the axis.
Erst die ebene Fläche anklicken, auf die der Aufkleber kommt. ⇒ First click the planar face the decal goes on.
Erst die ebene Fläche des Körpers anklicken, die der Designbereich ist. ⇒ First click the planar face of the body that is the design space.
Erst die Ebene oder Fläche anklicken, auf der die neue Ebene senkrecht stehen soll. ⇒ First click the plane or face the new plane should be perpendicular to.
Erst die feste ebene Fläche anklicken. ⇒ First click the stationary planar face.
Erst die Fläche an der Stelle der Bohrung anklicken. ⇒ First click the face at the location of the hole.
Erst die Fläche anklicken, auf die geprägt wird. ⇒ First click the face to emboss onto.
Erst die Fläche/Kante am bewegten Teil, dann das Ziel anklicken. ⇒ First click the face/edge on the moved part, then the target.
Erst die Flächen anklicken, die geneigt werden. ⇒ First click the faces to be tilted.
Erst die Flächen anklicken, die verdickt werden. ⇒ First click the faces to be thickened.
Erst die neutrale Ebene wählen. ⇒ First select the neutral plane.
Erst die Startfläche wählen. ⇒ First select the start face.
Erst die Stirnflächen der Stäbe anklicken. ⇒ First click the end faces of the members.
Erst die Werkzeugkörper anklicken, die den Raum einschließen. ⇒ First click the tool bodies that enclose the space.
Erst die Zielfläche wählen. ⇒ First select the target face.
Erst die Zylinderfläche an der Berührstelle anklicken. ⇒ First click the cylindrical face at the point of contact.
Erst drei Punkte anklicken. ⇒ First click three points.
Erst Ecken anklicken oder „Alle Ecken“ wählen. ⇒ First click corners or choose “All corners”.
Erst Eckkanten anklicken. ⇒ First click corner edges.
Erst ein Bild laden. ⇒ Load an image first.
Erst ein Blech (Lasche) erstellen. ⇒ Create a sheet (flange) first.
Erst eine Biegung anklicken oder „Alle Biegungen“ wählen. ⇒ First click a bend or choose “All bends”.
Erst eine ebene Fläche oder Zylinderfläche anklicken. ⇒ First click a planar face or cylindrical face.
Erst eine ebene Körperfläche als Profil anklicken. ⇒ First click a planar body face as the profile.
Erst eine Fläche zum Öffnen anklicken. ⇒ First click a face to open.
Erst eine gerade Kante anklicken ⇒ First click a straight edge
Erst eine gerade Kante anklicken. ⇒ First click a straight edge.
Erst eine Kante anklicken, entlang der verschoben werden soll. ⇒ First click an edge to move along.
Erst eine Kante anklicken. ⇒ First click an edge.
Erst eine Kante, Kreiskante oder Achse als Drehachse anklicken. ⇒ First click an edge, circular edge or axis as the axis of rotation.
Erst eine Kreiskante anklicken ⇒ First click a circular edge
Erst eine runde Kante im Modell anklicken. ⇒ First click a round edge in the model.
Erst eine Skizze auf der Blechfläche mit einer Linie als Biegelinie zeichnen. ⇒ First draw a sketch on the sheet metal face with a line as the bend line.
Erst eine Skizze erstellen. ⇒ Create a sketch first.
Erst eine Skizze mit dem Blechumriss erstellen. ⇒ First create a sketch with the sheet outline.
Erst eine Skizze mit dem Designbereich zeichnen. ⇒ First draw a sketch with the design space.
Erst eine Skizze mit dem Pfad zeichnen (Linien, Bögen, Spline oder ein Kreis). ⇒ First draw a sketch with the path (lines, arcs, spline or a circle).
Erst eine Skizze mit dem Profil oder Text zeichnen (z. B. auf einer Ebene vor der Fläche). ⇒ First draw a sketch with the profile or text (e.g. on a plane in front of the face).
Erst eine Skizze mit dem Querschnitt als offenen Linienzug zeichnen. ⇒ First draw a sketch with the cross-section as an open polyline.
Erst eine Skizze mit einer Linie für die Rippe zeichnen (Ebene quer durch die Ecke). ⇒ First draw a sketch with a line for the rib (plane across the corner).
Erst eine Skizze mit Linien für den Steg zeichnen (z. B. auf dem Boden einer Schale). ⇒ First draw a sketch with lines for the web (e.g. on the bottom of a shell).
Erst eine Skizze mit Linien für die Stäbe erstellen. ⇒ First create a sketch with lines for the members.
Erst eine Zylinderfläche anklicken. ⇒ First click a cylindrical face.
Erst einen Körper erstellen. ⇒ Create a body first.
Erst einen Text wählen (und für „Auf Kurve“ zusätzlich eine Kurve). ⇒ First select a text (and for “On curve” also a curve).
Erst Elemente auswählen ⇒ Select entities first
Erst Elemente der Skizze wählen (keine projizierten Kanten). ⇒ First select entities of the sketch (no projected edges).
Erst Elemente der Skizze wählen. ⇒ First select entities of the sketch.
Erst Elemente wählen, dann die Spiegelachse. ⇒ First select entities, then the mirror line.
Erst im Menüband ein Werkzeug wählen (Beibehalten, Hindernis, Abhängigkeit, Last …). ⇒ First choose a tool in the toolbar (Preserve, Obstacle, Constraint, Load …).
Erst Kanten an den Innenecken anklicken. ⇒ First click edges at the inside corners.
Erst Kanten anklicken. ⇒ First click edges.
Erst Körper oder Komponenten wählen. ⇒ First select bodies or components.
Erst Körper wählen. ⇒ First select bodies.
Erst zwei gerade Kanten anklicken. ⇒ First click two straight edges.
Erst zwei Kanten einer Fläche anklicken. ⇒ First click two edges of a face.
Erst zwei parallele Ebenen anklicken. ⇒ First click two parallel planes.
Erst zwei Punkte auf der Blechfläche anklicken. ⇒ First click two points on the sheet metal face.
Erst zwei Punkte wählen: erst den Punkt am Körper, dann den Zielpunkt. ⇒ First select two points: first the point on the body, then the target point.
Erstellen ⇒ Create
ersten Punkt auf der Blechfläche anklicken … ⇒ click the first point on the sheet metal face …
Erweitert ⇒ Advanced
Erzeugen ⇒ Generate
Erzeugen läuft ⇒ Generating
Erzeugen: Ergebnisse berechnen (auf diesem Rechner, einige Sekunden je Material) ⇒ Generate: compute results (on this computer, a few seconds per material)
Es bleibt nichts zum Optimieren – der Zielanteil ist zu hoch ⇒ Nothing is left to optimize – the target fraction is too high
Es fehlt Beibehalten-Geometrie – mindestens die Körper, an denen Kräfte und Halterungen sitzen. ⇒ Preserve Geometry is missing – at least the bodies where forces and supports sit.
Es fehlt eine Abhängigkeit (Fläche festhalten). ⇒ A constraint is missing (fix a face).
Es fehlt eine Halterung – einen Punkt als Einspannung oder Halterung festlegen ⇒ A support is missing – define a point as fixed or support
Es fehlt eine Kraft – in der Skizze einen Punkt als Kraft festlegen ⇒ A force is missing – define a point in the sketch as a force
Es fehlt eine Last ⇒ A load is missing
Es fehlt eine Last. ⇒ A load is missing.
Es gibt keine Rahmenstäbe. Erst mit „Rahmen“ Stäbe aus einer Skizze erzeugen. ⇒ There are no frame members. First create members from a sketch with “Frame”.
Es gibt keine weitere Skizze für ein Profil. ⇒ There is no further sketch for a profile.
Es gibt keinen sichtbaren Körper für die Zeichnung ⇒ There is no visible body for the drawing
Es gibt keinen sichtbaren Körper zum Exportieren ⇒ There is no visible body to export
Es gibt keinen sichtbaren Körper zum Rendern. ⇒ There is no visible body to render.
Es gibt keinen sichtbaren Körper. ⇒ There is no visible body.
Es gibt noch kein Feature zum Vervielfältigen. ⇒ There is no feature to pattern yet.
Es gibt noch keine Körper. ⇒ There are no bodies yet.
Es gibt noch keinen Körper zum Messen. ⇒ There is no body to measure yet.
Es gibt noch keinen Körper. ⇒ There is no body yet.
Es werden nur zwei Kanten gebraucht. ⇒ Only two edges are needed.
Explosion ⇒ Explode
Explosionsansicht ⇒ Exploded View
Export nicht möglich: ⇒ Export not possible:
Exportiere {0} Varianten … ⇒ Exporting {0} variants …
Exportieren ⇒ Export
Exportiert das Teil so gedreht, dass die gewählte Seite unten liegt ⇒ Exports the part rotated so that the selected side is at the bottom
Extras ⇒ Tools
Extrusion ⇒ Extrude
Facetten je 90° ⇒ Facets per 90°
Facetten nach ⇒ Facets by
Facettenlänge muss größer als 0 sein ⇒ Facet length must be greater than 0
Facettenwinkel zwischen 0,1° und 180° ⇒ Facet angle between 0.1° and 180°
Faktor ⇒ Factor
Faktor, Enter ⇒ Factor, Enter
Faltet alle abgewickelten Bleche zurück. Was im flachen Zustand ausgeschnitten wurde, wird auf das gebogene Teil übertragen; Ausschnitte über Biegungen folgen der Biegung. Die Abwicklung zeigt danach die neuen Ausschnitte. ⇒ Refolds all unfolded sheets. What was cut out in the flat state is transferred to the bent part; cutouts across bends follow the bend. The flat pattern then shows the new cutouts.
Fang mit einer Skizze an: Skizze erstellen und die XY-Ebene anklicken. ⇒ Start with a sketch: Create Sketch and click the XY plane.
Farbe ⇒ Color
Farbe (1–255) ⇒ Color (1–255)
Farbschema ⇒ Color scheme
Fase ⇒ Chamfer
Fase an ⇒ Chamfer on
Fase nicht möglich – Maß zu groß für eine der Kanten? ⇒ Chamfer not possible – distance too large for one of the edges?
Fase nicht möglich (Maß zu groß?) ⇒ Chamfer not possible (distance too large?)
Fase zwischen parallelen Flächen ⇒ Chamfer between parallel faces
Fase: Ecke zweier Linien anklicken, dann das Maß eintippen. Beide Schenkel sind gleich lang. ⇒ Chamfer: click the corner of two lines, then type the distance. Both legs are equally long.
Fasen geht an einer Ecke, an der genau zwei Linien zusammenkommen. ⇒ Chamfering works at a corner where exactly two lines meet.
Fasenart ⇒ Chamfer type
Faustwerte: Stahl R ≈ t, K 0,44 · Alu R ≈ 1,5 t, K 0,43 · Edelstahl R ≈ 2 t, K 0,45. Gilt für alle Blechfeatures dieses Teils. ⇒ Rules of thumb: steel R ≈ t, K 0.44 · aluminum R ≈ 1.5 t, K 0.43 · stainless R ≈ 2 t, K 0.45. Applies to all sheet metal features of this part.
Feature fehlt ⇒ Feature missing
feature fehlt. ⇒ feature missing.
Features ankreuzen, die vervielfältigt werden. Kreismuster drehen um eine Achse durch den Ursprung, rechteckige gehen in ein oder zwei Richtungen – je Abstand oder Gesamtmaß, wahlweise symmetrisch und mit einer Richtung auf einer Bauteilkante, „Entlang Pfad“ folgt den Kurven einer Skizze. ⇒ Check the features to be patterned. Circular patterns rotate about an axis through the origin, rectangular ones go in one or two directions – by spacing or extent, optionally symmetric and with one direction on a part edge; “Along path” follows the curves of a sketch.
Fehler ⇒ Error
Fehler im Kern: ⇒ Error in the kernel:
Fertig ⇒ Done
Fertig · {0} Durchgänge ⇒ Done · {0} passes
Fertigung ⇒ Manufacturing
Fertigung: 2-Achsen-Schneiden (Laser, Wasserstrahl, Plasma) oder uneingeschränkt (3D-Druck, Guss) ⇒ Manufacturing: 2-axis cutting (laser, waterjet, plasma) or unrestricted (3D printing, casting)
Fertigungspaket (STEP, Abwicklung, Zeichnung PDF/DXF, Stückliste) als ZIP ⇒ Manufacturing package (STEP, flat pattern, drawing PDF/DXF, BOM) as ZIP
Fertigungspaket mit {0} Dateien gespeichert{1}. ⇒ Manufacturing package with {0} files saved{1}.
Fertigungspaket wird erstellt … ⇒ Creating manufacturing package …
Fest ⇒ Fixed
fest … ⇒ fixed …
Fest (alle Richtungen) ⇒ Fixed (all directions)
Fest nur in X ⇒ Fixed in X only
Fest nur in Y ⇒ Fixed in Y only
Fest nur in Z ⇒ Fixed in Z only
Feste ebene Fläche anklicken ⇒ Click the stationary planar face
Feste Fläche ⇒ Stationary face
Feste Fläche muss eben sein ⇒ Stationary face must be planar
Feste Fläche nicht im Körper ⇒ Stationary face not in the body
Filterradius (0 = automatisch) ⇒ Filter radius (0 = automatic)
Fixieren ⇒ Fix
Fixiert ⇒ Fixed
Flach ⇒ Flat
Fläche ⇒ Face
Fläche ({0}) wird nicht unterstützt ⇒ Face ({0}) is not supported
Fläche (Aufkleber) ⇒ Face (decal)
Fläche (ersetzen) ⇒ Face (replace)
Fläche ✓ ⇒ Face ✓
Fläche als DXF gespeichert ({0} {1}). ⇒ Face saved as DXF ({0} {1}).
Fläche an der Prägestelle anklicken … ⇒ Click the face at the emboss location …
Fläche anklicken ⇒ Click a face
Fläche anklicken … ⇒ Click a face …
Fläche anklicken, auf die geprägt wird ⇒ Click the face to emboss onto
Fläche anklicken, die zur Ansicht gedreht werden soll. ⇒ Click the face to rotate toward the view.
Fläche des Körpers ⇒ Face of the body
Fläche des Werkzeugkörpers anklicken … ⇒ Click a face of the tool body …
Fläche einer Beibehalten-Geometrie anklicken (z. B. die Wand einer Bohrung) – sie wird festgehalten. ⇒ Click a face of a Preserve Geometry (e.g. the wall of a hole) – it is held fixed.
Fläche eines Körpers ⇒ Face of a body
Fläche gewählt ✓ ⇒ Face selected ✓
Fläche im Modell anklicken, die offen bleiben soll, zum Beispiel die Oberseite. ⇒ Click the face in the model that should stay open, for example the top.
Fläche nicht mehr gefunden ⇒ Face no longer found
Fläche oder Kante anklicken … ⇒ Click a face or edge …
Fläche oder Kante für den Ursprung anklicken ⇒ Click a face or edge for the origin
Fläche oder Kante im Modell anklicken. ⇒ Click a face or edge in the model.
Flache Spirale ⇒ Flat spiral
Flache Spirale · {0} Windungen · {1} mm je Windung · Außen-⌀ {2} mm · Drahtlänge ≈ {3} mm ⇒ Flat spiral · {0} turns · {1} mm per turn · outer ⌀ {2} mm · wire length ≈ {3} mm
Fläche teilen ⇒ Split Face
Fläche wählen ⇒ Select face
Flächen ⇒ Faces
Flächen anklicken oder eine Automatik einstellen ⇒ Click faces or set an automatic option
Flächen anklicken oder eine Automatik einstellen. ⇒ Click faces or set an automatic option.
Flächen anklicken, die geneigt werden. Sie drehen sich um ihre Schnittlinie mit der neutralen Ebene. ⇒ Click the faces to be tilted. They rotate about their intersection line with the neutral plane.
Flächen anklicken, die offen bleiben sollen. ⇒ Click the faces that should stay open.
Flächen anklicken, die verdickt werden ⇒ Click the faces to be thickened
Flächen der Skizze anklicken, um Profile auszuwählen. Die Vorschau rechnet mit. ⇒ Click regions of the sketch to select profiles. The preview updates along.
Flächen eines Körpers anklicken (eben oder gekrümmt). ⇒ Click faces of a body (planar or curved).
Flächen im Modell anklicken, die geteilt werden sollen (auch gekrümmte). Ohne Auswahl teilt das Werkzeug alle getroffenen Flächen. ⇒ Click the faces in the model to be split (curved ones too). Without a selection the tool splits all faces it hits.
Flächen im Modell anklicken, jede ihrer Ecken wird bearbeitet. Eine Kante zwischen zwei gewählten Flächen zählt einmal, tangenten Übergänge und Nahtkanten fallen weg. Erneutes Klickt wählt die Fläche ab. ⇒ Click faces in the model, each of their corners is processed. An edge between two selected faces counts once, tangent transitions and seam edges are dropped. Clicking again deselects the face.
Flächen nachgefragt {0} ({1} geflickt{2}) ⇒ Faces queried {0} ({1} patched{2})
Flächen parallel zur neutralen Ebene lassen sich nicht neigen ⇒ Faces parallel to the neutral plane cannot be tilted
Flächen teilen ⇒ Split faces
Flächenbeschreibung {0}{1} ⇒ Face description {0}{1}
Flächenform ⇒ Face shape
Flachstahl ⇒ Flat bar
Flansch ⇒ Flange
Form- und Lagetoleranz ⇒ Geometric tolerance
Form- und Lagetoleranz: Fläche anklicken, dann Lage des Rahmens ⇒ Geometric tolerance: click a face, then the position of the frame
formen fehlt. ⇒ shapes missing.
Formschräge ⇒ Draft
Formschräge (z. B. 1–2° für Guss oder Spritzguss): Die Rippe hat an der Skizzenlinie die Dicke und wird zum Körper hin breiter. ⇒ Draft (e.g. 1–2° for casting or injection molding): the rib has the thickness at the sketch line and gets wider toward the body.
Formschräge nicht möglich (Winkel kleiner wählen) ⇒ Draft not possible (choose a smaller angle)
Freie Felder ⇒ Free fields
freies Ende einer Linie oder eines Bogens ⇒ free end of a line or arc
Freischnitt ⇒ Relief
Führungsschiene ⇒ Guide rail
Für „{0}“ zuerst die Elemente auswählen (ohne Werkzeug anklicken, Shift für mehrere). ⇒ For “{0}”, select the entities first (click without a tool, Shift for several).
Für Baugruppen braucht cantcodecad den Projektordner: Bitte das schwarze Server-Fenster schließen und „cantcodecad starten.bat“ neu starten. ⇒ For assemblies cantcodecad needs the project folder: please close the black server window and restart “cantcodecad starten.bat”.
Für Deckungsgleich zwei Punkte wählen, oder einen Punkt und eine Kurve. ⇒ For Coincident select two points, or a point and a curve.
Für den 3D-Druck z. B. 0,15 mm: Bolzen werden dünner, Muttergewinde weiter. ⇒ For 3D printing e.g. 0.15 mm: bolts become thinner, nut threads wider.
Für die Auftrennung eine gerade Eckkante anklicken. ⇒ For the rip, click a straight corner edge.
Für die Auftrennung zwischen zwei Punkten eine ebene Blechfläche anklicken. ⇒ For the rip between two points, click a planar sheet metal face.
Für die Baugruppe wird das Teil zuerst gespeichert und dann verknüpft eingefügt. ⇒ For the assembly, the part is saved first and then inserted linked.
Für die Bohrung eine ebene Fläche anklicken. ⇒ Click a planar face for the hole.
Für die Masse ein Material wählen. ⇒ Choose a material for the mass.
Für die Zeichnung ein anderes Dokument öffnen? Ungespeicherte Änderungen gehen verloren. ⇒ Open another document for the drawing? Unsaved changes will be lost.
Für diese Lage eine gerade Kante anklicken. ⇒ Click a straight edge for this location.
Für diese Lage eine runde Kante anklicken. ⇒ Click a round edge for this location.
Für Druckfedern im 3D-Druck: Steigung deutlich größer als der Draht wählen (z. B. 2,5×), Enden plan für sicheren Stand auf dem Druckbett. ⇒ For compression springs in 3D printing: choose a pitch clearly larger than the wire (e.g. 2.5×), ground ends for a stable stand on the print bed.
Für ein Gewinde eine Zylinderfläche anklicken (Bolzen oder Bohrung). ⇒ Click a cylindrical face for a thread (bolt or hole).
Für ein Normteil einen Bohrungsrand (Kreiskante) anklicken. ⇒ Click a hole edge (circular edge) for a fastener.
Für eine Endkappe die ebene Stirnfläche eines Stabs anklicken. ⇒ For an end cap, click the planar end face of a member.
Für eine geschlossene Erhebung mindestens drei Profile ⇒ A closed loft needs at least three profiles
Für eine Lasche eine gerade Blechkante anklicken. ⇒ Click a straight sheet metal edge for a flange.
Für eine Zeichnung braucht es einen Körper ⇒ A drawing needs a body
Für eine Zeichnung braucht es einen Körper. ⇒ A drawing needs a body.
Für einen Aufkleber eine ebene Fläche anklicken. ⇒ Click a planar face for a decal.
Für einen erhaltenen Bereich braucht der Punkt eine geschlossene Fläche um sich herum ⇒ For a preserved region the point needs a closed region around it
Für Generatives Design braucht es Körper: mindestens die Beibehalten-Geometrie (z. B. Augen um die Bohrungen). ⇒ Generative Design needs bodies: at least the Preserve Geometry (e.g. bosses around the holes).
Für Gleich zwei Linien oder zwei Kreise/Bögen wählen. ⇒ For Equal select two lines or two circles/arcs.
Für Horizontal/Vertikal eine oder mehrere Linien wählen, oder zwei Punkte. ⇒ For Horizontal/Vertical select one or more lines, or two points.
Für jede Variante das Fertigungspaket (STEP, Abwicklung, Zeichnung, Stückliste) in einem eigenen Ordner der ZIP-Datei ⇒ For each variant the manufacturing package (STEP, flat pattern, drawing, BOM) in its own folder of the ZIP file
Für jede Variante die Abwicklung als DXF (Laser), zusammen in einer ZIP-Datei ⇒ For each variant the flat pattern as DXF (laser), together in one ZIP file
Für jede Variante eine STEP-Datei, zusammen in einer ZIP-Datei ⇒ One STEP file per variant, together in one ZIP file
Für Kollinear zwei oder mehr Linien wählen. ⇒ For Collinear select two or more lines.
Für Konzentrisch zwei Kreise oder Bögen wählen. ⇒ For Concentric select two circles or arcs.
Für Mittelpunkt einen Punkt und eine Linie wählen. ⇒ For Midpoint select a point and a line.
Für Polygon eine geschlossene Kette aus drei oder mehr Linien wählen. ⇒ For Polygon select a closed chain of three or more lines.
Für symmetrisch / zwei Winkel muss die neutrale Ebene den Körper teilen ⇒ For symmetric / two angles, the neutral plane must split the body
Für Symmetrisch zwei Punkte, zwei Linien oder zwei Kreise wählen und zuletzt die Symmetrielinie. ⇒ For Symmetric select two points, two lines or two circles and finally the line of symmetry.
Für Tangential eine Linie und einen Bogen/Kreis/eine Ellipse wählen, oder zwei Kurven. ⇒ For Tangent select a line and an arc/circle/ellipse, or two curves.
Fuß ⇒ Foot
Ganze Fläche ⇒ Whole face
Ganze Kante ⇒ Whole edge
Ganze Länge ⇒ Full length
Ganze Tiefe ⇒ Full depth
Gegenstück ⇒ Counterpart
Gegenüber ⇒ Opposite
Gehrung ⇒ Miter
Gehrung: Schnitt in der Winkelhalbierenden. Beim Laserzuschnitt (senkrechter Schnitt) überlappen die Wände innen. ⇒ Miter: cut along the angle bisector. With laser cutting (perpendicular cut) the walls overlap on the inside.
Gekrümmte Fläche ⇒ Curved face
Gelenk ⇒ Joint
Gelenk-Ursprung nicht mehr gefunden ⇒ Joint origin no longer found
Gelenk: zuerst Kante oder Fläche an der Komponente anklicken, die sich bewegt (Kreiskante = Mitte und Achse), dann das Gegenstück. Winkel und Versatz im Dialog. ⇒ Joint: first click an edge or face on the component that moves (circular edge = center and axis), then the counterpart. Angle and offset in the dialog.
Gelenkursprung ⇒ Joint Origin
Gelenkursprung {0} ⇒ Joint origin {0}
Gemessen ab der vordersten Kante des Teils in Blickrichtung. ⇒ Measured from the frontmost edge of the part in viewing direction.
Generatives Design ⇒ Generative Design
Generatives Design {0} ⇒ Generative Design {0}
Generatives Design {0} {1} g ⇒ Generative Design {0} {1} g
Generatives Design schließen ⇒ Close Generative Design
Geometrie ⇒ Geometry
Geometriekern bereit ⇒ Geometry kernel ready
Geometriekern lädt … ⇒ Geometry kernel loading …
gerade Blechkante anklicken … ⇒ click a straight sheet metal edge …
Gerade Blechkante nicht gefunden ⇒ Straight sheet metal edge not found
Gerade Kante ⇒ Straight edge
Gerade Kante im Modell anklicken. ⇒ Click a straight edge in the model.
Gerade Kante, Kreiskante oder Zylinderfläche im Modell anklicken. ⇒ Click a straight edge, circular edge or cylindrical face in the model.
Gerade Kante, Kreiskante, Zylinderfläche oder andere Arbeitsachse anklicken. ⇒ Click a straight edge, circular edge, cylindrical face or another construction axis.
Gerade Kanten: der Körper gleitet entlang. Kreis- oder Bogenkanten: er dreht um deren Mittelachse – der Abstand ist die Bogenlänge. ⇒ Straight edges: the body slides along. Circular or arc edges: it rotates about their center axis – the distance is the arc length.
Geradheit ⇒ Straightness
Geradlinig ⇒ Linear
Gerollt ⇒ Rolled
Gerundet ⇒ Rounded
Gesamtlänge ⇒ Overall length
Gesamtlauf ⇒ Total runout
Gesamtmaße ⇒ Overall dimensions
Gesamtwinkel ⇒ Total angle
Geschlossen ⇒ Closed
Geschlossen (zurück zum ersten Profil) ⇒ Closed (back to the first profile)
geschlossene Polylinie je Kontur ⇒ closed polyline per contour
Gespeichert als ⇒ Saved as
Gespeichert wird im Ordner ⇒ Saved in the folder
Gespeichert: {0} ⇒ Saved: {0}
Getauscht ⇒ Flipped
Gewählte eigene Regel aus der Bibliothek löschen ⇒ Delete the selected custom rule from the library
gewählte Fläche ⇒ selected face
Gewählte Flächen nicht mehr gefunden ⇒ Selected faces no longer found
Gewählte Kante nicht mehr gefunden ⇒ Selected edge no longer found
Gewählte Kanten nicht mehr gefunden ⇒ Selected edges no longer found
Gewinde ⇒ Thread
Gewinde gehen nur auf Zylinderflächen ⇒ Threads only work on cylindrical faces
Gewinde nicht möglich – Fläche zu kurz oder Größe passt nicht? ⇒ Thread not possible – face too short or size does not fit?
Gewinde: Bolzen- oder Bohrungsfläche anklicken. Größe wird erkannt (Bohrung = Kernloch oder Nenndurchmesser), modelliert nach ISO. ⇒ Thread: click a bolt or hole face. The size is detected (hole = tap drill or nominal diameter), modeled per ISO.
Gewindeeinsatz ⇒ Thread insert
Gewindelänge ⇒ Thread length
Gezeichnet ⇒ Modeled
Gezeichnet · Toleranz ⇒ Modeled · Tolerance
Gilt für alle DXF-Exporte (Abwicklung, ebene Fläche, Skizze, Fertigungspaket, Varianten). Format R12 – lesen praktisch alle CAD-, Laser- und Nesting-Programme. Farben nach DXF-Farbindex (1 rot, 2 gelb, 3 grün, 4 cyan, 5 blau, 6 magenta, 7 weiß/schwarz). Gleicher Layername für Außen- und Innenkonturen = eine gemeinsame Ebene. ⇒ Applies to all DXF exports (flat pattern, planar face, sketch, manufacturing package, variants). Format R12 – read by practically all CAD, laser and nesting programs. Colors per DXF color index (1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta, 7 white/black). Same layer name for outer and inner contours = one common layer.
Gitter ⇒ Lattice
Glatt ⇒ Smooth
Glättung Umriss (0 = automatisch) ⇒ Outline smoothing (0 = automatic)
Gleich ⇒ Equal
Gleicher Abstand ⇒ Equal spacing
Gleichmäßig in alle Richtungen. Der Bezugspunkt bleibt stehen. Faktor 2 verdoppelt alle Maße, 0,5 halbiert sie. ⇒ Uniform in all directions. The reference point stays in place. Factor 2 doubles all dimensions, 0.5 halves them.
Gleichsinnig ⇒ Same direction
Grau im Modell: das Stützmaterial. Das Gitter lässt Stege von halber Rasterweite stehen, der Abstand hält die Stütze vom Werkstück fern – beides spart Material. „3MF in dieser Lage“ gibt es als zweites Objekt mit aus – im Drucker lässt es sich abbrechen oder abschneiden. ⇒ Gray in the model: the support material. The lattice leaves webs of half the grid spacing, the gap keeps the support away from the workpiece – both save material. “3MF in this orientation” exports it as a second object – in the printer it can be canceled or cut off.
Gravieren ⇒ Engrave
Grenze ⇒ Limit
Grenzwinkel ⇒ Limit angle
Größe ⇒ Size
Große Datei: bitte das Teil im Projektordner speichern, der Browserspeicher reicht dafür nicht. ⇒ Large file: please save the part in the project folder, browser storage is not enough for it.
Größe der Oberfläche ⇒ Interface size
Größe mm ⇒ Size mm
Größe und Dicke müssen größer als 0 sein ⇒ Size and thickness must be greater than 0
größer als 2 MB (das Bild wird in der Zeichnung gespeichert) ⇒ larger than 2 MB (the image is stored in the drawing)
Größere Wand ⇒ Larger wall
Grundkörper ⇒ Primitive
Gruppe {0}: {1} Kante{2} – Klicks gehen in diese Gruppe. ⇒ Group {0}: {1} edge{2:s} – clicks go into this group.
Gruppe {2} ({3}) ⇒ Group {2} ({3})
Gruppe entfernen ⇒ Remove group
Gruppe wählen und „Nesting starten“. Die Tafeln erscheinen hier, jede Verbesserung sofort. ⇒ Choose a group and “Start nesting”. The sheets appear here, every improvement immediately.
Gruppiert wie die Stückliste der Zeichnung: eingefügte Teile nach Datei, sonst Komponenten, sonst Rahmenstäbe gleicher Länge und Verbindungselemente gleicher Größe. Abmessung = Hüllquader eines Stücks (größte zuerst). Werkstoff im Browser am Körper einstellen. ⇒ Grouped like the drawing's BOM: inserted parts by file, otherwise components, otherwise frame members of equal length and fasteners of equal size. Dimensions = bounding box of one piece (largest first). Set the material on the body in the browser.
Halber Abstand ⇒ Half spacing
Hält die Last nicht (Sicherheitsfaktor {0}) – Zielmasse erhöhen oder „Masse minimieren“ wählen ⇒ Does not hold the load (safety factor {0}) – increase the target mass or choose “Minimize mass”
Hält in x (y ist frei) ⇒ Holds in x (y is free)
Hält in y (x ist frei) ⇒ Holds in y (x is free)
Halten x ⇒ Hold x
Halten y ⇒ Hold y
Hauptachse {0} ⇒ Major axis {0}
Hell ⇒ Light
Hier liegt schon ein Punkt. ⇒ There is already a point here.
Hier passt kein Kreis zwischen die Linien – Zeiger in den Winkel zwischen den Linien bewegen. ⇒ No circle fits between the lines here – move the pointer into the angle between the lines.
Hilfsansicht nicht möglich. ⇒ Auxiliary view not possible.
Hilfsansicht: gerade Kante der schrägen Fläche in einer Ansicht anklicken, dann die Lage der Ansicht. ⇒ Auxiliary view: click a straight edge of the inclined face in a view, then the position of the view.
Hilfsansicht: Kante einer schrägen Fläche anklicken, dann die Lage – zeigt die Fläche in wahrer Größe ⇒ Auxiliary view: click an edge of an inclined face, then the position – shows the face in true size
Hilfslinie ⇒ Construction line
Hilfslinien ⇒ Construction lines
Hilfslinien (z. B. Biegelinien) kommen als Konstruktionslinien in die Skizze und bilden keine Profile. ⇒ Construction lines (e.g. bend lines) go into the sketch as construction lines and do not form profiles.
Hindernis-Geometrie ⇒ Obstacle Geometry
Hindernis-Geometrie: Körper, wo kein Material hin darf (Schrauben, Freiräume) – rot ⇒ Obstacle Geometry: bodies where no material may go (bolts, clearances) – red
Hinten (+Y) ⇒ Back (+Y)
Hinterschnitt ⇒ Undercut
Hinweis ⇒ Note
Hinweislinie mit Pfeil ⇒ Leader with arrow
Hinzufügen ⇒ Add
Hinzufügen … ⇒ Add …
Höchstens 400 Kopien ⇒ At most 400 copies
Höchstens je Facette ⇒ At most per facet
Höchstens zwei Schienen ⇒ At most two rails
Höhe ⇒ Height
Höhe (außen) ⇒ Height (outside)
Höhe (Z) ⇒ Height (Z)
Höhe + Steigung ⇒ Height + pitch
Höhe bis zum Bett ⇒ Height to the bed
Höhe und Steigung müssen größer als 0 sein ⇒ Height and pitch must be greater than 0
Hohl ⇒ Hollow
Holz (Fichte) ⇒ Wood (spruce)
Horizontaler Abstand ⇒ Horizontal distance
Hüllbox {0}{1} ⇒ Bounding box {0}{1}
HV-Naht s ⇒ HV weld s
HV-Naht: 45°-Fase über die Tiefe s nur am angeklickten Teil, das andere bleibt gerade. ⇒ HV weld: 45° bevel over the depth s only on the clicked part, the other stays straight.
Hyperbel ⇒ Hyperbola
I-Naht (Stumpf) ⇒ I weld (butt)
I-Naht s ⇒ I weld s
I-Naht: ohne Fugenvorbereitung, nur Nahtüberhöhung. ⇒ I weld: without joint preparation, only weld reinforcement.
I-Träger (IPE) ⇒ I-beam (IPE)
id und type lassen sich nicht ändern – Feature löschen und neu anlegen. ⇒ id and type cannot be changed – delete the feature and create it again.
Im Browser die Größe mit Strg + / − (oder Strg + Mausrad) einstellen. ⇒ In the browser, set the size with Ctrl + / − (or Ctrl + mouse wheel).
Im Browser wirkt die Größe über Strg + / − (bzw. Strg + Mausrad). Im Desktop-Programm stellt cantcodecad sie selbst ein. ⇒ In the browser the size works via Ctrl + / − (or Ctrl + mouse wheel). In the desktop program cantcodecad sets it itself.
Im flachen Zustand hinzugefügtes Material wird beim Zurückfalten nicht übernommen ⇒ Material added in the flat state is not taken over when refolding
Im Kern immer so: an jeder gewählten Kante werden die Kanten mitbearbeitet, die tangential weiterlaufen – die Kette endet an der nächsten Ecke. Eine Kette muss deshalb nur einmal angeklickt werden; eine einzelne Kante ohne ihre Kette geht nicht. ⇒ Always like this in the kernel: at each selected edge, the edges that continue tangentially are processed too – the chain ends at the next corner. A chain therefore only needs to be clicked once; a single edge without its chain is not possible.
Im Modell anklicken ⇒ Click in the model
Im Modell verwendet ⇒ Used in the model
Im Modell: erster Klick = Zielkörper, weitere Klicks = Werkzeuge.{0} ⇒ In the model: first click = target body, further clicks = tools.{0}
Im Nester-Ordner fehlt .venv\Scripts\python.exe ({0}). Einmal start.bat des Nesters ausführen. ⇒ The nester folder lacks .venv\Scripts\python.exe ({0}). Run the nester's start.bat once.
Im Ordner Projekte liegt noch nichts. Erst ein Teil mit Strg+S speichern. ⇒ The Projekte folder is still empty. First save a part with Ctrl+S.
Im Rahmen liegt keine neue Kante. ⇒ No new edge lies in the frame.
Im Zielkörper ⇒ In the target body
Import fehlgeschlagen ({0}) ⇒ Import failed ({0})
Import nicht möglich: ⇒ Import not possible:
Importdatei noch nicht geladen ⇒ Import file not loaded yet
Importieren ⇒ Import
Importieren (STEP, STL, DXF, SVG) ⇒ Import (STEP, STL, DXF, SVG)
In {0} Teile unterbrochen. ⇒ Broken into {0} parts.
In Blech umwandeln ⇒ Convert to Sheet Metal
In Blech umwandeln: ebene Fläche eines gleich dicken Körpers anklicken. Sie bleibt in der Abwicklung liegen. ⇒ Convert to sheet metal: click a planar face of a body of uniform thickness. It stays in place in the flat pattern.
In cantcodecad wird gerade eine Skizze oder ein Feature bearbeitet – dort erst OK oder Abbrechen wählen. ⇒ A sketch or feature is currently being edited in cantcodecad – choose OK or Cancel there first.
in der Ebene ⇒ in the plane
In die Skizzenebene ⇒ Into the sketch plane
In dieser Ansicht sind keine Bohrungen zu sehen. ⇒ No holes are visible in this view.
In dieser Lage braucht das Teil keine Stützen. ⇒ In this orientation the part needs no supports.
In eine Baugruppenkonstruktion umwandeln ⇒ Convert to an assembly design
In eine Bauteilkonstruktion umwandeln (nur ohne Komponenten, Teile, Gelenke) ⇒ Convert to a part design (only without components, parts, joints)
In jedem Maß- oder Zahlenfeld kann statt einer Zahl ein Ausdruck stehen, z. B. ⇒ Every dimension or number field can hold an expression instead of a number, e.g.
in Linien auflösen ⇒ explode into lines
In Verlängerung liegt keine Kurve. ⇒ No curve lies in the extension.
Inhalt ⇒ Contents
Innen ⇒ Inside
Innenkanten ⇒ Inner edges
Innenkonturen ⇒ Inner contours
Innenmaß ⇒ Inner dimension
Ins Material ⇒ Into the material
Interner Fehler im Geometriekern ⇒ Internal error in the geometry kernel
Isokurven (u/v-Linien gekrümmter Flächen, ein/aus) ⇒ Isocurves (u/v lines of curved faces, on/off)
Isokurven an – das Modell hat keine gekrümmten Flächen. ⇒ Isocurves on – the model has no curved faces.
Isokurven an: {0} gekrümmte Fläche{1}{2}. Noch einmal wählen zum Ausschalten. ⇒ Isocurves on: {0} curved face{1:s}{2}. Choose again to turn off.
Isokurven aus. ⇒ Isocurves off.
Isokurven: {0} ⇒ Isocurves: {0}
Isometrie ⇒ Isometric
Isometrie (verkleinert) ⇒ Isometric (reduced)
Isometrie von hinten ⇒ Isometric from the back
Isometrische Ansicht ⇒ Isometric view
Ja ⇒ Yes
Je eine Endkante beider Bleche anklicken ⇒ Click one end edge on each of the two sheets
Je eine Endkante beider Bleche anklicken. ⇒ Click one end edge on each of the two sheets.
Je Material entsteht ein Ergebnis. Werte sind Richtwerte (Stahl S235, Alu 6082 T6 …). ⇒ One result per material. Values are guide values (steel S235, aluminum 6082 T6 …).
Je Seite ⇒ Per side
Je Skizze wird das erste geschlossene Profil genommen. Haben alle Profile gleich viele Löcher, gehen die Löcher mit (z. B. Rohrübergang). Mit Mittellinie (Kurvenkette einer eigenen Skizze) folgt der Übergang ihr; die Profile liegen der Reihe nach auf ihr. ⇒ The first closed profile is taken from each sketch. If all profiles have the same number of holes, the holes go along (e.g. tube transition). With a center line (curve chain of its own sketch) the loft follows it; the profiles lie on it in order.
Jede Blechdicke und jedes Material kommt auf eigene Tafeln. ⇒ Every sheet thickness and every material goes on its own sheets.
Jede geschlossene Kontur der Skizze teilt die Flächen, durch die sie senkrecht zur Skizzenebene läuft (z. B. ein Markierungsfeld auf einem Blech); der Körper bleibt ganz. ⇒ Every closed contour of the sketch splits the faces it passes through perpendicular to the sketch plane (e.g. a marking field on a sheet); the body stays whole.
Jede geschlossene Kontur der Skizze trennt die Körper senkrecht zur Skizzenebene (durch alles) – z. B. ein Blech an einer Kontur in Einzelteile für den Laser. ⇒ Every closed contour of the sketch separates the bodies perpendicular to the sketch plane (through all) – e.g. a sheet at a contour into individual parts for the laser.
Jede Linie der Skizze wird ein eigener Stab (Konstruktionslinien nicht). Ecken mit genau zwei Stäben werden auf Gehrung geschnitten oder stumpf gestoßen. ⇒ Every line of the sketch becomes its own member (construction lines not). Corners with exactly two members are mitered or butted.
Jede Linie der Skizze wird eine Rippe, mittig zur Skizzenebene, die bis an den Körper reicht. Typisch: Skizze auf einer Ebene quer durch einen Winkel, Linie schräg über die Innenecke. ⇒ Every line of the sketch becomes a rib, centered on the sketch plane, reaching to the body. Typical: sketch on a plane across an angle, line diagonally over the inside corner.
Jede Linie wird eine Wand (mittig zur Linie), die von der Skizzenebene um die Tiefe wächst, z. B. ein Rippennetz im Boden einer Schale. Anders als die Rippe reicht der Steg nicht bis zum Körper hinunter, nur die Enden laufen auf Wunsch bis an die Wände. ⇒ Every line becomes a wall (centered on the line) that grows from the sketch plane by the depth –, e.g. a rib grid in the bottom of a shell. Unlike the rib, the web does not reach down to the body, only the ends run up to the walls on request.
Jede Schiene braucht eine eigene Skizze ⇒ Every rail needs its own sketch
Jede Schiene muss auf dem ersten Profil beginnen und auf dem zweiten enden ⇒ Every rail must start on the first profile and end on the second
Jetzt Baugruppenkonstruktion: Teile einfügen, Komponenten, Gelenke, Normteile. ⇒ Now assembly design: insert parts, components, joints, fasteners.
Jetzt Bauteilkonstruktion. ⇒ Now part design.
Jetzt das Ende der Schnittlinie anklicken. ⇒ Now click the end of the section line.
Jetzt die gegenüberliegende Ecke anklicken. ⇒ Now click the opposite corner.
jetzt die Kante am zweiten Blech … ⇒ now the edge on the second sheet …
Jetzt die Lage der Hilfsansicht anklicken. Geblickt wird senkrecht auf die Kante, zu dieser Seite hin. ⇒ Now click the position of the auxiliary view. It looks perpendicular onto the edge, toward this side.
Jetzt die Lage der Schnittansicht anklicken. Geblickt wird zu dieser Seite hin. Mit Umschalt+Klick folgt eine Absetzung. ⇒ Now click the position of the section view. It looks toward this side. Shift+click adds an offset.
Jetzt die Lage der Tabelle anklicken (linke obere Ecke). ⇒ Now click the position of the table (top left corner).
Jetzt die Lage des Textes anklicken. ⇒ Now click the position of the text.
Jetzt die Lage des Zeichens anklicken. ⇒ Now click the position of the symbol.
Jetzt die Stelle für die vergrößerte Einzelheit anklicken. ⇒ Now click the location for the enlarged detail.
Jetzt die zweite Kante anklicken. ⇒ Now click the second edge.
Jetzt die zweite Kurve nahe an ihrem Ende anklicken. ⇒ Now click the second curve near its end.
Kamera ⇒ Camera
Kante ⇒ Edge
Kante ✓ ⇒ Edge ✓
Kante als Pfad anklicken … ⇒ Click an edge as the path …
Kante als Pfad anklicken (gerade, Bogen oder Kurve). Die Ebene steht senkrecht auf der Kante an der eingestellten Stelle, z. B. für ein Profil, das entlang der Kante gezogen wird. ⇒ Click an edge as the path (straight, arc or curve). The plane stands perpendicular to the edge at the set location, e.g. for a profile swept along the edge.
Kante am bündigen Stoß anklicken (beide Flächen liegen in einer Ebene). ⇒ Click the edge at the flush joint (both faces lie in one plane).
Kante an der Innenecke anklicken, wo zwei Stäbe zusammenstoßen. ⇒ Click the edge at the inside corner where two members meet.
Kante anklicken … ⇒ Click an edge …
Kante anklicken (gerade, Bogen oder Kurve), Lage in % ihrer Länge. ⇒ Click an edge (straight, arc or curve), position in % of its length.
Kante anklicken, der Punkt sitzt in ihrer Mitte. ⇒ Click an edge, the point sits at its midpoint.
Kante gewählt – die Bohrung sitzt an der gewählten Stelle der Kante in der Fläche daneben. ⇒ Edge selected – the hole sits at the selected location of the edge in the face next to it.
Kante im Modell anklicken (Art im Dialog). Der Punkt hilft beim Aufspannen von Ebenen und Achsen. ⇒ Click an edge in the model (type in the dialog). The point helps to define planes and axes.
Kante ist keine Ecke ⇒ Edge is not a corner
Kante liegt nicht zwischen Blechfläche und Stirnseite ⇒ Edge does not lie between sheet metal face and end face
Kante liegt nicht zwischen zwei ebenen Wänden ⇒ Edge does not lie between two planar walls
Kante nahe dem gewünschten Endpunkt anklicken. ⇒ Click an edge near the desired end point.
Kante nicht mehr gefunden ⇒ Edge no longer found
Kante oder Achse wählen ⇒ Select an edge or axis
Kante und Ebene ⇒ Edge and plane
Kante wählen ⇒ Select edge
Kante, {0} mm lang ⇒ Edge, {0} mm long
Kante, Kreiskante oder Zylinderfläche anklicken … ⇒ Click an edge, circular edge or cylindrical face …
Kante/Achse anklicken … ⇒ Click edge/axis …
Kante/Achse im Modell anklicken … ⇒ Click an edge/axis in the model …
Kanten ⇒ Edges
Kanten an den Innenecken anklicken (z. B. wo ein Stab auf den anderen trifft). ⇒ Click edges at the inside corners (e.g. where one member meets another).
Kanten an den Innenecken anklicken, z. B. wo ein Stab auf den anderen stößt. ⇒ Click edges at the inside corners, e.g. where one member butts against another.
Kanten an den Innenecken wählen ⇒ Select edges at the inside corners
Kanten anklicken, um sie hinzuzufügen oder zu entfernen. ⇒ Click edges to add or remove them.
Kanten der gewählten Flächen ⇒ Edges of the selected faces
Kanten im Modell anklicken – mehrere auf einmal mit dem Rahmen oder frei mit Alt. ⇒ Click edges in the model – several at once with the window, or freehand with Alt.
Kanten lassen sich nicht einzeln löschen. Eine Fläche des Körpers wählen, um den Körper zu entfernen. ⇒ Edges cannot be deleted individually. Select a face of the body to remove the body.
Kanten von Flächen ⇒ Edges of faces
Kantenbeschreibung {0}{1} ⇒ Edge description {0}{1}
Kantengruppen ⇒ Edge sets
Kantenlinien {0} ⇒ Edge lines {0}
Kantenmitte ⇒ Edge midpoint
Kegelfläche ⇒ Conical face
Kegelsenkung ⇒ Countersink
Kehlnaht ⇒ Fillet weld
Kehlnaht a ⇒ Fillet weld a
Kehlnaht als eigener Körper. „Ringsum“ schweißt die ganze Kontur der angeklickten Kante (auch Eckradien von Rohren). Die Ecke wird an jeder Kante automatisch gesucht, auch zwischen getrennten Rahmenstäben. Schenkellänge z = a·√2 bei 90°. ⇒ Fillet weld as its own body. “All around” welds the whole contour of the clicked edge (including corner radii of tubes). The corner is searched automatically at each edge, even between separate frame members. Leg length z = a·√2 at 90°.
Kein abgewickeltes Blech – erst „Abwickeln“ ⇒ No unfolded sheet – first “Unfold”
kein Bild ⇒ no image
kein Blechteil ⇒ not a sheet metal part
kein Druck ⇒ no pressure
Kein Feature mit der ID „{0}“. ⇒ No feature with ID “{0}”.
kein geschlossenes Profil ⇒ no closed profile
kein geschlossenes Profil (offene Enden) ⇒ no closed profile (open ends)
Kein Körper „{0}“. ⇒ No body “{0}”.
Kein Körper vorhanden ⇒ No body present
Kein Körper zum Teilen ⇒ No body to split
Kein Material gewählt. ⇒ No material selected.
kein Netz ⇒ no mesh
Kein sichtbarer Körper. ⇒ No visible body.
Keine ⇒ None
keine – Bereich = Hülle der Beibehalten-Geometrie + Rand ⇒ none – region = hull of the Preserve Geometry + margin
Keine (hohl) ⇒ None (hollow)
keine Abwicklung ⇒ no flat pattern
Keine Außenkanten gefunden ⇒ No outer edges found
Keine Dateien im Projektordner. ⇒ No files in the project folder.
Keine ebene Stirnfläche gefunden ⇒ No planar end face found
Keine Ecken an den gewählten Flächen ⇒ No corners on the selected faces
Keine ENTITIES-Sektion in der DXF-Datei ⇒ No ENTITIES section in the DXF file
Keine Features gewählt ⇒ No features selected
Keine Fläche gewählt, es gilt wieder die automatische Auswahl. ⇒ No face selected, the automatic selection applies again.
Keine Fläche zum Öffnen gewählt ⇒ No face to open selected
Keine Flächen gewählt ⇒ No faces selected
Keine Gegenfläche gefunden – ist der Körper ein Blech gleicher Dicke? ⇒ No opposite face found – is the body a sheet of uniform thickness?
Keine Grundlasche oder Konturlasche (Blech) im Teil ⇒ No base flange or contour flange (sheet metal) in the part
Keine gültige Linie für den Steg ⇒ No valid line for the web
Keine gültige Linie für die Rippe ⇒ No valid line for the rib
Keine gültige SVG-Datei ⇒ No valid SVG file
Keine Innenkanten (Kehlen) gefunden ⇒ No inner edges (fillets) found
Keine Kante aufgetrennt ⇒ No edge ripped
Keine Kanten gewählt ⇒ No edges selected
Keine Konfigurationen vorhanden. ⇒ No configurations present.
keine Körper ⇒ no bodies
Keine Körper gewählt ⇒ No bodies selected
keine Körperliste im Dokument ⇒ no body list in the document
keine Kraft in diesem Lastfall ⇒ no force in this load case
keine Linien, Kreise oder Bögen ⇒ no lines, circles or arcs
Keine Linien, Kreise oder Bögen in der DXF-Datei gefunden ⇒ No lines, circles or arcs found in the DXF file
Keine Linien, Kreise oder Bögen in der DXF-Datei gefunden. ⇒ No lines, circles or arcs found in the DXF file.
Keine passenden Ecken gefunden ⇒ No matching corners found
Keine Pfade oder Formen in der SVG-Datei gefunden ⇒ No paths or shapes found in the SVG file
Keine Teile mit Stückzahl in dieser Gruppe. ⇒ No parts with quantity in this group.
Keine Überschneidungen zwischen {0} Körperpaar{1}. Berührungen zählen nicht. ⇒ No interferences between {0} body pair{1:s}. Contacts do not count.
Keine verknüpften Teile. ⇒ No linked parts.
Keine Zelle gewählt ⇒ No cell selected
Kenngröße ⇒ Characteristic
Kennung ⇒ Identifier
Kern konnte nicht laden. Besteht eine Internetverbindung? ⇒ Kernel could not load. Is there an internet connection?
Kern nicht verfügbar: ⇒ Kernel not available:
Kern-Import {0} ⇒ Kernel import {0}
Kernloch ⇒ Tap drill
Kette ⇒ Chain
Kette aus {0} Kurven ⇒ Chain of {0} curves
Kette: Punkte der Reihe nach ⇒ Chain: points in order
Kettenbemaßung: Punkte der Reihe nach, Klick ins Freie legt die Lage fest ⇒ Chain dimension: points in order, a click into empty space sets the position
Klammer ) fehlt ⇒ Parenthesis ) missing
Kleinste Masse, bei der die Vergleichsspannung (von Mises) höchstens Streckgrenze / Sicherheitsfaktor ist. Rechnet je Material fünf Varianten. ⇒ Smallest mass at which the equivalent stress (von Mises) is at most yield strength / safety factor. Computes five variants per material.
kleinster Radius ⇒ smallest radius
Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Umschalt + Mitte dreht, Mitte verschiebt, Rad zoomt, Rechtsklick öffnet das Markierungsmenü, S sucht Befehle. ⇒ Click selects faces and edges, window or Alt-drag selects edges. Shift + middle orbits, middle pans, wheel zooms, right-click opens the marking menu, S searches commands.
Klicken wählt aus, Shift-Klick wählt mehrere. Punkte und Linien lassen sich ziehen. Eine Körperkante anklicken übernimmt sie als violetten Bezug. Entf löscht. ⇒ Click selects, Shift-click selects several. Points and lines can be dragged. Clicking a body edge takes it over as a purple reference. Del deletes.
Knicken maßgebend ({0}): Knicksicherheit {1}, Spannung allein {2} ⇒ Buckling governs ({0}): buckling safety {1}, stress alone {2}
Knotenblech ⇒ Gusset
Knotenbleche ⇒ Gussets
Koaxialität ⇒ Coaxiality
Kollinear ⇒ Collinear
Kollision ⇒ Interference
Kombinieren ⇒ Combine
Kombinieren: zuerst den Zielkörper anklicken, dann die Werkzeugkörper. ⇒ Combine: first click the target body, then the tool bodies.
Kommentar ⇒ Comment
Kompakt Fertigung ⇒ Compact manufacturing
Komponente ⇒ Component
Komponente {0} ⇒ Component {0}
Komponente auflösen (Inhalt geht eine Ebene höher) ⇒ Dissolve component (contents move one level up)
Komponente bearbeiten: ⇒ Edit component:
Komponente erstellt. Mit Gelenk (J) lässt sie sich an andere Teile setzen. ⇒ Component created. With Joint (J) it can be placed on other parts.
Komponente fehlt ⇒ Component missing
Komponenten ⇒ Components
Komponenten bewegen sich als Ganzes, lose Körper einzeln. Nur Anzeige – das Modell bleibt unverändert. Ansicht drehen und zoomen geht weiter. ⇒ Components move as a whole, loose bodies individually. Display only – the model stays unchanged. Orbiting and zooming keep working.
Komponentenfarben an – das Dokument hat noch keine Komponenten. ⇒ Component colors on – the document has no components yet.
Komponentenfarben an: jede Komponente in eigener Farbe. Noch einmal wählen zum Ausschalten. ⇒ Component colors on: each component in its own color. Choose again to turn off.
Komponentenfarben anzeigen (ein/aus) ⇒ Show component colors (on/off)
Komponentenfarben aus. ⇒ Component colors off.
Konfiguration „{0}“ – nicht übernommen: {1} ⇒ Configuration “{0}” – not applied: {1}
Konfiguration „{0}“ aktiv. ⇒ Configuration “{0}” active.
Konfigurationen ⇒ Configurations
Konfigurationen (Teilefamilie) ⇒ Configurations (part family)
Konfigurieren ⇒ Configure
Konische Kurve ⇒ Conic Curve
Konische Kurve: Startpunkt klicken ⇒ Conic curve: click the start point
Konstant ⇒ Constant
Konstruieren ⇒ Construct
Konstruktion ⇒ Design
Konstruktion {0} ⇒ Design {0}
Konstruktion erstellen ⇒ Create Design
Konstruktionsgeometrie ⇒ Construction geometry
Konstruktionslinie ⇒ Construction line
Kontur ⇒ Contour
Kontur des Ergebnisses lässt sich nicht als Kurve bauen ⇒ The contour of the result cannot be built as a curve
Konturen ⇒ Contours
Konturlasche ⇒ Contour Flange
Konturlasche nicht möglich – Linien zu kurz für die Biegeradien oder Kontur überschneidet sich? ⇒ Contour flange not possible – lines too short for the bend radii or contour intersects itself?
Konzentrisch ⇒ Concentric
Konzentrisch braucht zwei Achsen (Zylinderflächen oder Kreiskanten) ⇒ Concentric needs two axes (cylindrical faces or circular edges)
Koordinaten ⇒ Coordinates
Koordinaten im Ursprungssystem eingeben. ⇒ Enter coordinates in the origin system.
Koordinaten: zuerst den Nullpunkt ⇒ Coordinates: first the origin
Koordinatenbemaßung: Nullpunkt, dann weitere Punkte, Klick ins Freie legt die Lage fest ⇒ Ordinate dimension: origin, then further points, a click into empty space sets the position
Kopie ⇒ Copy
Kopie in der Zeichnung, nicht verknüpft ⇒ Copy in the drawing, not linked
Körper ⇒ Bodies
Körper (Fläche anklicken, leer = alle) ⇒ Bodies (click a face, empty = all)
Körper (keiner gewählt = alle sichtbaren) ⇒ Bodies (none selected = all visible)
Körper (leer = alle) ⇒ Bodies (empty = all)
Körper {0} gibt es nicht mehr ⇒ Body {0} no longer exists
Körper anklicken (Entwurfsbereich → Beibehalten) ⇒ Click a body (design space → Preserve)
Körper anklicken, die ab hier nicht mehr zum Teil gehören. Die Features davor bleiben erhalten. ⇒ Click the bodies that no longer belong to the part from here on. The features before it are kept.
Körper anklicken, die zur neuen Komponente gehören. Name oben im Dialog. ⇒ Click the bodies that belong to the new component. Name at the top of the dialog.
Körper entfernen ⇒ Remove bodies
Körper im Modell anklicken – noch einmal anklicken nimmt ihn heraus.{0} ⇒ Click a body in the model – clicking it again takes it out.{0}
Körper im Modell anklicken (oder oben wählen), dann Versatz und Drehung eingeben. „Kopie“ lässt das Original stehen. ⇒ Click bodies in the model (or select above), then enter offset and rotation. “Copy” leaves the original in place.
Körper nach Name ⇒ Bodies by name
Körper nicht gefunden ⇒ Body not found
Körper oder Komponenten wählen. „Abstand/Winkel“ wie bisher; „Punkt zu Punkt“ setzt einen Eckpunkt auf einen anderen; „Entlang Kante“ gleitet an einer Kante entlang (Kreis- oder Bogenkante: drehen um ihre Mittelachse); „Drehen um Kante“ nimmt eine Kante, Kreiskante oder Achse aus dem Modell als Drehachse. ⇒ Select bodies or components. “Distance/angle” as before; “Point to point” moves one corner point onto another; “Along edge” slides along an edge (circular or arc edge: rotates about its center axis); “Rotate about edge” takes an edge, circular edge or axis from the model as the axis of rotation.
Körper teilen ⇒ Split Body
Körper teilen: Ebene wählen (Ursprungsebene, Fläche oder Arbeitsebene). Ohne Auswahl werden alle getroffenen Körper geteilt. ⇒ Split body: select a plane (origin plane, face or construction plane). Without a selection all bodies hit are split.
Körperfläche ⇒ Body face
Körperkante · Klick übernimmt sie ⇒ Body edge · click takes it over
Körperkante oder Fläche anklicken. ⇒ Click a body edge or face.
Körperpunkt · ⇒ Body point ·
Kosmetisch ⇒ Cosmetic
Kosmetisch: nur das Kernloch, die Zeichnung zeigt das Gewinde als „M…“. ⇒ Cosmetic: only the tap drill hole, the drawing shows the thread as “M…”.
Kraft ⇒ Force
Kraft {0} N unter {1}° ⇒ Force {0} N at {1}°
Kraft {2} N unter {3}° ⇒ Force {2} N at {3}°
Kräfte und Abhängigkeiten gehören auf Beibehalten-Geometrie (grün). Diese Fläche gehört zu einem anderen Körper – erst ihn als Beibehalten wählen. ⇒ Forces and constraints belong on Preserve Geometry (green). This face belongs to another body – first choose it as Preserve.
Kräfte und Abhängigkeiten gehören auf Beibehalten-Geometrie – sonst kann die Optimierung die Stelle wegnehmen. ⇒ Forces and constraints belong on Preserve Geometry – otherwise the optimization may remove the spot.
Kreis ⇒ Circle
Kreis mit 2 Punkten ⇒ 2-Point Circle
Kreis mit 2 Punkten: die beiden Enden eines Durchmessers klicken. Vorhandene Punkte liegen danach auf dem Kreis. ⇒ 2-point circle: click the two ends of a diameter. Existing points then lie on the circle.
Kreis mit 3 Punkten ⇒ 3-Point Circle
Kreis mit 3 Punkten: drei Punkte auf dem Kreis klicken. Vorhandene Punkte liegen danach auf dem Kreis. ⇒ 3-point circle: click three points on the circle. Existing points then lie on the circle.
Kreis mit Mittelpunkt ⇒ Center Diameter Circle
Kreis tangential an 2 Linien ⇒ 2-Tangent Circle
Kreis tangential an 2 Linien: zwei Linien anklicken, dann Lage und Größe im Winkel zwischen ihnen. Bleibt tangential. ⇒ 2-tangent circle: click two lines, then the position and size in the angle between them. Stays tangent.
Kreis tangential an 3 Linien ⇒ 3-Tangent Circle
Kreis tangential an 3 Linien: drei Linien anklicken, z. B. die Seiten eines Dreiecks (Inkreis). Bleibt tangential. ⇒ 3-tangent circle: click three lines, e.g. the sides of a triangle (incircle). Stays tangent.
Kreis- oder Bogenkante anklicken. ⇒ Click a circular or arc edge.
Kreis: d muss größer als 0 sein. ⇒ Circle: d must be greater than 0.
Kreis: Mittelpunkt klicken, dann einen Punkt auf dem Rand. Körperkanten und -punkte fangen mit. ⇒ Circle: click the center, then a point on the rim. Body edges and points snap too.
Kreisförmige Anordnung ⇒ Circular arrangement
Kreiskante ⇒ Circular edge
Kreiskante (Mittelachse) ⇒ Circular edge (center axis)
Kreiskante ohne Mittelpunkt ⇒ Circular edge without center
Kreiskanten ⇒ Circular edges
Kreiskanten und Bohrungen werden mittig zueinander gesetzt, ebene Flächen bündig. Gehört der Körper zu einer Komponente oder einem eingefügten Teil, bewegt sich das ganze Teil. ⇒ Circular edges and holes are centered on each other, planar faces made flush. If the body belongs to a component or an inserted part, the whole part moves.
Kreismitte ⇒ Circle center
Kreismuster ⇒ Circular Pattern
Kreismuster: vorher Elemente wählen, dann den Mittelpunkt klicken. Die Kopien bleiben an die Vorlage gebunden. Anzahl später: ein Element des Musters wählen und in der Palette ändern. ⇒ Circular pattern: select entities first, then click the center. The copies stay bound to the original. Quantity later: select an entity of the pattern and change it in the palette.
Krümmungs-Map ⇒ Curvature Map
Krümmungs-Map (Krümmung farbig) ⇒ Curvature map (curvature in color)
Krümmungskamm ⇒ Curvature comb
Kugel ⇒ Sphere
Kugel ⌀{0} ⇒ Sphere ⌀{0}
Kugel- und Torusflächen lassen sich noch nicht verdicken ⇒ Spherical and toroidal faces cannot be thickened yet
Kugel: Drehen um die Achse und Neigen um X und Y – Drehpunkt ist Ursprung 2. ⇒ Ball: rotation about the axis and tilt about X and Y – the pivot is origin 2.
Kugelfläche ⇒ Spherical face
Kupfer ⇒ Copper
Kurve ⇒ Curve
Kurve oder Kette anklicken ⇒ Click a curve or chain
Kurve versetzen ⇒ Offset curve
Kurvenstück anklicken ⇒ Click a curve segment
Lade … ⇒ Loading …
Lage ⇒ Position
Lage auf der Kante ⇒ Position on the edge
Lage zur Skizze ⇒ Position relative to the sketch
Länge ⇒ Length
Länge (mit Kopf) ⇒ Length (with head)
Länge (X) ⇒ Length (X)
Länge + Versatz ⇒ Length + offset
Länge = längste Kante (Spitze der Gehrung). Schnitt = Gehrungswinkel an beiden Enden (0° = gerader Schnitt). ⇒ Length = longest edge (tip of the miter). Cut = miter angle at both ends (0° = straight cut).
Länge muss größer als 0 sein ⇒ Length must be greater than 0
Langloch (Gesamtlänge) ⇒ Overall Slot
Langloch (Mitte zu Mitte) ⇒ Center to Center Slot
Langloch (Mittelpunkt) ⇒ Center Point Slot
Langloch: erste Mitte, zweite Mitte, dann die Breite klicken. ⇒ Slot: click the first center, the second center, then the width.
Lasche ⇒ Flange
Lasche an Kante ⇒ Edge Flange
Lasche an Kante: gerade Kanten der Blechfläche anklicken. Höhe ist das Außenmaß, Biegeradius und Dicke aus der Blechregel. ⇒ Edge flange: click straight edges of the sheet metal face. Height is the outer dimension, bend radius and thickness from the sheet metal rule.
Lasche: geschlossenes Skizzenprofil wird zum Blech in der Dicke der Blechregel. ⇒ Flange: a closed sketch profile becomes sheet metal in the thickness of the sheet metal rule.
Laschenhöhe zu klein für Biegeradius und Dicke ⇒ Flange height too small for bend radius and thickness
Laser / Plasma ⇒ Laser / plasma
Last bearbeiten ⇒ Edit load
Last: Kraft auf eine Fläche einer Beibehalten-Geometrie ⇒ Load: force on a face of a Preserve Geometry
Lastfall {0} ⇒ Load Case {0}
Lastfall 1 ⇒ Load Case 1
Lastfall hinzufügen ⇒ Add load case
Lastfälle ⇒ Load Cases
Lauf ⇒ Runout
Lauter verschiedene Profil-Skizzen wählen ⇒ Select all different profile sketches
Lauter verschiedene Profil-Skizzen wählen. ⇒ Select all different profile sketches.
Leere Felder werden automatisch gefüllt. ⇒ Empty fields are filled automatically.
Leeren ⇒ Clear
Leeres Teil ⇒ Empty part
liegt schon auf der Zielfläche ⇒ already lies on the target face
Lineares Muster ⇒ Rectangular Pattern
Lineares Muster: vorher Elemente wählen, dann zwei Punkte für Richtung und Abstand. Die Achse ist eine Konstruktionslinie mit Maß, sie lässt sich bemaßen und ausrichten. ⇒ Rectangular pattern: select entities first, then two points for direction and spacing. The axis is a construction line with a dimension; it can be dimensioned and aligned.
Linie ⇒ Line
Linie {0} ist zu kurz für die Biegeradien (mind. {1} mm) ⇒ Line {0} is too short for the bend radii (min. {1} mm)
Linie gewählt: zweite Linie für einen Winkel anklicken oder die Lage für die Länge. ⇒ Line selected: click a second line for an angle, or the position for the length.
Linie oder Bogen nahe am Ende anklicken ⇒ Click a line or arc near the end
Linie, Bogen oder offenen Spline nahe an seinem Ende anklicken. ⇒ Click a line, arc or open spline near its end.
Linie: Punkte nacheinander klicken. Doppelklick oder Esc beendet den Linienzug. Fängt an Skizze und Körper (violett: Körperpunkt/-kante, wird automatisch projiziert). ⇒ Line: click points one after another. Double-click or Esc ends the polyline. Snaps to sketch and body (purple: body point/edge, projected automatically).
Linien ⇒ Lines
Linien und Bögen lassen sich verlängern. ⇒ Lines and arcs can be extended.
Linienform ⇒ Line type
Links ⇒ Left
Links (−X) ⇒ Left (−X)
Loch ⇒ Hole
Löcher ⇒ Holes
Löschen ⇒ Delete
Lösen ⇒ Solve
Lotrecht auf {0} ⇒ Normal to {0}
Lotrecht auf Ebene ⇒ Normal to plane
Lotrecht zur Fläche ⇒ Normal to face
Marker ziehen, um das Modell zurückzurollen ⇒ Drag the marker to roll back the model
Maß ⇒ Dimension
Maß {0} = {1} ist ungültig ⇒ Dimension {0} = {1} is invalid
Maß {0} mm ⇒ Dimension {0} mm
Maß gelöscht (Strg+Z holt es zurück). ⇒ Dimension deleted (Ctrl+Z brings it back).
Maß muss größer als 0 sein ⇒ Dimension must be greater than 0
Maß muss größer als 0 sein. ⇒ Dimension must be greater than 0.
Masse ⇒ Mass
Maße ⇒ Dimensions
Masse minimieren ⇒ Minimize mass
Maße mit Doppelklick ändern, auch als Rechnung wie 60/2. Bedingungen gelten für die gewählten Elemente. Was der Skizze widerspricht, wird nicht übernommen. ⇒ Change dimensions with a double-click, also as a calculation like 60/2. Constraints apply to the selected entities. Whatever contradicts the sketch is not applied.
Maße müssen größer als 0 sein ⇒ Dimensions must be greater than 0
Massenmittelpunkt (ein/aus) ⇒ Center of mass (on/off)
Massenmittelpunkt X {0} · Y {1} · Z {2} mm{3}{4} ⇒ Center of mass X {0} · Y {1} · Z {2} mm{3}{4}
Maßstab ⇒ Scale
Materialien ⇒ Materials
max. Verschiebung ⇒ max. displacement
Mehr als neun Absetzungen sind nicht möglich. ⇒ More than nine offsets are not possible.
Mehrere Körper ⇒ Multiple bodies
Mehrere Zeilen mit Enter. Den Text kann man mit der Maus verschieben. ⇒ Several lines with Enter. The text can be moved with the mouse.
Menge ⇒ Quantity
Messen ⇒ Measure
Messen nicht möglich: ⇒ Measure not possible:
Messen: Fläche oder Kante anklicken, dann optional eine zweite. Ein dritter Klick fängt neu an. Esc schließt. ⇒ Measure: click a face or edge, then optionally a second one. A third click starts over. Esc closes.
Messing ⇒ Brass
Messwerte jedes Baus (Import, Netze, Dauerspeicher) in der Statuszeile und in der Konsole, dazu im Protokoll des lokalen Servers. Zum Messen großer Baugruppen; im Alltag aus. ⇒ Measurements of every build (import, meshes, persistent storage) in the status bar and in the console, plus in the log of the local server. For measuring large assemblies; off in everyday use.
Meter ⇒ Meters
Millimeter ⇒ Millimeters
Mindestens eine Abhängigkeit mit beiden Seiten wählen ⇒ Select at least one constraint with both sides
Mindestens eine Konfiguration bleibt. ⇒ At least one configuration remains.
Mindestens einen Punkt als Halterung festlegen. ⇒ Define at least one point as a support.
Mindestens einen Punkt der Skizze als Kraft festlegen. ⇒ Define at least one point of the sketch as a force.
Mindestens einen Werkzeugkörper wählen ⇒ Select at least one tool body
Mindestens zwei Komponenten wählen ⇒ Select at least two components
Mindestens zwei Komponenten wählen. ⇒ Select at least two components.
Mindestens zwei Profile wählen ⇒ Select at least two profiles
Mindestradius ⇒ Minimum radius
Mindestradius-Analyse ⇒ Minimum Radius Analysis
Mindestschräge ⇒ Minimum draft
Mindeststabbreite erreicht: noch dünnere Stäbe als etwa {0} mm löst das Raster nicht auf (das Teil zerfiele). Die Last ist dafür klein – Sicherheitsfaktor {1}. Leichter: feineres Raster unter „Fertigung“ oder dünneres Material ⇒ Minimum member width reached: the grid cannot resolve members thinner than about {0} mm (the part would fall apart). The load is small for it – safety factor {1}. Lighter: finer grid under “Manufacturing” or thinner material
Mit dem Versatz bleibt für das Gewinde keine Länge übrig ⇒ With the offset no length is left for the thread
Mit dem Versatz bleibt vom Schnitt nichts übrig ⇒ With the offset nothing is left of the cut
Mit den Abständen liegt die Bohrung außerhalb der Fläche ⇒ With these distances the hole lies outside the face
Mit einem Körper geht nur ein offener Pfad ⇒ With a body only an open path works
Mit einer Körperfläche als Profil gehen nur Abstand oder „Alle“, ohne Verjüngung und dünne Wand ⇒ With a body face as profile only distance or “All” work, without taper and thin wall
Mit Führungsschiene gehen weder Verdrehwinkel noch Ausrichtung parallel ⇒ With a guide rail neither twist angle nor parallel orientation work
Mit Führungsschiene geht keine Verjüngung ⇒ With a guide rail no taper works
Mit Schienen gehen genau zwei Profile ⇒ With rails exactly two profiles work
Mit Schienen gehen nur Profile ohne Löcher ⇒ With rails only profiles without holes work
Mitgeliefert ⇒ Built-in
Mitgelieferte Regeln lassen sich nicht überschreiben. Bitte einen anderen Namen wählen. ⇒ Built-in rules cannot be overwritten. Please choose a different name.
Mitte ⇒ Center
Mitte – Mitte ⇒ Center – center
Mitte der Körper ⇒ Center of the bodies
Mitte Draht ⇒ Wire center
Mitte in der Ebene ⇒ Center in the plane
Mitte: {0} | {1} ⇒ Center: {0} | {1}
Mittelebene ⇒ Midplane
Mittellinie ⇒ Center line
Mittellinie oder Schienen – beides zusammen geht nicht ⇒ Center line or rails – both together are not possible
Mittellinien und Mittelpunktmarken ⇒ Center lines and center marks
Mittelpunkt ⇒ Midpoint
Mittelpunkt in der Ebene ⇒ Midpoint in the plane
Mittelpunkt-Rechteck ⇒ Center Rectangle
Mittelpunkt-Rechteck: Mitte klicken, dann eine Ecke. ⇒ Center rectangle: click the center, then a corner.
Mittelpunktlinie ⇒ Center Point Line
Mittelpunktlinie: Mitte klicken, dann ein Ende. Die Linie wächst nach beiden Seiten gleich, die Mitte bleibt ihr Mittelpunkt. ⇒ Center point line: click the center, then one end. The line grows equally to both sides, the center stays its midpoint.
Mittig ⇒ Centered
mm, Grad ⇒ mm, degrees
Modell ⇒ Model
Modell {0} nicht lesbar ({1}). Die Zeichnung zeigt den mitgespeicherten Stand. ⇒ Model {0} not readable ({1}). The drawing shows the state saved with it.
Modell ist in der Zeichnung gespeichert (ohne Verknüpfung) ⇒ Model is stored in the drawing (without link)
Modell öffnen ⇒ Open model
Modelliert ⇒ Modeled
Modelliert für den 3D-Druck: Gewindegänge werden in die Bohrung eingeformt. Spiel 0,1–0,2 mm hilft bei FDM. ⇒ Modeled for 3D printing: thread turns are formed into the hole. A clearance of 0.1–0.2 mm helps with FDM.
Muster ⇒ Pattern
Muster nicht gefunden. ⇒ Pattern not found.
Nach ⇒ To
Nach (Ziel) ⇒ To (target)
nach außen ⇒ outward
Nach außen ⇒ Outward
Nach dem Speichern noch einmal „Zu Baugruppe hinzufügen“ wählen. ⇒ After saving, choose “Add to Assembly” again.
Nach Größe auswählen ⇒ Select by Size
Nach Größe auswählen … ⇒ Select by size …
Nach hinten ⇒ Backward
Nach innen ⇒ Inward
Nach OK zeigt Blech → Abwicklung den Zuschnitt (auch als DXF und in der Zeichnung). ⇒ After OK, Sheet Metal → Flat Pattern shows the blank (also as DXF and in the drawing).
Nach vorn ⇒ Forward
Naht ⇒ Weld
Naht;Art;a mm;Anzahl;Länge mm ⇒ Weld;Type;a mm;Qty;Length mm
Nahtdicke a ⇒ Weld thickness a
Nahtdicke a muss größer als 0 sein ⇒ Weld thickness a must be greater than 0
Nahtdicke s ⇒ Weld thickness s
Nähte ⇒ Welds
Nahtlänge gesamt ⇒ Total weld length
Name (Unterordner mit „/“, z. B. Kran/Stütze) ⇒ Name (subfolders with “/”, e.g. Crane/Column)
Name des Teils ⇒ Part name
Name doppelt ⇒ Duplicate name
Name fehlt ⇒ Name missing
Name in der Zeitleiste ⇒ Name in the timeline
Name: Buchstaben, Ziffern und _ – mit einem Buchstaben am Anfang. ⇒ Name: letters, digits and _ – starting with a letter.
neben cantcodecad. Die vorige Fassung landet in Projekte/.backup. ⇒ next to cantcodecad. The previous version goes to Projekte/.backup.
Neigen um X ⇒ Tilt about X
Neigen um Y ⇒ Tilt about Y
Neigung ⇒ Tilt
Nein ⇒ No
Nennmaß nicht abgedeckt ⇒ Nominal size not covered
Nester nicht gefunden. Erwartet unter Desktop\Nester\…\app.py oder als Pfad in tools/nester.json: { "dir": "…" }. ⇒ Nester not found. Expected under Desktop\Nester\…\app.py or as a path in tools/nester.json: { "dir": "…" }.
Nester: {16}. Gerechnet wird mit deinem Blechnesting (Python) im Hintergrund. ⇒ Nester: {16}. Computation runs with your sheet nesting (Python) in the background.
Nesting nicht möglich: ⇒ Nesting not possible:
Nesting starten ⇒ Start nesting
Netze {0} ms{1} ⇒ Meshes {0} ms{1}
Netze grob, Verfeinerung läuft ({0}) ⇒ Meshes coarse, refinement running ({0})
Netze ohne dauerhafte Erlaubnis – der Browser darf sie räumen ⇒ Meshes without persistent permission – the browser may clear them
Netze verfeinert in {0} ms ⇒ Meshes refined in {0} ms
Netze verfeinert in {0} ms{1} ⇒ Meshes refined in {0} ms{1}
Netze verfeinert: {0} Dreiecke in {1} ms ⇒ Meshes refined: {0} triangles in {1} ms
Netze werden verfeinert … ⇒ Meshes are being refined …
Netze zusammenfügen {0} ms ⇒ Merge meshes {0} ms
Netzquelle fehlt: ⇒ Mesh source missing:
Netzverfeinerung fehlgeschlagen: ⇒ Mesh refinement failed:
Neu ⇒ New
Neu: Einzelteil, Baugruppe oder Zeichnung ⇒ New: part, assembly or drawing
Neue {0} anfangen? Ungespeicherte Änderungen gehen verloren. ⇒ Start a new {0}? Unsaved changes will be lost.
Neue Baugruppe mit {0}. Weitere Teile über Baugruppe → Einfügen, verbinden mit Gelenk (J). ⇒ New assembly with {0}. More parts via Assembly → Insert, connect with Joint (J).
Neue Baugruppe: erstes Teil auswählen. Weitere mit Baugruppe → Einfügen, verbinden mit Gelenk (J). ⇒ New assembly: choose the first part. More via Assembly → Insert, connect with Joint (J).
Neue Geometrie als Konstruktion (X) ⇒ New geometry as construction (X)
Neue Komponente ⇒ New Component
Neue Körper und Skizzen gehören zu dieser Komponente ⇒ New bodies and sketches belong to this component
Neue Last in „{0}“ ⇒ New load in “{0}”
Neue Studie (setzt die Einrichtung zurück, Ergebnisse bleiben) ⇒ New study (resets the setup, results stay)
Neuer Körper ⇒ New body
Neues Blatt ⇒ New sheet
Neues Blatt. Mit „Basisansicht“ Ansichten einfügen. ⇒ New sheet. Insert views with “Base View”.
Neues Teil anfangen? Ungespeicherte Änderungen gehen verloren. ⇒ Start a new part? Unsaved changes will be lost.
Neutrale Ebene ⇒ Neutral plane
Neutrale Ebene anklicken: Ursprungsebene, Arbeitsebene oder ebene Fläche. Ihre Normale ist die Zugrichtung. ⇒ Click the neutral plane: origin plane, construction plane or planar face. Its normal is the pull direction.
Neutrale Ebene fehlt ⇒ Neutral plane missing
Neutrale Ebene: Ursprungsebene, Arbeitsebene oder ebene Fläche anklicken. ⇒ Neutral plane: click an origin plane, construction plane or planar face.
nicht angegeben (mm) ⇒ not specified (mm)
nicht gebaut (nach der Zeitleisten-Markierung oder unterdrückt) ⇒ not built (after the timeline marker or suppressed)
Nicht übernommen: ⇒ Not applied:
nicht untergebracht: {0} ⇒ not placed: {0}
Nichts exportiert ⇒ Nothing exported
Nichts exportiert: ⇒ Nothing exported:
Nichts gefunden ⇒ Nothing found
Nichts gefunden, das entfernt werden kann ⇒ Nothing found that can be removed
Nichts gewählt. ⇒ Nothing selected.
Nimmt auf … ⇒ Recording …
noch {0} Freiheitsgrad{1} ⇒ {0} degree{1:s} of freedom left
noch {0} Freiheitsgrad{1} (z. B. Splines, Ellipsen). ⇒ {0} degree{1:s} of freedom left (e.g. splines, ellipses).
noch kein Bau ⇒ no build yet
noch kein geschlossenes Profil ⇒ no closed profile yet
Noch kein Körper ⇒ No body yet
Noch keine ⇒ None yet
Noch keine Änderung eingetragen. ⇒ No revision entered yet.
Noch keine Ergebnisse – in der Einrichtung „Erzeugen“. ⇒ No results yet – “Generate” in the setup.
Noch keine Features zum Vervielfältigen. ⇒ No features to pattern yet.
Noch keine Komponenten ⇒ No components yet
Noch keine Körper ⇒ No bodies yet
Noch keine Teile. Blechteile werden automatisch abgewickelt; DXF-Dateien gehen direkt. ⇒ No parts yet. Sheet metal parts are unfolded automatically; DXF files go directly.
Noch keiner ⇒ None yet
Noch mindestens einen weiteren Punkt anklicken. ⇒ Click at least one more point.
Norm ⇒ Standard
Normteil ⇒ Fastener
Normteil einfügen (Schraube, Mutter, Scheibe) ⇒ Insert fastener (bolt, nut, washer)
Normteil einfügen: Bohrungsrand (Kreiskante) anklicken – Größe passt sich der Bohrung an, Kopf bzw. Auflage sitzt auf der Fläche. Ohne Klick frei am Punkt X/Y/Z. ⇒ Insert fastener: click a hole edge (circular edge) – the size adapts to the hole, the head or seat sits on the face. Without a click, freely at point X/Y/Z.
Normteil oder Größe unbekannt ⇒ Fastener or size unknown
Normteil unbekannt ⇒ Fastener unknown
Nur ausgewählte ⇒ Selected only
Nur ausgewählte Biegungen werden flachgelegt: runde Biegeflächen im Modell anklicken (nochmal klicken nimmt sie wieder aus). Die anderen Biegungen bleiben stehen. Abwicklung und „Zurückfalten“ bleiben vollständig. ⇒ Only selected bends are flattened: click round bend faces in the model (clicking again takes them out). The other bends stay standing. Flat pattern and “Refold” stay complete.
Nur ausrichten ⇒ Align only
Nur Buchstaben, Ziffern und _ (nicht mit Ziffer beginnen, keine Funktionsnamen) ⇒ Only letters, digits and _ (not starting with a digit, no function names)
Nur ebene Flächen lassen sich als DXF speichern ⇒ Only planar faces can be saved as DXF
Nur Ecken: gerade Kanten in Dickenrichtung (Länge {0} mm = Blechdicke). ⇒ Corners only: straight edges in thickness direction (length {0} mm = sheet thickness).
Nur ein Körper. ⇒ Only one body.
Nur freie Enden lassen sich verlängern. ⇒ Only free ends can be extended.
nur gerade Kanten ⇒ straight edges only
Nur gerade Kanten ⇒ Straight edges only
Nur gewählte Flächen ⇒ Only selected faces
Nur Grundrechnung ⇒ Basic calculation only
Nur in einer Baugruppe (Zusammenfügen → Zu Baugruppe hinzufügen) ⇒ Only in an assembly (Assemble → Add to Assembly)
Nur Kanten in Dickenrichtung (Länge = Blechdicke) sind möglich ⇒ Only edges in thickness direction (length = sheet thickness) are possible
Nur Kehlen (innen) ⇒ Only fillets (inside)
Nur Rundungen (außen) ⇒ Only rounds (outside)
Ø {0} · klicken ⇒ Ø {0} · click
Oberfläche ⇒ Surface
Oberflächenzeichen ⇒ Surface texture symbol
Oberflächenzeichen: Fläche anklicken, dann Lage ⇒ Surface texture symbol: click a face, then the position
Oberseite (+Z) ⇒ Top (+Z)
Oberste Ebene aktivieren ⇒ Activate top level
Objekte ⇒ Objects
Oder eine ebene Fläche bzw. Arbeitsebene anklicken – mit Versatz-Arbeitsebenen lässt sich die Teilung genau setzen. {0} ⇒ Or click a planar face or construction plane – with offset construction planes the split can be placed exactly. {0}
Oder eine ebene Körperfläche bzw. Arbeitsebene anklicken. ⇒ Or click a planar body face or construction plane.
Offen ⇒ Open
Offen mit Freischnitt ⇒ Open with relief
Offene Flächen ⇒ Open faces
Offener Linienzug = eine Blechseite. Biegungen entstehen an jedem Knick: Dicke {0} mm, Radius innen {1} mm, K {2} (Blechregel). ⇒ Open polyline = one sheet side. Bends are created at every kink: thickness {0} mm, inner radius {1} mm, K {2} (sheet metal rule).
Öffnen ⇒ Open
Öffnen (Strg+O) ⇒ Open (Ctrl+O)
Öffnen nicht möglich: ⇒ Opening not possible:
Ohne ⇒ None
ohne bündigen Stoß ⇒ without flush joint
ohne dauerhafte Erlaubnis ⇒ without persistent permission
ohne Innenecke ⇒ without inside corner
ohne Material ⇒ without material
ohne Materialabtrag ⇒ without material removal
Ohne Platzhalter: Name enthält den Text. Mit * (beliebig viele Zeichen) und ? (ein Zeichen) muss der ganze Name passen. Auch der Name der Komponente zählt. ⇒ Without wildcards: the name contains the text. With * (any number of characters) and ? (one character) the whole name must match. The name of the component counts too.
ohne Schlüssel ⇒ without key
Ohne Zwischenpunkte ändert sich der Radius linear entlang jeder gewählten Kante, mit Zwischenpunkten (Lage in % der Kante) glatt durch alle Punkte. Passt die Richtung nicht, „Umgekehrt“ wählen. ⇒ Without intermediate points the radius changes linearly along each selected edge, with intermediate points (position in % of the edge) smoothly through all points. If the direction is wrong, choose “Reversed”.
Orbit (Umschalt + mittlere Maustaste) ⇒ Orbit (Shift + middle mouse button)
Orthografisch ⇒ Orthographic
Parabel ⇒ Parabola
Parallelität ⇒ Parallelism
Parameter ändern ⇒ Change Parameters
Parameter gespeichert. ⇒ Parameters saved.
Parameter löschen ⇒ Delete parameter
Parameter übernehmen ({1}) ⇒ Apply parameters ({1})
Parameter übernommen, {0} Wert{1} aktualisiert. ⇒ Parameters applied, {0} value{1:s} updated.
Parametrisches CAD – lokal und offline ⇒ Parametric CAD – local and offline
Passung ⇒ Fit
Perspektivisch ⇒ Perspective
Pfad ⇒ Path
Pfad-Skizze wählen ⇒ Select path sketch
Physisch ⇒ Physical
Plan geschliffen ⇒ Ground flat
Planar: Gleiten in der Ebene von Ursprung 2 (X/Y) und Drehen um ihre Normale. ⇒ Planar: sliding in the plane of origin 2 (X/Y) and rotating about its normal.
Platzhalter in der Vorlage: {3} und {Bezeichnung} jedes freien Felds. ⇒ Placeholders in the template: {3} and {Label} of each free field.
Polygon (regelmäßiges Vieleck) ⇒ Polygon (regular polygon)
Pos;Profil;Länge mm;Schnitt Ende 1;Schnitt Ende 2;Stück;Körper ⇒ Pos;Profile;Length mm;Cut end 1;Cut end 2;Qty;Body
Pos.;Menge;Benennung;Werkstoff;Abmessung mm;Masse je Stück g;Masse gesamt g ⇒ Pos.;Qty;Name;Material;Dimensions mm;Mass per piece g;Total mass g
Pos1 ⇒ Home
Positiver Winkel: Das Teil wird in Zugrichtung schlanker und lässt sich aus der Form ziehen. ⇒ Positive angle: the part gets slimmer in the pull direction and can be pulled out of the mold.
Präfix ⇒ Prefix
Prägen ⇒ Emboss
Prägetiefe größer als der Zylinderradius ⇒ Emboss depth larger than the cylinder radius
Prägetiefe muss größer als 0 sein ⇒ Emboss depth must be greater than 0
Prisma ⇒ Prism
Profil ⇒ Profile
Profil {0} ⇒ Profile {0}
Profil 1 ⇒ Profile 1
Profil 2 ⇒ Profile 2
Profil an der Schiene ⇒ Profile at the rail
Profil entfernen ⇒ Remove profile
Profil und Pfad müssen in verschiedenen Skizzen liegen ⇒ Profile and path must lie in different sketches
Profil zu einfach ⇒ Profile too simple
Profile ⇒ Profiles
Profile (der Reihe nach) ⇒ Profiles (in order)
Profile passen nicht zueinander (Naht nicht gefunden) ⇒ Profiles do not fit together (seam not found)
Profile sind ⇒ Profiles are
Profilebene ⇒ Profile plane
Profilmaß {0} fehlt ⇒ Profile dimension {0} missing
Projekte ⇒ Projects
Projekte/{0} gibt es schon. Überschreiben? ⇒ Projekte/{0} already exists. Overwrite?
Projektion ⇒ Projection
Projektordner nicht erreichbar. ⇒ Project folder not reachable.
Projizieren ⇒ Project
Projizieren: Körperkante anklicken übernimmt sie, eine Fläche anklicken übernimmt ihren ganzen Rand. Projizierte Geometrie ist violett und folgt dem Modell. ⇒ Project: clicking a body edge takes it over, clicking a face takes over its whole boundary. Projected geometry is purple and follows the model.
Projizierte Bezüge lassen sich nicht fasen. ⇒ Projected references cannot be chamfered.
Projizierte Bezüge lassen sich nicht stutzen. ⇒ Projected references cannot be trimmed.
Projizierte Bezüge lassen sich nicht unterbrechen. ⇒ Projected references cannot be broken.
Projizierte Bezüge lassen sich nicht verrunden. ⇒ Projected references cannot be filleted.
Projizierte Bezüge lassen sich nicht versetzen. ⇒ Projected references cannot be offset.
Projizierte Geometrie ⇒ Projected geometry
Projizierte Kanten lassen sich nicht stutzen. Zum Entfernen auswählen und Entf drücken. ⇒ Projected edges cannot be trimmed. To remove, select them and press Del.
Projizierte Kanten lassen sich nicht unterbrechen. ⇒ Projected edges cannot be broken.
Projizierte Kanten lassen sich nicht versetzen. Mit X zum Profil machen oder nachzeichnen. ⇒ Projected edges cannot be offset. Make them part of the profile with X or trace them.
Prüfe alle sichtbaren Körper … ⇒ Checking all visible bodies …
Prüfen ⇒ Inspect
Prüfung nicht möglich: {0} ⇒ Check not possible: {0}
Punkt ⇒ Point
Punkt (X, Y, Z) ⇒ Point (X, Y, Z)
Punkt am Körper anklicken: Kante (es zählt der nähere Eckpunkt), Kreis (seine Mitte) oder Arbeitspunkt, danach den Zielpunkt. Esc bricht ab. ⇒ Click a point on the body: edge (the nearer corner point counts), circle (its center) or construction point, then the target point. Esc cancels.
Punkt anklicken ⇒ Click a point
Punkt auf Kurve ⇒ Point on curve
Punkt auf Position ⇒ Point to position
Punkt auf Position: erst einen Punkt im Modell wählen ⇒ Point to position: first select a point in the model
Punkt entfernen ⇒ Remove point
Punkt gesetzt ⇒ Point set
Punkt wählen ⇒ Select point
Punkt zu Punkt ⇒ Point to point
Punkt zu Punkt: erst zwei Punkte im Modell wählen ⇒ Point to point: first select two points in the model
Punkt-ID {0} ⇒ Point ID {0}
Punkt: klicken. Liegt er auf einer Kurve oder Körperkante, bleibt er daran gebunden. ⇒ Point: click. If it lies on a curve or body edge, it stays bound to it.
Punkte ⇒ Points
Punkte der Skizze – Rolle zuweisen ⇒ Points of the sketch – assign a role
Punkte liegen auf einer Linie ⇒ Points lie on a line
Punkte oder Kurven wählen, die fixiert werden sollen. ⇒ Select points or curves to be fixed.
Punkte über die Kanten oder Arbeitspunkte anklicken (bei Kanten zählt der nähere Endpunkt). ⇒ Click points via the edges or construction points (for edges the nearer end point counts).
Quader ⇒ Box
Quader {0} mm ⇒ Box {0} mm
Quadrat ⇒ Square
quadratisch oder rund: Eckfreischnitt an Laschenecken und an gebogenen Ecken der Abwicklung eines umgewandelten Körpers. „ohne“ betrifft nur den umgewandelten Körper – ohne Freischnitt steht die Ecke, die Abwicklung bekommt dort eine ausgefranste Kontur (Laschen ohne Freischnitt: „Reißecke“ am Feature). Breite: ⌀-Feld, sonst 2 × Dicke bei Laschen und Dicke beim umgewandelten Körper. ⇒ square or round: corner relief at flange corners and at bent corners of the flat pattern of a converted body. “none” only affects the converted body – without relief the corner stays, the flat pattern gets a ragged contour there (flanges without relief: “tear corner” on the feature). Width: ⌀ field, otherwise 2 × thickness for flanges and thickness for the converted body.
quer zur Ebene (Schätzung) ⇒ across the plane (estimate)
Querschnitt ⇒ Cross-section
Querschnittanalyse ⇒ Section Analysis
Querschnittsanalyse ⇒ Section Analysis
Querschnittsgröße ⇒ Cross-section size
R {0} · {1}° · Breite {2} ⇒ R {0} · {1}° · width {2}
R {0} · Anfang des Bogens ⇒ R {0} · start of the arc
Radius Anfang ⇒ Start radius
Radius ausreichend ⇒ Radius sufficient
Radius des gerollten Saums muss größer als 0 sein ⇒ Radius of the rolled hem must be greater than 0
Radius Ende ⇒ End radius
Radius innen ⇒ Inner radius
Radius kleiner ⇒ Radius smaller
Radiusart ⇒ Radius type
Rahmen ⇒ Frame
Rahmen nicht möglich – Profil zu groß für die Linienlängen oder Linien überlappen? ⇒ Frame not possible – profile too large for the line lengths or lines overlap?
Randabstand ⇒ Edge distance
Ränder ⇒ Edges
Raster ein/aus ⇒ Grid on/off
Rasterweite ⇒ Grid spacing
Rasterweite (0 = automatisch) ⇒ Grid spacing (0 = automatic)
Rechne die Stützstruktur … ⇒ Computing the support structure …
rechnet ⇒ computing
rechnet … ⇒ computing …
Rechnung mit 90 % Material nicht lösbar ⇒ Calculation with 90 % material not solvable
Rechteck ⇒ Rectangle
Rechteck mit 2 Punkten ⇒ 2-Point Rectangle
Rechteck mit 3 Punkten ⇒ 3-Point Rectangle
Rechteck mit 3 Punkten: Anfang und Ende der ersten Kante klicken (beliebig schräg), dann die Breite. ⇒ 3-point rectangle: click the start and end of the first edge (at any angle), then the width.
Rechteck mit Mittelpunkt ⇒ Center Rectangle
Rechteck ohne Breite oder Höhe. ⇒ Rectangle without width or height.
Rechteck: erste Ecke klicken, dann die gegenüberliegende. ⇒ Rectangle: click the first corner, then the opposite one.
Rechteckig ⇒ Rectangular
Rechteckige Anordnung ⇒ Rectangular arrangement
Rechteckplatte ⇒ Rectangular plate
Rechteckrohr ⇒ Rectangular tube
Rechts ⇒ Right
Rechts (+X) ⇒ Right (+X)
Rechtsklick: Blatt löschen ⇒ Right-click: delete sheet
Rechtwinkligkeit ⇒ Perpendicularity
Regel „{0}“ aus der Bibliothek löschen? Dokumente, die sie verwenden, behalten ihre Werte. ⇒ Delete rule “{0}” from the library? Documents using it keep their values.
Reißecke (ohne Freischnitt) ⇒ Tear corner (without relief)
Rendern ⇒ Render
Revisionstabelle ⇒ Revision Table
Revisionstabelle: Änderung eintragen (Buchstabe, Beschreibung, Datum, Name) ⇒ Revision table: enter a revision (letter, description, date, name)
Richtlinien ⇒ Guidelines
Richtung ⇒ Direction
Richtung {0} · durch {1} ⇒ Direction {0} · through {1}
Richtung 2 ⇒ Direction 2
Ringsum ⇒ All around
Rippe ⇒ Rib
Rippe nicht möglich – Linie liegt nicht in einer offenen Ecke des Körpers? ⇒ Rib not possible – the line does not lie in an open corner of the body?
Rohr ⇒ Pipe
Rollwinkel ⇒ Roll angle
Rot ab Radius ⇒ Red from radius
Rot: Flächen zeigen gegen die Zugrichtung und halten das Teil in der Form fest. ⇒ Red: faces point against the pull direction and hold the part in the mold.
Rot: Flächen, die flacher als {7}° zur Senkrechten nach unten zeigen und Stützen brauchen. Orange: knapp an der Grenze. Fasen statt Rundungen an Unterkanten helfen. ⇒ Red: faces pointing downward flatter than {7}° from vertical that need supports. Orange: close to the limit. Chamfers instead of fillets on lower edges help.
Rückansicht ⇒ Back view
Rückgängig ⇒ Undo
Rückgängig (Strg+Z) ⇒ Undo (Ctrl+Z)
Rücksprung 2. Schenkel ⇒ Setback of 2nd leg
Rücksprung zwischen 0 und Saumlänge wählen ⇒ Choose a setback between 0 and the hem length
Rund ⇒ Round
Runde Kante im Modell anklicken – die Bohrung sitzt genau in ihrer Mitte, zum Beispiel in einer verrundeten Ecke. ⇒ Click a round edge in the model – the hole sits exactly at its center, for example in a filleted corner.
Rundheit ⇒ Roundness
Rundrohr ⇒ Round tube
Rundstahl ⇒ Round bar
Rundung ⇒ Round
Rundung mit Zwischenpunkten nicht möglich ⇒ Fillet with intermediate points not possible
Rundung R {0} nicht zwischen zwei ebenen Flächen ⇒ Round R {0} not between two planar faces
Rundung zwischen parallelen Flächen ⇒ Round between parallel faces
Rundungen (Teilzylinder) ⇒ Rounds (partial cylinders)
s Element ⇒ s entity
s Profil ⇒ s profile
Sans fett ⇒ Sans bold
Saum (180°) ⇒ Hem (180°)
Saumart ⇒ Hem type
Saumlänge ⇒ Hem length
Saumlänge muss größer als 0 sein ⇒ Hem length must be greater than 0
Schale ⇒ Shell
Schale nicht möglich – Wand zu dick oder Form zu komplex? ⇒ Shell not possible – wall too thick or shape too complex?
Schale nicht möglich (Wand zu dick?) ⇒ Shell not possible (wall too thick?)
Scharf ⇒ Sharp
Scharf (Projektion) ⇒ Sharp (projection)
Schattiert ⇒ Shaded
Schattiert mit sichtbaren Kanten ⇒ Shaded with visible edges
Scheibe ⇒ Washer
Scheitelpunkt · ρ {0} ({1}) ⇒ Vertex · ρ {0} ({1})
Schenkel {0} mm · Biegezugabe {1} mm · Abwicklung {2} mm (t {3}, R {4}, K {5}){6} ⇒ Leg {0} mm · bend allowance {1} mm · flat length {2} mm (t {3}, R {4}, K {5}){6}
Schenkeldicke zu groß ⇒ Leg thickness too large
Schenkellänge ⇒ Leg length
Schieber ⇒ Slider
Schiene {0} ⇒ Rail {0}
Schließen ⇒ Close
Schneidrichtung ⇒ Cutting direction
Schneidrichtung {22}, Rasterweite {23} ⇒ Cutting direction {22}, grid spacing {23}
Schnitt ⇒ Section
Schnitt {0}–{1} ⇒ Section {0}–{1}
Schnitt A–A ⇒ Section A–A
Schnitt bei X ⇒ Section at X
Schnitt entfernen ⇒ Remove section
Schnitt fehlgeschlagen ⇒ Cut failed
Schnitt nicht möglich: ⇒ Cut not possible:
Schnitt über eine scharfe Kante (Radius 0) – nur angenähert übertragen. Für genaue Schnitte über Biegungen einen Biegeradius verwenden. ⇒ Cut across a sharp edge (radius 0) – only approximately transferred. For exact cuts across bends use a bend radius.
Schnitt zweier Ebenen ⇒ Intersection of two planes
Schnittansicht A–A ⇒ Section view A–A
Schnittansicht mit freier Schnittlinie: zwei Punkte in einer Ansicht, dann die Lage der Ansicht ⇒ Section view with free section line: two points in a view, then the position of the view
Schnittansicht nicht möglich: ⇒ Section view not possible:
Schnittansicht: Anfang und Ende der Schnittlinie in einer Ansicht anklicken, dann die Lage der Schnittansicht (auf der Seite, in die geblickt wird). Abgesetzte Schnittlinie: mit Umschalt+Klick weitere Abschnitte setzen. ⇒ Section view: click the start and end of the section line in a view, then the position of the section view (on the side being looked at). Offset section line: set further segments with Shift+click.
Schnittebene ⇒ Section plane
Schnittkurve ⇒ Intersection curve
Schnittkurve nicht möglich: ⇒ Intersection curve not possible:
Schnittkurve: {0} Kante{1} übernommen. ⇒ Intersection curve: {0} edge{1:s} taken over.
Schnittmenge ⇒ Intersect
Schon die Beibehalten-Geometrie allein trägt die Last – die Augen bestimmen die Masse ⇒ The Preserve Geometry alone already carries the load – the bosses determine the mass
Schräge ausreichend ⇒ Draft sufficient
Schrift ⇒ Font
Schrift konnte nicht geladen werden: ⇒ Font could not be loaded:
Schrift nicht erreichbar ⇒ Font not reachable
Schriftfeld ⇒ Title block
Schriftfeld-Vorlage „{0}“: {1} × {2} mm. ⇒ Title block template “{0}”: {1} × {2} mm.
Schrifthöhe ⇒ Text height
Schritte höchstens ⇒ Steps at most
Schweißgut ca. ⇒ Weld metal approx.
Schweißnaht ⇒ Weld
Schweißnähte ⇒ Welds
Schweißsymbole in den Normansichten (statt an der Iso-Ansicht) ⇒ Weld symbols in the standard views (instead of the iso view)
Schwerpunkt ⇒ Center of gravity
Schwerpunkt {2} ⇒ Center of gravity {2}
Sechskantmutter ⇒ Hex nut
Sechskantschraube ⇒ Hex bolt
Sehne {0} ⇒ Chord {0}
Sehnenlänge ⇒ Chord length
Sehnentoleranz ⇒ Chord tolerance
Sehnentoleranz muss größer als 0 sein ⇒ Chord tolerance must be greater than 0
Seite ⇒ Side
Seite 1 ⇒ Side 1
Seite 2 ⇒ Side 2
Seite A ⇒ Side A
Seite B ⇒ Side B
Seite wechseln ⇒ Switch side
Seitenansicht von links ⇒ Left side view
Seitenansicht von rechts ⇒ Right side view
Seitenflächen im Modell anklicken, die geneigt werden sollen. ⇒ Click the side faces in the model to be tilted.
Seitenlänge ⇒ Side length
Seitlich ⇒ Sideways
Senkdurchmesser muss größer als die Bohrung sein ⇒ Countersink diameter must be larger than the hole
Senkkopf 90° ⇒ Countersunk head 90°
Senkrecht ⇒ Perpendicular
Senkschraube mit Innensechskant ⇒ Countersunk socket screw
Senktiefe ⇒ Countersink depth
Senktiefe passt nicht zur Bohrtiefe ⇒ Countersink depth does not fit the hole depth
Senkwinkel ⇒ Countersink angle
Sicherheitsfaktor ⇒ Safety Factor
Sicherheitsfaktor {0} auch mit 90 % Material nicht erreicht – Startform vergrößern oder Last prüfen ⇒ Safety factor {0} not reached even with 90 % material – enlarge the starting shape or check the load
Sicherheitsfaktor ≥ {0} ⇒ Safety factor ≥ {0}
Skalieren ⇒ Scale
Skalieren: vorher Elemente wählen, dann den Basispunkt klicken und den Faktor eintippen (z. B. 2 oder 1/2). Kreise, Texte und Maße der Auswahl wachsen mit. Strg = Kopie. ⇒ Scale: select entities first, then click the base point and type the factor (e.g. 2 or 1/2). Circles, texts and dimensions of the selection grow along. Ctrl = copy.
Skaliert mit Faktor {0}. ⇒ Scaled by factor {0}.
Skizze ⇒ Sketch
Skizze „{0}“ hat kein geschlossenes Profil ⇒ Sketch “{0}” has no closed profile
Skizze auf {1} ⇒ Sketch on {1}
Skizze der Grundlasche fehlt ⇒ Sketch of the base flange missing
Skizze erstellen ⇒ Create Sketch
Skizze fertig ⇒ Finish Sketch
Skizze fertig stellen ⇒ Finish sketch
Skizze für die Teilung wählen ⇒ Select a sketch for the split
Skizze ist leer ⇒ Sketch is empty
Skizze mit den Punkten wählen ⇒ Select the sketch with the points
Skizze nicht gefunden. ⇒ Sketch not found.
Skizze oder Fläche ⇒ Sketch or face
Skizze skalieren ⇒ Sketch Scale
Skizze vollständig bestimmt. ⇒ Sketch fully constrained.
Skizzen ⇒ Sketches
Skizzen übernehmen ⇒ Apply sketches
Skizzen-Solver nicht geladen ⇒ Sketch solver not loaded
Skizzen-X ⇒ Sketch X
Skizzen-Y ⇒ Sketch Y
Skizzen, Körper, Blech ⇒ Sketches, bodies, sheet metal
Skizzen, Muster und Drehungen können die Achsen und den Ursprung des Systems anklicken - sie wandern mit, wenn sich die Basis ändert. ⇒ Sketches, patterns and revolves can click the axes and the origin of the system - they move along when the base changes.
Skizzenbemaßung ⇒ Sketch Dimension
Skizzenflächen ⇒ Sketch regions
Skizzenpalette ⇒ Sketch Palette
Skizzenwerkzeuge ⇒ Sketch tools
So weit geht es nicht: der Radius ({0} mm) würde 0 oder negativ ⇒ It does not go that far: the radius ({0} mm) would become 0 or negative
Solver lädt … ⇒ Solver loading …
Sortieren nach ⇒ Sort by
Spalt ⇒ Gap
Spalt (je Lage) ⇒ Gap (per layer)
Spalt (offener Saum) ⇒ Gap (open hem)
Spalt b ⇒ Gap b
Spalt muss größer als 0 sein. ⇒ Gap must be greater than 0.
Spalt zu groß – höchstens {0} mm (2 × Radius) ⇒ Gap too large – at most {0} mm (2 × radius)
Spalt zu klein – mindestens {0} mm (Radius − Länge) ⇒ Gap too small – at least {0} mm (radius − length)
Spalte entfernen ⇒ Remove column
Spalte hinzufügen ⇒ Add column
spanend (Material abtragen) ⇒ subtractive (remove material)
Speichern ⇒ Save
Speichern (Strg+S) ⇒ Save (Ctrl+S)
Speichern im Projektordner nicht möglich. ⇒ Saving in the project folder not possible.
Speichern nicht möglich (Browser-Speicher gesperrt). ⇒ Saving not possible (browser storage blocked).
Speichern nicht möglich: ⇒ Saving not possible:
Speichern unter ⇒ Save As
Speichern unter (Strg+Umschalt+S) ⇒ Save As (Ctrl+Shift+S)
Spiegelachse anklicken ⇒ Click the mirror line
Spiegelachse anklicken ({0} Element{1}) ⇒ Click the mirror line ({0} entit{1:ies|y})
Spiegelebene fehlt ⇒ Mirror plane missing
Spiegelebene wählen: Ursprungsebene, ebene Körperfläche oder Arbeitsebene anklicken. ⇒ Select the mirror plane: click an origin plane, planar body face or construction plane.
Spiegeln ⇒ Mirror
Spiegeln: erst die Spiegelachse anklicken, dann die Elemente. Vorher gewählte Elemente werden sofort gespiegelt. ⇒ Mirror: first click the mirror line, then the entities. Previously selected entities are mirrored immediately.
Spiegelung ⇒ Mirror
Spiel ⇒ Clearance
Spirale ⇒ Coil
Spirale / Feder: Basisebene wählen (XY, XZ, YZ, Fläche oder Arbeitsebene), Durchmesser, Windungen und Querschnitt einstellen. ⇒ Coil / spring: choose the base plane (XY, XZ, YZ, face or construction plane), set diameter, turns and cross-section.
Spirale nicht möglich – Querschnitt zu groß für Durchmesser oder Steigung? ⇒ Coil not possible – cross-section too large for diameter or pitch?
Spitze ⇒ Tip
Spitzenwinkel ⇒ Tip angle
Spline (Steuerpunkte) ⇒ Control Point Spline
Spline mit Steuerpunkten: Punkte nacheinander klicken – die Kurve läuft nur durch Anfang und Ende ⇒ Control point spline: click points one after another – the curve passes only through start and end
Spline und Ellipse tangential geht noch nicht. ⇒ Tangent with spline and ellipse is not supported yet.
Spline: Punkte nacheinander klicken ⇒ Spline: click points one after another
Spline: Punkte nacheinander klicken, die Kurve läuft glatt durch alle. Doppelklick oder Enter beendet, Klick auf den ersten Punkt schließt sie. Punkte lassen sich ziehen und bemaßen. ⇒ Spline: click points one after another, the curve passes smoothly through all of them. Double-click or Enter ends, clicking the first point closes it. Points can be dragged and dimensioned.
Stab ⇒ Member
Stahl ⇒ Steel
Stahl {0} mm ⇒ Steel {0} mm
Stahlbau ⇒ Steel Construction
Standard wiederherstellen ⇒ Restore defaults
stark gekrümmt ⇒ strongly curved
Stark überdimensioniert (Sicherheitsfaktor {0}) – „Masse minimieren“ legt das Teil auf die Last aus ⇒ Heavily oversized (safety factor {0}) – “Minimize mass” designs the part for the load
stärkste Krümmung ⇒ strongest curvature
Starr ⇒ Rigid
Starre Gruppe ⇒ Rigid Group
Starre Gruppe (Komponenten bewegen sich gemeinsam) ⇒ Rigid Group (components move together)
Startansicht ⇒ Home view
startet … ⇒ starting …
Startfenster beim Programmstart anzeigen ⇒ Show the start window at program start
Startfläche ⇒ Start face
Startfläche wählen ⇒ Select start face
Startform ⇒ Starting Shape
Startform: Körper, dessen Umriss den Designbereich begrenzt (z. B. die bisherige Platte) – gelb ⇒ Starting Shape: body whose outline bounds the design space (e.g. the previous plate) – yellow
Startpunkt (Lage des Originals) ⇒ Start point (position of the original)
Startwinkel ⇒ Start angle
Steg ⇒ Web
Steg c ⇒ Web c
Steg oder Flansch zu dick ⇒ Web or flange too thick
Steifigkeit maximieren ⇒ Maximize stiffness
Steifstes Teil mit dieser Masse (je Material; leichte Werkstoffe bekommen so mehr Volumen). Die Form richtet sich hier nur nach der Richtung der Lasten – ihr Betrag ändert nur den Sicherheitsfaktor. Zum Auslegen auf die Last „Masse minimieren“ wählen. ⇒ Stiffest part with this mass (per material; light materials thus get more volume). The shape depends only on the direction of the loads here – their magnitude only changes the safety factor. To design for the load, choose “Minimize mass”.
Steigung ⇒ Pitch
Steigung bzw. Höhe muss größer als 0 sein ⇒ Pitch or height must be greater than 0
Stelle ⇒ Location
STEP (*.step;*.stp)|*.step;*.stp|Alle Dateien (*.*)|*.* ⇒ STEP (*.step;*.stp)|*.step;*.stp|All files (*.*)|*.*
STEP exportieren ⇒ Export STEP
STEP wird erzeugt … ⇒ Generating STEP …
STEP: echte Volumenkörper, damit lässt sich weiterarbeiten (Bohren, Ausschneiden, Gelenke). ⇒ STEP: real solid bodies, so you can keep working (drilling, cutting, joints).
Steuerpunkte ⇒ Control points
Stift-Nut ⇒ Pin slot
Stift-Nut: Drehen um die Achse und Gleiten quer dazu (Richtung X des Ursprungs 2). ⇒ Pin-slot: rotation about the axis and sliding across it (X direction of origin 2).
Stirnfläche am Stabende anklicken (z. B. unten am Tischbein). ⇒ Click the end face at the member end (e.g. at the bottom of the table leg).
Stirnflächen der Stäbe wählen ⇒ Select the end faces of the members
Stk ⇒ Qty
STL exportieren ⇒ Export STL
STL ist ein Dreiecksnetz: anzeigen, messen, als Körper verwenden – Verrunden/Bohren daran geht nicht zuverlässig. ⇒ STL is a triangle mesh: display, measure, use as a body – fillets/holes on it do not work reliably.
STL wird erzeugt … ⇒ Generating STL …
Stopp ⇒ Stop
Stopp – Ergebnis übernehmen ⇒ Stop – take over result
Stück ⇒ Piece
Stück entfernen ⇒ Remove piece
Stückliste ⇒ Bill of Materials
Stückliste (Menge, Werkstoff, Masse, CSV) ⇒ Bill of Materials (quantity, material, mass, CSV)
Stückliste als CSV speichern (dieselben Spalten wie im Fenster Stückliste) ⇒ Save BOM as CSV (the same columns as in the BOM window)
Stückliste mit Positionsnummern ⇒ BOM with item numbers
Studie ⇒ Study
Studie {0} ⇒ Study {0}
Studie 1 ⇒ Study 1
Studienmaterialien ⇒ Study Materials
Studienmaterialien: je Material ein Ergebnis ⇒ Study materials: one result per material
Studio dunkel ⇒ Studio dark
Studio hell ⇒ Studio light
Stumpf ⇒ Butt
Stumpf: eine Wand läuft durch, die andere endet mit dem Spalt davor – passt zum Laserzuschnitt. ⇒ Butt: one wall runs through, the other ends with the gap in front of it – suits laser cutting.
Stutzen ⇒ Trim
Stutzen: das Kurvenstück anklicken, das weg soll (rot markiert). Ohne Schnittpunkte wird die ganze Kurve gelöscht. ⇒ Trim: click the curve segment to remove (marked red). Without intersections the whole curve is deleted.
Stützmaterial ⇒ Support material
Stützstruktur ⇒ Support structure
Stützstruktur: {0} ⇒ Support structure: {0}
Suche ⇒ Search
Suchen … ⇒ Search …
Summe ⇒ Sum
SVG einfügen ⇒ Insert SVG
SVG speichern ⇒ Save SVG
Sweeping ⇒ Sweep
Sweeping braucht zwei Skizzen: einen Pfad und ein Profil. ⇒ Sweep needs two sketches: a path and a profile.
Sweeping nicht möglich – Profil zu groß für die Pfadkrümmung oder nicht quer zum Pfad? ⇒ Sweep not possible – profile too large for the path curvature or not across the path?
Sweeping: Profil-Skizze und Pfad-Skizze wählen. Das Profil sollte am Pfadanfang quer zum Pfad liegen, z. B. auf einer Arbeitsebene. ⇒ Sweep: select the profile sketch and the path sketch. The profile should lie across the path at the path start, e.g. on a construction plane.
Symbole ⇒ Symbols
Symmetrie ⇒ Symmetry
Symmetrisch ⇒ Symmetric
Symmetrisch 2 ⇒ Symmetric 2
Symmetrische Anordnung braucht eine ungerade Anzahl – das Original sitzt in der Mitte ⇒ A symmetric arrangement needs an odd count – the original sits in the middle
Symmetrische Anordnung Richtung 2 braucht eine ungerade Anzahl ⇒ A symmetric arrangement in direction 2 needs an odd count
Tabellen ⇒ Tables
Tafel ⇒ Sheet
Tafel {0} · {1} × {2} · {3} % · {4} mm frei oben · {5} ⇒ Sheet {0} · {1} × {2} · {3} % · {4} mm free at top · {5}
Tafelgruppe ⇒ Sheet group
Tafeln als DXF ⇒ Sheets as DXF
Tafelrand in der DXF ⇒ Sheet border in the DXF
Tangential ⇒ Tangent
Tangential an Zylinder Ø{0} ⇒ Tangent to cylinder Ø{0}
Tangentialbogen ⇒ Tangent Arc
Tangentialbogen: am freien Ende einer Linie oder eines Bogens beginnen, dann den Endpunkt klicken. Es geht direkt mit dem nächsten Bogen weiter, Esc beendet. ⇒ Tangent arc: start at the free end of a line or arc, then click the end point. It continues directly with the next arc, Esc ends.
Tangentiale Kette ⇒ Tangent chain
Teil ⇒ Part
Teil einfügen ⇒ Insert part
Teil fehlt ⇒ Part missing
Teil oder Baugruppe öffnen, dann Dienstprogramme → Zeichnung. ⇒ Open a part or assembly, then Utilities → Drawing.
Teil öffnen und bearbeiten ⇒ Open and edit part
Teil1 ⇒ Part1
Teile ⇒ Parts
Teile aktualisieren ⇒ Update parts
Teile einfügen und mit Gelenken verbinden ⇒ Insert parts and connect them with joints
Teile werden übergeben … ⇒ Passing parts …
Teileabstand ⇒ Part spacing
Teilen nicht möglich. ⇒ Split not possible.
Teilstrecke ab ⇒ Partial length from
Teilstrecke bis ⇒ Partial length to
Teilstrecke des Pfads ⇒ Partial length of the path
Teilstrecke Seite 2 ⇒ Partial length side 2
Teilstrecke: ab dem Profil gezogen, am Ende senkrecht zum Pfad abgeschnitten. Sitzt das Profil mitten auf dem Pfad, wird in beide Richtungen gezogen: Seite 1 in Richtung der Profilnormale, Seite 2 dagegen. Verdrehwinkel: das Profil dreht sich gleichmäßig über die gezogene Länge – z. B. ein gedrehter Flachstab. Verjüngung: das Profil wächst (positiv) oder schrumpft (negativ) gleichmäßig, sein äußerster Punkt läuft unter dem Winkel – ein Kreis auf dem Pfad ergibt einen Kegel. ⇒ Partial length: swept from the profile, cut perpendicular to the path at the end. If the profile sits in the middle of the path, it is swept in both directions: side 1 in the direction of the profile normal, side 2 against it. Twist angle: the profile rotates evenly over the swept length – e.g. a twisted flat bar. Taper: the profile grows (positive) or shrinks (negative) evenly, its outermost point runs at the angle – a circle on the path gives a cone.
Teilungsebene fehlt ⇒ Splitting plane missing
Teilungswerkzeug ⇒ Splitting tool
Teilweise ⇒ Partial
Text / Hinweis: in einer Ansicht anklicken (mit Hinweislinie) oder auf freies Blatt ⇒ Text / note: click into a view (with leader) or on the free sheet
Text eingeben, Enter ⇒ Enter text, Enter
Text und Kurve wählen ⇒ Select text and curve
Text: Anfangspunkt klicken, Text tippen, Enter. Höhe und Schrift in der Palette. Doppelklick auf einen Text ändert ihn. Liegt der Text in einer Fläche, wird er beim Extrudieren ausgespart. ⇒ Text: click the start point, type the text, Enter. Height and font in the palette. Double-click a text to change it. If the text lies inside a region, it is left out when extruding.
Text: in eine Ansicht klicken (dann mit Hinweislinie, danach die Lage des Textes) oder auf eine freie Stelle des Blatts. ⇒ Text: click into a view (then with a leader, afterwards the position of the text) or on a free spot of the sheet.
Tiefe ⇒ Depth
Tiefe muss größer als 0 sein ⇒ Depth must be greater than 0
Toleranz ⇒ Tolerance
Toleranzklasse ⇒ Tolerance class
Toleranzklasse nach ISO 965 (Klasse): nur Kennzeichnung, die Form ändert sie nicht. ⇒ Tolerance class per ISO 965 (Class): marking only, it does not change the shape.
Toleranzrahmen ⇒ Feature control frame
Topologie ⇒ Topology
Topologieoptimierung ⇒ Topology optimization
Topologieoptimierung (Generatives Design) ⇒ Topology optimization (Generative Design)
Torus-⌀ (Mitte Rohr) ⇒ Torus ⌀ (tube center)
Trennebene ⇒ Parting plane
Tropfen ⇒ Teardrop
U-Profil (UPN) ⇒ U-channel (UPN)
Übergang ⇒ Transition
Übergangslasche ⇒ Loft Flange
Übergangslasche braucht zwei Skizzen mit je einem geschlossenen Profil (z. B. Rechteck unten, Kreis oben). ⇒ Loft flange needs two sketches with one closed profile each (e.g. rectangle below, circle above).
Übergangslasche ließ sich nicht als Körper schließen ⇒ Loft flange could not be closed as a body
Übergangslasche: zwei Profil-Skizzen auf verschiedenen Ebenen wählen (z. B. Rechteck → Kreis). Dicke und K-Faktor aus der Blechregel. ⇒ Loft flange: select two profile sketches on different planes (e.g. rectangle → circle). Thickness and K-factor from the sheet metal rule.
Überhang ⇒ Overhang
Überhang (3D-Druck) ⇒ Overhang (3D print)
Überhang-Analyse ⇒ Overhang Analysis
Überlappend ⇒ Overlapping
Übernehmen als ⇒ Take over as
Überschreiben ⇒ Overwrite
Übersetzen {0} ⇒ Translate {0}
Überstand ⇒ Overhang
Umfang ⇒ Circumference
Umgebung ⇒ Environment
Umgekehrt ⇒ Reversed
Umsortieren nicht möglich: ⇒ Reorder not possible:
Unbekannte Abhängigkeit ⇒ Unknown constraint
Unbekannte Form „{0}“. ⇒ Unknown shape “{0}”.
Unbekannte Funktion „{0}“ ⇒ Unknown function “{0}”
Unbekannter Auftrag: ⇒ Unknown job:
Unbekannter Feature-Typ „{0}“. Mit beispiele() die Typen ansehen. ⇒ Unknown feature type “{0}”. See the types with beispiele().
Unbekannter Parameter „{0}“ ⇒ Unknown parameter “{0}”
Unbekanntes Feature ⇒ Unknown feature
Unbekanntes Feature "{0}" in der Datei. ⇒ Unknown feature "{0}" in the file.
Unbekanntes Profil ⇒ Unknown profile
Unbekanntes STL-Format ⇒ Unknown STL format
Unbekanntes Werkzeug „{0}“. ⇒ Unknown tool “{0}”.
Unerwartetes Zeichen „{0}“ ⇒ Unexpected character “{0}”
Ungültige Werte: ⇒ Invalid values:
Ungültiger Name ⇒ Invalid name
Unter dem Namen in der Bibliothek speichern ⇒ Save under this name in the library
Unterbrechen ⇒ Break
Unterbrechen: Kurve anklicken – sie wird an den nächsten Schnittpunkten links und rechts davon geteilt, nichts wird entfernt. ⇒ Break: click a curve – it is split at the nearest intersections to its left and right, nothing is removed.
Unterdrücken ⇒ Suppress
unterdrückt ⇒ suppressed
Unterseite (−Z) ⇒ Bottom (−Z)
Untersicht ⇒ Bottom view
unverändert, ohne neue Berechnung ⇒ unchanged, without recalculation
Ursprung ⇒ Origin
Ursprung {0} · Achse {1} ⇒ Origin {0} · axis {1}
Ursprung {0}{1} ⇒ Origin {0}{1}
Ursprung 1 ⇒ Origin 1
Ursprung 2 ⇒ Origin 2
Ursprung 2 muss auf einem anderen Körper bzw. einer anderen Komponente liegen. ⇒ Origin 2 must lie on a different body or component.
Ursprungsachse ⇒ Origin axis
Ursprungsebene, Arbeitsebene (orange) oder ebene Fläche des Körpers anklicken. Esc bricht ab. ⇒ Click an origin plane, construction plane (orange) or planar face of the body. Esc cancels.
Ursprungsebene, Arbeitsebene oder ebene Fläche anklicken. ⇒ Click an origin plane, construction plane or planar face.
V-Naht s ⇒ V weld s
V-Naht: 60°-Fuge über die Tiefe s an beiden Teilen, wird aus den Teilen geschnitten und von der Naht gefüllt. ⇒ V weld: 60° groove over the depth s on both parts, cut out of the parts and filled by the weld.
Variabel ⇒ Variable
Variante ⇒ Variant
Verbinden ⇒ Connect
Verbindung zum Nester unterbrochen ⇒ Connection to the nester interrupted
Verdeckte Kanten ⇒ Hidden edges
Verdicken ⇒ Thicken
Verdicken (Flächen) ⇒ Thicken (faces)
Verdrehwinkel ⇒ Twist angle
Verdrehwinkel geht nur bei Ausrichtung senkrecht ⇒ Twist angle only works with perpendicular orientation
Verfahren ⇒ Process
Verjüngung ⇒ Taper
Verjüngung (beide Hälften) ⇒ Taper (both halves)
Verjüngung geht nur, wenn das Profil an einem Pfadende sitzt ⇒ Taper only works when the profile sits at a path end
Verjüngung nicht möglich (Winkel kleiner wählen) ⇒ Taper not possible (choose a smaller angle)
Verjüngung Seite 1 ⇒ Taper side 1
Verjüngung Seite 2 ⇒ Taper side 2
Verjüngung zu stark: das Profil schrumpft vor dem Pfadende auf null ⇒ Taper too strong: the profile shrinks to zero before the path end
Verjüngungs-Analyse ⇒ Draft Analysis
Verjüngungs-Analyse (Formschräge prüfen) ⇒ Draft Analysis (check draft)
Verjüngungswinkel ⇒ Taper angle
Verjüngungswinkel zu groß ⇒ Taper angle too large
Verknüpft mit ⇒ Linked to
Verknüpft: ⇒ Linked:
Verlängern ⇒ Extend
Verlängern: eine Linie oder einen Bogen nahe am freien Ende anklicken. Er läuft bis zur nächsten Kurve, Körperkante oder Achse. ⇒ Extend: click a line or arc near its free end. It runs to the next curve, body edge or axis.
Verrunden ⇒ Fillet
Verrunden geht an einer Ecke, an der genau zwei Linien zusammenkommen. ⇒ Filleting works at a corner where exactly two lines meet.
Verrunden: Ecke zweier Linien anklicken, dann den Radius eintippen. Maße zur Ecke bleiben erhalten. ⇒ Fillet: click the corner of two lines, then type the radius. Dimensions to the corner are kept.
Verrundung ⇒ Fillet
Verrundung nicht möglich – Radius zu groß für eine der Kanten? ⇒ Fillet not possible – radius too large for one of the edges?
Verrundung nicht möglich (Radius zu groß?) ⇒ Fillet not possible (radius too large?)
Versatz ⇒ Offset
Versatz {0} · klicken ⇒ Offset {0} · click
Versatz {0} mm angelegt. ⇒ Offset {0} mm created.
Versatz ab Profilebene ⇒ Offset from profile plane
Versatz ab Startfläche ⇒ Offset from start face
Versatz Anfang ⇒ Start offset
Versatz Ende ⇒ End offset
Versatz nicht möglich. ⇒ Offset not possible.
Versatz positiv: der Schnitt endet so weit vor dem Punkt, negativ: er geht darüber hinaus. 0 = durch den Punkt bis an die Kante. ⇒ Positive offset: the cut ends this far before the point, negative: it goes beyond it. 0 = through the point up to the edge.
Versatz Punkt 1 ⇒ Offset point 1
Versatz Punkt 2 ⇒ Offset point 2
Versatz senkrecht ⇒ Vertical offset
Versatz vom Ende ⇒ Offset from the end
Versatz waagrecht ⇒ Horizontal offset
Versatz X ⇒ Offset X
Versatz Y ⇒ Offset Y
Versatz Z (entlang Achse) ⇒ Offset Z (along axis)
Versatz: Kurve anklicken (zusammenhängende Ketten werden ganz genommen), Seite und Abstand mit der Maus zeigen, klicken. Ein gemeinsames Maß steuert die ganze Kette. ⇒ Offset: click a curve (connected chains are taken whole), show side and distance with the mouse, click. One common dimension controls the whole chain.
Verschachtelung ⇒ Nesting
Verschachtelung (Nesting) ⇒ Nesting
Verschachtelung {0} ⇒ Nesting {0}
Verschachtelung schließen ⇒ Close nesting
Verschieben ⇒ Move
Verschieben (mittlere Maustaste) ⇒ Pan (middle mouse button)
Verschieben X ⇒ Move X
Verschieben Y ⇒ Move Y
Verschieben: vorher Elemente wählen, dann Basispunkt und Zielpunkt klicken. Mit Strg (oder „Als Kopie“) wird kopiert. ⇒ Move: select entities first, then click the base point and target point. With Ctrl (or “As copy”) it copies.
Verschiebung ⇒ Displacement
Verschmelzungskurve ⇒ Blend Curve
Verteilung ⇒ Distribution
Vertikal ⇒ Vertical
Vertikaler Abstand ⇒ Vertical distance
Verwalten ⇒ Manage
Verwerfen ⇒ Discard
Verwerfen und neu ⇒ Discard and new
Verwerfen und öffnen ⇒ Discard and open
Video (WebM) zum Weitergeben, z. B. als Montageanleitung ⇒ Video (WebM) to share, e.g. as assembly instructions
Video gespeichert ({0} KB, {1} s). ⇒ Video saved ({0} KB, {1} s).
Video speichern ⇒ Save video
Vieleck (einbeschrieben) ⇒ Inscribed Polygon
Vieleck (umschrieben, Schlüsselweite) ⇒ Circumscribed Polygon (across flats)
Vieleck (umschrieben) ⇒ Circumscribed Polygon
Vieleck über Kante ⇒ Edge Polygon
Vieleck: Mitte klicken, dann eine Ecke. Anzahl der Ecken mit + und − oder in der Palette. ⇒ Polygon: click the center, then a corner. Number of corners with + and − or in the palette.
Vierkantrohr ⇒ Square tube
Visueller Stil ⇒ Visual Style
Voll ⇒ Solid
Vollblock ⇒ Solid block
vollständig bestimmt ⇒ fully constrained
Vollständig bestimmt ⇒ Fully constrained
Volumen ⇒ Volume
Volumen {0}{1} ⇒ Volume {0}{1}
Volumen genau nachgetragen in {0} ms ({1} Körper) ⇒ Exact volume added in {0} ms ({1} bodies)
Volumen genau nachgetragen: {0} Körper in {1} ms ⇒ Exact volume added: {0} bodies in {1} ms
Volumenkörper ⇒ Solid
Volumennachtrag fehlgeschlagen: ⇒ Volume update failed:
vom Mittelpunkt weg ⇒ away from the center
Vom Rechner … ⇒ From this computer …
Vom Startpunkt aus ist auf dem Pfad kein Platz – Startpunkt verschieben ⇒ No room on the path from the start point – move the start point
Von ⇒ From
Von (bewegt) ⇒ From (moved)
Von der Teilstrecke bleibt nichts übrig ⇒ Nothing is left of the partial length
Von Objekt ⇒ From Object
Vorderansicht ⇒ Front view
Vorgang ⇒ Operation
Vorlage ⇒ Template
Vorlage nicht lesbar: ⇒ Template not readable:
Vorne (−Y) ⇒ Front (−Y)
Vorprüfung ⇒ Pre-check
Vorprüfung bestanden ⇒ Pre-check passed
Vorprüfung bestanden – bereit zum Erzeugen. ⇒ Pre-check passed – ready to generate.
Vorprüfung: {0} offene Punkte (siehe rechts). ⇒ Pre-check: {0} open items (see right).
Vorprüfung: ist die Studie vollständig? ⇒ Pre-check: is the study complete?
Vorschau berechnen ⇒ Compute preview
Wand ⇒ Wall
Wanddicke ⇒ Wall thickness
Wanddicke muss größer als 0 sein ⇒ Wall thickness must be greater than 0
Wandstärke ⇒ Wall thickness
Wandstärke außen ⇒ Outer wall thickness
Wandstärke außen muss größer als 0 sein ⇒ Outer wall thickness must be greater than 0
Wandstärke muss größer als 0 sein ⇒ Wall thickness must be greater than 0
Wandstärke zu groß für das Rohr ⇒ Wall thickness too large for the tube
Weg in der Nut ⇒ Travel in the slot
Wegbegrenzung ⇒ Travel limits
Weich ⇒ Soft
Weiß (Katalog) ⇒ White (catalog)
Weiter mit „{1}“ ⇒ Continue with “{1}”
Weitere Flächen ⇒ More faces
Weitere Kantengruppen gehen nur mit konstantem Radius bzw. gleichem Abstand ⇒ Further edge sets only work with constant radius or equal distance
Weitere Punkte anklicken, zum Schließen auf den ersten Punkt. ⇒ Click more points, click the first point to close.
Weitere Skizzen ⇒ More sketches
Welche ⇒ Which
Werkstoff ⇒ Material
Werkstoff · Masse ⇒ Material · Mass
Werkstoffanteil ⇒ Material fraction
Werkzeug ⇒ Tool
Werkzeuge ⇒ Tools
Werkzeugkörper ⇒ Tool body
Werkzeugkörper anklicken ⇒ Click the tool body
Werkzeugkörper im Modell anklicken. ⇒ Click the tool bodies in the model.
Werkzeugkörper wählen ⇒ Select tool bodies
Wert ⇒ Value
Werte ändern, die Vorschau rechnet mit. Enter = OK, Esc = Abbrechen. ⇒ Change values, the preview updates along. Enter = OK, Esc = Cancel.
Werte anpassen, die Vorschau rechnet mit. ⇒ Adjust values, the preview updates along.
Widersprüchliche Bedingungen ⇒ Contradicting conditions
Wie Fenster ⇒ Like window
Mit einer Körperfläche als Profil: die angeklickte ebene Fläche wird entlang ihrer Außennormale extrudiert – als neuer Körper, angefügt oder ausgeschnitten. ⇒ With a body face as profile: the clicked planar face is extruded along its outward normal – as a new body, joined or cut.
Alle Biegungen werden flachgelegt, die feste Fläche bleibt liegen. Danach auf dem flachen Blech skizzieren und ausschneiden (auch über Biegungen hinweg) und mit „Zurückfalten“ wieder biegen. ⇒ All bends are flattened, the stationary face stays in place. Then sketch and cut on the flat sheet (also across bends) and bend it again with “Refold”.
Was im Werkzeugkörper liegt, wird ein eigener Körper (z. B. ein Ausschnitt eines Blechs aus einer Kontur), der Rest bleibt; das Werkzeug bleibt erhalten und lässt sich danach ausblenden. ⇒ What lies inside the tool body becomes a separate body (e.g. a cutout of a sheet from a contour), the rest stays; the tool is kept and can be hidden afterwards.
Ableiten: Körper des anderen Dokuments an ihrer Lage, verknüpft über die Datei (aktualisiert beim Öffnen oder mit „Teile aktualisieren“). Weitere Features können darauf aufbauen, z. B. Bohrungen oder Blech. ⇒ Derive: bodies of the other document at their position, linked via the file (updates on opening or with “Update parts”). Further features can build on them, e.g. holes or sheet metal.
Begrenzender Volumenkörper: ein neuer Körper, der die gewählten Körper umschließt – z. B. als Rohteil, Verpackung oder zum Ausschneiden. ⇒ Bounding Solid: a new body enclosing the selected bodies – e.g. as stock, packaging or for cutting.
Begrenzungsfüllung: Körper und Ebenen schließen Zellen ein; die gewählten Zellen werden ein neuer Körper – z. B. der Hohlraum zwischen Blechen als Füllung, ein Kern zwischen zwei Teilen oder ein Formeinsatz. {0} ⇒ Boundary Fill: bodies and planes enclose cells; the selected cells become a new body – e.g. the cavity between sheets as a filling, a core between two parts or a mold insert. {0}
Durch Biegung verbinden: Biegeradius {0}, Dicke {1} mm. Beide Körper werden zu einem verbunden, die Abwicklung neu gerechnet. ⇒ Join by Bend: bend radius {0}, thickness {1} mm. Both bodies are joined into one, the flat pattern is recomputed.
Elemente entfernen, z. B. für importierte STEP-Teile: Bohrungen werden gefüllt (mit Bohrspitze), Rundungen und Fasen zwischen zwei ebenen Flächen zur scharfen Kante ergänzt bzw. abgetragen. 0 = Automatik aus. Vorschau nach OK. ⇒ Defeature, e.g. for imported STEP parts: holes are filled (with drill point), fillets and chamfers between two planar faces are completed or removed to a sharp edge. 0 = automatic off. Preview after OK.
Generatives Design, eben (2D): Material wird im Designbereich so verteilt, dass das Teil bei der gegebenen Kraft möglichst steif ist; der Umriss wird um die Dicke extrudiert. Liegt eine Kraft oder Halterung in einer Bohrungsmitte, gilt der ganze Bohrungsrand. Beim Bearbeiten rechnet nur „Vorschau berechnen“ (das dauert einige Sekunden), OK rechnet immer. ⇒ Generative Design, planar (2D): material is distributed in the design space so that the part is as stiff as possible under the given force; the outline is extruded by the thickness. If a force or support lies at a hole center, the whole hole edge applies. While editing only “Compute preview” computes (takes a few seconds), OK always computes.
Prägen: das Profil der Skizze wird auf die angeklickte Fläche gebracht – eben oder gekrümmt (z. B. Schrift auf einem Rohr) – und dort um die Tiefe vertieft oder erhaben aufgesetzt. Abwickeln (nur Zylinder): Maße quer zur Achse werden Bogenlänge, die Skizzenebene liegt parallel zur Achse. Projizieren: entlang der Skizzennormale. Versatz und Drehwinkel verschieben bzw. drehen das Profil in der Skizzenebene (um seine Mitte). ⇒ Emboss: the profile of the sketch is placed on the clicked face – planar or curved (e.g. lettering on a tube) – and recessed or raised there by the depth. Wrap (cylinders only): dimensions across the axis become arc length, the sketch plane lies parallel to the axis. Project: along the sketch normal. Offset and rotation angle move or rotate the profile in the sketch plane (about its center).
Verdicken, hier für Flächen von Körpern: jede Fläche wird zur Schicht mit der Dicke – z. B. ein Blechdeckel genau auf einer Fläche oder eine Hülle um einen gekrümmten Bereich. ⇒ Thicken, here for faces of bodies: each face becomes a layer with the thickness – e.g. a sheet metal cover exactly on a face or a skin around a curved area.
2-Achsen-Schneiden (Laser, Wasserstrahl, Plasma): Das Ergebnis ist ein 2D-Umriss, der über die Dicke der Körper entlang der Schneidrichtung extrudiert wird – passt direkt zur Laser-DXF. Für 3D-Druck oder Guss „Uneingeschränkt (3D)“ wählen. ⇒ 2-axis cutting (laser, waterjet, plasma): the result is a 2D outline extruded over the thickness of the bodies along the cutting direction – fits the laser DXF directly. For 3D printing or casting choose “Unrestricted (3D)”.
Ansichtsbereich: ein Foto oder eine eingescannte Zeichnung in einer Ebene, zum Nachzeichnen in einer Skizze. Die Höhe folgt dem Seitenverhältnis des Bildes. Für die Maßstäblichkeit die Breite so wählen, dass eine bekannte Strecke stimmt. ⇒ Canvas: a photo or scanned drawing in a plane, for tracing in a sketch. The height follows the aspect ratio of the image. For true scale, choose the width so that a known distance matches.
Baugruppen-Abhängigkeiten: je Zeile zuerst eine Fläche/Kante der Komponente, die sich bewegen soll, dann das Gegenstück. Alle Abhängigkeiten gelten zugleich; die Komponente bewegt sich so wenig wie möglich. Deckungsgleich: ebene Flächen liegen aufeinander (bündig: gleiche Richtung), mit Abstand. Konzentrisch: Zylinderflächen oder Kreiskanten. ⇒ Assembly constraints: per row first a face/edge of the component that should move, then the counterpart. All constraints apply at the same time; the component moves as little as possible. Coincident: planar faces lie on each other (flush: same direction), with distance. Concentric: cylindrical faces or circular edges.
Blechabrundung: nur Kanten in Dickenrichtung. Die Abwicklung wird aus der gerundeten Form neu gerechnet. Vorschau nach OK. ⇒ Sheet metal fillet: only edges in thickness direction. The flat pattern is recomputed from the rounded shape. Preview after OK.
Gelenkursprung: eigener Bezug an einem Körper (Kreiskante = Mitte, Fläche = Mittelpunkt, Kante = Mitte), versetzt und mitgeführt. In „Gelenk“ und „Ausrichten“ als Ursprung anklicken (gestrichelte Achse). ⇒ Joint Origin: its own reference on a body (circular edge = center, face = center point, edge = midpoint), offset and carried along. Click it as the origin in “Joint” and “Align” (dashed axis).
Geometrische Anordnung an Punkten: an jeden einzelnen Punkt der Skizze kommt eine Kopie. Bezug ist der Punkt, der dem Original am nächsten liegt. ⇒ Geometric pattern on points: a copy goes to every individual point of the sketch. The reference is the point nearest to the original.
Krümmungs-Map: Farbe nach der größten Krümmung an jeder Stelle, von blau (eben) über grün und gelb bis rot (Radius gleich oder kleiner als die Grenze). Sprünge der Farbe an einer Kante zeigen einen Krümmungssprung, auch wo der Übergang tangential ist. ⇒ Curvature Map: color by the largest curvature at every location, from blue (flat) through green and yellow to red (radius equal to or smaller than the limit). Color jumps at an edge show a curvature jump, even where the transition is tangent.
Mindestradius-Analyse: gekrümmte Flächen (Zylinder, Kugeln, Rundungen) mit kleinerem Radius als die Grenze sind rot – z. B. Innenradien, die ein Fräser nicht schafft, oder Rundungen unter dem Mindestmaß. ⇒ Minimum Radius Analysis: curved faces (cylinders, spheres, fillets) with a radius smaller than the limit are red – e.g. inner radii a milling cutter cannot reach, or fillets below the minimum.
Sweeping mit Körper: der Körper wandert entlang des Pfads (vom näheren Pfadende aus) und überstreicht den Raum – etwa ein Fräser, der eine Nut schneidet. Exakt gehen eine Kugel und ein Zylinder mit Achse senkrecht zur Pfadebene. ⇒ Sweep with a body: the body travels along the path (from the nearer path end) and sweeps the space – like a cutter cutting a slot. Exact for a sphere and a cylinder with its axis perpendicular to the path plane.
Teilefamilie: jede Zeile ist eine Variante. Parameterspalten nehmen Ausdrücke (z. B. 60 oder breite*2), Feature-Spalten unterdrücken das Feature. Die aktive Zeile wird nach OK übernommen; umschalten geht auch oben im Browser. ⇒ Part family: each row is a variant. Parameter columns take expressions (e.g. 60 or width*2), feature columns suppress the feature. The active row is applied after OK; switching also works at the top of the browser.
Übergangslasche: Rundungen werden in Facetten geteilt (Abkanten: jede Facettenkante ist eine Biegelinie). Blech {0} mm, K {1}. Die Abwicklung zeigt Blech → Abwicklung. ⇒ Loft flange: rounds are split into facets (press brake: each facet edge is a bend line). Sheet {0} mm, K {1}. Sheet Metal → Flat Pattern shows the flat pattern.
Verbindungselement: eigener Körper aus Stahl, in der Stückliste zusammengefasst. Gewinde nicht modelliert (Schaft = Nenn-⌀). Abstand z. B. für eine Mutter auf einer Scheibe. ⇒ Fastener: its own steel body, grouped in the BOM. Thread not modeled (shank = nominal ⌀). Distance e.g. for a nut on a washer.
Wie gezeichnet ⇒ As drawn
Wie Profil ⇒ Like profile
Wie Windows ⇒ Like Windows
Wiederholen ⇒ Redo
Wiederholen (Strg+Y) ⇒ Redo (Ctrl+Y)
Wiederholen: {0} ⇒ Redo: {0}
Windungen ⇒ Turns
Windungen + Höhe ⇒ Turns + height
Windungen + Steigung ⇒ Turns + pitch
Winkel ⇒ Angle
Winkel (L) ⇒ Angle (L)
Winkel 2 muss zwischen 0° und 89° liegen ⇒ Angle 2 must be between 0° and 89°
Winkel der zweiten Seite muss größer als 0 sein ⇒ Angle of the second side must be greater than 0
Winkel in der Ebene ⇒ Angle in the plane
Winkel muss zwischen 0° und 89° liegen ⇒ Angle must be between 0° and 89°
Winkel Seite 1 ⇒ Angle side 1
Winkel Seite 2 ⇒ Angle side 2
Winkel zwischen 0 und 180°. ⇒ Angle between 0 and 180°.
Winkel zwischen 0 und 360° ⇒ Angle between 0 and 360°
Winkel zwischen 1° und 179° ⇒ Angle between 1° and 179°
Winkel zwischen 1° und 180° ⇒ Angle between 1° and 180°
Winkel: jetzt die Lage des Maßbogens anklicken (bestimmt auch, welcher Winkel). ⇒ Angle: now click the position of the dimension arc (also determines which angle).
Winkelgrenzen ⇒ Angle limits
Wird angelegt in: ⇒ Will be created in:
Wird vorbereitet ⇒ Preparing
X/Y/Z gehen durch den Ursprung; für eine andere Achse „Kante/Achse anklicken“. ⇒ X/Y/Z pass through the origin; for another axis “Click edge/axis”.
XY · Draufsicht ⇒ XY · top view
XZ · Vorderansicht ⇒ XZ · front view
YZ · Seitenansicht ⇒ YZ · side view
z. B. Bohrung ⌀9 statt ⌀8 ⇒ e.g. hole ⌀9 instead of ⌀8
z. B. geschliffen ⇒ e.g. ground
z. B. Rohr* oder Blech ⇒ e.g. Tube* or sheet
z. B. Stahl 2 mm, Kunde X ⇒ e.g. steel 2 mm, customer X
Zahl oder Ausdruck, z. B. 12, 40/2 oder breite/2 ⇒ Number or expression, e.g. 12, 40/2 or width/2
Zahl oder Ausdruck, z. B. 40, 60/2 oder breite/2 (Parameter ändern) ⇒ Number or expression, e.g. 40, 60/2 or width/2 (Change Parameters)
Zahlenfelder {0} ⇒ Number fields {0}
Zapfen (Außenzylinder) wird nicht entfernt ⇒ Boss (outer cylinder) is not removed
Zebra-Analyse (Flächenübergänge prüfen, ein/aus) ⇒ Zebra Analysis (check face transitions, on/off)
Zebra-Analyse an: Knicke in den Streifen = Kante ohne tangentialen Übergang. Noch einmal wählen zum Ausschalten. ⇒ Zebra analysis on: kinks in the stripes = edge without tangent transition. Choose again to turn off.
Zebra-Analyse aus. ⇒ Zebra analysis off.
Zeichnung ⇒ Drawing
Zeichnung {0} ⇒ Drawing {0}
Zeichnung {0} · Maßstab {1} ⇒ Drawing {0} · Scale {1}
Zeichnung aus Konstruktion ⇒ Drawing from Design
Zeichnung nicht möglich: ⇒ Drawing not possible:
Zeichnung nicht möglich: {0} ⇒ Drawing not possible: {0}
Zeichnung schließen ⇒ Close drawing
Zeichnung schließen und das Modell öffnen ⇒ Close the drawing and open the model
Zeichnungsblätter bleiben auch im dunklen Schema weiß wie Papier. ⇒ Drawing sheets stay white like paper even in the dark scheme.
Zeichnungsnummer ⇒ Drawing number
Zeiger in den Winkel zwischen den Linien bewegen ⇒ Move the pointer into the angle between the lines
Zeile kopieren ⇒ Copy row
Zeile löschen ⇒ Delete row
Zellen ⇒ Cells
Zentimeter ⇒ Centimeters
Ziehen dreht, Mitte/Umschalt verschiebt, Rad zoomt. Bei jeder Bewegung beginnt das Bild neu und wird dann immer feiner. Material und Farbe kommen vom Körper (Browser → Rechtsklick → Material und Farbe). ⇒ Drag orbits, middle/Shift pans, wheel zooms. With every movement the image starts over and then gets finer and finer. Material and color come from the body (Browser → right-click → Material and color).
Ziel ⇒ Target
Ziel- und Werkzeugkörper wählen. ⇒ Select target and tool bodies.
Zielanteil ⇒ Target fraction
Ziele ⇒ Objectives
Ziele: Steifigkeit maximieren (Zielmasse) oder Masse minimieren (Sicherheitsfaktor) ⇒ Objectives: maximize stiffness (target mass) or minimize mass (safety factor)
Zielfläche ⇒ Target face
Zielfläche wählen ⇒ Select target face
Zielkörper ⇒ Target body
Zielkörper wählen ⇒ Select target body
Zielmasse ⇒ Target mass
Zielmasse {0} g ⇒ Target mass {0} g
Zielmasse größer als der Bereich – 95 % genommen ⇒ Target mass larger than the region – 95 % taken
Zielmasse sehr klein – 5 % genommen ⇒ Target mass very small – 5 % taken
Zielposition ⇒ Target position
Zielpunkt anklicken: Kante (es zählt der nähere Eckpunkt), Kreis (seine Mitte) oder Arbeitspunkt. Esc bricht ab. ⇒ Click the target point: edge (the nearer corner point counts), circle (its center) or construction point. Esc cancels.
Zirkelbezug: {0} ⇒ Circular reference: {0}
Zoll ⇒ Inches
Zoom (Mausrad) ⇒ Zoom (mouse wheel)
Zu Baugruppe hinzufügen (neue Baugruppe mit diesem Teil) ⇒ Add to Assembly (new assembly with this part)
Zu tief verschachtelt ⇒ Nested too deeply
Zu viele Dreiecke ({0}) – bitte gröber exportieren (max. 150 000) ⇒ Too many triangles ({0}) – please export coarser (max. 150,000)
zu wenig Schräge ⇒ too little draft
Zuerst den Nullpunkt (Eck- oder Mittelpunkt) in einer Ansicht anklicken. ⇒ First click the origin (corner or center point) in a view.
Zuerst die neutrale Ebene wählen. An ihr behalten die Flächen ihre Lage. ⇒ First select the neutral plane. The faces keep their position at it.
Zuerst Parameter anlegen (Parameter ändern) oder Features erstellen – sie werden die Spalten der Tabelle. ⇒ First create parameters (Change Parameters) or features – they become the columns of the table.
Zugrichtung ⇒ Pull direction
Zuletzt geöffnet ⇒ Recently opened
Zum Abwickeln muss die Skizzenebene parallel zur Zylinderachse liegen ⇒ For wrapping, the sketch plane must be parallel to the cylinder axis
Zum Designbereich passt kein Rasterelement – Elementgröße kleiner wählen ⇒ No grid element fits the design space – choose a smaller element size
Zum Körper ⇒ To the body
Zum Modell ⇒ To the model
Zum Pfadanfang ⇒ To the path start
Zum Pfadende ⇒ To the path end
Zum Text zusätzlich die Kurve wählen (Strg/Umschalt-Klick). ⇒ Select the curve in addition to the text (Ctrl/Shift-click).
Zur Einrichtung ⇒ To the setup
Zur Fläche hin ⇒ Toward the face
Zur Skizzenseite ⇒ To the sketch side
Zurück ⇒ Back
Zurückfalten ⇒ Refold
Zurückfalten: Schnitte aus dem flachen Zustand werden auf das gebogene Blech übertragen. ⇒ Refold: cuts from the flat state are transferred to the bent sheet.
zurückgefaltet (keine Schnitte im flachen Zustand) ⇒ refolded (no cuts in the flat state)
zurückgefaltet, {0} Schnittstück{1} übertragen ⇒ refolded, {0} cut piece{1:s} transferred
Zusammenfügen ⇒ Assemble
Zuschneiden: zwei Ecken des Bereichs in einer Ansicht anklicken. Zweimal dieselbe Stelle hebt den Zuschnitt auf. ⇒ Crop: click two corners of the area in a view. The same spot twice removes the crop.
Zuschneiden: zwei Ecken in einer Ansicht anklicken (zweimal dieselbe Stelle hebt den Zuschnitt auf) ⇒ Crop: click two corners in a view (the same spot twice removes the crop)
Zuschnitt aufgehoben. ⇒ Crop removed.
Zuschnittliste ⇒ Cut List
Zwei Abstände ⇒ Two distances
Zwei Eckpunkte anklicken: jeweils eine Kante nahe dem gewünschten Endpunkt. ⇒ Click two corner points: each time an edge near the desired end point.
zwei Endkanten ⇒ two end edges
Zwei gerade Kanten anklicken – der Punkt liegt in ihrem Schnitt bzw. mitten auf der kürzesten Verbindung. Ein dritter Klick beginnt neu. ⇒ Click two straight edges – the point lies at their intersection or in the middle of the shortest connection. A third click starts over.
Zwei gerade Kanten anklicken, die in einer Ebene liegen (schneidend oder parallel). Ein dritter Klick beginnt neu. ⇒ Click two straight edges lying in one plane (intersecting or parallel). A third click starts over.
Zwei Kanten ⇒ Two edges
Zwei Kanten einer Fläche anklicken; die Abstände gelten nach innen in diese Fläche. ⇒ Click two edges of a face; the distances apply inward into this face.
Zwei parallele Ebenen oder ebene Flächen anklicken. Die neue Ebene liegt genau in der Mitte. Ein dritter Klick beginnt neu. ⇒ Click two parallel planes or planar faces. The new plane lies exactly in the middle. A third click starts over.
Zwei Profile liegen aufeinander ⇒ Two profiles lie on top of each other
Zwei Punkte auf einer Blechfläche anklicken ⇒ Click two points on a sheet metal face
zwei Punkte gewählt ⇒ two points selected
Zwei Seiten ⇒ Two sides
Zwei sich schneidende Ebenen oder ebene Flächen anklicken. Ein dritter Klick beginnt neu. ⇒ Click two intersecting planes or planar faces. A third click starts over.
Zwei verschiedene Profil-Skizzen wählen ⇒ Select two different profile sketches
Zwei Winkel ⇒ Two angles
Zweite Richtung ⇒ Second direction
zweiten Punkt anklicken … ⇒ click the second point …
zweiten Punkt auf dem Kreis klicken ⇒ click the second point on the circle
Zweiten Punkt in derselben Ansicht anklicken (Ecke oder Bohrungsmitte). ⇒ Click a second point in the same view (corner or hole center).
zweites Element oder Platz für das Maß ⇒ second entity or position for the dimension
Zwischen zwei Punkten ⇒ Between two points
Zwischen zwei Punkten: gerader Schnitt durch eine Blechwand, beide Punkte auf derselben ebenen Fläche. Die Wanddicke nimmt das Programm von der gegenüberliegenden Fläche. ⇒ Between two points: straight cut through a sheet metal wall, both points on the same planar face. The program takes the wall thickness from the opposite face.
Zwischenpunkte ⇒ Intermediate points
Zylinder ⇒ Cylinder
Zylinder ⌀{0} × {1} ⇒ Cylinder ⌀{0} × {1}
Zylinder ⌀{0} × {1} mm ⇒ Cylinder ⌀{0} × {1} mm
Zylinderachse ⇒ Cylinder axis
Zylinderachse nicht bestimmbar ⇒ Cylinder axis cannot be determined
Zylinderfläche ⇒ Cylindrical face
Zylinderfläche an der Stelle anklicken, an der die Ebene anliegen soll. Mit „Winkel“ um die Ebenen-X-Achse (= Zylinderachse) weiterdrehen. ⇒ Click the cylindrical face where the plane should touch. Rotate further about the plane X axis (= cylinder axis) with “Angle”.
Zylinderfläche anklicken ⇒ Click a cylindrical face
Zylinderfläche anklicken … ⇒ Click a cylindrical face …
Zylinderform ⇒ Cylinder shape
Zylinderkopf ISO 4762 ⇒ Socket head ISO 4762
Zylinderschraube mit Innensechskant ⇒ Socket head cap screw
Zylindersenkung ⇒ Counterbore
Zylindrisch ⇒ Cylindrical
ρ der konischen Kurve ⇒ ρ of the conic curve
Doppelklick benennt um ⇒ double-click to rename
{0} exportiert. ⇒ {0} exported.
{0} exportiert ({1} Objekt{2}). ⇒ {0} exported ({1} object{2:s}).
{0} Freiheitsgrade offen ⇒ {0} degrees of freedom open
{0} geschlossene Profile ⇒ {0} closed profiles
1 geschlossenes Profil ⇒ 1 closed profile
(+/− Ecken) ⇒ (+/− corners)
+/− Ecken ⇒ +/− corners
{0}-Eck ⇒ {0}-gon
Umriss ⇒ Outline
Zuschnitt ⇒ Blank
Saum ⇒ Hem
Offener Saum ⇒ Open hem
Doppelsaum ⇒ Double hem
nach oben ⇒ up
nach unten ⇒ down
Nr. ⇒ No.
Pos. ⇒ Item
Masse/Stk. ⇒ Mass/pc
gesamt ⇒ total
Anz. ⇒ Qty
Verdeckte ⇒ Hidden
Kehlnaht ringsum ⇒ Fillet weld all around
V-Naht ⇒ V weld
HV-Naht ⇒ HV weld
I-Naht ⇒ I weld
{0} bearbeiten ⇒ Edit {0}
Teilen ⇒ Split
leer ⇒ empty
andere ⇒ other
entlang ⇒ along
Unten ⇒ Bottom
Oben ⇒ Top
Versetzt/Winklig ⇒ Offset/Angled
quadratisch ⇒ square
rund ⇒ round
ohne ⇒ none
unbekannt ⇒ unknown
bereit ⇒ ready
automatisch ⇒ automatic
einseitig ⇒ one side
beidseitig ⇒ two sides
eben ⇒ planar
Innen-⌀ ⇒ Inner ⌀
Rohr-⌀ ⇒ Tube ⌀
Einheiten: mm ⇒ Units: mm
Abstand/Winkel ⇒ Distance/angle
Horizontal/Vertikal ⇒ Horizontal/Vertical
K-Faktor ⇒ K-factor
DXF-Einstellungen ⇒ DXF Settings
Verschieben/Kopieren ⇒ Move/Copy
2-Achsen-Schneiden ⇒ 2-axis cutting
{0} Laschen ⇒ {0} flanges
{0} Lasche ⇒ {0} flange
{0} Ausschnitte ⇒ {0} cutouts
{0} Ausschnitt ⇒ {0} cutout
Durchgang {0} ⇒ Clearance {0}
Kernloch {0} ⇒ Tap drill {0}
Gewindeeinsatz {0} ⇒ Thread insert {0}
oder ⇒ or
. Erlaubt: + − * / ^, Klammern, sqrt, sin/cos/tan (Grad), min/max (mit ; trennen), pi. ⇒ . Allowed: + − * / ^, parentheses, sqrt, sin/cos/tan (degrees), min/max (separate with ;), pi.
Einheiten rechnen mit: 5 cm sind 50 mm und breite*tiefe ist mm² – passt die Größe eines Ausdrucks nicht zu dem, was ein Feld erwartet, meldet das Feld einen Fehler. ⇒ Units are calculated too: 5 cm is 50 mm and breite*tiefe is mm² – if an expression’s unit does not match what a field expects, the field reports an error.
Aktuelles Teil ⇒ Current part
keine ⇒ none
eine ⇒ one
{0} hat kein geschlossenes Profil (offene Enden) ⇒ {0} has no closed profile (open ends)
{0} hat kein geschlossenes Profil ⇒ {0} has no closed profile
{0} Körper ⇒ {0} bodies
1 Körper ⇒ 1 body
{0} ein/aus ⇒ {0} on/off
ein/aus ⇒ on/off
{0} Teil aktualisiert. ⇒ {0} part updated.
{0} Teile aktualisiert. ⇒ {0} parts updated.
Länge {0} Winkel {1} ⇒ Length {0} Angle {1}
Breite {0} Höhe {1} ⇒ Width {0} Height {1}
{0} ist schon durch andere Bedingungen festgelegt. ⇒ {0} is already defined by other constraints.
Verknüpft mit {0} ⇒ Linked to {0}
Verknüpft: {0} ⇒ Linked: {0}
Rot: ⇒ Red:
Gesamtlänge ⇒ Overall length
Halber Abstand ⇒ Half spacing
ausgeblendet ⇒ hidden
Oder eine ebene ⇒ Or a planar
Körper# ⇒ Body
Zeitleiste ⇒ Timeline
noch nicht gespeichert ⇒ not saved yet
⌀ von ⇒ ⌀ from
⌀ bis ⇒ ⌀ to
{0} ist fertig. Mit E extrudieren. ⇒ {0} is finished. Extrude with E.
{0} ist aktiv. ⇒ {0} is active.
oberste Ebene ⇒ top level
{0} von {1} Punkten ⇒ {0} of {1} points
{0} von {1} Ebenen ⇒ {0} of {1} planes
{0} von {1} Kanten ⇒ {0} of {1} edges
{0#} Kante ⇒ {0} edge
{0#} Kanten ⇒ {0} edges
{0#} Fläche ⇒ {0} face
{0#} Flächen ⇒ {0} faces
{0} von {1} Biegungen abgewickelt, {2} stehen gelassen ⇒ {0} of {1} bends unfolded, {2} left standing
Wände ⇒ Walls
ISO 4762 Zylinderschraube mit Innensechskant ⇒ ISO 4762 Socket head cap screw
ISO 4017 Sechskantschraube ⇒ ISO 4017 Hex bolt
ISO 10642 Senkschraube mit Innensechskant ⇒ ISO 10642 Countersunk socket screw
ISO 4032 Sechskantmutter ⇒ ISO 4032 Hex nut
ISO 7089 Scheibe ⇒ ISO 7089 Washer
{0} mm aus der Blechregel ⇒ {0} mm from the sheet metal rule
{0} Dateien als ZIP gespeichert. ⇒ {0} files saved as ZIP.
Ende der ersten Kante ⇒ End of the first edge
{0#}. Linie anklicken ⇒ Click line {0}
{0} von {1} Zelle ⇒ {0} of {1} cell
{0} von {1} Zellen ⇒ {0} of {1} cells
Mit Gelenken duplizieren ⇒ Duplicate With Joints
Aus-/Einblenden ⇒ Hide/Show
neu ⇒ new
{0} mit {1} Gelenk dupliziert. Gelenk bearbeiten und Ursprung 2 auf die neue Stelle setzen. ⇒ {0} duplicated with {1} joint. Edit the joint and set origin 2 to the new location.
{0} mit {1} Gelenken dupliziert. Gelenke bearbeiten und Ursprung 2 auf die neue Stelle setzen. ⇒ {0} duplicated with {1} joints. Edit the joints and set origin 2 to the new location.
{0} · {1} g · Sicherheitsfaktor {2} · max. Verschiebung {3} mm ⇒ {0} · {1} g · safety factor {2} · max. displacement {3} mm
{0} · durch {1} ⇒ {0} · through {1}
{0} · kosmetisch ⇒ {0} · cosmetic
{0} (Neubau dauert zu lange) ⇒ {0} (rebuild takes too long)
{0} (oberste Ebene) ist aktiv. ⇒ {0} (top level) is active.
{0} {1} mm passt nicht an die Ecke ⇒ {0} {1} mm does not fit the corner
{0} {1}{2} (Strg = Kopie) ⇒ {0} {1}{2} (Ctrl = copy)
{0} × {1} modelliert ⇒ {0} × {1} modeled
{0} Abwicklung ⇒ {0} Flat Pattern
{0} Aktuelles Teil ⇒ {0} Current part
{0} als DXF gespeichert ({1} Kurve{2}). ⇒ {0} saved as DXF ({1} curve{2:s}).
{0} aus Dauerspeicher ⇒ {0} from persistent storage
{0} aus diesem Bau ⇒ {0} from this build
{0} aus Speicher ⇒ {0} from memory
{0} Baugruppe ⇒ {0} Assembly
{0} Biegung{1} abgewickelt ⇒ {0} bend{1:s} unfolded
{0} Biegungen · {1} Eckfreischnitt{2}{3} ⇒ {0} bends · {1} corner relief{2:s}{3}
{0} Bilder/s · Grafik: {1} ⇒ {0} frames/s · Graphics: {1}
{0} Bohrung{1} ⇒ {0} hole{1:s}
{0} Bohrung{1} an den Punkten der Skizze. ⇒ {0} hole{1:s} at the points of the sketch.
{0} braucht {1} davor. ⇒ {0} needs {1} before it.
{0} Datei{1} als ZIP gespeichert{2}. ⇒ {0} file{1:s} saved as ZIP{2}.
{0} Ecke{1} ⇒ {0} corner{1:s}
{0} Ecke{1} {2} ⇒ {0} corner{1:s} {2}
{0} Eintrag ohne Netz ⇒ {0} entries without mesh
{0} entlang des Pfads ⇒ {0} along the path
{0} Facetten{1} · Zuschnitt {2} × {3} mm ⇒ {0} facets{1} · blank {2} × {3} mm
{0} Fase{1} ⇒ {0} chamfer{1:s}
{0} Feature{1} im Dokument mit Fehler ⇒ {0} feature{1:s} in the document with errors
{0} Feature{1} im Teil mit Fehler ⇒ {0} feature{1:s} in the part with errors
{0} Freiheitsgrad{1} offen ⇒ {0} degree{1:s} of freedom open
{0} Gespeichert im Teil ({1} KB). ⇒ {0} Stored in the part ({1} KB).
{0} getrennte Teile ⇒ {0} separate parts
{0} grobe Netze neu gerechnet ⇒ {0} coarse meshes recomputed
{0} hat keine Linien ⇒ {0} has no lines
{0} Kante{1} ⇒ {0} edge{1:s}
{0} Kante{1} aufgetrennt, Spalt {2} mm ⇒ {0} edge{1:s} ripped, gap {2} mm
{0} Kante{1} projiziert. ⇒ {0} edge{1:s} projected.
{0} Komponenten starr verbunden ⇒ {0} components rigidly connected
{0} Lasche{1} ⇒ {0} flange{1:s}
{0} mit {1} Gelenk{2} dupliziert. Gelenk bearbeiten und Ursprung 2 auf die neue Stelle setzen. ⇒ {0} duplicated with {1} joint{2:s}. Edit the joint and set origin 2 to the new location.
{0} mm{1} · Doppelklick benennt um ⇒ {0} mm{1} · double-click to rename
{0} Netze nicht gespeichert ⇒ {0} meshes not stored
{0} nicht lesbar: {1} ⇒ {0} not readable: {1}
{0} Profile · {1} Facetten{2} · Zuschnitt {3} × {4} mm ⇒ {0} profiles · {1} facets{2} · blank {3} × {4} mm
{0} Rundung{1} ⇒ {0} round{1:s}
{0} Steg{1}{2} ⇒ {0} web{1:s}{2}
{0} Tafel{1} ⇒ {0} sheet{1:s}
{0} Teil{1} abgetrennt ⇒ {0} part{1:s} split off
{0} Teil{1} aktualisiert ⇒ {0} part{1:s} updated
{0} von {1} Zelle{2}, {3} mm³ ⇒ {0} of {1} cell{2:s}, {3} mm³
{0} von 2 Ebenen ⇒ {0} of 2 planes
{0} von 2 Kanten ⇒ {0} of 2 edges
{0} von 2 Punkten ⇒ {0} of 2 points
{0} von 3 Punkten ⇒ {0} of 3 points
{0} widerspricht den vorhandenen Bedingungen. ⇒ {0} contradicts the existing constraints.
{0} wieder aktiv. ⇒ {0} active again.
{0} Windungen · ⇒ {0} turns ·
{0} wird von {1} benutzt. Trotzdem entfernen? ⇒ {0} is used by {1}. Remove anyway?
{0} Zeichnung ⇒ {0} Drawing
{0}-Eck · Kante {1} (+/− Ecken) ⇒ {0}-gon · edge {1} (+/− corners)
{0}-Eck · Umkreis Ø {1} (+/− Ecken) ⇒ {0}-gon · circumcircle Ø {1} (+/− corners)
{0}: {1} Kurven als Skizze {2} ({3} × {4} mm){5}. Jetzt z. B. extrudieren oder gravieren. ⇒ {0}: {1} curves as sketch {2} ({3} × {4} mm){5}. Now e.g. extrude or engrave.
{0}: Anteil {1} % ⇒ {0}: fraction {1} %
{0}°{1} (Strg = Kopie) ⇒ {0}°{1} (Ctrl = copy)
{0}× · Abstand {1} (+/− Anzahl) ⇒ {0}× · spacing {1} (+/− count)
{0}× · Startpunkt des Abstands klicken ⇒ {0}× · click the start point of the spacing
{0}× ringsum ({1} Kanten) ⇒ {0}× all around ({1} edges)
{0}× um diesen Mittelpunkt (+/− Anzahl) ⇒ {0}× about this center (+/− count)
{0}×{1} Rasterelemente · {2} Schritte · Nachgiebigkeit {3} N·mm · Weg an der Last {4} mm · Werkstoffanteil gerechnet {5} %, Umriss {6} %{7} ⇒ {0}×{1} grid elements · {2} steps · compliance {3} N·mm · displacement at the load {4} mm · material fraction computed {5} %, outline {6} %{7}
{0}Rechenfehler bei leichteren Versuchen: {1} ⇒ {0}Calculation error in lighter attempts: {1}
{1} × {2} mm · t {3} · R {4} · K {5} · {6} · {7} Ausschnitt{8} ⇒ {1} × {2} mm · t {3} · R {4} · K {5} · {6} · {7} cutout{8:s}
{1} Eigenschaften ⇒ {1} Properties
{1} In aktive Komponente verschieben ⇒ {1} Move to active component
{1} Skizze bearbeiten ⇒ {1} Edit sketch
{1} von {2} Material{3} fertig ⇒ {1} of {2} material{3:s} done
{10} Aus der Baugruppe entfernen ⇒ {10} Remove from assembly
{10} Isolieren ⇒ {10} Isolate
{11} Alle einblenden ⇒ {11} Show all
{15} Als STL speichern ⇒ {15} Save as STL
{2} × {3} mm in der Datei. Mit der Maus verschieben. ⇒ {2} × {3} mm in the file. Move with the mouse.
{2} Mit Gelenken duplizieren{3} ⇒ {2} Duplicate With Joints{3}
{2} Wiederholen ⇒ {2} Redo
{3} Umbenennen ⇒ {3} Rename
{3} Winkel 0° = +{4}, 90° = +{5} (Schneidebene quer zu {6}). ⇒ {3} Angle 0° = +{4}, 90° = +{5} (cutting plane across {6}).
{4} Neue Komponente darin ⇒ {4} New component inside
{5} Duplizieren (daneben) ⇒ {5} Duplicate (next to it)
{5} Material und Farbe ⇒ {5} Material and color
{6} Als DXF speichern ⇒ {6} Save as DXF
{6} Umbenennen ⇒ {6} Rename
Abwicklung{2} ⇒ Flat Pattern{2}
Bild{0} ⇒ Image{0}
Zahl tippen ⇒ type a number
Einheiten ⇒ Units
Längeneinheit ⇒ Length unit
Nachkommastellen Länge ⇒ Decimal places, length
Nachkommastellen Winkel ⇒ Decimal places, angle
Gilt für Feature-Dialoge, Skizzenmaße, Messen, Eigenschaften, Blechregeln, Zuschnittliste und Statusleiste. Intern rechnet cantcodecad weiter in mm, Dateien bleiben gleich. Eine Zahl ohne Einheit gilt in der gewählten Einheit, auch in Ausdrücken (breite + 5); als Faktor bleibt sie eine Zahl (breite * 2), „5 mm“ oder „1 in“ gilt wie geschrieben. Parameter rechnen in mm. Zeichnungsblätter, Verschachtelung und Exporte (DXF, CSV) bleiben in mm wie in der Fertigung. ⇒ Applies to feature dialogs, sketch dimensions, Measure, properties, sheet metal rules, cut list and the status bar. Internally cantcodecad keeps calculating in mm, files stay the same. A number without a unit is in the chosen unit, also in expressions (width + 5); as a factor it stays a number (width * 2), “5 mm” or “1 in” as written. Parameters calculate in mm. Drawing sheets, nesting and exports (DXF, CSV) stay in mm as in manufacturing.
„Automatisch“ zeigt so viele Stellen wie bisher (in cm und Zoll eine mehr, in m drei mehr). Nach einer Änderung wird die Oberfläche neu geladen; das offene Dokument bleibt erhalten. ⇒ “Automatic” shows as many places as before (one more in cm and inches, three more in m). After a change the interface reloads; the open document is kept.
Erst die Skizze bzw. das Feature mit OK oder Abbrechen beenden, dann die Einheiten ändern. ⇒ First finish the sketch or feature with OK or Cancel, then change the units.
Bedienung (Maus und Tasten) ⇒ Controls (mouse and keys)
Mitte dreht: mittlere Maustaste dreht, Strg + Mitte verschiebt, Umschalt + Mitte oder Mausrad zoomt. F passt ein, Strg + 1…7 Normansichten (vorne, hinten, links, rechts, oben, unten, isometrisch), Strg + 8 senkrecht auf die gewählte Fläche, S sucht Befehle. ⇒ Middle orbits: middle mouse button orbits, Ctrl + middle pans, Shift + middle or mouse wheel zooms. F fits, Ctrl + 1…7 standard views (front, back, left, right, top, bottom, isometric), Ctrl + 8 normal to the selected face, S searches commands.
Standard: mittlere Maustaste verschiebt, Umschalt + Mitte dreht, Mausrad zoomt. Tasten E Extrusion, D Drehung, F Verrunden, H Bohrung, Q Drücken/Ziehen, M Verschieben, J Gelenk, I Messen, S Befehlssuche, Pos1 Einpassen. ⇒ Standard: middle mouse button pans, Shift + middle orbits, mouse wheel zooms. Keys E Extrude, D Revolve, F Fillet, H Hole, Q Press Pull, M Move, J Joint, I Measure, S command search, Home Fit.
Zoomrichtung des Mausrads umkehren ⇒ Reverse mouse wheel zoom direction
Orbit (mittlere Maustaste) ⇒ Orbit (middle mouse button)
Verschieben (Strg + mittlere Maustaste) ⇒ Pan (Ctrl + middle mouse button)
Einpassen (F) ⇒ Fit (F)
Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Mitte dreht, Strg + Mitte verschiebt, Umschalt + Mitte oder Rad zoomt, F passt ein, Strg + 1…8 Ansichten, S sucht Befehle. ⇒ Click selects faces and edges, window or Alt-drag selects edges. Middle orbits, Ctrl + middle pans, Shift + middle or wheel zooms, F fits, Ctrl + 1…8 views, S searches commands.
Einheiten {0} · Z zeigt nach oben ⇒ Units {0} · Z points up
Einheiten {0} · Z zeigt nach oben · Grafik: {1} ⇒ Units {0} · Z points up · Graphics: {1}
Massenmittelpunkt X {0} · Y {1} · Z {2} {3}{4}{5} ⇒ Center of mass X {0} · Y {1} · Z {2} {3}{4}{5}
Versatz {0} {1} angelegt. ⇒ Offset {0} {1} created.
Mit F-Tasten: mittlere Maustaste verschiebt, Umschalt + Mitte dreht, Mausrad zoomt. F2 Verschieben, F3 Zoomen, F4 Orbit (mit der linken Maustaste, noch einmal = aus), F5 vorherige Ansicht, F6 Startansicht. Die Befehlstasten (E, D, F …) wie bei „Standard“. ⇒ With F keys: middle mouse button pans, Shift + middle orbits, mouse wheel zooms. F2 pan, F3 zoom, F4 orbit (with the left mouse button, again = off), F5 previous view, F6 home view. Command keys (E, D, F …) as in “Standard”.
Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Umschalt + Mitte dreht, Mitte verschiebt, Rad zoomt, F2/F3/F4 Verschieben/Zoomen/Orbit, F5 vorherige Ansicht, F6 Startansicht, S sucht Befehle. ⇒ Click selects faces and edges, window or Alt-drag selects edges. Shift + middle orbits, middle pans, wheel zooms, F2/F3/F4 pan/zoom/orbit, F5 previous view, F6 home view, S searches commands.
Orbit (Umschalt + mittlere Maustaste, F4) ⇒ Orbit (Shift + middle mouse button, F4)
Verschieben (mittlere Maustaste, F2) ⇒ Pan (middle mouse button, F2)
Zoom (Mausrad, F3) ⇒ Zoom (mouse wheel, F3)
Gesamtlänge {0#} ⇒ Overall length {0}
Halber Abstand {0#} ⇒ Half spacing {0}
Abstand {0#} ⇒ Distance {0}
Festigkeit (Rahmen) ⇒ Frame Strength
Festigkeit (Rahmen): Lager, Lasten, Sicherheitsfaktor je Stab ⇒ Frame Strength: supports, loads, safety factor per member
Eigengewicht (in −Z) ⇒ Self-weight (in −Z)
Einspannung ⇒ Fixed
Gelenklager ⇒ Pinned
Streckenlast ⇒ Distributed load
Kraft ⇒ Force
Stab anklicken: Einspannung am nächsten Ende (in der Mitte: an der Stelle). Noch einmal = weg. ⇒ Click a member: fixed support at the nearest end (in the middle: at that point). Again = remove.
Stab anklicken: gelenkiges Lager (Verschiebungen gesperrt, Drehen frei) am nächsten Ende. Noch einmal = weg. ⇒ Click a member: pinned support (translations locked, rotation free) at the nearest end. Again = remove.
Stab anklicken: Einzelkraft am nächsten Ende oder an der Stelle. Noch einmal = weg. ⇒ Click a member: point force at the nearest end or at that point. Again = remove.
Stab anklicken: Streckenlast über die ganze Länge. Noch einmal = weg. ⇒ Click a member: distributed load over the whole length. Again = remove.
Lager ({0}) · Lasten ({1}) ⇒ Supports ({0}) · Loads ({1})
Einspannung ({0}) ⇒ Fixed ({0})
Gelenklager ({0}) ⇒ Pinned ({0})
Kraft {0} N ⇒ Force {0} N
Streckenlast {0} N/mm · {1} ⇒ Distributed load {0} N/mm · {1}
Mindestens ein Lager an einen Stab klicken. ⇒ Click at least one support onto a member.
Es fehlt ein Lager ⇒ A support is missing
Das Tragwerk ist beweglich – Lager prüfen ⇒ The structure is a mechanism – check the supports
Es gibt keine Rahmenstäbe ⇒ There are no frame members
Bitte einen Rahmenstab anklicken. ⇒ Please click a frame member.
Größte Verschiebung ⇒ Largest displacement
Kleinster Sicherheitsfaktor ⇒ Smallest safety factor
Auflagerkräfte gesamt ⇒ Total reaction forces
Knicken ⇒ Buckling
Spannung ⇒ Stress
σ max MPa ⇒ σ max MPa
SF Knicken ⇒ SF buckling
unter 1 ⇒ below 1
1 bis 1,5 ⇒ 1 to 1.5
1,5 bis 2 ⇒ 1.5 to 2
ab 2 ⇒ from 2
Leeren ⇒ Clear
Blau: Biegelinie, {0}-fach überhöht. Sicherheitsfaktor = Streckgrenze {1} MPa / Spannung (Normalkraft und Biegung am Rand, ohne Schub), bzw. Euler-Knicklast / Druckkraft mit Knicklänge = Stablänge. Gerechnet auf den Systemlinien (Skizzenlinien), Knoten biegesteif; Schweißnähte, Knotenbleche und Lochschwächungen bleiben unberücksichtigt – zur Vorbemessung, keine Statik zum Einreichen. ⇒ Blue: deflection line, exaggerated {0}×. Safety factor = yield strength {1} MPa / stress (axial force and bending at the edge, without shear), or Euler buckling load / compressive force with buckling length = member length. Calculated on the system lines (sketch lines), rigid joints; welds, gussets and holes are not considered – for preliminary design, not a structural analysis for submission.
Stahl S235 ⇒ Steel S235
Stahl S355 ⇒ Steel S355
Edelstahl 1.4301 ⇒ Stainless steel 1.4301
Aluminium EN AW-6060 T6 ⇒ Aluminum EN AW-6060 T6
Festigkeit (Bauteil) ⇒ Part Strength
Festigkeit (Bauteil): statische Spannung, Sicherheitsfaktor ⇒ Part Strength: static stress, safety factor
Netz ⇒ Mesh
Grob ⇒ Coarse
Mittel ⇒ Medium
Fein ⇒ Fine
Fest ⇒ Fixed
Körper wählen ⇒ Select body
Normale ⇒ Normal
Körper im Modell anklicken. ⇒ Click a body in the model.
Fläche anklicken, die fest gehalten wird (z. B. Schraubfläche, Einspannung). Noch einmal = weg. ⇒ Click the face that is held fixed (e.g. bolted face, clamping). Again = remove.
Fläche anklicken, auf die die Kraft wirkt – verteilt über die Fläche. Noch einmal = weg. ⇒ Click the face the force acts on – distributed over the face. Again = remove.
Fest ({0}) · Kräfte ({1}) ⇒ Fixed ({0}) · Forces ({1})
Feste Fläche {0} ⇒ Fixed face {0}
Erst einen Körper anklicken. ⇒ First click a body.
Mindestens eine feste Fläche anklicken. ⇒ Click at least one fixed face.
Mindestens eine Kraft auf eine Fläche setzen. ⇒ Put at least one force on a face.
Eine gewählte Fläche gibt es nicht mehr – neu anklicken. ⇒ A selected face no longer exists – click it again.
Diese Fläche gehört zu einem anderen Körper. Körper wechseln: „Körper wählen“. ⇒ This face belongs to another body. Change body: “Select body”.
Körper hinzufügen ⇒ Add body
Körper anklicken, der als weiterer Körper mitrechnet (angeschweißte Lasche, angesetzte Rippe). Noch einmal = entfernen. ⇒ Click a body that is computed along with the others (an attached lug, an added rib). Again = remove.
Dieser Körper ist der Hauptkörper der Studie. ⇒ This body is the main body of the study.
Diese Fläche gehört zu keinem Körper der Studie – „Körper hinzufügen“ nimmt ihn auf. ⇒ This face belongs to no body of the study – “Add body” includes it.
Ein weiterer Körper der Studie gehört nicht mehr zum Modell – entfernen. ⇒ Another body of the study no longer belongs to the model – remove it.
– (nicht mehr im Modell) ⇒ – (no longer in the model)
Weitere Körper ({0}) ⇒ Additional bodies ({0})
„{0}“ berührt keinen anderen Körper der Studie – ohne Kontakt löst die Rechnung nicht ⇒ “{0}” touches no other body of the study – without contact the calculation does not solve
Für die Wärmeanalyse gehört ein Werkstoff mit Wärmeleitfähigkeit dazu ⇒ The thermal analysis needs a material with thermal conductivity
Die Fläche hat keine feste Normale – Richtung ±X/±Y/±Z wählen. ⇒ The face has no fixed normal – choose direction ±X/±Y/±Z.
rechnet … {0} % ⇒ computing … {0} %
Größte Vergleichsspannung ⇒ Largest equivalent stress
Sicherheitsfaktor ⇒ Safety Factor
(Streckgrenze {0} MPa) ⇒ (yield strength {0} MPa)
{0} … {1} MPa (von Mises) ⇒ {0} … {1} MPa (von Mises)
Netz: {0} Würfel, Kante {1}, {2} Schritte, {3} s. Linear elastisch; Spitzen an scharfen Innenkanten und am Rand der festen Fläche sind Rechenspitzen und wachsen mit feinerem Netz. Schräge und runde Flächen sind im Netz Treppen – dort ist die Spannung ungenauer. Zur Vorbemessung. ⇒ Mesh: {0} cubes, edge {1}, {2} iterations, {3} s. Linear elastic; peaks at sharp inner edges and at the border of the fixed face are numerical peaks and grow with a finer mesh. Inclined and round faces are steps in the mesh – the stress is less accurate there. For preliminary design.
Würfel ⇒ Cubes
SF ⇒ SF
Kontakt ⇒ Contact
Berührungsflächen ⇒ Contact faces
Zwei Körper rechnen auf demselben Netz: wo sich ihre Würfel berühren, teilen sie sich die Knoten – die Verbindung ist fest, Kraft und Wärme gehen vollständig über. Ein Spalt oder Spiel dazwischen, Reibung oder ein Lösen unter Last werden nicht gerechnet; die Körper müssen sich berühren, sonst löst die Rechnung nicht. ⇒ Two bodies compute on the same mesh: where their cubes touch, they share the nodes – the connection is bonded, force and heat pass across completely. A gap or clearance between the bodies, friction or separation under load are not computed; the bodies must touch, otherwise the calculation does not solve.
Zwei Körper rechnen auf demselben Netz: wo sich ihre Würfel berühren, teilen sie sich die Knoten – die Verbindung ist fest, Kraft und Wärme gehen vollständig über. Ein Spalt oder Spiel dazwischen, Reibung oder ein Lösen unter Last werden nicht gerechnet; die Körper müssen sich berühren, sonst löst die Rechnung nicht. Würfel, die in mehr als einem Körper liegen (sich überschneidende Geometrie): {0}. ⇒ Two bodies compute on the same mesh: where their cubes touch, they share the nodes – the connection is bonded, force and heat pass across completely. A gap or clearance between the bodies, friction or separation under load are not computed; the bodies must touch, otherwise the calculation does not solve. Cubes that lie in more than one body (overlapping geometry): {0}.
Einrichtung geändert – neu berechnen. ⇒ Setup changed – compute again.
Berechnen ⇒ Compute
Das Netz ist leer – Körper zu dünn für die Netzfeinheit ⇒ The mesh is empty – body too thin for the mesh size
An der festen Fläche liegt kein Netzknoten – Netz feiner wählen ⇒ No mesh node lies at the fixed face – choose a finer mesh
An einer Lastfläche liegt kein Netzknoten – Netz feiner wählen ⇒ No mesh node lies at a load face – choose a finer mesh
Rechnung abgebrochen ⇒ Calculation aborted
Aluminium EN AW-6082 T6 ⇒ Aluminum EN AW-6082 T6
PLA (3D-Druck) ⇒ PLA (3D print)
PETG (3D-Druck) ⇒ PETG (3D print)
Nylon PA12 (3D-Druck) ⇒ Nylon PA12 (3D print)
An Fläche (Normale) ⇒ On face (normal)
Fläche für die Ausrichtung anklicken ⇒ Click the face for the orientation
Eine Fläche anklicken (eben oder gekrümmt). ⇒ Click a face (planar or curved).
Geometrische Anordnung an Punkten: an jeden einzelnen Punkt der Skizze kommt eine Kopie. Bezug ist der Punkt, der dem Original am nächsten liegt. „An Fläche“: die Punkte werden auf die Fläche gelegt (z. B. einen Zylinder) und die Kopien nach der Flächennormale gedreht. ⇒ Geometric pattern on points: a copy goes to every individual point of the sketch. The reference is the point nearest to the original. “On face”: the points are placed onto the face (e.g. a cylinder) and the copies rotated by the face normal.
Maßstabstyp ⇒ Scale type
Gleichmäßig ⇒ Uniform
Ungleichmäßig ⇒ Non-uniform
Faktor X ⇒ Factor X
Faktor Y ⇒ Factor Y
Faktor Z ⇒ Factor Z
Die Faktoren müssen größer als 0 sein ⇒ The factors must be greater than 0
Zu viele Dreiecke ({0}) für ungleichmäßiges Skalieren ⇒ Too many triangles ({0}) for non-uniform scaling
Ungleichmäßiges Skalieren: das Netz des Körpers ist nicht geschlossen ⇒ Non-uniform scale: the mesh of the body is not closed
ungleichmäßig {0} · facettierter Körper ⇒ non-uniform {0} · faceted body
Ungleichmäßig: je Achse ein eigener Faktor, der Bezugspunkt bleibt stehen. Der Körper wird dabei fein vernetzt und als Dreiecksnetz-Körper neu aufgebaut (wie ein STL-Import): Rundungen und Bohrungen werden facettiert, Abrunden oder Bohren daran geht nicht zuverlässig. {0} ⇒ Non-uniform: a separate factor per axis, the reference point stays in place. The body is finely meshed and rebuilt as a triangle-mesh body (like an STL import): rounds and holes become faceted, filleting or drilling on it is not reliable. {0}
Licht und Szene ⇒ Light and Scene
Lichtrichtung {0}° ⇒ Light direction {0}°
Lichtrichtung ⇒ Light direction
Lichthöhe ⇒ Light height
Helligkeit ⇒ Brightness
Umgebungslicht ⇒ Ambient light
Belichtung ⇒ Exposure
Schattenweichheit ⇒ Shadow softness
Eigener Hintergrund ⇒ Custom background
Licht zurücksetzen ⇒ Reset light
Wand {0} mm ≥ Rundungsradius: {1} Rundung innen scharf ⇒ Wall {0} mm ≥ fillet radius: {1} fillet sharp inside
Wand {0} mm ≥ Rundungsradius: {1} Rundungen innen scharf ⇒ Wall {0} mm ≥ fillet radius: {1} fillets sharp inside
Zapfen ⇒ Boss
Schnappverschluss ⇒ Snap Fit
Schnappverschlüsse ⇒ snap fits
Zapfen (Kunststoff: Schraubzapfen mit Loch und Rippen) ⇒ Boss (plastic: screw boss with hole and ribs)
Schnappverschluss (Kunststoff: Biegebalken mit Haken) ⇒ Snap Fit (plastic: cantilever with hook)
Außendurchmesser ⇒ Outer diameter
Formschräge ⇒ Draft
Loch ⇒ Hole
Ohne ⇒ None
Kernloch ⇒ Pilot hole
Durchgang ⇒ Through
Lochdurchmesser ⇒ Hole diameter
Lochtiefe ⇒ Hole depth
Rippen ⇒ Ribs
Rippendicke ⇒ Rib thickness
Rippenlänge ⇒ Rib length
Rippenhöhe ⇒ Rib height
Aus der Fläche ⇒ Out of the face
Balkenlänge ⇒ Beam length
Dicke ⇒ Thickness
Breite ⇒ Width
Hinterschnitt ⇒ Undercut
Einführwinkel ⇒ Insertion angle
Richtung des Hakens ⇒ Hook direction
{0} Zapfen ⇒ {0} boss(es)
{0} Schnappverschluss ⇒ {0} snap fit
{0} Schnappverschlüsse ⇒ {0} snap fits
Erst eine Skizze mit Punkten wählen. ⇒ Select a sketch with points first.
Erst eine Skizze auf der Fläche mit Punkten (oder Kreisen) für die Lage erstellen. ⇒ First create a sketch on the face with points (or circles) for the position.
Skizze mit Punkten wählen ⇒ Select a sketch with points
Braucht einen vorhandenen Körper (Skizze auf dessen Fläche) ⇒ Needs an existing body (sketch on its face)
Außendurchmesser und Höhe müssen größer als 0 sein ⇒ Outer diameter and height must be greater than 0
Das Loch ist größer als der Zapfen ⇒ The hole is larger than the boss
Formschräge zu groß für Höhe und Loch ⇒ Draft too large for height and hole
Dicke, Länge, Breite und Hinterschnitt müssen größer als 0 sein ⇒ Thickness, length, width and undercut must be greater than 0
Haken länger als der Balken – Einführwinkel größer oder Hinterschnitt kleiner ⇒ Hook longer than the beam – larger insertion angle or smaller undercut
Schraubzapfen für Kunststoffteile (3D-Druck, Spritzguss): je Skizzenpunkt ein Zapfen. Kernloch für selbstschneidende Schrauben (etwa 0,8 × Schrauben-⌀, z. B. ⌀ 2,5 für 3 mm), Durchgang für Schrauben von der anderen Seite. Rippen stützen den Zapfen am Fuß. ⇒ Screw bosses for plastic parts (3D printing, injection molding): one boss per sketch point. Pilot hole for self-tapping screws (about 0.8 × screw ⌀, e.g. ⌀ 2.5 for 3 mm), through hole for screws from the other side. Ribs support the boss at its base.
Schnappverschluss (Biegebalken mit Haken) je Skizzenpunkt: der Haken greift um den Hinterschnitt, die Einführschräge steht unter dem Einführwinkel zur Balkenachse, die Rastfläche quer. Richtung 0° = Skizzen-X. Faustregel 3D-Druck: Dehnung am Fuß ε ≈ 1,5 · t · Hinterschnitt / L² unter etwa 2–4 % halten. ⇒ Snap fit (cantilever with hook) per sketch point: the hook engages the undercut, the insertion ramp lies at the insertion angle to the beam axis, the retaining face is perpendicular. Direction 0° = sketch X. Rule of thumb for 3D printing: keep the strain at the root ε ≈ 1.5 · t · undercut / L² below about 2–4 %.
Fräsen ⇒ Milling
Gießen ⇒ Die Casting
Werkzeug von ⇒ Tool from
Entformungsachse ⇒ Pull axis
Fräsen · Werkzeug {0} ⇒ Milling · tool {0}
Gießen · Entformung {0} ⇒ Die casting · pull {0}
Hinterschnitte (Würfel) ⇒ Undercuts (voxels)
Hohlräume (Würfel) ⇒ Cavities (voxels)
Teil zerfällt in {0} Stücke – die Last erreicht die Halterung nicht. Andere Richtung, mehr Masse oder Startform wählen. ⇒ Part falls apart into {0} pieces – the load does not reach the constraint. Choose another direction, more mass or a starting shape.
Fertigung „Fräsen“: Das Werkzeug kommt aus der gewählten Richtung, also darf es keine Hinterschnitte geben – jede Spalte in Werkzeugrichtung ist von unten her voll (Höhenprofil, 3-Achsen-Fräsen von einer Seite). Mehrere Richtungen = je Richtung ein Ergebnis. ⇒ Like “Milling” manufacturing: the tool comes from the chosen direction, so there must be no undercuts – every column in tool direction is solid from the bottom (height field, 3-axis milling from one side). Several directions = one result per direction.
Fertigung „Gießen“ (Druckguss): Die Form wird entlang der Achse nach beiden Seiten abgezogen, also darf in keiner Spalte entlang der Achse ein Hohlraum zwischen Material liegen. Die Trennebene ergibt sich von selbst. Mehrere Achsen = je Achse ein Ergebnis. ⇒ Like “Die Casting” manufacturing: the mold is pulled off along the axis to both sides, so no column along the axis may have a cavity between material. The parting plane follows by itself. Several axes = one result per axis.
Fläche verschieben ⇒ Move Face
Fläche verschieben (verschieben, drehen oder bis zu einer Fläche) ⇒ Move Face (move, rotate or up to a face)
Flächen wählen ⇒ Select faces
Flächen anklicken … ⇒ Click faces …
{0} gewählt · Auswahl beenden ⇒ {0} selected · finish selection
{0} Fläche ✓ ⇒ {0} face ✓
{0} Flächen ✓ ⇒ {0} faces ✓
Bis Fläche ⇒ To Face
Zielfläche ⇒ Target face
Zielfläche wählen ⇒ Select target face
Ebene Fläche ✓ ⇒ Planar face ✓
Kante oder Achse wählen ⇒ Select edge or axis
Verschiebung ⇒ Offset
Erst Flächen anklicken. ⇒ Click faces first.
Erst eine Drehachse anklicken. ⇒ Click a rotation axis first.
Erst eine Zielfläche anklicken. ⇒ Click a target face first.
Ebene Flächen oder Zylinderflächen anklicken. ⇒ Click planar or cylindrical faces.
Eine ebene Fläche als Ziel anklicken. ⇒ Click a planar face as target.
Flächen anklicken ⇒ Click faces
Drehachse wählen (Kante oder Achse) ⇒ Select rotation axis (edge or axis)
Zielfläche wählen ⇒ Select target face
Die neue Lage steht zu schräg zur Fläche (fast senkrecht) ⇒ The new position is too oblique to the face (almost perpendicular)
Zylinderflächen (Bohrungen, Zapfen) lassen sich nur verschieben ⇒ Cylindrical faces (holes, bosses) can only be moved
Fläche verschieben geht mit ebenen Flächen und Zylinderflächen ⇒ Move Face works with planar and cylindrical faces
Verschiebung ist 0 ⇒ Offset is 0
keine Änderung ⇒ no change
Ebene Flächen wandern um den Anteil der Verschiebung entlang ihrer Normalen. Zylinderflächen (Bohrungen, Zapfen) wandern als Ganzes – praktisch für importierte Teile ohne Zeitleiste. Nachbarflächen werden senkrecht zur Fläche verlängert oder gekürzt. ⇒ Planar faces move by the component of the offset along their normal. Cylindrical faces (holes, bosses) move as a whole – handy for imported parts without a timeline. Neighboring faces are extended or trimmed perpendicular to the face.
Die ebenen Flächen drehen sich um die Achse (Kante, Kreismitte oder Arbeitsachse), die Nachbarflächen laufen bis zur neuen Lage weiter. Nachbarflächen werden senkrecht zur Fläche verlängert oder gekürzt. ⇒ The planar faces rotate about the axis (edge, circle center or work axis); neighboring faces continue up to the new position. Neighboring faces are extended or trimmed perpendicular to the face.
Die ebenen Flächen wandern auf die Ebene der Zielfläche – auch schräg. Nachbarflächen werden senkrecht zur Fläche verlängert oder gekürzt. ⇒ The planar faces move onto the plane of the target face – also oblique. Neighboring faces are extended or trimmed perpendicular to the face.
Bewegungsverknüpfung ⇒ Motion Link
Bewegungsverknüpfung (ein Gelenk treibt ein anderes) ⇒ Motion Link (one joint drives another)
Gelenk 1 ⇒ Joint 1
Gelenk 2 ⇒ Joint 2
Wert 1 ⇒ Value 1
Wert 2 ⇒ Value 2
Bewegung ⇒ Motion
Zwei verschiedene Gelenke wählen. ⇒ Select two different joints.
Zwei verschiedene Gelenke wählen ⇒ Select two different joints
Zwei Gelenke wählen ⇒ Select two joints
Wert 1 darf nicht 0 sein ⇒ Value 1 must not be 0
Gelenk 2 bewegt sich mit Gelenk 1: Wert 1 an Gelenk 1 ergibt Wert 2 an Gelenk 2 (z. B. Ritzel 360° ↔ Zahnstange 10 mm, Zahnräder 20 ↔ 40 Zähne als 360° ↔ 180°). Gilt im Modell, beim Abspielen und in der Bewegungsstudie. ⇒ Joint 2 moves with joint 1: value 1 at joint 1 gives value 2 at joint 2 (e.g. pinion 360° ↔ rack 10 mm, gears 20 ↔ 40 teeth as 360° ↔ 180°). Applies in the model, when playing and in the motion study.
Bewegungsstudie ⇒ Motion Study
Bewegungsstudie (Gelenke nach Zeitplan bewegen, Kollision prüfen) ⇒ Motion Study (move joints on a schedule, check collisions)
Gelenke ⇒ Joints
Verschiebung u ⇒ Offset u
Verschiebung v ⇒ Offset v
Planar ⇒ Planar
Schritte ⇒ Steps
Dauer ⇒ Duration
Zeit ⇒ Time
Kollision prüfen ⇒ Check collision
+ Stützstelle ⇒ + Keyframe
Stützstelle entfernen ⇒ Remove keyframe
jetzt {0} {1} ⇒ now {0} {1}
Schritt {0} von {1} · {2} % ⇒ Step {0} of {1} · {2} %
Schritte werden gebaut … {0} von {1} ⇒ Building steps … {0} of {1}
Kollision prüfen … Schritt {0} von {1} ⇒ Checking collision … step {0} of {1}
Kollision in einem Bereich (rot): ⇒ Collision in one range (red):
Kollision in {0} Bereichen (rot): ⇒ Collision in {0} ranges (red):
Schritt {0}–{1} ⇒ Steps {0}–{1}
Schritt {0} ⇒ Step {0}
Keine Kollision in {0} Schritten. ⇒ No collision in {0} steps.
Schritt ließ sich nicht bauen ⇒ Step could not be built
Für eine Bewegungsstudie braucht es ein bewegliches Gelenk (Drehgelenk, Schieber …). ⇒ A motion study needs a movable joint (revolute, slider …).
Je Gelenk und Freiheitsgrad eine Spur: Stützstellen Zeit → Wert, dazwischen linear. Die Schritte werden einmal gebaut und dann flüssig abgespielt; Grenzen der Gelenke gelten weiter. „Kollision prüfen“ rechnet jeden Schritt wie Prüfen → Kollision (Berührungen zählen nicht). ⇒ One track per joint and degree of freedom: keyframes time → value, linear in between. The steps are built once and then played back smoothly; joint limits still apply. “Check collision” computes every step like Inspect → Interference (touching does not count).
Ähnliche Komponenten suchen ⇒ Find Similar Components
Ähnliche Komponenten suchen (gleiche oder ähnliche Teile markieren) ⇒ Find Similar Components (highlight identical or similar parts)
Vergleichen ⇒ Compare
Übereinstimmung ⇒ Match
Ähnlich ⇒ Similar
gleich ⇒ identical
Abweichung höchstens ⇒ Maximum deviation
Formen werden verglichen … ⇒ Comparing shapes …
Komponente im Modell anklicken. ⇒ Click a component in the model.
Körper im Modell anklicken. ⇒ Click a body in the model.
{0} gleiche Komponenten (orange): ⇒ {0} identical components (orange):
{0} gleiche Komponente (orange): ⇒ {0} identical component (orange):
{0} ähnliche Komponenten (orange): ⇒ {0} similar components (orange):
{0} ähnliche Komponente (orange): ⇒ {0} similar component (orange):
{0} gleiche Körper (orange): ⇒ {0} identical bodies (orange):
{0} gleicher Körper (orange): ⇒ {0} identical body (orange):
{0} ähnliche Körper (orange): ⇒ {0} similar bodies (orange):
{0} ähnlicher Körper (orange): ⇒ {0} similar body (orange):
Keine gleichen Komponenten gefunden. ⇒ No identical components found.
Keine ähnlichen Komponenten gefunden. ⇒ No similar components found.
Keine gleichen Körper gefunden. ⇒ No identical bodies found.
Keine ähnlichen Körper gefunden. ⇒ No similar bodies found.
{0} % · andere Flächen ⇒ {0} % · different faces
gleich · andere Flächen ⇒ identical · different faces
Verglichen werden Volumen, Oberfläche und die Hauptträgheitsmomente – Lage und Drehung spielen keine Rolle. „Gleich“: höchstens 0,1 % Abweichung und gleich viele Flächen und Kanten. Eine Komponente gleicht einer anderen, wenn ihre Körper paarweise passen. ⇒ Volume, surface area and the principal moments of inertia are compared – position and rotation do not matter. “Identical”: at most 0.1 % deviation and the same number of faces and edges. A component matches another one if their bodies match pairwise.
Additiv ⇒ Additive
Druckrichtung ⇒ Print direction
Überhangwinkel ⇒ Overhang angle
Ungestützte Würfel ⇒ Unsupported voxels
Additiv · {0}, {1}° ⇒ Additive · {0}, {1}°
Fertigung „Additiv“: Die Form wird so verteilt, dass sie ohne Stützen druckbar ist – jede Unterseite steigt mindestens unter dem Überhangwinkel gegen die Druckplatte an (45° üblich für FDM). Die Druckplatte liegt an der Unterseite des Entwurfsbereichs, gegen die Druckrichtung. Beibehalten-Körper zählen als gestützt. Meist etwas weicher als „Uneingeschränkt“. Mehrere Druckrichtungen wählen = je Richtung ein Ergebnis zum Vergleichen. ⇒ Like “Additive” manufacturing: the shape is distributed so that it prints without supports – every downward face rises at least at the overhang angle against the build plate (45° is common for FDM). The build plate lies at the bottom of the design space, against the print direction. Preserve bodies count as supported. Usually somewhat softer than “Unrestricted”. Select several print directions = one result per direction to compare.
{0} von {1} Ergebnissen fertig ⇒ {0} of {1} results done
{0} von {1} Ergebnis fertig ⇒ {0} of {1} result done
Tangentengriff ⇒ Tangent handle
Griff entfernen ⇒ Remove handle
Griff entfernt ⇒ Handle removed
Tangentengriff am gewählten Stützpunkt: Richtung und Länge der Kurve dort, bemaßbar und mit Bedingungen ⇒ Tangent handle at the selected fit point: direction and length of the curve there, dimensionable and constrainable
Einen Stützpunkt eines Splines wählen. ⇒ Select a fit point of a spline.
Ein Spline wird an einem Stützpunkt tangential: Stützpunkt erst auf die andere Kurve legen oder mit ihr verbinden. ⇒ A spline becomes tangent at a fit point: first place the fit point on the other curve or connect it.
{0}° {1} Kegel ⇒ {0}° {1} cone
Uneingeschränkt (3D) ⇒ Unrestricted (3D)
räumlich, Rasterweite {0} ⇒ spatial, grid spacing {0}
Generatives Design (3D) ⇒ Generative Design (3D)
Kraft {0} N {1} ⇒ Force {0} N {1}
Kraft {0} N ({1} | {2} | {3}) ⇒ Force {0} N ({1} | {2} | {3})
Fertigung „Uneingeschränkt“: Das Material wird im Raum verteilt (Würfelnetz, automatisch etwa 8000 Würfel, je Material etwa eine halbe bis einige Minuten). Das Ergebnis ist eine geglättete Freiform für 3D-Druck oder Guss, ein Netzkörper wie ein STL-Import. Die Beibehalten-Körper bleiben exakt (Bohrungen) und werden mit der Freiform vereinigt. ⇒ Like “Unrestricted” manufacturing: material is distributed in space (voxel mesh, about 8000 voxels automatically, roughly half a minute to a few minutes per material). The result is a smoothed freeform for 3D printing or casting, a mesh body like an STL import. Preserve bodies stay exact (holes) and are united with the freeform.
„Konstruktion erstellen“ legt die Freiform als Netzkörper in die Zeitleiste, vereinigt mit den exakten Beibehalten-Körpern (Hindernisse abgezogen), und blendet Startform und Beibehalten-Körper aus. Das Ergebnis ist auch im Modell zu sehen. ⇒ “Create Design” puts the freeform into the timeline as a mesh body, united with the exact preserve bodies (obstacles subtracted), and hides the starting shape and preserve bodies. The result is also shown in the model.
Ergebnis als Konstruktion angelegt (Netzkörper). Die Beibehalten-Körper bleiben eigene Körper – zum Verbinden „Kombinieren“. ⇒ Result created as design (mesh body). Preserve bodies remain separate bodies – use “Combine” to join them.
Zum Körper {0} gibt es kein Netz. ⇒ Body {0} has no mesh.
Eine gewählte Fläche an {0} gibt es nicht mehr – neu anklicken. ⇒ A selected face on {0} no longer exists – click it again.
Die Rasterweite {0} mm ergibt über 60 000 Würfel – größer wählen. ⇒ Grid spacing {0} mm gives more than 60,000 voxels – choose a larger one.
{0}: Steifigkeit maximieren – {1} % ⇒ {0}: Maximize stiffness – {1} %
{0}: Masse minimieren, Versuch {1} – {2} % ⇒ {0}: Minimize mass, attempt {1} – {2} %
Der Entwurfsbereich ist leer ⇒ The design space is empty
An den festen Flächen liegt kein Netzknoten ⇒ No mesh node lies at the fixed faces
Das Ergebnis enthält kein Dichtefeld ⇒ The result contains no density field
Das Dichtefeld passt nicht zum Raster ⇒ The density field does not match the grid
Das Ergebnis ist leer ⇒ The result is empty
Zu viele Dreiecke ({0}) – Rasterweite größer wählen ⇒ Too many triangles ({0}) – choose a larger grid spacing
Die Oberfläche ist nicht geschlossen ⇒ The surface is not closed
Hindernis nicht abgezogen ⇒ Obstacle not subtracted
{0} · Netzkörper, {1} Dreiecke ⇒ {0} · mesh body, {1} triangles
Kunststoffregel (Werkstoff, Wanddicke, Formschräge, Radius, Spiel – verknüpft) ⇒ Plastic Rule (material, wall thickness, draft, radius, clearance – linked)
Kunststoffregel ⇒ Plastic Rule
Rundungsradius ⇒ Fillet radius
Spiel (Lippe/Absatz) ⇒ Clearance (lip/groove)
Werkstoff allen Körpern zuweisen ⇒ Assign material to all bodies
Kunststoffregeln: die Werte stehen als Parameter kst_wand, kst_schraege, kst_radius, kst_spiel im Dokument. Neue Schalen, Zapfen, Schnappverschlüsse, Lippen, Formschrägen und Rundungen übernehmen sie verknüpft – eine Änderung der Regel passt alle an. Werkstoffwechsel setzt die Startwerte des Werkstoffs. ⇒ Plastic rules: the values are stored as parameters kst_wand, kst_schraege, kst_radius, kst_spiel in the document. New shells, bosses, snap fits, lips, drafts and fillets take them over linked – changing the rule updates all of them. Changing the material sets that material’s starting values.
Die Wanddicke muss größer als 0 sein. ⇒ The wall thickness must be greater than 0.
Kunststoffregel gespeichert – nicht übernommen: {0} ⇒ Plastic rule saved – not applied: {0}
Kunststoffregel gespeichert. Verknüpfte Features passen sich an. ⇒ Plastic rule saved. Linked features update.
Kunststoffregel: Wanddicke ⇒ Plastic rule: wall thickness
Kunststoffregel: Formschräge ⇒ Plastic rule: draft
Kunststoffregel: Rundungsradius ⇒ Plastic rule: fillet radius
Kunststoffregel: Spiel (Lippe/Absatz) ⇒ Plastic rule: clearance (lip/groove)
Antriebsgelenke (Gelenke auf Werte fahren) ⇒ Drive Joints (move joints to values)
Antriebsgelenke ⇒ Drive Joints
Es gibt kein bewegliches Gelenk (Drehgelenk, Schieber …). ⇒ There is no movable joint (revolute, slider …).
Antriebsgelenke: Wert eingeben, die Baugruppe bewegt sich dorthin. Grenzen der Gelenke gelten, aktive Kontaktsätze halten das Gelenk an der Berührung an. Abbrechen stellt den vorigen Stand her. ⇒ Drive Joints: enter a value and the assembly moves there. Joint limits apply, active contact sets stop the joint at the contact. Cancel restores the previous state.
Umgebungsbild ⇒ Environment image
Umgebungsbild: {0} ⇒ Environment image: {0}
Eigenes Bild als Licht und Spiegelung: Panorama 2 : 1 als HDR, JPG oder PNG. ⇒ Your own image as lighting and reflection: 2 : 1 panorama as HDR, JPG or PNG.
Kein eigenes Bild – Studio-Umgebung. ⇒ No custom image – studio environment.
Als Hintergrund zeigen ⇒ Show as background
Bilddrehung {0}° ⇒ Image rotation {0}°
Bilddrehung ⇒ Image rotation
Bild entfernen ⇒ Remove image
Bild lässt sich nicht lesen ⇒ The image cannot be read
Keine Radiance-HDR-Datei ⇒ Not a Radiance HDR file
HDR-Kopf unvollständig ⇒ HDR header incomplete
Nur RGBE-Bilder ⇒ Only RGBE images
Nur HDR-Bilder mit Zeilen von oben nach unten (-Y … +X …) ⇒ Only HDR images with rows from top to bottom (-Y … +X …)
HDR-Zeile beschädigt ⇒ HDR scanline damaged
Fläche gewählt ⇒ Face selected
ebene Blechfläche anklicken … ⇒ click a planar sheet metal face …
Fläche: die Blechwand hinter der angeklickten ebenen Fläche wird entfernt, die Nachbarwände enden stumpf – das Teil ist an allen Kanten dieser Fläche aufgetrennt. Die Dicke nimmt das Programm von der Gegenfläche. Vorschau nach OK. ⇒ Face: the sheet metal wall behind the clicked planar face is removed, the neighboring walls end butted – the part is ripped along all edges of that face. The thickness is taken from the opposite face. Preview after OK.
Für die Flächenauftrennung eine ebene Blechfläche anklicken. ⇒ For a face rip, click a planar sheet metal face.
Erst eine ebene Blechfläche anklicken. ⇒ First click a planar sheet metal face.
Ebene Blechfläche anklicken ⇒ Click a planar sheet metal face
Die Fläche muss eben sein ⇒ The face must be planar
Wand an der Fläche entfernt ({0} mm², Dicke {1} mm, −{2} mm³) ⇒ Wall at the face removed ({0} mm², thickness {1} mm, −{2} mm³)
Automatisch explodieren ⇒ Auto Explode
Storyboard (eigene Schritte) ⇒ Storyboard (custom steps)
Schritt entfernen ⇒ Remove step
+ Schritt ⇒ + Step
Storyboard Animation: die Schritte laufen nacheinander, jeder verschiebt eine Komponente (oder einen losen Körper) um X/Y/Z in der angegebenen Dauer. Gespeichert im Dokument, nur Anzeige. ⇒ Storyboard Animation: the steps run one after another, each moves a component (or a loose body) by X/Y/Z over the given duration. Saved in the document, display only.
Umgebungs-Map an mit dem eigenen Bild „{0}“ aus Rendern. Noch einmal wählen zum Ausschalten. ⇒ Environment map on with your own image “{0}” from Render. Choose again to turn off.
Gewählte Linien, Bögen und Kreise zu Konstruktionsgeometrie machen oder zurück (X) ⇒ Turn the selected lines, arcs and circles into construction geometry or back (X)
Normal/Konstruktion (X) ⇒ Normal/Construction (X)
Erst Linien, Bögen oder Kreise der Skizze wählen. ⇒ First select lines, arcs or circles of the sketch.
Abwicklung erstellen: die feste ebene Fläche des Blechteils anklicken und OK – danach erscheint die Abwicklung. ⇒ Create Flat Pattern: click the stationary planar face of the sheet metal part and OK – the flat pattern appears afterwards.
Abwicklung nicht möglich: {0} ⇒ Flat pattern not possible: {0}
Der Körper ist kein Blech gleicher Dicke: die Abwicklung erfasst {0} % seines Volumens. Nur Körper aus einem Blech lassen sich abwickeln (Schweißteile vorher mit „Körper teilen“ trennen). ⇒ The body is not a sheet of uniform thickness: the flat pattern covers {0} % of its volume. Only bodies made from one sheet can be unfolded (split weldments first with “Split Body”).
Alle Blechteile abwickeln (DXF-Paket für den Laser) ⇒ Unfold All Sheet Metal Parts (DXF package for the laser)
Alle Blechteile abwickeln ⇒ Unfold All Sheet Metal Parts
Es gibt keinen sichtbaren Körper. ⇒ There is no visible body.
Suche Blechteile in {0} Körper{1} … ⇒ Searching for sheet metal parts in {0} bod{1:ies|y} …
Abwickeln nicht möglich: {0} ⇒ Unfolding not possible: {0}
{0} verschiedene Blechteile ({1} Stück) ⇒ {0} different sheet metal parts ({1} pieces)
Kein Blechteil gefunden ⇒ No sheet metal part found
· {0} Körper sind keine Bleche ⇒ · {0} bodies are not sheet metal
Feste Fläche ist jeweils die größte ebene Fläche, K-Faktor {0} aus der Blechregel. ⇒ The stationary face is always the largest planar face, K-factor {0} from the sheet metal rule.
Dicke bis ⇒ Thickness up to
Teil ⇒ Part
Stk. ⇒ Qty
Dicke ⇒ Thickness
Abwicklung ⇒ Flat pattern
Biegungen ⇒ Bends
Ansehen ⇒ View
Keine Bleche ({0}) ⇒ Not sheet metal ({0})
Die ZIP enthält je Teil eine DXF (Dateiname mit Dicke und Stückzahl) und eine Liste als CSV – die DXF-Einstellungen gelten. ⇒ The ZIP contains one DXF per part (file name with thickness and quantity) and a list as CSV – the DXF settings apply.
ZIP speichern ⇒ Save ZIP
Kein Teil ausgewählt. ⇒ No part selected.
{0} Abwicklung{1} als DXF gespeichert. ⇒ {0} flat pattern{1:s} saved as DXF.
Freiformflächen ⇒ freeform faces
keine ebene Fläche ⇒ no planar face
kein Blech gleicher Dicke ({0} %) ⇒ not a sheet of uniform thickness ({0} %)
dicker als {0} mm ({1} mm) ⇒ thicker than {0} mm ({1} mm)
Block, kein Blech ({0} mm bei {1} mm Breite) ⇒ block, not sheet metal ({0} mm at {1} mm width)
Ausgewählte Teile mit Stückzahl auf Tafeln legen – je Dicke eine Tafelgruppe ⇒ Place the selected parts with quantities on sheets – one sheet group per thickness
In Verschachtelung ⇒ To Nesting
Teilebeschriftung (Gravur) ⇒ Part labels (engraving)
Teile beschriften (Name, Dicke, Stückzahl als Text auf eigenem Layer, z. B. zum Markieren) ⇒ Label parts (name, thickness, quantity as text on its own layer, e.g. for marking)
Werkstoff je Dicke ⇒ Material per thickness
So weit geht es nicht: die schrägen Nachbarflächen laufen vorher zusammen ⇒ That's too far: the sloped neighboring faces meet before that
Ansicht (Kamerafahrt) ⇒ View (camera move)
Die jetzige Ansicht für diesen Schritt übernehmen ⇒ Use the current view for this step
Ansicht übernehmen ⇒ Use current view
Drehung um die Achse durch die Mitte ⇒ Rotation about the axis through the center
um ⇒ about
+ Ansicht ⇒ + View
Kamerafahrt zur jetzigen Ansicht ⇒ Camera move to the current view
Storyboard Animation: die Schritte laufen nacheinander, jeder verschiebt eine Komponente (oder einen losen Körper) um X/Y/Z und dreht sie um eine Achse durch ihre Mitte. „Ansicht“ fährt die Kamera zur gespeicherten Ansicht. Gespeichert im Dokument, nur Anzeige. ⇒ Storyboard Animation: the steps run one after another, each moves a component (or a loose body) by X/Y/Z and rotates it about an axis through its center. “View” moves the camera to the stored view. Saved in the document, display only.
„{0}“ ist eine Instanz von „{1}“. Bitte am Original ändern (Rechtsklick → Bearbeiten), das gilt dann für alle Einbauten. ⇒ “{0}” is an instance of “{1}”. Please change the original (right-click → Edit); that then applies to all occurrences.
„{0}“ ist eine Instanz von „{1}“ – bearbeitet wird das Original, Änderungen gelten für alle Einbauten. ⇒ “{0}” is an instance of “{1}” – the original is edited, changes apply to all occurrences.
Instanz – Änderungen am Original gelten auch hier ⇒ Instance – changes to the original apply here too
{0} · Instanz von {1} · Rechtsklick für Befehle ⇒ {0} · instance of {1} · right-click for commands
Als eigenes Teil speichern … ⇒ Save as Separate Part …
Als eigenes Teil speichern nicht möglich: {0} ⇒ Saving as a separate part not possible: {0}
„{0}“ als {1} gespeichert (Download). ⇒ “{0}” saved as {1} (download).
„{0}“ ist als eigenes Teil gespeichert ({1}). Jetzt öffnen? ⇒ “{0}” is saved as a separate part ({1}). Open it now?
Die Komponente hat keinen Körper ⇒ The component has no body
Aufkleber ⇒ Decal
Bild (PNG mit Transparenz oder JPG) wählen, dann auf eine Fläche des Modells klicken. ⇒ Choose an image (PNG with transparency or JPG), then click a face of the model.
„{0}“ gewählt – jetzt auf eine Fläche klicken. ⇒ “{0}” selected – now click a face.
Noch kein Aufkleber. ⇒ No decal yet.
Aufkleber entfernen ⇒ Remove decal
Kein Körper unter dem Zeiger – bitte auf eine Fläche klicken. ⇒ No body under the pointer – please click a face.
Das Bild ist größer als 3 MB – bitte verkleinern (es wird im Dokument gespeichert). ⇒ The image is larger than 3 MB – please make it smaller (it is stored in the document).
Perspektive (Fluchtpunkt) ⇒ Perspective (vanishing point)
Rechts dreht: rechte Maustaste ziehen dreht, Umschalt + rechts oder mittlere Maustaste verschiebt, Mausrad zoomt. Rechtsklick ohne Ziehen öffnet weiter das Markierungsmenü. Befehlstasten wie bei „Standard“. ⇒ Right orbits: right-drag orbits, Shift + right or middle mouse button pans, mouse wheel zooms. A right-click without dragging still opens the marking menu. Command keys as in “Standard”.
Alt + Umschalt: Alt + Umschalt + linke Maustaste dreht, Alt + Umschalt + Mitte verschiebt, Alt + Umschalt + rechts zoomt, Mausrad zoomt. Befehlstasten wie bei „Standard“. ⇒ Alt + Shift: Alt + Shift + left mouse button orbits, Alt + Shift + middle pans, Alt + Shift + right zooms, mouse wheel zooms. Command keys as in “Standard”.
Mitte dreht, Umschalt verschiebt: mittlere Maustaste dreht, Umschalt + Mitte verschiebt, Strg + Mitte oder Mausrad zoomt. Befehlstasten wie bei „Standard“. ⇒ Middle orbits, Shift pans: middle mouse button orbits, Shift + middle pans, Ctrl + middle or mouse wheel zooms. Command keys as in “Standard”.
Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Rechts ziehen dreht, Mitte oder Umschalt + rechts verschiebt, Rad zoomt, Rechtsklick öffnet das Markierungsmenü, S sucht Befehle. ⇒ Click selects faces and edges, a window or Alt-drag selects edges. Right-drag orbits, middle or Shift + right pans, wheel zooms, right-click opens the marking menu, S searches commands.
Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Alt + Umschalt + links/Mitte/rechts dreht/verschiebt/zoomt, Rad zoomt, S sucht Befehle. ⇒ Click selects faces and edges, a window or Alt-drag selects edges. Alt + Shift + left/middle/right orbits/pans/zooms, wheel zooms, S searches commands.
Klick wählt Flächen und Kanten, Rahmen oder Alt-Zug wählt Kanten. Mitte dreht, Umschalt + Mitte verschiebt, Strg + Mitte oder Rad zoomt, S sucht Befehle. ⇒ Click selects faces and edges, a window or Alt-drag selects edges. Middle orbits, Shift + middle pans, Ctrl + middle or wheel zooms, S searches commands.
Orbit (rechte Maustaste ziehen) ⇒ Orbit (right-drag)
Orbit (Alt + Umschalt + linke Maustaste) ⇒ Orbit (Alt + Shift + left mouse button)
Verschieben (Alt + Umschalt + mittlere Maustaste) ⇒ Pan (Alt + Shift + middle mouse button)
Verschieben (Umschalt + mittlere Maustaste) ⇒ Pan (Shift + middle mouse button)
Zoom (Mausrad, Alt + Umschalt + rechte Maustaste) ⇒ Zoom (mouse wheel, Alt + Shift + right mouse button)
Zoom (Mausrad, Strg + mittlere Maustaste) ⇒ Zoom (mouse wheel, Ctrl + middle mouse button)
Einheit dieses Dokuments für Anzeige und Eingabe; neue Dokumente nehmen die Einheit aus den Einstellungen ⇒ Unit of this document for display and input; new documents use the unit from the preferences
Einheiten des Dokuments ⇒ Document units
Erst den laufenden Befehl abschließen, dann die Einheit ändern. ⇒ Finish the active command first, then change the unit.
Einheiten des Dokuments: {0}. Werte bleiben gleich, nur die Anzeige rechnet um. ⇒ Document units: {0}. Values stay the same, only the display converts.
Die Längeneinheit gilt für neue Dokumente. Ein Dokument kann im Browser unter Dokumenteinstellungen → Einheiten eine eigene haben, die beim Öffnen wieder gilt. ⇒ The length unit applies to new documents. A document can have its own in the browser under Document Settings → Units, which applies again when it is opened.
Körper teilen: der Körper wird an seiner Silhouette in zwei Körper getrennt (z. B. zwei Formhälften), auch Hohl- und Schalenkörper. Liegt die Trennlinie in einer Ebene, teilt diese Ebene; sonst eine gekrümmte Trennfläche durch die Linie zwischen den zur Blickrichtung hin und weg gewandten Flächen. ⇒ Split Body: the body is split at its silhouette into two bodies (e.g. two mold halves), shelled and hollow bodies too. If the parting line is planar, that plane splits; otherwise a curved split surface through the line between faces facing toward and away from the view direction.
Keine Trennlinie zwischen zu- und abgewandten Flächen – „Flächen teilen“ zeigt die Umrisslinie ⇒ No parting line between faces facing toward and away – “Split Faces” shows the silhouette
Die Trennlinie ist nicht geschlossen – „Körper teilen“ geht hier nicht, „Flächen teilen“ schon ⇒ The parting line is not closed – “Split Body” does not work here, “Split Faces” does
Die Trennlinie ist mehrfach verschachtelt – das geht noch nicht ⇒ The parting line is nested several times – not supported yet
Mehr als ein Hohlraum in einer Trennlinie – das geht noch nicht ⇒ More than one cavity inside a parting line – not supported yet
Teilen an der gekrümmten Trennfläche ist fehlgeschlagen ⇒ Splitting at the curved split surface failed
Die gekrümmte Trennfläche teilt den Körper nicht ⇒ The curved split surface does not split the body
Modalfrequenzen ⇒ Modal Frequencies
Statische Spannung ⇒ Static Stress
Eigenform ⇒ Mode
Frequenz Hz ⇒ Frequency Hz
ω 1/s ⇒ ω 1/s
Lager ({0}) ⇒ Supports ({0})
Blau: Eigenform {0} (Zeile anklicken), größte Auslenkung auf {1} mm gezeichnet – die Größe einer Eigenform ist beliebig, nur ihre Gestalt zählt. Gerechnet mit konsistenter Massenmatrix (Stabmasse aus Profil und Werkstoff), jeder Stab in mindestens 8 Abschnitten, Knoten biegesteif. Lasten zählen hier nicht; Zusatzmassen (Bleche, Anbauteile) fehlen – die echten Frequenzen liegen dann tiefer. ⇒ Blue: mode shape {0} (click a row), largest deflection drawn at {1} mm – the size of a mode shape is arbitrary, only its form matters. Computed with a consistent mass matrix (member mass from profile and material), each member in at least 8 segments, rigid joints. Loads do not count here; added masses (sheets, attachments) are missing – real frequencies are then lower.
Keine Eigenform gefunden. ⇒ No mode shape found.
Alles ist gelagert – nichts kann schwingen ⇒ Everything is supported – nothing can vibrate
Als Skizze bearbeiten ⇒ Edit as Sketch
Die Abwicklung als Skizze neben das Modell legen: Konturen ändern, Löcher oder Gravuren ergänzen, dann im Browser über die Skizze als DXF speichern ⇒ Place the flat pattern as a sketch next to the model: change contours, add holes or engravings, then save as DXF from the sketch in the browser
Abwicklung als Skizze rechts neben dem Modell: ändern, ergänzen, dann „Skizze fertig“ und im Browser per Rechtsklick auf die Skizze als DXF speichern. ⇒ Flat pattern as a sketch to the right of the model: edit, add, then “Finish Sketch” and save as DXF by right-clicking the sketch in the browser.
Die Skizze hat keine geschlossene Kontur. ⇒ The sketch has no closed contour.
{0} als DXF gespeichert (Außenkonturen {1}, Ausschnitte {2}, Biegelinien {3}). ⇒ {0} saved as DXF (outer contours {1}, cutouts {2}, bend lines {3}).
{0} als DXF gespeichert (Außenkonturen {1}, Ausschnitte {2}, Biegelinien {3}). Offene Züge, nicht ausgegeben: {4}. ⇒ {0} saved as DXF (outer contours {1}, cutouts {2}, bend lines {3}). Open chains, not written: {4}.
Als Skizze und Extrusion aufbauen ⇒ Rebuild as Sketch and Extrude
Erkennt eine Extrusion (Platte, Profil mit Bohrungen) und baut sie als Skizze + Extrusion in der Zeitleiste neu auf ⇒ Recognizes an extrusion (plate, profile with holes) and rebuilds it as sketch + extrude in the timeline
{0}: als Skizze ({1} Kurven) und Extrusion {2} aufgebaut – Maße und Dicke jetzt in der Zeitleiste änderbar. ⇒ {0}: rebuilt as sketch ({1} curves) and extrude {2} – dimensions and thickness can now be changed in the timeline.
Der Körper ist keine einfache Extrusion (zwei parallele Deckflächen, alle Wände senkrecht dazu) – für Blechteile „In Blech umwandeln“ nutzen, sonst direkt bearbeiten (Drücken/Ziehen, Fläche verschieben) ⇒ The body is not a simple extrusion (two parallel end faces, all walls perpendicular to them) – for sheet metal parts use “Convert to Sheet Metal”, otherwise edit directly (Press Pull, Move Face)
Ergebnis als Konstruktion angelegt: Freiform mit den exakten Beibehalten-Körpern vereinigt, Hindernisse abgezogen. ⇒ Result created as a design: freeform united with the exact preserve bodies, obstacles subtracted.
Durch Grundkörper ersetzen … ⇒ Replace with Primitive …
Das Feature, das diesen Körper erzeugt, durch einen Grundkörper (Quader, Zylinder, Kugel, Torus) ersetzen – alle folgenden Features bauen sich daran neu auf ⇒ Replace the feature that created this body with a primitive (box, cylinder, sphere, torus) – all later features rebuild on it
Der Grundkörper steht an der Stelle des bisherigen Körpers – mit OK ersetzen. Danach bauen sich alle folgenden Features neu auf. ⇒ The primitive takes the place of the current body – press OK to replace it. All later features then rebuild on it.
Dieser Körper kommt nicht aus einem Feature der Zeitleiste – bei eingelesenen Teilen zuerst „Als Skizze und Extrusion aufbauen“. ⇒ This body does not come from a timeline feature – for imported parts use “Rebuild as Sketch and Extrude” first.
Der Körper ist nicht vermessbar: ⇒ The body cannot be measured:
Als Blechteil aufbauen ⇒ Rebuild as Sheet Metal Part
Gebogenes Blechteil als Grundlasche und Biegungen neu aufbauen: Kontur, Ausschnitte, Biegewinkel und Radien in der Zeitleiste änderbar ⇒ Rebuild a bent sheet metal part as base flange and bends: contour, cutouts, bend angles and radii editable in the timeline
Als Blechteil nicht möglich: {0} ⇒ Not possible as a sheet metal part: {0}
Das Teil hat keine Biegungen – „Als Skizze und Extrusion aufbauen“ passt besser. ⇒ The part has no bends – “Rebuild as Sketch and Extrude” fits better.
Als Blechteil nicht sauber nachbaubar ({0}) – zurückgenommen. „In Blech umwandeln“ wickelt es trotzdem ab. ⇒ Cannot be rebuilt cleanly as a sheet metal part ({0}) – undone. “Convert to Sheet Metal” still unfolds it.
Volumen {0} % des Teils ⇒ volume {0} % of the part
{0}: als Grundlasche und {1} Biegung aufgebaut (Dicke {2}, R {3}) – Kontur, Winkel und Radien jetzt in der Zeitleiste änderbar. ⇒ {0}: rebuilt as base flange and {1} bend (thickness {2}, R {3}) – contour, angles and radii can now be changed in the timeline.
{0}: als Grundlasche und {1} Biegungen aufgebaut (Dicke {2}, R {3}) – Kontur, Winkel und Radien jetzt in der Zeitleiste änderbar. ⇒ {0}: rebuilt as base flange and {1} bends (thickness {2}, R {3}) – contour, angles and radii can now be changed in the timeline.
Keine ebene Fläche – kein Blechteil ⇒ No planar face – not a sheet metal part
Kein Blech gleicher Dicke: die Abwicklung erfasst {0} % des Volumens ⇒ Not sheet metal of uniform thickness: the flat pattern covers {0} % of the volume
Das Teil hat scharfe Kanten ohne Biegeradius – so nicht als Biegungen nachbaubar ⇒ The part has sharp edges without bend radius – cannot be rebuilt as bends
Das Teil hat Biegungen, die sich nicht als Biegen an einer Linie nachbauen lassen (Kegel, Formschräge) ⇒ The part has bends that cannot be rebuilt as bends along a line (cones, draft)
Alle Teile dieses Imports aufbauen ⇒ Rebuild All Parts of This Import
Jeden Körper dieses STEP-Imports als Blech oder Skizze + Extrusion aufbauen ⇒ Rebuild each body of this STEP import as sheet metal or sketch + extrude
STEP-Teil in einem neuen Teil mit eigenen Funktionen aufbauen (Blech: Grundlasche + Biegen, sonst Skizze + Extrusion, bemaßt) ⇒ Rebuild a STEP part in a new part with native features (sheet metal: base flange + bend, otherwise sketch + extrude, dimensioned)
STEP mit eigenen Funktionen aufgebaut: {0}. Maße in den Skizzen ändern das Teil. ⇒ STEP rebuilt with native features: {0}. Dimensions in the sketches change the part.
STEP mit eigenen Funktionen aufgebaut: {0}; {1} Körper bleibt eingelesen (Freiform). Maße in den Skizzen ändern das Teil. ⇒ STEP rebuilt with native features: {0}; {1} body stays imported (freeform). Dimensions in the sketches change the part.
STEP mit eigenen Funktionen aufgebaut: {0}; {1} Körper bleiben eingelesen (Freiform). Maße in den Skizzen ändern das Teil. ⇒ STEP rebuilt with native features: {0}; {1} bodies stay imported (freeform). Dimensions in the sketches change the part.
Kein Körper der STEP-Datei ließ sich als Blech oder Extrusion aufbauen – sie bleiben eingelesen. ⇒ No body of the STEP file could be rebuilt as sheet metal or extrusion – they stay imported.
{0} Blechteil (Grundlasche + Biegen) ⇒ {0} sheet metal part (base flange + bend)
{0} Blechteile (Grundlasche + Biegen) ⇒ {0} sheet metal parts (base flange + bend)
{0} Teil als Skizze + Extrusion ⇒ {0} part as sketch + extrude
{0} Teile als Skizze + Extrusion ⇒ {0} parts as sketch + extrude
Die STEP-Datei hat {0} Körper – sie bleibt als Baugruppe eingelesen. Teile mit eigenen Funktionen aufbauen: Rechtsklick auf einen Körper → „Als Blechteil aufbauen“, „Als Skizze und Extrusion aufbauen“ oder „Alle Teile dieses Imports aufbauen“. ⇒ The STEP file has {0} bodies – it stays imported as an assembly. To rebuild parts with native features: right-click a body → “Rebuild as Sheet Metal Part”, “Rebuild as Sketch and Extrude” or “Rebuild All Parts of This Import”.
{0}: als Skizze ({1} Kurven, {2} Maße) und Extrusion {3} aufgebaut – Maße in der Skizze und Dicke in der Zeitleiste änderbar. ⇒ {0}: rebuilt as sketch ({1} curves, {2} dimensions) and extrude {3} – dimensions in the sketch and thickness in the timeline can be changed.
{0}: als Grundlasche und {1} Biegung aufgebaut (Dicke {2}, R {3}, {4} Maße) – Kontur, Winkel und Radien jetzt änderbar. ⇒ {0}: rebuilt as base flange and {1} bend (thickness {2}, R {3}, {4} dimensions) – contour, angles and radii can now be changed.
{0}: als Grundlasche und {1} Biegungen aufgebaut (Dicke {2}, R {3}, {4} Maße) – Kontur, Winkel und Radien jetzt änderbar. ⇒ {0}: rebuilt as base flange and {1} bends (thickness {2}, R {3}, {4} dimensions) – contour, angles and radii can now be changed.
Als Skizze und Extrusion nicht genau genug nachbaubar (Volumen {0} % des Teils, z. B. Freiformkanten) – zurückgenommen. ⇒ Cannot be rebuilt accurately enough as sketch and extrude (volume {0} % of the part, e.g. freeform edges) – undone.
Lastfall ⇒ Load Case
Lasten und Eigengewicht dieses Lastfalls bearbeiten ⇒ Edit loads and self-weight of this load case
Neuer Lastfall (gleiche Lager, eigene Lasten) ⇒ New load case (same supports, own loads)
Umhüllende ⇒ Envelope
Alle Lastfälle: je Stab der kleinste Sicherheitsfaktor und sein Lastfall ⇒ All load cases: per member the lowest safety factor and its load case
Aktiven Lastfall löschen ⇒ Delete active load case
maßgebend ⇒ governing
Umhüllende über {0} Lastfälle: je Stab der kleinste Sicherheitsfaktor und der Lastfall, aus dem er kommt; σ max und SF Knicken ebenso über alle Lastfälle. Blau: Biegelinie von {1} (größte Verschiebung), {2}-fach überhöht. ⇒ Envelope over {0} load cases: per member the lowest safety factor and the load case it comes from; σ max and buckling SF likewise over all load cases. Blue: deflection line of {1} (largest displacement), exaggerated {2}×.
Neuer Lastfall (gleiche feste Flächen, eigene Lasten) ⇒ New load case (same fixed faces, own loads)
Alle Lastfälle: je Punkt der größte Wert, kleinster Sicherheitsfaktor und sein Lastfall ⇒ All load cases: per point the largest value, the lowest safety factor and its load case
Maßgebender Lastfall ⇒ Governing load case
{0} hat keine Last – eine Kraft auf eine Fläche setzen oder Eigengewicht einschalten. ⇒ {0} has no load – apply a force to a face or switch on self-weight.
Umhüllende über {0} Lastfälle: die Fläche zeigt je Punkt den größten Wert aller Fälle, der Sicherheitsfaktor den kleinsten darüber; maßgebend für die größte Spannung ist {1}. ⇒ Envelope over {0} load cases: the surface shows the largest value of all cases at each point, the safety factor the smallest one above it; {1} governs the largest stress.
Anzahl Eigenformen ⇒ Number of Mode Shapes
Modalfrequenzen brauchen viel länger als die statische Rechnung. Bei „Mittel“ oder „Fein“ dauert es Minuten – die Frequenzen werden dabei nicht besser. ⇒ Modal frequencies take far longer than the static solve. With “Medium” or “Fine” it takes minutes – the frequencies do not get better.
Feste Flächen ({0}) ⇒ Fixed Faces ({0})
Erste Eigenfrequenz ⇒ First Natural Frequency
Größte Frequenz ⇒ Largest Frequency
Eigenform ⇒ Mode Shape
Modalanalyse über {0} Eigenformen – gezeichnet ist Eigenform {1} (Zeile anklicken), größte Auslenkung {2}. Die Größe einer Eigenform ist beliebig, nur ihre Gestalt zählt. Gerechnet wird dieselbe Versteifung wie bei der statischen Spannung, freie Schwingung ohne Lasten, Massen aus der Werkstoffdichte. Zusatzmassen (Anbauteile, Bleche) fehlen – mit ihnen liegen die Frequenzen tiefer. ⇒ Modal analysis of {0} mode shapes – mode shape {1} is drawn (click a row), largest deflection {2}. The size of a mode shape is arbitrary, only its form matters. Computed with the same stiffness as the static stress study, free vibration without loads, mass from the material density. Added masses (attachments, sheets) are missing – with them the frequencies are lower.
Netz: {0} Würfel, Kante {1}, {2} Schritte, {3} s. Eine Biegung, die über wenige Elemente verläuft, ist zu steif – mehr Elemente über die Länge oder feineres Netz. Zur Vorbemessung. ⇒ Mesh: {0} cubes, edge {1}, {2} iterations, {3} s. A bend spanning only a few elements is too stiff – use more elements across the length or a finer mesh. For preliminary design.
Wärmeanalyse (Bauteil) ⇒ Thermal Analysis (Part)
Wärme ⇒ Thermal
Temperatur ⇒ Temperature
Leistung ⇒ Heat Load
Konvektion ⇒ Convection
Wärmeübergang ⇒ Film Coefficient
Umgebungstemperatur ⇒ Ambient Temperature
Fläche anklicken, deren Temperatur vorgegeben wird (z. B. Lagerstelle, Kühlplatte). Noch einmal = weg. ⇒ Click a face whose temperature is prescribed (e.g. bearing seat, cold plate). Click again to remove it.
Fläche anklicken, auf die die Leistung wirkt (z. B. Verlustleistung eines Bauteils). Noch einmal = weg. ⇒ Click a face the heat load acts on (e.g. power dissipated by a component). Click again to remove it.
Fläche anklicken, die Wärme an die Umgebung abgibt (Luft). Noch einmal = weg. ⇒ Click a face that gives heat to the surroundings (air). Click again to remove it.
Wärmebedingungen ({0}) ⇒ Thermal Conditions ({0})
Temperatur {0} °C ⇒ Temperature {0} °C
Leistung {0} W ⇒ Heat load {0} W
Konvektion {0} W/(m²·K) bei {1} °C ⇒ Convection {0} W/(m²·K) at {1} °C
Höchste Temperatur ⇒ Highest Temperature
Niedrigste Temperatur ⇒ Lowest Temperature
Temperaturdifferenz ⇒ Temperature Difference
Wärme an die Umgebung ⇒ Heat to Surroundings
Bedingung ⇒ Condition
W in den Körper ⇒ W into the body
Bilanz: {0} W – zugeführte und abgeführte Wärme müssen sich aufrechnen, der Rest ist Reengenauigkeit. Wärmequellen im Volumen und Strahlung fehlen, Flächen ohne Bedingung sind adiabat. An Kanten und Ecken ist der Wärmestrom auf dem groben Würfenetz ungenauer – feineres Netz hilft. Zur Vorbemessung. ⇒ Balance: {0} W – heat in and heat out must cancel, the rest is solver accuracy. Heat sources inside the volume and radiation are missing, faces without a condition are adiabatic. At edges and corners the heat flow is less accurate on the coarse cube mesh – a finer mesh helps. For preliminary design.
Netz: {0} Würfel, Kante {1}, {2} Schritte, {3} s. Wärmeleitfähigkeit {4} W/(m·K), Wärmeübergang an die Umgebung nach Newton. ⇒ Mesh: {0} cubes, edge {1}, {2} iterations, {3} s. Thermal conductivity {4} W/(m·K), heat transfer to the surroundings by Newton's law.
Ohne vorgegebene Temperatur oder Konvektion löst die Wärmegleichung nicht – eine Fläche anklicken. ⇒ Without a prescribed temperature or convection the heat equation does not solve – click a face.
Ohne feste Temperatur oder Konvektion ist das Temperaturfeld nicht bestimmt ⇒ Without a fixed temperature or convection the temperature field is not determined
Für die Wärmeanalyse gehört ein Werkstoff mit Wärmeleitfähigkeit dazu ⇒ For the thermal analysis the material needs a thermal conductivity
An einer Wärmefläche liegt kein Netzknoten – Netz feiner wählen ⇒ A thermal face has no mesh node – choose a finer mesh
Das ganze Netz ist auf Temperatur gesetzt – nichts zu rechnen ⇒ The whole mesh is set to a temperature – nothing to solve
Volumetrisches Gitter ⇒ Volumetric Lattice
Volumetrisches Gitter# ⇒ Volumetric Lattice
Volumetrisches Gitter (Gyroid, Diamant, Schwarz P als Füllstruktur) ⇒ Volumetric Lattice (gyroid, diamond, Schwarz P as infill)
Gittertyp ⇒ Lattice type
Gitterzelle (Maß einer Zelle) ⇒ Lattice cell (size of one cell)
Auflösung: Schritte pro Zelle (0 = automatisch) ⇒ Resolution: steps per cell (0 = automatic)
Körper ersetzen ⇒ Replace bodies
Gyroid (Schoen G) ⇒ Gyroid (Schoen G)
Diamant (Schoen D) ⇒ Diamond (Schoen D)
Schwarz P ⇒ Schwarz P
Durchgehend verbundene Freiformfläche ohne gerade Ebenen – steif in alle Richtungen, die übliche Wahl für den 3D-Druck. ⇒ One connected freeform surface without flat planes – stiff in every direction, the usual choice for 3D printing.
Zwei getrennte, ineinandergreifende Flächen – feineres Bild als das Gyroid, mehr einzelne Stege. ⇒ Two separate interlocking surfaces – a finer pattern than the gyroid, more separate members.
Primitive kubische Minimalfläche – offenes, grobes Gitter mit großen Kammern. ⇒ Primitive cubic minimal surface – an open, coarse lattice with large chambers.
Volumetrisches Feld: das Innere der Körper wird von einer periodischen Freiformfläche in der angegebenen Wandstärke gefüllt – die Stege enden auf den Flächen der Körper. Die Gitterzelle wiederholt sich im ganzen Körper, ihre Lage richtet sich nach dem Ursprung. Ein größeres Bauteil braucht ein gröberes Gitter: die Auflösung sinkt automatisch, wenn der Körper zu viele Punkte bräuchte. ⇒ Volumetric Lattice: the inside of the bodies is filled by a periodic freeform surface of the wall thickness given – the members end on the faces of the bodies. The lattice cell repeats through the whole body, its position follows the origin. A larger part needs a coarser lattice: the resolution drops on its own when the body would need too many points.
Das Ergebnis ist ein Netzkörper aus Dreiecken (wie ein STL-Import), ohne Verrundungen an den Stegen – für den 3D-Druck und als Füllstruktur. Für Streben mit exakten Zylindern stattdessen ein Muster oder „Rahmen“ verwenden. ⇒ The result is a mesh body of triangles (like an STL import), without fillets on the members – for 3D printing and as an infill structure. For struts with exact cylinders use a pattern or “Frame” instead.
{0}, Gitterzelle {1#} mm, Wand {2#} mm · Netzkörper, {3#} Dreiecke, {4#} mm³, {5#} % Material ⇒ {0}, lattice cell {1} mm, wall {2} mm · mesh body, {3} triangles, {4} mm³, {5} % material
Gitterzelle {0#} mm ⇒ lattice cell {0} mm
Wand {0#} mm ⇒ wall {0} mm
Netzkörper ⇒ mesh body
Wandstärke muss kleiner sein als die Gitterzelle ⇒ Wall thickness must be smaller than the lattice cell
Ein Gittertyp „{0}“ ist nicht bekannt ⇒ A lattice type “{0}” is not known
Der Körper hat keine Oberfläche ⇒ The body has no surface
Die Körper haben keine Oberfläche ⇒ The bodies have no surface
Der Körper ist für dieses Gitter zu groß ({0#} Rasterpunkte) – eine größere Gitterzelle oder eine geringere Wandstärke wählen ⇒ The body is too large for this lattice ({0} grid points) – choose a larger lattice cell or a smaller wall thickness
Das Gitter passt nicht in den Körper – eine kleinere Gitterzelle wählen ⇒ The lattice does not fit inside the body – choose a smaller lattice cell
Das Gitter ist nicht geschlossen – Wandstärke oder Auflösung ändern ⇒ The lattice is not closed – change the wall thickness or the resolution
Auflösung zu grob für diese Wandstärke – nur {0#} Schritte pro Gitterzelle ⇒ Resolution too coarse for this wall thickness – only {0} steps per lattice cell
3D-Skizze ⇒ 3D Sketch
3D-Skizze (ohne Ebene, direkt im Raum) ⇒ 3D Sketch (no plane, drawn directly in space)
3D-Skizze: Punkte direkt im Raum ⇒ 3D sketch: points directly in space
Bogen durch drei Punkte ⇒ Arc through three points
Bogen: Anfang, Ende und einen Punkt anklicken, durch den der Bogen läuft. Die drei Punkte dürfen im Raum liegen – der Bogen liegt dann in ihrer Ebene. ⇒ Arc: click the start, the end and a point the arc runs through. The three points may lie in space – the arc then lies in their plane.
Der Pfad hat eine Lücke ⇒ The path has a gap
Der Pfad ist nicht geschlossen ⇒ The path is not closed
Der räumliche Pfad liegt nicht in einer Ebene – das geht nur mit einem ebenen räumlichen Pfad ⇒ The spatial path does not lie in a plane – this only works with a path that is planar
Die drei Punkte des Bogens liegen auf einer Geraden ⇒ The three points of the arc lie on a straight line
ein durchgehender Zug ⇒ one continuous chain
ein geschlossener Zug ⇒ one closed chain
Eine 3D-Skizze (ohne Ebene) geht nicht als DXF – DXF-Kurven liegen in einer Ebene. ⇒ A 3D sketch (without a plane) does not work as DXF – DXF curves lie in a plane.
Eine 3D-Skizze ist für räumliche Pfade da: Auszug, Rohr und Anordnung entlang Pfad folgen ihr, ebenso eine Arbeitsebene entlang eines Pfads. Abhängigkeiten und Bemaßungen gibt es hier nicht. ⇒ A 3D sketch is there for spatial paths: Extrude, Pipe and Pattern Along Path follow it, as does a work plane along a path. There are no constraints and no dimensions here.
Eine Skizze ohne Ebene ist eine 3D-Skizze – als Profil bitte eine Skizze auf einer Ebene wählen ⇒ A sketch without a plane is a 3D sketch – for a profile, please choose a sketch on a plane
Es stehen keine Kurven zur Verfügung ⇒ There are no curves available
Ein Kreis braucht drei verschiedene Punkte ⇒ A circle needs three different points
Kreis durch drei Punkte ⇒ Circle through three points
Kreis: drei Punkte auf dem Kreis anklicken. Der Kreis liegt dann in der Ebene dieser Punkte. ⇒ Circle: click three points on the circle. The circle then lies in the plane of these points.
Klicken wählt aus, einen Punkt kann man im Raum ziehen. Neue Punkte liegen auf Modellkanten und -flächen, sonst in der Ebene senkrecht zum Blick durch den letzten Punkt. Entf löscht. ⇒ Clicking selects, a point can be dragged through space. New points lie on model edges and faces, otherwise in the plane perpendicular to the view through the last point. Delete removes.
Linie: Punkte nacheinander klicken, der Zug läuft am letzten Endpunkt weiter. Doppelklick oder Esc beendet den Linienzug. ⇒ Line: click points one after another, the chain continues at the last end point. Double-click or Esc ends the line chain.
Modellkanten und -flächen treffen ⇒ Snap to model edges and faces
noch keine Kurve ⇒ no curve yet
Punkt: klicken. Er liegt auf der Modellkante unter dem Zeiger, sonst in der Ebene senkrecht zum Blick. ⇒ Point: click. It lies on the model edge under the pointer, otherwise in the plane perpendicular to the view.
Punkte liegen dort, wohin der Zeiger zeigt: auf Modellkanten und -flächen, sonst in der Ebene senkrecht zum Blick durch den letzten Punkt. Einen Punkt mit der Maus im Raum verschieben. ⇒ Points lie where the pointer points: on model edges and faces, otherwise in the plane perpendicular to the view through the last point. Move a point through space with the mouse.
Spline: Punkte nacheinander klicken, die Kurve läuft glatt durch alle. Doppelklick oder Enter beendet, Klick auf den ersten Punkt schließt sie. ⇒ Spline: click points one after another, the curve runs smoothly through all of them. Double-click or Enter ends it, clicking the first point closes it.
{0} geht als räumlicher Pfad noch nicht ⇒ {0} does not work as a spatial path yet
{0#} Kurve im Raum ⇒ {0} curve in space
{0#} Kurven im Raum ⇒ {0} curves in space
Standard ⇒ Standard
Mitte dreht ⇒ Middle orbits
Mit F-Tasten ⇒ With F keys
Rechts dreht ⇒ Right orbits
Alt + Umschalt ⇒ Alt + Shift
Mitte dreht, Umschalt verschiebt ⇒ Middle orbits, Shift pans
`;
