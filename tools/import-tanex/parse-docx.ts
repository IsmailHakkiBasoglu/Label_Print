import type { GridSpec } from "../../src/core/geometry";
import { normalizeSheet } from "../../src/core/templates";

export type GridResult = {
  sheet: { width: number; height: number };
  grid: GridSpec;
  /** The label size to use: the nominal one, or Word's when the nominal labels cannot fit the sheet. */
  label: { width: number; height: number };
  /** Approximations a person should check against real paper; empty for an exact match. */
  notes: string[];
};

const MATCH_MM = 0.1;
/** Word offsets tables by a border width (typically -15 twips); not a real position. */
const BORDER_INDENT_TW = 20;
/** Word cells may differ from the printed label size by this much and still count as label cells. */
const NEAR_MIN_MM = 2.5;
const NEAR_RATIO = 0.1;
/** Label cells found by approximation may still differ from each other by this much (Word rounding, a last row). */
const CELL_SPREAD_MM = 0.6;
/** A grid that overflows the sheet by up to this much is pulled back or shrunk to fit (Word rounding). */
const FIT_MAX_MM = 2;
const twToMm = (tw: number) => (tw * 25.4) / 1440;
const fmt = (mm: number) => mm.toFixed(2);

function attr(tag: string, name: string): number | null {
  const m = new RegExp(`w:${name}="(-?\\d+)"`).exec(tag);
  return m ? Number(m[1]) : null;
}

type Axis = { count: number; lead: number; gap: number; cell: number; exact: boolean } | { error: string };

/** Sizes alternate labels and spacers; finds the cells `isLabel` accepts and returns their count, lead-in and spacing. */
function matchAxis(sizes: number[], isLabel: (size: number) => boolean, label: number, name: string): Axis {
  const positions: number[] = [];
  const matched: number[] = [];
  let cursor = 0;
  sizes.forEach((size, i) => {
    if (isLabel(size)) {
      positions.push(cursor);
      matched.push(i);
    }
    cursor += size;
  });
  if (positions.length === 0) return { error: `${name} ölçüsü Word tablosunda bulunamadı.` };
  const outer = sizes.filter((_, i) => i < matched[0] || i > matched[matched.length - 1]);
  if (outer.some((size) => size >= label / 2)) return { error: `${name}: tablonun kenarında etiket ölçüsüne uymayan bir satır/sütun var.` };
  if (positions.length === 1) return { count: 1, lead: positions[0], gap: 0, cell: label, exact: true };
  const pitch = (positions[positions.length - 1] - positions[0]) / (positions.length - 1);
  if (positions.some((p, i) => Math.abs(p - positions[0] - i * pitch) > MATCH_MM)) {
    return { error: `${name} aralıkları düzensiz.` };
  }
  const gap = pitch - label;
  return { count: positions.length, lead: positions[0], gap: Math.abs(gap) <= MATCH_MM ? 0 : gap, cell: label, exact: true };
}

/** Exact label cells first; otherwise uniform cells within a few millimetres of the label size. */
function readAxis(sizes: number[], label: number, name: string): Axis {
  const exact = matchAxis(sizes, (size) => Math.abs(size - label) <= MATCH_MM, label, name);
  if (!("error" in exact)) return exact;
  const tolerance = Math.max(NEAR_MIN_MM, label * NEAR_RATIO);
  const near = sizes.filter((size) => Math.abs(size - label) <= tolerance).sort((a, b) => a - b);
  if (near.length === 0) return exact;
  const cell = near[Math.floor(near.length / 2)];
  const approx = matchAxis(sizes, (size) => Math.abs(size - cell) <= CELL_SPREAD_MM, cell, name);
  if ("error" in approx) return exact;
  return { ...approx, cell, exact: approx.count === 1 ? Math.abs(cell - label) <= MATCH_MM : false };
}

type Placed = { count: number; margin: number; gap: number; size: number; note?: string };

/** Pulls a grid that slightly overflows the sheet back onto it, shrinking the label only when moving is not enough. */
function fit(p: Placed, extent: number, name: string): Placed[] {
  const block = p.count * p.size + (p.count - 1) * p.gap;
  const overflow = p.margin + block - extent;
  // Same allowance as validateTemplate: hundredths of a millimetre are printing noise, not overflow.
  if (overflow <= 0.011 || block - extent > FIT_MAX_MM) return [p];
  if (block <= extent) {
    return [p, { ...p, margin: extent - block, note: `${name}: ızgarayı sayfaya sığdırmak için ${fmt(overflow)} mm kaydırıldı.` }];
  }
  const size = (extent - (p.count - 1) * p.gap) / p.count;
  return [p, { ...p, margin: 0, size, note: `${name}: sayfaya sığması için etiket ${fmt(p.size)} mm yerine ${fmt(size)} mm alındı.` }];
}

/** Turns Word cells into label positions along one axis, keeping the nominal label size whenever it fits. */
function place(axis: Exclude<Axis, { error: string }>, nominal: number, start: number, extent: number, name: string): Placed {
  const cellStart = start + axis.lead;
  if (axis.exact && Math.abs(axis.cell - nominal) <= MATCH_MM) return { count: axis.count, margin: cellStart, gap: axis.gap, size: nominal };
  const pitch = axis.cell + axis.gap;
  const clamp = (margin: number, block: number) => Math.min(Math.max(margin, 0), Math.max(extent - block, 0));
  if (axis.count === 1 || pitch >= nominal - MATCH_MM) {
    const gap = Math.max(pitch - nominal, 0);
    const block = axis.count * nominal + (axis.count - 1) * gap;
    return {
      count: axis.count,
      margin: clamp(cellStart + (axis.cell - nominal) / 2, block),
      gap: gap <= MATCH_MM ? 0 : gap,
      size: nominal,
      note: `${name}: Word hücresi ${fmt(axis.cell)} mm, etiket ${nominal} mm; etiket hücrenin ortasına yerleştirildi.`,
    };
  }
  const block = axis.count * nominal;
  if (block <= extent) {
    const center = cellStart + (axis.count * pitch - axis.gap) / 2;
    return {
      count: axis.count,
      margin: clamp(center - block / 2, block),
      gap: 0,
      size: nominal,
      note: `${name}: Word hücreleri (${fmt(axis.cell)} mm) etiketten (${nominal} mm) küçük; etiketler bitişik dizildi.`,
    };
  }
  return {
    count: axis.count,
    margin: cellStart,
    gap: axis.gap,
    size: axis.cell,
    note: `${name}: ${axis.count} etiket ${nominal} mm ile sayfaya sığmıyor; Word ölçüsü (${fmt(axis.cell)} mm) kullanıldı.`,
  };
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
  const acrossSteps = fit(place(x, label.width, left, sheet.width, "Etiket genişliği"), sheet.width, "Etiket genişliği");
  const downSteps = fit(place(y, label.height, top, sheet.height, "Etiket yüksekliği"), sheet.height, "Etiket yüksekliği");
  const [across, down] = [acrossSteps.at(-1)!, downSteps.at(-1)!];
  return {
    sheet,
    grid: { columns: across.count, rows: down.count, marginLeft: across.margin, marginTop: down.margin, gapX: across.gap, gapY: down.gap },
    label: { width: across.size, height: down.size },
    notes: [...acrossSteps, ...downSteps].flatMap((step) => step.note ?? []),
  };
}
