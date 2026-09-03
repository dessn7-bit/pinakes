/* Kitaplık — toplu katalog eklentisi
   Seri barkod tarama: kamera açık kalır, kitap kitap okutursun, hepsi rafa düşer.
   Ayrıca fiziksel raf konumu (nerede duruyor) ve ISBN kaydı.
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  let akis = null, tarayici = null, dongu = null, calisiyor = false;
  let oturumKayitlari = [];
  let sonKodZaman = {};

  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function bip(){
    try{
      const C = window.AudioContext || window.webkitAudioContext;
      if(!C) return;
      const ctx = new C();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.06;
      o.start(); o.stop(ctx.currentTime + 0.09);
      setTimeout(() => ctx.close(), 300);
    }catch(e){ /* ses özelliği yok — sessiz geçiş kasıtlı */ }
  }

  function formAlaniEkle(){
    if(document.getElementById('f-raf')) return;
    const etiket = document.getElementById('f-etiket');
    if(!etiket) return;
    const sar = document.createElement('div');
    sar.innerHTML = '<label for="f-raf">Raf konumu</label>'
      + '<input id="f-raf" list="rafListesi" placeholder="ör. üst raf sol blok" autocomplete="off">'
      + '<datalist id="rafListesi"></datalist>';
    etiket.parentNode.insertBefore(sar, etiket.nextSibling);
    rafListesiDoldur();
  }
  function rafListesiDoldur(){
    const dl = document.getElementById('rafListesi');
    if(!dl) return;
    const hepsi = new Set();
    (veri.kitaplar||[]).forEach(k => { if(k.raf) hepsi.add(k.raf); });
    dl.innerHTML = [...hepsi].sort((a,b) => a.localeCompare(b,'tr'))
      .map(r => '<option value="' + kacir(r) + '">').join('');
  }
  function formuBagla(){
    if(typeof window.formAc === 'function' && !window.formAc.__katalog){
      const asil = window.formAc;
      const sarmal = function(id){
        const s = asil.apply(this, arguments);
        formAlaniEkle();
        const alan = document.getElementById('f-raf');
        const k = id ? (veri.kitaplar||[]).find(x => x.id === id) : null;
        if(alan) alan.value = k ? (k.raf||'') : '';
        rafListesiDoldur();
        return s;
      };
      sarmal.__katalog = true;
      window.formAc = sarmal;
    }
    if(typeof window.formKaydet === 'function' && !window.formKaydet.__katalog){
      const asil = window.formKaydet;
      const sarmal = function(){
        const alan = document.getElementById('f-raf');
        const raf = alan ? alan.value.trim() : '';
        const oncekiIdler = new Set((veri.kitaplar||[]).map(k => k.id));
        const duzenlenen = (typeof durum === 'object') ? durum.formDuzenId : null;
        const s = asil.apply(this, arguments);
        let hedef = null;
        if(duzenlenen) hedef = (veri.kitaplar||[]).find(k => k.id === duzenlenen);
        else hedef = (veri.kitaplar||[]).find(k => !oncekiIdler.has(k.id));
        if(hedef && (raf || hedef.raf)){
          hedef.raf = raf;
          if(typeof depoKaydet === 'function') depoKaydet();
        }
        rafListesiDoldur();
        return s;
      };
      sarmal.__katalog = true;
      window.formKaydet = sarmal;
    }
  }

  function detayZenginlestir(){
    const kap = document.getElementById('detayIcerik');
    if(!kap || document.getElementById('rafBilgi')) return;
    // v45: çekirdek künye tablosu raf + ISBN satırlarını zaten gösteriyor —
    // tablo varken ikinci bir raf/ISBN satırı basma (çifte bilgi olurdu).
    // Tablo yoksa (eski çekirdek) eski davranış sürer.
    if(document.getElementById('dKunyeTablo')) return;
    if(typeof durum !== 'object' || !durum.detayId) return;
    const k = (veri.kitaplar||[]).find(x => x.id === durum.detayId);
    if(!k || (!k.raf && !k.isbn)) return;
    const meta = kap.querySelector('.detay-meta');
    if(!meta) return;
    const e = document.createElement('div');
    e.id = 'rafBilgi';
    e.style.cssText = 'font-size:.8rem;color:var(--muted2);margin-top:8px';
    e.innerHTML = (k.raf ? (window.ikon?window.ikon('kitaplik'):'') + ' ' + kacir(k.raf) : '') + (k.raf && k.isbn ? ' · ' : '')
      + (k.isbn ? 'ISBN ' + kacir(k.isbn) : '');
    meta.parentNode.insertBefore(e, meta.nextSibling);
  }

  function kameraVar(){
    // Yedek tarayıcı (barkod.js motoru) sayesinde BarcodeDetector şart değil
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function ortuEkle(){
    if(document.getElementById('seriOrtu')) return;
    const o = document.createElement('div');
    o.className = 'ortu'; o.id = 'seriOrtu';
    o.innerHTML =
      '<div class="sheet">' +
        '<div class="tutamac"></div>' +
        '<button class="sheet-kapat" data-act="seri-kapat" aria-label="Kapat">✕</button>' +
        '<div class="sheet-baslik">Seri tarama</div>' +
        '<div style="font-size:.85rem;color:var(--muted);margin-top:6px">Kamerayı kitabın barkoduna tut, ekleyeyim; sonra sıradakini tut. Form açılmaz.</div>' +
        '<div class="form-iki" style="margin-top:10px">' +
          '<div><label for="seriDurum">Durum</label>' +
            '<select id="seriDurum">' +
              '<option value="okunacak">Okunacak</option>' +
              '<option value="bitti">Bitti</option>' +
              '<option value="yarim">Yarım kaldı</option>' +
            '</select></div>' +
          '<div><label for="seriRaf">Raf konumu</label>' +
            '<input id="seriRaf" placeholder="ör. üst raf" autocomplete="off"></div>' +
        '</div>' +
        '<div style="margin-top:12px;border-radius:12px;overflow:hidden;background:var(--kamera-zemin);position:relative">' +
          '<video id="seriVideo" playsinline muted style="width:100%;max-height:38vh;object-fit:cover;display:block"></video>' +
          '<div style="position:absolute;inset:24% 12%;border:2px solid var(--kamera-cerceve);border-radius:10px;pointer-events:none"></div>' +
        '</div>' +
        '<div id="seriNot" style="font-size:.85rem;color:var(--muted);margin-top:10px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<input id="seriElle" inputmode="numeric" placeholder="ISBN elle" autocomplete="off" style="flex:1">' +
          '<button class="btn btn-cerceve" style="width:auto;padding:11px 16px" data-act="seri-elle">Ekle</button>' +
        '</div>' +
        '<div id="seriListe" style="margin-top:12px"></div>' +
        '<div style="height:12px"></div>' +
        '<button class="btn btn-brass" data-act="seri-kapat">Taramayı bitir</button>' +
      '</div>';
    document.body.appendChild(o);
  }
  function listeCizSeri(){
    const el = document.getElementById('seriListe');
    if(!el) return;
    if(!oturumKayitlari.length){ el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-size:.8rem;color:var(--brass);margin-bottom:6px"><b>'
      + oturumKayitlari.length + ' kitap eklendi</b></div>'
      + oturumKayitlari.slice().reverse().slice(0, 12).map(x =>
        '<div class="not-kart" style="margin-top:6px">'
        + '<div style="font-size:.85rem">' + kacir(x.ad) + '</div>'
        + '<div style="font-size:.75rem;color:var(--muted2);margin-top:2px">' + kacir(x.yazar || '') + '</div>'
        + '<button class="not-sil" data-act="seri-geri" data-id="' + x.id + '" aria-label="Geri al">✕</button>'
        + '</div>').join('');
  }
  /* Kitap kopya tespiti çekirdeğin katla()'sıyla: "Istanbul" ve "İstanbul" aynı kitaptır. */
  const kat = s => (typeof katla === 'function') ? katla(s) : String(s ?? '').toLocaleLowerCase('tr');
  function zatenVar(isbn, ad, yazar){
    const a = kat(ad), y = kat(yazar);
    return (veri.kitaplar||[]).find(k =>
      (isbn && k.isbn === isbn) ||
      (kat(k.ad) === a && kat(k.yazar) === y));
  }
  /* Yakın kayıt UYARICISI (v96) — süzme DEĞİL: hiçbir aday atılmaz, hiçbir
     kayıt engellenmez; kitap yine eklenir, kullanıcı yalnız uyarılır.
     Neden: kütüphanenin 242 kaydından 241'inde ISBN boş — zatenVar'ın ISBN
     kolu mevcut kayıtlara karşı pratikte hiç çalışmıyor, her şey birebir
     başlık eşitliğine kalıyor; seri taramada form açılmadığı için kullanıcı
     benzer kaydı hiç görmüyordu. İki kol, ikisi de AYNI YAZAR kapısının ardında:
       (1) adTr — "An Actor Prepares" elle eklenmiş, fiziksel Türkçe baskı
           "Bir Aktör Hazırlanıyor" geliyor; ortak harfleri yok, yalnız Türkçe
           ad alanından (kitapNormalize adTr / form f-adtr, v73) yakalanır.
           Tam adTr eşitliği de BURADA uyarıdır: zatenVar adTr'ye bakmaz
           (baksa ekleme ENGELİ olurdu — çeviri baskısı ayrı fiziksel kitaptır).
       (2) önek — kısa olan ≥8 harf ve uzunun başlangıcı ("Harry Potter ve
           Felsefe Taşı" / "… (Ciltli)"); "Dune"/"Dune Messiah" 4 harf → uyarı
           YOK (yanlış pozitif, kaçırmaktan pahalı).
     Birebir ad eşitliği zatenVar'ın işi, burada dışlanır — ekleme ÖNCESİ de
     SONRASI da çağrılsa kayıt kendini bulmaz. */
  function yakinKayit(ad, yazar){
    const y = kat(yazar);
    if(!y) return null;
    const a = kat(ad);
    if(!a) return null;
    const benzer = (x, z) => {
      if(!x || !z || x === z) return false;
      const kisa = x.length < z.length ? x : z;
      const uzun = x.length < z.length ? z : x;
      return kisa.length >= 8 && uzun.startsWith(kisa);
    };
    return (veri.kitaplar||[]).find(k => {
      if(kat(k.yazar||'') !== y) return false;
      const b = kat(k.ad||'');
      const t = kat(k.adTr||'');
      if(a === b) return false;             // tam eşitlik zatenVar'ın işi
      return a === t || benzer(a, b) || benzer(a, t);
    }) || null;
  }
  async function kodIsle(kod, elle){
    if(!window.__barkod || !window.__barkod.isbnGecerli(kod)){
      if(elle) bildir('Geçersiz ISBN');
      return;
    }
    const t = window.__barkod.isbnTemizle(kod);
    const simdi = Date.now();
    if(!elle && sonKodZaman[t] && simdi - sonKodZaman[t] < 4000) return;
    sonKodZaman[t] = simdi;
    const not = document.getElementById('seriNot');
    if(not) not.textContent = 'ISBN ' + t + ' aranıyor…';
    const { sonuc: k, agSorunu } = await window.__barkod.isbnAra(t);
    if(!k || !k.ad){
      // Ağ arızası "kitap yok" demek DEĞİL: seri taramada sessizce atlanırsa
      // Kaan tüm rafı tarayıp hiçbirinin bulunmadığını sanabilir.
      if(agSorunu){
        if(not) not.innerHTML = (window.ikon?window.ikon('uyari'):'') + ' <b style="color:var(--drop)">İnternete ulaşılamadı</b> — '
          + 'ISBN ' + kacir(t) + ' sorgulanamadı, kitap EKLENMEDİ. Bağlantını kontrol edip tekrar okut.';
        bildir('İnternete ulaşılamadı — kitap eklenmedi');
      }else{
        if(not) not.textContent = 'ISBN ' + t + ' bulunamadı — elle ekleyebilirsin.';
        bildir('Bulunamadı: ' + t);
      }
      return;
    }
    const eski = zatenVar(t, k.ad, k.yazar);
    if(eski){
      if(not) not.textContent = 'Zaten kayıtlı: ' + k.ad;
      bildir('Zaten var: ' + k.ad);
      return;
    }
    /* v96: yakınlık ekleme ÖNCESİ ölçülür, ekleme SONRASI söylenir — engel DEĞİL. */
    const yakin = yakinKayit(k.ad, k.yazar);
    const durumSec = (document.getElementById('seriDurum')||{}).value || 'okunacak';
    const raf = ((document.getElementById('seriRaf')||{}).value || '').trim();
    const kayit = (typeof kitapNormalize === 'function' ? kitapNormalize : (x => x))({
      id: (typeof uid === 'function' ? uid() : String(simdi) + Math.random().toString(36).slice(2,6)),
      eklenme: simdi, g: simdi,
      ad: k.ad, yazar: k.yazar || '', yayinevi: k.yayinevi || '',
      yil: k.yil || null, sayfa: k.sayfa || null, tur: k.tur || '',
      durum: durumSec, kapak: k.kapak || null,
      cevirmen: k.cevirmen || '', dil: k.dil || '',   // v97: 1000Kitap künyesinden (kitapNormalize alanları)
      guncelSayfa: durumSec === 'bitti' && k.sayfa ? k.sayfa : 0,
      bitisTarihi: durumSec === 'bitti' && typeof bugun === 'function' ? bugun() : null
    });
    kayit.raf = raf; kayit.isbn = t; kayit.g = simdi;
    kayit.sahiplik = 'sahip';   // fiziksel kitabı okutuyorsun: istek listesi değil
    veri.kitaplar.push(kayit);
    if(typeof depoKaydet === 'function') depoKaydet();
    /* Otomatik tür (v65): seri taramada her kitap zengin.js otoTur KUYRUĞUNA
       girer — kuyruk istekleri ARALIK_MS ile serileştirir, arka arkaya okutulan
       raf kota patlatmaz. ISBN yanıtının kendi kategorileri varsa ek istek
       hiç atılmaz; tarama akışı BEKLEMEZ (tür arkadan gelir). */
    if(!kayit.tur && window.__zengin && window.__zengin.otoTur)
      window.__zengin.otoTur(kayit.id,
        (Array.isArray(k.kategoriler) && k.kategoriler.length) ? k.kategoriler : null);
    /* Taslak özet (v83): otoTur ile AYNI nokta, aynı desen — v82'de yalnız
       form yoluna bağlanmıştı (spec eksiği). Seri taramada ek önlem yok:
       taslak kuyruğu zaten kitap başına ≥3 sn serileştiriyor. Kapılar
       (ayar/özet/taslak/defter/çevrimdışı) taslakAday içinde. */
    if(typeof taslakAday === 'function') taslakAday(kayit.id);
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    oturumKayitlari.push({ id: kayit.id, ad: kayit.ad, yazar: kayit.yazar });
    listeCizSeri(); rafListesiDoldur(); bip();
    if(yakin){
      /* v96: kayıt EKLENDİ, kullanıcı yalnız uyarılıyor — geri alma oturum
         listesindeki ✕ ile zaten var. adTr'den yakalandıysa Türkçe adı da
         yazılır ki "neden benzer" belli olsun. */
      if(not) not.textContent = 'Eklendi: ' + k.ad + ' — DİKKAT: benzer kayıt zaten var: "' + yakin.ad + '"'
        + (yakin.adTr ? ' (Türkçe adı: ' + yakin.adTr + ')' : '');
      bildir('Benzer kayıt var: ' + yakin.ad);
    }else{
      if(not) not.textContent = 'Eklendi: ' + k.ad + ' — sıradakini okut.';
    }
  }
  function geriAl(id){
    const i = (veri.kitaplar||[]).findIndex(k => k.id === id);
    if(i >= 0){
      const isbn = veri.kitaplar[i].isbn;
      if(isbn) delete sonKodZaman[isbn];
      veri.silinenler = veri.silinenler || {};
      veri.silinenler[id] = Date.now();
      veri.kitaplar.splice(i, 1);
      if(typeof depoKaydet === 'function') depoKaydet();
      if(typeof hepsiniCiz === 'function') hepsiniCiz();
    }
    oturumKayitlari = oturumKayitlari.filter(x => x.id !== id);
    listeCizSeri();
    bildir('Geri alındı');
  }
  async function seriAc(){
    ortuEkle();
    oturumKayitlari = []; sonKodZaman = {};
    listeCizSeri();
    document.getElementById('seriOrtu').classList.add('acik');
    const not = document.getElementById('seriNot');
    if(!kameraVar()){
      not.textContent = 'Bu cihaz barkod kamerasını desteklemiyor — ISBN\'leri elle girebilirsin.';
      return;
    }
    /* Tarama motoru barkod.js'te ORTAK ('isbn' enum kusuru burada da vardı —
       geçersiz format constructor'ı düşürüyor, seri tarama hiç okuyamıyordu).
       Yerli tarayıcı kurulamazsa ZXing yedeği aynı döngüde kare çözer;
       calisiyor kilidi ve 500ms aralık AYNEN korunur (g11 M7 sözleşmesi). */
    const M = window.__barkod || {};
    try{
      akis = await navigator.mediaDevices.getUserMedia(
        M.kameraKisitlari ? M.kameraKisitlari() : { video: { facingMode: 'environment' } });
      const v = document.getElementById('seriVideo');
      v.srcObject = akis; await v.play();
      if(M.odaklan) M.odaklan(akis);
      tarayici = M.tarayiciKur ? await M.tarayiciKur() : null;
      let tuval = null;
      if(!tarayici){
        not.textContent = 'Yedek tarayıcı yükleniyor…';
        const ok = M.yedekYukle ? await M.yedekYukle() : false;
        if(!ok){
          not.textContent = 'Barkod tarayıcı yüklenemedi — ISBN\'leri elle girebilirsin.';
          return;
        }
        if(!akis) return;   // yükleme sürerken pencere kapatıldıysa
        tuval = document.createElement('canvas');
      }
      not.textContent = 'Hazır — barkodu çerçeveye getir.';
      dongu = setInterval(async () => {
        if(calisiyor) return;
        calisiyor = true;
        try{
          if(tarayici){
            const b = await tarayici.detect(v);
            if(b && b.length) await kodIsle(b[0].rawValue);
          }else{
            const kod = M.yedekVideoCoz ? M.yedekVideoCoz(v, tuval) : null;
            if(kod) await kodIsle(kod);
          }
        }catch(e){ /* bu karede kod çözülemedi (normal) — sessiz geçiş kasıtlı */ }
        calisiyor = false;
      }, 500);
    }catch(e){
      not.textContent = 'Kamera açılamadı: '
        + (M.kameraHataAdi ? M.kameraHataAdi(e) : 'izin verilmemiş olabilir')
        + ' — ISBN\'leri elle girebilirsin.';
    }
  }
  function seriKapat(){
    clearInterval(dongu); dongu = null; calisiyor = false;
    if(akis){ akis.getTracks().forEach(t => t.stop()); akis = null; }
    const v = document.getElementById('seriVideo');
    if(v) v.srcObject = null;
    const o = document.getElementById('seriOrtu');
    if(o) o.classList.remove('acik');
    if(oturumKayitlari.length) bildir(oturumKayitlari.length + ' kitap kütüphaneye eklendi');
    oturumKayitlari = [];
  }

  function kartEkle(){
    // v56: konum YUVA ile sabit ("Katalog araçları" bölümü); yuva yoksa eski yol.
    const yuva = document.getElementById('ayYuvaKatalog');
    const kap = yuva || document.querySelector('.yedek-wrap');
    if(!kap || document.getElementById('katalogKart')) return;
    const kart = document.createElement('div');
    kart.className = 'ay-blok'; kart.id = 'katalogKart';
    kart.innerHTML = '<h3 class="ay-baslik">Toplu katalog (seri tarama)</h3>'
      + '<p class="ay-not">Fiziksel rafını sisteme geçir: kamera açık kalır, kitapları arka arkaya okutursun. Her kitap için form açılmaz, raf konumu hepsine birden yazılır.</p>'
      + '<div class="ay-eylem"><button class="btn btn-cerceve" data-act="seri-ac">'
      + (window.ikon?window.ikon('kitaplik'):'') + ' Seri taramayı başlat</button></div>';
    yuva ? kap.appendChild(kart) : kap.insertBefore(kart, kap.firstChild);
  }

  /* D1 (görsel ince ayar): arama placeholder'ının TEK sahibi index.html.
     Buradaki eski "raf" ekleme override'ı uzun metni geri basıyordu ve 412px'te
     kesiliyordu — placeholder örnekleyicidir, arama kapsamının sözleşmesi değil
     (raf araması zaten çalışır ve testlidir). v58: geriye kalan boş
     `aramayaRafEkle(){}` kabuğu ve çağrısı kaldırıldı; karar bu notta yaşıyor. */

  function baslat(){
    kartEkle(); formuBagla();

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      const act = el.dataset.act;
      if(act === 'seri-ac'){ seriAc(); }
      else if(act === 'seri-kapat'){ seriKapat(); }
      else if(act === 'seri-geri'){ geriAl(el.dataset.id); }
      else if(act === 'seri-elle'){
        const g = document.getElementById('seriElle');
        if(g && g.value.trim()){ kodIsle(g.value.trim(), true); g.value = ''; }
      }
      else if(act === 'yeni' || act === 'duzenle'){ setTimeout(formAlaniEkle, 0); }
      else if(act === 'detay' || act === 'alinti-git'){ setTimeout(detayZenginlestir, 0); }
      /* Kart boot'ta .yedek-wrap'a zaten giriyor; bu yalnız emniyet kemeri.
         Eski kancası "Yedek sekmesi"ydi, o sekme kalktı — Ayarlar penceresi. */
      else if(act === 'ayar-ac'){ setTimeout(kartEkle, 0); }
    });

    document.addEventListener('keydown', e => {
      if(e.key === 'Enter' && e.target && e.target.id === 'seriElle'){
        e.preventDefault();
        if(e.target.value.trim()){ kodIsle(e.target.value.trim(), true); e.target.value = ''; }
      }
    });
  }

  if(document.querySelector('.yedek-wrap')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__katalog = { kodIsle, geriAl, zatenVar, yakinKayit, seriAc, seriKapat, formAlaniEkle,
    detayZenginlestir, rafListesiDoldur, oturum: () => oturumKayitlari };
})();
