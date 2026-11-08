import { safeRead, safeWrite, type StorageLike } from "./storage";
import { validateTemplate, type Template } from "./templates";

const KEY = "labelprint.templates.v1";

export function loadCustom(storage: StorageLike): Template[] {
  try {
    const value = JSON.parse(safeRead(storage, KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveCustom(template: Template, storage: StorageLike): void {
  safeWrite(storage, KEY, JSON.stringify([...loadCustom(storage), template]));
}

export function exportCustom(storage: StorageLike): string {
  return JSON.stringify(loadCustom(storage), null, 2);
}

export function searchTemplates(query: string, templates: Template[]): Template[] {
  const tokens = query.toLocaleLowerCase("tr").replace(/,/g, ".").split(/\s+/).filter(Boolean);
  return templates.filter((t) => {
    const text = `${t.id} ${t.name} ${t.label.width}x${t.label.height}`.toLocaleLowerCase("tr");
    return tokens.every((token) => text.includes(token));
  });
}

function hasTemplateShape(v: any): v is Template {
  const numbers = (o: any, keys: string[]) => o && keys.every((k) => typeof o[k] === "number");
  return (
    typeof v?.id === "string" &&
    typeof v.name === "string" &&
    numbers(v.sheet, ["width", "height"]) &&
    numbers(v.grid, ["columns", "rows", "marginTop", "marginLeft", "gapX", "gapY"]) &&
    numbers(v.label, ["width", "height"]) &&
    ["rect", "rounded", "circle", "oval"].includes(v.label.shape)
  );
}

export type ImportResult = { added: Template[]; renamed: string[]; errors: string[] };

export function importCustom(json: string, existing: Template[], storage: StorageLike): ImportResult {
  const result: ImportResult = { added: [], renamed: [], errors: [] };
  let items: unknown;
  try {
    items = JSON.parse(json);
  } catch {
    result.errors.push("Dosya okunamadı.");
    return result;
  }
  const taken = new Set([...existing, ...loadCustom(storage)].map((t) => t.id));
  for (const item of Array.isArray(items) ? items : [items]) {
    if (!hasTemplateShape(item)) {
      result.errors.push("Geçersiz şablon kaydı atlandı.");
      continue;
    }
    const problems = validateTemplate(item);
    if (problems.length) {
      result.errors.push(`${item.name}: ${problems.join(" ")}`);
      continue;
    }
    let id = item.id;
    for (let n = 2; taken.has(id); n++) id = `${item.id}-${n}`;
    if (id !== item.id) result.renamed.push(item.id);
    taken.add(id);
    const template: Template = { ...item, id, source: "custom" };
    saveCustom(template, storage);
    result.added.push(template);
  }
  return result;
}
