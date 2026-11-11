import type { DesignElement, FontId, FrameOptions, LabelDesign, TextElement } from "../core/document";
import { frameMargin } from "../render/layout";
import type { FrameLabel } from "./frames";
import { applyPattern } from "./textPatterns";

export type TextStyle = { fontId: FontId; color: string; sizePt: number };
export type ThemeStyle = "bahce" | "kir" | "kraft" | "modern";

/** A ready-made look: frame and its colours, a text layout, and a style for each text in order (title, subtitle, group name). */
export type Theme = {
  id: string;
  name: string;
  style: ThemeStyle;
  frameId: string;
  frameOptions: Pick<FrameOptions, "color" | "accent" | "background">;
  patternId: "title-sub" | "band-title";
  texts: TextStyle[];
  /** Texts used when the label has none yet. */
  samples: string[];
};

export const THEME_STYLES: { id: ThemeStyle; name: string }[] = [
  { id: "bahce", name: "Doğal bahçe" },
  { id: "kir", name: "Kır çiçekleri" },
  { id: "kraft", name: "Rustik kraft" },
  { id: "modern", name: "Sade modern" },
];

const TITLE_PT = 24;
const SUBTITLE_PT = 11;
const GROUP_PT = 8;
const FRAME_DEFAULTS = { strokeMm: 0.4, insetMm: 1 };
/** Keeps texts a hair inside the ornament band, like a pattern applied over a frame. */
const MARGIN_SLACK_MM = 0.01;

const two = (title: [FontId, string], subtitle: [FontId, string]): TextStyle[] => [
  { fontId: title[0], color: title[1], sizePt: TITLE_PT },
  { fontId: subtitle[0], color: subtitle[1], sizePt: SUBTITLE_PT },
];
const banded = (title: string, subtitle: string): TextStyle[] => [
  { fontId: "sans", color: title, sizePt: TITLE_PT },
  { fontId: "sans", color: subtitle, sizePt: SUBTITLE_PT },
  { fontId: "sans-bold", color: "#ffffff", sizePt: GROUP_PT },
];

export const THEMES: Theme[] = [
  { id: "bahce-kirmizi", name: "Bahçe · kırmızı meyve", style: "bahce", frameId: "o-berry-vine", frameOptions: { color: "#3B6D11", accent: "#C0322B" }, patternId: "title-sub", texts: two(["serif-bold", "#27500A"], ["serif", "#A32D2D"]), samples: ["Mercimek", "kırmızı · 2026"] },
  { id: "bahce-mor", name: "Bahçe · böğürtlen", style: "bahce", frameId: "o-berry-vine", frameOptions: { color: "#3B6D11", accent: "#5B2A6E" }, patternId: "title-sub", texts: two(["serif-bold", "#27500A"], ["serif", "#5B2A6E"]), samples: ["Böğürtlen", "reçel · 2026"] },
  { id: "kir-pembe", name: "Kır çiçekleri · pembe", style: "kir", frameId: "o-meadow", frameOptions: { color: "#639922", accent: "#D4537E" }, patternId: "title-sub", texts: two(["serif-bold", "#72243E"], ["sans", "#993556"]), samples: ["Nohut", "ev yapımı"] },
  { id: "kir-lila", name: "Kır çiçekleri · lila", style: "kir", frameId: "o-meadow", frameOptions: { color: "#639922", accent: "#8E6BC2" }, patternId: "title-sub", texts: two(["serif-bold", "#3C3489"], ["sans", "#534AB7"]), samples: ["Lavanta", "kurutulmuş"] },
  { id: "kraft-kahve", name: "Kraft · kahve", style: "kraft", frameId: "o-wheat-double", frameOptions: { color: "#412402", accent: "#854F0B", background: "#E2C79C" }, patternId: "title-sub", texts: two(["serif-bold", "#412402"], ["serif", "#633806"]), samples: ["Bulgur", "pilavlık"] },
  { id: "kraft-zeytin", name: "Kraft · zeytin", style: "kraft", frameId: "o-wheat-double", frameOptions: { color: "#3E4A1E", accent: "#6B7A2E", background: "#E6DDB8" }, patternId: "title-sub", texts: two(["serif-bold", "#2E3815"], ["serif", "#4F5C22"]), samples: ["Zeytin", "sele · 2026"] },
  { id: "modern-yesil", name: "Modern · yeşil", style: "modern", frameId: "band", frameOptions: { color: "#0F6E56", accent: "#EF9F27" }, patternId: "band-title", texts: banded("#04342C", "#5F5E5A"), samples: ["Pirinç", "baldo · 1 kg", "BAKLİYAT"] },
  { id: "modern-bordo", name: "Modern · bordo", style: "modern", frameId: "band", frameOptions: { color: "#7A1F2B", accent: "#D9A441" }, patternId: "band-title", texts: banded("#4A1218", "#5F5E5A"), samples: ["Kırmızı biber", "pul · 250 g", "BAHARAT"] },
];

function inscribed(patternId: Theme["patternId"], label: FrameLabel, texts: string[], symbolId: string | undefined, inset: number): DesignElement[] {
  const [left, top] = [label.width / 2 - (label.width / 2 - inset) / Math.SQRT2, label.height / 2 - (label.height / 2 - inset) / Math.SQRT2];
  const inner = { width: label.width - 2 * left, height: label.height - 2 * top };
  return applyPattern(patternId, inner, texts, symbolId).map((e) => ({ ...e, x: Number((e.x + left).toFixed(4)), y: Number((e.y + top).toFixed(4)) }));
}

/**
 * The design with the theme applied: its frame and colours, its layout filled with the label's texts in order
 * (or the theme's samples when there are none), each text styled, and codes kept as they are.
 */
export function themedDesign(theme: Theme, design: LabelDesign, label: FrameLabel): LabelDesign {
  const frameOptions: FrameOptions = { ...FRAME_DEFAULTS, ...theme.frameOptions };
  const framed: LabelDesign = { frameId: theme.frameId, frameOptions, elements: [] };
  const margin = frameMargin(framed, label);
  const own = design.elements.filter((e): e is TextElement => e.kind === "text").map((e) => e.text);
  const symbol = design.elements.find((e) => e.kind === "symbol");
  const texts = own.length ? own : theme.samples;
  const symbolId = symbol?.kind === "symbol" ? symbol.symbolId : undefined;
  const inset = margin > 0 ? margin + MARGIN_SLACK_MM : 0;
  const round = label.shape === "circle" || label.shape === "oval";
  // On a round label the ornament follows the ellipse: lay the texts out in the rectangle inscribed in its inner edge.
  const laid =
    round && theme.patternId === "title-sub"
      ? inscribed(theme.patternId, label, texts, symbolId, inset)
      : applyPattern(theme.patternId, label, texts, symbolId, inset);
  let index = 0;
  const styled = laid.map((e): DesignElement => (e.kind === "text" ? { ...e, ...theme.texts[index++] } : e));
  return { ...framed, elements: [...styled, ...design.elements.filter((e) => e.kind === "code")] };
}
