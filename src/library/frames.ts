import type { FrameOptions } from "../core/document";
import type { Shape } from "../core/templates";
import type { PathOp } from "../render/ops";
import { ORNAMENTS } from "./ornaments/frames.data";
import { ornamentLayout } from "./ornaments/layout";

export const FRAMES = [
  { id: "single", name: "Tek çizgi" },
  { id: "double", name: "Çift çizgi" },
  { id: "dashed", name: "Kesikli" },
  { id: "rounded", name: "Yuvarlak köşe" },
  { id: "corner-ornament", name: "Köşe süslemeli" },
  { id: "shape", name: "Oval" },
  { id: "band", name: "Renk bandı" },
] as const;

export type FrameLabel = { width: number; height: number; shape: Shape; cornerRadius?: number };

const round = (n: number) => Math.round(n * 10000) / 10000;

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${round(x)} ${round(y)}H${round(x + w)}V${round(y + h)}H${round(x)}Z`;
}

function ellipsePath(x: number, y: number, w: number, h: number): string {
  const [rx, ry, cy] = [round(w / 2), round(h / 2), round(y + h / 2)];
  return `M${round(x)} ${cy}A${rx} ${ry} 0 1 0 ${round(x + w)} ${cy}A${rx} ${ry} 0 1 0 ${round(x)} ${cy}Z`;
}

function roundedPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = round(Math.min(radius, w / 2, h / 2));
  const [X, Y] = [round(x + w), round(y + h)];
  return `M${round(x + r)} ${round(y)}H${round(X - r)}A${r} ${r} 0 0 1 ${X} ${round(y + r)}V${round(Y - r)}A${r} ${r} 0 0 1 ${round(X - r)} ${Y}H${round(x + r)}A${r} ${r} 0 0 1 ${round(x)} ${round(Y - r)}V${round(y + r)}A${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}Z`;
}

function notchedPath(x: number, y: number, w: number, h: number, r: number): string {
  const [X, Y] = [round(x + w), round(y + h)];
  return `M${round(x + r)} ${round(y)}H${round(X - r)}A${r} ${r} 0 0 0 ${X} ${round(y + r)}V${round(Y - r)}A${r} ${r} 0 0 0 ${round(X - r)} ${Y}H${round(x + r)}A${r} ${r} 0 0 0 ${round(x)} ${round(Y - r)}V${round(y + r)}A${r} ${r} 0 0 0 ${round(x + r)} ${round(y)}Z`;
}

function outline(label: FrameLabel, inset: number): string {
  const [w, h] = [label.width - 2 * inset, label.height - 2 * inset];
  if (label.shape === "circle" || label.shape === "oval") return ellipsePath(inset, inset, w, h);
  if (label.shape === "rounded") return roundedPath(inset, inset, w, h, Math.max((label.cornerRadius ?? 2) - inset, 0.5));
  return rectPath(inset, inset, w, h);
}

/** The label's own outline, `inset` inside its edge: the area a background colour fills. */
export function backgroundPath(label: FrameLabel, inset: number): string {
  return outline(label, inset);
}

export type FrameLayout = { ops: PathOp[]; bandMm: number; fellBack: boolean };

/** Share of the label height the colour band covers, from the inset down. */
export const BAND_RATIO_TOP = 0.26;
/** Below this short side the band falls back to a thin line. */
export const BAND_MIN_SHORT_SIDE_MM = 12;
const DIVIDER_GAP_MM = 0.6;
const DIVIDER_WIDTH = 0.3;
const DIVIDER_HEIGHT_MM = 0.5;

/** The filled top band, following the label: straight, with rounded top corners, or the cap of an ellipse above a horizontal chord. */
export function bandPath(label: FrameLabel, inset: number, ratio: number): string {
  const [w, h] = [label.width - 2 * inset, label.height - 2 * inset];
  const bottom = round(inset + h * ratio);
  if (label.shape === "circle" || label.shape === "oval") {
    const [a, b, cx, cy] = [w / 2, h / 2, label.width / 2, label.height / 2];
    const half = a * Math.sqrt(Math.max(0, 1 - ((bottom - cy) / b) ** 2));
    return `M${round(cx - half)} ${bottom}A${round(a)} ${round(b)} 0 0 1 ${round(cx + half)} ${bottom}Z`;
  }
  const right = round(inset + w);
  if (label.shape === "rounded") {
    const r = round(Math.min(Math.max((label.cornerRadius ?? 2) - inset, 0.5), h * ratio, w / 2));
    return `M${round(inset + r)} ${round(inset)}H${round(right - r)}A${r} ${r} 0 0 1 ${right} ${round(inset + r)}V${bottom}H${round(inset)}V${round(inset + r)}A${r} ${r} 0 0 1 ${round(inset + r)} ${round(inset)}Z`;
  }
  return `M${round(inset)} ${round(inset)}H${right}V${bottom}H${round(inset)}Z`;
}

function bandLayout(label: FrameLabel, opts: FrameOptions): FrameLayout {
  const inset = opts.insetMm;
  if (Math.min(label.width, label.height) < BAND_MIN_SHORT_SIDE_MM) {
    const line: PathOp = { kind: "path", d: `M${round(inset)} ${round(inset)}H${round(label.width - inset)}`, x: 0, y: 0, scale: 1, stroke: { color: opts.color, widthMm: opts.strokeMm } };
    return { ops: [line], bandMm: 0, fellBack: true };
  }
  const bottom = inset + (label.height - 2 * inset) * BAND_RATIO_TOP;
  const width = label.width * DIVIDER_WIDTH;
  const divider = `M${round((label.width - width) / 2)} ${round(bottom + DIVIDER_GAP_MM)}H${round((label.width + width) / 2)}V${round(bottom + DIVIDER_GAP_MM + DIVIDER_HEIGHT_MM)}H${round((label.width - width) / 2)}Z`;
  return {
    ops: [
      { kind: "path", d: bandPath(label, inset, BAND_RATIO_TOP), x: 0, y: 0, scale: 1, fill: opts.color },
      { kind: "path", d: divider, x: 0, y: 0, scale: 1, fill: opts.accent ?? opts.color },
    ],
    bandMm: 0,
    fellBack: false,
  };
}

/** Ornaments report their band so that content near it can be flagged; on tiny labels they fall back to a single line. */
export function frameLayout(id: string, label: FrameLabel, opts: FrameOptions): FrameLayout {
  if (id === "band") return bandLayout(label, opts);
  const ornament = ORNAMENTS.find((o) => o.id === id);
  if (!ornament) return { ops: lineFrame(id, label, opts), bandMm: 0, fellBack: false };
  const result = ornamentLayout(ornament, label, opts);
  return result.fellBack ? { ...result, ops: lineFrame("single", label, opts) } : result;
}

export function frameOps(id: string, label: FrameLabel, opts: FrameOptions): PathOp[] {
  return frameLayout(id, label, opts).ops;
}

function lineFrame(id: string, label: FrameLabel, opts: FrameOptions): PathOp[] {
  const op =(d: string, dash?: number[]): PathOp => ({
    kind: "path",
    d,
    x: 0,
    y: 0,
    scale: 1,
    stroke: { color: opts.color, widthMm: opts.strokeMm, ...(dash ? { dash } : {}) },
  });
  const { insetMm: inset, strokeMm: stroke } = opts;
  const [w, h] = [label.width - 2 * inset, label.height - 2 * inset];
  const curved = label.shape === "circle" || label.shape === "oval";
  switch (id) {
    case "double":
      return [op(outline(label, inset)), op(outline(label, inset + Math.max(stroke * 2.5, 0.8)))];
    case "dashed":
      return [op(outline(label, inset), [stroke * 4, stroke * 3])];
    case "rounded":
      return [op(curved ? outline(label, inset) : roundedPath(inset, inset, w, h, Math.max(2, Math.min(w, h) * 0.12)))];
    case "corner-ornament":
      if (curved) return [op(outline(label, inset))];
      return [op(notchedPath(inset, inset, w, h, round(Math.max(1.5, Math.min(w, h) * 0.1))))];
    case "shape":
      return [op(ellipsePath(inset, inset, w, h))];
    default:
      return [op(outline(label, inset))];
  }
}
