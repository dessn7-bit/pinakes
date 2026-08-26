'use strict';
/* G39 — Ciltli Kitap Detayı (v45): tasarım dili + korunan işlevler.
   Üst satır (geri + durum kicker) · künye LEVHASI · İLERLEME koşulu · künye
   tablosu (BOŞ alan satır OLUŞTURMAZ — mutasyon hedefi) · etiket çipleri
   (ekle/sil, yeni işlev) · oturum bloğu yerleşimi · yeni metin rolleri AA.
   Birincil eylem tablosu g29'da (4 durum), durum eylemleri g28'de, seri g15'te,
   kapak akışı g23'te, notlar g25/g26'da — burada TEKRAR edilmez. */
const { test, expect, tohumla, sahteKitap, rafAc } = require('./yardim');

const RENK_COZ = `(z => {
  if(!z || z === 'transparent') return { r:0,g:0,b:0,a:0 };
  let m = z.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/);
  if(m) return { r:+m[1], g:+m[2], b:+m[3], a:m[4] === undefined ? 1 : +m[4] };
  m = z.match(/color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\)/);
  if(m) return { r:255*+m[1], g:255*+m[2], b:255*+m[3], a:m[4] === undefined ? 1 : +m[4] };
  return { r:0,g:0,b:0,a:1 };
})`;

async function kontrastOrani(page, metinSec, zeminSec) {
  return await page.evaluate(({ metinSec, zeminSec, renkCozSrc }) => {
    const renkCoz = eval(renkCozSrc);
    const el = document.querySelector(metinSec);
    if(!el) return null;
    const metin = renkCoz(getComputedStyle(el).color);
    let zemin = { r:255,g:255,b:255 };
    let kat = [];
    let p = zeminSec ? document.querySelector(zeminSec) : el;
    while(p && p !== document.documentElement){
      const c = renkCoz(getComputedStyle(p).backgroundColor);
      if(c.a > 0){ kat.push(c); if(c.a >= 1) break; }
      p = p.parentElement;
    }
    for(let i = kat.length - 1; i >= 0; i--){
      const c = kat[i];
      zemin = { r: c.r*c.a + zemin.r*(1-c.a), g: c.g*c.a + zemin.g*(1-c.a),
        b: c.b*c.a + zemin.b*(1-c.a) };
    }
    const L = c => {
      const f = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
      return .2126*f(c.r) + .7152*f(c.g) + .0722*f(c.b);
    };
    const l1 = L(metin), l2 = L(zemin);
    return (Math.max(l1,l2) + .05) / (Math.min(l1,l2) + .05);
  }, { metinSec, zeminSec, renkCozSrc: RENK_COZ });
}

function doluKitap(ek) {
  return sahteKitap(Object.assign({ ad: 'Dolu Künyeli Kitap', yazar: 'Usta Yazar',
    sayfa: 400, guncelSayfa: 100, durum: 'okunuyor', baslamaTarihi: '2026-01-05',
    yil: 1972, tur: 'roman', yayinevi: 'İletişim', cevirmen: 'Çevirmen Kişi',
    dil: 'tr', raf: 'üst raf', isbn: '9789750718533', seri: 'Büyük Seri', ciltNo: 2,
    etiketler: ['felsefe', 'klasik'] }, ek || {}));
}

async function detayAcVe(page) {
  await page.click('#liste .kart');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
  await expect(page.locator('#oturumBlok')).toBeVisible();
}

