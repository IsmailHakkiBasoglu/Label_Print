import fontkit from "@pdf-lib/fontkit";
import {
  LineCapStyle,
  PDFDocument,
  appendBezierCurve,
  closePath,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setLineWidth,
  setStrokingColor,
  stroke,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
  type PDFPage,
} from "pdf-lib";
import type { FontId, LabelProject } from "../core/document";
import type { ImageStore } from "../core/imageStore";
import { mmToPt, type Rect } from "../core/geometry";
import type { FontBytes } from "./fonts";
import { layoutProject, type LayoutDeps } from "./layout";
import type { GuideOp, PathOp } from "./ops";
import type { SymbolEntry } from "../library/symbols/search";

export type RenderDeps = LayoutDeps & { fontBytes: FontBytes; colorSymbols?: SymbolEntry[]; images?: ImageStore };
export type RenderResult = { ok: true; bytes: Uint8Array; warnings: string[] } | { ok: false; errors: string[] };

const GUIDE_WIDTH_PT = 0.25;
const GUIDE_GREY = 0.6;
/** Control-point distance that approximates a quarter circle with a cubic curve. */
const KAPPA = 0.5522847498;

export function hexToRgb(hex: string) {
  const value = parseInt(hex.replace("#", ""), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function ellipseOperators(r: Rect, pageHeight: number): PDFOperator[] {
  const [rx, ry] = [mmToPt(r.width / 2), mmToPt(r.height / 2)];
  const [cx, cy] = [mmToPt(r.x + r.width / 2), pageHeight - mmToPt(r.y + r.height / 2)];
  const [kx, ky] = [rx * KAPPA, ry * KAPPA];
  return [
    moveTo(cx - rx, cy),
    appendBezierCurve(cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry),
    appendBezierCurve(cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy),
    appendBezierCurve(cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry),
    appendBezierCurve(cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy),
    closePath(),
  ];
}

function drawGuide(page: PDFPage, op: GuideOp, pageHeight: number) {
  const { rect } = op;
  const curved = op.shape === "circle" || op.shape === "oval";
  const shape = curved
    ? ellipseOperators(rect, pageHeight)
    : [rectangle(mmToPt(rect.x), pageHeight - mmToPt(rect.y + rect.height), mmToPt(rect.width), mmToPt(rect.height))];
  page.pushOperators(pushGraphicsState(), setStrokingColor(rgb(GUIDE_GREY, GUIDE_GREY, GUIDE_GREY)), setLineWidth(GUIDE_WIDTH_PT), ...shape, stroke(), popGraphicsState());
}

function drawPath(page: PDFPage, op: PathOp, pageHeight: number) {
  page.drawSvgPath(op.d, {
    x: mmToPt(op.x),
    y: pageHeight - mmToPt(op.y),
    scale: mmToPt(op.scale),
    ...(op.fill ? { color: hexToRgb(op.fill) } : {}),
    // Line widths are drawn inside the path's scaled space, so they stay in path units.
    ...(op.stroke
      ? {
          borderColor: hexToRgb(op.stroke.color),
          borderWidth: op.stroke.widthMm / op.scale,
          borderLineCap: LineCapStyle.Round,
          ...(op.stroke.dash ? { borderDashArray: op.stroke.dash.map((d) => d / op.scale) } : {}),
        }
      : {}),
  });
}

export async function renderPdf(project: LabelProject, deps: RenderDeps, opts: { guides: boolean }): Promise<RenderResult> {
  const layout = layoutProject(project, deps, opts);
  if (layout.errors.length) return { ok: false, errors: layout.errors };

  const imageBytes = new Map<string, Uint8Array>();
  for (const id of new Set(layout.pages.flatMap((p) => p.ops.flatMap((op) => (op.kind === "image" ? [op.imageId] : []))))) {
    const bytes = await deps.images?.get(id);
    if (!bytes) return { ok: false, errors: [`"${project.images[id].name}" görseli bulunamadı; görseli yeniden yükleyin.`] };
    imageBytes.set(id, bytes);
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = new Map<FontId, PDFFont>();
  const font = async (id: FontId) => {
    // Subsetting these fonts corrupts their outlines, so the whole font is embedded.
    if (!fonts.has(id)) fonts.set(id, await doc.embedFont(deps.fontBytes[id], { subset: false }));
    return fonts.get(id)!;
  };

  const embedded = new Map<string, PDFImage>();
  const image = async (id: string) => {
    if (!embedded.has(id)) {
      const bytes = imageBytes.get(id)!;
      embedded.set(id, await (project.images[id].mime === "image/png" ? doc.embedPng(bytes) : doc.embedJpg(bytes)));
    }
    return embedded.get(id)!;
  };

  for (const layoutPage of layout.pages) {
    const height = mmToPt(layoutPage.sheet.height);
    const page = doc.addPage([mmToPt(layoutPage.sheet.width), height]);
    for (const op of layoutPage.ops) {
      if (op.kind === "guide") drawGuide(page, op, height);
      else if (op.kind === "path") drawPath(page, op, height);
      else if (op.kind === "image") page.drawImage(await image(op.imageId), { x: mmToPt(op.x), y: height - mmToPt(op.y + op.height), width: mmToPt(op.width), height: mmToPt(op.height) });
      else page.drawText(op.text, { x: mmToPt(op.x), y: height - mmToPt(op.y), size: op.sizePt, font: await font(op.font), color: hexToRgb(op.color) });
    }
  }
  return { ok: true, bytes: await doc.save(), warnings: layout.warnings };
}
