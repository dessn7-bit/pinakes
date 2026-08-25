'use strict';
/* G51 — Hatırlatma (push bildirimi): bildirim.js + sw.js push/notificationclick
   + worker-bildirim/worker.js.
   Sözleşmeler:
   - GİZLİLİK: alıntı METNİ sunucuya gitmez; sunucuya giden tek veri abonelik
     + saat + dilim + vade günü. Push PAYLOAD'SIZ; metni SW, IndexedDB
     özetinden üretir. Özet SAYI değil VADE listesi taşır (gece devri).
   - bugunSayi=0 kararı: ana kapı SUNUCUDA (vade gelmemişse hiç gönderilmez);
     SW'de savunma = SESSİZLİK (yanlış bildirim güveni yakar).
   - Günde en fazla 1 bildirim (KV gonderim işareti, TTL 2 gün).
   - 404/410 → abonelik KV'den silinir; 429 → işaret yazılmaz, sonraki saat.
   - CORS yalnız https://dessn7-bit.github.io; hız sınırı; geçersiz gövde 4xx.
   Worker/SW testleri g20 yöntemiyle Node'da (sayfa yok); UI testleri Playwright.
   (Mutasyon 1: SW push'ta özet okuma kaldırılır → "vadeler sayılır" vakası
    kırmızı. Mutasyon 2: worker'da 404/410 silme kaldırılır → "ölü abonelik
    silinir" vakası kırmızı.) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { generateKeyPairSync } = require('crypto');
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc, bugunISO } = require('./yardim');

const KOK = path.join(__dirname, '..');
const SW_KAYNAK = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');
const IZINLI = 'https://dessn7-bit.github.io';
const TEST_JWK = JSON.stringify(
  generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' }));

/* ================= worker yardımcıları ================= */
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
function ortamKur(kv) {
  return { KV: kv || sahteKV(), VAPID_OZEL_JWK: TEST_JWK, VAPID_ACIK: 'TESTACIK' };
}
function istekYap(yol, govde, ek) {
  const e = ek || {};
  return new Request('https://kitaplik-bildirim.dessn7.workers.dev' + yol, {
    method: e.method || (govde === undefined ? 'GET' : 'POST'),
    headers: Object.assign({
      'Origin': e.koken === undefined ? IZINLI : e.koken,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': e.ip || '10.0.0.1'
    }, e.basliklar || {}),
    body: govde === undefined ? undefined : (typeof govde === 'string' ? govde : JSON.stringify(govde))
  });
}
const ABONELIK = { endpoint: 'https://fcm.googleapis.com/fcm/send/ornek-abonelik-123',
  keys: { p256dh: 'p256ORNEK', auth: 'authORNEK' } };
function gecerliGovde(ek) {
  return Object.assign({ abonelik: ABONELIK, saat: 9, dilim: 'UTC', vade: '2026-08-11' }, ek || {});
}
/* sahte push servisi: global fetch'i yakalar */
function pushServisi(kod) {
  const istekler = [];
  global.fetch = async (url, secenek) => {
    istekler.push({ url: String(url), secenek: secenek || {} });
    return { status: typeof kod === 'function' ? kod(istekler.length) : (kod || 201) };
  };
  return istekler;
}

