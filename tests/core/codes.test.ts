import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { code128Values, ean13Digits, encodeCode, type CodeMatrix } from "../../src/core/codes";

const bits = (row: boolean[]) => row.map((b) => (b ? "1" : "0")).join("");
const matrix = (r: ReturnType<typeof encodeCode>): CodeMatrix => {
  if (!r || "error" in r) throw new Error(`kod üretilmedi: ${JSON.stringify(r)}`);
  return r;
};
const errorOf = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : "");

/** Paints the modules, with their quiet zone, 4 pixels each, and reads them back with an independent decoder. */
function readQr(m: CodeMatrix): string | undefined {
  const scale = 4;
  const size = (m.modules.length + 2 * m.quiet) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  m.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + m.quiet) * scale + dy) * size + (x + m.quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return jsQR(data, size, size)?.data;
}

describe("EAN-13", () => {
  it("12 haneye kontrol hanesini ekler", () => expect(ean13Digits("400638133393")).toBe("4006381333931"));
  it("doğru 13 haneyi kabul eder", () => expect(ean13Digits("5901234123457")).toBe("5901234123457"));
  it("boşlukları atar", () => expect(ean13Digits("590 1234 12345")).toBe("5901234123457"));
  it("yanlış kontrol hanesinde doğrusunu söyler", () => expect(errorOf(ean13Digits("5901234123458"))).toMatch(/doğrusu 7/));
  it("harf ve tireyi reddeder", () => {
    expect(errorOf(ean13Digits("12AB"))).not.toBe("");
    expect(errorOf(ean13Digits("590-1234"))).not.toBe("");
  });
  it("çubuk desenini üretir", () => {
    const m = matrix(encodeCode("ean13", "5901234123457"));
    expect(m.modules).toHaveLength(1);
    const row = bits(m.modules[0]);
    expect(row).toHaveLength(95);
    expect(row.slice(0, 3)).toBe("101");
    expect(row.slice(45, 50)).toBe("01010");
    expect(row.slice(92)).toBe("101");
    // First digit 5 → parity LGGLLG: 9 in L is 0001011, then 0 in G is 0100111.
    expect(row.slice(3, 17)).toBe("00010110100111");
    expect(m.quiet).toBe(11);
    expect(m.text).toBe("5901234123457");
  });
});

describe("Code 128", () => {
  it("harfleri B kümesiyle kodlar", () => expect(code128Values("Wikipedia")).toEqual([104, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88, 106]));
  it("rakamları C kümesiyle kodlar", () => expect(code128Values("123456")).toEqual([105, 12, 34, 56, 44, 106]));
  it("ortadaki tek uzunluklu rakam bloğunda ilk rakamı B'de bırakır", () =>
    expect(code128Values("AB1234567")).toEqual([104, 33, 34, 17, 99, 23, 45, 67, 64, 106]));
  it("rakamdan harfe B'ye döner", () => expect(code128Values("1234AB")).toEqual([105, 12, 34, 100, 33, 34, 66, 106]));
  it("kısa rakam bloğunu B'de bırakır", () => expect((code128Values("A12") as number[])[0]).toBe(104));
  it("çubuk desenini üretir", () => {
    const m = matrix(encodeCode("code128", "Wikipedia"));
    const row = bits(m.modules[0]);
    expect(row).toHaveLength(134);
    expect(row.slice(0, 11)).toBe("11010010000");
    expect(row.slice(-13)).toBe("1100011101011");
    expect(m.quiet).toBe(10);
    expect(m.text).toBe("Wikipedia");
  });
  it("Türkçe harfte QR önerir", () => expect(errorOf(code128Values("Şeker"))).toMatch(/Türkçe harfleri kodlayamaz; QR kullanın/));
  it("80 karakterden uzununu reddeder", () => {
    expect(errorOf(code128Values("A".repeat(80)))).toBe("");
    expect(errorOf(code128Values("A".repeat(81)))).toMatch(/80/);
  });
});

describe("QR", () => {
  for (const value of ["Mısır", "Şeker ığdır ÇÖÜ", "https://ornek.com/tarif?id=12", "Ölçü ".repeat(100)]) {
    it(`geri okunur: ${value.slice(0, 20)}`, () => {
      const m = matrix(encodeCode("qr", value));
      expect(m.quiet).toBe(4);
      expect(m.modules.length).toBe(m.modules[0].length);
      expect(readQr(m)).toBe(value);
    });
  }
  it("sığmayan metinde hata verir", () => expect(errorOf(encodeCode("qr", "x".repeat(5000)))).toMatch(/QR koda sığmıyor/));
});

describe("boş içerik", () => {
  for (const format of ["qr", "code128", "ean13"] as const) it(`${format} için çizilecek bir şey yok`, () => expect(encodeCode(format, "  ")).toBeNull());
});

// An independent encoder (dev only) checks every pattern of our tables.
import CODE128B from "jsbarcode/bin/barcodes/CODE128/CODE128B.js";
import CODE128C from "jsbarcode/bin/barcodes/CODE128/CODE128C.js";
import EAN13 from "jsbarcode/bin/barcodes/EAN_UPC/EAN13.js";

describe("bağımsız kodlayıcıyla karşılaştırma", () => {
  const ours = (format: "code128" | "ean13", value: string) => bits(matrix(encodeCode(format, value)).modules[0]);
  it("Code 128 B kümesinin tüm karakterleri", () => {
    const all = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
    for (let i = 0; i < all.length; i += 40) {
      // Digits would switch our encoder to set C; keep them apart from letters so both use set B.
      const chunk = all.slice(i, i + 40).replace(/(\d)/g, "x$1");
      expect(ours("code128", chunk)).toBe((new CODE128B(chunk, {}).encode() as { data: string }).data);
    }
  });
  it("Code 128 C kümesinin tüm çiftleri", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")).join("");
    for (let i = 0; i < all.length; i += 40) {
      const chunk = all.slice(i, i + 40);
      expect(ours("code128", chunk)).toBe((new CODE128C(chunk, {}).encode() as { data: string }).data);
    }
  });
  it("EAN-13 tüm ilk haneler", () => {
    for (let d = 0; d <= 9; d++) {
      const value = ean13Digits(`${d}12345678901`) as string;
      const parts = new EAN13(value, {}).encode() as { data: string }[];
      expect(ours("ean13", value)).toBe(parts.map((p) => p.data).join(""));
    }
  });
});
