import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeText, parseDelimited, parsePasted, readTableFile, toTable, TableImportError, TABLE_LIMITS } from "../../src/core/tableImport";

const u8 = (bytes: number[]) => new Uint8Array(bytes);

describe("decodeText", () => {
  it("UTF-8 BOM'unu atar", () => expect(decodeText(u8([0xef, 0xbb, 0xbf, 0xc5, 0x9e, 0x65]))).toBe("Şe"));
  it("geçersiz UTF-8'i Türkçe Windows kodlaması olarak okur", () => {
    // "Şeker;Çay;ığ" in windows-1254
    expect(decodeText(u8([0xde, 0x65, 0x6b, 0x65, 0x72, 0x3b, 0xc7, 0x61, 0x79, 0x3b, 0xfd, 0xf0]))).toBe("Şeker;Çay;ığ");
  });
});

describe("parseDelimited", () => {
  it("noktalı virgülü tanır", () => expect(parseDelimited("Ad;Fiyat\nÇay;12,50")).toEqual([["Ad", "Fiyat"], ["Çay", "12,50"]]));
  it("virgülü tanır", () => expect(parseDelimited("Ad,Fiyat\r\nÇay,12")).toEqual([["Ad", "Fiyat"], ["Çay", "12"]]));
  it("sekmeyi tanır", () => expect(parseDelimited("Ad\tNot\nÇay\tsiyah, demlik")).toEqual([["Ad", "Not"], ["Çay", "siyah, demlik"]]));
  it("tırnak içindeki ayırıcı, tırnak ve satır sonunu korur", () =>
    expect(parseDelimited('Ad;Not\n"Çay; siyah";"iki ""tırnak""\nsatır"')).toEqual([["Ad", "Not"], ["Çay; siyah", 'iki "tırnak"\nsatır']]));
  it("sondaki boş satırı atar", () => expect(parseDelimited("A;B\n\n")).toEqual([["A", "B"]]));
});

describe("parsePasted", () => {
  it("sekmesiz metni tek sütun sayar, virgüle dokunmaz", () => expect(parsePasted("Tuz, kaya\nŞeker")).toEqual([["Tuz, kaya"], ["Şeker"]]));
  it("Excel'den kopyalanan sekmeli metni sütunlara böler", () => expect(parsePasted("Çay\t12\nKahve\t30\n")).toEqual([["Çay", "12"], ["Kahve", "30"]]));
});

describe("toTable", () => {
  it("başlık satırını sütun adı yapar, boş satırları atar, eksikleri doldurur", () => {
    expect(toTable([["Ad", "", "Fiyat"], ["  Çay ", "x"], ["", " "], ["Kahve", "", "30"]], true)).toEqual({
      columns: ["Ad", "Sütun 2", "Fiyat"],
      rows: [["Çay", "x", ""], ["Kahve", "", "30"]],
    });
  });
  it("başlıksız tabloda sütunları numaralar", () => expect(toTable([["A", "B"]], false)).toEqual({ columns: ["Sütun 1", "Sütun 2"], rows: [["A", "B"]] }));
});

