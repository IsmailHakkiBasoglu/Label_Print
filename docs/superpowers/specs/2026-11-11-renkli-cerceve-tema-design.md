# Çok renkli çerçeveler ve hazır temalar — Tasarım

Tarih: 2026-11-11 · Durum: onay bekliyor

## Amaç

Mutfak kavanozu etiketlerini tek tıkla güzel yapmak. Kullanıcı bir tema seçer; çok renkli çerçeve, başlık/alt başlık yerleşimi, yazı tipleri ve renkler birlikte gelir. Sonra yazıları ve renkleri dilediği gibi değiştirir.

Kullanıcının söyledikleri: odak kolay ve güzel etiket tasarımı; "kırmızı meyveli yaprak tasarımlı çerçeve" gibi çok renkli çerçeveler; "Başlık / Alt başlık" hazır temaları; kullanım mutfak kavanozları; dört tarzın dördü de (doğal bahçe, kır çiçekleri, rustik kraft, sade modern).

Başarı ölçütü: 8 tema, Tanex kataloğundaki dikdörtgen, yuvarlak köşeli, oval ve daire etiketlerde etiketten taşmadan, yazıları koruyarak uygulanır; PDF'te renkler doğru, motifler gerilmemiş görünür.

## Kapsam dışı

Yeni yazı tipleri (eğik, el yazısı); kullanıcının kendi temasını kaydetmesi; zeminde doku/gradyan; mevcut 24 tek renkli çerçevenin renklendirilmesi; QR/barkod tarafında yeni iş.

## Veri modeli

`FrameOptions` (src/core/document.ts) iki isteğe bağlı alan alır:

```ts
export type FrameOptions = { strokeMm: number; insetMm: number; color: string; accent?: string; background?: string };
```

- `color` = ana renk (dal, yaprak, çizgi, bant). `accent` = vurgu rengi (meyve, çiçek, başak). `background` = zemin rengi; yoksa zemin çizilmez.
- Eski dosyalarda bu alanlar yoktur; çerçeveler aynen çizilir. Doğrulama (`isDesign`) iki alanı varsa metin olarak kabul eder.
- Belge sürümü 2 kalır. Tema kimliği belgeye yazılmaz; tema yalnızca uygulanan ayarların toplamıdır.

## Çok renkli süs çerçeveleri

- `OrnamentPart.d` girdileri ya düz yol metni (bugünkü gibi, ana renk) ya da `{ d: string; role: "accent" }` olur. `place()` vurgu parçasını `opts.accent ?? opts.color` ile doldurur. Mevcut 24 çerçeve değişmez.
- Yeni süs çerçeveleri (kategori "renkli", kimlikler `o-` önekiyle):
  - `o-berry-vine` "Meyveli dal": kenarda ince dal + yapraklar (ana), aralıklarla kırmızı meyve kümeleri (vurgu); köşede yaprak çifti + meyve.
  - `o-meadow` "Kır çiçekleri": kenarda küçük beş yapraklı çiçekler (vurgu) ve aralarında yaprak (ana); köşede büyük çiçek.
  - `o-wheat-double` "Başaklı çift çizgi": çift çizgi (ana), köşelerde buğday başağı (vurgu).
- Bunlar mevcut köşe/kenar yerleşimini (`ornamentLayout`) kullanır: dikdörtgen, yuvarlak köşe, oval ve dairede gerilmeden oturur; çok küçük etikette mevcut kural gereği tek çizgiye düşer.

## Renk bantlı çerçeve

- Yeni çizgi çerçevesi `band` "Renk bandı": etiketin üst %26'sı ana renkle dolu bant, altında vurgu renginde ince bir ayraç çizgisi (bandın 0,6 mm altında, etiket genişliğinin %30'u, ortalı).
- Bant etiket kenarından `insetMm` içeride başlar ve etiket şeklini izler: dikdörtgende düz, yuvarlak köşede üst köşeler yuvarlak, oval ve dairede elipsin üst kesiti (yatay kirişin üstü).
- `frameMargin` bu çerçeve için 0 döner (bant içeriğe alan bırakmaz; tema bant yazısını bandın içine koyar).

## Zemin

- `background` varsa etiket şeklinde (`outline(label, insetMm)`) dolu bir yol, tüm çerçeve ve içerikten önce çizilir. Kenardan `insetMm` (varsayılan 1 mm) içeride biter: baskı kayarsa kenarda beyaz şerit kalır, komşu etikete renk taşmaz.
- Zemin `frameId` olmadan da çalışır (çerçevesiz ama zeminli etiket).

## Temalar (`src/library/themes.ts`)

```ts
type TextStyle = { fontId: FontId; color: string; sizePt: number };
type Theme = {
  id: string; name: string; style: "bahce" | "kir" | "kraft" | "modern";
  frameId: string; frameOptions: FrameOptions;
  patternId: "title-sub" | "band-title";
  texts: TextStyle[];      // sırayla: başlık, alt başlık, (bant temalarında) grup adı
  samples: string[];       // önizleme metinleri, ör. ["Mercimek", "kırmızı · 2026"]
};
```

