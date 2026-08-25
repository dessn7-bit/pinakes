/* kitaplik-bildirim — alıntı tekrarı push hatırlatması worker'ı.
   kitaplik-ara'dan AYRI worker (KARAR): arama proxy'si vatansız + kenar
   önbellekli; bildirim ise KV durumu, cron tetikleyici ve VAPID secret'i
   taşıyor. Ayrı deploy döngüsü arama hattını hiç riske atmaz.

   GİZLİLİK SÖZLEŞMESİ — sunucuya giden verinin TAMAMI:
     abonelik (push endpoint URL + p256dh + auth anahtarları, tarayıcı üretir)
     + saat (0-23) + dilim (IANA) + vade (YYYY-MM-DD, bir sonraki tekrar günü).
   Alıntı METNİ, kitap adı, sayı — HİÇBİRİ gelmez. Push da PAYLOAD'SIZ gider
   ("uyan" sinyali): içerik, cihazdaki service worker'ın IndexedDB özetinden
   üretilir. Payload olmadığı için Web Push şifrelemesi (aes128gcm) hiç yok.

   KV ANAHTAR TASARIMI (KARAR):
     abone:<sha256(endpoint) hex>  → kayıt JSON'u. Endpoint 500+ karakter
       olabilir ve KV anahtarı 512B sınırlı; hash sabit uzunluk + endpoint'in
       kendisi anahtar listelerinde görünmez (log hijyeni). Kayıt içinde
       endpoint zaten duruyor (push atmak için şart).
     gonderim:<hash>:<YYYY-MM-DD yerel gün> → günde-1 işareti, TTL 2 gün
       (kendini temizler; ayrı süpürme işi gerekmez).
     hiz:<ip> → abonelik uçları saatlik sayaç, TTL 1 saat.
     cron:gecmis → son CRON_GECMIS turun ÖZETİ (dönen tampon). v62 TEŞHİS:
       cron'un koşup koşmadığı dışarıdan görülemiyordu; "worker ayakta" ile
       "cron çalışıyor" AYRI şeyler ve ikincisi ölçülemiyordu. Bu kayıt
       yalnız SAYI ve ZAMAN taşır — abonelik, endpoint, alıntı metni ASLA. */
'use strict';

const IZINLI_KOKEN = 'https://dessn7-bit.github.io';
const HIZ_SINIR = 30;             // IP başına saatte istek (abonelik uçları)
const VADE_DESEN = /^\d{4}-\d{2}-\d{2}$/;
const CRON_GECMIS = 24;           // saklanacak tur sayısı (saatlik cron = 1 gün)

/* ---------- v63: DÖRT TETİK ----------
   v61'de tek tetik vardı (alıntı tekrarı) ve kullanıcının hiç alıntısı yoksa
   sistem hiç konuşmuyordu. Üç tetik eklendi. TASARIM SÖZLEŞMESİ:

   1) Her tetiğin HAZIR olup olmadığı, cihazın gönderdiği alanların SAF
      FONKSİYONUDUR. Sunucu ve cihaz aynı girdilerden aynı sonucu bağımsız
      hesaplar — bu yüzden payload'sız push'ta "hangi tetik seçildi" bilgisini
      taşımaya gerek KALMAZ (v61 payload'sız sözleşmesi korunur).
   2) Durum TUTULMAZ. "Son ne zaman gönderildi" damgası yok; sıklık, tarihin
      kendisinden türetilir (merdiven/haftagünü/ayın günü). Göç yok, iki taraf
      ayrışamaz, test deterministik.
   3) Gövde yalnız GÜN ve BAYRAK taşır. Kitap adı, alıntı metni, sayfa numarası
      sunucuya GELMEZ (v61 gizlilik sözleşmesi).

   ÖNCELİK — KITLIK sırası. Naif sıra (alıntı önce) STARVATION üretir: alıntı
   kuyruğu doluyken günde-1 kuralı yüzünden diğerleri HİÇ görünmez. Nadir sinyal
   kaçırılırsa uzun süre geri gelmez; bol sinyal yarın yine dolu olur.
   v88 GENELLEMESİ: sıra = pencere darlığı. gecenYil yılda 1 gün (kaçarsa 1 yıl
   döner), tempo/bag/cilt ayda 1 gün, yarim 10-gün merdiveni, oneri haftada 1,
   okuma 7-gün merdiveni, hedef aynı-gün bayrağı, alinti vadesi BEKLER (kaçsa
   da kaybolmaz — ertesi gün yine hazırdır), parca/gunluk sürekli içerik olarak
   en sonda ve gün paritesiyle dönüşümlü (sabit sırada biri diğerini boğardı).
   sw.js'deki ONCELIK dizisi bununla BİREBİR aynı olmalı (statik vaka kilitler). */
