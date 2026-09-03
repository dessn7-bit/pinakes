/* v94 ADRES TAŞIMA: tek sw.js İKİ adreste yayınlanır (/kitaplik ve /pinakes).
   Önek scope'tan türer — yeni adres 'pinakes-' ile TEMİZ başlar, eski adres
   'kitaplik-' önekini sürdürür (oradaki eski sürüm kovaları activate'te doğru
   silinsin). kk_* depo anahtarları DEĞİŞMEZ (yedek onlara yazar). */
/* location güvenli okunur: test sandbox'ları (g51 swPushKur) sw.js'i location'sız
   ya da pathname'siz sahte self ile değerlendirir — varsayılan 'kitaplik'
   (eski sözleşme; gerçek SW'de location.pathname her zaman var). */
const SW_YOL = String((self.location && self.location.pathname) || '');
const ONEK = SW_YOL.indexOf('/pinakes/') === 0 ? 'pinakes' : 'kitaplik';
const CACHE = ONEK + '-v98';
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
      // OCR kovası sürüm temizliğinden MUAF: silinseydi her sw bump'ında
      // kullanıcının onayla indirdiği 6 MB uçardı. v94: temizlik KENDİ
      // ÖNEK ailesiyle sınırlı — iki adres AYNI origin'de aynı Cache Storage
      // havuzunu paylaşır; öneksiz filtre kardeş adresin kovasını silerdi.
      Promise.all(keys.filter(k => k.indexOf(ONEK + '-') === 0 && k !== CACHE)
        .map(k => caches.delete(k)))
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
  try { const u = new URL(e.request.url); ayniKoken = u.origin === self.location.origin; yol = u.pathname; } catch (h) { /* URL ayrıştırılamadı — sessiz geçiş kasıtlı */ }
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
      // Önbelleğe yazamamak (kota dolu vb.) yanıtı ETKİLEMEMELİ — sessiz geçiş
      // DOĞRU; catch'siz hali yakalanmamış promise reddi bırakıyordu.
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
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
      istek.onupgradeneeded = () => { try { istek.result.createObjectStore('ozet'); } catch (e) { /* mağaza zaten var — sessiz geçiş kasıtlı */ } };
      istek.onsuccess = () => {
        const db = istek.result;
        try {
          const g = db.transaction('ozet', 'readonly').objectStore('ozet').get(anahtar || 'guncel');
          g.onsuccess = () => { son(g.result || null); try { db.close(); } catch (e) { /* zaten kapalı — kasıtlı */ } };
          g.onerror = () => { son(null); try { db.close(); } catch (e) { /* zaten kapalı — kasıtlı */ } };
        } catch (e) { son(null); try { db.close(); } catch (h) { /* zaten kapalı — kasıtlı */ } }
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
/* ---------- v63+v88: ON BİR TETİK ----------
   ÖNCELİK worker.js'teki ONCELIK dizisiyle BİREBİR aynı olmalı — statik vaka
   kilitler. Sıra = KITLIK/kırılganlık: penceresi en dar olan (kaçırılırsa en
   geç dönen) önce — gecenYil yılda 1 gün, tempo/bag/cilt ayda 1 gün, yarim
   10-gün merdiveni, oneri haftada 1, okuma 7-gün merdiveni, hedef aynı-gün
   bayrağı, alinti vadesi geçtikçe BEKLER (kaçsa da kaybolmaz), parca/gunluk
   süreklidir ve dönüşümlü olarak boş günleri doldurur. */
const ONCELIK = ['gecenYil', 'tempo', 'bag', 'cilt', 'yarim', 'oneri', 'okuma', 'hedef', 'alinti', 'parca', 'gunluk'];
const OKUMA_ESIK = 7;              // worker.js ile aynı — ölçülerek seçildi
const YARIM_ESIK = 10;             // worker.js ile aynı — yarım kitap merdiveni
const PARCA_TEKRAR_GUN = 90;       // bildirim.js ile aynı — parça tekrar penceresi

function swGunFarki(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
function swEpochGun(gun) {         // parça/günlük dönüşümü için gün paritesi
  return Math.floor(Date.parse(gun + 'T00:00:00Z') / 86400000);
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
  /* v88 — hepsi saf fonksiyon (alanlar + tarih), durum damgası YOK. */
  if (t === 'gunluk') return !!ayna.gunlukVar;
  if (t === 'yarim') {
    if (!ayna.yarimSonGun) return false;
    const g = swGunFarki(ayna.yarimSonGun, bugun);
    return g >= YARIM_ESIK && g % YARIM_ESIK === 0;
  }
  if (t === 'hedef') return !!ayna.hedefGeride && ayna.hedefGun === bugun;
  if (t === 'gecenYil') return !!ayna.gecenYilGun && ayna.gecenYilGun === bugun;
  /* parca: tek günlerde; okunuyor kitap yoksa (gunluk sessizken) her gün —
     iki sürekli tetik fixed sırayla birbirini boğmasın diye tarihe bağlı nöbet. */
  if (t === 'parca') return !!ayna.parcaVar && (swEpochGun(bugun) % 2 === 1 || !ayna.gunlukVar);
  if (t === 'bag') return !!ayna.bagVar && parseInt(bugun.slice(8, 10), 10) === 8;
  if (t === 'cilt') return !!ayna.ciltVar && parseInt(bugun.slice(8, 10), 10) === 15;
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
  /* ---------- v88 tetik metinleri ---------- */
  if (tetik === 'gunluk') {
    const o = ozet && ozet.gunluk;
    if (!o || !o.ad) return { baslik: 'Bugün birkaç sayfa?',
      govde: 'Okuduğun kitaba dönmeye ne dersin?',
      etiket: 'kitaplik-gunluk', hedef: './index.html?sekme=raf' };
    const yer = o.sayfa
      ? (o.toplam ? o.sayfa + '/' + o.toplam + '. sayfadasın.' : o.sayfa + '. sayfadasın.')
      : 'Henüz başındasın — bugün birkaç sayfa?';
    return { baslik: o.ad, govde: yer, etiket: 'kitaplik-gunluk',
      hedef: o.id ? './index.html?kitap=' + encodeURIComponent(o.id) : './index.html?sekme=raf' };
  }
  if (tetik === 'yarim') {
    const o = ozet && ozet.yarim;
    if (!o || !o.ad || !o.sonGun) return { baslik: 'Yarım kalan kitabın var',
      govde: 'Kaldığın yerden devam etmeye ne dersin?',
      etiket: 'kitaplik-yarim', hedef: './index.html?sekme=raf' };
    const gun = swGunFarki(o.sonGun, bugun);
    return { baslik: o.ad,
      govde: (gun > 0 ? gun + ' gündür ' : '') + (o.sayfa ? o.sayfa + '. sayfadasın.' : 'ilerleme yok.'),
      etiket: 'kitaplik-yarim',
      hedef: o.id ? './index.html?kitap=' + encodeURIComponent(o.id) : './index.html?sekme=raf' };
  }
  if (tetik === 'hedef') {
    const h = ozet && ozet.hedef;
    /* Özet bayat (başka güne ait) ise sayı UYDURULMAZ — yumuşak metin. */
    if (!h || !h.hedef || h.gun !== bugun) return { baslik: 'Günlük sayfa hedefin',
      govde: 'Bugünün payına göz at.',
      etiket: 'kitaplik-hedef', hedef: './index.html?sekme=ist' };
    return { baslik: 'Günlük sayfa hedefin',
      govde: 'Bugün ' + h.okunan + ' sayfa okudun, hedefin ' + h.hedef + '.',
      etiket: 'kitaplik-hedef', hedef: './index.html?sekme=ist' };
  }
  if (tetik === 'gecenYil') {
    const g = ozet && ozet.gecenYil;
    if (!g || !g.ad || g.gun !== bugun) return { baslik: 'Bugünün bir geçmişi var',
      govde: 'Bitirdiğin kitaplara göz at.',
      etiket: 'kitaplik-gecenyil', hedef: './index.html?sekme=raf' };
    const buYil = parseInt(bugun.slice(0, 4), 10);
    const baslik = (buYil - g.yil === 1) ? 'Geçen yıl bugün' : g.yil + ' yılında bugün';
    return { baslik, govde: g.ad + ' kitabını bitirmiştin.',
      etiket: 'kitaplik-gecenyil',
      hedef: g.id ? './index.html?kitap=' + encodeURIComponent(g.id) : './index.html?sekme=raf' };
  }
  if (tetik === 'bag') {
    const b = ozet && ozet.bag;
    if (!b || !b.kavram) return { baslik: 'Fikirlerin arasında bağ var',
      govde: 'Fikir ağına göz at.',
      etiket: 'kitaplik-bag', hedef: './index.html?sekme=alinti' };
    return { baslik: 'İki kitap, bir fikir',
      govde: '"' + b.kavram + '" — ' + b.k1 + ' ile ' + b.k2 + ' bu kavramda buluşuyor.',
      etiket: 'kitaplik-bag', hedef: './index.html?sekme=alinti' };
  }
  if (tetik === 'cilt') {
    const c = ozet && ozet.cilt;
    if (!c || !c.seri || !(c.gosterilen || []).length) return { baslik: 'Serilerinde boşluk var',
      govde: 'Eksik ciltlere göz at.',
      etiket: 'kitaplik-cilt', hedef: './index.html?sekme=raf' };
    /* TAVAN: en fazla 3 cilt yazılır (oneri.js ile aynı karar) — gosterilen
       zaten kırpılmış gelir, kalan sayıyla söylenir. */
    const coklu = c.gosterilen.length > 1;
    return { baslik: c.seri + ' serisi',
      govde: c.gosterilen.join(' ve ') + '. ' + (coklu ? 'ciltleri' : 'cildi') + ' eksik' +
        (c.kalan > 0 ? ' (ve ' + c.kalan + ' cilt daha)' : '') + '.',
      etiket: 'kitaplik-cilt', hedef: './index.html?seri=' + encodeURIComponent(c.seri) };
  }
  return null;
}
/* ---------- v88: parça seçimi + gösterim geçmişi ----------
   Havuz bildirim.js'te kurulur (bitmiş+özetli kitaplardan süzülmüş paragraflar);
   SW gösterim ANINDA geçmişe yazar — aynı parça 90 gün içinde tekrar seçilmez.
   Geçmiş cihaz-yerelidir, sunucuya hiçbir şey gitmez. */
function parcaSec(ozet, gecmis, bugun) {
  const havuz = (ozet && ozet.parca && Array.isArray(ozet.parca.havuz)) ? ozet.parca.havuz : [];
  const taze = (Array.isArray(gecmis) ? gecmis : [])
    .filter(g => g && g.a && g.g && swGunFarki(g.g, bugun) < PARCA_TEKRAR_GUN);
  const yasak = new Set(taze.map(g => g.a));
  const p = havuz.find(x => x && x.ad && x.metin && !yasak.has(x.k + ':' + x.kay + ':' + x.i));
  if (!p) return null;
  taze.push({ a: p.k + ':' + p.kay + ':' + p.i, g: bugun });
  return { icerik: { baslik: p.ad, govde: p.metin, etiket: 'kitaplik-parca',
      hedef: p.k ? './index.html?kitap=' + encodeURIComponent(p.k) : './index.html' },
    gecmis: taze.slice(-400) };   // 90 günlük pencerede fazlası zaten elenir; tavan emniyet
}
function bildirimGecmisYaz(liste) {
  return new Promise(resolve => {
    let bitti = false;
    const son = () => { if (!bitti) { bitti = true; resolve(); } };
    try {
      const istek = indexedDB.open(BILDIRIM_DB, 1);
      istek.onupgradeneeded = () => { try { istek.result.createObjectStore('ozet'); } catch (e) { /* mağaza zaten var — sessiz geçiş kasıtlı */ } };
      istek.onsuccess = () => {
        const db = istek.result;
        try {
          const tx = db.transaction('ozet', 'readwrite');
          tx.objectStore('ozet').put(liste, 'parcaGecmis');
          tx.oncomplete = () => { son(); try { db.close(); } catch (e) { /* zaten kapalı — kasıtlı */ } };
          tx.onerror = () => { son(); try { db.close(); } catch (e) { /* zaten kapalı — kasıtlı */ } };
          tx.onabort = () => { son(); try { db.close(); } catch (e) { /* zaten kapalı — kasıtlı */ } };
        } catch (e) { son(); try { db.close(); } catch (h) { /* zaten kapalı — kasıtlı */ } }
      };
      istek.onerror = () => son();
    } catch (e) { son(); }
  });
}
self.addEventListener('push', e => {
  e.waitUntil(Promise.all([bildirimOzetOku('ayna'), bildirimOzetOku('guncel'),
    bildirimOzetOku('parcaGecmis')]).then(([ayna, ozet, gecmis]) => {
    const bugun = bildirimGunIso();
    /* HANGİ tetik: aynadan (sunucuyla aynı girdi). NE yazılacağı: özetten.
       Ayna yoksa/hiçbir tetik hazır değilse GENEL yedek — sessizlik YOK. */
    const tetik = ONCELIK.find(t => swTetikHazir(t, ayna, bugun));
    let i = null;
    let gecmisYeni = null;
    if (tetik === 'parca') {
      /* v88: parça içeriği geçmişe bakarak seçilir; havuz tükendiyse (hepsi
         90 gün penceresinde gösterilmiş) yumuşak metin — sessizlik yine YOK. */
      const secim = parcaSec(ozet, gecmis, bugun);
      if (secim) { i = secim.icerik; gecmisYeni = secim.gecmis; }
      else i = { baslik: 'Kitaplığından bir satır', govde: 'Özetlerine yeniden göz atmaya ne dersin?',
        etiket: 'kitaplik-parca', hedef: './index.html' };
    } else if (tetik) i = bildirimIcerik(tetik, ozet, bugun);
    const g = i || { baslik: 'Kitaplığın seni bekliyor',
      govde: 'Bugün için bir hatırlatman var.',
      etiket: 'kitaplik-genel', hedef: './index.html' };
    return self.registration.showNotification(g.baslik, {
      body: g.govde,
      tag: g.etiket,                    // aynı günkü ikinci push üst üste binmez
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { hedef: g.hedef }
    }).then(() => {
      /* Geçmiş, bildirim GERÇEKTEN gösterildikten sonra yazılır — gösterilmeyen
         parça yakılmaz. Yazım düşerse bir sonraki push aynı parçayı seçebilir
         (kabul edilen küçük risk; veri kaybı yok). */
      if (gecmisYeni) return bildirimGecmisYaz(gecmisYeni);
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
      try { ayni = new URL(istemci.url).origin === self.location.origin; } catch (h) { /* URL ayrıştırılamadı — sessiz geçiş kasıtlı */ }
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
