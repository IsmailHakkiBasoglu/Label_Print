import type { Template } from "../../src/core/templates";

const SYMMETRY_MM = 1;

/** Word files can describe only part of a sheet; these layouts are suspicious even when they parse. */
export function plausibilityNotes(t: Template): string[] {
  const notes: string[] = [];
  const { sheet, grid, label } = t;
  if (sheet.width !== 210 || sheet.height !== 297) notes.push(`Word sayfası A4 değil (${sheet.width.toFixed(2)}×${sheet.height.toFixed(2)} mm).`);
  const right = sheet.width - (grid.marginLeft + grid.columns * label.width + (grid.columns - 1) * grid.gapX);
  const bottom = sheet.height - (grid.marginTop + grid.rows * label.height + (grid.rows - 1) * grid.gapY);
  if (Math.abs(right - grid.marginLeft) > SYMMETRY_MM) notes.push(`Yatay boşluklar dengesiz (sol ${grid.marginLeft.toFixed(2)}, sağ ${right.toFixed(2)} mm).`);
  if (right >= label.width) notes.push("Sağda bir sütun daha sığıyor; Word dosyası eksik olabilir.");
  if (bottom >= label.height) notes.push("Altta bir satır daha sığıyor; Word dosyası eksik olabilir.");
  return notes;
}
