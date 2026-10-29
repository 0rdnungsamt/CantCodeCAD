// cantcodecad – Kontur aus Geraden und tangential anschließenden Kreisbögen (Generatives Design).
// Eingabe ist ein dichter, glatter, geschlossener Punktzug; Ausgabe eine G1-stetige Kette, so viele Geraden wie möglich.
// Der Laser bekommt echte LINE/ARC statt Polylinien, und das Teil sieht aus wie von Hand konstruiert.
//
// Verfahren:
//  1. Gerade Stücke suchen: zu jedem Startpunkt das längste Stück, dessen Punkte im Toleranzschlauch um die Sehne liegen;
//     die längsten (≥ minLinie) ohne Überlappung auswählen, jedes als Ausgleichsgerade.
//  2. Zwischen zwei Geraden (und ohne Geraden: rundherum) adaptive Doppelbögen (Biarcs): ein Biarc verbindet Punkt +
//     Tangente mit Punkt + Tangente durch zwei tangential anschließende Bögen. Weicht er von den Konturpunkten
//     dazwischen zu weit ab, wird an einem Konturpunkt (mit dessen Tangente) geteilt. Jede Naht ist so tangential.
//  3. Bögen auf demselben Kreis und Geraden in derselben Richtung zusammenlegen.

const kreuz = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const skal = (a, b) => a[0] * b[0] + a[1] * b[1];
const laenge = a => Math.hypot(a[0], a[1]);
const norm = a => { const l = laenge(a) || 1; return [a[0] / l, a[1] / l]; };

/* Bogen ab P mit Tangente T durch Q (κ = 2·(T × d) / |d|²); null, wenn praktisch gerade */
function bogen(P, T, Q) {
  const d = sub(Q, P), dd = skal(d, d), k = 2 * kreuz(T, d) / (dd || 1e-30);
  if (!(Math.abs(k) * Math.sqrt(dd) > 1e-7)) return null;
  const r = 1 / k, C = add(P, mul([-T[1], T[0]], r)), R = Math.abs(r);
  const a0 = Math.atan2(P[1] - C[1], P[0] - C[0]);
  let w = Math.atan2(Q[1] - C[1], Q[0] - C[0]) - a0;
  if (k > 0) { while (w <= 0) w += 2 * Math.PI; } else { while (w >= 0) w -= 2 * Math.PI; }
  const am = a0 + w / 2, ae = a0 + w;
  return {
    C, R, a0, w, von: P, p: Q, M: [C[0] + R * Math.cos(am), C[1] + R * Math.sin(am)],
    TE: k > 0 ? [-Math.sin(ae), Math.cos(ae)] : [Math.sin(ae), -Math.cos(ae)]
  };
}
// Abstand eines Punkts zu einem Stück (Bogen oder Strecke)
function abstand(t, X) {
  if (t.typ === 'l') {
    const d = sub(t.p, t.von), L2 = skal(d, d) || 1e-30, u = Math.max(0, Math.min(1, skal(sub(X, t.von), d) / L2));
    return laenge(sub(X, add(t.von, mul(d, u))));
  }
  let a = Math.atan2(X[1] - t.C[1], X[0] - t.C[0]) - t.a0;
  if (t.w > 0) { while (a < 0) a += 2 * Math.PI; } else { while (a > 0) a -= 2 * Math.PI; }
  if ((t.w > 0 && a <= t.w) || (t.w < 0 && a >= t.w)) return Math.abs(laenge(sub(X, t.C)) - t.R);
  return Math.min(laenge(sub(X, t.von)), laenge(sub(X, t.p)));
}
/* nächster Punkt eines Bogens zu X (Rand des Bogens, wenn X außerhalb seines Winkels liegt) */
function naechster(t, X) {
  let a = Math.atan2(X[1] - t.C[1], X[0] - t.C[0]) - t.a0;
  if (t.w > 0) { while (a < 0) a += 2 * Math.PI; } else { while (a > 0) a -= 2 * Math.PI; }
  if ((t.w > 0 && a <= t.w) || (t.w < 0 && a >= t.w)) return add(t.C, mul(norm(sub(X, t.C)), t.R));
  return laenge(sub(X, t.von)) < laenge(sub(X, t.p)) ? t.von : t.p;
}
/* Doppelbogen (P1, T1) → (P2, T2) mit gleichen Schenkeln; null, wenn nicht konstruierbar */
function biarc(P1, T1, P2, T2) {
  const v = sub(P2, P1), t = add(T1, T2), c = skal(v, t), q = 2 * (1 - skal(T1, T2));
  let d;
  if (Math.abs(q) < 1e-10) { const vt = skal(v, T2); if (Math.abs(vt) < 1e-12) return null; d = skal(v, v) / (4 * vt); }
  else d = (-c + Math.sqrt(Math.max(0, c * c + q * skal(v, v)))) / q;
  if (!(d > 0)) return null;
  const J = mul(add(add(P1, mul(T1, d)), sub(P2, mul(T2, d))), 0.5);
  const stueck = (A, T, B) => { const b = bogen(A, T, B); return b ? { typ: 'a', ...b } : { typ: 'l', von: A, p: B, TE: T }; };
  const s1 = stueck(P1, T1, J), s2 = stueck(J, s1.TE, P2);
  return [s1, s2];
}

