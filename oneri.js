'use strict';
/* Kitaplık — "Ne okusam?" öneri motoru (ad alanı: on-)
   Tamamen YEREL ve açıklanabilir skorlama; dış servis yok, ML yok.

   SKOR BİLEŞENLERİ (ağırlık gerekçeleri):
   - Seri devamı        0 / +35   En güçlü sinyal: yarım seri, kullanıcının kendi
                                  başlattığı ve sürdürme niyeti taşıdığı tek işaret.
   - Yazar yakınlığı  −30 / +30   Doğrudan kalite deneyimi (n≥1). İMZALI: düşük
                                  puanlı yazarın kitabı aşağı itilir.
   - Tür yakınlığı    −20 / +20   Yazar kadar spesifik değil; n≥2 eşiği altında
                                  NÖTR (tek kitaplık tür genellenemez).
   - Etiket yakınlığı   0 / +15   Puan≥8 verilen kitapların etiketleriyle örtüşme
                                  (+5/etiket). Pozitif-yalnız: etiketsizlik ceza değil.
   - Bekleme süresi     0 / +10   gün/60 (600 günde tavan). Raf adaleti: eskiyen
                                  kitap görünür kalsın.
   - Uzunluk uygunluğu  0 / +8    Son 90 günde bitenlerin ortalama sayfasına
                                  yakınlık. ZAYIF ve pozitif-yalnız: sayfa bilgisi
                                  olmayan kitap CEZALANDIRILMAZ (bileşen 0 kalır).
   - Yayınevi           KULLANILMIYOR (karar): aynı yayınevi çok farklı tür/kalite
                                  basar; sinyal zayıf ve "X yayınevine 7 verdin"
                                  gerekçesi anlamsız duruyor.
   AÇIKLANABİLİRLİK (v48): gerekçe LİSTE bağlamında atanır (nedenAta) — kitabın
   en ÖZGÜL sinyalinin cümlesi; özgüllük sırası yazar > seri > etiket > tür >
   bekleme (Kaan kararı — skor ağırlığı DEĞİL: skor sıralamayı, özgüllük anlatımı
   yönetir). Aynı cümle listede İKİ KEZ GÖRÜNMEZ: kullanılmış cümle atlanır,
   kitap bir sonraki sinyaline düşer; benzersiz özgül sinyal kalmadıysa dürüst
   genel cümle (sayı yinelenmez), o da tükenirse gerekçesiz. Bekleme yalnız
   GEÇERLİ eklenme damgasıyla ve ≥90 günde yazılır (v49: "1 gündür bekliyor"
   gerekçe değildir); sinyalsiz kitap dürüst itirafla listede kalır.
   Uydurma gerekçe yok.
   AZ VERİ: puanlı bitirilmiş kitap < 3 ise skorlamaya GİRİLMEZ — dürüst mesaj +
   en uzun bekleyenler listesi gösterilir.
   ÇEŞİTLİLİK: ilk 5'te aynı yazardan en fazla 2, aynı türden en fazla 3 —
   tekdüze liste işe yaramaz; kota katıdır, havuz yetmezse liste kısalır.
   İSTEK LİSTESİ (karar): ana liste yalnız SAHİP olunanlar (elinde olan hemen
   başlanabilir); istekler ayrı ince bölümde en fazla 2 öneri olarak gösterilir —
   karışık listede "elimde yok" hayal kırıklığı yaratır, ayrı bölümde alışveriş
   sinyali olur. */
