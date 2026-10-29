// cantcodecad – Arbeitsbereich „Generatives Design“ mit den üblichen Begriffen:
// Studie → Entwurfsbereich (Beibehalten-, Hindernis-Geometrie, Startform) → Entwurfsbedingungen (Abhängigkeiten,
// Lasten in Lastfällen) → Richtlinien (Ziele, Fertigung) → Materialien → Erzeugen → Durchsuchen → Konstruktion erstellen.
// Fertigung ist „2-Achsen-Schneiden“ (Laser, Wasserstrahl, Plasma): dafür entsteht ein 2D-Umriss, der entlang
// der Schneidrichtung extrudiert wird – genau das rechnet der ebene Kern src/sim/topo.js (im Worker src/sim/gd-worker.js).
// Die Studie liegt im Dokument (doc.gd.studie), Ergebnisse unter doc.gd.ergebnisse; „Konstruktion erstellen“ legt ein
// Feature gdform an (Umriss + Beibehalten-Körper dazu, Hindernisse ab).
// Fertigung „Uneingeschränkt (3D)“: räumliche Topologieoptimierung auf einem Würfelnetz (src/sim/gd3d.js im Worker
// src/sim/gd3d-worker.js), Ergebnis als Knotendichtefeld; „Konstruktion erstellen“ legt ein Feature gdform3 an, der Kern
// baut daraus die geglättete Oberfläche als Netzkörper.
import { icon } from './icons.js';
import { MATERIALS, uid } from './doc.js';
import { ELASTIC } from './sim/topo.js';
import { pointInRegion } from './sketch/profiles.js';
import { oberflaeche } from './sim/gd3d.js';

const FARBE = { beibehalten: '#2ea043', hindernis: '#e5484d', startform: '#e3b341', frei: '#a7b0ba' };
const ABH = [['fest', 'Fest (alle Richtungen)'], ['fest-X', 'Fest nur in X'], ['fest-Y', 'Fest nur in Y'], ['fest-Z', 'Fest nur in Z']];
const MAXE = 4000;
/* Achsen der Schneidebene je Schneidrichtung – wie GD_EBENEN im Kern (rechtshändig, x × y = Schneidrichtung) */
const EBENE = { X: { x: [0, 1, 0], y: [0, 0, 1], xn: 'Y', yn: 'Z' }, Y: { x: [0, 0, 1], y: [1, 0, 0], xn: 'Z', yn: 'X' }, Z: { x: [1, 0, 0], y: [0, 1, 0], xn: 'X', yn: 'Y' } };
/* Kraft aus Betrag und Winkel in der Ebene (0° = erste Ebenenachse, 90° = zweite) in Weltkomponenten – und zurück */
const kraftAus = (achse, betrag, winkel) => { const e = EBENE[achse], c = Math.cos(winkel * Math.PI / 180), s = Math.sin(winkel * Math.PI / 180); return [0, 1, 2].map(i => Math.round((betrag * (c * e.x[i] + s * e.y[i])) * 1e6) / 1e6); };
/* Richtungen für Kräfte im Raum (Fertigung uneingeschränkt) */
const DIR3 = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] };
const DIR3_LABEL = { 'x+': '+X', 'x-': '−X', 'y+': '+Y', 'y-': '−Y', 'z+': '+Z', 'z-': '−Z' };
const dir3Of = l => { const F = [l.fx, l.fy, l.fz], b = Math.hypot(...F) || 1; return Object.keys(DIR3).find(k => DIR3[k].every((v, i) => Math.abs(v - F[i] / b) < 1e-6)) || null; };
const kraftIn = (achse, l) => { const e = EBENE[achse], F = [l.fx, l.fy, l.fz], a = F[0] * e.x[0] + F[1] * e.x[1] + F[2] * e.x[2], b = F[0] * e.y[0] + F[1] * e.y[1] + F[2] * e.y[2]; return { betrag: Math.hypot(a, b), winkel: ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360, quer: Math.abs(F[0] * (e.x[1] * e.y[2] - e.x[2] * e.y[1]) + F[1] * (e.x[2] * e.y[0] - e.x[0] * e.y[2]) + F[2] * (e.x[0] * e.y[1] - e.x[1] * e.y[0])) }; };

export function neueStudie() {
  return {
    name: 'Studie 1', achse: 'Z', beibehalten: [], hindernis: [], startform: null, abhaengigkeiten: [],
    lastfaelle: [{ id: uid(), name: 'Lastfall 1', lasten: [] }], fall: 0,
    ziel: { art: 'masse', masse: 200, sicherheit: 2 }, materialien: ['steel'], raster: 0, wiederholungen: 60, fertigung: 'schneiden', druck: { richtungen: ['z+'], winkel: 45 }, fraesen: { richtungen: ['z+'] }, guss: { achsen: ['Z'] }
  };
}

