'use strict';
/* G46 — İstatistik ekranı "Rakamlar" (v54 Ciltli).
   Ekran ESKİ dilden (yuvarlak kartlar, gölge, kart içi başlıklar) Ciltli'ye
   geçti: kıl payı ayraçlı bölümler, kicker etiketler, Cormorant tabular sayılar,
   dolgusuz çubuklar. İÇERİK DEĞİŞMEDİ — bu dosyanın asıl işi bunu kanıtlamak.

   SÖZLEŞMELER:
   - Kutu YOK (dolgu/gölge/yarıçap), dolu düğme YOK, kicker altın+versal+aralıklı.
   - HİYERARŞİ: hero (bu yıl) → Toplam → 5 bölüm sabit sırada.
   - Dört yazıcı (çekirdek + zeka.js + rapor.js + oturum.js) kendi ANLAM
     YUVASINA yazar; ekran sonuna yığılma yok. Yuvalar DOM sırasında da doğru
     yerde — görsel sıra ile klavye/okuma sırası ayrışmıyor.
   - Uzun listeler <details> ile katlı gelir; ÖZET satırı sayıyı taşır (katlama
     sayıyı değil dökümü gizler).
   - Payda ("N kitaptan") korunur; PNG krem kalır.
   (Mutasyon 1: bir bölümü kaldır → "bölümlerin hiçbiri kaybolmadı" kırmızı.
    Mutasyon 2: PNG zeminini tema değişkenine bağla → krem vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap, bugunISO } = require('./yardim');

const YIL = new Date().getFullYear();
const gun = (y, a, g) => `${y}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
const st = Date.now() - 3 * 86400000;

/* Her bölümü besleyen ZENGİN fikstür: bitmiş+puanlı (tür/yazar eşiklerini geçen),
   puansız bitmiş (payda köprüsü), yarım (bırakma), oturumlu (saat + süreklilik),
   geçen yıl (yıllara göre + karşılaştırma), okunacak. */
