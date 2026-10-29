// 3D-Ansicht: Darstellung des Körpers, Auswahl von Flächen und Kanten,
// Skizzieren auf einer Ebene und der Ansichtswürfel.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { ORIGIN_PLANES, toWorld, toLocal } from './doc.js';
import { pointMap, curvePolyline, curvePoints3 } from './sketch/model.js';
import { loadFont, textOutline, placeText, bindTextPaths } from './sketch/text.js';
import { t, DEC } from './i18n.js';
import { punktMaterial } from './punkte.js';

const C = {
  body: 0xc7cfd8, edge: 0x1d232a, hover: 0x8db8ff, sel: 0x2563eb, selFace: 0x5b8def,
  sketch: 0x2563eb, sketchIdle: 0x52606f, rubber: 0xe06c1f, point: 0x2563eb,
  axisX: 0xd2443b, axisY: 0x3b9a4a, axisZ: 0x3a6bd6, plane: 0x2563eb, wplane: 0xd9822b,
  grid: 0xb7c0ca, gridMajor: 0x98a3ae
};
/* Achsenfarben des Benutzerkoordinatensystems – dieselben wie die Achsen des Ansichtswürfels */
const TAGCOL = { X: C.axisX, Y: C.axisY, Z: C.axisZ };

export const VIEWS = {
  front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0],
  top: [0, -0.0001, 1], bottom: [0, -0.0001, -1], iso: [1, -1.15, 0.85]
};

const nice = x => {
  const p = 10 ** Math.floor(Math.log10(x)), m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
};
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);

/* Treffer eines Strahls auf einem Dreieck (Möller–Trumbore), t = Abstand
   entlang des Strahls, -1 wenn kein Treffer. Getestet wird wie beim Netz des
   Kernels über Indizes, damit keine Kopie des Netzes nötig ist. */
function triHit(ray, pos, ia, ib, ic) {
  const o = ray.origin, d = ray.direction;
  const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
  const e1x = pos[ib * 3] - ax, e1y = pos[ib * 3 + 1] - ay, e1z = pos[ib * 3 + 2] - az;
  const e2x = pos[ic * 3] - ax, e2y = pos[ic * 3 + 1] - ay, e2z = pos[ic * 3 + 2] - az;
  const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tx = o.x - ax, ty = o.y - ay, tz = o.z - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-9 ? t : -1;
}

/* Kürzeste Entfernung von Strahl und Streckenmitte: wie das Nachschlagen einer
   Kante in three.js (params.Line.threshold), aber ohne alle Kanten zu prüfen.
   Gibt den Abstand entlang des Strahls zurück, -1 wenn zu weit entfernt. */
function segHit(ray, pos, ia, ib, thr) {
  const o = ray.origin, d = ray.direction;
  const px = pos[ia * 3], py = pos[ia * 3 + 1], pz = pos[ia * 3 + 2];
  const ex = pos[ib * 3] - px, ey = pos[ib * 3 + 1] - py, ez = pos[ib * 3 + 2] - pz;
  const a = ex * ex + ey * ey + ez * ez;
  if (a < 1e-12) return -1;
  const b = d.x * ex + d.y * ey + d.z * ez;
  const wx = o.x - px, wy = o.y - py, wz = o.z - pz;
  const D = d.x * wx + d.y * wy + d.z * wz, E = ex * wx + ey * wy + ez * wz;
  const den = a - b * b;
  let s = den < 1e-12 ? (Math.abs(b) < 1e-9 ? 0 : -D / b) : (E - b * D) / den;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const t = s * b - D;
  if (t < 0) return -1;
  const cx = wx + t * d.x - s * ex, cy = wy + t * d.y - s * ey, cz = wz + t * d.z - s * ez;
  return cx * cx + cy * cy + cz * cz <= thr * thr ? t : -1;
}

/* Kürzeste Verbindung von Strahl und Strecke: schreibt den Punkt auf der Strecke
   in out und gibt die Entfernung zum Strahl zurück. Wie segHit, aber ohne
   Schwelle – gesucht wird der nächste Punkt, nicht ein Treffer. */
