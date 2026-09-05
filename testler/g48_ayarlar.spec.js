'use strict';
/* G48 — Ayarlar penceresi Ciltli (v56). Ciltli dönüşümünün SON parçası.
   ÖNCE: 9 adet `.yedek-kart` yuvarlak kutu (zemin + kenarlık + gölge), senkron
   ve katalog eklentileri `.yedek-wrap`'in BAŞINA kendini sokuyordu — ikisinin
   sırası hangisinin sonra koştuğuna bağlıydı. ÖLÇÜM: içerik yüksekliği
   1966px → 1757px (−209px, %10,6).

   SONRA: 8 kicker'lı bölüm (v61: Hatırlatma, v63: Zenginleştir), kıl payı
   ayraçlarla, sabit sırada: Senkron → Görünüm → Hatırlatma → İçe/dışa aktarım →
   Zenginleştir → Katalog araçları → Depolama → TEHLİKELİ BÖLGE.

   TEHLİKELİ BÖLGE ayrımı ÜÇ eksende (dolgu kullanmadan): KONUM (en altta,
   ekstra boşlukla kopuk), RENK (kicker + üst ayraç --drop), DURUM (katlı gelir).
   Katlama burada gezinme değil KAZA ENGELİ — iki confirm'e ek üçüncü kasıt.
   (Mutasyon 1: bir işlevi kaldır → varlık vakası kırmızı.
    Mutasyon 2: tehlikeli bölge ayrımını kaldır → ayrım vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap, bugunISO, ayarlarAc, tehlikeAc,
  onaylariKabulEt } = require('./yardim');

function kitap(ek) {
  return sahteKitap(Object.assign({ ad: 'Bitmiş Kitap', durum: 'bitti', sayfa: 200,
    puan: 8, bitisTarihi: bugunISO(),
    notlar: [{ id: 'n1', tip: 'alinti', metin: 'Bir alıntı.', tarih: bugunISO(), fikir: [] }]
  }, ek || {}));
}
async function ayarAc(page, ek) {
  await tohumla(page, [kitap()], ek);
  await page.goto('/');
  await ayarlarAc(page);
  await expect(page.locator('#senkronKart')).toBeVisible();   // eklentiler yerleşti
  await expect(page.locator('#katalogKart')).toBeVisible();
}
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

test.describe('G48 Ayarlar penceresi — Ciltli', () => {

  /* ---------- dil ---------- */
  test('kutu dili YOK: yuvarlak köşe, gölge, dolgulu yüzey kalmadı', async ({ page }) => {
    await ayarAc(page);
    await tehlikeAc(page);                       // katlı bölüm de denetlensin
    const kacaklar = await page.evaluate(() =>
      [...document.querySelectorAll('#ortuAyar .yedek-wrap *')]
        .filter(el => el.offsetParent !== null && el.tagName !== 'INPUT')
        .map(el => { const c = getComputedStyle(el);
          return { et: el.tagName + '.' + (el.className || ''),
            r: parseFloat(c.borderRadius) || 0, golge: c.boxShadow, gorsel: c.backgroundImage }; })
        .filter(o => o.r > 7 || o.golge !== 'none' || o.gorsel !== 'none'));
    expect(kacaklar).toEqual([]);
    expect(await page.locator('#ortuAyar .yedek-kart').count(), 'eski kutu sınıfı emekli').toBe(0);
  });

  test('görünür DOLU düğme yok (hepsi kontur)', async ({ page }) => {
    await ayarAc(page);
    await tehlikeAc(page);
    const dolular = await page.evaluate(() => {
      const A = z => { const m = z.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        return m ? (m[4] === undefined ? 1 : +m[4]) : 0; };
      return [...document.querySelectorAll('#ortuAyar button')]
        .filter(el => el.offsetParent !== null && A(getComputedStyle(el).backgroundColor) >= 0.5)
        .map(el => el.textContent.trim().slice(0, 30));
    });
    expect(dolular).toEqual([]);
    // g29/g30 sözleşmesi: pencerede TEK pirinç ve o "JSON indir"
    await expect(page.locator('#ortuAyar .btn-brass:visible')).toHaveCount(1);
    await expect(page.locator('#ortuAyar .btn-brass:visible'))
      .toHaveAttribute('data-act', 'disa-aktar');
  });

  test('kicker etiketleri BÜYÜK HARF + aralıklı; tehlike DIŞINDAKİLER altın', async ({ page }) => {
    await ayarAc(page);
    const k = await page.evaluate(() => {
      const kok = getComputedStyle(document.documentElement);
      const boya = degisken => { const p = document.createElement('span');
        p.style.color = kok.getPropertyValue(degisken).trim();
        document.body.appendChild(p);
        const c = getComputedStyle(p).color; p.remove(); return c; };
      const altin = boya('--brass'), uyari = boya('--drop');
      return [...document.querySelectorAll('#ortuAyar .kicker')].map(el => {
        const c = getComputedStyle(el);
        return { metin: el.textContent.trim(), versal: c.textTransform,
          aralik: parseFloat(c.letterSpacing),
          altin: c.color === altin, uyari: c.color === uyari };
      });
    });
    expect(k.length, '9 bölüm kicker\'ı').toBe(9);   // v63: Zenginleştir · v104: Okuma tipografisi
    for (const x of k) {
      expect(x.versal, x.metin).toBe('uppercase');
      expect(x.aralik, x.metin + ' harf aralığı').toBeGreaterThan(0.5);
    }
    const tehlike = k.find(x => x.metin === 'Tehlikeli bölge');
    expect(tehlike.uyari, 'tehlike kicker\'ı UYARI renginde').toBe(true);
    expect(tehlike.altin, 'tehlike kicker\'ı altın DEĞİL').toBe(false);
    for (const x of k.filter(x => x.metin !== 'Tehlikeli bölge'))
      expect(x.altin, x.metin + ' altın').toBe(true);
  });

  /* ---------- yapı ---------- */
  test('bölümler sabit sırada; eklentiler kendi yuvasına yazar', async ({ page }) => {
    await ayarAc(page);
    const sira = await page.evaluate(() =>
      [...document.querySelectorAll('#ortuAyar .ay-bolum')].map(b => b.id));
    expect(sira).toEqual(['ayBolumSenkron', 'ayBolumGorunum', 'ayBolumTipografi', 'ayBolumHatirlatma',
      'ayBolumAktarim', 'ayBolumZengin', 'ayBolumKatalog', 'ayBolumDepolama', 'ayBolumTehlike']);
    await expect(page.locator('#ayYuvaSenkron #senkronKart')).toHaveCount(1);
    await expect(page.locator('#ayYuvaKatalog #katalogKart')).toHaveCount(1);
  });

  test('TEHLİKELİ BÖLGE görsel olarak AYRILMIŞ: konum + renk + katlı durum', async ({ page }) => {
    await ayarAc(page);
    const t = await page.evaluate(() => {
      const kok = getComputedStyle(document.documentElement);
      const p = document.createElement('span');
      p.style.color = kok.getPropertyValue('--drop').trim();
      document.body.appendChild(p);
      const uyari = getComputedStyle(p).color; p.remove();
      const d = document.getElementById('ayBolumTehlike');
      const c = getComputedStyle(d);
      const hepsi = [...document.querySelectorAll('#ortuAyar .ay-bolum')];
      const normal = getComputedStyle(document.getElementById('ayBolumDepolama'));
      return { sonuncu: hepsi[hepsi.length - 1].id === 'ayBolumTehlike',
        katli: d.tagName === 'DETAILS', acik: d.open,
        ustCizgiRenk: c.borderTopColor, ustCizgiKalinlik: c.borderTopWidth,
        ustBosluk: parseFloat(c.marginTop), normalUstBosluk: parseFloat(normal.marginTop),
        uyariRengi: uyari };
    });
    expect(t.sonuncu, 'KONUM: en altta').toBe(true);
    expect(t.ustBosluk, 'KONUM: ekstra boşlukla kopuk')
      .toBeGreaterThan(t.normalUstBosluk + 12);
    expect(t.ustCizgiKalinlik, 'RENK: kendi üst ayracı var').toBe('1px');
    expect(t.ustCizgiRenk, 'RENK: ayraç uyarı renginde').toBe(t.uyariRengi);
    expect(t.katli, 'DURUM: katlanır').toBe(true);
    expect(t.acik, 'DURUM: kapalı gelir').toBe(false);
    // kapalıyken ÖZET görünür (bulunabilir), düğme değil (kaza engeli)
    await expect(page.locator('#ayBolumTehlike .ay-tehlike-ozet'))
      .toHaveText('Kütüphaneyi boşalt');
    await expect(page.locator('[data-act="tumunu-sil"]')).toBeHidden();
  });

  /* ---------- TÜM İŞLEVLER ---------- */
  test('TÜM işlevler mevcut (varlık denetimi)', async ({ page }) => {
    await ayarAc(page);
    await tehlikeAc(page);
    const kalemler = {
      'senkron oda girdisi': '#ortuAyar #s-oda',
      'senkron cihaz girdisi': '#ortuAyar #s-cihaz',
      'senkron bağla': '#ortuAyar [data-act="senkron-bagla"]',
      'senkron durum satırı': '#ortuAyar #senkronDurum',
      'tema açık': '#ortuAyar [data-act="tm-tema"][data-v="acik"]',
      'tema karanlık': '#ortuAyar [data-act="tm-tema"][data-v="karanlik"]',
      'tema sistem': '#ortuAyar [data-act="tm-tema"][data-v="sistem"]',
      'JSON indir': '#ortuAyar [data-act="disa-aktar"]',
      'CSV indir': '#ortuAyar [data-act="csv-aktar"]',
      'md sadece alıntılar': '#ortuAyar [data-act="md-alinti"]',
      'md alıntılar+notlar': '#ortuAyar [data-act="md-hepsi"]',
      'Goodreads yükle': '#ortuAyar [data-act="gr-aktar"]',
      'yedekten geri yükle': '#ortuAyar [data-act="ice-aktar"]',
      'seri tarama': '#ortuAyar [data-act="seri-ac"]',
      'kapak depo bilgisi': '#ortuAyar #kpDepoBilgi',
      'tüm fotoğrafları sil': '#ortuAyar [data-act="kp-tum-sil"]',
      'zenginleştirme durum satırı': '#ortuAyar #zgDurum',
      'zenginleştirme tarama': '#ortuAyar [data-act="zg-tara"]',
      'hatırlatma durum satırı': '#ortuAyar #htDurum',
      'hatırlatma saat seçici': '#ortuAyar #htSaat',
      'kütüphaneyi boşalt': '#ortuAyar [data-act="tumunu-sil"]'
    };
    const eksik = [];
    for (const [ad, sec] of Object.entries(kalemler)) {
      if (!(await page.locator(sec).isVisible().catch(() => false))) eksik.push(ad);
    }
    expect(eksik, 'kaybolan işlev').toEqual([]);
    // kapak sayacı GERÇEK hesaplanmış değeri gösterir (donmuş "Hesaplanıyor…" değil)
    await expect(page.locator('#kpDepoBilgi')).not.toHaveText('Hesaplanıyor…');
    await expect(page.locator('#kpDepoBilgi')).toContainText('fotoğraf');
  });

  test('senkron bağlanır ve kesilir (durum satırı izler)', async ({ page }) => {
    onaylariKabulEt(page);
    await ayarAc(page);
    await expect(page.locator('#senkronForm')).toBeVisible();
    await expect(page.locator('#senkronBagli')).toBeHidden();
    await page.fill('#s-oda', 'kitaplik-test-7431');
    await page.fill('#s-cihaz', 'Test Cihazı');
    await page.click('[data-act="senkron-bagla"]');
    await expect(page.locator('#senkronBagli')).toBeVisible();
    await expect(page.locator('#senkronForm')).toBeHidden();
    await expect(page.locator('#senkronDurum')).toContainText('kitaplik-test-7431');
    await expect(page.locator('[data-act="senkron-simdi"]')).toBeVisible();
    await page.click('[data-act="senkron-kes"]');
    await expect(page.locator('#senkronForm')).toBeVisible();
    await expect(page.locator('#senkronBagli')).toBeHidden();
  });

  test('JSON ve CSV indirmeleri gerçekten iner', async ({ page }) => {
    await ayarAc(page);
    for (const [act, uzanti] of [['disa-aktar', '.json'], ['csv-aktar', '.csv']]) {
      const [indirme] = await Promise.all([
        page.waitForEvent('download'),
        page.click(`#ortuAyar [data-act="${act}"]`)
      ]);
      expect(indirme.suggestedFilename(), act).toContain(uzanti);
    }
  });

  test('markdown İKİ seçenek de ayrı dosya indirir', async ({ page }) => {
    await ayarAc(page);
    const adlar = [];
    for (const act of ['md-alinti', 'md-hepsi']) {
      const [indirme] = await Promise.all([
        page.waitForEvent('download'),
        page.click(`#ortuAyar [data-act="${act}"]`)
      ]);
      adlar.push(indirme.suggestedFilename());
    }
    expect(adlar[0]).toContain('.md');
    expect(adlar[1]).toContain('.md');
    expect(adlar[0], 'iki seçenek ayrı dosya').not.toBe(adlar[1]);
  });

  test('Goodreads ve geri yükleme dosya seçici açar', async ({ page }) => {
    await ayarAc(page);
    for (const [act, id] of [['gr-aktar', 'grDosya'], ['ice-aktar', 'iceDosya']]) {
      const [secici] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click(`#ortuAyar [data-act="${act}"]`)
      ]);
      expect(await secici.element().evaluate(e => e.id), act).toBe(id);
    }
  });

  test('seri tarama Ayarlar\'dan açılır, alttaki pencere açık kalır', async ({ page }) => {
    await ayarAc(page);
    await page.click('#ortuAyar [data-act="seri-ac"]');
    await expect(page.locator('#seriOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#ortuAyar')).toHaveClass(/acik/);
  });

  test('tema değişir ve PENCERENİN KENDİSİ yeni temaya geçer', async ({ page }) => {
    await ayarAc(page);
    const sheetZemin = () => page.evaluate(() =>
      getComputedStyle(document.querySelector('#ortuAyar .sheet')).backgroundColor);
    const once = await sheetZemin();
    await page.click('#ortuAyar [data-act="tm-tema"][data-v="karanlik"]');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-tema')))
      .toBe('karanlik');
    await expect(page.locator('[data-act="tm-tema"][data-v="karanlik"]'))
      .toHaveClass(/tm-secili/);
    expect(await sheetZemin(), 'pencere zemini de değişti').not.toBe(once);
    await expect(page.locator('#ortuAyar')).toHaveClass(/acik/);   // pencere açık kaldı
  });

  test('kütüphaneyi boşalt İKİ onay ister ve kütüphaneyi boşaltır', async ({ page }) => {
    const sorular = [];
    page.on('dialog', d => { sorular.push(d.message()); d.accept(); });
    await ayarAc(page);
    await tehlikeAc(page);
    await page.click('#ortuAyar [data-act="tumunu-sil"]');
    await expect.poll(() => page.evaluate(() => veri.kitaplar.length)).toBe(0);
    expect(sorular.length, 'iki kademeli onay').toBe(2);
    expect(sorular[1]).toMatch(/geri alınamaz/i);
  });

  /* ---------- ARIA / klavye ---------- */
  test('ARIA dialog sözleşmesi duruyor: role, aria-modal, labelledby, Esc, inert', async ({ page }) => {
    await ayarAc(page);
    const sheet = page.locator('#ortuAyar .sheet');
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet).toHaveAttribute('aria-labelledby', 'ortuAyarBaslik');
    await expect(page.locator('#ortuAyarBaslik')).toHaveText('Ayarlar');
    // arka plan inert
    expect(await page.locator('#panel-ana').evaluate(e => e.hasAttribute('inert')
      || e.getAttribute('aria-hidden') === 'true')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#ortuAyar')).not.toHaveClass(/acik/);
    expect(await page.locator('#panel-ana').evaluate(e => e.hasAttribute('inert'))).toBe(false);
  });

  /* ---------- kontrast ---------- */
  for (const tema of ['acik', 'karanlik']) {
    test(`kontrast AA — pencere (${tema} tema)`, async ({ page }) => {
      await ayarAc(page, { kk_tema_v1: tema });
      await tehlikeAc(page);
      const ciftler = [
        ['#ortuAyarBaslik', '#ortuAyar .sheet', 'pencere başlığı'],
        ['#ayBolumSenkron .kicker', '#ortuAyar .sheet', 'senkron kicker'],
        ['#ayBolumSenkron .ay-baslik', '#ortuAyar .sheet', 'bölüm başlığı'],
        ['#ayBolumSenkron .ay-not', '#ortuAyar .sheet', 'bölüm açıklaması'],
        ['#ortuAyar label', '#ortuAyar .sheet', 'form etiketi'],
        ['#ayBolumGorunum .tm-dugme', '#ortuAyar .sheet', 'tema düğmesi'],
        ['#ortuAyar .btn-brass', '#ortuAyar .sheet', 'pirinç düğme'],
        ['#ortuAyar .btn-cerceve', '#ortuAyar .sheet', 'çerçeve düğme'],
        ['#kpDepoBilgi', '#ortuAyar .sheet', 'depo bilgisi'],
        ['#ortuAyar .btn-tehlike', '#ortuAyar .sheet', 'tehlike düğmesi'],
        ['#ayBolumTehlike .kicker', '#ortuAyar .sheet', 'tehlike kicker'],
        ['#ayBolumTehlike .ay-tehlike-ozet', '#ortuAyar .sheet', 'tehlike özeti']
      ];
      for (const [m, z, ad] of ciftler) {
        const o = await kontrast(page, m, z);
        expect(o, ad + ' ölçülemedi (' + m + ')').not.toBeNull();
        expect(o, `${ad} (${tema}): ${o && o.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
