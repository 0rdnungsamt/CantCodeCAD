// cantcodecad – Explosionsansicht: Körper bzw. ganze Komponenten
// rücken auseinander, nur in der Anzeige (Dokument und Geometrie bleiben unverändert). Regler, Richtung, Abspielen.
// Storyboard: eigene Schritte nacheinander – je Schritt eine Komponente (oder ein
// loser Körper) um X/Y/Z verschieben und um eine Achse durch ihre Mitte drehen, oder eine Kamerafahrt zu einer
// gespeicherten Ansicht; gespeichert im Dokument (doc.storyboard), abspielbar und als Video.
import { icon } from './icons.js';

const ease = u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
/* Gesamtdauer eines Storyboards in s */
export const storyDauer = schritte => (schritte || []).reduce((a, s) => a + Math.max(0.1, Number(s.t) || 0), 0);
/* Drehmatrix (zeilenweise, 3 × 3) um die Achse x/y/z, Winkel in Grad, und Produkt A · B */
const ACHSEN = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function drehung(achse, grad) {
  const [x, y, z] = ACHSEN[achse] || ACHSEN.z, w = grad * Math.PI / 180, c = Math.cos(w), s = Math.sin(w), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
const mal = (A, B) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => A[3 * r] * B[c] + A[3 * r + 1] * B[3 + c] + A[3 * r + 2] * B[6 + c]));
/* Lage je Körper zur Zeit zeit (s): Schritte laufen nacheinander, jeder sanft (anfahren/abbremsen). Mehrere Schritte
   derselben Gruppe setzen sich zusammen; gedreht wird um die Achse durch die Gruppenmitte an ihrer jeweiligen Stelle.
   Ergebnis: [dx, dy, dz] (nur verschoben) oder { c, R, d } – Punkt p wird zu c + R·(p − c) + d. Ansicht-Schritte
   (art 'ansicht') bewegen keine Körper. */
