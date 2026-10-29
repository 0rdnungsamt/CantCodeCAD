// cantcodecad – 3MF-Export für den 3D-Druck: ein Objekt je Körper mit Name und Farbe.
// 3MF ist ein ZIP mit XML; geschrieben wird ohne Kompression (Methode „store“), das lesen alle Slicer.

const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'model/3mf' });
}

const xmlEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/* Doppelte Punkte (Flächengrenzen) zusammenführen, damit das Netz geschlossen ist */
function weld(vertices, triangles) {
  const map = new Map(), pts = [], idx = new Uint32Array(triangles.length), remap = new Uint32Array(vertices.length / 3);
  for (let i = 0; i < vertices.length / 3; i++) {
    const x = vertices[3 * i], y = vertices[3 * i + 1], z = vertices[3 * i + 2];
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let k = map.get(key);
    if (k === undefined) { k = pts.length / 3; map.set(key, k); pts.push(x, y, z); }
    remap[i] = k;
  }
  let m = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = remap[triangles[t]], b = remap[triangles[t + 1]], c = remap[triangles[t + 2]];
    if (a === b || b === c || a === c) continue;
    idx[m++] = a; idx[m++] = b; idx[m++] = c;
  }
  return { pts, tris: idx.subarray(0, m) };
}

/* items: [{ name, color: '#rrggbb', vertices: Float32Array, triangles: Uint32Array }] */
export function build3MF(items, title = 'cantcodecad') {
  const f = v => (Math.round(v * 1e5) / 1e5).toString();
  const mats = items.map(it => `<base name="${xmlEsc(it.name)}" displaycolor="${(it.color || '#c7cfd8').toUpperCase()}FF"/>`).join('');
  const objects = items.map((it, i) => {
    const { pts, tris } = weld(it.vertices, it.triangles);
    const vs = [];
    for (let k = 0; k < pts.length; k += 3) vs.push(`<vertex x="${f(pts[k])}" y="${f(pts[k + 1])}" z="${f(pts[k + 2])}"/>`);
    const ts = [];
    for (let k = 0; k < tris.length; k += 3) ts.push(`<triangle v1="${tris[k]}" v2="${tris[k + 1]}" v3="${tris[k + 2]}"/>`);
    return `<object id="${i + 2}" type="model" name="${xmlEsc(it.name)}" pid="1" pindex="${i}"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`;
  }).join('\n');
  const build = items.map((_, i) => `<item objectid="${i + 2}"/>`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${xmlEsc(title)}</metadata><metadata name="Application">cantcodecad</metadata>
<resources><basematerials id="1">${mats}</basematerials>
${objects}
</resources>
<build>${build}</build>
</model>`;
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: model }
  ]);
}
