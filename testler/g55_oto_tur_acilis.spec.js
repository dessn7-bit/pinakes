'use strict';
/* G55 — AÇILIŞ TARAMASI: tür ARKA PLANDA kendiliğinden dolar (v66).

   SÖZLEŞMELER (bu dosyanın koruduğu):
   - Uygulama açılınca türü BOŞ kitaplar için tarama KENDİLİĞİNDEN başlar
     (kullanıcı eylemi yok); önizleme/onay yok, bulunan doğrudan yazılır ve
     k.g senkron damgası basılır.
   - AÇILIŞI GECİKTİRMEZ: ilk çizim/etkileşim ağ işinden ÖNCE biter (tarama
     OTO_BASLANGIC_MS gecikmeli), ilerleme çubuğu dayatılmaz.
   - ELLE girilen tür sorgulanmaz, ezilmez, geri-alma listesine girmez.
   - DENENDİ DEFTERİ (cihaz-yerel kk_zg_oto_deneme_v1): bulunamayan kitap da
     damgalanır, 90 gün yeniden sorulmaz — kota her açılışta yanmaz.
   - OTURUM SINIRI: en çok N kitap/oturum (üründe 60; test kancası
     window.__KK_OTO_SINIR), kalan sonraki açılışa.
   - İki Google isteği arası ≥ ARALIK_MS (650).
   - GERİ ALMA: otomatik atananlar Ayarlar ▸ Katalog araçları kartında
     listelenir; tek tek ve toplu geri alınır; geri alınan kitap veri.turRed
     union'ına girer (SENKRONLU — kesfetGizli deseni) ve bir daha otomatik
     doldurulmaz.
   - AĞ HATASI: art arda 3 hata → sessizce durur, hata alan kitaba damga
     BASILMAZ, sonraki açılışta kaldığı yerden sürer.
   - yardim.js tohumla v66 GÖÇÜ: eski vakaların kitapları varsayılan
     "denendi" defteriyle gelir (tarama gürültüsü sayaç iddialarını bozmasın);
     bu dosya kk_zg_oto_deneme_v1: null senteliyle taramayı GERÇEKTEN koşturur.

   (Mutasyon 1: otoIsle'deki denemeDamgala çağrısı kaldırılır → tekrar-sorgu
    ve oturum-sınırı vakaları kırmızı.
    Mutasyon 2: otoIsle'deki atanan kaydı kaldırılır → geri alma vakaları
    kırmızı.) */
const { test, expect, tohumla, sahteKitap, ayarlarAc } = require('./yardim');

