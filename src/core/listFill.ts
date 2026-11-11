import { gridZones, pruneDesigns } from "./cells";
import { encodeCode, isCodeError } from "./codes";
import type { CodeElement, DesignElement, GridZone, LabelProject, SymbolElement, TextElement } from "./document";

export type ListFillOptions = {
  /** Omitted when symbol suggestions are off. Returns a symbol id, or null when nothing matches. */
  suggest?: (line: string, sampleSymbolId: string) => string | null;
  cellCount: number;
  newId: () => string;
  label: { width: number; height: number };
};
/** `badCodes` counts labels whose code could not be made; `firstBadCode.row` is 1-based in the filled rows. */
export type ListFillReport = {
  filled: number;
  pagesAdded: number;
  unusedCells: number;
  noSymbol: number;
  badCodes: number;
  firstBadCode?: { row: number; error: string };
};
export type ListFillResult = { project: LabelProject; pageIndex: number; report: ListFillReport };
/**
 * One label's values. `texts[i]` goes to the design's i-th text element; null leaves that element shared.
 * `codes[i]` goes to the i-th code element the same way.
 * `key` is what a symbol suggestion searches for; empty means no symbol on this label.
 */
export type FillRow = { texts: (string | null)[]; codes?: (string | null)[]; key: string };

/** Picks the mapped columns of each table row; rows whose mapped cells are all empty are skipped. */
export function rowsFromTable(table: { rows: string[][] }, textColumns: (number | null)[], keyColumn: number | null, codeColumns: (number | null)[] = []): FillRow[] {
  const cell = (row: string[], column: number | null) => (column === null ? null : (row[column] ?? ""));
  return table.rows
    .map((row) => ({ texts: textColumns.map((c) => cell(row, c)), codes: codeColumns.map((c) => cell(row, c)), key: cell(row, keyColumn) ?? "" }))
    .filter((r) => r.key || r.texts.some(Boolean) || r.codes.some(Boolean));
}

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
  return applyTableFill(source, pageIndex, lines.map((line) => ({ texts: [line], key: line })), options);
}

export function applyTableFill(source: LabelProject, pageIndex: number, rows: FillRow[], options: ListFillOptions): ListFillResult {
  const project = structuredClone(source);
  const page = project.pages[pageIndex];
  const zone = page.zones.find((z): z is GridZone => z.kind === "grid");
  if (!zone) return { project, pageIndex, report: { filled: 0, pagesAdded: 0, unusedCells: 0, noSymbol: 0, badCodes: 0 } };

  const dropped = project.pages.filter((p) => p.fromList && p !== page);
  project.pages = project.pages.filter((p) => !dropped.includes(p));
  pruneDesigns(project, dropped.flatMap((p) => p.zones.flatMap((z) => (z.kind === "grid" ? Object.values(z.content).flatMap((e) => e.designId ?? []) : []))));

  const design = project.designs[zone.designId];
  // A design with only codes takes the list into its codes; anything else needs a text to show the list.
  if (!design.elements.some((e) => e.kind === "text" || e.kind === "code")) design.elements.push(centeredText(options.newId(), options.label));
  const textIds = (elements: typeof design.elements) => elements.filter((e) => e.kind === "text").map((e) => e.id);
  const sharedTexts = textIds(design.elements);
  const symbol = design.elements.find((e): e is SymbolElement => e.kind === "symbol");
  const codesOf = (elements: DesignElement[]) => elements.filter((e): e is CodeElement => e.kind === "code");
  const sharedCodes = codesOf(design.elements);

  let noSymbol = 0;
  let badCodes = 0;
  let firstBadCode: ListFillReport["firstBadCode"];
  let rowNumber = 0;
  const write = (target: GridZone, cell: number, row: FillRow) => {
    rowNumber++;
    const entry = (target.content[cell] ??= { values: {} });
    // A detached cell has its own elements, which may carry other ids than the shared ones; they match by order.
    const own = entry.designId ? project.designs[entry.designId] : undefined;
    const ownTexts = own ? textIds(own.elements) : sharedTexts;
    const ownSymbol = own ? own.elements.find((e): e is SymbolElement => e.kind === "symbol") : symbol;
    row.texts.forEach((value, i) => {
      if (value !== null && ownTexts[i]) entry.values[ownTexts[i]] = value;
    });
    const ownCodes = own ? codesOf(own.elements) : sharedCodes;
    let error: string | undefined;
    (row.codes ?? []).forEach((value, i) => {
      if (value === null || !ownCodes[i]) return;
      entry.values[ownCodes[i].id] = value;
      const result = encodeCode(ownCodes[i].format, value);
      if (isCodeError(result)) error ??= result.error;
    });
    if (error) {
      badCodes++;
      firstBadCode ??= { row: rowNumber, error };
    }
    if (!ownSymbol || !options.suggest) return;
    const match = row.key ? options.suggest(row.key, ownSymbol.symbolId) : null;
    if (row.key && !match) noSymbol++;
    entry.values[ownSymbol.id] = match ?? "";
  };

  const firstCells = [...(zone.listBase ?? zone.cells.used)].sort((a, b) => a - b);
  zone.listBase = firstCells;
  const onFirst = rows.slice(0, firstCells.length);
  onFirst.forEach((row, i) => write(zone, firstCells[i], row));
  for (const cell of firstCells.slice(onFirst.length)) {
    if (zone.content[cell]?.designId) zone.content[cell].values = {};
    else delete zone.content[cell];
  }
  zone.cells.used = firstCells.slice(0, onFirst.length);

  const rest = rows.slice(firstCells.length);
  const chunkSize = Math.max(options.cellCount, 1);
  const chunks = Array.from({ length: Math.ceil(rest.length / chunkSize) }, (_, i) => rest.slice(i * chunkSize, (i + 1) * chunkSize));
  for (const chunk of chunks) {
    const added: GridZone = { kind: "grid", templateId: zone.templateId, cells: { used: chunk.map((_, i) => i) }, designId: zone.designId, content: {} };
    chunk.forEach((row, i) => write(added, i, row));
    project.pages.push({ sheet: { ...page.sheet }, zones: [added], fromList: true });
  }

  const unusedCells = chunks.length ? chunkSize - chunks.at(-1)!.length : firstCells.length - onFirst.length;
  return { project, pageIndex: project.pages.indexOf(page), report: { filled: rows.length, pagesAdded: chunks.length, unusedCells, noSymbol, badCodes, ...(firstBadCode ? { firstBadCode } : {}) } };
}

export function previewListFill(project: LabelProject, pageIndex: number, lines: string[], options: ListFillOptions): ListFillReport {
  return applyListFill(project, pageIndex, lines, options).report;
}

export function previewTableFill(project: LabelProject, pageIndex: number, rows: FillRow[], options: ListFillOptions): ListFillReport {
  return applyTableFill(project, pageIndex, rows, options).report;
}

/** True when a new fill would replace pages or overwrite cell values. */
export function fillWouldReplace(project: LabelProject): boolean {
  return project.pages.some((p) => p.fromList) || gridZones(project).some((z) => Object.keys(z.content).length > 0);
}
