import { describe, expect, it } from "vitest";
import { activeDesign, createStore, LEGACY_PROJECT_KEY, PROJECT_KEY } from "../../src/ui/store";
import { memoryStorage, tmpl } from "./helpers/deps";

const make = (storage = memoryStorage()) => createStore(tmpl("TW-2021"), storage);

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
