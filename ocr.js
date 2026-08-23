/* Fotoğraftan alıntı — OCR (tesseract.js v7 + Türkçe tessdata_fast modeli).
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir.
   AD ALANI: tüm sınıflar ve data-act değerleri 'oc-' önekli, id'ler 'oc' önekli.

   KARARLAR:
   - Paket (~6 MB: motor + worker + wasm çekirdek + tur modeli) PEŞİN İNMEZ.
     ocr/ dosyaları repoda YEREL durur (çevrimdışı şartı, CDN yok) ama sw.js
     ASSETS'te DEĞİL — ilk kurulumda 6 MB indirtmek yanlış olurdu. İlk
     kullanımda iner ve Cache Storage 'kk_ocr_paket_v1' kovasına alınır;
     ikinci kullanım çevrimdışı da çalışır. sw.js bu kovayı activate
     temizliğinde KORUR ve ocr/ isteklerini önce kovadan sunar.
   - ONAY PENCERESİ YOK (Kaan kararı, v60): "Fotoğraftan" basılınca indirme
     kendiliğinden başlar. Dürüstlük onay kapısıyla değil BİLGİ notuyla
     sağlanır: ilerleme ekranında "~6 MB, bir kez" satırı her indirmede
     görünür (ayrı bir "bir kezlik" not penceresi = kaldırdığımız kapının
     kılık değiştirmişi olurdu; not ilerlemeyle aynı yüzeyde, adım eklemez).
     İndirme İPTAL EDİLEBİLİR (Vazgeç / ✕): iptal yarım kova BIRAKMAZ —
     kaldığı-yerden-devam avantajı bilerek feda edildi, yarım kova Ayarlar
     sayacını ve "indirildi mi" sorusunu bulandırırdı.
   - Çekirdek seçimi: cihaz SIMD destekliyorsa simd-lstm, yoksa lstm. corePath
     dosyaya DOĞRUDAN işaret eder ('js' ile biter → worker kendi tespitini
     atlar); böylece "indirilen dosya = yüklenen dosya" garantisi kurulur.
     Önbellekte çekirdek varsa tespit yerine O kazanır (tarayıcı güncellemesi
     tespiti değiştirirse çevrimdışı sözü bozulmasın).
   - OCR ÇIKTISI ASLA DOĞRUDAN KAYDEDİLMEZ: sonuç ya detaydaki not alanına
     (#d-not) ya da "Gelen alıntı" paneline aktarılır — ikisi de MEVCUT kayıt
     akışı; kayıt kullanıcının Ekle / "Kitaba kaydet" düğmesiyle olur.
   - Önişleme ÖLÇÜMLE seçildi (sentetik kitap sayfası, 7 bozulma vakası,
     ham/basit/küresel/uyarlanabilir karşılaştırması): gri + en uzun kenar
     1600px + ARKA PLAN BÖLMESİ (büyük yarıçaplı bulanıklık = aydınlatma
     alanı; piksel/alan oranı vinyet ve loş ışığı düzler). Küresel histogram
     gerdirme DENENDİ ve vinyetli fotoğrafta ZARAR verdi (CER %34→%89) — yok.
     Arka plan bölmesi: vinyet CER %30→%0.5, kombine kötü %26→%0; 1600px
     küçültme tanıma süresini ~%40-50 kısalttı, doğruluk düşmedi.
   - tesseract cacheMethod:'none' — model IDB'ye İKİNCİ kez kopyalanmaz; tek
     doğruluk kaynağı Cache Storage kovası (Ayarlar'daki silme dürüst kalır).
   - Tanıma Web Worker'da koşar (tesseract'ın kendi worker'ı) — arayüz
     kilitlenmez; ilerleme tesseract logger olayından yüzde olarak akar. */
