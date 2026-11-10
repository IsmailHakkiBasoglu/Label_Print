# Barkod ve QR — Tasarım

Tarih: 2026-11-11 · Durum: onay bekliyor

## Amaç

Etikete QR, Code 128 ve EAN-13 kodu eklenebilsin. Kod tüm etiketlerde aynı olabilir ya da listeden/Excel'den her etikete ayrı gelir (ör. her kavanozda kendi stok kodu). Kodlar hem ekranda hem PDF'te vektör olarak, keskin basılır. İnternet gerekmez.

Kullanıcının söyledikleri: yol haritasındaki "Barkod ve QR"; üç tür birlikte (QR + Code 128 + EAN-13).
Varsayımlar (onaylanan taslaktan): kod yazı gibi taşınıp boyutlandırılan bir öğedir; çizgili barkodun altına isteğe bağlı okunur yazı basılır; yanlış veya okunamayacak kod sessizce basılmaz.

Başarı ölçütü: üretilen her QR, bağımsız bir okuyucuyla (jsQR) geri okunduğunda girilen içeriği verir; Code 128 ve EAN-13 çıktıları standart örneklerle birebir aynıdır; PDF'teki QR da geri okunur. Gerçek telefon/okuyucu denemesi kullanıcıdadır.

## Kapsam dışı

DataMatrix, PDF417, UPC-A, EAN-8 ve GS1-128 uygulama tanımlayıcıları; kod içinde değişken birleştirme (ör. "ÜRN-{sütun}"); kodun döndürülmesi; logolu QR.

## Veri modeli (`src/core/document.ts`)

```ts
export type CodeFormat = "qr" | "code128" | "ean13";
export type CodeElement = {
  kind: "code"; id: string; x: number; y: number; width: number; height: number;
  format: CodeFormat; value: string; showText: boolean; color: string;
};
export type DesignElement = TextElement | SymbolElement | CodeElement;
```

- `isElement` yeni türü doğrular: `format` üç değerden biri, `value` metin, `showText` boolean. Dosya sürümü 2 kalır; eski dosyalar aynen açılır, kod içeren dosyayı eski uygulama "bozuk" sayar (kabul edilen sınır).
- Hücre değeri (`CellEntry.values[id]`) kod öğesinde `value`'nun yerine geçer; boş değer kodu o etikette gizler (`cells.ts` `applyValue`, yazıyla aynı kural).
- `kind === "text" ? … : symbol` biçiminde iki türü varsayan her yer (`cells.ts`, `store.ts` `setCellValue`/desen, `projectFile.ts`, `listFill.ts`, editör) üç türe göre güncellenir; TS'nin tür daraltması eksik yeri derlemede yakalar.

## Kodlayıcılar (`src/core/codes/`, saf işlevler)

Ortak çıktı: `type CodeMatrix = { modules: boolean[][]; quiet: number; text?: string }` — 1B kodlarda tek satır (her eleman bir modül genişliğinde çubuk/boşluk), QR'da kare. `quiet` = okuyucu için gereken boş kenar (modül cinsinden). Hata durumunda `{ error: string }` döner (Türkçe).

- `encodeEan13(value)`: yalnız rakam. 12 hane → kontrol hanesi hesaplanıp eklenir; 13 hane → kontrol hanesi denetlenir, yanlışsa hata "EAN-13 kontrol hanesi yanlış; doğrusu N". Başka uzunluk → hata. Sessiz bölge iki yanda 11 modül (standart sağda 7 ister; fazlası zararsız, hesap sade kalır). `text` = 13 hane.
- `encodeCode128(value)`: ASCII 32–126. Türkçe harf ve diğer karakterler hata: "Code 128 'Ş' gibi Türkçe harfleri kodlayamaz; QR kullanın." Kod kümesi: 4+ ardışık rakam bloklarında C, aksi halde B (en kısa çıktı için basit açgözlü seçim). Kontrol karakteri (mod 103) ve durdurma deseni eklenir. Sessiz bölge 10. En fazla 80 karakter.
- `encodeQr(value)`: `qrcode-generator` (MIT, bağımlılıksız; yeni çalışma zamanı bağımlılığı) ile, UTF-8 bayt kipi, hata düzeltme M, sürüm otomatik. Sığmazsa hata "Metin QR koda sığmıyor (en fazla ~2300 karakter)". Sessiz bölge 4.
- Boş içerik: hata değil, "çizilecek bir şey yok" — öğe çizilmez, uyarı yok (yazıdaki boş metinle aynı).

## Yerleşim ve çizim (`src/render/layout.ts`)

