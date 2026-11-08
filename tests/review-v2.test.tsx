// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryImageStore, ingestImage, jpegOrientation } from "../src/core/imageStore";
import { newProject, parseProject, type GridZone } from "../src/core/document";
import { applyListFill } from "../src/core/listFill";
import { importCustomSymbol, loadCustomSymbols, mergeCustomSymbols } from "../src/library/symbols/custom";
import { parseSvg, type VectorIcon } from "../src/library/symbols/svg";
import { layoutProject } from "../src/render/layout";
import { ErrorBoundary } from "../src/ui/ErrorBoundary";
import { LibraryPanel } from "../src/ui/LibraryPanel";
import { activeDesign, createStore } from "../src/ui/store";
import { Toolbar } from "../src/ui/Toolbar";
import { deps, memoryStorage, tmpl } from "./ui/helpers/deps";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const store = (storage = memoryStorage()) => createStore(tmpl("TW-2021"), storage);
const grid = (s: ReturnType<typeof store>) => s.getState().project.pages[0].zones[0] as GridZone;
const parse = (edit: (p: any) => void) => {
  const p: any = JSON.parse(JSON.stringify(newProject(tmpl("TW-2021"))));
  edit(p);
  return parseProject(JSON.stringify(p));
};
const text = { kind: "text", x: 0, y: 0, width: 5, height: 5, text: "a", fontId: "sans", sizePt: 12, align: "left", color: "#000000" };

