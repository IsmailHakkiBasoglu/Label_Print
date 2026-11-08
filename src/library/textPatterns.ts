import type { DesignElement, FontId, SymbolElement, TextElement } from "../core/document";
import type { FontMeasure } from "../render/fonts";

export const MIN_TEXT_PT = 4;
const MAX_TEXT_PT = 200;
const PT_PER_MM = 72 / 25.4;
const STEP_PT = 0.25;

export const PATTERNS = [
  { id: "title", name: "Tek başlık" },
  { id: "title-sub", name: "Başlık + alt başlık" },
  { id: "badge", name: "Ortalı rozet" },
  { id: "three-lines", name: "Üç satır bilgi" },
  { id: "symbol-left", name: "Sembol solda" },
  { id: "symbol-top", name: "Sembol üstte" },
] as const;

function wrap(text: string, font: FontId, sizePt: number, width: number, measure: FontMeasure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measure(candidate, font, sizePt) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

export type FitResult = { sizePt: number; lines: string[]; overflow: boolean };

export function fitText(
  text: string,
  box: { width: number; height: number },
  font: FontId,
  startPt: number,
  measure: FontMeasure,
  lineHeight = 1.2,
): FitResult {
  for (let sizePt = Math.min(Math.max(startPt, MIN_TEXT_PT), MAX_TEXT_PT); ; sizePt = Math.max(sizePt - STEP_PT, MIN_TEXT_PT)) {
    const lines = wrap(text, font, sizePt, box.width, measure);
    const fits = (lines.length * sizePt * lineHeight) / PT_PER_MM <= box.height && lines.every((l) => measure(l, font, sizePt) <= box.width);
    if (fits) return { sizePt, lines, overflow: false };
    if (sizePt <= MIN_TEXT_PT) return { sizePt: MIN_TEXT_PT, lines, overflow: true };
  }
}

const round = (n: number) => Math.floor(n * 1000) / 1000;

export function applyPattern(id: string, label: { width: number; height: number }, texts: string[], symbolId?: string): DesignElement[] {
  const pad = Math.max(1, Math.min(label.width, label.height) * 0.08);
  const [W, H] = [label.width - 2 * pad, label.height - 2 * pad];
  let index = 0;
  const text = (x: number, y: number, width: number, height: number, fontId: FontId, align: TextElement["align"]): TextElement => {
    const i = index++;
    return {
      kind: "text",
      id: `${id}-t${i}`,
      x: round(pad + x),
      y: round(pad + y),
      width: round(width),
      height: round(height),
      text: texts[i] ?? "",
      fontId,
      sizePt: Math.min(48, Math.round(height * PT_PER_MM * 0.75)),
      align,
      color: "#000000",
    };
  };
  const symbol = (x: number, y: number, width: number, height: number): SymbolElement => ({
    kind: "symbol",
    id: `${id}-s`,
    x: round(pad + x),
    y: round(pad + y),
    width: round(width),
    height: round(height),
    symbolId: symbolId!,
    color: "#000000",
  });

  const gap = pad / 2;
  if (id === "title-sub") {
    return [text(0, 0, W, H * 0.62, "sans-bold", "center"), text(0, H * 0.62 + gap, W, H * 0.38 - gap, "sans", "center")];
  }
  if (id === "badge") return [text(W * 0.1, H * 0.2, W * 0.8, H * 0.6, "serif-bold", "center")];
  if (id === "three-lines") {
    const row = H / 3;
    return [text(0, 0, W, row, "sans-bold", "left"), text(0, row, W, row, "sans", "left"), text(0, row * 2, W, row, "sans", "left")];
  }
  if (id === "symbol-left" && symbolId) {
    const side = Math.min(H, W * 0.4);
    const x = side + gap;
    return [symbol(0, (H - side) / 2, side, side), text(x, 0, W - x, H * 0.62, "sans-bold", "left"), text(x, H * 0.62, W - x, H * 0.38, "sans", "left")];
  }
  if (id === "symbol-top" && symbolId) {
    const side = H * 0.55;
    return [symbol((W - side) / 2, 0, side, side), text(0, side + gap, W, H - side - gap, "sans-bold", "center")];
  }
  return [text(0, 0, W, H, "sans-bold", "center")];
}
