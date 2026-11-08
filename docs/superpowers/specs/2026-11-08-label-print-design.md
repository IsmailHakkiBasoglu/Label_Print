# Label_Print — Tasarım Belgesi

Tarih: 2026-11-08 · Durum: Kullanıcı onayı bekliyor

## 1. Amaç

Hazır etiket kağıtlarına (öncelikle Tanex A4 şablonları) basılacak etiketleri görerek tasarlamayı ve **ölçüsü bozulmamış** PDF almayı sağlayan, genel amaçlı, internetsiz çalışan bir uygulama.

Başarı ölçütleri:

1. Tanex sayfasındaki 159 şablonun tamamı uygulamada seçilebilir; ızgara bilgisi okunamayan veya çelişkili olanlar "kontrol et" olarak görünür.
2. Üretilen PDF'te sayfa boyutu ve her etiketin konumu, şablon verisine göre ±0,01 mm içindedir.
3. Bir etiket; çerçeve, yazı deseni ve sembolle birkaç tıklamada tasarlanır. "Mısır" yazınca mısır sembolü önerilir.
4. Listede olmayan bir şablon elle tanımlanabilir; bir yaprağın yalnızca seçilen etiketleri veya bir bölgesi kullanılabilir.

Kullanım alanı genel amaçlıdır; sembol kütüphanesi kategorili ve genişletilebilir kurulur.

## 2. Mimari

Vite + TypeScript + React ile yerel web uygulaması. Sunucu yoktur; PDF tarayıcıda `pdf-lib` ve `@pdf-lib/fontkit` ile üretilir. Testler Vitest ile yazılır. GitHub deposu public, MIT lisanslıdır.

Modüller birbirinden yalıtılmıştır:

| Modül | Görev | Bağımlılık |
|---|---|---|
| `src/core/geometry` | mm/pt dönüşümü, şablondan etiket konumlarını hesaplama | yok |
| `src/core/templates` | şablon modeli, doğrulama, katalog yükleme | geometry |
| `src/core/document` | tasarım belgesi modeli, JSON kaydet/aç | templates |
| `src/render/pdf` | belgeyi PDF'e yazar | core, kütüphaneler |
| `src/render/preview` | belgeyi SVG önizleme olarak çizer | core, kütüphaneler |
| `src/library/frames` | parametrik çerçeveler | geometry |
| `src/library/textPatterns` | yazı desenleri ve sığdırma | yok |
| `src/library/symbols` | sembol kataloğu ve Türkçe arama | yok |
| `src/ui` | ekranlar | hepsi |
| `tools/import-tanex` | Word şablonlarından katalog üreten Node betiği | templates |

PDF ve önizleme aynı yerleşim hesabını (`geometry`, çerçeve ve desen çıktıları) kullanır; böylece ekranda görülenle PDF ayrışmaz.

## 3. Şablon verisi

Tüm şablonlar tek modele uyar. Bütün ölçüler mm'dir.

```ts
type Template = {
  id: string;            // "TW-2021" ya da "custom-..."
  name: string;
  sheet: { width: number; height: number };
  grid: {
    columns: number; rows: number;
    marginTop: number; marginLeft: number;
    gapX: number; gapY: number;
  };
  label: { width: number; height: number;
           shape: "rect" | "rounded" | "circle" | "oval"; cornerRadius?: number };
  source: "tanex" | "custom";
  status: "verified" | "check";
  notes?: string[];
};
```

### Tanex içe aktarma

Tanex sayfası yalnızca kod, boyut ve Word dosyası bağlantısı verir. Örnek üç dosyada (TW-2021, TW-2130, TW-2148) gerekli değerlerin Word tablosunda bulunduğu doğrulandı:

- `w:pgSz` → kağıt boyutu; 11905/11906 twip gibi yuvarlamalar A4'e (210×297) normalize edilir.
- `w:pgMar` + `w:tblInd` → üst ve sol boşluk.
- `w:gridCol` → etiket ve araya giren aralık sütunları (örn. `63,5 3,02 63,5 3,02 63,5`).
- `w:trHeight` → etiket satırı ve varsa aralık satırı (örn. `29,99 2,61`).

`tools/import-tanex`, sayfadaki 159 satırlık listeyi (`tools/import-tanex/tanex-list.json`) girdi alır, dosyaları depo dışındaki geçici bir klasöre indirir ve `data/templates.tanex.json` üretir. Word dosyaları depoya girmez, yalnızca ölçüler girer.

Kural: etiket boyutu sayfa ile Word dosyası arasında 0,1 mm'den fazla ayrışıyorsa, dosya okunamıyorsa veya ızgara kağıda sığmıyorsa kayıt `status: "check"` alır ve nedeni `notes` alanına yazılır. Değer tahmin edilmez. Bilinen tutarsızlıklar: TW-2163'ün bağlantısı TW-2050 dosyasına gidiyor; TW-2270 sayfada 40×20, dosya adında 20x40; TW-2125, TW-2150, TW-3117 sayfada tek ölçülü ("25 mm") olduğu için şekil dosya ve kullanıcı kontrolüyle belirlenir.

Şekil sayfa adından alınır (Yuvarlak → circle, oval → oval); Word dosyalarında şekil çizimi yoktur. Köşe yarıçapı bu veride bulunmadığından `rect` varsayılır ve kullanıcı değiştirebilir.

## 4. Kendi şablonun ve kısmi kağıt kullanımı

