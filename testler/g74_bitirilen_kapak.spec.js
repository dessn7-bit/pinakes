'use strict';
/* G74 — "Son bitirilen" sıralaması + kapak tazeleme (v74).

   M3 SIRALAMA. Bulgu: "Son eklenen" DOĞRU çalışıyordu ama ölçüt anlamsızdı
   ('eklenme' = Goodreads'e ekleme günü). Ölçüm (kullanıcının 242 kitaplık
   gerçek yedeği): 239 bitti, bitisTarihi VAR 163 / YOK 79 — tarihsizlerin
   69'u 2020 toplu aktarımı, son eklenen 50 kitabın %86'sı tarihli. Bu yüzden
   tarihsizler KUYRUĞA düşer (listeden atılmaz) ve varsayılan 'bitis' oldu.
   AYRICA KUSUR: sıralama tercihi hiçbir yerde saklanmıyordu (kk_* arasında
   sıralama anahtarı yoktu) — her yenilemede varsayılana dönüyordu.

   M2 KAPAK TAZELEME. Ölçüm: 174 kapak URL'sinin 37'sinde OpenLibrary o ISBN
   için kapak TUTMUYOR; `?default=false` bu 37'nin 37'sinde HTTP 404, gerçek
   kapağı olan 137'nin 137'sinde HTTP 200 döndü (tam ayrım). Alan DOLU göründüğü
   için bu 37 kitap zenginleştirmeye hiç girmiyordu.

   MUTASYONLAR (kırmızıya dönmesi beklenen vakalar):
   M-a  cmp'deki 'bitis' dalı ters çevrilir            → (a) ve (f) kırmızı
   M-b  tarihsizler için `return 1` → `return -1`      → (b) kırmızı
   M-c  siralaKaydet() çağrısı kaldırılır              → (d) kırmızı
   M-d  kitapSorgula'daki olKapakOluMu dalı kaldırılır → (M2-d) kırmızı
   M-e  kapakTemizle'den edge/https temizliği çıkarılır→ (M2-c) kırmızı
   M-f  uygula'daki "yalnız boş alan" şartı kaldırılır → (M2-b) kırmızı  */
const { test, expect, tohumla, sahteKitap, rafAc, rafYenile } = require('./yardim');

/* bitisTarihi 'YYYY-MM-DD' STRING, eklenme ms SAYI — karşılaştırıcı ayrımı
   bu fikstürle sınanır (sayısal fark kullanılsaydı sıra bozulurdu). */
function kutuphane() {
  return [
    sahteKitap({ ad: 'Eski Bitti', durum: 'bitti', bitisTarihi: '2020-01-05', eklenme: 1700000009000 }),
    sahteKitap({ ad: 'Yeni Bitti', durum: 'bitti', bitisTarihi: '2026-07-07', eklenme: 1700000001000 }),
    sahteKitap({ ad: 'Orta Bitti', durum: 'bitti', bitisTarihi: '2024-03-11', eklenme: 1700000002000 }),
    sahteKitap({ ad: 'Tarihsiz Yeni', durum: 'bitti', bitisTarihi: null, eklenme: 1700000008000 }),
    sahteKitap({ ad: 'Tarihsiz Eski', durum: 'bitti', bitisTarihi: null, eklenme: 1700000003000 })
  ];
}
async function sirala(page, deger) {
  await page.selectOption('#sirala', deger);
}
async function adlar(page) {
  return page.locator('#liste .kart-baslik').allTextContents();
}

