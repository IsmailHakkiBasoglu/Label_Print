export type Rect = { x: number; y: number; width: number; height: number };

export type GridSpec = {
  columns: number;
  rows: number;
  marginTop: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
};

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function labelRects(t: { grid: GridSpec; label: { width: number; height: number } }): Rect[] {
  const { grid, label } = t;
  const rects: Rect[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      rects.push({
        x: grid.marginLeft + col * (label.width + grid.gapX),
        y: grid.marginTop + row * (label.height + grid.gapY),
        width: label.width,
        height: label.height,
      });
    }
  }
  return rects;
}
