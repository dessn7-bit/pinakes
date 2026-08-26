'use strict';
const { test, expect, tohumla, sahteKitap,
  kameraTaklit, rafAc, ayarlarAc } = require('./yardim');

const YIL = new Date().getFullYear();
const gun = (yil, ay, g) => `${yil}-${String(ay).padStart(2, '0')}-${String(g).padStart(2, '0')}`;

/* ================= M1: ARIA dialog semantiği ================= */
async function pencereDurumu(page, ortuId) {
  return page.evaluate(id => {
    const o = document.getElementById(id);
    const s = o.querySelector('.sheet');
    const baslikId = s.getAttribute('aria-labelledby');
    return {
      rol: s.getAttribute('role'),
      modal: s.getAttribute('aria-modal'),
      labelledby: baslikId,
      baslikMetni: baslikId ? (document.getElementById(baslikId) || {}).textContent : null,
      ortuGizli: o.getAttribute('aria-hidden'),
      ortuInert: o.hasAttribute('inert'),
      arkaGizli: document.querySelector('section.panel').getAttribute('aria-hidden'),
      arkaInert: document.querySelector('section.panel').hasAttribute('inert'),
      navInert: document.querySelector('nav').hasAttribute('inert'),
      toastInert: document.getElementById('toast').hasAttribute('inert')   // aria-live susmamalı
    };
  }, ortuId);
}

test.describe('G22 M1 — ARIA dialog semantiği', () => {

  test('form penceresi: role, aria-modal, aria-labelledby doğru', async ({ page }) => {
    await rafAc(page);
    await page.click('.fab[data-act="yeni"]');
    const d = await pencereDurumu(page, 'ortuForm');
    expect(d.rol).toBe('dialog');
    expect(d.modal).toBe('true');
    expect(d.labelledby).toBeTruthy();
    expect(d.baslikMetni).toContain('Yeni kitap');
  });

  test('detay penceresi: başlık kitap adını gösterir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Etiketli Kitap' })]);
    await rafAc(page);
    await page.click('#liste .kart');
    const d = await pencereDurumu(page, 'ortuDetay');
    expect(d.rol).toBe('dialog');
    expect(d.modal).toBe('true');
    expect(d.baslikMetni).toBe('Etiketli Kitap');
  });

  test('eklenti pencereleri de işaretlenir (barkod, seri tarama, kart)', async ({ page }) => {
    await kameraTaklit(page);
    await tohumla(page, [sahteKitap({ ad: 'K', notlar: [
      { id: 'n1', tip: 'alinti', metin: 'Alıntı', tarih: '2026-08-01', sayfa: null, fikir: [] }] })]);
    await rafAc(page);
    // barkod
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    let d = await pencereDurumu(page, 'barkodOrtu');
    expect(d.rol).toBe('dialog');
    expect(d.baslikMetni).toContain('Barkod');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // seri tarama
    await ayarlarAc(page);
    await page.click('#ortuAyar [data-act="seri-ac"]');
    d = await pencereDurumu(page, 'seriOrtu');
    expect(d.rol).toBe('dialog');
    expect(d.baslikMetni).toContain('Seri tarama');
    await page.keyboard.press('Escape');
    // Ayarlar bir PENCERE: sekmeye dönmeden önce kapatılmalı
    await page.keyboard.press('Escape');
    await expect(page.locator('#ortuAyar')).not.toHaveClass(/acik/);
    // alıntı kartı
    await page.click('[data-act="sekme"][data-v="alinti"]');
    await page.click('#alintiIcerik [data-act="alinti-kart"]');
    d = await pencereDurumu(page, 'kartOrtu');
    expect(d.rol).toBe('dialog');
    expect(d.baslikMetni).toContain('Alıntı kartı');
  });

  test('pencere açıkken arka plan inert + aria-hidden, AÇIK PENCERE değil', async ({ page }) => {
    await rafAc(page);
    await page.click('.fab[data-act="yeni"]');
    const d = await pencereDurumu(page, 'ortuForm');
    expect(d.arkaInert).toBe(true);
    expect(d.arkaGizli).toBe('true');
    expect(d.navInert).toBe(true);
    // KLASİK HATA DENETİMİ: açık pencerenin kendisi gizlenmemeli
    expect(d.ortuGizli).toBeNull();
    expect(d.ortuInert).toBe(false);
    // toast aria-live bölgesi susturulmamalı
    expect(d.toastInert).toBe(false);
  });

  test('kapanınca inert/aria-hidden temizlenir', async ({ page }) => {
    await rafAc(page);
    await page.click('.fab[data-act="yeni"]');
    expect((await pencereDurumu(page, 'ortuForm')).arkaInert).toBe(true);
    await page.keyboard.press('Escape');
    const temiz = await page.evaluate(() => {
      const p = document.querySelector('section.panel');
      return { inert: p.hasAttribute('inert'), gizli: p.getAttribute('aria-hidden'),
        nav: document.querySelector('nav').hasAttribute('inert') };
    });
    expect(temiz.inert).toBe(false);
    expect(temiz.gizli).toBeNull();
    expect(temiz.nav).toBe(false);
  });

  test('iç içe: üstteki açıkken ALTTAKİ gizli, üstteki kapanınca geri geliyor', async ({ page }) => {
    await rafAc(page);
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    let kat = await page.evaluate(() => ({
      formGizli: document.getElementById('ortuForm').getAttribute('aria-hidden'),
      formInert: document.getElementById('ortuForm').hasAttribute('inert'),
      barkodGizli: document.getElementById('barkodOrtu').getAttribute('aria-hidden'),
      barkodInert: document.getElementById('barkodOrtu').hasAttribute('inert')
    }));
    expect(kat.formGizli).toBe('true');      // alttaki pencere erişilemez
    expect(kat.formInert).toBe(true);
    expect(kat.barkodGizli).toBeNull();      // üstteki erişilebilir
    expect(kat.barkodInert).toBe(false);

    await page.keyboard.press('Escape');     // barkod kapandı
    kat = await page.evaluate(() => ({
      formGizli: document.getElementById('ortuForm').getAttribute('aria-hidden'),
      formInert: document.getElementById('ortuForm').hasAttribute('inert'),
      formAcik: document.getElementById('ortuForm').classList.contains('acik')
    }));
    expect(kat.formAcik).toBe(true);
    expect(kat.formGizli).toBeNull();        // alttaki geri erişilebilir oldu
    expect(kat.formInert).toBe(false);
  });

  test('odak yönetimi ARIA ile tutarlı: odak açık pencerenin içinde', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Odak Kitabı' })]);
    await rafAc(page);
    await page.click('#liste .kart');
    const durum = await page.evaluate(() => {
      const o = document.getElementById('ortuDetay');
      const aktif = document.activeElement;
      return { icerde: o.contains(aktif),
        gizliAgacta: !!(aktif.closest('[aria-hidden="true"]') || aktif.closest('[inert]')) };
    });
    expect(durum.icerde).toBe(true);
    expect(durum.gizliAgacta).toBe(false);   // odaklanmış öğe gizli ağaçta OLMAMALI
  });
});

