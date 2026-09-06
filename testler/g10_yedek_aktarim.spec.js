'use strict';
const fs = require('fs');
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');

const GR_CSV = [
  'Title,Author,ISBN13,My Rating,Number of Pages,Year Published,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review,Publisher',
  '"Sofie\'nin Dünyası","Jostein Gaarder","=""9780132350884""",4,560,1991,2026/07/15,2026/06/01,"favorites, read",read,"Harika kitap","Pan Yayıncılık"',
  '"Körlük","José Saramago",,0,352,1995,,2026/06/10,"currently-reading",currently-reading,,',
  '"Dune","Frank Herbert",,0,712,1965,,2026/06/20,"to-read, bilimkurgu",to-read,,'
].join('\n');
const csvDosya = (metin, ad) =>
  ({ name: ad || 'goodreads.csv', mimeType: 'text/csv', buffer: Buffer.from(metin, 'utf8') });

async function yedekSekmesi(page) {
  await ayarlarAc(page);
}

test.describe('G10 yedek ve aktarım', () => {

  test('JSON dışa aktarım indirme tetikler ve içerik geçerli JSON', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Yedeklenen Kitap', yazar: 'Yedek Yazar' })]);
    await rafAc(page);
    await yedekSekmesi(page);
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      // Kota uyarı şeridinde de aynı eylem var (M5); Yedek panelindekini hedefle.
      page.click('#ortuAyar [data-act="disa-aktar"]')
    ]);
    expect(indirme.suggestedFilename()).toMatch(/^pinakes-yedek-.*\.json$/);
    const icerik = JSON.parse(fs.readFileSync(await indirme.path(), 'utf8'));
    expect(icerik.surum).toBe(2);
    expect(Array.isArray(icerik.kitaplar)).toBe(true);
    expect(icerik.kitaplar[0].ad).toBe('Yedeklenen Kitap');
  });

  test('JSON geri yükleme mevcutla birleştirir, mükerrer eklemez', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Mevcut Kitap', yazar: 'Aynı Yazar' })]);
    await rafAc(page);
    await yedekSekmesi(page);
    const yedek = JSON.stringify({ surum: 2, kitaplar: [
      { ad: 'Mevcut Kitap', yazar: 'Aynı Yazar' },      // mükerrer → atlanmalı
      { ad: 'Yeni Gelen Kitap', yazar: 'Başka Yazar' }  // eklenmeli
    ], hedef: {} });
    /* v109: tek giriş — dosya {kitaplar} taşıyor, iki varış var (birleştir /
       tam değiştir); BELİRSİZLİK sorulur, burada birleştir seçilir. */
    await dosyadanYukle(page, jsonDosya(yedek, 'yedek.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('1 kitap geri yüklendi');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(2);
  });

  test('Goodreads CSV: raf→durum, puan 5→10, tarih dönüşümü, yorum→not', async ({ page }) => {
    await rafAc(page);
    await yedekSekmesi(page);
    await dosyadanYukle(page, csvDosya(GR_CSV));
    await expect(page.locator('#toast')).toContainText('3 kitap aktarıldı');
    const ks = await page.evaluate(() => veri.kitaplar);
    const sofie = ks.find(k => k.ad === "Sofie'nin Dünyası");
    const korluk = ks.find(k => k.ad === 'Körlük');
    const dune = ks.find(k => k.ad === 'Dune');
    // raf → durum eşlemesi
    expect(sofie.durum).toBe('bitti');
    expect(korluk.durum).toBe('okunuyor');
    expect(dune.durum).toBe('okunacak');
    // puan 5'lik → 10'luk (4 → 8)
    expect(sofie.puan).toBe(8);
    // tarih dönüşümü YYYY/MM/DD → YYYY-MM-DD
    expect(sofie.bitisTarihi).toBe('2026-07-15');
    // yorum → not
    expect(sofie.notlar.length).toBe(1);
    expect(sofie.notlar[0].metin).toBe('Harika kitap');
    // bitti + sayfa → guncelSayfa dolu
    expect(sofie.guncelSayfa).toBe(560);
    // raf adları etiket OLMAZ, diğer raflar etiket olur
    expect(sofie.etiketler).toEqual(['favorites']);
    expect(dune.etiketler).toEqual(['bilimkurgu']);
    // ISBN'li kitaba OpenLibrary kapağı yazılır
    expect(sofie.kapak).toContain('covers.openlibrary.org');
  });

  test('aynı CSV ikinci kez yüklenirse yeni kayıt oluşmaz', async ({ page }) => {
    await rafAc(page);
    await yedekSekmesi(page);
    await dosyadanYukle(page, csvDosya(GR_CSV));
    await expect(page.locator('#toast')).toContainText('3 kitap aktarıldı');
    await dosyadanYukle(page, csvDosya(GR_CSV));
    await expect(page.locator('#toast')).toContainText('Hepsi zaten kayıtlı');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(3);
  });

  test('bozuk dosya reddedilir, mevcut veri bozulmaz', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Korunan Kitap' })]);
    await rafAc(page);
    await yedekSekmesi(page);
    /* v109: red artık KAPIDA. Bozuk dosya hiçbir boruya ulaşmıyor — iki ayrı
       boru-içi mesaj yerine tek kapı mesajı + kartta beklenen biçimler listesi
       (rehberlik kaybolmadı, tek yerde toplandı). */
    await page.click('#ortuAyar [data-act="dy-sec"]');
    await page.setInputFiles('#dyDosya', jsonDosya('{{bozuk', 'bozuk.json'));
    await expect(page.locator('#toast')).toContainText('geçerli bir JSON değil');
    await expect(page.locator('#dyKarar')).toContainText('tanıyamadım');
    await expect(page.locator('#dyKarar')).toContainText('Goodreads');
    // bozuk CSV (Goodreads başlıkları yok)
    await page.click('#dyKarar [data-act="dy-vazgec"]');
    await page.click('#ortuAyar [data-act="dy-sec"]');
    await page.setInputFiles('#dyDosya', csvDosya('a;b;c', 'bozuk.csv'));
    await expect(page.locator('#toast')).toContainText('tanıdığım bir liste yok');
    await expect(page.locator('#dyKarar [data-act="dy-calistir"]')).toHaveCount(0);
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(1);
    expect(await page.evaluate(() => veri.kitaplar[0].ad)).toBe('Korunan Kitap');
  });
});