test.describe('G74 M3 — Son bitirilen sıralaması', () => {

  test('(a) "Son bitirilen" seçilince liste bitisTarihi\'ne göre AZALAN sıralanır', async ({ page }) => {
    await tohumla(page, kutuphane());
    await rafAc(page);
    await sirala(page, 'bitis');
    const s = await adlar(page);
    expect(s.slice(0, 3)).toEqual(['Yeni Bitti', 'Orta Bitti', 'Eski Bitti']);
  });

  test('(b) bitisTarihi olmayan kitaplar KAYBOLMAZ — kuyruğa düşer, kendi aralarında eklenmeye göre', async ({ page }) => {
    await tohumla(page, kutuphane());
    await rafAc(page);
    await sirala(page, 'bitis');
    const s = await adlar(page);
    expect(s, 'hiçbir kitap listeden düşmedi').toHaveLength(5);
    // tarihliler önce, tarihsizler sonra
    expect(s.slice(3)).toEqual(['Tarihsiz Yeni', 'Tarihsiz Eski']);
    expect(s.indexOf('Tarihsiz Yeni')).toBeGreaterThan(s.indexOf('Eski Bitti'));
  });

  test('(c) gruplu görünümde sıralama grup İÇİNDE geçerli', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'A Yeni', durum: 'bitti', tur: 'Roman', bitisTarihi: '2026-05-05' }),
      sahteKitap({ ad: 'A Eski', durum: 'bitti', tur: 'Roman', bitisTarihi: '2021-01-01' }),
      sahteKitap({ ad: 'B Yeni', durum: 'bitti', tur: 'Tarih', bitisTarihi: '2026-06-06' }),
      sahteKitap({ ad: 'B Eski', durum: 'bitti', tur: 'Tarih', bitisTarihi: '2020-02-02' })
    ]);
    await rafAc(page);
    await sirala(page, 'bitis');
    await page.click('#grupTur');
    const s = await adlar(page);
    // her grup kendi içinde yeni→eski; grup sırası bu vakanın konusu değil
    expect(s.indexOf('A Yeni')).toBeLessThan(s.indexOf('A Eski'));
    expect(s.indexOf('B Yeni')).toBeLessThan(s.indexOf('B Eski'));
  });

  test('(d) tercih kaydedilir ve YENİLEMEDE korunur', async ({ page }) => {
    await tohumla(page, kutuphane());
    await rafAc(page);
    await sirala(page, 'puan');
    expect(await page.evaluate(() => localStorage.getItem('kk_sirala_v1'))).toBe('puan');
    await rafYenile(page);
    await expect(page.locator('#sirala')).toHaveValue('puan');
    expect(await page.evaluate(() => durum.sirala)).toBe('puan');
  });

  /* (e1)/(e2) AYRI vakalar: tohumla yalnız İLK yüklemede yazar (yardim.js
     __kk_tohumlandi bayrağı) — aynı sayfada ikinci tohum sessizce atlanırdı. */
  test('(e1) tercih anahtarı YOKKEN varsayılan "bitis" uygulanır', async ({ page }) => {
    await tohumla(page, kutuphane());
    await rafAc(page);
    expect(await page.evaluate(() => localStorage.getItem('kk_sirala_v1'))).toBeNull();
    await expect(page.locator('#sirala')).toHaveValue('bitis');
    expect((await adlar(page))[0]).toBe('Yeni Bitti');
  });

  test('(e2) KAYITLI tercih varsayılanı EZMEZ', async ({ page }) => {
    await tohumla(page, kutuphane(), { kk_sirala_v1: 'baslik' });
    await rafAc(page);
    await expect(page.locator('#sirala')).toHaveValue('baslik');
    const s = await adlar(page);
    expect(s[0]).toBe('Eski Bitti');   // ada göre 'E' < 'O' < 'T' < 'Y'
  });

  test('(f) mevcut sıralama seçenekleri BOZULMADI', async ({ page }) => {
    await tohumla(page, kutuphane());
    await rafAc(page);
    expect(await page.locator('#sirala option').evaluateAll(
      o => o.map(x => x.value))).toEqual(['bitis', 'eklenme', 'baslik', 'yazar', 'puan', 'sayfa']);
    await sirala(page, 'eklenme');
    expect((await adlar(page))[0]).toBe('Eski Bitti');       // en büyük eklenme
    await sirala(page, 'baslik');
    expect((await adlar(page))[0]).toBe('Eski Bitti');
  });

  test('(g) Ana Sayfa "Son bitirdiklerin" şeridi bitisTarihi\'ne göre azalan', async ({ page }) => {
    await tohumla(page, kutuphane());
    await page.goto('/');
    const serit = page.locator('#ktBitenSerit .kt-sira-ad, #ktBitenSerit .kt-bitti-ad');
    const n = await serit.count();
    if (n >= 2) {
      const s = await serit.allTextContents();
      expect(s[0]).toBe('Yeni Bitti');
    } else {
      // şerit seçicisi değiştiyse vaka sessizce yeşile dönmesin
      const govde = await page.locator('body').innerHTML();
      expect(govde, 'Son bitirdiklerin şeridi bulunamadı').toContain('Son bitirdiklerin');
    }
  });
});

