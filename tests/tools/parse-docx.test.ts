import { describe, expect, it } from "vitest";
import { parseDocumentXml, type GridResult } from "../../tools/import-tanex/parse-docx";

const tw = (mm: number) => Math.round((mm * 1440) / 25.4);

function doc(o: { top: number; left: number; cols: number[]; rows: number[]; tblPr?: string }): string {
  const grid = o.cols.map((c) => `<w:gridCol w:w="${c}"/>`).join("");
  const rows = o.rows.map((h) => `<w:tr w:rsidR="1"><w:trPr><w:trHeight w:hRule="exact" w:val="${h}"/></w:trPr></w:tr>`).join("");
  return `<w:body><w:tbl><w:tblPr>${o.tblPr ?? ""}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${o.top}" w:left="${o.left}"/></w:sectPr></w:body>`;
}

const alternate = (label: number, gap: number, n: number) =>
  Array.from({ length: n * 2 - 1 }, (_, i) => (i % 2 ? tw(gap) : tw(label)));

function ok(r: ReturnType<typeof parseDocumentXml>): GridResult {
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("parseDocumentXml", () => {
  it("reads a grid with column gaps (TW-2021)", () => {
    const r = ok(parseDocumentXml(doc({ top: 862, left: 386, cols: alternate(63.5, 3.02, 3), rows: Array(7).fill(tw(38.1)) }), { width: 63.5, height: 38.1 }));
    expect(r.sheet).toEqual({ width: 210, height: 297 });
    expect(r.grid.columns).toBe(3);
    expect(r.grid.rows).toBe(7);
    expect(r.grid.marginTop).toBeCloseTo(15.2, 1);
    expect(r.grid.marginLeft).toBeCloseTo(6.81, 1);
    expect(r.grid.gapX).toBeCloseTo(3.02, 1);
    expect(r.grid.gapY).toBe(0);
  });

  it("keeps the pitch when Word rounds the label (TW-2130)", () => {
    const rows = alternate(29.99, 2.61, 8);
    const r = ok(parseDocumentXml(doc({ top: 1133, left: 481, cols: alternate(29.99, 2.61, 6), rows }), { width: 30, height: 30 }));
    expect(r.grid.columns).toBe(6);
    expect(r.grid.rows).toBe(8);
    expect(r.grid.gapX).toBeCloseTo(2.6, 1);
    expect(r.grid.gapY).toBeCloseTo(2.6, 1);
    expect(r.grid.marginTop).toBeCloseTo(19.99, 1);
    expect(r.grid.marginLeft).toBeCloseTo(8.48, 1);
  });

  it("applies a real table indent", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 567, cols: [tw(100)], rows: [tw(30)], tblPr: '<w:tblInd w:w="567" w:type="dxa"/>' }), { width: 100, height: 30 }));
    expect(r.grid.marginLeft).toBeCloseTo(20, 1);
  });

  it("treats Word rounding gaps as zero", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(69.99), tw(69.99), tw(69.99)], rows: [tw(29.96), tw(29.96)] }), { width: 70, height: 30 }));
    expect(r.grid.gapX).toBe(0);
    expect(r.grid.gapY).toBe(0);
  });

  it("ignores the border-compensation indent (TW-2148)", () => {
    const r = ok(parseDocumentXml(doc({ top: 1020, left: 924, cols: alternate(40.59, 5.01, 4), rows: alternate(25.4, 3.9, 9), tblPr: '<w:tblInd w:w="-15" w:type="dxa"/>' }), { width: 40.6, height: 25.4 }));
    expect(r.grid.columns).toBe(4);
    expect(r.grid.rows).toBe(9);
    expect(r.grid.marginLeft).toBeCloseTo(16.3, 1);
    expect(r.grid.gapY).toBeCloseTo(3.9, 1);
  });

  it("adds a leading spacer row to the top margin", () => {
    const r = ok(parseDocumentXml(doc({ top: 567, left: 0, cols: [tw(70)], rows: [tw(5), tw(30), tw(30)] }), { width: 70, height: 30 }));
    expect(r.grid.marginTop).toBeCloseTo(15, 1);
    expect(r.grid.rows).toBe(2);
  });

  it("centres a table marked center", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(100)], rows: [tw(30)], tblPr: '<w:jc w:val="center"/>' }), { width: 100, height: 30 }));
    expect(r.grid.marginLeft).toBeCloseTo(55, 1);
  });

  it("reports a document without a table", () => {
    expect(parseDocumentXml("<w:body></w:body>", { width: 10, height: 10 })).toHaveProperty("error");
  });

  it("reports when no column matches the label", () => {
    expect(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(50)], rows: [tw(30)] }), { width: 70, height: 30 })).toHaveProperty("error");
  });

  it("adds no notes and keeps the label for an exact match", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(70)], rows: [tw(30)] }), { width: 70, height: 30 }));
    expect(r.notes).toEqual([]);
    expect(r.label).toEqual({ width: 70, height: 30 });
  });
});

