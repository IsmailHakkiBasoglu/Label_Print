# Çok Renkli Çerçeve ve Tema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çok renkli süs çerçeveleri, renk bandı, zemin rengi ve 8 hazır tema ile tek tıkla güzel mutfak kavanozu etiketi.

**Architecture:** `FrameOptions` vurgu ve zemin rengi taşır; süs parçaları `role: "accent"` ile işaretlenir ve mevcut köşe/kenar yerleşimiyle çizilir. Bant ve zemin `frames.ts` içinde şekle göre yol üretir; zemin `layout.ts`'de her şeyden önce çizilir. Temalar saf veridir (`src/library/themes.ts`); `store.applyTheme` çerçeveyi, deseni ve yazı stillerini tek geri alınabilir adımda uygular.

**Tech Stack:** Vite, TypeScript strict, React 19, Vitest, pdf-lib, testing-library.

**Spec:** `docs/superpowers/specs/2026-11-11-renkli-cerceve-tema-design.md`

## Global Constraints

- Tüm ölçüler mm; önizleme ve PDF aynı `RenderOp[]`'dan; yeni op türü yok.
- Kullanıcıya görünen metinler Türkçe; tema adları ve renkler spec tablosundaki gibi.
- Belge sürümü 2 kalır; eski dosyalar ve mevcut 24 süs çerçevesi aynen çizilir.
- Zemin kenardan `insetMm` içeride biter; bant etiketin üst %26'sı; bant ayracı bandın 0,6 mm altında, genişliğin %30'u, vurgu renginde.
- Yeni bağımlılık yok. Commit mesajlarında Claude/Co-Authored-By satırı yok.
- Kullanıcının 5183'teki verisine dokunulmaz; tarayıcı denemesi 5184'te.

## Review Focus

1. Bir tema uygulandıktan sonra başka bir tek renkli çerçeveye geçilince `accent`/`background` kalır: tek renkli çerçevede vurgu yok sayılmalı, zemin ise (kullanıcı kapatmadıkça) kalmalı — Görev 5 testi.
2. Tema, yazısı olmayan ama kodu/görseli olan tasarıma uygulanınca kod/görsel kaybolmamalı, örnek metinler eklenmeli — Görev 4 testi.
3. Bant temasından `title-sub` temasına geçince üçüncü yazı (grup adı) ve onun hücre değerleri: `patternLoss` sayıp onay sormalı — Görev 4 testi.
4. Daire etiketlerde bandın elips kesiti etiket dışına taşmamalı ve kiriş tam yatay olmalı — Görev 2 testi.
5. Çerçevesiz zeminli etikette `designTouchesBand`/`frameMargin` hata vermemeli (frameId yok) — Görev 3 testi.

---

### Task 1: Renk rolleri ve üç renkli süs çerçevesi

