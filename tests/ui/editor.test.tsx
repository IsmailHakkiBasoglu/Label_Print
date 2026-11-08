// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { serialize } from "../../src/core/document";
import { PropertiesPanel } from "../../src/ui/PropertiesPanel";
import { activeDesign, createStore } from "../../src/ui/store";
import { Toolbar } from "../../src/ui/Toolbar";
import { deps, memoryStorage, tmpl } from "./helpers/deps";

afterEach(cleanup);

const store = () => createStore(tmpl("TW-2021"), memoryStorage());

describe("PropertiesPanel", () => {
  it("suggests corn while typing Mısır and adds it", () => {
    const s = store();
    s.addText();
    render(<PropertiesPanel store={s} deps={deps} />);
    fireEvent.change(screen.getByLabelText("Metin"), { target: { value: "Mısır" } });
    fireEvent.click(screen.getByRole("button", { name: "Sembol ekle: corn" }));
    expect(activeDesign(s.getState()).elements.some((e) => e.kind === "symbol" && e.symbolId === "corn")).toBe(true);
  });

  it("updates font size from a field", () => {
    const s = store();
    s.addText();
    render(<PropertiesPanel store={s} deps={deps} />);
    fireEvent.change(screen.getByLabelText("Yazı boyutu (pt)"), { target: { value: "20" } });
    expect(activeDesign(s.getState()).elements[0]).toMatchObject({ sizePt: 20 });
  });
});

describe("Toolbar", () => {
  const open = (text: string) => {
    const file = new File([text], "x.labelprint.json");
    Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
    fireEvent.change(screen.getByLabelText("Aç"), { target: { files: [file] } });
  };

  it("keeps the project when a corrupt file is opened", async () => {
    const s = store();
    s.addText();
    render(<Toolbar store={s} deps={deps} />);
    open("{bozuk");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Dosya/));
    expect(activeDesign(s.getState()).elements).toHaveLength(1);
  });

  it("loads a valid file", async () => {
    const other = store();
    other.addSymbol("corn");
    const s = store();
    render(<Toolbar store={s} deps={deps} />);
    open(serialize(other.getState().project));
    await waitFor(() => expect(activeDesign(s.getState()).elements).toHaveLength(1));
  });

  it("explains why a PDF cannot be produced", async () => {
    const s = store();
    s.setCells([]);
    render(<Toolbar store={s} deps={deps} />);
    fireEvent.click(screen.getByRole("button", { name: "PDF Al" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Basılacak etiket yok"));
  });

  it("reminds about actual-size printing", async () => {
    const s = store();
    s.addText();
    render(<Toolbar store={s} deps={deps} />);
    fireEvent.click(screen.getByRole("button", { name: "PDF Al" }));
    await waitFor(() => expect(screen.getByText(/Gerçek boyut/)).toBeTruthy());
  });
});
