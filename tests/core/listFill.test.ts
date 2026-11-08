import { describe, expect, it } from "vitest";
import { newProject, type GridZone, type LabelProject, type SymbolElement, type TextElement } from "../../src/core/document";
import { applyListFill, parseLines, previewListFill } from "../../src/core/listFill";
import type { Template } from "../../src/core/templates";

const template: Template = {
  id: "T", name: "T", sheet: { width: 210, height: 297 },
  grid: { columns: 1, rows: 5, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  label: { width: 50, height: 30, shape: "rect" }, source: "custom", status: "verified",
};
const textEl: TextElement = { kind: "text", id: "t", x: 0, y: 0, width: 40, height: 10, text: "Ad", fontId: "sans", sizePt: 12, align: "left", color: "#000000" };
const symbolEl: SymbolElement = { kind: "symbol", id: "s", x: 0, y: 10, width: 10, height: 10, symbolId: "corn", color: "#000000" };

function project(elements: (TextElement | SymbolElement)[] = [textEl, symbolEl], used?: number[]): LabelProject {
  const p = newProject(template);
  p.designs.d1.elements = elements;
  if (used) (p.pages[0].zones[0] as GridZone).cells.used = used;
  return p;
}
let n = 0;
const options = (over = {}) => ({ suggest: (line: string) => `sym-${line}`, cellCount: 5, newId: () => `yeni-${n++}`, label: template.label, ...over });
const grid = (p: LabelProject, page = 0) => p.pages[page].zones[0] as GridZone;

describe("parseLines", () => {
  it("Windows satır sonlarını ve boşlukları temizler", () => expect(parseLines("Mısır\r\n\r\n  Nohut  \n   \n")).toEqual(["Mısır", "Nohut"]));
  it("Türkçe harfleri korur", () => expect(parseLines("ŞEKER\nçay ığ")).toEqual(["ŞEKER", "çay ığ"]));
});

describe("applyListFill", () => {
  it("yalnız kullanılan hücreleri doldurur", () => {
    const { project: p, report } = applyListFill(project(undefined, [2, 3]), 0, ["A", "B"], options());
    expect(Object.keys(grid(p).content)).toEqual(["2", "3"]);
    expect(grid(p).content[2].values).toEqual({ t: "A", s: "sym-A" });
    expect(report).toMatchObject({ filled: 2, pagesAdded: 0, unusedCells: 0 });
  });

  it("taşan liste için tam kullanılabilir yeni sayfa açar", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `L${i}`);
    const { project: p, report } = applyListFill(project(), 0, lines, options());
    expect(report).toMatchObject({ filled: 8, pagesAdded: 1, unusedCells: 2 });
    expect(p.pages[1].fromList).toBe(true);
    expect(grid(p, 1).designId).toBe("d1");
    expect(grid(p, 1).cells.used).toEqual([0, 1, 2]);
    expect(grid(p, 1).content[2].values.t).toBe("L7");
  });

  it("sonraki sayfa tüm hücrelerle başlar, ilk sayfanın seçimi yalnız ilk sayfayı etkiler", () => {
    const lines = Array.from({ length: 6 }, (_, i) => `L${i}`);
    const { project: p } = applyListFill(project(undefined, [3, 4]), 0, lines, options());
    expect(grid(p, 1).cells.used).toEqual([0, 1, 2, 3]);
  });

  it("kısa listede fazla hücreleri kullanım dışı bırakır", () => {
    const { project: p, report } = applyListFill(project(), 0, ["A", "B", "C"], options());
    expect(grid(p).cells.used).toEqual([0, 1, 2]);
    expect(report.unusedCells).toBe(2);
  });

  it("eşleşmeyen satırın görselini boş bırakır ve sayar", () => {
    const { project: p, report } = applyListFill(project(), 0, ["A"], options({ suggest: () => null }));
    expect(grid(p).content[0].values.s).toBe("");
    expect(report.noSymbol).toBe(1);
  });

  it("öneri kapalıysa görsele dokunmaz", () => {
    const { project: p, report } = applyListFill(project(), 0, ["A"], options({ suggest: undefined }));
    expect(grid(p).content[0].values).toEqual({ t: "A" });
    expect(report.noSymbol).toBe(0);
  });

  it("tasarımda yazı yoksa merkeze yazı öğesi ekler", () => {
    const { project: p } = applyListFill(project([symbolEl]), 0, ["A"], options());
    const added = p.designs.d1.elements.find((e) => e.kind === "text") as TextElement;
    expect(added.x + added.width / 2).toBeCloseTo(25);
    expect(grid(p).content[0].values[added.id]).toBe("A");
  });

  it("tasarımda görsel yoksa suggest çağrılmaz", () => {
    let calls = 0;
    applyListFill(project([textEl]), 0, ["A"], options({ suggest: () => (calls++, "x") }));
    expect(calls).toBe(0);
  });

  it("ikinci doldurma eski liste sayfalarını kaldırır, elle eklenen sayfaya dokunmaz", () => {
    const first = applyListFill(project(), 0, Array.from({ length: 8 }, (_, i) => `L${i}`), options()).project;
    first.pages.push({ sheet: first.pages[0].sheet, zones: [{ ...grid(first), content: { 0: { values: { t: "Elle" } } } }] });
    const { project: p } = applyListFill(first, 0, ["A"], options());
    expect(p.pages).toHaveLength(2);
    expect(grid(p, 1).content[0].values.t).toBe("Elle");
  });

  it("ayrılmış hücrenin tasarımını bozmaz", () => {
    const base = project();
    base.designs.ayri = { elements: [textEl] };
    grid(base).content[0] = { values: {}, designId: "ayri" };
    const { project: p } = applyListFill(base, 0, ["A"], options());
    expect(grid(p).content[0]).toEqual({ values: { t: "A" }, designId: "ayri" });
  });

  it("girdi projesini değiştirmez; önizleme aynı raporu verir", () => {
    const base = project();
    const copy = JSON.stringify(base);
    const lines = ["A", "B"];
    const { report } = applyListFill(base, 0, lines, options());
    expect(JSON.stringify(base)).toBe(copy);
    expect(previewListFill(base, 0, lines, options())).toEqual(report);
  });
});
