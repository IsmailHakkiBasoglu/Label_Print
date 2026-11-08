import type { Template } from "./templates";

export type FontId = "sans" | "sans-bold" | "serif" | "serif-bold";

export type TextElement = {
  kind: "text";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontId: FontId;
  sizePt: number;
  align: "left" | "center" | "right";
  color: string;
};

export type SymbolElement = {
  kind: "symbol";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  symbolId: string;
  color: string;
};

export type DesignElement = TextElement | SymbolElement;
export type FrameOptions = { strokeMm: number; insetMm: number; color: string };
export type LabelDesign = { frameId?: string; frameOptions?: FrameOptions; elements: DesignElement[] };
export type CellSelection = { used: number[] };

export type Zone =
  | { kind: "grid"; templateId: string; cells: CellSelection; designIds: string[] }
  | { kind: "free"; x: number; y: number; width: number; height: number; design: LabelDesign };

export type Page = { sheet: { width: number; height: number }; zones: Zone[] };

export type LabelProject = {
  version: 1;
  pages: Page[];
  designs: Record<string, LabelDesign>;
  printOffset: { x: number; y: number };
};

const FONT_IDS = ["sans", "sans-bold", "serif", "serif-bold"];
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBox = (v: any) => isNumber(v?.x) && isNumber(v.y) && isNumber(v.width) && v.width > 0 && isNumber(v.height) && v.height > 0;

function isElement(e: any): boolean {
  if (!isBox(e) || typeof e.id !== "string" || typeof e.color !== "string") return false;
  if (e.kind === "symbol") return typeof e.symbolId === "string";
  return e.kind === "text" && typeof e.text === "string" && FONT_IDS.includes(e.fontId) && isNumber(e.sizePt) && e.sizePt > 0 && ["left", "center", "right"].includes(e.align);
}

function isDesign(d: any): boolean {
  if (!Array.isArray(d?.elements) || !d.elements.every(isElement)) return false;
  const o = d.frameOptions;
  return (d.frameId === undefined || typeof d.frameId === "string") && (o === undefined || (isNumber(o.strokeMm) && o.strokeMm > 0 && isNumber(o.insetMm) && typeof o.color === "string"));
}

function isZone(z: any): boolean {
  if (z?.kind === "free") return isBox(z) && isDesign(z.design);
  return (
    z?.kind === "grid" &&
    typeof z.templateId === "string" &&
    Array.isArray(z.cells?.used) &&
    z.cells.used.every(Number.isInteger) &&
    Array.isArray(z.designIds) &&
    z.designIds.length > 0 &&
    z.designIds.every((id: unknown) => typeof id === "string")
  );
}

const isPage = (p: any) => isNumber(p?.sheet?.width) && p.sheet.width > 0 && isNumber(p.sheet.height) && p.sheet.height > 0 && Array.isArray(p.zones) && p.zones.every(isZone);

export function newProject(template: Template): LabelProject {
  const count = template.grid.columns * template.grid.rows;
  return {
    version: 1,
    pages: [
      {
        sheet: { ...template.sheet },
        zones: [{ kind: "grid", templateId: template.id, cells: { used: Array.from({ length: count }, (_, i) => i) }, designIds: ["d1"] }],
      },
    ],
    designs: { d1: { elements: [] } },
    printOffset: { x: 0, y: 0 },
  };
}

export function serialize(project: LabelProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(text: string): { ok: true; project: LabelProject } | { ok: false; error: string } {
  let value: any;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "Dosya okunamadı: geçerli bir Label Print dosyası değil." };
  }
  if (value?.version !== 1) return { ok: false, error: "Bu dosya sürümü desteklenmiyor." };
  const valid =
    isNumber(value.printOffset?.x) &&
    isNumber(value.printOffset?.y) &&
    Array.isArray(value.pages) &&
    value.pages.length > 0 &&
    value.pages.every(isPage) &&
    typeof value.designs === "object" &&
    value.designs !== null &&
    Object.values(value.designs).every(isDesign);
  if (!valid) return { ok: false, error: "Dosya bozuk: gerekli alanlar eksik veya hatalı." };
  return { ok: true, project: value as LabelProject };
}
