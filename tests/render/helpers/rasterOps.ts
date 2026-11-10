import type { RenderOp } from "../../../src/render/ops";

/** Paints the filled rectangles of path ops (as written by `rectsPath`) into an RGBA image, `pxPerMm` pixels per mm. */
export function rasterOps(ops: RenderOp[], size: { width: number; height: number }, pxPerMm: number) {
  const [w, h] = [Math.ceil(size.width * pxPerMm), Math.ceil(size.height * pxPerMm)];
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const op of ops) {
    if (op.kind !== "path" || !op.fill) continue;
    for (const m of op.d.matchAll(/M(-?[\d.e-]+) (-?[\d.e-]+)h(-?[\d.e-]+)v(-?[\d.e-]+)/g)) {
      const [x, y, rw, rh] = m.slice(1).map(Number);
      const x0 = Math.round((op.x + x * op.scale) * pxPerMm), y0 = Math.round((op.y + y * op.scale) * pxPerMm);
      const x1 = Math.round((op.x + (x + rw) * op.scale) * pxPerMm), y1 = Math.round((op.y + (y + rh) * op.scale) * pxPerMm);
      for (let py = Math.max(y0, 0); py < Math.min(y1, h); py++)
        for (let px = Math.max(x0, 0); px < Math.min(x1, w); px++) data.fill(0, (py * w + px) * 4, (py * w + px) * 4 + 3);
    }
  }
  return { data, width: w, height: h };
}
