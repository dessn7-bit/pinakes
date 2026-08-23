'use strict';
/* G85 — veri kaybı düzeltmeleri (Sprint 1, v86). Dört YÜKSEK bulgu:
   M1 yedek içe aktarımında özet id eşlemesi (yeni id'ye taşınır, yerel
      başka kitabın özeti ezilmez, atlananın özeti yetim yazılmaz)
   M2 iz deposu boş cihazda damgalı kitap yeniden damgalanmaz (yedekten
      dönüş odadaki günceli ezemez); damgasız YENİ kitap yine damgalanır
   M3 çok-sekme: yazım duyurusu + yazım-önü diskle birleşme — bayat belleğe
      taze damga basılıp öbür sekmenin kaydı ezilmez
   M4 toplu işlemler yalnız EKRANDA duran seçime uygulanır */
const { test, expect, tohumla, sahteKitap, rafAc, onaylariKabulEt } = require('./yardim');

test.describe('G85 veri kaybı düzeltmeleri', () => {

  test('M1: id çakışan yedekte özet YENİ id ile gelir; yerel kitabın özeti EZİLMEZ; atlananın özeti yazılmaz', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ id: 'CAKISAN1', ad: 'Yerel Kitap', yazar: 'Yerel Yazar' }),
      sahteKitap({ id: 'K2', ad: 'Ortak Kitap', yazar: 'Ortak Yazar' })
    ]);
    await rafAc(page);
    await page.evaluate(() => window.__ozet.kaydet('CAKISAN1', 'YEREL OZET'));
    const yedek = {
      surum: 2,
      kitaplar: [
        { id: 'CAKISAN1', ad: 'Yedek Farklı Kitap', yazar: 'Yedek Yazar', g: 5 },  // id çakışır → yeni id
        { id: 'ATLANAN9', ad: 'Ortak Kitap', yazar: 'Ortak Yazar', g: 5 }          // ad+yazar mükerrer → atlanır
      ],
      ozetler: {
        'CAKISAN1': { m: 'YEDEK OZETI', g: Date.now() + 999999 },  // damga yerelden YENİ — eski kod ezerdi
        'ATLANAN9': { m: 'YETIM OZET', g: Date.now() + 999999 }
      }
    };
    await page.evaluate(y =>
      iceAktar(new File([JSON.stringify(y)], 'yedek.json', { type: 'application/json' })), yedek);
    await expect.poll(() => page.evaluate(() => veri.kitaplar.length)).toBe(3);
    // yeni id'li kitabın özeti onunla gelir
    await expect.poll(() => page.evaluate(() => {
      const yeni = veri.kitaplar.find(k => k.ad === 'Yedek Farklı Kitap');
      return yeni ? window.__ozet.oku(yeni.id) : null;
    })).toBe('YEDEK OZETI');
    const sonuc = await page.evaluate(() => {
      const yeni = veri.kitaplar.find(k => k.ad === 'Yedek Farklı Kitap');
      return {
        yeniId: yeni.id,
        yerelOzet: window.__ozet.oku('CAKISAN1'),
        yetim: window.__ozet.oku('ATLANAN9')
      };
    });
    expect(sonuc.yeniId).not.toBe('CAKISAN1');
    expect(sonuc.yerelOzet).toBe('YEREL OZET');   // damgası daha yeni yedek bile ezemedi
    expect(sonuc.yetim).toBe('');                 // atlanan kitabın özeti hiç yazılmadı
  });

  test('M1 regresyon: yedekte kitabı olmayan salt-özet kaydı eski davranışla, damga kapısından yazılır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'VAR1', ad: 'Var Olan', yazar: 'Y' })]);
    await rafAc(page);
    const yedek = { surum: 2, kitaplar: [],
      ozetler: { 'VAR1': { m: 'YEDEKTEN GELEN', g: Date.now() + 999999 } } };
    await page.evaluate(y =>
      iceAktar(new File([JSON.stringify(y)], 'y.json', { type: 'application/json' })), yedek);
    await expect.poll(() => page.evaluate(() => window.__ozet.oku('VAR1'))).toBe('YEDEKTEN GELEN');
  });

  test('M2: iz deposu BOŞ + damgalı kitap → açılışta ve kayıtta yeniden damgalanmaz; gerçek değişiklik damgalanır', async ({ page }) => {
    const ESKI = 1700000000000;
    await tohumla(page, [sahteKitap({ id: 'Y1', ad: 'Yedekten Gelen', g: ESKI })]);
    await page.goto('/');
    // açılıştaki damgala() bile basmamalı (eski kod burada basardı)
    expect(await page.evaluate(() => veri.kitaplar[0].g)).toBe(ESKI);
    await page.evaluate(() => depoKaydet());
    expect(await page.evaluate(() => veri.kitaplar[0].g)).toBe(ESKI);     // taban kuruldu, damga korundu
    await page.evaluate(() => { veri.kitaplar[0].ad = 'Gerçek Değişiklik'; depoKaydet(); });
    expect(await page.evaluate(() => veri.kitaplar[0].g)).toBeGreaterThan(ESKI);
  });

  test('M2 regresyon (ilk kurulum): damgası olmayan YENİ kitap ilk kayıtta damgalanır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'N1', ad: 'Yeni Kitap' })]);   // sahteKitap g:0
    await page.goto('/');
    await page.evaluate(() => depoKaydet());
    expect(await page.evaluate(() => veri.kitaplar[0].g)).toBeGreaterThan(0);
  });

  test('M3: iki sekme — kayıt kaybı ve damga enflasyonu yok', async ({ page, context }) => {
    await tohumla(page, [
      sahteKitap({ id: 'A1', ad: 'Kitap A' }),
      sahteKitap({ id: 'B1', ad: 'Kitap B' })
    ]);
    await page.goto('/');
    const page2 = await context.newPage();   // aynı context = aynı localStorage
    await page2.goto('/');
    await page.evaluate(() => {
      veri.kitaplar.find(k => k.id === 'A1').ad = 'A-SEKME1';
      depoKaydet();
    });
    const gA = await page.evaluate(() => veri.kitaplar.find(k => k.id === 'A1').g);
    /* Duyuru (BroadcastChannel) tesliminin ZAMANI test ortamında güvenilmez
       (paralel koşumda geç kalabiliyor); ürünün nihai güvencesi zaten yazım-önü
       JETON KAPISI — sekme-2'nin depoKaydet'i localStorage jetonunu senkron
       okuyup yazmadan önce diskle birleşir. İddialar o katmana sabitlenir. */
    await page2.evaluate(() => {
      veri.kitaplar.find(k => k.id === 'B1').ad = 'B-SEKME2';
      depoKaydet();
    });
    // kapı uzlaşması sekme-2 belleğini de tazelemiş olmalı
    expect(await page2.evaluate(() =>
      veri.kitaplar.find(k => k.id === 'A1').ad)).toBe('A-SEKME1');
    const disk = await page2.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1')));
    expect(disk.kitaplar.find(k => k.id === 'A1').ad).toBe('A-SEKME1');   // sekme-1 kaydı korundu
    expect(disk.kitaplar.find(k => k.id === 'B1').ad).toBe('B-SEKME2');   // sekme-2 kaydı da yerinde
    expect(disk.kitaplar.find(k => k.id === 'A1').g).toBe(gA);            // A'ya taze damga BASILMADI
    await page2.close();
  });

  test('M3 kapısı: duyuru hiç gelmese bile yazım ÖNCESİ diskle birleşilir (jeton kapısı)', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ id: 'A1', ad: 'Kitap A' }),
      sahteKitap({ id: 'B1', ad: 'Kitap B' })
    ]);
    await page.goto('/');
    await page.evaluate(() => depoKaydet());   // taban + bu sekmenin jetonu
    const sonuc = await page.evaluate(() => {
      // "başka sekme yazmış" taklidi: disk + jeton elle değişir, BC mesajı YOK
      const d = JSON.parse(localStorage.getItem('kk_kitaplik_v1'));
      const a = d.kitaplar.find(k => k.id === 'A1');
      a.ad = 'DISK-YENI'; a.g = Date.now() + 5000;
      localStorage.setItem('kk_kitaplik_v1', JSON.stringify(d));
      localStorage.setItem('kk_sekme_yazim_v1', 'baska-sekme:' + Date.now());
      // bu sekmenin bayat belleğiyle FARKLI kitaba kayıt
      veri.kitaplar.find(k => k.id === 'B1').ad = 'BELLEK-YENI';
      depoKaydet();
      const disk = JSON.parse(localStorage.getItem('kk_kitaplik_v1'));
      return {
        diskA: disk.kitaplar.find(k => k.id === 'A1').ad,
        diskB: disk.kitaplar.find(k => k.id === 'B1').ad,
        bellekA: veri.kitaplar.find(k => k.id === 'A1').ad
      };
    });
    expect(sonuc.diskA).toBe('DISK-YENI');     // öbür sekmenin taze kaydı EZİLMEDİ
    expect(sonuc.diskB).toBe('BELLEK-YENI');   // bu sekmenin kaydı da kaybolmadı
    expect(sonuc.bellekA).toBe('DISK-YENI');   // bellek birleşimle güncellendi
  });

  test('M4: aramayla görünmez olan seçim toplu silmede hedef OLMAZ', async ({ page }) => {
    onaylariKabulEt(page);
    await tohumla(page, [
      sahteKitap({ ad: 'Elma Kitabı', yazar: 'Y1' }),
      sahteKitap({ ad: 'Armut Kitabı', yazar: 'Y2' })
    ]);
    await rafAc(page);
    await page.click('#secimBtn');
    await page.locator('#liste .kart', { hasText: 'Elma Kitabı' }).click();
    await page.locator('#liste .kart', { hasText: 'Armut Kitabı' }).click();
    await expect(page.locator('#topluSayi')).toHaveText('2 seçili');
    await page.fill('#arama', 'Elma');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#topluSayi')).toHaveText('1 seçili');   // kesişim çubuğa yansıdı
    await page.click('[data-act="toplu-sil"]');
    await expect(page.locator('#toast')).toContainText('1 kitap silindi');
    expect(await page.evaluate(() => veri.kitaplar.map(k => k.ad))).toEqual(['Armut Kitabı']);
    // görünmeyen kitap mezar taşı da almadı
    expect(await page.evaluate(() =>
      Object.keys(veri.silinenler || {}).length)).toBe(1);
  });

  test('M4: durum değiştirme de aynı korumadan geçer (secilenKitaplar kemeri)', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'Elma Kitabı', yazar: 'Y1', durum: 'okunacak' }),
      sahteKitap({ ad: 'Armut Kitabı', yazar: 'Y2', durum: 'okunacak' })
    ]);
    await rafAc(page);
    await page.click('#secimBtn');
    await page.locator('#liste .kart', { hasText: 'Elma Kitabı' }).click();
    await page.locator('#liste .kart', { hasText: 'Armut Kitabı' }).click();
    await page.fill('#arama', 'Elma');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await page.click('[data-act="toplu-durum"]');
    await page.selectOption('#topluDurumSec', 'bitti');
    await page.click('[data-act="toplu-durum-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın durumu değişti');
    const durumlar = await page.evaluate(() =>
      veri.kitaplar.map(k => ({ ad: k.ad, durum: k.durum })));
    expect(durumlar.find(k => k.ad === 'Elma Kitabı').durum).toBe('bitti');
    expect(durumlar.find(k => k.ad === 'Armut Kitabı').durum).toBe('okunacak');   // görünmeyene dokunulmadı
  });
});
