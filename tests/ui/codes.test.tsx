// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CodeElement, GridZone } from "../../src/core/document";
import { PropertiesPanel } from "../../src/ui/PropertiesPanel";
import { activeDesign, createStore } from "../../src/ui/store";
import { deps, memoryStorage, tmpl } from "./helpers/deps";

afterEach(cleanup);

const codeOf = (s: ReturnType<typeof createStore>) => activeDesign(s.getState()).elements.find((e): e is CodeElement => e.kind === "code")!;
const set = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function open() {
  const s = createStore(tmpl("TW-2021"), memoryStorage());
  render(<PropertiesPanel store={s} deps={deps} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Kod ekle" }));
  return s;
}

describe("kod özellikleri", () => {
  it("Kod ekle etiketin ortasına QR ekler ve seçer", () => {
    const s = open();
    const code = codeOf(s);
    expect(code).toMatchObject({ format: "qr", value: "Örnek" });
    expect(code.width).toBeCloseTo(38.1 * 0.6);
    expect((screen.getByLabelText("Kod türü") as HTMLSelectElement).value).toBe("qr");
  });

  it("tür ve içerik değişir, hatayı hemen gösterir", () => {
    const s = open();
    set("Kod türü", "ean13");
    set("İçerik", "5901234123458");
    expect(codeOf(s)).toMatchObject({ format: "ean13", value: "5901234123458" });
    expect(screen.getByRole("alert").textContent).toMatch(/doğrusu 7/);
    set("İçerik", "5901234123457");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Altına yazı yalnız çizgili kodda görünür", () => {
    const s = open();
    expect(screen.queryByLabelText("Altına yazı")).toBeNull();
    set("Kod türü", "code128");
    fireEvent.click(screen.getByLabelText("Altına yazı"));
    expect(codeOf(s).showText).toBe(false);
  });

  it("ayrılmış hücre seçiliyken içerik o etikete yazılır", () => {
    const s = open();
    const id = codeOf(s).id;
    act(() => {
      s.setScope({ kind: "cell", cell: 2 });
      s.detachCell(2);
      s.select(id);
    });
    set("İçerik", "A1");
    const grid = s.getState().project.pages[0].zones[0] as GridZone;
    expect(grid.content[2].values[id]).toBe("A1");
    expect(s.getState().project.designs.d1.elements.find((e) => e.id === id)).toMatchObject({ value: "Örnek" });
  });

  it("kilitli hücrede kod içeriği alanı ve ortak içeriğe dönüş", () => {
    const s = open();
    const id = codeOf(s).id;
    act(() => s.setScope({ kind: "cell", cell: 2 }));
    set("Kod içeriği", "B7");
    const grid = s.getState().project.pages[0].zones[0] as GridZone;
    expect(grid.content[2].values[id]).toBe("B7");
    fireEvent.click(screen.getByRole("button", { name: "Ortak içeriğe dön" }));
    expect((s.getState().project.pages[0].zones[0] as GridZone).content[2]).toBeUndefined();
  });
});
