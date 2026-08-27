'use strict';
/* G89 — KURGU KORUMASI + UYARLAMA KAPISI + TÜR KISALTMALARI (v92).

   SÖZLEŞMELER (bu dosyanın koruduğu; canlı GB ölçümleri 2026-08-27, 2 koşum):
   1) KURGU ÜSTÜNLÜĞÜ: kategorilerde kurgu işareti (fiction/novel(s)/romanı;
      'roman' yalnız TAM; non(-)fiction ve uyarlama etiketleri işaret DEĞİL)
      varsa kurgu-dışı hedef bastırılır — Üç Silahşor "History · Fiction ·
      France" artık Tarih değil Roman. İşaret hedef SEÇMEZ: kurgu içinde
      spesifik tür jenerikten (Roman, Edebiyat) önce — "Fiction" Tiyatro'yu
      ve Hikaye'yi Roman'a ezmez.
   2) KARARSIZLIK: kurgu işareti varken ≥2 FARKLI kurgu-dışı aday (Taras
      Bulba: Felsefe+Mizah+Tarih) → tür YAZILMAZ; yanlış tür boş türden kötü.
   3) UYARLAMA KAPISI (kategoriTopla): Juvenile, Young Adult, Comics, Graphic
      Novels kategorileri ancak başlığı uyan TÜM baskılar uyarlama-etiketliyse
      kalır (kategorisiz uyan baskı "uyarlama değil" sayılır) — tek çocuk
      baskısı Sefiller'i Çocuk yapamaz; Sapiens'in grafik uyarlamaları ana
      kitabı Tarih'ten edemez.
   4) İşaretsiz kitapta ESKİ davranış birebir: [History] → Tarih.
   5) TUR_GORUNEN v92 kısaltmaları yalnız EKRANDA; form ham; mevcut değer
      GÖÇ ETTİRİLMEZ.

   (Mutasyon 1: kurguIsaret hep false → kurgu-üstünlüğü/kararsızlık vakaları
    kırmızı. Mutasyon 2: uyarlama kapısı kaldırılır → Sefiller/Sapiens
    desenleri kırmızı.) */
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc } = require('./yardim');

