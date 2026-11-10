import { describe, expect, it } from "vitest";
import { resolveCellDesign } from "../../src/core/cells";
import type { CellEntry, CodeElement, GridZone, LabelDesign, SymbolElement, TextElement } from "../../src/core/document";

const textEl: TextElement = { kind: "text", id: "t", x: 0, y: 0, width: 10, height: 5, text: "Ortak", fontId: "sans", sizePt: 12, align: "left", color: "#000000" };
const symbolEl: SymbolElement = { kind: "symbol", id: "s", x: 0, y: 5, width: 5, height: 5, symbolId: "corn", color: "#000000" };
const designs: Record<string, LabelDesign> = {
  d1: { frameId: "single", elements: [textEl, symbolEl] },
  ayri: { elements: [{ ...textEl, text: "Ayrı" }] },
};
const zone = (content: Record<number, CellEntry>): GridZone => ({ kind: "grid", templateId: "T", cells: { used: [0, 1] }, designId: "d1", content });
const resolve = (content: Record<number, CellEntry>, cell = 1) => resolveCellDesign(zone(content), cell, designs)!;
const textOf = (d: LabelDesign) => (d.elements.find((e) => e.kind === "text") as TextElement).text;

describe("resolveCellDesign", () => {
  it("yazı değerini uygular", () => expect(textOf(resolve({ 1: { values: { t: "Mısır" } } }))).toBe("Mısır"));
  it("görsel değerini uygular", () => expect((resolve({ 1: { values: { s: "wheat" } } }).elements[1] as SymbolElement).symbolId).toBe("wheat"));
  it("değer yoksa ortak içeriği basar", () => expect(textOf(resolve({}))).toBe("Ortak"));
  it("boş değer öğeyi basmaz", () => expect(resolve({ 1: { values: { t: "" } } }).elements.map((e) => e.id)).toEqual(["s"]));
  it("silinmiş öğenin değerini yok sayar", () => expect(resolve({ 1: { values: { yok: "x" } } }).elements.map((e) => e.id)).toEqual(["t", "s"]));
  it("ortak tasarımın çerçevesini korur", () => expect(resolve({ 1: { values: { t: "Mısır" } } }).frameId).toBe("single"));
  it("ayrılmış hücrenin tasarımını kullanır", () => expect(textOf(resolve({ 1: { values: {}, designId: "ayri" } }))).toBe("Ayrı"));
  it("ayrılmış hücreye de değer uygular", () => expect(textOf(resolve({ 1: { values: { t: "Nohut" }, designId: "ayri" } }))).toBe("Nohut"));
  it("ortak tasarımı değiştirmez", () => {
    resolve({ 1: { values: { t: "Mısır" } } });
    expect(textEl.text).toBe("Ortak");
  });
  it("olmayan tasarımda undefined döner", () => expect(resolveCellDesign({ ...zone({}), designId: "yok" }, 0, designs)).toBeUndefined());
});

describe("kod öğesi hücre değeri", () => {
  const code: CodeElement = { kind: "code", id: "k", x: 0, y: 0, width: 10, height: 10, format: "qr", value: "Ortak", showText: false, color: "#000000" };
  const z: GridZone = { kind: "grid", templateId: "T", cells: { used: [0] }, designId: "c", content: {} };
  const ds: Record<string, LabelDesign> = { c: { elements: [code] } };
  it("hücre değeri kodun içeriğini değiştirir, boş değer gizler", () => {
    expect((resolveCellDesign({ ...z, content: { 0: { values: { k: "A1" } } } }, 0, ds)!.elements[0] as CodeElement).value).toBe("A1");
    expect(resolveCellDesign({ ...z, content: { 0: { values: { k: "" } } } }, 0, ds)!.elements).toEqual([]);
  });
});
