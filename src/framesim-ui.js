// cantcodecad – Festigkeit von Rahmen (Extras → Stahlbau), angelehnt an die übliche Simulation „Statische Spannung“, aber als
// Stabwerk: Lager und Lasten an die Rahmenstäbe klicken, gerechnet wird sofort (src/sim/frame.js). Stäbe nach dem
// Sicherheitsfaktor gefärbt, Biegelinie überhöht, Tabelle je Stab. Die Einrichtung steht im Dokument (doc.frameStudy).
import { icon } from './icons.js';
import { solveFrame, frameModes, FRAME_MATERIALS } from './sim/frame.js';
import { fmtLen, fmtLenU, UNIT } from './units.js';
import { DEC } from './i18n.js';

const DIRS = { 'z-': [0, 0, -1], 'z+': [0, 0, 1], 'x-': [-1, 0, 0], 'x+': [1, 0, 0], 'y-': [0, -1, 0], 'y+': [0, 1, 0] };
const DIR_LABELS = { 'z-': '−Z', 'z+': '+Z', 'x-': '−X', 'x+': '+X', 'y-': '−Y', 'y+': '+Y' };
/* Farbe nach Sicherheitsfaktor: rot < 1 (versagt), orange < 1,5, gelb < 2, grün ≥ 2 */
export const sfColor = sf => (sf < 1 ? '#dc2626' : sf < 1.5 ? '#f97316' : sf < 2 ? '#eab308' : '#16a34a');

