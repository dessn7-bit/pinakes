/* Kitaplık — cihazlar arası senkron eklentisi (Firebase RTDB + anonim kimlik)
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir.
   Kart arayüzünü kendi enjekte eder, kendi olaylarını dinler, depoKaydet'i sarmalar. */
'use strict';
(function(){
  const SENKRON_URL = 'https://kitaplik-sync-default-rtdb.europe-west1.firebasedatabase.app';
  const SENKRON_KEY = 'AIzaSyD1G8pR2wKXnekFe_7f-lNyYwHKaH2GRiw';
  const AYAR_ANAHTAR = 'kk_senkron_v1';
  const ANLIK_ANAHTAR = 'kk_senkron_anlik_v1';

  let ayar = null, kimlik = null, zaman = null, calisiyor = false;
  let eskiSurum = false;   // odada daha yeni şema görüldü → bu oturumda senkron durur
  let bekleyen = false;    // senkron uçuştayken kayıt yapıldı → bitince yeniden planla
  let semaDustu = false;   // odaya eski istemci yazmış (şema geriledi) → uyarı satırı
  let semaDusukGecis = false; // düşük şemada BİR tur atlanır; sonraki tur şemayı geri yazar
  let yazimSayaci = 0;     // her depoKaydet'te artar — PUT uçuşunda kayıt yapıldığını yakalar
  let bekleyenIzler = null;// depo yazımı düşen turun izleri: bellek tabanı — bayat disk
                           // tabanı sonraki damgala'da değişmemiş kitapları taze damgalayıp
                           // LWW'de bayat içeriği kazandırırdı (damga enflasyonu)

  const kurulu = () => SENKRON_URL.indexOf('__SYNC') !== 0;
  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ayarYukle(){ try{ return JSON.parse(localStorage.getItem(AYAR_ANAHTAR)) || null; }catch(e){ return null; } }
  function ayarKaydet(a){
    ayar = a;
    try{ a ? localStorage.setItem(AYAR_ANAHTAR, JSON.stringify(a)) : localStorage.removeItem(AYAR_ANAHTAR); }catch(e){ window._iz && window._iz('senkronAyarKaydet', e); }
  }
  function bildir(m){ if(typeof toast === 'function') toast(m); }

  /* ---------- damgalama: depoKaydet sarmalayıcısı ---------- */
  const ANLIK_SURUM = 12;
  /* SEMA_SURUM: PUT gövdesine yazılan VERİ şeması numarası (parmak izi deposu
     sürümü olan ANLIK_SURUM'dan ayrı — o iz biçimi için de artar). Odadaki sema
     yerelden BÜYÜKSE bu istemci eskidir: birleştirme + yazma tümüyle durur.
     "Salt-okur birleşme" bile güvensizdi — eski normalize bilmediği alanları
     budar, budanmış yerel kopya eşit damgada sonraki turda odayı ezerdi. */
  const SEMA_SURUM = 5;   // 5: ozet düğümüne o (ontoloji) eklendi (v13) · 4: ayrı düğüm · 3: ozet · 2: gsG
  /* v1'de her kitabın TAM JSON'u parmak izi olarak saklanıyordu: kütüphanenin
     ikinci bir kopyası kadar yer tutuyor, localStorage kotasını iki katına
     yakın hızda dolduruyordu. v2 kısa çift-hash tutar (~20 karakter/kitap).
     v3: kitapNormalize'a kapakYerel eklendi — normalize çıktısı değiştiği için
     TÜM parmak izleri değişir; sürüm artmasaydı ilk açılış bütün kütüphaneyi
     taze damgalar, bayat cihaz güncel düzenlemeleri ezerdi. KURAL: kitapNormalize
     şeması her değiştiğinde bu sürüm de artmalı (göç turu damga basmaz).
     v4: ertelemeTarihi eklendi (öneri motoru "Şimdi değil").
     v5: notlara tekrar* alanları eklendi (aralıklı alıntı tekrarı, tekrar.js).
     v6: kitapParmak notların tekrar* alanlarını dışlar (iz biçimi değişti) —
     otomatik zamanlama damga üretmesin, LWW zehirlenmesin diye.
     v7: notlara ng (not damgası) + kitaba silinenNotlar (not mezar taşı)
     eklendi — dizi birleşimi ve not silme kalıcılığı için (SEMA_SURUM 1).
     v8: kitaba gsG (guncelSayfa damgası) eklendi — düzeltme/sıfırlama senkronda
     korunur, damgalar eşitse koşullu max sürer (SEMA_SURUM 2).
     v9: kitaba puanYok eklendi (hızlı puanlama "hatırlamıyorum"). SEMA_SURUM
     BİLİNÇLİ artmadı: eski istemcinin budaması yalnız işareti düşürür (kitap
     yeniden kuyruğa girer — düşük zarar, gsG'deki veri kaybı sınıfı değil);
     SEMA artışı ise güncellenmemiş cihazın senkronunu tümüyle dondururdu.
     v10: kitaba adTr eklendi (yabancı başlığın Türkçe adı). SEMA yine sabit —
     yerleşik 88 kayıt budama kaybında tek dokunuşla geri gelir; ELLE girilen
     adTr içinse kayıp v9 sınıfının genel kabulüne tabidir (eski istemcinin
     gerçek düzenlemesi ezebilir — tek kullanıcı + hızlı SW güncellemesi
     penceresinde kabul edilen risk).
     v11: kitaba ozet + ozetG eklendi (kitabın bütününe dair kullanıcı
     değerlendirmesi — alıntı/nottan ayrı kavram). SEMA_SURUM 2→3 (v9/v10'un
     aksine): ozet ELLE yazılan uzun metindir, eski istemcinin budaması KALICI
     emek kaybı olur (adTr'nin "yerleşik listeden geri gelir" güvencesi yok,
     puanYok'un "yeniden kuyruğa girer" düşük-zararı yok) — gsG'yle aynı
     veri-kaybı sınıfı. Bedeli: güncellenmemiş cihazın senkronu güncellenene
     dek donar (durum ekranı bunu söylüyor; SW network-first hızla günceller).
     v12: ozet METNİ kitap kaydından çıktı (IndexedDB + AYRI senkron düğümü —
     ölçüm: 242 uzun özet ana PUT gövdesini 3,2 MB yapardı, işaretlerle 148 KB).
     Kitapta yalnız ozetVar/ozetUzunluk/ozetG işaretleri. kitapParmak ozet*
     alanlarını DIŞLAR (ayrı kanalın kendi damgası var; işaret değişimi kitap
     damgası üretmesin — tekrar* emsali). SEMA_SURUM 3→4: v79 istemcisi kitap
     gövdesinde metin bekler/yazar, karışık sürüm ödünleşemez → eski cihaz
     donar (v11 kararının devamı).
     v13: özet düğümü kaydına o (ONTOLOJİ) alanı eklendi ({m,g} → {m,g,o},
     tek damga ikisini kapsar). SEMA_SURUM 4→5: eski v80 istemcinin çok-yollu
     PATCH'i k/<id>'yi {m,g} ile BÜTÜN değiştirir — düğümdeki o'yu siler,
     sonraki indirme yerel ontolojiyi de ezerdi. Ontoloji elle yazılan uzun
     metin = v11/v12'deki veri-kaybı sınıfı → eski cihaz donar. */
  function anlikYukle(){
    try{
      const h = JSON.parse(localStorage.getItem(ANLIK_ANAHTAR));
      if(!h) return { izler: {}, goc: false };
      if(h.s === ANLIK_SURUM && h.p && typeof h.p === 'object') return { izler: h.p, goc: false };
      return { izler: {}, goc: true };   // v1 (veya bozuk) — göç: yeniden damgalama YAPMA
    }catch(e){ return { izler: {}, goc: true }; }
  }
  function anlikKaydet(izler){
    try{ localStorage.setItem(ANLIK_ANAHTAR, JSON.stringify({ s: ANLIK_SURUM, p: izler })); }catch(e){ window._iz && window._iz('anlikKaydet', e); }
  }
  function kitapParmak(k){
    const kopya = { ...k }; delete kopya.g;
    /* ozet* parmak izine GİRMEZ (v12): özet ayrı kanaldan, kendi damgasıyla
       (ozetG) senkronlanır — işaret değişimi kitap damgası üretseydi özet
       yazan cihaz kitabı LWW'de taze yapıp İLGİSİZ alan çakışmalarını
       etkilerdi; ayrıca v79 göçü tüm kütüphaneyi yeniden damgalardı. */
    delete kopya.ozet; delete kopya.ozetVar;
    delete kopya.ozetUzunluk; delete kopya.ozetG;
    /* Notların tekrar* alanları parmak izine GİRMEZ: yayılma zamanlaması
       (tekrar.js planlamaYap) her cihazda kendi kendine koşan türetilmiş bir
       defter kaydıdır — parmak izini değiştirseydi salt-render yapan cihaz
       kitabı taze damgalar, LWW birleşmesinde gerçek düzenlemeyi ezerdi
       (kanıtlanmış senaryo: karşı cihazın yeni eklediği alıntı kalıcı silinir).
       Kasıtlı tekrar eylemleri (Devam/Daha sık/Yeter/başlat) damgayı tekrar.js
       içinde k.g'ye AÇIKÇA basar. */
    if(Array.isArray(kopya.notlar)) kopya.notlar = kopya.notlar.map(n => {
      const t = { ...n };
      delete t.tekrarSonraki; delete t.tekrarAralik;
      delete t.tekrarSayisi; delete t.tekrarDurum;
      return t;
    });
    const s = JSON.stringify(kopya);
    let h1 = 0x811c9dc5, h2 = 0x01000193;   // iki bağımsız karma → çakışma olasılığı ihmal edilebilir
    for(let i = 0; i < s.length; i++){
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) ^ c) >>> 0;
    }
    return s.length.toString(36) + '-' + h1.toString(36) + h2.toString(36);
  }
  /* Değişen/yeni kitaba zaman damgası basar, silinenler için mezar taşı bırakır.
     izleriYaz === false: parmak izleri KAYDEDİLMEZ, döndürülür — çağıran depo
     yazımı başarılı olursa kendisi kaydeder (M4b: iz depodan önce kalıcılaşırsa
     kota hatasında "değişiklik yok" sanılır, damga hiç basılmazdı). */
  function damgala(izleriYaz){
    if(typeof veri !== 'object' || !veri || !Array.isArray(veri.kitaplar)) return;
    const t = Date.now();
    const { izler: diskIzler, goc } = anlikYukle();
    // bellekteki bekleyen izler disk tabanının üstüne biner (kota turu telafisi)
    const onceki = bekleyenIzler ? { ...diskIzler, ...bekleyenIzler } : diskIzler;
    const simdiki = {};
    veri.silinenler = veri.silinenler || {};
    for(const k of veri.kitaplar){
      if(!k || !k.id) continue;
      const pf = kitapParmak(k);
      simdiki[k.id] = pf;
      // göç turunda parmak izi biçimi değiştiği için içerik değişmemiş sayılır:
      // aksi halde tüm kütüphane taze damgalanır ve bayat cihaz güncel olanı ezerdi
      /* v86: İZİ OLMAYAN ama damgası DOLU kitap da yeniden damgalanmaz — iz
         deposu boş cihaza (telefon sıfırlama + eski yedek) toplu şimdi-damgası
         basılıyor, bayat kopya odadaki günceli eziyor ve silinmişler
         diriliyordu (göç yorumundaki tehlikenin boş-depo ikizi). Kural kitap
         başına: damga taşıyan kitap geçmişi olan kitaptır, izi yoksa taban
         KURULUR (aşağıda simdiki'ye yazılır) ama damgası korunur; damgasız
         kitap (yeni eklenen) her zamanki gibi damgalanır. İlk kurulumla
         yedekten-dönüşü ayırt etmeye gerek kalmaz — ayrım g alanında. */
      if(!k.g || (!goc && (k.id in onceki) && onceki[k.id] !== pf)) k.g = t;
      if(veri.silinenler[k.id] && veri.silinenler[k.id] < k.g) delete veri.silinenler[k.id];
    }
    if(!goc) for(const id of Object.keys(onceki))
      if(!(id in simdiki) && !veri.silinenler[id]) veri.silinenler[id] = t;
    veri.hedefG = veri.hedefG || {};
    for(const yil of Object.keys(veri.hedef || {}))
      if(!veri.hedefG[yil]) veri.hedefG[yil] = t;
    veri.hedefSayfaG = veri.hedefSayfaG || {};
    for(const yil of Object.keys(veri.hedefSayfa || {}))
      if(!veri.hedefSayfaG[yil]) veri.hedefSayfaG[yil] = t;
    if(izleriYaz !== false) anlikKaydet(simdiki);
    return simdiki;
  }

  /* ---------- çok-sekme koruması (v86) ----------
     İki sekme aynı localStorage'ı paylaşır ama `veri` belleği sekme-başınadır.
     Sekme-1 yazdıktan sonra sekme-2 bayat belleğiyle yazarsa damgala, diskteki
     taze parmak izini "içerik değişmiş" sanıp BAYAT kitaba TAZE damga basar:
     sekme-1'in kaydı hem depodan silinir hem kaybeden içerik taze damga
     taşıdığı için kayıp odaya (tüm cihazlara) yayılırdı. İki katman:
     (1) her başarılı yazım jeton + BroadcastChannel duyurusu yapar; duyan
         sekme belleğini diskle BİRLEŞTİRİR (ezmez: bu sekmedeki kaydedilmemiş
         değişiklik LWW/dizi birleşiminde korunur, kullanıcı metni atılmaz);
     (2) yazım anında jeton kapısı — duyuru henüz işlenmemiş olsa bile yazımdan
         ÖNCE aynı birleşim koşar (localStorage okuması senkron, aynı thread).
     BroadcastChannel yoksa storage olayına düşülür. SEMA_SURUM'a dokunmaz:
     tamamen istemci-içi mekanizma, protokol değişmiyor. */
  const SEKME_ID = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const SEKME_ANAHTAR = 'kk_sekme_yazim_v1';
  let sekmeKanal = null;
  let bilinenYazim = null;
  function yazimIsaretle(){
    bilinenYazim = SEKME_ID + ':' + Date.now();
    try{ localStorage.setItem(SEKME_ANAHTAR, bilinenYazim); }
    catch(e){ /* jeton yazılamadı — öbür sekme bir sonraki kapıda diskle uzlaşır */ }
    try{ if(sekmeKanal) sekmeKanal.postMessage({ tur: 'yazildi', kaynak: SEKME_ID }); }catch(e){}
  }
  function sekmeUzlas(){
    let jeton = null;
    try{ jeton = localStorage.getItem(SEKME_ANAHTAR); }catch(e){}
    if(jeton === bilinenYazim) return false;   // araya başka sekmenin yazımı girmemiş
    bilinenYazim = jeton;
    try{
      const ham = localStorage.getItem('kk_kitaplik_v1');
      if(!ham) return false;
      const bir = birlestir(veri, JSON.parse(ham));
      veri.kitaplar = bir.kitaplar; veri.hedef = bir.hedef;
      veri.hedefG = bir.hedefG; veri.silinenler = bir.silinenler;
      veri.hedefSayfa = bir.hedefSayfa; veri.hedefSayfaG = bir.hedefSayfaG;
      veri.kesfetGizli = bir.kesfetGizli || {};
      veri.kesfetGizliGeri = bir.kesfetGizliGeri || {};
      veri.turRed = bir.turRed || {};
      veri.turRedGeri = bir.turRedGeri || {};
      return true;
    }catch(e){ window._iz && window._iz('sekmeUzlas', e); return false; }
  }
  function sekmeKur(){
    try{ bilinenYazim = localStorage.getItem(SEKME_ANAHTAR); }catch(e){}
    const tetik = () => { if(sekmeUzlas() && typeof hepsiniCiz === 'function') hepsiniCiz(); };
    try{
      if(typeof BroadcastChannel === 'function'){
        sekmeKanal = new BroadcastChannel('kk_sekmeler_v1');
        sekmeKanal.onmessage = m => { if(!m || !m.data || m.data.kaynak !== SEKME_ID) tetik(); };
        return;
      }
    }catch(e){ /* kanal kurulamadı — storage olayına düş */ }
    window.addEventListener('storage', e => { if(e && e.key === SEKME_ANAHTAR) tetik(); });
  }

  /* ---------- kimlik ---------- */
  async function kimlikAl(){
    const simdi = Date.now();
    if(kimlik && simdi - kimlik.sonAlim < 50*60*1000) return kimlik.idToken;
    if(kimlik && kimlik.refreshToken){
      try{
        const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + SENKRON_KEY, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ grant_type:'refresh_token', refresh_token: kimlik.refreshToken }) });
        const j = await r.json();
        if(j.id_token){ kimlik = { idToken:j.id_token, refreshToken:j.refresh_token, sonAlim:simdi }; return kimlik.idToken; }
      }catch(e){ window._iz && window._iz('tokenYenile', e); }
    }
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + SENKRON_KEY, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ returnSecureToken:true }) });
    const j = await r.json();
    if(!j.idToken) throw new Error('kimlik alinamadi');
    kimlik = { idToken:j.idToken, refreshToken:j.refreshToken, sonAlim:simdi };
    return j.idToken;
  }

  /* ---------- birleştirme ----------
     Skalerler: KİTAP bazında en yeni damga kazanır (alan başına damga tutmak
     depo + karmaşıklık maliyeti; kazanç sınırlı — KARAR). İstisna guncelSayfa:
     okuma ilerlemesi geri gitmez, büyük olan kazanır.
     DİZİLER (notlar/oturumlar/okumalar/odunc/seanslar): toplanabilir veridir,
     ezilmez — kimlik bazlı BİRLEŞİM. Etiket/fikir listeleri İSTİSNA: kazanan
     kopyadan aynen alınır (LWW) — bkz. kumeTekil notu. Silinen not, not mezar taşıyla
     (kitap kaydındaki silinenNotlar) ölü kalır; mezardan SONRA düzenlenen not
     (ng damgası) yeniden yaşar. Hepsi saf: yan etkisiz, testte doğrudan çağrılır. */
  function iKat(s){
    return (typeof iKatla === 'function') ? iKatla(s)
      : String(s == null ? '' : s).toLocaleLowerCase('tr');
  }
  /* etiket / fikir: verilen liste(ler)i TR (i-ailesi) mükerrersiz süz.
     Birleşimde KAZANANIN listesi AYNEN alınır (tek argüman = LWW) — küme
     birleşimi silinen etiketi karşı kopyadan diriltiyordu ve etiket bir daha
     silinemiyordu (kanıtlı kusur). Bedel: iki cihazda EŞ ZAMANLI eklenen
     farklı etiketlerden biri kaybolur — bilinçli KARAR (tek kullanıcı; kalıcı
     dirilme çok daha kötü). Tam çözüm etiket mezar taşı (OR-set) — rapor. */
  function kumeTekil(){
    const c = [], gor = new Set();
    for(const liste of arguments) for(const x of (Array.isArray(liste) ? liste : [])){
      const anahtar = iKat(x);
      if(!anahtar || gor.has(anahtar)) continue;
      gor.add(anahtar); c.push(x);
    }
    return c;
  }
  /* doğal anahtarlı dizi birleşimi: kazanan sırası korunur, kaybedene özgüler
     sona eklenir; aynı anahtarda sec() karar verir (yoksa kazanan kalır).
     Anahtarsız eleman (çok eski kayıt) birleştirilemez ama KAYBOLMAZ da. */
  function anahtarliBirlesim(kazanan, kaybeden, anahtar, sec){
    const h = new Map(), anahtarsiz = [];
    /* sec HER çakışmada uygulanır — taraflar ARASI ve taraf İÇİ (birleşim
       bozuk sıra bırakmışsa aynı güne iki seans doğabiliyordu; ilki sessizce
       yutulmasın). sec yoksa ilk gelen (kazanan tarafı) kalır. */
    const koy = e => {
      if(!e) return;
      const key = anahtar(e);
      if(!key){ anahtarsiz.push(e); return; }
      const mevcut = h.get(key);
      if(mevcut === undefined) h.set(key, e);
      else if(sec) h.set(key, sec(mevcut, e));
    };
    (Array.isArray(kazanan) ? kazanan : []).forEach(koy);
    (Array.isArray(kaybeden) ? kaybeden : []).forEach(koy);
    return [...h.values(), ...anahtarsiz];
  }
  function notlariBirlestir(kazanan, kaybeden){
    // not mezar taşları: iki tarafın birleşimi, en yeni silme zamanı kazanır
    const mezar = {};
    for(const kaynak of [kazanan.silinenNotlar, kaybeden.silinenNotlar])
      if(kaynak && typeof kaynak === 'object')
        for(const [id, t] of Object.entries(kaynak)){
          const n = Number(t);
          if(Number.isFinite(n) && n > 0 && (!mezar[id] || n > mezar[id])) mezar[id] = n;
        }
    const h = new Map(), idsiz = [];
    (Array.isArray(kazanan.notlar) ? kazanan.notlar : []).forEach(n => {
      if(!n) return;
      if(n.id) h.set(n.id, n); else idsiz.push(n);
    });
    (Array.isArray(kaybeden.notlar) ? kaybeden.notlar : []).forEach(n => {
      if(!n) return;
      if(!n.id){ idsiz.push(n); return; }
      const v = h.get(n.id);
      if(!v){ h.set(n.id, n); return; }
      /* aynı not iki tarafta: not damgası (ng) yeni olan BÜTÜNÜYLE kazanır
         (fikir listesi dahil — LWW), eşitlikte kitap-kazananı tarafı.
         fikir-sil ng bastığı için silen kopya yeni sayılır, silinen dirilmez. */
      const secilen = ((n.ng || 0) > (v.ng || 0)) ? n : v;
      h.set(n.id, { ...secilen, fikir: kumeTekil(secilen.fikir) });
    });
    const notlar = [];
    for(const [id, n] of h){
      if(mezar[id] && mezar[id] >= (n.ng || 0)) continue;  // silme daha yeni → not ölü
      if(mezar[id]) delete mezar[id];  // silmeden SONRA düzenlenmiş → yaşar, mezar kalkar
      notlar.push(n);
    }
    return { notlar: [...notlar, ...idsiz], silinenNotlar: mezar };
  }
  function kitapCiftiBirlestir(kazanan, kaybeden){
    const k = { ...kazanan };
    /* guncelSayfa: gsG (alan damgası — yalnız KULLANICI ilerleme girişleri basar)
       farklıysa YENİ damgalı taraf kazanır: kasıtlı en son giriş, düzeltme
       (250→25) dahil, senkronda korunur. Damgalar EŞİTSE (eski/damgasız veri)
       geri uyumlu kural: aynı okuma döngüsünde (iki kopya da 'okunuyor',
       okumalar arşiv boyu eşit) büyük kazanır, değilse kazananın değeri —
       koşulsuz max "Yeniden oku" sıfırlamasını kalıcı kilitliyordu. */
    const kGs = parseInt(kazanan.gsG) || 0, yGs = parseInt(kaybeden.gsG) || 0;
    if(kGs !== yGs){
      k.guncelSayfa = parseInt((kGs > yGs ? kazanan : kaybeden).guncelSayfa) || 0;
    }else{
      const ayniDongu = kazanan.durum === 'okunuyor' && kaybeden.durum === 'okunuyor'
        && (Array.isArray(kazanan.okumalar) ? kazanan.okumalar.length : 0) ===
           (Array.isArray(kaybeden.okumalar) ? kaybeden.okumalar.length : 0);
      k.guncelSayfa = ayniDongu
        ? Math.max(parseInt(kazanan.guncelSayfa) || 0, parseInt(kaybeden.guncelSayfa) || 0)
        : (parseInt(kazanan.guncelSayfa) || 0);
    }
    k.gsG = Math.max(kGs, yGs);
    /* ozet İŞARETLERİ (v12): metin artık kitap gövdesinde değil (ayrı düğüm,
       ozetBirlesim). Burada yalnız işaret alan-LWW'si: yeni ozetG'li tarafın
       ozetVar/ozetUzunluk'u kazanır — kitap-LWW kazananı işareti ezemez
       (v79 alan-damgası ilkesinin işaret hali). Göç penceresinden kalmış
       k.ozet miras alanı varsa yeni damgalı taraftan aynen taşınır (normalize
       koşullu geçiriyor; hedef cihaz kendi göçünde IDB'ye alır). */
    const kOz = parseInt(kazanan.ozetG) || 0, yOz = parseInt(kaybeden.ozetG) || 0;
    const ozIsaret = (kOz >= yOz) ? kazanan : kaybeden;
    k.ozetVar = ozIsaret.ozetVar === true || !!ozIsaret.ozet;
    k.ozetUzunluk = parseInt(ozIsaret.ozetUzunluk) || 0;
    k.ozetG = Math.max(kOz, yOz);
    if(ozIsaret.ozet) k.ozet = String(ozIsaret.ozet); else delete k.ozet;
    const nb = notlariBirlestir(kazanan, kaybeden);
    k.notlar = nb.notlar;
    k.silinenNotlar = nb.silinenNotlar;
    k.oturumlar = anahtarliBirlesim(kazanan.oturumlar, kaybeden.oturumlar,
      o => String(o.b || ''), (a, b) => ((b.s || 0) > (a.s || 0)) ? b : a);   // aynı oturum: tamamlanmış (uzun) hali
    k.okumalar = anahtarliBirlesim(kazanan.okumalar, kaybeden.okumalar,
      o => (o.bas || '') + '|' + (o.bit || ''), null);
    k.odunc = anahtarliBirlesim(kazanan.odunc, kaybeden.odunc,
      o => (o.kisi || '') + '|' + (o.verilis || ''), (a, b) => (!a.donus && b.donus) ? b : a); // iade kaydı ileridedir
    /* aynı gün seansları: iki dilim tek aralığa BİRLEŞİR (min a, max b) —
       taraf seçimi ilk dilimin sayfalarını yutuyordu */
    k.seanslar = anahtarliBirlesim(kazanan.seanslar, kaybeden.seanslar,
      s => String(s.t || ''), (a, b) => ({
        ...(((parseInt(b.b) || 0) > (parseInt(a.b) || 0)) ? b : a),
        a: Math.min(parseInt(a.a) || 0, parseInt(b.a) || 0),
        b: Math.max(parseInt(a.b) || 0, parseInt(b.b) || 0) }));
    k.etiketler = kumeTekil(kazanan.etiketler);   // LWW: kazanan kitabın listesi, TR-mükerrersiz
    /* Birleşim sırası kronolojik DEĞİLDİ (kaybedene özgü eski kayıt sona
       geliyordu): seansEkle "son eleman = bugün" varsayar, hız analizi sıraya
       bakar. Birleşimden sonra sırala; oturumda uygulama tavanı (400, oturumEkle)
       burada da uygulanır — yoksa budanan girişler odadan sonsuza dek dirilirdi. */
    k.oturumlar.sort((x, y) => (x.b || 0) - (y.b || 0));
    if(k.oturumlar.length > 400) k.oturumlar = k.oturumlar.slice(-400);
    k.seanslar.sort((x, y) => String(x.t || '').localeCompare(String(y.t || '')));
    k.okumalar.sort((x, y) => String(x.bas || x.bit || '').localeCompare(String(y.bas || y.bit || '')));
    k.odunc.sort((x, y) => String(x.verilis || '').localeCompare(String(y.verilis || '')));
    return k;
  }
  /* ---------- ÖZET DÜĞÜMÜ SENKRONU (v12) ----------
     Metin ana gövdeye GİRMEZ (ölçüm: girseydi her PUT 3,2 MB olurdu).
     Düğüm: /odalar/<oda>--ozet — ana odanın KARDEŞİ. Alt yol OLAMAZDI:
     ana senkron /odalar/<oda>.json'a TAM GÖVDE PUT atar, RTDB'de PUT verilen
     yolun tamamını değiştirir — alt düğüm her turda silinirdi. Kardeş anahtar
     RTDB kurallarına da uyar (odalar/$oda kapsamı, ad ≥6 harf).
     Yapı: izler/{id: g} (küçük fihrist, ~4 KB) + k/{id: {m, g}}.
     Akış: izler GET → damga farkı olan id'ler için tekil GET + ozetBirlesim →
     yerel yeni olanlar tekil PATCH (k/<id> + izler/<id> tek istekte, atomik).
     Böylece YALNIZ DEĞİŞEN özet gider (~14 KB/kayıt), tüm kütüphane değil.
     ETag KARARI: özet düğümünde if-match YOK. Gerekçe: (1) yazım per-kitap,
     ana gövdenin "tam-gövde ezme" riski burada yok; (2) ozetBirlesim
     deterministik ve idempotent — eş-zamanlı yazımda geç kalan taraf sonraki
     turda uzağı indirir, ÇAKIŞMA EKİ metni korur, yakınsar (kayıp penceresi
     yok, yalnız bir tur gecikme); (3) 242 kayıt için ayrı ETag defteri
     karmaşıklık/kazanç oranıyla savunulamaz. */
  function ozetBirlesim(a, b){
    const aG = parseInt(a && a.g) || 0, bG = parseInt(b && b.g) || 0;
    let mY = String(((aG >= bG) ? a && a.m : b && b.m) || '');
    let mE = String(((aG >= bG) ? b && b.m : a && a.m) || '');
    /* o = ONTOLOJİ (v13): aynı kayıtta ikinci metin alanı — tek damga (g)
       ikisini birden kapsar; m kuralları o'ya SİMETRİK uygulanır (çakışma
       eki, kasıtlı silme, damgasız yedek). Ayrı kanal AÇILMADI (karar). */
    let oY = String(((aG >= bG) ? a && a.o : b && b.o) || '');
    let oE = String(((aG >= bG) ? b && b.o : a && a.o) || '');
    /* eşit damga + farklı metin: sıra LEKSİKOGRAFİK — iki cihaz simetrik
       birleştirse de aynı birleşiği üretir (yakınsama) */
    if(aG === bG && mY && mE && mY !== mE){ const s = [mY, mE].sort(); mY = s[0]; mE = s[1]; }
    if(aG === bG && oY && oE && oY !== oE){ const s = [oY, oE].sort(); oY = s[0]; oE = s[1]; }
    const mEk = !!(mY && mE && mY.indexOf(mE) < 0);
    const oEk = !!(oY && oE && oY.indexOf(oE) < 0);
    const m = mEk ? mY + '\n\n— · —\nÇakışan özet (diğer cihazdan):\n\n' + mE : mY;
    const o = oEk ? oY + '\n\n— · —\nÇakışan ontoloji (diğer cihazdan):\n\n' + oE : oY;
    if(mEk || oEk) return { m, g: Date.now(), o };   // ek üretildi → taze damga (yakınsama)
    if(Math.max(aG, bG) === 0) return { m: mY || mE, g: 0, o: oY || oE };   // dış yedek: damgasız metin taşınır
    return { m, g: Math.max(aG, bG), o };   // yeni metin YA DA kasıtlı silme (boş + damga) kazanır
  }
  let ozCalisiyor = false;
  async function ozetSenkronEt(){
    if(!ayar || !ayar.oda || !kurulu() || eskiSurum || !window.__ozet) return false;
    if(ozCalisiyor) return false;
    ozCalisiyor = true;
    try{
      await window.__ozet.hazirBekle();
      const tok = await kimlikAl();
      const kok = SENKRON_URL.replace(/\/+$/, '') + '/odalar/' + encodeURIComponent(ayar.oda + '--ozet');
      const r = await fetch(kok + '/izler.json?auth=' + tok);
      if(!r.ok) throw new Error('özet izleri ' + r.status);
      const uzakIzler = (await r.json()) || {};
      const idler = new Set(Object.keys(uzakIzler));
      for(const k of (veri.kitaplar || []))
        if(k && k.id && (parseInt(k.ozetG) || window.__ozet.damga(k.id))) idler.add(String(k.id));
      const gonder = [];
      let indirilen = 0;
      for(const id of idler){
        const yerelG = window.__ozet.damga(id);
        const uzakG = parseInt(uzakIzler[id]) || 0;
        if(uzakG > yerelG){
          const rr = await fetch(kok + '/k/' + encodeURIComponent(id) + '.json?auth=' + tok);
          if(!rr.ok) continue;   // fihristte var ama kayıt okunamadı: bu turu atla, gelecek tur dener
          const uzak = (await rr.json()) || {};
          const b = ozetBirlesim({ m: uzak.m, g: uzak.g, o: uzak.o },
            { m: window.__ozet.oku(id), g: yerelG, o: window.__ozet.okuOnto(id) });
          await window.__ozet.kaydetHam(id, b.m, b.g, b.o);
          indirilen++;
          // birleşim uzaktan farklıysa (çakışma eki üretti) uzağa da yazılmalı
          if(b.m !== String(uzak.m || '') || b.g !== (parseInt(uzak.g) || 0)
            || String(b.o || '') !== String(uzak.o || '')) gonder.push(id);
        }else if(yerelG > uzakG) gonder.push(id);
      }
      for(const id of gonder){
        const m = window.__ozet.oku(id), g = window.__ozet.damga(id);
        const o = window.__ozet.okuOnto(id);
        // o boşsa alan HİÇ yazılmaz (düğüm şişmesin); PATCH k/<id>'yi bütün
        // değiştirdiği için boş o alanı zaten kayıttan düşer
        const y = await fetch(kok + '/.json?auth=' + tok, { method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ['k/' + id]: (o ? { m, g, o } : { m, g }), ['izler/' + id]: g }) });
        if(!y.ok) throw new Error('özet yazma ' + y.status);
      }
      if(indirilen){
        if(typeof depoKaydet === 'function') depoKaydet();   // işaretler kalıcılaşsın
        if(typeof hepsiniCiz === 'function') hepsiniCiz();
      }
      return true;
    }catch(e){ return false; }
    finally{ ozCalisiyor = false; }
  }

  function birlestir(yerel, uzak){
    const silinenler = { ...((uzak && uzak.silinenler) || {}) };
    for(const [id, t] of Object.entries((yerel && yerel.silinenler) || {}))
      if(!silinenler[id] || t > silinenler[id]) silinenler[id] = t;

    /* kesfetGizli (v51): Keşfet-B "İlgilenmiyorum" tercihi — silinenler'le aynı
       ÖZ-DAMGALI UNION deseni (mezar taşı değil, kalıcı tercih): iki cihaz
       farklı öneri gizlediyse İKİSİ de gizli kalır, LWW birini kaybederdi. */
    const kesfetGizli = { ...((uzak && uzak.kesfetGizli) || {}) };
    for(const [anah, t] of Object.entries((yerel && yerel.kesfetGizli) || {}))
      if(!kesfetGizli[anah] || t > kesfetGizli[anah]) kesfetGizli[anah] = t;
    /* kesfetGizliGeri (v62): gizlemenin GERİ ALMA kayıtları — silinenler mezar
       taşı deseninin birebiri, o da UNION. Union'dan kayıt SİLMEK öbür cihazın
       kopyasından geri dirilirdi; geri alma bu ayrı haritada yaşar. Etkin
       gizlilik = gizli damgası > geri damgası (kesfet.js bGizliMi). */
    const kesfetGizliGeri = { ...((uzak && uzak.kesfetGizliGeri) || {}) };
    for(const [anah, t] of Object.entries((yerel && yerel.kesfetGizliGeri) || {}))
      if(!kesfetGizliGeri[anah] || t > kesfetGizliGeri[anah]) kesfetGizliGeri[anah] = t;
    /* turRed (v66): otomatik türü geri alınan kitaplar — kalıcı red, aynı
       ÖZ-DAMGALI UNION. Cihaz-yerel kalsaydı öbür cihazın açılış taraması
       reddedilen türü yeniden yazar, senkron da geri taşırdı. */
    const turRed = { ...((uzak && uzak.turRed) || {}) };
    for(const [id, t] of Object.entries((yerel && yerel.turRed) || {}))
      if(!turRed[id] || t > turRed[id]) turRed[id] = t;
    /* turRedGeri (v91): reddin GERİ ALMA kayıtları — kesfetGizliGeri deseninin
       birebiri. Union'dan kayıt silmek öbür cihazdan dirilirdi; geri alma ayrı
       öz-damgalı haritada yaşar. Etkin red = red damgası > geri damgası
       (zengin.js redAktif). */
    const turRedGeri = { ...((uzak && uzak.turRedGeri) || {}) };
    for(const [id, t] of Object.entries((yerel && yerel.turRedGeri) || {}))
      if(!turRedGeri[id] || t > turRedGeri[id]) turRedGeri[id] = t;

    const ciftler = new Map();   // id → { u: uzak kopya, y: yerel kopya }
    ((uzak && uzak.kitaplar) || []).forEach(k => { if(k && k.id) ciftler.set(k.id, { u: k }); });
    ((yerel && yerel.kitaplar) || []).forEach(k => {
      if(!k || !k.id) return;
      const c = ciftler.get(k.id);
      if(c) c.y = k; else ciftler.set(k.id, { y: k });
    });

    const kitaplar = [];
    for(const [id, c] of ciftler){
      let k;
      if(c.u && c.y){
        const kazanan = ((c.y.g || 0) >= (c.u.g || 0)) ? c.y : c.u;   // eşitlikte yerel (mevcut kural)
        k = kitapCiftiBirlestir(kazanan, kazanan === c.y ? c.u : c.y);
      }else k = c.u || c.y;
      const mezar = silinenler[id];
      if(mezar && mezar >= (k.g||0)) continue;
      const kayit = (typeof kitapNormalize === 'function') ? kitapNormalize(k) : k;
      kayit.g = k.g || 0;
      kitaplar.push(kayit);
    }

    const hedef = { ...((uzak && uzak.hedef) || {}) };
    const hedefG = { ...((uzak && uzak.hedefG) || {}) };
    for(const [yil, v] of Object.entries((yerel && yerel.hedef) || {})){
      const yg = ((yerel && yerel.hedefG) || {})[yil] || 0;
      if(!(yil in hedef) || yg >= (hedefG[yil]||0)){ hedef[yil] = v; hedefG[yil] = yg; }
    }
    // Sayfa hedefi: kitap hedefiyle aynı desen, kendi damgasıyla (hedefSayfaG)
    const hedefSayfa = { ...((uzak && uzak.hedefSayfa) || {}) };
    const hedefSayfaG = { ...((uzak && uzak.hedefSayfaG) || {}) };
    for(const [yil, v] of Object.entries((yerel && yerel.hedefSayfa) || {})){
      const yg = ((yerel && yerel.hedefSayfaG) || {})[yil] || 0;
      if(!(yil in hedefSayfa) || yg >= (hedefSayfaG[yil]||0)){ hedefSayfa[yil] = v; hedefSayfaG[yil] = yg; }
    }
    return { kitaplar, hedef, hedefG, hedefSayfa, hedefSayfaG, silinenler, kesfetGizli, kesfetGizliGeri, turRed, turRedGeri };
  }

  /* ---------- senkron ---------- */
  async function senkronEt(sessiz){
    if(!ayar || !ayar.oda || !kurulu() || eskiSurum) return false;
    /* M4a: uçuş sırasındaki çağrı yutulmaz — bitince yeniden planlanır ki
       senkron devam ederken yapılan kayıt bir sonraki kaydı beklemeden gitsin */
    if(calisiyor){ bekleyen = true; return false; }
    calisiyor = true;
    const odaBasta = ayar.oda;   // uçuş sırasında kes/oda-değiştir yarışına karşı
    const yol = SENKRON_URL.replace(/\/+$/, '') + '/odalar/' + encodeURIComponent(ayar.oda) + '.json';
    try{
      sekmeUzlas();   // v86: birleşime taze bellek girsin (bayat bellekle PUT diski ezmesin)
      const tok = await kimlikAl();
      /* M1 (TOCTOU): RTDB ETag/if-match — GERÇEK sunucuda doğrulandı
         (X-Firebase-ETag → ETag; bayat if-match → 412). Araya yazan olursa
         PUT 412 döner; GET-birleştir-PUT en fazla 3 kez tekrarlanır (kısa
         rastgele bekleme) — araya girenin verisi taze GET'le birleşime girer,
         kaybolmaz. ETag başlığı gelmezse (beklenmedik ara katman) korumasız
         eski davranışa düşülür. */
      for(let deneme = 0; deneme < 3; deneme++){
        const r = await fetch(yol + '?auth=' + tok, { headers: { 'X-Firebase-ETag': 'true' } });
        if(!r.ok) throw new Error('okuma ' + r.status);
        const etag = r.headers.get('ETag');
        const uzak = (await r.json()) || {};
        const uzakSema = parseInt(uzak.sema) || 0;
        /* Şema koruması: odada daha yeni istemcinin verisi varsa bu istemci NE
           birleştirir NE yazar — dokunmamak tek güvenli seçenek (üstteki not). */
        if(uzakSema > SEMA_SURUM){
          eskiSurum = true;
          durumCiz();
          if(!sessiz) bildir('Bu cihaz eski sürümde — güncellemek için uygulamayı kapatıp aç');
          return false;
        }
        /* M3: oda şeması daha önce görülenin ALTINDAYSA eski sürümlü bir cihaz
           tam gövde yazıp sema alanını silmiş demektir. Bir tur atlanır (uyarı),
           sonraki tur PUT şemayı geri yazar — pencere daraltma, tam çözüm değil:
           eski istemci aktif kaldıkça dönüşümlü sürer. */
        if(uzakSema < ((ayar && ayar.sonSema) || 0)){
          if(!semaDusukGecis){
            semaDusukGecis = true;
            semaDustu = true;
            durumCiz();
            if(!sessiz) bildir('Odaya eski sürümlü bir cihaz yazmış — bu tur atlandı');
            planla();   // salt-okur oturumda da sonraki tur gelsin, şema geri yazılsın
            return false;
          }
          semaDusukGecis = false;   // ikinci tur: yaz ve şemayı geri koy
        }
        const sayacOnce = yazimSayaci;   // birleşim bu andaki verinin görüntüsü
        const bir = birlestir(veri, uzak);
        const basliklar = { 'Content-Type': 'application/json' };
        if(etag) basliklar['if-match'] = etag;
        const y = await fetch(yol + '?auth=' + tok, {
          method:'PUT', headers: basliklar,
          body: JSON.stringify({ ...bir, sema: SEMA_SURUM,
            cihazlar: { ...(uzak.cihazlar||{}), [ayar.cihaz || 'cihaz']: Date.now() } }) });
        if(y.status === 412){   // araya yazan oldu: taze gövdeyle yeniden birleştirilecek
          await new Promise(c => setTimeout(c, 120 + Math.random() * 280));
          continue;
        }
        if(!y.ok) throw new Error('yazma ' + y.status);

        /* KRİTİK koruma: PUT uçuşu sırasında kullanıcı kayıt yaptıysa (sayaç
           ilerledi) ya da oda değişti/kesildiyse birleşim görüntüsü BAYATTIR —
           yerele uygulamak uçuştaki düzenlemeyi bellek+depo+iz tabanından birden
           silerdi (kanıtlı senaryo). Yerele DOKUNMA: oda birleşik gövdeyi aldı,
           bir sonraki tur taze yerelle yeniden birleştirir. */
        if(yazimSayaci !== sayacOnce || !ayar || ayar.oda !== odaBasta){
          if(ayar && ayar.oda === odaBasta){
            bekleyen = true;
            ayarKaydet({ ...ayar, sonSenkron: Date.now(),
              sonSema: Math.max(uzakSema, SEMA_SURUM, ayar.sonSema || 0) });
          }
          durumCiz();
          return true;
        }

        veri.kitaplar = bir.kitaplar; veri.hedef = bir.hedef;
        veri.hedefG = bir.hedefG; veri.silinenler = bir.silinenler;
        veri.hedefSayfa = bir.hedefSayfa; veri.hedefSayfaG = bir.hedefSayfaG;
        veri.kesfetGizli = bir.kesfetGizli || {};
        veri.kesfetGizliGeri = bir.kesfetGizliGeri || {};
        veri.turRed = bir.turRed || {};
        veri.turRedGeri = bir.turRedGeri || {};
        /* M4b: önce depo, başarılıysa parmak izi — ters sıra kota hatasında
           taze iz + bayat depo uyumsuzluğu bırakıyordu */
        let depoTamam = true;
        try{ localStorage.setItem('kk_kitaplik_v1', JSON.stringify(veri)); }
        catch(e){ depoTamam = false; if(typeof kotaUyariGoster === 'function') kotaUyariGoster(); }
        const anlik = {};
        veri.kitaplar.forEach(k => { anlik[k.id] = kitapParmak(k); });
        if(depoTamam){ anlikKaydet(anlik); bekleyenIzler = null; yazimIsaretle(); }   // v86: sekmelere duyur
        else bekleyenIzler = anlik;   // bellek tabanı: damga enflasyonu önlenir

        /* semaDustu bilerek SIFIRLANMAZ: şema geri yazılsa da eski sürümlü cihaz
           dışarıda durur, uyarı o cihaz güncellenene dek (bu oturum boyu) kalmalı.
           semaDusukGecis ise olay-başına: sonraki gerileme yine bir tur atlasın. */
        semaDusukGecis = false;
        ayarKaydet({ ...ayar, sonSenkron: Date.now(),
          sonSema: Math.max(uzakSema, SEMA_SURUM, (ayar && ayar.sonSema) || 0) });
        if(typeof hepsiniCiz === 'function') hepsiniCiz();
        durumCiz();
        if(!sessiz) bildir('Senkron tamam — ' + veri.kitaplar.length + ' kitap');
        ozetSenkronEt().catch(() => {});   // v12: özet düğümü ayrı kanaldan, ana turu bloklamaz
        return true;
      }
      // 3 denemede de çakışma: veri yerelde güvende, dürüstçe söyle, yeniden dene
      durumCiz();
      if(!sessiz) bildir('Senkron çakışması — birazdan yeniden denenecek');
      planla();
      return false;
    }catch(e){
      durumCiz();
      if(!sessiz) bildir('Senkron başarısız — bağlantını ve oda adını kontrol et');
      planla(30000);   // geçici ağ hatası kendiliğinden telafi edilsin (seyrek: 30 sn)
      return false;
    }finally{
      calisiyor = false;
      if(bekleyen){ bekleyen = false; planla(); }   // M4a: uçuştaki kayıt gönderilsin
    }
  }
  function planla(gecikme){
    if(!ayar || !ayar.oda) return;
    clearTimeout(zaman);
    zaman = setTimeout(() => senkronEt(true), gecikme || 4000);
  }

  /* ---------- arayüz ---------- */
  function kartEkle(){
    /* v56: konum YUVA ile sabit ("Senkron" bölümü). Eskiden .yedek-wrap'ın
       BAŞINA sokuluyordu; katalog.js de aynısını yapıyordu, yani ikisinin
       sırası hangisinin sonra koştuğuna bağlıydı. Yuva yoksa eski yola düşer. */
    const yuva = document.getElementById('ayYuvaSenkron');
    const kap = yuva || document.querySelector('.yedek-wrap');
    if(!kap || document.getElementById('senkronKart')) return;
    const kart = document.createElement('div');
    kart.className = 'ay-blok';
    kart.id = 'senkronKart';
    kart.innerHTML =
      '<h3 class="ay-baslik">Cihazlar arası senkron</h3>' +
      '<p class="ay-not" id="senkronDurum"></p>' +
      '<div id="senkronForm">' +
        '<label for="s-oda">Oda adı</label>' +
        '<input id="s-oda" placeholder="ör. kabir-kitaplik-7431" autocomplete="off">' +
        '<label for="s-cihaz">Bu cihazın adı</label>' +
        '<input id="s-cihaz" placeholder="ör. Telefon" autocomplete="off">' +
        '<div class="ay-eylem" style="margin-top:12px">' +
          '<button class="btn btn-cerceve" data-act="senkron-bagla">Bağlan ve senkronize et</button>' +
        '</div>' +
      '</div>' +
      '<div id="senkronBagli" style="display:none">' +
        '<div class="ay-eylem">' +
          '<button class="btn btn-cerceve" data-act="senkron-simdi">Şimdi senkronize et</button>' +
          '<button class="btn btn-cerceve" data-act="senkron-kes">Bağlantıyı kes</button>' +
        '</div>' +
      '</div>';
    yuva ? kap.appendChild(kart) : kap.insertBefore(kart, kap.firstChild);
  }
  function durumCiz(){
    /* v106: Ayarlar durum şeridi aynı anda tazelenir — şerit senkron
       kontrollerinin ÜSTÜNDE duruyor, "Şimdi senkronize et"ten sonra bayat
       kalmamalı. Kanca isteğe bağlı: index.html eski sürümse sessiz geçer. */
    if(typeof window.aydSeritCiz === 'function') window.aydSeritCiz();
    const dEl = document.getElementById('senkronDurum');
    if(!dEl) return;
    const form = document.getElementById('senkronForm'), bagli = document.getElementById('senkronBagli');
    if(!kurulu()){
      form.style.display = 'none'; bagli.style.display = 'none';
      dEl.textContent = 'Senkron bu sürümde henüz yapılandırılmamış.';
      return;
    }
    if(eskiSurum){
      form.style.display = 'none';
      if(bagli) bagli.style.display = 'none';
      dEl.innerHTML = (window.ikon?window.ikon('uyari'):'') + ' <b>Bu cihaz eski sürümde</b> — odadaki veri daha yeni bir uygulama ' +
        'sürümüyle yazılmış. Veri kaybını önlemek için senkron duraklatıldı. ' +
        'Güncellemek için uygulamayı kapatıp yeniden aç.';
      return;
    }
    if(ayar && ayar.oda){
      form.style.display = 'none'; bagli.style.display = 'block';
      const ne = ayar.sonSenkron
        ? new Date(ayar.sonSenkron).toLocaleString('tr-TR', { dateStyle:'short', timeStyle:'short' })
        : 'henüz yok';
      dEl.innerHTML = (semaDustu
          ? (window.ikon?window.ikon('uyari'):'') + ' Odaya <b>eski sürümlü</b> bir cihaz yazmış — o cihazda uygulamayı kapatıp açmalısın. ' +
            'Koruma için bir senkron turu atlandı.<br>'
          : '') +
        'Bağlı — oda <b>' + kacir(ayar.oda) + '</b>, bu cihaz: <b>' + kacir(ayar.cihaz || '-') +
        '</b>.<br>Son senkron: ' + ne + '. Değişiklikler birkaç saniye içinde kendiliğinden gönderilir.';
    }else{
      form.style.display = 'block'; bagli.style.display = 'none';
      dEl.textContent = 'Telefon, laptop ve tabletin aynı kütüphaneyi görsün. Aynı oda adını girdiğin her cihaz senkronize olur — oda adını kimseyle paylaşma, şifren gibidir.';
    }
  }

  /* ---------- bağlanma ---------- */
  function baslat(){
    ayar = ayarYukle();
    sekmeKur();   // v86: çok-sekme kanalı + jeton tabanı
    kartEkle(); durumCiz();

    // depoKaydet'i sarmala: her kayıtta damga + otomatik senkron
    if(typeof window.depoKaydet === 'function' && !window.depoKaydet.__senkron){
      const asil = window.depoKaydet;
      const sarmal = function(){
        yazimSayaci++;   // PUT uçuşundaki kayıtları senkron başarı yolu fark etsin
        /* v86 çok-sekme kapısı: başka sekme bizden sonra yazdıysa bellek
           bayattır — damga basılmadan ÖNCE diskle birleşilir ki bayat içeriğe
           taze damga basılıp öbür sekmenin kaydı ezilmesin. */
        if(sekmeUzlas() && typeof hepsiniCiz === 'function') setTimeout(hepsiniCiz, 0);
        // Damgayı ÖNCE bas (g değerleri yazılacak JSON'a girer), izleri SONRA
        // kaydet: depo yazımı kota yüzünden düşerse parmak izi de kalıcılaşmaz
        // (M4b) — aksi halde bayat depo taze iz tabanıyla "değişmemiş" sayılırdı.
        let izler = null;
        try{ izler = damgala(false); }catch(e){ window._iz && window._iz('depoDamgala', e); }
        const s = asil.apply(this, arguments);
        if(s !== false && izler){ anlikKaydet(izler); bekleyenIzler = null; }
        else if(izler) bekleyenIzler = izler;   // bellek tabanı: damga enflasyonu önlenir
        if(s !== false) yazimIsaretle();   // v86: öbür sekmeler belleğini tazelesin
        planla();
        return s;
      };
      sarmal.__senkron = true;
      window.depoKaydet = sarmal;
    }

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      const act = el.dataset.act;
      if(act === 'senkron-bagla'){
        const oda = document.getElementById('s-oda').value.trim();
        const cihaz = document.getElementById('s-cihaz').value.trim() || 'Cihaz';
        if(oda.length < 6){ bildir('Oda adı en az 6 karakter olmalı — tahmin edilmesi zor bir şey seç'); return; }
        ayarKaydet({ oda, cihaz, sonSenkron: null });
        damgala(); durumCiz(); senkronEt(false);
      }else if(act === 'senkron-simdi'){
        senkronEt(false);
      }else if(act === 'senkron-kes'){
        if(confirm('Senkron kapatılsın mı? Kitapların bu cihazda kalır, diğer cihazlarla alışverişi durur.')){
          ayarKaydet(null); durumCiz(); bildir('Senkron kapatıldı');
        }
      }
    });

    // ilk açılışta damga tabanı + senkron
    damgala();
    if(ayar && ayar.oda) senkronEt(true);
  }

  if(document.querySelector('.yedek-wrap')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  // test kancaları
  /* durumOzet (v106): Ayarlar durum ŞERİDİ için ham veri. durumCiz PENCERE İÇİ
     cümleyi kurar; şerit tek satır ister. İkisi de aynı 'ayar' nesnesinden
     beslensin diye cümle DEĞİL veri dışa verilir — şerit kendi dilini kurar,
     iki metin birbirinden sapmaz. */
  function durumOzet(){
    return {
      kurulu: kurulu(),
      bagli: !!(ayar && ayar.oda) && !eskiSurum,
      eskiSurum: !!eskiSurum,
      oda: (ayar && ayar.oda) || '',
      sonSenkron: (ayar && ayar.sonSenkron) || null
    };
  }
  window.__senkron = { birlestir, damgala, senkronEt, durumCiz, ayarKaydet, kurulu,
    ozetBirlesim, ozetSenkronEt, durumOzet, ANLIK_SURUM, SEMA_SURUM };
})();