/* o.kreise: exakte Kreise ({ c, r }) der Beibehalten-Geometrie. Punkte, die auf einem davon liegen, werden genau auf den
   Kreis gesetzt und bekommen dessen Tangente – die Doppelbögen dort sind dann Stücke genau dieses Kreises und
   verschmelzen zu einem Bogen (Augen bleiben exakt). */
export function linienBoegen(Q0, tolVon, o = {}) {
  const n = Q0.length;
  if (n < 8) return null;
  const minLinie = o.minLinie ?? 2, tolLinie = o.tolLinie ?? tolVon;
  const fd = i => norm(sub(Q0[(i + 2) % n], Q0[(i - 2 + n) % n]));
  const Q = Q0.slice(), TK = new Array(n).fill(null), KI = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) for (const [ki, k] of (o.kreise || []).entries()) {
    const r = sub(Q0[i], k.c), d = laenge(r);
    if (Math.abs(d - k.r) > (o.kreisTol ?? 0.05)) continue;
    const u = mul(r, 1 / d);
    Q[i] = add(k.c, mul(u, k.r));
    const t = [-u[1], u[0]];
    TK[i] = skal(t, fd(i)) >= 0 ? t : mul(t, -1);
    KI[i] = ki;
    break;
  }
  /* Lücken in einem Kreislauf schließen: Punkte zwischen zwei Punkten desselben Kreises, die alle in der Toleranz um
     den Kreis liegen (kleine Beulen aus dem Dichtefeld), gehören auch auf den Kreis */
  for (let i = 0; i < n; i++) {
    const ki = KI[i];
    if (ki < 0 || KI[(i + 1) % n] >= 0) continue;
    let j = i + 1;
    while (j < i + n && KI[j % n] < 0) j++;
    if (KI[j % n] !== ki || j - i > n / 4) continue;
    const k = o.kreise[ki];
    let ok = true;
    for (let q = i + 1; q < j && ok; q++) if (Math.abs(laenge(sub(Q0[q % n], k.c)) - k.r) > (o.lueckenTol ?? tolVon(q % n))) ok = false;
    if (!ok) continue;
    for (let q = i + 1; q < j; q++) {
      const u = norm(sub(Q0[q % n], k.c));
      Q[q % n] = add(k.c, mul(u, k.r));
      const t = [-u[1], u[0]];
      TK[q % n] = skal(t, fd(q % n)) >= 0 ? t : mul(t, -1);
      KI[q % n] = ki;
    }
  }
  const at = i => Q[((i % n) + n) % n], tolAt = i => tolVon(((i % n) + n) % n);
  const tang = i => TK[((i % n) + n) % n] || norm(sub(at(i + 2), at(i - 2)));

  /* 1. gerade Stücke: längstes j je i mit allen Zwischenpunkten im Schlauch um die Sehne */
  const lauf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (KI[i] >= 0) { lauf[i] = 0; continue; }
    let j = i + 2;
    for (; j < i + n - 4; j++) {
      const A = at(i), B = at(j + 1), d = norm(sub(B, A));
      if (skal(sub(B, A), tang(i)) <= 0 || KI[(j + 1) % n] >= 0) break;
      let ok = true;
      for (let k = i + 1; k <= j; k++) if (Math.abs(kreuz(d, sub(at(k), A))) > tolLinie(((k % n) + n) % n)) { ok = false; break; }
      if (!ok) break;
    }
    lauf[i] = j - i; // Punkte i … i+lauf liegen auf einer Geraden
  }
  const belegt = new Uint8Array(n), geraden = [];
  const kandidaten = Array.from({ length: n }, (_, i) => i).sort((a, b) => lauf[b] - lauf[a]);
  for (const i0 of kandidaten) {
    if (laenge(sub(at(i0 + lauf[i0]), at(i0))) < minLinie) break;
    // überlappt das Stück eine schon gewählte Gerade, bleibt der längste freie Teil (zwei Punkte Abstand: dort entsteht
    // der Übergangsbogen)
    let bi = -1, bj = -2, a = -1;
    for (let k = i0; k <= i0 + lauf[i0] + 1; k++) {
      let frei = k <= i0 + lauf[i0];
      for (let q = k - 2; q <= k + 2 && frei; q++) if (belegt[((q % n) + n) % n]) frei = false;
      if (frei) { if (a < 0) a = k; } else if (a >= 0) { if (k - 1 - a > bj - bi) { bi = a; bj = k - 1; } a = -1; }
    }
    if (bj - bi < 2 || laenge(sub(at(bj), at(bi))) < minLinie) continue;
    // freier Teil kann hinter dem Anfang des Zugs liegen (bi ≥ n): Index zurückfalten, Länge eigens merken
    const i = ((bi % n) + n) % n, len = bj - bi;
    for (let k = i; k <= i + len; k++) belegt[((k % n) + n) % n] = 1;
    // Ausgleichsgerade durch die Punkte, Enden auf die Gerade projiziert
    let mx = 0, my = 0, cnt = len + 1;
    for (let k = i; k <= i + len; k++) { mx += at(k)[0]; my += at(k)[1]; }
    mx /= cnt; my /= cnt;
    let sxx = 0, sxy = 0, syy = 0;
    for (let k = i; k <= i + len; k++) { const dx = at(k)[0] - mx, dy = at(k)[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let d = [Math.cos(th), Math.sin(th)];
    if (skal(d, sub(at(i + len), at(i))) < 0) d = mul(d, -1);
    let O = [mx, my];
    // läuft die Gerade an einer geraden Kante der Startform entlang, genau auf diese Kante (sonst kippt die
    // Ausgleichsgerade ein wenig über den Rand hinaus)
    for (const kt of o.kanten || []) {
      if (Math.abs(kreuz(d, kt.d)) > 0.02) continue;
      let nah = true;
      for (let k = i; k <= i + len && nah; k++) if (Math.abs(kreuz(kt.d, sub(at(k), kt.A))) > tolAt(k)) nah = false;
      if (!nah) continue;
      d = skal(d, kt.d) > 0 ? kt.d : mul(kt.d, -1); O = kt.A;
      break;
    }
    // ragt die Gerade über den Rand der Startform (o.aussen > 0), parallel nach innen schieben
    if (o.aussen) {
      const nv = [-d[1], d[0]];
      for (let it = 0; it < 4; it++) {
        const pr = X => add(O, mul(d, skal(sub(X, O), d))), A = pr(at(i)), B = pr(at(i + len));
        const ueber = Math.max(o.aussen(A), o.aussen(B));
        if (!(ueber > 1e-4)) break;
        // Richtung nach innen: dort, wo das Abstandsfeld kleiner wird
        const M = mul(add(A, B), 0.5), sg = o.aussen(add(M, mul(nv, 0.01))) < o.aussen(sub(M, mul(nv, 0.01))) ? 1 : -1;
        O = add(O, mul(nv, sg * (ueber + 2e-4)));
      }
    }
    const proj = X => add(O, mul(d, skal(sub(X, O), d)));
    geraden.push({ i, j: i + len, A: proj(at(i)), B: proj(at(i + len)), d });
  }
  geraden.sort((a, b) => a.i - b.i);

  /* 2. feste Stücke: Geraden und Kreisläufe (zusammenhängende Punkte auf demselben exakten Kreis), nach Lage sortiert */
  const kreise = o.kreise || [], stuecke = geraden.map(g => ({ art: 'l', ...g }));
  for (let i = 0; i < n; i++) {
    const ki = KI[i];
    if (ki < 0 || belegt[i] || KI[(i - 1 + n) % n] === ki) continue;
    let j = i;
    while (j < i + n - 1 && KI[(j + 1) % n] === ki && !belegt[(j + 1) % n]) j++;
    if (j - i < 3) continue;
    const k = kreise[ki], or = Math.sign(kreuz(sub(at(i), k.c), tang(i))) || 1;
    for (let q = i; q <= j; q++) belegt[q % n] = 1;
    stuecke.push({ art: 'k', i, j, A: at(i), B: at(j), c: k.c, r: k.r, or });
  }
  stuecke.sort((a, b) => a.i - b.i);
  const tanAn = (st, X) => {
    if (st.art === 'l') return st.d;
    const u = norm(sub(X, st.c));
    return mul([-u[1], u[0]], st.or);
  };

  /* Kehle: ein Bogen (Radius ρ) tangential an beide Stücke; Mittelpunkt im Schnitt der um ρ versetzten Träger */
  const versetzt = (st, sg, rho) => (st.art === 'l'
    ? { art: 'l', P: add(st.A, mul([-st.d[1], st.d[0]], sg * rho)), d: st.d }
    : { art: 'k', c: st.c, r: Math.abs(st.r - sg * st.or * rho) }); // |r − ρ|: Kehle kann den Kreis auch umfassen (ρ > r)
  const schnitt = (a, b) => {
    if (a.art === 'l' && b.art === 'l') {
      const den = kreuz(a.d, b.d);
      if (Math.abs(den) < 1e-9) return [];
      return [add(a.P, mul(a.d, kreuz(sub(b.P, a.P), b.d) / den))];
    }
    if (a.art === 'k' && b.art === 'l') return schnitt(b, a);
    if (a.art === 'l') {
      if (!(b.r > 0)) return [];
      const f = sub(a.P, b.c), B2 = skal(f, a.d), C2 = skal(f, f) - b.r * b.r, D = B2 * B2 - C2;
      if (D < 0) return [];
      return [-B2 - Math.sqrt(D), -B2 + Math.sqrt(D)].map(t => add(a.P, mul(a.d, t)));
    }
    if (!(a.r > 0 && b.r > 0)) return [];
    const dv = sub(b.c, a.c), dd = laenge(dv);
    if (dd < 1e-9 || dd > a.r + b.r || dd < Math.abs(a.r - b.r)) return [];
    const x = (dd * dd + a.r * a.r - b.r * b.r) / (2 * dd), h = Math.sqrt(Math.max(0, a.r * a.r - x * x)), e = mul(dv, 1 / dd);
    const M = add(a.c, mul(e, x));
    return [add(M, mul([-e[1], e[0]], h)), sub(M, mul([-e[1], e[0]], h))];
  };
  /* Tangentenpunkt auf dem Träger. Kreis: auf der Mittelpunktslinie, und zwar der Punkt im Abstand ρ vom Kehlenmittelpunkt
     – bei umfassender Kehle (ρ > r) liegt er auf der abgewandten Seite */
  const fuss = (st, Cf, rho) => {
    if (st.art === 'l') return add(st.A, mul(st.d, skal(sub(Cf, st.A), st.d)));
    const u = norm(sub(Cf, st.c)), T1 = add(st.c, mul(u, st.r)), T2 = sub(st.c, mul(u, st.r));
    return Math.abs(laenge(sub(T1, Cf)) - rho) <= Math.abs(laenge(sub(T2, Cf)) - rho) ? T1 : T2;
  };
  // Lage eines Punkts auf einem Stück ab A in Laufrichtung (Gerade: Länge, Kreis: Bogenlänge, immer ≥ 0)
  const lage = (st, X) => {
    if (st.art === 'l') return skal(sub(X, st.A), st.d);
    let w = (Math.atan2(X[1] - st.c[1], X[0] - st.c[0]) - Math.atan2(st.A[1] - st.c[1], st.A[0] - st.c[0])) * st.or;
    while (w < -1e-9) w += 2 * Math.PI;
    while (w > 2 * Math.PI) w -= 2 * Math.PI;
    return w * st.r;
  };
  const traeger = (st, X) => (st.art === 'l' ? Math.abs(kreuz(st.d, sub(X, st.A))) : Math.abs(laenge(sub(X, st.c)) - st.r));
  // Schlauch für Kehlen: weiter als für Geraden (o.kehlTol) – eine Kehle darf etwas Werkstoff ansetzen oder wegnehmen
  const kehlTol = k => Math.max(tolAt(k), o.kehlTol ?? 0);
  function kehle(P, N, i1, i2) {
    const L1 = lage(P, P.B), L2 = lage(N, N.B);
    const versuch = (sg, rho) => {
      let bestK = null;
      for (const Cf of schnitt(versetzt(P, sg, rho), versetzt(N, sg, rho))) {
        const T1 = fuss(P, Cf, rho), T2 = fuss(N, Cf, rho), l1 = lage(P, T1), l2 = lage(N, T2);
        // Tangentenpunkte auf den Stücken: P höchstens 2 mm verlängert und nicht vor seinem Anfang (15 % bleiben),
        // N ebenso von hinten
        if (!(l1 > 0.15 * L1 && l1 < L1 + 2)) continue;
        if (N.art === 'l' ? !(l2 < 0.85 * L2 && l2 > -2) : !(l2 < 0.85 * L2 || l2 > 2 * Math.PI * N.r - 2)) continue;
        // eine Kehle verbraucht höchstens 45 % einer Geraden (gemessen an ihrer ursprünglichen Länge) – so bleibt von
        // jeder Geraden zwischen zwei Kehlen ein Stück stehen
        if (P.art === 'l' && P.B0 && laenge(sub(P.B0, T1)) > 0.45 * laenge(sub(P.B0, P.A0)) && skal(sub(P.B0, T1), P.d) > 0) continue;
        if (N.art === 'l' && N.A0 && laenge(sub(T2, N.A0)) > 0.45 * laenge(sub(N.B0, N.A0)) && skal(sub(T2, N.A0), N.d) > 0) continue;
        const b = bogen(T1, tanAn(P, T1), T2);
        if (!b || laenge(sub(b.C, Cf)) > 1e-4 * Math.max(1, rho) || Math.abs(b.R - rho) > 1e-4 * Math.max(1, rho) || Math.abs(b.w) > Math.PI * 1.5) continue;
        const bg = { typ: 'a', ...b };
        /* die Kehle darf nicht in ein Auge schneiden und nicht aus dem erlaubten Bereich hinaus – außer sie schließt an ein
           Auge an: ragt das Auge über die Startform, gehört die Kehle in die Ecke davor (wie man es zeichnen würde) */
        const amAuge = P.art === 'k' || N.art === 'k';
        let verboten = false;
        for (let q = 1; q < 8 && !verboten; q++) {
          const a = b.a0 + b.w * q / 8, X = [b.C[0] + b.R * Math.cos(a), b.C[1] + b.R * Math.sin(a)];
          if (kreise.some(kk => laenge(sub(X, kk.c)) < kk.r - 1e-4) || (!amAuge && o.aussen && o.aussen(X) > 1e-4)) verboten = true;
        }
        if (verboten) continue;
        let dev = 0;
        for (let k = i1 + 1; k < i2; k++) {
          const X = at(k);
          let dk = abstand(bg, X), Y = naechster(bg, X);
          if (lage(P, X) <= l1 + 1e-9) { const d2 = traeger(P, X); if (d2 < dk) { dk = d2; Y = null; } }
          const lx = lage(N, X);
          if (lx >= l2 - 1e-9 && lx <= L2) { const d2 = traeger(N, X); if (d2 < dk) { dk = d2; Y = null; } }
          // Liegt der neue Rand im Werkstoff der Form, nimmt die Kehle Werkstoff weg (enger Schlauch); liegt er im
          // Leeren, setzt sie Werkstoff an – eine Delle füllen darf sie großzügig
          const tk = Y && o.feld && o.feld(Y) > 0 ? Math.max(kehlTol(k), o.kehlTolAn ?? 0) : kehlTol(k);
          dev = Math.max(dev, dk / tk);
          if (dev > 50) break;
        }
        if (!bestK || dev < bestK.dev) bestK = { dev, T1, T2, b: bg, rho };
      }
      return bestK;
    };
    /* Größter Radius, der noch im Schlauch liegt (nicht der engste Anschmiegende): so läuft die Kontur in einem großen,
       sanften Bogen aus dem Auge oder um die Ecke, statt kleine Beulen der Rasterkontur nachzuzeichnen. Masse und
       Festigkeit rechnet der Worker danach an genau dieser Kontur nach. */
    let best = null;
    const grid = Array.from({ length: 36 }, (_, q) => 0.2 * Math.pow(500, q / 35));
    for (const sg of [1, -1]) {
      let gut = null, iGut = -1;
      grid.forEach((rho, q) => { const v = versuch(sg, rho); if (v && v.dev <= 1 && (!gut || rho > gut.rho)) { gut = v; iGut = q; } });
      if (!gut) continue;
      // zwischen dem größten passenden und dem nächsten Rasterwert halbieren
      if (iGut < grid.length - 1) {
        let lo = Math.log(gut.rho), hi = Math.log(grid[iGut + 1]);
        for (let it = 0; it < 12; it++) {
          const m = (lo + hi) / 2, v = versuch(sg, Math.exp(m));
          if (v && v.dev <= 1) { gut = v; lo = m; } else hi = m;
        }
      }
      if (!best || gut.rho > best.rho) best = gut;
    }
    return best;
  }

  /* 3. Übergänge: erst eine Kehle versuchen, sonst adaptive Doppelbögen (Konturpunkte dazwischen im Schlauch) */
  const teile = [];
  const uebergang = (P1, T1, i1, P2, T2, i2, aus, tiefe = 0) => {
    const b = biarc(P1, T1, P2, T2);
    let ok = !!b;
    // gleicher Schlauch wie bei den Kehlen: Werkstoff wegnehmen eng, Dellen und Schultern füllen großzügig
    if (b) for (let k = i1 + 1; k < i2 && ok; k++) {
      const X = at(k), d0 = abstand(b[0], X), d1 = abstand(b[1], X), t = d0 <= d1 ? b[0] : b[1];
      const Y = t.typ === 'a' ? naechster(t, X) : null;
      const tk = Y && o.feld && o.feld(Y) > 0 ? Math.max(kehlTol(k), o.kehlTolAn ?? 0) : kehlTol(k);
      if (Math.min(d0, d1) > tk) ok = false;
    }
    if (ok || i2 - i1 < 2 || tiefe > 40) {
      if (b) aus.push(...b);
      else aus.push({ typ: 'l', von: P1, p: P2 });
      return;
    }
    const m = (i1 + i2) >> 1;
    uebergang(P1, T1, i1, at(m), tang(m), m, aus, tiefe + 1);
    uebergang(at(m), tang(m), m, P2, T2, i2, aus, tiefe + 1);
  };
  if (!stuecke.length) {
    // nichts Festes: rundherum Doppelbögen, angefangen bei Punkt 0
    const h = n >> 1;
    uebergang(at(0), tang(0), 0, at(h), tang(h), h, teile);
    uebergang(at(h), tang(h), h, at(n), tang(0), n, teile);
    return { start: teile[0].von, teile: zusammenfassen(teile) };
  }
  const nachIndex = k => (k + 1 < stuecke.length ? stuecke[k + 1].i : stuecke[0].i + n);
  /* Kehlen setzen. Kürzt eine Kehle eine Gerade auf einen Rest (unter einem halben minLinie), fällt die Gerade weg und
     die Kehlen werden ohne sie neu gesucht – sonst bliebe zwischen zwei Rundungen ein Stummel mit einem Knick-Paar
     (die Kerben an den Augen). */
  stuecke.forEach(st => { st.A0 = st.A; st.B0 = st.B; });
  let zwischen = [];
  // Abbruch nur direkt nach dem Setzen der Kehlen: die Liste `zwischen` muss zu den übrigen Stücken passen
  for (let runde = 0; ; runde++) {
    stuecke.forEach(st => { st.A = st.A0; st.B = st.B0; });
    zwischen = stuecke.map((P, k) => {
      if (stuecke.length < 2 && P.art === 'k') return null;
      const kh = kehle(P, stuecke[(k + 1) % stuecke.length], P.j, nachIndex(k));
      if (!kh) return null;
      P.B = kh.T1; stuecke[(k + 1) % stuecke.length].A = kh.T2;
      return [kh.b];
    });
    const rest = stuecke.filter(st => st.art === 'l' && stuecke.length > 2 && skal(sub(st.B, st.A), st.d) < 0.5 * minLinie);
    if (!rest.length || runde > 200) break;
    // nur die kürzeste weg, dann neu: oft reicht das und die Nachbarn bleiben
    rest.sort((a, b) => skal(sub(a.B, a.A), a.d) - skal(sub(b.B, b.A), b.d));
    stuecke.splice(stuecke.indexOf(rest[0]), 1);
  }
  /* S-Übergänge (Wendepunkt zwischen zwei Stücken): eine Kehle reicht nicht. Wie von Hand: eine Wendegerade durch den
     Wendepunkt der Kontur (dessen Tangente) und je eine Kehle zu beiden Seiten. Die Gerade darf dabei bis auf Länge 0
     schrumpfen (dann berühren sich die beiden Kehlen im Wendepunkt). */
  stuecke.forEach((P, k) => {
    if (zwischen[k]) return;
    const N = stuecke[(k + 1) % stuecke.length], i1 = P.j, i2 = nachIndex(k);
    if (i2 - i1 < 6) return;
    const dreh = q => kreuz(tang(q - 2), tang(q + 2));
    let best = -1, bestW = 0;
    for (let q = i1 + 3; q <= i2 - 3; q++) {
      if (Math.sign(dreh(q - 1)) * Math.sign(dreh(q + 1)) < 0) {
        const w = Math.min(q - i1, i2 - q); // möglichst mittig
        if (w > bestW) { bestW = w; best = q; }
      }
    }
    if (best < 0) return;
    const X = at(best), d = tang(best), s1 = 0.95 * Math.abs(skal(sub(X, P.B), d)), s2 = 0.95 * Math.abs(skal(sub(N.A, X), d));
    const V = { art: 'l', i: best, j: best, d, A: sub(X, mul(d, s1)), B: add(X, mul(d, s2)) };
    const PB = P.B, NA = N.A;
    const k1 = kehle(P, V, i1, best);
    if (!k1) return;
    P.B = k1.T1; V.A = k1.T2;
    const k2 = kehle(V, N, best, i2);
    if (!k2 || skal(sub(k2.T1, V.A), d) < -1e-6) { P.B = PB; N.A = NA; return; }
    V.B = k2.T1; N.A = k2.T2;
    zwischen[k] = skal(sub(V.B, V.A), d) > 1e-6 ? [k1.b, { typ: 'l', von: V.A, p: V.B }, k2.b] : [k1.b, k2.b];
  });
  if (o.debug) o.debug.stuecke = stuecke.map(st => ({ art: st.art, i: st.i, j: st.j, A: st.A, B: st.B, A0: st.A0, B0: st.B0, kehle: !!zwischen[stuecke.indexOf(st)] }));
  // Doppelbögen erst jetzt, wenn alle Enden feststehen
  stuecke.forEach((P, k) => {
    const N = stuecke[(k + 1) % stuecke.length];
    if (P.art === 'l') teile.push({ typ: 'l', von: P.A, p: P.B });
    else { const b = bogen(P.A, tanAn(P, P.A), P.B); if (b) teile.push({ typ: 'a', ...b }); }
    if (zwischen[k]) teile.push(...zwischen[k]);
    else uebergang(P.B, tanAn(P, P.B), P.j, N.A, tanAn(N, N.A), nachIndex(k), teile);
  });
  if (o.debug) o.debug.roh = teile.map(t => ({ typ: t.typ, von: t.von, p: t.p, r: t.R }));
  return { start: teile[0].von, teile: zusammenfassen(teile) };
}

/* Bögen auf demselben Kreis und Geraden in derselben Richtung zu einem Stück */
function zusammenfassen(teile) {
  const out = [];
  for (const t of teile) {
    const v = out[out.length - 1];
    if (v && v.typ === 'l' && t.typ === 'l' && Math.abs(kreuz(norm(sub(v.p, v.von)), norm(sub(t.p, t.von)))) < 1e-7) { v.p = t.p; continue; }
    if (v && v.typ === 'a' && t.typ === 'a' && laenge(sub(v.C, t.C)) < 1e-3 && Math.abs(v.R - t.R) < 1e-3 && Math.sign(v.w) === Math.sign(t.w) && Math.abs(v.w + t.w) < 1.95 * Math.PI) {
      v.w += t.w; v.p = t.p; v.M = [v.C[0] + v.R * Math.cos(v.a0 + v.w / 2), v.C[1] + v.R * Math.sin(v.a0 + v.w / 2)];
      continue;
    }
    out.push({ ...t });
  }
  // Länge 0 heraus (Kern: keine Kanten der Länge 0)
  return out.filter(t => laenge(sub(t.p, t.von)) > 1e-6 || (t.typ === 'a' && Math.abs(t.w) > 1e-6))
    .map(t => (t.typ === 'l' ? { typ: 'l', p: t.p } : { typ: 'a', p: t.p, m: t.M, c: t.C, r: t.R }));
}

/* Kette als Punktzug (Vorschaubild, Fläche, Nachrechnung): Bögen in Stücke von höchstens `schritt` mm */
export function kettePunkte(k, schritt = 0.3) {
  const pts = [k.start];
  let P = k.start;
  for (const t of k.teile) {
    if (t.typ === 'l') { pts.push(t.p); P = t.p; continue; }
    const a0 = Math.atan2(P[1] - t.c[1], P[0] - t.c[0]), am = Math.atan2(t.m[1] - t.c[1], t.m[0] - t.c[0]), a1 = Math.atan2(t.p[1] - t.c[1], t.p[0] - t.c[0]);
    let w = a1 - a0, wm = am - a0;
    while (wm > Math.PI) wm -= 2 * Math.PI;
    while (wm < -Math.PI) wm += 2 * Math.PI;
    if (wm > 0) { while (w <= 0) w += 2 * Math.PI; } else { while (w >= 0) w -= 2 * Math.PI; }
    const m = Math.max(2, Math.ceil(Math.abs(w) * t.r / schritt));
    for (let s = 1; s <= m; s++) { const a = a0 + w * s / m; pts.push([t.c[0] + t.r * Math.cos(a), t.c[1] + t.r * Math.sin(a)]); }
    P = t.p;
  }
  pts.pop(); // letzter Punkt = Start
  return pts;
}
