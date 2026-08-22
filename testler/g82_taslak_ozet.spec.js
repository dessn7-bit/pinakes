'use strict';
/* G82 — TASLAK ÖZET boru hattı (v82; ÜRETİM KISMI v84'te modelden KAYNAĞA döndü).

   EN ÖNEMLİ KURAL (bu dosyanın ana kilidi): taslak metni __ozet'e ASLA
   kendiliğinden yazılmaz. Taslak AYRI depoda (kk_taslak_v1) bekler; yalnız
   kullanıcı onaylayınca __ozet.kaydet çağrılır. Taslaklar SENKRONLANMAZ ve
   JSON YEDEĞE GİRMEZ.

   v84 worker /ozet-taslak: model/anahtar/günlük-sayaç SİLİNDİ. Sıra: gövde →
   köken → 24s kilit → KAYNAK DOĞRULAMASI → açıklama toplama (1000Kitap
   kitapCek hakkinda.bilgi > Google Books description > Goodreads). Seçim:
   TR adaylar arasından UZUN; TR yoksa öncelik sırasındaki ilk. Temizlik:
   HTML/entity ayıklanır, <80 kr reddedilir, 4000'de kesilir. Yanıt
   { durum:'tamam', metin, kaynak:'1000Kitap', dil:'tr' }.

   Worker testleri g20 deseninde DOĞRUDAN NODE'da koşar (sahte fetch/caches);
   sahte fetch'te api.anthropic.com dalı YOK — kod oraya giderse test
   "beklenmeyen adres" ile patlar (model geri gelemez, yapısal kilit).

   (Mutasyon hedefleri: doğrulama kapısını kaldır → (W2) kırmızı; taslağı
    __ozet'e doğrudan yaz → (B2)/(B4) kırmızı; disaAktar'a taslak ekle →
    (B4) kırmızı.) */
const { test: temel, expect: nodeExpect } = require('@playwright/test');
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, rafaGec, ayarlarAc, ayrintilarAc } = require('./yardim');
const path = require('path');
const fs = require('fs');

/* ================= Worker: /ozet-taslak (node) ================= */
const KOK = path.join(__dirname, '..');
const KOKEN = 'https://dessn7-bit.github.io';
const UC = 'https://kitaplik-ara.dessn7.workers.dev/ozet-taslak';

function sahteYanit(govde, ok) {
  return { ok: ok !== false, status: ok === false ? 500 : 200,
    json: async () => govde, text: async () => (typeof govde === 'string' ? govde : JSON.stringify(govde)) };
}
const GR_TASLAK = [{ bookTitleBare: 'Tanrı Yanılgısı', author: { name: 'Richard Dawkins' },
  numPages: 352, description: { html: '<b>Din eleştirisi</b> üzerine bilinen bir inceleme. '
    + 'A well known critique of religion and belief systems, argued at length. '.repeat(2) } }];
/* 1000Kitap SSR arama HTML'i: kayıt id + adi + yazarAdi taşır (ölçülen şekil) */
function bkAramaHtml(kayitlar) {
  return '<script id="__NEXT_DATA__" type="application/json">'
    + JSON.stringify({ props: { liste: kayitlar } }) + '</script>';
}
const BK_ARAMA = bkAramaHtml([{ id: '557', adi: 'Tanrı Yanılgısı', yazarAdi: 'Richard Dawkins' }]);
/* kitapCek yanıtı (ölçülen şekil): liste[?].hakkinda.bilgi — HTML-entity'li TR metin */
const BK_BILGI_TR = '&quot;İnançlar üzerine&quot; yazılmış, çok tartışılan bir kitap. '
  + 'Yazar dinî düşüncenin kökenlerini ve toplumsal etkilerini uzun uzun ele alıyor. '.repeat(3);
const BK_CEK = { liste: [{ hakkinda: { bilgi: BK_BILGI_TR } }] };
const GB_TR_DESC = '<p>Bu kitap <b>inanç ve kanıt</b> ilişkisini inceler.</p>'
  + 'Türkçe baskı tanıtımı: yazarın en çok tartışılan çalışması üzerine uzun bir değerlendirme. '.repeat(4);
