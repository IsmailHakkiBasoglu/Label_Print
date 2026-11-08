// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { tanexTemplates } from "../src/core/catalog";
import { exportCustom, importCustom, saveCustom } from "../src/core/customTemplates";
import { newProject, parseProject } from "../src/core/document";
import { validateTemplate } from "../src/core/templates";
import { catalog } from "../src/library/symbols/search";
import { normalizePathData } from "../src/library/symbols/svg";
import { fitText } from "../src/library/textPatterns";
import { layoutProject } from "../src/render/layout";
import { renderPdf } from "../src/render/pdf";
import { createStore } from "../src/ui/store";
import { TemplateBuilder } from "../src/ui/TemplateBuilder";
import { parseDocumentXml } from "../tools/import-tanex/parse-docx";
import { pageContent } from "./render/helpers/readPdf";
import { deps, memoryStorage, tmpl } from "./ui/helpers/deps";

afterEach(cleanup);

describe("symbols in PDF", () => {
  it("separates compact arc flags", () => {
    expect(normalizePathData("M2 2a1 1 0 011 1h5")).toBe("M2 2a1 1 0 0 1 1 1h5");
    expect(normalizePathData("M0 0a3.28 3.28 0 003.227 1.798")).toBe("M0 0a3.28 3.28 0 0 0 3.227 1.798");
  });

  it("splits numbers joined by a sign or dot", () => {
    expect(normalizePathData("M1-2.5.5L3,4")).toBe("M1 -2.5 .5L3 4");
  });

  it("renders every catalog symbol without broken numbers", async () => {
    const p = newProject(tmpl("TW-2021"));
    (p.pages[0].zones[0] as any).cells.used = [0];
    p.designs.d1.elements = catalog.map((s, i) => ({ kind: "symbol", id: `s${i}`, x: 1, y: 1, width: 10, height: 10, symbolId: s.id, color: "#000000" }));
    const r = await renderPdf(p, deps, { guides: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect((await pageContent(r.bytes)).text).not.toMatch(/NaN|undefined/);
  });
});

describe("parseProject rejects malformed structure", () => {
  const valid = () => JSON.parse(JSON.stringify(newProject(tmpl("TW-2021"))));
  const text = { kind: "text", id: "t", x: 0, y: 0, width: 5, height: 5, text: "a", fontId: "sans", sizePt: 12, align: "left", color: "#000000" };
  const cases: [string, (p: any) => void][] = [
    ["no pages", (p) => (p.pages = [])],
    ["null zone", (p) => (p.pages[0].zones = [null])],
    ["no designIds", (p) => delete p.pages[0].zones[0].designIds],
    ["no cells", (p) => delete p.pages[0].zones[0].cells],
    ["design without elements", (p) => delete p.designs.d1.elements],
    ["free zone without design", (p) => (p.pages[0].zones = [{ kind: "free", x: 0, y: 0, width: 1, height: 1 }])],
    ["text without sizePt", (p) => (p.designs.d1.elements = [{ ...text, sizePt: undefined }])],
    ["numeric text", (p) => (p.designs.d1.elements = [{ ...text, text: 5 }])],
    ["unknown font", (p) => (p.designs.d1.elements = [{ ...text, fontId: "x" }])],
    ["unknown element", (p) => (p.designs.d1.elements = [{ kind: "x" }])],
  ];
  it.each(cases)("%s", (_, mutate) => {
    const p = valid();
    mutate(p);
    expect(parseProject(JSON.stringify(p)).ok).toBe(false);
  });

  it("still accepts a valid project with content", () => {
    const p = valid();
    p.designs.d1.elements = [text];
    expect(parseProject(JSON.stringify(p)).ok).toBe(true);
  });
});

describe("guides", () => {
  it("are off by default", () => expect(createStore(tmpl("TW-2021"), memoryStorage()).getState().guides).toBe(false));

  it("do not count as content", () => {
    expect(layoutProject(newProject(tmpl("TW-2021")), deps, { guides: true }).errors.join()).toContain("Basılacak etiket yok");
  });
});

describe("printer offset", () => {
  const withContent = (id: string) => {
    const p = newProject(tmpl(id));
    p.designs.d1.frameId = "single";
    return p;
  };

  it("allows a small correction on edge-to-edge sheets", () => {
    const zero = tanexTemplates.find((t) => t.status === "verified" && t.grid.marginLeft === 0)!;
    const p = withContent(zero.id);
    p.printOffset = { x: -1, y: 0 };
    expect(layoutProject(p, deps, { guides: false }).errors).toEqual([]);
  });

  it("still refuses a large correction", () => {
    const p = withContent("TW-2021");
    p.printOffset = { x: 10, y: 0 };
    expect(layoutProject(p, deps, { guides: false }).errors.join()).toMatch(/sayfa dışına/);
  });
});

describe("zone overlap", () => {
  it("ignores deselected cells", () => {
    const p = newProject(tmpl("TW-2021"));
    (p.pages[0].zones[0] as any).cells.used = [0];
    p.designs.d1.frameId = "single";
    p.pages[0].zones.push({ kind: "free", x: 10, y: 200, width: 50, height: 20, design: { elements: [] } });
    expect(layoutProject(p, deps, { guides: false }).warnings.join()).not.toMatch(/çakışıyor/);
  });

  it("warns when a used cell is covered", () => {
    const p = newProject(tmpl("TW-2021"));
    p.designs.d1.frameId = "single";
    p.pages[0].zones.push({ kind: "free", x: 10, y: 200, width: 50, height: 20, design: { elements: [] } });
    expect(layoutProject(p, deps, { guides: false }).warnings.join()).toMatch(/çakışıyor/);
  });
});

describe("catalog plausibility", () => {
  it.each(["TW-2140", "TW-2319", "TW-2003", "TW-2025"])("marks %s for checking", (id) => expect(tmpl(id).status).toBe("check"));

  it("verifies only A4 sheets", () => {
    for (const t of tanexTemplates.filter((x) => x.status === "verified")) expect(t.sheet, t.id).toEqual({ width: 210, height: 297 });
  });
});

describe("parseDocumentXml edge rows", () => {
  const tw = (mm: number) => Math.round((mm * 1440) / 25.4);
  it("reports an end row close to label size", () => {
    const rows = [39.99, 5.8, 39.99, 5.8, 40.5].map((h) => `<w:tr><w:trPr><w:trHeight w:val="${tw(h)}"/></w:trPr></w:tr>`).join("");
    const xml = `<w:tbl><w:tblPr></w:tblPr><w:tblGrid><w:gridCol w:w="${tw(40)}"/></w:tblGrid>${rows}</w:tbl><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="0" w:left="0"/>`;
    expect(parseDocumentXml(xml, { width: 40, height: 40 })).toHaveProperty("error");
  });
});

describe("text measurement", () => {
  it("matches the unkerned glyphs a PDF draws", () => {
    const glyphSum = 105.07;
    expect(deps.tools.measure("AVATAR TOYOTA", "sans-bold", 36)).toBeCloseTo(glyphSum, 1);
  });

  it("does not hang on a huge start size", () => {
    expect(fitText("a", { width: 10, height: 10 }, "sans", 1e9, deps.tools.measure).sizePt).toBeLessThanOrEqual(200);
  });
});

describe("custom templates", () => {
  it("reject non-numeric measurements", () => {
    const t = tmpl("TW-2021");
    expect(validateTemplate({ ...t, grid: { ...t.grid, marginLeft: NaN } })).not.toEqual([]);
    expect(validateTemplate({ ...t, grid: { ...t.grid, gapX: NaN } })).not.toEqual([]);
  });

  it("export and re-import", () => {
    const storage = memoryStorage();
    saveCustom({ ...tmpl("TW-2021"), id: "custom-1", source: "custom" }, storage);
    const other = memoryStorage();
    expect(importCustom(exportCustom(storage), [], other).added[0].id).toBe("custom-1");
  });

  it("block saving after a field is cleared", () => {
    render(<TemplateBuilder onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText("Sol boşluk"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Şablonu kaydet" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("preview the sheet while building", () => {
    const { container } = render(<TemplateBuilder onSave={() => {}} />);
    expect(container.querySelectorAll("rect.guide")).toHaveLength(24);
  });
});

describe("source files", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  it("contain no NUL bytes", () => {
    for (const f of walk("src").filter((x) => /\.tsx?$/.test(x))) expect(readFileSync(f).includes(0), f).toBe(false);
  });
});
