// Oberflächen-Prüfstand: spielt Bedienabläufe in der echten App (iframe, ?test = eigener Speicherplatz) durch.
// Klicks im Modell laufen über vp.cb.onPick, also dieselbe Funktion, die das Ansichtsfenster beim Mausklick aufruft.
import { W, D, C, act, appErrors, appReloads, bbox, box, built, checks, click, closeDrawing, cmd, edges, editTimeline, esc, expect, faces, loadApp, near, newComp, newDoc, num, ok, openExample, pick, q, seg, sketch3dClick, sketch3dEvt, sketchClick, sketchEvt, sleep, vol, waitFor, runSuite } from './harness.js';

const SCENARIOS = [
  ['Große Baugruppe: Picks ohne das ganze Netz, Kanten bleiben beim Navigieren', async () => {
    await newDoc(); await box(50, 50, 50);
    const m0 = C.lastBuild.mesh, vp = C.vp;
    const time = (fn, n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t0) / n; };
    // Würfel-Netz k-fach versetzt wiederholen: nur Messaufbau, kein Konstruktionsablauf.
    // Puffer in der Welt der App anlegen (die App prüft mit instanceof).
    const mk = (k) => {
      const nv = m0.positions.length, ni = m0.index.length, ne = m0.edgePositions.length;
      const positions = new W.Float32Array(nv * k), normals = new W.Float32Array(nv * k);
      const index = new W.Uint32Array(ni * k), edgePositions = new W.Float32Array(ne * k);
      const faces = [], edges = [], bodies = [];
      const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
      let oV = 0, oI = 0, oE = 0;
      for (let i = 0; i < k; i++) {
        const off = i * 100;
        for (let j = 0; j < nv; j += 3) {
          positions[oV + j] = m0.positions[j] + off;
          positions[oV + j + 1] = m0.positions[j + 1]; positions[oV + j + 2] = m0.positions[j + 2];
          normals[oV + j] = m0.normals[j]; normals[oV + j + 1] = m0.normals[j + 1]; normals[oV + j + 2] = m0.normals[j + 2];
        }
        for (let j = 0; j < ni; j++) index[oI + j] = m0.index[j] + oV / 3;
        for (let j = 0; j < ne; j += 3) {
          edgePositions[oE + j] = m0.edgePositions[j] + off;
          edgePositions[oE + j + 1] = m0.edgePositions[j + 1]; edgePositions[oE + j + 2] = m0.edgePositions[j + 2];
        }
        m0.faces.forEach(f => faces.push({ ...f, start: f.start + oI, body: i }));
        m0.edges.forEach(e => edges.push({ ...e, start: e.start + oE / 3, body: i }));
        const b0 = m0.bodies[0].bbox;
        bodies.push({
          id: 'm' + i, volume: m0.bodies[0].volume,
          bbox: [[b0[0][0] + off, b0[0][1], b0[0][2]], [b0[1][0] + off, b0[1][1], b0[1][2]]],
          faces: [m0.faces.length * i, m0.faces.length * (i + 1)], edges: [m0.edges.length * i, m0.edges.length * (i + 1)],
          tris: [oI, oI + ni], verts: [oV / 3, (oV + nv) / 3], evs: [oE / 3, (oE + ne) / 3],
        });
        for (let c = 0; c < 3; c++) { bb[0][c] = Math.min(bb[0][c], bodies[i].bbox[0][c]); bb[1][c] = Math.max(bb[1][c], bodies[i].bbox[1][c]); }
        oV += nv; oI += ni; oE += ne;
      }
      return { ...m0, positions, normals, index, edgePositions, faces, edges, bodies, bbox: bb };
    };
    const faceCenter = (mesh, fi) => {
      const f = mesh.faces[fi], p = mesh.positions, idx = mesh.index, s = [0, 0, 0];
      let n = 0;
      for (let t = f.start / 3; t < (f.start + f.count) / 3; t++) {
        for (let v = 0; v < 3; v++) { const o = idx[t * 3 + v] * 3; s[0] += p[o]; s[1] += p[o + 1]; s[2] += p[o + 2]; n++; }
      }
      return s.map(x => x / n);
    };
    const at = p => { const s = vp.toScreen(p), r = vp.canvas.getBoundingClientRect(); return { clientX: r.left + s[0], clientY: r.top + s[1] }; };
    // oberste Fläche des ersten Körpers: die hat die Standardkamera vor der Linse
    const topFace = (mesh) => {
      let top = -1, z = -1e9;
      mesh.faces.forEach((f, i) => { if (f.body !== 0) return; const c = faceCenter(mesh, i); if (c[2] > z) { z = c[2]; top = i; } });
      return { face: top, z };
    };
    const mesh = mk(4);
    vp.setModel(mesh);
    vp.setPickMode('any');
    const t = topFace(mesh);
    const h = vp.pickAt(at(faceCenter(mesh, t.face)));
    expect(h && h.kind === 'face' && h.index === t.face, 'Fläche eines Körpers aus vieren getroffen');
    let edge = -1, mid = null;
    for (let i = 0; i < mesh.edges.length && edge < 0; i++) {
      const e = mesh.edges[i];
      if (e.body !== 0) continue;
      const p = mesh.edgePositions, a = e.start * 3;
      if (p[a + 2] < t.z - 1e-6 || p[a + 5] < t.z - 1e-6) continue;
      edge = i; mid = [(p[a] + p[a + 3]) / 2, (p[a + 1] + p[a + 4]) / 2, p[a + 2]];
    }
    const he = vp.pickAt(at(mid));
    expect(he && he.kind === 'edge' && he.index === edge, 'Kante dieses Körpers getroffen');
    // Ein Pick darf nicht die ganze Baugruppe durchsuchen: über 20 000 Körpern
    // wäre das ein Vielfaches einer Bildzeit, und die Ansicht ruckelt schon beim
    // Bewegen der Maus.
    const big = mk(20000);
    vp.setModel(big);
    const ev = at(faceCenter(big, 0));
    const ms = time(() => vp.pickAt(ev), 20);
    expect(ms < 10, `Pick über 20 000 Körpern: ${ms.toFixed(2)} ms`);
    const hb = vp.pickAt(ev);
    expect(hb && hb.kind === 'face' && hb.index === 0, 'Fläche aus 20 000 Körpern getroffen');
    // Beim Navigieren darf nichts verschwinden: eine Ansicht ohne Kanten liest
    // sich wie ein Aussetzer, auch bei einer großen Baugruppe.
    vp.wakeRenderer();
    expect(vp.interactionQuality === true, 'vereinfachte Bildqualität beim Navigieren');
    expect(vp.model.edges.visible === true, 'Kanten bleiben beim Navigieren sichtbar');
    vp.setInteractionQuality(false);
    // Drehpunkt neben dem Modell: auch über 20 000 Körpern nur die nächsten Netze prüfen
    const off = { clientX: ev.clientX, clientY: ev.clientY - 300 };
    expect(!vp.hitAtPointer(off), 'Zeiger neben der Baugruppe trifft nichts');
    const ms2 = time(() => vp.pivotNearPointer(off), 10);
    const pv = vp.pivotNearPointer(off);
    const onBody = pv && big.bodies.some(b => pv.x >= b.bbox[0][0] - 1e-6 && pv.x <= b.bbox[1][0] + 1e-6
      && pv.y >= b.bbox[0][1] - 1e-6 && pv.y <= b.bbox[1][1] + 1e-6
      && pv.z >= b.bbox[0][2] - 1e-6 && pv.z <= b.bbox[1][2] + 1e-6);
    expect(onBody, 'Drehpunkt am nächsten Körper');
    expect(ms2 < 10, `Drehpunkt neben der Baugruppe über 20 000 Körpern: ${ms2.toFixed(2)} ms`);
    // Warmzeichnen nur nach Bedienung: im Leerlauf (letzte Eingabe vor 20 s) keine Dauerbilder, direkt danach schon.
    // Uhr der App benutzen (eigene Zeitlinie des Fensters).
    const bilder = async ms => { let n = 0; const orig = vp.renderer.render; vp.renderer.render = function (...a) { n++; return orig.apply(this, a); }; try { await sleep(ms); } finally { vp.renderer.render = orig; } return n; };
    // unter Last kann noch eine späte Bauantwort ein paar Bilder auslösen: bis zu drei Fenster, das ruhigste zählt
    let leer = Infinity;
    for (let i = 0; i < 3 && leer > 2; i++) { vp.activeRenderUntil = 0; vp.lastInput = W.performance.now() - 20000; await sleep(150); leer = Math.min(leer, await bilder(500)); }
    vp.lastInput = W.performance.now();
    const warm = await bilder(500);
    expect(leer <= 2 && warm >= 5, `Leerlauf ${leer} Bilder, nach Bedienung ${warm} Bilder in 0,5 s`);
    vp.setModel(null);
  }],
  ['Skizze: Rechteck zeichnen und extrudieren', async () => {
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('rect');
    sketchClick(0, 0); sketchClick(40, 20);
    await sleep(200);
    const sk = C.editor.f;
    expect(sk.curves.filter(c => c.type === 'line').length === 4, 'Rechteck hat vier Linien');
    const xs = sk.points.map(p => p.x), ys = sk.points.map(p => p.y);
    near(Math.max(...xs) - Math.min(...xs), 40, 0.5, 'Breite ≈ 40');
    near(Math.max(...ys) - Math.min(...ys), 20, 0.5, 'Höhe ≈ 20');
    const W0 = Math.max(...xs) - Math.min(...xs), H0 = Math.max(...ys) - Math.min(...ys);
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    await cmd('solid:create', 'extrude');
    num('distance', 10); await ok();
    expect(C.lastBuild.bodies.length === 1, 'ein Körper');
    near(await vol(C.lastBuild.bodies[0]), W0 * H0 * 10, 1e-6, 'Volumen = Fläche × 10');
    click('[data-cmd="undo"]'); await sleep(800);
    expect(C.doc.features.length === 1, 'Rückgängig entfernt die Extrusion');
  }],
  ['Skizze: Rechteck mit 3 Punkten, Kreis mit 2/3 Punkten, Bogen mit Mittelpunkt, Mittelpunktlinie', async () => {
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    // gedrehtes Rechteck: Kante (0,0) → (30,30), Breite bis (-10,10) → 30√2 × 10√2 = 600 mm²
    C.editor.setTool('rect3');
    sketchClick(0, 0); sketchClick(30, 30); sketchClick(-10, 10);
    await sleep(200);
    let sk = C.editor.f;
    expect(sk.curves.filter(c => c.type === 'line').length === 4, 'vier Linien');
    expect(sk.rules.filter(r => r.type === 'parallel').length === 2 && sk.rules.some(r => r.type === 'perpendicular'), 'zweimal parallel, einmal senkrecht');
    // nach dem Lösen: Ecken rechtwinklig, Fläche aus den Eckpunkten (Klicks gehen über Bildpunkte, daher ≈ 600)
    const pmR = new Map(sk.points.map(p => [p.id, p])), L = sk.curves.filter(c => c.type === 'line').map(c => [pmR.get(c.p1), pmR.get(c.p2)]);
    const dir = l => [l[1].x - l[0].x, l[1].y - l[0].y], len = l => Math.hypot(...dir(l));
    expect(L.every((l, i) => { const m = L[(i + 1) % 4], a = dir(l), b = dir(m); return Math.abs(a[0] * b[0] + a[1] * b[1]) / len(l) / len(m) < 1e-6; }), 'alle Ecken rechtwinklig');
    const area = len(L[0]) * len(L[1]);
    near(area, 600, 6, 'Fläche ≈ 30√2 × 10√2 = 600');
    near(Math.atan2(...dir(L[0]).reverse()) * 180 / Math.PI, 45, 0.5, 'erste Kante unter 45°');
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    await cmd('solid:create', 'extrude');
    num('distance', 10); await ok();
    near(await vol(C.lastBuild.bodies[0]), area * 10, 1e-3, 'Volumen = Rechteckfläche × 10');
    // Kreise und Bogen in einer neuen Skizze
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('circle3');
    sketchClick(0, 0); sketchClick(40, 0); sketchClick(0, 30);
    await sleep(100);
    C.editor.setTool('circle2');
    sketchClick(60, 0); sketchClick(80, 0);
    await sleep(100);
    sk = C.editor.f;
    const pm = new Map(sk.points.map(p => [p.id, p]));
    const circles = sk.curves.filter(c => c.type === 'circle').map(c => ({ x: pm.get(c.c).x, y: pm.get(c.c).y, r: c.r }));
    const c3 = circles.find(c => Math.abs(c.r - 25) < 1e-6), c2 = circles.find(c => Math.abs(c.r - 10) < 1e-6);
    expect(c3 && Math.abs(c3.x - 20) < 1e-6 && Math.abs(c3.y - 15) < 1e-6, `Kreis durch 3 Punkte: Mitte 20/15, R 25 (${JSON.stringify(circles)})`);
    expect(c2 && Math.abs(c2.x - 70) < 1e-6 && Math.abs(c2.y) < 1e-6, 'Kreis mit 2 Punkten: Mitte 70/0, R 10');
    // Bogen mit Mittelpunkt: Mitte (0,-60), Anfang (20,-60), Maus gegen den Uhrzeigersinn bis (0,-40) → Viertelkreis
    C.editor.setTool('carc');
    sketchClick(0, -60); sketchClick(20, -60);
    [15, 30, 45, 60, 75].forEach(g => C.editor.onPointerMove(sketchEvt(20 * Math.cos(g * Math.PI / 180), -60 + 20 * Math.sin(g * Math.PI / 180))));
    sketchClick(0, -40);
    await sleep(150);
    sk = C.editor.f;
    const arc = sk.curves.find(c => c.type === 'arc');
    expect(arc && Math.abs(arc.r - 20) < 1e-6 && Math.abs((arc.a1 - arc.a0) - Math.PI / 2) < 0.01, `Viertelbogen R 20 (${arc && [arc.r, arc.a0, arc.a1].map(v => v.toFixed(4))})`);
    const s = new Map(sk.points.map(p => [p.id, p])).get(arc.s);
    expect(Math.abs(s.x - 20) < 1e-6 && Math.abs(s.y + 60) < 1e-6, 'Bogen beginnt am Anfangspunkt (gegen den Uhrzeigersinn)');
    // im Uhrzeigersinn: gleicher Anfang, Maus nach unten → Bogen von (0,-80) bis (20,-60)
    C.editor.setTool('carc');
    sketchClick(50, -60); sketchClick(70, -60);
    [-15, -30, -45, -60, -75].forEach(g => C.editor.onPointerMove(sketchEvt(50 + 20 * Math.cos(g * Math.PI / 180), -60 + 20 * Math.sin(g * Math.PI / 180))));
    sketchClick(50, -80);
    await sleep(150);
    const arcs = C.editor.f.curves.filter(c => c.type === 'arc');
    const a2 = arcs[arcs.length - 1], e2 = new Map(C.editor.f.points.map(p => [p.id, p])).get(a2.e);
    expect(arcs.length === 2 && Math.abs((a2.a1 - a2.a0) - Math.PI / 2) < 0.01 && Math.abs(e2.x - 70) < 1e-6 && Math.abs(e2.y + 60) < 1e-6, `im Uhrzeigersinn: Viertelbogen endet am Anfangspunkt (${[a2.a0, a2.a1, e2.x, e2.y].map(v => v.toFixed(3))})`);
    // Mittelpunktlinie: Mitte (0,60), Ende (30,60) → Linie (−30,60)…(30,60), Mitte bleibt beim Ziehen Mittelpunkt
    C.editor.setTool('cline');
    sketchClick(0, 60); sketchClick(30, 60);
    await sleep(150);
    const sk2 = C.editor.f, pm2 = new Map(sk2.points.map(p => [p.id, p])), mr = sk2.rules.find(r => r.type === 'midpoint');
    const ln = mr && sk2.curves.find(c => c.id === mr.c), P1 = ln && pm2.get(ln.p1), P2 = ln && pm2.get(ln.p2), Mp = mr && pm2.get(mr.p);
    expect(ln && Math.abs(P1.x + P2.x - 2 * Mp.x) < 1e-6 && Math.abs(P1.y + P2.y - 2 * Mp.y) < 1e-6, 'Mitte liegt in der Mitte der Linie');
    near(Math.hypot(P2.x - P1.x, P2.y - P1.y), 60, 0.5, 'Länge = 2 × 30');
    expect(sk2.rules.some(r => r.type === 'horizontal' && r.l === ln.id), 'waagerecht gezogen → Bedingung waagerecht');
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Skizze: Vieleck umschrieben/über Kante, Langloch Gesamtlänge/Mittelpunkt', async () => {
    // je Werkzeug: neues Teil, zeichnen, extrudieren 10 mm, Volumen = Fläche aus der gelösten Skizze × 10
    const draw = async (tool, clicks) => {
      await newDoc();
      click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
      await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
      C.editor.setTool(tool);
      for (const [x, y] of clicks) { sketchClick(x, y); await sleep(80); }
      await sleep(200);
      const sk = JSON.parse(JSON.stringify(C.editor.f));
      click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
      await cmd('solid:create', 'extrude'); num('distance', 10); await ok();
      return { sk, v: await vol(C.lastBuild.bodies[0]) };
    };
    const P = sk => new Map(sk.points.map(p => [p.id, p]));
    // umschrieben: Zeiger auf Kantenmitte, Hilfskreis = Inkreis (Schlüsselweite 2·r); Sechseck-Fläche 2·√3·r²
    let { sk, v } = await draw('polygonc', [[0, 0], [10, 0]]);
    const ci = sk.curves.find(c => c.type === 'circle'), ls = sk.curves.filter(c => c.type === 'line' && !c.cons);
    near(ci.r, 10, 0.5, `Inkreis r ≈ 10 (Schlüsselweite ${(2 * ci.r).toFixed(2)})`);
    expect(ls.length === 6, 'sechs Kanten');
    near(v, 2 * Math.sqrt(3) * ci.r * ci.r * 10, 1e-3, 'umschriebenes Sechseck: 2√3·r²·10');
    const pm = P(sk), side = Math.hypot(pm.get(ls[0].p2).x - pm.get(ls[0].p1).x, pm.get(ls[0].p2).y - pm.get(ls[0].p1).y);
    near(side, 2 * ci.r * Math.tan(Math.PI / 6), 1e-4, 'Kante = 2·r·tan 30°');
    // über Kante: die beiden Klicks sind zwei Ecken, Fläche (3√3/2)·s²
    ({ sk, v } = await draw('polygone', [[0, 0], [10, 0]]));
    const l2 = sk.curves.filter(c => c.type === 'line' && !c.cons), p2 = P(sk);
    const s2 = Math.hypot(p2.get(l2[0].p2).x - p2.get(l2[0].p1).x, p2.get(l2[0].p2).y - p2.get(l2[0].p1).y);
    near(s2, 10, 0.5, `Kante ≈ 10 (${s2.toFixed(3)})`);
    expect(sk.points.filter(p => Math.abs(p.y) < 0.5).length >= 2 && sk.points.every(p => p.y > -0.5), 'Vieleck liegt links der Klickrichtung (oberhalb)');
    near(v, 1.5 * Math.sqrt(3) * s2 * s2 * 10, 1e-3, 'Sechseck über Kante: (3√3/2)·s²·10');
    // Langloch Gesamtlänge: Klicks = Enden; Fläche 2h·(L − 2h) + πh²
    ({ sk, v } = await draw('slotov', [[0, 0], [40, 0], [20, 5]]));
    const arcs = sk.curves.filter(c => c.type === 'arc'), p3 = P(sk);
    const h = arcs[0].r, cc = arcs.map(a => p3.get(a.c)), Lc = Math.hypot(cc[1].x - cc[0].x, cc[1].y - cc[0].y);
    near(Lc + 2 * h, 40, 0.5, `Gesamtlänge ≈ 40 (${(Lc + 2 * h).toFixed(3)})`);
    near(h, 5, 0.5, 'halbe Breite ≈ 5');
    near(v, (2 * h * Lc + Math.PI * h * h) * 10, 1e-3, 'Langloch: (2h·Lc + πh²)·10');
    // Langloch Mittelpunkt: erster Klick = Mitte, Bogenmitten symmetrisch dazu
    ({ sk, v } = await draw('slotc', [[0, 0], [15, 0], [0, 5]]));
    const a4 = sk.curves.filter(c => c.type === 'arc'), p4 = P(sk), c4 = a4.map(a => p4.get(a.c));
    near(Math.hypot((c4[0].x + c4[1].x) / 2, (c4[0].y + c4[1].y) / 2), 0, 0.5, 'Mitte zwischen den Bögen am ersten Klick');
    near(Math.hypot(c4[1].x - c4[0].x, c4[1].y - c4[0].y), 30, 2.5, 'Bogenmitten ≈ 30 auseinander (Raster)');
    near(v, (2 * a4[0].r * Math.hypot(c4[1].x - c4[0].x, c4[1].y - c4[0].y) + Math.PI * a4[0].r ** 2) * 10, 1e-3, 'Fläche × 10');
    // Bogen-Langloch: Mitte 0/0, Anfang 20/0, Ende 0/20 (90°), Breite bis r 25 → h 5; Fläche = Winkel·R·2h + πh²
    ({ sk, v } = await draw('slotarc', [[0, 0], [20, 0], [0, 20], [0, 25]]));
    const mid = sk.curves.find(c => c.type === 'arc' && c.cons);
    const hh = sk.curves.filter(c => c.type === 'arc' && !c.cons).map(c => c.r).sort((x, y) => x - y)[0];
    const caps = sk.curves.filter(c => c.type === 'arc' && !c.cons && Math.abs(Math.abs(c.r - mid.r) - hh) < 1e-6);
    let sw = mid.a1 - mid.a0; while (sw <= 0) sw += 2 * Math.PI;
    near(mid.r, 20, 0.5, `Mittellinie R ≈ 20 (${mid.r.toFixed(3)})`);
    near(sw * 180 / Math.PI, 90, 2, `Winkel ≈ 90° (${(sw * 180 / Math.PI).toFixed(2)})`);
    near(hh, 5, 0.5, 'halbe Breite ≈ 5');
    expect(caps.length === 2, 'Außen- und Innenbogen');
    near(v, (sw * mid.r * 2 * hh + Math.PI * hh * hh) * 10, 1e-3, `Fläche × 10 (≈ 125π·10 = ${(125 * Math.PI * 10).toFixed(1)})`);
    // Bogen-Langloch über 3 Punkte: Anfang 20/0, Ende −20/0, Punkt 0/20 → Halbkreis R 20 (180°), Breite bis r 26 → h 6
    ({ sk, v } = await draw('slotarc3', [[20, 0], [-20, 0], [0, 20], [0, 26]]));
    const m3 = sk.curves.find(c => c.type === 'arc' && c.cons);
    const h3 = sk.curves.filter(c => c.type === 'arc' && !c.cons).map(c => c.r).sort((x, y) => x - y)[0];
    let sw3 = m3.a1 - m3.a0; while (sw3 <= 0) sw3 += 2 * Math.PI;
    near(m3.r, 20, 0.5, `3 Punkte: R ≈ 20 (${m3.r.toFixed(3)})`);
    near(sw3 * 180 / Math.PI, 180, 3, `über den Punkt oben: ≈ 180° (${(sw3 * 180 / Math.PI).toFixed(2)})`);
    expect(Math.sin(m3.a0 + sw3 / 2) > 0.9, `Bogen läuft oben herum durch den dritten Punkt (Mitte bei ${((m3.a0 + sw3 / 2) * 180 / Math.PI).toFixed(1)}°)`);
    near(v, (sw3 * m3.r * 2 * h3 + Math.PI * h3 * h3) * 10, 1e-3, 'Fläche × 10');
  }],
  ['Skizze: Kreis tangential an 2 und an 3 Linien', async () => {
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    // rechtwinkliges Dreieck (10,10)–(50,10)–(10,40): Katheten 40 und 30, Hypotenuse 50
    C.editor.setTool('line');
    sketchClick(10, 10); sketchClick(50, 10); sketchClick(10, 40); sketchClick(10, 10);
    await sleep(150);
    expect(C.editor.f.curves.filter(c => c.type === 'line').length === 3, 'Dreieck aus drei Linien');
    const circ = () => { const sk = C.editor.f, pm = new Map(sk.points.map(p => [p.id, p])); return sk.curves.filter(c => c.type === 'circle').map(c => ({ id: c.id, x: pm.get(c.c).x, y: pm.get(c.c).y, r: c.r })); };
    // 2 Linien: Katheten, Zeiger bei (15,15) → Mitte auf der Winkelhalbierenden (15,15), R 5
    C.editor.setTool('tcircle2');
    sketchClick(40, 10); sketchClick(10, 35); sketchClick(15, 15);
    await sleep(150);
    const k2 = circ()[0];
    expect(k2 && Math.abs(k2.x - k2.y) < 1e-6 && Math.abs(k2.r - (k2.x - 10)) < 1e-6, `Kreis berührt beide Katheten (${JSON.stringify(k2)})`);
    near(k2.r, 5, 0.2, 'R ≈ 5 am Zeiger');
    // 3 Linien: Inkreis, r = (a + b − c) / 2 = (40 + 30 − 50) / 2 = 10, Mitte (20,20)
    C.editor.setTool('tcircle3');
    sketchClick(40, 10); sketchClick(10, 35); sketchClick(30, 25);
    await sleep(200);
    const k3 = circ().find(c => c.id !== k2.id);
    expect(k3 && Math.abs(k3.x - 20) < 1e-6 && Math.abs(k3.y - 20) < 1e-6 && Math.abs(k3.r - 10) < 1e-6, `Inkreis Mitte 20/20, R 10 (${JSON.stringify(k3)})`);
    expect(C.editor.f.rules.filter(r => r.type === 'tangent' && r.b === k3.id).length === 3, 'drei Tangentenbedingungen');
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Skizze: Unterbrechen an Schnittpunkten', async () => {
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    const line = async (a, b) => { C.editor.setTool('line'); sketchClick(...a); sketchClick(...b); C.editor.setTool(null); await sleep(60); };
    await line([0, 30], [60, 30]); await line([20, 20], [20, 40]); await line([40, 20], [40, 40]);
    const n0 = C.editor.f.curves.length;
    C.editor.setTool('brk');
    sketchClick(30, 30); await sleep(150);
    let sk = C.editor.f, pm = new Map(sk.points.map(p => [p.id, p]));
    const hl = sk.curves.filter(c => c.type === 'line' && Math.abs(pm.get(c.p1).y - 30) < 1e-6 && Math.abs(pm.get(c.p2).y - 30) < 1e-6);
    const lens = hl.map(c => Math.hypot(pm.get(c.p2).x - pm.get(c.p1).x, pm.get(c.p2).y - pm.get(c.p1).y)).sort((a, b) => a - b);
    expect(sk.curves.length === n0 + 2 && hl.length === 3, `waagerechte Linie in 3 Teile (${hl.length})`);
    expect(lens.every(l => Math.abs(l - 20) < 1e-6), `Teile 20/20/20 (${lens.map(l => l.toFixed(3)).join('/')})`);
    const ids = hl.flatMap(c => [c.p1, c.p2]);
    expect(new Set(ids).size === 4, 'Teile hängen an gemeinsamen Trennpunkten');
    // Kreis R 20 um (100,30), Linie durch die Mitte → zwei Halbbögen
    C.editor.setTool('circle'); sketchClick(100, 30); sketchClick(120, 30); C.editor.setTool(null); await sleep(60);
    await line([70, 30.5], [130, 30.5]);
    C.editor.setTool('brk');
    sketchClick(100, 50); await sleep(150);
    sk = C.editor.f; pm = new Map(sk.points.map(p => [p.id, p]));
    const arcs = sk.curves.filter(c => c.type === 'arc');
    expect(arcs.length === 2 && arcs[0].c === arcs[1].c && !sk.curves.some(c => c.type === 'circle'), 'Kreis → zwei Bögen um denselben Mittelpunkt');
    const sw = arcs.map(a => a.a1 - a.a0).sort((a, b) => a - b);
    expect(Math.abs(sw[0] + sw[1] - 2 * Math.PI) < 1e-6 && arcs.every(a => Math.abs(a.r - 20) < 1e-6), `zusammen 360°, R 20 (${sw.map(v => (v * 180 / Math.PI).toFixed(2)).join(' + ')})`);
    // senkrechte Linie x = 20 wird nur bei y = 30 geschnitten
    const n1 = C.editor.f.curves.length;
    C.editor.setTool('brk'); sketchClick(20, 22); await sleep(100);
    expect(C.editor.f.curves.length === n1 + 1, 'Linie mit nur einem Schnittpunkt → 2 Teile');
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Fläche teilen an einer Ebene (Körper bleibt ganz)', async () => {
    await newDoc(); await box(40, 40, 40);
    const bb = C.lastBuild.mesh.bbox, nf0 = C.lastBuild.mesh.faces.length;
    // Ursprungsebene, die den Würfel mittig durchläuft (0 liegt innerhalb)
    const key = [['YZ', 0], ['XZ', 1], ['XY', 2]].find(([, k]) => bb[0][k] < -1 && bb[1][k] > 1);
    expect(key, `eine Ursprungsebene schneidet den Würfel (${JSON.stringify(bb)})`);
    await cmd('solid:modify', 'splitface');
    expect(C.doc.features.length && q('#dialog').textContent.includes('Flächen teilen'), 'Dialog mit Ergebnis „Flächen teilen“');
    click(`#dialog [data-cmd="mplane"][data-key="${key[0]}"]`); await sleep(100);
    await ok();
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'split' && f.mode === 'faces' && /^Fläche teilen/.test(f.name), `Feature „${f.name}“`);
    expect(C.lastBuild.bodies.length === 1, 'weiterhin ein Körper');
    near(await vol(C.lastBuild.bodies[0]), 64000, 1e-3, 'Volumen unverändert 40³');
    expect(C.lastBuild.mesh.faces.length === nf0 + 4, `4 Seitenflächen geteilt (${nf0} → ${C.lastBuild.mesh.faces.length})`);
    // die vier zur Ebene senkrechten Flächen liegen jetzt als je zwei Hälften vor
    const k = key[1], half = faces().filter(x => x.info.type === 'PLANE' && Math.abs(x.info.n[k]) < 1e-9);
    expect(half.length === 8, `8 Seitenflächen (${half.length})`);
  }],
  ['Fläche teilen: nur gewählte Flächen', async () => {
    await newDoc(); await box(40, 40, 40);
    const id = C.lastBuild.bodies[0], p0 = await C.kernel.props(id), bb = C.lastBuild.mesh.bbox;
    expect(p0.faces === 6, `Würfel hat 6 Flächen (${p0.faces})`);
    // Ursprungsebene quer durch den Würfel, die die +X-Fläche halbiert (nicht YZ)
    const key = [['XZ', 1], ['XY', 2]].find(([, k]) => bb[0][k] < -1 && bb[1][k] > 1);
    expect(key, `eine Ursprungsebene schneidet den Würfel (${JSON.stringify(bb)})`);
    await cmd('solid:modify', 'splitface');
    click(`#dialog [data-cmd="mplane"][data-key="${key[0]}"]`); await sleep(100);
    click('#dialog [data-cmd="split-faces"]'); await sleep(250);
    expect(/Flächen im Modell anklicken/.test(q('#dialog').textContent), 'Hinweis: Flächen anklicken, die geteilt werden');
    const side = faces().find(x => x.info.type === 'PLANE' && x.info.n[0] > 0.99);
    expect(side, 'Seitenfläche nach +X');
    pick(side); await sleep(400);
    expect(/1 Fläche gewählt/.test(q('#dialog').textContent), '1 Fläche gewählt');
    await ok();
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'split' && f.mode === 'faces' && (f.faces || []).length === 1, `Feature mit 1 Flächenbezug (${(f.faces || []).length})`);
    const p1 = await C.kernel.props(id);
    near(p1.volume, 64000, 1e-3, 'Volumen unverändert 40³');
    near(p1.area, 9600, 1e-3, 'Oberfläche unverändert');
    expect(p1.faces === 7, `nur die gewählte Fläche geteilt (${p0.faces} → ${p1.faces})`);
    // die gewählte Fläche liegt als zwei Hälften vor, die anderen Seitenflächen sind ganz geblieben
    const xH = faces().filter(x => x.info.type === 'PLANE' && Math.abs(x.info.n[0]) > 0.99);
    expect(xH.length === 3, `+X zwei Hälften, −X ganz (${xH.length})`);
    const k = key[1], o = 3 - k; // Achse der anderen Seitenflächen (Y oder Z)
    expect(xH.filter(x => x.info.center[0] > 19).length === 2 && xH.some(x => x.info.center[k] < -1) && xH.some(x => x.info.center[k] > 1), 'Hälften beiderseits der Ebene');
    expect(faces().filter(x => x.info.type === 'PLANE' && Math.abs(x.info.n[o]) > 0.99).length === 2, 'die anderen Seitenflächen unverändert');
  }],
  ['Arbeitsebene entlang Pfad (senkrecht auf Kante)', async () => {
    await newDoc(); await box(40, 40, 40);
    // senkrechte Kante bei x = y = 20 mit R 10 verrunden → Viertelbogen oben um (10,10,40)
    await cmd('solid:modify', 'fillet');
    const V = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-9 && e.info.mid[0] > 19 && e.info.mid[1] > 19);
    pick(V); num('radius', 10); await ok();
    const arc = edges().find(e => e.info.type === 'CIRCLE' && Math.abs(e.info.mid[2] - 40) < 1e-6);
    expect(arc, 'Bogenkante oben');
    await cmd('solid:construct', 'plane'); click('#dialog [data-cmd="plane-mode"][data-m="path"]'); await sleep(150);
    pick(arc); await sleep(150);
    expect(/Kante, 15,7/.test(q('#dialog').textContent), `Pfadlänge π·10/2 ≈ 15,71 (${(q('#dialog .pref') || {}).textContent})`);
    num('pos', 50); await ok();
    const pl = C.vp.workPlanes[C.vp.workPlanes.length - 1].plane, c = 10 + 10 * Math.SQRT1_2;
    near(pl.o[0], c, 0.05, 'Ursprung x = 10 + 10·cos 45°'); near(pl.o[1], c, 0.05, 'Ursprung y'); near(pl.o[2], 40, 1e-6, 'Ursprung z');
    near(Math.abs(pl.n[0]), Math.SQRT1_2, 1e-3, 'Normale tangential |x|'); near(Math.abs(pl.n[1]), Math.SQRT1_2, 1e-3, 'Normale |y|');
    expect(pl.n[0] * pl.n[1] < 0 && Math.abs(pl.n[2]) < 1e-9, 'Normale ±(−1, 1, 0)/√2');
    // gerade Kante: senkrechte Kante gegenüber, 25 % → Ebene waagerecht bei z = 10 bzw. 30
    await cmd('solid:construct', 'plane'); click('#dialog [data-cmd="plane-mode"][data-m="path"]'); await sleep(150);
    const V2 = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-9 && e.info.mid[0] < -19 && e.info.mid[1] < -19);
    pick(V2); num('pos', 25); await ok();
    const p2 = C.vp.workPlanes[C.vp.workPlanes.length - 1].plane;
    expect(Math.abs(Math.abs(p2.n[2]) - 1) < 1e-9 && [10, 30].some(z => Math.abs(p2.o[2] - z) < 1e-6), `waagerecht bei z = 10 oder 30 (${p2.o.map(v => v.toFixed(3))})`);
  }],
  ['Steg in einer Schale (bis zum Körper verlängert / wie gezeichnet)', async () => {
    await newDoc(); await box(100, 60, 20);
    await cmd('solid:modify', 'shell');
    const top = faces().find(x => x.info.type === 'PLANE' && x.info.n[2] > 0.99);
    pick(top); num('thickness', 2); await ok();
    const v0 = await vol(C.lastBuild.bodies[0]);
    near(v0, 100 * 60 * 20 - 96 * 56 * 18, 1e-3, 'Schale 2 mm, oben offen');
    // Linie y = 0 von x = −20 bis 20 auf XY (Boden außen bei z = 0)
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
    C.editor.setTool('line'); sketchClick(-20, 0); sketchClick(20, 0); C.editor.setTool(null); await sleep(100);
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    await cmd('solid:create', 'web');
    num('thickness', 2); num('depth', 10); await ok();
    expect(C.lastBuild.bodies.length === 1, 'ein Körper');
    // verlängert bis an die Innenwände: 96 lang, 2 dick, im Hohlraum 10 − 2 = 8 hoch
    near(await vol(C.lastBuild.bodies[0]) - v0, 96 * 2 * 8, 1e-3, 'Steg 96 × 2 × 8 dazu');
    expect(/bis zum Körper verlängert/.test(C.lastBuild.status[C.doc.features[C.doc.features.length - 1].id].info || ''), 'Meldung: verlängert');
    // wie gezeichnet: 40 lang
    editTimeline(C.doc.features.length - 1); await sleep(300);
    await seg('extend', 'false'); await ok();
    near(await vol(C.lastBuild.bodies[0]) - v0, 40 * 2 * 8, 1e-3, 'Steg 40 × 2 × 8 dazu');
  }],
  ['Verjüngungs-Analyse (Formschräge prüfen)', async () => {
    await newDoc(); await box(40, 40, 40);
    click('[data-rtab="solid"]'); await sleep(100);
    await cmd('solid:inspect', 'draftan');
    expect(D.body.dataset.mode === 'draftan' && q('#dialog [data-da="dir"]'), 'Analyse offen');
    const sum = () => [...D.querySelectorAll('#dialog .ohsum b')].map(b => b.textContent);
    let s = sum();
    expect(s[0].startsWith('1.600 mm²') && s[1].startsWith('6.400 mm²') && s[2].startsWith('1.600 mm²'), `Würfel +Z, 1°: oben grün, Seiten gelb, unten rot (${s.join(' | ')})`);
    const col = C.vp.model.geo.getAttribute('color');
    expect(col && col.count === C.vp.model.geo.getAttribute('position').count, 'Flächen eingefärbt');
    const two = q('#dialog [data-da="two"]'); two.value = '1'; two.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    s = sum();
    expect(s.length === 2 && s[0].startsWith('3.200 mm²') && s[1].startsWith('6.400 mm²'), `beidseitig: oben + unten grün (${s.join(' | ')})`);
    click('#dialog [data-cmd="draftan-close"]'); await sleep(100);
    expect(!C.vp.model.geo.getAttribute('color') && D.body.dataset.mode === 'model', 'geschlossen: Farben zurück');
    // Seiten 3° Formschräge (neutrale Ebene unten) → Seiten zeigen leicht nach oben
    await cmd('solid:modify', 'draft');
    pick(faces().find(f => f.info.type === 'PLANE' && f.info.n[2] < -0.9));
    faces().filter(f => f.info.type === 'PLANE' && Math.abs(f.info.n[2]) < 0.1).forEach(pick);
    num('angle', 3); await ok();
    await cmd('solid:inspect', 'draftan');
    const tw = q('#dialog [data-da="two"]'); tw.value = '0'; tw.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    const { draftStats } = await import('../src/draft-ui.js');
    const m = C.lastBuild.mesh, st1 = draftStats(m, [0, 0, 1], 1, false), st5 = draftStats(m, [0, 0, 1], 5, false);
    expect(st1.low < 1e-6 && Math.abs(st1.under - 1600) < 1e-3, `3° ≥ 1°: keine gelben Flächen, unten 1600 rot (${Math.round(st1.ok)}/${Math.round(st1.low)}/${Math.round(st1.under)})`);
    expect(Math.abs(st5.low - (st1.ok - st5.ok)) < 1e-6 && st5.low > 5000, `Mindestschräge 5°: Seiten wieder gelb (${Math.round(st5.low)} mm²)`);
    s = sum();
    expect(s[1].startsWith('0 mm²'), `Anzeige: 0 mm² zu wenig (${s.join(' | ')})`);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100);
    expect(D.body.dataset.mode === 'model', 'Esc schließt');
  }],
  ['Stückliste im Modell (Fenster und CSV)', async () => {
    await openExample('Winkel mit Rippe verschraubt');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="bom"]'); await sleep(200);
    const rows = [...D.querySelectorAll('#dialog .bomtab tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
    const row = name => rows.find(r => r[2].startsWith(name)) || [];
    expect(rows.length === 4, `4 Positionen (${rows.map(r => r.join(' / ')).join(' || ')})`);
    expect(row('Winkel')[1] === '1' && row('Winkel')[4] === '80 × 60 × 50' && row('Winkel')[5] === '414,6 g', 'Winkel 1 Stk, 80 × 60 × 50, 414,6 g');
    expect(row('ISO 4762')[1] === '4' && row('ISO 4762')[4] === '38 × 13 × 13', 'Zylinderschraube M8×30: 4 Stk, 8 Kopf + 30 Schaft = 38, Kopf ⌀13');
    expect(row('ISO 7089')[1] === '4' && row('ISO 7089')[4] === '16 × 16 × 1,6', 'Scheibe M8: ⌀16 × 1,6');
    expect(row('ISO 4032')[1] === '4' && / 6,8$/.test(row('ISO 4032')[4]), 'Mutter M8: Höhe 6,8');
    const foot = [...D.querySelectorAll('#dialog .bomtab tfoot td')].map(td => td.textContent);
    expect(foot[1] === '13', `Summe 13 Teile (${foot[1]})`);
    // CSV abfangen
    const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
    let got = null;
    proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
    try { click('#dialog [data-cmd="bom-csv"]'); await waitFor(() => got, 5000, 'Download'); } finally { proto.click = orig; }
    const txt = await (await W.fetch(got.href)).text(), lines = txt.replace(/^﻿/, '').split('\r\n');
    expect(/Stückliste\.csv$/.test(got.name) && lines[0].startsWith('Pos.;Menge;Benennung') && lines.length === 6, `CSV: Kopf, 4 Zeilen, Summe (${lines.length} Zeilen)`);
    const per = lines.slice(1, 5).map(l => l.split(';')), tot = Number(lines[5].split(';')[6].replace(/\./g, '').replace(',', '.'));
    const sum = per.reduce((a, c) => a + Number(c[6].replace(/\./g, '').replace(',', '.')), 0);
    near(tot, sum, 0.11, 'Summe der Massen = Summe der Zeilen');
    expect(per.every(c => Math.abs(Number(c[6].replace(/\./g, '').replace(',', '.')) - Number(c[1]) * Number(c[5].replace(/\./g, '').replace(',', '.'))) < 0.11), 'gesamt = Menge × Masse je Stück');
    click('#dialog [data-cmd="file-cancel"]'); await sleep(100);
    // Einzelteil: eine Zeile
    await openExample('Winkel 80x60x8');
    click('[data-cmd="bom"]'); await sleep(200);
    expect(D.querySelectorAll('#dialog .bomtab tbody tr').length === 1, 'Einzelteil: eine Zeile');
    click('#dialog [data-cmd="file-cancel"]'); await sleep(100);
  }],
  ['Ableiten: Körper aus einem anderen Dokument (verknüpft)', async () => {
    await newDoc();
    click('[data-rtab="solid"]'); await sleep(100);
    await cmd('solid:insert', 'derive');
    await waitFor(() => q('#dialog [data-cmd="file-pick"]'), 5000, 'Dateiliste');
    expect(/Ableiten aus/.test(q('#dialog').textContent), 'Dialog „Ableiten aus …“');
    const btn = [...D.querySelectorAll('#dialog [data-cmd="file-pick"]')].find(b => b.dataset.path === 'Beispiele/Winkel mit Rippe verschraubt.cantcodecad');
    expect(btn, 'Beispiel in der Liste');
    const prev = C.lastBuild;
    btn.click();
    await waitFor(() => C.lastBuild !== prev && C.lastBuild.bodies.length, 20000, 'Neuaufbau');
    await sleep(200);
    const f = C.doc.features.find(x => x.type === 'derive');
    expect(f && f.file === 'Beispiele/Winkel mit Rippe verschraubt.cantcodecad' && f.part && f.part.features.length, 'Feature mit Datei und Teilestand');
    expect(C.lastBuild.bodies.length === 13 && C.lastBuild.bodies.every(id => id.startsWith(f.id + ':')), `13 Körper übernommen (${C.lastBuild.bodies.length})`);
    const names = C.lastBuild.bodies.map(id => C.doc.bodies[id] && C.doc.bodies[id].name);
    expect(names.includes('Winkel') && names.some(n => /^ISO 4762/.test(n || '')), `Namen aus dem Dokument (${names.slice(0, 3).join(', ')} …)`);
    const wid = C.lastBuild.bodies.find(id => C.doc.bodies[id].name === 'Winkel');
    expect(C.doc.bodies[wid].material === 'steel', 'Werkstoff übernommen');
    // nur den Winkel ableiten: 414,6 g Stahl → 52,8 cm³
    editTimeline(C.doc.features.indexOf(f)); await sleep(300);
    const cbs = [...D.querySelectorAll('#dialog [data-dv]')];
    expect(cbs.length >= 13, `Körperliste im Dialog (${cbs.length})`);
    const cw = cbs.find(x => /Winkel/.test(x.parentElement.textContent));
    cw.checked = true; cw.dispatchEvent(new W.Event('change', { bubbles: true }));
    await ok();
    expect(C.lastBuild.bodies.length === 1, 'nur der Winkel');
    near(await vol(C.lastBuild.bodies[0]) * 7.85 / 1000, 414.6, 0.1, 'Masse 414,6 g wie im Dokument');
    // Lage bleibt: gleicher Hüllquader wie im Original
    const bb = C.lastBuild.mesh.bbox;
    const dm = [0, 1, 2].map(k => bb[1][k] - bb[0][k]).sort((a, b) => b - a);
    expect(Math.abs(dm[0] - 80) < 1e-6 && Math.abs(dm[1] - 60) < 1e-6 && Math.abs(dm[2] - 50) < 1e-6, `80 × 60 × 50 wie im Dokument (${dm.map(v => v.toFixed(2)).join(' × ')})`);
  }],
  ['Abrundung variabel mit Zwischenpunkt', async () => {
    // Würfel 40, senkrechte Kante: R 2 an beiden Enden, Zwischenpunkt in der Mitte (50 %) mit R 6. OpenCASCADE
    // interpoliert glatt; an den Stützstellen gilt der Radius genau: eine Scheibe 0,2 mm dick fehlt um (1 − π/4)·r²·0,2.
    await newDoc(); await box(40, 40, 40);
    await cmd('solid:modify', 'fillet');
    await seg('variable', 'true');
    const V = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-9);
    pick(V); num('radius', 2); num('radius2', 2);
    click('#dialog [data-cmd="vpt-add"]'); await sleep(200);
    const it = q('#dialog input[data-vpt="0"][data-vk="r"]'); it.value = '6'; it.dispatchEvent(new W.Event('input', { bubbles: true }));
    await ok(30000);
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.vpts && f.vpts.length === 1 && f.vpts[0].t === 0.5 && f.vpts[0].r === 6, `gespeichert: ein Zwischenpunkt 50 % / 6 mm (${JSON.stringify(f.vpts)})`);
    const miss = await C.kernel.call('devEval', { code: `
      const b = ctx.bodies()[0].shape, s = (z0, z1) => 40 * 40 * (z1 - z0) - ctx.safeVolume(b.clone().intersect(R.makeBox([-100, -100, z0], [100, 100, z1])));
      return [s(0, 0.2), s(19.9, 20.1), s(39.8, 40)];` });
    const k = (1 - Math.PI / 4) * 0.2;
    near(miss[1], k * 36, 0.02, 'Mitte R 6');
    near(miss[0], k * 4, 0.01, 'unten R 2'); near(miss[2], k * 4, 0.01, 'oben R 2');
    // ohne Zwischenpunkt (entfernen): wieder konstant R 2
    editTimeline(C.doc.features.length - 1); await sleep(400);
    click('#dialog [data-cmd="vpt-del"][data-i="0"]'); await sleep(200); await ok();
    expect(!('vpts' in C.doc.features[C.doc.features.length - 1]), 'ohne Zwischenpunkte kein Feld');
    near(64000 - await vol(C.lastBuild.bodies[0]), (1 - Math.PI / 4) * 4 * 40, 1e-3, 'R 2 → R 2 konstant');
  }],
  ['Abrundung mit variablem Radius', async () => {
    await newDoc(); await box(40, 40, 40);
    await cmd('solid:modify', 'fillet');
    await seg('variable', 'true');
    expect(q('#dialog [data-k="radius2"]'), 'Feld Radius Ende');
    const V = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-9);
    pick(V); num('radius', 2); num('radius2', 8); await ok();
    // Endquerschnitte exakt: an z = 0 Viertelkreis R 2, an z = 40 R 8 (Bogenmitte = Ecke + r·(1 − 1/√2) diagonal)
    const ends = edges().filter(e => e.info.type !== 'LINE' && Math.abs(e.info.p0[2] - e.info.p1[2]) < 1e-6);
    const corner = V.info.mid, endR = z => { const e = ends.find(x => Math.abs(x.info.mid[2] - z) < 1e-6); if (!e) return null; const d = Math.hypot(e.info.mid[0] - corner[0], e.info.mid[1] - corner[1]); return d / (Math.SQRT2 - 1); };
    near(endR(0), 2, 1e-3, 'Querschnitt unten R 2'); near(endR(40), 8, 1e-3, 'Querschnitt oben R 8');
    // Volumen zwischen konstantem R 2 und R 8, nahe am linearen Mittel (OpenCASCADE-Hüllfläche weicht wenige % ab)
    const cut = 64000 - await vol(C.lastBuild.bodies[0]), lin = (1 - Math.PI / 4) * 40 * (4 + 16 + 64) / 3;
    expect(cut > (1 - Math.PI / 4) * 40 * 4 && cut < (1 - Math.PI / 4) * 40 * 64 && Math.abs(cut / lin - 1) < 0.05, `abgetragen ${cut.toFixed(1)} mm³ ≈ linear ${lin.toFixed(1)}`);
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.variable === true && f.radius2 === 8, 'gespeichert: variabel, Ende 8');
    // umgekehrt: gleiches Volumen (symmetrisch), aber großer Radius am anderen Ende
    const bbTop = () => { const fs = faces().filter(x => x.info.type !== 'PLANE'); return fs.length; };
    expect(bbTop() >= 1, 'Rundungsfläche vorhanden');
  }],
  ['Begrenzungsfüllung: Hohlraum füllen und an einer Ebene teilen', async () => {
    // Würfel 40 (x, y ±20, z 0…40) hohl mit Wand 2 → Hohlraum 36³ = 46656 mm³ (x, y ±18, z 2…38).
    // Mit der Ebene XZ zwei Zellen zu je 23328 mm³; nur die zweite (y > 0) gewählt → Körper y 0…18.
    await newDoc(); await box(40, 40, 40);
    const tool = C.lastBuild.bodies[0];
    await cmd('solid:modify', 'shell'); await seg('hollow', 'true'); num('thickness', 2); await ok();
    near(await vol(tool), 64000 - 46656, 1e-3, 'Hohlwürfel');
    await cmd('solid:create', 'boundfill');
    const f = C.editing.feature, cells = () => { const st = C.lastBuild.status[f.id]; return (st && st.cells) || []; };
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.99)); await sleep(100);
    expect(f.bodies.length === 1 && f.bodies[0] === tool, 'Werkzeugkörper gewählt');
    await waitFor(() => cells().length === 1, 15000, 'eine Zelle');
    near(cells()[0].volume, 46656, 1e-3, 'Zelle = Hohlraum 36³');
    click('#dialog [data-cmd="bf-oplane"][data-key="XZ"]');
    await waitFor(() => cells().length === 2, 15000, 'zwei Zellen');
    cells().forEach((c, i) => near(c.volume, 23328, 1e-3, `Zelle ${i + 1} halber Hohlraum`));
    expect(cells()[0].center[1] < 0 && cells()[1].center[1] > 0, 'Reihenfolge nach Schwerpunkt (y)');
    click('#dialog [data-cmd="bf-cell"][data-i="0"]'); await sleep(100);
    expect(JSON.stringify(f.cells) === '[1]', `nur Zelle 2 gewählt (${JSON.stringify(f.cells)})`);
    await ok();
    const neu = C.lastBuild.bodies.find(id => id !== tool);
    expect(C.lastBuild.bodies.length === 2 && neu, 'Werkzeug bleibt, neuer Körper dazu');
    near(await vol(neu), 23328, 1e-3, 'gefüllte Zelle');
    const bb = await bbox(neu);
    [[-18, 0, 2], [18, 18, 38]].forEach((c, i) => c.forEach((v, k) => near(bb[i][k], v, 1e-6, `Hülle [${i}][${k}]`)));
    near(await vol(tool), 64000 - 46656, 1e-3, 'Werkzeug unverändert');
    // „Werkzeugkörper entfernen“: nur die Füllung bleibt
    editTimeline(C.doc.features.findIndex(x => x.id === f.id)); await sleep(400);
    await seg('removeTools', 'true'); await ok();
    expect(C.lastBuild.bodies.length === 1 && C.lastBuild.bodies[0] === neu, `nur die Füllung bleibt (${C.lastBuild.bodies.length})`);
  }],
  ['Volumetrisches Gitter: Gyroid füllt einen Quader bis auf die Flächen', async () => {
    // Quader 20³ = 8000 mm³ (x, y ±10, z 0…20) mit Gitterzelle 10 und Wand 3: die Stege enden exakt auf
    // den sechs Flächen, die Dichte liegt bei diesen Werten bei rund 56 % (gemessen, Beispiel „Gitter in einem Quader“).
    await newDoc(); await box(20, 20, 20);
    const src = C.lastBuild.bodies[0];
    await cmd('solid:create', 'gitter');
    const f = C.editing.feature;
    expect(f.type === 'gitter' && f.typ === 'gyroid' && f.op === 'new', 'Feature „Volumetrisches Gitter“ mit Gyroid angelegt');
    num('zelle', 10); num('dicke', 3);
    await ok(60000);
    const id = f.id, st = () => C.lastBuild.status[id], bearbeiten = () => editTimeline(C.doc.features.findIndex(x => x.id === id));
    expect(st() && st().ok, `Gitter gebaut (${st() && st().error || ''})`);
    expect(!st().warn, `Auflösung passt zur Wandstärke (${st().warn || ''})`);
    expect(/Netzkörper/.test(st().info || '') && /% Material/.test(st().info || ''), `Meldung: ${st().info}`);
    const neu = C.lastBuild.bodies.find(b => b !== src);
    expect(C.lastBuild.bodies.length === 2 && neu, `Quader bleibt, Gitter ist ein zweiter Körper (${C.lastBuild.bodies.length})`);
    const gv = await vol(neu);
    expect(gv > 0.5 * 8000 && gv < 0.62 * 8000, `Gitter füllt 50…62 % des Körpers (${(100 * gv / 8000).toFixed(1)} %)`);
    const bb = await bbox(neu);
    [[-10, -10, 0], [10, 10, 20]].forEach((c, i) => c.forEach((v, k) => near(bb[i][k], v, 1e-6, `Hülle des Gitters [${i}][${k}]`)));
    near(await vol(src), 8000, 1e-3, 'Quader unverändert');
    // „Körper ersetzen“: der Quader verschwindet, das Gitter bleibt
    bearbeiten(); await sleep(400);
    await seg('op', 'replace'); await ok(60000);
    expect(C.lastBuild.bodies.length === 1 && C.lastBuild.bodies[0] === neu, `nur das Gitter bleibt (${C.lastBuild.bodies.length})`);
    // Wandstärke über der Gitterzelle: das Feature bleibt mit Fehler stehen
    bearbeiten(); await sleep(400);
    num('dicke', 12); await ok(20000);
    expect(st() && !st().ok && /Wandstärke muss kleiner sein/.test(st().error || ''), `Fehler: ${st() && (st().error || st().ok)}`);
  }],
  ['Vorgang „Neue Komponente“', async () => {
    // zweiter Quader mit Vorgang „Neue Komponente“: eigene Komponente mit genau diesem Körper, Volumen 10³
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:create', 'box'); num('w', 10); num('l', 10); num('h', 10); num('cx', 40);
    await seg('op', 'newcomp');
    expect(!/Objekte/.test(q('#dialog').textContent), 'keine Zielkörper-Auswahl bei „Neue Komponente“');
    await ok(20000);
    const f = C.doc.features[C.doc.features.length - 1], comps = C.doc.components || [];
    expect(comps.length === 1 && f.owner === comps[0].id && f.op === 'new', `Komponente angelegt und Besitzer (${comps.length}, ${f.op})`);
    await waitFor(() => comps[0].bodies.length === 1, 5000, 'Körper in der Komponente');
    const id = comps[0].bodies[0];
    expect(C.lastBuild.bodies.length === 2 && C.lastBuild.bodies.includes(id), 'zwei Körper, der neue in der Komponente');
    near(await vol(id), 1000, 1e-6, 'Quader 10³');
    expect(/Komponente 1/.test(q('#browser').textContent), 'Komponente im Browser');
  }],
  ['Kombinieren: Ergebnis als neue Komponente, Komponentenfarben', async () => {
    // Würfel 20 (z 0…20) minus Stab 10 × 10 × 30 in der Mitte → 8000 − 10·10·20 = 6000 mm³, Ergebnis in „Komponente 1“
    await newDoc(); await box(20, 20, 20);
    const tgt = C.lastBuild.bodies[0];
    await cmd('solid:create', 'box'); num('w', 10); num('l', 10); num('h', 30); await seg('op', 'new'); await ok(20000);
    const tool = C.lastBuild.bodies.find(id => id !== tgt);
    await cmd('solid:modify', 'combine');
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[0] > 0.99 && h.info.center[0] > 9.9)); await sleep(100);
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.99 && h.info.center[2] > 29.9)); await sleep(100);
    const f = C.editing.feature;
    expect(f.target[0] === tgt && f.tools[0] === tool, 'Ziel und Werkzeug gewählt');
    await seg('op', 'cut'); await seg('newComp', 'true');
    expect(/neue Komponente/.test(q('#dialog').textContent), 'Hinweis „neue Komponente“');
    await ok(20000);
    const comps = C.doc.components || [];
    expect(comps.length === 1 && JSON.stringify(comps[0].bodies) === JSON.stringify([tgt]), `Zielkörper in der neuen Komponente (${JSON.stringify(comps)})`);
    expect(!('newComp' in C.doc.features[C.doc.features.length - 1]), 'Schalter bleibt nicht im Feature');
    near(await vol(tgt), 6000, 1e-3, 'ausgeschnitten');
    expect(C.lastBuild.bodies.length === 1, 'Werkzeug entfernt');
    // Komponentenfarben: Körper der Komponente in der ersten Komponentenfarbe, aus = wieder die eigene Farbe
    const before = C.vp.bodyColors[tgt];
    click('[data-rtab="solid"]'); await sleep(100); click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="compcolors"]'); await sleep(150);
    expect(C.vp.bodyColors[tgt] === '#d77342', `Komponentenfarbe (${C.vp.bodyColors[tgt]})`);
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="compcolors"]'); await sleep(150);
    expect(C.vp.bodyColors[tgt] === before, 'aus: eigene Farbe zurück');
  }],
  ['Skizze: Polygon-Abhängigkeit', async () => {
    // unregelmäßiges Dreieck (5|5) (35|5) (15|30) → gleichseitig: drei gleiche Seiten, alle Winkel 60°
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(400);
    const E = C.editor;
    E.setTool('line'); sketchClick(5, 5); sketchClick(35, 5); E.setTool(null);
    E.setTool('line'); sketchClick(35, 5); sketchClick(15, 30); E.setTool(null);
    E.setTool('line'); sketchClick(15, 30); sketchClick(5, 5); E.setTool(null); await sleep(100);
    const ls = E.f.curves.filter(c => c.type === 'line' && !c.cons);
    expect(ls.length === 3, 'drei Linien');
    E.sel = new Set(ls.map(l => l.id)); E.applyConstraint('polygon'); await sleep(200);
    const pm = new Map(E.f.points.map(p => [p.id, p])), L = l => Math.hypot(pm.get(l.p2).x - pm.get(l.p1).x, pm.get(l.p2).y - pm.get(l.p1).y);
    const len = ls.map(L);
    expect(E.f.curves.some(c => c.type === 'circle' && c.cons), 'Hilfskreis angelegt');
    expect(Math.abs(len[0] - len[1]) < 1e-6 && Math.abs(len[0] - len[2]) < 1e-6 && len[0] > 1, `drei gleiche Seiten (${len.map(v => v.toFixed(4))})`);
    const a = pm.get(ls[0].p1), b = pm.get(ls[0].p2), c = pm.get(ls[1].p2);
    const ang = Math.acos(((b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y)) / (L(ls[0]) * Math.hypot(c.x - a.x, c.y - a.y))) * 180 / Math.PI;
    near(ang, 60, 1e-6, 'Winkel 60°');
    E.sel = new Set(ls.slice(0, 2).map(l => l.id)); const n0 = E.f.rules.length; E.applyConstraint('polygon');
    expect(E.f.rules.length === n0, 'zwei Linien: keine Regel, Hinweis');
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Nach Name auswählen: Körper über Namensmuster', async () => {
    // zwei Quader als eigene Körper; Muster ohne Platzhalter = „enthält“, mit * und ? = ganzer Name
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:create', 'box'); num('w', 10); num('l', 10); num('h', 10); num('cx', 40); await seg('op', 'new'); await ok(20000);
    expect(C.lastBuild.bodies.length === 2, 'zwei Körper');
    const names = C.lastBuild.bodies.map(id => C.doc.bodies[id].name);
    click('[data-menu="nav:filter"]'); await sleep(150);
    click('[data-cmd="szsel"]'); await sleep(150);
    const sel = q('#dialog [data-sz="kind"]'); sel.value = 'name'; sel.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(100);
    const set = v => { const i = q('#dialog [data-sz="text"]'); i.value = v; i.dispatchEvent(new W.Event('input', { bubbles: true })); };
    const info = () => q('#dialog .szinfo').textContent;
    set(names[1].toLowerCase()); expect(/^1 Körper/.test(info()), `„${names[1].toLowerCase()}“ → 1 Körper (${info()})`);
    set(names[0].slice(0, 3) + '*'); expect(/^2 Körper/.test(info()), `„${names[0].slice(0, 3)}*“ → 2 Körper (${info()})`);
    set('*' + names[0].slice(1, 3)); expect(/^0 Körper/.test(info()), `„*${names[0].slice(1, 3)}“ ganzer Name passt nicht → 0 (${info()})`);
    set(names[1].slice(0, -1) + '?'); expect(/^[12] Körper/.test(info()), `„…?“ ersetzt ein Zeichen (${info()})`);
    set(names[1]);
    click('#dialog [data-cmd="szsel-ok"]'); await sleep(150);
    const m = C.lastBuild.mesh, b1 = m.bodies.find(b => b.id === C.lastBuild.bodies[1]);
    expect(D.body.dataset.mode === 'model' && /Fläche/.test(q('#hint').textContent || ''), 'Vorauswahl im Modell');
    expect(b1 && b1.faces[1] - b1.faces[0] === 6, 'die 6 Flächen des zweiten Körpers');
  }],
  ['Nach Größe auswählen: Bohrungen ⌀8–10 → Elemente entfernen', async () => {
    await openExample('Winkel mit Rippe');
    const v0 = await vol(C.lastBuild.bodies[0]);
    click('[data-menu="nav:filter"]'); await sleep(150);
    click('[data-cmd="szsel"]'); await sleep(150);
    expect(/Nach Größe auswählen/.test(q('#dialog').textContent), 'Dialog offen');
    const set = (k, v) => { const i = q(`#dialog [data-sz="${k}"]`); i.value = v; i.dispatchEvent(new W.Event('input', { bubbles: true })); };
    set('kind', 'hole'); await sleep(50); // der Dialog merkt sich die zuletzt gewählte Art
    set('lo', 8); set('hi', 10); await sleep(50);
    const holes = faces().filter(f => f.info.type === 'CYLINDRE' && f.info.internal && f.info.full !== false && Math.abs(f.info.radius - 4.5) < 1e-6);
    expect(holes.length >= 4, `Bohrungsflächen ⌀9 im Modell (${holes.length})`);
    expect(q('#dialog .szinfo').textContent.startsWith(`${holes.length} Fläche`), `Anzeige: ${q('#dialog .szinfo').textContent}`);
    set('hi', 8.5); await sleep(50);
    expect(q('#dialog .szinfo').textContent.startsWith('0 Fläche'), 'bis ⌀8,5: keine');
    set('hi', 10); await sleep(50);
    click('#dialog [data-cmd="szsel-ok"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && /Fläche/.test(q('#hint').textContent || ''), 'Vorauswahl im Modell');
    // Elemente entfernen übernimmt die Vorauswahl
    click('[data-rtab="solid"]'); await sleep(100);
    await cmd('solid:modify', 'defeature');
    expect(q('#dialog').textContent.includes(`${holes.length} Flächen`), 'Vorauswahl übernommen');
    await ok();
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'defeature' && f.faces.length === holes.length, `gespeichert: ${f.faces.length} Flächen`);
    const dv = await vol(C.lastBuild.bodies[0]) - v0, t = dv / (4 * Math.PI * 4.5 * 4.5);
    expect(/4 Bohrungen/.test(C.lastBuild.status[f.id].info || ''), `4 Bohrungen gefüllt (${C.lastBuild.status[f.id].info})`);
    near(t, 8, 1e-3, 'gefülltes Volumen = 4 · π · 4,5² · 8 (Blechdicke 8)');
  }],
  ['Bohrung: modelliertes Gewinde mit Länge und Versatz', async () => {
    // Klotz 30 × 30 × 20, Gewindebohrung M8 (Kernloch 6,8) durch: modelliert über 20 mm. Länge 10 + Versatz 2 von oben:
    // Gewinde nur zwischen z 18 und z 8 – die Gewindemenge (Unterschied zum reinen Kernloch) halbiert sich, oben in
    // z 18…20 und unten in z 0…8 fehlt nur das Kernloch.
    await openExample('Gewindebohrung mit Teillänge');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.hg, 10000, 'Bohrung');
    const kern = 30 * 30 * 20 - Math.PI * 3.4 ** 2 * 20;
    const ganz = await vol(C.lastBuild.bodies[0]);
    expect(Math.abs(ganz - kern) > 50, `modelliert über die ganze Tiefe: Gewinde ändert das Volumen (${(ganz - kern).toFixed(2)} mm³)`);
    const i = C.doc.features.findIndex(f => f.id === 'hg');
    editTimeline(i); await sleep(400); await seg('tFull', 'false');
    num('tLen', 10); num('tOff', 2); await ok(30000);
    const teil = await vol(C.lastBuild.bodies[0]);
    near((teil - kern) / (ganz - kern), 0.5, 0.03, 'Länge 10 statt 20: halbe Gewindemenge');
    const slab = await C.kernel.call('devEval', { code: `
      const b = ctx.bodies()[0].shape, parts = b.solids && b.solids.length ? b.solids : [b], s = (z0, z1) => parts.reduce((v, p) => v + (ctx.safeVolume(p.clone().intersect(R.makeBox([0, 0, z0], [30, 30, z1]))) || 0), 0);
      return [s(18, 20), s(0, 8), s(10, 16)];` });
    const ring = (z0, z1) => (900 - Math.PI * 3.4 ** 2) * (z1 - z0);
    near(slab[0], ring(18, 20), 1e-3, 'Versatz oben (z 18…20): nur Kernloch');
    near(slab[1], ring(0, 8), 1e-3, 'unter dem Gewinde (z 0…8): nur Kernloch');
    expect(Math.abs(slab[2] - ring(10, 16)) > 5, `im Gewinde (z 10…16) Gewindegänge (${(slab[2] - ring(10, 16)).toFixed(2)} mm³)`);
    // Toleranzklasse 6H: die Zeichnung beschriftet die Bohrung mit „M8-6H“
    editTimeline(i); await sleep(400);
    const tc = q('#dialog select[data-k="tclass"]'); tc.value = '6H'; tc.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    await ok(30000);
    expect(C.doc.features[i].tclass === '6H', 'Toleranzklasse gespeichert');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    await waitFor(() => /M8-6H/.test(D.querySelector('#drawing .sheet svg').textContent), 10000, 'Beschriftung M8-6H');
    await closeDrawing();
  }],
  ['Bohrung: Lage in Kreismitte und nach Kantenmaßen', async () => {
    await openExample('Bohrung in Rundung und mit Kantenmaßen');
    const id = C.lastBuild.bodies[0];
    near(await vol(id), 46684.956, 1e-2, 'Beispiel: Platte mit zwei Bohrungen ohne Skizze');
    const axes = () => C.lastBuild.mesh.faces.filter(f => f.type === 'CYLINDRE' && f.radius < 5).map(f => [f.axisO[0], f.axisO[1]]);
    const has = (x, y) => axes().some(p => Math.abs(p[0] - x) < 1e-4 && Math.abs(p[1] - y) < 1e-4);
    expect(has(10, 10) && has(30, 20), `Bohrungsachsen in (10,10) und (30,20): ${JSON.stringify(axes())}`);
    const sel = k => D.querySelector(`#dialog select[data-segsel="${k}"]`);
    // weitere Kreiskante wählen: die Bohrung an Kreismitte kommt auch in die rechte vordere Rundung
    editTimeline(C.doc.features.findIndex(f => f.place === 'center')); await sleep(300);
    expect(sel('place') && sel('place').value === 'center', 'Lage steht auf Kreismitte');
    const arc = x => edges().find(e => e.info.type === 'CIRCLE' && Math.abs(e.info.mid[2] - 8) < 1e-6 && Math.abs(e.info.mid[0] - x) < 1e-3);
    expect(arc(2.928932), 'Bogenkante der ersten Rundung gefunden');
    expect(/1 runde Kante gewählt/.test(q('#dialog .hinfo').textContent), 'Dialog zeigt die gewählte Kante');
    pick(arc(97.071068));
    expect(/2 runde Kanten gewählt/.test(q('#dialog .hinfo').textContent), 'zweite Kante ist dazu genommen');
    pick(arc(97.071068));
    expect(/1 runde Kante gewählt/.test(q('#dialog .hinfo').textContent), 'Klick auf dieselbe Kante nimmt sie wieder ab');
    pick(arc(97.071068));
    await ok();
    near(await vol(id), 46458.761, 1e-2, 'zweite Bohrung in der rechten vorderen Rundung');
    expect(has(90, 10), 'Bohrung genau in der Mitte dieser Rundung');
    // Kantenmaße ändern: die Bohrung folgt den Abständen, ihr Werkstoff bleibt gleich
    editTimeline(C.doc.features.findIndex(f => f.place === 'edges')); await sleep(300);
    expect(sel('place') && sel('place').value === 'edges', 'Lage steht auf zwei Kanten');
    expect(q('#dialog input[data-k="offA"]') && q('#dialog input[data-k="offB"]'), 'Felder für beide Abstände');
    num('offA', 40);
    await ok();
    near(await vol(id), 46458.761, 1e-2, 'Bohrung bleibt vollständig durch die Platte');
    expect(has(30, 40), `Bohrung sitzt nach den neuen Abständen in (30,40): ${JSON.stringify(axes())}`);
    // Abstand weit über die Fläche hinaus: das Feature bleibt mit Fehler stehen
    editTimeline(C.doc.features.findIndex(f => f.place === 'edges')); await sleep(300);
    num('offA', 200);
    await ok();
    const st = C.lastBuild.status[C.doc.features.find(f => f.place === 'edges').id];
    expect(st && !st.ok && /außerhalb der Fläche/.test(st.error || ''), `Fehler: ${st && (st.error || st.ok)}`);
    near(await vol(id), 46860.885, 1e-2, 'ohne die Bohrung fehlt nur ihr Werkstoff');
    editTimeline(C.doc.features.findIndex(f => f.place === 'edges')); await sleep(300);
    num('offA', 40);
    await ok();
    near(await vol(id), 46458.761, 1e-2, 'mit 40 mm Abstand ist die Bohrung wieder da');
    // zurück auf „Skizze oder Fläche“: ohne Fläche bleibt OK zu
    editTimeline(C.doc.features.findIndex(f => f.place === 'edges')); await sleep(300);
    await seg('place', 'sketch');
    click('#dialog [data-cmd="ok"]'); await sleep(250);
    expect(!D.querySelector('#dialog').hidden && /Erst die Fläche/.test((D.querySelector('.toast') || {}).textContent || ''), `ohne Fläche kommt der Hinweis (${(D.querySelector('.toast') || {}).textContent})`);
    click('#dialog [data-cmd="cancel"]'); await sleep(250);
    near(await vol(id), 46458.761, 1e-2, 'Abbrechen lässt die Bohrungen unverändert');
  }],
  ['Ableiten: Parameter und Skizzen übernehmen', async () => {
    await newDoc();
    const derive = async path => {
      click('[data-rtab="solid"]'); await sleep(100);
      await cmd('solid:insert', 'derive');
      await waitFor(() => q('#dialog [data-cmd="file-pick"]'), 5000, 'Dateiliste');
      const prev = C.lastBuild;
      [...D.querySelectorAll('#dialog [data-cmd="file-pick"]')].find(b => b.dataset.path === path).click();
      await waitFor(() => C.lastBuild !== prev, 20000, 'Neuaufbau'); await sleep(200);
      return C.doc.features[C.doc.features.length - 1];
    };
    // Parameter aus der Teilefamilie
    const fp = await derive('Beispiele/Platte Teilefamilie.cantcodecad');
    editTimeline(C.doc.features.indexOf(fp)); await sleep(300);
    const cp = q('#dialog [data-dvp]'); cp.checked = true; cp.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(300);
    const ps = (C.doc.params || []).filter(p => p.src === fp.id);
    // mit Einheit übernommen (Dimensionsrechnung): ein Winkel bliebe „… deg“, eine Länge „… mm“
    expect(ps.length === 4 && ['breite=120 mm', 'tiefe=60 mm', 'dicke=5 mm', 'bohrung=10 mm'].every(s => ps.some(p => `${p.name}=${p.expr}` === s)), `4 Parameter übernommen (${ps.map(p => p.name + '=' + p.expr).join(', ')})`);
    const { paramUmgebung, wertMitEinheit, evalExpr: ev } = await import('../src/params.js');
    const umg = paramUmgebung([{ id: 'w', name: 'w', expr: '30 deg' }, { id: 'l', name: 'l', expr: '100' }]);
    near(ev('l*cos(w)', umg), 100 * Math.cos(Math.PI / 6), 1e-9, 'Parameter mit Größe: l·cos(w) = 86,603 (w = 30°)');
    expect(wertMitEinheit(30, [['deg', 1]]) === '30 deg' && wertMitEinheit(2450, [['mm', 2]]) === '2450 mm²' && wertMitEinheit(0.5, []) === '0.5', 'Wert mit Einheit: 30 deg, 2450 mm², 0.5');
    await ok();
    const { validateDoc } = await import('../src/doc.js');
    expect(validateDoc(JSON.parse(JSON.stringify(C.doc))).params.filter(p => p.src === fp.id).length === 4, 'Herkunft bleibt beim Speichern');
    // Skizze „Profil“ aus dem Winkel
    const fs = await derive('Beispiele/Winkel mit Rippe.cantcodecad');
    editTimeline(C.doc.features.indexOf(fs)); await sleep(300);
    const cs = [...D.querySelectorAll('#dialog [data-dvs]')].find(x => /Profil/.test(x.parentElement.textContent));
    expect(cs, 'Skizze „Profil“ in der Liste');
    cs.checked = true; cs.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(300);
    await ok();
    const sk = C.doc.features.find(x => x.derivedFrom && x.derivedFrom.f === fs.id);
    expect(sk && sk.type === 'sketch' && C.doc.features.indexOf(sk) === C.doc.features.findIndex(x => x.id === fs.id) + 1, 'Skizze direkt nach dem Ableiten-Feature');
    const src = fs.part.features.find(x => x.id === sk.derivedFrom.s);
    expect(sk.points.length === src.points.length && JSON.stringify(sk.plane.n) === JSON.stringify(src.plane.n), 'gleiche Geometrie und Ebene');
    // im neuen Dokument weiterverwenden: Skizze extrudieren
    await cmd('solid:create', 'extrude');
    num('distance', 10); await ok();
    const ex = C.doc.features[C.doc.features.length - 1];
    expect(ex.type === 'extrude' && C.lastBuild.status[ex.id].ok, `Extrusion der abgeleiteten Skizze ohne Fehler (${(C.lastBuild.status[ex.id] || {}).error || ''})`);
  }],
  ['Grobe Hülle schließt jede Form ein', async () => {
    /* Die grobe Hülle (siehe bbGrob im Kern) ist die Vorprüfung vor dem Verbinden und vor der
       Kollisionsprüfung: fällt ein Körper durch sie durch, kann er nichts berührt haben. Das gilt nur,
       wenn sie den Körper immer einschließt – geprüft an einer schrägen Zylinderachse und einer
       verschobenen Kugel, also an Flächen, deren Berandung nicht achsparallel ist. */
    const paare = await C.kernel.call('devEval', { code: `
      const formen = [R.makeBox([-15, -10, -5], [15, 10, 5]),
        R.makeCylinder(8, 25, [1, 2, 3], [0.6, 0.5, 0.64]),
        R.makeSphere(11).translate(4, -6, 2)];
      const verglichen = formen.map(sh => {
        const genau = ctx.bbOf(sh), grob = ctx.bbGrob(sh);
        return { unten: genau[0].every((v, i) => v >= grob[0][i] - 1e-6),
          oben: genau[1].every((v, i) => v <= grob[1][i] + 1e-6),
          zuWeit: grob[1].map((v, i) => +(v - grob[0][i] - (genau[1][i] - genau[0][i])).toFixed(2)) };
      });
      /* Die genaue Hülle wird an der Form gespeichert (siehe bbOf). Das ist nur richtig, solange der
         Wert zu genau dieser Form gehört – geprüft an zwei Körpern an verschiedenen Orten, je zweimal
         gefragt: beide müssen ihre eigene Ecke behalten, auch die zweite Anfrage. */
      const zwei = [R.makeBox([-10, -10, -10], [0, 0, 0]), R.makeBox([5, 5, 5], [15, 15, 15])];
      const gespeichert = zwei.map(sh => {
        const einmal = ctx.bbOf(sh), wieder = ctx.bbOf(sh);
        return { ecke: einmal[0].map(v => +v.toFixed(3)), gleich: JSON.stringify(einmal) === JSON.stringify(wieder) };
      });
      return { verglichen, gespeichert };` });
    expect(paare.verglichen.length === 3 && paare.verglichen.every(p => p.unten && p.oben),
      `Grobe Hülle ist nie enger als die genaue (${JSON.stringify(paare.verglichen)})`);
    expect(paare.gespeichert.length === 2 && paare.gespeichert.every((p, i) => p.gleich &&
      p.ecke.every((v, k) => Math.abs(v - (i ? 5 : -10)) < 1e-6)),
      `Hüllenwert gehört zur eigenen Form (${JSON.stringify(paare.gespeichert)})`);
  }],
  ['Körper teilen mit einem Körper als Werkzeug', async () => {
    await newDoc(); await box(100, 60, 5);
    // zweiter Körper 20 × 20 × 20 an x = 30 (neuer Körper), sticht durch die Platte
    await cmd('solid:create', 'box'); num('w', 20); num('l', 20); num('h', 20); num('cx', 30); await seg('op', 'new'); await ok();
    expect(C.lastBuild.bodies.length === 2, 'zwei Körper');
    const plate = C.lastBuild.bodies[0], tool = C.lastBuild.bodies[1];
    await cmd('solid:modify', 'split');
    await seg('tool', 'body');
    expect(C.vp.pickMode === 'face' && /Werkzeugkörpers anklicken/.test(q('#dialog').textContent), 'Werkzeug wählen');
    pick(faces().find(f => C.lastBuild.mesh.bodies[f.info.body].id === tool));
    await sleep(100);
    await ok();
    const ids = C.lastBuild.bodies;
    expect(ids.length === 3, `drei Körper: Platte, Stück, Werkzeug (${ids.length})`);
    near(await vol(plate), 100 * 60 * 5 - 20 * 20 * 5, 1e-6, 'Platte ohne das Stück');
    const piece = ids.find(id => id !== plate && id !== tool);
    near(await vol(piece), 20 * 20 * 5, 1e-6, 'abgetrenntes Stück 20 × 20 × 5');
    near(await vol(tool), 8000, 1e-6, 'Werkzeug bleibt 20³');
  }],
  ['Körper teilen mit einer Skizze (Kontur durch alles)', async () => {
    await newDoc(); await box(100, 60, 5);
    const plate = C.lastBuild.bodies[0];
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
    C.editor.setTool('rect'); sketchClick(0, 0); sketchClick(20, 30); await sleep(150);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    const sk = C.doc.features[C.doc.features.length - 1];
    await cmd('solid:modify', 'split');
    await seg('tool', 'sketch');
    expect(q('#dialog select[data-k="sketch"]') && q('#dialog select[data-k="sketch"]').value === sk.id, 'letzte Skizze vorgewählt');
    await ok();
    const ids = C.lastBuild.bodies;
    expect(ids.length === 2, `Platte und Stück (${ids.length})`);
    const piece = ids.find(id => id !== plate), A = 20 * 30;
    near(await vol(piece), A * 5, 0.5 * 5 * 50, 'Stück ≈ 20 × 30 × 5 (Klicks über Bildpunkte)');
    near(await vol(plate) + await vol(piece), 100 * 60 * 5, 1e-6, 'zusammen wieder die ganze Platte');
    expect(/1 Teil abgetrennt/.test(C.lastBuild.status[C.doc.features[C.doc.features.length - 1].id].info || ''), 'Meldung');
  }],
  ['Fläche teilen mit einer Skizze (Markierungsfeld)', async () => {
    await newDoc(); await box(100, 60, 5);
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
    C.editor.setTool('rect'); sketchClick(0, 0); sketchClick(20, 20); await sleep(150);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    const nf0 = C.lastBuild.mesh.faces.length;
    await cmd('solid:modify', 'splitface');
    await seg('tool', 'sketch');
    expect(/Markierungsfeld/.test(q('#dialog').textContent) && !/wird ein eigener Körper/.test(q('#dialog').textContent), 'Dialog für Flächen mit Skizze');
    await ok();
    expect(C.lastBuild.bodies.length === 1, 'weiterhin ein Körper');
    near(await vol(C.lastBuild.bodies[0]), 30000, 1e-6, 'Volumen unverändert');
    expect(C.lastBuild.mesh.faces.length === nf0 + 2, `Ober- und Unterseite je um ein Feld geteilt (${nf0} → ${C.lastBuild.mesh.faces.length})`);
    const tops = faces().filter(x => x.info.type === 'PLANE' && x.info.n[2] > 0.99);
    expect(tops.length === 2, 'Oberseite: Rest und Feld');
  }],
  ['Fläche teilen mit einer Skizze: nur die gewählte Fläche', async () => {
    // gleiche Platte wie oben, aber nur die Oberseite gewählt: dort das Feld, die Unterseite bleibt ganz (6 → 7 statt 8)
    await newDoc(); await box(100, 60, 5);
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
    C.editor.setTool('rect'); sketchClick(0, 0); sketchClick(20, 20); await sleep(150);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    const nf0 = C.lastBuild.mesh.faces.length;
    await cmd('solid:modify', 'splitface');
    await seg('tool', 'sketch');
    click('#dialog [data-cmd="split-faces"]'); await sleep(250);
    const top = faces().find(x => x.info.type === 'PLANE' && x.info.n[2] > 0.99);
    pick(top); await sleep(400);
    expect(/1 Fläche gewählt/.test(q('#dialog').textContent), '1 Fläche gewählt');
    await ok();
    expect(C.lastBuild.bodies.length === 1, 'weiterhin ein Körper');
    near(await vol(C.lastBuild.bodies[0]), 30000, 1e-6, 'Volumen unverändert');
    expect(C.lastBuild.mesh.faces.length === nf0 + 1, `nur die Oberseite geteilt (${nf0} → ${C.lastBuild.mesh.faces.length})`);
    const tops = faces().filter(x => x.info.type === 'PLANE' && x.info.n[2] > 0.99), bottoms = faces().filter(x => x.info.type === 'PLANE' && x.info.n[2] < -0.99);
    expect(tops.length === 2 && bottoms.length === 1, `Oberseite Rest und Feld, Unterseite ganz (${tops.length}/${bottoms.length})`);
    expect(tops.some(x => Math.abs(x.info.center[0] - 10) < 1e-6 && Math.abs(x.info.center[1] - 10) < 1e-6), 'Feld 20 × 20 mit Mitte (10, 10)');
  }],
  ['Explosionsansicht als Video (WebM)', async () => {
    await openExample('Winkel mit Rippe verschraubt');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="explode"]'); await waitFor(() => D.querySelector('#dialog [data-cmd="explode-video"]'), 8000, 'Explosionsansicht');
    const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
    let got = null;
    proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
    try { click('#dialog [data-cmd="explode-video"]'); await waitFor(() => got, 15000, 'Video'); } finally { proto.click = orig; }
    const blob = await (await W.fetch(got.href)).blob();
    expect(/-Explosion\.webm$/.test(got.name) && /webm/.test(blob.type) && blob.size > 20000, `WebM gespeichert (${got.name}, ${(blob.size / 1024).toFixed(0)} KB)`);
    // erstes Bild lesbar und nicht einfarbig (Modell vor hellem Hintergrund)
    const v = D.createElement('video'); v.muted = true; v.src = W.URL.createObjectURL(blob);
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('Video nicht lesbar')); setTimeout(res, 15000); });
    expect(v.videoWidth > 100 && v.videoHeight > 100, `Bildgröße ${v.videoWidth} × ${v.videoHeight}`);
    // kurz abspielen, damit ein Bild dekodiert ist
    try { await v.play(); } catch (_) { /* stumm, sollte gehen */ }
    await new Promise(res => { const t0 = performance.now(); const chk = () => (v.currentTime > 0.8 || performance.now() - t0 > 10000 ? res() : setTimeout(chk, 50)); chk(); });
    v.pause();
    const c = D.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 64);
    const px = g.getImageData(0, 0, 64, 64).data, lum = [];
    for (let i = 0; i < px.length; i += 4) lum.push(px[i] + px[i + 1] + px[i + 2]);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length, sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    expect(mean > 300 && sd > 10, `heller Hintergrund mit Modell (Mittel ${mean.toFixed(0)}, Streuung ${sd.toFixed(0)})`);
    expect(!q('#dialog [data-cmd="explode-video"]').disabled, 'Knopf wieder frei');
    click('#dialog [data-cmd="explode-close"]'); await sleep(100);
  }],
  ['Dateien über Windows-Dialoge (Speichern, Speichern unter, Export, Öffnen, Einfügen)', async () => {
    // Windows-Dialog und Dateisystem nachgebildet (der echte Dialog lässt sich im Prüfstand nicht bedienen)
    const fsys = new Map(), log = [];
    let next = [];
    W.__ccNativeStub = {
      caps: { dialogs: true, projects: 'C:\\Projekte\\' },
      pick: async (mode, name, filter) => { log.push({ mode, name, filter }); return next.shift() ?? null; },
      read: async path => { if (!fsys.has(path)) throw new Error('fehlt ' + path); const v = fsys.get(path); return typeof v === 'string' ? new TextEncoder().encode(v).buffer : await v.arrayBuffer(); },
      write: async (path, data) => { fsys.set(path, data); }
    };
    try {
      await newDoc(); await box(30, 20, 10);
      const P = 'C:\\Konstruktion\\Würfel Test.cantcodecad';
      next = [P];
      click('[data-cmd="save"]'); await waitFor(() => fsys.has(P), 5000, 'gespeichert');
      expect(log.length === 1 && log[0].mode === 'save' && /cantcodecad/.test(log[0].filter), 'Speichern ohne Datei → Windows-Dialog „Speichern unter“');
      expect(C.doc.file === P && C.doc.name === 'Würfel Test' && JSON.parse(fsys.get(P)).features.length === 1, 'Datei, Name und Inhalt');
      // zweites Speichern ohne Dialog
      await cmd('solid:create', 'box'); num('w', 5); num('l', 5); num('h', 5); await ok();
      click('[data-cmd="save"]'); await waitFor(() => JSON.parse(fsys.get(P)).features.length === 2, 5000, 'nochmal gespeichert');
      expect(log.length === 1, 'Strg+S schreibt ohne erneuten Dialog');
      // Export über den Dialog (STEP)
      const S = 'C:\\Konstruktion\\Würfel.step';
      next = [S];
      click('[data-rtab="util"]'); await sleep(100);
      click('[data-cmd="export-step"]');
      await waitFor(() => fsys.has(S), 20000, 'STEP');
      const step = await fsys.get(S).text();
      expect(log[1].mode === 'save' && /\.step$/.test(log[1].name) && /STEP/.test(log[1].filter) && /ISO-10303-21/.test(step), 'STEP-Export mit Speicherdialog');
      // Öffnen über den Dialog
      await newDoc();
      next = [P];
      click('[data-cmd="open"]'); await waitFor(() => C.doc.file === P, 5000, 'geöffnet'); await built(null, 20000).catch(() => {});
      expect(C.doc.name === 'Würfel Test' && C.doc.features.length === 2, 'Öffnen lädt die Datei');
      expect(JSON.parse(localStorage.getItem('cc.recent.test') || '[]')[0].path === P, 'unter „Zuletzt geöffnet“');
      // Teil einfügen mit vollem Pfad (verknüpft)
      await newDoc('assembly'); await sleep(200);
      next = [P];
      click('[data-rtab="asm"]'); await sleep(100);
      click('[data-menu="asm:insert"]'); await sleep(150); click('#fmenu [data-cmd="insert"]');
      await waitFor(() => (C.doc.inserts || []).length === 1, 5000, 'eingefügt');
      expect(C.doc.inserts[0].file === P && C.doc.inserts[0].name === 'Würfel Test', 'Einfügen verknüpft über den vollen Pfad');
      await waitFor(() => C.lastBuild && C.lastBuild.bodies.length >= 1 && C.lastBuild.bodies.every(id => id.startsWith(C.doc.inserts[0].id + '/')), 20000, 'Körper des Teils');
      expect(!D.getElementById('start'), 'kein Startfenster im Prüfstand');
    } finally { delete W.__ccNativeStub; }
  }],
  ['Verrunden und in der Zeitleiste unterdrücken', async () => {
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:modify', 'fillet');
    edges().filter(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-9).forEach(pick);
    expect(/4 Kanten/.test(q('#dialog').textContent), 'vier senkrechte Kanten gewählt');
    num('radius', 2); await ok();
    const id = C.lastBuild.bodies[0];
    near(await vol(id), 8000 - 4 * 20 * 4 * (1 - Math.PI / 4), 1e-6, 'Volumen nach Verrundung R2');
    q('#timeline-items [data-tl="1"]').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 500 }));
    await act(async () => [...D.querySelectorAll('#ctxmenu button')].find(b => /Unterdrücken/.test(b.textContent)).click());
    near(await vol(id), 8000, 1e-6, 'unterdrückt: wieder Würfel');
    expect(D.querySelector('#timeline-items [data-tl="1"].supp'), 'Zeitleiste zeigt unterdrückt');
  }],
  ['Formschräge an Quader', async () => {
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:modify', 'draft');
    expect(C.vp.pickMode === 'plane', 'erst neutrale Ebene wählen');
    pick(faces().find(f => f.info.type === 'PLANE' && f.info.n[2] < -0.9));
    expect(C.vp.pickMode === 'face', 'danach Flächen wählen');
    faces().filter(f => f.info.type === 'PLANE' && Math.abs(f.info.n[2]) < 0.1).forEach(pick);
    num('angle', 3); await ok();
    near(await vol(C.lastBuild.bodies[0]), 7190.772, 0.01, 'Volumen Pyramidenstumpf 3°');
    // symmetrisch / zwei Winkel: neutrale Ebene in die Mitte (z 10), jede Hälfte wird von ihr weg schlanker.
    // Je Hälfte (Höhe 10): ∫ (20 − 2h·tan α)² dh = 4000 − 4000·t + 4000/3·t²
    const F = deg => { const t = Math.tan(deg * Math.PI / 180); return 4000 - 4000 * t + 4000 / 3 * t * t; };
    const i = C.doc.features.length - 1;
    C.doc.features[i].plane = { ...C.doc.features[i].plane, plane: { ...C.doc.features[i].plane.plane, o: [10, 10, 10] } };
    editTimeline(i); await sleep(400); await seg('mode', 'sym');
    expect(!D.querySelector('#dialog input[data-k="angle2"]'), 'symmetrisch: ein Winkel');
    await ok();
    near(await vol(C.lastBuild.bodies[0]), 2 * F(3), 0.01, 'symmetrisch 3°: zwei Stümpfe von der Mitte weg');
    let bb = await bbox(C.lastBuild.bodies[0]);
    near(bb[1][0] - bb[0][0], 20, 1e-6, 'in der Mitte bleibt die Breite 20');
    editTimeline(i); await sleep(400); await seg('mode', 'two');
    num('angle2', 5); await ok();
    near(await vol(C.lastBuild.bodies[0]), F(3) + F(5), 0.01, 'zwei Winkel 3° und 5°');
    // Ebene außerhalb: Meldung
    C.doc.features[i].plane = { ...C.doc.features[i].plane, plane: { ...C.doc.features[i].plane.plane, o: [10, 10, -5] } };
    editTimeline(i); await sleep(400); await ok();
    expect(/teilen/.test((C.lastBuild.status[C.doc.features[i].id] || {}).error || ''), 'Ebene teilt den Körper nicht: Meldung');
  }],
  ['Skalieren mit Vorauswahl', async () => {
    await newDoc(); await box(20, 10, 5, { cx: 20 });
    const id = C.lastBuild.bodies[0], v0 = await vol(id);
    pick(faces()[0]);
    await cmd('solid:modify', 'scale');
    expect(D.querySelector('#dialog [data-cmd="body-pick"][aria-pressed="true"]'), 'vorgewählter Körper übernommen');
    num('factor', 2); await seg('point', 'custom');
    expect(D.querySelector('#dialog input[data-k="px"]'), 'Punktfelder bei „Punkt“');
    await seg('point', 'center');
    expect(!D.querySelector('#dialog input[data-k="px"]'), 'Punktfelder verschwinden');
    await ok();
    near(await vol(id) / v0, 8, 1e-6, 'Volumen × 8');
    const bb = await bbox(id); near(bb[0][0], 0, 1e-6, 'Mitte bleibt (x min)');
  }],
  ['Skalieren ungleichmäßig (je Achse)', async () => {
    // Quader 20 × 10 × 5 um (20 | 0), Bezug Ursprung, Faktoren 2 / 1 / 0,5 → 40 × 10 × 2,5, x 20…60, Volumen 1000;
    // Zylinder ⌀ 10 × 10 um (−20 | 0) mit X × 2 → elliptischer Zylinder π · 10 · 5 · 10 = 1570,8 (facettiert, < 0,2 % kleiner)
    await newDoc(); await box(20, 10, 5, { cx: 20 });
    await cmd('solid:create', 'cylinder'); num('d', 10); num('h', 10); num('cx', -20); await seg('op', 'new'); await ok();
    const [bx, cy] = C.lastBuild.bodies;
    await cmd('solid:modify', 'scale');
    pick(faces().find(f => C.lastBuild.mesh.bodies[f.info.body].id === bx)); await sleep(100);
    pick(faces().find(f => C.lastBuild.mesh.bodies[f.info.body].id === cy)); await sleep(100);
    await seg('mode', 'xyz');
    expect(D.querySelector('#dialog input[data-k="sx"]') && !D.querySelector('#dialog input[data-k="factor"]'), 'Faktor je Achse');
    num('sx', 2); num('sy', 1); num('sz', 0.5); await ok(20000);
    near(await vol(bx), 1000, 1e-6, 'Quader 40 × 10 × 2,5');
    const bb = await bbox(bx);
    near(bb[0][0], 20, 1e-6, 'x ab 20 (Bezug Ursprung)'); near(bb[1][0], 60, 1e-6, 'x bis 60'); near(bb[1][2], 2.5, 1e-6, 'Höhe 2,5');
    const vc = await vol(cy), ve = Math.PI * 10 * 5 * 5;
    expect(vc < ve && vc > ve * 0.998, `elliptischer Zylinder ≈ ${ve.toFixed(1)} mm³ (${vc.toFixed(1)})`);
    const st = C.lastBuild.status[C.doc.features[C.doc.features.length - 1].id];
    expect(st.ok && /facettiert/.test(st.info || ''), 'Hinweis: facettierter Körper');
  }],
  ['Komponenten: verschachteln, verschieben, auflösen', async () => {
    await newDoc('assembly');
    const g = await newComp('Gestell');
    expect(C.doc.activeComp === g.id, 'neue Komponente ist aktiv');
    await box(100, 60, 10);
    expect(g.bodies.length === 1, 'Quader landet im Gestell');
    const b = await newComp('Bein');
    expect(b.parent === g.id, 'Bein steckt im Gestell');
    await cmd('solid:create', 'cylinder');
    expect(q('#dialog select[data-segsel="op"]').value === 'new', 'leere aktive Komponente: Neuer Körper');
    num('d', 10); num('h', 40); num('cx', 40); await ok();
    expect(b.bodies.length === 1, 'Zylinder landet im Bein');
    const leg = b.bodies[0], z0 = (await bbox(leg))[0][2];
    click('#browser summary .b-act'); await sleep(200);
    expect(!C.doc.activeComp, 'oberste Ebene aktiviert');
    expect(D.querySelector('#browser details.b-root').open, 'Kopf klappt beim Aktivieren nicht zu');
    expect(!D.querySelector('[data-rtab="solid"]') && D.querySelector('[data-rtab="asm"][aria-selected="true"]'), 'oberste Ebene: Reiter Baugruppe, kein Volumenkörper');
    await cmd('asm:modify', 'move');
    await sleep(600);
    click(`#dialog [data-cmd="comp-pick"][data-id="${g.id}"]`); num('dz', 25);
    await sleep(800);
    expect(D.querySelector('#dialog [data-cmd="comp-pick"]'), 'Komponenten-Auswahl bleibt nach Neuaufbau');
    await ok();
    near((await bbox(leg))[0][2] - z0, 25, 1e-6, 'Bein wandert mit dem Gestell');
    click(`#browser [data-cmd="comp-dissolve"][data-id="${g.id}"]`); await sleep(300);
    const ask = D.getElementById('askbox'); if (ask) ask.querySelector('button').click();
    await sleep(400);
    expect(C.doc.components.length === 1 && !C.doc.components[0].parent, 'Auflösen: Bein eine Ebene höher');
    click('[data-cmd="undo"]'); await sleep(600);
    expect(C.doc.components.length === 2, 'Rückgängig stellt Gestell wieder her');
  }],
  ['Aktive Komponente: Abblenden und Verbinden', async () => {
    await openExample('Verschachtelte Komponenten');
    click('#browser .b-act[data-id="bein"]'); await sleep(300);
    const op = (C.vp.model.data.bodies || []).map((b, i) => [b.id, C.vp.bodyMats[i].opacity]);
    expect(op.find(([id]) => id === 'q1')[1] < 1 && op.find(([id]) => id === 'z1')[1] === 1, 'Körper außerhalb sind durchscheinend');
    await cmd('solid:create', 'cylinder'); num('d', 6); num('h', 30); num('cx', -20); await ok();
    near(await vol('q1'), 60000, 1e-6, 'Platte bleibt unverändert (kein Verbinden über Komponenten)');
    expect(C.doc.components.find(c => c.id === 'bein').bodies.length === 2, 'neuer Zylinder gehört zum Bein');
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
    C.editor.setTool('rect'); sketchClick(60, 60); sketchClick(70, 70); await sleep(150);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig'); await sleep(300);
    const sk = C.doc.features.find(f => f.type === 'sketch');
    expect(sk && sk.owner === 'bein', 'Skizze gehört zur aktiven Komponente');
    const row = [...D.querySelectorAll('#browser .b-row[data-cmd="edit"]')].find(b => b.textContent.includes(sk.name));
    expect(row && row.closest('.b-nest'), 'Skizze steht im Browser unter der Komponente');
    click('#browser summary .b-act'); await sleep(300);
    expect(C.vp.bodyMats.every(m => m.opacity === 1), 'oberste Ebene: alles wieder deckend');
  }],
  ['Spiegeln von Körpern: Neuer Körper oder Verbinden', async () => {
    // Würfel 20 mm von x = 0 bis 20 berührt die YZ-Ebene: gespiegelt liegt er bündig daneben (x = −20 … 0)
    await newDoc(); await box(20, 20, 20, { cx: 10 });
    const orig = C.lastBuild.mesh.bodies[0].id;
    Object.assign(C.doc.bodies[orig], { material: 'alu', color: '#3366cc' });
    await cmd('solid:create', 'mirror'); await seg('mode', 'body');
    expect(q('#dialog [data-k="result"][data-v="new"]').getAttribute('aria-checked') === 'true', 'Vorgabe: Neuer Körper');
    await ok();
    const bs = C.lastBuild.mesh.bodies;
    expect(bs.length === 2, `zwei getrennte Körper (${bs.length})`);
    bs.forEach((b, i) => near(b.volume, 8000, 1, `Körper ${i + 1}: 20³ mm³`));
    near(Math.min(...bs.map(b => b.bbox[0][0])), -20, 1e-6, 'Spiegelung reicht bis x = −20');
    const mb = C.doc.bodies[bs.find(b => b.id !== orig).id];
    expect(mb && mb.material === 'alu' && mb.color === '#3366cc', `Spiegelkörper übernimmt Werkstoff und Farbe (${mb && mb.material}, ${mb && mb.color})`);
    expect(mb.name === `${C.doc.bodies[orig].name} (1)`, `heißt wie das Original mit (1): ${mb.name}`);
    editTimeline(C.doc.features.length - 1); await sleep(300);
    await seg('result', 'join'); await ok();
    const bj = C.lastBuild.mesh.bodies;
    expect(bj.length === 1, `verbunden zu einem Körper (${bj.length})`);
    near(bj[0].volume, 16000, 1, 'verbundener Körper 40 × 20 × 20');
  }],
  ['Anordnung an Punkten (geometrische Anordnung)', async () => {
    // Klotz 10³ um (0|0), Skizzenpunkte (0|0), (30|0), (0|40), (50|50): Bezug ist (0|0), drei Kopien → zusammen 4000 mm³,
    // Hülle von −5 bis 55 in X und Y
    await openExample('Anordnung an Punkten');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.p1, 10000, 'Anordnung');
    expect(C.lastBuild.status.p1.ok, `aufgebaut (${C.lastBuild.status.p1.error || ''})`);
    let V = 0; for (const b of C.lastBuild.bodies) V += await vol(b);
    near(V, 4000, 1e-6, 'vier Klötze');
    const bb = C.lastBuild.mesh.bbox;
    near(bb[0][0], -5, 1e-6, 'x ab −5'); near(bb[1][0], 55, 1e-6, 'x bis 55'); near(bb[1][1], 55, 1e-6, 'y bis 55');
    editTimeline(C.doc.features.findIndex(f => f.id === 'p1')); await sleep(400);
    expect(q('#dialog select[data-k="ptsSketch"]').value === 's1', 'Dialog: Skizze mit den Punkten');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Anordnung an Punkten, an einer Zylinderfläche ausgerichtet', async () => {
    // Zylinder ⌀ 40 × 30, Nase 4³ bei x 20…24 (Mitte 22 | 0); Punkte (20|0), (0|20), (−20|0) auf dem Mantel:
    // die Kopien drehen mit der Normale – Nase bei (0 | 22), x −2…2, y 20…24, und bei (−22 | 0), x −24…−20
    await openExample('Anordnung an einer Zylinderfläche');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.p1, 10000, 'Anordnung');
    expect(C.lastBuild.status.p1.ok, `aufgebaut (${C.lastBuild.status.p1.error || ''})`);
    const boxes = [];
    for (const b of C.lastBuild.bodies) { const v = await vol(b); if (Math.abs(v - 64) < 1e-6) boxes.push(await bbox(b)); }
    expect(boxes.length === 3, `drei Nasen à 64 mm³ (${boxes.length})`);
    const has = (x0, x1, y0, y1) => boxes.some(b => Math.abs(b[0][0] - x0) < 1e-6 && Math.abs(b[1][0] - x1) < 1e-6 && Math.abs(b[0][1] - y0) < 1e-6 && Math.abs(b[1][1] - y1) < 1e-6);
    expect(has(-2, 2, 20, 24), 'Kopie bei (0 | 22) um 90° gedreht');
    expect(has(-24, -20, -2, 2), 'Kopie bei (−22 | 0) um 180° gedreht');
    editTimeline(C.doc.features.findIndex(f => f.id === 'p1')); await sleep(400);
    expect(q('#dialog [data-k="orient"][data-v="face"]').getAttribute('aria-checked') === 'true' && /Fläche ✓/.test(q('#dialog').textContent), 'Dialog: an Fläche ausgerichtet, Fläche gewählt');
    // Fläche neu anklicken (Mantel) übernimmt sie wieder
    click('#dialog [data-cmd="pattern-face"]'); await sleep(150);
    pick(faces().find(f => f.info.type === 'CYLINDRE')); await sleep(300);
    expect(C.editing.feature.face && C.editing.feature.face.t === 'CYLINDRE', 'Mantelfläche übernommen');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Arbeitsachse aus zwei Ebenen, Muster daran', async () => {
    await openExample('Flansch mit Arbeitsachse');
    expect(C.vp.workAxes.length === 1, 'Achse wird angezeigt');
    near(C.vp.workAxes[0].axis.o[0], 50, 1e-9, 'Achse bei x = 50');
    await cmd('solid:create', 'pattern');
    await seg('kind', 'circular'); await seg('axis', 'edge');
    const ax = C.vp.workAxes[0];
    pick({ kind: 'workaxis', id: ax.id, name: ax.name, axis: ax.axis });
    await sleep(300);
    expect(/Arbeitsachse1/.test(q('#dialog').textContent), 'Muster übernimmt die Arbeitsachse');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Rechteckige Anordnung: zwei Richtungen auf Kanten, Gesamtmaß, symmetrisch', async () => {
    await openExample('Lochbild auf 500 mm');
    const id = () => C.lastBuild.bodies[0];
    near(await vol(id()), 500 * 200 * 8 - 15 * Math.PI * 5.5 ** 2 * 8, 1e-3, '15 Löcher auf 460 × 120 mm Gesamtmaß verteilt');
    editTimeline(C.doc.features.findIndex(f => f.type === 'pattern')); await sleep(400);
    expect((q('#dialog').textContent.match(/Gerade Kante/g) || []).length === 2, 'beide Richtungen stehen auf Kanten');
    expect(q('#dialog input[data-k="extent"]').value === '460' && q('#dialog input[data-k="extent2"]').value === '120', 'Gesamtmaße stehen in den Feldern');
    // gerade Anzahl + symmetrisch geht nicht auf: das Original hätte keinen Platz in der Mitte
    num('count2', 4); await sleep(600);
    expect(/ungerade Anzahl/.test(q('#dialog').textContent), 'gerade Anzahl bei symmetrisch wird gemeldet');
    // Anzahl ändern, Gesamtmaß gleich: die Reihen rücken enger, das Bild bleibt auf 120 mm
    const prev = C.lastBuild;
    num('count2', 5);
    await built(prev, 20000);
    near(await vol(id()), 500 * 200 * 8 - 25 * Math.PI * 5.5 ** 2 * 8, 1e-3, 'fünf Reihen über dasselbe Gesamtmaß');
    // Richtung 2 auf eine Kante der Längsseite legen: beide Richtungen parallel → der Kern lehnt ab
    await seg('axis2', 'edge');
    const lang = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.dir[0]) > 0.99 && Math.abs(e.info.p0[2]) < 1e-6);
    expect(!!lang, 'Kante der Längsseite zum Anlicken gefunden');
    pick(lang); await sleep(500);
    expect(/verschieden sein/.test(q('#dialog').textContent), 'zwei parallele Richtungen werden abgelehnt');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Extrusion: zwei Seiten mit eigener Verjüngung, Startversatz', async () => {
    await openExample('Extrusion zwei Seiten und Startversatz');
    const exId = C.doc.features.filter(f => f.type === 'extrude')[0].id, buId = C.doc.features.filter(f => f.type === 'extrude')[1].id;
    const body = fid => C.lastBuild.bodies.find(b => b === fid || b.endsWith('/' + fid));
    const steg = body(exId), bund = body(buId);
    /* Handrechnung für den Steg (Profil 40 × 30 mm): die schräge Seite wird über die Höhe integriert,
       A(z) = (40 − 2zt)(30 − 2zt) mit t = tan 10° → 7200 − 2520 t + 288 t², die gerade Seite 1200 × 3 mm */
    const t = Math.tan(Math.PI / 18);
    const schraeg = 1200 * 6 - 140 * t * 6 ** 2 / 2 + 4 * t * t * 6 ** 3 / 3;
    near(await vol(steg), schraeg + 3600, 1e-3, 'Steg: 6 mm mit 10° Verjüngung nach oben, 3 mm gerade nach unten');
    near(await vol(bund), 100 * Math.PI * 10, 1e-3, 'Bund: ⌀20 mm, 10 mm hoch');
    // symmetrisch: Abstand 10 als ganze Länge (Vorgabe) bzw. je Seite → 10 bzw. 20 hoch
    const bi = C.doc.features.findIndex(f => f.id === buId), bundNow = () => body(buId);
    editTimeline(bi); await sleep(400); await seg('direction', 'symmetric'); await ok();
    near(await vol(bundNow()), 100 * Math.PI * 10, 1e-3, 'symmetrisch, ganze Länge: 10 hoch');
    editTimeline(bi); await sleep(400); await seg('symHalf', 'true'); await ok();
    near(await vol(bundNow()), 100 * Math.PI * 20, 1e-3, 'symmetrisch, je Seite: 20 hoch');
    const bbB = await bbox(bundNow());
    near(bbB[1][2] - bbB[0][2], 20, 1e-6, 'Höhe 20');
    // symmetrisch mit Verjüngung −10° (je Seite 5 mm, Abstand als ganze Länge): zwei Kegelstümpfe von der Profilebene weg,
    // V = 2π·∫₀⁵ (10 + h·t)² dh = 2π·(500 + 250·t + 125/3·t²), t = tan(−10°)
    editTimeline(bi); await sleep(400); await seg('symHalf', 'false'); num('taper', -10); await ok();
    const tt = Math.tan(-10 * Math.PI / 180);
    near(await vol(bundNow()), 2 * Math.PI * (500 + 250 * tt + 125 / 3 * tt * tt), 1e-3, 'symmetrisch mit Verjüngung: zwei Stümpfe');
    editTimeline(bi); await sleep(400); num('taper', 0); await ok();
    editTimeline(bi); await sleep(400); await seg('direction', 'normal'); await ok();
    let bb = await bbox(bund);
    expect(Math.abs(bb[0][2] - 5) < 1e-6 && Math.abs(bb[1][2] - 15) < 1e-6, 'Bund beginnt durch den Startversatz erst 5 mm über der Profilebene');
    bb = await bbox(steg);
    expect(Math.abs(bb[0][2] + 3) < 1e-6 && Math.abs(bb[1][2] - 6) < 1e-6, 'Steg sitzt von −3 mm bis +6 mm um die Profilebene');
    editTimeline(C.doc.features.findIndex(f => f.type === 'extrude')); await sleep(400);
    expect(q('#dialog select[data-segsel="direction"]').value === 'two', 'Richtung steht auf Zwei Seiten');
    expect(q('#dialog input[data-k="dist2"]').value === '3' && q('#dialog input[data-k="taper2"]').value === '0', 'beide Seiten haben eigene Ausdehnung und Verjüngung');
    // Maß der zweiten Seite auf 0: der Kern sagt, was fehlt
    let prev = C.lastBuild;
    num('dist2', 0);
    await built(prev, 20000);
    expect(/zweiten Seite/.test(q('#dialog').textContent), 'ohne Maß der zweiten Seite meldet der Kern');
    // zweite Seite tiefer legen: nur der gerade Teil wächst
    prev = C.lastBuild;
    num('dist2', 5);
    await built(prev, 20000);
    near(await vol(steg), schraeg + 6000, 1e-3, 'zweite Seite auf 5 mm geändert');
    // ohne Verjüngung braucht es keinen zweiten Körper: ein prismatischer Steg über beide Seiten
    prev = C.lastBuild;
    num('taper', 0);
    await built(prev, 20000);
    near(await vol(steg), 40 * 30 * 11, 1e-3, 'beide Seiten gerade: 11 mm starker Steg');
    bb = await bbox(steg);
    expect(Math.abs(bb[0][0] + 20) < 1e-6 && Math.abs(bb[1][0] - 20) < 1e-6, 'gerade Seiten bleiben senkrecht');
    // zurück auf eine Seite: das Feld für die zweite Seite verschwindet und fehlt danach in der Datei
    await seg('direction', 'normal');
    expect(!/Abstand Seite 2/.test(q('#dialog').textContent), 'ohne zwei Seiten kein Feld für Seite 2');
    await ok();
    const ex = C.doc.features.find(f => f.id === exId);
    expect(ex.direction === 'normal' && !('dist2' in ex) && !('taper2' in ex), 'die Maße der zweiten Seite kommen aus der Datei');
    near(await vol(steg), 40 * 30 * 6, 1e-3, 'nur noch 6 mm nach oben');
    // Startversatz am Bund: ohne das Feld liegt der Körper wieder auf der Profilebene
    editTimeline(C.doc.features.length - 1); await sleep(400);
    expect(q('#dialog select[data-segsel="start"]').value === 'offset', 'Start steht auf Versatz');
    prev = C.lastBuild;
    num('startOffset', 0);
    await built(prev, 20000);
    bb = await bbox(bund);
    expect(Math.abs(bb[0][2]) < 1e-6 && Math.abs(bb[1][2] - 10) < 1e-6, 'Versatz 0 mm baut ab der Profilebene');
    await seg('start', 'plane');
    expect(!/Versatz ab Profilebene/.test(q('#dialog').textContent), 'ohne Startversatz kein Feld');
    await ok();
    const bu = C.doc.features.find(f => f.id === buId);
    expect(!('start' in bu) && !('startOffset' in bu), 'der Startversatz kommt aus der Datei');
    bb = await bbox(bund);
    expect(Math.abs(bb[0][2]) < 1e-6 && Math.abs(bb[1][2] - 10) < 1e-6, 'Bund steht nach dem Entfernen auf der Profilebene');
  }],
  ['Extrusion: Start von einer Fläche', async () => {
    await openExample('Extrusion Start von einer Fläche');
    const body = fid => C.lastBuild.bodies.find(b => b === fid || b.endsWith('/' + fid));
    const block = body('e1'), bund = body('e2'), ansatz = body('e3');
    /* Handrechnung: „Von Objekt“ nimmt die Ebene der angeklickten Fläche als Startebene.
       Block 40 × 30 × 12 mm; Bund ⌀10 mm, 10 mm hoch ab der Oberseite → π · 25 · 10 */
    near(await vol(block), 40 * 30 * 12, 1e-3, 'Grundblock 40 × 30 × 12 mm');
    near(await vol(bund), Math.PI * 25 * 10, 1e-3, 'Bund ⌀10 mm, 10 mm hoch');
    let bb = await bbox(bund);
    expect(Math.abs(bb[0][2] - 12) < 1e-6 && Math.abs(bb[1][2] - 22) < 1e-6, 'der Bund beginnt auf der Oberseite des Blocks');
    bb = await bbox(ansatz);
    expect(Math.abs(bb[0][2] - 8) < 1e-6 && Math.abs(bb[1][2] - 18) < 1e-6, 'der Ansatz beginnt 4 mm unter der Startfläche');
    // Startfläche neu anklicken: dieselbe Ebene, dasselbe Ergebnis
    editTimeline(C.doc.features.findIndex(f => f.id === 'e2')); await sleep(400);
    expect(q('#dialog select[data-segsel="start"]').value === 'object', 'Start steht auf Von Objekt');
    expect(/Versatz ab Startfläche/.test(q('#dialog').textContent), 'der Versatz gilt ab der Startfläche');
    let prev = C.lastBuild;
    click('#dialog [data-cmd="pick-startface"]'); await sleep(200);
    expect(/Ebene Fläche als Start anklicken/.test(q('#hint').textContent), 'die Anleitung nennt die Startfläche');
    pick(faces().find(f => f.info.type === 'PLANE' && f.info.n[2] > 0.9 && Math.abs(f.info.center[1]) < 1));
    await built(prev, 20000);
    const ref = C.doc.features.find(f => f.id === 'e2').startRef;
    expect(ref && ref.t === 'PLANE' && Math.abs(ref.dist - 12) < 1e-6, 'die angeklickte Ebene steht als Start in der Datei');
    bb = await bbox(bund);
    expect(Math.abs(bb[0][2] - 12) < 1e-6 && Math.abs(bb[1][2] - 22) < 1e-6, 'nach dem Neuwählen bleibt der Bund auf der Oberseite');
    // Versatz ab der Startfläche: der Bund wächst 6 mm in den Block hinein
    prev = C.lastBuild;
    num('startOffset', -6);
    await built(prev, 20000);
    bb = await bbox(bund);
    expect(Math.abs(bb[0][2] - 6) < 1e-6 && Math.abs(bb[1][2] - 16) < 1e-6, 'Versatz −6 mm beginnt 6 mm unter der Startfläche');
    near(await vol(bund), Math.PI * 25 * 10, 1e-3, 'die Höhe des Bundes bleibt 10 mm');
    // zurück auf die Profilebene: die Startangaben fehlen danach in der Datei
    prev = C.lastBuild;
    await seg('start', 'plane');
    expect(!/Startfläche/.test(q('#dialog').textContent), 'ohne Von Objekt kein Feld für die Startfläche');
    await ok();
    const bu = C.doc.features.find(f => f.id === 'e2');
    expect(!('start' in bu) && !('startRef' in bu) && !('startOffset' in bu), 'Start und Startfläche kommen aus der Datei');
    bb = await bbox(bund);
    expect(Math.abs(bb[0][2]) < 1e-6 && Math.abs(bb[1][2] - 10) < 1e-6, 'ohne Startfläche gilt wieder die Profilebene');
    // ohne angeklickte Fläche sagt der Kern, was fehlt – und nach dem Klick baut es
    editTimeline(C.doc.features.findIndex(f => f.id === 'e3')); await sleep(400);
    prev = C.lastBuild;
    await seg('start', 'plane');
    await built(prev, 20000);
    prev = C.lastBuild;
    await seg('start', 'object');
    await built(prev, 20000);
    expect(/Startfläche wählen/.test(q('#dialog').textContent), 'ohne Startfläche meldet der Kern');
    prev = C.lastBuild;
    click('#dialog [data-cmd="pick-startface"]'); await sleep(200);
    pick(faces().find(f => f.info.type === 'PLANE' && f.info.n[2] > 0.9 && Math.abs(f.info.center[1]) < 1));
    await built(prev, 20000);
    bb = await bbox(ansatz);
    expect(Math.abs(bb[0][2] - 12) < 1e-6 && Math.abs(bb[1][2] - 22) < 1e-6, 'nach dem Anklicken wächst der Ansatz ab der Startfläche');
    await ok();
    near(await vol(ansatz), 10 * 10 * 10, 1e-3, 'der Ansatz ist 10 × 10 × 10 mm');
  }],
  ['Dünn extrudieren: Wand Seite 1, Mitte, Seite 2', async () => {
    await openExample('Dünn extrudierte Hohlprofile');
    const body = fid => C.lastBuild.bodies.find(b => b === fid || b.endsWith('/' + fid));
    const rahm = body('e1'), rohr = body('e2'), wand = body('e3');
    /* Handrechnung: die Berandung wird um die Wanddicke versetzt, Ecken bleiben Gehrungsecken.
       Rahmen 40 × 30 mm, Wand 3 mm nach innen → (40·30 − 34·24) · 12 mm */
    near(await vol(rahm), (1200 - 34 * 24) * 12, 1e-3, 'Rahmenwand 3 mm nach innen');
    // Rohr ⌀20 mm, Wand mittig über der Kontur → ⌀22 mm außen, ⌀18 mm innen
    near(await vol(rohr), Math.PI * (11 ** 2 - 9 ** 2) * 10, 1e-3, 'Rohrwand 2 mm in der Mitte');
    // Platte 30 × 30 mm mit Loch ⌀10 mm, Wand außerhalb der Kontur → 34 × 34 mm außen, Loch ⌀6 mm
    near(await vol(wand), (34 * 34 - Math.PI * 3 ** 2 - (30 * 30 - Math.PI * 5 ** 2)) * 8, 1e-3, 'Wand außerhalb der Kontur, auch um das Loch');
    let bb = await bbox(rahm);
    expect(Math.abs(bb[0][0] + 20) < 1e-6 && Math.abs(bb[1][0] - 20) < 1e-6 && Math.abs(bb[1][2] - 12) < 1e-6, 'die Wand hält die äußere Kontur des Profils');
    editTimeline(C.doc.features.findIndex(f => f.id === 'e1')); await sleep(400);
    expect(q('#dialog [data-k="thin"][data-v="true"]').getAttribute('aria-checked') === 'true', 'Dünn extrudieren steht auf An');
    expect(q('#dialog select[data-segsel="wall"]').value === 'side1' && q('#dialog input[data-k="thickness"]').value === '3', 'Wand steht auf Seite 1, Wanddicke 3 mm');
    expect(!/Verjüngung/.test(q('#dialog').textContent), 'zur dünnen Wand gibt es keine Verjüngung');
    // Wand in der Mitte: 1,5 mm nach beiden Seiten
    let prev = C.lastBuild;
    await seg('wall', 'middle');
    await built(prev, 20000);
    near(await vol(rahm), (43 * 33 - 37 * 27) * 12, 1e-3, 'Wand in der Mitte der Kontur');
    // Wand außerhalb der Kontur: sie wächst um die volle Wanddicke nach außen
    prev = C.lastBuild;
    await seg('wall', 'side2');
    await built(prev, 20000);
    near(await vol(rahm), (46 * 36 - 40 * 30) * 12, 1e-3, 'Wand außerhalb der Kontur');
    // zu dicke Wand für die Kontur: der Kern sagt, was fehlt
    prev = C.lastBuild;
    await seg('wall', 'side1');
    await built(prev, 20000);
    near(await vol(rahm), (1200 - 34 * 24) * 12, 1e-3, 'Wand wieder nach innen');
    prev = C.lastBuild;
    num('thickness', 16);
    await built(prev, 20000);
    expect(/zu dick/.test(q('#dialog').textContent), 'zu dicke Wand meldet der Kern');
    prev = C.lastBuild;
    num('thickness', 3);
    await built(prev, 20000);
    // wieder aus: die Wandmaße fallen weg, der Rahmen wird voll
    await seg('thin', 'false');
    expect(!/Wanddicke/.test(q('#dialog').textContent), 'ohne dünne Wand kein Feld für die Wanddicke');
    await ok();
    const ex = C.doc.features.find(f => f.id === 'e1');
    expect(!('thin' in ex) && !('thickness' in ex) && !('wall' in ex), 'die Wandmaße kommen aus der Datei');
    near(await vol(rahm), 40 * 30 * 12, 1e-3, 'ohne dünne Wand ist der Rahmen ein voller Block');
  }],
  ['Dünn extrudieren: Wand aus offenem Linienzug', async () => {
    await openExample('Dünne Wände aus offenen Linienzügen');
    const body = fid => C.lastBuild.bodies.find(b => b === fid || b.endsWith('/' + fid));
    const steg = body('e1'), profil = body('e2'), bogen = body('e3');
    /* Handrechnung: zur Kette kommen die Randlinien im Wandabstand und zwei Deckel,
       das Band wird prismatisiert.
       Linie 100 mm, Wand 6 mm nach links, 20 mm hoch → 100 · 6 · 20 */
    near(await vol(steg), 100 * 6 * 20, 1e-3, 'Wand entlang einer geraden Linie');
    let bb = await bbox(steg);
    expect(Math.abs(bb[0][1]) < 1e-6 && Math.abs(bb[1][1] - 6) < 1e-6, 'Seite 1 liegt links von der Zugrichtung');
    // U-Profil: 140 mm Mittellinie, 5 mm Wand mittig – die Gehrungsecken heben sich auf → 140 · 5 · 100
    near(await vol(profil), 140 * 5 * 100, 1e-3, 'U-Profil als Wand in der Mitte');
    bb = await bbox(profil);
    expect(Math.abs(bb[0][0] + 2.5) < 1e-6 && Math.abs(bb[1][0] - 62.5) < 1e-6 && Math.abs(bb[1][1] - 42.5) < 1e-6,
      'die mittige Wand ragt halb über die Mittellinie');
    // Bogen r = 50 mm, 6 mm Wand mittig → Ringstück (53² − 47²) · π/4 · 10 mm
    near(await vol(bogen), (53 ** 2 - 47 ** 2) * Math.PI / 4 * 10, 1e-3, 'Wand entlang eines Bogens');
    // Seite wechseln: die Zugrichtung bleibt, die Wand wächst nach rechts
    editTimeline(C.doc.features.findIndex(f => f.id === 'e1')); await sleep(400);
    expect(/offene Linienzüge \(1\)/.test(q('#dialog').textContent), 'die Palette meldet den offenen Linienzug');
    let prev = C.lastBuild;
    await seg('wall', 'side2');
    await built(prev, 20000);
    bb = await bbox(steg);
    expect(Math.abs(bb[0][1] + 6) < 1e-6 && Math.abs(bb[1][1]) < 1e-6, 'Seite 2 liegt rechts von der Zugrichtung');
    prev = C.lastBuild;
    await seg('wall', 'middle');
    await built(prev, 20000);
    near(await vol(steg), 100 * 6 * 20, 1e-3, 'die Wand in der Mitte hat dieselbe Menge Material');
    bb = await bbox(steg);
    expect(Math.abs(bb[0][1] + 3) < 1e-6 && Math.abs(bb[1][1] - 3) < 1e-6, 'die Wand sitzt mittig über der Linie');
    // ohne „Dünn extrudieren" fehlt ein geschlossenes Profil – die Skizze sagt es deutlich
    prev = C.lastBuild;
    await seg('thin', 'false');
    await built(prev, 20000);
    expect(/kein geschlossenes Profil/.test(q('#dialog').textContent), 'ohne dünne Wand fehlt das Profil');
    prev = C.lastBuild;
    await seg('thin', 'true');
    await built(prev, 20000);
    near(await vol(steg), 100 * 2 * 20, 1e-3, 'ohne Wandmaße im Aufbau gilt die Wanddicke aus der Palette');
    prev = C.lastBuild;
    num('thickness', 6);
    await built(prev, 20000);
    near(await vol(steg), 100 * 6 * 20, 1e-3, 'mit Wanddicke 6 mm wird die Linie wieder zur Wand');
    await ok();
    near(await vol(steg), 100 * 6 * 20, 1e-3, 'nach OK bleibt die Wand stehen');
  }],
  ['Arbeitspunkte: zwei Kanten, drei Ebenen, Kante und Ebene, entlang Kante', async () => {
    // Würfel 20 (x, y −10…10, z 0…20)
    await newDoc(); await box(20, 20, 20);
    const E = edges(), F = faces();
    const kante = (fn) => E.find(e => e.info.type === 'LINE' && fn(e.info));
    const oben = kante(i => Math.abs(i.p0[2] - 20) < 1e-6 && Math.abs(i.p1[2] - 20) < 1e-6 && Math.abs(i.p0[1] + 10) < 1e-6 && Math.abs(i.p1[1] + 10) < 1e-6); // y −10, z 20, entlang X
    const senk = kante(i => Math.abs(i.p0[0] - 10) < 1e-6 && Math.abs(i.p1[0] - 10) < 1e-6 && Math.abs(i.p0[1] - 10) < 1e-6 && Math.abs(i.p1[1] - 10) < 1e-6); // x 10, y 10, entlang Z
    const yKante = kante(i => Math.abs(i.p0[0] - 10) < 1e-6 && Math.abs(i.p1[0] - 10) < 1e-6 && Math.abs(i.p0[2] - 20) < 1e-6 && Math.abs(i.p1[2] - 20) < 1e-6); // x 10, z 20, entlang Y
    const top = F.find(h => h.info.type === 'PLANE' && h.info.plane && h.info.plane.n[2] > 0.999);
    expect(oben && senk && yKante && top, 'Kanten und Oberseite gefunden');
    const punkt = async (mode, picks, extra) => {
      await cmd('solid:construct', 'point'); await seg('mode', mode);
      if (extra) extra();
      for (const h of picks) { pick(h); await sleep(150); }
      await ok();
      return C.vp.workPoints[C.vp.workPoints.length - 1].p;
    };
    const gleich = (p, q, txt) => expect(p && q.every((v, i) => Math.abs(p[i] - v) < 1e-6), `${txt}: (${p && p.map(v => v.toFixed(2))})`);
    // windschiefe Kanten: Mitte der kürzesten Verbindung zwischen (x, −10, 20) und (10, 10, z) → (10 | 0 | 20)
    gleich(await punkt('edges', [oben, senk]), [10, 0, 20], 'zwei Kanten');
    // Oberseite × XZ × YZ → (0 | 0 | 20)
    gleich(await punkt('planes3', [top, { kind: 'plane', plane: { key: 'XZ' } }, { kind: 'plane', plane: { key: 'YZ' } }]), [0, 0, 20], 'drei Ebenen');
    // Kante entlang Y bei x 10, z 20 trifft XZ (y 0) → (10 | 0 | 20)
    gleich(await punkt('edgeplane', [yKante, { kind: 'plane', plane: { key: 'XZ' } }]), [10, 0, 20], 'Kante und Ebene');
    // 25 % entlang der oberen Kante (Länge 20): 5 mm vom Anfang – je nach Laufrichtung x −5 oder +5
    const p = await punkt('path', [oben], null);
    expect(p && Math.abs(Math.abs(p[0]) - 0) < 1e-6, `entlang Kante, 50 %: Mitte (${p && p.map(v => v.toFixed(2))})`);
    const i = C.doc.features.length - 1;
    editTimeline(i); await sleep(400); num('pos', 25); await ok();
    const p2 = C.vp.workPoints[C.vp.workPoints.length - 1].p;
    expect(p2 && Math.abs(Math.abs(p2[0]) - 5) < 1e-6 && Math.abs(p2[1] + 10) < 1e-6 && Math.abs(p2[2] - 20) < 1e-6, `entlang Kante, 25 %: |x| = 5 (${p2 && p2.map(v => v.toFixed(2))})`);
  }],
  ['Arbeitsachse lotrecht zur Fläche', async () => {
    // Würfel 20 (z 0…20): Klick auf die Oberseite bei (5 | 3 | 20) → Achse durch diesen Punkt in Richtung +Z
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:construct', 'axis'); await seg('mode', 'normal');
    const top = faces().find(h => h.info.type === 'PLANE' && h.info.plane && h.info.plane.n[2] > 0.999);
    pick({ ...top, point: [5, 3, 20] }); await sleep(300);
    expect(/Lotrecht zur Fläche/.test(q('#dialog').textContent), 'Basis: lotrecht zur Fläche');
    await ok();
    const ax = C.vp.workAxes[C.vp.workAxes.length - 1].axis;
    near(ax.o[0], 5, 1e-6, 'durch x 5'); near(ax.o[1], 3, 1e-6, 'durch y 3'); near(ax.o[2], 20, 1e-6, 'auf der Fläche (z 20)');
    near(Math.abs(ax.d[2]), 1, 1e-9, 'Richtung senkrecht zur Fläche');
    // die Achse taugt als Drehachse: runde Anordnung des Würfels um sie
    await cmd('solid:create', 'pattern');
    await seg('kind', 'circular'); await seg('axis', 'edge');
    const wa = C.vp.workAxes[C.vp.workAxes.length - 1];
    pick({ kind: 'workaxis', id: wa.id, name: wa.name, axis: wa.axis }); await sleep(300);
    expect(/Arbeitsachse/.test(q('#dialog').textContent), 'Muster übernimmt die Arbeitsachse');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Arbeitspunkte, Ebene durch drei Punkte, Achse durch zwei', async () => {
    await openExample('Gussgehäuse mit Formschräge');
    const E = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2]) < 1e-6 && Math.abs(e.info.p1[2]) < 1e-6 && Math.abs(e.info.p0[1] - e.info.p1[1]) < 1e-6 && e.info.p0[1] < 0);
    await cmd('solid:construct', 'point'); pick({ ...E, point: E.info.p0 }); await ok();
    await cmd('solid:construct', 'point'); await seg('mode', 'mid'); pick(E); await ok();
    await cmd('solid:construct', 'point'); await seg('mode', 'coords');
    const iz = q('#dialog input[data-pt="z"]'); iz.value = '25'; iz.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(200);
    await ok();
    expect(C.vp.workPoints.length === 3, 'drei Punkte angezeigt');
    await cmd('solid:construct', 'plane'); click('#dialog [data-cmd="plane-mode"][data-m="pts"]'); await sleep(200);
    C.vp.workPoints.forEach(w => pick({ kind: 'workpoint', id: w.id, name: w.name, p: w.p.slice() }));
    await ok();
    const n = C.vp.workPlanes[C.vp.workPlanes.length - 1].plane.n;
    near(n[1], -0.7809, 1e-3, 'Ebenen-Normale y'); near(n[2], 0.6247, 1e-3, 'Ebenen-Normale z');
    await cmd('solid:construct', 'axis'); await seg('mode', 'points');
    C.vp.workPoints.slice(1).forEach(w => pick({ kind: 'workpoint', id: w.id, name: w.name, p: w.p.slice() }));
    await ok();
    const d = C.vp.workAxes[C.vp.workAxes.length - 1].axis.d;
    near(d[1], 0.6247, 1e-3, 'Achsrichtung y'); near(d[2], 0.7809, 1e-3, 'Achsrichtung z');
  }],
  ['Punkte, Ebene und Achse wandern mit Körperecken', async () => {
    await newDoc(); await box(20, 20, 20);
    const top = edges().filter(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2] - 20) < 1e-6 && Math.abs(e.info.p1[2] - 20) < 1e-6);
    const ex = top.find(e => Math.abs(e.info.dir[0]) > 0.9), ey = top.find(e => Math.abs(e.info.dir[1]) > 0.9);
    await cmd('solid:construct', 'plane'); click('#dialog [data-cmd="plane-mode"][data-m="pts"]'); await sleep(150);
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
    const third = [ey.info.p0, ey.info.p1].find(p => !same(p, ex.info.p0) && !same(p, ex.info.p1));
    pick({ ...ex, point: ex.info.p0 }); pick({ ...ex, point: ex.info.p1 }); pick({ ...ey, point: third });
    await ok();
    await cmd('solid:construct', 'point'); await seg('mode', 'mid'); pick(ex); await ok();
    await cmd('solid:construct', 'axis'); await seg('mode', 'points'); pick({ ...ey, point: ey.info.p0 }); pick({ ...ey, point: ey.info.p1 }); await ok();
    expect(Math.abs(C.vp.workPlanes[0].plane.o[2] - 20) < 1e-9, 'Ebene zunächst bei z = 20');
    editTimeline(0); await sleep(500);
    await act(() => num('h', 30)); await ok();
    await sleep(600);
    near(C.vp.workPlanes[0].plane.o[2], 30, 1e-6, 'Ebene wandert auf z = 30');
    near(C.vp.workPoints[0].p[2], 30, 1e-6, 'Punkt wandert auf z = 30');
    near(C.vp.workAxes[0].axis.o[2], 30, 1e-6, 'Achse wandert auf z = 30');
    const pf = C.doc.features.find(f => f.type === 'plane');
    expect(pf.base.pts.every(p => Math.abs(p[2] - 30) < 1e-6), 'neue Lage ist im Dokument gespeichert');
  }],
  ['Verschieben: Punkt auf Position', async () => {
    // Würfel 10 (x, y −5…5, z 0…10): Ecke (5 | 5 | 10) auf die Position (100 | 0 | 0) → Würfel x 90…100, y −10…0, z −10…0
    await newDoc(); await box(10, 10, 10);
    const id = C.lastBuild.bodies[0];
    await cmd('solid:modify', 'move');
    click(`#dialog [data-cmd="body-pick"][data-id="${id}"]`); await sleep(250);
    await seg('mode', 'pointpos');
    const top = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2] - 10) < 1e-6 && Math.abs(e.info.p1[2] - 10) < 1e-6 && [e.info.p0, e.info.p1].some(p => Math.abs(p[0] - 5) < 1e-6 && Math.abs(p[1] - 5) < 1e-6));
    expect(!!top, 'obere Kante an der Ecke gefunden');
    pick({ ...top, point: [top.info.p0, top.info.p1].find(p => Math.abs(p[0] - 5) < 1e-6 && Math.abs(p[1] - 5) < 1e-6) }); await sleep(200);
    num('tx', 100); num('ty', 0); num('tz', 0); await sleep(200);
    await ok(30000);
    const bb = await bbox(id);
    [[90, -10, -10], [100, 0, 0]].forEach((c, i) => c.forEach((v, k) => near(bb[i][k], v, 1e-6, `Hülle [${i}][${k}]`)));
  }],
  ['Verschieben: Drehring am Griff', async () => {
    // Quader 20 × 10 × 10 (x −10…10, y −5…5, z 0…10); Drehring Z um 90° → Drehpunkt in der Mitte (0 | 0 | 5),
    // danach x −5…5, y −10…10, z unverändert 0…10
    await newDoc(); await box(20, 10, 10);
    const id = C.lastBuild.bodies[0];
    await cmd('solid:modify', 'move');
    click(`#dialog [data-cmd="body-pick"][data-id="${id}"]`); await sleep(300);
    const vp = C.vp;
    expect(vp.triadG && vp.triadG.userData.rings.length === 3, 'Griff mit drei Drehringen');
    vp.view('top'); await sleep(300);
    // Punkt auf dem Z-Ring unter 45° in Bildschirmkoordinaten
    const sc = vp.worldPerPixel() * 72, P = vp.triadG.position.clone(), r = vp.canvas.getBoundingClientRect();
    P.x += sc * Math.SQRT1_2; P.y += sc * Math.SQRT1_2; P.project(vp.camera);
    const ev = { clientX: r.left + (P.x + 1) / 2 * r.width, clientY: r.top + (1 - P.y) / 2 * r.height };
    expect(vp.triadHit(ev) === 5, `Treffer auf dem Z-Ring (${vp.triadHit(ev)})`);
    near(vp.triadAngleAt(ev, 2), 45, 0.5, 'Winkel des Mauspunkts um Z');
    vp.triad.onRotate(2, 90); await sleep(300);
    const f = C.editing.feature;
    expect(f.axis === 'Z' && f.angle === 90, `Achse Z, 90° (${f.axis}, ${f.angle})`);
    [f.px, f.py, f.pz].forEach((v, k) => near(v, [0, 0, 5][k], 1e-6, `Drehpunkt [${k}]`));
    await ok(30000);
    const bb = await bbox(id);
    [[-5, -10, 0], [5, 10, 10]].forEach((c, i) => c.forEach((v, k) => near(bb[i][k], v, 1e-6, `Hülle [${i}][${k}]`)));
  }],
  ['Verschieben: Punkt zu Punkt, entlang Kante, um eine Achse', async () => {
    await newDoc();
    const neu = async fn => { const alt = C.lastBuild.bodies.slice(); await fn(); return C.lastBuild.bodies.find(id => !alt.includes(id)); };
    const ecken = async (id, text, exp) => { const b = await bbox(id); [0, 1].forEach(i => [0, 1, 2].forEach(k => near(b[i][k], exp[i][k], 1e-6, `${text} [${i}][${k}]`))); };
    const uebernehmen = async () => { click('#dialog [data-cmd="ok"]'); await sleep(600); };
    const platte = await neu(() => box(60, 20, 10));
    const anschlag = await neu(() => box(10, 10, 10, { cx: -50 }));
    const bolzen = await neu(() => box(12, 8, 8, { cx: 40 }));
    await neu(async () => { await cmd('solid:create', 'cylinder'); num('d', 30); num('h', 10); num('cx', 80); await ok(30000); });
    const quader = await neu(() => box(6, 6, 6, { cx: 110 }));
    // 1) Punkt zu Punkt: eine Ecke des Anschlags wandert auf die obere Ecke der Grundplatte
    await cmd('solid:modify', 'move');
    click(`#dialog [data-cmd="body-pick"][data-id="${anschlag}"]`); await sleep(250);
    const art = D.querySelector('#dialog select[data-segsel="mode"]');
    expect(art && art.options.length === 5, 'Art: fünf Möglichkeiten im Dialog');
    await seg('mode', 'points');
    expect(!/Versatz/.test(q('#dialog').textContent), 'Punkt zu Punkt ohne Versatzfelder');
    const kante = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2]) < 1e-6 && Math.abs(e.info.p1[2]) < 1e-6 && Math.abs(Math.abs(e.info.dir[0]) - 1) < 1e-6 && Math.abs(e.info.p0[1] + 5) < 1e-6);
    const stutze = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6 && Math.abs(e.info.p0[0] - 30) < 1e-6 && Math.abs(e.info.p0[1] - 10) < 1e-6);
    expect(kante && stutze, 'Kanten für Von und Nach gefunden');
    if (!kante || !stutze) return;
    pick({ ...kante, point: [kante.info.p0, kante.info.p1].find(p => p[0] > -50) });
    await sleep(200);
    click('#dialog [data-cmd="move-to"]'); await sleep(200);
    pick({ ...stutze, point: [stutze.info.p0, stutze.info.p1].find(p => p[2] > 0) });
    await sleep(400);
    await ecken(anschlag, 'Anschlag nach Punkt zu Punkt', [[20, 10, 10], [30, 20, 20]]);
    near(await vol(anschlag), 1000, 1e-6, 'Punkt zu Punkt ist starr: Volumen unverändert');
    await uebernehmen();
    const mv1 = C.doc.features.find(f => f.type === 'move');
    expect(mv1 && mv1.mode === 'points' && mv1.from && mv1.from.e && mv1.to && mv1.to.e, 'Punkt-zu-Punkt-Bezüge stehen in der Datei');
    // 2) Entlang Kante: der Bolzen gleitet über die Unterkante der Platte, mit Richtungsumkehr
    await cmd('solid:modify', 'move');
    click(`#dialog [data-cmd="body-pick"][data-id="${bolzen}"]`); await sleep(250);
    await seg('mode', 'edge');
    expect(!!D.querySelector('#dialog input[data-k="distance"]') && !D.querySelector('#dialog input[data-k="angle"]'), 'entlang Kante: Abstand statt Winkel');
    const gleit = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[0]) - 1) < 1e-6 && Math.abs(e.info.p0[1] + 10) < 1e-6 && Math.abs(e.info.p0[2]) < 1e-6);
    expect(gleit, 'Unterkante der Grundplatte gefunden');
    if (!gleit) return;
    const stand = await bbox(bolzen);
    let prev = C.lastBuild;
    pick(gleit);
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 1');
    prev = C.lastBuild;
    num('distance', 25);
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 2');
    let b = await bbox(bolzen);
    const schub = b[0][0] - stand[0][0];
    near(Math.abs(schub), 25, 1e-6, 'Bolzen gleitet 25 mm entlang der Kante');
    near(b[0][1], stand[0][1], 1e-6, 'kein Versatz senkrecht zur Kante (y)');
    near(b[0][2], stand[0][2], 1e-6, 'kein Versatz senkrecht zur Kante (z)');
    prev = C.lastBuild;
    await seg('flip', 'true');
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 3');
    b = await bbox(bolzen);
    near(b[0][0] - stand[0][0], -schub, 1e-6, 'umgekehrte Richtung schiebt genauso weit zurück');
    near(b[0][1], stand[0][1], 1e-6, 'umgekehrte Richtung: y unverändert');
    near(b[0][2], stand[0][2], 1e-6, 'umgekehrte Richtung: z unverändert');
    await uebernehmen();
    const mv2 = C.doc.features.filter(f => f.type === 'move')[1];
    expect(mv2 && mv2.mode === 'edge' && mv2.edge && mv2.edge.ref && mv2.distance === 25 && mv2.flip === true, 'Kantenbezug, Abstand und Richtung stehen in der Datei');
    // 3) Entlang einer Kreiskante: der Quader dreht um die Achse des Rohrs – Abstand ist die Bogenlänge
    await cmd('solid:modify', 'move');
    click(`#dialog [data-cmd="body-pick"][data-id="${quader}"]`); await sleep(250);
    await seg('mode', 'edge');
    const kreis = edges().find(e => e.info.type === 'CIRCLE' && Math.abs(e.info.p0[2] - 10) < 1e-6 && Math.abs(Math.hypot(e.info.p0[0] - 80, e.info.p0[1]) - 15) < 1e-6);
    expect(kreis, 'Kreiskante am Rohr gefunden');
    if (!kreis) return;
    prev = C.lastBuild;
    pick(kreis);
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 4');
    prev = C.lastBuild;
    num('distance', Math.PI * 15 / 2);
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 5');
    b = await bbox(quader);
    near(b[0][0], 77, 1e-6, 'Viertelkreis: x bei 77');
    near(b[1][0], 83, 1e-6, 'Viertelkreis: x bei 83');
    expect((Math.abs(b[0][1] - 27) < 1e-6 && Math.abs(b[1][1] - 33) < 1e-6) || (Math.abs(b[1][1] + 27) < 1e-6 && Math.abs(b[0][1] + 33) < 1e-6), 'Viertelkreis: y bei 27 bis 33 (Drehrichtung der Kante egal)');
    near(await vol(quader), 216, 1e-6, 'Drehen um die Kreisachse ist starr');
    await uebernehmen();
    // der Drehsinn hängt an der beim Klick gespeicherten Achse, nicht an der Orientierung der Kante im Kern
    {
      const mi = C.doc.features.map(x => x.type).lastIndexOf('move'), mv = C.doc.features[mi];
      expect(Array.isArray(mv.edge && mv.edge.axis), `Kreisachse gespeichert (${JSON.stringify(mv.edge && mv.edge.axis)})`);
      const y0 = b[0][1];
      mv.edge.axis = mv.edge.axis.map(v => -v);
      editTimeline(mi); await sleep(400); await ok(30000);
      const bm = await bbox(quader);
      near(bm[0][1], -b[1][1], 1e-6, 'Achse umgekehrt: Drehung gespiegelt (y)');
      const mv2 = C.doc.features[mi];   // nach OK steht ein neues Objekt im Dokument
      mv2.edge.axis = mv2.edge.axis.map(v => -v);
      editTimeline(mi); await sleep(400); await ok(30000);
      near((await bbox(quader))[0][1], y0, 1e-6, 'Achse zurück: Lage wie vorher');
    }
    // 4) Drehen um Kante: die lotrechte Plattenkante wird zur Drehachse
    await cmd('solid:modify', 'move');
    click(`#dialog [data-cmd="body-pick"][data-id="${bolzen}"]`); await sleep(250);
    await seg('mode', 'axis');
    expect(!!D.querySelector('#dialog input[data-k="angle"]') && !D.querySelector('#dialog input[data-k="distance"]'), 'Drehen um Kante: Winkel statt Abstand');
    const achse = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6 && Math.abs(e.info.p0[0] + 30) < 1e-6 && Math.abs(e.info.p0[1] + 10) < 1e-6);
    expect(achse, 'lotrechte Kante an der Grundplatte gefunden');
    if (!achse) return;
    const vor = await bbox(bolzen);
    prev = C.lastBuild;
    pick(achse);
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 6');
    prev = C.lastBuild;
    num('angle', 90);
    await built(prev, 40000, 'Neuaufbau Verschieben Schritt 7');
    b = await bbox(bolzen);
    near(b[1][0] - b[0][0], 8, 1e-6, 'nach 90° steht die ehemalige y-Seite in x');
    near(b[1][1] - b[0][1], 12, 1e-6, 'nach 90° steht die ehemalige x-Seite in y');
    const px = -30, py = -10;
    const dreher = s => s > 0
      ? [[px - (vor[1][1] - py), py + (vor[0][0] - px), vor[0][2]], [px - (vor[0][1] - py), py + (vor[1][0] - px), vor[1][2]]]
      : [[px + (vor[0][1] - py), py - (vor[1][0] - px), vor[0][2]], [px + (vor[1][1] - py), py - (vor[0][0] - px), vor[1][2]]];
    expect([1, -1].some(s => { const e = dreher(s); return [0, 1].every(i => [0, 1, 2].every(k => Math.abs(b[i][k] - e[i][k]) < 1e-6)); }), 'Drehung sitzt auf der angeklickten Kantenachse');
    await uebernehmen();
    const mv4 = C.doc.features.filter(f => f.type === 'move')[3];
    expect(mv4 && mv4.mode === 'axis' && mv4.axisRef && Math.abs(mv4.axisRef.d[2]) > 0.999, 'Achse aus der angeklickten Kante steht in der Datei');
    // 5) Zurück zu Abstand/Winkel: die Felder der anderen Arten fallen aus der Datei
    const idx = C.doc.features.findIndex(f => f.type === 'move' && f.mode === 'axis');
    editTimeline(idx); await sleep(500);
    const stand2 = await bbox(bolzen);
    await seg('mode', 'free');
    expect(!D.querySelector('#dialog [data-cmd="move-axis"]') && !/Punkt wählen/.test(q('#dialog').textContent), 'frei: keine Punkt- oder Achsfelder');
    num('dz', 5);
    await built(prev = C.lastBuild, 40000, 'Neuaufbau Verschieben Schritt 8');
    b = await bbox(bolzen);
    near(b[0][2] - stand2[0][2], 5, 1e-6, 'freier Versatz in z funktioniert weiter');
    await uebernehmen();
    const alt = C.doc.features[idx];
    expect(!['mode', 'axisRef', 'distance', 'edge', 'from', 'to', 'flip'].some(k => k in alt), 'die Felder der anderen Arten sind aus der Datei entfernt');
    expect(alt.dz === 5, 'der freie Versatz bleibt');
  }],
  ['Mittelebene und Tangentialebene', async () => {
    await openExample('Flansch mit Arbeitsachse');
    await cmd('solid:construct', 'plane'); click('#dialog [data-cmd="plane-mode"][data-m="tan"]'); await sleep(200);
    const cf = faces().find(f => f.info.type === 'CYLINDRE' && f.info.radius > 30);
    pick({ ...cf, point: [cf.info.axisO[0] + cf.info.radius, cf.info.axisO[1], 2] }); await ok();
    const tp = C.vp.workPlanes[C.vp.workPlanes.length - 1].plane;
    near(tp.o[0], 90, 1e-6, 'Tangentialebene bei x = 90'); near(tp.n[0], 1, 1e-9, 'Normale radial');
    await cmd('solid:construct', 'plane'); click('#dialog [data-cmd="plane-mode"][data-m="mid"]'); await sleep(200);
    const fs = faces().filter(f => f.info.type === 'PLANE' && Math.abs(Math.abs(f.info.n[2]) - 1) < 1e-6);
    pick(fs.reduce((a, b) => (a.info.center[2] < b.info.center[2] ? a : b)));
    pick(fs.reduce((a, b) => (a.info.center[2] > b.info.center[2] ? a : b)));
    await ok();
    const mp = C.vp.workPlanes[C.vp.workPlanes.length - 1].plane;
    near(mp.o[2], (Math.min(...fs.map(f => f.info.center[2])) + Math.max(...fs.map(f => f.info.center[2]))) / 2, 1e-6, 'Mittelebene in der Mitte');
  }],
  ['Lotrechte Ebene auf einer Fläche', async () => {
    // senkrecht auf einer Körperfläche, durch eine angeklickte Ecke
    await newDoc();
    await box(200, 120, 10);
    await cmd('solid:construct', 'plane');
    click('#dialog [data-cmd="plane-mode"][data-m="perp"]'); await sleep(300);
    const front = faces().find(f => f.info.type === 'PLANE' && Math.abs(f.info.n[1] + 1) < 1e-6);
    expect(!!front, 'Vorderfläche der Platte gefunden');
    pick(front); await sleep(400);
    click('#dialog [data-cmd="perp-point"]'); await sleep(300);
    const e = edges().find(x => x.info.type === 'LINE' && x.info.p0 && x.info.p1
      && Math.abs(x.info.p0[1] + 60) < 1e-6 && Math.abs(x.info.p1[1] + 60) < 1e-6
      && Math.abs(x.info.p0[2] - 10) < 1e-6 && Math.abs(x.info.p1[2] - 10) < 1e-6);
    expect(!!e, 'obere Vorderkante gefunden');
    pick({ ...e, point: [-100, -60, 10] }); await sleep(400);
    await ok();
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'plane' && f.base && f.base.kind === 'perp', 'Ebene mit Basis „lotrecht“ gespeichert');
    const p = C.vp.workPlanes[C.vp.workPlanes.length - 1].plane;
    near(Math.abs(p.n[0] * front.info.n[0] + p.n[1] * front.info.n[1] + p.n[2] * front.info.n[2]), 0, 1e-9, 'Ebene steht senkrecht auf der Fläche');
    near(p.o[0], -100, 1e-6, 'Ebene liegt an der gewählten Ecke (X)');
    near(p.o[1], -60, 1e-6, '… (Y)'); near(p.o[2], 10, 1e-6, '… (Z)');
    const k = [p.x[1] * p.y[2] - p.x[2] * p.y[1], p.x[2] * p.y[0] - p.x[0] * p.y[2], p.x[0] * p.y[1] - p.x[1] * p.y[0]];
    near(Math.max(...k.map((v, i) => Math.abs(v - p.n[i]))), 0, 1e-9, 'Achsen der Ebene stehen rechtshändig aufeinander');
  }],
  ['Benutzerkoordinatensystem auf einer Fläche', async () => {
    // "Benutzerkoordinatensystem": auf einer Körperfläche, Ursprung an einer Ecke, um z gedreht
    await newDoc();
    await box(60, 40, 20);
    await cmd('solid:construct', 'bks');
    const top = faces().find(f => f.info.type === 'PLANE' && Math.abs(f.info.n[2] - 1) < 1e-6);
    expect(!!top, 'Oberfläche der Platte gefunden');
    pick(top); await sleep(400);
    click('#dialog [data-cmd="bks-origin"]'); await sleep(300);
    const e = edges().find(x => x.info.type === 'LINE' && x.info.p0 && x.info.p1
      && Math.abs(x.info.p0[2] - 20) < 1e-6 && Math.abs(x.info.p1[2] - 20) < 1e-6
      && Math.abs(x.info.p0[0] + 30) < 1e-6 && Math.abs(x.info.p1[0] + 30) < 1e-6);
    expect(!!e, 'linken oberen Randkante gefunden');
    pick({ ...e, point: [-30, -20, 20] }); await sleep(400);
    num('rot', 30);
    await ok();
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'bks' && f.base && f.base.kind === 'face', 'Benutzerkoordinatensystem mit Fläche als Basis gespeichert');
    near(f.originP[0], -30, 1e-6, 'angeklickter Punkt in der Datei');
    const pl = C.vp.workPlanes.filter(p => p.id === f.id || String(p.id).startsWith(f.id + ':'));
    expect(pl.length === 3, `drei Ebenen des BKS im Viewport (${C.vp.workPlanes.map(p => p.id).join(',')})`);
    const ax = C.vp.workAxes.filter(a => String(a.id).startsWith(f.id + ':'));
    expect(ax.length === 3, 'drei Achsen des BKS');
    const org = C.vp.workPoints.find(p => p.id === f.id);
    expect(!!org, 'Ursprungpunkt des BKS');
    if (!org || pl.length !== 3 || ax.length !== 3) return;
    near(org.p[0], -30, 1e-6, 'Ursprung an der gewählten Ecke (x)');
    near(org.p[1], -20, 1e-6, '. (y)'); near(org.p[2], 20, 1e-6, '. (z)');
    const dx = ax.find(a => a.id === f.id + ':x').axis.d, dy = ax.find(a => a.id === f.id + ':y').axis.d, dz = ax.find(a => a.id === f.id + ':z').axis.d;
    near(dz[2], 1, 1e-9, 'z steht senkrecht auf der Fläche');
    near(dx[0], Math.cos(Math.PI / 6), 1e-9, 'x um 30° gegen y gedreht'); near(dx[1], Math.sin(Math.PI / 6), 1e-9, '.');
    near(dy[0], -Math.sin(Math.PI / 6), 1e-9, 'y wandert mit'); near(dy[1], Math.cos(Math.PI / 6), 1e-9, '.');
    expect(ax.every(a => a.tag), 'Achsen sind als Achsen mit Beschriftung markiert');
    const xy = pl.find(p => p.id === f.id);
    expect(!!xy, 'xy-Ebene des BKS ohne Zusatz');
    if (!xy) return;
    // Skizze auf der xy-Ebene des BKS: die Auswahl der Ebene funktioniert über ihre ID
    click('[data-menu="solid:create"]'); await sleep(200);
    click('#fmenu [data-cmd="sketch"]'); await sleep(300);
    pick({ kind: 'workplane', id: f.id, plane: xy.plane });
    await waitFor(() => C.editor, 6000, 'Skizzen-Editor auf der BKS-Ebene');
    await sleep(300);
    sketchClick(-5, -5); sketchClick(5, -5); sketchClick(5, 5); sketchClick(-5, 5); sketchClick(-5, -5);
    await sleep(200);
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 6000, 'Skizze fertig');
    const sk = C.doc.features[C.doc.features.length - 1];
    expect(sk.type === 'sketch' && sk.planeRef === f.id, 'Skizze bezieht sich auf die Ebene des BKS');
    await cmd('solid:create', 'extrude');
    num('distance', 5);
    await ok();
    expect(C.lastBuild.bodies.length === 1, `Noppe schließt sich an den Körper an (${C.lastBuild.bodies.length})`);
    const nid = C.lastBuild.bodies[0];
    near(await vol(nid), 60 * 40 * 20 + 10 * 10 * 5, 1e-6, 'Noppe auf der BKS-Ebene');
    const b = await bbox(nid), h = 5 * (Math.cos(Math.PI / 6) + Math.sin(Math.PI / 6));
    near(b[0][0], -30 - h, 1e-6, 'Noppe mittig um den angeklickten Punkt (x-)');
    near(b[1][0], 30, 1e-6, '. (x bleibt bei der Platte)');
    near(b[0][1], -20 - h, 1e-6, '. (y-)'); near(b[1][1], 20, 1e-6, '. (y)');
    near(b[0][2], 0, 1e-6, '. (unten)'); near(b[1][2], 25, 1e-6, '. (oben über der Fläche)');
    // die drei Ebenen des BKS stehen auch im Browser zum Skizzieren
    const rows = [...D.querySelectorAll('#browser [data-cmd="sketch-wp"]')].filter(b2 => b2.dataset.id === f.id || b2.dataset.id.startsWith(f.id + ':'));
    expect(rows.length === 3, `drei Ebenen des BKS im Browser (${rows.map(b2 => b2.dataset.id).join(',')})`);
    if (rows.length !== 3) return;
    click(`#browser [data-cmd="sketch-wp"][data-id="${f.id}:x"]`);
    await waitFor(() => C.editor, 6000, 'Skizze auf der yz-Ebene des BKS');
    await sleep(300);
    sketchClick(0, 0); sketchClick(4, 0); sketchClick(4, 3); sketchClick(0, 3); sketchClick(0, 0);
    await sleep(200);
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 6000, 'Skizze fertig');
    expect(C.doc.features[C.doc.features.length - 1].planeRef === f.id + ':x', 'Skizze aus dem Browser auf der yz-Ebene des BKS');
  }],
  ['Rohr: Querschnitt und Hohl umschalten', async () => {
    await openExample('Rohrbogen');
    const L = 100 + 15 * Math.PI + 50;
    editTimeline(1); await sleep(600);
    await act(() => seg('section', 'square'));
    expect(/Seitenlänge/.test(q('#dialog').textContent), 'Feld heißt Seitenlänge');
    near(await vol('r1'), (400 - 256) * L, 0.05, 'Quadratrohr 20×2');
    await act(() => seg('hollow', 'false'));
    expect(!D.querySelector('#dialog input[data-k="wall"]'), 'Wandstärke verschwindet bei Voll');
    near(await vol('r1'), 400 * L, 0.05, 'Vollquerschnitt');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    // Teilstrecke 50 %: L/2 = 98,56 liegt noch auf der ersten Geraden (0 … 100) → Rundrohr ⌀ 20 × 2 bis x 98,56
    editTimeline(1); await sleep(600); num('pathFrac', 50); await ok();
    near(await vol('r1'), Math.PI * (100 - 64) * L / 2, 0.05, 'halbe Strecke: π·(10² − 8²)·L/2');
    near((await bbox('r1'))[1][0], L / 2, 1e-4, 'endet senkrecht bei x = L/2');
    // Anfang dazu („Abstand 1“): 25 % … 50 % – beide Marken liegen auf der ersten Geraden
    const fid = C.doc.features[1].id;
    editTimeline(1); await sleep(600);
    expect(/Teilstrecke ab/.test(q('#dialog').textContent), 'Feld „Teilstrecke ab“ im Dialog');
    num('pathFrac0', 25); await ok();
    near(await vol('r1'), Math.PI * (100 - 64) * L / 4, 0.05, '25 % bis 50 %: π·(10² − 8²)·L/4');
    const bb = await bbox('r1');
    near(bb[0][0], L / 4, 1e-4, 'beginnt senkrecht bei x = L/4'); near(bb[1][0], L / 2, 1e-4, 'endet senkrecht bei x = L/2');
    // über Kreuz: „ab“ hinter „bis“
    editTimeline(1); await sleep(600); num('pathFrac0', 60); await ok();
    expect(/Von der Teilstrecke bleibt nichts übrig/.test((C.lastBuild.status[fid] || {}).error || ''),
      `Meldung bei ab > bis (${(C.lastBuild.status[fid] || {}).error})`);
  }],
  ['Zeichnung: Stückliste als CSV', async () => {
    // Teileliste der Zeichnung als CSV: dieselben Positionen wie die Tabelle auf dem Blatt (drawing.data.bom),
    // beim verschraubten Winkel 4 Positionen mit den Normteilen
    await openExample('Winkel mit Rippe verschraubt');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    try { await waitFor(() => D.querySelector('#drawing .sheet svg') && C.drawing && C.drawing.data && (C.drawing.data.bom || []).length, 20000, 'Zeichnung mit Teileliste'); }
    catch (e) { expect(false, 'DIAG ' + JSON.stringify({ svg: !!D.querySelector('#drawing .sheet svg'), open: C.drawing && C.drawing.open, data: !!(C.drawing && C.drawing.data), bom: C.drawing && C.drawing.data && C.drawing.data.bom, doc: C.doc.name, kind: C.doc.kind }).slice(0, 600)); throw e; }
    const tab = C.drawing.data.bom;
    const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
    let got = null;
    proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
    try { click('[data-cmd="drawing-csv"]'); await waitFor(() => got, 5000, 'Download'); } finally { proto.click = orig; }
    const lines = (await (await W.fetch(got.href)).text()).replace(/^﻿/, '').split('\r\n');
    expect(/Stückliste\.csv$/.test(got.name), `Dateiname ${got.name}`);
    expect(lines[0].startsWith('Pos.;Menge;Benennung') && lines.length === tab.length + 2, `Kopf, ${tab.length} Positionen wie auf dem Blatt, Summe (${lines.length} Zeilen)`);
    expect(tab.length === 4 && lines.some(l => /;4;.*ISO 4762/.test(l)), `verschraubter Winkel: 4 Positionen, Zylinderschrauben 4 Stück (${lines.join(' | ')})`);
  }],
  ['Zeichnung: Texte frei und mit Hinweislinie', async () => {
    await openExample('Winkel mit Rippe');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    const svg = await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q.x, q.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q.x, clientY: q.y })); };
    const n0 = ((C.doc.drawing || {}).notes || []).length;
    click('[data-cmd="drawing-text"]'); await sleep(150);
    clickAt(40, svg.viewBox.baseVal.height - 60); await sleep(300);
    let ed = q('#drawing .dimedit');
    ed.querySelector('textarea').value = 'Zeile 1\nZeile 2'; ed.querySelector('[data-ne="ok"]').click(); await sleep(300);
    click('[data-cmd="drawing-text"]'); await sleep(150);
    const sn = C.drawing.last.snaps.find(s => s.view === 'front');
    clickAt(sn.x, sn.y); await sleep(250); clickAt(sn.x + 25, sn.y - 15); await sleep(300);
    ed = q('#drawing .dimedit'); ed.querySelector('textarea').value = 'Hinweis'; ed.querySelector('[data-ne="ok"]').click(); await sleep(300);
    const nts = C.doc.drawing.notes.slice(n0);
    expect(nts.length === 2 && !nts[0].view && nts[1].view === 'front', 'freier Text und Text an der Vorderansicht angelegt');
    const texts = [...D.querySelectorAll('#drawing .notes .note text')].map(t => t.textContent);
    expect(['Zeile 1', 'Zeile 2', 'Hinweis'].every(t => texts.includes(t)), 'alle Zeilen im Blatt');
    expect(D.querySelectorAll('#drawing .notes .note line').length >= 2, 'Hinweislinie und Bezugslinie gezeichnet');
    await closeDrawing();
  }],
  ['Zeichnung: Durchmesser an Bohrung, Radius an Biegung', async () => {
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const radial = async (ci, ang, dx, dy) => {
      click('[data-cmd="drawing-dim"]'); await sleep(150);
      clickAt(ci.x + ci.rs * Math.cos(ang), ci.y - ci.rs * Math.sin(ang)); await sleep(250);
      clickAt(ci.x + dx, ci.y + dy); await sleep(350);
      click('[data-cmd="drawing-dim"]'); await sleep(150);
    };
    for (const [name, pickC, label] of [['Winkel mit Rippe', ci => ci.full && ci.view === 'top', '⌀9'], ['Kasten Blech 2mm', ci => !ci.full && ci.view === 'front' && Math.abs(ci.r - 4) < 1e-6, 'R4']]) {
      await openExample(name);
      if (C.doc.drawing) C.doc.drawing.dims = [];
      click('[data-rtab="util"]'); await sleep(150);
      click('[data-cmd="drawing"]');
      await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
      const ci = C.drawing.last.circles.find(pickC);
      expect(ci, `${name}: Kreis/Bogen gefunden`);
      if (ci) await radial(ci, ci.full ? Math.PI / 4 : 3 * Math.PI / 4, ci.full ? 15 : -12, ci.full ? -12 : -10);
      const texts = [...D.querySelectorAll('#drawing .udim text')].map(t => t.textContent);
      expect(texts.includes(label), `${name}: Maß ${label} (gefunden: ${texts.join(', ') || '–'})`);
      if (label === 'R4') {
        // Radius auf Bogenlänge umstellen: Biegung 90° mit R 4 → ⌒ 4·π/2 = 6,28
        const dm = C.doc.drawing.dims.find(d => d.kind === 'rad');
        expect(dm && dm.s && dm.e && Math.abs(dm.sweep - Math.PI / 2) < 1e-3, `Bogen mit Anfang, Ende und 90° gespeichert (${dm && dm.sweep})`);
        const tx = [...D.querySelectorAll('#drawing .udim text')].find(t => t.textContent === 'R4');
        const r = tx.getBoundingClientRect();
        tx.dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); await sleep(200);
        const ak = q('#drawing .dimedit [data-de="akind"]');
        expect(/Bogenlänge ⌒ 6,28/.test(ak.textContent), 'Auswahl Radius / Bogenlänge');
        ak.value = 'arc';
        click('#drawing .dimedit [data-de="ok"]'); await sleep(300);
        const t2 = [...D.querySelectorAll('#drawing .udim text')].map(t => t.textContent);
        expect(dm.kind === 'arc' && t2.includes('⌒6,28'), `Bogenlänge ⌒6,28 (${t2.join(', ')})`);
        const { validateDoc, clone } = await import('../src/doc.js');
        expect(validateDoc(clone(C.doc)).drawing.dims.some(d => d.kind === 'arc'), 'Bogenlängenmaß übersteht die Prüfung des Dokuments');
      }
      await closeDrawing();
    }
  }],
  ['Zeichnung: Linienlänge schräg und Winkelmaß', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) C.doc.drawing.dims = [];
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const L = C.drawing.last.lines.filter(l => l.view === 'front'), len = l => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
    const diag = L.filter(l => Math.abs(l.a[0] - l.b[0]) > 1e-3 && Math.abs(l.a[1] - l.b[1]) > 1e-3).sort((a, b) => len(b) - len(a))[0];
    const horiz = L.filter(l => Math.abs(l.a[1] - l.b[1]) < 1e-6).sort((a, b) => len(b) - len(a))[0];
    expect(diag && horiz, 'Rippenkante und Grundplatte als Linien erkannt');
    const mid = l => [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2];
    click('[data-cmd="drawing-dim"]'); await sleep(150);
    let m = mid(diag); clickAt(m[0], m[1]); await sleep(250); clickAt(m[0] + 6, m[1] - 6); await sleep(300);
    m = mid(diag); clickAt(m[0], m[1]); await sleep(250);
    const mh = mid(horiz); clickAt(mh[0] - 3, mh[1]); await sleep(250); clickAt(m[0] + 8, (m[1] + mh[1]) / 2 + 4); await sleep(300);
    click('[data-cmd="drawing-dim"]'); await sleep(150);
    const texts = [...D.querySelectorAll('#drawing .udim text')].map(t => t.textContent);
    expect(texts.includes('45,25'), `schräge Länge 45,25 (gefunden: ${texts.join(', ')})`);
    expect(texts.includes('45°'), 'Winkel 45°');
    await closeDrawing();
  }],
  ['Zeichnung: Schnittansicht mit freier Schnittlinie', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) C.doc.drawing.sheets = [];
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const pl = C.drawing.last.places.front, bb = C.drawing.data.views.front.bb;
    const um = (bb[0][0] + bb[1][0]) / 2 + 0.37, X = pl.px + (um - bb[0][0]) * pl.s;
    click('[data-cmd="drawing-secview"]'); await sleep(150);
    clickAt(X, pl.py - 3); await sleep(200);
    clickAt(X, pl.py + (bb[1][1] - bb[0][1]) * pl.s + 3); await sleep(200);
    clickAt(X + 60, pl.py + 20);
    await waitFor(() => (C.doc.drawing.sheets[0].views || []).some(v => v.sec && v.x !== X + 60), 30000, 'Schnittansicht');
    // der Kern rechnet die Schnittansicht nach; unter Last (Prüfstände parallel) dauert das länger
    await waitFor(() => { const v = C.doc.drawing.sheets[0].views.find(x => x.sec), d = v && C.drawing.data && C.drawing.data.views[v.view]; return d && d.hatch && [...D.querySelectorAll('#drawing .vtitle')].some(t => t.textContent.startsWith('Schnitt B–B')); }, 30000, 'Schnittansicht berechnet').catch(() => {});
    await sleep(200);
    const ev = C.doc.drawing.sheets[0].views.find(v => v.sec), sv = C.drawing.data.views[ev.view];
    expect(Math.abs(ev.sec.a[0] - ev.sec.b[0]) < 1e-6, 'Schnittlinie senkrecht eingerastet');
    expect(ev.sec.arrow[0] > 0.99, `Blick nach rechts (${ev.sec.arrow})`);
    expect(sv && sv.bb && sv.hatch && sv.hatch.length > 0, 'Schnittfläche schraffiert');
    const titles = [...D.querySelectorAll('#drawing .vtitle')].map(t => t.textContent);
    expect(titles.some(t => t.startsWith('Schnitt B–B')), `Titel Schnitt B–B (${titles.join(', ')})`);
    expect([...D.querySelectorAll('#drawing .cut .cutlbl')].filter(t => t.textContent === 'B').length === 2, 'Schnittlinie mit Kennbuchstaben');
    await closeDrawing();
  }],
  ['Zeichnung: abgesetzte Schnittlinie', async () => {
    await openExample('Treppenblock 100x30x40');
    if (C.doc.drawing) C.doc.drawing.sheets = [];
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y, shift) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y, shiftKey: !!shift })); };
    const pl = C.drawing.last.places.front, bb = C.drawing.data.views.front.bb;
    const at = (u, v) => [pl.px + (u - bb[0][0]) * pl.s, pl.py + (bb[1][1] - v) * pl.s];
    // Schnittfläche: über die Dreiecke der Schraffur, in mm² der Ansicht
    const schnittflaeche = sv => ((sv && sv.hatch) || []).reduce((a, t) => a + Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2, 0);
    const neuerSchnitt = async (punkte, seitlich) => {
      const vorher = (C.doc.drawing.sheets[0].views || []).filter(v => v.sec).length;
      click('[data-cmd="drawing-secview"]'); await sleep(150);
      punkte.forEach(([u, v], i) => { clickAt(...at(u, v), i > 1); sleep(250); });
      clickAt(pl.px + (bb[1][0] - bb[0][0]) * pl.s + seitlich, pl.py + (bb[1][1] - bb[0][1]) * pl.s / 2);
      await waitFor(() => (C.doc.drawing.sheets[0].views || []).filter(v => v.sec).length > vorher, 30000, 'Schnittansicht');
      const ev = (C.doc.drawing.sheets[0].views || []).filter(v => v.sec).pop();
      // der Kern rechnet die Schnittansicht nach; unter Last (Prüfstände parallel) dauert das länger
      await waitFor(() => { const d = C.drawing.data && C.drawing.data.views[ev.view]; return d && d.bb; }, 40000, 'Schnittansicht berechnet');
      return { ev, sv: C.drawing.data.views[ev.view] };
    };
    // gerade Schnittlinie: nur der Sockel (x = 20) wird geschnitten, die Stufe bleibt ganz stehen
    const grad = await neuerSchnitt([[20, 0], [20, 30]], 40);
    // abgesetzt: unten bei x = 20, oben bei x = 80 – beide Stufen werden geschnitten
    const stufe = await neuerSchnitt([[20, 0], [20, 30], [80, 30], [80, 45]], 110);
    await sleep(300);
    const ev = stufe.ev;
    expect(Array.isArray(ev.sec.line) && ev.sec.line.length === 4, `Schnittlinie mit vier Punkten (${JSON.stringify(ev.sec.line)})`);
    expect(Math.abs(ev.sec.line[2][0] - 80) < 0.5 && Math.abs(ev.sec.line[2][1] - 30) < 0.5, `Absetzung bei x = 80, z = 30 (${JSON.stringify(ev.sec.line[2])})`);
    expect(grad.sv && grad.sv.bb && stufe.sv && stufe.sv.bb, 'beide Schnittansichten vorhanden');
    near(stufe.sv.bb[1][0] - stufe.sv.bb[0][0], 30, 0.5, 'Ansicht 30 mm breit');
    near(stufe.sv.bb[1][1] - stufe.sv.bb[0][1], 40, 0.5, 'Ansicht 40 mm hoch');
    near(schnittflaeche(grad.sv), 600, 5, 'gerade Schnittlinie: eine Schnittfläche (600 mm²)');
    // abgesetzt: jeder Abschnitt für sich – der Körper reicht bei x < 40 bis z = 20, darüber bis z = 40.
    // Die Klickpunkte landen auf Pixelkanten, deshalb rechnet der Test die erwartete Fläche aus
    // der gespeicherten Schnittlinie nach; der Abschnitt bei z = 30 steht senkrecht zur Blickrichtung
    // und ergibt in der Ansicht keine Fläche.
    const schnittflaeche_erwartet = line => line.slice(0, -1).reduce((s, p, i) => {
      const q = line[i + 1];
      if (Math.abs(p[0] - q[0]) > 0.01) return s; // wagerechter Abschnitt: Schnittfläche parallel zur Blickrichtung
      const [v1, v2] = [Math.min(p[1], q[1]), Math.max(p[1], q[1])];
      return s + 30 * Math.max(0, Math.min(p[0] < 40 ? 20 : 40, v2) - Math.max(0, v1));
    }, 0);
    near(schnittflaeche(stufe.sv), schnittflaeche_erwartet(ev.sec.line), 1, 'abgesetzte Schnittlinie: beide Schnittflächen');
    const schnitte = [...D.querySelectorAll('#drawing .cut')].filter(g => [...g.querySelectorAll('.cutlbl')].some(t => t.textContent === ev.sec.label));
    expect(schnitte.length === 1 && schnitte[0].querySelectorAll('.cutmid').length === 3, `Schnittlinie mit drei Abschnitten (${schnitte.length} Gruppen)`);
    expect([...schnitte[0].querySelectorAll('.cutlbl')].length === 2, 'Kennbuchstaben an beiden Enden');
    await closeDrawing();
  }],
  ['Zeichnung als DXF', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) { C.doc.drawing.sheets = []; C.doc.drawing.details = []; C.doc.drawing.opts = { ...(C.doc.drawing.opts || {}), section: true }; }
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg .hatch'), 20000, 'Zeichnung mit Schnitt');
    expect(D.querySelector('[data-cmd="drawing-dxf"]'), 'Knopf „Als DXF speichern“');
    const { sheetToDxf } = await import('../src/drawdxf.js');
    const txt = sheetToDxf(D.querySelector('#drawing .sheet svg'));
    const g = txt.split(/\r\n/), ents = [];
    for (let i = g.indexOf('ENTITIES') + 1; i < g.length - 1; i += 2) if (g[i] === '0') ents.push({ t: g[i + 1], i });
    const val = (e, code) => { for (let j = e.i + 2; j < g.length - 1 && g[j] !== '0'; j += 2) if (g[j] === String(code)) return g[j + 1]; return null; };
    // gerade Stücke aus LINE und POLYLINE/VERTEX
    const lines = [];
    let pl = null;
    ents.forEach(e => {
      if (e.t === 'LINE') lines.push({ l: val(e, 8), len: Math.hypot(val(e, 11) - val(e, 10), val(e, 21) - val(e, 20)) });
      else if (e.t === 'POLYLINE') pl = { l: val(e, 8), P: [] };
      else if (e.t === 'VERTEX' && pl) pl.P.push([+val(e, 10), +val(e, 20)]);
      else if (e.t === 'SEQEND' && pl) { pl.P.forEach((q, i) => { if (i) lines.push({ l: pl.l, len: Math.hypot(q[0] - pl.P[i - 1][0], q[1] - pl.P[i - 1][1]) }); }); pl = null; }
    });
    const s = C.drawing.last.scale;
    expect(g[g.length - 2] === 'EOF' && txt.includes('AC1009'), 'vollständige DXF R12');
    expect(lines.some(l => l.l === 'KONTUR' && Math.abs(l.len - 80 * s) < 1e-3), `Kontur 80 mm im Maßstab (${80 * s})`);
    expect(lines.some(l => l.l === 'SCHRAFFUR'), 'Schraffurlinien');
    expect(lines.some(l => l.l === 'MITTELLINIE'), 'Mittellinien');
    expect(ents.some(e => e.t === 'ARC' && val(e, 8) === 'KONTUR'), 'Bohrungen als Kreisbögen');
    expect(ents.some(e => e.t === 'TEXT' && val(e, 1) === '4x %%c9'), 'Bohrungstext mit %%c');
    expect(ents.some(e => e.t === 'TEXT' && val(e, 1) === 'Schnitt A-A'), 'Ansichtstitel');
    click('[data-cmd="dopt-toggle"][data-k="section"]'); await sleep(300);
    await closeDrawing();
  }],
  ['Zeichnung als DWG', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) { C.doc.drawing.sheets = []; C.doc.drawing.details = []; C.doc.drawing.opts = { ...(C.doc.drawing.opts || {}), section: true }; }
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg .hatch'), 20000, 'Zeichnung mit Schnitt');
    expect(D.querySelector('[data-cmd="drawing-dwg"]'), 'Knopf „Als DWG speichern“');
    /* Maßstab ist der DXF-Ausgabe: gleiches Blatt, nur binär. Vergleichsbasis ist der DXF-Text. */
    const { sheetToDxf } = await import('../src/drawdxf.js');
    const dxf = sheetToDxf(D.querySelector('#drawing .sheet svg'));
    /* Vergleichsmaßstab: was die Bibliothek aus unserem DXF-Text macht – die DWG muss genau dasselbe enthalten */
    const { readDxf } = await import('/cdn/npm/nasjidwg@0.18.0/dist/dxf/reader.js');
    const model = readDxf(dxf);
    const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
    let got = null;
    proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
    try { click('[data-cmd="drawing-dwg"]'); await waitFor(() => got, 30000, 'DWG'); } finally { proto.click = orig; }
    expect(/\.dwg$/.test(got.name), `Dateiname ${got.name}`);
    const bytes = new Uint8Array(await (await W.fetch(got.href)).arrayBuffer());
    const kopf = String.fromCharCode(...bytes.slice(0, 6));
    expect(kopf === 'AC1009', `DWG im Format R12 wie der DXF-Export (${kopf}, ${bytes.length} Bytes)`);
    const { readDwg } = await import('/cdn/npm/nasjidwg@0.18.0/dist/dwg/reader.js');
    const back = readDwg(bytes);
    const zaehl = list => { const c = {}; list.forEach(e => { c[e.type] = (c[e.type] || 0) + 1; }); return c; };
    const cnt = zaehl(back.entities), modelCnt = zaehl(model.entities);
    /* dieselben Einträge wie beim DXF-Text, den die Bibliothek gelesen hat */
    expect(JSON.stringify(Object.fromEntries(Object.entries(cnt).sort())) === JSON.stringify(Object.fromEntries(Object.entries(modelCnt).sort())), `${back.entities.length} Einträge wie im DXF (${JSON.stringify(modelCnt)} → ${JSON.stringify(cnt)})`);
    expect([...new Set(model.layers.map(l => l.name))].sort().join(',') === [...new Set(back.layers.map(l => l.name))].sort().join(','), `Layer unverändert (${[...new Set(back.layers.map(l => l.name))].join(',')})`);
    const layer = [...new Set(back.entities.map(e => e.layer))].sort();
    ['KONTUR', 'SCHRAFFUR', 'MITTELLINIE', 'BEMASSUNG'].forEach(l => expect(layer.includes(l), `Layer ${l} vorhanden (${layer.join(',')})`));
    /* Texte: die DWG gibt genau dieselben Zeichenketten zurück, die im DXF stehen (auch %%c für ⌀) */
    const tDxf = model.entities.filter(e => e.type === 'text').map(e => e.text);
    const tDwg = back.entities.filter(e => e.type === 'text').map(e => e.text);
    expect(tDxf.length === tDwg.length && tDxf.every((s, i) => s === tDwg[i]), `${tDxf.length} Texte unverändert (u. a. ${JSON.stringify(tDxf.filter(s => /%%c|Schnitt/.test(s)))})`);
    /* Konturmaße: gerade Stücke aus Linien und Polylinien, wie im DXF-Ablauf */
    const s = C.drawing.last.scale;
    const seg = [];
    back.entities.forEach(e => {
      if (e.layer !== 'KONTUR') return;
      if (e.type === 'line') seg.push(Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y));
      else if (e.type === 'polyline') {
        const p = e.vertices || [];
        for (let i = 1; i < p.length; i++) seg.push(Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
        if (e.closed && p.length > 2) seg.push(Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y));
      }
    });
    expect(seg.some(v => Math.abs(v - 80 * s) < 1e-3), `Kontur 80 mm im Maßstab (${80 * s}, längstes Stück ${Math.max(...seg).toFixed(1)})`);
    await closeDrawing();
  }],
  ['Zeichnung: Basislinien-, Ketten- und Koordinatenmaße', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) { C.doc.drawing.dims = []; C.doc.drawing.sheets = []; }
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const sn = (u, v) => C.drawing.last.snaps.find(q => q.view === 'top' && Math.abs(q.u - u) < 1e-6 && Math.abs(q.v - v) < 1e-6);
    const P = [sn(0, 0), sn(35, 12), sn(65, 12), sn(80, 0)];
    expect(P.every(Boolean), 'Fangpunkte Ecke, Bohrungsmitten, Ecke in der Draufsicht');
    const texts = () => [...D.querySelectorAll('#drawing .udim text')].map(t => t.textContent);
    const run = async (cmdName, pts) => {
      click(`[data-cmd="${cmdName}"]`); await sleep(150);
      for (const q of pts) { clickAt(q.x, q.y); await sleep(120); }
      clickAt(P[0].x + 5, P[0].y + 18); await sleep(250);
      click(`[data-cmd="${cmdName}"]`); await sleep(150);
    };
    await run('drawing-dimbase', P);
    expect(['35', '65', '80'].every(v => texts().includes(v)), `Basislinie 35/65/80 (${texts().join(', ')})`);
    C.doc.drawing.dims = [];
    await run('drawing-dimchain', [P[0], P[2], P[1], P[3]]);
    expect(['35', '30', '15'].every(v => texts().includes(v)) && texts().length === 3, `Kette 35/30/15 (${texts().join(', ')})`);
    C.doc.drawing.dims = [];
    await run('drawing-dimord', P);
    expect(['0', '35', '65', '80'].every(v => texts().includes(v)) && texts().length === 4, `Koordinaten 0/35/65/80 (${texts().join(', ')})`);
    const ords = C.doc.drawing.dims.filter(d => d.kind === 'ord');
    expect(ords.length === 4 && ords.every(d => d.dir === 'h'), 'vier waagerechte Koordinatenmaße');
    await closeDrawing();
  }],
  ['Zeichnung: Bohrungstabelle mit Nullpunkt', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) { C.doc.drawing.dims = []; C.doc.drawing.sheets = []; C.doc.drawing.htabs = []; }
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const o = C.drawing.last.snaps.find(q => q.view === 'top' && Math.abs(q.u) < 1e-6 && Math.abs(q.v) < 1e-6);
    expect(o, 'Fangpunkt Ecke 0/0 in der Draufsicht');
    click('[data-cmd="drawing-holetab"]'); await sleep(150);
    clickAt(o.x, o.y); await sleep(150);
    clickAt(25, 25); await sleep(300);
    const ht = (C.doc.drawing.htabs || [])[0];
    expect(ht && ht.view === 'top' && ht.o[0] === 0 && ht.o[1] === 0, 'Tabelle mit Nullpunkt 0/0 in der Draufsicht gespeichert');
    const cells = [...D.querySelectorAll('#drawing .htab text')].map(t => t.textContent);
    expect(cells.includes('Bohrungstabelle') && cells.includes('Kennung'), 'Überschrift und Kopf');
    expect(['A1', 'A2', 'A3', 'A4', '35', '65', '12', '38', '⌀9'].every(c => cells.includes(c)) && cells.filter(c => c === '⌀9').length === 4, `A1–A4 bei X 35/65, Y 12/38, ⌀9 (${cells.join(" | ")})`);
    expect(!C.drawing.setMode, 'Befehl nach dem Ablegen beendet');
    // Klick auf die Überschrift: löschen
    const h = D.querySelector('#drawing [data-htab]');
    h.dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: h.getBoundingClientRect().x + 2, clientY: h.getBoundingClientRect().y + 2 }));
    await sleep(100);
    click('#drawing [data-he="del"]'); await sleep(200);
    expect(!C.doc.drawing.htabs.length && !D.querySelector('#drawing .htab'), 'Tabelle gelöscht');
    await closeDrawing();
  }],
  ['Zeichnung: Ausbruch ohne verdeckte Kanten, auch in der Einzelheit', async () => {
    await openExample('Winkel mit Rippe');
    // zuerst ohne Ausbruch öffnen und die verdeckten Kanten der Vorderansicht abtasten: Ausbruch und Einzelheit
    // werden genau über einem Teil davon angelegt, sonst ist der Ausbruch leer und es wäre nichts geprüft
    C.doc.drawing = { opts: { hidden: true }, dims: [] };
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const bb = C.drawing.data.views.front.bb, w = bb[1][0] - bb[0][0], h = bb[1][1] - bb[0][1];
    // Gruppe der verdeckten Kanten dieser Ansicht (die Ansicht selbst hat keine eigene Klasse)
    const frontHid = () => {
      const p = C.drawing.last.places.front;
      const g = [...D.querySelectorAll('#drawing .sheet svg g.view')].find(x => {
        const m = (x.getAttribute('transform') || '').match(/translate\(([-\d.e]+)[ ,]+([-\d.e.]+)/);
        return m && Math.abs(+m[1] - (p.px - bb[0][0] * p.s)) < 0.01 && Math.abs(+m[2] - (p.py + bb[1][1] * p.s)) < 0.01;
      });
      return g && g.querySelector('g.hid');
    };
    // Punkte der verdeckten Züge in Ansichtskoordinaten (Gruppenraum ist y-negativ)
    const hidPts = () => {
      const out = [];
      [...(frontHid() ? frontHid().querySelectorAll('path') : [])].forEach(el => {
        const L = el.getTotalLength();
        if (!L) return;
        for (let k = 0; k <= 30; k++) { const q = el.getPointAtLength(L * k / 30); out.push([q.x, -q.y]); }
      });
      return out;
    };
    const hp = hidPts();
    expect(hp.length > 20, `verdeckte Kanten der Vorderansicht (${hp.length} Punkte)`);
    const loOf = ax => Math.min(...hp.map(p => p[ax])), hiOf = ax => Math.max(...hp.map(p => p[ax]));
    const ax = hiOf(0) - loOf(0) >= hiOf(1) - loOf(1) ? 0 : 1;
    const quant = q => { const s = hp.map(p => p[ax]).sort((x, y) => x - y); return s[Math.round(q * (s.length - 1))]; };
    const lo = loOf(ax), a40 = quant(0.4), a70 = quant(0.7), hi = hiOf(ax);
    expect(a40 > lo && a70 > a40 && hi > a70, `verdeckte Kanten verteilen sich über einen Bereich (${ax ? 'v' : 'u'}: ${lo} / ${a40} / ${a70} / ${hi})`);
    // Ausbruch = Teil der verdeckten Kanten, Zuschnitt = größerer Kasten, der zwischen Ausbruch und Rest endet
    const grenz = b => [[Math.max(b[0][0], bb[0][0] + 0.2), Math.max(b[0][1], bb[0][1] + 0.2)], [Math.min(b[1][0], bb[1][0] - 0.2), Math.min(b[1][1], bb[1][1] - 0.2)]];
    const eck = (p0, p1) => [p0, [p1[0], p0[1]], p1, [p0[0], p1[1]]];
    const rand = ax ? [[loOf(0) - 1, lo - 1], [hiOf(0) + 1, hi + 1]] : [[lo - 1, loOf(1) - 1], [hi + 1, hiOf(1) + 1]];
    const aus = grenz(ax ? [[rand[0][0], lo - 1], [rand[1][0], a40]] : [[lo - 1, rand[0][1]], [a40, rand[1][1]]]);
    const schnitt = grenz(ax ? [[rand[0][0], lo - 1], [rand[1][0], a70]] : [[lo - 1, rand[0][1]], [a70, rand[1][1]]]);
    const pts = eck(aus[0], aus[1]);
    const inRect = (b, p) => p[0] >= b[0][0] - 1e-9 && p[0] <= b[1][0] + 1e-9 && p[1] >= b[0][1] - 1e-9 && p[1] <= b[1][1] + 1e-9;
    const nAus = hp.filter(p => inRect(aus, p)).length, nSchnitt = hp.filter(p => inRect(schnitt, p)).length;
    expect(nAus > 0 && nSchnitt > nAus && nSchnitt < hp.length, `Ausbruch und Zuschnitt treffen verschiedene Teile (${nAus} im Ausbruch, ${nSchnitt} im Zuschnitt, ${hp.length} Punkte)`);
    await closeDrawing();
    C.doc.drawing = { opts: { hidden: true }, dims: [], breakouts: [{ id: 'bo1', view: 'front', pts, depth: 5 }], details: [{ id: 'd1', view: 'front', label: 'Z', c: [(aus[0][0] + aus[1][0]) / 2, (aus[0][1] + aus[1][1]) / 2], r: 12, k: 2, at: [60, 150] }] };
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg .details'), 20000, 'Zeichnung mit Einzelheit');
    const fv = C.drawing.data.views.front;
    expect(fv.breakout && fv.breakout.length === 1 && fv.hid.length > 0, `Ausbruch im Kern berechnet, Ansicht hat verdeckte Kanten (${fv.hid.length})`);
    const hids = [...D.querySelectorAll('#drawing .sheet svg .hid')];
    const clipped = hids.filter(g => /url\(#hc\d+\)/.test(g.getAttribute('clip-path') || ''));
    expect(clipped.length >= 2, `verdeckte Kanten ausgeschnitten in Ansicht und Einzelheit (${clipped.length} von ${hids.length})`);
    expect(clipped.some(g => g.closest('.details')), 'auch in der Einzelheit');
    const cp = D.querySelector(`#drawing .sheet svg clipPath[id="${clipped[0].getAttribute('clip-path').match(/#([^)]+)/)[1]}"] path`);
    expect(cp && cp.getAttribute('clip-rule') === 'evenodd' && (cp.getAttribute('d').match(/M/g) || []).length === 2, 'Ausschnitt: großes Rechteck minus Ausbruch-Umriss');
    // DXF: der Ausschnitt gilt auch im Export – im Ausbruch bleibt kein Strichstrich übrig
    const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
    const dxfText = async () => {
      let got = null;
      proto.click = function () { if (this.download) got = { href: this.href }; else orig.call(this); };
      try { click('[data-cmd="drawing-dxf"]'); await waitFor(() => got, 8000, 'DXF'); } finally { proto.click = orig; }
      return W.fetch(got.href).then(r => r.text());
    };
    const hidSegs = txt => {
      const gl = txt.split(/\r\n/), ents = [];
      for (let i = gl.indexOf('ENTITIES') + 1; i < gl.length - 1; i += 2) if (gl[i] === '0') ents.push({ t: gl[i + 1], i: i });
      const val = (e, code) => { for (let j = e.i + 2; j < gl.length - 1 && gl[j] !== '0'; j += 2) if (gl[j] === String(code)) return gl[j + 1]; return null; };
      const segs = [];
      let pol = null;
      ents.forEach(e => {
        if (e.t === 'LINE') { if (val(e, 8) === 'VERDECKT') segs.push([[+val(e, 10), +val(e, 20)], [+val(e, 11), +val(e, 21)]]); }
        else if (e.t === 'POLYLINE') pol = val(e, 8) === 'VERDECKT' ? [] : null;
        else if (e.t === 'VERTEX' && pol) pol.push([+val(e, 10), +val(e, 20)]);
        else if (e.t === 'SEQEND' && pol) { for (let k = 1; k < pol.length; k++) segs.push([pol[k - 1], pol[k]]); pol = null; }
      });
      return segs;
    };
    // Blattkoordinaten der Vorderansicht: Ansichtskoordinaten → Blatt, für das DXF wie im Export y nach unten geklappt
    const H = Number(D.querySelector('#drawing .sheet svg').getAttribute('viewBox').split(/[\s,]+/)[3]);
    let pl = C.drawing.last.places.front;
    const at = (u, v) => [pl.px + (u - bb[0][0]) * pl.s, H - (pl.py + (bb[1][1] - v) * pl.s)];
    // nur die Züge dieser Ansicht (auf dem Blatt stehen noch weitere Ansichten und die Einzelheit)
    const inView = s => s.every(p => p[0] >= pl.px - 1 && p[0] <= pl.px + w * pl.s + 1 && p[1] >= H - pl.py - h * pl.s - 1 && p[1] <= H - pl.py + 1);
    const inside = (ring, p) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const mid = s => [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
    const brk = ((fv.breakout || [])[0] || {}).pts || pts;
    expect(brk.length === pts.length && brk.every((p, i) => Math.abs(p[0] - pts[i][0]) < 1e-6 && Math.abs(p[1] - pts[i][1]) < 1e-6), `Ausbruch-Umriss wie angegeben (${JSON.stringify(brk)})`);
    const ringOf = ps => ps.map(p => at(p[0], p[1]));
    let brkDXF = ringOf(brk);
    // Züge auf der Ausschnittkante dürfen stehenbleiben (wie im SVG), geprüft wird das Innere des Ausbruchs
    const innen = (r, d = 0.05) => { const xs = r.map(p => p[0]), ys = r.map(p => p[1]); return eck([Math.min(...xs) + d, Math.min(...ys) + d], [Math.max(...xs) - d, Math.max(...ys) - d]); };
    const segs = hidSegs(await dxfText()).filter(inView).filter(s => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 0.05);
    const inBrk = segs.filter(s => inside(innen(brkDXF), mid(s)));
    expect(segs.length > 0 && inBrk.length === 0, `DXF: verdeckte Züge nur außerhalb des Ausbruchs (${segs.length} Züge, ${inBrk.length} im Ausbruch)`);
    // Kontrolle der Rechnung: die abgetasteten Punkte liegen im DXF tatsächlich im Ausbruchbereich
    const free = hp.map(p => at(p[0], p[1])).filter(p => inside(innen(brkDXF), p)).length;
    expect(free > 0, `im Ausbruchbereich liegen verdeckte Züge (${free} von ${hp.length} Punkten)`);
    // dieselbe Ansicht zusätzlich zuschneiden (über das Werkzeug): beide Ausschnitte gelten zusammen (auch im DXF)
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y, button: 0 })); };
    const sheetPt = (u, v) => [pl.px + (u - bb[0][0]) * pl.s, pl.py + (bb[1][1] - v) * pl.s];
    click('[data-cmd="drawing-crop"]'); await sleep(150);
    clickAt(...sheetPt(schnitt[0][0], schnitt[1][1])); await sleep(150);
    clickAt(...sheetPt(schnitt[1][0], schnitt[0][1])); await sleep(500);
    const crops = C.doc.drawing.crops || [];
    expect(crops.length === 1 && crops[0].view === 'front', `Zuschnitt derselben Ansicht (${JSON.stringify(crops)})`);
    await waitFor(() => D.querySelector('#drawing .sheet svg [data-crop]'), 20000, 'zugeschnittene Ansicht');
    pl = C.drawing.last.places.front;
    brkDXF = ringOf(brk);
    const bx = crops[0].box;
    const ring = ringOf([[bx[0][0], bx[0][1]], [bx[1][0], bx[0][1]], bx[1], [bx[0][0], bx[1][1]]]);
    const segs2 = hidSegs(await dxfText()).filter(inView).filter(s => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 0.05);
    const outside = segs2.filter(s => !inside(innen(ring, -0.05), mid(s))).length, dropped = segs.filter(s => !inside(innen(ring, -0.05), mid(s))).length;
    expect(segs2.length > 0 && segs2.length < segs.length && outside === 0 && dropped > 0 && !segs2.some(s => inside(innen(brkDXF), mid(s))),
      `DXF: Zuschnitt und Ausbruch gemeinsam (${segs.length} → ${segs2.length} Züge, ${dropped} fielen weg, ${outside} außerhalb des Zuschnitts)`);
    delete C.doc.drawing.crops;
    delete C.doc.drawing.breakouts; delete C.doc.drawing.details;
    await closeDrawing();
  }],
  ['Zeichnung: Zuschneideansicht', async () => {
    // Vorderansicht auf ihre linke Hälfte zuschneiden (zwei Klicks im Werkzeug), DXF enthält dann weniger Linien in
    // dieser Ansicht; zweimal dieselbe Stelle hebt den Zuschnitt wieder auf
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) delete C.doc.drawing.crops;
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const dxfText = async () => {
      const proto = W.HTMLAnchorElement.prototype, orig = proto.click; let got = null;
      proto.click = function () { if (this.download) got = { href: this.href }; else orig.call(this); };
      try { click('[data-cmd="drawing-dxf"]'); await waitFor(() => got, 5000, 'DXF'); } finally { proto.click = orig; }
      return (await W.fetch(got.href)).text();
    };
    const n0 = ((await dxfText()).match(/\r?\n(LINE|LWPOLYLINE|POLYLINE|ARC|CIRCLE|SPLINE)\r?\n/g) || []).length;
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y, button: 0 })); };
    const pl = C.drawing.last.places.front, bb = C.drawing.data.views.front.bb;
    const at = (u, v) => [pl.px + (u - bb[0][0]) * pl.s, pl.py + (bb[1][1] - v) * pl.s];
    const um = (bb[0][0] + bb[1][0]) / 2;
    click('[data-cmd="drawing-crop"]'); await sleep(100);
    clickAt(...at(bb[0][0] - 0.5, bb[1][1] + 0.5)); await sleep(100);
    clickAt(...at(um, bb[0][1] - 0.5)); await sleep(300);
    const crops = C.doc.drawing.crops || [];
    expect(crops.length === 1 && crops[0].view === 'front' && Math.abs(crops[0].box[1][0] - um) < 1 / pl.s + 0.02, `Zuschnitt der Vorderansicht gespeichert (${JSON.stringify(crops)})`);
    await waitFor(() => D.querySelector('#drawing .sheet svg [data-crop]'), 5000, 'zugeschnittene Ansicht');
    const n1 = ((await dxfText()).match(/\r?\n(LINE|LWPOLYLINE|POLYLINE|ARC|CIRCLE|SPLINE)\r?\n/g) || []).length;
    expect(n1 < n0, `DXF: weniger Linien nach dem Zuschneiden (${n0} → ${n1})`);
    click('[data-cmd="drawing-crop"]'); await sleep(100);
    clickAt(...at(um - 1, bb[0][1])); await sleep(100); clickAt(...at(um - 1, bb[0][1])); await sleep(300);
    expect(!(C.doc.drawing.crops || []).length && !D.querySelector('#drawing .sheet svg [data-crop]'), 'zweimal dieselbe Stelle: Zuschnitt aufgehoben');
    await closeDrawing();
  }],
  ['Zeichnung: eigene Schriftfeld-Vorlage (SVG mit Platzhaltern)', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) { delete C.doc.drawing.tb; delete C.doc.drawing.tbCustom; delete C.doc.drawing.tbTemplate; }
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    C.doc.drawing.tbExtra = [{ label: 'Kunde', value: 'Muster GmbH' }];
    // Schriftfeld anklicken → Dialog → Vorlage laden
    const r = D.querySelector('#drawing .tb > rect').getBoundingClientRect();
    D.elementFromPoint(r.x + r.width * 0.3, r.y + r.height * 0.15).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: r.x + r.width * 0.3, clientY: r.y + r.height * 0.15 }));
    await sleep(150);
    expect(/\{Benennung\}/.test(q('#drawing .dimedit').textContent), 'Dialog nennt die Platzhalter');
    click('#drawing .dimedit [data-te="tbload"]'); await sleep(100);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="30mm" viewBox="0 0 120 30" onload="alert(1)">'
      + '<script>alert(2)</script><rect x="0" y="0" width="120" height="30" fill="none" stroke="#000"/><line x1="0" y1="15" x2="120" y2="15" stroke="#000"/>'
      + '<text x="2" y="10" font-size="5">{Benennung}</text><text x="2" y="25" font-size="4">Nr. {Zeichnungsnummer} · {Kunde}</text><text x="80" y="25" font-size="3">{Unbekannt}</text></svg>';
    const inp = q('#tbfile'), dt = new W.DataTransfer(); dt.items.add(new W.File([svg], 'firma.svg', { type: 'image/svg+xml' })); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.doc.drawing.tbCustom && D.querySelector('#drawing .tbc'), 5000, 'Vorlage geladen');
    const tc = C.doc.drawing.tbCustom;
    expect(tc.w === 120 && tc.h === 30 && C.doc.drawing.tbTemplate === 'custom', `Vorlage 120 × 30 mm, ausgewählt (${tc.w} × ${tc.h}, ${C.doc.drawing.tbTemplate})`);
    expect(!/script|onload|alert/.test(tc.inner), 'Skript und Ereignis-Attribut entfernt');
    const texts = [...D.querySelectorAll('#drawing .tbc text')].map(t => t.textContent);
    expect(texts.includes('Winkel mit Rippe'), `Benennung eingesetzt (${texts.join(' | ')})`);
    expect(texts.some(t => /^Nr\. .* · Muster GmbH$/.test(t)), 'Zeichnungsnummer und freies Feld eingesetzt');
    expect(texts.includes('{Unbekannt}'), 'unbekannter Platzhalter bleibt sichtbar stehen');
    const bb = D.querySelector('#drawing .tbc rect').getBBox(), fr = D.querySelector('#drawing .sheet svg rect.frame');
    const fx = +fr.getAttribute('x') + +fr.getAttribute('width'), fy = +fr.getAttribute('y') + +fr.getAttribute('height');
    const m = D.querySelector('#drawing .tbc').getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
    expect(Math.abs(m[0] + bb.width - fx) < 1e-6 && Math.abs(m[1] + bb.height - fy) < 1e-6, 'Vorlage sitzt unten rechts im Rahmen');
    // DXF-Export enthält die eingesetzten Texte
    const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
    let got = null;
    proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
    try { click('[data-cmd="drawing-dxf"]'); await waitFor(() => got, 5000, 'DXF'); } finally { proto.click = orig; }
    const dxf = await (await W.fetch(got.href)).text();
    expect(/Winkel mit Rippe/.test(dxf) && /Muster GmbH/.test(dxf), 'DXF enthält die Texte der Vorlage');
    // bleibt beim Speichern und Laden erhalten
    const V = (await import('../src/doc.js')).validateDoc(JSON.parse(JSON.stringify(C.doc)));
    expect(V.drawing.tbTemplate === 'custom' && V.drawing.tbCustom && V.drawing.tbCustom.inner === tc.inner, 'Vorlage im gespeicherten Dokument');
  }],
  ['Zeichnung: Schriftfeld bearbeiten', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) delete C.doc.drawing.tb;
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const tbText = () => [...D.querySelectorAll('#drawing .tb text')].map(t => t.textContent);
    expect(tbText().includes('ISO 2768-m') && tbText().includes('Winkel mit Rippe'), 'automatische Werte');
    const r = D.querySelector('#drawing .tb > rect').getBoundingClientRect();
    D.elementFromPoint(r.x + r.width * 0.3, r.y + r.height * 0.15).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: r.x + r.width * 0.3, clientY: r.y + r.height * 0.15 }));
    await sleep(150);
    const set = (k, v) => { const i = D.querySelector(`#drawing .dimedit [data-tb="${k}"]`); i.value = v; };
    expect(D.querySelector('#drawing .dimedit [data-tb="number"]'), 'Dialog Schriftfeld offen');
    const template = D.querySelector('#drawing .dimedit [data-tb-template]');
    expect(!!template && template.value === 'iso', 'ISO-7200-Vorlage ist Standard');
    template.value = 'simple';
    set('number', 'ZN-4711'); set('author', 'Muster'); set('tol', 'ISO 2768-f'); set('rev', 'A');
    click('#drawing .dimedit [data-te="ok"]'); await sleep(200);
    expect(C.doc.drawing.tb.number === 'ZN-4711' && !C.doc.drawing.tb.name, 'nur gefüllte Felder gespeichert');
    expect(C.doc.drawing.tbTemplate === 'simple', 'kompakte Fertigungsvorlage gespeichert');
    const t = tbText();
    expect(['ZN-4711', 'A', 'Winkel mit Rippe', 'Zeichnungsnummer', 'Gezeichnet · Toleranz', 'Muster · ISO 2768-f'].every(x => t.includes(x)) && !t.includes('ISO 2768-m'), `kompaktes Schriftfeld zeigt die Einträge (${t.join(' | ')})`);
    const { validateDoc } = await import('../src/doc.js');
    const vd = validateDoc(JSON.parse(JSON.stringify(C.doc)));
    expect(vd.drawing.tb && vd.drawing.tb.rev === 'A' && vd.drawing.tb.number === 'ZN-4711', 'übersteht die Prüfung des Dokuments');
    expect(vd.drawing.tbTemplate === 'simple', 'Vorlage übersteht die Prüfung des Dokuments');
    // freie Felder: vier Einträge → zwei Zeilen à 8 mm über dem Schriftfeld (Höhe 32 + 16 mm)
    const y0 = +D.querySelector('#drawing .tb > rect').getAttribute('y');
    const r2 = D.querySelector('#drawing .tb > rect').getBoundingClientRect();
    D.elementFromPoint(r2.x + r2.width * 0.3, r2.y + r2.height * 0.15).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: r2.x + r2.width * 0.3, clientY: r2.y + r2.height * 0.15 }));
    await sleep(150);
    expect(D.querySelectorAll('#drawing .dimedit [data-tbx-l]').length === 3, 'drei leere Zeilen für freie Felder');
    const fx = [['Kunde', 'Müller GmbH'], ['Projekt', 'P-24'], ['Oberfläche', 'verzinkt']];
    fx.forEach(([l, v], i) => { D.querySelector(`#drawing .dimedit [data-tbx-l="${i}"]`).value = l; D.querySelector(`#drawing .dimedit [data-tbx-v="${i}"]`).value = v; });
    click('#drawing .dimedit [data-te="ok"]'); await sleep(200);
    expect(C.doc.drawing.tbExtra && C.doc.drawing.tbExtra.length === 3 && C.doc.drawing.tbExtra[0].value === 'Müller GmbH', 'drei freie Felder gespeichert');
    // viertes Feld: Editor bietet dann sechs Zeilen
    const r3 = D.querySelector('#drawing .tb > rect').getBoundingClientRect();
    D.elementFromPoint(r3.x + r3.width * 0.3, r3.y + r3.height * 0.15).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: r3.x + r3.width * 0.3, clientY: r3.y + r3.height * 0.15 }));
    await sleep(150);
    expect(D.querySelectorAll('#drawing .dimedit [data-tbx-l]').length === 6, 'mit drei Einträgen: sechs Zeilen im Editor');
    D.querySelector('#drawing .dimedit [data-tbx-l="3"]').value = 'Kanten'; D.querySelector('#drawing .dimedit [data-tbx-v="3"]').value = 'gebrochen 0,5';
    click('#drawing .dimedit [data-te="ok"]'); await sleep(200);
    const xr = D.querySelector('#drawing .tbx > rect'), base = D.querySelector('#drawing .tb > rect');
    const t2 = [...D.querySelectorAll('#drawing .tbx text')].map(t => t.textContent);
    expect(xr && +xr.getAttribute('height') === 16 && Math.abs(+base.getAttribute('y') - +xr.getAttribute('y') - 16) < 1e-6, `zwei Zeilen à 8 mm direkt über dem Schriftfeld (Höhe ${xr && xr.getAttribute('height')})`);
    near(+xr.getAttribute('y'), y0 - 16, 1e-6, 'Schriftfeld bleibt unten, freie Felder 16 mm darüber');
    expect(['Kunde', 'Müller GmbH', 'Oberfläche', 'verzinkt', 'Kanten', 'gebrochen 0,5'].every(x => t2.includes(x)), `Texte der freien Felder (${t2.join(' | ')})`);
    expect(validateDoc(JSON.parse(JSON.stringify(C.doc))).drawing.tbExtra.length === 4, 'freie Felder überstehen die Prüfung des Dokuments');
    delete C.doc.drawing.tb; delete C.doc.drawing.tbTemplate; delete C.doc.drawing.tbExtra;
    await closeDrawing();
  }],
  ['Skizze: einzelne Linien in Konstruktionslinien umwandeln', async () => {
    // Rechteck 40 × 20: ein geschlossenes Profil. Eine Seite wählen → Palette „Normal/Konstruktion“ macht sie zur
    // Konstruktionslinie (Profil offen, 0), noch einmal zurück (1). Rechtsklick-Menü bietet dasselbe für gewählte Kurven.
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(300);
    const E = C.editor;
    E.setTool('rect'); sketchClick(0, 0); E.onPointerMove(sketchEvt(20, 10)); await sleep(50);
    E.vin = { vals: ['40', '20'], idx: 0 }; E.commitTyped(); E.setTool(null); await sleep(200);
    expect(E.regionCount === 1, `ein Profil (${E.regionCount})`);
    const knopf = () => q('#dialog [data-cmd="cons-sel"]').closest('.skopt');
    expect(knopf().hidden, 'ohne Auswahl kein Knopf');
    const ln = E.f.curves.find(c => c.type === 'line');
    E.sel = new Set([ln.id]); E.emit(); await sleep(50);
    expect(!knopf().hidden, 'Linie gewählt: Knopf „Normal/Konstruktion“');
    click('#dialog [data-cmd="cons-sel"]'); await sleep(200);
    const L = () => E.f.curves.find(c => c.id === ln.id);
    expect(L().cons === true && E.f.curves.filter(c => c.cons).length === 1, 'nur die gewählte Linie ist Konstruktion');
    expect(E.regionCount === 0 && !E.consMode, `Profil offen (${E.regionCount}), Modus für neue Geometrie unverändert`);
    click('#dialog [data-cmd="cons-sel"]'); await sleep(200);
    expect(!L().cons && E.regionCount === 1, 'zurück auf Normal: Profil wieder geschlossen');
    // Rechtsklick ins Fenster: Eintrag oben in der Liste
    E.sel = new Set([ln.id]); E.emit(); await sleep(50);
    const cv = q('#cv'), r = cv.getBoundingClientRect(), at = { clientX: r.left + 30, clientY: r.top + 30, bubbles: true };
    // künstliche Zeigerereignisse haben keinen aktiven Zeiger: Einfangen für den Klick abschalten
    const fang = W.Element.prototype.setPointerCapture, los = W.Element.prototype.releasePointerCapture;
    W.Element.prototype.setPointerCapture = () => {}; W.Element.prototype.releasePointerCapture = () => {};
    try { cv.dispatchEvent(new W.PointerEvent('pointerdown', { ...at, button: 2 })); cv.dispatchEvent(new W.PointerEvent('pointerup', { ...at, button: 2 })); await sleep(100); }
    finally { W.Element.prototype.setPointerCapture = fang; W.Element.prototype.releasePointerCapture = los; }
    const eintrag = D.querySelector('#marking .mk-list [data-cmd="cons-sel"]');
    expect(!!eintrag && eintrag === D.querySelector('#marking .mk-list button'), 'Markierungsmenü: Normal/Konstruktion oben');
    eintrag.click(); await sleep(200);
    expect(L().cons === true, 'über das Menü umgewandelt');
    E.sel = new Set(); E.emit(); await sleep(50);
    expect(knopf().hidden, 'Auswahl leer: Knopf weg');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Animation: Storyboard mit eigenen Schritten', async () => {
    // Zwei Schritte nacheinander: 1) Gruppe A 50 mm nach oben in 1 s, 2) Gruppe B 30 mm in X in 2 s (Gesamt 3 s).
    // Sanft (anfahren/abbremsen, Hälfte der Zeit = Hälfte des Wegs): bei 0,5 s A z = 25; bei 2,0 s A z = 50, B x = 15.
    await openExample('Winkel mit Rippe verschraubt');
    const m = C.lastBuild.mesh, P = () => C.vp.model.geo.getAttribute('position').array, orig = P().slice();
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="explode"]'); await sleep(200);
    const sel = q('#dialog [data-ex="art"]'); sel.value = 'story'; sel.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(50);
    expect(/Storyboard Animation/.test(q('#dialog').textContent), 'Storyboard-Ansicht');
    click('#dialog [data-sbcmd="add"]'); await sleep(50); click('#dialog [data-sbcmd="add"]'); await sleep(50);
    const S = C.doc.storyboard;
    expect(S.length === 2 && S[0].g && S[1].g && S[0].g !== S[1].g, `zwei Schritte, verschiedene Gruppen (${S.map(x => x.g).join(', ')})`);
    const setF = (i, k, v) => { const e = q(`#dialog [data-sb="${i}"][data-sf="${k}"]`); e.value = String(v); e.dispatchEvent(new W.Event('input', { bubbles: true })); e.dispatchEvent(new W.Event('change', { bubbles: true })); };
    setF(1, 0, 30); setF(1, 2, 0); setF(1, 't', 2);
    expect(/\/ 3 s/.test(q('#dialog .exzeit').textContent), `Gesamtdauer 3 s (${q('#dialog .exzeit').textContent})`);
    const zeit = async t => { const z = q('#dialog [data-ex="zeit"]'); z.value = String(t * 10); z.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(50); };
    const grp = id => C.doc.components && C.doc.components.find(c => c.bodies.includes(id)) ? C.doc.components.find(c => c.bodies.includes(id)).id : (id.includes('/') ? id.split('/')[0] : id);
    const kA = m.bodies.find(b => grp(b.id) === S[0].g), kB = m.bodies.find(b => grp(b.id) === S[1].g);
    const weg = b => { const i = b.verts[0] * 3, A = P(); return [A[i] - orig[i], A[i + 1] - orig[i + 1], A[i + 2] - orig[i + 2]]; };
    await zeit(0.5);
    near(weg(kA)[2], 25, 1e-4, '0,5 s: A halb oben'); near(Math.hypot(...weg(kB)), 0, 1e-4, '0,5 s: B steht');
    await zeit(2);
    near(weg(kA)[2], 50, 1e-4, '2 s: A oben'); near(weg(kB)[0], 15, 1e-4, '2 s: B halb in X');
    const { storyOffsets, storyDauer } = await import('../src/explode-ui.js');
    near(storyDauer(S), 3, 1e-9, 'storyDauer 3 s');
    near(storyOffsets([{ id: 'a' }], id => null, [{ g: 'a', d: [0, 0, 10], t: 1 }, { g: 'a', d: [4, 0, 0], t: 1 }], 2).a[0], 4, 1e-9, 'Schritte derselben Gruppe addieren sich');
    click('#dialog [data-sbcmd="del"][data-i="0"]'); await sleep(50);
    expect(C.doc.storyboard.length === 1 && C.doc.storyboard[0].d[0] === 30, 'Schritt 1 entfernt');
    click('[data-cmd="explode-close"]'); await sleep(200);
    expect(D.body.dataset.mode === 'model', 'zurück');
  }],
  ['Animation: Storyboard mit Drehung und Kamerafahrt', async () => {
    // Schritt 1: Gruppe A um 90° um Z durch ihre Mitte c, 1 s – am Ende wird (x, y) relativ zu c zu (−y, x).
    // Schritt 2: Ansicht (Kamerafahrt) 2 s zur gespeicherten Ansicht V; bei 2,0 s (Hälfte) liegt die Kamera genau in der
    // Mitte zwischen Ausgangsansicht S und V (sanfte Kurve bei ½ = ½), am Ende auf V.
    await openExample('Winkel mit Rippe verschraubt');
    const m = C.lastBuild.mesh, P = () => C.vp.model.geo.getAttribute('position').array, orig = P().slice();
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="explode"]'); await sleep(200);
    const sel = q('#dialog [data-ex="art"]'); sel.value = 'story'; sel.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(50);
    const vp = C.vp, S0 = { pos: vp.camera.position.toArray(), target: vp.controls.target.toArray() };
    click('#dialog [data-sbcmd="add"]'); await sleep(50);
    const setF = (i, k, v) => { const e = q(`#dialog [data-sb="${i}"][data-sf="${k}"]`); e.value = String(v); e.dispatchEvent(new W.Event('input', { bubbles: true })); e.dispatchEvent(new W.Event('change', { bubbles: true })); };
    setF(0, 2, 0); setF(0, 'w', 90); setF(0, 'achse', 'z');
    // Ansicht V: Kamera 200 mm zur Seite versetzt, dann „+ Ansicht“
    const V = { pos: S0.pos.map((v, i) => v + (i === 0 ? 200 : 0)), target: S0.target.map((v, i) => v + (i === 0 ? 200 : 0)) };
    vp.camera.position.fromArray(V.pos); vp.controls.target.fromArray(V.target); vp.controls.update();
    click('#dialog [data-sbcmd="addcam"]'); await sleep(50);
    setF(1, 't', 2);
    const S = C.doc.storyboard;
    expect(S.length === 2 && S[0].w === 90 && S[0].achse === 'z' && S[1].art === 'ansicht' && S[1].cam, 'Drehschritt und Ansicht-Schritt im Dokument');
    // Kamera zurück auf die Ausgangsansicht des Storyboards
    vp.camera.position.fromArray(S0.pos); vp.controls.target.fromArray(S0.target); vp.controls.update();
    const zeit = async t => { const z = q('#dialog [data-ex="zeit"]'); z.value = String(t * 10); z.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(50); };
    await zeit(1);
    const gA = id => { const c = (C.doc.components || []).find(x => x.bodies.includes(id)); return c ? c.id : id.includes('/') ? id.split('/')[0] : id; };
    const A = m.bodies.filter(b => gA(b.id) === S[0].g), bb = [[0, 1, 2].map(k => Math.min(...A.map(b => b.bbox[0][k]))), [0, 1, 2].map(k => Math.max(...A.map(b => b.bbox[1][k])))];
    const c = [0, 1, 2].map(k => (bb[0][k] + bb[1][k]) / 2), i0 = A[0].verts[0] * 3, p = [orig[i0], orig[i0 + 1], orig[i0 + 2]], jetzt = [P()[i0], P()[i0 + 1], P()[i0 + 2]];
    const soll = [c[0] - (p[1] - c[1]), c[1] + (p[0] - c[0]), p[2]];
    expect(jetzt.every((v, k) => Math.abs(v - soll[k]) < 1e-3), `90° um Z: (${jetzt.map(v => v.toFixed(3))}) = (${soll.map(v => v.toFixed(3))})`);
    near(vp.camera.position.distanceTo(new vp.camera.position.constructor(...S0.pos)), 0, 1e-6, 'Kamera vor der Fahrt in der Ausgangsansicht');
    await zeit(2);
    const mitte = S0.pos.map((v, i) => (v + V.pos[i]) / 2);
    near(vp.camera.position.distanceTo(new vp.camera.position.constructor(...mitte)), 0, 1e-6, 'Hälfte der Fahrt: Kamera in der Mitte');
    await zeit(3);
    near(vp.camera.position.distanceTo(new vp.camera.position.constructor(...V.pos)), 0, 1e-6, 'Ende: Kamera auf der Ansicht V');
    click('[data-cmd="explode-close"]'); await sleep(200);
  }],
  ['Explosionsansicht: Körper auseinander, Abspielen, zurück', async () => {
    await openExample('Winkel mit Rippe verschraubt');
    const m = C.lastBuild.mesh, geo = C.vp.model.geo, P = geo.getAttribute('position').array, orig = P.slice();
    expect(m.bodies.length >= 2 && m.bodies.every(b => b.verts && b.evs), `${m.bodies.length} Körper mit Eckpunktbereichen`);
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="explode"]'); await sleep(200);
    expect(D.querySelector('#dialog [data-ex="k"]'), 'Dialog Explosionsansicht');
    const setK = async v => { const s = D.querySelector('#dialog [data-ex="k"]'); s.value = v; s.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(50); };
    await setK(100);
    // radial, k = 1: jede Gruppe (Komponente oder Körper) rückt um den Abstand ihrer Mitte zur Gesamtmitte weiter
    const { explodeOffsets } = await import('../src/explode-ui.js');
    const want = explodeOffsets(m.bodies, id => null, 1, 'radial');
    const moved = m.bodies.filter(b => { const i = b.verts[0] * 3; return Math.hypot(P[i] - orig[i], P[i + 1] - orig[i + 1], P[i + 2] - orig[i + 2]) > 1; });
    expect(moved.length >= 2, `${moved.length} Körper bewegt`);
    const b0 = moved[0], i0 = b0.verts[0] * 3, d0 = [P[i0] - orig[i0], P[i0 + 1] - orig[i0 + 1], P[i0 + 2] - orig[i0 + 2]];
    const allBb = [[0, 1, 2].map(k => Math.min(...m.bodies.map(b => b.bbox[0][k]))), [0, 1, 2].map(k => Math.max(...m.bodies.map(b => b.bbox[1][k])))];
    const ctr = bb => [0, 1, 2].map(k => (bb[0][k] + bb[1][k]) / 2);
    if (!(C.doc.components || []).length) near(Math.hypot(...d0), Math.hypot(...ctr(b0.bbox).map((v, k) => v - ctr(allBb)[k])), 1e-3, 'Verschiebung = Abstand Körpermitte–Gesamtmitte');
    expect(Object.keys(want).length === m.bodies.length, 'Verschiebung für jeden Körper');
    // Achse Z: Ränge nach Lage, jeder Schritt = größte Ausdehnung in Z
    const sel = D.querySelector('#dialog [data-ex="dir"]'); sel.value = 'z'; sel.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(50);
    const dz = m.bodies.map(b => { const i = b.verts[0] * 3; return [P[i] - orig[i], P[i + 1] - orig[i + 1], P[i + 2] - orig[i + 2]]; });
    expect(dz.every(d => Math.abs(d[0]) < 1e-4 && Math.abs(d[1]) < 1e-4) && dz.some(d => Math.abs(d[2]) > 1), 'entlang Z: nur Z-Verschiebung');
    // Abspielen endet beim eingestellten Wert
    click('[data-cmd="explode-play"]');
    // Abspielen läuft über Zeitgeber: unter Last (Prüfstände parallel) etwas länger warten
    await waitFor(() => D.querySelector('#dialog [data-ex="k"]').value === '100', 6000, 'Abspielen').catch(() => {});
    expect(D.querySelector('#dialog [data-ex="k"]').value === '100', 'Abspielen endet bei 100 %');
    // Kanten folgen den Flächen
    const E = C.vp.model.edges.geometry.getAttribute('position').array, eb = C.vp.model.ebase;
    const bz = m.bodies.find((b, j) => Math.abs(dz[j][2]) > 1), ie = bz.evs[0] * 3;
    near(E[ie + 2] - eb[ie + 2], P[bz.verts[0] * 3 + 2] - orig[bz.verts[0] * 3 + 2], 1e-4, 'Kanten mitverschoben');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150);
    const back = C.vp.model.geo.getAttribute('position').array;
    expect(back.every((v, i) => v === orig[i]), 'nach Esc wieder zusammengebaut');
    expect(D.querySelector('#dialog').hidden, 'Dialog geschlossen');
  }],
  ['Zeichnung: Revisionstabelle', async () => {
    await openExample('Winkel mit Rippe');
    if (C.doc.drawing) { delete C.doc.drawing.revs; delete C.doc.drawing.tb; }
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    click('[data-cmd="drawing-revtab"]'); await sleep(150);
    const box = () => D.querySelector('#drawing .dimedit');
    expect(box().querySelector('[data-rv="rev"]').value === 'A', 'erster Vorschlag A');
    box().querySelector('[data-rv="desc"]').value = 'Bohrung ⌀9 statt ⌀8';
    click('#drawing .dimedit [data-re="add"]'); await sleep(200);
    expect(box().querySelector('[data-rv="rev"]').value === 'B', 'danach Vorschlag B');
    box().querySelector('[data-rv="desc"]').value = 'Rippe 6 mm';
    click('#drawing .dimedit [data-re="add"]'); await sleep(200);
    click('#drawing .dimedit [data-re="x"]'); await sleep(100);
    const rt = [...D.querySelectorAll('#drawing .rtab text')].map(t => t.textContent);
    expect(['Änd.', 'A', 'Bohrung ⌀9 statt ⌀8', 'B', 'Rippe 6 mm'].every(x => rt.includes(x)), `Tabelle zeigt beide Änderungen (${rt.join(' | ')})`);
    const tb = [...D.querySelectorAll('#drawing .tb text')].map(t => t.textContent);
    expect(tb.includes('Änderung') && tb[tb.indexOf('Änderung') + 1] === 'B', 'Schriftfeld zeigt die neueste Änderung B');
    // Tabelle oben rechts im Rahmen, Ansichten darunter
    const r = D.querySelector('#drawing .rtab rect'), y1 = +r.getAttribute('y') + +r.getAttribute('height');
    const top = Math.min(...Object.values(C.drawing.last.rects).map(q => q[1]));
    expect(top > y1, `Ansichten unterhalb der Tabelle (${top.toFixed(1)} > ${y1.toFixed(1)})`);
    const { validateDoc } = await import('../src/doc.js');
    expect(validateDoc(JSON.parse(JSON.stringify(C.doc))).drawing.revs.length === 2, 'übersteht die Prüfung des Dokuments');
    // Klick auf die Tabelle öffnet den Editor, Zeile löschen
    const rr = r.getBoundingClientRect();
    D.elementFromPoint(rr.x + 3, rr.y + rr.height - 2).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: rr.x + 3, clientY: rr.y + rr.height - 2 }));
    await sleep(150);
    click('#drawing .dimedit [data-re="del"][data-i="1"]'); await sleep(200);
    expect(C.doc.drawing.revs.length === 1 && C.doc.drawing.revs[0].rev === 'A', 'Zeile B gelöscht');
    click('#drawing .dimedit [data-re="x"]');
    delete C.doc.drawing.revs;
    await closeDrawing();
  }],
  ['Drehen um die Mitte der Körper (nicht um den eigenen Blickpunkt)', async () => {
    await openExample('Winkel mit Rippe');
    const vp = C.vp, cam = () => vp.camera;
    vp.view('iso'); await sleep(600);
    // Ansicht verschieben wie beim Zoomen zur Maus / Mitte ziehen: Zielpunkt liegt dann neben dem Teil
    const shift = new (vp.camera.position.constructor)(35, -20, 10);
    cam().position.add(shift); vp.controls.target.add(shift); vp.controls.update(); await sleep(100);
    const piv = vp.orbitPivot(), b = vp.bounds(), c = b.getCenter(piv.clone());
    expect(piv.distanceTo(c) < 1e-9, 'Drehpunkt = Mitte der Körper');
    const ndc = () => { cam().updateMatrixWorld(); return piv.clone().project(cam()); };
    const n0 = ndc(), d0 = cam().position.distanceTo(piv), p0 = cam().position.clone();
    vp.orbitBy(140, 60);
    const n1 = ndc();
    expect(cam().position.distanceTo(p0) > 1, 'Kamera hat sich bewegt');
    near(Math.hypot(n1.x - n0.x, n1.y - n0.y), 0, 1e-6, 'Körpermitte bleibt beim Drehen an derselben Bildstelle');
    near(cam().position.distanceTo(piv), d0, 1e-6, 'Abstand zur Körpermitte bleibt gleich');
    // nicht über den Pol kippen: weit nach unten ziehen, die Kamera bleibt über bzw. unter dem Teil, Z bleibt oben
    vp.orbitBy(0, 5000);
    const off = cam().position.clone().sub(vp.controls.target).normalize();
    expect(Math.abs(off.z) <= Math.cos(0.01) + 1e-9 && cam().up.z === 1, `Höhe begrenzt (z ${off.z.toFixed(5)})`);
    // mit der Maus: Umschalt + Mitte dreht, grüner Drehpunkt nur während des Ziehens
    const cv = q('#cv'), r = cv.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
    try {
      const pe = (t, ex) => cv.dispatchEvent(new W.PointerEvent(t, { bubbles: true, cancelable: true, button: 1, buttons: t === 'pointerup' ? 0 : 4, shiftKey: true, clientX: ex, clientY: y, pointerId: 1 }));
      const p1 = cam().position.clone();
      pe('pointerdown', x);
      expect(vp.pivotMark.visible, 'grüner Drehpunkt sichtbar');
      pe('pointermove', x + 80);
      expect(cam().position.distanceTo(p1) > 1, 'Umschalt + Mitte dreht');
      pe('pointerup', x + 80);
      expect(!vp.pivotMark.visible, 'Drehpunkt nach dem Loslassen weg');
    } finally { delete cv.setPointerCapture; delete cv.releasePointerCapture; }
    vp.view('iso'); await sleep(500);
  }],
  ['Drehpunkt beim Drehen und Zoomen: der Punkt am Modell unter dem Zeiger', async () => {
    await newDoc(); await box(400, 20, 20);
    const vp = C.vp, cam = () => vp.camera, V = vp.camera.position.constructor;
    vp.view('iso'); await sleep(600);
    const b = vp.bounds(), center = b.getCenter(new V(0, 0, 0));
    // Bildstelle eines Welt Punkts: Kamera vorher aktualisieren, sonst rechnet toScreen mit alter Matrix
    const scr = p => { cam().updateMatrixWorld(); return vp.toScreen(p); };
    const at = p => { const s = scr(p), r = vp.canvas.getBoundingClientRect(); return { clientX: r.left + s[0], clientY: r.top + s[1] }; };
    // Zeiger auf der oberen Fläche nahe einem Ende des langen Stabs
    const onEnd = [b.max.x - 20, (b.min.y + b.max.y) / 2, b.max.z];
    const ev = at(onEnd);
    const cv = q('#cv');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
    const pe = (t, x, y) => cv.dispatchEvent(new W.PointerEvent(t, {
      bubbles: true, cancelable: true, button: 1, buttons: t === 'pointerup' ? 0 : 4, shiftKey: true, clientX: x, clientY: y, pointerId: 11,
    }));
    try {
      // Zoomen: die Verankerung sitzt auf der Oberfläche unter dem Zeiger, nicht auf der Zielentiefe
      const hit = vp.hitAtPointer(ev);
      expect(hit, 'Zeiger steht auf einer Fläche');
      const fwd = cam().getWorldDirection(new V(0, 0, 0));
      const depth = hit.clone().sub(cam().position).dot(fwd);
      vp.zoomAnchorAtPointer(ev);
      near(cam().position.distanceTo(vp.controls.target), depth, 1e-6, 'Zieltiefe auf der Oberfläche unter dem Zeiger');
      const z0 = cam().position.distanceTo(hit), s0 = scr(hit.toArray());
      cv.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -500, clientX: ev.clientX, clientY: ev.clientY }));
      await sleep(150);
      const z1 = cam().position.distanceTo(hit), s1 = scr(hit.toArray());
      expect(z1 < z0 * 0.85, `Zoomen geht zum Punkt unter dem Zeiger (${z0.toFixed(0)} → ${z1.toFixed(0)})`);
      near(Math.hypot(s1[0] - s0[0], s1[1] - s0[1]), 0, 3, 'Bildstelle unter dem Zeiger bleibt beim Zoomen gleich');
      vp.view('iso'); await sleep(600);
      // Bildstelle neu bestimmen: nach dem Zoomen steht das Modell anders im Bild, und die alte
      // Bildstelle trifft dann einen Punkt 30 mm neben onEnd – die Prüfung wäre kameraabhängig.
      const ev2 = at(onEnd);
      pe('pointerdown', ev2.clientX, ev2.clientY);
      expect(vp.pivotMark.visible, 'Drehpunkt sichtbar');
      const piv = vp.pivotMark.position;
      near(piv.distanceTo(new V(onEnd[0], onEnd[1], onEnd[2])), 0, 20, 'Drehpunkt am Zeiger auf der Fläche');
      expect(piv.x > b.max.x - 40, `Drehpunkt am Stabende (${piv.x.toFixed(0)} von ${b.max.x.toFixed(0)})`);
      expect(piv.distanceTo(center) > 100, `Drehpunkt nicht die Körpermitte (${piv.distanceTo(center).toFixed(0)})`);
      // der Drehpunkt ist der Angelpunkt: er bleibt an seiner Stelle im Bild
      const q0 = scr(piv.toArray());
      pe('pointermove', ev2.clientX + 90, ev2.clientY + 40);
      const q1 = scr(piv.toArray());
      near(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), 0, 2, 'Drehpunkt bleibt an derselben Bildstelle');
      pe('pointerup', ev2.clientX + 90, ev2.clientY + 40);
      expect(!vp.pivotMark.visible, 'Drehpunkt nach dem Loslassen weg');
      // Zeiger neben dem Modell: der kürzeste Weg führt zum nächsten Punkt an der Modelkante
      const off = at([b.max.x + 150, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2]);
      expect(!vp.hitAtPointer(off), 'Zeiger trifft kein Modell');
      const p2 = vp.pivotNearPointer(off);
      const dEdge = vp.ray.ray.distanceToPoint(p2), dMid = vp.ray.ray.distanceToPoint(center);
      expect(b.containsPoint(p2), 'Drehpunkt liegt am Modell');
      expect(dEdge < dMid * 0.5, `zum nächsten Punkt am Modell (${dEdge.toFixed(1)} statt ${dMid.toFixed(1)} zur Körpermitte)`);
    } finally { delete cv.setPointerCapture; delete cv.releasePointerCapture; }
    vp.view('iso'); await sleep(500);
  }],
  ['Nah herangezoomt: Fläche und Kante per Klick wählbar (perspektivisch und orthografisch)', async () => {
    await newDoc(); await box(60, 40, 20);
    const vp = C.vp, cv = q('#cv'), mesh = C.lastBuild.mesh;
    // oberste ebene Fläche und eine ihrer Kanten
    const top = mesh.faces.reduce((bi, f, i) => (f.type === 'PLANE' && f.center[2] > mesh.faces[bi].center[2] ? i : bi), 0);
    const zTop = mesh.faces[top].center[2];
    const edge = mesh.edges.findIndex(e => Math.abs(e.mid[2] - zTop) < 1e-6);
    const at = p => { vp.camera.updateMatrixWorld(); const s = vp.toScreen(p), r = cv.getBoundingClientRect(); return { clientX: r.left + s[0], clientY: r.top + s[1] }; };
    const pe = (t, ev) => cv.dispatchEvent(new W.PointerEvent(t, { bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: ev.clientX, clientY: ev.clientY, pointerId: 21 }));
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
    try {
      for (const proj of ['persp', 'ortho']) {
        vp.setProjection(proj); vp.view('iso'); await sleep(700);
        // mit dem Mausrad auf die Mitte der Oberseite zoomen, bis der Zielabstand kleiner als die halbe Dicke ist:
        // orthografisch rückt die Kamera dabei in den Körper (Zielpunkt Körpermitte), die Oberseite liegt hinter ihr
        for (let i = 0; i < 40 && vp.camera.position.distanceTo(vp.controls.target) > 2; i++) {
          const ev = at(mesh.faces[top].center);
          cv.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300, clientX: ev.clientX, clientY: ev.clientY }));
          await sleep(30);
        }
        const dT = vp.camera.position.distanceTo(vp.controls.target);
        expect(dT < 5, `${proj}: nah herangezoomt (Zielabstand ${dT.toFixed(2)} mm)`);
        vp.setPickMode('any');
        const ev = at(mesh.faces[top].center);
        const h = vp.pickAt(ev);
        expect(h && h.kind === 'face' && h.index === top, `${proj}: Hervorhebung auf der Oberseite (${h ? h.kind + h.index : 'nichts'} statt face${top})`);
        pick(null);
        pe('pointerdown', ev); pe('pointerup', ev); await sleep(100);
        expect(vp.selection.faces.length === 1 && vp.selection.faces[0] === top, `${proj}: Klick wählt die Oberseite (${vp.selection.faces.join(',') || 'nichts'})`);
        pick(null);
        // Kante der Oberseite: Ansicht so verschieben, dass sie im Bild liegt, dann anklicken
        vp.view('iso'); await sleep(700);
        const em = mesh.edges[edge].mid;
        for (let i = 0; i < 40 && vp.camera.position.distanceTo(vp.controls.target) > 2; i++) {
          const ev2 = at(em);
          cv.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300, clientX: ev2.clientX, clientY: ev2.clientY }));
          await sleep(30);
        }
        const he = vp.pickAt(at(em));
        expect(he && he.kind === 'edge' && he.index === edge, `${proj}: Kante der Oberseite nah herangezoomt getroffen (${he ? he.kind + he.index : 'nichts'})`);
      }
    } finally {
      delete cv.setPointerCapture; delete cv.releasePointerCapture;
      vp.setProjection('persp'); vp.setPickMode('any'); pick(null);
    }
    vp.view('iso'); await sleep(500);
  }],
  ['Rechtsklick: nur das cantcodecad-Menü, kein Browser-Menü', async () => {
    await openExample('Winkel mit Rippe');
    const cv = q('#cv'), r = cv.getBoundingClientRect(), x = r.left + 40, y = r.top + 40;
    const pe = (t, b) => cv.dispatchEvent(new W.PointerEvent(t, { bubbles: true, button: b, buttons: t === 'pointerdown' ? 2 : 0, clientX: x, clientY: y, pointerId: 7 }));
    // künstliche Zeigerereignisse haben keinen echten Zeiger: Erfassen für diesen Test überspringen
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
    try { pe('pointerdown', 2); pe('pointerup', 2); } finally { delete cv.setPointerCapture; delete cv.releasePointerCapture; }
    await sleep(150);
    expect(D.getElementById('marking'), 'Markierungsmenü offen');
    // das contextmenu nach dem Loslassen trifft das Element unter dem Zeiger (jetzt das Menü)
    const under = D.elementFromPoint(x, y) || D.body;
    const ok = under.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    expect(!ok, `Browser-Menü unterdrückt (Ziel ${under.className || under.tagName})`);
    expect(!q('#browser').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true })), 'auch im Browser-Bereich kein Browser-Menü');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100);
    expect(!D.getElementById('marking'), 'Esc schließt das Markierungsmenü');
    expect(q('#docname').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true })), 'Textfeld behält Kopieren/Einfügen');
  }],
  ['Festigkeit (Bauteil): Kragarm aus Würfeln gegen die Biegetheorie', async () => {
    // Rechenkern: Kragarm 200 × 20 × 20, links fest, rechts 1000 N in −Z, Stahl. Balken: δ = F L³ / (3 E I) + F L / (κ G A)
    // = 0,952 + 0,007 mm; Spannung in der Mitte oben σ = F · 100 / W = 75 MPa. Zugstab 100 × 10 × 10, 1000 N: σ = 10 MPa, δ = F L / (E A).
    const { solveSolid, sampleNodes } = await import('../src/sim/solid.js');
    const box = (L, b, t) => {
      const v = (x, y, z) => [x * L, y * b, z * t], quad = (a, bb, c, d) => [...a, ...bb, ...c, ...a, ...c, ...d];
      const F = { x0: quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)), x1: quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)), y0: quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)), y1: quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)), z0: quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)), z1: quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)) };
      for (const k in F) F[k] = Float64Array.from(F[k]);
      return { F, all: Float64Array.from(Object.values(F).flatMap(a => [...a])), bbox: [[0, 0, 0], [L, b, t]] };
    };
    const E = 210000, Ib = 20 * 20 ** 3 / 12;
    let B = box(200, 20, 20);
    let r = solveSolid({ tris: B.all, bbox: B.bbox, h: 5, E, nu: 0.3, fixed: [B.F.x0], forces: [{ tris: B.F.x1, F: [0, 0, -1000] }] });
    const dTheo = 1000 * 200 ** 3 / (3 * E * Ib) + 1000 * 200 / (5 / 6 * E / 2.6 * 400);
    near(r.dmax, dTheo, dTheo * 0.02, `Kragarm, 4 Würfel über die Dicke: Durchbiegung (Theorie ${dTheo.toFixed(3)} mm)`);
    near(sampleNodes(r, r.vm, [100, 10, 20]), 75, 0.5, 'Spannung in der Mitte oben (75 MPa)');
    B = box(100, 10, 10);
    r = solveSolid({ tris: B.all, bbox: B.bbox, h: 2, E, nu: 0.3, fixed: [B.F.x0], forces: [{ tris: B.F.x1, F: [1000, 0, 0] }] });
    near(sampleNodes(r, r.vm, [50, 5, 5]), 10, 0.01, 'Zugstab: σ = F / A = 10 MPa');
    near(r.dmax, 1000 * 100 / (E * 100), 0.0002, 'Zugstab: δ = F L / (E A)');
    // In der App: Quader 200 × 20 × 20, Netz grob, Stirnfläche fest, Kraft auf die andere Stirnfläche
    await newDoc(); await box2();
    async function box2() { await cmd('solid:create', 'box'); num('w', 200); num('l', 20); num('h', 20); num('cx', 100); num('cy', 10); await ok(); }
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="solidsim"]'); await sleep(300);
    expect(D.body.dataset.mode === 'solidsim' && /Körper1/.test(q('#dialog').textContent), 'Festigkeit (Bauteil) offen, Körper gewählt');
    click('#dialog [data-cmd="ss-mesh"][data-v="coarse"]'); await sleep(100);
    const x0 = faces().find(f => f.info.n && f.info.n[0] < -0.99), x1 = faces().find(f => f.info.n && f.info.n[0] > 0.99);
    pick(x0); await sleep(100);
    click('#dialog [data-cmd="ss-tool"][data-v="force"]'); await sleep(100);
    click('#dialog [data-cmd="ss-dir"][data-v="z-"]'); await sleep(100);
    pick(x1); await sleep(100);
    const S = C.doc.solidStudy;
    expect(S.fixed.length === 1 && S.loads.length === 1 && Math.abs(S.loads[0].F[2] + 1000) < 1e-9, 'eine feste Fläche, 1000 N in −Z');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /Größte Vergleichsspannung/.test(q('#dialog').textContent) || /warn/.test(q('#dialog').innerHTML), 60000, 'Ergebnis');
    const t = q('#dialog').textContent, d = Number((/Größte Verschiebung\s*([\d,]+) mm/.exec(t) || [])[1]?.replace(',', '.'));
    near(d, dTheo, dTheo * 0.04, 'Durchbiegung in der App');
    await waitFor(() => C.vp.resultG, 5000, 'Ergebnisfläche').catch(() => {});
    expect(/Sicherheitsfaktor/.test(t) && C.vp.resultG, 'Sicherheitsfaktor und farbige Ergebnisfläche');
    click('#dialog [data-cmd="ss-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !C.vp.resultG && C.doc.solidStudy.loads.length === 1, 'Schließen räumt auf, Einrichtung bleibt');
  }],
  ['Festigkeit (Bauteil): Lastfälle, Umhüllende und Eigengewicht', async () => {
    // Rechenkern: zwei Lastfälle am selben Netz. Die Umhüllende ist je Knoten der größte Wert aller Fälle, maßgebend
    // ist der Fall mit der größten Spannung. Eigengewicht: q = ρ g A am Stahlträger 200 × 20 × 20 → δ = q L⁴ / (8 E I).
    const { solveSolid, solveSolidCases, sampleNodes } = await import('../src/sim/solid.js');
    const bar = (L, b, t) => {
      const v = (x, y, z) => [x * L, y * b, z * t], quad = (a, bb, c, d) => [...a, ...bb, ...c, ...a, ...c, ...d];
      const F = { x0: quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)), x1: quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)), y0: quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)), y1: quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)), z0: quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)), z1: quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)) };
      for (const k in F) F[k] = Float64Array.from(F[k]);
      return { F, all: Float64Array.from(Object.values(F).flatMap(a => [...a])), bbox: [[0, 0, 0], [L, b, t]] };
    };
    const E = 210000, Ib = 20 * 20 ** 3 / 12, B = bar(200, 20, 20);
    const grund = { tris: B.all, bbox: B.bbox, h: 5, E, nu: 0.3, fixed: [B.F.x0] };
    const kraft = F => [{ tris: B.F.x1, F }];
    const r1 = solveSolid({ ...grund, forces: kraft([0, 0, -1000]) });
    const r2 = solveSolid({ ...grund, forces: kraft([0, 0, -2000]) });
    let forts = 0;
    const u = solveSolidCases(grund, [
      { name: 'Lastfall A', forces: kraft([0, 0, -1000]) },
      { name: 'Lastfall B', forces: kraft([0, 0, -2000]) },
    ], p => { forts = Math.max(forts, p); });
    expect(u.umh === true && u.faelle.length === 2 && u.faelle[0].name === 'Lastfall A' && forts === 1, 'beide Lastfälle in einem Auftrag, Fortschritt bis 100 %');
    near(u.smax, r2.smax, 1e-9, 'σ max der Umhüllende = größte Spannung des stärkeren Falls');
    near(u.dmax, r2.dmax, 1e-9, 'δ max der Umhüllende = größte Verschiebung des stärkeren Falls');
    near(u.faelle[0].smax, r1.smax, 1e-9, 'Werte des einzelnen Lastfalls unverändert');
    let falsch = 0;
    for (let n = 0; n < u.nn; n++) if (Math.abs(u.vm[n] - Math.max(r1.vm[n], r2.vm[n])) > 1e-9) falsch++;
    expect(falsch === 0, `je Knoten der größte Wert beider Fälle (${falsch} Abweichungen)`);
    expect(u.groK === 1 && u.groS === 1 && u.groD === 1, 'maßgebender Lastfall ist der mit 2000 N');
    near(sampleNodes(u, u.vm, [100, 10, 20]), 150, 1, 'Spannung der Umhüllenden in der Mitte oben (150 MPa)');
    const rho = 7.85e-6, qL = rho * 9.81 * 400;
    const e = solveSolidCases(grund, [{ name: 'Eigengewicht', weight: rho }]).faelle[0];
    near(e.dmax, qL * 200 ** 4 / (8 * E * Ib), qL * 200 ** 4 / (8 * E * Ib) * 0.05, `Eigengewicht: Durchbiegung (Theorie ${(qL * 200 ** 4 / (8 * E * Ib)).toFixed(4)} mm)`);
    // In der App: zweiter Lastfall am Quader 200 × 20 × 20, Umhüllende, Maßgebender Lastfall
    await newDoc(); await box2();
    async function box2() { await cmd('solid:create', 'box'); num('w', 200); num('l', 20); num('h', 20); num('cx', 100); num('cy', 10); await ok(); }
    await waitFor(() => faces().length > 0, 20000, 'Quader gebaut');
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="solidsim"]');
    await waitFor(() => D.body.dataset.mode === 'solidsim' && /Körper1/.test(q('#dialog').textContent), 20000, 'Festigkeit (Bauteil) offen');
    click('#dialog [data-cmd="ss-mesh"][data-v="coarse"]'); await sleep(100);
    const x0 = faces().find(f => f.info.n && f.info.n[0] < -0.99), x1 = faces().find(f => f.info.n && f.info.n[0] > 0.99);
    click('#dialog [data-cmd="ss-tool"][data-v="fixed"]'); await sleep(100);   // Werkzeug steht nach anderen Abläufen noch auf Kraft
    pick(x0);
    await waitFor(() => C.doc.solidStudy.fixed.length === 1, 10000, 'feste Fläche');
    click('#dialog [data-cmd="ss-tool"][data-v="force"]'); await sleep(100);
    click('#dialog [data-cmd="ss-dir"][data-v="z-"]'); await sleep(100);
    const setF = v => { const e = q('#dialog input[data-ss="F"]'); e.value = String(v); e.dispatchEvent(new W.Event('input', { bubbles: true })); };
    setF(1000); await sleep(100);   // Kraftgröße steht nach anderen Abläufen noch auf einem anderen Wert
    pick(x1);
    await waitFor(() => C.doc.solidStudy.loads.length === 1, 10000, 'Kraft auf der Stirnfläche');
    let S = C.doc.solidStudy;
    expect(S.faelle.length === 1 && S.faelle[0].loads === S.loads && S.loads.length === 1, 'ein Lastfall, Lasten des aktiven Falls sind die des Bauteils');
    click('#dialog [data-cmd="ss-fall-neu"]');
    await waitFor(() => C.doc.solidStudy.faelle.length === 2, 10000, 'zweiter Lastfall');
    S = C.doc.solidStudy;
    expect(S.fall === 1 && S.loads.length === 0 && S.faelle[0].loads.length === 1 && S.selfWeight === false,
      'neuer Lastfall mit eigenen Lasten, der erste bleibt erhalten');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /hat keine Last/.test(q('#dialog').textContent), 10000, 'Meldung: Lastfall ohne Last');
    expect(/Lastfall 2 hat keine Last/.test(q('#dialog').textContent), 'ohne Last rechnet der Fall nicht');
    setF(2000); await sleep(100);
    pick(x1);
    await waitFor(() => C.doc.solidStudy.faelle[1].loads.length === 1, 10000, 'Kraft im zweiten Lastfall');
    expect(Math.abs(C.doc.solidStudy.loads[0].F[2] + 2000) < 1e-9, '2000 N im zweiten Lastfall');
    const umhKnopf = () => D.querySelector('#dialog [data-cmd="ss-umh"]');
    const umhAn = () => !!umhKnopf() && umhKnopf().getAttribute('aria-pressed') === 'true';
    if (!umhAn()) click('#dialog [data-cmd="ss-umh"]');
    await waitFor(umhAn, 10000, 'Umhüllende eingeschaltet');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /Größte Vergleichsspannung/.test(q('#dialog').textContent), 90000, 'Ergebnis der Umhüllenden');
    const t = q('#dialog').textContent;
    expect(/Umhüllende über 2 Lastfälle/.test(t) && /Maßgebender Lastfall/.test(t), 'Umhüllende über beide Fälle, maßgebender Fall wird genannt');
    const zeilen = [...D.querySelectorAll('#dialog table.cuttab tbody tr')].map(r => [...r.cells].map(c => c.textContent));
    expect(zeilen.length === 2 && zeilen[0][0] === 'Lastfall 1' && zeilen[1][0] === 'Lastfall 2', 'je Lastfall eine Zeile mit σ, SF und δ');
    const s1 = Number((zeilen[0][1] || '').replace(',', '.')), s2 = Number((zeilen[1][1] || '').replace(',', '.'));
    expect(s2 > s1 * 1.9 && s2 < s1 * 2.1, `doppelte Kraft, doppelte Spannung (${s1} → ${s2} MPa)`);
    const smax = Number((/Größte Vergleichsspannung\s*([\d,]+)/.exec(t) || [])[1].replace(',', '.'));
    near(smax, s2, 0.05, 'Größte Vergleichsspannung = größter Wert der Lastfälle');
    expect(/Maßgebender Lastfall\s*Lastfall 2/.test(t), 'maßgebend ist der Lastfall mit 2000 N');
    await waitFor(() => C.vp.resultG, 8000, 'Ergebnisfläche').catch(() => {});
    expect(C.vp.resultG, 'farbige Ergebnisfläche aus der Umhüllenden');
    click('#dialog [data-cmd="ss-fall-weg"]');
    await waitFor(() => C.doc.solidStudy.faelle.length === 1 && !D.querySelector('#dialog table.cuttab'), 10000, 'Lastfall gelöscht');
    expect(C.doc.solidStudy.faelle[0].loads.length === 1, 'der verbleibende Lastfall behält seine Last');
    click('#dialog [data-cmd="ss-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !C.vp.resultG && C.doc.solidStudy.faelle.length === 1, 'Schließen räumt auf, Lastfälle bleiben');
  }],
  ['Festigkeit (Bauteil): Modalfrequenzen', async () => {
    // Rechenkern: Kragarm 200 × 20 × 20 aus Stahl. Euler-Bernoulli: f = β²/L² · √(EI/ρA) / 2π mit
    // β1L = 1,8751 (erste Biegung), β2L = 4,6941 (zweite Biegung). Quadratischer Querschnitt: die beiden
    // ersten Formen sind entartet, deshalb kommt die zweite Biegung erst an dritter Stelle.
    const { solidModes } = await import('../src/sim/solid.js');
    const v = (x, y, z) => [x * 200, y * 20, z * 20], quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    const F = { x0: quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)), x1: quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)), y0: quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)), y1: quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)), z0: quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)), z1: quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)) };
    for (const k in F) F[k] = Float64Array.from(F[k]);
    const grund = { tris: Float64Array.from(Object.values(F).flatMap(a => [...a])), bbox: [[0, 0, 0], [200, 20, 20]], h: 5, E: 210000, nu: 0.3, fixed: [F.x0], rho: 7.85e-6 };
    let forts = 0;
    const r = solidModes(grund, 4, p => { forts = Math.max(forts, p); });
    // Der Rechner arbeitet in N und mm – in der Massengleichung ist die Masseinheit die Tonne
    // (1 N = 1 t·mm/s²), deshalb steht hier die Dichte in t/mm³.
    const fTheo = b2 => b2 / 200 ** 2 * Math.sqrt(210000 * 20 * 20 ** 3 / 12 / (7.85e-9 * 400)) / (2 * Math.PI);
    expect(r.modes.length === 4 && forts === 1, 'vier Eigenformen, Fortschritt bis 100 %');
    expect(r.modes.every((m, i) => i === 0 || m.f >= r.modes[i - 1].f - 1e-9), 'Frequenzen aufsteigend');
    near(r.modes[0].f, fTheo(1.875104 ** 2), 0.005 * fTheo(1.875104 ** 2), `erste Eigenfrequenz (Theorie ${fTheo(1.875104 ** 2).toFixed(2)} Hz)`);
    near(r.modes[1].f / r.modes[0].f, 1, 0.01, 'quadratischer Querschnitt: zweite Form entartet');
    const sprung = r.modes.find(m => m.f / r.modes[0].f > 2);
    near(sprung.f / r.modes[0].f, (4.694094 / 1.875104) ** 2, 0.08 * 6.255, `zweite Biegung (EB-Theorie ${(4.694094 / 1.875104) ** 2}×, 3-D-Elastizität etwas darunter)`);
    expect(r.modes.every(m => { let d = 0; for (let n = 0; n * 3 < m.u.length; n++) d = Math.max(d, Math.hypot(m.u[3 * n], m.u[3 * n + 1], m.u[3 * n + 2])); return Math.abs(d - 1) < 1e-12; }), 'Eigenformen auf größte Auslenkung 1 normiert');
    near(r.modes[0].omega / (2 * Math.PI), r.modes[0].f, 1e-9, 'ω und f passen zueinander');
    // In der App: Frequenztabelle, Eigenform auswählen, verformtes Bild
    await newDoc();
    await cmd('solid:create', 'box'); num('w', 200); num('l', 20); num('h', 20); num('cx', 100); num('cy', 10); await ok();
    await waitFor(() => faces().length > 0, 20000, 'Quader gebaut');
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="solidsim"]');
    await waitFor(() => D.body.dataset.mode === 'solidsim' && /Körper1/.test(q('#dialog').textContent), 20000, 'Festigkeit (Bauteil) offen');
    click('#dialog [data-cmd="ss-mesh"][data-v="coarse"]'); await sleep(100);
    const x0 = faces().find(f => f.info.n && f.info.n[0] < -0.99);
    click('#dialog [data-cmd="ss-tool"][data-v="fixed"]'); await sleep(100);
    pick(x0);
    await waitFor(() => C.doc.solidStudy.fixed.length === 1, 10000, 'feste Fläche');
    click('#dialog [data-cmd="ss-art"][data-v="modal"]');
    await waitFor(() => C.doc.solidStudy.art === 'modal', 10000, 'Modalanalyse eingestellt');
    expect(!D.querySelector('#dialog input[data-ss="F"]') && !D.querySelector('#dialog [data-cmd="ss-umh"]') && !!D.querySelector('#dialog input[data-ss="anzahl"]'), 'Modalrechnung ohne Kraft und Lastfall-Werkzeuge');
    const anzahl = q('#dialog input[data-ss="anzahl"]'); anzahl.value = '2'; anzahl.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.doc.solidStudy.anzahl === 2, 10000, 'Anzahl Eigenformen 2');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /Größte Frequenz/.test(q('#dialog').textContent), 150000, 'Ergebnis der Modalrechnung');
    const t = q('#dialog').textContent;
    expect(/Modalanalyse über 2 Eigenformen/.test(t), 'Ergebniskopf der Modalanalyse');
    const zeilen = [...D.querySelectorAll('#dialog table.cuttab tbody tr')].map(row => [...row.cells].map(c => c.textContent));
    expect(zeilen.length === 2, 'zwei Zeilen in der Modentabelle');
    const f1 = Number((zeilen[0][1] || '').replace(',', '.'));
    near(f1, fTheo(1.875104 ** 2), 0.02 * fTheo(1.875104 ** 2), `Frequenz in der App-Tabelle (Theorie ${fTheo(1.875104 ** 2).toFixed(2)} Hz)`);
    near(Number((/Erste Eigenfrequenz\s*([\d,]+)/.exec(t) || [])[1].replace(',', '.')), f1, 0.01, 'erste Eigenfrequenz in der Zusammenfassung');
    near(Number((/Größte Frequenz\s*([\d,]+)/.exec(t) || [])[1].replace(',', '.')),
      Number(zeilen[zeilen.length - 1][1].replace(',', '.')), 0.01, 'größte Frequenz ist die letzte Zeile');
    click('#dialog [data-cmd="ss-form"][data-i="1"]');
    await waitFor(() => D.querySelector('#dialog table.cuttab tbody tr.sel[data-i="1"]'), 10000, 'zweite Eigenform ausgewählt');
    await waitFor(() => C.vp.resultG, 8000, 'verformtes Bild').catch(() => {});
    const geo = C.vp.resultG?.geometry; geo?.computeBoundingBox();
    const quer = geo ? Math.max(geo.boundingBox.max.y - geo.boundingBox.min.y, geo.boundingBox.max.z - geo.boundingBox.min.z) : 0;
    expect(quer > 25, `Eigenform ist im Bild ausgewölbt (${quer.toFixed(1)} mm quer zur Achse, Körper selbst 20 mm)`);
    expect(/gezeichnet ist Eigenform 2/.test(q('#dialog').textContent), 'UI nennt die gezeichnete Eigenform');
    click('#dialog [data-cmd="ss-art"][data-v="statisch"]');
    await waitFor(() => C.doc.solidStudy.art === 'statisch', 10000, 'zurück auf statisch');
    expect(C.doc.solidStudy.anzahl === 2 && !!D.querySelector('#dialog input[data-ss="self"]') && !!D.querySelector('#dialog [data-cmd="ss-fall"]'), 'Einstellungen bleiben erhalten, Lastfall-Werkzeuge wieder da');
    expect(!C.vp.resultG, 'beim Wechsel der Studie ist das alte Ergebnis weg');
    click('#dialog [data-cmd="ss-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !C.vp.resultG && C.doc.solidStudy.art === 'statisch', 'Schließen räumt auf, Studie bleibt');
  }],
  ['Festigkeit (Bauteil): Wärme – Temperaturfeld, Wärmeströme, Rippe', async () => {
    // Rechenkern: Stab 200 × 20 × 20, k = 0,05 W/(mm·K) = 50 W/(m·K). Vorgabe 100 °C / 0 °C – lineares Feld,
    // Wärmestrom Q = k A ΔT / L = 0,05 · 400 · 100 / 200 = 10 W. Das Würfelnetz bildet das exakt ab.
    const { solveSolidThermal } = await import('../src/sim/thermal.js');
    const v = (x, y, z) => [x * 200, y * 20, z * 20], quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    const F = { x0: quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)), x1: quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)), y0: quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)), y1: quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)), z0: quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)), z1: quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)) };
    for (const k in F) F[k] = Float64Array.from(F[k]);
    const all = Object.values(F).flatMap(a => [...a]);
    const grund = { tris: Float64Array.from(all), bbox: [[0, 0, 0], [200, 20, 20]], h: 5, E: 1, nu: 0.3, k: 0.05 };
    const Tbei = (r, x) => { let b = null, bd = 1e9; for (let n = 0; n < r.nn; n++) { const d = (r.xyz[3 * n] - x) ** 2 + (r.xyz[3 * n + 1] - 10) ** 2 + (r.xyz[3 * n + 2] - 10) ** 2; if (d < bd) { bd = d; b = n; } } return r.T[b]; };
    let forts = 0;
    let r = solveSolidThermal({ ...grund, temps: [{ tris: F.x0, T: 100 }, { tris: F.x1, T: 0 }] }, p => { forts = Math.max(forts, p); });
    expect(forts === 1, 'Fortschritt bis 100 %');
    near(r.tmax, 100, 1e-9, 'höchste Temperatur ist die Vorgabe'); near(r.tmin, 0, 1e-9, 'niedrigste Temperatur ist die Vorgabe');
    for (const [x, hand] of [[50, 75], [100, 50], [150, 25]]) near(Tbei(r, x), hand, 1e-6, `Temperatur bei x = ${x} (Hand ${hand} °C)`);
    near(r.qFix[0], 10, 1e-6, 'Wärme, die die heiße Fläche in den Körper treibt (Hand 10 W)');
    near(r.qFix[1], -10, 1e-6, 'Wärme, die die kalte Fläche abnimmt');
    // Rippe: 10 W in die Stirnfläche, Wärmeübergang 10 W/(m²·K) über alle Flächen – Handrechnung als Rippe mit
    // Spitzenkonvektion (m = √(hU/kA)). Der Rand an der beheizten Stirn fehlt in der Handrechnung, deshalb 5 %toleranz.
    const hc = 1e-5, L = 200, Aq = 400, Um = 80, kk = 0.05, mu = hc / (Math.sqrt(hc * Um / (kk * Aq)) * kk), mL = Math.sqrt(hc * Um / (kk * Aq)) * L;
    const Dn = Math.cosh(mL) + mu * Math.sinh(mL);
    const tb = 10 * Dn / (Math.sqrt(hc * Um / (kk * Aq)) * kk * Aq * (Math.sinh(mL) + mu * Math.cosh(mL)));
    r = solveSolidThermal({ ...grund, fluxes: [{ tris: F.x1, P: 10 }], convs: Object.values(F).map(tris => ({ tris, h: hc, Tamb: 20 })) });
    near(r.tmax, 20 + tb, 0.05 * tb, `Spitzentemperatur der Rippe (Rippenrechnung ${(20 + tb).toFixed(1)} °C)`);
    near(r.qConvSum, 10, 1e-6, 'die Rippe gibt genau die zugeführten 10 W ab');
    near(r.qFix.reduce((a, b) => a + b, 0) + r.qIn - r.qConvSum, 0, 1e-6, 'Wärmebilanz schließt');
    r = solveSolidThermal({ ...grund, convs: Object.values(F).map(tris => ({ tris, h: hc, Tamb: 20 })) });
    near(r.tmax - 20, 0, 1e-9, 'nur Umgebung: das ganze Feld hat Umgebungstemperatur');
    // In der App: Bedingungen auf Flächen setzen, Temperaturfeld in °C, Wärmeströme je Bedingung, Bilanz
    await newDoc();
    await cmd('solid:create', 'box'); num('w', 200); num('l', 20); num('h', 20); num('cx', 100); num('cy', 10); await ok();
    await waitFor(() => faces().length > 0, 20000, 'Quader gebaut');
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="solidsim"]');
    await waitFor(() => D.body.dataset.mode === 'solidsim' && /Körper1/.test(q('#dialog').textContent), 20000, 'Festigkeit (Bauteil) offen');
    click('#dialog [data-cmd="ss-mesh"][data-v="coarse"]'); await sleep(100);
    click('#dialog [data-cmd="ss-art"][data-v="waerme"]');
    await waitFor(() => C.doc.solidStudy.art === 'waerme', 10000, 'Wärmeanalyse eingestellt');
    expect(/Wärmeanalyse \(Bauteil\)/.test(q('#dialog').textContent), 'Titel der Wärmeanalyse');
    expect(/Wärmebedingungen \(0\)/.test(q('#dialog').textContent), 'Liste der Wärmebedingungen ist leer');
    expect(['temp', 'flux', 'conv'].every(kk2 => D.querySelector(`#dialog [data-cmd="ss-tool"][data-v="${kk2}"]`)) && !D.querySelector('#dialog [data-cmd="ss-tool"][data-v="force"]')
      && !D.querySelector('#dialog input[data-ss="F"]') && !D.querySelector('#dialog input[data-ss="self"]') && !!D.querySelector('#dialog input[data-ss="T"]'), 'Wärmewerkzeuge statt Kraft und Eigengewicht');
    click('#dialog [data-cmd="ss-run"]'); await sleep(150);
    expect(/ohne vorgegebene Temperatur oder Konvektion/i.test(q('#dialog').textContent), 'ohne Bedingung wird nicht gerechnet');
    const x0 = faces().find(f => f.info.n && f.info.n[0] < -0.99), x1 = faces().find(f => f.info.n && f.info.n[0] > 0.99), y1 = faces().find(f => f.info.n && f.info.n[1] > 0.99);
    const wert = async (f, v) => { const e = q(`#dialog input[data-ss="${f}"]`); e.value = String(v); e.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(60); };
    await wert('T', 100);
    pick(x0);
    await waitFor(() => C.doc.solidStudy.temps.length === 1, 10000, 'Temperatur 100 °C auf einer Fläche');
    await wert('T', 0);
    pick(x1);
    await waitFor(() => C.doc.solidStudy.temps.length === 2, 10000, 'zweite Temperatur');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /Höchste Temperatur/.test(q('#dialog').textContent), 150000, 'Ergebnis der Wärmeanalyse');
    let txt = q('#dialog').textContent;
    near(Number((/Höchste Temperatur\s*([\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 100, 0.05, 'höchste Temperatur in der Zusammenfassung');
    near(Number((/Niedrigste Temperatur\s*([\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 0, 0.05, 'niedrigste Temperatur');
    near(Number((/Temperaturdifferenz\s*([\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 100, 0.05, 'Temperaturdifferenz in K');
    let zel = [...D.querySelectorAll('#dialog table.cuttab tbody tr')].map(row => [...row.cells].map(c => c.textContent));
    expect(zel.length === 2 && /Temperatur/.test(zel[0][0]), 'je Temperaturfläche eine Zeile');
    const waerme = i => Number(zel[i][1].replace(',', '.'));
    near(Math.abs(waerme(0)), 10, 0.02, `Wärmestrom durch den Stab (Hand 10 W, gemessen ${zel[0][1]})`);
    near(waerme(0) + waerme(1), 0, 0.02, 'heiße und kalte Fläche rechnen sich auf');
    near(Number((/Bilanz: ?(-?[\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 0, 0.02, 'Bilanz in der App nahe null');
    await waitFor(() => C.vp.resultG, 8000, 'Temperaturfeld im Bild').catch(() => {});
    expect(C.vp.resultG, 'farbige Ergebnisfläche aus dem Temperaturfeld');
    /* Konvektion auf einer Fläche, die schon eine Temperatur trägt, verdrängt sie – eine Bedingung je Fläche */
    click('#dialog [data-cmd="ss-tool"][data-v="conv"]'); await sleep(80);
    await wert('hc', 10); await wert('Tamb', 20);
    pick(x1);
    await waitFor(() => C.doc.solidStudy.convs.length === 1 && C.doc.solidStudy.temps.length === 1, 10000, 'Konvektion ersetzt die Temperatur auf derselben Fläche');
    expect(/Konvektion 10 W\/\(m²·K\) bei 20 °C/.test(q('#dialog').textContent), 'Konvektion in der Liste der Bedingungen');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /Konvektion 20 °C/.test(q('#dialog').textContent), 150000, 'Ergebnis mit Konvektion');
    txt = q('#dialog').textContent;
    const abgef = Number((/Wärme an die Umgebung\s*(-?[\d,]+)/.exec(txt) || [])[1].replace(',', '.'));
    near(Number((/Höchste Temperatur\s*([\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 100, 0.05, 'ohne kalte Vorgabe bleibt die heiße Fläche die wärmste');
    near(Number((/Niedrigste Temperatur\s*([\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 96.9, 0.3, 'kälteste Fläche ist die konvektionsbehaftete Stirnseite (Handrechnung: 10 K/W Leitung in Reihe zu 250 K/W Übergang)');
    expect(/Wärme an die Umgebung/.test(txt), 'Wärmemenge an die Umgebung in der Zusammenfassung');
    zel = [...D.querySelectorAll('#dialog table.cuttab tbody tr')].map(row => [...row.cells].map(c => c.textContent));
    expect(zel.length === 2 && /Temperatur/.test(zel[0][0]) && /Konvektion/.test(zel[1][0]), 'Temperatur- und Konvektionsfläche zusammen in der Tabelle');
    near(abgef, 80 / 260, 0.01, `Wärmestrom durch Leitung und Übergang in Reihe (Hand ${(80 / 260).toFixed(3)} W, gemessen ${zel[0][1]} / ${zel[1][1]})`);
    near(abgef, waerme(0), 0.01, 'die Konvektion führt genau das ab, was die heiße Fläche zuliefert');
    near(abgef, -waerme(1), 0.01, 'die Konvektionszeile zeigt denselben Betrag mit umgekehrtem Vorzeichen');
    near(Number((/Bilanz: ?(-?[\d,]+)/.exec(txt) || [])[1].replace(',', '.')), 0, 0.02, 'Bilanz mit Konvektion rechnet auf');
    click('#dialog [data-cmd="ss-del"][data-k="convs"][data-i="0"]');
    await waitFor(() => C.doc.solidStudy.convs.length === 0, 10000, 'Konvektion entfernt');
    expect(/Einrichtung geändert/.test(q('#dialog').textContent), 'nach der Änderung steht das alte Ergebnis als veraltet da');
    click('#dialog [data-cmd="ss-art"][data-v="statisch"]');
    await waitFor(() => C.doc.solidStudy.art === 'statisch', 10000, 'zurück auf statisch');
    expect(C.doc.solidStudy.temps.length === 1 && C.doc.solidStudy.convs.length === 0, 'Wärmebedingungen bleiben in der Datei stehen');
    expect(!!D.querySelector('#dialog [data-cmd="ss-tool"][data-v="force"]') && !!D.querySelector('#dialog [data-cmd="ss-tool"][data-v="fixed"]') && !D.querySelector('#dialog [data-cmd="ss-tool"][data-v="conv"]'), 'Kraftwerkzeug wieder da, Wärmewerkzeuge weg');
    click('#dialog [data-cmd="ss-tool"][data-v="force"]'); await sleep(80);
    expect(!!D.querySelector('#dialog input[data-ss="F"]') && !D.querySelector('#dialog input[data-ss="T"]'), 'Kraftwert statt Temperaturfeld');
    expect(!C.vp.resultG, 'beim Wechsel der Studie ist das alte Temperaturfeld weg');
    click('#dialog [data-cmd="ss-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !C.vp.resultG && C.doc.solidStudy.art === 'statisch', 'Schließen räumt auf, Studie bleibt');
  }],
  ['Festigkeit (Bauteil): zwei Körper auf einem Netz – Kontakt', async () => {
    // Rechenkern: alle Körper einer Studie liegen auf einem Würfenetz, sich berührende teilen sich die Knoten der
    // Berührungsfläche – das ist die Verbindung (fest). Zwei gleiche Hälften müssen sich wie ein durchgehender Träger
    // verhalten, der Verbund Stahl/Alu wie der umgerechnete Querschnitt, und ein Körper ohne Berührung darf nicht
    // stillschweigend lose mitschwingen.
    const { solveSolid } = await import('../src/sim/solid.js');
    const { solveSolidThermal } = await import('../src/sim/thermal.js');
    const quader = (x0, y0, z0, x1, y1, z1) => {
      const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      const f = [[0, 1, 2], [0, 2, 3], [7, 6, 5], [7, 5, 4], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
      const out = [];
      for (const t of f) for (const qd of t) out.push(...p[qd]);
      return Float64Array.from(out);
    };
    const bb = (a, b, c, d, e, g) => [[a, b, c], [d, e, g]];
    const E1 = 210000, E2 = 69000, nu = 0.3;
    const grund = { h: 5, nu, fixed: [quader(0, -10, 0, 0, 10, 40)], forces: [{ tris: quader(200, -10, 0, 200, 10, 40), F: [0, 0, -1000] }] };
    const rg = solveSolid({ ...grund, tris: quader(0, -10, 0, 200, 10, 40), bbox: bb(0, -10, 0, 200, 10, 40), E: E1 });
    const unten = { tris: quader(0, -10, 0, 200, 10, 20), bbox: bb(0, -10, 0, 200, 10, 20) };
    const oben = { tris: quader(0, -10, 20, 200, 10, 40), bbox: bb(0, -10, 20, 200, 10, 40) };
    const rz = solveSolid({ ...grund, ...unten, E: E1, mit: [{ ...oben, E: E1, nu, name: 'Oberteil' }] });
    near(rz.smax, rg.smax, rg.smax * 1e-6, 'zwei gleiche Körper rechnen wie ein durchgehender Träger (σ)');
    near(rz.dmax, rg.dmax, rg.dmax * 1e-6, 'zwei gleiche Körper rechnen wie ein durchgehender Träger (δ)');
    expect(rz.kontakte.length === 1 && rz.kontakte[0].n === 160 && !rz.ueber, 'Kontakt: 160 Würfel an der Berührungsfläche, keine Überscheidung');
    expect(rz.koerper.length === 2 && rz.koerper[1].name === 'Oberteil' && rz.koerper[0].elements === 640 && rz.koerper[1].elements === 640, 'jeder Körper einzeln gezählt');
    /* Verbundträger Stahl unten, Alu oben: Querschnitt auf Stahl umgerechnet (n = E₂/E₁) */
    const rb = solveSolid({ ...grund, ...unten, E: E1, mit: [{ ...oben, E: E2, nu: 0.33, name: 'Alu' }] });
    const n = E2 / E1, A1 = 400, A2 = n * 400, I1 = 20 * 20 ** 3 / 12, I2 = n * I1;
    const zbar = (A1 * 10 + A2 * 30) / (A1 + A2), Ix = I1 + A1 * (zbar - 10) ** 2 + I2 + A2 * (30 - zbar) ** 2;
    const dHand = 1000 * 200 ** 3 / (3 * E1 * Ix), sHand = 1000 * 200 * zbar / Ix;
    near(rb.dmax, dHand, dHand * 0.05, `Verbund Stahl/Alu: Durchbiegung gegen die Querschnittsumrechnung (${dHand.toFixed(4)} mm)`);
    near(rb.smax, sHand, sHand * 0.08, `größte Zugspannung im Stahl (${sHand.toFixed(1)} MPa)`);
    expect(rb.smaxTeile.length === 2 && rb.smaxTeile[0] > rb.smaxTeile[1] * 1.5, 'Spannung je Körper getrennt, im Stahl deutlich über der im Alu');
    let meldung = '';
    try { solveSolid({ ...grund, ...unten, E: E1, mit: [{ tris: quader(0, -10, 60, 200, 10, 80), bbox: bb(0, -10, 60, 200, 10, 80), E: E2, nu }] }); }
    catch (e) { meldung = e.message; }
    expect(/berührt keinen anderen Körper/.test(meldung), 'Körper ohne Berührung bricht ab, statt lose mitzuschwingen');
    /* Wärme: zwei Werkstoffe in Reihe – der Wärmestrom ist durch beide gleich, Handrechnung Reihenschaltung */
    const kSt = 0.05, kPl = 0.00012;
    const rw = solveSolidThermal({ tris: quader(0, -10, 0, 100, 10, 20), bbox: bb(0, -10, 0, 100, 10, 20), h: 5, k: kSt,
      mit: [{ tris: quader(100, -10, 0, 200, 10, 20), bbox: bb(100, -10, 0, 200, 10, 20), k: kPl, name: 'Kunststoff' }],
      temps: [{ tris: quader(0, -10, 0, 0, 10, 20), T: 100 }, { tris: quader(200, -10, 0, 200, 10, 20), T: 0 }] });
    const R = 100 / (kSt * 400) + 100 / (kPl * 400);
    near(Math.abs(rw.qFix[0]), 100 / R, 0.01 * (100 / R), `Wärme durch zwei Werkstoffe in Reihe (Handrechnung ${(100 / R).toFixed(4)} W)`);
    expect(rw.kontakte.length === 1 && rw.koerper.length === 2, 'Wärme: Körper und Kontakt ebenso berichtet');
    /* In der App: zwei Quader 100 × 10 × 10 hintereinander, der zweite mit eigenem Werkstoff. Zugstab über zwei
       Körper: σ = F / A = 10 MPa in beiden, δ = F/E₁·L₁/A + F/E₂·L₂/A = 0,0193 mm, SF nach dem niedrigeren fy. */
    await newDoc();
    await box(100, 10, 10, { cx: 50, cy: 5 });
    await cmd('solid:create', 'box'); num('w', 100); num('l', 10); num('h', 10); num('cx', 150); num('cy', 5); await seg('op', 'new'); await ok(20000);
    expect(C.lastBuild.bodies.length === 2, 'zwei Körper im Modell');
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="solidsim"]');
    await waitFor(() => D.body.dataset.mode === 'solidsim', 20000, 'Festigkeit (Bauteil) offen');
    /* zwei Körper: keiner gehört von sich aus zur Studie – der erste wird angeklickt, danach kommt der zweite dazu */
    const S = C.doc.solidStudy, m = C.lastBuild.mesh;
    expect(!S.body && S.mit.length === 0, 'mit zwei Körpern bleibt die Wahl am Anfang offen');
    expect(/Körper im Modell anklicken/.test(q('#dialog').textContent), 'Hinweis, erst den Körper zu wählen');
    click('#dialog [data-cmd="ss-tool"][data-v="body"]'); await sleep(80);
    pick(faces().find(f => f.info.n && f.info.n[0] > 0.99 && f.info.center[0] > 199)); await sleep(250);
    const main = m.bodies.findIndex(b => b.id === S.body);
    expect(main >= 0 && /Körper2/.test(q('#dialog').textContent), 'Hauptkörper durch Klicken gewählt');
    expect(!!D.querySelector('#dialog [data-cmd="ss-tool"][data-v="add"]'), 'Werkzeug „Körper hinzufügen“');
    click('#dialog [data-cmd="ss-tool"][data-v="add"]'); await sleep(80);
    pick(faces().find(f => f.info.body !== main && f.info.n && f.info.n[0] < -0.99)); await sleep(250);
    expect(S.mit.length === 1 && S.mit[0].body !== S.body, 'zweiter Körper in der Studie');
    expect(/Weitere Körper/.test(q('#dialog').textContent), 'weitere Körper in der Liste');
    const sel = q('#dialog select[data-ss="matmit"]');
    sel.value = 'alu6060'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(250);
    expect(S.mit[0].mat === 'alu6060', 'eigener Werkstoff für den zweiten Körper');
    click('#dialog [data-cmd="ss-mesh"][data-v="coarse"]'); await sleep(100);
    click('#dialog [data-cmd="ss-tool"][data-v="fixed"]'); await sleep(80);
    pick(faces().find(f => f.info.n && f.info.n[0] < -0.99 && f.info.center[0] < 1)); await sleep(200);
    click('#dialog [data-cmd="ss-tool"][data-v="force"]'); await sleep(80);
    click('#dialog [data-cmd="ss-dir"][data-v="x+"]'); await sleep(80);
    pick(faces().find(f => f.info.n && f.info.n[0] > 0.99 && f.info.center[0] > 199)); await sleep(200);
    expect(S.fixed.length === 1 && S.loads.length === 1 && Math.abs(S.loads[0].F[0] - 1000) < 1e-9, 'fest auf dem weiteren, 1000 N +X auf dem Hauptkörper');
    click('#dialog [data-cmd="ss-run"]');
    await waitFor(() => /Größte Vergleichsspannung/.test(q('#dialog').textContent) || /warn/.test(q('#dialog').innerHTML), 90000, 'Ergebnis');
    const t = q('#dialog').textContent;
    const zahl = re => Number((re.exec(t) || [])[1]?.replace(/\s/g, '').replace(',', '.'));
    const wert = s => Number(String(s).replace(/\s/g, '').replace(',', '.'));
    /* Handrechnung: σ = F/A = 10 MPa in beiden, δ = F/E₁·L₁/A + F/E₂·L₂/A. Die Durchbiegung über die ganze Länge
       trifft genau zu; die größte Spannung sitzt an der Einspannung und am Werkstoffübergang (Randeffekt, wächst mit
       feinerem Netz) und bleibt deshalb mit Spiel. Geprüft wird dafür der Sicherheitsfaktor je Körper aus dessen
       eigener Streckgrenze – das ist die Zusage mehrerer Werkstoffe in einer Studie. */
    near(zahl(/Größte Vergleichsspannung\s*([\d,]+)/), 10, 3.5, 'Spannung in beiden Körpern nahe F/A');
    near(zahl(/Größte Verschiebung\s*([\d,]+)/), 1000 * 100 / (E1 * 100) + 1000 * 100 / (E2 * 100), 0.0008, 'Durchbiegung über zwei Werkstoffe');
    const koepfe = [...D.querySelectorAll('#dialog table.cuttab thead th')].map(th => th.textContent);
    expect(koepfe.includes('Körper') && koepfe.includes('σ max MPa') && koepfe.includes('Berührungsflächen'), 'Tabelle mit Körpern, je σ und SF, dazu die Kontakte');
    const zeilen = [...D.querySelectorAll('#dialog table.cuttab tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
    const teile = zeilen.filter(r => /^Körper\d$/.test(r[0]) && r.length === 4);
    expect(teile.length === 2 && wert(teile[0][1]) === wert(teile[1][1]) && wert(teile[0][1]) > 500, 'beide Körper mit ihrer eigenen Würfelzahl');
    const fy = { Körper1: 150, Körper2: 235 };
    for (const [name, , s, sf] of teile)
      near(wert(sf), fy[name] / wert(s), 0.05 * (fy[name] / wert(s)), `${name}: Sicherheitsfaktor aus der eigenen Streckgrenze ${fy[name]} MPa`);
    near(zahl(/Sicherheitsfaktor\s*([\d,]+)/), Math.min(...teile.map(([n, , s]) => fy[n] / wert(s))), 0.05, 'maßgebend ist der kleinere der beiden Sicherheitsfaktoren');
    expect(/Körper1/.test(t) && /Körper2/.test(t) && /↔/.test(t), 'beide Körper namentlich, Kontakt zwischen ihnen');
    await waitFor(() => C.vp.resultG, 5000, 'Ergebnisfläche beider Körper').catch(() => {});
    expect(C.vp.resultG, 'farbige Ergebnisfläche über beide Körper');
    click('#dialog [data-cmd="ss-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !C.vp.resultG && C.doc.solidStudy.mit.length === 1, 'Schließen räumt auf, zweiter Körper bleibt in der Datei');
  }],
  ['Festigkeit (Rahmen): Lager, Lasten, Sicherheitsfaktor am Tischgestell', async () => {
    // Rechenkern gegen die Handrechnung: Kragarm Rundstahl Ø20, L 1000, F 1000 N → δ = F L³ / (3 E I), σ = F L / W;
    // Einfeldträger gelenkig mit q = 1 N/mm → δ = 5 q L⁴ / (384 E I), σ = q L² / 8 / W; Stütze Ø20 unter 1000 N Druck → Ncr = π² E I / L²
    const { solveFrame } = await import('../src/sim/frame.js');
    const kopfHat = t => [...D.querySelectorAll('#dialog .cuttab thead th')].some(th => th.textContent === t);
    const bar = { kind: 'bar', w: 20 }, I = Math.PI * 20 ** 4 / 64, Wb = I / 10, Ee = 210000;
    const m = [{ id: 'a', A: [0, 0, 0], B: [1000, 0, 0], px: [0, 1, 0], prof: bar }];
    let r = solveFrame(m, [{ p: [0, 0, 0], kind: 'fixed' }], [{ kind: 'node', p: [1000, 0, 0], F: [0, 0, -1000] }], { selfWeight: false });
    near(r.dmax, 1000 * 1e9 / (3 * Ee * I), 1e-6 * 202, 'Kragarm Durchbiegung (202,10 mm)');
    near(r.members[0].smax, 1e6 / Wb, 1e-6 * 1273, 'Kragarm Spannung (1273,2 MPa)');
    r = solveFrame(m, [{ p: [0, 0, 0], kind: 'pinned' }, { p: [1000, 0, 0], kind: 'pinned' }], [{ kind: 'member', id: 'a', q: [0, 0, -1] }], { selfWeight: false });
    near(r.dmax, 5 * 1e12 / (384 * Ee * I), 1e-6, 'Einfeldträger Durchbiegung (7,895 mm)');
    near(r.members[0].smax, 125000 / Wb, 1e-6 * 159, 'Einfeldträger Spannung (159,2 MPa)');
    r = solveFrame([{ id: 'c', A: [0, 0, 0], B: [0, 0, 1000], px: [1, 0, 0], prof: bar }], [{ p: [0, 0, 0], kind: 'fixed' }], [{ kind: 'node', p: [0, 0, 1000], F: [0, 0, -1000] }], { selfWeight: false });
    near(r.members[0].sfBuck, Math.PI ** 2 * Ee * I / 1e6 / 1000, 1e-6, 'Knicken: Sicherheit Ncr / N (16,28)');
    /* Modalfrequenzen: Kragarm f = λ² / 2π · √(E I / (ρ A L⁴)) mit λ₁ = 1,8751, λ₂ = 4,6941; Einfeldträger gelenkig
       f₁ = π / 2 · √(…) = 40,62 Hz, f₂ = 4 f₁. Rundstahl: je zwei gleiche Formen (beide Biegerichtungen). */
    const { frameModes } = await import('../src/sim/frame.js');
    const basis = Math.sqrt(Ee * I / (7.85e-9 * Math.PI * 100 * 1e12));
    let mo = frameModes(m, [{ p: [0, 0, 0], kind: 'fixed' }]).modes;
    near(mo[0].f, 1.875104 ** 2 / (2 * Math.PI) * basis, 1e-4 * 14.47, `Kragarm 1. Eigenfrequenz ${mo[0].f.toFixed(3)} Hz (Hand 14,472)`);
    near(mo[1].f, mo[0].f, 1e-6, 'zweite Biegerichtung gleich');
    near(mo[2].f, 4.694091 ** 2 / (2 * Math.PI) * basis, 1e-3 * 90.7, `Kragarm 2. Biegeform ${mo[2].f.toFixed(2)} Hz (Hand 90,69)`);
    mo = frameModes(m, [{ p: [0, 0, 0], kind: 'pinned' }, { p: [1000, 0, 0], kind: 'pinned' }]).modes;
    near(mo[0].f, Math.PI / 2 * basis, 1e-3 * 40.6, `Einfeldträger ${mo[0].f.toFixed(3)} Hz (Hand 40,622), keine Scheinform aus dem Verdrehen`);
    near(mo[2].f, 4 * Math.PI / 2 * basis, 1e-3 * 162.5, `Einfeldträger 2. Form ${mo[2].f.toFixed(2)} Hz (Hand 162,49)`);
    // In der App: Tischgestell, vier Beine unten eingespannt, 1 N/mm nach unten auf die oberen Rahmenstäbe
    await openExample('Tischgestell 800x500');
    const fr = C.lastBuild.frames;
    expect(fr.length >= 8 && fr.every(x => x.A && x.B && x.prof), `Rahmenstäbe mit Systemlinie und Profil (${fr.length})`);
    click('[data-rtab="extras"]'); await sleep(120);
    click('[data-menu="extras:steel"]'); await sleep(120); click('#fmenu [data-cmd="framesim"]'); await sleep(300);
    expect(D.body.dataset.mode === 'framesim' && /Festigkeit/.test(q('#dialog').textContent), 'Festigkeit (Rahmen) offen');
    const zs = fr.flatMap(x => [x.A[2], x.B[2]]), zmin = Math.min(...zs), zmax = Math.max(...zs);
    const faceOf = (id, near) => faces().filter(f => C.lastBuild.mesh.bodies[f.info.body].id === id).sort((a, b) => Math.hypot(...a.info.center.map((v, k) => v - near[k])) - Math.hypot(...b.info.center.map((v, k) => v - near[k])))[0];
    const legs = fr.filter(x => Math.min(x.A[2], x.B[2]) < zmin + 1);
    const tops = fr.filter(x => x.A[2] > zmax - 1 && x.B[2] > zmax - 1);
    click('#dialog [data-cmd="fs-tool"][data-v="fixed"]'); await sleep(100);
    for (const l of legs) { const bot = l.A[2] < l.B[2] ? l.A : l.B; const h = faceOf(l.id, bot); pick({ ...h, point: h.info.center }); await sleep(80); }
    click('#dialog [data-cmd="fs-tool"][data-v="line"]'); await sleep(100);
    const qi = q('#dialog input[data-fs="q"]'); qi.value = '1'; qi.dispatchEvent(new W.Event('input', { bubbles: true }));
    for (const t of tops) { const mid = t.A.map((v, k) => (v + t.B[k]) / 2); const h = faceOf(t.id, mid); pick({ ...h, point: mid }); await sleep(80); }
    await sleep(200);
    const S = C.doc.frameStudy;
    expect(S.supports.length === legs.length && S.supports.every(x => Math.abs(x.p[2] - zmin) < 1e-6), `${legs.length} Einspannungen unten an den Beinen`);
    expect(S.loads.length === tops.length, `${tops.length} Streckenlasten auf den oberen Stäben`);
    const txt = q('#dialog').textContent;
    expect(/Kleinster Sicherheitsfaktor/.test(txt) && q('#dialog .cuttab tbody').children.length === fr.length, 'Ergebnis mit Tabelle je Stab');
    // Gleichgewicht: Auflagerkräfte = Streckenlasten + Eigengewicht (Stahl, A je Stab)
    const { sectionProps } = await import('../src/sim/frame.js');
    const Lsum = tops.reduce((a, t) => a + Math.hypot(...t.B.map((v, k) => v - t.A[k])), 0);
    const G = fr.reduce((a, x) => a + 7.85e-6 * 9.81 * sectionProps(x.prof).A * Math.hypot(...x.B.map((v, k) => v - x.A[k])), 0);
    const Rz = Number((/Auflagerkräfte gesamt\s*([^\n]*?) N/.exec(txt) || [])[1]?.split('|')[2]?.replace(',', '.'));
    near(Rz, Lsum + G, 1, `Auflager Z = Last ${Lsum.toFixed(0)} N + Eigengewicht ${G.toFixed(0)} N`);
    const colored = Object.keys(C.vp.bodyColors || {}).length;
    expect(colored === fr.length, `Stäbe nach Sicherheitsfaktor gefärbt (${colored})`);
    // Rückgängig nimmt die letzte Last zurück, Schließen räumt auf, die Einrichtung bleibt im Dokument
    await act(async () => click('[data-cmd="undo"]'));
    await sleep(200);
    expect(C.doc.frameStudy.loads.length === tops.length - 1, 'Rückgängig: eine Last weniger');
    click('#dialog [data-cmd="fs-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !Object.keys(C.vp.bodyColors || {}).length && C.doc.frameStudy.supports.length === legs.length, 'Schließen: Farben weg, Einrichtung bleibt');
    /* Lastfälle: zweiter Lastfall mit 2000 N in +X an einer oberen Ecke (dieselben Lager, eigenes Eigengewicht).
       Umhüllende = je Stab der kleinste Sicherheitsfaktor beider Fälle; Gegenrechnung mit solveFrame je Lastfall */
    click('[data-rtab="extras"]'); await sleep(120);
    click('[data-menu="extras:steel"]'); await sleep(120); click('#fmenu [data-cmd="framesim"]'); await sleep(300);
    click('#dialog [data-cmd="fs-fall-neu"]'); await sleep(150);
    click('#dialog [data-cmd="fs-tool"][data-v="force"]'); await sleep(100);
    const fi = q('#dialog input[data-fs="F"]'); fi.value = '2000'; fi.dispatchEvent(new W.Event('input', { bubbles: true }));
    click('#dialog [data-cmd="fs-dir"][data-v="x+"]'); await sleep(80);
    const ecke = tops[0].A, he = faceOf(tops[0].id, ecke); pick({ ...he, point: ecke }); await sleep(200);
    const S2 = C.doc.frameStudy;
    expect(S2.faelle.length === 2 && S2.fall === 1 && S2.faelle[1].loads.length === 1 && S2.faelle[0].loads.length === tops.length - 1 && S2.loads === S2.faelle[1].loads, `zwei Lastfälle (${S2.faelle.map(f => f.loads.length).join(' / ')} Lasten)`);
    const r1 = solveFrame(fr, S2.supports, S2.faelle[0].loads, { mat: S2.mat, selfWeight: S2.faelle[0].selfWeight });
    const r2 = solveFrame(fr, S2.supports, S2.faelle[1].loads, { mat: S2.mat, selfWeight: S2.faelle[1].selfWeight });
    const minSf = fr.map(x => { const a = r1.members.find(y => y.id === x.id).sf, b = r2.members.find(y => y.id === x.id).sf; return { id: x.id, sf: Math.min(a, b), fall: a <= b ? 'Lastfall 1' : 'Lastfall 2' }; });
    const ges = minSf.reduce((a, b) => (b.sf < a.sf ? b : a));
    click('#dialog [data-cmd="fs-umh"]'); await sleep(300);
    const kopf = [...D.querySelectorAll('#dialog .cuttab thead th')].map(th => th.textContent);
    const erste = q('#dialog .cuttab tbody tr').children;
    const sfTab = Number(erste[3].textContent.replace(',', '.'));
    expect(kopf.includes('maßgebend') && Math.abs(sfTab - Math.round(ges.sf * 100) / 100) < 0.011 && erste[4].textContent === ges.fall, `Umhüllende: kleinster SF ${sfTab} (Rechnung ${ges.sf.toFixed(2)}, ${ges.fall})`);
    const mitFall = new Set(minSf.map(x => x.fall));
    expect([...D.querySelectorAll('#dialog .cuttab tbody tr')].length === fr.length && mitFall.size >= 1, `je Stab ein Eintrag, maßgebend: ${[...mitFall].join(', ')}`);
    click('#dialog [data-cmd="fs-fall"][data-i="0"]'); await sleep(200);
    expect(C.doc.frameStudy.fall === 0 && C.doc.frameStudy.loads.length === tops.length - 1 && !kopfHat('maßgebend'), 'zurück auf Lastfall 1: seine Lasten, keine Umhüllende');
    click('#dialog [data-cmd="fs-close"]'); await sleep(150);
    // Modalfrequenzen am Tischgestell: sechs Formen aufsteigend, Eigenform als Linie, Zeile wählt die Form
    click('[data-rtab="extras"]'); await sleep(120);
    click('[data-menu="extras:steel"]'); await sleep(120); click('#fmenu [data-cmd="framesim"]'); await sleep(300);
    click('#dialog [data-cmd="fs-art"][data-v="modal"]'); await sleep(400);
    const zeilen = [...q('#dialog .cuttab tbody').children], fr2 = zeilen.map(z => Number(z.children[1].textContent.replace(',', '.')));
    expect(C.doc.frameStudy.art === 'modal' && zeilen.length === 6 && fr2.every((v, i) => v > 0 && (!i || v >= fr2[i - 1] - 1e-9)), `sechs Eigenfrequenzen aufsteigend (${fr2.join(' / ')} Hz)`);
    expect(!D.querySelector('#dialog [data-cmd="fs-tool"][data-v="force"]') && /Eigenform 1/.test(q('#dialog').textContent), 'nur Lager-Werkzeuge, Eigenform 1 gezeigt');
    zeilen[1].click(); await sleep(200);
    expect(/Eigenform 2/.test(q('#dialog').textContent), 'Zeile 2 zeigt Eigenform 2');
    click('#dialog [data-cmd="fs-art"][data-v="statisch"]'); await sleep(300);
    expect(!C.doc.frameStudy.art || C.doc.frameStudy.art === 'statisch', 'zurück auf Statische Spannung');
    click('#dialog [data-cmd="fs-close"]'); await sleep(150);
  }],
  ['Einstellungen: Einheit Zoll, Nachkommastellen, Bedienung „Mitte dreht“', async () => {
    await newDoc(); await box(20, 20, 20);
    const P = () => JSON.parse(W.localStorage.getItem('cc.prefs.test') || '{}');
    const reset = async () => { const p = P(); if (p.unit || p.decLen != null || p.decAng != null || p.nav || p.revZoom) { delete p.unit; delete p.decLen; delete p.decAng; delete p.nav; delete p.revZoom; W.localStorage.setItem('cc.prefs.test', JSON.stringify(p)); await loadApp(); } };
    try {
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="units"]'); await sleep(150);
      expect(q('#prefs [data-pref="unit"][data-v="mm"]').getAttribute('aria-checked') === 'true', 'mm ist Standard');
      await appReloads(() => click('#prefs [data-pref="unit"][data-v="in"]'));
      await sleep(300);
      await waitFor(() => /Einheiten in/.test(q('.status-right').textContent), 6000, 'Statusleiste in Ruhe').catch(() => {}); // mit Grafikkarte zeigt sie beim Zeichnen Bilder/s
      expect(P().unit === 'in' && /Einheiten in/.test(q('.status-right').textContent), `Statusleiste zeigt Zoll (${q('.status-right').textContent})`);
      const props = () => q('#browser').textContent.replace(/\s+/g, ' ');
      expect(/0,79 × 0,79 × 0,79 in/.test(props()), `Abmessung 20 mm = 0,79 in (${props().slice(-90)})`);
      await cmd('solid:create', 'box');
      const w = q('#dialog input[data-k="w"]');
      expect(w.value === '0.787402' && w.dataset.u === 'len' && w.parentElement.querySelector('em').textContent === 'in', `Feld in Zoll (${w.value})`);
      num('w', '2'); num('l', '10 mm'); num('h', '1/2');
      const f = C.editing.feature;
      expect(Math.abs(f.w - 50.8) < 1e-9 && Math.abs(f.l - 10) < 1e-9 && Math.abs(f.h - 12.7) < 1e-9 && !f.exprs, `Eingabe: 2 → 50,8 mm, „10 mm“ wie geschrieben, 1/2 → 12,7 mm (${f.w}, ${f.l}, ${f.h})`);
      // Ausdruck mit Parameter: „breite + 1“ → 1 Zoll dazu, gespeichert mit ausgeschriebener Einheit
      C.doc.params = [{ name: 'breite', expr: '40' }];
      num('w', 'breite + 1'); num('l', 'breite * 2');
      expect(Math.abs(f.w - 65.4) < 1e-9 && f.exprs && f.exprs.w.e === 'breite + 1 in' && Math.abs(f.l - 80) < 1e-9 && f.exprs.l.e === 'breite * 2',
        `breite + 1 → 65,4 mm als „${f.exprs && f.exprs.w && f.exprs.w.e}“, breite * 2 bleibt Faktor (${f.l})`);
      click('#dialog [data-cmd="cancel"]'); await sleep(200);
      C.doc.params = [];
      // Skizze: getippte Maße und Maßfeld in Zoll
      click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
      await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(400);
      const ed = C.editor;
      ed.setTool('rect'); sketchClick(0, 0);
      const e1 = sketchEvt(30, 20); ed.onPointerMove(e1); await sleep(100);
      ed.vin = { idx: 0, vals: ['2', '1'] }; ed.commitTyped(); await sleep(300);
      const xs = ed.f.points.map(p => p.x), ys = ed.f.points.map(p => p.y);
      expect(Math.abs(Math.max(...xs) - Math.min(...xs) - 50.8) < 1e-6 && Math.abs(Math.max(...ys) - Math.min(...ys) - 25.4) < 1e-6, 'Rechteck 2 × 1 in = 50,8 × 25,4 mm');
      const dim = ed.f.rules.find(r => ['distance', 'hdistance', 'vdistance'].includes(r.type) && Math.abs(Math.abs(r.value) - 50.8) < 1e-6);
      const lab = dim && [...D.querySelectorAll('#overlay *')].find(e => e.dataset.rule === dim.id);
      expect(lab && /^2$/.test(lab.textContent.trim()), `Maß zeigt 2 (${lab && lab.textContent})`);
      if (dim) {
        ed.openEditor(dim.id); await sleep(100);
        const inp = D.querySelector('.sk-input');
        expect(inp && inp.value === '2', `Maßfeld in Zoll (${inp && inp.value})`);
        inp.value = '3'; inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(300);
        expect(Math.abs(Math.abs(ed.f.rules.find(r => r.id === dim.id).value) - 76.2) < 1e-6, 'Maß 3 → 76,2 mm');
      }
      click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="units"]'); await sleep(150);
      const sel = q('#prefs select[data-pref="decLen"]'); sel.value = '1';
      await appReloads(() => sel.dispatchEvent(new W.Event('change', { bubbles: true })));
      await sleep(300);
      expect(P().decLen === 1 && /0,8 × 0,8 × 0,8 in/.test(props()), `eine Nachkommastelle (${props().slice(-90)})`);
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="units"]'); await sleep(150);
      const s2 = q('#prefs select[data-pref="decLen"]'); s2.value = 'auto';
      await appReloads(() => s2.dispatchEvent(new W.Event('change', { bubbles: true })));
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="units"]'); await sleep(150);
      await appReloads(() => click('#prefs [data-pref="unit"][data-v="mm"]'));
      await sleep(300);
      await waitFor(() => /Einheiten mm/.test(q('.status-right').textContent), 6000, 'Statusleiste in Ruhe').catch(() => {}); // mit Grafikkarte zeigt sie beim Zeichnen Bilder/s
      await waitFor(() => /Einheiten mm/.test(q('.status-right').textContent) && /20 × 20 × 20 mm/.test(props()), 8000, 'mm-Anzeige').catch(() => {});
      expect(/Einheiten mm/.test(q('.status-right').textContent) && /20 × 20 × 20 mm/.test(props()), 'zurück auf mm, Anzeige wie vorher');
      // Bedienung wie Mitte dreht: Mitte dreht (OrbitControls: ROTATE, mit Strg verschiebt es), F passt ein, Strg + 1 vorne
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="general"]'); await sleep(150);
      click('#prefs [data-pref="nav"][data-v="mitte"]'); await sleep(150);
      expect(P().nav === 'mitte' && C.vp.navScheme === 'mitte' && C.vp.controls.mouseButtons.MIDDLE === 0, 'Mitte dreht: mittlere Maustaste dreht');
      expect(/Orbit \(mittlere Maustaste\)/.test(q('[data-cmd="nav-orbit"]').title), 'Navigationsleiste nennt die Belegung „Mitte dreht“');
      click('#prefs [data-pf="close"]'); await sleep(100);
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'f', bubbles: true })); await sleep(200);
      expect(D.querySelector('#dialog').hidden && !C.editing, 'F passt ein (kein Verrunden)');
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true, cancelable: true })); await sleep(900);
      const dir = C.vp.camera.position.clone().sub(C.vp.controls.target).normalize();
      expect(dir.y < -0.99, `Strg + 1: Vorderansicht (${dir.toArray().map(v => v.toFixed(2)).join(', ')})`);
      const view = async (key, test, name) => {
        D.dispatchEvent(new W.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })); await sleep(700);
        const d = C.vp.camera.position.clone().sub(C.vp.controls.target).normalize();
        expect(test(d), `Strg + ${key}: ${name} (${d.toArray().map(v => v.toFixed(2)).join(', ')})`);
      };
      await view('2', d => d.y > 0.99, 'hinten'); await view('3', d => d.x < -0.99, 'links'); await view('4', d => d.x > 0.99, 'rechts');
      await view('5', d => d.z > 0.99, 'oben'); await view('6', d => d.z < -0.99, 'unten'); await view('7', d => d.x > 0.3 && d.y < -0.3 && d.z > 0.3, 'isometrisch');
      // Strg + 8 mit gewählter Deckfläche: senkrecht darauf
      const top = faces().find(h => h.info.type === 'PLANE' && h.info.n && h.info.n[2] > 0.99);
      if (top) { pick(top); await sleep(150); await view('8', d => d.z > 0.99, 'senkrecht auf die Deckfläche'); D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100); }
      // Mit F-Tasten: Mitte verschiebt, F4 Orbit-Werkzeug, F5 vorherige Ansicht, F6 Startansicht
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="general"]'); await sleep(150);
      click('#prefs [data-pref="nav"][data-v="ftasten"]'); await sleep(150);
      click('#prefs [data-pf="close"]'); await sleep(100);
      expect(C.vp.navScheme === 'ftasten' && C.vp.controls.mouseButtons.MIDDLE === 2 && /F4/.test(q('[data-cmd="nav-orbit"]').title), 'Mit F-Tasten: Mitte verschiebt, Orbit mit F4');
      const fk = async key => { D.dispatchEvent(new W.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); await sleep(700); };
      await fk('F4');
      expect(C.vp.navTool === 'orbit', 'F4 schaltet das Orbit-Werkzeug ein');
      await fk('F4');
      expect(!C.vp.navTool, 'noch einmal F4 schaltet es aus');
      await fk('F6');
      const iso = C.vp.camera.position.clone().sub(C.vp.controls.target).normalize();
      C.vp.view('front'); await sleep(700);
      await fk('F5');
      const back = C.vp.camera.position.clone().sub(C.vp.controls.target).normalize();
      expect(back.distanceTo(iso) < 0.02 && iso.z > 0.3, `F6 Startansicht, F5 zurück zur vorigen (${back.toArray().map(v => v.toFixed(2)).join(', ')})`);
      /* Rechts dreht, Alt + Umschalt, Mitte dreht, Umschalt verschiebt: Mauszüge auf der Zeichenfläche. Drehen um 100 px nach rechts dreht den Azimut um
         100 · 2π / Bildhöhe · rotateSpeed um die Hochachse; Verschieben um 100 px nach rechts verschiebt den Zielpunkt
         bei Perspektive (30°) um 2 · 100 · Abstand · tan 15° / Bildhöhe, Blickrichtung und Abstand bleiben. */
      const cv = q('#cv');
      const zug = async (btn, dx, dy, mods = {}) => {
        const r = cv.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const ev = (t, px, py) => cv.dispatchEvent(new W.PointerEvent(t, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: t === 'pointermove' ? -1 : btn, buttons: t === 'pointerup' ? 0 : 1 << [0, 2, 1][btn], clientX: px, clientY: py, bubbles: true, cancelable: true, ...mods }));
        ev('pointerdown', x, y); ev('pointermove', x + dx / 2, y + dy / 2); ev('pointermove', x + dx, y + dy); ev('pointerup', x + dx, y + dy);
        await sleep(150);
      };
      const lage = () => { const off = C.vp.camera.position.clone().sub(C.vp.controls.target); return { off, dir: off.clone().normalize(), az: Math.atan2(off.y, off.x), tgt: C.vp.controls.target.clone(), cam: C.vp.camera.position.clone() }; };
      const schema = async v => { click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="general"]'); await sleep(150); click(`#prefs [data-pref="nav"][data-v="${v}"]`); await sleep(150); click('#prefs [data-pf="close"]'); await sleep(100); };
      const wink = a => Math.atan2(Math.sin(a), Math.cos(a));
      const prüfeDreh = async (name, btn, mods) => {
        C.vp.view('iso'); await sleep(700);
        const a = lage(); await zug(btn, 100, 0, mods); const b = lage();
        const soll = -100 * 2 * Math.PI / cv.clientHeight * C.vp.controls.rotateSpeed;
        expect(Math.abs(wink(b.az - a.az) - soll) < 0.02 && Math.abs(b.dir.z - a.dir.z) < 0.01, `${name}: Azimut ${(wink(b.az - a.az) * 180 / Math.PI).toFixed(1)}° (soll ${(soll * 180 / Math.PI).toFixed(1)}°)`);
      };
      const prüfeSchieb = async (name, btn, mods) => {
        C.vp.view('iso'); await sleep(700);
        const a = lage(); await zug(btn, 100, 0, mods); const b = lage(), d = b.tgt.distanceTo(a.tgt);
        const soll = C.vp.camera.isPerspectiveCamera ? 2 * 100 * a.off.length() * Math.tan(C.vp.camera.fov / 2 * Math.PI / 180) / cv.clientHeight : d;
        expect(b.dir.distanceTo(a.dir) < 1e-6 && Math.abs(d - soll) < 0.02 * soll && d > 0, `${name}: Zielpunkt ${d.toFixed(2)} mm verschoben (soll ${soll.toFixed(2)}), Richtung gleich`);
      };
      await schema('rechts');
      expect(C.vp.navScheme === 'rechts' && C.vp.controls.mouseButtons.MIDDLE == null && /rechte Maustaste/.test(q('[data-cmd="nav-orbit"]').title), 'Rechts dreht: Navigationsleiste nennt rechts ziehen');
      await prüfeDreh('Rechts dreht rechts ziehen', 2);
      expect(!D.querySelector('#marking'), 'nach dem Ziehen kein Markierungsmenü');
      await prüfeSchieb('Rechts dreht Mitte', 1);
      await prüfeSchieb('Rechts dreht Umschalt + rechts', 2, { shiftKey: true });
      await zug(2, 0, 0);
      expect(!!D.querySelector('#marking'), 'Rechtsklick ohne Ziehen öffnet weiter das Markierungsmenü');
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100);
      await schema('altumschalt');
      await prüfeDreh('Alt + Umschalt Alt + Umschalt + links', 0, { altKey: true, shiftKey: true });
      expect(!(C.vp.selection && (C.vp.selection.faces.length || C.vp.selection.edges.length)), 'Alt + Umschalt-Zug wählt nichts aus');
      await prüfeSchieb('Alt + Umschalt Alt + Umschalt + Mitte', 1, { altKey: true, shiftKey: true });
      {
        C.vp.view('iso'); await sleep(700);
        const a = lage(); await zug(2, 0, 100, { altKey: true, shiftKey: true }); const b = lage();
        expect(b.dir.distanceTo(a.dir) < 1e-6 && b.cam.clone().sub(a.cam).dot(a.dir) > 0, 'Alt + Umschalt Alt + Umschalt + rechts nach unten zoomt heraus');
      }
      await schema('mitteumschalt');
      expect(C.vp.controls.mouseButtons.MIDDLE == null && /Umschalt \+ mittlere/.test(q('[data-cmd="nav-pan"]').title), 'Mitte dreht, Umschalt verschiebt: Navigationsleiste nennt Umschalt + Mitte');
      await prüfeDreh('Mitte dreht, Umschalt verschiebt Mitte', 1);
      await prüfeSchieb('Mitte dreht, Umschalt verschiebt Umschalt + Mitte', 1, { shiftKey: true });
      {
        C.vp.view('iso'); await sleep(700);
        const a = lage(); await zug(1, 0, -100, { ctrlKey: true }); const b = lage();
        expect(b.dir.distanceTo(a.dir) < 1e-6 && b.cam.clone().sub(a.cam).dot(a.dir) < 0, 'Mitte dreht, Umschalt verschiebt Strg + Mitte nach oben zoomt hinein');
      }
      click('#prefsbtn'); await sleep(200); click('#prefs [data-pftab="general"]'); await sleep(150);
      click('#prefs [data-pref="nav"][data-v="standard"]'); await sleep(150);
      expect(C.vp.navScheme === 'standard' && C.vp.controls.mouseButtons.MIDDLE === 2, 'zurück auf Standard: Mitte verschiebt');
      click('#prefs [data-pf="close"]'); await sleep(100);
    } finally { await reset(); }
  }],
  ['Dokumenteinstellungen: Einheiten je Dokument, Rückgängig, neues Dokument mit Voreinstellung', async () => {
    await newDoc(); await box(20, 20, 20);
    const props = () => q('#browser').textContent.replace(/\s+/g, ' ');
    const status = () => q('.status-right').textContent;
    const sel = () => q('#browser select[data-docunit]');
    expect(sel().value === 'mm' && !C.doc.einheit, 'neues Dokument: Einheit aus den Einstellungen (mm), nichts gespeichert');
    sel().value = 'in'; sel().dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(300);
    // 20 mm / 25,4 = 0,787… in → bei Zoll eine Stelle mehr als bei mm (1 + 1) = 0,79
    expect(C.doc.einheit === 'in' && sel().value === 'in' && /0,79 × 0,79 × 0,79 in/.test(props()), `Dokument in Zoll: Abmessung 0,79 in (${props().slice(-80)})`);
    await waitFor(() => /Einheiten in/.test(status()), 6000, 'Statusleiste').catch(() => {});
    expect(/Einheiten in/.test(status()), `Statusleiste zeigt die Einheit des Dokuments (${status()})`);
    expect(/"einheit":"in"/.test(W.localStorage.getItem('cantcodecad.doc.test') || ''), 'Einheit wird mit dem Dokument gespeichert');
    await cmd('solid:create', 'box');
    const w = q('#dialog input[data-k="w"]');
    expect(w.value === '0.787402' && w.parentElement.querySelector('em').textContent === 'in', `Feature-Dialog in Zoll (${w.value})`);
    num('w', '2');
    expect(Math.abs(C.editing.feature.w - 50.8) < 1e-9, `Eingabe 2 → 50,8 mm (${C.editing.feature.w})`);
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    await act(async () => click('[data-cmd="undo"]'));
    expect(!C.doc.einheit && /20 × 20 × 20 mm/.test(props()), `Rückgängig: wieder mm (${props().slice(-60)})`);
    await act(async () => click('[data-cmd="redo"]'));
    expect(C.doc.einheit === 'in' && /0,79 × 0,79 × 0,79 in/.test(props()), 'Wiederholen: wieder Zoll');
    sel().value = 'cm'; sel().dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(300);
    expect(/2 × 2 × 2 cm/.test(props()), `Zentimeter: 20 mm = 2 cm (${props().slice(-60)})`);
    await newDoc();
    expect(sel().value === 'mm' && (/Einheiten mm/.test(status()) || /Bilder\/s/.test(status())), 'neues Dokument: zurück auf die Voreinstellung');
  }],
  ['Sprache Englisch: Oberfläche englisch, Dokument bleibt, zurück auf Deutsch', async () => {
    await newDoc(); await box(20, 20, 20);
    const nF = C.doc.features.length;
    const lang = () => JSON.parse(W.localStorage.getItem('cc.prefs.test') || '{}').lang || 'de';
    try {
      click('#prefsbtn'); await sleep(200);
      expect(q('#prefs [data-pref="lang"][data-v="de"]').getAttribute('aria-checked') === 'true', 'Deutsch ist Standard');
      await appReloads(() => click('#prefs [data-pref="lang"][data-v="en"]'));
      expect(lang() === 'en' && D.documentElement.lang === 'en', 'Englisch gespeichert, Seite neu geladen');
      expect(C.doc.features.length === nF, `Dokument bleibt erhalten (${C.doc.features.length} Features)`);
      await sleep(300);
      const txt = s => q(s).textContent;
      await waitFor(() => /Units mm/.test(q('.status-right').textContent), 6000, 'Statusleiste in Ruhe').catch(() => {}); // mit Grafikkarte zeigt sie beim Zeichnen Bilder/s
      expect(/Units mm · Z points up/.test(txt('.status-right')), `Statusleiste englisch (${txt('.status-right')})`);
      expect(/Solid/.test(txt('[data-rtab="solid"]')) && /Sheet Metal/.test(txt('[data-rtab="sheet"]')), 'Reiter englisch (Solid, Sheet Metal)');
      expect(/Create/.test(txt('#ribbon')) && /Modify/.test(txt('#ribbon')) && /Inspect/.test(txt('#ribbon')), 'Gruppen englisch (Create, Modify, Inspect)');
      expect(/Bodies/.test(txt('#browser')) && /Origin/.test(txt('#browser')) && !/Körper|Ursprung/.test(txt('#browser')), `Browser englisch (${txt('#browser').replace(/\s+/g, ' ').slice(0, 80)})`);
      expect(/Box1/.test(txt('#timeline-items') + q('#timeline-items').innerHTML), 'Feature-Namen (Box1)');
      await cmd('solid:create', 'box');
      expect(/Cancel/.test(txt('#dialog')) && /Box/.test(txt('#dialog')) && !/Abbrechen|Quader/.test(txt('#dialog')), `Feature-Dialog englisch (${txt('#dialog').replace(/\s+/g, ' ').slice(0, 60)})`);
      click('#dialog [data-cmd="cancel"]'); await sleep(200);
      // neue Features heißen, Zahlen mit Dezimalpunkt
      await box(25, 10, 10, { cx: 40 });
      expect(C.doc.features[C.doc.features.length - 1].name === 'Box1', `neues Feature heißt Box1 (${C.doc.features[C.doc.features.length - 1].name})`);
      expect(/62\.5 × 20 × 20 mm/.test(txt('#browser')) && !/\d,\d/.test(txt('#browser')), `Dezimalpunkt (${txt('#browser').replace(/\s+/g, ' ').slice(-70)})`);
      await act(async () => click('[data-cmd="undo"]'));
      const tt = W.cantcodecadI18n.tr;
      expect(tt('Extrusion') === 'Extrude' && tt('Drehung') === 'Revolve' && tt('Verrunden') === 'Fillet' && tt('Zeitleiste') === 'Timeline', 'englische Begriffe: Extrude, Revolve, Fillet, Timeline');
      expect(tt('Beibehalten-Geometrie') === 'Preserve Geometry' && tt('Hindernis-Geometrie') === 'Obstacle Geometry' && tt('Startform') === 'Starting Shape' && tt('Sicherheitsfaktor') === 'Safety Factor', 'Generatives Design: Preserve/Obstacle Geometry, Starting Shape, Safety Factor');
      expect(tt('Skizze „Skizze1“ hat kein geschlossenes Profil') === 'Sketch “Sketch1” has no closed profile', 'Kernmeldung mit eingesetztem Namen übersetzt');
      expect(tt('3 Flächen gewählt.') === '3 faces selected.' && tt('1 Fläche gewählt.') === '1 face selected.', 'Mehrzahl im Englischen');
      expect(tt('Extrusion (E)') === 'Extrude (E)' && tt('Fehler im Kern: Fläche nicht mehr gefunden') === 'Error in the kernel: Face no longer found', 'Tastenkürzel und zusammengesetzte Meldungen');
      click('#prefsbtn'); await sleep(200);
      expect(/Language/.test(txt('#prefs')) && /Color scheme/.test(txt('#prefs')) && /Done/.test(txt('#prefs')), 'Einstellungen englisch (Language, Color scheme, Done)');
      await appReloads(() => click('#prefs [data-pref="lang"][data-v="de"]'));
      expect(lang() === 'de' && D.documentElement.lang === 'de', 'zurück auf Deutsch');
      await sleep(300);
      await waitFor(() => /Einheiten mm/.test(q('.status-right').textContent), 6000, 'Statusleiste in Ruhe').catch(() => {}); // mit Grafikkarte zeigt sie beim Zeichnen Bilder/s
      expect(/Einheiten mm · Z zeigt nach oben/.test(q('.status-right').textContent) && /Volumenkörper/.test(q('[data-rtab="solid"]').textContent), 'Deutsch unverändert');
      expect(C.doc.features.length === nF, 'Dokument weiterhin erhalten');
    } finally {
      if (lang() !== 'de') { const p = JSON.parse(W.localStorage.getItem('cc.prefs.test') || '{}'); p.lang = 'de'; W.localStorage.setItem('cc.prefs.test', JSON.stringify(p)); await loadApp(); }
    }
  }],
  ['Einstellungen: dunkles Farbschema und Größe der Oberfläche', async () => {
    const bg = () => W.getComputedStyle(D.body).backgroundColor;
    const light = bg();
    click('#prefsbtn'); await sleep(200);
    expect(q('#prefs') && /Darstellung/.test(q('#prefs').textContent) && /Allgemein/.test(q('#prefs').textContent), 'Einstellungen mit Reitern Darstellung und Allgemein');
    click('#prefs [data-pref="theme"][data-v="dark"]'); await sleep(200);
    expect(D.documentElement.dataset.theme === 'dark' && bg() !== light, `dunkles Schema aktiv (${light} → ${bg()})`);
    const lum = c => { const m = c.match(/\d+/g).map(Number); return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]; };
    expect(lum(bg()) < 60 && lum(W.getComputedStyle(D.body).color) > 180, 'dunkler Hintergrund, helle Schrift');
    expect(JSON.parse(W.localStorage.getItem('cc.prefs.test')).theme === 'dark', 'gespeichert (Prüfstand: eigener Speicher)');
    // Auswahlfeld wie im Feature-Dialog (eigene weiße Regel) und seine Einträge: dunkel mit heller Schrift
    const probe = D.createElement('section'); probe.className = 'dialog'; probe.innerHTML = '<div class="row"><select data-segsel="x"><option>Einfach</option></select></div>';
    D.body.appendChild(probe);
    const sel = probe.querySelector('select'), opt = sel.options[0];
    expect(lum(W.getComputedStyle(sel).backgroundColor) < 60 && lum(W.getComputedStyle(sel).color) > 180, `Auswahlfeld im Dialog dunkel (${W.getComputedStyle(sel).backgroundColor})`);
    expect(lum(W.getComputedStyle(opt).backgroundColor) < 60, `aufgeklappte Einträge dunkel (${W.getComputedStyle(opt).backgroundColor})`);
    probe.remove();
    // Größe: ohne Desktop-Programm Hinweis auf Strg + / −; mit Desktop-Programm Aufruf von /__zoom
    const calls = [], of = W.fetch;
    W.__ccNativeStub = { caps: { dialogs: true, zoom: true, projects: 'C:\\Projekte\\' }, pick: async () => null, read: async () => new ArrayBuffer(0), write: async () => {} };
    W.fetch = (u, o) => { if (String(u).startsWith('/__zoom')) { calls.push(String(u)); return Promise.resolve(new W.Response(null, { status: 204 })); } return of(u, o); };
    try {
      click('#prefs [data-pref="scale"][data-v="1.25"]'); await sleep(200);
      expect(calls.length === 1 && /f=1\.25/.test(calls[0]), `Desktop: Seitenzoom 125 % angefordert (${calls.join(', ')})`);
      expect(q('#prefs [data-pref="scale"][data-v="1.25"]').getAttribute('aria-checked') === 'true', '125 % gewählt');
    } finally { W.fetch = of; delete W.__ccNativeStub; }
    click('#prefs [data-pref="scale"][data-v="1"]'); await sleep(200);
    click('#prefs [data-pftab="general"]'); await sleep(150);
    expect(q('#prefs [data-pref="start"]'), 'Allgemein: Startfenster ein/aus');
    click('#prefs [data-pftab="look"]'); await sleep(150);
    click('#prefs [data-pref="theme"][data-v="light"]'); await sleep(150);
    expect(D.documentElement.dataset.theme === 'light' && bg() === light, 'zurück auf hell');
    click('#prefs [data-pf="close"]'); await sleep(100);
    expect(!D.getElementById('prefs'), 'Fertig schließt');
  }],
  ['Diagnose-Schalter: Statuszeile ohne Messwerte im Alltag', async () => {
    await C.kernel.call('devClearMeshCache');
    await newDoc();
    const text = await (await fetch('fixtures/nist_ctc_01.stp', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'nist_ctc_01.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.mesh && C.lastBuild.mesh.faces.length === 139, 30000, 'STEP importiert');
    await sleep(300);
    const st = () => q('#status-left').textContent, ti = () => q('#status-left').title;
    const logs = [], ol = W.console.log;
    W.console.log = (...a) => { logs.push(a.join(' ')); };
    try {
      expect(/139 Flächen/.test(st()) && !/Netze \d|Import \d|Dauerspeicher|davon/.test(st() + ti()), `aus: nur Körper/Flächen/Zeit (${st()})`);
      // einschalten: dieselbe Zeile sofort mit Messwerten (Import, Netze), Aufteilung im Titel
      click('#prefsbtn'); await sleep(150); click('#prefs [data-pftab="general"]'); await sleep(100);
      const cb = q('#prefs [data-pref="diag"]');
      expect(!cb.checked, 'Diagnose ist standardmäßig aus');
      cb.checked = true; cb.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(150);
      expect(/Import [\d.]+ ms/.test(st()) && /davon/.test(ti()), `an: Messwerte in Zeile und Titel (${st().slice(0, 120)})`);
      expect(JSON.parse(W.localStorage.getItem('cc.prefs.test')).diag === true, 'gespeichert');
      // Bau mit Diagnose schreibt in die Konsole, ohne nicht
      await cmd('solid:create', 'box'); num('w', 10); num('l', 10); num('h', 10); num('cx', 400); await seg('op', 'new'); await ok();
      expect(logs.some(l => /^Bau:/.test(l)) || !/davon/.test(ti()), 'mit Diagnose: Bau in der Konsole (sofern aufgeteilt)');
      cb.checked = false; cb.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(150);
      expect(!/Netze \d|Import \d|davon/.test(st() + ti()), `wieder aus: ohne Messwerte (${st()})`);
      const n = logs.length;
      click('[data-cmd="undo"]'); await built(C.lastBuild, 20000);
      expect(logs.slice(n).every(l => !/^Bau:|Netze verfeinert|Volumen genau/.test(l)), 'ohne Diagnose keine Konsolenausgaben');
      click('#prefs [data-pf="close"]'); await sleep(100);
    } finally { W.console.log = ol; }
    const { importKey } = await import('../src/importkey.js');
    await C.kernel.call('testForgetImport', { keys: [importKey(C.doc.features.find(f => f.type === 'import'))] });
    await C.kernel.call('devClearMeshCache');
  }],
  ['Massenmittelpunkt: nach Masse gewichtet, sichtbare Körper', async () => {
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:create', 'box'); num('w', 10); num('l', 10); num('h', 10); num('cx', 40); await seg('op', 'new'); await ok();
    const ids = C.lastBuild.bodies;
    expect(ids.length === 2, 'zwei Körper');
    const ctr = async id => { const b = await bbox(id); return [0, 1, 2].map(k => (b[0][k] + b[1][k]) / 2); };
    const [A, B] = [await ctr(ids[0]), await ctr(ids[1])];
    click('[data-rtab="solid"]'); await sleep(100);
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="cog"]');
    await waitFor(() => C.cog, 5000, 'Massenmittelpunkt');
    // ohne Material nach Volumen: (8000·A + 1000·B) / 9000
    const exp = (wa, wb) => [0, 1, 2].map(k => (wa * A[k] + wb * B[k]) / (wa + wb));
    let e = exp(8000, 1000);
    near(Math.hypot(...C.cog.p.map((v, k) => v - e[k])), 0, 1e-6, `nach Volumen: X ${e[0].toFixed(3)} Z ${e[2].toFixed(3)}`);
    expect(C.vp.cogG && C.vp.cogG.children.length === 1, 'Symbol im Modell');
    // kleiner Würfel aus Stahl (7,85 g/cm³): 8 g gegen 7,85 g
    const prev = C.cog;
    const sel = () => q(`#browser [data-body="${ids[1]}"]`);
    sel().click(); await sleep(450);  // Einfachklick öffnet die Eigenschaften nach kurzer Wartezeit (Doppelklick = Umbenennen)
    const m2 = q(`#browser select[data-bodyprop="material"][data-id="${ids[1]}"]`); m2.value = 'steel'; m2.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.cog !== prev, 5000, 'neu berechnet');
    e = exp(8, 7.85);
    near(Math.hypot(...C.cog.p.map((v, k) => v - e[k])), 0, 1e-6, `Stahl: X ${e[0].toFixed(3)} (8 g zu 7,85 g)`);
    // kleinen Würfel ausblenden: nur noch der große
    const p2 = C.cog;
    click(`#browser [data-cmd="toggle-body"][data-id="${ids[1]}"]`);
    await waitFor(() => C.cog !== p2, 5000, 'ausgeblendet');
    near(Math.hypot(...C.cog.p.map((v, k) => v - A[k])), 0, 1e-6, 'nur sichtbare Körper zählen');
    click(`#browser [data-cmd="toggle-body"][data-id="${ids[1]}"]`); await sleep(300);
    click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="cog"]'); await sleep(200);
    expect(!C.cog && C.vp.cogG.children.length === 0, 'ausgeschaltet: Symbol weg');
  }],
  ['Fase: zwei Abstände, Abstand und Winkel, Seite tauschen', async () => {
    // Würfel 20 mm, Fase an der oberen Kante entlang X bei y max: weggenommen wird ein Dreieck × 20 mm Länge
    const run = async (setup) => {
      await newDoc(); await box(20, 20, 20);
      const bb0 = C.lastBuild.mesh.bbox;
      await cmd('solid:modify', 'chamfer');
      const E = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.dir[0]) > 0.99 && Math.abs(e.info.p0[1] - bb0[1][1]) < 1e-6 && Math.abs(e.info.p0[2] - bb0[1][2]) < 1e-6);
      pick(E); await setup(); await ok();
      const top = faces().find(x => x.info.type === 'PLANE' && x.info.n[2] > 0.99);
      return { v: await vol(C.lastBuild.bodies[0]), ty: top.info.center[1], st: C.lastBuild.status[C.doc.features[1].id] };
    };
    const a = await run(async () => { await seg('ctype', 'two'); num('distance', 2); num('distance2', 4); });
    near(a.v, 8000 - 0.5 * 2 * 4 * 20, 1e-3, `Zwei Abstände 2/4: 8000 − 80 = 7920 mm³ (${a.st && a.st.error || 'ok'})`);
    const b = await run(async () => { await seg('ctype', 'two'); num('distance', 2); num('distance2', 4); await seg('cflip', 'true'); });
    near(b.v, 7920, 1e-3, 'getauscht: gleiches Volumen');
    near(Math.abs(a.ty - b.ty), 1, 1e-6, 'getauscht: Oberseite 2 mm statt 4 mm kürzer (Mitte um 1 mm verschoben)');
    const c = await run(async () => { await seg('ctype', 'angle'); num('distance', 3); num('angle', 30); });
    near(c.v, 8000 - 0.5 * 3 * 3 * Math.tan(Math.PI / 6) * 20, 1e-3, 'Abstand 3, Winkel 30°: 8000 − ½·3·3·tan 30°·20 = 7948,04 mm³');
    const d = await run(async () => { num('distance', 3); });
    near(d.v, 8000 - 0.5 * 3 * 3 * 20, 1e-3, 'gleicher Abstand 3 wie bisher: 7910 mm³');
  }],
  ['Zeichnung: Hilfsansicht senkrecht auf eine schräge Fläche', async () => {
    await newDoc(); await box(100, 60, 40);
    // Fase 20 mm an der oberen Längskante (y min, z max) → schräge Fläche, in der Seitenansicht eine 45°-Linie
    const bb0 = C.lastBuild.mesh.bbox;
    await cmd('solid:modify', 'chamfer');
    const E = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.dir[0]) > 0.99 && Math.abs(e.info.p0[1] - bb0[0][1]) < 1e-6 && Math.abs(e.info.p0[2] - bb0[1][2]) < 1e-6);
    pick(E); num('distance', 20); await ok();
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    const clickAt = (x, y) => { const s = D.querySelector('#drawing .sheet svg'), pt = s.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(s.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || s).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const sl = C.drawing.last.lines.find(l => l.view === 'left' && Math.abs(Math.abs(l.b[0] - l.a[0]) - 20) < 1e-3 && Math.abs(Math.abs(l.b[1] - l.a[1]) - 20) < 1e-3);
    expect(sl, 'Fase als 45°-Linie in der Seitenansicht');
    click('[data-cmd="drawing-auxview"]'); await sleep(150);
    clickAt((sl.x1 + sl.x2) / 2, (sl.y1 + sl.y2) / 2); await sleep(200);
    const P = C.drawing.last.places.left;
    clickAt(P.px + 70, P.py - 5);
    await waitFor(() => ((C.doc.drawing.sheets || [])[0] || { views: [] }).views.some(v => v.sec && v.sec.aux && v.x !== P.px + 70), 30000, 'Hilfsansicht');
    await sleep(300);
    const ev = C.doc.drawing.sheets[0].views.find(v => v.sec && v.sec.aux), bb = C.drawing.data.views[ev.view].bb;
    const dims = [bb[1][0] - bb[0][0], bb[1][1] - bb[0][1]].sort((a, b) => a - b);
    near(dims[1], 100, 1e-3, 'Hilfsansicht: Länge 100');
    near(dims[0], 100 / Math.SQRT2, 1e-3, 'Hilfsansicht: (60 + 40)/√2 senkrecht zur Fase');
    expect(!C.drawing.data.views[ev.view].hatch, 'keine Schraffur (kein Schnitt)');
    // von außen gesehen: die Fasenfläche (20·√2 breit) hat sichtbare Kanten, nicht nur verdeckte
    const segLens = paths => paths.flatMap(d => { const P = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []).map(Number), out = []; for (let i = 2; i + 1 < P.length; i += 2) out.push(Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1])); return out; });
    expect(segLens(C.drawing.data.views[ev.view].vis).some(l => Math.abs(l - 20 * Math.SQRT2) < 1e-3), 'Fasenfläche sichtbar (Blick von außen)');
    const titles = [...D.querySelectorAll('#drawing .vtitle')].map(t => t.textContent);
    expect(titles.some(t => /^Ansicht B/.test(t)), `Titel „Ansicht B“ (${titles.join(', ')})`);
    expect([...D.querySelectorAll('#drawing .cut .cutlbl')].filter(t => t.textContent === 'B').length === 1, 'Blickpfeil mit Buchstabe B');
    await closeDrawing();
  }],
  ['Zeichnung: Schweißsymbole an Iso- und Normansichten', async () => {
    await openExample('Tischgestell geschweißt');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg g.weld'), 20000, 'Zeichnung mit Schweißsymbolen');
    expect(D.querySelectorAll('#drawing .sheet svg g.weld > g').length === 2, 'zwei Symbole an der Iso-Ansicht');
    click('[data-cmd="dopt-toggle"][data-k="weldStd"]');
    await waitFor(() => q('[data-cmd="dopt-toggle"][data-k="weldStd"]').getAttribute('aria-pressed') === 'true', 4000, 'Umschalter');
    await sleep(800);
    const svg = q('#drawing .sheet svg');
    const bx = el => { const b = el.getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height]; };
    const wt = [...svg.querySelectorAll('g.weld > g text')].map(bx), ot = [...svg.querySelectorAll('text')].filter(t => !t.closest('g.weld')).map(bx);
    expect(svg.querySelectorAll('g.weld > g').length === 2, 'zwei Symbole an den Normansichten');
    expect(!wt.some(a => ot.some(b => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3])), 'keine Überdeckung mit anderen Texten');
    click('[data-cmd="dopt-toggle"][data-k="weldStd"]'); await sleep(500);
    await closeDrawing();
  }],
  ['Blechregelbibliothek: wählen, speichern, löschen', async () => {
    await openExample('Kasten Blech 2mm');
    try { W.localStorage.removeItem('cantcodecad.smrules.test'); } catch (_) { /* egal */ }
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="sm_rule"]');
    await waitFor(() => !D.querySelector('#dialog').hidden && D.querySelector('#dialog [data-rule="lib"]'), 4000, 'Dialog Blechregel');
    const R = k => D.querySelector(`#dialog [data-rule="${k}"]`), set = (k, v, ev = 'input') => { R(k).value = v; R(k).dispatchEvent(new W.Event(ev, { bubbles: true })); };
    set('lib', 'Aluminium 3 mm', 'change');
    expect(R('t').value === '3' && R('r').value === '4.5' && R('k').value === '0.43', `Aluminium 3 mm übernommen (${R('t').value}/${R('r').value}/${R('k').value})`);
    set('name', 'Testregel Alu'); set('k', '0.4');
    expect(R('lib').value === '', 'geänderte Werte: keine Bibliotheksregel mehr');
    click('#dialog [data-cmd="sm-rule-save"]'); await sleep(100);
    expect(R('lib').value === 'Testregel Alu', 'eigene Regel in der Liste gewählt');
    expect(JSON.parse(W.localStorage.getItem('cantcodecad.smrules.test') || '[]').some(x => x.name === 'Testregel Alu' && x.k === 0.4), 'eigene Regel gespeichert');
    const prev = C.lastBuild;
    click('#dialog [data-cmd="sm-rule-ok"]');
    await built(prev, 20000);
    expect(C.doc.sheet.name === 'Testregel Alu' && C.doc.sheet.t === 3, 'Dokument nutzt die Regel');
    click('[data-cmd="sm_rule"]');
    await waitFor(() => !D.querySelector('#dialog').hidden && D.querySelector('#dialog [data-rule="lib"]'), 4000, 'Dialog erneut');
    expect(R('lib').value === 'Testregel Alu' && !D.querySelector('#dialog [data-cmd="sm-rule-del"]').disabled, 'Regel vorgewählt, löschbar');
    click('#dialog [data-cmd="sm-rule-del"]');
    await waitFor(() => D.querySelector('#askbox [data-a="ok"]'), 2000, 'Rückfrage');
    click('#askbox [data-a="ok"]'); await sleep(150);
    expect(!JSON.parse(W.localStorage.getItem('cantcodecad.smrules.test') || '[]').length, 'aus der Bibliothek gelöscht');
    expect(Number(R('t').value) === 3, 'Werte im Dialog bleiben');
    click('#dialog [data-cmd="file-cancel"]'); await sleep(150);
  }],
  ['Blech: Auftrennung an den Ecken einer Schale', async () => {
    await openExample('Schale in Blech umgewandelt 2mm');
    await cmd('sheet:modify', 'sm_rip');
    const corner = e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-9 && [0, 100].some(x => Math.abs(e.info.p0[0] - x) < 1e-6) && [0, 60].some(y => Math.abs(e.info.p0[1] - y) < 1e-6);
    const E = edges().filter(corner);
    expect(E.length === 4, `vier äußere Eckkanten (${E.length})`);
    E.forEach(pick);
    expect(/4 Kanten/.test(q('#dialog').textContent), 'vier Kanten gewählt');
    expect(q('#dialog [data-k="flip"]'), 'Stumpf: Wahl der durchlaufenden Wand');
    await seg('kind', 'miter');
    expect(!D.querySelector('#dialog [data-k="flip"]'), 'Gehrung: keine Wandwahl');
    await seg('kind', 'butt');
    num('gap', 0.5);
    await ok();
    const st = Object.values(C.lastBuild.status).find(x => /aufgetrennt/.test(x.info || ''));
    expect(st && /4 Kanten aufgetrennt/.test(st.info) && !st.warn, `Status: ${st && st.info}`);
    const id = C.lastBuild.bodies[0];
    near(await vol(id), 35712 - 4 * (2 * 0.5 * 38 + 2 * 2.5 * 2), 1e-3, 'Volumen nach Spalt und Eckfreischnitt');
    const u = C.lastBuild.sheet && C.lastBuild.sheet.unfold;
    expect(u && u.faces === 5 && u.nb === 4, `Abwicklung 5 Flächen, 4 Biegungen (${u && u.faces}, ${u && u.nb})`);
  }],
  ['Blech: Abwicklung eines STEP-Blechteils (erst feste Fläche)', async () => {
    // Gekantetes Profil 1,5 mm aus einer STEP-Datei: „Abwicklung erstellen“ ohne Blech-Feature startet „In Blech
    // umwandeln“, nach Fläche + OK erscheint die Abwicklung. Gegenprobe: Abwicklungsfläche × Dicke ≈ Volumen (±2 %).
    // Biegeradius im Kopf aus dem Körper (R 0,5), nicht aus der Blechregel (R 2).
    // Selbstaufbau als Features aus (Einstellungen → Allgemein): hier geht es um den eingelesenen Körper
    const P0 = W.localStorage.getItem('cc.prefs.test');
    W.localStorage.setItem('cc.prefs.test', JSON.stringify({ ...JSON.parse(P0 || '{}'), stepAufbau: false }));
    const lade = async name => {
      await newDoc();
      const text = await (await fetch('fixtures/' + name, { cache: 'no-store' })).text();
      const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
      dt.items.add(new W.File([text], name)); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
      await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1 && C.doc.features.length === 1, 20000, 'STEP importiert');
      await sleep(200);
    };
    const groessteEbene = () => faces().filter(h => h.info.type === 'PLANE').sort((a, b) => flaeche(b.info) - flaeche(a.info))[0];
    const flaeche = f => { const m = C.lastBuild.mesh, P = m.positions, I = m.index; let A = 0; for (let k = f.start; k < f.start + f.count; k += 3) { const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3, u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; A += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; } return A; };
    const abwicklung = async () => { click('[data-rtab="sheet"]'); await sleep(150); click('#ribbon [data-cmd="flat"]'); await sleep(300); };
    await lade('blech-profil.step');
    const k = C.lastBuild.bodies[0], V = await vol(k);
    await abwicklung();
    expect(C.editing && C.editing.feature.type === 'sm_convert', 'ohne Blech-Feature: „In Blech umwandeln“ startet');
    pick(groessteEbene()); await sleep(100);
    click('#dialog [data-cmd="ok"]');
    await waitFor(() => D.body.dataset.mode === 'drawing', 15000, 'Abwicklung erscheint nach OK');
    const kopf = q('#drawing .dtools span').textContent;
    expect(/t 1,5 · R 0,5 · K 0,44 · 4 Biegungen/.test(kopf), `Kopf: Dicke und Radius aus dem Körper (${kopf})`);
    const u = C.lastBuild.sheet.unfold;
    let A = 0; const P = []; u.contour[0].edges.forEach(e => { P.push(e.a); if (e.mid) P.push(e.mid); });
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
    A = Math.abs(A / 2) - u.holes.reduce((s, h) => s + (h.circle ? Math.PI * h.circle.r ** 2 : 0), 0);
    expect(Math.abs(A * 1.5 - V) < 0.02 * V, `Fläche × Dicke ≈ Volumen (${(A * 1.5).toFixed(1)} / ${V.toFixed(1)} mm³)`);
    click('[data-cmd="drawing-close"]'); await sleep(300);
    // Winkel mit angeschweißter Buchse: kein gleich dickes Blech → klare Meldung statt falscher Abwicklung
    await lade('blech-mit-buchse.step');
    pick(groessteEbene()); await sleep(100);
    await abwicklung();
    await waitFor(() => C.doc.features.length === 2 && !C.editing, 15000, 'mit Vorauswahl gleich umgewandelt');
    await sleep(500);
    const cv = C.doc.features[1], st = C.lastBuild.status[cv.id];
    expect(cv.type === 'sm_convert' && st && !st.ok && /kein Blech gleicher Dicke/.test(st.error), `Meldung: ${st && (st.error || st.info)}`);
    expect(D.body.dataset.mode === 'model', 'keine Abwicklung geöffnet');
    if (P0 == null) W.localStorage.removeItem('cc.prefs.test'); else W.localStorage.setItem('cc.prefs.test', P0);
  }],
  ['STEP: Teilenamen und alle Blechteile als DXF-Paket', async () => {
    // Zwei STEP-Dateien mit Produktnamen (eine davon zweimal): die Körper heißen wie in der Datei („Fu\\X\\DF“ = ß),
    // das zweite Profil „Profil-1,5 (2)“. „Alle Blechteile abwickeln“: ein Teil (Profil 1,5 mm, 4 Biegungen,
    // 30 × 50) mit 2 Stück; der Winkel mit angeschweißter Buchse ist kein Blech. Dicke bis 1 mm → kein Teil.
    await newDoc();
    const lade = async (name, n) => {
      const text = await (await fetch('fixtures/' + name, { cache: 'no-store' })).text();
      const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
      dt.items.add(new W.File([text], name)); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
      await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === n, 20000, name + ' importiert');
      await sleep(200);
    };
    await lade('blech-profil.step', 1); await lade('blech-mit-buchse.step', 2); await lade('blech-profil.step', 3);
    const namen = C.lastBuild.bodies.map(id => C.doc.bodies[id].name);
    expect(JSON.stringify(namen) === JSON.stringify(['Profil-1,5', 'Winkel-Fuß-1', 'Profil-1,5 (2)']), `Namen aus der STEP-Datei (${namen.join(', ')})`);
    // Farbe aus der Datei (STYLED_ITEM → COLOUR_RGB 0,2/0,4/0,8 = #3366cc), die Datei ohne Farbe bleibt bei der Vorgabe
    const farben = C.lastBuild.bodies.map(id => C.doc.bodies[id].color || '');
    expect(JSON.stringify(farben) === JSON.stringify(['#3366cc', '', '#3366cc']), `Farben aus der STEP-Datei (${farben.join(', ')})`);
    click('[data-rtab="sheet"]'); await sleep(150); click('[data-menu="sheet:flat"]'); await sleep(150);
    click('#fmenu [data-cmd="flat-all"]');
    await waitFor(() => D.querySelector('#dialog .bptab') || /Kein Blechteil/.test(q('#dialog').textContent), 20000, 'Liste der Blechteile');
    const zeilen = () => [...D.querySelectorAll('#dialog .bptab tbody tr')].map(tr => [...tr.children].slice(1, 7).map(td => td.textContent).join(' | '));
    expect(JSON.stringify(zeilen()) === JSON.stringify(['Profil-1,5 | 2 | 1,5 mm | ohne Material | 30 × 50 | 4']), `ein Blechteil, 2 Stück (${zeilen().join(' / ')})`);
    expect([...D.querySelectorAll('#dialog .bprest li')].some(li => /^Winkel-Fuß-1: kein Blech gleicher Dicke/.test(li.textContent)), 'Winkel mit Buchse: kein Blech');
    const files = C.blechpaket.blechpaketDateien(), dec = new W.TextDecoder();
    expect(JSON.stringify(files.map(f => f.name)) === JSON.stringify(['Profil-1,5_t1.5mm_2x.dxf', 'Blechteile.csv']), `Dateien: ${files.map(f => f.name).join(', ')}`);
    const csv = dec.decode(files[1].data).split('\r\n');
    expect(/ENTITIES/.test(dec.decode(files[0].data)) && csv.length === 2 && csv[1] === '"Profil-1,5";2;1,5;"ohne Material";30;50;4;"Profil-1,5_t1.5mm_2x.dxf"', `DXF und CSV-Zeile (${csv[1]})`);
    expect(!/GRAVUR/.test(dec.decode(files[0].data)), 'ohne Beschriftung kein Text');
    // Teile beschriften: Name, Dicke, Stückzahl als TEXT auf Layer GRAVUR, im Material der Abwicklung (30 × 50)
    const mk = q('#dialog [data-bp="mark"]'); mk.checked = true; mk.dispatchEvent(new W.Event('change', { bubbles: true }));
    const dxf = dec.decode(C.blechpaket.blechpaketDateien()[0].data);
    const tx = /0\r?\nTEXT\r?\n8\r?\nGRAVUR\r?\n10\r?\n([-\d.]+)\r?\n20\r?\n([-\d.]+)\r?\n30\r?\n0\r?\n40\r?\n([\d.]+)\r?\n1\r?\nProfil-1,5 1\.5mm 2x/.exec(dxf);
    expect(!!tx && Number(tx[3]) >= 1 && Number(tx[3]) <= 5, `Beschriftung auf GRAVUR (${tx ? `Höhe ${tx[3]} bei ${tx[1]} | ${tx[2]}` : 'fehlt'})`);
    mk.checked = false; mk.dispatchEvent(new W.Event('change', { bubbles: true }));
    // Werkstoff je Dicke: 1,5 mm = Edelstahl → Tabelle, Dateiname, CSV
    const ws = q('#dialog [data-bp="mat"][data-t="1.50"]'); ws.value = 'stainless'; ws.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(50);
    const f2 = C.blechpaket.blechpaketDateien(), csv2 = dec.decode(f2[1].data).split('\r\n');
    expect(/\| Edelstahl \|/.test(zeilen()[0]) && f2[0].name === 'Profil-1,5_t1.5mm_Edelstahl_2x.dxf' && /;"Edelstahl";/.test(csv2[1]), `Edelstahl in Tabelle, Datei und CSV (${f2[0].name})`);
    const t = q('#dialog [data-bp="tmax"]'); t.value = '1'; t.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    expect(!D.querySelector('#dialog .bptab') && [...D.querySelectorAll('#dialog .bprest li')].some(li => /dicker als 1 mm/.test(li.textContent)), 'Dicke bis 1 mm: Profil zu dick');
    const t2 = q('#dialog [data-bp="tmax"]'); t2.value = '25'; t2.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    click('#dialog [data-cmd="bp-zeige"][data-i="0"]'); await sleep(300);
    expect(D.body.dataset.mode === 'drawing' && /Profil-1,5 · 2 Stück/.test(q('#drawing .dtools').textContent) && q('#dialog').hidden, 'Ansehen: Abwicklung mit Name und Stückzahl');
    click('[data-cmd="drawing-close"]'); await sleep(200);
    // „In Verschachtelung“: Teil mit Stückzahl 2 und Dicke 1,5 (auf 0,01 gerundet) in der Tafelgruppe 1,5 mm
    click('[data-rtab="sheet"]'); await sleep(150); click('[data-menu="sheet:flat"]'); await sleep(150);
    click('#fmenu [data-cmd="flat-all"]');
    await waitFor(() => D.querySelector('#dialog .bptab'), 20000, 'Liste der Blechteile');
    click('#dialog [data-cmd="bp-nest"]');
    await waitFor(() => D.body.dataset.mode === 'nesting' && D.querySelector('#nesting tr[data-pid]'), 5000, 'Verschachtelung');
    const nz = [...D.querySelectorAll('#nesting tr[data-pid]')];
    const werte = nz.map(tr => [tr.children[0].textContent.trim(), ...[...tr.querySelectorAll('input')].map(i => i.value)].join(' | '));
    expect(nz.length === 1 && /^Profil-1,5 \| 1\.5 \| .* \| 2$/.test(werte[0]), `ein Teil mit 2 Stück (${werte.join(' / ')})`);
    expect([...D.querySelectorAll('#nesting [data-n="group"]')].some(b => /^1,5 mm · Edelstahl \(2 Stück\)/.test(b.textContent)), 'Tafelgruppe 1,5 mm Edelstahl');
    W.localStorage.removeItem('cc.blechpaket.mat');
    click('[data-cmd="nest-close"]'); await sleep(300);
  }],
  ['STEP-Baugruppe: Komponenten je Teil, Komponente bearbeiten', async () => {
    // Eine STEP-Datei aus drei Teilen (Profil, Profil, Winkel – zwei Fixtures, Nummern versetzt in einem DATA-Teil):
    // Komponente „baugruppe“ mit „Profil-1,5“, „Profil-1,5 (2)“ und „Winkel-Fuß-1“, je ein Körper.
    const texte = await Promise.all(['blech-profil.step', 'blech-profil.step', 'blech-mit-buchse.step'].map(async n => (await fetch('fixtures/' + n, { cache: 'no-store' })).text()));
    const daten = (t, off) => t.slice(t.indexOf('DATA;') + 5, t.lastIndexOf('ENDSEC;', t.indexOf('END-ISO'))).replace(/#(\d+)/g, (_, n) => '#' + (Number(n) + off));
    const step = texte[0].slice(0, texte[0].indexOf('DATA;') + 5) + texte.map((t, i) => daten(t, i * 100000)).join('\n') + 'ENDSEC;\nEND-ISO-10303-21;\n';
    await newDoc();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([step], 'baugruppe.step')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 3 && (C.doc.components || []).length === 4, 30000, 'Baugruppe mit Komponenten');
    const cs = C.doc.components, oben = cs.find(c => !c.parent);
    const teile = cs.filter(c => c.parent === oben.id).map(c => `${c.name}:${c.bodies.length}`).sort();
    expect(oben.name === 'baugruppe' && JSON.stringify(teile) === JSON.stringify(['Profil-1,5 (2):1', 'Profil-1,5:1', 'Winkel-Fuß-1:1']), `Komponenten: ${oben.name} → ${teile.join(', ')}`);
    // Bearbeiten: aktiv, Leiste mit Pfad, Fertig → oberste Ebene
    const w = cs.find(c => c.name === 'Winkel-Fuß-1');
    const zeile = D.querySelector(`#browser [data-comp="${w.id}"]`);
    zeile.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 })); await sleep(100);
    click(`[data-cmd="comp-edit"][data-id="${w.id}"]`); await sleep(300);
    expect(C.doc.activeComp === w.id && /Komponente bearbeiten: baugruppe \/ Winkel-Fuß-1/.test(q('#compbar').textContent) && !q('#compbar').hidden, 'Bearbeiten: aktiv, Leiste zeigt den Pfad');
    // neues Feature landet in der Komponente
    await cmd('solid:create', 'box'); num('w', 5); num('l', 5); num('h', 5); num('cx', 300); await seg('op', 'new'); await ok();
    const imp = C.doc.features.find(f => f.type === 'import').id, neu = C.lastBuild.bodies.find(id => !id.startsWith(imp + ':'));
    const wJetzt = C.doc.components.find(c => c.id === w.id);
    expect(!!neu && wJetzt.bodies.includes(neu), `neuer Körper in der bearbeiteten Komponente (${neu} → ${wJetzt.bodies.join(', ')})`);
    click('#compbar [data-cmd="comp-activate"]'); await sleep(200);
    expect(!C.doc.activeComp && q('#compbar').hidden, 'Fertig: oberste Ebene, Leiste weg');
    // Als eigenes Teil: ein Körper als STEP-Import im neuen Bauteil, untere Ecke am Ursprung, Name und Farbe bleiben
    const pc = C.doc.components.find(c => c.name === 'Profil-1,5'), wKoerper = pc.bodies[0];
    const wb = C.lastBuild.mesh.bodies.find(b => b.id === wKoerper), vW = await vol(wKoerper);
    const r = await C.compAlsTeil(pc.id), tf = r.doc.features[0];
    expect(r.name === 'Profil-1,5' && r.doc.kind === 'part' && r.doc.features.length === 1 && tf.type === 'import' && (tf.data.match(/MANIFOLD_SOLID_BREP/g) || []).length === 1, 'neues Bauteil mit einem STEP-Import (ein Festkörper)');
    expect([tf.dx, tf.dy, tf.dz].every((v, k) => Math.abs(v + wb.bbox[0][k]) < 1e-9) && r.doc.bodies[tf.id] && r.doc.bodies[tf.id].name === 'Profil-1,5' && r.doc.bodies[tf.id].color === '#3366cc', `an den Ursprung geschoben, Name und Farbe übernommen (${[tf.dx, tf.dy, tf.dz].map(v => v.toFixed(3))} / ${wb.bbox[0].map(v => v.toFixed(3))}, ${JSON.stringify(r.doc.bodies)})`);
    const res = await C.kernel.build(r.doc.features, undefined, { hidden: [], components: [], inserts: [], sheet: {} });
    const nb = res.mesh.bodies[0];
    expect(res.bodies.length === 1 && nb.bbox[0].every(v => Math.abs(v) < 1e-3), `gebaut: 1 Körper, Ecke bei 0 (${nb.bbox[0].map(v => v.toFixed(3))})`);
    near(nb.volume || 0, vW, 1e-2, 'Volumen wie in der Baugruppe');
  }],
  ['STEP-Baugruppe: Unterbaugruppen als Komponenten-Ebenen', async () => {
    // Von Hand gebaute Baugruppe um die zwei Fixtures: „Baugruppe-Test“ ⊃ „Gruppe-A“ (Profil zweimal, das zweite um
    // 100 mm in X versetzt) und der Winkel. Erwartet: Datei-Komponente → „Gruppe-A“ mit „Profil-1,5“ und „Profil-1,5 (2)“,
    // daneben „Winkel-Fuß-1“; die beiden Profile liegen 100 mm auseinander.
    const [tp, tw] = await Promise.all(['blech-profil.step', 'blech-mit-buchse.step'].map(async n => (await fetch('fixtures/' + n, { cache: 'no-store' })).text()));
    const daten = (t, off) => t.slice(t.indexOf('DATA;') + 5, t.lastIndexOf('ENDSEC;', t.indexOf('END-ISO'))).replace(/#(\d+)/g, (_, n) => '#' + (Number(n) + off));
    const ctx = /#10 = ADVANCED_BREP_SHAPE_REPRESENTATION\('',\(#11,#15\),#(\d+)\)/.exec(tp)[1];
    // Einbau: CDSR mit Lage von item1 (Platzierung im Teil) nach item2 (Platzierung in der Baugruppe)
    const einbau = (id, nauo, oben, unten, repTeil, achseTeil, repOben, achseOben) => [
      `#${id} = NEXT_ASSEMBLY_USAGE_OCCURRENCE('${nauo}','','',#${oben},#${unten},$);`,
      `#${id + 1} = PRODUCT_DEFINITION_SHAPE('','',#${id});`,
      `#${id + 2} = CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${id + 3},#${id + 1});`,
      `#${id + 3} = ( REPRESENTATION_RELATIONSHIP('','',#${repTeil},#${repOben}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${id + 4}) SHAPE_REPRESENTATION_RELATIONSHIP() );`,
      `#${id + 4} = ITEM_DEFINED_TRANSFORMATION('','',#${achseTeil},#${achseOben});`];
    const produkt = (id, name, achsen) => [
      `#${id} = PRODUCT('${name}','${name}','',(#8));`, `#${id + 1} = PRODUCT_DEFINITION_FORMATION('','',#${id});`,
      `#${id + 2} = PRODUCT_DEFINITION('design','',#${id + 1},#9);`, `#${id + 3} = PRODUCT_DEFINITION_SHAPE('','',#${id + 2});`,
      `#${id + 4} = SHAPE_REPRESENTATION('',(${achsen.map(a => '#' + a).join(',')}),#${ctx});`, `#${id + 5} = SHAPE_DEFINITION_REPRESENTATION(#${id + 3},#${id + 4});`];
    const zus = [
      '#300100 = AXIS2_PLACEMENT_3D(\'\',#12,#13,#14);', '#300101 = AXIS2_PLACEMENT_3D(\'\',#300102,#13,#14);', '#300102 = CARTESIAN_POINT(\'\',(100.,0.,0.));',
      ...produkt(300000, 'Gruppe-A', [300100, 300101]),
      '#300110 = AXIS2_PLACEMENT_3D(\'\',#12,#13,#14);',
      ...produkt(300010, 'Baugruppe-Test', [300110]),
      ...einbau(300200, 'P1', 300002, 5, 10, 11, 300004, 300100),
      ...einbau(300210, 'P2', 300002, 5, 10, 11, 300004, 300101),
      ...einbau(300220, 'G1', 300012, 300002, 300004, 300100, 300014, 300110),
      ...einbau(300230, 'W1', 300012, 100005, 100010, 100011, 300014, 300110)];
    const step = tp.slice(0, tp.indexOf('DATA;') + 5) + daten(tp, 0) + daten(tw, 100000) + zus.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
    await newDoc();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([step], 'unterbaugruppen.step')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    // erst eingelesen, dann neu gebaut: das zweite Profil ist eine Instanz (Kopie „Instanz~Original“) statt eines eigenen Körpers
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 3 && C.lastBuild.bodies.some(id => id.includes('~')) && (C.doc.components || []).some(c => c.instanz && c.bodies.length), 30000, 'Baugruppe mit Instanz');
    await sleep(200);
    const cs = C.doc.components, name = id => cs.find(c => c.id === id).name;
    const baum = cs.map(c => `${c.parent ? name(c.parent) + ' / ' : ''}${c.name}:${c.bodies.length}`).sort();
    expect(JSON.stringify(baum) === JSON.stringify(['Gruppe-A / Profil-1,5 (2):1', 'Gruppe-A / Profil-1,5:1', 'unterbaugruppen / Gruppe-A:0', 'unterbaugruppen / Winkel-Fuß-1:1', 'unterbaugruppen:0']), `Baum: ${baum.join(' | ')}`);
    const k1 = cs.find(c => c.name === 'Profil-1,5'), k2 = cs.find(c => c.name === 'Profil-1,5 (2)');
    expect(!k1.instanz && k2.instanz && k2.instanz.von === k1.id && k2.bodies[0] === `${k2.id}~${k1.bodies[0]}`, 'Profil (2) ist Instanz des ersten Profils');
    expect(C.doc.bodies[k2.bodies[0]].name === C.doc.bodies[k1.bodies[0]].name && C.doc.bodies[k2.bodies[0]].color === '#3366cc', 'Instanz hat Name und Farbe des Originals');
    const bb = id => C.lastBuild.mesh.bodies.find(b => b.id === id).bbox;
    near(Math.abs(bb(k2.bodies[0])[0][0] - bb(k1.bodies[0])[0][0]), 100, 1e-3, 'Instanz 100 mm versetzt');
    near(await vol(k2.bodies[0]), await vol(k1.bodies[0]), 1e-3, 'Instanz hat das Volumen des Originals');
    /* Browser: Komponenten aufklappbar (oberste Ebene offen, darunter zu); eine Fläche in der Ansicht anklicken
       markiert die Körperzeile und klappt den Pfad auf (Datei-Komponente → Gruppe-A → Profil-1,5 fett) */
    const fold = id => D.querySelector(`#browser details[data-compfold="${id}"]`), oben = cs.find(c => !c.parent), ga = cs.find(c => c.name === 'Gruppe-A');
    expect(fold(oben.id) && fold(oben.id).open && fold(ga.id) && !fold(ga.id).open && !fold(k1.id).open, 'Baum: oberste Ebene offen, Gruppe-A zu');
    const mbi = C.lastBuild.mesh.bodies.findIndex(b => b.id === k1.bodies[0]);
    pick(faces().find(h => h.info.body === mbi)); await sleep(200);
    const selRow = D.querySelector('#browser .b-row.sel');
    const pfad = [...D.querySelectorAll('#browser .b-row.pfad')].map(r => r.textContent.trim());
    expect(selRow && selRow.dataset.body === k1.bodies[0] && fold(ga.id).open && fold(k1.id).open, 'Auswahl markiert den Körper und klappt Gruppe-A und Profil-1,5 auf');
    expect(JSON.stringify(pfad) === JSON.stringify(['unterbaugruppen', 'Gruppe-A', 'Profil-1,5']), `Pfad hervorgehoben: ${pfad.join(' → ')}`);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150);
    expect(!D.querySelector('#browser .b-row.sel'), 'Esc hebt die Markierung auf');
    // durchsichtig und am Kopf verschiebbar; Doppelklick auf den Kopf setzt ihn zurück
    const Bw = q('#browser'), kopf = q('#browser > .b-head'), r0 = Bw.getBoundingClientRect();
    expect(W.getComputedStyle(Bw).backgroundColor === 'rgba(0, 0, 0, 0)', 'Browser-Hintergrund durchsichtig');
    const pe = (t, x, y) => (t === 'pointerdown' ? kopf : W).dispatchEvent(new W.PointerEvent(t, { pointerId: 3, button: 0, clientX: x, clientY: y, bubbles: true }));
    pe('pointerdown', r0.left + 30, r0.top + 8); pe('pointermove', r0.left + 110, r0.top + 68); pe('pointerup', r0.left + 110, r0.top + 68); await sleep(50);
    const r1 = Bw.getBoundingClientRect();
    near(r1.left - r0.left, 80, 0.5, 'Browser 80 px nach rechts gezogen'); near(r1.top - r0.top, 60, 0.5, 'und 60 px nach unten');
    expect(/"x":80,"y":60/.test(W.localStorage.getItem('cc.browser') || ''), 'Lage gemerkt');
    kopf.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); await sleep(50);
    near(Bw.getBoundingClientRect().left, r0.left, 0.5, 'Doppelklick auf den Kopf: zurück an den Rand');
    // „Bearbeiten“ an der Instanz bearbeitet das Original; im Browser ist sie markiert
    expect(!!D.querySelector(`#browser [data-comp="${k2.id}"] .b-inst`), 'Instanz im Browser markiert (↻)');
    D.querySelector(`#browser [data-comp="${k2.id}"]`).dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 })); await sleep(100);
    click(`[data-cmd="comp-edit"][data-id="${k2.id}"]`); await sleep(300);
    expect(C.doc.activeComp === k1.id && /Profil-1,5$/.test(q('#compbar b').textContent), `Bearbeiten an der Instanz aktiviert das Original (${q('#compbar b').textContent})`);
    click('#compbar [data-cmd="comp-activate"]'); await sleep(200);
    // Änderung am Original gilt für die Instanz: Original 10 mm nach oben → Instanz ebenso
    const z0 = bb(k2.bodies[0])[0][2];
    await C.aiRun('feature_anlegen', { feature: { type: 'move', comps: [], bodies: [k1.bodies[0]], dx: 0, dy: 0, dz: 10, axis: 'Z', angle: 0, px: 0, py: 0, pz: 0, copy: false } });
    await sleep(300);
    near(bb(k2.bodies[0])[0][2] - z0, 10, 1e-3, 'Instanz folgt dem Original (+10 in Z)');
    // nur die Instanz verschieben (Einbaulage): +20 in X → 120 mm vom Original, das Original bleibt
    const x1 = bb(k1.bodies[0])[0][0];
    await C.aiRun('feature_anlegen', { feature: { type: 'move', comps: [k2.id], bodies: [], dx: 20, dy: 0, dz: 0, axis: 'Z', angle: 0, px: 0, py: 0, pz: 0, copy: false } });
    await sleep(300);
    const mv = C.doc.features[C.doc.features.length - 1];
    expect(C.lastBuild.status[mv.id] && C.lastBuild.status[mv.id].ok, `Verschieben der Instanz ohne Fehler (${JSON.stringify(C.lastBuild.status[mv.id])})`);
    near(bb(k2.bodies[0])[0][0] - bb(k1.bodies[0])[0][0], 120, 1e-3, 'Instanz allein 20 mm weiter');
    near(bb(k1.bodies[0])[0][0], x1, 1e-6, 'Original bleibt stehen');
    // Instanz um 90° um Z drehen, Drehpunkt ihre untere Ecke p: danach x ∈ [p.x − Breite_y, p.x], y ∈ [p.y, p.y + Breite_x]
    const B0 = bb(k2.bodies[0]), p = B0[0], ex = B0[1][0] - B0[0][0], ey = B0[1][1] - B0[0][1];
    await C.aiRun('feature_anlegen', { feature: { type: 'move', comps: [k2.id], bodies: [], dx: 0, dy: 0, dz: 0, axis: 'Z', angle: 90, px: p[0], py: p[1], pz: p[2], copy: false } });
    await sleep(300);
    const B1 = bb(k2.bodies[0]);
    expect([B1[0][0] - (p[0] - ey), B1[1][0] - p[0], B1[0][1] - p[1], B1[1][1] - (p[1] + ex)].every(v => Math.abs(v) < 1e-3), `90° um Z: x ${B1[0][0].toFixed(3)}…${B1[1][0].toFixed(3)}, y ${B1[0][1].toFixed(3)}…${B1[1][1].toFixed(3)}`);
    near(bb(k1.bodies[0])[0][0], x1, 1e-6, 'Original bleibt auch beim Drehen stehen');
    // Gelenk an einer Instanz: Quader 40 × 40 × 10 am Ursprung, starres Gelenk von einer ebenen Fläche der
    // Instanz auf seine Oberseite → die Fläche liegt danach auf (20|20|10), Normale (0|0|−1); das Original bleibt
    const qs = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 40, y1: 40 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: qs.id, profiles: null, distance: 10, direction: 'normal', op: 'new' } });
    await sleep(300);
    const quader = C.lastBuild.bodies.find(id => !id.includes('~') && !id.startsWith(C.doc.features.find(f => f.type === 'import').id) && !C.doc.components.some(c => c.bodies.includes(id)));
    const mb = C.lastBuild.mesh.bodies, fl = (bid, pred) => { const i = mb.findIndex(b => b.id === bid); return C.lastBuild.mesh.faces.find(f => f.body === i && f.type === 'PLANE' && pred(f)); };
    const fIn = fl(k2.bodies[0], () => true), fQ = fl(quader, f => f.n[2] > 0.999);
    const ref = f => ({ t: 'PLANE', n: f.n, dist: f.dist, p: f.center });
    const xOrig = bb(k1.bodies[0])[0];
    await C.aiRun('feature_anlegen', { feature: { type: 'joint', kind: 'rigid', comp: k2.id, o1: { kind: 'face', ref: ref(fIn), body: k2.bodies[0] }, o2: { kind: 'face', ref: ref(fQ), body: quader }, angle: 0, offset: 0, flip: false } });
    await sleep(400);
    const gl = C.doc.features[C.doc.features.length - 1], gs = C.lastBuild.status[gl.id];
    expect(gs && gs.ok, `Gelenk an der Instanz gebaut (${JSON.stringify(gs)})`);
    const liegt = () => fl(k2.bodies[0], f => f.n[2] < -0.999 && Math.abs(f.center[2] - 10) < 1e-3 && Math.hypot(f.center[0] - 20, f.center[1] - 20) < 1e-3);
    expect(!!liegt(), 'Instanz-Fläche liegt mittig auf dem Quader (20|20|10), Normale nach unten');
    expect(bb(k1.bodies[0])[0].every((v, k) => Math.abs(v - xOrig[k]) < 1e-6), 'Original bleibt beim Gelenk stehen');
    // Stückliste: Instanz zählt beim Original → „Profil-1,5“ 2 Stück, „Winkel-Fuß-1“ 1 Stück
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="bom"]'); await sleep(300);
    const bz = [...D.querySelectorAll('#dialog .bomtab tbody tr')].map(tr => [...tr.children].slice(1, 3).map(td => td.textContent).join(' × '));
    expect(JSON.stringify(bz.sort()) === JSON.stringify(['1 × Winkel-Fuß-1', '2 × Profil-1,5']), `Stückliste: ${bz.join(' | ')}`);
    click('#dialog [data-cmd="file-cancel"]'); await sleep(150);
    /* Ältere Datei (Import von vor der Gruppierung): keine Komponenten, kein Merker am Import → beim Öffnen wird die
       Struktur aus der STEP-Datei einmal nachgeholt, derselbe Baum entsteht */
    const alt = JSON.parse(W.localStorage.getItem('cantcodecad.doc.test'));
    const impA = alt.features.find(f => f.type === 'import');
    delete impA.komp; delete impA.ohne; alt.components = []; delete alt.activeComp;
    alt.features = alt.features.filter(f => f.type === 'import');
    Object.keys(alt.bodies || {}).forEach(id => { if (!id.startsWith(impA.id + ':')) delete alt.bodies[id]; });
    W.localStorage.setItem('cantcodecad.doc.test', JSON.stringify(alt));
    await loadApp();
    await waitFor(() => (C.doc.components || []).length === 5 && C.lastBuild && C.lastBuild.bodies.some(id => id.includes('~')), 30000, 'Gruppierung nachgeholt');
    const cs2 = C.doc.components, nm2 = id => cs2.find(c => c.id === id).name;
    const baum2 = cs2.map(c => `${c.parent ? nm2(c.parent) + ' / ' : ''}${c.name}:${c.bodies.length}`).sort();
    expect(JSON.stringify(baum2) === JSON.stringify(baum) && C.doc.features.find(f => f.type === 'import').komp, `ältere Datei: Baum nachgeholt (${baum2.join(' | ')})`);
  }],
  ['Blech: Auftrennung an einer Fläche', async () => {
    // Schale 100 × 60 × 40, t 2 (35 712 mm³). Vorderwand (außen y = 0) anklicken → Wand 100 × 2 × 40 samt Ecken fällt weg:
    // 35 712 − 8 000 = 27 712. Abwicklung danach: Boden + drei Wände, drei Biegungen.
    await openExample('Schale in Blech umgewandelt 2mm');
    const id = C.lastBuild.bodies[0];
    await cmd('sheet:modify', 'sm_rip');
    await seg('mode', 'face');
    expect(!D.querySelector('#dialog [data-k="gap"]'), 'Fläche: kein Spalt');
    const vorn = faces().find(h => h.info.type === 'PLANE' && h.info.n[1] < -0.99 && Math.abs(h.info.center[1]) < 1e-6);
    expect(!!vorn, 'Außenfläche vorn gefunden');
    pick(vorn); await sleep(100);
    expect(/Fläche gewählt/.test(q('#dialog').textContent), 'Fläche gewählt');
    await ok();
    near(await vol(id), 35712 - 8000, 1e-3, 'Vorderwand 100 × 2 × 40 entfernt');
    const st = Object.values(C.lastBuild.status).find(x => /Wand an der Fläche entfernt/.test(x.info || ''));
    expect(st && /Dicke 2 mm/.test(st.info), `Status: ${st && st.info}`);
    const u = C.lastBuild.sheet && C.lastBuild.sheet.unfold;
    expect(u && u.faces === 4 && u.nb === 3, `Abwicklung 4 Flächen, 3 Biegungen (${u && u.faces}, ${u && u.nb})`);
  }],
  ['Blech: Auftrennung zwischen zwei Punkten', async () => {
    await openExample('Schale mit Auftrennung zwischen zwei Punkten 2mm');
    const id = C.lastBuild.bodies[0];
    // Schale 100 × 60 × 40 mit t 2 (35712 mm³), Schlitz 2 breit durch die Vorderwand, 30 mm lang
    const vRip = 35712 - 2 * 2 * 32;
    let v0 = 0;
    for (let i = 0; i < 30; i++) {
      v0 = await vol(id);
      if (Math.abs(v0 - vRip) < 1e-3) break;
      await sleep(100);
    }
    near(v0, vRip, 1e-3, 'Schlitz 2 × 2 × 32 abgezogen');
    const st = Object.values(C.lastBuild.status).find(x => /Auftrennung zwischen zwei Punkten/.test(x.info || ''));
    expect(st && /über 30 mm, Spalt 2 mm/.test(st.info) && !st.warn, `Status: ${st && st.info}`);
    const u = C.lastBuild.sheet && C.lastBuild.sheet.unfold;
    expect(u && u.faces === 5 && u.nb === 4, `Abwicklung 5 Flächen, 4 Biegungen (${u && u.faces}, ${u && u.nb})`);
    expect(u.holes.length === 1, `Schlitz als Loch in der Abwicklung (${u.holes.length})`);
    const rip = C.doc.features.findIndex(f => f.type === 'sm_rip');
    editTimeline(rip);
    expect(q('#dialog select[data-segsel="mode"]').value === 'points', 'Art steht auf zwei Punkte');
    expect(!D.querySelector('#dialog [data-k="kind"]'), 'zwei Punkte: keine Wandwahl');
    num('gap', 4);
    // die Auftrennung rechnet erst nach OK (Kanten- und Punktbezüge gelten für den Stand davor)
    await ok();
    near(await vol(id), 35712 - 4 * 2 * 32, 1e-3, 'Spalt 4: der Schlitz ist doppelt so breit');
    const st2 = (C.lastBuild.status || {})[C.doc.features[rip].id];
    expect(st2 && /Spalt 4 mm/.test(st2.info || ''), `Status nach dem Ändern: ${st2 && (st2.info || st2.error)}`);
    // Versatz: je 5 mm von beiden Punkten → Schnitt 20 mm statt 30 + 2 × 1 mm Überlauf
    editTimeline(rip); await sleep(400);
    num('off1', 5); num('off2', 5); await ok();
    near(await vol(id), 35712 - 4 * 2 * 20, 1e-3, 'Versatz 5/5: Schlitz 4 × 2 × 20');
    const st3 = (C.lastBuild.status || {})[C.doc.features[rip].id];
    expect(st3 && /Schnitt 20 mm/.test(st3.info || ''), `Status mit Versatz: ${st3 && (st3.info || st3.error)}`);
    // negativer Versatz verlängert: −3 an Punkt 1 → 30 + 3 + 1 (Überlauf an Punkt 2) = 34 mm
    editTimeline(rip); await sleep(400);
    num('off1', -3); num('off2', 0); await ok();
    near(await vol(id), 35712 - 4 * 2 * 34, 1e-3, 'Versatz −3/0: Schlitz 34 mm');
  }],
  ['Blech: Abwickeln und Zurückfalten', async () => {
    await openExample('Winkelblech gebogen 2mm');
    const id = C.lastBuild.bodies[0], v0 = await vol(id);
    await cmd('sheet:modify', 'sm_unfold');
    const F = faces().find(f => f.info.type === 'PLANE' && f.info.n[2] < -0.99 && Math.abs(f.info.center[2]) < 1e-6);
    expect(F, 'Unterseite gefunden');
    pick(F);
    expect(/Ebene Fläche/.test(q('#dialog').textContent), 'feste Fläche gewählt');
    await ok();
    const bb = (await C.kernel.props(id)).bbox;
    expect(Math.abs(bb[1][2] - bb[0][2] - 2) < 1e-6, `flach: Höhe = Blechdicke (${(bb[1][2] - bb[0][2]).toFixed(3)})`);
    expect(Math.abs(bb[1][0] - bb[0][0] - 100) < 0.5 || Math.abs(bb[1][1] - bb[0][1] - 100) < 0.5, 'flache Länge ≈ 100 mm');
    await cmd('sheet:modify', 'sm_refold');
    await ok();
    const st = Object.values(C.lastBuild.status).find(x => /zurückgefaltet/.test(x.info || ''));
    expect(st && /keine Schnitte/.test(st.info), `Status: ${st && st.info}`);
    near(await vol(id), v0, 1e-3, 'Volumen wie vor dem Abwickeln');
  }],
  ['Blech: nur eine Biegung abwickeln', async () => {
    await openExample('U-Profil mit einer abgewickelten Biegung 2mm');
    const id = C.lastBuild.bodies[0];
    // U-Profil 80 × 60 × 30, t 2, innen r 2: linke Biegung flach, rechte Wand bleibt stehen
    const waitVol = async want => { let v = 0; for (let i = 0; i < 30; i++) { v = await vol(id); if (Math.abs(v - want) < 1e-2) break; await sleep(100); } return v; };
    near(await waitVol(15851.506), 15851.506, 1e-2, 'Volumen des teilweise abgewickelten Blechs');
    let bb = await bbox(id);
    expect(bb[0][0] < -26 && bb[1][2] - bb[0][2] > 29, `linke Wand flach, rechte Wand steht (x ${bb[0][0].toFixed(2)}, Höhe ${(bb[1][2] - bb[0][2]).toFixed(2)})`);
    const st = () => Object.values(C.lastBuild.status).find(x => /Biegungen abgewickelt/.test(x.info || ''));
    expect(st() && /1 von 2 Biegungen abgewickelt, 1 stehen gelassen/.test(st().info), `Status: ${st() && st().info}`);
    editTimeline(C.doc.features.findIndex(f => f.type === 'sm_unfold')); await sleep(300);
    expect(/1 Biegung gewählt/.test(q('#dialog').textContent), 'Dialog zeigt die gewählte Biegung');
    expect(D.querySelector('#dialog [data-k="bends"][data-v="some"]').getAttribute('aria-checked') === 'true', '„nur ausgewählte“ steht an');
    // alle Biegungen: dasselbe Blech liegt komplett flach
    await seg('bends', 'all');
    near(await waitVol(15828.887), 15828.887, 1e-2, 'Volumen der vollen Abwicklung');
    bb = await bbox(id);
    expect(Math.abs(bb[1][2] - bb[0][2] - 2) < 1e-6, `flach: Höhe = Blechdicke (${(bb[1][2] - bb[0][2]).toFixed(3)})`);
    // ohne Auswahl darf nichts abgewickelt werden, OK bleibt zu
    await seg('bends', 'some');
    near(await waitVol(15874.126), 15874.126, 1e-2, 'ohne gewählte Biegung bleibt das Blech gefaltet');
    click('#dialog [data-cmd="ok"]'); await sleep(250);
    expect(!D.querySelector('#dialog').hidden && /Erst eine Biegung anklicken/.test((D.querySelector('.toast') || {}).textContent || ''), 'ohne Biegung kommt der Hinweis');
    // Biegung im Modell anklicken (auch die Biegefläche auf der anderen Blechseite zählt)
    const cy = r => faces().find(f => f.info.type === 'CYLINDRE' && Math.abs(f.info.radius - 4) < 1e-3 && (r ? f.info.center[0] > 60 : f.info.center[0] < 20));
    pick(cy(false));
    near(await waitVol(15851.506), 15851.506, 1e-2, 'linke Biegung abgewickelt');
    expect(/1 von 2 Biegungen abgewickelt/.test((st() || {}).info || ''), `Status: ${(st() || {}).info}`);
    pick(cy(true));
    near(await waitVol(15828.887), 15828.887, 1e-2, 'beide Biegungen abgewickelt');
    await ok();
    expect(D.querySelector('#dialog').hidden, 'Dialog geschlossen');
    near(await vol(id), 15828.887, 1e-2, 'abgewickeltes Blech bleibt nach OK flach');
  }],
  ['Blech: Übergangslasche Rechteck auf Rund', async () => {
    await openExample('Übergang Rechteck auf Rund 2mm');
    const u0 = C.lastBuild.sheet && C.lastBuild.sheet.unfold;
    expect(u0 && u0.nb === 20 && u0.faces === 21, `Beispiel: 21 Facetten, 20 Biegelinien (${u0 && u0.faces}, ${u0 && u0.nb})`);
    // die Lasche neu anlegen: Dialog wählt die beiden letzten Skizzen
    C.doc.features = C.doc.features.filter(f => f.type === 'sketch');
    await cmd('sheet:create', 'sm_loft');
    const sel = k => D.querySelector(`#dialog select[data-segsel="${k}"]`);
    expect(sel('skA') && sel('skB') && sel('skA').value !== sel('skB').value, 'zwei verschiedene Profile vorgewählt');
    expect(q('#dialog input[data-k="facets"]'), 'Facetten je 90° bei Abkanten');
    await seg('mode', 'formed');
    expect(!D.querySelector('#dialog input[data-k="facets"]'), 'gerollt: keine Facettenzahl');
    await seg('mode', 'brake');
    num('facets', 2);
    await ok();
    const st = Object.values(C.lastBuild.status).find(x => /Facetten/.test(x.info || ''));
    expect(st && /13 Facetten, 12 Biegelinien/.test(st.info), `Status: ${st && st.info}`);
    const id = C.lastBuild.bodies[0], u = C.lastBuild.sheet.unfold;
    let A = 0; u.contour[0].edges.forEach(e => { A += e.a[0] * e.b[1] - e.b[0] * e.a[1]; });
    near(await vol(id) / (Math.abs(A / 2) * 2), 1, 0.01, 'Volumen ≈ Zuschnittfläche × Dicke');
  }],
  ['Blech: Übergangslasche – Facetten nach Winkel, Länge und Sehnentoleranz', async () => {
    // Rechteck 200 × 150 auf Kreis R 50: das Rechteck gibt 5 Teile (4 Seiten, eine davon an der Naht geteilt),
    // der Kreis so viele wie Facetten: 30° → 12, Länge 20 → ⌈2π·50/20⌉ = 16, Sehne 0,5 → ⌈2π / (2·arccos(1 − 0,5/50))⌉ = 23
    // Die Naht läuft von der Mitte der langen Rechteckseite (270°) auf den Kreis: bei 12 und 16 Facetten trifft sie einen
    // Eckpunkt (12·¾, 16·¾ ganzzahlig), bei 23 nicht (23·¾ = 17,25) – dann teilt sie eine Facette, also eine mehr.
    await openExample('Übergang Rechteck auf Rund 2mm');
    const i = C.doc.features.findIndex(f => f.type === 'sm_loft'), fid = C.doc.features[i].id;
    const facetten = () => { const m = /(\d+) Facetten/.exec(((C.lastBuild.status || {})[fid] || {}).info || ''); return m ? Number(m[1]) : -1; };
    const nChord = Math.ceil(2 * Math.PI / (2 * Math.acos(1 - 0.5 / 50)) - 1e-9);
    for (const [art, k, v, soll] of [['angle', 'facetAngle', 30, 5 + 12], ['length', 'facetLength', 20, 5 + 16], ['chord', 'chordTol', 0.5, 5 + nChord + 1]]) {
      editTimeline(i); await sleep(400);
      await seg('facetMode', art); num(k, v); await ok();
      expect(facetten() === soll, `${art}: ${soll} Facetten (${facetten()})`);
    }
    expect(nChord === 23, `Sehne 0,5 mm am Kreis R 50: 23 Facetten (${nChord})`);
    // zurück auf „Anzahl je 90°“: Feld der anderen Art fällt aus der Datei, 4 je 90° → 5 + 16
    editTimeline(i); await sleep(400);
    await seg('facetMode', 'number'); await ok();
    const lf = C.doc.features[i];
    expect(!('facetMode' in lf) && !('chordTol' in lf), 'Anzahl je 90°: keine Felder der anderen Arten');
    expect(facetten() === 21, `wieder 4 je 90°: 21 Facetten (${facetten()})`);
  }],
  ['Blech: Übergangslasche über drei Profile', async () => {
    // drei gleiche Quadrate 40 × 40 bei z 0 / 50 / 100: ein gerades Vierkantrohr wie mit zwei Profilen über 100 mm –
    // (44² − 40²)·100 = 33600 mm³ (≈ 1 mm³ Ausgleich je 50 mm wie beim Paar), Zuschnitt 4·(40 + 2·0,88) = 167,04 × 100
    await openExample('Übergangslasche über drei Profile 2mm');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.t1, 10000, 'Übergangslasche');
    const st = C.lastBuild.status.t1;
    expect(st.ok && /3 Profile/.test(st.info || ''), `aufgebaut (${st.info || st.error})`);
    near(await vol('t1'), 336 * 100, 4, 'Volumen wie ein Vierkantrohr 100 lang');
    const u = C.lastBuild.sheet.unfold, w = u.bb[1][0] - u.bb[0][0], h = u.bb[1][1] - u.bb[0][1];
    near(Math.max(w, h), 4 * (40 + 1.76), 1e-3, 'Zuschnittlänge 167,04'); near(Math.min(w, h), 100, 1e-3, 'Zuschnitthöhe 100');
    // Trichter 40 → 60 → 80: das mittlere Profil liegt genau auf dem geraden Übergang 40 → 80, also gleicher Körper
    // und gleicher Zuschnitt wie mit zwei Profilen
    const s2 = C.lastBuild.status.t2, s3 = C.lastBuild.status.t3, zu = st => ((st.info || '').match(/Zuschnitt ([\d.]+) × ([\d.]+)/) || []).slice(1).map(Number);
    expect(s2.ok && s3.ok, `Trichter aufgebaut (${s2.error || ''}${s3.error || ''})`);
    const vt = await Promise.all(['t2', 't3'].map(id => vol(C.lastBuild.bodies.find(b => String(b.id || b) === id))));
    near(vt[0], vt[1], 4, 'Trichter: drei Profile = zwei Profile');
    const z2 = zu(s2), z3 = zu(s3);
    expect(z2.length === 2 && z3.length === 2 && Math.abs(z2[0] - z3[0]) < 0.15 && Math.abs(z2[1] - z3[1]) < 0.15, `gleicher Zuschnitt (${s2.info} / ${s3.info})`);
    // Dialog: drittes Profil steht drin, entfernen → wieder zwei Profile (bis z 50)
    const i = C.doc.features.findIndex(f => f.id === 't1');
    editTimeline(i); await sleep(400);
    expect(!!D.querySelector('#dialog select[data-smlmore="0"]'), 'Profil 3 im Dialog');
    click('#dialog [data-cmd="sml-del"][data-i="0"]'); await sleep(200); await ok();
    expect(!('more' in C.doc.features[i]), 'ohne weiteres Profil kein Feld in der Datei');
    near(await vol('t1'), 336 * 50, 2, 'zwei Profile: Vierkantrohr 50 lang');
  }],
  ['Blech: Übergangslasche mit Profilen in der Blechmitte', async () => {
    // Quadrat 40 × 40 auf Quadrat 40 × 40, 50 mm höher, t 2, K 0,44 – ein gerades Vierkantrohr.
    // Innenmaß: (44² − 40²)·50, Mitte: (42² − 38²)·50, Außenmaß: (40² − 36²)·50; Zuschnitt = 4·(40 + 2h) mit h = Lage
    // der neutralen Faser ab der Profilfläche: 0,88 / −0,12 / −1,12
    await openExample('Übergangslasche Blechmitte 2mm');
    const t1 = C.doc.features.findIndex(f => f.id === 't1');
    const pruefe = async (seite, v, L) => {
      const st = (C.lastBuild.status || {}).t1 || {};
      expect(st.ok, `${seite}: aufgebaut (${st.error || st.info})`);
      // ≈ 1 mm³ Abweichung: der Versatz der Facettenpunkte wird mit kleinem Ausgleich (λ = 1e-4) gelöst
      near(await vol(C.lastBuild.bodies[0]), v, 2, `${seite}: Volumen`);
      const u = C.lastBuild.sheet.unfold, w = u.bb[1][0] - u.bb[0][0], h = u.bb[1][1] - u.bb[0][1];
      near(Math.max(w, h), L, 1e-3, `${seite}: Zuschnittlänge`);
      near(Math.min(w, h), 50, 1e-3, `${seite}: Zuschnitthöhe 50`);
    };
    await pruefe('Mitte', 320 * 50, 4 * (40 - 0.24));
    for (const [seite, v, L] of [['out', 336 * 50, 4 * (40 + 1.76)], ['in', 304 * 50, 4 * (40 - 2.24)]]) {
      editTimeline(t1); await sleep(400);
      const prev = C.lastBuild;
      await seg('side', seite); await ok();
      await built(prev, 20000);
      await pruefe(seite, v, L);
    }
  }],
  ['Bohrung: Lage auf Kante (Anfang, Mitte, Ende)', async () => {
    // Platte 100 × 60 × 8 mit Ecken R10 („Bohrung in Rundung …“), Bohrung ⌀ 8 durchgehend auf die obere Kante bei y = 0
    // (gerades Stück x 10…90): in der Mitte geht eine halbe Bohrung über den Rand → es fehlt π·4²·8/2 = 64π
    await openExample('Bohrung in Rundung und mit Kantenmaßen');
    const id = C.lastBuild.bodies[0], v0 = await vol(id), i = C.doc.features.findIndex(f => f.id === 'he');
    const E = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2] - 8) < 1e-6 && Math.abs(e.info.p0[1]) < 1e-6 && Math.abs(e.info.p1[1]) < 1e-6);
    expect(!!E, 'obere Kante bei y = 0 gefunden');
    editTimeline(i); await sleep(400);
    await seg('place', 'onedge');
    pick(E); await sleep(200); await ok();
    near(await vol(id), v0 + Math.PI * 16 * 8 - 64 * Math.PI, 1e-3, 'Mitte: halbe Bohrung über den Rand (die alte Bohrung ist wieder Material)');
    // Anfang/Ende nach der Richtung der angeklickten Kante: dort sitzt die Achse der neuen Bohrung
    const achse = () => { const m = C.lastBuild.mesh.faces.find(fi => fi.type === 'CYLINDRE' && Math.abs((fi.radius || 0) - 4) < 1e-6 && fi.axisO); return m && m.axisO; };
    const xStart = E.info.dir[0] > 0 ? 10 : 90;
    editTimeline(i); await sleep(400);
    await seg('edgePos', 'start'); await ok();
    let o = achse();
    expect(o && Math.abs(o[0] - xStart) < 1e-6 && Math.abs(o[1]) < 1e-6, `Anfang: Achse bei x ${xStart} (${o && o.map(v => v.toFixed(2))})`);
    editTimeline(i); await sleep(400);
    await seg('edgePos', 'end'); await ok();
    o = achse();
    expect(o && Math.abs(o[0] - (100 - xStart)) < 1e-6, `Ende: Achse bei x ${100 - xStart} (${o && o.map(v => v.toFixed(2))})`);
  }],
  ['Gewinde: mehrere Flächen in einem Feature', async () => {
    // zwei Bolzen ⌀ 8 und ⌀ 6 (Zylinder): ein Gewinde-Feature, beide Mantelflächen → M8 und M6 automatisch
    await newDoc();
    await cmd('solid:create', 'cylinder'); num('d', 8); num('h', 20); await ok(30000);
    await cmd('solid:create', 'cylinder'); num('d', 6); num('h', 20); num('cx', 30); await ok(30000);
    await cmd('solid:create', 'thread');
    const cyl = d => faces().find(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - d / 2) < 1e-6);
    await seg('cosmetic', 'true');
    await act(async () => pick(cyl(8)), 30000);
    await act(async () => pick(cyl(6)), 30000);
    await ok(30000);
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.more && f.more.length === 1, 'zweite Fläche gespeichert');
    const info = (C.lastBuild.status[f.id] || {}).info || '';
    expect(/2 Gewinde/.test(info) && /M8/.test(info) && /M6/.test(info), `beide Gewinde (${info || (C.lastBuild.status[f.id] || {}).error})`);
    // Toleranzklasse 6g: nur Kennzeichnung (Status „M8×1.25-6g“)
    editTimeline(C.doc.features.length - 1); await sleep(400);
    const tc = q('#dialog select[data-k="tclass"]'); tc.value = '6g'; tc.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    await ok(30000);
    const info2 = (C.lastBuild.status[f.id] || {}).info || '';
    expect(/M8×1\.25-6g/.test(info2) && /M6×1-6g/.test(info2), `Toleranzklasse im Status (${info2})`);
  }],
  ['Gewinde: Teillänge mit Versatz, kosmetisch', async () => {
    // Bolzen ⌀ 10 × 20. Ein Gewinde 15 mm mit Versatz 10 passt nur noch 10 mm lang auf die Fläche – es muss genau so
    // viel Volumen haben wie ein 10-mm-Gewinde ohne Versatz (nur verschoben). Kosmetisch bleibt der Zylinder glatt.
    await newDoc();
    await cmd('solid:create', 'cylinder'); num('d', 10); num('h', 20); await ok(30000);
    const id = C.lastBuild.bodies[0];
    await cmd('solid:create', 'thread');
    const F = faces().find(h => h.info.type === 'CYLINDRE');
    expect(!!F, 'Zylinderfläche gefunden');
    pick(F);
    await seg('full', 'false'); num('length', 15); await ok(30000);
    const i = C.doc.features.findIndex(f => f.type === 'thread'), fid = C.doc.features[i].id;
    const info = () => ((C.lastBuild.status || {})[fid] || {}).info || '';
    const v15 = await vol(id);
    editTimeline(i); await sleep(400);
    num('offset', 10); await ok(30000);
    expect(/· 10 mm/.test(info()), `mit Versatz 10 auf 10 mm gekürzt (${info()})`);
    const v15o = await vol(id);
    editTimeline(i); await sleep(400);
    num('offset', 0); num('length', 10); await ok(30000);
    const v10 = await vol(id);
    near(v15o, v10, 1e-3, '15 mm mit Versatz 10 = 10 mm ohne Versatz');
    expect(Math.abs(v15 - v10) > 1, `15 mm und 10 mm unterscheiden sich (${v15.toFixed(2)} / ${v10.toFixed(2)})`);
    editTimeline(i); await sleep(400);
    await seg('cosmetic', 'true'); await ok(30000);
    near(await vol(id), Math.PI * 25 * 20, 1e-3, 'kosmetisch: glatter Zylinder π·5²·20');
    expect(/kosmetisch/.test(info()), `Status: ${info()}`);
  }],
  ['Anordnung auf Pfad: Startpunkt und symmetrisch', async () => {
    // Würfel 10 mm bei x 45…55, gerader Pfad 0…100, Start 50 % (dort liegt das Original), 3 Stück
    await openExample('Muster auf Pfad mit Startpunkt');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.pt, 8000, 'Muster aufgebaut');
    const xs = () => [C.lastBuild.mesh.bbox[0][0], C.lastBuild.mesh.bbox[1][0]];
    let [a, b] = xs();
    near(a, 25, 1e-6, 'symmetrisch, Abstand 20: Kopien bei 30 und 70 → x ab 25'); near(b, 75, 1e-6, '… bis 75');
    const i = C.doc.features.findIndex(f => f.id === 'pt');
    // nicht symmetrisch, ganze Länge: vom Start bis zum Pfadende → Kopien bei 75 und 100
    editTimeline(i); await sleep(400);
    await seg('sym', 'false'); await seg('dist', 'extent'); await ok();
    [a, b] = xs();
    near(a, 45, 1e-6, 'ganze Länge ab 50 %: Original links'); near(b, 105, 1e-6, 'letzte Kopie am Pfadende (100)');
    // umgekehrt: zum Pfadanfang → Kopien bei 25 und 0
    editTimeline(i); await sleep(400);
    await seg('flip', 'true'); await ok();
    [a, b] = xs();
    near(a, -5, 1e-6, 'umgekehrt: letzte Kopie am Pfadanfang (0)'); near(b, 55, 1e-6, 'Original rechts');
    expect(C.lastBuild.bodies.length === 3, `drei Körper (${C.lastBuild.bodies.length})`);
  }],
  ['Drehung: eine Seite, symmetrisch, zwei Seiten', async () => {
    // Rechteck x 20…30, z 0…10 in der XZ-Ebene um Z gedreht. Pappus: Winkel · Fläche 100 · Schwerpunktradius 25.
    await openExample('Drehung symmetrisch');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.r1 && C.lastBuild.bodies.length === 1, 8000, 'Drehung aufgebaut');
    const id = () => C.lastBuild.bodies[0], i = C.doc.features.findIndex(f => f.id === 'r1');
    let bb = await bbox(id());
    near(await vol(id()), Math.PI / 2 * 2500, 1e-3, 'symmetrisch 90°: 1250π');
    near(bb[1][1], 30 * Math.SQRT1_2, 1e-6, 'symmetrisch: y bis +21,213'); near(bb[0][1], -30 * Math.SQRT1_2, 1e-6, '… und −21,213');
    // eine Seite: 0 … 90° (Drehsinn um die Achse bestimmt das Vorzeichen)
    editTimeline(i); await sleep(400); await seg('rdir', 'one'); await ok();
    bb = await bbox(id());
    const sg = bb[1][1] > 1 ? 1 : -1;
    near(Math.max(Math.abs(bb[0][1]), Math.abs(bb[1][1])), 30, 1e-6, 'eine Seite: y bis 30');
    near(Math.min(Math.abs(bb[0][1]), Math.abs(bb[1][1])), 0, 1e-6, '… ab 0 (Skizzenebene)');
    // zwei Seiten 90° + 30°: auf der anderen Seite bis 30·sin 30° = 15
    editTimeline(i); await sleep(400); await seg('rdir', 'two'); num('angle2', 30); await ok();
    bb = await bbox(id());
    near(await vol(id()), 2 * Math.PI / 3 * 2500, 1e-3, 'zwei Seiten 120°');
    near(sg > 0 ? bb[1][1] : -bb[0][1], 30, 1e-6, 'Seite 1 bis 30'); near(sg > 0 ? -bb[0][1] : bb[1][1], 15, 1e-6, 'Seite 2 bis 15');
    editTimeline(i); await sleep(400); await seg('rdir', 'one'); await ok();
    const rf = C.doc.features[i];
    expect(!('rdir' in rf) && !('angle2' in rf), 'eine Seite: keine Felder der anderen Arten');
  }],
  ['Schale: tangentiale Kette der offenen Flächen', async () => {
    // Würfel 20 (x, y −10…10, z 0…20), senkrechte Kante bei (10 | 10) mit R 5 gerundet. Offen an x+: mit Kette auch die
    // Rundung und y+. Es bleiben Boden und Deckel 2·2·(400 − (1 − π/4)·25), Wand x− 2·20·16 und Wand y− 2·18·16.
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:modify', 'fillet');
    pick(edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6 && e.info.p0[0] > 9 && e.info.p0[1] > 9));
    num('radius', 5); await ok();
    await cmd('solid:modify', 'shell');
    expect(D.querySelector('#dialog [data-k="tangent"][data-v="true"][aria-pressed="true"]') || /Tangentiale Kette/.test(q('#dialog').textContent), 'Tangentiale Kette im Dialog');
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[0] > 0.9)); num('thickness', 2); await ok(30000);
    const mit = 2 * 2 * (400 - (1 - Math.PI / 4) * 25) + 2 * 20 * 16 + 2 * 18 * 16;
    near(await vol(C.lastBuild.bodies[0]), mit, 1e-2, 'mit Kette: x+, Rundung und y+ offen');
    const i = C.doc.features.length - 1;
    editTimeline(i); await sleep(400); await seg('tangent', 'false'); await ok(30000);
    expect(Math.abs(await vol(C.lastBuild.bodies[0]) - mit) > 100, 'ohne Kette: nur x+ offen, mehr Wand');
  }],
  ['Schale: außen und hohl', async () => {
    // Würfel 20 (z 0…20), Wand 2: innen mit offenem Deckel 20³ − 16·16·18 = 3392, außen 24·24·22 − 20³ = 4672,
    // außen hohl 24³ − 20³ = 5824, innen hohl 20³ − 16³ = 3904 (scharfe Ecken)
    await newDoc(); await box(20, 20, 20);
    const id = C.lastBuild.bodies[0];
    await cmd('solid:modify', 'shell');
    const top = faces().find(h => h.info.type === 'PLANE' && h.info.plane && h.info.plane.n[2] > 0.999);
    pick(top); num('thickness', 2); await ok();
    near(await vol(id), 3392, 1e-3, 'innen, Deckel offen');
    const i = C.doc.features.findIndex(f => f.type === 'shell');
    const nochmal = async (k, v) => { editTimeline(i); await sleep(400); await seg(k, v); await ok(); };
    await nochmal('dir', 'outside');
    near(await vol(id), 4672, 1e-3, 'außen, Deckel offen');
    const bb = await bbox(id);
    near(bb[0][0], -12, 1e-6, 'außen: Wand außerhalb des Würfels'); near(bb[1][2], 20, 1e-6, 'außen: offener Deckel bleibt bei z 20');
    await nochmal('hollow', 'true');
    near(await vol(id), 5824, 1e-3, 'außen, hohl');
    // Ecken gerundet („gerundet“): versetzter Würfel = V + A·t + Kantenlänge·π/4·t² + 4/3·π·t³ (Steiner)
    await nochmal('corners', 'round');
    near(await vol(id), 2400 * 2 + 240 * Math.PI / 4 * 4 + 4 / 3 * Math.PI * 8, 1e-2, 'außen, hohl, Ecken gerundet');
    await nochmal('corners', 'sharp');
    await nochmal('dir', 'inside');
    near(await vol(id), 3904, 1e-3, 'innen, hohl');
    const sf = C.doc.features[i];
    expect(!('dir' in sf) && sf.hollow === true, 'innen ist die Vorgabe und kommt nicht in die Datei');
    // beidseitig je 1 mm: hohl 22³ − 18³ = 4816; Deckel offen 22·22·21 − 18·18·19 = 4008
    editTimeline(i); await sleep(400); num('thickness', 1); await seg('dir', 'both'); num('thickness2', 1); await ok();
    near(await vol(id), 22 ** 3 - 18 ** 3, 1e-3, 'beidseitig, hohl');
    editTimeline(i); await sleep(400); await seg('hollow', 'false'); await ok();
    near(await vol(id), 22 * 22 * 21 - 18 * 18 * 19, 1e-3, 'beidseitig, Deckel offen');
  }],
  ['Runde Anordnung: symmetrisch', async () => {
    // Würfel 10 mm bei x 45…55, 3 Stück über 90° um Z: symmetrisch bei −45° und +45° statt bei +45° und +90°.
    // Ecke (55 | 5) um 45° gedreht: y = 60/√2 = 42,426; Ecke (45 | 5) um +45°: x = 40/√2 = 28,284
    await newDoc(); await box(10, 10, 10, { cx: 50 });
    await cmd('solid:create', 'pattern');
    num('count', 3); num('angle', 90);
    await seg('sym', 'true'); await ok();
    const bb = C.lastBuild.mesh.bbox;
    near(bb[1][1], 60 / Math.SQRT2, 1e-6, 'y oben +42,426'); near(bb[0][1], -60 / Math.SQRT2, 1e-6, 'y unten −42,426 (symmetrisch)');
    near(bb[0][0], 40 / Math.SQRT2, 1e-6, 'x innen 28,284'); near(bb[1][0], 55, 1e-6, 'x außen 55 (Original)');
    // gerade Anzahl: Meldung wie bei der rechteckigen Anordnung, der Dialog rückt beim Einschalten auf ungerade
    const i = C.doc.features.findIndex(f => f.type === 'pattern');
    C.doc.features[i].count = 4;
    editTimeline(i); await sleep(400); await ok();
    const st = (C.lastBuild.status || {})[C.doc.features[i].id] || {};
    expect(!st.ok && /ungerade/.test(st.error || ''), `gerade Anzahl gemeldet (${st.error || 'ok'})`);
  }],
  ['Bohrung: Tiefe bis Fläche', async () => {
    // ⌀8-Bohrung der 8-mm-Platte bis zur Unterseite: flach wie durchgehend; Versatz −3 → endet 3 mm vor der Unterseite
    await openExample('Bohrung in Rundung und mit Kantenmaßen');
    const id = C.lastBuild.bodies[0], v0 = await vol(id), i = C.doc.features.findIndex(f => f.id === 'he');
    const unten = faces().find(h => h.info.type === 'PLANE' && h.info.plane && h.info.plane.n[2] < -0.999);
    editTimeline(i); await sleep(400);
    await seg('depthMode', 'toface'); await seg('tip', 'flat');
    click('#dialog [data-cmd="pick-toface"]'); await sleep(200);
    pick(unten); await sleep(300);
    expect(/Ebene Fläche ✓/.test(q('#dialog').textContent), 'Zielfläche gewählt');
    await ok();
    near(await vol(id), v0, 1e-3, 'bis zur Unterseite, flach: wie durchgehend');
    editTimeline(i); await sleep(400);
    num('toOffset', -3); await ok();
    near(await vol(id), v0 + Math.PI * 16 * 3, 1e-3, 'Versatz −3: 3 mm Material unter der Bohrung');
    const st = (C.lastBuild.status || {}).he || {};
    expect(st.ok, `aufgebaut (${st.error || 'ok'})`);
  }],
  ['Bohrung: Spitzenwinkel einstellbar', async () => {
    // Bohrung ⌀ 8 in der Platte 100 × 60 × 8 („Bohrung in Rundung und mit Kantenmaßen“) von durchgehend auf 5 mm tief:
    // es bleibt π·4²·(8 − 5) Material, abzüglich des Kegels π·4²·h/3 mit h = 4 / tan(Winkel / 2)
    await openExample('Bohrung in Rundung und mit Kantenmaßen');
    const id = C.lastBuild.bodies[0], v0 = await vol(id), i = C.doc.features.findIndex(f => f.id === 'he');
    const soll = (w, t) => v0 + Math.PI * 16 * (8 - t) - Math.PI * 16 * (4 / Math.tan(w / 2 * Math.PI / 180)) / 3;
    editTimeline(i); await sleep(400);
    await seg('depthMode', 'depth'); num('depth', 5);
    expect(q('#dialog input[data-k="tipAngle"]').value === '118', 'Spitzenwinkel startet mit 118°');
    await ok();
    near(await vol(id), soll(118, 5), 1e-3, 'Spitze 118°, 5 tief (Spitze endet bei 7,4)');
    editTimeline(i); await sleep(400);
    // 90°: Kegelhöhe = r = 4 – bei 5 mm Tiefe stäche die Spitze unten aus der 8-mm-Platte, deshalb 3 mm tief
    num('tipAngle', 90); num('depth', 3); await ok();
    near(await vol(id), soll(90, 3), 1e-3, 'Spitze 90°, 3 tief');
    editTimeline(i); await sleep(400);
    await seg('tip', 'flat'); await ok();
    expect(!D.querySelector('#dialog input[data-k="tipAngle"]'), 'flacher Bohrgrund: kein Spitzenwinkel');
    near(await vol(id), v0 + Math.PI * 16 * 5, 1e-3, 'flacher Grund, 3 tief');
  }],
  ['Blech: Doppelsaum', async () => {
    // Platte 120 × 80 × 2 (Beispiel „offener Saum“), Doppelsaum Spalt 2 (Innenradius 1), erster Schenkel 12,
    // Rücksprung 2 → zweiter Schenkel 10. Zwei halbe Ringe 1…3 über 80 mm plus beide Schenkel:
    // 19200 + 2·π/2·(3² − 1²)·80 + 12·2·80 + 10·2·80 − Loch; Zuschnitt 120 + 12 + 10 + 2·π·(1 + 0,88)
    await openExample('Blech mit offenem Saum 2mm');
    const loch = Math.PI * 3.3 ** 2 * 2, i = C.doc.features.findIndex(f => f.type === 'sm_flange');
    editTimeline(i); await sleep(400);
    await seg('hemKind', 'double');
    num('hemGap', 2); num('height', 12); num('hemSetback', 2); await ok();
    const st = (C.lastBuild.status || {})[C.doc.features[i].id] || {};
    expect(st.ok, `Doppelsaum aufgebaut (${st.error || 'ok'})`);
    near(await vol(C.lastBuild.bodies[0]), 19200 + 640 * Math.PI + 1920 + 1600 - loch, 1e-3, 'Volumen: Platte + 2 halbe Ringe + Schenkel 12 und 10');
    const bb = await bbox(C.lastBuild.bodies[0]);
    near(bb[1][2] - bb[0][2], 3 * 2 + 2 * 2, 1e-6, 'Höhe: drei Lagen 3t + zwei Spalte = 10');
    const S = await import('../src/sheet.js');
    const fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    near(fl.bb[1][0] - fl.bb[0][0], 120 + 12 + 10 + 2 * Math.PI * 1.88, 1e-3, 'Zuschnitt 153,812');
    expect(fl.bends.length === 2, `zwei Biegelinien im Zuschnitt (${fl.bends.length})`);
    // Rücksprung größer als die Saumlänge: Meldung
    editTimeline(i); await sleep(400);
    const prev = C.lastBuild;
    num('hemSetback', 13);
    await built(prev, 20000);
    expect(/Rücksprung/.test(q('#dialog').textContent), 'Rücksprung zu groß: Meldung');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Blech: Durchbruch durch alle Lagen eines Doppelsaums in der Abwicklung', async () => {
    // Doppelsaum an x = 120 (Spalt 2, Schenkel 12 und 10): Grundblech z 0…2, Schenkel 1 z 4…6 (x 108…120),
    // Schenkel 2 z 8…10 (x 108…118). Durchbruch 4 × 10 (x 110…114, y 30…40) von oben durch alles: 3 · 4·10·2 = 240 weg.
    // Abwicklung: BA = π·(1 + 0,88); Grundblech x 110…114, Schenkel 1 bei 120 + BA + (6…10), Schenkel 2 bei
    // 120 + BA + 12 + BA + (2…6) – die zweite Lage läuft zurück.
    await openExample('Doppelsaum mit Durchbruch 2mm');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.e1, 10000, 'Durchbruch');
    const loch = Math.PI * 3.3 ** 2 * 2, BA = Math.PI * 1.88;
    near(await vol(C.lastBuild.bodies[0]), 19200 + 640 * Math.PI + 1920 + 1600 - loch - 240, 1e-3, 'Volumen: drei Lagen durchbrochen');
    const S = await import('../src/sheet.js');
    const fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    const x0 = fl.bb[0][0];
    const rects = fl.holes.filter(h => h.edges).map(h => { const xs = h.edges.map(e => e.a[0] - x0), ys = h.edges.map(e => e.a[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; }).sort((a, b) => a[0] - b[0]);
    expect(rects.length === 3, `drei Durchbrüche in der Abwicklung (${rects.length}: ${JSON.stringify(rects.map(r => r.map(v => +v.toFixed(3))))})`);
    if (rects.length === 3) {
      [[110, 114], [126 + BA, 130 + BA], [120 + 2 * BA + 14, 120 + 2 * BA + 18]].forEach(([a, b], k) => {
        near(rects[k][0], a, 1e-3, `Lage ${k + 1}: Anfang`); near(rects[k][1], b, 1e-3, `Lage ${k + 1}: Ende`);
        near(rects[k][3] - rects[k][2], 10, 1e-3, `Lage ${k + 1}: 10 hoch`);
      });
    }
    expect(fl.holes.filter(h => h.circle).length === 1, 'die runde Bohrung bleibt einmal im Grundblech');
  }],
  ['Blech: Saum gerollt und als Tropfen', async () => {
    // Platte 120 × 80 × 2 mit Saum an einer 80-mm-Kante (Beispiel „offener Saum“), Loch ⌀ 6,6, t 2, K 0,44
    await openExample('Blech mit offenem Saum 2mm');
    const loch = Math.PI * 3.3 ** 2 * 2, i = C.doc.features.findIndex(f => f.type === 'sm_flange');
    const S = await import('../src/sheet.js');
    const breite = () => { const fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet); return fl.bb[1][0] - fl.bb[0][0]; };
    // gerollt: R 3 innen, 270°, kein gerader Schenkel → ¾ Kreisring 3…5 über 80 mm
    editTimeline(i); await sleep(400);
    await seg('hemKind', 'rolled');
    expect(!D.querySelector('#dialog input[data-k="height"]') && q('#dialog input[data-k="hemAngle"]').value === '270', 'gerollt: Winkel statt Saumlänge, Vorgabe 270°');
    num('hemR', 3); await ok();
    near(await vol(C.lastBuild.bodies[0]), 19200 + 0.75 * Math.PI * (25 - 9) * 80 - loch, 1e-3, 'gerollt: Platte + ¾ Ring − Loch');
    near(breite(), 120 + 1.5 * Math.PI * (3 + 0.88), 1e-3, 'gerollt: Zuschnitt 120 + 1,5π·(3 + 0,88)');
    // Tropfen: R 2, Länge 12, Spalt 1 → Winkel θ aus 2 − 2·cos θ + 12·sin θ = 1 (θ zwischen 180° und 270°)
    editTimeline(i); await sleep(400);
    await seg('hemKind', 'teardrop');
    num('hemR', 2); num('height', 12); num('hemGap', 1); await ok();
    let a = Math.PI, b = 1.5 * Math.PI;
    for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (2 - 2 * Math.cos(m) + 12 * Math.sin(m) > 1) a = m; else b = m; }
    const th = (a + b) / 2;
    const st = (C.lastBuild.status || {})[C.doc.features[i].id] || {};
    expect(st.ok, `Tropfen aufgebaut (${st.error || 'ok'})`);
    near(await vol(C.lastBuild.bodies[0]), 19200 + th / 2 * (16 - 4) * 80 + 12 * 2 * 80 - loch, 1e-3, `Tropfen: θ = ${(th * 180 / Math.PI).toFixed(2)}°`);
    near(breite(), 120 + th * (2 + 0.88) + 12, 1e-3, 'Tropfen: Zuschnitt 120 + θ·2,88 + 12');
    // Spalt größer als 2 × Radius geht nicht: der Kern sagt warum
    editTimeline(i); await sleep(400);
    const prev = C.lastBuild;
    num('hemGap', 5);
    await built(prev, 20000);
    expect(/Spalt zu groß/.test(q('#dialog').textContent), 'Tropfen mit zu großem Spalt: Meldung');
    // zurück auf flach/offen: Felder der anderen Arten fallen aus der Datei
    await seg('hemKind', 'open'); num('hemGap', 3); await ok();
    const fl = C.doc.features[i];
    expect(!('hemKind' in fl) && !('hemR' in fl) && !('hemAngle' in fl), 'offen: keine Felder der anderen Saumarten');
    near(await vol(C.lastBuild.bodies[0]), 120 * 80 * 2 + 12 * 2 * 80 + Math.PI / 2 * (3.5 ** 2 - 1.5 ** 2) * 80 - loch, 1e-3, 'wieder offener Saum mit Spalt 3');
  }],
  ['Blech: Falten an zwei Biegelinien (U-Profil)', async () => {
    // Platte 100 × 60 × 2, Linien bei x = 30 und x = 70, beide 90° nach oben, t 2, R 2, K 0,44 → BA = π/2·2,88.
    // Linie 1 bewegt x < 30 („Seite A“), Linie 2 dann von selbst die vom festen Teil abgewandte Seite x > 70.
    // Volumen: je Biegung wird ein Streifen BA·t·60 durch die Biegezone θ·t·(r + t/2)·60 ersetzt.
    // Schenkel außen bei x = 30 + BA/2 − (r + t) bzw. 70 − BA/2 + (r + t), Höhe r + t + (30 − BA/2).
    await openExample('U-Profil an zwei Linien gefaltet 2mm');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.g1 && C.lastBuild.bodies.length === 1, 8000, 'Beispiel aufgebaut');
    const BA = Math.PI / 2 * 2.88, id = C.lastBuild.bodies[0];
    const st = (C.lastBuild.status || {}).g1 || {};
    expect(st.ok, `Falten aufgebaut (${st.error || 'ok'})`);
    near(await vol(id), 12000 + 2 * 60 * 2 * (Math.PI / 2) * (3 - 2.88), 1e-3, 'Volumen 12045,239');
    const bb = await bbox(id);
    near(bb[0][0], 30 + BA / 2 - 4, 1e-6, 'linker Schenkel außen'); near(bb[1][0], 70 - BA / 2 + 4, 1e-6, 'rechter Schenkel außen');
    near(bb[1][2], 4 + 30 - BA / 2, 1e-6, 'Schenkelhöhe'); near(bb[0][2], 0, 1e-6, 'Boden bei z 0');
    const S = await import('../src/sheet.js');
    const fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    expect(fl.bends.length === 2, `Abwicklung mit zwei Biegelinien (${fl.bends.length})`);
    near(fl.bb[1][0] - fl.bb[0][0], 100, 1e-6, 'Zuschnitt 100 lang'); near(fl.bb[1][1] - fl.bb[0][1], 60, 1e-6, 'Zuschnitt 60 breit');
    // „Bewegte Seite B“: fest bleibt jetzt der linke Streifen x < 30. Das Mittelstück stellt sich senkrecht, Linie 2
    // klappt den rechten Streifen über den linken zurück – ein liegendes U, offen nach −X: Wand außen bei
    // x = 30 − BA/2 + (r + t), Höhe (r + t) + (40 − BA) + (r + t)
    editTimeline(C.doc.features.findIndex(f => f.id === 'g1')); await sleep(400);
    await seg('side', 'true'); await ok();
    near(await vol(C.lastBuild.bodies[0]), 12000 + 2 * 60 * 2 * (Math.PI / 2) * (3 - 2.88), 1e-3, 'Seite B: gleiches Volumen');
    const bb2 = await bbox(C.lastBuild.bodies[0]);
    near(bb2[0][0], 0, 1e-6, 'Seite B: linker Streifen bleibt liegen');
    near(bb2[1][0], 30 - BA / 2 + 4, 1e-6, 'Seite B: senkrechte Wand außen');
    near(bb2[1][2], 4 + (40 - BA) + 4, 1e-6, 'Seite B: Höhe des liegenden U');
  }],
  ['Blech: Falten an sich kreuzenden Linien (Kasten aus Zuschnitt)', async () => {
    // Zuschnitt 100 × 100 × 2, Linien x 20 / 80 und y 20 / 80 über die ganze Platte, je 90° hoch; BA = π/2·2,88.
    // An jeder Kreuzung entfällt das Eckquadrat c × c mit c = 20 + BA/2; jede Lasche ist 60 − BA lang.
    // Volumen = 100²·2 − 4·c²·2 + 4·(60 − BA)·2·(π/2)·(3 − 2,88) (Biegezone statt Streifen, wie beim U-Profil).
    await openExample('Kasten aus Zuschnitt gefaltet 2mm');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.g1, 10000, 'Falten');
    const st = C.lastBuild.status.g1, BA = Math.PI / 2 * 2.88, c = 20 + BA / 2;
    expect(st.ok && /4 Biegungen · 4 Eckfreischnitte/.test(st.info || ''), `aufgebaut (${st.info || st.error})`);
    const id = C.lastBuild.bodies[0];
    near(await vol(id), 20000 - 8 * c * c + 4 * (60 - BA) * 2 * (Math.PI / 2) * 0.12, 1e-3, 'Volumen offener Kasten');
    const bb = await bbox(id);
    near(bb[0][0], c - 4, 1e-6, 'Wand links außen bei x = c − (r + t)'); near(bb[1][0], 100 - c + 4, 1e-6, 'Wand rechts außen');
    near(bb[0][1], c - 4, 1e-6, 'Wand vorne außen'); near(bb[1][2], 4 + 20 - BA / 2, 1e-6, 'Wandhöhe');
    // Abwicklung aus dem Körper: Zuschnitt 100 × 100 mit vier Eckkerben c × c, vier Biegelinien je 60 − BA lang
    const S = await import('../src/sheet.js');
    const fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    expect(fl.bends.length === 4, `vier Biegelinien (${fl.bends.length})`);
    near(fl.bb[1][0] - fl.bb[0][0], 100, 1e-3, 'Zuschnitt 100 breit'); near(fl.bb[1][1] - fl.bb[0][1], 100, 1e-3, 'Zuschnitt 100 hoch');
    const area = lp => lp.edges.reduce((a, e) => a + (e.a[0] * e.b[1] - e.b[0] * e.a[1]) / 2, 0);
    near(Math.abs(fl.contour.reduce((a, lp) => a + area(lp), 0)), 10000 - 4 * c * c, 1e-2, 'Zuschnittfläche 100² − 4·c²');
    fl.bends.forEach((bn, k) => near(Math.hypot(bn.b[0] - bn.a[0], bn.b[1] - bn.a[1]), 60 - BA, 1e-3, `Biegelinie ${k + 1} endet an den Kerben`));
  }],
  ['Normteile: Schraube, Scheibe und Mutter an einer Bohrung', async () => {
    await openExample('Winkel mit Rippe');
    // oberer Rand einer Bohrung Ø 9 in der Grundplatte (Platte z = 0 … 8)
    const rim = () => edges().filter(e => e.info.type === 'CIRCLE' && Math.abs(e.info.p0[2] - 8) < 1e-6).sort((a, b) => a.info.p0[0] - b.info.p0[0] || a.info.p0[1] - b.info.p0[1])[0];
    const dia = e => Math.hypot(e.info.p0[0] - e.info.mid[0], e.info.p0[1] - e.info.mid[1], e.info.p0[2] - e.info.mid[2]);
    const low = () => edges().filter(e => e.info.type === 'CIRCLE' && Math.abs(e.info.p0[2]) < 1e-6 && Math.abs(dia(e) - 9) < 1e-3).sort((a, b) => a.info.p0[0] - b.info.p0[0] || a.info.p0[1] - b.info.p0[1])[0];
    const r0 = rim();
    expect(r0, 'Bohrungsrand oben gefunden');
    // Bauteil: Schraube einfügen gesperrt; über die Dokumenteinstellungen zur Baugruppe
    click('[data-rtab="solid"]'); await sleep(100);
    click('[data-menu="solid:insert"]'); await sleep(120);
    expect(q('#fmenu [data-cmd="fastener"]').disabled, 'im Bauteil: Schraube einfügen gesperrt');
    click('[data-menu="solid:insert"]'); await sleep(100);
    click('#browser [data-cmd="doc-kind"]'); await sleep(300);
    expect(C.doc.kind === 'assembly', 'Dokument ist jetzt eine Baugruppe');
    await cmd('asm:insert', 'fastener');
    pick(r0);
    const sel = k => D.querySelector(`#dialog select[data-segsel="${k}"]`);
    expect(sel('size') && sel('size').value === 'M8', `Größe aus Bohrung Ø 9 → M8 (${sel('size') && sel('size').value})`);
    sel('length').value = '25'; sel('length').dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(250);
    expect(/ISO 4762 M8 × 25/.test(q('#dialog input[data-k="name"]').value), 'Name nach Norm');
    await ok();
    const bolt = C.lastBuild.bodies.find(id => (C.doc.bodies[id] || {}).name === 'ISO 4762 M8 × 25');
    expect(bolt, 'Körper „ISO 4762 M8 × 25“');
    const bb = (await C.kernel.props(bolt)).bbox;
    near(bb[1][2], 16, 1e-3, 'Kopfoberkante z = 8 + k 8');
    near(bb[0][2], -17, 1e-3, 'Schaftende z = 8 − 25');
    near(bb[1][0] - bb[0][0], 13, 1e-3, 'Kopf-⌀ 13');
    // Scheibe und Mutter unten an derselben Bohrung (Kopf nach unten, Mutter auf der Scheibe)
    for (const [kind, off, name] of [['iso7089', 0, 'ISO 7089 M8'], ['iso4032', 1.6, 'ISO 4032 M8']]) {
      await cmd('asm:insert', 'fastener');
      await seg('kind', kind);
      pick(low());
      num('offset', off);
      await ok();
      expect(C.lastBuild.bodies.some(id => (C.doc.bodies[id] || {}).name === name), `Körper „${name}“`);
    }
    const nut = C.lastBuild.bodies.find(id => (C.doc.bodies[id] || {}).name === 'ISO 4032 M8');
    const nb = (await C.kernel.props(nut)).bbox;
    near(nb[1][2], -1.6, 1e-3, 'Mutter liegt auf der Scheibe (unten)');
    near(nb[0][2], -1.6 - 6.8, 1e-3, 'Mutterhöhe 6,8');
  }],
  ['SVG einfügen: Formen, Bögen, Kurven, Maßstab', async () => {
    await newDoc();
    const text = await (await fetch('fixtures/logo.svg', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'logo.svg', { type: 'image/svg+xml' }));
    inp.files = dt.files;
    inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    const sk = await waitFor(() => C.doc.features.find(f => f.type === 'sketch' && f.name === 'logo'), 4000, 'Skizze aus SVG');
    const P = new Map(sk.points.map(p => [p.id, p]));
    const circ = sk.curves.filter(c => c.type === 'circle'), arcs = sk.curves.filter(c => c.type === 'arc'), spl = sk.curves.filter(c => c.type === 'spline');
    expect(circ.length === 1 && Math.abs(circ[0].r - 10) < 1e-6, `Kreis r = 10 mm (${circ.map(c => c.r)})`);
    const cc = circ[0] && P.get(circ[0].c);
    expect(cc && Math.abs(cc.x - 75) < 1e-6 && Math.abs(cc.y - 25) < 1e-6, 'Kreis mit Gruppen-Verschiebung bei (75, 25)');
    expect(arcs.filter(a => Math.abs(a.r - 2.5) < 1e-6).length === 4, 'vier Eckbögen R 2,5');
    const open = arcs.find(a => Math.abs(a.r - 5) < 1e-6);
    expect(open, 'offener Bogen R 5');
    if (open) { const c = P.get(open.c), am = (open.a0 + open.a1) / 2; expect(c.y + 5 * Math.sin(am) > 10 + 1e-6, 'Bogen wölbt sich nach oben wie im SVG'); }
    expect(spl.length >= 4, `Bézierkurven als Splines (${spl.length})`);
    expect(!sk.points.some(p => Math.hypot(p.x - 2.5, p.y - 47.5) < 1e-6), 'Elemente in defs übergangen');
    expect(/Texte/.test((D.querySelector('.toast') || {}).textContent || ''), 'Hinweis auf übersprungenen Text');
    // alle Profile 2 mm extrudieren: mindestens Rechteck 30×20 − (4−π)·2,5² plus Kreis π·10², dazu das Herz
    const r = await C.kernel.build([...C.doc.features, { id: 'xsvg', type: 'extrude', name: 'Logo', sketch: sk.id, distance: 2, op: 'new', profiles: null }], undefined, {});
    expect(r.status.xsvg && r.status.xsvg.ok, `Extrusion ok (${r.status.xsvg && r.status.xsvg.error})`);
    const v = (await C.kernel.props(r.bodies[0])).volume, base = 2 * (600 - (4 - Math.PI) * 6.25 + Math.PI * 100);
    expect(v > base + 50 && v < base + 2000, `Volumen ${v.toFixed(1)} (Rechteck + Kreis ${base.toFixed(1)} + Herz)`);
  }],
  ['Blech: Abrundung einer Zuschnittecke', async () => {
    await openExample('Winkelblech gebogen 2mm');
    const id = C.lastBuild.bodies[0], v0 = await vol(id);
    await cmd('sheet:modify', 'sm_corner');
    const L = e => Math.hypot(...e.info.p1.map((v, i) => v - e.info.p0[i]));
    const long = edges().find(e => e.info.type === 'LINE' && L(e) > 50);
    pick(long);
    expect(/Ecke anklicken/.test(q('#dialog').textContent), 'lange Kante wird abgelehnt');
    const corner = edges().find(e => e.info.type === 'LINE' && Math.abs(L(e) - 2) < 1e-6 && Math.abs(e.info.p0[0] - 100) < 1e-6 && Math.abs(e.info.p0[1]) < 1e-6);
    expect(corner, 'Ecke (100, 0) in Dickenrichtung gefunden');
    pick(corner);
    expect(/1 Ecke/.test(q('#dialog').textContent), 'eine Ecke gewählt');
    num('size', 5);
    await ok();
    near(v0 - await vol(id), 2 * (1 - Math.PI / 4) * 25, 1e-3, 'Volumen − (1 − π/4)·R²·t');
    const u = C.lastBuild.sheet.unfold;
    expect(u && u.contour[0].edges.filter(e => e.type === 'arc').length === 1 && u.holes.length === 2, 'Abwicklung: ein Eckbogen, zwei Bohrungen');
    // zweite Eckgruppe mit R 8 an einer anderen Ecke bei x = 100: es fehlen (1 − π/4)·(5² + 8²)·t
    const i = C.doc.features.length - 1;
    editTimeline(i); await sleep(400);
    click('#dialog [data-cmd="fset-add"]');
    await waitFor(() => D.querySelector('#dialog [data-cmd="fset-pick"][data-i="1"][aria-pressed="true"]'), 5000, 'Gruppe 2 aktiv');
    // die echte zweite Ecke (größtes |y|), nicht die Nahtkante der R-5-Rundung bei y = 5
    const corner2 = edges().filter(e => e.info.type === 'LINE' && Math.abs(L(e) - 2) < 1e-6 && Math.abs(e.info.p0[0] - 100) < 1e-6).sort((a, b) => Math.abs(b.info.p0[1]) - Math.abs(a.info.p0[1]))[0];
    expect(corner2 && Math.abs(corner2.info.p0[1]) > 10, 'zweite Ecke bei x = 100 gefunden');
    pick(corner2);
    await waitFor(() => /Gruppe 2 \(1\)/.test(q('#dialog').textContent), 5000, 'Ecke in Gruppe 2');
    const inp = q('#dialog input[data-fset="0"]'); inp.value = '8'; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    await ok();
    const sf = C.doc.features[i];
    expect(sf.edges.length === 1 && sf.sets && sf.sets[0].edges.length === 1 && sf.sets[0].value === 8, 'zwei Gruppen: je eine Ecke, Gruppe 2 mit 8 mm');
    await waitFor(() => /2 Ecken gerundet/.test(((C.lastBuild.status || {})[sf.id] || {}).info || ''), 20000, 'Neuaufbau mit beiden Gruppen');
    const stc = C.lastBuild.status[sf.id] || {};
    near(v0 - await vol(C.lastBuild.bodies[0]), 2 * (1 - Math.PI / 4) * (25 + 64), 1e-3, `R 5 und R 8: − (1 − π/4)·(25 + 64)·t [${stc.info || stc.error} ${stc.warn || ''} ${JSON.stringify(sf.sets)} ${JSON.stringify(sf.edges)}]`);
    const u2 = C.lastBuild.sheet.unfold;
    expect(u2 && u2.contour[0].edges.filter(e => e.type === 'arc').length === 2, 'Abwicklung: zwei Eckbögen');
  }],
  ['Blech: zwei Bleche durch Biegung verbinden', async () => {
    await openExample('Zwei Bleche durch Biegung verbunden 2mm');
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1, 8000, 'Beispiel: ein Körper');
    C.doc.features = C.doc.features.filter(f => f.type !== 'sm_join');
    await cmd('sheet:create', 'sm_join');
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 2, 8000, 'zwei Bleche vor dem Verbinden');
    const ea = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[0] - 100) < 1e-6 && Math.abs(e.info.p0[2] - 2) < 1e-6 && Math.abs(e.info.dir[1]) > 0.99);
    const eb = edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[0] - 110) < 1e-6 && Math.abs(e.info.p0[2]) < 1e-6 && Math.abs(e.info.dir[1]) > 0.99);
    expect(ea && eb, 'Endkanten beider Bleche gefunden');
    pick(ea);
    expect(/zweiten Blech/.test(q('#dialog').textContent), 'wartet auf die zweite Kante');
    pick(eb);
    await ok();
    expect(C.lastBuild.bodies.length === 1, 'ein Körper nach dem Verbinden');
    near(await vol(C.lastBuild.bodies[0]), 12000 + 6000 + 960 + Math.PI / 2 * 3 * 2 * 60 - 480, 1e-3, 'Volumen: Verlängerung + Biegung − Kürzung');
    const u = C.lastBuild.sheet && C.lastBuild.sheet.unfold;
    near(u.bb[1][0] - u.bb[0][0], 108 + 46 + Math.PI / 2 * (2 + 0.44 * 2), 1e-3, 'Abwicklungslänge 108 + 46 + Biegezugabe');
    // eigener Biegeradius R 5: Tangentenlänge 6 statt 3 → A 3 mm weniger verlängert, B 3 mm mehr gekürzt
    editTimeline(C.doc.features.findIndex(f => f.type === 'sm_join')); await sleep(400);
    await seg('ownR', 'true');
    expect(q('#dialog input[data-k="radius"]').value === '2', 'Feld startet mit dem Radius der Blechregel');
    num('radius', 5); await ok();
    near(await vol(C.lastBuild.bodies[0]), 12000 + 6000 + 5 * 60 * 2 + Math.PI / 2 * 6 * 2 * 60 - 7 * 60 * 2, 1e-3, 'R 5: Volumen 18890,97');
    const u5 = C.lastBuild.sheet && C.lastBuild.sheet.unfold;
    near(u5.bb[1][0] - u5.bb[0][0], 105 + 43 + Math.PI / 2 * (5 + 0.44 * 2), 1e-3, 'R 5: Abwicklung 105 + 43 + π/2·(5 + 0,88)');
    // zurück auf die Blechregel: Feld und Wert kommen aus der Datei
    editTimeline(C.doc.features.findIndex(f => f.type === 'sm_join')); await sleep(400);
    await seg('ownR', 'false'); await ok();
    const jf = C.doc.features.find(f => f.type === 'sm_join');
    expect(!('ownR' in jf) && !('radius' in jf), 'Blechregel: kein eigener Radius in der Datei');
    near(await vol(C.lastBuild.bodies[0]), 12000 + 6000 + 960 + Math.PI / 2 * 3 * 2 * 60 - 480, 1e-3, 'wieder R 2');
  }],
  ['Blech: offener Saum mit Spalt', async () => {
    await openExample('Blech mit offenem Saum 2mm');
    // Platte 120 × 80 × 2, Schenkel 12 × 2 über 80 mm, U-Bogen mit innerem Radius Spalt/2 = 1,5, Loch Ø 6,6
    const vSaum = 120 * 80 * 2 + 12 * 2 * 80 + Math.PI / 2 * (3.5 ** 2 - 1.5 ** 2) * 80 - Math.PI * 3.3 ** 2 * 2;
    let v0 = 0;
    for (let i = 0; i < 30; i++) {
      v0 = await vol(C.lastBuild.bodies[0]);
      if (Math.abs(v0 - vSaum) < 1e-3) break;
      await sleep(100);
    }
    near(v0, vSaum, 1e-3, 'Platte + Schenkel + U-Bogen (Spalt 3) − Loch');
    const S = await import('../src/sheet.js'), rule = () => ({ ...S.DEFAULT_RULE, ...C.doc.sheet });
    let fl = S.computeFlat(C.doc, rule(), C.lastBuild.sheet);
    near(fl.bb[1][0] - fl.bb[0][0], 120 + 12 + Math.PI * (1.5 + 0.44 * 2), 1e-3, 'Abwicklung: Platte + Saumlänge + Biegezugabe aus dem Spalt');
    near(fl.bb[1][1] - fl.bb[0][1], 80, 1e-3, 'Abwicklung 80 mm breit');
    expect(fl.bends.length === 1 && /R1\.5/.test(fl.bends[0].label), `Biegung nach Spalt beschriftet (${fl.bends.length})`);
    const flange = C.doc.features.findIndex(f => f.type === 'sm_flange');
    editTimeline(flange);
    await waitFor(() => D.querySelector('#dialog input[data-k="hemGap"]'), 4000, 'Spalt-Feld beim Saum');
    expect(q('#dialog input[data-k="hemGap"]').value === '3', 'Spalt steht im Dialog');
    const prev = C.lastBuild;
    num('hemGap', 0);
    await built(prev, 20000);
    // flacher Saum: der Schenkel liegt auf der Fläche, die scharfe Außenbahn hat den Radius t
    near(await vol(C.lastBuild.bodies[0]), 120 * 80 * 2 + 12 * 2 * 80 + Math.PI / 2 * 2 ** 2 * 80 - Math.PI * 3.3 ** 2 * 2, 1e-3,
      'flacher Saum: Schenkel auf der Fläche, Bogen mit Radius t');
    fl = S.computeFlat(C.doc, rule(), C.lastBuild.sheet);
    near(fl.bb[1][0] - fl.bb[0][0], 120 + 12 + Math.PI * 0.44 * 2, 1e-3, 'Abwicklung: Biegezugabe folgt dem kleineren Radius');
    await ok();
  }],
  ['Auswahlfilter: Körper, Flächen, Kanten', async () => {
    await openExample('Winkel mit Rippe verschraubt');
    const setF = async v => { click('[data-menu="nav:filter"]'); await sleep(120); click(`[data-cmd="selfilter"][data-v="${v}"]`); await sleep(150); };
    try {
      await setF('edge');
      expect(C.vp.pickMode === 'edge', 'Kanten: nur Kanten wählbar');
      await setF('face');
      expect(C.vp.pickMode === 'face', 'Flächen: nur Flächen wählbar');
      await setF('body');
      const m = C.lastBuild.mesh, nut = m.bodies.find(b => (C.doc.bodies[b.id] || {}).name === 'ISO 4032 M8');
      pick(faces()[nut.faces[0] + 1]);
      const n0 = C.lastBuild.bodies.length;
      await cmd('asm:modify', 'remove');
      expect(/1 Körper|ISO 4032 M8/.test(q('#dialog').textContent), `Entfernen übernimmt den gewählten Körper (${q('#dialog').textContent.slice(0, 80)})`);
      await ok();
      expect(C.lastBuild.bodies.length === n0 - 1 && !C.lastBuild.bodies.includes(nut.id), 'genau die Mutter entfernt');
    } finally { await setF('all'); }
    expect(C.vp.pickMode === 'any', 'Alles: wieder alles wählbar');
  }],
  ['Konfigurationen: Teilefamilie umschalten und erweitern', async () => {
    await openExample('Platte Teilefamilie');
    const id = () => C.lastBuild.bodies[0];
    near(await vol(id()), 120 * 60 * 5 - Math.PI * 25 * 5, 1e-3, 'Variante M aktiv');
    const sel = D.querySelector('#browser [data-cfgsel]');
    expect(sel && [...sel.options].map(o => o.textContent).join() === 'S,M,L', 'Umschalter im Browser mit S, M, L');
    let prev = C.lastBuild;
    sel.value = 'cS'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    await built(prev, 20000);
    near(await vol(id()), 80 * 40 * 5 - Math.PI * 16 * 5, 1e-3, 'Variante S: 80 × 40, Bohrung 8');
    expect(C.doc.params.find(p => p.name === 'breite').expr === '80', 'Parameter breite = 80');
    prev = C.lastBuild;
    sel.value = 'cL'; D.querySelector('#browser [data-cfgsel]').value = 'cL'; D.querySelector('#browser [data-cfgsel]').dispatchEvent(new W.Event('change', { bubbles: true }));
    await built(prev, 20000);
    expect(!C.doc.features.find(f => f.id === 'ch').suppressed && (await vol(id())) < 160 * 80 * 5 - Math.PI * 36 * 5 - 1, 'Variante L: Fase aktiv');
    // neue Variante im Dialog: Kopie von S mit breite 100
    await cmd('util:manage', 'configs');
    const rows = () => [...D.querySelectorAll('#dialog .cfgtab tbody tr')];
    expect(rows().length === 3, 'Tabelle mit drei Zeilen');
    rows()[0].querySelector('[data-cmd="cfg-add"]').click(); await sleep(150);
    const nr = rows()[3];
    const inp = nr.querySelector('[data-col="p:breite"]'); inp.value = '100'; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    nr.querySelector('[data-cfgact]').click(); nr.querySelector('[data-cfgact]').dispatchEvent(new W.Event('change', { bubbles: true }));
    prev = C.lastBuild;
    click('#dialog [data-cmd="cfg-ok"]');
    await built(prev, 20000);
    near(await vol(id()), 100 * 40 * 5 - Math.PI * 16 * 5, 1e-3, 'neue Variante 100 × 40 aktiv');
    expect(C.doc.configs.rows.length === 4, 'vier Konfigurationen gespeichert');
  }],
  ['Konfigurationsregeln: Wenn … dann …', async () => {
    // Teilefamilie S 80×40 (Bohrung 8), M 120×60 (10), L 160×80 (12); Spalte „Fasen unterdrückt“ (s:ch).
    // Regel 1: breite ≥ 150 → Fase an; Regel 2: breite < 150 → Fase aus; Regel 3: breite > 100 und tiefe ≥ 60 →
    // bohrung = breite/12. Von Hand: S bleibt (Fase aus, 8), M Fase aus, Bohrung 120/12 = 10, L Fase an, 160/12 = 13,333.
    await openExample('Platte Teilefamilie');
    await cmd('util:manage', 'configs');
    const el = (gi, art, i = 0) => q(`#dialog [data-cfgr="${gi}"][data-art="${art}"]${art.includes('-') ? `[data-i="${i}"]` : ''}`);
    const setz = async (gi, art, v, i = 0) => { const e = el(gi, art, i); expect(!!e, `Feld ${art} der Regel ${gi + 1}`); e.value = v; e.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(60); };
    const neu = async () => { click('#dialog [data-cmd="cfg-regel-neu"]'); await sleep(80); };
    await neu(); await setz(0, 'wenn-col', 'p:breite'); await setz(0, 'wenn-op', '≥'); await setz(0, 'wenn-wert', '150'); await setz(0, 'dann-col', 's:ch'); await setz(0, 'dann-wert', '');
    await neu(); await setz(1, 'wenn-op', '<'); await setz(1, 'wenn-wert', '150'); await setz(1, 'dann-col', 's:ch'); await setz(1, 'dann-wert', '1');
    await neu(); await setz(2, 'wenn-op', '>'); await setz(2, 'wenn-wert', '100');
    click('#dialog [data-cmd="cfg-wenn-neu"][data-g="2"]'); await sleep(80);
    await setz(2, 'wenn-col', 'p:tiefe', 1); await setz(2, 'wenn-op', '≥', 1); await setz(2, 'wenn-wert', '60', 1);
    await setz(2, 'dann-col', 'p:bohrung'); await setz(2, 'dann-wert', 'breite/12');
    const zeile = name => [...D.querySelectorAll('#dialog .cfgtab tbody tr')].find(r => r.querySelector('[data-cfgname]').value === name);
    const zelle = (name, col) => zeile(name).querySelector(`[data-col="${col}"]`);
    expect(zelle('S', 's:ch').checked && zelle('S', 'p:bohrung').value === '8', 'S: Fase aus, Bohrung 8 (Regel 3 trifft nicht)');
    expect(zelle('M', 's:ch').checked && zelle('M', 'p:bohrung').value === 'breite/12', 'M: Fase aus, Bohrung = breite/12');
    expect(!zelle('L', 's:ch').checked && zelle('L', 'p:bohrung').value === 'breite/12', 'L: Fase an (Regel 1), Bohrung = breite/12');
    expect(zelle('L', 'p:bohrung').closest('td').classList.contains('regel') && /Regel 3/.test(zelle('L', 'p:bohrung').closest('td').title), 'von Regel gesetzte Zelle markiert');
    // neue Zeile XL (Kopie von L) mit 200 × 100: Regeln greifen sofort
    zeile('L').querySelector('[data-cmd="cfg-add"]').click(); await sleep(150);
    const xl = [...D.querySelectorAll('#dialog .cfgtab tbody tr')][3];
    const nm = xl.querySelector('[data-cfgname]'); nm.value = 'XL'; nm.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(80);
    for (const [c, v] of [['p:breite', '200'], ['p:tiefe', '100']]) { const i = zelle('XL', c); i.value = v; i.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(80); }
    // M auf 150 verbreitert: jetzt Fase an (Regel 1)
    { const i = zelle('M', 'p:breite'); i.value = '150'; i.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(80); }
    expect(!zelle('M', 's:ch').checked, 'M mit 150 mm: Fase an');
    zeile('XL').querySelector('[data-cfgact]').click(); zeile('XL').querySelector('[data-cfgact]').dispatchEvent(new W.Event('change', { bubbles: true }));
    const prev = C.lastBuild;
    click('#dialog [data-cmd="cfg-ok"]');
    await built(prev, 20000);
    const R = C.doc.configs.regeln;
    expect(R && R.length === 3 && R[2].wenn.length === 2 && R[2].dann[0].wert === 'breite/12', 'drei Regeln im Dokument gespeichert');
    near(C.paramValues(C.doc.params).vals.bohrung, 200 / 12, 1e-9, 'XL aktiv: bohrung = 200/12 = 16,667');
    expect(!C.doc.features.find(f => f.id === 'ch').suppressed, 'XL: Fase an');
    const bz = C.lastBuild.mesh.faces.find(f => f.type === 'CYLINDRE');
    near(bz && bz.radius, 200 / 24, 1e-6, 'Bohrung im Modell ⌀ 16,667');
  }],
  ['Parameter: Ausdrücke, Einheiten und Umbenennen in Teilefamilien', async () => {
    await openExample('Platte Teilefamilie');
    const parRow = name => [...D.querySelectorAll('#dialog .prow')].find(r => r.querySelector('[data-par="name"]').value === name);
    const setParam = (name, expr) => {
      const row = [...D.querySelectorAll('#dialog .prow')].find(r => r.querySelector('[data-par="name"]').value === name);
      const input = row && row.querySelector('[data-par="expr"]');
      expect(!!input, `Parameter ${name} im Dialog`);
      if (!input) return;
      input.value = expr;
      input.dispatchEvent(new W.Event('input', { bubbles: true }));
    };
    await cmd('solid:modify', 'params');
    setParam('tiefe', '35 mm');
    setParam('breite', 'tiefe * 2');
    setParam('dicke', '1 cm / 2');
    setParam('bohrung', 'min(breite / 10; 12)');
    expect([...D.querySelectorAll('#dialog .prow.bad')].length === 0, 'verkettete Ausdrücke sind gültig');
    let prev = C.lastBuild;
    click('#dialog [data-cmd="par-ok"]');
    await built(prev, 20000);
    const id = C.lastBuild.bodies[0];
    near(await vol(id), 70 * 35 * 5 - Math.PI * 3.5 ** 2 * 5, 1e-3, 'Ausdrücke und Einheiten steuern die Geometrie');
    expect(C.doc.features.find(f => f.id === 'bx').exprs.w.e === 'breite' && C.doc.features.find(f => f.id === 'cy').exprs.d.e === 'bohrung', 'Feature-Ausdrücke bleiben verknüpft');

    // Dimensionsrechnung: ein Ausdruck hat nicht nur einen Wert, sondern auch eine Größe (mm, mm², …)
    await cmd('solid:modify', 'params');
    const parVal = name => { const r = parRow(name); return r ? r.querySelector('.pval').textContent : ''; };
    const setIn = (row, k, v) => { const i = row.querySelector(`[data-par="${k}"]`); i.value = v; i.dispatchEvent(new W.Event('input', { bubbles: true })); };
    click('#dialog [data-cmd="par-add"]');
    const neu = [...D.querySelectorAll('#dialog .prow')].pop();
    setIn(neu, 'name', 'flaeche');
    setIn(neu, 'expr', 'breite * tiefe');
    expect(parVal('flaeche') === '2450 mm²', `breite*tiefe steht in der Wertspalte als mm² (${parVal('flaeche')})`);
    setIn(parRow('flaeche'), 'expr', 'breite + tiefe * tiefe');
    expect(parRow('flaeche').classList.contains('bad') && /mm²/.test(parRow('flaeche').querySelector('.perr').textContent), `mm und mm² lassen sich nicht addieren (${parVal('flaeche')})`);
    setIn(parRow('flaeche'), 'expr', 'sqrt(breite*breite + tiefe*tiefe)');
    expect(!parRow('flaeche').classList.contains('bad') && /^78[.,]2/.test(parVal('flaeche')), `sqrt(mm²) ist wieder eine Länge (${parVal('flaeche')})`);
    setIn(parRow('flaeche'), 'expr', 'breite * tiefe');
    click('#dialog [data-cmd="par-ok"]');
    await sleep(400);
    editTimeline(C.doc.features.findIndex(f => f.id === 'bx'));
    await sleep(500);
    const wfeld = q('#dialog input[data-k="w"]');
    wfeld.value = 'flaeche'; wfeld.dispatchEvent(new W.Event('input', { bubbles: true }));
    expect(wfeld.classList.contains('bad') && /mm²/.test(wfeld.title), `mm² in einem Längenfeld ist ein Fehler (${wfeld.title})`);
    wfeld.value = 'breite'; wfeld.dispatchEvent(new W.Event('input', { bubbles: true }));
    expect(!wfeld.classList.contains('bad'), 'ein Ausdruck in mm passt wieder in das Längenfeld');
    click('#dialog [data-cmd="cancel"]'); await sleep(400);

    await cmd('solid:modify', 'params');
    const nameInput = [...D.querySelectorAll('#dialog .prow [data-par="name"]')].find(i => i.value === 'breite');
    expect(!!nameInput, 'Parameter breite zum Umbenennen');
    nameInput.value = 'laenge';
    nameInput.dispatchEvent(new W.Event('input', { bubbles: true }));
    prev = C.lastBuild;
    click('#dialog [data-cmd="par-ok"]');
    await built(prev, 20000);
    expect(C.doc.features.find(f => f.id === 'bx').exprs.w.e === 'laenge' && C.doc.params.some(p => p.name === 'bohrung' && /laenge/.test(p.expr)), 'Feature- und Parameter-Ausdrücke wurden umbenannt');
    expect(C.doc.configs.cols.includes('p:laenge') && !C.doc.configs.cols.includes('p:breite') && C.doc.configs.rows.every(r => Object.hasOwn(r.vals, 'p:laenge') && !Object.hasOwn(r.vals, 'p:breite')), 'Teilefamilien-Spalten und Variantenwerte wurden umbenannt');
    const sel = D.querySelector('#browser [data-cfgsel]');
    prev = C.lastBuild;
    sel.value = 'cS'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    await built(prev, 20000);
    near(await vol(C.lastBuild.bodies[0]), 80 * 40 * 5 - Math.PI * 4 ** 2 * 5, 1e-3, 'Variante funktioniert nach dem Umbenennen weiter');
  }],
  ['Konfigurationen: alle Varianten als ZIP exportieren', async () => {
    // Download abfangen und ZIP lesen (Verfahren „stored“)
    const grab = async run => {
      const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
      let got = null;
      proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
      try { await run(); await waitFor(() => got, 60000, 'Download'); } finally { proto.click = orig; }
      const u8 = new Uint8Array(await (await W.fetch(got.href)).arrayBuffer()), dv = new DataView(u8.buffer), files = [];
      for (let o = 0; dv.getUint32(o, true) === 0x04034b50;) { const n = dv.getUint16(o + 26, true), sz = dv.getUint32(o + 18, true), nm = new TextDecoder().decode(u8.slice(o + 30, o + 30 + n)); files.push({ nm, txt: new TextDecoder().decode(u8.slice(o + 30 + n, o + 30 + n + sz)) }); o += 30 + n + sz; }
      return { name: got.name, files };
    };
    await openExample('Platte Teilefamilie');
    await cmd('util:manage', 'configs');
    const z1 = await grab(async () => click('#dialog [data-cmd="cfg-export"][data-v="step"]'));
    expect(/Konfigurationen-STEP\.zip$/.test(z1.name) && z1.files.length === 3, `ZIP mit drei STEP-Dateien (${z1.files.map(f => f.nm).join(', ')})`);
    expect(z1.files.every(f => /ISO-10303-21/.test(f.txt)), 'gültige STEP-Inhalte');
    expect(C.doc.configs.active === 'cM', 'danach wieder Variante M aktiv');
    // Blech: Varianten „gebogen“ und „flach“ (Biegung unterdrückt) → DXF-Abwicklungen
    await openExample('Winkelblech gebogen 2mm');
    C.doc.configs = { cols: ['s:g1'], rows: [{ id: 'a', name: 'gebogen', vals: { 's:g1': false } }, { id: 'b', name: 'flach', vals: { 's:g1': true } }], active: 'a' };
    await cmd('util:manage', 'configs');
    const z2 = await grab(async () => click('#dialog [data-cmd="cfg-export"][data-v="dxf"]'));
    expect(z2.files.length === 2 && z2.files.every(f => /ENTITIES/.test(f.txt)), `zwei DXF-Abwicklungen (${z2.files.map(f => f.nm).join(', ')})`);
    expect(/BIEGUNG/.test(z2.files.find(f => /gebogen/.test(f.nm)).txt.split('ENTITIES')[1]) && !/BIEGUNG/.test(z2.files.find(f => /flach/.test(f.nm)).txt.split('ENTITIES')[1]), 'Biegelinie nur in der gebogenen Variante');
  }],
  ['Fertigungspaket: STEP, Abwicklung, Zeichnung als PDF, Stückliste', async () => {
    const grab = async run => {
      const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
      let got = null;
      proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
      try { await run(); await waitFor(() => got, 90000, 'Download'); } finally { proto.click = orig; }
      const u8 = new Uint8Array(await (await W.fetch(got.href)).arrayBuffer()), dv = new DataView(u8.buffer), files = [];
      for (let o = 0; dv.getUint32(o, true) === 0x04034b50;) { const n = dv.getUint16(o + 26, true), sz = dv.getUint32(o + 18, true); files.push({ nm: new TextDecoder().decode(u8.slice(o + 30, o + 30 + n)), data: u8.slice(o + 30 + n, o + 30 + n + sz) }); o += 30 + n + sz; }
      return { name: got.name, files };
    };
    const latin = u8 => { let t = ''; for (const b of u8) t += String.fromCharCode(b); return t; };
    await openExample('Winkelblech gebogen 2mm');
    click('[data-rtab="util"]'); await sleep(150);
    const z = await grab(async () => click('[data-cmd="mfg-package"]'));
    const nm = z.files.map(f => f.nm);
    expect(/Fertigung\.zip$/.test(z.name), 'Download „…-Fertigung.zip“');
    expect(['.step', '-Abwicklung.dxf', '-Zeichnung.pdf', '-Zeichnung.dxf', '-Stückliste.csv'].every(e => nm.some(x => x.endsWith(e))), `alle Teile im Paket (${nm.join(', ')})`);
    const pdf = latin(z.files.find(f => f.nm.endsWith('.pdf')).data);
    expect(pdf.startsWith('%PDF-1.4') && /startxref\n\d+\n%%EOF/.test(pdf) && /\/Count 1/.test(pdf), 'gültiges PDF mit einer Seite');
    expect(/\(Abwicklung\) Tj/.test(pdf) && /\(Winkelblech gebogen 2mm\) Tj/.test(pdf) && /nach oben/.test(pdf), 'Texte im PDF (Titel, Abwicklung, Biegerichtung)');
    const xr = Number(pdf.match(/startxref\n(\d+)/)[1]);
    expect(pdf.slice(xr, xr + 4) === 'xref', 'Querverweistabelle an der richtigen Stelle');
    const csv = new TextDecoder().decode(z.files.find(f => f.nm.endsWith('.csv')).data);
    expect(/1;1;"Winkelblech gebogen 2mm"/.test(csv), 'Stückliste mit einer Zeile');
    // Teilefamilie: je Variante ein Ordner
    await openExample('Platte Teilefamilie');
    await cmd('util:manage', 'configs');
    const zf = await grab(async () => click('#dialog [data-cmd="cfg-export"][data-v="pack"]'));
    const dirs = [...new Set(zf.files.map(f => f.nm.split('/')[0]))];
    expect(dirs.join() === 'S,M,L' && zf.files.filter(f => f.nm.endsWith('.pdf')).length === 3, `drei Ordner mit Zeichnungen (${dirs.join(', ')})`);
  }],
  ['STEP in ein neues Teil: mit eigenen Funktionen aufgebaut, per Maß änderbar', async () => {
    /* Platte 100 × 60 × 5 mit Loch ⌀ 10 und halbrundem Ausschnitt r 8 als STEP ausgeben und in ein neues, leeres Teil
       einlesen: cantcodecad baut sie selbst als Skizze + Extrusion auf, voll bemaßt ab der Ecke.
       V = (6000 − 25π − 32π) · 5 = 29 104,65. Maße im Skizzeneditor: Loch ⌀ 10 → 20 nimmt π · (100 − 25) · 5 = 1 178,10
       weg; Länge 100 → 120 setzt 20 · 60 · 5 = 6 000 an; Dicke 8 in der Zeitleiste → · 8/5. Eine Kugel (keine
       Extrusion, kein Blech) bleibt beim Aufbau über das Kontextmenü eingelesen. */
    await newDoc();
    const sk = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 100, y1: 60 }, { art: 'kreis', cx: 30, cy: 30, d: 10 }, { art: 'bogen', cx: 70, cy: 30, r: 8, a0: 0, a1: 180 }, { art: 'linie', x0: 62, y0: 30, x1: 78, y1: 30 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: sk.id, profiles: null, distance: 5, direction: 'normal', op: 'new' } });
    const { buf } = await C.kernel.exportFile(C.doc.features, 'step', {});
    await C.aiRun('feature_anlegen', { feature: { type: 'primitive', kind: 'sphere', d: 20, cx: 200, cy: 0, op: 'new', plane: { kind: 'origin', key: 'XY' } } });
    const { buf: bufK } = await C.kernel.exportFile(C.doc.features.slice(-1), 'step', {});
    await newDoc();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([new W.TextDecoder().decode(buf)], 'platte.step')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    const soll = (6000 - 25 * Math.PI - 32 * Math.PI) * 5;
    await waitFor(() => C.doc.features.length === 3 && /STEP mit eigenen Funktionen aufgebaut/.test(q('#toast').textContent), 30000, 'automatisch aufgebaut');
    const [imp, sk2, ex] = C.doc.features;
    expect(imp.type === 'import' && sk2.type === 'sketch' && ex.type === 'extrude' && Math.abs(ex.distance - 5) < 1e-6, `Import, Skizze, Extrusion 5 mm (${C.doc.features.map(f => f.type).join(', ')})`);
    expect(C.lastBuild.bodies.length === 1 && C.lastBuild.bodies[0] === ex.id && /1 Teil als Skizze \+ Extrusion/.test(q('#toast').textContent), `eingelesene Platte ersetzt (${q('#toast').textContent})`);
    near(await vol(ex.id), soll, 1e-3, 'Volumen wie die eingelesene Platte (29 104,65)');
    const P = sk2.points, R = sk2.rules;
    expect(Math.min(...P.map(p => p.x)) === 0 && Math.min(...P.map(p => p.y)) === 0, 'Ursprung der Skizze an der linken unteren Ecke');
    const dm = R.find(r => r.type === 'diameter' && Math.abs(r.value - 10) < 1e-6), lg = R.find(r => r.type === 'distance' && Math.abs(r.value - 100) < 1e-6);
    expect(dm && lg && R.filter(r => ['distance', 'hdistance', 'vdistance', 'diameter', 'radius'].includes(r.type)).length >= 6, `bemaßt: ${R.length} Abhängigkeiten, ⌀ 10 und Länge 100 dabei`);
    // Maß im Skizzeneditor ändern wie von Hand: Skizze bearbeiten, Maß öffnen, Wert tippen, Enter, Skizze fertig
    const mass = async (rid, v) => {
      editTimeline(C.doc.features.findIndex(f => f.id === sk2.id)); await waitFor(() => C.editor, 4000, 'Skizze offen');
      C.editor.openEditor(rid); await sleep(100);
      const inp = q('.sk-input'); inp.value = String(v); inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(300);
      await act(async () => { click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig'); });
    };
    await mass(dm.id, 20);
    near(await vol(ex.id), soll - Math.PI * 75 * 5, 1e-3, 'Loch ⌀ 20 per Maß (− 1 178,10)');
    await mass(lg.id, 120);
    near(await vol(ex.id), soll - Math.PI * 75 * 5 + 6000, 1e-3, 'Länge 120 per Maß (+ 6 000)');
    await C.aiRun('feature_aendern', { id: ex.id, aenderungen: { distance: 8 } });
    near(await vol(ex.id), (soll - Math.PI * 75 * 5 + 6000) * 8 / 5, 1e-3, 'Dicke 8 in der Zeitleiste');
    // Kugel dazu einlesen (Dokument nicht leer → kein Selbstaufbau), dann „Alle Teile dieses Imports aufbauen“: bleibt
    const ik = D.querySelector('#fileimport'), tk = new W.DataTransfer();
    tk.items.add(new W.File([new W.TextDecoder().decode(bufK)], 'kugel.step')); ik.files = tk.files; ik.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild.bodies.length === 2, 20000, 'Kugel eingelesen');
    const kugel = C.lastBuild.bodies.find(b => b !== ex.id), nf = C.doc.features.length;
    const bk = D.createElement('button'); bk.dataset.cmd = 'import-features'; bk.dataset.id = kugel; D.querySelector('#browser').appendChild(bk); bk.click(); bk.remove();
    await waitFor(() => /Kein Körper der STEP-Datei/.test(q('#toast').textContent), 20000, 'Meldung').catch(() => {});
    expect(C.doc.features.length === nf && C.lastBuild.bodies.includes(kugel) && /Kein Körper der STEP-Datei/.test(q('#toast').textContent), `Kugel: bleibt eingelesen (${q('#toast').textContent})`);
  }],
  ['STEP-Blechteil als Grundlasche und Biegungen aufbauen', async () => {
    /* Beispiel „U-Profil an zwei Linien gefaltet 2mm“ (t 2, R 2, K 0,44) als STEP ausgeben und neu einlesen; das Dokument
       bekommt absichtlich eine andere Blechregel (t 1, R 1). „Als Blechteil aufbauen“ → Skizze, Grundlasche, Skizze,
       Biegen mit eigener Regel t 2 / R 2 und zwei Linien zu 90°; Volumen wie das eingelesene Teil. Beide Biegungen auf 45°
       in der Zeitleiste: je Biegung ändert sich das Volumen von BA·t·w auf θ·t·(R + t/2)·w (BA = θ·(R + K·t)):
       ΔV = 2 · w · t · (π/4 − π/2) · ((R + t/2) − (R + K·t)) mit w = Breite des Profils. */
    await openExample('U-Profil an zwei Linien gefaltet 2mm');
    const v0 = await vol(C.lastBuild.bodies[0]);
    const { buf } = await C.kernel.exportFile(C.doc.features, 'step', {});
    await newDoc();
    C.doc.sheet = { t: 1, r: 1, k: 0.44 };
    // Dokument nicht leer (eine Skizze vorher): kein automatischer Aufbau, der Weg über das Kontextmenü
    await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'punkt', x: 0, y: 0 }] });
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([new W.TextDecoder().decode(buf)], 'u-profil.step')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1 && C.doc.features.some(f => f.type === 'import'), 20000, 'STEP eingelesen');
    const id = C.lastBuild.bodies[0];
    near(await vol(id), v0, 1e-3 * v0, 'eingelesen wie das Original');
    const n0 = C.doc.features.length;
    const b = D.createElement('button'); b.dataset.cmd = 'body-blech'; b.dataset.id = id; D.querySelector('#browser').appendChild(b); b.click(); b.remove();
    await waitFor(() => C.doc.features.length === n0 + 4 && C.lastBuild.bodies.includes(C.doc.features[n0 + 1].id), 30000, 'Blech-Features gebaut');
    await sleep(500);
    const [sk1, base, sk2, bend] = C.doc.features.slice(n0);
    expect(sk1.type === 'sketch' && base.type === 'sm_base' && sk2.type === 'sketch' && bend.type === 'sm_bend', 'Skizze, Grundlasche, Skizze, Biegen');
    const masse = sk => sk.rules.filter(r => ['distance', 'hdistance', 'vdistance', 'diameter', 'radius'].includes(r.type)).length;
    expect(masse(sk1) >= 2 && masse(sk2) >= 4 && Math.min(...sk1.points.map(p => p.x)) === 0, `Skizzen bemaßt ab der Ecke (Abwicklung ${masse(sk1)}, Biegelinien ${masse(sk2)} Maße)`);
    expect(Math.abs(base.regel.t - 2) < 1e-6 && Math.abs(base.regel.r - 2) < 1e-6 && Math.abs(bend.regel.t - 2) < 1e-6, `eigene Blechregel t ${base.regel.t}, R ${base.regel.r} (Dokument t 1)`);
    const L = Object.values(bend.linien);
    expect(L.length === 2 && L.every(x => Math.abs(x.angle - 90) < 0.5), `zwei Biegelinien zu 90° (${L.map(x => x.angle).join(', ')})`);
    expect(C.lastBuild.status[bend.id].ok && !C.lastBuild.bodies.includes(id), 'Biegen gebaut, eingelesener Körper ersetzt');
    near(await vol(base.id), v0, 1e-4 * v0, `Volumen wie das Teil (${v0.toFixed(2)})`);
    const bb = await bbox(base.id), w = Math.min(...[0, 1, 2].map(k => bb[1][k] - bb[0][k]).filter(x => x > 5));
    // Breite des Profils = Länge der Biegelinien
    const sk2p = sk2.points, lw = Math.hypot(sk2p[1].x - sk2p[0].x, sk2p[1].y - sk2p[0].y);
    const soll = v0 + 2 * lw * 2 * (Math.PI / 4 - Math.PI / 2) * ((2 + 1) - (2 + 0.44 * 2));
    await C.aiRun('feature_aendern', { id: bend.id, aenderungen: { linien: Object.fromEntries(Object.entries(bend.linien).map(([k, x]) => [k, { ...x, angle: 45 }])) } });
    near(await vol(base.id), soll, 1e-4 * v0, `beide Biegungen 45° (Hand ${soll.toFixed(2)}, Breite ${lw.toFixed(1)})`);
    void w;
    /* Weitere Teile: echtes Hutprofil aus einer STEP-Datei (t 1,5, vier Biegungen, beide Außenlaschen auf gleicher Höhe),
       Winkel mit Schlitz über der Biegung (eine Biegung, durch den Schlitz geteilt), Kasten aus Zuschnitt (vier
       Biegungen) – nachgebaut mit gleichem Volumen und gleicher Hülle wie das eingelesene Teil */
    const einlesen = async (name, text) => {
      const ip = D.querySelector('#fileimport'), tr = new W.DataTransfer();
      tr.items.add(new W.File([text], `${name}.step`)); ip.files = tr.files; ip.dispatchEvent(new W.Event('change', { bubbles: true }));
    };
    const nachbau = async (name, text) => {
      // Volumen und Hülle des eingelesenen Teils: einmal in ein Teil mit Skizze (kein Selbstaufbau) einlesen
      await newDoc(); await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'punkt', x: 0, y: 0 }] });
      await einlesen(name, text);
      await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1, 20000, `${name} eingelesen`);
      const vk = await vol(C.lastBuild.bodies[0]), bk = await bbox(C.lastBuild.bodies[0]);
      // dann in ein neues, leeres Teil: cantcodecad baut selbst auf
      await newDoc();
      const m0 = 1;
      await einlesen(name, text);
      await waitFor(() => C.doc.features.length === m0 + 4 && C.lastBuild.bodies.includes(C.doc.features[m0 + 1].id) && /STEP mit eigenen Funktionen/.test(q('#toast').textContent), 40000, `${name} als Blech`).catch(() => {});
      const bs = C.doc.features[m0 + 1], ok2 = bs && bs.type === 'sm_base' && C.lastBuild.bodies.includes(bs.id);
      const vb = ok2 ? await vol(bs.id) : 0, bbb = ok2 ? await bbox(bs.id) : null;
      const dbb = bbb ? Math.max(...bk.flat().map((x, i) => Math.abs(x - bbb.flat()[i]))) : Infinity;
      expect(ok2 && Math.abs(vb - vk) < 1e-4 * vk && dbb < 1e-3, `${name}: ${Object.keys((C.doc.features[m0 + 3] || {}).linien || {}).length} Biegungen, Volumen ${vb.toFixed(3)} / ${vk.toFixed(3)}, Hülle ±${dbb.toExponential(1)} (${ok2 ? '' : q('#toast').textContent})`);
    };
    await nachbau('Hutprofil', await (await W.fetch('/tests/fixtures/blech-profil.step', { cache: 'no-store' })).text());
    for (const bsp of ['Winkelblech mit Schlitz über Biegung 2mm', 'Kasten aus Zuschnitt gefaltet 2mm']) {
      await openExample(bsp);
      const { buf: b2 } = await C.kernel.exportFile(C.doc.features, 'step', {});
      await nachbau(bsp, new W.TextDecoder().decode(b2));
    }
  }],
  ['Abwicklung als Skizze bearbeiten und als DXF speichern', async () => {
    /* Winkelblech: Abwicklung → „Als Skizze bearbeiten“ legt Konturen und Biegelinien (Konstruktion) als Skizze rechts
       neben das Modell. Die DXF der Skizze muss dieselben Linien, Kreise und Biegelinien an derselben Stelle haben wie die
       DXF der Abwicklung; ein in der Skizze ergänztes Loch ⌀ 10 kommt als weiterer Innenkreis r 5 dazu. */
    const grab = async run => {
      const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
      let got = null;
      proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
      try { await run(); await waitFor(() => got, 20000, 'Download'); } finally { proto.click = orig; }
      return (await (await W.fetch(got.href)).text());
    };
    // DXF-Elemente eines Typs als „Layer:Werte“ (Gruppen paarweise: Code, Wert), sortiert
    const teile = (t, typ) => { const z = t.split(/\r?\n/), out = []; for (let k = 0; k + 1 < z.length; k += 2) { if (z[k].trim() !== '0' || z[k + 1] !== typ) continue; const g = []; let lay = ''; for (let j = k + 2; j + 1 < z.length && z[j].trim() !== '0'; j += 2) { if (z[j].trim() === '8') lay = z[j + 1]; else g.push(Number(z[j + 1]).toFixed(3)); } out.push(lay + ':' + g.join(',')); } return out.sort(); };
    const dxfVon = async i => grab(async () => { const b = D.createElement('button'); b.dataset.cmd = 'tl-dxf'; b.dataset.index = i; D.querySelector('#browser').appendChild(b); b.click(); b.remove(); });
    try { W.localStorage.removeItem('cantcodecad.dxf.test'); } catch (_) { /* egal */ }
    await openExample('Winkelblech gebogen 2mm');
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="flat"]'); await sleep(800);
    const t0 = await grab(async () => click('[data-cmd="flat-dxf"]'));
    const n0 = C.doc.features.length;
    click('[data-cmd="flat-sketch"]'); await sleep(600);
    const sk = C.doc.features[n0];
    expect(C.doc.features.length === n0 + 1 && sk.type === 'sketch' && sk.abwicklung && C.editor, 'Skizze mit Abwicklung angelegt und zum Bearbeiten offen');
    const biege = sk.curves.filter(c => c.cons && c.type === 'line').length;
    expect(biege === teile(t0, 'LINE').filter(x => x.startsWith('BIEGUNG')).length && biege > 0, `Biegelinien als Konstruktion (${biege})`);
    const mb = C.lastBuild.mesh.bbox, xs = sk.points.map(p => p.x);
    expect(Math.min(...xs) > mb[1][0] + 40, `rechts neben dem Modell (ab x ${Math.min(...xs).toFixed(1)}, Modell bis ${mb[1][0].toFixed(1)})`);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    const i = C.doc.features.findIndex(f => f.id === sk.id);
    let t1 = await dxfVon(i);
    for (const typ of ['LINE', 'ARC', 'CIRCLE']) expect(JSON.stringify(teile(t1, typ)) === JSON.stringify(teile(t0, typ)), `${typ}: gleich wie die Abwicklung (${teile(t1, typ).length})`);
    // Loch ⌀ 10 in die Skizze (Mitte der ersten Außenkontur-Hälfte) → ein INNEN-Kreis mehr
    const f = C.doc.features[i], ps = f.points, cx = (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x))) / 2, cy = (Math.min(...ps.map(p => p.y)) * 3 + Math.max(...ps.map(p => p.y))) / 4;
    f.points.push({ id: 'lochM', x: cx, y: cy }); f.curves.push({ id: 'loch', type: 'circle', c: 'lochM', r: 5 });
    t1 = await dxfVon(i);
    const k0 = teile(t0, 'CIRCLE').length, k1 = teile(t1, 'CIRCLE');
    expect(k1.length === k0 + 1 && k1.some(x => /,5\.000$/.test(x)), `ergänztes Loch als weiterer Kreis r 5 (${k0} → ${k1.length})`);
  }],
  ['DXF: Einstellungen für den Export, Layer-Auswahl beim Import', async () => {
    const grab = async run => {
      const proto = W.HTMLAnchorElement.prototype, orig = proto.click;
      let got = null;
      proto.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
      try { await run(); await waitFor(() => got, 20000, 'Download'); } finally { proto.click = orig; }
      return (await (await W.fetch(got.href)).text());
    };
    const setPrefs = async (vals, layers = {}) => {
      click('[data-cmd="dxf-settings"]'); await sleep(150);
      for (const [k, v] of Object.entries(vals)) { const el = q(`#dialog [data-dxf="${k}"]`); el.value = String(v); }
      for (const [r, v] of Object.entries(layers)) q(`#dialog [data-dxflayer="${r}"]`).value = v;
      click('#dialog [data-cmd="dxf-ok"]'); await sleep(150);
    };
    try { W.localStorage.removeItem('cantcodecad.dxf.test'); } catch (_) { /* egal */ }
    await openExample('Winkelblech gebogen 2mm');
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="flat"]'); await sleep(800);
    await setPrefs({ units: 'in', contour: 'polyline', bends: 'false' }, { contour: 'AUSSEN', inner: 'INNEN' });
    let t = await grab(async () => click('[data-cmd="flat-dxf"]'));
    expect(/\$INSUNITS\r\n70\r\n1\r\n/.test(t) && /AC1009/.test(t), 'Zoll, R12-Kopf');
    expect(/0\r\nPOLYLINE\r\n8\r\nAUSSEN/.test(t) && !/BIEGUNG/.test(t), 'Außenkontur als Polylinie auf AUSSEN, keine Biegelinie');
    const r = t.match(/0\r\nCIRCLE\r\n8\r\nINNEN\r\n10\r\n[^\r]+\r\n20\r\n[^\r]+\r\n30\r\n0\r\n40\r\n([^\r]+)/);
    expect(r && Math.abs(Number(r[1]) - 3.3 / 25.4) < 1e-6, `Bohrung als Kreis auf INNEN, r = 3,3 mm in Zoll (${r && r[1]})`);
    await setPrefs({ units: 'mm', curves: 'lines', tol: 0.01, bends: 'true' });
    t = await grab(async () => click('[data-cmd="flat-dxf"]'));
    expect(!/\r\nCIRCLE\r\n/.test(t) && /BIEGUNG/.test(t), 'Bögen in Linien aufgelöst, Biegelinie wieder da');
    await closeDrawing();
    try { W.localStorage.removeItem('cantcodecad.dxf.test'); } catch (_) { /* egal */ }
    // Import: Zoll ohne Angabe in der Datei, Layer TEXT weglassen, BIEGUNG als Hilfslinie
    await newDoc();
    const L = (lay, x1, y1, x2, y2) => `0\r\nLINE\r\n8\r\n${lay}\r\n10\r\n${x1}\r\n20\r\n${y1}\r\n11\r\n${x2}\r\n21\r\n${y2}\r\n`;
    const dxf = `0\r\nSECTION\r\n2\r\nENTITIES\r\n${L('KONTUR', 0, 0, 4, 0)}${L('KONTUR', 4, 0, 4, 2)}${L('KONTUR', 4, 2, 0, 2)}${L('KONTUR', 0, 2, 0, 0)}${L('BIEGUNG', 2, 0, 2, 2)}${L('TEXT', 0, 3, 4, 3)}0\r\nENDSEC\r\n0\r\nEOF\r\n`;
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([dxf], 'platte.dxf', { type: 'application/dxf' }));
    inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => D.querySelector('#dialog [data-cmd="dxfimp-ok"]'), 4000, 'Import-Dialog');
    const lay = n => q(`#dialog [data-dxflay="${n}"]`);
    expect(lay('BIEGUNG').value === 'aux' && lay('KONTUR').value === 'use', 'Biegelinien-Layer automatisch als Hilfslinie');
    lay('TEXT').value = 'skip';
    q('#dialog [data-dxf="unit"]').value = '25.4';
    click('#dialog [data-cmd="dxfimp-ok"]'); await sleep(300);
    const sk = C.doc.features.find(f => f.type === 'sketch' && f.name === 'platte');
    expect(sk && sk.curves.length === 5 && sk.curves.filter(c => c.cons).length === 1, `Skizze: 4 Konturlinien + 1 Hilfslinie, TEXT weggelassen (${sk && sk.curves.length})`);
    expect(sk && Math.max(...sk.points.map(p => p.x)) === 4 * 25.4, 'Zoll → mm (4 in = 101,6 mm)');
  }],
  ['STEP-Datei geht nur einmal an den Kern (danach nur der Schlüssel)', async () => {
    await newDoc();
    // mitschneiden, was an den Worker geht: je Auftrag, ob ein Import seinen Dateitext trägt
    const sent = [], w = C.kernel.worker, orig = w.postMessage;
    w.postMessage = function (msg, tr) {
      if (msg && msg.payload && Array.isArray(msg.payload.features)) {
        const imp = msg.payload.features.filter(f => f.type === 'import');
        if (imp.length) sent.push({ type: msg.type, mitDaten: imp.some(f => typeof f.data === 'string'), key: imp[0].dataKey });
      }
      return orig.call(this, msg, tr);
    };
    try {
      const text = await (await fetch('fixtures/nist_ctc_01.stp', { cache: 'no-store' })).text();
      const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
      dt.items.add(new W.File([text], 'nist_ctc_01.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
      await waitFor(() => C.lastBuild && C.lastBuild.mesh && C.lastBuild.mesh.faces.length === 139, 30000, 'STEP importiert');
      const { importKey } = await import('../src/importkey.js');
      const key = importKey(C.doc.features.find(f => f.type === 'import'));
      expect(sent.length && sent[0].mitDaten && sent[0].key === key, `erster Auftrag mit Dateitext und Schlüssel ${key}`);
      // Bedienschritt danach: nur noch der Schlüssel
      const n0 = sent.length;
      await cmd('solid:create', 'box'); num('w', 10); num('l', 10); num('h', 10); num('cx', 500); await seg('op', 'new'); await ok();
      const danach = sent.slice(n0).filter(x => x.type === 'build');
      expect(danach.length && danach.every(x => !x.mitDaten && x.key === key), `Folgebauten ohne Dateitext (${danach.length})`);
      const qd = C.lastBuild.mesh.bodies.find(b => b.bbox[0][0] > 400);
      expect(qd && C.lastBuild.bodies.length === 2, 'Quader als eigener Körper neben dem Import');
      near(await vol(qd.id), 1000, 1e-6, 'Quader 10 × 10 × 10');
      // Kern vergisst die Form (verdrängt, Speicher geleert): er fordert den Text nach, die Seite schickt ihn einmal mit
      await C.kernel.call('testForgetImport', { keys: [key] });
      const n1 = sent.length, prev = C.lastBuild;
      click('[data-cmd="undo"]');
      await built(prev, 30000);
      const nach = sent.slice(n1).filter(x => x.type === 'build');
      expect(nach.length >= 2 && !nach[0].mitDaten && nach[nach.length - 1].mitDaten, `ohne Text angefragt, Kern fordert nach, mit Text wiederholt (${nach.map(x => x.mitDaten ? 'mit' : 'ohne').join(', ')})`);
      expect(C.lastBuild.mesh.faces.length === 139 && C.lastBuild.bodies.length === 1, 'Import wieder da, Quader rückgängig');
      // Zeichnung und Export laufen über denselben Weg
      const n2 = sent.length;
      const buf = await C.kernel.exportFile(C.doc.features, 'step', {});
      const ex = sent.slice(n2);
      expect(buf && ex.length === 1 && !ex[0].mitDaten, 'STEP-Export ohne erneuten Dateitext');
      // aufräumen: der folgende Ablauf misst das erste Einlesen derselben Datei (Phasen, Flächenbeschreibung)
      await C.kernel.call('testForgetImport', { keys: [key] });
      await C.kernel.call('devClearMeshCache');
    } finally { w.postMessage = orig; }
  }],
  ['Bauantwort: Beschreibungen nur für neue Körpernetze, der Rest aus dem vorigen Netz', async () => {
    await newDoc();
    await C.kernel.call('devClearMeshCache');
    await cmd('solid:create', 'cylinder'); num('d', 10); num('h', 10); await ok();
    const text = await (await fetch('fixtures/nist_ctc_01.stp', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'nist_ctc_01.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.mesh && C.lastBuild.mesh.faces.length === 139 + 3, 30000, 'STEP importiert');
    const M1 = C.lastBuild.mesh, imp = C.doc.features.find(f => f.type === 'import');
    const b1 = M1.bodies.find(b => b.id === imp.id);
    expect(b1 && b1.uid && b1.faces[1] - b1.faces[0] === 139, 'Import-Körper mit Netzkennung, 139 Flächen');
    // Zylinder größer: anderes Netz davor, die Dreiecke des Imports rutschen im Gesamtnetz nach hinten
    editTimeline(0); await sleep(500); num('d', 80); await ok(20000);
    const M2 = C.lastBuild.mesh, b2 = M2.bodies.find(b => b.id === imp.id), ph = C.lastBuild.phasen;
    expect(ph.netzVerwiesen === 1 && ph.sendeFlaechen === 3, `nur die 3 Zylinderflächen geschickt, Import verwiesen (${ph.netzVerwiesen} verwiesen, ${ph.sendeFlaechen} Flächen geschickt)`);
    const dT = b2.tris[0] - b1.tris[0], dE = b2.evs[0] - b1.evs[0];
    expect(dT !== 0 && M2.faces.length === 142 && M2.edges.length === M1.edges.length, `Import verschoben um ${dT} Indizes, Gesamtzahlen stimmen`);
    const bi2 = M2.bodies.indexOf(b2);
    let ok1 = true, ok2 = true, ok3 = true;
    for (let k = 0; k < 139; k++) {
      const f1 = M1.faces[b1.faces[0] + k], f2 = M2.faces[b2.faces[0] + k];
      if (f2.start !== f1.start + dT || f2.count !== f1.count || f2.body !== bi2 || f2.type !== f1.type) ok1 = false;
      // dieselben Dreiecke: erste Ecke der Fläche in beiden Netzen am selben Ort
      const v1 = M1.index[f1.start], v2 = M2.index[f2.start];
      for (let a = 0; a < 3; a++) if (Math.abs(M1.positions[v1 * 3 + a] - M2.positions[v2 * 3 + a]) > 1e-9) ok2 = false;
    }
    for (let k = 0; k < b1.edges[1] - b1.edges[0]; k++) {
      const e1 = M1.edges[b1.edges[0] + k], e2 = M2.edges[b2.edges[0] + k];
      if (e2.start !== e1.start + dE || e2.count !== e1.count || e2.body !== bi2) ok3 = false;
      for (let a = 0; a < 3; a++) if (Math.abs(M1.edgePositions[e1.start * 3 + a] - M2.edgePositions[e2.start * 3 + a]) > 1e-9) ok3 = false;
    }
    expect(ok1, 'Flächen: Lage um die Verschiebung versetzt, Körpernummer neu');
    expect(ok2, 'Flächen zeigen auf dieselben Dreiecke wie vorher');
    expect(ok3, 'Kanten zeigen auf dieselben Kantenpunkte wie vorher');
    // Auswahl im Modell: eine Importfläche gehört zum Import-Körper
    const fi = b2.faces[0] + 5;
    expect(C.vp.cb && M2.bodies[M2.faces[fi].body].id === imp.id, 'Fläche → Import-Körper');
    near(await vol(C.lastBuild.bodies.find(id => id !== imp.id)), Math.PI * 40 * 40 * 10, 1e-3, 'Zylinder ⌀80 × 10');
    await C.kernel.call('testForgetImport', { keys: [(await import('../src/importkey.js')).importKey(imp)] });
    await C.kernel.call('devClearMeshCache');
  }],
  ['Elemente entfernen: Fase, Bohrung und importiertes STEP-Teil', async () => {
    // eigener Quader: Fase an einer oberen Kante, dann Bohrung → beide Flächen anklicken → wieder voller Quader
    await newDoc(); await box(80, 50, 20);
    const bb0 = C.lastBuild.mesh.bbox;
    await cmd('solid:modify', 'chamfer');
    pick(edges().find(e => e.info.type === 'LINE' && Math.abs(e.info.dir[0]) > 0.99 && Math.abs(e.info.p0[1] - bb0[0][1]) < 1e-6 && Math.abs(e.info.p0[2] - bb0[1][2]) < 1e-6));
    num('distance', 5); await ok();
    await cmd('solid:create', 'cylinder'); num('cx', (bb0[0][0] + bb0[1][0]) / 2); num('cy', (bb0[0][1] + bb0[1][1]) / 2); num('d', 10); num('h', 40); await seg('op', 'cut'); await ok();
    near(await vol(C.lastBuild.bodies[0]), 80 * 50 * 20 - 12.5 * 80 - Math.PI * 25 * 20, 1e-3, 'Fase und Bohrung vorhanden');
    await cmd('solid:modify', 'defeature');
    const ch = faces().find(f => f.info.type === 'PLANE' && Math.abs(f.info.n[0]) < 1e-6 && f.info.n[1] < -0.5 && f.info.n[2] > 0.5);
    const hole = faces().find(f => f.info.type === 'CYLINDRE');
    expect(ch && hole, 'Fasenfläche und Bohrung gefunden');
    pick(ch); pick(hole);
    expect(/2 Flächen/.test(q('#dialog').textContent), 'zwei Flächen gewählt');
    await ok();
    near(await vol(C.lastBuild.bodies[0]), 80 * 50 * 20, 1e-3, 'wieder voller Quader 80 × 50 × 20');
    const st = Object.values(C.lastBuild.status).find(x => /entfernt/.test(x.info || ''));
    expect(st && /1 Bohrung, 1 Fase entfernt/.test(st.info), `Status: ${st && st.info}`);
    // NIST CTC-01 (gemeinfreies Testteil): Automatik Bohrungen bis ⌀100, Rundungen bis R50
    await newDoc();
    // Eigener Netzdauerspeicher vor dem ersten Bau: sonst liefert ein früherer Lauf des Prüfstands
    // ein gespeichertes Netz, und was geprüft wird, ist nicht mehr der Weg durch den Kern.
    await C.kernel.call('devClearNetz');
    const text = await (await fetch('fixtures/nist_ctc_01.stp', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'nist_ctc_01.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length && C.lastBuild.mesh.faces.length === 139, 30000, 'STEP importiert');
    // Der Kern misst die Importphasen: STEP muss auf dem eigenen Weg gelesen werden (nicht über den
    // Rückfall in R.importSTEP), sonst fehlt die Zeitunterscheidung Datei/Übersetzen.
    const ph = C.lastBuild.phasen;
    expect(ph && ph.datei > 0 && ph.uebersetzen > 0 && !ph.fallback && ph.wurzeln > 0,
      `STEP-Phasen gemessen (Datei ${ph && ph.datei} ms, Übersetzen ${ph && ph.uebersetzen} ms, Wurzeln ${ph && ph.wurzeln})`);
    // Die schnelle Berandung muss tatsächlich benutzt werden: der Rückfall auf die exakte Anfrage
    // ist richtig, aber langsam, und in einer großen Baugruppe ist er der halbe Bau.
    expect(ph.huelle > 0 && !ph.huelleFallback, `Hüllbox ohne exakte Berandung (${ph.huelle} ms, ${ph.huelleFallback} Rückfälle)`);
    // Die Flächenbeschreibung kommt aus den fertigen Dreiecken, nicht mehr aus einer
    // Oberflächenintegration des Kerns (0,2 bis 2,3 ms je Fläche – an großen Baugruppen der
    // zweitgrößte Einzelposten eines Baus). Damit daran die Auswahl im Modell nicht zerfällt, muss
    // die Ebenengleichung unversehrt dastehen. Geprüft gegen einen unabhängigen Punkt der Fläche:
    // ihre eigenen Dreiecksecken. An ihnen muss der Abstand passen – sonst ist der Mittelpunkt
    // nicht auf der Fläche, und eine Arbeitsebene auf dieser Fläche schwebt über oder unter ihr.
    // Der Mittelpunkt muss außerdem innerhalb der Dreiecke seiner eigenen Fläche liegen.
    // Die Zähler zeigen, dass der neue Weg auch gegangen wurde.
    const skalar = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const mt = C.lastBuild.mesh, fl = mt.faces, E = mt.positions, I = mt.index;
    const eben = fl.filter(f => f.type === 'PLANE');
    const gewellt = fl.filter(f => f.type !== 'PLANE');
    // Anzeigepunkte stehen in einfacher Genauigkeit – die Prüfschwelle richtet sich nach der Baugröße.
    const diag = Math.hypot(...mt.bbox[1].map((v, j) => v - mt.bbox[0][j])) || 1;
    const grenze = Math.max(1e-4, diag * 1e-6);
    const grenzG = Math.max(1e-3, diag * 1e-5);
    // Ausdehnung der eigenen Dreiecke: der Schwerpunkt einer Punktmenge liegt immer in ihrer Hülle.
    const rand = f => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let k = f.start; k < f.start + f.count; k++) {
        const q = I[k] * 3, p = [E[q], E[q + 1], E[q + 2]];
        for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p[j]); hi[j] = Math.max(hi[j], p[j]); }
      }
      return { lo, hi };
    };
    const schief = eben.filter(f => {
      if (!f.n || !f.plane || Math.abs(skalar(f.n, f.n) - 1) > 1e-6) return true;
      const { lo, hi } = rand(f);
      for (let k = f.start; k < f.start + f.count; k++) {
        const q = I[k] * 3, p = [E[q], E[q + 1], E[q + 2]];
        if (Math.abs(skalar(f.n, p) - f.dist) > grenze) return true;
      }
      return f.center.some((v, j) => v < lo[j] - grenze || v > hi[j] + grenze) ||
        Math.abs(skalar(f.plane.n, f.center) - f.dist) > grenze;
    });
    expect(eben.length >= 20 && !schief.length && ph.fEben === eben.length,
      `${eben.length} ebene Flächen mit unveränderter Ebenengleichung (${schief.length} Ausreißer, Zähler ${ph.fEben})`);
    // Gekrümmte Flächen: derselbe Weg, aber ohne Ebenengleichung. Gegengeprüft wird gegen die vom
    // Kern geholten Zylinderangaben – der Mittelpunkt einer Zylinderfläche darf nicht außerhalb
    // ihres Zylinders liegen. Ein Mittelpunkt von der falschen Fläche wäre damit erfasst.
    const schiefG = gewellt.filter(f => {
      const { lo, hi } = rand(f);
      if (f.center.some((v, j) => v < lo[j] - grenzG || v > hi[j] + grenzG)) return true;
      if (f.type === 'CYLINDRE' && f.axis && f.axisO && f.radius) {
        const q = f.center.map((v, j) => v - f.axisO[j]), t = skalar(q, f.axis);
        if (Math.hypot(...q.map((v, j) => v - f.axis[j] * t)) > f.radius + grenzG) return true;
      }
      return false;
    });
    expect(gewellt.length >= 20 && !schiefG.length && ph.fGewellt === gewellt.length &&
      ph.fEben + ph.fGewellt + ph.fKern === fl.length,
      `${gewellt.length} gekrümmte Flächen mit Mittelpunkt aus den Dreiecken (${schiefG.length} Ausreißer, Zähler ${ph.fGewellt}/${ph.fKern}, Flächenbeschreibung ${ph.flaecheninfo.toFixed(0)} ms)`);
    // Die Hüllbox für die Anzeige kommt aus den fertigen Anzeigedaten (Dreiecke und Kantenlinien),
    // nicht mehr aus der exakten Berandung des Körpers – die war der größte Einzelposten eines
    // großen Baus (193 s von 406 s Netzerzeugung an 797 Körpern). Sie darf deshalb höchstens die
    // Vernetzungstoleranz von der wahren Form abweichen. Achtung: dieses Prüfteil hat Kanten ohne
    // Fläche, die weit über die Körper hinausreichen – nur beide Zahlenfelder zusammen sind richtig.
    // `lastBuild.bodies` sind die Körper-Bezeichner, keine Objekte – genau die fragt props. ab.
    const props = await Promise.all(C.lastBuild.bodies.map(id => C.kernel.props(id)));
    const form = [[0, 1, 2].map(k => Math.min(...props.map(p => p.bbox[0][k]))), [0, 1, 2].map(k => Math.max(...props.map(p => p.bbox[1][k])))];
    const ab = [0, 1, 2].map(k => Math.max(Math.abs(C.lastBuild.mesh.bbox[0][k] - form[0][k]), Math.abs(C.lastBuild.mesh.bbox[1][k] - form[1][k])));
    expect(Math.max(...ab) <= 0.2, `Hüllbox der Anzeige passt zur Form (größte Abweichung ${Math.max(...ab).toFixed(3)} mm, Anzeige ${JSON.stringify(C.lastBuild.mesh.bbox)}, Form ${JSON.stringify(form)})`);
    // Das fertige Anzeige-Netz bleibt im Browser erhalten: nach dem Löschen des Speicher-Caches darf
    // kein Körper neu trianguliert werden. Sonst braucht dasselbe Projekt nach jedem Neuladen wieder
    // die volle Zeit (gemessen an einer Baugruppe: 321,6 s von 321,8 s in der Netzerzeugung).
    await C.kernel.call('devClearMeshCache');
    const res2 = await C.kernel.build([...C.doc.features], undefined, {});
    const ph2 = res2 && res2.phasen;
    expect(res2 && res2.mesh.faces.length === 139 && ph2.netzeNeu === 0 && ph2.netzeAusDB >= 1,
      `Anzeige-Netz aus dem Dauerspeicher (${ph2 && ph2.netzeAusDB} aus Dauerspeicher, ${ph2 && ph2.netzeNeu} neu, ${ph2 && ph2.dbLesen} ms lesen)`);
    /* Zweistufige Netzerzeugung: ab einer bestimmten Zahl neu zu rechnender Netze bringt die grobe
       Fassung (Winkeltoleranz 0,8 rad) das Modell deutlich eher ins Bild, die feine zieht danach von
       selbst nach und überschreibt denselben Eintrag im Dauerspeicher. Geprüft wird das mit der
       Schwelle 1 – ohne sie bräuchte dieser Prüfstand eine Baugruppe mit vierzig Körpern.
       Der grobe Zwischenstand wird direkt am Kern abgelesen: an diesem Prüfteil ist die feine Fassung
       in rund 70 ms nachgezogen und hätte in der Oberfläche schon alles überdeckt, bevor der
       Zwischenstand abgefragt werden könnte. */
    const feinVorher = C.lastBuild.mesh.index.length / 3;
    const volumenVorher = C.lastBuild.mesh.bodies.map(b => b.volume);
    const imp = C.doc.features.findIndex(f => f.type === 'import');
    await C.kernel.call('devEval', { code: 'ctx.netzGrobAb(1)' });
    try {
      await C.kernel.call('devClearNetz');
      await C.kernel.call('devClearMeshCache');
      const onNetzWartend = C.kernel.onNetz, onVolWartend = C.kernel.onVolumen;
      let nachtrag = null, volnachtrag = null;
      C.kernel.onNetz = r => { nachtrag = r; };
      C.kernel.onVolumen = r => { volnachtrag = r; };
      try {
        const grob = await C.kernel.build([...C.doc.features], undefined, {});
        expect(grob.netzStufe === 'grob' && grob.netzWartet === 1 && grob.mesh && grob.mesh.index.length / 3 < feinVorher,
          `Erstanzeige in grober Fassung (Stufe ${grob.netzStufe}, ${grob.netzWartet} Körper warten, ${grob.mesh && grob.mesh.index.length / 3} von ${feinVorher} Dreiecken)`);
        /* Die grobe Fassung fragt das Volumen nicht genau, sondern nimmt es aus ihren eigenen
           Dreiecken: 58 ms je Körper an einer großen Baugruppe gegenüber 0,05 ms. Erlaubt ist ein
           Abstand von zwei Prozent, gemessen an diesem Prüfteil 0,114 Prozent. */
        const abw = Math.max(...grob.mesh.bodies.map((b, i) => Math.abs(b.volume - volumenVorher[i]) / volumenVorher[i] * 100));
        expect(grob.mesh.volumeAusNetz === 1 && grob.phasen.vAusNetz === 1 && abw < 2,
          `Volumen der groben Fassung aus dem Netz (${grob.phasen.vAusNetz} Körper, größte Abweichung ${abw.toFixed(3)} %)`);
        /* Die feine Fassung muss ohne weitere Bedienung nachkommen – und dabei Typ und Mittelpunkt
           aus der groben Fassung übernehmen, statt sie ein zweites Mal zu fragen (gemessen an einer
           Baugruppe: 74 s Flächenbeschreibung, beides hängt an der Form, nicht am Netz). Das Volumen
           dagegen rechnet sie nicht mitten im Nachtrag: gemessen 22,0 s von 161,0 s an der großen
           Baugruppe, und das Bild hängt nicht daran. Sie liefert zuerst den aus ihren eigenen
           feinen Dreiecken gewonnenen Wert, als vorläufig gekennzeichnet; der genaue kommt danach
           von selbst nach. Die Zahl der Flächen darf sich nicht ändern, nur ihre Dreiecksbereiche. */
        for (let i = 0; i < 80 && !nachtrag; i++) await sleep(250);
        const phf = nachtrag && nachtrag.phasen;
        const volNetzAbw = nachtrag ? Math.max(...nachtrag.mesh.bodies.map((b, i) => Math.abs(b.volume - volumenVorher[i]) / volumenVorher[i] * 100)) : 100;
        expect(nachtrag && nachtrag.bauId === grob.bauId && nachtrag.mesh.index.length / 3 === feinVorher &&
          phf.fGleich === 139 && !phf.fKern && nachtrag.mesh.faces.length === 139 &&
          nachtrag.mesh.volumeAusNetz === 1 && phf.vAusNetz === 1 && volNetzAbw < 0.5,
          `feine Fassung selbstständig nachgezogen (${phf ? `${phf.fGleich} Beschreibungen übernommen, ${phf.fKern} Kernanfragen, ${nachtrag.mesh.faces.length} Flächen, ${nachtrag.mesh.index.length / 3} Dreiecke, Volumen aus dem Netz mit ${volNetzAbw.toFixed(3)} % Abstand` : 'kein Nachtrag gekommen'})`);
        /* Und der genaue Wert folgt nach, ohne dass noch einmal vernetzt wird: der Nachtrag fragt
           nur das Volumen. Was die Oberfläche daraus macht, prüft der zweite Teil unten. */
        for (let i = 0; i < 120 && !volnachtrag; i++) await sleep(250);
        const volAbw = volnachtrag ? Math.max(...volnachtrag.volumina.map(([, v], i) => Math.abs(v - volumenVorher[i]) / volumenVorher[i])) : 1;
        expect(volnachtrag && volnachtrag.bauId === grob.bauId && volnachtrag.korper === 1 && volAbw < 1e-6,
          `genaue Volumen nach dem Bild nachgeliefert (${volnachtrag ? `${volnachtrag.korper} Körper in ${volnachtrag.ms} ms, größte Abweichung ${volAbw.toExponential(1)} %` : 'keine Nachricht gekommen'})`);
        const bestand = await C.kernel.call('devMeshStats');
        expect(!bestand.grob, `Dauerspeicher enthält nach der Verfeinerung wieder ausschließlich feine Netze (${bestand.grob} grobe von ${bestand.netze})`);
        /* Ein Bau mit zurückgezogener Zeitleiste – das ist `upTo` – rechnet nicht mehr zwangsweise
           fein. `auto` entscheidet nach dem Bestand: ist nichts da, bringt die grobe Fassung das Bild
           sofort und die feine zieht nach; ist alles fein vorhanden, bleibt es bei der feinen Stufe.
           Erzwungenes Fein warf bei einer großen Baugruppe die Vorarbeit des laufenden Nachtrags weg
           und rechnete alles im Bau selbst neu. */
        await C.kernel.call('devClearNetz');
        await C.kernel.call('devClearMeshCache');
        nachtrag = null;
        const rollen = await C.kernel.build([...C.doc.features], C.doc.features.length, {});
        expect(rollen && rollen.netzStufe === 'grob' && rollen.netzWartet === 1 && rollen.mesh &&
          rollen.mesh.index.length / 3 < feinVorher,
          `Bau mit zurückgezogener Zeitleiste beginnt grob (Stufe ${rollen && rollen.netzStufe}, ${rollen && rollen.netzWartet} Körper warten, ${rollen && rollen.mesh && rollen.mesh.index.length / 3} von ${feinVorher} Dreiecken)`);
        for (let i = 0; i < 80 && !nachtrag; i++) await sleep(250);
        expect(nachtrag && nachtrag.bauId === rollen.bauId && nachtrag.mesh.index.length / 3 === feinVorher,
          `und die feine Fassung kommt auch bei diesem Bau nach (${nachtrag ? `${nachtrag.mesh.index.length / 3} Dreiecke nach ${nachtrag.ms} ms` : 'kein Nachtrag gekommen'})`);
      } finally { C.kernel.onNetz = onNetzWartend; C.kernel.onVolumen = onVolWartend; }
      /* Zweiter Teil am Programm: unterdrücken und wieder aktivieren trägt den echten Bau, und die
         Oberfläche muss den Nachtrag übernehmen – bis in die Geometrie des Ansichtsfensters. */
      await C.kernel.call('devClearNetz');
      await C.kernel.call('devClearMeshCache');
      await act(() => C.toggleSuppress(imp), 30000);
      await act(() => C.toggleSuppress(imp), 30000);
      let uebernommen = null;
      for (let i = 0; i < 80 && !uebernommen; i++) {
        await sleep(250);
        const geo = C.vp.model && C.vp.model.geo;
        if (C.lastBuild.netzPhasen && C.lastBuild.netzWartet === 0 && geo && geo.index &&
          geo.index.count / 3 === feinVorher && C.lastBuild.mesh.faces.length === 139) uebernommen = C.lastBuild;
      }
      const geo = C.vp.model && C.vp.model.geo;
      expect(uebernommen, `Netztausch bis ins Ansichtsfenster (${geo && geo.index ? geo.index.count / 3 : '?'} von ${feinVorher} Dreiecken sichtbar)`);
      /* Was die Oberfläche mit den nachgelieferten Volumina macht: die Felder werden genau, und das
        `≈` vor den Massen im Körperbaum verschwindet von selbst – ohne weitere Bedienung. */
      await waitFor(() => C.lastBuild.mesh && !C.lastBuild.mesh.volumeAusNetz &&
        C.lastBuild.mesh.bodies.every(b => !b.volumeAusNetz), 30000, 'Volumen in der Oberfläche angekommen');
      const volAbw2 = Math.max(...C.lastBuild.mesh.bodies.map((b, i) => Math.abs(b.volume - volumenVorher[i]) / volumenVorher[i]));
      expect(volAbw2 < 1e-6, `genaue Volumen in der Oberfläche angekommen (größte Abweichung ${volAbw2.toExponential(1)})`);
      /* Dritte Öffnung derselben Datei: die feinen Netze liegen im Dauerspeicher, ihr Volumenwert ist
         der vorläufige aus dem Nachtrag – ein Netz wird nicht mehr gerechnet. Ohne den Volumennachtrag
         bliebe der Wert für immer vorläufig, und genau das war der Fehler: jeder Bau setzt den
         Abbruchschalter der Netzarbeit, und nur die Netzverfeinerung hebt ihn wieder auf. Deshalb wird
         hier zuerst der Vorrat der genauen Werte geleert, damit der Durchgang laufen muss. */
      await C.kernel.call('devClearMeshCache');
      await C.kernel.call('devClearVol');
      await act(() => C.toggleSuppress(imp), 30000);
      await act(() => C.toggleSuppress(imp), 30000);
      const dritter = C.lastBuild;
      expect(dritter.netzStufe === 'fein' && dritter.netzWartet === 0 && dritter.mesh.index.length / 3 === feinVorher,
        `Netz aus dem Dauerspeicher ohne Nachtrag (${dritter.netzStufe}, ${dritter.netzWartet} warten, ${dritter.mesh.index.length / 3} von ${feinVorher} Dreiecken)`);
      await waitFor(() => C.lastBuild.mesh && !C.lastBuild.mesh.volumeAusNetz &&
        C.lastBuild.mesh.bodies.every(b => !b.volumeAusNetz), 30000, 'Volumen aus dem Dauerspeicher nachgezogen');
      const ph3 = C.lastBuild.phasen || {};
      expect(ph3.volFehlt === 1, `genaue Bestimmung ohne Netznachtrag gesucht (${ph3.volFehlt})`);
      /* Der Wert wird am Ende des Durchgangs im Dauerspeicher gemerkt, die Meldung kommt vorher –
         gewartet wird also bis der Kern keinen Nachtrag mehr meldet, nicht bis die Oberfläche
         genau aussieht. Sonst stünde hier eine Zahl, die gerade noch geschrieben wird. */
      for (let i = 0; i < 40; i++) {
        if (await C.kernel.call('devEval', { code: 'return !ctx.netzLaeuft();' })) break;
        await sleep(250);
      }
      /* Der gemerkte Wert liegt im Dauerspeicher, nicht im Bau: die Oberfläche hat zur Antwortzeit
       einen Stand der Bauzeit kopiert – nachzusehen ist er deshalb dort. */
      const nachVol = await C.kernel.call('devMeshStats');
      expect(nachVol.volVorrat === 1, `bestimmter Wert im Dauerspeicher gemerkt (${nachVol.volVorrat} Werte)`);
      const volAbw3 = Math.max(...C.lastBuild.mesh.bodies.map((b, i) => Math.abs(b.volume - volumenVorher[i]) / volumenVorher[i]));
      expect(volAbw3 < 1e-6, `genaue Volumen auch ohne Netznachtrag nachgeliefert (größte Abweichung ${volAbw3.toExponential(1)})`);
      /* Vierte Öffnung: jetzt liegt beides im Dauerspeicher – Netz und Wert. Die Werte gehören in den
         Bau selbst, nicht in eine Nachlieferung: an einer großen Baugruppe kostet die Bestimmung auf
         frisch gelesenen Formen ein Vielfaches (gemessen über 13 min gegen 24,8 s), und sie hängt an
         der Form, nicht an der Netzdichte. */
      await C.kernel.call('devClearMeshCache');
      await act(() => C.toggleSuppress(imp), 30000);
      await act(() => C.toggleSuppress(imp), 30000);
      const vierter = C.lastBuild;
      expect(vierter.netzWartet === 0 && !vierter.mesh.volumeAusNetz &&
        vierter.mesh.bodies.every(b => !b.volumeAusNetz),
        `genaue Volumen im Bau selbst gefunden (${(vierter.phasen || {}).volAusDB} aus dem Vorrat)`);
      const volAbw4 = Math.max(...vierter.mesh.bodies.map((b, i) => Math.abs(b.volume - volumenVorher[i]) / volumenVorher[i]));
      const schlecht = vierter.mesh.bodies.find((b, i) => b.volume !== volumenVorher[i]);
      expect((vierter.phasen || {}).volAusDB === 1 && volAbw4 < 1e-6,
        `Volumen-Vorrat wiedergefunden (${(vierter.phasen || {}).volAusDB} Werte, größte Abweichung ${volAbw4.toExponential(1)}, ` +
        `letzter Körper ${schlecht ? `${schlecht.volume} statt ${volumenVorher[vierter.mesh.bodies.indexOf(schlecht)]}` : 'keiner'})`);
    } finally {
      // Die Schwelle wieder auf den Programmwert: ohne sie liefe der Rest des Prüfstands zweistufig.
      await C.kernel.call('devEval', { code: 'ctx.netzGrobAb(40)' });
    }
    await cmd('solid:modify', 'defeature');
    num('autoHoles', 100); num('autoFillets', 50);
    await ok(40000);
    await waitFor(() => Object.values(C.lastBuild.status).some(x => /entfernt/.test(x.info || '')), 30000, 'vereinfacht');
    const st2 = Object.values(C.lastBuild.status).find(x => /entfernt/.test(x.info || ''));
    const types = {}; C.lastBuild.mesh.faces.forEach(x => { types[x.type] = (types[x.type] || 0) + 1; });
    expect(/10 Bohrungen, 41 Rundungen entfernt/.test(st2.info), `Status: ${st2.info}`);
    expect(C.lastBuild.mesh.faces.length === 90 && !types.CONE, `90 Flächen, keine Bohrspitzen (${C.lastBuild.mesh.faces.length}, ${JSON.stringify(types)})`);
  }],
  ['Zweistufige Netze: selbst geformte Körper bleiben fein', async () => {
    /* Die grobe Erstfassung spart nur an Körpern, deren Netz in einem Bestand wiederzufinden ist –
       also an importierten. Alles, was das Programm selbst formt, hat keinen Netz-Schlüssel und würde
       im Nachtrag ein zweites Mal trianguliert. Diese Körper bekommen deshalb in beiden Stufen die
       feine Fassung, und der Nachtrag übernimmt sie aus dem Bau. Geprüft wird das an einem eigenen
       Quader neben dem importierten Prüfteil, mit der Schwelle 1. */
    await newDoc(); await box(80, 50, 20);
    await C.kernel.call('devClearNetz');
    const text = await (await fetch('fixtures/nist_ctc_01.stp', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'nist_ctc_01.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length >= 2, 30000, 'Quader und STEP-Teil zusammen');
    const koerper = C.lastBuild.bodies.length, dreieckeFein = C.lastBuild.mesh.index.length / 3;
    await C.kernel.call('devEval', { code: 'ctx.netzGrobAb(1)' });
    try {
      await C.kernel.call('devClearNetz');
      await C.kernel.call('devClearMeshCache');
      const onNetzWartend = C.kernel.onNetz;
      let nachtrag = null;
      C.kernel.onNetz = r => { nachtrag = r; };
      try {
        const grob = await C.kernel.build([...C.doc.features], undefined, {});
        expect(grob.netzStufe === 'grob' && grob.netzWartet === 1 && grob.phasen.netzeNeu === koerper &&
          grob.mesh.index.length / 3 < dreieckeFein,
          `nur der Import wird grob gerechnet (Stufe ${grob.netzStufe}, ${grob.netzWartet} von ${koerper} Körpern warten, ${grob.mesh && grob.mesh.index.length / 3} von ${dreieckeFein} Dreiecken})`);
        for (let i = 0; i < 80 && !nachtrag; i++) await sleep(250);
        const phf = nachtrag && nachtrag.phasen;
        // Nichts darf doppelt gerechnet werden: der Quader kommt aus dem Bau, nur der Import neu.
        expect(phf && phf.netzeAusBau >= 1 && phf.netzeNeu + phf.netzeAusBau === koerper &&
          nachtrag.mesh.index.length / 3 === dreieckeFein,
          `selbst geformte Körper werden nicht ein zweites Mal trianguliert (${phf ? `${phf.netzeAusBau} aus dem Bau übernommen, ${phf.netzeNeu} neu gerechnet, ${nachtrag.mesh.index.length / 3} von ${dreieckeFein} Dreiecken` : 'kein Nachtrag gekommen'})`);
      } finally { C.kernel.onNetz = onNetzWartend; }
    } finally {
      await C.kernel.call('devEval', { code: 'ctx.netzGrobAb(40)' });
    }
  }],
  ['Zweistufige Netze: lineare Toleranz an Freiformflächen', async () => {
    /* An einer großen Baugruppe hängen 45 % aller Dreiecke an doppelt gekrümmten Flächen, und dort
       entscheidet die lineare Toleranz über die Netzdichte, nicht der Winkel (gemessen an einer
       Freiformfläche: 1 148 Dreiecke bei 0,082 mm, 414 bei 0,327 mm – jeweils bei gleichem Winkel).
       Die grobe Fassung setzt deshalb beide herauf: Winkeltoleranz und lineare Toleranz. Geprüft
       wird das an einem eigenen Prüfteil – ein splineberandetes Profil, 70 mm extrudiert, 117 mm
       Diagonale, womit die Anwendung 0,070 mm lineare Toleranz einsetzt. Verglichen wird die grobe
       Fassung mit einer, die nur den Winkel herabsetzt: der Abstand beider Zahlen ist der Beweis,
       dass auch die Toleranz wirkt. */
    await newDoc();
    await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'punkt', x: 0, y: 0 }] }); // nicht leer: kein Selbstaufbau als Features
    const text = await (await fetch('fixtures/freiform.stp', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'freiform.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1, 30000, 'Freiformteil importiert');
    const fein = C.lastBuild.mesh.index.length / 3;
    const volGenau = C.lastBuild.mesh.bodies[0].volume;
    const typen = {}; C.lastBuild.mesh.faces.forEach(f => { typen[f.type] = (typen[f.type] || 0) + 1; });
    expect(fein > 5000 && typen.EXTRUSION_SURFACE === 3, `Prüfteil mit Freiformflächen gebaut (${fein} Dreiecke, ${JSON.stringify(typen)})`);
    await C.kernel.call('devEval', { code: 'ctx.netzGrobAb(1)' });
    try {
      await C.kernel.call('devClearNetz');
      await C.kernel.call('devClearMeshCache');
      const grob = await C.kernel.build([...C.doc.features], undefined, {});
      /* Die automatische Verfeinerung läuft noch. Vor dem nächsten Bau muss sie durch sein – sonst
         schreibt sie ihr feines Netz in den Dauerspeicher, nachdem der geleert wurde, und der zweite
         Bau fände es dort, statt grob zu triangulieren. */
      await C.kernel.call('devEval', { code: 'for (let i = 0; i < 200 && ctx.netzLaeuft(); i++) await new Promise(r => setTimeout(r, 25)); return ctx.netzLaeuft();' });
      await C.kernel.call('devEval', { code: 'ctx.netzTol(1)' });
      await C.kernel.call('devClearNetz');
      await C.kernel.call('devClearMeshCache');
      const nurWinkel = await C.kernel.build([...C.doc.features], undefined, {});
      expect(grob.netzStufe === 'grob' && nurWinkel.netzStufe === 'grob' &&
        grob.mesh.index.length / 3 < 0.6 * (nurWinkel.mesh.index.length / 3),
        `grobe Fassung setzt auch die lineare Toleranz herauf (${grob.mesh.index.length / 3} Dreiecke mit, ${nurWinkel.mesh.index.length / 3} ohne, feine Fassung ${fein})`);
      const abw = Math.abs(grob.mesh.bodies[0].volume - volGenau) / volGenau * 100;
      expect(abw < 1, `Volumen der groben Fassung an Freiformflächen unter einem Prozent Abstand (${abw.toFixed(2)} % von ${volGenau.toFixed(0)} mm³)`);
    } finally {
      /* Nachlaufen lassen, damit die Verfeinerung nicht in den nächsten Ablauf hineinreicht, und die
         Einstellungen der groben Stufe wieder auf den Programmwert setzen. */
      await C.kernel.call('devEval', { code: 'for (let i = 0; i < 400 && ctx.netzLaeuft(); i++) await new Promise(r => setTimeout(r, 25)); return ctx.netzLaeuft();' });
      await C.kernel.call('devEval', { code: 'ctx.netzGrobAb(40); ctx.netzTol(4);' });
    }
  }],
  ['Netzlücken: Flächen ohne Dreiecke werden nachgefragt', async () => {
    /* Der Mescher gibt für manche Flächen ein leeres Netz zurück – kein Fehler, nur nichts. An der
       großen Baugruppe betrifft das 130 von 50 909 Flächen, fast alles beschnittene Kegel; in der
       Anzeige sind das Löcher, weil die Kanten dieser Flächen wohlgezeichnet werden. Der Kern fragt
       solche Flächen einzeln mit gröberen Einstellungen nach (NETZ_NACHHOL). Das Prüfstück sind drei
       dieser Kegelflächen aus der großen Datei, als Verbund von Flächen importiert – 77 mm
       Diagonale, also praktisch dieselbe Toleranz wie dort. Ohne die Nachfrage bringt der feine
       Mescher für alle drei Flächen null Dreiecke hervor (gemessen), mit ihr 3 von 3. */
    await newDoc();
    const text = await (await fetch('fixtures/netzuecke.stp', { cache: 'no-store' })).text();
    const inp = D.querySelector('#fileimport'), dt = new W.DataTransfer();
    dt.items.add(new W.File([text], 'netzuecke.stp')); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1, 30000, 'Prüfstück importiert');
    const ph = C.lastBuild.phasen;
    // Flächenzahl des Kerns (devEval läuft als Funktionskörper, dort gehört `return` dazu).
    const kernFl = await C.kernel.call('devEval', { code: 'return ctx.bodies().reduce((n, b) => n + b.shape.faces.length, 0);' });
    const dreiecke = C.lastBuild.mesh.index.length / 3;
    const leer = C.lastBuild.mesh.faces.filter(f => !(f.count > 0)).length;
    expect(kernFl === 3 && ph.fFlicken === 3 && ph.fOhneNetz === 0 && !leer &&
      C.lastBuild.mesh.faces.length === 3 && dreiecke > 0,
      `alle drei Kegelflächen nachgefragt (${ph.fFlicken} geflickt, ${ph.fOhneNetz} offen geblieben, ` +
      `${C.lastBuild.mesh.faces.length}/${kernFl} Flächen beschrieben, ${dreiecke} Dreiecke in ${ph.netzLuecken} ms)`);
    /* Der Dauerspeicher haben reicht nicht – er darf auch nicht weggeräumt werden, sonst ist jede
       zweite Öffnung wieder eine erste. An der großen Baugruppe gemessen: mit vollständigem Speicher
       8,6 s für die zweite Öffnung, nach einer Räumung 20 s, weil 595 von 797 Netzen neu gerechnet
       werden mussten. Die Seite fragt deshalb beim Browser nach (im Worker gibt es `persist` nicht),
       und ohne dauerhafte Erlaubnis fragt sie bei der ersten Bedienung erneut – ohne Nutzeraktion
       lehnt der Browser ab (gemessen: false). */
    await waitFor(() => C.speicher && C.speicher.angefragt > 0, 10000, 'Speicherabfrage gelaufen');
    const speicher = C.speicher;
    expect(typeof speicher.dauerhaft === 'boolean' && speicher.gemessen > 0 &&
      typeof speicher.benutzt === 'number' && typeof speicher.kontingent === 'number',
      `Dauerspeicher beim Browser angemeldet: ${speicher.dauerhaft ? 'dauerhaft' : 'ohne dauerhafte Erlaubnis'} ` +
      `(${(speicher.benutzt / 1e6).toFixed(1)} von ${(speicher.kontingent / 1e6).toFixed(0)} MB)`);
    if (!speicher.dauerhaft) {
      /* Nach der ersten Bedienung ist die zweite Anfrage fällig – in dieser Seite aber womöglich
         schon längst passiert, weil frühere Abläufe klicken. Gefragt wird deshalb nur, wenn noch
         keine Bedienung gelaufen ist; sonst wird das Ergebnis nachgelesen. */
      if (speicher.angefragt === 1) {
        W.dispatchEvent(new W.Event('pointerdown'));
        await waitFor(() => C.speicher.angefragt > 1, 10000, 'erneute Anfrage nach Bedienung');
      }
      expect(C.speicher.angefragt >= 2,
        `nach einer Bedienung erneut gefragt (${C.speicher.angefragt} Anfragen, dauerhaft: ${C.speicher.dauerhaft})`);
    }
    /* Ohne die Nachfrage fehlt hier jede Fläche: der Mescher liefert für alle drei Kegelflächen ein
       leeres Netz, der Körper hat dann keine einzige beschriebene Fläche – genau das, was die
       Anzeige als Loch zeigt (ihre Kanten werden gezeichnet). */
    const stufen = await C.kernel.call('devEval', { code: 'return ctx.netzNachhol();' });
    await C.kernel.call('devEval', { code: 'ctx.netzNachhol([])' });
    try {
      await C.kernel.call('devClearNetz');
      await C.kernel.call('devClearMeshCache');
      const ohne = await C.kernel.build([...C.doc.features], undefined, {});
      expect(ohne.phasen.fFlicken === 0 && ohne.phasen.fOhneNetz === 3 && !ohne.mesh.faces.length,
        `ohne Nachfrage bleiben alle drei Flächen ohne Dreiecke (${ohne.mesh.faces.length} beschriebene Flächen, ${ohne.mesh.index.length / 3} Dreiecke)`);
    } finally {
      await C.kernel.call('devEval', { code: `ctx.netzNachhol(${JSON.stringify(stufen)})` });
    }
  }],
  ['Blech: runder Eckfreischnitt aus der Blechregel', async () => {
    await openExample('Kasten Blech 2mm');
    const v0 = await vol(C.lastBuild.bodies[0]);
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="sm_rule"]');
    await waitFor(() => !D.querySelector('#dialog').hidden && D.querySelector('#dialog [data-rule="cornerRelief"]'), 4000, 'Blechregel');
    q('#dialog [data-rule="cornerRelief"]').value = 'round';
    q('#dialog [data-rule="cornerReliefD"]').value = '4';
    const prev = C.lastBuild;
    click('#dialog [data-cmd="sm-rule-ok"]');
    await built(prev, 20000);
    expect(C.doc.sheet.cornerRelief === 'round' && C.doc.sheet.cornerReliefD === 4, 'Regel gespeichert');
    let v1 = v0;
    for (let i = 0; i < 40 && Math.abs(v1 - v0) < 1e-6; i++) { await sleep(250); v1 = await vol(C.lastBuild.bodies[0]); }
    near(v0 - v1, 4 * 0.75 * Math.PI * 4 * 2, 1e-3, '4 Ecken × ¾ Kreis r 2 × t 2');
    click('[data-cmd="flat"]'); await sleep(600);
    const S = await import('../src/sheet.js'), fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    expect(fl.contour.length === 1 && fl.contour[0].edges.filter(e => e.type === 'arc').length === 4, 'Abwicklung: eine Kontur mit vier Eckbögen');
    await closeDrawing();
  }],
  ['Blech: Reißecke ohne Freischnitt', async () => {
    await openExample('Kasten Blech 2mm');
    // Der Kernaufbau des vorigen Falls kann noch kurz nach dem Öffnen eintreffen.
    // Erst die bekannte quadratische Ausgangsgeometrie dieses Beispiels verwenden.
    let v0 = 0;
    for (let i = 0; i < 30; i++) {
      v0 = await vol(C.lastBuild.bodies[0]);
      if (Math.abs(v0 - 29361.274) < 1e-3) break;
      await sleep(100);
    }
    near(v0, 29361.274, 1e-3, 'Ausgangsmodell mit quadratischem Eckfreischnitt aufgebaut');
    const flange = C.doc.features.findIndex(f => f.type === 'sm_flange');
    editTimeline(flange);
    await waitFor(() => D.querySelector('#dialog select[data-segsel="corners"]'), 4000, 'Laschendialog mit Eckenauswahl');
    const choices = [...q('#dialog select[data-segsel="corners"]').options].map(o => o.value);
    expect(choices.includes('tear'), 'Reißecke ist auswählbar');
    await seg('corners', 'tear');
    await ok();
    expect(C.doc.features[flange].corners === 'tear', 'Reißecke im Feature gespeichert');
    const v1 = await vol(C.lastBuild.bodies[0]);
    // Je Ecke bleiben Grundfläche (4 × 4 × 2) und die zuvor an beiden Laschenenden
    // verkürzten Biege-/Schenkelquerschnitte erhalten.
    near(v1 - v0, 4 * (2 * 4 * (26 * 2 + 3 * Math.PI)) + 4 * 4 * 4 * 2, 1e-3, 'Ecken und Laschenenden bleiben ohne Freischnitt erhalten');
    const S = await import('../src/sheet.js'), fl = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    expect(fl.contour.length === 1 && !fl.contour[0].edges.some(e => e.type === 'arc'), 'Abwicklung ohne Eckfreischnittbogen');
  }],
  ['Blech: Kegelecken (Formschräge) und Kugelecken abwickeln', async () => {
    // Band: Wanne 100 × 60 R8, Formschräge 10°, t 2, k 0,44 ohne Boden (ab z 2,5), hinten mittig 2 mm geschlitzt.
    // Außenkegel r(z) = 8 + z·tan 10°, neutral um (1 − k)·t = 1,12 senkrecht zur Fläche → Radius r − 1,12·cos 10°.
    // Unten (z 2,5): 84 + 2·44 + 2·41 + 4·(8,4408 − 1,1030)·π/2 = 300,10; oben (z 30): 84 + 88 + 82 + 4·(13,2899 − 1,1030)·π/2
    // = 330,57; Schlitzkanten 27,5 / cos 10° = 27,924 → Umfang 686,52. Fächer: 4 · 90° · sin 10° = 62,51° zwischen den Schlitzkanten.
    await openExample('Band mit Formschräge abgewickelt 2mm');
    let u = C.lastBuild.sheet.unfold;
    expect(u && u.contour.length === 1 && u.crossings === 0 && u.bends.length === 4 && u.bends.every(b => / Kegel$/.test(b.label) && /^90°/.test(b.label)), `vier Kegelbiegungen 90° (${u && u.bends.map(b => b.label).join(', ')})`);
    const L = e => Math.hypot(e.a[0] - e.b[0], e.a[1] - e.b[1]);
    near(u.contour[0].edges.reduce((a, e) => a + L(e), 0), 686.52, 0.05, 'Umfang des Bands = Handrechnung');
    const sl = u.contour[0].edges.filter(e => Math.abs(L(e) - 27.924) < 0.01), ang = e => Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    expect(sl.length === 2, 'zwei Schlitzkanten 27,924 mm');
    near(180 - ((((ang(sl[0]) - ang(sl[1])) * 180 / Math.PI) + 720) % 180), 4 * 90 * Math.sin(10 * Math.PI / 180), 0.01, 'Fächerwinkel 62,51°');
    // Wanne mit Boden: Kegelecken mit Eckfreischnitt (Schlitz in der Winkelhalbierenden, rund am Boden), ohne Überschneidung
    await openExample('Wanne mit Formschräge in Blech umgewandelt 2mm');
    u = C.lastBuild.sheet.unfold;
    expect(u.crossings === 0 && u.bends.filter(b => / Kegel$/.test(b.label)).length === 8 && u.bends.filter(b => /^80° .* R0$/.test(b.label)).length === 4, `Boden 4 × 80°, Ecken 8 Kegelhälften (${u.bends.map(b => b.label).join(', ')})`);
    expect(/4 Eckfreischnitte/.test(C.lastBuild.status[C.doc.features.find(f => f.type === 'sm_convert').id].info), 'vier Eckfreischnitte');
    // Kugelecken (Boden- und Eckkanten R8): nicht abwickelbar, die Ecke bleibt offen. Boden 84 × 44, Biegung neutral
    // (6 + 0,88)·π/2 = 10,807, Wand 22 → halbe Breite 42 + 10,807 + 22 = 74,807
    await openExample('Schale mit Kugelecken in Blech umgewandelt 2mm');
    u = C.lastBuild.sheet.unfold;
    near(u.bb[1][0] - u.bb[0][0], 2 * 74.807, 0.01, 'Kugelecken: Breite der Abwicklung');
    expect(u.crossings === 0 && u.contour.length === 1, 'Kugelecken: eine Kontur ohne Überschneidung');
  }],
  ['Blech: Eckfreischnitte in der Abwicklung eines umgewandelten Kastens', async () => {
    await openExample('Kasten mit runden Ecken in Blech umgewandelt 2mm');
    const cv = C.doc.features.find(f => f.type === 'sm_convert');
    const meldung = () => ((C.lastBuild.status || {})[cv.id] || {}).info || '';
    expect(/4 Eckfreischnitte/.test(meldung()), `vier Eckfreischnitte gemeldet (${meldung()})`);
    const S = await import('../src/sheet.js');
    const fl = () => S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    /* An jeder Ecke trifft das Eckband auf den Boden (Dreifach-Ecke): der Freischnitt dort ist eine Kerbe,
       quadratisch parallel zu den Wänden oder rund um die Eckachse. Seitenlänge der quadratischen Kerbe in der
       Abwicklung: (R 4 + 0,5) + 4 (Eckachse bis Bodenrand) + (t + Breite = 4) − (2t − BA = 2,618) = 9,882 mm.
       Am Modell selbst ändert nichts – es wird nur die Form geschnitten, die abgewickelt wird. */
    const lang = e => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const kerbe = f => f.contour[0].edges.filter(e => e.type === 'line' && Math.abs(lang(e) - 9.882) < 0.01).length;
    const radius = e => { const [a, b, c] = [e.a, e.mid, e.b], d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (!d) return 0; const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2; const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d; return Math.hypot(a[0] - ux, a[1] - uy); };
    const bogig = f => f.contour[0].edges.filter(e => e.type === 'arc' && e.mid && Math.abs(radius(e) - 4.5) < 0.01).length;
    const v0 = await vol(C.lastBuild.bodies[0]);
    let f0 = fl();
    expect(f0.contour.length === 1 && !f0.holes.length, `Abwicklung als eine Kontur ohne Löcher (${f0.contour.length} Konturen, ${f0.holes.length} Löcher)`);
    expect(kerbe(f0) === 8, `vier quadratische Kerben 9,882 mm in der Kontur (${kerbe(f0)} Seiten)`);
    near(await vol(C.lastBuild.bodies[0]), v0, 1e-6, 'Modellkörper bleibt unverändert');
    const regeln = async wert => {
      click('[data-rtab="sheet"]'); await sleep(150);
      click('[data-cmd="sm_rule"]');
      await waitFor(() => !D.querySelector('#dialog').hidden && D.querySelector('#dialog [data-rule="cornerRelief"]'), 4000, 'Blechregel');
      q('#dialog [data-rule="cornerRelief"]').value = wert;
      const vorher = C.lastBuild;
      click('#dialog [data-cmd="sm-rule-ok"]');
      await built(vorher, 20000);
    };
    // „ohne“: die Ecke bleibt stehen – die Abwicklung bekommt dort die ausgefranste Kontur
    await regeln('none');
    expect(!/Eckfreischnitt/.test(meldung()), `ohne Freischnitte gearbeitet (${meldung()})`);
    const f1 = fl();
    expect(f1.contour.length === 1 && kerbe(f1) === 0 && f1.contour[0].edges.length < f0.contour[0].edges.length,
      `Kontur ohne Freischnitte (${kerbe(f1)} Kerbseiten, ${f1.contour[0].edges.length} Segmente)`);
    near(await vol(C.lastBuild.bodies[0]), v0, 1e-6, 'Modellkörper bleibt unverändert');
    // „rund“: die Kerbe ist ein Bogen R 4,5 um die Eckachse – vier Bögen statt acht gerader Seiten
    await regeln('round');
    const f2 = fl();
    expect(bogig(f2) === 4 && kerbe(f2) === 0, `runde Freischnitte (${bogig(f2)} Bögen R 4,5, ${kerbe(f2)} gerade)`);
    near(await vol(C.lastBuild.bodies[0]), v0, 1e-6, 'Modellkörper bleibt unverändert');
  }],
  ['Blech: Eckfreischnitte bleiben nach einer Auftrennung', async () => {
    // Die Abwicklung wird nach jedem Blech-Feature neu gerechnet – auch dann mit Eckfreischnitten
    await openExample('Kasten mit runden Ecken in Blech umgewandelt 2mm');
    const S = await import('../src/sheet.js');
    const fl = () => S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    const grad = f => f.contour[0].edges.filter(e => e.type === 'line' && Math.abs(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) - 9.882) < 0.01).length;
    expect(grad(fl()) === 8, `vorher vier Kerben (${grad(fl())} Seiten)`);
    // Schlitz 40 mm mitten im Boden: berührt keine Ecke
    const F = faces().find(h => h.info.type === 'PLANE' && h.info.plane && h.info.plane.n[2] < -0.999);
    expect(!!F, 'Bodenfläche gefunden');
    const c = F.info.center;
    await cmd('sheet:modify', 'sm_rip'); await seg('mode', 'points');
    pick({ ...F, point: [c[0] - 20, c[1], c[2]] }); pick({ ...F, point: [c[0] + 20, c[1], c[2]] });
    await ok();
    const rip = C.doc.features[C.doc.features.length - 1];
    const st = (C.lastBuild.status || {})[rip.id] || {};
    expect(/Abwicklung neu/.test(st.info || ''), `Abwicklung neu gerechnet (${st.info || st.error})`);
    const f1 = fl();
    expect(f1.contour.length === 1 && grad(f1) === 8, `nach der Auftrennung weiter vier Kerben (${grad(f1)} Seiten)`);
    expect(f1.holes.length === 1, `Schlitz als Loch in der Abwicklung (${f1.holes.length})`);
  }],
  ['Blech: Saum ohne Spaltangabe rechnet mit dem Biegeradius', async () => {
    // flangeFlat: ohne Spalt (fehlend, null, leer) gilt der Biegeradius – wie im Kern
    const S = await import('../src/sheet.js');
    const R0 = { t: 2, r: 2, k: 0.44 };
    [undefined, null, ''].forEach(g => near(S.flangeFlat(R0, 12, 180, g).BA, Math.PI * (2 + 0.44 * 2), 1e-9, `ohne Spalt (${g === '' ? 'leer' : String(g)}): Biegezugabe π·(2 + 0,88)`));
    near(S.flangeFlat(R0, 12, 180, 3).BA, Math.PI * (1.5 + 0.88), 1e-9, 'Spalt 3: innerer Radius 1,5');
    near(S.flangeFlat(R0, 12, 180, 0).BA, Math.PI * 0.88, 1e-9, 'Spalt 0: flacher Saum');
    // Dialogzeile eines Saums ohne Spalt (ältere Datei): Biegezugabe mit dem Biegeradius der Blechregel
    await openExample('Blech mit offenem Saum 2mm');
    const i = C.doc.features.findIndex(f => f.type === 'sm_flange');
    delete C.doc.features[i].hemGap;
    editTimeline(i); await sleep(400);
    const R = { ...S.DEFAULT_RULE, ...C.doc.sheet };
    const m = /Biegezugabe ([\d.,]+) mm/.exec(q('#dialog').textContent);
    expect(!!m, 'Biegezugabe steht im Dialog');
    near(parseFloat(m[1].replace(/\./g, '').replace(',', '.')), Math.PI * (R.r + R.k * R.t), 0.006, 'Dialog: Biegezugabe π·(R + K·t)');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Dünn extrudieren mit zwei Seiten trotz eingetragener Verjüngung', async () => {
    // Der Steg im Beispiel hat zwei Seiten (6 mm mit 10° Verjüngung, 3 mm gerade). Dünn hat keine
    // Verjüngung – die zweite Seite darf deshalb nicht wegfallen.
    await openExample('Extrusion zwei Seiten und Startversatz');
    const ix = C.doc.features.findIndex(f => f.type === 'extrude'), exId = C.doc.features[ix].id;
    editTimeline(ix); await sleep(400);
    const prev = C.lastBuild;
    await seg('thin', 'true');
    await built(prev, 20000);
    const steg = C.lastBuild.bodies.find(b => b === exId || b.endsWith('/' + exId));
    const bb = await bbox(steg);
    expect(Math.abs(bb[0][2] + 3) < 1e-6 && Math.abs(bb[1][2] - 6) < 1e-6, `Wand von −3 bis +6 mm (${bb[0][2]} … ${bb[1][2]})`);
    // Rahmen 40 × 30 mit 2 mm Wand nach innen: (40·30 − 36·26) · 9
    near(await vol(steg), (1200 - 936) * 9, 1e-3, 'Wand 2 mm über beide Seiten');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Rechteckige Anordnung: Ausdehnung ohne Wert wie im Dialog (100 mm)', async () => {
    // ältere Dateien: dist: 'extent' ohne extent – der Dialog zeigt 100 mm, der Kern muss dasselbe nehmen
    await newDoc(); await box(10, 10, 10);
    await cmd('solid:create', 'pattern'); await seg('kind', 'linear'); await seg('axis', 'X');
    num('count', 3); await ok();
    const i = C.doc.features.findIndex(f => f.type === 'pattern'), pf = C.doc.features[i];
    pf.dist = 'extent'; delete pf.extent;
    editTimeline(i); await sleep(400);
    expect(q('#dialog input[data-k="extent"]').value === '100', 'Dialog zeigt 100 mm Ausdehnung');
    await ok();
    const st = (C.lastBuild.status || {})[pf.id] || {};
    expect(st.ok !== false, `kein Fehler (${st.error || 'ok'})`);
    const bb = C.lastBuild.mesh.bbox;
    near(bb[1][0], 105, 1e-6, 'letzte Kopie 100 mm weiter (Würfel −5 … 5 → bis 105)');
  }],
  ['Extrusion „Alle“: kein versteckter Startversatz', async () => {
    // Der Dialog zeigt bei „Alle“ keinen Start – ein früher gesetzter Versatz darf nicht mehr wirken
    await openExample('Extrusion zwei Seiten und Startversatz');
    const i = C.doc.features.map((f, k) => [f, k]).filter(([f]) => f.type === 'extrude')[1][1], ef = C.doc.features[i];
    expect(ef.start === 'offset' && Number(ef.startOffset) === 5, 'Bund hat Startversatz 5 mm');
    ef.extent = 'all';
    editTimeline(i); await sleep(400);
    expect(!D.querySelector('#dialog [data-segsel="start"], #dialog [data-k="start"]'), 'bei „Alle“ kein Start im Dialog');
    await ok();
    const bund = C.lastBuild.bodies.find(b => b === ef.id || b.endsWith('/' + ef.id));
    const bb = await bbox(bund);
    near(bb[0][2], 0, 1e-6, 'Bund beginnt an der Profilebene');
  }],
  ['Blech: Abwickeln mit Eckfreischnitten, Fenster schneiden, Zurückfalten', async () => {
    // Kasten 100 × 60 × 40, Ecken R4, t 2: abgewickelt mit Freischnitten an den runden Ecken, im flachen
    // Zustand ein Fenster 20 × 10 in die Vorderwand, zurückgefaltet
    await openExample('Kasten mit runden Ecken abgewickelt und zurückgefaltet 2mm');
    const st = id => (C.lastBuild.status || {})[id] || {};
    expect(/4 Eckfreischnitte/.test(st('u1').info || ''), `Abwickeln mit vier Eckfreischnitten (${st('u1').info || st('u1').error})`);
    expect(/1 Schnittstück/.test(st('r9').info || '') && !st('r9').warn, `Zurückfalten überträgt das Fenster (${st('r9').info || st('r9').error})`);
    // gefaltet wird der ungeschnittene Körper: Freischnitte nur im Zuschnitt, im Modell fehlt nur das Fenster
    near(await vol(C.lastBuild.bodies[0]), 35293.097 - 20 * 10 * 2, 1e-3, 'Modell = Kasten − Fenster 20 × 10 × 2');
    const S = await import('../src/sheet.js');
    const f = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    const grad = f.contour[0].edges.filter(e => e.type === 'line' && Math.abs(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) - 9.882) < 0.01).length;
    expect(f.contour.length === 1 && grad === 8, `Abwicklung nach dem Zurückfalten mit vier Kerben (${grad} Seiten)`);
    expect(f.holes.length === 1, `Fenster als Loch im Zuschnitt (${f.holes.length})`);
  }],
  ['Blech: Freischnitt an der Dreifach-Ecke – Kontur ohne Selbstüberschneidung', async () => {
    // Kasten mit runden Ecken und scharfen Bodenkanten: ohne Freischnitt an der Bodenecke reicht das halbe Eckband
    // an jeder Wand in die Rundung der Bodenecke, die Kontur überschneidet sich selbst (auch im DXF)
    const kreuzungen = loop => {
      const P = [];
      loop.edges.forEach(e => { P.push(e.a); if (e.mid) P.push(e.mid); });
      const S = P.map((p, i) => [p, P[(i + 1) % P.length]]);
      const x = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      let n = 0;
      for (let i = 0; i < S.length; i++) for (let j = i + 2; j < S.length; j++) {
        if (i === 0 && j === S.length - 1) continue;
        const [a, b] = S[i], [c, d] = S[j];
        const d1 = x(c, d, a), d2 = x(c, d, b), d3 = x(a, b, c), d4 = x(a, b, d);
        if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) n++;
      }
      return n;
    };
    await openExample('Kasten mit runden Ecken in Blech umgewandelt 2mm');
    const u = C.lastBuild.sheet.unfold;
    expect(u.contour.length === 1, `eine Kontur (${u.contour.length})`);
    const k = kreuzungen(u.contour[0]);
    expect(k === 0, `Kontur ohne Selbstüberschneidung (${k} Kreuzungen)`);
    // DXF wie für den Laser: Kontur als geschlossene Polylinie, Bögen in Geraden aufgelöst – auch dort keine Kreuzung
    const S = await import('../src/sheet.js');
    const flat = S.computeFlat(C.doc, { ...S.DEFAULT_RULE, ...C.doc.sheet }, C.lastBuild.sheet);
    const txt = S.flatDXF(flat, { contour: 'polyline', curves: 'lines', bends: false });
    const z = txt.split(/\r?\n/), polys = [];
    for (let i = 0; i + 1 < z.length; i += 2) {
      const code = z[i].trim(), val = z[i + 1].trim();
      if (code === '0' && val === 'POLYLINE') polys.push({ pts: [], closed: false });
      else if (code === '0' && val === 'VERTEX') polys[polys.length - 1].pts.push([]);
      else if (polys.length && code === '70' && !polys[polys.length - 1].pts.length) polys[polys.length - 1].closed = (Number(val) & 1) === 1;
      else if (polys.length && (code === '10' || code === '20')) { const P = polys[polys.length - 1].pts; if (P.length) P[P.length - 1][code === '10' ? 0 : 1] = Number(val); }
    }
    expect(polys.length === 1 && polys[0].closed, `DXF: eine geschlossene Polylinie (${polys.length}, ${polys[0] && polys[0].closed})`);
    const kd = kreuzungen({ edges: polys[0].pts.map((p, i) => ({ a: p, b: polys[0].pts[(i + 1) % polys[0].pts.length] })) });
    expect(kd === 0, `DXF-Kontur ohne Selbstüberschneidung (${kd} Kreuzungen, ${polys[0].pts.length} Punkte)`);
    // das Modell bleibt unverändert: Freischnitte gehören nur zum Zuschnitt
    near(await vol(C.lastBuild.bodies[0]), 35293.097, 1e-3, 'Modellkörper unverändert');
    // runde Kerbe (Blechregel „rund“): ebenfalls keine Kreuzung
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="sm_rule"]');
    await waitFor(() => !D.querySelector('#dialog').hidden && D.querySelector('#dialog [data-rule="cornerRelief"]'), 4000, 'Blechregel');
    q('#dialog [data-rule="cornerRelief"]').value = 'round';
    const vorher = C.lastBuild;
    click('#dialog [data-cmd="sm-rule-ok"]');
    await built(vorher, 20000);
    const ur = C.lastBuild.sheet.unfold, kr = kreuzungen(ur.contour[0]);
    expect(ur.contour.length === 1 && kr === 0, `rund: Kontur ohne Selbstüberschneidung (${kr} Kreuzungen)`);
  }],
  ['Warnung: Ausschneiden trifft keinen Körper', async () => {
    // ein Schnitt neben dem Körper meldet sich, statt still nichts zu tun
    await newDoc(); await box(20, 20, 10);
    const v0 = await vol(C.lastBuild.bodies[0]);
    await cmd('solid:create', 'box'); num('w', 5); num('l', 5); num('h', 5); num('cx', 100); await seg('op', 'cut'); await ok();
    const f = C.doc.features[C.doc.features.length - 1], st = (C.lastBuild.status || {})[f.id] || {};
    expect(st.ok && /trifft keinen Körper/.test(st.warn || ''), `Warnung am Schnitt (${st.warn || st.error || 'keine'})`);
    near(await vol(C.lastBuild.bodies[0]), v0, 1e-6, 'Körper unverändert');
    expect(D.querySelector('#timeline-items .tl-item.warn'), 'Zeitleiste zeigt die Warnung');
    // derselbe Schnitt auf dem Körper: keine Warnung
    editTimeline(C.doc.features.length - 1); await sleep(400);
    num('cx', 0); await ok();
    const st2 = (C.lastBuild.status || {})[f.id] || {};
    expect(st2.ok && !st2.warn, `getroffen: keine Warnung (${st2.warn || 'ok'})`);
    near(await vol(C.lastBuild.bodies[0]), v0 - 125, 1e-6, 'Würfel 5 mm ausgeschnitten');
  }],
  ['Warnung: Abwicklung mit überschnittener Kontur', async () => {
    // Zählung: eine Acht kreuzt sich einmal, ein Rechteck gar nicht
    const r = await C.kernel.call('devEval', { code: `
      const L = pts => ({ edges: pts.map((p, i) => ({ type: 'line', a: p, b: pts[(i + 1) % pts.length] })) });
      return [ctx.loopCrossings(L([[0, 0], [10, 10], [10, 0], [0, 10]])), ctx.loopCrossings(L([[0, 0], [10, 0], [10, 10], [0, 10]]))];` });
    expect(r[0] === 1 && r[1] === 0, `Acht: 1 Kreuzung, Rechteck: 0 (${r})`);
    // Kasten mit runden Ecken: mit Freischnitt an der Dreifach-Ecke keine Warnung
    await openExample('Kasten mit runden Ecken in Blech umgewandelt 2mm');
    const cv = C.doc.features.find(f => f.type === 'sm_convert');
    const st = (C.lastBuild.status || {})[cv.id] || {};
    expect(st.ok && !/überschneidet/.test(st.warn || ''), `mit Freischnitt keine Kreuzung gemeldet (${st.warn || 'ok'})`);
    expect(C.lastBuild.sheet.unfold.crossings === 0, `Abwicklung meldet 0 Kreuzungen (${C.lastBuild.sheet.unfold.crossings})`);
    // Blechregel „ohne Eckfreischnitt“: die Wände überlappen an den Bodenecken – 4 Kreuzungen, gemeldet am Feature
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="sm_rule"]');
    await waitFor(() => !D.querySelector('#dialog').hidden && D.querySelector('#dialog [data-rule="cornerRelief"]'), 4000, 'Blechregel');
    q('#dialog [data-rule="cornerRelief"]').value = 'none';
    const vorher = C.lastBuild; click('#dialog [data-cmd="sm-rule-ok"]'); await built(vorher, 20000);
    const st2 = (C.lastBuild.status || {})[cv.id] || {};
    expect(C.lastBuild.sheet.unfold.crossings === 4, `ohne Freischnitt 4 Kreuzungen (${C.lastBuild.sheet.unfold.crossings})`);
    expect(st2.ok && /überschneidet sich \(4 Kreuzungen\)/.test(st2.warn || ''), `Warnung am Umwandeln (${st2.warn || 'keine'})`);
    expect(D.querySelector('#timeline-items .tl-item.warn'), 'Zeitleiste zeigt die Warnung');
  }],
  ['Verschieben entlang gerader Kante: Richtung aus dem gespeicherten Bezug', async () => {
    // Bolzenblock 25 mm entlang der Plattenunterkante (Bezug d = +X) → x 65 … 73. Die Richtung kommt aus ref.d,
    // nicht aus Anfang/Ende der Kante im Kern – mit umgekehrtem Bezug geht es 25 mm in die andere Richtung.
    await openExample('Verschieben Punkt zu Punkt und entlang Kante');
    const i = C.doc.features.findIndex(f => f.id === 'm2'), mv = C.doc.features[i];
    const body = () => C.lastBuild.bodies.find(b => b === 'e3' || b.endsWith('/e3'));
    near((await bbox(body()))[0][0], 65, 1e-6, 'Bezug +X: x ab 65');
    mv.edge.ref.d = [-1, 0, 0];
    editTimeline(i); await sleep(400); await ok();
    near((await bbox(body()))[0][0], 15, 1e-6, 'Bezug −X: x ab 15 (40 − 25)');
  }],
  ['Dünne Wand aus Linienzug: Seite folgt der Kurvenrichtung', async () => {
    // Linie a(0|0) → b(100|0), Wand 6 mm „Seite 1“ = links der Zugrichtung = +Y. Dreht man b über die Senkrechte
    // nach (−10|100), dreht die linke Seite stetig mit und liegt dann bei −X. Die alte Regel (Anfang = kleinere
    // Koordinate) hätte den Zug umgedreht und die Wand auf +X gelegt.
    await openExample('Dünne Wände aus offenen Linienzügen');
    const body = () => C.lastBuild.bodies.find(b => b === 'e1' || b.endsWith('/e1'));
    let bb = await bbox(body());
    near(bb[0][1], 0, 1e-6, 'waagrecht: Wand ab y 0'); near(bb[1][1], 6, 1e-6, 'waagrecht: Wand bis y 6 (links der Zugrichtung)');
    const sk = C.doc.features.find(f => f.id === 's1'), pb = sk.points.find(p => p.id === 'b');
    pb.x = -10; pb.y = 100;
    const i = C.doc.features.findIndex(f => f.id === 'e1');
    editTimeline(i); await sleep(400); await ok();
    bb = await bbox(body());
    expect(bb[1][0] < 0.7 && bb[0][0] < -15, `über die Senkrechte gedreht: Wand links der Zugrichtung bei −X (x ${bb[0][0].toFixed(2)} … ${bb[1][0].toFixed(2)})`);
    near(await vol(body()), Math.hypot(10, 100) * 6 * 20, 1e-3, 'Wand 6 mm × Länge × 20 mm');
  }],
  ['Prägen auf einen Zylinder: gravieren und erhaben', async () => {
    // Zylinder R 20 × 30, Rechteck 10 × 8 (x −5…5, z 10…18) in der XZ-Ebene, 1 mm tief. Volumen über die Kreisbögen:
    // h · ∫ (√(R_a² − x²) − √(R_i² − x²)) dx über |x| ≤ 5 – gravieren R 19…20, erhaben R 20…21. Nur die Vorderseite.
    await openExample('Prägen auf Zylinder');
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1, 8000, 'Zylinder');
    const id = C.lastBuild.bodies[0], v0 = await vol(id);
    const F = (r, x) => (x * Math.sqrt(r * r - x * x) + r * r * Math.asin(x / r)) / 2;
    const ring = (a, b) => 8 * ((F(b, 5) - F(b, -5)) - (F(a, 5) - F(a, -5)));
    await cmd('solid:create', 'emboss');
    const mantel = faces().find(h => h.info.type === 'CYLINDRE');
    expect(!!mantel, 'Mantelfläche gefunden');
    pick({ ...mantel, point: [0, -20, 14] }); await sleep(300);
    expect(/Gekrümmte Fläche/.test(q('#dialog').textContent), 'gekrümmte Fläche gewählt');
    await ok();
    const fid = C.doc.features[C.doc.features.length - 1].id;
    const st = () => (C.lastBuild.status || {})[fid] || {};
    // abgewickelt (Vorgabe): 10 mm Bogenlänge auf R 20 = 0,5 rad, Ringsektor · 8 hoch
    const sektor = (a, b, w = 10, hh = 8) => hh * (w / 20) / 2 * (b * b - a * a);
    expect(st().ok && /1 Stück graviert, 1 mm, abgewickelt/.test(st().info || ''), `nur vorne graviert, abgewickelt (${st().info || st().error})`);
    near(v0 - await vol(id), sektor(19, 20), 1e-3, 'gravieren abgewickelt: 8 · 0,25 · (20² − 19²) = 78');
    const i = C.doc.features.length - 1;
    editTimeline(i); await sleep(400); await seg('mode', 'emboss'); await ok();
    near(await vol(id) - v0, sektor(20, 21), 1e-3, 'erhaben abgewickelt: 82');
    expect(/erhaben/.test(st().info || ''), `Status: ${st().info}`);
    // Drehwinkel 90° um die Profilmitte (0/14): 8 breit, 10 hoch (z 9…19); senkrecht +15 → z 24…34, davon z 24…30 auf
    // dem Zylinder: 6 hoch · 8 mm Bogen
    editTimeline(i); await sleep(400); await seg('mode', 'deboss'); num('rot', 90); num('offV', 15); await ok();
    near(v0 - await vol(id), sektor(19, 20, 8, 6), 1e-3, 'gedreht und versetzt: 6 · (8/20)/2 · 39 = 46,8');
    // erhaben über die Oberkante: nur auf der Mantelfläche, nichts über dem Deckel
    editTimeline(i); await sleep(400); await seg('mode', 'emboss'); await ok();
    near(await vol(id) - v0, sektor(20, 21, 8, 6), 1e-3, 'erhaben über die Kante: 6 · 0,2 · 41 = 49,2');
    near((await bbox(id))[1][2], 30, 1e-6, 'nichts über dem Deckel');
    editTimeline(i); await sleep(400); await seg('mode', 'deboss'); await ok();
    // waagrecht +10 mm: bleibt ganz auf der Vorderseite, Volumen gleich, Mitte wandert um 10/20 rad
    editTimeline(i); await sleep(400); num('rot', 0); num('offV', 0); num('offH', 10); await ok();
    near(v0 - await vol(id), sektor(19, 20), 1e-3, 'waagrecht versetzt: gleiches Volumen');
    // projiziert (alter Weg): Ringstück über die Kreisbögen
    editTimeline(i); await sleep(400); num('offH', 0); await seg('wrap', 'false'); await ok();
    near(v0 - await vol(id), ring(19, 20), 1e-3, 'projiziert: Ringstück R 19…20');
    expect(!/abgewickelt/.test(st().info || ''), 'Status ohne „abgewickelt“');
  }],
  ['Sweeping: Verdrehwinkel und Teilstrecke', async () => {
    // Flachstab 30 × 5, gerader Pfad 100 entlang Z, 90° verdreht: jeder Querschnitt bleibt das Rechteck → 15000 mm³;
    // die Hülle erreicht in X und Y die halbe Diagonale √(15² + 2,5²) = 15,207. Teilstrecke 50 % → 7500, endet bei z 50.
    await openExample('Flachstab verdreht');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.w1 && C.lastBuild.bodies.length === 1, 10000, 'Sweeping');
    const id = () => C.lastBuild.bodies[0], i = C.doc.features.findIndex(f => f.id === 'w1');
    near(await vol(id()), 15000, 0.05, 'verdreht: Volumen wie gerade');
    let bb = await bbox(id());
    near(bb[1][0], Math.hypot(15, 2.5), 1e-3, 'verdreht: X bis 15,207'); near(bb[1][1], Math.hypot(15, 2.5), 1e-3, 'verdreht: Y bis 15,207');
    editTimeline(i); await sleep(400); num('pathFrac', 50); await ok();
    near(await vol(id()), 7500, 0.05, 'Teilstrecke 50 %: halbes Volumen');
    bb = await bbox(id());
    near(bb[1][2], 50, 1e-6, 'Teilstrecke: endet bei z 50');
    near(bb[1][0], Math.hypot(15, 2.5), 1e-3, 'Teilstrecke: auch hier 90° über die gezogene Länge');
    editTimeline(i); await sleep(400); num('pathFrac', 100); num('twist', 0); await ok();
    bb = await bbox(id());
    near(bb[1][0], 15, 1e-6, 'ohne Verdrehung: X bis 15'); near(bb[1][1], 2.5, 1e-6, 'ohne Verdrehung: Y bis 2,5');
  }],
  ['Sweeping: Ausrichtung parallel oder senkrecht', async () => {
    // Kreis R 5 in XY entlang eines Viertelbogens R 50 (von 0/0/0 hoch bis 50/0/50):
    // parallel bleibt jeder Querschnitt waagrecht → π·5²·50 = 3927 (Cavalieri), oben ein waagrechter Kreis bis z 50;
    // senkrecht ein Viertel-Torus → π·5²·(π/2·50) = 6168,5 (Pappus), endet senkrecht bei x 50.
    await openExample('Bogen parallel gezogen');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.w1 && C.lastBuild.bodies.length === 1, 10000, 'Sweeping');
    const id = () => C.lastBuild.bodies[0], i = C.doc.features.findIndex(f => f.id === 'w1');
    near(await vol(id()), Math.PI * 25 * 50, 0.05, 'parallel: π·5²·50');
    let bb = await bbox(id());
    near(bb[1][2], 50, 1e-4, 'parallel: oben z 50'); near(bb[1][0], 55, 1e-4, 'parallel: Kreis oben reicht bis x 55');
    // Teilstrecke parallel: Endfläche parallel zur Profilebene, bei 50 % des Bogens (45°) z = 50·sin 45°
    editTimeline(i); await sleep(400);
    expect(q('#dialog [data-k="orient"]') || /Ausrichtung/.test(q('#dialog').textContent), 'Ausrichtung im Dialog');
    num('pathFrac', 50); await ok();
    bb = await bbox(id());
    near(bb[1][2], 50 * Math.SQRT1_2, 1e-3, 'parallel, halbe Strecke: endet waagrecht bei z 35,36');
    near(await vol(id()), Math.PI * 25 * 50 * Math.SQRT1_2, 0.05, 'parallel, halbe Strecke: π·5²·35,36');
    editTimeline(i); await sleep(400); num('pathFrac', 100); await seg('orient', 'perp'); await ok();
    expect(!('orient' in C.doc.features[i]), 'senkrecht ist die Vorgabe und kommt nicht in die Datei');
    near(await vol(id()), Math.PI * 25 * Math.PI / 2 * 50, 0.05, 'senkrecht: Viertel-Torus');
    bb = await bbox(id());
    near(bb[1][2], 55, 1e-3, 'senkrecht: Endkreis steht senkrecht bis z 55');
    // Verdrehen geht nur senkrecht
    editTimeline(i); await sleep(400); await seg('orient', 'parallel'); num('twist', 30); await ok();
    expect(/nur bei Ausrichtung senkrecht/.test((C.lastBuild.status.w1 || {}).error || ''), `Meldung bei parallel + Verdrehwinkel (${(C.lastBuild.status.w1 || {}).error})`);
  }],
  ['Sweeping: Profil mitten auf dem Pfad, Teilstrecke je Seite', async () => {
    // Kreis R 10 bei z 0; Pfad von z −30 gerade hoch bis z 20, dann Viertelbogen R 50 bis 50/0/70.
    // Seite 1 (Profilnormale +z): 20 + π/2·50 = 98,54, Seite 2: 30. Voll π·10²·128,54 (Pappus im Bogen).
    await openExample('Rohr beidseitig gezogen');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.w1 && C.lastBuild.bodies.length === 1, 10000, 'Sweeping');
    const A = Math.PI * 100, L1 = 20 + Math.PI / 2 * 50, id = () => C.lastBuild.bodies[0], i = C.doc.features.findIndex(f => f.id === 'w1');
    near(await vol(id()), A * (30 + L1), 0.5, 'beidseitig voll');
    // Seite 1 zur Hälfte: 49,27 = 20 gerade + 29,27 im Bogen; Seite 2 voll
    editTimeline(i); await sleep(400); num('pathFrac', 50); await ok();
    near(await vol(id()), A * (30 + L1 / 2), 0.5, 'Seite 1 zur Hälfte');
    let bb = await bbox(id());
    near(bb[0][2], -30, 1e-3, 'Seite 2 bleibt bis z −30');
    // Seite 2 zur Hälfte, Seite 1 voll: unten bis z −15
    editTimeline(i); await sleep(400); num('pathFrac', 100); num('pathFrac2', 50); await ok();
    near(await vol(id()), A * (15 + L1), 0.5, 'Seite 2 zur Hälfte');
    bb = await bbox(id());
    near(bb[0][2], -15, 1e-3, 'Seite 2 endet bei z −15'); near(bb[1][0], 50, 1e-3, 'Seite 1 voll: Endkreis steht bei x 50'); near(bb[1][2], 80, 1e-3, 'Endkreis reicht bis z 80');
    // Verjüngung braucht das Profil am Pfadende
    editTimeline(i); await sleep(400); num('taper', 2); await ok();
    expect(/an einem Pfadende/.test((C.lastBuild.status.w1 || {}).error || ''), `Meldung Verjüngung (${(C.lastBuild.status.w1 || {}).error})`);
  }],
  ['Sweeping: Führungsschiene (ausrichten, skalieren)', async () => {
    // Kreis R 20 auf geradem Pfad z 0…100, Schiene von 20/0/0 nach 40/0/100: Skalieren → Kegelstumpf R 20 → 40,
    // π/3·100·(20² + 20·40 + 40²) = 293215; nur ausrichten → Zylinder π·20²·100 = 125664.
    await openExample('Trichter an Führungsschiene');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.w1, 10000, 'Sweeping');
    expect(C.lastBuild.status.w1.ok && C.lastBuild.bodies.length === 1, `aufgebaut (${C.lastBuild.status.w1.error || ''})`);
    const id = () => C.lastBuild.bodies[0], i = C.doc.features.findIndex(f => f.id === 'w1');
    near(await vol(id()), Math.PI / 3 * 100 * (400 + 800 + 1600), 3, 'skaliert: Kegelstumpf R 20 → 40');
    let bb = await bbox(id());
    near(bb[1][0], 40, 0.02, 'oben Radius 40'); near(bb[0][0], -40, 0.02, 'oben auch auf der Gegenseite 40 (gleichmäßig skaliert)');
    // Hälfte: Radius 30 in z 49…50 (Scheibe)
    const r50 = await C.kernel.call('devEval', { code: `
      const b = ctx.bodies()[0].shape.clone().intersect(R.makeBox([-500, -500, 49.5], [500, 500, 50.5]));
      const q = ctx.bbOf(b); return +((q[1][0] - q[0][0]) / 2).toFixed(3);` });
    near(r50, 30.1, 0.05, 'bei z 50 Radius ≈ 30 (Scheibe bis z 50,5)');
    editTimeline(i); await sleep(400);
    expect(q('#dialog select[data-k="rail"]').value === 's3', 'Schiene im Dialog');
    await seg('railScale', 'none'); await ok();
    expect(!('railScale' in C.doc.features[i]) && C.doc.features[i].rail === 's3', 'nur ausrichten ist die Vorgabe');
    near(await vol(id()), Math.PI * 400 * 100, 1, 'nur ausrichten: Zylinder');
    editTimeline(i); await sleep(400); num('twist', 30); await ok();
    expect(/Führungsschiene/.test((C.lastBuild.status.w1 || {}).error || ''), `Meldung mit Verdrehwinkel (${(C.lastBuild.status.w1 || {}).error})`);
    editTimeline(i); await sleep(400); num('twist', 0); q('#dialog select[data-k="rail"]').value = ''; q('#dialog select[data-k="rail"]').dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200); await ok();
    expect(!('rail' in C.doc.features[i]), 'ohne Schiene kein Feld in der Datei');
  }],
  ['Wendel: Höhe + Steigung und flache Spirale', async () => {
    // ⌀ 20 (Drahtmitte), Draht ⌀ 2, Steigung 5, 3 Windungen. Der Querschnitt liegt in der Achsebene (nicht
    // senkrecht zum Draht), also V = π·1² · 2π·10 · 3 = 60π² (Cavalieri um die Achse)
    await newDoc();
    await cmd('solid:create', 'coil'); num('turns', 3); await ok(30000);
    const fid = C.doc.features[C.doc.features.length - 1].id, i = C.doc.features.length - 1, body = () => C.lastBuild.bodies[0];
    const v8 = 60 * Math.PI ** 2;
    near(await vol(body()), v8, v8 * 2e-4, 'Windungen + Steigung');
    // Höhe 15 + Steigung 5 → 3 Windungen, dasselbe
    editTimeline(i); await sleep(400); await seg('mode', 'hp');
    expect(!D.querySelector('#dialog input[data-k="turns"]') && !!D.querySelector('#dialog input[data-k="height"]'), 'Höhe + Steigung: keine Windungen im Dialog');
    num('height', 15); num('pitch', 5); await ok(30000);
    near(await vol(body()), v8, v8 * 2e-4, 'Höhe + Steigung: 15 / 5 = 3 Windungen');
    expect(/3 Windungen/.test((C.lastBuild.status[fid] || {}).info || ''), `Status nennt die Windungen (${(C.lastBuild.status[fid] || {}).info})`);
    // flache Spirale: 2 Windungen, 5 mm je Windung nach außen, r 10 → 20: V = π·L, L = ∫ √(r² + (5/2π)²) dφ über 4π
    editTimeline(i); await sleep(400); await seg('mode', 'spiral'); num('turns', 2); num('pitch', 5); await ok(30000);
    const a = 5 / (2 * Math.PI); let Lsp = 0; for (let k = 0; k < 6000; k++) { const ph = 4 * Math.PI * (k + 0.5) / 6000; Lsp += Math.hypot(10 + a * ph, a) * 4 * Math.PI / 6000; }
    near(await vol(body()), Math.PI * Lsp, Math.PI * Lsp * 1e-3, `flache Spirale: π·L (L = ${Lsp.toFixed(2)})`);
    const bb = await bbox(body());
    near(bb[1][2] - bb[0][2], 2, 1e-3, 'flach: nur Drahtstärke hoch');
    near(bb[1][0], 21, 0.01, 'außen bis r 20 + 1');
    // Abstand kleiner als der Draht: Meldung
    editTimeline(i); await sleep(400); num('pitch', 1.5); await ok(30000);
    expect(/berühren/.test((C.lastBuild.status[fid] || {}).error || ''), `Meldung bei zu engem Abstand (${(C.lastBuild.status[fid] || {}).error})`);
  }],
  ['Drehung: bis Fläche und Achse projizieren', async () => {
    // Ring-Querschnitt x 20…30, z 0…10 in der XZ-Ebene um die Z-Achse. Zielebene durch die Achse unter 60° (Normale
    // (−sin 60°, cos 60°, 0)): gedreht wird von +X bis dorthin → V = 60/360 · π·(30² − 20²)·10 = 2618
    await openExample('Drehung symmetrisch');
    await waitFor(() => C.lastBuild && C.lastBuild.bodies.length === 1, 8000, 'Drehung');
    const i = C.doc.features.findIndex(f => f.id === 'r1'), ring = deg => deg / 360 * Math.PI * 500 * 10;
    const s60 = Math.sin(Math.PI / 3), c60 = Math.cos(Math.PI / 3);
    C.doc.features[i] = { ...C.doc.features[i], rext: 'toface', rdir: 'one', toFace: { t: 'PLANE', n: [-s60, c60, 0], dist: 0, p: [c60 * 25, s60 * 25, 5] } };
    editTimeline(i); await sleep(400);
    expect(/Ebene Fläche ✓/.test(q('#dialog').textContent) && !D.querySelector('#dialog input[data-k="angle"]'), 'Dialog: Zielfläche gewählt, kein Winkelfeld');
    await ok();
    near(await vol(C.lastBuild.bodies[0]), ring(60), 1e-3, 'bis zur Ebene unter 60°');
    // Ebene neben der Achse: Meldung
    C.doc.features[i] = { ...C.doc.features[i], toFace: { t: 'PLANE', n: [-s60, c60, 0], dist: 3, p: [0, 0, 0] } };
    editTimeline(i); await sleep(400); await ok();
    expect(/Drehachse enthalten/.test((C.lastBuild.status.r1 || {}).error || ''), `Meldung bei Ebene neben der Achse (${(C.lastBuild.status.r1 || {}).error})`);
    // Achse projizieren: eine Achse parallel zu Z bei y = 5 (neben der Skizzenebene y = 0) – projiziert wird sie zur Z-Achse
    C.doc.features[i] = { ...C.doc.features[i], rext: 'angle', rdir: 'one', angle: 90, axis: 'edge', axisRef: { o: [0, 5, 0], d: [0, 0, 1], label: 'Achse' }, projAxis: true };
    delete C.doc.features[i].toFace;
    editTimeline(i); await sleep(400); await ok();
    near(await vol(C.lastBuild.bodies[0]), ring(90), 1e-3, 'projizierte Achse: Viertelring um Z');
    const bb = await bbox(C.lastBuild.bodies[0]);
    near(bb[0][0], 0, 1e-6, 'um die Z-Achse gedreht (x ab 0)');
  }],
  ['Erhebung mit Schienen', async () => {
    // Quadrat 20 bei z 0 und z 50, Schiene in der Diagonalebene von der Ecke (10|10|0) als Kreisbogen über
    // ρ = 15·√2 bei z 25 zur Ecke oben: der Querschnitt bleibt quadratisch, die Ecke folgt der Schiene, also
    // Fläche(z) = 2·ρ(z)², ρ(z) = −26,5165 + √(47,7297² − (z − 25)²); V = ∫ 2ρ² dz über 0…50
    await openExample('Erhebung mit Schienen');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.e1, 20000, 'Erhebung');
    expect(C.lastBuild.status.e1.ok, `aufgebaut (${C.lastBuild.status.e1.error || ''})`);
    let V = 0; for (let k = 0; k < 5000; k++) { const z = 50 * (k + 0.5) / 5000, rho = -26.51650429449553 + Math.sqrt(47.72970773009196 ** 2 - (z - 25) ** 2); V += 2 * rho * rho * 50 / 5000; }
    const v1 = await vol(C.lastBuild.bodies[0]);
    near(v1 / V, 1, 0.005, `eine Schiene: V = ${V.toFixed(0)} (${v1.toFixed(0)})`);
    let bb = await bbox(C.lastBuild.bodies[0]);
    near(bb[1][0], 15, 0.05, 'in der Mitte bis x 15'); near(bb[1][2], 50, 1e-3, 'Höhe 50');
    // zweite Schiene an der Gegenecke (gespiegelt): gleicher Körper
    const i = C.doc.features.findIndex(f => f.id === 'e1');
    editTimeline(i); await sleep(400);
    const r2 = q('#dialog select[data-k="rail2"]'); r2.value = 's4'; r2.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    await ok(30000);
    near(await vol(C.lastBuild.bodies[0]) / V, 1, 0.005, 'zwei Schienen: gleicher Körper');
    bb = await bbox(C.lastBuild.bodies[0]);
    near(bb[0][0], -15, 0.05, 'in der Mitte bis x −15');
  }],
  ['Erhebung mit Loch (Rohrübergang)', async () => {
    // Ring R 10 / 8 bei z 0 → Ring R 20 / 16 bei z 50: Kegelstumpf außen − Kegelstumpf innen
    // V = π/3·50·((10² + 10·20 + 20²) − (8² + 8·16 + 16²)) = π/3·50·252
    await openExample('Erhebung Rohrübergang');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.e1, 10000, 'Erhebung');
    expect(C.lastBuild.status.e1.ok, `aufgebaut (${C.lastBuild.status.e1.error || ''})`);
    near(await vol(C.lastBuild.bodies[0]), Math.PI / 3 * 50 * 252, 0.5, 'Rohrübergang hohl');
  }],
  ['Erhebung entlang einer Mittellinie', async () => {
    // Quadrat 10 (bei 0/0/0, waagrecht) → Quadrat 20 (bei 50/0/50, senkrecht) entlang eines Viertelbogens R 50: Seite
    // wächst linear 10 → 20, Querschnitt mittig auf dem Bogen → V = (π/2·50) · ∫ (10 + 10t)² dt = 78,54 · 700/3
    await openExample('Erhebung entlang Mittellinie');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.e1, 10000, 'Erhebung');
    expect(C.lastBuild.status.e1.ok, `aufgebaut (${C.lastBuild.status.e1.error || ''})`);
    const L = Math.PI / 2 * 50, id = () => C.lastBuild.bodies[0];
    near(await vol(id()), L * 700 / 3, 0.5, 'entlang des Bogens');
    const bb = await bbox(id());
    near(bb[1][2], 60, 1e-3, 'Endquadrat oben bis z 60'); near(bb[1][0], 50, 1e-3, 'Endquadrat steht bei x 50');
    // ohne Mittellinie: gerader Übergang zwischen den Quadraten, anderer Körper
    const i = C.doc.features.findIndex(f => f.id === 'e1');
    editTimeline(i); await sleep(400);
    expect(q('#dialog select[data-k="center"]').value === 's3', 'Mittellinie im Dialog');
    const sl = q('#dialog select[data-k="center"]'); sl.value = ''; sl.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    await ok();
    expect(!('center' in C.doc.features[i]), 'ohne Mittellinie kein Feld in der Datei');
    expect(Math.abs(await vol(id()) - L * 700 / 3) > 100, 'ohne Mittellinie ein anderer Körper');
  }],
  ['Erhebung geschlossen (Ring)', async () => {
    // acht Kreisprofile ⌀20 auf dem Kreis R 50, zurück zum ersten Profil: ein Ring wie ein Torus,
    // Satz des Guldin: 2π·50 · π·10² = 98696,044 mm³
    await openExample('Erhebung geschlossener Ring');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.e1, 20000, 'Erhebung');
    expect(C.lastBuild.status.e1.ok, `aufgebaut (${C.lastBuild.status.e1.error || ''})`);
    const id = () => C.lastBuild.bodies[0];
    const vZu = await vol(id());
    near(vZu, 2 * Math.PI * 50 * Math.PI * 100, 200, 'geschlossener Ring wie ein Torus');
    const i = C.doc.features.findIndex(f => f.id === 'e1');
    editTimeline(i); await sleep(400);
    const cb = () => q('#dialog input[data-k="closed"]');
    expect(cb().checked, 'Schalter „Geschlossen“ ist gesetzt');
    cb().checked = false; cb().dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(300);
    await ok(30000);
    expect(!('closed' in C.doc.features[i]), 'offen: kein Feld in der Datei');
    const vOffen = await vol(id());
    expect(vOffen > 0 && vOffen < vZu * 0.95, `offener Ring ist kleiner (${vOffen.toFixed(0)} von ${vZu.toFixed(0)})`);
    // wieder zu, dann nur zwei Profile stehen lassen: für den Umlauf braucht es mindestens drei
    editTimeline(i); await sleep(400);
    const c = cb(); c.checked = true; c.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(300);
    for (let k = 0; k < 6; k++) { click('#dialog .loftrow:last-child button[data-cmd="loft-del"]'); await sleep(200); }
    expect(D.querySelectorAll('#dialog .loftrow').length === 2, `zwei Profile übrig (${D.querySelectorAll('#dialog .loftrow').length})`);
    await waitFor(() => /mindestens drei/.test((C.lastBuild.status.e1.error || '')), 20000, 'Meldung für zwei Profile');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Erhebung: Seitenflächen mit geteilter Kante werden zusammengefasst', async () => {
    // Rechteck 20 × 10 mit einem Punkt mitten auf der oberen Kante, oben 12 × 6 in 30 mm Höhe: der
    // Rohling der Erhebung hat fünf Seitenflächen (zwei davon auf derselben Ebene), der fertige
    // Körper vier – der Kern lässt über jedes Werkzeug simplify() laufen (Sonde tools/sonde-pen.html:
    // 7 Flächen / 15 Kanten vorher, 6 Flächen / 12 Kanten nachher, Volumen unverändert). Tangentiale Kanten werden
    // ebenfalls zusammengeführt.
    // Volumen wie ein Körper, dessen Rechteck sich gleichmäßig auf 0,6 verkleinert:
    // V = h·A₀·(s³−1)/(3(s−1)) = 30·200·(0,216−1)/(−1,2) = 3920 mm³
    await openExample('Erhebung mit geteilter Kante');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.e1, 10000, 'Erhebung');
    expect(C.lastBuild.status.e1.ok, `aufgebaut (${C.lastBuild.status.e1.error || ''})`);
    expect(C.doc.features[0].curves.length === 5 && C.doc.features[1].curves.length === 5, 'je fünf Kanten in den Profilen');
    const id = () => C.lastBuild.bodies[0];
    near(await vol(id()), 3920, 0.5, 'Übergang 20 × 10 → 12 × 6 über 30 mm');
    const p = await C.kernel.props(id());
    expect(p.faces === 6, `6 Flächen (vier Seiten, zwei Deckel) – zusammengefasst (${p.faces})`);
    expect(p.edges === 12, `12 Kanten – die geteilte Kante fehlt (${p.edges})`);
  }],
  ['Sweeping: Körper entlang Pfad (Kugel- und Schaftfräser)', async () => {
    // Pfad 50 + 30 = 80 mm mit 90°-Ecke, r = 5. An der scharfen Ecke überlappen die Bahnen innen, außen füllt das Werkzeug:
    // Zylinder × 10: 10·(500 + 300 − r² + π r²/4 + π r²) – Streifen, innen doppelt, Viertelkreis außen, zwei Endhälften
    // Kugel: π r²·80 + 4/3 π r³ + π r³/3 − 4 r³/3 – Rohre, zwei Endhälften, Viertelkugel außen, Viertel-Steinmetz innen
    await openExample('Fräser entlang Pfad');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.w2, 20000, 'Bahnen');
    expect(C.lastBuild.status.w1.ok && C.lastBuild.status.w2.ok, `aufgebaut (${C.lastBuild.status.w1.error || ''} ${C.lastBuild.status.w2.error || ''})`);
    const body = id => C.lastBuild.bodies.find(b => b === id || b.endsWith('/' + id));
    near(await vol(body('w1')), Math.PI * 25 * 80 + 4 / 3 * Math.PI * 125 + Math.PI * 125 / 3 - 4 * 125 / 3, 0.05, 'Kugelbahn');
    near(await vol(body('w2')), 10 * (800 - 25 + Math.PI * 25 / 4 + Math.PI * 25), 0.05, 'Zylinderbahn');
    const bb = await bbox(body('w2'));
    near(bb[1][0], 55, 1e-4, 'Zylinderbahn bis x 55'); near(bb[1][1], 135, 1e-4, 'bis y 135'); near(bb[1][2] - bb[0][2], 10, 1e-6, 'Höhe 10');
    near(await vol(body('k1')), 4 / 3 * Math.PI * 125, 1e-3, 'Werkzeugkörper bleibt');
    // Quader als Werkzeug: Meldung
    const i = C.doc.features.findIndex(f => f.id === 'w1');
    C.doc.features.splice(i, 0, { id: 'q1', type: 'primitive', name: 'Quader', kind: 'box', plane: { kind: 'origin', key: 'XY' }, cx: 0, cy: -50, w: 5, l: 5, h: 5, d: 10, d2: 4, flip: false, op: 'new' });
    C.doc.features[i + 1] = { ...C.doc.features[i + 1], toolBody: 'q1' };
    editTimeline(i + 1); await sleep(400); await ok(30000);
    expect(/Kugel oder ein Zylinder/.test((C.lastBuild.status.w1 || {}).error || ''), `Quader: Meldung (${(C.lastBuild.status.w1 || {}).error})`);
  }],
  ['Aufkleber: Bild auf einer ebenen Fläche', async () => {
    // Würfel 20 (z 0…20): Aufkleber auf dem Deckel, Breite 10 → liegt 0,02 mm über z 20, Normale +Z
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:insert', 'canvas');
    const cv = D.createElement('canvas'); cv.width = 100; cv.height = 50; cv.getContext('2d').fillRect(0, 0, 100, 50);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    click('#dialog [data-cmd="canvas-load"]'); await sleep(100);
    const inp = q('#canvasfile'), dt = new W.DataTransfer(); dt.items.add(new W.File([blob], 'logo.png', { type: 'image/png' })); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => /logo\.png/.test(q('#dialog').textContent), 5000, 'Bild geladen');
    await seg('cplane', 'face');
    expect(/Ebene Körperfläche anklicken/.test(q('#dialog').textContent), 'wartet auf die Fläche');
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.9)); await sleep(200);
    num('w', 10); num('opacity', 1); await ok();
    await waitFor(() => C.vp.canvasG && C.vp.canvasG.children.length === 1, 5000, 'Aufkleber im Viewport');
    const m = C.vp.canvasG.children[0];
    near(m.position.z, 20.02, 1e-6, 'knapp über dem Deckel'); near(m.geometry.parameters.width, 10, 1e-9, 'Breite 10'); near(m.geometry.parameters.height, 5, 1e-9, 'Höhe 5');
    expect(C.doc.features[C.doc.features.length - 1].face && C.doc.features[C.doc.features.length - 1].face.n[2] > 0.99, 'Fläche gespeichert');
  }],
  ['Verdicken von Körperflächen', async () => {
    // Würfel 20 (z 0…20): Deckel 3 mm nach außen → neuer Körper 20·20·3 auf z 20…23; Zylinder R 10 × 10 daneben:
    // Mantel 2 mm nach außen → Ring π·(12² − 10²)·10; mittig je 1 mm → π·(11² − 9²)·10
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:create', 'cylinder'); num('d', 20); num('h', 10); num('cx', 50); await ok(30000);
    await cmd('solid:create', 'thicken');
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.9 && Math.abs(h.info.center[2] - 20) < 1e-6)); await sleep(150);
    expect(/1 Fläche gewählt/.test(q('#dialog').textContent), 'eine Fläche gewählt');
    num('thickness', 3);
    await ok(30000);
    const fid = C.doc.features[C.doc.features.length - 1].id, body = () => C.lastBuild.bodies.find(b => b === fid || b.endsWith('/' + fid));
    near(await vol(body()), 1200, 1e-6, 'Deckel 20·20·3');
    let bb = await bbox(body()); near(bb[0][2], 20, 1e-6, 'liegt auf dem Deckel'); near(bb[1][2], 23, 1e-6, 'bis z 23');
    const i = C.doc.features.length - 1;
    editTimeline(i); await sleep(400);
    click('#dialog [data-cmd="clear-sel"]'); await sleep(100);
    pick(faces().find(h => h.info.type === 'CYLINDRE')); await sleep(150);
    num('thickness', 2); await ok(30000);
    near(await vol(body()), Math.PI * (144 - 100) * 10, 1e-3, 'Mantel 2 mm nach außen');
    editTimeline(i); await sleep(400); await seg('side', 'mid'); await ok(30000);
    near(await vol(body()), Math.PI * (121 - 81) * 10, 1e-3, 'Mantel mittig je 1 mm');
  }],
  ['Baugruppen-Abhängigkeiten: Bolzen ins Loch', async () => {
    // Platte 60 × 40 × 10 mit Loch ⌀10 bei (0|0); Bolzen (Schaft ⌀10 × 30, Bund ⌀20 × 3 oben) steht daneben bei (100|50).
    // Konzentrisch (Schaft ↔ Loch) + Bund-Unterseite deckungsgleich auf der Plattenoberseite: Bolzen steckt im Loch,
    // Bund z 10…13, Schaft bis z −20; frei bleibt die Drehung um die Achse (1 Freiheitsgrad).
    await openExample('Bolzen in Platte (Abhängigkeiten)');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.k1, 10000, 'Abhängigkeiten');
    const st = C.lastBuild.status.k1;
    expect(st.ok && st.free === 1 && /noch 1 Freiheitsgrad/.test(st.info), `gelöst, 1 Freiheitsgrad (${st.info || st.error})`);
    const bolt = () => C.lastBuild.bodies.find(b => b === 'z1' || b.endsWith('/z1'));
    let bb = await bbox(bolt());
    [[-10, -10, -20], [10, 10, 13]].forEach((c, i) => c.forEach((v, k) => near(bb[i][k], v, 1e-6, `Bolzen-Hülle [${i}][${k}]`)));
    // Abstand 2 mm: Bund schwebt 2 mm über der Platte
    const i = C.doc.features.findIndex(f => f.id === 'k1');
    editTimeline(i); await sleep(400);
    const inp = q('#dialog input[data-cv="1"]'); inp.value = '2'; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    await ok(30000);
    bb = await bbox(bolt()); near(bb[0][2], -18, 1e-6, 'Abstand 2: Schaft bis z −18'); near(bb[1][2], 15, 1e-6, 'Bund bis z 15');
    // widersprüchlich: zusätzlich „bündig“ mit derselben Fläche geht nicht
    editTimeline(i); await sleep(400);
    const cb = q('#dialog input[data-cf="1"]'); cb.checked = true; cb.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    await ok(30000);
    expect(C.lastBuild.status.k1.ok, `bündig ist allein auch lösbar (Bolzen umgedreht): ${C.lastBuild.status.k1.info || C.lastBuild.status.k1.error}`);
    // neu über den Dialog: Abhängigkeit „Konzentrisch“ anlegen und beide Seiten anklicken
    await openExample('Bolzen in Platte (Abhängigkeiten)');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.k1, 10000, 'Abhängigkeiten');
    await act(async () => C.toggleSuppress(C.doc.features.findIndex(f => f.id === 'k1')), 20000);
    await cmd('asm:rel', 'constraint');
    const sel = q('#dialog select[data-ct="0"]'); sel.value = 'concentric'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(150);
    click('#dialog [data-cmd="cons-pick"][data-side="a"][data-i="0"]'); await sleep(100);
    pick(faces().find(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 5) < 1e-6 && h.info.center[0] > 50)); await sleep(150);
    pick(faces().find(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 5) < 1e-6 && h.info.center[0] < 50)); await sleep(150);
    await ok(30000);
    const nf = C.doc.features[C.doc.features.length - 1];
    expect(nf.type === 'constraint' && nf.comp === 'cb' && nf.items[0].a.body === 'z1' && nf.items[0].b.body === 'g1', 'per Klick angelegt, Bolzen bewegt');
    bb = await bbox(bolt());
    near((bb[0][0] + bb[1][0]) / 2, 0, 1e-6, 'nur konzentrisch: Achse bei x 0'); near((bb[0][1] + bb[1][1]) / 2, 0, 1e-6, '… und y 0');
    expect(/noch 2 Freiheitsgrade/.test((C.lastBuild.status[nf.id] || {}).info || ''), `konzentrisch allein: 2 Freiheitsgrade (${JSON.stringify(C.lastBuild.status[nf.id])})`);
  }],
  ['Begrenzender Volumenkörper', async () => {
    // Quader 20 × 10 × 5 (x −10…10, y −5…5, z 0…5), Abstand 1: Quader 22 × 12 × 7 = 1848; Zylinder um Z:
    // Radius = halbe Diagonale √(10² + 5²) + 1, Höhe 7
    await newDoc(); await box(20, 10, 5);
    await cmd('solid:create', 'bound'); num('offset', 1); await ok();
    const fid = C.doc.features[C.doc.features.length - 1].id, body = () => C.lastBuild.bodies.find(b => b === fid || b.endsWith('/' + fid));
    near(await vol(body()), 22 * 12 * 7, 1e-6, 'Quader 22 × 12 × 7');
    expect(/Quader 22 × 12 × 7 mm/.test(C.lastBuild.status[fid].info || ''), `Status (${C.lastBuild.status[fid].info})`);
    editTimeline(C.doc.features.length - 1); await sleep(400); await seg('shape', 'cylinder'); await ok();
    const r = Math.hypot(10, 5) + 1;
    near(await vol(body()), Math.PI * r * r * 7, 1e-3, 'Zylinder um Z');
    const bb = await bbox(body());
    near(bb[1][0], r, 1e-6, 'Radius'); near(bb[0][2], -1, 1e-6, 'unten −1'); near(bb[1][2], 6, 1e-6, 'oben 6');
  }],
  ['Mindestradius-Analyse', async () => {
    // Würfel 20 mit einer senkrechten Kante R 3 und einer anderen R 8: Grenze 5 → eine Fläche rot, kleinster Radius 3
    await newDoc(); await box(20, 20, 20);
    const vert = () => edges().filter(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6);
    await cmd('solid:modify', 'fillet'); pick(vert()[0]); num('radius', 3); await ok();
    await cmd('solid:modify', 'fillet'); pick(vert().find(e => e.info.p0[0] * vert()[0].info.p0[0] < 0 || e.info.p0[1] * vert()[0].info.p0[1] < 0) || vert()[1]); num('radius', 8); await ok();
    const { minRadiusStats } = await import('../src/draft-ui.js');
    const s5 = minRadiusStats(C.lastBuild.mesh, 5);
    expect(s5.curved === 2 && s5.below === 1 && Math.abs(s5.minR - 3) < 1e-6, `zwei Rundungen, eine unter 5 mm, kleinster Radius 3 (${JSON.stringify(s5)})`);
    await cmd('solid:inspect', 'minrad');
    const setLim = async v => { const inp = q('#dialog [data-mr="lim"]'); inp.value = String(v); inp.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(150); };
    await setLim(5);
    expect(/kleiner\s*1\s*Fläche\b/.test(q('#dialog').textContent), 'Grenze 5: eine Fläche rot');
    await setLim(10);
    expect(/kleiner\s*2\s*Flächen/.test(q('#dialog').textContent), 'Grenze 10: beide Rundungen rot');
    const col = C.vp.model.geo.getAttribute('color');
    expect(!!col, 'Flächen eingefärbt');
    click('#dialog [data-cmd="draftan-close"]'); await sleep(100);
    expect(!C.vp.model.geo.getAttribute('color'), 'geschlossen: Farben zurück');
  }],
  ['Krümmungs-Map', async () => {
    // Würfel 20 mit einer senkrechten Kante R 4: Ebenen 0, die Rundung genau 1/4 (Sehne quer: |Δn| / |Δp| = 1/R)
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:modify', 'fillet');
    pick(edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6)); num('radius', 4); await ok();
    const { curvatureMap } = await import('../src/draft-ui.js');
    const m = C.lastBuild.mesh, c = curvatureMap(m);
    near(c.max, 0.25, 1e-6, 'stärkste Krümmung 1/R = 0,25');
    await cmd('solid:inspect', 'curvmap');
    expect(/Krümmungs-Map/.test(q('#dialog').textContent) && /\(R 4 mm\)/.test(q('#dialog').textContent), `Dialog nennt R 4 (${q('#dialog .ohsum').textContent})`);
    const col = C.vp.model.geo.getAttribute('color');
    expect(!!col, 'Flächen eingefärbt');
    // Grenze 4 mm: Rundung ganz rot, Ebenen blau
    const inp = q('#dialog [data-cm="rRed"]'); inp.value = '4'; inp.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(150);
    const col4 = C.vp.model.geo.getAttribute('color');
    let red = 0, flatBlue = 0;
    for (let i = 0; i < c.k.length; i++) {
      if (c.k[i] > 0.2 && Math.abs(col4.getX(i) - 0.93) < 1e-3 && Math.abs(col4.getY(i) - 0.27) < 1e-3) red++;
      if (c.k[i] < 1e-9 && Math.abs(col4.getZ(i) - 0.9) < 1e-3) flatBlue++;
    }
    expect(red > 0 && flatBlue > 0, `Grenze 4: Rundung rot (${red}), Ebenen blau (${flatBlue})`);
    click('#dialog [data-cmd="draftan-close"]'); await sleep(100);
    expect(!C.vp.model.geo.getAttribute('color'), 'geschlossen: Farben zurück');
  }],
  ['Isokurven auf getrimmten Flächen', async () => {
    // Platte mit Ecken R 10, ein Quader 6 × 6 mitten auf dem Bogen der Ecke (10 − 10/√2, …) (4 mm hoch) schneidet eine Kerbe in die
    // Rundung, die Fläche bleibt eine – ohne Trimmen lägen Isokurven der Rundung in diesem Fenster.
    await openExample('Bohrung in Rundung und mit Kantenmaßen');
    const hc = 10 - 10 / Math.SQRT2;
    await cmd('solid:create', 'box'); num('w', 6); num('l', 6); num('h', 4); num('cx', hc); num('cy', hc); await seg('op', 'cut'); await ok(20000);
    const iso = async () => { click('[data-rtab="solid"]'); await sleep(120); click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="isocurves"]'); await sleep(150); };
    await iso();
    await waitFor(() => C.vp.isoG, 15000, 'Isokurven angezeigt');
    const P = C.vp.isoG.geometry.getAttribute('position');
    expect(P.count > 1000, `viele Linienpunkte (${P.count})`);
    let inCut = 0, onFillet = 0, off = 0;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (Math.abs(x - hc) < 3 - 1e-3 && Math.abs(y - hc) < 3 - 1e-3 && z < 4 - 1e-3) inCut++;
      if (z < -1e-3 || z > 8 + 1e-3) off++;
      if (Math.abs(Math.hypot(x - 10, y - 10) - 10) < 1e-3) onFillet++;
    }
    expect(inCut === 0, `keine Linie im ausgeschnittenen Fenster (${inCut})`);
    expect(off === 0, `alles zwischen Unter- und Oberseite (${off})`);
    expect(onFillet > 0, `Linien auf den Rundungen der Ecken (${onFillet})`);
    // nach einem neuen Feature (Rundung an einer oberen Längskante) kommen deren Linien dazu
    const n0 = P.count, g0 = C.vp.isoG;
    await cmd('solid:modify', 'fillet');
    pick(edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[0]) - 1) < 1e-6 && Math.abs(e.info.p0[2] - 8) < 1e-6 && e.info.p0[1] > 59)); num('radius', 2); await ok();
    await waitFor(() => C.vp.isoG && C.vp.isoG !== g0, 15000, 'Isokurven nachgeführt');
    expect(C.vp.isoG.geometry.getAttribute('position').count > n0, `mehr Linienpunkte nach der Rundung (${n0} → ${C.vp.isoG.geometry.getAttribute('position').count})`);
    await iso();
    expect(!C.vp.isoG, 'zweiter Aufruf schaltet aus');
  }],
  ['Stützstruktur für den 3D-Druck', async () => {
    // T aus Bein 10 × 10 × 30 und Kappe 50 × 50 × 10 auf einer Ebene bei z = 30. Nur die
    // Unterseite der Kappe hängt über: Vollblock = (50² − 10²) × 30 = 72000 mm³ über 30 mm
    // bis zum Bett, mit Abstand 0,2 mm sind es 2400 × 29,8 = 71520 mm³. Das Gitter muss
    // deutlich leichter sein, aber weiter bis zum Bett reichen.
    await newDoc(); await box(10, 10, 30);
    await cmd('solid:construct', 'plane'); num('offset', 30); await ok();
    const pl = C.vp.workPlanes[C.vp.workPlanes.length - 1];
    near(pl.plane.o[2], 30, 1e-6, 'Ebene auf z = 30');
    await cmd('solid:create', 'box');
    pick({ kind: 'workplane', id: pl.id, plane: pl.plane }); await sleep(300);
    num('w', 50); num('l', 50); num('h', 10); await seg('op', 'new'); await ok();
    const capId = C.doc.features[C.doc.features.length - 1].id;
    const cap = C.lastBuild.bodies.find(b => b === capId || b.endsWith('/' + capId));
    near(await vol(cap), 25000, 1e-6, 'Kappe 50 × 50 × 10');
    near((await bbox(cap))[0][2], 30, 1e-6, 'Kappe beginnt auf der Ebene');
    await cmd('extras:print', 'overhang');
    expect(/Überhang \(3D-Druck\)/.test(q('#dialog').textContent), 'Dialog „Überhang (3D-Druck)“');
    expect(!!C.vp.overhang, 'Überhang-Analyse im Viewport');
    const de = s => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
    /* die beiden Zahlen der Stützstruktur-Zeile, NaN wenn die Zeile (noch) nicht da ist */
    const supZ = () => {
      const r = [...D.querySelectorAll('#dialog .ohsum')].find(x => /Stützmaterial/.test(x.textContent));
      if (!r) return { vol: NaN, hoehe: NaN };
      const b = [...r.querySelectorAll('b')];
      return { vol: de(b[0].textContent), hoehe: de(b[1].textContent) };
    };
    const setOh = async (k, v) => { const i = q(`#dialog [data-oh="${k}"]`); i.value = String(v); i.dispatchEvent(new W.Event('input', { bubbles: true })); i.dispatchEvent(new W.Event('change', { bubbles: true })); };
    /* nach einer Änderung: der alte Wert darf nicht mehr dastehen. Der Dialog zeigt in der
       Zeit „Rechne die Stützstruktur …“, also wartet die Prüfung auf einen neuen Zahlenwert. */
    const neu = async vorher => {
      try {
        await waitFor(() => { const z = supZ(); return isFinite(z.vol) && z.vol !== vorher; }, 30000, 'Stützstruktur gerechnet');
      } catch (e) {
        throw new Error(`${e.message} – Dialog: ${q('#dialog').textContent.replace(/\s+/g, ' ')}`);
      }
      const err = D.querySelector('#dialog .derr');
      if (err) throw new Error(err.textContent);
    };
    click('#dialog [data-cmd="oh-sup"][data-style="block"]'); await neu(NaN);
    await setOh('gap', 0); await neu(supZ().vol);
    near(supZ().vol, 72000, 1e-6, 'Vollblock (50² − 10²) × 30');
    near(supZ().hoehe, 30, 1e-6, 'Stütze reicht bis zum Bett');
    expect(!!C.vp.markG, 'Stützmaterial im Viewport');
    await setOh('gap', 0.2); await neu(supZ().vol);
    near(supZ().vol, 71520, 1e-6, 'mit 0,2 mm Abstand');
    near(supZ().hoehe, 29.8, 1e-6, 'Höhe 29,8 mm');
    click('#dialog [data-cmd="oh-sup"][data-style="grid"]');
    expect(/Rasterweite/.test(q('#dialog').textContent), 'Gitter: Feld „Rasterweite“');
    await neu(supZ().vol);
    await setOh('spacing', 10); await neu(supZ().vol);
    const g = supZ();
    // Die quadratischen Ausschnitte sind halb so breit wie die Rasterweite,
    // lassen also ein Viertel der bedeckten Flaeche stehen.
    expect(g.vol > 71520 * 0.70 && g.vol < 71520 * 0.80, `Gitter: drei Viertel des Vollblocks (${g.vol} von 71520)`);
    near(g.hoehe, 29.8, 1e-6, 'Gitter reicht ebenso bis zum Bett');
    click('#dialog [data-cmd="oh-sup"][data-style="none"]'); await sleep(300);
    expect(!C.vp.markG && !/Stützmaterial/.test(q('#dialog').textContent), '„Keine“: Stützmaterial weg');
    click('#dialog [data-cmd="oh-close"]'); await sleep(300);
    expect(D.body.dataset.mode === 'model' && !C.vp.overhang && !C.vp.markG, 'geschlossen: Modell ohne Markierung');
  }],
  ['Zebra-Analyse ein und aus', async () => {
    await newDoc(); await box(20, 20, 20);
    const zebra = async () => { click('[data-rtab="solid"]'); await sleep(120); click('[data-menu="solid:inspect"]'); await sleep(120); click('#fmenu [data-cmd="zebra"]'); await sleep(150); };
    const before = C.vp.model.body.material;
    await zebra();
    expect(C.vp.zebra === 'zebra' && C.vp.model.body.material.type === 'ShaderMaterial', 'Zebra an: Streifenmaterial');
    // bleibt nach einem Neuaufbau an
    await cmd('solid:modify', 'fillet');
    pick(edges().find(e => e.info.type === 'LINE')); num('radius', 3); await ok();
    expect(C.vp.model.body.material.type === 'ShaderMaterial', 'nach dem Neuaufbau weiter an');
    await zebra();
    expect(C.vp.zebra === false && C.vp.model.body.material.type !== 'ShaderMaterial', `Zebra aus: altes Material zurück (${C.vp.model.body.material.type} / vorher ${before.type})`);
    // Umgebungs-Map-Analyse: eigenes Material, teilt sich den Platz mit Zebra, Shader übersetzt fehlerfrei
    const analyse = async c => { click('[data-rtab="solid"]'); await sleep(120); click('[data-menu="solid:inspect"]'); await sleep(120); click(`#fmenu [data-cmd="${c}"]`); await sleep(150); };
    const normal = C.vp.model.body.material;
    await analyse('envmap');
    expect(C.vp.zebra === 'umgebung' && C.vp.model.body.material === C.vp.umgebMat, 'Umgebungs-Map an');
    let shaderFehler = '';
    const r = C.vp.renderer, alt = r.debug.onShaderError;
    r.debug.onShaderError = (gl, prog, vs, fs) => { shaderFehler = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || 'Fehler'; };
    try { r.render(C.vp.scene, C.vp.camera); } finally { r.debug.onShaderError = alt; }
    expect(!shaderFehler, `Shader der Umgebungs-Map übersetzt ${shaderFehler}`);
    await analyse('zebra');
    expect(C.vp.zebra === 'zebra' && C.vp.model.body.material === C.vp.zebraMat, 'Zebra löst die Umgebungs-Map ab');
    await analyse('envmap'); await analyse('envmap');
    expect(C.vp.zebra === false && C.vp.model.body.material === normal, 'Umgebungs-Map aus: Körpermaterial zurück');
  }],
  ['Umgebungs-Map-Analyse mit eigenem Bild aus Rendern', async () => {
    // HDR 8 × 2 in Rendern laden → die Analyse spiegelt dieses Panorama (erste Zeile oben, HDR weich begrenzt);
    // Bild entfernt → wieder die Studio-Umgebung.
    await openExample('Winkel 80x60x8');
    const analyse = async c => { click('[data-rtab="solid"]'); await sleep(120); click('[data-menu="solid:inspect"]'); await sleep(120); click(`#fmenu [data-cmd="${c}"]`); await sleep(150); };
    const rendern = async () => { click('[data-rtab="util"]'); await sleep(150); click('[data-cmd="render"]'); return waitFor(() => D.querySelector('#render:not([hidden])'), 4000, 'Rendern'); };
    let R = await rendern();
    const kopf = [...'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 8\n'].map(c => c.charCodeAt(0));
    const px = [].concat(...Array.from({ length: 16 }, (_, i) => (i < 8 ? [128, 160, 255, 128] : [90, 60, 30, 128])));
    const datei = R.querySelector('input[data-r="envFile"]'), dt = new W.DataTransfer();
    dt.items.add(new W.File([new Uint8Array([...kopf, ...px])], 'himmel.hdr'));
    datei.files = dt.files; datei.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.rendering.umgebungsbild === 'himmel.hdr', 4000, 'Bild geladen');
    click('[data-cmd="render-close"]'); await sleep(400);
    await analyse('envmap');
    const u = () => C.vp.umgebMat.uniforms;
    expect(C.vp.zebra === 'umgebung' && u().hatBild.value === 1 && u().oben.value === 1 && u().hdr.value === 1 && u().bild.value === C.rendering.umgebungsTextur.tex, 'Analyse mit dem eigenen HDR-Bild');
    let shaderFehler = '';
    const r = C.vp.renderer, alt = r.debug.onShaderError;
    r.debug.onShaderError = (gl, prog, vs, fs) => { shaderFehler = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || 'Fehler'; };
    try { r.render(C.vp.scene, C.vp.camera); } finally { r.debug.onShaderError = alt; }
    expect(!shaderFehler, `Shader mit Bild übersetzt ${shaderFehler}`);
    await analyse('envmap');
    R = await rendern();
    click('#render [data-r="envDel"]'); await sleep(100);
    click('[data-cmd="render-close"]'); await sleep(400);
    await analyse('envmap');
    expect(C.vp.zebra === 'umgebung' && u().hatBild.value === 0, 'ohne Bild: Studio-Umgebung');
    await analyse('envmap');
    expect(C.vp.zebra === false, 'Analyse aus');
  }],
  ['Ansichtsbereich: Bild als Vorlage', async () => {
    // Bild 200 × 100 Pixel laden: Bildfläche in XZ, Breite 120 → Höhe 60, Mitte (10 | 30), halb durchsichtig
    await newDoc();
    await cmd('solid:insert', 'canvas');
    expect(/Erst ein Bild laden/.test(q('#dialog').textContent) || !!D.querySelector('#dialog [data-cmd="canvas-load"]'), 'Dialog mit „Bild laden …“');
    const cv = D.createElement('canvas'); cv.width = 200; cv.height = 100; const g = cv.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 200, 100);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    click('#dialog [data-cmd="canvas-load"]'); await sleep(100);
    const inp = q('#canvasfile'), dt = new W.DataTransfer(); dt.items.add(new W.File([blob], 'vorlage.png', { type: 'image/png' })); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => /vorlage\.png/.test(q('#dialog').textContent), 5000, 'Bild geladen');
    await seg('cplane', 'XZ'); num('w', 120); num('cx', 10); num('cy', 30); await ok();
    const f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'canvas' && /^data:image\/png/.test(f.img) && Math.abs(f.ar - 0.5) < 1e-9 && f.cplane === 'XZ', 'gespeichert: Bild, Seitenverhältnis ½, Ebene XZ');
    await waitFor(() => C.vp.canvasG && C.vp.canvasG.children.length === 1, 5000, 'Bildfläche im Viewport');
    const m = C.vp.canvasG.children[0], gp = m.geometry.parameters;
    near(gp.width, 120, 1e-6, 'Breite 120'); near(gp.height, 60, 1e-6, 'Höhe 60 (Seitenverhältnis)');
    near(m.position.x, 10, 1e-6, 'Mitte x 10'); near(m.position.y, 0, 1e-6, 'in der XZ-Ebene'); near(m.position.z, 30, 1e-6, 'Mitte z 30');
    near(m.material.opacity, 0.6, 1e-9, 'halb durchsichtig');
    expect(C.lastBuild.bodies.length === 0 && C.lastBuild.status[f.id].ok, 'keine Geometrie, kein Fehler');
  }],
  ['Skizze: Abhängigkeiten automatisch', async () => {
    // wie nach einem Import: zwei fast waagrechte/senkrechte Linien (0,2° bzw. 0,3° schief), ein Linienende, das das
    // nächste um 0,0005 mm verfehlt (eigener Punkt), und ein Bogen, der tangential an eine Linie anschließt
    const M = await import('../src/sketch/model.js'), K = await import('../src/sketch/commands.js');
    const t2 = Math.tan(0.2 * Math.PI / 180), t3 = Math.tan(0.3 * Math.PI / 180);
    const sk = { points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 50, y: 50 * t2 }, { id: 'c', x: 50.0005, y: 50 * t2 }, { id: 'd', x: 50.0005 + 30 * t3, y: 30 + 50 * t2 },
      { id: 'm', x: 70, y: 0 }, { id: 'e', x: 70, y: 20 }, { id: 'f', x: 90, y: 0 }, { id: 'g', x: 40, y: 20 }],
      curves: [{ id: 'l1', type: 'line', p1: 'a', p2: 'b' }, { id: 'l2', type: 'line', p1: 'c', p2: 'd' },
        { id: 'k1', type: 'arc', c: 'm', s: 'f', e: 'e', r: 20, a0: 0, a1: Math.PI / 2 }, { id: 'l3', type: 'line', p1: 'e', p2: 'g' }], rules: [] };
    const n = K.autoConstraints(sk);
    expect(n.hv === 3 && n.coincident === 1 && n.tangent === 1, `ergänzt: ${JSON.stringify(n)} (erwartet l1, l3 waagrecht, l2 senkrecht, 1 deckungsgleich, 1 tangential)`);
    expect(sk.rules.some(r => r.type === 'horizontal' && r.l === 'l1') && sk.rules.some(r => r.type === 'vertical' && r.l === 'l2'), 'l1 waagrecht, l2 senkrecht');
    expect(sk.rules.some(r => r.type === 'coincident' && [r.a, r.b].sort().join() === 'b,c'), 'Lücke 0,0005 mm → deckungsgleich');
    expect(sk.rules.some(r => r.type === 'tangent' && [r.a, r.b].sort().join() === 'k1,l3'), 'Bogen – Linie tangential');
    expect(K.autoConstraints(sk).hv === 0, 'zweiter Lauf legt nichts doppelt an');
    // über das Werkzeug im Skizzen-Editor: eine von Hand schief gesetzte Linie bekommt „Horizontal“
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('line'); sketchClick(10, 10); sketchClick(40, 10); C.editor.setTool(null); await sleep(100);
    const ln = C.editor.f.curves.find(c => c.type === 'line');
    C.editor.f.rules = C.editor.f.rules.filter(r => !(r.type === 'horizontal' && r.l === ln.id));
    C.editor.f.points.find(p => p.id === ln.p2).y += 0.05;
    C.editor.setTool('autocons'); await sleep(200);
    expect(C.editor.lastAuto && C.editor.lastAuto.hv === 1 && C.editor.f.rules.some(r => r.type === 'horizontal' && r.l === ln.id), `Werkzeug ergänzt „Horizontal“ (${JSON.stringify(C.editor.lastAuto)})`);
    expect(!C.editor.tool, 'Werkzeug ist sofort wieder aus');
  }],
  ['Skizze: Anzeige (Maße außen, Sichtbarkeit, Raster, Ausrichten, Browser)', async () => {
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(500);
    const E = C.editor, vp = C.vp;
    // Kamera schaut senkrecht auf die Skizzenebene (XY → Blick entlang −Z)
    const dir = vp.camera.position.clone().sub(vp.controls.target).normalize();
    expect(dir.z > 0.999, `Blick senkrecht auf XY (${dir.toArray().map(v => v.toFixed(3))})`);
    // Rechteck 40 × 20 eingetippt: Breite an der unteren, Höhe an der linken Kante, beide außen
    E.setTool('rect'); sketchClick(10, 10); E.onPointerMove(sketchEvt(30, 20)); await sleep(50);
    E.vin = { vals: ['40', '20'], idx: 0 }; E.commitTyped(); E.setTool(null); await sleep(150);
    const pm = new Map(E.f.points.map(p => [p.id, p])), cm = new Map(E.f.curves.map(c => [c.id, c]));
    const dims = E.f.rules.filter(r => r.type === 'distance');
    expect(dims.length === 2, `zwei Maße (${dims.length})`);
    const mid = r => { const c = cm.get(r.a), a = pm.get(c.p1), b = pm.get(c.p2); return [(a.x + b.x) / 2, (a.y + b.y) / 2]; };
    const w = dims.find(r => Math.abs(r.value - 40) < 1e-9), h = dims.find(r => Math.abs(r.value - 20) < 1e-9);
    expect(w && Math.abs(mid(w)[1] - 10) < 1e-6 && w.off[1] < 0 && Math.abs(w.off[0]) < 1e-9, `Breite unten, Maß darunter (${w && w.off})`);
    expect(h && Math.abs(mid(h)[0] - 10) < 1e-6 && h.off[0] < 0 && Math.abs(h.off[1]) < 1e-9, `Höhe links, Maß links daneben (${h && h.off})`);
    // Sichtbarkeit: Bemaßungen und Punkte aus/ein
    const nDim = () => D.querySelectorAll('.sk-dim').length;
    expect(nDim() === 2, `2 Maße sichtbar (${nDim()})`);
    const box = q('#dialog [data-show="dims"]'); box.checked = false; box.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    expect(nDim() === 0, 'Bemaßungen ausgeblendet');
    box.checked = true; box.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    expect(nDim() === 2, 'Bemaßungen wieder da');
    // Konstruktionsgeometrie ausgeblendet = nicht anklickbar
    const ln = E.f.curves[0]; ln.cons = true; E.render();
    E.setShow('cons', false);
    const a = pm.get(ln.p1), b = pm.get(ln.p2), hit = E.pickAt([(a.x + b.x) / 2, (a.y + b.y) / 2], { points: false });
    expect(!hit || hit.id !== ln.id, 'ausgeblendete Konstruktionslinie wird nicht getroffen');
    E.setShow('cons', true); ln.cons = false; E.render();
    // Raster: Zahlen an den Achsen
    expect(D.querySelectorAll('.sk-axnum').length > 4, `Zahlen am Raster (${D.querySelectorAll('.sk-axnum').length})`);
    // Aufschneiden setzt einen Schnitt an der Skizzenebene, Fertig nimmt ihn wieder weg
    const sl = q('#dialog [data-opt="slice"]'); sl.checked = true; sl.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
    expect(vp.section && vp.section.n[2] === 1 && Math.abs(vp.section.d) < 1e-3, `Schnitt an der Skizzenebene (${JSON.stringify(vp.section)})`);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    expect(!vp.section, 'Schnitt nach der Skizze wieder weg');
    // Browser liegt durchsichtig über der Ansicht (seit 27.10.2026 ganz ohne Hintergrund)
    const bs = W.getComputedStyle(q('#browser')), vr = q('#viewport').getBoundingClientRect(), br = q('#browser').getBoundingClientRect();
    expect(bs.backgroundColor === 'rgba(0, 0, 0, 0)' && Math.abs(vr.left - br.left) < 2, `Browser durchsichtig über der Ansicht (${bs.backgroundColor}, Ansicht ab ${vr.left}, Browser ab ${br.left})`);
  }],
  ['Sweeping: Pfad beginnt im Ursprung (Rohrbogen)', async () => {
    // Rückmeldung aus der Praxis: Pfad-Linie vom Ursprung aus → „Cannot read properties of undefined (reading 'x')“, weil der
    // Kern den virtuellen Ursprungspunkt O nicht kannte. Pfad auf XZ: (0|0) → (0|60), Halbkreis R 30 nach (60|60);
    // Kreis R 10 auf XY im Ursprung. Guldin: V = π·10²·(60 + 30π)
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XZ"]');
    await waitFor(() => C.editor, 4000, 'Skizze Pfad'); await sleep(500);
    C.editor.setTool('line'); sketchClick(0, 0); sketchClick(0, 60); C.editor.setTool(null); await sleep(100);
    expect(C.editor.f.curves[0].p1 === 'O', `Linie beginnt am Ursprungspunkt O (${C.editor.f.curves[0].p1})`);
    C.editor.setTool('tarc'); sketchClick(0, 60); sketchClick(60, 60); C.editor.setTool(null); await sleep(100);
    expect(C.editor.f.curves.some(c => c.type === 'arc'), 'Tangentialbogen');
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Pfad fertig');
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizze Profil'); await sleep(500);
    C.editor.setTool('circle'); sketchClick(0, 0); sketchClick(10, 0); C.editor.setTool(null); await sleep(100);
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Profil fertig');
    await cmd('solid:create', 'sweep'); await sleep(300);
    const f = C.editing.feature, st = () => C.lastBuild.status[f.id];
    await waitFor(() => st(), 15000, 'Vorschau');
    expect(st().ok, `kein Fehler (${st().error || ''})`);
    await ok(30000);
    near(await vol(C.lastBuild.bodies[0]), Math.PI * 100 * (60 + 30 * Math.PI), 1e-3, 'Rohrbogen nach Guldin');
  }],
  ['Claude-Anbindung: Platte mit vier Bohrungen über die Werkzeuge', async () => {
    // wie Claude über den MCP-Server: Skizze aus Formen, Extrusion, messen, ändern, Parameter, löschen, rückgängig.
    // Platte 200 × 100 × 8 mit vier Löchern ⌀ 9 je 15 mm vom Rand: V = 160000 − 4·π·4,5²·8
    await newDoc();
    const run = (t, a) => C.aiRun(t, a);
    const sk = await run('skizze_anlegen', { ebene: 'XY', bemassen: true, formen: [
      { art: 'rechteck', x0: 0, y0: 0, x1: 200, y1: 100 },
      ...[[15, 15], [185, 15], [185, 85], [15, 85]].map(([cx, cy]) => ({ art: 'kreis', cx, cy, d: 9 }))] });
    expect(sk.zustand === 'ok' && sk.profile === 5, `Skizze ok mit 5 Profilen (${sk.zustand}, ${sk.profile})`);
    expect(C.doc.features[0].rules.filter(r => r.type === 'diameter').length === 4, 'Bohrungen bemaßt');
    const ex = await run('feature_anlegen', { feature: { type: 'extrude', sketch: sk.id, profiles: null, distance: 8, direction: 'normal', op: 'new' } });
    const V = 200 * 100 * 8 - 4 * Math.PI * 4.5 ** 2 * 8;
    expect(ex.zustand.startsWith('ok') && ex.koerper.length === 1, `Extrusion ok, ein Körper (${ex.zustand})`);
    near(ex.koerper[0].volumen, V, 1e-3, 'Volumen aus dem Bericht');
    const m = await run('messen', {});
    near(m.koerper[0].volumen, V, 1e-3, 'messen: Volumen');
    expect(m.koerper[0].huelle[1][2] === 8 && m.koerper[0].flaechen === 10, `Hülle bis z 8, 10 Flächen (${m.koerper[0].flaechen})`);
    // Parameter und Ausdruck: Dicke über Parameter steuern
    const pa = await run('parameter_setzen', { name: 'dicke', ausdruck: '12' });
    expect(pa.wert === 12, 'Parameter dicke = 12');
    await run('feature_aendern', { id: ex.id, aenderungen: { distance: 12, exprs: { distance: { e: 'dicke', v: 12 } } } });
    near((await run('messen', {})).koerper[0].volumen, V * 12 / 8, 1e-3, 'dicker über feature_aendern');
    await run('parameter_setzen', { name: 'dicke', ausdruck: '5' });
    near((await run('messen', {})).koerper[0].volumen, V * 5 / 8, 1e-3, 'Parameter steuert die Dicke');
    // Lesen: Skizze gekürzt, Zustand je Feature
    const d = await run('dokument_lesen', {});
    expect(d.features.length === 2 && d.features[0].kurven.length === 8 && d.features.every(f => f.zustand.startsWith('ok')) && d.parameter[0].wert === 5, `dokument_lesen (${d.features.length} Features, ${d.features[0].kurven && d.features[0].kurven.length} Kurven)`);
    // Fehler kommen als Meldung zurück, nicht als Absturz
    let err = '';
    try { await run('feature_anlegen', { feature: { type: 'gibtsnicht' } }); } catch (e) { err = e.message; }
    expect(/Unbekannter Feature-Typ/.test(err), `unbekannter Typ gemeldet (${err})`);
    const bad = await run('feature_anlegen', { feature: { type: 'extrude', sketch: 'xyz', distance: 5, op: 'join' } });
    expect(bad.zustand.startsWith('Fehler'), `Fehler eines Features im Bericht (${bad.zustand})`);
    await run('rueckgaengig', {});
    expect(C.doc.features.length === 2, 'rückgängig nimmt das kaputte Feature wieder weg');
    // Löschen und wieder herstellen
    const del = await run('feature_loeschen', { id: ex.id });
    expect(del.koerper.length === 0, 'gelöscht: kein Körper mehr');
    await run('rueckgaengig', {});
    expect(C.lastBuild.bodies.length === 1, 'rückgängig: Körper wieder da');
    // Bild der Ansicht
    const img = await run('ansicht_bild', { ansicht: 'iso', breite: 400 });
    expect(img.bild.length > 2000 && /^iVBOR/.test(img.bild), `PNG-Bild (${img.bild.length} Zeichen)`);
    // während der Bearbeitung keine Änderungen von außen
    await cmd('solid:modify', 'fillet');
    let busy = '';
    try { await run('feature_loeschen', { id: ex.id }); } catch (e) { busy = e.message; }
    expect(/gerade/.test(busy), `beim Bearbeiten gesperrt (${busy})`);
    click('#dialog [data-cmd="cancel"]'); await sleep(200);
  }],
  ['Topologieoptimierung (älteres Feature) baut in vorhandenen Dateien weiter', async () => {
    // Einstieg ist jetzt der Arbeitsbereich „Generatives Design“; das Feature `topo` bleibt für ältere Dateien
    await newDoc();
    const sk = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 100, y1: 20 }, { art: 'punkt', x: 100, y: 10 }] });
    const pts = C.doc.features[0].points, id = (x, y) => pts.find(p => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9).id;
    const r = await C.aiRun('feature_anlegen', { feature: { type: 'topo', sketch: sk.id, profiles: null, rolle: { [id(0, 0)]: { art: 'fest' }, [id(0, 20)]: { art: 'fest' }, [id(100, 10)]: { art: 'last', fx: 0, fy: -100 } }, anteil: 40, dicke: 5, material: 'steel' } });
    expect(r.zustand.startsWith('ok') && /Umriss 40/.test(r.zustand), `gebaut, Umriss 40 % (${r.zustand})`);
    near(r.koerper[0].volumen, 4000, 0.02 * 4000, 'Volumen 0,4 · 100 · 20 · 5');
  }],
  ['Generatives Design: Lasche mit drei Augen (Arbeitsbereich)', async () => {
    // Platte 100 × 50 × 10 als Startform, Ringe ⌀ 20/⌀ 10 als Beibehalten-Geometrie, zwei Bohrungen fest, Kraft
    // 300/300 N an der dritten. Steifigkeit maximieren bei 100 g (Stahl) → Ergebnis wiegt 100 g ± 2 %, ein Teil
    await newDoc();
    const L = [[-40, 15], [-40, -15], [40, 0]];
    const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: -50, y0: -25, x1: 50, y1: 25 }, ...L.map(([cx, cy]) => ({ art: 'kreis', cx, cy, d: 10 }))] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 10, direction: 'normal', op: 'new' } });
    const s2 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: L.flatMap(([cx, cy]) => [{ art: 'kreis', cx, cy, d: 20 }, { art: 'kreis', cx, cy, d: 10 }]) });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s2.id, profiles: L.map(([cx, cy]) => [cx + 7.5, cy]), distance: 10, direction: 'normal', op: 'new' } });
    const [platte, ringe] = C.lastBuild.bodies;
    const bereich = idb => C.lastBuild.mesh.bodies.find(b => b.id === idb).faces;
    const fl = idb => faces().filter(h => bereich(idb)[0] <= h.index && h.index < bereich(idb)[1]);
    const loch = (cx, cy) => fl(ringe).find(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 5) < 1e-6 && Math.hypot(h.info.center[0] - cx, h.info.center[1] - cy) < 1);
    // Arbeitsbereich über das Menü „Konstruktion ▾“
    click('[data-menu="ws"]'); await sleep(150); click('#fmenu [data-cmd="gd-open"]'); await sleep(300);
    expect(D.body.dataset.mode === 'gd' && /Entwurfsbereich/.test(q('#ribbon').textContent) && /Entwurfsbedingungen/.test(q('#ribbon').textContent), 'Arbeitsbereich mit eigenem Menüband');
    expect(/Vorprüfung/.test(q('#dialog').textContent) && q('#dialog [data-cmd="gd-erzeugen"]').disabled, 'Vorprüfung sperrt Erzeugen');
    click('[data-cmd="gd-w-startform"]'); await sleep(80); pick(fl(platte)[0]); await sleep(80);
    click('[data-cmd="gd-w-beibehalten"]'); await sleep(80); pick(fl(ringe)[0]); await sleep(80);
    expect(C.vp.bodyColors[ringe] === '#2ea043' && C.vp.bodyColors[platte] === '#e3b341', 'Beibehalten grün, Startform gelb');
    click('[data-cmd="gd-w-abh"]'); await sleep(80); pick(loch(-40, 15)); await sleep(60); pick(loch(-40, -15)); await sleep(60);
    click('[data-cmd="gd-w-last"]'); await sleep(80);
    const kraft = (k, v) => { const i = q(`#dialog [data-gd="${k}"]`); i.value = v; i.dispatchEvent(new W.Event('input', { bubbles: true })); };
    // erst mit Vorgabe 100 N anlegen, dann die gewählte Last auf 424,264 N unter 45° ändern → (300 | 300 | 0) N
    pick(loch(40, 0)); await sleep(80);
    const l0 = C.doc.gd.studie.lastfaelle[0].lasten[0];
    expect(l0 && Math.abs(l0.fy + 100) < 1e-6 && Math.abs(l0.fx) < 1e-6, 'neue Last mit Vorgabe 100 N in −Y');
    expect(D.querySelectorAll('#gdmarken .gdpf').length === 1, 'Kraftpfeil im Modell');
    kraft('betrag', 424.264); kraft('winkel', 45); await sleep(50);
    expect(Math.abs(l0.fx - 300) < 0.01 && Math.abs(l0.fy - 300) < 0.01 && Math.abs(l0.fz) < 1e-6, `Last geändert (${l0.fx} | ${l0.fy} | ${l0.fz})`);
    click('[data-cmd="gd-richtung"][data-v="0"]'); await sleep(50);
    expect(Math.abs(l0.fx - 424.264) < 0.01 && Math.abs(l0.fy) < 1e-6, 'Richtungsknopf +X');
    kraft('winkel', 45); await sleep(50);
    click('[data-cmd="gd-w-ziele"]'); await sleep(80);
    expect(C.doc.gd.studie.ziel.art === 'masse', 'Standardziel: Masse minimieren');
    click('[data-cmd="gd-ziel"][data-v="steifigkeit"]'); await sleep(80);
    const mi = q('#dialog [data-gd="masse"]'); mi.value = 100; mi.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(50);
    click('[data-cmd="gd-w-aus"]'); await sleep(80);
    const s = C.doc.gd.studie;
    expect(s.startform === platte && s.beibehalten[0] === ringe && s.abhaengigkeiten.length === 2 && s.lastfaelle[0].lasten.length === 1 && s.ziel.masse === 100, 'Studie vollständig eingerichtet');
    await sleep(100);
    expect(D.querySelectorAll('#gdmarken .gdm').length === 3, `Marken „Fest“ und Kraft im Modell (${D.querySelectorAll('#gdmarken .gdm').length})`);
    expect(/bestanden/.test(q('#dialog').textContent), 'Vorprüfung bestanden');
    click('#dialog [data-cmd="gd-erzeugen"]');
    await waitFor(() => q('#gdexplore'), 120000, 'Ergebnisse');
    const r = C.doc.gd.ergebnisse[0];
    expect(C.doc.gd.ergebnisse.length === 1 && r.material === 'steel', 'ein Ergebnis (Stahl)');
    near(r.masse, 100, 2, 'Masse = Zielmasse 100 g');
    expect(r.teile === 1 && r.sicherheit > 1 && r.weg > 0, `ein Teil, Sicherheitsfaktor ${r.sicherheit && r.sicherheit.toFixed(2)}, Weg ${r.weg.toFixed(4)} mm`);
    expect(q('#gdexplore .gdcard.on') && /Konstruktion erstellen/.test(q('#gdexplore').textContent), 'Ergebnis gewählt, Konstruktion erstellen angeboten');
    click('#gdexplore [data-cmd="gd-erstellen"]');
    await waitFor(() => D.body.dataset.mode === 'model' && C.lastBuild.bodies.length === 3, 30000, 'Konstruktion');
    const f = C.doc.features[C.doc.features.length - 1], neu = C.lastBuild.bodies.find(b => b !== platte && b !== ringe);
    expect(f.type === 'gdform' && C.lastBuild.status[f.id].ok, 'Feature „Generatives Design“ gebaut');
    expect(C.doc.bodies[platte].hidden && C.doc.bodies[ringe].hidden, 'Startform und Ringe ausgeblendet');
    const bb = await bbox(neu);
    // 0,01 mm: die Hülle einer B-Spline-Fläche rechnet OCC aus den Polen, die bei gewölbten Stücken etwas außen liegen
    [[-50, -25, 0], [50, 25, 10]].forEach((c, i) => c.forEach((v, k) => expect(i ? bb[i][k] <= v + 0.01 : bb[i][k] >= v - 0.01, `innerhalb der Platte [${i}][${k}] (${bb[i][k].toFixed(3)})`)));
    // Bohrungen exakt: drei Zylinder ⌀ 10 an den Augenmitten, Kontur als glatte Freiformfläche (keine Facetten)
    const bn = C.lastBuild.mesh.bodies.find(b => b.id === neu).faces, fn = faces().filter(h => bn[0] <= h.index && h.index < bn[1]);
    const zyl = L.filter(([cx, cy]) => fn.some(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 5) < 1e-6 && Math.hypot(h.info.center[0] - cx, h.info.center[1] - cy) < 1e-6));
    expect(zyl.length === 3, `Bohrungen ⌀ 10 exakt (${zyl.length} von 3)`);
    // Kontur aus Geraden und Kreisbögen: nur Ebenen und Zylinder, keine Freiformflächen, keine Facetten
    expect(fn.every(h => h.info.type === 'PLANE' || h.info.type === 'CYLINDRE') && fn.length < 80, `nur Ebenen und Zylinder (${fn.length} Flächen: ${[...new Set(fn.map(h => h.info.type))].join(', ')})`);
    // die Ringe sind exakt im Körper: Volumen ≥ Ringvolumen 3 · π · (10² − 5²) · 10
    const vn = await vol(neu);
    expect(vn > 3 * Math.PI * 75 * 10, 'Augen vollständig enthalten');
    // Körper wiegt, was das Ergebnis angibt (Stahl 7,85 g/cm³) – prüft Endform und Volumenrechnung der Spline-Flächen
    near(vn * 7.85 / 1000, r.masse, 0.01 * r.masse, `Körpermasse = Ergebnismasse (${(vn * 7.85 / 1000).toFixed(1)} g)`);
  }],
  ['Generatives Design: Geraden über den Anfang des Zugs', async () => {
    // Fehler aus einer Studie (22.10.2026): lag der freie Teil einer Geraden hinter dem Anfang des Punktzugs, lief ein
    // Index über das Ende hinaus – jede leichtere Variante brach ab, das Ergebnis blieb bei 62 % Werkstoff (SF 260).
    // Die Kontur von damals liegt in tests/gd-kontur-umlauf.json; die alte Fassung warf hier „reading '0'“.
    const { linienBoegen, kettePunkte } = await import('../src/sim/gd-linien.js');
    const f = await (await fetch('/tests/gd-kontur-umlauf.json')).json();
    let k = null, fehler = '';
    try { k = linienBoegen(f.P, () => f.tol, { minLinie: 2 * f.he, kreise: f.kreise, kanten: f.kanten, lueckenTol: f.tol }); } catch (e) { fehler = e.message; }
    expect(k && !fehler, `Kette gebaut ${fehler}`);
    const L = k.teile.filter(t => t.typ === 'l').length;
    expect(L >= 5, `Geraden gefunden (${L} von ${k.teile.length} Stücken)`);
    // geschlossen und nah an der Kontur: jeder Punkt der Kette liegt höchstens etwas über der Toleranz neben dem Zug
    const pk = kettePunkte(k, 0.3), abst = q => Math.min(...f.P.map(p => Math.hypot(p[0] - q[0], p[1] - q[1])));
    expect(Math.max(...pk.filter((_, i) => i % 5 === 0).map(abst)) < 3 * f.tol, 'Kette folgt der Kontur');
  }],
  ['Generatives Design: Augen über die Startform hinaus, ohne Kerben', async () => {
    // Platte x −45…45, y −25…25; Augen ⌀ 20 / Bohrung ⌀ 10 bei (−40, ±15) und (40, 0) ragen links/rechts um 5 mm heraus.
    // Dichtefeld von Hand: Augen und zwei Stäbe zum rechten Auge, Rest leer. Die Endform muss die Augen ganz enthalten
    // (x bis −50 / +50) und darf an keiner Stelle in ein Auge einschneiden (Kerben an den Übergängen).
    const { endform } = await import('../src/sim/gd-form.js');
    const L = [[-40, 15], [-40, -15], [40, 0]], el = 1.2, x0 = -52, y0 = -27, nelx = Math.round(104 / el), nely = Math.round(54 / el), hx = 104 / nelx, hy = 54 / nely;
    const mask = new Uint8Array(nelx * nely), keep = new Uint8Array(nelx * nely), x = new Float64Array(nelx * nely);
    const strecke = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2))); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); };
    for (let e = 0; e < mask.length; e++) {
      const c = [x0 + (e % nelx + 0.5) * hx, y0 + (Math.floor(e / nelx) + 0.5) * hy], d = Math.min(...L.map(([a, b]) => Math.hypot(c[0] - a, c[1] - b)));
      if (d < 5) continue;
      if (d < 10) { mask[e] = keep[e] = 1; x[e] = 1; continue; }
      if (Math.abs(c[0]) <= 45 && Math.abs(c[1]) <= 25) { mask[e] = 1; x[e] = Math.min(strecke(c, L[0], L[2]), strecke(c, L[1], L[2])) < 2.5 ? 1 : 0; }
    }
    const kreis = ([a, b], r, n = 72) => Array.from({ length: n }, (_, k) => [a + r * Math.cos(2 * k * Math.PI / n), b + r * Math.sin(2 * k * Math.PI / n)]);
    const geo = { keep: L.map(c => ({ poly: kreis(c, 10), holePolys: [kreis(c, 5).reverse()] })), hindernis: [], start: [{ poly: [[-45, -25], [45, -25], [45, 25], [-45, 25]], holePolys: L.map(c => kreis(c, 5).reverse()) }] };
    let A = 0; for (let e = 0; e < x.length; e++) if (mask[e]) A++;
    let V = 0; for (let e = 0; e < x.length; e++) V += x[e];
    const r = endform(x, { nelx, nely, hx, hy, ox: x0, oy: y0, mask, keep }, V / A, geo);
    expect(r.flaechen.length === 1, `ein Teil (${r.flaechen.length})`);
    const P = r.flaechen[0].punkte, xs = P.map(p => p[0]);
    near(Math.min(...xs), -50, 0.02, 'linke Augen ragen ganz heraus (x bis −50)');
    near(Math.max(...xs), 50, 0.02, 'rechtes Auge ragt ganz heraus (x bis +50)');
    const kerbe = Math.max(...P.map(p => Math.max(...L.map(c => 10 - Math.hypot(p[0] - c[0], p[1] - c[1])))));
    expect(kerbe < 0.02, `keine Kerbe in einem Auge (tiefster Punkt ${kerbe.toFixed(3)} mm im Augenkreis)`);
    const k = r.flaechen[0].segmente;
    expect(k && k.teile.some(t => t.typ === 'l') && k.teile.some(t => t.typ === 'a' && Math.abs(t.r - 10) < 1e-6), 'Kontur aus Geraden und exakten Augenbögen');
  }],
  ['Generatives Design: Knicken gegen Euler', async () => {
    // Kragstab 100 × 4 mm, Dicke 10, links eingespannt, rechts 1000 N Druck. Euler-Fall 1: P = π²·E·I / (4·L²),
    // I = 10 · 4³ / 12 = 53,33 mm⁴ → P = 2763,5 N, λ = 2,7635. Q4-Raster 1 mm: etwa 3 % zu steif, 0,5 mm: 0,7 %
    const { knicken } = await import('../src/sim/topo.js');
    const lauf = h => {
      const ny = Math.round(4 / h), links = Array.from({ length: ny + 1 }, (_, j) => [0, j * h]), rechts = links.map(([, y]) => [100, y]);
      return knicken({ nelx: Math.round(100 / h), nely: ny, hx: h, hy: h, ox: 0, oy: 0, stuetzen: [{ punkte: links, art: 'fest' }], lastfaelle: [[{ punkte: rechts, fx: -1000, fy: 0 }]], E: 210000, nu: 0.3, dicke: 10 });
    };
    const soll = Math.PI ** 2 * 210000 * (10 * 64 / 12) / (4 * 100 * 100) / 1000;
    const r1 = lauf(1), r2 = lauf(0.5);
    expect(r1.lambda > soll && r1.lambda < soll * 1.04, `Raster 1 mm: λ ${r1.lambda.toFixed(4)} (Euler ${soll.toFixed(4)})`);
    expect(r2.lambda > soll && r2.lambda < soll * 1.01, `Raster 0,5 mm: λ ${r2.lambda.toFixed(4)}`);
    // Zug knickt nicht
    const z = knicken({ nelx: 50, nely: 4, hx: 2, hy: 1, ox: 0, oy: 0, stuetzen: [{ punkte: [[0, 0], [0, 2], [0, 4]], art: 'fest' }], lastfaelle: [[{ punkte: [[100, 0], [100, 4]], fx: 1000, fy: 0 }]], E: 210000, nu: 0.3, dicke: 10 });
    expect(z.lambda === Infinity, 'Zugstab: kein Knicken');
  }],
  ['Generatives Design: Masse minimieren mit Sicherheitsfaktor', async () => {
    // Kragarm: Startform 100 × 30 × 5, links ein Auge fest, rechts ein Auge mit 500 N nach unten (voll: σ ≈ 500·84/(5·30²/6) = 56 MPa, SF ≈ 4); grobes Raster (schnell).
    // Ergebnis muss den Sicherheitsfaktor 2 einhalten und leichter sein als die volle Startform
    await newDoc();
    const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 100, y1: 30 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 5, direction: 'normal', op: 'new' } });
    const s2 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [[8, 15], [92, 15]].flatMap(([cx, cy]) => [{ art: 'kreis', cx, cy, d: 14 }, { art: 'kreis', cx, cy, d: 6 }]) });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s2.id, profiles: [[8 + 5, 15], [92 + 5, 15]], distance: 5, direction: 'normal', op: 'new' } });
    const [platte, augen] = C.lastBuild.bodies;
    C.doc.gd = { studie: { name: 'Studie 1', achse: 'Z', beibehalten: [augen], hindernis: [], startform: platte, abhaengigkeiten: [], lastfaelle: [{ id: 'f1', name: 'Lastfall 1', lasten: [] }], fall: 0, ziel: { art: 'masse', masse: 100, sicherheit: 2 }, materialien: ['steel'], raster: 2.5, wiederholungen: 40 }, ergebnisse: [] };
    click('[data-menu="ws"]'); await sleep(150); click('#fmenu [data-cmd="gd-open"]'); await sleep(300);
    const fl = faces().filter(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 3) < 1e-6);
    click('[data-cmd="gd-w-abh"]'); await sleep(60); pick(fl.find(h => h.info.center[0] < 50)); await sleep(60);
    click('[data-cmd="gd-w-last"]'); await sleep(60);
    const i = q('#dialog [data-gd="betrag"]'); i.value = 500; i.dispatchEvent(new W.Event('input', { bubbles: true }));
    click('[data-cmd="gd-richtung"][data-v="270"]'); await sleep(40);
    pick(fl.find(h => h.info.center[0] > 50)); await sleep(60);
    click('#dialog [data-cmd="gd-erzeugen"]');
    await waitFor(() => q('#gdexplore'), 180000, 'Ergebnisse');
    const r = C.doc.gd.ergebnisse[0], voll = (100 * 30 - 2 * Math.PI * 9) * 5 * 7.85 / 1000;
    expect(r && r.ziel === 'masse' && r.sicherheit >= 2, `Sicherheitsfaktor ≥ 2 (${r && r.sicherheit})`);
    expect(r.masse < voll, `leichter als die volle Startform (${r.masse.toFixed(1)} < ${voll.toFixed(1)} g)`);
    // auf die Last ausgelegt: 650 statt 500 N (bei 90 % Material SF ≈ 2,3 – noch erreichbar) → schwereres Teil, SF wieder ≥ 2
    click('[data-cmd="gd-einrichten"]'); await sleep(150);
    click(`#dialog [data-cmd="gd-last-wahl"][data-id="${C.doc.gd.studie.lastfaelle[0].lasten[0].id}"]`); await sleep(80);
    const b = q('#dialog [data-gd="betrag"]'); b.value = 650; b.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(40);
    expect(Math.abs(C.doc.gd.studie.lastfaelle[0].lasten[0].fy + 650) < 1e-6, 'Last auf 650 N geändert');
    click('#dialog [data-cmd="gd-erzeugen"]');
    await waitFor(() => C.doc.gd.ergebnisse.length === 2 && q('#gdexplore'), 180000, 'zweites Ergebnis');
    const r2 = C.doc.gd.ergebnisse[1];
    expect(r2.sicherheit >= 2 && r2.masse > r.masse * 1.05, `1,3 × Kraft → schwerer (${r.masse.toFixed(1)} → ${r2.masse.toFixed(1)} g, SF ${r2.sicherheit.toFixed(2)})`);
    click('[data-cmd="gd-close"]'); await sleep(200);
    expect(D.body.dataset.mode === 'model', 'Arbeitsbereich geschlossen');
  }],
  ['Generatives Design: uneingeschränkt (3D), Kragarm', async () => {
    // Wandplatte 5 × 30 × 30 (Rückseite x = 0 fest) und Lastklotz 10 × 10 × 30 bei x = 70…80 (oben 500 N nach −Z) als
    // Beibehalten-Geometrie, ohne Startform (Hülle + 15 %). Steifigkeit maximieren bei 120 g Stahl; Beibehalten allein
    // 7500 mm³ = 58,9 g. Ergebnis: Masse 120 g, ein zusammenhängender Netzkörper von der Platte bis zum Klotz
    await newDoc();
    for (const r of [{ x0: 0, y0: -15, x1: 5, y1: 15 }, { x0: 70, y0: -5, x1: 80, y1: 5 }]) {
      const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', ...r }] });
      await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 30, direction: 'normal', op: 'new' } });
    }
    const ids = C.lastBuild.bodies.slice();
    expect(ids.length === 2, `zwei Körper (${ids.length})`);
    const bb0 = await bbox(ids[0]), wand = bb0[1][0] < 10 ? ids[0] : ids[1], klotz = wand === ids[0] ? ids[1] : ids[0];
    C.doc.gd = { studie: { name: 'Studie 1', achse: 'Z', beibehalten: [wand, klotz], hindernis: [], startform: null, abhaengigkeiten: [], lastfaelle: [{ id: 'f1', name: 'Lastfall 1', lasten: [] }], fall: 0, ziel: { art: 'steifigkeit', masse: 120, sicherheit: 2 }, materialien: ['steel'], raster: 3, wiederholungen: 30, fertigung: 'schneiden' }, ergebnisse: [] };
    click('[data-menu="ws"]'); await sleep(150); click('#fmenu [data-cmd="gd-open"]'); await sleep(300);
    click('[data-cmd="gd-w-fertigung"]'); await sleep(80);
    click('#dialog [data-cmd="gd-fert"][data-v="frei"]'); await sleep(80);
    expect(C.doc.gd.studie.fertigung === 'frei' && /Uneingeschränkt \(3D\)/.test(q('#dialog .gdsub').textContent) && !D.querySelector('#dialog [data-cmd="gd-achse"]'), 'Fertigung uneingeschränkt, ohne Schneidrichtung');
    const pl = (n, c) => faces().find(h => h.info.type === 'PLANE' && h.info.n.every((v, k) => Math.abs(v - n[k]) < 1e-6) && c(h.info.center));
    click('[data-cmd="gd-w-abh"]'); await sleep(60); pick(pl([-1, 0, 0], c => Math.abs(c[0]) < 1e-6)); await sleep(60);
    click('[data-cmd="gd-w-last"]'); await sleep(60);
    expect(D.querySelectorAll('#dialog [data-cmd="gd-richtung3"]').length === 6 && !D.querySelector('#dialog [data-gd="winkel"]'), 'sechs Richtungen ±X/±Y/±Z statt Winkel');
    const i = q('#dialog [data-gd="betrag"]'); i.value = 500; i.dispatchEvent(new W.Event('input', { bubbles: true }));
    click('#dialog [data-cmd="gd-richtung3"][data-v="x+"]'); await sleep(40);
    pick(pl([0, 0, 1], c => c[0] > 50)); await sleep(60);
    const l0 = C.doc.gd.studie.lastfaelle[0].lasten[0];
    expect(l0 && Math.abs(l0.fx - 500) < 1e-6 && Math.abs(l0.fz) < 1e-6, 'Last 500 N in +X angelegt');
    click('#dialog [data-cmd="gd-richtung3"][data-v="z-"]'); await sleep(40);
    expect(Math.abs(l0.fz + 500) < 1e-6 && Math.abs(l0.fx) < 1e-6 && /500 N −Z/.test(q('#dialog [data-cmd="gd-last-wahl"]').textContent), 'Richtung −Z: (0 | 0 | −500) N');
    click('[data-cmd="gd-w-aus"]'); await sleep(80);
    expect(/bestanden/.test(q('#dialog').textContent), 'Vorprüfung bestanden');
    click('#dialog [data-cmd="gd-erzeugen"]');
    await waitFor(() => q('#gdexplore'), 240000, 'Ergebnisse');
    const r = C.doc.gd.ergebnisse[0];
    expect(r && r.raum && r.feld && r.feld.d && r.material === 'steel', 'räumliches Ergebnis mit Dichtefeld');
    near(r.masse, 120, 10, `Masse ≈ Zielmasse 120 g (${r.masse.toFixed(1)} g)`);
    // Untergrenze der Spannung: Moment 500 N · 65 mm, freies Material ≈ 7800 mm³ auf 65 mm ≈ 120 mm², bestenfalls als zwei
    // Gurte am Rand des 39 mm hohen Bereichs: W ≈ 60 · 39 = 2340 mm³ → σ ≥ 14 MPa; SF = Streckgrenze 235 / σ
    expect(r.spannung > 14 && Math.abs(r.sicherheit - 235 / r.spannung) < 1e-6 && r.weg > 0, `SF ${r.sicherheit.toFixed(2)}, σ ${r.spannung.toFixed(1)} MPa, Weg ${r.weg.toFixed(4)} mm`);
    expect(C.vp.resultG, 'Ergebnis im Modell gezeigt');
    // dieselbe Studie mit Fertigung „Additiv“ (Druckrichtung +Z, Überhang 45°): Platte an der Unterseite des Bereichs,
    // jeder volle Würfel hat einen Stützwürfel im Kreuz darunter → 0 ungestützte Würfel; uneingeschränkt hängt Material
    // frei (> 0). Die Einschränkung kann nicht steifer machen: Verschiebung additiv ≥ uneingeschränkt
    click('[data-cmd="gd-einrichten"]'); await sleep(150);
    click('[data-cmd="gd-w-fertigung"]'); await sleep(80);
    click('#dialog [data-cmd="gd-fert"][data-v="additiv"]'); await sleep(80);
    expect(D.querySelectorAll('#dialog [data-cmd="gd-druckrichtung"]').length === 6 && q('#dialog [data-gd="ueberhang"]').value === '45' && /Additiv · \+Z, 45°/.test(q('#dialog .gdsub').textContent), 'Fertigung additiv: Druckrichtung +Z, Überhang 45°');
    // zweite Druckrichtung +X dazu (Wand auf der Druckplatte): je Richtung ein Ergebnis
    click('#dialog [data-cmd="gd-druckrichtung"][data-v="x+"]'); await sleep(80);
    expect(JSON.stringify(C.doc.gd.studie.druck.richtungen) === '["z+","x+"]' && /Additiv · \+Z \/ \+X, 45°/.test(q('#dialog .gdsub').textContent), 'zwei Druckrichtungen +Z und +X');
    click('[data-cmd="gd-w-aus"]'); await sleep(80);
    click('#dialog [data-cmd="gd-erzeugen"]');
    await waitFor(() => C.doc.gd.ergebnisse.length === 3 && q('#gdexplore'), 240000, 'additive Ergebnisse');
    const ra = C.doc.gd.ergebnisse[1], rx = C.doc.gd.ergebnisse[2];
    expect(ra.additiv && ra.ungestuetzt === 0 && rx.ungestuetzt === 0 && /\+Z/.test(ra.fertigung) && /\+X/.test(rx.fertigung), `additiv: keine ungestützten Würfel (+Z ${ra.ungestuetzt}, +X ${rx.ungestuetzt})`);
    // Handvergleich (Node, Balken mit gleicher Anordnung): Nachgiebigkeit uneingeschränkt 42, +X 43, +Z 164 – mit der Wand
    // auf der Platte wächst das Teil von der Wand weg, kaum Verlust; +Z muss den seitlich hängenden Klotz von unten stützen
    expect(rx.weg < ra.weg && rx.weg <= 1.5 * r.weg, `+X steifer als +Z und nahe uneingeschränkt (Weg ${rx.weg.toFixed(4)} / ${ra.weg.toFixed(4)} / ${r.weg.toFixed(4)} mm)`);
    expect(r.ungestuetzt > 0, `uneingeschränkt: ${r.ungestuetzt} ungestützte Würfel`);
    near(ra.masse, 120, 10, `additiv: Masse ≈ 120 g (${ra.masse.toFixed(1)} g)`);
    near(rx.masse, 120, 10, `additiv +X: Masse ≈ 120 g (${rx.masse.toFixed(1)} g)`);
    expect(ra.weg >= r.weg * 0.98, `additiv nicht steifer (Weg ${ra.weg.toFixed(4)} ≥ ${r.weg.toFixed(4)} mm)`);
    expect(q('#gdexplore .gdcard.on') && /Additiv/.test(q('#gdexplore .gdxdetail').textContent), 'additives Ergebnis gewählt, Fertigung in den Eigenschaften');
    click('#gdexplore [data-cmd="gd-erstellen"]');
    await waitFor(() => D.body.dataset.mode === 'model' && C.lastBuild.bodies.length === 3, 60000, 'Konstruktion');
    const f = C.doc.features[C.doc.features.length - 1], neu = C.lastBuild.bodies.find(b => !ids.includes(b));
    expect(f.type === 'gdform3' && C.lastBuild.status[f.id].ok && !C.vp.resultG, `Feature „Generatives Design (3D)“ gebaut (${C.lastBuild.status[f.id].info || C.lastBuild.status[f.id].error})`);
    const bb = await bbox(neu);
    expect(bb[0][0] < 4 && bb[1][0] > 76, `reicht von der Wand bis zum Klotz (x ${bb[0][0].toFixed(1)} … ${bb[1][0].toFixed(1)})`);
    const vn = await vol(neu);
    near(vn * 7.85 / 1000, rx.masse, 0.05 * rx.masse, `Körpermasse = Ergebnismasse (${(vn * 7.85 / 1000).toFixed(1)} g)`);
    /* Beibehalten-Geometrie exakt im Ergebnis: die Rückseite der Wandplatte (x = 0, Normale −X) und die
       Oberseite des Lastklotzes (z = 30 über x 70…80) sind echte ebene Flächen des Körpers, keine Netzdreiecke; beide
       Beibehalten-Körper sind ausgeblendet, weil sie im Ergebnis stecken */
    const mbi = C.lastBuild.mesh.bodies.findIndex(b => b.id === neu), fl = C.lastBuild.mesh.faces.filter(x => x.body === mbi && x.type === 'PLANE');
    const rueck = fl.find(x => x.n[0] < -0.999999 && Math.abs(x.center[0]) < 1e-6 && Math.abs(x.center[1]) < 1 && Math.abs(x.center[2] - 15) < 1);
    const oben = fl.find(x => x.n[2] > 0.999999 && Math.abs(x.center[2] - 30) < 1e-6 && x.center[0] > 70 && x.center[0] < 80);
    expect(rueck && oben, `exakte Flächen: Rückseite der Wand ${rueck ? 'ja' : 'nein'}, Oberseite des Klotzes ${oben ? 'ja' : 'nein'}`);
    expect(C.doc.bodies[wand].hidden && C.doc.bodies[klotz].hidden && f.beibehalten && f.beibehalten.length === 2, 'Beibehalten-Körper stecken im Ergebnis und sind ausgeblendet');
  }],
  ['Bewegungsstudie: Drehgelenk mit Kollision', async () => {
    // Beispiel „Bewegungsstudie Arm“: Arm 46 × 10 × 4 (x −6…40, y ±5) mit Bohrung ⌀ 7 um den Bolzen ⌀ 6, Drehgelenk um die
    // −Z-Achse (positiver Winkel dreht nach −y), Hindernis x 28…34, y −16…−10. Spur 0 % → 0°, 100 % → 90°, 46 Schritte (2°).
    // Von Hand: Kante y = +5 des Arms trifft die Ecke (34|−10) bei atan(10/34) − asin(5/35,44) = 16,39° − 8,11° = 8,28°,
    // die Kante y = −5 verlässt die Ecke (28|−16) bei atan(16/28) + asin(5/32,25) = 29,74° + 8,92° = 38,66°
    // → Kollision in den Schritten 10°…38°, also Schritt 6–20 (Index 5…19)
    await openExample('Bewegungsstudie Arm');
    await cmd('asm:motion', 'motion');
    expect(D.body.dataset.mode === 'motion' && /Bewegungsstudie/.test(q('#dialog').textContent), 'Dialog Bewegungsstudie');
    const cb = q('#dialog [data-mot-spur="j1"][data-feld="angle"]');
    cb.checked = true; cb.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    const sp = () => C.doc.bewegung.spuren.find(s => s.joint === 'j1');
    expect(sp() && JSON.stringify(sp().punkte) === '[{"t":0,"v":0},{"t":100,"v":90}]', 'Spur Winkel 0 % → 0°, 100 % → 90°');
    const setz = (sel, v) => { const i = q(sel); i.value = String(v); i.dispatchEvent(new W.Event('change', { bubbles: true })); };
    setz('#dialog [data-mot="schritte"]', 46); await sleep(150);
    expect(C.doc.bewegung.schritte === 46, '46 Schritte');
    click('#dialog [data-cmd="mot-kollision"]');
    await waitFor(() => /Kollision in|Keine Kollision/.test(q('#dialog .dbody').textContent), 120000, 'Kollisionsprüfung');
    const rot = [...D.querySelectorAll('#dialog .motmarken i')].map((m, i) => (m.classList.contains('rot') ? i : -1)).filter(i => i >= 0);
    expect(rot.length === 15 && rot[0] === 5 && rot[14] === 19, `Kollision bei 10°…38° = Schritt 6–20 (${rot.map(i => i * 2 + '°').join(' ')})`);
    expect(/Schritt 6–20/.test(q('#dialog .dbody').textContent) && /Arm ↔ Hindernis|Hindernis ↔ Arm/.test(q('#dialog .dbody').textContent), 'Liste: Schritt 6–20, Arm ↔ Hindernis');
    await waitFor(() => C.vp.markG && C.vp.markG.children.length, 15000, 'Überschneidung im Modell');
    expect(/Schritt 6 von 46/.test(q('#dialog').textContent), 'erster Kollisionsschritt gezeigt, Überschneidung im Modell rot');
    // Schritt 23 (44°): Arm um −44° um z gedreht → größtes x = 40·cos 44° + 5·sin 44° = 32,247, kleinstes y = −40·sin 44° − 5·cos 44° = −31,383
    const r = q('#dialog [data-mot="pos"]'); r.value = '22'; r.dispatchEvent(new W.Event('input', { bubbles: true }));
    await waitFor(() => /Schritt 23 von 46/.test(q('#dialog').textContent), 5000, 'Schritt 23'); await sleep(1500);
    const bb = await bbox('e2'), c = Math.cos(44 * Math.PI / 180), s = Math.sin(44 * Math.PI / 180);
    near(bb[1][0], 40 * c + 5 * s, 1e-3, 'Schritt 23: größtes x des Arms'); near(bb[0][1], -40 * s - 5 * c, 1e-3, 'Schritt 23: kleinstes y des Arms');
    expect(C.doc.features.find(f => f.id === 'j1').angle === 0, 'Dokument unverändert (Gelenkwinkel 0)');
    // Stützstelle dazu: in der Mitte, linear 45°
    click('#dialog [data-cmd="mot-punkt"][data-j="j1"]'); await sleep(150);
    expect(sp().punkte.length === 3 && sp().punkte[1].t === 50 && sp().punkte[1].v === 45, 'neue Stützstelle 50 % → 45°');
    // abspielen (kurz) und schließen: Modell wieder im Ausgangszustand
    setz('#dialog [data-mot="dauer"]', 0.5);
    click('#dialog [data-cmd="mot-spielen"]');
    await waitFor(() => /Schritt 46 von 46/.test(q('#dialog').textContent) && /Abspielen/.test(q('#dialog [data-cmd="mot-spielen"]').textContent), 120000, 'Abspielen bis zum Ende');
    click('#dialog [data-cmd="mot-close"]');
    await waitFor(() => D.body.dataset.mode === 'model', 3000, 'geschlossen'); await sleep(1500);
    const b0 = await bbox('e2');
    near(b0[1][0], 40, 1e-6, 'nach dem Schließen: Arm wieder in Ausgangslage');
  }],
  ['Zugänglichkeitsanalyse: T-Profil von oben', async () => {
    // Profil in XZ: Fuß 60 × 10, Säule 20 × 20 (x 0…20), Deckplatte 50 × 5 (z 30…35), 40 tief. Von oben zugänglich:
    // Deckplatte 50·40 = 2000 mm² und der freie Streifen des Fußes x 50…60: 10·40 = 400 mm² → 2400 mm²; der Fuß unter
    // der Platte ist verdeckt, Wände stehen senkrecht, Unterseiten zeigen weg. Raster h = 60/150 = 0,4 mm → Grenze ±0,4·40.
    await newDoc();
    const sk = await C.aiRun('skizze_anlegen', { ebene: 'XZ', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 60, y1: 10 }, { art: 'rechteck', x0: 0, y0: 10, x1: 20, y1: 30 }, { art: 'rechteck', x0: 0, y0: 30, x1: 50, y1: 35 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: sk.id, profiles: null, distance: 40, direction: 'normal', op: 'new' } });
    const id = C.lastBuild.bodies[0], bb = await bbox(id);
    expect(C.lastBuild.bodies.length === 1, 'ein Körper');
    const oben = bb[1][2] > 30 ? 'z+' : 'z-';
    const gesamt = (await C.kernel.props(id)).area;
    await cmd('solid:inspect', 'access');
    expect(/Zugänglichkeit/.test(q('#dialog').textContent) && C.vp.resultG, 'Dialog und farbige Überlagerung');
    const sel = q('#dialog [data-da="dir"]'); sel.value = oben; sel.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(300);
    const z = C.draftState.zugang;
    near(z.frei, 2400, 0.4 * 40 + 1, `zugänglich ${z.frei.toFixed(1)} mm² (Hand 2400)`);
    near(z.frei + z.nicht, gesamt, 1e-3 * gesamt, 'zusammen die ganze Oberfläche');
    click('#dialog [data-cmd="draftan-close"]'); await sleep(200);
    expect(!C.vp.resultG && D.body.dataset.mode === 'model', 'geschlossen, Überlagerung weg');
  }],
  ['Silhouette geteilt: Zylinder entlang der Umrisslinie', async () => {
    // Zylinder r 10, 40 lang entlang X; von oben (Z) liegen die Umrisslinien bei y = ±10, z = 0 entlang der Achse.
    // Der Mantel wird dort geteilt, das Volumen bleibt π·10²·40 = 12 566,37. Entlang der Achse (X) gibt es nichts zu teilen.
    await newDoc();
    const sk = await C.aiRun('skizze_anlegen', { ebene: 'YZ', formen: [{ art: 'kreis', cx: 0, cy: 0, d: 20 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: sk.id, profiles: null, distance: 40, direction: 'normal', op: 'new' } });
    const id = C.lastBuild.bodies[0], f0 = faces().length;
    await cmd('solid:modify', 'silsplit');
    expect(C.editing && C.editing.feature.type === 'silsplit' && C.editing.feature.richtung === 'Z', 'Dialog Silhouette geteilt, Blickrichtung Z');
    await ok();
    const f = C.doc.features[C.doc.features.length - 1], st = C.lastBuild.status[f.id];
    expect(st.ok && /Flächen dazu/.test(st.info || ''), `gebaut (${st.info || st.error})`);
    expect(faces().length > f0, `mehr Flächen (${f0} → ${faces().length})`);
    near(await vol(id), Math.PI * 100 * 40, 1e-3, 'Volumen unverändert');
    const L = edges().filter(e => e.info.type === 'LINE');
    const linie = y => L.some(e => Math.abs(e.info.mid[1] - y) < 1e-6 && Math.abs(e.info.mid[2]) < 1e-6 && Math.abs(e.info.mid[0] - 20) < 1e-6);
    expect(linie(10) && linie(-10), 'Umrisslinien bei y = ±10, z = 0');
    // entlang der Achse: keine Umrisslinie auf dem Mantel
    editTimeline(C.doc.features.length - 1); await sleep(300);
    await seg('richtung', 'X'); await ok();
    const st2 = C.lastBuild.status[f.id];
    expect(!st2.ok && /Keine Silhouette/.test(st2.error || ''), `entlang der Achse: Meldung (${st2.error})`);
    // Körper teilen von oben: Silhouette liegt in der Ebene z = 0 → zwei Halbzylinder je π·10²·40/2 = 6283,19
    editTimeline(C.doc.features.length - 1); await sleep(300);
    await seg('richtung', 'Z'); await seg('art', 'koerper'); await ok();
    const st3 = C.lastBuild.status[f.id];
    expect(st3.ok && /1 Körper an der Silhouette geteilt/.test(st3.info || ''), `Körper geteilt (${st3.info || st3.error})`);
    expect(C.lastBuild.bodies.length === 2, `zwei Körper (${C.lastBuild.bodies.length})`);
    for (const b of C.lastBuild.bodies) near(await vol(b), Math.PI * 100 * 40 / 2, 1e-3, `Halbzylinder ${b}`);
    const bz = await bbox(C.lastBuild.bodies[1]);
    near(Math.min(Math.abs(bz[0][2]), Math.abs(bz[1][2])), 0, 1e-6, 'Trennfläche bei z = 0');
  }],
  ['Silhouette geteilt: Körper teilen an gekrümmter Trennlinie', async () => {
    /* Zylinder r 10, 40 lang entlang X, schräg gesehen: d = (1, 0, 1)/√2 (Normale einer Fläche eines quadratischen
       Prismas daneben). Trennlinie = Umrisslinien y = ±10, z = 0 und je eine halbe Deckelkante (bei x = 0 oben, bei
       x = 40 unten) – nicht eben. Der Zylinder ist punktsymmetrisch zu (20, 0, 0), die Trennlinie auch: zwei Hälften mit
       zusammen π·10²·40 = 12 566,37 und je etwa der Hälfte. */
    await newDoc();
    const sk = await C.aiRun('skizze_anlegen', { ebene: 'YZ', formen: [{ art: 'kreis', cx: 0, cy: 0, d: 20 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: sk.id, profiles: null, distance: 40, direction: 'normal', op: 'new' } });
    const zyl = C.lastBuild.bodies[0];
    const sk2 = await C.aiRun('skizze_anlegen', { ebene: 'XZ', formen: [{ art: 'vieleck', cx: 100, cy: 0, r: 10, n: 4 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: sk2.id, profiles: null, distance: 10, direction: 'normal', op: 'new' } });
    expect(C.lastBuild.bodies.length === 2, 'Zylinder und Prisma');
    await cmd('solid:modify', 'silsplit');
    C.editing.feature.bodies = [zyl];
    await seg('art', 'koerper'); await seg('richtung', 'flaeche');
    const schraeg = faces().find(h => h.info.type === 'PLANE' && h.info.n && Math.abs(Math.abs(h.info.n[0]) - Math.SQRT1_2) < 1e-6 && Math.abs(Math.abs(h.info.n[2]) - Math.SQRT1_2) < 1e-6);
    expect(!!schraeg, 'schräge Fläche des Prismas');
    pick(schraeg); await sleep(200);
    await ok();
    const f = C.doc.features[C.doc.features.length - 1], st = C.lastBuild.status[f.id];
    expect(st.ok && /1 Körper an der Silhouette geteilt/.test(st.info || ''), `gekrümmt geteilt (${st.info || st.error})`);
    const teile = C.lastBuild.bodies.filter(b => b === zyl || b.startsWith(f.id));
    expect(teile.length === 2, `zwei Zylinderteile (${C.lastBuild.bodies.join(', ')})`);
    const v = []; for (const b of teile) v.push(await vol(b));
    near(v[0] + v[1], Math.PI * 100 * 40, 1e-3 * Math.PI * 100 * 40, `zusammen das ganze Volumen (${v.map(x => x.toFixed(1)).join(' + ')})`);
    for (const x of v) near(x, Math.PI * 100 * 20, 0.02 * Math.PI * 100 * 20, `Hälfte ${x.toFixed(1)} (Hand 6283,2)`);
    /* Hohlkörper: Kugel ⌀ 8 in der Mitte ausgeschnitten → (12 566,37 − 4/3·π·4³) / 2 = 6149,14 je Hälfte.
       Schalenkörper (Rohr ⌀ 20/14): π·(10² − 7²)·40 / 2 = 3204,42 je Hälfte. Davor eingefügt, nur im Kern gebaut. */
    const mit = async extra => {
      const fs = JSON.parse(JSON.stringify(C.doc.features)), sp = fs.pop(); fs.push(extra, sp);
      const r = await C.kernel.build(fs), w = [];
      for (const b of r.bodies.filter(b => b === zyl || b.startsWith(f.id))) w.push((await C.kernel.props(b)).volume);
      return { st: r.status[f.id], w };
    };
    const hohl = await mit({ id: 'kugel', type: 'primitive', name: 'Kugel', kind: 'sphere', d: 8, cx: 20, cy: 0, op: 'cut', plane: { kind: 'origin', key: 'XY' } });
    const sollH = (Math.PI * 100 * 40 - 4 / 3 * Math.PI * 64) / 2;
    expect(hohl.st.ok && hohl.w.length === 2, `Hohlkörper geteilt (${hohl.st.info || hohl.st.error})`);
    for (const x of hohl.w) near(x, sollH, 1e-3 * sollH, `Hohlkörper-Hälfte ${x.toFixed(2)} (Hand ${sollH.toFixed(2)})`);
    const rohr = await mit({ id: 'rohr', type: 'primitive', name: 'Bohrung', kind: 'cylinder', d: 14, h: 40, cx: 0, cy: 0, op: 'cut', plane: { kind: 'origin', key: 'YZ' } });
    const sollR = Math.PI * (100 - 49) * 40 / 2;
    expect(rohr.st.ok && rohr.w.length === 2, `Rohr geteilt (${rohr.st.info || rohr.st.error})`);
    for (const x of rohr.w) near(x, sollR, 1e-3 * sollR, `Rohrhälfte ${x.toFixed(2)} (Hand ${sollR.toFixed(2)})`);
  }],
  ['Auswahlpriorität: Kante, Fläche, Körper', async () => {
    // Quader 60 × 40 × 20, Iso-Ansicht: Punkt auf der Deckfläche 3 px neben einer Kante. Standard → Kante,
    // Flächenpriorität → Deckfläche, Körperpriorität → Klick wählt alle 6 Flächen des Körpers.
    await newDoc(); await box(60, 40, 20);
    const vp = C.vp, cv = q('#cv'), r = cv.getBoundingClientRect(), V = vp.camera.position.constructor;
    vp.view('iso'); await sleep(600);
    const schirm = p => { vp.camera.updateMatrixWorld(); const v = new V(...p).project(vp.camera); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; };
    const deck = C.lastBuild.mesh.faces.findIndex(f => f.type === 'PLANE' && f.n && f.n[2] > 0.99);
    const kante = C.lastBuild.mesh.edges.find(e => e.type === 'LINE' && Math.abs(e.mid[2] - 20) < 1e-6);
    const [kx, ky] = schirm(kante.mid), [mx, my] = schirm(C.lastBuild.mesh.faces[deck].center), l = Math.hypot(mx - kx, my - ky);
    const at = { clientX: kx + (mx - kx) / l * 3, clientY: ky + (my - ky) / l * 3 };
    const prio = async v => { click('[data-menu="nav:filter"]'); await sleep(120); click(`#fmenu [data-cmd="selprio"][data-v="${v}"]`); await sleep(120); };
    expect((vp.pickAt(at) || {}).kind === 'edge', 'Standard: Kante nahe am Zeiger');
    await prio('flaeche');
    const h = vp.pickAt(at);
    expect(h && h.kind === 'face' && h.index === deck, 'Flächenpriorität: Deckfläche');
    await prio('koerper');
    C.vp.cb.onPick(vp.pickAt(at), {}); await sleep(100);
    expect(vp.selection.faces.length === 6, `Körperpriorität: ganzer Körper (${vp.selection.faces.length} Flächen)`);
    await prio('kante');
    expect((vp.pickAt(at) || {}).kind === 'edge', 'zurück auf Standard');
  }],
  ['Farbauswahl: über das Modell malen', async () => {
    // Quader 60 × 40 × 20 in Iso-Ansicht: drei sichtbare Flächen, mit gedrückter Taste über ihre Mitten malen → alle drei
    // gewählt (nichts abgewählt). Ohne Bewegung bleibt es ein normaler Klick. Danach wieder Fensterauswahl.
    await newDoc(); await box(60, 40, 20);
    const vp = C.vp, cv = q('#cv');
    vp.view('iso'); await sleep(600);
    click('[data-menu="nav:filter"]'); await sleep(120); click('#fmenu [data-cmd="seltool"][data-v="paint"]'); await sleep(120);
    expect(vp.selTool === 'paint', 'Auswahlwerkzeug Farbauswahl');
    const r = cv.getBoundingClientRect(), V = vp.camera.position.constructor;
    const schirm = p => { vp.camera.updateMatrixWorld(); const v = new V(...p).project(vp.camera); return { clientX: r.left + (v.x + 1) / 2 * r.width, clientY: r.top + (1 - v.y) / 2 * r.height }; };
    const sichtbar = C.lastBuild.mesh.faces.map((f, i) => ({ i, s: schirm(f.center) })).filter(x => { const h = vp.pickAt(x.s); return h && h.kind === 'face' && h.index === x.i; });
    expect(sichtbar.length === 3, `drei Flächen sichtbar (${sichtbar.length})`);
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
    try {
      const pe = (t, s2, tasten) => cv.dispatchEvent(new W.PointerEvent(t, { bubbles: true, cancelable: true, button: 0, buttons: tasten, clientX: s2.clientX, clientY: s2.clientY, pointerId: 3 }));
      pe('pointerdown', sichtbar[0].s, 1);
      for (let k = 1; k < sichtbar.length; k++) for (let t = 1; t <= 12; t++) {
        const a = sichtbar[k - 1].s, b = sichtbar[k].s;
        pe('pointermove', { clientX: a.clientX + (b.clientX - a.clientX) * t / 12, clientY: a.clientY + (b.clientY - a.clientY) * t / 12 }, 1);
      }
      pe('pointerup', sichtbar[sichtbar.length - 1].s, 0);
    } finally { delete cv.setPointerCapture; delete cv.releasePointerCapture; }
    await sleep(150);
    const gew = vp.selection.faces;
    expect(sichtbar.every(x => gew.includes(x.i)), `alle drei überstrichenen Flächen gewählt (${gew.join(', ')})`);
    expect([...D.querySelectorAll('.toast')].some(t => /Farbauswahl/.test(t.textContent)), 'Hinweis Farbauswahl');
    click('[data-menu="nav:filter"]'); await sleep(120); click('#fmenu [data-cmd="seltool"][data-v="window"]'); await sleep(120);
    expect(vp.selTool === 'window', 'zurück auf Fensterauswahl');
  }],
  ['Antriebsgelenke: Gelenk auf einen Wert fahren', async () => {
    // Arm am Drehgelenk j1 auf 44°: größtes x 40·cos 44° + 5·sin 44° = 32,247, kleinstes y −40·sin 44° − 5·cos 44° = −31,383.
    await openExample('Bewegungsstudie Arm');
    await cmd('asm:motion', 'antrieb');
    expect(D.body.dataset.mode === 'antrieb' && /Antriebsgelenke/.test(q('#dialog').textContent), 'Dialog Antriebsgelenke');
    const setz = async v => { const i = q('#dialog [data-antrieb="j1"][data-feld="angle"]'); i.value = String(v); i.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(2000); };
    await setz(44);
    const c = Math.cos(44 * Math.PI / 180), sn = Math.sin(44 * Math.PI / 180), bb = await bbox('e2');
    near(bb[1][0], 40 * c + 5 * sn, 1e-3, 'Arm bei 44°: größtes x'); near(bb[0][1], -40 * sn - 5 * c, 1e-3, 'kleinstes y');
    click('#dialog [data-cmd="antrieb-abbrechen"]'); await sleep(1500);
    expect(C.doc.features.find(f => f.id === 'j1').angle === 0 && D.body.dataset.mode === 'model', 'Abbrechen: wieder 0°');
    await cmd('asm:motion', 'antrieb'); await setz(30);
    click('#dialog [data-cmd="antrieb-ok"]'); await sleep(800);
    expect(C.doc.features.find(f => f.id === 'j1').angle === 30, 'OK: Gelenk bleibt auf 30°');
  }],
  ['Kontaktsätze: Gelenk hält an der Berührung', async () => {
    // Beispiel „Bewegungsstudie Arm“ (siehe oben): Arm (Komponente k1) am Drehgelenk j1, Hindernis e3, Bolzen e1 mit Spiel.
    // Von Hand berührt die Armkante y = +5 die Hindernisecke (34|−10) bei atan(10/34) − asin(5/35,44) = 8,279°.
    const soll = (Math.atan(10 / 34) - Math.asin(5 / Math.hypot(34, 10))) * 180 / Math.PI;
    await openExample('Bewegungsstudie Arm');
    await cmd('asm:rel', 'kontakt-neu');
    expect(D.body.dataset.mode === 'kontakt' && /Kontaktsatz/.test(q('#dialog').innerHTML), 'Dialog Kontaktsatz');
    const flaecheVon = id => { const b = C.lastBuild.mesh.bodies.find(x => x.id === id); return faces().find(h => b.faces[0] <= h.index && h.index < b.faces[1]); };
    pick(flaecheVon('e2')); await sleep(80); pick(flaecheVon('e3')); await sleep(80);
    click('#dialog [data-cmd="kontakt-ok"]'); await sleep(200);
    const k = C.doc.kontakt;
    expect(k && k.modus === 'saetze' && k.saetze.length === 1 && k.saetze[0].glieder.join() === 'k1,e3', `Kontaktsatz Arm (Komponente) + Hindernis (${k && JSON.stringify(k.saetze)})`);
    expect(/Kontaktsätze/.test(q('#browser').textContent), 'Ordner „Kontaktsätze“ im Browser');
    const iJ = C.doc.features.findIndex(f => f.id === 'j1'), winkel = () => Number(C.editing.feature.angle);
    const drehe = async (v, warte = true) => { num('angle', v); if (warte) await waitFor(() => Math.abs(winkel() - v) > 1e-6, 60000, 'Kontaktstopp'); else await sleep(2500); await sleep(1200); };
    editTimeline(iJ); await sleep(400);
    await drehe(90);
    near(winkel(), soll, 0.01, `Gelenk hält am Kontakt an (${winkel()}° statt 90°, Hand ${soll.toFixed(3)}°)`);
    expect([...D.querySelectorAll('.toast')].some(t => /Kontakt/.test(t.textContent)), 'Hinweis Kontakt');
    const kol = await C.kernel.interfere(C.doc.features.map(f => (f.id === 'j1' ? { ...f, angle: winkel() } : f)), { components: C.doc.components.map(c => ({ id: c.id, bodies: c.bodies })) });
    expect(!(kol.hits || []).length, 'an der Haltestelle keine Durchdringung');
    await drehe(-30, false);
    expect(Math.abs(winkel() + 30) < 1e-6, 'vom Hindernis weg: kein Halt (−30°)');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    // Kontakt aller Komponenten: gleiche Stelle (Bolzen ⌀ 6 in Bohrung ⌀ 7 hat Spiel)
    const menue = async name => { click('[data-menu="asm:rel"]'); await sleep(150); click(`#fmenu [data-cmd="${name}"]`); await sleep(200); };
    await menue('kontakt-alle');
    expect(C.doc.kontakt.modus === 'alle', 'Kontakt aller Komponenten');
    editTimeline(iJ); await sleep(400);
    await drehe(90);
    near(winkel(), soll, 0.01, `alle Komponenten: Halt bei ${winkel()}°`);
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    await menue('kontakt-aus');
    editTimeline(iJ); await sleep(400);
    await drehe(90, false);
    expect(Math.abs(winkel() - 90) < 1e-6, 'Kontaktanalyse aus: 90° bleiben');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    // Bewegungsstudie mit Kontaktsätzen: Spur 0 → 90°, ab Schritt 6 (10°) steht der Arm am Kontakt
    await menue('kontakt-saetze');
    await cmd('asm:motion', 'motion');
    const cb = q('#dialog [data-mot-spur="j1"][data-feld="angle"]');
    cb.checked = true; cb.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    const setz = (sel, v) => { const i = q(sel); i.value = String(v); i.dispatchEvent(new W.Event('change', { bubbles: true })); };
    setz('#dialog [data-mot="schritte"]', 46); await sleep(150);
    const r = q('#dialog [data-mot="pos"]'); r.value = '22'; r.dispatchEvent(new W.Event('input', { bubbles: true }));
    await waitFor(() => /Schritt 23 von 46/.test(q('#dialog').textContent) && /Kontakt: Gelenk angehalten ab Schritt 6/.test(q('#dialog').textContent), 120000, 'Studie mit Kontakt'); await sleep(1500);
    const bb = await bbox('e2'), c = Math.cos(soll * Math.PI / 180), sn = Math.sin(soll * Math.PI / 180);
    near(bb[1][0], 40 * c + 5 * sn, 0.01, `Schritt 23 (44°): Arm steht am Kontakt (größtes x ${bb[1][0].toFixed(3)})`);
    click('#dialog [data-cmd="mot-close"]'); await sleep(500);
  }],
  ['Kunststoffregel: verknüpfte Wanddicke', async () => {
    // Regel ABS, Wand 2,5 → neue Schale übernimmt kst_wand: Quader 60 × 40 × 30 oben offen: 72 000 − 55·35·27,5 = 19 062,5.
    // Regel auf Wand 3 → Schale zieht nach: 72 000 − 54·34·27 = 22 428. Neue Lippe: 1,5 × 3, Spiel 0,1.
    await newDoc();
    const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 60, y1: 40 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 30, direction: 'normal', op: 'new' } });
    const [k] = C.lastBuild.bodies;
    const regel = async (wand, material) => {
      await cmd('solid:create', 'kstregel');
      expect(/Kunststoffregel/.test(q('#dialog').textContent), 'Dialog Kunststoffregel');
      if (material) { const m = q('#dialog [data-kst="material"]'); m.value = material; m.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(80); }
      const i = q('#dialog [data-kst="wand"]'); i.value = String(wand); i.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(50);
      const prev = C.lastBuild; click('#dialog [data-cmd="kst-ok"]'); await sleep(300); await built(prev, 20000).catch(() => {});
    };
    await regel(2.5, 'abs');
    const wert = n => C.paramValues(C.doc.params).vals[n];
    expect(wert('kst_wand') === 2.5 && wert('kst_schraege') === 1 && C.doc.kunststoff.material === 'abs', 'Parameter kst_wand 2,5, Schräge 1 (ABS)');
    expect(C.doc.bodies[k] && C.doc.bodies[k].material === 'abs', 'Werkstoff ABS zugewiesen');
    await cmd('solid:modify', 'shell');
    expect(C.editing.feature.thickness === 2.5 && C.editing.feature.exprs && C.editing.feature.exprs.thickness.e === 'kst_wand', 'Schale übernimmt kst_wand');
    pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.99)); await sleep(100);
    await ok();
    near(await vol(k), 72000 - 55 * 35 * 27.5, 1e-3, 'Schale 2,5 mm');
    await regel(3);
    await sleep(500);
    near(await vol(k), 72000 - 54 * 34 * 27, 1e-3, 'Regel 3 mm: Schale zieht nach');
    await cmd('solid:create', 'lippe');
    const L = C.editing.feature;
    expect(L.w === 1.5 && L.h === 3 && L.spiel === 0.1, `Lippe aus der Regel (${L.w} × ${L.h}, Spiel ${L.spiel})`);
    click('#dialog [data-cmd="cancel"]'); await sleep(200);
  }],
  ['Kunststoff: Lippe und Absatz', async () => {
    // Quader 60 × 40 × 30 oben offen, Wand 2: 72 000 − 56·36·28 = 15 552. Randfläche: außen 60 × 40, innen 56 × 36.
    // Lippe innen 1 × 2: (58·38 − 56·36)·2 = 188·2 = 376 → 15 928.
    // Absatz außen 1 + 0,1 Spiel, Tiefe 2 + 0,1: (60·40 − 57,8·37,8)·2,1 = 215,16·2,1 = 451,836 → 15 100,164.
    await newDoc();
    const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 60, y1: 40 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 30, direction: 'normal', op: 'new' } });
    const [k] = C.lastBuild.bodies;
    await C.aiRun('feature_anlegen', { feature: { type: 'shell', thickness: 2, faces: [{ t: 'PLANE', n: [0, 0, 1], dist: 30, p: [30, 20, 30] }] } });
    near(await vol(k), 15552, 1e-3, 'Schale 2 mm');
    await cmd('solid:create', 'lippe');
    const rand = faces().find(h => h.info.type === 'PLANE' && h.info.n && h.info.n[2] > 0.99 && Math.abs(h.info.center[2] - 30) < 1e-6);
    expect(!!rand, 'Randfläche oben gefunden');
    pick(rand); await sleep(200);
    expect(C.editing.feature.faces.length === 1, 'Randfläche gewählt');
    await ok();
    const lf = C.doc.features[C.doc.features.length - 1], st = () => C.lastBuild.status[lf.id];
    expect(st().ok && /1 Lippe/.test(st().info || ''), `Lippe gebaut (${st().info || st().error})`);
    near(await vol(k), 15552 + 376, 1e-3, 'Lippe innen 1 × 2');
    editTimeline(C.doc.features.length - 1); await sleep(300);
    await seg('art', 'absatz'); await seg('seite', 'aussen'); await ok();
    expect(st().ok && /1 Absatz/.test(st().info || ''), `Absatz gebaut (${st().info || st().error})`);
    near(await vol(k), 15552 - 451.836, 1e-3, 'Absatz außen mit 0,1 Spiel');
  }],
  ['Schale: Wand dicker als Rundungsradius', async () => {
    // Quader 60 × 40 × 30, senkrechte Kanten R 2, oben offen. Bis t < R rechnet OpenCASCADE selbst (Innenradius R − t);
    // ab t ≥ R wird die Innenecke scharf – genau die Innenkontur des scharfen Quaders.
    // Volumen außen (2400 − (4 − π)·4)·30 = 71 896,99; t 3: Hohlraum 54·34·27 = 49 572 → 22 324,99; t 8: 44·24·22 → 48 664,99.
    // Alle Kanten R 2 (Kugelecken): außen 71 564,342 (gemessen), t 3 → 71 564,342 − 49 572 = 21 992,342
    await newDoc();
    const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 60, y1: 40 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 30, direction: 'normal', op: 'new' } });
    const [k] = C.lastBuild.bodies;
    const kanten = [[0, 0], [60, 0], [60, 40], [0, 40]].map(([x, y]) => ({ t: 'LINE', p: [x, y, 15], d: [0, 0, 1] }));
    await C.aiRun('feature_anlegen', { feature: { type: 'fillet', all: false, radius: 2, edges: kanten } });
    const v0 = await vol(k);
    near(v0, (2400 - (4 - Math.PI) * 4) * 30, 1e-3, 'Quader mit R 2 an den senkrechten Kanten');
    await C.aiRun('feature_anlegen', { feature: { type: 'shell', thickness: 3, faces: [{ t: 'PLANE', n: [0, 0, 1], dist: 30, p: [30, 20, 30] }] } });
    const iSh = () => C.doc.features.findIndex(x => x.type === 'shell'), st = () => C.lastBuild.status[C.doc.features[iSh()].id];
    expect(st().ok && /innen scharf/.test(st().info || ''), `Schale 3 mm gebaut (${st().info || st().error})`);
    near(await vol(k), v0 - 54 * 34 * 27, 1e-3, 'Wand 3 mm: Hohlraum wie scharfer Quader');
    const dicke = async t => { editTimeline(iSh()); await sleep(300); num('thickness', t); await ok(); };
    await dicke(8);
    near(await vol(k), v0 - 44 * 24 * 22, 1e-3, 'Wand 8 mm');
    // dünner als der Radius: OpenCASCADE wie bisher (Innenradius 1): 71 896,99 − (58·38 − (4 − π))·29
    await dicke(1);
    near(await vol(k), v0 - (58 * 38 - (4 - Math.PI)) * 29, 1e-3, 'Wand 1 mm: Innenrundung R 1');
    expect(st().ok && !/innen scharf/.test(st().info || ''), 'Wand 1 mm über den normalen Weg');
    // alle Kanten gerundet (Kugelecken an den Ecken)
    editTimeline(C.doc.features.findIndex(x => x.type === 'fillet')); await sleep(300);
    C.editing.feature.all = true; await ok();
    await dicke(3);
    near(await vol(k), 71564.342 - 54 * 34 * 27, 2e-3, 'alle Kanten R 2, Wand 3 mm (Kugelecken aufgefüllt)');
    expect(/20 Rundungen innen scharf/.test(st().info || ''), `12 Kanten + 8 Ecken (${st().info})`);
  }],
  ['Kunststoff: Zapfen und Schnappverschluss', async () => {
    // Platte 60 × 40 × 5 (12 000 mm³), Skizze XY mit Punkten (15|20) und (45|20); die Teile wachsen aus der Unterseite (−Z).
    // Zapfen ⌀ 8 × 10, Kernloch ⌀ 2,5 × 8, ohne Schräge: π·16·10 − π·1,5625·8 = 463,385 mm³;
    // mit 1° Formschräge: R1 = 4 − 10·tan 1° = 3,82545, Kegelstumpf π·10/3·(R0² + R0·R1 + R1²) − Loch = 441,773;
    // 4 Rippen 1,2 × 4 × 6: außerhalb des Zapfens je Dreieck 4 · 6·(4/4,2)/2 · 1,2 = 13,714 (die Wölbung macht < 0,1 aus).
    // Schnappverschluss t 1,5, L 12, w 6, Hinterschnitt 1, 30°: Haken 1/tan 30° = 1,732 lang, Fläche 18 + 0,866 → 113,196 mm³
    await newDoc();
    const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0: 0, y0: 0, x1: 60, y1: 40 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 5, direction: 'normal', op: 'new' } });
    const [pl] = C.lastBuild.bodies;
    await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'punkt', x: 15, y: 20 }] });
    await cmd('solid:create', 'boss');
    expect(/Zapfen/.test(q('#dialog').textContent) && C.editing.feature.hole === 'core', 'Dialog Zapfen (Kernloch)');
    num('draft', 0); await ok();
    near(await vol(pl), 12000 + Math.PI * 16 * 10 - Math.PI * 1.5625 * 8, 1e-3, 'Zapfen mit Kernloch');
    expect((await bbox(pl))[0][2] < -9.999, 'Zapfen wächst aus der Unterseite (z −10)');
    // Formschräge 1°
    editTimeline(C.doc.features.length - 1); await sleep(300); num('draft', 1); await ok();
    const R1 = 4 - 10 * Math.tan(Math.PI / 180), Vs = Math.PI * 10 / 3 * (16 + 4 * R1 + R1 * R1) - Math.PI * 1.5625 * 8;
    near(await vol(pl), 12000 + Vs, 1e-2, `Formschräge 1° (Kegelstumpf, R1 = ${R1.toFixed(4)})`);
    // 4 Rippen, ohne Schräge
    editTimeline(C.doc.features.length - 1); await sleep(300); num('draft', 0); num('ribs', 4); num('rt', 1.2); num('rl', 4); num('rh', 6); await ok();
    near(await vol(pl), 12000 + Math.PI * 16 * 10 - Math.PI * 1.5625 * 8 + 4 * (4 * 6 * (4 / 4.2) / 2 * 1.2), 0.5, '4 Rippen');
    // Schnappverschluss an (45|20)
    await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'punkt', x: 45, y: 20 }] });
    const v0 = await vol(pl);
    await cmd('solid:create', 'snapfit');
    expect(/Schnappverschluss/.test(q('#dialog').textContent), 'Dialog Schnappverschluss');
    await ok();
    near(await vol(pl) - v0, (1.5 * 12 + 1 * (1 / Math.tan(Math.PI / 6)) / 2) * 6, 1e-3, 'Schnappverschluss: (t·L + d·Lh/2)·w');
    const bb = await bbox(pl);
    near(bb[0][2], -12, 1e-6, 'Balken 12 lang (z −12)');
    expect(Math.abs(bb[1][0] - 60) < 1e-6, 'Haken bleibt innerhalb der Platte in x (45 + 0,75 + 1 = 46,75)');
  }],
  ['Generatives Design: Fräsen und Gießen', async () => {
    // Kragarm wie „uneingeschränkt (3D)“ (Wand fest, Klotz mit 500 N nach −Z, 120 g Stahl), Raster 4 mm (schnell).
    // Fräsen (Werkzeug +Z und +Y): jede Spalte in Werkzeugrichtung von unten voll → 0 Hinterschnitte; Gießen (Achse Y):
    // keine Hohlräume entlang Y → 0. Alle einteilig, Masse 120 g; eine Einschränkung kann das Teil nicht steifer machen
    await newDoc();
    for (const r of [{ x0: 0, y0: -15, x1: 5, y1: 15 }, { x0: 70, y0: -5, x1: 80, y1: 5 }]) {
      const s1 = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', ...r }] });
      await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s1.id, profiles: null, distance: 30, direction: 'normal', op: 'new' } });
    }
    const [wand, klotz] = C.lastBuild.bodies;
    C.doc.gd = { studie: { name: 'Studie 1', achse: 'Z', beibehalten: [wand, klotz], hindernis: [], startform: null, abhaengigkeiten: [], lastfaelle: [{ id: 'f1', name: 'Lastfall 1', lasten: [] }], fall: 0, ziel: { art: 'steifigkeit', masse: 120, sicherheit: 2 }, materialien: ['steel'], raster: 4, wiederholungen: 30, fertigung: 'frei' }, ergebnisse: [] };
    click('[data-menu="ws"]'); await sleep(150); click('#fmenu [data-cmd="gd-open"]'); await sleep(300);
    const pl = (n, c) => faces().find(h => h.info.type === 'PLANE' && h.info.n.every((v, k) => Math.abs(v - n[k]) < 1e-6) && c(h.info.center));
    click('[data-cmd="gd-w-abh"]'); await sleep(60); pick(pl([-1, 0, 0], c => Math.abs(c[0]) < 1e-6)); await sleep(60);
    click('[data-cmd="gd-w-last"]'); await sleep(60);
    const i = q('#dialog [data-gd="betrag"]'); i.value = 500; i.dispatchEvent(new W.Event('input', { bubbles: true }));
    click('#dialog [data-cmd="gd-richtung3"][data-v="z-"]'); await sleep(40);
    pick(pl([0, 0, 1], c => c[0] > 50)); await sleep(60);
    click('[data-cmd="gd-w-aus"]'); await sleep(80);
    const lauf = async n => { click('#dialog [data-cmd="gd-erzeugen"]'); await waitFor(() => C.doc.gd.ergebnisse.length === n && q('#gdexplore'), 240000, `${n} Ergebnisse`); click('[data-cmd="gd-einrichten"]'); await sleep(150); };
    await lauf(1);
    click('[data-cmd="gd-w-fertigung"]'); await sleep(80);
    click('#dialog [data-cmd="gd-fert"][data-v="fraesen"]'); await sleep(80);
    expect(D.querySelectorAll('#dialog [data-cmd="gd-fraesrichtung"]').length === 6 && /Fräsen · Werkzeug \+Z/.test(q('#dialog .gdsub').textContent), 'Fräsen: Werkzeug von +Z (Vorgabe)');
    click('#dialog [data-cmd="gd-fraesrichtung"][data-v="y+"]'); await sleep(80);
    await lauf(3);
    click('[data-cmd="gd-w-fertigung"]'); await sleep(80);
    click('#dialog [data-cmd="gd-fert"][data-v="giessen"]'); await sleep(80);
    click('#dialog [data-cmd="gd-gussachse"][data-v="Y"]'); await sleep(80);
    click('#dialog [data-cmd="gd-gussachse"][data-v="Z"]'); await sleep(80);
    expect(/Gießen · Entformung Y$/.test(q('#dialog .gdsub').textContent.trim()), `Gießen: Entformung entlang Y (${q('#dialog .gdsub').textContent})`);
    await lauf(4);
    const [fr, mz, my, gy] = C.doc.gd.ergebnisse;
    expect(/Fräsen · Werkzeug \+Z/.test(mz.fertigung) && /Fräsen · Werkzeug \+Y/.test(my.fertigung) && /Gießen · Entformung Y/.test(gy.fertigung), 'je Richtung ein Ergebnis');
    [mz, my, gy].forEach(r => {
      expect(r.ungestuetzt === 0, `${r.fertigung}: ${r.pruefArt === 'giessen' ? 'Hohlräume' : 'Hinterschnitte'} 0 (${r.ungestuetzt})`);
      expect(r.stuecke === 1, `${r.fertigung}: ein Stück (${r.stuecke})`);
      near(r.masse, 120, 12, `${r.fertigung}: Masse ≈ 120 g (${r.masse.toFixed(1)})`);
      expect(r.weg >= fr.weg * 0.98, `${r.fertigung}: nicht steifer als uneingeschränkt (Weg ${r.weg.toFixed(4)} ≥ ${fr.weg.toFixed(4)})`);
    });
    expect(fr.stuecke === 1 && fr.ungestuetzt > 0, `uneingeschränkt: ein Stück, ${fr.ungestuetzt} ungestützte Würfel gegen +Z`);
    click('[data-cmd="gd-close"]'); await sleep(200);
  }],
  ['Fläche verschieben: schräge Nachbarn laufen in ihrer Ebene weiter', async () => {
    // Quader 40 × 30 × 20, beide oberen Längskanten 10 mm gefast: Oberseite 20 breit, Flanken 45°.
    // 24 000 − 2 · 50 · 30 = 21 000. Oberseite +5: Flanken laufen weiter, oben nur noch 10 breit → +(20 + 10)/2 · 5 · 30
    // = +2 250 → 23 250 (senkrecht weiter wären es 24 000). Dann −10 (auf z 15, dort 30 breit): −(10 + 30)/2 · 10 · 30
    // = −6 000 → 17 250. Zu weit nach oben (+20: von z 15 aus treffen sich die Flanken schon bei +15) → Meldung.
    await newDoc(); await box(40, 30, 20);
    const [K] = C.lastBuild.bodies;
    await cmd('solid:modify', 'chamfer');
    edges().filter(h => h.info.type === 'LINE' && Math.abs(Math.abs(h.info.dir[1]) - 1) < 1e-6 && Math.abs(h.info.mid[2] - 20) < 1e-6).forEach(pick);
    num('distance', 10); await ok();
    near(await vol(K), 21000, 1e-3, 'gefaster Quader 21 000');
    const oben = () => faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.999);
    const verschiebe = async dz => {
      await cmd('solid:modify', 'moveface');
      pick(oben()); await sleep(100);
      click('#dialog [data-cmd="mf-faces"]'); await sleep(100);
      num('dx', 0); num('dy', 0); num('dz', dz); await sleep(50);
      await ok();
    };
    await verschiebe(5);
    near(await vol(K), 23250, 1e-3, 'Oberseite +5: Fasen laufen weiter');
    near(oben().info.center[2], 25, 1e-6, 'Oberseite auf z 25');
    await verschiebe(-10);
    near(await vol(K), 17250, 1e-3, 'Oberseite −10: wieder in den Fasen, keine Ränder');
    await verschiebe(20);
    const f = C.doc.features[C.doc.features.length - 1], st = C.lastBuild.status[f.id];
    expect(st && !st.ok && /laufen vorher zusammen/.test(st.error || ''), `zu weit: ${st && (st.error || st.info)}`);
  }],
  ['Fläche verschieben: verschieben, drehen, bis Fläche, Bohrung', async () => {
    // A 40 × 20 × 10: Oberseite +5 → 12 000 mm³; dann um die linke obere Kante (x 0, z 15) um 10° gedreht: Höhe 15 + s·x·tan 10°
    // → 20·(600 + s·800·tan 10°) = 12 000 + s·2821,3 (s aus dem Drehsinn: Achse +y → Normale kippt nach +x → s = −1).
    // B x 50…70, 20 × 20 × 10: Oberseite „Bis Fläche“ auf die schräge Oberseite von A (dieselbe Ebene):
    // 20·(15·20 + s·tan 10°·(70² − 50²)/2) = 6000 + s·4231,8. C 60 × 40 × 10 mit Bohrung ⌀ 10 bei (20|60): Bohrung +15 in X →
    // Volumen bleibt 24 000 − 250π = 23 214,6, Bohrung bei x 35
    await newDoc();
    const quader = async (x0, y0, x1, y1, h, extra = [], profiles = null) => { const s = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'rechteck', x0, y0, x1, y1 }, ...extra] }); await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s.id, profiles, distance: h, direction: 'normal', op: 'new' } }); };
    await quader(0, 0, 40, 20, 10);
    await quader(50, 0, 70, 20, 10);
    await quader(0, 40, 60, 80, 10, [{ art: 'kreis', cx: 20, cy: 60, d: 10 }], [[5, 45]]);
    const [A, B, Cp] = C.lastBuild.bodies;
    const plane = (n, c) => faces().find(h => h.info.type === 'PLANE' && h.info.n.every((v, k) => Math.abs(v - n[k]) < 1e-6) && c(h.info.center));
    // 1. Oberseite von A um 5 nach oben
    await cmd('solid:modify', 'moveface');
    expect(C.editing && C.editing.pickTarget === 'mf-faces', 'Dialog wartet auf Flächen');
    pick(plane([0, 0, 1], c => Math.abs(c[2] - 10) < 1e-6 && c[0] < 45 && c[1] < 25)); await sleep(100);
    click('#dialog [data-cmd="mf-faces"]'); await sleep(100);
    await ok();
    near(await vol(A), 12000, 1e-3, 'A: Oberseite +5 → 12 000 mm³');
    // 2. Oberseite von A um die linke obere Kante drehen (10°)
    await cmd('solid:modify', 'moveface');
    pick(plane([0, 0, 1], c => Math.abs(c[2] - 15) < 1e-6)); await sleep(100);
    click('#dialog [data-cmd="mf-faces"]'); await sleep(100);
    await seg('mode', 'rotate');
    click('#dialog [data-cmd="mf-axis"]'); await sleep(100);
    const kante = edges().find(h => h.info.type === 'LINE' && Math.abs(Math.abs(h.info.dir[1]) - 1) < 1e-6 && Math.abs(h.info.mid[0]) < 1e-6 && Math.abs(h.info.mid[2] - 15) < 1e-6);
    pick(kante); await sleep(100);
    const s = C.editing.feature.axisRef.d[1] > 0 ? -1 : 1, tg = Math.tan(10 * Math.PI / 180);
    await ok();
    near(await vol(A), 12000 + s * 800 * tg * 20, 1e-2, `A: um 10° gedreht (${s < 0 ? 'fällt' : 'steigt'} nach +x)`);
    // 3. Oberseite von B bis auf die schräge Oberseite von A
    await cmd('solid:modify', 'moveface');
    pick(plane([0, 0, 1], c => Math.abs(c[2] - 10) < 1e-6 && c[0] > 45 && c[1] < 25)); await sleep(100);
    click('#dialog [data-cmd="mf-faces"]'); await sleep(100);
    await seg('mode', 'to');
    click('#dialog [data-cmd="mf-target"]'); await sleep(100);
    const rng = C.lastBuild.mesh.bodies.find(b => b.id === A).faces;
    pick(faces().find(h => rng[0] <= h.index && h.index < rng[1] && h.info.type === 'PLANE' && h.info.n[2] > 0.9 && h.info.n[2] < 0.999)); await sleep(100);
    await ok();
    near(await vol(B), 6000 + s * tg * 1200 * 20, 1e-2, 'B: bis zur schrägen Fläche (Fläche ersetzen)');
    // 4. Bohrung in C um 15 nach +x
    await cmd('solid:modify', 'moveface');
    pick(faces().find(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 5) < 1e-6)); await sleep(100);
    click('#dialog [data-cmd="mf-faces"]'); await sleep(100);
    num('dx', 15); num('dz', 0); await sleep(50);
    await ok();
    near(await vol(Cp), 24000 - 250 * Math.PI, 1e-3, 'C: Volumen bleibt (Bohrung nur verschoben)');
    const loch = faces().filter(h => h.info.type === 'CYLINDRE' && Math.abs(h.info.radius - 5) < 1e-6).map(h => h.info.center[0]);
    expect(loch.length && loch.every(x => Math.abs(x - 35) < 1e-3), `Bohrung jetzt bei x 35 (${loch.map(x => x.toFixed(3)).join(', ')})`);
  }],
  ['Bewegungsverknüpfung: Arm treibt Schlitten', async () => {
    // Beispiel „Bewegungsverknüpfung Arm und Schlitten“: Drehgelenk Arm (j1), Schiebegelenk Schlitten (j2) entlang +X.
    // Verknüpfung 360° ↔ 62,832 mm (Umfang ⌀ 20 wie ein Ritzel): Arm 90° → Schlitten 90/360 · 62,832 = 15,708 mm,
    // Schlitten x 25 → 40,708; umgekehrt → 25 − 15,708 = 9,292
    await openExample('Bewegungsverknüpfung Arm und Schlitten');
    await cmd('asm:rel', 'motionlink');
    expect(/Bewegungsverknüpfung/.test(q('#dialog').textContent), 'Dialog Bewegungsverknüpfung');
    let f = C.editing && C.editing.feature;
    expect(f && f.a === 'j1' && f.fa === 'angle' && f.va === 360 && f.b === 'j2' && f.fb === 'offset' && f.vb === 10, 'Vorgabe: Drehgelenk 360° ↔ Schiebegelenk 10 mm');
    num('vb', 62.832); await ok();
    f = C.doc.features[C.doc.features.length - 1];
    expect(f.type === 'motionlink' && C.lastBuild.status[f.id].ok && /Schiebegelenk = 0\.174533 × Drehgelenk/.test(C.lastBuild.status[f.id].info), `Verknüpfung gebaut (${C.lastBuild.status[f.id].info})`);
    near((await bbox('e4'))[0][0], 25, 1e-6, 'Arm 0° → Schlitten bleibt bei x 25');
    // Bewegungsstudie: nur der Arm hat eine Spur (0 → 90°), der Schlitten folgt über die Verknüpfung
    const studie = async () => {
      await cmd('asm:motion', 'motion');
      const cb = q('#dialog [data-mot-spur="j1"][data-feld="angle"]');
      if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200); }
      const r = q('#dialog [data-mot="pos"]'); r.value = '30'; r.dispatchEvent(new W.Event('input', { bubbles: true }));
      await waitFor(() => /Schritt 31 von 31/.test(q('#dialog').textContent), 5000, 'letzter Schritt'); await sleep(1500);
      const x = (await bbox('e4'))[0][0];
      click('#dialog [data-cmd="mot-close"]'); await sleep(1500);
      return x;
    };
    near(await studie(), 25 + 15.708, 1e-3, 'Arm 90° → Schlitten x 40,708');
    // umgekehrt: Schlitten läuft in −X
    editTimeline(C.doc.features.length - 1); await sleep(300);
    click('#dialog [data-k="reverse"][data-v="true"]'); await sleep(100); await ok();
    near(await studie(), 25 - 15.708, 1e-3, 'umgekehrt: Schlitten x 9,292');
    expect(C.doc.features.find(x => x.id === 'j2').offset === 0, 'Gelenke im Dokument unverändert');
  }],
  ['Nebenbau (Kollision, Zeichnung, Export) lässt die Körper des letzten Baus stehen', async () => {
    // Kollision, Zeichnung und Export bauen eine eigene Feature-Liste (Bewegungsstudie je Schritt, Zeichnung das Bauteil).
    // Wurde so ein Auftrag erst nach dem Bau fertig, blieb sein Stand im Kern: `props` fand den Körper nicht mehr
    // (zufällige Ausfälle „Körper nicht gefunden“ im parallelen Prüflauf). Leere Liste = Nebenbau ohne Körper.
    await openExample('Lochbild auf 500 mm');
    const id = C.lastBuild.bodies[0], v0 = 500 * 200 * 8 - 15 * Math.PI * 5.5 ** 2 * 8;
    near(await vol(id), v0, 1e-3, 'Platte gebaut');
    const r = await C.kernel.interfere([], {});
    expect(r && r.pairs === 0, 'Kollision mit leerer Feature-Liste: keine Paare');
    near(await vol(id), v0, 1e-3, 'nach der Kollision: Körper des letzten Baus noch da');
    let err = ''; try { await C.kernel.drawing([], {}, ['front']); } catch (e) { err = e.message; }
    expect(/keinen sichtbaren Körper/.test(err), `Zeichnung ohne Körper meldet das (${err})`);
    err = ''; try { await C.kernel.exportFile([], 'step', {}); } catch (e) { err = e.message; }
    expect(/keinen sichtbaren Körper/.test(err), `Export ohne Körper meldet das (${err})`);
    near(await vol(id), v0, 1e-3, 'nach Zeichnung und Export mit Fehler: Körper noch da');
  }],
  ['Ähnliche Komponenten suchen', async () => {
    // A Quader 20 × 10 × 5 (XY), B derselbe gedreht (auf YZ: 5 × 10 × 20), C 20 × 10 × 5,5, D Zylinder ⌀ 10 × 20.
    // Bezug A. Abweichung C von Hand (Dichte 1, I = V·(a² + b²)/12): Volumen 1100/1000 → 9,09 %, Oberfläche 730/700 → 4,1 %,
    // Trägheitsmomente 125·1000 ↔ 130,25·1100 → 12,76 %, 425·1000 ↔ 430,25·1100 → 10,2 %, 500·1000 ↔ 500·1100 → 9,09 %
    // → größte Abweichung 12,76 %: „Gleich“ und „Ähnlich 10 %“ nur B, „Ähnlich 15 %“ B und C
    await newDoc();
    const quader = async (ebene, r, h) => { const s = await C.aiRun('skizze_anlegen', { ebene, formen: [{ art: 'rechteck', ...r }] }); await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: s.id, profiles: null, distance: h, direction: 'normal', op: 'new' } }); };
    await quader('XY', { x0: 0, y0: 0, x1: 20, y1: 10 }, 5);
    await quader('YZ', { x0: 30, y0: 0, x1: 40, y1: 20 }, 5);
    await quader('XY', { x0: 0, y0: 30, x1: 20, y1: 40 }, 5.5);
    const sc = await C.aiRun('skizze_anlegen', { ebene: 'XY', formen: [{ art: 'kreis', cx: 60, cy: 0, d: 10 }] });
    await C.aiRun('feature_anlegen', { feature: { type: 'extrude', sketch: sc.id, profiles: null, distance: 20, direction: 'normal', op: 'new' } });
    const [A, B, Cq, Dz] = C.lastBuild.bodies;
    expect(C.lastBuild.bodies.length === 4, 'vier Körper');
    const bb = await bbox(B);
    expect(Math.abs(bb[1][0] - bb[0][0] - 5) < 1e-6 && Math.abs(bb[1][2] - bb[0][2] - 20) < 1e-6, 'B liegt gedreht (5 breit, 20 hoch)');
    await cmd('solid:inspect', 'similar');
    expect(D.body.dataset.mode === 'similar' && /Ähnliche Komponenten suchen/.test(q('#dialog').textContent), 'Dialog „Ähnliche Komponenten suchen“');
    const rng = C.lastBuild.mesh.bodies.find(b => b.id === A).faces;
    pick(faces().find(h => rng[0] <= h.index && h.index < rng[1]));
    await waitFor(() => /gleiche|Keine/.test(q('#dialog .dbody').textContent), 8000, 'Vergleich');
    const S = () => [...D.querySelectorAll('#dialog .frow')].map(r => r.textContent);
    expect(S().length === 1 && S()[0].startsWith(C.doc.bodies[B].name), `„Gleich“: nur der gedrehte Quader (${S().join(' | ')})`);
    expect(C.vp.bodyColors[A] === '#3b82f6' && C.vp.bodyColors[B] === '#f59e0b' && C.vp.faded && C.vp.faded.has(Cq) && C.vp.faded.has(Dz), 'Bezug blau, Treffer orange, Rest durchscheinend');
    click('#dialog [data-cmd="sim-genau"][data-v="aehnlich"]'); await sleep(100);
    const setP = v => { const i = q('#dialog [data-sim="proz"]'); i.value = String(v); i.dispatchEvent(new W.Event('input', { bubbles: true })); };
    setP(10); await sleep(100);
    expect(S().length === 1, `„Ähnlich 10 %“: weiter nur B (${S().join(' | ')})`);
    setP(15); await sleep(100);
    const rc = S().find(t => t.startsWith(C.doc.bodies[Cq].name));
    expect(S().length === 2 && rc, `„Ähnlich 15 %“: B und C (${S().join(' | ')})`);
    near(parseFloat(rc.slice(C.doc.bodies[Cq].name.length).replace(',', '.')), 12.76, 0.01, 'Abweichung C = 12,76 % (Trägheitsmoment)');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150);
    expect(D.body.dataset.mode === 'model' && !C.vp.faded.size && C.vp.bodyColors[A] !== '#3b82f6', 'geschlossen, Farben zurück');
    // Baugruppe: Komponenten „Platte 1“ und „Platte 2“ mit Quader 20 × 10 × 5, „Platte 3“ mit 20 × 10 × 8
    await newDoc('assembly');
    const ks = [];
    for (const [n, h] of [['Platte 1', 5], ['Platte 2', 5], ['Platte 3', 8]]) {
      ks.push(await newComp(n)); await box(20, 10, h);
      click('#browser summary .b-act'); await sleep(200);
    }
    expect(ks.every(k => k.bodies.length === 1), 'drei Komponenten mit je einem Körper');
    await cmd('asm:inspect', 'similar');
    expect(q('#dialog [data-cmd="sim-art"][data-v="komp"]').getAttribute('aria-checked') === 'true', 'Baugruppe: es werden Komponenten verglichen');
    const r1 = C.lastBuild.mesh.bodies.find(b => b.id === ks[0].bodies[0]).faces;
    pick(faces().find(h => r1[0] <= h.index && h.index < r1[1]));
    await waitFor(() => /gleiche|Keine/.test(q('#dialog .dbody').textContent), 8000, 'Vergleich Komponenten');
    expect(S().length === 1 && S()[0].startsWith('Platte 2') && /Platte 1/.test(q('#dialog .dbody').textContent), `„Gleich“: Platte 2 gleicht Platte 1 (${S().join(' | ')})`);
    click('#dialog [data-cmd="sim-art"][data-v="koerper"]'); await sleep(150);
    expect(S().length === 1 && S()[0].startsWith(C.doc.bodies[ks[1].bodies[0]].name), `Körper: der Körper aus Platte 2 (${S().join(' | ')})`);
    click('#dialog [data-cmd="sim-close"]'); await sleep(150);
    expect(D.body.dataset.mode === 'model', 'geschlossen');
  }],
  ['Skizze: Spline mit Tangentengriff, tangential mitten auf der Kurve', async () => {
    // Spline durch P0 (0|0), P1 (15|10), P2 (40|0), Linie (−5|10)–(35|10) durch P1 (nicht an ihrem Ende).
    // 1. Griff an P1 setzen: Kurve bleibt gleich. 2. „Tangential“ Spline/Linie: Tangente in P1 waagrecht, P1 bleibt auf der
    // Linie. 3. Grifflänge 20: rechter Abschnitt als Bézier p1, b1 = p1 + h·√c2 / s, b2 = P2 − (P2 − P1)/3 (Ende, Catmull-Rom
    // mit gespiegeltem Randpunkt), c = Sehnenlängen, s = (√c1 + √c2)/2 → Punkt bei f = ½ = (p1 + 3 b1 + 3 b2 + p2)/8
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(400);
    const E = C.editor, M = await import('../src/sketch/model.js');
    E.setTool(null);
    let ids, lid;
    E.change(d => {
      ids = [[0, 0], [15, 10], [40, 0]].map(([x, y]) => M.addPoint(d, x, y).id);
      M.addSpline(d, ids);
      const l = M.addLine(d, M.addPoint(d, -5, 10).id, M.addPoint(d, 35, 10).id);
      lid = l.id;
      M.addRule(d, { type: 'fix', p: l.p1 }); M.addRule(d, { type: 'fix', p: l.p2 });
    }, { check: false });
    await sleep(100);
    const spl = () => E.f.curves.find(c => c.type === 'spline'), pm = () => M.pointMap(E.f);
    const before = M.curveSamples(spl(), pm(), 64);
    E.sel = new Set([ids[1]]); E.emit();
    const btn = q('#dialog [data-cmd="spline-handle"]');
    await waitFor(() => !btn.closest('.skopt').hidden, 3000, 'Knopf Tangentengriff');
    expect(/Tangentengriff/.test(btn.textContent), 'Knopf „Tangentengriff“ beim gewählten Stützpunkt');
    btn.click(); await sleep(150);
    const t = spl().tan && spl().tan[ids[1]], hl = t && E.f.curves.find(c => c.id === t.l);
    expect(t && hl && hl.cons && hl.p1 === ids[1], 'Griff als Konstruktionslinie am Stützpunkt');
    const after = M.curveSamples(spl(), pm(), 64);
    near(Math.max(...before.map((p, i) => Math.hypot(p[0] - after[i][0], p[1] - after[i][1]))), 0, 1e-9, 'Griff setzen ändert die Kurve nicht');
    expect(/Griff entfernen/.test(q('#dialog [data-cmd="spline-handle"]').textContent), 'Knopf heißt jetzt „Griff entfernen“');
    // tangential an die Linie, mitten auf dem Spline
    E.sel = new Set([spl().id, lid]); E.applyConstraint('tangent'); await sleep(200);
    const r = E.f.rules.find(x => x.type === 'tangent');
    expect(r && r.via === ids[1] && E.status.ok, `Tangential über den mittleren Stützpunkt (${r && r.via})`);
    const at = u => M.curveAt(spl(), pm(), u), d1 = at(0.5 + 1e-5), d0 = at(0.5 - 1e-5);
    near((d1[1] - d0[1]) / (d1[0] - d0[0]), 0, 1e-6, 'Tangente in P1 waagrecht (parallel zur Linie)');
    near(pm().get(ids[1]).y, 10, 1e-9, 'P1 liegt weiter auf der Linie');
    // Grifflänge 20 (Maß an der Grifflinie), Richtung zur Kurve nach rechts
    E.change(d => { M.addRule(d, { type: 'distance', a: t.l, value: 20 }); }, { check: false }); await sleep(150);
    const P = pm(), p1 = P.get(ids[1]), h = P.get(t.h), p2 = P.get(ids[2]), p0 = P.get(ids[0]);
    near(Math.hypot(h.x - p1.x, h.y - p1.y), 20, 1e-6, 'Grifflänge 20');
    const c1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), c2 = Math.hypot(p2.x - p1.x, p2.y - p1.y), s = (Math.sqrt(c1) + Math.sqrt(c2)) / 2;
    const b1 = [p1.x + (h.x - p1.x) * Math.sqrt(c2) / s, p1.y + (h.y - p1.y) * Math.sqrt(c2) / s], b2 = [p2.x - (p2.x - p1.x) / 3, p2.y - (p2.y - p1.y) / 3];
    const want = [0, 1].map(k => ([p1.x, p1.y][k] + 3 * b1[k] + 3 * b2[k] + [p2.x, p2.y][k]) / 8), got = at(0.75);
    near(Math.hypot(got[0] - want[0], got[1] - want[1]), 0, 1e-9, `Kurvenpunkt Mitte rechter Abschnitt (${got.map(v => v.toFixed(4)).join(' | ')})`);
    // Griff wieder entfernen: Hilfslinie und die Tangential-Bedingung daran fallen weg
    E.sel = new Set([ids[1]]); E.emit(); await sleep(50);
    click('#dialog [data-cmd="spline-handle"]'); await sleep(150);
    expect(!spl().tan && !E.f.curves.some(c => c.id === t.l) && !E.f.rules.some(x => x.type === 'tangent'), 'Griff entfernt, Tangential-Bedingung mit ihm');
    // tangential an einen Kreis (r 10, Mitte 10 unter P1, fest): P1 liegt auf dem Kreis, Tangente senkrecht zum Radius
    E.sel = new Set([lid]); E.deleteSelection(); await sleep(100);
    let kid;
    const cx = pm().get(ids[1]).x;
    E.change(d => { const k = M.addCircle(d, M.addPoint(d, cx, 0).id, 10); kid = k.id; M.addRule(d, { type: 'fix', p: k.c }); M.addRule(d, { type: 'radius', c: k.id, value: 10 }); }, { check: false });
    E.sel = new Set([spl().id, kid]); E.applyConstraint('tangent'); await sleep(200);
    const rk = E.f.rules.find(x => x.type === 'tangent'), Pk = pm(), q1 = Pk.get(ids[1]), e1 = at(0.5 + 1e-5), e0 = at(0.5 - 1e-5);
    const tg = [e1[0] - e0[0], e1[1] - e0[1]], rad = [q1.x - cx, q1.y];
    expect(rk && rk.via === ids[1] && E.status.ok, 'Tangential an den Kreis über den mittleren Stützpunkt');
    near(Math.hypot(...rad), 10, 1e-6, 'P1 auf dem Kreis');
    near((tg[0] * rad[0] + tg[1] * rad[1]) / Math.hypot(...tg) / Math.hypot(...rad), 0, 1e-5, 'Tangente senkrecht zum Radius');
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Skizze: Kollinear', async () => {
    // schräge Linie A (10|6)–(30|16); B frei (40|25)–(60|27) und C an A angehängt (30|16)–(48|31):
    // nach „Kollinear“ liegen alle Endpunkte auf der Geraden durch A (Steigung 1/2)
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(400);
    const E = C.editor;
    E.setTool('line'); sketchClick(10, 6); sketchClick(30, 16); E.setTool(null);
    E.setTool('line'); sketchClick(40, 25); sketchClick(60, 27); E.setTool(null);
    E.setTool('line'); sketchClick(30, 16); sketchClick(48, 31); E.setTool(null); await sleep(100);
    const [A, B, Cc] = E.f.curves.filter(c => c.type === 'line');
    expect(A && B && Cc && Cc.p1 === A.p2, 'drei Linien, die dritte am Ende der ersten');
    const pm = () => new Map(E.f.points.map(p => [p.id, p]));
    const onA = id => { const m = pm(), a = m.get(A.p1), b = m.get(A.p2), p = m.get(id); return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y); };
    expect(Math.abs(onA(B.p1)) > 1 && Math.abs(onA(Cc.p2)) > 1, 'vorher nicht auf einer Geraden');
    E.sel = new Set([A.id, B.id, Cc.id]); E.applyConstraint('collinear'); await sleep(150);
    const rs = E.f.rules.filter(r => r.type === 'collinear');
    expect(rs.length === 2 && rs.find(r => r.b === Cc.id).pts.length === 1, `zwei Regeln, bei der angehängten Linie nur das freie Ende (${JSON.stringify(rs.map(r => r.pts))})`);
    [B.p1, B.p2, Cc.p2].forEach((id, i) => near(onA(id), 0, 1e-6, `Endpunkt ${i + 1} auf der Geraden`));
    expect(E.status.ok && !E.status.redundant.length, 'gelöst, nichts doppelt bestimmt');
    E.sel = new Set([A.id, B.id]); E.applyConstraint('collinear'); await sleep(100);
    expect(E.f.rules.filter(r => r.type === 'collinear').length === 2, 'zweites Mal: schon festgelegt, keine weitere Regel');
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Skizze: Auto-Abhängigkeit von Bezug', async () => {
    // Rechteck (10|10)–(40|30) und Kreis um (25|20): 4 + 3 Freiheitsgrade → 2 Seitenlängen, Lage einer Ecke (2),
    // Durchmesser, Lage der Mitte (2) = 7 Maße ab dem Ursprung; danach 0 Freiheitsgrade
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor'); await sleep(400);
    const E = C.editor;
    E.setTool('rect'); sketchClick(10, 10); sketchClick(40, 30); E.setTool(null);
    E.setTool('circle'); sketchClick(25, 20); sketchClick(31, 20); E.setTool(null); await sleep(150);
    expect(E.status.dof > 0, `vorher unbestimmt (${E.status.dof} Freiheitsgrade)`);
    E.setTool('autodim'); sketchClick(0, 0); await sleep(300);
    const n = E.lastAuto, dims = E.f.rules.filter(r => ['distance', 'hdistance', 'vdistance', 'diameter'].includes(r.type));
    expect(n && n.dims === 7 && E.status.dof === 0, `7 Maße, vollständig bestimmt (${JSON.stringify(n)}, dof ${E.status.dof})`);
    const v = t => dims.filter(r => r.type === t).map(r => Math.round(Math.abs(r.value) * 1000) / 1000).sort((a, b) => a - b);
    expect(JSON.stringify(v('distance')) === '[20,30]', `Seitenlängen 20 und 30 (${v('distance')})`);
    expect(JSON.stringify(v('diameter')) === '[12]', `Durchmesser 12 (${v('diameter')})`);
    // die Kreismitte liegt da, wo der Klick gefangen wurde (nicht immer genau 25)
    const cc = E.f.points.find(p => p.id === E.f.curves.find(c => c.type === 'circle').c), r3 = x => Math.round(x * 1000) / 1000;
    expect(JSON.stringify(v('hdistance')) === JSON.stringify([10, r3(cc.x)].sort((a, b) => a - b)) && JSON.stringify(v('vdistance')) === JSON.stringify([10, r3(cc.y)].sort((a, b) => a - b)), `Lage ab Ursprung: Ecke (10|10), Mitte (${r3(cc.x)}|${r3(cc.y)}) (${v('hdistance')} / ${v('vdistance')})`);
    expect(dims.filter(r => r.type === 'hdistance' || r.type === 'vdistance').every(r => r.a === 'O'), 'Lagemaße ab dem Ursprung');
    expect(!E.tool, 'Werkzeug danach aus');
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig');
  }],
  ['Skizze: Verschmelzungskurve', async () => {
    // zwei waagrechte Linien (0|0)–(20|0) und (40|20)–(60|20): Verschmelzungskurve zwischen (20|0) und (40|20) –
    // Steuerpunkte (20|0), (20 + L/3 | 0), (40 − L/3 | 20), (40|20) mit L = √(20² + 20²); tangential an beiden Enden
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('line'); sketchClick(5, 5); sketchClick(25, 5); C.editor.setTool(null); await sleep(100);
    C.editor.setTool('line'); sketchClick(45, 25); sketchClick(65, 25); C.editor.setTool(null); await sleep(100);
    C.editor.setTool('blend'); await sleep(100);
    sketchClick(24, 5); sketchClick(46, 25); await sleep(200);
    const f = C.editor.f, spl = f.curves.find(c => c.type === 'spline');
    expect(spl && spl.cv === true && spl.pts.length === 4, `Verschmelzungskurve als Spline mit 4 Steuerpunkten (${JSON.stringify(spl)})`);
    if (!spl) return;
    // Raster fängt die Klicks: gegen die tatsächlichen Linienenden prüfen
    const pm = new Map(f.points.map(p => [p.id, p])), P = spl.pts.map(id => pm.get(id));
    const lines = f.curves.filter(c => c.type === 'line'), ends = lines.flatMap(l => [l.p1, l.p2]);
    expect(ends.includes(spl.pts[0]) && ends.includes(spl.pts[3]), 'beginnt und endet an den Linienenden');
    const L = Math.hypot(P[3].x - P[0].x, P[3].y - P[0].y);
    near(P[1].y, P[0].y, 1e-6, 'erster Steuerpunkt auf der Verlängerung (tangential)'); near(P[1].x - P[0].x, L / 3, 1e-6, '… im Abstand L/3');
    near(P[2].y, P[3].y, 1e-6, 'zweiter Steuerpunkt auf der Verlängerung'); near(P[3].x - P[2].x, L / 3, 1e-6, '… im Abstand L/3');
    expect(f.rules.filter(r => r.type === 'tangent').length === 2, 'zwei Tangential-Regeln');
  }],
  ['Skizze: Krümmungskamm', async () => {
    // Bogen R 20: überall Krümmung 1/20, Zähne zur Mitte; konische Kurve mit ρ = √2 − 1 (Viertelkreis R 10): 1/10;
    // Parabel (ρ = ½) zwischen (0|0), (10|10), (20|0): Scheitelkrümmung 1/(2·5)… im Scheitel am größten
    const M = await import('../src/sketch/model.js');
    const pm = new Map([['m', { x: 0, y: 0 }], ['s', { x: 20, y: 0 }], ['e', { x: 0, y: 20 }]]);
    const ca = M.curvatureComb({ type: 'arc', c: 'm', s: 's', e: 'e', r: 20, a0: 0, a1: Math.PI / 2 }, pm, 16);
    expect(ca.every(q => Math.abs(q.k - 0.05) < 1e-6), `Bogen: k = 1/20 (${ca.map(q => q.k.toFixed(5)).slice(0, 3).join(', ')} …)`);
    const q0 = ca[8]; near(q0.nz[0] * q0.p[0] + q0.nz[1] * q0.p[1], -20, 1e-3, 'Normale zeigt zur Bogenmitte');
    const pm2 = new Map([['a', { x: 10, y: 0 }], ['b', { x: 10, y: 10 }], ['c', { x: 0, y: 10 }]]);
    const cc = M.curvatureComb({ type: 'spline', pts: ['a', 'b', 'c'], conic: Math.SQRT2 - 1 }, pm2, 16);
    expect(cc.slice(1, -1).every(q => Math.abs(q.k - 0.1) < 1e-4), `konische Kurve als Viertelkreis: k = 1/10 (${cc.slice(1, 4).map(q => q.k.toFixed(5)).join(', ')} …)`);
    // Anzeige im Editor: Schalter in den Skizzenoptionen
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('arc'); sketchClick(20, 0); sketchClick(0, 20); sketchClick(14, 14); C.editor.setTool(null); await sleep(100);
    const box = q('#dialog [data-opt="comb"]'); box.checked = true; box.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(200);
    expect(C.editor.showComb && C.editor.combLines > 0, `Kamm angezeigt (${C.editor.combLines} Zähne)`);
  }],
  ['Skizze: konische Kurve', async () => {
    // ρ = ½: Parabel, Mitte = (P0 + 2A + P2)/4. ρ = √2 − 1 bei Scheitel (10|10) zwischen (10|0) und (0|10): Viertelkreis R 10
    const M = await import('../src/sketch/model.js');
    let q = M.conicAt([[0, 0], [10, 10], [20, 0]], 0.5, 0.5); near(q[0], 10, 1e-9, 'Parabel Mitte x'); near(q[1], 5, 1e-9, 'Parabel Mitte y');
    const rc = Math.SQRT2 - 1;
    for (const u of [0.2, 0.5, 0.8]) { q = M.conicAt([[10, 0], [10, 10], [0, 10]], rc, u); near(Math.hypot(q[0], q[1]), 10, 1e-9, `Viertelkreis bei u ${u}`); }
    // Werkzeug (um 20|20 verschoben, damit der Ursprung nicht fängt): Start (30|20), Ende (20|30), Scheitel (30|30),
    // ρ = √2 − 1; mit zwei Linien zur Mitte (20|20) ein Viertelkreis → π·100/4 × 5
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('conic'); C.editor.setConicRho(rc); await sleep(100);
    sketchClick(30, 20); sketchClick(20, 30); sketchClick(30, 30); await sleep(200);
    const cc = C.editor.f.curves.find(c => c.type === 'spline');
    expect(cc && Math.abs(cc.conic - rc) < 1e-9 && cc.pts.length === 3, `konische Kurve gezeichnet (${JSON.stringify(cc)})`);
    C.editor.setTool('line'); sketchClick(20, 30); sketchClick(20, 20); sketchClick(30, 20); C.editor.setTool(null); await sleep(200);
    expect((C.editor.regionCount || 0) >= 1, 'ein Profil');
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    await cmd('solid:create', 'extrude'); num('distance', 5); await ok();
    near(await vol(C.lastBuild.bodies[0]), Math.PI * 100 / 4 * 5, 0.05, 'Viertelkreis × 5');
  }],
  ['Skizze: Spline mit Steuerpunkten', async () => {
    // Auswertung: 3 Steuerpunkte = quadratische Bézierkurve (Mitte bei u = ½: (P0 + 2 P1 + P2)/4),
    // 4 Steuerpunkte = kubische Bézierkurve ((P0 + 3 P1 + 3 P2 + P3)/8); Anfang und Ende liegen auf der Kurve
    const M = await import('../src/sketch/model.js');
    const mk = (pts, closed) => { const sk = { points: pts.map((p, i) => ({ id: 'p' + i, x: p[0], y: p[1] })) }; return { pm: M.pointMap(sk), c: { type: 'spline', pts: sk.points.map(p => p.id), closed, cv: true } }; };
    let t = mk([[0, 0], [10, 20], [20, 0]], false);
    let q = M.curveAt(t.c, t.pm, 0.5); near(q[0], 10, 1e-9, 'quadratisch: Mitte x'); near(q[1], 10, 1e-9, 'quadratisch: Mitte y');
    t = mk([[0, 0], [0, 10], [10, 10], [10, 0]], false);
    q = M.curveAt(t.c, t.pm, 0.5); near(q[0], 5, 1e-9, 'kubisch: Mitte x'); near(q[1], 7.5, 1e-9, 'kubisch: Mitte y');
    q = M.curveAt(t.c, t.pm, 1); near(q[0], 10, 1e-9, 'Ende auf dem letzten Steuerpunkt');
    // geschlossen über ein Quadrat ±10: periodischer kubischer B-Spline, an jedem Abschnittsanfang (P[i−1] + 4 P[i] + P[i+1])/6
    t = mk([[-10, -10], [10, -10], [10, 10], [-10, 10]], true);
    q = M.curveAt(t.c, t.pm, 0); near(q[0], -20 / 3, 1e-9, 'geschlossen: Punkt bei u 0 (x)'); near(q[1], -20 / 3, 1e-9, 'geschlossen: Punkt bei u 0 (y)');
    // Werkzeug in der Skizze: geschlossen über vier Steuerpunkte (Klick auf den ersten schließt), dann extrudieren:
    // Volumen = Fläche des Punktzugs × 5
    await newDoc();
    click('#browser [data-cmd="sketch-on"][data-plane="XY"]');
    await waitFor(() => C.editor, 4000, 'Skizzen-Editor');
    await sleep(400);
    C.editor.setTool('cvspline'); await sleep(100);
    for (const [x, y] of [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]) sketchClick(x, y);
    await sleep(200);
    const spl = C.editor.f.curves.find(c => c.type === 'spline');
    expect(spl && spl.cv === true && spl.closed === true && spl.pts.length === 4, `geschlossener Spline mit Steuerpunkten (${JSON.stringify(spl)})`);
    const pmk = M.pointMap(C.editor.f), S = M.curveSamples(spl, pmk, 2000);
    let A = 0; for (let i = 0; i < S.length - 1; i++) A += (S[i][0] * S[i + 1][1] - S[i + 1][0] * S[i][1]) / 2;
    click('[data-cmd="sketch-finish"]');
    await waitFor(() => !C.editor, 4000, 'Skizze fertig');
    await cmd('solid:create', 'extrude'); num('distance', 5); await ok();
    near(await vol(C.lastBuild.bodies[0]), Math.abs(A) * 5, Math.abs(A) * 5 * 1e-3, `extrudiert: Fläche ${Math.abs(A).toFixed(2)} × 5`);
  }],
  ['Sweeping: Verjüngungswinkel', async () => {
    // Kreis R 10, gerader Pfad 100, 5° nach außen: Kegelstumpf R 10 → 10 + 100·tan 5° = 18,749,
    // V = π/3·100·(R1² + R1·R2 + R2²). Derselbe Weg zweiteilig und rückwärts gezeichnet muss dasselbe ergeben.
    await openExample('Kegel gezogen');
    await waitFor(() => C.lastBuild && C.lastBuild.status && C.lastBuild.status.w2 && C.lastBuild.bodies.length === 2, 10000, 'Sweeping');
    const r2 = 10 + 100 * Math.tan(5 * Math.PI / 180), kegel = (a, b) => Math.PI / 3 * 100 * (a * a + a * b + b * b);
    const [b1, b2] = C.lastBuild.bodies;
    near(await vol(b1), kegel(10, r2), 0.5, 'Kegelstumpf R 10 → 18,749');
    let bb = await bbox(b1);
    near(bb[1][0], r2, 1e-2, 'oben Radius 18,749'); near(bb[1][2], 100, 1e-6, 'Höhe 100');
    near(await vol(b2), kegel(10, r2), 0.5, 'zweiteiliger, rückwärts gezeichneter Pfad: gleich');
    bb = await bbox(b2);
    // Hülle und Volumen sehen nicht, an welchem Ende der Kegel weit ist: Breite der Scheibe z 99…100 messen
    const oben = await C.kernel.call('devEval', { code: `
      return ctx.bodies().map(b => { const sl = b.shape.clone().intersect(R.makeBox([-500, -500, 99], [500, 500, 100])); const q = ctx.bbOf(sl); return +((q[1][0] - q[0][0]) / 2).toFixed(3); });` });
    expect(oben.length === 2 && oben.every(r => Math.abs(r - r2) < 0.02), `oben weit (Radius ${oben.join(' / ')}, erwartet ${r2.toFixed(3)})`);
    // nach innen −5°: R 10 → 1,251
    const i = C.doc.features.findIndex(f => f.id === 'w1');
    editTimeline(i); await sleep(400);
    expect(q('#dialog input[data-k="taper"]').value === '5', 'Verjüngung im Dialog');
    num('taper', -5); await ok();
    near(await vol(C.lastBuild.bodies[0]), kegel(10, 10 - 100 * Math.tan(5 * Math.PI / 180)), 0.5, 'nach innen: Kegelstumpf R 10 → 1,251');
    editTimeline(i); await sleep(400); num('taper', -10); await ok();
    expect(/Verjüngung zu stark/.test((C.lastBuild.status.w1 || {}).error || ''), `zu stark: Meldung (${(C.lastBuild.status.w1 || {}).error})`);
  }],
  ['Extrusion: Körperfläche als Profil', async () => {
    // Würfel 20 (z 0…20): Deckel als Profil, 5 mm als neuer Körper → eigener Klotz 20·20·5 über dem Würfel; symmetrisch
    // 10 mm ausgeschnitten → nimmt die oberen 5 mm vom Würfel (die andere Hälfte liegt in der Luft)
    await newDoc(); await box(20, 20, 20);
    const cube = C.lastBuild.bodies[0];
    await cmd('solid:create', 'extrude');
    await seg('src', 'face');
    click('#dialog [data-cmd="pick-exface"]'); await sleep(150);
    await act(async () => pick(faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.9)));
    expect(/Ebene Fläche ✓/.test(q('#dialog').textContent), 'Fläche als Profil gewählt');
    num('distance', 5); await seg('op', 'new'); await ok();
    expect(C.lastBuild.bodies.length === 2, `zwei Körper (${C.lastBuild.bodies.length})`);
    const neu = C.lastBuild.bodies.find(b => b !== cube);
    near(await vol(neu), 2000, 1e-6, 'neuer Klotz 20·20·5');
    const bb = await bbox(neu);
    near(bb[0][2], 20, 1e-6, 'beginnt auf dem Deckel'); near(bb[1][2], 25, 1e-6, 'endet bei z 25');
    const i = C.doc.features.length - 1;
    editTimeline(i); await sleep(400); await seg('direction', 'symmetric'); num('distance', 10); await seg('op', 'cut'); await ok();
    near(await vol(C.lastBuild.bodies[0]), 20 * 20 * 15, 1e-6, 'symmetrisch ausgeschnitten: obere 5 mm weg');
  }],
  ['Drücken/Ziehen bis Fläche (Fläche ersetzen)', async () => {
    // Würfel 20 (z 0…20) und daneben ein Quader 10×10×30: der Deckel des Würfels wandert bis auf z 30 → 20·20·30.
    await newDoc(); await box(20, 20, 20); await box(10, 10, 30, { cx: 40 });
    const cube = C.lastBuild.bodies[0];
    await cmd('solid:modify', 'presspull');
    const top = faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.9 && Math.abs(h.info.center[2] - 20) < 1e-6);
    const target = faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.9 && Math.abs(h.info.center[2] - 30) < 1e-6);
    await act(async () => pick(top));
    await seg('ppTo', 'face');
    click('#dialog [data-cmd="pick-toface"]'); await sleep(150);
    await act(async () => pick(target));
    expect(/Ebene Fläche ✓/.test(q('#dialog').textContent), 'Zielfläche gewählt');
    await ok();
    near(await vol(cube), 20 * 20 * 30, 1e-3, 'Deckel bis z 30');
    const fid = C.doc.features[C.doc.features.length - 1].id;
    expect(/bis zur Zielfläche \(10 mm\)/.test((C.lastBuild.status[fid] || {}).info || ''), `Status (${(C.lastBuild.status[fid] || {}).info})`);
  }],
  ['Drücken/Ziehen mit mehreren Flächen', async () => {
    // Würfel 20: Deckel und Seite +X je +5 → zwei Klötze 20×20×5, die sich nicht überschneiden: 8000 + 2·2000.
    // Je −2: 8000 − 2·800 + Eckstück 2×20×2 (doppelt weggenommen) = 6480
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:modify', 'presspull');
    const top = faces().find(h => h.info.type === 'PLANE' && h.info.n[2] > 0.9), side = faces().find(h => h.info.type === 'PLANE' && h.info.n[0] > 0.9);
    await act(async () => pick(top));
    click('#dialog [data-cmd="pp-more"]'); await sleep(150);
    await act(async () => pick(side));
    expect(/1 weitere/.test(q('#dialog').textContent), 'eine weitere Fläche gewählt');
    num('distance', 5); await ok();
    const fid = C.doc.features[C.doc.features.length - 1].id;
    near(await vol(C.lastBuild.bodies[0]), 12000, 1e-3, 'beide Flächen +5');
    expect(/2 Flächen/.test((C.lastBuild.status[fid] || {}).info || ''), 'Status: 2 Flächen');
    editTimeline(C.doc.features.length - 1); await sleep(400); num('distance', -2); await ok();
    near(await vol(C.lastBuild.bodies[0]), 6480, 1e-3, 'beide Flächen −2');
  }],
  ['Regel-Abrundung: nur Rundungen oder nur Kehlen', async () => {
    // Winkel aus zwei Quadern (Fuß 40×20×10, Steg 10×20×30 auf der linken Hälfte, verbunden): eine Kehle innen (Länge 20),
    // dazu 15 Außenkanten. Nur Kehlen R 3: es kommen (1 − π/4)·9·20 dazu; nur Rundungen R 1 nimmt weg.
    await newDoc(); await box(40, 20, 10, { cx: 20 }); await box(10, 20, 40, { cx: 5 });
    const id = () => C.lastBuild.bodies[0];
    expect(C.lastBuild.bodies.length === 1, 'ein Winkel-Körper');
    const v0 = await vol(id());
    await cmd('solid:modify', 'fillet');
    click('#dialog [data-cmd="all-edges"]'); await sleep(200);
    await seg('allKind', 'concave'); num('radius', 3); await ok(30000);
    const fid = C.doc.features[C.doc.features.length - 1].id;
    expect(/1 Innenkanten gerundet/.test((C.lastBuild.status[fid] || {}).info || ''), `eine Kehle (${(C.lastBuild.status[fid] || {}).info || (C.lastBuild.status[fid] || {}).error})`);
    near(await vol(id()) - v0, (1 - Math.PI / 4) * 9 * 20, 1e-3, 'Kehle R 3 füllt (1 − π/4)·9·20 auf');
    editTimeline(C.doc.features.length - 1); await sleep(400); await seg('allKind', 'convex'); num('radius', 1); await ok(30000);
    const info = (C.lastBuild.status[fid] || {}).info || '';
    expect(/Außenkanten gerundet/.test(info) && await vol(id()) < v0, `nur Rundungen nehmen weg (${info})`);
  }],
  ['Abrunden und Fase: alle Kanten der gewählten Flächen', async () => {
    // Zylinder ⌀10, h 30: die Mantelfläche anklicken → beide Kreisränder werden gerundet, genau wie wenn man
    // die beiden Kanten einzeln wählt. Je Rand fehlt ein Umdrehungsring: die Fläche r²(1 − π/4) an der Ecke,
    // ihr Schwerpunkt bei a(1 − π/4) + r(π/4 − 5/6) – mit 2π·ρ nach Pappus.
    const a = 5, H = 30, R = 2;
    const fehlt = 2 * 2 * Math.PI * R * R * (a * (1 - Math.PI / 4) + R * (Math.PI / 4 - 5 / 6));
    let vFlaeche = null;
    for (const mitFlaeche of [true, false]) {
      await newDoc();
      await cmd('solid:create', 'cylinder'); num('d', 2 * a); num('h', H); await ok(20000);
      const id = C.lastBuild.bodies[0];
      near(await vol(id), Math.PI * a * a * H, 1e-3, 'Zylinder ohne Rundung');
      await cmd('solid:modify', 'fillet');
      if (mitFlaeche) {
        click('#dialog [data-cmd="face-edges"]'); await sleep(200);
        const mantel = faces().find(f => f.info.type === 'CYLINDRE');
        expect(!!mantel, 'Mantelfläche zum Anklicken');
        pick(mantel); await sleep(250);
        expect(/1 Fläche gewählt – alle Ecken dieser Flächen/.test(q('#dialog').textContent), 'Dialog meldet die gewählte Fläche');
      } else {
        const kk = edges().filter(e => e.info.type === 'CIRCLE');
        expect(kk.length === 2, 'beide Kreisränder zum Anklicken');
        kk.forEach(e => pick(e)); await sleep(250);
      }
      num('radius', R); await ok(20000);
      const st = (C.lastBuild.status || {})[C.doc.features[C.doc.features.length - 1].id] || {};
      expect(st.ok, `aufgebaut (${st.error || 'ok'})`);
      const v = await vol(id);
      near(v, Math.PI * a * a * H - fehlt, 1e-3, mitFlaeche ? 'beide Ränder der Fläche gerundet' : 'beide Kanten einzeln gerundet');
      if (mitFlaeche) {
        expect(/2 Kanten der gewählten Flächen gerundet/.test(st.info || ''), `Meldung (${st.info || st.error})`);
        const ff = C.doc.features[C.doc.features.length - 1];
        expect(ff.fromFaces && ff.fromFaces.length === 1 && ff.fromFaces[0].t === 'CYLINDRE', 'Flächenbezug in der Datei');
        vFlaeche = v;
      } else near(v, vFlaeche, 1e-6, 'genau wie mit einzeln gewählten Kanten');
    }
    // Fase an einer Flächenwahl: dasselbe Bezugssystem, auch hier funktionieren die Kanten der Fläche
    await newDoc();
    await cmd('solid:create', 'box'); num('w', 30); num('l', 30); num('h', 20); num('cx', 15); await ok(20000);
    const id2 = C.lastBuild.bodies[0], v2 = await vol(id2);
    await cmd('solid:modify', 'chamfer');
    click('#dialog [data-cmd="face-edges"]'); await sleep(200);
    const oben = faces().find(f => f.info.type === 'PLANE' && Math.abs(f.info.center[2] - 20) < 1e-6);
    expect(!!oben, 'Oberseite zum Anklicken');
    pick(oben); await sleep(250);
    num('distance', 3); await ok(20000);
    const st2 = (C.lastBuild.status || {})[C.doc.features[C.doc.features.length - 1].id] || {};
    expect(/4 Kanten der gewählten Flächen gefast/.test(st2.info || ''), `Fase an der Oberseite (${st2.info || st2.error})`);
    near(v2 - await vol(id2), 4 * (3 * 3 / 2) * 30 - 4 * 3 ** 3 / 3, 1e-3, 'Fase 3 an den vier oberen Kanten (Ecken nur einmal)');
  }],
  ['Abrunden: Kanten mit der Freiformschleife wählen', async () => {
    // Quader 40×30×20: eine senkrechte Kante mit Alt+Zug umfahren → genau sie wird
    // gerundet, es fehlt (1 − π/4)·5²·20. Ein Zug quer durch das Modell trifft nichts,
    // denn wie beim Rahmen nach rechts zählt nur, was ganz innerhalb der Schleife liegt.
    await newDoc(); await box(40, 30, 20);
    const id = C.lastBuild.bodies[0], v0 = await vol(id);
    await cmd('solid:modify', 'fillet');
    expect(C.vp.boxSelect, 'Rahmen- und Freiformauswahl ist im Abrund-Dialog an');
    const cv = D.getElementById('cv'), rc = cv.getBoundingClientRect();
    const scr = p => { const s = C.vp.toScreen(p); return { x: rc.left + s[0], y: rc.top + s[1] }; };
    const umrundet = (a, b, m) => [
      { x: Math.min(a.x, b.x) - m, y: Math.min(a.y, b.y) - m }, { x: Math.max(a.x, b.x) + m, y: Math.min(a.y, b.y) - m },
      { x: Math.max(a.x, b.x) + m, y: Math.max(a.y, b.y) + m }, { x: Math.min(a.x, b.x) - m, y: Math.max(a.y, b.y) + m },
      { x: Math.min(a.x, b.x) - m, y: Math.min(a.y, b.y) - m },
    ];
    const schleife = async (pts) => {
      // OrbitControls fängt pointerdown ab und ruft setPointerCapture – für ein
      // künstliches Ereignis gibt es keinen aktiven Zeiger, also ausschalten.
      C.vp.controls.enabled = false;
      const ev = (t, p, btn) => cv.dispatchEvent(new W.PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 5, isPrimary: true, button: 0, buttons: btn, altKey: true, clientX: p.x, clientY: p.y }));
      try {
        ev('pointerdown', pts[0], 1);
        for (const p of pts.slice(1)) ev('pointermove', p, 1);
        ev('pointerup', pts[pts.length - 1], 0);
      } finally { C.vp.controls.enabled = true; }
      await sleep(300);
    };
    const senkrechte = edges().filter(e => e.info.type === 'LINE' && Math.abs(e.info.dir[2]) > 0.9);
    expect(senkrechte.length === 4, `vier senkrechte Kanten zum Umfahren (${senkrechte.length})`);
    // erst der Zug quer durchs Modell: eine Schleife, die nur durchgeht, darf nichts wählen
    const mitte = scr([20, 15, 10]);
    await schleife(umrundet({ x: mitte.x - 60, y: mitte.y - 6 }, { x: mitte.x + 60, y: mitte.y + 6 }, 0));
    expect(!/Kante[n]? gewählt/.test(q('#dialog .selinfo').textContent), `quer gezogen wählt nichts (${q('#dialog .selinfo').textContent})`);
    // dann eng um eine Kante: nur sie liegt ganz innerhalb, ihre Nachbarn ragen hinaus
    const ziel = senkrechte[0], a = scr(ziel.info.p0), b = scr(ziel.info.p1);
    await schleife(umrundet(a, b, 8));
    expect(/1 Kante gewählt/.test(q('#dialog .selinfo').textContent), `genau die umfahrene Kante (${q('#dialog .selinfo').textContent})`);
    num('radius', 5); await ok(20000);
    const st = (C.lastBuild.status || {})[C.doc.features[C.doc.features.length - 1].id] || {};
    expect(st.ok, `aufgebaut (${st.error || 'ok'})`);
    near(v0 - await vol(id), (1 - Math.PI / 4) * 25 * 20, 1e-3, 'nur die umfahrene Kante gerundet');
  }],
  ['Abrunden mit Sehnenlänge statt Radius', async () => {
    // Würfel 20, senkrechte Kante (Normalen 90° zueinander): Sehne 5·√2 → R 5, es fehlen (1 − π/4)·25·20.
    // Zum Vergleich ein 120°-Keil wäre r = c / (2 sin 30°) = c – hier genügt die rechtwinklige Kante.
    await newDoc(); await box(20, 20, 20);
    const id = C.lastBuild.bodies[0], v0 = await vol(id);
    await cmd('solid:modify', 'fillet');
    await seg('chord', 'true');
    expect(/Sehnenlänge/.test(q('#dialog').textContent), 'Feld heißt Sehnenlänge');
    pick(edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6));
    num('radius', 5 * Math.SQRT2); await ok();
    near(v0 - await vol(C.lastBuild.bodies[0]), (1 - Math.PI / 4) * 25 * 20, 1e-3, 'Sehne 5√2 = R 5');
    // 135°-Kante (Rand einer Fase 5): Normalen 45° → r = 2 / (2·sin 22,5°), es fehlen r²·(tan 22,5° − π/8)·20
    await newDoc(); await box(20, 20, 20);
    await cmd('solid:modify', 'chamfer');
    pick(edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6));
    num('distance', 5); await ok();
    const v1 = await vol(C.lastBuild.bodies[0]);
    const corner = v => Math.abs(v) < 1e-6 || Math.abs(v - 20) < 1e-6;
    const rim = edges().find(e => e.info.type === 'LINE' && Math.abs(Math.abs(e.info.dir[2]) - 1) < 1e-6 && !(corner(e.info.p0[0]) && corner(e.info.p0[1])));
    expect(!!rim, 'Randkante der Fase gefunden');
    await cmd('solid:modify', 'fillet'); await seg('chord', 'true');
    pick(rim); num('radius', 2); await ok();
    const rr = 1 / Math.sin(Math.PI / 8);
    near(v1 - await vol(C.lastBuild.bodies[0]), rr * rr * (Math.tan(Math.PI / 8) - Math.PI / 8) * 20, 1e-3, '135°-Kante: r = c / (2 sin 22,5°)');
  }],
  ['Abrunden und Fase: mehrere Kantengruppen mit eigenem Maß', async () => {
    // Würfel 20 (z 0…20): obere Kante bei y −10 und untere Kante bei y +10, beide entlang X und getrennt (je 20 lang).
    // Abrunden R 2 + R 5: es fehlen (1 − π/4)·(4 + 25)·20; Fase 2 + 3: es fehlen (4 + 9)/2·20 = 130
    for (const [art, a, b, weg] of [['fillet', 2, 5, (1 - Math.PI / 4) * 29 * 20], ['chamfer', 2, 3, 130]]) {
      await newDoc(); await box(20, 20, 20);
      const id = C.lastBuild.bodies[0], v0 = await vol(id);
      const E = edges();
      const k1 = E.find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2] - 20) < 1e-6 && Math.abs(e.info.p1[2] - 20) < 1e-6 && Math.abs(e.info.p0[1] + 10) < 1e-6 && Math.abs(e.info.p1[1] + 10) < 1e-6);
      const k2 = E.find(e => e.info.type === 'LINE' && Math.abs(e.info.p0[2]) < 1e-6 && Math.abs(e.info.p1[2]) < 1e-6 && Math.abs(e.info.p0[1] - 10) < 1e-6 && Math.abs(e.info.p1[1] - 10) < 1e-6);
      await cmd('solid:modify', art);
      num(art === 'fillet' ? 'radius' : 'distance', a);
      pick(k1); await sleep(150);
      click('#dialog [data-cmd="fset-add"]'); await sleep(200);
      pick(k2); await sleep(150);
      expect(/Gruppe 2: 1 Kante/.test(q('#dialog').textContent), `${art}: zweite Gruppe hat die Kante`);
      const inp = q('#dialog input[data-fset="0"]'); inp.value = String(b); inp.dispatchEvent(new W.Event('input', { bubbles: true }));
      await ok();
      const st = (C.lastBuild.status || {})[C.doc.features[C.doc.features.length - 1].id] || {};
      expect(st.ok, `${art}: aufgebaut (${st.error || 'ok'})`);
      near(v0 - await vol(id), weg, 1e-3, `${art}: beide Gruppen mit ihrem Maß`);
      const ff = C.doc.features[C.doc.features.length - 1];
      expect(ff.edges.length === 1 && ff.sets && ff.sets.length === 1 && ff.sets[0].value === b, `${art}: Gruppen in der Datei`);
    }
  }],
  ['Verschachtelung: Abwicklungen auf Tafeln', async () => {
    await openExample('Kasten Blech 2mm');
    click('[data-rtab="sheet"]'); await sleep(150);
    click('[data-cmd="nest"]');
    const N = await waitFor(() => D.querySelector('#nesting:not([hidden])'), 4000, 'Arbeitsbereich Verschachtelung');
    await waitFor(() => N.querySelector('.ntab tbody tr'), 4000, 'aktuelles Teil in der Liste');
    expect(/161 × 121/.test(N.querySelector('.ntab tbody tr').textContent), 'Abwicklung 161 × 121 mm übernommen');
    expect(D.querySelector('.timeline') && getComputedStyle(D.querySelector('.timeline')).display === 'none', 'Zeitleiste ausgeblendet');
    const nester = await waitFor(() => { const t = N.querySelector('.nset .info.small'); return t && !/startet|unbekannt/.test(t.textContent) && t.textContent; }, 25000, 'Nester-Status');
    if (/bereit/.test(nester)) {
      const qi = N.querySelector('.ntab input[data-pf="qty"]'); qi.value = '8'; qi.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
      const ss = N.querySelector('select[data-ns="search"]'); ss.value = '0'; ss.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(100);
      N.querySelector('[data-n="start"]').click();
      await waitFor(() => { const b = N.querySelector('.nstat b'); return b && /Fertig|Fehler/.test(b.textContent); }, 60000, 'Nesting fertig');
      expect(/Fertig/.test(N.querySelector('.nstat b').textContent), 'Nester rechnet fertig');
      expect(N.querySelectorAll('.nsheet svg path').length === 8, 'acht Teile auf der Tafel');
    } else expect(true, 'Nester nicht verfügbar – Rechnen übersprungen (' + nester.slice(0, 60) + ')');
    click('[data-cmd="nest-close"]'); await sleep(400);
    expect(C.vp && D.body.dataset.mode === 'model', 'zurück in der Konstruktion');
  }],
  ['Rendern: Arbeitsbereich öffnen und schließen', async () => {
    await openExample('Winkel 80x60x8');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="render"]');
    const R = await waitFor(() => D.querySelector('#render:not([hidden])'), 4000, 'Arbeitsbereich Rendern');
    expect(D.body.dataset.mode === 'render', 'Modus Rendern');
    expect(R.querySelector('canvas').width > 0, 'Bildfläche angelegt');
    await sleep(1500);
    // im verdeckten Fenster ruft der Browser keine Animationsbilder auf – dann zählt nur, dass nichts abstürzt
    expect(true, `Durchgänge bisher: ${(R.querySelector('.rinfo').textContent || '–')}`);
    // Licht und Szene: Richtung, Helligkeit, eigener Hintergrund – gemerkt in cc.render, „Licht zurücksetzen“
    const setR = (k, v) => { const i = R.querySelector(`input[data-r="${k}"]`); i.value = String(v); i.dispatchEvent(new W.Event('input', { bubbles: true })); };
    setR('az', 90); setR('sun', 2.5);
    const bgOn = R.querySelector('[data-r="bgOn"]'); R.querySelector('[data-r="bg"]').value = '#336699'; bgOn.checked = true; bgOn.dispatchEvent(new W.Event('change', { bubbles: true }));
    let saved = JSON.parse(W.localStorage.getItem('cc.render') || '{}');
    expect(saved.az === 90 && saved.sun === 2.5 && saved.bg === '#336699', `Lichtrichtung, Helligkeit und Hintergrund gemerkt (${JSON.stringify(saved)})`);
    expect(R.querySelector('[data-rv="az"]').textContent === '90', 'Wert neben dem Regler');
    click('#render [data-r="lightReset"]'); await sleep(100);
    saved = JSON.parse(W.localStorage.getItem('cc.render') || '{}');
    expect(saved.az === 239 && saved.sun === 1 && saved.bg === '' && !bgOn.checked, 'Licht zurückgesetzt');
    // Eigenes Umgebungsbild: Radiance-HDR 4 × 2, erste Zeile lauflängenkodiert, zweite flach.
    // RGBE (128, 64, 32, 129) = Mantisse · 2^(129 − 136) → 1, 0,5, 0,25; Exponent 0 → schwarz.
    const { parseHDR } = C.rendering;
    const kopf = [...'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 8\n'].map(c => c.charCodeAt(0));
    const rle = [2, 2, 0, 8, 136, 128, 136, 64, 136, 32, 136, 129];               // je Kanal 8 gleiche Werte
    const flach = [].concat(...Array.from({ length: 8 }, (_, i) => i === 7 ? [9, 9, 9, 0] : [255, 0, 0, 128]));
    const hdr = new Uint8Array([...kopf, ...rle, ...flach]);
    const h = parseHDR(hdr.buffer);
    expect(h.width === 8 && h.height === 2, `HDR 8 × 2 gelesen (${h.width} × ${h.height})`);
    near(h.data[0], 1, 1e-9, 'Rot = 128 · 2^−7'); near(h.data[1], 0.5, 1e-9, 'Grün'); near(h.data[2], 0.25, 1e-9, 'Blau');
    near(h.data[32], 255 / 256, 1e-9, 'flache Zeile: 255 · 2^−8'); expect(h.data[60] === 0 && h.data[63] === 1, 'Exponent 0 → schwarz');
    let fehler = ''; try { parseHDR(new Uint8Array([80, 49, 10]).buffer); } catch (e) { fehler = e.message; }
    expect(/Radiance/.test(fehler), `kein HDR erkannt (${fehler})`);
    const datei = R.querySelector('input[data-r="envFile"]'), dt = new W.DataTransfer();
    dt.items.add(new W.File([hdr], 'halle.hdr'));
    datei.files = dt.files; datei.dispatchEvent(new W.Event('change', { bubbles: true }));
    await waitFor(() => C.rendering.umgebungsbild === 'halle.hdr', 4000, 'Umgebungsbild geladen');
    expect(/halle\.hdr/.test(R.querySelector('.rbild').textContent), 'Bildname im Panel');
    const S = C.rendering.szene;
    expect(S.environment && S.environment.isTexture && S.background && S.background.isColor, 'Bild als Umgebung, Hintergrund weiter Farbe');
    const envBg = R.querySelector('[data-r="envBg"]'); envBg.checked = true; envBg.dispatchEvent(new W.Event('change', { bubbles: true }));
    expect(S.background && S.background.isTexture, 'Bild als Hintergrund');
    setR('envRot', 90);
    near(S.environmentRotation.y, Math.PI / 2, 1e-9, 'Drehung 90°'); near(S.backgroundRotation.y, Math.PI / 2, 1e-9, 'Hintergrund dreht mit');
    click('#render [data-r="envDel"]'); await sleep(100);
    expect(C.rendering.umgebungsbild === null && S.background.isColor && /Studio/.test(R.querySelector('.rbild').textContent), 'Bild entfernt, Studio-Umgebung');
    setR('envRot', 0); envBg.checked = false; envBg.dispatchEvent(new W.Event('change', { bubbles: true }));
    click('[data-cmd="render-close"]'); await sleep(400);
    expect(D.body.dataset.mode === 'model' && R.hidden, 'zurück in der Konstruktion');
  }],
  ['Zeichnung: perspektivische Ansicht (Fluchtpunkt)', async () => {
    // Quader 60 × 40 × 20: in der Isometrie (parallel) zeigen die Kanten genau 3 Richtungen; perspektivisch laufen die
    // Kanten einer Richtung auf einen Fluchtpunkt zu – also mehr als 3 Richtungen
    await newDoc(); await box(60, 40, 20);
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg') && C.drawing && C.drawing.data, 20000, 'Zeichnung');
    click('[data-menu="dview"]'); await sleep(150);
    click('#fmenu [data-cmd="dview-place"][data-v="isoP"]');
    await waitFor(() => C.drawing.data && C.drawing.data.views && C.drawing.data.views.isoP && C.drawing.data.views.isoP.bb, 30000, 'Perspektive berechnet');
    const richtungen = v => {
      const d = [];
      // Pfade nur aus M/L: alle Zahlen paarweise (replicad schreibt „M x,y L x,y“, die Perspektive „M x y L x y“)
      v.vis.forEach(p => { const n = (p.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number), z = []; for (let i = 0; i + 1 < n.length; i += 2) z.push([n[i], n[i + 1]]); for (let i = 0; i + 1 < z.length; i++) { const dx = z[i + 1][0] - z[i][0], dy = z[i + 1][1] - z[i][1], l = Math.hypot(dx, dy); if (l < 1e-6) continue; let w = Math.atan2(dy, dx); if (w < 0) w += Math.PI; if (w >= Math.PI - 1e-6) w -= Math.PI; if (!d.some(x => Math.abs(x - w) < 1e-3)) d.push(w); } });
      return d.length;
    };
    const nIso = richtungen(C.drawing.data.views.iso), nP = richtungen(C.drawing.data.views.isoP);
    expect(nIso === 3 && nP > 3, `Kantenrichtungen: Isometrie ${nIso}, Perspektive ${nP}`);
    expect(C.drawing.data.views.isoP.vis.length >= 9 && !C.drawing.data.views.isoP.hid.length, `9 sichtbare Kanten, keine verdeckten (${C.drawing.data.views.isoP.vis.length})`);
    await closeDrawing();
  }],
  ['Rendern: Aufkleber auf eine Fläche', async () => {
    // Quader 60 × 40 × 20: Aufkleber auf die Quadermitte gezielt → liegt auf einer Quaderfläche (eine Koordinate auf einer
    // Grenze der Hülle), Normale entlang dieser Achse nach außen; Breite anfangs 0,25 · 60 = 15 mm, im Dokument gespeichert
    await newDoc(); await box(60, 40, 20);
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="render"]');
    const R = await waitFor(() => D.querySelector('#render:not([hidden])'), 4000, 'Arbeitsbereich Rendern');
    const cv = D.createElement('canvas'); cv.width = 64; cv.height = 32; const g = cv.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 32);
    const png = cv.toDataURL('image/png');
    // in die Bildmitte des Quaders zielen (die Render-Kamera übernimmt die Ansicht der Konstruktion)
    const qb = C.lastBuild.mesh.bodies[0].bbox, ziel = C.rendering.bildpunkt([0, 1, 2].map(k => (qb[0][k] + qb[1][k]) / 2));
    expect(C.rendering.aufkleberTest('Logo', png, ziel[0], ziel[1]), 'Aufkleber gesetzt');
    const a = (C.doc.aufkleber || [])[0];
    expect(!!a && a.name === 'Logo' && /^data:image\/png;/.test(a.img) && a.w === 15, `im Dokument: ${a && a.name}, Breite ${a && a.w}`);
    const grenzen = [0, 1, 2].map(k => [qb[0][k], qb[1][k]]), achse = [0, 1, 2].find(k => grenzen[k].some(v => Math.abs(a.p[k] - v) < 1e-3));
    const nSoll = [0, 0, 0]; if (achse != null) nSoll[achse] = Math.abs(a.p[achse] - grenzen[achse][1]) < 1e-3 ? 1 : -1;
    expect(achse != null && a.n.every((v, k) => Math.abs(v - nSoll[k]) < 1e-6), `auf der Fläche, Normale nach außen (p ${a.p.map(v => v.toFixed(2))}, n ${a.n.map(v => v.toFixed(2))})`);
    expect(C.rendering.aufkleberMeshes === 1 && R.querySelectorAll('.rdec1').length === 1, 'Aufkleber in der Szene und in der Liste');
    const w = R.querySelector('[data-dec="w"]'); w.value = '30'; w.dispatchEvent(new W.Event('input', { bubbles: true })); w.dispatchEvent(new W.Event('change', { bubbles: true })); await sleep(50);
    expect(C.doc.aufkleber[0].w === 30, 'Breite 30 mm');
    click('#render [data-dec="del"]'); await sleep(50);
    expect(!(C.doc.aufkleber || []).length && C.rendering.aufkleberMeshes === 0, 'Aufkleber entfernt');
    click('[data-cmd="render-close"]'); await sleep(300);
  }],
  ['Gelenk: Stift-Nut, Planar und Kugel', async () => {
    await openExample('Beispiel-Baugruppe');
    const bolt = C.doc.features[0].comp + '/e1', b0 = await bbox(bolt);
    const ctr = b => [0, 1, 2].map(k => (b[0][k] + b[1][k]) / 2), size = b => [0, 1, 2].map(k => b[1][k] - b[0][k]);
    const c0 = ctr(b0), s0 = size(b0), axis = s0.indexOf(Math.max(...s0));
    editTimeline(0); await sleep(600);
    // Planar: 10 mm in X, 5 mm in Y der Gelenkebene → seitlich um √125 verschoben, Höhe gleich
    await seg('kind', 'planar');
    expect(q('#dialog [data-k="u"]') && q('#dialog [data-k="v"]'), 'Felder Verschieben X/Y');
    await act(() => num('u', 10)); await act(() => num('v', 5));
    let c1 = ctr(await bbox(bolt)), d = c1.map((v, k) => v - c0[k]);
    near(Math.hypot(...d), Math.sqrt(125), 1e-6, 'Planar: Verschiebung √(10² + 5²)');
    near(d[axis], 0, 1e-6, 'Planar: nicht entlang der Gelenkachse');
    // Stift-Nut: nur X, 7 mm
    await seg('kind', 'pinslot');
    expect(!D.querySelector('#dialog [data-k="v"]'), 'Stift-Nut ohne Y');
    await act(() => num('u', 7));
    c1 = ctr(await bbox(bolt)); d = c1.map((v, k) => v - c0[k]);
    near(Math.hypot(...d), 7, 1e-6, 'Stift-Nut: 7 mm in der Nut');
    // Kugel: um X 90° geneigt → die lange Richtung des Bolzens liegt quer
    await seg('kind', 'ball');
    await act(() => num('tilt', 90));
    const s2 = size(await bbox(bolt));
    expect(Math.abs(s2[axis] - Math.max(...s0)) > 1, `Kugel: Bolzen gekippt (${s0.map(v => v.toFixed(1))} → ${s2.map(v => v.toFixed(1))})`);
    near(Math.max(...s2), Math.max(...s0), 1e-6, 'Kugel: Länge bleibt');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    near(ctr(await bbox(bolt))[axis], c0[axis], 1e-6, 'Abbrechen: wieder in der Ausgangslage');
  }],
  ['Gelenkursprung: eigener versetzter Ursprung für ein Gelenk', async () => {
    await openExample('Beispiel-Baugruppe');
    const j = C.doc.features[0], bolt = j.comp + '/e1', z0 = await bbox(bolt);
    const o2 = JSON.parse(JSON.stringify(j.o2));
    // Gelenkursprung auf derselben Stelle wie Ursprung 2 des Gelenks, 10 mm entlang der Achse versetzt
    await cmd('asm:rel', 'jorigin');
    expect(/Gelenkursprung/.test(q('#dialog').textContent) && C.vp.pickMode === 'any', 'Dialog, Kante/Fläche anklicken');
    const e0 = edges().find(e => C.lastBuild.mesh.bodies[e.info.body].id === o2.body);
    pick(e0); await sleep(150);
    expect(/(Fläche|Kante) · /.test(q('#dialog').textContent), 'Basis gewählt');
    const jf = () => C.doc.features.find(x => x.type === 'jorigin') || null;
    await act(() => num('dz', 10));
    await ok();
    let jo = jf();
    expect(jo && jo.sel && jo.dz === 10, 'Gelenkursprung angelegt');
    // auf dieselbe Basis wie das Gelenk setzen (eindeutiger Vergleich), an den Anfang der Zeitleiste
    jo.sel = o2;
    const pv = C.lastBuild; C.moveFeature(C.doc.features.indexOf(jo), 0); await built(pv);
    const st = C.lastBuild.status[jo.id];
    expect(st && st.ok && st.frame, `Ursprung berechnet (${st && (st.error || '')})`);
    expect(C.vp.workAxes.some(w => w.id === jo.id), 'als Achse im Modell sichtbar');
    // Gelenk: Ursprung 2 neu, die Achse des Gelenkursprungs anklicken
    editTimeline(1); await sleep(500);
    click('#dialog [data-cmd="joint-reset"][data-n="2"]'); await sleep(150);
    const wa = C.vp.workAxes.find(w => w.id === jo.id);
    pick({ kind: 'workaxis', id: wa.id, name: wa.name, axis: wa.axis }); await sleep(150);
    expect(/Gelenkursprung/.test(q('#dialog').textContent), 'Ursprung 2 = Gelenkursprung');
    await ok();
    const z1 = await bbox(bolt), d = [0, 1, 2].map(k => z1[0][k] - z0[0][k]);
    near(Math.hypot(...d), 10, 1e-6, 'Bolzen sitzt 10 mm weiter entlang der Achse');
    expect(C.lastBuild.status[C.doc.features[1].id].ok, 'Gelenk ohne Fehler');
  }],
  ['Starre Gruppe: Komponenten bewegen sich gemeinsam', async () => {
    await newDoc('assembly');
    const a = await newComp('A');
    await box(10, 10, 10);
    click('#browser summary .b-act'); await sleep(200);
    const b = await newComp('B');
    await box(10, 10, 10, { cx: 40 });
    click('#browser summary .b-act'); await sleep(200);
    const ba = a.bodies[0], bb = b.bodies[0];
    const za = (await bbox(ba))[0][2], zb = (await bbox(bb))[0][2];
    // Starre Gruppe aus A und B
    await cmd('asm:rel', 'rigid');
    expect(/Starre Gruppe/.test(q('#dialog').textContent), 'Dialog Starre Gruppe');
    click(`#dialog [data-cmd="comp-pick"][data-id="${a.id}"]`); await sleep(150);
    click(`#dialog [data-cmd="comp-pick"][data-id="${b.id}"]`); await sleep(300);
    await ok();
    const rg = C.doc.features.find(f => f.type === 'rigid');
    expect(rg && rg.comps.length === 2 && C.lastBuild.status[rg.id].ok, 'Starre Gruppe mit zwei Komponenten');
    // nur A verschieben: B geht mit (Handrechnung: beide + 25 mm in Z)
    await cmd('asm:modify', 'move');
    await sleep(400);
    click(`#dialog [data-cmd="comp-pick"][data-id="${a.id}"]`); num('dz', 25);
    await sleep(400);
    await ok();
    near((await bbox(ba))[0][2] - za, 25, 1e-6, 'A 25 mm hoch');
    near((await bbox(bb))[0][2] - zb, 25, 1e-6, 'B wandert in der starren Gruppe mit');
    // Gruppe unterdrückt: B bleibt stehen
    C.toggleSuppress(C.doc.features.indexOf(rg)); await sleep(1200);
    near((await bbox(bb))[0][2] - zb, 0, 1e-6, 'ohne Gruppe bleibt B stehen');
    near((await bbox(ba))[0][2] - za, 25, 1e-6, 'A weiterhin verschoben');
  }],
  ['Eingefügtes Teil mit Gelenken duplizieren', async () => {
    await openExample('Beispiel-Baugruppe');
    const j0 = C.doc.features[0], id = j0.comp, n0 = C.doc.inserts.length, nf = C.doc.features.length;
    const b0 = await bbox(id + '/e1');
    const row = q(`#browser [data-ins="${id}"]`);
    row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 })); await sleep(150);
    const it = q('[data-cmd="insert-dupj"]');
    expect(/Mit Gelenken duplizieren \(1\)/.test(it.textContent), 'Rechtsklick: Mit Gelenken duplizieren (1 Gelenk)');
    const prev = C.lastBuild; it.click(); await built(prev, 20000);
    const cp = C.doc.inserts[C.doc.inserts.length - 1], j1 = C.doc.features[1];
    expect(C.doc.inserts.length === n0 + 1 && cp.name === 'Bolzen M8x22 (5)' && cp.file === C.doc.inserts.find(x => x.id === id).file, `Kopie „${cp.name}“ derselben Datei`);
    expect(C.doc.features.length === nf + 1 && j1.type === 'joint' && j1.comp === cp.id && j1.o1.body === cp.id + '/e1' && j1.o2.body === j0.o2.body, 'Gelenk direkt dahinter, Ursprung 1 auf der Kopie, Ursprung 2 wie vorher');
    expect(C.lastBuild.status[j1.id] && C.lastBuild.status[j1.id].ok, 'neues Gelenk ohne Fehler');
    const b1 = await bbox(cp.id + '/e1');
    near(Math.hypot(...[0, 1, 2].map(k => b1[0][k] - b0[0][k])) + Math.hypot(...[0, 1, 2].map(k => b1[1][k] - b0[1][k])), 0, 1e-6, 'Kopie sitzt an derselben Stelle wie das Original');
    // ohne Gelenke: daneben
    const r2 = q(`#browser [data-ins="${cp.id}"]`);
    r2.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 })); await sleep(150);
    const p2 = C.lastBuild; q('[data-cmd="insert-dup"]').click(); await built(p2, 20000);
    const c2 = C.doc.inserts[C.doc.inserts.length - 1];
    expect(c2.name === 'Bolzen M8x22 (6)' && c2.at[0] > cp.at[0] && C.doc.features.length === nf + 1, `ohne Gelenke daneben (x ${cp.at[0]} → ${c2.at[0]}), kein neues Gelenk`);
    click('[data-cmd="undo"]'); await sleep(300); click('[data-cmd="undo"]'); await sleep(300);
    expect(C.doc.inserts.length === n0 && C.doc.features.length === nf, 'Rückgängig entfernt beide Kopien');
  }],
  ['Gelenk: Zylindrisch mit Grenzen', async () => {
    await openExample('Beispiel-Baugruppe');
    const bolt = C.doc.features[0].comp + '/e1', z0 = (await bbox(bolt))[0][2];
    editTimeline(0); await sleep(600);
    await seg('kind', 'cylindrical');
    expect(D.querySelectorAll('#dialog input[type=range]').length === 2, 'Regler für Winkel und Versatz');
    await seg('limits', 'true');
    num('lmax', 10); await sleep(200);
    expect(q('#dialog input[type=range][data-jrange="offset"]').max === '10', 'Regler endet an der Grenze');
    await act(() => num('offset', 30));
    near((await bbox(bolt))[0][2] - z0, 10, 1e-6, 'Versatz auf Maximum begrenzt');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
  }],
  ['Dokumentarten: Bauteil und Baugruppe mit eigenem Menüband', async () => {
    const tabs = () => [...D.querySelectorAll('#ribbon .rtab')].map(t => t.dataset.rtab).join(',');
    const items = async menu => { click(`[data-menu="${menu}"]`); await sleep(120); const r = [...D.querySelectorAll('#fmenu [data-cmd]')].map(b => b.dataset.cmd + (b.disabled ? '-' : '')); click(`[data-menu="${menu}"]`); await sleep(80); return r.join(','); };
    await newDoc();
    expect(C.doc.kind === 'part' && tabs() === 'solid,sheet,util,extras', `Bauteil: Volumenkörper, Blech, Dienstprogramme, Extras (${tabs()})`);
    expect(/Bauteilkonstruktion/.test(q('#browser').textContent), 'Browser: Bauteilkonstruktion');
    click('[data-rtab="solid"]'); await sleep(100);
    expect(await items('solid:assemble') === 'to-assembly', 'Zusammenfügen: nur „Zu Baugruppe hinzufügen“');
    const ins = await items('solid:insert');
    expect(ins.startsWith('insert-,fastener-,derive'), `Einfügen: Teil und Schraube gesperrt, Ableiten frei (${ins})`);
    expect((await items('solid:create')).endsWith('jorigin'), 'Erstellen endet mit Gelenkursprung');
    // Baugruppenbefehle über Tastatur/Suche: nur Hinweis, kein Dialog
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'j', bubbles: true })); await sleep(200);
    expect(D.querySelector('#dialog').hidden, 'J (Gelenk) im Bauteil öffnet keinen Dialog');
    // Zu Baugruppe hinzufügen: speichern (Windows-Dialog nachgebildet), neue Baugruppe mit dem Teil
    const fsys = new Map();
    let next = [];
    W.__ccNativeStub = {
      caps: { dialogs: true, projects: 'C:\\Projekte\\' },
      pick: async () => next.shift() ?? null,
      read: async path => { if (!fsys.has(path)) throw new Error('fehlt ' + path); return new TextEncoder().encode(fsys.get(path)).buffer; },
      write: async (path, data) => { fsys.set(path, typeof data === 'string' ? data : await new W.Response(data).text()); }
    };
    try {
      await box(40, 30, 20);
      const P = 'C:\\Konstruktion\\Klotz.cantcodecad';
      next = [P];
      click('[data-menu="solid:assemble"]'); await sleep(120); click('#fmenu [data-cmd="to-assembly"]'); await sleep(200);
      const ask = D.getElementById('askbox'); expect(ask, 'Rückfrage: erst speichern');
      [...ask.querySelectorAll('button')].find(b => /Speichern/.test(b.textContent)).click();
      await waitFor(() => C.doc.kind === 'assembly' && (C.doc.inserts || []).length === 1, 8000, 'Baugruppe mit Teil');
      expect(fsys.has(P) && JSON.parse(fsys.get(P)).kind === 'part', 'Teil gespeichert (als Bauteilkonstruktion)');
      expect(C.doc.name === 'Klotz Baugruppe' && C.doc.inserts[0].file === P && !C.doc.file, 'neue, ungespeicherte Baugruppe „Klotz Baugruppe“ verknüpft das Teil');
      await waitFor(() => C.lastBuild && C.lastBuild.bodies.some(id => id.startsWith(C.doc.inserts[0].id + '/')), 20000, 'Körper des Teils');
      near(await vol(C.lastBuild.bodies[0]), 24000, 1e-6, 'Teil 40 × 30 × 20 = 24 000 mm³');
      expect(tabs() === 'asm,util', `Baugruppe: Reiter Baugruppe und Dienstprogramme (${tabs()})`);
      const groups = [...D.querySelectorAll('#ribbon .fglabel')].map(b => b.textContent.trim()).join(',');
      expect(groups === 'Einfügen,Erstellen,Beziehungen,Bewegung,Ändern,Konfigurieren,Konstruieren,Prüfen', `Gruppen (${groups})`);
      expect(/Baugruppenkonstruktion/.test(q('#browser').textContent), 'Browser: Baugruppenkonstruktion');
      // Baugruppe mit Inhalt lässt sich nicht zum Bauteil machen
      click('#browser [data-cmd="doc-kind"]'); await sleep(200);
      expect(C.doc.kind === 'assembly', 'mit eingefügtem Teil bleibt es eine Baugruppe');
      // Komponente aktivieren: Modellier-Reiter im Kontext, „Fertig“ zurück
      const k = await newComp('Halter');
      expect(C.doc.activeComp === k.id && tabs() === 'asm,solid,sheet,util,extras' && D.querySelector('[data-rtab="solid"][aria-selected="true"]'), `aktive Komponente: Volumenkörper (${tabs()})`);
      expect(/Komponente bearbeiten: Halter/.test(q('#ribbon .rctx').textContent), 'Hinweis „Komponente bearbeiten“');
      click('#ribbon .rctx [data-cmd="comp-activate"]'); await sleep(200);
      expect(!C.doc.activeComp && tabs() === 'asm,util', 'Fertig: wieder oberste Ebene');
    } finally { delete W.__ccNativeStub; }
    // ältere Dateien ohne Angabe: nach Inhalt
    await openExample('Beispiel-Baugruppe');
    expect(C.doc.kind === 'assembly', 'Beispiel-Baugruppe → Baugruppe');
    await openExample('Winkel 80x60x8');
    expect(C.doc.kind === 'part' && tabs().startsWith('solid'), 'Winkel → Bauteil');
  }],
  ['Zeichnung: Bild und DXF einfügen', async () => {
    const clickAt = (x, y) => { const sv = D.querySelector('#drawing .sheet svg'), pt = sv.createSVGPoint(); pt.x = x; pt.y = y; const q2 = pt.matrixTransform(sv.getScreenCTM()); (D.elementFromPoint(q2.x, q2.y) || sv).dispatchEvent(new W.MouseEvent('click', { bubbles: true, clientX: q2.x, clientY: q2.y })); };
    const give = file => { const inp = q('#sheetfile'), dt = new W.DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true })); };
    await openExample('Winkel mit Rippe');
    click('[data-rtab="util"]'); await sleep(150);
    click('[data-cmd="drawing"]');
    await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
    expect(/Einfügen/.test(q('#ribbon .g-dinsert').textContent), 'Gruppe Einfügen im Menüband');
    // DXF: Rechteck 40 × 20, Kreis r 5 in der Mitte, Halbbogen r 10 rechts außen (bis x = 50)
    const L = (x1, y1, x2, y2) => `0\r\nLINE\r\n8\r\n0\r\n10\r\n${x1}\r\n20\r\n${y1}\r\n11\r\n${x2}\r\n21\r\n${y2}\r\n`;
    const dxf = `0\r\nSECTION\r\n2\r\nENTITIES\r\n${L(0, 0, 40, 0)}${L(40, 0, 40, 20)}${L(40, 20, 0, 20)}${L(0, 20, 0, 0)}0\r\nCIRCLE\r\n8\r\n0\r\n10\r\n20\r\n20\r\n10\r\n40\r\n5\r\n0\r\nARC\r\n8\r\n0\r\n10\r\n40\r\n20\r\n10\r\n40\r\n10\r\n50\r\n270\r\n51\r\n90\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;
    click('[data-cmd="drawing-dxfins"]'); await sleep(100);
    give(new W.File([dxf], 'platte.dxf'));
    await waitFor(() => C.drawing.noteMode && C.drawing.noteMode.kind === 'dxf', 4000, 'DXF gelesen');
    clickAt(20, 20); await sleep(300);
    const nd = (C.doc.drawing.notes || []).find(x => x.kind === 'dxf');
    expect(nd && nd.w === 50 && nd.h === 20 && Math.abs(nd.at[0] - 20) < 0.5 && Math.abs(nd.at[1] - 20) < 0.5, `DXF: 50 × 20 mm (Bogen bis x = 50), Ecke bei 20/20 (${nd && [nd.w, nd.h, nd.at]})`);
    const pth = q('#drawing .notes .dxfi'), bb = pth.getBBox();
    near(bb.width, 50, 1e-3, 'Pfad 50 breit: Bogen nach rechts außen'); near(bb.height, 20, 1e-3, 'Pfad 20 hoch');
    const tr = (pth.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/) || []).slice(1).map(Number);
    expect(tr.length === 2 && tr[0] === nd.at[0] && tr[1] === nd.at[1], 'an der angeklickten Stelle');
    // Bild 40 × 20 px → 50 mm breit, 25 mm hoch
    const cv = D.createElement('canvas'); cv.width = 40; cv.height = 20; cv.getContext('2d').fillRect(0, 0, 40, 20);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    click('[data-cmd="drawing-img"]'); await sleep(100);
    give(new W.File([blob], 'logo.png', { type: 'image/png' }));
    await waitFor(() => C.drawing.noteMode && C.drawing.noteMode.kind === 'image', 4000, 'Bild gelesen');
    clickAt(200, 30); await sleep(300);
    const im = q('#drawing .notes image');
    expect(im.getAttribute('width') === '50' && im.getAttribute('height') === '25' && Math.abs(Number(im.getAttribute('x')) - 200) < 0.5, `Bild 50 × 25 mm bei x 200 (${im.getAttribute('width')} × ${im.getAttribute('height')})`);
    expect((C.doc.drawing.notes || []).filter(x => x.kind === 'image' || x.kind === 'dxf').length === 2, 'beide in der Zeichnung gespeichert');
    await closeDrawing();
  }],
  ['Zeichnung als eigenes Dokument (verknüpft mit dem Modell)', async () => {
    const fsys = new Map();
    let next = [];
    W.__ccNativeStub = {
      caps: { dialogs: true, projects: 'C:\\Projekte\\' },
      pick: async () => next.shift() ?? null,
      read: async path => { if (!fsys.has(path)) throw new Error('fehlt ' + path); return new TextEncoder().encode(fsys.get(path)).buffer; },
      write: async (path, data) => { fsys.set(path, typeof data === 'string' ? data : await new W.Response(data).text()); }
    };
    const REF = 'Beispiele/Winkel mit Rippe.cantcodecad', P = 'C:\\Zeichnungen\\Winkel.cantcodecad';
    try {
      await openExample('Winkel mit Rippe');
      const nf = C.doc.features.length;
      click('[data-rtab="util"]'); await sleep(150);
      click('[data-cmd="drawing"]');
      await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
      expect(C.doc.kind === 'drawing' && C.doc.ref === REF && C.doc.name === 'Winkel mit Rippe Zeichnung' && !C.doc.file, `neues Zeichnungsdokument mit Verweis (${C.doc.kind}, ${C.doc.ref}, ${C.doc.name})`);
      expect(C.doc.features.length === nf && /Winkel mit Rippe/.test(q('#ribbon .rref').textContent), 'Modell als Kopie dabei, Verweis im Menüband');
      expect([...D.querySelectorAll('#drawing .sheet svg text')].some(t => t.textContent === 'Winkel mit Rippe'), 'Schriftfeld: Name des Modells');
      const br = q('#browser').textContent;
      expect(/Blätter/.test(br) && /Blatt 1/.test(br) && /Modell/.test(br) && !/Skizzen/.test(br), 'Browser der Zeichnung: Blätter und Modell statt Körper/Skizzen');
      // speichern: Windows-Dialog, Datei ist eine Zeichnung mit Verweis
      next = [P];
      click('[data-cmd="save"]'); await waitFor(() => fsys.has(P), 5000, 'gespeichert');
      const saved = JSON.parse(fsys.get(P));
      expect(saved.kind === 'drawing' && saved.ref === REF && saved.modelName === 'Winkel mit Rippe' && C.doc.file === P, 'Datei: kind drawing, ref, Modellname');
      // Änderung, dann schließen: Rückfrage; Abbrechen bleibt in der Zeichnung
      click('[data-cmd="dopt-toggle"][data-k="hidden"]'); await sleep(400);
      click('[data-cmd="drawing-close"]'); await sleep(200);
      let ask = D.getElementById('askbox');
      expect(ask && /nicht gespeichert/.test(ask.textContent) && ask.querySelectorAll('button').length === 3, 'Rückfrage Speichern / Verwerfen / Abbrechen');
      [...ask.querySelectorAll('button')].find(b => /Abbrechen/.test(b.textContent)).click(); await sleep(200);
      expect(D.body.dataset.mode === 'drawing' && C.doc.kind === 'drawing', 'Abbrechen: Zeichnung bleibt offen');
      // Speichern über die Rückfrage, danach öffnet sich das Modell
      click('[data-cmd="drawing-close"]'); await sleep(200);
      ask = D.getElementById('askbox');
      [...ask.querySelectorAll('button')].find(b => /Speichern/.test(b.textContent)).click();
      await waitFor(() => D.body.dataset.mode === 'model' && C.doc.kind === 'part', 20000, 'Modell offen');
      expect(C.doc.file === REF && C.doc.name === 'Winkel mit Rippe', 'Zum Modell: verknüpfte Datei geöffnet');
      expect(JSON.parse(fsys.get(P)).drawing.opts.hidden !== undefined, 'Änderung gespeichert');
      // Zeichnungsdatei öffnen: Modell frisch aus der Datei, gleich im Arbeitsbereich Zeichnung
      next = [P];
      click('[data-cmd="open"]');
      await waitFor(() => D.body.dataset.mode === 'drawing' && D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung geöffnet');
      expect(C.doc.kind === 'drawing' && C.doc.file === P && C.doc.features.length === nf, 'Öffnen der Zeichnung');
      const rec = JSON.parse(localStorage.getItem('cc.recent.test') || '[]');
      expect(rec[0] && rec[0].path === P && rec[0].kind === 'drawing', 'Zuletzt geöffnet: als Zeichnung vermerkt');
      click('[data-cmd="new"]'); await sleep(150);
      const row = D.querySelector('#start [data-start="recent"][data-kind="drawing"]');
      expect(row && /Zeichnung ·/.test(row.textContent) && /Zeichnung ·/.test(q('#start .st-cont').textContent), 'Startfenster: Art bei „Zuletzt geöffnet“ und „Weiter mit“');
      click('#start [data-start="close"]'); await sleep(100);
      // Einfügen einer Zeichnung als Teil wird abgelehnt
      await closeDrawing();
      await newDoc('assembly');
      next = [P];
      click('[data-rtab="asm"]'); await sleep(100);
      click('[data-menu="asm:insert"]'); await sleep(150); click('#fmenu [data-cmd="insert"]'); await sleep(600);
      expect(!(C.doc.inserts || []).length, 'Zeichnung lässt sich nicht als Teil einfügen');
      // ungespeichertes Modell: Zeichnung mit Kopie, „Zum Modell“ führt zurück
      await newDoc(); await box(50, 40, 30);
      click('[data-rtab="util"]'); await sleep(150);
      click('[data-cmd="drawing"]');
      await waitFor(() => D.querySelector('#drawing .sheet svg'), 20000, 'Zeichnung');
      expect(C.doc.kind === 'drawing' && !C.doc.ref && /Kopie/.test(q('#ribbon .rref').textContent), 'ohne Verweis: Kopie');
      await closeDrawing();
      expect(C.doc.kind === 'part' && C.doc.name === 'Teil1' && C.doc.features.length === 1, 'zurück zum ungespeicherten Teil');
    } finally { delete W.__ccNativeStub; }
  }],
  ['3D-Skizze: ein Zug im Raum und ein Rohr entlang', async () => {
    const M = await import('../src/sketch/model.js');
    await newDoc();
    /* eine 3D-Skizze legt sofort los – eine Ebene wird nicht gefragt */
    await cmd('solid:create', 'sketch3d');
    await waitFor(() => C.editor && C.editing, 4000, 'Skizzen-Editor');
    const f = C.editing.feature;
    expect(!f.plane, 'die Skizze hat keine Ebene');
    expect(/3D-Skizze/.test(q('#dialog .plane').textContent), 'Dialog: Punkte direkt im Raum');
    expect(!D.querySelector('#dialog [data-opt="grid"]') && !D.querySelector('#dialog [data-opt="cons"]'), 'kein Rasterfang und keine Konstruktionsgeometrie');
    expect(!D.querySelector('#dialog [data-k="plane"]') && !D.querySelector('#dialog [data-cmd="spline-handle"]'), 'kein Ebnen-Wähler und keine Tangentengriffe');
    expect(!!q('#dialog [data-opt="snap3d"]'), 'Schalter: Modellkanten und -flächen treffen');
    const snap0 = C.editor.snapModel;
    click('#dialog [data-opt="snap3d"]'); await sleep(120);
    expect(C.editor.snapModel !== snap0, 'der Schalter für Modellkanten schaltet um');
    click('#dialog [data-opt="snap3d"]'); await sleep(120);
    expect(C.editor.snapModel === snap0, 'und wieder zurück');
    expect(!!q('#sketchbar [data-tool="arc3"]') && !D.querySelector('#sketchbar [data-tool="rect"]') && !D.querySelector('#sketchbar [data-constraint]'), 'Werkzeugleiste: Bogen durch drei Punkte, kein Rechteck und keine Abhängigkeiten');
    expect(C.editor.tool === 'line' && q('#sketchbar [data-tool="line"]').getAttribute('aria-pressed') === 'true', 'das Linienwerkzeug ist beim Start an');
    click('#sketchbar [data-tool="line"]'); await sleep(80);
    expect(C.editor.tool === null, 'ein Klick auf das aktive Werkzeug schaltet es ab');
    click('#sketchbar [data-tool="line"]'); await sleep(80);
    expect(C.editor.tool === 'line', 'der nächste Klick schaltet es wieder ein');
    /* Blick von vorn: ohne Ebene setzt der Zeiger Punkte in die Ebene senkrecht zum Blick */
    const still = async () => { await waitFor(() => !C.vp.anim, 4000, 'Kamera steht'); await sleep(150); };
    const bb = C.vp.bounds(); bb.min.set(-110, -110, -110); bb.max.set(110, 110, 110);
    C.vp.view('front', bb); await still();
    const P = (x, z) => [x, 0, z];
    const tool = async id => { click(`#sketchbar [data-tool="${id}"]`); await sleep(80); };
    sketch3dClick(P(-60, -40)); sketch3dClick(P(20, -40));
    expect(f.curves.length === 1 && f.curves[0].type === 'line', 'eine Linie im Raum');
    expect(f.points.length === 2, 'zwei Punkte');
    near((f.points[0] || {}).x, -60, 0.5, 'erster Punkt: x'); near((f.points[0] || {}).z, -40, 0.5, 'erster Punkt: z');
    /* Bogen durch drei Punkte – tangential an die Linie (Viertelkreis um 20, 0, -20) */
    await tool('arc3');
    sketch3dClick(P(20, -40)); sketch3dClick(P(34.1421356, -34.1421356)); sketch3dClick(P(40, -20));
    expect(f.curves.length === 2 && f.curves[1].type === 'arc3', 'Bogen durch drei Punkte im Raum');
    expect(f.points.length === 4, 'der Anfang des Bogens ist der Endpunkt der Linie');
    near((f.points[1] || {}).x, 20, 0.5, 'gemeinsamer Punkt: x');
    near((f.points[2] || {}).x, 34.1421356, 0.5, 'mittlerer Punkt des Bogens: x');
    f.points.forEach((p, i) => near(p.y, 0, 0.5, `Punkt ${i} liegt in der xz-Ebene`));
    /* die Linie setzt am Ende des Bogens an */
    await tool('line');
    sketch3dClick(P(40, -20)); sketch3dClick(P(40, 80));
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200);
    expect(f.curves.length === 3 && f.curves[2].type === 'line', 'die Linie setzt am Ende des Bogens an');
    expect(f.points.length === 5, 'der gemeinsame Punkt wird geteilt, nicht doppelt gesetzt');
    const ch = M.chainCurves(f.curves, M.curveEnds3);
    expect(!ch.error && ch.order.length === 3 && !ch.closed, `Linien und Bogen sind ein Zug (${ch.error || 'geordnet'})`);
    expect(/durchgehender Zug/.test(q('#skstate').textContent), 'Status im Dialog: ein durchgehender Zug');
    /* Spline als zweiter Zug: zwei getrennte Züge ergeben keinen Pfad */
    await tool('spline');
    sketch3dClick(P(-80, 60)); sketch3dClick(P(-40, 75)); sketch3dClick(P(0, 60));
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(250);
    expect(f.curves.length === 4 && f.curves[3].type === 'spline' && !f.curves[3].closed, 'Spline durch drei Punkte im Raum');
    expect((f.curves[3] || {}).pts && f.curves[3].pts.every(id => Number.isFinite((f.points.find(p => p.id === id) || {}).z)), 'die Stützpunkte haben ein z');
    expect(/Lücke/.test(q('#skstate').textContent), 'Status: zwei getrennte Züge ergeben keinen Pfad');
    await tool('spline');
    sketch3dClick(P(-40, 75));
    expect(C.editor.sel.size === 1, 'ein Stützpunkt ist ausgewählt');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await sleep(250);
    expect(f.curves.length === 3 && f.points.length === 5, 'mit dem Punkt fällt die Spline samt ihren Stützpunkten');
    expect(/durchgehender Zug/.test(q('#skstate').textContent), 'Status wieder: ein durchgehender Zug');
    /* Punkt ziehen: ohne Ebene gilt die Ebene senkrecht zum Blick – der Zug wird räumlich */
    C.vp.view('iso', bb); await still();
    const arc = f.curves.find(c => c.type === 'arc3');
    const e0 = sketch3dEvt(M.pt3(f.points.find(p => p.id === arc.p2)));
    C.editor.onPointerDown(e0);
    C.editor.onPointerMove({ ...e0, clientY: e0.clientY - 60, buttons: 1 });
    C.editor.onPointerUp({ ...e0, clientY: e0.clientY - 60, buttons: 0 });
    await sleep(250);
    const hoch = M.pt3(f.points.find(p => p.id === arc.p2) || {});
    expect(Math.abs(hoch[1]) > 5, `gezogen: der Bogen verlässt die xz-Ebene (y = ${hoch[1].toFixed(1)})`);
    expect(!M.planeFromPoints(f.curves.flatMap(c => M.curvePoints3(f, c, M.pointMap(f), 24))), 'der Zug liegt in keiner Ebene mehr');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); await sleep(300);
    near((f.points.find(p => p.id === arc.p2) || {}).y, 0, 0.01, 'Rückgängig legt den Bogen wieder in die xz-Ebene');
    C.vp.view('front', bb); await still();
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig'); await sleep(300);
    expect(C.doc.features.length === 1 && C.doc.features[0].type === 'sketch' && !C.doc.features[0].plane, 'die 3D-Skizze sitzt im Baum');
    /* Profil: ohne Ebene gibt es keine Fläche */
    await cmd('solid:create', 'extrude');
    await waitFor(() => /3D-Skizze/.test((D.querySelector('#dialog .derr') || {}).textContent || ''), 8000, 'Hinweis: Profil braucht eine Ebene');
    expect(/Ebene/.test(q('#dialog .derr').textContent), 'der Hinweis nennt die Ebene, die fehlt');
    click('#dialog [data-cmd="cancel"]'); await sleep(300);
    /* Rohr entlang dem Zug: Querschnitt mal Pfadlänge */
    await cmd('solid:create', 'pipe');
    const sel = q('#dialog select[data-k="path"]');
    expect(sel.value === f.id, 'Rohr: die 3D-Skizze ist als Pfad gewählt');
    expect(/\(3D\)/.test(sel.options[sel.selectedIndex].textContent), 'die Skizze steht als „(3D)“ in der Liste');
    num('size', 16);
    const pid = C.editing.feature.id;
    await ok(20000);
    expect((C.lastBuild.mesh.bodies || []).length === 1, 'das Rohr ist ein Körper');
    const pm = M.pointMap(f);
    let L = 0;
    f.curves.forEach(c => {
      const p = M.curvePoints3(f, c, pm, 240);
      for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
    });
    const A = Math.PI / 4 * (16 * 16 - 12 * 12);
    near(await vol(pid) / (A * L), 1, 0.01, `Rohr = Querschnitt × Pfadlänge (${L.toFixed(1)} mm)`);
    const gb = await bbox(pid);
    expect(gb[1][2] > 75 && gb[0][2] < -45 && gb[1][0] > 45, 'das Rohr folgt dem Pfad bis in die Höhe');
    near(gb[0][1], -8, 0.01, 'der Zug in der xz-Ebene gibt ein Rohr mit halben ⌀16 in y');
    /* zweiter Teil: ein Kreis durch drei Punkte im Raum wird ein Ring */
    await cmd('solid:create', 'sketch3d');
    await waitFor(() => C.editor && C.editing, 4000, 'zweite 3D-Skizze');
    const g = C.editing.feature;
    if (C.editor.snapModel) { click('#dialog [data-opt="snap3d"]'); await sleep(120); }
    C.vp.view('iso', bb); await still();
    await tool('circle3');
    /* der erste Punkt liegt, wo der Zeiger steht – die beiden folgenden werden in der
       Ebene senkrecht zum Blick von ihm aus aufgetragen, sonst fallen sie auf eine andere Ebene */
    sketch3dClick([0, 0, 0]);
    const p1 = M.pt3(g.points[0] || {});
    const cam = C.vp.camera.position.clone().sub(C.vp.controls.target).normalize().toArray();
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
    const u = unit(cross(cam, [0, 0, 1])), v = cross(cam, u);
    const add = (a, b) => a.map((x, i) => x + b[i]);
    const p2 = add(p1, u.map(x => x * 80)), p3 = add(p1, v.map(x => x * 80));
    sketch3dClick(p2); sketch3dClick(p3);
    expect(g.curves.length === 1 && g.curves[0].type === 'circle3' && g.curves[0].closed, 'Kreis durch drei Punkte im Raum');
    expect(/geschlossener Zug/.test(q('#skstate').textContent), 'Status: ein geschlossener Zug');
    [p1, p2, p3].forEach((w, i) => { const p = g.points[i] || {}; near(p.x, w[0], 0.5, `Punkt ${i} in der Blickebene: x`); near(p.z, w[2], 0.5, `Punkt ${i} in der Blickebene: z`); });
    const gg = M.circum3(...g.points.map(p => M.pt3(p)));
    near(gg.r, 56.569, 0.5, 'der Kreis hat den erwartbaren Radius');
    expect(Math.abs(gg.n[0]) > 0.2 && Math.abs(gg.n[1]) > 0.2, 'seine Achse zeigt schräg durch den Raum');
    click('[data-cmd="sketch-finish"]'); await waitFor(() => !C.editor, 4000, 'Skizze fertig'); await sleep(300);
    await cmd('solid:create', 'pipe');
    expect(q('#dialog select[data-k="path"]').value === g.id, 'Ring: der räumliche Kreis ist als Pfad gewählt');
    num('size', 10);
    await seg('op', 'new');
    const rid = C.editing.feature.id;
    await ok(20000);
    const Ar = Math.PI / 4 * (10 * 10 - 6 * 6);
    near(await vol(rid) / (Ar * 2 * Math.PI * gg.r), 1, 0.01, `Ring = Querschnitt × Umfang (R = ${gg.r.toFixed(1)} mm)`);
  }],
  ['Körper durch einen Grundkörper ersetzen', async () => {
    await openExample('Treppenblock 100x30x40');
    const stufe = C.doc.features[3];
    near(await vol('e1'), 100 * 30 * 20 + 60 * 30 * 20, 1e-6, 'zuvor der Treppenblock (Sockel + Stufe)');
    /* Rechtsklick auf den Körper im Browser */
    q('#browser [data-body="e1"]').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));
    await sleep(150);
    const it = [...D.querySelectorAll('#ctxmenu button')].find(b => /Durch Grundkörper ersetzen|Replace with Primitive/.test(b.textContent));
    expect(!!it, 'Rechtsklick auf den Körper: Durch Grundkörper ersetzen');
    it.click();
    await waitFor(() => C.editing && C.editing.feature.type === 'primitive', 4000, 'Grundkörper-Dialog');
    /* Vorschlag: ein Quader in den Ausmaßen des Körpers, in der Ebene der bisherigen Skizze */
    expect(C.editing.index === 1 && C.editing.feature.id === 'e1', 'der Grundkörper steht an der Stelle des Sockels und behält den Körper');
    const val = k => Number(q(`#dialog input[data-k="${k}"]`).value);
    near(val('w'), 100, 1e-6, 'Quader in X so weit wie der Körper');
    near(val('l'), 30, 1e-6, 'Quader in Y so weit wie der Körper');
    near(val('h'), 40, 1e-6, 'Quader so hoch wie der Körper');
    near(val('cx'), 50, 1e-6, 'Mittelpunkt in der Skizzenebene');
    expect(/Ebene Fläche des Körpers|Planar face of the body/.test(q('#dialog .pref').textContent), 'Basisebene: die Ebene der bisherigen Skizze');
    await ok(20000);
    expect(C.doc.features.length === 4 && C.doc.features[1].type === 'primitive' && C.doc.features[1].id === 'e1', 'das Grundkörper-Feature steht in der Zeitleiste');
    expect(C.doc.features[3].id === stufe.id, 'die Stufe bleibt als Feature erhalten');
    near(await vol('e1'), 100 * 30 * 40, 1e-6, 'der Quader füllt den bisherigen Umriss – die Stufe liegt darin');
    const [lo1, hi1] = await bbox('e1');
    [lo1, hi1].forEach((p, i) => p.forEach((v, k) => near(v, [0, 0, 0, 100, 30, 40][3 * i + k], 1e-6, `Quader: Ecke ${i} Achse ${k}`)));
    /* noch einmal ersetzt: jetzt auf einen Zylinder – alle folgenden Features bauen sich daran neu auf */
    q('#browser [data-body="e1"]').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));
    await sleep(150);
    const it2 = [...D.querySelectorAll('#ctxmenu button')].find(b => /Durch Grundkörper ersetzen|Replace with Primitive/.test(b.textContent));
    expect(!!it2, 'auch ein Grundkörper lässt sich erneut ersetzen');
    it2.click();
    await waitFor(() => C.editing && C.editing.feature.type === 'primitive', 4000, 'Grundkörper-Dialog');
    await seg('kind', 'cylinder');
    num('d', 40); num('h', 40);
    await ok(20000);
    expect(C.doc.features[1].kind === 'cylinder', 'der Zylinder hat den Quader ersetzt');
    const [lo2, hi2] = await bbox('e1');
    [lo2, hi2].forEach((p, i) => p.forEach((v, k) => near(v, [30, -5, 0, 100, 35, 40][3 * i + k], 1e-6, `Zylinder ⌀40 mit Stufe: Ecke ${i} Achse ${k}`)));
    const v2 = await vol('e1');
    const zk = Math.PI * 20 * 20 * 40;
    expect(v2 > zk && v2 < zk + 60 * 30 * 20, `der Zylinder ⌀40 trägt die Stufe (${(v2 / 1000).toFixed(1)} cm³)`);
    expect(!(C.lastBuild.bodies || []).includes(stufe.id), 'die Stufe fügt sich in den Körper ein – es bleibt einer');
  }],
];


document.querySelector('#run').onclick = () => runSuite(SCENARIOS);
runSuite(SCENARIOS);
