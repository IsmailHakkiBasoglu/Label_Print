# Label Print v2: hücre içeriği, süslü çerçeveler, renkli görseller

Durum: tasarım onaylandı, spec incelemede. Üst belge: `2026-11-08-label-print-design.md`.

## Amaç

v1'de bir ızgaradaki bütün hücreler aynı içeriği basıyor. v2 ile kullanıcı, aynı çerçeveli bir etiket setinde her hücreye farklı isim ve görsel basabilir (örnek: mutfak ürün listesi). Ayrıca düz çizgilerin yanında süslü çerçeve kütüphanesi ve tek renkli ikonların yanında renkli görsel kütüphanesi gelir.

Başarı ölçütü: 30 satırlık bir ürün listesi yapıştırılır, her hücre kendi adını ve uygun görselini alır, ortak çerçeve tek yerden değişir ve PDF ölçüleri v1 ile birebir aynı kalır.

## Kullanıcı kararları

- Hücre modeli: **ortak tasarım + istisna**. Yerleşim ortak, içerik hücreye özel; istenen hücre ortak tasarımdan ayrılabilir.
- Renkli görsel: **hazır açık lisanslı vektör set + kullanıcının PNG, JPG, SVG yüklemesi**.
- Süslü çerçeveler: kendi çizimimiz, parçalardan kurulur.

## Değişmeyenler

- Tüm ölçüler mm. Önizleme ve PDF aynı `RenderOp[]` listesinden üretilir.
- Yazı tipleri tam gömülür (`subset:false`).
- Şablon kataloğu ve serbest bölgeler bu sürümde değişmez. Serbest bölge tek tasarımdır, hücre içeriği yalnız ızgara bölgelerinde vardır.

## Kapsam dışı

Excel/CSV aktarımı, barkod/QR, SVG gradyan ve dönüşüm desteği, satır başına birden çok sütunlu liste, hazır renkli çerçeveler.

## Belge modeli (sürüm 2)

```ts
type CellEntry = {
  values: Record<string, string>; // elementId -> yazı veya görsel kimliği
  designId?: string;              // doluysa hücre ortak tasarımdan ayrılmıştır
};

type GridZone = {
  kind: "grid";
  templateId: string;
  cells: CellSelection;
  designId: string;                  // ortak tasarım
  content: Record<number, CellEntry>; // hücre sırası -> içerik
};

type ImageMeta = { name: string; mime: "image/png" | "image/jpeg"; widthPx: number; heightPx: number };

type LabelProject = {
  version: 2;
  pages: Page[];
  designs: Record<string, LabelDesign>;
  images: Record<string, ImageMeta>; // anahtar: dosya içeriğinin SHA-256 özeti
  printOffset: { x: number; y: number };
};
```

Kurallar:

- Bir hücre basılırken tasarım `entry.designId ?? zone.designId` olur. Sonra her öğe için `values[element.id]` varsa yazı (`text`) veya görsel (`symbolId`) onunla değiştirilir. Boyut, konum, yazı tipi ve renk tasarımdan gelir.
- `values` içinde olmayan öğe tasarımdaki ortak değeri basar.
- Boş metin değeri o hücrede öğeyi basmaz. Görsel için boş değer de aynıdır.
- Tasarımdan silinen öğenin `values` kaydı basımda yok sayılır.
- `SymbolElement.symbolId` üç kaynaktan birini gösterir: tek renk kataloğu, renkli katalog (`color:` öneki), yüklenen görsel (`upload:<özet>`). Yeni öğe türü eklenmez; böylece hücre değeri her görsel türünü aynı yolla taşır.

### Sürüm 1 dosyalarının çevrilmesi

`parseProject` sürüm 1'i kabul eder ve sürüm 2'ye çevirir. `designIds[0]` ortak tasarım olur. Birden çok `designIds` varsa, v1'deki döngüde başka tasarıma düşen her hücre aynı tasarıma `designId` ile ayrılmış sayılır; basım sonucu değişmez. `images` boş başlar. Otomatik kayıt anahtarı `labelprint.project.v1` okunmaya devam eder, yeni yazımlar `labelprint.project.v2` anahtarına gider.

### Görsel baytlarının saklanması

Otomatik kayıt her değişiklikte `localStorage`'a yazıyor ve bu alan yaklaşık 5 MB ile sınırlı. Bu yüzden:

- Yüklenen baytlar IndexedDB'de özet anahtarıyla durur. Proje ve geri alma geçmişi yalnız `ImageMeta` taşır.
- "Dışa aktar" dosyası `imageData: Record<özet, base64>` alanını ekler; dosya taşınabilir. İçe aktarmada baytlar IndexedDB'ye yazılır.
- Projede adı geçen ama baytı bulunamayan görsel, PDF'i durduran açık bir hata verir ve önizlemede yer tutucu olarak görünür.
- IndexedDB kullanılamıyorsa yükleme açık bir mesajla reddedilir; proje bozulmaz.

## Aşama A: hücre başına içerik

### Düzenleme

