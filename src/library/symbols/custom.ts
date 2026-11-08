import { safeRead, safeWrite, type StorageLike } from "../../core/storage";
import type { SymbolEntry } from "./search";
import { parseSvg } from "./svg";

const KEY = "labelprint.symbols.v1";

export function loadCustomSymbols(storage: StorageLike): SymbolEntry[] {
  try {
    const value = JSON.parse(safeRead(storage, KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const isEntry = (e: any): e is SymbolEntry => typeof e?.id === "string" && e.id.startsWith("custom-") && Array.isArray(e.tags) && Array.isArray(e.icon?.paths) && Array.isArray(e.icon?.viewBox);

/** Adds the custom symbols a project file brought with it. Known ids are kept as they are. */
export function mergeCustomSymbols(entries: unknown[], storage: StorageLike): void {
  const existing = loadCustomSymbols(storage);
  const known = new Set(existing.map((s) => s.id));
  const added = entries.filter(isEntry).filter((e) => !known.has(e.id));
  if (added.length) safeWrite(storage, KEY, JSON.stringify([...existing, ...added]));
}

export function importCustomSymbol(svg: string, name: string, storage: StorageLike): SymbolEntry | { error: string } {
  const icon = parseSvg(svg);
  if ("error" in icon) return icon;
  const existing = loadCustomSymbols(storage);
  const entry: SymbolEntry = { id: `custom-${existing.length + 1}-${Date.now()}`, category: "Benim", tags: [name], icon };
  safeWrite(storage, KEY, JSON.stringify([...existing, entry]));
  return entry;
}