8 tema (renkler kesin değerler plan sırasında örnek PDF'e bakılarak küçük düzeltme alabilir):

| Kimlik | Ad | Çerçeve | Ana / vurgu / zemin | Başlık | Alt başlık |
|---|---|---|---|---|---|
| bahce-kirmizi | Bahçe · kırmızı meyve | o-berry-vine | #3B6D11 / #C0322B / — | tırnaklı kalın #27500A | tırnaklı #A32D2D |
| bahce-mor | Bahçe · böğürtlen | o-berry-vine | #3B6D11 / #5B2A6E / — | tırnaklı kalın #27500A | tırnaklı #5B2A6E |
| kir-pembe | Kır çiçekleri · pembe | o-meadow | #639922 / #D4537E / — | tırnaklı kalın #72243E | sade #993556 |
| kir-lila | Kır çiçekleri · lila | o-meadow | #639922 / #8E6BC2 / — | tırnaklı kalın #3C3489 | sade #534AB7 |
| kraft-kahve | Kraft · kahve | o-wheat-double | #412402 / #854F0B / #E2C79C | tırnaklı kalın #412402 | tırnaklı #633806 |
| kraft-zeytin | Kraft · zeytin | o-wheat-double | #3E4A1E / #6B7A2E / #E6DDB8 | tırnaklı kalın #2E3815 | tırnaklı #4F5C22 |
| modern-yesil | Modern · yeşil | band | #0F6E56 / #EF9F27 / — | sade #04342C | sade #5F5E5A |
| modern-bordo | Modern · bordo | band | #7A1F2B / #D9A441 / — | sade #4A1218 | sade #5F5E5A |

- `band-title` deseni (src/library/textPatterns.ts'e eklenir): başlık bandın altındaki alanın üst %60'ı, alt başlık kalanı; üçüncü yazı (grup adı) bandın içinde, ortalı, sade, rengi `#ffffff`. Metin sırası başlık, alt başlık, grup adı olduğundan mevcut iki yazı yerinde kalır.
- `title-sub` deseni bugünkü gibidir; tema, süs bandının içinde kalacak `margin` ile çağırır (mevcut `frameMargin` yolu).
- Yazı boyutu tema değeridir; `fitText` taşmada küçültür (mevcut davranış).

## Temayı uygulama

`store.applyTheme(themeId: string, label: FrameLabel)` tek bir geri alınabilir adımda:
1. `design.frameId` ve `design.frameOptions` temadakiyle değişir.
2. Temanın deseni mevcut `applyPattern` yoluyla kurulur: var olan yazılar sırayla yeni yerlerine taşınır, hücre değerleri `remapValues` ile korunur; kod ve görsel öğeleri kalır (görsel desende yeri yoksa mevcut kuralla kalır).
3. Yazı öğelerine sırayla temanın `TextStyle`'ı uygulanır. Yazı yoksa temanın `samples` metinleri yazılır.
4. Kilitli (ayrılmamış) hücre seçiliyken uygulanmaz (`applyPattern` ile aynı kural).

## Arayüz

- Sol panelde "Desen" ile "Sembol" arasına **"Tema"** sekmesi. 8 tema, dört tarz başlığı altında ikişer kart. Kartta tema, seçili etiketin ölçü ve şeklinde `layoutDesign` ile çizilmiş küçük önizleme ve adı.
- Kartta temanın `samples` metinleri değil, etiketteki mevcut yazılar gösterilir; yazı yoksa `samples`.
- Desen uygulamadaki gibi, temada yeri olmayan dolu hücre değeri varsa (`patternLoss > 0`) "N etiketteki içerik kaybolacak" onayı sorulur.
- Çerçeve sekmesinde renk alanları: "Ana renk" (bugünkü Renk), seçili çerçeve vurgu parçası içeriyorsa "Vurgu rengi", her zaman "Zemin" (aç/kapa kutusu + renk).

## Hatalar ve sınırlar

- Çok küçük etikette süs tek çizgiye düşer (mevcut uyarı). Bant çerçevesi kısa kenarı 12 mm altındaki etikette yalnız ince üst çizgi olur ve aynı uyarıyı verir.
- Zemin rengi ile yazı rengi kontrastı denetlenmez (temalar uyumlu gelir; kullanıcı değiştirirse kendi seçimi).

## Test

- `tests/library/ornaments.test.ts`: vurgu parçaları `accent` ile, diğerleri `color` ile dolar; `accent` yoksa hepsi `color`; yeni 3 çerçeve dört etiket şeklinde etiket sınırları içinde kalır.
- `tests/library/frames.test.ts`: bant dikdörtgen/yuvarlak/oval/dairede etiket içinde kalır ve üst %26'yı kaplar; küçük etikette tek çizgiye düşer.
- `tests/render/…`: zemin ilk op olarak, `insetMm` içeride çizilir; `background` yoksa çizilmez; çerçevesiz zemin çalışır.
- `tests/core/document.test.ts`: `accent`/`background` alanlı tasarım kabul edilir, sayı verilirse reddedilir; eski dosya aynen açılır.
- `tests/ui/store.test.ts`: `applyTheme` çerçeveyi, yazı tiplerini ve renkleri uygular; mevcut yazılar ve hücre değerleri korunur; kod öğesi kalır; tek "Geri" ile önceki hale döner; kilitli hücrede bir şey yapmaz.
- `tests/ui/…`: Tema sekmesi 8 kart gösterir, tıklayınca uygular, kayıp varsa onay ister; Çerçeve sekmesinde vurgu ve zemin alanları.
- Elle: 5184'te 8 tema × (63,5×38,1 dikdörtgen, oval, daire, yuvarlak köşe) PDF; sayfa içinde pdfjs ile görsel kontrol; ekran görüntüsü kullanıcıya.
