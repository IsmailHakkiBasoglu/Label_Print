import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { newProject, type CodeElement, type GridZone } from "../../src/core/document";
import { layoutDesign, layoutProject, rectsPath } from "../../src/render/layout";
import type { PathOp, TextOp } from "../../src/render/ops";
import { deps, tmpl } from "../ui/helpers/deps";
import { rasterOps } from "./helpers/rasterOps";

const LABEL = { width: 60, height: 40, shape: "rect" as const };
const code = (over: Partial<CodeElement> = {}): CodeElement => ({
  kind: "code", id: "k", x: 5, y: 5, width: 30, height: 20, format: "qr", value: "Mısır", showText: false, color: "#000000", ...over,
});
const ops = (el: CodeElement) => layoutDesign({ elements: [el] }, LABEL, deps);
const warningsFor = (el: CodeElement, cell?: string) => {
  const project = newProject(tmpl("TW-2021"));
  project.designs.d1.elements = [el];
  if (cell !== undefined) (project.pages[0].zones[0] as GridZone).content = { 2: { values: { [el.id]: cell } } };
  return layoutProject(project, deps, { guides: false }).warnings;
};
/** Bounding box of the path's rectangles in mm. */
function bounds(op: PathOp) {
  const rects = [...op.d.matchAll(/M(-?[\d.e-]+) (-?[\d.e-]+)h(-?[\d.e-]+)v(-?[\d.e-]+)/g)].map((m) => m.slice(1).map(Number));
  const xs = rects.flatMap(([x, , w]) => [x, x + w]).map((v) => op.x + v * op.scale);
  const ys = rects.flatMap(([, y, , h]) => [y, y + h]).map((v) => op.y + v * op.scale);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe("rectsPath", () => {
  it("bitişik çubuklar tek dikdörtgen olur", () => {
    const d = rectsPath([[true, true, false, true]], { w: 1, h: 2 });
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.startsWith("M0 0h2v2")).toBe(true);
  });
});

describe("kod çizimi", () => {
  it("QR kutuya sessiz bölgeyle kare sığar ve ortalanır", () => {
    const [op, ...rest] = ops(code()) as PathOp[];
    expect(rest).toEqual([]);
    expect(op.fill).toBe("#000000");
    const b = bounds(op);
    expect(b.right - b.left).toBeCloseTo(b.bottom - b.top, 3);
    expect(b.bottom - b.top).toBeLessThan(20);
    expect((b.left + b.right) / 2).toBeCloseTo(5 + 15, 3);
    expect(b.top).toBeGreaterThan(5);
  });

  it("çizilen QR geri okunur", () => {
    const value = "Şeker ığdır https://ornek.com";
    const img = rasterOps(ops(code({ value, width: 40, height: 30 })), LABEL, 10);
    expect(jsQR(img.data, img.width, img.height)?.data).toBe(value);
  });

  it("1B kod altına yazıyla çizilir", () => {
    const [bars, label] = ops(code({ format: "code128", value: "AB-12", showText: true, width: 50, height: 20 })) as [PathOp, TextOp];
    expect(label).toMatchObject({ kind: "text", text: "AB-12", font: "sans" });
    expect(label.y).toBeGreaterThan(bounds(bars).bottom);
    expect(label.y).toBeLessThanOrEqual(25);
    expect(ops(code({ format: "code128", value: "AB-12", showText: false }))).toHaveLength(1);
  });

  it("1B kodda çubuklar kutunun tam yüksekliğini kullanır, sessiz bölge iki yanda kalır", () => {
    const [bars] = ops(code({ format: "ean13", value: "5901234123457", width: 50, height: 20 })) as PathOp[];
    const b = bounds(bars);
    const module = 50 / (95 + 22);
    expect(b.top).toBeCloseTo(5);
    expect(b.bottom).toBeCloseTo(25);
    expect(b.left).toBeCloseTo(5 + 11 * module);
    expect(b.right).toBeCloseTo(55 - 11 * module);
  });

  it("boş kod hiçbir şey çizmez", () => expect(ops(code({ value: "" }))).toEqual([]));
});

describe("kod uyarıları", () => {
  it("hatalı kod basılmaz, uyarı verir", () => {
    const el = code({ format: "ean13", value: "5901234123458" });
    expect(ops(el)).toEqual([]);
    expect(warningsFor(el).join()).toMatch(/kontrol hanesi yanlış/);
  });
  it("hücre değerindeki hata etiket numarasıyla gelir", () =>
    expect(warningsFor(code({ format: "ean13", value: "5901234123457" }), "123").join()).toMatch(/^3\. etiket: .*12 veya 13 hane/));
  it("küçük kodda okunmayabilir uyarısı", () => {
    expect(warningsFor(code({ format: "code128", value: "ABCDEFGHIJKLMNOP", width: 10, height: 5 })).join()).toMatch(/okunmayabilir/);
    expect(warningsFor(code({ value: "x".repeat(300), width: 8, height: 8 })).join()).toMatch(/okunmayabilir/);
    expect(warningsFor(code({ width: 30, height: 30 }))).toEqual([]);
  });
  it("açık renkte uyarır", () => {
    expect(warningsFor(code({ color: "#dddddd" })).join()).toMatch(/çok açık/);
    expect(warningsFor(code({ color: "#1a4d8f" }))).toEqual([]);
  });
});

it("kodlu etiketin PDF'i üretilir", async () => {
  const { renderPdf } = await import("../../src/render/pdf");
  const project = newProject(tmpl("TW-2021"));
  project.designs.d1.elements = [code(), code({ id: "b", format: "ean13", value: "400638133393", showText: true, y: 26, height: 10 })];
  const result = await renderPdf(project, deps, { guides: false });
  expect(result.ok).toBe(true);
});
