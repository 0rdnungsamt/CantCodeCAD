// cantcodecad – Festigkeit und Wärme von Bauteilen (Prüfen → Festigkeit (Bauteil)), angelehnt an die übliche Simulation
// „Statische Spannung“, „Modalfrequenzen“ und „Thermisch (stationär)“: Flächen fest halten, Kräfte auf Flächen,
// Werkstoff und Netzfeinheit wählen, „Berechnen“. Eine Studie hat mehrere Lastfälle (eigene Kräfte und Eigengewicht,
// gleiche feste Flächen) – „Umhüllende“ rechnet alle und zeigt je Punkt den größten Wert. Modalfrequenzen lässt
// dieselbe Versteifung frei schwingen: Eigenfrequenzen und Schwingungsformen. Die Studie „Wärme“ rechnet am selben
// Netz die stationäre Temperatur: Flächen auf Temperatur, Leistung auf Flächen, Konvektion gegen die Umgebung.
// Eine Studie rechnet mehrere Körper zusammen: der gewählte dazu die unter „Weitere Körper“ dazu genommenen, jeder
// mit eigenem Werkstoff. Alle liegen auf einem Netz; sich berührende Körper teilen sich die Knoten der Berührungs-
// fläche, das ist die Verbindung (fest). Bedingungen und Lasten dürfen auf Flächen jedes Körpers der Studie liegen.
// Gerechnet wird im Worker src/sim/solid-worker.js (Voxel-Hexaeder, src/sim/solid.js, Wärmeleitung src/sim/thermal.js);
// das Ergebnis färbt den Körper nach der Vergleichsspannung (von Mises) oder der Temperatur und nennt
// Sicherheitsfaktor und größte Verschiebung, bei der Modalanalyse zeichnet es die Schwingungsform.
// Einrichtung in doc.solidStudy.
import { icon } from './icons.js';
import { fmtLenU } from './units.js';
import { DEC } from './i18n.js';

/* Werkstoffe mit E, Querdehnzahl, Streckgrenze (MPa), Gewichtsdichte (kg/mm³) für das Eigengewicht und
   Wärmeleitfähigkeit k (W/(m·K)) für die Wärmeanalyse – im Rechner steht k in W/(mm·K), 1 W/(m·K) = 1e-3 */
export const SOLID_MATERIALS = {
  s235: { label: 'Stahl S235', E: 210000, nu: 0.3, fy: 235, rho: 7.85e-6, k: 50 },
  s355: { label: 'Stahl S355', E: 210000, nu: 0.3, fy: 355, rho: 7.85e-6, k: 50 },
  inox: { label: 'Edelstahl 1.4301', E: 200000, nu: 0.3, fy: 210, rho: 7.9e-6, k: 16 },
  alu6060: { label: 'Aluminium EN AW-6060 T6', E: 69000, nu: 0.33, fy: 150, rho: 2.7e-6, k: 165 },
  alu6082: { label: 'Aluminium EN AW-6082 T6', E: 70000, nu: 0.33, fy: 250, rho: 2.7e-6, k: 167 },
  pla: { label: 'PLA (3D-Druck)', E: 3500, nu: 0.36, fy: 50, rho: 1.24e-6, k: 0.12 },
  petg: { label: 'PETG (3D-Druck)', E: 2100, nu: 0.38, fy: 45, rho: 1.27e-6, k: 0.13 },
  pa12: { label: 'Nylon PA12 (3D-Druck)', E: 1700, nu: 0.4, fy: 45, rho: 1.01e-6, k: 0.25 }
};
/* Netzfeinheit: Zielzahl der Elemente (Würfelkante = ∛(Volumen / Anzahl)) */
export const MESH_SIZES = { coarse: ['Grob', 8000], medium: ['Mittel', 25000], fine: ['Fein', 80000] };
const DIRS = { normal: null, 'z-': [0, 0, -1], 'z+': [0, 0, 1], 'x-': [-1, 0, 0], 'x+': [1, 0, 0], 'y-': [0, -1, 0], 'y+': [0, 1, 0] };
const DIR_LABELS = { normal: 'Normale', 'z-': '−Z', 'z+': '+Z', 'x-': '−X', 'x+': '+X', 'y-': '−Y', 'y+': '+Y' };
const ART_LABELS = { statisch: 'Statische Spannung', modal: 'Modalfrequenzen', waerme: 'Wärme' };
const sfFarbe = sf => (sf < 1 ? '#dc2626' : sf < 1.5 ? '#f97316' : sf < 2 ? '#ca8a04' : '#16a34a');

