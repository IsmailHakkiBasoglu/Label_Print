import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tanexTemplates } from "../../src/core/catalog";
import { newProject, type LabelProject, type TextElement } from "../../src/core/document";
import { labelRects } from "../../src/core/geometry";
import { catalog } from "../../src/library/symbols/search";
import { calibrationPdf } from "../../src/render/calibration";
import { createFontTools, FONT_FILES, type FontBytes } from "../../src/render/fonts";
import { layoutProject } from "../../src/render/layout";
import { renderPdf, type RenderDeps } from "../../src/render/pdf";
import { countGuideCurves, invisibleGlyphs, pageContent, readGuideRects, readText } from "./helpers/readPdf";

const fontBytes = Object.fromEntries(Object.entries(FONT_FILES).map(([id, f]) => [id, new Uint8Array(readFileSync(`public/fonts/${f}`))])) as FontBytes;
const deps: RenderDeps = {
  templates: (id) => tanexTemplates.find((t) => t.id === id),
  symbols: (id) => catalog.find((s) => s.id === id),
  tools: createFontTools(fontBytes),
  fontBytes,
};
const tmpl = (id: string) => tanexTemplates.find((t) => t.id === id)!;
const text = (s: string, over: Partial<TextElement> = {}): TextElement => ({
  kind: "text", id: "t", x: 2, y: 2, width: 50, height: 20, text: s, fontId: "sans", sizePt: 12, align: "left", color: "#000000", ...over,
});
const withText = (p: LabelProject, s: string, over?: Partial<TextElement>) => {
  p.designs.d1.elements.push(text(s, over));
  return p;
};
const guides = { guides: true };

async function bytesOf(p: LabelProject, opts = guides) {
  const r = await renderPdf(p, deps, opts);
  if (!r.ok) throw new Error(r.errors.join());
  return r.bytes;
}

describe("renderPdf geometry", () => {
  it("creates an exact A4 page", async () => {
    const { width, height } = await pageContent(await bytesOf(withText(newProject(tmpl("TW-2021")), "x")));
    expect(width).toBeCloseTo(595.2756, 4);
    expect(height).toBeCloseTo(841.8898, 4);
  });

  it("places all TW-2021 labels within 0.01 mm", async () => {
    const t = tmpl("TW-2021");
    const expected = labelRects(t);
    const actual = await readGuideRects(await bytesOf(withText(newProject(t), "x")));
    expect(actual).toHaveLength(21);
    actual.forEach((r, i) => {
      expect(Math.abs(r.x - expected[i].x)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(r.y - expected[i].y)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(r.width - expected[i].width)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(r.height - expected[i].height)).toBeLessThanOrEqual(0.01);
    });
  });

  it("applies the printer offset", async () => {
    const t = tmpl("TW-2021");
    const p = withText(newProject(t), "x");
    p.printOffset = { x: 1, y: -0.5 };
    const [first] = await readGuideRects(await bytesOf(p));
    expect(first.x).toBeCloseTo(labelRects(t)[0].x + 1, 2);
    expect(first.y).toBeCloseTo(labelRects(t)[0].y - 0.5, 2);
  });

  it("draws round guides as curves", async () => {
    expect(await countGuideCurves(await bytesOf(withText(newProject(tmpl("TW-2130")), "x")))).toBe(48);
  });

  it("prints only selected cells", async () => {
    const p = withText(newProject(tmpl("TW-2021")), "x");
    (p.pages[0].zones[0] as any).cells.used = [0, 5];
    expect(await readGuideRects(await bytesOf(p))).toHaveLength(2);
  });

  it("omits guides when turned off", async () => {
    const p = withText(newProject(tmpl("TW-2021")), "x");
    expect(await readGuideRects(await bytesOf(p, { guides: false }))).toHaveLength(0);
  });
});

describe("renkli semboller", () => {
  const colored = { id: "kirmizi", category: "x", tags: ["x"], icon: { viewBox: [0, 0, 10, 10] as [number, number, number, number], paths: [{ d: "M0 0L10 0L10 10Z", fill: true, strokeWidth: 0, fillColor: "#ff0000" }] } };
  const local = { ...deps, symbols: (id: string) => (id === "kirmizi" ? colored : deps.symbols(id)) };
  const project = (symbolId: string) => {
    const p = newProject(tmpl("TW-2021"));
    p.designs.d1.elements = [{ kind: "symbol", id: "s", x: 1, y: 1, width: 10, height: 10, symbolId, color: "#0000ff" }];
    return p;
  };

  it("sabit rengi öğe renginin önüne geçirir", () => {
    const ops = layoutProject(project("kirmizi"), local, { guides: false }).pages[0].ops;
    expect(ops[0]).toMatchObject({ kind: "path", fill: "#ff0000" });
  });

  it("tek renk sembol öğe rengini kullanır", () => {
    const ops = layoutProject(project("corn"), local, { guides: false }).pages[0].ops.filter((o) => o.kind === "path") as any[];
    expect(ops.every((o) => (o.stroke?.color ?? o.fill) === "#0000ff")).toBe(true);
  });
});

