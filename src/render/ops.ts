import type { FontId } from "../core/document";
import type { Rect } from "../core/geometry";
import type { Shape } from "../core/templates";

/** `d` is in path units; `scale` is mm per unit; `x`, `y` place the path origin in mm. */
export type PathOp = {
  kind: "path";
  d: string;
  x: number;
  y: number;
  scale: number;
  stroke?: { color: string; widthMm: number; dash?: number[] };
  fill?: string;
};

/** `x`, `y` are the left end of the baseline in mm. */
export type TextOp = { kind: "text"; x: number; y: number; text: string; font: FontId; sizePt: number; color: string };

export type GuideOp = { kind: "guide"; rect: Rect; shape: Shape };

/** A user's PNG or JPG; `x`, `y` are the top-left corner in mm. */
export type ImageOp = { kind: "image"; imageId: string; x: number; y: number; width: number; height: number };

export type RenderOp = PathOp | TextOp | GuideOp | ImageOp;
