import { gridZones } from "./cells";
import { parseProject, serialize, type LabelProject } from "./document";
import type { ImageStore } from "./imageStore";
import type { StorageLike } from "./storage";
import { mergeCustomSymbols } from "../library/symbols/custom";
import type { SymbolEntry } from "../library/symbols/search";

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function usedSymbolIds(project: LabelProject): Set<string> {
  const designs = [...Object.values(project.designs), ...project.pages.flatMap((p) => p.zones.flatMap((z) => (z.kind === "free" ? [z.design] : [])))];
  const fromDesigns = designs.flatMap((d) => d.elements.flatMap((e) => (e.kind === "symbol" ? [e.symbolId] : [])));
  const fromCells = gridZones(project).flatMap((z) => Object.values(z.content).flatMap((c) => Object.values(c.values)));
  return new Set([...fromDesigns, ...fromCells]);
}

/** The saved file carries its pictures, so it can be moved to another computer. */
export async function exportProject(project: LabelProject, deps: { images?: ImageStore; customSymbols: SymbolEntry[] }): Promise<string> {
  const imageData: Record<string, string> = {};
  for (const id of Object.keys(project.images)) {
    const bytes = await deps.images?.get(id);
    if (bytes) imageData[id] = toBase64(bytes);
  }
  const used = usedSymbolIds(project);
  const symbolData = deps.customSymbols.filter((s) => used.has(s.id));
  return JSON.stringify({ ...JSON.parse(serialize(project)), imageData, symbolData }, null, 2);
}

export type ImportResult = { ok: true; project: LabelProject; warnings: string[] } | { ok: false; error: string };

export async function importProject(text: string, deps: { images?: ImageStore; storage: StorageLike }): Promise<ImportResult> {
  const parsed = parseProject(text);
  if (!parsed.ok) return parsed;
  const { imageData = {}, symbolData = [] } = JSON.parse(text);
  const damaged: ImportResult = { ok: false, error: "Dosya bozuk: gerekli alanlar eksik veya hatalı." };
  if (typeof imageData !== "object" || imageData === null || !Object.values(imageData).every((v) => typeof v === "string") || !Array.isArray(symbolData)) return damaged;

  const project = parsed.project as LabelProject & { imageData?: unknown; symbolData?: unknown };
  delete project.imageData;
  delete project.symbolData;

  const warnings: string[] = [];
  for (const [id, meta] of Object.entries(project.images)) {
    if (typeof imageData[id] !== "string") {
      if (!(await deps.images?.get(id))) warnings.push(`"${meta.name}" görseli dosyada yok; yeniden yükleyin.`);
      continue;
    }
    try {
      await deps.images?.put(id, fromBase64(imageData[id]));
    } catch {
      warnings.push(`"${meta.name}" görseli tarayıcıya kaydedilemedi.`);
    }
  }
  if (!mergeCustomSymbols(symbolData, deps.storage)) warnings.push("Dosyadaki özel semboller tarayıcıya kaydedilemedi.");
  return { ok: true, project, warnings };
}
