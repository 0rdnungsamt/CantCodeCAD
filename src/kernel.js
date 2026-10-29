// Verbindung zum Geometrie-Kern im Worker. Jeder Auftrag ist ein Promise;
// veraltete Bau-Ergebnisse werden verworfen, damit die Anzeige nie zurückspringt.
import { importKey } from './importkey.js';

/* Kontext eines Auftrags. Eingefügte Teile werden in `prep` kopiert (samt Importen darin). */
const ctxPayload = ctx => ({ hidden: ctx.hidden || [], components: ctx.components || [], inserts: ctx.inserts || [], sheet: ctx.sheet || null });

export class Kernel {
  constructor() {
    this.worker = new Worker(new URL('./kernel-worker.js', import.meta.url), { type: 'module' });
    this.seq = 0;
    this.pending = new Map();
    this.buildGen = 0;
    /* Letzte Bauanfrage und ihr Ergebnis (siehe `build()`): eine zweite Anfrage mit unveränderter
       Eingabe geht nicht noch einmal durch den Kern. */
    this.bauSchluessel = null;
    this.bauErgebnis = null;
    /* Importe, deren Form der Kern schon hat (Schlüssel aus src/importkey.js): ihr Dateitext geht
       nicht noch einmal mit. Bei einer großen STEP-Baugruppe (37,5 MB) waren das je Bedienschritt
       zwei vollständige Kopien des Texts auf der Seite, eine dritte als Vergleichsschlüssel und das
       Zuschicken an den Worker. */
    this.importBekannt = new Set();
    /* Netze, deren Flächen- und Kantenbeschreibungen der Kern nicht noch einmal schickt (siehe
       `resolveMesh`): die letzte Antwort und ein Nachtrag, der seither kam. */
    this.netzQuellen = [];
    this.worker.onmessage = e => {
      const { id, ok, result, error, typ } = e.data;
      /* Nachtrag zu einem Bau: die feinen Netze, die nach der groben Fassung nachgezogen wurden
         (siehe `netzVerfeinern` im Kern). Kein Auftrag, deshalb kein Promise – wer davon weiß,
         tauscht die Anzeige. Der zugehörige Bau steht in `result.bauId`. */
      if (typ === 'netz') {
        /* Der Nachtrag schickt Beschreibungen nur für neue Körpernetze; die übrigen kommen aus dem
           Netz der letzten Antwort. Fehlt eine Quelle (sollte nicht vorkommen), bleibt die grobe
           Fassung stehen – der nächste Bau rechnet die Verfeinerung neu an. */
        try { this.resolveMesh(result && result.mesh); } catch (_) { return; }
        if (result && result.mesh) { if (this.building) this.netzQuellen.push(result.mesh); else this.netzQuellen = [result.mesh]; }
        /* Das gespeicherte Ergebnis bleibt bei dem, was die Anzeige zeigt: der Nachtrag tauscht das
           Netz aus, und eine spätere Anfrage mit unveränderter Eingabe darf nicht die grobe Fassung
           zurückbringen (siehe `build()`). */
        if (this.bauErgebnis && result && result.bauId === this.bauErgebnis.bauId) this.bauErgebnis.mesh = result.mesh;
        if (this.onNetz) this.onNetz(result);
        return;
      }
      /* Nachtrag zu einem Nachtrag: die genauen Volumen, die nach der feinen Netzfassung folgen
         (siehe `volumenVerfeinern` im Kern). Auch das ist kein Auftrag ohne Promise. */
      if (typ === 'volumen') { if (this.onVolumen) this.onVolumen(result); return; }
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };
    this.worker.onerror = e => {
      const err = new Error(e.message || 'Der Geometriekern konnte nicht starten');
      this.pending.forEach(p => p.reject(err));
      this.pending.clear();
      if (this.onFatal) this.onFatal(err);
    };
  }

