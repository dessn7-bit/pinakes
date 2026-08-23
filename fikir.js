/* Kitaplik -- fikir defteri eklentisi */
'use strict';
(function(){
  var T = {
    tumFikirler: 'T\u00fcm fikirler',
    fikirEkle: 'Fikir etiketi ekle\u2026',
    ekle: 'Ekle',
    bosluk: 'Hen\u00fcz fikir etiketi yok. Bir al\u0131nt\u0131ya etiket ekle, ayn\u0131 fikri farkl\u0131 kitaplarda izle.',
    eklendi: 'Fikir eklendi: ',
    silindi: 'Fikir etiketi kald\u0131r\u0131ld\u0131',
    kitapta: ' kitapta',
    kayit: ' kay\u0131t',
    fikirBasligi: 'Fikir: '
  };

  /* Yerel esc() KALDIRILDI: cekirdegin global esc()'i birebir ayni
     donusumu yapiyor (ayni regex + ayni harita; "s == null ? '' : s" ile
     "s ?? ''" esdeger). fikir.js index.html'deki cekirdek script'ten SONRA
     yuklendigi icin esc() her zaman tanimli. */
  function bildir(m){ if(typeof toast === 'function') toast(m); }
  /* Etiket silme KARARI: onay yerine GERİ ALMA.
     Onay her silmede friksiyon yaratır (etiket düzenlemek sık yapılan iş);
     geri alma akışı bozmaz ve kaybı tamamen kurtarır. Dokunma hedefi de
     ~12px'ten ~42px'e çıktığı için kazara silme zaten seyrekleşti. */
  function geriAlSun(mesaj, geriAl){
    bildir(mesaj + ' — geri almak için dokun');
    var t = document.getElementById('toast');
    if(!t){ return; }
    var temizle = function(){
      t.style.pointerEvents = ''; t.style.cursor = '';
      t.removeEventListener('click', tik);
    };
    var tik = function(){ temizle(); geriAl(); };
    t.style.pointerEvents = 'auto'; t.style.cursor = 'pointer';
    t.addEventListener('click', tik);
    setTimeout(temizle, 2400);
  }
  function normEtiket(s){
    return String(s || '').trim().replace(/^#/, '').replace(/\s+/g, ' ').slice(0, 40);
  }

  var secili = '';

  function tumNotlar(){
    var cikti = [];
    (veri.kitaplar || []).forEach(function(k){
      (k.notlar || []).forEach(function(n){ cikti.push({ n: n, k: k }); });
    });
    return cikti;
  }
  /* Not kimlikle bulunur. Metin eşleştirme KULLANILMAZ: birebir aynı metinli iki
     alıntıda (aynı cümleyi iki kitaptan kaydetmek olağan) etiket yanlış nota gidiyordu.
     Çekirdek her not kartına data-nid + data-kid basar. */
  function notBul(id, kitapId){
    if(kitapId){
      var k = (veri.kitaplar || []).filter(function(x){ return x.id === kitapId; })[0];
      if(k){
        var n = (k.notlar || []).filter(function(x){ return x.id === id; })[0];
        if(n) return { n: n, k: k };
      }
    }
    var hepsi = tumNotlar();
    for(var i = 0; i < hepsi.length; i++) if(hepsi[i].n.id === id) return hepsi[i];
    return null;
  }
  function kartKimlik(kart){
    return { nid: kart.dataset.nid || '', kid: kart.dataset.kid || '' };
  }
  function fikirSayimlari(){
    var say = {};
    tumNotlar().forEach(function(x){
      (x.n.fikir || []).forEach(function(e){
        if(!say[e]) say[e] = { kayit: 0, kitaplar: {} };
        say[e].kayit++; say[e].kitaplar[x.k.id] = 1;
      });
    });
    return say;
  }
  function fikirEkleNota(notId, etiket, kitapId){
    var b = notBul(notId, kitapId);
    if(!b) return false;
    var e = normEtiket(etiket);
    if(!e) return false;
    b.n.fikir = Array.isArray(b.n.fikir) ? b.n.fikir : [];
    // Etikette YALNIZ i-ailesi katlanır (iKatla): "saç" ile "sac" ayrı etiketlerdir,
    // sessizce birleştirmek kullanıcının ayrımını yok ederdi.
    var iKat = function(s){ return (typeof iKatla === 'function') ? iKatla(s)
      : String(s == null ? '' : s).toLocaleLowerCase('tr'); };
    var varMi = b.n.fikir.some(function(x){ return iKat(x) === iKat(e); });
    // ng: kasıtlı not düzenlemesi — senkron not birleşiminde bu kopya yeni sayılır
    if(!varMi){ b.n.fikir.push(e); b.n.ng = Date.now(); }
    if(typeof depoKaydet === 'function') depoKaydet();
    return !varMi;
  }
  function fikirSilNottan(notId, etiket, kitapId){
    var b = notBul(notId, kitapId);
    if(!b || !Array.isArray(b.n.fikir)) return;
    var once = b.n.fikir.length;
    b.n.fikir = b.n.fikir.filter(function(x){ return x !== etiket; });
    if(b.n.fikir.length !== once) b.n.ng = Date.now();   // kasıtlı düzenleme damgası
    if(typeof depoKaydet === 'function') depoKaydet();
  }

  function bulutCiz(){
    var kap = document.getElementById('alintiIcerik');
    if(!kap) return;
    var eski = document.getElementById('fikirBulut');
    if(eski) eski.remove();

    var say = fikirSayimlari();
    var etiketler = Object.keys(say).sort(function(a, b){
      return say[b].kayit - say[a].kayit || a.localeCompare(b, 'tr');
    });

    var blok = document.createElement('div');
    blok.id = 'fikirBulut';
    blok.style.margin = '2px 0 4px';
    if(!etiketler.length){
      blok.innerHTML = '<div style="font-size:.8rem;color:var(--muted2);line-height:1.5">' + T.bosluk + '</div>';
    }else{
      var parcalar = ['<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px">'];
      parcalar.push('<button class="mini-chip' + (secili ? '' : ' secili') +
        '" data-act="fikir-filtre" data-v="" style="flex:0 0 auto">' + T.tumFikirler + '</button>');
      etiketler.forEach(function(e){
        var kitapSayi = Object.keys(say[e].kitaplar).length;
        parcalar.push('<button class="mini-chip' + (secili === e ? ' secili' : '') +
          '" data-act="fikir-filtre" data-v="' + esc(e) + '" style="flex:0 0 auto">#' + esc(e) +
          ' <span style="opacity:.7">' + say[e].kayit + (kitapSayi > 1 ? '/' + kitapSayi + '\u25a0' : '') +
          '</span></button>');
      });
      parcalar.push('</div>');
      blok.innerHTML = parcalar.join('');
    }
    /* v55: konum artık YUVA ile sabit ("Fikirler" bölümü). Eski yol arama
       girdisinden önceye sokuyordu — kırılgandı ve bölüm başlığı yoktu.
       Yuva yoksa eski davranışa düşer (bayat kabuk emniyeti). */
    var yuva = document.getElementById('alYuvaFikir');
    if(yuva){ yuva.appendChild(blok); }
    else {
      var arama = document.getElementById('alintiArama');
      if(arama) kap.insertBefore(blok, arama);
      else kap.appendChild(blok);
    }
    if(typeof alBolumTemizle === 'function') alBolumTemizle();
  }

  function kartlariZenginlestir(){
    zenginlestir(document.getElementById('alintiIcerik'));
  }
  /* Hem Al\u0131nt\u0131lar sekmesi hem kitap detay\u0131 i\u00e7in tek yol: kart kimli\u011finden git. */
  function zenginlestir(kap){
    if(!kap) return;
    Array.prototype.forEach.call(kap.querySelectorAll('.not-kart'), function(kart){
      if(kart.dataset.fikirHazir === '1') return;
      var kim = kartKimlik(kart);
      if(!kim.nid) return;
      var b = notBul(kim.nid, kim.kid);
      if(!b) return;
      kart.dataset.fikirHazir = '1';

      var alt = document.createElement('div');
      alt.style.marginTop = '8px';
      alt.innerHTML = etiketSatiri(b.n, kim.kid || b.k.id) +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<input class="fikir-giris" data-nid="' + esc(kim.nid) + '" placeholder="' + T.fikirEkle +
            '" autocomplete="off" style="flex:1;font-size:.85rem;padding:8px 10px">' +
          '<button class="mini-chip" data-act="fikir-ekle" data-nid="' + esc(kim.nid) +
            '" data-kid="' + esc(kim.kid || b.k.id) + '">' + T.ekle + '</button>' +
        '</div>';
      kart.appendChild(alt);
    });
  }
  function etiketSatiri(n, kitapId){
    var et = n.fikir || [];
    if(!et.length) return '';
    return '<div style="display:flex;flex-wrap:wrap;gap:5px">' + et.map(function(e){
      return '<span class="mini-chip" style="padding:3px 10px;font-size:.75rem">#' + esc(e) +
        ' <button data-act="fikir-sil" data-nid="' + esc(n.id) + '" data-kid="' + esc(kitapId || '') +
        '" data-v="' + esc(e) +
        '" style="color:var(--muted2);margin-left:2px">\u00d7</button></span>';
    }).join('') + '</div>';
  }

  function filtreUygula(){
    var kap = document.getElementById('alintiIcerik');
    if(!kap) return;
    var eskiBaslik0 = document.getElementById('fikirBaslik');
    if(eskiBaslik0) eskiBaslik0.remove();
    if(!secili){
      Array.prototype.forEach.call(kap.querySelectorAll('.not-kart'), function(kart){
        kart.style.display = '';
      });
      return;
    }
    var kartlar = kap.querySelectorAll('.not-kart');
    var gorunen = 0;
    Array.prototype.forEach.call(kartlar, function(kart){
      var kim = kartKimlik(kart);
      var b = kim.nid ? notBul(kim.nid, kim.kid) : null;
      var uygun = b && (b.n.fikir || []).indexOf(secili) >= 0;
      kart.style.display = uygun ? '' : 'none';
      if(uygun) gorunen++;
    });
    var say = fikirSayimlari()[secili];
    var kitapSayi = say ? Object.keys(say.kitaplar).length : 0;
    var h = document.createElement('div');
    h.id = 'fikirBaslik';
    h.style.cssText = 'font-size:.85rem;color:var(--muted);margin:6px 0 2px';
    h.innerHTML = '<b style="color:var(--brass)">' + T.fikirBasligi + '#' + esc(secili) + '</b> \u2014 ' +
      gorunen + T.kayit + ', ' + kitapSayi + T.kitapta;
    /* v55: bulut artık #alYuvaFikir'in içinde — referans düğümün ebeveyni
       kap OLMAYABİLİR. Başlık bulutun KENDİ ebeveynine, hemen ardına girer;
       bu hem yuvalı hem yuvasız (bayat kabuk) düzende çalışır. */
    var bulut = document.getElementById('fikirBulut');
    if(bulut && bulut.parentNode) bulut.parentNode.insertBefore(h, bulut.nextSibling);
  }

  function tazele(){
    if(!document.getElementById('panel-alinti') ||
       !document.getElementById('panel-alinti').classList.contains('active')) return;
    bulutCiz(); kartlariZenginlestir(); filtreUygula();
  }

  function detayZenginlestir(){
    zenginlestir(document.getElementById('detayIcerik'));
  }

  function baslat(){
    document.addEventListener('click', function(e){
      var el = e.target.closest('[data-act]');
      if(!el) return;
      var act = el.dataset.act;

      if(act === 'fikir-filtre'){
        secili = el.dataset.v || '';
        tazele();
        return;
      }
      if(act === 'fikir-ekle'){
        var nid = el.dataset.nid;
        // Giriş kutusunu AYNI kart içinde ara: detay ve Alıntılar sekmesi aynı anda
        // DOM'da olabildiği için belge geneli seçici yanlış kutuyu bulabiliyordu.
        var kart = el.closest('.not-kart');
        var giris = (kart && kart.querySelector('.fikir-giris'))
          || document.querySelector('.fikir-giris[data-nid="' + nid + '"]');
        if(!giris) return;
        var deger = giris.value;
        if(!normEtiket(deger)){ return; }
        var yeni = fikirEkleNota(nid, deger, el.dataset.kid);
        giris.value = '';
        bildir(yeni ? T.eklendi + '#' + normEtiket(deger) : '#' + normEtiket(deger));
        yenidenCiz();
        return;
      }
      if(act === 'fikir-sil'){
        var silNid = el.dataset.nid, silKid = el.dataset.kid, silEtiket = el.dataset.v;
        fikirSilNottan(silNid, silEtiket, silKid);
        geriAlSun(T.silindi, function(){
          fikirEkleNota(silNid, silEtiket, silKid);
          bildir('Geri alındı: #' + silEtiket);
          yenidenCiz();
        });
        yenidenCiz();
        return;
      }
      if(act === 'sekme' && el.dataset.v === 'alinti') setTimeout(tazele, 0);
      if(act === 'detay' || act === 'not-ekle' || act === 'not-sil' || act === 'alinti-git')
        setTimeout(detayZenginlestir, 0);
    });

    document.addEventListener('keydown', function(e){
      if(e.key !== 'Enter') return;
      var t = e.target;
      if(!t || !t.classList || !t.classList.contains('fikir-giris')) return;
      e.preventDefault();
      var nid = t.dataset.nid;
      if(!normEtiket(t.value)) return;
      var kartE = t.closest('.not-kart');
      var yeni = fikirEkleNota(nid, t.value, kartE ? kartE.dataset.kid : '');
      var etiket = normEtiket(t.value);
      t.value = '';
      bildir(yeni ? T.eklendi + '#' + etiket : '#' + etiket);
      yenidenCiz();
    });

    function yenidenCiz(){
      if(typeof alintiCiz === 'function' &&
         document.getElementById('panel-alinti').classList.contains('active')){
        alintiCiz(); setTimeout(tazele, 0);
      }else{
        setTimeout(detayZenginlestir, 0);
      }
    }

    var hedef = document.getElementById('alintiIcerik');
    if(hedef && window.MutationObserver){
      new MutationObserver(function(){
        if(document.getElementById('panel-alinti').classList.contains('active') &&
           !document.getElementById('fikirBulut')) setTimeout(tazele, 0);
      }).observe(hedef, { childList: true });
    }
    setTimeout(tazele, 0);
  }

  if(document.getElementById('alintiIcerik')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__fikir = { fikirSayimlari: fikirSayimlari, fikirEkleNota: fikirEkleNota,
    fikirSilNottan: fikirSilNottan, normEtiket: normEtiket, tazele: tazele,
    detayZenginlestir: detayZenginlestir, secilenAl: function(){ return secili; },
    secilenYaz: function(v){ secili = v; } };
})();
