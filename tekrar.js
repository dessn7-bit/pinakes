/* Aralıklı alıntı tekrarı (tk-) — Alıntılar sekmesinin üstünde "Tekrar zamanı" kutusu.
   FELSEFE: Bu bir ezber aracı DEĞİL. "Hatırladın mı?" sınavı yok; amaç biriktirilen
   alıntıların unutulup gitmemesi — eski bir alıntının bugünkü düşünceyle yeniden
   karşılaşması. Üç eylem üç niyettir: "Devam etsin" (aralık büyür), "Daha sık"
   (aralık küçülür), "Yeter" (duraklar; kartından geri açılır).
   Veri: not düzeyinde tekrarSonraki/tekrarAralik/tekrarSayisi/tekrarDurum —
   kitapNormalize beyaz listesinde (index.html), senkronla taşınır (ANLIK_SURUM 5).
   İleride bildirime bağlanabilir: "bugün bekleyenler" = kuyruk() çıktısı, saklanan
   tarih gün-bazlı ISO olduğundan bir zamanlayıcı doğrudan üstüne kurulabilir.
   Cihaz-yerel günlük sayaç: kk_tekrar_v1 (senkron DIŞI — geçici arayüz durumu). */
'use strict';

(function(){
  const CARPAN = 2.2;        // aralık merdiveni: 3→7→15→33→73→161→354→365 (unutma
                             // eğrisine yakın büyüme; 2'den dik, yıllık tavana ~7 adım)
  const MIN_ARALIK = 1;      // "daha sık" en fazla günde bire iner
  const MAX_ARALIK = 365;    // yılda bir yeniden karşılaşma alt sınır olarak kalır
  const ILK_GUN = 3;         // yeni alıntı ilk kez 3 gün sonra çıkar
  const GUNLUK_SINIR = 10;   // günde en fazla 10 gösterim: dakikalar içinde biter,
                             // birikmiş yüzlerce alıntı kullanıcıyı boğmaz
  const YAYILMA_GUNLUK = 8;  // ilk zamanlama yayılması: günde en çok 8 eski alıntı
                             // (sınırın altında — yeni eklenenlere yer kalsın)
  const SAYAC_ANAHTAR = 'kk_tekrar_v1';

  /* İkon dili: index.html'deki window.ikon(ad) inline SVG döndürür (görsel dil
     sprinti — emoji yerine SVG glif). ikon yüklenmemişse boş dize: metin bozulmaz. */
  function ik(ad){ return window.ikon ? window.ikon(ad) : ''; }

  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function gunIso(kayma){
    const d = new Date();
    if(kayma) d.setDate(d.getDate() + kayma);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Normalize henüz koşmadıysa (oturum içinde yeni eklenen not) alanlar eksik
     olabilir — varsayılanlar burada da üretilir ki alıntı reload beklemeden
     döngüye girsin. Kalıcılık yine kitapNormalize beyaz listesinin işidir. */
  function durumOf(n){
    if(n.tekrarDurum === 'aktif' || n.tekrarDurum === 'duraklatildi') return n.tekrarDurum;
    return n.tip === 'alinti' ? 'aktif' : 'duraklatildi';
  }
  function aralikOf(n){
    return Math.min(MAX_ARALIK, Math.max(MIN_ARALIK, parseInt(n.tekrarAralik) || ILK_GUN));
  }
  /* Kasıtlı tekrar eylemi = gerçek kullanıcı düzenlemesi: LWW damgasını açıkça
     basarız. Otomatik zamanlama basmaz — kitapParmak tekrar* alanlarını dışlar
     (senkron.js), yoksa salt-render cihaz birleşmede gerçek düzenlemeyi ezerdi. */
  function damgaBas(k){ k.g = Date.now(); }

  function aralikBuyut(a){ return Math.min(MAX_ARALIK, Math.round(a * CARPAN)); }
  function aralikKucult(a){ return Math.max(MIN_ARALIK, Math.round(a / CARPAN)); }

  function notListesi(){
    const c = [];
    if(typeof veri !== 'object' || !veri || !Array.isArray(veri.kitaplar)) return c;
    veri.kitaplar.forEach(k => (k.notlar || []).forEach(n => c.push({ n, k })));
    return c;
  }

  /* ---------- günlük sayaç (cihaz-yerel) ---------- */
  function sayacYukle(){
    try{
      const s = JSON.parse(localStorage.getItem(SAYAC_ANAHTAR));
      if(s && s.gun === gunIso(0)) return { gun: s.gun, islenen: parseInt(s.islenen) || 0 };
    }catch(e){ /* bozuk sayaç → sıfırdan başla; sessiz geçiş kasıtlı */ }
    return { gun: gunIso(0), islenen: 0 };
  }
  function sayacArtir(){
    const s = sayacYukle();
    s.islenen++;
    try{ localStorage.setItem(SAYAC_ANAHTAR, JSON.stringify(s)); }catch(e){ window._iz && window._iz('tekrarSayacYaz', e); }
  }

  /* ---------- ilk zamanlama + yayılma ----------
     Planı olmayan aktif notlar tarih sırasıyla (en eski önce — en çok unutulmuş
     olan ilk karşılaşmayı hak eder) günde YAYILMA_GUNLUK olacak şekilde ILK_GUN'den
     başlayarak ileriye dağıtılır. Tek yeni alıntı = ILK_GUN sonra; Goodreads'ten
     gelen 200 alıntı = ~25 güne yayılır, ilk açılışta hepsi birden dayatılmaz. */
  function planlamaYap(){
    const bekleyen = notListesi().filter(b => durumOf(b.n) === 'aktif' && !b.n.tekrarSonraki);
    if(!bekleyen.length) return 0;
    bekleyen.sort((a, b) => ((a.n.tarih || '').localeCompare(b.n.tarih || ''))
      || String(a.n.id).localeCompare(String(b.n.id)));
    bekleyen.forEach((b, i) => {
      b.n.tekrarSonraki = gunIso(ILK_GUN + Math.floor(i / YAYILMA_GUNLUK));
      b.n.tekrarAralik = aralikOf(b.n);
      b.n.tekrarSayisi = parseInt(b.n.tekrarSayisi) || 0;
      b.n.tekrarDurum = 'aktif';
    });
    if(typeof depoKaydet === 'function') depoKaydet();
    return bekleyen.length;
  }

  /* ---------- kuyruk ---------- */
  function kuyruk(){
    const bugunkuGun = gunIso(0);
    return notListesi()
      .filter(b => durumOf(b.n) === 'aktif' && b.n.tekrarSonraki && b.n.tekrarSonraki <= bugunkuGun)
      .sort((a, b) => (a.n.tekrarSonraki.localeCompare(b.n.tekrarSonraki))
        || ((a.n.tarih || '').localeCompare(b.n.tarih || ''))
        || String(a.n.id).localeCompare(String(b.n.id)));
  }
  function kalanHak(){ return Math.max(0, GUNLUK_SINIR - sayacYukle().islenen); }
  function bugunKuyruk(){ return kuyruk().slice(0, kalanHak()); }

  /* ---------- eylemler ---------- */
  function notBul(nid){
    for(const b of notListesi()) if(String(b.n.id) === String(nid)) return b;
    return null;
  }
  function eylem(nid, tur){
    const b = notBul(nid);
    if(!b){ ciz(); return; }
    const n = b.n;
    if(tur === 'devam'){
      n.tekrarAralik = aralikBuyut(aralikOf(n));
      n.tekrarSonraki = gunIso(n.tekrarAralik);
      n.tekrarSayisi = (parseInt(n.tekrarSayisi) || 0) + 1;
      n.tekrarDurum = 'aktif';
      bildir(n.tekrarAralik + ' gün sonra yeniden karşına çıkar');
    }else if(tur === 'sik'){
      n.tekrarAralik = aralikKucult(aralikOf(n));
      n.tekrarSonraki = gunIso(n.tekrarAralik);
      n.tekrarSayisi = (parseInt(n.tekrarSayisi) || 0) + 1;
      n.tekrarDurum = 'aktif';
      bildir('Şimdi ' + n.tekrarAralik + ' gün aralıkla gelecek');
    }else if(tur === 'yeter'){
      n.tekrarDurum = 'duraklatildi';
      n.tekrarSayisi = (parseInt(n.tekrarSayisi) || 0) + 1;
      bildir('Duraklatıldı — alıntı kartından yeniden başlatabilirsin');
    }
    sayacArtir();
    n.ng = Date.now();   // kasıtlı not düzenlemesi: senkron not birleşiminde bu kopya kazansın
    damgaBas(b.k);
    if(typeof depoKaydet === 'function') depoKaydet();
    ciz();
  }
  /* Duraklatılmışı yeniden başlat: merdivendeki yeri korunur (duraklatma ceza
     değildir), mevcut aralık kadar sonra döner. Hiç döngüye girmemiş not için
     bu ILK_GUN'dür — "tekrara al" opt-in yolu da budur. */
  function baslat_(nid){
    const b = notBul(nid);
    if(!b) return;
    b.n.tekrarDurum = 'aktif';
    b.n.tekrarAralik = aralikOf(b.n);
    b.n.tekrarSonraki = gunIso(b.n.tekrarAralik);
    b.n.tekrarSayisi = parseInt(b.n.tekrarSayisi) || 0;
    b.n.ng = Date.now();   // kasıtlı not düzenlemesi (yeniden başlatma)
    damgaBas(b.k);
    if(typeof depoKaydet === 'function') depoKaydet();
    bildir(b.n.tekrarAralik + ' gün sonra karşına çıkar');
    ciz();
  }

  /* ---------- çizim ---------- */
  let sira = 0;   // "Sonraki" gezinmesi — oturum içi, kalıcı değil

  function kutuCiz(){
    const kap = document.getElementById('tkKutu');
    if(!kap) return;
    const tum = notListesi().filter(b => durumOf(b.n) === 'aktif');
    if(!tum.length){ kap.innerHTML = ''; return; }

    const tumKuyruk = kuyruk();
    const bugunku = bugunKuyruk();
    const islenen = sayacYukle().islenen;
    const enUzun = tum.reduce((m, b) => Math.max(m, aralikOf(b.n)), 0);
    const ist = '<div class="tk-ist">' + ik('tekrar') + ' ' + tum.length + ' alıntı döngüde · bugün '
      + tumKuyruk.length + ' bekliyor · en uzun aralık ' + enUzun + ' gün</div>';

    let govde = '';
    if(bugunku.length){
      const b = bugunku[sira % bugunku.length];
      const n = b.n, k = b.k;
      govde = '<div class="tk-baslik"><span class="kicker">Tekrar zamanı</span>'
        + '<span class="tk-rozet-sayi">' + bugunku.length + '</span>'
        + '<span class="tk-baslik-not">zamanı gelen alıntıların — sınav değil, yeniden karşılaşma</span></div>'
        + '<div class="tk-kart" data-nid="' + escAttr(n.id) + '" data-kid="' + escAttr(k.id) + '">'
        +   '<div class="tk-metin">&ldquo;' + esc(n.metin) + '&rdquo;</div>'
        +   '<div class="tk-kaynak">&mdash; ' + esc(k.ad)
        +     (k.yazar ? ', ' + esc(k.yazar) : '') + (n.sayfa ? ' (sf. ' + n.sayfa + ')' : '')
        +     ' <button class="tk-git" data-act="tk-git" data-id="' + escAttr(k.id) + '">kitaba git →</button></div>'
        +   '<div class="tk-eylem">'
        +     '<button class="tk-btn tk-btn-birincil" data-act="tk-devam" data-nid="' + escAttr(n.id) + '" title="'
        +       aralikBuyut(aralikOf(n)) + ' gün sonra tekrar">' + ik('onay') + ' Devam etsin</button>'
        +     '<button class="tk-btn" data-act="tk-sik" data-nid="' + escAttr(n.id) + '" title="'
        +       aralikKucult(aralikOf(n)) + ' gün aralıkla">' + ik('geri') + ' Daha sık</button>'
        /* İkonsuz: ✕/çarpı görsel dilde kapat/vazgeç düğmelerine özgü; buradaki
           eylem vazgeçme değil döngüden çıkarma. Etiket DAVRANIŞI söyler (v62):
           yalnız "Yeter" silme çağrışımı yapıyordu, oysa kayıt duraklatılıyor —
           etiket ve title bunu açıkça söyler, geri alma yolu keşfedilebilir kalır. */
        +     '<button class="tk-btn" data-act="tk-yeter" data-nid="' + escAttr(n.id) + '"'
        +       ' title="Döngüden çıkarır — silinmez; listedeki kartından yeniden başlatabilirsin">Yeter, duraklat</button>'
        +     (bugunku.length > 1 ? '<button class="tk-btn tk-btn-atla" data-act="tk-atla">Sonraki ›</button>' : '')
        +   '</div>'
        + '</div>';
    }else if(islenen > 0){
      govde = '<div class="tk-tamam">Bugünlük tamam ' + ik('onay')
        + (tumKuyruk.length ? ' — kalan ' + tumKuyruk.length + ' alıntı yarına' : '')
        + '</div>';
    }
    /* innerHTML yazımı odaklanılan düğmeyi yok eder; klavye akışı (günde 10 karta
       kadar ardışık eylem) kopmasın diye odak kutunun içindeyse yeni karta taşınır. */
    const odakIcerideydi = kap.contains(document.activeElement);
    kap.innerHTML = govde ? ('<div class="tk-kutu-ic">' + govde + ist + '</div>')
      : ('<div class="tk-kutu-ic tk-sade">' + ist + '</div>');
    if(odakIcerideydi){
      const hedef = kap.querySelector('.tk-btn-birincil') || kap.querySelector('.tk-tamam') || kap.querySelector('button');
      if(hedef){ if(!hedef.hasAttribute('tabindex') && hedef.tagName !== 'BUTTON') hedef.setAttribute('tabindex', '-1'); hedef.focus(); }
    }
  }

  /* Liste kartlarına küçük durum göstergesi — fikir.js/kart.js gibi render SONRASI
     zenginleştirme (çekirdek alintiCiz'e dokunulmaz). Gösterge her geçişte
     GÜNCELLENİR (yalnız ilk seferde eklenip bırakılmaz): "Yeter"/"tekrara al"
     sonrası kart bayat kalmasın. İçerik yazımı kartın childList'ini değiştirmez,
     gözlemci döngüsü oluşmaz. */
  function kartlariZenginlestir(){
    const kap = document.getElementById('alintiIcerik');
    if(!kap) return;
    kap.querySelectorAll('.not-kart[data-nid]').forEach(kart => {
      const b = notBul(kart.dataset.nid);
      if(!b) return;
      let d = kart.querySelector('.tk-durum');
      if(!d){
        d = document.createElement('div');
        d.className = 'tk-durum';
        kart.appendChild(d);
      }
      const n = b.n;
      /* innerHTML güvenli: içerik yalnız ikon SVG'si + sabit metin + sayı
         (gunFarki çıktısı) — kullanıcı verisi girmiyor, kaçış gerekmez. */
      if(durumOf(n) === 'aktif' && n.tekrarSonraki){
        const kalanGun = (typeof gunFarki === 'function') ? gunFarki(gunIso(0), n.tekrarSonraki) : 0;
        d.innerHTML = ik('tekrar') + ' ' + (kalanGun <= 0 ? 'bugün' : kalanGun + ' gün sonra');
      }else if(durumOf(n) === 'aktif'){
        d.innerHTML = ik('tekrar') + ' planlanıyor…';
      }else{
        const hicGirmedi = n.tip === 'not' && !(parseInt(n.tekrarSayisi) || 0);
        d.innerHTML = (hicGirmedi ? '' : ik('durakla') + ' duraklatıldı ')
          + '<button class="tk-mini" data-act="tk-baslat" data-nid="' + escAttr(n.id) + '">'
          + (hicGirmedi ? ik('tekrar') + ' tekrara al' : ik('oynat') + ' başlat') + '</button>';
      }
    });
  }

  function ciz(){
    planlamaYap();
    kutuCiz();
    kartlariZenginlestir();
  }

  /* ---------- bağlama ---------- */
  function kur(){
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      switch(el.dataset.act){
        case 'tk-devam': eylem(el.dataset.nid, 'devam'); break;
        case 'tk-sik':   eylem(el.dataset.nid, 'sik'); break;
        case 'tk-yeter': eylem(el.dataset.nid, 'yeter'); break;
        case 'tk-atla':  sira++; kutuCiz(); break;
        case 'tk-baslat': baslat_(el.dataset.nid); break;
        case 'tk-git':
          if(typeof detayAc === 'function') detayAc(el.dataset.id);
          if(window.__fikir && window.__fikir.detayZenginlestir)
            setTimeout(window.__fikir.detayZenginlestir, 0);
          break;
        case 'sekme':
          if(el.dataset.v === 'alinti') setTimeout(ciz, 0);
          break;
        /* Çekirdeğin not ekleme/silme yolları alintiCiz çağırmaz (yalnız detay +
           liste çizer) — kutu bayat kalır ve yeni alıntı zamanlanmadan senkrona
           giderdi. fikir.js emsali: çekirdek aksiyonlarını gözlemek serbest. */
        case 'not-ekle':
        case 'not-sil':
          setTimeout(ciz, 0);
          break;
      }
    });
    const kap = document.getElementById('alintiIcerik');
    if(kap) new MutationObserver(() => {
      /* alintiCiz her innerHTML yazışında tetiklenir; kutu #alintiIcerik DIŞINDA
         (#tkKutu) ve kart eki damgalı olduğundan döngü oluşmaz. */
      ciz();
    }).observe(kap, { childList: true });
    ciz();   // açılış ?sekme=alinti ile gelmişse ilk render'ı observer kaçırmıştır
  }

  if(document.getElementById('tkKutu')) kur();
  else document.addEventListener('DOMContentLoaded', kur);

  window.__tekrar = { kuyruk, bugunKuyruk, planlamaYap, aralikBuyut, aralikKucult,
    CARPAN, MIN_ARALIK, MAX_ARALIK, ILK_GUN, GUNLUK_SINIR, YAYILMA_GUNLUK, SAYAC_ANAHTAR };
})();
