/* Kitaplık — yıl sonu okuma raporu
   İstatistik sekmesine yıl seçicili özet kartı ekler ve paylaşılabilir PNG üretir.
   Tüm sayılar mevcut veriden hesaplanır; veri yoksa UYDURULMAZ, boş mesaj verilir.
   AD ALANI: sınıflar ve data-act değerleri "rp-" önekli, id'ler "rp" önekli.
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  const AYLAR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const AY_UZUN = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos',
    'Eylül','Ekim','Kasım','Aralık'];
  const RENK = { zemin:'#F5EFE3', murekkep:'#2E2618', pirinc:'#A87D2F', soluk:'#7A6C50' };
  const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
  const SANS = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  let seciliYil = new Date().getFullYear();

  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function kitaplar(){ return (typeof veri === 'object' && veri && Array.isArray(veri.kitaplar)) ? veri.kitaplar : []; }
  function sureMetni(ms){
    const dk = Math.max(0, Math.round(ms / 60000));
    if(dk < 60) return dk + ' dk';
    const s = Math.floor(dk / 60), k = dk % 60;
    return k ? s + ' sa ' + k + ' dk' : s + ' sa';
  }

  /* ---------- veri ----------
     Her TAMAMLANMIŞ okuma bir olaydır: arşivdeki okumalar + güncel bitmiş okuma.
     Böylece 2024'te okunup 2026'da yeniden okunan kitap İKİ yılın raporunda da
     görünür (çekirdeğin istKayit'i "kitap başına tek kayıt" der; o yıllık HEDEF
     sayımı içindir, burada yıl bazlı olay listesi doğru olan). */
  function okumaOlaylari(){
    const c = [];
    kitaplar().forEach(k => {
      (k.okumalar || []).forEach(o => {
        if(o && o.bit) c.push({ k, bit: o.bit, bas: o.bas || null, puan: o.puan || null, yeniden: true });
      });
      if(k.durum === 'bitti' && k.bitisTarihi)
        c.push({ k, bit: k.bitisTarihi, bas: k.baslamaTarihi || null, puan: k.puan || null,
          yeniden: (k.okumalar || []).length > 0 });
    });
    return c;
  }
  function yillar(){
    const y = new Set();
    okumaOlaylari().forEach(o => { const s = String(o.bit).slice(0, 4); if(/^\d{4}$/.test(s)) y.add(+s); });
    kitaplar().forEach(k => (k.oturumlar || []).forEach(o => {
      if(o && !o.sup && o.b) y.add(new Date(o.b).getFullYear());
    }));
    y.add(new Date().getFullYear());
    return [...y].sort((a, b) => b - a);
  }

  function yilOzeti(yil){
    const olaylar = okumaOlaylari().filter(o => String(o.bit).startsWith(String(yil)));
    // "bitirilen kitap" = O YIL tamamlanmış okuması olan FARKLI kitap sayısı
    const kitapHar = new Map();
    olaylar.forEach(o => { if(!kitapHar.has(o.k.id)) kitapHar.set(o.k.id, o); });
    const benzersiz = [...kitapHar.values()];
    const yenidenSayisi = olaylar.filter(o => o.yeniden).length;

    const sayfa = benzersiz.reduce((t, o) => t + (o.k.sayfa || 0), 0);
    const puanlilar = benzersiz.filter(o => o.puan);
    const ortPuan = puanlilar.length
      ? Math.round(puanlilar.reduce((t, o) => t + o.puan, 0) / puanlilar.length * 10) / 10 : null;

    // oturum verisi (yalnız o yıl, sup'lu olanlar hariç)
    let sure = 0; const gunler = new Set();
    kitaplar().forEach(k => (k.oturumlar || []).forEach(o => {
      if(!o || o.sup || !o.b) return;
      const d = new Date(o.b);
      if(d.getFullYear() !== yil) return;
      sure += (o.s || 0);
      gunler.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0'));
    }));
    // en uzun kesintisiz seri (o yıl içinde)
    const sirali = [...gunler].sort();
    let enUzun = 0, akt = 0, onceki = null;
    for(const g of sirali){
      if(onceki){
        const fark = Math.round((new Date(g) - new Date(onceki)) / 86400000);
        akt = fark === 1 ? akt + 1 : 1;
      }else akt = 1;
      if(akt > enUzun) enUzun = akt;
      onceki = g;
    }

    const aylik = Array(12).fill(0);
    benzersiz.forEach(o => {
      const ay = parseInt(String(o.bit).slice(5, 7)) - 1;
      if(ay >= 0 && ay < 12) aylik[ay]++;
    });

    const yazarSay = new Map(), turSay = new Map();
    benzersiz.forEach(o => {
      if(o.k.yazar) yazarSay.set(o.k.yazar, (yazarSay.get(o.k.yazar) || 0) + 1);
      if(o.k.tur) turSay.set(o.k.tur, (turSay.get(o.k.tur) || 0) + 1);
    });
    /* "En çok" iddiası tek kitapla kurulmaz: n>=2 değilse null döner, satır hiç
       gösterilmez (zeka.js yazar kartının >=2 eşiğiyle aynı — iki kart çelişmesin). */
    const enUst = h => {
      const t = [...h.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))[0];
      return (t && t[1] >= 2) ? t : null;
    };

    const tarihSirali = benzersiz.slice().sort((a, b) => String(a.bit).localeCompare(String(b.bit)));
    const enIyi = puanlilar.slice()
      .sort((a, b) => b.puan - a.puan || a.k.ad.localeCompare(b.k.ad, 'tr')).slice(0, 3);

    const hedefK = ((typeof veri === 'object' && veri.hedef) || {})[yil] || 0;
    const hedefS = ((typeof veri === 'object' && veri.hedefSayfa) || {})[yil] || 0;

    return {
      yil, kitap: benzersiz.length, yenidenSayisi, sayfa, ortPuan,
      puanliSayisi: puanlilar.length,
      sure, oturumluGun: gunler.size, enUzunSeri: enUzun,
      aylik, enIyi: enIyi.map(o => ({ ad: o.k.ad, yazar: o.k.yazar || '', puan: o.puan })),
      enCokYazar: enUst(yazarSay), enCokTur: enUst(turSay),
      ilk: tarihSirali[0] ? { ad: tarihSirali[0].k.ad, tarih: tarihSirali[0].bit } : null,
      son: tarihSirali.length ? { ad: tarihSirali[tarihSirali.length - 1].k.ad,
        tarih: tarihSirali[tarihSirali.length - 1].bit } : null,
      hedefKitap: hedefK, hedefSayfa: hedefS,
      hedefKitapTuttu: hedefK ? benzersiz.length >= hedefK : null,
      hedefSayfaTuttu: hedefS ? sayfa >= hedefS : null,
      veriVar: benzersiz.length > 0 || sure > 0
    };
  }
  function karsilastir(yil){
    const bu = yilOzeti(yil), onceki = yilOzeti(yil - 1);
    if(!onceki.veriVar) return null;
    return { kitap: bu.kitap - onceki.kitap, sayfa: bu.sayfa - onceki.sayfa, oncekiYil: yil - 1 };
  }

  /* ---------- PNG (kart.js deseni: KREM palet, tema bağımsız) ---------- */
  function metniSar(c, metin, enFazla){
    const kelimeler = String(metin).replace(/\s+/g, ' ').trim().split(' ');
    const satirlar = []; let satir = '';
    for(const kelime of kelimeler){
      const aday = satir ? satir + ' ' + kelime : kelime;
      if(c.measureText(aday).width <= enFazla){ satir = aday; continue; }
      if(satir) satirlar.push(satir);
      satir = kelime;
    }
    if(satir) satirlar.push(satir);
    return satirlar;
  }
  function kirp(c, metin, enFazla){
    let m = String(metin);
    if(c.measureText(m).width <= enFazla) return m;
    while(m.length > 1 && c.measureText(m + '…').width > enFazla) m = m.slice(0, -1);
    return m.replace(/[\s.,;:]+$/, '') + '…';
  }
  function raporCiz(tuval, ozet){
    const W = 1080, H = 1350;
    tuval.width = W; tuval.height = H;
    const c = tuval.getContext('2d');
    c.fillStyle = RENK.zemin; c.fillRect(0, 0, W, H);
    const kenar = 96, enG = W - kenar * 2;
    c.textBaseline = 'top';
    let y = 96;

    c.fillStyle = RENK.soluk; c.font = '30px ' + SANS;
    c.fillText('PİNAKES · OKUMA YILI', kenar, y); y += 46;
    c.fillStyle = RENK.pirinc; c.font = 'bold 132px ' + SERIF;
    c.fillText(String(ozet.yil), kenar, y); y += 168;

    c.fillStyle = RENK.pirinc; c.fillRect(kenar, y, 72, 5); y += 40;

    const satirlar = [];
    satirlar.push([String(ozet.kitap), ozet.kitap === 1 ? 'kitap bitirdin' : 'kitap bitirdin']);
    if(ozet.sayfa) satirlar.push([ozet.sayfa.toLocaleString('tr'), 'sayfa okudun']);
    if(ozet.sure) satirlar.push([sureMetni(ozet.sure), 'kitapla geçirdiğin süre']);
    if(ozet.ortPuan !== null) satirlar.push([String(ozet.ortPuan),
      'ortalama puanın (' + ozet.puanliSayisi + ' kitaptan)']);
    if(ozet.enUzunSeri > 1) satirlar.push([String(ozet.enUzunSeri), 'gün üst üste okudun']);

    c.fillStyle = RENK.murekkep;
    for(const [sayi, etiket] of satirlar){
      c.font = 'bold 64px ' + SERIF;
      const sw = c.measureText(sayi).width;
      c.fillStyle = RENK.pirinc; c.fillText(sayi, kenar, y);
      c.fillStyle = RENK.murekkep; c.font = '34px ' + SANS;
      c.fillText(kirp(c, etiket, enG - sw - 24), kenar + sw + 24, y + 24);
      y += 96;
    }

    if(ozet.enIyi.length){
      y += 24;
      c.fillStyle = RENK.soluk; c.font = '30px ' + SANS;
      c.fillText('EN ÇOK BEĞENDİKLERİN', kenar, y); y += 48;
      c.fillStyle = RENK.murekkep; c.font = 'italic 40px ' + SERIF;
      for(const kitap of ozet.enIyi){
        if(y > H - 220) break;
        const metin = kitap.ad + (kitap.yazar ? ' — ' + kitap.yazar : '') + '  ★' + kitap.puan;
        const parcalar = metniSar(c, metin, enG);
        c.fillText(kirp(c, parcalar[0], enG), kenar, y);
        y += 58;
      }
    }

    // alt bilgi: en çok yazar/tür (yer kaldıysa) — sayaç PNG'de de basılır:
    // ekranda "(n)" varken PNG'de çıplak iddia kalıyordu (dayanaksız görünüm)
    if((ozet.enCokYazar || ozet.enCokTur) && y < H - 190){
      c.fillStyle = RENK.soluk; c.font = '30px ' + SANS;
      const alt = [ozet.enCokYazar ? 'En çok: ' + ozet.enCokYazar[0] + ' (' + ozet.enCokYazar[1] + ')' : '',
        ozet.enCokTur ? ozet.enCokTur[0] + ' (' + ozet.enCokTur[1] + ')' : ''].filter(Boolean).join(' · ');
      c.fillText(kirp(c, alt, enG), kenar, H - 150);
    }
    c.fillStyle = RENK.pirinc; c.fillRect(kenar, H - 96, 72, 5);

    return { genislik: W, yukseklik: H, sonY: y, tabanSinir: H - 190,
      satirSayisi: satirlar.length, tasti: y > H - 190 };
  }

  /* ---------- arayüz ---------- */
  function stilEkle(){
    if(document.getElementById('rpStil')) return;
    const s = document.createElement('style');
    s.id = 'rpStil';
    /* v54 Ciltli: kutu/hap/dolgu dili emekli. Kart → bölüm içi blok; yıl hapları
       → kontur çip (.ks-chip reçetesi: seçili = altın kontur + %7 tint, DOLGU
       DEĞİL); sayı kutuları → ayraçlı hücre; PNG düğmesi altın KONTUR.
       PNG tuvali bundan etkilenmez: krem palet canvas'ta sabit, tema bağımsız. */
    s.textContent = `
      .rp-blok{margin-top:0}
      .rp-yillar{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
      .rp-yillar::-webkit-scrollbar{display:none}
      .rp-yil{flex:0 0 auto;padding:7px 12px;border-radius:var(--r-sm);border:1px solid var(--kontur);
        background:transparent;color:var(--muted);font-size:.78rem;white-space:nowrap}
      .rp-yil.rp-secili{border-color:var(--brass);color:var(--paper);font-weight:600;
        background:color-mix(in srgb,var(--brass) 7%,transparent)}
      .rp-not{font-size:.8rem;color:var(--muted);margin-top:9px;line-height:1.55}
      .rp-sayilar{display:flex;flex-wrap:wrap;row-gap:14px;margin-top:14px}
      .rp-kutu{flex:1 1 40%;min-width:0;padding:0 12px;border-left:1px solid var(--cizgi)}
      .rp-sayilar .rp-kutu:nth-child(2n+1){padding-left:0;border-left:none}
      .rp-sayi{display:block;font-family:var(--serif);font-size:1.5rem;line-height:1.1;
        color:var(--paper);font-variant-numeric:tabular-nums}
      .rp-etiket{display:block;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;
        color:var(--muted);margin-top:5px}
      .rp-bolum{font-size:.72rem;color:var(--muted2);margin:16px 0 4px;
        letter-spacing:.06em;text-transform:uppercase}
      .rp-satir{display:flex;justify-content:space-between;gap:10px;font-size:.85rem;
        color:var(--paper);padding:7px 0;border-bottom:1px solid var(--cizgi)}
      .rp-satir:last-child{border-bottom:none}
      .rp-satir span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rp-vurgu{color:var(--brass);font-weight:600;white-space:nowrap}
      .rp-aylar{display:flex;gap:3px;align-items:flex-end;height:56px;margin-top:10px}
      .rp-ay{flex:1;background:var(--brass);border-radius:0;min-height:2px}
      .rp-ay-etiket{display:flex;gap:3px;margin-top:4px}
      .rp-ay-etiket span{flex:1;text-align:center;font-size:.6rem;color:var(--muted2)}
      .rp-hedef{font-size:.82rem;margin-top:8px;color:var(--muted)}
      .rp-tuttu{color:var(--ok);font-weight:600}
      .rp-tutmadi{color:var(--drop);font-weight:600}
      .rp-dugme{width:100%;margin-top:16px;padding:12px 16px;border-radius:var(--r-md);
        background:transparent;border:1px solid var(--brass);color:var(--brass);
        font-family:var(--serif);font-size:.95rem;font-weight:600;
        display:inline-flex;align-items:center;justify-content:center;gap:6px}
    `;
    document.head.appendChild(s);
  }

  function kartHtml(){
    const ys = yillar();
    if(!seciliYil || ys.indexOf(seciliYil) < 0) seciliYil = ys[0];
    const o = yilOzeti(seciliYil);
    const k = karsilastir(seciliYil);
    let h = '<div class="rp-blok" id="rpKart">'
      + '<div class="rp-yillar" id="rpYillar">'
      + ys.map(y => '<button class="rp-yil' + (y === seciliYil ? ' rp-secili' : '')
        + '" data-act="rp-yil" data-v="' + y + '">' + y + '</button>').join('')
      + '</div>';

    if(!o.veriVar){
      return h + '<div class="rp-not" id="rpBos">' + seciliYil
        + ' yılında bitirilmiş kitap ya da okuma oturumu kaydı yok. '
        + 'Kitapları bitiş tarihiyle işaretledikçe bu rapor dolar.</div></div>';
    }

    h += '<div class="rp-sayilar" id="rpSayilar">'
      + '<div class="rp-kutu"><div class="rp-sayi">' + o.kitap + '</div><div class="rp-etiket">kitap bitirdin</div></div>'
      + '<div class="rp-kutu"><div class="rp-sayi">' + o.sayfa.toLocaleString('tr') + '</div><div class="rp-etiket">sayfa</div></div>';
    if(o.sure) h += '<div class="rp-kutu"><div class="rp-sayi">' + sureMetni(o.sure) + '</div><div class="rp-etiket">okuma süresi</div></div>';
    if(o.ortPuan !== null) h += '<div class="rp-kutu"><div class="rp-sayi">' + o.ortPuan
      + '</div><div class="rp-etiket">ortalama puan (' + o.puanliSayisi + ' kitaptan)</div></div>';
    if(o.enUzunSeri > 1) h += '<div class="rp-kutu"><div class="rp-sayi">' + o.enUzunSeri + '</div><div class="rp-etiket">gün üst üste</div></div>';
    h += '</div>';

    if(o.yenidenSayisi) h += '<div class="rp-not" id="rpYeniden">Bunların ' + o.yenidenSayisi
      + ' tanesi yeniden okuma.</div>';

    if(k) h += '<div class="rp-not" id="rpKarsilastirma">' + k.oncekiYil + '\'a göre: '
      + '<b class="' + (k.kitap >= 0 ? 'rp-tuttu' : 'rp-tutmadi') + '">'
      + (k.kitap >= 0 ? '+' : '') + k.kitap + ' kitap</b>, '
      + '<b class="' + (k.sayfa >= 0 ? 'rp-tuttu' : 'rp-tutmadi') + '">'
      + (k.sayfa >= 0 ? '+' : '') + k.sayfa.toLocaleString('tr') + ' sayfa</b>.</div>';

    if(o.hedefKitap || o.hedefSayfa){
      h += '<div class="rp-hedef" id="rpHedef">';
      if(o.hedefKitap) h += 'Kitap hedefi ' + o.hedefKitap + ': <span class="'
        + (o.hedefKitapTuttu ? 'rp-tuttu">tuttun' : 'rp-tutmadi">tutmadın') + '</span> (' + o.kitap + ')<br>';
      if(o.hedefSayfa) h += 'Sayfa hedefi ' + o.hedefSayfa.toLocaleString('tr') + ': <span class="'
        + (o.hedefSayfaTuttu ? 'rp-tuttu">tuttun' : 'rp-tutmadi">tutmadın') + '</span> ('
        + o.sayfa.toLocaleString('tr') + ')';
      h += '</div>';
    }

    const enB = Math.max.apply(null, o.aylik.concat([1]));
    h += '<div class="rp-bolum">AYLARA GÖRE</div><div class="rp-aylar" id="rpAylar">'
      + o.aylik.map(v => '<div class="rp-ay" style="height:' + Math.round(v / enB * 100) + '%"'
        + ' title="' + v + ' kitap"></div>').join('') + '</div>'
      + '<div class="rp-ay-etiket">' + AYLAR.map(a => '<span>' + a[0] + '</span>').join('') + '</div>';

    if(o.enIyi.length){
      h += '<div class="rp-bolum">EN ÇOK BEĞENDİKLERİN</div><div id="rpEnIyi">'
        + o.enIyi.map(x => '<div class="rp-satir"><span>' + kacir(x.ad)
          + (x.yazar ? ' — ' + kacir(x.yazar) : '') + '</span><span class="rp-vurgu">★ ' + x.puan
          + '</span></div>').join('') + '</div>';
    }
    const ekstra = [];
    if(o.enCokYazar) ekstra.push(['En çok okuduğun yazar', o.enCokYazar[0] + ' (' + o.enCokYazar[1] + ')']);
    if(o.enCokTur) ekstra.push(['En çok tür', o.enCokTur[0] + ' (' + o.enCokTur[1] + ')']);
    if(o.ilk) ekstra.push(['Yılın ilk kitabı', o.ilk.ad]);
    if(o.son && o.kitap > 1) ekstra.push(['Yılın son kitabı', o.son.ad]);
    if(ekstra.length){
      h += '<div class="rp-bolum">ÖZET</div><div id="rpEkstra">'
        + ekstra.map(([a, b]) => '<div class="rp-satir"><span>' + kacir(a)
          + '</span><span class="rp-vurgu">' + kacir(b) + '</span></div>').join('') + '</div>';
    }
    h += '<button class="rp-dugme" data-act="rp-png">' + (window.ikon ? window.ikon('gorsel') : '') + ' Yıl kartını indir (PNG)</button>';
    return h + '</div>';
  }

  function ciz(){
    const kap = document.getElementById('istIcerik');
    if(!kap) return;
    if(!document.getElementById('panel-ist')
       || !document.getElementById('panel-ist').classList.contains('active')) return;
    if(!kap.querySelector('.is-bolum')) return;
    const eski = document.getElementById('rpKart');
    if(eski) eski.remove();
    stilEkle();
    const sar = document.createElement('div');
    sar.innerHTML = kartHtml();
    // v54: rapor kendi bölümünün YUVASINA girer (ekran sonuna yığılmaz)
    (document.getElementById('istYuvaRapor') || kap).appendChild(sar.firstElementChild);
    if(typeof istBolumTemizle === 'function') istBolumTemizle();
  }

  function pngIndir(){
    const o = yilOzeti(seciliYil);
    if(!o.veriVar){ bildir('Bu yıl için veri yok'); return false; }
    const tuval = document.createElement('canvas');
    raporCiz(tuval, o);
    tuval.toBlob(blob => {
      if(!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pinakes-' + seciliYil + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      bildir(seciliYil + ' kartı indirildi');
    }, 'image/png');
    return true;
  }

  function baslat(){
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      if(el.dataset.act === 'rp-yil'){ seciliYil = parseInt(el.dataset.v); ciz(); return; }
      if(el.dataset.act === 'rp-png'){ pngIndir(); return; }
      if(el.dataset.act === 'sekme' && el.dataset.v === 'ist') setTimeout(ciz, 0);
      if(el.dataset.act === 'hedef-kaydet' || el.dataset.act === 'zk-hedef-kaydet') setTimeout(ciz, 0);
    });
    const ist = document.getElementById('istIcerik');
    if(ist && window.MutationObserver){
      new MutationObserver(() => {
        if(document.getElementById('panel-ist').classList.contains('active')
           && !document.getElementById('rpKart')) setTimeout(ciz, 0);
      }).observe(ist, { childList: true });
    }
    setTimeout(ciz, 0);
  }

  if(document.getElementById('istIcerik')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__rapor = { yillar, yilOzeti, karsilastir, okumaOlaylari, raporCiz, pngIndir, ciz,
    yilSec: y => { seciliYil = y; }, yilAl: () => seciliYil };
})();
