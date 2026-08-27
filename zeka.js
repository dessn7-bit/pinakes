/* Kitaplık — okur zekâsı eklentisi
   İstatistik sekmesine beş kart ekler: tür/yazar puan analizi, bırakma analizi,
   oturumlardan gerçek aylık sayfa, saat bazlı alışkanlık, sayfa hedefi.
   AD ALANI: tüm CSS sınıfları ve data-act değerleri "zk-" önekli, id'ler "zk" önekli —
   mevcut seçicileri gölgelememesi için (çekirdek stilleri kopyalanır, adları yenidir).
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  const TUR_ESIK = 3;     // tür ortalaması için en az 3 kitap
  const YAZAR_ESIK = 2;   // yazar için 2 (aynı yazardan 3+ okumak seyrek)
  const SAAT_ESIK = 5;    // saat dağılımı için en az 5 oturum
  const AYLAR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const DILIMLER = [
    { ad:'Gece', bas:0, bit:6, etiket:'00–06' },
    { ad:'Sabah', bas:6, bit:12, etiket:'06–12' },
    { ad:'Öğleden sonra', bas:12, bit:18, etiket:'12–18' },
    { ad:'Akşam', bas:18, bit:24, etiket:'18–24' }
  ];

  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function sureMetni(ms){
    const dk = Math.max(0, Math.round(ms / 60000));
    if(dk < 60) return dk + ' dk';
    const s = Math.floor(dk / 60), k = dk % 60;
    return k ? s + ' sa ' + k + ' dk' : s + ' sa';
  }
  function ayAnahtar(ts){
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function kitaplar(){ return (typeof veri === 'object' && veri && Array.isArray(veri.kitaplar)) ? veri.kitaplar : []; }
  /* Çekirdekle aynı bakış: yeniden okunan kitap, önceki tamamlanmış okumasıyla temsil edilir. */
  function bitmisKayitlar(){
    if(typeof istKayit === 'function') return kitaplar().map(istKayit).filter(Boolean);
    return kitaplar().filter(k => k.durum === 'bitti');
  }
  /* Unutulup otomatik kapanan oturumlar (sup:true) hiçbir analize girmez. */
  function gecerliOturumlar(){
    const c = [];
    kitaplar().forEach(k => (k.oturumlar || []).forEach(o => { if(o && !o.sup && o.b) c.push({ o, k }); }));
    return c;
  }

  /* ---------- M1: tür / yazar puan analizi ---------- */
  function grupPuan(anahtarFn, esik){
    const harita = new Map();
    bitmisKayitlar().forEach(k => {
      if(!k.puan) return;   // puansız bitmiş kitap ortalamaya KATILMAZ
      const a = anahtarFn(k);
      if(!a) return;
      if(!harita.has(a)) harita.set(a, { ad: a, adet: 0, toplam: 0 });
      const g = harita.get(a);
      g.adet++; g.toplam += k.puan;
    });
    const hepsi = [...harita.values()].map(g => ({ ad: g.ad, adet: g.adet, ort: Math.round(g.toplam / g.adet * 10) / 10 }));
    return {
      yeterli: hepsi.filter(g => g.adet >= esik).sort((a,b) => b.ort - a.ort || b.adet - a.adet),
      zayif: hepsi.filter(g => g.adet < esik).sort((a,b) => b.adet - a.adet)
    };
  }
  function turOrtalamalari(){
    /* v91: gruplama HAM tür değeriyle (istatistik sadakati), yalnız görünen ad kısalır */
    const s = grupPuan(k => (k.tur || '').trim(), TUR_ESIK);
    const g = x => ({ ...x, ad: turGoster(x.ad) });
    return { yeterli: s.yeterli.map(g), zayif: s.zayif.map(g) };
  }
  function yazarOrtalamalari(){ return grupPuan(k => (k.yazar || '').trim(), YAZAR_ESIK); }

  function barSatirlari(liste){
    const enB = Math.max.apply(null, liste.map(g => g.ort).concat([1]));
    return liste.map(g =>
      '<div class="zk-bar-satir"><div class="zk-bar-ad">' + kacir(g.ad) + '</div>'
      + '<div class="zk-bar-govde"><div style="width:' + Math.round(g.ort / enB * 100) + '%"></div></div>'
      + '<div class="zk-bar-deger">' + g.ort.toFixed(1) + '</div>'
      + '<div class="zk-bar-adet">' + g.adet + ' kitap</div></div>').join('');
  }
  function puanKartHtml(){
    const t = turOrtalamalari(), y = yazarOrtalamalari();
    if(!t.yeterli.length && !y.yeterli.length && !t.zayif.length && !y.zayif.length) return '';
    let h = '<div class="zk-blok" id="zkPuanKart"><div class="zk-baslik">Neyden keyif alıyorsun?</div>';
    if(t.yeterli.length){
      h += '<div class="zk-alt-baslik">Türlere göre ortalama puanın</div>' + barSatirlari(t.yeterli);
    }
    if(y.yeterli.length){
      h += '<div class="zk-alt-baslik" style="margin-top:14px">Yazarlara göre ortalama puanın</div>' + barSatirlari(y.yeterli);
    }
    if(!t.yeterli.length && !y.yeterli.length){
      h += '<div class="zk-not">Ortalama çıkarmak için henüz yeterli puanlı kitap yok — '
        + 'tür için ' + TUR_ESIK + ', yazar için ' + YAZAR_ESIK + ' bitmiş ve puanlanmış kitap gerekiyor.</div>';
    }
    const zayifAd = t.zayif.concat(y.zayif).slice(0, 6).map(g => kacir(g.ad) + ' (' + g.adet + ')');
    if(zayifAd.length){
      h += '<div class="zk-not" id="zkZayif">Yeterli veri yok: ' + zayifAd.join(', ')
        + '. Az örneklemde ortalama yanıltıcı olduğu için gösterilmiyor.</div>';
    }
    return h + '</div>';
  }

  /* ---------- M2: bırakma analizi ---------- */
  function birakmaAnalizi(){
    const ks = kitaplar();
    const bitti = bitmisKayitlar().length;
    const yarim = ks.filter(k => k.durum === 'yarim');
    const olculebilir = yarim.filter(k => k.sayfa > 0 && k.guncelSayfa > 0);
    const yuzdeler = olculebilir.map(k => Math.min(100, Math.round(k.guncelSayfa / k.sayfa * 100)));
    return {
      bitti, yarim: yarim.length,
      oran: (bitti + yarim.length) ? Math.round(bitti / (bitti + yarim.length) * 100) : null,
      ortNokta: yuzdeler.length ? Math.round(yuzdeler.reduce((a,b) => a+b, 0) / yuzdeler.length) : null,
      olculebilirAdet: olculebilir.length,
      liste: olculebilir.map((k, i) => ({ ad: k.ad, yuzde: yuzdeler[i] }))
        .sort((a,b) => b.yuzde - a.yuzde).slice(0, 5)
    };
  }
  function birakmaKartHtml(){
    const b = birakmaAnalizi();
    if(!b.bitti && !b.yarim) return '';
    let h = '<div class="zk-blok" id="zkBirakmaKart"><div class="zk-baslik">Bitirme ve yarım kalanlar</div>';
    if(b.oran === null){
      h += '<div class="zk-not">Henüz bitmiş ya da yarım kalmış kitap yok.</div>';
      return h + '</div>';
    }
    h += '<div class="zk-buyuk">%' + b.oran + '</div>'
      + '<div class="zk-not">Başladıklarının bitirdiğin oranı — ' + b.bitti + ' bitti, ' + b.yarim + ' yarım kaldı.</div>';
    if(!b.yarim){
      h += '<div class="zk-not">Yarım bıraktığın kitap yok.</div>';
    }else{
      if(b.ortNokta !== null){
        h += '<div class="zk-not">Yarım kalanları ortalama <b>%' + b.ortNokta + '</b> noktasında bırakmışsın'
          + ' (' + b.olculebilirAdet + ' kitaptan; sayfa bilgisi girilenler).</div>';
      }else{
        h += '<div class="zk-not">Yarım kalanlarda sayfa bilgisi olmadığı için bırakma noktası hesaplanamadı.</div>';
      }
      if(b.liste.length){
        h += '<div class="zk-alt-baslik" style="margin-top:12px">Yarım kalanlar</div>'
          + b.liste.map(x => '<div class="zk-satir"><span>' + kacir(x.ad) + '</span>'
            + '<span class="zk-vurgu">%' + x.yuzde + '</span></div>').join('');
      }
    }
    return h + '</div>';
  }

  /* ---------- M3: oturumlardan gerçek aylık sayfa ---------- */
  function aylikSayfa(){
    const harita = {};
    for(let i = 11; i >= 0; i--){
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      harita[ayAnahtar(d.getTime())] = 0;
    }
    let toplam = 0;
    gecerliOturumlar().forEach(({ o }) => {
      const ay = ayAnahtar(o.b), sayfa = Math.max(0, (o.sb || 0) - (o.sa || 0));
      if(!sayfa) return;
      if(ay in harita){ harita[ay] += sayfa; }
      toplam += sayfa;
    });
    return { harita, toplam, oturumSayisi: gecerliOturumlar().length };
  }
  function aylikKartHtml(){
    const a = aylikSayfa();
    if(!a.oturumSayisi || !a.toplam) return '';   // oturum verisi yoksa kart hiç çizilmez
    const degerler = Object.values(a.harita);
    const enB = Math.max.apply(null, degerler.concat([1]));
    const satirlar = Object.entries(a.harita).map(([ay, v]) => {
      const [yil, m] = ay.split('-');
      return '<div class="zk-bar-satir"><div class="zk-bar-ad">' + AYLAR[parseInt(m) - 1] + ' ' + yil.slice(2) + '</div>'
        + '<div class="zk-bar-govde"><div style="width:' + Math.round(v / enB * 100) + '%"></div></div>'
        + '<div class="zk-bar-deger">' + v + '</div></div>';
    }).join('');
    /* Uzun liste (12 satır) KATLI gelir — özet satırı toplamı taşır, yani
       katlama sayıyı değil yalnız dökümü gizler (çekirdeğin istKatla kararı). */
    const ic = '<div class="zk-not">Oturum kayıtlarından: sayfalar hangi ay okunduysa o aya yazılır. '
      + 'Yukarıdaki “Aylık sayfa” grafiği ise bitirdiğin kitapların hacmini bitiş ayına yazar — ikisi farklı sorulara cevap verir.</div>'
      + satirlar;
    const govde = (typeof istKatla === 'function')
      ? istKatla('zkAylikKatla', 'Fiilen okuduğun sayfa (son 12 ay)',
          'oturumlardan ' + a.toplam.toLocaleString('tr') + ' sayfa', ic)
      : '<div class="zk-baslik">Fiilen okuduğun sayfa (son 12 ay)</div>' + ic;
    return '<div class="zk-blok" id="zkAylikKart">' + govde + '</div>';
  }

  /* ---------- M4: saat bazlı alışkanlık ---------- */
  function saatDagilimi(){
    const kovalar = DILIMLER.map(d => ({ ad: d.ad, etiket: d.etiket, adet: 0, sure: 0 }));
    const hepsi = gecerliOturumlar();
    hepsi.forEach(({ o }) => {
      const saat = new Date(o.b).getHours();
      const i = DILIMLER.findIndex(d => saat >= d.bas && saat < d.bit);
      if(i < 0) return;
      kovalar[i].adet++; kovalar[i].sure += (o.s || 0);
    });
    const zirve = kovalar.slice().sort((a,b) => b.sure - a.sure || b.adet - a.adet)[0];
    /* "En çok okuduğun zaman" iddiası tek oturumluk dilimle kurulmaz (rapor.js
       enUst >=2 eşiğiyle aynı ilke); dilim <2 oturumsa cümle susar, barlar kalır. */
    return { kovalar, toplamOturum: hepsi.length, yeterli: hepsi.length >= SAAT_ESIK,
      zirve: (zirve && zirve.adet >= 2) ? zirve : null };
  }
  function saatKartHtml(){
    const s = saatDagilimi();
    if(!s.toplamOturum) return '';
    let h = '<div class="zk-blok" id="zkSaatKart"><div class="zk-baslik">Günün hangi saatinde okuyorsun?</div>';
    if(!s.yeterli){
      h += '<div class="zk-not" id="zkSaatYetersiz">Yeterli veri yok — dağılım için en az ' + SAAT_ESIK
        + ' okuma oturumu gerekiyor (şu an ' + s.toplamOturum + ').</div>';
      return h + '</div>';
    }
    const enB = Math.max.apply(null, s.kovalar.map(k => k.sure).concat([1]));
    if(s.zirve){
      h += '<div class="zk-not" id="zkSaatOzet">En çok okuduğun zaman: <b>' + kacir(s.zirve.ad)
        + ' (' + s.zirve.etiket + ')</b> — toplam ' + sureMetni(s.zirve.sure) + ', ' + s.zirve.adet + ' oturum.</div>';
    }
    h += s.kovalar.map(k =>
        '<div class="zk-bar-satir"><div class="zk-bar-ad">' + kacir(k.ad) + '</div>'
        + '<div class="zk-bar-govde"><div style="width:' + Math.round(k.sure / enB * 100) + '%"></div></div>'
        + '<div class="zk-bar-deger">' + (k.adet || '—') + '</div></div>').join('');
    return h + '</div>';
  }

  /* ---------- M5: sayfa bazlı yıllık hedef ---------- */
  /* İlerleme kaynağı: BİTİRİLEN kitapların sayfa toplamı (oturum sayfaları DEĞİL).
     Gerekçe: mevcut kitap hedefi de "bu yıl bitirdiklerim" tabanında; aynı tabanda
     olunca iki hedef karşılaştırılabilir ve projeksiyon matematiği aynı kalır.
     Oturum sayfaları yalnız kronometre kullanılan günlerde var (Goodreads geçmişinde yok),
     karıştırılsa yıllık ilerleme olduğundan çok düşük görünürdü. Oturum tabanlı bakış
     ayrı kartta (Fiilen okuduğun sayfa) duruyor. */
  function sayfaHedefDurum(){
    const yil = new Date().getFullYear();
    const hedef = ((typeof veri === 'object' && veri && veri.hedefSayfa) || {})[yil] || 0;
    const bitenler = bitmisKayitlar().filter(k => k.bitisTarihi
      && String(k.bitisTarihi).startsWith(String(yil)));
    const ilerleme = bitenler.reduce((t, k) => t + (k.sayfa || 0), 0);
    const gunNo = Math.floor((new Date() - new Date(yil, 0, 0)) / 86400000);
    return {
      yil, hedef, ilerleme,
      // payda dürüstlüğü: metin "N kitabın sayfa toplamı" diyor — N, toplama
      // fiilen katılan (sayfası girilmiş) kitapları saymalı, tümünü değil
      kitapSayisi: bitenler.filter(k => k.sayfa > 0).length,
      yuzde: hedef > 0 ? Math.min(100, Math.round(ilerleme / hedef * 100)) : null,
      projeksiyon: gunNo > 0 ? Math.round(ilerleme / gunNo * 365) : 0
    };
  }
  function sayfaHedefKartHtml(){
    const d = sayfaHedefDurum();
    let h = '<div class="zk-blok" id="zkSayfaHedefKart"><div class="ist-bolum-baslik">Sayfa hedefi</div>';
    if(d.hedef > 0){
      const tempo = d.projeksiyon >= d.hedef
        ? 'Bu tempoyla yıl sonunda ~<b class="zk-iyi">' + d.projeksiyon.toLocaleString('tr') + '</b> sayfa — hedefin üstünde.'
        : 'Bu tempoyla yıl sonu projeksiyonu ~<b class="zk-dusuk">' + d.projeksiyon.toLocaleString('tr') + '</b> sayfa — tempo artmalı.';
      h += '<div class="ilerleme" id="zkSayfaBar"><div style="width:' + d.yuzde + '%"></div></div>'
        + '<div class="zk-not"><b class="zk-vurgu">' + d.ilerleme.toLocaleString('tr') + ' / '
        + d.hedef.toLocaleString('tr') + '</b> sayfa (%' + d.yuzde + '). ' + tempo
        + '<br>Bitirdiğin ' + d.kitapSayisi + ' kitabın sayfa toplamı sayılır (sayfa sayısı girilmiş olanlar).</div>';
    }else{
      h += '<div class="zk-not">Sayfa hedefi koyarsan kalın kitaplar da hakkını alır — '
        + 'adet hedefinde 900 sayfalık kitap da 90 sayfalık kitap da 1 sayılıyor.</div>';
    }
    return h + '<div class="zk-satir-giris">'
      + '<input type="number" inputmode="numeric" min="1" id="zkHedefSayfaGiris" placeholder="sayfa" value="'
      + (d.hedef || '') + '">'
      + '<button class="zk-dugme" data-act="zk-hedef-kaydet">Sayfa hedefini kaydet</button>'
      + '</div></div>';
  }
  function sayfaHedefKaydet(){
    const el = document.getElementById('zkHedefSayfaGiris');
    if(!el) return false;
    const n = parseInt(el.value) || 0;
    const yil = new Date().getFullYear();
    veri.hedefSayfa = veri.hedefSayfa || {};
    veri.hedefSayfaG = veri.hedefSayfaG || {};
    if(n > 0){ veri.hedefSayfa[yil] = n; bildir(yil + ' sayfa hedefi: ' + n.toLocaleString('tr')); }
    else { delete veri.hedefSayfa[yil]; bildir('Sayfa hedefi kaldırıldı'); }
    veri.hedefSayfaG[yil] = Date.now();   // değişiklik anında damgala (senkron çakışması için)
    if(typeof depoKaydet === 'function') depoKaydet();
    if(typeof istCiz === 'function') istCiz();
    setTimeout(zekaEkle, 0);
    return true;
  }

  /* ---------- yerleştirme ---------- */
  function stilEkle(){
    if(document.getElementById('zkStil')) return;
    const s = document.createElement('style');
    s.id = 'zkStil';
    /* v54 Ciltli: kutu dili emekli — kartlar artık İstatistik bölümlerinin
       içindeki bloklar. Çubuklarda ray YOK (çekirdeğin .bar-* reçetesiyle aynı
       karar), ilerleme çubuğu ortak .ilerleme kalıbını kullanıyor, düğme kontur. */
    s.textContent = `
      .zk-blok{margin-top:18px}
      .is-yuva > .zk-blok:first-child{margin-top:0}
      .zk-baslik{font-family:var(--serif);font-size:1.05rem}
      .zk-alt-baslik{font-size:.72rem;color:var(--muted2);margin:14px 0 2px;
        letter-spacing:.06em;text-transform:uppercase}
      .zk-not{font-size:.8rem;color:var(--muted);margin-top:8px;line-height:1.55}
      .zk-buyuk{font-family:var(--serif);font-size:1.5rem;line-height:1.1;color:var(--paper);
        margin-top:8px;font-variant-numeric:tabular-nums}
      .zk-vurgu{color:var(--brass);font-weight:600}
      .zk-iyi{color:var(--ok)}
      .zk-dusuk{color:var(--drop)}
      .zk-bar-satir{display:flex;align-items:center;gap:8px;margin-top:8px}
      .zk-bar-ad{flex:0 0 96px;font-size:.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .zk-bar-govde{flex:1;height:6px;background:transparent;overflow:hidden}
      .zk-bar-govde > div{height:100%;background:var(--brass)}
      .zk-bar-deger{flex:0 0 30px;text-align:right;font-size:.8rem;color:var(--muted);
        font-variant-numeric:tabular-nums}
      .zk-bar-adet{flex:0 0 58px;text-align:right;font-size:.66rem;color:var(--muted2);
        font-variant-numeric:tabular-nums}
      .zk-satir{display:flex;justify-content:space-between;gap:10px;font-size:.8rem;color:var(--muted);margin-top:8px}
      .zk-satir span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .zk-satir-giris{display:flex;gap:8px;margin-top:12px}
      .zk-satir-giris input{width:100px}
      .zk-dugme{flex:0 0 auto;padding:12px 16px;border-radius:var(--r-md);
        border:1px solid var(--kontur);background:transparent;color:var(--paper);
        font-family:var(--serif);font-size:.9rem;font-weight:600}
    `;
    document.head.appendChild(s);
  }
  /* v54: kartlar artık ekranın SONUNA yığılmıyor — çekirdeğin açtığı anlam
     yuvalarına dağılıyor (hedef / alışkanlık / zevk / tarihçe). Yuvalar DOM
     sırasında da doğru yerde: görsel sıra ile okuma-klavye sırası ayrışmıyor
     (CSS `order` ile yapılsaydı ayrışırdı). */
  const BLOKLAR = ['zkSayfaHedefKart', 'zkPuanKart', 'zkBirakmaKart', 'zkAylikKart', 'zkSaatKart'];
  function yuvaya(yuvaId, html){
    if(!html) return;
    const y = document.getElementById(yuvaId);
    if(!y) return;
    const d = document.createElement('div');
    d.innerHTML = html;
    while(d.firstChild) y.appendChild(d.firstChild);
  }
  function zekaEkle(){
    const kap = document.getElementById('istIcerik');
    // sayfaHedefKartHtml HER ZAMAN içerik üretir → varlığı "zaten yerleşti" demek
    if(!kap || document.getElementById('zkSayfaHedefKart')) return;
    if(!kitaplar().length) return;                     // boş kütüphanede istatistik zaten çizilmiyor
    if(!kap.querySelector('.is-bolum')) return;        // çekirdek henüz çizmemiş
    stilEkle();
    yuvaya('istYuvaHedef', sayfaHedefKartHtml());
    yuvaya('istYuvaZevk', puanKartHtml());
    yuvaya('istYuvaAliskanlik', birakmaKartHtml() + saatKartHtml());
    yuvaya('istYuvaTarihce', aylikKartHtml());
    if(typeof istBolumTemizle === 'function') istBolumTemizle();
  }
  function tazele(){
    BLOKLAR.forEach(id => { const e = document.getElementById(id); if(e) e.remove(); });
    zekaEkle();
  }

  function baslat(){
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      if(el.dataset.act === 'zk-hedef-kaydet'){ sayfaHedefKaydet(); return; }
      if(el.dataset.act === 'sekme' && el.dataset.v === 'ist') setTimeout(zekaEkle, 0);
      if(el.dataset.act === 'hedef-kaydet') setTimeout(tazele, 0);   // çekirdek istCiz'i yeniden çizer
    });
    const ist = document.getElementById('istIcerik');
    if(ist && window.MutationObserver){
      new MutationObserver(() => {
        if(document.getElementById('panel-ist').classList.contains('active')
           && !document.getElementById('zkSarmal')) setTimeout(zekaEkle, 0);
      }).observe(ist, { childList: true });
    }
    setTimeout(zekaEkle, 0);
  }

  if(document.getElementById('istIcerik')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__zeka = { turOrtalamalari, yazarOrtalamalari, birakmaAnalizi, aylikSayfa,
    saatDagilimi, sayfaHedefDurum, sayfaHedefKaydet, zekaEkle, tazele,
    esikler: { TUR_ESIK, YAZAR_ESIK, SAAT_ESIK } };
})();
