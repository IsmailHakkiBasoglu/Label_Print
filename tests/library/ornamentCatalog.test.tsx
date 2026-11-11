// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { newProject, type TextElement } from "../../src/core/document";
import { FRAMES, frameLayout, frameOps } from "../../src/library/frames";
import { hasAccent, ORNAMENTS } from "../../src/library/ornaments/frames.data";
import { ornamentLayout } from "../../src/library/ornaments/layout";
import { layoutProject } from "../../src/render/layout";
import { renderPdf } from "../../src/render/pdf";
import { LibraryPanel } from "../../src/ui/LibraryPanel";
import { activeDesign, createStore } from "../../src/ui/store";
import { deps, memoryStorage, tmpl } from "../ui/helpers/deps";

afterEach(cleanup);

const opts = { strokeMm: 0.4, insetMm: 1, color: "#000000" };
const label = (width: number, height: number, shape: "rect" | "circle" = "rect") => ({ width, height, shape });

describe("çerçeve kütüphanesi", () => {
  it("en az 24 çerçeve ve benzersiz kimlik içerir", () => {
    expect(ORNAMENTS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(ORNAMENTS.map((o) => o.id)).size).toBe(ORNAMENTS.length);
  });

  it("altı kategorinin her biri doludur", () => {
    for (const category of ["klasik", "bitkisel", "kurdele", "geometrik", "mutfak", "vintage"]) expect(ORNAMENTS.some((o) => o.category === category)).toBe(true);
  });

  it("parçalar yalnız mutlak M L C Z kullanır ve kutusunun içindedir", () => {
    for (const o of ORNAMENTS) {
      for (const part of [o.corner, o.edge]) {
        for (const path of part.d) {
          const d = typeof path === "string" ? path : path.d;
          expect(d, o.id).toMatch(/^[MLCZ\d\s.\-]+$/);
          for (const [, x, y] of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
            expect(Number(x), o.id).toBeGreaterThanOrEqual(-0.01);
            expect(Number(x), o.id).toBeLessThanOrEqual(part.size[0] + 0.01);
            expect(Number(y), o.id).toBeGreaterThanOrEqual(-0.01);
            expect(Number(y), o.id).toBeLessThanOrEqual(part.size[1] + 0.01);
          }
        }
      }
    }
  });

  it("delikli motifler tek yol olarak çizilir, delik dolu basılmaz", () => {
    for (const id of ["o-lace", "o-diamonds"]) expect(ORNAMENTS.find((o) => o.id === id)!.edge.d).toHaveLength(1);
  });

  it("v1 çerçeveleri aynen durur", () => {
    expect(FRAMES.slice(0, 6).map((f) => f.id)).toEqual(["single", "double", "dashed", "rounded", "corner-ornament", "shape"]);
    expect(frameLayout("double", label(50, 30), opts)).toMatchObject({ bandMm: 0, fellBack: false });
    expect(frameLayout("double", label(50, 30), opts).ops).toEqual(frameOps("double", label(50, 30), opts));
  });

  it("süslü çerçeve küçük etikette tek çizgiye düşer", () => {
    const result = frameLayout(ORNAMENTS[0].id, label(10, 30), opts);
    expect(result.fellBack).toBe(true);
    expect(result.ops).toEqual(frameOps("single", label(10, 30), opts));
  });

  it.each([
    ["TW-2021", 63.5],
    ["TW-2014", 99.1],
    ["TW-2130", 0],
  ])("her çerçeve %s üzerinde PDF üretir", async (id) => {
    for (const o of ORNAMENTS) {
      const p = newProject(tmpl(id));
      (p.pages[0].zones[0] as any).cells.used = [0];
      p.designs.d1.frameId = o.id;
      p.designs.d1.frameOptions = opts;
      const r = await renderPdf(p, deps, { guides: false });
      expect(r.ok, o.id).toBe(true);
    }
  });
});

describe("uyarılar", () => {
  const warningsFor = (frameId: string, element: Partial<TextElement>, templateId = "TW-2021") => {
    const p = newProject(tmpl(templateId));
    p.designs.d1.frameId = frameId;
    p.designs.d1.frameOptions = opts;
    p.designs.d1.elements = [{ kind: "text", id: "t", x: 12, y: 12, width: 30, height: 10, text: "x", fontId: "sans", sizePt: 10, align: "left", color: "#000000", ...element }];
    return layoutProject(p, deps, { guides: false }).warnings;
  };

  it("yazı süse değince uyarır", () => expect(warningsFor(ORNAMENTS[0].id, { x: 0, y: 0 })).toContain("Yazı veya görsel çerçeve süsüne değiyor."));
  it("yazı içerideyse uyarmaz", () => expect(warningsFor(ORNAMENTS[0].id, {})).toEqual([]));
  it("düz çerçevede uyarmaz", () => expect(warningsFor("single", { x: 0, y: 0 })).toEqual([]));
  it("hücre içeriğinde süs uyarısı tek satırdır", () => {
    const p = newProject(tmpl("TW-2021"));
    p.designs.d1.frameId = ORNAMENTS[0].id;
    p.designs.d1.frameOptions = opts;
    p.designs.d1.elements = [{ kind: "text", id: "t", x: 0, y: 0, width: 30, height: 10, text: "x", fontId: "sans", sizePt: 10, align: "left", color: "#000000" }];
    (p.pages[0].zones[0] as any).content = { 0: { values: { t: "A" } }, 1: { values: { t: "B" } } };
    expect(layoutProject(p, deps, { guides: false }).warnings).toEqual(["Yazı veya görsel çerçeve süsüne değiyor."]);
  });
});

