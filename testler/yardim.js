/* Kitaplik test yardimcilari:
   - agTaklit: TUM dis agi taklit eder; taklit edilmeyen dis istek testi DUSURUR
   - kameraTaklit / kameraYok: BarcodeDetector + getUserMedia sahteleri
   - tohumla: localStorage'a baslangic kutuphanesi yazar (goto'dan ONCE cagrilmali)
   - sahteKitap: varsayilan alanlarla kitap nesnesi uretir
   Testler `yardim.js`teki `test`i kullanmali (temel @playwright/test degil):
   agTaklit otomatik kurulur ve test sonunda beklenmeyen-istek denetimi yapilir. */
'use strict';
const { test: temel, expect } = require('@playwright/test');

/* 2×2 PNG (M1/v69): uygulama artık naturalWidth<=1 görseli "boş kapak" sayıp
   yedeğe düşürüyor — taklit kapak 1×1 olsaydı her sağlam-kapak vakası yanlış
   sebeple yedeğe düşerdi. "Sağlam kapak" taklidi bu yüzden >1px olmalı. */
const KAPAK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGOoiDKqiDJigFAAHZYEEWc+D7MAAAAASUVORK5CYII=',
  'base64');

let kitapSayac = 0;
function sahteKitap(ek) {
  kitapSayac++;
  return Object.assign({
    id: 'test' + kitapSayac + 'x' + Math.random().toString(36).slice(2, 7),
    eklenme: 1754000000000 + kitapSayac,
    ad: 'Deneme Kitabı ' + kitapSayac, yazar: 'Deneme Yazar', yayinevi: '', yil: null,
    sayfa: null, tur: '', durum: 'okunacak', puan: null, guncelSayfa: 0,
    baslamaTarihi: null, bitisTarihi: null, etiketler: [], kapak: null,
    g: 0, raf: '', isbn: '', seanslar: [], oturumlar: [], odunc: [], notlar: []
  }, ek || {});
}

/* goto'dan ONCE cagrilir. kitaplar: dizi veya tam veri nesnesi. ekstra: {lsAnahtari: deger}
   Tohum yalniz ILK yuklemede yazilir (init script her navigasyonda yeniden kosar;
   bayrak olmasa reload testlerinde uygulamanin kaydettigi veri ezilirdi). */
async function tohumla(page, kitaplar, ekstra) {
  const v = Array.isArray(kitaplar) ? { kitaplar, hedef: {} } : kitaplar;
  const ek = {};
  for (const [anahtar, deger] of Object.entries(ekstra || {})) {
    if (deger === null) continue;   // null = "bu anahtarı HİÇ tohumlama" (v40 sentineli)
    ek[anahtar] = typeof deger === 'string' ? deger : JSON.stringify(deger);
  }
  /* v40 GÖÇ (davranış-koruyucu): Kütüphane varsayılanı artık İZGARA. Eski
     vakalar liste GÖRÜNÜMÜNÜN İÇERİĞİNİ sınıyor (görünüm seçimini değil) —
     tohumla, tercih belirtilmemişse liste tercihini basar ki yüzlerce vaka
     amacını korusun. İki istisna: (1) {kk_gorunum_v1: null} sentineli hiç
     tohumlamaz (g34 varsayılan-izgara vakaları); (2) anahtar localStorage'da
     ZATEN varsa (başka bir addInitScript basmışsa — g12/g16 izgaraAc deseni)
     ezilmez. */
  const gorunumVarsayilan = ('kk_gorunum_v1' in (ekstra || {}))
    ? null : '{"izgara":false,"rafGrupla":false}';
  /* v66 GÖÇ (davranış-koruyucu): uygulama artık açılışta türü boş kitaplar
     için ARKA PLAN tür taraması koşuyor. Eski vakaların hiçbirinin niyeti bu
     tarama değil — sayaç iddiaları taramanın ek istekleriyle anlamını
     yitirirdi. tohumla, tohumlanan her kitabı "az önce denendi" defteriyle
     işaretler (tarama onları atlar). İstisna: ekstra'da kk_zg_oto_deneme_v1
     anahtarı VARSA (null sentineli dahil — hiç tohumlama) buradaki varsayılan
     basılmaz; g55 taramayı böyle gerçekten koşturur (gorunum deseninin eşi). */
  if (!('kk_zg_oto_deneme_v1' in (ekstra || {}))) {
    const defter = {};
    (v.kitaplar || []).forEach(k => { if (k && k.id) defter[k.id] = Date.now(); });
    ek['kk_zg_oto_deneme_v1'] = JSON.stringify(defter);
  }
  await page.addInitScript(([veriJson, ekObj, gorunumV]) => {
    if (localStorage.getItem('__kk_tohumlandi')) return;
    localStorage.setItem('__kk_tohumlandi', '1');
    localStorage.setItem('kk_kitaplik_v1', veriJson);
    for (const [a, d] of Object.entries(ekObj)) localStorage.setItem(a, d);
    if (gorunumV && localStorage.getItem('kk_gorunum_v1') === null)
      localStorage.setItem('kk_gorunum_v1', gorunumV);
  }, [JSON.stringify(v), ek, gorunumVarsayilan]);
}

