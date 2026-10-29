// cantcodecad – Baugruppe → Bewegung → „Bewegungsstudie“: Gelenke nach einem Zeitplan bewegen. Je Gelenk und
// Freiheitsgrad eine Spur mit Stützstellen (Zeit in % → Wert), dazwischen linear. Die Bilder werden einmal mit den Werten
// der Schritte gebaut (das Dokument bleibt unverändert) und dann flüssig abgespielt; „Kollision prüfen“ rechnet je Schritt
// die Überschneidungen (wie Prüfen → Kollision) und markiert die betroffenen Schritte.
// Studie im Dokument: doc.bewegung = { schritte, dauer, spuren: [{ joint, feld: 'angle'|'offset'|'u'|'v', punkte: [{ t, v }] }] }
import { icon } from './icons.js';

/* bewegliche Freiheitsgrade je Gelenkart (Kern: Winkel um die Achse, Versatz entlang, u/v in der Ebene) */
export const FELDER = { revolute: ['angle'], slider: ['offset'], cylindrical: ['angle', 'offset'], pinslot: ['angle', 'u'], planar: ['u', 'v', 'angle'], ball: ['angle'] };
export const FELD_NAME = { angle: 'Winkel', offset: 'Versatz', u: 'Verschiebung u', v: 'Verschiebung v' };
export const EINHEIT = { angle: '°', offset: 'mm', u: 'mm', v: 'mm' };
const ART = { revolute: 'Drehgelenk', slider: 'Schieber', cylindrical: 'Zylindrisch', pinslot: 'Stift-Nut', planar: 'Planar', ball: 'Kugel' };

/* Wert einer Spur zur Zeit t (%): linear zwischen den Stützstellen, davor/danach der erste/letzte Wert */
export function spurWert(punkte, t) {
  const P = punkte.slice().sort((a, b) => a.t - b.t);
  if (!P.length) return 0;
  if (t <= P[0].t) return P[0].v;
  for (let i = 1; i < P.length; i++) if (t <= P[i].t) { const a = P[i - 1], b = P[i], f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1; return a.v + (b.v - a.v) * f; }
  return P[P.length - 1].v;
}

