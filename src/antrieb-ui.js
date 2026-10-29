// cantcodecad – Baugruppe → Bewegung → „Antriebsgelenke“: alle beweglichen Gelenke mit
// ihren Freiheitsgraden in einem Dialog; ein Wert bewegt die Baugruppe sofort dorthin (Kontaktsätze halten an, Grenzen
// klemmt der Kern). Abbrechen stellt den alten Stand her, OK übernimmt ihn (rückgängig machbar).
import { icon } from './icons.js';
import { FELDER, FELD_NAME, EINHEIT } from './motion-ui.js';

export function setupAntrieb(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a);
  let alt = null; // Gelenkwerte beim Öffnen: { id: { feld: wert } }

  const gelenke = () => ctx.doc.features.filter(f => f.type === 'joint' && FELDER[f.kind] && !f.suppressed);
  function oeffne() {
    if (!gelenke().length) { ctx.toast('Es gibt kein bewegliches Gelenk (Drehgelenk, Schieber …).'); return; }
    alt = Object.fromEntries(gelenke().map(f => [f.id, Object.fromEntries(FELDER[f.kind].map(k => [k, Number(f[k]) || 0]))]));
    ctx.closeDialog();
    ctx.setMode('antrieb');
    zeichne();
  }
  function zeichne() {
    const d = $('#dialog');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('joint', 20)}<b class="dtitle">Antriebsgelenke</b></header><div class="dbody">
      ${gelenke().map(f => `<div class="motspur"><b>${esc(f.name)}</b>${FELDER[f.kind].map(k => `<label class="row"><span>${FELD_NAME[k]}</span><span class="num"><input type="number" step="${k === 'angle' ? 5 : 1}" data-antrieb="${esc(f.id)}" data-feld="${k}" value="${Math.round((Number(f[k]) || 0) * 1000) / 1000}"><em>${EINHEIT[k]}</em></span></label>`).join('')}</div>`).join('')}
      <p class="info small">Antriebsgelenke: Wert eingeben, die Baugruppe bewegt sich dorthin. Grenzen der Gelenke gelten, aktive Kontaktsätze halten das Gelenk an der Berührung an. Abbrechen stellt den vorigen Stand her.</p>
      </div><footer><button type="button" class="btn primary" data-cmd="antrieb-ok">OK</button><button type="button" class="btn" data-cmd="antrieb-abbrechen">Abbrechen</button></footer>`;
    d.hidden = false;
  }
  async function eingabe(t) {
    const f = ctx.doc.features.find(x => x.id === t.dataset.antrieb), k = t.dataset.feld;
    if (!f || !k) return;
    const v = Number(String(t.value).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    const von = Number(f[k]) || 0;
    let ziel = v;
    try {
      const r = ctx.kontakt && ctx.kontakt.aktiv() ? await ctx.kontakt.begrenze({ ...f }, { [k]: [von, v] }) : null;
      if (r) { ziel = r.werte[k]; ctx.toast(ctx.kontakt.meldung(r.paar)); }
    } catch (_) { /* ohne Kontaktprüfung weiter */ }
    f[k] = ziel;
    if (ziel !== v) t.value = String(ziel);
    ctx.scheduleBuild(0);
  }
  function schliesse(uebernehmen) {
    if (!alt) return;
    if (uebernehmen) {
      // Rückgängig führt zum Stand beim Öffnen: Werte kurz zurück, Verlauf merken, neue Werte wieder setzen
      const neu = Object.fromEntries(gelenke().map(f => [f.id, Object.fromEntries(FELDER[f.kind].map(k => [k, f[k]]))]));
      gelenke().forEach(f => Object.assign(f, alt[f.id] || {}));
      ctx.pushHistory();
      gelenke().forEach(f => Object.assign(f, neu[f.id] || {}));
      ctx.store();
    } else gelenke().forEach(f => Object.assign(f, alt[f.id] || {}));
    alt = null;
    ctx.closeDialog();
    ctx.setMode('model');
    ctx.scheduleBuild(0);
  }
  return { oeffneAntrieb: oeffne, antriebEingabe: eingabe, antriebSchliessen: schliesse, antriebOffen: () => !!alt };
}
