'use strict';
/* G107 — arama sonucunda BASKI KİMLİĞİ + v102 kapılarının ön izlemesi (v108).

   SORUN: canlı arama listesi ad + yazar gösteriyordu; dil bir kod olarak
   (TR/EN) satırın ucunda, yayınevi araya serpiştirilmiş, ISBN hiç yoktu.
   Aynı eserin Türkçe ve yabancı baskıları birbirinden ayırt edilemiyordu —
   hangisini seçtiğin ancak form dolduktan SONRA anlaşılıyordu. v102 yanlış
   ISBN'in yazılmasını engelledi ama yanlış adayın SEÇİLMESİNİ engellemedi.

   SÖZLEŞMELER:
   - .bs-kimlik satırı baskıyı ayırt eden ÜÇ olguyu yan yana taşır:
     dil · ISBN ülke öneki · yayınevi.
   - Bilinmeyen alan SESSİZ kalmaz. Üçü birden yoksa (worker ucu dil/ISBN/
     yayınevi taşımıyor) satır bunu tek cümleyle söyler.
   - Dil alanı boş ama ISBN grubu biliniyorsa dil ISBN'den TÜRETİLİR ve
     "(ISBN'den)" diye İŞARETLENİR — çıkarım olgu gibi sunulmaz.
   - v102 kapıları (yayınevi çelişkisi · ISBN öneki çelişkisi · dil uyuşmazlığı)
     SEÇİMDEN ÖNCE .bs-uyari satırında görünür. Motor zengin.js'te, index.html'de
     kopyası YOK.
   - Uyarı SÜZME DEĞİL: çelişkili aday listede kalır ve seçilebilir (v95 kuralı).
   - Sıralama v95 trPuan'ın aynısı; tek değişiklik Türkiye ISBN grubunun
     v102 tablosundan okunması (ağırlık +1 olarak KORUNDU).

   (Mutasyon 1: canliAra'dan .bs-kimlik satırı çıkarılır → 5 vaka kırmızı.
    Mutasyon 2: adayUyarilari boş dizi döndürülür → 4 vaka kırmızı.
    Mutasyon 3: isbnGrup.onek daima '' → ISBN öneki ve türetilen dil kırmızı.) */

const { test, expect, rafAc, ayrintilarAc } = require('./yardim');

/* geçerli ISBN-13'ler (sağlamaları elle doğrulandı — isbnGecersiz sağlamayı
   ÖNCE sınar, bozuk numara başka gerekçeyle reddedilir ve vaka anlamını
   kaybederdi) */
const ISBN_TR = '9786053602934';   // 978-605 → tr
const ISBN_DE = '9783110457384';   // 978-3   → de

function gItem(k) {
  return { volumeInfo: {
    title: k.ad, authors: k.yazar ? [k.yazar] : [],
    publisher: k.yayinevi || '', publishedDate: k.yil ? String(k.yil) : '',
    pageCount: k.sayfa || 0,
    language: k.dil === undefined ? 'tr' : k.dil,
    industryIdentifiers: k.isbn ? [{ type: 'ISBN_13', identifier: k.isbn }] : [],
    imageLinks: null } };
}
async function formAc(page) {
  await rafAc(page);
  await page.click('.fab[data-act="yeni"]');
}
const satir = (page, i) => page.locator('#olSonuc .ol-item >> nth=' + (i || 0));

