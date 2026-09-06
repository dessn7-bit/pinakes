'use strict';
/* G77 — karanlık tema İKİNCİL yüzeyler (v78): g49 beş ana ekranı tarar, bu
   dosya 13 ikincil yüzeyi/pencereyi tarar. ÖLÇÜLEN taban (2026-08-20):
   14 vakada 0 WCAG kaçağı; kart PNG karanlıkta da KREM; tek Ciltli istisnası
   .secim-isaret (dondurulmuş).

   Ölçüm aletleri g49'dan BİREBİR: SUPUR (TreeWalker ile GÖRÜNEN her metin
   düğümü, efektif zemin alfa karışımı, punto/kalınlığa göre 4.5/3.0 eşiği) ve
   Ciltli dolu-düğme/yuvarlak-kart taraması (kapsamı g36 tanımı gereği
   `.panel.active` — ortu pencerelerin KENDİ içeriğini SUPUR süpürür).
   Her yüzey vakası önce RENDER KANITI iddia eder (render olmayan yüzey
   ölçülmez — bilinen tuzak), sonra süpürme sonucunu İDDİA eder.
   (Mutasyon kilidi: duyarlılık vakası Ayarlar yüzeyine düşük-kontrast renk
    enjekte eder ve süpürmenin onu YAKALADIĞINI kanıtlar — duyarlılığı
    sınanmamış "0 kaçak" delil değildir, g49 dersi.) */
const { test, expect, tohumla, sahteKitap, kameraTaklit, bugunISO,
  rafaGec, ayarlarAc, tehlikeAc, ayrintilarAc, dosyadanYukle } = require('./yardim');

/* ---------- g49 fixture'ı (BİREBİR) ---------- */
const BUGUN = bugunISO(), DUN = bugunISO(-1);
let sayac = 0;
function kitap(ek) {
  sayac++;
  return sahteKitap(Object.assign({ ad: 'Kitap ' + sayac, yazar: 'Yazar ' + sayac,
    yayinevi: 'Yayınevi', yil: 2020, sayfa: 300, tur: 'Roman', durum: 'bitti', puan: 8,
    baslamaTarihi: '2026-01-01', bitisTarihi: BUGUN, etiketler: ['etiket'], raf: 'A1' }, ek));
}
const OTURUM = Date.now() - 3 * 86400000;
function defter() {
  return [
    kitap({ ad: 'Tutunamayanlar', yazar: 'Oğuz Atay', puan: 10, sayfa: 724,
      notlar: [
        { id: 'n1', tip: 'alinti', metin: 'Ben buradayım sevgili okuyucum.', sayfa: 12,
          tarih: DUN, fikir: ['yalnızlık', 'ironi'], tekrarSonraki: BUGUN,
          tekrarAralik: 4, tekrarSayisi: 2 },
        { id: 'n2', tip: 'not', metin: 'Anlatıcının sesi değişiyor.', sayfa: 140,
          tarih: DUN, fikir: ['ironi'] }],
      oturumlar: [{ b: OTURUM, s: 3600000, sa: 0, sb: 60 }] }),
    kitap({ ad: 'Beş Şehir', yazar: 'Ahmet Hamdi Tanpınar', tur: 'Deneme', puan: 9, sayfa: 240,
      notlar: [{ id: 'n3', tip: 'alinti', metin: 'Zaman bir alışkanlıktır.', sayfa: 55,
        tarih: DUN, fikir: ['zaman', 'ironi'] }] }),
    kitap({ ad: 'Okunan Kitap', durum: 'okunuyor', guncelSayfa: 120, puan: null, bitisTarihi: null }),
    kitap({ ad: 'Yarım Kalan', durum: 'yarim', guncelSayfa: 80, puan: null, bitisTarihi: null }),
    kitap({ ad: 'Okunacak Kitap', durum: 'okunacak', puan: null, bitisTarihi: null })
  ];
}
function veriPaketi() {
  const y = new Date().getFullYear();
  return { kitaplar: defter(), hedef: { [y]: 10 }, hedefSayfa: { [y]: 3000 } };
}

/* ---------- SUPUR (g49 satır 55-120, BİREBİR) ---------- */
/* GÖRÜNEN her metin düğümünü süpürür; eşiği geçemeyenleri döndürür. */
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

