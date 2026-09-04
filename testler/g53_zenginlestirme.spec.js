'use strict';
/* G53 — Kütüphane zenginleştirme (zengin.js, v63). Üç iş:
   M1 toplu zenginleştirme: eksik sayımı → aralıklı tarama (durdurulabilir,
      kaldığı yerden devam) → ÖNİZLEME (onaysız yazma YOK) → uygula
      (yalnız BOŞ alanlar; dolu alan korunur; taksonomiye eşleşmeyen tür boş).
   M2 hızlı puanlama: puansız bitmişler sırayla, tek dokunuş + atla + ilerleme.
   M3 bitiş yılı: otomatik doldurma YOK; dürüst not + kitap kitap yıl atama.
   (Mutasyon 1: uygula'daki "yalnız boşsa" şartı kaldırılır → "dolu alana
    dokunmuyor" vakası kırmızı. Mutasyon 2: tarama bitince önizleme yerine
    doğrudan uygula çağrılır → "önizleme olmadan yazma yok" vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc, bugunISO } = require('./yardim');

const TURLER = [
  { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
  { seo: 'Tarih', ad: 'Tarih', kitapSayisi: 11576 },
  { seo: 'Cocuk', ad: 'Çocuk', kitapSayisi: 8223 },
  { seo: 'Bilim-Kurgu', ad: 'Bilim-Kurgu', kitapSayisi: 2470 },
  { seo: 'Felsefe-Dusunce', ad: 'Felsefe-Düşünce', kitapSayisi: 4114 },
  { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1000 },
  { seo: 'Biyografi', ad: 'Biyografi', kitapSayisi: 3047 },
  { seo: 'Dunya-Klasikleri', ad: 'Dünya Klasikleri', kitapSayisi: 862 }
  /* Şiir BİLEREK YOK: "sözlükte var, taksonomide yok → boş" vakası bunu kullanır */
];
function gbYanit(kitaplar) {
  return { totalItems: kitaplar.length, items: kitaplar.map(k => ({ volumeInfo: {
    title: k.ad, authors: k.yazar ? [k.yazar] : [],
    categories: k.kategoriler || undefined,
    industryIdentifiers: k.isbn13 ? [{ type: 'ISBN_13', identifier: k.isbn13 }] : undefined,
    pageCount: k.sayfa || undefined, publisher: k.yayinevi || undefined,
    publishedDate: k.yil ? String(k.yil) : undefined,
    imageLinks: k.kapak ? { thumbnail: k.kapak } : undefined
  } })) };
}
/* gerçek yedek yapısına benzer dağılım: tur/isbn boş, sayfa/yayınevi çoğunlukla dolu */
function gercekBenzeri() {
  return [
    sahteKitap({ ad: 'Dolu Kitap', yazar: 'Yazar Bir', durum: 'bitti', sayfa: 300,
      yayinevi: 'Yay A', yil: 2019, tur: '', isbn: '', puan: 8, bitisTarihi: '2021-03-01' }),
    sahteKitap({ ad: 'Yarı Dolu', yazar: 'Yazar İki', durum: 'bitti', sayfa: null,
      yayinevi: '', yil: null, tur: '', isbn: '', puan: null, bitisTarihi: null }),
    sahteKitap({ ad: 'Türlü Kitap', yazar: 'Yazar Üç', durum: 'okunacak', sayfa: 200,
      yayinevi: 'Yay B', yil: 2020, tur: 'Roman', isbn: '9786053609902' })
  ];
}
async function zenginAc(page) {
  await tohumla(page, gercekBenzeri());
  await rafAc(page);
  await ayarlarAc(page);
}

