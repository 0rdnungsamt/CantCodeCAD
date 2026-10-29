// Anbindung an PlaneGCS, den Bedingungslöser aus FreeCAD (als WebAssembly).
// Übersetzt eine Skizze in Solver-Primitive, löst sie und schreibt das Ergebnis zurück.
import * as PG from '/cdn/npm/@salusoft89/planegcs@1.3.0/dist/index.js';
import { pointMap, curveMap, VIRTUAL_POINTS, VIRTUAL_CURVES } from './model.js';

const WASM = '/cdn/npm/@salusoft89/planegcs@1.3.0/dist/planegcs_dist/planegcs.wasm';
let wrapper = null;
let loading = null;

export function loadSolver() {
  if (!loading) loading = PG.make_gcs_wrapper(WASM).then(w => { wrapper = w; return w; });
  return loading;
}
export const solverReady = () => !!wrapper;

const RAD = Math.PI / 180;

/* Skizze → Liste von PlaneGCS-Primitiven. Mehrteilige Regeln bekommen IDs "regel#n". */
export function toPrimitives(sk, drag) {
  const pm = pointMap(sk), cm = curveMap(sk);
  const kind = id => (cm.has(id) ? cm.get(id).type : pm.has(id) ? 'point' : null);
  const P = [], params = [];
  Object.entries(VIRTUAL_POINTS).forEach(([id, [x, y]]) => P.push({ id, type: 'point', x, y, fixed: true }));
  Object.values(VIRTUAL_CURVES).forEach(c => P.push({ id: c.id, type: 'line', p1_id: c.p1, p2_id: c.p2 }));
  const fixed = new Set(sk.rules.filter(r => r.type === 'fix').map(r => r.p));
  sk.points.forEach(p => P.push({ id: p.id, type: 'point', x: p.x, y: p.y, fixed: fixed.has(p.id) || !!p.ref }));
  [...sk.curves, ...(sk.helpers || [])].forEach(c => {
    if (c.type === 'line') P.push({ id: c.id, type: 'line', p1_id: c.p1, p2_id: c.p2 });
    else if (c.type === 'circle') {
      P.push({ id: c.id, type: 'circle', c_id: c.c, radius: c.r });
      if (c.ref) P.push({ id: c.id + '#ref', type: 'circle_radius', c_id: c.id, radius: c.r });
    }
    else if (c.type === 'arc') {
      P.push({ id: c.id, type: 'arc', c_id: c.c, start_id: c.s, end_id: c.e, radius: c.r, start_angle: c.a0, end_angle: c.a1 });
      P.push({ id: c.id + '#arc', type: 'arc_rules', a_id: c.id });
    }
  });
  const center = id => { const c = cm.get(id); return c && (c.type === 'circle' || c.type === 'arc') ? c.c : null; };
  // Ellipsen, an denen eine Bedingung hängt, als echte Solver-Ellipse (wie FreeCAD: Mittelpunkt, Brennpunkt, kleine Halbachse)
  // und über die Achsenpunkte a/b an ihre Scheitel gebunden.
  const used = new Set();
  sk.rules.forEach(r => { if (r.type === 'pointOnCurve') used.add(r.c); if (r.type === 'tangent') { used.add(r.a); used.add(r.b); } });
  const solverEllipse = new Set(), skipRules = new Set();
  [...sk.curves, ...(sk.helpers || [])].forEach(c => {
    if (c.type !== 'ellipse' || !used.has(c.id)) return;
    const C = pm.get(c.c), A = pm.get(c.a), B = pm.get(c.b);
    if (!C || !A || !B) return;
    const ra = Math.hypot(A.x - C.x, A.y - C.y), ua = [(A.x - C.x) / (ra || 1), (A.y - C.y) / (ra || 1)];
    const rb = Math.abs(-(B.x - C.x) * ua[1] + (B.y - C.y) * ua[0]);
    if (ra < 1e-9 || rb < 1e-9) return;
    const aMajor = ra >= rb, M = aMajor ? A : B, m = aMajor ? B : A;
    const RM = Math.max(ra, rb), Rm = Math.max(1e-6, Math.min(ra, rb) * (Math.abs(ra - rb) < 1e-6 ? 0.999 : 1));
    const um = [(M.x - C.x), (M.y - C.y)], lm = Math.hypot(um[0], um[1]) || 1;
    um[0] /= lm; um[1] /= lm;
    const cf = Math.sqrt(Math.max(1e-12, RM * RM - Rm * Rm));
    P.push({ id: c.id + '#f', type: 'point', x: C.x + um[0] * cf, y: C.y + um[1] * cf, fixed: false });
    P.push({ id: c.id, type: 'ellipse', c_id: c.c, focus1_id: c.id + '#f', radmin: Rm });
    // Scheitel: beide Achsenpunkte liegen auf der Ellipse, der Brennpunkt auf der Hauptachse (Senkrecht-Regel der Achsen bleibt)
    P.push({ id: c.id + '#ka', type: 'point_on_ellipse', p_id: M.id, e_id: c.id });
    P.push({ id: c.id + '#kb', type: 'point_on_ellipse', p_id: m.id, e_id: c.id });
    P.push({ id: c.id + '#kf', type: 'point_on_line_ppp', p_id: c.id + '#f', lp1_id: c.c, lp2_id: M.id });
    solverEllipse.add(c.id);
  });
  // Tangente (CCW-Umlaufsinn wie PlaneGCS) einer Kurve an der Stelle q, für die Wahl 0°/180° bei angle_via_point
  const tanAt = (id, q) => {
    const c = cm.get(id);
    if (!c) return [1, 0];
    if (c.type === 'line') { const a = pm.get(c.p1), b = pm.get(c.p2); return [b.x - a.x, b.y - a.y]; }
    if (c.type === 'circle' || c.type === 'arc') { const o = pm.get(c.c); return [-(q[1] - o.y), q[0] - o.x]; }
    if (c.type === 'ellipse') {
      const C = pm.get(c.c), A = pm.get(c.a), rot = Math.atan2(A.y - C.y, A.x - C.x), cr = Math.cos(rot), sr = Math.sin(rot);
      const lx = (q[0] - C.x) * cr + (q[1] - C.y) * sr, ly = -(q[0] - C.x) * sr + (q[1] - C.y) * cr;
      const ra = Math.hypot(A.x - C.x, A.y - C.y), B = pm.get(c.b), rb = Math.abs(-(B.x - C.x) * sr + (B.y - C.y) * cr) || 1;
      const t = Math.atan2(ly / rb, lx / ra), dx = -ra * Math.sin(t), dy = rb * Math.cos(t);
      return [dx * cr - dy * sr, dx * sr + dy * cr];
    }
    return [1, 0];
  };
  // Abtastpunkte einer Kurve (für den Startwert des Berührpunkts)
  const samplesOf = id => {
    const c = cm.get(id), out = [];
    if (!c) return out;
    if (c.type === 'line') { const a = pm.get(c.p1), b = pm.get(c.p2); for (let i = 0; i <= 64; i++) out.push([a.x + (b.x - a.x) * i / 64, a.y + (b.y - a.y) * i / 64]); }
    else if (c.type === 'circle' || c.type === 'arc') { const o = pm.get(c.c), a0 = c.type === 'arc' ? c.a0 : 0, a1 = c.type === 'arc' ? c.a1 : Math.PI * 2; for (let i = 0; i <= 128; i++) { const t = a0 + (a1 - a0) * i / 128; out.push([o.x + c.r * Math.cos(t), o.y + c.r * Math.sin(t)]); } }
    else if (c.type === 'ellipse') { const C = pm.get(c.c), A = pm.get(c.a), B = pm.get(c.b), rot = Math.atan2(A.y - C.y, A.x - C.x), cr = Math.cos(rot), sr = Math.sin(rot), ra = Math.hypot(A.x - C.x, A.y - C.y), rb = Math.abs(-(B.x - C.x) * sr + (B.y - C.y) * cr); for (let i = 0; i < 256; i++) { const t = i / 256 * Math.PI * 2, x = ra * Math.cos(t), y = rb * Math.sin(t); out.push([C.x + x * cr - y * sr, C.y + x * sr + y * cr]); } }
    return out;
  };
  const onCurve = (pid, cid, rid) => {
    const kc = kind(cid);
    if (kc === 'line') P.push({ id: rid, type: 'point_on_line_pl', p_id: pid, l_id: cid });
    else if (kc === 'circle') P.push({ id: rid, type: 'point_on_circle', p_id: pid, c_id: cid });
    else if (kc === 'arc') P.push({ id: rid, type: 'point_on_arc', p_id: pid, a_id: cid });
    else if (kc === 'ellipse' && solverEllipse.has(cid)) P.push({ id: rid, type: 'point_on_ellipse', p_id: pid, e_id: cid });
  };
  // Spline: Tangente = Hilfslinie des Tangentengriffs (auch mitten auf der Kurve); ohne Griff am Ende die Richtung
  // zum Nachbarpunkt (Catmull-Rom mit gespiegeltem Randpunkt)
  const splineEndLine = (cid, via, rid) => {
    const c = cm.get(cid);
    if (!c || c.type !== 'spline' || !via) return null;
    if (c.tan && c.tan[via] && cm.get(c.tan[via].l)) return c.tan[via].l;
    if (c.closed) return null;
    const n = c.pts.length, nb = c.pts[0] === via ? c.pts[1] : c.pts[n - 1] === via ? c.pts[n - 2] : null;
    if (!nb) return null;
    P.push({ id: rid, type: 'line', p1_id: via, p2_id: nb });
    return rid;
  };
  for (const r of sk.rules) {
    const id = r.id, k = [kind(r.a), kind(r.b)];
    if (skipRules.has(id)) continue;
    switch (r.type) {
      case 'horizontal':
        if (r.l) P.push({ id, type: 'horizontal_l', l_id: r.l }); else P.push({ id, type: 'horizontal_pp', p1_id: r.a, p2_id: r.b });
        break;
      case 'vertical':
        if (r.l) P.push({ id, type: 'vertical_l', l_id: r.l }); else P.push({ id, type: 'vertical_pp', p1_id: r.a, p2_id: r.b });
        break;
      case 'parallel': P.push({ id, type: 'parallel', l1_id: r.a, l2_id: r.b }); break;
      case 'perpendicular': P.push({ id, type: 'perpendicular_ll', l1_id: r.a, l2_id: r.b }); break;
      case 'coincident': P.push({ id, type: 'p2p_coincident', p1_id: r.a, p2_id: r.b }); break;
      case 'concentric': P.push({ id, type: 'p2p_coincident', p1_id: center(r.a), p2_id: center(r.b) }); break;
      case 'symmetric': P.push({ id, type: 'p2p_symmetric_ppl', p1_id: r.a, p2_id: r.b, l_id: r.l }); break;
      case 'equal': {
        if (k[0] === 'line' && k[1] === 'line') P.push({ id, type: 'equal_length', l1_id: r.a, l2_id: r.b });
        else if (k[0] === 'circle' && k[1] === 'circle') P.push({ id, type: 'equal_radius_cc', c1_id: r.a, c2_id: r.b });
        else if (k[0] === 'circle' && k[1] === 'arc') P.push({ id, type: 'equal_radius_ca', c1_id: r.a, a2_id: r.b });
        else if (k[0] === 'arc' && k[1] === 'circle') P.push({ id, type: 'equal_radius_ca', c1_id: r.b, a2_id: r.a });
        else if (k[0] === 'arc' && k[1] === 'arc') P.push({ id, type: 'equal_radius_aa', a1_id: r.a, a2_id: r.b });
        break;
      }
      case 'tangent': {
        // Tangential an einem gemeinsamen Endpunkt: Winkel 0 oder 180° zwischen den Tangenten
        // (wie FreeCAD; die reine Berührbedingung wäre dort numerisch redundant).
        if (k[0] === 'spline' || k[1] === 'spline') {
          // nur am gemeinsamen Endpunkt: Hilfslinie Endpunkt → Nachbarpunkt ist die Tangente
          const la = k[0] === 'spline' ? splineEndLine(r.a, r.via, id + '#sa') : r.a, lb = k[1] === 'spline' ? splineEndLine(r.b, r.via, id + '#sb') : r.b;
          if (!la || !lb) break;
          const ka2 = k[0] === 'spline' ? 'line' : k[0], kb2 = k[1] === 'spline' ? 'line' : k[1];
          const [L, O, kO] = ka2 === 'line' ? [la, lb, kb2] : [lb, la, ka2];
          if (kO === 'line') P.push({ id, type: 'parallel', l1_id: L, l2_id: O });
          else if (kO === 'circle') P.push({ id, type: 'tangent_lc', l_id: L, c_id: O });
          else if (kO === 'arc') P.push({ id, type: 'tangent_la', l_id: L, a_id: O });
          else if (kO === 'ellipse' && solverEllipse.has(O)) P.push({ id, type: 'tangent_le', l_id: L, e_id: O });
          break;
        }
        if (r.via) { P.push({ id, type: 'angle_via_point', crv1_id: r.a, crv2_id: r.b, p_id: r.via, angle: r.flip ? Math.PI : 0 }); break; }
        if (k[0] === 'ellipse' || k[1] === 'ellipse') {
          const [e, o] = k[0] === 'ellipse' ? [r.a, r.b] : [r.b, r.a];
          if (!solverEllipse.has(e)) break;
          if (kind(o) === 'line') { P.push({ id, type: 'tangent_le', l_id: o, e_id: e }); break; }
          if (kind(o) === 'ellipse' && !solverEllipse.has(o)) break;
          // Berührpunkt als Hilfspunkt auf beiden Kurven, Tangenten gleich oder entgegengesetzt
          const se = samplesOf(e), so = samplesOf(o);
          let best = null, bd = Infinity;
          se.forEach(q => so.forEach(w => { const d = Math.hypot(q[0] - w[0], q[1] - w[1]); if (d < bd) { bd = d; best = [(q[0] + w[0]) / 2, (q[1] + w[1]) / 2]; } }));
          if (!best) break;
          const tp = id + '#t';
          P.push({ id: tp, type: 'point', x: best[0], y: best[1], fixed: false });
          onCurve(tp, e, id + '#1');
          onCurve(tp, o, id + '#2');
          const t1 = tanAt(e, best), t2 = tanAt(o, best);
          P.push({ id, type: 'angle_via_point', crv1_id: e, crv2_id: o, p_id: tp, angle: t1[0] * t2[0] + t1[1] * t2[1] >= 0 ? 0 : Math.PI });
          break;
        }
        const [a, b] = k[0] === 'line' ? [r.a, r.b] : k[1] === 'line' ? [r.b, r.a] : [r.a, r.b];
        const ka = kind(a), kb = kind(b);
        if (ka === 'line' && kb === 'circle') P.push({ id, type: 'tangent_lc', l_id: a, c_id: b });
        else if (ka === 'line' && kb === 'arc') P.push({ id, type: 'tangent_la', l_id: a, a_id: b });
        else if (ka === 'circle' && kb === 'circle') P.push({ id, type: 'tangent_cc', c1_id: a, c2_id: b });
        else if (ka === 'arc' && kb === 'arc') P.push({ id, type: 'tangent_aa', a1_id: a, a2_id: b });
        else if (ka === 'circle' && kb === 'arc') P.push({ id, type: 'tangent_ca', c_id: a, a_id: b });
        else if (ka === 'arc' && kb === 'circle') P.push({ id, type: 'tangent_ca', c_id: b, a_id: a });
        break;
      }
      case 'pointOnCurve': {
        const kc = kind(r.c);
        if (kc === 'line') P.push({ id, type: 'point_on_line_pl', p_id: r.p, l_id: r.c });
        else if (kc === 'circle') P.push({ id, type: 'point_on_circle', p_id: r.p, c_id: r.c });
        else if (kc === 'arc') P.push({ id, type: 'point_on_arc', p_id: r.p, a_id: r.c });
        else if (kc === 'ellipse' && solverEllipse.has(r.c)) P.push({ id, type: 'point_on_ellipse', p_id: r.p, e_id: r.c });
        break;
      }
      case 'collinear':
        // Endpunkte der zweiten Linie auf die Gerade der ersten; mit nur einem freien Endpunkt dazu parallel
        (r.pts || []).forEach((p, k) => P.push({ id: k ? `${id}#${k}` : id, type: 'point_on_line_pl', p_id: p, l_id: r.a }));
        if ((r.pts || []).length === 1) P.push({ id: id + '#par', type: 'parallel', l1_id: r.a, l2_id: r.b });
        break;
      case 'midpoint':
        P.push({ id, type: 'point_on_line_pl', p_id: r.p, l_id: r.c });
        P.push({ id: id + '#2', type: 'point_on_perp_bisector_pl', p_id: r.p, l_id: r.c });
        break;
      case 'distance': {
        if (r.b == null) { const l = cm.get(r.a); P.push({ id, type: 'p2p_distance', p1_id: l.p1, p2_id: l.p2, distance: r.value }); }
        else if (k[0] === 'point' && k[1] === 'point') P.push({ id, type: 'p2p_distance', p1_id: r.a, p2_id: r.b, distance: r.value });
        else if (k[0] === 'point' && k[1] === 'line') P.push({ id, type: 'p2l_distance', p_id: r.a, l_id: r.b, distance: r.value });
        else if (k[0] === 'line' && k[1] === 'point') P.push({ id, type: 'p2l_distance', p_id: r.b, l_id: r.a, distance: r.value });
        else if (k[0] === 'line' && k[1] === 'line') P.push({ id, type: 'p2l_distance', p_id: cm.get(r.a).p1, l_id: r.b, distance: r.value });
        break;
      }
      case 'hdistance':
        P.push({ id, type: 'difference', param1: { o_id: r.a, prop: 'x' }, param2: { o_id: r.b, prop: 'x' }, difference: r.value });
        break;
      case 'vdistance':
        P.push({ id, type: 'difference', param1: { o_id: r.a, prop: 'y' }, param2: { o_id: r.b, prop: 'y' }, difference: r.value });
        break;
      case 'diameter':
        P.push(kind(r.c) === 'arc' ? { id, type: 'arc_diameter', a_id: r.c, diameter: r.value } : { id, type: 'circle_diameter', c_id: r.c, diameter: r.value });
        break;
      case 'radius':
        P.push(kind(r.c) === 'arc' ? { id, type: 'arc_radius', a_id: r.c, radius: r.value } : { id, type: 'circle_radius', c_id: r.c, radius: r.value });
        break;
      case 'angle':
        P.push({ id, type: 'l2l_angle_ll', l1_id: r.a, l2_id: r.b, angle: r.value * RAD });
        break;
      case 'patAngle':
        // Hilfsbogen eines Kreismusters: Öffnungswinkel fest
        P.push({ id, type: 'difference', param1: { o_id: r.c, prop: 'start_angle' }, param2: { o_id: r.c, prop: 'end_angle' }, difference: r.value });
        break;
      case 'chamfer': {
        // ein gemeinsamer Wert für beide Schenkel
        const pn = 'v_' + id;
        params.push({ type: 'param', name: pn, value: r.value });
        P.push({ id: id + '#1', type: 'p2p_distance', p1_id: r.p, p2_id: r.a, distance: pn });
        P.push({ id: id + '#2', type: 'p2p_distance', p1_id: r.p, p2_id: r.b, distance: pn });
        break;
      }
      case 'offset': {
        // ein Wert steuert alle Glieder der versetzten Kette
        const pn = 'v_' + id;
        params.push({ type: 'param', name: pn, value: r.value });
        (r.pairs || []).forEach((q, i) => {
          const ks = kind(q.s), kd = kind(q.d);
          if (ks === 'line' && kd === 'line') P.push({ id: `${id}#${i}`, type: 'p2l_distance', p_id: cm.get(q.d).p1, l_id: q.s, distance: pn });
          else if (ks && ks === kd) {
            const [a, b] = q.sign > 0 ? [q.s, q.d] : [q.d, q.s];
            P.push({ id: `${id}#${i}`, type: 'difference', param1: { o_id: a, prop: 'radius' }, param2: { o_id: b, prop: 'radius' }, difference: pn });
          }
        });
        break;
      }
      default:
    }
  }
  if (drag) {
    (drag.points || []).forEach((d, i) => {
      P.push({ id: `drag#x${i}`, type: 'coordinate_x', p_id: d.id, x: d.x, temporary: true });
      P.push({ id: `drag#y${i}`, type: 'coordinate_y', p_id: d.id, y: d.y, temporary: true });
    });
    if (drag.radius) P.push({ id: 'drag#r', type: kind(drag.radius.id) === 'arc' ? 'arc_radius' : 'circle_radius', [kind(drag.radius.id) === 'arc' ? 'a_id' : 'c_id']: drag.radius.id, radius: drag.radius.r, temporary: true });
  }
  return [...params, ...P];
}

