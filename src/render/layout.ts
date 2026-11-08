import { resolveCellDesign } from "../core/cells";
import type { FontId, LabelDesign, LabelProject, Page, TextElement, Zone } from "../core/document";
import { labelRects, type Rect } from "../core/geometry";
import type { Template } from "../core/templates";
import { frameLayout, type FrameLabel } from "../library/frames";
import type { SymbolEntry } from "../library/symbols/search";
import { fitText, type FitResult } from "../library/textPatterns";
import type { FontTools } from "./fonts";
import type { RenderOp, TextOp } from "./ops";

export type LayoutDeps = {
  templates: (id: string) => Template | undefined;
  symbols: (id: string) => SymbolEntry | undefined;
  tools: FontTools;
};

export type LayoutPage = { sheet: Page["sheet"]; ops: RenderOp[] };
export type LayoutResult = { pages: LayoutPage[]; warnings: string[]; errors: string[] };

const EDGE_MM = 0.01;
/** A printer correction may push a label this far off the PDF page: the paper itself is shifted. */
const OFFSET_ALLOWANCE_MM = 3;
const LINE_HEIGHT = 1.2;
const MM_PER_PT = 25.4 / 72;
const DEFAULT_FRAME = { strokeMm: 0.4, insetMm: 1, color: "#000000" };
const BAND_WARNING = "Yazı veya görsel çerçeve süsüne değiyor.";

type FitCache = Map<string, FitResult>;

function textOps(el: TextElement, origin: { x: number; y: number }, deps: LayoutDeps, warnings: string[], cache: FitCache): TextOp[] {
  const { measure, unsupported } = deps.tools;
  const missing = unsupported(el.text, el.fontId);
  if (missing.length) warnings.push(`Yazı tipinde olmayan karakterler atlandı: ${missing.join(" ")}`);
  const clean = [...el.text].filter((c) => !missing.includes(c)).join("");
  if (!clean.trim()) return [];
  const key = JSON.stringify([clean, el.fontId, el.sizePt, el.width, el.height]);
  const fit = cache.get(key) ?? fitText(clean, el, el.fontId, el.sizePt, measure, LINE_HEIGHT);
  cache.set(key, fit);
  if (fit.overflow) warnings.push(`"${clean.slice(0, 30)}" metni alanına sığmıyor.`);
  const lineMm = fit.sizePt * LINE_HEIGHT * MM_PER_PT;
  const top = origin.y + el.y + (el.height - fit.lines.length * lineMm) / 2;
  return fit.lines.map((line, i) => {
    const width = measure(line, el.fontId as FontId, fit.sizePt);
    const shift = el.align === "center" ? (el.width - width) / 2 : el.align === "right" ? el.width - width : 0;
    return {
      kind: "text",
      x: origin.x + el.x + shift,
      y: top + i * lineMm + (lineMm + fit.sizePt * MM_PER_PT * 0.7) / 2,
      text: line,
      font: el.fontId,
      sizePt: fit.sizePt,
      color: el.color,
    };
  });
}

function touchesBand(el: Rect, label: FrameLabel, band: number): boolean {
  if (label.shape === "circle" || label.shape === "oval") {
    const [a, b] = [label.width / 2 - band, label.height / 2 - band];
    return [el.x, el.x + el.width].some((x) => [el.y, el.y + el.height].some((y) => ((x - label.width / 2) / a) ** 2 + ((y - label.height / 2) / b) ** 2 > 1));
  }
  return el.x < band || el.y < band || el.x + el.width > label.width - band || el.y + el.height > label.height - band;
}