describe("hücre içeriği", () => {
  it("her hücreye kendi yazısını basar ve konumları değiştirmez", async () => {
    const t = tmpl("TW-2021");
    const p = withText(newProject(t), "Ortak");
    const plain = await readGuideRects(await bytesOf(withText(newProject(t), "Ortak")));
    (p.pages[0].zones[0] as any).content = { 0: { values: { t: "Mısır" } }, 1: { values: { t: "Nohut" } } };
    const bytes = await bytesOf(p);
    const text = await readText(bytes);
    expect(text).toContain("Mısır");
    expect(text).toContain("Nohut");
    expect(await readGuideRects(bytes)).toEqual(plain);
  });

  it("yalnız boş hücreleri olan proje için hata verir", async () => {
    const p = withText(newProject(tmpl("TW-2021")), "x");
    (p.pages[0].zones[0] as any).cells.used = [0];
    (p.pages[0].zones[0] as any).content = { 0: { values: { t: "" } } };
    const r = await renderPdf(p, deps, { guides: false });
    expect(r.ok).toBe(false);
  });
});

describe("renderPdf text", () => {
  it("embeds Turkish characters", async () => {
    expect((await readText(await bytesOf(withText(newProject(tmpl("TW-2021")), "ğüşıöçİ")))).replace(/\s/g, "")).toContain("ğüşıöçİ".repeat(1));
  });

  it("embeds real outlines for every shown glyph", async () => {
    const result = await invisibleGlyphs(await bytesOf(withText(newProject(tmpl("TW-2021")), "OrganikMısırİçindekilerğüşıöç")));
    expect(result.shown).toBeGreaterThan(20);
    expect(result.invisible).toBe(0);
  });

  it("warns about characters the font lacks and still renders", async () => {
    const r = await renderPdf(withText(newProject(tmpl("TW-2021")), "a🌽"), deps, guides);
    expect(r.ok).toBe(true);
    expect(r.ok && r.warnings.join()).toContain("🌽");
  });

  it("warns about text that cannot fit", async () => {
    const r = await renderPdf(withText(newProject(tmpl("TW-2021")), "kelime ".repeat(500), { width: 10, height: 4 }), deps, guides);
    expect(r.ok).toBe(true);
    expect(r.ok && r.warnings.join()).toMatch(/sığmıyor/);
  });
});

describe("renderPdf blocking errors", () => {
  it("refuses a printer offset that pushes labels off the page", async () => {
    const p = newProject(tmpl("TW-2021"));
    p.printOffset = { x: 10, y: 0 };
    const r = await renderPdf(p, deps, guides);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join()).toMatch(/sayfa dışına/);
  });

  it("refuses a free zone outside the page", async () => {
    const p = newProject(tmpl("TW-2021"));
    p.pages[0].zones = [{ kind: "free", x: 200, y: 0, width: 50, height: 10, design: { elements: [text("x")] } }];
    const r = await renderPdf(p, deps, guides);
    expect(r.ok).toBe(false);
  });

  it("refuses a sheet with no selected cells", async () => {
    const p = withText(newProject(tmpl("TW-2021")), "x");
    (p.pages[0].zones[0] as any).cells.used = [];
    const r = await renderPdf(p, deps, guides);
    expect(!r.ok && r.errors.join()).toContain("Basılacak etiket yok");
  });

  it("refuses an empty design without guides", async () => {
    const r = await renderPdf(newProject(tmpl("TW-2021")), deps, { guides: false });
    expect(!r.ok && r.errors.join()).toContain("Basılacak etiket yok");
  });

  it("warns about overlapping zones but renders", async () => {
    const p = newProject(tmpl("TW-2021"));
    const free = { kind: "free" as const, x: 10, y: 10, width: 30, height: 10, design: { elements: [text("x", { width: 20, height: 5 })] } };
    p.pages[0].zones = [free, { ...free }];
    const r = await renderPdf(p, deps, guides);
    expect(r.ok && r.warnings.join()).toMatch(/çakışıyor/);
  });
});

describe("calibrationPdf", () => {
  it("creates a page of the sheet size with ruler ticks", async () => {
    const { width, text: content } = await pageContent(await calibrationPdf({ width: 210, height: 297 }, fontBytes));
    expect(width).toBeCloseTo(595.2756, 4);
    expect([...content.matchAll(/ l\b/g)].length).toBeGreaterThanOrEqual(40);
  });
});