- Düzenleme kapsamı üç durumludur: **Tüm hücreler** (varsayılan, ortak tasarımı değiştirir), **Bu hücre** (yalnız yazı ve görsel değerini değiştirir), **Ayrılmış hücre** (hücrenin kendi tasarımını değiştirir).
- Yaprak görünümünde hücreye tıklamak o hücreyi seçer ve editörde onun içeriğini gösterir. Boş alana tıklamak ya da "Tüm hücreler" düğmesi ortak moda döner. v1'deki hücre kullan/kullanma seçimi ayrı bir "Hücre seç" modunda kalır.
- "Bu hücre" modunda konum, boyut, yazı tipi ve çerçeve denetimleri kapalıdır, yerlerine "Bu hücreyi ayır" önerisi görünür.
- "Bu hücreyi ayır": ortak tasarım hücrenin değerleriyle birlikte yeni tasarıma kopyalanır. "Ortağa döndür": ayrı tasarım silinir, hücre değerleri uyuşan öğeler için korunur; işlem geri alınabilir.
- Üzerine yazılmış hücreler yaprakta küçük bir işaretle, ayrılmış hücreler farklı bir işaretle gösterilir.
- Hücre bazlı her işlem geri alma geçmişine girer.

### Listeden doldurma

- "Listeden doldur" penceresinde her satır bir hücreye gider. Boş satırlar atlanır.
- Satır, ortak tasarımdaki ilk yazı öğesine yazılır. Tasarımda yazı yoksa önce merkeze bir yazı öğesi eklenir.
- Doldurma, seçili hücre sırasına göre birinci kullanılan hücreden başlar. Yalnız seçili (kullanılan) hücreler dolar; kağıtta önceden harcanmış hücreler atlanır.
- Sembol önerisi açıksa (varsayılan) her satır için `searchSymbols`, ortak tasarımdaki ilk görsel öğesinin türünde (tek renk veya renkli) arar ve sonucu o öğeye yazar. Tasarımda görsel öğesi yoksa öneri kapalı görünür ve "Önce ortak tasarıma bir görsel ekleyin; hücreler onun yerini kullanır" açıklaması çıkar.
- Eşleşme yoksa o hücrenin görseli boş kalır ve pencere "n satır için görsel bulunamadı" der. Yanlış görsel basılmaz.
- Liste seçili hücre sayısından kısaysa artan hücreler kullanım dışı kalır, kağıt tekrar kullanılabilir. Doldurma öncesi önizlemede bu sayılar görünür.
- Liste yaprağı aşarsa, aynı şablon ve aynı ortak tasarımla, hücrelerin tamamı kullanılabilir yeni sayfalar açılır. Bu sayfalar `Page.fromList: true` ile işaretlenir. Yeniden doldurma yalnız bu işaretli sayfaları değiştirir ve onay ister.
- Desen uygulamak öğe kimliklerini yeniler; ortak hücrelerin değerleri aynı türdeki yeni öğelere sırayla taşınır, içerik kaybolmaz.

### Çok sayfa

Mağaza `pages[0]` varsayımından çıkar, etkin sayfayı `AppState.pageIndex` tutar. Araç çubuğunda önceki/sonraki, "Sayfa n / m" ve sayfa silme bulunur. Şablon değişimi bütün sayfalara uygulanır; hücre sayısı azalırsa sığmayan hücre içeriklerinin silineceği onaylatılır.

### Şablon değişimi

Hücre sırası geçerli kaldığı sürece `content` korunur. Yeni şablonda karşılığı olmayan sıralar silinir.

## Aşama B: süslü çerçeve kütüphanesi

### Çerçeve tanımı

```ts
type OrnamentPart = { size: [number, number]; d: string[] }; // birim uzayda
type OrnamentFrame = {
  id: string; name: string; category: string;
  corner: OrnamentPart;
  edge: OrnamentPart;  // uzunluğu tek motifin adımı
  bandRatio: number;   // süs bandının etiket kısa kenarına oranı
};
```

Parçaların yol verisi yalnız mutlak `M L C Z` komutları kullanır. Üretici noktaları kendi dönüştürür (döndürme, aynalama, ölçek) ve sonuç sıradan `PathOp` olur; PDF ve önizleme kodu değişmez.

### Yerleştirme

- Bant kalınlığı `b = clamp(min(w,h) * bandRatio, 2 mm, 12 mm)`. Köşe ve kenar parçaları bu kalınlığa **aynı X ve Y ölçeğiyle** uyarlanır; motif hiçbir zaman tek eksende gerilmez.
- Dört köşe aynalanarak yerleştirilir. Kalan kenar uzunluğu `L` için motif sayısı `n = max(1, round(L / adım))`; artan veya eksilen uzunluk motif aralarına eşit dağıtılır. Motif sığmıyorsa ölçek değil motif sayısı azalır, sıfıra inerse kenar boş kalır.
- Daire ve ovalde köşe kullanılmaz. Kenar motifi, yay uzunluğuna göre eşit aralıkla, eğriye teğet döndürülerek dizilir.
- Kısa kenar 12 mm'den küçükse süs okunmaz; çerçeve "Tek çizgi"ye düşer ve uyarı verilir.
- `insetMm` süsün dış kenarını, `color` rengini belirler. `strokeMm` yalnız çizgi tabanlı parçalara uygulanır.

