import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createFontTools, FONT_FILES, type FontTools } from "../../src/render/fonts";
import { PATTERNS, applyPattern, fitText } from "../../src/library/textPatterns";

let tools: FontTools;
beforeAll(() => {
  const bytes = Object.fromEntries(Object.entries(FONT_FILES).map(([id, file]) => [id, readFileSync(`public/fonts/${file}`)]));
  tools = createFontTools(bytes as any);
});

const box = { width: 40, height: 10 };

describe("fitText", () => {
  it("keeps short text at the start size", () => {
    expect(fitText("Mısır", box, "sans", 12, tools.measure)).toMatchObject({ sizePt: 12, lines: ["Mısır"], overflow: false });
  });

  it("shrinks long text until it fits", () => {
    const r = fitText("Çok uzun bir etiket metni burada yer alıyor ve sığması gerekiyor", box, "sans", 30, tools.measure);
    expect(r.sizePt).toBeLessThan(30);
    expect(r.overflow).toBe(false);
    for (const line of r.lines) expect(tools.measure(line, "sans", r.sizePt)).toBeLessThanOrEqual(box.width);
  });

  it("reports overflow at 4 pt without losing text", () => {
    const text = "kelime ".repeat(400).trim();
    const r = fitText(text, { width: 10, height: 4 }, "sans", 12, tools.measure);
    expect(r.sizePt).toBe(4);
    expect(r.overflow).toBe(true);
    expect(r.lines.join(" ")).toBe(text);
  });

  it("honours explicit line breaks", () => {
    expect(fitText("a\nb", box, "sans", 8, tools.measure).lines).toEqual(["a", "b"]);
  });

  it("measures Turkish text", () => expect(tools.measure("ğüşıöçİ", "sans", 12)).toBeGreaterThan(0));
  it("lists characters the font lacks", () => expect(tools.unsupported("a🌽", "sans")).toEqual(["🌽"]));
});

describe("applyPattern", () => {
  const label = { width: 60, height: 40 };

  it("offers six patterns", () => expect(PATTERNS.map((p) => p.id)).toEqual(["title", "title-sub", "badge", "three-lines", "symbol-left", "symbol-top"]));

  it.each(["title", "title-sub", "badge", "three-lines", "symbol-left", "symbol-top"])("keeps %s inside the label", (id) => {
    for (const e of applyPattern(id, label, ["A", "B", "C"], "corn")) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.x + e.width).toBeLessThanOrEqual(label.width);
      expect(e.y + e.height).toBeLessThanOrEqual(label.height);
    }
  });

  it("places the symbol when a pattern uses one", () => {
    expect(applyPattern("symbol-left", label, ["A"], "corn").some((e) => e.kind === "symbol")).toBe(true);
  });

  it("uses the whole label without a symbol", () => {
    expect(applyPattern("symbol-left", label, ["A"]).every((e) => e.kind === "text")).toBe(true);
  });
});
