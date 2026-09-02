'use strict';
const { test, expect, rafAc } = require('./yardim');

function gbYanit(kitaplar) {
  return {
    totalItems: kitaplar.length,
    items: kitaplar.map(k => ({ volumeInfo: {
      title: k.ad, authors: k.yazar ? [k.yazar] : [],
      publisher: k.yayinevi || '', publishedDate: k.yil ? String(k.yil) : '',
      pageCount: k.sayfa || 0, language: k.dil || 'tr',
      imageLinks: null
    } }))
  };
}

async function formAc(page) {
  await rafAc(page);
  await page.click('.fab[data-act="yeni"]');
}

test.describe('G2 arama ve kaynaklar', () => {

  test('3 harften kısa sorgu istek atmaz', async ({ page }) => {
    await formAc(page);
    await page.fill('#f-ad', 'ab');
    await page.waitForTimeout(900); // debounce 450ms'in yeterince üstü
    expect(page.__agSayac.google).toBe(0);
    expect(page.__agSayac.worker).toBe(0);
    expect(page.__agSayac.olArama).toBe(0);
  });

  test('Google Books sonucu formu doldurur', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = gbYanit([{ ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins',
      yayinevi: 'Kuzey Yayınları', yil: 2006, sayfa: 420 }]);
    await page.fill('#f-ad', 'tanrı yanılgısı');
    await page.click('#olSonuc .ol-item >> nth=0');
    await expect(page.locator('#f-ad')).toHaveValue('Tanrı Yanılgısı');
    await expect(page.locator('#f-yazar')).toHaveValue('Richard Dawkins');
    await expect(page.locator('#f-yayinevi')).toHaveValue('Kuzey Yayınları');
    await expect(page.locator('#f-yil')).toHaveValue('2006');
    await expect(page.locator('#f-sayfa')).toHaveValue('420');
    await expect(page.locator('#olDurum')).toContainText('Form dolduruldu');
  });

  test('worker (Goodreads+1000Kitap) sonuçları listeye eklenir', async ({ page }) => {
    await formAc(page);
    page.__agAyar.worker = { sonuclar: [
      { ad: 'Simyacı', yazar: 'Paulo Coelho', yayinevi: '', yil: null, sayfa: null, kapak: null, kaynak: 'Goodreads' },
      { ad: 'Simyacı (Cep)', yazar: 'Paulo Coelho', yayinevi: '', yil: null, sayfa: null, kapak: null, kaynak: '1000Kitap ★8.1' }
    ] };
    await page.fill('#f-ad', 'simyacı');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(2);
    /* v95 trPuan: 1000Kitap kaynağı +2 aldığı için Goodreads'in ÜSTÜNE çıkar —
       eski vaka kaynak sırasını (gb→wk geliş sırası) donduruyordu, o sıra
       davranış değil rastlantıydı. İkisi de listede: süzme yok. */
    await expect(page.locator('#olSonuc .ol-item >> nth=0')).toContainText('1000Kitap');
    await expect(page.locator('#olSonuc .ol-item >> nth=1')).toContainText('Goodreads');
  });

  test('Türkçe aday üste sıralanır; yabancı adaylar listeden ATILMAZ (v95 trPuan)', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = gbYanit([
      { ad: 'An Actor Prepares', yazar: 'Constantin Stanislavski', dil: 'en' },
      { ad: 'Building a Character', yazar: 'Constantin Stanislavski', dil: 'en' }
    ]);
    page.__agAyar.worker = { sonuclar: [
      { ad: 'Bir Aktör Hazırlanıyor', yazar: 'Konstantin Stanislavski', kaynak: '1000Kitap ★8.9' }
    ] };
    await page.fill('#f-ad', 'stanislavski');
    // sıralama süzme değil: 3 aday, 3 satır
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(3);
    await expect(page.locator('#olSonuc .ol-item >> nth=0')).toContainText('Bir Aktör Hazırlanıyor');
    // İngilizce baskılar hâlâ listede — rafta yabancı kitap da var
    await expect(page.locator('#olSonuc')).toContainText('An Actor Prepares');
    await expect(page.locator('#olSonuc')).toContainText('Building a Character');
  });

  test('slice sıralamadan SONRA: 9. gelen Türkçe aday listeye girer (v95)', async ({ page }) => {
    await formAc(page);
    // 8 İngilizce Google adayı + worker'dan 1 Türkçe: eski kod (slice önce)
    // Türkçe adayı listeye hiç sokmuyordu.
    page.__agAyar.google = gbYanit(Array.from({ length: 8 }, (_, i) =>
      ({ ad: 'English Book ' + (i + 1), yazar: 'Writer ' + (i + 1), dil: 'en' })));
    page.__agAyar.worker = { sonuclar: [
      { ad: 'Türkçe Dokuzuncu', yazar: 'Yerli Yazar', kaynak: '1000Kitap' }
    ] };
    await page.fill('#f-ad', 'dokuzuncu');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(8); // tavan 8 korunur
    await expect(page.locator('#olSonuc .ol-item >> nth=0')).toContainText('Türkçe Dokuzuncu');
  });

  test('aynı kitap iki kaynaktan gelirse tek satır görünür', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = gbYanit([{ ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' }]);
    page.__agAyar.worker = { sonuclar: [
      { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins', kaynak: 'Goodreads' },
      { ad: 'Bambaşka Kitap', yazar: 'Başka Yazar', kaynak: 'Goodreads' }
    ] };
    await page.fill('#f-ad', 'tanrı yanılgısı');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(2); // 1 tekil + 1 farklı
    // .ol-sonuc stil sınıfını gelen-alıntı paneli de kullanıyor; arama sonucunu id ile hedefle.
    await expect(page.locator('#olSonuc')).toContainText('Bambaşka Kitap');
  });

  test('Google boş dönerse worker sonuçları yine görünür', async ({ page }) => {
    await formAc(page);
    // google varsayılan boş; worker dolu
    page.__agAyar.worker = { sonuclar: [
      { ad: 'Kürk Mantolu Madonna', yazar: 'Sabahattin Ali', kaynak: 'Goodreads' }
    ] };
    await page.fill('#f-ad', 'kürk mantolu');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(1);
    await expect(page.locator('#olSonuc .ol-item')).toContainText('Kürk Mantolu Madonna');
    expect(page.__agSayac.olArama).toBe(0); // aday varken OL çağrılmaz
  });

  test('ikisi de boş dönerse OpenLibrary son çare devreye girer', async ({ page }) => {
    await formAc(page);
    page.__agAyar.olArama = { docs: [{ title: 'Nadir Kitap', author_name: ['Bilinmez Yazar'],
      number_of_pages_median: 180, first_publish_year: 1970, publisher: ['Eski Basım'], cover_i: null }] };
    await page.fill('#f-ad', 'nadir kitap');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(1);
    await expect(page.locator('#olSonuc .ol-item')).toContainText('OpenLibrary');
    expect(page.__agSayac.olArama).toBeGreaterThan(0);
  });

  test('hepsi hata verirse "İnternete ulaşılamadı" mesajı çıkar', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = 'hata';
    page.__agAyar.worker = 'hata';
    page.__agAyar.olArama = 'hata';
    await page.fill('#f-ad', 'ulaşılamayan kitap');
    await expect(page.locator('#olDurum')).toContainText('İnternete ulaşılamadı');
  });

  test('yazar modu inauthor:, yayınevi modu inpublisher: üretir; yayınevi modunda worker çağrılmaz', async ({ page }) => {
    await formAc(page);
    // yazar modu
    await page.click('[data-act="ara-tip"][data-v="yazar"]');
    await page.fill('#f-ad', 'dawkins');
    await expect.poll(() => page.__agSayac.google).toBeGreaterThan(0);
    expect(page.__agSayac.sonGoogleUrl).toContain('inauthor%3Adawkins');
    const yazarModuWorker = page.__agSayac.worker;
    expect(yazarModuWorker).toBeGreaterThan(0); // yazar modunda worker da aranır

    // yayınevi modu
    await page.click('[data-act="ara-tip"][data-v="yayinevi"]');
    await page.fill('#f-ad', 'can yayınları');
    await expect.poll(() => page.__agSayac.sonGoogleUrl).toContain('inpublisher%3A');
    expect(page.__agSayac.worker).toBe(yazarModuWorker); // yayınevi modunda worker ÇAĞRILMAZ
  });
});