test.describe('G51 worker uçları', () => {

  test('abone: geçerli gövde 200 + KV kaydı hash anahtarıyla; metin alanı YOK', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    const y = await w.fetch(istekYap('/abone', gecerliGovde()), env);
    expect(y.status).toBe(200);
    const anahtarlar = [...env.KV.depo.keys()].filter(k => k.startsWith('abone:'));
    expect(anahtarlar.length).toBe(1);
    expect(anahtarlar[0].length).toBe('abone:'.length + 64);   // sha-256 hex — endpoint anahtarda görünmez
    const kayit = JSON.parse(env.KV.depo.get(anahtarlar[0]));
    expect(kayit.saat).toBe(9);
    expect(kayit.dilim).toBe('UTC');
    expect(kayit.vade).toBe('2026-08-11');
    expect(kayit.abonelik.endpoint).toBe(ABONELIK.endpoint);
    /* GİZLİLİK: kayıtta YALNIZ beklenen alanlar. v63'te dört, v88'de sekiz
       tetik alanı eklendi — hepsi GÜN/BAYRAK; metin taşıyabilecek alan yok.
       Küme TAM sınanıyor ki kazara bir alan sızarsa vaka kırmızıya dönsün.
       (v88 bilinçli güncelleme: yeni alanlar kümeye eklendi.) */
    expect(Object.keys(kayit).sort()).toEqual(['abonelik', 'bagVar', 'ciltVar',
      'dilim', 'gecenYilGun', 'gunlukVar', 'hedefGeride', 'hedefGun',
      'okumaSonGun', 'olusturma', 'oneriGun', 'oneriVar', 'parcaVar', 'saat',
      'tempoGeride', 'vade', 'yarimSonGun']);
  });

  test('abone: geçersiz gövdeler 4xx (bozuk json, eksik anahtar, saat, dilim, vade)', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    expect((await w.fetch(istekYap('/abone', 'bozuk{json'), env)).status).toBe(400);
    expect((await w.fetch(istekYap('/abone', gecerliGovde({ abonelik: { endpoint: 'http://duz-http' } })), env)).status).toBe(400);
    expect((await w.fetch(istekYap('/abone', gecerliGovde({ saat: 25 })), env)).status).toBe(400);
    expect((await w.fetch(istekYap('/abone', gecerliGovde({ dilim: 'Boyle/Dilim_Yok' })), env)).status).toBe(400);
    expect((await w.fetch(istekYap('/abone', gecerliGovde({ vade: '11.08.2026' })), env)).status).toBe(400);
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('abone:'))).toEqual([]);
  });

  test('CORS: yabancı kökenden red (403), izinli köken başlıkta, OPTIONS 204', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    const yabanci = await w.fetch(istekYap('/abone', gecerliGovde(), { koken: 'https://kotu.site' }), env);
    expect(yabanci.status).toBe(403);
    const on = await w.fetch(istekYap('/abone', undefined, { method: 'OPTIONS' }), env);
    expect(on.status).toBe(204);
    expect(on.headers.get('Access-Control-Allow-Origin')).toBe(IZINLI);
    const dogru = await w.fetch(istekYap('/abone', gecerliGovde()), env);
    expect(dogru.headers.get('Access-Control-Allow-Origin')).toBe(IZINLI);
  });

  test('hız sınırı: aynı IP saatte 30 POST sonrası 429', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    let son = null;
    for (let i = 0; i < 31; i++) {
      son = await w.fetch(istekYap('/abone-sil', { endpoint: ABONELIK.endpoint }, { ip: '7.7.7.7' }), env);
    }
    expect(son.status).toBe(429);
    // farklı IP etkilenmez
    expect((await w.fetch(istekYap('/abone-sil', { endpoint: ABONELIK.endpoint }, { ip: '8.8.8.8' }), env)).status).toBe(200);
  });

  test('abone-durum / abone-guncelle / abone-sil akışı', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    const durumUrl = '/abone-durum?endpoint=' + encodeURIComponent(ABONELIK.endpoint);
    let d = await (await w.fetch(istekYap(durumUrl), env)).json();
    /* v62: Ayarlar'ın görünür durumu için olusturma + sonGonderim EKLENDİ.
       Anahtar kümesi yine TAM sınanır — kazara alan sızması yakalansın
       (abonelik nesnesi, endpoint, anahtarlar buraya ASLA girmemeli). */
    expect(Object.keys(d).sort()).toEqual(['dilim', 'kayitli', 'olusturma', 'saat', 'sonGonderim', 'vade']);
    expect(d.kayitli).toBe(true);
    expect(d.saat).toBe(9);
    expect(d.dilim).toBe('UTC');
    expect(d.vade).toBe('2026-08-11');
    expect(typeof d.olusturma).toBe('string');
    expect(d.sonGonderim).toBe(null);       // henüz gönderim yok
    expect((await w.fetch(istekYap('/abone-guncelle', { endpoint: ABONELIK.endpoint, vade: '2026-09-01', saat: 21 }), env)).status).toBe(200);
    d = await (await w.fetch(istekYap(durumUrl), env)).json();
    expect(d.vade).toBe('2026-09-01');
    expect(d.saat).toBe(21);
    expect((await w.fetch(istekYap('/abone-guncelle', { endpoint: 'https://olmayan.example/x' }), env)).status).toBe(404);
    expect((await w.fetch(istekYap('/abone-sil', { endpoint: ABONELIK.endpoint }), env)).status).toBe(200);
    d = await (await w.fetch(istekYap(durumUrl), env)).json();
    expect(d).toEqual({ kayitli: false });
  });

  test('cron: saati gelen + vadesi geçen aboneye PAYLOAD\'SIZ VAPID push; işaret yazılır', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);   // saat 9 UTC, vade dün
    const istekler = pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    expect(istekler.length).toBe(1);
    expect(istekler[0].url).toBe(ABONELIK.endpoint);
    expect(istekler[0].secenek.method).toBe('POST');
    expect(istekler[0].secenek.body).toBeUndefined();          // payload'sız — metin taşınmaz
    const yetki = istekler[0].secenek.headers.Authorization;
    expect(yetki.startsWith('vapid t=')).toBe(true);
    expect(yetki).toContain('k=TESTACIK');
    const jwt = yetki.slice('vapid t='.length).split(',')[0].split('.');
    expect(jwt.length).toBe(3);
    const govde = JSON.parse(Buffer.from(jwt[1], 'base64url').toString());
    expect(govde.aud).toBe('https://fcm.googleapis.com');
    expect(govde.sub).toContain('mailto:');
    expect(govde.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const isaretler = [...env.KV.depo.keys()].filter(k => k.startsWith('gonderim:'));
    expect(isaretler.length).toBe(1);
    expect(isaretler[0].endsWith(':2026-08-12')).toBe(true);
  });

  test('cron: saat eşleşmeyen VEYA vadesi gelmemiş aboneye HİÇ gönderilmez', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde({ saat: 15 })), env);   // saat tutmuyor
    const baska = { endpoint: 'https://fcm.googleapis.com/fcm/send/ikinci', keys: ABONELIK.keys };
    await w.fetch(istekYap('/abone', gecerliGovde({ abonelik: baska, vade: '2026-08-13' })), env);  // vade yarın
    const ucuncu = { endpoint: 'https://fcm.googleapis.com/fcm/send/ucuncu', keys: ABONELIK.keys };
    await w.fetch(istekYap('/abone', gecerliGovde({ abonelik: ucuncu, vade: null })), env);          // vadesiz
    const istekler = pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    expect(istekler).toEqual([]);
  });

  test('günde EN FAZLA 1: işaret varken aynı gün ikinci tur göndermez', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    const istekler = pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:10:00Z'));
    await w.gonderTuru(env, new Date('2026-08-12T09:50:00Z'));
    expect(istekler.length).toBe(1);
  });

  test('404/410 → ölü abonelik KV\'den SİLİNİR (mutasyon kilidi)', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    pushServisi(410);
    await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('abone:'))).toEqual([]);
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('gonderim:'))).toEqual([]);
  });

  test('429 → geri çekil: işaret yazılmaz, kayıt durur, sonraki saat yeniden dener', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    let istekler = pushServisi(429);
    await w.gonderTuru(env, new Date('2026-08-12T09:10:00Z'));
    expect(istekler.length).toBe(1);
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('abone:')).length).toBe(1);
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('gonderim:'))).toEqual([]);
    istekler = pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:50:00Z'));   // aynı gün, işaret yok → yeniden
    expect(istekler.length).toBe(1);
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('gonderim:')).length).toBe(1);
  });

  test('VAPID özel anahtarı hiçbir yanıtta sızmaz', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    const ozelD = JSON.parse(TEST_JWK).d;
    const yanitlar = [
      await w.fetch(istekYap('/abone', gecerliGovde()), env),
      await w.fetch(istekYap('/abone-durum?endpoint=' + encodeURIComponent(ABONELIK.endpoint)), env),
      await w.fetch(istekYap('/saglik'), env),
      await w.fetch(istekYap('/abone', 'bozuk'), env)
    ];
    for (const y of yanitlar) {
      const metin = await y.text();
      expect(metin.includes(ozelD)).toBe(false);
      expect(metin.includes('VAPID_OZEL')).toBe(false);
    }
  });

  /* ===== v62 TEŞHİS UÇLARI =====
     Gerçek arıza: iki gün bildirim gelmedi, ama "worker ayakta" dışında
     ölçülebilir hiçbir şey yoktu. /saglik yalnız {durum:'calisiyor'}
     dönüyordu; cron'un koşup koşmadığı, kaç abonenin tarandığı, NEDEN
     atlandığı dışarıdan görülemiyordu. Kök neden (vade:null) ancak bu
     sayaçlarla kanıtlanabildi.
     (Mutasyon 3: atlananVadeYok sayacı kaldırılır → sebep vakası kırmızı.
      Mutasyon 4: gecmisYaz çağrısı kaldırılır → /cron-gecmis vakası kırmızı.) */

  test('v62 /saglik: abone sayısı + son cron özeti; cron koşmadan sonCron null', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    let y = await w.fetch(istekYap('/saglik'), env);
    let d = await y.json();
    expect(d.durum).toBe('calisiyor');
    expect(d.aboneSayisi).toBe(0);
    expect(d.sonCron).toBe(null);           // cron HİÇ koşmamış
    expect(d.turSayisi).toBe(0);

    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    d = await (await w.fetch(istekYap('/saglik'), env)).json();
    expect(d.aboneSayisi).toBe(1);
    expect(d.sonCron.taranan).toBe(1);
    expect(d.sonCron.gonderilen).toBe(1);
    expect(d.turSayisi).toBe(1);
    expect(typeof d.sonCronDkOnce).toBe('number');
  });

  test('v62 cron özeti ATLAMA SEBEBİNİ ayırır (vade yok / saat / günlük)', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    // vade null — kullanıcının gerçek durumu: kuyrukta alıntı yok
    await w.fetch(istekYap('/abone', gecerliGovde({ vade: null })), env);
    pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    let t = (await (await w.fetch(istekYap('/cron-gecmis'), env)).json()).turler;
    expect(t[0].taranan).toBe(1);
    expect(t[0].gonderilen).toBe(0);
    expect(t[0].atlananVadeYok).toBe(1);      // ← kök nedeni gösteren sayaç
    expect(t[0].atlananSaat).toBe(0);

    // saat tutmayan tur
    await w.gonderTuru(env, new Date('2026-08-12T15:30:00Z'));
    t = (await (await w.fetch(istekYap('/cron-gecmis'), env)).json()).turler;
    expect(t[1].atlananSaat).toBe(1);
    expect(t[1].atlananVadeYok).toBe(0);

    // vadesi gelmiş + gönderildi, sonra aynı gün ikinci tur → günlük işaret
    const env2 = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env2);
    pushServisi(201);
    await w.gonderTuru(env2, new Date('2026-08-12T09:10:00Z'));
    await w.gonderTuru(env2, new Date('2026-08-12T09:50:00Z'));
    const t2 = (await (await w.fetch(istekYap('/cron-gecmis'), env2)).json()).turler;
    expect(t2[0].gonderilen).toBe(1);
    expect(t2[1].gonderilen).toBe(0);
    expect(t2[1].atlananGunluk).toBe(1);
  });

  test('v62 /cron-gecmis DÖNEN tampon — sınırsız büyümez', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde({ saat: 15 })), env);
    pushServisi(201);
    for (let i = 0; i < 30; i++) await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    const t = (await (await w.fetch(istekYap('/cron-gecmis'), env)).json()).turler;
    expect(t.length).toBe(24);                // CRON_GECMIS tavanı
  });

  test('v62 GİZLİLİK: teşhis uçları endpoint/hash/metin SIZDIRMAZ', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    pushServisi(201);
    await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    const saglik = await (await w.fetch(istekYap('/saglik'), env)).text();
    const gecmis = await (await w.fetch(istekYap('/cron-gecmis'), env)).text();
    for (const govde of [saglik, gecmis]) {
      expect(govde).not.toContain(ABONELIK.endpoint);
      expect(govde).not.toContain('fcm.googleapis.com');
      expect(govde).not.toContain('p256ORNEK');
      expect(govde).not.toContain('authORNEK');
      expect(govde).not.toContain('abone:');       // hash anahtarı da geçmez
      expect(govde).not.toContain('TESTACIK');
      expect(govde).not.toContain('"d"');          // VAPID özel anahtar alanı
    }
  });

  test('v62 /test-push: kayıtlı endpoint için gönderir, koşulları atlar, GÜNLÜK İŞARET YAZMAZ', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    // saat tutmuyor + vade null: gerçek cron GÖNDERMEZ ama test push gönderir
    await w.fetch(istekYap('/abone', gecerliGovde({ saat: 3, vade: null })), env);
    const istekler = pushServisi(201);
    const y = await w.fetch(istekYap('/test-push', { endpoint: ABONELIK.endpoint }), env);
    const d = await y.json();
    expect(d.sonuc).toBe('tamam');
    expect(d.durum).toBe(201);                     // push servisinin GERÇEK kodu
    expect(istekler.length).toBe(1);
    expect(istekler[0].secenek.body).toBeUndefined();   // payload'sız sözleşmesi sürüyor
    // gerçek hatırlatmayı tüketmemeli
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('gonderim:'))).toEqual([]);
  });

  test('v62 /test-push: kayıtsız endpoint 404; ölü abonelik (410) KV\'den silinir', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    expect((await w.fetch(istekYap('/test-push', { endpoint: 'https://fcm.googleapis.com/yok' }), env)).status).toBe(404);
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    pushServisi(410);
    const d = await (await w.fetch(istekYap('/test-push', { endpoint: ABONELIK.endpoint }), env)).json();
    expect(d.sonuc).toBe('olu');
    expect(d.durum).toBe(410);
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('abone:'))).toEqual([]);
  });

  /* ===== v63 DÖRT TETİK — sunucu kapıları =====
     Eşikler ÖLÇÜLEREK seçildi (kullanıcının 163 tarihli bitişi, 99 ardışık
     boşluk: medyan 6 gün). 3 gün normal boşlukların %74'ünde çalardı (dırdır);
     7 gün %47 ve medyan kitap döngüsünün hemen üstünde.
     (Mutasyon A: OKUMA_ESIK merdiveni kaldırılır → "her gün çalmaz" kırmızı.
      Mutasyon B: ONCELIK sırası bozulur → çakışma vakası kırmızı.) */
  const TETIK_GOVDE = { abonelik: ABONELIK, saat: 9, dilim: 'UTC' };
  function tetikGovde(ek) { return Object.assign({}, TETIK_GOVDE, ek || {}); }
  const AN = g => new Date(g + 'T09:30:00Z');

  test('v63 okuma: eşik dolmadan GÖNDERMEZ, 7. günde gönderir', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, okumaSonGun: '2026-08-01' })), env);
    const istekler = pushServisi(201);
    await w.gonderTuru(env, AN('2026-08-06'));   // 5 gün — eşik dolmadı
    expect(istekler.length).toBe(0);
    await w.gonderTuru(env, AN('2026-08-08'));   // 7 gün — TAM eşik
    expect(istekler.length).toBe(1);
  });

  test('v63 okuma MERDİVENİ: eşik geçtikten sonra HER GÜN değil, 7\'nin katlarında', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, okumaSonGun: '2026-08-01' })), env);
    const calan = [];
    for (let g = 1; g <= 21; g++) {
      const gun = '2026-08-' + String(g).padStart(2, '0');
      const e2 = ortamKur(sahteKV(Object.fromEntries(env.KV.depo)));
      pushServisi(201);
      const ozet = await w.gonderTuru(e2, AN(gun));
      if (ozet.gonderilen) calan.push(g);
    }
    // 1 Ağustos'tan itibaren 7, 14, 21. günler = 8, 15, 22 Ağustos
    expect(calan).toEqual([8, 15]);
  });

  test('v63 haftalık öneri: yalnız SEÇİLİ günde ve aday VARKEN', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    // 2026-08-23 Pazar, 2026-08-24 Pazartesi
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, oneriGun: 0, oneriVar: true })), env);
    const istekler = pushServisi(201);
    await w.gonderTuru(env, AN('2026-08-24'));   // Pazartesi
    expect(istekler.length).toBe(0);
    await w.gonderTuru(env, AN('2026-08-23'));   // Pazar
    expect(istekler.length).toBe(1);

    // aday yoksa Pazar da olsa göndermez
    const env2 = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, oneriGun: 0, oneriVar: false })), env2);
    pushServisi(201);
    const o = await w.gonderTuru(env2, AN('2026-08-23'));
    expect(o.gonderilen).toBe(0);
  });

  test('v63 tempo: ayda BİR (ayın 1\'i) ve yalnız GERİDE iken', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, tempoGeride: true })), env);
    const istekler = pushServisi(201);
    await w.gonderTuru(env, AN('2026-08-15'));   // ayın ortası
    expect(istekler.length).toBe(0);
    await w.gonderTuru(env, AN('2026-09-01'));   // ayın 1'i
    expect(istekler.length).toBe(1);

    const env2 = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, tempoGeride: false })), env2);
    pushServisi(201);
    expect((await w.gonderTuru(env2, AN('2026-09-01'))).gonderilen).toBe(0);
  });

  test('v63 ÇAKIŞMA: dört tetik de dolu → günde 1 bildirim, ÖNCELİK tempo', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({
      vade: '2026-08-01', okumaSonGun: '2026-08-25', oneriGun: 2, oneriVar: true, tempoGeride: true
    })), env);
    const istekler = pushServisi(201);
    const o = await w.gonderTuru(env, AN('2026-09-01'));   // Salı(2) + ayın 1'i + vade geçmiş
    expect(istekler.length).toBe(1);          // GÜNDE EN FAZLA 1
    expect(o.secimTempo).toBe(1);             // en nadir olan kazanır
    expect(o.secimAlinti).toBe(0);
    // aynı gün ikinci tur: günlük işaret bloklar
    await w.gonderTuru(env, AN('2026-09-01'));
    expect(istekler.length).toBe(1);
  });

  test('v63 KAPALI tetik özetten düşer → sunucu uyandırmaz', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    /* İstemci kapalı tetiği null/false gönderir (aynaOlustur). Sunucu için
       "kapalı" ile "koşulu yok" AYNI şeydir — hangi tetiğin kapatıldığını
       öğrenmez (ek gizlilik). */
    await w.fetch(istekYap('/abone', tetikGovde({
      vade: null, okumaSonGun: null, oneriGun: null, oneriVar: false, tempoGeride: false
    })), env);
    pushServisi(201);
    const o = await w.gonderTuru(env, AN('2026-09-01'));
    expect(o.gonderilen).toBe(0);
    expect(o.atlananVadeYok).toBe(1);
  });

  test('v63 GİZLİLİK: tetik alanları metin KABUL ETMEZ (gövde denetimi)', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    const kotu = [
      { okumaSonGun: 'Tanrı Yanılgısı' },          // kitap adı
      { okumaSonGun: '2026-8-1' },                  // bozuk gün biçimi
      { oneriGun: 'Pazar' },                        // metin
      { oneriGun: 7 },                              // aralık dışı
      { oneriVar: 'evet' },                         // metin
      { tempoGeride: 1 }                            // sayı (boolean değil)
    ];
    for (const ek of kotu) {
      const y = await w.fetch(istekYap('/abone', tetikGovde(Object.assign({ vade: null }, ek))), env);
      expect(y.status, JSON.stringify(ek)).toBe(400);
    }
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('abone:'))).toEqual([]);
  });

  test('v63 ESKİ KAYIT GÖÇÜ: tetik alanı olmayan abone yalnız alıntıyla çalışır', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    /* v62 şemasıyla yazılmış kayıt (yeni alanlar YOK) — elle kuruluyor. */
    const hash = 'a'.repeat(64);
    env.KV.depo.set('abone:' + hash, JSON.stringify({
      abonelik: ABONELIK, saat: 9, dilim: 'UTC', vade: '2026-08-01',
      olusturma: '2026-08-01T00:00:00.000Z'
    }));
    const istekler = pushServisi(201);
    const o = await w.gonderTuru(env, AN('2026-09-01'));
    expect(o.gonderilen).toBe(1);
    expect(o.secimAlinti).toBe(1);      // yeni tetikler "kapalı" sayıldı
    expect(istekler.length).toBe(1);
  });

  test('v63 /saglik: hazır tetik sayımı + ONCELIK dizisi', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({
      vade: '2026-08-01', okumaSonGun: null, oneriGun: null, oneriVar: false, tempoGeride: true
    })), env);
    const d = await (await w.fetch(istekYap('/saglik'), env)).json();
    /* v88 bilinçli güncelleme: öncelik dizisi 4 → 11 tetik. */
    expect(d.oncelik).toEqual(['gecenYil', 'tempo', 'bag', 'cilt', 'yarim',
      'oneri', 'okuma', 'hedef', 'alinti', 'parca', 'gunluk']);
    expect(d.hazirTetikler.alinti).toBe(1);
    expect(d.hazirTetikler.okuma).toBe(0);
    expect(d.hazirTetikler.oneri).toBe(0);
    expect(d.hazirTetikler.parca).toBe(0);   // v88 sayaçları da dönüyor
    expect(d.hazirTetikler.gunluk).toBe(0);
  });

  test('v63 ONCELIK dizisi sw.js ve worker.js\'de BİREBİR aynı (statik kilit)', async () => {
    const oku = p => {
      const m = fs.readFileSync(p, 'utf8').match(/const ONCELIK = (\[[^\]]*\])/);
      expect(m, p + ' içinde ONCELIK bulunamadı').toBeTruthy();
      return m[1].replace(/\s|'/g, '');
    };
    expect(oku(path.join(KOK, 'sw.js')))
      .toBe(oku(path.join(KOK, 'worker-bildirim', 'worker.js')));
  });

  /* ===== v88 YEDİ YENİ TETİK — sunucu kapıları =====
     Hepsi saf fonksiyon (kayıt alanları + tarih); durum damgası YOK.
     (Mutasyon C: yarim merdiveni kaldırılır → "10'un katlarında" kırmızı.
      Mutasyon D: parca gün-nöbeti kaldırılır → "çift günde günlük" kırmızı.) */
  const EPOCH_GUN = g => Math.floor(Date.parse(g + 'T00:00:00Z') / 86400000);

  test('v88 gunluk: okunuyor kitap bayrağıyla gönderir; bayrak yokken sessiz', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, gunlukVar: true })), env);
    const istekler = pushServisi(201);
    await w.gonderTuru(env, AN('2026-09-02'));
    expect(istekler.length).toBe(1);
    const env2 = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, gunlukVar: false })), env2);
    pushServisi(201);
    expect((await w.gonderTuru(env2, AN('2026-09-02'))).gonderilen).toBe(0);
  });

  test('v88 yarim MERDİVENİ: 10 ve 20. günde çalar, 5 ve 15. günde çalmaz', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, yarimSonGun: '2026-08-01' })), env);
    const calan = [];
    for (const gun of ['2026-08-06', '2026-08-11', '2026-08-16', '2026-08-21']) {
      const e2 = ortamKur(sahteKV(Object.fromEntries(env.KV.depo)));
      pushServisi(201);
      const ozet = await w.gonderTuru(e2, AN(gun));
      if (ozet.gonderilen) calan.push(gun);
    }
    expect(calan).toEqual(['2026-08-11', '2026-08-21']);   // 10 ve 20 gün
  });

  test('v88 hedef: bayrak yalnız KENDİ gününde çalar — bayat bayrak ertesi güne taşmaz', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, hedefGeride: true, hedefGun: '2026-09-02' })), env);
    const istekler = pushServisi(201);
    const o = await w.gonderTuru(env, AN('2026-09-03'));   // bayrak DÜNÜN — gönderilmez
    expect(o.gonderilen).toBe(0);
    await w.gonderTuru(env, AN('2026-09-02'));             // bayrağın günü — gönderilir
    expect(istekler.length).toBe(1);
    expect((await w.fetch(istekYap('/saglik'), env)).status).toBe(200);
  });

  test('v88 gecenYil: yalnız yıldönümü gününde çalar', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, gecenYilGun: '2026-09-05' })), env);
    const istekler = pushServisi(201);
    await w.gonderTuru(env, AN('2026-09-04'));
    expect(istekler.length).toBe(0);
    const o = await w.gonderTuru(env, AN('2026-09-05'));
    expect(istekler.length).toBe(1);
    expect(o.secimGecenYil).toBe(1);
  });

  test('v88 parca NÖBETİ: tek günlerde parça, çift günlerde günlük; okunuyor kitap yoksa her gün parça', async () => {
    const w = await workerYukle();
    const tek = EPOCH_GUN('2026-09-02') % 2 === 1 ? '2026-09-02' : '2026-09-03';
    const cift = EPOCH_GUN('2026-09-02') % 2 === 0 ? '2026-09-02' : '2026-09-03';
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, parcaVar: true, gunlukVar: true })), env);
    pushServisi(201);
    const oTek = await w.gonderTuru(env, AN(tek));
    expect(oTek.secimParca).toBe(1);
    expect(oTek.secimGunluk).toBe(0);
    const env2 = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, parcaVar: true, gunlukVar: true })), env2);
    pushServisi(201);
    const oCift = await w.gonderTuru(env2, AN(cift));
    expect(oCift.secimGunluk).toBe(1);
    expect(oCift.secimParca).toBe(0);
    // okunuyor kitap yok (gunlukVar false) → çift gün de parçanın
    const env3 = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, parcaVar: true, gunlukVar: false })), env3);
    pushServisi(201);
    expect((await w.gonderTuru(env3, AN(cift))).secimParca).toBe(1);
  });

  test('v88 bag ayın 8\'i, cilt ayın 15\'i — başka gün sessiz (aylık yuva)', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({ vade: null, bagVar: true, ciltVar: true })), env);
    pushServisi(201);
    expect((await w.gonderTuru(env, AN('2026-09-04'))).gonderilen).toBe(0);
    const e8 = ortamKur(sahteKV(Object.fromEntries(env.KV.depo)));
    pushServisi(201);
    expect((await w.gonderTuru(e8, AN('2026-09-08'))).secimBag).toBe(1);
    const e15 = ortamKur(sahteKV(Object.fromEntries(env.KV.depo)));
    pushServisi(201);
    expect((await w.gonderTuru(e15, AN('2026-09-15'))).secimCilt).toBe(1);
  });

  test('v88 ÇAKIŞMA: gecenYil+tempo+gunluk aynı gün hazır → günde 1, öncelik gecenYil', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', tetikGovde({
      vade: null, gecenYilGun: '2026-09-01', tempoGeride: true, gunlukVar: true
    })), env);
    const istekler = pushServisi(201);
    const o = await w.gonderTuru(env, AN('2026-09-01'));   // ayın 1'i + yıldönümü
    expect(istekler.length).toBe(1);
    expect(o.secimGecenYil).toBe(1);
    expect(o.secimTempo).toBe(0);
    expect(o.secimGunluk).toBe(0);
  });

  test('v88 YARIM ile OKUMA aynı gün hazır: İKİSİ BİRDEN GİTMEZ, yarim kazanır', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    // 2026-08-21: okumaSonGun 14 gün önce (7'nin katı), yarimSonGun 10 gün önce
    await w.fetch(istekYap('/abone', tetikGovde({
      vade: null, okumaSonGun: '2026-08-07', yarimSonGun: '2026-08-11'
    })), env);
    const istekler = pushServisi(201);
    const o = await w.gonderTuru(env, AN('2026-08-21'));
    expect(istekler.length).toBe(1);          // tek bildirim
    expect(o.secimYarim).toBe(1);
    expect(o.secimOkuma).toBe(0);
  });

  test('v88 GİZLİLİK: yeni tetik alanları da metin/yanlış tip KABUL ETMEZ', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    const kotu = [
      { gunlukVar: 'evet' }, { yarimSonGun: 'Kürk Mantolu Madonna' },
      { hedefGeride: 1 }, { hedefGun: '2.9.2026' }, { gecenYilGun: 123 },
      { parcaVar: 'var' }, { bagVar: 0 }, { ciltVar: 'yok' }
    ];
    for (const ek of kotu) {
      const y = await w.fetch(istekYap('/abone', tetikGovde(Object.assign({ vade: null }, ek))), env);
      expect(y.status, JSON.stringify(ek)).toBe(400);
    }
    expect([...env.KV.depo.keys()].filter(k => k.startsWith('abone:'))).toEqual([]);
  });

  test('v88 AYNA TUTARLILIĞI: worker tetikHazirMi ile sw swTetikHazir aynı girdide aynı sonucu verir', async () => {
    const w = await workerYukle();
    /* sw.js'in swTetikHazir'ı vm bağlamından çekilir (üst düzey bildirim). */
    const swCtx = swPushKur(undefined).ctx;
    const swHazir = swCtx.swTetikHazir;
    expect(typeof swHazir).toBe('function');
    expect(typeof w.tetikHazirMi).toBe('function');
    const girdiler = [
      { vade: '2026-08-01' }, { vade: null },
      { okumaSonGun: '2026-08-14' }, { okumaSonGun: '2026-08-10' },
      { oneriVar: true, oneriGun: 5 }, { oneriVar: true, oneriGun: 2 },
      { tempoGeride: true }, { tempoGeride: false },
      { gunlukVar: true }, { gunlukVar: false },
      { yarimSonGun: '2026-08-11' }, { yarimSonGun: '2026-08-13' },
      { hedefGeride: true, hedefGun: '2026-08-21' }, { hedefGeride: true, hedefGun: '2026-08-20' },
      { gecenYilGun: '2026-08-21' }, { gecenYilGun: '2026-08-22' },
      { parcaVar: true, gunlukVar: true }, { parcaVar: true, gunlukVar: false },
      { bagVar: true }, { ciltVar: true },
      { vade: '2026-08-21', okumaSonGun: '2026-08-14', oneriVar: true, oneriGun: 5,
        tempoGeride: true, gunlukVar: true, yarimSonGun: '2026-08-11',
        hedefGeride: true, hedefGun: '2026-08-21', gecenYilGun: '2026-08-21',
        parcaVar: true, bagVar: true, ciltVar: true }
    ];
    /* 2026-08-21 Cuma(5); UTC diliminde iki taraf aynı günü görür. */
    const gunler = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-21', '2026-09-01'];
    for (const girdi of girdiler) {
      const kayit = Object.assign({ dilim: 'UTC' }, girdi);
      for (const gun of gunler) {
        for (const t of w.ONCELIK) {
          expect(swHazir(t, kayit, gun),
            t + ' @ ' + gun + ' ' + JSON.stringify(girdi))
            .toBe(w.tetikHazirMi(t, kayit, gun, new Date(gun + 'T09:30:00Z')));
        }
      }
    }
  });

  /* ===== v87 BOZUK KAYIT ÇELİŞKİSİ =====
     Uçlar (v85 kararı) bozuk KV kaydını KORUYUP 409 dönerken cron aynı kaydı
     SİLİYORDU (v62 kalıntısı — karar verilirken gözden kaçtı). Karar: cron da
     silmez. Silinen kayıt geri gelmez; duran kayıt /saglik'taki bozukKayit
     sayısında görünür. 404/410 ölü-abonelik silmesi AYRI ve DOĞRU yol —
     yukarıdaki "ölü abonelik SİLİNİR" mutasyon-kilidi vakası onu korur.
     (Mutasyon 6: cron catch'ine delete geri eklenir → "SİLİNMEZ" vakası
      kırmızı. Mutasyon 7: /saglik bozukKayit'i koşulsuz yazar → "alan hiç
      yok" vakası kırmızı.) */

  test('v87 cron: bozuk KV kaydı SİLİNMEZ, döngü sürer, sağlam abone bildirimini ALIR', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    const bozukAnahtar = 'abone:' + 'b'.repeat(64);
    env.KV.depo.set(bozukAnahtar, 'bozuk{json');   // sağlam kayıttan ÖNCE listelenir
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    const istekler = pushServisi(201);
    const o = await w.gonderTuru(env, new Date('2026-08-12T09:30:00Z'));
    expect(env.KV.depo.has(bozukAnahtar)).toBe(true);          // kayıt DURUYOR
    expect(env.KV.depo.get(bozukAnahtar)).toBe('bozuk{json');  // içeriğe de dokunulmadı
    expect(o.bozukKayit).toBe(1);
    expect(o.gonderilen).toBe(1);              // döngü bozuk kayıtta durmadı
    expect(istekler.length).toBe(1);
    expect(istekler[0].url).toBe(ABONELIK.endpoint);
    // ikinci tur (ertesi gün): kayıt hâlâ duruyor, yine sayılıyor — kalıcılık kanıtı
    const o2 = await w.gonderTuru(env, new Date('2026-08-13T09:30:00Z'));
    expect(env.KV.depo.has(bozukAnahtar)).toBe(true);
    expect(o2.bozukKayit).toBe(1);
    expect(o2.gonderilen).toBe(1);
  });

  test('v87 /saglik: bozukKayit alanı doğru sayıyı gösterir; sağlam sayım etkilenmez', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);    // vade geçmiş → alinti hazır
    env.KV.depo.set('abone:' + 'c'.repeat(64), 'bozuk{json');
    env.KV.depo.set('abone:' + 'e'.repeat(64), '{kirik');
    const d = await (await w.fetch(istekYap('/saglik'), env)).json();
    expect(d.bozukKayit).toBe(2);
    expect(d.aboneSayisi).toBe(3);             // sayım listelenen anahtarı sayar (v62 davranışı korundu)
    expect(d.hazirTetikler.alinti).toBe(1);    // sağlam kaydın tetik sayımı bozuktan etkilenmedi
  });

  test('v87 /saglik: bozuk kayıt YOKKEN bozukKayit alanı HİÇ yazılmaz', async () => {
    const w = await workerYukle();
    const env = ortamKur();
    await w.fetch(istekYap('/abone', gecerliGovde()), env);
    const d = await (await w.fetch(istekYap('/saglik'), env)).json();
    expect('bozukKayit' in d).toBe(false);
  });

  test('worker kaynak kopyaları özdeş (canlı deploy ↔ repo arşivi, CRLF hariç)', async () => {
    const duz = s => s.replace(/\r\n/g, '\n');
    const repo = duz(fs.readFileSync(path.join(KOK, 'worker-bildirim', 'worker.js'), 'utf8'));
    const canli = duz(fs.readFileSync('C:/Users/Kaan/_kitaplik_worker_bildirim/worker.js', 'utf8'));
    expect(repo).toBe(canli);
  });
});

