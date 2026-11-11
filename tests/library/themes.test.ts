import { describe, expect, it } from "vitest";
import type { TextElement } from "../../src/core/document";
import { FRAMES } from "../../src/library/frames";
import { ORNAMENTS } from "../../src/library/ornaments/frames.data";
import { applyPattern } from "../../src/library/textPatterns";
import { frameMargin } from "../../src/render/layout";
import { THEME_STYLES, THEMES, themedDesign } from "../../src/library/themes";

const LABEL = { width: 63.5, height: 38.1, shape: "rect" as const };

describe("temalar", () => {
  it("spec tablosundaki 8 tema, benzersiz kimlik ve bilinen çerçeve", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["bahce-kirmizi", "bahce-mor", "kir-pembe", "kir-lila", "kraft-kahve", "kraft-zeytin", "modern-yesil", "modern-bordo"]);
    const frames = new Set([...ORNAMENTS.map((o) => o.id), ...FRAMES.map((f) => f.id)]);
    for (const t of THEMES) expect(frames.has(t.frameId), t.id).toBe(true);
  });

  it("her temanın yazı stili sayısı desenin yazı sayısına eşit", () => {
    for (const t of THEMES) expect(t.texts, t.id).toHaveLength(t.patternId === "band-title" ? 3 : 2);
  });

  it("dört tarz başlığı", () =>
    expect(THEME_STYLES).toEqual([
      { id: "bahce", name: "Doğal bahçe" },
      { id: "kir", name: "Kır çiçekleri" },
      { id: "kraft", name: "Rustik kraft" },
      { id: "modern", name: "Sade modern" },
    ]));

  it("spec renkleri", () => {
    const bahce = THEMES[0];
    expect(bahce.frameOptions).toMatchObject({ color: "#3B6D11", accent: "#C0322B" });
    expect(bahce.texts[0]).toMatchObject({ fontId: "serif-bold", color: "#27500A" });
    expect(THEMES.find((t) => t.id === "kraft-kahve")!.frameOptions.background).toBe("#E2C79C");
  });
});

describe("band-title deseni", () => {
  it("grup adını bandın içine, başlıkları altına koyar", () => {
    const [title, sub, group] = applyPattern("band-title", LABEL, ["Pirinç", "baldo", "BAKLİYAT"]) as TextElement[];
    const bandBottom = 1 + 0.26 * 36.1;
    expect(group.text).toBe("BAKLİYAT");
    expect(group.y + group.height).toBeLessThanOrEqual(bandBottom);
    expect(group.color).toBe("#ffffff");
    expect(title.y).toBeGreaterThan(bandBottom);
    expect(sub.y).toBeGreaterThan(title.y);
    expect(sub.y + sub.height).toBeLessThanOrEqual(38.1);
  });
});

describe("themedDesign", () => {
  it("çerçeveyi, desen yerleşimini ve yazı stillerini uygular", () => {
    const design = themedDesign(THEMES[0], { elements: [] }, LABEL);
    expect(design.frameId).toBe("o-berry-vine");
    expect(design.frameOptions).toMatchObject({ strokeMm: 0.4, insetMm: 1, color: "#3B6D11", accent: "#C0322B" });
    const texts = design.elements.filter((e): e is TextElement => e.kind === "text");
    expect(texts.map((t) => t.text)).toEqual(THEMES[0].samples);
    expect(texts[0]).toMatchObject({ fontId: "serif-bold", color: "#27500A", sizePt: THEMES[0].texts[0].sizePt });
  });

  it("yazılar süs bandının içinde kalır", () => {
    const design = themedDesign(THEMES[0], { elements: [] }, LABEL);
    for (const t of design.elements) expect(t.x).toBeGreaterThan(3);
  });
});

describe("yuvarlak etiketlerde tema", () => {
  for (const label of [{ width: 40, height: 40, shape: "circle" as const }, { width: 60, height: 40, shape: "oval" as const }]) {
    it(`${label.shape}: süslü temalarda yazı kutuları süsün içindeki elipste kalır`, () => {
      for (const theme of THEMES.filter((t) => t.patternId === "title-sub")) {
        const design = themedDesign(theme, { elements: [] }, label);
        const margin = frameMargin(design, label);
        const [a, b] = [label.width / 2 - margin, label.height / 2 - margin];
        for (const e of design.elements)
          for (const [x, y] of [[e.x, e.y], [e.x + e.width, e.y], [e.x, e.y + e.height], [e.x + e.width, e.y + e.height]])
            expect(((x - label.width / 2) / a) ** 2 + ((y - label.height / 2) / b) ** 2, `${theme.id}`).toBeLessThanOrEqual(1.0001);
      }
    });
  }
});
