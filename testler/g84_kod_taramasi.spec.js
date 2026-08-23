'use strict';
/* G84 — kod taraması düzeltmeleri (7 bulgu):
   B1 worker-bildirim korumasız JSON.parse → kvOku + 409 'kayit-bozuk' + 'vapid-jwk-bozuk'
   B2 boş catch'ler → _iz teşhis kanalı (varsayılan SESSİZ, yalnız window.__KK_IZ=true iken konuşur)
   B3 :focus-visible odak halkası (klavye çizer, fare çizmez)
   B4 sw.js cache.put artık .catch'li (statik)
   B5 storage.estimate reddi → depo satırı 'hesaplanamadı'
   B6 fikir.js yerel kacir() kaldırıldı → global esc()
   B7 worker'daki console.log gürültüsü silindi (statik)
   Worker testleri g51 yöntemiyle Node'da (sayfa yok); UI testleri Playwright. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateKeyPairSync } = require('crypto');
const { test, expect, tohumla, sahteKitap, rafAc } = require('./yardim');

const KOK = path.join(__dirname, '..');
const IZINLI = 'https://dessn7-bit.github.io';
const TEST_JWK = JSON.stringify(
  generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' }));

/* ---- g51 worker düzeneğinin eşi (g51 dışa aktarmıyor; g20/g82 deseni) ---- */
function sahteKV(baslangic) {
  const depo = new Map(Object.entries(baslangic || {}));
  return {
    depo,
    get: async k => (depo.has(k) ? depo.get(k) : null),
    put: async (k, v) => { depo.set(k, v); },
    delete: async k => { depo.delete(k); return true; },
    list: async (s) => ({
      keys: [...depo.keys()].filter(k => !s || !s.prefix || k.startsWith(s.prefix)).map(name => ({ name })),
      list_complete: true
    })
  };
}
async function workerYukle() {
  return (await import('file://' + path.join(KOK, 'worker-bildirim', 'worker.js').replace(/\\/g, '/'))).default;
}
function istekYap(yol, govde, ek) {
  const e = ek || {};
  return new Request('https://kitaplik-bildirim.dessn7.workers.dev' + yol, {
    method: e.method || (govde === undefined ? 'GET' : 'POST'),
    headers: { 'Origin': IZINLI, 'Content-Type': 'application/json', 'CF-Connecting-IP': e.ip || '10.9.9.1' },
    body: govde === undefined ? undefined : JSON.stringify(govde)
  });
}
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/g84-bozuk-kayit-abonesi';
const HASH = crypto.createHash('sha256').update(ENDPOINT).digest('hex');

