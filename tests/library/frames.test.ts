import { describe, expect, it } from "vitest";
import { FRAMES, frameOps } from "../../src/library/frames";

const opts = { strokeMm: 0.5, insetMm: 1, color: "#000000" };
const rect = { width: 50, height: 30, shape: "rect" as const };

describe("frameOps", () => {
  it("offers the six frames", () => expect(FRAMES.map((f) => f.id)).toEqual(["single", "double", "dashed", "rounded", "corner-ornament", "shape"]));

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