const baseId = id => String(id).split('#')[0];

/* Löst die Skizze. Bei Erfolg werden Punkte, Radien und Winkel direkt in sk geschrieben. */
export function solveSketch(sk, { drag = null, write = true } = {}) {
  const w = wrapper;
  if (!w) return { ok: false, notReady: true, dof: null, conflicts: [], redundant: [] };
  const prims = toPrimitives(sk, drag);
  const good = s => s === PG.SolveStatus.Success || s === PG.SolveStatus.Converged;
  let status = PG.SolveStatus.Failed;
  // DogLeg zuerst; wenn das nicht konvergiert, die anderen Verfahren probieren
  for (const alg of drag ? [PG.Algorithm.DogLeg] : [PG.Algorithm.DogLeg, PG.Algorithm.LevenbergMarquardt, PG.Algorithm.BFGS]) {
    w.clear_data();
    w.push_primitives_and_params(prims);
    status = w.solve(alg);
    if (good(status) || w.has_gcs_conflicting_constraints()) break;
  }
  const ruleIds = new Set(sk.rules.map(r => r.id));
  const conflicts = [...new Set(w.get_gcs_conflicting_constraints().map(baseId))].filter(id => ruleIds.has(id));
  const redundant = [...new Set(w.get_gcs_redundant_constraints().map(baseId))].filter(id => ruleIds.has(id));
  const ok = (status === PG.SolveStatus.Success || status === PG.SolveStatus.Converged) && !conflicts.length;
  let dof = null;
  try { dof = w.gcs.dof(); } catch (_) { dof = null; }
  if (ok && write) {
    w.apply_solution();
    const out = new Map(w.sketch_index.get_primitives().map(p => [p.id, p]));
    sk.points.forEach(p => { const q = out.get(p.id); if (q && isFinite(q.x) && isFinite(q.y)) { p.x = q.x; p.y = q.y; } });
    [...sk.curves, ...(sk.helpers || [])].forEach(c => {
      const q = out.get(c.id);
      if (!q) return;
      if (c.type === 'circle' && isFinite(q.radius)) c.r = Math.abs(q.radius);
      if (c.type === 'arc' && isFinite(q.radius)) {
        c.r = Math.abs(q.radius);
        let a0 = q.start_angle, a1 = q.end_angle;
        while (a1 <= a0) a1 += Math.PI * 2;
        while (a1 - a0 > Math.PI * 2) a1 -= Math.PI * 2;
        c.a0 = a0; c.a1 = a1;
      }
    });
  }
  return { ok, status, dof, conflicts, redundant };
}
