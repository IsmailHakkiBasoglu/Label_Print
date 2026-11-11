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

const v2 = (content: unknown) => {
  const project: any = newProject(template);
  project.pages[0].zones[0].content = content;
  return project;
};

const v1 = (designIds: string[], used = [0, 1, 2]) => ({
  version: 1,
  pages: [{ sheet: { width: 210, height: 297 }, zones: [{ kind: "grid", templateId: "T", cells: { used }, designIds }] }],
  designs: Object.fromEntries(designIds.map((id) => [id, { elements: [] }])),
  printOffset: { x: 0, y: 0 },
});

describe("sürüm 1 dosyaları", () => {
  it("tek tasarımı ortak tasarıma çevirir", () => {
    const result = parseProject(JSON.stringify(v1(["d1"])));
    if (!result.ok) throw new Error(result.error);
    expect(result.project.version).toBe(2);
    expect(result.project.pages[0].zones[0]).toMatchObject({ designId: "d1", content: {} });
    expect(result.project.pages[0].zones[0]).not.toHaveProperty("designIds");
    expect(result.project.images).toEqual({});
  });

  it("döngüsel tasarımları ayrılmış hücreye çevirir", () => {
    const result = parseProject(JSON.stringify(v1(["a", "b"])));
    if (!result.ok) throw new Error(result.error);
    expect(result.project.pages[0].zones[0]).toMatchObject({ designId: "a", content: { 1: { values: {}, designId: "b" } } });
    const zone: any = result.project.pages[0].zones[0];
    expect(Object.keys(zone.content)).toEqual(["1"]);
  });
});

describe("newProject", () => {
  it("creates a version 2 project with one shared design", () => {
    const project = newProject(template);
    expect(project.version).toBe(2);
    expect(project.pages[0].zones[0]).toMatchObject({ designId: "d1", content: {} });
    expect(project.images).toEqual({});
  });

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
    ["newer version", JSON.stringify({ ...newProject(template), version: 3 })],
    ["missing pages", JSON.stringify({ version: 1, designs: {}, printOffset: { x: 0, y: 0 } })],
    ["bad cell values", JSON.stringify(v2({ x: { values: 3 } }))],
    ["bad cell index", JSON.stringify(v2({ "-1": { values: {} } }))],
    ["non-text cell value", JSON.stringify(v2({ 0: { values: { t: 5 } } }))],
    ["bad offset", JSON.stringify({ ...newProject(template), printOffset: { x: "a", y: 0 } })],
  ])("rejects %s with a Turkish message", (_, text) => {
    const result = parseProject(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/dosya|sürüm/i);
  });
});

describe("kod öğesi", () => {
  const withCode = (extra: Record<string, unknown> = {}) => {
    const project: any = newProject(template);
    project.designs.d1.elements = [{ kind: "code", id: "k", x: 1, y: 1, width: 20, height: 20, format: "qr", value: "Mısır", showText: false, color: "#000000", ...extra }];
    return JSON.stringify(project);
  };
  it("kod öğesini kabul eder", () => expect(parseProject(withCode()).ok).toBe(true));
  it("bilinmeyen kod türünü reddeder", () => expect(parseProject(withCode({ format: "pdf417" })).ok).toBe(false));
  it("hatalı showText'i reddeder", () => expect(parseProject(withCode({ showText: "evet" })).ok).toBe(false));
});

describe("çerçeve renkleri", () => {
  const withFrame = (frameOptions: Record<string, unknown>) => {
    const project: any = newProject(template);
    project.designs.d1.frameId = "o-meadow";
    project.designs.d1.frameOptions = { strokeMm: 0.4, insetMm: 1, color: "#3B6D11", ...frameOptions };
    return JSON.stringify(project);
  };
  it("vurgu ve zemin rengini kabul eder", () => expect(parseProject(withFrame({ accent: "#C0322B", background: "#E2C79C" })).ok).toBe(true));
  it("metin olmayan vurgu rengini reddeder", () => expect(parseProject(withFrame({ accent: 5 })).ok).toBe(false));
  it("metin olmayan zemini reddeder", () => expect(parseProject(withFrame({ background: null })).ok).toBe(false));
});