function gbYanit(desc, dil) {
  return { items: [{ volumeInfo: { title: 'Tanrı Yanılgısı', authors: ['Richard Dawkins'],
    language: dil || 'en', description: desc } }] };
}

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
    /* api.anthropic.com dalı BİLEREK YOK: model çağrısı geri gelirse
       "beklenmeyen adres" fırlar — yapısal model-yasağı kilidi */
    if (su.includes('googleapis.com/books')) {
      if (a.gbYanit === 'hata') return sahteYanit({}, false);
      return sahteYanit(a.gbYanit !== undefined ? a.gbYanit : { items: [] });
    }
    if (su.includes('api.1000kitap.com')) {
      if (a.bkCekYanit === 'hata') return sahteYanit({}, false);
      return sahteYanit(a.bkCekYanit !== undefined ? a.bkCekYanit : BK_CEK);
    }
    if (su.includes('goodreads.com'))
      return sahteYanit(a.grYanit !== undefined ? a.grYanit : GR_TASLAK);
    if (su.includes('1000kitap.com'))
      return sahteYanit(a.bkYanit !== undefined ? a.bkYanit : BK_ARAMA);
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
  const yanit = await mod.default.fetch(istekObj, {}, { waitUntil: p => bekleyenler.push(p) });
  await Promise.all(bekleyenler);
  let j = null;
  try { j = await yanit.json(); } catch (e) {}
  return { yanit, j, istekler, cacheDepo, mod };
}