(function(){
  const ERTELEME_GUN = 30;
  const MIN_PUANLI = 3;   // bu sayının altında puanlı bitmiş kitapla skor uydurma olur
  const AGIRLIK = { seri: 35, yazar: 30, tur: 20, etiket: 15, bekleme: 10, uzunluk: 8 };
  const MIN_TUR_KITAP = 2;
  const ANA_SAYI = 5, ISTEK_SAYI = 2;

  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function fmt(x){ return x.toFixed(1).replace('.', ','); }
  function kat(s){ return (typeof katla === 'function') ? katla(s) : String(s || '').toLowerCase(); }
  function iKat(s){ return (typeof iKatla === 'function') ? iKatla(s) : String(s || '').toLowerCase(); }

  function ertelemeAktif(k){
    if(!k.ertelemeTarihi) return false;
    return gunFarki(k.ertelemeTarihi, bugun()) < ERTELEME_GUN;
  }
  /* Bekleme yalnız GEÇERLİ eklenme damgasıyla anlamlı (v48): damga yok/<=0,
     gelecekte ya da absürt eski (>600 ay) ise null — cümle HİÇ kurulmaz.
     (v47 canlı kanıtı: bozuk damga "689 aydır rafta bekliyor" üretmişti.) */
  const BEKLEME_TAVAN_GUN = 600 * 30;   // 600 ay
  /* GEREKÇE eşiği (v49): bekleme ancak 3 ay (90 gün) üzerinde anlatılmaya değer.
     "1 gündür rafta bekliyor" kitabın dün eklendiğini söyler, NEDEN okunacağını
     değil (canlı v48 kanıtı). 90 gün: skor katkısı o noktada 1.5 puana ulaşır
     (gün/60) — sinyal ancak orada "unutulmuş kitap" anlatısına dönüşüyor;
     beklemeCumle'nin "aydır" dili de 60. günden sonra başlıyor. */
  const BEKLEME_GEREKCE_GUN = 90;
  function beklemeGun(k){
    if(!(k.eklenme > 0)) return null;
    const gun = Math.floor((Date.now() - k.eklenme) / 86400000);
    if(gun < 0 || gun > BEKLEME_TAVAN_GUN) return null;
    return gun;
  }
  function beklemeCumle(k){
    const gun = beklemeGun(k);
    if(gun === null) return '';
    return gun >= 60 ? Math.floor(gun / 30) + ' aydır rafta bekliyor'
                     : gun + ' gündür rafta bekliyor';
  }
  /* Gerekçe ataması LİSTE bağlamında (v48) — özgüllük sırası + tekillik.
     Her parça (birincil + katkısı ≥10 ikincil) kullanılan kümesine ayrı girer;
     böylece birleşik cümleler de kendiliğinden farklılaşır. Keşfet aynı motoru
     kullanacak: düzeltme BURADA, arayüzlerde kopya yok. */
  const GEREKCE_SIRA = ['yazar', 'seri', 'etiket', 'tur', 'bekleme'];
  /* Genel yedek havuzları (v50): tekillik kısıtı ÖZGÜL cümleler içindir —
     kopyalanmış "tür ortalaması" güveni kırar; genel cümle ise bilgi taşımaz,
     tekrarı zarar vermez. Yine de dil tekdüzeleşmesin diye varyant havuzu
     DÖNGÜSEL kullanılır (4./5. sinyalsiz kitap 1. ifadeyi yeniden alır).
     Sonuç: gerekçesiz satır ('') İMKÂNSIZ — v49 ŞÜPHE-2 borcu kapandı. */
  const GENEL_SINYALSIZ = [
    'Hakkında yeterli veri yok — denemeye değer.',
    'Henüz sinyal birikmedi; belki sürpriz yapar.',
    'Kestirmek için veri az — açıp bakmak lazım.',
    'Geçmişin bu kitap için henüz bir şey söylemiyor.'
  ];
  const GENEL_ORTAK = [
    'Rafında seni bekliyor.',
    'Sırasını bekleyen bir aday.',
    'Listenin sessiz adaylarından.'
  ];
  function nedenAta(liste){
    const kullanilan = new Set();
    let sSayac = 0, oSayac = 0;   // varyant havuzu döngü sayaçları
    liste.forEach(o => {
      const c = o.cumleler || {};
      const b = o.bilesenler || {};
      const parcalar = [];
      for(const ad of GEREKCE_SIRA){
        if(parcalar.length >= 2) break;
        if(!c[ad] || kullanilan.has(c[ad])) continue;
        if(parcalar.length && b[ad] < 10) continue;   // ikincil için güç eşiği
        parcalar.push(c[ad]);
        kullanilan.add(c[ad]);
      }
      if(!parcalar.length){
        /* Genel yedek İKİ AYRI durum (v49) — KARAR: sinyalsiz kitap listeden
           ATILMAZ (veri yokluğu aleyhe kanıt değil; küçük kütüphanede liste
           boşalırdı); cümle sayı uydurmaz. */
        const sinyalVar = Object.keys(c).length > 0;
        let genel;
        if(!sinyalVar){
          genel = GENEL_SINYALSIZ[sSayac % GENEL_SINYALSIZ.length]; sSayac++;
        }else if(b.tur > 0 && o.kitap.tur &&
                 !kullanilan.has(turGoster(o.kitap.tur) + ' türünden kitapları beğeniyorsun')){
          genel = turGoster(o.kitap.tur) + ' türünden kitapları beğeniyorsun';
        }else{
          genel = GENEL_ORTAK[oSayac % GENEL_ORTAK.length]; oSayac++;
        }
        parcalar.push(genel);
        kullanilan.add(genel);
      }
      o.neden = parcalar.join(' · ');
    });
  }

  /* Kitap düzeyinde okuma geçmişi özeti — ARŞİVLİ okumalar (yeniden-oku) dahil.
     rapor.js ile aynı semantik: "yeniden oku" puanı okumalar[]'a taşır; oradaki
     bitmiş/puanlı okumalar da gerçek okuma olayıdır. Bunlar sayılmazsa yeniden
     okunan kitap az-veri eşiğinden düşer, yazar/seri sinyali sessizce kaybolur. */
  function okumaOzet(k){
    const arsiv = Array.isArray(k.okumalar) ? k.okumalar : [];
    const bitti = k.durum === 'bitti' || arsiv.some(o => o && o.bit);
    let puan = (k.durum === 'bitti' && k.puan >= 1) ? k.puan : null;
    if(puan === null) for(let i = arsiv.length - 1; i >= 0; i--){
      const o = arsiv[i];
      if(o && o.bit && o.puan >= 1){ puan = o.puan; break; } // en güncel puanlı okuma
    }
    let sonBit = (k.durum === 'bitti' && k.bitisTarihi) ? k.bitisTarihi : null;
    arsiv.forEach(o => { if(o && o.bit && (!sonBit || o.bit > sonBit)) sonBit = o.bit; });
    return { bitti, puan, sonBit };
  }

  /* ---------- skorlama ---------- */
  /* hesaplaHam (v50): degerlendirilmis TAM sirali listeler — neden ATANMAMIS,
     kirpilmamis. Kesfet suzgec+limit uygular, cesitlilikSec + nedenAta'yi
     KENDI gorunen listesine kosar. hesapla() bunun kirpilmis sarmalayicisi
     (Ana Sayfa + testler) — iki yuzey ayni motordan, kopya mantik yok. */
  function hesaplaHam(){
    const kitaplar = (typeof veri === 'object' && Array.isArray(veri.kitaplar)) ? veri.kitaplar : [];
    const ozetler = new Map(kitaplar.map(k => [k.id, okumaOzet(k)]));
    const bittiler = kitaplar.filter(k => ozetler.get(k.id).bitti);
    const puanlilar = bittiler.filter(k => ozetler.get(k.id).puan !== null);

    /* M3 (v69): 'yarim' da aday havuzuna girer — Goodreads aktarımlı kütüphanede
       neredeyse her şey 'bitti' işaretli, havuz 2 kitaba düşüyordu; yarım
       bırakılan kitap da "elimdeki okunmamış" sayılır. UI yarım adayı ROZETLE
       ayırır ("Yarım bıraktığın") ve düğmesi "Devam et" olur. Skor formülü
       aynı (yazar/tür/etiket/bekleme kitap özellikleridir); 'okunuyor' ve
       'bitti' havuza yine GİRMEZ. */
    const adaylar = kitaplar.filter(k =>
      (k.durum === 'okunacak' || k.durum === 'yarim') && !ertelemeAktif(k));
    const sahipler = adaylar.filter(k => (k.sahiplik || 'sahip') === 'sahip');
    const istekler = adaylar.filter(k => k.sahiplik === 'istek');

    if(puanlilar.length < MIN_PUANLI){
      // AZ VERİ: skor yok, uydurma gerekçe yok — en uzun bekleyenler (gerçek neden);
      // gerekçeler nedenAta'dan geçer (geçersiz damga = beklemesiz, tekillik)
      const bekleyenYap = liste => liste.slice()
        .sort((a, b) => (a.eklenme || 0) - (b.eklenme || 0))
        .map(k => {
          const c = {};
          const gun = beklemeGun(k);
          // yarımda "rafta bekliyor" cümlesi kurulmaz (skor dalıyla aynı kural)
          if(gun !== null && gun >= BEKLEME_GEREKCE_GUN && k.durum !== 'yarim') c.bekleme = beklemeCumle(k);
          return { kitap: k, skor: null, bilesenler: {}, cumleler: c };
        });
      // istek de dolu döner (v50, inceleme K2): Keşfet'in "İstek listem" çipi
      // az-veri modunda da dürüst kalsın. hesapla() az-veri'de isteği yine
      // boş kırpar — Ana Sayfa/panel davranışı DEĞİŞMEZ.
      return { mod: 'az-veri', puanliSayi: puanlilar.length, esik: MIN_PUANLI,
        sahip: bekleyenYap(sahipler), istek: bekleyenYap(istekler) };
    }

    // yazar / tür istatistikleri (yalnız puanlı bitmişlerden; puan = kitap başına
    // en güncel puanlı okuma — güncel ya da arşivli)
    const yazarIst = new Map(), turIst = new Map();
    puanlilar.forEach(k => {
      const p = ozetler.get(k.id).puan;
      if(k.yazar){
        const a = kat(k.yazar), o = yazarIst.get(a) || { toplam: 0, n: 0 };
        o.toplam += p; o.n++; yazarIst.set(a, o);
      }
      if(k.tur){
        const a = kat(k.tur), o = turIst.get(a) || { toplam: 0, n: 0 };
        o.toplam += p; o.n++; turIst.set(a, o);
      }
    });
    // beğenilen etiketler (puan≥8) — etiket kimliği iKatla (uygulama kuralı)
    const sevilen = new Map();
    puanlilar.filter(k => ozetler.get(k.id).puan >= 8).forEach(k =>
      (k.etiketler || []).forEach(e => { const a = iKat(e); if(!sevilen.has(a)) sevilen.set(a, e); }));
    // seri: bitmiş ciltler
    const seriIst = new Map();
    bittiler.forEach(k => {
      if(k.seri && k.ciltNo){
        const a = kat(k.seri), o = seriIst.get(a) || { ciltler: [] };
        if(o.ciltler.indexOf(k.ciltNo) < 0) o.ciltler.push(k.ciltNo);
        seriIst.set(a, o);
      }
    });
    // son 90 günde bitenlerin ortalama sayfası (arşivli okumaların bitişi dahil)
    const sinir = Date.now() - 90 * 86400000;
    const sonSayfa = bittiler.filter(k => {
      const b = ozetler.get(k.id).sonBit;
      return b && new Date(b).getTime() >= sinir && k.sayfa > 0;
    }).map(k => k.sayfa);
    const ortSayfa = sonSayfa.length ? sonSayfa.reduce((a, b) => a + b, 0) / sonSayfa.length : null;

    function degerlendir(k){
      const b = {};                 // bileşen -> puan
      const cumleler = {};          // bileşen -> gerçek-veri cümlesi
      // seri devamı: bitmiş en büyük cildin hemen SONRAKİ cildi (karar: aradaki
      // cilt atlanmışsa "devam" sayılmaz, diğer bileşenler yine çalışır)
      if(k.seri && k.ciltNo){
        const s = seriIst.get(kat(k.seri));
        if(s && s.ciltler.length && s.ciltler.indexOf(k.ciltNo) < 0 &&
           k.ciltNo === Math.max.apply(null, s.ciltler) + 1){
          b.seri = AGIRLIK.seri;
          cumleler.seri = k.seri + ' serisinin ' + k.ciltNo + '. cildi — önceki ' +
            s.ciltler.length + ' cildi bitirdin';
        }
      }
      if(k.yazar){
        const y = yazarIst.get(kat(k.yazar));
        if(y){
          const ort = y.toplam / y.n;
          b.yazar = (ort - 5.5) / 4.5 * AGIRLIK.yazar;
          if(b.yazar > 0)
            cumleler.yazar = k.yazar + ': bitirdiğin ' + y.n + ' kitaba ortalama ' + fmt(ort) + ' verdin';
        }
      }
      if(k.tur){
        const t = turIst.get(kat(k.tur));
        if(t && t.n >= MIN_TUR_KITAP){
          const ort = t.toplam / t.n;
          b.tur = (ort - 5.5) / 4.5 * AGIRLIK.tur;
          if(b.tur > 0)
            cumleler.tur = turGoster(k.tur) + ' türünde ' + t.n + ' kitaba ortalama ' + fmt(ort) + ' verdin';
        }
      }
      const ortak = (k.etiketler || []).filter(e => sevilen.has(iKat(e)));
      if(ortak.length){
        b.etiket = Math.min(AGIRLIK.etiket, ortak.length * 5);
        cumleler.etiket = 'beğendiğin kitaplarla ortak etiket: ' + ortak.slice(0, 3).join(', ');
      }
      if(ortSayfa && k.sayfa > 0){
        const f = Math.abs(k.sayfa - ortSayfa) / ortSayfa;
        const u = Math.max(0, AGIRLIK.uzunluk * (1 - f));
        if(u > 0){
          b.uzunluk = u;
          if(u >= 6) cumleler.uzunluk = k.sayfa + ' sayfa — son dönemde okuduğun uzunlukta';
        }
      }
      // bekleme yalnız geçerli damgayla puana girer (v48); CÜMLE ayrıca
      // gerekçe eşiğini ister (v49) — kısa bekleme skorda önemsiz kalır
      // (1 gün ≈ 0.02 puan), gerekçe olaraksa hiç kullanılmaz.
      const bGun = beklemeGun(k);
      if(bGun !== null){
        b.bekleme = Math.min(AGIRLIK.bekleme, bGun / 60);
        // M3 (v69): "N aydır rafta bekliyor" CÜMLESİ yarımda kurulmaz — kitap
        // beklemedi, okunuyordu; "Yarım bıraktığın" rozetiyle çelişik anlatı
        // olurdu (skor katkısı kalır: eklenme yaşı gerçek bir sinyal).
        if(bGun >= BEKLEME_GEREKCE_GUN && k.durum !== 'yarim') cumleler.bekleme = beklemeCumle(k);
      }

      const skor = Object.values(b).reduce((a, x) => a + x, 0);
      // neden BURADA atanmaz: liste bağlamı gerekir (tekillik) — hesapla
      // sonunda nedenAta seçilen öğelere yazar.
      return { kitap: k, skor, bilesenler: b, cumleler };
    }

    const sirala = (a, b) => b.skor - a.skor || (a.kitap.eklenme || 0) - (b.kitap.eklenme || 0);
    return { mod: 'skor', puanliSayi: puanlilar.length, esik: MIN_PUANLI,
      sahip: sahipler.map(degerlendir).sort(sirala),
      istek: istekler.map(degerlendir).sort(sirala) };
  }

  /* hesapla: hesaplaHam'ın kırpılmış + neden atanmış hali (Ana Sayfa SIRADAKİ
     ve motor testleri). Gerekçe tekilliği GÖSTERİLEN listenin tamamında. */
  function hesapla(){
    const h = hesaplaHam();
    if(h.mod === 'az-veri'){
      const ana = h.sahip.slice(0, ANA_SAYI);
      nedenAta(ana);
      return { mod: 'az-veri', puanliSayi: h.puanliSayi, esik: h.esik, ana, istek: [] };
    }
    const ana = cesitlilikSec(h.sahip, ANA_SAYI);
    const istek = h.istek.slice(0, ISTEK_SAYI);
    nedenAta(ana.concat(istek));
    return { mod: 'skor', puanliSayi: h.puanliSayi, esik: h.esik, ana, istek };
  }

  /* İlk N'de aynı yazardan ≤2 (katı — görev sözleşmesi); aynı türden en çok
     ceil(n*0.6) (v50: 5'te 3 = eski davranış birebir; 10'da 6 — tek türlü
     kütüphanede Keşfet listesi 3'te kesilmesin). Havuz yetmezse liste kısalır. */
  function cesitlilikSec(sirali, n){
    const secilen = [], ySay = new Map(), tSay = new Map();
    const turKota = Math.ceil(n * 0.6);
    for(const a of sirali){
      if(secilen.length >= n) break;
      const y = kat(a.kitap.yazar || ''), t = kat(a.kitap.tur || '');
      if(y && (ySay.get(y) || 0) >= 2) continue;
      if(t && (tSay.get(t) || 0) >= turKota) continue;
      secilen.push(a);
      if(y) ySay.set(y, (ySay.get(y) || 0) + 1);
      if(t) tSay.set(t, (tSay.get(t) || 0) + 1);
    }
    return secilen;
  }

  /* ---------- eylemler (v50) ----------
     Panel UI Keşfet sekmesine taşındı (kesfet.js, ks-); ampul paneli emekli.
     Durum yazımı BURADA tek yerde — UI'lar (kesfet.js) yalnız çağırır.
     Bayat-düğme koruması panelden miras: koşulsuz yazım bitmiş kitabın bitiş
     tarihini silerdi. NOT: bu yazımlar k.g damgası basmaz (panelin v28'den
     gelen davranışı birebir korunur — değişiklik ayrı karar ister). */
  function basla(id){
    const k = kitapBul(id);
    // M3 (v69): 'yarim' de başlatılabilir (oturum.js oturum-basla emsali) —
    // "Devam et": guncelSayfa'ya DOKUNULMAZ, baslamaTarihi zaten varsa korunur,
    // bitisTarihi (yarımda = bırakma tarihi) temizlenir.
    if(!k || (k.durum !== 'okunacak' && k.durum !== 'yarim')){
      bildir('Liste güncellendi — kitabın durumu değişmiş');
      return false;
    }
    // yalnız durum değişir; okuma OTURUMU başlatılmaz (ayrı, bilinçli eylem)
    k.durum = 'okunuyor';
    k.baslamaTarihi = k.baslamaTarihi || bugun();
    k.bitisTarihi = null;
    depoKaydet();
    bildir('İyi okumalar');
    return true;
  }
  function ertele(id){
    const k = kitapBul(id);
    if(!k || (k.durum !== 'okunacak' && k.durum !== 'yarim')) return false;   // bayat düğme → çağıran tazeler
    k.ertelemeTarihi = bugun();
    depoKaydet();
    bildir(ERTELEME_GUN + ' gün sonra yeniden önerilir');
    return true;
  }
  function erteleGeriAl(id){
    const k = kitapBul(id);
    if(!k || !k.ertelemeTarihi) return false;
    k.ertelemeTarihi = null;
    depoKaydet();
    bildir('Öneri listesine geri döndü');
    return true;
  }

  /* ---------- Keşfet-B sinyalleri (v51): kütüphane-DIŞI öneri ----------
     Motor tek yer: yazar ortalaması okumaOzet ile (arşivli okumalar dahil),
     cümleler BURADA kurulur (A bölümüyle aynı sayı biçimi — fmt). */
  // "beğendim" çıtası 8: sevilen-etiket eşiğiyle (puan≥8) aynı; n≥1 çünkü
  // Kaan ölçeğinde yazar başına çoğunlukla 1-2 okuma var, n≥2 havuzu boşaltırdı —
  // sorgu kotası (Keşfet-B: en iyi 3 yazar) zaten sınırı koyuyor.
  const SEVILEN_YAZAR_ORT = 8;
  function sevilenYazarlar(){
    const kitaplar = (typeof veri === 'object' && Array.isArray(veri.kitaplar)) ? veri.kitaplar : [];
    const ist = new Map();
    kitaplar.forEach(k => {
      if(!k.yazar) return;
      const o = okumaOzet(k);
      if(!o.bitti || o.puan === null) return;
      const a = kat(k.yazar);
      const y = ist.get(a) || { ad: k.yazar, toplam: 0, n: 0 };
      y.toplam += o.puan; y.n++;
      ist.set(a, y);
    });
    return [...ist.values()]
      .map(y => ({ ad: y.ad, ort: y.toplam / y.n, n: y.n }))
      .filter(y => y.ort >= SEVILEN_YAZAR_ORT)
      .sort((a, b) => b.ort - a.ort || b.n - a.n)
      .map(y => ({ ...y,
        cumle: y.ad + ': bitirdiğin ' + y.n + ' kitaba ortalama ' + fmt(y.ort) + ' verdin' }));
  }
  /* Eksik seri ciltleri: sahip olunan ciltlerin min-maks aralığındaki boşluklar
     (detay ekranıyla aynı semantik; anahtar kat(seri) — motor sözleşmesi).
     En az bir cilt BİTMİŞ olmalı: "N. cildi bitirdin" gerekçesi gerçek kalsın. */
  function eksikSeriler(){
    const kitaplar = (typeof veri === 'object' && Array.isArray(veri.kitaplar)) ? veri.kitaplar : [];
    const seriler = new Map();
    kitaplar.forEach(k => {
      if(!k.seri || !k.ciltNo) return;
      const a = kat(k.seri);
      const s = seriler.get(a) || { seri: k.seri, yazar: '', ciltler: new Set(), bitenler: new Set() };
      s.ciltler.add(k.ciltNo);
      if(okumaOzet(k).bitti) s.bitenler.add(k.ciltNo);   // Set: çift edisyon "1 ve 1" üretmesin
      if(!s.yazar && k.yazar) s.yazar = k.yazar;
      seriler.set(a, s);
    });
    const sonuc = [];
    for(const s of seriler.values()){
      const nums = [...s.ciltler].sort((x, y) => x - y);
      const eksik = [];
      for(let i = nums[0]; i <= nums[nums.length - 1]; i++)
        if(!s.ciltler.has(i)) eksik.push(i);
      const bitenler = [...s.bitenler].sort((x, y) => x - y);
      if(!eksik.length || !bitenler.length) continue;
      /* TAVAN (denetim bulgusu): eksik listesinde sınır yoktu — hatalı bir
         ciltNo (ör. 2023) girilirse cümle binlerce elemanlı kuruluyordu.
         En fazla 3 cilt yazılır, kalanı sayıyla söylenir. `eksik` dizisinin
         kendisi TAM kalır (detay ekranı/keşfet kendi kotasını uygular). */
      const gosterilen = eksik.slice(0, 3);
      const kalanCilt = eksik.length - gosterilen.length;
      sonuc.push({ seri: s.seri, yazar: s.yazar, eksik,
        cumle: s.seri + ' serisinin ' + gosterilen.join(' ve ') + '. cildi eksik' +
          (kalanCilt > 0 ? ' (ve ' + kalanCilt + ' cilt daha)' : '') + ' — ' +
          bitenler.join(' ve ') + '. cildi bitirdin' });
    }
    return sonuc;
  }

  /* Sevilen türler (v52) — Keşfet-B'nin ÜÇÜNCÜ sinyali.
     EŞİKLER motorun kendi sabitlerinden türer, yeni sihirli sayı yok:
     - n ≥ MIN_TUR_KITAP (2): motorun tür bileşeninin zaten kullandığı çıta —
       "tek kitaplık tür genellenemez".
     - ort ≥ SEVILEN_TUR_ORT (7): yazar çıtası 8, çünkü yazar SPESİFİK bir
       tercihtir; tür ortalaması ortalamaya regresyon yapar (bir türde 12 kitap
       okuyan biri 8,4'te tavan yapar, 8 çıtası tür havuzunu boşaltırdı).
       7, motorun tür bileşeninin ağırlığının ~üçte birini pozitif verdiği nokta
       ((7−5,5)/4,5×20 ≈ +6,7) — yani motorun "bu türü yukarı it" dediği bölge.
     SIRA: ort ↓, n ↓ — sevilenYazarlar ile AYNI sözleşme. Böylece 2 kitaplık
     9,5'lik tür, 12 kitaplık 8,4'lük türün önüne geçebilir; n cümlede AÇIKÇA
     yazdığı için kullanıcı kendi tartısını yapabilir (gizli ağırlık yok).
     `ad` kullanıcının KENDİ yazdığı tür etiketidir (ilk görülen yazım) —
     1000Kitap'ın etiketiyle karıştırılmaz; eşleştirme kesfet.js'in işi. */
  const SEVILEN_TUR_ORT = 7;
  function sevilenTurler(){
    const kitaplar = (typeof veri === 'object' && Array.isArray(veri.kitaplar)) ? veri.kitaplar : [];
    const ist = new Map();
    kitaplar.forEach(k => {
      if(!k.tur) return;
      const o = okumaOzet(k);
      if(!o.bitti || o.puan === null) return;
      const a = kat(k.tur);
      const t = ist.get(a) || { ad: k.tur, toplam: 0, n: 0 };
      t.toplam += o.puan; t.n++;
      ist.set(a, t);
    });
    return [...ist.values()]
      .map(t => ({ ad: t.ad, ort: t.toplam / t.n, n: t.n }))
      .filter(t => t.n >= MIN_TUR_KITAP && t.ort >= SEVILEN_TUR_ORT)
      .sort((a, b) => b.ort - a.ort || b.n - a.n)
      .map(t => ({ ...t,
        /* v91: ad EŞLEŞME anahtarı olarak ham kalır (kesfet turEsle/turAnahtar
           bunu taksonomiye eşler) — yalnız görünen cümle kısaltılır */
        cumle: turGoster(t.ad) + ' türünde ' + t.n + ' kitap bitirdin, ortalama ' + fmt(t.ort) + ' verdin' }));
  }

  window.__oneri = { hesapla, hesaplaHam, cesitlilikSec, nedenAta,
    basla, ertele, erteleGeriAl, ertelemeAktif,
    sevilenYazarlar, eksikSeriler, sevilenTurler,
    SEVILEN_YAZAR_ORT, SEVILEN_TUR_ORT,
    ERTELEME_GUN, MIN_PUANLI, MIN_TUR_KITAP, AGIRLIK };
})();
