'use strict';
/* G50 — Fotoğraftan alıntı (OCR, ocr.js + ocr/ paketi).
   Sözleşmeler:
   - Paket (~6 MB) PEŞİN İNMEZ: sw ASSETS'te ocr/ yok; uygulama açılışı ocr/
     dosyasına istek atmaz. İLK KULLANIMDA onay SORULMADAN iner (Kaan kararı,
     v60): dürüstlük ilerleme ekranındaki bilgi notuyla ("~6 MB, bir kez"),
     indirme Vazgeç ile kesilebilir ve iptal YARIM KOVA BIRAKMAZ.
   - İnen paket kk_ocr_paket_v1 kovasına yazılır; ikinci kullanımda istek 0.
     sw activate temizliği kovayı KORUR; /ocr/ istekleri önce kovadan döner.
   - OCR çıktısı HİÇBİR ZAMAN doğrudan kaydedilmez: sonuç düzenlenebilir alana
     (detayda #d-not, Defterin'de Gelen alıntı paneli) gider; kayıt MEVCUT
     Ekle / "Kitaba kaydet" düğmeleriyle olur (yeni kayıt yolu yok).
   - Temizlik: satır sonu tiresi birleşir, tek başına rakam satırı ayıklanıp
     sayfa olarak ÖNERİLİR (kendiliğinden yazılmaz), paragraflar korunur.
   - Güven < 70 → "tanıma zayıf olabilir" uyarısı.
   Gerçek tesseract testte KOŞMAZ (yavaş): ocr/ rotası sahte motor sunar;
   indirme akışı sahteyi kovaya yazar, motor kovadan blob olarak yüklenir —
   yani önbellek yolu birebir üretimdeki yoldur.
   (Mutasyon 1 [v60]: ocr/ paket dosyaları sw ASSETS'e eklenir → "paket PEŞİN
    inmez" vakası kırmızı. Mutasyon 2: OCR bitince metin notlara doğrudan
    push edilir → "doğrudan kaydedilmez" vakası kırmızı.) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect, tohumla, sahteKitap, rafAc, rafYenile, ayarlarAc, onaylariKabulEt } = require('./yardim');

/* ---------- yardımcılar ---------- */
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

/* ocr/ paket dosyalarını sahte gövdeyle sunar + istekleri sayar.
   agTaklit'ten SONRA kaydedildiği için bu adresler için bu yönlendirici kazanır.
   gecikmeMs: indirme-anı arayüzünü (ilerleme, bilgi notu, Vazgeç) yakalamak
   ve iptali indirme sürerken tetiklemek için her dosyayı yapay geciktirir. */
async function ocrTaklit(page, sayac, gecikmeMs) {
  await page.route('**/ocr/**', async route => {
    const url = route.request().url();
    sayac.push(url.slice(url.lastIndexOf('/ocr/') + 1));
    if (gecikmeMs) await new Promise(r => setTimeout(r, gecikmeMs));
    if (url.includes('tesseract.min.js')) {
      route.fulfill({ status: 200, contentType: 'text/javascript', body: SAHTE_MOTOR }).catch(() => {});
    } else {
      route.fulfill({ status: 200, contentType: url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: 'sahte-paket-govdesi' }).catch(() => {});
    }
  });
}

