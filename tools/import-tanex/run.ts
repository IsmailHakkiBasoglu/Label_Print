import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { validateTemplate, type Template } from "../../src/core/templates";
import { parseDocumentXml } from "./parse-docx";
import { parseListHtml, parseSize, type TanexRow } from "./parse-list";
import { plausibilityNotes } from "./plausibility";

const PAGE = "https://www.tanexlabel.com/sablonlar-ve-olculer/";
const CACHE = join(import.meta.dirname, ".cache");
const OUTPUT = join(import.meta.dirname, "../../data/templates.tanex.json");
const A4 = { width: 210, height: 297 };

async function cached(url: string): Promise<Uint8Array> {
  const file = join(CACHE, createHash("sha1").update(url).digest("hex"));
  if (existsSync(file)) return readFileSync(file);
  const response = await fetch(encodeURI(url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(file, bytes);
  return bytes;
}

function identify(row: TanexRow): string {
  if (row.code) return row.code;
  const slug = row.sizeText.replace(/\s*mm/i, "").replace(/×/g, "x").replace(/[’']/g, "").replace(/ü/g, "u").replace(/\s+/g, "-");
  return `TANEX-${slug}`;
}

async function convert(row: TanexRow): Promise<Template> {
  const size = parseSize(row.sizeText, row.url);
  const notes: string[] = [];
  if (size.singleDimension) notes.push("Sayfada tek ölçü var, şekil belirsiz: kontrol edin.");
  const label = { width: size.width, height: size.height, shape: size.shape };
  const fallback = { sheet: A4, grid: { columns: 1, rows: 1, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 } };
  let layout = fallback;
  let parsedGrid = false;
  try {
    if (row.url.toLowerCase().endsWith(".doc")) throw new Error("Eski .doc biçimi okunamıyor; ızgarayı elle girin.");
    const xml = strFromU8(unzipSync(await cached(row.url))["word/document.xml"]);
    let parsed = parseDocumentXml(xml, label);
    if ("error" in parsed) {
      const swapped = parseDocumentXml(xml, { width: label.height, height: label.width });
      if ("error" in swapped) throw new Error(parsed.error);
      notes.push(`Sayfadaki ölçü (${size.width}×${size.height}) Word dosyasının tersi; Word yönü kullanıldı.`);
      [label.width, label.height] = [label.height, label.width];
      parsed = swapped;
    }
    layout = parsed;
    parsedGrid = true;
  } catch (error) {
    notes.push(`Izgara okunamadı: ${(error as Error).message}`);
  }
  const template: Template = {
    id: identify(row),
    name: row.code ? `${row.code} ${row.sizeText}` : row.sizeText,
    sheet: layout.sheet,
    grid: layout.grid,
    label,
    source: "tanex",
    status: "verified",
  };
  notes.push(...validateTemplate(template));
  if (parsedGrid) notes.push(...plausibilityNotes(template));
  if (notes.length) {
    template.status = "check";
    template.notes = notes;
  }
  return template;
}

mkdirSync(CACHE, { recursive: true });
mkdirSync(join(OUTPUT, ".."), { recursive: true });
const html = await (await fetch(PAGE)).text();
const rows = parseListHtml(html);
const results: Template[] = new Array(rows.length);
let next = 0;
await Promise.all(
  [0, 1].map(async () => {
    while (next < rows.length) {
      const index = next++;
      results[index] = await convert(rows[index]);
    }
  }),
);
writeFileSync(OUTPUT, JSON.stringify(results, null, 1) + "\n");
const check = results.filter((t) => t.status === "check");
console.log(`toplam=${results.length} verified=${results.length - check.length} check=${check.length}`);
for (const t of check) console.log(`${t.id}: ${t.notes!.join(" | ")}`);