  /* Auftrag für den Worker vorbereiten: Features und eingefügte Teile werden kopiert (die Seite ändert
     ihr Dokument weiter), Importe tragen ihren Schlüssel `dataKey`, und der Dateitext bleibt weg, wenn
     der Kern ihn schon verarbeitet hat. `ohneDaten` lässt ihn immer weg (Vergleichsschlüssel). */
  prep(payload, ohneDaten = false) {
    const keys = [];
    const doc = d => (d ? { ...d, features: feats(d.features), inserts: ins(d.inserts) } : d);
    const feats = list => (Array.isArray(list) ? list.map(f => {
      if (f && f.type === 'import') {
        const key = importKey(f), mitDaten = !ohneDaten && !this.importBekannt.has(key) && typeof f.data === 'string';
        keys.push(key);
        const { data, ...rest } = f;
        return mitDaten ? { ...JSON.parse(JSON.stringify(rest)), dataKey: key, data } : { ...JSON.parse(JSON.stringify(rest)), dataKey: key };
      }
      if (f && f.type === 'derive' && f.part) return { ...JSON.parse(JSON.stringify({ ...f, part: null })), part: doc(f.part) };
      return JSON.parse(JSON.stringify(f));
    }) : list);
    const ins = list => (Array.isArray(list) ? list.map(i => ({ ...JSON.parse(JSON.stringify({ ...i, part: null })), part: doc(i.part) })) : list);
    if (!payload || (!payload.features && !payload.inserts)) return { payload, keys };
    return { payload: { ...payload, features: feats(payload.features), inserts: ins(payload.inserts) }, keys };
  }
  raw(type, payload) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }
  call(type, payload) {
    /* Was im Kern etwas verwirft, macht auch das gespeicherte Bauergebnis unbrauchbar: bei
       unveränderter Eingabe würde sonst ein Ergebnis aus weggeworfenem Zustand weitergereicht. */
    if (type.startsWith('devClear')) { this.bauSchluessel = null; this.bauErgebnis = null; this.importBekannt.clear(); }
    const send = () => {
      const pr = this.prep(payload);
      return this.raw(type, pr.payload).then(res => { pr.keys.forEach(k => this.importBekannt.add(k)); return res; });
    };
    // Kern hat eine Form nicht mehr (verdrängt, Speicher geleert): einmal mit Dateitext nachschicken
    return send().catch(err => {
      const m = /^NEED_DATA:(.*)$/.exec(String((err && err.message) || ''));
      if (!m) throw err;
      m[1].split('|').forEach(k => this.importBekannt.delete(k));
      return send();
    });
  }

  /* Kennungen der Körpernetze, deren Beschreibungen die Seite hat (geht mit jedem Bau zum Kern) */
  haveUids() {
    const s = new Set();
    this.netzQuellen.forEach(m => (m.bodies || []).forEach(b => { if (b.uid) s.add(b.uid); }));
    return [...s];
  }
  /* Antwort mit `delta`: Beschreibungen der Körper mit `ref` aus dem vorigen Netz übernehmen, Nummern
     verschoben (Dreiecke `start` um die neue Lage der Körperdreiecke, Kanten um die der Kantenpunkte,
     `body` = neue Körpernummer). Unverändert liegende Beschreibungen werden als dasselbe Objekt
     übernommen. Wirft, wenn eine Quelle fehlt. */
  resolveMesh(mesh) {
    if (!mesh || !mesh.delta) return mesh;
    const src = new Map();
    this.netzQuellen.forEach(m => (m.bodies || []).forEach((b, bi) => { if (b.uid && !src.has(b.uid)) src.set(b.uid, { m, b }); }));
    const faces = new Array(mesh.nFaces), edges = new Array(mesh.nEdges);
    let fi = 0, ei = 0;
    mesh.bodies.forEach((b, bi) => {
      const nf = b.faces[1] - b.faces[0], ne = b.edges[1] - b.edges[0];
      if (b.ref) {
        const s = src.get(b.uid);
        if (!s || s.b.faces[1] - s.b.faces[0] !== nf || s.b.edges[1] - s.b.edges[0] !== ne) throw new Error('Netzquelle fehlt: ' + b.uid);
        const dT = b.tris[0] - s.b.tris[0], dE = b.evs[0] - s.b.evs[0];
        for (let k = 0; k < nf; k++) { const f = s.m.faces[s.b.faces[0] + k]; faces[b.faces[0] + k] = dT === 0 && f.body === bi ? f : { ...f, start: f.start + dT, body: bi }; }
        for (let k = 0; k < ne; k++) { const e = s.m.edges[s.b.edges[0] + k]; edges[b.edges[0] + k] = dE === 0 && e.body === bi ? e : { ...e, start: e.start + dE, body: bi }; }
        delete b.ref;
      } else {
        for (let k = 0; k < nf; k++) faces[b.faces[0] + k] = mesh.faces[fi++];
        for (let k = 0; k < ne; k++) edges[b.edges[0] + k] = mesh.edges[ei++];
      }
    });
    mesh.faces = faces; mesh.edges = edges;
    delete mesh.delta; delete mesh.nFaces; delete mesh.nEdges;
    return mesh;
  }

  init() { return this.call('init'); }

  /* Liefert null, wenn inzwischen ein neuerer Bau angefordert wurde. */
  /* ctx = { hidden, components, inserts } */
  /* Läuft schon ein Bau, wartet nur der neueste Auftrag; ältere werden gar nicht erst gerechnet
     (sonst stauen sich bei schweren Teilen viele veraltete Bauten im Worker). */
  async build(features, upTo, ctx = {}) {
    const gen = ++this.buildGen;
    const tAnfrage = performance.now();
    const payload = { features, upTo, ...ctxPayload(ctx) };
    /* Zweite Anfrage mit unveränderter Eingabe geht nicht noch einmal durch den Kern. Gemessen beim
       Anlegen eines Quaders in der großen Baugruppe: schon jede Wertänderung im Dialog löst einen Bau
       aus, und das Bestätigen legt denselben Stand noch einmal obenauf – diese letzte Anfrage wartete
       4,3 s auf den laufenden Bau und kostete dann 0,8 s Kern und 1,3 s Zuschicken für ein Ergebnis,
       das schon da war. Gespeichert wird eine eigene Hülle um das Ergebnis des Kerns; der
       Netznachtrag hält sie aktuell, damit eine spätere gleiche Anfrage die verfeinerte Fassung
       bekommt und nicht die grobe. */
    // ohne Dateitext: sonst wäre der Schlüssel bei großen Importen selbst so groß wie die Datei
    const schluessel = JSON.stringify(this.prep(payload, true).payload);
    if (schluessel === this.bauSchluessel) {
      const laufend = this.building;
      const res = laufend ? await laufend.catch(() => null) : this.bauErgebnis;
      if (gen !== this.buildGen) return null;
      if (res) {
        /* Weitergereicht wird eine flache Hülle um dasselbe Ergebnis: Netze und Beschreibungen sind
           dieselben Objekte, aber die Oberfläche erkennt an einem neuen Objekt, dass ihre Anfrage
           beantwortet ist, und hier kein Kern gerechnet hat. */
        return { ...res, wiederholt: true, gewartetMs: null, sperreMs: Math.round(performance.now() - tAnfrage) };
      }
    }
    while (this.building) {
      await this.building.catch(() => {});
      if (gen !== this.buildGen) return null;
    }
    /* Zeit, die dieser Auftrag hier in der Kundenwarteschlange der Seite lag: sie ist von der Wartezeit
       im Kern zu trennen, sonst wird eine zweite Bauanfrage kurz hintereinander als Übertragung des
       Ergebnisses gelesen. */
    const tSperre = Math.round(performance.now() - tAnfrage);
    /* Winzige Anfrage direkt vor dem Bauauftrag, in derselben Warteschlange: sie ist beantwortet,
       sobald der Worker frei wird, ihre Antwortzeit ist also die Zeit, die dieser Bau im Kern wartet –
       der Netznachtrag hält den Worker und gibt ihn erst nach einem Körper frei. Bewusst auf einer
       Uhr gemessen: Seite und Worker haben verschiedene Zeitlinien (gemessen rund 1,2 s Unterschied),
       ihre Zeitpunkte zu vergleichen wäre keine Zahl. */
    const tFreigabe = performance.now();
    const wartend = this.call('ping').then(() => Math.round(performance.now() - tFreigabe)).catch(() => null);
    // `have` erst hier, nicht im Vergleichsschlüssel: es ändert sich mit jeder Antwort
    const p = this.call('build', { ...payload, have: this.haveUids() }).then(res => {
      if (res && res.mesh) {
        try { this.resolveMesh(res.mesh); }
        catch (_) {
          // Quelle fehlt: denselben Bau einmal mit allen Beschreibungen
          this.netzQuellen = [];
          return this.call('build', { ...payload, have: [] }).then(r2 => { this.netzQuellen = r2 && r2.mesh ? [r2.mesh] : []; return r2; });
        }
      }
      this.netzQuellen = res && res.mesh ? [res.mesh] : [];
      return res;
    });
    this.building = p;
    this.bauSchluessel = schluessel;
    try {
      const res = await p;
      if (res) {
        res.gewartetMs = await wartend; res.sperreMs = tSperre; res.wiederholt = false;
        /* Für die Wiederholung wird eine eigene flache Hülle gespeichert, nicht das Ergebnis des
           Aufrufers: der Netznachtrag trägt nur in diese Kopie ein. Was der Aufrufer bekommen hat,
           bleibt genau das, was der Kern gesandt hat – sonst liest, wer ein Ergebnis festhält, am
           Ende die verfeinerte Fassung, obwohl er die grobe bekommen hat. */
        this.bauErgebnis = { ...res };
      }
      return gen === this.buildGen ? res : null;
    } catch (e) {
      /* Ein fehlgeschlagener Bau darf nicht als gültiges Ergebnis dieser Eingabe stehen bleiben. */
      this.bauSchluessel = null; this.bauErgebnis = null;
      throw e;
    } finally {
      if (this.building === p) this.building = null;
    }
  }

  measure(sels) { return this.call('measure', { sels }); }
  props(id) { return this.call('props', { id }); }
  shapeSigs() { return this.call('shapeSigs', {}); }
  isocurves(opts) { return this.call('isocurves', opts || {}); }
  gdGeometrie(opts) { return this.call('gdGeometrie', opts || {}); }
  sectionCurves(plane) { return this.call('sectionCurves', { plane }); }
  faceOutline(sel) { return this.call('faceOutline', { sel }); }
  extrusionErkennen(body) { return this.call('extrusionErkennen', { body }); }
  blechErkennen(body, sheet) { return this.call('blechErkennen', { body, sheet }); }
  interfere(features, ctx) { return this.call('interfere', { features, ...ctxPayload(ctx) }); }
  /* Kontaktsätze: Gelenk `joint` von felder[k][0] nach felder[k][1] bewegen, an der ersten Berührung anhalten */
  kontakt(features, joint, felder, saetze, ctx) { return this.call('kontakt', { features, joint, felder, saetze, ...ctxPayload(ctx) }); }
  mesh3mf(features, ctx, tolerance) { return this.call('mesh3mf', { features, ...ctxPayload(ctx), tolerance }); }
  supports(features, ctx, opts) { return this.call('supports', { features, ...ctxPayload(ctx), ...opts }); }
  drawing(features, ctx, views, section, breakouts, secs) { return this.call('drawing', { features, ...ctxPayload(ctx), views, section: section === true || typeof section === 'number' ? section : false, breakouts: JSON.parse(JSON.stringify(breakouts || {})), secs: JSON.parse(JSON.stringify(secs || {})) }); }

  exportFile(features, format, ctx = {}) {
    return this.call('export', { features, format, ...ctxPayload(ctx) });
  }
}
