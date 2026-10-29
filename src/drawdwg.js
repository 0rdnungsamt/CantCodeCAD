/* Zeichnungsblätter → DWG (R12). Das DWG entsteht aus dem DXF-Text, den sheetToDxf schon schreibt:
   dieselbe Geometrie, dieselben Layer, nur binär – deshalb gibt es beide Formate aus einer Quelle.
   Die Bibliothek nasjidwg (vendor/, MIT) liest DXF und schreibt DWG; sie wird erst beim Export geladen
   und lädt nur die Teile, die dafür nötig sind (DXF-Leser und der DWG-Schreiber für R12). */
import { sheetToDxf } from './drawdxf.js';

const LIB = '/cdn/npm/nasjidwg@0.18.0/dist/';
let lib = null;
function dwgLib() {
  if (!lib) lib = Promise.all([import(LIB + 'dxf/reader.js'), import(LIB + 'dwg/writer12.js')])
    .then(([rd, wr]) => ({ readDxf: rd.readDxf, writeDwg: wr.writeDwgR12 }));
  return lib;
}

/* DXF-Text (wie sheetToDxf ihn schreibt) → DWG-Bytes. R12, weil unser DXF R12 ist: öffnet in
   jedem gängigen Programm, das DWG ab R12 liest. Wirft wie der DXF-Weg, wenn etwas nicht passt. */
export async function dxfToDwg(dxfText) {
  const { readDxf, writeDwg } = await dwgLib();
  const { data } = writeDwg(readDxf(dxfText));
  return new Uint8Array(data);
}

/* Blatt (SVG-Wurzelelement eines Zeichenblatts) → DWG-Bytes */
export const sheetToDwg = async svg => dxfToDwg(sheetToDxf(svg));
