'use strict';
/* G88 — TÜR GÖRÜNEN ADI + GERİ ALMA DEFTERİ (v91).

   SÖZLEŞMELER (bu dosyanın koruduğu):
   A) "Bilim-Teknoloji-Mühendislik" EKRANDA "Bilim" görünür; k.tur DEĞERİ
      taksonominin kendi adı olarak KALIR (otomatik tür motoru, içe aktarım
      taksonomi kapısı, Keşfet tür rafı bu ada eşler — değer kısaltılsaydı
      1000Kitap doğrulaması kırılırdı). Form alanı (f-tur) ham değeri
      gösterir: değerin kendisinin düzenlendiği tek yer orası.
   B) turRed KALICI değil artık: veri.turRedGeri (senkronlu öz-damgalı union,
      kesfetGizliGeri deseni) reddin geri almasını taşır. Etkin red = red
      damgası > geri damgası. Ayarlar ▸ Otomatik tür ▸ "Geri alınanlar (N)"
      defteri listeler; yol defter BOŞKEN görünmez. "Tekrar dene" kitabı
      defterden çıkarır + yerel deneme damgasını düşürür (sonraki tarama 90
      gün beklemeden yeniden sorar) — tür KENDİLİĞİNDEN DOLMAZ. "Defteri
      temizle" onay ister. Yedek al/geri yükle iki haritayı da taşır.

   (Mutasyon 1: redAktif geri damgasını yok sayarsa → tekrar-dene ve
    sonraki-tarama vakaları kırmızı.
    Mutasyon 2: turGoster eşlemesi kaldırılırsa → görünen-ad vakaları
    kırmızı.) */
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc } = require('./yardim');

