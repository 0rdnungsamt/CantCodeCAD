// cantcodecad – Rechen-Worker des Generativen Designs. Eigener Worker, damit Oberfläche und Geometriekern während der
// Sekunden langen Optimierung frei bleiben. Kennt nur den Rechenkern topo.js (2D, 2-Achsen-Schneiden).
//
// Auftrag: { id, modell: { nelx, nely, hx, hy, ox, oy, mask, keep, stuetzen, lastfaelle }, dicke, bereichFlaeche,
//            materialien: [{ key, name, E, nu, fy, rho }], ziel: { art: 'steifigkeit'|'masse', masse, sicherheit },
//            wiederholungen }
// Antworten: { id, art: 'fortschritt'|'ergebnis'|'fehler'|'fertig', … }
import { topOptimize, feAnalyse, vonMises, knicken } from './topo.js';
import { endform, elementAnteile } from './gd-form.js';

/* Endform: siehe gd-form.js (Abstandsfelder, Rundungen, exakte Beibehalten-Geometrie und Bohrungen) */
const netto = fl => fl.reduce((a, f) => a + f.flaeche - f.loecher.reduce((b, h) => b + h.flaeche, 0), 0);
/* wirksame Breite des knickenden Stabs: je Element die halbe Dicke der Form in der Nähe (größter Innenabstand im
   3 × 3-Umfeld ≈ Mittellinie des Stabs), gemittelt mit dem Anteil des Elements an der Knickform */
function wirksameBreite(form, m, energie) {
  const R = form.R, s = form.feld, inn = new Float64Array(m.nelx * m.nely);
  for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) {
    const ex = Math.floor((R.x0 + (i + 0.5) * R.h - m.ox) / m.hx), ey = Math.floor((R.y0 + (j + 0.5) * R.h - m.oy) / m.hy);
    if (ex < 0 || ey < 0 || ex >= m.nelx || ey >= m.nely) continue;
    const e = ey * m.nelx + ex;
    inn[e] = Math.max(inn[e], -s[j * R.nx + i]);
  }
  let sw = 0, sb = 0;
  for (let e = 0; e < inn.length; e++) {
    if (!(energie[e] > 0)) continue;
    const i = e % m.nelx, j = (e - i) / m.nelx;
    let h = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < m.nelx && b < m.nely) h = Math.max(h, inn[b * m.nelx + a]);
    }
    sw += energie[e]; sb += energie[e] * 2 * h;
  }
  return sw > 0 ? sb / sw : null;
}
const quant = x => Uint8Array.from(x, v => Math.max(0, Math.min(255, Math.round(v * 255))));

self.onmessage = e => {
  const a = e.data;
  try { lauf(a); } catch (err) { self.postMessage({ id: a.id, art: 'fehler', text: err && err.message ? err.message : String(err) }); }
  self.postMessage({ id: a.id, art: 'fertig' });
};

