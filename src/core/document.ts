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

/** `values` maps an element id to the text or image shown in this cell; `designId` detaches the cell from the shared design. */
export type CellEntry = { values: Record<string, string>; designId?: string };

export type GridZone = { kind: "grid"; templateId: string; cells: CellSelection; designId: string; content: Record<number, CellEntry> };
export type FreeZone = { kind: "free"; x: number; y: number; width: number; height: number; design: LabelDesign };
export type Zone = GridZone | FreeZone;

/** `fromList` marks a page opened by a list fill, so that a later fill can replace it. */
export type Page = { sheet: { width: number; height: number }; zones: Zone[]; fromList?: boolean };

export type ImageMeta = { name: string; mime: "image/png" | "image/jpeg"; widthPx: number; heightPx: number };

export type LabelProject = {
  version: 2;
  pages: Page[];
  designs: Record<string, LabelDesign>;
  images: Record<string, ImageMeta>;
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFreeZone = (z: any) => z?.kind === "free" && isBox(z) && isDesign(z.design);
const isGridBase = (z: any) => z?.kind === "grid" && typeof z.templateId === "string" && Array.isArray(z.cells?.used) && z.cells.used.every(Number.isInteger);

function isCellEntry(e: any): boolean {
  return isRecord(e?.values) && Object.values(e.values).every((v) => typeof v === "string") && (e.designId === undefined || typeof e.designId === "string");
}

function isZone(z: any): boolean {
  if (z?.kind === "free") return isFreeZone(z);
  return isGridBase(z) && typeof z.designId === "string" && isRecord(z.content) && Object.entries(z.content).every(([k, e]) => /^\d+$/.test(k) && isCellEntry(e));
}

const isZoneV1 = (z: any) => isFreeZone(z) || (isGridBase(z) && Array.isArray(z.designIds) && z.designIds.length > 0 && z.designIds.every((id: unknown) => typeof id === "string"));

const isPageWith = (zone: (z: any) => boolean) => (p: any) => isNumber(p?.sheet?.width) && p.sheet.width > 0 && isNumber(p.sheet.height) && p.sheet.height > 0 && Array.isArray(p.zones) && p.zones.every(zone);

const isMeta = (m: any) => typeof m?.name === "string" && ["image/png", "image/jpeg"].includes(m.mime) && isNumber(m.widthPx) && m.widthPx > 0 && isNumber(m.heightPx) && m.heightPx > 0;

function hasCommonFields(value: any, zone: (z: any) => boolean): boolean {
  return (
    isNumber(value.printOffset?.x) &&
    isNumber(value.printOffset?.y) &&
    Array.isArray(value.pages) &&
    value.pages.length > 0 &&
    value.pages.every(isPageWith(zone)) &&
    isRecord(value.designs) &&
    Object.values(value.designs).every(isDesign)
  );
}

/** A v1 grid cycled through `designIds`; cells that landed on another design become detached, so printing is unchanged. */
export function migrateV1(value: any): LabelProject {
  const migrateZone = (zone: any): Zone => {
    if (zone.kind === "free") return zone;
    const { designIds, ...rest } = zone;
    const content: Record<number, CellEntry> = {};
    for (const cell of zone.cells.used as number[]) {
      const id = designIds[cell % designIds.length];
      if (id !== designIds[0]) content[cell] = { values: {}, designId: id };
    }
    return { ...rest, designId: designIds[0], content };
  };
  return {
    version: 2,
    pages: value.pages.map((p: any) => ({ ...p, zones: p.zones.map(migrateZone) })),
    designs: value.designs,
    images: {},
    printOffset: value.printOffset,
  };
}

export function newProject(template: Template): LabelProject {
  const count = template.grid.columns * template.grid.rows;
  return {
    version: 2,
    pages: [
      {
        sheet: { ...template.sheet },
        zones: [{ kind: "grid", templateId: template.id, cells: { used: Array.from({ length: count }, (_, i) => i) }, designId: "d1", content: {} }],
      },
    ],
    designs: { d1: { elements: [] } },
    images: {},
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
  if (value?.version !== 1 && value?.version !== 2) return { ok: false, error: "Bu dosya sürümü desteklenmiyor." };
  const damaged = { ok: false as const, error: "Dosya bozuk: gerekli alanlar eksik veya hatalı." };
  if (value.version === 1) return hasCommonFields(value, isZoneV1) ? { ok: true, project: migrateV1(value) } : damaged;
  if (!hasCommonFields(value, isZone) || !isRecord(value.images) || !Object.values(value.images).every(isMeta)) return damaged;
  return { ok: true, project: value as LabelProject };
}
