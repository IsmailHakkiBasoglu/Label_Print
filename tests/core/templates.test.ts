import { describe, expect, it } from "vitest";
import { normalizeSheet, validateTemplate, type Template } from "../../src/core/templates";

const base: Template = {
  id: "t",
  name: "t",
  sheet: { width: 210, height: 297 },
  grid: { columns: 3, rows: 4, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  label: { width: 70, height: 74.25, shape: "rect" },
  source: "custom",
  status: "verified",
};

describe("validateTemplate", () => {
  it("accepts a grid that fills the sheet exactly", () => expect(validateTemplate(base)).toEqual([]));

  it("rejects a grid that overflows the width", () => {
    const t = { ...base, grid: { ...base.grid, marginLeft: 1 } };
    expect(validateTemplate(t).join()).toContain("genişli");
  });

  it("rejects a grid that overflows the height", () => {
    const t = { ...base, grid: { ...base.grid, marginTop: 1 } };
    expect(validateTemplate(t).join()).toContain("yüksekli");
  });

  it("rejects non-positive label size", () => {
    expect(validateTemplate({ ...base, label: { ...base.label, width: 0 } })).not.toEqual([]);
  });

  it("rejects a fractional column count", () => {
    expect(validateTemplate({ ...base, grid: { ...base.grid, columns: 1.5 } })).not.toEqual([]);
  });

  it("rejects negative gaps", () => {
    expect(validateTemplate({ ...base, grid: { ...base.grid, gapX: -1 } })).not.toEqual([]);
  });
});

describe("normalizeSheet", () => {
  it("snaps near-A4 to A4", () => expect(normalizeSheet(209.97, 297.03)).toEqual({ width: 210, height: 297 }));
  it("keeps other sizes", () => expect(normalizeSheet(100, 150)).toEqual({ width: 100, height: 150 }));
});