test.describe('G84 worker dayanıklılık (B1/B7)', () => {

  test('B1: bozuk KV kaydı — /abone-durum 409 kayit-bozuk döner, kayıt SİLİNMEZ', async () => {
    const w = await workerYukle();
    const env = { KV: sahteKV({ ['abone:' + HASH]: 'BOZUK{json degil' }), VAPID_OZEL_JWK: TEST_JWK, VAPID_ACIK: 'TESTACIK' };
    const y = await w.fetch(istekYap('/abone-durum?endpoint=' + encodeURIComponent(ENDPOINT)), env);
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toBe('kayit-bozuk');
    /* karar: bozuk kayıt SİLİNMEZ (veri kaybı riski) */
    expect(env.KV.depo.has('abone:' + HASH)).toBe(true);
  });

  test('B1: bozuk KV kaydı — /abone-guncelle ve /test-push da 409, çökme yok', async () => {
    const w = await workerYukle();
    const env = { KV: sahteKV({ ['abone:' + HASH]: '{yarim' }), VAPID_OZEL_JWK: TEST_JWK, VAPID_ACIK: 'TESTACIK' };
    const g = await w.fetch(istekYap('/abone-guncelle', { endpoint: ENDPOINT, saat: 10 }), env);
    expect(g.status).toBe(409);
    expect((await g.json()).hata).toBe('kayit-bozuk');
    const t = await w.fetch(istekYap('/test-push', { endpoint: ENDPOINT }), env);
    expect(t.status).toBe(409);
    expect((await t.json()).hata).toBe('kayit-bozuk');
    expect(env.KV.depo.has('abone:' + HASH)).toBe(true);
  });

  test('B1: kayıt YOK ayrımı bozulmadı — durum kayitli:false, guncelle/test-push 404', async () => {
    const w = await workerYukle();
    const env = { KV: sahteKV(), VAPID_OZEL_JWK: TEST_JWK, VAPID_ACIK: 'TESTACIK' };
    const d = await w.fetch(istekYap('/abone-durum?endpoint=' + encodeURIComponent(ENDPOINT)), env);
    expect(d.status).toBe(200);
    expect((await d.json()).kayitli).toBe(false);
    expect((await w.fetch(istekYap('/abone-guncelle', { endpoint: ENDPOINT }), env)).status).toBe(404);
    expect((await w.fetch(istekYap('/test-push', { endpoint: ENDPOINT }), env)).status).toBe(404);
  });

  test('B1: VAPID_OZEL_JWK bozuk — /test-push çökmez, mesaj "vapid-jwk-bozuk", secret SIZMAZ', async () => {
    const w = await workerYukle();
    const BOZUK_SECRET = 'bozukJWKicerigi{{{';
    const kayit = JSON.stringify({ abonelik: { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } },
      saat: 9, dilim: 'UTC', vade: null });
    const env = { KV: sahteKV({ ['abone:' + HASH]: kayit }), VAPID_OZEL_JWK: BOZUK_SECRET, VAPID_ACIK: 'TESTACIK' };
    const y = await w.fetch(istekYap('/test-push', { endpoint: ENDPOINT }), env);
    expect(y.status).toBe(200);            // uç çökmedi; sonuç gövdede raporlanır
    const govde = await y.json();
    expect(govde.sonuc).toBe('hata');
    expect(govde.istisna).toBe('vapid-jwk-bozuk');
    /* anahtarın KENDİSİ hiçbir alanda geçmez */
    expect(JSON.stringify(govde)).not.toContain(BOZUK_SECRET);
  });

  test('B7: "push beklenmedik durum" console.log kaynaklarda yok (statik)', async () => {
    const kaynak = fs.readFileSync(path.join(KOK, 'worker-bildirim', 'worker.js'), 'utf8');
    expect(kaynak).not.toContain('push beklenmedik durum');
  });
});

