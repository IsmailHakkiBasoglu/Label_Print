# Label Print

Hazır etiket kağıtlarına basılacak etiketleri görerek tasarlayıp **ölçüsü bozulmamış PDF** almayı sağlayan, internetsiz çalışan web uygulaması.

- Tanex A4 şablonlarının 159'u hazır gelir; ölçüleri şüpheli olanlar "Kontrol et" rozetiyle ve nedeniyle gösterilir.
- Kendi şablonunu tanımlama, şablonu JSON olarak içe aktarma.
- Yaprakta yalnızca seçili etiketlere basma, yarım kalmış yaprağa "Buradan başlat", kağıdın bir bölümüne serbest içerik.
- Her etikete farklı isim ve görsel: listeyi yapıştır, hücreler sırayla dolsun, uygun görsel kendiliğinden gelsin. Excel (.xlsx) veya CSV dosyasından da alınır: her sütun etiketteki bir yazı alanına eşlenir (ör. ad, tarih, fiyat). İstenen hücre ortak tasarımdan ayrılabilir, liste taşarsa yeni sayfa açılır.
- 6 düz ve 24 süslü çerçeve; motifler gerilmeden her etiket ölçüsüne oturur. Hazır yazı desenleri, otomatik metin sığdırma.
- 228 tek renk sembol ve 351 renkli görsel, Türkçe arama: "Mısır" yazınca mısır koçanı önerilir.
- Kendi PNG, JPG veya SVG görselini ekleme; kaydedilen proje dosyası görselleri de içinde taşır.
- Cetvelli kalibrasyon sayfası ve yazıcı kayması düzeltmesi.

## Çalıştırma

Node 24 gerekir.

```bash
npm install
```

```bash
npm run dev
```

Terminalde yazan yerel adresi tarayıcıda aç.

## Yazdırırken

PDF'i **Gerçek boyut / %100** ölçekle yazdır. "Sayfaya sığdır" seçeneği ölçüleri bozar. İlk kullanımda Kalibrasyon PDF'ini basıp cetvelleri ölçmen, kayma varsa Yazıcı düzeltmesi alanlarına girmen önerilir.

## Geliştirme

```bash
npm test
```

| Komut | Görev |
|---|---|
| `npx tsx tools/import-tanex/run.ts` | Tanex sayfasından şablon kataloğunu yeniden üretir (`data/templates.tanex.json`) |
| `npx tsx tools/build-symbols.ts` | Sembol kataloğunu `src/library/symbols/source.json` dosyasından üretir. `FLUENT_EMOJI_DIR` bir Fluent Emoji kopyasını gösteriyorsa renkli kataloğu da üretir |

Şablon ölçüleri Tanex'in herkese açık Word şablonlarından okunur; Word dosyaları depoda bulunmaz. Bu proje Tanex ile bağlantılı değildir. Lisanslar için [THIRD_PARTY.md](THIRD_PARTY.md).

Bu proje Claude (Anthropic) yardımıyla geliştirildi.