function lauf(a) {
  const m = a.modell;
  let nB = 0, nK = 0;
  for (let e = 0; e < m.mask.length; e++) if (m.mask[e]) { nB++; if (m.keep[e]) nK++; }
  const keepAnteil = nB ? nK / nB : 0;
  // Verstärkung knickgefährdeter Bereiche: einmal je Material ermittelt (eine Zusatzrechnung), dann über die Suche mitgenommen
  let gewicht = null, verstaerkt = false;
  const rechne = (mat, anteil, schritt, gw) => {
    let letzte = 0;
    const opt = topOptimize({
      ...m, E: mat.E, nu: mat.nu, dicke: a.dicke, dichte: anteil, wiederholungen: a.wiederholungen || 60, gewicht: gw,
      fortschritt: (it, n, x) => {
        // höchstens alle 120 ms ein Zwischenbild – sonst bremst das Verschicken die Rechnung
        const t = Date.now();
        if (t - letzte < 120 && it < n) return;
        letzte = t;
        self.postMessage({ id: a.id, art: 'fortschritt', material: mat.key, schritt, it, n, bild: quant(x) });
      }
    });
    const form = endform(opt.dichten, opt.modell, anteil, a.geometrie);
    const fl = form.flaechen, A = netto(fl);
    /* Die Endform selbst nachrechnen (Anteil jedes Elements in der Form als Steifigkeit): Sicherheitsfaktor und Weg
       gelten für das Teil, das wirklich entsteht – nicht für das Zwischenfeld der Optimierung */
    const cov = elementAnteile(form.feldEnd || form.feld, form.R, opt.modell);
    const fe = feAnalyse({ ...m, E: mat.E, nu: mat.nu, dicke: a.dicke, dichten: cov, E0: mat.E * 1e-4 });
    const sp = vonMises(fe.modell, mat.E, mat.nu, cov, fe.us, 0.5);
    const sfSpannung = sp.max > 0 ? mat.fy / sp.max : Infinity;
    /* Knicken: in der Ebene aus der FE (lineare Stabilität). Quer zur Ebene kann das ebene Modell nicht knicken – Schätzung
       über den knickenden Stab: Biegesteifigkeit quer ∝ b·t³, in der Ebene ∝ t·b³, also λ_quer ≈ λ_eben · (t / b)²
       mit b = wirksame Breite des Stabs in der Knickform. Maßgebend ist das Kleinere. */
    const kn = knicken({ ...m, E: mat.E, nu: mat.nu, dicke: a.dicke, dichten: cov, E0: mat.E * 1e-4, vektoren: 3 });
    let knick = kn.lambda, knickArt = 'in der Ebene', breite = null;
    if (Number.isFinite(kn.lambda)) {
      breite = wirksameBreite(form, opt.modell, kn.energie);
      if (breite && a.dicke < breite) {
        const quer = kn.lambda * (a.dicke / breite) ** 2;
        if (quer < knick) { knick = quer; knickArt = 'quer zur Ebene (Schätzung)'; }
      }
    }
    return {
      opt, fl, A, masse: A * a.dicke * mat.rho / 1000, spannung: sp.max, weg: fe.umax, nachgiebigkeit: fe.C,
      sfSpannung, knick, knickArt, breite, energie: kn.energie, sicherheit: Math.min(sfSpannung, knick)
    };
  };
  const einmal = (mat, anteil, schritt) => {
    let r = rechne(mat, anteil, schritt, gewicht);
    /* Knicken maßgebend: die Elemente der Knickform (Druckstäbe) stärker gewichten und bei gleicher Masse neu rechnen –
       der Druckstab wird kräftiger, Zugstäbe schlanker. Das Bessere bleibt, das Gewicht geht in die nächsten Versuche. */
    if (r.knick < r.sfSpannung && !verstaerkt) {
      verstaerkt = true;
      let mx = 0;
      for (const v of r.energie) mx = Math.max(mx, v);
      if (mx > 0) {
        const g = new Float64Array(r.energie.length);
        for (let e = 0; e < g.length; e++) g[e] = Math.min(30, (gewicht ? gewicht[e] : 1) * (1 + 4 * r.energie[e] / mx));
        const r2 = rechne(mat, anteil, `${schritt} · Druckstäbe verstärken`, g);
        if (r2.sicherheit > r.sicherheit && r2.fl.length <= r.fl.length) { r = r2; gewicht = g; }
      }
    }
    return r;
  };
  for (const mat of a.materialien) {
    gewicht = null; verstaerkt = false;
    try {
      let r, anteil, hinweis = '';
      if (a.ziel.art === 'masse') {
        /* Masse minimieren: kleinster Werkstoffanteil, bei dem der Sicherheitsfaktor noch hält. Die Spannung fällt etwa
           mit einer Potenz des Anteils (SF ≈ c · Anteilᵏ) – daher Sekantenschritte auf log SF über log Anteil, immer
           innerhalb der Klammer [geht nicht, geht]. Untergrenze: Beibehalten-Geometrie plus etwas Spielraum. */
        const soll = Math.max(1, Number(a.ziel.sicherheit) || 2);
        const unten = Math.min(0.85, keepAnteil + 0.03);
        /* Ein Versuch, der zerfällt (Kraft ohne Halterung), ist „zu leicht“. Jeder andere Fehler ist ein Rechenfehler und
           wird im Hinweis gemeldet – sonst sähe ein Programmfehler aus wie ein zu schweres Ergebnis. */
        let rechenfehler = '';
        const versuch = an => {
          try { return einmal(mat, an, `${mat.name}: Anteil ${Math.round(an * 100)} %`); }
          catch (err) {
            const t = err && err.message ? err.message : String(err);
            if (!/Halterung|getrennten|nicht lösen|leer|Zielanteil/.test(t)) rechenfehler = t;
            return null;
          }
        };
        const oben = versuch(0.9);
        if (!oben) throw new Error('Rechnung mit 90 % Material nicht lösbar');
        let best = oben, bestAnteil = 0.9, lo = unten, hi = 0.9, vor = [0.9, oben.sicherheit];
        if (oben.sicherheit < soll) hinweis = `Sicherheitsfaktor ${soll} auch mit 90 % Material nicht erreicht – Startform vergrößern oder Last prüfen`;
        else {
          // vorsichtiger erster Schritt (k = 3): der Sicherheitsfaktor fällt zu kleinen Anteilen hin steil ab, und zu
          // leichte Versuche zerfallen nur
          let k = 3, an = 0.9 * Math.pow(soll * 1.03 / oben.sicherheit, 1 / k);
          for (let n = 0; n < 7; n++) {
            an = Math.min(hi - 0.01, Math.max(lo, an));
            if (hi - lo < 0.015) break;
            const t = versuch(an);
            // zerfällt der Umriss in mehr Teile als bei 90 %, sind die Stäbe zu dünn für das Raster – zählt wie „hält nicht“
            const ok = t && t.sicherheit >= soll && t.fl.length <= oben.fl.length;
            if (ok) { best = t; bestAnteil = an; hi = an; } else lo = an;
            if (ok && t.sicherheit <= soll * 1.08) break; // nah genug am Ziel
            if (t && t.fl.length <= oben.fl.length && Number.isFinite(t.sicherheit) && t.sicherheit > 0 && Math.abs(Math.log(an / vor[0])) > 1e-3) {
              k = Math.min(4, Math.max(0.5, Math.log(t.sicherheit / vor[1]) / Math.log(an / vor[0])));
              vor = [an, t.sicherheit];
              an = an * Math.pow(soll * 1.03 / t.sicherheit, 1 / k);
            } else an = (lo + hi) / 2;
            if (!(an > lo && an < hi)) an = (lo + hi) / 2;
          }
          if (best.sicherheit > soll * 1.5) hinweis = bestAnteil <= unten + 1e-9
            ? 'Schon die Beibehalten-Geometrie allein trägt die Last – die Augen bestimmen die Masse'
            : `Mindeststabbreite erreicht: noch dünnere Stäbe als etwa ${(2 * Math.min(m.hx, m.hy)).toFixed(1)} mm löst das Raster nicht auf (das Teil zerfiele). Die Last ist dafür klein – Sicherheitsfaktor ${best.sicherheit.toFixed(1)}. Leichter: feineres Raster unter „Fertigung“ oder dünneres Material`;
        }
        if (rechenfehler) hinweis = `${hinweis ? hinweis + ' · ' : ''}Rechenfehler bei leichteren Versuchen: ${rechenfehler}`;
        r = best; anteil = bestAnteil;
      } else {
        // Steifigkeit maximieren bei Zielmasse: Anteil = Zielmasse / Masse des vollen Bereichs
        const voll = a.bereichFlaeche * a.dicke * mat.rho / 1000;
        anteil = Math.min(0.95, Math.max(0.05, (Number(a.ziel.masse) || 0) / voll));
        if ((Number(a.ziel.masse) || 0) / voll > 0.95) hinweis = 'Zielmasse größer als der Bereich – 95 % genommen';
        if ((Number(a.ziel.masse) || 0) / voll < 0.05) hinweis = 'Zielmasse sehr klein – 5 % genommen';
        r = einmal(mat, anteil, mat.name);
        // Die Form hängt bei diesem Ziel nur an der Lastrichtung, nicht am Betrag – deshalb deutlich sagen, wenn die Masse nicht passt
        if (!hinweis && r.sicherheit < 1) hinweis = `Hält die Last nicht (Sicherheitsfaktor ${r.sicherheit.toFixed(2)}) – Zielmasse erhöhen oder „Masse minimieren“ wählen`;
        else if (!hinweis && r.sicherheit > 6) hinweis = `Stark überdimensioniert (Sicherheitsfaktor ${r.sicherheit.toFixed(1)}) – „Masse minimieren“ legt das Teil auf die Last aus`;
      }
      if (!hinweis && r.knick < r.sfSpannung) hinweis = `Knicken maßgebend (${r.knickArt}): Knicksicherheit ${r.knick.toFixed(2)}, Spannung allein ${r.sfSpannung.toFixed(2)}`;
      self.postMessage({ id: a.id, art: 'ergebnis', ergebnis: {
        material: mat.key, anteil, masse: r.masse, flaeche: r.A, sicherheit: r.sicherheit, spannung: r.spannung,
        sfSpannung: r.sfSpannung, knick: Number.isFinite(r.knick) ? r.knick : null, knickArt: r.knickArt, breite: r.breite,
        weg: r.weg, nachgiebigkeit: r.nachgiebigkeit, teile: r.fl.length, schritte: r.opt.iterationen,
        flaechen: r.fl.map(f => ({ punkte: f.punkte, segmente: f.segmente, loecher: f.loecher.map(h => ({ punkte: h.punkte, segmente: h.segmente })) })),
        bild: quant(r.opt.dichten), hinweis, glatt: true
      } });
    } catch (err) {
      self.postMessage({ id: a.id, art: 'fehler', material: mat.key, text: err && err.message ? err.message : String(err) });
    }
  }
}
