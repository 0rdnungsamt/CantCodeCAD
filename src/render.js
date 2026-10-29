// Arbeitsbereich Rendern (im Fenster): physikalische Materialien je Werkstoff, Studio-Licht,
// Boden mit weichem Schatten. Fortschreitend: jedes Bild mit leicht versetzter Kamera und Lichtquelle wird in einen
// Gleitkomma-Puffer gemittelt (Kantenglättung + weiche Schatten), Tonwerte (ACES) erst bei der Anzeige.
// Licht und Szene: Richtung und Höhe der Sonne, Helligkeit, Umgebungslicht,
// Belichtung, Schattenweichheit und eigene Hintergrundfarbe (in cc.render gemerkt).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Oberflächen je Werkstoff (Farbe kommt vom Körper): Metallanteil, Rauheit, Klarlack */
const PBR = {
  none: { m: 0, r: 0.42, cc: 0.1 }, steel: { m: 1, r: 0.38 }, stainless: { m: 1, r: 0.2 }, alu: { m: 1, r: 0.3 },
  brass: { m: 1, r: 0.25 }, copper: { m: 1, r: 0.28 }, pla: { m: 0, r: 0.45, cc: 0.15 }, petg: { m: 0, r: 0.22, cc: 0.6 },
  abs: { m: 0, r: 0.55 }, tpu: { m: 0, r: 0.75 }, nylon: { m: 0, r: 0.85 }, wood: { m: 0, r: 0.7 }
};
const SCENES = {
  light: { label: 'Studio hell', bg: 0xe9edf1, env: 1.0, sun: 2.2, shadow: 0.32 },
  dark: { label: 'Studio dunkel', bg: 0x1d2228, env: 0.65, sun: 2.6, shadow: 0.55 },
  white: { label: 'Weiß (Katalog)', bg: 0xffffff, env: 1.1, sun: 1.8, shadow: 0.22 }
};
const MAX_SAMPLES = 256;

/* Radiance-HDR (.hdr, RGBE) lesen – eigener kleiner Leser, damit nichts nachgeladen werden muss. Zeilen flach (4 Byte je
   Bildpunkt) oder neu lauflängenkodiert (je Kanal: Zähler > 128 = Wiederholung, sonst so viele Einzelwerte).
   Ergebnis: { width, height, data: Float32Array RGBA } mit Wert = Mantisse · 2^(Exponent − 136). */
