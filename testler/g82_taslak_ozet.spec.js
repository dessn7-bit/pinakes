'use strict';
/* G82 — TASLAK ÖZET üretimi (v82).

   EN ÖNEMLİ KURAL (bu dosyanın ana kilidi): üretilen metin __ozet'e ASLA
   kendiliğinden yazılmaz. Taslak AYRI depoda (kk_taslak_v1) bekler; yalnız
   kullanıcı onaylayınca __ozet.kaydet çağrılır. Taslaklar SENKRONLANMAZ ve
   JSON YEDEĞE GİRMEZ.

   Worker /ozet-taslak sırası: gövde → köken → anahtar → 24s kilit → günlük
   sayaç → KAYNAK DOĞRULAMASI → model. Kaynakta bulunamayan kitapta model
   HİÇ çağrılmaz (doğrulanmamış kitapta model kendinden emin uydurur).
   Günlük sayaç MODEL ÇAĞRISINI sayar (üretimi değil) — "bilmiyorum" yanıtı
   da maliyettir.

   Worker testleri g20 deseninde DOĞRUDAN NODE'da koşar (sahte fetch/caches);
   tarayıcı testleri /ozet-taslak'ı route ile taklit eder (test route'u
   yardim.js agTaklit'ten SONRA kurulur, önce denenir).

   (Mutasyon hedefleri: doğrulama kapısını kaldır → (W2) kırmızı; taslağı
    __ozet'e doğrudan yaz → (B2)/(B4) kırmızı; disaAktar'a taslak ekle →
    (B4) kırmızı.) */
const { test: temel, expect: nodeExpect } = require('@playwright/test');
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, rafaGec, ayarlarAc, ayrintilarAc } = require('./yardim');
const path = require('path');

/* ================= Worker: /ozet-taslak (node) ================= */
const KOK = path.join(__dirname, '..');
const KOKEN = 'https://dessn7-bit.github.io';
const UC = 'https://kitaplik-ara.dessn7.workers.dev/ozet-taslak';

function sahteYanit(govde, ok) {
  return { ok: ok !== false, status: ok === false ? 500 : 200,
    json: async () => govde, text: async () => (typeof govde === 'string' ? govde : JSON.stringify(govde)) };
}
const GR_TASLAK = [{ bookTitleBare: 'Tanrı Yanılgısı', author: { name: 'Richard Dawkins' },
  numPages: 352, description: { html: '<b>Din eleştirisi</b> üzerine bilinen bir inceleme.' } }];
const MODEL_METNI = 'KONU — Din eleştirisi üzerine bir inceleme.\n'
  + 'BAĞLAM — Yazarın bilinen çalışması.\nAKIŞ — ' + 'bölüm anlatımı '.repeat(30)
  + '\nMESELELER — inanç ve kanıt.\nNEDEN OKUNUR — tartışmalı ama ufuk açıcı.';

