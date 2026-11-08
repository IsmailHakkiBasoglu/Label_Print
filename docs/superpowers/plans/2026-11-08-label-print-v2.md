# Label Print v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Izgaradaki her hücreye farklı içerik basmak, süslü çerçeve kütüphanesi ve renkli görsel kütüphanesi eklemek.

**Architecture:** Belge modeli sürüm 2 olur: ortak tasarım + hücre değerleri + ayrılmış hücreler. Süslü çerçeveler noktaları önceden dönüştürülmüş sıradan `PathOp` üretir. Renkli vektörler `VectorPath` üzerinde renk taşır, yüklenen PNG/JPG yeni `ImageOp` ile çizilir ve baytları IndexedDB'de durur.

**Tech Stack:** Vite, TypeScript strict, React 19, Vitest, pdf-lib, testing-library.

**Spec:** `docs/superpowers/specs/2026-11-08-label-print-v2-design.md`

## Global Constraints

- Tüm ölçüler mm; `pt = mm×72/25.4`. Önizleme ve PDF aynı `RenderOp[]` listesinden üretilir.
- Yazı tipleri `subset:false` gömülür.
- Kullanıcıya görünen metinler Türkçe.
- Commit mesajlarında Claude/Co-Authored-By satırı yok.
- Üç aşama sırayla: A, B, C. Her aşama sonunda test, derleme, tarayıcı denemesi, PDF'in gözle kontrolü, `main`'e birleştirme ve push.
- Yeni çalışma zamanı bağımlılığı eklenmez.

## Review Focus

1. Desen uygulamak öğe kimliklerini yeniler: hücre değerleri kaybolmamalı (Görev 3).
2. Windows satır sonları, Türkçe harfler ve yalnız boşluk içeren satırlar listede temiz işlenmeli (Görev 4).
3. Liste yeni sayfa açtıktan sonra geri alınınca etkin sayfa geçerli kalmalı (Görev 3, 4).
4. Küçülen şablonda ayrılmış hücrelerin tasarımları `project.designs` içinde artık kalmamalı (Görev 3).
5. Çok dar etiketlerde (200×20 mm gibi) köşeler birbirine binmemeli, süs etiketten taşmamalı (Görev 7).

---

## Aşama A: hücre başına içerik

### Task 1: Belge modeli v2 ve v1 çevirisi

**Files:**
- Modify: `src/core/document.ts`, `src/render/layout.ts`, `src/ui/store.ts`
- Test: `tests/core/document.test.ts` (mevcut `designIds` beklentileri güncellenir)

**Interfaces:**
- Produces: spec'teki `CellEntry`, `ImageMeta`, `LabelProject` (`version: 2`); `Page` üzerine `fromList?: boolean`; `GridZone` için `designId: string`, `content: Record<number, CellEntry>`; `migrateV1(value: any): LabelProject`.

- [ ] **Step 1: Failing testleri yaz**

```ts
test("v1 tek tasarım çevrilir", () => {
  const r = parseProject(JSON.stringify(v1({ designIds: ["d1"] })));
  expect(r.ok && r.project.version).toBe(2);
  expect(r.ok && r.project.pages[0].zones[0]).toMatchObject({ designId: "d1", content: {} });
  expect(r.ok && r.project.images).toEqual({});
});
test("v1 döngüsel tasarımlar ayrılmış hücre olur", () => {
  const r = parseProject(JSON.stringify(v1({ designIds: ["a", "b"], used: [0, 1, 2] })));
  expect(r.ok && r.project.pages[0].zones[0]).toMatchObject({ designId: "a", content: { 1: { values: {}, designId: "b" } } });
});
test("hatalı v2 hücresi reddedilir", () => expect(parseProject(JSON.stringify(v2({ content: { x: { values: 3 } } }))).ok).toBe(false));
```

- [ ] **Step 2:** `npx vitest run tests/core/document.test.ts` çalıştır. Beklenen: FAIL.
- [ ] **Step 3:** Modeli ve doğrulamayı yaz; `content` anahtarları negatif olmayan tam sayı metni, `values` metin haritası olmalı. `layoutProject` ve mağaza derlensin diye `designIds[...]` yerine `designId` kullansın.
- [ ] **Step 4:** Mağaza `labelprint.project.v2` yazar; yoksa `labelprint.project.v1` okur. Test: eski anahtardaki proje açılır ve ilk değişiklik yeni anahtara yazar.
- [ ] **Step 5:** `npm test` ve `npx tsc --noEmit`. Beklenen: hepsi geçer. Commit: `feat: belge modeli surum 2`.

### Task 2: Hücre tasarımını çözme ve basım