/* --- Sprint IA gezinme yardimcilari ---
   Acilis artik Ana Sayfa. Kutuphane listesine bakan vakalar uygulamayi rafAc
   ile acar: nav dugmesine BASAR (gercek kullanici yolu), ?sekme= derin baglanti
   kestirmesini KULLANMAZ — kestirme kullanilsaydi urunun varsayilan sekme
   davranisi hicbir vakada sinanmamis kalirdi. Ana Sayfa'yi SINAYAN vakalar
   dogrudan page.goto('/') cagirir. */
async function rafaGec(page) {
  await page.click('nav [data-act="sekme"][data-v="raf"]');
  await expect(page.locator('#panel-raf')).toHaveClass(/active/);
}
async function rafAc(page, yol) {
  await page.goto(yol || '/');
  await rafaGec(page);
}
/* Yenileme de Ana Sayfa'ya duser; listeye donen vakalar bunu kullanir. */
async function rafYenile(page) {
  await page.reload();
  await rafaGec(page);
}
/* Eski "Yedek sekmesi" artik header'daki dis dugmesiyle acilan Ayarlar penceresi. */
/* v106: Ayarlar 4 KATLI gruba bolundu (ayg-grup). Gruplar kapali acilir, yani
   icerideki dugmeler gizli olur ve page.click gormez. Bu yardimci acilis
   sonrasi TUM gruplari acar: boylece v106 oncesi yazilmis yuzlerce vakanin
   gorunurluk beklentisi BIREBIR korunur. Akordiyonun kendi davranisini
   g48 + g104 sinar; oteki vakalarin konusu o degil.
   Tehlikeli bolge AYRI kalir (tehlikeAc) — orada katlama gezinme degil KAZA
   ENGELI, acmak vakanin bilincli adimi olmali. */
async function gruplariAc(page) {
  const n = await page.locator('#ortuAyar details.ayg-grup').count();
  for (let i = 0; i < n; i++) {
    const g = page.locator('#ortuAyar details.ayg-grup').nth(i);
    if (!(await g.evaluate(e => e.open))) await g.locator('summary.ayg-bas').click();
  }
}
async function ayarlarAc(page) {
  // header'a kapsanir: bos kutuphanede Ana Sayfa'da da bir ayar-ac dugmesi var
  await page.click('header [data-act="ayar-ac"]');
  await expect(page.locator('#ortuAyar')).toHaveClass(/acik/);
  await gruplariAc(page);
}
/* v56: "Kutuphaneyi bosalt" TEHLIKELI BOLGE'de ve KATLI geliyor — katlama burada
   gezinme degil KAZA ENGELI (iki confirm'e ek ucuncu kasit katmani). Yikici
   eylemi tiklayan vakalar once bolumu acar. */
async function tehlikeAc(page) {
  const d = page.locator('#ayBolumTehlike');
  if (!(await d.evaluate(e => e.open))) await page.click('#ayBolumTehlike summary');
  await expect(page.locator('#ortuAyar [data-act="tumunu-sil"]')).toBeVisible();
}

