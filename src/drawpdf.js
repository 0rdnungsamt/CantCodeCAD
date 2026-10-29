/* Zeichnungsblätter → Vektor-PDF (ohne Fremdbibliothek). Nutzt die Geometrie aus sheetEntities (drawdxf.js):
   Linienzüge, Bögen/Kreise (als Bézier), gefüllte Pfeile, Texte in Helvetica (WinAnsi). Eine Seite je Blatt, in mm. */
import { sheetEntities } from './drawdxf.js';

const K = 72 / 25.4; // mm → pt
const num = v => (Math.abs(v) < 5e-6 ? '0' : (Math.round(v * 1e4) / 1e4).toString());

// Helvetica-Breiten (Näherung in Em) für die Ausrichtung zentrierter/rechtsbündiger Texte
function textWidth(s, size) {
  let w = 0;
  for (const ch of s) {
    if (' '.includes(ch)) w += 0.278;
    else if ('il.,:;|!\'`'.includes(ch)) w += 0.24;
    else if ('fjtrI()[]/'.includes(ch)) w += 0.31;
    else if ('mwMW'.includes(ch)) w += 0.85;
    else if (/[0-9]/.test(ch)) w += 0.556;
    else if (/[A-ZÄÖÜ]/.test(ch)) w += 0.68;
    else w += 0.53;
  }
  return w * size;
}
// Text → PDF-Zeichenkette in WinAnsi (Bytes > 127 als Oktal-Escapes, damit der Inhalt ASCII bleibt)
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '⌀': 0xd8 };
function pdfString(s) {
  let o = '(';
  for (const ch of s) {
    let c = WIN[ch] ?? ch.codePointAt(0);
    if (c > 0xff || (c >= 0x80 && c < 0xa0 && !Object.values(WIN).includes(c))) c = 0x3f;
    if (c === 0x28 || c === 0x29 || c === 0x5c) o += '\\' + String.fromCharCode(c);
    else if (c < 0x20 || c > 0x7e) o += '\\' + c.toString(8).padStart(3, '0');
    else o += String.fromCharCode(c);
  }
  return o + ')';
}
// Kreisbogen (Grad, gegen den Uhrzeigersinn) als Bézier-Stücke ≤ 90°
function arcPath(c, r, a0, a1) {
  while (a1 <= a0) a1 += 360;
  const n = Math.max(1, Math.ceil((a1 - a0) / 90 - 1e-9)), d = (a1 - a0) / n * Math.PI / 180, k = 4 / 3 * Math.tan(d / 4);
  let t = a0 * Math.PI / 180;
  const P = a => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  let p = P(t), out = `${num(p[0])} ${num(p[1])} m`;
  for (let i = 0; i < n; i++) {
    const t2 = t + d, q = P(t2);
    out += ` ${num(p[0] - k * r * Math.sin(t))} ${num(p[1] + k * r * Math.cos(t))} ${num(q[0] + k * r * Math.sin(t2))} ${num(q[1] - k * r * Math.cos(t2))} ${num(q[0])} ${num(q[1])} c`;
    t = t2; p = q;
  }
  return out;
}
function pageContent(ents) {
  const o = [`${num(K)} 0 0 ${num(K)} 0 0 cm`, '1 J 1 j 0 0 0 RG 0 0 0 rg'];
  let lw = null, ld = null;
  const pen = e => {
    const w = Math.max(0.05, e.w || 0.25), d = e.dash ? `[${e.dash.map(num).join(' ')}] 0 d` : '[] 0 d';
    if (w !== lw) { o.push(`${num(w)} w`); lw = w; }
    if (d !== ld) { o.push(d); ld = d; }
  };
  ents.forEach(e => {
    if (e.t === 'POLY') { pen(e); o.push(e.P.map((p, i) => `${num(p[0])} ${num(p[1])} ${i ? 'l' : 'm'}`).join(' ') + (e.closed ? ' h S' : ' S')); }
    else if (e.t === 'ARC') { pen(e); o.push(arcPath(e.c, e.r, e.s, e.e) + ' S'); }
    else if (e.t === 'CIRCLE') { pen(e); o.push(arcPath(e.c, e.r, 0, 360) + ' h S'); }
    else if (e.t === 'SOLID') { const P = [e.P[0], e.P[1], e.P[3], e.P[2]].filter((p, i, A) => i === 0 || Math.hypot(p[0] - A[i - 1][0], p[1] - A[i - 1][1]) > 1e-9); o.push(P.map((p, i) => `${num(p[0])} ${num(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h f'); }
    else if (e.t === 'TEXT' && e.raw) {
      // Pfeile gibt es in der Standardschrift nicht (Biegerichtung)
      const txt = e.raw.replace(/\s*↑\s*/g, ' nach oben ').replace(/\s*↓\s*/g, ' nach unten ').trim();
      const size = e.h / 0.718, a = (e.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const dx = e.j === 1 ? -textWidth(txt, size) / 2 : e.j === 2 ? -textWidth(txt, size) : 0;
      const x = e.p[0] + dx * c, y = e.p[1] + dx * s;
      o.push(`BT /${e.bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(x)} ${num(y)} Tm ${pdfString(txt)} Tj ET`);
    }
  });
  return o.join('\n');
}
/* svgs: gezeichnete Blätter (im Dokument eingehängt). Rückgabe: PDF als Uint8Array. */
export function sheetsToPdf(svgs, title = 'Zeichnung') {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(''), pages = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  svgs.forEach(svg => {
    const { ents, W, H } = sheetEntities(svg);
    const content = pageContent(ents);
    const cs = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${num(W * K)} ${num(H * K)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cs} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(title)} /Producer (cantcodecad) >>`);
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(v => `${String(v).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const b = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 0xff;
  return b;
}