function xlsx(sheets: Record<string, string>, options: { sharedStrings?: string[]; styles?: string; date1904?: boolean } = {}) {
  const names = Object.keys(sheets);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${options.date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>${names
        .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="${i === 0 ? "worksheets" : "/xl/worksheets"}/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
    ),
  };
  names.forEach((n, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<worksheet><sheetData>${sheets[n]}</sheetData></worksheet>`)));
  if (options.sharedStrings) files["xl/sharedStrings.xml"] = strToU8(`<sst>${options.sharedStrings.join("")}</sst>`);
  if (options.styles) files["xl/styles.xml"] = strToU8(options.styles);
  return zipSync(files);
}

const STYLES = `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;TL&quot;"/></numFmts>
<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`;

describe("readTableFile xlsx", () => {
  it("paylaşılan, satır içi ve zengin metinleri, sayıları ve tarihleri okur", async () => {
    const file = xlsx(
      {
        Ürünler:
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Tarih</t></is></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>12.5</v></c><c r="C2" s="1"><v>45000</v></c><c r="D2" s="2"><v>45001</v></c><c r="E2" s="3"><v>7</v></c></row>' +
          '<row r="4"><c r="A4" t="str"><v>Kahve &amp; süt</v></c><c r="B4" t="b"><v>1</v></c><c r="C4" t="e"><v>#DIV/0!</v></c><c r="D4"><v>0.1</v></c></row>',
        Boş: "",
      },
      { sharedStrings: ["<si><t>Ad</t></si>", '<si><r><t>Ça</t></r><r><t xml:space="preserve">y </t></r></si>'], styles: STYLES },
    );
    const table = await readTableFile("liste.xlsx", file);
    expect(table.sheets.map((s) => s.name)).toEqual(["Ürünler", "Boş"]);
    expect(table.sheets[0].rows).toEqual([
      ["Ad", "", "Tarih"],
      ["Çay ", "12,5", "15.03.2023", "16.03.2023", "7"],
      ["Kahve & süt", "DOĞRU", "", "0,1"],
    ]);
    expect(table.sheets[1].rows).toEqual([]);
  });

  it("13 haneli barkod sayısını tam ve baştaki sıfırlarıyla okur", async () => {
    const styles = `<styleSheet><numFmts><numFmt numFmtId="170" formatCode="0000000000000"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="170"/></cellXfs></styleSheet>`;
    const file = xlsx({ A: '<row r="1"><c r="A1"><v>8690504012345</v></c><c r="B1" s="1"><v>123456789012</v></c><c r="C1"><v>1086375557997</v></c></row>' }, { styles });
    expect((await readTableFile("a.xlsx", file)).sheets[0].rows).toEqual([["8690504012345", "0123456789012", "1086375557997"]]);
  });

  it("1904 tarih sistemini hesaba katar", async () => {
    const file = xlsx({ A: '<row r="1"><c r="A1" s="1"><v>0</v></c></row>' }, { styles: STYLES, date1904: true });
    expect((await readTableFile("a.xlsx", file)).sheets[0].rows).toEqual([["01.01.1904"]]);
  });

  it("bozuk xlsx için anlaşılır hata verir", async () => {
    await expect(readTableFile("a.xlsx", u8([0x50, 0x4b, 3, 4, 1, 2]))).rejects.toThrow(TableImportError);
    await expect(readTableFile("a.xlsx", zipSync({ "a.txt": strToU8("x") }))).rejects.toThrow(/Excel dosyası okunamadı/);
  });
});

describe("readTableFile sınırlar ve biçimler", () => {
  it("CSV'yi kodlamasını ve ayırıcısını bularak okur", async () => {
    const table = await readTableFile("liste.CSV", u8([0xde, 0x65, 0x6b, 0x65, 0x72, 0x3b, 0x31, 0x0a, 0xc7, 0x61, 0x79, 0x3b, 0x32]));
    expect(table.sheets).toEqual([{ name: "liste.CSV", rows: [["Şeker", "1"], ["Çay", "2"]] }]);
  });

  it("eski .xls dosyasını reddeder", async () => {
    await expect(readTableFile("eski.xls", u8([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow(/xlsx olarak kaydedin/);
  });

  it("tanınmayan uzantıyı reddeder", async () => {
    await expect(readTableFile("a.pdf", u8([1]))).rejects.toThrow(/xlsx veya .csv/);
  });

  it("büyük dosyayı reddeder", async () => {
    await expect(readTableFile("a.csv", new Uint8Array(TABLE_LIMITS.bytes + 1))).rejects.toThrow(/5 MB/);
  });

  it("çok satırlı dosyayı reddeder", async () => {
    const text = Array.from({ length: TABLE_LIMITS.rows + 1 }, (_, i) => `S${i}`).join("\n");
    await expect(readTableFile("a.csv", strToU8(text))).rejects.toThrow(/5\.000 satır/);
  });
});