export function setupFrameSim(ctx) {
  const $ = s => document.querySelector(s);
  const esc = (...a) => ctx.esc(...a);
  const st = { tool: 'fixed', F: 1000, dir: 'z-', q: 1, res: null, err: null, modes: null, form: 0, umh: false };
  // Studie: „Statische Spannung“ oder „Modalfrequenzen“ (Eigenfrequenzen und Eigenformen)
  const modal = () => study().art === 'modal';
  const num = (v, d = 1) => (v == null || !isFinite(v) ? '–' : String(Math.round(v * 10 ** d) / 10 ** d).replace('.', DEC));
  /* Lastfälle: s.faelle = [{ name, loads, selfWeight }], s.fall = aktiver; s.loads und s.selfWeight sind die
     Werte des aktiven Lastfalls (so bleiben Picks, Liste und ältere Dateien unverändert) und werden hier in den Fall
     zurückgeschrieben – nach Rückgängig oder Laden zeigen beide wieder auf dasselbe */
  const study = () => {
    const d = ctx.doc;
    if (!d.frameStudy) d.frameStudy = { mat: 's235', selfWeight: true, supports: [], loads: [] };
    const s = d.frameStudy;
    if (!Array.isArray(s.faelle) || !s.faelle.length) { s.faelle = [{ name: 'Lastfall 1', loads: s.loads, selfWeight: s.selfWeight !== false }]; s.fall = 0; }
    if (!(s.fall >= 0 && s.fall < s.faelle.length)) s.fall = 0;
    s.faelle[s.fall].loads = s.loads; s.faelle[s.fall].selfWeight = s.selfWeight;
    return s;
  };
  const fallWahl = (s, j) => { s.fall = j; s.loads = s.faelle[j].loads; s.selfWeight = s.faelle[j].selfWeight; };
  const members = () => {
    const b = ctx.lastBuild, vis = new Set((b && b.bodies) || []);
    return ((b && b.frames) || []).filter(m => m.A && m.B && m.prof && vis.has(m.id) && !ctx.isHidden(m.id));
  };
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-3;

  function open() {
    if (!members().length) { ctx.toast('Es gibt keine Rahmenstäbe. Erst mit „Rahmen“ Stäbe aus einer Skizze erzeugen.'); return; }
    ctx.closeDialog();
    ctx.setMode('framesim');
    ctx.vp.setPickMode('face');
    render();
  }
  function close() {
    ctx.vp.setAnalysisOverlay(null);
    ctx.vp.setBodyColors({});
    ctx.vp.setFaded([]);
    ctx.vp.setPickMode('none');
    ctx.closeDialog();
    ctx.setMode('model');
  }
  function compute() {
    const s = study(), ms = members();
    st.res = null; st.err = null; st.modes = null;
    if (!s.supports.length) { st.err = 'Mindestens ein Lager an einen Stab klicken.'; return; }
    if (modal()) {
      try { st.modes = frameModes(ms, s.supports, { mat: s.mat }).modes; } catch (e) { st.err = e.message; }
      if (st.modes && !st.modes.length) st.err = 'Keine Eigenform gefunden.';
      if (st.modes) st.form = Math.min(st.form, Math.max(0, st.modes.length - 1));
      return;
    }
    const rechne = f => solveFrame(ms, s.supports, f.loads.filter(l => l.kind === 'node' || ms.some(m => m.id === l.id)), { mat: s.mat, selfWeight: f.selfWeight });
    if (st.umh && s.faelle.length > 1) {
      /* Umhüllende: jeden Lastfall rechnen, je Stab der kleinste Sicherheitsfaktor mit seinem Lastfall (maßgebend);
         Biegelinie und größte Verschiebung aus dem Lastfall mit der größten Verschiebung */
      try {
        const alle = s.faelle.map(f => ({ name: f.name, r: rechne(f) }));
        const by = new Map();
        alle.forEach(({ name, r }) => r.members.forEach(x => {
          const y = by.get(x.id);
          if (!y || x.sf < y.sf) by.set(x.id, { ...x, fall: name, smax: Math.max(x.smax, y ? y.smax : 0), sfBuck: Math.min(x.sfBuck, y ? y.sfBuck : Infinity) });
          else { y.smax = Math.max(y.smax, x.smax); y.sfBuck = Math.min(y.sfBuck, x.sfBuck); }
        }));
        const grob = alle.reduce((a, b) => (b.r.dmax > a.r.dmax ? b : a));
        st.res = { ...grob.r, members: [...by.values()].map(x => ({ ...x, curves: (grob.r.members.find(y => y.id === x.id) || { curves: [] }).curves })), umh: true, fallD: grob.name, faelle: alle.map(a => ({ name: a.name, dmax: a.r.dmax, sf: Math.min(...a.r.members.map(x => x.sf)) })) };
      } catch (e) { st.err = e.message; }
      return;
    }
    try { st.res = rechne(s.faelle[s.fall]); } catch (e) { st.err = e.message; }
  }
  /* Punkt auf der Systemlinie eines Stabs: Enden fangen (innerhalb 10 % der Länge), sonst die Projektion auf 1 mm */
  function pointOn(m, q) {
    const u = m.B.map((v, k) => v - m.A[k]), L = Math.hypot(...u), e = u.map(v => v / L);
    let s = e.reduce((a, v, k) => a + v * (q[k] - m.A[k]), 0);
    s = s < 0.1 * L ? 0 : s > 0.9 * L ? L : Math.round(s);
    return m.A.map((v, k) => Math.round((v + e[k] * s) * 1e6) / 1e6);
  }
  function pick(h) {
    if (!h || h.kind !== 'face' || !h.point) return;
    const id = ctx.bodyIdAtFace(h.info), m = members().find(x => x.id === id);
    if (!m) { ctx.toast('Bitte einen Rahmenstab anklicken.'); return; }
    const s = study();
    ctx.pushHistory();
    if (st.tool === 'fixed' || st.tool === 'pinned') {
      const p = pointOn(m, h.point), i = s.supports.findIndex(x => same(x.p, p));
      if (i >= 0 && s.supports[i].kind === st.tool) s.supports.splice(i, 1);
      else if (i >= 0) s.supports[i].kind = st.tool;
      else s.supports.push({ p, kind: st.tool });
    } else if (st.tool === 'force') {
      const p = pointOn(m, h.point), i = s.loads.findIndex(x => x.kind === 'node' && same(x.p, p));
      if (i >= 0) s.loads.splice(i, 1); else s.loads.push({ kind: 'node', p, F: DIRS[st.dir].map(v => v * st.F) });
    } else {
      const i = s.loads.findIndex(x => x.kind === 'member' && x.id === m.id);
      if (i >= 0) s.loads.splice(i, 1); else s.loads.push({ kind: 'member', id: m.id, q: DIRS[st.dir].map(v => v * st.q) });
    }
    ctx.store();
    render();
  }
  function overlay() {
    const s = study(), ms = members();
    const box = ms.flatMap(m => [m.A, m.B]);
    const size = Math.max(1, ...[0, 1, 2].map(k => Math.max(...box.map(p => p[k])) - Math.min(...box.map(p => p[k]))));
    const arrows = [], arrow = (p, d, L) => {
      const t = p.map((v, k) => v - d[k] * L);
      arrows.push(...t, ...p);
      // Spitze: zwei kurze Striche quer zur Richtung
      const q = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], w = [d[1] * q[2] - d[2] * q[1], d[2] * q[0] - d[0] * q[2], d[0] * q[1] - d[1] * q[0]];
      [1, -1].forEach(sg => arrows.push(...p, ...p.map((v, k) => v - d[k] * L * 0.25 + w[k] * L * 0.12 * sg)));
    };
    const La = size * 0.12;
    s.loads.forEach(l => {
      if (l.kind === 'node') { const n = Math.hypot(...l.F) || 1; arrow(l.p, l.F.map(v => v / n), La); return; }
      const m = ms.find(x => x.id === l.id), n = Math.hypot(...l.q) || 1;
      if (m) for (let i = 0; i <= 4; i++) arrow(m.A.map((v, k) => v + (m.B[k] - v) * i / 4), l.q.map(v => v / n), La * 0.6);
    });
    const lines = modal() ? [] : [{ positions: arrows, color: 0xdc2626 }];
    const fm = st.modes && st.modes[st.form];
    if (fm) {
      // Eigenform auf größte Verschiebung 1 normiert, mit 8 % der Rahmengröße gezeichnet
      const sc = size * 0.08, def = [];
      st.scale = sc;
      fm.curves.forEach(c => { for (let i = 1; i < c.length; i++) def.push(...c[i - 1].p.map((v, k) => v + c[i - 1].d[k] * sc), ...c[i].p.map((v, k) => v + c[i].d[k] * sc)); });
      lines.push({ positions: def, color: 0x1d4ed8 });
    }
    if (st.res) {
      const sc = st.res.dmax > 1e-9 ? size * 0.06 / st.res.dmax : 0;
      st.scale = sc;
      const def = [];
      st.res.members.forEach(r => r.curves.forEach(c => { for (let i = 1; i < c.length; i++) def.push(...c[i - 1].p.map((v, k) => v + c[i - 1].d[k] * sc), ...c[i].p.map((v, k) => v + c[i].d[k] * sc)); }));
      lines.push({ positions: def, color: 0x1d4ed8 });
    }
    ctx.vp.setAnalysisOverlay({
      lines,
      points: [{ positions: s.supports.filter(x => x.kind === 'fixed').flatMap(x => x.p), color: 0x111827, size: 14 },
        { positions: s.supports.filter(x => x.kind === 'pinned').flatMap(x => x.p), color: 0x7c3aed, size: 14 }]
    });
    const colors = {};
    if (st.res) st.res.members.forEach(r => { colors[r.id] = sfColor(r.sf); });
    ctx.vp.setBodyColors(colors);
    const ids = new Set(ms.map(m => m.id));
    ctx.vp.setFaded(((ctx.lastBuild && ctx.lastBuild.bodies) || []).filter(id => !ids.has(id)));
  }
  function render() {
    if (ctx.mode !== 'framesim') return;
    compute();
    overlay();
    const s = study(), d = $('#dialog'), r = st.res;
    const art = modal() ? 'modal' : 'statisch';
    if (art === 'modal' && (st.tool === 'force' || st.tool === 'line')) st.tool = 'fixed';
    const chip = (t, l) => `<button type="button" class="chip" data-cmd="fs-tool" data-v="${t}" aria-pressed="${st.tool === t}">${esc(l)}</button>`;
    const hint = { fixed: 'Stab anklicken: Einspannung am nächsten Ende (in der Mitte: an der Stelle). Noch einmal = weg.', pinned: 'Stab anklicken: gelenkiges Lager (Verschiebungen gesperrt, Drehen frei) am nächsten Ende. Noch einmal = weg.', force: 'Stab anklicken: Einzelkraft am nächsten Ende oder an der Stelle. Noch einmal = weg.', line: 'Stab anklicken: Streckenlast über die ganze Länge. Noch einmal = weg.' }[st.tool];
    const worst = r && r.members.length ? r.members.reduce((a, b) => (b.sf < a.sf ? b : a)) : null;
    const rows = r ? r.members.slice().sort((a, b) => a.sf - b.sf).map(x => `<tr><td>${esc(ctx.bodyName(x.id))}</td><td>${num(x.smax, 1)}</td><td>${x.sfBuck < 1e6 ? num(x.sfBuck, 2) : '–'}</td><td><b style="color:${sfColor(x.sf)}">${x.sf < 1e6 ? num(x.sf, 2) : '∞'}</b></td>${r.umh ? `<td>${esc(x.fall)}</td>` : ''}</tr>`).join('') : '';
    const loadTxt = l => (l.kind === 'node' ? `Kraft ${num(Math.hypot(...l.F), 0)} N` : `Streckenlast ${num(Math.hypot(...l.q), 2)} N/mm · ${esc(ctx.bodyName(l.id))}`);
    d.className = 'dialog';
    const fRows = st.modes ? st.modes.map((m, i) => `<tr data-cmd="fs-form" data-i="${i}" class="${i === st.form ? 'sel' : ''}" style="cursor:pointer${i === st.form ? ';font-weight:600' : ''}"><td>${i + 1}</td><td>${num(m.f, 2)}</td><td>${num(m.omega, 1)}</td></tr>`).join('') : '';
    d.innerHTML = `<header>${icon('frame', 20)}<b class="dtitle">Festigkeit (Rahmen)</b></header><div class="dbody">
      <div class="row col"><span>Studie</span><div class="seg" role="radiogroup"><button type="button" role="radio" data-cmd="fs-art" data-v="statisch" aria-checked="${art === 'statisch'}">Statische Spannung</button><button type="button" role="radio" data-cmd="fs-art" data-v="modal" aria-checked="${art === 'modal'}">Modalfrequenzen</button></div></div>
      <label class="row"><span>Werkstoff</span><select data-fs="mat">${Object.entries(FRAME_MATERIALS).map(([k, m]) => `<option value="${k}"${k === s.mat ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
      ${art === 'modal' ? '' : `<div class="row col"><span>Lastfall</span><div class="btns">${s.faelle.map((f, i) => `<button type="button" class="chip" data-cmd="fs-fall" data-i="${i}" aria-pressed="${!st.umh && i === s.fall}" title="Lasten und Eigengewicht dieses Lastfalls bearbeiten">${esc(f.name)} (${f.loads.length})</button>`).join('')}<button type="button" class="chip" data-cmd="fs-fall-neu" title="Neuer Lastfall (gleiche Lager, eigene Lasten)">+</button>${s.faelle.length > 1 ? `<button type="button" class="chip" data-cmd="fs-umh" aria-pressed="${st.umh}" title="Alle Lastfälle: je Stab der kleinste Sicherheitsfaktor und sein Lastfall">Umhüllende</button><button type="button" class="iconbtn" data-cmd="fs-fall-weg" title="Aktiven Lastfall löschen">${icon('close', 12)}</button>` : ''}</div></div>`}
      ${art === 'modal' || st.umh ? '' : `<label class="row chk"><input type="checkbox" data-fs="self"${s.selfWeight ? ' checked' : ''}> Eigengewicht (in −Z)</label>`}
      <div class="row col"><span>Werkzeug</span><div class="btns">${chip('fixed', 'Einspannung')}${chip('pinned', 'Gelenklager')}${art === 'modal' ? '' : chip('force', 'Kraft') + chip('line', 'Streckenlast')}</div></div>
      ${st.tool === 'force' ? `<label class="row"><span>Kraft</span><span class="num"><input type="number" min="0" step="100" data-fs="F" value="${st.F}"><em>N</em></span></label>` : ''}
      ${st.tool === 'line' ? `<label class="row"><span>Streckenlast</span><span class="num"><input type="number" min="0" step="0.1" data-fs="q" value="${st.q}"><em>N/mm</em></span></label>` : ''}
      ${st.tool === 'force' || st.tool === 'line' ? `<div class="row col"><span>Richtung</span><div class="seg" role="radiogroup">${Object.keys(DIRS).map(k => `<button type="button" role="radio" data-cmd="fs-dir" data-v="${k}" aria-checked="${st.dir === k}">${DIR_LABELS[k]}</button>`).join('')}</div></div>` : ''}
      <p class="info small">${esc(hint)}</p>
      <div class="row col"><span>${art === 'modal' ? `Lager (${s.supports.length})` : `Lager (${s.supports.length}) · Lasten (${s.loads.length})`}</span><div class="flist2">${s.supports.map((x, i) => `<div class="frow"><span>${x.kind === 'pinned' ? 'Gelenklager' : 'Einspannung'} (${x.p.map(v => fmtLen(v, 0)).join(' | ')})</span><button type="button" class="iconbtn" data-cmd="fs-del" data-k="supports" data-i="${i}" title="Entfernen">${icon('close', 12)}</button></div>`).join('')}${(art === 'modal' ? [] : s.loads).map((l, i) => `<div class="frow"><span>${loadTxt(l)}</span><button type="button" class="iconbtn" data-cmd="fs-del" data-k="loads" data-i="${i}" title="Entfernen">${icon('close', 12)}</button></div>`).join('')}</div></div>
      ${st.err ? `<p class="info warn">${esc(st.err)}</p>` : ''}
      ${st.modes && st.modes.length ? `<table class="cuttab"><thead><tr><th>Eigenform</th><th>Frequenz Hz</th><th>ω 1/s</th></tr></thead><tbody>${fRows}</tbody></table>
        <p class="info small">Blau: Eigenform ${st.form + 1} (Zeile anklicken), größte Auslenkung auf ${num(st.scale || 0, 0)} mm gezeichnet – die Größe einer Eigenform ist beliebig, nur ihre Gestalt zählt. Gerechnet mit konsistenter Massenmatrix (Stabmasse aus Profil und Werkstoff), jeder Stab in mindestens 8 Abschnitten, Knoten biegesteif. Lasten zählen hier nicht; Zusatzmassen (Bleche, Anbauteile) fehlen – die echten Frequenzen liegen dann tiefer.</p>` : ''}
      ${r ? `<dl class="mres"><div><dt>Größte Verschiebung</dt><dd>${fmtLenU(r.dmax, 2)}</dd></div><div><dt>Kleinster Sicherheitsfaktor</dt><dd><b style="color:${worst ? sfColor(worst.sf) : ''}">${worst && worst.sf < 1e6 ? num(worst.sf, 2) : '∞'}</b>${worst && worst.sf < 1e6 ? ` · ${esc(ctx.bodyName(worst.id))} (${worst.sfBuck < worst.sfStress ? 'Knicken' : 'Spannung'})` : ''}</dd></div>
        ${r.umh ? `<div><dt>Lastfälle</dt><dd>${r.faelle.map(f => `${esc(f.name)}: SF ${f.sf < 1e6 ? num(f.sf, 2) : '∞'}`).join(' · ')}</dd></div>` : `<div><dt>Auflagerkräfte gesamt</dt><dd>${r.reactions.reduce((a, x) => a.map((v, k) => v + x.F[k]), [0, 0, 0]).map(v => num(v, 0)).join(' | ')} N</dd></div>`}</dl>
        <p class="info small">${[['#dc2626', 'unter 1'], ['#f97316', '1 bis 1,5'], ['#eab308', '1,5 bis 2'], ['#16a34a', 'ab 2']].map(([c, l]) => `<span style="white-space:nowrap"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin:0 4px 0 6px"></i>${l}</span>`).join('')}</p>
        <table class="cuttab"><thead><tr><th>Stab</th><th>σ max MPa</th><th>SF Knicken</th><th>SF</th>${r.umh ? '<th>maßgebend</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
        <p class="info small">${r.umh ? `Umhüllende über ${r.faelle.length} Lastfälle: je Stab der kleinste Sicherheitsfaktor und der Lastfall, aus dem er kommt; σ max und SF Knicken ebenso über alle Lastfälle. Blau: Biegelinie von ${esc(r.fallD)} (größte Verschiebung), ` : 'Blau: Biegelinie, '}${num(st.scale || 0, 0)}-fach überhöht. Sicherheitsfaktor = Streckgrenze ${num(r.mat.fy, 0)} MPa / Spannung (Normalkraft und Biegung am Rand, ohne Schub), bzw. Euler-Knicklast / Druckkraft mit Knicklänge = Stablänge. Gerechnet auf den Systemlinien (Skizzenlinien), Knoten biegesteif; Schweißnähte, Knotenbleche und Lochschwächungen bleiben unberücksichtigt – zur Vorbemessung, keine Statik zum Einreichen.</p>` : ''}
      </div><footer><button type="button" class="btn" data-cmd="fs-clear">Leeren</button><button type="button" class="btn primary" data-cmd="fs-close">Schließen</button></footer>`;
    d.hidden = false;
  }
  function onCmd(cmd, el) {
    const s = study();
    if (cmd === 'fs-close') return close();
    if (cmd === 'fs-tool') { st.tool = el.dataset.v; return render(); }
    if (cmd === 'fs-art') { ctx.pushHistory(); s.art = el.dataset.v === 'modal' ? 'modal' : 'statisch'; st.form = 0; ctx.store(); return render(); }
    if (cmd === 'fs-form') { st.form = +el.dataset.i || 0; return render(); }
    if (cmd === 'fs-dir') { st.dir = el.dataset.v; return render(); }
    if (cmd === 'fs-del') { ctx.pushHistory(); s[el.dataset.k].splice(+el.dataset.i, 1); ctx.store(); return render(); }
    if (cmd === 'fs-clear') { ctx.pushHistory(); s.supports = []; s.loads = []; s.faelle = null; ctx.store(); st.umh = false; return render(); }
    if (cmd === 'fs-fall') { st.umh = false; fallWahl(s, +el.dataset.i || 0); return render(); }
    if (cmd === 'fs-fall-neu') { ctx.pushHistory(); s.faelle.push({ name: `Lastfall ${s.faelle.length + 1}`, loads: [], selfWeight: true }); st.umh = false; fallWahl(s, s.faelle.length - 1); ctx.store(); return render(); }
    if (cmd === 'fs-fall-weg') { if (s.faelle.length < 2) return; ctx.pushHistory(); s.faelle.splice(s.fall, 1); s.faelle.forEach((f, i) => { if (/^Lastfall \d+$/.test(f.name)) f.name = `Lastfall ${i + 1}`; }); st.umh = false; fallWahl(s, Math.min(s.fall, s.faelle.length - 1)); ctx.store(); return render(); }
    if (cmd === 'fs-umh') { st.umh = !st.umh; return render(); }
  }
  function onInput(t) {
    const s = study();
    if (t.dataset.fs === 'mat') { ctx.pushHistory(); s.mat = t.value; ctx.store(); render(); }
    if (t.dataset.fs === 'self') { ctx.pushHistory(); s.selfWeight = t.checked; ctx.store(); render(); }
    if (t.dataset.fs === 'F') st.F = Math.max(0, Number(String(t.value).replace(',', '.')) || 0);
    if (t.dataset.fs === 'q') st.q = Math.max(0, Number(String(t.value).replace(',', '.')) || 0);
  }
  return { openFrameSim: open, closeFrameSim: close, frameSimPick: pick, renderFrameSim: render, frameSimCmd: onCmd, frameSimInput: onInput, get frameSimResult() { return st.res; }, get frameSimModes() { return st.modes; } };
}
