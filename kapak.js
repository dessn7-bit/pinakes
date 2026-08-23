'use strict';
/* Kitaplık — kendi kapak fotoğrafı eklentisi (ad alanı: kp-)
   Veritabanında bulunmayan (ISBN'siz/eski baskı) kitaplar için kullanıcının
   telefonla çektiği kapak fotoğrafını saklar ve gösterir.

   MİMARİ KARARLAR:
   - Fotoğraflar IndexedDB'de (kk_kapak_v1), localStorage'a ASLA yazılmaz:
     mobil localStorage kotası ~5MB ve kütüphane + senkron parmak izleri orada.
   - Fotoğraflar SENKRONA GİRMEZ: senkron her PUT'ta tüm kütüphaneyi tek JSON
     gövdesinde gönderiyor; ikili veri girse hem kota hem hız çökerdi. Kitap
     kaydında yalnız kapakYerel:true işareti durur (o senkronlanır — birleşmede
     kaybolmasın diye). Fotoğrafın kendisi CİHAZ YERELİDİR; UI bunu açıkça söyler.
   - Gösterim önceliği: yerel fotoğraf > uzak kapak URL'si > sırt görseli.
     Gerekçe: kullanıcının kendi çektiği görsel elindeki BASKIYI gösterir,
     uzak URL çoğu zaman başka baskının kapağıdır; sırt en son çare.
   - İşleme: en uzun kenar ≤600px, JPEG, hedef ≤60KB (kalite 0.75→0.6→0.5,
     yetmezse 480px'e inilir). Yeniden kodlama EXIF'i (GPS dahil) da söker.
   - Tembel yükleme: IntersectionObserver ile yalnız görünür/yaklaşan kartlar
     IndexedDB'den okunur; objectURL'ler LRU önbellekte (sınır aşınca revoke). */
