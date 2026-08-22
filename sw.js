const CACHE = 'kitaplik-v82';
// OCR paketi kovası (ocr.js yönetir): ~6 MB'lik tesseract paketi kullanıcı
// ONAYIYLA bir kez iner, buraya alınır. ASSETS'e BİLEREK girmez — ilk PWA
// kurulumunda 6 MB indirtmek yanlış olurdu. ocr.js dosyasının kendisi (küçük
// arayüz kodu) ASSETS'te; ocr/ altındaki paket dosyaları DEĞİL.
const OCR_KOVA = 'kk_ocr_paket_v1';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './senkron.js', './barkod.js', './oturum.js', './fikir.js', './katalog.js', './gorunum.js', './kart.js', './zeka.js', './fikirag.js', './rapor.js', './kapak.js', './oneri.js', './kesfet.js', './tekrar.js', './ocr.js', './bildirim.js', './zengin.js', './veri/turler-yerlesik.json', './veri/turkce-adlar-yerlesik.json', './zxing.min.js', './font/cormorant-latin.woff2', './font/cormorant-latin-ext.woff2', './font/lora-latin.woff2', './font/lora-latin-ext.woff2', './font/lora-italik-latin.woff2', './font/lora-italik-latin-ext.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // OCR kovası sürüm temizliğinden MUAF: "k !== CACHE" filtresi onu da
      // silseydi her sw bump'ında kullanıcının onayla indirdiği 6 MB uçardı.
      Promise.all(keys.filter(k => k !== CACHE && k !== OCR_KOVA).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // YALNIZ kendi kökenimiz cache'lenir. Dış kaynaklara (googleapis, firebasedatabase
  // — URL'inde auth token'ı var —, workers.dev, openlibrary, kapak CDN'leri) hiç
  // karışma: tarayıcı doğrudan gitsin, hiçbir şey saklanmasın.
  let ayniKoken = false;
  let yol = '';
  try { const u = new URL(e.request.url); ayniKoken = u.origin === self.location.origin; yol = u.pathname; } catch (h) {}
  if (!ayniKoken) return;

  // OCR paket dosyaları: ÖNCE kova, yoksa ağ. Network-first buraya uygulanmaz —
  // her kullanımda 6 MB'ı yeniden indirirdi; ana kovaya da YAZILMAZ (çift kopya).
  // Kova boşken (indirme onayı verilmemiş ya da paket silinmişken) istek ağa
  // düşer; indirme akışının kendisi de bu daldan geçer ve ocr.js kovaya yazar.
  if (yol.indexOf('/ocr/') !== -1) {
    e.respondWith(
      caches.open(OCR_KOVA).then(c => c.match(e.request)).then(r => r || fetch(e.request))
    );
    return;
  }

  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => {
      if (r) return r;
      // index.html yedeği YALNIZ gezinme isteklerine. Eskiden her cache-miss'e HTML
      // dönüyordu: çevrimdışında kapak istekleri HTML alıp onerror yolunu tetikliyordu.
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 504, statusText: 'Cevrimdisi' });
    }))
  );
});

/* ---------- push bildirimi (bildirim.js ile ortak sözleşme) ----------
   GİZLİLİK: push PAYLOAD'SIZ gelir — sunucu yalnız "uyan" der. Bildirim
   içeriği bildirim.js'in IndexedDB'ye yazdığı özetten üretilir; alıntı
   metni sunucuya hiç gitmediği için burada da ağa hiçbir şey yazılmaz.
   Özet SAYI değil VADE listesi taşır: "bugün kaç alıntı" sayımı push
   ANINDA yapılır — gece yarısı devrinde bayat sayı gösterilmez. */
