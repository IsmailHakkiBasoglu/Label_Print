import type { FrameOptions } from "../../core/document";
import type { Shape } from "../../core/templates";
import type { PathOp } from "../../render/ops";
import { compose, scale, transformPath, translate, type Matrix } from "./transform";

/** Part coordinates: y = 0 is the label's outer edge, y = size[1] the inner edge of the band. */
export type OrnamentPart = { size: [number, number]; d: string[]; stroke?: boolean };
export type OrnamentFrame = { id: string; name: string; category: string; corner: OrnamentPart; edge: OrnamentPart; bandRatio: number };
export type OrnamentLabel = { width: number; height: number; shape: Shape };
export type OrnamentResult = { ops: PathOp[]; bandMm: number; fellBack: boolean };

const MIN_SHORT_SIDE_MM = 12;
const MIN_BAND_MM = 2;
const MAX_BAND_MM = 12;
/** Below this band the ornament is an unreadable smudge. */
const SMALLEST_BAND_MM = 1;
const ELLIPSE_SAMPLES = 2000;

function place(part: OrnamentPart, matrix: Matrix, opts: FrameOptions): PathOp[] {
  return part.d.map((d) => ({
    kind: "path",
    d: transformPath(d, matrix),
    x: 0,
    y: 0,
    scale: 1,
    ...(part.stroke ? { stroke: { color: opts.color, widthMm: opts.strokeMm } } : { fill: opts.color }),
  }));
}

function repeatCount(length: number, step: number): number {
  return length < step ? 0 : Math.round(length / step);
}

function rectangle(frame: OrnamentFrame, label: OrnamentLabel, band: number, opts: FrameOptions): PathOp[] {
  const { corner, edge } = frame;
  const inset = opts.insetMm;
  const [right, bottom] = [label.width - inset, label.height - inset];
  const cornerScale = band / Math.max(...corner.size);
  const cornerMm = corner.size[0] * cornerScale;
  const edgeScale = band / edge.size[1];
  const step = edge.size[0] * edgeScale;
  const ops: PathOp[] = [
    ...place(corner, compose(translate(inset, inset), scale(cornerScale, cornerScale)), opts),
    ...place(corner, compose(translate(right, inset), scale(-cornerScale, cornerScale)), opts),
    ...place(corner, compose(translate(inset, bottom), scale(cornerScale, -cornerScale)), opts),
    ...place(corner, compose(translate(right, bottom), scale(-cornerScale, -cornerScale)), opts),
  ];

  const across = right - inset - 2 * cornerMm;
  const acrossCount = repeatCount(across, step);
  for (let i = 0; i < acrossCount; i++) {
    const x = inset + cornerMm + (across / acrossCount) * (i + 0.5) - step / 2;
    ops.push(...place(edge, compose(translate(x, inset), scale(edgeScale, edgeScale)), opts));
    ops.push(...place(edge, compose(translate(x, bottom), scale(edgeScale, -edgeScale)), opts));
  }

  const down = bottom - inset - 2 * cornerMm;
  const downCount = repeatCount(down, step);
  for (let i = 0; i < downCount; i++) {
    const y = inset + cornerMm + (down / downCount) * (i + 0.5) - step / 2;
    ops.push(...place(edge, [0, edgeScale, edgeScale, 0, inset, y], opts));
    ops.push(...place(edge, [0, edgeScale, -edgeScale, 0, right, y], opts));
  }
  return ops;
}

function ellipse(frame: OrnamentFrame, label: OrnamentLabel, band: number, opts: FrameOptions): PathOp[] {
  const { edge } = frame;
  const [cx, cy] = [label.width / 2, label.height / 2];
  const [a, b] = [cx - opts.insetMm, cy - opts.insetMm];
  const at = (t: number) => [cx + a * Math.cos(t), cy + b * Math.sin(t)];
  const lengths = [0];
  for (let i = 1; i <= ELLIPSE_SAMPLES; i++) {
    const [p, q] = [at(((i - 1) / ELLIPSE_SAMPLES) * 2 * Math.PI), at((i / ELLIPSE_SAMPLES) * 2 * Math.PI)];
    lengths.push(lengths[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const perimeter = lengths[ELLIPSE_SAMPLES];
  const edgeScale = band / edge.size[1];
  const step = edge.size[0] * edgeScale;
  const count = Math.max(1, repeatCount(perimeter, step));

  const ops: PathOp[] = [];
  let sample = 0;
  for (let i = 0; i < count; i++) {
    const target = (perimeter * (i + 0.5)) / count;
    while (lengths[sample + 1] < target) sample++;
    const fraction = (target - lengths[sample]) / (lengths[sample + 1] - lengths[sample]);
    const t = ((sample + fraction) / ELLIPSE_SAMPLES) * 2 * Math.PI;
    const [px, py] = at(t);
    const size = Math.hypot(a * Math.sin(t), b * Math.cos(t));
    const [tx, ty] = [(-a * Math.sin(t)) / size, (b * Math.cos(t)) / size];
    const inward = tx * (cy - py) - ty * (cx - px) > 0 ? 1 : -1;
    const [nx, ny] = [-ty * inward, tx * inward];
    ops.push(...place(edge, [edgeScale * tx, edgeScale * ty, edgeScale * nx, edgeScale * ny, px - (tx * step) / 2, py - (ty * step) / 2], opts));
  }
  return ops;
}

export function ornamentLayout(frame: OrnamentFrame, label: OrnamentLabel, opts: FrameOptions): OrnamentResult {
  const fallback: OrnamentResult = { ops: [], bandMm: 0, fellBack: true };
  const short = Math.min(label.width, label.height);
  if (short < MIN_SHORT_SIDE_MM) return fallback;
  const roomForTwoBands = (short - 2 * opts.insetMm) / 2;
  const band = Math.min(Math.max(short * frame.bandRatio, MIN_BAND_MM), MAX_BAND_MM, roomForTwoBands);
  if (band < SMALLEST_BAND_MM) return fallback;
  const curved = label.shape === "circle" || label.shape === "oval";
  return { ops: curved ? ellipse(frame, label, band, opts) : rectangle(frame, label, band, opts), bandMm: band, fellBack: false };
}