/* ---------- Ciltli taraması (g49 satır 344-369, BİREBİR) ---------- */
const CILTLI = () => {
  const COZ = z => { const m = String(z).match(
    /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r:+m[1], g:+m[2], b:+m[3], a:m[4]===undefined?1:+m[4] } : null; };
  const kok = getComputedStyle(document.documentElement);
  const notrler = ['--bg','--surface','--surface2'].map(v => {
    const p = document.createElement('div');
    p.style.color = kok.getPropertyValue(v).trim();
    document.body.appendChild(p);
    const c = COZ(getComputedStyle(p).color); p.remove(); return c; });
  const yakin = (a,b) => b && Math.abs(a.r-b.r)+Math.abs(a.g-b.g)+Math.abs(a.b-b.b) < 12;
  const doygun = c => { const mx = Math.max(c.r,c.g,c.b), mn = Math.min(c.r,c.g,c.b);
    return (mx - mn) > 40 || mx < 120; };
  const panel = document.querySelector('.panel.active');
  if (!panel) return ['aktif panel yok'];
  return [...panel.querySelectorAll('*')]
    .filter(el => el.offsetParent !== null && el.tagName !== 'INPUT')
    .filter(el => { const s = getComputedStyle(el);
      if ((parseFloat(s.borderRadius) || 0) > 7 || s.boxShadow !== 'none') return true;
      if (el.tagName !== 'BUTTON') return false;
      const c = COZ(s.backgroundColor);
      if (!c || c.a < 0.5) return false;
      if (notrler.some(n => yakin(c, n))) return false;   // kâğıt yüzey
      return doygun(c);
    })
    .map(el => el.tagName + '.' + (typeof el.className === 'string' ? el.className : ''));
};

/* ---------- karanlık açılış + iddia iskeleti ---------- */
async function gece(page, veri, ek) {
  await tohumla(page, veri, Object.assign({ kk_tema_v1: 'karanlik' }, ek || {}));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'karanlik');
}

/* Süpür ve İDDİA et: WCAG kaçağı yok + Ciltli bulgusu beklenen listeyle BİREBİR
   (varsayılan []). Dondurulmuş istisna toplu-işlem vakasında geçilir. */
async function supurVeIddia(page, yuzey, beklenenCiltli) {
  await page.waitForTimeout(250);
  const kacak = await page.evaluate(SUPUR);
  expect(kacak, yuzey + ' karanlık AA').toEqual([]);
  const ciltli = await page.evaluate(CILTLI);
  expect(ciltli, yuzey + ' (karanlık) Ciltli').toEqual(beklenenCiltli || []);
}