const TURLER = [
  { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
  { seo: 'Tarih', ad: 'Tarih', kitapSayisi: 11576 },
  { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1000 },
  { seo: 'Hikaye-Oyku', ad: 'Hikaye (Öykü)', kitapSayisi: 9508 },
  { seo: 'Cocuk', ad: 'Çocuk', kitapSayisi: 8223 },
  { seo: 'Edebiyat', ad: 'Edebiyat', kitapSayisi: 50610 },
  { seo: 'Cizgi-Roman', ad: 'Çizgi-Roman', kitapSayisi: 2922 },
  { seo: 'Siyaset', ad: 'Siyaset-Politika', kitapSayisi: 6941 },
  { seo: 'Felsefe-Dusunce', ad: 'Felsefe-Düşünce', kitapSayisi: 4114 },
  { seo: 'Eglence-Mizah', ad: 'Eğlence-Mizah', kitapSayisi: 1331 }
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
/* Birim vakaları taksonomiyi doğrudan kurar (g53 kalıbı) — ağ yok, kararlı. */
async function motor(page) {
  await tohumla(page, []);
  await page.goto('/');
  await page.evaluate(T => window.__zengin.taksonomiKur(T), TURLER);
}

test.describe('G89 birim — kurgu üstünlüğü, kararsızlık, uyarlama kapısı', () => {

  test('kurgu üstünlüğü: Üç Silahşor deseni Roman; işaretsiz tarih kitabı Tarih kalır', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => ({
      ucSilahsor: window.__zengin.turCevir(['History', 'Fiction', 'France']),
      quoVadis: window.__zengin.turCevir(['Fiction', 'Church history']),
      // işaretsiz: eski davranış birebir — geliş sırası hüküm sürer
      duzTarih: window.__zengin.turCevir(['History']),
      isaretsizKarisim: window.__zengin.turCevir(['History', 'Political Science']),
      // işaret tespiti tuzakları
      romaTarihi: window.__zengin.kurguIsaret(['Roman Empire']),
      nonFiction: window.__zengin.kurguIsaret(['Juvenile Nonfiction']),
      trRoman: window.__zengin.kurguIsaret(['Fransız Romanı'])
    }));
    expect(t.ucSilahsor, 'History konu etiketi kurguyu yenemez').toBe('Roman');
    expect(t.quoVadis).toBe('Roman');
    expect(t.duzTarih, 'kurgusuz tarih kitabı Tarih alır').toBe('Tarih');
    expect(t.isaretsizKarisim, 'işaretsiz kitapta eski davranış').toBe('Tarih');
    expect(t.romaTarihi, '"Roman Empire" kurgu işareti değil (tam-eşleşme kuralı)').toBe(false);
    expect(t.nonFiction, 'nonfiction kurgu işareti değil').toBe(false);
    expect(t.trRoman, 'Türkçe "Romanı" kurgu işaretidir').toBe(true);
  });

  test('işaret hedef SEÇMEZ: Tiyatro ve Hikaye, Fiction yüzünden Roman\'a ezilmez', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => ({
      tiyatro: window.__zengin.turCevir(['Fiction', 'Drama']),
      oyku: window.__zengin.turCevir(['Fiction', 'Short stories']),
      oykuTers: window.__zengin.turCevir(['Short stories', 'Fiction']),
      duzRoman: window.__zengin.turCevir(['Turkish fiction'])
    }));
    expect(t.tiyatro, 'Fiction önce gelse de spesifik kurgu kazanır').toBe('Tiyatro');
    expect(t.oyku).toBe('Hikaye (Öykü)');
    expect(t.oykuTers).toBe('Hikaye (Öykü)');
    expect(t.duzRoman, 'spesifik aday yoksa jenerik Roman yazılır').toBe('Roman');
  });

  test('kararsızlık: Taras Bulba deseni (≥2 farklı kurgu-dışı) tür YAZMAZ', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => ({
      tarasBulba: window.__zengin.turCevir(['Fiction', 'Philosophy', 'Humor', 'History']),
      tekKonu: window.__zengin.turCevir(['Philosophy', 'Fiction'])
    }));
    expect(t.tarasBulba, 'çelişen konu etiketleri → boş, rastgele değil').toBe('');
    expect(t.tekKonu, 'TEK kurgu-dışı konu etiketi bastırılır, kurgu yazılır').toBe('Roman');
  });

  test('uyarlama kapısı: karışık baskılar uyarlama kategorisini düşürür; saf uyarlama kalır', async ({ page }) => {
    await motor(page);
    const t = await page.evaluate(() => {
      const z = window.__zengin;
      const v = (ad, kat) => ({ title: ad, categories: kat || undefined });
      return {
        // Sefiller deseni: juvenile'lı + yetişkin baskılar karışık
        sefiller: z.kategoriTopla([
          v('Sefiller', ['Juvenile Fiction']), v('Sefiller', ['French literature']),
          v('Sefiller', ['French fiction'])], 'Sefiller'),
        // Siyah Lale deseni: juvenile'lı + kategoriSİZ uyan baskı
        siyahLale: z.kategoriTopla([
          v('Siyah Lale', ['Juvenile Fiction']), v('Siyah Lale Ciltli')], 'Siyah Lale'),
        // Sapiens deseni: grafik/gençlik uyarlamaları + ana baskılar
        sapiens: z.kategoriTopla([
          v('Sapiens', ['History']), v('Sapiens: A Graphic History', ['Comics & Graphic Novels']),
          v('Sapiens A Graphic History', ['Young Adult Nonfiction'])], 'Sapiens'),
        // GERÇEK çocuk kitabı: TÜM uyan baskılar juvenile → kategori KALIR
        cocukKitabi: z.kategoriTopla([
          v('Minik Ayı', ['Juvenile Fiction']), v('Minik Ayı', ['Juvenile Fiction / Animals'])], 'Minik Ayı')
      };
    });
    expect(t.sefiller, 'juvenile düştü, yetişkin kategoriler kaldı')
      .toEqual(['French literature', 'French fiction']);
    expect(t.siyahLale, 'kategorisiz uyan baskı = uyarlama değil → juvenile düştü').toEqual([]);
    expect(t.sapiens, 'grafik/gençlik uyarlamaları düştü, History kaldı').toEqual(['History']);
    expect(t.cocukKitabi, 'saf çocuk kitabında kapı açık')
      .toEqual(['Juvenile Fiction', 'Juvenile Fiction / Animals']);
    // uçtan uca: Sefiller deseni artık Çocuk üretmez, Sapiens Tarih kalır
    const uc = await page.evaluate(t2 => ({
      sefiller: window.__zengin.turCevir(t2.sefiller),
      sapiens: window.__zengin.turCevir(t2.sapiens),
      cocuk: window.__zengin.turCevir(t2.cocukKitabi)
    }), t);
    expect(uc.sefiller).toBe('Edebiyat');
    expect(uc.sapiens).toBe('Tarih');
    expect(uc.cocuk, 'gerçek çocuk kitabı Çocuk alır').toBe('Çocuk');
  });
});

