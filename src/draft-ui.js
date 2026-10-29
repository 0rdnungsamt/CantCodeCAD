// cantcodecad – Verjüngungs-Analyse: färbt die Flächen nach ihrer
// Formschräge zur Zugrichtung. Grün = genug Schräge, gelb = zu wenig (Wand fast parallel zur Zugrichtung),
// rot = Hinterschnitt (nur einseitig). Nur Anzeige, das Modell bleibt unverändert.
import { icon } from './icons.js';
import { NUM_LOCALE } from './i18n.js';

export const PULL_DIRS = { 'z+': [0, 0, 1], 'z-': [0, 0, -1], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'x+': [1, 0, 0], 'x-': [-1, 0, 0] };
const DIR_LABELS = { 'z+': '+Z', 'z-': '−Z', 'y+': '+Y', 'y-': '−Y', 'x+': '+X', 'x-': '−X' };

/* Einstufung einer Normalen: Formschräge α = asin(n·d); einseitig: ok ≥ min, Hinterschnitt ≤ −min, sonst zu wenig */
export function draftClass(n, d, minDeg, two) {
  const s = n[0] * d[0] + n[1] * d[1] + n[2] * d[2], lim = Math.sin(minDeg * Math.PI / 180) - 1e-9;
  if (two) return Math.abs(s) >= lim ? 'ok' : 'low';
  return s >= lim ? 'ok' : s <= -lim ? 'under' : 'low';
}

/* Flächenanteile je Klasse aus dem Anzeigenetz (Dreiecksnormalen) */
export function draftStats(mesh, d, minDeg, two) {
  const P = mesh.positions, I = mesh.index, out = { ok: 0, low: 0, under: 0, total: 0 };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    out[draftClass([nx / l, ny / l, nz / l], d, minDeg, two)] += l / 2;
    out.total += l / 2;
  }
  return out;
}

/* Mindestradius: gekrümmte Flächen mit Radius (Zylinder, Kugel, Torus-Rundung) unter der Grenze */
export function minRadiusStats(mesh, lim) {
  const curved = (mesh.faces || []).filter(f => f.radius != null), below = curved.filter(f => f.radius < lim);
  return { curved: curved.length, below: below.length, minR: curved.length ? Math.min(...curved.map(f => f.radius)) : null };
}
/* Krümmung je Eckpunkt des Anzeigenetzes: größtes |Δn| / |Δp| über die Dreieckskanten. Die Netznormalen sind die
   exakten Flächennormalen, damit gibt jede Sehne auf Kugel und Zylinder (quer) genau 1/R, Ebenen 0. */
export function curvatureMap(mesh) {
  const P = mesh.positions, N = mesh.normals, I = mesh.index, k = new Float32Array(P.length / 3);
  const edge = (a, b) => {
    const dp = Math.hypot(P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]);
    if (dp < 1e-9) return;
    const v = Math.hypot(N[3 * b] - N[3 * a], N[3 * b + 1] - N[3 * a + 1], N[3 * b + 2] - N[3 * a + 2]) / dp;
    if (v > k[a]) k[a] = v;
    if (v > k[b]) k[b] = v;
  };
  for (let t = 0; t < I.length; t += 3) { edge(I[t], I[t + 1]); edge(I[t + 1], I[t + 2]); edge(I[t + 2], I[t]); }
  let max = 0;
  for (let i = 0; i < k.length; i++) if (k[i] > max) max = k[i];
  return { k, max };
}
/* Zugänglichkeit: erreicht ein Werkzeug die Fläche geradlinig aus Richtung d?
   Zugänglich = die Fläche zeigt zu d (n·d > 0,01) und der Strahl von ihr in Richtung d trifft nichts. Das Anzeigenetz
   wird fein unterteilt (Kante ≤ h), jedes Teildreieck nach seinem Schwerpunkt eingestuft – so liegt die Grenze auch in
   großen Flächen scharf. Strahltests über ein Raster in der Ebene senkrecht zu d (Dreiecke nach ihrer Projektion).
   Ergebnis: Dreiecke ohne Index mit Farben (Überlagerung) und die Flächen in mm². */