describe("parseDocumentXml with Word cells near the label size", () => {
  it("centres the label in a slightly larger cell (TW-2048)", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 567, cols: Array(6).fill(tw(33)), rows: Array(8).fill(tw(32)) }), { width: 32, height: 32 }));
    expect(r.grid.columns).toBe(6);
    expect(r.grid.rows).toBe(8);
    expect(r.grid.marginLeft).toBeCloseTo(10.5, 1);
    expect(r.grid.gapX).toBeCloseTo(1, 1);
    expect(r.grid.gapY).toBe(0);
    expect(r.label).toEqual({ width: 32, height: 32 });
    expect(r.notes.join(" ")).toMatch(/Etiket genişliği: Word hücresi 33\.00 mm, etiket 32 mm/);
  });

  it("keeps spacer rows in the pitch (TW-2030)", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 0, cols: Array(5).fill(tw(40.5)), rows: alternate(44.49, 3, 6) }), { width: 38, height: 44 }));
    expect(r.grid.rows).toBe(6);
    expect(r.grid.gapY).toBeCloseTo(3.49, 1);
    expect(r.grid.marginTop).toBeCloseTo(0.245, 1);
    expect(r.grid.gapX).toBeCloseTo(2.5, 1);
  });

  it("packs labels edge to edge around the Word block when cells are smaller (TW-3177)", () => {
    const r = ok(parseDocumentXml(doc({ top: tw(12.25), left: 0, cols: [tw(78)], rows: Array(5).fill(tw(54.49)) }), { width: 78, height: 58.4 }));
    expect(r.grid.rows).toBe(5);
    expect(r.grid.gapY).toBe(0);
    expect(r.grid.marginTop).toBeCloseTo(12.25 + (5 * 54.49) / 2 - (5 * 58.4) / 2, 1);
    expect(r.notes.join(" ")).toMatch(/bitişik/);
  });

  it("uses the Word size when the nominal labels cannot fit the sheet (TW-2054)", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 0, cols: Array(6).fill(tw(35)), rows: Array(9).fill(tw(32.97)) }), { width: 35, height: 33.6 }));
    expect(r.grid.rows).toBe(9);
    expect(r.label.height).toBeCloseTo(32.97, 1);
    expect(r.label.width).toBe(35);
    expect(r.notes.join(" ")).toMatch(/sığmıyor/);
  });

  it("still refuses cells far from the label size", () => {
    expect(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(60)], rows: [tw(30)] }), { width: 50, height: 30 })).toHaveProperty("error");
  });

  it("still refuses an irregular spacing", () => {
    const rows = [14.25, 14.25, 27.01, 14.25, 14.25].map(tw);
    expect(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(37)], rows }), { width: 37, height: 14.25 })).toHaveProperty("error");
  });

  it("shrinks Word-sized labels that overflow the sheet by a hair (TW-2059)", () => {
    const r = ok(parseDocumentXml(doc({ top: 0, left: 0, cols: [tw(42)], rows: Array(5).fill(tw(59.41)) }), { width: 42, height: 59.69 }));
    expect(r.grid.marginTop + 5 * r.label.height).toBeLessThanOrEqual(297.0001);
    expect(r.label.height).toBeCloseTo(59.4, 2);
  });

  it("moves an exactly matched grid back onto the sheet (TW-2544)", () => {
    const r = ok(parseDocumentXml(doc({ top: tw(0.5), left: 0, cols: [tw(35)], rows: Array(24).fill(tw(12.36)) }), { width: 35, height: 12.4355 }));
    expect(r.grid.marginTop + 24 * r.label.height).toBeLessThanOrEqual(297.0001);
    expect(r.notes.join(" ")).toMatch(/sayfaya sığ/);
  });
});