const ONCELIK = ['gecenYil', 'tempo', 'bag', 'cilt', 'yarim', 'oneri', 'okuma', 'hedef', 'alinti', 'parca', 'gunluk'];
/* OKUMA_ESIK — ÖLÇÜLEREK seçildi (kullanıcının 163 tarihli bitişi, 99 ardışık
   boşluk): p25=2, MEDYAN=6, p75=12, p90=32 gün.
     3 gün → normal boşlukların %74'ünde çalar (dırdır)
     5 gün → %63
     7 gün → %47 — medyan TAM KİTAP döngüsünün (6 gün) hemen üstü
    14 gün → %23 (güvenli ama geç; medyan kitap 6 günde bitiyor)
   DÜRÜSTLÜK PAYI: bu bir VEKİL ölçüm (bitiş-bitiş boşluğu). Doğrudan "iki
   ilerleme kaydı arası" ölçülemedi — 242 kitapta 1 seans, 0 oturum kaydı var.
   Bu azlığın kendisi eşiği destekliyor: 7'nin altı, okuma sessizliğini değil
   KAYIT sessizliğini ölçer. */
const OKUMA_ESIK = 7;

function gunFarki(a, b) {         // b - a, tam gün (ISO 'YYYY-MM-DD')
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
/* MERDİVEN: eşik geçtikten sonra HER GÜN değil, eşiğin katlarında hatırlatır
   (3, 6, 9, 12...). 21 günlük sessizlikte 19 yerine 7 bildirim — dırdır olmaz,
   ama unutulmaz da. Durum tutmadan sıklık sınırı sağlar. */
function okumaHazir(sonGun, bugun) {
  if (!sonGun) return false;
  const g = gunFarki(sonGun, bugun);
  return g >= OKUMA_ESIK && g % OKUMA_ESIK === 0;
}
function oneriHazir(kayit, an) {
  if (!kayit.oneriVar || kayit.oneriGun === null || kayit.oneriGun === undefined) return false;
  const haftaGunu = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: kayit.dilim })
    .format(an) + 'T00:00:00Z').getUTCDay();
  return haftaGunu === kayit.oneriGun;
}
/* Ayda TAM 1: ayın 1'i. Durumsuz; kullanıcının saati o gün gelmezse ay atlanır —
   kabul edilen maliyet (tempo aylık bir sinyal, bir ay gecikmesi zarar vermez). */
function tempoHazir(kayit, gun) {
  return !!kayit.tempoGeride && parseInt(gun.slice(8, 10), 10) === 1;
}
/* v88: yarım kitap — okuma merdiveninin 10 günlük eşi (tek kitabın sayfa
   ilerlemesi durmuş; cihaz o kitabın son gsG gününü gönderir). */
