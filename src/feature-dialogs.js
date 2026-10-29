// cantcodecad – Feature-Dialoge (Inhalt je Feature-Art, Rahmen, Eingabefelder) und Manipulatoren.
import { FASTENERS, lengthsFor } from './fasteners.js';
import { FEATURE_TYPES, MATERIALS, toWorld } from './doc.js';
import { markerPoints } from './sketch/model.js';
import { ROLLEN, ROLLEN_KURZ, ELASTIC } from './sim/topo.js';
import { GITTER_TYPEN } from './sim/gitter.js';
import { FIELD_NAMES, PROFILE_KINDS, profileArea } from './steel.js';
import { flangeFlat } from './sheet.js';
import { icon } from './icons.js';
import { UNIT, UF, lenToField } from './units.js';
import { selectRegions } from './sketch/profiles.js';
import { FELDER, FELD_NAME, EINHEIT } from './motion-ui.js';

/* Aus main.js ausgelagert. ctx liefert den Zustand der Hauptdatei über Getter (immer der aktuelle Wert):
   THREADS, doc, editing, jointAnim, lastBuild, mode, overhang, section, vp; Funktionen werden weitergereicht. */
export function setupFeatureDialogs(ctx) {
  const $ = (...a) => ctx.$(...a);
  const bodyChips = (...a) => ctx.bodyChips(...a);
  const bodyName = (...a) => ctx.bodyName(...a);
  const compChips = (...a) => ctx.compChips(...a);
  const compName = (...a) => ctx.compName(...a);
  const esc = (...a) => ctx.esc(...a);
  const featureChecklist = (...a) => ctx.featureChecklist(...a);
  const fmt = (...a) => ctx.fmt(...a);
  const holeInfo = (...a) => ctx.holeInfo(...a);
  const num = (...a) => ctx.num(...a);
  const planeLabel = (...a) => ctx.planeLabel(...a);
  const presetOptions = (...a) => ctx.presetOptions(...a);
  const profileRegions = (...a) => ctx.profileRegions(...a);
  const refreshWorkPlanes = (...a) => ctx.refreshWorkPlanes(...a);
  const scheduleBuild = (...a) => ctx.scheduleBuild(...a);
  const selectionInfo = (...a) => ctx.selectionInfo(...a);
  const sheetRule = (...a) => ctx.sheetRule(...a);
  const featureExpr = (...a) => ctx.featureExpr(...a);
  /* ---------------- Dialoge ---------------- */
  function closeDialog() { $('#dialog').hidden = true; $('#dialog').innerHTML = ''; }
  /* Einstellungen → Einheiten: Felder mit „mm“ dahinter sind Längenfelder und zeigen bzw. nehmen die
     Anzeigeeinheit; intern bleibt mm. main.js rechnet Eingaben in Feldern mit data-u="len" zurück.
     data-dim sagt außerdem, welche Größe der Ausdruck haben darf: „mm“ für Längen, „deg“ für Winkel –
     ein Ausdruck in mm² ist in einem Längenfeld ein Fehler, keine stille Zahl. */
  function applyUnits(d) {
    d.querySelectorAll('input[data-k]').forEach(inp => {
      const em = inp.parentElement && inp.parentElement.querySelector('em');
      if (!em) return;
      const einheit = em.textContent;
      if (einheit === 'mm') inp.dataset.dim = 'mm';
      else if (einheit === '°') inp.dataset.dim = 'deg';
      else return;
      if (einheit !== 'mm') return;
      inp.dataset.u = 'len';
      if (UF === 1) return;
      em.textContent = UNIT;
      if (!inp.parentElement.classList.contains('fx') && inp.value !== '') inp.value = lenToField(inp.value);
      if (inp.type === 'number') inp.step = 'any';
    });
  }
  /* Wert aus dem Modell (Griff, Drehring) ins Feld schreiben, Längen in der Anzeigeeinheit */
  const setField = (inp, v) => { if (inp) inp.value = inp.dataset.u === 'len' ? lenToField(v) : v; };

  function fieldNum(k, label, v, unit, step = 1, extra = '') {
    const ex = ctx.editing && ctx.editing.feature && featureExpr(ctx.editing.feature, k);
    return `<label class="row"><span>${esc(label)}</span><span class="num${ex ? ' fx' : ''}"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-nx="1" data-step="${step}" data-k="${k}" value="${esc(ex || v)}" title="Zahl oder Ausdruck, z. B. 12, 40/2 oder breite/2" ${extra}><em>${unit}</em></span></label>`;
  }
  function fieldSeg(k, label, v, options, buttons = false) {
    // ab drei Möglichkeiten eine Auswahlliste, sonst Umschalter
    if (options.length >= 3 && !buttons) return `<label class="row"><span>${esc(label)}</span><select data-segsel="${k}">${options.map(([val, l]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    return `<div class="row col"><span>${esc(label)}</span><div class="seg" role="radiogroup">${options.map(([val, l]) => `<button type="button" role="radio" aria-checked="${String(val) === String(v)}" data-k="${k}" data-v="${esc(val)}">${esc(l)}</button>`).join('')}</div></div>`;
  }

  function dialogShell(f, body, opts = {}) {
    const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
    const err = st && !st.ok && !opts.noErr ? `<p class="derr">${esc(st.error)}</p>` : '';
    return `<header>${icon(FEATURE_TYPES[f.type].icon, 18)}<b class="dtype">${esc(f.type === 'sketch' ? 'Skizzenpalette' : FEATURE_TYPES[f.type].label)}</b><input class="dname" data-k="name" value="${esc(f.name)}" aria-label="Name" title="Name in der Zeitleiste"></header>
      <div class="dbody">${body}${err}</div>
      <footer><span class="dinfo" title="Werte ändern, die Vorschau rechnet mit. Enter = OK, Esc = Abbrechen.">i</span><button type="button" class="btn primary" data-cmd="ok">${opts.okLabel || 'OK'}</button><button type="button" class="btn" data-cmd="cancel">Abbrechen</button></footer>`;
  }

  function profileInfo(f) {
    const pr = profileRegions(f);
    if (!pr) return 'Skizze nicht gefunden.';
    // offene Linienzüge zählen nur bei „Dünn extrudieren" – sonst bleibt die Skizze unvollständig
    const kz = f.thin ? (pr.chains || []).length : 0;
    if (!pr.regions.length) return kz ? `Die Skizze hat kein geschlossenes Profil, aber offene Linienzüge (${kz}) – die werden als Wand mit eigener Dicke extrudiert.`
      : 'Die Skizze hat noch kein geschlossenes Profil.';
    const n = selectRegions(pr.regions, f.profiles).length;
    return (f.profiles ? `${n} von ${pr.regions.length} Flächen gewählt.` : `Automatisch: ${n} von ${pr.regions.length} Flächen (innere Formen werden zu Löchern).`)
      + (kz ? ` Dazu offene Linienzüge (${kz}) als Wand.` : '');
  }

  const OPS = [['join', 'Verbinden'], ['cut', 'Ausschneiden'], ['intersect', 'Schnittmenge'], ['new', 'Neuer Körper'], ['newcomp', 'Neue Komponente']];
  /* Ziehpfeil im Modell für Abstände (Extrusion, Drücken/Ziehen) */
  let manipKey = '', triadKey = '';
  /* Mitte (Hüllquader) der gezeigten Körper */
  function bodiesCenter(m, ids) {
    if (!m || !m.bodies || !m.positions || !m.index) return null;
    const P = m.positions, I = m.index, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    let any = false;
    m.bodies.forEach(b => {
      if (!ids.includes(b.id)) return;
      for (let t = b.tris[0]; t < b.tris[1]; t++) { const j = I[t] * 3; for (let k = 0; k < 3; k++) { if (P[j + k] < mn[k]) mn[k] = P[j + k]; if (P[j + k] > mx[k]) mx[k] = P[j + k]; } any = true; }
    });
    return any ? mn.map((v, k) => (v + mx[k]) / 2) : null;
  }
  /* Verschiebe-Griff mit drei Pfeilen */
  function updateTriad() {
    const f = ctx.editing && ctx.mode === 'feature' ? ctx.editing.feature : null;
    if (!f || f.type !== 'move' || !(f.bodies || []).length || !ctx.lastBuild || !ctx.lastBuild.mesh) { if (triadKey) { ctx.vp.setTriad(null); triadKey = ''; } return; }
    const vals = [Number(f.dx) || 0, Number(f.dy) || 0, Number(f.dz) || 0], free = (f.mode || 'free') === 'free';
    const key = `mv:${f.id}:${f.bodies.join(',')}:${free}`;
    if (key === triadKey) { ctx.vp.updateTriad(vals); if (ctx.vp.triad) { ctx.vp.triad.axis = 'XYZ'.indexOf(f.axis || 'Z'); ctx.vp.triad.angle = Number(f.angle) || 0; } return; }
    const c = bodiesCenter(ctx.lastBuild.mesh, f.bodies);
    if (!c) return;
    triadKey = key;
    ctx.vp.setTriad({
      origin: c.map((v, i) => v - vals[i]), values: vals,
      onChange: (i, v) => {
        if (!ctx.editing) return;
        const k = ['dx', 'dy', 'dz'][i];
        ctx.editing.feature[k] = Math.round(v * 1000) / 1000;
        setField($(`#dialog [data-k="${k}"]`), ctx.editing.feature[k]);
        scheduleBuild(60);
      },
      onEnd: () => scheduleBuild(0),
      /* Drehring (nur bei „Abstand/Winkel“): eine Drehung je Verschieben – ein anderer Ring ersetzt Achse und Winkel.
         Ohne bisherige Drehung kommt der Drehpunkt in die Mitte der Körper, damit sie um den Griff drehen. */
      ...(free ? {
        axis: 'XYZ'.indexOf(f.axis || 'Z'), angle: Number(f.angle) || 0,
        onRotate: (i, deg) => {
          if (!ctx.editing) return;
          const F = ctx.editing.feature, ax = 'XYZ'[i];
          if (!(Number(F.angle) || 0)) [F.px, F.py, F.pz] = c.map((v, j) => Math.round((v - vals[j]) * 1000) / 1000);
          const axisChanged = F.axis !== ax;
          F.axis = ax; F.angle = deg;
          if (axisChanged) renderFeatureDialog(true, false);
          else { const inp = $('#dialog [data-k="angle"]'); if (inp) inp.value = deg; ['px', 'py', 'pz'].forEach(k => setField($(`#dialog [data-k="${k}"]`), F[k])); }
          scheduleBuild(60);
        }
      } : {})
    });
  }
  function updateManip() {
    updateTriad();
    const f = ctx.editing && ctx.mode === 'feature' ? ctx.editing.feature : null;
    let m = null;
    if (f && f.type === 'extrude' && (f.extent || 'distance') === 'distance' && !ctx.editing.pickTarget) {
      const pr = profileRegions(f);
      const chosen = pr ? selectRegions(pr.regions, f.profiles) : [];
      if (chosen.length) {
        const pl = pr.sk.plane, s = chosen[0].sample;
        const n = f.direction === 'reverse' ? pl.n.map(v => -v) : pl.n;
        /* „Start: Von Objekt“: der Griff sitzt auf der Startfläche, nicht auf der Profilebene */
        let base = 0;
        if (f.start === 'object' && f.startRef && f.startRef.n) {
          const c = f.startRef.n.reduce((a, v, i) => a + v * pl.n[i], 0);
          if (Math.abs(c) > 1e-6) base = (f.startRef.dist - f.startRef.n.reduce((a, v, i) => a + v * pl.o[i], 0)) / c;
        }
        const origin = toWorld(pl, s[0], s[1]).map((v, i) => v + pl.n[i] * base);
        m = { key: `e:${f.id}:${f.sketch}:${JSON.stringify(f.profiles)}:${f.direction}`, origin, dir: n, value: Number(f.distance) || 0, scale: f.direction === 'symmetric' ? 0.5 : 1, min: 0.1 };
      }
    } else if (f && f.type === 'presspull' && f.face) {
      if (f.face.t === 'PLANE') m = { key: `p:${f.id}:${JSON.stringify(f.face)}`, origin: f.face.p, dir: f.face.n, value: Number(f.distance) || 0 };
      else if (f.handle) m = { key: `p:${f.id}:${JSON.stringify(f.face)}`, origin: f.handle.p, dir: f.handle.n, value: Number(f.distance) || 0 };
    }
    if (!m) { if (manipKey) { ctx.vp.setManipulator(null); manipKey = ''; } return; }
    if (m.key === manipKey) { ctx.vp.updateManipulator(m.value); return; }
    manipKey = m.key;
    ctx.vp.setManipulator({
      ...m,
      onChange: v => {
        if (!ctx.editing) return;
        if (m.min != null && v < m.min) v = m.min;
        v = Math.round(v * 1000) / 1000;
        ctx.editing.feature.distance = v;
        setField($('#dialog [data-k="distance"]'), v);
        scheduleBuild(60);
      },
      onEnd: () => scheduleBuild(0)
    });
  }

  function frameInfo(f) {
    const mine = ((ctx.lastBuild && ctx.lastBuild.frames) || []).filter(x => x.feature === f.id);
    if (!mine.length) return '';
    let area = 0; try { area = profileArea({ ...f, h: f.kind === 'square' || f.kind === 'round' || f.kind === 'bar' ? f.w : f.h }); } catch (_) { area = 0; }
    const total = mine.reduce((a, x) => a + x.Lmax, 0);
    return `${mine.length} Stäbe · zusammen ${fmt(total, 0)} mm${area ? ` · ca. ${fmt(area * total / 1000 * 7.85 / 1000, 2)} kg Stahl` : ''}`;
  }
  function renderFeatureDialog(full, focus = full) {
    const d = $('#dialog'), f = ctx.editing && ctx.editing.feature;
    if (!f || f.type === 'sketch') return;
    updateManip();
    if (!full && !d.hidden) {
      const ti = d.querySelector('.tinfo');
      if (ti && ['thread', 'sm_convert', 'sm_unfold', 'sm_refold', 'sm_loft', 'sm_corner', 'sm_join', 'defeature', 'topo'].includes(f.type)) { const st = ctx.lastBuild && ctx.lastBuild.status[f.id]; ti.textContent = st && st.info ? 'Ergebnis: ' + st.info : ''; }
      const gi = d.querySelector('.ginfo');
      if (gi) { const st = ctx.lastBuild && ctx.lastBuild.status[f.id]; gi.textContent = st && st.info ? st.info : ''; }
      const wi = d.querySelector('.winfo');
      if (wi) { const st = ctx.lastBuild && ctx.lastBuild.status[f.id]; wi.textContent = st && st.info ? st.info : ''; }
      const coi = d.querySelector('.coilinfo');
      if (coi) { const st = ctx.lastBuild && ctx.lastBuild.status[f.id]; coi.textContent = st && st.info ? st.info : ''; }
      const hi = d.querySelector('.hinfo');
      if (hi && (!f.place || f.place === 'sketch')) hi.textContent = holeInfo(f);
      const info = d.querySelector('.selinfo');
      if (info) info.innerHTML = selectionInfo(f);
      const pi = d.querySelector('.pinfo');
      if (pi) pi.textContent = profileInfo(f);
      const fi = d.querySelector('.frinfo');
      if (fi) fi.textContent = frameInfo(f);
      const ci = d.querySelector('.cinfo');
      if (ci) { const st = ctx.lastBuild && ctx.lastBuild.sheet && ctx.lastBuild.sheet.contour; ci.textContent = st && st.feature === f.id ? `Abgewickelte Länge ${fmt(st.total, 2)} mm · ${st.bends.length} Biegung${st.bends.length === 1 ? '' : 'en'}` : ''; }
      d.querySelectorAll('.bchips[data-field]').forEach(c => { c.outerHTML = bodyChips(f, c.dataset.field); });
      const allBtn = d.querySelector('[data-cmd="all-edges"]');
      if (allBtn) allBtn.setAttribute('aria-pressed', String(!!f.all));
      const autoBtn = d.querySelector('[data-cmd="profiles-auto"]');
      if (autoBtn) autoBtn.setAttribute('aria-pressed', String(!f.profiles));
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      let er = d.querySelector('.derr');
      if (st && !st.ok) { if (!er) { er = document.createElement('p'); er.className = 'derr'; d.querySelector('.dbody').appendChild(er); } er.textContent = st.error; }
      else if (er) er.remove();
      return;
    }
    /* Skizzen für die Auswahl-Listen: eine 3D-Skizze (ohne Ebene) ist im Namen gekennzeichnet –
       als Pfad, Führungsschiene oder Punkteliste ist sie zu gebrauchen, als Profil nicht */
    const sketches = ctx.doc.features.slice(0, ctx.editing.index).filter(x => x.type === 'sketch')
      .map(s => s.plane ? s : { ...s, name: `${s.name} (3D)` });
    const sel = `<label class="row"><span>Skizze</span><select data-k="sketch">${sketches.map(s => `<option value="${s.id}"${s.id === f.sketch ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
    const prof = `<div class="row"><span>Profile</span><span class="btns"><button type="button" class="chip" data-cmd="profiles-auto" aria-pressed="${!f.profiles}">Automatisch</button></span></div><p class="info pinfo">${esc(profileInfo(f))}</p>`;
    const op = fieldSeg('op', 'Vorgang', f.op, OPS)
      + (f.op && f.op !== 'new' && f.op !== 'newcomp' ? `<div class="row col"><span>Objekte</span>${bodyChips(f, 'targets')}</div>` : '');
    let body = '';
    if (f.type === 'extrude' && f.src === 'face') {
      // Profil = ebene Körperfläche: nur Abstand/Alle und Richtung
      const ext = f.extent === 'all' ? 'all' : 'distance', two = f.direction === 'two';
      body = fieldSeg('src', 'Profil', 'face', [['sketch', 'Skizze'], ['face', 'Körperfläche']])
        + `<div class="row"><span>Fläche</span><span class="btns"><button type="button" class="chip" data-cmd="pick-exface" aria-pressed="${ctx.editing.pickTarget === 'exface'}">${f.fromFace ? 'Ebene Fläche ✓' : 'Fläche anklicken …'}</button></span></div>`
        + fieldSeg('extent', 'Umfang', ext, [['distance', 'Abstand'], ['all', 'Alle']])
        + (ext === 'distance' ? fieldNum('distance', two ? 'Abstand Seite 1' : 'Abstand', f.distance, 'mm', 1, 'min="0"') : '')
        + fieldSeg('direction', 'Richtung', f.direction, [['normal', 'Normal'], ['reverse', 'Umgekehrt'], ['symmetric', 'Symmetrisch'], ['two', 'Zwei Seiten']])
        + (two && ext === 'distance' ? fieldNum('dist2', 'Abstand Seite 2', f.dist2 ?? f.distance, 'mm', 1, 'min="0"') : '')
        + '<p class="info small">Mit einer Körperfläche als Profil: die angeklickte ebene Fläche wird entlang ihrer Außennormale extrudiert – als neuer Körper, angefügt oder ausgeschnitten.</p>' + op;
    } else if (f.type === 'extrude') {
      const ext = f.extent || 'distance', two = f.direction === 'two', thin = !!f.thin;
      body = fieldSeg('src', 'Profil', 'sketch', [['sketch', 'Skizze'], ['face', 'Körperfläche']]) + sel + prof + fieldSeg('extent', 'Umfang', ext, [['distance', 'Abstand'], ['toface', 'Bis Fläche'], ['all', 'Alle']])
        + (ext === 'distance' ? fieldNum('distance', two ? 'Abstand Seite 1' : 'Abstand', f.distance, 'mm', 1, 'min="0"') : '')
        + (ext === 'toface' ? `<div class="row"><span>Zielfläche</span><span class="btns"><button type="button" class="chip" data-cmd="pick-toface" aria-pressed="${!!ctx.editing.pickTarget}">${f.toFace ? 'Ebene Fläche ✓' : 'Fläche wählen'}</button></span></div>` + fieldNum('toOffset', 'Versatz', f.toOffset || 0, 'mm', 0.5) : '')
        + (ext !== 'toface' ? fieldSeg('direction', 'Richtung', f.direction, [['normal', 'Normal'], ['reverse', 'Umgekehrt'], ['symmetric', 'Symmetrisch'], ['two', 'Zwei Seiten']]) : '')
        + (two ? fieldNum('dist2', 'Abstand Seite 2', f.dist2 ?? f.distance, 'mm', 1, 'min="0"') : '')
        + (ext === 'distance' && f.direction === 'symmetric' ? fieldSeg('symHalf', 'Abstand gilt', !!f.symHalf, [[false, 'Ganze Länge'], [true, 'Je Seite']]) : '')
        + (ext !== 'all' ? fieldSeg('start', 'Start', f.start || 'plane', [['plane', 'Profilebene'], ['offset', 'Versatz'], ['object', 'Von Objekt']]) : '')
        + (f.start === 'object' ? `<div class="row"><span>Startfläche</span><span class="btns"><button type="button" class="chip" data-cmd="pick-startface" aria-pressed="${ctx.editing.pickTarget === 'startface'}">${f.startRef ? 'Ebene Fläche ✓' : 'Fläche wählen'}</button></span></div>`
          + '<p class="info small">Die Extrusion beginnt auf der angeklickten ebenen Fläche. Der Versatz gilt von dieser Fläche aus, entlang der Extrusionsrichtung.</p>' : '')
        + (f.start === 'offset' || f.start === 'object' ? fieldNum('startOffset', f.start === 'object' ? 'Versatz ab Startfläche' : 'Versatz ab Profilebene', f.startOffset || 0, 'mm', 0.5) : '')
        + fieldSeg('thin', 'Dünn extrudieren', thin, [[false, 'Aus'], [true, 'An']])
        + (thin ? fieldSeg('wall', 'Wand', f.wall || 'side1', [['side1', 'Seite 1'], ['middle', 'Mitte'], ['side2', 'Seite 2']])
          + fieldNum('thickness', 'Wanddicke', f.thickness ?? 2, 'mm', 0.5, 'min="0"')
          + '<p class="info small">Die Kontur der Profile wird zur Wand mit eigener Dicke – aus einem geschlossenen Profil wird ein Hohlkörper. „Seite 1“ liegt im Profil, „Seite 2“ außerhalb, „Mitte“ beidseitig. Auch offene Linienzüge funktionieren, z. B. die Mittellinie eines U-Profils: „Seite 1“ ist dann links von der Zugrichtung, „Seite 2“ rechts.</p>'
          : two ? fieldNum('taper', 'Verjüngung Seite 1', f.taper || 0, '°', 1) + fieldNum('taper2', 'Verjüngung Seite 2', f.taper2 || 0, '°', 1)
          : fieldNum('taper', f.direction === 'symmetric' ? 'Verjüngung (beide Hälften)' : 'Verjüngung', f.taper || 0, '°', 1)) + op;
    } else if (f.type === 'revolve') {
      // Achse = beliebige Skizzenlinie (oft eine Konstruktionslinie) oder eine Kante/Zylinderachse im Modell
      const rsk = ctx.doc.features.find(x => x.id === f.sketch);
      const rpm = new Map(((rsk && rsk.points) || []).map(p => [p.id, p]));
      const rlines = ((rsk && rsk.curves) || []).filter(c => c.type === 'line' && rpm.has(c.p1) && rpm.has(c.p2))
        .sort((a, b) => (b.cons ? 1 : 0) - (a.cons ? 1 : 0))
        .map((c, i) => { const a = rpm.get(c.p1), b = rpm.get(c.p2); return [c.id, `${c.cons ? 'Konstruktionslinie' : 'Linie'} ${i + 1} (${fmt(Math.hypot(b.x - a.x, b.y - a.y), 1)} mm)`]; });
      const aval = ctx.editing.pickTarget === 'revaxis' || f.axisRef ? 'edge' : f.axis;
      body = sel + prof + fieldSeg('axis', 'Achse', aval, [['x', 'Skizzen-X'], ['y', 'Skizzen-Y'], ...rlines, ['edge', f.axisRef ? f.axisRef.label : 'Kante/Achse im Modell anklicken …']])
        + (ctx.editing.pickTarget === 'revaxis' ? '<p class="info">Gerade Kante, Kreiskante oder Zylinderfläche im Modell anklicken.</p>' : '')
        + (aval === 'edge' ? fieldSeg('projAxis', 'Achse projizieren', !!f.projAxis, [[false, 'Nein'], [true, 'In die Skizzenebene']]) : '')
        + fieldSeg('rext', 'Umfang', f.rext || 'angle', [['angle', 'Winkel'], ['toface', 'Bis Fläche']])
        + (f.rext === 'toface' ? `<div class="row"><span>Zielfläche</span><span class="btns"><button type="button" class="chip" data-cmd="pick-toface" aria-pressed="${ctx.editing.pickTarget === 'toface'}">${f.toFace ? 'Ebene Fläche ✓' : 'Fläche wählen'}</button></span></div><p class="info small">Ebene Fläche durch die Drehachse: gedreht wird vom Profil bis dorthin.</p>` : '')
        + fieldSeg('rdir', 'Richtung', f.rdir || 'one', f.rext === 'toface' ? [['one', 'Eine Seite'], ['two', 'Zwei Seiten']] : [['one', 'Eine Seite'], ['sym', 'Symmetrisch'], ['two', 'Zwei Seiten']])
        + (f.rext === 'toface' ? '' : fieldNum('angle', f.rdir === 'two' ? 'Winkel Seite 1' : 'Winkel', f.angle, '°', 15, 'min="0" max="360"'))
        + (f.rdir === 'two' ? fieldNum('angle2', 'Winkel Seite 2', f.angle2 ?? 90, '°', 15, 'min="0" max="360"') : '') + op;
    } else if (f.type === 'fillet' || f.type === 'chamfer') {
      const ct = f.ctype || 'equal';
      body = (f.type === 'fillet' ? fieldSeg('variable', 'Radiusart', !!f.variable, [[false, 'Konstant'], [true, 'Variabel']]) : fieldSeg('ctype', 'Fasenart', ct, [['equal', 'Gleicher Abstand'], ['two', 'Zwei Abstände'], ['angle', 'Abstand und Winkel']]))
        + (f.type === 'fillet' && !f.variable ? fieldSeg('chord', 'Maß', !!f.chord, [[false, 'Radius'], [true, 'Sehnenlänge']]) : '')
        + fieldNum(f.type === 'fillet' ? 'radius' : 'distance', f.type === 'fillet' ? (f.variable ? 'Radius Anfang' : f.chord ? 'Sehnenlänge' : 'Radius') : ct === 'two' ? 'Abstand 1' : 'Abstand', f.type === 'fillet' ? f.radius : f.distance, 'mm', 0.5, 'min="0"')
        + (f.type === 'chamfer' && ct === 'two' ? fieldNum('distance2', 'Abstand 2', f.distance2 ?? f.distance, 'mm', 0.5, 'min="0"') : '')
        + (f.type === 'chamfer' && ct === 'angle' ? fieldNum('angle', 'Winkel', f.angle ?? 45, '°', 5, 'min="0" max="90"') : '')
        + (f.type === 'chamfer' && ct !== 'equal' ? fieldSeg('cflip', 'Seite', !!f.cflip, [[false, 'Normal'], [true, 'Getauscht']]) + '<p class="info small">Abstand 1 liegt auf einer der beiden Flächen an der Kante. Passt die Seite nicht, „Getauscht“ wählen.</p>' : '')
        + (f.type === 'fillet' && f.variable ? fieldNum('radius2', 'Radius Ende', f.radius2 ?? f.radius, 'mm', 0.5, 'min="0"') + fieldSeg('vflip', 'Richtung', !!f.vflip, [[false, 'Normal'], [true, 'Umgekehrt']])
          + `<div class="row col"><span>Zwischenpunkte</span><div class="flist">${(f.vpts || []).map((p, i) => `<div class="row"><span class="num"><input type="text" inputmode="decimal" data-vpt="${i}" data-vk="t" value="${esc(String(Math.round(Number(p.t) * 1000) / 10))}"><em>%</em></span><span class="num"><input type="text" inputmode="decimal" data-vpt="${i}" data-vk="r" value="${esc(String(p.r))}"><em>mm</em></span><button type="button" class="iconbtn" data-cmd="vpt-del" data-i="${i}" title="Punkt entfernen">${icon('close', 14)}</button></div>`).join('')}</div></div>`
          + `<div class="btns"><button type="button" class="chip" data-cmd="vpt-add">+ Zwischenpunkt</button></div>`
          + '<p class="info small">Ohne Zwischenpunkte ändert sich der Radius linear entlang jeder gewählten Kante, mit Zwischenpunkten (Lage in % der Kante) glatt durch alle Punkte. Passt die Richtung nicht, „Umgekehrt“ wählen.</p>' : '')
        + `<div class="row"><span>Kanten</span><span class="btns"><button type="button" class="chip" data-cmd="all-edges" aria-pressed="${!!f.all}">Alle Kanten</button><button type="button" class="chip" data-cmd="face-edges" aria-pressed="${!!(f.fromFaces || []).length}">Kanten von Flächen</button><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + (f.all ? fieldSeg('allKind', 'Welche', f.allKind || 'both', [['both', 'Alle'], ['convex', 'Nur Rundungen (außen)'], ['concave', 'Nur Kehlen (innen)']]) : '')
        + (ctx.editing.pickTarget === 'face-edges' ? '<p class="info small">Flächen im Modell anklicken, jede ihrer Ecken wird bearbeitet. Eine Kante zwischen zwei gewählten Flächen zählt einmal, tangenten Übergänge und Nahtkanten fallen weg. Erneutes Klickt wählt die Fläche ab.</p>' : '')
        + (() => {
          // weitere Kantengruppen mit eigenem Maß (nur konstanter Radius / gleicher Abstand)
          const plain = !f.all && !(f.fromFaces || []).length && (f.type === 'fillet' ? !f.variable : ct === 'equal');
          if (!plain) return '';
          const sets = f.sets || [], g = ctx.editing.grp || 0, unit = 'mm';
          const chip = (k, n) => `<button type="button" class="chip" data-cmd="fset-pick" data-i="${k}" aria-pressed="${g === k}">Gruppe ${k + 1} (${n})</button>`;
          return (sets.length ? `<div class="row col"><span>Kantengruppen</span><div class="flist">${chip(0, f.edges.length)} ${fmt(Number(f.type === 'fillet' ? f.radius : f.distance) || 0, 2)} ${unit}`
            + sets.map((x, k) => `<div class="row">${chip(k + 1, x.edges.length)}<span class="num"><input type="text" inputmode="decimal" data-fset="${k}" value="${esc(String(x.value))}"><em>${unit}</em></span><button type="button" class="iconbtn" data-cmd="fset-del" data-i="${k}" title="Gruppe entfernen">${icon('close', 14)}</button></div>`).join('')
            + '</div></div>' : '')
            + `<div class="btns"><button type="button" class="chip" data-cmd="fset-add">+ Kantengruppe</button></div>`;
        })()
        + `<p class="info selinfo">${selectionInfo(f)}</p>`
        + '<p class="info small">Im Kern immer so: an jeder gewählten Kante werden die Kanten mitbearbeitet, die tangential weiterlaufen – die Kette endet an der nächsten Ecke. Eine Kette muss deshalb nur einmal angeklickt werden; eine einzelne Kante ohne ihre Kette geht nicht.</p>';
    } else if (f.type === 'weld') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      const wk = f.kind || 'fillet', fl = wk !== 'fillet';
      body = fieldSeg('kind', 'Art', wk, [['fillet', 'Kehlnaht'], ['i', 'I-Naht (Stumpf)'], ['v', 'V-Naht'], ['hv', 'HV-Naht']])
        + fieldNum('a', fl ? 'Nahtdicke s' : 'Nahtdicke a', f.a, 'mm', 0.5, 'min="0"')
        + (wk === 'hv' ? fieldSeg('flip', 'Fase an', !!f.flip, [[false, 'Angeklicktes Teil'], [true, 'Gegenstück']]) : '')
        + (fl ? fieldNum('gap', 'Spalt b', f.gap || 0, 'mm', 0.5, 'min="0"') : '')
        + (fl && wk !== 'i' ? fieldNum('root', 'Steg c', f.root || 0, 'mm', 0.5, 'min="0"') : '')
        + fieldSeg('allAround', 'Ringsum', !!f.allAround, [[false, 'Nein'], [true, 'Ja']])
        + `<div class="row"><span>Kanten</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${(f.edges || []).length ? `${f.edges.length} Kante${f.edges.length > 1 ? 'n' : ''} gewählt.` : (fl ? 'Kante am bündigen Stoß anklicken (beide Flächen liegen in einer Ebene).' : 'Kanten an den Innenecken anklicken, z. B. wo ein Stab auf den anderen stößt.')}<br><b class="winfo">${st && st.info ? esc(st.info) : ''}</b></p>`
        + (fl ? `<p class="info small">${wk === 'i' ? 'I-Naht: ohne Fugenvorbereitung, nur Nahtüberhöhung.' : wk === 'v' ? 'V-Naht: 60°-Fuge über die Tiefe s an beiden Teilen, wird aus den Teilen geschnitten und von der Naht gefüllt.' : 'HV-Naht: 45°-Fase über die Tiefe s nur am angeklickten Teil, das andere bleibt gerade.'}</p>` : '')
        + `<p class="info small">Kehlnaht als eigener Körper. „Ringsum“ schweißt die ganze Kontur der angeklickten Kante (auch Eckradien von Rohren). Die Ecke wird an jeder Kante automatisch gesucht, auch zwischen getrennten Rahmenstäben. Schenkellänge z = a·√2 bei 90°.</p>`;
    } else if (f.type === 'gusset') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = fieldNum('size', 'Schenkellänge', f.size, 'mm', 5, 'min="0"') + fieldNum('thickness', 'Blechdicke', f.thickness, 'mm', 1, 'min="0"') + fieldNum('chamfer', 'Eckfase', f.chamfer, 'mm', 1, 'min="0"')
        + `<div class="row"><span>Kanten</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${(f.edges || []).length ? `${f.edges.length} Kante${f.edges.length > 1 ? 'n' : ''} gewählt.` : 'Kante an der Innenecke anklicken, wo zwei Stäbe zusammenstoßen.'}<br><b class="ginfo">${st && st.info ? esc(st.info) : ''}</b></p>`
        + `<p class="info small">Dreiecksblech mittig auf der Kante, Schenkel entlang beider Flächen. Die Eckfase lässt Platz für die Schweißnaht.</p>`;
    } else if (f.type === 'endcap') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = fieldNum('thickness', 'Dicke', f.thickness, 'mm', 1, 'min="0"')
        + fieldSeg('shape', 'Form', f.shape || 'rect', [['rect', 'Rechteckplatte'], ['contour', 'Wie Profil']])
        + ((f.shape || 'rect') === 'rect' ? fieldNum('overhang', 'Überstand', f.overhang || 0, 'mm', 1, 'min="0"') : '')
        + `<div class="row"><span>Flächen</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${(f.faces || []).length ? `${f.faces.length} Stirnfläche${f.faces.length > 1 ? 'n' : ''} gewählt.` : 'Stirnfläche am Stabende anklicken (z. B. unten am Tischbein).'}<br><b class="ginfo">${st && st.info ? esc(st.info) : ''}</b></p>`;
    } else if (f.type === 'draft') {
      const pickPl = !f.plane || ctx.editing.pickTarget === 'draftplane';
      body = `<div class="row"><span>Neutrale Ebene</span><span class="btns"><button type="button" class="chip" data-cmd="draft-plane" aria-pressed="${pickPl}">${pickPl ? 'Ebene anklicken …' : esc(planeLabel(f.plane)) + ' ✓'}</button></span></div>`
        + fieldSeg('mode', 'Art', f.mode || 'one', [['one', 'Eine Seite'], ['sym', 'Symmetrisch'], ['two', 'Zwei Winkel']])
        + fieldNum('angle', f.mode === 'two' ? 'Winkel Seite 1' : 'Winkel', f.angle, '°', 0.5)
        + (f.mode === 'two' ? fieldNum('angle2', 'Winkel Seite 2', f.angle2 ?? f.angle, '°', 0.5) : '')
        + fieldSeg('flip', 'Zugrichtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + fieldSeg('tangent', 'Tangentiale Kette', !!f.tangent, [[false, 'Aus'], [true, 'An']])
        + `<div class="row"><span>Flächen</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${pickPl ? 'Zuerst die neutrale Ebene wählen. An ihr behalten die Flächen ihre Lage.' : f.faces.length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''} gewählt.` : 'Seitenflächen im Modell anklicken, die geneigt werden sollen.'}</p>`
        + `<p class="info small">Positiver Winkel: Das Teil wird in Zugrichtung schlanker und lässt sich aus der Form ziehen.</p>`;
    } else if (f.type === 'defeature') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = `<div class="row"><span>Flächen</span><b class="pref${f.faces.length ? '' : ' wait'}">${f.faces.length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''}` : 'Bohrung, Rundung oder Fase anklicken …'}</b></div>`
        + `<div class="row"><span></span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + fieldNum('autoHoles', 'Alle Bohrungen bis ⌀', f.autoHoles || 0, 'mm', 1, 'min="0"')
        + fieldNum('autoFillets', 'Alle Rundungen bis R', f.autoFillets || 0, 'mm', 0.5, 'min="0"')
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info small">Elemente entfernen, z. B. für importierte STEP-Teile: Bohrungen werden gefüllt (mit Bohrspitze), Rundungen und Fasen zwischen zwei ebenen Flächen zur scharfen Kante ergänzt bzw. abgetragen. 0 = Automatik aus. Vorschau nach OK.</p>`;
    } else if (f.type === 'shell') {
      body = fieldNum('thickness', 'Wandstärke', f.thickness, 'mm', 0.5, 'min="0"')
        + fieldSeg('dir', 'Richtung', f.dir || 'inside', [['inside', 'Innen'], ['outside', 'Außen'], ['both', 'Beidseitig']])
        + (f.dir === 'outside' || f.dir === 'both' ? fieldSeg('corners', 'Ecken außen', f.corners || 'sharp', [['sharp', 'Scharf'], ['round', 'Gerundet']]) : '')
        + (f.dir === 'both' ? fieldNum('thickness2', 'Wandstärke außen', f.thickness2 ?? f.thickness, 'mm', 0.5, 'min="0"') : '')
        + fieldSeg('hollow', 'Offene Flächen', !!f.hollow, [[false, 'Angeklickte'], [true, 'Keine (hohl)']])
        + (!f.hollow ? fieldSeg('tangent', 'Tangentiale Kette', !!f.tangent, [[false, 'Aus'], [true, 'An']]) : '')
        + `<div class="row"><span>${f.hollow ? 'Körper (Fläche anklicken, leer = alle)' : 'Offene Flächen'}</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${selectionInfo(f)}</p>`;
    } else if (f.type === 'plane') {
      const bk = f.base ? f.base.kind : '', byPts = bk === 'points', byMid = bk === 'mid', byTan = bk === 'tangent', byEdges = bk === 'edges', byPath = bk === 'path', byPerp = bk === 'perp';
      const chip = (m, on, l) => `<button type="button" class="chip" data-cmd="plane-mode" data-m="${m}" aria-pressed="${on}">${l}</button>`;
      body = `<div class="row col"><span>Art</span><span class="btns">${chip('ref', !byPts && !byMid && !byTan && !byEdges && !byPath && !byPerp, 'Versetzt/Winklig')}${chip('perp', byPerp, 'Lotrecht auf Ebene')}${chip('path', byPath, 'Entlang Pfad')}${chip('mid', byMid, 'Mittelebene')}${chip('tan', byTan, 'Tangential')}${chip('edges', byEdges, 'Durch zwei Kanten')}${chip('pts', byPts, 'Durch drei Punkte')}</span></div>`
        + `<div class="row"><span>Basis</span><b class="pref">${esc(planeLabel(f.base))}</b></div>`
        + (byPerp ? `<div class="row"><span>Durch Punkt</span><span class="btns"><button type="button" class="chip" data-cmd="perp-point" aria-pressed="${ctx.editing.pickTarget === 'perp-point'}">${f.base.p ? f.base.p.map(v => fmt(v, 1)).join(' / ') : 'Punkt anklicken'}</button>${f.base.p ? '<button type="button" class="chip" data-cmd="perp-pt-clear">Zurück</button>' : ''}</span></div>` : '')
        + `<p class="info">${byPts ? 'Drei Eckpunkte anklicken: jeweils eine Kante nahe dem gewünschten Endpunkt. Ein vierter Klick beginnt neu.' : byMid ? 'Zwei parallele Ebenen oder ebene Flächen anklicken. Die neue Ebene liegt genau in der Mitte. Ein dritter Klick beginnt neu.' : byTan ? 'Zylinderfläche an der Stelle anklicken, an der die Ebene anliegen soll. Mit „Winkel“ um die Ebenen-X-Achse (= Zylinderachse) weiterdrehen.' : byEdges ? 'Zwei gerade Kanten anklicken, die in einer Ebene liegen (schneidend oder parallel). Ein dritter Klick beginnt neu.' : byPath ? 'Kante als Pfad anklicken (gerade, Bogen oder Kurve). Die Ebene steht senkrecht auf der Kante an der eingestellten Stelle, z. B. für ein Profil, das entlang der Kante gezogen wird.' : byPerp ? 'Ebene oder ebene Fläche anklicken – die neue Ebene steht senkrecht darauf und enthält ihre Normale. „Durch Punkt“ legt sie durch eine Ecke, eine Kreismitte oder einen Arbeitspunkt; ohne Punkt steht sie im Ursprung der Basis. „Winkel“ dreht sie um die Normale der Basis, „Abstand“ verschiebt sie seitlich.' : 'Andere Basis im Modell anklicken.'}</p>`
        + (byPath ? fieldNum('pos', 'Lage auf der Kante', f.pos ?? 50, '%', 5, 'min="0" max="100"') : fieldNum('offset', 'Abstand', f.offset, 'mm', 1))
        + fieldNum('angle', 'Winkel', f.angle || 0, '°', 5)
        + fieldSeg('axis', 'Drehachse', f.axis || 'x', [['x', 'Ebenen-X'], ['y', 'Ebenen-Y']])
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']]);
    } else if (f.type === 'point') {
      const p = refreshWorkPlanes().points.get(f.id), b = f.base || {};
      body = fieldSeg('mode', 'Art', f.mode, [['vertex', 'Eckpunkt'], ['mid', 'Kantenmitte'], ['center', 'Kreismitte'], ['edges', 'Durch zwei Kanten'], ['planes3', 'Durch drei Ebenen'], ['edgeplane', 'Kante und Ebene'], ['path', 'Entlang Kante'], ['coords', 'Koordinaten']])
        + (f.mode === 'path' ? fieldNum('pos', 'Lage auf der Kante', f.pos ?? 50, '%', 5, 'min="0" max="100"') : '')
        + (f.mode === 'coords'
          ? `<div class="row col"><span>Punkt</span><div class="xyz">${['x', 'y', 'z'].map(k => `<label class="num"><b>${k.toUpperCase()}</b><input type="number" step="1" data-pt="${k}" value="${Number(b[k]) || 0}"><em>mm</em></label>`).join('')}</div></div>`
          : `<div class="row"><span>Lage</span><b class="pref">${p ? p.map(v => fmt(v, 2)).join(' / ') : 'Kante anklicken …'}</b></div>`)
        + `<p class="info">${{ vertex: 'Kante nahe dem gewünschten Endpunkt anklicken.', mid: 'Kante anklicken, der Punkt sitzt in ihrer Mitte.', center: 'Kreis- oder Bogenkante anklicken.', edges: 'Zwei gerade Kanten anklicken – der Punkt liegt in ihrem Schnitt bzw. mitten auf der kürzesten Verbindung. Ein dritter Klick beginnt neu.', planes3: 'Drei Ebenen anklicken (Ursprungs-, Arbeitsebene oder ebene Fläche) – der Punkt liegt in ihrem Schnitt. Ein vierter Klick ersetzt die dritte.', edgeplane: 'Eine gerade Kante und eine Ebene anklicken – der Punkt liegt dort, wo die Kante (verlängert) die Ebene trifft.', path: 'Kante anklicken (gerade, Bogen oder Kurve), Lage in % ihrer Länge.', coords: 'Koordinaten im Ursprungssystem eingeben.' }[f.mode] || ''}</p>`
        + '<p class="info small">Arbeitspunkte lassen sich bei „Ebene durch drei Punkte“ und „Achse durch zwei Punkte“ anklicken.</p>';
    } else if (f.type === 'axis') {
      const b = f.base, ax = refreshWorkPlanes().axes.get(f.id);
      const what = f.mode === 'normal' ? (b ? `${b.label} · durch ${b.o.map(v => fmt(v, 1)).join(' / ')}` : 'Ebene Fläche an der Stelle anklicken …')
        : f.mode === 'geom' ? (b ? b.label : 'Kante, Kreiskante oder Zylinderfläche anklicken …')
        : f.mode === 'planes' ? (b && b.b ? `${planeLabel(b.a)} × ${planeLabel(b.b)}` : `${b && b.a ? 1 : 0} von 2 Ebenen`)
        : f.mode === 'points' ? `${b ? (b.pts || []).length : 0} von 2 Punkten` : '';
      body = fieldSeg('mode', 'Art', f.mode, [['geom', 'Durch Kante/Zylinder'], ['planes', 'Schnitt zweier Ebenen'], ['points', 'Durch zwei Punkte'], ['normal', 'Lotrecht zur Fläche'], ['origin', 'Ursprungsachse']])
        + (f.mode === 'origin' ? fieldSeg('okey', 'Achse', b ? b.key : 'Z', [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]) : `<div class="row"><span>Basis</span><b class="pref">${esc(what)}</b></div>`)
        + `<p class="info">${{ geom: 'Gerade Kante, Kreiskante oder Zylinderfläche im Modell anklicken.', planes: 'Zwei sich schneidende Ebenen oder ebene Flächen anklicken. Ein dritter Klick beginnt neu.', points: 'Zwei Eckpunkte anklicken: jeweils eine Kante nahe dem gewünschten Endpunkt.', normal: 'Ebene Fläche anklicken – die Achse steht an der Klickstelle senkrecht auf ihr. Ein neuer Klick setzt sie neu.', origin: 'Achse durch den Ursprung.' }[f.mode] || ''}`
        + (ax ? `<br><b>Richtung ${ax.d.map(v => fmt(v, 3)).join(' / ')} · durch ${ax.o.map(v => fmt(v, 1)).join(' / ')}</b>` : '') + '</p>'
        + '<p class="info small">Drehung, Muster und weitere Achsen können die Arbeitsachse anklicken. Ändert sich ihre Basis, wandern diese mit.</p>';
    } else if (f.type === 'bks') {
      const wp = refreshWorkPlanes(), o = wp.points.get(f.id), ax = wp.axes.get(`${f.id}:x`);
      body = `<div class="row"><span>Basis</span><b class="pref">${esc(planeLabel(f.base))}</b></div>`
        + `<div class="row"><span>Ursprung</span><span class="btns"><button type="button" class="chip" data-cmd="bks-origin" aria-pressed="${ctx.editing.pickTarget === 'bks-origin'}">${f.originRef ? 'Punkt gesetzt' : 'Punkt anklicken'}</button>${f.originRef ? '<button type="button" class="chip" data-cmd="bks-origin-clear">Zurück</button>' : ''}</span></div>`
        + `<p class="info">Ebene, ebene Fläche oder Arbeitsebene anklicken - die Z-Achse steht senkrecht auf ihr. Ohne Punkt liegt der Ursprung im Ursprung der Basis. "Drehung um Z" dreht X und Y, "Abstand" verschiebt den Ursprung entlang Z.</p>`
        + fieldNum('offset', 'Abstand', f.offset || 0, 'mm', 1)
        + fieldNum('rot', 'Drehung um Z', f.rot || 0, '°', 5)
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + (o ? `<p class="info small">Ursprung ${o.map(v => fmt(v, 1)).join(' / ')}${ax ? ` · X ${ax.d.map(v => fmt(v, 3)).join(' / ')}` : ''}</p>` : '')
        + '<p class="info small">Skizzen, Muster und Drehungen können die Achsen und den Ursprung des Systems anklicken - sie wandern mit, wenn sich die Basis ändert.</p>';
    } else if (f.type === 'hole') {
      const opts = presetOptions(f.kind), place = f.place || 'sketch', nr = (f.rings || []).length;
      body = fieldSeg('place', 'Lage', place, [['sketch', 'Skizze oder Fläche'], ['center', 'Kreismitte'], ['edges', 'Zwei Kanten'], ['onedge', 'Auf Kante']])
        + (place === 'sketch' ? (f.sketch && !f.autoSketch ? sel : '') + `<div class="row"><span>Lage</span><span class="btns"><button type="button" class="chip" data-cmd="hole-face" aria-pressed="${!f.sketch || !!f.autoSketch}">Auf Fläche klicken</button></span></div>`
          + `<p class="info hinfo">${esc(f.sketch ? holeInfo(f) : 'Ebene Fläche an der Stelle der Bohrung anklicken. Jeder weitere Klick setzt eine weitere Bohrung.')}</p>` : '')
        + (place === 'center' ? `<div class="row"><span>Kreiskanten</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
          + `<p class="info hinfo">${esc(nr ? `${nr} runde Kante${nr > 1 ? 'n' : ''} gewählt – je eine Bohrung in ihrer Mitte.` : ' Runde Kante im Modell anklicken – die Bohrung sitzt genau in ihrer Mitte, zum Beispiel in einer verrundeten Ecke.')}</p>` : '')
        + (place === 'edges' ? `<div class="row"><span>Kanten</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
          + `<p class="info hinfo">${esc(f.edgeA && f.edgeB ? 'Beide Kanten gewählt – die Bohrung sitzt nach den Abständen in ihrer gemeinsamen Fläche.' : f.edgeA ? 'Jetzt die zweite Kante anklicken.' : 'Zwei Kanten einer Fläche anklicken; die Abstände gelten nach innen in diese Fläche.')}</p>`
          + fieldNum('offA', 'Abstand zu Kante 1', f.offA >= 0 ? f.offA : 20, 'mm', 1, 'min="0"') + fieldNum('offB', 'Abstand zu Kante 2', f.offB >= 0 ? f.offB : 20, 'mm', 1, 'min="0"') : '')
        + (place === 'onedge' ? `<p class="info hinfo">${esc(f.edgeP ? 'Kante gewählt – die Bohrung sitzt an der gewählten Stelle der Kante in der Fläche daneben.' : 'Gerade Kante im Modell anklicken.')}</p>`
          + fieldSeg('edgePos', 'Stelle', f.edgePos || 'mid', [['start', 'Anfang'], ['mid', 'Mitte'], ['end', 'Ende']]) : '')
        + fieldSeg('kind', 'Art', f.kind, [['simple', 'Einfach'], ['cbore', 'Zylindersenkung'], ['csk', 'Kegelsenkung']])
        + `<label class="row"><span>Norm</span><select data-k="preset"><option value=""${f.preset ? '' : ' selected'}>Eigene Maße</option>${opts.map(([v, l]) => `<option value="${v}"${v === f.preset ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
        + (String(f.preset || '').startsWith('tap:') ? `<label class="row"><span>Toleranzklasse</span><select data-k="tclass">${[['', '–'], ['6H', '6H'], ['5H', '5H'], ['7H', '7H'], ['6G', '6G']].map(([v, l]) => `<option value="${v}"${(f.tclass || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : '')
        + (String(f.preset || '').startsWith('tap:') ? fieldSeg('tapMode', 'Gewinde', f.tapMode || 'cosmetic', [['cosmetic', 'Kosmetisch'], ['modeled', 'Modelliert']])
          + fieldSeg('tFull', 'Gewindelänge', f.tFull !== false, [[true, 'Ganze Tiefe'], [false, 'Länge + Versatz']])
          + (f.tFull === false ? fieldNum('tLen', 'Länge', f.tLen ?? 10, 'mm', 1, 'min="0"') + fieldNum('tOff', 'Versatz', f.tOff || 0, 'mm', 0.5, 'min="0"') : '')
          + (f.tapMode === 'modeled' ? fieldNum('fit', 'Spiel', f.fit || 0, 'mm', 0.05, 'min="0"') + '<p class="info small">Modelliert für den 3D-Druck: Gewindegänge werden in die Bohrung eingeformt. Spiel 0,1–0,2 mm hilft bei FDM.</p>' : '<p class="info small">Kosmetisch: nur das Kernloch, die Zeichnung zeigt das Gewinde als „M…“.</p>') : '')
        + fieldNum('d', 'Durchmesser', f.d, 'mm', 0.1, 'min="0"')
        + (f.kind === 'cbore' ? fieldNum('cd', 'Senk-⌀', f.cd, 'mm', 0.5, 'min="0"') + fieldNum('cdepth', 'Senktiefe', f.cdepth, 'mm', 0.5, 'min="0"') : '')
        + (f.kind === 'csk' ? fieldNum('cd', 'Senk-⌀', f.cd, 'mm', 0.5, 'min="0"') + fieldNum('cangle', 'Senkwinkel', f.cangle, '°', 1, 'min="1" max="179"') : '')
        + fieldSeg('depthMode', 'Tiefe', f.depthMode, [['through', 'Durchgehend'], ['depth', 'Maß'], ['toface', 'Bis Fläche']])
        + (f.depthMode === 'depth' ? fieldNum('depth', 'Bohrtiefe', f.depth, 'mm', 1, 'min="0"') : '')
        + (f.depthMode === 'toface' ? `<div class="row"><span>Zielfläche</span><span class="btns"><button type="button" class="chip" data-cmd="pick-toface" aria-pressed="${ctx.editing.pickTarget === 'toface'}">${f.toFace ? 'Ebene Fläche ✓' : 'Fläche wählen'}</button></span></div>` + fieldNum('toOffset', 'Versatz', f.toOffset || 0, 'mm', 0.5) : '')
        + (f.depthMode === 'depth' || f.depthMode === 'toface' ? fieldSeg('tip', 'Bohrgrund', f.tip, [['drill', 'Spitze'], ['flat', 'Flach']]) + (f.tip === 'drill' ? fieldNum('tipAngle', 'Spitzenwinkel', f.tipAngle ?? 118, '°', 1, 'min="1" max="179"') : '') : '')
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Ins Material'], [true, 'Umgekehrt']])
        + `<div class="row col"><span>Objekte</span>${bodyChips(f, 'targets')}</div>`;
    } else if (f.type === 'scale') {
      body = `<div class="row col"><span>Komponenten</span>${compChips(f)}</div><div class="row col"><span>Körper</span>${bodyChips(f, 'bodies')}</div>`
        + fieldSeg('mode', 'Maßstabstyp', f.mode === 'xyz' ? 'xyz' : 'uniform', [['uniform', 'Gleichmäßig'], ['xyz', 'Ungleichmäßig']])
        + (f.mode === 'xyz' ? fieldNum('sx', 'Faktor X', f.sx ?? 1, '×', 0.1, 'min="0"') + fieldNum('sy', 'Faktor Y', f.sy ?? 1, '×', 0.1, 'min="0"') + fieldNum('sz', 'Faktor Z', f.sz ?? 1, '×', 0.1, 'min="0"') : fieldNum('factor', 'Faktor', f.factor, '×', 0.1, 'min="0"'))
        + fieldSeg('point', 'Bezugspunkt', f.point || 'origin', [['origin', 'Ursprung'], ['center', 'Mitte der Körper'], ['custom', 'Punkt (X, Y, Z)']])
        + (f.point === 'custom' ? `<div class="row col"><span>Punkt</span><div class="xyz">${['px', 'py', 'pz'].map((k, i) => `<label class="num"><b>${'XYZ'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k]}"><em>mm</em></label>`).join('')}</div></div>` : '')
        + (f.mode === 'xyz' ? `<p class="info">Ungleichmäßig: je Achse ein eigener Faktor, der Bezugspunkt bleibt stehen. Der Körper wird dabei fein vernetzt und als Dreiecksnetz-Körper neu aufgebaut (wie ein STL-Import): Rundungen und Bohrungen werden facettiert, Abrunden oder Bohren daran geht nicht zuverlässig. ${ctx.lastBuild && ctx.lastBuild.status[f.id] && ctx.lastBuild.status[f.id].info ? esc(ctx.lastBuild.status[f.id].info) : ''}</p>` : `<p class="info">Gleichmäßig in alle Richtungen. Der Bezugspunkt bleibt stehen. Faktor 2 verdoppelt alle Maße, 0,5 halbiert sie.</p>`);
    } else if (f.type === 'boss') {
      // Zapfen (Kunststoff): an den Skizzenpunkten aus der Fläche heraus
      const hole = f.hole || 'core';
      body = sel + fieldNum('d', 'Außendurchmesser', f.d, 'mm', 0.5) + fieldNum('h', 'Höhe', f.h, 'mm', 1) + fieldNum('draft', 'Formschräge', f.draft || 0, '°', 0.5)
        + fieldSeg('hole', 'Loch', hole, [['none', 'Ohne'], ['core', 'Kernloch'], ['through', 'Durchgang']])
        + (hole !== 'none' ? fieldNum('dh', 'Lochdurchmesser', f.dh, 'mm', 0.1) + (hole === 'core' ? fieldNum('hd', 'Lochtiefe', f.hd, 'mm', 1) : '') : '')
        + fieldNum('ribs', 'Rippen', f.ribs || 0, 'Stück', 1, 'min="0" max="12"')
        + ((Number(f.ribs) || 0) > 0 ? fieldNum('rt', 'Rippendicke', f.rt, 'mm', 0.1) + fieldNum('rl', 'Rippenlänge', f.rl, 'mm', 0.5) + fieldNum('rh', 'Rippenhöhe', f.rh, 'mm', 0.5) : '')
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Aus der Fläche'], [true, 'Umgekehrt']])
        + `<p class="info">Schraubzapfen für Kunststoffteile (3D-Druck, Spritzguss): je Skizzenpunkt ein Zapfen. Kernloch für selbstschneidende Schrauben (etwa 0,8 × Schrauben-⌀, z. B. ⌀ 2,5 für 3 mm), Durchgang für Schrauben von der anderen Seite. Rippen stützen den Zapfen am Fuß.</p>`;
    } else if (f.type === 'snapfit') {
      body = sel + fieldNum('L', 'Balkenlänge', f.L, 'mm', 1) + fieldNum('t', 'Dicke', f.t, 'mm', 0.1) + fieldNum('w', 'Breite', f.w, 'mm', 0.5)
        + fieldNum('hook', 'Hinterschnitt', f.hook, 'mm', 0.1) + fieldNum('alpha', 'Einführwinkel', f.alpha, '°', 5, 'min="5" max="80"')
        + fieldNum('angle', 'Richtung des Hakens', f.angle || 0, '°', 45)
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Aus der Fläche'], [true, 'Umgekehrt']])
        + `<p class="info">Schnappverschluss (Biegebalken mit Haken) je Skizzenpunkt: der Haken greift um den Hinterschnitt, die Einführschräge steht unter dem Einführwinkel zur Balkenachse, die Rastfläche quer. Richtung 0° = Skizzen-X. Faustregel 3D-Druck: Dehnung am Fuß ε ≈ 1,5 · t · Hinterschnitt / L² unter etwa 2–4 % halten.</p>`;
    } else if (f.type === 'moveface') {
      // Fläche verschieben: verschieben, drehen oder bis zu einer Zielfläche (Fläche ersetzen)
      const pt = ctx.editing && ctx.editing.pickTarget, md = f.mode || 'move';
      const pick = (cmd, label, on) => `<span class="btns"><button type="button" class="chip" data-cmd="${cmd}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button></span>`;
      const n = (f.faces || []).length;
      body = `<div class="row"><span>Flächen</span>${pick('mf-faces', pt === 'mf-faces' ? (n ? `${n} gewählt · Auswahl beenden` : 'Flächen anklicken …') : n ? `${n} Fläche${n === 1 ? '' : 'n'} ✓` : 'Flächen wählen', pt === 'mf-faces')}</div>`
        + fieldSeg('mode', 'Art', md, [['move', 'Verschieben'], ['rotate', 'Drehen'], ['to', 'Bis Fläche']]);
      if (md === 'rotate') body += `<div class="row"><span>Achse</span>${pick('mf-axis', f.axisRef ? (f.axisRef.label || 'Achse ✓') : 'Kante oder Achse wählen', pt === 'mf-axis')}</div>` + fieldNum('angle', 'Winkel', f.angle ?? 10, '°', 5);
      else if (md === 'to') body += `<div class="row"><span>Zielfläche</span>${pick('mf-target', f.target ? 'Ebene Fläche ✓' : 'Zielfläche wählen', pt === 'mf-target')}</div>`;
      else body += `<div class="row col"><span>Verschiebung</span><div class="xyz">${['dx', 'dy', 'dz'].map((k, i) => `<label class="num"><b>${'XYZ'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k] || 0}"><em>mm</em></label>`).join('')}</div></div>`;
      body += `<p class="info">${md === 'move' ? 'Ebene Flächen wandern um den Anteil der Verschiebung entlang ihrer Normalen. Zylinderflächen (Bohrungen, Zapfen) wandern als Ganzes – praktisch für importierte Teile ohne Zeitleiste.' : md === 'rotate' ? 'Die ebenen Flächen drehen sich um die Achse (Kante, Kreismitte oder Arbeitsachse), die Nachbarflächen laufen bis zur neuen Lage weiter.' : 'Die ebenen Flächen wandern auf die Ebene der Zielfläche – auch schräg.'} Nachbarflächen werden senkrecht zur Fläche verlängert oder gekürzt.${pt === 'mf-faces' ? ' Während der Auswahl zeigt das Modell den Stand davor.' : ''}</p>`;
    } else if (f.type === 'motionlink') {
      // Bewegungsverknüpfung: Gelenk 2 folgt Gelenk 1 (Wert 1 ↔ Wert 2, z. B. 360° ↔ 10 mm)
      const js = ctx.doc.features.filter(x => x.type === 'joint' && FELDER[x.kind]);
      const opt = js.map(x => [x.id, x.name]), fs = id => { const j = js.find(x => x.id === id); return j ? FELDER[j.kind] : ['angle']; };
      const seite = (n, kj, kf, kv) => fieldSeg(kj, `Gelenk ${n}`, f[kj] || '', opt.length ? opt : [['', '–']])
        + (fs(f[kj]).length > 1 ? fieldSeg(kf, 'Bewegung', f[kf], fs(f[kj]).map(x => [x, FELD_NAME[x]])) : '')
        + fieldNum(kv, `Wert ${n}`, f[kv], EINHEIT[f[kf]] || '°', kf === 'angle' ? 15 : 1);
      body = seite(1, 'a', 'fa', 'va') + seite(2, 'b', 'fb', 'vb')
        + fieldSeg('reverse', 'Richtung', !!f.reverse, [[false, 'Gleich'], [true, 'Umgekehrt']])
        + `<p class="info">Gelenk 2 bewegt sich mit Gelenk 1: Wert 1 an Gelenk 1 ergibt Wert 2 an Gelenk 2 (z. B. Ritzel 360° ↔ Zahnstange 10 mm, Zahnräder 20 ↔ 40 Zähne als 360° ↔ 180°). Gilt im Modell, beim Abspielen und in der Bewegungsstudie.</p>${ctx.lastBuild && ctx.lastBuild.status[f.id] && ctx.lastBuild.status[f.id].info ? `<p class="info small" translate="no">${esc(ctx.lastBuild.status[f.id].info)}</p>` : ''}`;
    } else if (f.type === 'rigid') {
      body = `<div class="row col"><span>Komponenten</span>${compChips(f)}</div>`
        + `<p class="info">Die gewählten Komponenten bewegen sich ab hier wie ein Teil: Ein Gelenk oder Verschieben an einer von ihnen nimmt alle anderen mit.</p>`;
    } else if (f.type === 'move') {
      const md = f.mode || 'free', pt = ctx.editing && ctx.editing.pickTarget;
      const pick = (cmd, label, on) => `<span class="btns"><button type="button" class="chip" data-cmd="${cmd}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button></span>`;
      const ptName = r => !r ? 'Punkt wählen' : r.pt ? 'Arbeitspunkt' : r.at === 'center' ? 'Kreismitte' : r.at === 'mid' ? 'Kantenmitte' : 'Eckpunkt';
      body = `<div class="row col"><span>Komponenten</span>${compChips(f)}</div><div class="row col"><span>Körper</span>${bodyChips(f, 'bodies')}</div>`
        + fieldSeg('mode', 'Art', md, [['free', 'Abstand/Winkel'], ['points', 'Punkt zu Punkt'], ['pointpos', 'Punkt auf Position'], ['edge', 'Entlang Kante'], ['axis', 'Drehen um Kante']]);
      if (md === 'pointpos') {
        body += `<div class="row"><span>Punkt</span>${pick('move-from', ptName(f.from), pt === 'move-from')}</div>`
          + `<div class="row col"><span>Zielposition</span><div class="xyz">${['tx', 'ty', 'tz'].map((k, i) => `<label class="num"><b>${'XYZ'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k] || 0}"><em>mm</em></label>`).join('')}</div></div>`
          + '<p class="info">Den Punkt am Körper anklicken und die Zielkoordinaten eingeben – der Körper wandert so, dass der Punkt dort liegt.</p>';
      } else if (md === 'points') {
        body += `<div class="row"><span>Von</span>${pick('move-from', ptName(f.from), pt === 'move-from')}</div>`
          + `<div class="row"><span>Nach</span>${pick('move-to', ptName(f.to), pt === 'move-to')}</div>`
          + '<p class="info">Erst den Punkt am Körper, dann den Zielpunkt anklicken – der Körper wandert genau dorthin.</p>';
      } else if (md === 'edge') {
        body += `<div class="row"><span>Kante</span>${pick('move-edge', f.edge ? 'Kante ✓' : 'Kante wählen', pt === 'move-edge')}</div>`
          + fieldNum('distance', 'Abstand', f.distance ?? 10, 'mm', 1)
          + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Entlang der Kante'], [true, 'Umgekehrt']])
          + '<p class="info">Gerade Kanten: der Körper gleitet entlang. Kreis- oder Bogenkanten: er dreht um deren Mittelachse – der Abstand ist die Bogenlänge.</p>';
      } else if (md === 'axis') {
        body += `<div class="row"><span>Achse</span>${pick('move-axis', f.axisRef ? (f.axisRef.label || 'Achse ✓') : 'Kante oder Achse wählen', pt === 'move-axis')}</div>`
          + fieldNum('angle', 'Winkel', f.angle ?? 15, '°', 15);
      } else {
        body += `<div class="row col"><span>Versatz</span><div class="xyz">${['dx', 'dy', 'dz'].map((k, i) => `<label class="num"><b>${'XYZ'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k]}"><em>mm</em></label>`).join('')}</div></div>`
          + fieldSeg('axis', 'Drehachse', f.axis, [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']])
          + fieldNum('angle', 'Winkel', f.angle, '°', 15)
          + `<div class="row col"><span>Drehpunkt</span><div class="xyz">${['px', 'py', 'pz'].map((k, i) => `<label class="num"><b>${'XYZ'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k]}"><em>mm</em></label>`).join('')}</div></div>`;
      }
      body += fieldSeg('copy', 'Ergebnis', !!f.copy, [[false, 'Verschieben'], [true, 'Kopie']]);
    } else if (f.type === 'frame') {
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      const K = PROFILE_KINDS[f.kind] || PROFILE_KINDS.square;
      const others = sketches.filter(x => x.id !== f.sketch);
      body = `<label class="row"><span>Skizze</span><select data-k="sketch">${opts(f.sketch)}</select></label>`
        + (others.length ? `<div class="row col"><span>Weitere Skizzen</span><div class="flist">${others.map(x => `<label class="check"><input type="checkbox" data-fsk="${x.id}"${(f.sketches || []).includes(x.id) ? ' checked' : ''}> ${esc(x.name)}</label>`).join('')}</div></div>` : '')
        + `<label class="row"><span>Profil</span><select data-k="kind">${Object.entries(PROFILE_KINDS).map(([k, v]) => `<option value="${k}"${k === f.kind ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>`
        + `<label class="row"><span>Größe</span><select data-k="size">${K.sizes.map(z => `<option value="${esc(z)}"${z === f.size ? ' selected' : ''}>${esc(z.replace(/x/g, ' × ').replace(/\./g, ','))}</option>`).join('')}<option value=""${!f.size ? ' selected' : ''}>Eigene Maße</option></select></label>`
        + K.fields.map(k => fieldNum(k, FIELD_NAMES[k], f[k], 'mm', 0.5, 'min="0"')).join('')
        + fieldSeg('corners', 'Ecken', f.corners, [['miter', 'Gehrung'], ['butt', 'Stumpf'], ['none', 'Offen']])
        + fieldSeg('alignY', 'Lage zur Skizze', f.alignY || 'center', [['center', 'Mitte'], ['top', 'Darunter'], ['bottom', 'Darüber']])
        + fieldSeg('alignX', 'Seitlich', f.alignX || 'center', [['center', 'Mitte'], ['inside', 'Innen'], ['outside', 'Außen']])
        + fieldSeg('rot', 'Drehung', String(f.rot || 0), [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']])
        + `<p class="info">Jede Linie der Skizze wird ein eigener Stab (Konstruktionslinien nicht). Ecken mit genau zwei Stäben werden auf Gehrung geschnitten oder stumpf gestoßen.<br><b class="frinfo">${frameInfo(f)}</b></p>`;
    } else if (f.type === 'pipe') {
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      body = `<label class="row"><span>Pfad</span><select data-k="path">${opts(f.path)}</select></label>`
        + fieldSeg('section', 'Querschnitt', f.section || 'circle', [['circle', 'Kreis'], ['square', 'Quadrat'], ['triangle', 'Dreieck']])
        + fieldNum('size', (f.section || 'circle') === 'circle' ? 'Durchmesser' : 'Seitenlänge', f.size, 'mm', 1, 'min="0"')
        + fieldSeg('hollow', 'Hohl', !!f.hollow, [[false, 'Voll'], [true, 'Hohl']])
        + (f.hollow ? fieldNum('wall', 'Wandstärke', f.wall, 'mm', 0.5, 'min="0"') : '')
        + fieldSeg('corners', 'Ecken', f.corners || 'right', [['right', 'Gehrung'], ['round', 'Rund']])
        + fieldNum('pathFrac0', 'Teilstrecke ab', f.pathFrac0 ?? 0, '%', 5, 'min="0" max="99"')
        + fieldNum('pathFrac', 'Teilstrecke bis', f.pathFrac ?? 100, '%', 5, 'min="1" max="100"') + op
        + `<p class="info">Der Pfad sind alle normalen Kurven der Skizze als zusammenhängende Kette. Der Querschnitt sitzt mittig auf dem Pfad, ohne eigene Profilskizze. Teilstrecke: vom Pfadanfang bzw. von „ab“ bis „bis“, jedes Ende senkrecht zum Pfad abgeschnitten Abstand 1 und 2, nur in % der Pfadlänge.</p>`;
    } else if (f.type === 'sweep' && f.src === 'body') {
      // Körper entlang Pfad (Kugel- bzw. Schaftfräser)
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      const bodyIds = (ctx.lastBuild && ctx.lastBuild.bodies) || [], bname = id => (ctx.doc.bodies && ctx.doc.bodies[id] && ctx.doc.bodies[id].name) || id;
      body = fieldSeg('src', 'Profil', 'body', [['sketch', 'Skizze'], ['body', 'Körper']])
        + `<label class="row"><span>Körper</span><select data-k="toolBody"><option value=""${f.toolBody ? '' : ' selected'}>–</option>${bodyIds.filter(id => id !== f.id).map(id => `<option value="${esc(id)}"${id === f.toolBody ? ' selected' : ''}>${esc(bname(id))}</option>`).join('')}</select></label>`
        + `<label class="row"><span>Pfad</span><select data-k="path">${opts(f.path)}</select></label>`
        + '<p class="info small">Sweeping mit Körper: der Körper wandert entlang des Pfads (vom näheren Pfadende aus) und überstreicht den Raum – etwa ein Fräser, der eine Nut schneidet. Exakt gehen eine Kugel und ein Zylinder mit Achse senkrecht zur Pfadebene.</p>' + op;
    } else if (f.type === 'sweep') {
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      body = fieldSeg('src', 'Profil', 'sketch', [['sketch', 'Skizze'], ['body', 'Körper']]) + `<label class="row"><span>Profil</span><select data-k="sketch">${opts(f.sketch)}</select></label>` + prof
        + `<label class="row"><span>Pfad</span><select data-k="path">${opts(f.path)}</select></label>`
        + `<p class="info">Der Pfad sind alle normalen Kurven der Pfad-Skizze als zusammenhängende Kette (Linien, Bögen oder ein Kreis). Profile mit Loch ergeben Rohre.</p>`
        + fieldSeg('corners', 'Ecken', f.corners, [['right', 'Gehrung'], ['round', 'Rund']])
        + fieldSeg('orient', 'Ausrichtung', f.orient || 'perp', [['perp', 'Senkrecht'], ['parallel', 'Parallel']])
        + `<label class="row"><span>Führungsschiene</span><select data-k="rail"><option value=""${f.rail ? '' : ' selected'}>–</option>${sketches.filter(s => s.id !== f.sketch && s.id !== f.path).map(s => `<option value="${s.id}"${s.id === f.rail ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`
        + (f.rail ? fieldSeg('railScale', 'Profil an der Schiene', f.railScale || 'none', [['none', 'Nur ausrichten'], ['scale', 'Skalieren']]) : '')
        + fieldNum('pathFrac', 'Teilstrecke des Pfads', f.pathFrac ?? 100, '%', 5, 'min="1" max="100"')
        + fieldNum('pathFrac2', 'Teilstrecke Seite 2', f.pathFrac2 ?? 100, '%', 5, 'min="1" max="100"')
        + fieldNum('twist', 'Verdrehwinkel', f.twist || 0, '°', 15)
        + fieldNum('taper', 'Verjüngungswinkel', f.taper || 0, '°', 1)
        + '<p class="info small">Teilstrecke: ab dem Profil gezogen, am Ende senkrecht zum Pfad abgeschnitten. Sitzt das Profil mitten auf dem Pfad, wird in beide Richtungen gezogen: Seite 1 in Richtung der Profilnormale, Seite 2 dagegen. Verdrehwinkel: das Profil dreht sich gleichmäßig über die gezogene Länge – z. B. ein gedrehter Flachstab. Verjüngung: das Profil wächst (positiv) oder schrumpft (negativ) gleichmäßig, sein äußerster Punkt läuft unter dem Winkel – ein Kreis auf dem Pfad ergibt einen Kegel.</p>' + op;
    } else if (f.type === 'loft') {
      body = `<div class="row col"><span>Profile (der Reihe nach)</span><div class="loftlist">${f.sections.map((s, i) => `<div class="loftrow"><b>${i + 1}</b><select data-loft="${i}">${sketches.map(x => `<option value="${x.id}"${x.id === s.sketch ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${f.sections.length > 2 ? `<button type="button" class="iconbtn" data-cmd="loft-del" data-i="${i}" title="Entfernen">${icon('close', 14)}</button>` : ''}</div>`).join('')}</div></div>`
        + `<div class="btns"><button type="button" class="chip" data-cmd="loft-add">+ Profil</button></div>`
        + [1, 2].map(k => `<label class="row"><span>Schiene ${k}</span><select data-k="rail${k}"><option value=""${f['rail' + k] ? '' : ' selected'}>–</option>${sketches.filter(x => !f.sections.some(s => s.sketch === x.id)).map(x => `<option value="${x.id}"${x.id === f['rail' + k] ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`).join('')
        + `<label class="row"><span>Mittellinie</span><select data-k="center"><option value=""${f.center ? '' : ' selected'}>–</option>${sketches.filter(x => !f.sections.some(s => s.sketch === x.id)).map(x => `<option value="${x.id}"${x.id === f.center ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`
        + `<p class="info">Je Skizze wird das erste geschlossene Profil genommen. Haben alle Profile gleich viele Löcher, gehen die Löcher mit (z. B. Rohrübergang). Mit Mittellinie (Kurvenkette einer eigenen Skizze) folgt der Übergang ihr; die Profile liegen der Reihe nach auf ihr.</p>`
        + fieldSeg('ruled', 'Übergang', !!f.ruled, [[false, 'Glatt'], [true, 'Geradlinig']])
        + (f.center || f.rail1 || f.rail2 ? '' : `<label class="row chk"><input type="checkbox" data-k="closed"${f.closed ? ' checked' : ''}> Geschlossen (zurück zum ersten Profil)</label>`)
        + (f.closed ? '<p class="info small">Der Ring braucht mindestens drei Profile; er wird an der Stelle des ersten Profils geschlossen.</p>' : '') + op;
    } else if (f.type === 'align') {
      // Ausrichten: Mitte der ersten Auswahl auf die zweite, Flächen gegenüber; ohne Bewegung
      const lbl = o => o ? (o.kind === 'jorigin' ? `Gelenkursprung ${esc((ctx.doc.features.find(x => x.id === o.id) || {}).name || '')}` : o.kind === 'edge' ? (o.ref.t === 'LINE' ? 'Gerade Kante' : 'Kreiskante') : 'Fläche') : null;
      body = `<div class="row"><span>Von (bewegt)</span><span class="btns">${f.o1 ? `<b class="pref">${lbl(f.o1)}</b><button type="button" class="chip" data-cmd="joint-reset" data-n="1">neu</button>` : '<b class="pref wait">anklicken …</b>'}</span></div>`
        + `<div class="row"><span>Bewegt wird</span><b class="pref">${f.o1 ? esc(f.comp ? compName(f.comp) : bodyName(f.body1)) : '–'}</b></div>`
        + `<div class="row"><span>Nach (Ziel)</span><span class="btns">${f.o2 ? `<b class="pref">${lbl(f.o2)}</b><button type="button" class="chip" data-cmd="joint-reset" data-n="2">neu</button>` : (f.o1 ? '<b class="pref wait">anklicken …</b>' : '–')}</span></div>`
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Gegenüber'], [true, 'Gleichsinnig']])
        + fieldNum('angle', 'Drehen um Achse', f.angle, '°', 15)
        + fieldNum('offset', 'Abstand', f.offset, 'mm', 1)
        + `<p class="info small">Kreiskanten und Bohrungen werden mittig zueinander gesetzt, ebene Flächen bündig. Gehört der Körper zu einer Komponente oder einem eingefügten Teil, bewegt sich das ganze Teil.</p>`;
    } else if (f.type === 'jorigin') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], fr = st && st.frame;
      body = `<div class="row"><span>Basis</span><b class="pref${f.sel ? '' : ' wait'}">${f.sel ? (f.sel.kind === 'face' ? 'Fläche' : f.sel.ref.t === 'LINE' ? 'Gerade Kante' : 'Kreiskante') + ' · ' + esc(bodyName(f.sel.body)) : 'Fläche oder Kante anklicken …'}</b></div>`
        + fieldNum('dx', 'Versatz X', f.dx || 0, 'mm', 1) + fieldNum('dy', 'Versatz Y', f.dy || 0, 'mm', 1) + fieldNum('dz', 'Versatz Z (entlang Achse)', f.dz || 0, 'mm', 1)
        + fieldSeg('flip', 'Achse', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + (fr ? `<p class="info small">Ursprung ${fr.o.map(v => fmt(v, 2)).join(' / ')} · Achse ${fr.d.map(v => fmt(v, 3)).join(' / ')}</p>` : '')
        + `<p class="info">Gelenkursprung: eigener Bezug an einem Körper (Kreiskante = Mitte, Fläche = Mittelpunkt, Kante = Mitte), versetzt und mitgeführt. In „Gelenk“ und „Ausrichten“ als Ursprung anklicken (gestrichelte Achse).</p>`;
    } else if (f.type === 'joint') {
      const lbl = o => o ? (o.kind === 'jorigin' ? `Gelenkursprung ${esc((ctx.doc.features.find(x => x.id === o.id) || {}).name || '')}` : o.kind === 'edge' ? (o.ref.t === 'LINE' ? 'Gerade Kante' : 'Kreiskante') : 'Fläche') : null;
      const lkey = f.kind === 'revolute' ? 'angle' : (f.kind === 'slider' || f.kind === 'cylindrical') ? 'offset' : null;
      const lim = !!(lkey && f.limits), lo = lim ? Math.min(f.lmin, f.lmax) : null, hi = lim ? Math.max(f.lmin, f.lmax) : null;
      body = fieldSeg('kind', 'Art', f.kind, [['rigid', 'Starr'], ['revolute', 'Drehgelenk'], ['slider', 'Schieber'], ['cylindrical', 'Zylindrisch'], ['pinslot', 'Stift-Nut'], ['planar', 'Planar'], ['ball', 'Kugel']])
        + `<div class="row"><span>Ursprung 1</span><span class="btns">${f.o1 ? `<b class="pref">${lbl(f.o1)}</b><button type="button" class="chip" data-cmd="joint-reset" data-n="1">neu</button>` : '<b class="pref wait">anklicken …</b>'}</span></div>`
        + `<div class="row"><span>Bewegt</span><b class="pref">${f.o1 ? esc(f.comp ? compName(f.comp) : bodyName(f.body1)) : '–'}</b></div>`
        + `<div class="row"><span>Ursprung 2</span><span class="btns">${f.o2 ? `<b class="pref">${lbl(f.o2)}</b><button type="button" class="chip" data-cmd="joint-reset" data-n="2">neu</button>` : (f.o1 ? '<b class="pref wait">anklicken …</b>' : '–')}</span></div>`
        + fieldNum('angle', 'Winkel', f.angle, '°', 5)
        + (f.kind !== 'slider' ? `<input type="range" class="secrange" min="${lim && lkey === 'angle' ? lo : -180}" max="${lim && lkey === 'angle' ? hi : 180}" step="1" value="${f.angle}" data-jrange="angle">` : '')
        + fieldNum('offset', 'Versatz', f.offset, 'mm', 1)
        + (f.kind === 'slider' || f.kind === 'cylindrical' ? `<input type="range" class="secrange" min="${lim ? lo : -100}" max="${lim ? hi : 100}" step="0.5" value="${f.offset}" data-jrange="offset">` : '')
        + (f.kind === 'pinslot' || f.kind === 'planar' ? fieldNum('u', f.kind === 'planar' ? 'Verschieben X' : 'Weg in der Nut', f.u || 0, 'mm', 1) : '')
        + (f.kind === 'planar' ? fieldNum('v', 'Verschieben Y', f.v || 0, 'mm', 1) : '')
        + (f.kind === 'ball' ? fieldNum('tilt', 'Neigen um X', f.tilt || 0, '°', 5) + fieldNum('tilt2', 'Neigen um Y', f.tilt2 || 0, '°', 5) : '')
        + (['pinslot', 'planar', 'ball'].includes(f.kind) ? `<p class="info small">${{ pinslot: 'Stift-Nut: Drehen um die Achse und Gleiten quer dazu (Richtung X des Ursprungs 2).', planar: 'Planar: Gleiten in der Ebene von Ursprung 2 (X/Y) und Drehen um ihre Normale.', ball: 'Kugel: Drehen um die Achse und Neigen um X und Y – Drehpunkt ist Ursprung 2.' }[f.kind]}</p>` : '')
        + fieldSeg('flip', 'Ausrichtung', !!f.flip, [[false, 'Gegenüber'], [true, 'Umgekehrt']])
        + (lkey ? fieldSeg('limits', lkey === 'angle' ? 'Winkelgrenzen' : 'Wegbegrenzung', !!f.limits, [[false, 'Aus'], [true, 'Ein']])
          + (f.limits ? fieldNum('lmin', 'Minimum', f.lmin, lkey === 'angle' ? '°' : 'mm', lkey === 'angle' ? 5 : 1) + fieldNum('lmax', 'Maximum', f.lmax, lkey === 'angle' ? '°' : 'mm', lkey === 'angle' ? 5 : 1) : '') : '')
        + (f.kind !== 'rigid' ? `<div class="btns"><button type="button" class="chip" data-cmd="joint-play">${ctx.jointAnim ? 'Stopp' : 'Bewegung abspielen'}</button></div>` : '');
    } else if (f.type === 'fastener') {
      const K = FASTENERS[f.kind] || FASTENERS.iso4762, sizes = Object.keys(K.dims), Ls = lengthsFor(f.size);
      if (!Ls.includes(Number(f.length))) Ls.push(Number(f.length)), Ls.sort((a, b) => a - b);
      body = fieldSeg('kind', 'Norm', f.kind, Object.entries(FASTENERS).map(([k, x]) => [k, `${x.norm} ${x.name}`]))
        + fieldSeg('size', 'Größe', f.size, sizes.map(s => [s, s]))
        + (K.screw ? fieldSeg('length', K.countersunk ? 'Länge (mit Kopf)' : 'Länge', String(f.length), Ls.map(L => [String(L), `${L} mm`])) : '')
        + `<div class="row"><span>Lage</span><b class="pref${f.edge ? '' : ' wait'}">${f.edge ? 'Bohrungsrand' : 'Bohrungsrand anklicken … (sonst frei)'}</b></div>`
        + (f.edge ? '' : fieldNum('px', 'X', f.px || 0, 'mm', 1) + fieldNum('py', 'Y', f.py || 0, 'mm', 1) + fieldNum('pz', 'Z', f.pz || 0, 'mm', 1))
        + fieldNum('offset', 'Abstand', f.offset || 0, 'mm', 0.5)
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + `<p class="info small">Verbindungselement: eigener Körper aus Stahl, in der Stückliste zusammengefasst. Gewinde nicht modelliert (Schaft = Nenn-⌀). Abstand z. B. für eine Mutter auf einer Scheibe.</p>`;
    } else if (f.type === 'sm_loft') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], opts = sketches.map(x => [x.id, x.name]), R0 = sheetRule();
      body = fieldSeg('skA', 'Profil 1', f.skA, opts.length >= 3 ? opts : [...opts, ['', '–']])
        + fieldSeg('skB', 'Profil 2', f.skB, opts.length >= 3 ? opts : [...opts, ['', '–']])
        + (f.more || []).map((id, i) => `<div class="row"><span>Profil ${i + 3}</span><select data-smlmore="${i}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === id ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button type="button" class="iconbtn" data-cmd="sml-del" data-i="${i}" title="Profil entfernen">${icon('close', 14)}</button></div>`).join('')
        + `<div class="btns"><button type="button" class="chip" data-cmd="sml-add">+ Profil</button></div>`
        + fieldSeg('mode', 'Ausführung', f.mode || 'brake', [['brake', 'Abkanten'], ['formed', 'Gerollt']])
        + ((f.mode || 'brake') === 'brake' ? fieldSeg('facetMode', 'Facetten nach', f.facetMode || 'number', [['number', 'Anzahl je 90°'], ['angle', 'Winkel'], ['length', 'Länge'], ['chord', 'Sehnentoleranz']])
          + ((f.facetMode || 'number') === 'number' ? fieldNum('facets', 'Facetten je 90°', f.facets ?? 4, '', 1, 'min="1" max="24"')
            : f.facetMode === 'angle' ? fieldNum('facetAngle', 'Höchstens je Facette', f.facetAngle ?? 22.5, '°', 2.5, 'min="0.1" max="180"')
            : f.facetMode === 'length' ? fieldNum('facetLength', 'Höchstens je Facette', f.facetLength ?? 20, 'mm', 1, 'min="0"')
            : fieldNum('chordTol', 'Sehnentoleranz', f.chordTol ?? 0.5, 'mm', 0.1, 'min="0"')) : '')
        + fieldSeg('side', 'Profile sind', f.side || 'out', [['out', 'Innenmaß'], ['mid', 'Blechmitte'], ['in', 'Außenmaß']])
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info small">Übergangslasche: Rundungen werden in Facetten geteilt (Abkanten: jede Facettenkante ist eine Biegelinie). Blech ${fmt(R0.t, 2)} mm, K ${fmt(R0.k, 2)}. Die Abwicklung zeigt Blech → Abwicklung.</p>`;
    } else if (f.type === 'sm_unfold') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      const some = Array.isArray(f.bends);
      body = `<div class="row"><span>Feste Fläche</span><b class="pref${f.face ? '' : ' wait'}">${f.face ? 'Ebene Fläche' : 'Blechfläche anklicken …'}</b></div>`
        + `<div class="row"><span>Biegungen</span><b class="pref${!some || f.bends.length ? '' : ' wait'}">${some ? `${f.bends.length} Biegung${f.bends.length === 1 ? '' : 'en'} gewählt` : 'alle Biegungen'}</b></div>`
        + fieldSeg('bends', 'Abwickeln', some ? 'some' : 'all', [['all', 'Alle Biegungen'], ['some', 'Nur ausgewählte']])
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info">${some
          ? 'Nur ausgewählte Biegungen werden flachgelegt: runde Biegeflächen im Modell anklicken (nochmal klicken nimmt sie wieder aus). Die anderen Biegungen bleiben stehen. Abwicklung und „Zurückfalten“ bleiben vollständig.'
          : 'Alle Biegungen werden flachgelegt, die feste Fläche bleibt liegen. Danach auf dem flachen Blech skizzieren und ausschneiden (auch über Biegungen hinweg) und mit „Zurückfalten“ wieder biegen.'}</p>`;
    } else if (f.type === 'sm_refold') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info">Faltet alle abgewickelten Bleche zurück. Was im flachen Zustand ausgeschnitten wurde, wird auf das gebogene Teil übertragen; Ausschnitte über Biegungen folgen der Biegung. Die Abwicklung zeigt danach die neuen Ausschnitte.</p>`;
    } else if (f.type === 'sm_convert') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], R0 = sheetRule();
      body = `<div class="row"><span>Feste Fläche</span><b class="pref${f.face ? '' : ' wait'}">${f.face ? 'Ebene Fläche' : 'Blechfläche anklicken …'}</b></div>`
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info">Der Körper muss überall gleich dick sein (z. B. Schale, Profil oder importiertes Blechteil). Rundungen werden zu Biegungen, scharfe Kanten zu Biegungen mit Radius 0, Ecken zu Trennstellen. K-Faktor ${fmt(R0.k, 2)} aus der Blechregel.</p>`
        + `<p class="info small">Nach OK zeigt Blech → Abwicklung den Zuschnitt (auch als DXF und in der Zeichnung).</p>`;
    } else if (f.type === 'thread') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = `<div class="row"><span>Fläche</span><b class="pref${f.face ? '' : ' wait'}">${f.face ? 'Zylinderfläche' : 'Bolzen oder Bohrung anklicken …'}</b></div>`
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<label class="row"><span>Größe</span><select data-k="size"><option value="auto"${f.size === 'auto' ? ' selected' : ''}>Automatisch</option>${Object.keys(ctx.THREADS).map(k => `<option value="${k}"${k === f.size ? ' selected' : ''}>${k} × ${fmt(ctx.THREADS[k], 2)}</option>`).join('')}</select></label>`
        + fieldNum('pitch', 'Steigung', f.pitch, 'mm', 0.05, 'min="0"') + `<p class="info small">0 = Regelgewinde nach ISO.</p>`
        + fieldNum('fit', 'Spiel', f.fit, 'mm', 0.05, 'min="0"') + `<p class="info small">Für den 3D-Druck z. B. 0,15 mm: Bolzen werden dünner, Muttergewinde weiter.</p>`
        + fieldSeg('full', 'Länge', f.full !== false, [[true, 'Ganze Fläche'], [false, 'Maß']])
        + (f.full === false ? fieldNum('length', 'Gewindelänge', f.length, 'mm', 1, 'min="0"') + fieldSeg('fromEnd', 'Beginnt am', !!f.fromEnd, [[false, 'Anfang'], [true, 'Ende']]) + fieldNum('offset', 'Versatz vom Ende', f.offset || 0, 'mm', 0.5, 'min="0"') : '')
        + fieldSeg('cosmetic', 'Darstellung', !!f.cosmetic, [[false, 'Modelliert'], [true, 'Kosmetisch']])
        + fieldSeg('left', 'Richtung', !!f.left, [[false, 'Rechts'], [true, 'Links']])
        + `<label class="row"><span>Toleranzklasse</span><select data-k="tclass">${[['', '–'], ['6g', '6g (Bolzen)'], ['6h', '6h (Bolzen)'], ['4h', '4h (Bolzen)'], ['8g', '8g (Bolzen)'], ['6H', '6H (Mutter)'], ['5H', '5H (Mutter)'], ['7H', '7H (Mutter)'], ['6G', '6G (Mutter)']].map(([v, l]) => `<option value="${v}"${(f.tclass || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`
        + '<p class="info small">Toleranzklasse nach ISO 965 (Klasse): nur Kennzeichnung, die Form ändert sie nicht.</p>';
    } else if (f.type === 'canvas') {
      // Ansichtsbereich: Bild als Vorlage zum Nachzeichnen
      body = `<div class="row"><span>Bild</span><span class="btns"><button type="button" class="chip" data-cmd="canvas-load">${f.img ? esc(f.imgName || 'Bild ✓') : 'Bild laden …'}</button></span></div>`
        + fieldSeg('cplane', 'Ebene', f.cplane || 'XY', [['XY', 'XY'], ['XZ', 'XZ'], ['YZ', 'YZ'], ['face', 'Fläche (Aufkleber)']])
        + (f.cplane === 'face' ? `<div class="row"><span>Fläche</span><b class="pref${f.face ? '' : ' wait'}">${f.face ? 'Ebene Fläche ✓' : 'Ebene Körperfläche anklicken …'}</b></div>` : '')
        + fieldNum('w', 'Breite', f.w, 'mm', 10, 'min="1"')
        + `<div class="row col"><span>Mitte in der Ebene</span><div class="xyz">${['cx', 'cy'].map((k, i) => `<label class="num"><b>${'XY'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k] || 0}"><em>mm</em></label>`).join('')}</div></div>`
        + fieldNum('rot', 'Drehung', f.rot || 0, '°', 5)
        + fieldNum('opacity', 'Deckkraft', f.opacity ?? 0.6, '', 0.1, 'min="0.05" max="1"')
        + '<p class="info small">Ansichtsbereich: ein Foto oder eine eingescannte Zeichnung in einer Ebene, zum Nachzeichnen in einer Skizze. Die Höhe folgt dem Seitenverhältnis des Bildes. Für die Maßstäblichkeit die Breite so wählen, dass eine bekannte Strecke stimmt.</p>';
    } else if (f.type === 'presspull') {
      body = `<div class="row"><span>Fläche</span><b class="pref">${f.face ? (f.face.t === 'PLANE' ? 'Ebene Fläche' : 'Zylinderfläche') : 'Im Modell anklicken'}</b></div>`
        + `<div class="row"><span>Weitere Flächen</span><span class="btns"><button type="button" class="chip" data-cmd="pp-more" aria-pressed="${ctx.editing.pickTarget === 'ppmore'}">${(f.more || []).length ? `${f.more.length} weitere` : 'Hinzufügen …'}</button></span></div>`
        + fieldSeg('ppTo', 'Bis', f.ppTo || 'dist', [['dist', 'Abstand'], ['face', 'Fläche (ersetzen)']])
        + (f.ppTo === 'face' ? `<div class="row"><span>Zielfläche</span><span class="btns"><button type="button" class="chip" data-cmd="pick-toface" aria-pressed="${ctx.editing.pickTarget === 'toface'}">${f.toFace ? 'Ebene Fläche ✓' : 'Fläche wählen'}</button></span></div>` : fieldNum('distance', 'Abstand', f.distance, 'mm', 1))
        + `<p class="info">Bis Fläche: die gewählten ebenen Flächen wandern bis zur parallelen Zielfläche. Positiv zieht die Fläche heraus, negativ drückt sie hinein. Weitere Flächen bekommen denselben Abstand – „Hinzufügen …“ drücken, dann anklicken.</p>`;
    } else if (f.type === 'sm_base') {
      const R0 = sheetRule();
      body = sel + prof + `<p class="info">Dicke ${fmt(R0.t, 2)} mm aus der Blechregel (Biegeradius ${fmt(R0.r, 2)}, K-Faktor ${fmt(R0.k, 2)}).</p>`
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + fieldSeg('op', 'Vorgang', f.op, [['new', 'Neuer Körper'], ['join', 'Verbinden'], ['newcomp', 'Neue Komponente']]);
    } else if (f.type === 'primitive') {
      const k = f.kind || 'box';
      body = fieldSeg('kind', 'Form', k, [['box', 'Quader'], ['cylinder', 'Zylinder'], ['sphere', 'Kugel'], ['torus', 'Torus']])
        + `<div class="row"><span>Basisebene</span><b class="pref">${esc(planeLabel(f.plane))}</b></div>`
        + `<div class="row"><span></span><span class="btns">${['XY', 'XZ', 'YZ'].map(q => `<button type="button" class="chip" data-cmd="mplane" data-key="${q}" aria-pressed="${f.plane && f.plane.kind === 'origin' && f.plane.key === q}">${q}</button>`).join('')}</span></div>`
        + `<div class="row col"><span>Mittelpunkt in der Ebene</span><div class="xyz">${['cx', 'cy'].map((q, i) => `<label class="num"><b>${'XY'[i]}</b><input type="number" step="1" data-k="${q}" value="${f[q] || 0}"><em>mm</em></label>`).join('')}</div></div>`
        + (k === 'box' ? fieldNum('w', 'Länge (X)', f.w, 'mm', 1, 'min="0"') + fieldNum('l', 'Breite (Y)', f.l, 'mm', 1, 'min="0"') + fieldNum('h', 'Höhe', f.h, 'mm', 1, 'min="0"') : '')
        + (k === 'cylinder' ? fieldNum('d', 'Durchmesser', f.d, 'mm', 1, 'min="0"') + fieldNum('h', 'Höhe', f.h, 'mm', 1, 'min="0"') : '')
        + (k === 'sphere' ? fieldNum('d', 'Durchmesser', f.d, 'mm', 1, 'min="0"') : '')
        + (k === 'torus' ? fieldNum('d', 'Torus-⌀ (Mitte Rohr)', f.d, 'mm', 1, 'min="0"') + fieldNum('d2', 'Rohr-⌀', f.d2, 'mm', 1, 'min="0"') : '')
        + (k !== 'sphere' ? fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']]) : '')
        + op
        + `<p class="info">Ebene: XY/XZ/YZ oder eine ebene Fläche bzw. Arbeitsebene im Modell anklicken. Der Mittelpunkt liegt in dieser Ebene.</p>`;
    } else if (f.type === 'coil') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = `<div class="row"><span>Basisebene</span><b class="pref">${esc(planeLabel(f.plane))}</b></div>`
        + `<div class="row"><span></span><span class="btns">${['XY', 'XZ', 'YZ'].map(k => `<button type="button" class="chip" data-cmd="mplane" data-key="${k}" aria-pressed="${f.plane && f.plane.kind === 'origin' && f.plane.key === k}">${k}</button>`).join('')}</span></div>`
        + `<div class="row col"><span>Mittelpunkt in der Ebene</span><div class="xyz">${['cx', 'cy'].map((k, i) => `<label class="num"><b>${'XY'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k] || 0}"><em>mm</em></label>`).join('')}</div></div>`
        + fieldNum('diameter', 'Durchmesser', f.diameter, 'mm', 1, 'min="0"')
        + fieldSeg('pos', 'Durchmesser ist', f.pos || 'center', [['inside', 'Außen-⌀'], ['center', 'Mitte Draht'], ['outside', 'Innen-⌀']])
        + fieldSeg('mode', 'Art', f.mode || 'pitch', [['pitch', 'Windungen + Steigung'], ['height', 'Windungen + Höhe'], ['hp', 'Höhe + Steigung'], ['spiral', 'Flache Spirale']])
        + (f.mode !== 'hp' ? fieldNum('turns', 'Windungen', f.turns, '', 1, 'min="0"') : '')
        + (f.mode === 'height' || f.mode === 'hp' ? fieldNum('height', 'Höhe', f.height, 'mm', 1, 'min="0"') : '')
        + (f.mode !== 'height' ? fieldNum('pitch', f.mode === 'spiral' ? 'Abstand je Windung' : 'Steigung', f.pitch, 'mm', 0.5, 'min="0"') : '')
        + fieldSeg('section', 'Querschnitt', f.section || 'circle', [['circle', 'Rund'], ['square', 'Quadrat'], ['tri_out', 'Dreieck außen'], ['tri_in', 'Dreieck innen']])
        + fieldNum('size', 'Querschnittsgröße', f.size, 'mm', 0.5, 'min="0"')
        + fieldSeg('left', 'Drehrichtung', !!f.left, [[false, 'Rechts'], [true, 'Links']])
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + fieldNum('angle', 'Startwinkel', f.angle || 0, '°', 15)
        + fieldSeg('flat', 'Enden', !!f.flat, [[false, 'Offen'], [true, 'Plan geschliffen']])
        + op
        + `<p class="info"><b class="coilinfo">${st && st.info ? esc(st.info) : ''}</b><br>Für Druckfedern im 3D-Druck: Steigung deutlich größer als der Draht wählen (z. B. 2,5×), Enden plan für sicheren Stand auf dem Druckbett.</p>`;
    } else if (f.type === 'import') {
      const kb = Math.round((f.data || '').length / 1024);
      body = `<div class="row"><span>Datei</span><b class="pref">${esc(f.file || f.name)}</b></div>`
        + `<p class="info small">${f.format === 'stl' ? 'STL ist ein Dreiecksnetz: anzeigen, messen, als Körper verwenden – Verrunden/Bohren daran geht nicht zuverlässig.' : 'STEP: echte Volumenkörper, damit lässt sich weiterarbeiten (Bohren, Ausschneiden, Gelenke).'} Gespeichert im Teil (${kb} KB).</p>`
        + `<div class="row col"><span>Versatz</span><div class="xyz">${['dx', 'dy', 'dz'].map((k, i) => `<label class="num"><b>${'XYZ'[i]}</b><input type="number" step="1" data-k="${k}" value="${f[k] || 0}"><em>mm</em></label>`).join('')}</div></div>`
        + (true ? fieldSeg('split', 'Mehrere Körper', f.split !== false, [[true, 'Einzeln'], [false, 'Als ein Körper']]) : '');
    } else if (f.type === 'sm_bend') {
      const R0 = sheetRule(), th = (Number(f.angle) || 90) * Math.PI / 180;
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      body = `<label class="row"><span>Biegelinie</span><select data-k="sketch">${opts(f.sketch)}</select></label>`
        + fieldNum('angle', 'Biegewinkel', f.angle, '°', 5, 'min="1" max="179"')
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Zur Skizzenseite'], [true, 'Andere Seite']])
        + fieldSeg('side', 'Bewegte Seite', !!f.side, [[false, 'Seite A'], [true, 'Seite B']])
        + `<p class="info small">Die Linie liegt auf der Blechfläche und ist die Mitte der Biegezone. Biegezugabe ${fmt(th * (R0.r + R0.k * R0.t), 2)} mm (t ${fmt(R0.t, 2)}, R ${fmt(R0.r, 2)}, K ${fmt(R0.k, 2)}).</p>`;
    } else if (f.type === 'derive') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], sel = new Set(f.bodies || []);
      const pbs = st && st.avail ? st.avail.map(a => [a.id, a]) : Object.entries((f.part && f.part.bodies) || {});
      body = `<div class="row"><span>Dokument</span><b class="pref">${esc(f.file || 'eingebettet')}</b></div>`
        + `<div class="row col"><span>Körper (keiner gewählt = alle sichtbaren)</span><div class="dvlist">${pbs.length ? pbs.map(([id, b]) => `<label class="chk"><input type="checkbox" data-dv="${esc(id)}"${sel.has(id) ? ' checked' : ''}> ${esc(b.name || id)}${b.hidden ? ' <em>(ausgeblendet)</em>' : ''}</label>`).join('') : '<em>keine Körperliste im Dokument</em>'}</div></div>`
        + `<label class="row chk"><input type="checkbox" data-dvp="1"${f.withParams ? ' checked' : ''}> Parameter übernehmen (${((f.part && f.part.params) || []).length})</label>`
        + (() => { const sks = ((f.part && f.part.features) || []).filter(s => s.type === 'sketch'), ss = new Set(f.sketches || []); return sks.length ? `<div class="row col"><span>Skizzen übernehmen</span><div class="dvlist">${sks.map(s => `<label class="chk"><input type="checkbox" data-dvs="${esc(s.id)}"${ss.has(s.id) ? ' checked' : ''}> ${esc(s.name)}</label>`).join('')}</div></div>` : ''; })()
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}${st.warn ? ` · ${esc(st.warn)}` : ''}</p>` : '')
        + `<p class="info">Ableiten: Körper des anderen Dokuments an ihrer Lage, verknüpft über die Datei (aktualisiert beim Öffnen oder mit „Teile aktualisieren“). Weitere Features können darauf aufbauen, z. B. Bohrungen oder Blech.</p>`;
    } else if (f.type === 'web') {
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = `<label class="row"><span>Skizze</span><select data-k="sketch">${opts(f.sketch)}</select></label>`
        + fieldNum('thickness', 'Dicke', f.thickness, 'mm', 0.5, 'min="0"')
        + fieldNum('depth', 'Tiefe', f.depth, 'mm', 1, 'min="0"')
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Normal'], [true, 'Umgekehrt']])
        + fieldSeg('extend', 'Linien', f.extend !== false, [[true, 'Bis zum Körper verlängern'], [false, 'Wie gezeichnet']])
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '')
        + `<p class="info">Jede Linie wird eine Wand (mittig zur Linie), die von der Skizzenebene um die Tiefe wächst, z. B. ein Rippennetz im Boden einer Schale. Anders als die Rippe reicht der Steg nicht bis zum Körper hinunter, nur die Enden laufen auf Wunsch bis an die Wände.</p>`;
    } else if (f.type === 'emboss') {
      body = sel + prof
        + `<div class="row"><span>Fläche</span><b class="pref${f.face ? '' : ' wait'}">${f.face ? (f.face.t === 'PLANE' ? 'Ebene Fläche' : 'Gekrümmte Fläche') : 'Fläche an der Prägestelle anklicken …'}</b></div>`
        + fieldSeg('mode', 'Art', f.mode || 'deboss', [['deboss', 'Gravieren'], ['emboss', 'Erhaben']])
        + fieldNum('depth', 'Tiefe', f.depth, 'mm', 0.1, 'min="0"')
        + (f.face && f.face.t !== 'PLANE' ? fieldSeg('wrap', 'Auf die Fläche', !!f.wrap, [[true, 'Abwickeln'], [false, 'Projizieren']]) : '')
        + fieldNum('offH', 'Versatz waagrecht', f.offH || 0, 'mm', 1)
        + fieldNum('offV', 'Versatz senkrecht', f.offV || 0, 'mm', 1)
        + fieldNum('rot', 'Drehwinkel', f.rot || 0, '°', 15)
        + `<p class="info small">Prägen: das Profil der Skizze wird auf die angeklickte Fläche gebracht – eben oder gekrümmt (z. B. Schrift auf einem Rohr) – und dort um die Tiefe vertieft oder erhaben aufgesetzt. Abwickeln (nur Zylinder): Maße quer zur Achse werden Bogenlänge, die Skizzenebene liegt parallel zur Achse. Projizieren: entlang der Skizzennormale. Versatz und Drehwinkel verschieben bzw. drehen das Profil in der Skizzenebene (um seine Mitte).</p>`;
    } else if (f.type === 'rib') {
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      body = `<label class="row"><span>Skizze</span><select data-k="sketch">${opts(f.sketch)}</select></label>`
        + fieldNum('thickness', 'Dicke', f.thickness, 'mm', 0.5, 'min="0"')
        + fieldNum('draft', 'Formschräge', f.draft || 0, '°', 0.5, 'min="0" max="30"')
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Zum Körper'], [true, 'Umgekehrt']])
        + `<p class="info small">Formschräge (z. B. 1–2° für Guss oder Spritzguss): Die Rippe hat an der Skizzenlinie die Dicke und wird zum Körper hin breiter.</p>`
        + `<p class="info">Jede Linie der Skizze wird eine Rippe, mittig zur Skizzenebene, die bis an den Körper reicht. Typisch: Skizze auf einer Ebene quer durch einen Winkel, Linie schräg über die Innenecke.</p>`;
    } else if (f.type === 'sm_contour') {
      const R0 = sheetRule();
      const opts = id => sketches.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      const st = ctx.lastBuild && ctx.lastBuild.sheet && ctx.lastBuild.sheet.contour && ctx.lastBuild.sheet.contour.feature === f.id ? ctx.lastBuild.sheet.contour : null;
      body = `<label class="row"><span>Kontur</span><select data-k="sketch">${opts(f.sketch)}</select></label>`
        + `<p class="info">Offener Linienzug = eine Blechseite. Biegungen entstehen an jedem Knick: Dicke ${fmt(R0.t, 2)} mm, Radius innen ${fmt(R0.r, 2)} mm, K ${fmt(R0.k, 2)} (Blechregel).</p>`
        + fieldNum('width', 'Breite', f.width, 'mm', 1, 'min="0"')
        + fieldSeg('direction', 'Richtung', f.direction, [['normal', 'Normal'], ['symmetric', 'Symmetrisch'], ['reverse', 'Umgekehrt']])
        + fieldSeg('flip', 'Dicke', !!f.flip, [[false, 'Seite A'], [true, 'Seite B']])
        + fieldSeg('op', 'Vorgang', f.op, [['new', 'Neuer Körper'], ['join', 'Verbinden'], ['newcomp', 'Neue Komponente']])
        + `<p class="info"><b class="cinfo">${st ? `Abgewickelte Länge ${fmt(st.total, 2)} mm · ${st.bends.length} Biegung${st.bends.length === 1 ? '' : 'en'}` : ''}</b></p>`;
    } else if (f.type === 'sm_join') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], R0 = sheetRule();
      body = `<div class="row"><span>Kanten</span><b class="pref${f.edges.length === 2 ? '' : ' wait'}">${f.edges.length === 2 ? 'zwei Endkanten' : f.edges.length ? 'jetzt die Kante am zweiten Blech …' : 'Endkante am ersten Blech anklicken …'}</b></div>`
        + fieldSeg('ownR', 'Biegeradius', !!f.ownR, [[false, 'Aus Blechregel'], [true, 'Eigener']])
        + (f.ownR ? fieldNum('radius', 'Radius innen', f.radius ?? R0.r, 'mm', 0.5, 'min="0"') : '')
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info small">Durch Biegung verbinden: Biegeradius ${f.ownR ? 'eigener Wert' : `${fmt(R0.r, 2)} mm aus der Blechregel`}, Dicke ${fmt(R0.t, 2)} mm. Beide Körper werden zu einem verbunden, die Abwicklung neu gerechnet.</p>`;
    } else if (f.type === 'sm_corner') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = fieldSeg('kind', 'Art', f.kind || 'round', [['round', 'Abrundung'], ['chamfer', 'Fase']])
        + fieldNum('size', f.kind === 'chamfer' ? 'Abstand' : 'Radius', f.size ?? 5, 'mm', 0.5, 'min="0"')
        + `<div class="row"><span>Ecken</span><b class="pref${f.all || f.edges.length ? '' : ' wait'}">${f.all ? 'alle Ecken' : f.edges.length ? `${f.edges.length} Ecke${f.edges.length > 1 ? 'n' : ''}` : 'Ecke anklicken …'}</b></div>`
        + fieldSeg('all', 'Auswahl', !!f.all, [[false, 'Angeklickte'], [true, 'Alle Ecken']])
        + (() => {
          // weitere Eckgruppen mit eigenem Maß (wie bei Abrunden/Fase)
          if (f.all) return '';
          const sets = f.sets || [], g = ctx.editing.grp || 0;
          const chip = (k, n) => `<button type="button" class="chip" data-cmd="fset-pick" data-i="${k}" aria-pressed="${g === k}">Gruppe ${k + 1} (${n})</button>`;
          return (sets.length ? `<div class="row col"><span>Eckgruppen</span><div class="flist">${chip(0, f.edges.length)} ${fmt(Number(f.size) || 0, 2)} mm`
            + sets.map((x, k) => `<div class="row">${chip(k + 1, x.edges.length)}<span class="num"><input type="text" inputmode="decimal" data-fset="${k}" value="${esc(String(x.value))}"><em>mm</em></span><button type="button" class="iconbtn" data-cmd="fset-del" data-i="${k}" title="Gruppe entfernen">${icon('close', 14)}</button></div>`).join('')
            + '</div></div>' : '')
            + `<div class="btns"><button type="button" class="chip" data-cmd="fset-add">+ Eckgruppe</button></div>`;
        })()
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '<p class="info tinfo"></p>')
        + `<p class="info small">Blechabrundung: nur Kanten in Dickenrichtung. Die Abwicklung wird aus der gerundeten Form neu gerechnet. Vorschau nach OK.</p>`;
    } else if (f.type === 'sm_rip') {
      const pts = f.mode === 'points', fl = f.mode === 'face';
      body = (fl ? `<div class="row"><span>Fläche</span><b class="pref${f.face ? '' : ' wait'}">${f.face ? 'Fläche gewählt' : 'ebene Blechfläche anklicken …'}</b></div>` : pts
        ? `<div class="row"><span>Punkte</span><b class="pref${f.a && f.b ? '' : ' wait'}">${f.a && f.b ? 'zwei Punkte gewählt' : f.a ? 'zweiten Punkt anklicken …' : 'ersten Punkt auf der Blechfläche anklicken …'}</b></div>`
        : `<div class="row"><span>Kanten</span><b class="pref${f.edges.length ? '' : ' wait'}">${f.edges.length ? `${f.edges.length} Kante${f.edges.length > 1 ? 'n' : ''}` : 'Eckkante anklicken …'}</b></div>`)
        + fieldSeg('mode', 'Auftrennen', f.mode || 'edge', [['edge', 'Ecke'], ['points', 'Zwischen zwei Punkten'], ['face', 'Fläche']])
        + (fl ? '<p class="info small">Fläche: die Blechwand hinter der angeklickten ebenen Fläche wird entfernt, die Nachbarwände enden stumpf – das Teil ist an allen Kanten dieser Fläche aufgetrennt. Die Dicke nimmt das Programm von der Gegenfläche. Vorschau nach OK.</p>' : '')
        + (fl ? '' : fieldNum('gap', 'Spalt', f.gap ?? 0.5, 'mm', 0.1, 'min="0.01"'))
        + (pts || fl ? ''
          : fieldSeg('kind', 'Art', f.kind || 'butt', [['butt', 'Stumpf'], ['miter', 'Gehrung']])
            + ((f.kind || 'butt') === 'butt' ? fieldSeg('flip', 'Durchlaufend', !!f.flip, [[false, 'Größere Wand'], [true, 'Andere Wand']]) : ''))
        + (pts ? fieldNum('off1', 'Versatz Punkt 1', f.off1 || 0, 'mm', 0.5) + fieldNum('off2', 'Versatz Punkt 2', f.off2 || 0, 'mm', 0.5)
          + '<p class="info small">Versatz positiv: der Schnitt endet so weit vor dem Punkt, negativ: er geht darüber hinaus. 0 = durch den Punkt bis an die Kante.</p>' : '')
        + (fl ? '' : `<p class="info small">${pts
          ? 'Zwischen zwei Punkten: gerader Schnitt durch eine Blechwand, beide Punkte auf derselben ebenen Fläche. Die Wanddicke nimmt das Programm von der gegenüberliegenden Fläche.'
          : (f.kind || 'butt') === 'butt' ? 'Stumpf: eine Wand läuft durch, die andere endet mit dem Spalt davor – passt zum Laserzuschnitt.' : 'Gehrung: Schnitt in der Winkelhalbierenden. Beim Laserzuschnitt (senkrechter Schnitt) überlappen die Wände innen.'} Steht „In Blech umwandeln“ davor, wird die Abwicklung neu gerechnet. Vorschau nach OK.</p>`);
    } else if (f.type === 'sm_flange') {
      const R0 = sheetRule(), hem = Number(f.angle) > 175, hk = hem ? f.hemKind || 'open' : '';
      const ff = flangeFlat(R0, Number(f.height), Number(f.angle) || 90, f.hemGap, { hemKind: f.hemKind, hemR: f.hemR, hemAngle: f.hemAngle, hemSetback: f.hemSetback });
      body = `<div class="row"><span>Kanten</span><b class="pref${f.edges.length ? '' : ' wait'}">${f.edges.length ? `${f.edges.length} Kante${f.edges.length > 1 ? 'n' : ''}` : 'gerade Blechkante anklicken …'}</b></div>`
        + (hk === 'rolled' ? '' : fieldNum('height', hem ? 'Saumlänge' : 'Höhe (außen)', f.height, 'mm', 1, 'min="0"'))
        + fieldNum('angle', 'Biegewinkel', f.angle, '°', 5, 'min="1" max="180"')
        + `<div class="row"><span></span><span class="btns"><button type="button" class="chip" data-cmd="flange-hem">Saum (180°)</button><button type="button" class="chip" data-cmd="flange-90">90°</button></span></div>`
        + (hem ? fieldSeg('hemKind', 'Saumart', hk, [['open', 'Flach/Offen'], ['rolled', 'Gerollt'], ['teardrop', 'Tropfen'], ['double', 'Doppelt']]) : '')
        + (hk === 'open' ? fieldNum('hemGap', 'Spalt (offener Saum)', f.hemGap ?? 2 * R0.r, 'mm', 0.1, 'min="0"') : '')
        + (hk === 'double' ? fieldNum('hemGap', 'Spalt (je Lage)', f.hemGap ?? 0, 'mm', 0.1, 'min="0"') + fieldNum('hemSetback', 'Rücksprung 2. Schenkel', f.hemSetback ?? 0, 'mm', 0.5, 'min="0"') : '')
        + (hk === 'rolled' || hk === 'teardrop' ? fieldNum('hemR', 'Radius innen', f.hemR ?? R0.r, 'mm', 0.5, 'min="0"') : '')
        + (hk === 'rolled' ? fieldNum('hemAngle', 'Rollwinkel', f.hemAngle ?? 270, '°', 10, 'min="180" max="350"') : '')
        + (hk === 'teardrop' ? fieldNum('hemGap', 'Spalt', f.hemGap ?? 0, 'mm', 0.1, 'min="0"') : '')
        + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Zur Fläche hin'], [true, 'Andere Seite']])
        + fieldSeg('extent', 'Ausdehnung', f.extent || 'full', [['full', 'Ganze Kante'], ['partial', 'Teilweise']])
        + (f.edges.length > 1 ? fieldSeg('corners', 'Ecken', f.corners || 'relief', [['relief', 'Offen mit Freischnitt'], ['tear', 'Reißecke (ohne Freischnitt)'], ['closed', 'Geschlossen'], ['overlap', 'Überlappend']]) + (f.corners === 'closed' ? fieldNum('gap', 'Eckspalt', f.gap ?? 0.2, 'mm', 0.1, 'min="0"') : '') : '')
        + (f.extent === 'partial' ? fieldNum('off1', 'Versatz Anfang', f.off1 || 0, 'mm', 1, 'min="0"') + fieldNum('off2', 'Versatz Ende', f.off2 || 0, 'mm', 1, 'min="0"') + '' : '')
        + fieldSeg('relief', 'Freischnitt', f.relief || 'rect', [['rect', 'Rechteckig'], ['none', 'Ohne']])
        + (ff.error ? `<p class="derr">${esc(ff.error)}</p>` : '')
        + `<p class="info small">Schenkel ${fmt(ff.L, 2)} mm · Biegezugabe ${fmt(ff.BA, 2)} mm · Abwicklung ${fmt(ff.flat, 2)} mm (t ${fmt(R0.t, 2)}, R ${fmt(ff.r, 2)}, K ${fmt(R0.k, 2)})${hk === 'open' ? ` · der Schenkel liegt ${fmt(2 * ff.r, 2)} mm über der Fläche, „0“ liegt flach an` : hk ? ` · Biegewinkel ${fmt(ff.th * 180 / Math.PI, 1)}°` : ''}</p>`;
    } else if (f.type === 'combine') {
      body = `<div class="row col"><span>Zielkörper</span>${bodyChips(f, 'target')}</div>`
        + `<div class="row col"><span>Werkzeugkörper</span>${bodyChips(f, 'tools')}</div>`
        + fieldSeg('op', 'Vorgang', f.op, [['join', 'Verbinden'], ['cut', 'Ausschneiden'], ['intersect', 'Schnittmenge']])
        + fieldSeg('keep', 'Werkzeuge', !!f.keep, [[false, 'Entfernen'], [true, 'Behalten']])
        + fieldSeg('newComp', 'Ergebnis', !!f.newComp, [[false, 'Im Zielkörper'], [true, 'Neue Komponente']])
        + `<p class="info">Im Modell: erster Klick = Zielkörper, weitere Klicks = Werkzeuge.${f.newComp ? ' Beim OK kommt der Zielkörper mit dem Ergebnis in eine neue Komponente.' : ''}</p>`;
    } else if (f.type === 'split') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      const byBody = f.tool === 'body' || f.tool === 'sketch', bySk = f.tool === 'sketch', fm = f.mode === 'faces';
      body = fieldSeg('mode', 'Ergebnis', f.mode === 'faces' ? 'faces' : 'bodies', [['bodies', 'Körper teilen'], ['faces', 'Flächen teilen']])
        + (fm ? `<div class="row"><span>Flächen</span><span class="btns"><button type="button" class="chip" data-cmd="split-faces" aria-pressed="${!!(f.faces || []).length}">Nur gewählte Flächen</button><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>` : '')
        + fieldSeg('tool', 'Teilungswerkzeug', bySk ? 'sketch' : byBody ? 'body' : 'plane', [['plane', 'Ebene'], ['body', 'Körper'], ['sketch', 'Skizze']], true)
        + `<div class="row col"><span>Körper (leer = alle)</span>${bodyChips(f, 'bodies')}</div>`
        + (bySk ? `<label class="row"><span>Skizze</span><select data-k="sketch">${ctx.doc.features.filter(x => x.type === 'sketch').map(s => `<option value="${s.id}"${s.id === f.sketch ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : '')
        + (byBody && !bySk ? `<div class="row"><span>Werkzeug</span><b class="pref${f.toolBody ? '' : ' wait'}">${f.toolBody ? esc(bodyName(f.toolBody)) : 'Fläche des Werkzeugkörpers anklicken …'}</b></div>`
          + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '')
          : '') + (byBody ? (bySk && st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '') + (bySk ? (fm ? '<p class="info">Jede geschlossene Kontur der Skizze teilt die Flächen, durch die sie senkrecht zur Skizzenebene läuft (z. B. ein Markierungsfeld auf einem Blech); der Körper bleibt ganz.</p>' : '<p class="info">Jede geschlossene Kontur der Skizze trennt die Körper senkrecht zur Skizzenebene (durch alles) – z. B. ein Blech an einer Kontur in Einzelteile für den Laser.</p>') : '')
          + (fm ? '' : '<p class="info">Was im Werkzeugkörper liegt, wird ein eigener Körper (z. B. ein Ausschnitt eines Blechs aus einer Kontur), der Rest bleibt; das Werkzeug bleibt erhalten und lässt sich danach ausblenden.</p>') : '')
        + (byBody ? '' : ``
          + `<div class="row"><span>Ebene</span><b class="pref">${esc(planeLabel(f.plane))}</b></div>`
          + `<div class="row"><span></span><span class="btns">${['XY', 'XZ', 'YZ'].map(k => `<button type="button" class="chip" data-cmd="mplane" data-key="${k}" aria-pressed="${f.plane && f.plane.kind === 'origin' && f.plane.key === k}">${k}</button>`).join('')}</span></div>`
          + `<p class="info">Oder eine ebene Fläche bzw. Arbeitsebene anklicken – mit Versatz-Arbeitsebenen lässt sich die Teilung genau setzen. ${f.mode === 'faces' ? 'Der Körper bleibt ganz; alle Flächen, die die Ebene trifft, werden an ihr geteilt (z. B. Trennlinie für eine Formschräge, Markierung auf Blech). Mit „Nur gewählte Flächen“ trifft die Teilung ausschließlich die angeklickten Flächen.' : 'Der Teil auf der Normalenseite wird ein neuer Körper.'}</p>`)
        + (fm && ctx.editing.pickTarget === 'split-faces' ? `<p class="info small">${(f.faces || []).length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''} gewählt – nur diese werden geteilt.` : 'Flächen im Modell anklicken, die geteilt werden sollen (auch gekrümmte). Ohne Auswahl teilt das Werkzeug alle getroffenen Flächen.'}</p>` : '')
        + (f.mode === 'faces' && st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '');
    } else if (f.type === 'silsplit') {
      // Silhouette geteilt („Flächen teilen“): Umrisslinie der Körper aus einer Blickrichtung
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = fieldSeg('art', 'Art', f.art === 'koerper' ? 'koerper' : 'flaechen', [['flaechen', 'Flächen teilen'], ['koerper', 'Körper teilen']])
        + fieldSeg('richtung', 'Blickrichtung', f.richtung || 'Z', [['X', 'X'], ['Y', 'Y'], ['Z', 'Z'], ['flaeche', 'Fläche']])
        + (f.richtung === 'flaeche' ? `<div class="row"><span>Fläche</span><b class="pref${f.richtungFlaeche ? '' : ' wait'}">${f.richtungFlaeche ? 'ebene Fläche ✓' : 'Ebene Fläche anklicken …'}</b></div>` : '')
        + `<div class="row col"><span>Körper (leer = alle)</span>${bodyChips(f, 'bodies')}</div>`
        + (st && (st.info || st.error) ? `<p class="info tinfo">Ergebnis: ${esc(st.info || st.error)}</p>` : '')
        + (f.art === 'koerper'
          ? '<p class="info small">Körper teilen: der Körper wird an seiner Silhouette in zwei Körper getrennt (z. B. zwei Formhälften), auch Hohl- und Schalenkörper. Liegt die Trennlinie in einer Ebene, teilt diese Ebene; sonst eine gekrümmte Trennfläche durch die Linie zwischen den zur Blickrichtung hin und weg gewandten Flächen.</p>'
          : '<p class="info small">Silhouette geteilt: gekrümmte Flächen werden entlang ihrer Umrisslinie aus der Blickrichtung geteilt (dort steht die Fläche senkrecht zur Blickrichtung) – z. B. die Trennlinie für eine Gussform oder eine Formschräge. Der Körper bleibt ganz.</p>');
    } else if (f.type === 'constraint') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], pt = ctx.editing.pickTarget || '';
      const TYPES = [['mate', 'Deckungsgleich (Flächen)'], ['concentric', 'Konzentrisch'], ['parallel', 'Parallel'], ['perpendicular', 'Senkrecht'], ['angle', 'Winkel']];
      const chip = (it, i, side) => { const on = pt === `c${side}:${i}`, s = it[side]; return `<button type="button" class="chip" data-cmd="cons-pick" data-side="${side}" data-i="${i}" aria-pressed="${on}">${on ? 'anklicken …' : s ? (s.kind === 'face' ? 'Fläche ✓' : 'Kante ✓') : side === 'a' ? 'bewegt …' : 'fest …'}</button>`; };
      body = `<div class="row col"><span>Abhängigkeiten</span><div class="flist">${f.items.map((it, i) => `<div class="row"><select data-ct="${i}">${TYPES.map(([v, l]) => `<option value="${v}"${v === it.type ? ' selected' : ''}>${l}</option>`).join('')}</select>${chip(it, i, 'a')}${chip(it, i, 'b')}`
        + (it.type === 'mate' ? `<span class="num"><input type="text" inputmode="decimal" data-cv="${i}" value="${esc(String(it.value || 0))}"><em>mm</em></span><label class="check"><input type="checkbox" data-cf="${i}"${it.flip ? ' checked' : ''}> bündig</label>` : it.type === 'angle' ? `<span class="num"><input type="text" inputmode="decimal" data-cv="${i}" value="${esc(String(it.value || 0))}"><em>°</em></span>` : '')
        + `<button type="button" class="iconbtn" data-cmd="cons-del" data-i="${i}" title="Entfernen">${icon('close', 14)}</button></div>`).join('')}</div></div>`
        + `<div class="btns"><button type="button" class="chip" data-cmd="cons-add">+ Abhängigkeit</button></div>`
        + (st && (st.info || st.error) ? `<p class="info tinfo">${esc(st.info || st.error)}</p>` : '')
        + '<p class="info small">Baugruppen-Abhängigkeiten: je Zeile zuerst eine Fläche/Kante der Komponente, die sich bewegen soll, dann das Gegenstück. Alle Abhängigkeiten gelten zugleich; die Komponente bewegt sich so wenig wie möglich. Deckungsgleich: ebene Flächen liegen aufeinander (bündig: gleiche Richtung), mit Abstand. Konzentrisch: Zylinderflächen oder Kreiskanten.</p>';
    } else if (f.type === 'lippe') {
      // Lippe / Absatz Kunststoff-Befehl: Band auf der ebenen Randfläche einer Schale
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      body = fieldSeg('art', 'Art', f.art === 'absatz' ? 'absatz' : 'lippe', [['lippe', 'Lippe'], ['absatz', 'Absatz']])
        + `<div class="row"><span>Randfläche</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${f.faces.length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''} gewählt.` : 'Die ebene Randfläche oben auf der Wand anklicken.'}</p>`
        + fieldSeg('seite', 'Kante', f.seite === 'aussen' ? 'aussen' : 'innen', [['innen', 'Innen'], ['aussen', 'Außen']])
        + fieldNum('w', 'Breite', f.w, 'mm', 0.1, 'min="0"')
        + fieldNum('h', f.art === 'absatz' ? 'Tiefe' : 'Höhe', f.h, 'mm', 0.1, 'min="0"')
        + (f.art === 'absatz' ? fieldNum('spiel', 'Spiel', f.spiel, 'mm', 0.05, 'min="0"') : '')
        + (st && (st.info || st.error) ? `<p class="info tinfo">Ergebnis: ${esc(st.info || st.error)}</p>` : '')
        + `<p class="info small">${f.art === 'absatz' ? 'Absatz: das Gegenstück zur Lippe am anderen Gehäuseteil – Breite und Tiefe wachsen um das Spiel, damit die Lippe hineinpasst.' : 'Lippe: ein Band entlang der Innen- oder Außenkante der Randfläche, nach außen aufgesetzt – zentriert zwei Gehäusehälften.'}</p>`;
    } else if (f.type === 'thicken') {
      body = `<div class="row"><span>Flächen</span><span class="btns"><button type="button" class="chip" data-cmd="clear-sel">Leeren</button></span></div>`
        + `<p class="info selinfo">${f.faces.length ? `${f.faces.length} Fläche${f.faces.length > 1 ? 'n' : ''} gewählt.` : 'Flächen eines Körpers anklicken (eben oder gekrümmt).'}</p>`
        + fieldNum('thickness', 'Dicke', f.thickness, 'mm', 0.5, 'min="0"')
        + fieldSeg('side', 'Richtung', f.side || 'out', [['out', 'Nach außen'], ['in', 'Nach innen'], ['mid', 'Mittig']])
        + fieldSeg('op', 'Vorgang', f.op || 'new', [['new', 'Neuer Körper'], ['join', 'Verbinden'], ['cut', 'Ausschneiden'], ['newcomp', 'Neue Komponente']])
        + '<p class="info small">Verdicken, hier für Flächen von Körpern: jede Fläche wird zur Schicht mit der Dicke – z. B. ein Blechdeckel genau auf einer Fläche oder eine Hülle um einen gekrümmten Bereich.</p>';
    } else if (f.type === 'topo') {
      /* Topologieoptimierung: Designbereich = gewählte Skizzenflächen, jedem Skizzenpunkt eine Rolle (Kraft, Halterung,
         erhaltener Bereich). Gerechnet wird während der Bearbeitung nur auf Knopfdruck – das dauert Sekunden. */
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], sk = ctx.doc.features.find(x => x.id === f.sketch);
      const pts = sk ? markerPoints(sk) : [], rollen = f.rolle || {};
      const zeile = (p, i) => {
        const r = rollen[p.id] || {};
        return `<div class="toporow"><span title="Punkt-ID ${esc(p.id)}">P${i + 1} (${fmt(p.x, 2)} | ${fmt(p.y, 2)})</span>`
          + `<select data-topo-rolle="${esc(p.id)}"><option value="">–</option>${ROLLEN.map(([k, l]) => `<option value="${k}" title="${esc(l)}"${r.art === k ? ' selected' : ''}>${esc(ROLLEN_KURZ[k])}</option>`).join('')}</select>`
          + (r.art === 'last' ? `<span class="topof">${['fx', 'fy'].map(a => `<label class="num"><b>${a === 'fx' ? 'Fx' : 'Fy'}</b><input type="number" step="10" data-topo-f="${esc(p.id)}" data-ax="${a}" value="${Number(r[a]) || 0}"><em>N</em></label>`).join('')}</span>` : '')
          + '</div>';
      };
      body = `<label class="row"><span>Skizze</span><select data-k="sketch">${sketches.map(s => `<option value="${s.id}"${s.id === f.sketch ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`
        + fieldSeg('bereich', 'Designbereich', f.bereich === 'flaeche' ? 'flaeche' : 'skizze', [['skizze', 'Skizzenflächen'], ['flaeche', 'Fläche eines Körpers']])
        + (f.bereich === 'flaeche'
          ? `<div class="row"><span>Fläche</span><b class="pref">${f.face ? 'Fläche gewählt ✓' : 'ebene Fläche anklicken'}</b></div><p class="info small">Die angeklickte Fläche (mit ihren Bohrungen) ist der Designbereich – sie muss parallel zur Skizze liegen. Kräfte und Halterungen in eigenen kleinen Skizzenflächen (z. B. Kreis um eine Bohrung) bleiben automatisch als Material erhalten Beibehalten-Geometrie.</p>`
          : '<p class="info small">Designbereich: Flächen der Skizze im Modell anklicken (ohne Auswahl alle äußeren Flächen mit ihren Löchern).</p>')
        + `<div class="topoblock"><span>Punkte der Skizze – Rolle zuweisen</span><div class="topopts">${pts.length ? pts.map(zeile).join('') : '<p class="info small">Die Skizze hat keine Punkte – Ecken, Kreismitten oder einzelne Punkte zeichnen.</p>'}</div></div>`
        + `<label class="row"><span>Werkstoff</span><select data-k="material">${Object.keys(ELASTIC).filter(k => k !== 'none').map(k => `<option value="${k}"${(f.material || 'steel') === k ? ' selected' : ''}>${esc((MATERIALS[k] && MATERIALS[k].label) || k)} (E ${fmt(ELASTIC[k].E, 0)} MPa)</option>`).join('')}</select></label>`
        + fieldNum('anteil', 'Zielanteil', f.anteil ?? 40, '%', 5, 'min="2" max="98"')
        + fieldNum('dicke', 'Dicke', f.dicke ?? 5, 'mm', 1, 'min="0.1"')
        + fieldNum('element', 'Rasterweite (0 = automatisch)', f.element ?? 0, 'mm', 0.5, 'min="0"')
        + `<details class="topoexp"><summary>Erweitert</summary>${fieldNum('wiederholungen', 'Schritte höchstens', f.wiederholungen ?? 60, '', 10, 'min="5" max="500"')}${fieldNum('abstrafung', 'Abstrafung (SIMP p)', f.abstrafung ?? 3, '', 0.5, 'min="1" max="6"')}${fieldNum('weich', 'Filterradius (0 = automatisch)', f.weich ?? 0, 'mm', 0.5, 'min="0"')}${fieldNum('glaettung', 'Glättung Umriss (0 = automatisch)', f.glaettung ?? 0, 'mm', 0.1, 'min="0"')}${fieldSeg('projektion', 'Ränder', f.projektion !== false, [[true, 'Scharf (Projektion)'], [false, 'Weich']])}</details>`
        + `<div class="row"><span></span><span class="btns"><button type="button" class="chip" data-cmd="topo-preview" aria-pressed="${!!(ctx.editing && ctx.editing.topoVorschau)}">Vorschau berechnen</button></span></div>`
        + '<p class="info small">Generatives Design, eben (2D): Material wird im Designbereich so verteilt, dass das Teil bei der gegebenen Kraft möglichst steif ist; der Umriss wird um die Dicke extrudiert. Liegt eine Kraft oder Halterung in einer Bohrungsmitte, gilt der ganze Bohrungsrand. Beim Bearbeiten rechnet nur „Vorschau berechnen“ (das dauert einige Sekunden), OK rechnet immer.</p>'
        + `<p class="info tinfo">${st && st.info ? 'Ergebnis: ' + esc(st.info) : ''}</p>`;
    } else if (f.type === 'boundfill') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id], cells = (st && st.cells) || [], pt = ctx.editing.pickTarget;
      const pls = f.planes || [], hasO = k => pls.some(p => p.kind === 'origin' && p.key === k), more = pls.filter(p => p.kind !== 'origin').length;
      const on = i => !Array.isArray(f.cells) || f.cells.includes(i);
      body = `<div class="row col"><span>Werkzeugkörper</span>${bodyChips(f, 'bodies')}</div>`
        + `<div class="row"><span>Ebenen</span><span class="btns">${['XY', 'XZ', 'YZ'].map(k => `<button type="button" class="chip" data-cmd="bf-oplane" data-key="${k}" aria-pressed="${hasO(k)}">${k}</button>`).join('')}<button type="button" class="chip" data-cmd="bf-planes" aria-pressed="${pt === 'bf-planes'}">${more ? `+ ${more} Ebene${more > 1 ? 'n' : ''}` : 'Ebene anklicken'}</button></span></div>`
        + (cells.length ? `<div class="row col"><span>Zellen</span><span class="btns">${cells.map((c, i) => `<button type="button" class="chip" data-cmd="bf-cell" data-i="${i}" aria-pressed="${on(i)}" title="Schwerpunkt ${c.center.map(v => fmt(v)).join(' | ')}">${i + 1}: ${fmt(c.volume)} mm³</button>`).join('')}</span></div>` : '')
        + fieldSeg('removeTools', 'Werkzeugkörper', !!f.removeTools, [[false, 'Behalten'], [true, 'Entfernen']])
        + `<p class="info small">Begrenzungsfüllung: Körper und Ebenen schließen Zellen ein; die gewählten Zellen werden ein neuer Körper – z. B. der Hohlraum zwischen Blechen als Füllung, ein Kern zwischen zwei Teilen oder ein Formeinsatz. ${pt === 'bf-planes' ? 'Arbeitsebene oder ebene Fläche anklicken (noch einmal = abwählen).' : 'Werkzeugkörper im Modell anklicken.'}</p>`
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '');
    } else if (f.type === 'bound') {
      body = `<div class="row col"><span>Körper (leer = alle)</span>${bodyChips(f, 'bodies')}</div>`
        + fieldSeg('shape', 'Form', f.shape || 'box', [['box', 'Quader'], ['cylinder', 'Zylinder']])
        + (f.shape === 'cylinder' ? fieldSeg('axis', 'Achse', f.axis || 'Z', [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]) : '')
        + fieldNum('offset', 'Abstand nach außen', f.offset || 0, 'mm', 1, 'min="0"')
        + '<p class="info small">Begrenzender Volumenkörper: ein neuer Körper, der die gewählten Körper umschließt – z. B. als Rohteil, Verpackung oder zum Ausschneiden.</p>';
    } else if (f.type === 'gitter') {
      const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
      const typ = GITTER_TYPEN[f.typ] ? f.typ : 'gyroid';
      body = `<div class="row col"><span>Körper (leer = alle)</span>${bodyChips(f, 'bodies')}</div>`
        + fieldSeg('typ', 'Gittertyp', typ, Object.keys(GITTER_TYPEN).map(k => [k, GITTER_TYPEN[k].label]))
        + `<p class="info small">${esc(GITTER_TYPEN[typ].hinweis)}</p>`
        + fieldNum('zelle', 'Gitterzelle (Maß einer Zelle)', f.zelle ?? 12, 'mm', 1, 'min="0.5"')
        + fieldNum('dicke', 'Wandstärke', f.dicke ?? 3, 'mm', 0.5, 'min="0.05"')
        + fieldNum('auflsung', 'Auflösung: Schritte pro Zelle (0 = automatisch)', f.auflsung ?? 0, '', 1, 'min="0" max="16"')
        + fieldSeg('op', 'Ergebnis', f.op || 'new', [['new', 'Neuer Körper'], ['replace', 'Körper ersetzen']])
        + '<p class="info small">Volumetrisches Feld: das Innere der Körper wird von einer periodischen Freiformfläche in der angegebenen Wandstärke gefüllt – die Stege enden auf den Flächen der Körper. Die Gitterzelle wiederholt sich im ganzen Körper, ihre Lage richtet sich nach dem Ursprung. Ein größeres Bauteil braucht ein gröberes Gitter: die Auflösung sinkt automatisch, wenn der Körper zu viele Punkte bräuchte.</p>'
        + '<p class="info small">Das Ergebnis ist ein Netzkörper aus Dreiecken (wie ein STL-Import), ohne Verrundungen an den Stegen – für den 3D-Druck und als Füllstruktur. Für Streben mit exakten Zylindern stattdessen ein Muster oder „Rahmen“ verwenden.</p>'
        + (st && st.info ? `<p class="info tinfo">Ergebnis: ${esc(st.info)}</p>` : '')
        + (st && st.warn ? `<p class="info small">${esc(st.warn)}</p>` : '');
    } else if (f.type === 'remove') {
      body = `<div class="row col"><span>Körper</span>${bodyChips(f, 'bodies')}</div><p class="info">Die Körper verschwinden ab dieser Stelle der Zeitleiste. Features davor bleiben unverändert.</p>`;
    } else if (f.type === 'pattern' || f.type === 'mirror') {
      const list = featureChecklist(f);
      if (f.type === 'pattern') {
        const xyz = [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']];
        body = list + fieldSeg('kind', 'Art', f.kind, [['circular', 'Kreismuster'], ['linear', 'Rechteckig'], ['path', 'Entlang Pfad'], ['points', 'An Punkten']]);
        if (f.kind === 'points') {
          body += `<label class="row"><span>Punkte</span><select data-k="ptsSketch"><option value=""${!f.ptsSketch ? ' selected' : ''}>– Skizze wählen –</option>${sketches.map(x => `<option value="${x.id}"${x.id === f.ptsSketch ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`
            + fieldSeg('orient', 'Ausrichtung', f.orient === 'face' ? 'face' : 'same', [['same', 'Gleich'], ['face', 'An Fläche (Normale)']])
            + (f.orient === 'face' ? `<div class="row"><span>Fläche</span><button type="button" class="chip" data-cmd="pattern-face" aria-pressed="${ctx.editing.pickTarget === 'ptsface'}">${f.face ? 'Fläche ✓' : 'Fläche anklicken …'}</button></div>` : '')
            + '<p class="info">Geometrische Anordnung an Punkten: an jeden einzelnen Punkt der Skizze kommt eine Kopie. Bezug ist der Punkt, der dem Original am nächsten liegt. „An Fläche“: die Punkte werden auf die Fläche gelegt (z. B. einen Zylinder) und die Kopien nach der Flächennormale gedreht.</p>';
        } else if (f.kind === 'path') {
          const st = ctx.lastBuild && ctx.lastBuild.status[f.id];
          body += `<label class="row"><span>Pfad</span><select data-k="path"><option value=""${!f.path ? ' selected' : ''}>– Skizze wählen –</option>${sketches.map(x => `<option value="${x.id}"${x.id === f.path ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`
            + fieldNum('count', 'Anzahl', f.count, 'Stück', 1, 'min="2" max="200"')
            + fieldSeg('dist', 'Verteilung', f.dist || 'extent', [['extent', 'Ganze Länge'], ['spacing', 'Abstand']])
            + (f.dist === 'spacing' ? fieldNum('spacing', 'Abstand', f.spacing, 'mm', 1, 'min="0"') : '')
            + fieldSeg('orient', 'Ausrichtung', f.orient || 'same', [['same', 'Gleich'], ['path', 'Dem Pfad folgen']])
            + fieldSeg('flip', 'Richtung', !!f.flip, [[false, 'Zum Pfadende'], [true, 'Zum Pfadanfang']])
            + fieldNum('startPos', 'Startpunkt (Lage des Originals)', f.startPos ?? (f.flip ? 100 : 0), '%', 5, 'min="0" max="100"')
            + fieldSeg('sym', 'Symmetrisch', !!f.sym, [[false, 'Nein'], [true, 'Ja']])
            + `<p class="info">Bezug ist der Anfang des Pfads: das Original sollte dort liegen. Abstände werden entlang der Kurve gemessen; bei einem geschlossenen Pfad verteilt „Ganze Länge“ ringsum.</p>`;
        } else {
          body += fieldSeg('axis', f.kind === 'circular' ? 'Drehachse' : 'Richtung', ctx.editing.pickTarget === 'patternaxis' || f.axisRef ? 'edge' : f.axis, [...xyz, ['edge', f.axisRef ? f.axisRef.label : 'Kante/Achse anklicken …']])
            + (ctx.editing.pickTarget === 'patternaxis' ? '<p class="info">Gerade Kante, Kreiskante oder Zylinderfläche im Modell anklicken.</p>' : '')
            + fieldNum('count', 'Anzahl', f.count, 'Stück', 1, 'min="2" max="200"')
            + (f.kind === 'circular' ? fieldNum('angle', 'Gesamtwinkel', f.angle, '°', 15, 'min="1" max="360"') + (Number(f.angle) < 360 ? fieldSeg('sym', 'Symmetrisch', !!f.sym, [[false, 'Nein'], [true, 'Ja']]) : '') + `<p class="info">Bei 360° verteilt sich die Anzahl gleichmäßig.${f.axisRef ? '' : ' X/Y/Z gehen durch den Ursprung; für eine andere Achse „Kante/Achse anklicken“.'}</p>`
              : fieldSeg('dist', 'Abstandsart', f.dist || 'spacing', [['spacing', 'Abstand'], ['extent', 'Ausdehnung']])
                + (f.dist === 'extent' ? fieldNum('extent', 'Ausdehnung', f.extent ?? 100, 'mm', 1) : fieldNum('spacing', 'Abstand', f.spacing ?? 20, 'mm', 1))
                + fieldSeg('sym', 'Symmetrisch', !!f.sym, [[false, 'Nein'], [true, 'Ja']])
                + fieldSeg('two', 'Zweite Richtung', !!f.two, [[false, 'Nein'], [true, 'Ja']])
                + (f.two ? fieldSeg('axis2', 'Richtung 2', ctx.editing.pickTarget === 'patternaxis2' || f.axis2Ref ? 'edge' : f.axis2 || 'Y', [...xyz, ['edge', f.axis2Ref ? f.axis2Ref.label : 'Kante/Achse anklicken …']])
                  + (ctx.editing.pickTarget === 'patternaxis2' ? '<p class="info">Gerade Kante, Kreiskante oder Zylinderfläche im Modell anklicken.</p>' : '')
                  + fieldNum('count2', 'Anzahl 2', f.count2 ?? 2, 'Stück', 1, 'min="1" max="200"')
                  + fieldSeg('dist2', 'Abstandsart 2', f.dist2 || 'spacing', [['spacing', 'Abstand'], ['extent', 'Ausdehnung (Gesamtmaß)']])
                  + (f.dist2 === 'extent' ? fieldNum('extent2', 'Ausdehnung 2', f.extent2 ?? 100, 'mm', 1) : fieldNum('spacing2', 'Abstand 2', f.spacing2 ?? 20, 'mm', 1))
                  + fieldSeg('sym2', 'Symmetrisch 2', !!f.sym2, [[false, 'Nein'], [true, 'Ja']]) : '')
                + `<p class="info">Abstand = Mitte-zu-Mitte zwischen zwei Kopien, Ausdehnung = Gesamtmaß von Mitte erster bis Mitte letzter Kopie. Symmetrisch steht das Original in der Mitte, braucht also eine ungerade Anzahl – die Zahl rückt beim Einschalten auf die nächste ungerade.${f.axisRef && (!f.two || f.axis2Ref) ? '' : ' Eine Richtung über „Kante/Achse anklicken“ auf das Bauteil legen – dann sitzt das Muster an der Kante und nicht auf der Weltachse.'}</p>`);
        }
      } else {
        body = fieldSeg('mode', 'Spiegeln', f.mode, [['features', 'Features'], ['body', 'Körper']])
          + (f.mode === 'body' ? fieldSeg('result', 'Ergebnis', f.result || 'join', [['new', 'Neuer Körper'], ['join', 'Verbinden']]) : list)
          + `<div class="row"><span>Ebene</span><b class="pref">${esc(planeLabel(f.plane))}</b></div>`
          + `<div class="row"><span></span><span class="btns">${['YZ', 'XZ', 'XY'].map(k => `<button type="button" class="chip" data-cmd="mplane" data-key="${k}" aria-pressed="${f.plane && f.plane.kind === 'origin' && f.plane.key === k}">${k}</button>`).join('')}</span></div>`
          + `<p class="info">Oder eine ebene Körperfläche bzw. Arbeitsebene anklicken.</p>`;
      }
    }
    d.className = 'dialog';
    d.innerHTML = dialogShell(f, body);
    applyUnits(d);
    d.hidden = false;
    const first = d.querySelector('.dbody input[type=number]');
    if (first && focus) { first.focus(); first.select(); }
  }
  return { closeDialog, dialogShell, fieldSeg, renderFeatureDialog, updateManip };
}
