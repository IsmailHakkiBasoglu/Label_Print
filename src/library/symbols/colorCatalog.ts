import type { SymbolEntry } from "./search";

/** Loaded on demand so that the colour artwork stays out of the main bundle. */
export async function loadColorCatalog(): Promise<SymbolEntry[]> {
  return (await import("./catalog.color.generated.json")).default as SymbolEntry[];
}