/* küçük ama GERÇEK bir JPEG: önişleme (createImageBitmap + canvas) sahici koşar */
async function fotoB64(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 140;
    const x = c.getContext('2d');
    x.fillStyle = '#f0e8d8'; x.fillRect(0, 0, 240, 140);
    x.fillStyle = '#221f19'; x.font = '20px serif'; x.fillText('Deneme sayfası', 16, 70);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
}
async function fotoSec(page, tetik) {
  const b64 = await fotoB64(page);
  const [secici] = await Promise.all([page.waitForEvent('filechooser'), page.click(tetik)]);
  await secici.setFiles({ name: 'sayfa.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
}
async function detayAc(page) {
  await page.click('#liste .kart');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}
/* indirme akışını koşturur (detay açık olmalı) — onay YOK: basınca kendiliğinden iner */
async function paketIndirUI(page) {
  await page.click('#detayIcerik [data-act="oc-baslat"]');
  await expect(page.locator('#ocSec')).toBeVisible();   // indirme bitti, seçim adımı
  await page.click('#ocSec [data-act="oc-vazgec"]');
  await expect(page.locator('#ortuOcr')).not.toHaveClass(/acik/);
}
async function kitaplar(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1')).kitaplar);
}

/* ================= sw.js sözleşmeleri (Node, tarayıcısız) ================= */
const SW_KAYNAK = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

/* g20 swKur'un çok-kovalı türevi: activate temizliğini ve /ocr/ dalını sınar */
function swKurCok(baslangicKovalar) {
  const dinleyici = {};
  const kovalar = new Map();
  (baslangicKovalar || []).forEach(ad => kovalar.set(ad, new Map()));
  const silinen = [];
  const agIstekleri = [];
  const ctx = {
    self: {
      location: { origin: 'https://dessn7-bit.github.io' },
      addEventListener: (t, f) => { dinleyici[t] = f; },
      skipWaiting: () => {}, clients: { claim: () => {} }
    },
    caches: {
      open: async ad => {
        if (!kovalar.has(ad)) kovalar.set(ad, new Map());
        const m = kovalar.get(ad);
        return { put: async (i, y) => { m.set(i.url || i, y); }, match: async i => m.get(i.url || i), addAll: async () => {} };
      },
      keys: async () => [...kovalar.keys()],
      delete: async ad => { silinen.push(ad); kovalar.delete(ad); return true; },
      match: async i => { for (const m of kovalar.values()) { const v = m.get(i.url || i); if (v) return v; } return undefined; }
    },
    fetch: async i => { agIstekleri.push(i.url || i); return { tip: 'ag', clone: () => ({ tip: 'ag-kopya' }) }; },
    Response: class { constructor(g, o) { this.govde = g; Object.assign(this, o || {}); } },
    URL, console
  };
  vm.createContext(ctx);
  vm.runInContext(SW_KAYNAK, ctx);
  return { dinleyici, kovalar, silinen, agIstekleri };
}
async function swIstek(kurulum, url) {
  let yanitSozu = null;
  kurulum.dinleyici.fetch({
    request: { url, method: 'GET', mode: 'no-cors' },
    respondWith: p => { yanitSozu = p; }
  });
  return yanitSozu ? await yanitSozu : null;
}

test.describe('G50 sw sözleşmeleri', () => {

  test('paket PEŞİN inmez: sw ASSETS listesinde ocr/ paket dosyası YOK, ocr.js VAR', async () => {
    const e = SW_KAYNAK.match(/const ASSETS = \[([^\]]*)\]/);
    expect(e, 'sw.js içinde ASSETS listesi bulunamadı').toBeTruthy();
    const liste = e[1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(liste).toContain('./ocr.js');
    expect(liste.filter(d => d.includes('ocr/'))).toEqual([]);
    // index.html de paketi statik yüklemez
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(html.includes('src="./ocr/')).toBe(false);
  });

  test('activate temizliği OCR kovasını KORUR, bayat sürüm kovasını siler', async () => {
    /* v94: CACHE artık literal değil ONEK + '-v##' — sandbox location'sız,
       önek varsayılan 'kitaplik' (g86 kilidi); sürüm kaynaktan çekilir. */
    const simdiki = 'kitaplik-v' + SW_KAYNAK.match(/const CACHE = ONEK \+ '-v(\d+)'/)[1];
    const k = swKurCok(['kitaplik-v0-bayat', 'kk_ocr_paket_v1', simdiki]);
    const bekleyen = [];
    k.dinleyici.activate({ waitUntil: p => bekleyen.push(p) });
    await Promise.all(bekleyen);
    expect(k.silinen).toContain('kitaplik-v0-bayat');
    expect(k.silinen).not.toContain('kk_ocr_paket_v1');
    expect([...k.kovalar.keys()]).toContain('kk_ocr_paket_v1');
  });

  test('/ocr/ isteği önce OCR kovasından döner; ana kovaya yazılmaz; kova boşsa ağa düşer', async () => {
    /* v94: CACHE artık literal değil ONEK + '-v##' — sandbox location'sız,
       önek varsayılan 'kitaplik' (g86 kilidi); sürüm kaynaktan çekilir. */
    const simdiki = 'kitaplik-v' + SW_KAYNAK.match(/const CACHE = ONEK \+ '-v(\d+)'/)[1];
    const k = swKurCok([simdiki]);
    const url = 'https://dessn7-bit.github.io/kitaplik/ocr/tur.traineddata.gz';
    // kova boş → ağa düşer
    const bos = await swIstek(k, url);
    expect(bos.tip).toBe('ag');
    // ağdan dönen yanıt ANA kovaya da OCR kovasına da kendiliğinden YAZILMAMALI
    expect(k.kovalar.get(simdiki).size).toBe(0);
    // ocr.js'in koyduğu içerik kovadayken oradan döner, ağa gitmez
    k.kovalar.get('kk_ocr_paket_v1') || k.kovalar.set('kk_ocr_paket_v1', new Map());
    k.kovalar.get('kk_ocr_paket_v1').set(url, { tip: 'kova' });
    const oncekiAg = k.agIstekleri.length;
    const dolu = await swIstek(k, url);
    expect(dolu.tip).toBe('kova');
    expect(k.agIstekleri.length).toBe(oncekiAg);
  });
});

/* ================= uygulama akışı ================= */
test.describe('G50 Fotoğraftan alıntı', () => {

  test('uygulama açılışı ocr/ dosyalarına istek atmaz', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    expect(sayac).toEqual([]);
  });

  test('"Fotoğraftan"a basınca onay SORULMADAN indirme başlar; ilerleme + bilgi notu görünür', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac, 250);   // yavaşlatılmış indirme: indirme-anı arayüzü yakalanır
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await page.click('#detayIcerik [data-act="oc-baslat"]');
    // onay penceresi YOK: doğrudan indirme ekranı
    await expect(page.locator('#ocIlerleme')).toBeVisible();
    await expect(page.locator('#ocDurumMetin')).toContainText('indiriliyor');
    await expect(page.locator('#ocIlerleme .ilerleme')).toBeVisible();          // ilerleme kanalı
    await expect(page.locator('#ocIlerlemeNot')).toContainText('~6 MB');        // BİLGİ notu (onay değil)
    await expect(page.locator('#ocIlerlemeNot')).toContainText('bir kez');
    await expect(page.locator('#ocIptalSatir [data-act="oc-vazgec"]')).toBeVisible();  // kesilebilir
    await expect.poll(() => sayac.length).toBeGreaterThan(0);   // onay beklemeden istekler başladı
    await expect(page.locator('#ocSec')).toBeVisible({ timeout: 10000 });   // bitti → seçim adımı
    expect(sayac.length).toBe(4);
  });

  test('indirme Vazgeç ile KESİLİR; iptal yarım kova bırakmaz; yeniden deneme sıfırdan tamamlanır', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac, 350);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await page.click('#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#ocIptalSatir [data-act="oc-vazgec"]')).toBeVisible();
    await page.click('#ocIptalSatir [data-act="oc-vazgec"]');   // ilk dosya inerken kes
    await expect(page.locator('#ortuOcr')).not.toHaveClass(/acik/);
    // yarım kova YOK (tamamlanan dosyalar da silinir)
    await expect.poll(() => page.evaluate(() => caches.has('kk_ocr_paket_v1').then(v => v))).toBe(false);
    // kesilen indirme arkada sürmez: 4 dosyanın tamamı asla istenmedi
    await page.waitForTimeout(900);
    expect(sayac.length).toBeLessThan(4);
    // yeniden deneme: temiz durumdan başlar ve tamamlanır
    await page.click('#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#ocSec')).toBeVisible({ timeout: 10000 });
    const kovaTam = await page.evaluate(() => window.__ocr.paketDurum().then(d => d.tam));
    expect(kovaTam).toBe(true);
  });

  test('basınca paket iner (4 dosya) ve kovaya yazılır', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    expect(sayac.length).toBe(4);   // motor + worker + çekirdek + model; fazlası da eksiği de hata
    const kovada = await page.evaluate(async () => {
      const c = await caches.open('kk_ocr_paket_v1');
      const o = window.__ocr;
      const dortlu = [o.MOTOR, o.ISCI, await o.cekirdekSec(), o.MODEL];
      const sonuc = [];
      for (const y of dortlu) sonuc.push(!!(await c.match(y)));
      return sonuc;
    });
    expect(kovada).toEqual([true, true, true, true]);
  });

  test('ikinci kullanımda paket YENİDEN İNMEZ (istek sayacı 0)', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await rafYenile(page);
    await detayAc(page);
    sayac.length = 0;
    await page.evaluate(() => { window.__ocrSahte = { metin: 'İkinci kullanım cümlesi.' }; });
    await fotoSec(page, '#detayIcerik [data-act="oc-baslat"]');   // indirme ekranı bile yok, seçici direkt açılır
    await expect(page.locator('#d-not')).toHaveValue('İkinci kullanım cümlesi.');
    expect(sayac).toEqual([]);   // motor bile kovadan (blob) geldi
    // üretim yolu kanıtı: motor gerçekten bizim ayarlarla kuruldu
    const ayar = await page.evaluate(() => window.__ocrMotorAyar);
    expect(ayar.dil).toBe('tur');
    expect(ayar.cacheMethod).toBe('none');
    expect(ayar.corePath.endsWith('.wasm.js')).toBe(true);   // tespit atlanır, dosya doğrudan
  });

  test('sonuç DÜZENLENEBİLİR alanda; doğrudan KAYDEDİLMEZ; kayıt mevcut Ekle ile olur', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.evaluate(() => { window.__ocrSahte = { metin: 'Tanınan ham cümle.' }; });
    await fotoSec(page, '#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#d-not')).toHaveValue('Tanınan ham cümle.');
    // DOĞRUDAN KAYIT YOK (Mutasyon 2 kilidi)
    expect((await kitaplar(page))[0].notlar).toEqual([]);
    // kullanıcı düzeltir, MEVCUT Ekle kaydeder
    await page.fill('#d-not', 'Tanınan ve düzeltilen cümle.');
    await page.click('#detayIcerik [data-act="not-ekle"]');
    const notlar = (await kitaplar(page))[0].notlar;
    expect(notlar.length).toBe(1);
    expect(notlar[0].metin).toBe('Tanınan ve düzeltilen cümle.');
    expect(notlar[0].ng).toBeGreaterThan(0);   // mevcut akışın damgası
  });

  test('temizlik birimi: satır sonu tiresi birleşir, paragraf korunur', async ({ page }) => {
    await tohumla(page, []);
    await rafAc(page);
    const s = await page.evaluate(() => window.__ocr.metniTemizle(
      'Aşk, insanın kendi eksikliğini tamam-\nlama çabasıdır.\nİkinci satır.\n\nYeni paragraf.'));
    expect(s.metin).toBe('Aşk, insanın kendi eksikliğini tamamlama çabasıdır. İkinci satır.\n\nYeni paragraf.');
    expect(s.sayfaOneri).toBe(null);
  });

  test('temizlik birimi: tek başına rakam satırı ayıklanır ve sayfa olarak önerilir', async ({ page }) => {
    await tohumla(page, []);
    await rafAc(page);
    const s = await page.evaluate(() => window.__ocr.metniTemizle('Satır bir.\n127\nSatır iki.'));
    expect(s.metin).toBe('Satır bir. Satır iki.');
    expect(s.sayfaOneri).toBe(127);
    // rakam İÇEREN ama tek başına olmayan satır ayıklanmaz
    const t = await page.evaluate(() => window.__ocr.metniTemizle('1984 yılında oldu.'));
    expect(t.metin).toBe('1984 yılında oldu.');
    expect(t.sayfaOneri).toBe(null);
  });

  test('sayfa önerisi görünür ama KENDİLİĞİNDEN yazılmaz; "kullan" doldurur', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.evaluate(() => { window.__ocrSahte = { metin: 'Cümle burada.\n127' }; });
    await fotoSec(page, '#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#d-not')).toHaveValue('Cümle burada.');
    await expect(page.locator('#d-not-sayfa')).toHaveValue('');   // otomatik yazım YOK
    const oneri = page.locator('#ocNotu [data-act="oc-sayfa-kullan"]');
    await expect(oneri).toBeVisible();
    await expect(oneri).toContainText('127');
    await oneri.click();
    await expect(page.locator('#d-not-sayfa')).toHaveValue('127');
  });

  test('güven eşiğin ALTINDA → "tanıma zayıf olabilir" uyarısı görünür (AA iki temada)', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.evaluate(() => { window.__ocrSahte = { metin: 'Zor okunan metin.', guven: 55 }; });
    await fotoSec(page, '#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#ocNotu .oc-uyari')).toBeVisible();
    await expect(page.locator('#ocNotu .oc-uyari')).toContainText('kontrol et');
    // uyarı renginin kontrastı — iki temada da AA (eşiğe yakın renk --drop olduğu için ölçülür)
    const oranlar = await page.evaluate(() => {
      const luma = c => {
        const [r, g, b] = c.match(/[\d.]+/g).map(Number);
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const olc = () => {
        const u = document.querySelector('#ocNotu .oc-uyari');
        const l1 = luma(getComputedStyle(u).color);
        const l2 = luma(getComputedStyle(document.body).backgroundColor);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const acik = olc();
      document.documentElement.dataset.tema = 'karanlik';
      const koyu = olc();
      document.documentElement.dataset.tema = 'acik';
      return { acik, koyu };
    });
    expect(oranlar.acik).toBeGreaterThanOrEqual(4.5);
    expect(oranlar.koyu).toBeGreaterThanOrEqual(4.5);
  });

  test('güven eşiğin ÜSTÜNDE → uyarı yok', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.evaluate(() => { window.__ocrSahte = { metin: 'Gayet net metin.', guven: 95 }; });
    await fotoSec(page, '#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#d-not')).toHaveValue('Gayet net metin.');
    await expect(page.locator('#ocNotu .oc-uyari')).toHaveCount(0);
  });

  test('Defterin akışı: sonuç Gelen alıntı paneline gider; kayıt MEVCUT "Kitaba kaydet" ile', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.click('#detayIcerik [data-act="detay-kapat"]');   // nav detay açıkken inert
    await page.click('nav [data-act="sekme"][data-v="alinti"]');
    await expect(page.locator('#panel-alinti')).toHaveClass(/active/);
    await page.evaluate(() => { window.__ocrSahte = { metin: 'Defterden gelen cümle.' }; });
    await fotoSec(page, '#alintiIcerik [data-act="oc-al"]');
    await expect(page.locator('#ortuGelen')).toHaveClass(/acik/);
    await expect(page.locator('#gelen-metin')).toHaveValue('Defterden gelen cümle.');   // düzenlenebilir alan
    expect((await kitaplar(page))[0].notlar).toEqual([]);   // doğrudan kayıt YOK
    // g29 sözleşmesi: panelde görünür brass hâlâ TEK (uyarı satırı düğme eklemez)
    const brass = page.locator('#ortuGelen .btn-brass');
    await expect(brass).toHaveCount(1);
    // mevcut akışla kayıt
    await page.click('#gelen-liste [data-act="gelen-kitap"]');
    await page.click('[data-act="gelen-kaydet"]');
    await expect(page.locator('#ortuGelen')).not.toHaveClass(/acik/);
    const notlar = (await kitaplar(page))[0].notlar;
    expect(notlar.length).toBe(1);
    expect(notlar[0].tip).toBe('alinti');
    expect(notlar[0].metin).toBe('Defterden gelen cümle.');
  });

  test('Ayarlar ▸ Depolama: paket yokken "İndirilmedi", silme düğmesi gizli', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await expect(page.locator('#ocDepoBilgi')).toContainText('İndirilmedi');
    await expect(page.locator('#ayBolumDepolama [data-act="oc-paket-sil"]')).toBeHidden();
  });

  test('Ayarlar ▸ Depolama: indirildikten sonra boyut görünür, silme kovayı boşaltır', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await onaylariKabulEt(page);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.click('#detayIcerik [data-act="detay-kapat"]');   // header detay açıkken inert
    await ayarlarAc(page);
    await expect(page.locator('#ocDepoBilgi')).toContainText('İndirildi');
    await expect(page.locator('#ocDepoBilgi')).toContainText('MB');
    const sil = page.locator('#ayBolumDepolama [data-act="oc-paket-sil"]');
    await expect(sil).toBeVisible();
    await sil.click();
    await expect.poll(() => page.evaluate(() => caches.has('kk_ocr_paket_v1').then(v => v))).toBe(false);
    await expect(page.locator('#ocDepoBilgi')).toContainText('İndirilmedi');
    await expect(sil).toBeHidden();
  });

  test('çevrimdışı + paket YOK → dürüst mesaj, indirme denenmez', async ({ page, context }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await context.setOffline(true);
    await page.click('#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#ocHata')).toBeVisible();
    await expect(page.locator('#ocHataMetin')).toContainText('çevrimdışı');
    await expect(page.locator('#ocIlerleme')).toBeHidden();   // indirme hiç başlamadı
    expect(sayac).toEqual([]);
    await context.setOffline(false);
  });

  test('çevrimdışı + paket VAR → akış ÇALIŞIR (istek sıfır)', async ({ page, context }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    await paketIndirUI(page);
    await page.unroute('**/ocr/**');   // sahte sunucu da yok artık: tek kaynak kova
    await context.setOffline(true);
    await page.evaluate(() => { window.__ocrSahte = { metin: 'Çevrimdışı tanınan cümle.' }; });
    await fotoSec(page, '#detayIcerik [data-act="oc-baslat"]');
    await expect(page.locator('#d-not')).toHaveValue('Çevrimdışı tanınan cümle.');
    await context.setOffline(false);
  });

  test('Ciltli sözleşme: pencerede dolu düğme ve yuvarlak kart yok, emoji yok; girişler kicker satırında', async ({ page }) => {
    const sayac = [];
    await ocrTaklit(page, sayac);
    await tohumla(page, [sahteKitap({ ad: 'Sessiz Ev' })]);
    await rafAc(page);
    await detayAc(page);
    // giriş noktası kicker'lı bölüm başlığında
    const giris = page.locator('#detayIcerik .d-bolum-bas:has(.kicker) [data-act="oc-baslat"]');
    await expect(giris).toBeVisible();
    await giris.click();
    await expect(page.locator('#ocSec')).toBeVisible();   // indirme (sahte) anında bitti
    const ihlaller = await page.evaluate(() => {
      const sonuc = [];
      ['ocIlerleme', 'ocSec', 'ocHata'].forEach(id => {
        const kok = document.getElementById(id);
        [kok, ...kok.querySelectorAll('*')].forEach(el => {
          const s = getComputedStyle(el);
          const r = Math.max(...s.borderRadius.split(' ').map(parseFloat).filter(n => !isNaN(n)), 0);
          if (r > 7) sonuc.push(id + ': yarıçap ' + r);
          if (s.boxShadow !== 'none') sonuc.push(id + ': gölge');
          if (el.tagName === 'BUTTON') {
            const a = s.backgroundColor.match(/[\d.]+/g);
            const alfa = a && a.length === 4 ? parseFloat(a[3]) : (s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 0 : 1);
            if (alfa >= 0.5) sonuc.push(id + ': dolu düğme ' + s.backgroundColor);
          }
        });
      });
      return sonuc;
    });
    expect(ihlaller).toEqual([]);
    const YASAK_IKON = /[\u{1F000}-\u{1FAFF}]|\u{FE0F}|[⚙☀☾⚠✓☰▦▤▶⏸↩❝]/u;
    expect(YASAK_IKON.test(await page.locator('#ortuOcr').innerText())).toBe(false);
    // Defterin girişi de yerinde (liste bölümü, kicker'lı başlığın hemen altında)
    await page.click('#ocSec [data-act="oc-vazgec"]');
    await page.click('#detayIcerik [data-act="detay-kapat"]');
    await page.click('nav [data-act="sekme"][data-v="alinti"]');
    await expect(page.locator('#alBolumListe [data-act="oc-al"]')).toBeVisible();
  });
});