const BTM = 'Bilim-Teknoloji-Mühendislik';
const TURLER = [
  { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
  { seo: 'Bilim-Teknoloji-Muhendislik', ad: BTM, kitapSayisi: 2110 }
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

test.describe('G88-A tür görünen adı — değer taksonomi adı, ekran kısa', () => {

  test('künyede "Bilim" görünür; k.tur ve depo TAM adı korur; form ham değeri gösterir', async ({ page }) => {
    const k = sahteKitap({ ad: 'Kozmos', tur: BTM });
    await tohumla(page, [k]);
    await rafAc(page);
    await page.click('#liste .kart');
    await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
    const kunye = page.locator('#dKunyeBlok');
    await expect(kunye).toContainText('Bilim');
    await expect(kunye).not.toContainText(BTM);
    // değer katmanı: bellek + depo TAM adı taşır (göç/yeniden-adlandırma YOK)
    expect(await kitapTur(page, 'Kozmos')).toBe(BTM);
    const depo = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1')));
    expect(depo.kitaplar[0].tur).toBe(BTM);
    // form ham değeri gösterir: tür alanının düzenlendiği tek yüzey
    await page.click('#dDigerKatla summary');   // Düzenle nadir bölümde katlı
    await page.click('#ortuDetay [data-act="duzenle"]');
    await expect(page.locator('#f-tur')).toHaveValue(BTM);
  });

  test('1000Kitap doğrulaması ÇALIŞIYOR: otomatik tarama TAM adı yazar, listede "Bilim" gösterir', async ({ page }) => {
    const k = sahteKitap({ ad: 'Evrenin Dokusu' });
    await tohumlaTara(page, [k]);
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Evrenin Dokusu', ['Science'])] };
    await page.goto('/');
    // taksonomi kapısı TAM adla eşleşti → yazılan değer taksonominin kendi adı
    await expect.poll(() => kitapTur(page, 'Evrenin Dokusu'), { timeout: 15000 }).toBe(BTM);
    // otomatik atananlar listesi görünen adı kullanır
    await ayarlarAc(page);
    await page.click('[data-act="zg-oto-liste"]');
    const satir = page.locator('#zgOtoOrtu .zg-onizle-satir');
    await expect(satir).toHaveCount(1);
    await expect(satir).toContainText('Tür: Bilim');
    await expect(satir).not.toContainText(BTM);
  });
});

test.describe('G88-B geri alma defteri — red artık kalıcı değil', () => {

  test('defter DOLU: yol görünür; "Tekrar dene" defterden çıkarır; SONRAKİ taramada aday olur', async ({ page }) => {
    const k = sahteKitap({ ad: 'Defter Kitabı' });
    await tohumla(page, { kitaplar: [k], hedef: {}, turRed: { [k.id]: Date.now() } });
    page.__agAyar.turler = TURLER;
    page.__agAyar.google = { items: [vol('Defter Kitabı', ['Fiction'])] };
    await page.goto('/');
    await page.waitForTimeout(3500);   // tarama penceresi geçti
    expect(page.__agSayac.google, 'redli kitap için sorgu YOK').toBe(0);
    await ayarlarAc(page);
    await expect(page.locator('#zgRedYol')).toBeVisible();
    await expect(page.locator('#zgRedSayi')).toHaveText('1');
    await page.click('[data-act="zg-red-liste"]');
    const satir = page.locator('#zgRedOrtu .zg-onizle-satir');
    await expect(satir).toHaveCount(1);
    await expect(satir).toContainText('Defter Kitabı');
    // arayüz türün kendiliğinden DOLMAYACAĞINI söyler
    await expect(page.locator('#zgRedOrtuGovde .zg-not')).toContainText('KENDİLİĞİNDEN DOLMAZ');
    await page.click('[data-act="zg-red-dene"]');
    await expect(page.locator('#toast')).toContainText('Defterden çıkarıldı');
    const d = await page.evaluate(id => ({
      geri: (veri.turRedGeri || {})[id] || 0,
      red: (veri.turRed || {})[id] || 0,
      aktif: window.__zengin.redAktif(id),
      deneme: JSON.parse(localStorage.getItem('kk_zg_oto_deneme_v1') || '{}')[id] || null,
      tur: veri.kitaplar[0].tur
    }), k.id);
    expect(d.geri, 'geri damgası basıldı (senkronlu — silme union\'dan dirilirdi)').toBeGreaterThan(0);
    expect(d.geri).toBeGreaterThan(d.red);
    expect(d.aktif, 'etkin red düştü').toBe(false);
    expect(d.deneme, 'deneme damgası düştü — 90 gün beklenmez').toBe(null);
    expect(d.tur, 'tür KENDİLİĞİNDEN dolmadı').toBe('');
    // liste boş durumuna döner, yol gizlenir
    await expect(page.locator('#zgRedOrtuGovde')).toContainText('Defter boş');
    await expect(page.locator('#zgRedYol')).toBeHidden();
    // SONRAKİ açılış: kitap yeniden aday — sorgu atılır ve tür dolar
    await page.reload();
    await expect.poll(() => page.__agSayac.google, { timeout: 15000 }).toBe(1);
    await expect.poll(() => kitapTur(page, 'Defter Kitabı'), { timeout: 15000 }).toBe('Roman');
  });

  test('defter BOŞKEN yol hiç görünmez; geri-alma diyaloğu dönüş yolunu söyler', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Sade Kitap' })]);
    await page.goto('/');
    await ayarlarAc(page);
    await expect(page.locator('#zgOtoKart')).toBeVisible();
    await expect(page.locator('#zgRedYol')).toBeHidden();
    // kart metni: red artık dönüşsüz anlatılmıyor
    await expect(page.locator('#zgOtoKart .ay-not')).toContainText('defterden çıkarmadıkça');
  });

  test('"Defteri temizle" ONAY ister: vazgeçilirse dokunmaz, onaylanırsa boşaltır', async ({ page }) => {
    const k1 = sahteKitap({ ad: 'Temiz Bir' }), k2 = sahteKitap({ ad: 'Temiz İki' });
    const simdi = Date.now();
    await tohumla(page, { kitaplar: [k1, k2], hedef: {},
      turRed: { [k1.id]: simdi, [k2.id]: simdi } });
    const sorular = [];
    let kabul = false;
    page.on('dialog', d => { sorular.push(d.message()); kabul ? d.accept() : d.dismiss(); });
    await page.goto('/');
    await ayarlarAc(page);
    await page.click('[data-act="zg-red-liste"]');
    await expect(page.locator('#zgRedOrtu .zg-onizle-satir')).toHaveCount(2);
    // 1) vazgeç: defter DURUYOR
    await page.click('[data-act="zg-red-temizle"]');
    expect(sorular.length).toBe(1);
    expect(sorular[0]).toContain('çıkarılsın mı');
    await expect(page.locator('#zgRedOrtu .zg-onizle-satir')).toHaveCount(2);
    // 2) onayla: defter boşalır, yol gizlenir
    kabul = true;
    await page.click('[data-act="zg-red-temizle"]');
    await expect(page.locator('#zgRedOrtuGovde')).toContainText('Defter boş');
    await expect(page.locator('#zgRedYol')).toBeHidden();
    const kalan = await page.evaluate(() => window.__zengin.redListesi().length);
    expect(kalan).toBe(0);
  });

  test('senkron birleşimi: turRedGeri UNION; etkin red = red damgası > geri damgası', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Union Kitabı' })]);
    await page.goto('/');
    const bir = await page.evaluate(() => window.__senkron.birlestir(
      { kitaplar: [], turRed: { a: 5 }, turRedGeri: { a: 9, x: 3 } },
      { kitaplar: [], turRed: { b: 7 }, turRedGeri: { x: 6 } }));
    expect(bir.turRed).toEqual({ a: 5, b: 7 });
    expect(bir.turRedGeri, 'geri haritası da union — büyük damga kazanır').toEqual({ a: 9, x: 6 });
    const etkin = await page.evaluate(() => {
      veri.turRed = { eski: 10, taze: 30 };
      veri.turRedGeri = { eski: 20, taze: 5 };
      return { eski: window.__zengin.redAktif('eski'), taze: window.__zengin.redAktif('taze') };
    });
    expect(etkin.eski, 'geri damgası yeni → red hükümsüz').toBe(false);
    expect(etkin.taze, 'red damgası yeni → red sürer').toBe(true);
  });

  test('yedek al / geri yükle: tür alanı + defter (turRed ve turRedGeri) doğru döner', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Yerel Kitap' })]);
    await page.goto('/');
    const yedek = await page.evaluate(() => {
      // yedek gövdesi disaAktar ile AYNI kaynak: ...veri (turRed/turRedGeri dahil)
      veri.turRed = { r1: 100 };
      veri.turRedGeri = { r1: 200 };
      veri.kitaplar[0].tur = 'Bilim-Teknoloji-Mühendislik';
      depoKaydet();
      return JSON.parse(JSON.stringify({ surum: 2, ...veri, ozetler: [] }));
    });
    expect(yedek.turRed, 'defter yedeğe girer').toEqual({ r1: 100 });
    expect(yedek.turRedGeri, 'çıkarmalar yedeğe girer').toEqual({ r1: 200 });
    // defterleri boşalt (kitaba DOKUNMA — iceAktar mevcut kitabı mükerrer
    // korumasıyla atlar, alanlarını yedekten yazmaz; kitap alanı için iddia
    // "kaybolmamış" olmalı), sonra yedeği içe aktar
    await page.evaluate(() => { veri.turRed = {}; veri.turRedGeri = {}; depoKaydet(); });
    await page.evaluate(y =>
      iceAktar(new File([JSON.stringify(y)], 'yedek.json', { type: 'application/json' })), yedek);
    await expect.poll(() => page.evaluate(() => (veri.turRed || {}).r1 || 0)).toBe(100);
    const sonuc = await page.evaluate(() => ({
      geri: (veri.turRedGeri || {}).r1 || 0,
      n: veri.kitaplar.length,
      tur: (veri.kitaplar.find(k => k.ad === 'Yerel Kitap') || {}).tur,
      depo: JSON.parse(localStorage.getItem('kk_kitaplik_v1')).turRedGeri
    }));
    expect(sonuc.geri, 'defterden çıkarmalar yedekten döner').toBe(200);
    expect(sonuc.n, 'mükerrer kitap eklenmedi').toBe(1);
    expect(sonuc.tur, 'tür alanı TAM adla duruyor — kayıp yok').toBe('Bilim-Teknoloji-Mühendislik');
    expect(sonuc.depo).toEqual({ r1: 200 });
  });
});
