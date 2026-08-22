'use strict';
/* G83 — TASLAK TETİKLEYİCİ EKSİĞİ (v83).

   v82 taslakAday'ı yalnız index.html yollarına (form + JSON + Goodreads)
   bağlamıştı; barkod/seri tarama (katalog.js) ve Keşfet'ten ekleme
   (kesfet.js) taslak üretmiyordu — spec eksiği. v83 iki noktaya otoTur (v65)
   ile AYNI desende bağlar.

   BİLİNÇLİ İSTİSNA (bu dosyada kilitli): senkron.js birleştirme push'una
   BAĞLANMAZ — karşı cihazdan gelen kitabın taslağı kendi cihazında zaten
   üretilmiş olabilir; bağlansaydı iki cihaz aynı kitap için ikişer model
   çağrısı yapardı.

   Kapılar v82'dekiyle AYNI (yeniden yazılmadı): ayar kapalıysa sessiz,
   özetlide/taslaklıda/reddedilmişte üretim yok, çevrimdışında kuyruk bekler.
   Seri taramada ek önlem YOK: kuyruk zaten kitap başına ≥3 sn serileştirir.

   (Mutasyon: katalog.js taslakAday çağrısını kaldır → (a)/(e) kırmızı;
    kesfet.js çağrısını kaldır → (b) kırmızı.) */
const { test, expect, tohumla, sahteKitap, kameraTaklit, bugunISO,
  rafAc, ayarlarAc } = require('./yardim');

function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
/* /ozet-taslak taklidi + Node-tarafı zaman damgası (aralık ölçümü) */
async function taslakUcKur(page, yanit) {
  const s = { istekler: [], zamanlar: [] };
  await page.route('**/ozet-taslak', r => {
    s.istekler.push(JSON.parse(r.request().postData() || '{}'));
    s.zamanlar.push(Date.now());
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(yanit || { durum: 'tamam',
        metin: 'KONU — deneme taslağı. ' + 'içerik '.repeat(20), kaynak: ['Goodreads'] }) });
  });
  return s;
}
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
async function barkodOkut(page, isbn, ad) {
  page.__agAyar.google = gbIsbnYanit({ ad, yazar: 'Seri Yazar', sayfa: 200 });
  await page.evaluate(kod => { window.__sahteKod = kod; }, isbn);
  await expect(page.locator('#seriNot')).toContainText('Eklendi: ' + ad, { timeout: 10000 });
  await page.evaluate(() => { window.__sahteKod = null; });
}
function gItem(ad, yazar) {
  return { volumeInfo: { title: ad, authors: [yazar], publisher: 'Yayınevi A',
    publishedDate: '2021', pageCount: 320, language: 'tr' } };
}
function sevilenYazarVeri() {   // g43 deseni: Usta ort 9,5 → Keşfet-B sinyali
  return [
    bitmis({ ad: 'Taban 1', yazar: 'Taban Yazar 1', tur: 'Deneme', puan: 6 }),
    bitmis({ ad: 'Sevilen 1', yazar: 'Usta', puan: 9 }),
    bitmis({ ad: 'Sevilen 2', yazar: 'Usta', puan: 10 })];
}
async function kesfettenEkle(page, ad) {
  await page.click('nav [data-act="sekme"][data-v="kesfet"]');
  await expect(page.locator('#ksIcerik .ks-ust')).toBeVisible();
  page.__agAyar.google = { items: [gItem(ad, 'Usta')] };
  await page.click('#ksB [data-act="ks-b-getir"]');
  await page.click('#ksB [data-act="ks-b-ekle"]');
  await expect(page.locator('#toast')).toContainText('İstek listene eklendi');
}
const kuyruk = page => page.evaluate(() =>
  JSON.parse(localStorage.getItem('kk_taslak_kuyruk_v1') || '[]'));

/* g4 gerçek ISBN'leri gibi geçerli sağlama toplamlı kodlar (seri tarama) */
const ISBNLER = ['9780132350884', '9780306406157', '9780131103627',
  '9780201633610', '9780262033848'];

