import { describe, expect, it } from "vitest";
import { parseListHtml, parseSize } from "../../tools/import-tanex/parse-list";

describe("parseListHtml", () => {
  const html = `<table><tbody>
  <tr class=''><td class=''>TW-2000 210&#215;297 mm</td><td class=''><div><a href='https://x/a.docx' class='b'><span>İndir</span></a></div></td></tr>
  <tr class=''><td class=''>64&#215;100 mm</td><td class=''><div><a href='https://x/b.docx'>İndir</a></div></td></tr>
  </tbody></table>`;

  it("reads coded rows", () => {
    expect(parseListHtml(html)[0]).toEqual({ code: "TW-2000", sizeText: "210×297 mm", url: "https://x/a.docx", section: 1 });
  });

  it("reads uncoded rows as section 2", () => {
    expect(parseListHtml(html)[1]).toEqual({ code: null, sizeText: "64×100 mm", url: "https://x/b.docx", section: 2 });
  });
});

describe("parseSize", () => {
  it("accepts comma decimals", () => {
    expect(parseSize("70×50,8", "u")).toEqual({ width: 70, height: 50.8, shape: "rect", singleDimension: false });
  });

  it("accepts latin x", () => {
    expect(parseSize("105x72mm", "u").height).toBe(72);
  });

  it("reads round from the text", () => {
    expect(parseSize("30mm Yuvarlak", "u")).toEqual({ width: 30, height: 30, shape: "circle", singleDimension: false });
  });

  it("reads round from the file name", () => {
    expect(parseSize("15 mm", "TW-2215_15mm_Yuvarlak.docx").shape).toBe("circle");
  });

  it("flags a single dimension of unknown shape", () => {
    expect(parseSize("25 mm", "TW-212525mm.docx").singleDimension).toBe(true);
  });

  it("reads oval", () => {
    expect(parseSize("40.6×25.4 mm oval", "u").shape).toBe("oval");
  });
});