const TURLER = [
  { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
  { seo: 'Siir', ad: 'Şiir', kitapSayisi: 5000 }
];
function vol(ad, kategoriler) {
  const v = { title: ad, authors: ['Y'] };
  if (kategoriler) v.categories = kategoriler;
  return { volumeInfo: v };
}
/* Taramayı gerçekten koşturan tohum: deneme defteri sentinelle KAPALI. */
async function tohumlaTara(page, kitaplar, ekstra) {
  await tohumla(page, kitaplar, Object.assign({ kk_zg_oto_deneme_v1: null }, ekstra || {}));
}
function kitapTur(page, ad) {
  return page.evaluate(a => {
    const k = veri.kitaplar.find(x => x.ad === a);
    return k ? k.tur : '(kitap yok)';
  }, ad);
}

test.describe('G55 açılış taraması — tür arka planda kendiliğinden', () => {

  test('açılışta kendiliğinden başlar (eylem YOK); bulunan tür doğrudan yazılır + damga', async ({ page }) => {
    const k1 = sahteKitap({ ad: 'Kitap Bir' }), k2 = sahteKitap({ ad: 'Kitap İki' });
    await tohumlaTara(page, [k1, k2]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Kitap Bir', ['Fiction']), vol('Kitap İki', ['Poetry'])] };
    await page.goto('/');   // TEK eylem: açmak — hiçbir tıklama yok
    await expect.poll(() => kitapTur(page, 'Kitap Bir'), { timeout: 15000 }).toBe('Roman');
    await expect.poll(() => kitapTur(page, 'Kitap İki'), { timeout: 15000 }).toBe('Şiir');
    const damgalar = await page.evaluate(() => veri.kitaplar.map(k => k.g));
    damgalar.forEach(g => expect(g, 'senkron damgası basıldı').toBeGreaterThan(0));
    // yazım kalıcı: depoya da düştü
    const depo = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1')));
    expect(depo.kitaplar.map(k => k.tur).sort()).toEqual(['Roman', 'Şiir']);
  });

  test('ELLE girilmiş tür: sorgulanmaz, ezilmez, geri-alma listesine girmez', async ({ page }) => {
    const dolu = sahteKitap({ ad: 'Dolu Kitap', tur: 'Anı' });
    const bos = sahteKitap({ ad: 'Boş Kitap' });
    await tohumlaTara(page, [dolu, bos]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Dolu Kitap', ['Fiction']), vol('Boş Kitap', ['Fiction'])] };
    await page.goto('/');
    await expect.poll(() => kitapTur(page, 'Boş Kitap'), { timeout: 15000 }).toBe('Roman');
    expect(await kitapTur(page, 'Dolu Kitap')).toBe('Anı');
    expect(page.__agSayac.google, 'yalnız türü boş kitap sorgulandı').toBe(1);
    const atanan = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_zg_oto_atanan_v1') || '{}'));
    expect(Object.keys(atanan), 'defterde yalnız otomatik yazılan var').toEqual([bos.id]);
  });

  test('denenen-bulunamayan kitap İKİNCİ açılışta TEKRAR sorulmaz', async ({ page }) => {
    await tohumlaTara(page, [sahteKitap({ ad: 'Kategorisiz Kitap' })]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Kategorisiz Kitap')] };   // kategori YOK → bulunamaz
    await page.goto('/');
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(1);
    // sorgu tamamlandı, tür yok → denendi damgası düştü
    await expect.poll(() => page.evaluate(() =>
      Object.keys(JSON.parse(localStorage.getItem('kk_zg_oto_deneme_v1') || '{}')).length)).toBe(1);
    expect(await kitapTur(page, 'Kategorisiz Kitap')).toBe('');
    // ikinci açılış: tarama penceresi geçse de YENİ istek yok (sayaç Node tarafında yaşar)
    await page.reload();
    await page.waitForTimeout(3500);
    expect(page.__agSayac.google, 'denenmiş kitap yeniden sorulmadı').toBe(1);
  });

  test('oturum üst sınırı uygulanır; kalan SONRAKİ açılışta işlenir', async ({ page }) => {
    await page.addInitScript(() => { window.__KK_OTO_SINIR = 2; });   // test kancası
    await tohumlaTara(page, [sahteKitap({ ad: 'S1' }), sahteKitap({ ad: 'S2' }), sahteKitap({ ad: 'S3' })]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('S1'), vol('S2'), vol('S3')] };   // hepsi kategorisiz
    await page.goto('/');
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(2);
    await page.waitForTimeout(1200);
    expect(page.__agSayac.google, 'oturumda en çok 2 kitap').toBe(2);
    // ikinci açılış: yalnız KALAN 1 kitap sorulur
    await page.reload();
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(3);
    await page.waitForTimeout(1200);
    expect(page.__agSayac.google, 'kalan tek kitap soruldu, denenmişler atlandı').toBe(3);
  });

  test('istekler arası aralık ≥650ms (kota nezaketi)', async ({ page }) => {
    const zamanlar = [];
    await tohumlaTara(page, [sahteKitap({ ad: 'A1' }), sahteKitap({ ad: 'A2' })]);
    page.__agAyar.turler = TURLER;
    await page.route(u => u.href.includes('googleapis.com/books'), async route => {
      zamanlar.push(Date.now());
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ totalItems: 0, items: [] }) });
    });
    await page.goto('/');
    await expect.poll(() => zamanlar.length, { timeout: 15000 }).toBe(2);
    expect(zamanlar[1] - zamanlar[0], 'iki istek arası en az ~650ms').toBeGreaterThanOrEqual(600);
  });

  test('otomatik atananlar KARTTA listelenir; TEK TEK geri alma çalışır', async ({ page }) => {
    const k1 = sahteKitap({ ad: 'Geri Bir' }), k2 = sahteKitap({ ad: 'Geri İki' });
    await tohumlaTara(page, [k1, k2]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Geri Bir', ['Fiction']), vol('Geri İki', ['Poetry'])] };
    await page.goto('/');
    await expect.poll(() => kitapTur(page, 'Geri İki'), { timeout: 15000 }).toBe('Şiir');
    await expect.poll(() => kitapTur(page, 'Geri Bir'), { timeout: 15000 }).toBe('Roman');
    await ayarlarAc(page);
    await expect(page.locator('#zgOtoKart')).toBeVisible();
    await expect(page.locator('#zgOtoSayi')).toHaveText('2');
    await page.click('[data-act="zg-oto-liste"]');
    await expect(page.locator('#zgOtoOrtu .zg-onizle-satir')).toHaveCount(2);
    // tek geri al: satırdaki ✕
    await page.click('#zgOtoOrtu .zg-onizle-satir:has-text("Geri Bir") [data-act="zg-oto-geri"]');
    await expect(page.locator('#toast')).toContainText('geri alındı');
    await expect(page.locator('#zgOtoOrtu .zg-onizle-satir')).toHaveCount(1);
    await expect(page.locator('#zgOtoSayi')).toHaveText('1');
    const d = await page.evaluate(id => ({
      tur: veri.kitaplar.find(x => x.ad === 'Geri Bir').tur,
      red: !!(veri.turRed || {})[id] }), k1.id);
    expect(d.tur, 'tür boşaldı').toBe('');
    expect(d.red, 'kalıcı red kaydı düştü (senkronlu union)').toBe(true);
  });

  test('TOPLU geri alma: tüm otomatik türler tek dokunuşta geri alınır', async ({ page }) => {
    const k1 = sahteKitap({ ad: 'Toplu Bir' }), k2 = sahteKitap({ ad: 'Toplu İki' });
    await tohumlaTara(page, [k1, k2]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Toplu Bir', ['Fiction']), vol('Toplu İki', ['Poetry'])] };
    await page.goto('/');
    await expect.poll(() => kitapTur(page, 'Toplu İki'), { timeout: 15000 }).toBe('Şiir');
    await expect.poll(() => kitapTur(page, 'Toplu Bir'), { timeout: 15000 }).toBe('Roman');
    await ayarlarAc(page);
    await page.click('[data-act="zg-oto-liste"]');
    await page.click('[data-act="zg-oto-geri-tum"]');
    await expect(page.locator('#zgOtoOrtu .zg-onizle-satir')).toHaveCount(0);
    await expect(page.locator('#zgOtoSayi')).toHaveText('0');
    const d = await page.evaluate(() => ({
      turler: veri.kitaplar.map(k => k.tur),
      redSayi: Object.keys(veri.turRed || {}).length }));
    expect(d.turler).toEqual(['', '']);
    expect(d.redSayi).toBe(2);
  });

  test('geri alınan kitap TEKRAR otomatik doldurulmaz; turRed senkron union', async ({ page }) => {
    const k = sahteKitap({ ad: 'Reddedilen Kitap' });
    await tohumlaTara(page, { kitaplar: [k], hedef: {}, turRed: { [k.id]: Date.now() } });
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Reddedilen Kitap', ['Fiction'])] };
    await page.goto('/');
    await page.waitForTimeout(3500);   // tarama penceresi geçti
    expect(page.__agSayac.google, 'reddedilen kitap için sorgu YOK').toBe(0);
    expect(await kitapTur(page, 'Reddedilen Kitap')).toBe('');
    // senkron birleşimi UNION: iki cihazın redleri birleşir, silinmez
    const bir = await page.evaluate(() => window.__senkron.birlestir(
      { kitaplar: [], turRed: { a: 5 } },
      { kitaplar: [], turRed: { b: 7 } }));
    expect(bir.turRed).toEqual({ a: 5, b: 7 });
  });

  test('AĞ HATASI: sessizce durur, hata alan kitaba damga BASILMAZ, sonraki açılışta sürer', async ({ page }) => {
    const hatalar = [];
    page.on('pageerror', e => hatalar.push(String(e)));
    const adlar = ['H1', 'H2', 'H3', 'H4'];
    await tohumlaTara(page, adlar.map(ad => sahteKitap({ ad })));
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = 'hata';
    await page.goto('/');
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(3);
    await page.waitForTimeout(1200);
    expect(page.__agSayac.google, 'art arda 3 hata → durdu, 4. istek yok').toBe(3);
    expect(await page.evaluate(() =>
      Object.keys(JSON.parse(localStorage.getItem('kk_zg_oto_deneme_v1') || '{}')).length),
      'hata alan kitaba denendi damgası basılmadı').toBe(0);
    expect(hatalar, 'çökme yok').toEqual([]);
    // uygulama yaşıyor: sekme geçişi çalışıyor (fab yalnız Kütüphane'de görünür)
    await page.click('nav [data-act="sekme"][data-v="raf"]');
    await expect(page.locator('.fab[data-act="yeni"]')).toBeVisible();
    // kaynak düzeldi: sonraki açılış kaldığı yerden — 4 kitap da dolar
    page.__agAyar.google = { items: adlar.map(ad => vol(ad, ['Fiction'])) };
    await page.reload();
    for (const ad of adlar)
      await expect.poll(() => kitapTur(page, ad), { timeout: 20000 }).toBe('Roman');
  });

  test('AÇILIŞI GECİKTİRMEZ: uygulama ağ işinden önce çizilir ve etkileşimlidir', async ({ page }) => {
    await tohumlaTara(page, [sahteKitap({ ad: 'G1' }), sahteKitap({ ad: 'G2' })]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('G1', ['Fiction']), vol('G2', ['Poetry'])] };
    await page.goto('/');
    // açılış tamam (Ana Sayfa nav'ı çizildi), tarama HENÜZ başlamadı: dış istek yok
    await expect(page.locator('nav [data-act="sekme"][data-v="raf"]')).toBeVisible();
    expect(page.__agSayac.google + page.__agSayac.turler,
      'ilk çizim ağ işinden önce bitti — açılış tarama beklemedi').toBe(0);
    // uygulama etkileşimli: sekme geçişi çalışıyor
    await page.click('nav [data-act="sekme"][data-v="raf"]');
    await expect(page.locator('#panel-raf')).toHaveClass(/active/);
    await expect(page.locator('.fab[data-act="yeni"]')).toBeVisible();
    // ve tarama az sonra KENDİLİĞİNDEN başlayıp bitiriyor
    await expect.poll(() => kitapTur(page, 'G1'), { timeout: 15000 }).toBe('Roman');
  });

  test('elle zenginleştirme yolu korunur; metin türün kendiliğinden dolduğunu söyler', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Elle Yol' })]);
    await page.goto('/');
    await ayarlarAc(page);
    await expect(page.locator('#ayBolumZengin [data-act="zg-tara"]')).toBeVisible();   // "şimdi tara" duruyor
    // v82: bölüme taslak-özet notu eklendi → iddia TARAMA notuna (ilk) kapsanır
    await expect(page.locator('#ayBolumZengin .ay-not').first()).toContainText('kendiliğinden');
    await expect(page.locator('#zgOtoKart .ay-baslik')).toHaveText('Otomatik tür');
  });
});