const YARIM_ESIK = 10;
function yarimHazir(sonGun, gun) {
  if (!sonGun) return false;
  const g = gunFarki(sonGun, gun);
  return g >= YARIM_ESIK && g % YARIM_ESIK === 0;
}
function epochGun(gun) {          // gün paritesi (parça/günlük nöbeti)
  return Math.floor(Date.parse(gun + 'T00:00:00Z') / 86400000);
}
function tetikHazirMi(tetik, kayit, gun, an) {
  if (tetik === 'alinti') return !!kayit.vade && kayit.vade <= gun;
  if (tetik === 'okuma') return okumaHazir(kayit.okumaSonGun, gun);
  if (tetik === 'oneri') return oneriHazir(kayit, an);
  if (tetik === 'tempo') return tempoHazir(kayit, gun);
  /* v88 — hepsi saf fonksiyon (kayıt alanları + tarih), durum damgası YOK.
     hedefGun/gecenYilGun: bayrağın ait olduğu gün — yalnız O gün ateşlenir,
     bayat bayrak ertesi günlere taşmaz. bag/cilt ayda 1 sabit gün (8/15):
     kalıcı-durum sinyalleri her gün hazır olurdu, aylık yuva dırdırı keser. */
  if (tetik === 'gunluk') return !!kayit.gunlukVar;
  if (tetik === 'yarim') return yarimHazir(kayit.yarimSonGun, gun);
  if (tetik === 'hedef') return !!kayit.hedefGeride && kayit.hedefGun === gun;
  if (tetik === 'gecenYil') return !!kayit.gecenYilGun && kayit.gecenYilGun === gun;
  if (tetik === 'parca') return !!kayit.parcaVar && (epochGun(gun) % 2 === 1 || !kayit.gunlukVar);
  if (tetik === 'bag') return !!kayit.bagVar && parseInt(gun.slice(8, 10), 10) === 8;
  if (tetik === 'cilt') return !!kayit.ciltVar && parseInt(gun.slice(8, 10), 10) === 15;
  return false;
}
/* Gönderilecek tetik (öncelik sırasıyla ilk hazır olan) ya da null. */
function secilenTetik(kayit, gun, an) {
  for (const t of ONCELIK) if (tetikHazirMi(t, kayit, gun, an)) return t;
  return null;
}

function corsBasliklar() {
  return {
    'Access-Control-Allow-Origin': IZINLI_KOKEN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}
function json(veri, durum) {
  return new Response(JSON.stringify(veri), {
    status: durum || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsBasliklar())
  });
}

async function endpointHash(endpoint) {
  const oz = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(oz)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* KV'den JSON kayıt okuma — bozuk kayıt istisna FIRLATMAZ (fırlatsaydı uç 500
   dönerdi ve tek bozuk kayıt teşhissiz kalırdı). Dönüş:
     { ok:true, deger }        kayıt var ve ayrıştı
     { ok:false, yok:true }    kayıt hiç yok
     { ok:false, yok:false }   kayıt var ama JSON değil (bozuk)
   Bozuk kayıt SİLİNMEZ (veri kaybı riski) — çağıran 409 'kayit-bozuk' döner. */
async function kvOku(env, anahtar) {
  const ham = await env.KV.get(anahtar);
  if (ham === null || ham === undefined) return { ok: false, yok: true };
  try { return { ok: true, deger: JSON.parse(ham) }; }
  catch (e) { return { ok: false, yok: false }; }
}

function b64u(buf) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* VAPID JWT — ES256, WebCrypto. Özel anahtar yalnız env.VAPID_OZEL_JWK
   secret'ında yaşar; hiçbir yanıtta/logda görünmez. */
async function vapidJwt(aud, env) {
  let jwk;
  /* Secret bozuksa çökme değil tanımlı hata: pushGonder'ın catch'i bu mesajı
     detay.istisna'ya taşır (/test-push'ta görünür). Anahtarın KENDİSİ mesaja
     ASLA yazılmaz. */
  try { jwk = JSON.parse(env.VAPID_OZEL_JWK); }
  catch (e) { throw new Error('vapid-jwk-bozuk'); }
  const anahtar = await crypto.subtle.importKey('jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = new TextEncoder();
  const bas = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const gov = b64u(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 43200, sub: 'mailto:dessn7@gmail.com'
  })));
  const imza = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
    anahtar, enc.encode(bas + '.' + gov));   // WebCrypto ham r||s döner = JOSE biçimi
  return bas + '.' + gov + '.' + b64u(imza);
}