/* ================= sw.js push / notificationclick (vm) ================= */
/* v63: iki anahtar — 'guncel' (metin üretimi) ve 'ayna' (tetik seçimi).
   v88: üçüncü anahtar 'parcaGecmis' (gösterilen parçalar) + PUT desteği —
   SW artık gösterim geçmişini yazıyor; yazımlar `yazilan` dizisinde birikir. */
function sahteIdb(kayit, ayna, gecmis, yazilan) {
  return {
    open() {
      const istek = {};
      setTimeout(() => {
        istek.result = {
          transaction() {
            const tx = {};
            tx.objectStore = () => ({
              get(k) {
                const g = {};
                setTimeout(() => {
                  g.result = (k === 'guncel') ? kayit
                    : (k === 'ayna' ? ayna : (k === 'parcaGecmis' ? gecmis : undefined));
                  if (g.onsuccess) g.onsuccess();
                }, 0);
                return g;
              },
              put(deger, k) {
                if (yazilan) yazilan.push({ k, deger });
                setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
                return {};
              }
            });
            return tx;
          },
          close() {}, createObjectStore() {}
        };
        if (istek.onsuccess) istek.onsuccess();
      }, 0);
      return istek;
    }
  };
}
function swPushKur(ozet, ayar) {
  const a = ayar || {};
  const dinleyici = {};
  const bildirimler = [];
  const acilan = [];
  const mesajlar = [];
  const idbYazilan = [];
  const istemciler = (a.istemciler || []).map(u => ({
    url: u, odaklandi: false,
    focus() { this.odaklandi = true; return Promise.resolve(this); },
    postMessage(m) { mesajlar.push(m); }
  }));
  const ctx = {
    self: {
      location: { origin: 'https://dessn7-bit.github.io' },
      addEventListener: (t, f) => { dinleyici[t] = f; },
      skipWaiting: () => {},
      registration: { showNotification: (baslik, secenek) => { bildirimler.push({ baslik, secenek }); return Promise.resolve(); } },
      clients: {
        claim: () => {},
        matchAll: async () => istemciler,
        openWindow: async u => { acilan.push(u); return null; }
      }
    },
    caches: { open: async () => ({ put: async () => {}, match: async () => undefined, addAll: async () => {} }),
      keys: async () => [], delete: async () => {}, match: async () => undefined },
    fetch: async () => ({ clone: () => ({}) }),
    indexedDB: sahteIdb(ozet, a.ayna, a.gecmis, idbYazilan),
    Response: class { constructor(g, o) { this.govde = g; Object.assign(this, o || {}); } },
    /* v63: `bugun` verilirse argümansız `new Date()` o güne sabitlenir —
       merdiven/haftagünü/ayın-günü kapıları deterministik sınanabilsin.
       Date.parse ve argümanlı kurucu DEĞİŞMEZ (swGunFarki onları kullanıyor). */
    URL, console, setTimeout,
    Date: a.bugun ? new Proxy(Date, {
      construct(hedef, args) {
        return args.length ? new hedef(...args) : new hedef(a.bugun + 'T12:00:00Z');
      }
    }) : Date
  };
  vm.createContext(ctx);
  vm.runInContext(SW_KAYNAK, ctx);
  return { dinleyici, bildirimler, acilan, mesajlar, istemciler, idbYazilan, ctx };
}
async function olayGonder(kurulum, tur, ek) {
  const bekleyen = [];
  kurulum.dinleyici[tur](Object.assign({ waitUntil: p => bekleyen.push(p) }, ek || {}));
  await Promise.all(bekleyen);
}
function gunKaydir(n) {
  const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test.describe('G51 service worker push', () => {

  test('push: dünkü+bugünkü vadeler sayılır, gelecektekiler sayılmaz; örnek metin gövdede (mutasyon kilidi)', async () => {
    const k = swPushKur({ vadeler: [gunKaydir(-1), gunKaydir(0), gunKaydir(3)], ornekMetin: 'Örnek kırpık cümle…', guncelleme: 1 },
      { ayna: { vade: gunKaydir(-1) } });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('2 alıntı seni bekliyor');
    expect(k.bildirimler[0].secenek.body).toContain('Örnek kırpık cümle');
    expect(k.bildirimler[0].secenek.tag).toBe('kitaplik-tekrar');
  });

  /* v63 SÖZLEŞME DEĞİŞİKLİĞİ (bilinçli): eskiden "bugün vadesi yoksa SESSİZ".
     Artık her push MUTLAKA bir bildirim gösterir — userVisibleOnly gereği
     göstermezsek Chrome jenerik bildirim basar ve tekrarında aboneliği
     düşürebilir. Üç tetik eklenince sapma olasılığı üçe katlandığı için bu
     risk kabul edilemez hale geldi. Sessizlik yerine DÜRÜST GENEL metin. */
  test('v63 push: hiçbir tetik hazır değilse SESSİZ KALMAZ — genel yedek gösterilir', async () => {
    const k = swPushKur({ vadeler: [gunKaydir(2), gunKaydir(9)], ornekMetin: 'x', guncelleme: 1 },
      { ayna: { vade: gunKaydir(2) } });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Kitaplığın seni bekliyor');
    expect(k.bildirimler[0].secenek.tag).toBe('kitaplik-genel');
  });

  test('v63 push: özet ve ayna HİÇ yoksa da tam 1 bildirim (userVisibleOnly)', async () => {
    const k = swPushKur(undefined);
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Kitaplığın seni bekliyor');
  });

  test('notificationclick: açık sekme odaklanır + tekrar-ac mesajı; pencere AÇILMAZ', async () => {
    const k = swPushKur(undefined, { istemciler: ['https://dessn7-bit.github.io/kitaplik/index.html'] });
    let kapatildi = false;
    await olayGonder(k, 'notificationclick', { notification: { close: () => { kapatildi = true; } } });
    expect(kapatildi).toBe(true);
    expect(k.istemciler[0].odaklandi).toBe(true);
    /* v63: data'sız (eski) bildirimde alıntı hedefi yedek kalır → hem genel
       yönlendirme mesajı hem eski 'tekrar-ac' gider (geriye uyum). */
    expect(k.mesajlar).toEqual([
      { tur: 'bildirim-ac', hedef: './index.html?sekme=alinti' },
      { tur: 'tekrar-ac' }
    ]);
    expect(k.acilan).toEqual([]);
  });

  /* ===== v63 SW: hangi tetik AYNADAN, metin ÖZETTEN ===== */
  const OZET63 = {
    vadeler: [], ornekMetin: null, guncelleme: 1,
    okuma: { id: 'k1', ad: 'Tanrı Yanılgısı', sayfa: 250, toplam: 352, sonGun: '2026-08-01' },
    oneri: { ad: 'Varlık ve Hiçlik', neden: 'Sartre: bitirdiğin 2 kitaba ortalama 9,5 verdin' },
    tempo: { hedef: 24, bitti: 6, projeksiyon: 9, geride: true }
  };
  test('v63 SW okuma metni: kitap adı + kaldığı sayfa + kaç gün; hedef KİTAP DETAYI', async () => {
    const k = swPushKur(OZET63, { ayna: { okumaSonGun: '2026-08-01' }, bugun: '2026-08-08' });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Tanrı Yanılgısı');
    expect(k.bildirimler[0].secenek.body).toContain('250. sayfadasın');
    expect(k.bildirimler[0].secenek.body).toContain('7 gündür');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?kitap=k1');
  });

  test('v63 SW öneri metni: öneri adı + gerekçe; hedef KEŞFET', async () => {
    const k = swPushKur(OZET63, { ayna: { oneriGun: 0, oneriVar: true }, bugun: '2026-08-23' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].baslik).toContain('Varlık ve Hiçlik');
    expect(k.bildirimler[0].secenek.body).toContain('Sartre');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?sekme=kesfet');
  });

  test('v63 SW tempo metni: projeksiyon + hedef; hedef RAKAMLAR', async () => {
    const k = swPushKur(OZET63, { ayna: { tempoGeride: true }, bugun: '2026-09-01' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].secenek.body).toContain('~9 kitap');
    expect(k.bildirimler[0].secenek.body).toContain('hedefin 24');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?sekme=ist');
  });

  test('v63 SW: ayrıntı üretilemezse SESSİZ kalmaz, yumuşak metne düşer', async () => {
    // ayna okuma diyor ama özette okuma bloğu YOK (kitap silinmiş olabilir)
    const k = swPushKur({ vadeler: [], guncelleme: 1 },
      { ayna: { okumaSonGun: '2026-08-01' }, bugun: '2026-08-08' });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Yarım kalan kitabın var');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?sekme=raf');
  });

  test('v63 SW ÖNCELİK: dört tetik de hazırken tempo seçilir', async () => {
    const k = swPushKur(Object.assign({}, OZET63, { vadeler: ['2026-08-01'], ornekMetin: 'x' }),
      { ayna: { vade: '2026-08-01', okumaSonGun: '2026-08-25', oneriGun: 2, oneriVar: true, tempoGeride: true },
        bugun: '2026-09-01' });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].secenek.tag).toBe('kitaplik-tempo');
  });

  test('v63 notificationclick: okuma bildirimi kitabın detayına gider', async () => {
    const k = swPushKur(undefined, { istemciler: ['https://dessn7-bit.github.io/kitaplik/index.html'] });
    await olayGonder(k, 'notificationclick', {
      notification: { close: () => {}, data: { hedef: './index.html?kitap=k1' } } });
    expect(k.mesajlar).toEqual([{ tur: 'bildirim-ac', hedef: './index.html?kitap=k1' }]);
    expect(k.acilan).toEqual([]);
  });

  test('v63 notificationclick: sekme kapalıysa tetiğin hedefiyle pencere açılır', async () => {
    const k = swPushKur(undefined);
    await olayGonder(k, 'notificationclick', {
      notification: { close: () => {}, data: { hedef: './index.html?sekme=ist' } } });
    expect(k.acilan).toEqual(['./index.html?sekme=ist']);
  });

  test('notificationclick: açık sekme yoksa ?sekme=alinti ile pencere açılır', async () => {
    const k = swPushKur(undefined, { istemciler: [] });
    await olayGonder(k, 'notificationclick', { notification: { close: () => {} } });
    expect(k.acilan).toEqual(['./index.html?sekme=alinti']);
  });

  /* ===== v88 SW: yeni tetik metinleri + parça geçmişi ===== */
  const OZET88 = {
    vadeler: [], ornekMetin: null, guncelleme: 1,
    gunluk: { id: 'g1', ad: 'Kürk Mantolu Madonna', sayfa: 143, toplam: 208 },
    yarim: { id: 'y1', ad: 'Ulysses', sayfa: 87, sonGun: '2026-08-11' },
    hedef: { hedef: 20, okunan: 5, gun: '2026-08-21', geride: true },
    gecenYil: { gun: '2026-08-21', yil: 2025, ad: 'Simyacı', id: 'gy1' },
    bag: { kavram: 'yabancılaşma', k1: 'Dönüşüm', k2: 'Yabancı' },
    cilt: { seri: 'Vakıf', gosterilen: [2, 5, 7], kalan: 4 },
    parca: { havuz: [
      { k: 'p1', ad: '1984', kay: 'o', i: 3, metin: 'Parti geçmişi sürekli yeniden yazar; amaç yalnız yalan söylemek değil, geçmişi gerçekten değiştirmektir.' },
      { k: 'p2', ad: 'Dune', kay: 'm', i: 5, metin: 'Korku zihin öldürücüdür; küçük ölüm getiren tam yok oluştur, korkumun üzerinden geçeceğim.' }
    ] }
  };
  test('v88 SW gunluk metni: kitap adı + sayfa/toplam; hedef KİTAP DETAYI', async () => {
    const k = swPushKur(OZET88, { ayna: { gunlukVar: true }, bugun: '2026-08-20' });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Kürk Mantolu Madonna');
    expect(k.bildirimler[0].secenek.body).toContain('143/208. sayfadasın');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?kitap=g1');
  });
  test('v88 SW yarim metni: N gündür X. sayfada; hedef KİTAP DETAYI', async () => {
    const k = swPushKur(OZET88, { ayna: { yarimSonGun: '2026-08-11' }, bugun: '2026-08-21' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].baslik).toBe('Ulysses');
    expect(k.bildirimler[0].secenek.body).toContain('10 gündür 87. sayfadasın');
    expect(k.bildirimler[0].secenek.tag).toBe('kitaplik-yarim');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?kitap=y1');
  });
  test('v88 SW hedef metni: bugün N sayfa / hedef M; özet BAŞKA güne aitse sayı uydurulmaz', async () => {
    const k = swPushKur(OZET88, { ayna: { hedefGeride: true, hedefGun: '2026-08-21' }, bugun: '2026-08-21' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].secenek.body).toBe('Bugün 5 sayfa okudun, hedefin 20.');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?sekme=ist');
    // bayat özet (dünkü hedef bloğu) → yumuşak metin
    const bayat = swPushKur(Object.assign({}, OZET88, { hedef: { hedef: 20, okunan: 5, gun: '2026-08-20', geride: true } }),
      { ayna: { hedefGeride: true, hedefGun: '2026-08-21' }, bugun: '2026-08-21' });
    await olayGonder(bayat, 'push');
    expect(bayat.bildirimler[0].secenek.body).not.toContain('5 sayfa');
  });
  test('v88 SW gecenYil metni: geçen yıl / eski yıl ayrımı; hedef KİTAP DETAYI', async () => {
    const k = swPushKur(OZET88, { ayna: { gecenYilGun: '2026-08-21' }, bugun: '2026-08-21' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].baslik).toBe('Geçen yıl bugün');
    expect(k.bildirimler[0].secenek.body).toContain('Simyacı');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?kitap=gy1');
    const eski = swPushKur(Object.assign({}, OZET88, { gecenYil: { gun: '2026-08-21', yil: 2023, ad: 'Simyacı', id: 'gy1' } }),
      { ayna: { gecenYilGun: '2026-08-21' }, bugun: '2026-08-21' });
    await olayGonder(eski, 'push');
    expect(eski.bildirimler[0].baslik).toBe('2023 yılında bugün');
  });
  test('v88 SW bag metni: kavram + iki kitap; hedef ALINTILAR (fikir ağı)', async () => {
    const k = swPushKur(OZET88, { ayna: { bagVar: true }, bugun: '2026-08-08' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].secenek.body).toContain('yabancılaşma');
    expect(k.bildirimler[0].secenek.body).toContain('Dönüşüm');
    expect(k.bildirimler[0].secenek.body).toContain('Yabancı');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?sekme=alinti');
  });
  test('v88 SW cilt metni: TAVANLI liste + "ve N cilt daha"; hedef SERİ RAFI', async () => {
    const k = swPushKur(OZET88, { ayna: { ciltVar: true }, bugun: '2026-08-15' });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].baslik).toBe('Vakıf serisi');
    expect(k.bildirimler[0].secenek.body).toBe('2 ve 5 ve 7. ciltleri eksik (ve 4 cilt daha).');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?seri=Vak%C4%B1f');
  });
  test('v88 SW parça: geçmişteki parça ATLANIR, gösterilen parça geçmişe YAZILIR', async () => {
    const tekGun = (Math.floor(Date.parse('2026-08-21T00:00:00Z') / 86400000) % 2 === 1)
      ? '2026-08-21' : '2026-08-22';
    const k = swPushKur(OZET88, { ayna: { parcaVar: true, gunlukVar: false }, bugun: tekGun,
      gecmis: [{ a: 'p1:o:3', g: tekGun }] });   // ilk parça bugün zaten gösterilmiş
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Dune');           // ikinci parçaya düştü
    expect(k.bildirimler[0].secenek.body).toContain('Korku zihin öldürücüdür');
    expect(k.bildirimler[0].secenek.data.hedef).toBe('./index.html?kitap=p2');
    expect(k.idbYazilan.length).toBe(1);                     // geçmiş yazıldı
    expect(k.idbYazilan[0].k).toBe('parcaGecmis');
    const anahtarlar = k.idbYazilan[0].deger.map(g => g.a);
    expect(anahtarlar).toContain('p1:o:3');                  // eski kayıt korunur
    expect(anahtarlar).toContain('p2:m:5');                  // yeni gösterim eklendi
  });
  test('v88 SW parça 90 GÜN: penceresi dolan parça yeniden seçilebilir', async () => {
    const bugun = '2026-08-21';
    const gun91 = '2026-05-22';   // 91 gün önce
    const k = swPushKur(OZET88, { ayna: { parcaVar: true, gunlukVar: false }, bugun,
      gecmis: [{ a: 'p1:o:3', g: gun91 }] });
    await olayGonder(k, 'push');
    expect(k.bildirimler[0].baslik).toBe('1984');   // pencere doldu → ilk parça yine seçildi
    // 89 gün önce gösterilmiş olsaydı hâlâ yasak olurdu
    const yakin = swPushKur(OZET88, { ayna: { parcaVar: true, gunlukVar: false }, bugun,
      gecmis: [{ a: 'p1:o:3', g: '2026-05-25' }] });
    await olayGonder(yakin, 'push');
    expect(yakin.bildirimler[0].baslik).toBe('Dune');
  });
  test('v88 SW parça havuzu TÜKENDİYSE sessiz kalınmaz — yumuşak metin, geçmişe yazım YOK', async () => {
    const bugun = '2026-08-21';
    const k = swPushKur(OZET88, { ayna: { parcaVar: true, gunlukVar: false }, bugun,
      gecmis: [{ a: 'p1:o:3', g: bugun }, { a: 'p2:m:5', g: bugun }] });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].baslik).toBe('Kitaplığından bir satır');
    expect(k.idbYazilan.length).toBe(0);
  });
  test('v88 SW ÖNCELİK: yeni tetikler hazırken de TEK bildirim, sırasına uygun (gecenYil kazanır)', async () => {
    const k = swPushKur(OZET88, { ayna: { gecenYilGun: '2026-08-21', gunlukVar: true,
      yarimSonGun: '2026-08-11', bagVar: true, parcaVar: true }, bugun: '2026-08-21' });
    await olayGonder(k, 'push');
    expect(k.bildirimler.length).toBe(1);
    expect(k.bildirimler[0].secenek.tag).toBe('kitaplik-gecenyil');
  });

  test('sw kaynak: bildirim.js ASSETS\'te; OCR kova sözleşmesi bozulmadı (regresyon)', async () => {
    const e = SW_KAYNAK.match(/const ASSETS = \[([^\]]*)\]/)[1];
    expect(e).toContain("'./bildirim.js'");
    // OCR sözleşmesi: kova sabiti + activate muafiyeti + /ocr/ dalı hâlâ yerinde
    expect(SW_KAYNAK).toContain("const OCR_KOVA = 'kk_ocr_paket_v1'");
    expect(SW_KAYNAK).toContain('k !== CACHE && k !== OCR_KOVA');
    expect(SW_KAYNAK.indexOf("indexOf('/ocr/')")).toBeGreaterThan(-1);
  });
});