`codeOps(el, origin, deps, warnings)`:
- Kod, öğe kutusuna sessiz bölge dahil sığdırılır. QR: kare, kutunun kısa kenarına göre ortalanır. 1B: modül genişliği = genişlik / (modül sayısı + 2×quiet); çubuk yüksekliği = kutu yüksekliği, `showText` açıksa yazı payı düşülür.
- Çizim tek bir `PathOp` (`fill: el.color`, `scale: 1`): bitişik koyu modüller tek dikdörtgen olarak birleştirilir (`M x y h w v h h -w Z`). Yeni op türü gerekmez; önizleme (SVG) ve PDF mevcut yoldan çizer.
- `showText` (yalnız 1B): kodun altına `sans`, ortalı, kutuya sığan boyutta `TextOp`. EAN-13'te 13 hane tek satır (ilk hane gruplaması yok — sade tutuldu).
- Uyarılar (etiket numaralı, mevcut kalıpla):
  - Kodlama hatası → kod basılmaz, hata metni uyarı olur.
  - 1B modül < 0,25 mm veya QR modülü < 0,4 mm → "Kod bu boyutta okunmayabilir; büyütün."
  - Renk açıksa (göreli parlaklık > 0,5) → "Kod rengi çok açık; okuyucular koyu renk ister."
  - Kod çerçeve süsüne değerse mevcut `BAND_WARNING`.

## Arayüz

- Özellikler paneli: "+ Kod ekle" düğmesi (yazı ekle yanında). Yeni kod: QR, değer "Örnek", etiketin ortasında, kısa kenarın %60'ı kare (1B seçilince kutu 2:1'e genişletilmez; kullanıcı boyutlandırır).
- Kod seçiliyken: "Kod türü" (QR / Code 128 / EAN-13), "İçerik" (hücre seçiliyse o etiketin değeri, yazıdaki gibi), "Altına yazı" (yalnız 1B), Renk, X/Y/Genişlik/Yükseklik, Sil. Kodlama hatası alanın altında hemen gösterilir.
- Kilitli hücre alanları (`CellFields`): kod için "Kod içeriği" metin kutusu ve "Ortak içeriğe dön".
- Editör tuvali: kod `layoutDesign` ile çizildiği için ek iş yok; seçme/taşıma mevcut kutu mantığıyla çalışır.

## Listeden doldurma

- `FillRow`'a `codes: (string | null)[]` eklenir; `rowsFromTable(table, textColumns, codeColumns, keyColumn)`. Değerler kod öğelerine sırayla eşlenir (yazıdaki kural; ayrılmış hücreler kendi sıralarını kullanır).
- Pencerede "Sütunlar" bölümünde yazı alanlarının ardından "N. kod alanı · QR" satırları; varsayılan "Ortak kalsın" (yazıdan farklı: sütun sırası yazılara gider, kod kullanıcı seçince dolar). Önizleme tablosunda kod sütunları da görünür.
- Durum satırı, kodlanamayan değer sayısını söyler: "3 satırın kodu üretilemedi (ör. 5. satır: EAN-13 kontrol hanesi yanlış)". Doldurma yine yapılır; o etiketler PDF uyarısında da çıkar.

## Hatalar ve sınırlar

Tüm kodlama hataları Türkçe, ne yapılacağını söyler; uygulama çökmez, yanlış kod basılmaz. Code 128 en fazla 80 karakter; QR kütüphanenin sınırı.

## Test

- `tests/core/codes.test.ts`: EAN-13 bilinen örnekler (`400638133393` → `4006381333931`, yanlış kontrol hanesi hatası, harf hatası); Code 128 bilinen desenler (B ve C kümeleri, karışık "AB1234567", kontrol karakteri), Türkçe harf hatası, 80 karakter sınırı; QR: ASCII, Türkçe ("Şeker ığdır"), URL, uzun metin — `jsqr` (yalnız geliştirme bağımlılığı) ile modül matrisi görüntüye çevrilip geri okunur ve içerik eşit; sığmayan metin hatası.
- `tests/render/…`: modül birleştirme (bitişik çubuk tek dikdörtgen), sessiz bölge, küçük kod/açık renk uyarıları, `showText`, hücre değeri kodu değiştirir/boş değer gizler.
- `tests/core/document…`: kod öğesi doğrulama, bozuk `format` reddi, eski dosya aynen açılır.
- `tests/ui/…`: kod ekleme, tür değiştirme, hata mesajı; listeden doldurmada kod sütunu eşleme ve hata sayısı.
- Elle: tarayıcıda (5184) kod ekleme ve PDF; PDF pdfjs ile sayfa içinde çizilip QR jsQR ile okunur.