/* Payload'sız push. Dönüş: 'tamam' | 'olu' (404/410 → kayıt silinmeli)
   | 'geri-cekil' (429) | 'hata'. */
async function pushGonder(abonelik, env, detay) {
  let yanit;
  try {
    const jwt = await vapidJwt(new URL(abonelik.endpoint).origin, env);
    yanit = await fetch(abonelik.endpoint, {
      method: 'POST',
      headers: {
        'TTL': '14400',
        'Urgency': 'normal',
        'Authorization': 'vapid t=' + jwt + ', k=' + env.VAPID_ACIK
      }
    });
  } catch (e) {
    /* v62 teşhis: imzalama/ağ istisnası ile push servisinin RED'i aynı
       'hata' altında toplanıyordu; teşhiste ikisi ayrılmalı. */
    if (detay) { detay.durum = 0; detay.istisna = String(e && e.message || e).slice(0, 120); }
    return 'hata';
  }
  if (detay) detay.durum = yanit.status;
  if (yanit.status === 404 || yanit.status === 410) return 'olu';
  if (yanit.status === 429) return 'geri-cekil';
  if (yanit.status >= 200 && yanit.status < 300) return 'tamam';
  return 'hata';   // durum kodu zaten detay.durum'da — ayrıca loglamak gürültü
}

function yerelSaat(dilim, an) {
  return parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: dilim, hour: 'numeric', hourCycle: 'h23'
  }).format(an), 10);
}
function yerelGun(dilim, an) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: dilim }).format(an); // YYYY-MM-DD
}
function dilimGecerli(dilim) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: dilim }); return true; }
  catch (e) { return false; }
}

/* v63 tetik alanlarının KATI doğrulaması — vade ile aynı sertlikte.
   GİZLİLİK KAPISI: yalnız ISO gün / 0-6 tamsayı / boolean kabul edilir. Bir
   istemci hatası (ya da kötü niyet) kitap adı veya alıntı metni göndermeye
   kalkarsa buradan GEÇEMEZ ve kayda hiç yazılmaz. Bilinmeyen alan da yazılmaz:
   dönen nesne yalnız beyaz listedeki dört alanı taşır.
   Dönüş: {okumaSonGun, oneriGun, oneriVar, tempoGeride, gunlukVar, yarimSonGun,
   hedefGeride, hedefGun, gecenYilGun, parcaVar, bagVar, ciltVar} | null (geçersiz).
   v88 alanları da AYNI iki tipten: ISO gün ya da boolean — metin taşıyabilecek
   alan yine yok. */
const TETIK_GUN_ALANLARI = ['okumaSonGun', 'yarimSonGun', 'hedefGun', 'gecenYilGun'];
const TETIK_BAYRAK_ALANLARI = ['oneriVar', 'tempoGeride', 'gunlukVar', 'hedefGeride', 'parcaVar', 'bagVar', 'ciltVar'];
function tetikAlanlariOku(g) {
  const cikti = { oneriGun: null };
  for (const alan of TETIK_GUN_ALANLARI) {
    cikti[alan] = null;
    if (g[alan] !== undefined && g[alan] !== null) {
      if (typeof g[alan] !== 'string' || !VADE_DESEN.test(g[alan])) return null;
      cikti[alan] = g[alan];
    }
  }
  if (g.oneriGun !== undefined && g.oneriGun !== null) {
    if (typeof g.oneriGun !== 'number' || !Number.isInteger(g.oneriGun)
      || g.oneriGun < 0 || g.oneriGun > 6) return null;
    cikti.oneriGun = g.oneriGun;
  }
  for (const alan of TETIK_BAYRAK_ALANLARI) {
    cikti[alan] = false;
    if (g[alan] !== undefined) {
      if (typeof g[alan] !== 'boolean') return null;
      cikti[alan] = g[alan];
    }
  }
  return cikti;
}

function abonelikGecerli(a) {
  return a && typeof a.endpoint === 'string' && a.endpoint.startsWith('https://')
    && a.endpoint.length < 1024 && a.keys
    && typeof a.keys.p256dh === 'string' && typeof a.keys.auth === 'string';
}