describe("güvenilmeyen proje dosyası", () => {
  it.each([
    ["__proto__ tasarım", (p: any) => (p.pages[0].zones[0].designId = "__proto__")],
    ["constructor tasarım", (p: any) => (p.pages[0].zones[0].designId = "constructor")],
    ["olmayan tasarım", (p: any) => (p.pages[0].zones[0].designId = "yok")],
    ["hücrede olmayan tasarım", (p: any) => (p.pages[0].zones[0].content = { 0: { values: {}, designId: "constructor" } })],
    ["tehlikeli öğe kimliği", (p: any) => (p.designs.d1.elements = [{ ...text, id: "constructor" }])],
  ])("%s reddedilir", (_, edit) => expect(parse(edit).ok).toBe(false));

  it("upload:constructor geometriyi bozmaz, hata verir", () => {
    const p = newProject(tmpl("TW-2021"));
    p.designs.d1.elements = [{ kind: "symbol", id: "s", x: 0, y: 0, width: 5, height: 5, symbolId: "upload:constructor", color: "#000000" }];
    expect(layoutProject(p, deps, { guides: false }).errors.join()).toContain("görsel");
  });

  it("çizim hatasında yeniden başlatma sunar", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();
    const Broken = (): null => {
      throw new Error("x");
    };
    render(
      <ErrorBoundary onReset={onReset}>
        <Broken />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Boş projeyle devam et" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

describe("özel sembol doğrulaması", () => {
  const good = { id: "custom-1", category: "Benim", tags: ["x"], icon: { viewBox: [0, 0, 1, 1], paths: [{ d: "M0 0", fill: true, strokeWidth: 0 }] } };
  it.each([
    ["boş yol", { ...good, icon: { ...good.icon, paths: [null] } }],
    ["sayı etiket", { ...good, tags: [1] }],
    ["eksik kutu", { ...good, icon: { ...good.icon, viewBox: [] } }],
    ["kötü renk", { ...good, icon: { ...good.icon, paths: [{ ...good.icon.paths[0], fillColor: "red;" }] } }],
  ])("%s depoya girmez", (_, bad) => {
    const storage = memoryStorage();
    mergeCustomSymbols([bad], storage);
    expect(loadCustomSymbols(storage)).toEqual([]);
  });
  it("depoda bozuk kayıt okunmaz", () => {
    const storage = memoryStorage({ "labelprint.symbols.v1": JSON.stringify([{ ...good, tags: [1] }, good]) });
    expect(loadCustomSymbols(storage).map((s) => s.id)).toEqual(["custom-1"]);
  });
  it("geçerli kayıt girer", () => {
    const storage = memoryStorage();
    expect(mergeCustomSymbols([good], storage)).toBe(true);
    expect(loadCustomSymbols(storage)).toHaveLength(1);
  });
});

describe("kilitli hücre", () => {
  function locked(prepare?: (s: ReturnType<typeof store>) => void) {
    const s = store();
    s.addText();
    prepare?.(s);
    s.setScope({ kind: "cell", cell: 2 });
    return s;
  }
  it("çerçeveyi ortak tasarımda değiştirmez", () => {
    const s = locked();
    s.setFrame("single", { strokeMm: 1, insetMm: 1, color: "#000000" });
    expect(s.getState().project.designs.d1.frameId).toBeUndefined();
  });
  it("deseni ortak tasarıma uygulamaz", () => {
    const s = locked();
    const before = s.getState().project.designs.d1.elements[0].id;
    s.applyPattern("title", { width: 60, height: 30 });
    expect(s.getState().project.designs.d1.elements[0].id).toBe(before);
  });
  it("görsel yeri yoksa ortak tasarıma görsel eklemez", () => {
    const s = locked();
    expect(s.pickSymbol("corn")).toBe(false);
    expect(s.getState().project.designs.d1.elements).toHaveLength(1);
  });
  it("ayrılmış hücrede çerçeve değişir", () => {
    const s = locked((x) => x.detachCell(2));
    s.setFrame("single", { strokeMm: 1, insetMm: 1, color: "#000000" });
    expect(activeDesign(s.getState()).frameId).toBe("single");
    expect(s.getState().project.designs.d1.frameId).toBeUndefined();
  });
  it("panel nedenini söyler ve düğmeleri kapatır", () => {
    const s = locked();
    render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Çerçeve" }));
    expect(screen.getByText(/Bu hücreyi ayır/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Tek çizgi" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("desenin sildiği içerik", () => {
  function filled() {
    const s = store();
    s.addSymbol("corn");
    s.addText();
    const symbol = activeDesign(s.getState()).elements[0].id;
    s.setCellValue(0, symbol, "wheat");
    return { s };
  }
  it("kaybı önceden sayar", () => expect(filled().s.patternLoss("title", { width: 60, height: 30 })).toBe(1));
  it("simgeli desende kayıp yoktur", () => expect(filled().s.patternLoss("symbol-left", { width: 60, height: 30 })).toBe(0));
  it("kayıp varsa onay ister, reddedilince uygulamaz", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { s } = filled();
    const before = s.getState().project;
    render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desen" }));
    fireEvent.click(screen.getByRole("button", { name: "Tek başlık" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(s.getState().project).toBe(before);
  });
});

describe("yeniden doldurma", () => {
  const options = { suggest: undefined, cellCount: 5, newId: () => "n", label: { width: 50, height: 30 } };
  const template = { ...tmpl("TW-2021"), grid: { ...tmpl("TW-2021").grid, columns: 1, rows: 5 } };
  const start = () => {
    const p = newProject(template);
    p.designs.d1.elements = [{ ...(text as any), id: "t" }];
    return p;
  };
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `L${i}`);

  it("kısa listeden sonra uzun liste önceki seçimi kullanır", () => {
    const first = applyListFill(start(), 0, lines(2), options).project;
    expect((first.pages[0].zones[0] as GridZone).cells.used).toEqual([0, 1]);
    const { project, report } = applyListFill(first, 0, lines(4), options);
    expect((project.pages[0].zones[0] as GridZone).cells.used).toEqual([0, 1, 2, 3]);
    expect(report.pagesAdded).toBe(0);
  });

  it("elle seçim değişince eski seçimi unutur", () => {
    const s = store();
    s.addText();
    s.fillFromList(lines(2), { cellCount: 21, label: { width: 60, height: 30 } });
    s.setCells([0, 1, 2]);
    expect(grid(s).listBase).toBeUndefined();
  });

  it("hatalı listBase reddedilir", () => expect(parse((p) => (p.pages[0].zones[0].listBase = ["x"])).ok).toBe(false));
});

describe("döndürülmüş JPEG", () => {
  const exif = (o: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 1, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3]);
  it("yönü okur", () => {
    expect(jpegOrientation(exif(6))).toBe(6);
    expect(jpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3]))).toBe(1);
  });
  it("düzeltici yoksa açık mesajla reddeder", async () => {
    expect(await ingestImage(exif(6), "foto.jpg", createMemoryImageStore())).toEqual({ kind: "error", error: expect.stringContaining("döndürülmüş") });
  });
  it("düzeltici varsa düzeltilmiş baytı kullanır", async () => {
    const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const upright = vi.fn(async () => PNG);
    const result = await ingestImage(exif(6), "foto.jpg", createMemoryImageStore(), upright);
    expect(upright).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ kind: "image", meta: { mime: "image/png" } });
  });
});

describe("SVG style", () => {
  const svg = (inner: string) => `<svg viewBox="0 0 1 1">${inner}</svg>`;
  it("style içindeki rengi okur", () => expect((parseSvg(svg('<path d="M0 0" style="fill:#cc0000;stroke:none"/>')) as VectorIcon).paths[0].fillColor).toBe("#cc0000"));
  it("style içindeki gradyanı reddeder", () => expect(parseSvg(svg('<path d="M0 0" style="fill:url(#g)"/>'))).toEqual({ error: expect.stringContaining("Gradyan") }));
  it("style etiketini reddeder", () => expect(parseSvg(svg('<style>.a{fill:red}</style><path d="M0 0" class="a"/>'))).toEqual({ error: expect.stringContaining("style") }));
});

describe("depolama hatası", () => {
  const full = (base = memoryStorage()) => ({ getItem: base.getItem, setItem: () => { throw new Error("dolu"); } });
  it("otomatik kayıt başarısızsa bildirir", () => {
    const s = store(full());
    render(<Toolbar store={s} deps={deps} />);
    act(() => s.addText());
    expect(s.getState().saveFailed).toBe(true);
    expect(screen.getByText(/Otomatik kayıt yapılamıyor/)).toBeTruthy();
  });
  it("sembol kaydedilemezse hata döner", () => {
    expect(importCustomSymbol(`<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>`, "x", full())).toEqual({ error: expect.stringContaining("kaydedilemedi") });
  });
  it("içe aktarılan sembol kaydedilemezse false döner", () => {
    const good = { id: "custom-1", category: "Benim", tags: ["x"], icon: { viewBox: [0, 0, 1, 1], paths: [{ d: "M0 0", fill: true, strokeWidth: 0 }] } };
    expect(mergeCustomSymbols([good], full())).toBe(false);
  });
});

describe("yeni şablon kaydı", () => {
  it("içerik kaybettirecekse onay ister", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const s = store();
    s.addText();
    s.setCellValue(20, activeDesign(s.getState()).elements[0].id, "Son");
    render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Yeni şablon" }));
    fireEvent.change(screen.getByLabelText("Sütun"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Satır"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Şablonu kaydet" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(grid(s).templateId).toBe("TW-2021");
  });
});
