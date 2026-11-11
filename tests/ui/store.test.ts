import { describe, expect, it } from "vitest";
import type { CodeElement, GridZone, TextElement } from "../../src/core/document";
import { activeDesign, createStore, editingDesign, LEGACY_PROJECT_KEY, PROJECT_KEY } from "../../src/ui/store";
import { memoryStorage, tmpl } from "./helpers/deps";

const make = (storage = memoryStorage()) => createStore(tmpl("TW-2021"), storage);

const gridAt = (s: ReturnType<typeof make>, page = 0) => s.getState().project.pages[page].zones[0] as GridZone;

describe("hücre işlemleri", () => {
  function withText() {
    const s = make();
    s.addText();
    return { s, id: activeDesign(s.getState()).elements[0].id };
  }

  it("hücre değeri ortak tasarımı değiştirmez", () => {
    const { s, id } = withText();
    s.setCellValue(3, id, "Mısır");
    expect(gridAt(s).content[3].values[id]).toBe("Mısır");
    expect(activeDesign(s.getState()).elements[0]).toMatchObject({ text: "Yazı" });
  });

  it("clearCellValue boş kalan kaydı siler", () => {
    const { s, id } = withText();
    s.setCellValue(3, id, "Mısır");
    s.clearCellValue(3, id);
    expect(gridAt(s).content[3]).toBeUndefined();
  });

  it("detachCell değerleri tasarıma yazar, designId atar ve değerleri korur", () => {
    const { s, id } = withText();
    s.setCellValue(3, id, "Mısır");
    s.detachCell(3);
    const entry = gridAt(s).content[3];
    expect(entry.designId).toBeDefined();
    expect(s.getState().project.designs[entry.designId!].elements[0]).toMatchObject({ id, text: "Mısır" });
    expect(entry.values[id]).toBe("Mısır");
  });

  it("reattachCell tasarımı siler, uyuşan değerleri korur", () => {
    const { s, id } = withText();
    s.setCellValue(3, id, "Mısır");
    s.detachCell(3);
    const designId = gridAt(s).content[3].designId!;
    s.reattachCell(3);
    expect(s.getState().project.designs[designId]).toBeUndefined();
    expect(gridAt(s).content[3]).toEqual({ values: { [id]: "Mısır" } });
  });

  it("ayrılmış hücrede updateElement yalnız kendi tasarımını değiştirir", () => {
    const { s, id } = withText();
    s.detachCell(3);
    s.setScope({ kind: "cell", cell: 3 });
    s.updateElement(id, { x: 9 });
    expect(activeDesign(s.getState()).elements[0].x).toBe(9);
    expect(s.getState().project.designs.d1.elements[0].x).toBe(2);
  });

  it("editingDesign seçili hücrenin çözülmüş içeriğini verir", () => {
    const { s, id } = withText();
    s.setCellValue(3, id, "Mısır");
    s.setScope({ kind: "cell", cell: 3 });
    expect(editingDesign(s.getState()).elements[0]).toMatchObject({ text: "Mısır" });
    s.setScope({ kind: "all" });
    expect(editingDesign(s.getState()).elements[0]).toMatchObject({ text: "Yazı" });
  });

  it("desen uygulanınca değerler aynı türdeki yeni öğelere sırayla taşınır", () => {
    const { s, id } = withText();
    s.setCellValue(3, id, "Mısır");
    s.applyPattern("title", { width: 60, height: 30 });
    const newId = s.getState().project.designs.d1.elements.find((e) => e.kind === "text")!.id;
    expect(gridAt(s).content[3].values).toEqual({ [newId]: "Mısır" });
  });

  it("küçülen şablon sığmayan içeriği ve ayrılmış tasarımları siler", () => {
    const { s, id } = withText();
    s.setCellValue(20, id, "Son");
    s.setCellValue(1, id, "Kalan");
    s.detachCell(20);
    const designId = gridAt(s).content[20].designId!;
    s.setTemplate(tmpl("TW-2001"));
    expect(Object.keys(gridAt(s).content)).toEqual([]);
    expect(s.getState().project.designs[designId]).toBeUndefined();
  });

  it("şablon değişimi sığan içeriği korur", () => {
    const { s, id } = withText();
    s.setCellValue(1, id, "Kalan");
    s.setTemplate(tmpl("TW-2130"));
    expect(gridAt(s).content[1].values[id]).toBe("Kalan");
  });

  it("şablon tüm sayfalara uygulanır", () => {
    const { s } = withText();
    s.addPage(21);
    s.setTemplate(tmpl("TW-2130"));
    expect(gridAt(s, 1).templateId).toBe("TW-2130");
    expect(gridAt(s, 0).templateId).toBe("TW-2130");
  });

  it("yeni sayfa ortak tasarımı paylaşır ve kendi içeriğiyle başlar", () => {
    const { s, id } = withText();
    s.setCellValue(0, id, "A");
    s.addPage(21);
    expect(s.getState().pageIndex).toBe(1);
    expect(gridAt(s, 1)).toMatchObject({ designId: "d1", content: {} });
    expect(gridAt(s, 1).cells.used).toHaveLength(21);
  });

  it("hücre işlemleri etkin sayfaya uygulanır", () => {
    const { s, id } = withText();
    s.addPage(21);
    s.setCellValue(2, id, "İkinci");
    expect(gridAt(s, 1).content[2]).toBeDefined();
    expect(gridAt(s, 0).content[2]).toBeUndefined();
  });

  it("son sayfa silinemez, silinince etkin sayfa geçerli kalır", () => {
    const { s } = withText();
    s.removePage(0);
    expect(s.getState().project.pages).toHaveLength(1);
    s.addPage(21);
    s.removePage(1);
    expect(s.getState().pageIndex).toBe(0);
  });

  it("geri alınca pageIndex son geçerli sayfaya çekilir", () => {
    const { s } = withText();
    s.addPage(21);
    s.undo();
    expect(s.getState().project.pages).toHaveLength(1);
    expect(s.getState().pageIndex).toBe(0);
  });

  it("sayfa geçişi geri alma geçmişine girmez", () => {
    const { s } = withText();
    s.addPage(21);
    s.setPage(0);
    s.undo();
    expect(s.getState().project.pages).toHaveLength(1);
  });
});