/* ---------- cron teşhis defteri (v62) ----------
   Tek KV anahtarında dönen tampon. Yazım cron turunun SONUNDA bir kez olur
   (tur başına 1 yazma — KV yazma bütçesi için önemli).
   İÇERİK SÖZLEŞMESİ: yalnız sayılar + ISO zaman. Abonelik, endpoint, hash,
   alıntı metni, kitap adı GİRMEZ. */
async function gecmisOku(env) {
  try {
    const ham = await env.KV.get('cron:gecmis');
    const d = ham ? JSON.parse(ham) : [];
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}
async function gecmisYaz(env, ozet) {
  try {
    const d = await gecmisOku(env);
    d.push(ozet);
    while (d.length > CRON_GECMIS) d.shift();
    await env.KV.put('cron:gecmis', JSON.stringify(d));
  } catch (e) { /* teşhis yazımı asıl işi düşürmez */ }
}

async function hizAsimi(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'bilinmiyor';
  const anahtar = 'hiz:' + ip;
  const sayi = parseInt(await env.KV.get(anahtar), 10) || 0;
  if (sayi >= HIZ_SINIR) return true;
  await env.KV.put(anahtar, String(sayi + 1), { expirationTtl: 3600 });
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const koken = request.headers.get('Origin');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsBasliklar() });
    /* Origin başlığı taşıyan (tarayıcı) isteklerde yalnız kendi kökenimiz.
       Origin'siz istek (curl/sunucu) CORS'un konusu değil; uçlar zaten
       kişisel veri döndürmez, yazma uçları gövde doğrulamasından geçer. */
    if (koken && koken !== IZINLI_KOKEN) return json({ hata: 'koken' }, 403);

    /* GENİŞLETİLMİŞ SAĞLIK (v62). "Worker ayakta" ile "cron koşuyor" ayrı
       şeylerdir; eski uç yalnız birincisini söylüyordu ve iki gün süren
       sessiz arıza dışarıdan görülemedi. Dönen her alan SAYI ya da ZAMAN
       DAMGASI — abonelik/endpoint/alıntı metni sızmaz. */
    if (url.pathname === '/saglik') {
      const gecmis = await gecmisOku(env);
      const son = gecmis.length ? gecmis[gecmis.length - 1] : null;
      /* v63: abone sayımının yanında CANLI tetik hazırlığı. "Cron koşuyor ama
         gönderilen 0" durumunda hangi tetiğin dolu/boş olduğunu ölçmek için —
         yalnız SAYI döner, kimin hangi tetiği olduğu değil. */
      let aboneSayisi = 0, bozukKayit = 0, cursor;
      const hazir = {};
      for (const t of ONCELIK) hazir[t] = 0;   // v88: sayaçlar ONCELIK'ten türer
      const an = new Date();
      do {
        const liste = await env.KV.list({ prefix: 'abone:', cursor });
        aboneSayisi += liste.keys.length;
        for (const a of liste.keys) {
          const ham = await env.KV.get(a.name);
          if (ham === null) continue;      // list ile get arasında silinmiş
          try {
            const k = JSON.parse(ham);
            const gun = yerelGun(k.dilim, an);
            for (const t of ONCELIK) if (tetikHazirMi(t, k, gun, an)) hazir[t]++;
          } catch (e) { bozukKayit++; }    // bozuk kayıt sayımı düşürmez; v87: SAYILIR (cron silmiyor, görünürlük burası)
        }
        cursor = liste.list_complete ? null : liste.cursor;
      } while (cursor);
      const simdi = Date.now();
      const yanit = {
        durum: 'calisiyor',
        aboneSayisi,
        hazirTetikler: hazir,       // v63: su an hangi tetik kac abonede dolu
        oncelik: ONCELIK,           // sw.js ile ayni olmali (statik vaka kilitler)
        cronTanimli: true,          // wrangler.toml [triggers] crons
        sonCron: son,               // null = cron HİÇ koşmamış (ya da tampon boş)
        sonCronDkOnce: son ? Math.round((simdi - Date.parse(son.zaman)) / 60000) : null,
        turSayisi: gecmis.length
      };
      /* v87: cron bozuk kaydı artık silmediği için tek görünürlük noktası.
         Sıfırken alan HİÇ yazılmaz — gürültü olmasın. Yine yalnız SAYI döner. */
      if (bozukKayit) yanit.bozukKayit = bozukKayit;
      return json(yanit);
    }

    if (url.pathname === '/cron-gecmis') {
      return json({ turler: await gecmisOku(env) });
    }

    if (url.pathname === '/abone-durum' && request.method === 'GET') {
      const endpoint = url.searchParams.get('endpoint') || '';
      if (!endpoint.startsWith('https://')) return json({ hata: 'endpoint' }, 400);
      const dHash = await endpointHash(endpoint);
      const kayit = await kvOku(env, 'abone:' + dHash);
      if (kayit.yok) return json({ kayitli: false });
      if (!kayit.ok) {
        /* Log'a endpoint'in KENDİSİ değil hash'i yazılır (log hijyeni). */
        console.warn('bozuk abone kaydi: ' + dHash);
        return json({ hata: 'kayit-bozuk' }, 409);
      }
      const k = kayit.deger;
      /* v62: kullanıcıya görünür durum için olusturma + sonGonderim de döner.
         Hepsi kendi kaydının meta verisi; başka abonenin bilgisi sızmaz. */
      return json({ kayitli: true, saat: k.saat, dilim: k.dilim, vade: k.vade,
        olusturma: k.olusturma || null,
        sonGonderim: await env.KV.get('sonGonderim') });
    }

    if (request.method !== 'POST') return json({ hata: 'yontem' }, 405);
    if (await hizAsimi(request, env)) return json({ hata: 'hiz' }, 429);

    let govde;
    try { govde = await request.json(); } catch (e) { return json({ hata: 'govde' }, 400); }

    if (url.pathname === '/abone') {
      if (!abonelikGecerli(govde.abonelik)) return json({ hata: 'abonelik' }, 400);
      const saat = parseInt(govde.saat, 10);
      if (!(saat >= 0 && saat <= 23)) return json({ hata: 'saat' }, 400);
      if (typeof govde.dilim !== 'string' || !dilimGecerli(govde.dilim)) return json({ hata: 'dilim' }, 400);
      if (govde.vade !== null && !VADE_DESEN.test(govde.vade || '')) return json({ hata: 'vade' }, 400);
      const tetikler = tetikAlanlariOku(govde);
      if (tetikler === null) return json({ hata: 'tetik' }, 400);
      const anahtar = 'abone:' + await endpointHash(govde.abonelik.endpoint);
      await env.KV.put(anahtar, JSON.stringify(Object.assign({
        abonelik: { endpoint: govde.abonelik.endpoint,
          keys: { p256dh: govde.abonelik.keys.p256dh, auth: govde.abonelik.keys.auth } },
        saat, dilim: govde.dilim, vade: govde.vade || null,
        olusturma: new Date().toISOString()
      }, tetikler)));
      return json({ tamam: true });
    }

    if (url.pathname === '/abone-guncelle') {
      if (typeof govde.endpoint !== 'string') return json({ hata: 'endpoint' }, 400);
      const gHash = await endpointHash(govde.endpoint);
      const anahtar = 'abone:' + gHash;
      const eski = await kvOku(env, anahtar);
      if (eski.yok) return json({ hata: 'kayit-yok' }, 404);
      if (!eski.ok) {
        console.warn('bozuk abone kaydi: ' + gHash);
        return json({ hata: 'kayit-bozuk' }, 409);
      }
      const k = eski.deger;
      if (govde.saat !== undefined) {
        const saat = parseInt(govde.saat, 10);
        if (!(saat >= 0 && saat <= 23)) return json({ hata: 'saat' }, 400);
        k.saat = saat;
      }
      if (govde.dilim !== undefined) {
        if (typeof govde.dilim !== 'string' || !dilimGecerli(govde.dilim)) return json({ hata: 'dilim' }, 400);
        k.dilim = govde.dilim;
      }
      if (govde.vade !== undefined) {
        if (govde.vade !== null && !VADE_DESEN.test(govde.vade || '')) return json({ hata: 'vade' }, 400);
        k.vade = govde.vade;
      }
      /* v63: tetik alanları da güncellenebilir. GÖÇ: eski kayıtta bu alanlar
         YOKTUR; okuyucu tarafta null/false gibi davranırlar (secilenTetik
         hepsini "hazır değil" sayar) — yani eski abone yalnız alıntı tetiğiyle
         çalışmaya devam eder, sessizce YANLIŞ bildirim ALMAZ. Güvenli yön:
         bilinmeyen = kapalı. */
      const yeniTetik = tetikAlanlariOku(govde);
      if (yeniTetik === null) return json({ hata: 'tetik' }, 400);
      /* Yalnız gövdede GELEN alan yazılır: eski (v63) istemcinin kısmi
         güncellemesi yeni (v88) alanları SİLEMEZ — bilinmeyen alan korunur. */
      for (const alan of TETIK_GUN_ALANLARI.concat(['oneriGun'], TETIK_BAYRAK_ALANLARI))
        if (govde[alan] !== undefined) k[alan] = yeniTetik[alan];
      await env.KV.put(anahtar, JSON.stringify(k));
      return json({ tamam: true });
    }

    /* TEST PUSH (v62): VAPID/JWT zincirini ve push servisinin yanıtını
       ÖLÇÜLEBİLİR kılar — "gelmedi" şikâyetinde imzalama mı, abonelik mi,
       yoksa hiç gönderilmemiş mi olduğunu ayırır. Yalnız KAYITLI bir
       endpoint için çalışır (kendi aboneliğini bilen tetikleyebilir),
       vade/saat koşullarını ATLAR ve günlük işareti YAZMAZ (gerçek
       hatırlatmayı tüketmesin). */
    if (url.pathname === '/test-push') {
      if (typeof govde.endpoint !== 'string') return json({ hata: 'endpoint' }, 400);
      const tHash = await endpointHash(govde.endpoint);
      const anahtar = 'abone:' + tHash;
      const ham = await kvOku(env, anahtar);
      if (ham.yok) return json({ hata: 'kayit-yok' }, 404);
      if (!ham.ok) {
        console.warn('bozuk abone kaydi: ' + tHash);
        return json({ hata: 'kayit-bozuk' }, 409);
      }
      const detay = {};
      const sonuc = await pushGonder(ham.deger.abonelik, env, detay);
      if (sonuc === 'olu') await env.KV.delete(anahtar);
      return json({ sonuc, durum: detay.durum, istisna: detay.istisna || null });
    }

    if (url.pathname === '/abone-sil') {
      if (typeof govde.endpoint !== 'string') return json({ hata: 'endpoint' }, 400);
      await env.KV.delete('abone:' + await endpointHash(govde.endpoint));
      return json({ tamam: true });
    }

    return json({ hata: 'yol' }, 404);
  },

  /* Saatte bir: yerel saati tercihine denk gelen VE vadesi bugün/geçmiş
     olan abonelere payload'sız "uyan" sinyali. Günde EN FAZLA 1 (işaret). */
  async scheduled(olay, env, ctx) {
    /* `this.gonderTuru` DEĞİL: modül düzeyi fonksiyon. Handler'ın `this`'e
       bağlı çağrılacağı garanti değildir (destructure eden bir çağrı yolu
       sessizce TypeError verir ve cron hiç koşmaz — teşhis ucu olmadan
       görülemeyen tam da bu sınıf arıza). */
    ctx.waitUntil(gonderTuru(env, new Date()));
  },

  gonderTuru,
  /* v88: ayna tutarlılık vakası için dışa açık — sw.js'teki swTetikHazir ile
     AYNI girdide AYNI sonucu verdiği testle kilitlenir. */
  tetikHazirMi,
  ONCELIK
};

