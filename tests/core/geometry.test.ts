import { describe, expect, it } from "vitest";
import { labelRects, mmToPt } from "../../src/core/geometry";

describe("mmToPt", () => {
  it("converts one inch exactly", () => expect(mmToPt(25.4)).toBe(72));
  it("converts A4 width", () => expect(mmToPt(210)).toBeCloseTo(595.27559, 5));
});

describe("labelRects", () => {
  const rects = labelRects({
    grid: { columns: 3, rows: 7, marginTop: 15.2, marginLeft: 6.8, gapX: 3, gapY: 0 },
    label: { width: 63.5, height: 38.1 },
  });

  it("creates one rect per label", () => expect(rects).toHaveLength(21));

  it("advances left to right", () => {
    expect(rects[1].x).toBeCloseTo(73.3, 6);
    expect(rects[1].y).toBeCloseTo(15.2, 6);
  });

  it("places the last label from the grid pitch", () => {
    expect(rects[20].x).toBeCloseTo(139.8, 6);
    expect(rects[20].y).toBeCloseTo(243.8, 6);
    expect(rects[20].width).toBe(63.5);
  });
});
