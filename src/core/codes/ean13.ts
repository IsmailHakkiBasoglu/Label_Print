import type { CodeError, CodeMatrix } from "./index";

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((code) => [...code].reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
const R = L.map((code) => [...code].map((b) => (b === "1" ? "0" : "1")).join(""));
/** Which of L/G the six left digits use, chosen by the first digit. */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function checkDigit(twelve: string): number {
  const sum = [...twelve].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** The 13 digits to encode: spaces dropped, the check digit added to 12 digits or verified on 13. */
export function ean13Digits(value: string): string | CodeError {
  const digits = value.replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) return { error: "EAN-13 yalnız rakam içerebilir." };
  if (digits.length === 12) return digits + checkDigit(digits);
  if (digits.length !== 13) return { error: `EAN-13 için 12 veya 13 hane gerekir (${digits.length} hane var).` };
  const expected = checkDigit(digits.slice(0, 12));
  if (Number(digits[12]) !== expected) return { error: `EAN-13 kontrol hanesi yanlış; doğrusu ${expected}.` };
  return digits;
}

export function encodeEan13(value: string): CodeMatrix | CodeError {
  const digits = ean13Digits(value);
  if (typeof digits !== "string") return digits;
  const parity = PARITY[Number(digits[0])];
  const left = [...digits.slice(1, 7)].map((d, i) => (parity[i] === "L" ? L : G)[Number(d)]).join("");
  const right = [...digits.slice(7)].map((d) => R[Number(d)]).join("");
  const bits = `101${left}01010${right}101`;
  return { modules: [[...bits].map((b) => b === "1")], quiet: 11, text: digits };
}
