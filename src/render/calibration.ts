import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, lineTo, moveTo, popGraphicsState, pushGraphicsState, setLineWidth, stroke } from "pdf-lib";
import { mmToPt } from "../core/geometry";
import type { FontBytes } from "./fonts";

const MARGIN = 10;
const TICK = 3;
const CROSS = 4;

export async function calibrationPdf(sheet: { width: number; height: number }, fontBytes: FontBytes): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes.sans, { subset: true });
  const pageHeight = mmToPt(sheet.height);
  const page = doc.addPage([mmToPt(sheet.width), pageHeight]);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    page.pushOperators(pushGraphicsState(), setLineWidth(0.4), moveTo(mmToPt(x1), pageHeight - mmToPt(y1)), lineTo(mmToPt(x2), pageHeight - mmToPt(y2)), stroke(), popGraphicsState());
  };
  const write = (s: string, x: number, y: number, size = 8) => page.drawText(s, { x: mmToPt(x), y: pageHeight - mmToPt(y), size, font });

  const right = sheet.width - MARGIN;
  const bottom = sheet.height - MARGIN;
  for (const [x, y] of [[MARGIN, MARGIN], [right, MARGIN], [MARGIN, bottom], [right, bottom]]) {
    line(x - CROSS, y, x + CROSS, y);
    line(x, y - CROSS, x, y + CROSS);
  }
  const rulerX = MARGIN + 15;
  const rulerY = MARGIN + 15;
  line(rulerX, rulerY, right - 5, rulerY);
  for (let d = 0; rulerX + d <= right - 5; d += 10) {
    line(rulerX + d, rulerY, rulerX + d, rulerY + TICK);
    write(String(d), rulerX + d - 1, rulerY + TICK + 3, 6);
  }
  line(rulerX, rulerY, rulerX, bottom - 5);
  for (let d = 0; rulerY + d <= bottom - 5; d += 10) {
    line(rulerX, rulerY + d, rulerX + TICK, rulerY + d);
    if (d) write(String(d), rulerX + TICK + 1, rulerY + d + 1, 6);
  }
  const [cx, cy] = [sheet.width / 2 - 45, sheet.height / 2];
  write("Label Print kalibrasyon sayfası", cx, cy - 18, 12);
  write("Bu sayfayı Gerçek boyut / %100 ölçekle yazdırın.", cx, cy - 10);
  write("Cetvelleri ölçün: her büyük çizgi 10 mm olmalı.", cx, cy - 5);
  write(`Artı işaretleri kenarlardan ${MARGIN} mm içeride olmalı. Kayma varsa`, cx, cy);
  write("farkı uygulamadaki Yazıcı düzeltmesi X/Y alanlarına girin.", cx, cy + 5);
  return doc.save();
}
