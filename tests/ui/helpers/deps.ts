import { readFileSync } from "node:fs";
import { tanexTemplates } from "../../../src/core/catalog";
import { createFontTools, FONT_FILES, type FontBytes } from "../../../src/render/fonts";
import type { RenderDeps } from "../../../src/render/pdf";
import { catalog } from "../../../src/library/symbols/search";

const fontBytes = Object.fromEntries(Object.entries(FONT_FILES).map(([id, f]) => [id, new Uint8Array(readFileSync(`public/fonts/${f}`))])) as FontBytes;

export const deps: RenderDeps = {
  templates: (id) => tanexTemplates.find((t) => t.id === id),
  symbols: (id) => catalog.find((s) => s.id === id),
  tools: createFontTools(fontBytes),
  fontBytes,
};

export const tmpl = (id: string) => tanexTemplates.find((t) => t.id === id)!;

export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}
