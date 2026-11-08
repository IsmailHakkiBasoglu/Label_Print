import { describe, expect, it } from "vitest";
import { importCustom, loadCustom, saveCustom } from "../../src/core/customTemplates";
import type { Template } from "../../src/core/templates";
import { importCustomSymbol, loadCustomSymbols } from "../../src/library/symbols/custom";
import { memoryStorage, tmpl } from "../ui/helpers/deps";

const custom: Template = {
  id: "custom-1",
  name: "Benim",
  sheet: { width: 210, height: 297 },
  grid: { columns: 2, rows: 2, marginTop: 5, marginLeft: 5, gapX: 2, gapY: 2 },
  label: { width: 50, height: 30, shape: "rect" },
  source: "custom",
  status: "verified",
};

describe("custom templates", () => {
  it("saves and loads", () => {
    const storage = memoryStorage();
    saveCustom(custom, storage);
    expect(loadCustom(storage)).toEqual([custom]);
  });

  it("returns nothing for corrupt storage", () => {
    expect(loadCustom(memoryStorage({ "labelprint.templates.v1": "{x" }))).toEqual([]);
  });

  it("never overwrites a catalog template on import", () => {
    const storage = memoryStorage();
    const original = structuredClone(tmpl("TW-2021"));
    const result = importCustom(JSON.stringify([{ ...custom, id: "TW-2021" }]), [tmpl("TW-2021")], storage);
    expect(result.added[0].id).toBe("TW-2021-2");
    expect(result.renamed).toEqual(["TW-2021"]);
    expect(tmpl("TW-2021")).toEqual(original);
  });

  it("marks imported templates as custom", () => {
    const result = importCustom(JSON.stringify([{ ...custom, source: "tanex" }]), [], memoryStorage());
    expect(result.added[0].source).toBe("custom");
  });

  it("reports invalid templates", () => {
    const bad = { ...custom, grid: { ...custom.grid, columns: 50 } };
    const result = importCustom(JSON.stringify([bad]), [], memoryStorage());
    expect(result.added).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("reports unreadable files", () => {
    expect(importCustom("{x", [], memoryStorage()).errors).toHaveLength(1);
  });

  it("reports entries of the wrong shape", () => {
    expect(importCustom(JSON.stringify([{ id: "a" }]), [], memoryStorage()).errors).toHaveLength(1);
  });
});

describe("custom symbols", () => {
  it("stores a valid SVG", () => {
    const storage = memoryStorage();
    const result = importCustomSymbol('<svg viewBox="0 0 10 10"><path d="M0 0L5 5"/></svg>', "Logom", storage);
    expect("error" in result).toBe(false);
    expect(loadCustomSymbols(storage)[0].tags).toContain("Logom");
  });

  it("rejects a bad SVG and keeps existing data", () => {
    const storage = memoryStorage();
    importCustomSymbol('<svg viewBox="0 0 10 10"><path d="M0 0L5 5"/></svg>', "A", storage);
    expect(importCustomSymbol("<html></html>", "B", storage)).toHaveProperty("error");
    expect(loadCustomSymbols(storage)).toHaveLength(1);
  });
});
