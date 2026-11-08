import data from "./catalog.generated.json";
import type { VectorIcon } from "./svg";

export type SymbolEntry = { id: string; category: string; tags: string[]; icon: VectorIcon };

export const catalog = data as SymbolEntry[];

const FOLD: Record<string, string> = { ı: "i", ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c" };

export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[ığüşöç]/g, (c) => FOLD[c])
    .trim();
}

const GENERIC_WORDS = new Set(["organik", "dogal", "yerli", "taze", "kuru", "koy", "yapimi", "ozel"]);

function score(query: string, tags: string[]): number | null {
  let best: number | null = null;
  for (const tag of tags) {
    const s = tag === query ? 0 : tag.startsWith(query) ? 1 : tag.includes(query) ? 2 : null;
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

function rank(query: string, entries: SymbolEntry[]): { entry: SymbolEntry; score: number }[] {
  return entries
    .map((entry) => ({ entry, score: score(query, entry.tags.map(normalize)) }))
    .filter((r): r is { entry: SymbolEntry; score: number } => r.score !== null);
}

export function searchSymbols(q: string, limit = 12, entries: SymbolEntry[] = catalog): SymbolEntry[] {
  const query = normalize(q);
  if (query.length < 2) return [];
  let hits = rank(query, entries);
  if (hits.length === 0) {
    // Label text such as "Organik Mısır Unu": any word may name the symbol.
    const seen = new Map<string, { entry: SymbolEntry; score: number }>();
    for (const word of query.split(/\s+/).filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w))) {
      for (const hit of rank(word, entries)) {
        const previous = seen.get(hit.entry.id);
        if (!previous || hit.score < previous.score) seen.set(hit.entry.id, hit);
      }
    }
    hits = [...seen.values()];
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map((h) => h.entry);
}
