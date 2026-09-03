/* Kitaplık — barkod & ISBN eklentisi
   Kitabın arkasındaki barkodu kameraya okut, form dolsun.
   Kamera yoksa/izin verilmezse ISBN elle yazılabilir — her cihazda çalışır.
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  const GB_ANAHTAR = (function(){
    const m = /books\/v1\/volumes\?key=([A-Za-z0-9_-]+)/.exec(document.documentElement.innerHTML);
    return m ? m[1] : '';
  })();

  let akis = null, tarayici = null, dongu = null;

  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function bildir(m){ if(typeof toast === 'function') toast(m); }

  /* ---------- ISBN yardımcıları ---------- */
  function isbnTemizle(s){ return String(s||'').replace(/[^0-9Xx]/g, '').toUpperCase(); }
  function isbnGecerli(s){
    const t = isbnTemizle(s);
    if(t.length === 13){
      if(!/^\d{13}$/.test(t)) return false;
      let top = 0;
      for(let i = 0; i < 12; i++) top += (+t[i]) * (i % 2 ? 3 : 1);
      return (10 - (top % 10)) % 10 === +t[12];
    }
    if(t.length === 10){
      let top = 0;
      for(let i = 0; i < 9; i++){ if(!/\d/.test(t[i])) return false; top += (+t[i]) * (10 - i); }
      top += t[9] === 'X' ? 10 : (/\d/.test(t[9]) ? +t[9] : NaN);
      return top % 11 === 0;
    }
    return false;
  }

  /* ---------- iki kaynaktan ISBN sorgusu ---------- */
  /* Dönüş: { sonuc, agSorunu }. agSorunu YALNIZ iki kaynak da yanıt veremediğinde
     true olur — biri yanıt verip bulamadıysa "kayıtlarda yok" doğru teşhistir.
     Eskiden ağ arızası da "bu ISBN kayıtlarda yok" diye raporlanıyordu. */
  async function isbnAra(isbn){
    const t = isbnTemizle(isbn);
    let sonuc = null, gbHata = false, olHata = false;
    try{
      const r = await fetch('https://www.googleapis.com/books/v1/volumes?key=' + GB_ANAHTAR
        + '&country=TR&q=isbn:' + encodeURIComponent(t));
      if(!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if(j.totalItems && j.items && j.items[0]){
        const v = j.items[0].volumeInfo || {};
        sonuc = {
          ad: v.title || '', yazar: (v.authors||[]).slice(0,2).join(', '),
          yayinevi: v.publisher || '',
          yil: v.publishedDate ? parseInt(v.publishedDate.slice(0,4)) || null : null,
          sayfa: v.pageCount || null,
          kapak: (v.imageLinks && v.imageLinks.thumbnail)
            ? v.imageLinks.thumbnail.replace('http://','https://') : null,
          /* tur artık HAM yazılmaz (v65): eski `tur: categories[0]` Google'ın
             İngilizce konu etiketini ("Literature, Turkish", "Fiction") olduğu
             gibi tür alanına sokuyordu — taksonomi kapısı yok, uydurma tür
             mümkündü. Kategoriler ayrı alanda taşınır; tür eşlemesini kayıt
             anında zengin.js otoTur motoru (sözlük + canlı taksonomi, iki
             kapı) yapar. Eşlenemezse tür DÜRÜSTÇE boş kalır. */
          tur: '',
          kategoriler: Array.isArray(v.categories) ? v.categories : []
        };
      }
    }catch(e){ gbHata = true; }
    const gbBulundu = !!(sonuc && sonuc.ad);   // v97: Google'ın sonucu ASLA ezilmez
    // Open Library: eksik alanları tamamlar (özellikle yayınevi)
    try{
      const r = await fetch('https://openlibrary.org/api/books?format=json&jscmd=data&bibkeys=ISBN:' + encodeURIComponent(t));
      if(!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      const d = j && Object.values(j)[0];
      if(d){
        const ol = {
          ad: d.title || '', yazar: (d.authors||[]).slice(0,2).map(a => a.name).join(', '),
          yayinevi: (d.publishers||[])[0] ? d.publishers[0].name : '',
          yil: d.publish_date ? parseInt(String(d.publish_date).slice(-4)) || null : null,
          sayfa: d.number_of_pages || null,
          kapak: d.cover ? (d.cover.medium || d.cover.large || null) : null, tur: ''
        };
        if(!sonuc) sonuc = ol;
        else for(const k of ['yazar','yayinevi','yil','sayfa','kapak'])
          if(!sonuc[k] && ol[k]) sonuc[k] = ol[k];
      }
    }catch(e){ olHata = true; }
    /* v97 — 1000Kitap yedeği (worker /isbn): YALNIZ Google boş ya da arızalı
       dönerse (gbBulundu → bu dala hiç girilmez; Google sonucu ezilmez).
       ÖLÇÜM: Google Books Türkçe ISBN'de boş, Open Library seyrek ve yarım
       ("1984 [TURKISH EDITION]", sayfa/yayınevi yok); 1000Kitap künyesi baskıya
       birebir (yayınevi/sayfa/yıl/çevirmen). OL yarım kayıt vermişse künye ÖNE
       alınır, OL boşlukları doldurur. Worker'a ulaşılamazsa SESSİZ: eski
       Google/OL davranışı aynen sürer. Worker AĞ TEŞHİSİNE GİRMEZ: agSorunu
       sözleşmesi (g13 M3) "Google + OL ikisi de yanıt veremedi" olarak kalır —
       worker yalnız veri ekler; o da bulursa zaten sonuç var, arıza raporu yok. */
    if(!gbBulundu){
      try{
        const wk = await workerIsbn(t);
        if(wk){
          const ol = sonuc; sonuc = wk;
          if(ol) for(const k of ['yazar','yayinevi','yil','sayfa','kapak'])
            if(!sonuc[k] && ol[k]) sonuc[k] = ol[k];
        }
      }catch(e){ /* worker kapalı/zaman aşımı — sessiz, Google/OL sonucu neyse o */ }
    }
    if(sonuc && !sonuc.kaynak) sonuc.kaynak = gbBulundu ? 'Google Books' : 'Open Library';
    return { sonuc, agSorunu: gbHata && olHata };
  }
  /* v97: worker /isbn — Türkçe baskılar için 1000Kitap künyesi. 6 sn zaman
     aşımı; HTTP/ağ arızası fırlatılır (çağıran sessizce yutar), kaynakta yoksa
     null. Alan seti barkod sonucuyla aynı (+ cevirmen/dil: 1000Kitap rol
     etiketli veriyor, kitapNormalize alanları var — uydurma değil). */
  async function workerIsbn(isbn){
    const kok = (typeof ARA_KOK === 'string' && ARA_KOK) ? ARA_KOK : 'https://kitaplik-ara.dessn7.workers.dev';
    const c = (typeof AbortController === 'function') ? new AbortController() : null;
    const z = c ? setTimeout(() => c.abort(), 6000) : null;
    try{
      const r = await fetch(kok + '/isbn?q=' + encodeURIComponent(isbn), c ? { signal: c.signal } : undefined);
      if(!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      const s = j && Array.isArray(j.sonuclar) ? j.sonuclar[0] : null;
      if(!s || !s.ad) return null;
      return {
        ad: s.ad, yazar: s.yazar || '', yayinevi: s.yayinevi || '',
        yil: s.yil || null, sayfa: s.sayfa || null, kapak: s.kapak || null,
        tur: '', kategoriler: [],
        cevirmen: s.cevirmen || '', dil: s.dil || '',
        kaynak: s.kaynak || '1000Kitap'
      };
    }finally{ if(z) clearTimeout(z); }
  }
  /* v97: "Barkod okundu" bildirimi kaynağı söyler — "1000Kitap'tan okundu: İon". */
  const KAYNAK_EK = { '1000Kitap': "1000Kitap'tan", 'Google Books': "Google Books'tan", 'Open Library': "Open Library'den" };
  function kaynakOkundu(kaynak, kaynakMetni){
    return (kaynak && KAYNAK_EK[kaynak]) ? KAYNAK_EK[kaynak] + ' okundu' : (kaynakMetni || 'Barkod') + ' okundu';
  }

  /* ---------- formu doldur ---------- */
  function formuDoldur(k, isbn){
    const yaz = (id, v) => { const e = document.getElementById(id); if(e && v) e.value = v; };
    yaz('f-ad', k.ad); yaz('f-yazar', k.yazar); yaz('f-yayinevi', k.yayinevi);
    yaz('f-yil', k.yil); yaz('f-sayfa', k.sayfa);
    yaz('f-isbn', isbn);   // okunan ISBN kayda geçsin (kopya tespitinin en sağlam anahtarı)
    yaz('f-cevirmen', k.cevirmen); yaz('f-dil', k.dil);   // v97: 1000Kitap rol etiketli verir; yoksa dokunmaz
    const tur = document.getElementById('f-tur');
    if(tur && !tur.value && k.tur) tur.value = k.tur;
    /* Otomatik tür (v65): ISBN yanıtındaki kategoriler kayıt anındaki tür
       çıkarımına taşınır (formKaydet → zengin.js otoTur) — ek istek atılmaz.
       AD ile bağlı: kullanıcı formu başka kitaba çevirirse taşınmaz. */
    if(typeof durum === 'object')
      durum.formKategoriler = (Array.isArray(k.kategoriler) && k.kategoriler.length)
        ? { ad: k.ad, liste: k.kategoriler } : null;
    if(k.kapak && typeof durum === 'object'){
      durum.formKapak = k.kapak;
      if(typeof kapakOnizleCiz === 'function') kapakOnizleCiz();
    }
    // arama önerilerini sustur (kullanıcı yazmadı, biz doldurduk)
    if(typeof sonAramaMetni !== 'undefined'){ try{ sonAramaMetni = k.ad; }catch(e){ /* değişken salt-okunur olabilir — sessiz geçiş kasıtlı */ } }
    const dEl = document.getElementById('olDurum'), sEl = document.getElementById('olSonuc');
    if(sEl) sEl.innerHTML = '';
    if(dEl) dEl.textContent = 'ISBN ' + isbn + ' bulundu — kontrol edip kaydet.';
    // D2: alanlar katlanmış bölümde dolduruldu — özet satırı bunu söylesin
    if(window.__formAyrintiGuncelle) window.__formAyrintiGuncelle();
  }

  async function isbnIsle(isbn, kaynakMetni){
    const t = isbnTemizle(isbn);
    if(!isbnGecerli(t)){ bildir('Geçersiz ISBN — 10 veya 13 haneli olmalı'); return false; }
    const dEl = document.getElementById('olDurum');
    if(dEl) dEl.textContent = 'ISBN ' + t + ' sorgulanıyor…';
    const { sonuc: k, agSorunu } = await isbnAra(t);
    if(!k || !k.ad){
      if(agSorunu){
        if(dEl) dEl.textContent = 'İnternete ulaşılamadı — bağlantını kontrol edip tekrar dene.';
        bildir('İnternete ulaşılamadı');
      }else{
        if(dEl) dEl.textContent = 'Bu ISBN kayıtlarda yok — kitap adıyla arayabilir veya elle girebilirsin.';
        bildir('ISBN bulunamadı');
      }
      return false;
    }
    formuDoldur(k, t);
    bildir(kaynakOkundu(k.kaynak, kaynakMetni) + ': ' + k.ad);
    return true;
  }

  /* ---------- tarama motoru (barkod + katalog seri tarama ortak) ----------
     TEŞHİS (v38'e kadar canlıdaki kusur): BarcodeDetector'e formats olarak
     'isbn' veriliyordu. 'isbn' BarcodeFormat enum'unda YOKTUR — WebIDL enum
     doğrulaması constructor'ı HER gerçek cihazda TypeError ile düşürür, dıştaki
     catch de bunu "Kamera açılamadı (izin verilmemiş olabilir)" diye yanlış
     raporluyordu: kamera açılıyor ama tarayıcı hiç kurulamıyordu. Test sahtesi
     (kameraTaklit) her formatı kabul ettiği için paket bunu yakalayamadı.
     İkinci bilinen arıza modu: bazı cihazlarda nesne var ama detect() hep
     hata/boş döner (ML Kit yok) — her iki mod için ZXing YEREL yedeği var. */
  const YEDEK_DOSYA = './zxing.min.js';
  let yedekYukSozu = null, yedekOkuyucu = null;

  function durumYaz(m){ const n = document.getElementById('barkodNot'); if(n) n.textContent = m; }
  function kameraHataAdi(e){
    const ad = e && e.name;
    return ad === 'NotAllowedError' ? 'izin verilmedi'
      : ad === 'NotFoundError' ? 'kamera bulunamadı'
      : ad === 'NotReadableError' ? 'kamera başka bir uygulamada'
      : ad === 'OverconstrainedError' ? 'istenen kamera yok'
      : (ad || 'bilinmeyen hata');
  }
  /* Yerli tarayıcı: 'in window' kontrolü YETMEZ — format desteği
     getSupportedFormats ile doğrulanır, istek listesi desteklenenle kesilir. */
  async function tarayiciKur(){
    if(!('BarcodeDetector' in window)) return null;
    try{
      const f = await window.BarcodeDetector.getSupportedFormats();
      if(!f || !f.includes('ean_13')) return null;
      const istenen = ['ean_13','ean_8','upc_a'].filter(x => f.includes(x));
      return new window.BarcodeDetector({ formats: istenen });
    }catch(e){ return null; }
  }
  /* ZXing yedeği: yalnız gerekince yüklenen YEREL dosya (CDN yok, sw önbellekli) */
  function yedekYukle(){
    if(window.ZXing) return Promise.resolve(true);
    if(yedekYukSozu) return yedekYukSozu;
    yedekYukSozu = new Promise(coz => {
      const s = document.createElement('script');
      s.src = YEDEK_DOSYA;
      s.onload = () => coz(!!window.ZXing);
      s.onerror = () => { yedekYukSozu = null; coz(false); };
      document.head.appendChild(s);
    });
    return yedekYukSozu;
  }
  function yedekOkuyucuKur(){
    if(yedekOkuyucu) return yedekOkuyucu;
    const Z = window.ZXing;
    if(!Z) return null;
    const r = new Z.MultiFormatReader();
    const ipucu = new Map();
    ipucu.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8]);
    ipucu.set(Z.DecodeHintType.TRY_HARDER, true);
    r.setHints(ipucu);
    yedekOkuyucu = r;
    return r;
  }
  /* Tek kareyi çöz (test kancası da burası: sahte EAN-13 tuvali verilebilir) */
  function yedekKareCoz(tuval){
    const Z = window.ZXing, r = yedekOkuyucuKur();
    if(!Z || !r) return null;
    try{
      const kaynak = new Z.HTMLCanvasElementLuminanceSource(tuval);
      const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(kaynak));
      const s = r.decode(bitmap);
      return s && s.getText ? s.getText() : null;
    }catch(e){ return null; }              // NotFoundException = bu karede barkod yok
    finally{ try{ r.reset(); }catch(e){ /* okuyucu sıfırlanamadı — sessiz geçiş kasıtlı */ } }
  }
  function yedekVideoCoz(v, tuval){
    if(!v.videoWidth) return null;
    tuval.width = v.videoWidth; tuval.height = v.videoHeight;
    tuval.getContext('2d').drawImage(v, 0, 0);
    return yedekKareCoz(tuval);
  }
  /* Kare kalitesi: 1280×720 hedefi + destekliyorsa sürekli odak — düşük
     çözünürlük/odaksız karede EAN çubukları ayrışmıyor, tarayıcı "okumuyor" gibi
     görünüyordu. */
  function kameraKisitlari(){
    return { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };
  }
  async function odaklan(ak){
    try{
      const iz = ak.getVideoTracks()[0];
      const yet = iz && iz.getCapabilities ? iz.getCapabilities() : {};
      if(yet.focusMode && yet.focusMode.includes('continuous'))
        await iz.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }catch(e){ /* odak özelliği yok — sessiz geçiş kasıtlı */ }
  }

  /* ---------- kamera (tekil barkod penceresi) ---------- */
  function kameraVar(){
    // Yedek tarayıcı sayesinde BarcodeDetector artık ŞART değil — kamera yeter
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  async function kameraAc(){
    const ortu = document.getElementById('barkodOrtu');
    ortu.classList.add('acik');
    if(!kameraVar()){
      durumYaz('Bu cihaz/tarayıcı kamera erişimini desteklemiyor — ISBN\'i elle yazabilirsin.');
      return;
    }
    try{
      akis = await navigator.mediaDevices.getUserMedia(kameraKisitlari());
    }catch(e){
      durumYaz('Kamera açılamadı: ' + kameraHataAdi(e) + ' — ISBN\'i elle yazabilirsin.');
      return;
    }
    const v = document.getElementById('barkodVideo');
    v.srcObject = akis;
    try{ await v.play(); }catch(e){ /* otomatik oynatma engeli — sessiz geçiş kasıtlı */ }
    odaklan(akis);
    tarayici = await tarayiciKur();
    if(tarayici){
      durumYaz('Kamera açık — barkod aranıyor…');
      let ustUsteHata = 0;
      dongu = setInterval(async () => {
        try{
          const bulunan = await tarayici.detect(v);
          ustUsteHata = 0;
          if(bulunan && bulunan.length && isbnGecerli(bulunan[0].rawValue)){
            const kod = bulunan[0].rawValue;
            kameraKapat();
            await isbnIsle(kod, 'Barkod');
          }
        }catch(e){
          // "nesne var ama çalışmıyor" modu: 5 üst üste hata → yedeğe düş
          if(++ustUsteHata >= 5){ clearInterval(dongu); dongu = null; yedegeGec(v); }
        }
      }, 300);
    }else{
      yedegeGec(v);
    }
  }
  async function yedegeGec(v){
    durumYaz('Bu tarayıcı barkod API\'sini desteklemiyor — yedek tarayıcı yükleniyor…');
    const ok = await yedekYukle();
    if(!ok){ durumYaz('Yedek tarayıcı yüklenemedi — ISBN\'i elle yazabilirsin.'); return; }
    if(!akis) return;   // yükleme sürerken pencere kapatıldıysa
    durumYaz('Kamera açık — barkod aranıyor (yedek tarayıcı)…');
    const tuval = document.createElement('canvas');
    dongu = setInterval(async () => {
      const kod = yedekVideoCoz(v, tuval);
      if(kod && isbnGecerli(kod)){
        kameraKapat();
        await isbnIsle(kod, 'Barkod');
      }
    }, 350);
  }
  function kameraKapat(){
    clearInterval(dongu); dongu = null;
    if(akis){ akis.getTracks().forEach(t => t.stop()); akis = null; }
    const v = document.getElementById('barkodVideo');
    if(v) v.srcObject = null;
    const ortu = document.getElementById('barkodOrtu');
    if(ortu) ortu.classList.remove('acik');
  }

  /* ---------- arayüz ---------- */
  function arayuzEkle(){
    if(document.getElementById('barkodBtn')) return;
    const serit = document.getElementById('araTipSec');
    if(serit){
      const b = document.createElement('button');
      b.className = 'mini-chip'; b.id = 'barkodBtn';
      b.dataset.act = 'barkod-ac';
      b.style.marginLeft = 'auto';
      b.innerHTML = (window.ikon?window.ikon('kamera'):'') + ' Barkod / ISBN'; /* sabit dize — kullanıcı verisi yok */
      serit.appendChild(b);
    }
    if(document.getElementById('barkodOrtu')) return;
    const o = document.createElement('div');
    o.className = 'ortu'; o.id = 'barkodOrtu';
    o.innerHTML =
      '<div class="sheet">' +
        '<div class="tutamac"></div>' +
        '<button class="sheet-kapat" data-act="barkod-kapat" aria-label="Kapat">✕</button>' +
        '<div class="sheet-baslik">Barkod veya ISBN</div>' +
        '<div style="margin-top:12px;border-radius:12px;overflow:hidden;background:var(--kamera-zemin);position:relative">' +
          '<video id="barkodVideo" playsinline muted style="width:100%;max-height:44vh;object-fit:cover;display:block"></video>' +
          '<div style="position:absolute;inset:22% 12%;border:2px solid var(--kamera-cerceve);border-radius:10px;pointer-events:none"></div>' +
        '</div>' +
        '<div id="barkodNot" style="font-size:.85rem;color:var(--muted);margin-top:10px" role="status" aria-live="polite"></div>' +
        '<label for="barkodElle" style="font-weight:600;color:var(--paper)">Okutamıyor musun? ISBN\'i elle yaz</label>' +
        '<div style="display:flex;gap:8px">' +
          '<input id="barkodElle" inputmode="numeric" placeholder="978…" autocomplete="off" style="flex:1">' +
          '<button class="btn btn-brass" style="width:auto" data-act="barkod-elle">Bul</button>' +
        '</div>' +
        '<div style="height:14px"></div>' +
        '<button class="btn btn-cerceve" data-act="barkod-kapat">Kapat</button>' +
      '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', e => { if(e.target === o) kameraKapat(); });
  }

  function baslat(){
    arayuzEkle();
    document.addEventListener('click', async e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      const act = el.dataset.act;
      if(act === 'yeni' || act === 'duzenle'){ setTimeout(arayuzEkle, 0); return; }
      if(act === 'barkod-ac'){ arayuzEkle(); kameraAc(); }
      else if(act === 'barkod-kapat'){ kameraKapat(); }
      else if(act === 'barkod-elle'){
        const v = document.getElementById('barkodElle').value;
        const ok = await isbnIsle(v, 'ISBN');
        if(ok){ document.getElementById('barkodElle').value = ''; kameraKapat(); }
      }
    });
  }

  if(document.getElementById('araTipSec')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__barkod = { workerIsbn, isbnGecerli, isbnTemizle, isbnAra, isbnIsle, formuDoldur, kameraVar,
    /* tarama motoru — katalog.js seri taraması da bunları kullanır (aynı 'isbn'
       enum kusuru oradaydı); testler yedekKareCoz'a sahte EAN-13 tuvali verir */
    tarayiciKur, yedekYukle, yedekKareCoz, yedekVideoCoz, kameraKisitlari, odaklan, kameraHataAdi };
})();
