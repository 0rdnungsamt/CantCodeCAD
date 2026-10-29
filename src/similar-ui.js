// cantcodecad – Prüfen → „Ähnliche Komponenten suchen“: zu einem Bezug (Komponente oder Körper) alle gleichen
// bzw. ähnlichen im Dokument finden und markieren. Verglichen wird eine Formkennung je Körper aus dem Kern (Volumen,
// Oberfläche, Flächen/Kanten, Hauptträgheitsmomente – unabhängig von Lage und Drehung); eine Komponente vergleicht ihre
// Körper der Größe nach. Bezug blau, Treffer orange, alles andere durchscheinend.
import { icon } from './icons.js';

const BLAU = '#3b82f6', ORANGE = '#f59e0b';
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);
/* Abweichung zweier Körperkennungen: größte relative Abweichung von Volumen, Oberfläche und Hauptträgheitsmomenten */
const abw = (p, q) => Math.max(rel(p.V, q.V), rel(p.A, q.A), ...p.I.map((v, i) => rel(v, q.I[i])));

export function setupSimilar(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a), fmt = (...a) => ctx.fmt(...a);
  const st = { ref: null, art: null, genau: 'gleich', proz: 5, sigs: null, treffer: [], laden: false, fehler: '' };

  const sichtbar = () => ((ctx.lastBuild && ctx.lastBuild.bodies) || []).filter(id => !ctx.isHidden(id));
  const hatKomp = () => sichtbar().some(id => ctx.compOf(id));
  /* Einheiten: Komponenten mit ihren Körpern, Körper ohne Komponente einzeln – oder nur Körper */
  function einheiten() {
    const ids = sichtbar();
    if (st.art === 'koerper') return ids.map(id => ({ id, name: ctx.bodyName(id), bodies: [id] }));
    const m = new Map();
    ids.forEach(id => {
      const c = ctx.compOf(id), k = c || id;
      if (!m.has(k)) m.set(k, { id: k, name: c ? ctx.compName(c) : ctx.bodyName(id), komp: !!c, bodies: [] });
      m.get(k).bodies.push(id);
    });
    return [...m.values()];
  }
  const einheitVon = bodyId => einheiten().find(u => u.bodies.includes(bodyId)) || null;
  /* Vergleich zweier Einheiten: gleiche Körperzahl, Körper der Größe nach paarweise */
  function vergleich(u, w) {
    if (u.bodies.length !== w.bodies.length) return null;
    const S = ids => ids.map(id => st.sigs.get(id)).filter(Boolean).sort((a, b) => a.V - b.V);
    const a = S(u.bodies), b = S(w.bodies);
    if (a.length !== u.bodies.length || b.length !== w.bodies.length) return null;
    let d = 0, topo = true;
    a.forEach((p, i) => { d = Math.max(d, abw(p, b[i])); if (p.nf !== b[i].nf || p.ne !== b[i].ne) topo = false; });
    return { d, topo };
  }
  function suchen() {
    st.treffer = [];
    const ref = st.ref && einheiten().find(u => u.id === st.ref);
    if (!ref || !st.sigs) return;
    einheiten().forEach(u => {
      if (u.id === ref.id) return;
      const v = vergleich(ref, u);
      if (!v) return;
      const ok = st.genau === 'gleich' ? v.d <= 1e-3 && v.topo : v.d <= st.proz / 100;
      if (ok) st.treffer.push({ ...u, d: v.d, topo: v.topo });
    });
    st.treffer.sort((a, b) => a.d - b.d);
  }
  function farben() {
    const ref = st.ref && einheiten().find(u => u.id === st.ref);
    const col = { ...ctx.bodyColorMap() }, mark = new Set();
    if (ref) ref.bodies.forEach(id => { col[id] = BLAU; mark.add(id); });
    st.treffer.forEach(u => u.bodies.forEach(id => { col[id] = ORANGE; mark.add(id); }));
    ctx.vp.setBodyColors(col);
    ctx.vp.setFaded(ref ? sichtbar().filter(id => !mark.has(id)) : []);
  }

  async function open() {
    if (!sichtbar().length) { ctx.toast('Es gibt noch keine Körper.'); return; }
    const sel = ctx.selectedBody();
    st.art = hatKomp() ? 'komp' : 'koerper';
    st.ref = null; st.treffer = []; st.fehler = ''; st.sigs = null;
    ctx.closeDialog();
    ctx.setMode('similar');
    ctx.vp.setPickMode('face');
    if (sel) { const u = einheitVon(sel); st.ref = u && u.id; }
    await laden();
  }
  async function laden() {
    st.laden = true; render();
    try {
      const { sigs } = await ctx.kernel.shapeSigs();
      st.sigs = new Map(sigs.filter(s => !s.fehler).map(s => [s.id, s]));
      st.fehler = '';
    } catch (err) { st.fehler = err.message || String(err); }
    st.laden = false;
    if (ctx.mode !== 'similar') return;
    suchen(); render();
  }
  function close() {
    st.ref = null; st.treffer = [];
    ctx.vp.setBodyColors(ctx.bodyColorMap()); ctx.vp.setFaded(ctx.fadedBodies());
    ctx.closeDialog();
    ctx.setMode('model');
  }
  function render() {
    if (ctx.mode !== 'similar') return;
    const d = $('#dialog'), ref = st.ref && einheiten().find(u => u.id === st.ref);
    const was = st.art === 'koerper' ? 'Körper' : 'Komponenten', eins = st.art === 'koerper' ? 'Körper' : 'Komponente';
    const seg = (cmd, cur, opts) => `<div class="seg" role="radiogroup">${opts.map(([k, l]) => `<button type="button" data-cmd="${cmd}" data-v="${k}" role="radio" aria-checked="${cur === k}">${l}</button>`).join('')}</div>`;
    const liste = st.treffer.length
      ? `<p class="info">${st.treffer.length} ${st.genau === 'gleich' ? 'gleiche' : 'ähnliche'}${st.treffer.length === 1 && st.art === 'koerper' ? 'r' : ''} ${st.treffer.length === 1 ? eins : was} (orange):</p><div class="flist2 ilist">${st.treffer.map(u => `<div class="frow"><span>${esc(u.name)}</span><em>${u.d < 1e-6 ? 'gleich' : `${fmt(u.d * 100, 2)} %`}${u.topo ? '' : ' · andere Flächen'}</em></div>`).join('')}</div>`
      : ref ? `<p class="info">Keine ${st.genau === 'gleich' ? 'gleichen' : 'ähnlichen'} ${was} gefunden.</p>` : '';
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('component', 20)}<b class="dtitle">Ähnliche Komponenten suchen</b></header><div class="dbody">
      ${hatKomp() ? `<div class="row"><span>Vergleichen</span>${seg('sim-art', st.art, [['komp', 'Komponenten'], ['koerper', 'Körper']])}</div>` : ''}
      <div class="row"><span>Bezug</span><b>${ref ? `<i class="gdsw" style="background:${BLAU}"></i>${esc(ref.name)}` : '–'}</b></div>
      ${ref ? '' : `<p class="info small">${eins} im Modell anklicken.</p>`}
      <div class="row"><span>Übereinstimmung</span>${seg('sim-genau', st.genau, [['gleich', 'Gleich'], ['aehnlich', 'Ähnlich']])}</div>
      ${st.genau === 'aehnlich' ? `<label class="row"><span>Abweichung höchstens</span><span class="num"><input type="number" step="1" min="0.1" max="100" data-sim="proz" value="${st.proz}"><em>%</em></span></label>` : ''}
      ${st.laden ? '<p class="info">Formen werden verglichen …</p>' : st.fehler ? `<p class="derr">${esc(st.fehler)}</p>` : liste}
      <p class="info small">Verglichen werden Volumen, Oberfläche und die Hauptträgheitsmomente – Lage und Drehung spielen keine Rolle. „Gleich“: höchstens 0,1 % Abweichung und gleich viele Flächen und Kanten. Eine Komponente gleicht einer anderen, wenn ihre Körper paarweise passen.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="sim-close">Schließen</button></footer>`;
    d.hidden = false;
    farben();
  }
  function pick(h) {
    if (!h || h.kind !== 'face') return;
    const id = ctx.bodyIdAtFace(h.info), u = id && einheitVon(id);
    if (!u) return;
    st.ref = u.id; suchen(); render();
  }
  function cmd(c, el) {
    if (c === 'sim-close') return close();
    if (c === 'sim-art') {
      // Bezug mitnehmen: aus der Komponente ihr erster Körper, aus dem Körper seine Komponente
      const alt = st.ref && einheiten().find(u => u.id === st.ref);
      st.art = el.dataset.v;
      const neu = alt && einheitVon(alt.bodies[0]);
      st.ref = neu ? neu.id : null;
    }
    if (c === 'sim-genau') st.genau = el.dataset.v;
    suchen(); render();
  }
  function eingabe(t) {
    if (t.dataset.sim !== 'proz') return;
    const v = Number(String(t.value).replace(',', '.'));
    if (!(v > 0)) return;
    st.proz = v; suchen();
    const fokus = document.activeElement === t;
    render();
    if (fokus) { const n = $('#dialog [data-sim="proz"]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }
  }
  /* nach einem Neuaufbau: Kennungen neu holen (Körper können sich geändert haben) */
  function refresh() { if (ctx.mode === 'similar') laden(); }
  return { openSimilar: open, closeSimilar: close, similarPick: pick, similarCmd: cmd, similarInput: eingabe, refreshSimilar: refresh, similarState: st };
}