/* ================= sayfa tarafı (bildirim.js) ================= */
function alintiNotu(ek) {
  return Object.assign({ id: 'not' + Math.random().toString(36).slice(2, 7), tip: 'alinti',
    metin: 'Aşk, insanın kendi eksikliğini bir başkasında tamamlama çabasıdır; upuzun bir cümle olsun diye devam ediyor.',
    tarih: '2026-08-01', sayfa: null, tekrarDurum: 'aktif', tekrarAralik: 3,
    tekrarSayisi: 1, tekrarSonraki: bugunISO(0) }, ek || {});
}

test.describe('G51 sayfa tarafı', () => {

  test('özet IndexedDB\'ye yazılır: vade listesi + kırpılmış örnek metin', async ({ page }) => {
    const k = sahteKitap({ ad: 'Deneme', notlar: [alintiNotu(), alintiNotu({ tekrarSonraki: bugunISO(4), metin: 'İkinci.' })] });
    await tohumla(page, [k]);
    await rafAc(page);
    await expect.poll(() => page.evaluate(() => window.__bildirim.ozetOku().then(o => o && o.vadeler.length)), { timeout: 8000 }).toBe(2);
    const o = await page.evaluate(() => window.__bildirim.ozetOku());
    expect(o.vadeler[0]).toBe(await page.evaluate(() => {
      const s = new Date();
      return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') + '-' + String(s.getDate()).padStart(2, '0');
    }));
    expect(o.ornekMetin.length).toBeLessThanOrEqual(90);
    expect(o.ornekMetin.endsWith('…')).toBe(true);
    expect(o.ornekMetin).toContain('Aşk, insanın');
  });

  test('kuyruk değişince özet tazelenir (tk-devam → vade ileri gider)', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Deneme', notlar: [alintiNotu()] })]);
    await rafAc(page);
    await page.click('nav [data-act="sekme"][data-v="alinti"]');
    await expect(page.locator('#tkKutu [data-act="tk-devam"]')).toBeVisible();
    const bugun = bugunISO(0);
    await expect.poll(() => page.evaluate(() => window.__bildirim.ozetOku().then(o => o && o.vadeler[0])), { timeout: 8000 }).toBe(bugun);
    await page.click('#tkKutu [data-act="tk-devam"]');
    // depoKaydet sarmalaması + 500ms debounce → özetteki vade artık gelecekte
    await expect.poll(() => page.evaluate(() => window.__bildirim.ozetOku().then(o => o && o.vadeler[0])), { timeout: 8000 }).not.toBe(bugun);
    const yeni = await page.evaluate(() => window.__bildirim.ozetOku().then(o => o.vadeler[0]));
    expect(yeni > bugun).toBe(true);
  });

  test('Ayarlar ▸ Hatırlatma: destek yokken dürüst mesaj, düğmeler gizli', async ({ page }) => {
    await page.addInitScript(() => { try { delete window.PushManager; } catch (e) {} });
    await tohumla(page, [sahteKitap({ ad: 'Deneme' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await expect(page.locator('#htDurum')).toContainText('desteklemiyor');
    await expect(page.locator('#ayBolumHatirlatma [data-act="ht-ac"]')).toBeHidden();
  });

  test('izin reddedilmişse dürüst mesaj + tarayıcı ayarı yönergesi; Aç düğmesi gizli', async ({ page }) => {
    await page.addInitScript(() => {
      try { Object.defineProperty(Notification, 'permission', { value: 'denied', configurable: true }); } catch (e) {}
    });
    await tohumla(page, [sahteKitap({ ad: 'Deneme' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await expect(page.locator('#htDurum')).toContainText('reddedilmiş');
    await expect(page.locator('#htDurum')).toContainText('site ayarları');
    await expect(page.locator('#ayBolumHatirlatma [data-act="ht-ac"]')).toBeHidden();
    await expect(page.locator('#ayBolumHatirlatma [data-act="ht-kapat"]')).toBeHidden();
  });

  /* ===== v62 GÖRÜNÜR DURUM =====
     GERÇEK ARIZA: kullanıcı hatırlatmayı açtı, saatini seçti, iki gün bekledi;
     hiç bildirim gelmedi. Sistem DOĞRU çalışıyordu — tekrar kuyruğunda hiç
     alıntı yoktu, sunucu da "vade yoksa gönderme" kuralını uyguluyordu.
     Ama Ayarlar yalnız "Açık — ... hatırlatılır" diyordu; doğru-sessiz davranış
     kullanıcı için arızadan ayırt edilemiyordu. Bu vakalar o sessizliği kilitler.
     (Mutasyon 5: kuyrukSatiri'nın boş-kuyruk dalı kaldırılır → vaka kırmızı.) */
  /* Testte gerçek service worker YOK (yardim.js SW'yi bloklar) ve gerçek push
     aboneliği alınamaz. durumYaz'ın "açık" dalına girebilmek için push yığını
     taklit edilir: izin granted + kayıtlı abonelik döndüren pushManager. */
  async function hatirlatmaAc(page, sunucuYanit) {
    page.__agAyar.bildirim = sunucuYanit || { kayitli: true, saat: 12, dilim: 'Europe/Istanbul',
      vade: null, olusturma: '2026-08-14T17:57:03.512Z', sonGonderim: null };
    await page.addInitScript(() => {
      try { Object.defineProperty(Notification, 'permission', { value: 'granted', configurable: true }); } catch (e) {}
      const abonelik = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-abone',
        keys: { p256dh: 'p', auth: 'a' },
        toJSON() { return { endpoint: this.endpoint, keys: this.keys }; }
      };
      const kayit = {
        pushManager: { getSubscription: async () => abonelik, subscribe: async () => abonelik },
        showNotification: async () => {}
      };
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: { getRegistration: async () => kayit, register: async () => kayit,
            ready: Promise.resolve(kayit), controller: null, addEventListener() {} }
        });
      } catch (e) {}
      /* addInitScript HER gezinmede koşar; koşulsuz yazsaydı reload vakaları
         uygulamanın kaydettiği tercihi ezerdi (tohumla'daki aynı gerekçe). */
      if (localStorage.getItem('kk_bildirim_v1') === null)
        localStorage.setItem('kk_bildirim_v1', JSON.stringify({ acik: true, saat: 12, sonVade: null }));
    });
  }

  test('v62 kuyruk BOŞKEN dürüst mesaj: "bildirim gönderilmeyecek" + ne yapılacağı', async ({ page }) => {
    await hatirlatmaAc(page);
    await tohumla(page, [sahteKitap({ ad: 'Notsuz Kitap' })]);   // hiç alıntı yok
    await rafAc(page);
    await ayarlarAc(page);
    const d = page.locator('#htDurum');
    await expect(d).toContainText('Tekrar kuyruğunda alıntı YOK');
    await expect(d).toContainText('gönderilmeyecek');
    await expect(d).toContainText('alıntı ekle');
  });

  test('v62 kuyrukta alıntı VARKEN sayı ve vade söylenir (boş mesajı ÇIKMAZ)', async ({ page }) => {
    await hatirlatmaAc(page);
    const bugun = bugunISO();
    await tohumla(page, [sahteKitap({ ad: 'Alıntılı Kitap', notlar: [
      { id: 'n1', tip: 'alinti', metin: 'Deneme alıntısı', tarih: bugun,
        tekrarDurum: 'aktif', tekrarSonraki: bugun }
    ] })]);
    await rafAc(page);
    await ayarlarAc(page);
    const d = page.locator('#htDurum');
    await expect(d).toContainText('Bugün vadesi gelen 1 alıntı');
    await expect(d).not.toContainText('alıntı YOK');
  });

  test('v62 sunucuda kayıt YOKKEN dürüst mesaj (tarayıcı "açık" dese bile)', async ({ page }) => {
    await hatirlatmaAc(page, { kayitli: false });
    await tohumla(page, [sahteKitap({ ad: 'Notsuz Kitap' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await expect(page.locator('#htDurum')).toContainText('Sunucuda kayıt YOK');
  });

  test('v62 sunucu durumu: kayıt tarihi + "henüz hiç bildirim gönderilmedi"', async ({ page }) => {
    await hatirlatmaAc(page);   // sonGonderim: null
    await tohumla(page, [sahteKitap({ ad: 'Notsuz Kitap' })]);
    await rafAc(page);
    await ayarlarAc(page);
    const d = page.locator('#htDurum');
    await expect(d).toContainText('Sunucuda kayıtlı');
    await expect(d).toContainText('14 Ağustos');
    await expect(d).toContainText('Henüz hiç bildirim gönderilmedi');
  });

  /* ===== v63 özet + Ayarlar ===== */
  test('v63 özet: okuma/öneri/tempo blokları doğru dolar', async ({ page }) => {
    const bugun = bugunISO();
    await tohumla(page, [
      sahteKitap({ id: 'ok1', ad: 'Okunan Kitap', durum: 'okunuyor', guncelSayfa: 250, sayfa: 352,
        seanslar: [{ a: 0, b: 250, t: '2026-08-01' }] }),
      sahteKitap({ ad: 'Aday Kitap', durum: 'okunacak', yazar: 'Bir Yazar' }),
      sahteKitap({ ad: 'Bitmis', durum: 'bitti', puan: 9, bitisTarihi: bugun })
    ]);
    await rafAc(page);
    const o = await page.evaluate(() => window.__bildirim.ozetHesapla());
    expect(o.okuma.id).toBe('ok1');
    expect(o.okuma.ad).toBe('Okunan Kitap');
    expect(o.okuma.sayfa).toBe(250);
    expect(o.okuma.sonGun).toBe('2026-08-01');
    expect(o.oneri && o.oneri.ad).toBe('Aday Kitap');
    expect(typeof (o.oneri && o.oneri.neden)).toBe('string');
    expect(o.tempo).toBe(null);        // hedef yok
  });

  test('v63 okuma günü: gsG ile seans arasında EN YENİ olan seçilir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'K', durum: 'okunuyor', guncelSayfa: 10,
      seanslar: [{ a: 0, b: 10, t: '2026-08-01' }],
      gsG: Date.parse('2026-08-05T10:00:00Z') })]);
    await rafAc(page);
    const o = await page.evaluate(() => window.__bildirim.ozetHesapla());
    expect(o.okuma.sonGun).toBe('2026-08-05');   // bayat seans taze damgayı gölgelemez
  });

  test('v63 AYNA: kapalı tetik alanı DÜŞER; gizlilik — metin alanı YOK', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'ok1', ad: 'Okunan Kitap', durum: 'okunuyor',
      guncelSayfa: 5, seanslar: [{ a: 0, b: 5, t: '2026-08-01' }] })]);
    await rafAc(page);
    const r = await page.evaluate(() => {
      const B = window.__bildirim;
      const o = B.ozetHesapla();
      const kapali = B.aynaOlustur(o, { tetik: { alinti: true, okuma: false, oneri: false, tempo: false }, oneriGun: 0 });
      const acik = B.aynaOlustur(o, { tetik: { alinti: true, okuma: true, oneri: true, tempo: true }, oneriGun: 0 });
      return { kapali, acik };
    });
    expect(r.kapali.okumaSonGun).toBe(null);       // KAPALI → düşer
    expect(r.acik.okumaSonGun).toBe('2026-08-01'); // AÇIK → gider
    /* gizlilik: aynada yalnız GÜN/BAYRAK alanları, hiçbiri metin değil
       (v88 bilinçli güncelleme: 5 → 13 alan). */
    expect(Object.keys(r.acik).sort()).toEqual(['bagVar', 'ciltVar', 'gecenYilGun',
      'gunlukVar', 'hedefGeride', 'hedefGun', 'okumaSonGun', 'oneriGun', 'oneriVar',
      'parcaVar', 'tempoGeride', 'vade', 'yarimSonGun']);
    const govde = JSON.stringify(r.acik);
    expect(govde).not.toContain('Okunan Kitap');
    expect(govde).not.toContain('ok1');
  });

  test('v63+v88 Ayarlar: on bir tetik listelenir; eski dördün varsayılanı KORUNDU, yedi yenisi AÇIK', async ({ page }) => {
    await hatirlatmaAc(page);
    await tohumla(page, [sahteKitap({ ad: 'Deneme' })]);
    await rafAc(page);
    await ayarlarAc(page);
    const dugmeler = page.locator('#htTetikler [data-act="ht-tetik"]');
    await expect(dugmeler).toHaveCount(11);
    /* v63 varsayılanları AYNEN: alinti açık, okuma/oneri/tempo kapalı. */
    await expect(page.locator('#htTetikler [data-v="alinti"]')).toHaveAttribute('aria-pressed', 'true');
    for (const t of ['okuma', 'oneri', 'tempo']) {
      await expect(page.locator('#htTetikler [data-v="' + t + '"]')).toHaveAttribute('aria-pressed', 'false');
    }
    /* v88'in yedi yenisi VARSAYILAN AÇIK (bilinçli istisna — talep "boş gün
       kalmasın"dı; günde-1 kuralı toplam sayıyı zaten sınırlıyor). */
    for (const t of ['gunluk', 'yarim', 'hedef', 'gecenYil', 'parca', 'bag', 'cilt']) {
      await expect(page.locator('#htTetikler [data-v="' + t + '"]')).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('v63 Ayarlar: tetik açılıp kapanır ve tercih KALICI', async ({ page }) => {
    await hatirlatmaAc(page);
    await tohumla(page, [sahteKitap({ ad: 'Deneme' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await page.click('#htTetikler [data-v="okuma"]');
    await expect(page.locator('#htTetikler [data-v="okuma"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_bildirim_v1')).tetik.okuma)).toBe(true);
    await page.reload();
    await ayarlarAc(page);
    await expect(page.locator('#htTetikler [data-v="okuma"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('v63 Ayarlar: açık ama koşulsuz tetik SESSİZ KALACAĞINI söyler', async ({ page }) => {
    await hatirlatmaAc(page);
    await tohumla(page, [sahteKitap({ ad: 'Notsuz', durum: 'bitti' })]);   // okunuyor kitap YOK, hedef YOK
    await rafAc(page);
    await ayarlarAc(page);
    await page.click('#htTetikler [data-v="okuma"]');
    await expect(page.locator('#htTetikler')).toContainText('okunuyor" kitabın yok');
    await page.click('#htTetikler [data-v="tempo"]');
    await expect(page.locator('#htTetikler')).toContainText('Yıl hedefi koymadın');
  });

  /* ===== v88 sayfa tarafı: parça + yeni özet blokları + ayna ===== */

  test('v88 parcala: 80-220 bandı dışı, BÜYÜK HARF ve ":" ile biten satırlar elenir; markdown soyulur, indeks korunur', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'X' })]);
    await rafAc(page);
    const r = await page.evaluate(() => window.__bildirim.parcala([
      'BU SATIR TAMAMEN BÜYÜK HARFLERLE YAZILMIŞ UZUN BİR BAŞLIK SATIRIDIR VE BANT İÇİNDE OLSA BİLE ELENMESİ GEREKİR',
      'Bu paragraf iki nokta üst üste ile bittiği için başlık sayılır ve elenir; uzunluğu bandın içinde olsa bile alınmaz:',
      'Kısa satır.',
      'Bu paragraf **kalın işaretleriyle** birlikte tam bandın içinde kalır ve seçilmeye uygundur; markdown yıldızları metinden soyulur.',
      'Bandı aşan çok uzun paragraf: ' + 'aynı cümle tekrar ederek sınırı geçer. '.repeat(10)
    ].join('\n\n')));
    expect(r.length).toBe(1);
    expect(r[0].i).toBe(3);                                  // özgün paragraf indeksi
    expect(r[0].metin).toContain('kalın işaretleriyle');
    expect(r[0].metin).not.toContain('**');
    expect(r[0].metin.length).toBeGreaterThanOrEqual(80);
    expect(r[0].metin.length).toBeLessThanOrEqual(220);
  });

  test('v88 özet blokları: gunluk EN YENİ, yarim EN ESKİ gsG, gecenYil EN YAKIN gün + EN YAKIN yıl, hedef günlük pay, bag ortak kavram, cilt tavanlı', async ({ page }) => {
    const bugun = bugunISO(0);
    const yil = parseInt(bugun.slice(0, 4), 10);
    const ikiGunSonra = bugunISO(2);
    const besGunSonra = bugunISO(5);
    const simdi = Date.now();
    await tohumla(page, {
      kitaplar: [
        sahteKitap({ id: 'aktif', ad: 'Taze Kitap', durum: 'okunuyor', guncelSayfa: 50,
          sayfa: 100, gsG: simdi - 2 * 86400000,
          seanslar: [{ t: bugun, a: 40, b: 50 }] }),
        sahteKitap({ id: 'bayat', ad: 'Takılı Kitap', durum: 'okunuyor', guncelSayfa: 10,
          sayfa: 200, gsG: simdi - 12 * 86400000,
          oturumlar: [{ b: simdi, s: 60000, sa: 5, sb: 10 }],
          notlar: [{ id: 'n2', tip: 'alinti', metin: 'İkinci not', tarih: bugun, fikir: ['özgürlük'] }] }),
        sahteKitap({ ad: 'Yakın Yıldönümü', durum: 'bitti',
          bitisTarihi: (yil - 1) + ikiGunSonra.slice(4),
          notlar: [{ id: 'n1', tip: 'alinti', metin: 'Birinci not', tarih: bugun, fikir: ['özgürlük'] }] }),
        sahteKitap({ ad: 'Uzak Yıldönümü', durum: 'bitti', bitisTarihi: (yil - 2) + besGunSonra.slice(4) }),
        sahteKitap({ ad: 'Seri 1', durum: 'bitti', bitisTarihi: null, seri: 'Uzun Seri', ciltNo: 1 }),
        sahteKitap({ ad: 'Seri 6', durum: 'okunacak', seri: 'Uzun Seri', ciltNo: 6 })
      ],
      hedef: {}, hedefSayfa: { [yil]: 7300 }   // günlük pay = 20
    });
    await rafAc(page);
    const r = await page.evaluate(() => {
      const o = window.__bildirim.ozetHesapla();
      return { gunluk: o.gunluk, yarim: o.yarim, gecenYil: o.gecenYil,
        hedef: o.hedef, bag: o.bag, cilt: o.cilt };
    });
    expect(r.gunluk.ad).toBe('Taze Kitap');                  // en son ilerleme kaydedilen
    expect(r.gunluk.sayfa).toBe(50);
    expect(r.gunluk.toplam).toBe(100);
    expect(r.yarim.ad).toBe('Takılı Kitap');                 // en eski gsG (en uzun takılı)
    expect(r.yarim.sonGun).toBe(bugunISO(-12));
    expect(r.gecenYil.gun).toBe(ikiGunSonra);                // en yakın yıldönümü günü
    expect(r.gecenYil.ad).toBe('Yakın Yıldönümü');
    expect(r.gecenYil.yil).toBe(yil - 1);
    expect(r.hedef.hedef).toBe(20);                          // 7300 / 365
    expect(r.hedef.okunan).toBe(15);                         // seans 10 + oturum 5
    expect(r.hedef.geride).toBe(true);
    expect(r.hedef.gun).toBe(bugun);
    expect(r.bag.kavram).toBe('özgürlük');                   // iki farklı kitapta geçen etiket
    expect([r.bag.k1, r.bag.k2].sort()).toEqual(['Takılı Kitap', 'Yakın Yıldönümü']);
    expect(r.cilt.seri).toBe('Uzun Seri');
    expect(r.cilt.gosterilen).toEqual([2, 3, 4]);            // tavan: en fazla 3
    expect(r.cilt.kalan).toBe(1);
  });

  test('v88 parça havuzu: bitmiş+özetli kitaptan kurulur; ontoloji tercih edilir; gösterilmiş parça 90 gün havuza girmez', async ({ page }) => {
    const P1 = 'Roman, geçmişi yeniden yazan bir rejimde hakikatin nasıl eritildiğini anlatır; bu paragraf bandın tam içindedir.';
    const P2 = 'İkinci uygun paragraf da bandın içinde kalır ve havuzda ilk parçadan sonra sıraya girer; içerik gerçek veriden gelir.';
    await tohumla(page, [
      sahteKitap({ id: 'oz1', ad: 'Özetli Kitap', durum: 'bitti' }),
      sahteKitap({ id: 'oz2', ad: 'Ontolojili Kitap', durum: 'bitti' })
    ]);
    await rafAc(page);
    await page.evaluate(async ({ p1, p2 }) => {
      await window.__ozet.hazirBekle();
      await window.__ozet.kaydet('oz1', p1 + '\n\n' + p2);
      await window.__ozet.kaydet('oz2', 'Özet metni de var ama ontoloji tercih edilmeli; bu paragraf da bant içinde kalacak uzunluktadır ve konu dışıdır.');
      await window.__ozet.kaydetOnto('oz2', p2);
    }, { p1: P1, p2: P2 });
    const havuz1 = await page.evaluate(() => window.__bildirim.parcaOzeti());
    expect(havuz1.havuz.length).toBe(3);
    const oz2Parca = havuz1.havuz.find(p => p.k === 'oz2');
    expect(oz2Parca.kay).toBe('o');                          // ontoloji tercih edildi
    const ilk = havuz1.havuz.find(p => p.k === 'oz1');
    expect(ilk.i).toBe(0);
    /* SW'nin yazdığı biçimde geçmişe yaz: oz1'in ilk parçası dün gösterildi. */
    await page.evaluate(({ anahtar, gun }) => new Promise(res => {
      const istek = indexedDB.open('kk_bildirim_v1', 1);
      istek.onupgradeneeded = () => istek.result.createObjectStore('ozet');
      istek.onsuccess = () => {
        const tx = istek.result.transaction('ozet', 'readwrite');
        tx.objectStore('ozet').put([{ a: anahtar, g: gun }], 'parcaGecmis');
        tx.oncomplete = () => res();
      };
    }), { anahtar: 'oz1:m:0', gun: bugunISO(-1) });
    const havuz2 = await page.evaluate(() => window.__bildirim.parcaOzeti());
    expect(havuz2.havuz.map(p => p.k + ':' + p.kay + ':' + p.i)).not.toContain('oz1:m:0');
    /* 91 gün önce gösterilmiş olsaydı pencere dolar, parça geri gelirdi. */
    await page.evaluate(({ anahtar, gun }) => new Promise(res => {
      const istek = indexedDB.open('kk_bildirim_v1', 1);
      istek.onsuccess = () => {
        const tx = istek.result.transaction('ozet', 'readwrite');
        tx.objectStore('ozet').put([{ a: anahtar, g: gun }], 'parcaGecmis');
        tx.oncomplete = () => res();
      };
    }), { anahtar: 'oz1:m:0', gun: bugunISO(-91) });
    const havuz3 = await page.evaluate(() => window.__bildirim.parcaOzeti());
    expect(havuz3.havuz.map(p => p.k + ':' + p.kay + ':' + p.i)).toContain('oz1:m:0');
  });

  test('v88 AYNA: yeni tetik alanları dolu; kapalı tetik aynadan düşer (hiç seçilemez)', async ({ page }) => {
    const bugun = bugunISO(0);
    await tohumla(page, [
      sahteKitap({ id: 'ok1', ad: 'Okunan', durum: 'okunuyor', guncelSayfa: 5,
        gsG: Date.now() - 3 * 86400000 })
    ]);
    await rafAc(page);
    const r = await page.evaluate(() => {
      const B = window.__bildirim;
      const o = B.ozetHesapla();
      const hepsiAcik = {};
      const hepsiKapali = {};
      B.TETIKLER.forEach(t => { hepsiAcik[t] = true; hepsiKapali[t] = false; });
      return { acik: B.aynaOlustur(o, { tetik: hepsiAcik, oneriGun: 0 }),
        kapali: B.aynaOlustur(o, { tetik: hepsiKapali, oneriGun: 0 }) };
    });
    expect(r.acik.gunlukVar).toBe(true);
    expect(r.acik.yarimSonGun).toBe(bugunISO(-3));
    expect(r.kapali.gunlukVar).toBe(false);                  // kapalı → sunucu uyandırmaz
    expect(r.kapali.yarimSonGun).toBe(null);
    expect(r.kapali.parcaVar).toBe(false);
    expect(r.kapali.gecenYilGun).toBe(null);
    expect(r.kapali.bagVar).toBe(false);
    expect(r.kapali.ciltVar).toBe(false);
    expect(r.kapali.hedefGeride).toBe(false);
    expect(r.kapali.hedefGun).toBe(null);
  });

  test('v88 Ayarlar: yeni tetik kapatılınca tercih kalıcı ve ayna alanı düşüyor', async ({ page }) => {
    await hatirlatmaAc(page);
    await tohumla(page, [sahteKitap({ ad: 'Okunan', durum: 'okunuyor', guncelSayfa: 5 })]);
    await rafAc(page);
    await ayarlarAc(page);
    await page.click('#htTetikler [data-v="gunluk"]');       // varsayılan açık → kapat
    await expect(page.locator('#htTetikler [data-v="gunluk"]')).toHaveAttribute('aria-pressed', 'false');
    const ayna = await page.evaluate(() => {
      const B = window.__bildirim;
      return B.aynaOlustur(B.ozetHesapla(), B.ayarYukle());
    });
    expect(ayna.gunlukVar).toBe(false);
    await page.reload();
    await ayarlarAc(page);
    await expect(page.locator('#htTetikler [data-v="gunluk"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('saat seçici 24 seçenek, tercih localStorage\'da kalıcı', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Deneme' })]);
    await rafAc(page);
    await ayarlarAc(page);
    await expect(page.locator('#htSaat option')).toHaveCount(24);
    await expect(page.locator('#htSaat')).toHaveValue('9');   // varsayılan 09:00
    await page.selectOption('#htSaat', '21');
    await page.reload();
    await ayarlarAc(page);
    await expect(page.locator('#htSaat')).toHaveValue('21');
    const a = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_bildirim_v1')));
    expect(a.saat).toBe(21);
  });
});
