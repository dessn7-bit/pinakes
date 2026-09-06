'use strict';
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');

/* --------- M1: Türkçe arama asimetrisi --------- */
test.describe('G19 M1 — Türkçe katlama (arama ve kopya tespiti)', () => {

  async function raf(page) {
    await tohumla(page, [
      sahteKitap({ ad: 'İnsan Ne İle Yaşar', yazar: 'Tolstoy' }),
      sahteKitap({ ad: 'IKEA Kataloğu', yazar: 'Kurumsal' }),
      sahteKitap({ ad: 'Şiir Üzerine Çalışmalar', yazar: 'Bir Şair' }),
      sahteKitap({ ad: 'Alakasız Bir Roman', yazar: 'Başka Yazar' })
    ]);
    await rafAc(page);
  }

  test('ASCII "Insan" yazınca "İnsan Ne İle Yaşar" bulunur', async ({ page }) => {
    await raf(page);
    await page.fill('#arama', 'Insan');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toHaveText('İnsan Ne İle Yaşar');
  });

  test('büyük harfli "İNSAN" da bulunur', async ({ page }) => {
    await raf(page);
    await page.fill('#arama', 'İNSAN');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await page.fill('#arama', 'insan');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
  });

  test('küçük "ikea" yazınca "IKEA" bulunur', async ({ page }) => {
    await raf(page);
    await page.fill('#arama', 'ikea');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toHaveText('IKEA Kataloğu');
  });

  test('aksan katlaması: "siir uzerine" → "Şiir Üzerine" bulunur', async ({ page }) => {
    await raf(page);
    await page.fill('#arama', 'siir uzerine');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toHaveText('Şiir Üzerine Çalışmalar');
  });

  test('alakasız kitap eşleşmiyor (aşırı katlama kontrolü)', async ({ page }) => {
    await raf(page);
    await page.fill('#arama', 'Insan');
    await expect(page.locator('#liste')).not.toContainText('Alakasız Bir Roman');
    await page.fill('#arama', 'zzz-hicbir-sey');
    await expect(page.locator('#liste .kart')).toHaveCount(0);
  });

  test('Goodreads aktarımında "Istanbul" ve "İstanbul" aynı kitap sayılır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'İstanbul Hatırası', yazar: 'Ahmet Ümit' })]);
    await rafAc(page);
    await ayarlarAc(page);
    const csv = ['Title,Author,Exclusive Shelf,My Rating,Number of Pages',
      '"Istanbul Hatirasi","Ahmet Umit",read,4,500'].join('\n');
    await dosyadanYukle(page, { name: 'gr.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await expect(page.locator('#toast')).toContainText('Hepsi zaten kayıtlı');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(1);   // mükerrer yok
  });

  test('JSON geri yüklemede de aynı kitap tekrar eklenmez', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'İnce Memed', yazar: 'Yaşar Kemal' })]);
    await rafAc(page);
    await ayarlarAc(page);
    const yedek = JSON.stringify({ surum: 2,
      kitaplar: [{ ad: 'Ince Memed', yazar: 'Yasar Kemal' }], hedef: {} });
    await dosyadanYukle(page, jsonDosya(yedek, 'y.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('Yeni kitap yok');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(1);
  });

  test('etiket mükerrer kontrolü: i-ailesi katlanır, aksan katlanMAZ', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Etiketli', notlar: [
      { id: 'n1', tip: 'alinti', metin: 'metin', tarih: '2026-08-01', sayfa: null, fikir: [] }] })]);
    await rafAc(page);
    await page.click('[data-act="sekme"][data-v="alinti"]');
    const ekle = async (etiket) => {
      await page.locator('#alintiIcerik .not-kart .fikir-giris').fill(etiket);
      await page.locator('#alintiIcerik .not-kart [data-act="fikir-ekle"]').click();
      await page.waitForTimeout(120);
    };
    await ekle('Islam');
    await ekle('İslam');    // i-ailesi → aynı etiket, eklenmemeli
    await ekle('sac');
    await ekle('saç');      // aksan → AYRI etiket, eklenmeli
    const fikirler = await page.evaluate(() => veri.kitaplar[0].notlar[0].fikir);
    expect(fikirler).toEqual(['Islam', 'sac', 'saç']);
  });
});

