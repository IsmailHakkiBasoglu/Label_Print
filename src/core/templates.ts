import type { GridSpec } from "./geometry";

export type Shape = "rect" | "rounded" | "circle" | "oval";

export type Template = {
  id: string;
  name: string;
  sheet: { width: number; height: number };
  grid: GridSpec;
  label: { width: number; height: number; shape: Shape; cornerRadius?: number };
  source: "tanex" | "custom";
  status: "verified" | "check";
  notes?: string[];
};

const TOLERANCE = 0.01;
const A4 = { width: 210, height: 297 };

export function normalizeSheet(width: number, height: number): { width: number; height: number } {
  return Math.abs(width - A4.width) <= 1 && Math.abs(height - A4.height) <= 1 ? { ...A4 } : { width, height };
}

export function validateTemplate(t: Template): string[] {
  const errors: string[] = [];
  const { sheet, grid, label } = t;
  const all = [sheet.width, sheet.height, label.width, label.height, grid.columns, grid.rows, grid.marginTop, grid.marginLeft, grid.gapX, grid.gapY];
  if (!all.every(Number.isFinite)) return ["Tüm ölçüleri girin."];
  if (!(sheet.width > 0 && sheet.height > 0)) errors.push("Kağıt ölçüleri sıfırdan büyük olmalı.");
  if (!(label.width > 0 && label.height > 0)) errors.push("Etiket ölçüleri sıfırdan büyük olmalı.");
  if (!(Number.isInteger(grid.columns) && grid.columns >= 1)) errors.push("Sütun sayısı en az 1 tam sayı olmalı.");
  if (!(Number.isInteger(grid.rows) && grid.rows >= 1)) errors.push("Satır sayısı en az 1 tam sayı olmalı.");
  if (grid.marginTop < 0 || grid.marginLeft < 0) errors.push("Kenar boşlukları negatif olamaz.");
  if (grid.gapX < 0 || grid.gapY < 0) errors.push("Etiket aralıkları negatif olamaz.");
  const right = grid.marginLeft + grid.columns * label.width + (grid.columns - 1) * grid.gapX;
  if (right > sheet.width + TOLERANCE) errors.push(`Izgara kağıt genişliğini aşıyor (${right.toFixed(2)} mm).`);
  const bottom = grid.marginTop + grid.rows * label.height + (grid.rows - 1) * grid.gapY;
  if (bottom > sheet.height + TOLERANCE) errors.push(`Izgara kağıt yüksekliğini aşıyor (${bottom.toFixed(2)} mm).`);
  return errors;
}