describe("store", () => {
  it("adds a symbol and selects it", () => {
    const s = make();
    s.addSymbol("corn");
    const design = activeDesign(s.getState());
    expect(design.elements[0]).toMatchObject({ kind: "symbol", symbolId: "corn" });
    expect(s.getState().selectedElementId).toBe(design.elements[0].id);
  });

  it("gives added elements unique ids", () => {
    const s = make();
    s.addText();
    s.addText();
    const [a, b] = activeDesign(s.getState()).elements;
    expect(a.id).not.toBe(b.id);
  });

  it("undoes and redoes", () => {
    const s = make();
    s.addText();
    s.undo();
    expect(activeDesign(s.getState()).elements).toHaveLength(0);
    s.redo();
    expect(activeDesign(s.getState()).elements).toHaveLength(1);
  });

  it("keeps the design when the template changes and selects all cells", () => {
    const s = make();
    s.addText();
    s.setTemplate(tmpl("TW-2130"));
    const zone = s.getState().project.pages[0].zones[0];
    expect(zone.kind === "grid" && [zone.templateId, zone.cells.used.length]).toEqual(["TW-2130", 48]);
    expect(activeDesign(s.getState()).elements).toHaveLength(1);
  });

  it("keeps free zones when the template changes", () => {
    const s = make();
    s.addFreeZone({ x: 0, y: 280, width: 100, height: 10 });
    s.setTemplate(tmpl("TW-2130"));
    expect(s.getState().project.pages[0].zones.map((z) => z.kind)).toEqual(["grid", "free"]);
  });

  it("edits a free zone's own design when active", () => {
    const s = make();
    s.addFreeZone({ x: 0, y: 280, width: 100, height: 10 });
    s.setActive({ zone: 1 });
    s.addText();
    expect(s.getState().project.designs.d1.elements).toHaveLength(0);
    expect(activeDesign(s.getState()).elements).toHaveLength(1);
  });

  it("persists each change", () => {
    const storage = memoryStorage();
    make(storage).addText();
    expect(make(storage).getState().project.designs.d1.elements).toHaveLength(1);
  });

  it("eski anahtardaki projeyi açar, yeni anahtara yazar", () => {
    const old = JSON.stringify({
      version: 1,
      pages: [{ sheet: { width: 210, height: 297 }, zones: [{ kind: "grid", templateId: "TW-2021", cells: { used: [0] }, designIds: ["d1"] }] }],
      designs: { d1: { elements: [{ kind: "text", id: "t", x: 0, y: 0, width: 10, height: 10, text: "Eski", fontId: "sans", sizePt: 12, align: "left", color: "#000000" }] } },
      printOffset: { x: 0, y: 0 },
    });
    const storage = memoryStorage({ [LEGACY_PROJECT_KEY]: old });
    const s = make(storage);
    expect(activeDesign(s.getState()).elements[0]).toMatchObject({ text: "Eski" });
    s.addText();
    expect(storage.getItem(PROJECT_KEY)).toContain('"version": 2');
  });

  it("starts empty when saved data is corrupt", () => {
    const s = make(memoryStorage({ [PROJECT_KEY]: "{bozuk" }));
    expect(activeDesign(s.getState()).elements).toHaveLength(0);
  });

  it("survives storage failures", () => {
    const failing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => make(failing).addText()).not.toThrow();
  });
});

