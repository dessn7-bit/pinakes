/* Hatırlatma (push bildirimi) — alıntı tekrarı vakti gelince günde en fazla
   bir kez "N alıntı seni bekliyor" bildirimi. Kendi kendine yeten modül:
   index.html'de tek satırlık script etiketiyle yüklenir.
   AD ALANI: sınıflar ve data-act değerleri 'ht-' önekli, id'ler 'ht' önekli.

   MİMARİ (gizlilik önce):
   - Alıntı METNİ sunucuya ASLA gitmez. Sunucu (kitaplik-bildirim worker'ı)
     yalnız "uyan" sinyali yollar — push PAYLOAD'SIZDIR. Bildirim metnini
     service worker, bu dosyanın IndexedDB'ye yazdığı ÖZETTEN üretir.
   - Özet (kk_bildirim_v1 / 'ozet' / 'guncel'): { vadeler:[ISO gün...],
     ornekMetin (90 karaklık kırpık), guncelleme }. SAYI değil VADE listesi
     yazılır: sayı gece yarısında bayatlar; SW push anında "bugün <= vade"
     sayımını kendisi yapar, gece devri sorun olmaz.
   - Sunucuya giden verinin TAMAMI: push aboneliği (endpoint+anahtarlar,
     tarayıcı üretir) + tercih saati + saat dilimi + bir sonraki vade GÜNÜ.
   - Kuyruk kancası: kuyruğu değiştiren HER yol (tekrar eylemleri,
     planlamaYap, not ekleme/silme, senkron birleşmesi) depoKaydet'ten
     geçer → depoKaydet sarmalanır (senkron.js'in kendi sarmalama emsali;
     biz ondan SONRA yüklenip onun sarmalanmışını sarmalarız). tekrar.js'e
     dokunulmaz. Gece devri veri değiştirmez → SW tarafı çözer (üstte).
   - navigator.serviceWorker.ready ASLA çıplak beklenmez (Playwright
     serviceWorkers:'block' altında sonsuza dek asılı kalır) —
     getRegistration() kullanılır: kayıt yoksa undefined döner. */