(function(){
  const DB_AD = 'kk_kapak_v1';
  const MAGAZA = 'kapaklar';
  const HEDEF_BAYT = 60 * 1024;
  const URL_SINIR = 150;
  const BOS_KAYNAK = 'data:,x'; // görsel değil → error olayı → bağlamın kendi yedeği (sırt/sakla) devralır

  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function kitapBulK(id){
    return (typeof veri === 'object' && Array.isArray(veri.kitaplar))
      ? veri.kitaplar.find(k => k.id === id) : null;
  }
  function tumunuCiz(){
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    if(typeof durum === 'object' && durum.detayId && typeof detayAc === 'function') detayAc(durum.detayId);
  }

  /* ---------- IndexedDB katmanı ---------- */
  let dbSoz = null;
  function dbAc(){
    if(dbSoz) return dbSoz;
    dbSoz = new Promise((cozul, kir) => {
      if(!window.indexedDB){ kir(new Error('indexedDB yok')); return; }
      let istek;
      try{ istek = indexedDB.open(DB_AD, 1); }
      catch(e){ kir(e); return; }
      istek.onupgradeneeded = () => { istek.result.createObjectStore(MAGAZA); };
      istek.onsuccess = () => {
        const db = istek.result;
        // Tarayıcı bağlantıyı arkadan kapatabilir (iOS uzun oturum, veri temizliği):
        // önbelleklenmiş ölü bağlantı her işlemi sonsuza dek düşürürdü. Taze aç.
        db.onclose = () => { dbSoz = null; };
        db.onversionchange = () => { try{ db.close(); }catch(e){} dbSoz = null; };
        cozul(db);
      };
      istek.onerror = () => kir(istek.error || new Error('açılamadı'));
    });
    // açılış hatası kalıcı sayılmasın: sonraki deneme taze başlar
    dbSoz.catch(() => { dbSoz = null; });
    return dbSoz;
  }
  function islem(mod, gorev, tekrar){
    return dbAc().then(db => new Promise((cozul, kir) => {
      let sonuc;
      let tx;
      try{ tx = db.transaction(MAGAZA, mod); sonuc = gorev(tx.objectStore(MAGAZA)); }
      catch(e){
        // onclose gelmeden ölen bağlantı: senkron InvalidStateError fırlatır.
        // Önbelleği düşür, BİR kez taze bağlantıyla dene (put/get/delete idempotent).
        if(!tekrar){ dbSoz = null; cozul(islem(mod, gorev, true)); return; }
        kir(e); return;
      }
      tx.oncomplete = () => cozul(sonuc ? sonuc.result : undefined);
      tx.onerror = () => kir(tx.error || new Error('işlem hatası'));
      tx.onabort = () => kir(tx.error || new Error('işlem iptal'));
    }));
  }
  const blobYaz = (id, blob) => islem('readwrite', st => st.put(blob, String(id)));
  const blobOku = id => islem('readonly', st => st.get(String(id)));
  const blobSil = id => islem('readwrite', st => st.delete(String(id)));
  const blobTemizle = () => islem('readwrite', st => st.clear());
  const blobAnahtarlar = () => islem('readonly', st => st.getAllKeys());
  const blobHepsi = () => islem('readonly', st => st.getAll());

  /* ---------- objectURL LRU önbelleği ---------- */
  const urlOnbellek = new Map(); // id -> objectURL (Map ekleme sırası = LRU)
  function urlKoy(id, url){
    urlDus(id);
    urlOnbellek.set(id, url);
    if(urlOnbellek.size > URL_SINIR){
      const eski = urlOnbellek.keys().next().value;
      URL.revokeObjectURL(urlOnbellek.get(eski));
      urlOnbellek.delete(eski);
    }
  }
  function urlTazele(id){
    if(!urlOnbellek.has(id)) return null;
    const u = urlOnbellek.get(id);
    urlOnbellek.delete(id); urlOnbellek.set(id, u); // sona taşı
    return u;
  }
  function urlDus(id){
    if(urlOnbellek.has(id)){
      URL.revokeObjectURL(urlOnbellek.get(id));
      urlOnbellek.delete(id);
    }
  }

  /* ---------- görsel işleme ---------- */
  function gorselYukle(dosya){
    return new Promise((cozul, kir) => {
      const u = URL.createObjectURL(dosya);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); cozul(im); };
      im.onerror = () => { URL.revokeObjectURL(u); kir(new Error('görsel çözülemedi')); };
      im.src = u;
    });
  }
  function ciz(kaynak, maxKenar, kalite){
    const gw = kaynak.width || kaynak.naturalWidth;
    const gh = kaynak.height || kaynak.naturalHeight;
    const olcek = Math.min(1, maxKenar / Math.max(gw, gh));
    const w = Math.max(1, Math.round(gw * olcek));
    const h = Math.max(1, Math.round(gh * olcek));
    const tuval = document.createElement('canvas');
    tuval.width = w; tuval.height = h;
    tuval.getContext('2d').drawImage(kaynak, 0, 0, w, h);
    return new Promise(cozul => tuval.toBlob(b => cozul(b && { blob: b, en: w, boy: h }), 'image/jpeg', kalite));
  }
  async function islet(dosya){
    let kaynak;
    /* EXIF yönelimi: createImageBitmap 'from-image' destekliyorsa fotoğraf dik gelir;
       desteklemeyen eski tarayıcıda <img> yoluna düşülür (modern motorlar <img>
       kodlarken de EXIF'i uygular — Chrome 81+/Safari/Firefox). */
    try{ kaynak = await createImageBitmap(dosya, { imageOrientation: 'from-image' }); }
    catch(e){ kaynak = await gorselYukle(dosya); }
    let son = null;
    for(const kenar of [600, 480]){
      for(const kalite of [0.75, 0.6, 0.5]){
        const s = await ciz(kaynak, kenar, kalite);
        if(!s) continue;
        son = s;
        if(s.blob.size <= HEDEF_BAYT){
          if(kaynak.close) kaynak.close();
          return s;
        }
      }
    }
    if(kaynak.close) kaynak.close();
    if(!son) throw new Error('görsel kodlanamadı');
    return son; // 480px q0.5'te bile hedefi aşan (ör. saf gürültü) son hali kabul edilir
  }

  /* ---------- gösterim: tembel doldurma ---------- */
  let gozcu = null;
  function gozcuKur(){
    if(gozcu || !('IntersectionObserver' in window)) return;
    gozcu = new IntersectionObserver(girisler => {
      girisler.forEach(g => {
        if(!g.isIntersecting) return;
        gozcu.unobserve(g.target);
        imgDoldur(g.target);
      });
    }, { rootMargin: '300px' });
  }
  /* Aynı id için TEK uçuş: iki img (liste kartı + detay) aynı anda dolarken
     ikinci createObjectURL birincinin URL'sini yükleme bitmeden revoke edip
     kartı sırta düşürüyordu — ikisi de aynı sözü bekler, aynı URL'yi alır. */
  const yukSozleri = new Map(); // id -> Promise<objectURL|null>
  function urlGetir(id){
    if(urlOnbellek.has(id)) return Promise.resolve(urlTazele(id));
    if(yukSozleri.has(id)) return yukSozleri.get(id);
    const soz = blobOku(id).then(blob => {
      yukSozleri.delete(id);
      if(!(blob instanceof Blob)) return null;
      const u = URL.createObjectURL(blob);
      urlKoy(id, u);
      return u;
    }).catch(() => { yukSozleri.delete(id); return null; });
    yukSozleri.set(id, soz);
    return soz;
  }
  async function imgDoldur(img){
    if(!img.isConnected || img.dataset.kpDolu) return;
    img.dataset.kpDolu = '1';
    const u = await urlGetir(img.dataset.kpId);
    if(u){
      img.src = u;
      img.classList.remove('kp-bekliyor');
      return;
    }
    // yerel fotoğraf yok/okunamadı → uzak kapak → o da yoksa error tetikle (sırt/sakla)
    img.src = img.dataset.kpYedek || BOS_KAYNAK;
  }
  function tara(){
    document.querySelectorAll('img[data-kp-id]:not([data-kp-islendi])').forEach(img => {
      img.dataset.kpIslendi = '1';
      const sicak = urlTazele(img.dataset.kpId);
      if(sicak){ img.dataset.kpDolu = '1'; img.src = sicak; img.classList.remove('kp-bekliyor'); return; }
      if(gozcu) gozcu.observe(img);
      else imgDoldur(img);
    });
  }
  let taraPlanli = null;
  function taraPlanla(){
    if(taraPlanli) return;
    taraPlanli = setTimeout(() => { taraPlanli = null; tara(); }, 30);
  }

  /* ---------- çekme/onay akışı ---------- */
  let secim = null;       // { mod:'form'|'detay', id, sonuc:{blob,en,boy}, onizleUrl }
  let formBekleyen = null; // { foto: {blob,en,boy} } | { kaldir:true } | null

  function ortuAc(){
    const o = document.getElementById('ortuKapak');
    if(!o || !secim || !secim.sonuc) return;
    const img = document.getElementById('kpOnizle');
    if(secim.onizleUrl) URL.revokeObjectURL(secim.onizleUrl);
    secim.onizleUrl = URL.createObjectURL(secim.sonuc.blob);
    img.src = secim.onizleUrl;
    document.getElementById('kpBilgi').textContent =
      secim.sonuc.en + '×' + secim.sonuc.boy + ' px · ' + Math.round(secim.sonuc.blob.size / 1024) + ' KB';
    o.classList.add('acik');
    if(typeof ortuAriaKur === 'function') ortuAriaKur(o);
  }
  function ortuKapat(){
    const o = document.getElementById('ortuKapak');
    if(o) o.classList.remove('acik');
    if(secim && secim.onizleUrl) URL.revokeObjectURL(secim.onizleUrl);
    secim = null;
  }
  async function dosyaSecildi(dosya){
    if(!dosya || !secim) return;
    try{
      secim.sonuc = await islet(dosya);
      ortuAc();
    }catch(e){
      bildir('Fotoğraf işlenemedi — başka bir görsel dene');
      secim = null;
    }
  }
  async function onayla(){
    if(!secim || !secim.sonuc) { ortuKapat(); return; }
    const s = secim;
    if(s.mod === 'form'){
      formBekleyen = { foto: s.sonuc };
      ortuKapat();
      formDurumTazele();
      return;
    }
    // detay: hemen kalıcılaştır
    try{
      await blobYaz(s.id, s.sonuc.blob);
    }catch(e){
      ortuKapat();
      bildir('Fotoğraf kaydedilemedi — cihaz depolama alanını kontrol et');
      return;
    }
    const k = kitapBulK(s.id);
    if(k && !k.kapakYerel){ k.kapakYerel = true; if(typeof depoKaydet === 'function') depoKaydet(); }
    urlDus(s.id); // bayat kopya varsa düşür; görünüm taze bloba gitsin
    ortuKapat();
    tumunuCiz();
    istatistikTazele();
    bildir('Kapak fotoğrafı kaydedildi (yalnız bu cihazda)');
  }

  /* form durum şeridi: bekleyen fotoğraf / mevcut yerel kapak / kaldırma niyeti.
     "Fotoğrafı var" ve Kaldır YALNIZ blob bu cihazda gerçekten varsa gösterilir:
     kapakYerel işareti senkronla gelir ama fotoğraf gelmez — ikinci cihazda
     Kaldır sunmak, ilk cihazdaki fotoğrafın işaretini uzaktan söndürürdü. */
  let formYerelVar = false;
  function formDurumTazele(){
    const kutu = document.getElementById('kpFormDurum');
    if(!kutu) return;
    let metin = null;
    if(formBekleyen && formBekleyen.foto)
      metin = 'Fotoğraf hazır — kitapla birlikte kaydedilecek (yalnız bu cihazda)';
    else if(formBekleyen && formBekleyen.kaldir)
      metin = 'Kapak fotoğrafı kaydedince kaldırılacak';
    else if(formYerelVar)
      metin = 'Bu kitabın kendi kapak fotoğrafı var (yalnız bu cihazda)';
    if(metin){
      kutu.style.display = 'flex';
      kutu.innerHTML = '<span></span><button type="button" class="kp-kucuk-btn" data-act="kp-form-kaldir">Kaldır</button>';
      kutu.querySelector('span').textContent = metin;
    }else{
      kutu.style.display = 'none';
      kutu.innerHTML = '';
    }
  }
  function formAcildi(){
    formBekleyen = null;
    formYerelVar = false;
    formDurumTazele();
    const id = (typeof durum === 'object' && durum.formDuzenId) || null;
    if(!id) return;
    const k = kitapBulK(id);
    if(!k || !k.kapakYerel) return;
    blobOku(id).then(b => {
      // form hâlâ aynı kitapta mı? (yavaş IDB sırasında kapatılmış olabilir)
      if(b instanceof Blob && typeof durum === 'object' && durum.formDuzenId === id){
        formYerelVar = true;
        formDurumTazele();
      }
    }).catch(() => {});
  }
  async function formKaydedildi(id){
    if(!formBekleyen || !id) { formBekleyen = null; return; }
    const b = formBekleyen;
    formBekleyen = null;
    try{
      // Kitap araması await'lerden SONRA: bekleme sırasında senkron veri.kitaplar'ı
      // yeni dizi ile değiştirebilir; erken alınan referans ölü nesneye yazardı.
      if(b.foto){
        await blobYaz(id, b.foto.blob);
        const k = kitapBulK(id);
        if(k && !k.kapakYerel){ k.kapakYerel = true; if(typeof depoKaydet === 'function') depoKaydet(); }
        urlDus(id);
      }else if(b.kaldir){
        await blobSil(id);
        const k = kitapBulK(id);
        if(k && k.kapakYerel){ k.kapakYerel = false; if(typeof depoKaydet === 'function') depoKaydet(); }
        urlDus(id);
      }
    }catch(e){
      bildir('Fotoğraf kaydedilemedi — cihaz depolama alanını kontrol et');
      return;
    }
    tumunuCiz();
    istatistikTazele();
  }

  /* ---------- silme kancaları (kitap silinince fotoğraf yetim kalmasın) ---------- */
  function sil(id){
    urlDus(id);
    return blobSil(id)
      .then(() => istatistikTazele())
      .catch(() => {}); // kitap silme başarılı; blob yetim kalırsa süpürücü toplar
  }
  function hepsiniSil(sessiz){
    urlOnbellek.forEach(u => URL.revokeObjectURL(u));
    urlOnbellek.clear();
    return blobTemizle().then(() => {
      let degisti = false;
      if(typeof veri === 'object' && Array.isArray(veri.kitaplar))
        veri.kitaplar.forEach(k => { if(k.kapakYerel){ k.kapakYerel = false; degisti = true; } });
      if(degisti && typeof depoKaydet === 'function') depoKaydet();
      if(degisti) tumunuCiz();
      istatistikTazele();
      if(!sessiz) bildir('Tüm kapak fotoğrafları silindi');
    }).catch(() => { if(!sessiz) bildir('Fotoğraflar silinemedi — depo açılamıyor'); });
  }
  /* Süpürücü: kütüphanede artık olmayan kitapların bloblarını temizler
     (senkronla gelen silmeler buradaki kancalardan geçmez). Kütüphane BOŞKEN
     çalışmaz: localStorage silinmiş ama senkron birazdan kitapları geri
     getirecekse fotoğrafları yakmayalım. */
  function yetimTemizle(){
    if(typeof veri !== 'object' || !Array.isArray(veri.kitaplar) || !veri.kitaplar.length) return;
    const canli = new Set(veri.kitaplar.map(k => String(k.id)));
    blobAnahtarlar().then(anahtarlar => {
      (anahtarlar || []).forEach(a => { if(!canli.has(String(a))) blobSil(a).catch(() => {}); });
    }).catch(() => {});
  }

  /* ---------- yedek sekmesi: sayaç + MB + cihaz deposu ---------- */
  function istatistikTazele(){
    const kutu = document.getElementById('kpDepoBilgi');
    if(!kutu) return;
    blobHepsi().then(bloblar => {
      const n = (bloblar || []).length;
      const bayt = (bloblar || []).reduce((t, b) => t + (b && b.size || 0), 0);
      let metin = n + ' fotoğraf · ' + (bayt / (1024 * 1024)).toFixed(2) + ' MB';
      if(navigator.storage && navigator.storage.estimate){
        navigator.storage.estimate().then(t => {
          if(t && t.quota){
            metin += ' · cihaz deposu: %' + Math.round((t.usage || 0) / t.quota * 100) +
              ' dolu (' + Math.round(t.quota / (1024 * 1024 * 1024) * 10) / 10 + ' GB sınır)';
          }
          kutu.textContent = metin;
        }).catch(() => { kutu.textContent = metin + ' · cihaz deposu: hesaplanamadı'; });
      }else kutu.textContent = metin;
    }).catch(() => { kutu.textContent = 'Fotoğraf deposu açılamadı'; });
  }

  /* ---------- olay bağlama ---------- */
  function baslat(){
    gozcuKur();
    new MutationObserver(taraPlanla).observe(document.body, { childList: true, subtree: true });
    tara();
    istatistikTazele();
    setTimeout(yetimTemizle, 3000);
    // ilk çizim bu modül yüklenmeden olduysa yerel kapaklı kartları tazele
    if(typeof veri === 'object' && Array.isArray(veri.kitaplar) &&
       veri.kitaplar.some(k => k.kapakYerel) && typeof hepsiniCiz === 'function') hepsiniCiz();

    const girdi = document.getElementById('kpDosya');
    if(girdi) girdi.addEventListener('change', e => {
      const d = e.target.files && e.target.files[0];
      e.target.value = '';
      dosyaSecildi(d);
    });

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      switch(el.dataset.act){
        case 'kp-cek':
          if(typeof durum !== 'object' || !durum.detayId) return;
          secim = { mod: 'detay', id: durum.detayId };
          if(girdi) girdi.click();
          break;
        case 'kp-form-cek':
          secim = { mod: 'form', id: (typeof durum === 'object' && durum.formDuzenId) || null };
          if(girdi) girdi.click();
          break;
        case 'kp-onay': onayla(); break;
        case 'kp-vazgec': ortuKapat(); break;
        case 'kp-detay-kaldir': {
          if(typeof durum !== 'object' || !durum.detayId) return;
          const id = durum.detayId;
          blobOku(id).then(blob => {
            if(!(blob instanceof Blob)){
              // işaret senkronla gelmiş, fotoğraf başka cihazda: buradan silinmez —
              // silinseydi öbür cihazın fotoğrafı da görünümden düşerdi
              bildir('Fotoğraf bu cihazda değil — çekildiği cihazdan kaldırılabilir');
              return;
            }
            if(!confirm('Bu kitabın kapak fotoğrafı silinsin mi?')) return;
            sil(id).then(() => {
              const k = kitapBulK(id); // await SONRASI taze arama (senkron diziyi değiştirmiş olabilir)
              if(k && k.kapakYerel){ k.kapakYerel = false; if(typeof depoKaydet === 'function') depoKaydet(); }
              tumunuCiz();
              bildir('Kapak fotoğrafı silindi');
            });
          }).catch(() => bildir('Fotoğraf deposu açılamadı'));
          break; }
        case 'kp-form-kaldir': {
          if(formBekleyen && formBekleyen.foto) formBekleyen = null;
          else if(formYerelVar) formBekleyen = { kaldir: true };
          else formBekleyen = null;
          formDurumTazele();
          break; }
        case 'kp-tum-sil':
          if(confirm('Bu cihazdaki TÜM kapak fotoğrafları silinsin mi? Bu işlem geri alınamaz.'))
            hepsiniSil(false);
          break;
        /* Depo satırı eskiden "Yedek sekmesine geçildi"nde tazeleniyordu; o sekme
           kalktı, kart artık Ayarlar penceresinde. Kanca güncellenmeseydi
           #kpDepoBilgi açılıştaki tek hesabı gösterip donardı. */
        case 'ayar-ac':
          istatistikTazele();
          break;
      }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();

  window.__kapak = { yaz: blobYaz, oku: blobOku, sil, hepsiniSil, islet,
    anahtarlar: blobAnahtarlar, hepsi: blobHepsi, tara, istatistikTazele,
    formAcildi, formKaydedildi, yetimTemizle,
    onbellekBoyu: () => urlOnbellek.size };
})();