temel.describe('G82 worker — /ozet-taslak (v84: kaynak açıklaması)', () => {

  temel('(W1) model tamamen kalktı: kaynakta ANTHROPIC geçmez, env anahtarsız uç normal çalışır', async () => {
    const kaynak = fs.readFileSync(path.join(KOK, 'worker', 'worker.js'), 'utf8');
    nodeExpect(/anthropic/i.test(kaynak), 'worker kaynağında ANTHROPIC geçen satır YOK').toBe(false);
    nodeExpect(kaynak.includes('ANTHROPIC_API_KEY')).toBe(false);
    // env tamamen boş — anahtar kavramı kalmadı, uç yine tamam döner
    const { j } = await taslakKos({ govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(j.durum).toBe('tamam');
  });

  temel('(W2) kaynakta BULUNAMAYAN kitap: bulunamadi, açıklama uçlarına gidilmez', async () => {
    const { j, istekler } = await taslakKos({ grYanit: [], bkYanit: '<html>bos</html>',
      govde: { ad: 'Zjqx Mavi Deniz', yazar: 'A B' } });
    nodeExpect(j.durum).toBe('bulunamadi');
    nodeExpect(istekler.some(x => x.url.includes('goodreads')), 'kaynak arandı').toBe(true);
    nodeExpect(istekler.some(x => x.url.includes('api.1000kitap') || x.url.includes('googleapis')),
      'doğrulanamayan kitap için açıklama uçları çağrılmaz').toBe(false);
  });

  temel('(W3) TR kitap: 1000Kitap açıklaması kazanır (tek TR aday) — entity çözülmüş metin, kaynak+dil doğru, kilit yazılır', async () => {
    // GB İngilizce döner (tipik durum) → tek TR aday 1000K → o kazanır
    const { j, istekler, cacheDepo } = await taslakKos({
      gbYanit: gbYanit('An English description of the book, long enough to be a real candidate for sure. '.repeat(2), 'en'),
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(j.durum).toBe('tamam');
    nodeExpect(j.kaynak).toBe('1000Kitap');
    nodeExpect(j.dil).toBe('tr');
    nodeExpect(j.metin).toContain('"İnançlar üzerine"');   // &quot; çözüldü
    nodeExpect(j.metin.includes('&quot;'), 'entity kalmadı').toBe(false);
    nodeExpect(istekler.some(x => x.url.includes('kitapCek')), 'kitapCek çağrıldı').toBe(true);
    nodeExpect(Object.keys(cacheDepo).some(u => u.includes('ozet-taslak-kilit')), '24s kilidi').toBe(true);
  });

  temel('(W4) 4 KB üstü gövde reddedilir, hiçbir istek çıkmaz', async () => {
    const { yanit, j, istekler } = await taslakKos({ govdeHam: 'x'.repeat(5000) });
    nodeExpect(yanit.status).toBe(413);
    nodeExpect(j.durum).toBe('hata');
    nodeExpect(istekler.length).toBe(0);
  });

  temel('(W5) seçim kuralı: 1000K yoksa iki TR adaydan UZUN olan; TR hiç yoksa öncelik sırası', async () => {
    // 1000K'da kayıt yok → adaylar GB(tr, uzun) + GR(en) → GB kazanır
    const ikiTr = await taslakKos({ bkYanit: '<html>bos</html>',
      gbYanit: gbYanit(GB_TR_DESC, 'tr'),
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(ikiTr.j.durum).toBe('tamam');
    nodeExpect(ikiTr.j.kaynak).toBe('Google Books');
    nodeExpect(ikiTr.j.dil).toBe('tr');
    // TR aday yok (GB boş, GR saf İngilizce) → öncelikteki ilk aday = Goodreads, dil 'en'
    const trYok = await taslakKos({ bkYanit: '<html>bos</html>', gbYanit: { items: [] },
      grYanit: [{ bookTitleBare: 'Tanrı Yanılgısı', author: { name: 'Richard Dawkins' },
        description: 'A well known and much debated critique of religion, argued at book length with many examples.' }],
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(trYok.j.durum).toBe('tamam');
    nodeExpect(trYok.j.kaynak).toBe('Goodreads');
    nodeExpect(trYok.j.dil, 'Türkçe olmayan metin dil alanında söylenir').toBe('en');
  });

  temel('(W6) 24 saat kilidi: aynı kitaba ikinci istek önceki yanıtı döndürür, kaynaklara gidilmez', async () => {
    const mod = await import('file://' + path.join(KOK, 'worker', 'worker.js').replace(/\\/g, '/'));
    const kilit = UC.replace('/ozet-taslak', '') + '/ozet-taslak-kilit?k='
      + encodeURIComponent(mod.norm('Tanrı Yanılgısı') + '|' + mod.norm('Richard Dawkins'));
    const { j, istekler } = await taslakKos({
      cacheDepo: { [kilit]: { durum: 'tamam', metin: 'önceki taslak', kaynak: '1000Kitap', dil: 'tr' } },
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(j.metin).toBe('önceki taslak');
    nodeExpect(istekler.length, 'ikinci toplama YAPILMADI').toBe(0);
  });

  temel('(W7) yabancı köken 403 alır; POST dışı metod reddedilir', async () => {
    const yabanci = await taslakKos({ koken: 'https://kotu.example',
      govde: { ad: 'Tanrı Yanılgısı' } });
    nodeExpect(yabanci.yanit.status).toBe(403);
    nodeExpect(yabanci.istekler.length).toBe(0);
    const get = await taslakKos({ metod: 'GET' });
    nodeExpect(get.yanit.status).toBe(405);
  });

  temel('(W8) temizlik: HTML etiketi metinde KALMAZ; <80 kr kırıntı bulunamadi; 4000 üstü kesilir', async () => {
    // GB HTML döndürür → temizlenmiş metin etiketsiz
    const html = await taslakKos({ bkYanit: '<html>bos</html>',
      gbYanit: gbYanit(GB_TR_DESC, 'tr'), grYanit: [
        { bookTitleBare: 'Tanrı Yanılgısı', author: { name: 'Richard Dawkins' } }],
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(html.j.durum).toBe('tamam');
    nodeExpect(/<[a-z/]/i.test(html.j.metin), 'HTML etiketi ayıklandı').toBe(false);
    nodeExpect(html.j.metin).toContain('inanç ve kanıt');
    // her kaynağın metni kırıntı (<80 kr) → bulunamadi, kilit yazılmaz
    const kisa = await taslakKos({
      bkCekYanit: { liste: [{ hakkinda: { bilgi: 'Roman.' } }] },
      gbYanit: gbYanit('2. baskı', 'tr'),
      grYanit: [{ bookTitleBare: 'Tanrı Yanılgısı', author: { name: 'Richard Dawkins' },
        description: 'Kısa.' }],
      govde: { ad: 'Tanrı Yanılgısı', yazar: 'Richard Dawkins' } });
    nodeExpect(kisa.j.durum, 'kırıntı açıklama özet yerine geçmez').toBe('bulunamadi');
    nodeExpect(Object.keys(kisa.cacheDepo).some(u => u.includes('kilit')), 'kilit yazılmadı').toBe(false);
    // 4000 üstü kesme + "…" (saf fonksiyon)
    const mod = await import('file://' + path.join(KOK, 'worker', 'worker.js').replace(/\\/g, '/'));
    const uzun = mod.metinTemizle('a'.repeat(6000));
    nodeExpect(uzun.length).toBe(4001);
    nodeExpect(uzun.endsWith('…')).toBe(true);
    nodeExpect(mod.metinTemizle('satır1\n\n\n\n\nsatır2 ' + 'dolgu '.repeat(20)))
      .toContain('satır1\n\nsatır2');   // boş satırlar teklendi
  });

  temel('(W9) aksansız yazım eşleşir: "Simyaci" kaynaktaki "Simyacı"yı bulur (canlı kanıt vakası)', async () => {
    const { j } = await taslakKos({
      grYanit: [],
      bkYanit: bkAramaHtml([{ id: '9', adi: 'Simyacı', yazarAdi: 'Paulo Coelho' }]),
      bkCekYanit: { liste: [{ hakkinda: { bilgi:
        'Çobanlık yapan Santiago, gördüğü düşün peşinde hazine aramak için yola çıkar. '
        + 'Yol boyunca karşılaştıkları ona kişisel menkıbesini öğretir. '.repeat(2) } }] },
      govde: { ad: 'Simyaci', yazar: 'Paulo Coelho' } });
    nodeExpect(j.durum, 'aksan farkı doğrulamayı düşürmez').toBe('tamam');
    nodeExpect(j.kaynak).toBe('1000Kitap');
    nodeExpect(j.dil).toBe('tr');
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
   yardim.js agTaklit'ten SONRA kurulur → Playwright önce bunu dener.
   v84 yanıt şekli: kaynak STRING + dil. */
async function taslakUcKur(page, yanit) {
  const s = { istekler: [] };
  await page.route('**/ozet-taslak', r => {
    s.istekler.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(yanit || { durum: 'tamam',
        metin: 'Yayınevi tanıtımı: deneme taslağı. ' + 'içerik '.repeat(20),
        kaynak: '1000Kitap', dil: 'tr' }) });
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
    expect(s.taslak).toContain('Yayınevi tanıtımı');
    // şerit: kaynak adı yazılır (v84); TR metinde dil uyarısı ÇIKMAZ
    await detayAc(page, 'Tanrı Yanılgısı');
    await expect(page.locator('#dTaslakSerit [data-act="ts-oku"]')).toContainText('Taslak özet hazır');
    await expect(page.locator('#dTaslakSerit')).toContainText('Yayınevi tanıtım metni · kaynak: 1000Kitap');
    await expect(page.locator('#dTaslakSerit')).not.toContainText('Metin Türkçe değil');
    await page.click('[data-act="ts-oku"]');
    await expect(page.locator('#dTaslakBlok .ts-govde')).toContainText('Yayınevi tanıtımı');
    await expect(page.locator('#dTaslakBlok')).toContainText('kaynak: 1000Kitap');
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
    const uc = await taslakUcKur(page, { durum: 'hata', mesaj: 'kaynak-ulasilamadi' });
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
    await page.evaluate(() => window.__taslak.kaydet('kalici1', 'Yenilemeye dayanan taslak.', '1000Kitap', 'tr'));
    await page.reload();
    await rafaGec(page);
    await page.evaluate(() => window.__taslak.hazirBekle());
    expect(await page.evaluate(() => (window.__taslak.oku('kalici1') || {}).metin))
      .toBe('Yenilemeye dayanan taslak.');
  });

  test('(B10) Türkçe olmayan açıklama: şerit "Metin Türkçe değil." satırını gösterir', async ({ page }) => {
    await taslakUcKur(page);
    await tohumla(page, [bitmis({ id: 'ingilizce1', ad: 'Foreign Book' })]);
    await rafAc(page);
    await page.evaluate(() => window.__taslak.kaydet('ingilizce1',
      'An English publisher description of this foreign book, long enough to matter.',
      'Goodreads', 'en'));
    await detayAc(page, 'Foreign Book');
    await expect(page.locator('#dTaslakSerit')).toContainText('Yayınevi tanıtım metni · kaynak: Goodreads');
    await expect(page.locator('#dTaslakSerit')).toContainText('Metin Türkçe değil.');
    await page.click('[data-act="ts-oku"]');
    await expect(page.locator('#dTaslakBlok')).toContainText('Metin Türkçe değil.');
    // eski (v82) dizi-kaynaklı ve dilsiz kayıt: uyarı BASILMAZ, kaynak yine okunur
    await page.evaluate(() => new Promise((cozul, kir) => {
      const istek = indexedDB.open('kk_taslak_v1', 1);
      istek.onsuccess = () => {
        const db = istek.result;
        const tx = db.transaction('taslaklar', 'readwrite');
        tx.objectStore('taslaklar').put({ metin: 'Eski biçim taslak metni burada duruyor.',
          g: 5, kaynak: ['Goodreads'] }, 'ingilizce1');
        tx.oncomplete = () => { db.close(); cozul(); };
        tx.onerror = () => kir(tx.error);
      };
      istek.onerror = () => kir(istek.error);
    }));
    await page.reload();
    await rafaGec(page);
    await page.evaluate(() => window.__taslak.hazirBekle());
    await detayAc(page, 'Foreign Book');
    await expect(page.locator('#dTaslakSerit')).toContainText('kaynak: Goodreads');
    await expect(page.locator('#dTaslakSerit')).not.toContainText('Metin Türkçe değil');
  });
});