function zenginKutuphane() {
  const k = (ad, ek) => sahteKitap(Object.assign({ ad, sayfa: 300, tur: 'Roman',
    durum: 'bitti', puan: 8, baslamaTarihi: gun(YIL, 1, 1), bitisTarihi: gun(YIL, 2, 1) }, ek));
  return [
    k('Kürk Mantolu Madonna', { yazar: 'Sabahattin Ali', puan: 9, sayfa: 160,
      baslamaTarihi: gun(YIL, 3, 1), bitisTarihi: gun(YIL, 3, 12),
      oturumlar: [{ b: st, s: 3600000, sa: 0, sb: 60 },
                  { b: st + 3600000 * 20, s: 5400000, sa: 60, sb: 160 }] }),
    k('İçimizdeki Şeytan', { yazar: 'Sabahattin Ali', puan: 7, sayfa: 250, bitisTarihi: gun(YIL, 4, 1) }),
    k('Tutunamayanlar', { yazar: 'Oğuz Atay', puan: 10, sayfa: 724, bitisTarihi: gun(YIL, 5, 2) }),
    k('Beş Şehir', { yazar: 'Ahmet Hamdi Tanpınar', tur: 'Deneme', puan: 8, sayfa: 240,
      bitisTarihi: gun(YIL, 7, 3) }),
    k('Huzur', { yazar: 'Ahmet Hamdi Tanpınar', puan: 9, sayfa: 380, bitisTarihi: gun(YIL, 8, 1) }),
    k('Puansız Bitmiş', { yazar: 'Biri', puan: null, bitisTarihi: gun(YIL, 4, 4) }),
    k('Geçen Yılki', { yazar: 'Victor Hugo', puan: 10, sayfa: 1400, bitisTarihi: gun(YIL - 1, 4, 2) }),
    sahteKitap({ ad: 'Yarım Kalan', yazar: 'Başkası', tur: 'Tarih', durum: 'yarim',
      sayfa: 400, guncelSayfa: 120 }),
    sahteKitap({ ad: 'Okunacak Bir Şey', yazar: 'Yeni Yazar', tur: 'Şiir', durum: 'okunacak' })
  ];
}
function veriPaketi() {
  return { kitaplar: zenginKutuphane(), hedef: { [YIL]: 8 }, hedefSayfa: { [YIL]: 4000 } };
}
async function istAc(page, veri) {
  await tohumla(page, veri || veriPaketi());
  await page.goto('/');
  await page.click('nav [data-act="sekme"][data-v="ist"]');
  await expect(page.locator('#istIcerik .is-hero')).toBeVisible();
  await expect(page.locator('#rpKart')).toBeVisible();      // eklentiler yerleşti
  await expect(page.locator('#oturumIst')).toBeVisible();
}
/* WCAG kontrast: alfa karışımını da çözen gerçek-render ölçümü */
async function kontrast(page, metinSec, zeminSec) {
  return page.evaluate(([ms, zs]) => {
    const COZ = z => {
      let m = z.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = z.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return { r: 0, g: 0, b: 0, a: 1 };
    };
    const me = document.querySelector(ms), ze = document.querySelector(zs || ms);
    if (!me || !ze) return null;
    const metin = COZ(getComputedStyle(me).color);
    let zemin = { r: 255, g: 255, b: 255 }, kat = [], p = ze;
    while (p && p !== document.documentElement) {
      const c = COZ(getComputedStyle(p).backgroundColor);
      if (c.a > 0) { kat.push(c); if (c.a >= 1) break; }
      p = p.parentElement;
    }
    for (let i = kat.length - 1; i >= 0; i--) {
      const c = kat[i];
      zemin = { r: c.r * c.a + zemin.r * (1 - c.a), g: c.g * c.a + zemin.g * (1 - c.a),
        b: c.b * c.a + zemin.b * (1 - c.a) };
    }
    const L = c => { const f = v => { v /= 255;
      return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
    const l1 = L(metin), l2 = L(zemin);
    return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
  }, [metinSec, zeminSec]);
}

test.describe('G46 Rakamlar ekranı — Ciltli', () => {

  /* ---------- dil ---------- */
  test('kutu dili YOK: yuvarlak köşe, gölge, dolgulu yüzey kalmadı', async ({ page }) => {
    await istAc(page);
    const kacaklar = await page.evaluate(() => {
      const A = z => { const m = z.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        return m ? (m[4] === undefined ? 1 : +m[4]) : 0; };
      return [...document.querySelectorAll('#istIcerik *')]
        .filter(el => el.offsetParent !== null && el.tagName !== 'INPUT')
        .map(el => { const c = getComputedStyle(el);
          return { et: el.tagName + '.' + el.className,
            r: parseFloat(c.borderRadius) || 0, golge: c.boxShadow, zemin: A(c.backgroundColor) }; })
        .filter(o => o.r > 7 || o.golge !== 'none');
    });
    expect(kacaklar).toEqual([]);
    // eski kutu sınıfları tamamen emekli
    for (const s of ['.ist-kart', '.ist-grid', '.zk-kart', '.rp-kart', '.hedef-bar']) {
      expect(await page.locator('#istIcerik ' + s).count(), s + ' kalmadı').toBe(0);
    }
  });

  test('görünür DOLU düğme yok (hepsi kontur)', async ({ page }) => {
    await istAc(page);
    const dolular = await page.evaluate(() => {
      const A = z => { const m = z.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        return m ? (m[4] === undefined ? 1 : +m[4]) : 0; };
      return [...document.querySelectorAll('#istIcerik button')]
        .filter(el => el.offsetParent !== null && A(getComputedStyle(el).backgroundColor) >= 0.5)
        .map(el => el.textContent.trim().slice(0, 30));
    });
    expect(dolular).toEqual([]);
    // seçili yıl çipi de dolgu DEĞİL kontur+tint ile işaretlenir
    await expect(page.locator('#rpYillar .rp-secili')).toHaveCount(1);
  });

  test('kicker etiketleri altın + BÜYÜK HARF + harf aralıklı', async ({ page }) => {
    await istAc(page);
    const k = await page.evaluate(() => {
      const kok = getComputedStyle(document.documentElement).getPropertyValue('--brass').trim();
      return [...document.querySelectorAll('#istIcerik .kicker')].map(el => {
        const c = getComputedStyle(el);
        return { metin: el.textContent, versal: c.textTransform,
          aralik: parseFloat(c.letterSpacing), renk: c.color, kokBrass: kok };
      });
    });
    expect(k.length, 'her bölümde bir kicker').toBeGreaterThanOrEqual(6);
    for (const x of k) {
      expect(x.versal, x.metin).toBe('uppercase');
      expect(x.aralik, x.metin + ' harf aralığı').toBeGreaterThan(0.5);
    }
    // altın: kicker rengi --brass ile aynı (hex→rgb dönüşümü tarayıcıda yapılır)
    const ayni = await page.evaluate(() => {
      const p = document.createElement('span');
      p.style.color = getComputedStyle(document.documentElement).getPropertyValue('--brass').trim();
      document.body.appendChild(p);
      const beklenen = getComputedStyle(p).color;
      p.remove();
      return getComputedStyle(document.querySelector('#istIcerik .kicker')).color === beklenen;
    });
    expect(ayni, 'kicker altın').toBe(true);
  });

  /* ---------- hiyerarşi ---------- */
  test('HİYERARŞİ: hero üstte (bu yıl), bölümler sabit sırada', async ({ page }) => {
    await istAc(page);
    // hero: üç sayı — bu yıl kitap, bu yıl sayfa, hedef durumu
    const hero = await page.locator('#istHero .is-hero-sayi').allTextContents();
    expect(hero.length).toBe(3);
    expect(hero[0]).toBe('6');              // bu yıl biten 6 kitap (5 puanlı + 1 puansız)
    expect(hero[1]).toBe('2.054');          // 160+250+724+240+380+300 = 2.054 sayfa
    expect(hero[2]).toBe('%75');            // 6/8
    // hero DOM'da ilk bölümden ÖNCE
    const sira = await page.evaluate(() =>
      [...document.querySelectorAll('#istIcerik > *')].map(e => e.id || e.className));
    expect(sira[1]).toBe('istHero');
    // bölüm sırası: Toplam → hedefler → alışkanlık → zevk → tarihçe → rapor
    const bolumler = await page.evaluate(() =>
      [...document.querySelectorAll('#istIcerik .is-bolum')].filter(b => !b.hidden).map(b => b.id));
    expect(bolumler).toEqual(['istBolumToplam', 'istBolumHedef', 'istBolumAliskanlik',
      'istBolumZevk', 'istBolumTarihce', 'istBolumRapor']);
  });

  test('eklentiler kendi YUVASINA yazar (ekran sonuna yığılmaz)', async ({ page }) => {
    await istAc(page);
    const yer = await page.evaluate(() => {
      const bolum = id => { const e = document.getElementById(id);
        return e ? (e.closest('.is-bolum') || {}).id : null; };
      return { sayfaHedefi: bolum('zkSayfaHedefKart'), sureklilik: bolum('oturumIst'),
        birakma: bolum('zkBirakmaKart'), saat: bolum('zkSaatKart'),
        zevk: bolum('zkPuanKart'), fiilen: bolum('zkAylikKart'), rapor: bolum('rpKart') };
    });
    expect(yer).toEqual({
      sayfaHedefi: 'istBolumHedef', sureklilik: 'istBolumAliskanlik',
      birakma: 'istBolumAliskanlik', saat: 'istBolumAliskanlik',
      zevk: 'istBolumZevk', fiilen: 'istBolumTarihce', rapor: 'istBolumRapor' });
  });

  /* ---------- HİÇBİR İSTATİSTİK KAYBOLMADI ---------- */
  test('TÜM bölümler hâlâ mevcut (18 kalem varlık denetimi)', async ({ page }) => {
    await istAc(page);
    await page.locator('#istPuanDagilim summary').click();     // katlıları aç
    await page.locator('#istAylikSayfa summary').click();
    await page.locator('#zkAylikKatla summary').click();
    /* innerText CSS text-transform'u UYGULAR (etiketler BÜYÜK döner) — ham metin
       için textContent kullanılır (g28/g35 ile aynı taban). */
    const g = await page.locator('#istIcerik').textContent();
    const bekle = [
      ['hero — bu yıl kitap/sayfa/hedef', /kitap[\s\S]*sayfa[\s\S]*hedefi/i],
      ['bitirilen kitap', /Bitirilen kitap/i],
      ['bu yıl içinde bitirilen', new RegExp(YIL + ' içinde bitirilen', 'i')],
      ['okunan toplam sayfa', /Okunan toplam sayfa/i],
      ['ortalama puan + payda', /Ortalama puan\s*\(\d+ kitaptan\)/i],
      ['puansız köprüsü', /bitmiş kitap henüz puansız/i],
      ['kitap hedefi', /Kitap hedefi/],
      ['sayfa hedefi', /Sayfa hedefi/],
      ['ortalama bitirme süresi', /Ortalama bitirme süresi/],
      ['süreklilik (oturum)', /Süreklilik[\s\S]*gün üst üste/i],
      ['bırakma analizi', /Bitirme ve yarım kalanlar/],
      ['saat dağılımı', /Günün hangi saatinde okuyorsun/],
      ['tür/yazar puan analizi', /Neyden keyif alıyorsun/],
      ['puan dağılımı', /Puan dağılımı/],
      ['en çok bitirdiğin yazarlar', /En çok bitirdiğin yazarlar/],
      ['türlere göre', /Türlere göre \(tüm raf\)/],
      ['en yüksek puanlılar', /En yüksek puanlılar/],
      ['yıllara göre', /Yıllara göre kitap/],
      ['aylık sayfa', /Aylık sayfa \(son 12 ay\)/],
      ['fiilen okunan sayfa', /Fiilen okuduğun sayfa \(son 12 ay\)/],
      ['yıl sonu raporu', /kitap bitirdin/i]
    ];
    const eksik = bekle.filter(([, re]) => !re.test(g)).map(([ad]) => ad);
    expect(eksik, 'kaybolan bölüm').toEqual([]);
    // ısı şeridi 30 kutu + rapor ay grafiği 12 çubuk hâlâ çiziliyor
    await expect(page.locator('#oturumIst [title]')).toHaveCount(30);
    await expect(page.locator('#rpAylar .rp-ay')).toHaveCount(12);
  });

  test('PAYDA ifadeleri görünür ve doğru', async ({ page }) => {
    await istAc(page);
    const g = await page.locator('#istIcerik').textContent();
    // 6 puanlı bitmiş kitap var (Puansız Bitmiş hariç 6'sı puanlı)
    expect(g).toMatch(/Ortalama puan\s*\(6 kitaptan\)/);
    expect(g).toMatch(/\(7 kitaptan; başlama-bitiş tarihi girilenler\)/);
    expect(g).toMatch(/\(1 kitaptan; sayfa bilgisi girilenler\)/);
    expect(g).toMatch(/Bitirdiğin 6 kitabın sayfa toplamı sayılır/);
    /* Yıl sonu raporunun paydası AYRI tabandan: bu yıl biten 6 kitabın 5'i
       puanlı → "(5 kitaptan)". Üstteki Toplam ise tüm zamanlar (6). İki payda
       farklı çıkması DOĞRU; aynı çıksaydı biri yanlış hesaplanıyor olurdu. */
    expect(g).toMatch(/ortalama puan \(5 kitaptan\)/);
    /* Payda AYRI tipografik rol taşır. Punto KARŞILAŞTIRMASI ölçüt değil:
       etiket versal (.62rem büyük harf) — aynı puntoda bile paydadan iri
       görünür; ölçülebilir ayrım rol nitelikleri: kendi satırı, versal DEĞİL,
       ve etiketten daha kısık renk. */
    const p = await page.evaluate(() => {
      const et = document.querySelector('#istOrtPuan').parentElement.querySelector('.ist-etiket');
      const pa = document.querySelector('#istIcerik .is-payda');
      const a = getComputedStyle(et), b = getComputedStyle(pa);
      return { etiketRenk: a.color, etiketVersal: a.textTransform,
        paydaRenk: b.color, paydaVersal: b.textTransform, blok: b.display };
    });
    expect(p.blok, 'payda kendi satırında').toBe('block');
    expect(p.etiketVersal).toBe('uppercase');
    expect(p.paydaVersal, 'payda versal DEĞİL').toBe('none');
    expect(p.paydaRenk, 'payda etiketten kısık renkte').not.toBe(p.etiketRenk);
  });

  /* ---------- katlama ---------- */
  test('uzun listeler KATLI gelir; özet satırı sayıyı taşır; açılıp kapanır', async ({ page }) => {
    await istAc(page);
    const katlar = ['istPuanDagilim', 'istAylikSayfa', 'zkAylikKatla'];
    for (const id of katlar) {
      const d = page.locator('#' + id);
      await expect(d, id + ' katlanır bölüm').toHaveCount(1);
      expect(await d.evaluate(e => e.open), id + ' kapalı başlar').toBe(false);
      // KAPALIYKEN de özet gerçek sayı taşır — katlama sayıyı gizlemiyor
      await expect(d.locator('.is-katla-ozet')).toBeVisible();
      await expect(d.locator('.is-katla-ozet')).toContainText(/\d/);
      // döküm gizli
      await expect(d.locator('.bar-satir,.zk-bar-satir').first()).toBeHidden();
      await d.locator('summary').click();
      expect(await d.evaluate(e => e.open), id + ' açılır').toBe(true);
      await expect(d.locator('.bar-satir,.zk-bar-satir').first()).toBeVisible();
      await d.locator('summary').click();
      expect(await d.evaluate(e => e.open), id + ' kapanır').toBe(false);
    }
    // 12 aylık eksen KATLI hâlde de DOM'da tam duruyor (sayı kaybolmadı)
    await expect(page.locator('#istAylikSayfa .bar-satir')).toHaveCount(12);
  });

  test('sıfır ayların sessiz gösterimi korunuyor (katlı bölümün içinde)', async ({ page }) => {
    await istAc(page);
    const d = page.locator('#istAylikSayfa');
    await expect(d.locator('.bar-satir.bar-sifir').first()).toHaveCount(1);
    expect(await d.locator('.bar-satir.bar-sifir .bar-govde > div').count()).toBe(0);
    expect(await d.locator('.bar-satir:not(.bar-sifir) .bar-govde > div').count())
      .toBeGreaterThan(0);
  });

  /* ---------- etkileşim ---------- */
  test('KİTAP hedefi girilir, kaydedilir, hero ve ilerleme günceller', async ({ page }) => {
    await istAc(page, { kitaplar: zenginKutuphane(), hedef: {}, hedefSayfa: {} });
    await expect(page.locator('#istHeroHedef')).toHaveText('—');
    await page.fill('#hedefInput', '10');
    await page.click('[data-act="hedef-kaydet"]');
    await expect(page.locator('#istHeroHedef')).toHaveText('%60');
    await expect(page.locator('#istIcerik')).toContainText('6 / 10');
    expect(await page.evaluate(y => veri.hedef[y], YIL)).toBe(10);
    // hedef kaydı diğer bölümleri düşürmez
    await expect(page.locator('#oturumIst')).toBeVisible();
    await expect(page.locator('#rpKart')).toBeVisible();
    await expect(page.locator('#zkSayfaHedefKart')).toBeVisible();
  });

  test('SAYFA hedefi ayrı girilir ve kaydedilir', async ({ page }) => {
    await istAc(page, { kitaplar: zenginKutuphane(), hedef: {}, hedefSayfa: {} });
    await page.fill('#zkHedefSayfaGiris', '3000');
    await page.click('[data-act="zk-hedef-kaydet"]');
    expect(await page.evaluate(y => veri.hedefSayfa[y], YIL)).toBe(3000);
    await expect(page.locator('#zkSayfaBar')).toBeVisible();
    await expect(page.locator('#zkSayfaHedefKart')).toContainText('2.054 / 3.000');
    // iki hedef AYRI: kitap hedefi hâlâ boş
    expect(await page.evaluate(y => veri.hedef[y] || 0, YIL)).toBe(0);
  });

  test('yıl seçici çalışır; PNG üretilir ve KREM kalır (tema bağımsız)', async ({ page }) => {
    await istAc(page);
    await expect(page.locator('#rpYillar [data-v="' + YIL + '"]')).toHaveClass(/rp-secili/);
    await page.click('#rpYillar [data-v="' + (YIL - 1) + '"]');
    await expect(page.locator('#rpYillar [data-v="' + (YIL - 1) + '"]')).toHaveClass(/rp-secili/);
    await expect(page.locator('#rpSayilar')).toContainText('1.400');   // geçen yılın sayfası
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#istIcerik [data-act="rp-png"]')
    ]);
    expect(indirme.suggestedFilename()).toBe('pinakes-' + (YIL - 1) + '.png');
    const zemin = await page.evaluate(y => {
      const t = document.createElement('canvas');
      window.__rapor.raporCiz(t, window.__rapor.yilOzeti(y));
      const d = t.getContext('2d').getImageData(4, 4, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], w: t.width, h: t.height };
    }, YIL - 1);
    expect(zemin).toEqual({ r: 245, g: 239, b: 227, w: 1080, h: 1350 });
  });

  test('boş kütüphanede anlamlı mesaj, çökme yok', async ({ page }) => {
    const hatalar = [];
    page.on('pageerror', e => hatalar.push(String(e)));
    await tohumla(page, []);
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    await expect(page.locator('#istIcerik .bos')).toContainText('önce kitap eklemen gerek');
    await expect(page.locator('#istIcerik .is-bolum')).toHaveCount(0);
    expect(hatalar, 'çökme yok').toEqual([]);
  });

  test('veri seyrekse boş bölüm kicker\'ı ortada kalmaz', async ({ page }) => {
    // yalnız bir okunacak kitap: bitmiş yok → alışkanlık/zevk/tarihçe boş
    await tohumla(page, { kitaplar: [sahteKitap({ ad: 'Tek', durum: 'okunacak' })],
      hedef: {}, hedefSayfa: {} });
    await page.goto('/');
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    await expect(page.locator('#istIcerik .is-hero')).toBeVisible();
    const gorunen = await page.evaluate(() =>
      [...document.querySelectorAll('#istIcerik .is-bolum')].filter(b => !b.hidden).map(b => b.id));
    expect(gorunen).not.toContain('istBolumZevk');
    expect(gorunen).not.toContain('istBolumTarihce');
    expect(gorunen).toContain('istBolumToplam');
  });

  /* ---------- kontrast ---------- */
  for (const tema of ['acik', 'karanlik']) {
    test(`kontrast AA — dört ayrı bölüm (${tema} tema)`, async ({ page }) => {
      await tohumla(page, veriPaketi(), { kk_tema_v1: tema });
      await page.goto('/');
      await page.click('nav [data-act="sekme"][data-v="ist"]');
      await expect(page.locator('#rpKart')).toBeVisible();
      const ciftler = [
        ['#istHero .is-hero-sayi', '#istHero', 'hero sayısı'],
        ['#istHero .is-hucre-ad', '#istHero', 'hero etiketi'],
        ['#istBolumToplam .ist-sayi', '#istBolumToplam', 'toplam sayısı'],
        ['#istBolumToplam .is-payda', '#istBolumToplam', 'payda'],
        ['#istBolumHedef .kicker', '#istBolumHedef', 'kicker'],
        ['#istBolumHedef .mini-not', '#istBolumHedef', 'hedef notu'],
        ['#istBolumZevk .bar-ad', '#istBolumZevk', 'çubuk adı'],
        ['#istBolumZevk .is-katla-ozet', '#istBolumZevk', 'katlama özeti'],
        ['#istBolumZevk .zk-bar-adet', '#istBolumZevk', 'çubuk adedi'],
        ['#istBolumAliskanlik .zk-buyuk', '#istBolumAliskanlik', 'oran sayısı'],
        ['#istBolumAliskanlik .zk-not', '#istBolumAliskanlik', 'alışkanlık notu'],
        ['#istBolumRapor .rp-etiket', '#istBolumRapor', 'rapor etiketi'],
        ['#istBolumRapor .rp-yil', '#istBolumRapor', 'yıl çipi'],
        ['#istBolumRapor [data-act="rp-png"]', '#istBolumRapor', 'PNG düğmesi']
      ];
      for (const [m, z, ad] of ciftler) {
        const o = await kontrast(page, m, z);
        expect(o, ad + ' ölçülemedi').not.toBeNull();
        expect(o, `${ad} (${tema}): ${o && o.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