describe("çerçeve paneli", () => {
  const open = () => {
    const s = createStore(tmpl("TW-2021"), memoryStorage());
    const { container } = render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Çerçeve" }));
    return { s, container };
  };

  it("kategoriye göre süzer ve önizleme gösterir", () => {
    const { container } = open();
    fireEvent.change(screen.getByLabelText("Çerçeve türü"), { target: { value: "mutfak" } });
    const count = ORNAMENTS.filter((o) => o.category === "mutfak").length;
    expect(container.querySelectorAll(".frame-card")).toHaveLength(count);
    expect(container.querySelectorAll(".frame-card svg")).toHaveLength(count);
  });

  it("çerçeveyi uygular", () => {
    const { s } = open();
    fireEvent.change(screen.getByLabelText("Çerçeve türü"), { target: { value: ORNAMENTS[0].category } });
    fireEvent.click(screen.getByRole("button", { name: ORNAMENTS[0].name }));
    expect(activeDesign(s.getState()).frameId).toBe(ORNAMENTS[0].id);
  });
});

describe("renkli süs çerçeveleri", () => {
  const COLORED = ["o-berry-vine", "o-meadow", "o-wheat-double"];
  const colors = { strokeMm: 0.4, insetMm: 1, color: "#3B6D11", accent: "#C0322B" };
  const points = (d: string) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const frameOf = (id: string) => ORNAMENTS.find((o) => o.id === id)!;

  it("üç renkli çerçeve 'renkli' kategorisinde", () =>
    expect(ORNAMENTS.filter((o) => o.category === "renkli").map((o) => o.id)).toEqual(COLORED));

  it("vurgu parçaları vurgu rengiyle, diğerleri ana renkle dolar", () => {
    for (const id of COLORED) {
      const fills = new Set(ornamentLayout(frameOf(id), { width: 63.5, height: 38.1, shape: "rect" }, colors).ops.map((o) => o.fill ?? o.stroke?.color));
      expect(fills).toEqual(new Set(["#3B6D11", "#C0322B"]));
    }
  });

  it("vurgu rengi yoksa her şey ana renkte", () => {
    const { accent: _, ...plain } = colors;
    const fills = new Set(ornamentLayout(frameOf("o-berry-vine"), { width: 63.5, height: 38.1, shape: "rect" }, plain).ops.map((o) => o.fill ?? o.stroke?.color));
    expect(fills).toEqual(new Set(["#3B6D11"]));
  });

  it("dört etiket şeklinde etiket içinde kalır", () => {
    const shapes = [
      { width: 63.5, height: 38.1, shape: "rect" as const },
      { width: 63.5, height: 38.1, shape: "rounded" as const },
      { width: 60, height: 40, shape: "oval" as const },
      { width: 40, height: 40, shape: "circle" as const },
    ];
    for (const id of COLORED)
      for (const l of shapes) {
        const ops = ornamentLayout(frameOf(id), l, colors).ops;
        expect(ops.length).toBeGreaterThan(4);
        for (const [x, y] of ops.flatMap((o) => points(o.d))) {
          expect(x).toBeGreaterThanOrEqual(-0.01);
          expect(y).toBeGreaterThanOrEqual(-0.01);
          expect(x).toBeLessThanOrEqual(l.width + 0.01);
          expect(y).toBeLessThanOrEqual(l.height + 0.01);
        }
      }
  });

  it("hasAccent vurgulu çerçeveleri tanır", () => {
    expect(hasAccent("o-meadow")).toBe(true);
    expect(hasAccent("o-pearl")).toBe(false);
    expect(hasAccent("single")).toBe(false);
  });

  it("panelde renkli kategorisi üç kart gösterir", () => {
    const s = createStore(tmpl("TW-2021"), memoryStorage());
    const { container } = render(<LibraryPanel store={s} deps={deps} templates={[]} customSymbols={[]} onLibraryChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Çerçeve" }));
    fireEvent.change(screen.getByLabelText("Çerçeve türü"), { target: { value: "renkli" } });
    expect(container.querySelectorAll(".frame-card")).toHaveLength(3);
  });
});