test.describe('G107 baskı kimliği', () => {

  test('dil, ISBN ülke öneki ve yayınevi TEK satırda görünür', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [gItem({ ad: 'Cardenio', yazar: 'Shakespeare',
      yayinevi: 'Türkiye İş Bankası Kültür Yayınları', yil: 2013, sayfa: 116, isbn: ISBN_TR })] };
    await page.fill('#f-ad', 'cardenio');
    const k = satir(page).locator('.bs-kimlik');
    await expect(k).toContainText('Türkçe');
    await expect(k).toContainText('ISBN 978-605');
    await expect(k).toContainText('Türkiye İş Bankası Kültür Yayınları');
    /* eserin künyesi ayrı katmanda kalır — yayınevi ve dil oradan TAŞINDI */
    const alt = satir(page).locator('.oi-alt');
    await expect(alt).toContainText('Shakespeare');
    await expect(alt).toContainText('116 sf');
    await expect(alt).not.toContainText('İş Bankası');
  });

  test('yabancı baskı kendini SEÇİLMEDEN ÖNCE söyler', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [gItem({ ad: 'Kyklops', yazar: 'Euripides',
      yayinevi: 'Walter de Gruyter GmbH & Co KG', dil: 'de', sayfa: 350, isbn: ISBN_DE })] };
    await page.fill('#f-ad', 'kyklops');
    const k = satir(page).locator('.bs-kimlik');
    await expect(k).toContainText('Almanca');
    await expect(k).toContainText('ISBN 978-3');
    await expect(k).toContainText('Walter de Gruyter');
  });

  test('dil/ISBN/yayınevi taşımayan kaynakta satır bunu SÖYLER (sessiz boşluk yok)', async ({ page }) => {
    await formAc(page);
    /* worker /ara sözleşmesi: ad, yazar, sayfa, kapak, kaynak — dil, ISBN ve
       yayınevi YOK. Uydurmak yerine eksikliği söylüyoruz. */
    page.__agAyar.worker = { sonuclar: [
      { ad: 'Simyacı', yazar: 'Paulo Coelho', yayinevi: '', yil: null, sayfa: null,
        kapak: null, kaynak: 'Goodreads' }] };
    await page.fill('#f-ad', 'simyacı');
    await expect(satir(page).locator('.bs-kimlik')).toContainText('Baskı bilgisi yok');
  });

  test('dil alanı boşsa ISBN grubundan TÜRETİLİR ve türetildiği işaretlenir', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [gItem({ ad: 'Dilsiz Kayıt', yazar: 'Yazar',
      yayinevi: 'Walter de Gruyter', dil: '', isbn: ISBN_DE })] };
    await page.fill('#f-ad', 'dilsiz kayıt');
    const k = satir(page).locator('.bs-kimlik');
    await expect(k).toContainText('Almanca');
    await expect(k, 'çıkarım olgu gibi sunulmaz').toContainText('(ISBN');
  });

  test('KAPI 1 — ISBN ülke öneki yayıneviyle çelişiyorsa uyarı SEÇİMDEN ÖNCE çıkar', async ({ page }) => {
    await formAc(page);
    // Türk yayınevi imzası + Alman ISBN grubu: v102 md.5'in tam vakası (Kyklops)
    page.__agAyar.google = { items: [gItem({ ad: 'Karışık Baskı', yazar: 'Euripides',
      yayinevi: 'Türkiye İş Bankası Kültür Yayınları', dil: 'tr', isbn: ISBN_DE })] };
    await page.fill('#f-ad', 'karışık baskı');
    await expect(satir(page).locator('.bs-uyari')).toContainText('ISBN ülke öneki yayıneviyle çelişiyor');
  });

  test('KAPI 2 — ISBN öneki adayın kendi diliyle çelişiyorsa uyarı çıkar', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [gItem({ ad: 'Çelişkili Dil', yazar: 'Yazar',
      yayinevi: 'Walter de Gruyter', dil: 'tr', isbn: ISBN_DE })] };
    await page.fill('#f-ad', 'çelişkili dil');
    await expect(satir(page).locator('.bs-uyari')).toContainText('ISBN öneki adayın diliyle çelişiyor');
  });

  test('KAPI 3 — formda duran yayıneviyle çelişen aday uyarılır (kayıt ↔ aday)', async ({ page }) => {
    await formAc(page);
    await ayrintilarAc(page);
    await page.fill('#f-yayinevi', 'Yapı Kredi Yayınları');
    page.__agAyar.google = { items: [gItem({ ad: 'Kürk Mantolu Madonna', yazar: 'Sabahattin Ali',
      yayinevi: 'Elips Kitap', dil: 'tr' })] };
    await page.fill('#f-ad', 'kürk mantolu');
    const u = satir(page).locator('.bs-uyari');
    await expect(u).toContainText('yayınevi çelişiyor');
    await expect(u).toContainText('Elips Kitap');
  });

  test('boş formda kayıt↔aday kapısı SESSİZ kalır (yalnız ikisi de dolu alanlar kıyaslanır)', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [gItem({ ad: 'Temiz Kayıt', yazar: 'Yazar',
      yayinevi: 'Yapı Kredi Yayınları', dil: 'tr', isbn: ISBN_TR })] };
    await page.fill('#f-ad', 'temiz kayıt');
    await expect(satir(page).locator('.bs-kimlik')).toContainText('Türkçe');
    await expect(satir(page).locator('.bs-uyari')).toHaveCount(0);
  });

  test('uyarı SÜZME değil: çelişkili aday listede kalır ve seçilebilir', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [gItem({ ad: 'Karışık Baskı', yazar: 'Euripides',
      yayinevi: 'Türkiye İş Bankası Kültür Yayınları', dil: 'tr', isbn: ISBN_DE, sayfa: 350 })] };
    await page.fill('#f-ad', 'karışık baskı');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(1);
    await satir(page).click();
    await expect(page.locator('#f-ad')).toHaveValue('Karışık Baskı');
    await expect(page.locator('#olDurum')).toContainText('Form dolduruldu');
  });

  test('sıralama v95 davranışında: Türkçe aday üstte, yabancı aday listede kalır', async ({ page }) => {
    await formAc(page);
    page.__agAyar.google = { items: [
      gItem({ ad: 'An Actor Prepares', yazar: 'Constantin Stanislavski', dil: 'en' }),
      gItem({ ad: 'Bir Aktor Hazirlaniyor', yazar: 'Konstantin Stanislavski', dil: 'tr' })] };
    await page.fill('#f-ad', 'stanislavski');
    await expect(page.locator('#olSonuc .ol-item')).toHaveCount(2);
    await expect(satir(page, 0)).toContainText('Bir Aktor Hazirlaniyor');
    await expect(satir(page, 1)).toContainText('An Actor Prepares');
  });

  test('trPuan ağırlıkları DEĞİŞMEDİ; Türkiye ISBN katkısı tireli yazımda da işliyor', async ({ page }) => {
    await formAc(page);
    const p = await page.evaluate(([tr, de]) => ({
      /* v95 ağırlık tablosu: dil tr +3 / yabancı -3 · 1000Kitap +2 ·
         TR harf +2 · yayınevi/yazar TR harf +1 · Türkiye ISBN +1 */
      trDil: trPuan({ dil: 'TR' }),
      yabanciDil: trPuan({ dil: 'EN' }),
      binKitap: trPuan({ kaynak: '1000Kitap' }),
      trHarf: trPuan({ ad: 'Çığlık' }),
      trIsbn: trPuan({ isbn: tr }),
      trIsbnTireli: trPuan({ isbn: '978-605-360-293-4' }),
      yabanciIsbn: trPuan({ isbn: de })
    }), ['9786053602934', '9783110457384']);
    expect(p.trDil).toBe(3);
    expect(p.yabanciDil).toBe(-3);
    expect(p.binKitap).toBe(2);
    expect(p.trHarf).toBe(2);
    expect(p.trIsbn, 'Türkiye ISBN katkısı +1 (v95 ile aynı)').toBe(1);
    expect(p.trIsbnTireli, 'v108 kazancı: tireli yazım da tanınıyor').toBe(1);
    expect(p.yabanciIsbn, 'yabancı ISBN CEZA getirmez — dil terimi zaten yapıyor').toBe(0);
  });

  test('isbnGrup tek otorite: önek + dil aynı tablodan, isbnUlke onun dil alanı', async ({ page }) => {
    await rafAc(page);
    const s = await page.evaluate(([tr, de]) => {
      const Z = window.__zengin;
      return { tr: Z.isbnGrup(tr), de: Z.isbnGrup(de),
        bos: Z.isbnGrup('elma'), on10: Z.isbnGrup('0306406152'),
        ulkeTr: Z.isbnUlke(tr), ulkeDe: Z.isbnUlke(de) };
    }, ['9786053602934', '9783110457384']);
    expect(s.tr).toEqual({ on: '978', onek: '605', dil: 'tr' });
    expect(s.de).toEqual({ on: '978', onek: '3', dil: 'de' });
    expect(s.bos).toEqual({ on: '', onek: '', dil: '' });
    expect(s.on10, 'ISBN-10 grup taşımaz').toEqual({ on: '', onek: '', dil: '' });
    expect(s.ulkeTr).toBe('tr');
    expect(s.ulkeDe).toBe('de');
  });

  test('formdaki dil listesi baskı kimliğiyle AYNI sözlükten üretiliyor', async ({ page }) => {
    /* Burada 8 satırlık ikinci bir dil sözlüğü elle yazılıydı; baskı kimliği
       aynı adları kullanınca iki liste ayrı ayrı bakım isteyecekti. */
    await formAc(page);
    const d = await page.evaluate(() => ({
      secenekler: [...document.querySelectorAll('#dilListesi option')].map(o => [o.value, o.textContent]),
      /* datalist'teki her ad dilAdi'nin döndürdüğü ad mı — kaynak tekilliğinin kanıtı */
      hepsiEsit: [...document.querySelectorAll('#dilListesi option')]
        .every(o => o.textContent === dilAdi(o.value))
    }));
    expect(d.secenekler.length, 'sözlük eski 8 dilden geniş').toBeGreaterThan(8);
    expect(d.secenekler).toContainEqual(['tr', 'Türkçe']);
    expect(d.secenekler).toContainEqual(['de', 'Almanca']);
    expect(d.secenekler[0], 'Türkçe ilk sırada kalır').toEqual(['tr', 'Türkçe']);
    expect(d.hepsiEsit).toBe(true);
  });

});
