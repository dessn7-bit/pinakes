'use strict';
/* G78 — KİTAP ÖZETİ alanı (v79, depo mimarisi v80'de revize).

   KAVRAM: özet, alıntı/nottan AYRI — kitabın BÜTÜNÜNE dair kullanıcı
   değerlendirmesi; tek kitap = tek özet.

   v80 DEPO REVİZYONU (bu dosya birlikte güncellendi): özet METNİ artık kitap
   kaydında değil — IndexedDB (kk_ozet_v1) + bellek dizini (window.__ozet).
   Kitapta yalnız İŞARET: ozetVar / ozetUzunluk / ozetG (alan damgası).
   - Kullanıcı yazımı k.g BASMAZ (v80 kararı): özet ayrı kanalın damgasını
     taşır; kitapParmak ozet* alanlarını dışlar.
   - Metin birleşimi kitap çiftinden çıktı → ozetBirlesim saf fonksiyonu
     (v79 çakışma-eki/silme/damgasız kuralları AYNEN, g79'da düğüm testleri).
   - ANLIK_SURUM 12, SEMA_SURUM 5 (v81: özet düğümü kaydına o/ontoloji eklendi).
   (Mutasyon: ozet işaretleri normalize'dan çıkar → kalıcılık vakaları
    kırmızı; md'den özet bloğu çıkar → markdown vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, rafaGec, ayarlarAc } = require('./yardim');

function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
async function detayAc(page, ad) {
  await page.click('#liste .kart:has-text("' + ad + '")');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}
async function ozetHazir(page) {
  await page.evaluate(() => window.__ozet.hazirBekle());
}
/* birlestir SAF çağrı (g26 deseni) — v80'de kitap çifti yalnız İŞARET birleştirir */
async function birlestirilmis(page, yerelK, uzakK) {
  return page.evaluate(([y, u]) => {
    const b = window.__senkron.birlestir(
      { kitaplar: [y], silinenler: {} }, { kitaplar: [u], silinenler: {} });
    return b.kitaplar[0];
  }, [yerelK, uzakK]);
}
async function aktarimYakala(page, cagri) {
  return page.evaluate(fn => {
    const asil = window.dosyaIndir; let yakalanan = null;
    window.dosyaIndir = (icerik, ad) => { yakalanan = { icerik, ad }; };
    try{ new Function(fn)(); }finally{ window.dosyaIndir = asil; }
    return yakalanan;
  }, cagri);
}

