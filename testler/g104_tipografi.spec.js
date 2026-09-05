'use strict';
/* G104 — OKUMA TİPOGRAFİSİ (v104).

   KAVRAM: Pinakes'in okuma yüzeyleri (özet, ontoloji, not, alıntı) uzun metin
   taşır — 299 kitapta ortalama 545 kelime. Ayarlar ▸ Okuma tipografisi bu
   metinlerin ölçüsünü beş eksende ayarlar: boyut, satır yüksekliği, paragraf
   arası, satır uzunluğu, yazı ailesi.

   BU DOSYANIN KİLİTLEDİĞİ KARARLAR:
   - VARSAYILAN = BUGÜNKÜ GÖRÜNÜM. Ayara dokunmayan kullanıcıda tek piksel
     değişmez; sıfırlama tabana BİREBİR döner ve kök elemanda --tipo-* jetonu
     bırakmaz. Bu vaka havuzun varlık sebebidir — kırılırsa sessiz regresyon.
   - v105 KAPSAM: boyut ve aile TÜM uygulamayı tutar; satır yüksekliği,
     paragraf arası ve satır uzunluğu YALNIZ okuma yüzeylerine iner (akan
     metnin ölçüleri — tek satırlık etikette karşılığı yok).
   - v105 ÜÇ KADEME (kör çarpan DEĞİL): okuma tam kazanç · arayüz yarı
     (KAPSAM_SONUMU .5) · sekme çubuğu çeyrek (NAV_SONUMU .25). Sekme çubuğu
     5 yuvalı ve nowrap: 320px'te yarı kazanç bile son sekmeyi kesiyordu.
   - fs/lh ÇARPAN: özet (.95rem/1.62) ile not (.9rem/1.55) arasındaki oran
     korunur, tek mutlak değere ezilmez.
   - v104 markdown tutarlılığı: not ve alıntı gövdesi de mdMini'den geçer
     (özet/ontoloji v101'den beri geçiyordu). pre-wrap kalktı, <p> marjı geldi.
   - Değer İKİ güvenilmez kaynaktan gelir (localStorage + yedek dosyası):
     SEÇENEK tablosunda olmayan değer sessizce düşer.
   - Yedek: tercihler.tipografi ham JSON; geri yükleme "yalnız cihazda yoksa"
     kuralına uyar (tema/görünüm ile aynı sözleşme). */
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc } = require('./yardim');

const OZET = 'Birinci paragraf **kalin** ile.\n\nIkinci paragraf *italik* ile.';
const ONTO = 'Ontoloji **kavram** haritasi.\n\nIkinci dugum.';

/* Not ve alinti IKI paragrafli: tek paragrafta <p> zaten :last-child olur ve
   marji dogru sekilde 0 kalir — paragraf-arasi ayari olculemezdi. */
const NOT_METIN = 'Not govdesi **kalin** ve *italik*.\n\nIkinci paragraf.';
const ALINTI_METIN = 'Alinti govdesi **vurgulu**.\n\nAlintinin ikinci paragrafi.';

async function kur(page) {
  await tohumla(page, [sahteKitap({
    ad: 'Olcum Kitabi', yazar: 'Test Yazar',
    durum: 'bitti', bitisTarihi: bugunISO(-10),
    notlar: [
      { id: 'n1', tip: 'not', metin: NOT_METIN, tarih: bugunISO(-3) },
      { id: 'n2', tip: 'alinti', metin: ALINTI_METIN, tarih: bugunISO(-2) }
    ]
  })]);
  await rafAc(page);   // tohumla YALNIZ init script yazar — gezinmeyi bu yapar
  await page.evaluate(() => window.__ozet.hazirBekle());
  const id = await page.evaluate(() => veri.kitaplar[0].id);
  /* SIRAYLA: ozet ve ontoloji AYNI IDB kaydinin iki alani — paralel yazim
     birbirini eziyor (Promise.all ile ozet kayboluyordu). */
  await page.evaluate(([i, o]) => window.__ozet.kaydet(i, o), [id, OZET]);
  await page.evaluate(([i, n]) => window.__ozet.kaydetOnto(i, n), [id, ONTO]);
  await page.evaluate(() => hepsiniCiz());
  await page.click('#liste .kart:has-text("Olcum Kitabi")');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}

/* Ayarlar KAPALI oldugu icin .oz-metin / .not-metin sayfada TEKILDIR —
   onizleme yalnizca pencere acikken yasar (bkz. tipografiSil). */