export function setupGenerativeDesign(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a), fmt = (...a) => ctx.fmt(...a);
  const st = { werkzeug: null, entwurf: null, laeuft: null, live: null, ansicht: 'einrichten', auswahl: null, sort: 'masse', meldung: '' };
  let worker = null, frame = 0;

  const studie = () => {
    if (!ctx.doc.gd) ctx.doc.gd = { studie: null, ergebnisse: [] };
    if (!ctx.doc.gd.studie) ctx.doc.gd.studie = neueStudie();
    const s = ctx.doc.gd.studie, d = neueStudie();
    for (const k of Object.keys(d)) if (s[k] == null) s[k] = d[k];
    if (!s.lastfaelle.length) s.lastfaelle = d.lastfaelle;
    return s;
  };
  const ergebnisse = () => (ctx.doc.gd && ctx.doc.gd.ergebnisse) || [];
  const koerper = () => (ctx.lastBuild && ctx.lastBuild.bodies) || [];
  const speichern = () => { ctx.store(); };
  const aendern = fn => { ctx.pushHistory(); fn(studie()); speichern(); farben(); render(); };
  const matName = k => (MATERIALS[k] && MATERIALS[k].label) || k;

  /* ---------- Öffnen / Schließen ---------- */
  function open() {
    if (!koerper().length) { ctx.toast('Für Generatives Design braucht es Körper: mindestens die Beibehalten-Geometrie (z. B. Augen um die Bohrungen).'); return; }
    if (ctx.editing) ctx.cancelEditing();
    studie();
    st.werkzeug = null; st.ansicht = 'einrichten'; st.meldung = '';
    ctx.setMode('gd');
    renderRibbon();
    farben();
    ctx.vp.setPickMode('face');
    render();
    cancelAnimationFrame(frame);
    const loop = () => { if (ctx.mode !== 'gd') return; marken(); frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
  }
  function close() {
    if (worker) { worker.terminate(); worker = null; st.laeuft = null; }
    cancelAnimationFrame(frame);
    const ov = $('#gdmarken'); if (ov) ov.remove();
    const ex = $('#gdexplore'); if (ex) ex.remove();
    vorschau3d(null);
    ctx.closeDialog();
    ctx.setMode('model');
    ctx.renderRibbon();
    ctx.vp.setBodyColors(ctx.bodyColorMap()); ctx.vp.setFaded(ctx.fadedBodies());
  }
  /* Farben: Beibehalten grün, Hindernis rot, Startform gelb, alles andere grau */
  function farbenMap() {
    if (ctx.mode !== 'gd') return null;
    const s = studie(), o = {};
    koerper().forEach(id => { o[id] = FARBE.frei; });
    s.beibehalten.forEach(id => { o[id] = FARBE.beibehalten; });
    s.hindernis.forEach(id => { o[id] = FARBE.hindernis; });
    if (s.startform) o[s.startform] = FARBE.startform;
    return o;
  }
  function farben() { const m = farbenMap(); if (m) ctx.vp.setBodyColors({ ...ctx.bodyColorMap(), ...m }); }

  /* ---------- Menüband (Definieren) ---------- */
  function renderRibbon() {
    const cb = (cmd, ic, label, on) => `<button type="button" class="fbtn" data-cmd="${cmd}"${on != null ? ` aria-pressed="${!!on}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${icon(ic, 28)}</button>`;
    const grp = (id, label, inner) => `<div class="fgroup g-${id}"><div class="ftools">${inner}</div><span class="fglabel static">${esc(label)}</span></div>`;
    const w = st.werkzeug;
    $('#ribbon').innerHTML = `
      <div class="rtabs"><button type="button" class="wsbtn" data-menu="ws">Generatives Design ${ctx.caretSvg}</button>
        <span class="rtab" aria-selected="${st.ansicht === 'einrichten'}">Definieren</span><span class="rtab" aria-selected="${st.ansicht === 'durchsuchen'}">Durchsuchen</span></div>
      <div class="rbody">
        ${grp('gstudie', 'Studie', cb('gd-neu', 'topo', 'Neue Studie (setzt die Einrichtung zurück, Ergebnisse bleiben)'))}
        ${grp('gbereich', 'Entwurfsbereich', cb('gd-w-beibehalten', 'body', 'Beibehalten-Geometrie: Körper, die im Ergebnis bleiben (Augen, Anschlussflächen) – grün', w === 'beibehalten') + cb('gd-w-hindernis', 'trash', 'Hindernis-Geometrie: Körper, wo kein Material hin darf (Schrauben, Freiräume) – rot', w === 'hindernis') + cb('gd-w-startform', 'pbox', 'Startform: Körper, dessen Umriss den Designbereich begrenzt (z. B. die bisherige Platte) – gelb', w === 'startform'))}
        ${grp('gbed', 'Entwurfsbedingungen', cb('gd-w-abh', 'joint', 'Abhängigkeit: Fläche einer Beibehalten-Geometrie festhalten (z. B. Bohrungswand)', w === 'abh') + cb('gd-w-last', 'move', 'Last: Kraft auf eine Fläche einer Beibehalten-Geometrie', w === 'last'))}
        ${grp('gricht', 'Richtlinien', cb('gd-w-ziele', 'params', 'Ziele: Steifigkeit maximieren (Zielmasse) oder Masse minimieren (Sicherheitsfaktor)', w === 'ziele') + cb('gd-w-fertigung', 'nest', 'Fertigung: 2-Achsen-Schneiden (Laser, Wasserstrahl, Plasma) oder uneingeschränkt (3D-Druck, Guss)', w === 'fertigung'))}
        ${grp('gmat', 'Materialien', cb('gd-w-materialien', 'render', 'Studienmaterialien: je Material ein Ergebnis', w === 'materialien'))}
        ${grp('gerz', 'Erzeugen', cb('gd-pruefen', 'measure', 'Vorprüfung: ist die Studie vollständig?') + cb('gd-erzeugen', 'topo', 'Erzeugen: Ergebnisse berechnen (auf diesem Rechner, einige Sekunden je Material)', !!st.laeuft))}
        ${grp('gdurch', 'Durchsuchen', cb('gd-durchsuchen', 'bom', `Ergebnisse durchsuchen (${ergebnisse().length})`, st.ansicht === 'durchsuchen'))}
        <div class="fgroup g-gfinish"><div class="ftools"><button type="button" class="fbtn finish stop" data-cmd="gd-close" title="Generatives Design schließen" aria-label="Generatives Design schließen">${icon('close', 28)}</button></div><span class="fglabel static">Schließen</span></div>
      </div>`;
  }

  /* ---------- Vorprüfung („Vorprüfung“ vor dem Erzeugen) ---------- */
  function pruefen() {
    const s = studie(), p = [], ids = new Set(koerper());
    if (!s.beibehalten.length) p.push('Es fehlt Beibehalten-Geometrie – mindestens die Körper, an denen Kräfte und Halterungen sitzen.');
    if (!s.abhaengigkeiten.length) p.push('Es fehlt eine Abhängigkeit (Fläche festhalten).');
    if (!s.lastfaelle.some(f => f.lasten.length)) p.push('Es fehlt eine Last.');
    if (!s.materialien.length) p.push('Kein Material gewählt.');
    [...s.beibehalten, ...s.hindernis, ...(s.startform ? [s.startform] : [])].forEach(id => { if (!ids.has(id)) p.push(`Ein Körper der Studie gibt es nicht mehr (${id}).`); });
    const anB = z => s.beibehalten.includes(z.body);
    if ([...s.abhaengigkeiten, ...s.lastfaelle.flatMap(f => f.lasten)].some(z => !anB(z))) p.push('Kräfte und Abhängigkeiten gehören auf Beibehalten-Geometrie – sonst kann die Optimierung die Stelle wegnehmen.');
    if (s.beibehalten.some(id => s.hindernis.includes(id))) p.push('Ein Körper ist zugleich Beibehalten- und Hindernis-Geometrie.');
    return p;
  }

  /* ---------- Einrichtung im Feld rechts (Browser der Studie + Befehlsdialog) ---------- */
  function render() {
    if (ctx.mode !== 'gd') return;
    renderRibbon();
    if (st.ansicht === 'durchsuchen') { renderExplore(); return; }
    const ex = $('#gdexplore'); if (ex) ex.remove();
    vorschau3d(null);
    const s = studie(), d = $('#dialog');
    const zeile = (txt, cmd, data) => `<li><span>${txt}</span>${cmd ? `<button type="button" class="chip gdx" data-cmd="${cmd}" ${data} title="entfernen">×</button>` : ''}</li>`;
    const name = id => esc(ctx.bodyName(id));
    const fall = s.lastfaelle[s.fall] || s.lastfaelle[0];
    const probleme = pruefen();
    d.className = 'dialog gddlg';
    d.innerHTML = `<header>${icon('topo', 20)}<b class="dtitle">${esc(s.name)}</b><span class="gdsub">${fertText(s)}</span></header><div class="dbody">
      ${st.laeuft ? laufBox() : ''}
      ${werkzeugBox()}
      <details open class="gdgrp"><summary><i class="gdsw" style="background:${FARBE.beibehalten}"></i>Beibehalten-Geometrie <em>${s.beibehalten.length}</em></summary><ul>${s.beibehalten.map(id => zeile(name(id), 'gd-weg', `data-rolle="beibehalten" data-id="${esc(id)}"`)).join('') || '<li class="leer">Körper anklicken (Entwurfsbereich → Beibehalten)</li>'}</ul></details>
      <details open class="gdgrp"><summary><i class="gdsw" style="background:${FARBE.hindernis}"></i>Hindernis-Geometrie <em>${s.hindernis.length}</em></summary><ul>${s.hindernis.map(id => zeile(name(id), 'gd-weg', `data-rolle="hindernis" data-id="${esc(id)}"`)).join('') || '<li class="leer">keine</li>'}</ul></details>
      <details class="gdgrp"${s.startform ? ' open' : ''}><summary><i class="gdsw" style="background:${FARBE.startform}"></i>Startform <em>${s.startform ? 1 : 0}</em></summary><ul>${s.startform ? zeile(name(s.startform), 'gd-weg', `data-rolle="startform" data-id="${esc(s.startform)}"`) : '<li class="leer">keine – Bereich = Hülle der Beibehalten-Geometrie + Rand</li>'}</ul></details>
      <details open class="gdgrp"><summary>Abhängigkeiten <em>${s.abhaengigkeiten.length}</em></summary><ul>${s.abhaengigkeiten.map(a => zeile(`${esc((ABH.find(x => x[0] === a.art) || ABH[0])[1])} · ${name(a.body)}`, 'gd-weg', `data-rolle="abh" data-id="${esc(a.id)}"`)).join('') || '<li class="leer">keine</li>'}</ul></details>
      <details open class="gdgrp"><summary>Lastfälle <em>${s.lastfaelle.length}</em></summary>
        <div class="gdfaelle">${s.lastfaelle.map((f, i) => `<button type="button" class="chip" data-cmd="gd-fall" data-i="${i}" aria-pressed="${i === s.fall}">${esc(f.name)} (${f.lasten.length})</button>`).join('')}<button type="button" class="chip" data-cmd="gd-fall-neu" title="Lastfall hinzufügen">+</button></div>
        <ul>${fall.lasten.map(l => zeile(`<button type="button" class="gdlink${l.id === st.aktiv && st.werkzeug === 'last' ? ' on' : ''}" data-cmd="gd-last-wahl" data-id="${esc(l.id)}" title="Last bearbeiten">${lastText(l)}</button> · ${name(l.body)}`, 'gd-weg', `data-rolle="last" data-id="${esc(l.id)}"`)).join('') || '<li class="leer">keine Kraft in diesem Lastfall</li>'}</ul></details>
      <details class="gdgrp"><summary>Ziele <em>${s.ziel.art === 'masse' ? 'Masse minimieren' : 'Steifigkeit maximieren'}</em></summary><p class="info small">${s.ziel.art === 'masse' ? `Sicherheitsfaktor ≥ ${fmt(s.ziel.sicherheit, 2)}` : `Zielmasse ${fmt(s.ziel.masse, 0)} g`}</p></details>
      <details class="gdgrp"><summary>Fertigung <em>${esc(fertText(s).split(' · ')[0])}</em></summary><p class="info small">${raum() ? 'räumlich' : `Schneidrichtung ${s.achse}`}, Rasterweite ${s.raster > 0 ? fmt(s.raster, 2) + ' mm' : 'automatisch'}</p></details>
      <details class="gdgrp"><summary>Materialien <em>${s.materialien.length}</em></summary><p class="info small">${s.materialien.map(matName).map(esc).join(', ') || '–'}</p></details>
      ${st.laeuft ? '' : `<div class="gdcheck ${probleme.length ? 'bad' : 'ok'}">${probleme.length ? '<b>Vorprüfung</b><ul>' + probleme.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<b>Vorprüfung bestanden</b> – bereit zum Erzeugen.'}</div>`}
      ${st.meldung ? `<p class="derr">${esc(st.meldung)}</p>` : ''}
      </div><footer><button type="button" class="btn primary" data-cmd="gd-erzeugen"${st.laeuft || probleme.length ? ' disabled' : ''}>Erzeugen</button><button type="button" class="btn" data-cmd="gd-durchsuchen"${ergebnisse().length ? '' : ' disabled'}>Ergebnisse (${ergebnisse().length})</button></footer>`;
    d.hidden = false;
    if (st.laeuft && st.live) zeichneLive();
  }
  /* Befehlsdialog des aktiven Werkzeugs (oben im Feld) */
  function werkzeugBox() {
    const s = studie(), w = st.werkzeug, e = st.entwurf;
    if (!w) return '';
    const fertig = '<div class="btns"><button type="button" class="btn small" data-cmd="gd-w-aus">Fertig</button></div>';
    const box = (titel, inner) => `<div class="gdcmd"><b>${esc(titel)}</b>${inner}</div>`;
    if (w === 'beibehalten' || w === 'hindernis' || w === 'startform') {
      const t = { beibehalten: 'Beibehalten-Geometrie', hindernis: 'Hindernis-Geometrie', startform: 'Startform' }[w];
      return box(t, `<p class="info small">Körper im Modell anklicken – noch einmal anklicken nimmt ihn heraus.${w === 'startform' ? ' Nur ein Körper.' : ''}</p>${fertig}`);
    }
    if (w === 'abh') {
      return box('Abhängigkeit', `<label class="row"><span>Art</span><select data-gd="abhArt">${ABH.map(([k, l]) => `<option value="${k}"${(e && e.art || 'fest') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label><p class="info small">Fläche einer Beibehalten-Geometrie anklicken (z. B. die Wand einer Bohrung) – sie wird festgehalten.</p>${fertig}`);
    }
    if (w === 'last' && raum()) {
      const f = e || { betrag: 100, dir3: 'z-' }, akt = aktiveLast();
      return box(akt ? 'Last bearbeiten' : `Neue Last in „${(s.lastfaelle[s.fall] || s.lastfaelle[0]).name}“`,
        `<label class="row"><span>Betrag</span><span class="num"><input type="number" step="10" min="0" data-gd="betrag" value="${fmtZahl(f.betrag)}"><em>N</em></span></label>
        <div class="row"><span>Richtung</span><span class="btns">${Object.keys(DIR3).map(k => `<button type="button" class="chip" data-cmd="gd-richtung3" data-v="${k}" aria-pressed="${(f.dir3 || 'z-') === k}">${DIR3_LABEL[k]}</button>`).join('')}</span></div>
        <p class="info small">${akt ? 'Änderungen gelten sofort für die gewählte Last (Pfeil im Modell). Weitere Fläche anklicken = neue Last mit diesen Werten.' : 'Betrag und Richtung einstellen, dann die Fläche einer Beibehalten-Geometrie anklicken (z. B. Bohrungswand).'}</p>${fertig}`);
    }
    if (w === 'last') {
      const f = e || { betrag: 100, winkel: 270 }, E = EBENE[s.achse], akt = aktiveLast();
      const ri = [[0, `+${E.xn}`], [180, `−${E.xn}`], [90, `+${E.yn}`], [270, `−${E.yn}`]];
      return box(akt ? 'Last bearbeiten' : `Neue Last in „${(s.lastfaelle[s.fall] || s.lastfaelle[0]).name}“`,
        `<label class="row"><span>Betrag</span><span class="num"><input type="number" step="10" min="0" data-gd="betrag" value="${fmtZahl(f.betrag)}"><em>N</em></span></label>
        <div class="row"><span>Richtung</span><span class="btns">${ri.map(([w2, l]) => `<button type="button" class="chip" data-cmd="gd-richtung" data-v="${w2}" aria-pressed="${Math.abs(((f.winkel - w2) % 360 + 360) % 360) < 1e-6}">${l}</button>`).join('')}</span></div>
        <label class="row"><span>Winkel in der Ebene</span><span class="num"><input type="number" step="15" data-gd="winkel" value="${fmtZahl(f.winkel)}"><em>°</em></span></label>
        <p class="info small">${akt ? 'Änderungen gelten sofort für die gewählte Last (Pfeil im Modell). Weitere Fläche anklicken = neue Last mit diesen Werten.' : 'Betrag und Richtung einstellen, dann die Fläche einer Beibehalten-Geometrie anklicken (z. B. Bohrungswand).'} Winkel 0° = +${E.xn}, 90° = +${E.yn} (Schneidebene quer zu ${s.achse}).</p>${fertig}`);
    }
    if (w === 'ziele') {
      return box('Ziele', `<div class="seg" role="radiogroup">${[['steifigkeit', 'Steifigkeit maximieren'], ['masse', 'Masse minimieren']].map(([k, l]) => `<button type="button" data-cmd="gd-ziel" data-v="${k}" role="radio" aria-checked="${s.ziel.art === k}">${l}</button>`).join('')}</div>
        ${s.ziel.art === 'masse' ? `<label class="row"><span>Sicherheitsfaktor</span><span class="num"><input type="number" step="0.5" min="1" data-gd="sicherheit" value="${s.ziel.sicherheit}"><em></em></span></label><p class="info small">Kleinste Masse, bei der die Vergleichsspannung (von Mises) höchstens Streckgrenze / Sicherheitsfaktor ist. Rechnet je Material fünf Varianten.</p>`
          : `<label class="row"><span>Zielmasse</span><span class="num"><input type="number" step="10" min="1" data-gd="masse" value="${s.ziel.masse}"><em>g</em></span></label><p class="info small">Steifstes Teil mit dieser Masse (je Material; leichte Werkstoffe bekommen so mehr Volumen). Die Form richtet sich hier nur nach der Richtung der Lasten – ihr Betrag ändert nur den Sicherheitsfaktor. Zum Auslegen auf die Last „Masse minimieren“ wählen.</p>`}${fertig}`);
    }
    if (w === 'fertigung') {
      const meth = `<div class="seg" role="radiogroup">${[['schneiden', '2-Achsen-Schneiden'], ['frei', 'Uneingeschränkt (3D)'], ['additiv', 'Additiv'], ['fraesen', 'Fräsen'], ['giessen', 'Gießen']].map(([k, l]) => `<button type="button" data-cmd="gd-fert" data-v="${k}" role="radio" aria-checked="${(s.fertigung || 'schneiden') === k}">${l}</button>`).join('')}</div>`;
      const dr = druckOf(s);
      if (s.fertigung === 'additiv') return box('Fertigung', `${meth}
        <div class="row"><span>Druckrichtung</span><span class="btns">${Object.keys(DIR3).map(k => `<button type="button" class="chip" data-cmd="gd-druckrichtung" data-v="${k}" aria-pressed="${dr.richtungen.includes(k)}">${DIR3_LABEL[k]}</button>`).join('')}</span></div>
        <label class="row"><span>Überhangwinkel</span><span class="num"><input type="number" step="5" min="10" max="80" data-gd="ueberhang" value="${dr.winkel}"><em>°</em></span></label>
        <label class="row"><span>Rasterweite (0 = automatisch)</span><span class="num"><input type="number" step="0.5" min="0" data-gd="raster" value="${s.raster}"><em>mm</em></span></label>
        <label class="row"><span>Schritte höchstens</span><span class="num"><input type="number" step="10" min="10" max="300" data-gd="wiederholungen" value="${s.wiederholungen}"><em></em></span></label>
        <p class="info small">Fertigung „Additiv“: Die Form wird so verteilt, dass sie ohne Stützen druckbar ist – jede Unterseite steigt mindestens unter dem Überhangwinkel gegen die Druckplatte an (45° üblich für FDM). Die Druckplatte liegt an der Unterseite des Entwurfsbereichs, gegen die Druckrichtung. Beibehalten-Körper zählen als gestützt. Meist etwas weicher als „Uneingeschränkt“. Mehrere Druckrichtungen wählen = je Richtung ein Ergebnis zum Vergleichen.</p>${fertig}`);
      const rasterZeilen = `<label class="row"><span>Rasterweite (0 = automatisch)</span><span class="num"><input type="number" step="0.5" min="0" data-gd="raster" value="${s.raster}"><em>mm</em></span></label>
        <label class="row"><span>Schritte höchstens</span><span class="num"><input type="number" step="10" min="10" max="300" data-gd="wiederholungen" value="${s.wiederholungen}"><em></em></span></label>`;
      if (s.fertigung === 'fraesen') return box('Fertigung', `${meth}
        <div class="row"><span>Werkzeug von</span><span class="btns">${Object.keys(DIR3).map(k => `<button type="button" class="chip" data-cmd="gd-fraesrichtung" data-v="${k}" aria-pressed="${fraesOf(s).richtungen.includes(k)}">${DIR3_LABEL[k]}</button>`).join('')}</span></div>
        ${rasterZeilen}
        <p class="info small">Fertigung „Fräsen“: Das Werkzeug kommt aus der gewählten Richtung, also darf es keine Hinterschnitte geben – jede Spalte in Werkzeugrichtung ist von unten her voll (Höhenprofil, 3-Achsen-Fräsen von einer Seite). Mehrere Richtungen = je Richtung ein Ergebnis.</p>${fertig}`);
      if (s.fertigung === 'giessen') return box('Fertigung', `${meth}
        <div class="row"><span>Entformungsachse</span><span class="btns">${['X', 'Y', 'Z'].map(a => `<button type="button" class="chip" data-cmd="gd-gussachse" data-v="${a}" aria-pressed="${gussOf(s).achsen.includes(a)}">${a}</button>`).join('')}</span></div>
        ${rasterZeilen}
        <p class="info small">Fertigung „Gießen“ (Druckguss): Die Form wird entlang der Achse nach beiden Seiten abgezogen, also darf in keiner Spalte entlang der Achse ein Hohlraum zwischen Material liegen. Die Trennebene ergibt sich von selbst. Mehrere Achsen = je Achse ein Ergebnis.</p>${fertig}`);
      if (raum()) return box('Fertigung', `${meth}
        <label class="row"><span>Rasterweite (0 = automatisch)</span><span class="num"><input type="number" step="0.5" min="0" data-gd="raster" value="${s.raster}"><em>mm</em></span></label>
        <label class="row"><span>Schritte höchstens</span><span class="num"><input type="number" step="10" min="10" max="300" data-gd="wiederholungen" value="${s.wiederholungen}"><em></em></span></label>
        <p class="info small">Fertigung „Uneingeschränkt“: Das Material wird im Raum verteilt (Würfelnetz, automatisch etwa 8000 Würfel, je Material etwa eine halbe bis einige Minuten). Das Ergebnis ist eine geglättete Freiform für 3D-Druck oder Guss, ein Netzkörper wie ein STL-Import. Die Beibehalten-Körper bleiben exakt (Bohrungen) und werden mit der Freiform vereinigt.</p>${fertig}`);
      return box('Fertigung', `${meth}<div class="row"><span>Schneidrichtung</span><span class="btns">${['X', 'Y', 'Z'].map(a => `<button type="button" class="chip" data-cmd="gd-achse" data-v="${a}" aria-pressed="${s.achse === a}">${a}</button>`).join('')}</span></div>
        <label class="row"><span>Rasterweite (0 = automatisch)</span><span class="num"><input type="number" step="0.5" min="0" data-gd="raster" value="${s.raster}"><em>mm</em></span></label>
        <label class="row"><span>Schritte höchstens</span><span class="num"><input type="number" step="10" min="10" max="300" data-gd="wiederholungen" value="${s.wiederholungen}"><em></em></span></label>
        <p class="info small">2-Achsen-Schneiden (Laser, Wasserstrahl, Plasma): Das Ergebnis ist ein 2D-Umriss, der über die Dicke der Körper entlang der Schneidrichtung extrudiert wird – passt direkt zur Laser-DXF. Für 3D-Druck oder Guss „Uneingeschränkt (3D)“ wählen.</p>${fertig}`);
    }
    if (w === 'materialien') {
      return box('Studienmaterialien', `<div class="gdmats">${Object.keys(ELASTIC).filter(k => k !== 'none' && MATERIALS[k]).map(k => `<label class="check"><input type="checkbox" data-gdmat="${k}"${s.materialien.includes(k) ? ' checked' : ''}> ${esc(matName(k))} <em>E ${fmt(ELASTIC[k].E, 0)} MPa · Re ${ELASTIC[k].fy} MPa · ${MATERIALS[k].rho} g/cm³</em></label>`).join('')}</div><p class="info small">Je Material entsteht ein Ergebnis. Werte sind Richtwerte (Stahl S235, Alu 6082 T6 …).</p>${fertig}`);
    }
    return '';
  }

  const fmtZahl = v => String(Math.round((Number(v) || 0) * 1000) / 1000);
  const raum = () => ['frei', 'additiv', 'fraesen', 'giessen'].includes(studie().fertigung);
  const fraesOf = s => ({ richtungen: s.fraesen && Array.isArray(s.fraesen.richtungen) && s.fraesen.richtungen.length ? s.fraesen.richtungen : ['z+'] });
  const gussOf = s => ({ achsen: s.guss && Array.isArray(s.guss.achsen) && s.guss.achsen.length ? s.guss.achsen : ['Z'] });
  /* Fertigung als Text: „2-Achsen-Schneiden · Richtung Z“, „Uneingeschränkt (3D)“, „Additiv · +Z, 45°“ */
  /* Druckeinstellung der Studie (ältere Studien: eine Richtung in „richtung“) */
  const druckOf = s => { const d = s.druck || {}; return { richtungen: d.richtungen && d.richtungen.length ? d.richtungen : [d.richtung || 'z+'], winkel: Number(d.winkel) || 45 }; };
  const fertText = s => (s.fertigung === 'additiv' ? `Additiv · ${druckOf(s).richtungen.map(k => DIR3_LABEL[k]).join(' / ')}, ${fmt(druckOf(s).winkel, 0)}°`
    : s.fertigung === 'fraesen' ? `Fräsen · Werkzeug ${fraesOf(s).richtungen.map(k => DIR3_LABEL[k]).join(' / ')}`
    : s.fertigung === 'giessen' ? `Gießen · Entformung ${gussOf(s).achsen.join(' / ')}`
    : s.fertigung === 'frei' ? 'Uneingeschränkt (3D)' : `2-Achsen-Schneiden · Richtung ${s.achse}`);
  /* Fertigung eines einzelnen Laufs (Ergebnis) */
  const laufText = d => (d.art === 'fraesen' ? `Fräsen · Werkzeug ${d.name}` : d.art === 'giessen' ? `Gießen · Entformung ${d.name}` : `Additiv · ${d.name}, ${fmt(d.winkel, 0)}°`);
  const PRUEF = { additiv: 'Ungestützte Würfel', fraesen: 'Hinterschnitte (Würfel)', giessen: 'Hohlräume (Würfel)' };
  /* Kraft aus dem Entwurf: im Raum Betrag × Richtung (±X/±Y/±Z), sonst Betrag und Winkel in der Schneidebene */
  const kraftVon = f => (raum() ? (DIR3[f.dir3] || DIR3['z-']).map(v => v * f.betrag) : kraftAus(studie().achse, f.betrag, f.winkel));
  const lastText = l => {
    if (raum()) { const d = dir3Of(l); return `Kraft ${fmt(Math.hypot(l.fx, l.fy, l.fz), 1)} N ${d ? DIR3_LABEL[d] : `(${fmt(l.fx, 0)} | ${fmt(l.fy, 0)} | ${fmt(l.fz, 0)})`}`; }
    const k = kraftIn(studie().achse, l);
    return `Kraft ${fmt(k.betrag, 1)} N unter ${fmt(k.winkel, 0)}°`;
  };
  const entwurfAus = l => { const k = kraftIn(studie().achse, l); return { betrag: Math.round((raum() ? Math.hypot(l.fx, l.fy, l.fz) : k.betrag) * 1000) / 1000, winkel: Math.round(k.winkel * 1000) / 1000, dir3: dir3Of(l) || 'z-' }; };
  const aktiveLast = () => (st.aktiv ? studie().lastfaelle.flatMap(f => f.lasten).find(l => l.id === st.aktiv) : null);
  /* Betrag/Winkel auf die gewählte Last übertragen (ohne neu zu zeichnen: das Eingabefeld behält den Fokus) */
  function lastSetzen() {
    const l = aktiveLast(), f = st.entwurf;
    if (!l || !f) return;
    [l.fx, l.fy, l.fz] = kraftVon(f);
    speichern();
    const t = document.querySelector(`#dialog [data-cmd="gd-last-wahl"][data-id="${l.id}"]`);
    if (t) t.textContent = lastText(l);
  }

  /* ---------- Klicks im Modell ---------- */
  function pick(h) {
    const w = st.werkzeug;
    if (!w || !h || h.kind !== 'face') { if (!w) ctx.toast('Erst im Menüband ein Werkzeug wählen (Beibehalten, Hindernis, Abhängigkeit, Last …).'); return; }
    const id = ctx.bodyIdAtFace(h.info);
    if (!id) return;
    if (w === 'beibehalten' || w === 'hindernis') {
      aendern(s => {
        const andere = w === 'beibehalten' ? 'hindernis' : 'beibehalten';
        s[andere] = s[andere].filter(x => x !== id);
        if (s.startform === id) s.startform = null;
        s[w] = s[w].includes(id) ? s[w].filter(x => x !== id) : [...s[w], id];
      });
      return;
    }
    if (w === 'startform') { aendern(s => { s.startform = s.startform === id ? null : id; s.beibehalten = s.beibehalten.filter(x => x !== id); s.hindernis = s.hindernis.filter(x => x !== id); }); return; }
    // Abhängigkeiten und Lasten nur auf Beibehalten-Geometrie – sonst könnte die Optimierung die Stelle wegnehmen
    if (!studie().beibehalten.includes(id)) { ctx.toast('Kräfte und Abhängigkeiten gehören auf Beibehalten-Geometrie (grün). Diese Fläche gehört zu einem anderen Körper – erst ihn als Beibehalten wählen.', 6000); return; }
    const ziel = { id: uid(), face: ctx.faceRef(h.info), body: id, at: h.point || h.info.center };
    if (w === 'abh') { aendern(s => { s.abhaengigkeiten.push({ ...ziel, art: (st.entwurf && st.entwurf.art) || 'fest' }); }); return; }
    if (w === 'last') {
      const f = st.entwurf || { betrag: 100, winkel: 270 };
      if (!(f.betrag > 0)) { ctx.toast('Erst den Betrag der Kraft eingeben (Newton).'); return; }
      const [fx, fy, fz] = kraftVon(f);
      aendern(s => { (s.lastfaelle[s.fall] || s.lastfaelle[0]).lasten.push({ ...ziel, fx, fy, fz }); });
      st.aktiv = ziel.id; // weiter bearbeitbar, bis eine andere Last gewählt wird
      render();
    }
  }

  /* Marken im Modell: jede Kraft als gelber Pfeil in ihrer Richtung (Spitze auf der Fläche) mit Betrag,
     Abhängigkeiten als blaues Schild „Fest“; die gerade bearbeitete Kraft hervorgehoben */
  function marken() {
    let ov = $('#gdmarken');
    if (!ov) { ov = document.createElement('div'); ov.id = 'gdmarken'; ov.className = 'gdmarken'; $('#viewport').appendChild(ov); }
    if (st.ansicht !== 'einrichten') { if (ov.innerHTML) ov.innerHTML = ''; return; }
    const s = studie(), fall = s.lastfaelle[s.fall] || s.lastfaelle[0], vp = ctx.vp;
    const svg = [], schilder = [];
    s.abhaengigkeiten.forEach(a => { const p = vp.toScreen(a.at); schilder.push(`<span class="gdm abh" style="transform:translate(${p[0].toFixed(0)}px,${p[1].toFixed(0)}px) translate(-50%,-130%)">${esc(a.art === 'fest' ? 'Fest' : 'Fest ' + a.art.slice(5))}</span>`); });
    fall.lasten.forEach(l => {
      const F = [l.fx, l.fy, l.fz], b = Math.hypot(...F);
      if (!(b > 0)) return;
      const d = F.map(v => v / b), kopf = vp.toScreen(l.at), lw = 70 * vp.worldPerPixel();
      const schaft = vp.toScreen(l.at.map((v, i) => v - d[i] * lw));
      let dx = kopf[0] - schaft[0], dy = kopf[1] - schaft[1];
      const L = Math.hypot(dx, dy);
      const on = l.id === st.aktiv && st.werkzeug === 'last' ? ' on' : '';
      if (L > 4) {
        dx /= L; dy /= L;
        const sp = 11, br = 6, bx = kopf[0] - dx * sp, by = kopf[1] - dy * sp;
        svg.push(`<g class="gdpf${on}"><line x1="${schaft[0].toFixed(1)}" y1="${schaft[1].toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/><polygon points="${kopf[0].toFixed(1)},${kopf[1].toFixed(1)} ${(bx - dy * br).toFixed(1)},${(by + dx * br).toFixed(1)} ${(bx + dy * br).toFixed(1)},${(by - dx * br).toFixed(1)}"/></g>`);
      }
      // Kraft genau in Blickrichtung: nur der Punkt; der Betrag steht am Pfeilende
      schilder.push(`<span class="gdm last${on}" style="transform:translate(${schaft[0].toFixed(0)}px,${schaft[1].toFixed(0)}px) translate(-50%,-50%)">${fmt(b, 0)} N</span>`);
    });
    const html = `<svg class="gdpfeile">${svg.join('')}</svg>${schilder.join('')}`;
    if (ov.innerHTML !== html) ov.innerHTML = html;
  }

  /* ---------- Erzeugen ---------- */
  async function erzeugen() {
    const p = pruefen();
    if (p.length) { st.meldung = p[0]; render(); return; }
    const s = studie();
    if (raum()) return erzeugen3D(s);
    st.meldung = '';
    const lasten = s.lastfaelle.flatMap(f => f.lasten), ziele = [...s.abhaengigkeiten, ...lasten].map(z => ({ key: z.id, face: z.face, body: z.body }));
    let g;
    try { g = await ctx.kernel.gdGeometrie({ achse: s.achse, beibehalten: s.beibehalten, hindernis: s.hindernis, startform: s.startform ? [s.startform] : [], ziele }); }
    catch (err) { st.meldung = 'Geometrie: ' + (err.message || err); render(); return; }
    let modell;
    try { modell = raster(s, g); } catch (err) { st.meldung = err.message; render(); return; }
    const mats = s.materialien.map(k => ({ key: k, name: matName(k), ...ELASTIC[k], rho: MATERIALS[k].rho || 7.85 }));
    const auftrag = uid();
    st.laeuft = { id: auftrag, mats: mats.length, fertig: 0, text: 'startet …', modell, g, studie: JSON.parse(JSON.stringify(s)) };
    st.live = null;
    render();
    if (worker) worker.terminate();
    worker = new Worker(new URL('./sim/gd-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ev => antwort(ev.data);
    worker.onerror = ev => { st.meldung = 'Rechner: ' + (ev.message || 'Fehler'); st.laeuft = null; render(); };
    worker.postMessage({ id: auftrag, modell: modell.topo, dicke: modell.dicke, bereichFlaeche: modell.flaeche, materialien: mats, ziel: s.ziel, wiederholungen: s.wiederholungen, geometrie: modell.geometrie });
  }
  /* Raster in der Schneidebene: Bereich = Startform (sonst Hülle der Beibehalten-Geometrie mit Rand), Beibehalten = Material,
     Hindernis = leer; Kräfte und Halterungen als Punktlisten der angeklickten Flächen */
  function raster(s, g) {
    const fuss = r => (g[r] || []).flatMap(x => x.flaechen);
    const keepR = fuss('beibehalten'), obsR = fuss('hindernis');
    let startR = fuss('startform');
    const alle = [...keepR, ...startR];
    if (!keepR.length) throw new Error('Die Beibehalten-Geometrie schneidet die Ebene nicht – Schneidrichtung prüfen.');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    alle.forEach(r => r.poly.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
    if (!startR.length) {
      // ohne Startform: Hülle der Beibehalten-Geometrie, hier mit 15 % Rand
      const rx = (x1 - x0) * 0.15, ry = (y1 - y0) * 0.15;
      x0 -= rx; x1 += rx; y0 -= ry; y1 += ry;
      startR = [{ poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holePolys: [] }];
    }
    const w = x1 - x0, h = y1 - y0;
    // automatisch so fein, dass etwa 3500 Elemente im Rechteck liegen (Rechenzeit einige Sekunden je Material)
    const el = s.raster > 0 ? s.raster : Math.max(Math.sqrt(w * h / 3500), Math.max(w, h) / 150);
    let nelx = Math.max(6, Math.round(w / el)), nely = Math.max(6, Math.round(h / el));
    while (nelx * nely > MAXE) { nelx = Math.max(6, Math.floor(nelx / 1.3)); nely = Math.max(6, Math.floor(nely / 1.3)); }
    const hx = w / nelx, hy = h / nely, mask = new Uint8Array(nelx * nely), keep = new Uint8Array(nelx * nely);
    for (let e = 0; e < mask.length; e++) {
      const c = [x0 + (e % nelx + 0.5) * hx, y0 + (Math.floor(e / nelx) + 0.5) * hy];
      if (obsR.some(r => pointInRegion(r, c))) continue;
      if (keepR.some(r => pointInRegion(r, c))) { mask[e] = 1; keep[e] = 1; continue; }
      if (startR.some(r => pointInRegion(r, c))) mask[e] = 1;
    }
    const e = g.ebene, ax = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
    const auf = (v, a) => v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
    const stuetzen = s.abhaengigkeiten.map(a => {
      const pts = g.ziele[a.id] || [];
      if (a.art === 'fest') return { punkte: pts, art: 'fest' };
      const d = ax[a.art.slice(5)];
      if (Math.abs(auf(d, e.x)) > 0.99) return { punkte: pts, art: 'rolle-x' };
      if (Math.abs(auf(d, e.y)) > 0.99) return { punkte: pts, art: 'rolle-y' };
      return null; // entlang der Schneidrichtung: im ebenen Modell ohne Wirkung
    }).filter(Boolean);
    const lastfaelle = s.lastfaelle.filter(f => f.lasten.length).map(f => f.lasten.map(l => {
      const F = [l.fx, l.fy, l.fz];
      return { punkte: g.ziele[l.id] || [], fx: auf(F, e.x), fy: auf(F, e.y) };
    }));
    const dicke = g.z1 - g.z0;
    if (!(dicke > 1e-6)) throw new Error('Die Körper haben entlang der Schneidrichtung keine Dicke.');
    const nur = r => ({ poly: r.poly, holePolys: r.holePolys || [] });
    return { topo: { nelx, nely, hx, hy, ox: x0, oy: y0, mask, keep, stuetzen, lastfaelle }, dicke, flaeche: mask.reduce((a, v) => a + v, 0) * hx * hy, geometrie: { keep: keepR.map(nur), hindernis: obsR.map(nur), start: startR.map(nur) } };
  }
  /* ---------- Erzeugen im Raum (Fertigung uneingeschränkt) ---------- */
  const netzM = () => ctx.lastBuild && ctx.lastBuild.mesh;
  /* Dreiecke (9 Werte je Dreieck) aus dem Anzeigenetz: ganzer Körper bzw. die zur gespeicherten Kennung passende Fläche */
  function koerperTris(id) {
    const m = netzM(), b = m && m.bodies.find(x => x.id === id);
    if (!b) throw new Error(`Zum Körper ${ctx.bodyName(id)} gibt es kein Netz.`);
    const P = m.positions, I = m.index, out = new Float64Array((b.tris[1] - b.tris[0]) * 3);
    for (let k = b.tris[0]; k < b.tris[1]; k++) { const v = I[k], o = (k - b.tris[0]) * 3; out[o] = P[3 * v]; out[o + 1] = P[3 * v + 1]; out[o + 2] = P[3 * v + 2]; }
    return out;
  }
  function flaechenTris(z) {
    const m = netzM(), b = m && m.bodies.find(x => x.id === z.body);
    if (!b) throw new Error(`Zum Körper ${ctx.bodyName(z.body)} gibt es kein Netz.`);
    const P = m.positions, I = m.index, teile = [];
    for (let i = b.faces[0]; i < b.faces[1]; i++) {
      const f = m.faces[i];
      if (!ctx.sameFace(z.face, f)) continue;
      const out = new Float64Array(f.count * 3);
      for (let k = 0; k < f.count; k++) { const v = I[f.start + k]; out[3 * k] = P[3 * v]; out[3 * k + 1] = P[3 * v + 1]; out[3 * k + 2] = P[3 * v + 2]; }
      teile.push(out);
    }
    if (!teile.length) throw new Error(`Eine gewählte Fläche an ${ctx.bodyName(z.body)} gibt es nicht mehr – neu anklicken.`);
    const out = new Float64Array(teile.reduce((a, t) => a + t.length, 0));
    let o = 0; teile.forEach(t => { out.set(t, o); o += t.length; });
    return out;
  }
  function hulle(ids) {
    const m = netzM(), a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    ids.forEach(id => { const x = m.bodies.find(q => q.id === id); if (x) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], x.bbox[0][k]); b[k] = Math.max(b[k], x.bbox[1][k]); } });
    return [a, b];
  }
  function erzeugen3D(s) {
    st.meldung = '';
    let job;
    try {
      const keepB = hulle(s.beibehalten);
      let bereich, bb;
      if (s.startform) { bereich = { tris: koerperTris(s.startform) }; bb = hulle([s.startform, ...s.beibehalten]); }
      else {
        // ohne Startform: Hülle der Beibehalten-Geometrie, hier mit 15 % Rand
        const r = [0, 1, 2].map(k => (keepB[1][k] - keepB[0][k]) * 0.15);
        bb = [keepB[0].map((v, k) => v - r[k]), keepB[1].map((v, k) => v + r[k])];
        bereich = { box: bb };
      }
      const V = (bb[1][0] - bb[0][0]) * (bb[1][1] - bb[0][1]) * (bb[1][2] - bb[0][2]);
      // automatisch etwa 8000 Würfel im Bereich (Rechenzeit unter einer Minute je Lauf)
      const h = s.raster > 0 ? s.raster : Math.cbrt(V / 8000);
      if ((V / h ** 3) > 60000) throw new Error(`Die Rasterweite ${fmt(h, 2)} mm ergibt über 60 000 Würfel – größer wählen.`);
      const DOF = { fest: [0, 1, 2], 'fest-X': [0], 'fest-Y': [1], 'fest-Z': [2] };
      job = {
        netz: { h, bbox: bb, bereich, beibehalten: s.beibehalten.map(koerperTris), hindernis: s.hindernis.map(koerperTris) },
        lager: s.abhaengigkeiten.map(a => ({ tris: flaechenTris(a), dofs: DOF[a.art] || DOF.fest })),
        lastfaelle: s.lastfaelle.filter(f => f.lasten.length).map(f => f.lasten.map(l => ({ tris: flaechenTris(l), F: [l.fx, l.fy, l.fz] })))
      };
    } catch (err) { st.meldung = err.message; render(); return; }
    const mats = s.materialien.map(k => ({ key: k, name: matName(k), ...ELASTIC[k], rho: MATERIALS[k].rho || 7.85 }));
    const auftrag = uid();
    st.laeuft = { id: auftrag, mats: mats.length, fertig: 0, text: 'startet …', raum: true, studie: JSON.parse(JSON.stringify(s)) };
    st.live = null;
    render();
    if (worker) worker.terminate();
    worker = new Worker(new URL('./sim/gd3d-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ev => antwort3d(ev.data);
    worker.onerror = ev => { st.meldung = 'Rechner: ' + (ev.message || 'Fehler'); st.laeuft = null; render(); };
    const dr = druckOf(s);
    const lauf = (k, art, winkel) => { const dv = DIR3[k], dax = dv.findIndex(v => v !== 0); return { achse: dax, vz: dv[dax], winkel, art, name: DIR3_LABEL[k] }; };
    const druecke = s.fertigung === 'additiv' ? dr.richtungen.map(k => lauf(k, 'additiv', dr.winkel))
      : s.fertigung === 'fraesen' ? fraesOf(s).richtungen.map(k => lauf(k, 'fraesen', 90))
      : s.fertigung === 'giessen' ? gussOf(s).achsen.map(a => ({ achse: 'XYZ'.indexOf(a), vz: 1, winkel: 90, art: 'giessen', name: a })) : [];
    st.laeuft.mats = mats.length * Math.max(1, druecke.length);
    worker.postMessage({ id: auftrag, ...job, materialien: mats, ziel: s.ziel, schritte: Math.min(s.wiederholungen, 40), druecke });
  }
  function antwort3d(m) {
    const l = st.laeuft;
    if (!l || m.id !== l.id) return;
    if (m.art === 'fortschritt') { l.text = `${m.text} – ${Math.round(m.anteil * 100)} %`; const t = $('#dialog .gdlauf .txt'); if (t) t.textContent = l.text; return; }
    if (m.art === 'fehler') { st.meldung = m.text; render(); return; }
    if (m.art === 'ergebnis') {
      const r = m.ergebnis, F = r.feld;
      const e = {
        id: uid(), zeit: Date.now(), studie: l.studie.name, ziel: l.studie.ziel.art, material: r.material, anteil: r.anteil, masse: r.masse,
        sicherheit: Number.isFinite(r.sicherheit) ? r.sicherheit : null, spannung: r.spannung, weg: r.weg, flaechen: [], raum: true,
        feld: { o: F.o, h: F.h, nx: F.nx, ny: F.ny, nz: F.nz, iso: F.iso, d: b64(F.d) }, beibehalten: l.studie.beibehalten.slice(), hindernis: l.studie.hindernis.slice(), exakt: true,
        fertigung: r.druck ? laufText(r.druck) : fertText(l.studie), ungestuetzt: r.ungestuetzt, additiv: !!r.druck, pruefArt: r.druck ? r.druck.art || 'additiv' : null, stuecke: r.stuecke
      };
      oberflaechen.set(e.id, { pos: r.pos, tri: r.tri });
      ctx.doc.gd.ergebnisse.push(e);
      l.fertig++;
      speichern();
      return;
    }
    if (m.art === 'fertig') antwort(m);
  }
  /* Oberfläche eines räumlichen Ergebnisses (aus dem gespeicherten Feld, zwischengespeichert) */
  const oberflaechen = new Map();
  function flaeche3d(r) {
    let s = oberflaechen.get(r.id);
    if (!s) {
      const F = r.feld, q = unb64(F.d), v = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) v[i] = q[i] / 255;
      s = oberflaeche(v, { o: F.o, nx: F.nx, ny: F.ny, nz: F.nz }, F.h, F.iso);
      oberflaechen.set(r.id, s);
    }
    return s;
  }
  /* Vorschaubild: Ansicht schräg von vorn oben, Dreiecke von hinten nach vorn mit einfacher Schattierung */
  function raumBild(c, r) {
    const s = flaeche3d(r), P = s.pos, T = s.tri, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const az = -Math.PI / 4, el = Math.PI / 6, ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const n = P.length / 3, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], u = ca * x - sa * y, w = sa * x + ca * y;
      X[i] = u; Y[i] = ce * z - se * w; Z[i] = se * z + ce * w;
      x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]);
    }
    if (!n) return;
    const sc = Math.min((c.width - 8) / Math.max(1e-9, x1 - x0), (c.height - 8) / Math.max(1e-9, y1 - y0)), ox = (c.width - (x1 - x0) * sc) / 2, oy = (c.height - (y1 - y0) * sc) / 2;
    const nt = T.length / 3, ord = new Uint32Array(nt), tief = new Float32Array(nt);
    for (let t = 0; t < nt; t++) { ord[t] = t; tief[t] = Z[T[3 * t]] + Z[T[3 * t + 1]] + Z[T[3 * t + 2]]; }
    ord.sort((a, b) => tief[a] - tief[b]);
    for (const t of ord) {
      const a = T[3 * t], b = T[3 * t + 1], d = T[3 * t + 2];
      const ux = X[b] - X[a], uy = Y[b] - Y[a], uz = Z[b] - Z[a], vx = X[d] - X[a], vy = Y[d] - Y[a], vz = Z[d] - Z[a];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
      if (nz / nl < 0) continue; // Rückseite
      const hell = 0.35 + 0.65 * Math.max(0, (0.3 * nx + 0.5 * ny + 0.81 * nz) / nl), k = Math.round(90 + 140 * hell);
      g.fillStyle = g.strokeStyle = `rgb(${k - 20},${k - 8},${k})`;
      g.beginPath(); g.moveTo(ox + (X[a] - x0) * sc, c.height - oy - (Y[a] - y0) * sc); g.lineTo(ox + (X[b] - x0) * sc, c.height - oy - (Y[b] - y0) * sc); g.lineTo(ox + (X[d] - x0) * sc, c.height - oy - (Y[d] - y0) * sc); g.closePath(); g.fill(); g.stroke();
    }
  }
  /* Ausgewähltes räumliches Ergebnis im Modell zeigen */
  let vorschauId = null;
  function vorschau3d(r) {
    if (!r) { if (vorschauId) { ctx.vp.setResultMesh(null); vorschauId = null; } return; }
    if (vorschauId === r.id) return;
    const s = flaeche3d(r), P = s.pos, T = s.tri, pos = new Float32Array(T.length * 3), col = new Float32Array(T.length * 3);
    for (let i = 0; i < T.length; i++) { const v = T[i]; pos[3 * i] = P[3 * v]; pos[3 * i + 1] = P[3 * v + 1]; pos[3 * i + 2] = P[3 * v + 2]; col[3 * i] = 0.62; col[3 * i + 1] = 0.68; col[3 * i + 2] = 0.76; }
    ctx.vp.setResultMesh({ positions: pos, colors: col });
    vorschauId = r.id;
  }
  function antwort(m) {
    const l = st.laeuft;
    if (!l || m.id !== l.id) return;
    if (m.art === 'fortschritt') { st.live = m; l.text = `${m.schritt}: Schritt ${m.it} von höchstens ${m.n}`; zeichneLive(); const t = $('#dialog .gdlauf .txt'); if (t) t.textContent = l.text; return; }
    if (m.art === 'fehler') { st.meldung = `${m.material ? matName(m.material) + ': ' : ''}${m.text}`; l.fertig++; render(); return; }
    if (m.art === 'ergebnis') {
      const r = m.ergebnis, t = l.modell.topo;
      ctx.doc.gd.ergebnisse.push({
        id: uid(), zeit: Date.now(), studie: l.studie.name, ziel: l.studie.ziel.art, material: r.material, anteil: r.anteil, masse: r.masse,
        sicherheit: Number.isFinite(r.sicherheit) ? r.sicherheit : null, spannung: r.spannung,
        sfSpannung: Number.isFinite(r.sfSpannung) ? r.sfSpannung : null, knick: r.knick, knickArt: r.knickArt, weg: r.weg, teile: r.teile, hinweis: r.hinweis,
        flaechen: r.flaechen, glatt: !!r.glatt, ebene: l.g.ebene, z0: l.g.z0, z1: l.g.z1, beibehalten: l.studie.beibehalten.slice(), hindernis: l.studie.hindernis.slice(),
        raster: { nelx: t.nelx, nely: t.nely, ox: t.ox, oy: t.oy, hx: t.hx, hy: t.hy }, bild: b64(r.bild)
      });
      l.fertig++;
      speichern();
      return;
    }
    if (m.art === 'fertig') {
      if (worker) { worker.terminate(); worker = null; }
      st.laeuft = null; st.live = null;
      if (ergebnisse().length) { st.ansicht = 'durchsuchen'; st.auswahl = ergebnisse()[ergebnisse().length - 1].id; }
      render();
    }
  }
  function laufBox() {
    const l = st.laeuft;
    return `<div class="gdlauf"><b>Erzeugen läuft</b> <span class="txt">${esc(l.text)}</span>${l.raum ? '' : '<canvas class="gdlive" width="280" height="160"></canvas>'}<span class="small">${l.raum ? `${l.fertig} von ${l.mats} Ergebnis${l.mats > 1 ? 'sen' : ''} fertig` : `${l.fertig} von ${l.mats} Material${l.mats > 1 ? 'ien' : ''} fertig`}</span><button type="button" class="btn small" data-cmd="gd-stopp">Abbrechen</button></div>`;
  }
  function zeichneLive() {
    const c = $('#dialog canvas.gdlive'), l = st.laeuft;
    if (!c || !st.live || !l || l.raum) return;
    const t = l.modell.topo;
    dichteBild(c, st.live.bild, t.nelx, t.nely, t.mask);
  }

  /* ---------- Bilder ---------- */
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function dichteBild(c, dichte, nelx, nely, mask) {
    const g = c.getContext('2d'), sc = Math.min(c.width / nelx, c.height / nely), ox = (c.width - nelx * sc) / 2, oy = (c.height - nely * sc) / 2;
    g.clearRect(0, 0, c.width, c.height);
    for (let j = 0; j < nely; j++) for (let i = 0; i < nelx; i++) {
      const e = j * nelx + i;
      if (mask && !mask[e]) continue;
      const v = dichte[e] / 255, k = Math.round(235 - 200 * v);
      g.fillStyle = `rgb(${k},${k + 6},${k + 14})`;
      g.fillRect(ox + i * sc, oy + (nely - 1 - j) * sc, Math.ceil(sc), Math.ceil(sc));
    }
  }
  /* Umriss des Ergebnisses (gefüllt, Löcher frei) Vorschaubild */
  function umrissBild(c, r) {
    const g = c.getContext('2d'), R = r.raster, w = R.nelx * R.hx, h = R.nely * R.hy, sc = Math.min((c.width - 8) / w, (c.height - 8) / h);
    const X = x => (c.width - w * sc) / 2 + (x - R.ox) * sc, Y = y => c.height - ((c.height - h * sc) / 2 + (y - R.oy) * sc);
    g.clearRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(120,130,140,.5)'; g.setLineDash([4, 3]); g.strokeRect(X(R.ox), Y(R.oy + h), w * sc, h * sc); g.setLineDash([]);
    g.beginPath();
    const zug = pts => pts.forEach((q, i) => (i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))));
    r.flaechen.forEach(f => { zug(f.punkte); g.closePath(); f.loecher.forEach(l => { zug(l.punkte); g.closePath(); }); });
    g.fillStyle = '#7f8b98'; g.fill('evenodd');
    g.strokeStyle = '#3d4650'; g.lineWidth = 1; g.stroke();
  }

  /* ---------- Durchsuchen (Miniaturansicht mit Eigenschaften, Sortieren, Konstruktion erstellen) ---------- */
  function sortiert() {
    const k = st.sort, val = r => (k === 'sicherheit' ? -(r.sicherheit || 0) : k === 'weg' ? r.weg : k === 'material' ? matName(r.material) : r.masse);
    return ergebnisse().slice().sort((a, b) => { const x = val(a), y = val(b); return typeof x === 'string' ? x.localeCompare(y) : x - y; });
  }
  function renderExplore() {
    ctx.closeDialog();
    let el = $('#gdexplore');
    if (!el) { el = document.createElement('div'); el.id = 'gdexplore'; el.className = 'gdexplore'; $('#viewport').appendChild(el); }
    const rs = sortiert(), sel = rs.find(r => r.id === st.auswahl);
    const eig = r => `<dl class="gdeig"><dt>Material</dt><dd>${esc(matName(r.material))}</dd><dt>Masse</dt><dd>${fmt(r.masse, 1)} g</dd><dt>Sicherheitsfaktor</dt><dd>${r.sicherheit == null ? '–' : fmt(r.sicherheit, 2)}</dd>${r.sfSpannung !== undefined ? `<dt>– Spannung</dt><dd>${r.sfSpannung == null ? '–' : fmt(r.sfSpannung, 2)}</dd><dt>– Knicken</dt><dd>${r.knick == null ? 'kein Druck' : `${fmt(r.knick, 2)} (${esc(r.knickArt || '')})`}</dd>` : ''}<dt>max. von Mises</dt><dd>${fmt(r.spannung, 1)} MPa</dd><dt>max. Verschiebung</dt><dd>${fmt(r.weg, 4)} mm</dd><dt>Werkstoffanteil</dt><dd>${fmt(r.anteil * 100, 0)} %</dd><dt>Ziel</dt><dd>${r.ziel === 'masse' ? 'Masse minimieren' : 'Steifigkeit maximieren'}</dd>${r.fertigung ? `<dt>Fertigung</dt><dd>${esc(r.fertigung)}</dd>` : ''}${r.additiv ? `<dt>${PRUEF[r.pruefArt || 'additiv']}</dt><dd>${r.ungestuetzt || 0}</dd>` : ''}${r.stuecke > 1 ? `<dt>Achtung</dt><dd>Teil zerfällt in ${r.stuecke} Stücke – die Last erreicht die Halterung nicht. Andere Richtung, mehr Masse oder Startform wählen.</dd>` : ''}${r.teile > 1 ? `<dt>Achtung</dt><dd>${r.teile} getrennte Teile</dd>` : ''}${r.hinweis ? `<dt>Hinweis</dt><dd>${esc(r.hinweis)}</dd>` : ''}</dl>`;
    el.innerHTML = `<div class="gdxhead"><b>Ergebnisse</b> <span>${rs.length}</span>
        <label>Sortieren nach <select data-gd="sort">${[['masse', 'Masse'], ['sicherheit', 'Sicherheitsfaktor'], ['weg', 'Verschiebung'], ['material', 'Material']].map(([k, l]) => `<option value="${k}"${st.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <button type="button" class="btn" data-cmd="gd-einrichten">Zur Einrichtung</button></div>
      <div class="gdxbody">
        <div class="gdgrid">${rs.map(r => `<button type="button" class="gdcard${r.id === st.auswahl ? ' on' : ''}" data-cmd="gd-auswahl" data-id="${r.id}"><canvas width="220" height="130" data-bild="${r.id}"></canvas><span class="t">${esc(matName(r.material))}</span><span class="k">${fmt(r.masse, 1)} g · SF ${r.sicherheit == null ? '–' : fmt(r.sicherheit, 2)} · ${fmt(r.weg, 3)} mm</span>${r.hinweis ? `<span class="w" title="${esc(r.hinweis)}">⚠ ${esc(r.hinweis.split(' – ')[0])}</span>` : ''}</button>`).join('') || '<p class="info">Noch keine Ergebnisse – in der Einrichtung „Erzeugen“.</p>'}</div>
        ${sel ? `<aside class="gdxdetail"><canvas width="420" height="260" data-gross="${sel.id}"></canvas>${sel.raum ? '' : `<div class="btns"><button type="button" class="chip" data-cmd="gd-dichte" aria-pressed="${!!st.dichte}">Dichtefeld</button></div>`}${eig(sel)}
          <div class="btns"><button type="button" class="btn primary" data-cmd="gd-erstellen" data-id="${sel.id}">Konstruktion erstellen</button><button type="button" class="btn" data-cmd="gd-loeschen" data-id="${sel.id}">Löschen</button></div>
          <p class="info small">${sel.raum ? '„Konstruktion erstellen“ legt die Freiform als Netzkörper in die Zeitleiste, vereinigt mit den exakten Beibehalten-Körpern (Hindernisse abgezogen), und blendet Startform und Beibehalten-Körper aus. Das Ergebnis ist auch im Modell zu sehen.' : '„Konstruktion erstellen“ legt das Ergebnis als Körper in die Zeitleiste (Umriss über die Dicke extrudiert, Beibehalten-Körper dazu, Hindernisse abgezogen) und blendet Startform und Beibehalten-Körper aus.'}</p></aside>` : ''}
      </div>`;
    el.querySelectorAll('canvas[data-bild]').forEach(c => { const r = rs.find(x => x.id === c.dataset.bild); if (r) (r.raum ? raumBild : umrissBild)(c, r); });
    const gc = el.querySelector('canvas[data-gross]');
    vorschau3d(sel && sel.raum ? sel : null);
    if (gc && sel && sel.raum) raumBild(gc, sel);
    else if (gc && sel) { if (st.dichte) dichteBild(gc, unb64(sel.bild), sel.raster.nelx, sel.raster.nely, null); else umrissBild(gc, sel); }
  }
  function erstellen(id) {
    const r = ergebnisse().find(x => x.id === id);
    if (!r) return;
    ctx.pushHistory();
    if (r.raum) {
      ctx.doc.features.push({
        id: uid(), type: 'gdform3', name: `Generatives Design ${matName(r.material)} ${fmt(r.masse, 0)} g`, feld: r.feld, hindernis: r.hindernis,
        ...(r.exakt ? { beibehalten: r.beibehalten } : {}),
        info: `${matName(r.material)} · ${fmt(r.masse, 1)} g · Sicherheitsfaktor ${r.sicherheit == null ? '–' : fmt(r.sicherheit, 2)} · max. Verschiebung ${fmt(r.weg, 4)} mm`
      });
      const s = studie();
      // neue Ergebnisse (exakt): Beibehalten-Körper stecken im Ergebnis und werden wie bei 2D ausgeblendet
      [...(r.exakt ? r.beibehalten : []), ...(s.startform ? [s.startform] : [])].forEach(b => { if (ctx.doc.bodies[b]) ctx.doc.bodies[b].hidden = true; });
      speichern(); close(); ctx.renderAll(); ctx.scheduleBuild(0);
      ctx.toast(r.exakt ? 'Ergebnis als Konstruktion angelegt: Freiform mit den exakten Beibehalten-Körpern vereinigt, Hindernisse abgezogen.' : 'Ergebnis als Konstruktion angelegt (Netzkörper). Die Beibehalten-Körper bleiben eigene Körper – zum Verbinden „Kombinieren“.');
      return;
    }
    const f = {
      id: uid(), type: 'gdform', name: `Generatives Design ${matName(r.material)} ${fmt(r.masse, 0)} g`,
      ebene: r.ebene, z0: r.z0, z1: r.z1, flaechen: r.flaechen, glatt: !!r.glatt, beibehalten: r.beibehalten, hindernis: r.hindernis,
      info: `${matName(r.material)} · ${fmt(r.masse, 1)} g · Sicherheitsfaktor ${r.sicherheit == null ? '–' : fmt(r.sicherheit, 2)} · max. Verschiebung ${fmt(r.weg, 4)} mm`
    };
    ctx.doc.features.push(f);
    const s = studie();
    [...r.beibehalten, ...(s.startform ? [s.startform] : [])].forEach(b => { if (ctx.doc.bodies[b]) ctx.doc.bodies[b].hidden = true; });
    speichern();
    close();
    ctx.renderAll();
    ctx.scheduleBuild(0);
    ctx.toast('Ergebnis als Konstruktion angelegt – Startform und Beibehalten-Körper sind ausgeblendet (im Browser wieder einblenden).');
  }

  /* ---------- Befehle ---------- */
  function cmd(c, el) {
    const s = studie();
    if (c === 'gd-open') return open();
    if (c === 'gd-close') return close();
    if (c.startsWith('gd-w-')) {
      const w = c.slice(5);
      if (w === 'aus') st.werkzeug = null;
      else {
        st.werkzeug = st.werkzeug === w ? null : w; st.entwurf = w === 'last' ? { betrag: 100, winkel: 270, dir3: 'z-' } : w === 'abh' ? { art: 'fest' } : null; st.aktiv = null;
        /* Gibt es im Lastfall schon Lasten, bearbeitet das Werkzeug gleich die letzte davon – sonst änderten Betrag und
           Richtung nur den Entwurf einer neuen Last und die vorhandene Kraft bliebe stehen */
        const fall = s.lastfaelle[s.fall] || s.lastfaelle[0], l = st.werkzeug === 'last' && fall.lasten[fall.lasten.length - 1];
        if (l) { st.aktiv = l.id; st.entwurf = entwurfAus(l); }
      }
      st.ansicht = 'einrichten';
      return render();
    }
    if (c === 'gd-weg') {
      const { rolle, id } = el.dataset;
      return aendern(x => {
        if (rolle === 'beibehalten' || rolle === 'hindernis') x[rolle] = x[rolle].filter(v => v !== id);
        else if (rolle === 'startform') x.startform = null;
        else if (rolle === 'abh') x.abhaengigkeiten = x.abhaengigkeiten.filter(a => a.id !== id);
        else x.lastfaelle.forEach(f => { f.lasten = f.lasten.filter(l => l.id !== id); });
      });
    }
    if (c === 'gd-fert') return aendern(x => { x.fertigung = el.dataset.v; });
    if (c === 'gd-fraesrichtung') return aendern(x => { const d = fraesOf(x), k = el.dataset.v, rs = d.richtungen.includes(k) ? d.richtungen.filter(v => v !== k) : [...d.richtungen, k]; x.fraesen = { richtungen: rs.length ? rs : d.richtungen }; });
    if (c === 'gd-gussachse') return aendern(x => { const d = gussOf(x), k = el.dataset.v, rs = d.achsen.includes(k) ? d.achsen.filter(v => v !== k) : [...d.achsen, k]; x.guss = { achsen: rs.length ? rs : d.achsen }; });
    if (c === 'gd-druckrichtung') return aendern(x => {
      // mehrere Richtungen wählbar (je Richtung ein Ergebnis), mindestens eine bleibt
      const d = druckOf(x), k = el.dataset.v, rs = d.richtungen.includes(k) ? d.richtungen.filter(v => v !== k) : [...d.richtungen, k];
      x.druck = { richtungen: rs.length ? rs : d.richtungen, winkel: d.winkel };
    });
    if (c === 'gd-richtung3') { st.entwurf = { ...(st.entwurf || { betrag: 100 }), dir3: el.dataset.v }; lastSetzen(); return render(); }
    if (c === 'gd-richtung') { st.entwurf = { ...(st.entwurf || { betrag: 100 }), winkel: Number(el.dataset.v) }; lastSetzen(); return render(); }
    if (c === 'gd-last-wahl') {
      const l = s.lastfaelle.flatMap(f => f.lasten).find(x => x.id === el.dataset.id);
      if (!l) return;
      st.werkzeug = 'last'; st.aktiv = l.id; st.ansicht = 'einrichten';
      st.entwurf = entwurfAus(l);
      return render();
    }
    if (c === 'gd-fall') return aendern(x => { x.fall = Number(el.dataset.i) || 0; });
    if (c === 'gd-fall-neu') return aendern(x => { x.lastfaelle.push({ id: uid(), name: `Lastfall ${x.lastfaelle.length + 1}`, lasten: [] }); x.fall = x.lastfaelle.length - 1; });
    if (c === 'gd-ziel') return aendern(x => { x.ziel.art = el.dataset.v; });
    if (c === 'gd-achse') return aendern(x => { x.achse = el.dataset.v; });
    if (c === 'gd-neu') { aendern(x => { Object.assign(x, neueStudie(), { name: `Studie ${(ergebnisse().length ? 2 : 1)}` }); }); return; }
    if (c === 'gd-pruefen') { const p = pruefen(); st.meldung = ''; st.ansicht = 'einrichten'; render(); ctx.toast(p.length ? `Vorprüfung: ${p.length} offene Punkte (siehe rechts).` : 'Vorprüfung bestanden – bereit zum Erzeugen.'); return; }
    if (c === 'gd-erzeugen') { st.ansicht = 'einrichten'; st.werkzeug = null; return erzeugen(); }
    if (c === 'gd-stopp') { if (worker) { worker.terminate(); worker = null; } st.laeuft = null; st.live = null; return render(); }
    if (c === 'gd-durchsuchen') { st.ansicht = 'durchsuchen'; st.werkzeug = null; if (!st.auswahl && ergebnisse().length) st.auswahl = sortiert()[0].id; return render(); }
    if (c === 'gd-einrichten') { st.ansicht = 'einrichten'; return render(); }
    if (c === 'gd-auswahl') { st.auswahl = el.dataset.id; return render(); }
    if (c === 'gd-dichte') { st.dichte = !st.dichte; return render(); }
    if (c === 'gd-erstellen') return erstellen(el.dataset.id);
    if (c === 'gd-loeschen') { ctx.pushHistory(); ctx.doc.gd.ergebnisse = ergebnisse().filter(r => r.id !== el.dataset.id); st.auswahl = null; speichern(); return render(); }
  }
  /* Eingaben in den Befehlsdialogen */
  function eingabe(t) {
    if (ctx.mode !== 'gd') return false;
    const s = studie(), k = t.dataset.gd;
    if (t.dataset.gdmat) { aendern(x => { x.materialien = t.checked ? [...new Set([...x.materialien, t.dataset.gdmat])] : x.materialien.filter(m => m !== t.dataset.gdmat); }); return true; }
    if (!k) return false;
    if (k === 'sort') { st.sort = t.value; render(); return true; }
    if (k === 'abhArt') { st.entwurf = { art: t.value }; return true; }
    const v = Number(String(t.value).replace(',', '.'));
    if (k === 'betrag' || k === 'winkel') {
      if (!Number.isFinite(v) || (k === 'betrag' && v < 0)) return true;
      st.entwurf = { ...(st.entwurf || { betrag: 100, winkel: 270, dir3: 'z-' }), [k]: v };
      lastSetzen();
      return true;
    }
    if (!Number.isFinite(v)) return true;
    if (k === 'masse' && v > 0) { s.ziel.masse = v; speichern(); }
    if (k === 'sicherheit' && v >= 1) { s.ziel.sicherheit = v; speichern(); }
    if (k === 'raster' && v >= 0) { s.raster = v; speichern(); }
    if (k === 'wiederholungen' && v >= 10) { s.wiederholungen = Math.min(300, Math.round(v)); speichern(); }
    if (k === 'ueberhang' && v >= 10 && v <= 80) { s.druck = { richtungen: druckOf(s).richtungen, winkel: v }; speichern(); }
    return true;
  }
  return { gdOpen: open, gdClose: close, gdCmd: cmd, gdPick: pick, gdEingabe: eingabe, gdFarben: farbenMap, gdRender: render };
}