test.describe('G78 özet — veri modeli + senkron', () => {

  test('(a) KALICILIK: v79 metni GÖÇLE IDB\'ye iner, yenilemede korunur, kitapta yalnız işaret kalır', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Varlık ve Zaman', ozet: 'Varoluş üzerine ana fikir.', ozetG: 1754000000123 })]);
    await rafAc(page);
    await ozetHazir(page);
    await page.reload();
    await rafaGec(page);
    await ozetHazir(page);
    const s = await page.evaluate(() => {
      const k = veri.kitaplar[0];
      return { metin: window.__ozet.oku(k.id), ozetVar: k.ozetVar, ozetG: k.ozetG,
        mirasAlan: 'ozet' in k,
        hamAlan: JSON.parse(localStorage.getItem('kk_kitaplik_v1')).kitaplar[0].ozet };
    });
    expect(s.metin, 'metin IDB/bellekte').toBe('Varoluş üzerine ana fikir.');
    expect(s.ozetVar).toBe(true);
    expect(s.ozetG, 'damga korunur').toBe(1754000000123);
    expect(s.mirasAlan, 'kitap nesnesinde metin alanı kalmaz').toBe(false);
    expect(s.hamAlan, 'localStorage kaydında metin kalmaz').toBeUndefined();
  });

  test('(b) GÖÇ: eski ANLIK sürümüyle açılış damga BASMAZ; sürümler 12/5', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Göç Kitabı', g: 777, ozet: 'eski özet' })],
      { kk_senkron_anlik_v1: { s: 11, p: {} } });
    await rafAc(page);
    await ozetHazir(page);
    const sonuc = await page.evaluate(() => {
      depoKaydet();
      return { g: veri.kitaplar[0].g, surum: window.__senkron.ANLIK_SURUM,
        sema: window.__senkron.SEMA_SURUM };
    });
    expect(sonuc.g, 'göç turu yeniden damgalamaz').toBe(777);
    expect(sonuc.surum).toBe(12);
    // v81: özet düğümü kaydına o (ontoloji) eklendi — eski istemcinin PATCH'i
    // o'yu sildiği için SEMA 4→5 (elle yazılan metin = veri-kaybı sınıfı)
    expect(sonuc.sema).toBe(5);
  });

  test('(c) SENKRON İŞARETİ: kitap-LWW kazananı özetsiz olsa da yeni ozetG\'nin işareti kazanır', async ({ page }) => {
    await rafAc(page);
    const k = await birlestirilmis(page,
      { id: 'x', ad: 'K', g: 200, puan: 9, ozetVar: false, ozetUzunluk: 0, ozetG: 0 },
      { id: 'x', ad: 'K', g: 100, ozetVar: true, ozetUzunluk: 17, ozetG: 150 });
    expect(k.puan).toBe(9);
    expect(k.ozetVar, 'işaret alan damgasıyla yaşar').toBe(true);
    expect(k.ozetUzunluk).toBe(17);
    expect(k.ozetG).toBe(150);
  });

  test('(d) ÇAKIŞMA EKİ (ozetBirlesim): iki FARKLI metin → ikisi de birleşikte, kayıp YOK, ikinci tur idempotent', async ({ page }) => {
    await rafAc(page);
    const b = await page.evaluate(() => window.__senkron.ozetBirlesim(
      { m: 'Yeni cihazın özeti', g: 300 }, { m: 'Eski cihazın özeti', g: 250 }));
    expect(b.m).toContain('Yeni cihazın özeti');
    expect(b.m).toContain('Eski cihazın özeti');
    expect(b.m.indexOf('Yeni cihazın özeti'), 'yeni damgalı önde').toBeLessThan(
      b.m.indexOf('Eski cihazın özeti'));
    expect(b.g, 'ek üretilince taze damga (yakınsama)').toBeGreaterThan(300);
    const b2 = await page.evaluate(x => window.__senkron.ozetBirlesim(
      { m: x.m, g: x.g }, { m: 'Eski cihazın özeti', g: 250 }), b);
    expect(b2.m, 'ikinci tur ek üretmez').toBe(b.m);
  });

  test('(e) KASITLI SİLME kazanır; damgasız dış-yedek metni taşınır; eşit damga deterministik', async ({ page }) => {
    await rafAc(page);
    const s = await page.evaluate(() => ({
      silme: window.__senkron.ozetBirlesim({ m: '', g: 300 }, { m: 'Silinen özet', g: 250 }),
      yedek: window.__senkron.ozetBirlesim({ m: '', g: 0 }, { m: 'Dış yedekten metin', g: 0 }),
      esitA: window.__senkron.ozetBirlesim({ m: 'AAA metni', g: 100 }, { m: 'BBB metni', g: 100 }),
      esitB: window.__senkron.ozetBirlesim({ m: 'BBB metni', g: 100 }, { m: 'AAA metni', g: 100 })
    }));
    expect(s.silme.m).toBe('');
    expect(s.yedek.m).toBe('Dış yedekten metin');
    expect(s.esitA.m, 'eşit damgada iki cihaz aynı birleşiği üretir').toBe(s.esitB.m);
  });
});