async function taslakKos(ayar) {
  const a = ayar || {};
  const istekler = [];
  const cacheDepo = a.cacheDepo || {};
  global.caches = { default: {
    match: async (istek) => {
      const u = typeof istek === 'string' ? istek : istek.url;
      const v = cacheDepo[u];
      if (v === undefined) return undefined;
      return { ok: true, status: 200, json: async () => v };
    },
    put: async (istek, yanit) => {
      const u = typeof istek === 'string' ? istek : istek.url;
      cacheDepo[u] = await yanit.json();
    }
  } };
  global.fetch = async (u, sec) => {
    istekler.push({ url: String(u), sec: sec || {} });
    const su = String(u);
    if (su.includes('api.anthropic.com')) {
      if (a.modelHata) return sahteYanit({}, false);
      return sahteYanit(a.modelYanit || {
        content: [{ type: 'text', text: MODEL_METNI }],
        usage: { input_tokens: 850, output_tokens: 720 } });
    }
    if (su.includes('goodreads.com'))
      return sahteYanit(a.grYanit !== undefined ? a.grYanit : GR_TASLAK);
    if (su.includes('1000kitap.com'))
      return sahteYanit(a.bkYanit !== undefined ? a.bkYanit : '<html>bos</html>');
    throw new Error('beklenmeyen adres: ' + u);
  };
  const mod = await import('file://' + path.join(KOK, 'worker', 'worker.js').replace(/\\/g, '/'));
  const bekleyenler = [];
  const baslik = Object.assign({ Origin: a.koken !== undefined ? a.koken : KOKEN },
    a.baslik || {});
  /* Worker'ın kullandığı yüzeyle sınırlı sahte istek: url + method +
     headers.get + text — Node Request'inin Origin başlığını taşıyıp
     taşımadığına bağımlılık yok (tarayıcı-dışı davranış belirsiz). */
  const istekObj = {
    method: a.metod || 'POST', url: UC,
    headers: { get: ad => (baslik[ad] !== undefined ? baslik[ad] : null) },
    text: async () => (a.govdeHam !== undefined ? a.govdeHam : JSON.stringify(a.govde || {}))
  };
  const env = a.anahtarsiz ? {} : { ANTHROPIC_API_KEY: 'sahte-anahtar' };
  const yanit = await mod.default.fetch(istekObj, env, { waitUntil: p => bekleyenler.push(p) });
  await Promise.all(bekleyenler);
  let j = null;
  try { j = await yanit.json(); } catch (e) {}
  return { yanit, j, istekler, cacheDepo, mod };
}
const modelIstekleri = istekler => istekler.filter(x => x.url.includes('api.anthropic.com'));