export function storyOffsets(bodies, group, schritte, zeit) {
  const proGruppe = {}, mitte = {};
  bodies.forEach(b => {
    const k = group(b.id) || b.id, m = mitte[k] || (mitte[k] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]);
    if (b.bbox) for (let i = 0; i < 3; i++) { m[0][i] = Math.min(m[0][i], b.bbox[0][i]); m[1][i] = Math.max(m[1][i], b.bbox[1][i]); }
  });
  let t0 = 0;
  (schritte || []).forEach(s => {
    const T = Math.max(0.1, Number(s.t) || 0), u = Math.max(0, Math.min(1, (zeit - t0) / T)), e = ease(u);
    t0 += T;
    if (!e || !s.g || s.art === 'ansicht') return;
    const g = proGruppe[s.g] || (proGruppe[s.g] = { d: [0, 0, 0], R: null });
    for (let i = 0; i < 3; i++) g.d[i] += (Number(s.d && s.d[i]) || 0) * e;
    const w = Number(s.w) || 0;
    if (w) g.R = mal(drehung(s.achse, w * e), g.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
  const out = {};
  bodies.forEach(b => {
    const k = group(b.id) || b.id, g = proGruppe[k];
    if (!g) return;
    if (!g.R) { out[b.id] = g.d.slice(); return; }
    const m = mitte[k];
    out[b.id] = { c: [0, 1, 2].map(i => (m[0][i] + m[1][i]) / 2), R: g.R.slice(), d: g.d.slice() };
  });
  return out;
}
/* Kamera zur Zeit zeit: zwischen der Ansicht davor (anfangs `start`) und der Ansicht eines laufenden Ansicht-Schritts
   sanft überblenden. null = kein Ansicht-Schritt, die Kamera bleibt, wie sie der Nutzer gestellt hat. */
export function storyKamera(schritte, zeit, start) {
  let t0 = 0, vor = start, aktiv = null;
  for (const s of schritte || []) {
    const T = Math.max(0.1, Number(s.t) || 0);
    if (s.art === 'ansicht' && s.cam) {
      if (zeit >= t0 + T) vor = s.cam;
      else if (zeit > t0) { aktiv = { von: vor, nach: s.cam, e: ease((zeit - t0) / T) }; break; }
      else break;
    }
    t0 += T;
  }
  if (aktiv && aktiv.von) { const l = (a, b) => a.map((v, i) => v + (b[i] - v) * aktiv.e); return { pos: l(aktiv.von.pos, aktiv.nach.pos), target: l(aktiv.von.target, aktiv.nach.target) }; }
  if (vor && vor !== start) return { pos: vor.pos.slice(), target: vor.target.slice() };
  return (schritte || []).some(s => s.art === 'ansicht' && s.cam) && start ? { pos: start.pos.slice(), target: start.target.slice() } : null;
}

export const EXPLODE_DIRS = { radial: 'vom Mittelpunkt weg', x: 'entlang X', y: 'entlang Y', z: 'entlang Z' };

/* Verschiebung je Körper. bodies = [{id, bbox}], group(id) = Schlüssel der Gruppe (Komponente oder Körper),
   k = 0…1, dir = radial | x | y | z. Radial: Abstand der Gruppenmitte zur Gesamtmitte wächst um k·100 %.
   Entlang einer Achse: Ebenen gleicher Lage rücken ohne Überlappung auseinander (siehe unten). */
export function explodeOffsets(bodies, group, k, dir) {
  const groups = new Map();
  bodies.forEach(b => {
    const key = group(b.id) || b.id;
    const g = groups.get(key) || { ids: [], bb: [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]] };
    g.ids.push(b.id);
    for (let i = 0; i < 3; i++) { g.bb[0][i] = Math.min(g.bb[0][i], b.bbox[0][i]); g.bb[1][i] = Math.max(g.bb[1][i], b.bbox[1][i]); }
    groups.set(key, g);
  });
  const G = [...groups.values()];
  G.forEach(g => { g.c = [0, 1, 2].map(i => (g.bb[0][i] + g.bb[1][i]) / 2); });
  const out = {};
  if (G.length < 2) return out;
  if (dir === 'x' || dir === 'y' || dir === 'z') {
    // Ebenen: Gruppen mit gleicher Mitte in Achsrichtung (z. B. alle Schrauben) bilden eine Ebene; die Ebenen rücken
    // um k·(halbe Höhe + halbe Höhe der Nachbarebene) auseinander, die Ebene des größten Teils bleibt stehen
    const a = { x: 0, y: 1, z: 2 }[dir], levels = [];
    G.slice().sort((p, q) => p.c[a] - q.c[a]).forEach(g => {
      const L = levels[levels.length - 1];
      if (L && Math.abs(L.c - g.c[a]) < 0.5) L.g.push(g); else levels.push({ c: g.c[a], g: [g] });
    });
    levels.forEach(L => { L.h = Math.max(...L.g.map(g => g.bb[1][a] - g.bb[0][a])); });
    const vol = g => (g.bb[1][0] - g.bb[0][0]) * (g.bb[1][1] - g.bb[0][1]) * (g.bb[1][2] - g.bb[0][2]);
    const big = G.reduce((p, q) => (vol(q) > vol(p) ? q : p)), anchor = levels.findIndex(L => L.g.includes(big));
    const cum = [0];
    for (let r = 1; r < levels.length; r++) cum.push(cum[r - 1] + (levels[r - 1].h + levels[r].h) / 2);
    levels.forEach((L, r) => { const d = [0, 0, 0]; d[a] = k * (cum[r] - cum[anchor]); L.g.forEach(g => g.ids.forEach(id => { out[id] = d; })); });
    return out;
  }
  const C = [0, 1, 2].map(i => (Math.min(...G.map(g => g.bb[0][i])) + Math.max(...G.map(g => g.bb[1][i]))) / 2);
  G.forEach(g => { const d = g.c.map((v, i) => (v - C[i]) * k); g.ids.forEach(id => { out[id] = d; }); });
  return out;
}

export function setupExplode(ctx) {
  const $ = s => document.querySelector(s);
  const st = { k: 0.6, dir: 'radial', anim: 0, art: 'auto', zeit: 0, cam0: null };
  const schritte = () => (ctx.doc.storyboard || []);
  const story = () => st.art === 'story';
  const kamera = () => ({ pos: ctx.vp.camera.position.toArray(), target: ctx.vp.controls.target.toArray() });
  function apply() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh;
    if (!m) return;
    ctx.vp.setExplode(story() ? storyOffsets(m.bodies, ctx.compOf, schritte(), st.zeit) : explodeOffsets(m.bodies, ctx.compOf, st.k, st.dir));
    // Kamerafahrt: Ausgang ist die Ansicht beim Öffnen des Storyboards
    const k = story() ? storyKamera(schritte(), st.zeit, st.cam0) : null;
    if (k) { ctx.vp.anim = null; ctx.vp.camera.position.fromArray(k.pos); ctx.vp.controls.target.fromArray(k.target); ctx.vp.controls.update(); ctx.vp.dirty = true; }
  }
  // Gruppen wie bei der Explosion: Komponenten als Ganzes, lose Körper einzeln
  function gruppen() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh, out = new Map();
    ((m && m.bodies) || []).forEach(b => { const c = ctx.compOf(b.id); const k = c || b.id; if (!out.has(k)) out.set(k, c ? ctx.compName(c) : ctx.bodyName(b.id)); });
    return [...out];
  }
  const zahl = v => String(Math.round(v * 1000) / 1000);
  function storyHtml() {
    const G = gruppen(), S = schritte(), T = storyDauer(S);
    const entf = i => `<button type="button" class="iconbtn" data-sbcmd="del" data-i="${i}" title="Schritt entfernen">${icon('close', 14)}</button>`;
    const dauer = (s, i) => `<label>s<input type="number" step="0.5" min="0.1" data-sb="${i}" data-sf="t" value="${zahl(Number(s.t) || 1)}"></label>`;
    return `${S.map((s, i) => s.art === 'ansicht'
      ? `<div class="sbschritt"><div class="sbkopf"><b>${i + 1}</b><span class="sbansicht">Ansicht (Kamerafahrt)</span><button type="button" class="chip" data-sbcmd="cam" data-i="${i}" title="Die jetzige Ansicht für diesen Schritt übernehmen">Ansicht übernehmen</button>${entf(i)}</div>
        <div class="sbwerte">${dauer(s, i)}</div></div>`
      : `<div class="sbschritt"><div class="sbkopf"><b>${i + 1}</b><select data-sb="${i}" data-sf="g">${G.map(([k, n]) => `<option value="${ctx.esc(k)}"${k === s.g ? ' selected' : ''}>${ctx.esc(n)}</option>`).join('')}</select>${entf(i)}</div>
        <div class="sbwerte">${['X', 'Y', 'Z'].map((l, a) => `<label>${l}<input type="number" step="10" data-sb="${i}" data-sf="${a}" value="${zahl(Number(s.d && s.d[a]) || 0)}"></label>`).join('')}${dauer(s, i)}</div>
        <div class="sbwerte"><label>°<input type="number" step="15" data-sb="${i}" data-sf="w" value="${zahl(Number(s.w) || 0)}" title="Drehung um die Achse durch die Mitte"></label><label>um<select data-sb="${i}" data-sf="achse">${['x', 'y', 'z'].map(a => `<option value="${a}"${(s.achse || 'z') === a ? ' selected' : ''}>${a.toUpperCase()}</option>`).join('')}</select></label></div></div>`).join('')}
      <div class="btns"><button type="button" class="chip" data-sbcmd="add">+ Schritt</button><button type="button" class="chip" data-sbcmd="addcam" title="Kamerafahrt zur jetzigen Ansicht">+ Ansicht</button></div>
      <label class="row"><span>Zeit <em class="exzeit">${zahl(st.zeit).replace('.', ',')} / ${zahl(T).replace('.', ',')} s</em></span><input type="range" min="0" max="${Math.round(T * 10)}" step="1" data-ex="zeit" value="${Math.round(st.zeit * 10)}"></label>
      <p class="info small">Storyboard Animation: die Schritte laufen nacheinander, jeder verschiebt eine Komponente (oder einen losen Körper) um X/Y/Z und dreht sie um eine Achse durch ihre Mitte. „Ansicht“ fährt die Kamera zur gespeicherten Ansicht. Gespeichert im Dokument, nur Anzeige.</p>`;
  }
  function render() {
    const d = $('#dialog');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('explode', 20)}<b class="dtitle">Explosionsansicht</b></header><div class="dbody">
      <label class="row"><span>Art</span><select data-ex="art"><option value="auto"${story() ? '' : ' selected'}>Automatisch explodieren</option><option value="story"${story() ? ' selected' : ''}>Storyboard (eigene Schritte)</option></select></label>
      ${story() ? storyHtml() : `<label class="row"><span>Explosion <em class="exval">${Math.round(st.k * 100)} %</em></span><input type="range" min="0" max="100" step="1" data-ex="k" value="${Math.round(st.k * 100)}"></label>
      <label class="row"><span>Richtung</span><select data-ex="dir">${Object.entries(EXPLODE_DIRS).map(([k, l]) => `<option value="${k}"${k === st.dir ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="info small">Komponenten bewegen sich als Ganzes, lose Körper einzeln. Nur Anzeige – das Modell bleibt unverändert. Ansicht drehen und zoomen geht weiter.</p>`}
      </div><footer><button type="button" class="btn" data-cmd="explode-play">Abspielen</button><button type="button" class="btn" data-cmd="explode-video" title="Video (WebM) zum Weitergeben, z. B. als Montageanleitung">Video speichern</button><button type="button" class="btn primary" data-cmd="explode-close">Schließen</button></footer>`;
    d.hidden = false;
  }
  function open() {
    const m = ctx.lastBuild && ctx.lastBuild.mesh;
    if (!m || m.bodies.length < 2) { ctx.toast('Die Explosionsansicht braucht mindestens zwei sichtbare Körper.'); return; }
    ctx.setMode('explode');
    // mit gespeichertem Storyboard öffnet das Storyboard (am Ende), sonst die automatische Explosion
    st.art = schritte().length ? 'story' : 'auto';
    st.zeit = storyDauer(schritte());
    st.cam0 = kamera();
    render();
    apply();
  }
  function close() {
    cancelAnimationFrame(st.anim);
    ctx.vp.setExplode(null);
    ctx.closeDialog();
    ctx.setMode('model');
  }
  function zeigeZeit() {
    const s = $('#dialog [data-ex="zeit"]'), l = $('#dialog .exzeit');
    if (s) s.value = Math.round(st.zeit * 10);
    if (l) l.textContent = `${zahl(st.zeit).replace('.', ',')} / ${zahl(storyDauer(schritte())).replace('.', ',')} s`;
  }
  // Abspielen: von zusammengebaut bis zum eingestellten Wert (1,5 s, sanft); Storyboard: von 0 bis zum Ende
  function play() {
    cancelAnimationFrame(st.anim);
    if (story()) {
      const T = storyDauer(schritte()), t0 = performance.now();
      if (!T) return;
      const step = now => {
        st.zeit = Math.min(T, (now - t0) / 1000);
        zeigeZeit(); apply();
        if (st.zeit < T) st.anim = requestAnimationFrame(step);
      };
      st.anim = requestAnimationFrame(step);
      return;
    }
    const target = st.k || 0.6, t0 = performance.now(), T = 1500;
    const slider = $('#dialog [data-ex="k"]'), lbl = $('#dialog .exval');
    const step = now => {
      const u = Math.min(1, (now - t0) / T), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      st.k = target * e;
      if (slider) slider.value = Math.round(st.k * 100);
      if (lbl) lbl.textContent = `${Math.round(st.k * 100)} %`;
      apply();
      if (u < 1) st.anim = requestAnimationFrame(step);
      else st.k = target;
    };
    st.anim = requestAnimationFrame(step);
  }
  $('#dialog').addEventListener('input', e => {
    const t = e.target;
    if (ctx.mode !== 'explode' || !t.dataset.ex) return;
    cancelAnimationFrame(st.anim);
    if (t.dataset.ex === 'k') { st.k = Number(t.value) / 100; const l = $('#dialog .exval'); if (l) l.textContent = `${t.value} %`; }
    if (t.dataset.ex === 'dir') st.dir = t.value;
    if (t.dataset.ex === 'art') { st.art = t.value; st.zeit = story() ? storyDauer(schritte()) : 0; st.cam0 = kamera(); render(); }
    if (t.dataset.ex === 'zeit') { st.zeit = Number(t.value) / 10; zeigeZeit(); }
    apply();
  });
  // Storyboard-Schritte bearbeiten: Werte sofort, gespeichert beim Verlassen des Feldes
  $('#dialog').addEventListener('input', e => {
    const t = e.target, i = Number(t.dataset.sb);
    if (ctx.mode !== 'explode' || t.dataset.sb == null) return;
    const s = schritte()[i];
    if (!s) return;
    const k = t.dataset.sf;
    if (k === 'g') s.g = t.value;
    else if (k === 'achse') s.achse = t.value;
    else {
      const v = Number(String(t.value).replace(',', '.'));
      if (!Number.isFinite(v)) return;
      if (k === 't') s.t = Math.max(0.1, v); else if (k === 'w') s.w = v; else { s.d = (s.d || [0, 0, 0]).slice(); s.d[Number(k)] = v; }
    }
    st.zeit = Math.min(st.zeit, storyDauer(schritte()));
    const z = $('#dialog [data-ex="zeit"]'); if (z) z.max = Math.round(storyDauer(schritte()) * 10);
    zeigeZeit(); apply();
  });
  $('#dialog').addEventListener('change', e => { if (ctx.mode === 'explode' && e.target.dataset.sb != null) ctx.store(); });
  $('#dialog').addEventListener('click', e => {
    const b = e.target.closest('[data-sbcmd]');
    if (!b || ctx.mode !== 'explode') return;
    cancelAnimationFrame(st.anim);
    ctx.pushHistory();
    const S = (ctx.doc.storyboard = schritte().slice());
    if (b.dataset.sbcmd === 'add') {
      // neuer Schritt: nächste Gruppe, die noch keinen Schritt hat, 50 mm nach oben in 1 s
      const G = gruppen(), frei = G.find(([k]) => !S.some(s => s.g === k)) || G[0];
      S.push({ g: frei ? frei[0] : '', d: [0, 0, 50], t: 1 });
    }
    if (b.dataset.sbcmd === 'del') S.splice(Number(b.dataset.i), 1);
    // Ansicht-Schritt: die jetzige Kamera wird Ziel der Fahrt (Ansicht vorher drehen/zoomen, dann übernehmen)
    if (b.dataset.sbcmd === 'addcam') S.push({ art: 'ansicht', g: '', d: [0, 0, 0], t: 1.5, cam: kamera() });
    if (b.dataset.sbcmd === 'cam') { const i = Number(b.dataset.i); if (S[i]) S[i] = { ...S[i], cam: kamera() }; }
    st.zeit = storyDauer(S);
    ctx.store(); render(); apply();
  });
  /* Video (WebM) für Montageanleitungen: zusammengebaut → explodiert → wieder zusammen. Jedes Bild wird direkt gerendert
     und mit hellem Hintergrund auf eine 2D-Fläche kopiert (die WebGL-Fläche ist durchsichtig), die MediaRecorder aufnimmt. */
  async function video() {
    if (st.rec) return;
    if (typeof MediaRecorder === 'undefined') { ctx.toast('Dieser Browser kann keine Videos aufnehmen.'); return; }
    cancelAnimationFrame(st.anim);
    const vp = ctx.vp, src = vp.renderer.domElement, w = src.width & ~1, h = src.height & ~1;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const draw = () => {
      vp.renderer.render(vp.scene, vp.camera);
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#f4f6f9'); bg.addColorStop(1, '#dde3ea');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.drawImage(src, 0, 0, w, h);
    };
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(cv.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : {});
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    st.rec = rec;
    const btn = $('#dialog [data-cmd="explode-video"]'); if (btn) { btn.disabled = true; btn.textContent = 'Nimmt auf …'; }
    const target = st.k || 0.6, T = storyDauer(schritte()) * 1000, zeitAlt = st.zeit;
    // Ablauf: 0,4 s Pause, 1,5 s auseinander, 0,6 s halten, 1,2 s zusammen, 0,3 s Pause
    // Storyboard: 0,4 s Pause, die Schritte in Echtzeit, 0,8 s halten
    const phases = story() ? [[400, () => { st.zeit = 0; }], [T, u => { st.zeit = u * T / 1000; }], [800, () => { st.zeit = T / 1000; }]]
      : [[400, () => 0], [1500, u => target * ease(u)], [600, () => target], [1200, u => target * (1 - ease(u))], [300, () => 0]];
    const total = phases.reduce((a, p) => a + p[0], 0);
    if (story()) st.zeit = 0; else st.k = 0;
    apply(); draw();
    rec.start(200);
    const t0 = performance.now();
    // Zeitgeber statt requestAnimationFrame: läuft auch, wenn das Fenster im Hintergrund ist (30 Bilder/s)
    await new Promise(resolve => {
      const step = () => {
        const now = performance.now();
        let t = now - t0, k = 0;
        for (const [dur, fn] of phases) { if (t <= dur) { k = fn(Math.min(1, t / dur)); break; } t -= dur; }
        if (!story()) st.k = k;
        apply(); draw();
        if (now - t0 < total) setTimeout(step, 33); else resolve();
      };
      setTimeout(step, 33);
    });
    rec.stop();
    await done;
    st.rec = null; st.k = target; st.zeit = zeitAlt; apply();
    const blob = new Blob(chunks, { type: 'video/webm' });
    st.lastVideo = blob;
    ctx.download(`${ctx.fileName()}-${story() ? 'Storyboard' : 'Explosion'}.webm`, blob);
    if (btn) { btn.disabled = false; btn.textContent = 'Video speichern'; }
    ctx.toast(`Video gespeichert (${(blob.size / 1024).toFixed(0)} KB, ${(total / 1000).toFixed(1)} s).`);
  }
  return { openExplode: open, closeExplode: close, playExplode: play, refreshExplode: apply, explodeVideo: video, explodeState: st };
}
