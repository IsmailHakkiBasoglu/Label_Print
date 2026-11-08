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
  const offsetOk = typeof value.printOffset?.x === "number" && typeof value.printOffset?.y === "number";
  const pagesOk = Array.isArray(value.pages) && value.pages.every((p: any) => p?.sheet && Array.isArray(p.zones));
  if (!offsetOk || !pagesOk || typeof value.designs !== "object" || value.designs === null) {
    return { ok: false, error: "Dosya bozuk: gerekli alanlar eksik." };
  }
  return { ok: true, project: value as LabelProject };
}