function segNear(ray, pos, ia, ib, out) {
  const o = ray.origin, d = ray.direction;
  const px = pos[ia * 3], py = pos[ia * 3 + 1], pz = pos[ia * 3 + 2];
  const ex = pos[ib * 3] - px, ey = pos[ib * 3 + 1] - py, ez = pos[ib * 3 + 2] - pz;
  const a = ex * ex + ey * ey + ez * ez;
  if (a < 1e-12) {
    out.set(px, py, pz);
    const wx = o.x - px, wy = o.y - py, wz = o.z - pz;
    const t = Math.max(0, d.x * wx + d.y * wy + d.z * wz);
    return Math.hypot(wx - t * d.x, wy - t * d.y, wz - t * d.z);
  }
  const b = d.x * ex + d.y * ey + d.z * ez;
  const wx = o.x - px, wy = o.y - py, wz = o.z - pz;
  const D = d.x * wx + d.y * wy + d.z * wz, E = ex * wx + ey * wy + ez * wz;
  const den = a - b * b;
  let s = den < 1e-12 ? (Math.abs(b) < 1e-9 ? 0 : -D / b) : (E - b * D) / den;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  let t = s * b - D;
  if (t < 0) { t = 0; s = E / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
  out.set(px + s * ex, py + s * ey, pz + s * ez);
  return Math.hypot(wx + t * d.x - s * ex, wy + t * d.y - s * ey, wz + t * d.z - s * ez);
}
const fmt = x => {
  const r = Math.round(x * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString().replace('.', DEC);
};

/* Achsbuchstabe als Textur: farbig mit hellem Rand, damit er auf Raster und Modell lesbar bleibt */
function achsBuchstabe(ch, farbe) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeText(ch, 32, 34);
  g.fillStyle = '#' + new THREE.Color(farbe).getHexString(); g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Bedienschemata (Einstellungen → Allgemein → Bedienung), Namen Einstellung „Tastenkürzel für Schwenken, Zoomen, Orbit“
export const NAV_SCHEMES = ['standard', 'mitte', 'ftasten', 'rechts', 'altumschalt', 'mitteumschalt'];
export class Viewport {
  constructor(el, cb = {}) {
    this.el = el;
    this.cb = cb;
    this.canvas = el.querySelector('#cv');
    this.overlay = el.querySelector('#overlay');
    this.cubeCanvas = el.querySelector('#viewcube');
    this.pickMode = 'none';
    this.hover = null;
    this.pendingHover = null;
    this.selection = { faces: [], edges: [] };
    this.sketchHandler = null;
    this.model = null;
    this.lineMats = [];
    this.anim = null;

    this.dirty = true;
    this.frameTimes = [];
    this.lastFps = null;
    this.lastFpsReport = 0;
    // Große Baugruppen sollen beim ersten Navigieren nicht erst die GPU aus
    // dem Sparmodus wecken. Während der Eingabe wird kurz kontinuierlich und
    // mit reduzierter Qualität gezeichnet; danach kehrt die volle Qualität
    // zurück.
    this.activeRenderUntil = 0;
    this.interactionQuality = false;
    this.lastWarmFrame = 0;
    // 12 fps reichen bei manchen NVIDIA-/Windows-Kombinationen nicht aus,
    // um den hohen Leistungszustand zu halten. Große Baugruppen bleiben daher
    // bewusst mit Monitorfrequenz aktiv; das verhindert das Anlauf-Ruckeln.
    this.warmFps = 60;
    /* Warmzeichnen nur in einem Zeitfenster nach der letzten Bedienung (siehe loop): dauerhaft 60 B/s hielten
       GPU und Lüfter auch im Leerlauf auf Trab. Länger als eine Denkpause, kürzer als „weggegangen“. */
    this.warmMs = 15000;
    this.lastInput = 0;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    r.localClippingEnabled = true;
    r.setPixelRatio(this.pixelRatio);
    r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 0.35));

    this.camera = this.perspCam = new THREE.PerspectiveCamera(30, 1, 0.1, 1e6);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(220, -260, 190);
    // Orthografisch: Bildgröße aus dem Abstand zum Drehpunkt wie bei der
    // Perspektive – Einpassen, ViewCube und worldPerPixel bleiben gleich; negatives near, damit nichts abgeschnitten wird
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e6);
    this.orthoCam.up.set(0, 0, 1);

    const ctl = this.controls = new OrbitControls(this.camera, this.canvas);
    ctl.addEventListener('change', () => { if (this.camera === this.orthoCam) this.updateOrtho(); });
    // Mitte verschiebt, Umschalt+Mitte dreht (macht OrbitControls bei PAN + Umschalt selbst), rechts = Markierungsmenü
    ctl.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
    this.navTool = null;
    this.navScheme = 'standard';
    this.visualStyle = 'shadedEdges';
    ctl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    // Kein Nachlaufen: die Ansicht folgt der Maus direkt.
    ctl.enableDamping = false;
    ctl.zoomToCursor = true;
    ctl.screenSpacePanning = true;
    ctl.rotateSpeed = 1.0;
    ctl.zoomSpeed = 1.2;
    ctl.addEventListener('start', () => { this.anim = null; this.wakeRenderer(); });
    ctl.addEventListener('change', () => { this.wakeRenderer(); });
    // Drehen um die Mitte der Körper (nicht um den Zielpunkt von OrbitControls, der beim Zoomen zur Maus
    // und beim Verschieben mitwandert): eigene Drehung, OrbitControls nur noch für Verschieben und Zoomen
    ctl.enableRotate = false;
    this.initOrbit();

    this.mats = {
      body: new THREE.MeshStandardMaterial({ color: C.body, metalness: 0.18, roughness: 0.42, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
      edge: new THREE.LineBasicMaterial({ color: C.edge }),
      faceHover: new THREE.MeshBasicMaterial({ color: C.hover, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      faceSel: new THREE.MeshBasicMaterial({ color: C.selFace, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      plane: new THREE.MeshBasicMaterial({ color: C.plane, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
      planeHover: new THREE.MeshBasicMaterial({ color: C.plane, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
      wplane: new THREE.MeshBasicMaterial({ color: C.wplane, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      wplaneHover: new THREE.MeshBasicMaterial({ color: C.wplane, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
    };

    this.world = new THREE.Group();
    this.modelG = new THREE.Group();
    this.hlG = new THREE.Group();
    this.sketchG = new THREE.Group();
    this.activeG = new THREE.Group();
    this.planesG = new THREE.Group();
    this.canvasG = new THREE.Group();
    this.wplanesG = new THREE.Group();
    this.waxesG = new THREE.Group();
    this.wpointsG = new THREE.Group();
    this.workPlanes = [];
    this.workAxes = [];
    this.scene.add(this.world, this.modelG, this.hlG, this.sketchG, this.activeG, this.planesG, this.wplanesG, this.waxesG, this.wpointsG);
    this.planesG.visible = false;

    this.buildGrid(200);
    this.buildOriginPlanes(60);
    this.initCube();
    this.initEvents();

    this.ray = new THREE.Raycaster();
    /* Orthografisch beginnt der Strahl von three.js in der Kameraebene. Die Kamera rückt beim Zoomen bis an den
       Zielpunkt, und der liegt oft im Körper: die sichtbare Fläche davor (negatives near) wäre dann nicht mehr
       anklickbar, der Strahl träfe die Rückseite. Deshalb beginnt er an der near-Ebene – anklickbar ist, was man sieht. */
    const fromCam = this.ray.setFromCamera.bind(this.ray);
    this.ray.setFromCamera = (coords, cam) => {
      fromCam(coords, cam);
      if (cam.isOrthographicCamera) this.ray.ray.origin.addScaledVector(this.ray.ray.direction, cam.near);
    };

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.loop();
  }

  /* ---------- Grundgerüst ---------- */
  lineMat(color, width = 2, extra = {}) {
    const m = new LineMaterial({ color, linewidth: width, ...extra });
    m.resolution.set(this.el.clientWidth || 1, this.el.clientHeight || 1);
    this.lineMats.push(m);
    return m;
  }
  fatLines(positions, color, width = 2, extra = {}) {
    const g = new LineSegmentsGeometry();
    g.setPositions(positions);
    const l = new LineSegments2(g, this.lineMat(color, width, extra));
    l.computeLineDistances();
    return l;
  }
  disposeGroup(g) {
    this.dirty = true;
    while (g.children.length) {
      const o = g.children[g.children.length - 1];
      g.remove(o);
      o.traverse(n => {
        if (n.geometry && !n.userData.sharedGeo) n.geometry.dispose();
        if (n.material && n.material.isLineMaterial) {
          this.lineMats = this.lineMats.filter(m => m !== n.material);
          n.material.dispose();
        }
      });
    }
  }

  /* Perspektivisch ↔ Orthografisch; Lage und Blickrichtung bleiben */
  setProjection(mode) {
    const to = mode === 'ortho' ? this.orthoCam : this.perspCam;
    if (to === this.camera) return;
    to.position.copy(this.camera.position);
    to.quaternion.copy(this.camera.quaternion);
    to.up.copy(this.camera.up);
    to.zoom = 1;
    this.camera = to;
    this.controls.object = to;
    this.updateOrtho();
    to.updateProjectionMatrix();
    this.controls.update();
    this.dirty = true;
  }
  get projection() { return this.camera === this.orthoCam ? 'ortho' : 'persp'; }
  updateOrtho() {
    const c = this.orthoCam;
    if (this.camera !== c) return;
    // Mausrad-Zoom (bei orthografischer Kamera über zoom) in Abstand umrechnen, damit alles andere gleich rechnet
    if (Math.abs(c.zoom - 1) > 1e-9) {
      const t = this.controls.target, d = c.position.distanceTo(t) / c.zoom;
      c.position.sub(t).setLength(Math.max(d, 1e-3)).add(t);
      c.zoom = 1;
    }
    const d = c.position.distanceTo(this.controls.target), h = d * Math.tan(THREE.MathUtils.degToRad(this.perspCam.fov) / 2), a = this.perspCam.aspect || 1;
    c.left = -h * a; c.right = h * a; c.top = h; c.bottom = -h;
    c.updateProjectionMatrix();
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
    this.updateOrtho();
    this.lineMats.forEach(m => m.resolution.set(w, h));
    this.dirty = true;
  }

  /* Kanten sichtbar: nur Stil und Vorschau bestimmen das. Beim Navigieren großer
     Baugruppen bleiben die Kanten an – sie gehören zum Bild eines Körpers, und
     ihr Fehlen wirkt wie ein Aussetzer. Eine Stelle, damit ein Umschalten das
     andere nicht zurücksetzt. */
  applyEdgesVisible() {
    if (!this.model) return;
    this.model.edges.visible = this.visualStyle !== 'shaded' && !this.previewG;
  }
  /* Große Baugruppe: viele Körper oder ein sehr feines Netz. Ab hier halten
     durchgehendes Zeichnen und vereinfachte Bildqualität die Ansicht flüssig. */
  isLargeAssembly() {
    const d = this.model && this.model.data;
    if (!d) return false;
    if (d.bodies && d.bodies.length >= 80) return true;
    return !!d.index && d.index.length / 3 >= 100000;
  }
  setInteractionQuality(on) {
    if (this.interactionQuality === on) return;
    this.interactionQuality = on;
    // 1× Pixel während des Navigierens: die visuelle Vereinfachung ist fast
    // unsichtbar, reduziert aber die Fillrate bei mehreren hundert STEP-Körpern
    // erheblich. Die Kanten bleiben an – eine Ansicht ohne Kanten beim Drehen
    // oder Zoomen liest sich wie ein Ruckeln.
    this.renderer.setPixelRatio(on ? 1 : this.pixelRatio);
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (w && h) this.renderer.setSize(w, h, false);
    this.dirty = true;
  }
  wakeRenderer(ms = 850) {
    this.lastInput = performance.now();
    this.activeRenderUntil = Math.max(this.activeRenderUntil, performance.now() + ms);
    if (this.isLargeAssembly()) this.setInteractionQuality(true);
    this.dirty = true;
  }

  /* Gezeichnet wird nur, wenn sich etwas geändert hat. */
  loop() {
    requestAnimationFrame(() => this.loop());
    if (this.anim) { this.stepAnim(); this.dirty = true; }
    if (this.controls.update()) this.dirty = true;
    if (this.camera === this.orthoCam) this.updateOrtho();
    const now = performance.now();
    if (this.pendingHover) { const e = this.pendingHover; this.pendingHover = null; this.updateHover(e); }
    if (now < this.activeRenderUntil) this.dirty = true;
    else if (this.interactionQuality) this.setInteractionQuality(false);
    // Bei einer großen STEP-Baugruppe darf der Treiber nicht nach jeder
    // Mausbewegung in den tiefen Sparzustand wechseln. Die Monitorfrequenz
    // hält WebGL und die GPU bereit und verhindert das Anlauf-Ruckeln.
    // Schwelle 0,9 × Bildabstand: bei 60 Hz liegt der rAF-Abstand sonst genau auf der Grenze und jedes zweite Bild fiele aus
    if (this.isLargeAssembly() && now - this.lastInput < this.warmMs && now - this.lastWarmFrame >= 900 / this.warmFps) this.dirty = true;
    if (now - (this.lastFpsReport || 0) > 500) this.reportFps(now);
    if (!this.dirty) return;
    this.dirty = false;
    if (this.manip) this.scaleManip();
    if (this.triadG) this.triadG.scale.setScalar(this.worldPerPixel() * 72);
    this.renderer.render(this.scene, this.camera);
    this.lastWarmFrame = now;
    this.renderCube();
    if (this.sketchHandler) this.sketchHandler.onFrame();
    this.frameTimes.push(now);
  }

  reportFps(now) {
    this.lastFpsReport = now;
    this.frameTimes = this.frameTimes.filter(t => now - t < 1000);
    const fps = this.frameTimes.length >= 4 ? this.frameTimes.length : null;
    if (fps !== this.lastFps && this.cb.onFps) this.cb.onFps(fps);
    this.lastFps = fps;
  }

  /* Mittlere Zeit für ein Bild in ms, inklusive Warten auf die Grafikkarte */
  benchmark(n = 30) {
    const gl = this.renderer.getContext(), px = new Uint8Array(4);
    this.renderer.render(this.scene, this.camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      this.renderer.render(this.scene, this.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    this.dirty = true;
    return (performance.now() - t0) / n;
  }

  gpuName() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const m = /ANGLE \([^,]+,\s*([^(,]+?)\s*(\(|,|Direct3D|$)/.exec(raw);
      return { raw, short: (m ? m[1] : raw).trim(), software: /SwiftShader|llvmpipe|Basic Render|Software/i.test(raw) };
    } catch (_) { return { raw: '', short: 'unbekannt', software: false }; }
  }

  worldPerPixel() {
    const d = this.camera.position.distanceTo(this.controls.target);
    return 2 * d * Math.tan(THREE.MathUtils.degToRad(this.perspCam.fov) / 2) / (this.el.clientHeight || 1);
  }

  /* ---------- Raster und Ursprung ---------- */
  buildGrid(size) {
    this.disposeGroup(this.world);
    const step = nice(size / 20), major = step * 5;
    const half = Math.ceil(size / major) * major;
    const minor = [], maj = [];
    for (let v = -half; v <= half + 1e-9; v += step) {
      const arr = Math.abs(v / major - Math.round(v / major)) < 1e-6 ? maj : minor;
      if (Math.abs(v) < 1e-9) continue;
      arr.push(-half, v, 0, half, v, 0, v, -half, 0, v, half, 0);
    }
    const mk = (arr, color, op) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
      l.renderOrder = -2;
      return l;
    };
    this.world.add(mk(minor, C.grid, 0.55), mk(maj, C.gridMajor, 0.7));
    const ax = half;
    const axes = new THREE.BufferGeometry();
    axes.setAttribute('position', new THREE.Float32BufferAttribute([-ax, 0, 0, ax, 0, 0, 0, -ax, 0, 0, ax, 0, 0, 0, 0, 0, 0, ax * 0.6], 3));
    const cx = new THREE.Color(C.axisX), cy = new THREE.Color(C.axisY), cz = new THREE.Color(C.axisZ);
    axes.setAttribute('color', new THREE.Float32BufferAttribute([...cx.toArray(), ...cx.toArray(), ...cy.toArray(), ...cy.toArray(), ...cz.toArray(), ...cz.toArray()], 3));
    const al = new THREE.LineSegments(axes, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
    al.renderOrder = -1;
    this.world.add(al);
    // Buchstaben an den Achsenenden (feste Bildschirmgröße), in der Farbe der Achse
    [['X', [ax, 0, 0], C.axisX], ['Y', [0, ax, 0], C.axisY], ['Z', [0, 0, ax * 0.6], C.axisZ]].forEach(([ch, p, col]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: achsBuchstabe(ch, col), depthTest: false, sizeAttenuation: false, transparent: true }));
      sp.scale.set(0.03, 0.03, 1); sp.renderOrder = 6; sp.position.set(...p);
      this.world.add(sp);
    });
    this.gridSize = size;
  }

  buildOriginPlanes(size) {
    this.disposeGroup(this.planesG);
    Object.values(ORIGIN_PLANES).forEach(pl => {
      const g = new THREE.PlaneGeometry(size, size);
      const m = new THREE.Mesh(g, this.mats.plane);
      const basis = new THREE.Matrix4().makeBasis(v3(pl.x), v3(pl.y), v3(pl.n));
      m.quaternion.setFromRotationMatrix(basis);
      m.position.set(size / 2 * (pl.x[0] + pl.y[0]), size / 2 * (pl.x[1] + pl.y[1]), size / 2 * (pl.x[2] + pl.y[2]));
      m.userData.plane = pl;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: C.plane, transparent: true, opacity: 0.6 }));
      m.add(edge);
      this.planesG.add(m);
    });
  }

  /* ---------- Arbeitsebenen: list = [{ id, name, plane, active }] ---------- */
  setWorkPlanes(list) {
    this.workPlanes = list || [];
    this.buildWorkPlanes();
  }
  buildWorkPlanes() {
    this.disposeGroup(this.wplanesG);
    const size = Math.max(30, (this.gridSize || 200) * 0.22);
    this.workPlanes.forEach(w => {
      const pl = w.plane;
      const g = new THREE.PlaneGeometry(size, size);
      const m = new THREE.Mesh(g, this.mats.wplane);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(pl.x), v3(pl.y), v3(pl.n)));
      m.position.set(pl.o[0], pl.o[1], pl.o[2]);
      m.userData.wp = w;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: C.wplane, transparent: true, opacity: w.active ? 1 : 0.75 }));
      m.add(edge);
      this.wplanesG.add(m);
    });
    this.dirty = true;
  }
  /* Ansichtsbereiche (Bild als Vorlage): list = [{ id, plane, img, w, h, cx, cy, rot, opacity }].
     Halbtransparente Bildfläche in der Ebene, nicht anklickbar; Texturen werden je Bild nur einmal geladen. */
  setCanvases(list) {
    this.canvases = list || [];
    if (!this.canvasG.parent) this.scene.add(this.canvasG);
    this.texCache = this.texCache || new Map();
    this.disposeGroup(this.canvasG);
    this.canvases.forEach(c => {
      let tex = this.texCache.get(c.img);
      if (!tex) { tex = new THREE.TextureLoader().load(c.img, () => { this.dirty = true; }); tex.colorSpace = THREE.SRGBColorSpace; this.texCache.set(c.img, tex); }
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: c.opacity, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w, c.h), mat), pl = c.plane;
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(pl.x), v3(pl.y), v3(pl.n)));
      m.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (c.rot || 0) * Math.PI / 180));
      m.position.set(pl.o[0] + pl.x[0] * c.cx + pl.y[0] * c.cy, pl.o[1] + pl.x[1] * c.cx + pl.y[1] * c.cy, pl.o[2] + pl.x[2] * c.cx + pl.y[2] * c.cy);
      m.renderOrder = -1;
      m.userData.canvas = c.id;
      this.canvasG.add(m);
    });
    this.dirty = true;
  }
  setWorkPlanesVisible(on) { this.wplanesG.visible = on; this.waxesG.visible = on; this.wpointsG.visible = on; this.dirty = true; }

  /* ---------- Arbeitsachsen: list = [{ id, name, axis: { o, d }, active, tag }] ---------- */
  /* tag (X/Y/Z) macht daraus die Achse eines Benutzerkoordinatensystems: durchgehender Pfeil in
     Achsenfarbe mit Buchstaben daneben, sonst die gestrichelte Linie einer Arbeitsachse. */
  setWorkAxes(list) {
    this.workAxes = list || [];
    this.disposeGroup(this.waxesG);
    const half = Math.max(40, (this.gridSize || 200) * 0.3);
    this.workAxes.forEach(w => {
      const { o, d } = w.axis;
      if (!w.tag) {
        const g = new THREE.BufferGeometry().setFromPoints([v3(o).addScaledVector(v3(d), -half), v3(o).addScaledVector(v3(d), half)]);
        const ln = new THREE.Line(g, new THREE.LineDashedMaterial({ color: C.wplane, dashSize: 4, gapSize: 2, transparent: true, opacity: w.active ? 1 : 0.85 }));
        ln.computeLineDistances();
        ln.userData.wa = w;
        this.waxesG.add(ln);
        return;
      }
      const col = TAGCOL[w.tag] || C.wplane, L = half * 0.9, tip = v3(o).addScaledVector(v3(d), L);
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(o), tip]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: w.active ? 1 : 0.85 }));
      ln.userData.wa = w;
      const head = new THREE.Mesh(new THREE.ConeGeometry(L * 0.03, L * 0.14, 14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: w.active ? 1 : 0.85 }));
      head.position.copy(tip).addScaledVector(v3(d), -L * 0.07);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(d));
      ln.add(head);
      ln.add(this.axisTag(w.tag, tip.clone().addScaledVector(v3(d), L * 0.12)));
      this.waxesG.add(ln);
    });
    this.dirty = true;
  }
  /* Buchstabe an einer Achse (X/Y/Z eines BKS): feste Bildschirmgröße, weiß umrandet, damit er auf jeder Fläche lesbar bleibt */
  axisTag(ch, pos) {
    this.axisTags = this.axisTags || new Map();
    let mat = this.axisTags.get(ch);
    if (!mat) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.strokeText(ch, 32, 34);
      g.fillStyle = '#1d232a'; g.fillText(ch, 32, 34);
      mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, sizeAttenuation: false, transparent: true });
      this.axisTags.set(ch, mat);
    }
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.028, 0.028, 1);
    sp.renderOrder = 6;
    sp.position.copy(pos);
    return sp;
  }
  /* ---------- Arbeitspunkte: list = [{ id, name, p, active }] ---------- */
  /* Massenmittelpunkt: geviertelter Kreis schwarz/weiß, feste Bildschirmgröße, immer sichtbar; p = null blendet aus */
  setCog(p) {
    if (!this.cogG) { this.cogG = new THREE.Group(); this.scene.add(this.cogG); }
    this.disposeGroup(this.cogG);
    if (p) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'), c = 32, r = 26;
      [[0, '#111'], [1, '#fff'], [2, '#111'], [3, '#fff']].forEach(([q, col]) => { g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, q * Math.PI / 2, (q + 1) * Math.PI / 2); g.closePath(); g.fillStyle = col; g.fill(); });
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#111'; g.stroke();
      const tex = new THREE.CanvasTexture(cv);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
      sp.scale.set(0.035, 0.035, 1);
      sp.renderOrder = 6;
      sp.position.set(p[0], p[1], p[2]);
      this.cogG.add(sp);
    }
    this.dirty = true;
  }
  setWorkPoints(list) {
    this.workPoints = list || [];
    this.disposeGroup(this.wpointsG);
    this.workPoints.forEach(w => {
      // feste Bildschirmgröße, immer sichtbar (auch im Körper)
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
      const m = new THREE.Points(g, punktMaterial(w.active ? 0xff5a00 : C.wplane, 8, 'rand'));
      m.renderOrder = 5;
      m.position.set(w.p[0], w.p[1], w.p[2]);
      m.userData.wpt = w;
      this.wpointsG.add(m);
    });
    this.dirty = true;
  }
  /* Arbeitspunkt unter dem Zeiger (Abstand im Bild ≤ 8 px) */
  pickPointAt(e) {
    if (!this.wpointsG.visible || !this.wpointsG.children.length) return null;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null;
    this.wpointsG.children.forEach(m => {
      const v = m.position.clone().project(this.camera);
      if (Math.abs(v.z) > 1) return;
      const dist = Math.hypot((v.x + 1) / 2 * r.width - mx, (1 - v.y) / 2 * r.height - my);
      if (dist <= 8 && (!best || dist < best.dist)) best = { dist, w: m.userData.wpt };
    });
    return best ? { kind: 'workpoint', id: best.w.id, name: best.w.name, p: best.w.p.slice() } : null;
  }
  /* Arbeitsachse unter dem Zeiger (Abstand im Bild ≤ 7 px) */
  pickAxisAt(e) {
    if (!this.waxesG.visible || !this.waxesG.children.length) return null;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const scr = p => { const v = p.clone().project(this.camera); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; };
    let best = null;
    this.waxesG.children.forEach(ln => {
      const pos = ln.geometry.attributes.position;
      const a = scr(new THREE.Vector3().fromBufferAttribute(pos, 0)), b = scr(new THREE.Vector3().fromBufferAttribute(pos, 1));
      if (Math.abs(a[2]) > 1 || Math.abs(b[2]) > 1) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy;
      const t = ll < 1e-9 ? 0 : Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / ll));
      const dist = Math.hypot(a[0] + t * dx - mx, a[1] + t * dy - my);
      if (dist <= 7 && (!best || dist < best.dist)) best = { dist, w: ln.userData.wa };
    });
    return best ? { kind: 'workaxis', id: best.w.id, name: best.w.name, axis: best.w.axis } : null;
  }

  /* ---------- Körper ---------- */
  /* Farben je Körper: map id → '#rrggbb' */
  hasIndividualAppearance(mesh) {
    const colors = this.bodyColors || {}, faded = this.faded || new Set();
    return (mesh.bodies || []).some(b => {
      const c = colors[b.id];
      return faded.has(b.id) || (c && new THREE.Color(c).getHex() !== C.body);
    });
  }
  /* Ein gemeinsames Material ist ein Draw-Call für alle Körper. Eine Materialgruppe
     je Körper (800 Körper = 800 Draw-Calls pro Bild) ist nur nötig, wenn Farbe
     oder Durchsichtigkeit wirklich abweichen. */
  ensureBodyMaterials(need) {
    const m = this.model;
    if (!m || !!this.bodyMats === need) return;
    if (!need) {
      (this.bodyMats || []).forEach(x => x.dispose());
      this.bodyMats = null;
      m.geo.clearGroups();
      m.body.material = this.mats.body;
      return;
    }
    const bodies = m.data.bodies || [];
    this.bodyMats = bodies.map(b => {
      const x = this.mats.body.clone();
      x.color.set((this.bodyColors || {})[b.id] || C.body);
      x.clippingPlanes = this.clipPlanes || [];
      if (this.faded && this.faded.has(b.id)) { x.transparent = true; x.opacity = 0.25; x.depthWrite = false; }
      return x;
    });
    bodies.forEach((b, i) => m.geo.addGroup(b.tris[0], b.tris[1] - b.tris[0], i));
    m.body.material = this.bodyMats;
  }
  /* Zebra-Analyse: Streifen eines unendlich weiten Lichtbands, gespiegelt an der Oberfläche (Reflexionsvektor im
     Kameraraum) – Knicke in den Streifen zeigen Knicke in der Fläche (nicht tangentiale Übergänge), Versatz der Streifen
     nicht krümmungsstetige. Ein Material für alle Körper, das alte kommt beim Ausschalten zurück. */
  /* Umgebungs-Map-Analyse: eine feste Studio-Umgebung (Himmelsverlauf, scharfe dunkle Horizontlinie, drei
     helle Leuchtflächen, Boden mit Raster) spiegelt sich in den Flächen – im Weltraum fest (Z oben), sie wandert beim
     Drehen über das Modell. Knicke und Sprünge im Spiegelbild zeigen Knicke bzw. Krümmungssprünge. Teilt sich den Platz
     mit Zebra: setZebra('zebra' | 'umgebung' | false). */
  setZebra(on) { this.zebra = on === 'umgebung' ? 'umgebung' : on ? 'zebra' : false; this.applyZebra(); }
  /* Eigenes Umgebungsbild (Panorama 2 : 1 aus „Rendern“) statt der festen Studio-Umgebung: tex = null schaltet zurück.
     oben = true, wenn die erste Bildzeile oben liegt (HDR-Daten), dreh in Grad um die Hochachse. HDR-Werte werden
     weich auf 0…1 gebracht (Reinhard), damit helle Lichter nicht alles überstrahlen. */
  setUmgebungsBild(tex, oben = false, dreh = 0, hdr = false) {
    this.umgebBild = tex ? { tex, oben, dreh, hdr } : null;
    if (this.umgebMat) this.umgebUniforms();
  }
  umgebUniforms() {
    const u = this.umgebMat.uniforms, b = this.umgebBild;
    u.bild.value = b ? b.tex : null; u.hatBild.value = b ? 1 : 0; u.oben.value = b && b.oben ? 1 : 0;
    u.dreh.value = b ? (b.dreh || 0) / 360 : 0; u.hdr.value = b && b.hdr ? 1 : 0;
  }
  analyseMat() {
    if (this.zebra === 'umgebung') {
      if (!this.umgebMat) {
        this.umgebMat = new THREE.ShaderMaterial({
          uniforms: { bild: { value: null }, hatBild: { value: 0 }, oben: { value: 0 }, dreh: { value: 0 }, hdr: { value: 0 } },
          vertexShader: 'varying vec3 vW; varying vec3 vN; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
          fragmentShader: [
            'varying vec3 vW; varying vec3 vN;',
            'uniform sampler2D bild; uniform float hatBild; uniform float oben; uniform float dreh; uniform float hdr;',
            'float box(float az, float el, float a0, float a1, float e0, float e1) { float w = 0.02; return smoothstep(a0 - w, a0, az) * (1.0 - smoothstep(a1, a1 + w, az)) * smoothstep(e0 - w, e0, el) * (1.0 - smoothstep(e1, e1 + w, el)); }',
            'void main() {',
            '  vec3 n = normalize(vN); vec3 v = normalize(vW - cameraPosition); if (dot(n, v) > 0.0) n = -n;',
            '  vec3 r = reflect(v, n); float el = asin(clamp(r.z, -1.0, 1.0)); float az = atan(r.y, r.x);',
            '  vec3 c;',
            '  if (hatBild > 0.5) {',
            '    float u = fract(az / 6.2831853 + 0.5 - dreh), w = el / 3.1415927 + 0.5;',
            '    c = texture2D(bild, vec2(u, oben > 0.5 ? 1.0 - w : w)).rgb;',
            '    if (hdr > 0.5) c = c / (1.0 + c); else c = pow(c, vec3(2.2));',
            '    gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0); return;',
            '  }',
            '  if (el > 0.0) {',
            '    c = mix(vec3(0.86, 0.90, 0.95), vec3(0.32, 0.50, 0.78), pow(el / 1.5708, 0.6));',
            '    float l = box(az, el, -2.6, -2.1, 0.35, 0.8) + box(az, el, -0.4, 0.25, 0.25, 0.9) + box(az, el, 1.6, 2.2, 0.45, 0.75);',
            '    c = mix(c, vec3(1.0), clamp(l, 0.0, 1.0));',
            '  } else {',
            '    float g = step(0.5, fract(az * 3.8197)) == step(0.5, fract(el * 7.6394)) ? 0.30 : 0.24;',
            '    c = vec3(g, g * 1.02, g * 1.05);',
            '  }',
            '  c = mix(vec3(0.03), c, smoothstep(0.004, 0.018, abs(el)));',
            '  gl_FragColor = vec4(c, 1.0);',
            '}'].join('\n'),
          side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        });
      }
      this.umgebUniforms();
      return this.umgebMat;
    }
    if (!this.zebraMat) {
      this.zebraMat = new THREE.ShaderMaterial({
        uniforms: { k: { value: 9.0 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float k; varying vec3 vN; varying vec3 vV; void main() { vec3 r = reflect(-normalize(vV), normalize(vN)); float s = step(0.5, fract(r.y * k)); gl_FragColor = vec4(vec3(mix(0.07, 0.97, s)), 1.0); }',
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      });
    }
    return this.zebraMat;
  }
  istAnalyseMat(m) { return !!m && (m === this.zebraMat || m === this.umgebMat); }
  applyZebra() {
    if (!this.model) return;
    const b = this.model.body;
    if (this.zebra) {
      const mat = this.analyseMat();
      if (b.material !== mat) { if (!this.istAnalyseMat(b.material)) this.zebraPrev = b.material; b.material = mat; }
    } else if (this.istAnalyseMat(b.material)) { b.material = this.zebraPrev || this.mats.body; this.zebraPrev = null; }
    this.dirty = true;
  }
  setBodyColors(map) {
    this.bodyColors = map || {};
    if (!this.model || this.overhang || this.draftA) return;
    if (this.zebra && this.istAnalyseMat(this.model.body.material)) { this.model.body.material = this.zebraPrev || this.mats.body; this.ensureBodyMaterials(this.hasIndividualAppearance(this.model.data)); if (this.bodyMats) (this.model.data.bodies || []).forEach((bd, i) => { const c = this.bodyColors[bd.id]; this.bodyMats[i].color.set(c || C.body); }); this.zebraPrev = this.model.body.material; this.model.body.material = this.analyseMat(); this.applyFade(); return; }
    this.ensureBodyMaterials(this.hasIndividualAppearance(this.model.data));
    if (this.bodyMats) (this.model.data.bodies || []).forEach((b, i) => { const c = this.bodyColors[b.id]; this.bodyMats[i].color.set(c || C.body); });
    this.applyFade();
  }
  /* Körper außerhalb der aktiven Komponente durchscheinend */
  setFaded(ids) { this.faded = new Set(ids || []); this.applyFade(); }
  applyFade() {
    if (this.model) {
      this.ensureBodyMaterials(this.hasIndividualAppearance(this.model.data));
      if (this.bodyMats) {
        const fd = this.faded || new Set();
        (this.model.data.bodies || []).forEach((b, i) => {
          const m = this.bodyMats[i], on = fd.has(b.id);
          if (m.transparent !== on) { m.transparent = on; m.opacity = on ? 0.25 : 1; m.depthWrite = !on; m.needsUpdate = true; }
        });
      }
    }
    this.dirty = true;
  }
  /* ---------- Überhang-Analyse für den 3D-Druck ----------
     opts: { angle: Grad ab Senkrechte (z. B. 45), down: [x,y,z] Druckrichtung nach unten } oder null zum Ausschalten.
     Rot = Überhang (braucht Stützen), Grün = liegt auf dem Druckbett. */
  setOverhang(opts) {
    this.overhang = opts || null;
    if (opts) this.draftA = null;
    this.applyOverhang();
  }
  /* Verjüngungs-Analyse: { dir, min (Grad), two } oder null; nutzt dieselbe Eckpunktfärbung wie die Überhang-Analyse */
  setDraftAnalysis(opts) {
    this.draftA = opts || null;
    if (opts) this.overhang = null;
    if (!opts) this.minRad = null;
    this.applyOverhang();
  }
  /* Ergebnisfläche (Festigkeit eines Bauteils): fein unterteilte Dreiecke mit Farben je Eckpunkt, liegt auf dem Körper
     ({ positions: Float32Array, colors: Float32Array } ohne Index, oder null) */
  setResultMesh(r) {
    if (this.resultG) { this.scene.remove(this.resultG); this.resultG.geometry.dispose(); this.resultG.material.dispose(); this.resultG = null; }
    if (r) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(r.colors, 3));
      geo.computeVertexNormals();
      const m = this.resultG = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
      m.renderOrder = 4; m.raycast = () => {};
      this.scene.add(m);
    }
    this.dirty = true;
  }
  /* Mindestradius-Analyse: { lim } oder null – gekrümmte Flächen mit Radius < lim rot, übrige gekrümmte grün, ebene grau */
  setMinRadius(opts) {
    this.minRad = opts || null;
    if (opts) { this.overhang = null; this.draftA = null; }
    this.applyOverhang();
  }
  applyOverhang() {
    const mats = this.bodyMats || [this.mats.body];
    if (!this.model) return;
    const geo = this.model.geo, o = this.overhang, da = this.draftA, mr = this.minRad;
    if (mr && mr.k) {
      // Krümmungs-Map: blau (eben) → grün → gelb → rot (Krümmung ≥ kRed)
      const n = mr.k.length, col = new Float32Array(n * 3), ramp = [[0.25, 0.45, 0.9], [0.35, 0.78, 0.45], [0.98, 0.8, 0.25], [0.93, 0.27, 0.22]];
      for (let i = 0; i < n; i++) {
        const t = Math.min(1, mr.k[i] / mr.kRed) * 3, j = Math.min(2, Math.floor(t)), f = t - j, a = ramp[j], b = ramp[j + 1];
        col[3 * i] = a[0] + (b[0] - a[0]) * f; col[3 * i + 1] = a[1] + (b[1] - a[1]) * f; col[3 * i + 2] = a[2] + (b[2] - a[2]) * f;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mats.forEach(m => { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; });
      this.dirty = true;
      return;
    }
    if (mr) {
      const pos = geo.getAttribute('position'), col = new Float32Array(pos.count * 3).fill(0.86), idx = this.model.data.index;
      (this.model.data.faces || []).forEach(f => {
        const c = f.radius == null ? null : f.radius < mr.lim ? [0.93, 0.27, 0.22] : [0.35, 0.78, 0.45];
        if (!c) return;
        for (let k = f.start; k < f.start + f.count; k++) { const v = idx[k]; col[3 * v] = c[0]; col[3 * v + 1] = c[1]; col[3 * v + 2] = c[2]; }
      });
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mats.forEach(m => { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; });
      this.dirty = true;
      return;
    }
    if (da) {
      const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), n = pos.count, d = da.dir, col = new Float32Array(n * 3);
      const lim = Math.sin((da.min ?? 1) * Math.PI / 180) - 1e-9;
      for (let i = 0; i < n; i++) {
        const s = nor.getX(i) * d[0] + nor.getY(i) * d[1] + nor.getZ(i) * d[2];
        const c = (da.two ? Math.abs(s) >= lim : s >= lim) ? [0.35, 0.78, 0.45] : (!da.two && s <= -lim) ? [0.93, 0.27, 0.22] : [0.98, 0.8, 0.25];
        col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mats.forEach(m => { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; });
      this.dirty = true;
      return;
    }
    if (!o) {
      if (geo.getAttribute('color')) geo.deleteAttribute('color');
      mats.forEach(m => { m.vertexColors = false; m.color.set(C.body); m.needsUpdate = true; });
      this.setBodyColors(this.bodyColors);
      this.dirty = true;
      return;
    }
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), n = pos.count;
    const d = new THREE.Vector3(...(o.down || [0, 0, -1])).normalize();
    let low = -Infinity;
    for (let i = 0; i < n; i++) low = Math.max(low, pos.getX(i) * d.x + pos.getY(i) * d.y + pos.getZ(i) * d.z);
    const lim = Math.sin((o.angle ?? 45) * Math.PI / 180), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const sdn = nor.getX(i) * d.x + nor.getY(i) * d.y + nor.getZ(i) * d.z;
      const h = pos.getX(i) * d.x + pos.getY(i) * d.y + pos.getZ(i) * d.z;
      let c;
      if (sdn > 0.999 && h > low - 0.01) c = [0.35, 0.78, 0.45];
      else if (sdn > lim + 1e-6) c = [0.93, 0.27, 0.22];
      else if (sdn > lim - 0.12) c = [0.98, 0.7, 0.3];
      else c = [0.86, 0.88, 0.9];
      col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mats.forEach(m => { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; });
    this.dirty = true;
  }
  /* Explosionsansicht: Eckpunkte je Körper verschieben (offs = {Körper-ID: [dx, dy, dz]}, null = zurück) oder drehen
     und verschieben ({ c, R, d }: p → c + R·(p − c) + d, Normalen mit R). Die Positionsfelder sind dieselben wie in
     mesh, Auswahl und Hervorhebung folgen also mit. */
  setExplode(offs) { this.explode = offs || null; this.applyExplode(); }
  applyExplode() {
    const m = this.model;
    if (!m || !m.data.bodies) return;
    const pos = m.geo.getAttribute('position'), ep = m.edges.geometry.getAttribute('position');
    const nor = m.geo.getAttribute('normal');
    if (!m.base) { if (!this.explode) return; m.base = pos.array.slice(); m.ebase = ep.array.slice(); m.nbase = nor.array.slice(); }
    const o = this.explode || {};
    const dreh = (A, B, i0, i1, x) => {
      const { c, R, d } = x;
      for (let i = i0 * 3; i < i1 * 3; i += 3) {
        const px = B[i] - c[0], py = B[i + 1] - c[1], pz = B[i + 2] - c[2];
        A[i] = c[0] + R[0] * px + R[1] * py + R[2] * pz + d[0];
        A[i + 1] = c[1] + R[3] * px + R[4] * py + R[5] * pz + d[1];
        A[i + 2] = c[2] + R[6] * px + R[7] * py + R[8] * pz + d[2];
      }
    };
    let gedreht = false;
    m.data.bodies.forEach(b => {
      if (!b.verts) return;
      const x = o[b.id] || [0, 0, 0];
      if (!Array.isArray(x)) {
        dreh(pos.array, m.base, b.verts[0], b.verts[1], x); dreh(ep.array, m.ebase, b.evs[0], b.evs[1], x);
        dreh(nor.array, m.nbase, b.verts[0], b.verts[1], { c: [0, 0, 0], R: x.R, d: [0, 0, 0] });
        gedreht = true;
        return;
      }
      for (let i = b.verts[0] * 3; i < b.verts[1] * 3; i++) { pos.array[i] = m.base[i] + x[i % 3]; nor.array[i] = m.nbase[i]; }
      for (let i = b.evs[0] * 3; i < b.evs[1] * 3; i++) ep.array[i] = m.ebase[i] + x[i % 3];
    });
    pos.needsUpdate = true; ep.needsUpdate = true;
    if (gedreht || m.nGedreht) nor.needsUpdate = true;
    m.nGedreht = gedreht;
    m.geo.computeBoundingBox(); m.geo.computeBoundingSphere();
    m.edges.geometry.computeBoundingSphere();
    this.movePickBoxes();
    this.applySelection();
    this.dirty = true;
  }
  setModel(mesh) {
    (this.bodyMats || []).forEach(m => m.dispose());
    this.bodyMats = null;
    this.disposeGroup(this.modelG);
    this.disposeGroup(this.hlG);
    this.hover = null;
    if (!mesh) { this.model = null; this.updateGridForBounds(null); return; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.index, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const body = new THREE.Mesh(geo, this.mats.body);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(mesh.edgePositions, 3));
    const edges = new THREE.LineSegments(eg, this.mats.edge);
    this.modelG.add(body, edges);

    const triFace = new Int32Array(mesh.index.length / 3).fill(-1);
    mesh.faces.forEach((f, i) => { for (let t = f.start / 3; t < (f.start + f.count) / 3; t++) triFace[t] = i; });
    const vertEdge = new Int32Array(mesh.edgePositions.length / 3).fill(-1);
    mesh.edges.forEach((e, i) => { for (let v = e.start; v < e.start + e.count; v++) vertEdge[v] = i; });
    this.model = { data: mesh, geo, body, edges, triFace, vertEdge };
    this.buildPickIndex();
    // Materialgruppen je Körper erst wenn nötig (siehe ensureBodyMaterials)
    this.ensureBodyMaterials(!!(mesh.bodies && mesh.bodies.length) && this.hasIndividualAppearance(mesh));
    this.applyVisualStyle();
    if (this.zebra) this.applyZebra();
    this.buildSectionCaps();
    this.updateGridForBounds(mesh.bbox);
    this.applySelection();
    if (this.overhang || this.draftA) this.applyOverhang();
    if (this.explode) this.applyExplode();
  }

  /* ---------- Drehen um den Drehpunkt (Umschalt + Mitte, Werkzeug „Orbit“ mit links) ---------- */
  /* Drehpunkt: der Punkt am Modell, der dem Mauszeiger am nächsten liegt (siehe pivotNearPointer);
     ohne Körper die Mitte der Skizzen bzw. der Zielpunkt */
  orbitPivot() {
    const b = this.bounds();
    return b && !b.isEmpty() ? b.getCenter(new THREE.Vector3()) : this.controls.target.clone();
  }
  /* um dx/dy Bildpunkte drehen: Azimut um die Hochachse Z, Höhe um die Rechts-Achse der Kamera, beides durch den
     Drehpunkt. Kamera und Zielpunkt drehen gemeinsam, deshalb bleibt der Drehpunkt an seiner Stelle im Bild. */
  orbitBy(dx, dy, pivot = this.orbitPivot()) {
    const cam = this.camera, tgt = this.controls.target, Z = new THREE.Vector3(0, 0, 1);
    const k = 2 * Math.PI / Math.max(1, this.canvas.clientHeight) * this.controls.rotateSpeed;
    const off = cam.position.clone().sub(tgt), len = off.length() || 1;
    const phi = Math.acos(THREE.MathUtils.clamp(off.z / len, -1, 1)), eps = 0.01;
    const e = THREE.MathUtils.clamp(-dy * k, eps - phi, Math.PI - eps - phi);
    const fwd = off.clone().negate().normalize(), right = fwd.clone().cross(Z);
    if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
    right.normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(Z, -dx * k).multiply(new THREE.Quaternion().setFromAxisAngle(right, e));
    cam.position.sub(pivot).applyQuaternion(q).add(pivot);
    tgt.sub(pivot).applyQuaternion(q).add(pivot);
    cam.up.set(0, 0, 1);
    cam.lookAt(tgt);
    if (cam === this.orthoCam) this.updateOrtho();
    this.anim = null;
    this.dirty = true;
  }
  initOrbit() {
    const cv = this.canvas;
    let drag = null;
    /* Zoomen am Punkt unter dem Zeiger: OrbitControls verankert das Zoomen über die
       Zielentiefe. Vor jedem Zoom wird diese Tiefe auf die Oberfläche unter dem Zeiger
       gelegt – der Zielpunkt bleibt auf der Blickachse, die Blickrichtung ändert sich
       nicht, aber das Bild bleibt bei langen Teilen am Detail statt an der Körpermitte. */
    const zoomParams = this.controls._updateZoomParameters.bind(this.controls);
    this.controls._updateZoomParameters = (x, y) => {
      this.zoomAnchorAtPointer({ clientX: x, clientY: y });
      zoomParams(x, y);
    };
    this.pivotMark = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
      punktMaterial(0x22a34a, 9, 'rand')); // Drehpunkt: kleiner grüner Punkt mit weißem Rand
    this.pivotMark.renderOrder = 9;
    this.pivotMark.visible = false;
    this.scene.add(this.pivotMark);
    // vor OrbitControls registriert (capture): Umschalt + Mitte und Werkzeug „Orbit“ gehören der eigenen Drehung
    cv.addEventListener('pointerdown', e => {
      /* Rechts dreht, Alt + Umschalt, Mitte dreht, Umschalt verschiebt: der ganze Zug gehört der Navigation (eigene Drehung, Verschieben und Zoomen über
         OrbitControls), Auswahl, Skizze und Markierungsmenü sehen ihn nicht */
      const art = this.navAktion(e);
      if (art) {
        e.preventDefault(); e.stopImmediatePropagation();
        const pivot = art === 'orbit' ? this.pivotNearPointer(e) || this.orbitPivot() : null;
        drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pivot, id: e.pointerId, art, rechts: e.button === 2 };
        if (art === 'pan') this.controls._handleMouseDownPan(e);
        if (art === 'zoom') this.controls._handleMouseDownDolly(e);
        if (pivot) { this.pivotMark.position.copy(pivot); this.pivotMark.visible = true; }
        try { cv.setPointerCapture(e.pointerId); } catch (_) { /* künstliches Ereignis */ }
        this.wakeRenderer();
        return;
      }
      const sw = this.navScheme === 'mitte', mods = e.shiftKey || e.ctrlKey || e.metaKey;
      /* Mitte dreht: Umschalt + Mitte zoomt – OrbitControls bekommt für diesen Zug „Zoomen“ auf der Mitte */
      if (sw && e.button === 1 && e.shiftKey) {
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        const back = () => { this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; window.removeEventListener('pointerup', back); };
        window.addEventListener('pointerup', back);
        return;
      }
      const want = (e.button === 1 && (sw ? !mods : e.shiftKey)) || (e.button === 0 && this.navTool === 'orbit');
      if (!want) return;
      e.preventDefault();
      const pivot = this.pivotNearPointer(e) || this.orbitPivot();
      drag = { x: e.clientX, y: e.clientY, pivot, id: e.pointerId };
      this.pivotMark.position.copy(pivot);
      this.pivotMark.visible = true;
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* künstliches Ereignis */ }
      if (this.navTool === 'orbit') cv.style.cursor = 'grabbing';
      this.wakeRenderer();
    }, true);
    cv.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.art === 'pan') this.controls._handleMouseMovePan(e);
      else if (drag.art === 'zoom') this.controls._handleMouseMoveDolly(e);
      else this.orbitBy(e.clientX - drag.x, e.clientY - drag.y, drag.pivot);
      drag.x = e.clientX; drag.y = e.clientY;
      this.wakeRenderer();
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.art && e) {
        e.stopImmediatePropagation(); // keine Auswahl nach dem Zug
        // rechte Maustaste ohne Ziehen (Rechts dreht): Markierungsmenü wie sonst beim Rechtsklick
        if (drag.rechts && Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) <= 4 && this.onRightClick) this.onRightClick(e.clientX, e.clientY);
      }
      drag = null;
      this.pivotMark.visible = false;
      if (this.navTool === 'orbit') cv.style.cursor = 'grab';
      this.wakeRenderer();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  /* ---------- Navigationswerkzeuge und Anzeige (Navigationsleiste) ---------- */
  /* Bedienung (Einstellungen → Allgemein):
     standard und ftasten: Mitte verschiebt, Umschalt + Mitte dreht (ftasten dazu F2–F6 in main.js) ·
     mitte: Mitte dreht, Strg + Mitte verschiebt, Umschalt + Mitte zoomt.
     OrbitControls macht aus ROTATE mit Strg/Umschalt selbst ein Verschieben; die Drehung ohne Taste übernimmt initOrbit.
     Die übrigen über navAktion: rechts – rechte Maustaste dreht (Klick ohne Zug = Markierungsmenü), Umschalt + rechts
     oder Mitte verschiebt · altumschalt – Alt + Umschalt + links/Mitte/rechts = Drehen/Verschieben/Zoomen ·
     mitteumschalt – Mitte dreht, Umschalt + Mitte verschiebt, Strg + Mitte zoomt. Das Mausrad zoomt überall. */
  setNavScheme(scheme, reverseZoom = false) {
    this.navScheme = NAV_SCHEMES.includes(scheme) ? scheme : 'standard';
    this.controls.mouseButtons.MIDDLE = this.navScheme === 'mitte' ? THREE.MOUSE.ROTATE : this.navScheme === 'standard' || this.navScheme === 'ftasten' ? THREE.MOUSE.PAN : null;
    this.controls.zoomSpeed = reverseZoom ? -1.2 : 1.2;
  }
  // Was ein Mausdruck im Schema Rechts dreht, Alt + Umschalt oder Mitte dreht, Umschalt verschiebt tut: 'orbit', 'pan', 'zoom' oder null (sonst Auswahl usw.)
  navAktion(e) {
    const s = this.navScheme, b = e.button;
    if (s === 'rechts') return b === 2 ? (e.shiftKey ? 'pan' : 'orbit') : b === 1 ? 'pan' : null;
    if (s === 'altumschalt') return e.altKey && e.shiftKey ? ['orbit', 'pan', 'zoom'][b] || null : null;
    if (s === 'mitteumschalt') return b === 1 ? (e.ctrlKey ? 'zoom' : e.shiftKey ? 'pan' : 'orbit') : null;
    return null;
  }
  setNavTool(t) {
    this.navTool = t || null;
    const M = THREE.MOUSE;
    // Orbit dreht über die eigene Drehung (initOrbit), daher links für OrbitControls frei
    this.controls.mouseButtons.LEFT = t === 'pan' ? M.PAN : t === 'zoom' ? M.DOLLY : null;
    this.canvas.style.cursor = t === 'orbit' ? 'grab' : t === 'pan' ? 'move' : t === 'zoom' ? 'ns-resize' : '';
  }
  setVisualStyle(st) { this.visualStyle = st; this.applyVisualStyle(); this.dirty = true; }
  applyVisualStyle() {
    if (!this.model) return;
    const st = this.visualStyle;
    this.model.body.visible = st !== 'wire';
    this.applyEdgesVisible();
    this.mats.edge.color.set(st === 'wire' ? 0x26303a : C.edge);
  }
  setGridVisible(on) { this.world.visible = !!on; this.dirty = true; }

  /* ---------- Hervorgehobene Zusatzkörper (z. B. Kollisionen) ---------- */
  /* Vorschau des Ergebnisses: halbtransparent über dem
     Ausgangsmodell, an dem weiter Kanten/Flächen gewählt werden */
  setPreviewMesh(mesh) {
    if (this.previewG) { this.scene.remove(this.previewG); this.previewG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this.mats.edge) o.material.dispose(); }); this.previewG = null; }
    if (!mesh) { if (this.model) { this.model.body.visible = this.visualStyle !== 'wire'; this.applyEdgesVisible(); } this.dirty = true; return; }
    // Ergebnis wie das Modell schattiert zeigen; das Ausgangsmodell bleibt unsichtbar zum Anklicken darunter
    const g = this.previewG = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.index, 1));
    const mat = this.mats.body.clone();
    // Die Überhang- und Verjüngungs-Analyse färbt das gemeinsame Material um;
    // die Vorschau zeigt immer die normale Körperfarbe.
    mat.vertexColors = false; mat.color.set(C.body);
    mat.clippingPlanes = this.clipPlanes || [];
    const m = new THREE.Mesh(geo, mat);
    m.raycast = () => {};
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(mesh.edgePositions, 3));
    const el = new THREE.LineSegments(eg, this.mats.edge);
    el.raycast = () => {};
    g.add(m, el);
    this.scene.add(g);
    if (this.model) { this.model.body.visible = false; this.applyEdgesVisible(); }
    this.dirty = true;
  }
  /* Isokurven: positions = Punktpaare (Float32Array) oder null; dunkle Linien mit Tiefentest auf dem Modell */
  setIsoLines(positions) {
    if (this.isoG) { this.scene.remove(this.isoG); this.isoG.geometry.dispose(); this.isoG.material.dispose(); this.isoG = null; }
    if (positions && positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.isoG = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1e3a8a, transparent: true, opacity: 0.8 }));
      this.isoG.renderOrder = 5;
      this.scene.add(this.isoG);
    }
    this.dirty = true;
  }
  /* Linien und Punkte für Analysen (Rahmen-Festigkeit: Biegelinie, Lager, Kraftpfeile); null = aus.
     o = { lines: [{ positions: [x,y,z, …] Punktpaare, color }], points: [{ positions, color, size }] } */
  setAnalysisOverlay(o) {
    if (this.anaG) { this.scene.remove(this.anaG); this.anaG.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); this.anaG = null; }
    if (o) {
      const g = this.anaG = new THREE.Group();
      (o.lines || []).forEach(l => {
        if (!l.positions.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(l.positions, 3));
        const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: l.color || 0x2563eb, depthTest: false, transparent: true, opacity: 0.95 }));
        m.renderOrder = 9; m.raycast = () => {};
        g.add(m);
      });
      (o.points || []).forEach(p => {
        if (!p.positions.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3));
        const m = new THREE.Points(geo, punktMaterial(p.color || 0x111827, p.size || 10, 'rand'));
        m.renderOrder = 10; m.raycast = () => {};
        g.add(m);
      });
      this.scene.add(g);
    }
    this.dirty = true;
  }
  setMarkMeshes(list) {
    if (this.markG) { this.scene.remove(this.markG); this.markG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.markG = null; }
    if (!list || !list.length) { this.dirty = true; return; }
    const g = this.markG = new THREE.Group();
    list.forEach(m => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
      /* ein Zahlfeld aus dem Kern (Typed Array) braucht einen Puffer, Three.js kommt sonst
         beim Anlegen der Indexpuffer nicht weiter; ein gewöhnliches Feld nimmt Three.js selbst */
      geo.setIndex(Array.isArray(m.index) ? m.index : new THREE.BufferAttribute(m.index, 1));
      geo.computeVertexNormals();
      /* solid: wie ein Körper mit Tiefentest zeigen (Stützmaterial), sonst als Markierung darüber */
      const solid = !!m.solid;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: m.color || 0xe11d48, transparent: true, opacity: solid ? 0.8 : 0.75, depthTest: solid }));
      mesh.renderOrder = solid ? 6 : 8;
      g.add(mesh);
    });
    this.scene.add(g);
    this.dirty = true;
  }

  /* ---------- Ziehpfeil: Wert entlang einer Richtung ziehen ----------
     m = { origin: [x,y,z], dir: [x,y,z], value, scale (Wert → Länge), onChange(v), onEnd(v) } oder null */
  setManipulator(m) {
    if (this.manipG) { this.scene.remove(this.manipG); this.manipG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.manipG = null; }
    this.manip = m;
    if (!m) { this.dirty = true; return; }
    const g = this.manipG = new THREE.Group();
    const col = 0x2563eb;
    const mat = new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), mat.clone());
    shaft.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 18), mat.clone());
    head.position.y = 1.25;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat.clone());
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    [shaft, head, ball].forEach(o => { o.renderOrder = 10; });
    g.add(shaft, head, ball, hit);
    g.userData = { hit, head };
    this.scene.add(g);
    this.placeManip();
  }
  updateManipulator(value) { if (this.manip) { this.manip.value = value; this.placeManip(); } }
  placeManip() {
    const m = this.manip, g = this.manipG;
    const d = new THREE.Vector3(...m.dir).normalize();
    const tip = new THREE.Vector3(...m.origin).addScaledVector(d, m.value * (m.scale || 1));
    g.position.copy(tip);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m.value * (m.scale || 1) < 0 ? d.clone().negate() : d);
    this.dirty = true;
  }
  scaleManip() { const s = this.worldPerPixel() * 46; this.manipG.scale.setScalar(s); }
  manipHit(e) {
    if (!this.manipG) return false;
    this.scaleManip();
    this.manipG.updateMatrixWorld(true);
    this.ray.setFromCamera(this.ndc(e), this.camera);
    return this.ray.intersectObject(this.manipG.userData.hit, false).length > 0;
  }
  /* Wert aus der Zeigerposition: nächster Punkt der Zeigerlinie auf der Achse */
  manipValueAt(e) {
    const m = this.manip;
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const o = new THREE.Vector3(...m.origin), d = new THREE.Vector3(...m.dir).normalize();
    const r0 = this.ray.ray.origin, rd = this.ray.ray.direction;
    const w = o.clone().sub(r0), a = d.dot(d), b = d.dot(rd), c = rd.dot(rd), dd = d.dot(w), ee = rd.dot(w);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    const t = (b * ee - c * dd) / den;
    return t / (m.scale || 1);
  }

  /* ---------- Verschiebe-Griff: drei Pfeile X/Y/Z ----------
     t = { origin: [x,y,z], values: [dx,dy,dz], onChange(i, v), onEnd() } oder null;
     mit t.onRotate(i, Winkel°) kommen Drehringe um X/Y/Z dazu (t.axis = 0…2, t.angle = aktueller Winkel) */
  setTriad(t) {
    if (this.triadG) { this.scene.remove(this.triadG); this.triadG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.triadG = null; }
    this.triad = t;
    if (!t) { this.dirty = true; return; }
    const g = this.triadG = new THREE.Group();
    g.userData.arrows = [];
    [[1, 0, 0, 0xe5484d], [0, 1, 0, 0x30a46c], [0, 0, 1, 0x2563eb]].forEach(([x, y, z, col], i) => {
      const a = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), mat);
      shaft.position.y = 0.6;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 18), mat.clone());
      head.position.y = 1.3;
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.85;
      [shaft, head].forEach(o => { o.renderOrder = 10; });
      a.add(shaft, head, hit);
      a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z));
      a.userData = { hit, i };
      g.add(a); g.userData.arrows.push(a);
    });
    g.userData.rings = [];
    if (t.onRotate) [[1, 0, 0, 0xe5484d], [0, 1, 0, 0x30a46c], [0, 0, 1, 0x2563eb]].forEach(([x, y, z, col], i) => {
      // Ring in der Ebene senkrecht zur Achse i (Torus liegt von Haus aus in der xy-Ebene, Achse z)
      const r = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.025, 6, 64), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.8 }));
      ring.renderOrder = 10;
      const hit = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 6, 48), new THREE.MeshBasicMaterial({ visible: false }));
      r.add(ring, hit);
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(x, y, z));
      r.userData = { hit, i: 3 + i };
      g.add(r); g.userData.rings.push(r);
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x334155, depthTest: false }));
    ball.renderOrder = 10; g.add(ball);
    this.scene.add(g);
    this.placeTriad();
  }
  placeTriad() { const t = this.triad; this.triadG.position.set(...t.origin.map((v, i) => v + (t.values[i] || 0))); this.dirty = true; }
  updateTriad(values) { if (this.triad) { this.triad.values = values.slice(); this.placeTriad(); } }
  triadHit(e) {
    if (!this.triadG) return -1;
    this.triadG.scale.setScalar(this.worldPerPixel() * 72);
    this.triadG.updateMatrixWorld(true);
    this.ray.setFromCamera(this.ndc(e), this.camera);
    for (const a of this.triadG.userData.arrows) if (this.ray.intersectObject(a.userData.hit, false).length) return a.userData.i;
    for (const r of this.triadG.userData.rings) if (this.ray.intersectObject(r.userData.hit, false).length) return r.userData.i;
    return -1;
  }
  /* Winkel (°) des Mauspunkts um die Achse i in der Ringebene durch die Griffmitte */
  triadAngleAt(e, i) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const n = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0), c = this.triadG.position;
    const p = this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), new THREE.Vector3());
    if (!p) return null;
    const v = p.sub(c), [a, b] = i === 0 ? [v.y, v.z] : i === 1 ? [v.z, v.x] : [v.x, v.y];
    return Math.atan2(b, a) * 180 / Math.PI;
  }
  triadValueAt(e, i) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const o = new THREE.Vector3(...this.triad.origin), d = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
    const r0 = this.ray.ray.origin, rd = this.ray.ray.direction;
    const w = o.clone().sub(r0), b = d.dot(rd), c = rd.dot(rd), dd = d.dot(w), ee = rd.dot(w);
    const den = c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    return (b * ee - c * dd) / den;
  }

  /* ---------- Querschnitt ----------
     sec = { n: [x,y,z], d } behält die Seite n·p < d; Schnittfläche über Stencil-Kappe gefüllt. */
  setSection(sec) {
    this.section = sec;
    const planes = sec ? [new THREE.Plane(new THREE.Vector3(...sec.n).negate(), sec.d)] : [];
    this.clipPlanes = planes;
    this.mats.body.clippingPlanes = planes;
    this.mats.edge.clippingPlanes = planes;
    this.mats.body.needsUpdate = true; this.mats.edge.needsUpdate = true;
    (this.bodyMats || []).forEach(m => { m.clippingPlanes = planes; m.needsUpdate = true; });
    this.buildSectionCaps();
    this.dirty = true;
  }
  buildSectionCaps() {
    if (this.capG) { this.scene.remove(this.capG); this.capG.traverse(o => { if (o.geometry && o.userData.own) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.capG = null; }
    if (!this.section || !this.model) return;
    const plane = this.clipPlanes[0];
    const g = this.capG = new THREE.Group();
    const base = { depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: [plane] };
    const back = new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
    const front = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
    const m0 = new THREE.Mesh(this.model.geo, back), m1 = new THREE.Mesh(this.model.geo, front);
    m0.renderOrder = -3; m1.renderOrder = -3;
    const bb = this.model.data.bbox, size = new THREE.Vector3(...bb[1]).sub(new THREE.Vector3(...bb[0])).length() * 2 + 10;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xe0795a, metalness: 0.05, roughness: 0.7, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    const pg = new THREE.PlaneGeometry(size, size);
    const cap = new THREE.Mesh(pg, capMat);
    cap.userData.own = true;
    const n = new THREE.Vector3(...this.section.n).normalize();
    const c = new THREE.Vector3(...bb[0]).add(new THREE.Vector3(...bb[1])).multiplyScalar(0.5);
    const onPlane = c.clone().sub(n.clone().multiplyScalar(c.dot(n) - this.section.d));
    cap.position.copy(onPlane);
    cap.lookAt(onPlane.clone().add(n));
    cap.renderOrder = -2;
    cap.onAfterRender = r => r.clearStencil();
    g.add(m0, m1, cap);
    this.scene.add(g);
  }

  updateGridForBounds(bb) {
    let size = 200;
    if (bb) {
      const ext = Math.max(Math.abs(bb[0][0]), Math.abs(bb[0][1]), Math.abs(bb[1][0]), Math.abs(bb[1][1]), bb[1][2] - bb[0][2]);
      size = Math.max(100, nice(ext * 2.4));
    }
    if (size !== this.gridSize) { this.buildGrid(size); this.buildWorkPlanes(); }
    this.buildOriginPlanes(Math.max(40, size * 0.3));
  }

  bounds() {
    if (this.model) {
      const b = this.model.data.bbox;
      return new THREE.Box3(v3(b[0]), v3(b[1]));
    }
    const box = new THREE.Box3();
    this.sketchG.traverse(o => { if (o.geometry) { o.geometry.computeBoundingBox(); if (o.geometry.boundingBox) box.union(o.geometry.boundingBox); } });
    if (box.isEmpty()) return new THREE.Box3(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 40));
    return box;
  }

  /* ---------- Hervorhebungen ---------- */
  faceOverlay(indices, mat) {
    const m = this.model;
    const idx = [];
    indices.forEach(i => {
      const f = m.data.faces[i];
      if (!f) return;
      for (let k = f.start; k < f.start + f.count; k++) idx.push(m.data.index[k]);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', m.geo.attributes.position);
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 2;
    return mesh;
  }
  edgeOverlay(indices, color, width) {
    const m = this.model, p = m.data.edgePositions, arr = [];
    indices.forEach(i => {
      const e = m.data.edges[i];
      if (!e) return;
      for (let v = e.start; v < e.start + e.count; v++) arr.push(p[3 * v], p[3 * v + 1], p[3 * v + 2]);
    });
    if (!arr.length) return null;
    const l = this.fatLines(arr, color, width, { depthTest: false });
    l.renderOrder = 3;
    return l;
  }

  setSelection(sel) {
    this.selection = { faces: sel.faces || [], edges: sel.edges || [] };
    this.applySelection();
  }
  applySelection() {
    this.disposeGroup(this.hlG);
    if (!this.model) return;
    if (this.selection.faces.length) this.hlG.add(this.faceOverlay(this.selection.faces, this.mats.faceSel));
    const el = this.selection.edges.length ? this.edgeOverlay(this.selection.edges, C.sel, 4.5) : null;
    if (el) this.hlG.add(el);
    this.hoverObj = null;
    this.drawHover();
  }
  drawHover() {
    this.dirty = true;
    if (this.hoverObj) { this.hlG.remove(this.hoverObj); this.hoverObj.traverse(n => { if (n.geometry) n.geometry.dispose(); }); this.hoverObj = null; }
    this.planesG.children.forEach(p => { p.material = this.mats.plane; });
    this.wplanesG.children.forEach(p => { p.material = this.mats.wplane; });
    this.waxesG.children.forEach(l => { const w = l.userData.wa; l.material.color.setHex(w.tag ? TAGCOL[w.tag] || C.wplane : C.wplane); l.material.linewidth = 1; });
    const h = this.hover;
    if (!h) return;
    this.wpointsG.children.forEach(m => m.material.color.setHex(m.userData.wpt.active ? 0xff5a00 : C.wplane));
    if (h.kind === 'workpoint') {
      const m = this.wpointsG.children.find(c => c.userData.wpt.id === h.id);
      if (m) m.material.color.setHex(0xff5a00);
      return;
    }
    if (h.kind === 'workaxis') {
      const l = this.waxesG.children.find(c => c.userData.wa.id === h.id);
      if (l) l.material.color.setHex(0xff5a00);
      return;
    }
    if (h.kind === 'workplane') {
      const p = this.wplanesG.children.find(c => c.userData.wp.id === h.id);
      if (p) p.material = this.mats.wplaneHover;
      return;
    }
    if (h.kind === 'plane') {
      const p = this.planesG.children.find(c => c.userData.plane.key === h.plane.key);
      if (p) p.material = this.mats.planeHover;
      return;
    }
    if (!this.model) return;
    this.hoverObj = h.kind === 'face' ? this.faceOverlay([h.index], this.mats.faceHover) : this.edgeOverlay([h.index], C.hover, 3);
    if (this.hoverObj) this.hlG.add(this.hoverObj);
  }

  /* ---------- Auswählen ---------- */
  /* Hervorhebung unter dem Zeiger, höchstens einmal je Bild (siehe pointermove) */
  updateHover(e) {
    const h = this.pickAt(e);
    const key = h ? `${h.kind}:${h.id ?? h.index ?? h.plane?.key}` : '';
    const old = this.hover ? `${this.hover.kind}:${this.hover.id ?? this.hover.index ?? this.hover.plane?.key}` : '';
    if (key !== old) { this.hover = h; this.drawHover(); }
  }
  setPickMode(mode) {
    this.pickMode = mode;
    this.planesG.visible = mode === 'plane';
    this.hover = null;
    this.drawHover();
    this.canvas.style.cursor = mode === 'none' ? '' : 'pointer';
  }

  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  }

  /* Picks bleiben auch bei großen Baugruppen schnell: three.js prüft bei einem
     Pick jedes Dreieck des Netzes, bei einer importierten Baugruppe schnell
     über eine Million – das kostet mehrere Bildzeiten und ruckelt, sobald man
     die Maus bewegt. Deshalb werden zuerst die Hüllquader der Körper geprüft;
     im Weg liegen danach nur die Dreiecke und Kanten dieser Körper. */
  buildPickIndex() {
    const m = this.model;
    m.pick = (m.data.bodies || []).map(b => ({
      base: b && b.bbox ? new THREE.Box3(v3(b.bbox[0]), v3(b.bbox[1])) : null,
      box: null, tris: b && b.tris, evs: b && b.evs,
    }));
    this.pickBox = new THREE.Box3();
    this.pickPoint = new THREE.Vector3();
    this.movePickBoxes();
  }
  /* Hüllquader auf den Stand der Körper bringen (Explosionsansicht verschiebt sie) */
  movePickBoxes() {
    const m = this.model;
    if (!m || !m.pick) return;
    const o = this.explode || {}, bodies = m.data.bodies || [];
    m.pick.forEach((p, i) => {
      if (!p.base) { p.box = null; return; }
      const d = o[(bodies[i] || {}).id];
      p.box = d ? p.base.clone().translate(v3(d)) : p.base;
    });
  }
  /* Körper, deren Hüllquader der Strahl schneidet, von vorn nach hinten */
  pickCandidates(ray, pad = 0) {
    const out = [];
    for (const p of this.model.pick) {
      if (!p.box) continue;
      if (pad) this.pickBox.copy(p.box).expandByScalar(pad); else this.pickBox.copy(p.box);
      const q = ray.ray.intersectBox(this.pickBox, this.pickPoint);
      if (q) out.push([ray.ray.origin.distanceToSquared(q), p]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out;
  }
  /* Nächster Flächen-Treffer entlang des Strahls, wie ray.intersectObject(body) */
  raycastBody(ray) {
    const m = this.model;
    if (!m) return [];
    if (!m.pick) this.buildPickIndex();
    const idx = m.data.index, pos = m.geo.attributes.position.array;
    let best = null, bestT = Infinity;
    for (const [d0, p] of this.pickCandidates(ray)) {
      if (d0 > bestT * bestT) break;
      if (!p.tris) continue;
      for (let k = p.tris[0]; k < p.tris[1]; k += 3) {
        const t = triHit(ray.ray, pos, idx[k], idx[k + 1], idx[k + 2]);
        if (t >= 0 && t < bestT) { bestT = t; best = { distance: t, faceIndex: k / 3, point: ray.ray.at(t, new THREE.Vector3()) }; }
      }
    }
    return best ? [best] : [];
  }
  /* Nächste Kante entlang des Strahls, wie ray.intersectObject(edges) */
  raycastEdges(ray, limit = Infinity) {
    const m = this.model;
    if (!m) return [];
    if (!m.pick) this.buildPickIndex();
    const ep = m.edges.geometry.attributes.position.array;
    const thr = ray.params.Line.threshold, out = [];
    for (const [d0, p] of this.pickCandidates(ray, thr)) {
      if (d0 > limit * limit || !p.evs) continue;
      for (let i = p.evs[0]; i + 1 < p.evs[1]; i += 2) {
        const t = segHit(ray.ray, ep, i, i + 1, thr);
        if (t >= 0 && t <= limit) out.push({ distance: t, index: i, point: ray.ray.at(t, new THREE.Vector3()) });
      }
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  /* Nächster Punkt am Modell von einem Strahl aus: der kurze Weg vom Zeiger zur
     Modellkante. Außerhalb der Silhouette liegt der nächste Punkt einer
     Oberfläche an der Silhouette, und die folgt den Kanten des Netzes. Die
     Hüllquader der Körper geben die Reihenfolge und die Abbruchgrenze, damit
     auch bei großen Baugruppen nur wenige Netze geprüft werden. */
  nearestOnModel(raycaster) {
    const m = this.model;
    if (!m) return null;
    if (!m.pick) this.buildPickIndex();
    const ray = raycaster.ray, pos = m.geo.attributes.position.array, idx = m.data.index;
    const cands = [], c = new THREE.Vector3(), half = new THREE.Vector3();
    for (const p of m.pick) {
      if (!p.box || !p.tris) continue;
      p.box.getCenter(c); p.box.getSize(half);
      cands.push([Math.max(0, ray.distanceToPoint(c) - half.length() * 0.5), p]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const q = new THREE.Vector3();
    let best = null, budget = 400000;
    for (const [lb, p] of cands) {
      if (budget <= 0 || (best && lb >= best.dist)) break;
      for (let k = p.tris[0]; k < p.tris[1]; k += 3) {
        for (let e = 0; e < 3; e++) {
          const dist = segNear(ray, pos, idx[k + e], idx[k + (e + 1) % 3], q);
          if (!best || dist < best.dist) best = { dist, point: q.clone() };
        }
        budget -= 3;
        if (budget <= 0) break;
      }
    }
    return best;
  }
  /* Punkt am Modell unter dem Zeiger: Fläche oder Kante, wie beim Auswählen */
  hitAtPointer(e) {
    if (!this.model) return null;
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const wpp = this.worldPerPixel();
    const hits = this.raycastBody(this.ray);
    this.ray.params.Line.threshold = wpp * 10;
    const eh = this.raycastEdges(this.ray, hits.length ? hits[0].distance + wpp * 12 : Infinity);
    if (hits.length && (!eh.length || hits[0].distance <= eh[0].distance)) return hits[0].point;
    return eh.length ? eh[0].point : null;
  }
  /* Drehpunkt zum Zeiger: der Punkt am Modell, der dem Zeiger am nächsten
     liegt – nicht nur ein Treffer unter dem Zeiger. Bei langen Teilen steht der
     Zeiger neben dem Detail, und die Mitte des Körpers ist weit davon weg. */
  pivotNearPointer(e) {
    const p = this.hitAtPointer(e);
    if (p) return p;
    if (!this.model) return null;
    const near = this.nearestOnModel(this.ray);
    return near ? near.point : null;
  }
  /* Zoomen am Punkt unter dem Zeiger: OrbitControls verankert das Zoomen über die
     Zielentiefe. Diese Tiefe auf die Oberfläche unter dem Zeiger zu legen hält
     die Bildstelle unter der Maus fest – bei langen Teilen wäre sonst die
     Körpermitte verankert und das Detail wandert beim Zoomen aus dem Bild.
     Nur Perspektive: die orthografische Bildgröße kommt aus dem Abstand zum
     Zielpunkt, und das Zoomen folgt dort ohnehin dem Zeiger. */
  zoomAnchorAtPointer(e) {
    if (this.camera !== this.perspCam) return;
    const p = this.hitAtPointer(e);
    if (!p) return;
    const cam = this.camera, fwd = cam.getWorldDirection(new THREE.Vector3());
    const d = p.clone().sub(cam.position).dot(fwd);
    if (d > 0) this.controls.target.copy(cam.position).addScaledVector(fwd, d);
  }

  pickAt(e) {
    const mode = this.pickMode;
    if (mode === 'none') return null;
    if (mode === 'region') { const i = this.pickRegion(e); return i == null ? null : { kind: 'region', index: i }; }
    this.ray.setFromCamera(this.ndc(e), this.camera);
    let faceHit = null;
    if (this.model) {
      const hits = this.raycastBody(this.ray);
      if (hits.length) faceHit = hits[0];
    }
    if (mode === 'edge' || mode === 'any') { const ph = this.pickPointAt(e); if (ph) return ph; const ah = this.pickAxisAt(e); if (ah) return ah; }
    if (mode === 'edge') return this.pickEdgeAt(e, faceHit);
    // Auswahlpriorität: Standard = Kanten nahe am Zeiger zuerst; Fläche/Körper: liegt eine Fläche unter dem
    // Zeiger, gewinnt sie – Kanten nur daneben (z. B. am Umriss)
    if (mode === 'any' && !(faceHit && (this.pickPrio === 'flaeche' || this.pickPrio === 'koerper'))) { const eh = this.pickEdgeAt(e, faceHit); if (eh) return eh; }
    if (mode === 'face' || mode === 'plane' || mode === 'any') {
      let best = null;
      if (faceHit) {
        const fi = this.model.triFace[faceHit.faceIndex];
        const info = this.model.data.faces[fi];
        if (info && (mode !== 'plane' || info.type === 'PLANE')) best = { kind: 'face', index: fi, info, distance: faceHit.distance, point: faceHit.point ? faceHit.point.toArray() : null };
      }
      if (mode === 'plane') {
        const ph = this.ray.intersectObjects(this.planesG.children, false)[0];
        // Körperflächen gehen vor: die halbdurchsichtigen Ursprungsebenen schneiden oft durch das Teil
        // und würden sonst die sichtbare Fläche verdecken (Ebene außerhalb des Körpers anklicken oder im Browser wählen)
        if (ph && !best && (!faceHit || ph.distance < faceHit.distance)) {
          best = { kind: 'plane', plane: ph.object.userData.plane, distance: ph.distance };
        }
        if (this.wplanesG.visible) {
          const wh = this.ray.intersectObjects(this.wplanesG.children, false)[0];
          if (wh && (!best || wh.distance < best.distance + 1e-6) && (!faceHit || wh.distance < faceHit.distance + 1e-3)) {
            const w = wh.object.userData.wp;
            best = { kind: 'workplane', id: w.id, plane: w.plane, distance: wh.distance };
          }
        }
      }
      return best;
    }
    return null;
  }

  /* Körperkante unter dem Zeiger (verdeckte Kanten zählen nicht) */
  pickEdgeAt(e, faceHit) {
    if (!this.model) return null;
    if (faceHit === undefined) {
      this.ray.setFromCamera(this.ndc(e), this.camera);
      const hits = this.raycastBody(this.ray);
      faceHit = hits.length ? hits[0] : null;
    }
    {
      const wpp = this.worldPerPixel();
      this.ray.params.Line.threshold = wpp * 10;
      const limit = faceHit ? faceHit.distance + wpp * 12 : Infinity;
      const hits = this.raycastEdges(this.ray, limit);
      for (const h of hits) {
        const ei = this.model.vertEdge[h.index];
        if (ei >= 0) return { kind: 'edge', index: ei, info: this.model.data.edges[ei], point: h.point ? h.point.toArray() : null };
      }
      return null;
    }
  }

  /* Ist ein Raumpunkt von der Kamera aus zu sehen (nicht vom Körper verdeckt)? */
  isVisible(p) {
    if (!this.model) return true;
    const pt = new THREE.Vector3(p[0], p[1], p[2]);
    const v = pt.clone().project(this.camera);
    this.ray.setFromCamera(new THREE.Vector2(v.x, v.y), this.camera);
    const d = this.ray.ray.origin.distanceTo(pt);
    const hit = this.raycastBody(this.ray)[0];
    return !hit || hit.distance > d - this.worldPerPixel() * 4;
  }

  /* Hervorhebung einer Körperkante von außen setzen (Skizzen-Editor) */
  hoverEdge(index) {
    const old = this.hover && this.hover.kind === 'edge' ? this.hover.index : null;
    if (old === index) return;
    this.hover = index == null ? null : { kind: 'edge', index };
    this.drawHover();
  }

  initEvents() {
    const cv = this.canvas;
    let down = null;
    // OrbitControls behandelt Mausrad und Mitteltaste selbst. Dieser Listener
    // hält nur den schnellen Renderpfad offen, bevor der Treiber wieder
    // heruntertaktet.
    cv.addEventListener('wheel', () => this.wakeRenderer(), { passive: true });
    // Mausbewegung über dem Modell zählt als Bedienung: das Warmzeichnen soll schon laufen, wenn das Drehen beginnt
    cv.addEventListener('pointermove', () => { this.lastInput = performance.now(); }, { passive: true });
    cv.addEventListener('pointerdown', e => {
      if (e.button === 0 || e.button === 1) this.wakeRenderer();
      if (this.navTool && e.button === 0) return;
      const ti = e.button === 0 && !this.sketchHandler ? this.triadHit(e) : -1;
      if (ti >= 0) {
        this.dragTriad = ti >= 3
          ? { i: ti, start: this.triadAngleAt(e, ti - 3), v0: this.triad.axis === ti - 3 ? this.triad.angle || 0 : 0 }
          : { i: ti, start: this.triadValueAt(e, ti), v0: this.triad.values[ti] || 0 };
        cv.setPointerCapture(e.pointerId);
        down = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 0 && !this.sketchHandler && this.manipHit(e)) {
        this.dragManip = { start: this.manipValueAt(e), v0: this.manip.value };
        cv.setPointerCapture(e.pointerId);
        down = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
      /* Auswahlwerkzeug: Fenster (Vorgabe), Freiform (auch Alt) oder Farbauswahl – mit gedrückter Taste über
         das Modell malen, jede überstrichene Fläche/Kante kommt dazu */
      if (e.button === 0 && this.boxSelect && !this.sketchHandler && !e.altKey && this.selTool === 'paint') { this.paint = new Set(); this.paintAt(e); }
      else if (e.button === 0 && this.boxSelect && (e.altKey || this.selTool === 'freeform') && !this.sketchHandler) this.lasso = [{ x: e.clientX, y: e.clientY }];
      if (this.sketchHandler && e.button === 0) this.sketchHandler.onPointerDown(e);
    });
    cv.addEventListener('pointermove', e => {
      if (this.dragTriad) {
        const D = this.dragTriad;
        if (D.i >= 3) {
          // Drehring: Winkel in 5°-Schritten, mit Umschalt in 1°
          const a = this.triadAngleAt(e, D.i - 3);
          if (a != null && D.start != null) {
            // schrittweise aufsummieren, damit auch mehr als eine halbe Umdrehung in einem Zug geht
            let inc = a - D.start; inc -= 360 * Math.round(inc / 360);
            D.start = a; D.sum = (D.sum || 0) + inc;
            const step = e.shiftKey ? 1 : 5, v = Math.round((D.v0 + D.sum) / step) * step;
            if (v !== this.triad.angle || this.triad.axis !== D.i - 3) { this.triad.angle = v; this.triad.axis = D.i - 3; this.triad.onRotate(D.i - 3, v); }
          }
          return;
        }
        const t = this.triadValueAt(e, D.i);
        if (t != null && D.start != null) {
          const step = e.shiftKey ? 0.1 : (this.worldPerPixel() > 0.2 ? 1 : 0.5);
          const v = Math.round((D.v0 + (t - D.start)) / step) * step;
          if (v !== this.triad.values[D.i]) { this.triad.values[D.i] = v; this.placeTriad(); if (this.triad.onChange) this.triad.onChange(D.i, v); }
        }
        return;
      }
      if (this.dragManip) {
        const t = this.manipValueAt(e);
        if (t != null && this.dragManip.start != null) {
          let v = this.dragManip.v0 + (t - this.dragManip.start);
          const step = e.shiftKey ? 0.1 : (this.worldPerPixel() > 0.2 ? 1 : 0.5);
          v = Math.round(v / step) * step;
          if (v !== this.manip.value) { this.updateManipulator(v); if (this.manip.onChange) this.manip.onChange(v); }
        }
        return;
      }
      if (this.navTool) return;
      if (this.paint && (e.buttons & 1)) { this.paintAt(e); return; }
      // Freiformauswahl: mit Alt einen Zug über das Modell ziehen
      if (this.lasso && (e.buttons & 1)) {
        const q = this.lasso[this.lasso.length - 1];
        if (Math.abs(e.clientX - q.x) + Math.abs(e.clientY - q.y) > 3) { this.lasso.push({ x: e.clientX, y: e.clientY }); this.drawLasso(); }
        return;
      }
      // Fensterauswahl: Rahmen aufziehen, solange die linke Taste gedrückt ist
      if (this.boxSelect && down && (e.buttons & 1) && !this.sketchHandler) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          const rc = cv.getBoundingClientRect();
          if (!this.boxEl) { this.boxEl = document.createElement('div'); this.boxEl.className = 'selbox'; cv.parentElement.appendChild(this.boxEl); }
          const x0 = Math.min(down.x, e.clientX) - rc.left, y0 = Math.min(down.y, e.clientY) - rc.top;
          Object.assign(this.boxEl.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
          this.boxEl.classList.toggle('cross', dx < 0);
        }
        return;
      }
      if (this.sketchHandler) { this.sketchHandler.onPointerMove(e); return; }
      if ((this.manipG || this.triadG) && !e.buttons) this.canvas.style.cursor = (this.triadHit(e) >= 0 || this.manipHit(e)) ? 'grab' : (this.pickMode === 'none' ? '' : 'pointer');
      if (e.buttons) return;
      // Der Pick folgt erst im nächsten Bild (updateHover): bei einer großen
      // Baugruppe laufen weit mehr Mausbewegungen als Bilder, und jeder Pick
      // kostet sonst die halbe Bildzeit.
      this.pendingHover = { clientX: e.clientX, clientY: e.clientY };
    });
    cv.addEventListener('pointerleave', () => {
      if (this.hover) { this.hover = null; this.drawHover(); }
      if (this.sketchHandler) this.sketchHandler.onPointerLeave();
    });
    cv.addEventListener('pointerup', e => {
      if (this.dragTriad) {
        this.dragTriad = null;
        down = null;
        if (this.triad && this.triad.onEnd) this.triad.onEnd();
        return;
      }
      if (this.dragManip) {
        this.dragManip = null;
        down = null;
        if (this.manip && this.manip.onEnd) this.manip.onEnd(this.manip.value);
        return;
      }
      if (e.button !== 0 || !down) return;
      const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4;
      const start = down;
      down = null;
      if (this.paint) {
        const n = this.paint.size;
        this.paint = null;
        // gemalt: fertig; nur geklickt (ohne Bewegung): normaler Klick
        if (moved || n > 1) { if (this.cb.onPaintEnd) this.cb.onPaintEnd(); return; }
      }
      if (this.lasso) {
        const pts = this.lasso;
        this.lasso = null;
        if (this.lassoEl) { this.lassoEl.remove(); this.lassoEl = null; this.lassoPl = null; }
        if (pts.length > 2 && this.cb.onBoxSelect) this.cb.onBoxSelect(this.edgesInPath(pts), e);
        return;
      }
      if (this.boxEl) {
        this.boxEl.remove(); this.boxEl = null;
        if (moved && this.boxSelect && this.cb.onBoxSelect) { this.cb.onBoxSelect(this.edgesInBox(start, { x: e.clientX, y: e.clientY }), e); return; }
      }
      if (this.sketchHandler) { this.sketchHandler.onPointerUp(e, moved); return; }
      if (moved) return;
      const h = this.pickAt(e);
      if (this.cb.onPick) this.cb.onPick(h, e);
    });
    cv.addEventListener('dblclick', e => {
      if (this.sketchHandler) { this.sketchHandler.onDblClick(e); return; }
      if (this.navTool || !this.cb.onDblPick) return;
      this.cb.onDblPick(this.pickAt(e), e);
    });
  }

  /* Farbauswahl: was unter dem Zeiger liegt (nach Auswahlmodus), einmal je Zug melden */
  paintAt(e) {
    const h = this.pickAt(e);
    if (!h || (h.kind !== 'face' && h.kind !== 'edge')) return;
    const key = h.kind + h.index;
    if (this.paint.has(key)) return;
    this.paint.add(key);
    if (this.cb.onPaint) this.cb.onPaint(h, e);
  }

  /* Fläche unter dem Zeiger, unabhängig vom Auswahlmodus (für das Projizieren in der Skizze) */
  faceIndexAt(e) {
    if (!this.model) return null;
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const h = this.raycastBody(this.ray)[0];
    if (!h) return null;
    const fi = this.model.triFace[h.faceIndex];
    return fi >= 0 ? fi : null;
  }

  /* Freiformauswahl: mit Alt eine Schleife über das Modell ziehen */
  drawLasso() {
    const rc = this.canvas.getBoundingClientRect();
    if (!this.lassoEl) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'selline');
      this.lassoPl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      svg.appendChild(this.lassoPl);
      this.canvas.parentElement.appendChild(svg);
      this.lassoEl = svg;
    }
    this.lassoEl.setAttribute('width', Math.max(1, Math.round(rc.width)));
    this.lassoEl.setAttribute('height', Math.max(1, Math.round(rc.height)));
    this.lassoPl.setAttribute('points', this.lasso.map(p => (p.x - rc.left) + ',' + (p.y - rc.top)).join(' '));
  }

  /* Kanten innerhalb der gezogenen Schleife. Gezählt wird wie beim Rahmen nach
     rechts, also nur was ganz innen liegt: Was die Linie nur schneidet, würde
     sonst schon bei einem einzigen Strich durch ein Bauteil dessen Kanten treffen. */
  edgesInPath(pts) {
    if (!this.model || pts.length < 3) return [];
    const rc = this.canvas.getBoundingClientRect();
    const poly = pts.map(p => [p.x - rc.left, p.y - rc.top]);
    const P = this.model.data.edgePositions, v = new THREE.Vector3(), out = [];
    const inside = i => {
      v.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).project(this.camera);
      if (v.z >= 1) return false;
      const x = (v.x + 1) / 2 * rc.width, y = (1 - v.y) / 2 * rc.height;
      let hit = false;
      for (let a = poly.length - 1, b = 0; b < poly.length; a = b++) {
        const ya = poly[a][1], yb = poly[b][1];
        if ((ya > y) !== (yb > y) && x < (poly[b][0] - poly[a][0]) * (y - ya) / (yb - ya) + poly[a][0]) hit = !hit;
      }
      return hit;
    };
    this.model.data.edges.forEach((ed, k) => {
      let all = true;
      for (let i = ed.start; i < ed.start + ed.count; i++) { if (!inside(i)) { all = false; break; } }
      if (all) out.push(k);
    });
    return out;
  }

  /* Kanten im Rahmen: nach rechts gezogen = ganz innen, nach links = berührt */
  edgesInBox(a, b) {
    if (!this.model) return [];
    const rc = this.canvas.getBoundingClientRect();
    const x0 = Math.min(a.x, b.x) - rc.left, x1 = Math.max(a.x, b.x) - rc.left, y0 = Math.min(a.y, b.y) - rc.top, y1 = Math.max(a.y, b.y) - rc.top;
    const crossing = b.x < a.x;
    const P = this.model.data.edgePositions, v = new THREE.Vector3(), out = [];
    const inside = i => { v.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).project(this.camera); const x = (v.x + 1) / 2 * rc.width, y = (1 - v.y) / 2 * rc.height; return x >= x0 && x <= x1 && y >= y0 && y <= y1 && v.z < 1; };
    this.model.data.edges.forEach((ed, k) => {
      let all = true, any = false;
      for (let i = ed.start; i < ed.start + ed.count; i++) { const ok = inside(i); all = all && ok; any = any || ok; if (crossing ? any : !all) break; }
      if (crossing ? any : all) out.push(k);
    });
    return out;
  }

  /* ---------- Schnittstelle für den Skizzen-Editor ---------- */
  setSketchHandler(h) {
    this.sketchHandler = h;
    this.setPickMode('none');
    this.canvas.style.cursor = h ? 'crosshair' : '';
    this.dirty = true;
  }
  planeUV(e, pl) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3(pl.n), v3(pl.o));
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, p)) return null;
    return toLocal(pl, [p.x, p.y, p.z]);
  }
  toScreen(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    return [(v.x + 1) / 2 * this.el.clientWidth, (1 - v.y) / 2 * this.el.clientHeight, v.z];
  }
  /* Pixel pro Millimeter auf einer Ebene an der Stelle (u, v) – für Fangradien und Pfeilgrößen */
  uvPerPixel(pl, u = 0, v = 0) {
    const a = this.toScreen(toWorld(pl, u, v)), b = this.toScreen(toWorld(pl, u + 1, v)), c = this.toScreen(toWorld(pl, u, v + 1));
    const px = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - a[0], c[1] - a[1]), 1e-6);
    return 1 / px;
  }

  /* ---------- Profile (geschlossene Flächen einer Skizze) ---------- */
  setRegions(pl, regions, selected) {
    if (!this.regionsG) { this.regionsG = new THREE.Group(); this.scene.add(this.regionsG); }
    this.disposeGroup(this.regionsG);
    if (!pl || !regions) return;
    regions.forEach((r, i) => {
      const contour = r.poly.map(p => new THREE.Vector2(p[0], p[1]));
      const holes = r.holePolys.map(h => h.map(p => new THREE.Vector2(p[0], p[1])));
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (_) { return; }
      const all = [...r.poly, ...r.holePolys.flat()];
      const pos = [];
      all.forEach(p => pos.push(...toWorld(pl, p[0], p[1])));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(tris.flat());
      const on = selected && selected[i];
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: on ? 0xf59e0b : 0x2563eb, transparent: true, opacity: on ? 0.45 : 0.1, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      m.renderOrder = 4;
      m.userData.region = i;
      this.regionsG.add(m);
    });
  }
  pickRegion(e) {
    if (!this.regionsG || !this.regionsG.children.length) return null;
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const hits = this.ray.intersectObjects(this.regionsG.children, false);
    if (!hits.length) return null;
    // die kleinste getroffene Fläche gewinnt (innere vor äußeren)
    return hits.map(h => h.object.userData.region).sort((a, b) => b - a)[0];
  }

  /* ---------- Kamera ---------- */
  animateTo(pos, target, remember = true) {
    // vorige Ansicht merken (Mit F-Tasten F5 „Vorherige Ansicht“)
    if (remember) { (this.viewHist ||= []).push([this.camera.position.clone(), this.controls.target.clone()]); if (this.viewHist.length > 20) this.viewHist.shift(); }
    this.anim = { t0: performance.now(), dur: 380, p0: this.camera.position.clone(), q0: this.controls.target.clone(), p1: pos, q1: target };
  }
  prevView() { const v = this.viewHist && this.viewHist.pop(); if (v) this.animateTo(v[0], v[1], false); return !!v; }
  stepAnim() {
    const a = this.anim;
    let t = Math.min(1, (performance.now() - a.t0) / a.dur);
    t = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    this.camera.position.lerpVectors(a.p0, a.p1, t);
    this.controls.target.lerpVectors(a.q0, a.q1, t);
    if (t >= 1) this.anim = null;
  }
  view(name, box) {
    const dir = v3(VIEWS[name] || VIEWS.iso).normalize();
    this.lookAlong(dir, box || this.bounds());
  }
  /* auf einen Bereich [[x0, y0, z0], [x1, y1, z1]] einpassen, Blickrichtung bleibt (z. B. eine Komponente bearbeiten) */
  fitBox(bb) {
    const box = new THREE.Box3(v3(bb[0]), v3(bb[1]));
    this.lookAlong(this.camera.position.clone().sub(this.controls.target).normalize(), box);
  }
  lookAlong(dir, box) {
    const c = box.getCenter(new THREE.Vector3());
    const R = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2);
    const vf = THREE.MathUtils.degToRad(this.perspCam.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * this.perspCam.aspect);
    const dist = R / Math.sin(Math.min(vf, hf) / 2) * 1.05;
    this.animateTo(c.clone().add(dir.clone().multiplyScalar(dist)), c);
  }
  /* Ansicht senkrecht auf eine Richtung (z. B. Flächennormale) */
  lookDir(n, box = this.bounds()) {
    const z = Math.abs(n[2]) > 0.999;
    this.lookAlong(new THREE.Vector3(z ? 0 : n[0], z ? -1e-4 * Math.sign(n[2]) : n[1], n[2]).normalize(), box);
  }
  /* Skizze: senkrecht auf die Ebene schauen („Ausrichten nach“); ohne Körper ein Bereich von ±60 mm um den Ursprung der Ebene */
  lookAtPlane(pl) {
    const box = this.bounds().clone();
    if (box.isEmpty()) box.setFromCenterAndSize(v3(pl.o), new THREE.Vector3(120, 120, 120));
    this.lookDir(pl.n, box);
  }
  fit() {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    // Körper und sichtbare Skizzen
    const box = this.bounds().clone();
    if (this.model) this.sketchG.traverse(o => { if (o.geometry && o.visible) { try { o.geometry.computeBoundingBox(); if (o.geometry.boundingBox && !o.geometry.boundingBox.isEmpty()) box.union(o.geometry.boundingBox); } catch (_) { /* egal */ } } });
    this.lookAlong(dir, box);
  }

  /* ---------- Ansichtswürfel ---------- */
  initCube() {
    const r = this.cubeRenderer = new THREE.WebGLRenderer({ canvas: this.cubeCanvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(110, 110, false);
    this.cubeScene = new THREE.Scene();
    this.cubeCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.cubeCam.up.set(0, 0, 1);
    const labels = ['RECHTS', 'LINKS', 'OBEN', 'UNTEN', 'VORNE', 'HINTEN'].map(s => t(s));
    this.cubeViews = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    this.cubeMats = labels.map(t => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#eef1f4'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#8b96a2'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
      g.fillStyle = '#2b333c'; g.font = '600 22px "IBM Plex Sans", "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 64, 66);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: tex });
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.rotateX(Math.PI / 2);
    this.cube = new THREE.Mesh(geo, this.cubeMats);
    this.cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6b7682 })));
    this.cubeScene.add(this.cube);
    const axes = new THREE.AxesHelper(0.85);
    axes.position.set(-0.62, -0.62, -0.62);
    this.cubeScene.add(axes);
    // X/Y/Z am Achsenkreuz des Würfels
    [['X', [0.4, -0.62, -0.62], C.axisX], ['Y', [-0.62, 0.4, -0.62], C.axisY], ['Z', [-0.62, -0.62, 0.4], C.axisZ]].forEach(([ch, p, col]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: achsBuchstabe(ch, col), depthTest: false, transparent: true }));
      sp.scale.set(0.3, 0.3, 1); sp.position.set(...p);
      this.cubeScene.add(sp);
    });
    const ray = new THREE.Raycaster();
    let hoverIdx = -1;
    const hitRaw = e => {
      const rc = this.cubeCanvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1), this.cubeCam);
      return ray.intersectObject(this.cube, false)[0] || null;
    };
    const hit = e => { const h = hitRaw(e); return h ? h.face.materialIndex : -1; };
    // Richtung zu Fläche, Kante oder Ecke des Würfels (Randbereich = Kante/Ecke)
    const dirAt = e => {
      const h = hitRaw(e);
      if (!h) return null;
      const p = h.point, d = [p.x, p.y, p.z].map(v => (Math.abs(v) > 0.5 - 0.17 ? Math.sign(v) : 0));
      return d.some(v => v) ? d : null;
    };
    this.cubeCanvas.addEventListener('pointermove', e => {
      const i = hit(e);
      if (i === hoverIdx) return;
      if (hoverIdx >= 0) this.cubeMats[hoverIdx].color.set(0xffffff);
      hoverIdx = i;
      if (i >= 0) this.cubeMats[i].color.set(0xb9d0ff);
      this.cubeCanvas.style.cursor = i >= 0 ? 'pointer' : '';
      this.dirty = true;
    });
    this.cubeCanvas.addEventListener('pointerleave', () => {
      if (hoverIdx >= 0) this.cubeMats[hoverIdx].color.set(0xffffff);
      hoverIdx = -1;
      this.dirty = true;
    });
    this.cubeCanvas.addEventListener('click', e => {
      const d = dirAt(e);
      if (!d) return;
      const n = d.filter(v => v).length;
      if (n === 1) { const i = hit(e); if (i >= 0) this.view(this.cubeViews[i]); return; }
      // Kante oder Ecke: schräg darauf schauen (Kanten mit Z leicht versetzt, damit „oben“ eindeutig bleibt)
      this.lookAlong(new THREE.Vector3(d[0] || (d[2] ? 1e-4 : 0), d[1] || (d[2] && !d[0] ? -1e-4 : 0), d[2]).normalize(), this.bounds());
    });
  }
  renderCube() {
    const d = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(3.4);
    this.cubeCam.position.copy(d);
    this.cubeCam.lookAt(0, 0, 0);
    this.cubeRenderer.render(this.cubeScene, this.cubeCam);
  }

  /* ---------- Skizzen anzeigen (nicht aktive Skizzen) ---------- */
  setSketches(list) {
    this.disposeGroup(this.sketchG);
    list.forEach(sk => {
      const pm = pointMap(sk);
      if (!sk.plane) {
        /* 3D-Skizze: ihre Punkte sind Weltkoordinaten, die Kurven liegen direkt im Raum */
        const arr = [], cons = [];
        sk.curves.forEach(c => {
          const pts = curvePoints3(sk, c, pm, 64);
          const target = c.cons ? cons : arr;
          for (let i = 0; i < pts.length - 1; i++) target.push(...pts[i], ...pts[i + 1]);
        });
        if (arr.length) this.sketchG.add(this.fatLines(arr, C.sketchIdle, 1.6));
        if (cons.length) this.sketchG.add(this.fatLines(cons, 0xc98a52, 1, { dashed: true, dashSize: 2, gapSize: 1.5 }));
        return;
      }
      bindTextPaths(sk, c => curvePolyline(c, pm, 64));
      const arr = [], cons = [];
      sk.curves.forEach(c => {
        const pts = curvePolyline(c, pm, 64).map(p => toWorld(sk.plane, p[0], p[1]));
        const target = c.cons ? cons : arr;
        for (let i = 0; i < pts.length - 1; i++) target.push(...pts[i], ...pts[i + 1]);
      });
      (sk.texts || []).forEach(t => {
        const a = pm.get(t.p);
        if (!a) return;
        const o = textOutline(t.text, t.h, t.font);
        if (!o) { loadFont(t.font, () => this.setSketches(list)); return; }
        placeText(t, [a.x, a.y], o).loops.forEach(l => { for (let i = 0; i < l.length - 1; i++) arr.push(...toWorld(sk.plane, l[i][0], l[i][1]), ...toWorld(sk.plane, l[i + 1][0], l[i + 1][1])); });
      });
      if (arr.length) this.sketchG.add(this.fatLines(arr, C.sketchIdle, 1.6));
      if (cons.length) this.sketchG.add(this.fatLines(cons, 0xc98a52, 1, { dashed: true, dashSize: 2, gapSize: 1.5 }));
    });
  }

  /* Kamera senkrecht auf eine Skizzenebene ausrichten */
  focusPlane(plane, extraBox) {
    const n = v3(plane.n).normalize();
    let dir = n.clone();
    if (Math.abs(n.z) > 0.999) dir = new THREE.Vector3(0, -0.0001 * Math.sign(n.z || 1), n.z).normalize();
    const box = this.bounds();
    if (extraBox && !extraBox.isEmpty()) box.union(extraBox);
    const c = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Vector3().subVectors(c, v3(plane.o));
    const onPlane = c.clone().sub(n.clone().multiplyScalar(offset.dot(n)));
    const R = Math.max(30, box.getSize(new THREE.Vector3()).length() / 2);
    const vf = THREE.MathUtils.degToRad(this.perspCam.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * this.perspCam.aspect);
    this.animateTo(onPlane.clone().add(dir.multiplyScalar(R / Math.sin(Math.min(vf, hf) / 2) * 1.05)), onPlane);
  }
}