test.describe('G53 M1 — sayım, tarama, önizleme, uygulama', () => {

  test('eksik alan sayımı doğru (gerçek yedek yapısıyla)', async ({ page }) => {
    await zenginAc(page);
    const s = await page.evaluate(() => window.__zengin.eksikSayim());
    expect(s.toplam).toBe(3);
    expect(s.tur).toBe(2);        // 2 kitapta tür boş
    expect(s.isbn).toBe(2);
    expect(s.sayfa).toBe(1);
    expect(s.yayinevi).toBe(1);
    expect(s.yil).toBe(1);
    await expect(page.locator('#zgDurum')).toContainText('2 kitapta tür');
    await expect(page.locator('#zgDurum')).toContainText('2 kitapta isbn');
  });

  test('tarama → önizleme → uygula: DOLU alana dokunmaz, boşu doldurur, damga basar (mutasyon kilidi)', async ({ page }) => {
    await zenginAc(page);
    // Google: "Dolu Kitap" için ÇELİŞEN sayfa (300 yerine 280) + yeni tür/ISBN;
    // "Yarı Dolu" için her alan
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = gbYanit([{ ad: 'Dolu Kitap', yazar: 'Yazar Bir',
      kategoriler: ['Fiction'], isbn13: '9789750718533', sayfa: 280, yayinevi: 'Başka Yay', yil: 2015 }]);
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTarama')).toHaveClass(/acik/, { timeout: 15000 });
    // tarama bitince önizleme gelir (2 eksikli kitap işlenir; google hep aynı yanıtı verir
    // ama başlık uyuşmazlığı "Yarı Dolu"yu elemeli)
    await expect(page.locator('#zgTaramaGovde')).toContainText('Bulunanları uygula', { timeout: 20000 });
    // ÖNİZLEMEDEN ÖNCE HİÇBİR ŞEY YAZILMADI (mutasyon 2 kilidi)
    let k1 = await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'Dolu Kitap'));
    expect(k1.tur).toBe('');
    expect(k1.isbn).toBe('');
    await expect(page.locator('#zgTaramaGovde .zg-ozet')).toContainText('Tür');
    /* İKİNCİ KORUMA KATMANI (mutasyon 1'in asıl hedefi): tarama SIRASINDA boş
       olup bulunan ISBN alanını, uygulamadan ÖNCE kullanıcı elle doldurmuş
       olsun — uygula MEVCUDU korumalı, bulunanı EZMEMELİ. */
    await page.evaluate(() => {
      veri.kitaplar.find(k => k.ad === 'Dolu Kitap').isbn = '9999999999999';
    });
    await page.click('#zgTaramaGovde [data-act="zg-uygula"]');
    k1 = await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'Dolu Kitap'));
    expect(k1.isbn).toBe('9999999999999');  // elle girilen KORUNDU (mutasyon 1 kilidi)
    expect(k1.tur).toBe('Roman');           // Fiction → taksonomi Roman
    expect(k1.sayfa).toBe(300);             // DOLUYDU (280 çelişiyor) → KORUNDU
    expect(k1.yayinevi).toBe('Yay A');      // doluydu → korundu
    expect(k1.yil).toBe(2019);              // doluydu → korundu
    expect(k1.g).toBeGreaterThan(0);        // kullanıcı eylemi damgası
    // yenilemede kalıcı (normalize korur)
    await page.reload();
    const k1b = await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'Dolu Kitap'));
    expect(k1b.tur).toBe('Roman');
  });

  test('tür eşlemesi: taksonomiye eşleşmeyen tür BOŞ bırakılır (uydurma yok)', async ({ page }) => {
    await zenginAc(page);
    const t = await page.evaluate((TURLER) => {
      window.__zengin.taksonomiKur(TURLER);
      return {
        roman: window.__zengin.turCevir(['Turkish fiction']),
        cocuk: window.__zengin.turCevir(['Juvenile Fiction']),
        bilimKurgu: window.__zengin.turCevir(['Science Fiction / Genel']),
        cop1: window.__zengin.turCevir(['Antiques & Collectibles']),
        cop2: window.__zengin.turCevir(['Education']),
        cop3: window.__zengin.turCevir(['Turkey']),
        sozlukteVarTaksonomideYok: window.__zengin.turCevir(['Poetry']),  // TURLER fikstüründe Şiir yok
        bos: window.__zengin.turCevir(undefined)
      };
    }, TURLER);
    expect(t.roman).toBe('Roman');
    expect(t.cocuk).toBe('Çocuk');
    expect(t.bilimKurgu).toBe('Bilim-Kurgu');   // spesifik kural jenerik 'fiction'dan önce
    expect(t.cop1).toBe('');
    expect(t.cop2).toBe('');
    expect(t.cop3).toBe('');
    expect(t.sozlukteVarTaksonomideYok).toBe('');
    expect(t.bos).toBe('');
  });

  /* v64: sözlük gerçek kütüphane ölçümüyle genişletildi (v63 canlıda 0/12,
     taban ölçümü 4/30 → 14/30). Vakalar görevden: (a) Philosophy, (b) Drama,
     (c) TR katlama, (d) konu etiketleri BOŞ, (e) çoklu kategoride ilk güvenli,
     (f) taksonomi kapısı (üstteki Poetry vakası) + kapı-çıkmazı düzeltmesi. */
  test('tür eşlemesi v64: genişletilmiş sözlük — güvenli eşleme, TR katlama, çoklu kategori, kelime sınırı', async ({ page }) => {
    await zenginAc(page);
    const t = await page.evaluate((TURLER) => {
      window.__zengin.taksonomiKur(TURLER);
      const c = window.__zengin.turCevir;
      return {
        felsefe: c(['Philosophy']),                                // (a)
        tiyatro: c(['Drama']),                                     // (b)
        tragedya: c(['Tragedy']),                                  // (b) canlı Persler vakası
        trKatla: c(['Fransız romanı']),                            // (c) TR kategori, katlamalı
        trKlasik: c(['Dünya klasikleri']),                         // (c) canlı Ölüler Evinden Anılar vakası
        ref: c(['Reference']),                                     // (d)
        anatomi: c(['Human anatomy']),                             // (d)
        bira: c(['Beer']),                                         // (d)
        sahne: c(['Performing Arts']),                             // (d) kelime sınırı: 'art' anahtarı kalktı
        dilSanat: c(['Language Arts & Disciplines']),              // (d)
        sanat: c(['Art']),                                         // (d) konu etiketi
        kisi: c(['Scientists']),                                   // (d) kişi kategorisi
        coklu1: c(['Human anatomy', 'Philosophy']),                // (e) ilk GÜVENLİ kazanır
        coklu2: c(['Philosophy', 'Language Arts & Disciplines']),  // (e) ilk kategori kazanır
        kapiDuzelt: c(['Biography & Autobiography']),              // kapı-çıkmazı: v63 hedefi taksonomide yoktu
        romanTam: c(['Roman']),                                    // 'tam' mod: yalın kategori eşlenir
        romanTuzak: c(['Roman Empire'])                            // 'tam' mod: parça eşlenMEZ
      };
    }, TURLER);
    expect(t.felsefe).toBe('Felsefe-Düşünce');
    expect(t.tiyatro).toBe('Tiyatro');
    expect(t.tragedya).toBe('Tiyatro');
    expect(t.trKatla).toBe('Roman');
    expect(t.trKlasik).toBe('Dünya Klasikleri');
    expect(t.ref).toBe('');
    expect(t.anatomi).toBe('');
    expect(t.bira).toBe('');
    expect(t.sahne).toBe('');
    expect(t.dilSanat).toBe('');
    expect(t.sanat).toBe('');
    expect(t.kisi).toBe('');
    expect(t.coklu1).toBe('Felsefe-Düşünce');
    expect(t.coklu2).toBe('Felsefe-Düşünce');
    expect(t.kapiDuzelt).toBe('Biyografi');
    expect(t.romanTam).toBe('Roman');
    expect(t.romanTuzak).toBe('');
  });

  test('tür v64: ilk uyan adayda kategori yokken BAŞLIĞI UYAN diğer adaydan bulunur', async ({ page }) => {
    await zenginAc(page);
    page.__agAyar.turler = TURLER;
    /* 1. aday: başlık uyar, kategorisiz (v63 burada pes ediyordu);
       2. aday: başlık uymaz, kategorili (kullanılmaMAlı);
       3. aday: başlık uyar, kategorili → tür buradan gelmeli */
    page.__agAyar.google = gbYanit([
      { ad: 'Dolu Kitap', yazar: 'Yazar Bir' },
      { ad: 'Bambaşka Bir Eser', yazar: 'Başkası', kategoriler: ['Drama'] },
      { ad: 'Dolu Kitap', yazar: 'Yazar Bir', kategoriler: ['Biography & Autobiography'] }
    ]);
    const b = await page.evaluate(async (TURLER) => {
      window.__zengin.taksonomiKur(TURLER);
      return (await window.__zengin.kitapSorgula(veri.kitaplar.find(k => k.ad === 'Dolu Kitap'))).b;   // v102: {b, red}
    }, TURLER);
    expect(b.tur).toBe('Biyografi');   // uymayan adayın Drama'sı DEĞİL, uyan adayın türü
  });

  test('kota: istekler aralıklı — ardışık Google istekleri arası ölçülen boşluk', async ({ page }) => {
    const zamanlar = [];
    await tohumla(page, [
      sahteKitap({ ad: 'K Bir', yazar: 'Y', tur: '', isbn: '' }),
      sahteKitap({ ad: 'K İki', yazar: 'Y', tur: '', isbn: '' }),
      sahteKitap({ ad: 'K Üç', yazar: 'Y', tur: '', isbn: '' })]);
    await rafAc(page);
    await page.route(u => u.href.includes('googleapis.com/books'), route => {
      zamanlar.push(Date.now());
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ totalItems: 0, items: [] }) });
    });
    await ayarlarAc(page);
    page.__agAyar.turler = TURLER;
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTaramaGovde')).toContainText('tarandı', { timeout: 30000 });
    await expect.poll(() => zamanlar.length, { timeout: 30000 }).toBeGreaterThanOrEqual(6);
    // her kitapta dar+gevşek 2 istek; ardışık istekler tek seferde PATLAMAZ
    const araliklar = zamanlar.slice(1).map((t, i) => t - zamanlar[i]);
    const kucukler = araliklar.filter(a => a < 400).length;
    expect(kucukler, 'aralıksız ardışık istekler: ' + JSON.stringify(araliklar)).toBe(0);
  });

  test('toplu iş DURDURULABİLİR; yarım kalan kaldığı yerden devam eder', async ({ page }) => {
    const kitaplar = [];
    for (let i = 0; i < 6; i++) kitaplar.push(sahteKitap({ ad: 'Kitap ' + i, yazar: 'Y', tur: '', isbn: '' }));
    await tohumla(page, kitaplar);
    await rafAc(page);
    await ayarlarAc(page);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { totalItems: 0, items: [] };
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTarama')).toHaveClass(/acik/);
    await page.click('#zgTaramaGovde [data-act="zg-durdur"]');   // ilk kitaplar sürerken durdur
    await expect(page.locator('#zgTaramaGovde')).toContainText('yarım — devam edebilirsin', { timeout: 20000 });
    const durum1 = await page.evaluate(() => window.__zengin.kuyrukYukle());
    const islenen1 = Object.keys(durum1.islenen).length;
    expect(islenen1).toBeGreaterThan(0);
    expect(islenen1).toBeLessThan(6);
    expect(durum1.bitti).toBe(false);
    // devam: kaldığı yerden (işlenenler yeniden sorgulanmaz — google sayacıyla kanıt)
    const onceGoogle = page.__agSayac.google;
    await page.click('#zgTaramaGovde [data-act="zg-tara"]');
    // bitiş: sıfır-bulgu taraması "bulunamadı" der ve kuyruğu temizler
    await expect(page.locator('#zgTaramaGovde')).toContainText('bulunamadı', { timeout: 40000 });
    expect(await page.evaluate(() => window.__zengin.kuyrukYukle())).toBe(null);
    const kalanKitap = 6 - islenen1;
    expect(page.__agSayac.google - onceGoogle).toBeLessThanOrEqual(kalanKitap * 2);
  });

  test('ağ hatasında dürüst mesaj, yarım veri yazılmıyor', async ({ page }) => {
    const kitaplar = [];
    for (let i = 0; i < 6; i++) kitaplar.push(sahteKitap({ ad: 'Kitap ' + i, yazar: 'Y', tur: '', isbn: '' }));
    await tohumla(page, kitaplar);
    await rafAc(page);
    await ayarlarAc(page);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = 'hata';                       // her istek düşer
    page.__agBeklenmeyen.length = 0;                     // abort'lar beklenmeyen sayılmaz zaten
    await page.click('#ortuAyar [data-act="zg-tara"]');
    // art arda 5 hata → duraklama + dürüst metin; hiçbir kitaba yazılmadı
    await expect(page.locator('#toast')).toContainText('Kaynağa ulaşılamıyor', { timeout: 20000 });
    const yazilan = await page.evaluate(() =>
      veri.kitaplar.filter(k => k.tur || k.isbn).length);
    expect(yazilan).toBe(0);
    const durum = await page.evaluate(() => window.__zengin.kuyrukYukle());
    expect(durum.bitti).toBe(false);                     // devam edilebilir
  });

  test('önizlemede tek tek görme + satır çıkarma (✕) çalışır', async ({ page }) => {
    await zenginAc(page);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = gbYanit([{ ad: 'Dolu Kitap', yazar: 'Yazar Bir', kategoriler: ['Fiction'] }]);
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTaramaGovde')).toContainText('Bulunanları uygula', { timeout: 20000 });
    await page.click('#zgTaramaGovde .zg-katla summary');
    await expect(page.locator('#zgTaramaGovde .zg-onizle-satir')).toHaveCount(1);
    await page.click('#zgTaramaGovde [data-act="zg-cikar"]');
    // tek satır çıkınca yazılacak bir şey kalmaz
    await expect(page.locator('#zgTaramaGovde')).toContainText('yazılacak yeni bilgi bulunamadı');
    const k = await page.evaluate(() => veri.kitaplar.find(x => x.ad === 'Dolu Kitap'));
    expect(k.tur).toBe('');
  });
});