export function zugaenglichkeit(mesh, d, h) {
  const P = mesh.positions, I = mesh.index, N = mesh.normals;
  const nd = Math.hypot(d[0], d[1], d[2]), D = [d[0] / nd, d[1] / nd, d[2] / nd];
  // Basis der Ebene senkrecht zu d
  const a0 = Math.abs(D[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const U = [D[1] * a0[2] - D[2] * a0[1], D[2] * a0[0] - D[0] * a0[2], D[0] * a0[1] - D[1] * a0[0]], lu = Math.hypot(...U);
  U[0] /= lu; U[1] /= lu; U[2] /= lu;
  const Vv = [D[1] * U[2] - D[2] * U[1], D[2] * U[0] - D[0] * U[2], D[0] * U[1] - D[1] * U[0]];
  const pu = i => P[3 * i] * U[0] + P[3 * i + 1] * U[1] + P[3 * i + 2] * U[2], pv = i => P[3 * i] * Vv[0] + P[3 * i + 1] * Vv[1] + P[3 * i + 2] * Vv[2];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < P.length / 3; i++) { const u = pu(i), v = pv(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const nT = I.length / 3, G = Math.max(8, Math.min(256, Math.round(Math.sqrt(nT) * 1.5)));
  const cu = (u1 - u0) / G || 1, cv = (v1 - v0) / G || 1, zellen = Array.from({ length: G * G }, () => []);
  for (let t = 0; t < nT; t++) {
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
    const iu0 = Math.max(0, Math.floor((Math.min(pu(a), pu(b), pu(c)) - u0) / cu)), iu1 = Math.min(G - 1, Math.floor((Math.max(pu(a), pu(b), pu(c)) - u0) / cu));
    const iv0 = Math.max(0, Math.floor((Math.min(pv(a), pv(b), pv(c)) - v0) / cv)), iv1 = Math.min(G - 1, Math.floor((Math.max(pv(a), pv(b), pv(c)) - v0) / cv));
    for (let iv = iv0; iv <= iv1; iv++) for (let iu = iu0; iu <= iu1; iu++) zellen[iv * G + iu].push(t);
  }
  const groesse = Math.max(u1 - u0, v1 - v0, 1), eps = 1e-6 * groesse;
  // Strahl ab q in Richtung D: trifft er ein Dreieck (t > eps)? (Möller–Trumbore)
  const verdeckt = q => {
    const iu = Math.min(G - 1, Math.max(0, Math.floor((q[0] * U[0] + q[1] * U[1] + q[2] * U[2] - u0) / cu)));
    const iv = Math.min(G - 1, Math.max(0, Math.floor((q[0] * Vv[0] + q[1] * Vv[1] + q[2] * Vv[2] - v0) / cv)));
    for (const t of zellen[iv * G + iu]) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const pv2 = [D[1] * e2[2] - D[2] * e2[1], D[2] * e2[0] - D[0] * e2[2], D[0] * e2[1] - D[1] * e2[0]];
      const det = e1[0] * pv2[0] + e1[1] * pv2[1] + e1[2] * pv2[2];
      if (Math.abs(det) < 1e-14) continue;
      const tv = [q[0] - P[a], q[1] - P[a + 1], q[2] - P[a + 2]], inv = 1 / det;
      const uu = (tv[0] * pv2[0] + tv[1] * pv2[1] + tv[2] * pv2[2]) * inv;
      if (uu < -1e-9 || uu > 1 + 1e-9) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
      const vv = (D[0] * qv[0] + D[1] * qv[1] + D[2] * qv[2]) * inv;
      if (vv < -1e-9 || uu + vv > 1 + 1e-9) continue;
      if ((e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv > eps) return true;
    }
    return false;
  };
  const pos = [], col = [], GRUEN = [0.35, 0.78, 0.45], ROT = [0.93, 0.27, 0.22];
  let frei = 0, nicht = 0;
  for (let t = 0; t < nT; t++) {
    const ia = I[3 * t], ib = I[3 * t + 1], ic = I[3 * t + 2];
    const A = [P[3 * ia], P[3 * ia + 1], P[3 * ia + 2]], B = [P[3 * ib], P[3 * ib + 1], P[3 * ib + 2]], C = [P[3 * ic], P[3 * ic + 1], P[3 * ic + 2]];
    // Flächennormale des Dreiecks (Netznormalen gemittelt – auf gekrümmten Flächen genauer als das Kreuzprodukt)
    const n = [0, 1, 2].map(k => N[3 * ia + k] + N[3 * ib + k] + N[3 * ic + k]), ln = Math.hypot(...n) || 1;
    const zu = (n[0] * D[0] + n[1] * D[1] + n[2] * D[2]) / ln > 0.01;
    const L = Math.max(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]), Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]));
    const k = Math.max(1, Math.min(60, Math.ceil(L / h)));
    const punkt = (i, j) => [0, 1, 2].map(q => A[q] + (B[q] - A[q]) * i / k + (C[q] - A[q]) * j / k);
    const teil = (p1, p2, p3) => {
      const s = [(p1[0] + p2[0] + p3[0]) / 3, (p1[1] + p2[1] + p3[1]) / 3, (p1[2] + p2[2] + p3[2]) / 3];
      const ok = zu && !verdeckt([s[0] + D[0] * eps * 10, s[1] + D[1] * eps * 10, s[2] + D[2] * eps * 10]);
      const fl = Math.hypot((p2[1] - p1[1]) * (p3[2] - p1[2]) - (p2[2] - p1[2]) * (p3[1] - p1[1]), (p2[2] - p1[2]) * (p3[0] - p1[0]) - (p2[0] - p1[0]) * (p3[2] - p1[2]), (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0])) / 2;
      if (ok) frei += fl; else nicht += fl;
      const c = ok ? GRUEN : ROT;
      pos.push(...p1, ...p2, ...p3); col.push(...c, ...c, ...c);
    };
    for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) {
      teil(punkt(i, j), punkt(i + 1, j), punkt(i, j + 1));
      if (i + j < k - 1) teil(punkt(i + 1, j), punkt(i + 1, j + 1), punkt(i, j + 1));
    }
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col), frei, nicht };
}