const BILDIRIM_DB = 'kk_bildirim_v1';
function bildirimOzetOku(anahtar) {
  return new Promise(resolve => {
    let bitti = false;
    const son = v => { if (!bitti) { bitti = true; resolve(v); } };
    try {
      const istek = indexedDB.open(BILDIRIM_DB, 1);
      istek.onupgradeneeded = () => { try { istek.result.createObjectStore('ozet'); } catch (e) {} };
      istek.onsuccess = () => {
        const db = istek.result;
        try {
          const g = db.transaction('ozet', 'readonly').objectStore('ozet').get(anahtar || 'guncel');
          g.onsuccess = () => { son(g.result || null); try { db.close(); } catch (e) {} };
          g.onerror = () => { son(null); try { db.close(); } catch (e) {} };
        } catch (e) { son(null); try { db.close(); } catch (h) {} }
      };
      istek.onerror = () => son(null);
    } catch (e) { son(null); }
  });
}
function bildirimGunIso() {
  const s = new Date();
  return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') +
    '-' + String(s.getDate()).padStart(2, '0');
}
/* ---------- v63: DÖRT TETİK ----------
   ÖNCELİK worker.js'teki ONCELIK dizisiyle BİREBİR aynı olmalı — statik vaka
   kilitler. Nadir olan önce: alıntı kuyruğu çoğu gün dolu olduğu için başa
   konsaydı, günde-1 kuralı yüzünden tempo/öneri HİÇ seçilmezdi (açlık). */
const ONCELIK = ['tempo', 'oneri', 'okuma', 'alinti'];
const OKUMA_ESIK = 7;              // worker.js ile aynı — ölçülerek seçildi