async function gonderTuru(env, an) {
  /* Teşhis sayaçları: her atlamanın SEBEBİ ayrı sayılır. "0 gönderildi"
     tek başına arıza mı doğru davranış mı söylemiyordu — sebep dağılımı
     söylüyor (v62). */
  const o = {
    zaman: new Date(an).toISOString(),
    taranan: 0, gonderilen: 0,
    atlananSaat: 0,      // yerel saat tercihe denk gelmedi (normal, en sık)
    atlananVadeYok: 0,   // HİÇBİR tetik hazır değil (v63: eskiden yalnız alıntı vadesiydi)
    atlananVadeIleri: 0, // (v62 uyumu) — v63'te atlananVadeYok altında toplanır
    atlananGunluk: 0,    // bugün zaten gönderilmiş
    hataOlu: 0,          // 404/410 → kayıt silindi
    hataGeriCekil: 0,    // 429
    hataDiger: 0,
    bozukKayit: 0
  };
  /* v63 teşhis: hangi tetik seçildi? "0 gönderildi" tek başına arızayı doğru
     davranıştan ayırmıyordu; tetik dağılımı ayırıyor. v88: sayaçlar ONCELIK'ten
     türer — elle yazılan liste yeni tetikte unutulup NaN üretirdi. */
  for (const t of ONCELIK) o['secim' + t.charAt(0).toUpperCase() + t.slice(1)] = 0;
  try {
    let cursor;
    do {
      const liste = await env.KV.list({ prefix: 'abone:', cursor });
      for (const anahtar of liste.keys) {
        o.taranan++;
        const ham = await env.KV.get(anahtar.name);
        if (!ham) continue;
        let kayit;
        /* v87 KARAR: bozuk (JSON ayrışmayan) kayıt cron'da da SİLİNMEZ —
           uçlarla (v85, 409 'kayit-bozuk') aynı davranış. Silinen kayıt geri
           gelmez; duran kayıt /saglik'taki bozukKayit sayısında görünür ve
           elle incelenebilir. Log da YOK: sayaç yeter, saatlik cron'da satır
           basmak gürültü olur. 404/410 ölü-abonelik silmesi AYRI yol — o
           gerçekten ölü aboneliktir, silinmesi doğrudur (aşağıda, DEĞİŞMEDİ). */
        try { kayit = JSON.parse(ham); }
        catch (e) { o.bozukKayit++; continue; }
        let saat, gun;
        try { saat = yerelSaat(kayit.dilim, an); gun = yerelGun(kayit.dilim, an); }
        catch (e) { o.bozukKayit++; continue; }
        if (saat !== kayit.saat) { o.atlananSaat++; continue; }
        /* v63: dört tetikten HİÇBİRİ hazır değilse gönderme (v61 kararının
           genellemesi — "gönderecek şey yoksa sessiz kal"). */
        const tetik = secilenTetik(kayit, gun, an);
        if (!tetik) { o.atlananVadeYok++; continue; }
        const isaret = 'gonderim:' + anahtar.name.slice(6) + ':' + gun;
        if (await env.KV.get(isaret)) { o.atlananGunluk++; continue; }
        const sonuc = await pushGonder(kayit.abonelik, env);
        if (sonuc === 'olu') { o.hataOlu++; await env.KV.delete(anahtar.name); continue; }
        if (sonuc === 'geri-cekil') { o.hataGeriCekil++; continue; }  // işaret YOK → sonraki saat yeniden dener
        if (sonuc === 'tamam') {
          o.gonderilen++;
          o['secim' + tetik.charAt(0).toUpperCase() + tetik.slice(1)]++;
          await env.KV.put(isaret, '1', { expirationTtl: 172800 });
          await env.KV.put('sonGonderim', new Date(an).toISOString());
        } else { o.hataDiger++; }
      }
      cursor = liste.list_complete ? null : liste.cursor;
    } while (cursor);
  } catch (e) {
    o.turHatasi = String(e && e.message || e).slice(0, 120);
  }
  await gecmisYaz(env, o);
  return o;
}
