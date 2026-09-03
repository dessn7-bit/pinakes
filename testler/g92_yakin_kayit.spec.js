'use strict';
/* G92 — SERİ TARAMADA YAKIN KAYIT UYARISI (v96).
   Süzme DEĞİL uyarı: hiçbir aday atılmaz, hiçbir kayıt engellenmez. Kitap yine
   eklenir; kullanıcı yalnız "benzer kayıt zaten var" diye uyarılır (geri alma
   oturum listesindeki ✕ ile zaten vardı).
   Kök: kütüphanede 242 kaydın 241'inde ISBN boş → zatenVar'ın ISBN kolu mevcut
   kayıtlara karşı hiç çalışmıyor, iş birebir başlık eşitliğine kalıyordu; form
   açılmadığı için benzer kayıt hiç görünmüyordu. Kritik vaka: "An Actor
   Prepares" elle eklenmiş (Türkçe adı alanı = "Bir Aktör Hazırlanıyor"),
   fiziksel Türkçe baskı okutulunca ortak harfi olmayan başlık geliyor — yalnız
   adTr alanından (v73) yakalanır. */
const { test, expect, tohumla, sahteKitap,
  kameraTaklit, rafAc, ayarlarAc } = require('./yardim');

/* Hepsi geçerli ISBN-13 (kontrol basamağı hesaplı). Ağ taklidi ISBN'e göre
   ayrım yapmaz: her okutmadan önce page.__agAyar.google yeniden kurulur. */
const ISBN_TR = '9789750800009';
const ISBN_SUC = '9789750800016';
const ISBN_DUNE2 = '9789750800023';
const ISBN_HP = '9789750800030';

function gbIsbnYanit(kitap) {
  return { totalItems: 1, items: [{ volumeInfo: {
    title: kitap.ad, authors: kitap.yazar ? [kitap.yazar] : [],
    publisher: kitap.yayinevi || '', publishedDate: kitap.yil ? String(kitap.yil) : '',
    pageCount: kitap.sayfa || 0, imageLinks: null } }] };
}

async function seriAc(page) {
  await ayarlarAc(page);
  await page.click('#ortuAyar [data-act="seri-ac"]');
  await expect(page.locator('#seriOrtu')).toHaveClass(/acik/);
  await expect.poll(() => page.evaluate(() => window.__akisIstendi)).toBe(true);
}

/* Kaan'ın senaryosu: ISBN ELLE girilir (kamera değil). */
async function elleOkut(page, isbn, kitap) {
  page.__agAyar.google = gbIsbnYanit(kitap);
  await page.fill('#seriElle', isbn);
  await page.click('[data-act="seri-elle"]');
}

const STANISLAVSKI = () => sahteKitap({
  ad: 'An Actor Prepares', yazar: 'Konstantin Stanislavski',
  adTr: 'Bir Aktör Hazırlanıyor', isbn: '' });   // ISBN BOŞ: rafın 241/242'si böyle

