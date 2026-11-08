import { describe, expect, it } from "vitest";
import { catalog, normalize, searchSymbols } from "../../src/library/symbols/search";
import { loadColorCatalog } from "../../src/library/symbols/colorCatalog";
import { isMultiColor, parseSvg, type VectorIcon } from "../../src/library/symbols/svg";

const svg = (attrs: string) => `<svg viewBox="0 0 10 10"><path d="M0 0L1 1" ${attrs}/></svg>`;
const icon = (attrs: string) => {
  const result = parseSvg(svg(attrs));
  if ("error" in result) throw new Error(result.error);
  return result as VectorIcon;
};

describe("SVG renkleri", () => {
  it("dolgu rengini saklar", () => expect(icon('fill="#FF0000"').paths[0].fillColor).toBe("#ff0000"));
  it("kısa hex'i açar", () => expect(icon('fill="#abc"').paths[0].fillColor).toBe("#aabbcc"));
  it("çizgi rengini saklar", () => expect(icon('fill="none" stroke="#00ff00" stroke-width="1"').paths[0]).toMatchObject({ strokeColor: "#00ff00", fill: false }));
  it("currentColor öğe rengine bırakılır", () => expect(icon('fill="currentColor"').paths[0].fillColor).toBeUndefined());
  it("adlı rengi çevirir", () => expect(icon('fill="red"').paths[0].fillColor).toBe("#ff0000"));
  it("rgb rengini çevirir", () => expect(icon('fill="rgb(255, 0, 16)"').paths[0].fillColor).toBe("#ff0010"));
  it("üst öğenin rengini devralır", () => {
    const r = parseSvg(`<svg viewBox="0 0 1 1" fill="#112233"><g><path d="M0 0"/></g></svg>`) as VectorIcon;
    expect(r.paths[0].fillColor).toBe("#112233");
  });
  it("gradyanı açık mesajla reddeder", () => expect(parseSvg(svg('fill="url(#g)"'))).toEqual({ error: expect.stringContaining("Gradyan") }));
  it("bilinmeyen rengi açık mesajla reddeder", () => expect(parseSvg(svg('fill="gök"'))).toEqual({ error: expect.stringContaining("Renk") }));
  it("isMultiColor yalnız sabit renkte doğrudur", () => {
    expect(isMultiColor(icon('fill="#ff0000"'))).toBe(true);
    expect(isMultiColor(icon('fill="currentColor"'))).toBe(false);
  });
});

describe("tek renk katalog", () => {
  it("sabit renk taşımaz", () => expect(catalog.some((s) => isMultiColor(s.icon))).toBe(false));
});

describe("renkli katalog", () => {
  it("en az 300 görsel, benzersiz ve önekli kimlik içerir", async () => {
    const colored = await loadColorCatalog();
    expect(colored.length).toBeGreaterThanOrEqual(300);
    expect(new Set(colored.map((s) => s.id)).size).toBe(colored.length);
    expect(colored.every((s) => s.id.startsWith("color:"))).toBe(true);
  });
  it("her görselde sabit renk vardır, gradyan yoktur", async () => {
    const colored = await loadColorCatalog();
    expect(colored.every((s) => isMultiColor(s.icon))).toBe(true);
    expect(JSON.stringify(colored)).not.toContain("url(");
  });
  it.each(["mısır", "zeytin", "nohut", "un", "biber", "tuz", "şeker", "çay", "kahve"])("%s bulunur", async (word) => {
    expect(searchSymbols(word, 5, await loadColorCatalog()).length).toBeGreaterThan(0);
  });
});

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
