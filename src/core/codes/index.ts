import type { CodeFormat } from "../document";
import { encodeCode128 } from "./code128";
import { encodeEan13 } from "./ean13";
import { encodeQr } from "./qr";

export { code128Values } from "./code128";
export { ean13Digits } from "./ean13";

/** Dark modules: one row for a barcode, a square for QR. `quiet` is the blank margin a reader needs, in modules. */
export type CodeMatrix = { modules: boolean[][]; quiet: number; text?: string };
export type CodeError = { error: string };
/** null: nothing to draw (empty content). */
export type CodeResult = CodeMatrix | CodeError | null;

export const isCodeError = (r: CodeResult): r is CodeError => !!r && "error" in r;

/** Turns widths such as "2122" (bar, space, bar, …) into modules. */
export function widthsToModules(widths: string): boolean[] {
  return [...widths].flatMap((w, i) => Array<boolean>(Number(w)).fill(i % 2 === 0));
}

export function encodeCode(format: CodeFormat, value: string): CodeResult {
  if (!value.trim()) return null;
  if (format === "qr") return encodeQr(value);
  return format === "ean13" ? encodeEan13(value) : encodeCode128(value);
}
