import type { Shape } from "../../src/core/templates";

export type TanexRow = { code: string | null; sizeText: string; url: string; section: 1 | 2 };
export type ParsedSize = { width: number; height: number; shape: Shape; singleDimension: boolean };

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseListHtml(html: string): TanexRow[] {
  const rows: TanexRow[] = [];
  const pattern = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>[\s\S]*?<a href=['"]([^'"]+\.docx?)['"]/g;
  for (const match of html.matchAll(pattern)) {
    const text = decode(match[1].replace(/<[^>]+>/g, ""));
    const coded = /^(TW-\d+)\s*(.*)$/.exec(text);
    rows.push({
      code: coded ? coded[1] : null,
      sizeText: coded ? coded[2] : text,
      url: decode(match[2]),
      section: coded ? 1 : 2,
    });
  }
  return rows;
}

const number = (s: string) => Number(s.replace(",", "."));

export function parseSize(sizeText: string, url: string): ParsedSize {
  const haystack = `${sizeText} ${url}`.toLowerCase();
  const named: Shape | null = haystack.includes("yuvarlak") ? "circle" : haystack.includes("oval") ? "oval" : null;
  const pair = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/.exec(sizeText);
  if (pair) return { width: number(pair[1]), height: number(pair[2]), shape: named ?? "rect", singleDimension: false };
  const single = /(\d+(?:[.,]\d+)?)/.exec(sizeText);
  if (!single) throw new Error(`Ölçü okunamadı: ${sizeText}`);
  const value = number(single[1]);
  return { width: value, height: value, shape: named ?? "rect", singleDimension: named === null };
}
