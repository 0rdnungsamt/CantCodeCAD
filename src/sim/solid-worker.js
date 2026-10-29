// cantcodecad – Rechen-Worker für die Festigkeit und Wärme von Bauteilen (src/sim/solid.js, src/sim/thermal.js), damit
// Oberfläche und Geometriekern während der Rechnung frei bleiben. Auftrag: { id, job } → Antworten
// { id, art: 'fortschritt' | 'ergebnis' | 'fehler' }.
// Ein job mit job.faelle (mehrere Lastfälle am selben Netz) rechnet alle Fälle und die Umhüllende in einem Auftrag –
// Netz und Steifigkeit werden nur einmal gebaut. job.art === 'modal' rechnet die freien Schwingformen derselben
// Versteifung (Modalanalyse), job.art === 'waerme' die Wärmeverteilung am selben Netz (ein Freiheitsgrad pro Knoten).
import { solveSolid, solveSolidCases, solidModes } from './solid.js';
import { solveSolidThermal } from './thermal.js';

self.onmessage = e => {
  const { id, job } = e.data;
  try {
    const t0 = performance.now();
    let last = 0;
    const fort = p => { const now = performance.now(); if (now - last > 150) { last = now; self.postMessage({ id, art: 'fortschritt', anteil: p }); } };
    const r = job.art === 'waerme' ? solveSolidThermal(job, fort)
      : job.art === 'modal' ? solidModes(job, job.anzahl, fort)
        : job.faelle ? solveSolidCases(job, job.faelle, fort) : solveSolid(job, fort);
    r.ms = Math.round(performance.now() - t0);
    const t = [r.map.buffer, r.xyz.buffer];
    if (r.u) t.push(r.u.buffer);
    if (r.vm) t.push(r.vm.buffer);
    if (r.T) t.push(r.T.buffer);
    if (r.modes) for (const m of r.modes) t.push(m.u.buffer);
    self.postMessage({ id, art: 'ergebnis', r }, t);
  } catch (err) {
    self.postMessage({ id, art: 'fehler', text: err.message });
  }
};
