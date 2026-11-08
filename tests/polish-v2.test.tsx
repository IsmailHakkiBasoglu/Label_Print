// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { newProject, type GridZone, type TextElement } from "../src/core/document";
import { createMemoryImageStore, sha256Hex } from "../src/core/imageStore";
import { applyListFill } from "../src/core/listFill";
import { exportProject, importProject } from "../src/core/projectFile";
import { ORNAMENTS } from "../src/library/ornaments/frames.data";
import { designTouchesBand, layoutProject } from "../src/render/layout";
import { LibraryPanel } from "../src/ui/LibraryPanel";
import { SheetView } from "../src/ui/SheetView";
import { activeDesign, createStore } from "../src/ui/store";
import { deps, memoryStorage, tmpl } from "./ui/helpers/deps";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const store = () => createStore(tmpl("TW-2021"), memoryStorage());
const grid = (s: ReturnType<typeof store>, page = 0) => s.getState().project.pages[page].zones[0] as GridZone;
const label = { width: 63.5, height: 38.1, shape: "rect" as const };
const options = { strokeMm: 0.4, insetMm: 1, color: "#000000" };
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const meta = { name: "logo.png", mime: "image/png" as const, widthPx: 1, heightPx: 1 };

describe("süslü çerçeve ve içerik", () => {
  it("desen süs bandının içinde kurulur", () => {
    const s = store();
    s.addText();
    s.setFrame(ORNAMENTS[0].id, options);
    s.applyPattern("title-sub", label);
    expect(designTouchesBand(activeDesign(s.getState()), label)).toBe(false);
  });

  it("içeriği çerçevenin içine alır", () => {
    const s = store();
    s.addText();
    s.updateElement(activeDesign(s.getState()).elements[0].id, { x: 0, y: 0, width: 63.5, height: 38.1 });
    s.setFrame(ORNAMENTS[0].id, options);
    expect(designTouchesBand(activeDesign(s.getState()), label)).toBe(true);
    s.fitContentToFrame(label);
    expect(designTouchesBand(activeDesign(s.getState()), label)).toBe(false);
  });

  it("panel gerektiğinde düğme gösterir", () => {
    const s = store();
    s.addText();
    s.updateElement(activeDesign(s.getState()).elements[0].id, { x: 0, y: 0 });
    s.setFrame(ORNAMENTS[0].id, options);
    render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Çerçeve" }));
    fireEvent.click(screen.getByRole("button", { name: "İçeriği çerçevenin içine al" }));
    expect(screen.queryByRole("button", { name: "İçeriği çerçevenin içine al" })).toBeNull();
  });
});

describe("yerleşim hızı", () => {
  const p = () => {
    const project = newProject(tmpl("TW-2021"));
    project.designs.d1.elements = [{ kind: "text", id: "t", x: 2, y: 2, width: 30, height: 10, text: "Ortak", fontId: "sans", sizePt: 12, align: "left", color: "#000000" }];
    project.pages.push(structuredClone({ ...project.pages[0] }));
    return project;
  };

  it("yalnız istenen sayfayı yerleştirir", () => {
    const result = layoutProject(p(), deps, { guides: true, onlyPage: 1 });
    expect(result.pages).toHaveLength(1);
  });

  it("aynı metni sonraki yerleştirmede yeniden sığdırmaz", () => {
    const measure = vi.fn((text: string, _f: string, size: number) => text.length * size * 0.1);
    const tools = { measure, unsupported: () => [] };
    const local = { ...deps, tools };
    layoutProject(p(), local, { guides: false });
    measure.mockClear();
    layoutProject(p(), local, { guides: false });
    const fitCalls = measure.mock.calls.length;
    const perLine = 21 * 2;
    expect(fitCalls).toBeLessThanOrEqual(perLine);
  });
});