const olc = page => page.evaluate(() => {
  const al = s => {
    const e = document.querySelector(s);
    if (!e) return null;
    const c = getComputedStyle(e), p = e.querySelector('p');
    return {
      fs: c.fontSize, lh: c.lineHeight,
      ff: c.fontFamily.split(',')[0].replace(/['"]/g, ''),
      mw: c.maxWidth,
      pMarj: p ? getComputedStyle(p).marginBottom : null,
      pSayi: e.querySelectorAll('p').length,
      html: e.innerHTML
    };
  };
  return {
    ozet: al('#ortuDetay .oz-metin'),
    not: al('#ortuDetay .not-kart:not(.alinti) .not-metin'),
    alinti: al('#ortuDetay .not-kart.alinti .not-metin')
  };
});

async function olcOnto(page) {
  await page.click('#msSekmeOnto');
  const o = await page.evaluate(() => {
    const e = document.querySelector('.onto-metin'), c = getComputedStyle(e), p = e.querySelector('p');
    return {
      fs: c.fontSize, lh: c.lineHeight,
      ff: c.fontFamily.split(',')[0].replace(/['"]/g, ''),
      mw: c.maxWidth, pMarj: p ? getComputedStyle(p).marginBottom : null
    };
  });
  await page.click('#msSekmeOzet');
  return o;
}

const ayarla = (page, k, v) => page.evaluate(([kk, vv]) => window.tipografiYaz(kk, vv), [k, v]);

/* [anahtar, deger, olculen alan] */
const ADIMLAR = [
  ['fs', 1.25, 'fs'],
  ['lh', 1.25, 'lh'],
  ['pb', '2.1em', 'pMarj'],
  ['olcu', '34em', 'mw'],
  ['font', 'sistem', 'ff']
];

test.describe('G104 okuma tipografisi', () => {
  test('(a) markdown tutarlılığı: not ve alıntı gövdesi de mdMini’den geçer', async ({ page }) => {
    await kur(page);
    const s = await olc(page);
    for (const yuzey of ['not', 'alinti']) {
      expect(s[yuzey].html, yuzey + ' kalın').toContain('<strong>');
      expect(s[yuzey].pSayi, yuzey + ' iki paragraf').toBe(2);
      expect(s[yuzey].html, yuzey + ' ham yıldız kalmamalı').not.toContain('**');
    }
    expect(s.not.html, 'not italik').toContain('<em>');
    /* pre-wrap KALKTI: satır sonlarının sahibi mdMini. */
    const ws = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#ortuDetay .not-metin')).whiteSpace);
    expect(ws).not.toBe('pre-wrap');
    /* İlk <p> ÜST marj almamalı — tarayıcı varsayılanı sızarsa notlar aşağı kayar. */
    const ustMarj = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#ortuDetay .not-metin p')).marginTop);
    expect(ustMarj).toBe('0px');
  });

  test('(b) her ayar dört okuma yüzeyini birden tutar', async ({ page }) => {
    await kur(page);
    const taban = await olc(page);
    const ontoTaban = await olcOnto(page);
    for (const [k, v, alan] of ADIMLAR) {
      await ayarla(page, k, v);
      const s = await olc(page);
      const o = await olcOnto(page);
      expect(s.ozet[alan], k + ' özeti değiştirmedi').not.toBe(taban.ozet[alan]);
      expect(o[alan], k + ' ontolojiyi değiştirmedi').not.toBe(ontoTaban[alan]);
      expect(s.not[alan], k + ' notu değiştirmedi').not.toBe(taban.not[alan]);
      expect(s.alinti[alan], k + ' alıntıyı değiştirmedi').not.toBe(taban.alinti[alan]);
      await ayarla(page, k, null);
    }
  });

  test('(c) VARSAYILAN BOZULMAZ: sıfırlama tabana birebir döner, jeton bırakmaz', async ({ page }) => {
    await kur(page);
    const taban = await olc(page);
    const ontoTaban = await olcOnto(page);
    for (const [k, v] of ADIMLAR) await ayarla(page, k, v);
    expect((await olc(page)).ozet.fs, 'ayarlar gerçekten uygulandı').not.toBe(taban.ozet.fs);
    await page.evaluate(() => window.tipografiSifirla());
    expect(await olc(page)).toEqual(taban);
    expect(await olcOnto(page)).toEqual(ontoTaban);
    expect(await page.evaluate(() => localStorage.getItem('kk_tipografi_v1'))).toBe(null);
    const kalan = await page.evaluate(() =>
      ['--tipo-kok', '--tipo-oku', '--tipo-lh', '--tipo-pb', '--tipo-olcu', '--tipo-font']
        .filter(j => document.documentElement.style.getPropertyValue(j) !== ''));
    expect(kalan, 'kök elemanda --tipo-* jetonu kalmamalı').toEqual([]);
  });

  test('(d) yedek turu: tercihler.tipografi yazılır, geri yüklenir, mevcut ayarı EZMEZ', async ({ page }) => {
    await kur(page);
    await ayarla(page, 'fs', 1.1);
    await ayarla(page, 'font', 'cormorant');
    await ayarla(page, 'olcu', '42em');
    const yedek = await page.evaluate(() => JSON.parse(JSON.stringify({
      surum: YEDEK_SURUM, tarih: new Date().toISOString(), ...veri,
      ozetler: window.__ozet.hepsiDisa(), tercihler: tercihleriTopla()
    })));
    expect(JSON.parse(yedek.tercihler.tipografi)).toEqual({ fs: 1.1, font: 'cormorant', olcu: '42em' });

    /* temiz cihaz taklidi → iceAktar tercihler dalının AYNI kodu */
    await page.evaluate(() => { localStorage.removeItem('kk_tipografi_v1'); window.tipografiUygula({}); });
    const geri = await page.evaluate(y => {
      const t = y.tercihler || {};
      const ok = !!(t.tipografi && !localStorage.getItem('kk_tipografi_v1')
        && window.tipografiHamYaz && window.tipografiHamYaz(t.tipografi));
      return { ok, okunan: window.tipografiOku() };
    }, yedek);
    expect(geri.ok).toBe(true);
    expect(geri.okunan).toEqual({ fs: 1.1, font: 'cormorant', olcu: '42em' });
    const s = await olc(page);
    expect(s.ozet.ff).toBe('Cormorant Garamond');
    expect(s.ozet.mw).not.toBe('none');

    /* cihazda ayar VARSA yedek onu ezmez (tema/görünüm ile aynı kural) */
    await ayarla(page, 'fs', 0.92);
    const ezme = await page.evaluate(y => !!(y.tercihler.tipografi
      && !localStorage.getItem('kk_tipografi_v1')), yedek);
    expect(ezme, 'mevcut cihaz tercihi ezilmemeli').toBe(false);
  });

  test('(e) güvenilmez değer süzülür: yalnız SEÇENEK tablosundaki geçer', async ({ page }) => {
    await kur(page);
    await page.evaluate(() =>
      window.tipografiHamYaz('{"fs":99,"font":"comic sans","olcu":"calc(kotu)","lh":1.12}'));
    expect(await page.evaluate(() => window.tipografiOku())).toEqual({ lh: 1.12 });
    const jetonlar = await page.evaluate(() => ({
      kok: document.documentElement.style.getPropertyValue('--tipo-kok'),
      font: document.documentElement.style.getPropertyValue('--tipo-font'),
      olcu: document.documentElement.style.getPropertyValue('--tipo-olcu')
    }));
    expect(jetonlar).toEqual({ kok: '', font: '', olcu: '' });
    /* bozuk gövde hiç yazmamalı */
    expect(await page.evaluate(() => window.tipografiHamYaz('bu json degil'))).toBe(false);
  });

  test('(f) önizleme YALNIZ Ayarlar açıkken yaşar (okuma yüzeyi ikizlenmesin)', async ({ page }) => {
    await kur(page);
    expect(await page.locator('.oz-metin').count(), 'kapalıyken tekil').toBe(1);
    await page.click('[data-act="detay-kapat"]');
    await page.click('[data-act="ayar-ac"]');
    /* v106: gruplar KAPALI açılır — panel tek ekrana sığsın. */
    const acikSayisi = await page.evaluate(() =>
      [...document.querySelectorAll('#ortuAyar details.ayg-grup')].filter(g => g.open).length);
    expect(acikSayisi, 'gruplar kapalı açılır').toBe(0);
    /* Durum şeridi KATLANMAZ: grup kapalıyken de görünür (Kaan kararı —
       "baktığın şeyler" kapağın arkasında durmaz). */
    await expect(page.locator('#aydSerit')).toBeVisible();
    /* tipografi "Görünüm ve okuma" grubunun içinde — çipi görmek için aç. */
    await page.click('#aygGorunum summary.ayg-bas');
    await expect(page.locator('#ayBolumTipografi .tp-chip').first()).toBeVisible();
    expect(await page.locator('#tpOnizleme .oz-metin').count()).toBe(1);
    await page.click('[data-act="ayar-kapat"]');
    expect(await page.locator('#tpOnizleme .oz-metin').count(), 'kapanınca silinir').toBe(0);
  });
});

test.describe('G104b kapsam ve sönüm (v105)', () => {
  /* Kok olceginin dokundugu temsili yuzeyler: gorunur ve her zaman var. */
  const KADEME = {
    kok: 'html',
    govde: 'body',
    kartBaslik: '#liste .kart .kart-baslik',
    kicker: '#panel-raf .kicker',
    navEtiket: '.nav-btn .n-etiket'
  };
  const px = (page, sec) => page.evaluate(s => {
    const e = document.querySelector(s);
    return e ? parseFloat(getComputedStyle(e).fontSize) : null;
  }, sec);

  async function liste(page) {
    await tohumla(page, [sahteKitap({ ad: 'Kapsam Kitabi', yazar: 'Yazar' })]);
    await rafAc(page);
  }

  test('(g) boyut TÜM uygulamayı tutar — kök, gövde, kart, kicker', async ({ page }) => {
    await liste(page);
    const once = {};
    for (const [ad, sec] of Object.entries(KADEME)) once[ad] = await px(page, sec);
    await page.evaluate(() => window.tipografiYaz('fs', 1.25));
    for (const ad of ['kok', 'govde', 'kartBaslik', 'kicker']) {
      const sonra = await px(page, KADEME[ad]);
      expect(sonra / once[ad], ad + ' arayüz kazancı').toBeCloseTo(1.125, 3);
    }
  });

  test('(h) KÖR ÇARPAN DEĞİL: okuma > arayüz > sekme çubuğu', async ({ page }) => {
    await liste(page);
    const navOnce = await px(page, KADEME.navEtiket);
    const kartOnce = await px(page, KADEME.kartBaslik);
    const okuOnce = await page.evaluate(() => {
      const d = document.createElement('div'); d.className = 'oz-metin';
      document.body.appendChild(d);
      const v = parseFloat(getComputedStyle(d).fontSize); d.remove(); return v;
    });
    await page.evaluate(() => window.tipografiYaz('fs', 1.25));
    const navSonra = await px(page, KADEME.navEtiket);
    const kartSonra = await px(page, KADEME.kartBaslik);
    const okuSonra = await page.evaluate(() => {
      const d = document.createElement('div'); d.className = 'oz-metin';
      document.body.appendChild(d);
      const v = parseFloat(getComputedStyle(d).fontSize); d.remove(); return v;
    });
    const okuK = okuSonra / okuOnce, arayuzK = kartSonra / kartOnce, navK = navSonra / navOnce;
    expect(okuK, 'okuma TAM kazanç').toBeCloseTo(1.25, 3);
    expect(arayuzK, 'arayüz yarı kazanç').toBeCloseTo(1.125, 3);
    expect(navK, 'sekme çubuğu çeyrek kazanç').toBeCloseTo(1.0625, 3);
    expect(okuK).toBeGreaterThan(arayuzK);
    expect(arayuzK).toBeGreaterThan(navK);
  });

  test('(i) 320px’te en ağır ayar sekme çubuğunu taşırmaz', async ({ page }) => {
    await liste(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => { window.tipografiYaz('fs', 1.25); window.tipografiYaz('lh', 1.25); });
    const d = await page.evaluate(() => {
      const n = document.querySelector('nav');
      const b = [...n.querySelectorAll('.nav-btn')];
      return {
        tasma: n.scrollWidth - n.clientWidth,
        satir: new Set(b.map(x => Math.round(x.getBoundingClientRect().top))).size,
        belge: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(d.tasma, 'sekme çubuğu taşması').toBeLessThanOrEqual(0);
    expect(d.satir, 'sekme çubuğu TEK satır').toBe(1);
    expect(d.belge, 'belge yatay taşması').toBeLessThanOrEqual(0);
  });

  test('(j) yazı ailesi TÜM gövdeyi çevirir, başlık ailesi (--serif) sabit kalır', async ({ page }) => {
    await liste(page);
    const serifOnce = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--serif').trim());
    const govdeOnce = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, ''));
    expect(govdeOnce).toBe('Lora');
    await page.evaluate(() => window.tipografiYaz('font', 'sistem'));
    const govdeSonra = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, ''));
    expect(govdeSonra, 'gövde ailesi uygulama geneli değişti').toBe('system-ui');
    const serifSonra = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--serif').trim());
    expect(serifSonra, 'başlık ailesi DEĞİŞMEZ').toBe(serifOnce);
  });

  test('(k) okuma-özel ayarlar arayüze SIZMAZ', async ({ page }) => {
    await liste(page);
    const once = await page.evaluate(() => {
      const k = document.querySelector('#liste .kart .kart-baslik'), c = getComputedStyle(k);
      return { lh: c.lineHeight, mw: c.maxWidth };
    });
    await page.evaluate(() => { window.tipografiYaz('lh', 1.25); window.tipografiYaz('olcu', '34em'); });
    const sonra = await page.evaluate(() => {
      const k = document.querySelector('#liste .kart .kart-baslik'), c = getComputedStyle(k);
      return { lh: c.lineHeight, mw: c.maxWidth };
    });
    expect(sonra, 'satır yüksekliği ve satır uzunluğu kartlara inmemeli').toEqual(once);
  });
});
