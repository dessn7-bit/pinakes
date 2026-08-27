'use strict';
/* G90 — BAŞLIK DÜZEYİ UYARLAMA SÜZGECİ (v93).

   SÖZLEŞMELER (canlı GB kanıtı 2026-08-27):
   - Başlığında uyarlama işareti ("Gençler İçin", "Çocuklar İçin",
     "abridged", "resimli"…) taşıyan GB baskısı tür eşleşmesine HİÇ girmez —
     kategorileri okunmaz. Nutuk böylece Tarih'e döndü: GB'nin "GENÇLER İÇİN
     NUTUK" baskısına bastığı yanlış "Fiction" etiketi kararsızlık korumasını
     tetikliyordu (v92'de boş kalıyordu).
   - YANLIŞ POZİTİF koruması: kullanıcının KENDİ kitap adında da işaret varsa
     ("Çocuklar İçin Felsefe", "Resimli Türk Edebiyatı Tarihi" gerçek
     adlardır) süzgeç uygulanmaz — kitabın kendisi zaten o kitap.
   - Süzgeç sonrası hiç uyan baskı kalmazsa tür yazılmaz, çökme yok.
   - v92 kuralları (kurgu üstünlüğü, uyarlama kapısı, kararsızlık) AYNEN —
     g89 koruyor; buradaki vakalar yalnız süzgecin katmanını sınar.

   (Mutasyon 1: başlık süzgeci kaldırılır → Nutuk deseni + dışlama vakaları
    kırmızı. Mutasyon 2: yanlış-pozitif koruması kaldırılır [kitapIsaretli
    hep false] → "Çocuklar İçin Felsefe" vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap } = require('./yardim');

const TURLER = [
  { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
  { seo: 'Tarih', ad: 'Tarih', kitapSayisi: 11576 },
  { seo: 'Felsefe-Dusunce', ad: 'Felsefe-Düşünce', kitapSayisi: 4114 },
  { seo: 'Siyaset', ad: 'Siyaset-Politika', kitapSayisi: 6941 },
  { seo: 'Cocuk', ad: 'Çocuk', kitapSayisi: 8223 }
];
function vol(ad, kategoriler) {
  const v = { title: ad, authors: ['Y'] };
  if (kategoriler) v.categories = kategoriler;
  return { volumeInfo: v };
}
async function tohumlaTara(page, kitaplar, ekstra) {
  await tohumla(page, kitaplar, Object.assign({ kk_zg_oto_deneme_v1: null }, ekstra || {}));
}
function kitapTur(page, ad) {
  return page.evaluate(a => {
    const k = veri.kitaplar.find(x => x.ad === a);
    return k ? k.tur : '(kitap yok)';
  }, ad);
}
async function motor(page) {
  await tohumla(page, []);
  await page.goto('/');
  await page.evaluate(T => window.__zengin.taksonomiKur(T), TURLER);
}

test.describe('G90 birim — başlık süzgeci ve yanlış-pozitif koruması', () => {

  test('Nutuk deseni: uyarlama başlıklı baskılar dışlanır, tür Tarih olur (canlı GB birebiri)', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => {
      const z = window.__zengin;
      const v = (ad, kat) => ({ title: ad, categories: kat || undefined });
      const adaylar = [
        v('NUTUK', ['History']), v('Nutuk'), v('Nutuk'),
        v('Nutuk', ['Political Science']),
        v('ÇOCUKLAR İÇİN NUTUK', ['Crafts & Hobbies']),
        v('GENÇLER İÇİN NUTUK', ['Fiction']),          // GB'nin yanlış etiketi
        v('NUTUK - Tam Metin, Günümüz Türkçesi ile', ['Science'])];
      const kat = z.kategoriTopla(adaylar, 'Nutuk');
      return { kat, tur: z.turCevir(kat) };
    });
    expect(t.kat, 'uyarlama baskıların kategorileri hiç okunmadı')
      .not.toContain('Fiction');
    expect(t.kat).not.toContain('Crafts & Hobbies');
    expect(t.tur, 'Fiction gürültüsü gidince işaretsiz yol Tarih yazar').toBe('Tarih');
  });

  test('yanlış pozitif: kitabın KENDİ adı işaretliyse süzgeç uygulanmaz', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => {
      const z = window.__zengin;
      const v = (ad, kat) => ({ title: ad, categories: kat || undefined });
      return {
        felsefe: z.turCevir(z.kategoriTopla(
          [v('Çocuklar İçin Felsefe', ['Philosophy'])], 'Çocuklar İçin Felsefe')),
        resimli: z.turCevir(z.kategoriTopla(
          [v('Resimli Türk Edebiyatı Tarihi', ['History'])], 'Resimli Türk Edebiyatı Tarihi')),
        isaretler: [z.baslikUyarlama('Çocuklar İçin Felsefe'),
          z.baslikUyarlama('GENÇLER İÇİN NUTUK'),
          z.baslikUyarlama('Kısaltılmış Sefiller'),
          z.baslikUyarlama('The Odyssey: A Graphic Novel'),
          z.baslikUyarlama('Nutuk'),
          z.baslikUyarlama('Savaş ve Barış')]
      };
    });
    expect(t.felsefe, 'gerçek adı "Çocuklar İçin …" olan kitaba tür atanır').toBe('Felsefe-Düşünce');
    expect(t.resimli, '"Resimli …" gerçek başlığı süzülmez').toBe('Tarih');
    expect(t.isaretler).toEqual([true, true, true, true, false, false]);
  });

  test('süzgeç sonrası hiç baskı kalmazsa tür boş — çökme yok', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => {
      const z = window.__zengin;
      const v = (ad, kat) => ({ title: ad, categories: kat || undefined });
      const kat = z.kategoriTopla(
        [v('Gençler İçin Deneme Kitabı', ['Fiction']),
         v('Deneme Kitabı (Kısaltılmış)', ['History'])], 'Deneme Kitabı');
      return { kat, tur: z.turCevir(kat) };
    });
    expect(t.kat, 'tüm uyanlar dışlandı → kategori yok').toEqual([]);
    expect(t.tur, 'karar verecek veri yok → boş').toBe('');
  });
});

test.describe('G90 uçtan uca — tarama süzgeçle doğru yazar', () => {

  test('açılış taraması Nutuk desenini Tarih yazar; dışlanan baskı sayılmaz', async ({ page }) => {
    const k = sahteKitap({ ad: 'Söylev Kitabı' });
    await tohumlaTara(page, [k]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [
      vol('Söylev Kitabı', ['History']),
      vol('GENÇLER İÇİN Söylev Kitabı', ['Fiction']),
      vol('Söylev Kitabı', ['Political Science'])] };
    await page.goto('/');
    /* Fiction dışlandı → işaretsiz → geliş sırası → Tarih (kararsızlık YOK:
       Tarih+Siyaset işaretsiz karışım eski davranışta ilk adayı yazar) */
    await expect.poll(() => kitapTur(page, 'Söylev Kitabı'), { timeout: 15000 }).toBe('Tarih');
  });

  test('yalnız uyarlama baskısı olan kitap taramada boş kalır, "denendi" damgası basılır', async ({ page }) => {
    const k = sahteKitap({ ad: 'Yalnız Uyarlama' });
    await tohumlaTara(page, [k]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [
      vol('Yalnız Uyarlama (Çocuklar İçin)', ['Juvenile Fiction'])] };
    await page.goto('/');
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(1);
    await expect.poll(() => page.evaluate(() =>
      Object.keys(JSON.parse(localStorage.getItem('kk_zg_oto_deneme_v1') || '{}')).length)).toBe(1);
    expect(await kitapTur(page, 'Yalnız Uyarlama')).toBe('');
  });
});
