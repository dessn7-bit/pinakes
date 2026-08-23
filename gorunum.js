/* Kitaplık — raf görünümü eklentisi
   1) Çoklu seçim + toplu düzenleme (raf ata, etiket ekle, durum değiştir, sil)
   2) Görünüm düzenleri (v42 Ciltli): izgara (kapak levhası duvarı) / liste /
      yoğun (küçük levhalı sık satır — çok kitaplı rafta hızlı tarama)
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir. */
'use strict';
(function(){
  const GORUNUM_ANAHTAR = 'kk_gorunum_v1';
  const DUZENLER = ['izgara', 'liste', 'yogun'];
  /* v43 (D2): tek gruplama boyutu — "Rafa göre" düğmesinin genellemesi.
     '' = gruplama yok (varsayılan, eski davranış). */
  const GRUPLAR = ['durum', 'tur', 'yazar', 'raf'];
  let secimModu = false;
  let secilenler = new Set();
  let duzen = 'izgara', grup = '';
  let basmaZaman = null, basmaId = null;

  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function kitapBulL(id){ return (veri.kitaplar||[]).find(k => k.id === id); }
  function ik(ad){ return window.ikon ? window.ikon(ad) : ''; }

  function ayarYukle(){
    /* v40 KARAR: Kütüphane bir RAF — varsayılan görünüm İZGARA (kapak duvarı).
       v42: iki-durumlu izgara/liste anahtarı üç-düzen seçiciye büyüdü
       (izgara/liste/yogun). ESKİ ŞEMA ({izgara:bool}) GÖÇLE OKUNUR: eski cihaz
       ve eski test tohumları kırılmaz; yazarken iki alan birden basılır. */
    try{
      const ham = localStorage.getItem(GORUNUM_ANAHTAR);
      if(ham === null){ duzen = 'izgara'; grup = ''; return; }
      const a = JSON.parse(ham) || {};
      duzen = DUZENLER.indexOf(a.duzen) >= 0 ? a.duzen : (a.izgara ? 'izgara' : 'liste');
      /* v43 göçü: eski rafGrupla:true → grup:'raf'; rafGrupla yazılmaya devam
         eder (eski istemci/test tohumu sözleşmesi). */
      grup = GRUPLAR.indexOf(a.grup) >= 0 ? a.grup : (a.rafGrupla ? 'raf' : '');
    }catch(e){ duzen = 'izgara'; }
  }
  function ayarYaz(){
    try{ localStorage.setItem(GORUNUM_ANAHTAR,
      JSON.stringify({ duzen, izgara: duzen === 'izgara', grup,
        rafGrupla: grup === 'raf' })); }catch(e){ window._iz && window._iz('gorunumAyarYaz', e); }
  }

  function stilEkle(){
    if(document.getElementById('gorunumStil')) return;
    const s = document.createElement('style');
    s.id = 'gorunumStil';
    s.textContent = `
      /* ---- İZGARA (v42 Ciltli): kapak levhası duvarı + durum satırı ---- */
      #liste.izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:16px 12px}
      #liste.izgara .kart{flex-direction:column;background:transparent;border:none;box-shadow:none;
        padding:0;border-radius:0;gap:0}
      #liste.izgara .kart .kart-ic{padding:6px 2px 0}
      #liste.izgara .kart-baslik{font-size:.82rem;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      #liste.izgara .kart-yazar{font-size:.72rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #liste.izgara .kart-alt,#liste.izgara .ilerleme,#liste.izgara .ilerleme-txt{display:none}
      #liste.izgara .iz-plate{width:100%;height:150px}
      /* Kapaksız karo: levha içinde kesikli çerçeve + TAM AD (bilinçli: ~100px
         genişlikte ad okunur, kapak duvarında seçime yardım eder; g12 XSS metin
         sözleşmesi de tam adı bekler). Renkli sırt v42'de emekli. */
      #liste.izgara .iz-yedek{position:absolute;inset:0;padding:7px 8px;overflow:hidden;
        font-family:var(--serif);font-size:.78rem;font-weight:600;color:var(--paper);
        line-height:1.25;text-align:left;overflow-wrap:break-word}
      /* v42: okunmuş işareti — sönükleştirme (opacity/grayscale) EMEKLİ.
         Durum satırı taşır: Okundu ✓(SVG) sessiz, Okunuyor altın. AA korunur
         (muted/muted2 zaten 4.9+); tasarımın %38-45 mürekkep karışımları küçük
         puntoda AA'yı kırdığı için renk rolleri paletten seçildi. */
      #liste.izgara .iz-durum{display:flex;align-items:center;gap:4px;margin-top:5px;
        font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2)}
      #liste.izgara .iz-durum .ikon{width:11px;height:11px;stroke-width:2.2}
      #liste.izgara .iz-durum.d-okunuyor{color:var(--brass)}
      #liste.izgara .iz-durum.d-bitti{color:var(--muted)}
      #liste.izgara .iz-durum.d-yarim{color:var(--drop)}
      /* ---- YOĞUN (v42): küçük levha + tek satır — hızlı tarama ---- */
      #liste.yogun{display:flex;flex-direction:column;gap:0}
      #liste.yogun .kart{background:transparent;border:none;box-shadow:none;border-radius:0;
        border-bottom:1px solid var(--cizgi);padding:7px 0;gap:10px;align-items:center}
      #liste.yogun .yg-plate{width:26px;height:38px;border-width:3px}
      #liste.yogun .kart-ic{padding:0;display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}
      #liste.yogun .kart-baslik{font-family:var(--serif);font-size:.92rem;font-weight:600;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}
      #liste.yogun .kart-yazar{font-size:.72rem;color:var(--muted);margin:0;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}
      #liste.yogun .yg-durum{margin-left:auto;flex:0 0 auto;font-size:.6rem;
        letter-spacing:.06em;text-transform:uppercase;color:var(--muted2)}
      #liste.yogun .yg-durum.d-okunuyor{color:var(--brass)}
      #liste.yogun .yg-durum.d-yarim{color:var(--drop)}
      .vm-iz-istek{position:absolute;top:6px;right:6px;background:var(--mavi);color:var(--uzeri);
        font-size:.6rem;padding:2px 6px;border-radius:var(--r-sm);z-index:2;letter-spacing:.02em}
      .raf-basligi{grid-column:1/-1;font-size:.72rem;color:var(--muted);margin:8px 0 -6px;
        letter-spacing:.08em;text-transform:uppercase;padding-bottom:4px;
        border-bottom:1px solid var(--cizgi)}
      #liste.yogun .raf-basligi{margin:10px 0 0}
      .kart.secili{outline:2px solid var(--brass);outline-offset:2px;border-radius:var(--r-sm)}
      .secim-isaret{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:999px;
        background:var(--bg);border:1px solid var(--brass);color:var(--brass);
        display:flex;align-items:center;justify-content:center;
        font-size:.8rem;z-index:3;box-shadow:var(--yukselti-2)}
      .secim-isaret .ikon{width:13px;height:13px;vertical-align:0}
      /* Toplu çubuk (v42 Ciltli): kontur dili — zemin + ayraç, düğmeler dolgusuz;
         yukarı-yönlü tek gölge yüzer geçici çubuğun bilinçli istisnası */
      .toplu-cubuk{position:fixed;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom));z-index:31;
        background:var(--bg);border-top:1px solid var(--cizgi);padding:10px 14px;
        display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 -2px 8px var(--golge-orta)}
      .toplu-cubuk .sayi{font-size:.85rem;color:var(--brass);font-weight:600;margin-right:auto}
      .toplu-cubuk button{padding:8px 12px;border-radius:var(--r-md);border:1px solid var(--kontur);
        background:transparent;font-size:.8rem;color:var(--paper)}
      .toplu-cubuk button.tehlike{border-color:var(--drop);color:var(--drop)}
      .gorunum-dugme{padding:8px 12px;border-radius:var(--r-md);border:1px solid var(--kontur);
        background:transparent;font-size:.8rem;color:var(--muted)}
      .gorunum-dugme.aktif{border-color:var(--brass);color:var(--brass);
        background:color-mix(in srgb,var(--brass) 7%,transparent);font-weight:600}
      /* ---- Geniş ekran ızgarası (v68) ----
         96px kova mobil 3 sütun içindi; 1100px konteynerde 10 sütun × 96px
         minicik kapak üretiyordu (ölçüm). Hedef kapak ~150-170px (raf hissi):
         ≥700 → 132px kova (820'de 5 sütun ≈148px, 1000'de 6 ≈151px),
         ≥1100 → 150px kova (1100 konteynerde 6 sütun ≈168px kapak).
         Levha yüksekliği sabit 150px'ti; genişleyen sütunda oran bozulmasın
         diye mobil oranı (96:150) aspect-ratio ile korunur. Mobil kural
         DEĞİŞMEDİ. Bu blok gorunum.js stilinde YAŞAMALI: enjekte stil statik
         <style>'dan sonra gelir, medya kuralı ancak burada mobil kuralını
         ezebilir (cascade). */
      @media (min-width:700px){
        #liste.izgara{grid-template-columns:repeat(auto-fill,minmax(132px,1fr))}
        #liste.izgara .iz-plate{height:auto;aspect-ratio:96/150}
      }
      @media (min-width:1100px){
        #liste.izgara{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
        /* toplu çubuk ve FAB masaüstünde: altta nav yok — çubuk sol kenar
           çubuğunu boşlayıp tabana iner, FAB tabana yaklaşır. safe-area dolgusu:
           ≥1100 CSS genişliğindeki DOKUNMATİK cihazda (yatay iPad) çubuğun
           düğmeleri home-indicator bölgesine yapışmasın (taze-göz bulgusu;
           masaüstünde env()=0, etkisiz). */
        .toplu-cubuk{left:var(--nav-w);bottom:0;
          padding-bottom:calc(10px + env(safe-area-inset-bottom))}
        .fab{bottom:24px}
      }
      /* Üç düzen anahtarı (v42): görsel 32×30, dokunma alanı ::after ile ~40px */
      .duzen-anahtar{display:flex;gap:4px}
      .duzen-dugme{width:32px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;
        border:1px solid var(--kontur);border-radius:var(--r-sm);background:transparent;
        color:var(--muted);position:relative}
      .duzen-dugme::after{content:'';position:absolute;inset:-5px -4px}
      .duzen-dugme .ikon{width:15px;height:15px}
      .duzen-dugme.aktif{border-color:var(--brass);color:var(--brass);
        background:color-mix(in srgb,var(--brass) 7%,transparent)}
    `;
    document.head.appendChild(s);
  }

  function dugmeEkle(){
    const eksenKap = document.getElementById('grupEksen');
    const sagKap = document.getElementById('ktAracSag');
    if(!eksenKap || !sagKap || document.getElementById('duzenAnahtar')) return;
    /* v43 (D1/D2): tasarım deseni — SOLDA gruplama eksenleri (metin sekmeleri,
       "Rafa göre" düğmesinin genellemesi), SAĞDA Seç + üç düzen anahtarı.
       innerHTML güvenli: sabit dizeler + ikon() SVG'si, kullanıcı verisi yok. */
    eksenKap.innerHTML =
      '<button id="grupDurum" class="grup-sekme" data-act="grup-sec" data-v="durum">Durum</button>' +
      '<button id="grupTur" class="grup-sekme" data-act="grup-sec" data-v="tur">Tür</button>' +
      '<button id="grupYazar" class="grup-sekme" data-act="grup-sec" data-v="yazar">Yazar</button>' +
      '<button id="grupRaf" class="grup-sekme" data-act="grup-sec" data-v="raf">Raf</button>';
    const s = document.createElement('button');
    s.id = 'secimBtn'; s.className = 'gorunum-dugme';
    s.dataset.act = 'secim-ac';
    s.innerHTML = ik('onay') + ' Seç';
    sagKap.appendChild(s);
    /* Üç düzen anahtarı: her düğme kendi düzenini SEÇER; tercih kk_gorunum_v1'de. */
    const anahtar = document.createElement('div');
    anahtar.id = 'duzenAnahtar'; anahtar.className = 'duzen-anahtar';
    anahtar.innerHTML =
      '<button id="duzenIzgara" class="duzen-dugme" data-act="duzen-sec" data-v="izgara" aria-label="Izgara görünümü" title="Izgara">' + ik('izgara') + '</button>' +
      '<button id="duzenListe" class="duzen-dugme" data-act="duzen-sec" data-v="liste" aria-label="Liste görünümü" title="Liste">' + ik('liste') + '</button>' +
      '<button id="duzenYogun" class="duzen-dugme" data-act="duzen-sec" data-v="yogun" aria-label="Yoğun görünüm" title="Yoğun">' + ik('yogun') + '</button>';
    sagKap.appendChild(anahtar);
    duzenDugmeTazele();
    grupDugmeTazele();
  }
  function duzenDugmeTazele(){
    const kap = document.getElementById('duzenAnahtar');
    if(!kap) return;
    kap.querySelectorAll('.duzen-dugme').forEach(b => {
      const aktif = b.dataset.v === duzen;
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
    });
  }
  function grupDugmeTazele(){
    const kap = document.getElementById('grupEksen');
    if(!kap) return;
    kap.querySelectorAll('.grup-sekme').forEach(b => {
      const aktif = b.dataset.v === grup;
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
    });
  }

  /* ---- Gruplama boyutu (v43 D2) ---- */
  const GRUP_DURUM_AD = { okunuyor:'Okunuyor', okunacak:'Okunacak', bitti:'Okundu', yarim:'Yarım' };
  const GRUP_DURUM_SIRA = ['Okunuyor', 'Okunacak', 'Yarım', 'Okundu'];
  function grupBaslik(k){
    if(grup === 'durum') return GRUP_DURUM_AD[k.durum] || 'Okunacak';
    if(grup === 'tur') return String(k.tur||'').trim() || '— tür belirtilmemiş —';
    if(grup === 'yazar') return String(k.yazar||'').trim() || '— yazar belirtilmemiş —';
    if(grup === 'raf') return String(k.raf||'').trim() || '— raf belirtilmemiş —';
    return '';
  }
  function grupDegeriVar(k){
    if(grup === 'durum') return true;
    const v = grup === 'tur' ? k.tur : grup === 'yazar' ? k.yazar : k.raf;
    return !!(v && String(v).trim());
  }
  function grupSirali(anahtarlar){
    if(grup === 'durum')
      return anahtarlar.sort((a,b) => GRUP_DURUM_SIRA.indexOf(a) - GRUP_DURUM_SIRA.indexOf(b));
    // '—' ile başlayan "belirtilmemiş" kovası tr sıralamada başa düşer — g13'ün
    // eski raf davranışı (belirtilmemiş İLK) korunur.
    return anahtarlar.sort((a,b) => a.localeCompare(b,'tr'));
  }
  /* Boyut seçili ama görüntülenen hiçbir kitapta o veri yoksa: gruplamayı
     ZORLAMA (tek "belirtilmemiş" kovası bilgi taşımaz) — dürüst not göster. */
  function grupBosNotTazele(kitaplar){
    const not = document.getElementById('grupBosNot');
    if(!not) return false;
    const bos = !!grup && grup !== 'durum' && kitaplar.length > 0
      && !kitaplar.some(grupDegeriVar);
    if(bos){
      const ad = { tur:'Tür', yazar:'Yazar', raf:'Raf konumu' }[grup] || 'Bu bilgi';
      const ipucu = grup === 'raf'
        ? 'Düzenle formundan ya da çoklu seçimde "Raf ata" ile ekleyebilirsin.'
        : 'Kitap formundaki alanı doldurdukça burada gruplanır.';
      not.textContent = ad + ' bilgisi henüz hiçbir kitapta yok — gruplamak için önce veri gerek. ' + ipucu;
      not.hidden = false;
      return true;
    }
    not.hidden = true;
    return false;
  }

  function grupluCiz(kap, kitaplar, kartFn){
    let parcalar = [];
    const bosVeri = grupBosNotTazele(kitaplar);
    if(grup && !bosVeri){
      const gruplar = new Map();
      kitaplar.forEach(k => {
        const a = grupBaslik(k);
        if(!gruplar.has(a)) gruplar.set(a, []);
        gruplar.get(a).push(k);
      });
      grupSirali([...gruplar.keys()]).forEach(a => {
        parcalar.push('<div class="raf-basligi">' + kacir(a) + ' · ' + gruplar.get(a).length + '</div>');
        gruplar.get(a).forEach(k => parcalar.push(kartFn(k)));
      });
    }else{
      kitaplar.forEach(k => parcalar.push(kartFn(k)));
    }
    kap.innerHTML = parcalar.join('');
    kapakHatalariniBagla(kap);
    secimGorselTazele();
  }
  /* Liste düzeninde gruplama (v43): çekirdeğin zengin satırları YENİDEN
     ÜRETİLMEZ — mevcut kart düğümleri grup sırasına göre taşınır, araya
     başlık girer (aynı .raf-basligi dili). */
  function listeGrupla(){
    const kap = document.getElementById('liste');
    if(!kap) return;
    kap.querySelectorAll('.raf-basligi').forEach(e => e.remove());
    const kartlar = [...kap.querySelectorAll('.kart')];
    const kitaplar = kartlar.map(el => kitapBulL(el.dataset.id)).filter(Boolean);
    const bosVeri = grupBosNotTazele(kitaplar);
    if(!grup || bosVeri || !kartlar.length) return;
    const gruplar = new Map();
    kartlar.forEach(el => {
      const k = kitapBulL(el.dataset.id);
      const a = k ? grupBaslik(k) : '—';
      if(!gruplar.has(a)) gruplar.set(a, []);
      gruplar.get(a).push(el);
    });
    grupSirali([...gruplar.keys()]).forEach(a => {
      const bas = document.createElement('div');
      bas.className = 'raf-basligi';
      bas.textContent = a + ' · ' + gruplar.get(a).length;
      kap.appendChild(bas);
      gruplar.get(a).forEach(el => kap.appendChild(el));
    });
  }
  function listedekiKitaplar(kap){
    return [...kap.querySelectorAll('.kart')].map(k => k.dataset.id).filter(Boolean)
      .map(kitapBulL).filter(Boolean);
  }
  function izgaraCiz(){
    const kap = document.getElementById('liste');
    if(!kap) return;
    const kitaplar = listedekiKitaplar(kap);
    if(!kitaplar.length){ kap.classList.remove('izgara'); grupBosNotTazele([]); return; }
    kap.classList.add('izgara');
    grupluCiz(kap, kitaplar, kartHtml);
  }
  function yogunCiz(){
    const kap = document.getElementById('liste');
    if(!kap) return;
    const kitaplar = listedekiKitaplar(kap);
    if(!kitaplar.length){ kap.classList.remove('yogun'); grupBosNotTazele([]); return; }
    kap.classList.add('yogun');
    grupluCiz(kap, kitaplar, yogunHtml);
  }
  /* Kapak hatası yedeği v44'te TEK yerde: çekirdeğin window.plateKapakYedek'i
     (kesikli çerçeve + gerekiyorsa ad/yazar — metni levhanın data-ad/data-yazar
     nitelikleri taşır). Buradaki sarmalayıcı yalnız emniyet kemeri: çekirdek
     yardımcısı bir şekilde yoksa en azından çerçeveye düşülür. Satır içi
     onerror KULLANILMAZ (g12 XSS kararı). */
  function yedekSirtKoy(img){
    if(!img || !img.parentNode) return;
    if(window.plateKapakYedek){ window.plateKapakYedek(img); return; }
    const plate = img.closest('.plate');
    if(plate) plate.classList.add('p-bos');
    img.remove();
  }
  function kapakHatalariniBagla(kap){
    kap.querySelectorAll('.kart .plate > img').forEach(img => {
      img.addEventListener('error', () => yedekSirtKoy(img), { once: true });
      // M1 (v69): 200 + 1×1 boş görsel error üretmez — yük SONRASI boyut denetimi
      // (çekirdek ktPlateHata ile aynı kural; yedek yolu yine tek: yedekSirtKoy
      // → window.plateKapakYedek).
      img.addEventListener('load', () => { if(img.naturalWidth <= 1) yedekSirtKoy(img); }, { once: true });
      // src'siz yerel-kapak img'leri (kapak.js dolduracak) erken-düşme sayılmaz:
      // src yokken complete=true + naturalWidth=0 normaldir, yedeğe çevrilmemeli.
      if(img.getAttribute('src') && img.complete && img.naturalWidth <= 1) yedekSirtKoy(img);
    });
  }
  function plateHtml(k, sinif){
    // Kapak önceliği: yerel fotoğraf > uzak URL > kesikli yer tutucu (izgarada + tam ad).
    // İzgara img'i .iz-kapak adını taşımaya devam eder (g12/g23 seçici sözleşmesi).
    // data-ad/data-yazar: yükleme hatasında plateKapakYedek metni buradan alır (v44).
    const imgSinif = sinif === 'iz-plate' ? 'iz-kapak' : 'plate-img';
    // M1 (v69): OpenLibrary URL'sine istek anında ?default=false — çekirdeğin
    // kapakSrc süzgeci (tek yol); çekirdek bir şekilde yoksa URL olduğu gibi kalır.
    const kSrc = window.kapakSrc ? window.kapakSrc(k.kapak) : k.kapak;
    const veriNitelik = ' data-ad="' + kacir(k.ad) + '"' +
      (k.yazar ? ' data-yazar="' + kacir(k.yazar) + '"' : '');
    if(k.kapakYerel && window.__kapak)
      return '<div class="plate ' + sinif + '"' + veriNitelik + '><img class="' + imgSinif + ' kp-bekliyor" data-kp-id="' + kacir(k.id) + '"' +
        (k.kapak ? ' data-kp-yedek="' + kacir(kSrc) + '"' : '') + ' alt=""></div>';
    if(k.kapak)
      return '<div class="plate ' + sinif + '"' + veriNitelik + '><img class="' + imgSinif + '" src="' + kacir(kSrc) + '" alt="" loading="lazy"></div>';
    if(sinif === 'iz-plate')
      return '<div class="plate iz-plate p-bos"><div class="iz-yedek">' + kacir(k.ad) + '</div></div>';
    return '<div class="plate ' + sinif + ' p-bos" aria-hidden="true"></div>';
  }
  const DURUM_SINIF = { okunuyor:'d-okunuyor', bitti:'d-bitti', okunacak:'d-okunacak', yarim:'d-yarim' };
  const DURUM_KISA = { okunuyor:'Okunuyor', bitti:'Okundu', okunacak:'Okunacak', yarim:'Yarım' };
  function kartHtml(k){
    const istek = k.sahiplik === 'istek' ? '<div class="vm-iz-istek">İstek</div>' : '';
    const dS = DURUM_SINIF[k.durum] || '';
    // Okunmuş işaret: sessiz ✓ (SVG onay) + "Okundu" — v40'ın sönükleştirmesi emekli
    const dIk = k.durum === 'bitti' ? ik('onay') : '';
    return '<button class="kart' + (k.durum === 'bitti' ? ' iz-okundu' : '')
      + '" data-act="detay" data-id="' + k.id + '" style="position:relative">' +
      plateHtml(k, 'iz-plate') + istek +
      '<div class="kart-ic"><div class="kart-baslik">' + kacir(k.ad) + '</div>' +
      (k.yazar ? '<div class="kart-yazar">' + kacir(k.yazar) + '</div>' : '') +
      '<div class="iz-durum ' + dS + '">' + dIk + (DURUM_KISA[k.durum] || '') + '</div>' +
      '</div></button>';
  }
  function yogunHtml(k){
    const dS = DURUM_SINIF[k.durum] || '';
    const dIk = k.durum === 'bitti' ? ik('onay') : '';
    return '<button class="kart' + (k.durum === 'bitti' ? ' iz-okundu' : '')
      + '" data-act="detay" data-id="' + k.id + '" style="position:relative">' +
      plateHtml(k, 'yg-plate') +
      '<div class="kart-ic"><span class="kart-baslik">' + kacir(k.ad) + '</span>' +
      (k.yazar ? '<span class="kart-yazar">' + kacir(k.yazar) + '</span>' : '') +
      '<span class="yg-durum ' + dS + '">' + dIk + (DURUM_KISA[k.durum] || '') + '</span>' +
      '</div></button>';
  }

  function secimAc(id){
    secimModu = true;
    secilenler = new Set(id ? [id] : []);
    cubukCiz(); secimGorselTazele();
  }
  function secimKapat(){
    secimModu = false; secilenler.clear();
    const c = document.getElementById('topluCubuk');
    if(c) c.remove();
    secimGorselTazele();
  }
  function secimGorselTazele(){
    document.querySelectorAll('#liste .kart').forEach(kart => {
      const id = kart.dataset.id;
      const eski = kart.querySelector('.secim-isaret');
      if(eski) eski.remove();
      kart.classList.toggle('secili', secimModu && secilenler.has(id));
      if(secimModu && secilenler.has(id)){
        kart.style.position = 'relative';
        const i = document.createElement('div');
        i.className = 'secim-isaret';
        i.innerHTML = ik('onay') || '✓';
        kart.appendChild(i);
      }
    });
    cubukSayiTazele();
  }
  function cubukCiz(){
    if(document.getElementById('topluCubuk')) return;
    const c = document.createElement('div');
    c.className = 'toplu-cubuk'; c.id = 'topluCubuk';
    c.innerHTML =
      '<span class="sayi" id="topluSayi">0 seçili</span>' +
      '<button data-act="toplu-tumu">Tümü</button>' +
      '<button data-act="toplu-raf">Raf ata</button>' +
      '<button data-act="toplu-etiket">Etiket</button>' +
      '<button data-act="toplu-durum">Durum</button>' +
      '<button class="tehlike" data-act="toplu-sil">Sil</button>' +
      '<button data-act="toplu-cik">Çık</button>';
    document.body.appendChild(c);
  }
  function cubukSayiTazele(){
    const el = document.getElementById('topluSayi');
    if(el) el.textContent = secilenler.size + ' seçili';
  }

  function pencereAc(baslik, icerik, act){
    let o = document.getElementById('topluOrtu');
    if(!o){
      o = document.createElement('div');
      o.className = 'ortu'; o.id = 'topluOrtu';
      document.body.appendChild(o);
      o.addEventListener('click', e => { if(e.target === o) o.classList.remove('acik'); });
    }
    o.innerHTML = '<div class="sheet">' +
      '<div class="tutamac"></div>' +
      '<button class="sheet-kapat" data-act="toplu-kapat" aria-label="Kapat">✕</button>' +
      '<div class="sheet-baslik">' + baslik + '</div>' +
      icerik +
      '<div class="form-alt">' +
        '<button class="btn btn-cerceve" data-act="toplu-kapat" style="flex:1">Vazgeç</button>' +
        '<button class="btn btn-brass" data-act="' + act + '" style="flex:2">Uygula</button>' +
      '</div></div>';
    o.classList.add('acik');
  }

  function topluRafAc(){
    const mevcut = new Set();
    (veri.kitaplar||[]).forEach(k => { if(k.raf) mevcut.add(k.raf); });
    pencereAc('Raf ata (' + secilenler.size + ' kitap)',
      '<label for="topluRafGiris">Raf konumu</label>' +
      '<input id="topluRafGiris" list="topluRafListe" placeholder="ör. üst raf sol blok" autocomplete="off">' +
      '<datalist id="topluRafListe">' +
        [...mevcut].sort((a,b)=>a.localeCompare(b,'tr')).map(r => '<option value="'+kacir(r)+'">').join('') +
      '</datalist>' +
      '<div class="mini-not">Boş bırakıp kaydedersen raf bilgisi silinir.</div>',
      'toplu-raf-uygula');
  }
  function topluEtiketAc(){
    const mevcut = new Set();
    (veri.kitaplar||[]).forEach(k => (k.etiketler||[]).forEach(e => mevcut.add(e)));
    pencereAc('Etiket ekle (' + secilenler.size + ' kitap)',
      '<label for="topluEtiketGiris">Etiketler (virgülle ayır)</label>' +
      '<input id="topluEtiketGiris" list="topluEtiketListe" placeholder="ör. felsefe, tekrar-okunacak" autocomplete="off">' +
      '<datalist id="topluEtiketListe">' +
        [...mevcut].sort((a,b)=>a.localeCompare(b,'tr')).map(r => '<option value="'+kacir(r)+'">').join('') +
      '</datalist>' +
      '<div class="mini-not">Mevcut etiketler korunur, bunlar eklenir.</div>',
      'toplu-etiket-uygula');
  }
  function topluDurumAc(){
    pencereAc('Durum değiştir (' + secilenler.size + ' kitap)',
      '<label for="topluDurumSec">Yeni durum</label>' +
      '<select id="topluDurumSec">' +
        '<option value="okunacak">Okunacak</option>' +
        '<option value="okunuyor">Okunuyor</option>' +
        '<option value="bitti">Bitti</option>' +
        '<option value="yarim">Yarım kaldı</option>' +
      '</select>' +
      '<div class="mini-not">Bitti seçersen bitiş tarihi bugün olarak yazılır (tarihi olmayanlara).</div>',
      'toplu-durum-uygula');
  }

  function secilenKitaplar(){
    return [...secilenler].map(kitapBulL).filter(Boolean);
  }
  function kaydetVeTazele(mesaj){
    if(typeof depoKaydet === 'function') depoKaydet();
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    const o = document.getElementById('topluOrtu');
    if(o) o.classList.remove('acik');
    bildir(mesaj);
    setTimeout(() => { duzenTazele(); secimGorselTazele(); }, 0);
  }

  function duzenTazele(){
    const kap = document.getElementById('liste');
    if(kap){
      kap.classList.toggle('izgara', duzen === 'izgara');
      kap.classList.toggle('yogun', duzen === 'yogun');
    }
    if(duzen === 'izgara') izgaraCiz();
    else if(duzen === 'yogun') yogunCiz();
    else listeGrupla();
    duzenDugmeTazele();
    grupDugmeTazele();
  }
  function listeyiBagla(){
    if(typeof window.listeCiz === 'function' && !window.listeCiz.__gorunum){
      const asil = window.listeCiz;
      const sarmal = function(){
        const s = asil.apply(this, arguments);
        dugmeEkle();
        duzenTazele();
        secimGorselTazele();
        return s;
      };
      sarmal.__gorunum = true;
      window.listeCiz = sarmal;
    }
  }

  function baslat(){
    ayarYukle(); stilEkle(); listeyiBagla(); dugmeEkle(); duzenTazele();

    document.addEventListener('click', e => {
      if(!secimModu) return;
      const kart = e.target.closest('#liste .kart');
      if(!kart) return;
      e.preventDefault(); e.stopPropagation();
      const id = kart.dataset.id;
      if(secilenler.has(id)) secilenler.delete(id); else secilenler.add(id);
      secimGorselTazele();
    }, true);

    const basla = e => {
      const kart = e.target.closest('#liste .kart');
      if(!kart || secimModu) return;
      basmaId = kart.dataset.id;
      basmaZaman = setTimeout(() => {
        if(basmaId){ secimAc(basmaId); bildir('Seçim modu — kartlara dokunarak seç'); }
      }, 550);
    };
    const bitir = () => { clearTimeout(basmaZaman); basmaId = null; };
    document.addEventListener('touchstart', basla, { passive: true });
    document.addEventListener('touchend', bitir);
    document.addEventListener('touchmove', bitir, { passive: true });
    document.addEventListener('mousedown', basla);
    document.addEventListener('mouseup', bitir);

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      const act = el.dataset.act;

      if(act === 'duzen-sec'){
        const v = el.dataset.v;
        if(DUZENLER.indexOf(v) >= 0 && v !== duzen){
          duzen = v; ayarYaz();
          if(typeof listeCiz === 'function') listeCiz();
        }
        return;
      }
      if(act === 'grup-sec'){
        const v = el.dataset.v;
        if(GRUPLAR.indexOf(v) >= 0){
          grup = (grup === v) ? '' : v;   // aynı eksene dokunmak gruplamayı kapatır
          ayarYaz();
          if(typeof listeCiz === 'function') listeCiz();
        }
        return;
      }
      if(act === 'secim-ac'){ secimModu ? secimKapat() : secimAc(null); return; }
      if(act === 'toplu-cik'){ secimKapat(); return; }
      if(act === 'toplu-kapat'){
        const o = document.getElementById('topluOrtu');
        if(o) o.classList.remove('acik');
        return;
      }
      if(act === 'toplu-tumu'){
        const hepsi = [...document.querySelectorAll('#liste .kart')].map(k => k.dataset.id).filter(Boolean);
        if(secilenler.size === hepsi.length) secilenler.clear();
        else hepsi.forEach(id => secilenler.add(id));
        secimGorselTazele();
        return;
      }
      if(secilenler.size === 0 &&
         ['toplu-raf','toplu-etiket','toplu-durum','toplu-sil'].indexOf(act) >= 0){
        bildir('Önce kitap seç'); return;
      }
      if(act === 'toplu-raf'){ topluRafAc(); return; }
      if(act === 'toplu-etiket'){ topluEtiketAc(); return; }
      if(act === 'toplu-durum'){ topluDurumAc(); return; }
      if(act === 'toplu-sil'){
        const n = secilenler.size;
        if(!confirm(n + ' kitap kalıcı olarak silinsin mi? Notları ve oturumları da silinir.')) return;
        veri.silinenler = veri.silinenler || {};
        const t = Date.now();
        secilenler.forEach(id => {
          veri.silinenler[id] = t;
          if(window.__kapak) window.__kapak.sil(id); // kapak fotoğrafları yetim kalmasın
        });
        veri.kitaplar = veri.kitaplar.filter(k => !secilenler.has(k.id));
        secilenler.clear();
        kaydetVeTazele(n + ' kitap silindi');
        secimKapat();
        return;
      }
      if(act === 'toplu-raf-uygula'){
        const raf = (document.getElementById('topluRafGiris')||{}).value || '';
        const ks = secilenKitaplar();
        ks.forEach(k => { k.raf = raf.trim(); k.g = Date.now(); });
        kaydetVeTazele(ks.length + ' kitaba raf yazıldı');
        return;
      }
      if(act === 'toplu-etiket-uygula'){
        const ham = (document.getElementById('topluEtiketGiris')||{}).value || '';
        const yeni = ham.split(',').map(x => x.trim().replace(/^#/,'')).filter(Boolean);
        if(!yeni.length){ bildir('Etiket yaz'); return; }
        const ks = secilenKitaplar();
        ks.forEach(k => {
          k.etiketler = Array.isArray(k.etiketler) ? k.etiketler : [];
          yeni.forEach(e => {
            // etikette yalnız i-ailesi katlanır (fikir.js ile aynı karar)
            const iKat = s => (typeof iKatla === 'function') ? iKatla(s)
              : String(s ?? '').toLocaleLowerCase('tr');
            const var_ = k.etiketler.some(x => iKat(x) === iKat(e));
            if(!var_) k.etiketler.push(e);
          });
          k.g = Date.now();
        });
        kaydetVeTazele(ks.length + ' kitaba etiket eklendi');
        return;
      }
      if(act === 'toplu-durum-uygula'){
        const d = (document.getElementById('topluDurumSec')||{}).value || 'okunacak';
        const ks = secilenKitaplar();
        const bgn = typeof bugun === 'function' ? bugun() : null;
        ks.forEach(k => {
          const eskiGS = k.guncelSayfa;
          k.durum = d;
          if(d === 'bitti'){
            if(!k.bitisTarihi) k.bitisTarihi = bgn;
            if(k.sayfa) k.guncelSayfa = k.sayfa;
          }
          if(d === 'okunuyor' && !k.baslamaTarihi) k.baslamaTarihi = bgn;
          if(d === 'okunacak'){ k.guncelSayfa = 0; k.baslamaTarihi = null; k.bitisTarihi = null; }
          if(k.guncelSayfa !== eskiGS) k.gsG = Date.now();  // kullanıcı eliyle sayfa değişti (senkron gsG)
          k.g = Date.now();
        });
        kaydetVeTazele(ks.length + ' kitabın durumu değişti');
        return;
      }
    });
  }

  if(document.getElementById('liste')) baslat();
  else document.addEventListener('DOMContentLoaded', baslat);

  window.__gorunum = { secimAc, secimKapat, izgaraCiz, duzenTazele,
    izgaraTazele: duzenTazele,           // eski ad — geriye dönük API
    rafDugmeTazele: grupDugmeTazele,     // eski ad — geriye dönük API
    secilenler: () => secilenler,
    izgaraMi: () => duzen === 'izgara',
    duzenMi: () => duzen,
    grupMu: () => grup,
    izgaraYaz: v => { duzen = v ? 'izgara' : 'liste'; ayarYaz(); },
    duzenYaz: v => { if(DUZENLER.indexOf(v) >= 0){ duzen = v; ayarYaz(); } },
    grupYaz: v => { grup = (GRUPLAR.indexOf(v) >= 0) ? v : ''; ayarYaz(); },
    rafGruplaYaz: v => { grup = v ? 'raf' : (grup === 'raf' ? '' : grup); ayarYaz(); } };
})();