test.describe('G84 statik kilitler (B3/B4/B6)', () => {

  test('B4: sw.js cache.put artık .catch\'li (yakalanmamış promise reddi kalmadı)', async () => {
    const sw = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');
    expect(sw).toMatch(/c\.put\(e\.request, copy\)\)\.catch\(/);
  });

  test('B6: fikir.js\'te yerel kacir tanımı/çağrısı YOK, esc() kullanılıyor; esc çekirdekte fikir.js\'ten ÖNCE', async () => {
    const fikir = fs.readFileSync(path.join(KOK, 'fikir.js'), 'utf8');
    expect(fikir).not.toMatch(/function kacir|kacir\(/);
    expect(fikir).toMatch(/esc\(/);
    const html = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
    /* global esc tanımı, fikir.js script etiketinden önce gelmeli (yükleme sırası) */
    expect(html.indexOf('function esc(')).toBeGreaterThan(-1);
    expect(html.indexOf('function esc(')).toBeLessThan(html.indexOf('fikir.js"'));
  });

  test('B3: index.html :focus-visible kuralı + B2 _iz kanalı tanımlı (statik)', async () => {
    const html = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
    expect(html).toContain(':focus-visible{outline:2px solid var(--brass)');
    expect(html).toContain('function _iz(yer, e)');
  });
});

test.describe('G84 sayfa davranışları (B2/B3/B5/B6)', () => {

  test('B2: __KK_IZ tanımsızken konsol SESSİZ; true iken yutulmuş yazma hatası iz bırakır', async ({ page }) => {
    await tohumla(page, []);
    const mesajlar = [];
    page.on('console', m => mesajlar.push(m.text()));
    await page.goto('/');
    /* localStorage yazımını bilerek düşür (kota taklidi) */
    await page.evaluate(() => {
      window.__setItemGeri = Storage.prototype.setItem;
      Storage.prototype.setItem = function(){ throw new Error('kota-taklidi'); };
    });
    await page.evaluate(() => window.temaYaz('karanlik'));
    expect(mesajlar.filter(t => t.indexOf('[kk]') !== -1)).toEqual([]);   // varsayılan: sessiz
    await page.evaluate(() => { window.__KK_IZ = true; window.temaYaz('acik'); });
    await expect.poll(() =>
      mesajlar.filter(t => t.indexOf('[kk]') !== -1 && t.indexOf('temaYaz') !== -1).length
    ).toBeGreaterThan(0);
    await page.evaluate(() => { Storage.prototype.setItem = window.__setItemGeri; window.__KK_IZ = undefined; });
  });

  test('B3: klavye Tab odak halkası çizer (açık + karanlık tema), fare tıklaması çizmez', async ({ page }) => {
    await tohumla(page, []);
    await page.goto('/');
    await page.keyboard.press('Tab');
    const klavye = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { stil: s.outlineStyle, genislik: parseFloat(s.outlineWidth) || 0 };
    });
    expect(klavye.stil).not.toBe('none');
    expect(klavye.genislik).toBeGreaterThan(0);
    /* karanlık temada da görünür (--brass her iki temada tanımlı) */
    await page.evaluate(() => window.temaYaz('karanlik'));
    await page.keyboard.press('Tab');
    const koyu = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { stil: s.outlineStyle, renk: s.outlineColor };
    });
    expect(koyu.stil).not.toBe('none');
    expect(koyu.renk).not.toBe('rgba(0, 0, 0, 0)');
    await page.evaluate(() => window.temaYaz('sistem'));
    /* fare: gerçek tıklama odağı halka çizmemeli (reset :focus:not(:focus-visible)) */
    await page.click('nav [data-act="sekme"][data-v="raf"]');
    const fare = await page.evaluate(() => {
      const a = document.activeElement;
      return (a === document.body) ? 'none' : getComputedStyle(a).outlineStyle;
    });
    expect(fare).toBe('none');
  });

  test('B5: storage.estimate reddedilirse depo satırı çökmez, "hesaplanamadı" yazar', async ({ page }) => {
    await tohumla(page, []);
    await page.goto('/');
    await page.evaluate(() => {
      navigator.storage.estimate = () => Promise.reject(new Error('taklit-ret'));
      window.ozDepoBilgiTazele();
    });
    await expect(page.locator('#ozDepoBilgi')).toContainText('hesaplanamadı');
  });

  test('B6: fikir etiketi HTML içerse de düz metin görünür (esc yolu çalışıyor)', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Kaçış Kitabı', notlar: [{ id: 'n84x1',
      tip: 'alinti', metin: 'Deneme alıntısı.', tarih: '2026-08-01', sayfa: null, fikir: [] }] })]);
    await rafAc(page);
    await page.click('[data-act="sekme"][data-v="alinti"]');
    await expect(page.locator('#alintiIcerik .fikir-giris')).toHaveCount(1);
    await page.fill('#alintiIcerik .fikir-giris', '<b>test</b>');
    await page.click('[data-act="fikir-ekle"]');
    await expect.poll(() => page.evaluate(() => veri.kitaplar[0].notlar[0].fikir)).toEqual(['<b>test</b>']);
    /* çip metin olarak "<b>test</b>" gösterir; gerçek <b> öğesi OLUŞMAZ */
    await expect(page.locator('#fikirBulut')).toContainText('<b>test</b>');
    expect(await page.locator('#fikirBulut b').count()).toBe(0);
    expect(await page.locator('#alintiIcerik b').count()).toBe(0);
  });
});
