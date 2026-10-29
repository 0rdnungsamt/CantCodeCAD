// cantcodecad – Claude-Anbindung, App-Seite. Der MCP-Server (tools/mcp/cantcodecad-mcp.mjs) nimmt Werkzeugaufrufe von
// Claude entgegen; diese Seite holt sie über 127.0.0.1:8790 ab (lange Abfrage), führt sie am offenen Dokument aus und
// schickt das Ergebnis zurück. Nur eingeschaltet (Einstellungen → Allgemein → Claude-Anbindung); Netz gibt es dabei
// keines, nur den eigenen Rechner. Jede Änderung geht über pushHistory in die Rückgängig-Liste und baut neu.
import { validateDoc, nextName, ORIGIN_PLANES, FEATURE_TYPES, uid, dependents } from './doc.js';
import { emptySketchGeo, addPoint, addLine, addCircle, addArc, addRect, addRule } from './sketch/model.js';
import { addPolygon, addCenterRect } from './sketch/commands.js';
import { sketchRegions } from './sketch/profiles.js';
import { paramValues } from './params.js';

const BRIDGE = 'http://127.0.0.1:8790';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r6 = v => Math.round(v * 1e6) / 1e6;

export function setupAiBridge(ctx) {
  let on = false, running = false, announced = false;

  /* ---------- Hilfen ---------- */
  function guard() {
    if (ctx.editing) throw new Error('In cantcodecad wird gerade eine Skizze oder ein Feature bearbeitet – dort erst OK oder Abbrechen wählen.');
  }
  // neu bauen und warten, bis das Ergebnis da ist (oder der Bau ohne neues Ergebnis endet, z. B. bei einem Kernfehler)
  async function rebuild() {
    const prev = ctx.lastBuild, t0 = performance.now();
    ctx.scheduleBuild(0);
    await sleep(60);
    while (performance.now() - t0 < 120000) {
      if (!ctx.building && (ctx.lastBuild !== prev || performance.now() - t0 > 3000)) return;
      await sleep(50);
    }
    throw new Error('Der Neuaufbau dauert länger als 120 s.');
  }
  function state(id) {
    const s = ctx.lastBuild && ctx.lastBuild.status && ctx.lastBuild.status[id];
    if (!s) return 'nicht gebaut (nach der Zeitleisten-Markierung oder unterdrückt)';
    if (s.suppressed) return 'unterdrückt';
    if (!s.ok) return 'Fehler: ' + s.error;
    return s.warn ? 'Hinweis: ' + s.warn : s.info ? 'ok – ' + s.info : 'ok';
  }
  function bodies() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh;
    return ((m && m.bodies) || []).map(b => ({ id: b.id, name: ctx.bodyName(b.id), volumen: r6(b.volume || 0), huelle: b.bbox ? b.bbox.map(p => p.map(r6)) : null }));
  }
  function report(f) {
    const deps = f ? dependents(ctx.doc, f.id).map(d => d.name) : [];
    const fehler = ctx.doc.features.filter(x => ctx.lastBuild && ctx.lastBuild.status[x.id] && ctx.lastBuild.status[x.id].ok === false).map(x => `${x.name}: ${ctx.lastBuild.status[x.id].error}`);
    return { ...(f ? { id: f.id, name: f.name, zustand: state(f.id) } : {}), koerper: bodies(), ...(fehler.length ? { fehler_im_dokument: fehler } : {}), ...(deps.length ? { benutzt_von: deps } : {}) };
  }
  function sketchSummary(f) {
    const pm = new Map(f.points.map(p => [p.id, p.z == null ? [r6(p.x), r6(p.y)] : [r6(p.x), r6(p.y), r6(p.z)]]));
    const P = id => pm.get(id) || (id === 'O' ? [0, 0] : null);
    const kurven = f.curves.map(c => {
      const k = { art: c.type, ...(c.cons ? { konstruktion: true } : {}), ...(c.ref ? { projiziert: true } : {}) };
      if (c.type === 'line') return { ...k, von: P(c.p1), bis: P(c.p2) };
      if (c.type === 'circle') return { ...k, mitte: P(c.c), r: r6(c.r) };
      if (c.type === 'arc') return { ...k, mitte: P(c.c), r: r6(c.r), von: P(c.s), bis: P(c.e) };
      return k;
    });
    let profile = 0;
    try { profile = sketchRegions(f).regions.length; } catch (_) { profile = 0; }
    return { id: f.id, type: 'sketch', name: f.name, ...(f.plane ? { ebene: { key: f.plane.key, o: f.plane.o, n: f.plane.n } } : { raum: true }), profile, kurven, regeln: f.rules.length };
  }
  function addFeature(f) {
    if (ctx.doc.activeComp && (ctx.doc.components || []).some(c => c.id === ctx.doc.activeComp) && !f.owner) f.owner = ctx.doc.activeComp;
    validateDoc({ ...ctx.doc, features: [...ctx.doc.features, f] }); // wirft bei unbekanntem Typ
    ctx.pushHistory();
    ctx.doc.features.push(f);
    ctx.store();
    ctx.renderAll();
  }

  /* ---------- Werkzeuge ---------- */
  const TOOLS = {
    async dokument_lesen({ voll } = {}) {
      const { vals, errors } = paramValues(ctx.doc.params || []);
      return {
        name: ctx.doc.name, art: ctx.doc.kind || 'part',
        parameter: (ctx.doc.params || []).map(p => ({ name: p.name, ausdruck: p.expr, wert: vals[p.name], ...(errors[p.name] ? { fehler: errors[p.name] } : {}), ...(p.comment ? { kommentar: p.comment } : {}) })),
        features: ctx.doc.features.map(f => ({ ...(f.type === 'sketch' && !voll ? sketchSummary(f) : f), zustand: state(f.id) })),
        koerper: bodies(),
        einheiten: 'mm, Grad'
      };
    },
    async skizze_anlegen({ ebene, versatz, name, formen, bemassen }) {
      guard();
      const base = ORIGIN_PLANES[ebene];
      if (!base) throw new Error('ebene muss XY, XZ oder YZ sein.');
      if (!Array.isArray(formen) || !formen.length) throw new Error('formen fehlt.');
      const v = Number(versatz) || 0;
      const plane = v ? { ...base, key: 'FACE', label: `${base.key} versetzt um ${v} mm`, o: base.o.map((x, i) => x + base.n[i] * v) } : JSON.parse(JSON.stringify(base));
      const sk = { id: uid(), type: 'sketch', name: name || nextName(ctx.doc, 'sketch'), plane, ...emptySketchGeo() };
      const num = (s, k) => { const x = Number(s[k]); if (!Number.isFinite(x)) throw new Error(`${s.art}: „${k}“ fehlt oder ist keine Zahl.`); return x; };
      formen.forEach(s => {
        const cons = !!s.konstruktion;
        if (s.art === 'rechteck' || s.art === 'rechteck_mitte') {
          const [x0, y0, x1, y1] = s.art === 'rechteck' ? [num(s, 'x0'), num(s, 'y0'), num(s, 'x1'), num(s, 'y1')] : [num(s, 'cx') - num(s, 'b') / 2, num(s, 'cy') - num(s, 'h') / 2, num(s, 'cx') + num(s, 'b') / 2, num(s, 'cy') + num(s, 'h') / 2];
          if (Math.abs(x1 - x0) < 1e-9 || Math.abs(y1 - y0) < 1e-9) throw new Error('Rechteck ohne Breite oder Höhe.');
          const r = s.art === 'rechteck_mitte' ? addCenterRect(sk, [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]).rect : addRect(sk, x0, y0, x1, y1, cons);
          if (cons) r.lines.forEach(l => { l.cons = true; });
          if (bemassen) {
            addRule(sk, { type: 'distance', a: r.lines[0].id, value: Math.abs(x1 - x0), off: [0, -Math.max(6, Math.abs(y1 - y0) * 0.15)] });
            addRule(sk, { type: 'distance', a: r.lines[1].id, value: Math.abs(y1 - y0), off: [Math.max(6, Math.abs(x1 - x0) * 0.15), 0] });
          }
        } else if (s.art === 'kreis') {
          const d = num(s, 'd');
          if (!(d > 0)) throw new Error('Kreis: d muss größer als 0 sein.');
          const c = addCircle(sk, addPoint(sk, num(s, 'cx'), num(s, 'cy')).id, d / 2, cons);
          if (bemassen) addRule(sk, { type: 'diameter', c: c.id, value: d });
        } else if (s.art === 'linie') {
          addLine(sk, addPoint(sk, num(s, 'x0'), num(s, 'y0')).id, addPoint(sk, num(s, 'x1'), num(s, 'y1')).id, cons);
        } else if (s.art === 'bogen') {
          const cx = num(s, 'cx'), cy = num(s, 'cy'), r = num(s, 'r'), a0 = num(s, 'a0') * Math.PI / 180, a1 = num(s, 'a1') * Math.PI / 180;
          if (!(r > 0)) throw new Error('Bogen: r muss größer als 0 sein.');
          addArc(sk, addPoint(sk, cx, cy).id, addPoint(sk, cx + r * Math.cos(a0), cy + r * Math.sin(a0)).id, addPoint(sk, cx + r * Math.cos(a1), cy + r * Math.sin(a1)).id, cons);
        } else if (s.art === 'vieleck') {
          const cx = num(s, 'cx'), cy = num(s, 'cy'), r = num(s, 'r'), n = Math.round(num(s, 'n'));
          const res = addPolygon(sk, [cx, cy], [cx + r, cy], n);
          if (!res.ok) throw new Error(res.msg);
        } else if (s.art === 'punkt') addPoint(sk, num(s, 'x'), num(s, 'y'));
        else throw new Error(`Unbekannte Form „${s.art}“.`);
      });
      addFeature(sk);
      await rebuild();
      let profile = 0;
      try { profile = sketchRegions(sk).regions.length; } catch (_) { profile = 0; }
      return { ...report(sk), profile };
    },
    async feature_anlegen({ feature }) {
      guard();
      if (!feature || typeof feature !== 'object') throw new Error('feature fehlt.');
      const f = JSON.parse(JSON.stringify(feature));
      if (!FEATURE_TYPES[f.type]) throw new Error(`Unbekannter Feature-Typ „${f.type}“. Mit beispiele() die Typen ansehen.`);
      if (!f.id || ctx.doc.features.some(x => x.id === f.id)) f.id = uid();
      if (!f.name) f.name = nextName(ctx.doc, f.type);
      if (f.type === 'sketch') { f.points = f.points || []; f.curves = f.curves || []; f.rules = f.rules || []; }
      addFeature(f);
      await rebuild();
      return report(f);
    },
    async feature_aendern({ id, aenderungen }) {
      guard();
      const f = ctx.doc.features.find(x => x.id === id);
      if (!f) throw new Error(`Kein Feature mit der ID „${id}“.`);
      if (!aenderungen || typeof aenderungen !== 'object') throw new Error('aenderungen fehlt.');
      if ('id' in aenderungen || 'type' in aenderungen) throw new Error('id und type lassen sich nicht ändern – Feature löschen und neu anlegen.');
      ctx.pushHistory();
      Object.entries(aenderungen).forEach(([k, v]) => { if (v === null) delete f[k]; else f[k] = JSON.parse(JSON.stringify(v)); });
      ctx.store();
      ctx.renderAll();
      await rebuild();
      return report(f);
    },
    async feature_loeschen({ id }) {
      guard();
      const i = ctx.doc.features.findIndex(x => x.id === id);
      if (i < 0) throw new Error(`Kein Feature mit der ID „${id}“.`);
      const name = ctx.doc.features[i].name, deps = dependents(ctx.doc, id).map(d => d.name);
      ctx.pushHistory();
      ctx.doc.features.splice(i, 1);
      ctx.store();
      ctx.renderAll();
      await rebuild();
      return { geloescht: name, ...(deps.length ? { hatte_abhaengige: deps } : {}), ...report(null) };
    },
    async parameter_setzen({ name, ausdruck, kommentar }) {
      guard();
      if (!/^[A-Za-z_ÄÖÜäöüß][\wÄÖÜäöüß]*$/.test(String(name || ''))) throw new Error('Name: Buchstaben, Ziffern und _ – mit einem Buchstaben am Anfang.');
      const params = ctx.doc.params ? ctx.doc.params.slice() : [];
      const p = params.find(x => x.name === name);
      const next = p ? params.map(x => (x === p ? { ...x, expr: String(ausdruck), ...(kommentar != null ? { comment: kommentar } : {}) } : x)) : [...params, { id: uid(), name, expr: String(ausdruck), comment: kommentar || '' }];
      const { errors } = paramValues(next);
      if (errors[name]) throw new Error(`Ausdruck „${ausdruck}“: ${errors[name]}`);
      ctx.pushHistory();
      ctx.doc.params = next;
      await ctx.applyParams();
      ctx.store();
      ctx.renderAll();
      await rebuild();
      return { parameter: name, wert: paramValues(ctx.doc.params).vals[name], ...report(null) };
    },
    async messen({ koerper } = {}) {
      const ids = ((ctx.lastBuild && ctx.lastBuild.bodies) || []).filter(id => !koerper || id === koerper);
      if (koerper && !ids.length) throw new Error(`Kein Körper „${koerper}“.`);
      const out = [];
      for (const id of ids) {
        const p = await ctx.kernel.props(id);
        out.push({ id, name: ctx.bodyName(id), volumen: r6(p.volume), oberflaeche: r6(p.area), schwerpunkt: p.com.map(r6), huelle: p.bbox.map(q => q.map(r6)), flaechen: p.faces, kanten: p.edges });
      }
      return { koerper: out, einheiten: 'mm, mm², mm³' };
    },
    async ansicht_bild({ ansicht, breite } = {}) {
      const vp = ctx.vp;
      vp.view(ansicht || 'iso');
      const t0 = performance.now();
      await sleep(60);
      while (vp.anim && performance.now() - t0 < 2000) await sleep(30);
      vp.renderer.render(vp.scene, vp.camera); // gleich danach auslesen, solange der Bildpuffer noch gilt
      const src = vp.renderer.domElement, w = Math.max(200, Math.min(1200, Number(breite) || 800)), h = Math.round(src.height * w / src.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(src, 0, 0, w, h);
      vp.dirty = true;
      return { bild: c.toDataURL('image/png').split(',')[1], text: `Ansicht ${ansicht || 'iso'}, ${w} × ${h} px` };
    },
    async rueckgaengig() {
      guard();
      ctx.undo();
      await rebuild();
      return report(null);
    }
  };

  async function run(tool, args) {
    const fn = TOOLS[tool];
    if (!fn) throw new Error(`Unbekanntes Werkzeug „${tool}“.`);
    return fn(args || {});
  }

  /* ---------- Abfrage-Schleife ---------- */
  async function loop() {
    if (running) return;
    running = true;
    while (on) {
      let res;
      try { res = await fetch(BRIDGE + '/next', { cache: 'no-store' }); } catch (_) { await sleep(4000); continue; }
      if (res.status !== 200) continue; // 204 = nach 20 s nichts zu tun
      let m;
      try { m = await res.json(); } catch (_) { continue; }
      if (!announced) { announced = true; ctx.toast('Claude ist mit cantcodecad verbunden.'); }
      let out;
      try { out = { id: m.id, ok: true, result: await run(m.tool, m.args) }; } catch (e) { out = { id: m.id, ok: false, error: e && e.message ? e.message : String(e) }; }
      // als Text senden: kein CORS-Vorabaufruf nötig
      try { await fetch(BRIDGE + '/result', { method: 'POST', body: JSON.stringify(out) }); } catch (_) { /* Server weg */ }
    }
    running = false;
  }
  function setEnabled(v) {
    on = !!v;
    if (on) loop();
  }
  return { setAiEnabled: setEnabled, aiRun: run };
}