describe("şablon değişimi ve seçim", () => {
  it("hepsi seçiliyse yeni şablonda da hepsi seçilir", () => {
    const s = store();
    s.setTemplate(tmpl("TW-2130"), 21);
    expect(grid(s).cells.used).toHaveLength(48);
  });

  it("kısmi seçimi korur, sığmayanı atar", () => {
    const s = store();
    s.setCells([5, 6, 20]);
    s.setTemplate(tmpl("TW-2014"), 21);
    expect(grid(s).cells.used).toEqual([5, 6]);
  });

  it("kullanıcı seçimiyle yeni şablona geçişte kapasiteyi panel verir", () => {
    const s = store();
    s.setCells([1]);
    render(<LibraryPanel store={s} deps={deps} templates={[tmpl("TW-2021"), tmpl("TW-2130")]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByText("TW-2130"));
    expect(grid(s).cells.used).toEqual([1]);
  });
});

describe("boş alana tıklama", () => {
  it("ortak moda döner", () => {
    const s = store();
    const { container } = render(<SheetView store={s} deps={deps} />);
    fireEvent.click(container.querySelectorAll(".cell")[2]);
    expect(s.getState().scope.kind).toBe("cell");
    fireEvent.click(container.querySelector(".sheet-bg")!);
    expect(s.getState().scope.kind).toBe("all");
  });
});

describe("ayrılmış hücre ve yeni kimlikler", () => {
  it("ortak desenden sonra ortağa dönünce yazı korunur", () => {
    const s = store();
    s.addText();
    const id = activeDesign(s.getState()).elements[0].id;
    s.setCellValue(3, id, "Mısır");
    s.detachCell(3);
    s.applyPattern("title", { width: 60, height: 30 });
    s.reattachCell(3);
    const shared = s.getState().project.designs.d1.elements[0].id;
    expect(grid(s).content[3].values).toEqual({ [shared]: "Mısır" });
  });

  it("liste ayrılmış hücrenin kendi öğesine yazar", () => {
    const project = newProject(tmpl("TW-2021"));
    const text: TextElement = { kind: "text", id: "ortak", x: 0, y: 0, width: 9, height: 9, text: "x", fontId: "sans", sizePt: 9, align: "left", color: "#000000" };
    project.designs.d1.elements = [text];
    project.designs.ayri = { elements: [{ ...text, id: "kendi" }] };
    const zone = project.pages[0].zones[0] as GridZone;
    zone.content[0] = { values: {}, designId: "ayri" };
    const result = applyListFill(project, 0, ["A"], { cellCount: 21, newId: () => "n", label });
    expect((result.project.pages[0].zones[0] as GridZone).content[0].values).toEqual({ kendi: "A" });
  });
});

describe("liste önerisinin türü", () => {
  const colored = { id: "color:corn", category: "x", tags: ["mısır"], icon: { viewBox: [0, 0, 1, 1] as [number, number, number, number], paths: [{ d: "M0 0L1 1", fill: true, strokeWidth: 0, fillColor: "#ffcc00" }] } };
  const localDeps = { ...deps, colorSymbols: [colored] };

  it("yüklenen görselde renkli katalogdan önerir", () => {
    const s = store();
    s.addImage("abc", meta);
    render(<SheetView store={s} deps={localDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Listeden doldur" }));
    fireEvent.change(screen.getByLabelText("Liste (her satır bir etiket)"), { target: { value: "Mısır" } });
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(Object.values(grid(s).content[0].values)).toContain("color:corn");
  });
});

describe("artıklar", () => {
  it("ızgara bölgesi silinince ayrılmış tasarım gider", () => {
    const s = store();
    s.detachCell(1);
    const id = grid(s).content[1].designId!;
    s.removeZone(0);
    expect(s.getState().project.designs[id]).toBeUndefined();
  });

  it("kullanılmayan görsel dosyaya yazılmaz", async () => {
    const images = createMemoryImageStore();
    await images.put("abc", PNG);
    const project = newProject(tmpl("TW-2021"));
    project.images.abc = meta;
    const file = JSON.parse(await exportProject(project, { images, customSymbols: [] }));
    expect(file.images).toEqual({});
    expect(file.imageData).toEqual({});
  });
});

describe("dosyadan gelen görsel doğrulaması", () => {
  const fileWith = (id: string, data: string) => {
    const project: any = newProject(tmpl("TW-2021"));
    project.images[id] = meta;
    project.imageData = { [id]: data };
    return JSON.stringify(project);
  };
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

  it("doğru görseli alır", async () => {
    const id = await sha256Hex(PNG);
    const images = createMemoryImageStore();
    const r = await importProject(fileWith(id, b64(PNG)), { images, storage: memoryStorage() });
    expect(r.ok && r.warnings).toEqual([]);
    expect(await images.get(id)).toEqual(PNG);
  });

  it("özeti tutmayan baytı yazmaz ve uyarır", async () => {
    const images = createMemoryImageStore();
    const r = await importProject(fileWith("a".repeat(64), b64(PNG)), { images, storage: memoryStorage() });
    expect(r.ok && r.warnings.join()).toContain("logo.png");
    expect(await images.get("a".repeat(64))).toBeUndefined();
  });

  it("görsel olmayan baytı yazmaz", async () => {
    const bytes = new TextEncoder().encode("<script>");
    const id = await sha256Hex(bytes);
    const images = createMemoryImageStore();
    const r = await importProject(fileWith(id, b64(bytes)), { images, storage: memoryStorage() });
    expect(r.ok && r.warnings.length).toBe(1);
    expect(await images.get(id)).toBeUndefined();
  });

  it("bozuk base64 dosyayı düşürmez", async () => {
    const r = await importProject(fileWith("b".repeat(64), "%%%"), { images: createMemoryImageStore(), storage: memoryStorage() });
    expect(r.ok && r.warnings.length).toBe(1);
  });
});