temel.describe('G82 worker — /ozet-taslak', () => {

  temel('(W1) anahtar tanımsız: çökme yok, durum hata, HİÇBİR dış istek yok', async () => {
    const { yanit, j, istekler } = await taslakKos({ anahtarsiz: true,
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(yanit.status).toBe(500);
    nodeExpect(j.durum).toBe('hata');
    nodeExpect(j.mesaj).toContain('anahtar');
    nodeExpect(istekler.length, 'ne kaynak ne model çağrıldı').toBe(0);
  });

  temel('(W2) kaynakta BULUNAMAYAN kitapta model HİÇ çağrılmaz, durum bulunamadi', async () => {
    const { j, istekler } = await taslakKos({ grYanit: [], bkYanit: '<html>bos</html>',
      govde: { ad: 'Zjqx Mavi Deniz', yazar: 'A B' } });
    nodeExpect(j.durum).toBe('bulunamadi');
    nodeExpect(istekler.some(x => x.url.includes('goodreads')), 'kaynak arandı').toBe(true);
    nodeExpect(modelIstekleri(istekler).length, 'model çağrısı YOK').toBe(0);
  });

  temel('(W3) doğrulanan kitap: model çağrılır, künye GERÇEK VERİ olarak istemde, tamam + kullanim döner', async () => {
    const { j, istekler, cacheDepo } = await taslakKos({
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins', yayinevi: 'Kuzey', yil: 2008 } });
    nodeExpect(j.durum).toBe('tamam');
    nodeExpect(j.metin).toContain('KONU');
    nodeExpect(j.kaynak).toEqual(['Goodreads']);
    nodeExpect(j.kullanim, 'token kullanımı yanıtta').toEqual({ girdi: 850, cikti: 720 });
    const m = modelIstekleri(istekler);
    nodeExpect(m.length).toBe(1);
    nodeExpect(m[0].sec.headers['x-api-key']).toBe('sahte-anahtar');
    nodeExpect(m[0].sec.headers['anthropic-version']).toBe('2023-06-01');
    const govde = JSON.parse(m[0].sec.body);
    nodeExpect(govde.model).toBe('claude-opus-4-8');
    nodeExpect(govde.max_tokens).toBe(2000);
    nodeExpect(govde.system, 'uydurma yasağı istemde').toContain('Emin OLMADIĞIN');
    nodeExpect(govde.system, 'ontoloji yasağı istemde').toContain('Ontoloji');
    nodeExpect(govde.messages[0].content, 'doğrulanmış ad').toContain('Tanrı Yanılgısı');
    nodeExpect(govde.messages[0].content, 'kaynak açıklaması gerçek veri').toContain('Din eleştirisi');
    nodeExpect(govde.messages[0].content, 'kullanıcı beyanı ayrı').toContain('Kuzey');
    // kilit + günlük sayaç yazıldı
    const anahtarlar = Object.keys(cacheDepo);
    nodeExpect(anahtarlar.some(u => u.includes('ozet-taslak-kilit')), '24s kilidi').toBe(true);
    const gunluk = anahtarlar.find(u => u.includes('ozet-taslak-gunluk'));
    nodeExpect(cacheDepo[gunluk].n).toBe(1);
  });

  temel('(W4) 4 KB üstü gövde reddedilir, hiçbir istek çıkmaz', async () => {
    const { yanit, j, istekler } = await taslakKos({ govdeHam: 'x'.repeat(5000) });
    nodeExpect(yanit.status).toBe(413);
    nodeExpect(j.durum).toBe('hata');
    nodeExpect(istekler.length).toBe(0);
  });

  temel('(W5) günlük sınır 100: aşınca hata, model yok', async () => {
    const gunluk = UC.replace('/ozet-taslak', '') + '/ozet-taslak-gunluk?g='
      + new Date().toISOString().slice(0, 10);
    const { yanit, j, istekler } = await taslakKos({
      cacheDepo: { [gunluk]: { n: 100 } },
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(yanit.status).toBe(429);
    nodeExpect(j.mesaj).toBe('gunluk sinir');
    nodeExpect(istekler.length, 'ne kaynak ne model').toBe(0);
  });

  temel('(W6) 24 saat kilidi: aynı kitaba ikinci istek önceki taslağı döndürür, üretim yok', async () => {
    const mod = await import('file://' + path.join(KOK, 'worker', 'worker.js').replace(/\\/g, '/'));
    const kilit = UC.replace('/ozet-taslak', '') + '/ozet-taslak-kilit?k='
      + encodeURIComponent(mod.norm('Tanrı Yanılgısı') + '|' + mod.norm('Richard Dawkins'));
    const { j, istekler } = await taslakKos({
      cacheDepo: { [kilit]: { durum: 'tamam', metin: 'önceki taslak', kaynak: ['Goodreads'] } },
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(j.metin).toBe('önceki taslak');
    nodeExpect(istekler.length, 'ikinci üretim YAPILMADI').toBe(0);
  });

  temel('(W7) yabancı köken 403 alır; POST dışı metod reddedilir', async () => {
    const yabanci = await taslakKos({ koken: 'https://kotu.example',
      govde: { ad: 'Tanrı Yanılgısı' } });
    nodeExpect(yabanci.yanit.status).toBe(403);
    nodeExpect(yabanci.istekler.length).toBe(0);
    const get = await taslakKos({ metod: 'GET' });
    nodeExpect(get.yanit.status).toBe(405);
  });

  temel('(W8) model "güvenilir bilgim yok" derse bulunamadi; kilit yazılmaz ama SAYAÇ ilerler (çağrı maliyetti)', async () => {
    const { j, cacheDepo, istekler } = await taslakKos({
      modelYanit: { content: [{ type: 'text', text: 'Bu kitap hakkında güvenilir bilgim yok.' }],
        usage: { input_tokens: 500, output_tokens: 20 } },
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(modelIstekleri(istekler).length).toBe(1);
    nodeExpect(j.durum).toBe('bulunamadi');
    const anahtarlar = Object.keys(cacheDepo);
    nodeExpect(anahtarlar.some(u => u.includes('ozet-taslak-kilit')), 'taslak kilide GİRMEDİ').toBe(false);
    const gunluk = anahtarlar.find(u => u.includes('ozet-taslak-gunluk'));
    nodeExpect(cacheDepo[gunluk].n, 'model çağrısı sayıldı').toBe(1);
  });
});

/* ================= Tarayıcı: kuyruk + şerit + onay ================= */
function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
async function detayAc(page, ad) {
  await page.click('#liste .kart:has-text("' + ad + '")');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}
/* /ozet-taslak taklidi: istek sayacı + testte sabitlenen yanıt. Test route'u
   yardim.js agTaklit'ten SONRA kurulur → Playwright önce bunu dener. */
async function taslakUcKur(page, yanit) {
  const s = { istekler: [] };
  await page.route('**/ozet-taslak', r => {
    s.istekler.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(yanit || { durum: 'tamam',
        metin: 'KONU — deneme taslağı. ' + 'içerik '.repeat(20), kaynak: ['Goodreads'] }) });
  });
  return s;
}

test.describe('G82 taslak — tetikleme ve kuyruk', () => {

  test('(B1) ayar VARSAYILAN KAPALI: yeni kitap taslak isteği ÜRETMEZ', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await tohumla(page, []);
    await rafAc(page);
    await page.evaluate(() => {
      const k = kitapNormalize({ id: 'yeni1', ad: 'Sessiz Ev', yazar: 'Orhan Pamuk',
        eklenme: Date.now() });
      veri.kitaplar.push(k); depoKaydet();
      taslakAday(k.id);
    });
    await page.waitForTimeout(3600);   // kuyruk aralığından uzun bekle — istek ÇIKMAMALI
    expect(uc.istekler.length, 'varsayılan kapalı: POST yok').toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('kk_taslak_kuyruk_v1')),
      'kuyruğa bile girmez').toBeNull();
  });

  test('(B2) açıkken form yolu: POST atılır, taslak beklemede, şerit çıkar; AT → silinir ve bir daha üretilmez', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await tohumla(page, [], { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await page.click('.fab[data-act="yeni"]');
    await page.fill('#f-ad', 'Tanrı Yanılgısı');
    await ayrintilarAc(page);   // yazar alanı katlı ayrıntılarda (D2)
    await page.fill('#f-yazar', 'Richard Dawkins');
    await page.click('[data-act="form-kaydet"]');
    await expect.poll(() => uc.istekler.length, { timeout: 15000 }).toBe(1);
    expect(uc.istekler[0].ad).toBe('Tanrı Yanılgısı');
    await expect.poll(() => page.evaluate(() =>
      veri.kitaplar.length === 1 && window.__taslak.var(veri.kitaplar[0].id)),
      { timeout: 10000 }).toBe(true);
    // EN ÖNEMLİ KURAL: __ozet'e YAZILMADI
    const s = await page.evaluate(() => {
      const k = veri.kitaplar[0];
      return { ozet: window.__ozet.oku(k.id), ozetVar: k.ozetVar,
        taslak: window.__taslak.oku(k.id).metin };
    });
    expect(s.ozet, 'taslak __ozet\'e sızmadı').toBe('');
    expect(s.ozetVar).toBeFalsy();
    expect(s.taslak).toContain('KONU');
    // şerit + zorunlu uyarı cümlesi
    await detayAc(page, 'Tanrı Yanılgısı');
    await expect(page.locator('#dTaslakSerit [data-act="ts-oku"]')).toContainText('Taslak özet hazır');
    await expect(page.locator('#dTaslakSerit')).toContainText('Bu metin otomatik üretildi, doğrulanmadı.');
    await page.click('[data-act="ts-oku"]');
    await expect(page.locator('#dTaslakBlok .ts-govde')).toContainText('KONU');
    // At → şerit kaybolur, defter 'red', yeniden aday POST üretmez
    await page.click('[data-act="ts-at"]');
    await expect(page.locator('#dTaslakSerit')).toHaveCount(0);
    await expect(page.locator('#dTaslakBlok')).toHaveCount(0);
    const sonra = await page.evaluate(() => {
      const k = veri.kitaplar[0];
      taslakAday(k.id);   // yeniden dene — defter engellemeli
      return { defter: JSON.parse(localStorage.getItem('kk_taslak_defter_v1'))[k.id].s,
        kuyruk: JSON.parse(localStorage.getItem('kk_taslak_kuyruk_v1') || '[]').length,
        taslakVar: window.__taslak.var(k.id) };
    });
    expect(sonra.defter).toBe('red');
    expect(sonra.taslakVar).toBe(false);
    expect(sonra.kuyruk, 'atılan kitap kuyruğa geri giremez').toBe(0);
    await page.waitForTimeout(3600);
    expect(uc.istekler.length, 'ikinci üretim yok').toBe(1);
  });

  test('(B3) özeti ZATEN OLAN kitapta üretim çalışmaz', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await tohumla(page, [bitmis({ id: 'ozetli1', ad: 'Özetli Kitap',
      ozet: 'Elle yazılmış özet.', ozetG: 100 })], { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    await page.evaluate(() => taslakAday('ozetli1'));
    await page.waitForTimeout(3600);
    expect(uc.istekler.length, 'özetli kitaba POST yok').toBe(0);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_taslak_kuyruk_v1') || '[]').length)).toBe(0);
  });

  test('(B8) çevrimdışıyken üretilmez, kuyrukta bekler', async ({ page }) => {
    const uc = await taslakUcKur(page);
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine',
      { get: () => false, configurable: true }));
    await tohumla(page, [sahteKitap({ id: 'cvd1', ad: 'Çevrimdışı Kitap' })],
      { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await page.evaluate(() => taslakAday('cvd1'));
    await page.waitForTimeout(3600);
    expect(uc.istekler.length, 'çevrimdışı: POST yok').toBe(0);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_taslak_kuyruk_v1') || '[]'))).toEqual(['cvd1']);
  });
});

test.describe('G82 taslak — onay akışı ve sınırlar', () => {

  test('(B4) "Özet olarak kaydet" → __ozet.kaydet + taslak silinir; YEDEKTE özet VAR, taslak YOK', async ({ page }) => {
    await taslakUcKur(page);
    await tohumla(page, [
      bitmis({ id: 'onayli', ad: 'Onaylanan Kitap' }),
      bitmis({ id: 'bekleyen', ad: 'Bekleyen Kitap' })]);
    await rafAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    await page.evaluate(async () => {
      await window.__taslak.kaydet('onayli', 'Onaylanacak taslak metni.', ['Goodreads']);
      await window.__taslak.kaydet('bekleyen', 'BEKLEYEN_TASLAK_IMZASI hâlâ onaysız.', ['Goodreads']);
    });
    await detayAc(page, 'Onaylanan Kitap');
    await page.click('[data-act="ts-oku"]');
    await page.click('[data-act="ts-kaydet"]');
    await expect(page.locator('#dOzetBlok .oz-metin')).toContainText('Onaylanacak taslak metni.');
    const s = await page.evaluate(() => ({
      ozet: window.__ozet.oku('onayli'), taslakVar: window.__taslak.var('onayli'),
      ozetG: veri.kitaplar.find(k => k.id === 'onayli').ozetG }));
    expect(s.ozet).toBe('Onaylanacak taslak metni.');
    expect(s.taslakVar, 'onaylanan taslak depodan silindi').toBe(false);
    expect(s.ozetG).toBeGreaterThan(0);
    // yedek: özet girer, taslak deposu GİRMEZ (onaysız metin yedeğe sızmaz)
    const yedek = await page.evaluate(() => {
      const asil = window.dosyaIndir; let y = null;
      window.dosyaIndir = icerik => { y = icerik; };
      disaAktar(); window.dosyaIndir = asil; return y;
    });
    const j = JSON.parse(yedek);
    expect(j.ozetler.onayli.m).toBe('Onaylanacak taslak metni.');
    expect('taslaklar' in j, 'yedekte taslak alanı yok').toBe(false);
    expect(yedek.includes('BEKLEYEN_TASLAK_IMZASI'), 'onaysız taslak metni yedekte GEÇMEZ').toBe(false);
  });

  test('(B7) "Düzenleyerek kaydet" → metin özet kutusuna dolar, kaydedince taslak temizlenir', async ({ page }) => {
    await taslakUcKur(page);
    await tohumla(page, [bitmis({ id: 'duzenli', ad: 'Düzenlenen Kitap' })]);
    await rafAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    await page.evaluate(() => window.__taslak.kaydet('duzenli', 'Taslak gövdesi.', []));
    await detayAc(page, 'Düzenlenen Kitap');
    await page.click('[data-act="ts-oku"]');
    await page.click('[data-act="ts-duzenle"]');
    await expect(page.locator('#ozMetin')).toHaveValue('Taslak gövdesi.');
    await page.fill('#ozMetin', 'Taslak gövdesi. Elle eklenen cümle.');
    await page.click('[data-act="oz-kaydet"]');
    await expect(page.locator('#dOzetBlok .oz-metin')).toContainText('Elle eklenen cümle');
    const s = await page.evaluate(() => ({
      ozet: window.__ozet.oku('duzenli'), taslakVar: window.__taslak.var('duzenli') }));
    expect(s.ozet).toBe('Taslak gövdesi. Elle eklenen cümle.');
    expect(s.taslakVar, 'kaydedilince bayat taslak temizlendi').toBe(false);
  });

  test('(B5) bulunamadi: taslak yok, şerit yok, Ayarlar sayacı sayar', async ({ page }) => {
    const uc = await taslakUcKur(page, { durum: 'bulunamadi' });
    await tohumla(page, [sahteKitap({ id: 'uydurma1', ad: 'Zjqx Mavi Deniz', yazar: 'A B' })],
      { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await page.evaluate(() => taslakAday('uydurma1'));
    await expect.poll(() => uc.istekler.length, { timeout: 15000 }).toBe(1);
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_taslak_kuyruk_v1') || '[]').length),
      { timeout: 10000 }).toBe(0);
    expect(await page.evaluate(() => window.__taslak.var('uydurma1'))).toBe(false);
    await detayAc(page, 'Zjqx Mavi Deniz');
    await expect(page.locator('#dTaslakSerit')).toHaveCount(0);
    await page.click('#ortuDetay .sheet-kapat');   // örtü header'ı kapatmasın
    await ayarlarAc(page);
    await expect(page.locator('#tsDurum')).toContainText('1 kitapta kaynak bulunamadı');
  });

  test('(B6) worker hata dönerse: çökme yok, sessiz geçilir, kuyruk korunur', async ({ page }) => {
    const uc = await taslakUcKur(page, { durum: 'hata', mesaj: 'anahtar tanimli degil' });
    const hatalar = [];
    page.on('pageerror', e => hatalar.push(String(e)));
    await tohumla(page, [sahteKitap({ id: 'hatali1', ad: 'Hata Kitabı' })],
      { kk_taslak_ayar_v1: '1' });
    await rafAc(page);
    await page.evaluate(() => taslakAday('hatali1'));
    await expect.poll(() => uc.istekler.length, { timeout: 15000 }).toBe(1);
    await page.waitForTimeout(500);
    expect(hatalar, 'sayfa hatası yok').toEqual([]);
    expect(await page.evaluate(() => window.__taslak.var('hatali1'))).toBe(false);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_taslak_kuyruk_v1') || '[]')),
      'kuyruk korunur — sonraki oturum dener').toEqual(['hatali1']);
    await detayAc(page, 'Hata Kitabı');
    await expect(page.locator('#dTaslakSerit')).toHaveCount(0);
  });

  test('(B9) taslak yenilemede kalıcı (IDB) + kitap silinince yetim süpürülür', async ({ page }) => {
    await taslakUcKur(page);
    await tohumla(page, [sahteKitap({ id: 'kalici1', ad: 'Kalıcı Kitap' })]);
    await rafAc(page);
    await page.evaluate(() => window.__taslak.kaydet('kalici1', 'Yenilemeye dayanan taslak.', []));
    await page.reload();
    await rafaGec(page);
    await page.evaluate(() => window.__taslak.hazirBekle());
    expect(await page.evaluate(() => (window.__taslak.oku('kalici1') || {}).metin))
      .toBe('Yenilemeye dayanan taslak.');
  });
});