'use strict';
(function(){
  const KOVA = 'kk_ocr_paket_v1';
  const MOTOR = 'ocr/tesseract.min.js';
  const ISCI = 'ocr/worker.min.js';
  const CEKIRDEK_SIMD = 'ocr/tesseract-core-simd-lstm.wasm.js';
  const CEKIRDEK_TEMEL = 'ocr/tesseract-core-lstm.wasm.js';
  const MODEL = 'ocr/tur.traineddata.gz';
  /* İlerleme payı için beklenen bayt boyutları — gzip'li aktarımda
     Content-Length güvenilmez. ocr/ dosyaları değişirse burası da güncellenir. */
  const BOYUT = {};
  BOYUT[MOTOR] = 62961; BOYUT[ISCI] = 111307;
  BOYUT[CEKIRDEK_SIMD] = 3899472; BOYUT[CEKIRDEK_TEMEL] = 3896484;
  BOYUT[MODEL] = 2004899;
  const GUVEN_ESIK = 70;   // altında "tanıma zayıf olabilir" uyarısı
  const EN_UZUN = 1600;    // önişleme hedef kenarı (ölçümle: hız + doğruluk dengesi)

  let hedefTur = null;        // 'detay' | 'defter' — sonucun aktarılacağı yüzey
  let indirmeSozu = null;     // tekil indirme
  let indirmeDenetim = null;  // AbortController — Vazgeç indirmeyi keser
  let motorSozu = null;       // tekil motor yüklemesi
  let mesgul = false;         // aynı anda tek tanıma

  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function mb(b){ return (b / 1048576).toFixed(1); }

  /* SIMD tespiti — worker.min.js'in kendi probuyla BİREBİR aynı bayt dizisi
     (wasm-feature-detect). corePath'i biz seçtiğimiz için tespit yalnız
     dosya seçimini etkiler, önbellek tutarlılığını etkilemez. */
  function simdVar(){
    try{
      return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,
        96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
    }catch(e){ return false; }
  }

  /* caches.open kova YARATIR — salt okuma yolları önce caches.has ile bakar ki
     "Vazgeç" gerçekten iz bırakmasın (boş kova bile kalmasın). */
  async function cekirdekSec(){
    try{
      if(await caches.has(KOVA)){
        const c = await caches.open(KOVA);
        if(await c.match(CEKIRDEK_SIMD)) return CEKIRDEK_SIMD;
        if(await c.match(CEKIRDEK_TEMEL)) return CEKIRDEK_TEMEL;
      }
    }catch(e){ /* kova okunamadı → SIMD tespitine düş; sessiz geçiş kasıtlı */ }
    return simdVar() ? CEKIRDEK_SIMD : CEKIRDEK_TEMEL;
  }
  async function gerekliler(){ return [MOTOR, ISCI, await cekirdekSec(), MODEL]; }

  async function paketDurum(){
    try{
      if(!(await caches.has(KOVA))) return { tam: false, bayt: 0 };
      const c = await caches.open(KOVA);
      const liste = await gerekliler();
      let bayt = 0, tam = true;
      for(const yol of liste){
        const y = await c.match(yol);
        if(!y){ tam = false; continue; }
        bayt += (await y.clone().blob()).size;
      }
      return { tam, bayt };
    }catch(e){ return { tam: false, bayt: 0 }; }
  }

  function paketIndir(ilerle){
    if(indirmeSozu) return indirmeSozu;
    const denetim = (typeof AbortController === 'function') ? new AbortController() : null;
    indirmeDenetim = denetim;
    indirmeSozu = (async () => {
      const c = await caches.open(KOVA);
      const liste = await gerekliler();
      const toplam = liste.reduce((t, y) => t + (BOYUT[y] || 0), 0);
      let inen = 0;
      for(const yol of liste){
        if(await c.match(yol)){ inen += BOYUT[yol] || 0; if(ilerle) ilerle(inen, toplam); continue; }
        const y = await fetch(yol, denetim ? { signal: denetim.signal } : {});
        if(!y.ok) throw new Error(yol + ' HTTP ' + y.status);
        /* Worker/importScripts katı MIME ister — kovaya doğru tiple yazılır. */
        const tip = yol.slice(-3) === '.js' ? 'text/javascript' : 'application/octet-stream';
        let govde;
        if(y.body && y.body.getReader){
          const okuyucu = y.body.getReader();
          const parcalar = [];
          for(;;){
            const adim = await okuyucu.read();
            if(adim.done) break;
            parcalar.push(adim.value);
            inen += adim.value.length;
            if(ilerle) ilerle(Math.min(inen, toplam), toplam);
          }
          govde = new Blob(parcalar, { type: tip });
        }else{
          govde = await y.blob();
          inen += govde.size;
          if(ilerle) ilerle(Math.min(inen, toplam), toplam);
        }
        /* iptal ile put arasındaki dar yarış penceresi: abort'tan sonra kovaya
           tek dosya bile yazılmasın (iptal "yarım kova bırakmaz" sözü) */
        if(denetim && denetim.signal.aborted) throw new DOMException('iptal', 'AbortError');
        await c.put(yol, new Response(govde, { status: 200, headers: { 'Content-Type': tip } }));
      }
      if(ilerle) ilerle(toplam, toplam);
    })();
    /* hata → söz düşer, yeniden denenebilir; başarı → taze durum okunsun */
    indirmeSozu.then(() => { indirmeSozu = null; indirmeDenetim = null; },
      () => { indirmeSozu = null; indirmeDenetim = null; });
    return indirmeSozu;
  }
  /* Vazgeç: aktif indirmeyi keser ve kovayı komple siler — tamamlanmış
     dosyalar da gider. Sonraki deneme sıfırdan başlar (bilinçli). */
  function indirmeKes(){
    if(indirmeDenetim) indirmeDenetim.abort();
    caches.delete(KOVA).catch(() => {});
  }

  /* Motor sayfaya KOVADAN yüklenir (blob URL) — çevrimiçiyken bile yeniden
     inmez; kovada yoksa (olmamalı: akış indirme kapısından geçer) dosya
     yoluna düşer ve sw.js ocr/ kuralı devreye girer. */
  function motorYukle(){
    if(window.Tesseract) return Promise.resolve(true);
    if(motorSozu) return motorSozu;
    motorSozu = (async () => {
      let src = MOTOR, blobUrl = null;
      try{
        const y = await (await caches.open(KOVA)).match(MOTOR);
        if(y) src = blobUrl = URL.createObjectURL(await y.blob());
      }catch(e){ /* kova okunamadı → ağdan yüklenir; sessiz geçiş kasıtlı */ }
      try{
        await new Promise((coz, kir) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = coz;
          s.onerror = () => kir(new Error('motor yüklenemedi'));
          document.head.appendChild(s);
        });
      }finally{
        if(blobUrl) URL.revokeObjectURL(blobUrl);
      }
      if(!window.Tesseract) throw new Error('motor yüklenemedi');
      return true;
    })();
    motorSozu.catch(() => { motorSozu = null; });
    return motorSozu;
  }

  /* ---------- önişleme (ölçümle seçilen boru hattı) ---------- */
  function gorselYukle(dosya){
    return new Promise((cozul, kir) => {
      const u = URL.createObjectURL(dosya);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); cozul(im); };
      im.onerror = () => { URL.revokeObjectURL(u); kir(new Error('görsel çözülemedi')); };
      im.src = u;
    });
  }
  async function onisle(dosya){
    let kaynak;
    /* EXIF yönelimi: kapak.js ile aynı desen — 'from-image' dik getirir,
       desteklemeyen tarayıcıda <img> yoluna düşülür. */
    try{ kaynak = await createImageBitmap(dosya, { imageOrientation: 'from-image' }); }
    catch(e){ kaynak = await gorselYukle(dosya); }
    const gw = kaynak.width || kaynak.naturalWidth, gh = kaynak.height || kaynak.naturalHeight;
    const oran = Math.min(1, EN_UZUN / Math.max(gw, gh));
    const w = Math.max(1, Math.round(gw * oran)), h = Math.max(1, Math.round(gh * oran));
    const tuval = document.createElement('canvas'); tuval.width = w; tuval.height = h;
    const x = tuval.getContext('2d');
    x.drawImage(kaynak, 0, 0, w, h);
    if(kaynak.close) kaynak.close();
    const d = x.getImageData(0, 0, w, h), p = d.data;
    const gri = new Uint8Array(w * h);
    for(let i = 0, j = 0; i < p.length; i += 4, j++){
      const g = Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]);
      gri[j] = g; p[i] = p[i + 1] = p[i + 2] = g;
    }
    x.putImageData(d, 0, 0);
    /* Arka plan bölmesi: büyük yarıçaplı bulanıklık metin vuruşlarını yıkar,
       geriye aydınlatma alanı kalır; piksel/alan oranı vinyeti düzler.
       ctx.filter desteklenmiyorsa (eski Safari) bu adım atlanır — gri +
       küçültme yine de kalır (ölçümde tek başına da zararsızdı). */
    const bt = document.createElement('canvas'); bt.width = w; bt.height = h;
    const bx = bt.getContext('2d');
    bx.filter = 'blur(' + Math.max(12, Math.round(Math.min(w, h) / 16)) + 'px)';
    if(bx.filter && bx.filter !== 'none'){
      bx.drawImage(tuval, 0, 0);
      const bd = bx.getImageData(0, 0, w, h).data;
      for(let i = 0, j = 0; i < p.length; i += 4, j++){
        const v = Math.max(0, Math.min(255, Math.round(gri[j] * 235 / Math.max(30, bd[i]))));
        p[i] = p[i + 1] = p[i + 2] = v;
      }
      x.putImageData(d, 0, 0);
    }
    return tuval;
  }

  /* ---------- tanıma ---------- */
  async function tani(tuval, ilerle){
    await motorYukle();
    const mutlak = y => new URL(y, location.href).href;
    const cekirdek = await cekirdekSec();
    const isci = await window.Tesseract.createWorker('tur', 1, {
      workerPath: mutlak(ISCI),
      corePath: mutlak(cekirdek),      // 'js' ile bitiyor → worker tespiti atlar
      langPath: mutlak('ocr'),         // → ocr/tur.traineddata.gz
      gzip: true,
      cacheMethod: 'none',
      logger: m => { if(ilerle && m && m.status === 'recognizing text') ilerle(m.progress || 0); }
    });
    try{
      const s = await isci.recognize(tuval);
      return {
        metin: (s.data && s.data.text) || '',
        guven: (s.data && typeof s.data.confidence === 'number') ? s.data.confidence : null
      };
    }finally{
      try{ await isci.terminate(); }catch(e){}   // telefon belleği: iş bitti, worker ölür
    }
  }

  /* ---------- metin temizliği ----------
     1) Satırlar kırpılır. 2) TEK BAŞINA rakam satırı (1-4 hane) = sayfa
     numarası adayı: metinden AYIKLANIR, ilki sayfa alanına ÖNERİLİR
     (kendiliğinden yazılmaz — kullanıcı onaylar). 3) Satır sonu tiresi
     birleştirilir ("gir-\nilmez" → "girilmez"). 4) Boş satır = paragraf
     sınırı KORUNUR; paragraf içi satır sonları boşluğa çevrilir (dizgi
     kırılımları cümleye ait değil), çoklu boşluk teke iner. */
  function metniTemizle(ham){
    const satirlar = String(ham || '').replace(/\r/g, '').split('\n').map(s => s.trim());
    let sayfaOneri = null;
    const kalan = [];
    for(const s of satirlar){
      if(/^\d{1,4}$/.test(s)){ if(sayfaOneri === null) sayfaOneri = parseInt(s); continue; }
      kalan.push(s);
    }
    const metin = kalan.join('\n')
      .replace(/([A-Za-zÇĞİÖŞÜçğıöşâîû])[-‐]\n(?=\S)/g, '$1')
      .split(/\n{2,}/)
      .map(p => p.replace(/\n/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
      .filter(Boolean).join('\n\n');
    return { metin, sayfaOneri };
  }

  /* ---------- pencere ---------- */
  function ortu(){ return document.getElementById('ortuOcr'); }
  function goster(bolum){
    ['ocIlerleme', 'ocSec', 'ocHata'].forEach(id => {
      const e = document.getElementById(id);
      if(e) e.hidden = (id !== bolum);
    });
  }
  function ortuAc(bolum){
    goster(bolum);
    const o = ortu();
    if(!o) return;
    o.classList.add('acik');
    if(typeof ortuAriaKur === 'function') ortuAriaKur(o);
  }
  function ortuKapat(){ const o = ortu(); if(o) o.classList.remove('acik'); }
  function ilerlemeYaz(metin, oran){
    const m = document.getElementById('ocDurumMetin');
    const b = document.getElementById('ocIlerlemeBar');
    if(m) m.textContent = metin;
    if(b) b.style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + '%';
  }
  function hataGoster(metin){
    const e = document.getElementById('ocHataMetin');
    if(e) e.textContent = metin;
    ortuAc('ocHata');
  }

  /* ---------- akış ---------- */
  async function baslatIstegi(tur){
    if(mesgul) return;
    hedefTur = tur;
    const d = await paketDurum();
    if(d.tam){ secTiklat(); return; }   // paket hazır → doğrudan dosya seçici
    if(!navigator.onLine){
      hataGoster('Metin tanıma paketi henüz indirilmemiş ve şu an çevrimdışısın. ' +
        'İnternete bağlıyken bir kez indirmen yeterli — sonrası çevrimdışı çalışır.');
      return;
    }
    indirBaslat();   // onay penceresi YOK (v60) — bilgi notu ilerleme ekranında
  }
  function secTiklat(){
    const g = document.getElementById('ocDosya');
    if(g) g.click();
  }
  /* İlerleme ekranının iki yüzü: indirme (bilgi notu + Vazgeç görünür) ve
     tanıma (not tanıma sözünü söyler, Vazgeç satırı gizli). */
  function indirmeGorunum(indiriliyor){
    const n = document.getElementById('ocIlerlemeNot');
    const s = document.getElementById('ocIptalSatir');
    if(n) n.textContent = indiriliyor
      ? 'Türkçe metin tanıma paketi (~6 MB) bir kez indiriliyor — sonrası çevrimdışı çalışır. ' +
        'Paketi Ayarlar ▸ Depolama\'dan silebilirsin.'
      : 'Tanınan metin kaydedilmeden önce sana gösterilecek — düzeltebilirsin.';
    if(s) s.hidden = !indiriliyor;
  }
  async function indirBaslat(){
    ortuAc('ocIlerleme');
    indirmeGorunum(true);
    ilerlemeYaz('Dil paketi indiriliyor…', 0);
    try{
      await paketIndir((inen, toplam) =>
        ilerlemeYaz('Dil paketi indiriliyor… ' + mb(inen) + ' / ' + mb(toplam) + ' MB', toplam ? inen / toplam : 0));
      durumTazele();
      /* Dosya seçici kullanıcı jesti ister — uzun indirmenin ardından
         kendiliğinden açılmaz, düğmeyle açılır. */
      goster('ocSec');
    }catch(e){
      if(e && e.name === 'AbortError') return;   // kullanıcı vazgeçti — sessizce biter
      hataGoster('İndirme tamamlanamadı — bağlantını kontrol edip yeniden dene.');
    }
  }
  async function dosyaSecildi(dosya){
    if(!dosya) return;
    if(mesgul) return;
    mesgul = true;
    ortuAc('ocIlerleme');
    indirmeGorunum(false);
    ilerlemeYaz('Fotoğraf hazırlanıyor…', 0);
    try{
      const tuval = await onisle(dosya);
      ilerlemeYaz('Metin tanınıyor…', 0.02);
      const s = await tani(tuval, oran =>
        ilerlemeYaz('Metin tanınıyor… %' + Math.round(oran * 100), oran));
      const t = metniTemizle(s.metin);
      if(!t.metin){
        hataGoster('Fotoğrafta okunabilir metin bulunamadı. Daha yakından, düz ve iyi ışıkta çekmeyi dene.');
        return;
      }
      ortuKapat();
      aktar(t, s.guven);
    }catch(e){
      hataGoster('Metin tanıma başarısız oldu — yeniden dene. (' + ((e && e.message) || e) + ')');
    }finally{
      mesgul = false;
    }
  }

  /* ---------- sonucu MEVCUT kayıt akışına aktarma ----------
     Detaydan gelindiyse: metin detaydaki #d-not alanına yazılır; kayıt mevcut
     "Ekle" düğmesiyle (not-ekle) olur. Defterin'den gelindiyse: metin mevcut
     "Gelen alıntı" paneline (gelenAc) verilir; kayıt "Kitaba kaydet" ile
     (gelen-kaydet). İki yol da OCR'dan bağımsız, önceden var olan yollar. */
  function aktar(t, guven){
    const dusuk = (typeof guven === 'number') && guven < GUVEN_ESIK;
    if(hedefTur === 'detay' && typeof durum !== 'undefined' && durum.detayId){
      const alan = document.getElementById('d-not');
      if(alan){
        alan.value = t.metin;
        const satir = alan.closest('.detay-satir');
        notuKur(satir, alan.parentNode, dusuk, t.sayfaOneri, 'd-not-sayfa');
        bildir('Metin eklendi — kontrol et, sonra Ekle ile kaydet');
        return;
      }
    }
    defterAktar(t, dusuk);
  }
  function defterAktar(t, dusuk){
    if(typeof gelenAc !== 'function'){ bildir('Kayıt paneli bulunamadı'); return; }
    gelenAc(t.metin);
    const metinAlani = document.getElementById('gelen-metin');
    notuKur(metinAlani ? metinAlani.parentNode : null, metinAlani, dusuk, t.sayfaOneri, 'gelen-sayfa');
  }
  /* Uyarı + sayfa önerisi satırı. Düğme İÇERMEYEN ince metin eylemi kullanılır
     ("Gelen alıntı"da tek görünür brass sözleşmesi bozulmaz — g29). */
  function notuKur(kap, referans, dusuk, sayfaOneri, girdiId){
    notuTemizle();
    if(!kap || (!dusuk && sayfaOneri === null)) return;
    const n = document.createElement('div');
    n.className = 'oc-notu'; n.id = 'ocNotu';
    if(dusuk){
      const u = document.createElement('span');
      u.className = 'oc-uyari';
      u.textContent = 'Tanıma zayıf olabilir — metni dikkatle kontrol et.';
      n.appendChild(u);
    }
    if(sayfaOneri !== null){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'oc-ghost';
      b.dataset.act = 'oc-sayfa-kullan';
      b.dataset.v = String(sayfaOneri);
      b.dataset.girdi = girdiId;
      b.textContent = 'Sayfa ' + sayfaOneri + ' olabilir — kullan';
      n.appendChild(b);
    }
    if(referans && referans.parentNode === kap && referans.nextSibling){
      kap.insertBefore(n, referans.nextSibling);
    }else{
      kap.appendChild(n);
    }
  }
  function notuTemizle(){
    const e = document.getElementById('ocNotu');
    if(e) e.remove();
  }
  function sayfaKullan(el){
    const g = document.getElementById(el.dataset.girdi || '');
    if(g) g.value = el.dataset.v || '';
    el.remove();   // öneri kullanıldı; varsa güven uyarısı yerinde kalır
  }

  /* ---------- Ayarlar ▸ Depolama ---------- */
  async function durumTazele(){
    const el = document.getElementById('ocDepoBilgi');
    if(!el) return;
    const sil = document.querySelector('#ayBolumDepolama [data-act="oc-paket-sil"]');
    const d = await paketDurum();
    if(d.tam){
      el.textContent = 'İndirildi · ' + mb(d.bayt) + ' MB — çevrimdışı çalışır';
      if(sil) sil.hidden = false;
    }else{
      el.textContent = 'İndirilmedi — ilk "Fotoğraftan" kullanımında kendiliğinden iner (~6 MB, bir kez)';
      if(sil) sil.hidden = true;
    }
  }
  async function paketSil(){
    if(!confirm('Metin tanıma paketi silinsin mi? Gerektiğinde yeniden indirilir.')) return;
    try{
      await caches.delete(KOVA);
      bildir('Metin tanıma paketi silindi');
    }catch(e){ bildir('Paket silinemedi'); }
    durumTazele();
  }

  /* ---------- bağlama ---------- */
  function baslat(){
    const girdi = document.getElementById('ocDosya');
    if(girdi) girdi.addEventListener('change', e => {
      const d = e.target.files && e.target.files[0];
      e.target.value = '';   // aynı dosya ikinci kez seçilebilsin
      dosyaSecildi(d);
    });
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      switch(el.dataset.act){
        case 'oc-baslat': baslatIstegi('detay'); break;
        case 'oc-al': baslatIstegi('defter'); break;
        case 'oc-vazgec':
          if(indirmeSozu) indirmeKes();   // indirme sürüyorsa: kes + kovayı temizle
          ortuKapat(); break;
        case 'oc-sec': secTiklat(); break;
        case 'oc-sayfa-kullan': sayfaKullan(el); break;
        case 'oc-paket-sil': paketSil(); break;
        case 'ayar-ac': durumTazele(); break;   // kapak.js ile aynı kalıp
        /* aktarma yüzeyleri kapanırken/kaydederken öneri satırı kalkar —
           bayat öneri bir SONRAKİ paylaşım/nota sızmasın */
        case 'gelen-kapat': case 'gelen-kaydet': case 'not-ekle': notuTemizle(); break;
      }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();

  /* test kancaları */
  window.__ocr = { metniTemizle, paketDurum, paketIndir, motorYukle, onisle, tani,
    durumTazele, cekirdekSec, simdVar, KOVA, MOTOR, ISCI, CEKIRDEK_SIMD, CEKIRDEK_TEMEL,
    MODEL, BOYUT, GUVEN_ESIK, EN_UZUN };
})();
