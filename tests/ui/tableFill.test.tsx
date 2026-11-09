// @vitest-environment jsdom
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GridZone } from "../../src/core/document";
import { SheetView } from "../../src/ui/SheetView";
import { activeDesign, createStore } from "../../src/ui/store";
import { deps, memoryStorage, tmpl } from "./helpers/deps";

afterEach(cleanup);

const grid = (s: ReturnType<typeof createStore>, page = 0) => s.getState().project.pages[page].zones[0] as GridZone;

/** A shared design with two text elements ("Ad", "Fiyat") and optionally a picture. */
function open(withSymbol = false) {
  const s = createStore(tmpl("TW-2021"), memoryStorage());
  s.addText();
  s.addText();
  const [a, b] = activeDesign(s.getState()).elements;
  s.updateElement(a.id, { text: "Ad" });
  s.updateElement(b.id, { text: "Fiyat" });
  if (withSymbol) s.addSymbol("corn");
  render(<SheetView store={s} deps={deps} />);
  fireEvent.click(screen.getByRole("button", { name: "Listeden doldur" }));
  return { s, ids: [a.id, b.id] };
}
const paste = (text: string) => fireEvent.change(screen.getByLabelText("Liste (her satır bir etiket)"), { target: { value: text } });
const choose = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const upload = (file: File) => fireEvent.change(screen.getByLabelText("Dosyadan al (.xlsx, .csv)"), { target: { files: [file] } });

describe("tablodan doldurma", () => {
  it("Excel'den yapıştırılan sütunları sırayla yazı alanlarına eşler", () => {
    const { s, ids } = open();
    paste("Çay\t12,50\nKahve\t30");
    expect((screen.getByLabelText(/1\. yazı/) as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText(/2\. yazı/) as HTMLSelectElement).value).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(grid(s).content[0].values).toEqual({ [ids[0]]: "Çay", [ids[1]]: "12,50" });
    expect(grid(s).content[1].values).toEqual({ [ids[0]]: "Kahve", [ids[1]]: "30" });
  });

  it("ortak bırakılan alana dokunmaz", () => {
    const { s, ids } = open();
    paste("Çay\t12,50");
    choose(/2\. yazı/, "ortak");
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(grid(s).content[0].values).toEqual({ [ids[0]]: "Çay" });
  });

  it("ilk satır başlık seçilince başlığı etiket yapmaz ve sütun adlarını gösterir", () => {
    open();
    paste("Ürün\tTutar\nÇay\t12");
    fireEvent.click(screen.getByLabelText("İlk satır başlık"));
    expect(screen.getByRole("status").textContent).toMatch(/^1 etiket dolacak/);
    expect(screen.getAllByRole("option", { name: "Tutar" }).length).toBeGreaterThan(0);
  });

  it("alandan fazla sütun varsa söyler", () => {
    open();
    paste("a\tb\tc");
    expect(screen.getByText(/3 sütunun 1 tanesi kullanılmıyor/)).toBeTruthy();
  });

  it("öneriyi seçilen sütundan arar", () => {
    const { s } = open(true);
    paste("12\tMısır");
    choose(/Öneri sütunu/, "1");
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    const symbolId = activeDesign(s.getState()).elements.find((e) => e.kind === "symbol")!.id;
    expect(grid(s).content[0].values[symbolId]).toBe("corn");
  });

  it("ilk satırların önizlemesini gösterir", () => {
    open();
    paste("Çay\t12\nKahve\t30");
    const preview = screen.getByRole("table", { name: "Önizleme" });
    expect(preview.textContent).toContain("Kahve");
  });
});

describe("dosyadan doldurma", () => {
  it("Türkçe Windows kodlu CSV'yi başlıkla okur ve doldurur", async () => {
    const { s, ids } = open();
    const bytes = new Uint8Array([0x41, 0x64, 0x3b, 0x46, 0x69, 0x79, 0x61, 0x74, 0x0a, 0xde, 0x65, 0x6b, 0x65, 0x72, 0x3b, 0x35]); // "Ad;Fiyat\nŞeker;5"
    upload(new File([bytes], "liste.csv"));
    await screen.findByText(/liste\.csv/);
    expect((screen.getByLabelText("İlk satır başlık") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(grid(s).content[0].values).toEqual({ [ids[0]]: "Şeker", [ids[1]]: "5" });
  });

  it("çok sayfalı Excel'de sayfa seçtirir", async () => {
    const { s, ids } = open();
    const sheet = (v: string) => strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Ad</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${v}</t></is></c></row></sheetData></worksheet>`);
    const xlsx = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Mutfak" r:id="rId1"/><sheet name="Banyo" r:id="rId2"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/a.xml"/><Relationship Id="rId2" Target="worksheets/b.xml"/></Relationships>'),
      "xl/worksheets/a.xml": sheet("Un"),
      "xl/worksheets/b.xml": sheet("Sabun"),
    });
    upload(new File([xlsx], "ev.xlsx"));
    await screen.findByLabelText("Sayfa");
    choose(/^Sayfa$/, "1");
    fireEvent.click(screen.getByRole("button", { name: "Doldur" }));
    expect(grid(s).content[0].values[ids[0]]).toBe("Sabun");
  });

  it("okunamayan dosyada hatayı gösterir, yapıştırmaya dönülebilir", async () => {
    open();
    upload(new File([new Uint8Array([1, 2])], "eski.xls"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/xlsx olarak kaydedin/);
    paste("Çay");
    expect(screen.getByRole("status").textContent).toMatch(/^1 etiket/);
  });

  it("dosyayı kaldırınca yapıştırılan listeye döner", async () => {
    open();
    paste("A\nB");
    upload(new File(["X;Y\n1;2\n3;4\n5;6"], "a.csv"));
    await screen.findByText(/a\.csv/);
    expect(screen.getByRole("status").textContent).toMatch(/^3 etiket/);
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı kaldır" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^2 etiket/));
  });
});