/* Ag taklidi. Ayar page.__agAyar uzerinden test sirasinde da degistirilebilir:
   { google: <GB yaniti|'hata'>, worker: <worker yaniti|'hata'>,
     olArama: <OL search yaniti|'hata'>, olKitap: <OL books yaniti|'hata'> }
     turler: <[{seo,ad,kitapSayisi}]|'hata'>,                      // v52 kesif uclari
     tur: { <slug>: <{tur,sonuclar,hasMore}|'hata'> },
     isbn: <{sonuclar:[...]}|'hata'> }                                 // v97 worker /isbn
   Tur ucu GERCEK worker gibi davranir: haritada olmayan slug 404 doner
   (kaynaktaki "200 + kitapTuru yok" imzasinin worker'daki karsiligi).
   Sayaclar page.__agSayac:
     { google, worker, turler, tur, olArama, olKitap, firebase, sonGoogleUrl, sonTurUrl } */
async function agTaklit(page, ayar) {
  const sayac = { google: 0, worker: 0, turler: 0, tur: 0, olArama: 0, olKitap: 0,
    firebase: 0, bildirim: 0, isbn: 0, sonGoogleUrl: '', sonTurUrl: '', sonIsbnUrl: '' };
  const beklenmeyen = [];
  page.__agSayac = sayac;
  page.__agBeklenmeyen = beklenmeyen;
  page.__agAyar = ayar || {};
  const json = (route, govde) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(govde) });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:8124')) return route.continue();
    const a = page.__agAyar;
    if (url.includes('googleapis.com/books')) {
      sayac.google++; sayac.sonGoogleUrl = url;
      if (a.google === 'hata') return route.abort('failed');
      return json(route, a.google || { totalItems: 0, items: [] });
    }
    if (url.includes('kitaplik-ara.dessn7.workers.dev/turler')) {
      sayac.turler++;
      if (a.turler === 'hata') return route.abort('failed');
      return json(route, { turler: a.turler || [] });
    }
    if (url.includes('kitaplik-ara.dessn7.workers.dev/tur?')) {
      sayac.tur++; sayac.sonTurUrl = url;
      if (a.tur === 'hata') return route.abort('failed');
      const slug = decodeURIComponent((url.match(/[?&]slug=([^&]*)/) || [])[1] || '');
      const d = (a.tur || {})[slug];
      if (d === 'hata') return route.abort('failed');
      if (!d) return route.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ hata: 'tur-bulunamadi' }) });
      return json(route, d);
    }
    /* v97: worker /isbn ucu AYRI dal + AYRI sayaç — genel `worker` sayacı ve
       /ara taklidi (a.worker) mevcut vakaların anlamını korur. Varsayılan boş:
       Google boş dönen eski vakalar yine 'bulunamadı' görür. */
    if (url.includes('kitaplik-ara.dessn7.workers.dev/isbn?')) {
      sayac.isbn++; sayac.sonIsbnUrl = url;
      if (a.isbn === 'hata') return route.abort('failed');
      return json(route, a.isbn || { sonuclar: [] });
    }
    if (url.includes('kitaplik-ara.dessn7.workers.dev')) {
      sayac.worker++;
      if (a.worker === 'hata') return route.abort('failed');
      return json(route, a.worker || { sonuclar: [] });
    }
    if (url.includes('kitaplik-bildirim.dessn7.workers.dev')) {
      sayac.bildirim++;
      if (a.bildirim === 'hata') return route.abort('failed');
      return json(route, a.bildirim || { tamam: true });
    }
    if (url.includes('openlibrary.org/search.json')) {
      sayac.olArama++;
      if (a.olArama === 'hata') return route.abort('failed');
      return json(route, a.olArama || { docs: [] });
    }
    if (url.includes('openlibrary.org/api/books')) {
      sayac.olKitap++;
      if (a.olKitap === 'hata') return route.abort('failed');
      return json(route, a.olKitap || {});
    }
    if (url.includes('covers.openlibrary.org') || url.includes('books.google')
        || url.includes('gr-assets') || url.includes('1k-cdn.com')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: KAPAK_PNG });
    }
    if (url.includes('identitytoolkit.googleapis.com') || url.includes('securetoken.googleapis.com')
        || url.includes('firebasedatabase.app')) {
      sayac.firebase++;
      return json(route, {});
    }
    beklenmeyen.push(url);
    return route.abort('failed');
  });
}

/* Sahte kamera: window.__sahteKod'a yazilan deger BarcodeDetector.detect ile "okunur".
   Akis durdurulunca window.__akisDurdu true olur. */
