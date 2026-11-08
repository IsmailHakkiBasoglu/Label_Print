# Label_Print v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tanex şablonlarına ve özel şablonlara etiket tasarlayıp ölçüsü bozulmamış PDF veren, internetsiz çalışan web uygulaması.

**Architecture:** Saf TypeScript çekirdek (geometri, şablon, belge) ve kütüphaneler; bunlar ortak `RenderOp[]` çıktısı üretir. PDF ve SVG önizleme aynı işlemleri çizer. React yalnızca arayüzdür.

**Tech Stack:** Node 24, Vite, TypeScript (strict), React, Vitest, pdf-lib, @pdf-lib/fontkit, fast-xml-parser, fflate; test için pdfjs-dist.

**Spec:** `docs/superpowers/specs/2026-11-08-label-print-design.md`

## Global Constraints

- Tüm model ölçüleri mm. Dönüşüm yalnızca `geometry` içinde: `pt = mm × 72 / 25.4`; PDF'e en az 4 ondalıkla yazılır.
- PDF konum doğruluğu ±0,01 mm. Sığdırma, ölçekleme, gizli kenar boşluğu yok.
- Word dosyaları depoya girmez; değer tahmin edilmez, şüpheli kayıt `status: "check"` + `notes`.
- Metin alt sınırı 4 pt; sığmayan metin kesilmez, uyarı üretir.
- Arayüz dili Türkçe. Kod tanımlayıcıları İngilizce.
- En az 150 sembol; lisanslar `THIRD_PARTY.md` içinde.
- Commit mesajlarında `Co-Authored-By` satırı yok; README'de "Bu proje Claude (Anthropic) yardımıyla geliştirildi." notu var.
- Commit kimliği: `74676035+IsmailHakkiBasoglu@users.noreply.github.com`.

## Review Focus

- Türkçe büyük/küçük harf: "MISIR", "Mısır", "misir", "İNCİR" aramada doğru eşleşmeli (Görev 5).
- PDF'te "ğüşıöçİ" gömülü yazı tipiyle doğru kodlanmalı, yazı tipinde olmayan karakter (emoji) PDF üretimini düşürmemeli; uyarı vermeli (Görev 7).
- Yazıcı düzeltmesi etiketi sayfa dışına taşırıyorsa PDF alınmadan neden gösterilmeli (Görev 7).
- Hiç hücre seçilmemiş ya da tüm bölgeleri boş bir sayfa boş PDF vermemeli; uyarı vermeli (Görev 7).
- Aynı `id`li özel şablon içe aktarılınca Tanex kaydının ya da mevcut kaydın üzerine sessizce yazılmamalı (Görev 11).

---

### Task 1: Proje iskeleti ve geometri

**Files:** Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `.gitignore`, `src/core/geometry.ts`; Test: `tests/core/geometry.test.ts`

**Interfaces — Produces:**
- `type Rect = { x: number; y: number; width: number; height: number }`
- `mmToPt(mm: number): number`
- `labelRects(t: { grid: GridSpec; label: { width: number; height: number } }): Rect[]`, `GridSpec = { columns; rows; marginTop; marginLeft; gapX; gapY }` (Template.grid bu tiptir) — soldan sağa, yukarıdan aşağı; origin sayfa sol üst.

- [ ] **Step 1: İskeleti kur** — Vite react-ts, Vitest, bağımlılıklar. `.gitignore`: `node_modules`, `dist`, `.superpowers`, `tools/import-tanex/.cache`.
- [ ] **Step 2: Failing test yaz**: `mmToPt(25.4)===72`; `mmToPt(210)` ≈ 595.27559 (5 ondalık); columns 3, rows 7, marginTop 15.2, marginLeft 6.8, gapX 3, gapY 0, label 63.5×38.1 için 21 rect; `[1]` x=73.3 y=15.2; `[20]` x=139.8, y=243.8.
- [ ] **Step 3:** `npx vitest run tests/core/geometry.test.ts` → FAIL.
- [ ] **Step 4:** `geometry.ts` yaz.
- [ ] **Step 5:** Aynı komut → PASS; `npx tsc --noEmit` temiz.
- [ ] **Step 6:** Commit `feat: proje iskeleti ve geometri`.

