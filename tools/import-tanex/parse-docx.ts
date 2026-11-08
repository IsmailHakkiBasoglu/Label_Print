import type { GridSpec } from "../../src/core/geometry";
import { normalizeSheet } from "../../src/core/templates";

export type GridResult = { sheet: { width: number; height: number }; grid: GridSpec };

const MATCH_MM = 0.1;
/** Word offsets tables by a border width (typically -15 twips); not a real position. */
const BORDER_INDENT_TW = 20;
const twToMm = (tw: number) => (tw * 25.4) / 1440;

function attr(tag: string, name: string): number | null {
  const m = new RegExp(`w:${name}="(-?\\d+)"`).exec(tag);
  return m ? Number(m[1]) : null;
}

type Axis = { count: number; lead: number; gap: number } | { error: string };

/** Sizes alternate labels and spacers; finds labels and returns their count, lead-in and spacing. */
function readAxis(sizes: number[], label: number, name: string): Axis {
  const positions: number[] = [];
  const matched: number[] = [];
  let cursor = 0;
  sizes.forEach((size, i) => {
    if (Math.abs(size - label) <= MATCH_MM) {
      positions.push(cursor);
      matched.push(i);
    }
    cursor += size;
  });
  if (positions.length === 0) return { error: `${name} ölçüsü Word tablosunda bulunamadı.` };
  const outer = sizes.filter((_, i) => i < matched[0] || i > matched[matched.length - 1]);
  if (outer.some((size) => size >= label / 2)) return { error: `${name}: tablonun kenarında etiket ölçüsüne uymayan bir satır/sütun var.` };
  if (positions.length === 1) return { count: 1, lead: positions[0], gap: 0 };
  const pitch = (positions[positions.length - 1] - positions[0]) / (positions.length - 1);
  if (positions.some((p, i) => Math.abs(p - positions[0] - i * pitch) > MATCH_MM)) {
    return { error: `${name} aralıkları düzensiz.` };
  }
  const gap = pitch - label;
  return { count: positions.length, lead: positions[0], gap: Math.abs(gap) <= MATCH_MM ? 0 : gap };
}

export function parseDocumentXml(xml: string, label: { width: number; height: number }): GridResult | { error: string } {
  const table = /<w:tbl>([\s\S]*?)<\/w:tbl>/.exec(xml)?.[1];
  if (!table) return { error: "Word dosyasında tablo yok." };
  const pgSz = /<w:pgSz[^>]*>/.exec(xml)?.[0];
  const pgMar = /<w:pgMar[^>]*>/.exec(xml)?.[0];
  if (!pgSz || !pgMar) return { error: "Sayfa bilgisi yok." };
  const sheet = normalizeSheet(twToMm(attr(pgSz, "w") ?? 0), twToMm(attr(pgSz, "h") ?? 0));

  const columns = [...table.matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)].map((m) => twToMm(Number(m[1])));
  const rows = [...table.matchAll(/<w:trHeight[^>]*w:val="(\d+)"/g)].map((m) => twToMm(Number(m[1])));
  const x = readAxis(columns, label.width, "Etiket genişliği");
  if ("error" in x) return x;
  const y = readAxis(rows, label.height, "Etiket yüksekliği");
  if ("error" in y) return y;

  const tblPr = /<w:tblPr>[\s\S]*?<\/w:tblPr>/.exec(table)?.[0] ?? "";
  const floating = /<w:tblpPr[^>]*>/.exec(table)?.[0];
  const pageAnchored = floating && /horzAnchor="page"/.test(floating) && /vertAnchor="page"/.test(floating);
  if (floating && !pageAnchored) return { error: "Tablo konumu sayfaya bağlı değil." };

  const indent = /<w:tblInd[^>]*>/.exec(tblPr)?.[0];
  const indentTw = indent ? attr(indent, "w") ?? 0 : 0;
  let left = twToMm(attr(pgMar, "left") ?? 0) + (Math.abs(indentTw) <= BORDER_INDENT_TW ? 0 : twToMm(indentTw));
  let top = twToMm(attr(pgMar, "top") ?? 0);
  if (/<w:jc w:val="center"/.test(tblPr)) left = (sheet.width - columns.reduce((a, b) => a + b, 0)) / 2;
  if (pageAnchored) {
    left = twToMm(attr(floating!, "tblpX") ?? 0);
    top = twToMm(attr(floating!, "tblpY") ?? 0);
  }
  return {
    sheet,
    grid: {
      columns: x.count,
      rows: y.count,
      marginLeft: left + x.lead,
      marginTop: top + y.lead,
      gapX: x.gap,
      gapY: y.gap,
    },
  };
}
