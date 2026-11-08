import { gridZones, pruneDesigns } from "./cells";
import type { GridZone, LabelProject, SymbolElement, TextElement } from "./document";

export type ListFillOptions = {
  /** Omitted when symbol suggestions are off. Returns a symbol id, or null when nothing matches. */
  suggest?: (line: string, sampleSymbolId: string) => string | null;
  cellCount: number;
  newId: () => string;
  label: { width: number; height: number };
};
export type ListFillReport = { filled: number; pagesAdded: number; unusedCells: number; noSymbol: number };
export type ListFillResult = { project: LabelProject; pageIndex: number; report: ListFillReport };

export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function centeredText(id: string, label: ListFillOptions["label"]): TextElement {
  const [width, height] = [label.width * 0.8, label.height * 0.5];
  return { kind: "text", id, x: (label.width - width) / 2, y: (label.height - height) / 2, width, height, text: "", fontId: "sans", sizePt: 12, align: "center", color: "#000000" };
}

export function applyListFill(source: LabelProject, pageIndex: number, lines: string[], options: ListFillOptions): ListFillResult {
  const project = structuredClone(source);
  const page = project.pages[pageIndex];
  const zone = page.zones.find((z): z is GridZone => z.kind === "grid");
  if (!zone) return { project, pageIndex, report: { filled: 0, pagesAdded: 0, unusedCells: 0, noSymbol: 0 } };

  const dropped = project.pages.filter((p) => p.fromList && p !== page);
  project.pages = project.pages.filter((p) => !dropped.includes(p));
  pruneDesigns(project, dropped.flatMap((p) => p.zones.flatMap((z) => (z.kind === "grid" ? Object.values(z.content).flatMap((e) => e.designId ?? []) : []))));

  const design = project.designs[zone.designId];
  let text = design.elements.find((e): e is TextElement => e.kind === "text");
  if (!text) {
    text = centeredText(options.newId(), options.label);
    design.elements.push(text);
  }
  const textId = text.id;
  const symbol = design.elements.find((e): e is SymbolElement => e.kind === "symbol");

  let noSymbol = 0;
  const write = (target: GridZone, cell: number, line: string) => {
    const entry = (target.content[cell] ??= { values: {} });
    entry.values[textId] = line;
    if (!symbol || !options.suggest) return;
    const match = options.suggest(line, symbol.symbolId);
    if (!match) noSymbol++;
    entry.values[symbol.id] = match ?? "";
  };

  const firstCells = [...(zone.listBase ?? zone.cells.used)].sort((a, b) => a - b);
  zone.listBase = firstCells;
  const onFirst = lines.slice(0, firstCells.length);
  onFirst.forEach((line, i) => write(zone, firstCells[i], line));
  for (const cell of firstCells.slice(onFirst.length)) {
    if (zone.content[cell]?.designId) zone.content[cell].values = {};
    else delete zone.content[cell];
  }
  zone.cells.used = firstCells.slice(0, onFirst.length);

  const rest = lines.slice(firstCells.length);
  const chunkSize = Math.max(options.cellCount, 1);
  const chunks = Array.from({ length: Math.ceil(rest.length / chunkSize) }, (_, i) => rest.slice(i * chunkSize, (i + 1) * chunkSize));
  for (const chunk of chunks) {
    const added: GridZone = { kind: "grid", templateId: zone.templateId, cells: { used: chunk.map((_, i) => i) }, designId: zone.designId, content: {} };
    chunk.forEach((line, i) => write(added, i, line));
    project.pages.push({ sheet: { ...page.sheet }, zones: [added], fromList: true });
  }

  const unusedCells = chunks.length ? chunkSize - chunks.at(-1)!.length : firstCells.length - onFirst.length;
  return { project, pageIndex: project.pages.indexOf(page), report: { filled: lines.length, pagesAdded: chunks.length, unusedCells, noSymbol } };
}

export function previewListFill(project: LabelProject, pageIndex: number, lines: string[], options: ListFillOptions): ListFillReport {
  return applyListFill(project, pageIndex, lines, options).report;
}

/** True when a new fill would replace pages or overwrite cell values. */
export function fillWouldReplace(project: LabelProject): boolean {
  return project.pages.some((p) => p.fromList) || gridZones(project).some((z) => Object.keys(z.content).length > 0);
}
