'use strict';
const { test, expect, tohumla, sahteKitap,
  onaylariKabulEt, rafAc, rafYenile, ayarlarAc, dosyadanYukle, jsonDosya } = require('./yardim');

/* G12 — keşif raporunun kritik veri/güvenlik maddeleri (M1-M5).
   Her vaka, düzeltme geri alındığında KIRMIZI olacak şekilde yazıldı. */

/* Kapakları bilerek düşüren yönlendirme: onerror yolunu tetikler */
async function kapaklariBoz(page) {
  await page.route(url => /ornek\.gecersiz/.test(url.href), route => route.abort('failed'));
}
async function izgaraAc(page) {
  await page.addInitScript(() =>
    localStorage.setItem('kk_gorunum_v1', JSON.stringify({ izgara: true })));
}

test.describe('G12 M1 — ızgara kapak yedeği (XSS)', () => {

  test('kötü adlı kitap + bozuk kapak: kitap adından KOD ÇALIŞMAZ', async ({ page }) => {
    const kotuAd = "a';window.__X=true;'";
    await kapaklariBoz(page);
    await izgaraAc(page);
    await tohumla(page, [sahteKitap({ ad: kotuAd, kapak: 'https://ornek.gecersiz/k.jpg' })]);
    await rafAc(page);
    await expect(page.locator('#liste')).toHaveClass(/izgara/);
    await expect(page.locator('#liste .iz-yedek')).toHaveCount(1, { timeout: 10000 });
    expect(await page.evaluate(() => window.__X)).toBeUndefined();
    // ad, kod olarak değil METİN olarak durmalı
    await expect(page.locator('#liste .iz-yedek')).toHaveText(kotuAd);
  });

  test('apostroflu ad + bozuk kapak: yedek sırt çizilir ve ad doğru görünür', async ({ page }) => {
    const hatalar = [];
    page.on('pageerror', h => hatalar.push(String(h)));
    await kapaklariBoz(page);
    await izgaraAc(page);
    await tohumla(page, [sahteKitap({ ad: "Istanbul'un Fethi", kapak: 'https://ornek.gecersiz/k.jpg' })]);
    await rafAc(page);
    await expect(page.locator('#liste .iz-yedek')).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('#liste .iz-yedek')).toHaveText("Istanbul'un Fethi");
    await expect(page.locator('#liste img.iz-kapak')).toHaveCount(0); // kırık resim kalmadı
    expect(hatalar).toEqual([]); // eskiden SyntaxError üretiyordu
  });

  test('sağlam kapakta davranış değişmez: resim kalır, yedek çizilmez', async ({ page }) => {
    await izgaraAc(page);
    await tohumla(page, [sahteKitap({ ad: 'Kapaklı Kitap', kapak: 'https://books.google.com/x.png' })]);
    await rafAc(page);
    await expect(page.locator('#liste img.iz-kapak')).toHaveCount(1);
    await page.waitForTimeout(300);
    await expect(page.locator('#liste .iz-yedek')).toHaveCount(0);
  });
});

test.describe('G12 M2 — mezar taşları yenilemede korunur', () => {

  test('kitabı sil → yenile → mezar taşı hâlâ depoda', async ({ page }) => {
    onaylariKabulEt(page);
    const k = sahteKitap({ ad: 'Silinecek Kitap', g: 1000 });
    await tohumla(page, [k]);
    await rafAc(page);
    await page.click('#liste .kart');
    await page.click('#dDigerKatla summary');  // Sil nadir bölümde katlı
    await page.click('[data-act="kitap-sil"]');
    await expect(page.locator('#toast')).toContainText('Kitap silindi');
    await rafYenile(page);
    const mezarlar = await page.evaluate(() => Object.keys(veri.silinenler || {}));
    expect(mezarlar).toContain(k.id);
  });

  test('yenileme sonrası uzak kopyayla birleştirme: silinen kitap GERİ GELMEZ', async ({ page }) => {
    onaylariKabulEt(page);
    const k = sahteKitap({ ad: 'Dirilmeyecek Kitap', g: 1000 });
    await tohumla(page, [k]);
    await rafAc(page);
    await page.click('#liste .kart');
    await page.click('#dDigerKatla summary');  // Sil nadir bölümde katlı
    await page.click('[data-act="kitap-sil"]');
    await expect(page.locator('#toast')).toContainText('Kitap silindi');
    await rafYenile(page);
    const adlar = await page.evaluate(kid => window.__senkron.birlestir(veri,
      { kitaplar: [{ id: kid, ad: 'Dirilmeyecek Kitap', yazar: 'Y', g: 1000 }], silinenler: {} }
    ).kitaplar.map(x => x.ad), k.id);
    expect(adlar).toEqual([]);
  });

  test('hedefG yenilemede korunur, yeniden damgalanmaz', async ({ page }) => {
    await tohumla(page, { kitaplar: [sahteKitap({ ad: 'Hedefli', g: 500 })],
      hedef: { 2026: 30 }, hedefG: { 2026: 4242 }, silinenler: {} });
    await rafAc(page);
    expect(await page.evaluate(() => veri.hedefG['2026'])).toBe(4242);
    await rafYenile(page);
    expect(await page.evaluate(() => veri.hedefG['2026'])).toBe(4242);
  });

  test('bozuk damga haritası uygulamayı düşürmez (tip doğrulaması)', async ({ page }) => {
    await tohumla(page, { kitaplar: [sahteKitap({ ad: 'Sağlam' })],
      hedef: {}, hedefG: 'bozuk', silinenler: { iyi: 123, kotu: 'metin', sifir: 0 } });
    await rafAc(page);
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    const s = await page.evaluate(() => ({ hedefG: veri.hedefG, silinenler: veri.silinenler }));
    expect(s.hedefG).toEqual({});
    expect(s.silinenler).toEqual({ iyi: 123 }); // sayısal olmayan/0 elendi
  });
});