describe("kod öğesi", () => {
  const LABEL = { width: 63.5, height: 38.1 };
  function withCode() {
    const s = make();
    s.addText();
    s.addCode(LABEL);
    const code = activeDesign(s.getState()).elements.find((e): e is CodeElement => e.kind === "code")!;
    return { s, code };
  }

  it("addCode etiketin ortasına QR ekler ve seçer", () => {
    const { s, code } = withCode();
    const side = 38.1 * 0.6;
    expect(code).toMatchObject({ format: "qr", value: "Örnek", showText: true, color: "#000000" });
    expect(code.width).toBeCloseTo(side);
    expect(code.height).toBeCloseTo(side);
    expect(code.x).toBeCloseTo((63.5 - side) / 2);
    expect(code.y).toBeCloseTo((38.1 - side) / 2);
    expect(s.getState().selectedElementId).toBe(code.id);
    // The properties panel shows these numbers as typed: no floating-point tails.
    for (const n of [code.x, code.y, code.width, code.height]) expect(Number(n.toFixed(2))).toBe(n);
  });

  it("desen kod öğesini ve hücre değerini korur", () => {
    const { s, code } = withCode();
    s.setCellValue(0, code.id, "A1");
    expect(s.patternLoss("title", LABEL)).toBe(0);
    s.applyPattern("title", LABEL);
    expect(s.getState().project.designs.d1.elements.find((e) => e.id === code.id)).toMatchObject({ kind: "code", x: code.x });
    expect(gridAt(s).content[0].values[code.id]).toBe("A1");
  });

  it("hücre ayırınca kod değeri tasarıma geçer", () => {
    const { s, code } = withCode();
    s.setCellValue(0, code.id, "A1");
    s.detachCell(0);
    const own = s.getState().project.designs[gridAt(s).content[0].designId!];
    expect(own.elements.find((e) => e.id === code.id)).toMatchObject({ value: "A1" });
  });
});

describe("tema uygulama", () => {
  const LABEL = { width: 63.5, height: 38.1, shape: "rect" as const };
  const texts = (s: ReturnType<typeof make>) => activeDesign(s.getState()).elements.filter((e): e is TextElement => e.kind === "text");

  it("çerçeveyi ve yazı stillerini uygular", () => {
    const s = make();
    s.applyTheme("bahce-kirmizi", LABEL);
    const design = activeDesign(s.getState());
    expect(design.frameId).toBe("o-berry-vine");
    expect(design.frameOptions?.accent).toBe("#C0322B");
    expect(texts(s)[0]).toMatchObject({ fontId: "serif-bold", color: "#27500A" });
  });

  it("mevcut yazılar ve hücre değerleri korunur", () => {
    const s = make();
    s.addText();
    const id = activeDesign(s.getState()).elements[0].id;
    s.updateElement(id, { text: "Mercimek" });
    s.setCellValue(2, id, "Nohut");
    s.applyTheme("kir-pembe", LABEL);
    expect(texts(s)[0].text).toBe("Mercimek");
    expect(gridAt(s).content[2].values[texts(s)[0].id]).toBe("Nohut");
  });

  it("yazısız tasarıma örnek metin koyar, kodu korur", () => {
    const s = make();
    s.addCode(LABEL);
    const codeId = activeDesign(s.getState()).elements[0].id;
    s.applyTheme("kraft-kahve", LABEL);
    expect(activeDesign(s.getState()).elements.find((e) => e.id === codeId)?.kind).toBe("code");
    expect(texts(s).map((t) => t.text).every(Boolean)).toBe(true);
    expect(activeDesign(s.getState()).frameOptions?.background).toBe("#E2C79C");
  });

  it("görsel ve hücredeki görsel değeri korunur, kayıp sayılmaz", () => {
    const s = make();
    s.addSymbol("corn");
    const symbolId = activeDesign(s.getState()).elements[0].id;
    s.setCellValue(1, symbolId, "wheat");
    expect(s.themeLoss("bahce-kirmizi", LABEL)).toBe(0);
    s.applyTheme("bahce-kirmizi", LABEL);
    expect(activeDesign(s.getState()).elements.find((e) => e.id === symbolId)?.kind).toBe("symbol");
    expect(gridAt(s).content[1].values[symbolId]).toBe("wheat");
  });

  it("tek geri alma önceki hale döner", () => {
    const s = make();
    s.addText();
    const before = structuredClone(activeDesign(s.getState()));
    s.applyTheme("modern-yesil", LABEL);
    s.undo();
    expect(activeDesign(s.getState())).toEqual(before);
  });

  it("kilitli hücrede bir şey yapmaz", () => {
    const s = make();
    s.setScope({ kind: "cell", cell: 0 });
    s.applyTheme("bahce-kirmizi", LABEL);
    expect(s.getState().project.designs.d1.frameId).toBeUndefined();
  });

  it("bant temasından iki yazılı temaya geçerken grup adı kaybı sayılır", () => {
    const s = make();
    s.applyTheme("modern-yesil", LABEL);
    s.setCellValue(0, texts(s)[2].id, "BAKLİYAT");
    expect(s.themeLoss("bahce-kirmizi", LABEL)).toBe(1);
    expect(s.themeLoss("modern-bordo", LABEL)).toBe(0);
  });
});
