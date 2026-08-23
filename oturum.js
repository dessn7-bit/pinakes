/* Kitaplık — okuma oturumu & seri eklentisi
   Gerçek süre ölçümü: başla/bitir, saatte kaç sayfa, günlük dakika, kesintisiz gün sayısı.
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  const OTURUM_ANAHTAR = 'kk_oturum_v1';   // açık oturum (tek seferde bir kitap)
  const UNUTMA_SINIRI = 4 * 60 * 60 * 1000; // 4 saat: muhtemelen kapatmayı unuttu
  let tikZaman = null;

  function bildir(m){ if(typeof toast === 'function') toast(m); }
  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function acikOturum(){
    try{ return JSON.parse(localStorage.getItem(OTURUM_ANAHTAR)) || null; }catch(e){ return null; }
  }
  function oturumYaz(o){
    try{ o ? localStorage.setItem(OTURUM_ANAHTAR, JSON.stringify(o)) : localStorage.removeItem(OTURUM_ANAHTAR); }catch(e){ window._iz && window._iz('oturumYaz', e); }
  }
  function gunStr(ts){
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function sureMetni(ms){
    const dk = Math.max(0, Math.round(ms / 60000));
    if(dk < 60) return dk + ' dk';
    const s = Math.floor(dk / 60), k = dk % 60;
    return k ? s + ' sa ' + k + ' dk' : s + ' sa';
  }

  /* ---------- veri: k.oturumlar = [{b:baslangic, s:sureMs, sa:sayfaBaslangic, sb:sayfaBitis, sup:true?}] ---------- */
  function oturumEkle(k, kayit){
    k.oturumlar = Array.isArray(k.oturumlar) ? k.oturumlar : [];
    k.oturumlar.push(kayit);
    if(k.oturumlar.length > 400) k.oturumlar = k.oturumlar.slice(-400);
  }
  function toplamSure(k){
    return (k.oturumlar||[]).filter(o => !o.sup).reduce((t,o) => t + (o.s||0), 0);
  }
  function toplamSayfa(k){
    return (k.oturumlar||[]).filter(o => !o.sup)
      .reduce((t,o) => t + Math.max(0, (o.sb||0) - (o.sa||0)), 0);
  }
  function hizSayfaSaat(k){
    const sr = toplamSure(k), sy = toplamSayfa(k);
    if(sr < 5*60000 || sy <= 0) return null;
    return Math.round(sy / (sr / 3600000) * 10) / 10;
  }
  /* Tüm kitaplardan genel hız — yeni kitapta tahmin için */
  function genelHiz(){
    let sr = 0, sy = 0;
    (veri.kitaplar||[]).forEach(k => { sr += toplamSure(k); sy += toplamSayfa(k); });
    if(sr < 20*60000 || sy <= 0) return null;
    return Math.round(sy / (sr / 3600000) * 10) / 10;
  }

  /* ---------- seri & günlük dakika ---------- */
  function gunlukDakikalar(){
    const harita = {};
    (veri.kitaplar||[]).forEach(k => (k.oturumlar||[]).forEach(o => {
      if(o.sup || !o.b || !o.s) return;
      const g = gunStr(o.b);
      harita[g] = (harita[g]||0) + o.s;
    }));
    return harita;
  }
  function seriHesapla(harita){
    let seri = 0;
    const d = new Date();
    // bugün okumadıysa seri dünden başlar (gün henüz bitmedi, cezalandırma yok)
    if(!harita[gunStr(d.getTime())]) d.setDate(d.getDate() - 1);
    while(harita[gunStr(d.getTime())]){ seri++; d.setDate(d.getDate() - 1); }
    return seri;
  }
  function enUzunSeri(harita){
    const gunler = Object.keys(harita).sort();
    let en = 0, akt = 0, onceki = null;
    for(const g of gunler){
      if(onceki){
        const fark = Math.round((new Date(g) - new Date(onceki)) / 86400000);
        akt = fark === 1 ? akt + 1 : 1;
      }else akt = 1;
      if(akt > en) en = akt;
      onceki = g;
    }
    return en;
  }

  /* ---------- durum değişiminde oturumu kapat ----------
     Çekirdeğin durum eylemleri (bitir / yarım bırak / okunacağa al / yeniden oku)
     bu kitaptaki açık oturumu ele alsın diye: kaydet=true geçen süreyi GERÇEK
     oturum olarak yazar (okuma yaşandı, atılmaz); kaydet=false kaydetmeden atar
     (geri alma "bu okuma sayılmasın" jestidir). guncelSayfa/gsG'ye DOKUNMAZ —
     sayfanın sahibi çağıran durum eylemidir; depoKaydet de çağıranda kalır. */
  function durumKapat(kitapId, kaydet){
    const o = acikOturum();
    if(!o || o.kitapId !== kitapId) return false;
    if(kaydet){
      const k = (veri.kitaplar||[]).find(x => x.id === kitapId);
      if(k) oturumEkle(k, { b: o.b, s: Date.now() - o.b, sa: o.sa,
        sb: Math.max(o.sa, k.guncelSayfa || 0) });
    }
    oturumYaz(null);
    sayacDurdur();
    return true;
  }

  /* ---------- unutulan oturumu kapat ---------- */
  function unutulanKontrol(){
    const o = acikOturum();
    if(!o) return;
    if(Date.now() - o.b > UNUTMA_SINIRI){
      const k = (veri.kitaplar||[]).find(x => x.id === o.kitapId);
      if(k){
        oturumEkle(k, { b:o.b, s: UNUTMA_SINIRI, sa:o.sa, sb:o.sa, sup:true });
        if(typeof depoKaydet === 'function') depoKaydet();
      }
      oturumYaz(null);
      bildir('Açık kalan okuma oturumu kapatıldı — istatistiğe katılmadı');
    }
  }

  /* ---------- arayüz: detay sayfasına şerit ---------- */
  function detayGuncelle(){
    const kap = document.getElementById('detayIcerik');
    if(!kap || !document.getElementById('ortuDetay').classList.contains('acik')) return;
    if(typeof durum !== 'object' || !durum.detayId) return;
    const k = (veri.kitaplar||[]).find(x => x.id === durum.detayId);
    if(!k) return;

    let blok = document.getElementById('oturumBlok');
    if(!blok){
      blok = document.createElement('div');
      blok.className = 'detay-satir'; blok.id = 'oturumBlok';
      const hedefEl = kap.querySelector('.detay-satir') || kap.lastElementChild;
      kap.insertBefore(blok, hedefEl);
    }
    const o = acikOturum();
    const bende = o && o.kitapId === k.id;
    /* Oturum açıkken çekirdeğin "Neredesin?" kutusunu gizle: aynı panelde iki ayrı
       sayfa girişi kalıyordu. Oturum kutusu daha zengin (bitirince süreyi de yazar),
       o yüzden sahne onun. Oturum kapanınca çekirdek kutusu kendiliğinden geri gelir. */
    const cekirdekKutu = kap.querySelector('#dIlerlemeKutu');
    if(cekirdekKutu) cekirdekKutu.style.display = bende ? 'none' : '';
    // v46: açık kalmış sayfa-giriş satırı da kapanır (çifte giriş engeli aynen)
    const sayfaSatir = kap.querySelector('#dSayfaSatir');
    if(sayfaSatir && bende) sayfaSatir.hidden = true;
    const sr = toplamSure(k), hz = hizSayfaSaat(k);
    /* v46: özet kutu değil SESSİZ satır — yığılma diyeti (metinler aynen) */
    const ozet = sr > 0
      ? '<div class="d-oturum-ozet">Bu kitapla geçirdiğin süre: <b>' + sureMetni(sr) + '</b>'
        + (hz ? ' · Okuma hızın: <b>' + hz + ' sayfa/saat</b>' : '')
        + ((hz && k.sayfa && k.guncelSayfa < k.sayfa)
            ? ' · Kalan ' + (k.sayfa - k.guncelSayfa) + ' sayfa ≈ <b>'
              + sureMetni((k.sayfa - k.guncelSayfa) / hz * 3600000) + '</b>' : '')
        + '</div>'
      : '';

    /* v46 D2: KAPALIYKEN ana yüzeyde tam genişlik düğme YOK — kicker satırı +
       sağda ghost "Süre tut" bağlantısı (etiket bölümündeki "+ Etiket" deseni).
       AÇIKKEN sayaç + sayfa girişi + Bitir (tek görünür pirinç, çekirdek kutusu
       gizli — g19) + İptal sessiz bağlantı. */
    if(bende){
      const gecen = Date.now() - o.b;
      blok.innerHTML =
        '<div class="d-bolum-bas" style="margin-bottom:6px"><span class="kicker">Okuma oturumu</span></div>'
        + '<div class="d-oturum-canli">Okuyorsun — <b id="oturumSayac">'
        + sureMetni(gecen) + '</b> (başlangıç sayfası: ' + (o.sa||0) + ')</div>'
        + '<div class="ilerleme-guncelle" style="margin-top:10px">'
        + '<input type="number" inputmode="numeric" min="0" ' + (k.sayfa ? 'max="'+k.sayfa+'"' : '')
        + ' id="oturumSayfa" value="' + (k.guncelSayfa||o.sa||0) + '">'
        + '<span>' + (k.sayfa ? '/ ' + k.sayfa + ' sayfada kaldım' : 'sayfada kaldım') + '</span>'
        + '<button class="btn btn-brass btn-kucuk" data-act="oturum-bitir">Bitir</button>'
        + '</div>'
        + '<button class="d-sessiz" data-act="oturum-iptal">Oturumu iptal et</button>'
        + ozet;
      sayacBaslat();
    }else{
      const baskaKitap = o && o.kitapId !== k.id;
      blok.innerHTML =
        '<div class="d-bolum-bas" style="margin-bottom:6px"><span class="kicker">Okuma oturumu</span>'
        + (baskaKitap ? '' : '<button class="d-ghost" data-act="oturum-basla">'
            + (window.ikon?window.ikon('oynat'):'') + ' Süre tut</button>')
        + '</div>'
        + (baskaKitap
            ? '<div class="d-oturum-ozet">Başka bir kitapta açık oturum var. Önce onu bitir.</div>'
            : '')
        + ozet;
      sayacDurdur();
    }
  }
  function sayacBaslat(){
    sayacDurdur();
    tikZaman = setInterval(() => {
      const o = acikOturum(), el = document.getElementById('oturumSayac');
      if(!o || !el){ sayacDurdur(); return; }
      el.textContent = sureMetni(Date.now() - o.b);
    }, 30000);
  }
  function sayacDurdur(){ if(tikZaman){ clearInterval(tikZaman); tikZaman = null; } }

  /* ---------- istatistik bölümü ---------- */
  function istatistikEkle(){
    const kap = document.getElementById('istIcerik');
    if(!kap || document.getElementById('oturumIst')) return;
    const harita = gunlukDakikalar();
    const gunSayisi = Object.keys(harita).length;
    if(!gunSayisi) return;

    const toplamMs = Object.values(harita).reduce((a,b) => a+b, 0);
    const seri = seriHesapla(harita), enUzun = enUzunSeri(harita);
    const hz = genelHiz();
    const ortDk = Math.round(toplamMs / gunSayisi / 60000);

    /* Son 30 gün ısı şeridi — v54 Ciltli: yarıçap yok, OKUNMAYAN gün dolgusuz
       kalır (çekirdeğin "sıfır satırı sessizleşir" kararıyla aynı: boş kutuyu
       gri dolguyla çizmek 30 hücrelik gürültü üretiyordu, kıl payı çizgi yeter). */
    const kutular = [];
    const enBuyuk = Math.max(...Object.values(harita));
    for(let i = 29; i >= 0; i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const g = gunStr(d.getTime()), v = harita[g] || 0;
      const yogun = v ? Math.max(0.25, v / enBuyuk) : 0;
      kutular.push('<div title="' + g + (v ? ' · ' + sureMetni(v) : '') + '" style="flex:1;height:26px;'
        + (v ? 'background:var(--brass);opacity:' + yogun.toFixed(2)
             : 'background:transparent;border-bottom:1px solid var(--cizgi)') + '"></div>');
    }

    /* Başlık "Okuma alışkanlığı" DEĞİL "Süreklilik": v54'te bölümün kicker'ı
       zaten "Okuma alışkanlığı" diyor, aynı ad iki kez görünüyordu. İçerik
       (seri, ortalama dakika, hız, ısı şeridi) birebir korundu. */
    const blok = document.createElement('div');
    blok.className = 'is-blok'; blok.id = 'oturumIst';
    blok.innerHTML = '<div class="ist-bolum-baslik">Süreklilik</div>'
      + '<div class="is-toplam" style="margin-top:10px">'
      + '<div class="is-hucre"><span class="ist-sayi">' + seri + '</span><span class="ist-etiket">gün üst üste</span></div>'
      + '<div class="is-hucre"><span class="ist-sayi">' + ortDk + '</span><span class="ist-etiket">okuduğun günlerde ort. dakika</span></div>'
      + '</div>'
      + '<div class="mini-not">Toplam <b>' + sureMetni(toplamMs) + '</b> okuma, ' + gunSayisi + ' ayrı günde.'
      + (hz ? ' Genel hızın <b>' + hz + ' sayfa/saat</b>.' : '')
      + (enUzun > seri ? ' En uzun serin ' + enUzun + ' gün.' : '') + '</div>'
      + '<div style="display:flex;gap:2px;margin-top:12px;align-items:flex-end">' + kutular.join('') + '</div>'
      + '<div style="font-size:.7rem;color:var(--muted2);margin-top:5px">son 30 gün</div>';
    // v54: kendi yuvasına girer (ekran sonuna değil, "Okuma alışkanlığı" bölümüne)
    const yuva = document.getElementById('istYuvaSureklilik');
    if(yuva) yuva.appendChild(blok);
    else kap.appendChild(blok);
    if(typeof istBolumTemizle === 'function') istBolumTemizle();
  }

  /* ---------- olaylar ---------- */
  function baslat(){
    unutulanKontrol();

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      const act = el.dataset.act;

      if(act === 'oturum-basla'){
        const k = (veri.kitaplar||[]).find(x => x.id === durum.detayId);
        if(!k) return;
        if(acikOturum()){ bildir('Zaten açık bir oturum var'); return; }
        oturumYaz({ kitapId: k.id, b: Date.now(), sa: k.guncelSayfa || 0 });
        if(k.durum === 'okunacak' || k.durum === 'yarim'){
          k.durum = 'okunuyor';
          k.baslamaTarihi = k.baslamaTarihi || (typeof bugun === 'function' ? bugun() : null);
          depoKaydet();
          if(typeof hepsiniCiz === 'function') hepsiniCiz();
          if(typeof detayAc === 'function') detayAc(k.id);
        }
        detayGuncelle();
        bildir('Süre başladı — iyi okumalar');
        return;
      }
      if(act === 'oturum-bitir'){
        const o = acikOturum();
        const k = o && (veri.kitaplar||[]).find(x => x.id === o.kitapId);
        if(!o || !k) return;
        const alan = document.getElementById('oturumSayfa');
        const yeniSayfa = alan ? (parseInt(alan.value) || 0) : (k.guncelSayfa||0);
        const sb = k.sayfa ? Math.min(yeniSayfa, k.sayfa) : yeniSayfa;
        const sure = Date.now() - o.b;
        oturumEkle(k, { b:o.b, s:sure, sa:o.sa, sb: Math.max(o.sa, sb) });
        if(sb > (k.guncelSayfa||0)){ k.guncelSayfa = sb; k.gsG = Date.now(); } // kullanıcı ilerlemesi (senkron gsG)
        oturumYaz(null);
        depoKaydet();
        if(typeof hepsiniCiz === 'function') hepsiniCiz();
        if(typeof detayAc === 'function') detayAc(k.id);
        const okunan = Math.max(0, sb - o.sa);
        bildir(sureMetni(sure) + ' okudun' + (okunan ? ', ' + okunan + ' sayfa' : ''));
        return;
      }
      if(act === 'oturum-iptal'){
        if(confirm('Bu oturum kaydedilmeden iptal edilsin mi?')){
          oturumYaz(null); detayGuncelle(); bildir('Oturum iptal edildi');
        }
        return;
      }
      // detay/sekme etkileşimlerinden sonra şeridi tazele
      if(['detay','duzenle','bitir','baslat','ilerleme-kaydet','not-ekle','not-sil',
          'alinti-git',   // odunc-ver/odunc-al v40'ta söküldü (ödünç UI yok)
          'yarim-birak','okunacak-al','yeniden-oku','d-puan','d-puan-sil'].indexOf(act) >= 0){
        setTimeout(detayGuncelle, 0);
      }
      if(act === 'sekme' && el.dataset.v === 'ist') setTimeout(istatistikEkle, 0);
      if(act === 'detay-kapat') sayacDurdur();
    });

    // istatistik sekmesi zaten açıksa
    setTimeout(istatistikEkle, 0);
    // hedef kaydedilince istatistik yeniden çizilir; şeridimizi geri koy
    const gozlem = new MutationObserver(() => {
      if(document.getElementById('panel-ist').classList.contains('active')
         && !document.getElementById('oturumIst')) istatistikEkle();
    });
    const ist = document.getElementById('istIcerik');
    if(ist) gozlem.observe(ist, { childList:true });
  }

  if(document.getElementById('detayIcerik')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__oturum = { acikOturum, oturumYaz, sureMetni, hizSayfaSaat, genelHiz,
    gunlukDakikalar, seriHesapla, enUzunSeri, toplamSure, toplamSayfa, detayGuncelle,
    istatistikEkle, unutulanKontrol, durumKapat, UNUTMA_SINIRI };
})();