test.describe('G12 M3 — detaydan Düzenle formu görünür', () => {

  test('Düzenle formu detayın üstünde açılır ve doldurulabilir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Düzenlenecek', yazar: 'Yazar A' })]);
    await rafAc(page);
    await page.click('#liste .kart');
    await page.click('#dDigerKatla summary');  // Düzenle nadir bölümde katlı
    await page.click('[data-act="duzenle"]');
    await expect(page.locator('#ortuForm')).toHaveClass(/acik/);
    await expect(page.locator('#f-ad')).toHaveValue('Düzenlenecek');
    // isabet testi: detay araya girmeden alan doldurulabilmeli
    await page.fill('#f-ad', 'Düzenlendi');
    await page.click('[data-act="form-kaydet"]');
    await expect(page.locator('#toast')).toContainText('Kitap güncellendi');
    expect(await page.evaluate(() => veri.kitaplar[0].ad)).toBe('Düzenlendi');
  });
});

test.describe('G12 M4 — yedek geri yüklemede id çakışması', () => {

  test('adı değiştirilmiş kitabın eski yedeği: güncel kayıt KAYBOLMAZ', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'ABC', ad: 'Yeni Ad', yazar: 'Y', g: 2000 })]);
    await rafAc(page);
    await ayarlarAc(page);
    const yedek = JSON.stringify({ surum: 2,
      kitaplar: [{ id: 'ABC', ad: 'Eski Ad', yazar: 'Y', g: 1000 }], hedef: {} });
    await dosyadanYukle(page, jsonDosya(yedek, 'y.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('1 kitap geri yüklendi');
    const idler = await page.evaluate(() => veri.kitaplar.map(k => k.id));
    expect(new Set(idler).size).toBe(idler.length); // id'ler benzersiz
    // birleştirme sonrası GÜNCEL kayıt hayatta kalmalı
    const adlar = await page.evaluate(() =>
      window.__senkron.birlestir(veri, { kitaplar: [], silinenler: {} }).kitaplar.map(k => k.ad));
    expect(adlar).toContain('Yeni Ad');
    expect(adlar).toContain('Eski Ad');
  });

  test('aynı id farklı kitap → yeni id ile eklenir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'DUP', ad: 'Kitap Bir', yazar: 'Yazar Bir' })]);
    await rafAc(page);
    await ayarlarAc(page);
    const yedek = JSON.stringify({ surum: 2,
      kitaplar: [{ id: 'DUP', ad: 'Kitap İki', yazar: 'Yazar İki' }], hedef: {} });
    await dosyadanYukle(page, jsonDosya(yedek, 'y.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('1 kitap geri yüklendi');
    const ks = await page.evaluate(() => veri.kitaplar.map(k => ({ id: k.id, ad: k.ad })));
    expect(ks.length).toBe(2);
    expect(ks.filter(k => k.id === 'DUP').length).toBe(1);
    expect(ks.find(k => k.ad === 'Kitap İki').id).not.toBe('DUP');
  });

  test('tamamen aynı kayıt → mükerrer oluşmaz', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'SAME', ad: 'Aynı Kitap', yazar: 'Aynı Yazar' })]);
    await rafAc(page);
    await ayarlarAc(page);
    const yedek = JSON.stringify({ surum: 2,
      kitaplar: [{ id: 'SAME', ad: 'Aynı Kitap', yazar: 'Aynı Yazar' }], hedef: {} });
    await dosyadanYukle(page, jsonDosya(yedek, 'y.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('Yeni kitap yok');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(1);
  });
});