test.describe('G78 özet — detay arayüzü', () => {

  test('(f) detaydan yazılır: form AÇILMAZ, kicker gelir, ozetG basılır, k.g DEĞİŞMEZ (v80 kanal kararı)', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Denemeler' })]);
    await rafAc(page);
    await ozetHazir(page);
    // taze cihazın İLK damgalaması otursun — "k.g değişmez" iddiası ondan sonra
    const gIlk = await page.evaluate(() => { depoKaydet(); return veri.kitaplar[0].g; });
    await detayAc(page, 'Denemeler');
    await expect(page.locator('#dOzetBlok')).toHaveCount(0);
    await expect(page.locator('.oz-bos .oz-ghost')).toHaveText('+ Özetini yaz');
    await page.click('[data-act="oz-ac"]');
    await page.fill('#ozMetin', 'İnsan doğası üzerine kalıcı gözlemler.');
    await page.click('[data-act="oz-kaydet"]');
    await expect(page.locator('#dOzetBlok .kicker')).toHaveText('Özetin');
    await expect(page.locator('.oz-metin')).toContainText('İnsan doğası üzerine');
    await expect(page.locator('#ortuForm'), 'form hiç açılmadı').not.toHaveClass(/acik/);
    const k = await page.evaluate(() => {
      const x = veri.kitaplar[0];
      return { metin: window.__ozet.oku(x.id), ozetVar: x.ozetVar, ozetG: x.ozetG,
        g: x.g, uzunluk: x.ozetUzunluk };
    });
    expect(k.metin).toBe('İnsan doğası üzerine kalıcı gözlemler.');
    expect(k.ozetVar).toBe(true);
    expect(k.ozetG, 'alan damgası basıldı').toBeGreaterThan(0);
    expect(k.uzunluk).toBe(38);
    expect(k.g, 'kitap damgası DEĞİŞMEZ — özet ayrı kanal').toBe(gIlk);
  });

  test('(g) düzenle + boşaltıp kaydet = silinir; IDB\'de mezar (boş + taze damga) kalır', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Silinecek', ozet: 'eski metin', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await detayAc(page, 'Silinecek');
    await page.click('#dOzetBlok [data-act="oz-ac"]');
    await expect(page.locator('#ozMetin')).toHaveValue('eski metin');
    await page.fill('#ozMetin', '');
    await page.click('[data-act="oz-kaydet"]');
    await expect(page.locator('#dOzetBlok')).toHaveCount(0);
    await expect(page.locator('.oz-bos .oz-ghost')).toBeVisible();
    const s = await page.evaluate(() => {
      const k = veri.kitaplar[0];
      return { ozetVar: k.ozetVar, metin: window.__ozet.oku(k.id),
        mezarDamga: window.__ozet.damga(k.id) };
    });
    expect(s.ozetVar).toBe(false);
    expect(s.metin).toBe('');
    expect(s.mezarDamga, 'silme de kasıtlı yazımdır — mezar damgası taze').toBeGreaterThan(100);
  });

  test('(h) uzun özet TAM gösterilir — v89: 600 kırpma/"Devamını göster" kalktı (sekme alanı)', async ({ page }) => {
    const uzunMetin = 'Başlangıç cümlesi. ' + 'dolgu sözcük '.repeat(80) + 'SON İŞARET';
    await tohumla(page, [bitmis({ ad: 'Uzun Özetli', ozet: uzunMetin, ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await detayAc(page, 'Uzun Özetli');
    await expect(page.locator('.oz-metin')).toContainText('Başlangıç cümlesi');
    await expect(page.locator('.oz-metin')).toContainText('SON İŞARET');
    await expect(page.locator('[data-act="oz-devam"]')).toHaveCount(0);
  });
});

test.describe('G78 özet — görünürlük ve erişim', () => {

  test('(i) raf araması özet metninde çalışır (bellek dizini)', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Bulantı', yazar: 'Sartre', ozet: 'Varoluşçuluk ve özgürlük üzerine.', ozetG: 100 }),
      bitmis({ ad: 'Başka Kitap', yazar: 'Biri' })]);
    await rafAc(page);
    await ozetHazir(page);
    await page.fill('#arama', 'varoluşçuluk');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart')).toContainText('Bulantı');
  });

  test('(j) Özetsiz çipi işaretle süzer; istatistik köprüsü rafa süzgeçli götürür', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Özetli Kitap', ozet: 'var', ozetG: 100 }),
      bitmis({ ad: 'Özetsiz Kitap' }),
      sahteKitap({ ad: 'Okunacak Kitap', durum: 'okunacak' })]);
    await rafAc(page);
    await page.click('#durumChips .chip[data-v="ozetsiz"]');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart')).toContainText('Özetsiz Kitap');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    await expect(page.locator('#istOzet')).toContainText('1 bitmiş kitabında özetin var');
    await expect(page.locator('#istOzet')).toContainText('1 kitabın özeti yok');
    await page.click('#istOzet [data-act="ozetsiz-git"]');
    await expect(page.locator('#panel-raf')).toHaveClass(/active/);
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#durumChips .chip[data-v="ozetsiz"]')).toHaveClass(/active/);
  });

  test('(k) markdown: md-hepsi "### Özet" içerir, sadece-alıntılar SAF, özetli-notsuz kitap dosyada', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Notsuz Ama Özetli', yazar: 'Yazar A', ozet: 'Kitabın ana fikri budur.', ozetG: 100 }),
      bitmis({ ad: 'Alıntılı Kitap', yazar: 'Yazar B',
        notlar: [{ id: 'n1', tip: 'alinti', metin: 'Bir alıntı.', tarih: '2026-01-01', sayfa: null, fikir: [], ng: 1 }] })]);
    await rafAc(page);
    await ozetHazir(page);
    const hepsi = await aktarimYakala(page, 'notlariMdAktar(false)');
    expect(hepsi.ad).toMatch(/^pinakes-alinti-not-.*\.md$/);
    expect(hepsi.icerik).toContain('## Notsuz Ama Özetli — Yazar A');
    expect(hepsi.icerik).toContain('### Özet');
    expect(hepsi.icerik).toContain('Kitabın ana fikri budur.');
    expect(hepsi.icerik).toContain('1 özet');
    const alintilar = await aktarimYakala(page, 'notlariMdAktar(true)');
    expect(alintilar.icerik).not.toContain('### Özet');
    expect(alintilar.icerik).not.toContain('Kitabın ana fikri budur.');
  });

  test('(l) CSV: Özet sütunu var, çok satırlı metin bozulmaz (bellekten)', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'CSV Kitabı',
      ozet: 'İlk satır; noktalı virgüllü.\nİkinci satır "tırnaklı".', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    const csv = await aktarimYakala(page, 'csvAktar()');
    const baslik = csv.icerik.replace(/^﻿/, '').split('\r\n')[0].split(';');
    // v81: 'Ontoloji' sütunu Özet'in hemen sağına eklendi — Özet artık sondan ikinci
    expect(baslik[baslik.length - 2]).toBe('Özet');
    expect(baslik[baslik.length - 1]).toBe('Ontoloji');
    expect(csv.icerik).toContain('"İlk satır; noktalı virgüllü.\nİkinci satır ""tırnaklı""."');
  });

  test('(m) v17 kota şeridi ana depo için yaşıyor (taklit)', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Tek Kitap' })]);
    await rafAc(page);
    const sonra = await page.evaluate(() => {
      const asil = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v){
        if(k === 'kk_kitaplik_v1') throw new DOMException('taklit', 'QuotaExceededError');
        return asil.call(this, k, v);
      };
      const tamam = depoKaydet();
      Storage.prototype.setItem = asil;
      return { tamam, seritAcik: document.getElementById('kotaUyari').classList.contains('acik') };
    });
    expect(sonra.tamam).toBe(false);
    expect(sonra.seritAcik, 'kota şeridi açıldı').toBe(true);
  });
});