**Files:**
- Modify: `src/core/document.ts` (`FrameOptions`, `isDesign`), `src/library/ornaments/layout.ts` (`OrnamentPart`, `place`), `src/library/ornaments/frames.data.ts` (3 yeni çerçeve, `ORNAMENT_CATEGORIES`'e `"renkli"` başa)
- Test: `tests/core/document.test.ts`, `tests/library/ornaments.test.ts`, `tests/library/ornamentCatalog.test.tsx`

**Interfaces:**
- Produces: `FrameOptions = { strokeMm; insetMm; color; accent?: string; background?: string }`; `OrnamentPart = { size; d: (string | { d: string; role: "accent" })[]; stroke? }`; çerçeve kimlikleri `o-berry-vine` "Meyveli dal", `o-meadow` "Kır çiçekleri", `o-wheat-double` "Başaklı çift çizgi", kategori `"renkli"`; `hasAccent(frameId: string): boolean` (`frames.data.ts`'ten dışa açılır).

- [ ] **Step 1: Failing tests**
  - document: `frameOptions` içinde `accent: "#C0322B", background: "#E2C79C"` kabul; `accent: 5` → `ok: false`.
  - ornaments "vurgu parçaları vurgu rengiyle dolar": `ornamentLayout(o-berry-vine, 63.5×38.1 rect, {color:"#3B6D11", accent:"#C0322B", ...})` op'larında hem `fill: "#3B6D11"` hem `fill: "#C0322B"` var; `accent` verilmezse tüm dolgular `#3B6D11`.
  - ornaments "renkli çerçeveler dört şekilde etiket içinde kalır": 3 çerçeve × {rect 63.5×38.1, rounded 63.5×38.1 r3, oval 60×40, circle 40×40}: tüm yol noktaları `[-0.01, width+0.01]×[-0.01, height+0.01]` içinde (mevcut testlerdeki nokta okuma yardımcısıyla).
  - ornamentCatalog: `hasAccent("o-meadow") === true`, `hasAccent("o-pearl") === false`; "renkli" kategorisi seçilince 3 kart.
- [ ] **Step 2:** `npx vitest run tests/core/document.test.ts tests/library` → yeni testler FAIL.
- [ ] **Step 3: Implement.** `place()` her girdi için `typeof === "string" ? opts.color : (opts.accent ?? opts.color)`. Motifler mevcut yardımcılarla (`leaf`, `circle`, `rail`, `box`): meyveli dal kenarı = yatay dal (`box`) + 2 yaprak (ana) + 2–3 küçük daire meyve kümesi (vurgu); köşe = yaprak çifti (ana) + 3 meyve (vurgu). Kır çiçekleri kenarı = beş yapraklı çiçek taçyaprakları (vurgu) + çiçek göbeği (ana) + yaprak (ana). Başaklı çift çizgi kenarı = iki ince `box` çizgi (ana); köşe = çift `rail` (ana) + başak (`leaf` dizisi, vurgu).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: renk rollu suslu cerceveler"`

### Task 2: Renk bandı çerçevesi

**Files:**
- Modify: `src/library/frames.ts` (`FRAMES`'e `{ id: "band", name: "Renk bandı" }`, `lineFrame` içinde `band`)
- Test: `tests/library/frames.test.ts`

**Interfaces:**
- Produces: `bandPath(label: FrameLabel, inset: number, ratio: number): string` (dolu bant yolu); `BAND_RATIO_TOP = 0.26`.

- [ ] **Step 1: Failing tests**
  - "bant üst %26'yı kaplar": rect 63.5×38.1, inset 1 → dolu op (`fill === color`) noktaları y ∈ [1, 1+0.26·(38.1−2)], x ∈ [1, 62.5]; ayraç op `fill === accent`, genişliği 0.3·63.5, y bandın alt kenarı + 0.6.
  - "yuvarlak köşede üst köşeler yuvarlak": rounded r3 → yol `A` komutu içerir.
  - "oval ve dairede elips kesiti içeride kalır, kiriş yatay": circle 40×40 ve oval 60×40 → tüm noktalar etiket elipsinin (inset dahil) içinde; en alttaki iki noktanın y'si eşit.
  - "küçük etikette ince çizgiye düşer": 20×10 → tek stroke op, dolgu yok.
- [ ] **Step 2:** `npx vitest run tests/library/frames.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Dikdörtgen/yuvarlak: üst kenardan bant yüksekliğine kadar dikdörtgen (yuvarlakta üst iki köşe yay). Elips: yatay kiriş `y = inset + h·ratio`, kesişim açıları `asin`/`acos` ile, üst yay `A` komutuyla, kiriş `L`. Kısa kenar < 12 mm → üst kenarda tek stroke çizgi (`frameLayout` `fellBack: true` döner ki mevcut uyarı çıksın).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: renk bandi cercevesi"`

### Task 3: Zemin rengi

**Files:**
- Modify: `src/library/frames.ts` (dışa `backgroundPath(label: FrameLabel, inset: number): string` = mevcut `outline`), `src/render/layout.ts` (`designOps` başında zemin; `frameMargin`/`designTouchesBand` frameId yokken 0/false kalır)
- Test: `tests/render/background.test.ts` (yeni)

**Interfaces:**
- Consumes: `FrameOptions.background` (Görev 1).

- [ ] **Step 1: Failing tests**
  - "zemin ilk op ve içeride": `layoutDesign({ frameId: "single", frameOptions: {..., background: "#E2C79C"}, elements: [text] }, rect 63.5×38.1)` → `ops[0]` `fill === "#E2C79C"`, noktaları [1, 62.5]×[1, 37.1].
  - "zemin yoksa çizilmez": `background` yok → hiçbir op'ta bu dolgu yok.
  - "çerçevesiz zemin": `frameId` yok, `frameOptions.background` var → `ops[0]` zemin; `frameMargin` 0, `designTouchesBand` false.
  - "oval etikette zemin elips": oval 60×40 → yol `A` içerir.
  - `layoutProject` ile PDF: zeminli tasarım `renderPdf` `ok: true`.
- [ ] **Step 2:** `npx vitest run tests/render/background.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `designOps`: `const options = design.frameOptions; if (options?.background) ops.push({ kind:"path", d: backgroundPath(label, options.insetMm), x: box.x, y: box.y, scale: 1, fill: options.background })` — çerçeveden önce.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: etiket zemin rengi"`

### Task 4: Temalar ve uygulama

**Files:**
- Create: `src/library/themes.ts`
- Modify: `src/library/textPatterns.ts` (`band-title` deseni; `PATTERNS` listesine eklenmez — yalnız temalar kullanır), `src/ui/store.ts` (`applyTheme`, `themeLoss`)
- Test: `tests/library/themes.test.ts` (yeni), `tests/ui/store.test.ts`

**Interfaces:**
- Consumes: Görev 1–3 çerçeve kimlikleri, `FrameOptions`.
- Produces: `THEMES: Theme[]` (spec tablosundaki 8 tema, sırası tablo sırası), `THEME_STYLES: { id: Theme["style"]; name: string }[]` = bahce "Doğal bahçe", kir "Kır çiçekleri", kraft "Rustik kraft", modern "Sade modern"; `themedDesign(theme: Theme, design: LabelDesign, label: FrameLabel): LabelDesign` (saf; yazı kimlikleri desenin kimlikleri); `store.applyTheme(themeId: string, label: FrameLabel): void` (içeride `themedDesign` + `remapValues`); `store.themeLoss(themeId: string, label: FrameLabel): number`.

- [ ] **Step 1: Failing tests**
  - themes "8 tema, benzersiz kimlik, bilinen çerçeve": her `frameId` `ORNAMENTS` ya da `FRAMES` içinde; her temanın `texts.length` = desenin yazı sayısı (title-sub 2, band-title 3).
  - textPatterns "band-title grup adını bandın içine koyar": 63.5×38.1 → üçüncü yazı y+height ≤ 1+0.26·36.1, rengi `#ffffff`; başlık ve alt başlık bandın altında.
  - store "applyTheme çerçeveyi ve yazı stillerini uygular": `bahce-kirmizi` → `frameId === "o-berry-vine"`, `frameOptions.accent === "#C0322B"`, ilk yazı `{fontId: "serif-bold", color: "#27500A"}`.
  - store "mevcut yazılar ve hücre değerleri korunur": yazı "Mercimek" + hücre 2 değeri "Nohut" → tema sonrası ilk yazı metni "Mercimek", hücre 2 değeri yeni kimlikte "Nohut".
  - store "yazısız tasarıma örnek metin ve kod korunur": yalnız kod öğeli tasarım + `kraft-kahve` → kod öğesi aynı kimlikle var, iki yazı `samples` metinleriyle.
  - store "tek geri alma": `undo()` sonrası tasarım tema öncesine eşit.
  - store "kilitli hücrede bir şey yapmaz".
  - store "bant temasından iki yazılı temaya geçerken kayıp sayılır": `modern-yesil` uygula, hücre 0'da üçüncü yazıya değer yaz → `themeLoss("bahce-kirmizi") === 1`.
- [ ] **Step 2:** `npx vitest run tests/library/themes.test.ts tests/ui/store.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `themedDesign` (`themes.ts`): yeni çerçeve ve seçenekler, `design.frameId/frameOptions` (insetMm 1, strokeMm 0.4) ata; `margin` = yeni çerçevenin `frameMargin`'i (+`MARGIN_SLACK_MM`); desen `applyPattern` + önceki kod öğeleri (yazı yoksa `theme.samples`), yazılara sırayla `texts[i]` stili. `applyTheme`: `commit` içinde `themedDesign` sonucunu tasarıma yazar ve `remapValues` çağırır. `themeLoss` = `patternLoss` mantığı tema deseniyle. `rebuildPattern` kod öğelerini zaten korur (barkod işi).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: hazir temalar"`

### Task 5: Tema sekmesi ve renk alanları

**Files:**
- Modify: `src/ui/LibraryPanel.tsx` (`TABS`'e "Tema" Desen'den sonra; `ThemesTab`; `FramesTab` renk alanları), `src/ui/app.css`
- Test: `tests/ui/themes.test.tsx` (yeni)

**Interfaces:**
- Consumes: `THEMES`, `THEME_STYLES`, `themedDesign`, `store.applyTheme`, `store.themeLoss`, `hasAccent`, `layoutDesign`.

- [ ] **Step 1: Failing tests**
  - "Tema sekmesi dört başlık altında 8 kart": başlık metinleri `THEME_STYLES` adları; `.theme-card` 8, her kartta `svg`.
  - "kart tıklanınca tema uygulanır": "Bahçe · kırmızı meyve" → `frameId === "o-berry-vine"`.
  - "kayıp varsa onay sorar, vazgeçilirse uygulanmaz": `window.confirm` sahte `false` → çerçeve değişmez; mesaj `/içerik silinecek/`.
  - "önizleme mevcut yazıyı gösterir": yazı "Mercimek" → kart svg metni "Mercimek" içerir.
  - FramesTab "vurgu rengi yalnız vurgulu çerçevede": `o-meadow` seçiliyken "Vurgu rengi" var, `single`'da yok; "Ana renk" etiketi her zaman.
  - FramesTab "zemin aç/kapa": "Zemin" kutusu işaretlenince `background === "#F5EBD7"` (varsayılan), kaldırılınca `background` yok.
  - "tek renkli çerçeveye geçince zemin kalır": `kraft-kahve` uygula → Düz çizgiler "Tek çizgi" → `background` hâlâ `#E2C79C`.
- [ ] **Step 2:** `npx vitest run tests/ui/themes.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Kart önizlemesi: `layoutDesign(themedDesign(theme, activeDesign, label), label, deps)`. Onay metni: `Bu temada yeri olmayan ${loss} hücre içeriği silinecek. Devam edilsin mi?`. Mevcut "Renk" etiketi "Ana renk" olur.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: tema sekmesi ve cerceve renk alanlari"`

### Task 6: Belgeler ve görsel kontrol

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `YOL_HARITASI.md`

- [ ] **Step 1:** README özellik listesine temalar ve renkli çerçeveler; CHANGELOG "Eklendi"; YOL_HARITASI Fikirler'e "[x] Çok renkli çerçeveler ve hazır temalar" ve "[ ] Eğik / el yazısı yazı tipleri".
- [ ] **Step 2:** `npm test`, `npm run build` → PASS.
- [ ] **Step 3:** 5184'te: 8 tema × TW-2021 (dikdörtgen) ve bir oval, bir daire, bir yuvarlak köşe Tanex şablonu; PDF sayfa içinde pdfjs ile çizilip ekran görüntüsü alınır; motif gerilmesi, taşma, renk kontrolü. Renk düzeltmesi gerekirse `themes.ts`'te yapılır ve ledger'a yazılır. Ekran görüntüsü kullanıcıya gönderilir.
- [ ] **Step 4:** `git commit -m "docs: renkli cerceveler ve temalar"`; `main`'e birleştir, push, CI yeşil.
