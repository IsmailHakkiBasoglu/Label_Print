import fontkit from "@pdf-lib/fontkit";
import type { FontId } from "../core/document";

export const FONT_FILES: Record<FontId, string> = {
  sans: "NotoSans_400Regular.ttf",
  "sans-bold": "NotoSans_700Bold.ttf",
  serif: "NotoSerif_400Regular.ttf",
  "serif-bold": "NotoSerif_700Bold.ttf",
};

export type FontBytes = Record<FontId, Uint8Array>;
export type FontMeasure = (text: string, font: FontId, sizePt: number) => number;
export type FontTools = { measure: FontMeasure; unsupported: (text: string, font: FontId) => string[] };

const MM_PER_PT = 25.4 / 72;
const WIDTH_CACHE_LIMIT = 20000;

export function createFontTools(bytes: FontBytes): FontTools {
  const parsed = new Map<FontId, any>();
  const widths = new Map<string, number>();
  const get = (id: FontId) => {
    if (!parsed.has(id)) parsed.set(id, fontkit.create(bytes[id]));
    return parsed.get(id);
  };
  return {
    measure(text, id, sizePt) {
      // Shaping is by far the slowest step of fitting text, and fitting retries the same words at many sizes.
      const key = `${id}\u0000${text}`;
      let perPoint = widths.get(key);
      if (perPoint === undefined) {
        const font = get(id);
        // PDF text is drawn glyph by glyph without kerning, so measure the same way.
        const advance = font.layout(text).glyphs.reduce((sum: number, g: any) => sum + g.advanceWidth, 0);
        perPoint = (advance / font.unitsPerEm) * MM_PER_PT;
        if (widths.size >= WIDTH_CACHE_LIMIT) widths.clear();
        widths.set(key, perPoint);
      }
      return perPoint * sizePt;
    },
    unsupported(text, id) {
      const font = get(id);
      return [...new Set([...text].filter((c) => !/\s/.test(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)!)))];
    },
  };
}

export async function loadFontBytes(): Promise<FontBytes> {
  const entries = await Promise.all(
    Object.entries(FONT_FILES).map(async ([id, file]) => {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
      if (!response.ok) throw new Error(`Yazı tipi yüklenemedi: ${file}`);
      return [id, new Uint8Array(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(entries) as FontBytes;
}
