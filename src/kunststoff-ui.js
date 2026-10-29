// cantcodecad – Kunststoffregel: Werkstoff, Wanddicke, Formschräge, Radius und Spiel für
// Kunststoffteile. Die Werte stehen als Parameter im Dokument (kst_wand, kst_schraege, kst_radius, kst_spiel); neue
// Schalen, Zapfen, Schnappverschlüsse, Lippen, Formschrägen und Rundungen bekommen Ausdrücke darauf – ändert man die
// Regel, ziehen alle Features nach (über die normale Parameterrechnung).
import { icon } from './icons.js';
import { uid } from './doc.js';
import { evalExpr, paramValues, paramUmgebung } from './params.js';

/* Startwerte je Werkstoff (Richtwerte: Spritzguss ABS/Nylon, 3D-Druck PLA/PETG/TPU) */
export const KST_WERKSTOFFE = {
  abs: { wand: 2, schraege: 1, radius: 0.5, spiel: 0.1 },
  nylon: { wand: 2, schraege: 0.5, radius: 0.5, spiel: 0.1 },
  pla: { wand: 1.6, schraege: 0, radius: 0.5, spiel: 0.2 },
  petg: { wand: 1.6, schraege: 0, radius: 0.5, spiel: 0.25 },
  tpu: { wand: 2, schraege: 0, radius: 1, spiel: 0.3 }
};
const FELDER = [['wand', 'Wanddicke', 'mm'], ['schraege', 'Formschräge', '°'], ['radius', 'Rundungsradius', 'mm'], ['spiel', 'Spiel (Lippe/Absatz)', 'mm']];
const PARAM = k => 'kst_' + k;

export function setupKunststoff(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a);
  let entwurf = null;

  const param = k => (ctx.doc.params || []).find(p => p.name === PARAM(k));
  const aktiv = () => !!param('wand');
  const werte = () => paramValues(ctx.doc.params || []).vals;

  function oeffne() {
    const w = werte(), mat = (ctx.doc.kunststoff && ctx.doc.kunststoff.material) || 'abs';
    entwurf = { material: mat, zuweisen: true, ...Object.fromEntries(FELDER.map(([k]) => [k, param(k) ? w[PARAM(k)] : KST_WERKSTOFFE[mat][k]])) };
    zeichne();
    ctx.setMode('filedlg');
  }
  function zeichne() {
    const d = $('#dialog'), e = entwurf;
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('shell', 20)}<b class="dtitle">Kunststoffregel</b></header><div class="dbody">
      <label class="row"><span>Werkstoff</span><select data-kst="material">${Object.keys(KST_WERKSTOFFE).map(k => `<option value="${k}"${k === e.material ? ' selected' : ''}>${esc(ctx.materialName(k))}</option>`).join('')}</select></label>
      ${FELDER.map(([k, l, u]) => `<label class="row"><span>${l}</span><span class="num"><input type="number" step="${u === '°' ? 0.5 : 0.1}" min="0" data-kst="${k}" value="${e[k]}"><em>${u}</em></span></label>`).join('')}
      <label class="check"><input type="checkbox" data-kst="zuweisen"${e.zuweisen ? ' checked' : ''}> Werkstoff allen Körpern zuweisen</label>
      <p class="info small">Kunststoffregeln: die Werte stehen als Parameter kst_wand, kst_schraege, kst_radius, kst_spiel im Dokument. Neue Schalen, Zapfen, Schnappverschlüsse, Lippen, Formschrägen und Rundungen übernehmen sie verknüpft – eine Änderung der Regel passt alle an. Werkstoffwechsel setzt die Startwerte des Werkstoffs.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="kst-ok">OK</button><button type="button" class="btn" data-cmd="file-cancel">Abbrechen</button></footer>`;
    d.hidden = false;
  }
  function eingabe(t) {
    if (!entwurf || !t.dataset.kst) return;
    const k = t.dataset.kst;
    if (k === 'material') { entwurf.material = t.value; Object.assign(entwurf, KST_WERKSTOFFE[t.value] || {}); zeichne(); return; }
    if (k === 'zuweisen') { entwurf.zuweisen = t.checked; return; }
    const v = Number(String(t.value).replace(',', '.'));
    if (Number.isFinite(v) && v >= 0) entwurf[k] = v;
  }
  async function ok() {
    if (!entwurf) return;
    if (!(entwurf.wand > 0)) { ctx.toast('Die Wanddicke muss größer als 0 sein.'); return; }
    ctx.pushHistory();
    const d = ctx.doc;
    if (!Array.isArray(d.params)) d.params = [];
    for (const [k, l] of FELDER) {
      const p = param(k), expr = String(Math.round(entwurf[k] * 1e6) / 1e6);
      if (p) p.expr = expr; else d.params.push({ id: uid(), name: PARAM(k), expr, comment: `Kunststoffregel: ${l}` });
    }
    d.kunststoff = { material: entwurf.material };
    if (entwurf.zuweisen) for (const id of (ctx.lastBuild && ctx.lastBuild.bodies) || []) { if (!d.bodies[id]) d.bodies[id] = {}; d.bodies[id].material = entwurf.material; }
    entwurf = null;
    ctx.closeFileDialog();
    const { bad } = await ctx.applyParams();
    ctx.store(); ctx.renderAll(); ctx.scheduleBuild(0);
    ctx.toast(bad.length ? `Kunststoffregel gespeichert – nicht übernommen: ${bad.slice(0, 2).join(' · ')}` : 'Kunststoffregel gespeichert. Verknüpfte Features passen sich an.');
  }

  /* Startwerte eines neuen Features aus der Regel (als Ausdruck, damit Änderungen der Regel durchschlagen) */
  function vorgaben(f) {
    if (!aktiv()) return;
    // mit Größe, damit z. B. ein Winkel-Parameter in sin(...) ein Winkel bleibt
    const env = paramUmgebung(ctx.doc.params || []);
    const setz = (k, e, nurPositiv = false) => {
      let v;
      try { v = evalExpr(e, env); } catch (_) { return; }
      if (!Number.isFinite(v) || (nurPositiv && !(v > 0))) return;
      f[k] = v;
      f.exprs = { ...(f.exprs || {}), [k]: { e, v } };
    };
    if (f.type === 'shell') setz('thickness', 'kst_wand', true);
    if (f.type === 'boss') { setz('draft', 'kst_schraege'); setz('rt', '0.6 * kst_wand', true); }
    if (f.type === 'snapfit') setz('t', 'kst_wand', true);
    if (f.type === 'lippe') { setz('w', 'kst_wand / 2', true); setz('h', 'kst_wand', true); setz('spiel', 'kst_spiel'); }
    if (f.type === 'draft') setz('angle', 'kst_schraege', true);
    if (f.type === 'fillet') setz('radius', 'kst_radius', true);
  }

  return { oeffneKunststoffRegel: oeffne, kunststoffEingabe: eingabe, kunststoffOk: ok, kunststoffVorgaben: vorgaben };
}