### Task 2: Şablon modeli ve doğrulama

**Files:** Create: `src/core/templates.ts`; Test: `tests/core/templates.test.ts`

**Interfaces — Consumes:** `labelRects`. **Produces:** spec §3 `Template` tipi; `validateTemplate(t: Template): string[]` (Türkçe hata listesi; boş = geçerli); `normalizeSheet(w,h): {width,height}` (A4'e 1 mm içinde ise tam 210×297).

- [ ] **Step 1: Failing test**: taşan ızgara (marginLeft+genişlik > sheet.width + 0.01) hata verir; 0/negatif ölçü hata verir; `normalizeSheet(209.97, 297.03)` → 210×297; `normalizeSheet(100,150)` değişmez; tam kağıt genişliği 3×70 (toplam 210) geçerlidir.
- [ ] **Step 2:** Çalıştır → FAIL. **Step 3:** Uygula. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: sablon modeli ve dogrulama`.

### Task 3: Tanex içe aktarma ve katalog

**Files:** Create: `tools/import-tanex/parse-list.ts`, `parse-docx.ts`, `run.ts`, `data/templates.tanex.json`; Test: `tests/tools/parse-docx.test.ts`, `tests/tools/parse-list.test.ts`, `tests/core/catalog.test.ts`, `tests/fixtures/*.xml`

**Interfaces — Consumes:** `Template`, `validateTemplate`, `normalizeSheet`. **Produces:**
- `parseListHtml(html): TanexRow[]`, `TanexRow = { code: string|null; sizeText: string; url: string; section: 1|2 }`
- `parseSize(sizeText, url): { width: number; height: number; shape: Shape } | { diameterOrSingle: number; shape: Shape }` — virgül ondalık, `x`/`×`, "Yuvarlak"→circle, "oval"→oval (metin ya da dosya adından).
- `parseDocumentXml(xml, label: {width,height}): GridResult | { error: string }`, `GridResult = { sheet, grid }`
- `data/templates.tanex.json` : `Template[]`. Kodsuz şablon `id`: `TANEX-<sizeText sade>` (örn. `TANEX-64x100`, `TANEX-20x55-3lu`).

Ayrıştırma kuralları: kağıt `w:pgSz`; `marginLeft=(pgMar.left+tblInd)`; `gridCol` içinde etiket sütunları etiket genişliğine 0,1 mm içinde olanlar, aradakiler aralık; `trHeight` için aynısı; etiketten önce gelen ara satır `marginTop`a eklenir. Etiket ölçüsü sayfadandır; `gapX = word adımı − label.width` (adım korunur).

- [ ] **Step 1: Failing testler** (fixture'lar sadece gereken XML etiketleriyle elle yazılır, 0,05 tolerans):
  - TW-2021 (`pgMar top=862 left=386`, `gridCol` 3600/171 tw): cols 3, rows 7, top 15.20, left 6.81, gapX 3.02, gapY 0.
  - TW-2130 (etiket 30, top 1133, left 481, 8 etiket + 7 ara satır): cols 6, rows 8, gapX 2.60, gapY 2.60, top 19.99, left 8.48.
  - TW-2148 (40.6×25.4, top 1020, left 924, tblInd −15, 9+8 satır): cols 4, rows 9, left 16.03, gapY 3.90.
  - Tablo yoksa `{error}`. `parseSize("70×50,8")` 70/50.8; `parseSize("30mm Yuvarlak")` circle.
- [ ] **Step 2:** FAIL. **Step 3:** `parse-docx.ts`, `parse-list.ts` yaz (sayfa HTML'ini önce incele). **Step 4:** PASS.
- [ ] **Step 5:** `run.ts`: sayfayı çek, `.cache`e 2 eşzamanlıyla, adresleri URL-encode ederek indir, üret. Kurallar: 0,1 mm üstü ayrışma, `.doc` (TW-2041), indirme/ayrıştırma hatası, `validateTemplate` hatası, tek ölçülü ve şekli belirsiz kayıt → `check` + `notes`, ızgara yoksa `columns:1, rows:1`, boşluklar 0. Bilinen: TW-2163 ve TW-2270 notları. Şekil dosya adından, yoksa `rect`.
- [ ] **Step 6:** `npx tsx tools/import-tanex/run.ts` çalıştır; özet: toplam, verified, check.
- [ ] **Step 7: `catalog.test.ts`**: 159 kayıt, id'ler benzersiz, her `verified` kayıt `validateTemplate` boş; TW-2021 değerleri. PASS.
- [ ] **Step 8:** Commit `feat: Tanex sablon katalogu`.

### Task 4: Belge modeli

**Files:** Create: `src/core/document.ts`; Test: `tests/core/document.test.ts`

**Interfaces — Produces:** spec §5 tipleri ve:
- `TextElement = { kind:"text"; id; x; y; width; height; text; fontId: FontId; sizePt; align:"left"|"center"|"right"; color: string }`
- `SymbolElement = { kind:"symbol"; id; x; y; width; height; symbolId; color }`; `DesignElement = TextElement|SymbolElement`
- `CellSelection = { used: number[] }`; `newProject(templateId)`; `serialize(p): string`; `parseProject(json): {ok:true;project}|{ok:false;error}`
- Hücre `i` için tasarım: `designIds[i % designIds.length]`.

- [ ] **Step 1: Failing test**: gidiş-dönüş eşitliği; bozuk JSON, `version:2`, eksik `pages` → `ok:false`, Türkçe mesaj.
- [ ] **Step 2–4:** FAIL → uygula → PASS. **Step 5:** Commit `feat: tasarim belgesi modeli`.

### Task 5: Semboller

**Files:** Create: `src/library/symbols/{svg.ts,search.ts,catalog.generated.json,source.json,own/*.svg}`, `tools/build-symbols.ts`, `THIRD_PARTY.md`; Test: `tests/library/symbols.test.ts`

**Interfaces — Produces:**
- `type VectorIcon = { viewBox:[number,number,number,number]; paths:{ d:string; fill:boolean; strokeWidth:number }[] }`
- `parseSvg(text): VectorIcon | {error}` — fast-xml-parser; yalnızca `path,circle,ellipse,rect,line,polyline,polygon,g` okunur, ilkeller `d`ye çevrilir, gerisi yok sayılır; hiç yol yoksa hata.
- `normalize(s)`: `tr` küçültme, sonra ı→i ğ→g ü→u ş→s ö→o ç→c.
- `searchSymbols(q, limit=12): SymbolEntry[]`, `SymbolEntry = { id; category; tags:string[]; icon:VectorIcon }`; sıra: tam etiket, önek, içerir.

Kaynak: `lucide-static` (ISC) ve `@tabler/icons` (MIT) içinden `source.json`da seçilir, her birine Türkçe etiket. Kategoriler: gıda ve tarım, ev, ofis, sağlık, araç, doğa, genel. `corn` gibi eksikler `own/` altında çizilir.

- [ ] **Step 1: Failing test**: `"Mısır"`, `"misir"`, `"MISIR"` ilk sonuç `corn`; `"İNCİR"` = `"incir"`; katalog ≥150, id benzersiz, 7 kategori; her giriş ≥1 yol; `<script>` ve `onload`, `href` içeren SVG'den çıktıda bunlar yok; `<circle>` `d`ye dönüşür; boş SVG hata.
- [ ] **Step 2–4:** FAIL → `svg.ts`, `search.ts`, build aracı, katalog → PASS. **Step 5:** Commit `feat: sembol kutuphanesi`.

### Task 6: Çerçeveler, yazı tipleri, yazı desenleri

**Files:** Create: `src/library/frames.ts`, `src/library/textPatterns.ts`, `src/render/ops.ts`, `src/render/fonts.ts`, `public/fonts/Noto{Sans,Serif}-{Regular,Bold}.ttf`, `public/fonts/OFL.txt`; Test: `tests/library/frames.test.ts`, `tests/library/textPatterns.test.ts`

**Interfaces — Consumes:** `Rect`, `TextElement`. **Produces:**
- `type FontId = "sans"|"sans-bold"|"serif"|"serif-bold"`; `type FontMeasure = (text:string, font:FontId, sizePt:number) => number` (mm genişlik); `createMeasure(fontBytes: Record<FontId,Uint8Array>): FontMeasure` (fontkit).
- `FRAMES`: `single,double,dashed,rounded,corner-ornament,shape`; `frameOps(id, label:{width,height,shape,cornerRadius?}, opts:{strokeMm;insetMm;color}): PathOp[]`.
- `src/render/ops.ts`: `PathOp`, `TextOp`, `GuideOp`, `RenderOp` tipleri (tanım Task 7 Interfaces bloğunda).
- `PATTERNS`: `title,title-sub,badge,three-lines,symbol-left,symbol-top`; `applyPattern(id, label, texts:string[], symbolId?): DesignElement[]`.
- `fitText(text, box, font, startPt, measure, lineHeight=1.2): { sizePt; lines:string[]; overflow:boolean }` — kelime kaydırır, 4 pt'ye kadar küçültür.

- [ ] **Step 1: Failing test**: `single` 50×30 inset 1 yolunun sınırı (1,1)-(49,29); 100×60 çerçevesinde kalınlık aynı (gerilmez); `shape` daire için kapalı eğri; `fitText` kısa metin başlangıç boyutunda; uzun metin küçülür ve kutuya sığar; sığmayan `overflow:true`, `sizePt==4`, karakter kaybı yok; `applyPattern` elemanları etiket içinde.
- [ ] **Step 2–4:** FAIL → uygula → PASS. **Step 5:** Commit `feat: cerceve ve yazi desenleri`.

### Task 7: Render işlemleri, PDF, kalibrasyon

**Files:** Create: `src/render/layout.ts`, `src/render/pdf.ts`, `src/render/calibration.ts`; Test: `tests/render/pdf.test.ts`, `tests/render/helpers/readPdf.ts`

**Interfaces — Consumes:** önceki tüm görevler. **Produces:**
- `PathOp = { kind:"path"; d:string; x; y; scale; stroke?:{color;widthMm}; fill?:string }`; `TextOp = { kind:"text"; x; y; text; font:FontId; sizePt; color }`; `GuideOp = { kind:"guide"; rect:Rect; shape }`; `RenderOp`.
- `layoutProject(p, deps:{templates;symbols;measure}, opts:{guides:boolean}): { pages:{sheet;ops:RenderOp[]}[]; warnings:string[]; errors:string[] }` — `printOffset` tüm işlemlere uygulanır.
- `renderPdf(p, deps, opts): Promise<{ok:true;bytes:Uint8Array;warnings}|{ok:false;errors}>`.
- `calibrationPdf(sheet): Promise<Uint8Array>` — 10 mm işaretli cetveller, artı işaretleri.

- [ ] **Step 1: Failing test** (pdfjs-dist ile yeniden aç):
  - A4 sayfa 595.2756×841.8898 (4 ondalık); TW-2021 tüm hücre + guides: 21 rect, `labelRects` konumlarına ±0,01 mm.
  - `printOffset {x:1,y:-0.5}` tüm konumları kaydırır.
  - TW-2130: 48 kılavuz daire. `used:[0,5]`: yalnızca 2 kılavuz. Guides kapalı: kılavuz yok.
  - "ğüşıöçİ" metni PDF'ten aynen okunur; emoji: `ok:true`, uyarı içerir.
  - Taşan bölge veya taşıran `printOffset`: `ok:false`, Türkçe neden. Seçili hücresi olmayan belge: `ok:false`, "Basılacak etiket yok".
  - Sığmayan metin: `ok:true`, uyarı.
- [ ] **Step 2–4:** FAIL → uygula (y ekseni `pageH − y`) → PASS; kalibrasyon için sayfa boyutu ve cetvel sayısı testi. **Step 5:** Commit `feat: PDF uretimi ve kalibrasyon`.

### Task 8: SVG önizleme ve uygulama durumu

**Files:** Create: `src/render/preview.tsx`, `src/ui/store.ts`; Test: `tests/render/preview.test.tsx`, `tests/ui/store.test.ts`

**Interfaces — Consumes:** `layoutProject`, `RenderOp`. **Produces:** `<SheetPreview page={...} onCellClick? />` (viewBox mm); `useStore` (`project`, `selectedElementId`, `applyPattern`, `addSymbol`, `updateElement`, `setCells`, `undo`, `redo`) — her değişiklikte tarayıcıya otomatik kayıt (try/catch; bozuksa yok say).

- [ ] **Step 1: Failing test**: guide rect SVG `x,y,width,height` `layoutProject` ile birebir; undo/redo; bozuk `localStorage` boş proje açar.
- [ ] **Step 2–4:** FAIL → uygula → PASS. **Step 5:** Commit `feat: onizleme ve durum`.

### Task 9: Arayüz — şablon seçimi ve yaprak

**Files:** Create: `src/ui/App.tsx`, `src/ui/TemplatePicker.tsx`, `src/ui/SheetView.tsx`, `src/ui/app.css`; Test: `tests/ui/TemplatePicker.test.tsx`

- [ ] **Step 1: Failing test**: `searchTemplates` "2021" ve "63,5 38" ile TW-2021 bulur; `check` rozeti ve nedeni görünür.
- [ ] **Step 2–4:** FAIL → üç alanlı yerleşim, seçici, hücre tıklama + başlangıç noktası → PASS. **Step 5:** Commit `feat: sablon secimi ve yaprak gorunumu`.

### Task 10: Arayüz — editör, kütüphane panelleri, PDF

**Files:** Create: `src/ui/LabelEditor.tsx`, `src/ui/LibraryPanel.tsx`, `src/ui/PropertiesPanel.tsx`, `src/ui/Toolbar.tsx`; Test: `tests/ui/editor.test.tsx`

Davranış: yazı/sembol sürükle, boyutlandır; metin yazarken ilk 6 sembol önerisi, tıklayınca eklenir; Kaydet/Aç (`.labelprint.json`); kılavuz seçeneği; yazıcı X/Y düzeltmesi; PDF Al öncesi uyarı listesi ve "Gerçek boyut / %100 ile yazdırın" notu; Kalibrasyon PDF'i.

- [ ] **Step 1: Failing test**: "Mısır" metninde öneride `corn`; tıklayınca sembol eklenir; bozuk dosya açılınca hata görünür, proje değişmez; hatalı belgede PDF düğmesi nedeni gösterir.
- [ ] **Step 2–4:** FAIL → uygula → PASS. **Step 5:** Commit `feat: etiket editoru ve PDF alma`.

### Task 11: Özel şablon, bölgeler, kullanıcı SVG'si

**Files:** Create: `src/ui/TemplateBuilder.tsx`, `src/ui/ZonesPanel.tsx`, `src/core/customTemplates.ts`; Test: `tests/core/customTemplates.test.ts`, `tests/ui/TemplateBuilder.test.tsx`

**Interfaces — Produces:** `saveCustom(t)`, `importCustom(json): {added:Template[]; renamed:string[]; errors:string[]}`; id çakışmasında `-2` eklenir, üzerine yazılmaz.

- [ ] **Step 1: Failing test**: taşan değerlerde Kaydet kapalı, neden görünür; `TW-2021` id'li içe aktarma yeni id alır, katalog kaydı değişmez; çakışan bölge uyarı, sayfa dışı bölge hata; kötü SVG reddedilir.
- [ ] **Step 2–4:** FAIL → uygula → PASS. **Step 5:** Commit `feat: ozel sablon ve bolgeler`.

### Task 12: Uçtan uca doğrulama, belgeler, GitHub

**Files:** Create: `README.md`, `YOL_HARITASI.md`, `CHANGELOG.md`, `LICENSE`, `.github/workflows/ci.yml`

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` temiz; CI aynılarını çalıştırır.
- [ ] **Step 2:** Tarayıcıda akış: TW-2021 seç → "Mısır" yaz, sembol ekle, çerçeve seç, 3 hücre seç → PDF Al. PDF'i aç, sayfa boyutu ve yerleşimi gör.
- [ ] **Step 3:** README: kurulum, "Gerçek boyut" uyarısı, Tanex verisinin kaynağı (ölçüler; dosyalar depoda değil), Claude notu. Commit `docs: README ve yol haritasi`.
- [ ] **Step 4:** `gh repo create IsmailHakkiBasoglu/Label_Print --public --source=. --push`; `gh run list` ile CI sonucunu gör.