**Files:**
- Create: `src/core/cells.ts`
- Modify: `src/render/layout.ts`
- Test: `tests/core/cells.test.ts`, `tests/render/pdf.test.ts`

**Interfaces:**
- Produces: `resolveCellDesign(zone: GridZone, index: number, designs: Record<string, LabelDesign>): LabelDesign | undefined`. Dönen tasarım kopyadır ve boş değerli öğeleri içermez.

- [ ] **Step 1: Failing testler**

```ts
expect(text(resolve({ content: { 1: { values: { t: "Mısır" } } } }, 1))).toBe("Mısır");
expect(text(resolve({ content: {} }, 1))).toBe("Ortak");
expect(resolve({ content: { 1: { values: { t: "" } } } }, 1).elements).toHaveLength(0);
expect(resolve({ content: { 1: { values: { yok: "x" } } } }, 1).elements[0].id).toBe("t");
expect(resolve({ content: { 1: { values: {}, designId: "ayri" } } }, 1)).toEqual(designs.ayri);
```

PDF testi: iki hücreli projede `readPdf` metninde "Mısır" ve "Nohut" bulunur; etiket konumları tek içerikli proje ile aynıdır.

- [ ] **Step 2:** Testleri çalıştır. Beklenen: FAIL.
- [ ] **Step 3:** `layoutProject` hücre döngüsünde `resolveCellDesign` kullansın; `designIds` kalıntıları silinsin.
- [ ] **Step 4:** `npm test`. Commit: `feat: hucre degerlerini bas`.

### Task 3: Mağaza: sayfa, kapsam, hücre işlemleri

**Files:**
- Modify: `src/ui/store.ts`, `src/ui/LabelEditor.tsx`, `src/ui/LibraryPanel.tsx`, `src/ui/SheetView.tsx`, `src/ui/Toolbar.tsx`
- Test: `tests/ui/store.test.ts`

**Interfaces:**
- Produces: `AppState.pageIndex: number`, `AppState.scope: { kind: "all" } | { kind: "cell"; cell: number }`, `editingDesign(state): LabelDesign` (editörün göstereceği çözülmüş tasarım), mağazada `setPage(i)`, `addPage()`, `removePage(i)`, `setScope(scope)`, `setCellValue(cell, elementId, value)`, `clearCellValue(cell, elementId)`, `detachCell(cell)`, `reattachCell(cell)`.

- [ ] **Step 1: Failing testler**

```ts
test("hücre değeri ortak tasarımı değiştirmez", ...);
test("detachCell değerleri tasarıma yazar, designId atar", ...);
test("reattachCell tasarımı siler, uyuşan değerleri korur", ...);
test("ayrılmış hücrede updateElement yalnız kendi tasarımını değiştirir", ...);
test("desen uygulanınca hücre değerleri aynı türdeki yeni öğelere sırayla taşınır", ...);
test("küçülen şablon sığmayan içeriği ve ayrılmış tasarımları siler, 'project.designs' temiz kalır", ...);
test("şablon tüm sayfalara uygulanır", ...);
test("geri alınca pageIndex son geçerli sayfaya çekilir", ...);
test("sayfalar arası geçiş geri alma geçmişine girmez", ...);
```

- [ ] **Step 2:** Testleri çalıştır. Beklenen: FAIL.
- [ ] **Step 3:** `pages[0]` kullanımlarını `pages[pageIndex]` yap. `applyPattern`, eski öğe kimliklerini yeni öğelere tür içi sırayla eşleyerek ortak hücrelerdeki `values` anahtarlarını yeniden yazar. Ayrılmış hücrelerin desen sonrası tasarımları değişmez.
- [ ] **Step 4:** `npm test` ve `npx tsc --noEmit`. Commit: `feat: hucre ve sayfa islemleri`.

### Task 4: Listeden doldurma mantığı

**Files:**
- Create: `src/core/listFill.ts`
- Test: `tests/core/listFill.test.ts`
- Modify: `src/ui/store.ts`

**Interfaces:**
- Produces: `parseLines(text: string): string[]`; `applyListFill(project, pageIndex, lines, { suggest: (line: string, sample: string) => string | null, cellCount, newId }): { project: LabelProject; report: { filled: number; pagesAdded: number; unusedCells: number; noSymbol: number } }`; `previewListFill(...)` aynı raporu projeyi değiştirmeden verir. Mağazada `fillFromList(lines, suggestOn)`.

- [ ] **Step 1: Failing testler**