export function setupDraftAnalysis(ctx) {
  const $ = s => document.querySelector(s);
  const st = { dir: 'z+', min: 1, two: false, kind: 'draft', lim: 1, rRed: 5 };
  const fmt = (v, d) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString(NUM_LOCALE);
  function apply() { ctx.vp.setDraftAnalysis({ dir: PULL_DIRS[st.dir], min: st.min, two: st.two }); }
  function renderMinRad(m) {
    ctx.vp.setMinRadius({ lim: st.lim });
    const s = minRadiusStats(m, st.lim), d = $('#dialog');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('draftan', 20)}<b class="dtitle">Mindestradius</b></header><div class="dbody">
      <label class="row"><span>Grenze</span><span class="num"><input type="number" step="0.5" min="0" data-mr="lim" value="${st.lim}"><em>mm</em></span></label>
      <div class="ohsum"><span><i class="sw red"></i>Radius kleiner</span><b>${s.below} Fläche${s.below === 1 ? '' : 'n'}</b>
        <span><i class="sw green"></i>Radius ausreichend</span><b>${s.curved - s.below} Fläche${s.curved - s.below === 1 ? '' : 'n'}</b>
        <span>kleinster Radius</span><b>${s.minR == null ? '–' : fmt(s.minR, 3) + ' mm'}</b></div>
      <p class="info small">Mindestradius-Analyse: gekrümmte Flächen (Zylinder, Kugeln, Rundungen) mit kleinerem Radius als die Grenze sind rot – z. B. Innenradien, die ein Fräser nicht schafft, oder Rundungen unter dem Mindestmaß.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="draftan-close">Schließen</button></footer>`;
    d.hidden = false;
  }
  function renderCurv(m) {
    const c = curvatureMap(m);
    ctx.vp.setMinRadius({ k: c.k, kRed: 1 / st.rRed });
    const d = $('#dialog');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('draftan', 20)}<b class="dtitle">Krümmungs-Map</b></header><div class="dbody">
      <label class="row"><span>Rot ab Radius</span><span class="num"><input type="number" step="0.5" min="0.1" data-cm="rRed" value="${st.rRed}"><em>mm</em></span></label>
      <div class="ohsum"><span><i class="sw blue"></i>eben</span><b>0</b>
        <span><i class="sw red"></i>stark gekrümmt</span><b>R ≤ ${fmt(st.rRed, 3)} mm</b>
        <span>stärkste Krümmung</span><b>${c.max > 1e-9 ? fmt(c.max, 4) + ' 1/mm (R ' + fmt(1 / c.max, 3) + ' mm)' : '–'}</b></div>
      <p class="info small">Krümmungs-Map: Farbe nach der größten Krümmung an jeder Stelle, von blau (eben) über grün und gelb bis rot (Radius gleich oder kleiner als die Grenze). Sprünge der Farbe an einer Kante zeigen einen Krümmungssprung, auch wo der Übergang tangential ist.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="draftan-close">Schließen</button></footer>`;
    d.hidden = false;
  }
  function renderZugang(m) {
    const bb = m.bbox, gr = bb ? Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) : 100;
    const z = zugaenglichkeit(m, PULL_DIRS[st.dir], Math.max(0.05, gr / 150));
    ctx.vp.setResultMesh({ positions: z.positions, colors: z.colors });
    st.zugang = { frei: z.frei, nicht: z.nicht };
    const d = $('#dialog'), ges = z.frei + z.nicht, pc = v => (ges ? fmt(v / ges * 100, 1) : '0');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('draftan', 20)}<b class="dtitle">Zugänglichkeit</b></header><div class="dbody">
      <label class="row"><span>Richtung</span><select data-da="dir">${Object.keys(PULL_DIRS).map(k => `<option value="${k}"${k === st.dir ? ' selected' : ''}>${DIR_LABELS[k]}</option>`).join('')}</select></label>
      <div class="ohsum"><span><i class="sw green"></i>zugänglich</span><b>${fmt(z.frei, 0)} mm² (${pc(z.frei)} %)</b>
        <span><i class="sw red"></i>nicht zugänglich</span><b>${fmt(z.nicht, 0)} mm² (${pc(z.nicht)} %)</b></div>
      <p class="info small">Zugänglichkeitsanalyse: grün, wo ein Werkzeug die Fläche geradlinig aus der Richtung erreicht (z. B. Fräser von oben, Sicht, Lackierpistole); rot, wo die Fläche wegzeigt, senkrecht zur Richtung steht oder vom Teil selbst verdeckt wird.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="draftan-close">Schließen</button></footer>`;
    d.hidden = false;
  }
  function render() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh;
    if (!m) { close(); return; }
    if (st.kind === 'access') { renderZugang(m); return; }
    if (st.kind === 'minrad') { renderMinRad(m); return; }
    if (st.kind === 'curv') { renderCurv(m); return; }
    apply();
    const s = draftStats(m, PULL_DIRS[st.dir], st.min, st.two), pc = v => (s.total ? fmt(v / s.total * 100, 1) : '0');
    const d = $('#dialog');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('draftan', 20)}<b class="dtitle">Verjüngungs-Analyse</b></header><div class="dbody">
      <label class="row"><span>Zugrichtung</span><select data-da="dir">${Object.keys(PULL_DIRS).map(k => `<option value="${k}"${k === st.dir ? ' selected' : ''}>${DIR_LABELS[k]}</option>`).join('')}</select></label>
      <label class="row"><span>Mindestschräge</span><span class="num"><input type="number" step="0.5" min="0" max="45" data-da="min" value="${st.min}"><em>°</em></span></label>
      <label class="row"><span>Trennebene</span><select data-da="two"><option value="0"${st.two ? '' : ' selected'}>einseitig</option><option value="1"${st.two ? ' selected' : ''}>beidseitig</option></select></label>
      <div class="ohsum"><span><i class="sw green"></i>Schräge ausreichend</span><b>${fmt(s.ok, 0)} mm² (${pc(s.ok)} %)</b>
        <span><i class="sw yellow"></i>zu wenig Schräge</span><b>${fmt(s.low, 0)} mm² (${pc(s.low)} %)</b>
        ${st.two ? '' : `<span><i class="sw red"></i>Hinterschnitt</span><b>${fmt(s.under, 0)} mm² (${pc(s.under)} %)</b>`}</div>
      <p class="info small">Einseitig: die Form öffnet in Zugrichtung; beidseitig: zwei Formhälften mit Trennebene. Formschräge = Winkel zwischen Fläche und Zugrichtung. Gelb: Wände, die steiler als die Mindestschräge stehen – hier hilft „Formschräge“. ${st.two ? 'Beidseitig: Flächen dürfen zu beiden Formhälften zeigen.' : 'Rot: Flächen zeigen gegen die Zugrichtung und halten das Teil in der Form fest.'}</p>
      </div><footer><button type="button" class="btn primary" data-cmd="draftan-close">Schließen</button></footer>`;
    d.hidden = false;
  }
  function open(kind = 'draft') {
    if (!ctx.lastBuild || !ctx.lastBuild.mesh) { ctx.toast('Es gibt keinen sichtbaren Körper.'); return; }
    st.kind = kind;
    ctx.setMode('draftan');
    render();
  }
  function close() { ctx.vp.setDraftAnalysis(null); ctx.vp.setResultMesh(null); ctx.closeDialog(); ctx.setMode('model'); }
  $('#dialog').addEventListener('change', e => {
    const t = e.target;
    if (ctx.mode === 'draftan' && t.dataset.cm === 'rRed') { const v = Number(String(t.value).replace(',', '.')); if (v > 0) st.rRed = v; render(); return; }
    if (ctx.mode === 'draftan' && t.dataset.mr === 'lim') { const v = Number(String(t.value).replace(',', '.')); if (v >= 0) st.lim = v; render(); return; }
    if (ctx.mode !== 'draftan' || !t.dataset.da) return;
    if (t.dataset.da === 'dir') st.dir = t.value;
    if (t.dataset.da === 'two') st.two = t.value === '1';
    if (t.dataset.da === 'min') { const v = Number(String(t.value).replace(',', '.')); if (v >= 0 && v <= 45) st.min = v; }
    render();
  });
  return { openDraftAnalysis: open, closeDraftAnalysis: close, renderDraftAnalysis: render, draftState: st };
}
