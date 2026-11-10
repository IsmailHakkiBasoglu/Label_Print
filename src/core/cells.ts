import type { DesignElement, GridZone, LabelDesign, LabelProject } from "./document";

function applyValue(element: DesignElement, value: string | undefined): DesignElement | null {
  if (value === undefined) return element;
  if (value === "") return null;
  return withValue(element, value);
}

/** The element showing `value` instead of its own text, picture or code content. */
export function withValue(element: DesignElement, value: string): DesignElement {
  if (element.kind === "text") return { ...element, text: value };
  if (element.kind === "code") return { ...element, value };
  return { ...element, symbolId: value };
}

/** The design one cell prints: its own or the shared one, with the cell's values applied. Empty values hide their element. */
export function resolveCellDesign(zone: GridZone, index: number, designs: Record<string, LabelDesign>): LabelDesign | undefined {
  const entry = zone.content[index];
  const design = designs[entry?.designId ?? zone.designId];
  if (!design || !entry) return design;
  return { ...design, elements: design.elements.flatMap((e) => applyValue(e, entry.values[e.id]) ?? []) };
}

export function gridZones(project: LabelProject): GridZone[] {
  return project.pages.flatMap((p) => p.zones.filter((z): z is GridZone => z.kind === "grid"));
}

/** Removes designs that only detached cells used and that no cell refers to any more. */
export function pruneDesigns(project: LabelProject, candidates: Iterable<string>): void {
  const used = new Set(gridZones(project).flatMap((z) => [z.designId, ...Object.values(z.content).flatMap((e) => e.designId ?? [])]));
  for (const id of candidates) if (!used.has(id)) delete project.designs[id];
}
