// cantcodecad – Leisten der Oberfläche: Menüband (Reiter, Gruppen, Aufklappmenüs), Markierungsmenü, Navigationsleiste,
// Befehlssuche und Skizzen-Reiter. Die Befehle selbst führt runCmd in main.js aus.
import { icon } from './icons.js';

/* Aus main.js ausgelagert. ctx liefert den Zustand der Hauptdatei über Getter (immer der aktuelle Wert):
   DVIEWS, drawing, editor, lastCmd, measure, mode, modelSel, nesting, overhang, section, sketchState, vp; Funktionen werden weitergereicht. */
export function setupUiBars(ctx) {
  const $ = (...a) => ctx.$(...a);
  const $$ = (...a) => ctx.$$(...a);
  const esc = (...a) => ctx.esc(...a);
  const redo = (...a) => ctx.redo(...a);
  const runCmd = (...a) => ctx.runCmd(...a);
  const selCount = (...a) => ctx.selCount(...a);
  const toast = (...a) => ctx.toast(...a);
  const undo = (...a) => ctx.undo(...a);
  const updateSectionBtn = (...a) => ctx.updateSectionBtn(...a);
  /* ---------------- Oberfläche: Leisten ---------------- */
  const CONSTRAINTS = [
    ['hv', 'H|V', 'Horizontal/Vertikal'], ['parallel', '∥', 'Parallel'], ['perpendicular', '⊥', 'Senkrecht'],
    ['tangent', 'T', 'Tangential'], ['equal', '=', 'Gleich'], ['coincident', '◉', 'Deckungsgleich'],
    ['midpoint', 'M', 'Mittelpunkt'], ['concentric', '◎', 'Konzentrisch'], ['symmetric', '⇔', 'Symmetrisch'], ['collinear', '≡', 'Kollinear'], ['polygon', '⬡', 'Polygon (regelmäßiges Vieleck)'], ['fix', 'Fix', 'Fixieren']
  ];
  /* ---------------- Werkzeugleiste mit Reitern und Gruppen ----------------
     Arbeitsbereich-Knopf, Reiter (Volumenkörper, Blech, Dienstprogramme, Extras), je Reiter Gruppen mit
     den wichtigsten Befehlen als Symbol und einem Aufklappmenü mit allen Befehlen der Gruppe. */
  const RCMD = {
    sketch: ['sketch', 'Skizze erstellen'], 'sketch3d': ['sketch', '3D-Skizze (ohne Ebene, direkt im Raum)'], extrude: ['extrude', 'Extrusion', 'E'], revolve: ['revolve', 'Drehung', 'D'],
    sweep: ['sweep', 'Sweeping'], pipe: ['pipe', 'Rohr'], loft: ['loft', 'Erhebung'], rib: ['rib', 'Rippe'], web: ['web', 'Steg'], emboss: ['text', 'Prägen'], hole: ['hole', 'Bohrung', 'H'], boss: ['pcyl', 'Zapfen (Kunststoff: Schraubzapfen mit Loch und Rippen)'], snapfit: ['rib', 'Schnappverschluss (Kunststoff: Biegebalken mit Haken)'], lippe: ['shell', 'Lippe / Absatz (Kunststoff: Band auf der Randfläche einer Schale bzw. Gegenstück)'], kstregel: ['shell', 'Kunststoffregel (Werkstoff, Wanddicke, Formschräge, Radius, Spiel – verknüpft)'],
    thread: ['thread', 'Gewinde'], coil: ['coil', 'Spirale'],
    box: ['pbox', 'Quader'], cylinder: ['pcyl', 'Zylinder'], sphere: ['psphere', 'Kugel'], torus: ['ptorus', 'Torus'], bound: ['pbox', 'Begrenzender Volumenkörper'], boundfill: ['pbox', 'Begrenzungsfüllung (eingeschlossene Zellen füllen)'], gitter: ['topo', 'Volumetrisches Gitter (Gyroid, Diamant, Schwarz P als Füllstruktur)'], thicken: ['shell', 'Verdicken (Flächen)'], topo: ['topo', 'Topologieoptimierung (Generatives Design)'], pattern: ['fpattern', 'Muster'], mirror: ['fmirror', 'Spiegeln'],
    presspull: ['presspull', 'Drücken/Ziehen', 'Q'], moveface: ['presspull', 'Fläche verschieben (verschieben, drehen oder bis zu einer Fläche)'], fillet: ['fillet', 'Verrunden', 'F'], chamfer: ['chamfer', 'Fase'],
    shell: ['shell', 'Wandstärke'], draft: ['draft', 'Formschräge'], combine: ['combine', 'Kombinieren'], split: ['split', 'Körper teilen'], splitface: ['splitface', 'Fläche teilen'], silsplit: ['splitface', 'Silhouette geteilt (Flächen entlang der Umrisslinie aus einer Richtung teilen)'],
    move: ['move', 'Verschieben/Kopieren', 'M'], scale: ['scale', 'Skalieren'], remove: ['trash', 'Entfernen'], defeature: ['defeature', 'Elemente entfernen (Bohrungen, Rundungen, Fasen)'], params: ['params', 'Parameter ändern'], configs: ['config', 'Konfigurationen (Teilefamilie)'],
    component: ['component', 'Neue Komponente'], joint: ['joint', 'Gelenk', 'J'], rigid: ['rigid', 'Starre Gruppe (Komponenten bewegen sich gemeinsam)'], motionlink: ['joint', 'Bewegungsverknüpfung (ein Gelenk treibt ein anderes)'], 'kontakt-neu': ['joint', 'Neuer Kontaktsatz (Teile, die sich beim Bewegen nicht durchdringen)'], 'kontakt-saetze': ['joint', 'Kontaktsätze aktivieren'], 'kontakt-alle': ['joint', 'Kontakt aller Komponenten'], 'kontakt-aus': ['joint', 'Kontaktanalyse deaktivieren'], jorigin: ['jorigin', 'Gelenkursprung'], align: ['align', 'Ausrichten'], constraint: ['joint', 'Abhängigkeiten (Flächen aufeinander, konzentrisch, …)'], insert: ['insert', 'Teil einfügen'], derive: ['derive', 'Ableiten (Körper aus einem anderen Dokument, verknüpft)'], canvas: ['image', 'Ansichtsbereich (Bild als Vorlage)'], fastener: ['fastener', 'Normteil einfügen (Schraube, Mutter, Scheibe)'],
    'import-file': ['import', 'Importieren (STEP, STL, DXF, SVG)'], 'insert-svg': ['svg', 'SVG einfügen'], plane: ['wplane', 'Arbeitsebene'], axis: ['waxis', 'Arbeitsachse'], point: ['wpoint', 'Arbeitspunkt'], bks: ['bks', 'Benutzerkoordinatensystem (eigener Nullpunkt und Achsen für Skizzen und Muster)'],
    measure: ['measure', 'Messen', 'I'], cog: ['cog', 'Massenmittelpunkt (ein/aus)'], section: ['section', 'Querschnittanalyse'], interfere: ['interfere', 'Kollision'],
    sm_rule: ['smrule', 'Blechregeln'], sm_base: ['smbase', 'Lasche'], sm_contour: ['smcontour', 'Konturlasche'],
    sm_flange: ['smflange', 'Lasche an Kante'], sm_rip: ['smrip', 'Auftrennung'], sm_corner: ['smcorner', 'Blechabrundung / -fase'], sm_join: ['smjoin', 'Durch Biegung verbinden'], sm_loft: ['smloft', 'Übergangslasche'], sm_unfold: ['smunfold', 'Abwickeln'], sm_refold: ['smrefold', 'Zurückfalten'], sm_bend: ['smbend', 'Biegen'], sm_convert: ['smconvert', 'In Blech umwandeln'], flat: ['flat', 'Abwicklung erstellen'], 'flat-all': ['flat', 'Alle Blechteile abwickeln (DXF-Paket für den Laser)'], nest: ['nest', 'Verschachtelung (Nesting)'], render: ['render', 'Rendern'], explode: ['explode', 'Explosionsansicht'], motion: ['joint', 'Bewegungsstudie (Gelenke nach Zeitplan bewegen, Kollision prüfen)'], antrieb: ['joint', 'Antriebsgelenke (Gelenke auf Werte fahren)'], bom: ['bom', 'Stückliste (Menge, Werkstoff, Masse, CSV)'], draftan: ['draftan', 'Verjüngungs-Analyse (Formschräge prüfen)'], zebra: ['render', 'Zebra-Analyse (Flächenübergänge prüfen, ein/aus)'], envmap: ['render', 'Umgebungs-Map-Analyse (Spiegelung einer Umgebung, ein/aus)'], access: ['draftan', 'Zugänglichkeitsanalyse (aus einer Richtung erreichbare Flächen)'], minrad: ['draftan', 'Mindestradius-Analyse'], curvmap: ['draftan', 'Krümmungs-Map (Krümmung farbig)'], isocurves: ['render', 'Isokurven (u/v-Linien gekrümmter Flächen, ein/aus)'], compcolors: ['component', 'Komponentenfarben anzeigen (ein/aus)'], similar: ['component', 'Ähnliche Komponenten suchen (gleiche oder ähnliche Teile markieren)'],
    drawing: ['drawing', 'Zeichnung aus Konstruktion'], 'export-3mf': ['stl', '3D-Druck (3MF)'], 'export-stl': ['stl', 'STL exportieren'],
    'export-step': ['step', 'STEP exportieren'], 'dxf-settings': ['dxf', 'DXF-Einstellungen (Export)'], 'mfg-package': ['package', 'Fertigungspaket (STEP, Abwicklung, Zeichnung PDF/DXF, Stückliste) als ZIP'], 'face-dxf': ['dxf', 'DXF aus ebener Fläche'],
    'to-assembly': ['component', 'Zu Baugruppe hinzufügen (neue Baugruppe mit diesem Teil)'],
    frame: ['frame', 'Rahmen'], weld: ['weld', 'Schweißnaht'], gusset: ['gusset', 'Knotenblech'], endcap: ['endcap', 'Endkappe'], cutlist: ['cutlist', 'Zuschnittliste'], framesim: ['frame', 'Festigkeit (Rahmen): Lager, Lasten, Sicherheitsfaktor je Stab'], solidsim: ['draftan', 'Festigkeit (Bauteil): statische Spannung, Sicherheitsfaktor'], overhang: ['overhang', 'Überhang-Analyse']
  };
  /* Reiter je Dokumentart: Bauteilkonstruktion (Volumenkörper, Blech, …) und Baugruppenkonstruktion
     (Baugruppe, Dienstprogramme; die Modellier-Reiter nur, solange eine Komponente aktiv ist = im Kontext bearbeiten).
     Einträge in off sind sichtbar, aber gesperrt (mit Hinweis). */
  const SOLID = { id: 'solid', label: 'Volumenkörper', groups: [
    { id: 'create', label: 'Erstellen', show: ['sketch', 'extrude', 'revolve', 'hole', 'pattern'], items: ['sketch', 'sketch3d', '-', 'extrude', 'revolve', 'sweep', 'pipe', 'loft', 'rib', 'web', 'emboss', '-', 'box', 'cylinder', 'sphere', 'torus', 'coil', 'bound', 'boundfill', 'gitter', 'thicken', '-', 'hole', 'thread', '-', 'boss', 'snapfit', 'lippe', 'kstregel', '-', 'pattern', 'mirror', '-', 'jorigin'] },
    { id: 'modify', label: 'Ändern', show: ['presspull', 'fillet', 'chamfer', 'shell', 'combine'], items: ['presspull', 'moveface', 'fillet', 'chamfer', 'shell', 'draft', 'defeature', '-', 'combine', 'split', 'splitface', 'silsplit', 'move', 'scale', 'align', 'remove', '-', 'params'] },
    { id: 'config', label: 'Konfigurieren', show: ['configs'], items: ['configs', 'params'] },
    { id: 'construct', label: 'Konstruieren', show: ['plane', 'axis', 'point', 'bks'], items: ['plane', 'axis', 'point', 'bks'] },
    { id: 'inspect', label: 'Prüfen', show: ['measure', 'section'], items: ['measure', 'section', 'interfere', 'draftan', 'minrad', 'curvmap', 'isocurves', 'zebra', 'envmap', 'access', 'compcolors', 'similar', 'cog', '-', 'solidsim'] },
    { id: 'insert', label: 'Einfügen', show: ['derive', 'insert-svg'], items: ['insert', 'fastener', '-', 'derive', 'insert-svg', 'import-file', 'canvas'], off: ['insert', 'fastener'] },
    { id: 'assemble', label: 'Zusammenfügen', show: ['to-assembly'], items: ['to-assembly'] }
  ] };
  const SHEET = { id: 'sheet', label: 'Blech', groups: [
    { id: 'create', label: 'Erstellen', show: ['sketch', 'sm_base', 'sm_flange', 'sm_contour', 'sm_bend'], items: ['sketch', '-', 'sm_base', 'sm_flange', 'sm_contour', 'sm_loft', 'sm_bend', 'sm_join', '-', 'sm_convert', '-', 'hole', 'pattern', 'mirror'] },
    { id: 'modify', label: 'Ändern', show: ['sm_rule', 'sm_rip', 'presspull'], items: ['sm_rule', 'sm_rip', 'sm_corner', 'sm_unfold', 'sm_refold', '-', 'presspull', 'fillet', 'chamfer', 'combine', 'split', 'move', 'remove'] },
    { id: 'construct', label: 'Konstruieren', show: ['plane', 'axis', 'point', 'bks'], items: ['plane', 'axis', 'point', 'bks'] },
    { id: 'inspect', label: 'Prüfen', show: ['measure'], items: ['measure', 'section', 'interfere', '-', 'solidsim'] },
    { id: 'flat', label: 'Abwicklung', show: ['flat', 'nest'], items: ['flat', 'flat-all', 'face-dxf', 'nest'] }
  ] };
  const ASM = { id: 'asm', label: 'Baugruppe', groups: [
    { id: 'insert', label: 'Einfügen', show: ['insert', 'fastener'], items: ['insert', 'fastener', '-', 'derive', 'insert-svg', 'import-file', 'canvas'] },
    { id: 'create', label: 'Erstellen', show: ['component', 'sketch'], items: ['component', 'sketch', '-', 'pattern', 'derive'] },
    { id: 'rel', label: 'Beziehungen', show: ['joint', 'jorigin', 'rigid'], items: ['joint', 'jorigin', 'align', 'constraint', '-', 'rigid', 'motionlink', '-', 'kontakt-neu', 'kontakt-saetze', 'kontakt-alle', 'kontakt-aus'] },
    { id: 'motion', label: 'Bewegung', show: ['motion', 'explode'], items: ['antrieb', 'motion', 'explode'] },
    { id: 'modify', label: 'Ändern', show: ['move', 'align', 'remove'], items: ['move', 'align', 'remove', '-', 'params'] },
    { id: 'config', label: 'Konfigurieren', show: ['configs'], items: ['configs', 'params'] },
    { id: 'construct', label: 'Konstruieren', show: ['plane', 'axis', 'point', 'bks'], items: ['plane', 'axis', 'point', 'bks'] },
    { id: 'inspect', label: 'Prüfen', show: ['measure', 'interfere', 'bom'], items: ['measure', 'section', 'interfere', 'similar', 'cog', 'bom'] }
  ] };
  const UTIL = { id: 'util', label: 'Dienstprogramme', groups: [
    { id: 'drawing', label: 'Zeichnung', show: ['drawing', 'render', 'explode'], items: ['drawing', 'render', 'explode'] },
    { id: 'output', label: 'Ausgabe', show: ['mfg-package', 'export-3mf', 'export-step'], items: ['mfg-package', '-', 'export-3mf', 'export-stl', 'export-step', 'face-dxf', 'dxf-settings'] },
    { id: 'manage', label: 'Verwalten', show: ['params', 'configs', 'bom'], items: ['params', 'configs', 'bom'] },
    { id: 'inspect', label: 'Prüfen', show: ['measure', 'interfere'], items: ['measure', 'section', 'interfere', 'draftan'] }
  ] };
  const EXTRAS = { id: 'extras', label: 'Extras', groups: [
    { id: 'steel', label: 'Stahlbau', show: ['frame', 'weld', 'gusset', 'endcap', 'cutlist', 'framesim'], items: ['frame', '-', 'weld', 'gusset', 'endcap', '-', 'cutlist', 'framesim'] },
    { id: 'print', label: '3D-Druck', show: ['overhang', 'coil', 'export-3mf'], items: ['overhang', 'coil', 'export-3mf'] },
    { id: 'cut', label: 'Laser / Plasma', show: ['face-dxf', 'flat', 'nest'], items: ['face-dxf', 'flat', 'flat-all', 'nest'] }
  ] };
  // im Kontext einer Komponente: Volumenkörper ohne „Zusammenfügen“ und ohne gesperrte Einträge
  const SOLID_IN_ASM = { ...SOLID, groups: SOLID.groups.filter(g => g.id !== 'assemble').map(g => g.id === 'insert' ? { ...g, show: ['insert', 'fastener', 'derive'], off: [] } : g) };
  const ASM_ONLY = { insert: 1, fastener: 1, component: 1, joint: 1, rigid: 1 };
  const docKind = () => ctx.docKind();
  const tabsNow = () => docKind() !== 'assembly' ? [SOLID, SHEET, UTIL, EXTRAS] : ctx.activeComp() ? [ASM, SOLID_IN_ASM, SHEET, UTIL, EXTRAS] : [ASM, UTIL];
  const RTABS = [SOLID, SHEET, ASM, UTIL, EXTRAS];
  const findTab = id => tabsNow().find(t => t.id === id);
  let ribbonTab = (() => { try { return localStorage.getItem('cc.tab') || 'solid'; } catch (_) { return 'solid'; } })();
  if (!RTABS.some(t => t.id === ribbonTab)) ribbonTab = 'solid';
  let ribbonSig = '';
  const caretSvg = '<svg class="car" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  const offTip = id => ASM_ONLY[id] ? 'Nur in einer Baugruppe (Zusammenfügen → Zu Baugruppe hinzufügen)' : '';
  function renderRibbon() {
    const tabs = tabsNow();
    const tab = tabs.find(t => t.id === ribbonTab) || tabs[0];
    const ctxComp = docKind() === 'assembly' && ctx.activeComp();
    ribbonSig = `${docKind()}|${!!ctxComp}`;
    const fbtn = (id, off) => { const [ic, label, key] = RCMD[id]; const dis = off && off.includes(id); return `<button type="button" class="fbtn" data-cmd="${id}" title="${esc(dis ? `${label}: ${offTip(id)}` : label)}${key && !dis ? ` (${key})` : ''}" aria-label="${esc(label)}"${dis ? ' disabled' : ''}>${icon(ic, 30)}</button>`; };
    $('#ribbon').innerHTML = `
      <div class="rtabs">
        <button type="button" class="wsbtn" data-menu="ws">Konstruktion ${caretSvg}</button>
        ${tabs.map(t => `<button type="button" class="rtab" data-rtab="${t.id}" aria-selected="${t.id === tab.id}">${esc(t.label)}</button>`).join('')}
        ${ctxComp ? `<span class="rctx" title="Neue Körper und Skizzen gehören zu dieser Komponente">Komponente bearbeiten: <b>${esc(ctxComp)}</b><button type="button" class="chip" data-cmd="comp-activate" data-id="">Fertig</button></span>` : ''}
      </div>
      <div class="rbody">
        ${tab.groups.map(g => `<div class="fgroup g-${g.id}"><div class="ftools">${g.show.map(id => fbtn(id, g.off)).join('')}</div><button type="button" class="fglabel" data-menu="${tab.id}:${g.id}">${esc(g.label)} ${caretSvg}</button></div>`).join('')}
      </div>`;
    updateSectionBtn();
  }
  /* nach Dokumentwechsel oder Aktivieren einer Komponente: Reiter neu, wenn sich Art oder Kontext geändert haben */
  function syncRibbon(prefer) {
    if (ctx.mode !== 'model' && ctx.mode !== 'measure') return;
    const sig = `${docKind()}|${!!(docKind() === 'assembly' && ctx.activeComp())}`;
    if (sig === ribbonSig && !prefer) return;
    if (prefer && findTab(prefer)) ribbonTab = prefer;
    if (!findTab(ribbonTab)) ribbonTab = tabsNow()[0].id;
    closeRibbonMenu();
    renderRibbon();
  }
  function closeRibbonMenu() { const m = $('#fmenu'); if (m) m.remove(); $$('[data-menu][aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
  function openRibbonMenu(btn) {
    const key = btn.dataset.menu;
    const was = btn.getAttribute('aria-expanded') === 'true';
    closeRibbonMenu();
    if (was) return;
    let html;
    if (key === 'dview') {
      html = '<div class="fmh">Basisansicht einfügen</div>' + ctx.DVIEWS.map(([v, l]) => `<button type="button" class="fmi" data-cmd="dview-place" data-v="${v}">${icon(v.startsWith('iso') ? 'extrude' : 'body', 18)}<span>${l}</span></button>`).join('');
    } else if (key === 'nav:filter') {
      html = '<div class="fmh">Auswahlfilter</div>' + SEL_FILTERS.map(([v, l]) => `<button type="button" class="fmi${navState.filter === v ? ' on' : ''}" data-cmd="selfilter" data-v="${v}"><span>${l}</span>${navState.filter === v ? '<kbd>✓</kbd>' : ''}</button>`).join('') + '<div class="fmsep"></div><div class="fmh">Auswahlpriorität</div>' + SEL_PRIOS.map(([v, l]) => `<button type="button" class="fmi${(navState.prio || 'kante') === v ? ' on' : ''}" data-cmd="selprio" data-v="${v}"><span>${l}</span>${(navState.prio || 'kante') === v ? '<kbd>✓</kbd>' : ''}</button>`).join('')
        + '<div class="fmsep"></div><div class="fmh">Auswahlwerkzeug</div>' + SEL_TOOLS.map(([v, l]) => `<button type="button" class="fmi${(navState.selTool || 'window') === v ? ' on' : ''}" data-cmd="seltool" data-v="${v}"><span>${l}</span>${(navState.selTool || 'window') === v ? '<kbd>✓</kbd>' : ''}</button>`).join('') + '<div class="fmsep"></div><button type="button" class="fmi" data-cmd="szsel"><span>Nach Größe auswählen …</span></button>';
    } else if (key === 'nav:display') {
      const st = (v, l) => `<button type="button" class="fmi${navState.style === v ? ' on' : ''}" data-cmd="vstyle" data-v="${v}">${icon(v === 'wire' ? 'shell' : 'body', 18)}<span>${l}</span>${navState.style === v ? '<kbd>✓</kbd>' : ''}</button>`;
      const pj = (v, l) => `<button type="button" class="fmi${(navState.proj || 'persp') === v ? ' on' : ''}" data-cmd="vproj" data-v="${v}"><span>${l}</span>${(navState.proj || 'persp') === v ? '<kbd>✓</kbd>' : ''}</button>`;
      html = '<div class="fmh">Visueller Stil</div>' + st('shadedEdges', 'Schattiert mit sichtbaren Kanten') + st('shaded', 'Schattiert') + st('wire', 'Drahtkörper')
        + '<div class="fmh">Kamera</div>' + pj('persp', 'Perspektivisch') + pj('ortho', 'Orthografisch');
    } else if (key === 'ws') {
      const dr = ctx.mode === 'drawing', ne = ctx.mode === 'nesting', re = ctx.mode === 'render', gd = ctx.mode === 'gd', de = !dr && !ne && !re && !gd;
      html = `<button type="button" class="fmi${de ? ' on' : ''}" data-cmd="ws-design">${icon('extrude', 18)}<span>Konstruktion</span>${de ? '<kbd>✓</kbd>' : ''}</button>`
        + `<button type="button" class="fmi${dr ? ' on' : ''}" data-cmd="${dr ? 'ws-design' : 'drawing'}">${icon('drawing', 18)}<span>Zeichnung</span>${dr ? '<kbd>✓</kbd>' : ''}</button>`
        + `<button type="button" class="fmi${ne ? ' on' : ''}" data-cmd="${ne ? 'ws-design' : 'nest'}">${icon('nest', 18)}<span>Verschachtelung</span>${ne ? '<kbd>✓</kbd>' : ''}</button>`
        + `<button type="button" class="fmi${re ? ' on' : ''}" data-cmd="${re ? 'ws-design' : 'render'}">${icon('render', 18)}<span>Rendern</span>${re ? '<kbd>✓</kbd>' : ''}</button>`
        + `<button type="button" class="fmi${gd ? ' on' : ''}" data-cmd="${gd ? 'ws-design' : 'gd-open'}">${icon('topo', 18)}<span>Generatives Design</span>${gd ? '<kbd>✓</kbd>' : ''}</button>`;
    } else {
      const [tid, gid] = key.split(':');
      const sk = tid === 'sketch';
      const three = sk && isSketch3D();
      const g = sk ? (three ? SKETCH3D_GROUPS : SKETCH_GROUPS).find(x => x.id === gid) : (findTab(tid) || RTABS.find(t => t.id === tid)).groups.find(x => x.id === gid);
      html = g.items.map(id => {
        if (id === '-') return '<hr>';
        const [ic, label, k] = (sk ? (three ? S3CMD : SCMD) : RCMD)[id];
        const dis = !sk && g.off && g.off.includes(id);
        return `<button type="button" class="fmi" ${sk ? 'data-tool' : 'data-cmd'}="${id}"${dis ? ` disabled title="${esc(offTip(id))}"` : ''}>${icon(ic, 18)}<span>${esc(label)}</span>${k && !dis ? `<kbd>${esc(k)}</kbd>` : ''}</button>`;
      }).join('');
    }
    const m = document.createElement('div');
    m.id = 'fmenu';
    m.className = `fmenu m-${key.startsWith('sketch:') ? 's' : ''}${key.split(':')[1] || 'ws'}`;
    m.innerHTML = html;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = `${Math.min(r.left, innerWidth - m.offsetWidth - 8)}px`;
    m.style.top = key.startsWith('nav:') ? `${r.top - m.offsetHeight - 4}px` : `${r.bottom + 2}px`;
    btn.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#fmenu')) { closeRibbonMenu(); e.stopPropagation(); } }, true);
  document.addEventListener('pointerdown', e => {
    if (!$('#fmenu')) return;
    if (e.target.closest('#fmenu') || e.target.closest('[data-menu]')) return;
    closeRibbonMenu();
  }, true);
  document.addEventListener('click', e => {
    const mb = e.target.closest('[data-menu]');
    if (mb) { openRibbonMenu(mb); return; }
    const tb = e.target.closest('[data-rtab]');
    if (tb) { ribbonTab = tb.dataset.rtab; try { localStorage.setItem('cc.tab', ribbonTab); } catch (_) { /* egal */ } closeRibbonMenu(); renderRibbon(); return; }
    if (e.target.closest('#fmenu [data-cmd], #fmenu [data-tool]')) setTimeout(closeRibbonMenu, 0);
  });
  /* Markierungsmenü: Rechtsklick ins Ansichtsfenster */
  function closeMarking() { const m = $('#marking'); if (m) m.remove(); }
  function openMarking(x, y) {
    closeMarking();
    const sk = ctx.mode === 'sketch' && ctx.editor;
    const it = (kind, id, ic, label) => ({ kind, id, ic, label });
    const radial = sk
      ? [it('tool', 'line', 'line', 'Linie'), it('cmd', 'undo', 'undo', 'Rückgängig'), it('tool', 'circle', 'circle', 'Kreis'), it('tool', 'dim', 'dim', 'Bemaßung'),
        it('cmd', 'sketch-finish', 'check', 'Skizze fertig stellen'), it('tool', 'trim', 'trim', 'Stutzen'), it('tool', 'rect', 'rect', 'Rechteck'), it('tool', 'offset', 'offset', 'Versatz')]
      : [ctx.lastCmd ? it('cmd', ctx.lastCmd, RCMD[ctx.lastCmd][0], `Wiederholen: ${RCMD[ctx.lastCmd][1]}`) : it('cmd', 'redo', 'redo', 'Wiederholen'), it('cmd', 'undo', 'undo', 'Rückgängig'),
        it('cmd', 'presspull', 'presspull', 'Drücken/Ziehen'), it('cmd', 'hole', 'hole', 'Bohrung'), it('cmd', 'move', 'move', 'Verschieben/Kopieren'),
        it('cmd', 'extrude', 'extrude', 'Extrusion'), it('cmd', 'sketch', 'sketch', 'Skizze erstellen'), it('cmd', 'fillet', 'fillet', 'Verrunden')];
    let list = sk ? [it('tool', 'arc', 'arc', 'Bogen'), it('tool', 'spline', 'spline', 'Spline'), it('tool', 'fillet', 'sfillet', 'Verrundung'), it('cmd', 'fit', 'fit', 'Einpassen')]
      : [it('cmd', 'measure', 'measure', 'Messen'), it('cmd', 'section', 'section', 'Querschnittanalyse'), it('cmd', 'fit', 'fit', 'Einpassen'), it('cmd', 'home', 'home', 'Startansicht')];
    // gewählte Skizzenkurven: Normal/Konstruktion oben in der Liste
    const kurven = sk && ctx.sketchState && (ctx.sketchState.sel || []).some(k => k !== 'point' && k !== 'text' && k !== 'rule' && k !== '?');
    if (kurven) list = [it('cmd', 'cons-sel', 'line', 'Normal/Konstruktion (X)'), ...list];
    // Befehle zur Vorauswahl oben in der Liste
    if (!sk && ctx.mode === 'model' && selCount()) {
      const ctx = [];
      if (ctx.modelSel.edges.length) ctx.push(it('cmd', 'fillet', 'fillet', 'Verrunden'), it('cmd', 'chamfer', 'chamfer', 'Fase'), it('cmd', 'weld', 'weld', 'Schweißnaht'));
      if (ctx.modelSel.faces.length === 1 && ctx.modelSel.faces[0].info.type === 'PLANE') ctx.push(it('cmd', 'presspull', 'presspull', 'Drücken/Ziehen'), it('cmd', 'sel-lookat', 'lookat', 'Ansicht auf'));
      else if (ctx.modelSel.faces.length === 1 && ctx.modelSel.faces[0].info.type === 'CYLINDRE') ctx.push(it('cmd', 'presspull', 'presspull', 'Drücken/Ziehen'));
      if (ctx.modelSel.faces.length === 1 && ctx.modelSel.faces[0].info.type === 'CYLINDRE') ctx.push(it('cmd', 'thread', 'thread', 'Gewinde'));
      if (ctx.modelSel.faces.length && ctx.modelSel.faces.every(r => r.info.type === 'CYLINDRE')) ctx.push(it('cmd', 'defeature', 'defeature', 'Elemente entfernen'));
      if (ctx.modelSel.faces.length) ctx.push(it('cmd', 'shell', 'shell', 'Wandstärke'), it('cmd', 'draft', 'draft', 'Formschräge'), it('cmd', 'sel-props', 'measure', 'Eigenschaften des Körpers'), it('cmd', 'sel-delete', 'trash', 'Körper entfernen'));
      ctx.push(it('cmd', 'sel-clear', 'close', 'Auswahl aufheben'));
      list = ctx;
    }
    const attr = i => (i.kind === 'tool' ? `data-tool="${i.id}"` : `data-cmd="${i.id}"`);
    const R = 96, ang = [-90, -45, 0, 45, 90, 135, 180, 225];
    const m = document.createElement('div');
    m.id = 'marking';
    m.className = 'marking';
    m.style.left = `${x}px`; m.style.top = `${y}px`;
    m.innerHTML = '<i class="mk-hub"></i>' + radial.map((i, k) => {
      const a = ang[k] * Math.PI / 180, dx = Math.cos(a) * R, dy = Math.sin(a) * R * 0.78;
      const side = Math.abs(dx) < 1 ? 'c' : dx > 0 ? 'r' : 'l';
      return `<button type="button" class="mk mk-${side}" ${attr(i)} style="left:${dx.toFixed(1)}px;top:${dy.toFixed(1)}px">${icon(i.ic, 16)}<span>${esc(i.label)}</span></button>`;
    }).join('') + `<div class="mk-list" style="top:${(R * 0.78 + 34).toFixed(0)}px">${list.map(i => `<button type="button" ${attr(i)}>${icon(i.ic, 15)}<span>${esc(i.label)}</span></button>`).join('')}</div>`;
    document.body.appendChild(m);
  }
  {
    const cvEl = $('#cv');
    let rdown = null;
    ctx.vp.onRightClick = (x, y) => openMarking(x, y); // Rechtsklick, den die Navigation (Rechts dreht) gefangen hat
    cvEl.addEventListener('pointerdown', e => { if (e.button === 2) rdown = { x: e.clientX, y: e.clientY }; else closeMarking(); });
    cvEl.addEventListener('pointerup', e => {
      if (e.button !== 2 || !rdown) return;
      const moved = Math.abs(e.clientX - rdown.x) + Math.abs(e.clientY - rdown.y) > 4;
      rdown = null;
      if (!moved) openMarking(e.clientX, e.clientY);
    });
    // Kein Browser-/WebView-Kontextmenü in der App: das Markierungsmenü öffnet beim Loslassen unter dem
    // Zeiger, das folgende contextmenu trifft dann das Menü statt der Zeichenfläche. Textfelder behalten ihr Menü
    // (Kopieren, Einfügen).
    document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault(); });
    document.addEventListener('pointerdown', e => { if ($('#marking') && !e.target.closest('#marking')) closeMarking(); }, true);
    document.addEventListener('click', e => { if (e.target.closest('#marking [data-cmd], #marking [data-tool]')) setTimeout(closeMarking, 0); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#marking')) { closeMarking(); e.stopPropagation(); } }, true);
  }

  /* Befehlsdialog am Kopf verschieben */
  {
    const dlg = $('#dialog');
    dlg.addEventListener('pointerdown', e => {
      const hd = e.target.closest('#dialog > header');
      if (!hd || e.target.closest('input, button, select')) return;
      const vr = $('#viewport').getBoundingClientRect(), r = dlg.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = ev => {
        const x = Math.max(0, Math.min(vr.width - r.width, ev.clientX - vr.left - ox)), y = Math.max(0, Math.min(vr.height - 60, ev.clientY - vr.top - oy));
        dlg.style.left = `${x}px`; dlg.style.top = `${y}px`; dlg.style.right = 'auto';
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  /* Navigationsleiste unten: Orbit, Ansicht auf, Verschieben, Zoom, Einpassen | Anzeige, Raster */
  const navState = { tool: null, style: 'shadedEdges', grid: true, filter: 'all' };
  try { Object.assign(navState, JSON.parse(localStorage.getItem('cc.nav') || '{}'), { tool: null }); } catch (_) { /* egal */ }
  function saveNav() { try { localStorage.setItem('cc.nav', JSON.stringify({ style: navState.style, grid: navState.grid, filter: navState.filter, proj: navState.proj || 'persp' })); } catch (_) { /* egal */ } }
  /* Auswahlfilter: Alles, Körper, Flächen oder Kanten */
  const SEL_FILTERS = [['all', 'Alles'], ['body', 'Körper'], ['face', 'Flächen'], ['edge', 'Kanten']];
  // Auswahlwerkzeuge (Fenster, Freiform, Farbauswahl = über das Modell malen); nur für diese Sitzung
  const SEL_PRIOS = [['kante', 'Standard (Kanten zuerst)'], ['flaeche', 'Flächenpriorität'], ['koerper', 'Körperpriorität']];
  const SEL_TOOLS = [['window', 'Fensterauswahl'], ['freeform', 'Freiformauswahl'], ['paint', 'Farbauswahl (über das Modell malen)']];
  const modelPickMode = () => ({ body: 'face', face: 'face', edge: 'edge' }[navState.filter] || 'any');
  function renderNavbar() {
    const b = (cmd, ic, t, pressed) => `<button type="button" data-cmd="${cmd}" title="${t}" aria-label="${t}"${pressed != null ? ` aria-pressed="${pressed}"` : ''}>${icon(ic, 18)}</button>`;
    const s = ctx.navScheme, sw = s === 'mitte', inv = s === 'ftasten'; // Einstellungen → Allgemein → Bedienung
    const orbitT = { mitte: 'Orbit (mittlere Maustaste)', ftasten: 'Orbit (Umschalt + mittlere Maustaste, F4)', rechts: 'Orbit (rechte Maustaste ziehen)', altumschalt: 'Orbit (Alt + Umschalt + linke Maustaste)', mitteumschalt: 'Orbit (mittlere Maustaste)' }[s] || 'Orbit (Umschalt + mittlere Maustaste)';
    const panT = { mitte: 'Verschieben (Strg + mittlere Maustaste)', ftasten: 'Verschieben (mittlere Maustaste, F2)', altumschalt: 'Verschieben (Alt + Umschalt + mittlere Maustaste)', mitteumschalt: 'Verschieben (Umschalt + mittlere Maustaste)' }[s] || 'Verschieben (mittlere Maustaste)';
    $('#navbar').innerHTML = b('nav-orbit', 'orbit', orbitT, navState.tool === 'orbit')
      + b('lookat', 'lookat', 'Ansicht auf: Fläche anklicken', navState.tool === 'lookat')
      + b('nav-pan', 'pan', panT, navState.tool === 'pan')
      + b('nav-zoom', 'zoom', inv ? 'Zoom (Mausrad, F3)' : s === 'altumschalt' ? 'Zoom (Mausrad, Alt + Umschalt + rechte Maustaste)' : s === 'mitteumschalt' ? 'Zoom (Mausrad, Strg + mittlere Maustaste)' : 'Zoom (Mausrad)', navState.tool === 'zoom')
      + b('fit', 'fit', sw ? 'Einpassen (F)' : 'Einpassen (Pos1)') + '<span class="nsep"></span>'
      + `<button type="button" data-menu="nav:display" title="Anzeigeeinstellungen" aria-label="Anzeigeeinstellungen">${icon('display', 18)}${caretSvg}</button>`
      + b('nav-grid', 'grid', 'Raster ein/aus', navState.grid) + '<span class="nsep"></span>'
      + `<button type="button" data-menu="nav:filter" title="Auswahlfilter: ${(SEL_FILTERS.find(x => x[0] === navState.filter) || SEL_FILTERS[0])[1]}" aria-label="Auswahlfilter" aria-pressed="${navState.filter !== 'all'}">${icon('filter', 18)}${caretSvg}</button>`;
    $('.cubehome').innerHTML = icon('home', 15);
  }
  function setNavTool(t) {
    navState.tool = navState.tool === t ? null : t;
    ctx.vp.setNavTool(navState.tool === 'lookat' ? null : navState.tool);
    renderNavbar();
    if (navState.tool === 'lookat') toast('Fläche anklicken, die zur Ansicht gedreht werden soll.');
  }
  ctx.vp.setVisualStyle(navState.style);
  if (navState.proj === 'ortho') ctx.vp.setProjection('ortho');
  ctx.vp.setGridVisible(navState.grid);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && navState.tool) { setNavTool(navState.tool); } });

  /* Befehlssuche (Taste S): tippen, mit Pfeiltasten wählen, Enter führt aus */
  let mouseXY = [innerWidth / 2, innerHeight / 2];
  addEventListener('pointermove', e => { mouseXY = [e.clientX, e.clientY]; }, { passive: true });
  const EXTRA_CMDS = { fit: ['fit', 'Einpassen', 'Pos1'], home: ['home', 'Startansicht'], 'nav-grid': ['grid', 'Raster ein/aus'], save: ['save', 'Speichern', 'Strg+S'], open: ['folder', 'Öffnen', 'Strg+O'], undo: ['undo', 'Rückgängig', 'Strg+Z'], redo: ['redo', 'Wiederholen', 'Strg+Y'] };
  function cmdSearchList(q) {
    const sk = ctx.mode === 'sketch' && ctx.editor;
    const all = sk
      ? [...Object.entries(SCMD).map(([id, [ic, label, key]]) => ({ kind: 'tool', id, ic, label, key })), { kind: 'cmd', id: 'sketch-finish', ic: 'check', label: 'Skizze fertig stellen' }, ...CONSTRAINTS.map(([id, g, l]) => ({ kind: 'constraint', id, ic: 'dim', label: `Abhängigkeit: ${l}`, glyph: g }))]
      : [...Object.entries(RCMD), ...Object.entries(EXTRA_CMDS)].map(([id, [ic, label, key]]) => ({ kind: 'cmd', id, ic, label, key }));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(c => words.every(w => c.label.toLowerCase().includes(w) || c.id.toLowerCase().includes(w))).slice(0, 12);
  }
  function openCmdSearch() {
    closeCmdSearch();
    const box = document.createElement('div');
    box.id = 'cmdsearch';
    box.className = 'cmdsearch';
    box.innerHTML = `<input type="text" placeholder="Befehl suchen …" spellcheck="false" autocomplete="off" aria-label="Befehl suchen"><div class="cs-list"></div>`;
    document.body.appendChild(box);
    box.style.left = `${Math.max(8, Math.min(innerWidth - 300, mouseXY[0] - 20))}px`;
    box.style.top = `${Math.max(8, Math.min(innerHeight - 340, mouseXY[1] - 16))}px`;
    const inp = box.querySelector('input'), list = box.querySelector('.cs-list');
    let items = [], sel = 0;
    const draw = () => {
      items = cmdSearchList(inp.value);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.innerHTML = items.length ? items.map((c, i) => `<button type="button" class="cs-item${i === sel ? ' on' : ''}" ${c.kind === 'tool' ? 'data-tool' : c.kind === 'constraint' ? 'data-constraint' : 'data-cmd'}="${c.id}">${c.glyph ? `<b class="cs-glyph">${esc(c.glyph)}</b>` : icon(c.ic, 16)}<span>${esc(c.label)}</span>${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</button>`).join('') : '<p class="cs-none">Nichts gefunden</p>';
    };
    inp.addEventListener('input', () => { sel = 0; draw(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { const b = list.querySelectorAll('.cs-item')[sel]; e.preventDefault(); e.stopPropagation(); if (b) b.click(); else closeCmdSearch(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCmdSearch(); }
    });
    draw();
    inp.focus();
  }
  function closeCmdSearch() { const b = $('#cmdsearch'); if (b) b.remove(); }
  document.addEventListener('pointerdown', e => { if ($('#cmdsearch') && !e.target.closest('#cmdsearch')) closeCmdSearch(); }, true);
  document.addEventListener('click', e => { if (e.target.closest('#cmdsearch .cs-item')) setTimeout(closeCmdSearch, 0); });

  /* Skizzen-Reiter (Kontext-Reiter): Werkzeuge als Symbole, Gruppen mit Aufklappmenü, „Skizze fertig stellen“ */
  const SCMD = {
    line: ['line', 'Linie', 'L'], cline: ['cline', 'Mittelpunktlinie'], rect: ['rect', 'Rechteck mit 2 Punkten', 'R'], rectc: ['rectc', 'Rechteck mit Mittelpunkt', 'Umschalt+R'], rect3: ['rect3', 'Rechteck mit 3 Punkten'],
    circle: ['circle', 'Kreis mit Mittelpunkt', 'C'], circle2: ['circle2', 'Kreis mit 2 Punkten'], circle3: ['circle3', 'Kreis mit 3 Punkten'], tcircle2: ['tcircle2', 'Kreis tangential an 2 Linien'], tcircle3: ['tcircle3', 'Kreis tangential an 3 Linien'], arc: ['arc', 'Bogen durch 3 Punkte', 'A'], carc: ['carc', 'Bogen mit Mittelpunkt'], tarc: ['tarc', 'Tangentialbogen', 'Umschalt+A'],
    polygon: ['polygon', 'Vieleck (einbeschrieben)'], polygonc: ['polygon', 'Vieleck (umschrieben, Schlüsselweite)'], polygone: ['polygon', 'Vieleck über Kante'], slotov: ['slot', 'Langloch (Gesamtlänge)'], slotc: ['slot', 'Langloch (Mittelpunkt)'], slotarc: ['slot', 'Bogen-Langloch (Mittelpunkt)'], slotarc3: ['slot', 'Bogen-Langloch (3 Punkte)'], project: ['project', 'Projizieren', 'P'], intersect: ['section', 'Schnittkurve'], ellipse: ['ellipse', 'Ellipse'], slot: ['slot', 'Langloch (Mitte zu Mitte)'], spline: ['spline', 'Spline'], cvspline: ['spline', 'Spline (Steuerpunkte)'], conic: ['spline', 'Konische Kurve'], blend: ['spline', 'Verschmelzungskurve'], autocons: ['params', 'Abhängigkeiten automatisch (waagrecht/senkrecht, deckungsgleich, tangential)'], autodim: ['params', 'Auto-Abhängigkeit von Bezug (Bezugspunkt anklicken, dann Maße bis die Skizze bestimmt ist)'],
    point: ['point', 'Punkt'], text: ['text', 'Text', 'Umschalt+T'], mirror: ['mirror', 'Spiegeln', 'M'], cpattern: ['cpattern', 'Kreisförmige Anordnung'],
    lpattern: ['lpattern', 'Rechteckige Anordnung'], dim: ['dim', 'Skizzenbemaßung', 'D'],
    fillet: ['sfillet', 'Verrundung', 'F'], chamfer: ['schamfer', 'Fase', 'Umschalt+F'], trim: ['trim', 'Stutzen', 'T'], brk: ['brk', 'Unterbrechen'], extend: ['extend', 'Dehnen', 'E'],
    offset: ['offset', 'Versatz', 'O'], move: ['move', 'Verschieben/Kopieren', 'V'], rotate: ['rotate', 'Drehen', 'Umschalt+V'], scale: ['scale', 'Skizze skalieren']
  };
  const SKETCH_GROUPS = [
    { id: 'create', label: 'Erstellen', show: ['line', 'rect', 'circle', 'arc', 'polygon', 'slot', 'spline', 'project'], items: ['line', 'cline', 'rect', 'rectc', 'rect3', 'circle', 'circle2', 'circle3', 'tcircle2', 'tcircle3', 'arc', 'carc', 'tarc', 'polygon', 'polygonc', 'polygone', 'ellipse', 'slot', 'slotov', 'slotc', 'slotarc', 'slotarc3', 'spline', 'cvspline', 'conic', 'blend', 'point', 'text', '-', 'mirror', 'cpattern', 'lpattern', '-', 'project', 'intersect', '-', 'dim'] },
    { id: 'modify', label: 'Ändern', show: ['fillet', 'trim', 'extend', 'offset'], items: ['fillet', 'chamfer', 'trim', 'brk', 'extend', 'offset', '-', 'move', 'rotate', 'scale', '-', 'autocons', 'autodim'] },
    { id: 'dimension', label: 'Bemaßung', show: ['dim'], items: ['dim'] }
  ];
  /* 3D-Skizze: nur die Werkzeuge, die es im Raum gibt – ohne Abhängigkeiten und Bemaßung */
  const S3CMD = {
    line: ['line', 'Linie', 'L'], arc3: ['arc', 'Bogen durch drei Punkte', 'A'], circle3: ['circle', 'Kreis durch drei Punkte', 'C'],
    spline: ['spline', 'Spline'], point: ['point', 'Punkt', 'P'],
  };
  const SKETCH3D_GROUPS = [{ id: 'create', label: 'Erstellen', show: ['line', 'arc3', 'circle3', 'spline', 'point'], items: ['line', 'arc3', 'circle3', 'spline', 'point'] }];
  const isSketch3D = () => !!(ctx.editing && ctx.editing.feature && ctx.editing.feature.type === 'sketch' && !ctx.editing.feature.plane);
  function renderSketchbar() {
    const sbtn = id => { const [ic, label, key] = SCMD[id]; return `<button type="button" class="fbtn" data-tool="${id}" aria-pressed="false" title="${esc(label)}${key ? ` (${key})` : ''}" aria-label="${esc(label)}">${icon(ic, 28)}</button>`; };
    const s3btn = id => { const [ic, label, key] = S3CMD[id]; return `<button type="button" class="fbtn" data-tool="${id}" aria-pressed="false" title="${esc(label)}${key ? ` (${key})` : ''}" aria-label="${esc(label)}">${icon(ic, 28)}</button>`; };
    const finish = `<div class="fgroup g-finish"><div class="ftools"><button type="button" class="fbtn finish" data-cmd="sketch-finish" title="Skizze fertig stellen" aria-label="Skizze fertig stellen">${icon('check', 30)}</button></div><span class="fglabel static">Skizze fertig stellen</span></div>`;
    if (isSketch3D()) {
      $('#sketchbar').innerHTML = `
        <div class="rtabs">
          <button type="button" class="wsbtn" disabled>Konstruktion ${caretSvg}</button>
          ${tabsNow().map(t => `<span class="rtab dim">${esc(t.label)}</span>`).join('')}
          <span class="rtab ctx" aria-selected="true">3D-Skizze</span>
        </div>
        <div class="rbody">
          ${SKETCH3D_GROUPS.map(g => `<div class="fgroup g-s${g.id}"><div class="ftools">${g.show.map(s3btn).join('')}</div><button type="button" class="fglabel" data-menu="sketch:${g.id}">${esc(g.label)} ${caretSvg}</button></div>`).join('')}
          ${finish}
        </div>`;
      return;
    }
    $('#sketchbar').innerHTML = `
      <div class="rtabs">
        <button type="button" class="wsbtn" disabled>Konstruktion ${caretSvg}</button>
        ${tabsNow().map(t => `<span class="rtab dim">${esc(t.label)}</span>`).join('')}
        <span class="rtab ctx" aria-selected="true">Skizze</span>
      </div>
      <div class="rbody">
        ${SKETCH_GROUPS.map(g => `<div class="fgroup g-s${g.id}"><div class="ftools">${g.show.map(sbtn).join('')}</div><button type="button" class="fglabel" data-menu="sketch:${g.id}">${esc(g.label)} ${caretSvg}</button></div>`).join('')}
        <div class="fgroup g-constraints"><div class="ftools cgrid2">${CONSTRAINTS.map(([k, g, l]) => `<button type="button" class="cbtn" data-constraint="${k}" title="${esc(l)} – erst Elemente wählen" aria-label="${esc(l)}">${esc(g)}</button>`).join('')}</div><span class="fglabel static">Abhängigkeiten</span></div>
        ${finish}
      </div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]');
    if (b && !b.disabled) { runCmd(b.dataset.cmd, b); return; }
    const t = e.target.closest('[data-tool]');
    if (t && ctx.editor) { ctx.editor.setTool(ctx.sketchState && ctx.sketchState.tool === t.dataset.tool ? null : t.dataset.tool); return; }
    const c = e.target.closest('[data-constraint]');
    if (c && ctx.editor) ctx.editor.applyConstraint(c.dataset.constraint);
  });

  return { RCMD, SEL_FILTERS, caretSvg, closeRibbonMenu, modelPickMode, navState, openCmdSearch, renderNavbar, renderRibbon, renderSketchbar, saveNav, setNavTool, syncRibbon };
}