test.describe('G53 M2 — hızlı puanlama', () => {

  test('puan yazılır + damga, sonrakine geçer, atla çalışır, ilerleme doğru', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'P Bir', durum: 'bitti', puan: null, bitisTarihi: '2024-05-01' }),
      sahteKitap({ ad: 'P İki', durum: 'bitti', puan: null, bitisTarihi: '2023-05-01' }),
      sahteKitap({ ad: 'P Üç', durum: 'bitti', puan: 7, bitisTarihi: '2022-05-01' }),
      sahteKitap({ ad: 'Okunuyor', durum: 'okunuyor' })]);
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    // İstatistik köprüsü: mevcut mini-not'ta yeni "hızlı puanla" bağlantısı
    await expect(page.locator('#istPuansiz')).toContainText('2 bitmiş kitap henüz puansız');
    await page.click('#istPuansiz [data-act="zg-puanla"]');
    await expect(page.locator('#zgPuanOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#zgPuanOrtuGovde .zg-sayac')).toHaveText('1 / 2');
    await expect(page.locator('#zgPuanOrtuGovde .zg-kitap-ad')).toHaveText('P Bir');   // yeni→eski sıra
    await page.click('#zgPuanOrtuGovde [data-act="zg-puan"][data-v="9"]');
    // puan yazıldı + otomatik sonraki
    expect(await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'P Bir').puan)).toBe(9);
    expect(await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'P Bir').g)).toBeGreaterThan(0);
    await expect(page.locator('#zgPuanOrtuGovde .zg-sayac')).toHaveText('2 / 2');
    await expect(page.locator('#zgPuanOrtuGovde .zg-kitap-ad')).toHaveText('P İki');
    await page.click('#zgPuanOrtuGovde [data-act="zg-atla"]');
    await expect(page.locator('#zgPuanOrtuGovde')).toContainText('tümü gözden geçirildi');
    expect(await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'P İki').puan)).toBe(null);
  });
});

