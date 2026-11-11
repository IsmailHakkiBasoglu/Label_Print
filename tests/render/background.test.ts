import { describe, expect, it } from "vitest";
import { newProject, type LabelDesign, type TextElement } from "../../src/core/document";
import { designTouchesBand, frameMargin, layoutDesign } from "../../src/render/layout";
import { renderPdf } from "../../src/render/pdf";
import { deps, tmpl } from "../ui/helpers/deps";

const text: TextElement = { kind: "text", id: "t", x: 5, y: 5, width: 50, height: 10, text: "Bulgur", fontId: "sans", sizePt: 12, align: "center", color: "#412402" };
const rect = { width: 63.5, height: 38.1, shape: "rect" as const };
const options = (extra = {}) => ({ strokeMm: 0.4, insetMm: 1, color: "#412402", ...extra });
const nums = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe("zemin rengi", () => {
  it("zemin ilk op olarak iç boşluk kadar içeride çizilir", () => {
    const ops = layoutDesign({ frameId: "single", frameOptions: options({ background: "#E2C79C" }), elements: [text] }, rect, deps);
    expect(ops[0]).toMatchObject({ kind: "path", fill: "#E2C79C" });
    expect(nums((ops[0] as { d: string }).d)).toEqual([1, 1, 62.5, 37.1, 1]);
  });

  it("zemin yoksa çizilmez", () => {
    const ops = layoutDesign({ frameId: "single", frameOptions: options(), elements: [text] }, rect, deps);
    expect(ops.some((op) => op.kind === "path" && op.fill === "#E2C79C")).toBe(false);
  });

  it("çerçevesiz zemin çalışır, kenar payı ve süs uyarısı yok", () => {
    const design: LabelDesign = { frameOptions: options({ background: "#E2C79C" }), elements: [text] };
    expect(layoutDesign(design, rect, deps)[0]).toMatchObject({ fill: "#E2C79C" });
    expect(frameMargin(design, rect)).toBe(0);
    expect(designTouchesBand(design, rect)).toBe(false);
  });

  it("oval etikette zemin elipstir", () => {
    const ops = layoutDesign({ frameOptions: options({ background: "#E2C79C" }), elements: [] }, { width: 60, height: 40, shape: "oval" }, deps);
    expect((ops[0] as { d: string }).d).toContain("A");
  });

  it("zeminli etiketin PDF'i üretilir", async () => {
    const project = newProject(tmpl("TW-2021"));
    project.designs.d1 = { frameId: "o-wheat-double", frameOptions: options({ accent: "#854F0B", background: "#E2C79C" }), elements: [text] };
    expect((await renderPdf(project, deps, { guides: false })).ok).toBe(true);
  });
});