/* ================= M2: yıl sonu raporu ================= */
function raporKitaplari() {
  return [
    // bu yıl: 3 kitap (biri yeniden okuma), toplam 900 sayfa
    sahteKitap({ id: 'b1', ad: 'Ocak Kitabı', yazar: 'Yazar A', tur: 'Felsefe', sayfa: 300,
      durum: 'bitti', puan: 9, baslamaTarihi: gun(YIL, 1, 2), bitisTarihi: gun(YIL, 1, 20) }),
    sahteKitap({ id: 'b2', ad: 'Mart Kitabı', yazar: 'Yazar A', tur: 'Roman', sayfa: 200,
      durum: 'bitti', puan: 7, bitisTarihi: gun(YIL, 3, 10) }),
    sahteKitap({ id: 'b3', ad: 'Yeniden Okunan', yazar: 'Yazar B', tur: 'Felsefe', sayfa: 400,
      durum: 'okunuyor', puan: null, baslamaTarihi: gun(YIL, 6, 1),
      okumalar: [{ bas: gun(YIL - 1, 5, 1), bit: gun(YIL - 1, 6, 1), puan: 6, not: '' },
                 { bas: gun(YIL, 5, 1), bit: gun(YIL, 5, 20), puan: 8, not: '' }] }),
    // geçen yıl: 1 kitap 150 sayfa (+ yukarıdaki yeniden okumanın ilk turu)
    sahteKitap({ id: 'b4', ad: 'Geçen Yıl Kitabı', yazar: 'Yazar C', tur: 'Bilim', sayfa: 150,
      durum: 'bitti', puan: 5, bitisTarihi: gun(YIL - 1, 11, 5) })
  ];
}
async function istAc(page) {
  await rafAc(page);
  await page.click('[data-act="sekme"][data-v="ist"]');
  await expect(page.locator('#istIcerik #rpKart')).toBeVisible();
}