/* ---------- yüzeye özgü fixture'lar (kaynak dosyalardan) ---------- */
/* g11 alıntılı kitap */
function alintiliKitap(ek) {
  const notEk = (ek && ek.not) || {};
  return sahteKitap(Object.assign({
    ad: 'Varlık ve Zaman', yazar: 'Martin Heidegger',
    notlar: [Object.assign({ id: 'kn' + Math.random().toString(36).slice(2, 8),
      tip: 'alinti', metin: 'Dil, varlığın evidir.', tarih: '2026-08-01',
      sayfa: 42, fikir: [] }, notEk)]
  }, (ek && ek.kitap) || {}));
}
/* g61 puansız bitmişler */
function puansiz(ad, ek) {
  return sahteKitap(Object.assign({ ad, durum: 'bitti', puan: null }, ek));
}
function ucKitap() {
  return [
    puansiz('K Bir', { bitisTarihi: '2024-05-01', yazar: 'Y1', sayfa: 320, tur: 'Roman' }),
    puansiz('K İki', { bitisTarihi: '2023-05-01', yazar: 'Y2' }),
    puansiz('K Üç', { bitisTarihi: '2022-05-01', yazar: 'Y3' })];
}
/* g50 OCR taklidi */
const SAHTE_MOTOR = [
  'window.Tesseract = { createWorker: async function(dil, oem, ayar){',
  '  window.__ocrMotorAyar = { dil: dil, oem: oem, gzip: ayar && ayar.gzip,',
  '    cacheMethod: ayar && ayar.cacheMethod, corePath: ayar && ayar.corePath };',
  '  return {',
  '    recognize: async function(){ const a = window.__ocrSahte || {};',
  '      return { data: { text: a.metin || "", confidence: (typeof a.guven === "number" ? a.guven : 95) } }; },',
  '    terminate: async function(){ window.__ocrIsciOldu = true; }',
  '  };',
  '} };'
].join('\n');
async function ocrTaklit(page, ocSayac, gecikmeMs) {
  await page.route('**/ocr/**', async route => {
    const url = route.request().url();
    ocSayac.push(url.slice(url.lastIndexOf('/ocr/') + 1));
    if (gecikmeMs) await new Promise(r => setTimeout(r, gecikmeMs));
    if (url.includes('tesseract.min.js')) {
      route.fulfill({ status: 200, contentType: 'text/javascript', body: SAHTE_MOTOR }).catch(() => {});
    } else {
      route.fulfill({ status: 200, contentType: url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: 'sahte-paket-govdesi' }).catch(() => {});
    }
  });
}
/* g53 zenginleştirme */
const TURLER53 = [
  { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
  { seo: 'Tarih', ad: 'Tarih', kitapSayisi: 11576 },
  { seo: 'Cocuk', ad: 'Çocuk', kitapSayisi: 8223 },
  { seo: 'Bilim-Kurgu', ad: 'Bilim-Kurgu', kitapSayisi: 2470 },
  { seo: 'Felsefe-Dusunce', ad: 'Felsefe-Düşünce', kitapSayisi: 4114 },
  { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1000 },
  { seo: 'Biyografi', ad: 'Biyografi', kitapSayisi: 3047 },
  { seo: 'Dunya-Klasikleri', ad: 'Dünya Klasikleri', kitapSayisi: 862 }
];
function gbYanit(kitaplar) {
  return { totalItems: kitaplar.length, items: kitaplar.map(k => ({ volumeInfo: {
    title: k.ad, authors: k.yazar ? [k.yazar] : [],
    categories: k.kategoriler || undefined,
    industryIdentifiers: k.isbn13 ? [{ type: 'ISBN_13', identifier: k.isbn13 }] : undefined,
    pageCount: k.sayfa || undefined, publisher: k.yayinevi || undefined,
    publishedDate: k.yil ? String(k.yil) : undefined,
    imageLinks: k.kapak ? { thumbnail: k.kapak } : undefined
  } })) };
}
function gercekBenzeri() {
  return [
    sahteKitap({ ad: 'Dolu Kitap', yazar: 'Yazar Bir', durum: 'bitti', sayfa: 300,
      yayinevi: 'Yay A', yil: 2019, tur: '', isbn: '', puan: 8, bitisTarihi: '2021-03-01' }),
    sahteKitap({ ad: 'Yarı Dolu', yazar: 'Yazar İki', durum: 'bitti', sayfa: null,
      yayinevi: '', yil: null, tur: '', isbn: '', puan: null, bitisTarihi: null }),
    sahteKitap({ ad: 'Türlü Kitap', yazar: 'Yazar Üç', durum: 'okunacak', sayfa: 200,
      yayinevi: 'Yay B', yil: 2020, tur: 'Roman', isbn: '9786053609902' })
  ];
}
/* g56 tür içe aktarımı */
const TURLER56 = [
  { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1200 },
  { seo: 'Hikaye-Oyku', ad: 'Hikaye (Öykü)', kitapSayisi: 9508 },
  { seo: 'Gezi', ad: 'Gezi', kitapSayisi: 660 },
  { seo: 'Bilim-Kurgu', ad: 'Bilim-Kurgu', kitapSayisi: 3000 }
];
function turDosya(kayitlar) {
  return {
    name: 'kitaplik-turler.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ surum: 1, tur: kayitlar }), 'utf8')
  };
}
/* g17 fikir ağı */
let faNotSayac = 0;
function faNot(metin, fikir, sayfa) {
  faNotSayac++;
  return { id: 'fn' + faNotSayac, tip: 'alinti', metin, tarih: '2026-08-01',
    sayfa: sayfa || null, fikir: fikir || [] };
}
function faKitap(ad, notlar) {
  return sahteKitap({ ad, notlar });
}

/* ================= 13 ikincil yüzey ================= */
test.describe('G77 karanlık tema — ikincil yüzeyler', () => {

  test('1 Form (kitap ekleme, ayrıntılar açık) temiz', async ({ page }) => {
    await gece(page, veriPaketi());
    await rafaGec(page);
    await page.click('.fab');
    await expect(page.locator('#ortuForm')).toHaveClass(/acik/);
    await ayrintilarAc(page);
    await supurVeIddia(page, 'Form');
  });

  test('2 Barkod paneli temiz', async ({ page }) => {
    await kameraTaklit(page);
    await gece(page, veriPaketi());
    await rafaGec(page);
    await page.click('.fab');
    await expect(page.locator('#ortuForm')).toHaveClass(/acik/);
    await page.click('[data-act="barkod-ac"]');
    await expect(page.locator('#barkodOrtu')).toHaveClass(/acik/);
    await supurVeIddia(page, 'Barkod');
  });

  test('3 Seri tarama temiz', async ({ page }) => {
    await kameraTaklit(page);
    await gece(page, veriPaketi());
    await rafaGec(page);
    await ayarlarAc(page);
    await page.click('#ortuAyar [data-act="seri-ac"]');
    await expect(page.locator('#seriOrtu')).toHaveClass(/acik/);
    await supurVeIddia(page, 'SeriTarama');
  });

  /* DONDURULMUŞ İSTİSNA: .secim-isaret — seçili kartın köşesindeki 24×24,
     border-radius:999px yuvarlak onay İŞARETİ (gorunum.js). Kart değil GLİF;
     Ciltli "yuvarlak kart yok" kuralının hedeflediği yüzey değil. Bilinçli
     istisna, Kaan kararına açık. BİREBİR eşitlik bilerek: işaret onarılır ya
     da değişirse de vaka KIRMIZI olur ki liste güncellensin (g49'un
     "onarılırsa da kırmızı" deseni). */
  test('4 Toplu işlem çubuğu temiz (Ciltli istisnası: secim-isaret)', async ({ page }) => {
    await gece(page, veriPaketi());
    await rafaGec(page);
    await page.click('#secimBtn');
    await page.click('#liste .kart >> nth=0');
    await expect(page.locator('#topluCubuk')).toBeVisible();
    await expect(page.locator('#liste .kart >> nth=0')).toHaveClass(/secili/);
    await supurVeIddia(page, 'TopluCubuk', ['DIV.secim-isaret']);
  });

  test('5 Ayarlar (tehlike bölümü açık) temiz', async ({ page }) => {
    await gece(page, veriPaketi());
    await ayarlarAc(page);
    await tehlikeAc(page);
    await supurVeIddia(page, 'Ayarlar');
  });

  /* DUYARLILIK (g49 dersi: duyarlılığı sınanmamış "0 kaçak" delil değildir):
     Ayarlar yüzeyine bilerek düşük-kontrast metin rengi enjekte edilir —
     süpürme onu YAKALAMALI. Renk #6a655c seçildi (gece tabanına ~3.0:1,
     kabarık yüzeylerde daha düşük): 4.5 eşiğinin NET altı — koordinat
     önerisindeki #8a8478 tabana ~4.7:1 ile marjinaldi, kilit kararlı olmalı. */
  test('DUYARLILIK: enjekte edilen düşük-kontrast rengi süpürme yakalar', async ({ page }) => {
    await gece(page, veriPaketi());
    await ayarlarAc(page);
    await tehlikeAc(page);
    await page.addStyleTag({ content: '#ortuAyar .sheet *{color:#6a655c !important}' });
    await page.waitForTimeout(250);
    const kacak = await page.evaluate(SUPUR);
    expect(kacak.length, 'süpürme sahte kaçağı yakalamalı (alet kör değil)').toBeGreaterThan(0);
  });

  test('6 Gelen alıntı (paylaş hedefi) temiz', async ({ page }) => {
    await tohumla(page, veriPaketi(), { kk_tema_v1: 'karanlik' });
    await page.goto('/index.html?text=' + encodeURIComponent('deneme alinti metni')
      + '&url=' + encodeURIComponent('https://ornek.com'));
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'karanlik');
    await expect(page.locator('#ortuGelen')).toHaveClass(/acik/);
    await supurVeIddia(page, 'GelenAlinti');
  });

  test('7 Kart önizleme temiz + PNG karanlıkta da KREM (tema bağımsız)', async ({ page }) => {
    await gece(page, [alintiliKitap()]);
    await page.click('nav [data-v="alinti"]');
    await page.click('#alintiListe [data-act="alinti-kart"] >> nth=0');
    await expect(page.locator('#kartOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#kartTuval')).toBeVisible();
    await supurVeIddia(page, 'KartOnizleme');
    /* sol-üst 10×10 ortalama: ölçülen taban {245,239,227} = #F5EFE3 KREM */
    const z = await page.evaluate(() => {
      const t = document.getElementById('kartTuval');
      const d = t.getContext('2d').getImageData(0, 0, 10, 10).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    });
    expect(Math.abs(z.r - 245), 'PNG zemini KREM (R=' + z.r + ')').toBeLessThanOrEqual(6);
    expect(Math.abs(z.g - 239), 'PNG zemini KREM (G=' + z.g + ')').toBeLessThanOrEqual(6);
    expect(Math.abs(z.b - 227), 'PNG zemini KREM (B=' + z.b + ')').toBeLessThanOrEqual(6);
  });

  test('8 OCR paneli (seçim adımı) temiz', async ({ page }) => {
    const ocSayac = [];
    await ocrTaklit(page, ocSayac);
    await gece(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafaGec(page);
    await page.click('#liste .kart');
    await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
    await page.click('#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#ortuOcr')).toHaveClass(/acik/);
    await expect(page.locator('#ocSec')).toBeVisible({ timeout: 10000 });
    await supurVeIddia(page, 'OCR');
  });

  test('9 Hızlı puanlama temiz', async ({ page }) => {
    await gece(page, ucKitap());
    await page.click('nav [data-act="sekme"][data-v="ist"]');
    await page.click('#istPuansiz [data-act="zg-puanla"]');
    await expect(page.locator('#zgPuanOrtu')).toHaveClass(/acik/);
    await supurVeIddia(page, 'HizliPuanlama');
  });

  test('10 Zenginleştirme önizlemesi temiz (katlı satırlar açık)', async ({ page }) => {
    await gece(page, gercekBenzeri());
    await rafaGec(page);
    await ayarlarAc(page);
    page.__agAyar.turler = TURLER53;
    page.__agAyar.google = gbYanit([{ ad: 'Dolu Kitap', yazar: 'Yazar Bir',
      kategoriler: ['Fiction'], isbn13: '9789750718533', sayfa: 280,
      yayinevi: 'Başka Yay', yil: 2015 }]);
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTarama')).toHaveClass(/acik/, { timeout: 15000 });
    await expect(page.locator('#zgTaramaGovde')).toContainText('Bulunanları uygula', { timeout: 20000 });
    /* satırlar kapalı <details class="zg-katla"> içinde — süpürmeye girsin diye aç */
    await page.click('#zgTarama .zg-katla summary');
    await expect(page.locator('#zgTarama .zg-onizle-satir').first()).toBeVisible();
    await supurVeIddia(page, 'ZenginOnizleme');
  });

  test('11a Tür içe aktarım penceresi temiz', async ({ page }) => {
    await gece(page, [sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' }),
      sahteKitap({ ad: 'Palto', yazar: 'Nikolai Gogol' })]);
    page.__agAyar.turler = TURLER56;
    await ayarlarAc(page);
    await dosyadanYukle(page, turDosya([
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' },
      { ad: 'Palto', yazar: 'Nikolai Gogol', tur: 'Hikaye (Öykü)' }]));
    await expect(page.locator('#zgTurIceOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toBeVisible();
    await supurVeIddia(page, 'TurIceAktarim');
  });

  test('11b Türkçe ad penceresi (hazır liste) temiz', async ({ page }) => {
    await gece(page, [sahteKitap({ ad: 'The Little Prince', yazar: 'Antoine de Saint-Exupéry' }),
      sahteKitap({ ad: 'Başka Kitap', yazar: 'B. Yazar' })]);
    page.__agAyar.turler = TURLER56;
    await ayarlarAc(page);
    await page.click('[data-act="zg-adtr-hazir"]');
    await expect(page.locator('#zgAdTrOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#zgAdTrOrtu .zg-ozet')).toBeVisible();
    await supurVeIddia(page, 'TurkceAdPenceresi');
  });

  test('12 Fikir ağı kesişim kartı temiz', async ({ page }) => {
    await gece(page, [
      faKitap('Heidegger Kitabı', [
        faNot('Birlikte olan alıntı', ['varlık', 'zaman'], 12),
        faNot('Yalnız varlık', ['varlık'])]),
      faKitap('Proust Kitabı', [
        faNot('İkinci birlikte alıntı', ['varlık', 'zaman'], 40),
        faNot('Alakasız alıntı', ['bellek'])])]);
    await rafaGec(page);
    await page.click('[data-act="sekme"][data-v="alinti"]');
    await expect(page.locator('#panel-alinti #faPanel')).toHaveCount(1);
    await page.click('#panel-alinti #fikirBulut [data-act="fikir-filtre"][data-v="varlık"]');
    await expect(page.locator('#panel-alinti #faKomsuKart')).toBeVisible();
    await page.click('#panel-alinti #faKomsuKart [data-act="fa-kesisim"][data-v="zaman"]');
    await expect(page.locator('#panel-alinti #faKesisimKart')).toBeVisible();
    await supurVeIddia(page, 'FikirAgiKesisim');
  });

  test('13 Yıl sonu rapor kartı (İstatistik paneli) temiz', async ({ page }) => {
    await gece(page, veriPaketi());
    await page.click('nav [data-v="ist"]');
    await expect(page.locator('#rpKart')).toBeVisible();
    await supurVeIddia(page, 'YilSonuRapor');
  });
});
