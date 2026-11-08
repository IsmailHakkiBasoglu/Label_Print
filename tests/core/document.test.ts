import { describe, expect, it } from "vitest";
import { newProject, parseProject, serialize } from "../../src/core/document";
import type { Template } from "../../src/core/templates";

const template: Template = {
  id: "T",
  name: "T",
  sheet: { width: 210, height: 297 },
  grid: { columns: 2, rows: 3, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  label: { width: 50, height: 30, shape: "rect" },
  source: "custom",
  status: "verified",
};

describe("newProject", () => {
  it("uses every label by default", () => {
    const zone = newProject(template).pages[0].zones[0];
    expect(zone.kind === "grid" && zone.cells.used).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("serialize / parseProject", () => {
  it("round-trips a project", () => {
    const project = newProject(template);
    expect(parseProject(serialize(project))).toEqual({ ok: true, project });
  });

  it.each([
    ["broken json", "{"],
    ["newer version", JSON.stringify({ ...newProject(template), version: 2 })],
    ["missing pages", JSON.stringify({ version: 1, designs: {}, printOffset: { x: 0, y: 0 } })],
    ["bad offset", JSON.stringify({ ...newProject(template), printOffset: { x: "a", y: 0 } })],
  ])("rejects %s with a Turkish message", (_, text) => {
    const result = parseProject(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/dosya|sürüm/i);
  });
});
