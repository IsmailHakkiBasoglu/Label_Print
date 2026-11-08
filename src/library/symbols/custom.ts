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

export function importCustomSymbol(svg: string, name: string, storage: StorageLike): SymbolEntry | { error: string } {
  const icon = parseSvg(svg);
  if ("error" in icon) return icon;
  const existing = loadCustomSymbols(storage);
  const entry: SymbolEntry = { id: `custom-${existing.length + 1}-${Date.now()}`, category: "Benim", tags: [name], icon };
  safeWrite(storage, KEY, JSON.stringify([...existing, entry]));
  return entry;
}