- **Şablon oluşturucu:** kağıt ölçüsü, ızgara ve etiket şekli girilir; canlı önizlenir, sığmayan değerler kaydı engeller. Kayıt tarayıcıda tutulur, JSON olarak dışa/içe aktarılır.
- **Hücre seçimi:** yaprakta kullanılacak etiketler tıklanarak seçilir. Başlangıç noktası belirlenerek yarım yaprağa basılabilir.
- **Bölgeler:** bir sayfa dikdörtgen bölgelerden oluşur. Bölge türü `grid` (şablon ızgarası) veya `free` (serbest yazı, sembol, çerçeve) olur. Bölgelerin çakışması uyarı verir ve PDF üretimini engellemez; sayfa dışına taşma engeller.

## 5. Tasarım belgesi

```ts
type LabelDesign = { frameId?: string; frameOptions?: object;
                     elements: DesignElement[] };   // yazı, sembol
type Zone =
  | { kind: "grid"; templateId: string; cells: CellSelection; designIds: string[] }
  | { kind: "free"; x: number; y: number; width: number; height: number; design: LabelDesign };
type Page = { sheet: { width: number; height: number }; zones: Zone[] };
type LabelProject = { version: 1; pages: Page[]; designs: Record<string, LabelDesign>;
                      printOffset: { x: number; y: number } };
```

Eleman konumları etikete göre oransal değil mm olarak saklanır. Belge `.labelprint.json` olarak kaydedilir ve açılır; `version` alanı ileride dönüşüm içindir. Bozuk veya bilinmeyen sürümdeki dosya açılmaz, mevcut çalışmaya dokunulmaz ve hata gösterilir.

## 6. Kütüphaneler

- **Çerçeveler:** etiket boyutundan yeniden hesaplanan vektör yollar üreten fonksiyonlar. İlk sürümde: tek çizgi, çift çizgi, kesikli, yuvarlak köşe, köşe süslemeli, daire/oval şekle uyan. Parametreler: çizgi kalınlığı, iç boşluk, renk.
- **Yazı desenleri:** yazı alanlarını tanımlayan düzenler. İlk sürümde: tek başlık, başlık + alt başlık, ortalı rozet, üç satır bilgi, sembol solda + metin sağda, sembol üstte + metin altta. Metin alanına sığana dek küçültülür (alt sınır 4 pt); alt sınırda sığmıyorsa eleman uyarıyla işaretlenir, kesilmez.
- **Yazı tipleri:** Türkçe karakterli, açık lisanslı (OFL) yazı tipleri depoyla birlikte gelir ve PDF'e gömülür.
- **Semboller:** `id`, `kategori`, `etiketler[]`, `svg` alanlarından oluşan katalog. Temel: MIT/ISC lisanslı ikon setleri, eksikler projede çizilir; `THIRD_PARTY.md` lisansları listeler. Kategoriler: gıda ve tarım, ev, ofis, sağlık, araç, doğa, genel. Arama küçük harfe çevirip Türkçe karakterleri sadeleştirir ("Mısır" = "misir"), tam eşleşmeyi öne alır. Yazı girilince ilk eşleşmeler önerilir; kullanıcının kendi SVG'si script ve dış bağlantılardan temizlenip eklenir.

İlk sürüm hedefi: en az 150 sembol.

## 7. PDF ve ölçü güvencesi

- Dönüşüm yalnızca `geometry` içinde yapılır: `pt = mm × 72 / 25,4`. Yuvarlama yalnızca PDF'e yazarken uygulanır (en az 4 ondalık).
- Sayfa boyutu şablondaki kağıt boyutudur. Sığdırma, ölçekleme, gizli kenar boşluğu yoktur.
- Metin ve semboller vektördür. Kılavuz çizgileri (etiket kenarları) isteğe bağlıdır, varsayılan kapalıdır.
- Yazıcı kayması için belge düzeyinde X/Y düzeltmesi vardır.
- **Kalibrasyon PDF'i:** cetvelli ve artı işaretli bir test sayfası. Kullanıcı basıp ölçer, düzeltmeyi girer. PDF indirilirken "Gerçek boyut / %100 ile yazdırın" uyarısı gösterilir.

## 8. Arayüz

Üç alan: solda şablon arama (kod veya ölçüyle) ve kütüphaneler; ortada etiket editörü ile yaprak görünümü; sağda seçili elemanın özellikleri. Üstte Kaydet, Aç, PDF Al. Arayüz dili Türkçedir.

## 9. Hata durumları

- Eksik/hatalı şablon: `check` rozeti, nedeni gösterilir; yine de kullanılabilir.
- Sayfa dışına taşan bölge veya ızgara: PDF üretimi engellenir, neden gösterilir.
- Sığmayan metin: PDF alınabilir, öncesinde uyarı listelenir.
- Geçersiz SVG veya JSON: içe alınmaz, mevcut veri korunur.

## 10. Test

- `geometry`: TW-2021 için 21 etiketin konumu el hesabıyla; dönüşüm doğruluğu.
- Katalog: 159 kayıt var; her `verified` kayıt kağıda sığar.
- İçe aktarma: üç örnek Word XML'i için beklenen ızgara (dosyalardan türetilmiş küçük test fixture'ları, Tanex dosyasının kendisi değil).
- PDF: üretilen dosya `pdf-lib` ile yeniden açılır; sayfa boyutu ve kılavuz dikdörtgenleri beklenen konumlarla ±0,01 mm karşılaştırılır.
- Semboller: "Mısır", "misir", "MISIR" aynı sonucu verir; tüm SVG'ler ayrıştırılabilir.
- Arayüz: ana akış tarayıcıda elle/otomatik doğrulanır (şablon seç → tasarla → PDF al).

## 11. Kapsam dışı (ilk sürüm)

Excel/CSV'den toplu etiket üretimi, barkod ve QR, masaüstü paketleme, bulut eşitleme. `DesignElement` birleşim tipi yeni eleman türlerine açıktır.

Yol haritası `YOL_HARITASI.md`, değişiklikler `CHANGELOG.md` içinde tutulur (Foto Düzenleyici düzeni).