function designOps(design: LabelDesign, box: Rect, label: FrameLabel, deps: LayoutDeps, warnings: string[], cache: FitCache): RenderOp[] {
  const ops: RenderOp[] = [];
  if (design.frameId) {
    const options = design.frameOptions ?? DEFAULT_FRAME;
    const frame = frameLayout(design.frameId, label, options);
    for (const op of frame.ops) ops.push({ ...op, x: box.x, y: box.y });
    if (frame.fellBack) warnings.push("Etiket süslü çerçeve için çok küçük; tek çizgi kullanıldı.");
    if (frame.bandMm > 0 && design.elements.some((el) => touchesBand(el, label, options.insetMm + frame.bandMm))) warnings.push(BAND_WARNING);
  }
  for (const el of design.elements) {
    if (el.kind === "text") {
      ops.push(...textOps(el, box, deps, warnings, cache));
      continue;
    }
    const symbol = deps.symbols(el.symbolId);
    if (!symbol) {
      warnings.push(`Sembol bulunamadı: ${el.symbolId}`);
      continue;
    }
    const [vx, vy, vw, vh] = symbol.icon.viewBox;
    const scale = Math.min(el.width / vw, el.height / vh);
    const x = box.x + el.x + (el.width - vw * scale) / 2 - vx * scale;
    const y = box.y + el.y + (el.height - vh * scale) / 2 - vy * scale;
    for (const path of symbol.icon.paths) {
      ops.push({
        kind: "path",
        d: path.d,
        x,
        y,
        scale,
        ...(path.fill ? { fill: el.color } : {}),
        ...(path.strokeWidth > 0 ? { stroke: { color: el.color, widthMm: path.strokeWidth * scale } } : {}),
      });
    }
  }
  return ops;
}

/** One label at the origin, for the editor canvas. */
export function layoutDesign(design: LabelDesign, label: FrameLabel, deps: LayoutDeps): RenderOp[] {
  return designOps(design, { x: 0, y: 0, width: label.width, height: label.height }, label, deps, [], new Map());
}

function zoneRects(zone: Zone, deps: LayoutDeps): Rect[] {
  if (zone.kind === "free") return [zone];
  const template = deps.templates(zone.templateId);
  if (!template) return [];
  const rects = labelRects(template);
  return zone.cells.used.map((i) => rects[i]).filter(Boolean);
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function inside(r: Rect, sheet: Page["sheet"], margin = EDGE_MM): boolean {
  return r.x >= -margin && r.y >= -margin && r.x + r.width <= sheet.width + margin && r.y + r.height <= sheet.height + margin;
}

export function layoutProject(project: LabelProject, deps: LayoutDeps, opts: { guides: boolean }): LayoutResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const cache: FitCache = new Map();
  const offset = project.printOffset;
  const moved = (r: Rect): Rect => ({ ...r, x: r.x + offset.x, y: r.y + offset.y });

  const pages = project.pages.map((page) => {
    const ops: RenderOp[] = [];
    const zoneAreas = page.zones.map((z) => zoneRects(z, deps));
    zoneAreas.forEach((a, i) =>
      zoneAreas.slice(i + 1).forEach((b) => {
        if (a.some((r) => b.some((s) => overlaps(r, s)))) warnings.push("Sayfadaki bölgeler birbiriyle çakışıyor.");
      }),
    );
    for (const zone of page.zones) {
      if (zone.kind === "free") {
        const box = moved(zone);
        if (!inside(zone, page.sheet) || !inside(box, page.sheet, OFFSET_ALLOWANCE_MM)) {
          errors.push("Bir bölge sayfa dışına taşıyor.");
          continue;
        }
        ops.push(...designOps(zone.design, box, { width: zone.width, height: zone.height, shape: "rect" }, deps, warnings, cache));
        continue;
      }
      const template = deps.templates(zone.templateId);
      if (!template) {
        errors.push(`Şablon bulunamadı: ${zone.templateId}`);
        continue;
      }
      const rects = labelRects(template);
      for (const index of zone.cells.used) {
        if (index < 0 || index >= rects.length) continue;
        const box = moved(rects[index]);
        if (!inside(rects[index], page.sheet) || !inside(box, page.sheet, OFFSET_ALLOWANCE_MM)) {
          errors.push(`${index + 1}. etiket sayfa dışına taşıyor; yazıcı düzeltmesini azaltın.`);
          continue;
        }
        const design = resolveCellDesign(zone, index, project.designs);
        if (!design) {
          errors.push("Etiket tasarımı bulunamadı.");
          continue;
        }
        const cellWarnings: string[] = [];
        ops.push(...designOps(design, box, template.label, deps, cellWarnings, cache));
        warnings.push(...cellWarnings.map((w) => (zone.content[index] && w.startsWith('"') ? `${index + 1}. etiket: ${w}` : w)));
        if (opts.guides) ops.push({ kind: "guide", rect: box, shape: template.label.shape });
      }
    }
    return { sheet: page.sheet, ops };
  });

  if (errors.length === 0 && pages.every((p) => p.ops.every((op) => op.kind === "guide"))) errors.push("Basılacak etiket yok: etiket seçin veya içerik ekleyin.");
  return { pages, warnings: [...new Set(warnings)], errors: [...new Set(errors)] };
}
