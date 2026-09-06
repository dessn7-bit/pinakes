'use strict';
/* G60 — KESME İŞARETİ KATLAMASI (v71): katla() artık U+2018 ' / U+2019 ' /
   U+02BC ʼ kesme varyantlarını ASCII (') tek biçimine indirir.

   KANIT (canlı, v70): yerleşik tür listesi 242 kaydın 238'ini eşledi; kalan 4'ün
   TEK sebebi kesmeydi (kütüphanede U+2019, listede ASCII): "İphigenia Aulis'te",
   "Gulliver's Travels", "The Titan's Curse (#3)", "Sophie's World". Aynı kök
   aramayı da bozuyordu ("Gulliver's" araması U+2019'lu kaydı bulamazdı).

   SÖZLEŞMELER (bu dosyanın koruduğu):
   - katla() kullanan DÖRT yüzeyde kesme varyantı eşleşir: tür içe aktarımı,
     arama (iki yön), kitap kopya tespiti (JSON içe aktarım), Keşfet elemesi.
   - Yerleşik listenin 4 gerçek kaydı U+2019'lu kütüphane yazımıyla eşleşir.
   - Mevcut TR katlaması (İ/ı, ş/s, ü/u...) DEĞİŞMEDİ.
   - iKatla'ya DOKUNULMADI (etiket sözleşmesi ayrı).
   (Mutasyon: katla'daki kesme düzleştirmesi kaldırılır → (a) vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');
const YERLESIK = require('../veri/turler-yerlesik.json');

const U2019 = '’';   // ' — kütüphane kayıtlarındaki biçim (Goodreads/klavye)
function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}

test.describe('G60 kesme işareti katlaması', () => {

  test('(a) tür içe aktarımı: U+2019 kütüphane kaydı ASCII dosya kaydıyla eşleşir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Gulliver' + U2019 + 's Travels', yazar: 'Jonathan Swift' })]);
    page.__agAyar.turler = [{ seo: 'Roman', ad: 'Roman', kitapSayisi: 25000 }];
    await page.goto('/');
    await ayarlarAc(page);
    await dosyadanYukle(page, jsonDosya({ surum: 1, tur: [
      { ad: "Gulliver's Travels", yazar: 'Jonathan Swift', tur: 'Roman' }] }, 'turler.json'));
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('1');
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('boş tür dolacak');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın türü dosyadan yazıldı');
    expect(await page.evaluate(() => veri.kitaplar[0].tur)).toBe('Roman');
  });

  test('(b) yerleşik listenin 4 gerçek kesmeli kaydı U+2019 yazımıyla eşleşir ve dolar', async ({ page }) => {
    // canlıda eşleşmeyen 4 kitabın KÜTÜPHANE yazımı (U+2019 — yedekten birebir)
    const dortlu = [
      'İphigenia Aulis’te', 'Gulliver’s Travels',
      'The Titan’s Curse (Percy Jackson and the Olympians, #3)', 'Sophie’s World'];
    const yazarlar = { 'İphigenia Aulis’te': 'Euripides', 'Gulliver’s Travels': 'Jonathan Swift',
      'The Titan’s Curse (Percy Jackson and the Olympians, #3)': 'Rick Riordan',
      'Sophie’s World': 'Jostein Gaarder' };
    await tohumla(page, dortlu.map(ad => sahteKitap({ ad, yazar: yazarlar[ad] })));
    page.__agAyar.turler = [
      { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1 },
      { seo: 'Roman', ad: 'Roman', kitapSayisi: 1 },
      { seo: 'Fantastik', ad: 'Fantastik', kitapSayisi: 1 },
      { seo: 'Felsefe-Dusunce', ad: 'Felsefe-Düşünce', kitapSayisi: 1 }];
    await page.goto('/');
    await ayarlarAc(page);
    await page.click('[data-act="zg-tur-hazir"]');
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('4');
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('boş tür dolacak');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('4 kitabın türü dosyadan yazıldı');
    // beklenen türler YERLEŞİK dosyanın kendisinden (bağımsız hesap)
    const beklenen = {};
    for (const r of YERLESIK.tur)
      if (["Gulliver's Travels", 'Sophie' + "'" + 's World'].includes(r.ad) ||
          r.ad.startsWith('İphigenia') || r.ad.startsWith('The Titan'))
        beklenen[r.ad.replace(/'/g, U2019)] = r.tur;
    const yazilan = await page.evaluate(() =>
      Object.fromEntries(veri.kitaplar.map(k => [k.ad, k.tur])));
    for (const ad of dortlu)
      expect(yazilan[ad], ad).toBe(beklenen[ad]);
  });

  test('(c) arama iki yönde kesme-bağımsız', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'Gulliver' + U2019 + 's Travels', yazar: 'Jonathan Swift' }),   // rafta U+2019
      sahteKitap({ ad: "Sophie's World", yazar: 'Jostein Gaarder' }),                  // rafta ASCII
      sahteKitap({ ad: 'Alakasız Kitap', yazar: 'Başka Yazar' })]);
    await rafAc(page);
    await page.fill('#arama', "Gulliver's");            // ASCII arama → U+2019 kayıt
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toContainText('Gulliver');
    await page.fill('#arama', 'Sophie' + U2019 + 's');  // U+2019 arama → ASCII kayıt
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toContainText('Sophie');
  });

  test('(d) JSON içe aktarımda kesme varyantı MÜKERRER sayılır, eklenmez', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Gulliver' + U2019 + 's Travels', yazar: 'Jonathan Swift' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await dosyadanYukle(page, jsonDosya({ surum: 2, kitaplar: [
      { ad: "Gulliver's Travels", yazar: 'Jonathan Swift' },   // kesme varyantı → mükerrer
      { ad: 'Yeni Gelen Kitap', yazar: 'Başka Yazar' }         // eklenmeli
    ], hedef: {} }, 'yedek.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('1 kitap geri yüklendi');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(2);
  });

  test('(e) Keşfet elemesi: kütüphanedeki U+2019 kitabın ASCII adayı önerilmez', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Taban 1', yazar: 'Taban Yazar 1', puan: 6 }),
      bitmis({ ad: 'Taban 2', yazar: 'Taban Yazar 2', puan: 5 }),
      bitmis({ ad: 'Taban 3', yazar: 'Taban Yazar 3', puan: 6 }),
      bitmis({ ad: 'Gulliver' + U2019 + 's Travels', yazar: 'Jonathan Swift', puan: 9 }),
      bitmis({ ad: 'A Modest Proposal', yazar: 'Jonathan Swift', puan: 10 })]);
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="kesfet"]');
    await expect(page.locator('#ksIcerik .ks-ust')).toBeVisible();
    page.__agAyar.google = { items: [
      { volumeInfo: { title: "Gulliver's Travels", authors: ['Jonathan Swift'],
        publisher: 'Y', publishedDate: '2020', pageCount: 300, language: 'tr' } },
      { volumeInfo: { title: 'Yepyeni Kitap', authors: ['Jonathan Swift'],
        publisher: 'Y', publishedDate: '2021', pageCount: 200, language: 'tr' } }] };
    await page.click('#ksB [data-act="ks-b-getir"]');
    await expect(page.locator('#ksB .ks-b-item', { hasText: 'Yepyeni Kitap' })).toBeVisible();
    await expect(page.locator('#ksB .ks-b-item')).toHaveCount(1);
  });

  test('(f) TR katlaması regresyonsuz: aksan/İ-ailesi aramaları aynen çalışır', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'Şiir Üzerine Çalışmalar', yazar: 'Bir Şair' }),
      sahteKitap({ ad: 'İnsan Ne İle Yaşar', yazar: 'Tolstoy' })]);
    await rafAc(page);
    await page.fill('#arama', 'siir uzerine');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toHaveText('Şiir Üzerine Çalışmalar');
    await page.fill('#arama', 'Insan');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart-baslik')).toHaveText('İnsan Ne İle Yaşar');
  });
});