```ts
expect(parseLines("Mısır\r\n\r\n  Nohut  \n   \n")).toEqual(["Mısır", "Nohut"]);
// used: [2,3], 2 satır → yalnız 2 ve 3 dolar
// used: 21 hücre, 30 satır → pagesAdded 1, yeni sayfa fromList:true ve tüm hücreler kullanılabilir
// 5 hücre, 3 satır → cells.used yalnız ilk 3, unusedCells 2
// suggest null → values[symbolId] === "" ve noSymbol 1
// tasarımda yazı yoksa merkeze yazı öğesi eklenir
// tasarımda görsel yoksa suggest hiç çağrılmaz
// ikinci doldurma eski fromList sayfalarını kaldırır, elle eklenen sayfaya dokunmaz
```

- [ ] **Step 2:** Testleri çalıştır. Beklenen: FAIL.
- [ ] **Step 3:** Yaz. Yeni sayfa, kaynak sayfanın sayfa ölçüsünü, şablonunu ve `designId` değerini kopyalar. `fromList` alanını spec'teki `Page` tipine işle.
- [ ] **Step 4:** `npm test`. Commit: `feat: listeden doldurma`.

### Task 5: Arayüz: hücre seçimi, özellikler, liste, sayfalar

**Files:**
- Create: `src/ui/ListFillDialog.tsx`, `src/ui/PageNav.tsx`
- Modify: `src/ui/SheetView.tsx`, `src/render/preview.tsx`, `src/ui/PropertiesPanel.tsx`, `src/ui/LabelEditor.tsx`, `src/ui/Toolbar.tsx`, `src/ui/app.css`
- Test: `tests/ui/editor.test.tsx`, `tests/render/preview.test.tsx`

**Interfaces:**
- Consumes: Görev 3 ve 4'teki mağaza işlemleri.
- Produces: `SheetPreview` için `selectedCell?: number`, `cellMarks?: Record<number, "value" | "detached">`.

- [ ] **Step 1: Failing testler:** hücreye tıklayınca kapsam "Bu hücre" olur; "Hücre seç" modunda eski kullan/kullanma çalışır; hücre kapsamında konum alanları kapalı ve metin alanı hücre değerini yazar; "Bu hücreyi ayır" denetimleri açar; liste penceresi doldurmadan önce raporu gösterir; görselsiz tasarımda öneri kapalıdır ve açıklama görünür; sayfa geçişi önizlemeyi değiştirir; şablon küçülmesi onay ister.
- [ ] **Step 2:** Testleri çalıştır. Beklenen: FAIL.
- [ ] **Step 3:** Yaz. "Sembol" sekmesinde görsel seçimi, hücre kapsamında ve seçili görsel öğesi varsa `setCellValue` çağırır, yoksa v1 gibi ekler.
- [ ] **Step 4:** `npm test`, `npm run build`.
- [ ] **Step 5:** Tarayıcıda 30 satırlık Türkçe listeyle doldur, PDF al, sayfaları gözle kontrol et. Birleştir, push et. Commit: `feat: hucre duzenleme arayuzu`.

---

## Aşama B: süslü çerçeveler

### Task 6: Parça dönüştürücü

**Files:**
- Create: `src/library/ornaments/transform.ts`
- Test: `tests/library/ornaments.test.ts`

**Interfaces:**
- Produces: `type Matrix = [number, number, number, number, number, number]`; `transformPath(d: string, m: Matrix): string`; `translate`, `scale`, `rotate`, `compose`.

- [ ] **Step 1: Failing testler**

```ts
expect(transformPath("M1 2L3 4Z", scale(2, 2))).toBe("M2 4L6 8Z");
expect(transformPath("M0 0C1 0 1 1 0 1", rotate(90))).toMatch(/^M0 0C/);
expect(() => transformPath("M0 0A1 1 0 0 0 1 1", scale(1, 1))).toThrow();
```

- [ ] **Step 2:** Çalıştır, FAIL gör. **Step 3:** Yaz. **Step 4:** PASS. Commit: `feat: susleme yol donusturucu`.

### Task 7: Yerleştirme

**Files:**
- Create: `src/library/ornaments/layout.ts`
- Modify: `src/library/frames.ts`, `src/render/layout.ts`
- Test: `tests/library/ornaments.test.ts`

**Interfaces:**
- Produces: spec'teki `OrnamentPart`, `OrnamentFrame`; `ornamentLayout(frame, label, opts): { ops: PathOp[]; bandMm: number; fellBack: boolean }`; `frameLayout(id, label, opts)` hem eski hem süslü çerçeveleri aynı sonuçla verir; `frameOps` onun `ops` alanını döner.

- [ ] **Step 1: Failing testler**