test.describe('G39 Ciltli detay', () => {

  /* ---------- üst satır ---------- */

  test('üst satır: ‹ Pinakes geri bağlantısı kapatır, durum kicker görünür', async ({ page }) => {
    await tohumla(page, [doluKitap()]);
    await rafAc(page);
    await detayAcVe(page);
    const kicker = page.locator('.d-durum-kicker');
    await expect(kicker).toHaveText('Okunuyor');
    expect(await kicker.evaluate(el => getComputedStyle(el).textTransform)).toBe('uppercase');
    await expect(page.locator('.d-geri')).toBeVisible();
    await page.click('.d-geri');
    await expect(page.locator('#ortuDetay')).not.toHaveClass(/acik/);
  });

  /* ---------- künye levhası ---------- */

  test('künye levhası Ciltli deseninde: paspartu + kontur + sepya; img detay-kapak sözleşmesi', async ({ page }) => {
    await tohumla(page, [doluKitap({ kapak: 'https://covers.openlibrary.org/b/id/3-M.jpg' })]);
    await rafAc(page);
    await detayAcVe(page);
    const levha = page.locator('#detayIcerik .plate.d-plate');
    await expect(levha).toHaveCount(1);
    const o = await levha.evaluate(el => {
      const c = getComputedStyle(el);
      return { paspartu: c.borderTopWidth, kontur: c.outlineWidth, filtre: c.filter };
    });
    expect(o.paspartu).toBe('6px');
    expect(o.kontur).toBe('1px');
    expect(o.filtre).toContain('sepia');
    await expect(levha.locator('img.detay-kapak')).toHaveCount(1);
  });

  /* ---------- ilerleme koşulu ---------- */

  test('İLERLEME bölümü yalnız sayfa bilgisi olan kitapta; okunacakta çizilmez', async ({ page }) => {
    await tohumla(page, [doluKitap({ ad: 'Sayfalı Okunan' }),
      doluKitap({ ad: 'Sayfasız Okunan', sayfa: null, guncelSayfa: 0 }),
      doluKitap({ ad: 'Sayfalı Okunacak', durum: 'okunacak', guncelSayfa: 0 })]);
    await rafAc(page);
    await page.click('#liste .kart:has-text("Sayfalı Okunan")');
    await expect(page.locator('#dIlerlemeBolum')).toBeVisible();
    await expect(page.locator('#dIlerlemeBolum .kicker')).toHaveText('İlerleme');
    await expect(page.locator('#dIlerlemeBolum .ilerleme-txt')).toContainText('100 / 400 sayfa');
    await expect(page.locator('#dIlerlemeBolum .ilerleme-txt')).toContainText('%25');
    await expect(page.locator('#detayIcerik .ilerleme')).toHaveCount(1);  // g28 tekliği burada da
    await page.click('[data-act="detay-kapat"]');
    await page.click('#liste .kart:has-text("Sayfasız Okunan")');
    await expect(page.locator('#dIlerlemeBolum')).toHaveCount(0);
    await page.click('[data-act="detay-kapat"]');
    await page.click('#liste .kart:has-text("Sayfalı Okunacak")');
    await expect(page.locator('#dIlerlemeBolum')).toHaveCount(0);  // KARAR: henüz ilerleme yok
  });

  /* ---------- künye tablosu ---------- */

  test('künye tablosu: TÜM dolu alanlar sırayla satır olur; ilk satır farklı zeminde', async ({ page }) => {
    await tohumla(page, [doluKitap()]);
    await rafAc(page);
    await detayAcVe(page);
    const etiketler = await page.locator('#dKunyeTablo .kunye-etiket').allTextContents();
    expect(etiketler).toEqual(['Yazar', 'Sayfa', 'İlk basım', 'Tür', 'Seri',
      'Çevirmen', 'Dil', 'Yayınevi', 'Raf', 'ISBN']);
    await expect(page.locator('#dKunyeTablo .kunye-satir').first()).toContainText('Usta Yazar');
    await expect(page.locator('#dKunyeTablo')).toContainText('Büyük Seri · 2. cilt');
    // ilk satırın zemini hafif farklı, ikinci satır şeffaf
    const zeminler = await page.evaluate((renkCozSrc) => {
      const renkCoz = eval(renkCozSrc);
      const s = [...document.querySelectorAll('#dKunyeTablo .kunye-satir')];
      return { ilk: renkCoz(getComputedStyle(s[0]).backgroundColor).a,
        ikinci: renkCoz(getComputedStyle(s[1]).backgroundColor).a };
    }, RENK_COZ);
    expect(zeminler.ilk).toBeGreaterThan(0.01);
    expect(zeminler.ikinci).toBe(0);
  });

  test('künye tablosu: BOŞ alanlar satır OLUŞTURMAZ (mutasyon hedefi)', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Seyrek Künye', yazar: 'Tek Yazar',
      sayfa: 250, raf: 'alt raf', yayinevi: '', tur: '', isbn: '' })]);
    await rafAc(page);
    await detayAcVe(page);
    // yalnız 3 dolu alan: Yazar + Sayfa + Raf — başka satır YOK
    await expect(page.locator('#dKunyeTablo .kunye-satir')).toHaveCount(3);
    const etiketler = await page.locator('#dKunyeTablo .kunye-etiket').allTextContents();
    expect(etiketler).toEqual(['Yazar', 'Sayfa', 'Raf']);
    expect(etiketler).not.toContain('İlk basım');
    expect(etiketler).not.toContain('ISBN');
  });

  /* ---------- etiket çipleri ---------- */

  test('etiket çipleri kontur; detaydan ekleme ve silme çalışır', async ({ page }) => {
    await tohumla(page, [doluKitap()]);
    await rafAc(page);
    await detayAcVe(page);
    await expect(page.locator('#dEtiketBlok .d-etiket-cip')).toHaveCount(2);
    // kontur: zemin dolgusuz + kenar var
    const cip = await page.locator('.d-etiket-cip').first().evaluate((el, renkCozSrc) => {
      const renkCoz = eval(renkCozSrc);
      const c = getComputedStyle(el);
      return { alfa: renkCoz(c.backgroundColor).a, kenar: c.borderTopWidth };
    }, RENK_COZ);
    expect(cip.alfa).toBeLessThan(0.25);
    expect(cip.kenar).toBe('1px');
    // ekleme
    await expect(page.locator('#dEtiketGirisSatir')).toBeHidden();
    await page.click('[data-act="d-etiket-ac"]');
    await page.fill('#dEtiketGiris', 'yeni-etiket');
    await page.click('[data-act="d-etiket-ekle"]');
    await expect(page.locator('#dEtiketBlok .d-etiket-cip')).toHaveCount(3);
    expect(await page.evaluate(() => veri.kitaplar[0].etiketler)).toContain('yeni-etiket');
    // mükerrer (i-ailesi katlanır) eklenmez
    await page.click('[data-act="d-etiket-ac"]');
    await page.fill('#dEtiketGiris', 'FELSEFE');
    await page.click('[data-act="d-etiket-ekle"]');
    await expect(page.locator('#toast')).toContainText('zaten var');
    expect(await page.evaluate(() => veri.kitaplar[0].etiketler.length)).toBe(3);
    // silme
    await page.click('.d-etiket-cip [data-act="d-etiket-sil"][data-v="felsefe"]');
    await expect(page.locator('#dEtiketBlok .d-etiket-cip')).toHaveCount(2);
    expect(await page.evaluate(() => veri.kitaplar[0].etiketler)).not.toContain('felsefe');
  });

  /* ---------- oturum bloğu yerleşimi ---------- */

  test('oturum bloğu: kicker etiketli, eylemin altında + künye tablosunun üstünde', async ({ page }) => {
    await tohumla(page, [doluKitap()]);
    await rafAc(page);
    await detayAcVe(page);
    await expect(page.locator('#oturumBlok .kicker')).toHaveText('Okuma oturumu');
    const sira = await page.evaluate(() => {
      const y = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top : null; };
      return { eylem: y('.d-eylem'), oturum: y('#oturumBlok'), tablo: y('#dKunyeBlok') };
    });
    expect(sira.eylem).not.toBeNull();
    expect(sira.oturum, 'oturum eylemin altında').toBeGreaterThan(sira.eylem);
    expect(sira.tablo, 'künye tablosu oturumun altında').toBeGreaterThan(sira.oturum);
  });

  /* ---------- kontrast AA (yeni roller, gerçek render) ---------- */

  for (const tema of ['acik', 'karanlik']) {
    test(`detay yeni metin rolleri AA (${tema} tema)`, async ({ page }) => {
      await tohumla(page, [doluKitap()], { kk_tema_v1: tema });
      await rafAc(page);
      await detayAcVe(page);
      const ciftler = [
        ['.d-geri', null, 'geri bağlantısı'],
        ['.d-durum-kicker', null, 'durum kicker'],
        ['#detayIcerik .sheet-baslik', null, 'kitap adı'],
        ['#detayIcerik .detay-yazar', null, 'yazar (italik)'],
        ['#dIlerlemeBolum .kicker', null, 'ilerleme kicker'],
        ['#dIlerlemeBolum .ilerleme-txt', null, 'sayfa sayacı'],
        ['.kunye-etiket', null, 'künye etiketi'],
        ['.kunye-deger', null, 'künye değeri'],
        ['.d-etiket-cip', null, 'etiket çipi'],
        ['#dEtiketBlok .d-ghost', null, '+ Etiket bağlantısı'],
        ['#detayIcerik .detay-meta .rozet', null, 'durum çipi (kontur)'],
        ['#oturumBlok .kicker', null, 'oturum kicker']
      ];
      for (const [m, z, ad] of ciftler) {
        const o = await kontrastOrani(page, m, z);
        expect(o, `${ad} ölçülemedi (${m})`).not.toBeNull();
        expect(o, `${ad} (${tema}): ${o && o.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