/* --------- M2: detayda tek sayfa kutusu --------- */
test.describe('G19 M2 — oturum açıkken tek sayfa girişi', () => {

  const okunan = () => sahteKitap({ ad: 'Okunan Kitap', durum: 'okunuyor',
    sayfa: 300, guncelSayfa: 40, baslamaTarihi: bugunISO(-3) });

  /* v46: sayfa girişi "Sayfa işaretle"ye basınca açılır (yığılma diyeti) —
     tek-giriş sözleşmesi aynen: oturum yokken giriş ÇEKİRDEKTE. */
  test('oturum yokken çekirdek kutusu görünür; giriş Sayfa işaretle ile açılır', async ({ page }) => {
    await tohumla(page, [okunan()]);
    await rafAc(page);
    await page.click('#liste .kart');
    await expect(page.locator('#detayIcerik #dIlerlemeKutu')).toBeVisible();
    await expect(page.locator('#detayIcerik #d-sayfa')).toBeHidden();  // kapalı başlar
    await page.click('#detayIcerik [data-act="d-sayfa-ac"]');
    await expect(page.locator('#detayIcerik #d-sayfa')).toBeVisible();
    expect(await page.locator('#detayIcerik #oturumSayfa').count()).toBe(0);
  });

  test('oturum açıkken çekirdek kutusu gizlenir, tek giriş kalır', async ({ page }) => {
    await tohumla(page, [okunan()]);
    await rafAc(page);
    await page.click('#liste .kart');
    await page.click('#detayIcerik [data-act="oturum-basla"]');
    await expect(page.locator('#detayIcerik #oturumSayfa')).toBeVisible();
    await expect(page.locator('#detayIcerik #dIlerlemeKutu')).toBeHidden();
    // görünür sayfa girişi tam olarak bir tane
    await expect(page.locator('#detayIcerik #oturumSayfa:visible')).toHaveCount(1);
    await expect(page.locator('#detayIcerik #d-sayfa:visible')).toHaveCount(0);
  });

  test('oturum bitince çekirdek kutusu geri gelir', async ({ page }) => {
    await tohumla(page, [okunan()]);
    await rafAc(page);
    await page.click('#liste .kart');
    await page.click('#detayIcerik [data-act="oturum-basla"]');
    await expect(page.locator('#detayIcerik #dIlerlemeKutu')).toBeHidden();
    await page.fill('#detayIcerik #oturumSayfa', '120');
    await page.click('#detayIcerik [data-act="oturum-bitir"]');
    await expect(page.locator('#detayIcerik #dIlerlemeKutu')).toBeVisible();
    expect(await page.evaluate(() => veri.kitaplar[0].guncelSayfa)).toBe(120);
  });

  test('her iki yol da guncelSayfa yazar', async ({ page }) => {
    await tohumla(page, [okunan()]);
    await rafAc(page);
    // 1) çekirdek yolu (v46: giriş satırını önce aç)
    await page.click('#liste .kart');
    await page.click('#detayIcerik [data-act="d-sayfa-ac"]');
    await page.fill('#detayIcerik #d-sayfa', '75');
    await page.click('#detayIcerik [data-act="ilerleme-kaydet"]');
    expect(await page.evaluate(() => veri.kitaplar[0].guncelSayfa)).toBe(75);
    // 2) oturum yolu
    await page.click('#detayIcerik [data-act="oturum-basla"]');
    await page.fill('#detayIcerik #oturumSayfa', '210');
    await page.click('#detayIcerik [data-act="oturum-bitir"]');
    expect(await page.evaluate(() => veri.kitaplar[0].guncelSayfa)).toBe(210);
    const o = await page.evaluate(() => veri.kitaplar[0].oturumlar[0]);
    expect(o.sa).toBe(75);
    expect(o.sb).toBe(210);
  });
});