'use strict';
(function(){
  const DB_AD = 'kk_bildirim_v1';
  const MAGAZA = 'ozet';
  const AYAR_ANAHTAR = 'kk_bildirim_v1';   // localStorage: {acik, saat, sonVade} — cihaz-yerel, senkrona girmez
  const SUNUCU = 'https://kitaplik-bildirim.dessn7.workers.dev';
  const VAPID_ACIK = 'BN3pQt_NZg4Gzpxf4VbZzoYihofRB76_nOPQY7JPJq5gM5TqF5yiekR2tOHGONUlrawESTiqBNtwd2feDJ90nPE';
  const ORNEK_KIRPMA = 90;
  const VARSAYILAN_SAAT = 9;

  function bildir(m){ if(typeof toast === 'function') toast(m); }

  /* ---------- v63: tetikler ----------
     Dört tetik ayrı ayrı açılıp kapanır. VARSAYILAN: yalnız 'alinti' AÇIK —
     üç yenisi KAPALI. Gerekçe (regresyon güvencesi): mevcut kullanıcı güncelleme
     sonrası bugünkü davranışın BİREBİR aynısını görür; yeni bildirim türü ancak
     kullanıcı isteyerek açtığında gelir. Bildirim, izin istenen bir alandır —
     sessizce genişletilmez.
     ÖNCELİK: worker.js'teki ONCELIK dizisiyle BİREBİR aynı olmalı (statik vaka
     kilitler). Nadir olan önce — bol olan (alıntı) her günü işgal edip
     diğerlerini açlıktan öldürmesin. */
  const TETIKLER = ['tempo', 'oneri', 'okuma', 'alinti'];
  const VARSAYILAN_ONERI_GUN = 0;   // Pazar — haftalık planlama günü; hafta başı
                                    // olsaydı "okuyamadım" suçluluğuna dönerdi
  function tetikYukle(t){
    const g = (t && typeof t === 'object') ? t : {};
    return { alinti: g.alinti === undefined ? true : !!g.alinti,
      okuma: !!g.okuma, oneri: !!g.oneri, tempo: !!g.tempo };
  }

  /* ---------- ayar (localStorage) ---------- */
  function ayarYukle(){
    try{
      const a = JSON.parse(localStorage.getItem(AYAR_ANAHTAR)) || {};
      return { acik: !!a.acik,
        saat: (a.saat >= 0 && a.saat <= 23) ? a.saat : VARSAYILAN_SAAT,
        sonVade: a.sonVade || null,
        tetik: tetikYukle(a.tetik),
        oneriGun: (a.oneriGun >= 0 && a.oneriGun <= 6) ? a.oneriGun : VARSAYILAN_ONERI_GUN,
        sonOzet: a.sonOzet || null };
    }catch(e){ return { acik: false, saat: VARSAYILAN_SAAT, sonVade: null,
      tetik: tetikYukle(null), oneriGun: VARSAYILAN_ONERI_GUN, sonOzet: null }; }
  }
  function ayarKaydet(a){
    try{ localStorage.setItem(AYAR_ANAHTAR, JSON.stringify(a)); }catch(e){ window._iz && window._iz('bildirimAyarKaydet', e); }
  }

  /* ---------- IndexedDB (kapak.js dbAc/islem deseninin kopyası) ---------- */
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
        db.onclose = () => { dbSoz = null; };
        db.onversionchange = () => { try{ db.close(); }catch(e){ /* zaten kapalı — kasıtlı */ } dbSoz = null; };
        cozul(db);
      };
      istek.onerror = () => kir(istek.error || new Error('açılamadı'));
    });
    dbSoz.catch(() => { dbSoz = null; });
    return dbSoz;
  }
  function islem(mod, gorev, tekrar){
    return dbAc().then(db => new Promise((cozul, kir) => {
      let sonuc;
      let tx;
      try{ tx = db.transaction(MAGAZA, mod); sonuc = gorev(tx.objectStore(MAGAZA)); }
      catch(e){
        if(!tekrar){ dbSoz = null; cozul(islem(mod, gorev, true)); return; }
        kir(e); return;
      }
      tx.oncomplete = () => cozul(sonuc ? sonuc.result : undefined);
      tx.onerror = () => kir(tx.error || new Error('işlem hatası'));
      tx.onabort = () => kir(tx.error || new Error('işlem iptal'));
    }));
  }
  const ozetYazIdb = o => islem('readwrite', st => st.put(o, 'guncel'));
  const ozetOku = () => islem('readonly', st => st.get('guncel'));
  /* v63 ayna: AYNI mağaza, AYRI anahtar — IndexedDB sürüm bump'ı GEREKMEZ.
     (sw.js ve bildirim.js aynı DB'yi version 1 ile açıyor; bump ikisini
     birden güncellemeyi zorunlu kılardı.) */
  const aynaYazIdb = a => islem('readwrite', st => st.put(a, 'ayna'));
  const aynaOku = () => islem('readonly', st => st.get('ayna'));

  /* ---------- özet hesabı (salt okuma — veri'ye yazmaz) ---------- */
  function kirp(m){
    const t = String(m || '').replace(/\s+/g, ' ').trim();
    return t.length > ORNEK_KIRPMA ? t.slice(0, ORNEK_KIRPMA - 1) + '…' : t;
  }
  function ozetHesapla(){
    const adaylar = [];
    try{
      (veri.kitaplar || []).forEach(k => (k.notlar || []).forEach(n => {
        if(n && n.tekrarDurum === 'aktif' && n.tekrarSonraki) adaylar.push(n);
      }));
    }catch(e){ /* beklenmedik veri biçimi → boş aday listesi; sessiz geçiş kasıtlı */ }
    /* tekrar.js kuyruk sırasıyla aynı öncelik: vade, tarih, id */
    adaylar.sort((a, b) => a.tekrarSonraki.localeCompare(b.tekrarSonraki)
      || ((a.tarih || '').localeCompare(b.tarih || ''))
      || String(a.id).localeCompare(String(b.id)));
    return {
      vadeler: adaylar.map(n => n.tekrarSonraki),
      ornekMetin: adaylar.length ? kirp(adaylar[0].metin) : null,
      okuma: okumaOzeti(),
      oneri: oneriOzeti(),
      tempo: tempoOzeti(),
      guncelleme: Date.now()
    };
  }

  /* ---------- v63 tetik özetleri ----------
     Bunların TAMAMI cihazda kalır (bildirim metni buradan üretilir). Sunucuya
     yalnız aynaOlustur()'un çıkardığı GÜN/BAYRAK alanları gider. */

  /* Okunuyor kitap + en son ilerleme günü.
     KAYNAK: gsG — index.html:1564'te "guncelSayfa ALAN damgası, yalnız KULLANICI
     ilerleme girişleri basar" diye belgeli; tüm yazım yerleri
     `if(k.guncelSayfa !== eski)` kapısının arkasında. Yani senkron damgası (g)
     DEĞİL; alakasız bir alan düzenlemesi bu damgayı kıpırdatmaz.
     İkinci kaynak seanslar[].t (aynı anda yazılıyor, index.html:3700); ikisinin
     EN YENİSİ alınır — sıfırlama/bitirme yollarında yalnız gsG basılıyor.
     Birden fazla okunuyor kitap varsa EN UZUN SESSİZ olan seçilir: hatırlatmayı
     hak eden, en çok unutulandır. */
  function okumaOzeti(){
    try{
      const okunuyor = (veri.kitaplar || []).filter(k => k && k.durum === 'okunuyor');
      if(!okunuyor.length) return null;
      /* ÜÇ kaynağın EN YENİSİ — "ilk dolu olan" DEĞİL. Üçü birbirini kapsamıyor:
         oturum-bitir (oturum.js) oturum + gsG yazar ama seansEkle'yi ÇAĞIRMAZ;
         geriye düzeltme yalnız gsG yazar; sayfa ilerletmeyen süreli oturum
         yalnız oturumlar'a yazar. Sabit bir sıra kullanılsaydı BAYAT bir kayıt
         taze olanı gölgeler ve haksız hatırlatma çıkardı. */
      const gunu = k => {
        const adaylar = [];
        if(k.gsG) adaylar.push(gunIsoDamga(k.gsG));
        (k.seanslar || []).forEach(s => { if(s && s.t) adaylar.push(s.t); });
        (k.oturumlar || []).forEach(o => {
          if(o && o.b) adaylar.push(typeof o.b === 'number' ? gunIsoDamga(o.b) : String(o.b).slice(0, 10));
        });
        adaylar.sort();
        return adaylar.length ? adaylar[adaylar.length - 1] : null;
      };
      const sirali = okunuyor.map(k => ({ k, gun: gunu(k) }))
        /* ilerleme kaydı HİÇ olmayan kitap en sessiz sayılır ('' en küçük) */
        .sort((a, b) => String(a.gun || '').localeCompare(String(b.gun || '')));
      const s = sirali[0];
      return { id: s.k.id, ad: s.k.ad, sayfa: s.k.guncelSayfa || 0,
        toplam: s.k.sayfa || 0, sonGun: s.gun || null };
    }catch(e){ return null; }
  }
  /* Öneri motorunun İLK önerisi + gerekçesi. Motor oneri.js'te; burada YENİDEN
     hesaplanmaz (kopya kod yok) — hesapla() çağrılır. */
  function oneriOzeti(){
    try{
      if(!window.__oneri || typeof window.__oneri.hesapla !== 'function') return null;
      const o = window.__oneri.hesapla();
      const ilk = (o && o.ana && o.ana[0]) || null;
      if(!ilk || !ilk.kitap) return null;
      return { ad: ilk.kitap.ad, neden: ilk.neden || '' };
    }catch(e){ return null; }
  }
  /* Yıl hedefi tempo durumu — çekirdeğin tempoDurum()'u (istatistik ekranıyla
     AYNI sayı). Hedef yoksa null döner ve tetik hiç kurulmaz. */
  function tempoOzeti(){
    try{
      if(typeof tempoDurum !== 'function') return null;
      const t = tempoDurum();
      if(!t.hedef) return null;
      return { hedef: t.hedef, bitti: t.bitti, projeksiyon: t.projeksiyon, geride: t.geride };
    }catch(e){ return null; }
  }
  function gunIsoDamga(ms){
    const s = new Date(ms);
    return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') +
      '-' + String(s.getDate()).padStart(2, '0');
  }

  /* ---------- tazeleme (debounce'lu) ---------- */
  let tazeleZaman = null;
  function tazelePlanla(){
    clearTimeout(tazeleZaman);
    tazeleZaman = setTimeout(tazele, 500);
  }
  /* AYNA: sunucuya giden ALANLARIN TAMAMI. Bu nesne hem sunucuya yollanır hem
     IndexedDB'ye 'ayna' anahtarıyla yazılır.
     NEDEN AYNA: push PAYLOAD'SIZ — sunucu "bugün hangi tetiği seçtim" diyemez.
     Seçim, sunucuya gönderilen alanların SAF FONKSİYONU yapılırsa kanal
     GEREKMEZ: iki taraf aynı girdiden aynı sonucu bağımsız hesaplar. SW taze
     veriden değil AYNADAN seçer; böylece sunucunun "gönder" kararıyla cihazın
     "ne göstereyim" kararı ayrışamaz ve sessizlik yolu yapısal olarak kapanır.
     GİZLİLİK: yalnız GÜN ve BAYRAK. Kitap adı, alıntı metni, sayfa YOK.
     KAPALI TETİK: alanı null/false gider — sunucu boşuna uyandırmaz ve hangi
     tetiğin kapatıldığını ayrıca öğrenmez. */
  function aynaOlustur(o, a){
    const t = a.tetik;
    return {
      vade: (t.alinti && o.vadeler.length) ? o.vadeler[0] : null,
      okumaSonGun: (t.okuma && o.okuma) ? o.okuma.sonGun : null,
      oneriGun: (t.oneri && o.oneri) ? a.oneriGun : null,
      oneriVar: !!(t.oneri && o.oneri),
      tempoGeride: !!(t.tempo && o.tempo && o.tempo.geride)
    };
  }
  async function tazele(){
    const o = ozetHesapla();
    try{ await ozetYazIdb(o); }catch(e){ window._iz && window._iz('ozetYazIdb', e); }
    const a = ayarYukle();
    const ayna = aynaOlustur(o, a);
    try{ await aynaYazIdb(ayna); }catch(e){ window._iz && window._iz('aynaYazIdb', e); }
    ozetSenkronla(ayna);
    return o;
  }
  /* Ayna DEĞİŞTİYSE sunucuya bildir — sunucu "hiçbir tetik hazır değilse hiç
     gönderme" kapısını bununla işletir. Yalnız hatırlatma AÇIKKEN konuşur.
     v63: eskiden tek değer (vade) karşılaştırılıyordu; artık aynanın tamamı.
     Kıyas JSON üzerinden: alanlardan HERHANGİ biri değişince tek istek atılır. */
  let vadeZaman = null;
  function ozetSenkronla(ayna){
    const a = ayarYukle();
    const damga = JSON.stringify(ayna);
    if(!a.acik || a.sonOzet === damga) return;
    clearTimeout(vadeZaman);
    vadeZaman = setTimeout(async () => {
      try{
        const abonelik = await abonelikGetir();
        if(!abonelik) return;
        const y = await fetch(SUNUCU + '/abone-guncelle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ endpoint: abonelik.endpoint }, ayna))
        });
        if(y.ok){ const g = ayarYukle(); g.sonOzet = damga; g.sonVade = ayna.vade; ayarKaydet(g); }
      }catch(e){ window._iz && window._iz('ozetSenkronla', e); }
    }, 1200);
  }

  /* ---------- push aboneliği ---------- */
  function destekVar(){
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }
  function iosTarayici(){
    /* iOS'ta Web Push yalnız iOS 16.4+ ve ANA EKRANA EKLENMİŞ uygulamada.
       Safari sekmesinde PushManager hiç yok → destek kontrolü zaten yakalar;
       bu bayrak dürüst yönlendirme metni için. */
    return /iP(hone|ad|od)/.test(navigator.userAgent)
      && !(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  }
  async function kayitGetir(){
    try{ return await navigator.serviceWorker.getRegistration(); }
    catch(e){ return null; }
  }
  async function abonelikGetir(){
    const kayit = await kayitGetir();
    if(!kayit || !kayit.pushManager) return null;
    try{ return await kayit.pushManager.getSubscription(); }
    catch(e){ return null; }
  }
  function anahtarBaytlari(b64u){
    const dolgu = '='.repeat((4 - b64u.length % 4) % 4);
    const ham = atob((b64u + dolgu).replace(/-/g, '+').replace(/_/g, '/'));
    const dizi = new Uint8Array(ham.length);
    for(let i = 0; i < ham.length; i++) dizi[i] = ham.charCodeAt(i);
    return dizi;
  }

  async function ac(){
    if(!destekVar()){ durumYaz(); return; }
    let izin = Notification.permission;
    /* İzin diyaloğu YALNIZ bu açık kullanıcı eylemiyle çıkar (ht-ac). */
    if(izin === 'default'){
      try{ izin = await Notification.requestPermission(); }catch(e){ izin = Notification.permission; }
    }
    if(izin !== 'granted'){ durumYaz(); return; }
    const kayit = await kayitGetir();
    if(!kayit || !kayit.pushManager){
      bildir('Bildirim altyapısı bu ortamda hazır değil — sayfayı yenileyip dene');
      durumYaz(); return;
    }
    try{
      let abonelik = await kayit.pushManager.getSubscription();
      if(!abonelik){
        abonelik = await kayit.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: anahtarBaytlari(VAPID_ACIK)
        });
      }
      const a = ayarYukle();
      const o = ozetHesapla();
      /* İLK kayıtta aynayı burada üretip GÖNDERİYORUZ: tazele() henüz
         a.acik=false gördüğü için senkron etmezdi ve abone, ilk gün tetiksiz
         kalırdı (yalnız vade giderdi). */
      const ayna = aynaOlustur(o, Object.assign({}, a, { acik: true }));
      try{ await ozetYazIdb(o); await aynaYazIdb(ayna); }catch(e){ window._iz && window._iz('bildirimAcIdbYaz', e); }
      const y = await fetch(SUNUCU + '/abone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          abonelik: abonelik.toJSON(),
          saat: a.saat,
          dilim: Intl.DateTimeFormat().resolvedOptions().timeZone
        }, ayna))
      });
      if(!y.ok) throw new Error('sunucu ' + y.status);
      a.acik = true; a.sonVade = ayna.vade; a.sonOzet = JSON.stringify(ayna);
      ayarKaydet(a);
      bildir('Hatırlatma açıldı — her gün ' + saatMetni(a.saat) + ' civarı bakılır');
    }catch(e){
      bildir('Hatırlatma açılamadı — bağlantını kontrol edip yeniden dene');
    }
    durumYaz();
  }
  async function kapat(){
    const a = ayarYukle();
    a.acik = false; a.sonVade = null;
    ayarKaydet(a);
    try{
      const abonelik = await abonelikGetir();
      if(abonelik){
        try{
          await fetch(SUNUCU + '/abone-sil', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: abonelik.endpoint })
          });
        }catch(e){ window._iz && window._iz('aboneSilIstek', e); }
        await abonelik.unsubscribe();
      }
    }catch(e){ window._iz && window._iz('bildirimKapat', e); }
    bildir('Hatırlatma kapatıldı');
    durumYaz();
  }
  async function testGonder(){
    if(!destekVar() || Notification.permission !== 'granted'){
      bildir('Önce hatırlatmayı aç — izin gerekiyor'); return;
    }
    const kayit = await kayitGetir();
    if(!kayit){ bildir('Bildirim altyapısı hazır değil'); return; }
    const o = await tazele();
    const bugun = gunIso();
    const sayi = o.vadeler.filter(v => v <= bugun).length;
    try{
      await kayit.showNotification('Deneme — Kitaplık', {
        body: sayi ? (sayi + ' alıntı seni bekliyor. ' + (o.ornekMetin || '')) :
          'Bugün bekleyen tekrar yok — bildirim böyle görünecek.',
        tag: 'kitaplik-deneme', icon: './icon-192.png', badge: './icon-192.png'
      });
    }catch(e){ bildir('Deneme bildirimi gösterilemedi'); }
  }
  function gunIso(){
    const s = new Date();
    return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') +
      '-' + String(s.getDate()).padStart(2, '0');
  }
  function saatMetni(s){ return String(s).padStart(2, '0') + ':00'; }

  /* ---------- Ayarlar ▸ Hatırlatma arayüzü ---------- */
  function saatSeciciDoldur(){
    const sec = document.getElementById('htSaat');
    if(!sec || sec.options.length) return;
    for(let s = 0; s < 24; s++){
      const o = document.createElement('option');
      o.value = String(s); o.textContent = saatMetni(s);
      sec.appendChild(o);
    }
    sec.value = String(ayarYukle().saat);
    sec.addEventListener('change', async () => {
      const a = ayarYukle();
      a.saat = parseInt(sec.value, 10) || 0;
      ayarKaydet(a);
      if(a.acik){
        try{
          const abonelik = await abonelikGetir();
          if(abonelik) await fetch(SUNUCU + '/abone-guncelle', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: abonelik.endpoint, saat: a.saat,
              dilim: Intl.DateTimeFormat().resolvedOptions().timeZone })
          });
        }catch(e){ window._iz && window._iz('saatGuncelleIstek', e); }
      }
    });
  }
  /* ---------- görünür durum (v62) ----------
     Tek satırlık düz metin parçaları; yeni sınıf yalnız `ht-` ad alanında
     (proje kuralı). Ciltli sözleşmeleri: dolgu/yuvarlak kart eklenmez, mevcut
     tipografi devralınır. */
  function satir(metin){
    const d = document.createElement('div');
    d.className = 'ht-tani-satir';
    d.textContent = metin;
    return d;
  }
  function trGun(iso){
    if(!iso) return '';
    const t = new Date(iso);
    return isNaN(t) ? '' : t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  }
  /* Kuyruk cümlesi. 0 ise SEBEP + NE YAPILACAĞI söylenir — "bildirim gelmiyor"
     şikâyetinin kökü tam olarak buydu. */
  async function kuyrukSatiri(){
    let o;
    try{ o = await tazele(); }catch(e){ o = { vadeler: [] }; }
    const bugun = gunIso();
    const bekleyen = o.vadeler.filter(v => v <= bugun).length;
    if(!o.vadeler.length)
      return 'Tekrar kuyruğunda alıntı YOK — bu yüzden bildirim gönderilmeyecek. '
        + 'Önce bir kitaba alıntı ekleyip tekrara al.';
    if(!bekleyen)
      return 'Kuyrukta ' + o.vadeler.length + ' alıntı var; bugün vadesi gelen yok. '
        + 'Sıradaki vade: ' + o.vadeler[0] + ' — o güne kadar bildirim gelmez.';
    return 'Bugün vadesi gelen ' + bekleyen + ' alıntı var (kuyrukta toplam '
      + o.vadeler.length + '). Bildirim ' + saatMetni(ayarYukle().saat) + ' civarı gelir.';
  }
  /* Sunucudaki kaydı SORAR — tarayıcı "açık" derken sunucuda kayıt olmayabilir.
     Ağ yoksa sessiz kalmak yerine bunu da söyler (dürüst belirsizlik). */
  async function sunucuSatiriEkle(kutu, abonelik){
    const yer = satir('Sunucu durumu sorgulanıyor…');
    kutu.appendChild(yer);
    try{
      const y = await fetch(SUNUCU + '/abone-durum?endpoint=' +
        encodeURIComponent(abonelik.endpoint));
      if(!y.ok) throw new Error('durum');
      const d = await y.json();
      if(!d.kayitli){
        yer.textContent = 'Sunucuda kayıt YOK — hatırlatmayı kapatıp yeniden aç.';
        return;
      }
      const parca = ['Sunucuda kayıtlı'];
      if(d.olusturma) parca.push(trGun(d.olusturma) + ' tarihinden beri');
      parca.push('saat ' + saatMetni(d.saat));
      yer.textContent = parca.join(' · ') + '.';
      kutu.appendChild(satir(d.sonGonderim
        ? 'Son bildirim: ' + trGun(d.sonGonderim) + '.'
        : 'Henüz hiç bildirim gönderilmedi.'));
    }catch(e){
      yer.textContent = 'Sunucu durumu okunamadı (çevrimdışı olabilirsin).';
    }
  }

  /* ---------- v63: tetik listesi ----------
     Her tetik ayrı açılıp kapanır. Kapalı tetik aynadan DÜŞER (aynaOlustur),
     yani sunucu onun için hiç uyandırmaz.
     Koşullu NOT: tetik açık ama koşulu yoksa (hedef konmamış, kitap okunmuyor)
     bunu AÇIKÇA söyler — v62'nin "doğru ama sessiz davranış arızadan ayırt
     edilemez" dersi. */
  const TETIK_AD = { alinti: 'Alıntı tekrarı', okuma: 'Okuma hatırlatması',
    oneri: 'Haftalık öneri', tempo: 'Yıl hedefi temposu' };
  function tetikNotu(tetik, o){
    if(tetik === 'alinti') return (o.vadeler && o.vadeler.length)
      ? '' : 'Kuyrukta alıntı yok — bu tetik sessiz kalır.';
    if(tetik === 'okuma') return o.okuma
      ? '' : 'Şu an "okunuyor" kitabın yok — bu tetik sessiz kalır.';
    if(tetik === 'oneri') return o.oneri
      ? '' : 'Öneri adayı yok (okunacak kitap ekle) — bu tetik sessiz kalır.';
    if(tetik === 'tempo') return o.tempo
      ? (o.tempo.geride ? '' : 'Temponuz hedefin gerisinde değil — sessiz kalır.')
      : 'Yıl hedefi koymadın — bu tetik sessiz kalır.';
    return '';
  }
  async function tetikleriCiz(){
    const kap = document.getElementById('htTetikler');
    if(!kap) return;
    const a = ayarYukle();
    if(!a.acik){ kap.hidden = true; kap.innerHTML = ''; return; }
    kap.hidden = false;
    let o;
    try{ o = await tazele(); }catch(e){ o = { vadeler: [] }; }
    kap.innerHTML = '';
    TETIKLER.forEach(t => {
      const acik = !!a.tetik[t];
      const satir = document.createElement('div');
      satir.className = 'ht-tetik-satir';
      const ad = document.createElement('span');
      ad.className = 'ht-tetik-ad';
      ad.textContent = TETIK_AD[t];
      const dugme = document.createElement('button');
      dugme.type = 'button';
      dugme.className = 'btn btn-cerceve ht-anahtar';
      dugme.dataset.act = 'ht-tetik';
      dugme.dataset.v = t;
      dugme.setAttribute('aria-pressed', acik ? 'true' : 'false');
      dugme.textContent = acik ? 'Açık' : 'Kapalı';
      satir.appendChild(ad); satir.appendChild(dugme);
      kap.appendChild(satir);
      const not = acik ? tetikNotu(t, o) : '';
      if(not){
        const p = document.createElement('div');
        p.className = 'ht-tetik-not';
        p.textContent = not;
        kap.appendChild(p);
      }
    });
  }
  async function tetikDegistir(t){
    if(TETIKLER.indexOf(t) < 0) return;
    const a = ayarYukle();
    a.tetik[t] = !a.tetik[t];
    ayarKaydet(a);
    await tazele();      // ayna yeniden kurulur + sunucuya gider
    await tetikleriCiz();
    durumYaz();
  }

  async function durumYaz(){
    const el = document.getElementById('htDurum');
    if(!el) return;
    saatSeciciDoldur();
    const acBtn = document.querySelector('#ayBolumHatirlatma [data-act="ht-ac"]');
    const kapatBtn = document.querySelector('#ayBolumHatirlatma [data-act="ht-kapat"]');
    const testBtn = document.querySelector('#ayBolumHatirlatma [data-act="ht-test"]');
    const g = (a, k, t) => { if(acBtn) acBtn.hidden = !a; if(kapatBtn) kapatBtn.hidden = !k; if(testBtn) testBtn.hidden = !t; };
    if(!destekVar()){
      el.textContent = iosTarayici()
        ? 'iOS\'ta bildirim yalnız Ana Ekrana eklenmiş uygulamada çalışır (iOS 16.4+): Paylaş ▸ Ana Ekrana Ekle, sonra uygulamayı oradan aç.'
        : 'Bu tarayıcı web bildirimlerini desteklemiyor.';
      g(false, false, false); return;
    }
    if(Notification.permission === 'denied'){
      el.textContent = 'Bildirim izni tarayıcıda reddedilmiş. Açmak için tarayıcının site ayarlarına gir ' +
        '(adres çubuğundaki kilit/ayar simgesi ▸ Bildirimler ▸ İzin ver), sonra buraya dön.';
      g(false, false, false); return;
    }
    const a = ayarYukle();
    const abonelik = a.acik ? await abonelikGetir() : null;
    if(a.acik && abonelik){
      /* v62: eski hâli yalnız "Açık — ... hatırlatılır" diyordu. Kuyruk BOŞKEN
         de aynı cümleyi kuruyordu; kullanıcı iki gün bildirim bekledi, sistem
         ise (doğru biçimde) hiç göndermedi çünkü tekrar kuyruğunda alıntı yok.
         Sessiz-doğru davranış, kullanıcı için arızadan ayırt edilemez —
         bu yüzden durum artık AÇIKÇA yazılır. */
      el.textContent = 'Açık — her gün ' + saatMetni(a.saat) +
        ' civarı, günde en fazla bir bildirim.';
      const kutu = document.createElement('div');
      kutu.className = 'ht-tani';
      kutu.appendChild(satir(await kuyrukSatiri()));
      el.appendChild(kutu);
      /* Sunucu tarafı ayrı bir gerçek: tarayıcıda abonelik durup sunucuda
         kaydın düşmüş olması mümkün. Ölçülmeden "açık" denmez. */
      sunucuSatiriEkle(kutu, abonelik);
      tetikleriCiz();
      g(false, true, true);
    }else{
      if(a.acik && !abonelik){ a.acik = false; ayarKaydet(a); }   // abonelik dışarıdan silinmiş — dürüst duruma dön
      el.textContent = 'Kapalı. Açarsan tarayıcı bir kez bildirim izni sorar; alıntı metinleri cihazında kalır, sunucuya yalnız hatırlatma saati gider.';
      g(true, false, false);
    }
  }

  /* ---------- bağlama ---------- */
  function baslat(){
    /* depoKaydet sarmalaması: senkron.js'inkinin ÜSTÜNE (biz sonra yüklendik).
       Kuyruğu değiştiren her yol buradan geçtiği için tekrar.js'e kanca gerekmez. */
    if(typeof window.depoKaydet === 'function'){
      const cekirdek = window.depoKaydet;
      window.depoKaydet = function(){
        const sonuc = cekirdek.apply(this, arguments);
        tazelePlanla();
        return sonuc;
      };
    }
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      switch(el.dataset.act){
        case 'ht-ac': ac(); break;
        case 'ht-kapat': kapat(); break;
        case 'ht-test': testGonder(); break;
        case 'ht-tetik': tetikDegistir(el.dataset.v); break;
        case 'ayar-ac': durumYaz(); break;   // kapak.js/ocr.js ile aynı kalıp
      }
    });
    tazelePlanla();   // açılış özeti (gece devrini sayfa tarafında da tazeler)
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();

  /* test kancaları */
  window.__bildirim = { ozetHesapla, tazele, ozetOku, ayarYukle, ayarKaydet, kirp,
    destekVar, iosTarayici, durumYaz, DB_AD, MAGAZA, AYAR_ANAHTAR, SUNUCU, VAPID_ACIK,
    aynaOlustur, aynaOku, TETIKLER, VARSAYILAN_ONERI_GUN };
})();
