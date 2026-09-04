'use strict';
const { test, expect, kameraTaklit, kameraYok, rafAc } = require('./yardim');

const GECERLI_13 = '9780132350884';
const GECERLI_10 = '0132350882';
const BILINMEYEN_13 = '9783161484100'; // sağlaması geçerli, kaynaklarda yok

function gbIsbnYanit(kitap) {
  return { totalItems: 1, items: [{ volumeInfo: {
    title: kitap.ad, authors: kitap.yazar ? [kitap.yazar] : [],
    publisher: kitap.yayinevi || '', publishedDate: kitap.yil ? String(kitap.yil) : '',
    pageCount: kitap.sayfa || 0, categories: kitap.tur ? [kitap.tur] : [], imageLinks: null } }] };
}

test.describe('G3 ISBN / barkod', () => {

  test('ISBN13 ve ISBN10 doğrulama: geçerli kabul, bozuk sağlama red', async ({ page }) => {
    await rafAc(page);
    const sonuc = await page.evaluate(([g13, g10]) => ({
      g13: window.__barkod.isbnGecerli(g13),
      g10: window.__barkod.isbnGecerli(g10),
      tireli: window.__barkod.isbnGecerli('978-0-13-235088-4'),
      bozuk13: window.__barkod.isbnGecerli('9780132350885'),
      bozuk10: window.__barkod.isbnGecerli('0132350881'),
      kisa: window.__barkod.isbnGecerli('12345')
    }), [GECERLI_13, GECERLI_10]);
    expect(sonuc.g13).toBe(true);
    expect(sonuc.g10).toBe(true);
    expect(sonuc.tireli).toBe(true);
    expect(sonuc.bozuk13).toBe(false);
    expect(sonuc.bozuk10).toBe(false);
    expect(sonuc.kisa).toBe(false);
  });

  test('elle ISBN girişi formu doldurur', async ({ page }) => {
    await kameraYok(page); // kamera yolunu devre dışı bırak, elle giriş yeterli
    await rafAc(page);
    page.__agAyar.google = gbIsbnYanit({ ad: 'Clean Code', yazar: 'Robert C. Martin',
      yayinevi: 'Prentice Hall', yil: 2008, sayfa: 464 });
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    await page.fill('#barkodElle', GECERLI_13);
    await page.click('[data-act="barkod-elle"]');
    await expect(page.locator('#f-ad')).toHaveValue('Clean Code');
    await expect(page.locator('#f-yazar')).toHaveValue('Robert C. Martin');
    await expect(page.locator('#f-sayfa')).toHaveValue('464');
    await expect(page.locator('#barkodOrtu')).not.toHaveClass(/acik/); // panel kapandı
  });

  /* v102 KAYNAK BÜTÜNLÜĞÜ: bu vaka eskiden OL'nin Google kaydındaki BOŞ
     yayınevini doldurmasını kilitliyordu. Kaan'ın kuralı bunu kaldırdı —
     künye alanları TEK kaynaktan gelir, kaynak boş bırakıyorsa alan BOŞ kalır.
     Vakanın NİYETİ (kaynak önceliği: Google bulduysa Google kazanır) korundu;
     kilitlenen davranış tersine çevrildi. */
  test('kaynak bütünlüğü: Google kaydının boş yayınevini OL DOLDURMAZ', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    page.__agAyar.google = gbIsbnYanit({ ad: 'Yayınevsiz Kitap', yazar: 'Bir Yazar', yayinevi: '' });
    page.__agAyar.olKitap = { ['ISBN:' + GECERLI_13]: {
      title: 'Yayınevsiz Kitap', authors: [{ name: 'Bir Yazar' }],
      publishers: [{ name: 'Can Yayınları' }], number_of_pages: 320, publish_date: '2001' } };
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    await page.fill('#barkodElle', GECERLI_13);
    await page.click('[data-act="barkod-elle"]');
    await expect(page.locator('#f-ad')).toHaveValue('Yayınevsiz Kitap');
    await expect(page.locator('#f-yayinevi')).toHaveValue('');   // OL'den DOLDURULMAZ
    await expect(page.locator('#f-sayfa')).toHaveValue('');      // OL sayfası da geçmez
  });

  test('bulunamayan ISBN\'de uyarı çıkar, form bozulmaz', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    await page.click('.fab[data-act="yeni"]');
    await page.fill('#f-ad', 'Elle Yazılmış Ad');
    await page.click('[data-act="barkod-ac"]');
    await page.fill('#barkodElle', BILINMEYEN_13);
    await page.click('[data-act="barkod-elle"]');
    await expect(page.locator('#olDurum')).toContainText('Bu ISBN kayıtlarda yok');
    await expect(page.locator('#toast')).toContainText('ISBN bulunamadı');
    await expect(page.locator('#f-ad')).toHaveValue('Elle Yazılmış Ad'); // dokunulmadı
  });

  test('kamera desteği yoksa mesaj çıkar ve elle giriş çalışır', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    page.__agAyar.google = gbIsbnYanit({ ad: 'Desteksiz Cihaz Kitabı', yazar: 'Y' });
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    await expect(page.locator('#barkodNot')).toContainText('desteklemiyor');
    await page.fill('#barkodElle', GECERLI_13);
    await page.click('[data-act="barkod-elle"]');
    await expect(page.locator('#f-ad')).toHaveValue('Desteksiz Cihaz Kitabı');
  });

  test('barkod okununca form dolar ve kamera akışı kapatılır', async ({ page }) => {
    await kameraTaklit(page);
    await rafAc(page);
    page.__agAyar.google = gbIsbnYanit({ ad: 'Kameradan Gelen', yazar: 'Tarayıcı Yazar' });
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    await expect.poll(() => page.evaluate(() => window.__akisIstendi)).toBe(true);
    await page.evaluate(kod => { window.__sahteKod = kod; }, GECERLI_13);
    await expect(page.locator('#f-ad')).toHaveValue('Kameradan Gelen', { timeout: 10000 });
    await expect(page.locator('#barkodOrtu')).not.toHaveClass(/acik/);
    expect(await page.evaluate(() => window.__akisDurdu)).toBe(true); // akış durduruldu
  });
});