test.describe('G83 taslak tetikleyicileri', () => {

  test('(a) barkodla okutulan kitap sıraya girer, taslak üretilir', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await kameraTaklit(page);
    await tohumla(page, [], { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await seriAc(page);
    await barkodOkut(page, ISBNLER[0], 'Barkod Kitabı');
    const id = await page.evaluate(() => veri.kitaplar[0].id);
    expect(await kuyruk(page), 'okutulan kitap SIRAYA girdi').toContain(id);
    await expect.poll(() => uc.istekler.length, { timeout: 15000 }).toBe(1);
    expect(uc.istekler[0].ad).toBe('Barkod Kitabı');
    expect(uc.istekler[0].isbn).toBe(ISBNLER[0]);
    await expect.poll(() => page.evaluate(i => window.__taslak.var(i), id),
      { timeout: 10000 }).toBe(true);
    // EN ÖNEMLİ KURAL bu yolda da geçerli
    expect(await page.evaluate(i => window.__ozet.oku(i), id)).toBe('');
  });

  test('(b) Keşfet\'ten istek listesine eklenen kitap sıraya girer, taslak üretilir', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await tohumla(page, sevilenYazarVeri(), { kk_taslak_ayar_v1: '1' });
    await page.goto('/');
    await kesfettenEkle(page, 'Ustanın Yeni Romanı');
    const id = await page.evaluate(() =>
      veri.kitaplar.find(k => k.ad === 'Ustanın Yeni Romanı').id);
    expect(await kuyruk(page), 'Keşfet eklemesi SIRAYA girdi').toContain(id);
    await expect.poll(() => uc.istekler.length, { timeout: 15000 }).toBe(1);
    expect(uc.istekler[0].ad).toBe('Ustanın Yeni Romanı');
    await expect.poll(() => page.evaluate(i => window.__taslak.var(i), id),
      { timeout: 10000 }).toBe(true);
  });

  test('(c) ayar KAPALIYKEN iki yol da POST üretmez, kuyruğa yazmaz', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await kameraTaklit(page);
    await tohumla(page, sevilenYazarVeri());   // ayar tohumlanmadı → varsayılan KAPALI
    await rafAc(page);
    await seriAc(page);
    await barkodOkut(page, ISBNLER[0], 'Sessiz Barkod');
    await page.click('#seriOrtu .sheet-kapat');
    await page.click('#ortuAyar .sheet-kapat');
    await kesfettenEkle(page, 'Sessiz Keşfet');
    await page.waitForTimeout(3600);   // kuyruk aralığından uzun — istek ÇIKMAMALI
    expect(uc.istekler.length, 'kapalıyken POST yok').toBe(0);
    expect(await kuyruk(page), 'kuyruğa bile girmez').toEqual([]);
  });

  test('(d) senkronla karşı cihazdan gelen kitap sıraya GİRMEZ (çifte üretim önlenir)', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await tohumla(page, [], { kk_taslak_ayar_v1: '1' });
    // sahte oda (g80 deseni): uzak odada 1 kitap hazır bekliyor
    await page.route('**/identitytoolkit.googleapis.com/**', r =>
      r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ idToken: 'sahte', refreshToken: 'sahte' }) }));
    let sema = 0;   // rafAc SONRASI canlı koddan okunur (g26 dersi: sabit yazılmaz)
    await page.route('**/*firebasedatabase.app/**', r => {
      const met = r.request().method(), url = r.request().url();
      const json = g => r.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'ETag': 'e1', 'Access-Control-Expose-Headers': 'ETag' },
        body: JSON.stringify(g) });
      if (url.includes('--ozet')) return json({});
      if (met === 'GET')
        return json({ sema, kitaplar: [{ id: 'uzak1', ad: 'Uzak Cihaz Kitabı',
          yazar: 'Uzak Yazar', g: 100, notlar: [] }], silinenler: {} });
      return json({});
    });
    await rafAc(page);
    sema = await page.evaluate(() => window.__senkron.SEMA_SURUM);
    const tamam = await page.evaluate(() => {
      window.__senkron.ayarKaydet({ oda: 'g83odasi', cihaz: 'c1', sonSenkron: null });
      return window.__senkron.senkronEt(true);
    });
    expect(tamam).toBe(true);
    expect(await page.evaluate(() =>
      veri.kitaplar.some(k => k.ad === 'Uzak Cihaz Kitabı')), 'kitap senkronla geldi').toBe(true);
    await page.waitForTimeout(3600);
    expect(await kuyruk(page), 'senkron kitabı kuyruğa GİRMEDİ').toEqual([]);
    expect(uc.istekler.length, 'model isteği yok — çifte üretim önlendi').toBe(0);
  });

  test('(e) seri taramada 5 kitap: kuyruk tavanı aşılmaz, istekler ≥3 sn arayla serileşir', async ({ page }) => {
    test.setTimeout(90000);
    const uc = await taslakUcKur(page);
    await kameraTaklit(page);
    await tohumla(page, [], { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await seriAc(page);
    let enUzunKuyruk = 0;
    for (let i = 0; i < 5; i++) {
      await barkodOkut(page, ISBNLER[i], 'Seri Kitap ' + (i + 1));
      enUzunKuyruk = Math.max(enUzunKuyruk, (await kuyruk(page)).length);
    }
    expect(enUzunKuyruk, 'kuyruk tavanı (100) aşılmadı').toBeLessThanOrEqual(100);
    await expect.poll(() => uc.istekler.length, { timeout: 60000 }).toBe(5);
    const adlar = uc.istekler.map(x => x.ad).sort();
    expect(adlar).toEqual(['Seri Kitap 1', 'Seri Kitap 2', 'Seri Kitap 3',
      'Seri Kitap 4', 'Seri Kitap 5']);
    const araliklar = uc.zamanlar.slice(1).map((t, i) => t - uc.zamanlar[i]);
    console.log('[G83 aralık] POST aralıkları (ms): ' + araliklar.join(', ')
      + ' — en kısa: ' + Math.min(...araliklar));
    // sözleşme "en az 3 sn"; zamanlayıcı sapması payı 200 ms
    for (const a of araliklar) expect(a, 'istekler serileşti').toBeGreaterThanOrEqual(2800);
    expect(await kuyruk(page), 'hepsi işlendi, kuyruk boşaldı').toEqual([]);
  });
});
