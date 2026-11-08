// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GridZone } from "../../src/core/document";
import { LibraryPanel } from "../../src/ui/LibraryPanel";
import { PropertiesPanel } from "../../src/ui/PropertiesPanel";
import { SheetView } from "../../src/ui/SheetView";
import { activeDesign, createStore } from "../../src/ui/store";
import { deps, memoryStorage, tmpl } from "./helpers/deps";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const store = () => createStore(tmpl("TW-2021"), memoryStorage());
const grid = (s: ReturnType<typeof store>, page = 0) => s.getState().project.pages[page].zones[0] as GridZone;
const cells = (c: HTMLElement) => c.querySelectorAll(".cell");

describe("yaprak görünümü", () => {
  it("hücreye tıklayınca o hücreyi seçer, kullanımı değiştirmez", () => {
    const s = store();
    const { container } = render(<SheetView store={s} deps={deps} />);
    fireEvent.click(cells(container)[4]);
    expect(s.getState().scope).toEqual({ kind: "cell", cell: 4 });
    expect(grid(s).cells.used).toHaveLength(21);
  });

  it("'Hücre seç' modunda kullanımı değiştirir", () => {
    const s = store();
    const { container } = render(<SheetView store={s} deps={deps} />);
    fireEvent.click(screen.getByRole("button", { name: "Hücre seç" }));
    fireEvent.click(cells(container)[4]);
    expect(grid(s).cells.used).not.toContain(4);
    expect(s.getState().scope).toEqual({ kind: "all" });
  });

  it("'Tüm hücreler' ortak moda döner", () => {
    const s = store();
    render(<SheetView store={s} deps={deps} />);
    s.setScope({ kind: "cell", cell: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Tüm hücreler" }));
    expect(s.getState().scope).toEqual({ kind: "all" });
  });

  it("değerli ve ayrılmış hücreleri işaretler", () => {
    const s = store();
    s.addText();
    const id = activeDesign(s.getState()).elements[0].id;
    s.setCellValue(0, id, "A");
    s.detachCell(1);
    const { container } = render(<SheetView store={s} deps={deps} />);
    expect(container.querySelectorAll(".mark.value")).toHaveLength(1);
    expect(container.querySelectorAll(".mark.detached")).toHaveLength(1);
  });

  it("sayfa geçişi önizlemeyi ve sayacı değiştirir", () => {
    const s = store();
    render(<SheetView store={s} deps={deps} />);
    fireEvent.click(screen.getByRole("button", { name: "Sayfa ekle" }));
    expect(screen.getByText("Sayfa 2 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Önceki sayfa" }));
    expect(screen.getByText("Sayfa 1 / 2")).toBeTruthy();
  });

  it("tek sayfada silme kapalıdır", () => {
    render(<SheetView store={store()} deps={deps} />);
    expect((screen.getByRole("button", { name: "Sayfayı sil" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("listeden doldurma penceresi", () => {
  function open(prepare?: (s: ReturnType<typeof store>) => void) {
    const s = store();
    s.addText();
    prepare?.(s);
    render(<SheetView store={s} deps={deps} />);
    fireEvent.click(screen.getByRole("button", { name: "Listeden doldur" }));
    return s;
  }
  const type = (text: string) => fireEvent.change(screen.getByLabelText("Liste (her satır bir etiket)"), { target: { value: text } });

  it("doldurmadan önce raporu gösterir ve doldurur", () => {
    const s = open();
    type("Mısır\nNohut\nŞeker");
    expect(screen.getByRole("status").textContent).toMatch(/3 etiket.*18 etiket boş/);
    expect(grid(s).content).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(Object.keys(grid(s).content)).toEqual(["0", "1", "2"]);
  });

  it("görselsiz tasarımda öneri kapalıdır ve nedenini söyler", () => {
    open();
    expect((screen.getByLabelText("Sembol öner") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Önce ortak tasarıma bir görsel ekleyin/)).toBeTruthy();
  });

  it("görselli tasarımda eşleşmeyen satırı raporlar", () => {
    const s = open((x) => x.addSymbol("corn"));
    type("Mısır\nqqqzzz");
    expect(screen.getByRole("status").textContent).toContain("1 satır için görsel bulunamadı");
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    const symbolId = activeDesign(s.getState()).elements.find((e) => e.kind === "symbol")!.id;
    expect(grid(s).content[0].values[symbolId]).toBe("corn");
  });

  it("önceki içerik varsa ikinci tıklamada değiştirir", () => {
    const s = open((x) => x.setCellValue(0, activeDesign(x.getState()).elements[0].id, "Eski"));
    type("Yeni");
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(Object.values(grid(s).content[0].values)).toEqual(["Eski"]);
    fireEvent.click(screen.getByRole("button", { name: "Evet, değiştir" }));
    expect(Object.values(grid(s).content[0].values)).toEqual(["Yeni"]);
  });

  it("boş listede doldurma kapalıdır", () => {
    open();
    expect((screen.getByRole("button", { name: "Doldur" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("özellikler paneli hücre modu", () => {
  function cellMode() {
    const s = store();
    s.addText();
    const id = activeDesign(s.getState()).elements[0].id;
    s.setScope({ kind: "cell", cell: 2 });
    render(<PropertiesPanel store={s} deps={deps} />);
    return { s, id };
  }

  it("metin alanı hücre değerini yazar, ortak tasarımı değiştirmez", () => {
    const { s, id } = cellMode();
    fireEvent.change(screen.getByLabelText("Metin"), { target: { value: "Mısır" } });
    expect(grid(s).content[2].values[id]).toBe("Mısır");
    expect(s.getState().project.designs.d1.elements[0]).toMatchObject({ text: "Yazı" });
  });

  it("konum ve yazı tipi denetimlerini kapatır", () => {
    cellMode();
    expect(screen.queryByLabelText("X (mm)")).toBeNull();
    expect(screen.queryByLabelText("Yazı tipi")).toBeNull();
    expect((screen.getByRole("button", { name: "+ Yazı ekle" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("'Bu hücreyi ayır' denetimleri açar, 'Ortağa döndür' geri getirir", () => {
    const { s, id } = cellMode();
    fireEvent.click(screen.getByRole("button", { name: "Bu hücreyi ayır" }));
    expect(grid(s).content[2].designId).toBeDefined();
    act(() => s.select(id));
    expect(screen.getByLabelText("X (mm)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ortağa döndür" }));
    expect(grid(s).content[2]).toBeUndefined();
  });

  it("ayrılmış hücrede metin de hücre değerine yazılır", () => {
    const { s, id } = cellMode();
    fireEvent.click(screen.getByRole("button", { name: "Bu hücreyi ayır" }));
    act(() => s.select(id));
    fireEvent.change(screen.getByLabelText("Metin"), { target: { value: "Özel" } });
    expect(grid(s).content[2].values[id]).toBe("Özel");
  });
});

describe("renkli görsel sekmesi", () => {
  const colored = { id: "color:corn", category: "Sebze", tags: ["mısır"], icon: { viewBox: [0, 0, 1, 1] as [number, number, number, number], paths: [{ d: "M0 0L1 1", fill: true, strokeWidth: 0, fillColor: "#ffcc00" }] } };
  const localDeps = { ...deps, colorSymbols: [colored], symbols: (id: string) => (id === colored.id ? colored : deps.symbols(id)) };

  it("sekmeler arasında kataloğu değiştirir", () => {
    const s = store();
    render(<LibraryPanel store={s} deps={localDeps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sembol" }));
    fireEvent.change(screen.getByLabelText("Sembol ara"), { target: { value: "mısır" } });
    expect(screen.queryByRole("button", { name: "Sembol ekle: color:corn" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Renkli" }));
    fireEvent.click(screen.getByRole("button", { name: "Sembol ekle: color:corn" }));
    expect(activeDesign(s.getState()).elements[0]).toMatchObject({ symbolId: "color:corn" });
  });

  it("renkli görselde renk denetimini gizler", () => {
    const s = store();
    s.addSymbol("color:corn");
    render(<PropertiesPanel store={s} deps={localDeps} />);
    expect(screen.queryByLabelText("Renk")).toBeNull();
  });

  it("liste önerisi ortak görselin türünde arar", () => {
    const s = store();
    s.addSymbol("color:corn");
    render(<SheetView store={s} deps={localDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Listeden doldur" }));
    fireEvent.change(screen.getByLabelText("Liste (her satır bir etiket)"), { target: { value: "Mısır" } });
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    const symbolId = activeDesign(s.getState()).elements.find((e) => e.kind === "symbol")!.id;
    expect(grid(s).content[0].values[symbolId]).toBe("color:corn");
  });
});

describe("kütüphane hücre modu", () => {
  const props = { templates: [tmpl("TW-2021"), tmpl("TW-2001")], customSymbols: [], onLibraryChanged: () => {} };

  it("sembol seçimi hücrenin görselini değiştirir", () => {
    const s = store();
    s.addSymbol("corn");
    const id = activeDesign(s.getState()).elements[0].id;
    s.setScope({ kind: "cell", cell: 2 });
    render(<LibraryPanel store={s} deps={deps} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Sembol" }));
    fireEvent.change(screen.getByLabelText("Sembol ara"), { target: { value: "zeytin" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^Sembol ekle/ })[0]);
    expect(grid(s).content[2].values[id]).toBeTruthy();
    expect(activeDesign(s.getState()).elements).toHaveLength(1);
  });

  it("içerik kaybettiren şablon değişimi onay ister", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const s = store();
    s.addText();
    s.setCellValue(20, activeDesign(s.getState()).elements[0].id, "Son");
    render(<LibraryPanel store={s} deps={deps} {...props} />);
    fireEvent.click(screen.getByText("TW-2001"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(grid(s).templateId).toBe("TW-2021");
  });
});