test.describe('G92 seri taramada yakın kayıt uyarısı (v96)', () => {

  test('a+b) Türkçe baskı EKLENİR ama adTr üzerinden "benzer kayıt" uyarısı çıkar; aynı ISBN ikinci kez "Zaten kayıtlı"', async ({ page }) => {
    await kameraTaklit(page);
    await tohumla(page, [STANISLAVSKI()]);
    await rafAc(page);
    // tohum adTr'yi normalize'dan geçirip korudu mu (v73 alanı) — vakanın ön şartı
    expect(await page.evaluate(() => veri.kitaplar[0].adTr)).toBe('Bir Aktör Hazırlanıyor');
    await seriAc(page);

    // (a) fiziksel Türkçe baskı: başlığın İngilizce adla ortak harfi yok
    await elleOkut(page, ISBN_TR, { ad: 'Bir Aktör Hazırlanıyor', yazar: 'Konstantin Stanislavski', sayfa: 320 });
    const not = page.locator('#seriNot');
    await expect(not).toContainText('Eklendi: Bir Aktör Hazırlanıyor', { timeout: 10000 });
    await expect(not).toContainText('benzer kayıt zaten var');
    await expect(not).toContainText('"An Actor Prepares"');
    await expect(not).toContainText('Türkçe adı: Bir Aktör Hazırlanıyor');   // NEDEN benzer olduğu görünür
    await expect(page.locator('#toast')).toContainText('Benzer kayıt var: An Actor Prepares');
    // ENGEL YOK: kayıt gerçekten eklendi, eskisi de duruyor
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(2);
    const yeni = await page.evaluate(() => veri.kitaplar.find(k => k.ad === 'Bir Aktör Hazırlanıyor'));
    expect(yeni.isbn).toBe(ISBN_TR);
    expect(yeni.sahiplik).toBe('sahip');
    await expect(page.locator('#ortuForm')).not.toHaveClass(/acik/);   // form yine açılmadı
    await expect(page.locator('#seriListe')).toContainText('1 kitap eklendi');

    // (b) aynı ISBN tekrar: zatenVar'ın ISBN kolu ŞİMDİ çalışır — eklenmez
    await elleOkut(page, ISBN_TR, { ad: 'Bir Aktör Hazırlanıyor', yazar: 'Konstantin Stanislavski', sayfa: 320 });
    await expect(not).toContainText('Zaten kayıtlı: Bir Aktör Hazırlanıyor', { timeout: 10000 });
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(2);
  });

  test('c) alakasız kitap ve kısa ortak önek: hiçbir uyarı yok (yanlış pozitif yok)', async ({ page }) => {
    await kameraTaklit(page);
    await tohumla(page, [STANISLAVSKI(), sahteKitap({ ad: 'Dune', yazar: 'Frank Herbert', isbn: '' })]);
    await rafAc(page);
    await seriAc(page);
    const not = page.locator('#seriNot');

    // alakasız yazar + başlık
    await elleOkut(page, ISBN_SUC, { ad: 'Suç ve Ceza', yazar: 'Fyodor Dostoyevski', sayfa: 700 });
    await expect(not).toHaveText('Eklendi: Suç ve Ceza — sıradakini okut.', { timeout: 10000 });
    await expect(page.locator('#toast')).not.toContainText('Benzer');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(3);

    // AYNI yazar, 4 harflik ortak önek ("dune" < 8): seri devamı kopya DEĞİL
    await elleOkut(page, ISBN_DUNE2, { ad: 'Dune Messiah', yazar: 'Frank Herbert', sayfa: 300 });
    await expect(not).toHaveText('Eklendi: Dune Messiah — sıradakini okut.', { timeout: 10000 });
    await expect(page.locator('#toast')).not.toContainText('Benzer');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(4);
  });

  test('önek kolu: aynı yazar + ≥8 harflik başlangıç eşleşmesi uyarır, yine ekler', async ({ page }) => {
    await kameraTaklit(page);
    await tohumla(page, [sahteKitap({ ad: 'Harry Potter ve Felsefe Taşı', yazar: 'J.K. Rowling', isbn: '' })]);
    await rafAc(page);
    await seriAc(page);
    await elleOkut(page, ISBN_HP, { ad: 'Harry Potter ve Felsefe Taşı (Ciltli)', yazar: 'J.K. Rowling', sayfa: 340 });
    const not = page.locator('#seriNot');
    await expect(not).toContainText('Eklendi: Harry Potter ve Felsefe Taşı (Ciltli)', { timeout: 10000 });
    await expect(not).toContainText('benzer kayıt zaten var: "Harry Potter ve Felsefe Taşı"');
    await expect(not).not.toContainText('Türkçe adı:');   // adTr yok → parantez yok
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(2);
  });

  test('yakinKayit / zatenVar sözleşmesi (window.__katalog)', async ({ page }) => {
    await tohumla(page, [
      STANISLAVSKI(),
      sahteKitap({ ad: 'Harry Potter ve Felsefe Taşı', yazar: 'J.K. Rowling', isbn: '' }),
      sahteKitap({ ad: 'Dune', yazar: 'Frank Herbert', isbn: '' }),
      sahteKitap({ ad: 'İnsan Ne İle Yaşar', yazar: 'Tolstoy', isbn: '' })]);
    await rafAc(page);
    const r = await page.evaluate(() => {
      const K = window.__katalog;
      const ad = x => x ? x.ad : null;
      return {
        tamEsitlik: ad(K.yakinKayit('An Actor Prepares', 'Konstantin Stanislavski')),
        adTrTam: ad(K.yakinKayit('Bir Aktör Hazırlanıyor', 'Konstantin Stanislavski')),
        adTrKatla: ad(K.yakinKayit('BIR AKTOR HAZIRLANIYOR', 'Konstantin Stanislavski')),
        baskaYazar: ad(K.yakinKayit('Bir Aktör Hazırlanıyor', 'Başka Yazar')),
        onek: ad(K.yakinKayit('Harry Potter ve Felsefe Taşı (Ciltli)', 'J.K. Rowling')),
        onekTers: ad(K.yakinKayit('Harry Potter', 'J.K. Rowling')),     // 12 harf ≥ 8, kısa olan yeni ad
        kisaOnek: ad(K.yakinKayit('Dune Messiah', 'Frank Herbert')),
        yazarsiz: K.yakinKayit('Bir Aktör Hazırlanıyor', ''),
        adsiz: K.yakinKayit('', 'Konstantin Stanislavski'),
        // SORUN 1 doğrulaması: zatenVar çekirdeğin katla()'sıyla karşılaştırır —
        // ASCII "Insan … Ile Yasar" yazımı "İnsan Ne İle Yaşar"ı bulur
        katlaKopya: ad(K.zatenVar('', 'Insan Ne Ile Yasar', 'Tolstoy')),
        katlaYazar: ad(K.zatenVar('', 'İnsan Ne İle Yaşar', 'TOLSTOY'))
      };
    });
    expect(r.tamEsitlik).toBeNull();                       // birebir ad = zatenVar'ın işi
    expect(r.adTrTam).toBe('An Actor Prepares');
    expect(r.adTrKatla).toBe('An Actor Prepares');
    expect(r.baskaYazar).toBeNull();
    expect(r.onek).toBe('Harry Potter ve Felsefe Taşı');
    expect(r.onekTers).toBe('Harry Potter ve Felsefe Taşı');
    expect(r.kisaOnek).toBeNull();
    expect(r.yazarsiz).toBeNull();
    expect(r.adsiz).toBeNull();
    expect(r.katlaKopya).toBe('İnsan Ne İle Yaşar');
    expect(r.katlaYazar).toBe('İnsan Ne İle Yaşar');
  });

  test('kaynak kilidi: uyarı EKLEME sonrası, engelleme yok; sw v96', async () => {
    const fs = require('fs'), path = require('path');
    const kaynak = fs.readFileSync(path.join(__dirname, '..', 'katalog.js'), 'utf8');
    const i = kaynak.indexOf('veri.kitaplar.push(kayit)');
    const j = kaynak.indexOf("bildir('Benzer kayıt var: '");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);   // uyarı push'tan SONRA — return ile ekleme kesilmiyor
    // uyarı dalında return YOK (ekleme zaten olmuş; ama gelecekte "engelle" kaçağına kilit)
    const dal = kaynak.slice(kaynak.indexOf('if(yakin){'), j);
    expect(dal).not.toMatch(/\breturn\b/);
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    expect(sw).toContain("const CACHE = ONEK + '-v96'");
  });
});