test.describe('G53 M3 — bitiş tarihi eksikliği', () => {

  test('eksik görünür + otomatik doldurma YOK; kitap kitap yıl atama çalışır', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'Tarihsiz Bir', durum: 'bitti', puan: 8, bitisTarihi: null }),
      sahteKitap({ ad: 'Tarihsiz İki', durum: 'bitti', puan: 7, bitisTarihi: null }),
      sahteKitap({ ad: 'Tarihli', durum: 'bitti', puan: 9, bitisTarihi: '2024-02-10' }),
      sahteKitap({ ad: 'Tarihli Eski', durum: 'bitti', puan: 6, bitisTarihi: '2021-02-10' })]);
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    const not = page.locator('#istTarihsiz');
    await expect(not).toContainText('2 bitmiş kitapta bitiş tarihi yok');
    await expect(not).toContainText('yıl raporuna girmiyorlar');
    // OTOMATİK DOLDURMA YOK: not görünse de veri değişmedi
    expect(await page.evaluate(() =>
      veri.kitaplar.filter(k => k.durum === 'bitti' && !k.bitisTarihi).length)).toBe(2);
    await page.click('#istTarihsiz [data-act="zg-tarih"]');
    await expect(page.locator('#zgTarihOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#zgTarihOrtuGovde .zg-sayac')).toHaveText('1 / 2');
    await expect(page.locator('#zgTarihOrtuGovde')).toContainText('Gün/ay uydurulmaz');
    await page.click('#zgTarihOrtuGovde [data-act="zg-yil"][data-v="2022"]');
    expect(await page.evaluate(() =>
      veri.kitaplar.find(k => k.ad === 'Tarihsiz Bir').bitisTarihi)).toBe('2022-01-01');
    // atla veri yazmaz
    await page.click('#zgTarihOrtuGovde [data-act="zg-atla-tarih"]');
    await expect(page.locator('#zgTarihOrtuGovde')).toContainText('kalan kitap yok');
    expect(await page.evaluate(() =>
      veri.kitaplar.find(k => k.ad === 'Tarihsiz İki').bitisTarihi)).toBe(null);
  });
});

