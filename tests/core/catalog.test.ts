import { describe, expect, it } from "vitest";
import { tanexTemplates } from "../../src/core/catalog";
import { validateTemplate } from "../../src/core/templates";

describe("Tanex catalog", () => {
  it("has every template on the page", () => expect(tanexTemplates).toHaveLength(159));

  it("has unique ids", () => expect(new Set(tanexTemplates.map((t) => t.id)).size).toBe(159));

  it("only verifies templates that fit their sheet", () => {
    for (const t of tanexTemplates.filter((x) => x.status === "verified")) expect(validateTemplate(t), t.id).toEqual([]);
  });

  it("explains every template that needs checking", () => {
    for (const t of tanexTemplates.filter((x) => x.status === "check")) expect(t.notes?.length, t.id).toBeGreaterThan(0);
  });

  it("holds TW-2021 from its Word file", () => {
    const t = tanexTemplates.find((x) => x.id === "TW-2021")!;
    expect(t.status).toBe("verified");
    expect([t.grid.columns, t.grid.rows]).toEqual([3, 7]);
    expect(t.grid.gapX).toBeCloseTo(3.02, 1);
    expect(t.grid.marginTop).toBeCloseTo(15.2, 1);
  });

  it("marks the known page inconsistencies", () => {
    expect(tanexTemplates.find((x) => x.id === "TW-2163")!.status).toBe("check");
    expect(tanexTemplates.find((x) => x.id === "TW-2030")!.status).toBe("check");
  });

  it("reads round shapes from the name", () => {
    expect(tanexTemplates.find((x) => x.id === "TW-2130")!.label.shape).toBe("circle");
    expect(tanexTemplates.find((x) => x.id === "TW-2148")!.label.shape).toBe("oval");
  });
});
