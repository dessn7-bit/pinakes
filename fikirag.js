/* Kitaplık — fikir ağı eklentisi
   Fikir etiketlerinin BİRLİKTE geçişini görünür kılar: komşular, kesişim, harita, öneri.
   fikir.js'i bozmaz; seçili etiketi onun genel API'sinden (window.__fikir) okur/yazar.
   AD ALANI: tüm sınıflar ve data-act değerleri "fa-" önekli, id'ler "fa" önekli.
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  const ESIK = 2;                 // bir çiftin GÖSTERİLMESİ için en az 2 notta birlikte geçmesi
  const ONERI_MIN_ETIKET = 5;     // bu kadar farklı fikir yoksa öneri bölümü hiç görünmez
  const ONERI_ADET = 3;
  let sirala = 'not';             // not | kitap | baglanti
  let kesisim = null;             // açık kesişim görünümündeki komşu etiket

  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function kitaplar(){ return (typeof veri === 'object' && veri && Array.isArray(veri.kitaplar)) ? veri.kitaplar : []; }
  function seciliFikir(){
    try{ return (window.__fikir && window.__fikir.secilenAl()) || ''; }catch(e){ return ''; }
  }
  /* Not başına etiket kümesi — tüm hesapların ortak girdisi */
  function notKayitlari(){
    const c = [];
    kitaplar().forEach(k => (k.notlar || []).forEach(n => {
      const et = (n.fikir || []).filter(Boolean);
      if(et.length) c.push({ n, k, et: [...new Set(et)] });
    }));
    return c;
  }

  /* ---------- M1: eş-geçim ----------
     BİRİNCİL ÖLÇÜT: aynı NOTTA birlikte geçmek. Kaan iki fikri bilerek aynı alıntıya
     yazdıysa bu onun kurduğu bir bağdır — güçlü sinyal. Aynı KİTAPTA ayrı notlarda
     geçmek ise yalnızca "yan yana düşmüş" olabilir; ikincil ölçüt olarak taşınır. */
  function esGecim(){
    const cift = new Map();
    notKayitlari().forEach(({ n, k, et }) => {
      for(let i = 0; i < et.length; i++) for(let j = i + 1; j < et.length; j++){
        const [a, b] = [et[i], et[j]].sort((x, y) => x.localeCompare(y, 'tr'));
        const anahtar = JSON.stringify([a, b]);   // ayrac YOK: cift anahtari kanonik JSON
        if(!cift.has(anahtar)) cift.set(anahtar, { a, b, notlar: 0, kitaplar: new Set(), kitapAyri: new Set() });
        const c = cift.get(anahtar);
        c.notlar++; c.kitaplar.add(k.id);
      }
    });
    // ikincil: aynı kitapta (ayrı notlarda) birlikte geçenler
    const kitapEtiket = new Map();
    notKayitlari().forEach(({ k, et }) => {
      if(!kitapEtiket.has(k.id)) kitapEtiket.set(k.id, new Set());
      et.forEach(e => kitapEtiket.get(k.id).add(e));
    });
    kitapEtiket.forEach((kume, kid) => {
      const liste = [...kume];
      for(let i = 0; i < liste.length; i++) for(let j = i + 1; j < liste.length; j++){
        const [a, b] = [liste[i], liste[j]].sort((x, y) => x.localeCompare(y, 'tr'));
        const anahtar = JSON.stringify([a, b]);   // ayrac YOK: cift anahtari kanonik JSON
        if(!cift.has(anahtar)) cift.set(anahtar, { a, b, notlar: 0, kitaplar: new Set(), kitapAyri: new Set() });
        cift.get(anahtar).kitapAyri.add(kid);
      }
    });
    return [...cift.values()].map(c => ({
      a: c.a, b: c.b, notlar: c.notlar,
      kitapSayisi: c.kitaplar.size, kitaptaBirlikte: c.kitapAyri.size
    })).sort((x, y) => y.notlar - x.notlar || y.kitapSayisi - x.kitapSayisi);
  }

  function etiketOzet(){
    const harita = new Map();
    notKayitlari().forEach(({ k, et }) => et.forEach(e => {
      if(!harita.has(e)) harita.set(e, { ad: e, notSayisi: 0, kitaplar: new Set() });
      const o = harita.get(e);
      o.notSayisi++; o.kitaplar.add(k.id);
    }));
    // bağlantı sayısı: en az BİR notta birlikte geçtiği farklı fikir sayısı (ham bağ)
    const komsuSay = new Map();
    esGecim().filter(c => c.notlar > 0).forEach(c => {
      komsuSay.set(c.a, (komsuSay.get(c.a) || 0) + 1);
      komsuSay.set(c.b, (komsuSay.get(c.b) || 0) + 1);
    });
    return [...harita.values()].map(o => ({
      ad: o.ad, notSayisi: o.notSayisi, kitapSayisi: o.kitaplar.size,
      komsuSayisi: komsuSay.get(o.ad) || 0
    }));
  }

  function komsular(etiket){
    if(!etiket) return [];
    return esGecim().filter(c => (c.a === etiket || c.b === etiket) && c.notlar >= ESIK)
      .map(c => ({ ad: c.a === etiket ? c.b : c.a, notlar: c.notlar,
        kitapSayisi: c.kitapSayisi, kitaptaBirlikte: c.kitaptaBirlikte }));
  }
  /* Kesişim açıkken alttaki not listesini de İKİ etiketi birden taşıyanlara indir.
     fikir.js'in filtresine dokunmaz: kapanışta onun tazele()'si eski görünümü geri kurar. */
  function altListeyiSuz(etiket){
    const kap = document.getElementById('alintiIcerik');
    if(!kap || !kesisim || !etiket) return;
    const uygunlar = new Set(kesisimNotlari(etiket, kesisim).map(n => n.nid));
    kap.querySelectorAll('.not-kart').forEach(kart => {
      const nid = kart.dataset.nid;
      if(!nid) return;
      kart.style.display = uygunlar.has(nid) ? '' : 'none';
    });
  }
  function kesisimNotlari(a, b){
    return notKayitlari().filter(({ et }) => et.indexOf(a) >= 0 && et.indexOf(b) >= 0)
      .map(({ n, k }) => ({ nid: n.id, metin: n.metin, sayfa: n.sayfa || null,
        tip: n.tip, kitapAd: k.ad, kitapId: k.id }));
  }

  /* ---------- M4: ilişki önerisi ----------
     Seçili fikrin geçtiği KİTAPLARDA görünen, ama onunla HİÇ aynı notta
     etiketlenmemiş fikirler. İddia değil öneri: "belki bağlantılı". */
  function oneriler(etiket){
    if(!etiket) return [];
    const kayitlar = notKayitlari();
    const tumEtiket = new Set();
    kayitlar.forEach(({ et }) => et.forEach(e => tumEtiket.add(e)));
    if(tumEtiket.size < ONERI_MIN_ETIKET) return [];
    const birlikteOlanlar = new Set();
    kayitlar.forEach(({ et }) => { if(et.indexOf(etiket) >= 0) et.forEach(e => birlikteOlanlar.add(e)); });
    const hedefKitaplar = new Set();
    kayitlar.forEach(({ k, et }) => { if(et.indexOf(etiket) >= 0) hedefKitaplar.add(k.id); });
    if(!hedefKitaplar.size) return [];
    const aday = new Map();
    kayitlar.forEach(({ k, et }) => {
      if(!hedefKitaplar.has(k.id)) return;
      et.forEach(e => {
        if(e === etiket || birlikteOlanlar.has(e)) return;   // zaten birlikte etiketlenmiş → öneri değil
        if(!aday.has(e)) aday.set(e, { ad: e, kitaplar: new Set(), notlar: 0 });
        aday.get(e).kitaplar.add(k.id); aday.get(e).notlar++;
      });
    });
    return [...aday.values()]
      .map(o => ({ ad: o.ad, ortakKitap: o.kitaplar.size, notlar: o.notlar }))
      .sort((x, y) => y.ortakKitap - x.ortakKitap || y.notlar - x.notlar || x.ad.localeCompare(y.ad, 'tr'))
      .slice(0, ONERI_ADET);
  }

  function harita(){
    const liste = etiketOzet();
    const olcut = { not: 'notSayisi', kitap: 'kitapSayisi', baglanti: 'komsuSayisi' }[sirala] || 'notSayisi';
    return liste.slice().sort((a, b) => b[olcut] - a[olcut] || a.ad.localeCompare(b.ad, 'tr'));
  }
  function enYaygin(){
    const liste = etiketOzet().filter(o => o.kitapSayisi > 1)
      .sort((a, b) => b.kitapSayisi - a.kitapSayisi || b.notSayisi - a.notSayisi);
    return liste[0] || null;
  }

  /* ---------- çizim ---------- */
  function stilEkle(){
    if(document.getElementById('faStil')) return;
    const s = document.createElement('style');
    s.id = 'faStil';
    /* v55 Ciltli: kutu/hap/dolgu dili emekli. Kartlar → bölüm içi bloklar;
       çipler kontur + %7 tint (.mini-chip reçetesi); komşu/öneri satırları
       kıl payı ayraçlı; çubuklarda ray YOK (Rakamlar ekranıyla aynı karar:
       mürekkep doğrudan kâğıt üzerinde); kesişim alıntısı altın hatlı blok. */
    s.textContent = `
      #faPanel{display:block;margin:14px 0 0}
      .fa-kart{background:transparent;border:none;border-radius:0;box-shadow:none;
        padding:0;margin-top:16px}
      #faPanel > .fa-kart:first-child{margin-top:0}
      .fa-baslik{font-family:var(--serif);font-size:1.02rem}
      .fa-not{font-size:.76rem;color:var(--muted);margin-top:8px;line-height:1.5}
      .fa-vurgu{font-size:.82rem;color:var(--brass);font-weight:600;margin-top:8px}
      .fa-sira{display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:3px;scrollbar-width:none}
      .fa-sira::-webkit-scrollbar{display:none}
      .fa-cip{flex:0 0 auto;padding:6px 12px;border-radius:var(--r-sm);border:1px solid var(--kontur);
        background:transparent;color:var(--muted);font-size:.75rem;white-space:nowrap}
      .fa-cip.fa-secili{border-color:var(--brass);color:var(--paper);font-weight:600;
        background:color-mix(in srgb,var(--brass) 7%,transparent)}
      .fa-komsu{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;
        text-align:left;padding:9px 0;margin-top:0;border:none;border-bottom:1px solid var(--cizgi);
        border-radius:0;background:transparent;font-size:.84rem;color:var(--paper)}
      .fa-komsu span{font-size:.72rem;color:var(--muted2);white-space:nowrap;font-variant-numeric:tabular-nums}
      .fa-oneri{display:flex;justify-content:space-between;gap:10px;padding:9px 0;margin-top:0;
        border:none;border-bottom:1px dashed var(--cizgi);border-radius:0;
        font-size:.82rem;color:var(--muted)}
      .fa-satir{display:flex;align-items:center;gap:8px;margin-top:8px}
      .fa-ad{flex:0 0 104px;font-size:.78rem;color:var(--paper);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fa-govde{flex:1;height:6px;background:transparent;border-radius:0;overflow:hidden}
      .fa-govde > div{height:100%;background:var(--brass);border-radius:0}
      .fa-deger{flex:0 0 74px;text-align:right;font-size:.72rem;color:var(--muted2);
        font-variant-numeric:tabular-nums}
      .fa-kesisim-not{background:transparent;border:none;border-left:1px solid var(--brass);
        border-radius:0;padding:2px 0 2px 14px;margin-top:12px}
      .fa-kesisim-metin{font-family:var(--sans);font-style:italic;font-size:.95rem;line-height:1.65;color:var(--paper)}
      .fa-kesisim-kaynak{font-size:.72rem;color:var(--muted);margin-top:6px}
      .fa-kapat{margin-top:12px;padding:2px 0;border:none;border-radius:0;background:transparent;
        color:var(--muted);font-size:.8rem;text-decoration:underline;text-underline-offset:3px;
        text-decoration-color:var(--muted2)}
    `;
    document.head.appendChild(s);
  }

  function komsuKartHtml(etiket){
    const ks = komsular(etiket);
    let h = '<div class="fa-kart" id="faKomsuKart"><div class="fa-baslik">#' + kacir(etiket)
      + ' ile birlikte geçen fikirler</div>';
    if(!ks.length){
      h += '<div class="fa-not" id="faKomsuBos">Bu fikir henüz başka bir fikirle en az '
        + ESIK + ' notta birlikte geçmedi. Aynı alıntıya iki fikir etiketi verdiğinde bağlantı burada belirir.</div>';
    }else{
      h += ks.map(k => '<button class="fa-komsu" data-act="fa-kesisim" data-v="' + kacir(k.ad) + '">'
        + '<b>#' + kacir(k.ad) + '</b><span>' + k.notlar + ' not · ' + k.kitapSayisi + ' kitap</span></button>').join('');
      h += '<div class="fa-not">Birine dokun: iki fikri birden taşıyan notları göster.</div>';
    }
    return h + '</div>';
  }
  function oneriKartHtml(etiket){
    const os = oneriler(etiket);
    if(!os.length) return '';
    return '<div class="fa-kart" id="faOneriKart"><div class="fa-baslik">Belki bağlantılı</div>'
      + '<div class="fa-not">#' + kacir(etiket) + ' ile aynı kitaplarda geçiyor ama birlikte etiketlemedin — '
      + 'bir bağ var mı, sen bilirsin.</div>'
      + os.map(o => '<div class="fa-oneri"><span>#' + kacir(o.ad) + '</span>'
        + '<span>' + o.ortakKitap + ' ortak kitap</span></div>').join('') + '</div>';
  }
  function kesisimKartHtml(etiket){
    if(!kesisim) return '';
    const notlar = kesisimNotlari(etiket, kesisim);
    const kitapSay = new Set(notlar.map(n => n.kitapId)).size;
    return '<div class="fa-kart" id="faKesisimKart">'
      + '<div class="fa-baslik">#' + kacir(etiket) + ' × #' + kacir(kesisim) + ' kesişimi</div>'
      + '<div class="fa-not">' + notlar.length + ' not, ' + kitapSay + ' kitap</div>'
      + notlar.map(n => '<div class="fa-kesisim-not">'
        + '<div class="fa-kesisim-metin">' + kacir(n.metin) + '</div>'
        + '<div class="fa-kesisim-kaynak">' + kacir(n.kitapAd)
        + (n.sayfa ? ' · sf. ' + n.sayfa : '') + '</div></div>').join('')
      + '<button class="fa-kapat" data-act="fa-kesisim-kapat">✕ Kesişimi kapat</button></div>';
  }
  function haritaKartHtml(){
    const liste = harita();
    // Boş durum mesajının tek sahibi fikir.js — mükerrer mesaj kaldırıldı (görsel dil sprinti).
    // Etiket yokken bölüm/kart hiç çizilmez: #faPanel DOM'da kalır ama içi boş bırakılır,
    // #faBos ve başlığı DOM'a girmez.
    if(!liste.length) return '';
    const olcut = { not: 'notSayisi', kitap: 'kitapSayisi', baglanti: 'komsuSayisi' }[sirala] || 'notSayisi';
    const enB = Math.max.apply(null, liste.map(o => o[olcut]).concat([1]));
    const yaygin = enYaygin();
    const cipler = [['not','En çok kullanılan'],['kitap','En çok kitaba yayılan'],['baglanti','En çok bağlantılı']]
      .map(([v, ad]) => '<button class="fa-cip' + (sirala === v ? ' fa-secili' : '') + '" data-act="fa-sirala" data-v="'
        + v + '">' + ad + '</button>').join('');
    return '<div class="fa-kart" id="faHaritaKart"><div class="fa-baslik">Fikir haritası</div>'
      + '<div class="fa-sira" id="faSiraSec">' + cipler + '</div>'
      + (yaygin ? '<div class="fa-vurgu" id="faYaygin">En çok kitaba yayılan: #' + kacir(yaygin.ad)
          + ' — ' + yaygin.kitapSayisi + ' kitap, ' + yaygin.notSayisi + ' not</div>' : '')
      + liste.map(o => '<div class="fa-satir"><button class="fa-ad" data-act="fa-sec" data-v="' + kacir(o.ad) + '">#'
        + kacir(o.ad) + '</button>'
        + '<div class="fa-govde"><div style="width:' + Math.round(o[olcut] / enB * 100) + '%"></div></div>'
        + '<div class="fa-deger">' + o.notSayisi + ' not · ' + o.kitapSayisi + ' kitap</div></div>').join('')
      + '</div>';
  }

  function ciz(){
    const kap = document.getElementById('alintiIcerik');
    if(!kap) return;
    const panelAktif = document.getElementById('panel-alinti')
      && document.getElementById('panel-alinti').classList.contains('active');
    if(!panelAktif) return;
    const eski = document.getElementById('faPanel');
    if(eski) eski.remove();
    stilEkle();
    const etiket = seciliFikir();
    const panel = document.createElement('div');
    panel.id = 'faPanel';
    panel.innerHTML = (etiket ? komsuKartHtml(etiket) + kesisimKartHtml(etiket) + oneriKartHtml(etiket) : '')
      + haritaKartHtml();
    // v55: konum YUVA ile sabit ("Fikirler" bölümü, bulutun hemen altı).
    const yuva = document.getElementById('alYuvaFikirAg');
    if(yuva){ yuva.appendChild(panel); }
    else {
      const bulut = document.getElementById('fikirBulut');
      const arama = document.getElementById('alintiArama');
      if(bulut && bulut.nextSibling) kap.insertBefore(panel, bulut.nextSibling);
      else if(arama) kap.insertBefore(panel, arama);
      else kap.appendChild(panel);
    }
    if(typeof alBolumTemizle === 'function') alBolumTemizle();
    altListeyiSuz(etiket);
  }

  function baslat(){
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      const act = el.dataset.act;
      if(act === 'fa-sirala'){ sirala = el.dataset.v; ciz(); return; }
      if(act === 'fa-kesisim'){ kesisim = el.dataset.v; ciz(); return; }
      if(act === 'fa-kesisim-kapat'){
        kesisim = null;
        try{ window.__fikir.tazele(); }catch(err){}   // fikir.js kendi filtresini geri kursun
        ciz();                                        // gecikmesiz: panel aynı tıkta kapanır
        return;
      }
      if(act === 'fa-sec'){
        kesisim = null;
        try{
          window.__fikir.secilenYaz(el.dataset.v);
          window.__fikir.tazele();
        }catch(err){ /* fikir.js API'si hazır değil — sessiz geçiş kasıtlı */ }
        setTimeout(ciz, 0);
        return;
      }
      // fikir.js'in kendi çipleri / sekme geçişi / etiket düzenleme sonrası tazele
      if(act === 'fikir-filtre'){ kesisim = null; setTimeout(ciz, 0); return; }
      if(act === 'fikir-ekle' || act === 'fikir-sil') setTimeout(ciz, 0);
      if(act === 'sekme' && el.dataset.v === 'alinti') setTimeout(ciz, 0);
    });
    const kap = document.getElementById('alintiIcerik');
    if(kap && window.MutationObserver){
      new MutationObserver(() => {
        if(!document.getElementById('faPanel')) setTimeout(ciz, 0);
      }).observe(kap, { childList: true });
    }
    setTimeout(ciz, 0);
  }

  if(document.getElementById('alintiIcerik')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__fikirag = { esGecim, etiketOzet, komsular, kesisimNotlari, oneriler, harita, enYaygin,
    ciz, siralaYaz: v => { sirala = v; }, siralaAl: () => sirala,
    kesisimAl: () => kesisim, kesisimYaz: v => { kesisim = v; },
    esikler: { ESIK, ONERI_MIN_ETIKET, ONERI_ADET } };
})();
