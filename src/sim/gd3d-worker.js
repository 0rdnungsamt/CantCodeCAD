// cantcodecad – Rechen-Worker des räumlichen Generativen Designs (Fertigung „Uneingeschränkt“, src/sim/gd3d.js).
// Auftrag: { id, netz: { h, bbox, bereich, beibehalten, hindernis }, lager, lastfaelle, materialien: [{ key, name, E, nu,
// fy, rho }], ziel: { art: 'steifigkeit'|'masse', masse, sicherheit }, schritte, druecke: [{ achse, vz, winkel, name }] }
// Je Material und Druckrichtung (Fertigung additiv) ein Ergebnis; ohne druecke ein Lauf ohne Überhangfilter.
// Antworten: { id, art: 'fortschritt'|'ergebnis'|'fehler'|'fertig', … }; das Ergebnis trägt das Knotenfeld (0…255).
import { gdNetz, gdOptimieren, beibehaltenFeld, oberflaeche } from './gd3d.js';

/* Volumen eines geschlossenen Dreiecksnetzes (Divergenzsatz) */
function netzVolumen(s) {
  let V = 0;
  const P = s.pos, T = s.tri;
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    V += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  return V;
}

self.onmessage = e => {
  const { id, netz: nj, lager, lastfaelle, materialien, ziel, schritte } = e.data;
  const druecke = e.data.druecke && e.data.druecke.length ? e.data.druecke : [e.data.druck || null];
  try {
    const net = gdNetz(nj);
    const vKeep = net.keep.reduce((a, v) => a + v, 0) * net.h ** 3, vFrei = (net.ne - net.keep.reduce((a, v) => a + v, 0)) * net.h ** 3;
    for (const m of materialien) for (const druck of druecke) {
      const rho = m.rho / 1000; // g/cm³ → g/mm³
      const lauf = (anteil, text) => gdOptimieren(net, { E: m.E, nu: m.nu || 0.3, anteil, schritte, lager, lastfaelle, druck }, p => self.postMessage({ id, art: 'fortschritt', material: m.key, text: `${m.name}${druck ? ' ' + druck.name : ''}: ${text}`, anteil: p }));
      let r, anteil;
      if (ziel.art === 'steifigkeit') {
        anteil = Math.max(0.03, Math.min(0.95, (ziel.masse / rho - vKeep) / Math.max(1e-9, vFrei)));
        r = lauf(anteil, 'Steifigkeit maximieren');
      } else {
        // Masse minimieren: Anteil nach dem Sicherheitsfaktor nachführen (Spannung ~ 1 / Anteil), höchstens drei Läufe
        anteil = 0.3;
        let best = null;
        for (let k = 0; k < 3; k++) {
          const x = lauf(anteil, `Masse minimieren, Versuch ${k + 1}`), sf = m.fy / Math.max(1e-9, x.smax);
          const ok = sf >= ziel.sicherheit;
          if (!best || (ok && (!best.ok || x.volumen < best.r.volumen)) || (!ok && !best.ok && sf > best.sf)) best = { r: x, ok, sf, anteil };
          const next = Math.max(0.03, Math.min(0.9, anteil * ziel.sicherheit / sf));
          if (Math.abs(next - anteil) < 0.02 * anteil && ok) break;
          anteil = next;
        }
        r = best.r; anteil = best.anteil;
      }
      /* Oberfläche: Schwelle so, dass das Volumen des Ergebnisses (Freiform + exakte Beibehalten-Körper, siehe
         beibehaltenFeld) dem Volumen der vollen Würfel entspricht */
      const B = beibehaltenFeld(net, r.dichte, nj.beibehalten);
      let lo = 0.05, hi = 0.75, iso = 0.5, s = null, V = 0, feldB = null;
      for (let k = 0; k < 9; k++) {
        iso = (lo + hi) / 2;
        feldB = B.bei(iso);
        s = oberflaeche(feldB, net.grid, net.h, iso);
        V = netzVolumen(s) - B.vInnen(feldB, iso) + B.vKeep;
        if (V > r.volumen) lo = iso; else hi = iso;
      }
      const q = new Uint8Array(feldB.length);
      for (let i = 0; i < feldB.length; i++) q[i] = Math.max(0, Math.min(255, Math.round(feldB[i] * 255)));
      self.postMessage({ id, art: 'ergebnis', ergebnis: {
        material: m.key, anteil, masse: V * rho, volumen: V, spannung: r.smax, weg: r.dmax, sicherheit: m.fy / Math.max(1e-9, r.smax), ungestuetzt: r.ungestuetzt, nachgiebigkeit: r.comp, druck, stuecke: r.stuecke,
        feld: { o: net.grid.o, h: net.h, nx: net.grid.nx, ny: net.grid.ny, nz: net.grid.nz, iso, d: q }, pos: s.pos, tri: s.tri, elemente: net.ne
      } });
    }
  } catch (err) {
    self.postMessage({ id, art: 'fehler', text: err.message });
  }
  self.postMessage({ id, art: 'fertig' });
};
