import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";

/** Reads spreadsheet files (.xlsx, .csv) and pasted text into plain rows of cell text. */

export const TABLE_LIMITS = { bytes: 5 * 1024 * 1024, rows: 5000, columns: 100 };

export class TableImportError extends Error {}

export type TableSheet = { name: string; rows: string[][] };
export type TableFile = { sheets: TableSheet[] };
export type Table = { columns: string[]; rows: string[][] };

/** UTF-8 when the bytes are valid UTF-8, otherwise the Turkish Windows code page Excel uses for CSV. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

function detectDelimiter(text: string): string {
  let firstLine = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted) firstLine += ch;
  }
  const counts = ["\t", ";", ","].map((d) => [d, firstLine.split(d).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ",";
}

/** Splits delimited text (RFC 4180 quoting). The delimiter is guessed from the first line when not given. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field !== "" || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Pasted text: tab-separated cells (copied from Excel) become columns; anything else is one label per line. */
export function parsePasted(text: string): string[][] {
  if (text.includes("\t")) return parseDelimited(text, "\t");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => [line]);
}

/** Trims cells, drops empty rows and names the columns (from the first row when it is a header). */
export function toTable(source: string[][], header: boolean): Table {
  const rows = source.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
  const head = header ? (rows.shift() ?? []) : [];
  const width = Math.max(0, head.length, ...rows.map((r) => r.length));
  return {
    columns: Array.from({ length: width }, (_, i) => head[i] || `Sütun ${i + 1}`),
    rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")),
  };
}

// ---- xlsx ----

const ARRAYS = new Set(["sheet", "Relationship", "si", "r", "row", "c", "xf", "numFmt"]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ARRAYS.has(name),
});
type Node = Record<string, unknown>;
const asNode = (v: unknown): Node => (v && typeof v === "object" ? (v as Node) : {});
const list = (v: unknown): Node[] => (Array.isArray(v) ? v.map(asNode) : []);
const text = (v: unknown): string => (typeof v === "string" ? v : typeof asNode(v)["#text"] === "string" ? (asNode(v)["#text"] as string) : "");
/** Plain `<t>` or rich-text runs `<r><t>`. */
const richText = (node: Node): string => (node.t !== undefined ? text(node.t) : list(node.r).map((r) => text(r.t)).join(""));

const DATE_IDS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);
const TIME_IDS = new Set([18, 19, 20, 21, 32, 33, 45, 46, 47, 55, 56]);
type NumberKind = "date" | "time" | "number";

function formatKind(id: number, code: string | undefined): NumberKind {
  if (DATE_IDS.has(id)) return "date";
  if (TIME_IDS.has(id)) return "time";
  if (!code) return "number";
  const bare = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
  if (/[yd]/i.test(bare)) return "date";
  if (/[hs]/i.test(bare)) return "time";
  return "number";
}

const pad = (n: number) => String(n).padStart(2, "0");
function formatNumber(raw: string, kind: NumberKind, date1904: boolean): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  if (kind === "date") {
    const d = new Date(Date.UTC(1899, 11, 30) + (Math.floor(value) + (date1904 ? 1462 : 0)) * 86_400_000);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  }
  if (kind === "time") {
    const minutes = Math.round((value - Math.floor(value)) * 1440);
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  }
  return String(Number(value.toPrecision(12))).replace(".", ",");
}

function columnIndex(ref: string): number {
  let index = 0;
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "") index = index * 26 + ch.charCodeAt(0) - 64;
  return index - 1;
}

function readXlsx(bytes: Uint8Array): TableFile {
  const broken = () => new TableImportError("Excel dosyası okunamadı; dosya bozuk olabilir.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") && f.originalSize < 64 * 1024 * 1024 });
  } catch {
    throw broken();
  }
  const xml = (path: string): Node | null => (files[path] ? asNode(parser.parse(strFromU8(files[path]))) : null);
  const workbook = asNode(xml("xl/workbook.xml")?.workbook);
  const rels = list(asNode(xml("xl/_rels/workbook.xml.rels")?.Relationships).Relationship);
  if (!workbook.sheets) throw broken();

  const date1904 = ["1", "true"].includes(String(asNode(workbook.workbookPr)["@_date1904"]));
  const shared = list(asNode(xml("xl/sharedStrings.xml")?.sst).si).map(richText);
  const styles = asNode(xml("xl/styles.xml")?.styleSheet);
  const codes = new Map(list(asNode(styles.numFmts).numFmt).map((f) => [Number(f["@_numFmtId"]), String(f["@_formatCode"])]));
  const kinds = list(asNode(styles.cellXfs).xf).map((xf) => {
    const id = Number(xf["@_numFmtId"] ?? 0);
    return formatKind(id, codes.get(id));
  });

  const sheets = list(asNode(workbook.sheets).sheet).map((sheet): TableSheet => {
    const target = String(rels.find((r) => r["@_Id"] === sheet["@_id"])?.["@_Target"] ?? "");
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const doc = xml(path);
    if (!doc) throw broken();
    const rows = list(asNode(asNode(doc.worksheet).sheetData).row).map((row) => {
      const cells: string[] = [];
      list(row.c).forEach((c, i) => {
        const column = c["@_r"] ? columnIndex(String(c["@_r"])) : i;
        if (column < 0 || column >= TABLE_LIMITS.columns) return;
        const v = text(c.v);
        const value =
          c["@_t"] === "s" ? (shared[Number(v)] ?? "")
          : c["@_t"] === "inlineStr" ? richText(asNode(c.is))
          : c["@_t"] === "str" ? v
          : c["@_t"] === "b" ? (v === "1" ? "DOĞRU" : "YANLIŞ")
          : c["@_t"] === "e" || v === "" ? ""
          : formatNumber(v, kinds[Number(c["@_s"] ?? 0)] ?? "number", date1904);
        while (cells.length < column) cells.push("");
        cells[column] = value;
      });
      return cells;
    });
    return { name: String(sheet["@_name"] ?? ""), rows };
  });
  return { sheets };
}

export async function readTableFile(name: string, bytes: Uint8Array): Promise<TableFile> {
  const ext = /\.([a-z]+)$/i.exec(name)?.[1].toLowerCase();
  if (ext === "xls") throw new TableImportError('Eski .xls biçimi okunamıyor. Dosyayı Excel\'de "Farklı Kaydet" ile .xlsx olarak kaydedin.');
  if (ext !== "xlsx" && ext !== "csv") throw new TableImportError("Yalnız .xlsx veya .csv dosyaları okunabilir.");
  if (bytes.length > TABLE_LIMITS.bytes) throw new TableImportError("Dosya çok büyük (en fazla 5 MB).");
  const file = ext === "csv" ? { sheets: [{ name, rows: parseDelimited(decodeText(bytes)) }] } : readXlsx(bytes);
  for (const sheet of file.sheets) {
    if (sheet.rows.filter((r) => r.some((c) => c.trim())).length > TABLE_LIMITS.rows) {
      throw new TableImportError(`"${sheet.name}" sayfasında çok satır var (en fazla 5.000 satır).`);
    }
  }
  return file;
}
