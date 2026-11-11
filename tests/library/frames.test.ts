import { describe, expect, it } from "vitest";
import { FRAMES, frameLayout, frameOps } from "../../src/library/frames";

const opts = { strokeMm: 0.5, insetMm: 1, color: "#000000" };
const rect = { width: 50, height: 30, shape: "rect" as const };

describe("frameOps", () => {
  it("offers the six frames", () => expect(FRAMES.map((f) => f.id)).toEqual(["single", "double", "dashed", "rounded", "corner-ornament", "shape", "band"]));

  it("draws single at the inset", () => expect(frameOps("single", rect, opts)[0].d).toBe("M1 1H49V29H1Z"));

  it("redraws instead of stretching on a larger label", () => {
    const [op] = frameOps("single", { width: 100, height: 60, shape: "rect" }, opts);
    expect(op.d).toBe("M1 1H99V59H1Z");
    expect(op.stroke?.widthMm).toBe(0.5);
    expect(op.scale).toBe(1);
  });

  it("draws double as two outlines", () => expect(frameOps("double", rect, opts)).toHaveLength(2));
  it("dashes the dashed frame", () => expect(frameOps("dashed", rect, opts)[0].stroke?.dash).toBeDefined());
  it("rounds the rounded frame", () => expect(frameOps("rounded", rect, opts)[0].d).toContain("A"));

  it("closes an ellipse for shape", () => {
    expect(frameOps("shape", rect, opts)[0].d).toMatch(/A.*Z$/);
  });

  it("follows a circular label", () => {
    expect(frameOps("single", { width: 30, height: 30, shape: "circle" }, opts)[0].d).toContain("A14 14");
  });
});

describe("renk bandı", () => {
  const colors = { strokeMm: 0.4, insetMm: 1, color: "#0F6E56", accent: "#EF9F27" };
  const nums = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

  it("dikdörtgende üst %26'yı kaplar, altında vurgu renginde ayraç", () => {
    const [band, divider] = frameOps("band", { width: 63.5, height: 38.1, shape: "rect" }, colors);
    const bottom = 1 + 0.26 * 36.1;
    expect(band.fill).toBe("#0F6E56");
    expect(band.d).toBe(`M1 1H62.5V${Number(bottom.toFixed(4))}H1Z`);
    expect(divider.fill).toBe("#EF9F27");
    const [x, y, , , , w] = [nums(divider.d)[0], nums(divider.d)[1], 0, 0, 0, nums(divider.d)[2] - nums(divider.d)[0]];
    expect(w).toBeCloseTo(0.3 * 63.5, 3);
    expect(x).toBeCloseTo((63.5 - 0.3 * 63.5) / 2, 3);
    expect(y).toBeCloseTo(bottom + 0.6, 3);
  });

  it("yuvarlak köşede üst köşeler yuvarlak", () => {
    const [band] = frameOps("band", { width: 63.5, height: 38.1, shape: "rounded", cornerRadius: 3 }, colors);
    expect(band.fill).toBe("#0F6E56");
    expect(band.d).toMatch(/^M3 1H60.5A2 2 0 0 1 62.5 3V/);
  });

  for (const label of [{ width: 40, height: 40, shape: "circle" as const }, { width: 60, height: 40, shape: "oval" as const }]) {
    it(`${label.shape} etikette elipsin üst kesiti, kiriş yatay`, () => {
      const d = frameOps("band", label, colors)[0].d;
      expect(d).toMatch(/^M[\d.]+ [\d.]+A[\d.]+ [\d.]+ 0 0 1 [\d.]+ [\d.]+Z$/);
      const n = nums(d);
      const [x0, y0, x1, y1] = [n[0], n[1], n[n.length - 2], n[n.length - 1]];
      expect(y0).toBe(y1);
      expect(y0).toBeCloseTo(1 + 0.26 * (label.height - 2), 3);
      const [a, b, cx, cy] = [label.width / 2 - 1, label.height / 2 - 1, label.width / 2, label.height / 2];
      for (const x of [x0, x1]) expect(((x - cx) / a) ** 2 + ((y0 - cy) / b) ** 2).toBeCloseTo(1, 3);
    });
  }

  it("küçük etikette ince çizgiye düşer ve uyarır", () => {
    const layout = frameLayout("band", { width: 20, height: 10, shape: "rect" }, colors);
    expect(layout.fellBack).toBe(true);
    expect(layout.ops).toHaveLength(1);
    expect(layout.ops[0].fill).toBeUndefined();
    expect(layout.ops[0].stroke?.color).toBe("#0F6E56");
  });

  it("içerik için kenar payı ayırmaz", () => expect(frameLayout("band", { width: 63.5, height: 38.1, shape: "rect" }, colors).bandMm).toBe(0));
});
