import fontkit from "@pdf-lib/fontkit";
import { unzlibSync, strFromU8 } from "fflate";
import { PDFArray, PDFDocument, PDFRawStream, PDFRef } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PdfRect = { x: number; y: number; width: number; height: number };

const PT_TO_MM = 25.4 / 72;

export async function pageContent(bytes: Uint8Array, index = 0) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(index);
  const contents: any = page.node.Contents();
  const items = contents instanceof PDFArray ? contents.asArray() : [contents];
  const text = items
    .map((item: any) => doc.context.lookup(item instanceof PDFRef ? item : item) as PDFRawStream)
    .map((stream: any) => (stream instanceof PDFRawStream ? strFromU8(unzlibSync(stream.getContents())) : stream.getContentsString()))
    .join("\n");
  const { width, height } = page.getSize();
  return { width, height, text };
}

/** Stroked `re` operators, converted back to mm with a top-left origin. */
export async function readGuideRects(bytes: Uint8Array, index = 0): Promise<PdfRect[]> {
  const { height, text } = await pageContent(bytes, index);
  return [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)].map((m) => {
    const [x, y, w, h] = m.slice(1, 5).map(Number);
    return { x: x * PT_TO_MM, y: (height - y - h) * PT_TO_MM, width: w * PT_TO_MM, height: h * PT_TO_MM };
  });
}

/** Glyph ids shown by `Tj` that have no outline in the embedded font program (excluding spaces). */
export async function invisibleGlyphs(bytes: Uint8Array): Promise<{ shown: number; invisible: number }> {
  const doc = await PDFDocument.load(bytes);
  const programs: any[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      const font: any = fontkit.create(unzlibSync(object.getContents()));
      if (font.numGlyphs) programs.push(font);
    } catch {
      // Not a font stream.
    }
  }
  const { text } = await pageContent(bytes);
  let shown = 0;
  let invisible = 0;
  for (const match of text.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
    for (let i = 0; i < match[1].length; i += 4) {
      const gid = parseInt(match[1].slice(i, i + 4), 16);
      shown++;
      if (programs[0].getGlyph(gid).path.commands.length === 0) invisible++;
    }
  }
  return { shown, invisible };
}

export async function countGuideCurves(bytes: Uint8Array): Promise<number> {
  return [...(await pageContent(bytes)).text.matchAll(/\bc\s+(?:[^\n]*\s+c\s+){3}h\b/g)].length;
}

export async function readText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  return content.items.map((item: any) => item.str).join(" ");
}
