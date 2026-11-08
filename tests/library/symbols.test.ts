import { describe, expect, it } from "vitest";
import { catalog, normalize, searchSymbols } from "../../src/library/symbols/search";
import { parseSvg } from "../../src/library/symbols/svg";

describe("normalize", () => {
  it("folds Turkish capitals", () => {
    expect(normalize("MISIR")).toBe("misir");
    expect(normalize("İNCİR")).toBe("incir");
    expect(normalize("Çiğ Şüphe Öz")).toBe("cig suphe oz");
  });
});

describe("searchSymbols", () => {
  it.each(["Mısır", "misir", "MISIR"])("finds corn for %s", (q) => expect(searchSymbols(q)[0].id).toBe("corn"));

  it("finds a symbol from a longer label text", () => expect(searchSymbols("Organik Mısır Unu")[0].id).toBe("corn"));

  it("treats İNCİR like incir", () => {
    expect(searchSymbols("İNCİR")[0].id).toBe("fig");
    expect(searchSymbols("incir")[0].id).toBe("fig");
  });

  it("ranks exact tags before partial ones", () => expect(searchSymbols("elma")[0].id).toBe("apple"));
  it("returns nothing for one letter", () => expect(searchSymbols("m")).toEqual([]));
  it("respects the limit", () => expect(searchSymbols("meyve", 3).length).toBeLessThanOrEqual(3));
});

describe("catalog", () => {
  it("has at least 150 symbols", () => expect(catalog.length).toBeGreaterThanOrEqual(150));
  it("has unique ids", () => expect(new Set(catalog.map((s) => s.id)).size).toBe(catalog.length));
  it("covers the seven categories", () => expect(new Set(catalog.map((s) => s.category)).size).toBe(7));
  it("has drawable symbols", () => {
    for (const s of catalog) expect(s.icon.paths.length, s.id).toBeGreaterThan(0);
  });
});

describe("parseSvg", () => {
  it("converts primitives to paths", () => {
    const icon = parseSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/></svg>');
    expect("error" in icon).toBe(false);
    if (!("error" in icon)) expect(icon.paths[0].d).toMatch(/^M3 5A/);
  });

  it("drops active content", () => {
    const icon = parseSvg('<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><a href="http://x"><path d="M0 0L1 1"/></a><path d="M1 1L2 2"/></svg>');
    expect(JSON.stringify(icon)).not.toMatch(/alert|onload|http/);
    if (!("error" in icon)) expect(icon.paths).toHaveLength(1);
  });

  it("skips invisible helper paths", () => {
    const icon = parseSvg('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M1 1L2 2"/></svg>');
    if (!("error" in icon)) expect(icon.paths).toEqual([{ d: "M1 1L2 2", fill: false, strokeWidth: 2 }]);
  });

  it("rejects an empty drawing", () => expect(parseSvg('<svg viewBox="0 0 1 1"/>')).toHaveProperty("error"));
  it("rejects transforms it cannot honour", () => expect(parseSvg('<svg viewBox="0 0 1 1"><path transform="scale(2)" d="M0 0"/></svg>')).toHaveProperty("error"));
  it("rejects non-svg text", () => expect(parseSvg("merhaba")).toHaveProperty("error"));
});