function swGunFarki(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
/* Tetik hazır mı? worker.js'teki tetikHazirMi'nin İKİZİ — girdi AYNADIR
   (sunucuya gönderilen alanlar), taze veri değil. Böylece sunucunun "gönder"
   kararıyla cihazın "ne göstereyim" kararı ayrışamaz. */
function swTetikHazir(t, ayna, bugun) {
  if (!ayna) return false;
  if (t === 'alinti') return !!ayna.vade && ayna.vade <= bugun;
  if (t === 'okuma') {
    if (!ayna.okumaSonGun) return false;
    const g = swGunFarki(ayna.okumaSonGun, bugun);
    return g >= OKUMA_ESIK && g % OKUMA_ESIK === 0;
  }
  if (t === 'oneri') {
    if (!ayna.oneriVar || ayna.oneriGun === null || ayna.oneriGun === undefined) return false;
    return new Date(bugun + 'T00:00:00Z').getUTCDay() === ayna.oneriGun;
  }
  if (t === 'tempo') return !!ayna.tempoGeride && parseInt(bugun.slice(8, 10), 10) === 1;
  return false;
}
/* Metni ÖZETTEN (taze yerel veri) üretir. Ayrıntı yoksa aynı tetiğin YUMUŞAK
   metnine düşer — SESSİZ KALMAZ: userVisibleOnly gereği her push bir bildirim
   göstermek zorunda; göstermezsek Chrome jenerik bildirim basar ve tekrarında
   aboneliği düşürebilir. */
function bildirimIcerik(tetik, ozet, bugun) {
  if (tetik === 'alinti') {
    const sayi = (ozet && Array.isArray(ozet.vadeler))
      ? ozet.vadeler.filter(v => v && v <= bugun).length : 0;
    return { baslik: sayi === 1 ? '1 alıntı seni bekliyor'
        : (sayi ? sayi + ' alıntı seni bekliyor' : 'Tekrar vakti'),
      govde: (ozet && ozet.ornekMetin) || 'Bugünün tekrar kuyruğu hazır.',
      etiket: 'kitaplik-tekrar', hedef: './index.html?sekme=alinti' };
  }
  if (tetik === 'okuma') {
    const o = ozet && ozet.okuma;
    if (!o || !o.ad) return { baslik: 'Yarım kalan kitabın var',
      govde: 'Kaldığın yerden devam etmeye ne dersin?',
      etiket: 'kitaplik-okuma', hedef: './index.html?sekme=raf' };
    const gun = o.sonGun ? swGunFarki(o.sonGun, bugun) : 0;
    const nerede = o.sayfa ? o.sayfa + '. sayfadasın' : 'başlamıştın';
    return { baslik: o.ad,
      govde: nerede + ' — ' + (gun > 0 ? gun + ' gündür ara verdin.' : 'ara verdin.'),
      etiket: 'kitaplik-okuma',
      hedef: o.id ? './index.html?kitap=' + encodeURIComponent(o.id) : './index.html?sekme=raf' };
  }
  if (tetik === 'oneri') {
    const o = ozet && ozet.oneri;
    if (!o || !o.ad) return { baslik: 'Sırada ne var?',
      govde: 'Rafında seni bekleyenlere bak.',
      etiket: 'kitaplik-oneri', hedef: './index.html?sekme=kesfet' };
    return { baslik: 'Bu hafta: ' + o.ad, govde: o.neden || 'Rafında seni bekliyor.',
      etiket: 'kitaplik-oneri', hedef: './index.html?sekme=kesfet' };
  }
  if (tetik === 'tempo') {
    const t = ozet && ozet.tempo;
    if (!t || !t.hedef) return { baslik: 'Yıl hedefin', govde: 'Tempona göz at.',
      etiket: 'kitaplik-tempo', hedef: './index.html?sekme=ist' };
    return { baslik: 'Yıl hedefin geride',
      govde: 'Bu tempoyla yıl sonunda ~' + t.projeksiyon + ' kitap; hedefin ' + t.hedef + '.',
      etiket: 'kitaplik-tempo', hedef: './index.html?sekme=ist' };
  }
  return null;
}
self.addEventListener('push', e => {
  e.waitUntil(Promise.all([bildirimOzetOku('ayna'), bildirimOzetOku('guncel')]).then(([ayna, ozet]) => {
    const bugun = bildirimGunIso();
    /* HANGİ tetik: aynadan (sunucuyla aynı girdi). NE yazılacağı: özetten.
       Ayna yoksa/hiçbir tetik hazır değilse GENEL yedek — sessizlik YOK. */
    const tetik = ONCELIK.find(t => swTetikHazir(t, ayna, bugun));
    const i = tetik ? bildirimIcerik(tetik, ozet, bugun) : null;
    const g = i || { baslik: 'Kitaplığın seni bekliyor',
      govde: 'Bugün için bir hatırlatman var.',
      etiket: 'kitaplik-genel', hedef: './index.html' };
    return self.registration.showNotification(g.baslik, {
      body: g.govde,
      tag: g.etiket,                    // aynı günkü ikinci push üst üste binmez
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { hedef: g.hedef }
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  /* v63: hedef artık bildirimin KENDİSİNDE (data.hedef) — her tetik kendi
     ekranına gider (okuma → kitabın detayı, öneri → Keşfet, tempo → Rakamlar,
     alıntı → Alıntılar). Eski bildirimlerde data olmayabilir: alıntı hedefi
     yedek kalır (geriye uyum). */
  const hedef = (e.notification.data && e.notification.data.hedef) || './index.html?sekme=alinti';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(liste => {
    for (const istemci of liste) {
      let ayni = false;
      try { ayni = new URL(istemci.url).origin === self.location.origin; } catch (h) {}
      if (ayni) {
        /* açık sekme: odakla + sayfaya NEREYE gideceğini söyle. 'tekrar-ac'
           mesajı korunuyor (mevcut vaka + eski SW/sayfa eşleşmesi). */
        istemci.postMessage({ tur: 'bildirim-ac', hedef });
        if (hedef.indexOf('sekme=alinti') !== -1) istemci.postMessage({ tur: 'tekrar-ac' });
        return istemci.focus();
      }
    }
    // kapalıysa derin bağlantı deseniyle aç (?sekme= / ?kitap= boot'ta işlenir)
    return self.clients.openWindow(hedef);
  }));
});