```ts
// 63.5×38.1: X ve Y ölçeği eşit (test parçası kare, çıktı sınır kutusu kare)
// bant: min(w,h)*bandRatio, 2 ile 12 mm arası
// kenar motifi sayısı round(L/adım), L eşit dağılır; ardışık aralıklar ±0.001 mm
// 200×20: köşeler binmez, tüm noktalar [inset, w-inset] içinde
// 10×30: fellBack true, tek çizgi
// oval 60×40: motifler kenar üzerinde, ardışık yay uzunlukları eşit (±%2)
// daire ve ovalde köşe yok
// v1 çerçeve kimlikleri çıktısı değişmez (mevcut testler)
```

- [ ] **Step 2:** FAIL gör. **Step 3:** Yaz. `designOps`, `fellBack` için uyarı ekler; `bandMm > 0` iken yazı/görsel kutusu banda giriyorsa "Yazı veya görsel çerçeve süsüne değiyor." uyarısı verir. **Step 4:** `npm test`. Commit: `feat: suslu cerceve yerlesimi`.

### Task 8: Çerçeve kütüphanesi ve panel

**Files:**
- Create: `src/library/ornaments/frames.data.ts`
- Modify: `src/library/frames.ts`, `src/ui/LibraryPanel.tsx`, `src/ui/app.css`
- Test: `tests/library/ornaments.test.ts`, `tests/ui/editor.test.tsx`

- [ ] **Step 1: Failing testler:** en az 24 süslü çerçeve; kimlikler benzersiz; 6 kategori (klasik, bitkisel, kurdele, geometrik, mutfak, vintage) dolu; her parça yalnız `M L C Z` kullanır; her çerçeve üç ölçüde (63.5×38.1, 99.1×34, daire 40) `renderPdf` ile hatasız PDF üretir; panelde kategori süzgeci ve önizleme görünür.
- [ ] **Step 2:** FAIL gör.
- [ ] **Step 3:** Çerçeveleri özgün olarak çiz, paneli ekle.
- [ ] **Step 4:** `npm test`, `npm run build`.
- [ ] **Step 5:** Tarayıcıda bütün çerçeveleri gözle kontrol et, örnek PDF al; kötü görünenleri düzelt. Birleştir, push et. Commit: `feat: suslu cerceve kutuphanesi`.

---

## Aşama C: renkli görseller

### Task 9: SVG renkleri

**Files:**
- Modify: `src/library/symbols/svg.ts`, `src/render/layout.ts`, `src/ui/IconView.tsx`, `src/ui/PropertiesPanel.tsx`
- Test: `tests/library/symbols.test.ts`, `tests/render/pdf.test.ts`

**Interfaces:**
- Produces: `VectorPath.fillColor?`, `VectorPath.strokeColor?`; `isMultiColor(icon): boolean`.

- [ ] **Step 1: Failing testler**

```ts
expect(ok(parseSvg(`<svg viewBox="0 0 1 1"><path d="M0 0" fill="#ff0000"/></svg>`)).paths[0].fillColor).toBe("#ff0000");
expect(ok(parseSvg(`...fill="currentColor"...`)).paths[0].fillColor).toBeUndefined();
expect(parseSvg(`...fill="url(#g)"...`)).toEqual({ error: expect.stringContaining("Gradyan") });
// tek renk kataloğun layout çıktısı değişmez; üç haneli #abc altı haneye açılır; adlı renk (red) reddedilmez, öğe rengine düşmez, hex'e çevrilir veya açık hata verir
```

- [ ] **Step 2:** FAIL gör. **Step 3:** Yaz. **Step 4:** `npm test`. Commit: `feat: svg renklerini koru`.

### Task 10: Hazır renkli katalog

**Files:**
- Create: `src/library/symbols/color-source.json`, `src/library/symbols/catalog.color.generated.json`, `src/library/symbols/colorCatalog.ts`
- Modify: `tools/build-symbols.ts`, `src/ui/App.tsx`, `src/ui/LibraryPanel.tsx`, `THIRD_PARTY.md`
- Test: `tests/library/symbols.test.ts`

**Interfaces:**
- Produces: `loadColorCatalog(): Promise<SymbolEntry[]>` (dinamik `import`), kimlikler `color:` önekli.