export function setupSolidSim(ctx) {
  const $ = s => document.querySelector(s);
  const esc = (...a) => ctx.esc(...a);
  const st = { tool: 'fixed', F: 1000, dir: 'normal', res: null, resKey: '', busy: null, err: null, umh: false, form: 0, scale: 0, T: 80, Q: 50, hc: 10, Tamb: 20 };
  const num = (v, d = 1) => (v == null || !isFinite(v) ? '–' : String(Math.round(v * 10 ** d) / 10 ** d).replace('.', DEC));
  /* Studie wie bei der Rahmen-Festigkeit: „Statische Spannung“, „Modalfrequenzen“ (freie Schwingung) oder „Wärme“ */
  const modal = () => study().art === 'modal';
  const waerme = () => study().art === 'waerme';
  /* Werkzeuge der Wärmeanalyse: Temperatur, Leistung und Konvektion – Werte sind Vorgaben für den nächsten Klick,
     jede gesetzte Bedingung trägt ihre eigenen Werte (h in W/(m²·K), Umgebungs- und Körpertemperatur in °C) */
  const WTOOLS = { temp: 'Temperatur', flux: 'Leistung', conv: 'Konvektion' };
  const WARM_KEYS = ['temps', 'fluxes', 'convs'];
  const anzahl = s => Math.max(1, Math.min(12, Math.round(s.anzahl) || 6));
  /* Lastfälle wie bei der Rahmen-Festigkeit: s.faelle = [{ name, loads, selfWeight }], s.fall = aktiver. s.loads und
     s.selfWeight sind die Werte des aktiven Falls (Picks, Liste und ältere Dateien bleiben unverändert) und werden
     hier in den Fall zurückgeschrieben – nach Rückgängig oder Laden zeigen beide wieder auf dasselbe. */
  const study = () => {
    if (!ctx.doc.solidStudy) ctx.doc.solidStudy = { body: null, mat: 's235', mesh: 'medium', selfWeight: false, fixed: [], loads: [], mit: [] };
    const s = ctx.doc.solidStudy;
    for (const k of ['fixed', 'loads', 'temps', 'fluxes', 'convs', 'mit']) if (!Array.isArray(s[k])) s[k] = [];
    s.mit = s.mit.filter(x => x && typeof x.body === 'string');
    if (!Array.isArray(s.faelle) || !s.faelle.length) { s.faelle = [{ name: 'Lastfall 1', loads: s.loads, selfWeight: s.selfWeight === true }]; s.fall = 0; }
    if (!(s.fall >= 0 && s.fall < s.faelle.length)) s.fall = 0;
    s.faelle[s.fall].loads = s.loads; s.faelle[s.fall].selfWeight = s.selfWeight === true;
    return s;
  };
  const fallWahl = (s, j) => { s.fall = j; s.loads = s.faelle[j].loads; s.selfWeight = s.faelle[j].selfWeight; };
  /* alles an Bedingungen und Lasten weg – beim Körperwechsel gehören sie nicht mehr dazu */
  const clearAll = s => { s.fixed = []; s.loads = []; s.temps = []; s.fluxes = []; s.convs = []; };
  let worker = null, jobId = 0;
  const meshOf = () => ctx.lastBuild && ctx.lastBuild.mesh;
  const bodyIx = id => { const m = meshOf(); return m ? m.bodies.findIndex(b => b.id === id) : -1; };
  /* Körper der Studie: der gewählte zuerst, danach die weiteren – Reihenfolge und Nummer im Netz sind für alle
     gleich (job.mit, die Körper im Ergebnis und die Werkstoffe der weiteren Körper hängen daran). */
  const bodyIds = s => [s.body, ...s.mit.map(x => x.body)].filter(id => typeof id === 'string');
  const bodyIxs = s => bodyIds(s).map(bodyIx);
  /* Fläche eines Körpers der Studie zu einer gespeicherten Kennung (Art, Mitte, Normale) – Nummern sind im Netz
     global, deshalb dürfen Bedingungen und Lasten auf Flächen jedes Körpers der Studie liegen. */
  function faceIndex(sig) {
    const m = meshOf();
    if (!m) return -1;
    let best = -1, bd = Infinity;
    for (const bi of bodyIxs(study())) {
      if (bi < 0) continue;
      const [f0, f1] = m.bodies[bi].faces;
      for (let i = f0; i < f1; i++) {
        const f = m.faces[i];
        if (!f || f.type !== sig.t) continue;
        if (sig.n && f.n && f.n[0] * sig.n[0] + f.n[1] * sig.n[1] + f.n[2] * sig.n[2] < 0.999) continue;
        const d = Math.hypot(...f.center.map((v, k) => v - sig.c[k]));
        if (d < bd) { bd = d; best = i; }
      }
    }
    return bd < 0.5 ? best : -1;
  }
  const sigOf = info => ({ t: info.type, c: info.center.slice(), n: info.n ? info.n.slice() : null });
  function faceTris(i) {
    const m = meshOf(), f = m.faces[i], P = m.positions, I = m.index, out = new Float64Array(f.count * 3);
    for (let k = 0; k < f.count; k++) { const v = I[f.start + k]; out[3 * k] = P[3 * v]; out[3 * k + 1] = P[3 * v + 1]; out[3 * k + 2] = P[3 * v + 2]; }
    return out;
  }
  const setupKey = () => JSON.stringify(study()) + (st.umh ? '|umh' : '');

  function open() {
    const s = study(), vis = ((ctx.lastBuild && ctx.lastBuild.bodies) || []).filter(id => !ctx.isHidden(id));
    if (!vis.length) { ctx.toast('Es gibt noch keinen Körper.'); return; }
    const sel = ctx.selectedBody();
    if (sel) { if (sel !== s.body) { s.mit = s.mit.filter(x => x.body !== sel); s.body = sel; clearAll(s); } }
    else if (!vis.includes(s.body)) s.body = vis.length === 1 ? vis[0] : null;
    s.mit = s.mit.filter(x => x.body !== s.body);
    ctx.closeDialog();
    ctx.setMode('solidsim');
    ctx.vp.setPickMode('face');
    if (!s.body) st.tool = 'body';
    render();
  }
  function close() {
    if (worker) { worker.terminate(); worker = null; }
    st.busy = null;
    ctx.vp.setResultMesh(null); painted = '';
    ctx.vp.setFaded([]);
    ctx.vp.setSelection({});
    ctx.vp.setPickMode('none');
    ctx.closeDialog();
    ctx.setMode('model');
  }
  function pick(h) {
    if (!h || h.kind !== 'face') return;
    const s = study(), id = ctx.bodyIdAtFace(h.info);
    if (st.tool === 'body' || !s.body) {
      ctx.pushHistory(); s.mit = s.mit.filter(x => x.body !== id); s.body = id; clearAll(s); st.tool = waerme() ? 'temp' : 'fixed'; ctx.store(); return render();
    }
    /* weiterer Körper: anklicken nimmt ihn in die Studie auf, noch einmal nimmt ihn wieder heraus */
    if (st.tool === 'add') {
      if (id === s.body) { ctx.toast('Dieser Körper ist der Hauptkörper der Studie.'); return; }
      ctx.pushHistory();
      const i = s.mit.findIndex(x => x.body === id);
      if (i >= 0) s.mit.splice(i, 1); else s.mit.push({ body: id, mat: s.mat });
      ctx.store();
      return render();
    }
    if (!bodyIds(s).includes(id)) { ctx.toast('Diese Fläche gehört zu keinem Körper der Studie – „Körper hinzufügen“ nimmt ihn auf.'); return; }
    const sig = sigOf(h.info), same = x => faceIndex(x.face || x) === h.index;
    const dir = DIRS[st.dir] || (h.info.n ? h.info.n.map(v => -v) : null);
    if (st.tool === 'force' && !dir && !s.loads.some(same)) { ctx.toast('Die Fläche hat keine feste Normale – Richtung ±X/±Y/±Z wählen.'); return; }
    ctx.pushHistory();
    /* Wärme: eine Fläche trägt genau eine Bedingung – Temperatur, Leistung oder Konvektion */
    if (WTOOLS[st.tool]) {
      const k = { temp: 'temps', flux: 'fluxes', conv: 'convs' }[st.tool];
      const i = s[k].findIndex(same);
      if (i >= 0) s[k].splice(i, 1);
      else {
        for (const other of ['temps', 'fluxes', 'convs']) if (other !== k) s[other] = s[other].filter(x => !same(x));
        s[k].push(st.tool === 'temp' ? { face: sig, T: st.T } : st.tool === 'flux' ? { face: sig, Q: st.Q } : { face: sig, h: st.hc, Tamb: st.Tamb });
      }
      ctx.store();
      return render();
    }
    if (st.tool === 'fixed') {
      const i = s.fixed.findIndex(same);
      if (i >= 0) s.fixed.splice(i, 1); else { s.fixed.push(sig); s.loads = s.loads.filter(l => !same(l)); }
    } else {
      const i = s.loads.findIndex(same);
      if (i >= 0) s.loads.splice(i, 1);
      else {
        s.loads.push({ face: sig, F: dir.map(v => v * st.F) });
        s.fixed = s.fixed.filter(x => !same({ face: x }));
      }
    }
    ctx.store();
    render();
  }
  function compute() {
    const s = study(), m = meshOf(), bi = bodyIx(s.body), mat = SOLID_MATERIALS[s.mat] || SOLID_MATERIALS.s235;
    st.err = null;
    if (bi < 0) { st.err = 'Erst einen Körper anklicken.'; return render(); }
    const bis = bodyIxs(s);
    if (bis.slice(1).some(i => i < 0)) { st.err = 'Ein weiterer Körper der Studie gehört nicht mehr zum Modell – entfernen.'; return render(); }
    const fixed = s.fixed.map(faceIndex);
    const isW = waerme(), isModal = modal(), isLast = !isModal && !isW;
    if (!isW && !fixed.length) { st.err = 'Mindestens eine feste Fläche anklicken.'; return render(); }
    if (!isW && fixed.some(i => i < 0)) { st.err = 'Eine gewählte Fläche gibt es nicht mehr – neu anklicken.'; return render(); }
    /* Wärme: ohne vorgegebene Temperatur oder Konvektion ist das Temperaturfeld nicht bestimmt (alle anderen Flächen
       sind adiabat). Flächen der drei Bedingungen werden auf Nummern im Netz geprüft wie die Kräfte. */
    const bed = k => (s[k] || []).map(x => [faceIndex(x.face), x]);
    if (isW) {
      if ([...bed('temps'), ...bed('fluxes'), ...bed('convs')].some(a => a[0] < 0)) { st.err = 'Eine gewählte Fläche gibt es nicht mehr – neu anklicken.'; return render(); }
      if (!s.temps.length && !s.convs.length) { st.err = 'Ohne vorgegebene Temperatur oder Konvektion löst die Wärmegleichung nicht – eine Fläche anklicken.'; return render(); }
    }
    /* Lastfälle: jeder braucht eine Last (Kraft oder Eigengewicht), sonst löst die Steifigkeit nicht. Umgeschaltet
       wird nur für die Umhüllende – ein einzelner Fall rechnet wie bisher nur den aktiven. Bei der Modalanalyse gibt
       es keine Lasten, dort zählt nur die Versteifung. */
    const fa = isLast ? s.faelle.map(f => ({ name: f.name, loads: (f.loads || []).map(l => [faceIndex(l.face), l.F]), selfWeight: f.selfWeight === true })) : [];
    if (isLast) {
      const leer = fa.findIndex(f => !f.loads.length && !f.selfWeight);
      if (leer >= 0) { st.err = `${fa[leer].name} hat keine Last – eine Kraft auf eine Fläche setzen oder Eigengewicht einschalten.`; return render(); }
      if (fa.some(f => f.loads.some(l => l[0] < 0))) { st.err = 'Eine gewählte Fläche gibt es nicht mehr – neu anklicken.'; return render(); }
    }
    /* alle Körper der Studie kommen auf ein Netz: Dreiecke, gemeinsame Hülle, Würfelkante nach der Gesamtzahl der
       Elemente. Die kleinste Ausdehnung aller Körper (bei Platten und Blechen die Dicke) bekommt ganze Würfel. */
    const trisVon = b => {
      const P = m.positions, I = m.index, t = new Float64Array((b.tris[1] - b.tris[0]) * 3);
      for (let k = b.tris[0]; k < b.tris[1]; k++) { const v = I[k], o = (k - b.tris[0]) * 3; t[o] = P[3 * v]; t[o + 1] = P[3 * v + 1]; t[o + 2] = P[3 * v + 2]; }
      return t;
    };
    const koerp = bis.map(ix => m.bodies[ix]);
    const bb = [[0, 1, 2].map(ax => Math.min(...koerp.map(b => b.bbox[0][ax]))), [0, 1, 2].map(ax => Math.max(...koerp.map(b => b.bbox[1][ax])))];
    const vol = koerp.reduce((a, b) => a + (b.volume || (b.bbox[1][0] - b.bbox[0][0]) * (b.bbox[1][1] - b.bbox[0][1]) * (b.bbox[1][2] - b.bbox[0][2]) / 2), 0);
    let h = Math.cbrt(vol / (MESH_SIZES[s.mesh] || MESH_SIZES.medium)[1]);
    // kleinste Ausdehnung (bei Platten und Blechen die Dicke) in ganzen Würfeln, mindestens zwei
    const dmin = Math.min(...koerp.flatMap(b => [0, 1, 2].map(k => b.bbox[1][k] - b.bbox[0][k])));
    h = dmin / Math.max(2, Math.round(dmin / h));
    const grund = { tris: trisVon(koerp[0]), bbox: bb, h, name: ctx.bodyName(s.body) };
    /* weiterer Körper mit eigenem Werkstoff – der Rechenkern wählt Steifigkeit, Dichte und Leitfähigkeit je Element */
    if (bis.length > 1) grund.mit = bis.slice(1).map((ix, j) => {
      const mm = SOLID_MATERIALS[s.mit[j].mat] || mat;
      return { tris: trisVon(m.bodies[ix]), bbox: m.bodies[ix].bbox, E: mm.E, nu: mm.nu, rho: mm.rho, k: mm.k, name: ctx.bodyName(s.mit[j].body) };
    });
    const mech = isW ? {} : { E: mat.E, nu: mat.nu, fixed: fixed.map(faceTris) };
    const lasten = f => ({ forces: f.loads.map(([i, F]) => ({ tris: faceTris(i), F })), weight: f.selfWeight ? mat.rho || 0 : 0 });
    /* Wärme: k in W/(mm·K), Übergangskoeffizient in W/(mm²·K) – beides klein, deshalb steht im Dokument W/(m·K)
       und W/(m²·K) */
    const job = isW
      ? { ...grund, art: 'waerme', k: (mat.k || 50) / 1000, temps: bed('temps').map(([i, x]) => ({ tris: faceTris(i), T: x.T })),
        fluxes: bed('fluxes').map(([i, x]) => ({ tris: faceTris(i), P: x.Q })), convs: bed('convs').map(([i, x]) => ({ tris: faceTris(i), h: (x.h || 0) / 1e6, Tamb: x.Tamb })) }
      : isModal ? { ...grund, ...mech, art: 'modal', rho: mat.rho, anzahl: anzahl(s) }
        : st.umh && fa.length > 1 ? { ...grund, ...mech, faelle: fa.map(f => ({ name: f.name, ...lasten(f) })) }
          : { ...grund, ...mech, ...lasten(fa[s.fall]) };
    if (worker) worker.terminate();
    worker = new Worker(new URL('./sim/solid-worker.js', import.meta.url), { type: 'module' });
    const id = ++jobId, key = setupKey();
    st.busy = 0;
    st.form = 0;
    worker.onmessage = e => {
      const d = e.data;
      if (d.id !== id) return;
      if (d.art === 'fortschritt') { st.busy = d.anteil; const el = $('#dialog .ssbusy'); if (el) el.textContent = `rechnet … ${Math.round(d.anteil * 100)} %`; return; }
      worker.terminate(); worker = null; st.busy = null;
      if (d.art === 'fehler') st.err = d.text;
      else { st.res = { ...d.r, mat, fy: mat.fy, werks: [mat, ...s.mit.map(x => SOLID_MATERIALS[x.mat] || mat)], size: Math.max(...[0, 1, 2].map(k => bb[1][k] - bb[0][k])) }; st.resKey = key; }
      render();
    };
    worker.onerror = e => { st.busy = null; st.err = e.message || 'Rechnung abgebrochen'; render(); };
    worker.postMessage({ id, job }, [job.tris.buffer, ...(job.mit || []).map(x => x.tris.buffer)]);
    render();
  }
  /* Ergebnis auf dem Körper: Dreiecke des Anzeigenetzes so lange halbiert, bis keine Kante länger als 1,5 Netzkanten
     ist (höchstens ~400 000 Dreiecke), jeder Eckpunkt mit dem Wert des nächsten Netzknotens gefärbt. Bei der
     Modalanalyse kommt die Eigenform dazu: jeder Punkt wandert um seine Auslenkung (8 % der Bauteilgröße). */
  let painted = '';
  async function paint() {
    const m = meshOf(), r = st.res, bis = bodyIxs(study());
    if (!m || !r || bis.some(i => i < 0) || st.resKey !== setupKey()) { if (painted) { ctx.vp.setResultMesh(null); painted = ''; } return; }
    const mode = r.modes ? r.modes[Math.min(st.form, r.modes.length - 1)] : null;
    const key = st.resKey + '|' + m.positions.length + '|' + r.ms + (mode ? '|form' + st.form : '');
    if (painted === key) return;
    painted = key;
    const { sampleNodes, sampleVec } = await import('./sim/solid.js');
    const P = m.positions, I = m.index, lim = 1.5 * r.grid.h;
    const sc = mode ? Math.max(1e-6, (r.size || 1) * 0.08) : 0;
    st.scale = sc;
    let tris = [];
    for (const bi of bis) {
      const b = m.bodies[bi];
      for (let k = b.tris[0]; k < b.tris[1]; k += 3) tris.push([0, 1, 2].map(q => { const v = I[k + q]; return [P[3 * v], P[3 * v + 1], P[3 * v + 2]]; }));
    }
    const L = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]), mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    for (let pass = 0; pass < 12 && tris.length < 200000; pass++) {
      const out = [];
      let split = false;
      tris.forEach(t => {
        const e = [L(t[0], t[1]), L(t[1], t[2]), L(t[2], t[0])], j = e.indexOf(Math.max(...e));
        if (e[j] <= lim) { out.push(t); return; }
        split = true;
        const a = t[j], c = t[(j + 1) % 3], d = t[(j + 2) % 3], mm = mid(a, c);
        out.push([a, mm, d], [mm, c, d]);
      });
      tris = out;
      if (!split) break;
    }
    const pos = new Float32Array(tris.length * 9), col = new Float32Array(tris.length * 9);
    const ramp = [[0.25, 0.45, 0.9], [0.35, 0.78, 0.45], [0.98, 0.8, 0.25], [0.93, 0.27, 0.22]], lo = r.T ? r.tmin : 0, max = (mode ? 1 : r.T ? r.tmax - r.tmin : r.smax) || 1;
    const memo = new Map();
    tris.forEach((t, i) => t.forEach((p, q) => {
      const o = 9 * i + 3 * q, key2 = p.join(',');
      let e = memo.get(key2);
      if (e == null) {
        e = mode ? (d => ({ d, v: Math.hypot(...d) }))(sampleVec(r, mode.u, p)) : { d: [0, 0, 0], v: sampleNodes(r, r.T || r.vm, p) };
        memo.set(key2, e);
      }
      const x = Math.max(0, Math.min(1, (e.v - lo) / max)) * 3, jj = Math.min(2, Math.floor(x)), f = x - jj, A = ramp[jj], B = ramp[jj + 1];
      pos[o] = p[0] + e.d[0] * sc; pos[o + 1] = p[1] + e.d[1] * sc; pos[o + 2] = p[2] + e.d[2] * sc;
      col[o] = A[0] + (B[0] - A[0]) * f; col[o + 1] = A[1] + (B[1] - A[1]) * f; col[o + 2] = A[2] + (B[2] - A[2]) * f;
    }));
    if (painted === key) ctx.vp.setResultMesh({ positions: pos, colors: col });
  }
  function render() {
    if (ctx.mode !== 'solidsim') return;
    const s = study(), d = $('#dialog'), m = meshOf(), bi = bodyIx(s.body);
    const art = waerme() ? 'waerme' : modal() ? 'modal' : 'statisch';
    /* jedes Werkzeug gehört zu einer Studie – nach dem Wechsel der Studie passt keins zum anderen */
    if (art === 'modal' && (st.tool === 'force' || WTOOLS[st.tool])) st.tool = 'fixed';
    if (art === 'statisch' && WTOOLS[st.tool]) st.tool = 'fixed';
    if (art === 'waerme' && !WTOOLS[st.tool] && st.tool !== 'body' && st.tool !== 'add') st.tool = 'temp';
    const ids = ((ctx.lastBuild && ctx.lastBuild.bodies) || []).filter(id => !bodyIds(s).includes(id));
    ctx.vp.setFaded(ids);
    ctx.vp.setSelection({ faces: [...s.fixed.map(faceIndex), ...s.loads.map(l => faceIndex(l.face)), ...WARM_KEYS.flatMap(k => s[k].map(x => faceIndex(x.face)))].filter(i => i >= 0) });
    paint();
    const r = st.res && st.resKey === setupKey() ? st.res : null;
    const chip = (t, l) => `<button type="button" class="chip" data-cmd="ss-tool" data-v="${t}" aria-pressed="${st.tool === t}">${esc(l)}</button>`;
    const hint = { body: 'Körper im Modell anklicken.', add: 'Körper anklicken, der als weiterer Körper mitrechnet (angeschweißte Lasche, angesetzte Rippe). Noch einmal = entfernen.', fixed: 'Fläche anklicken, die fest gehalten wird (z. B. Schraubfläche, Einspannung). Noch einmal = weg.', force: 'Fläche anklicken, auf die die Kraft wirkt – verteilt über die Fläche. Noch einmal = weg.', temp: 'Fläche anklicken, deren Temperatur vorgegeben wird (z. B. Lagerstelle, Kühlplatte). Noch einmal = weg.', flux: 'Fläche anklicken, auf die die Leistung wirkt (z. B. Verlustleistung eines Bauteils). Noch einmal = weg.', conv: 'Fläche anklicken, die Wärme an die Umgebung abgibt (Luft). Noch einmal = weg.' }[st.tool];
    /* Sicherheitsfaktor je Körper – bei mehreren Werkstoffen ist der kleinste maßgebend */
    const sfTeile = r && r.smaxTeile && r.werks ? r.smaxTeile.map((sm, i) => ((r.werks[i] || r.mat).fy ?? r.fy) / Math.max(1e-9, sm)) : null;
    const sf = r && !r.modes && !r.T ? Math.min(...(sfTeile || [r.fy / Math.max(1e-9, r.smax)])) : null;
    const sfCol = sf == null ? '' : sfFarbe(sf);
    const formScale = r && r.modes ? Math.max(1e-6, (r.size || 1) * 0.08) : 0;
    const formZeilen = r && r.modes ? r.modes.map((mo, i) => `<tr data-cmd="ss-form" data-i="${i}"${i === st.form ? ' class="sel" style="cursor:pointer;font-weight:600"' : ' style="cursor:pointer"'}><td>${i + 1}</td><td>${num(mo.f, 2)}</td><td>${num(mo.omega, 1)}</td></tr>`).join('') : '';
    const fallKnöpfe = s.faelle.map((f, i) => `<button type="button" class="chip" data-cmd="ss-fall" data-i="${i}" aria-pressed="${!st.umh && i === s.fall}" title="Lasten und Eigengewicht dieses Lastfalls bearbeiten">${esc(f.name)} (${(f.loads || []).length})</button>`).join('');
    const fallZeilen = r && r.umh ? r.faelle.map(f => { const x = Math.min(...(f.smaxTeile && r.werks ? f.smaxTeile.map((sm, i) => ((r.werks[i] || r.mat).fy ?? r.fy) / Math.max(1e-9, sm)) : [r.fy / Math.max(1e-9, f.smax)])); return `<tr><td>${esc(f.name)}</td><td>${num(f.smax, 1)}</td><td><b style="color:${sfFarbe(x)}">${num(x, 2)}</b></td><td>${fmtLenU(f.dmax, 3)}</td></tr>`; }).join('') : '';
    /* Wärmeanalyse: Wertefelder für die nächste Fläche, Liste der Bedingungen, ihr gemessener Wärmestrom und die
       Bilanz. Vorzeichen durchgehend: in den Körper hinein – die Summe muss null sein. */
    const warmWert = st.tool === 'temp' ? `<label class="row"><span>Temperatur</span><span class="num"><input type="number" step="5" data-ss="T" value="${st.T}"><em>°C</em></span></label>`
      : st.tool === 'flux' ? `<label class="row"><span>Leistung</span><span class="num"><input type="number" step="5" data-ss="Q" value="${st.Q}"><em>W</em></span></label>`
        : st.tool === 'conv' ? `<label class="row"><span>Wärmeübergang</span><span class="num"><input type="number" min="0" step="5" data-ss="hc" value="${st.hc}"><em>W/(m²·K)</em></span></label>
        <label class="row"><span>Umgebungstemperatur</span><span class="num"><input type="number" step="5" data-ss="Tamb" value="${st.Tamb}"><em>°C</em></span></label>` : '';
    const bedText = (k, x) => k === 'temps' ? `Temperatur ${num(x.T, 1)} °C` : k === 'fluxes' ? `Leistung ${num(x.Q, 1)} W` : `Konvektion ${num(x.h, 1)} W/(m²·K) bei ${num(x.Tamb, 1)} °C`;
    const bedZeilen = WARM_KEYS.flatMap(k => s[k].map((x, i) => `<div class="frow"><span>${bedText(k, x)}</span><button type="button" class="iconbtn" data-cmd="ss-del" data-k="${k}" data-i="${i}" title="Entfernen">${icon('close', 12)}</button></div>`)).join('');
    const warmZeilen = r && r.T ? [...r.qFix.map((q, i) => `<tr><td>Temperatur ${num(s.temps[i]?.T, 1)} °C</td><td>${num(q, 2)}</td></tr>`),
      ...s.fluxes.map(x => `<tr><td>Leistung ${num(x.Q, 1)} W</td><td>${num(x.Q, 2)}</td></tr>`),
      ...r.qConv.map((q, i) => `<tr><td>Konvektion ${num(s.convs[i]?.Tamb, 1)} °C</td><td>${num(-q, 2)}</td></tr>`)].join('') : '';
    const bilanz = r && r.T ? r.qFix.reduce((a, b) => a + b, 0) + r.qIn - r.qConvSum : 0;
    /* weitere Körper der Studie: Name, eigener Werkstoff, entfernen */
    const matWaehl = (v, extra) => `<select data-ss="matmit" ${extra}>${Object.entries(SOLID_MATERIALS).map(([k, x]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
    const mitZeilen = s.mit.map((x, j) => {
      const ix = bodyIx(x.body);
      return `<div class="frow"><span>${ix >= 0 ? esc(ctx.bodyName(x.body)) : '– (nicht mehr im Modell)'}</span>${matWaehl(x.mat, `data-i="${j}"`)}<button type="button" class="iconbtn" data-cmd="ss-del" data-k="mit" data-i="${j}" title="Entfernen">${icon('close', 12)}</button></div>`;
    }).join('');
    /* Werkstoffe der Studie in der Reihenfolge der Körper – für die Hinweise zu Leitfähigkeit und Streckgrenze */
    const stoff = (feld, dezi) => [[s.mat, ctx.bodyName(s.body)], ...s.mit.map(x => [x.mat, ctx.bodyName(x.body)])]
      .map(([mk, n]) => `${n} ${num((SOLID_MATERIALS[mk] || SOLID_MATERIALS.s235)[feld], dezi)}`).join(', ');
    /* Körper und ihre Kontakte: die gemeinsame Berührungsfläche ist die Verbindung, ihre Knoten sind gemeinsam */
    const koerperBlock = r && r.koerper && r.koerper.length > 1 ? `<table class="cuttab"><thead><tr><th>Körper</th><th>Würfel</th>${r.smaxTeile ? '<th>σ max MPa</th><th>SF</th>' : ''}</tr></thead><tbody>${r.koerper.map((k, i) => `<tr><td>${esc(k.name)}</td><td>${num(k.elements, 0)}</td>${r.smaxTeile ? `<td>${num(r.smaxTeile[i], 1)}</td><td><b style="color:${sfFarbe(sfTeile[i])}">${num(sfTeile[i], 2)}</b></td>` : ''}</tr>`).join('')}</tbody></table>
      ${r.kontakte.length ? `<table class="cuttab"><thead><tr><th>Kontakt</th><th>Berührungsflächen</th></tr></thead><tbody>${r.kontakte.map(k => `<tr><td>${esc((r.koerper[k.a] || {}).name)} ↔ ${esc((r.koerper[k.b] || {}).name)}</td><td>${num(k.n, 0)}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="info small">Zwei Körper rechnen auf demselben Netz: wo sich ihre Würfel berühren, teilen sie sich die Knoten – die Verbindung ist fest, Kraft und Wärme gehen vollständig über. Ein Spalt oder Spiel dazwischen, Reibung oder ein Lösen unter Last werden nicht gerechnet; die Körper müssen sich berühren, sonst löst die Rechnung nicht.${r.ueber ? ` Würfel, die in mehr als einem Körper liegen (sich überschneidende Geometrie): ${num(r.ueber, 0)}.` : ''}</p>` : '';
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('draftan', 20)}<b class="dtitle">${art === 'waerme' ? 'Wärmeanalyse (Bauteil)' : 'Festigkeit (Bauteil)'}</b></header><div class="dbody">
      <div class="row"><span>Körper</span><b class="pref">${bi >= 0 ? esc(ctx.bodyName(s.body)) : '–'}</b></div>
      <div class="row col"><span>Studie</span><div class="seg" role="radiogroup">${Object.entries(ART_LABELS).map(([a, l]) => `<button type="button" role="radio" data-cmd="ss-art" data-v="${a}" aria-checked="${art === a}">${esc(l)}</button>`).join('')}</div></div>
      <label class="row"><span>Werkstoff</span><select data-ss="mat">${Object.entries(SOLID_MATERIALS).map(([k, x]) => `<option value="${k}"${k === s.mat ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      ${s.mit.length ? `<div class="row col"><span>Weitere Körper (${s.mit.length})</span><div class="flist2">${mitZeilen}</div></div>` : ''}
      <div class="row col"><span>Netz</span><div class="seg" role="radiogroup">${Object.entries(MESH_SIZES).map(([k, [l]]) => `<button type="button" role="radio" data-cmd="ss-mesh" data-v="${k}" aria-checked="${s.mesh === k}">${esc(l)}</button>`).join('')}</div></div>
      ${art === 'modal' ? `<label class="row"><span>Anzahl Eigenformen</span><span class="num"><input type="number" min="1" max="12" step="1" data-ss="anzahl" value="${anzahl(s)}"></span></label>${s.mesh !== 'coarse' ? `<p class="info small">Modalfrequenzen brauchen viel länger als die statische Rechnung. Bei „Mittel“ oder „Fein“ dauert es Minuten – die Frequenzen werden dabei nicht besser.</p>` : ''}` : art === 'waerme' ? '' : `
      <div class="row col"><span>Lastfall</span><div class="btns">${fallKnöpfe}<button type="button" class="chip" data-cmd="ss-fall-neu" title="Neuer Lastfall (gleiche feste Flächen, eigene Lasten)">+</button>${s.faelle.length > 1 ? `<button type="button" class="chip" data-cmd="ss-umh" aria-pressed="${st.umh}" title="Alle Lastfälle: je Punkt der größte Wert, kleinster Sicherheitsfaktor und sein Lastfall">Umhüllende</button><button type="button" class="iconbtn" data-cmd="ss-fall-weg" title="Aktiven Lastfall löschen">${icon('close', 12)}</button>` : ''}</div></div>
      ${st.umh ? '' : `<label class="row chk"><input type="checkbox" data-ss="self"${s.selfWeight ? ' checked' : ''}> Eigengewicht (in −Z)</label>`}`}
      <div class="row col"><span>Werkzeug</span><div class="btns">${art === 'waerme' ? Object.entries(WTOOLS).map(([k, l]) => chip(k, l)).join('') : `${chip('fixed', 'Fest')}${art === 'modal' ? '' : chip('force', 'Kraft')}`}${chip('add', 'Körper hinzufügen')}${chip('body', 'Körper wählen')}</div></div>
      ${st.tool === 'force' ? `<label class="row"><span>Kraft</span><span class="num"><input type="number" min="0" step="100" data-ss="F" value="${st.F}"><em>N</em></span></label>
        <div class="row col"><span>Richtung</span><div class="seg" role="radiogroup">${Object.keys(DIRS).map(k => `<button type="button" role="radio" data-cmd="ss-dir" data-v="${k}" aria-checked="${st.dir === k}">${DIR_LABELS[k]}</button>`).join('')}</div></div>` : ''}
      ${art === 'waerme' ? warmWert : ''}
      <p class="info small">${esc(hint)}</p>
      <div class="row col"><span>${art === 'waerme' ? `Wärmebedingungen (${s.temps.length + s.fluxes.length + s.convs.length})` : art === 'modal' ? `Feste Flächen (${s.fixed.length})` : `Fest (${s.fixed.length}) · Kräfte (${s.loads.length})`}</span><div class="flist2">${art === 'waerme' ? bedZeilen : `${(art === 'modal' ? [] : s.loads).map((l, i) => `<div class="frow"><span>Kraft ${num(Math.hypot(...l.F), 0)} N</span><button type="button" class="iconbtn" data-cmd="ss-del" data-k="loads" data-i="${i}" title="Entfernen">${icon('close', 12)}</button></div>`).join('')}${s.fixed.map((x, i) => `<div class="frow"><span>Feste Fläche ${i + 1}</span><button type="button" class="iconbtn" data-cmd="ss-del" data-k="fixed" data-i="${i}" title="Entfernen">${icon('close', 12)}</button></div>`).join('')}`}</div></div>
      ${st.err ? `<p class="info warn">${esc(st.err)}</p>` : ''}
      ${st.busy != null ? `<p class="info ssbusy">rechnet … ${Math.round(st.busy * 100)} %</p>` : ''}
      ${r && r.T ? `<dl class="mres"><div><dt>Höchste Temperatur</dt><dd>${num(r.tmax, 1)} °C</dd></div><div><dt>Niedrigste Temperatur</dt><dd>${num(r.tmin, 1)} °C</dd></div><div><dt>Temperaturdifferenz</dt><dd>${num(r.tmax - r.tmin, 1)} K</dd></div><div><dt>Wärme an die Umgebung</dt><dd>${num(r.qConvSum, 2)} W</dd></div></dl>
         <table class="cuttab"><thead><tr><th>Bedingung</th><th>W in den Körper</th></tr></thead><tbody>${warmZeilen}</tbody></table>
         ${koerperBlock}
         <p class="info small"><span style="display:inline-block;width:120px;height:10px;border-radius:2px;vertical-align:middle;background:linear-gradient(90deg,#4073e6,#59c773,#facc40,#ed4538)"></span> ${num(r.tmin, 1)} … ${num(r.tmax, 1)} °C</p>
         <p class="info small">Bilanz: ${num(bilanz, 3)} W – zugeführte und abgeführte Wärme müssen sich aufrechnen, der Rest ist Reengenauigkeit. Wärmequellen im Volumen und Strahlung fehlen, Flächen ohne Bedingung sind adiabat. An Kanten und Ecken ist der Wärmestrom auf dem groben Würfenetz ungenauer – feineres Netz hilft. Zur Vorbemessung.</p>
         <p class="info small">Netz: ${num(r.elements, 0)} Würfel, Kante ${fmtLenU(r.grid.h, 2)}, ${num(r.iterations, 0)} Schritte, ${num(r.ms / 1000, 1)} s. Wärmeleitfähigkeit ${s.mit.length ? stoff('k', 1) : num((SOLID_MATERIALS[s.mat] || {}).k, 1)} W/(m·K), Wärmeübergang an die Umgebung nach Newton.</p>`
         : r && r.modes ? `<dl class="mres"><div><dt>Erste Eigenfrequenz</dt><dd>${num(r.modes[0].f, 2)} Hz</dd></div><div><dt>Größte Frequenz</dt><dd>${num(r.modes[r.modes.length - 1].f, 2)} Hz</dd></div><div><dt>Eigenformen</dt><dd>${r.modes.length}</dd></div></dl>
        <table class="cuttab"><thead><tr><th>Eigenform</th><th>Frequenz Hz</th><th>ω 1/s</th></tr></thead><tbody>${formZeilen}</tbody></table>
        ${koerperBlock}
        <p class="info small">Modalanalyse über ${r.modes.length} Eigenformen – gezeichnet ist Eigenform ${st.form + 1} (Zeile anklicken), größte Auslenkung ${fmtLenU(formScale, 1)}. Die Größe einer Eigenform ist beliebig, nur ihre Gestalt zählt. Gerechnet wird dieselbe Versteifung wie bei der statischen Spannung, freie Schwingung ohne Lasten, Massen aus der Werkstoffdichte. Zusatzmassen (Anbauteile, Bleche) fehlen – mit ihnen liegen die Frequenzen tiefer.</p>
        <p class="info small">Netz: ${num(r.elements, 0)} Würfel, Kante ${fmtLenU(r.grid.h, 2)}, ${num(r.iterations, 0)} Schritte, ${num(r.ms / 1000, 1)} s. Eine Biegung, die über wenige Elemente verläuft, ist zu steif – mehr Elemente über die Länge oder feineres Netz. Zur Vorbemessung.</p>`
        : r ? `<dl class="mres"><div><dt>Größte Vergleichsspannung</dt><dd>${num(r.smax, 1)} MPa</dd></div><div><dt>Sicherheitsfaktor</dt><dd><b style="color:${sfCol}">${num(sf, 2)}</b> (Streckgrenze ${s.mit.length ? stoff('fy', 0) : num(r.fy, 0)} MPa)</dd></div><div><dt>Größte Verschiebung</dt><dd>${fmtLenU(r.dmax, 3)}</dd></div>${r.umh ? `<div><dt>Maßgebender Lastfall</dt><dd>${esc(r.faelle[r.groK].name)}</dd></div>` : ''}</dl>
        ${r.umh ? `<table class="cuttab"><thead><tr><th>Lastfall</th><th>σ max MPa</th><th>SF</th><th>δ max</th></tr></thead><tbody>${fallZeilen}</tbody></table>` : ''}
        ${koerperBlock}
        <p class="info small"><span style="display:inline-block;width:120px;height:10px;border-radius:2px;vertical-align:middle;background:linear-gradient(90deg,#4073e6,#59c773,#facc40,#ed4538)"></span> 0 … ${num(r.smax, 0)} MPa (von Mises${r.umh ? ', Umhüllende' : ''})</p>
        <p class="info small">${r.umh ? `<p class="info small">Umhüllende über ${r.faelle.length} Lastfälle: die Fläche zeigt je Punkt den größten Wert aller Fälle, der Sicherheitsfaktor den kleinsten darüber; maßgebend für die größte Spannung ist ${esc(r.faelle[r.groK].name)}.</p>` : ''}
         <p class="info small">Netz: ${num(r.elements, 0)} Würfel, Kante ${fmtLenU(r.grid.h, 2)}, ${num(r.iterations, 0)} Schritte, ${num(r.ms / 1000, 1)} s. Linear elastisch; Spitzen an scharfen Innenkanten und am Rand der festen Fläche sind Rechenspitzen und wachsen mit feinerem Netz. Schräge und runde Flächen sind im Netz Treppen – dort ist die Spannung ungenauer. Zur Vorbemessung.</p>` : (st.res && !st.busy && !st.err ? '<p class="info">Einrichtung geändert – neu berechnen.</p>' : '')}
      </div><footer><button type="button" class="btn" data-cmd="ss-clear">Leeren</button><button type="button" class="btn" data-cmd="ss-run"${st.busy != null ? ' disabled' : ''}>Berechnen</button><button type="button" class="btn primary" data-cmd="ss-close">Schließen</button></footer>`;
    d.hidden = false;
    void m;
  }
  function onCmd(cmd, el) {
    const s = study();
    if (cmd === 'ss-close') return close();
    if (cmd === 'ss-run') return compute();
    if (cmd === 'ss-tool') { st.tool = el.dataset.v; return render(); }
    /* Studie wechseln: bei der Modalanalyse gibt es keine Lasten, das Werkzeug bleibt „Fest“; bei der Wärme gibt es
       keine Kräfte, dort beginnt es mit „Temperatur“ */
    if (cmd === 'ss-art') { const neu = ['modal', 'waerme'].includes(el.dataset.v) ? el.dataset.v : 'statisch'; if (neu === (s.art || 'statisch')) return; ctx.pushHistory(); s.art = neu; st.tool = neu === 'waerme' ? 'temp' : 'fixed'; st.form = 0; st.umh = false; ctx.store(); return render(); }
    if (cmd === 'ss-form') { st.form = Math.max(0, +el.dataset.i || 0); return render(); }
    if (cmd === 'ss-dir') { st.dir = el.dataset.v; return render(); }
    if (cmd === 'ss-mesh') { ctx.pushHistory(); s.mesh = el.dataset.v; ctx.store(); return render(); }
    if (cmd === 'ss-del') { ctx.pushHistory(); s[el.dataset.k].splice(+el.dataset.i, 1); ctx.store(); return render(); }
    if (cmd === 'ss-clear') { ctx.pushHistory(); clearAll(s); s.faelle = null; s.fall = 0; s.selfWeight = false; ctx.store(); st.umh = false; return render(); }
    /* Lastfälle: umgeschaltet wird nur für die Bearbeitung – die Umhüllende rechnet immer alle */
    if (cmd === 'ss-fall') { st.umh = false; fallWahl(s, +el.dataset.i || 0); return render(); }
    if (cmd === 'ss-fall-neu') { ctx.pushHistory(); s.faelle.push({ name: `Lastfall ${s.faelle.length + 1}`, loads: [], selfWeight: false }); st.umh = false; fallWahl(s, s.faelle.length - 1); ctx.store(); return render(); }
    if (cmd === 'ss-fall-weg') { if (s.faelle.length < 2) return; ctx.pushHistory(); s.faelle.splice(s.fall, 1); s.faelle.forEach((f, i) => { if (/^Lastfall \d+$/.test(f.name)) f.name = `Lastfall ${i + 1}`; }); st.umh = false; fallWahl(s, Math.min(s.fall, s.faelle.length - 1)); ctx.store(); return render(); }
    if (cmd === 'ss-umh') { st.umh = !st.umh; return render(); }
  }
  function onInput(t) {
    const s = study();
    const zahl = t => Number(String(t.value).replace(',', '.'));
    if (t.dataset.ss === 'mat') { ctx.pushHistory(); s.mat = t.value; ctx.store(); render(); }
    if (t.dataset.ss === 'matmit') { const j = +t.dataset.i; if (s.mit[j] && SOLID_MATERIALS[t.value]) { ctx.pushHistory(); s.mit[j].mat = t.value; ctx.store(); render(); } }
    if (t.dataset.ss === 'self') { ctx.pushHistory(); s.selfWeight = t.checked; ctx.store(); render(); }
    if (t.dataset.ss === 'F') st.F = Math.max(0, Number(String(t.value).replace(',', '.')) || 0);
    /* Werte der Wärme-Werkzeuge: Vorgaben für die nächste angeklickte Fläche, nicht Teil der Datei */
    if (t.dataset.ss === 'T') st.T = isFinite(zahl(t)) ? zahl(t) : st.T;
    if (t.dataset.ss === 'Q') st.Q = Math.max(0, isFinite(zahl(t)) ? zahl(t) : st.Q);
    if (t.dataset.ss === 'hc') st.hc = Math.max(0, isFinite(zahl(t)) ? zahl(t) : st.hc);
    if (t.dataset.ss === 'Tamb') st.Tamb = isFinite(zahl(t)) ? zahl(t) : st.Tamb;
    if (t.dataset.ss === 'anzahl') { ctx.pushHistory(); s.anzahl = anzahl({ anzahl: Number(String(t.value).replace(',', '.')) }); ctx.store(); render(); }
  }
  return { openSolidSim: open, closeSolidSim: close, solidSimPick: pick, renderSolidSim: render, solidSimCmd: onCmd, solidSimInput: onInput, get solidSimResult() { return st.res && st.resKey === setupKey() ? st.res : null; }, get solidSimModes() { const r = st.res && st.resKey === setupKey() ? st.res : null; return r && r.modes ? r.modes : null; }, get solidSimForm() { return st.form; }, get solidSimBusy() { return st.busy != null; } };
}