test.describe('G22 M2 — yıl sonu raporu', () => {

  test('yıl seçici veri bulunan tüm yılları listeler', async ({ page }) => {
    await tohumla(page, raporKitaplari());
    await istAc(page);
    const ys = await page.evaluate(() => window.__rapor.yillar());
    expect(ys).toContain(YIL);
    expect(ys).toContain(YIL - 1);
    await expect(page.locator(`#istIcerik #rpYillar [data-v="${YIL}"]`)).toHaveClass(/rp-secili/);
    await expect(page.locator(`#istIcerik #rpYillar [data-v="${YIL - 1}"]`)).toBeVisible();
  });

  test('sayılar test verisiyle birebir doğru', async ({ page }) => {
    await tohumla(page, raporKitaplari());
    await istAc(page);
    const o = await page.evaluate(y => window.__rapor.yilOzeti(y), YIL);
    expect(o.kitap).toBe(3);                 // b1, b2, b3 (b3 bu yıl yeniden okundu)
    expect(o.sayfa).toBe(900);               // 300 + 200 + 400
    expect(o.ortPuan).toBe(8);               // (9 + 7 + 8) / 3
    expect(o.yenidenSayisi).toBe(1);
    expect(o.enIyi.map(x => x.ad)).toEqual(['Ocak Kitabı', 'Yeniden Okunan', 'Mart Kitabı']);
    expect(o.enCokYazar).toEqual(['Yazar A', 2]);
    expect(o.enCokTur).toEqual(['Felsefe', 2]);
    expect(o.ilk.ad).toBe('Ocak Kitabı');
    expect(o.son.ad).toBe('Yeniden Okunan');
    expect(o.aylik[0]).toBe(1);              // Ocak
    expect(o.aylik[2]).toBe(1);              // Mart
    expect(o.aylik[4]).toBe(1);              // Mayıs (yeniden okuma bitişi)
  });

  test('yeniden okumalar yıl sayımında doğru ele alınır', async ({ page }) => {
    await tohumla(page, raporKitaplari());
    await istAc(page);
    const buYil = await page.evaluate(y => window.__rapor.yilOzeti(y), YIL);
    const gecen = await page.evaluate(y => window.__rapor.yilOzeti(y), YIL - 1);
    // aynı kitap İKİ yılda da sayılır (her tamamlanmış okuma bir olay)
    expect(buYil.kitap).toBe(3);
    expect(gecen.kitap).toBe(2);             // b4 + b3'ün ilk okuması
    expect(gecen.sayfa).toBe(550);           // 150 + 400
    expect(gecen.ortPuan).toBe(5.5);         // (5 + 6) / 2
  });

  test('aynı kitabı AYNI YIL iki kez bitirmek: kitap 1, sayfa bir kez, yeniden 1', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'ik', ad: 'İki Kez Okunan', yazar: 'Y', tur: 'Felsefe',
      sayfa: 250, durum: 'bitti', puan: 9, bitisTarihi: gun(YIL, 9, 20),
      okumalar: [{ bas: gun(YIL, 1, 2), bit: gun(YIL, 1, 15), puan: 7, not: '' }] })]);
    await istAc(page);
    const o = await page.evaluate(y => window.__rapor.yilOzeti(y), YIL);
    expect(o.kitap).toBe(1);            // FARKLI kitap sayısı
    expect(o.sayfa).toBe(250);          // sayfalar mükerrer eklenmez
    expect(o.yenidenSayisi).toBe(2);    // iki okumanın ikisi de "yeniden" işaretli
    expect(o.aylik[0] + o.aylik[8]).toBe(1);   // kitap tek ayda sayılır (ilk olayın ayı)
    expect(o.ortPuan).toBe(7);          // temsilci olay ilk kaydedilen okuma
  });

  test('veri olmayan yılda anlamlı boş mesaj, uydurma sayı yok', async ({ page }) => {
    // yalnız GEÇEN yıl verisi var; varsayılan seçim bu yıl → boş durum
    await tohumla(page, [sahteKitap({ ad: 'Sadece Geçen Yıl', yazar: 'Y', sayfa: 100,
      durum: 'bitti', puan: 6, bitisTarihi: gun(YIL - 1, 4, 4) })]);
    await istAc(page);
    const bos = await page.evaluate(y => window.__rapor.yilOzeti(y), YIL);
    expect(bos.veriVar).toBe(false);
    expect(bos.kitap).toBe(0);
    expect(bos.sayfa).toBe(0);
    expect(bos.ortPuan).toBeNull();          // uydurma değer yok
    expect(bos.enIyi).toEqual([]);
    await expect(page.locator('#istIcerik #rpBos')).toContainText('bitirilmiş kitap ya da okuma oturumu kaydı yok');
    expect(await page.locator('#istIcerik #rpSayilar').count()).toBe(0);
    // veri olan yıla geçince sayılar gelir
    await page.click(`#istIcerik #rpYillar [data-v="${YIL - 1}"]`);
    await expect(page.locator('#istIcerik #rpSayilar')).toBeVisible();
    expect(await page.locator('#istIcerik #rpBos').count()).toBe(0);
  });

  test('önceki yıla göre karşılaştırma doğru', async ({ page }) => {
    await tohumla(page, raporKitaplari());
    await istAc(page);
    const k = await page.evaluate(y => window.__rapor.karsilastir(y), YIL);
    expect(k).toEqual({ kitap: 1, sayfa: 350, oncekiYil: YIL - 1 });   // 3-2 kitap, 900-550 sayfa
    await expect(page.locator('#istIcerik #rpKarsilastirma')).toContainText('+1 kitap');
    await expect(page.locator('#istIcerik #rpKarsilastirma')).toContainText('+350 sayfa');
  });

  test('hedef tutturma doğru raporlanır (kitap ve sayfa ayrı)', async ({ page }) => {
    const kitaplar = raporKitaplari();
    await tohumla(page, { kitaplar, hedef: { [YIL]: 2 }, hedefG: {},
      hedefSayfa: { [YIL]: 5000 }, hedefSayfaG: {}, silinenler: {} });
    await istAc(page);
    const o = await page.evaluate(y => window.__rapor.yilOzeti(y), YIL);
    expect(o.hedefKitapTuttu).toBe(true);     // 3 >= 2
    expect(o.hedefSayfaTuttu).toBe(false);    // 900 < 5000
    await expect(page.locator('#istIcerik #rpHedef')).toContainText('tuttun');
    await expect(page.locator('#istIcerik #rpHedef')).toContainText('tutmadın');
  });

  test('PNG üretilir: 1080x1350, krem zemin, taşma yok', async ({ page }) => {
    await tohumla(page, raporKitaplari());
    await istAc(page);
    const olcum = await page.evaluate(y => {
      const t = document.createElement('canvas');
      const m = window.__rapor.raporCiz(t, window.__rapor.yilOzeti(y));
      const d = t.getContext('2d').getImageData(4, 4, 1, 1).data;
      return { m, zemin: { r: d[0], g: d[1], b: d[2] }, w: t.width, h: t.height };
    }, YIL);
    expect(olcum.w).toBe(1080);
    expect(olcum.h).toBe(1350);
    expect(olcum.zemin).toEqual({ r: 245, g: 239, b: 227 });   // KREM — tema bağımsız
    expect(olcum.m.tasti).toBe(false);
    expect(olcum.m.sonY).toBeLessThanOrEqual(olcum.m.tabanSinir);
  });

  test('PNG karanlık temada da krem kalır ve indirme tetiklenir', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await tohumla(page, raporKitaplari());
    await istAc(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-tema'))).toBe('karanlik');
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#istIcerik [data-act="rp-png"]')
    ]);
    expect(indirme.suggestedFilename()).toBe('pinakes-' + YIL + '.png');
    const zemin = await page.evaluate(y => {
      const t = document.createElement('canvas');
      window.__rapor.raporCiz(t, window.__rapor.yilOzeti(y));
      const d = t.getContext('2d').getImageData(4, 4, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }, YIL);
    expect(zemin).toEqual({ r: 245, g: 239, b: 227 });
  });

  test('çok uzun kitap adlarında da taşma olmaz', async ({ page }) => {
    const uzunAd = 'Çok Uzun Bir Kitap Adı '.repeat(12);
    await tohumla(page, [sahteKitap({ ad: uzunAd, yazar: 'Uzun Yazar Adı '.repeat(6),
      tur: 'Felsefe', sayfa: 500, durum: 'bitti', puan: 10, bitisTarihi: gun(YIL, 2, 2) })]);
    await istAc(page);
    const m = await page.evaluate(y => {
      const t = document.createElement('canvas');
      return window.__rapor.raporCiz(t, window.__rapor.yilOzeti(y));
    }, YIL);
    expect(m.tasti).toBe(false);
    expect(m.sonY).toBeLessThanOrEqual(m.tabanSinir);
  });
});
