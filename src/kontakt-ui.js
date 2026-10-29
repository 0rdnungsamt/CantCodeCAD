// cantcodecad – Baugruppe → Zusammenfügen → Kontakt: Glieder eines Kontaktsatzes (Komponenten,
// eingefügte Teile oder Körper) durchdringen sich beim Bewegen von Gelenken nicht – das Gelenk hält an der ersten
// Berührung an. Gilt für Gelenkwerte im Dialog, „Bewegung abspielen“ und die Bewegungsstudie.
// Dokument: doc.kontakt = { modus: 'aus'|'saetze'|'alle', saetze: [{ id, name, glieder: [IDs], aus }] }
// Die Rechnung macht der Kern (`kontakt`): Zwischenstellungen bauen, Schnittmengen der Glieder, Halbierung am Treffer.
import { icon } from './icons.js';

export function setupKontakt(ctx) {
  const $ = s => document.querySelector(s), esc = (...a) => ctx.esc(...a);
  let entwurf = null; // offener Dialog „Kontaktsatz“

  function daten() {
    const d = ctx.doc;
    if (!d.kontakt || typeof d.kontakt !== 'object') d.kontakt = { modus: 'aus', saetze: [] };
    if (!Array.isArray(d.kontakt.saetze)) d.kontakt.saetze = [];
    if (!['aus', 'saetze', 'alle'].includes(d.kontakt.modus)) d.kontakt.modus = 'aus';
    return d.kontakt;
  }
  const modus = () => (ctx.doc.kontakt && ctx.doc.kontakt.modus) || 'aus';

  /* Glied → Körper: Komponente samt Unterkomponenten, eingefügtes Teil, sonst der Körper selbst */
  function koerperVon(g) {
    if ((ctx.doc.components || []).some(c => c.id === g)) return ctx.compAllBodies(g);
    if ((ctx.doc.inserts || []).some(i => i.id === g)) return ctx.insertBodies(g);
    return [g];
  }
  const gliedName = g => {
    const c = (ctx.doc.components || []).find(x => x.id === g);
    if (c) return c.name;
    const i = (ctx.doc.inserts || []).find(x => x.id === g);
    return i ? i.name : ctx.bodyName(g);
  };
  /* Glied, zu dem ein angeklickter Körper gehört: oberste Einfügung, sonst seine Komponente, sonst der Körper */
  const gliedVonKoerper = id => ctx.compOf(id) || id;

  /* Sätze für den Kern: je Satz eine Liste von Körpergruppen. „alle“: jede Komponente (eigene Körper), jedes eingefügte
     Teil und jeder lose Körper ist ein Glied eines einzigen Satzes. */
  function saetzeFuerKern() {
    const k = daten();
    if (k.modus === 'saetze') return k.saetze.filter(s => !s.aus && s.glieder.length >= 2).map(s => s.glieder.map(koerperVon).filter(g => g.length));
    if (k.modus !== 'alle') return [];
    const alle = (ctx.lastBuild && ctx.lastBuild.bodies) || [], gruppen = new Map();
    for (const b of alle) {
      const g = ctx.compOf(b) || b;
      if (!gruppen.has(g)) gruppen.set(g, []);
      gruppen.get(g).push(b);
    }
    return [[...gruppen.values()]];
  }
  const aktiv = () => saetzeFuerKern().some(s => s.length >= 2);

  /* Gelenk von alt nach neu bewegen; zurück: erlaubte Werte (gleich neu, wenn kein Kontakt) und das berührende Paar */
  async function begrenze(f, felder, basis) {
    if (!aktiv() || !f || f.type !== 'joint') return null;
    const sp = Object.fromEntries(Object.entries(felder).filter(([, [a, b]]) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 1e-9));
    if (!Object.keys(sp).length) return null;
    // basis: Feature-Liste mit den übrigen Gelenkwerten (Bewegungsstudie); sonst das Dokument
    const feats = (basis || ctx.doc.features).map(x => (x.id === f.id ? { ...x, ...f } : x));
    const r = await ctx.kernel.kontakt(feats, f.id, sp, saetzeFuerKern(), ctx.kctx());
    if (!r || r.schonAmStart || r.s >= 1 - 1e-9) return null;
    const rund = v => Math.round(v * 1000) / 1000;
    return { werte: Object.fromEntries(Object.entries(r.werte).map(([k, v]) => [k, rund(v)])), paar: r.paar };
  }
  const meldung = paar => `Kontakt: ${paar ? `${ctx.bodyName(paar[0])} berührt ${ctx.bodyName(paar[1])} – ` : ''}Gelenk angehalten.`;

  /* ---------- Menü und Dialog ---------- */
  function setzeModus(m) {
    ctx.pushHistory();
    daten().modus = m;
    ctx.store(); ctx.renderBrowser(); ctx.ribbonSync && ctx.ribbonSync();
    ctx.toast(m === 'aus' ? 'Kontaktanalyse deaktiviert.' : m === 'alle' ? 'Kontakt aller Komponenten: Gelenke halten an, sobald sich Teile berühren.' : daten().saetze.length ? 'Kontaktsätze aktiviert.' : 'Kontaktsätze aktiviert – mit „Neuer Kontaktsatz“ Teile wählen, die sich nicht durchdringen sollen.');
  }
  function oeffne(id) {
    const k = daten(), s = id && k.saetze.find(x => x.id === id);
    entwurf = s ? { id: s.id, name: s.name, glieder: s.glieder.slice() } : { id: null, name: `Kontaktsatz${k.saetze.length + 1}`, glieder: [] };
    ctx.closeDialog();
    ctx.setMode('kontakt');
    ctx.vp.setPickMode('face');
    zeichne();
  }
  function kandidaten() {
    const ids = (ctx.lastBuild && ctx.lastBuild.bodies) || [], set = new Set();
    ids.forEach(b => set.add(gliedVonKoerper(b)));
    return [...set];
  }
  function zeichne() {
    if (!entwurf) return;
    const d = $('#dialog');
    d.className = 'dialog';
    d.innerHTML = `<header>${icon('joint', 20)}<input class="dname" data-kontakt="name" value="${esc(entwurf.name)}" aria-label="Name"></header><div class="dbody">
      <div class="row col"><span>Komponenten / Körper</span><div class="btns bchips">${kandidaten().map(g => `<button type="button" class="chip" data-cmd="kontakt-glied" data-id="${esc(g)}" aria-pressed="${entwurf.glieder.includes(g)}">${icon(koerperVon(g).length > 1 || g !== koerperVon(g)[0] ? 'component' : 'body', 14)} ${esc(gliedName(g))}</button>`).join('')}</div></div>
      <p class="info">Teile im Modell anklicken oder oben wählen (mindestens zwei). Bewegt ein Gelenk eines davon, hält es an, sobald es ein anderes Glied dieses Satzes berührt.${modus() !== 'saetze' ? ' <span>Wirkt, wenn unter Kontakt „Kontaktsätze aktivieren“ gewählt ist.</span>' : ''}</p>
      </div><footer><button type="button" class="btn primary" data-cmd="kontakt-ok"${entwurf.glieder.length < 2 ? ' disabled' : ''}>OK</button><button type="button" class="btn" data-cmd="kontakt-abbrechen">Abbrechen</button></footer>`;
    d.hidden = false;
    const m = ctx.lastBuild && ctx.lastBuild.mesh, faces = [], gew = new Set(entwurf.glieder.flatMap(koerperVon));
    if (m) m.bodies.forEach(b => { if (gew.has(b.id)) for (let i = b.faces[0]; i < b.faces[1]; i++) faces.push(i); });
    ctx.vp.setSelection({ faces });
  }
  function schalte(g) {
    if (!entwurf || !g) return;
    entwurf.glieder = entwurf.glieder.includes(g) ? entwurf.glieder.filter(x => x !== g) : [...entwurf.glieder, g];
    zeichne();
  }
  function schliesse() { entwurf = null; ctx.closeDialog(); ctx.vp.setSelection({}); ctx.vp.setPickMode('none'); ctx.setMode('model'); }
  function ok() {
    if (!entwurf || entwurf.glieder.length < 2) return;
    ctx.pushHistory();
    const k = daten(), s = entwurf.id && k.saetze.find(x => x.id === entwurf.id);
    const name = entwurf.name.trim().slice(0, 60) || 'Kontaktsatz';
    if (s) { s.name = name; s.glieder = entwurf.glieder.slice(); }
    else k.saetze.push({ id: ctx.uid(), name, glieder: entwurf.glieder.slice() });
    // der erste Kontaktsatz schaltet die Kontaktsätze ein
    if (k.modus === 'aus') k.modus = 'saetze';
    ctx.store();
    schliesse();
    ctx.renderBrowser();
    ctx.toast('Kontaktsatz gespeichert. Gelenke halten jetzt an, sobald sich diese Teile berühren.');
  }
  function pick(h) {
    if (!h || h.kind !== 'face' || !entwurf) return;
    const id = ctx.bodyIdAtFace(h.info);
    if (id) schalte(gliedVonKoerper(id));
  }
  function cmd(c, el) {
    const id = el && el.dataset.id;
    if (c === 'kontakt-saetze') return setzeModus('saetze');
    if (c === 'kontakt-alle') return setzeModus('alle');
    if (c === 'kontakt-aus') return setzeModus('aus');
    if (c === 'kontakt-neu') return oeffne(null);
    if (c === 'kontakt-bearbeiten') return oeffne(id);
    if (c === 'kontakt-glied') return schalte(id);
    if (c === 'kontakt-ok') return ok();
    if (c === 'kontakt-abbrechen') return schliesse();
    if (c === 'kontakt-umschalten' || c === 'kontakt-loeschen') {
      const k = daten(), s = k.saetze.find(x => x.id === id);
      if (!s) return;
      ctx.pushHistory();
      if (c === 'kontakt-umschalten') s.aus = !s.aus; else k.saetze = k.saetze.filter(x => x !== s);
      ctx.store(); ctx.renderBrowser();
    }
  }
  function eingabe(t) { if (entwurf && t.dataset.kontakt === 'name') entwurf.name = t.value; }

  /* Ordner „Kontaktsätze“ im Browser (nur in Baugruppen bzw. sobald es Sätze gibt) */
  function browserOrdner(fold) {
    const k = ctx.doc.kontakt;
    if (!k || (!k.saetze.length && k.modus === 'aus')) return '';
    const kopf = `<p class="b-empty">${k.modus === 'aus' ? 'Kontaktanalyse aus' : k.modus === 'alle' ? 'Kontakt aller Komponenten' : 'Kontaktsätze aktiv'}</p>`;
    const zeilen = k.saetze.map(s => `<div class="b-line"><button type="button" class="b-row" data-cmd="kontakt-bearbeiten" data-id="${esc(s.id)}" title="${esc(s.glieder.map(gliedName).join(', '))}">${icon('joint', 15)}<span>${esc(s.name)}</span><em>${s.glieder.length}</em></button><button type="button" class="iconbtn" data-cmd="kontakt-umschalten" data-id="${esc(s.id)}" title="${s.aus ? 'Einschalten' : 'Ausschalten'}">${icon(s.aus ? 'eyeOff' : 'eye', 16)}</button><button type="button" class="iconbtn" data-cmd="kontakt-loeschen" data-id="${esc(s.id)}" title="Löschen">${icon('close', 14)}</button></div>`).join('');
    return fold('Kontaktsätze', k.saetze.length, kopf + zeilen, false);
  }

  return { begrenze, meldung, aktiv, cmd, pick, eingabe, browserOrdner, schliesse, modus };
}