async function kameraTaklit(page) {
  await page.addInitScript(() => {
    window.__sahteKod = null;
    window.__akisDurdu = false;
    window.__akisIstendi = false;
    window.BarcodeDetector = class {
      constructor() {}
      static async getSupportedFormats() { return ['ean_13', 'ean_8', 'isbn']; }
      async detect() {
        return window.__sahteKod ? [{ rawValue: window.__sahteKod, format: 'ean_13' }] : [];
      }
    };
    const sahteAkis = () => {
      const tuval = document.createElement('canvas');
      tuval.width = 320; tuval.height = 240;
      tuval.getContext('2d').fillRect(0, 0, 320, 240);
      const akis = tuval.captureStream(5);
      akis.getTracks().forEach(iz => {
        const asilDurdur = iz.stop.bind(iz);
        iz.stop = () => { window.__akisDurdu = true; asilDurdur(); };
      });
      return akis;
    };
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    navigator.mediaDevices.getUserMedia = async () => {
      window.__akisIstendi = true;
      return sahteAkis();
    };
  });
}

/* Kamera desteksiz cihaz taklidi */
async function kameraYok(page) {
  await page.addInitScript(() => {
    try { delete window.BarcodeDetector; } catch (e) {}
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
}

/* confirm/alert diyaloglarini otomatik kabul et */
function onaylariKabulEt(page) {
  page.on('dialog', d => d.accept());
}

function bugunISO(kayma) {
  const d = new Date();
  if (kayma) d.setDate(d.getDate() + kayma);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

/* agTaklit'i otomatik kuran ve test sonunda beklenmeyen istekleri denetleyen test tabani */
const test = temel.extend({
  page: async ({ page }, kullan) => {
    await agTaklit(page);
    await kullan(page);
    expect(page.__agBeklenmeyen,
      'Taklit edilmemis dis istek yakalandi (kurala gore test HATA verir)').toEqual([]);
  }
});

/* D2 (form katlama): ikincil form alanları #fAyrintilar içinde, yeni kitapta
   KAPALI gelir. Bu yardımcı idempotenttir — kapalıysa açar, açıksa dokunmaz
   (düzenleme modunda açık gelir; koşulsuz summary tıklaması onu KAPATIRDI). */
async function ayrintilarAc(page) {
  const d = page.locator('#fAyrintilar');
  if (!(await d.evaluate(e => e.open))) await page.click('#fAyrintilar summary');
}

/* v109 (dosyadan yükle): yedi ayrı giriş düğmesi tek "Dosya seç" kapısında
   birleşti — dosya seçilince ALGILAMA KARTI çıkar, boru onaydan sonra koşar.
   Yardımcı üç adımı birden yapar; çağıran taraf tek satır kalır (v106 dersi:
   ortak yardımcı yapısal UI değişiminin maliyetini öder).
     secim === false → kartta DURUR (algılama vakaları kartı sınar)
     secim === 'birlestir' | 'degistir' | ... → birden çok varış varsa hangisi
     secim yok → tek varış vardır, onu koşturur.
   ayarlarAc'ı ÇAĞIRMAZ: bazı vakalar pencereyi kendi düzenekleriyle açıyor. */
async function dosyadanYukle(page, dosya, secim) {
  await page.click('#ortuAyar [data-act="dy-sec"]');
  await page.setInputFiles('#dyDosya', dosya);
  await expect(page.locator('#dyKarar')).toBeVisible();
  if (secim === false) return;
  await page.click('#dyKarar [data-act="dy-calistir"]'
    + (secim ? `[data-v="${secim}"]` : ''));
}
/* JSON gövdesini dosya tanımına çevirir — çağrı yerlerindeki Buffer.from
   tekrarı tek yerde toplansın. */
function jsonDosya(govde, ad) {
  const buffer = Buffer.isBuffer(govde) ? govde
    : Buffer.from(typeof govde === 'string' ? govde : JSON.stringify(govde), 'utf8');
  return { name: ad || 'veri.json', mimeType: 'application/json', buffer };
}

module.exports = { test, expect, tohumla, sahteKitap, agTaklit, kameraTaklit, kameraYok,
  onaylariKabulEt, bugunISO, rafAc, rafaGec, rafYenile, ayarlarAc, gruplariAc, tehlikeAc,
  ayrintilarAc, dosyadanYukle, jsonDosya };
