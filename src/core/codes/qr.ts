import qrcode from "qrcode-generator";
import type { CodeError, CodeMatrix } from "./index";

/** UTF-8 bytes as one character each: the library's default byte conversion keeps the low 8 bits. */
const utf8Binary = (value: string) => String.fromCharCode(...new TextEncoder().encode(value));

export function encodeQr(value: string): CodeMatrix | CodeError {
  const qr = qrcode(0, "M");
  try {
    qr.addData(utf8Binary(value), "Byte");
    qr.make();
  } catch {
    return { error: "Metin QR koda sığmıyor (en fazla ~2300 karakter)." };
  }
  const n = qr.getModuleCount();
  return { modules: Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x))), quiet: 4 };
}