export function parseHDR(buf) {
  const b = new Uint8Array(buf);
  let p = 0;
  const zeile = () => { let s = ''; while (p < b.length && b[p] !== 10) s += String.fromCharCode(b[p++]); p++; return s; };
  const kopf = zeile();
  if (!/^#\?(RADIANCE|RGBE)/.test(kopf)) throw new Error('Keine Radiance-HDR-Datei');
  for (;;) { const z = zeile(); if (p >= b.length) throw new Error('HDR-Kopf unvollständig'); if (z === '') break; if (/^FORMAT=/.test(z) && !/32-bit_rle_rgbe/.test(z)) throw new Error('Nur RGBE-Bilder'); }
  const m = /^-Y (\d+) \+X (\d+)$/.exec(zeile().trim());
  if (!m) throw new Error('Nur HDR-Bilder mit Zeilen von oben nach unten (-Y … +X …)');
  const height = Number(m[1]), width = Number(m[2]), rgbe = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const o = y * width * 4;
    if (width >= 8 && width < 32768 && b[p] === 2 && b[p + 1] === 2 && !(b[p + 2] & 0x80)) {
      if (((b[p + 2] << 8) | b[p + 3]) !== width) throw new Error('HDR-Zeile beschädigt');
      p += 4;
      for (let k = 0; k < 4; k++) {
        let x = 0;
        while (x < width) {
          let n = b[p++];
          if (n > 128) { n -= 128; const v = b[p++]; for (let i = 0; i < n; i++) rgbe[o + (x++) * 4 + k] = v; }
          else for (let i = 0; i < n; i++) rgbe[o + (x++) * 4 + k] = b[p++];
        }
      }
    } else { rgbe.set(b.subarray(p, p + width * 4), o); p += width * 4; }
  }
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const e = rgbe[4 * i + 3], f = e ? Math.pow(2, e - 136) : 0;
    data[4 * i] = rgbe[4 * i] * f; data[4 * i + 1] = rgbe[4 * i + 1] * f; data[4 * i + 2] = rgbe[4 * i + 2] * f; data[4 * i + 3] = 1;
  }
  return { width, height, data };
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ctx: { getMesh, bodyLook(id) → { color, material }, getView() → { position, target, up, fov }, toast, download, fileName } */
export function createRender(ctx) {
  const LIGHT = { az: 239, el: 51, sun: 1, env: 1, exp: 1, soft: 0.06, bg: '', envRot: 0 };
  const st = { open: false, scene: 'light', ground: true, samples: 0, raf: 0, exporting: false, ...LIGHT };
  try { Object.assign(st, JSON.parse(localStorage.getItem('cc.render') || '{}'), { open: false, samples: 0, raf: 0, exporting: false }); } catch (_) { /* egal */ }
  const save = () => { try { localStorage.setItem('cc.render', JSON.stringify({ scene: st.scene, ground: st.ground, ...Object.fromEntries(Object.keys(LIGHT).map(k => [k, st[k]])) })); } catch (_) { /* egal */ } };
  const slider = (k, label, min, max, step, unit) => `<label class="row col"><span>${label} <b data-rv="${k}"></b>${unit}</span><input type="range" data-r="${k}" min="${min}" max="${max}" step="${step}"></label>`;
  let el, canvas, renderer, scene, camera, controls, sun, ground, model, envTex, acc = [], quadScene, quadCam, accMat, outMat, bounds;
  // eigenes Umgebungsbild (nur für diese Sitzung): Panorama, daraus die vorgefilterte Umgebung (PMREM)
  let pmrem, bild = null; // { name, tex, env }
  /* Aufkleber: im Dokument unter `aufkleber` [{ id, name, img (data-URL), p, n, w, rot }] – Bild flach auf
     der Fläche am Klickpunkt, Breite w in mm, Drehung rot in Grad um die Flächennormale */
  let decGroup = null, decTex = new Map(), decNeu = null; // decNeu: gewähltes Bild, wartet auf den Klick
  const aufkleber = () => (ctx.getDoc().aufkleber || []);
  function zeigeAufkleber() {
    if (!decGroup) return;
    decGroup.children.slice().forEach(m => { decGroup.remove(m); m.geometry.dispose(); m.material.dispose(); });
    for (const a of aufkleber()) {
      let t = decTex.get(a.id);
      if (!t) { t = new THREE.TextureLoader().load(a.img, () => reset()); t.colorSpace = THREE.SRGBColorSpace; decTex.set(a.id, t); }
      const verh = t.image && t.image.width ? t.image.height / t.image.width : (a.verh || 1);
      const mat = new THREE.MeshPhysicalMaterial({ map: t, transparent: true, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const n = new THREE.Vector3(...a.n).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      m.rotateZ((a.rot || 0) * Math.PI / 180);
      m.scale.set(a.w, a.w * verh, 1);
      m.position.set(...a.p).addScaledVector(n, Math.max(0.01, a.w * 1e-4));
      m.receiveShadow = true;
      m.userData.id = a.id;
      decGroup.add(m);
    }
    const l = el.querySelector('.rdeclist');
    l.innerHTML = aufkleber().map((a, i) => `<div class="rdec1"><b>${esc(a.name)}</b>
      <label class="row col"><span>Breite <b>${Math.round(a.w * 10) / 10}</b> mm</span><input type="range" min="1" max="${Math.max(50, Math.round(groesse() * 1.5))}" step="0.5" data-dec="w" data-i="${i}" value="${a.w}"></label>
      <label class="row col"><span>Winkel <b>${Math.round(a.rot || 0)}</b>°</span><input type="range" min="0" max="359" step="1" data-dec="rot" data-i="${i}" value="${a.rot || 0}"></label>
      <div class="btns"><button type="button" class="btn" data-dec="del" data-i="${i}">Aufkleber entfernen</button></div></div>`).join('');
    el.querySelector('.rdec').textContent = decNeu ? `„${decNeu.name}“ gewählt – jetzt auf eine Fläche klicken.` : (aufkleber().length ? '' : 'Noch kein Aufkleber.');
    reset();
  }
  const groesse = () => { if (!bounds) return 100; const s = bounds.getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z) || 100; };
  /* Strahl in den Bildpunkt (x, y in −1…1): Treffer am Modell → Punkt und Flächennormale (Weltlage) */
  function trefferBei(x, y) {
    if (!model) return null;
    // Lage der Kamera auch dann aktuell, wenn seit dem Öffnen noch kein Bild gezeichnet wurde
    camera.updateMatrixWorld(); model.updateMatrixWorld();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(x, y), camera);
    const h = rc.intersectObject(model, false)[0];
    if (!h || !h.face) return null;
    const n = h.face.normal.clone().transformDirection(model.matrixWorld);
    if (n.dot(rc.ray.direction) > 0) n.negate();
    return { p: h.point.toArray(), n: n.toArray() };
  }
  function setzeAufkleber(x, y) {
    if (!decNeu) return false;
    const h = trefferBei(x, y);
    if (!h) { ctx.toast('Kein Körper unter dem Zeiger – bitte auf eine Fläche klicken.'); return false; }
    const d = ctx.getDoc();
    d.aufkleber = [...(d.aufkleber || []), { id: Math.random().toString(36).slice(2, 9), name: decNeu.name, img: decNeu.img, p: h.p.map(v => +v.toFixed(4)), n: h.n.map(v => +v.toFixed(6)), w: Math.round(groesse() * 0.25), rot: 0 }];
    decNeu = null;
    ctx.store();
    zeigeAufkleber();
    return true;
  }
  async function ladeBild(datei) {
    let tex;
    if (/\.hdr$/i.test(datei.name)) {
      const h = parseHDR(await datei.arrayBuffer());
      tex = new THREE.DataTexture(h.data, h.width, h.height, THREE.RGBAFormat, THREE.FloatType);
      tex.flipY = false;
    } else {
      const url = URL.createObjectURL(datei), img = new Image();
      await new Promise((ok, fehl) => { img.onload = ok; img.onerror = () => fehl(new Error('Bild lässt sich nicht lesen')); img.src = url; });
      tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      URL.revokeObjectURL(url);
    }
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    entferneBild();
    bild = { name: datei.name, tex, env: pmrem.fromEquirectangular(tex).texture };
    applyScene(); reset();
  }
  function entferneBild() {
    if (!bild) return;
    bild.tex.dispose(); bild.env.dispose(); bild = null;
  }

  function init(host) {
    el = document.createElement('div');
    el.id = 'render'; el.className = 'renderws';
    el.innerHTML = `<canvas></canvas><div class="rpanel">
      <h3>Rendern</h3>
      <label class="row"><span>Umgebung</span><select data-r="scene">${Object.entries(SCENES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
      <label class="row"><span>Boden mit Schatten</span><input type="checkbox" data-r="ground"></label>
      <h3>Licht und Szene</h3>
      ${slider('az', 'Lichtrichtung', 0, 359, 1, '°')}${slider('el', 'Lichthöhe', 5, 90, 1, '°')}${slider('sun', 'Helligkeit', 0, 3, 0.05, '×')}
      ${slider('env', 'Umgebungslicht', 0, 2, 0.05, '×')}${slider('exp', 'Belichtung', 0.3, 2.5, 0.05, '×')}${slider('soft', 'Schattenweichheit', 0, 0.3, 0.01, '')}
      <label class="row"><span>Eigener Hintergrund</span><input type="checkbox" data-r="bgOn"><input type="color" data-r="bg" value="#e9edf1"></label>
      <h3>Umgebungsbild</h3>
      <p class="small">Eigenes Bild als Licht und Spiegelung: Panorama 2 : 1 als HDR, JPG oder PNG.</p>
      <input type="file" accept=".hdr,image/jpeg,image/png" data-r="envFile" style="width:100%">
      <p class="small rbild"></p>
      <label class="row"><span>Als Hintergrund zeigen</span><input type="checkbox" data-r="envBg"></label>
      ${slider('envRot', 'Bilddrehung', 0, 359, 1, '°')}
      <div class="btns"><button type="button" class="btn" data-r="envDel">Bild entfernen</button></div>
      <div class="btns"><button type="button" class="btn" data-r="lightReset">Licht zurücksetzen</button></div>
      <h3>Aufkleber</h3>
      <p class="small">Bild (PNG mit Transparenz oder JPG) wählen, dann auf eine Fläche des Modells klicken.</p>
      <input type="file" accept="image/png,image/jpeg" data-r="decFile" style="width:100%">
      <p class="small rdec"></p>
      <div class="rdeclist"></div>
      <div class="rprog"><div></div></div><p class="rinfo"></p>
      <h3>Bild speichern</h3>
      <div class="btns"><button type="button" class="btn" data-r="save" data-w="1920" data-h="1080">Full HD</button><button type="button" class="btn" data-r="save" data-w="3840" data-h="2160">4K</button><button type="button" class="btn" data-r="save" data-w="0" data-h="0">Wie Fenster</button></div>
      <p class="info small">Ziehen dreht, Mitte/Umschalt verschiebt, Rad zoomt. Bei jeder Bewegung beginnt das Bild neu und wird dann immer feiner. Material und Farbe kommen vom Körper (Browser → Rechtsklick → Material und Farbe).</p></div>`;
    host.appendChild(el);
    canvas = el.querySelector('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene();
    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controls.addEventListener('change', reset);
    sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 }));
    ground.receiveShadow = true;
    scene.add(ground);
    decGroup = new THREE.Group();
    scene.add(decGroup);
    // Aufkleber setzen: Klick ohne Ziehen (Ziehen dreht die Ansicht)
    let unten = null;
    canvas.addEventListener('pointerdown', e => { unten = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (!unten || !decNeu || Math.hypot(e.clientX - unten[0], e.clientY - unten[1]) > 4) return;
      const r = canvas.getBoundingClientRect();
      setzeAufkleber(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    // Mittelung: Ping-Pong zwischen zwei Gleitkomma-Puffern, Anzeige mit Tonwerten
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quadScene = new THREE.Scene();
    const vs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    accMat = new THREE.ShaderMaterial({ uniforms: { tPrev: { value: null }, tNew: { value: null }, w: { value: 1 } }, vertexShader: vs, depthTest: false, depthWrite: false, toneMapped: false,
      fragmentShader: 'uniform sampler2D tPrev; uniform sampler2D tNew; uniform float w; varying vec2 vUv; void main() { gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tNew, vUv), w); }' });
    outMat = new THREE.ShaderMaterial({ uniforms: { tAcc: { value: null } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D tAcc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tAcc, vUv);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accMat));
    el.addEventListener('change', e => {
      const k = e.target.dataset.r;
      if (k === 'scene') { st.scene = e.target.value; applyScene(); }
      if (k === 'ground') { st.ground = e.target.checked; applyScene(); }
      if (k === 'bgOn' || k === 'bg') { st.bg = el.querySelector('[data-r="bgOn"]').checked ? el.querySelector('[data-r="bg"]').value : ''; applyScene(); }
      if (k === 'envBg') { st.envBg = e.target.checked; applyScene(); }
      if (k === 'decFile' && e.target.files && e.target.files[0]) {
        const datei = e.target.files[0];
        if (datei.size > 3e6) ctx.toast('Das Bild ist größer als 3 MB – bitte verkleinern (es wird im Dokument gespeichert).');
        else { const fr = new FileReader(); fr.onload = () => { decNeu = { name: datei.name.replace(/\.(png|jpe?g)$/i, ''), img: String(fr.result) }; zeigeAufkleber(); }; fr.readAsDataURL(datei); }
        e.target.value = '';
      }
      if (k === 'envFile' && e.target.files && e.target.files[0]) {
        ladeBild(e.target.files[0]).catch(err => ctx.toast('Umgebungsbild: ' + err.message));
        e.target.value = '';
      }
      save(); reset();
    });
    el.addEventListener('input', e => {
      const dk = e.target.dataset.dec;
      if (dk === 'w' || dk === 'rot') {
        const a = aufkleber()[Number(e.target.dataset.i)];
        if (!a) return;
        a[dk] = Number(e.target.value);
        const m = decGroup.children.find(x => x.userData.id === a.id), b = e.target.previousElementSibling && e.target.previousElementSibling.querySelector('b');
        if (b) b.textContent = String(Math.round(a[dk] * 10) / 10);
        if (m) { const t = decTex.get(a.id), verh = t && t.image && t.image.width ? t.image.height / t.image.width : 1; m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...a.n).normalize()); m.rotateZ((a.rot || 0) * Math.PI / 180); m.scale.set(a.w, a.w * verh, 1); }
        reset();
        return;
      }
      const k = e.target.dataset.r;
      if (!(k in LIGHT) || k === 'bg') return;
      st[k] = Number(e.target.value);
      applyScene(); save(); reset();
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-r="save"]'); if (b) saveImage(Number(b.dataset.w), Number(b.dataset.h));
      if (e.target.closest('[data-r="lightReset"]')) { Object.assign(st, LIGHT); applyScene(); save(); reset(); }
      if (e.target.closest('[data-r="envDel"]')) { entferneBild(); applyScene(); reset(); }
      const del = e.target.closest('[data-dec="del"]');
      if (del) { const d = ctx.getDoc(), a = aufkleber()[Number(del.dataset.i)]; if (a) { d.aufkleber = aufkleber().filter(x => x !== a); decTex.delete(a.id); ctx.store(); zeigeAufkleber(); } }
    });
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('change', e => { if (e.target.dataset.dec === 'w' || e.target.dataset.dec === 'rot') { ctx.store(); zeigeAufkleber(); } });
    new ResizeObserver(() => { if (st.open) resize(); }).observe(el);
  }

  function makeTargets(w, h) {
    acc.forEach(t => t.dispose());
    const o = { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    acc = [new THREE.WebGLRenderTarget(w, h, o), new THREE.WebGLRenderTarget(w, h, o), new THREE.WebGLRenderTarget(w, h, o)]; // Bild, Mittel A, Mittel B
  }
  function resize() {
    const r = canvas.getBoundingClientRect(), pr = renderer.getPixelRatio();
    if (r.width < 2 || r.height < 2) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    makeTargets(Math.round(r.width * pr), Math.round(r.height * pr));
    reset();
  }
  function reset() { st.samples = 0; if (st.open && !st.raf && !st.exporting) st.raf = requestAnimationFrame(frame); }

  /* Modell aus dem Anzeigenetz der Konstruktion, Material je Körper */
  function buildModel() {
    if (model) { scene.remove(model); model.geometry.dispose(); (Array.isArray(model.material) ? model.material : [model.material]).forEach(m => m.dispose()); model = null; }
    const m = ctx.getMesh();
    if (!m) return false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    const mats = (m.bodies || []).map((b, i) => {
      geo.addGroup(b.tris[0], b.tris[1] - b.tris[0], i);
      const look = ctx.bodyLook(b.id), p = PBR[look.material] || PBR.none;
      return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(look.color), metalness: p.m, roughness: p.r, clearcoat: p.cc || 0, clearcoatRoughness: 0.2, envMapIntensity: 1 });
    });
    model = new THREE.Mesh(geo, mats.length ? mats : new THREE.MeshPhysicalMaterial({ color: 0xc7cfd8, roughness: 0.4 }));
    model.castShadow = true; model.receiveShadow = true;
    scene.add(model);
    geo.computeBoundingBox();
    bounds = geo.boundingBox.clone();
    return true;
  }
  function applyScene() {
    const S = SCENES[st.scene] || SCENES.light;
    scene.background = bild && st.envBg ? bild.tex : new THREE.Color(st.bg || S.bg);
    scene.environment = bild ? bild.env : envTex;
    // Panoramen sind Y-oben gedacht, das Modell Z-oben: erst um X kippen, dann um die Hochachse drehen (three.js
    // dreht die Blickrichtung mit den negierten Winkeln, daher +90°)
    scene.environmentRotation.set(Math.PI / 2, (st.envRot || 0) * Math.PI / 180, 0, 'YXZ');
    scene.backgroundRotation.copy(scene.environmentRotation);
    el.querySelector('.rbild').textContent = bild ? `Umgebungsbild: ${bild.name}` : 'Kein eigenes Bild – Studio-Umgebung.';
    el.querySelector('[data-r="envBg"]').checked = !!st.envBg;
    scene.environmentIntensity = S.env * st.env;
    sun.intensity = S.sun * st.sun;
    renderer.toneMappingExposure = st.exp;
    Object.keys(LIGHT).forEach(k => {
      const inp = el.querySelector(`input[type=range][data-r="${k}"]`), out = el.querySelector(`[data-rv="${k}"]`);
      if (inp) inp.value = st[k];
      if (out) out.textContent = String(+(+st[k]).toFixed(2)).replace('.', ',');
    });
    el.querySelector('[data-r="bgOn"]').checked = !!st.bg;
    if (st.bg) el.querySelector('[data-r="bg"]').value = st.bg;
    ground.visible = !!st.ground;
    ground.material.opacity = S.shadow;
    el.querySelector('[data-r="scene"]').value = st.scene;
    el.querySelector('[data-r="ground"]').checked = !!st.ground;
    if (!bounds) return;
    const c = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), R = Math.max(size.x, size.y, size.z) || 100;
    ground.scale.set(R * 20, R * 20, 1);
    ground.position.set(c.x, c.y, bounds.min.z - R * 0.002);
    sun.target.position.copy(c);
    const sc = sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = R * 8;
    sc.updateProjectionMatrix();
  }
  /* Licht schräg von vorn oben links, je Bild leicht versetzt (weicher Schatten) */
  function placeSun(jitter) {
    if (!bounds) return;
    const c = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), R = Math.max(size.x, size.y, size.z) || 100;
    const az = st.az * Math.PI / 180, elv = st.el * Math.PI / 180;
    const d = new THREE.Vector3(Math.cos(elv) * Math.cos(az), Math.cos(elv) * Math.sin(az), Math.sin(elv)).normalize();
    if (jitter) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * st.soft; const u = new THREE.Vector3(1, 0, 0).cross(d).normalize(), v = d.clone().cross(u); d.addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize(); }
    sun.position.copy(c).addScaledVector(d, R * 3);
  }

  function frame() {
    st.raf = 0;
    if (!st.open || st.exporting || !acc.length) return;
    renderSample(acc[0].width, acc[0].height);
    present();
    info();
    if (st.samples < MAX_SAMPLES) st.raf = requestAnimationFrame(frame);
  }
  /* ein Bild mit Versatz rendern und in den Mittelwert einrechnen */
  function renderSample(w, h) {
    const n = st.samples;
    placeSun(n > 0);
    if (n > 0) camera.setViewOffset(w, h, Math.random() - 0.5, Math.random() - 0.5, w, h); else camera.clearViewOffset();
    renderer.setRenderTarget(acc[0]);
    renderer.render(scene, camera);
    camera.clearViewOffset();
    const src = acc[1 + (n % 2)], dst = acc[1 + ((n + 1) % 2)];
    accMat.uniforms.tPrev.value = src.texture; accMat.uniforms.tNew.value = acc[0].texture; accMat.uniforms.w.value = 1 / (n + 1);
    quadScene.children[0].material = accMat;
    renderer.setRenderTarget(dst);
    renderer.render(quadScene, quadCam);
    st.samples = n + 1;
    st.cur = dst;
  }
  function present() {
    outMat.uniforms.tAcc.value = st.cur.texture;
    quadScene.children[0].material = outMat;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }
  function info() {
    const p = Math.min(1, st.samples / MAX_SAMPLES);
    el.querySelector('.rprog > div').style.width = `${p * 100}%`;
    el.querySelector('.rinfo').textContent = st.samples >= MAX_SAMPLES ? `Fertig · ${MAX_SAMPLES} Durchgänge` : `Durchgang ${st.samples} von ${MAX_SAMPLES}`;
  }

  /* Bild in fester Auflösung: unsichtbar mitteln, dann als PNG speichern */
  async function saveImage(w, h) {
    if (st.exporting) return;
    const r = canvas.getBoundingClientRect();
    if (!w) { const pr = renderer.getPixelRatio(); w = Math.round(r.width * pr); h = Math.round(r.height * pr); }
    st.exporting = true;
    cancelAnimationFrame(st.raf); st.raf = 0;
    const btns = el.querySelectorAll('[data-r="save"]'); btns.forEach(b => { b.disabled = true; });
    const oldPR = renderer.getPixelRatio(), oldAspect = camera.aspect;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      makeTargets(w, h);
      st.samples = 0;
      const N = 96;
      for (let i = 0; i < N; i++) {
        renderSample(w, h);
        if (i % 8 === 7) { el.querySelector('.rinfo').textContent = `Bild ${w} × ${h}: ${i + 1} von ${N} Durchgängen …`; await new Promise(res => setTimeout(res, 0)); }
      }
      present();
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (blob) ctx.download(`${ctx.fileName()}-Rendering-${w}x${h}.png`, blob);
    } catch (err) { ctx.toast('Bild nicht möglich: ' + err.message); }
    renderer.setPixelRatio(oldPR);
    camera.aspect = oldAspect;
    st.exporting = false;
    btns.forEach(b => { b.disabled = false; });
    resize();
  }

  return {
    get isOpen() { return st.open; },
    get umgebungsbild() { return bild ? bild.name : null; },
    // für die Umgebungs-Map-Analyse: Panorama, Lage der ersten Zeile, Drehung, HDR ja/nein
    get umgebungsTextur() { return bild ? { tex: bild.tex, oben: !!bild.tex.isDataTexture, dreh: st.envRot || 0, hdr: !!bild.tex.isDataTexture } : null; },
    get szene() { return scene; },
    parseHDR,
    get samples() { return st.samples; },
    // für die Prüfstände: Bild wählen und an einem Bildpunkt (−1…1) aufkleben wie mit Datei + Klick
    aufkleberTest(name, img, x, y) { decNeu = { name, img }; return setzeAufkleber(x, y); },
    get aufkleberMeshes() { return decGroup ? decGroup.children.length : 0; },
    // Bildpunkt (−1…1) eines Raumpunkts in der Render-Kamera
    bildpunkt(p) { camera.updateMatrixWorld(); const v = new THREE.Vector3(...p).project(camera); return [v.x, v.y]; },
    open(host) {
      if (!el) init(host);
      st.open = true;
      el.hidden = false;
      if (!buildModel()) { ctx.toast('Es gibt keinen sichtbaren Körper zum Rendern.'); }
      zeigeAufkleber();
      const v = ctx.getView();
      camera.position.fromArray(v.position); camera.up.fromArray(v.up); camera.fov = v.fov || 35;
      controls.target.fromArray(v.target);
      camera.near = Math.max(0.05, camera.position.distanceTo(controls.target) / 500); camera.far = camera.position.distanceTo(controls.target) * 50;
      camera.updateProjectionMatrix();
      controls.update();
      applyScene();
      resize();
    },
    close() { st.open = false; cancelAnimationFrame(st.raf); st.raf = 0; if (el) el.hidden = true; }
  };
}