test.describe('G78 özet — sırayla yazma akışı (M4)', () => {

  async function akisAc(page) {
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    await page.click('#istOzet [data-act="zg-ozetle"]');
    await expect(page.locator('#zgOzetOrtu')).toHaveClass(/acik/);
  }

  test('(n) akış: kaydet-ve-sonraki ozetG ile yazar (k.g değişmez), atla yazmaz, geri metni getirir', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Akış Bir', bitisTarihi: '2026-03-01' }),
      bitmis({ ad: 'Akış İki', bitisTarihi: '2026-02-01' })]);
    await akisAc(page);
    await ozetHazir(page);
    const gIlk = await page.evaluate(() => {
      depoKaydet();   // ilk damgalama otursun
      return veri.kitaplar.find(k => k.ad === 'Akış Bir').g;
    });
    await expect(page.locator('.zg-sayac')).toHaveText('1 / 2');
    await expect(page.locator('.zg-kitap-ad')).toHaveText('Akış Bir');
    await page.fill('#zgOzMetin', 'Birinci kitabın özeti.');
    await page.click('[data-act="zg-oz-kaydet"]');
    await expect(page.locator('.zg-onay-metin')).toContainText('Akış Bir → kaydedildi');
    await expect(page.locator('.zg-kitap-ad')).toHaveText('Akış İki');
    await page.click('[data-act="zg-oz-geri"]');
    await expect(page.locator('#zgOzMetin')).toHaveValue('Birinci kitabın özeti.');
    await page.click('[data-act="zg-oz-kaydet"]');
    await page.click('[data-act="zg-oz-atla"]');
    await expect(page.locator('#zgOzetOrtuGovde')).toContainText('Bitti');
    const veriSon = await page.evaluate(() => veri.kitaplar.map(k =>
      ({ ad: k.ad, metin: window.__ozet.oku(k.id), ozetVar: k.ozetVar, ozetG: k.ozetG, g: k.g })));
    const bir = veriSon.find(k => k.ad === 'Akış Bir'), iki = veriSon.find(k => k.ad === 'Akış İki');
    expect(bir.metin).toBe('Birinci kitabın özeti.');
    expect(bir.ozetVar).toBe(true);
    expect(bir.ozetG).toBeGreaterThan(0);
    expect(bir.g, 'akış yazımı da kitap damgası basmaz (v80)').toBe(gIlk);
    expect(iki.metin, 'atlanan kitaba yazılmaz').toBe('');
    await expect(page.locator('#ortuForm')).not.toHaveClass(/acik/);
  });

  test('(o) hepsi özetliyse köprünün akış ayağı çizilmez, dürüst durum satırı kalır', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Zaten Özetli', ozet: 'var', ozetG: 5 })]);
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    await expect(page.locator('#istOzet')).toContainText('hepsinde özetin var');
    await expect(page.locator('#istOzet [data-act="zg-ozetle"]')).toHaveCount(0);
  });
});