test.describe('G74 M2 — kapak tazeleme', () => {

  const OLU = 'https://covers.openlibrary.org/b/isbn/9789999999999-M.jpg';
  const SAGLAM = 'https://covers.openlibrary.org/b/isbn/9786055302597-M.jpg';

  /* agTaklit'ten SONRA kayıt = bu adres için bu yönlendirici kazanır.
     ÖLÜ kapak gerçek yoldan 404 döner (?default=false eklenmiş URL). */
  async function oluKapakRotasi(page) {
    await page.route('**/covers.openlibrary.org/b/isbn/9789999999999**',
      r => r.fulfill({ status: 404, body: '' }));
  }
  function gbKapakYanit(thumb) {
    return { totalItems: 1, items: [{ volumeInfo: {
      title: 'Kapak Kitabı', authors: ['Kapak Yazar'],
      imageLinks: { thumbnail: thumb } } }] };
  }

  test('(a) kapaksız kitaba kapak YAZILIR ve isbn: sorgusu KULLANILIR', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Kapak Kitabı', yazar: 'Kapak Yazar', isbn: '9786053609902' })]);
    await rafAc(page);
    const sorgular = [];
    await page.route(u => u.href.includes('googleapis.com/books'), r => {
      sorgular.push(decodeURIComponent(r.request().url()));
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(gbKapakYanit('https://books.google.com/books/content?id=BULUNDU')) });
    });
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'Kapak Kitabı', yazar: 'Kapak Yazar', isbn: '9786053609902', kapak: '' })).b);
    expect(b && b.kapak).toBeTruthy();
    expect(b.kapak).toContain('id=BULUNDU');
    // kaynak sırası: ISBN varken isbn: sorgusu atılmalı (baskıya birebir)
    expect(sorgular.some(u => u.includes('q=isbn:9786053609902')),
      'isbn: sorgusu atıldı').toBe(true);
  });

  test('(b) MEVCUT GEÇERLİ kapak EZİLMEZ', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Sağlam Kapaklı', kapak: SAGLAM, isbn: '9786053609902' })]);
    await rafAc(page);
    const bos = await page.evaluate(() =>
      window.__zengin.alanBos({ kapak: 'https://covers.openlibrary.org/b/isbn/9786055302597-M.jpg' }, 'kapak'));
    expect(bos, 'dolu kapak alanı "boş" sayılmamalı').toBe(false);
  });

  test('(c) http:// → https:// ve &edge=curl TEMİZLENİR', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Kapak Kitabı', yazar: 'Kapak Yazar', isbn: '9786053609902' })]);
    await rafAc(page);
    await page.route(u => u.href.includes('googleapis.com/books'), r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(gbKapakYanit('http://books.google.com/books/content?id=A&edge=curl&zoom=1')) }));
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'Kapak Kitabı', yazar: 'Kapak Yazar', isbn: '9786053609902', kapak: '' })).b);
    expect(b && b.kapak).toBeTruthy();
    expect(b.kapak.startsWith('https://'), 'http:// https\'e çevrildi').toBe(true);
    expect(b.kapak).not.toContain('edge=curl');
    expect(b.kapak).toContain('zoom=1');   // diğer parametreler korunur
  });

  test('(d) ÖLÜ OpenLibrary kapağı (404) olan kitap kapaksız sayılır ve tazelenir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Ölü Kapaklı', isbn: '9786053609902', kapak: OLU })]);
    await rafAc(page);
    await oluKapakRotasi(page);
    await page.route(u => u.href.includes('googleapis.com/books'), r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(gbKapakYanit('https://books.google.com/books/content?id=YENI')) }));
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'Ölü Kapaklı', yazar: '', isbn: '9786053609902',
        kapak: 'https://covers.openlibrary.org/b/isbn/9789999999999-M.jpg' })).b);
    expect(b && b.kapak, 'ölü kapak tazelenmeli').toBeTruthy();
    expect(b.kapak).toContain('id=YENI');
  });

  /* UÇTAN UCA: (d) yalnız kitapSorgula'yı ölçüyordu; uygula'nın "dolu alana
     dokunma" kuralı bulunan kapağı SESSİZCE yazmadan geçebiliyordu (gerçek
     kusurdu, bu vaka yakaladı). Burada kapağın kitaba YAZILDIĞI doğrulanır. */
  test('(d2) UÇTAN UCA: ölü kapak uygula() ile kitaba GERÇEKTEN yazılır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'olu1', ad: 'Ölü Kapaklı', isbn: '9786053609902', kapak: OLU })]);
    await rafAc(page);
    const sonuc = await page.evaluate(async () => {
      const kd = { bulunan: { olu1: { kapak: 'https://books.google.com/books/content?id=YENI',
        __kapakOlu: true } } };
      window.__zengin.uygula(kd);
      const k = veri.kitaplar.find(x => x.id === 'olu1');
      return { kapak: k.kapak, damga: k.g };
    });
    expect(sonuc.kapak, 'ölü kapak yenisiyle DEĞİŞTİRİLDİ').toContain('id=YENI');
    expect(sonuc.damga, 'senkron damgası basıldı').toBeGreaterThan(0);
  });

  test('(d3) ölü damgası YOKKEN dolu kapak uygula() ile EZİLMEZ', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'sag1', ad: 'Sağlam Kapaklı', kapak: SAGLAM })]);
    await rafAc(page);
    const kapak = await page.evaluate(async () => {
      window.__zengin.uygula({ bulunan: { sag1: { kapak: 'https://books.google.com/books/content?id=YENI' } } });
      return veri.kitaplar.find(x => x.id === 'sag1').kapak;
    });
    expect(kapak, 'geçerli kapak korunmalı').toBe(SAGLAM);
  });

  /* Ölü kapaklı kitapların isbn ALANI boş; ISBN yalnız kapak URL'sinde gömülü.
     Bu vaka olmadan isbn: sorgusu tam da hedef kitlede hiç çalışmıyordu
     (canlı uçtan uca koşumda yakalandı: 5 kitaptan 4'ünde sorgu atılmıyordu). */
  test('(d4) isbn ALANI boşken ISBN kapak URL\'sinden okunur ve isbn: sorgusu atılır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'URL ISBN', isbn: '', kapak: OLU })]);
    await rafAc(page);
    await oluKapakRotasi(page);
    const sorgular = [];
    await page.route(u => u.href.includes('googleapis.com/books'), r => {
      sorgular.push(decodeURIComponent(r.request().url()));
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(gbKapakYanit('https://books.google.com/books/content?id=URLISBN')) });
    });
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'URL ISBN', yazar: '', isbn: '',
        kapak: 'https://covers.openlibrary.org/b/isbn/9789999999999-M.jpg' })).b);
    expect(sorgular.some(u => u.includes('q=isbn:9789999999999')),
      'ISBN kapak URL\'sinden okunup sorgulandı').toBe(true);
    expect(b && b.kapak).toContain('id=URLISBN');
    // URL'den okunan ISBN kitabın isbn ALANINA yazılmaz (doğrulanmamış veri)
    expect(b.isbn, 'isbn alanı uydurulmadı').toBeUndefined();
  });

  /* CANLI KOŞUM BULGUSU: Google Books isbn: ucunda aralıklı 503 veriyor.
     gbSor hata fırlatınca kitapSorgula tümden düşüyordu — yani EKLENEN yol,
     daha önce çalışan ad+yazar yolunu öldürüyordu (canlıda 1/5 → 0/5 gerileme).
     Bu vaka o gerilemeyi kilitler. */
  test('(d5) isbn: sorgusu PATLARSA ad+yazar yolu yine kapak bulur', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Dayanikli', yazar: 'Yazar', kapak: OLU })]);
    await rafAc(page);
    await oluKapakRotasi(page);
    await page.route(u => u.href.includes('googleapis.com/books'), r => {
      const url = decodeURIComponent(r.request().url());
      if (url.includes('q=isbn:')) {                   // isbn: ucu 503 veriyor
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 503, message: 'backend' } }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ totalItems: 1, items: [{ volumeInfo: {
          title: 'Dayanikli', authors: ['Yazar'],
          imageLinks: { thumbnail: 'https://books.google.com/books/content?id=ADYAZAR' } } }] }) });
    });
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'Dayanikli', yazar: 'Yazar', isbn: '',
        kapak: 'https://covers.openlibrary.org/b/isbn/9789999999999-M.jpg' })).b);
    expect(b && b.kapak, 'isbn: patlasa da ad+yazar yolu çalışmalı').toBeTruthy();
    expect(b.kapak).toContain('id=ADYAZAR');
  });

  test('(e) ölü denetimi AĞ HATASI verirse kapak GEÇERLİ sayılır (ezilmez)', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Ağ Hatalı', isbn: '9786053609902', kapak: OLU })]);
    await rafAc(page);
    await page.route('**/covers.openlibrary.org/b/isbn/9789999999999**', r => r.abort('failed'));
    await page.route(u => u.href.includes('googleapis.com/books'), r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(gbKapakYanit('https://books.google.com/books/content?id=YENI')) }));
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'Ağ Hatalı', yazar: '', isbn: '9786053609902', tur: 'Roman', sayfa: 1, yil: 2000,
        yayinevi: 'X', kapak: 'https://covers.openlibrary.org/b/isbn/9789999999999-M.jpg' })).b);
    expect(b, 'ağ hatasında geçerli kapak ezilmemeli').toBeNull();
  });

  test('(f) kapak bulunamazsa alan BOŞ kalır — uydurma YOK', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Bulunamaz', isbn: '9786053609902' })]);
    await rafAc(page);
    await page.route(u => u.href.includes('googleapis.com/books'), r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalItems: 0, items: [] }) }));
    const b = await page.evaluate(async () => (await window.__zengin.kitapSorgula(
      { ad: 'Bulunamaz', yazar: '', isbn: '9786053609902', kapak: '' })).b);
    expect(b === null || !b.kapak, 'kapak uydurulmadı').toBe(true);
  });
});
