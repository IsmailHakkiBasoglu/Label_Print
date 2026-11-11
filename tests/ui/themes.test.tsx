// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { THEME_STYLES } from "../../src/library/themes";
import { LibraryPanel } from "../../src/ui/LibraryPanel";
import { activeDesign, createStore } from "../../src/ui/store";
import { deps, memoryStorage, tmpl } from "./helpers/deps";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open(tab: string) {
  const s = createStore(tmpl("TW-2021"), memoryStorage());
  const view = render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: tab }));
  return { s, ...view };
}
const design = (s: ReturnType<typeof createStore>) => activeDesign(s.getState());

describe("Tema sekmesi", () => {
  it("dört başlık altında 8 kart, her kartta önizleme", () => {
    const { container } = open("Tema");
    for (const style of THEME_STYLES) expect(screen.getByRole("heading", { name: style.name })).toBeTruthy();
    expect(container.querySelectorAll(".theme-card")).toHaveLength(8);
    expect(container.querySelectorAll(".theme-card svg")).toHaveLength(8);
  });

  it("kart tıklanınca tema uygulanır", () => {
    const { s } = open("Tema");
    fireEvent.click(screen.getByRole("button", { name: /Bahçe · kırmızı meyve/ }));
    expect(design(s).frameId).toBe("o-berry-vine");
  });

  it("kayıp varsa onay sorar, vazgeçilirse uygulanmaz", () => {
    const { s } = open("Tema");
    fireEvent.click(screen.getByRole("button", { name: /Modern · yeşil/ }));
    const group = design(s).elements.filter((e) => e.kind === "text")[2];
    s.setCellValue(0, group.id, "BAKLİYAT");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: /Bahçe · kırmızı meyve/ }));
    expect(confirm.mock.calls[0][0]).toMatch(/içeriği silinecek/);
    expect(design(s).frameId).toBe("band");
  });

  it("önizleme etiketteki yazıyı gösterir", () => {
    const { s, container } = open("Tema");
    s.addText();
    s.updateElement(design(s).elements[0].id, { text: "Mercimek" });
    fireEvent.click(screen.getByRole("button", { name: "Tema" }));
    expect(container.querySelector(".theme-card svg")!.textContent).toContain("Mercimek");
  });
});

describe("çerçeve renk alanları", () => {
  it("vurgu rengi yalnız vurgulu çerçevede, ana renk her zaman", () => {
    const { s } = open("Çerçeve");
    expect(screen.getByLabelText("Ana renk")).toBeTruthy();
    expect(screen.queryByLabelText("Vurgu rengi")).toBeNull();
    s.setFrame("o-meadow", { strokeMm: 0.4, insetMm: 1, color: "#639922" });
    fireEvent.click(screen.getByRole("button", { name: "Çerçeve" }));
    fireEvent.change(screen.getByLabelText("Vurgu rengi"), { target: { value: "#d4537e" } });
    expect(design(s).frameOptions?.accent).toBe("#d4537e");
  });

  it("zemin aç/kapa", () => {
    const { s } = open("Çerçeve");
    fireEvent.click(screen.getByLabelText("Zemin"));
    expect(design(s).frameOptions?.background).toBe("#F5EBD7");
    fireEvent.click(screen.getByLabelText("Zemin"));
    expect(design(s).frameOptions?.background).toBeUndefined();
  });

  it("tek renkli çerçeveye geçince zemin kalır", () => {
    const { s } = open("Tema");
    fireEvent.click(screen.getByRole("button", { name: /Kraft · kahve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Çerçeve" }));
    fireEvent.click(screen.getByRole("button", { name: "Tek çizgi" }));
    expect(design(s).frameId).toBe("single");
    expect(design(s).frameOptions?.background).toBe("#E2C79C");
  });
});