/* ---- Ciltli + AA (g49/g77 SUPUR birebir kopyası — ölçüm aleti üretimle aynı) ---- */
const SUPUR = () => {
  const COZ = z => {
    let m = String(z).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    m = String(z).match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
    if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
    return null;
  };
  const L = c => { const f = v => { v /= 255;
    return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const zeminBul = el => {
    let zemin = { r: 255, g: 255, b: 255 }, kat = [], p = el;
    while (p && p !== document.documentElement) {
      const c = COZ(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0) { kat.push(c); if (c.a >= 1) break; }
      p = p.parentElement;
    }
    const kok = COZ(getComputedStyle(document.documentElement).backgroundColor);
    if (kok && kok.a >= 1) kat.push(kok);
    for (let i = kat.length - 1; i >= 0; i--) {
      const c = kat[i];
      zemin = { r: c.r * c.a + zemin.r * (1 - c.a), g: c.g * c.a + zemin.g * (1 - c.a),
        b: c.b * c.a + zemin.b * (1 - c.a) };
    }
    return zemin;
  };
  const gorunur = el => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    if (!el.offsetParent && s.position !== 'fixed') return false;
    let p = el;
    while (p) { const ps = getComputedStyle(p);
      if (parseFloat(ps.opacity) < 0.5) return false;
      if (p.hasAttribute && p.hasAttribute('inert')) return false;
      p = p.parentElement; }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const kacak = [];
  const yur = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = yur.nextNode())) {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'CIRCLE'].includes(el.tagName)) continue;
    const kendi = [...el.childNodes]
      .filter(x => x.nodeType === 3 && x.textContent.trim().length > 1)
      .map(x => x.textContent.trim()).join(' ');
    if (!kendi || !gorunur(el)) continue;
    const s = getComputedStyle(el);
    const metin = COZ(s.color);
    if (!metin || metin.a === 0) continue;
    const zemin = zeminBul(el);
    const ef = metin.a >= 1 ? metin : {
      r: metin.r * metin.a + zemin.r * (1 - metin.a),
      g: metin.g * metin.a + zemin.g * (1 - metin.a),
      b: metin.b * metin.a + zemin.b * (1 - metin.a) };
    const l1 = L(ef), l2 = L(zemin);
    const oran = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
    const px = parseFloat(s.fontSize), kalin = parseInt(s.fontWeight) >= 700;
    const esik = (px >= 24 || (px >= 18.66 && kalin)) ? 3.0 : 4.5;
    if (oran < esik) kacak.push((el.tagName + '.' + (typeof el.className === 'string'
      ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''))
      + ' "' + kendi.slice(0, 34) + '" ' + oran.toFixed(2) + '<' + esik);
  }
  return kacak;
};

test.describe('G78 özet — Ciltli sözleşmeleri', () => {

  for(const tema of ['acik', 'karanlik']){
    test(`(p) ${tema} temada özet bölümü + akış paneli AA; dolu düğme yok`, async ({ page }) => {
      await tohumla(page, [
        bitmis({ ad: 'Tema Kitabı', ozet: 'Kontrast ölçümü için dolu özet metni.', ozetG: 100 }),
        bitmis({ ad: 'Özetsiz Tema' })],
        { kk_tema_v1: tema });
      await rafAc(page);
      await ozetHazir(page);
      await expect(page.locator('html')).toHaveAttribute('data-tema', tema);
      await detayAc(page, 'Tema Kitabı');
      await page.waitForTimeout(250);
      expect(await page.evaluate(SUPUR), 'detay + özet bölümü AA').toEqual([]);
      const dolu = await page.evaluate(() => {
        const alan = [...document.querySelectorAll('#dOzetBlok button, .oz-bos button')];
        return alan.filter(b => {
          const c = getComputedStyle(b).backgroundColor;
          return c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
        }).map(b => b.className);
      });
      expect(dolu, 'özet eylemlerinde dolu düğme yok').toEqual([]);
      await page.click('#ortuDetay .sheet-kapat');
      await page.click('nav [data-act="sekme"][data-v="ist"]');
      await page.click('#istOzet [data-act="zg-ozetle"]');
      await expect(page.locator('#zgOzetOrtu')).toHaveClass(/acik/);
      await page.waitForTimeout(250);
      expect(await page.evaluate(SUPUR), 'sırayla özet paneli AA').toEqual([]);
    });
  }
});