export function setupMotion(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a), fmt = (...a) => ctx.fmt(...a);
  const st = { pos: 0, bilder: [], kollision: null, laeuft: null, spielt: false, fehler: '', schluessel: '', kw: [], halt: [] };

  const gelenke = () => ctx.doc.features.filter(f => f.type === 'joint' && FELDER[f.kind] && !f.suppressed);
  function studie() {
    if (!ctx.doc.bewegung || typeof ctx.doc.bewegung !== 'object') ctx.doc.bewegung = { schritte: 31, dauer: 3, spuren: [] };
    const b = ctx.doc.bewegung;
    if (!(b.schritte >= 2)) b.schritte = 31;
    if (!(b.dauer > 0)) b.dauer = 3;
    if (!Array.isArray(b.spuren)) b.spuren = [];
    const ids = new Set(gelenke().map(f => f.id));
    b.spuren = b.spuren.filter(s => ids.has(s.joint) && Array.isArray(s.punkte));
    return b;
  }
  const spur = (jid, feld) => studie().spuren.find(s => s.joint === jid && s.feld === feld);
  const zeitVon = k => (100 * k) / (studie().schritte - 1);
  /* Gelenkwerte zu einer Zeit: Spurwert, sonst der Wert im Gelenk */
  function werte(t) {
    const o = {};
    studie().spuren.forEach(s => { (o[s.joint] = o[s.joint] || {})[s.feld] = spurWert(s.punkte, t); });
    return o;
  }
  function features(t) {
    const w = werte(t);
    return ctx.doc.features.map(f => (w[f.id] ? { ...f, ...w[f.id] } : f));
  }
  /* Bilder gehören zu Studie und Dokument – ändert sich eins, sind sie ungültig */
  const schluessel = () => JSON.stringify([studie(), ctx.doc.features, ctx.doc.kontakt || null]);
  function pruefeSchluessel() {
    const k = schluessel();
    if (k !== st.schluessel) { st.schluessel = k; st.bilder = []; st.kollision = null; st.kw = []; st.halt = []; }
  }
  /* Kontaktsätze: Schritt für Schritt – jedes Gelenk bewegt sich vom (ggf. angehaltenen) Wert des vorigen Schritts zum
     Wert der Spur und hält an der ersten Berührung an. Ohne Kontakt sind das die Spurwerte. */
  async function werteSchritt(k) {
    if (!ctx.kontakt || !ctx.kontakt.aktiv()) return werte(zeitVon(k));
    for (let i = st.kw.length; i <= k; i++) {
      const roh = werte(zeitVon(i));
      if (i === 0) { st.kw[0] = roh; continue; }
      const stand = JSON.parse(JSON.stringify(st.kw[i - 1]));
      for (const [jid, felder] of Object.entries(roh)) {
        const f = ctx.doc.features.find(x => x.id === jid);
        if (!f) continue;
        const basis = ctx.doc.features.map(x => (stand[x.id] ? { ...x, ...stand[x.id] } : x));
        const spanne = Object.fromEntries(Object.entries(felder).map(([feld, v]) => [feld, [(stand[jid] || {})[feld] ?? v, v]]));
        const r = await ctx.kontakt.begrenze({ ...f, ...(stand[jid] || {}) }, spanne, basis);
        stand[jid] = { ...(stand[jid] || {}), ...(r ? r.werte : felder) };
        if (r) st.halt[i] = r.paar;
      }
      st.kw[i] = stand;
    }
    return st.kw[k];
  }
  async function featuresSchritt(k) {
    const w = await werteSchritt(k);
    return ctx.doc.features.map(f => (w[f.id] ? { ...f, ...w[f.id] } : f));
  }

  async function bild(k) {
    pruefeSchluessel();
    if (st.bilder[k]) return st.bilder[k];
    const res = await ctx.kernel.build(await featuresSchritt(k), undefined, ctx.kctx());
    if (!res || !res.mesh) throw new Error('Schritt ließ sich nicht bauen');
    const fehl = Object.values(res.status || {}).find(s => !s.ok);
    st.bilder[k] = { mesh: res.mesh, fehler: fehl ? fehl.error : null };
    return st.bilder[k];
  }
  async function zeige(k) {
    const b = await bild(k);
    if (ctx.mode !== 'motion') return;
    ctx.vp.setModel(b.mesh);
    ctx.vp.setBodyColors(ctx.bodyColorMap());
    const kol = st.kollision && st.kollision[k];
    ctx.vp.setMarkMeshes(kol && kol.hits.length ? kol.hits.map(h => ({ positions: h.positions, index: h.index })) : null);
  }

  function open() {
    if (!gelenke().length) { ctx.toast('Für eine Bewegungsstudie braucht es ein bewegliches Gelenk (Drehgelenk, Schieber …).'); return; }
    studie();
    ctx.closeDialog();
    ctx.setMode('motion');
    st.pos = 0; st.fehler = ''; st.spielt = false;
    render();
    zeige(0).catch(err => { st.fehler = err.message; render(); });
  }
  function close() {
    st.spielt = false; st.laeuft = null;
    ctx.vp.setMarkMeshes(null);
    ctx.closeDialog();
    ctx.setMode('model');
    ctx.scheduleBuild(0);
  }

  function render() {
    if (ctx.mode !== 'motion') return;
    const s = studie(), d = $('#dialog'), n = s.schritte, k = Math.round(st.pos * (n - 1) / 100), w = werte(zeitVon(k));
    const zeilen = gelenke().map(f => FELDER[f.kind].map(feld => {
      const sp = spur(f.id, feld);
      const kopf = `<label class="check"><input type="checkbox" data-mot-spur="${f.id}" data-feld="${feld}"${sp ? ' checked' : ''}> ${esc(f.name)} · ${FELD_NAME[feld]} <em>${ART[f.kind]}</em></label>`;
      if (!sp) return `<div class="motspur">${kopf}</div>`;
      const pk = sp.punkte.map((p, i) => `<div class="motpkt"><span class="num"><input type="number" step="5" min="0" max="100" data-mot="t" data-j="${f.id}" data-feld="${feld}" data-i="${i}" value="${p.t}"><em>%</em></span><span class="num"><input type="number" step="1" data-mot="v" data-j="${f.id}" data-feld="${feld}" data-i="${i}" value="${p.v}"><em>${EINHEIT[feld]}</em></span>${sp.punkte.length > 2 ? `<button type="button" class="chip gdx" data-cmd="mot-weg" data-j="${f.id}" data-feld="${feld}" data-i="${i}" title="Stützstelle entfernen">×</button>` : ''}</div>`).join('');
      return `<div class="motspur">${kopf}${pk}<button type="button" class="chip" data-cmd="mot-punkt" data-j="${f.id}" data-feld="${feld}">+ Stützstelle</button><span class="small"> jetzt ${fmt((w[f.id] || {})[feld] ?? (Number(f[feld]) || 0), 2)} ${EINHEIT[feld]}</span></div>`;
    }).join('')).join('');
    const kol = st.kollision;
    const bereiche = [];
    if (kol) {
      let a = null;
      for (let i = 0; i <= n; i++) {
        const on = i < n && kol[i] && kol[i].hits.length;
        if (on && a == null) a = i;
        if (!on && a != null) { bereiche.push([a, i - 1]); a = null; }
      }
    }
    const paare = i => [...new Set(kol[i].hits.map(h => `${ctx.bodyName(h.a)} ↔ ${ctx.bodyName(h.b)}`))].join(', ');
    const kolText = !kol ? '' : bereiche.length
      ? `<p class="info">Kollision in ${bereiche.length === 1 ? 'einem Bereich' : `${bereiche.length} Bereichen`} (rot):</p><div class="flist2 ilist">${bereiche.map(([a, b]) => `<div class="frow"><button type="button" class="gdlink" data-cmd="mot-gehe" data-k="${a}">Schritt ${a + 1}${b > a ? `–${b + 1}` : ''}</button><em>${fmt(zeitVon(a), 0)}${b > a ? `–${fmt(zeitVon(b), 0)}` : ''} % · ${esc(paare(a))}</em></div>`).join('')}</div>`
      : `<p class="info">Keine Kollision in ${n} Schritten.</p>`;
    const marken = kol ? `<div class="motmarken">${Array.from({ length: n }, (_, i) => `<i class="${kol[i] && kol[i].hits.length ? 'rot' : ''}" style="left:${(100 * i) / (n - 1)}%"></i>`).join('')}</div>` : '';
    d.className = 'dialog motdlg';
    d.innerHTML = `<header>${icon('joint', 20)}<b class="dtitle">Bewegungsstudie</b></header><div class="dbody">
      <details open class="gdgrp"><summary>Gelenke</summary>${zeilen}</details>
      <label class="row"><span>Schritte</span><span class="num"><input type="number" step="1" min="2" max="361" data-mot="schritte" value="${n}"><em></em></span></label>
      <label class="row"><span>Dauer</span><span class="num"><input type="number" step="0.5" min="0.5" max="60" data-mot="dauer" value="${s.dauer}"><em>s</em></span></label>
      <div class="motzeit">${marken}<input type="range" min="0" max="${n - 1}" step="1" value="${k}" data-mot="pos" aria-label="Zeit (Schritt)"></div>
      <p class="small">Schritt ${k + 1} von ${n} · ${fmt(zeitVon(k), 1)} %</p>
      ${st.laeuft ? `<p class="info">${esc(st.laeuft)}</p>` : ''}
      ${st.fehler ? `<p class="derr">${esc(st.fehler)}</p>` : ''}
      ${kolText}
      ${(() => { const h = st.halt.map((p, i) => (p ? i : -1)).filter(i => i >= 0); return h.length ? `<p class="info">Kontakt: Gelenk angehalten ab Schritt ${h[0] + 1} (${esc(ctx.bodyName(st.halt[h[0]][0]))} ↔ ${esc(ctx.bodyName(st.halt[h[0]][1]))}).</p>` : ''; })()}
      <p class="info small">Je Gelenk und Freiheitsgrad eine Spur: Stützstellen Zeit → Wert, dazwischen linear. Die Schritte werden einmal gebaut und dann flüssig abgespielt; Grenzen der Gelenke gelten weiter. „Kollision prüfen“ rechnet jeden Schritt wie Prüfen → Kollision (Berührungen zählen nicht).</p>
      </div><footer><button type="button" class="btn" data-cmd="mot-spielen">${st.spielt ? 'Stopp' : 'Abspielen'}</button><button type="button" class="btn" data-cmd="mot-kollision"${st.laeuft ? ' disabled' : ''}>Kollision prüfen</button><button type="button" class="btn primary" data-cmd="mot-close">Schließen</button></footer>`;
    d.hidden = false;
  }

  async function gehe(k) {
    const n = studie().schritte;
    k = Math.max(0, Math.min(n - 1, k));
    st.pos = zeitVon(k);
    render();
    const halt = st.halt.filter(Boolean).length;
    try { await zeige(k); } catch (err) { st.fehler = err.message; render(); return; }
    if (st.halt.filter(Boolean).length !== halt && ctx.mode === 'motion') render(); // Kontaktstopp erst beim Bauen bekannt
  }
  async function spielen() {
    if (st.spielt) { st.spielt = false; render(); return; }
    const n = studie().schritte;
    st.spielt = true; render();
    // erst alle Schritte bauen (Fortschritt), dann im Takt der Dauer abspielen
    try {
      for (let k = 0; k < n && st.spielt; k++) { if (!st.bilder[k]) { st.laeuft = `Schritte werden gebaut … ${k + 1} von ${n}`; const t = $('#dialog .dbody .info'); if (t && /gebaut/.test(t.textContent)) t.textContent = st.laeuft; else render(); await bild(k); } }
    } catch (err) { st.fehler = err.message; st.spielt = false; st.laeuft = null; render(); return; }
    st.laeuft = null;
    const t0 = performance.now(), dauer = studie().dauer * 1000;
    let zuletzt = -1;
    await new Promise(fertig => {
      const takt = () => {
        if (!st.spielt || ctx.mode !== 'motion') return fertig();
        const f = Math.min(1, (performance.now() - t0) / dauer), k = Math.round(f * (n - 1));
        if (k !== zuletzt) { zuletzt = k; st.pos = zeitVon(k); zeige(k); const r = $('#dialog [data-mot="pos"]'); if (r) r.value = String(k); const p = $('#dialog .dbody > p.small'); if (p) p.textContent = `Schritt ${k + 1} von ${n} · ${fmt(st.pos, 1)} %`; }
        if (f >= 1) return fertig();
        requestAnimationFrame(takt);
      };
      requestAnimationFrame(takt);
    });
    st.spielt = false; render();
  }
  async function kollision() {
    const n = studie().schritte, out = [];
    pruefeSchluessel();
    try {
      for (let k = 0; k < n; k++) {
        if (ctx.mode !== 'motion') return;
        st.laeuft = `Kollision prüfen … Schritt ${k + 1} von ${n}`; render();
        const r = await ctx.kernel.interfere(await featuresSchritt(k), ctx.kctx());
        out[k] = { hits: r.hits || [] };
      }
    } catch (err) { st.fehler = err.message; st.laeuft = null; render(); return; }
    st.kollision = out; st.laeuft = null;
    const erst = out.findIndex(x => x.hits.length);
    if (erst >= 0) await gehe(erst); else render();
  }

  function cmd(c, el) {
    const { j, feld } = el ? el.dataset : {}, sp = j && spur(j, feld);
    if (c === 'mot-close') return close();
    if (c === 'mot-spielen') return spielen();
    if (c === 'mot-kollision') return kollision();
    if (c === 'mot-gehe') return gehe(Number(el.dataset.k) || 0);
    if (c === 'mot-punkt' && sp) {
      ctx.pushHistory();
      const P = sp.punkte.slice().sort((a, b) => a.t - b.t);
      // neue Stützstelle in der größten Lücke, mit dem Wert dort
      let gi = 0, gl = -1;
      for (let i = 1; i < P.length; i++) if (P[i].t - P[i - 1].t > gl) { gl = P[i].t - P[i - 1].t; gi = i; }
      const t = P.length > 1 ? Math.round((P[gi - 1].t + P[gi].t) / 2) : 50;
      sp.punkte.push({ t, v: Math.round(spurWert(P, t) * 100) / 100 });
      sp.punkte.sort((a, b) => a.t - b.t);
      ctx.store(); render(); return;
    }
    if (c === 'mot-weg' && sp && sp.punkte.length > 2) { ctx.pushHistory(); sp.punkte.splice(Number(el.dataset.i), 1); ctx.store(); render(); }
  }
  function eingabe(t) {
    const s = studie(), k = t.dataset.mot;
    if (t.dataset.motSpur) {
      ctx.pushHistory();
      const jid = t.dataset.motSpur, feld = t.dataset.feld, f = gelenke().find(x => x.id === jid);
      if (t.checked && !spur(jid, feld)) {
        const v0 = Number(f[feld]) || 0, lim = f.limits && Number.isFinite(Number(f.lmin)) && Number.isFinite(Number(f.lmax));
        // Vorgabe: im Bereich der Grenzen, sonst eine Vierteldrehung bzw. 20 mm
        const a = lim ? Math.min(f.lmin, f.lmax) : v0, b = lim ? Math.max(f.lmin, f.lmax) : v0 + (feld === 'angle' ? 90 : 20);
        s.spuren.push({ joint: jid, feld, punkte: [{ t: 0, v: a }, { t: 100, v: b }] });
      } else if (!t.checked) s.spuren = s.spuren.filter(x => !(x.joint === jid && x.feld === feld));
      ctx.store(); render(); gehe(Math.round(st.pos * (s.schritte - 1) / 100));
      return true;
    }
    if (!k) return false;
    const v = Number(String(t.value).replace(',', '.'));
    if (!Number.isFinite(v)) return true;
    // Regler zählt Schritte (ganzzahlig – Prozent mit krummer Schrittweite erreicht das Ende nicht)
    if (k === 'pos') { st.spielt = false; gehe(Math.round(v)); return true; }
    if (k === 'schritte' && v >= 2) { s.schritte = Math.min(361, Math.round(v)); ctx.store(); render(); return true; }
    if (k === 'dauer' && v > 0) { s.dauer = Math.min(60, v); ctx.store(); return true; }
    if (k === 't' || k === 'v') {
      const sp = spur(t.dataset.j, t.dataset.feld), p = sp && sp.punkte[Number(t.dataset.i)];
      if (!p) return true;
      p[k] = k === 't' ? Math.max(0, Math.min(100, v)) : v;
      ctx.store();
      return true;
    }
    return false;
  }
  return { openMotion: open, closeMotion: close, motionCmd: cmd, motionInput: eingabe, motionState: st, motionGo: gehe };
}
