import type { FrameOptions } from "../core/document";
import type { Shape } from "../core/templates";
import type { PathOp } from "../render/ops";

export const FRAMES = [
  { id: "single", name: "Tek çizgi" },
  { id: "double", name: "Çift çizgi" },
  { id: "dashed", name: "Kesikli" },
  { id: "rounded", name: "Yuvarlak köşe" },
  { id: "corner-ornament", name: "Köşe süslemeli" },
  { id: "shape", name: "Oval" },
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

export function frameOps(id: string, label: FrameLabel, opts: FrameOptions): PathOp[] {
  const op = (d: string, dash?: number[]): PathOp => ({
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
