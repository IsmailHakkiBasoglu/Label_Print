import { safeRead, safeWrite, type StorageLike } from "../../core/storage";
import type { SymbolEntry } from "./search";
import { parseSvg } from "./svg";

const KEY = "labelprint.symbols.v1";
const HEX = /^#[0-9a-f]{6}$/;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isPath(p: any): boolean {
  return (
    typeof p?.d === "string" &&
    typeof p.fill === "boolean" &&
    finite(p.strokeWidth) &&
    (p.fillColor === undefined || (typeof p.fillColor === "string" && HEX.test(p.fillColor))) &&
    (p.strokeColor === undefined || (typeof p.strokeColor === "string" && HEX.test(p.strokeColor)))
  );
}

/** Custom symbols arrive from project files and live on in storage, so every field is checked. */
function isEntry(e: any): e is SymbolEntry {
  const box = e?.icon?.viewBox;
  return (
    typeof e?.id === "string" &&
    e.id.startsWith("custom-") &&
    typeof e.category === "string" &&
    Array.isArray(e.tags) &&
    e.tags.every((t: unknown) => typeof t === "string") &&
    Array.isArray(box) &&
    box.length === 4 &&
    box.every(finite) &&
    box[2] > 0 &&
    box[3] > 0 &&
    Array.isArray(e.icon.paths) &&
    e.icon.paths.every(isPath)
  );
}

export function loadCustomSymbols(storage: StorageLike): SymbolEntry[] {
  try {
    const value = JSON.parse(safeRead(storage, KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Adds the custom symbols a project file brought with it. Known ids are kept. Returns false when they could not be stored. */
export function mergeCustomSymbols(entries: unknown[], storage: StorageLike): boolean {
  const existing = loadCustomSymbols(storage);
  const known = new Set(existing.map((s) => s.id));
  const added = entries.filter(isEntry).filter((e) => !known.has(e.id));
  return added.length === 0 || safeWrite(storage, KEY, JSON.stringify([...existing, ...added]));
}

export function importCustomSymbol(svg: string, name: string, storage: StorageLike): SymbolEntry | { error: string } {
  const icon = parseSvg(svg);
  if ("error" in icon) return icon;
  const existing = loadCustomSymbols(storage);
  const entry: SymbolEntry = { id: `custom-${existing.length + 1}-${Date.now()}`, category: "Benim", tags: [name], icon };
  if (!safeWrite(storage, KEY, JSON.stringify([...existing, entry]))) return { error: "Sembol kaydedilemedi: tarayıcı depolaması dolu veya kapalı." };
  return entry;
}