- [ ] **Step 1:** Lisansı kaynağından doğrula (beklenen MIT). Değilse dur ve sor. Depoyu scratchpad içinde boş bir klasöre indir; repoya yalnız üretilmiş katalog girer.
- [ ] **Step 2: Failing testler:** en az 300 görsel; kimlikler `color:` önekli ve benzersiz; hepsinde renk var; `searchSymbols("mısır", 5, renkli)` sonuç verir, ayrıca zeytin, nohut, un, biber, tuz, şeker, çay, kahve de; hiçbir yolda `url(` yok.
- [ ] **Step 3:** FAIL gör. **Step 4:** Türkçe etiketli kaynağı ve üreticiyi yaz. Üretici gradyanlı dosyaları raporlar.
- [ ] **Step 5:** `App`, fontlarla birlikte renkli kataloğu bekler ve `deps.symbols`'a katar. Panele "Tek renk / Renkli" sekmelerini ekle. Liste önerisi ilk görselin türüne göre katalog seçsin.
- [ ] **Step 6:** `npm test`, `npm run build`; ana paketin büyümediğini ve katalogun ayrı parça olduğunu derleme çıktısından doğrula. Commit: `feat: renkli gorsel katalogu`.

### Task 11: Yüklenen görsellerin depolanması ve çizimi

**Files:**
- Create: `src/core/imageStore.ts`
- Modify: `src/render/ops.ts`, `src/render/layout.ts`, `src/render/pdf.ts`, `src/render/preview.tsx`, `src/ui/App.tsx`
- Test: `tests/core/imageStore.test.ts`, `tests/render/pdf.test.ts`, `tests/render/preview.test.tsx`, `tests/ui/helpers/deps.ts`

**Interfaces:**
- Produces: spec'teki `ImageOp`; `sniffImage(bytes): "image/png" | "image/jpeg" | "image/svg+xml" | null`; `sha256Hex(bytes)`; `type ImageStore = { put(id, bytes): Promise<void>; get(id): Promise<Uint8Array | undefined> }`; `createIdbImageStore()`, `createMemoryImageStore()`. `RenderDeps` için `imageBytes(id): Promise<Uint8Array | undefined>`; önizleme için `ImageUrlContext`.

- [ ] **Step 1: Failing testler**

```ts
expect(sniffImage(pngHeader)).toBe("image/png");
expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
// aynı görsel 21 hücrede: PDF'te tek görüntü nesnesi
// 300 px genişlik, 50 mm öğe: uyarıda "152 DPI"; 600 px, 50 mm: uyarı yok
// en-boy oranı korunur, kutuya ortalanır
// bayt yok: renderPdf { ok:false } ve açık hata
// meta yok: layout hatası
```

- [ ] **Step 2:** FAIL gör. **Step 3:** Yaz. **Step 4:** `npm test`. Commit: `feat: yuklenen gorselleri ciz`.

### Task 12: Yükleme arayüzü ve taşınabilir dosya

**Files:**
- Modify: `src/ui/LibraryPanel.tsx`, `src/ui/Toolbar.tsx`, `src/ui/store.ts`, `src/core/document.ts`, `src/library/symbols/custom.ts`
- Test: `tests/core/document.test.ts`, `tests/ui/store.test.ts`, `tests/ui/editor.test.tsx`

**Interfaces:**
- Produces: `exportProject(project, deps): Promise<string>` (`imageData`, `symbolData` ekler); `importProject(text, deps): Promise<ParseResult>`; mağazada `addImage(meta, id)`.

- [ ] **Step 1: Failing testler:** 10 MB üstü ve tanınmayan tür reddedilir; 200 KB üstü SVG reddedilir; PNG yüklenince `localStorage`'a yazılan metinde base64 yok; dışa aktarma sonra içe aktarma baytları ve kullanılan özel SVG'leri geri getirir; `imageData` içinde olmayan görsel içe aktarmada hata değil uyarıdır; gömülemeyen dosya yükleme anında reddedilir; IndexedDB yoksa açık mesaj çıkar.
- [ ] **Step 2:** FAIL gör. **Step 3:** Yaz. **Step 4:** `npm test`, `npm run build`.
- [ ] **Step 5:** Tarayıcıda PNG, JPG, SVG yükle, karışık tek renk/renkli etiket yap, sayfayı yenile, kaydet/aç ile doğrula, PDF'i gözle kontrol et. Birleştir, push et. Commit: `feat: gorsel yukleme ve tasinabilir dosya`.

### Task 13: Belgeler ve son inceleme

**Files:** `README.md`, `CHANGELOG.md`, `YOL_HARITASI.md`, `THIRD_PARTY.md`

- [ ] **Step 1:** Belgeleri güncelle; yol haritasından tamamlananları (çok sayfa arayüzü) kaldır.
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit`, `npm run build`. Beklenen: temiz.
- [ ] **Step 3:** Tüm dalı en yetenekli modelle bağımsız incelet; Kritik ve Önemli bulguları testle düzelt.
- [ ] **Step 4:** Birleştir, push et, CI sonucunu oku. Commit: `docs: v2 belgeleri`.