### İçerik

En az 24 özgün çerçeve; klasik, bitkisel, kurdele, geometrik, mutfak, vintage kategorilerinde. v1'in 6 çerçevesi aynen kalır ve aynı kimliklerle çalışır. Panel, seçili etiketin gerçek ölçüsünde küçük önizlemeler gösterir.

### Uyarı

Yazı veya görsel kutusu süs bandıyla kesişiyorsa basımı durdurmayan bir uyarı verilir.

## Aşama C: renkli görseller

### Render

```ts
type VectorPath = { d: string; fill: boolean; strokeWidth: number; fillColor?: string; strokeColor?: string };
type ImageOp = { kind: "image"; imageId: string; x: number; y: number; width: number; height: number };
```

- `parseSvg` düz `fill` ve `stroke` renklerini saklar. Renk yoksa veya `currentColor` ise v1 gibi öğe rengi kullanılır; tek renk katalog aynı çıktıyı üretir (test edilir).
- `url(#...)` dolgu, gradyan veya `transform` içeren dosya açık mesajla reddedilir.
- Renkli görsel seçiliyken renk denetimi gizlenir.
- `ImageOp` en-boy oranını koruyarak öğe kutusuna ortalanır. PDF'te her görsel özet başına bir kez gömülür, hücre sayısı dosyayı şişirmez. Önizlemede `<image>` kullanılır.

### Hazır set

- Aday: Fluent Emoji Flat (MIT). Lisans indirme anında doğrulanır, `THIRD_PARTY.md`'ye yazılır. Lisans beklenen gibi değilse iş durur ve kullanıcıya sorulur.
- Yiyecek ve mutfak ağırlıklı 300–400 görsel seçilir. Türkçe etiketler `src/library/symbols/color-source.json` dosyasında elle tutulur.
- `tools/build-symbols.ts` ayrı `catalog.color.generated.json` üretir ve gradyanlı veya okunamayan dosyaları listeler; bunlar katalogda yer almaz.
- Renkli katalog ayrı bir paket parçası olarak yüklenir, ilk açılışı büyütmez. PDF üretimi yüklenmesini bekler.
- Panelde "Tek renk" ve "Renkli" sekmeleri aynı arama alanını kullanır.

### Kullanıcı yüklemesi

- Tür dosya uzantısına değil, içeriğin ilk baytlarına göre belirlenir. PNG, JPG, SVG dışındakiler reddedilir.
- Tek dosya en fazla 10 MB.
- SVG mevcut beyaz liste ayrıştırıcıdan geçer, script ve bağlantılar çıktıya ulaşmaz. SVG'ler v1 özel sembol deposuna renkleriyle yazılır; bu depo `localStorage`'da olduğu için tek SVG en fazla 200 KB olabilir. Projede kullanılan özel SVG'ler dışa aktarılan dosyaya `symbolData` alanıyla girer ve içe aktarmada depoya eklenir.
- PNG/JPG o öğenin baskı boyutunda 300 DPI'nin altındaysa, DPI değeriyle uyarı verilir. Basım durmaz.
- `pdf-lib`'in gömemediği dosya (örn. desteklenmeyen JPEG türü) yükleme anında denenip reddedilir, basım anında hata çıkmaz.

## Hata davranışı özeti

| Durum | Davranış |
|---|---|
| Listede eşleşmeyen satır | Görsel boş, sayı raporlanır |
| Hücre içeriği alana sığmıyor | v1'deki metin uyarısı, hücre sırasıyla |
| Görsel baytı yok | PDF durur, açık hata |
| Düşük çözünürlük | Uyarı, basım sürer |
| Süs bandıyla çakışma | Uyarı, basım sürer |
| Çok küçük etikette süs | Tek çizgiye düşer, uyarı |

## Test

- Model: v1 çevirisi (tek ve çok `designIds`), `values` önceliği, ayırma ve döndürme, bozuk v2 dosyalarının reddi.
- Liste: boş satır, fazla satır ve yeni sayfa, seçili olmayan hücreler, eşleşmeyen sembol.
- Çerçeve: motif ölçeğinin X ve Y'de eşitliği, tam sayıda tekrar, dört köşenin etiket içinde kalması, oval dizilim, küçük etiket düşüşü, geçerli yol verisi.
- Renk: tek renk çıktının v1 ile aynılığı, renk saklama, gradyan reddi, görselin PDF'e tek kez gömülmesi, DPI uyarısı.
- Depolama: `localStorage`'a bayt yazılmaması, dışa/içe aktarımda görsellerin korunması.
- Ölçü: v1 ölçü testleri aynen geçer; hücre içeriği etiket konumlarını değiştirmez.
- Her aşamada tarayıcıda deneme ve PDF'in gözle kontrolü. Fiziksel baskı kullanıcıdadır.

## Teslim

Aşama A, B, C sırayla; her biri test, birleştirme ve push ile biter.