test.describe('G89 uçtan uca — tarama, mevcut değer, kısaltmalar', () => {

  test('açılış taraması Üç Silahşor desenini Roman yazar; dolu tür DEĞİŞMEZ', async ({ page }) => {
    const roman = sahteKitap({ ad: 'Silahşor Kitabı' });
    const dolu = sahteKitap({ ad: 'Dolu Tarih', tur: 'Tarih' });
    await tohumlaTara(page, [roman, dolu]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [
      vol('Silahşor Kitabı', ['History']),
      vol('Silahşor Kitabı', ['Fiction']),
      vol('Silahşor Kitabı', ['France'])] };
    await page.goto('/');
    await expect.poll(() => kitapTur(page, 'Silahşor Kitabı'), { timeout: 15000 }).toBe('Roman');
    expect(await kitapTur(page, 'Dolu Tarih'), 'önceden atanmış tür göç etmedi').toBe('Tarih');
    expect(page.__agSayac.google, 'dolu kitap sorgulanmadı').toBe(1);
  });

  test('kararsız kitaba tarama tür yazmaz ama "denendi" damgası basar (kota korunur)', async ({ page }) => {
    const k = sahteKitap({ ad: 'Kararsız Kitap' });
    await tohumlaTara(page, [k]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [
      vol('Kararsız Kitap', ['Fiction']), vol('Kararsız Kitap', ['Philosophy']),
      vol('Kararsız Kitap', ['Humor']), vol('Kararsız Kitap', ['History'])] };
    await page.goto('/');
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(1);
    await expect.poll(() => page.evaluate(() =>
      Object.keys(JSON.parse(localStorage.getItem('kk_zg_oto_deneme_v1') || '{}')).length)).toBe(1);
    expect(await kitapTur(page, 'Kararsız Kitap'), 'çelişkide boş bırakıldı').toBe('');
  });

  test('v92 kısaltmaları: künyede "Siyaset" ve "Anı", formda HAM ad; değer depoda tam', async ({ page }) => {
    const k = sahteKitap({ ad: 'Siyaset Kitabı', tur: 'Siyaset-Politika' });
    await tohumla(page, [k, sahteKitap({ ad: 'Anı Kitabı', tur: 'Anı-Mektup-Günlük' })]);
    await rafAc(page);
    await page.click(`#liste .kart[data-id="${k.id}"]`);
    await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
    await expect(page.locator('#dKunyeBlok')).toContainText('Siyaset');
    await expect(page.locator('#dKunyeBlok')).not.toContainText('Siyaset-Politika');
    await page.click('#dDigerKatla summary');
    await page.click('#ortuDetay [data-act="duzenle"]');
    await expect(page.locator('#f-tur')).toHaveValue('Siyaset-Politika');
    const depo = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1'))
      .kitaplar.map(x => x.tur).sort());
    expect(depo, 'değerler göç etmedi').toEqual(['Anı-Mektup-Günlük', 'Siyaset-Politika']);
  });
});