test.describe('G12 M5 — depo şişmesi ve kota uyarısı', () => {

  test('anlık görüntü kütüphane JSON\'unun %20\'sinden küçük', async ({ page }) => {
    const kitaplar = Array.from({ length: 60 }, (_, i) => sahteKitap({
      ad: 'Ölçüm Kitabı ' + i + ' — uzunca bir alt başlıkla',
      yazar: 'Yazar ' + i, yayinevi: 'Yayınevi ' + i, sayfa: 300 + i,
      notlar: [{ id: 'n' + i, tip: 'alinti',
        metin: 'Gerçekçi uzunlukta bir alıntı metni; parmak izi boyutunu asıl şişiren şey buydu. '.repeat(3),
        tarih: '2026-08-01', sayfa: 20, fikir: [] }]
    }));
    await tohumla(page, kitaplar);
    await rafAc(page);
    await page.click('#liste .kart');       // bir kayıt tetikle → damgala + anlık görüntü yazılsın
    await page.click('[data-act="detay-kapat"]');
    await page.evaluate(() => depoKaydet());
    const olcu = await page.evaluate(() => ({
      depo: (localStorage.getItem('kk_kitaplik_v1') || '').length,
      anlik: (localStorage.getItem('kk_senkron_anlik_v1') || '').length
    }));
    expect(olcu.anlik).toBeGreaterThan(0);
    expect(olcu.anlik / olcu.depo).toBeLessThan(0.2);
  });

  test('hash damgalaması doğru: değişen kitap yeni g alır, değişmeyen sabit kalır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'A', ad: 'Değişecek', g: 111 }),
      sahteKitap({ id: 'B', ad: 'Sabit Kalacak', g: 222 })]);
    await rafAc(page);
    await page.evaluate(() => depoKaydet());   // taban anlık görüntü
    const taban = await page.evaluate(() => veri.kitaplar.map(k => k.g));
    await page.evaluate(() => {
      veri.kitaplar.find(k => k.id === 'A').sayfa = 999;   // yalnız A değişti
      depoKaydet();
    });
    const sonra = await page.evaluate(() => ({
      A: veri.kitaplar.find(k => k.id === 'A').g,
      B: veri.kitaplar.find(k => k.id === 'B').g
    }));
    expect(sonra.A).toBeGreaterThan(taban[0]);  // değişen damgalandı
    expect(sonra.B).toBe(taban[1]);             // değişmeyen sabit
  });

  test('v1 anlık görüntüsünden göç: tüm kütüphane yeniden damgalanmaz', async ({ page }) => {
    const a = sahteKitap({ id: 'G1', ad: 'Göç Kitabı', g: 777 });
    await tohumla(page, [a], {
      // eski biçim: kitabın TAM JSON'u parmak izi olarak
      kk_senkron_anlik_v1: { G1: JSON.stringify({ id: 'G1', ad: 'Göç Kitabı' }) }
    });
    await rafAc(page);
    await page.evaluate(() => depoKaydet());
    expect(await page.evaluate(() => veri.kitaplar[0].g)).toBe(777); // damga korundu
    const anlik = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_senkron_anlik_v1')));
    // güncel sürüm dinamik okunur: her şema yükseltmesinde bu vaka elle değişmesin
    expect(anlik.s).toBe(await page.evaluate(() => window.__senkron.ANLIK_SURUM));
    expect(String(anlik.p.G1).length).toBeLessThan(40);
  });

  test('kota hatasında kalıcı uyarı görünür ve başarılı yazımda kalkar', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Kotalı' })]);
    await rafAc(page);
    await expect(page.locator('#kotaUyari')).toBeHidden();
    await page.evaluate(() => {
      window.__asilSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (a, d) => {
        if (a === 'kk_kitaplik_v1') { const e = new Error('kota'); e.name = 'QuotaExceededError'; throw e; }
        return window.__asilSet(a, d);
      };
      depoKaydet();
    });
    await expect(page.locator('#kotaUyari')).toBeVisible();        // KALICI şerit
    await expect(page.locator('#kotaUyari')).toContainText('kaydedilmiyor');
    await expect(page.locator('#kotaUyari [data-act="disa-aktar"]')).toBeVisible(); // çıkış yolu
    await page.waitForTimeout(2600);                                // toast söndü, şerit durmalı
    await expect(page.locator('#kotaUyari')).toBeVisible();
    await page.evaluate(() => { localStorage.setItem = window.__asilSet; depoKaydet(); });
    await expect(page.locator('#kotaUyari')).toBeHidden();          // yer açılınca kalkar
  });
});