test.describe('G53 Ciltli sözleşme', () => {

  test('zg pencereleri: dolu düğme yok, yuvarlak kart yok, kicker var, AA', async ({ page }) => {
    await zenginAc(page);
    // Ayarlar bölümü kicker'lı (g48 sayımı ayrıca kilitliyor)
    await expect(page.locator('#ayBolumZengin .kicker')).toHaveText('Zenginleştir');
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = gbYanit([{ ad: 'Dolu Kitap', yazar: 'Yazar Bir', kategoriler: ['Fiction'] }]);
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTaramaGovde')).toContainText('Bulunanları uygula', { timeout: 20000 });
    await page.click('#zgTaramaGovde .zg-katla summary');
    const ihlaller = await page.evaluate(() => {
      const sonuc = [];
      const kok = document.getElementById('zgTaramaGovde');
      [kok, ...kok.querySelectorAll('*')].forEach(el => {
        const s = getComputedStyle(el);
        const r = Math.max(...String(s.borderRadius).split(' ').map(parseFloat).filter(n => !isNaN(n)), 0);
        if (r > 7) sonuc.push('yarıçap ' + r + ': ' + el.className);
        if (s.boxShadow !== 'none') sonuc.push('gölge: ' + el.className);
        if (el.tagName === 'BUTTON') {
          const a = s.backgroundColor.match(/[\d.]+/g);
          const alfa = a && a.length === 4 ? parseFloat(a[3]) : (s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 0 : 1);
          if (alfa >= 0.5) sonuc.push('dolu düğme: ' + el.className);
        }
      });
      return sonuc;
    });
    expect(ihlaller).toEqual([]);
    // AA: gövde metin rolleri iki temada
    const oranlar = await page.evaluate(() => {
      const COZ = z => {
        let m = String(z).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
        m = String(z).match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
        return m ? { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
      };
      const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const olc = sec => {
        const el = document.querySelector(sec);
        if (!el) return null;
        const m = COZ(getComputedStyle(el).color);
        const sheetBg = COZ(getComputedStyle(document.querySelector('#zgTarama .sheet')).backgroundColor);
        const l1 = L(m), l2 = L(sheetBg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const sonuc = {};
      ['.zg-satir', '.zg-ozet', '.zg-not', '.zg-onizle-ad', '.zg-onizle-alan'].forEach(s => { sonuc[s] = olc(s); });
      document.documentElement.dataset.tema = 'karanlik';
      ['.zg-satir', '.zg-not'].forEach(s => { sonuc['koyu ' + s] = olc(s); });
      document.documentElement.dataset.tema = 'acik';
      return sonuc;
    });
    for (const [ad, o] of Object.entries(oranlar)) {
      expect(o, ad).not.toBe(null);
      expect(o, ad + ' AA').toBeGreaterThanOrEqual(4.5);
    }
  });
});
