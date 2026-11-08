import { describe, expect, it } from "vitest";
import { ornamentLayout } from "../../src/library/ornaments/layout";
import { compose, rotate, scale, transformPath, translate } from "../../src/library/ornaments/transform";
import type { OrnamentFrame } from "../../src/library/ornaments/layout";

describe("transformPath", () => {
  it("ölçekler", () => expect(transformPath("M1 2L3 4Z", scale(2, 2))).toBe("M2 4L6 8Z"));
  it("döndürür ve eksi sıfır yazmaz", () => expect(transformPath("M0 0C1 0 1 1 0 1", rotate(90))).toMatch(/^M0 0C0 1 -1 1 -1 0$/));
  it("yay komutunu reddeder", () => expect(() => transformPath("M0 0A1 1 0 0 0 1 1", scale(1, 1))).toThrow());
  it("birleştirir: önce sağdaki uygulanır", () => expect(transformPath("M1 1", compose(translate(10, 0), scale(2, 2)))).toBe("M12 2"));
});

const part = (w: number, h: number) => ({ size: [w, h] as [number, number], d: [`M${w / 2} 0L${w} ${h}L0 ${h}Z`] });
const frame: OrnamentFrame = { id: "t", name: "t", category: "klasik", corner: part(10, 10), edge: part(10, 10), bandRatio: 0.15 };
const opts = { strokeMm: 0.4, insetMm: 1, color: "#123456" };
const points = (d: string) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const allPoints = (ops: { d: string }[]) => ops.flatMap((o) => points(o.d));
const rect = (width: number, height: number) => ({ width, height, shape: "rect" as const });
const side = (p: number[][]) => Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0]));
const tall = (p: number[][]) => Math.max(...p.map((q) => q[1])) - Math.min(...p.map((q) => q[1]));

describe("ornamentLayout dikdörtgen", () => {
  const result = ornamentLayout(frame, rect(63.5, 38.1), opts);

  it("bant kısa kenar oranındadır", () => expect(result.bandMm).toBeCloseTo(38.1 * 0.15, 4));
  it("bant 2 mm ile 12 mm arasında kalır", () => {
    expect(ornamentLayout(frame, rect(13, 13), opts).bandMm).toBe(2);
    expect(ornamentLayout(frame, rect(200, 200), opts).bandMm).toBe(12);
  });
  it("motif X ve Y'de aynı ölçeklenir", () => {
    const p = points(result.ops[0].d);
    expect(side(p)).toBeCloseTo(tall(p), 3);
  });
  it("motif rengi ayarı uygular", () => expect(result.ops[0].fill).toBe("#123456"));
  it("kenar motifi tam sayıda tekrar eder ve eşit aralıklıdır", () => {
    const step = result.bandMm;
    const inner = 63.5 - 2 - 2 * step;
    const top = result.ops.slice(4).filter((o) => points(o.d).every((q) => q[1] <= 1 + step + 0.001));
    expect(top).toHaveLength(Math.round(inner / step));
    const xs = top.map((o) => points(o.d)[0][0]).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    gaps.forEach((g) => expect(Math.abs(g - gaps[0])).toBeLessThanOrEqual(0.001));
  });
  it("dört köşe vardır", () => {
    const corners = result.ops.slice(0, 4).map((o) => [points(o.d)[0][0] < 63.5 / 2, points(o.d)[0][1] < 38.1 / 2].join());
    expect(new Set(corners).size).toBe(4);
  });
});

describe("uç ölçüler", () => {
  it.each([[200, 20], [20, 200], [12, 12], [99.1, 34]])("%d×%d etiketten taşmaz", (w, h) => {
    const r = ornamentLayout(frame, rect(w, h), opts);
    for (const [x, y] of allPoints(r.ops)) {
      expect(x).toBeGreaterThanOrEqual(1 - 0.01);
      expect(x).toBeLessThanOrEqual(w - 1 + 0.01);
      expect(y).toBeGreaterThanOrEqual(1 - 0.01);
      expect(y).toBeLessThanOrEqual(h - 1 + 0.01);
    }
  });
  it("kısa kenar 12 mm altındaysa düşer", () => {
    const r = ornamentLayout(frame, rect(10, 30), opts);
    expect(r).toMatchObject({ fellBack: true, bandMm: 0, ops: [] });
  });
  it("kenar için yer yoksa motif ölçeklenmez, kenar boş kalır", () => {
    const wide: OrnamentFrame = { ...frame, edge: part(200, 10) };
    const r = ornamentLayout(wide, rect(60, 40), opts);
    expect(r.ops).toHaveLength(4);
  });
  it("içe boşluk bandı küçültür, köşeler binmez", () => {
    const r = ornamentLayout(frame, rect(14, 14), { ...opts, insetMm: 5 });
    expect(r.fellBack).toBe(false);
    expect(r.bandMm).toBeLessThanOrEqual(2);
    expect(r.ops.length).toBeGreaterThanOrEqual(4);
  });
  it("içe boşluk aşırıysa düşer", () => expect(ornamentLayout(frame, rect(20, 20), { ...opts, insetMm: 9.5 }).fellBack).toBe(true));
});

describe("oval ve daire", () => {
  const oval = { width: 60, height: 40, shape: "oval" as const };
  const r = ornamentLayout(frame, oval, opts);
  const firsts = r.ops.map((o) => points(o.d)[0]);

  it("köşe kullanmaz, motifler kenar üzerindedir", () => {
    firsts.forEach(([x, y]) => expect(((x - 30) / 29) ** 2 + ((y - 20) / 19) ** 2).toBeCloseTo(1, 1));
  });
  it("yay boyunca eşit aralıklıdır", () => {
    const d = firsts.map((p, i) => Math.hypot(p[0] - firsts[(i + 1) % firsts.length][0], p[1] - firsts[(i + 1) % firsts.length][1]));
    const mean = d.reduce((a, b) => a + b) / d.length;
    d.forEach((x) => expect(Math.abs(x - mean) / mean).toBeLessThanOrEqual(0.02));
  });
  it("motifi gerçek ölçekte tutar", () => {
    const p = points(r.ops[0].d);
    const span = Math.hypot(p[1][0] - p[2][0], p[1][1] - p[2][1]);
    expect(span).toBeCloseTo(r.bandMm, 3);
  });
  it("daire de çalışır", () => expect(ornamentLayout(frame, { width: 40, height: 40, shape: "circle" }, opts).ops.length).toBeGreaterThan(3));
  it("küçük dairede düşer", () => expect(ornamentLayout(frame, { width: 10, height: 10, shape: "circle" }, opts).fellBack).toBe(true));
});
