'use strict';
/* Kitaplık — KEŞFET sekmesi A aşaması (ad alanı: ks-), v50.
   "Rafından ne okusam": öneri motorunun TAM EKRAN hali. Motor oneri.js'te
   (window.__oneri) — burada YALNIZ görünüm + süzgeç durumu yaşar:
   hesaplaHam() ham sıralı listeyi verir; süzgeç → cesitlilikSec (yazar≤2)
   → nedenAta (gerekçe; tekillik GÖRÜNEN listede) → çizim. Ana Sayfa SIRADAKİ
   aynı motorun kırpılmış sarmalayıcısını (hesapla) kullanır — kopya gerekçe
   mantığı YOK (bu projede tekrar eden hata deseninin panzehiri).

   UZUNLUK EŞİKLERİ (karar): kısa <200 · orta 200-400 · uzun >400 sayfa —
   novella / standart roman / tuğla ayrımının yaygın yayıncılık eşikleri.
   Kütüphane-medyanına bağlı dinamik eşik hem açıklanamaz hem test-kararsız
   olurdu. Sayfası bilinmeyen kitap uzunluk süzgeci AÇIKKEN listeye girmez:
   bilinmeyeni bir kovaya saymak uydurma olur.

   SKOR GÖSTERİMİ (karar): ham sayı YOK — Ciltli'nin tek ilerleme kalıbı
   (3px altın konturlu kanal, 64px). Görünen liste içinde min-maks normalize,
   %10-100 kelepçe (eski panel dersi: geçersiz width bar'ı tam dolu gösterirdi).
   Az-veri modunda skor yok → çizgi hiç çizilmez. */
(function(){
  const SAYFA_ADIMI = 10;
  /* M3 (v69): aday havuzu bu eşiğin ALTINDAysa (ve kütüphanede kayda değer
     sayıda 'bitti' varsa) dürüst yönlendirme notu çıkar — Goodreads aktarımı
     çoğu kitabı 'bitti' işaretler, okunmamışlar da öyle kalmış olabilir.
     Eşik = ANA_SAYI (5): varsayılan öneri listesini bile dolduramayan havuz
     "az" sayılır. Aday yeterliyse not HİÇ görünmez. */
  const AZ_ADAY_ESIK = 5;
  const AZ_ADAY_BITTI_TABAN = 10;   // bu kadar 'bitti' yoksa yönlendirme anlamsız
  const UZUNLUK_AD = { kisa: 'Kısa', orta: 'Orta', uzun: 'Uzun' };
  const UZUNLUK_IPUCU = { kisa: '200 sayfadan az', orta: '200–400 sayfa', uzun: '400 sayfadan çok' };
  function uzunlukKova(sayfa){
    if(!(sayfa > 0)) return null;              // bilinmeyen: hiçbir kovaya girmez
    return sayfa < 200 ? 'kisa' : sayfa <= 400 ? 'orta' : 'uzun';
  }
  // süzgeç + liste durumu (cihaz-yerel, oturumluk — kalıcı tercih değil)
  const S = { sahiplik: 'sahip', tur: null, uzunluk: null, raf: null,
    limit: SAYFA_ADIMI, erteliAcik: false, gizliAcik: false };

  const CSS = [
    '#ksIcerik{padding:2px 16px 24px}',
    '.ks-ust{display:flex;align-items:flex-start;gap:10px;padding:0 0 4px}',
    '.ks-ust-ic{flex:1;min-width:0}',
    '.ks-baslik{font-family:var(--serif);font-size:1.8rem;font-weight:400;line-height:1.15;margin-top:2px}',
    '.ks-acilis{font-size:.78rem;color:var(--muted);margin-top:4px;letter-spacing:.02em;font-variant-numeric:tabular-nums}',
    '.ks-ust .zar-btn{flex:0 0 40px;height:40px;margin-top:6px}',
    '.ks-suz{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:6px 0;align-items:center}',
    '.ks-suz::-webkit-scrollbar{display:none}',
    '.ks-suz-ad{font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);flex:0 0 auto;margin-right:2px}',
    '.ks-chip{flex:0 0 auto;padding:7px 12px;border:1px solid var(--kontur);border-radius:var(--r-sm);' +
      'font-size:.78rem;color:var(--muted);background:transparent;white-space:nowrap}',
    // seçili çip metni PAPER: brass metin %7 tint üzerinde 4.23'e düşüyor (AA
    // kaçağı — g42 doğru renk çözücüyle ölçünce çıktı); seçililiği kontur +
    // tint + ağırlık verir, metin okunur kalır.
    '.ks-chip.secili{border-color:var(--brass);color:var(--paper);font-weight:600;' +
      'background:color-mix(in srgb,var(--brass) 7%,transparent)}',
    '.ks-item,.ks-b-item{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--cizgi)}',
    '.ks-ic{flex:1;min-width:0}',
    '.ks-ad{display:block;font-family:var(--serif);font-size:1.05rem;font-weight:600;line-height:1.25;' +
      'text-align:left;overflow-wrap:break-word;padding:0;background:none;border:none;color:var(--paper)}',
    '.ks-yazar,.ks-b-yazar{font-style:italic;font-size:.78rem;color:var(--muted);margin-top:1px}',
    '.ks-neden,.ks-b-neden{font-size:.8rem;color:var(--muted2);line-height:1.5;margin-top:4px}',
    '.ks-skor{display:block;width:64px}',
    '.ks-eylem{display:flex;gap:16px;margin-top:8px;align-items:center}',
    '.ks-basla,.ks-b-ekle{font-family:var(--serif);font-weight:600;font-size:.8rem;color:var(--brass);' +
      'padding:2px 0;position:relative;background:none;border:none}',
    '.ks-basla::after,.ks-b-ekle::after{content:"";position:absolute;inset:-8px}',
    '.ks-sessiz,.ks-b-gizle{font-size:.78rem;color:var(--muted);text-decoration:underline;text-underline-offset:3px;' +
      'text-decoration-color:var(--muted2);padding:2px 0;background:none;border:none}',
    '.ks-rozet{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--brass)}',
    '.ks-not{font-size:.85rem;color:var(--muted);line-height:1.5;padding:14px 0}',
    '.ks-daha{margin-top:14px}',
    '.ks-erteli,.ks-gizli{padding:14px 0}',
    '.ks-erteli-item{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:10px 0;border-bottom:1px solid var(--cizgi);font-size:.85rem;color:var(--muted)}',
    '.ks-erteli-ad{flex:1;min-width:0;overflow-wrap:break-word}',
    '.ks-erteli-sag{display:flex;align-items:center;gap:12px;white-space:nowrap}',
    '.ks-erteli-gun{font-size:.72rem;color:var(--muted2);font-variant-numeric:tabular-nums}',
    // ---- B bölümü: YENİ KİTAPLAR (kütüphane-dışı; v51) ----
    '.ks-b-bas{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:16px 0 6px;margin-top:8px;border-top:1px solid var(--cizgi)}',
    '.ks-b-ad{display:block;font-family:var(--serif);font-size:1.05rem;font-weight:600;' +
      'line-height:1.25;overflow-wrap:break-word}',
    '.ks-b-not{font-size:.85rem;color:var(--muted);line-height:1.5;padding:10px 0}',
    '.ks-b-getir{margin-top:8px}',
    '.ks-b-daha{margin-top:8px}',
    // Kaynak etiketi: .ks-suz-ad ile AYNI tipografik rol (mikro versal, muted2)
    // — yeni bir görsel dil değil, kurulmuş bir rolün ikinci kullanımı.
    '.ks-b-kaynak{display:block;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;' +
      'color:var(--muted2);margin-bottom:2px}',
    // Süzgeç sayım satırı (v77): "Rafından" açılış cümlesiyle AYNI rol —
    // kaç aday vardı / kaçı geçti, sayı uydurmadan.
    '.ks-b-sayim{font-size:.78rem;color:var(--muted);letter-spacing:.02em;' +
      'font-variant-numeric:tabular-nums;padding:2px 0 8px}'
  ].join('\n');

  function chip(grup, deger, etiket, secili, ipucu){
    return '<button class="ks-chip' + (secili ? ' secili' : '') + '" data-act="ks-suz"' +
      ' data-g="' + grup + '" data-v="' + escAttr(deger) + '"' +
      (ipucu ? ' title="' + escAttr(ipucu) + '"' : '') + '>' + esc(etiket) + '</button>';
  }

  function ustHtml(h, havuz, filtreliN, elemeNotu){
    const okunacakVar = typeof veri === 'object' && veri.kitaplar.some(k => k.durum === 'okunacak');
    const suzVar = S.tur || S.uzunluk || S.raf;
    const havuzN = havuz.length;
    // M3 (v69): havuzda yarım kalan varsa açılış cümlesi bileşimi SAYIYLA söyler;
    // yarım yoksa cümleler eskisiyle BİREBİR aynı (mevcut vakalar değişmez).
    const yarimN = havuz.filter(o => o.kitap.durum === 'yarim').length;
    const havuzAdi = yarimN
      ? havuzN + ' aday (' + (havuzN - yarimN) + ' okunacak · ' + yarimN + ' yarım kalan)'
      : havuzN + ' okunacak aday';
    // açılış cümlesi DÜRÜST: kaç aday, süzgeç kaçını geçirdi (sayı uydurma yok);
    // çeşitlilik kotası aday elediyse o da SÖYLENİR (v62 — "6 diyor, 5 var" bitti)
    const acilis = (!havuzN
      ? 'Okunacak aday yok'
      : h.mod === 'az-veri'
        ? havuzAdi + ' — şimdilik bekleme sırasına göre'
        : suzVar
          ? havuzN + ' aday · süzgeçten geçen: ' + filtreliN
          : havuzAdi + ' arasından, okuma geçmişine göre') + (elemeNotu || '');
    return '<div class="ks-ust"><div class="ks-ust-ic">' +
      '<span class="kicker">Rafından</span>' +
      '<h2 class="ks-baslik">Ne okusam?</h2>' +
      '<div class="ks-acilis">' + esc(acilis) + '</div></div>' +
      (okunacakVar ? '<button class="zar-btn" data-act="zar" title="Kader seçsin" ' +
        'aria-label="Okunacaklardan rastgele kitap öner">' +
        (window.ikon ? ikon('zar') : '') + '</button>' : '') +
      '</div>';
  }

  function suzgecHtml(turler, raflar){
    let html = '<div class="ks-suz"><span class="ks-suz-ad">Süz</span>' +
      chip('sahiplik', 'sahip', 'Bende', S.sahiplik === 'sahip') +
      chip('sahiplik', 'istek', 'İstek listem', S.sahiplik === 'istek') +
      Object.keys(UZUNLUK_AD).map(u =>
        chip('uzunluk', u, UZUNLUK_AD[u], S.uzunluk === u, UZUNLUK_IPUCU[u])).join('') +
      '</div>';
    if(turler.length)
      html += '<div class="ks-suz"><span class="ks-suz-ad">Tür</span>' +
        /* v91: çip DEĞERİ ham tür (süzgeç eşleşmesi k.tur ile), etiketi görünen ad */
        turler.map(t => chip('tur', t, turGoster(t), S.tur === t)).join('') + '</div>';
    if(raflar.length)
      html += '<div class="ks-suz"><span class="ks-suz-ad">Raf</span>' +
        raflar.map(r => chip('raf', r, r, S.raf === r)).join('') + '</div>';
    return html;
  }

  function satirHtml(o, enY, enD){
    const k = o.kitap;
    let cizgi = '';
    if(o.skor !== null){
      const aralik = (enY - enD) || 1;
      const yuzde = Math.max(10, Math.min(100, Math.round(((o.skor - enD) / aralik) * 90 + 10)));
      if(Number.isFinite(yuzde))
        cizgi = '<span class="ilerleme ks-skor" role="img" aria-label="uygunluk göstergesi">' +
          '<span style="display:block;height:100%;background:var(--brass);width:' + yuzde + '%"></span></span>';
    }
    // M3 (v69): yarım kalan aday ROZETLE ayrılır, eylemi "Devam et"
    // (ilerleme korunur — basla guncelSayfa'ya dokunmaz)
    const yarimRozet = k.durum === 'yarim'
      ? '<span class="ks-rozet ks-yarim">Yarım bıraktığın</span>' : '';
    const eylem = (k.sahiplik === 'istek')
      ? yarimRozet + '<span class="ks-rozet">İstek listende</span>'
      : yarimRozet + '<button class="ks-basla" data-act="ks-basla" data-id="' + escAttr(k.id) + '">' +
        (k.durum === 'yarim' ? 'Devam et' : 'Okumaya başla') + '</button>';
    return '<div class="ks-item">' +
      (typeof ktPlate === 'function' ? ktPlate(k, 'p-mini') : '') +
      '<div class="ks-ic">' +
        '<button class="ks-ad" data-act="detay" data-id="' + escAttr(k.id) + '">' + esc(k.ad) + '</button>' +
        (k.yazar ? '<div class="ks-yazar">' + esc(k.yazar) + '</div>' : '') +
        (o.neden ? '<div class="ks-neden">' + esc(o.neden) + '</div>' : '') +
        cizgi +
        '<div class="ks-eylem">' + eylem +
          '<button class="ks-sessiz" data-act="ks-ertele" data-id="' + escAttr(k.id) + '">Şimdi değil</button>' +
        '</div>' +
      '</div></div>';
  }

  /* ---------- B bölümü: YENİ KİTAPLAR (v51, tür kaynağı v52) ----------
     Kütüphanede OLMAYAN kitaplar; sinyaller SERİ + YAZAR + TÜR. TEMBEL: Keşfet
     açılışı sorgu ATMAZ (Rafından anlık kalsın, kota kullanıcı niyetine
     harcansın); kullanıcı "Yeni kitapları getir" der ya da taze önbellek varsa
     (ağ maliyeti sıfır) doğrudan gösterilir. Sorgular window.__ara üzerinden
     (canliAra ile AYNI kaynak yolu — kopya istemci yok).
     SIRA seri → yazar → tür: motorun kendi ağırlık sırası (seri 35 > yazar 30 >
     tür 20). Tür en zayıf sinyal, listenin sonunda durur. */
  /* v77: anahtar v1 -> v2. Adaylara TÜR MÜHRÜ eklendi (turSinyal/turKaynakAd/
     seriAd); v1 önbelleğindeki mühürsüz tür adayları yeni süzgeçte "türü
     bilinmeyen" sayılıp elenirdi. Bir kerelik yeniden sorgu (<=6 Google
     isteği) 24 saatlik yanlış görünüme yeğlenir; eski kova silinir. */
  const B_ONBELLEK = 'kk_kesfet_b_v2';
  try{ localStorage.removeItem('kk_kesfet_b_v1'); }catch(e){ /* eski önbellek kalabilir, zararsız — sessiz geçiş kasıtlı */ }
  /* TTL 24 saat: Google kotası günlük, yazar kataloğu günlük değişmez. Anahtar
     İMZA sorgu setinden (yazar+seri katla'lı) — kütüphane değişip sinyal seti
     değişirse önbellek kendiliğinden düşer. Cihaz-yerel, senkron DIŞI
     (türetilmiş veri DERIVED yazılmaz — W1 ilkesi). */
  const B_TTL_MS = 24 * 3600 * 1000;
  /* Kota: koşum başına ≤3 yazar + ≤3 seri sorgusu (≤6 istek). Google 1000/gün;
     24 saatlik önbellekle gün başına tek sorgu seti — kota güvenli. */
  const B_YAZAR_KOTA = 3, B_SERI_KOTA = 3, B_YAZAR_ADAY = 8, B_SERI_ADAY = 8;
  /* TÜR KOTASI 2 (3 değil): tür motorun en zayıf sinyali (ağırlık 20 vs yazar
     30 / seri 35) ve 3. sıradaki tür zaten ilk ikisinin altında kalmış bir
     ortalamadır — listeyi uzatır, isabeti artırmaz. Maliyet tarafı bağlayıcı
     değil (worker Cloudflare ücretsiz katmanında, kaynak 1000Kitap'ın kendi
     API'si); bağlayıcı olan 9 sn'lik iptal bütçesi, o da tür dalının Google
     döngüsüyle ÖRTÜŞMESİYLE korunuyor. */
  const B_TUR_KOTA = 2, B_TUR_ADAY = 6;
  /* ADAY DERİNLİĞİ (M2): kaynak başına saklanan aday 3/4/4 → 8/8/6 ve Google
     sorgusu B yolunda maxResults 6 → 20. İkisi de İSTEK SAYISINI DEĞİŞTİRMEZ
     (koşum yine ≤6 istek); değişen, aynı yanıttan kaç adayın saklandığı.
     Gerekçe (ölçüldü 2026-08-20, gerçek GB, gerçek kütüphanenin 12 mononim
     yazarı): maxResults=6 ilk 6'da çoğu kez tek TR baskı bile getirmiyordu
     (Aristophanes 0/6 → 20'de 1); dar dilim v69'da Macbeth/Kral Lear'ı
     kesmişti. localStorage bedeli: en çok ~60 ham aday ≈ 30 KB. */
  const B_DERINLIK = 20;
  /* GÖRÜNEN LİSTE (M2): çizimde ilk B_GOSTER satır; kalanı "N öneri daha
     göster" düğmesi açar (B.acik). KAYNAK DENGESİ: kısaltılmış listede aktif
     kaynaklar öncelik sırasıyla (seri > yazar > tür — motorun sinyal-gücü
     sırası) taban payı alır, hiçbir kaynak diğerini boğamaz. AYNI-YAZAR
     sınırı B'de BİLİNÇLİ YOK (karar): yazar kaynağının varlık sebebi sevilen
     yazardan DAHA ÇOK kitap göstermek; çeşitliliği kaynak dengesi sağlar.
     Rafından'ın yazar≤2 kotası (cesitlilikSec) ELİNDEKİ kitaplar için ayrı
     karardır ve DEĞİŞMEDİ. */
  const B_GOSTER = 8;
  const B_KAYNAK_AD = { seri: 'Seri', yazar: 'Yazar', tur: 'Tür' };
  const B = { durum: 'bekliyor', adaylar: null, gorunen: [], acik: false };

  /* ---- kullanıcı türü → 1000Kitap tür slug'ı (v52) ----
     UYDURMA EŞLEME YOK. Dört kademe, ilk isabet kazanır; hiçbiri tutmazsa tür
     ATLANIR. Bulanık/edit-mesafeli eşleme bilinçli olarak YOK: "Tarih" ile
     "Tarihi"yi birbirine bağlayan bir kural sessizce yanlış türü sorar ve
     kullanıcı bunu gerekçe cümlesinden anlayamaz.
       1) katlanmış tam eşleşme — slug
       2) katlanmış tam eşleşme — görünen ad
       3) SÖZCÜK eşleşmesi — slug sözcükleri
       4) SÖZCÜK eşleşmesi — görünen ad sözcükleri
     Sözcük eşiği 3 harf, ÖLÇÜMLE seçildi: 78 türün sözcük envanterinde 3
     harfli olanların hepsi gerçek tür adı (din, tıp, anı, fal, aşk); tek
     anlamsız parçalar 2 harfli ("ve", "iş"), onlar da eşiğin altında kalıyor.
     Kaynak listesi KENDİ sırasında (1000Kitap'ın gösterim sırası) taranır —
     aynı kademede birden çok tür tutarsa popüler olan kazanır, sonuç
     deterministik. kitapSayisi=0 türler (78'in 8'i: novella, arkeoloji, uzay…)
     havuzdan düşer: boş türe sorgu atmak kotayı harcar, sonuç dönmez. */
  function turAnahtar(s){ return katla(s).replace(/[^a-z0-9]+/g, ''); }
  function turSozcukler(s){
    return String(s || '').split(/[^A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû0-9]+/)
      .map(turAnahtar).filter(w => w.length >= 3);
  }
  function turEslestir(kullaniciTur, kaynakTurler){
    const a = turAnahtar(kullaniciTur);
    if(!a || !Array.isArray(kaynakTurler)) return null;
    const havuz = kaynakTurler.filter(t => t && t.seo && t.ad && t.kitapSayisi !== 0);
    for(const t of havuz) if(turAnahtar(t.seo) === a) return t;
    for(const t of havuz) if(turAnahtar(t.ad) === a) return t;
    if(a.length >= 3){
      for(const t of havuz) if(turSozcukler(t.seo).indexOf(a) >= 0) return t;
      for(const t of havuz) if(turSozcukler(t.ad).indexOf(a) >= 0) return t;
    }
    return null;   // eşleşme yok → bu tür ATLANIR
  }

  /* ---- ALAKA DENETİMİ (v53) ----
     KUSUR: dönen adayın gerçekten sorgulanan yazara ait olduğu doğrulanmıyordu.
     Canlı kanıt: kütüphanede "Yazar 0" varken öneriler "YOLCU — Metin Yazar",
     "İç ses — Meçhul yazar", "Baharla gelen — Erhan Bener (Türk yazar)" oldu ve
     hepsine "Yazar 0: bitirdiğin 3 kitaba ortalama 9,0 verdin" gerekçesi asıldı.

     SORGU SÖZDİZİMİ ÇÖZÜM DEĞİL (ölçüldü, Google Books canlı):
       inauthor:Yazar 0    →   5 sonuç, hepsi adında "yazar" GEÇEN başka yazarlar
       inauthor:"Yazar 0"  → 117 sonuç, tamamen alakasız (Library of Congress…)
       inauthor:"Ali Kemal"→ "Ali Kemal Sunal", "Ali Kemal Saran"
     Yani tırnak işi DÜZELTMİYOR, kötüleştiriyor. Tek güvenilir savunma DÖNEN
     sonucun kendisini denetlemek. Sorgu biçimi bilerek DEĞİŞTİRİLMEDİ.

     ASİMETRİ (bu projede aramanın TERSİ): katla() yorumunda "kaçırmak yanlış
     eşleşmekten daha pahalı" yazar — orada kullanıcı KENDİ kitabını arıyor.
     Burada tersi geçerli: yanlış öneri görünür çöp ve yanlış bir iddia taşır
     ("bu senin sevdiğin yazarın kitabı"), kaçan öneri görünmez. Bu yüzden
     denetim KATI; şüphede olan aday elenir, doldurma yapılmaz. */
  const GENEL_YAZAR = ['yazar', 'anonim', 'kolektif', 'anonymous', 'unknown',
    'various', 'derleme', 'muhtelif', 'bilinmiyor', 'bilinmeyen', 'yok'];
  /* Parantezli ekler SÖKÜLÜR: Google Books hem ayırt edici not ("Erhan Bener
     (Türk yazar)") hem alternatif yazım ("Halil Cibran (Kahlil Gibran)") için
     kullanıyor; ikisi de soyadı denetimini yanlış yerden kırardı. */
  function adSozcukler(s, parantezKalsin){
    // parantezKalsin (M2): cilt-işareti denetimi "(Cilt 2)" gibi parantezli
    // işaretleri görmek zorunda — yazar ekleri için varsayılan söküm sürer.
    // Latin aksanlı harfler (À-ɏ; × ve ÷ aralık dışı) SÖZCÜĞÜN PARÇASIDIR
    // (M1, ölçüldü): eski sınıf "Molière"i è'den ikiye bölüyordu (["moli",
    // "re"]) — mononim yazar çok-sözcüklü sanılıyor, aksansız "Moliere"
    // yazımıyla hiç eşleşmiyordu. katla sonrası NFD aksan katlaması
    // ("molière"→"moliere") kaynakların iki yazımını da aynı köke indirir.
    return (parantezKalsin ? String(s || '') : String(s || '').replace(/\([^)]*\)/g, ' '))
      .split(/[^A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîûÀ-ÖØ-öø-ɏ0-9]+/)
      .map(w => katla(w).normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^a-z0-9]+/g, ''))
      .filter(Boolean);
  }
  /* Sorgulanabilirlik: hiç ANLAMLI sözcüğü olmayan ad kaynağa HİÇ sorulmaz —
     "Yazar 0", "Anonim", "Kolektif" gibi değerler kotayı harcar ve tanım gereği
     hiçbir gerçek eşleşme üretemez. (Tek harfli parçalar da anlamlı sayılmaz.) */
  function anlamliSozcukler(ad){
    return adSozcukler(ad).filter(w => w.length >= 2 && GENEL_YAZAR.indexOf(w) < 0);
  }
  function sorulabilirYazar(ad){ return anlamliSozcukler(ad).length > 0; }

  /* Yazar eşleşmesi — TR-katlamalı, iki kural:
     · ÇOK SÖZCÜKLÜ ad: adayın SON sözcüğü (soyadı) sorgununkiyle TAM eşleşmeli
       VE sorgunun ≥2 harfli tüm sözcükleri adayda geçmeli.
       - Soyadı TEK BAŞINA yetmez (vaka c): "Janet Asimov" ≠ "Isaac Asimov";
         Türkçede birçok ad aynı zamanda soyadıdır ("Yaşar Kemal"/"Kemal Tahir"),
         yalnız soyadına bakmak kütüphaneyi çapraz kirletirdi.
       - Son sözcük şartı, adayın FAZLADAN sözcüğünü ayırt eder: "Ali Kemal" →
         "Ali Kemal Sunal" ELENİR (başka kişi), ama "Fyodor Dostoyevski" →
         "Fyodor Mihayloviç Dostoyevski" GEÇER (göbek adı, aynı kişi).
       - Baş harfler (J.K.) alt küme şartına girmez: "J.K. Rowling" →
         "Joanne Rowling" geçer.
     · TEK SÖZCÜKLÜ ad (mononim, M1 — gerçek yedek + canlı GB ölçümüyle
       yeniden kuruldu; kütüphanedeki 12 mononim yazarın 12'si Batı formunda:
       Homer, Aristotle, Molière...). ÜÇ kabul biçimi:
       (1) birebir eşitlik ("Aristoteles");
       (2) çift-ad varyantı (v62): İLK sözcük eşit VE aday ≤2 sözcük
           ("Homeros Homer", "Aristotle Aristotle"). Eski hali uzunluk
           sınırsızdı — "Homeros Üzerine Denemeler" gibi adla BAŞLAYAN
           çok-sözcüklü çöp alanlar da geçiyordu (v53 vaka d'nin genel hali);
       (3) Batı tam-ad biçimi: aday ≥3 sözcük VE SON sözcük eşit ("Lucius
           Annaeus Seneca", "Jean Baptiste Molière" — canlı TR baskıların
           döndürdüğü biçimler, ölçüldü). İKİ sözcüklüde son-eşitlik BİLİNÇLİ
           YOK: "Ali" → "Sabahattin Ali" Türk ad+soyad düzenidir, kabulü
           mononim korumasını yıkardı. Ölçülen bedel: "Desiderius Erasmus"
           TR baskısı elenir — bilinen sınır, g45'te sözleşme vakası.
       Bağlaçlı aday ("Homeros ve Hesiodos") birden çok kişidir → elenir;
       '&' split'te kaybolduğu için HAM parçada denetlenir (v62 ŞÜPHE
       kapanışı: "Homeros & Hesiodos" da artık elenir).
     Aday alanı çok yazarlı olabilir ("Isaac Asimov, Ali Kaftan") — virgülle
     ayrılıp her parça ayrı denenir (aramaGoogle bu biçimi üretiyor).
     Parçanın PARANTEZ İÇİ eki AYRI AD VARYANTIDIR (M1): kaynak "Homeros
     (Homer)" yazarken kütüphane "Homer" kayıtlı olabilir (gerçek yedeğin
     durumu) — parantezi sökülmüş gövde + her parantez içeriği ayrı denenir;
     "Halil Cibran (Kahlil Gibran)" iki addan da yakalanır. */
  function yazarEslesir(sorguAd, adayAd){
    const s = adSozcukler(sorguAd);
    if(!s.length) return false;
    const soyad = s[s.length - 1];
    const govde = s.filter(w => w.length >= 2);
    for(const p of String(adayAd || '').split(',')){
      if(s.length === 1 && p.indexOf('&') >= 0) continue;   // çok-kişi işareti (bağlaç dengi)
      const varyantlar = [adSozcukler(p)];
      for(const ek of String(p).match(/\(([^)]*)\)/g) || [])
        varyantlar.push(adSozcukler(ek.slice(1, -1)));
      for(const a of varyantlar){
        if(!a.length) continue;
        if(s.length === 1){
          if(a.indexOf('ve') >= 0 || a.indexOf('and') >= 0 || a.indexOf('ile') >= 0) continue;
          if(a[0] === s[0] && a.length <= 2) return true;            // (1) birebir + (2) çift-ad
          if(a.length >= 3 && a[a.length - 1] === s[0]) return true; // (3) Batı tam-ad biçimi
          continue;
        }
        if(a[a.length - 1] !== soyad) continue;
        if(govde.every(w => a.indexOf(w) >= 0)) return true;
      }
    }
    return false;
  }
  /* Seri eşleşmesi: seri adının ≥2 harfli TÜM sözcükleri adayın BAŞLIĞINDA
     sözcük olarak geçmeli. Alt dizi değil sözcük eşleşmesi — "Ada" serisi
     "Adalet"i yakalamasın. Ölçülen gerekçe: `"Harry Potter" inauthor:"J.K.
     Rowling"` sorgusu "Ozan Beedle'ın Hikâyeleri" ve "Çağlar Boyu Quidditch"
     de döndürüyor; bunlar gerçek Rowling kitapları ama Harry Potter CİLDİ
     değil — "N. cildi eksik" gerekçesiyle sunulsalardı yanlış iddia olurdu.
     Denetlenemeyen seri adı (tümü tek harf) engellenmez. */
  function seriEslesir(seriAd, adayBaslik){
    const s = adSozcukler(seriAd).filter(w => w.length >= 2);
    if(!s.length) return true;
    const b = adSozcukler(adayBaslik);
    return s.every(w => b.indexOf(w) >= 0);
  }
  /* Başlık BENZERLİĞİ (M2, v69): kütüphanedeki kitabın başka dilde ya da alt
     başlıklı VARYANTI önerilmesin. Canlı kanıt: "Romeo and Juliet — William
     Shakespeare" raftayken YENİ KİTAPLAR "Romeo ve Juliet — William Shakespeare"
     önerdi (birebir ad+yazar elemesi vardı, varyant elemesi yoktu).
     Kural: yazar eşleşiyorsa (yazarEslesir — TEK yardımcı) iki başlıktan
     bağlaç/edat atılır; KISA başlığın sözcüklerinin uzun başlıkta bulunma oranı
     >= 0.8 ise aynı kitap sayılır.
     Eşik gerekçesi (0.8): çeviri/alt başlık varyantında kısa taraf uzunun içinde
     TAMAMEN yaşar (oran 1.0); aynı yazarın kardeş eserleri düşük kalır ("Kral
     Lear"/"Kral Oidipus" 0.5, "Ateşi Çalmak 1"/"Ateşi Çalmak 2" 0.67, Harry
     Potter ciltleri 0.5). 0.8 yalnız >=5 sözcüklü başlıklarda tek sözcük
     farkına tolerans bırakır (uzun alt başlığın yeniden yazımı).
     TEK anlamlı sözcük kala kalan kısa başlıkta oran kuralı çöker ("Dune",
     "Dune Mesihi"nin içinde yaşar; seri cildi yanlış elenirdi) → iki taraf da
     tek sözcükse tam eşitlik istenir, değilse benzer sayılmaz.
     BİLİNÇLİ SINIR: iki dildeki başlıklar HİÇ ortak sözcük taşımıyorsa
     ("Suç ve Ceza" / "Crime and Punishment") sözcük örtüşmesi bunu göremez —
     çeviri sözlüğü uydurulmaz, vaka sınır olarak raporlanır. */
  const AD_BAGLAC = ['ve', 'ile', 'ya', 'veya', 'and', 'the', 'of', 'a', 'an', 'or'];
  const AD_BENZERLIK_ESIK = 0.8;
  function adAnlamli(ad, parantezKalsin){
    return adSozcukler(ad, parantezKalsin).filter(w => AD_BAGLAC.indexOf(w) < 0);
  }
  /* CİLT İŞARETİ (taze-göz kusuru): numarasız ilk cilt raftayken numaralı devam
     cildi alt-küme sayılıp eleniyordu ("İnce Memed"/"İnce Memed 2" oran 1.0) —
     eksik-seri önerisinin TAM HEDEFİ sessizce bastırılırdı. İki başlığın FARKI
     rakam / romen rakamı / "cilt" taşıyorsa bu varyant değil SERİ CİLDİDİR,
     elenmez. Romen ≥2 harf ("V" tek başına başlık adı olabilir). Denetim
     parantez-KORUNMUŞ sözcüklerle yapılır ("(Cilt 2)" sökülürse işaret görünmez
     olurdu). BİLİNEN SINIR: yazıyla cilt adı ("İki Kule") işaret sayılmaz. */
  function ciltIsareti(w){
    return /^\d+$/.test(w) || w === 'cilt' || (w.length >= 2 && /^[ivxlcdm]+$/.test(w));
  }
  function adBenzer(adA, adB){
    const tamA = new Set(adAnlamli(adA, true)), tamB = new Set(adAnlamli(adB, true));
    const fark = [...tamA].filter(w => !tamB.has(w))
      .concat([...tamB].filter(w => !tamA.has(w)));
    if(fark.some(ciltIsareti)) return false;
    // oran YİNELENMEMİŞ sözcük kümeleriyle (taze-göz: "Deniz Deniz" ham uzunluk
    // 2 ile tek-sözcük korumasını deliyordu)
    const A = [...new Set(adAnlamli(adA))], B = [...new Set(adAnlamli(adB))];
    if(!A.length || !B.length) return false;
    const kisa = A.length <= B.length ? A : B;
    const uzun = A.length <= B.length ? B : A;
    if(kisa.length === 1) return uzun.length === 1 && kisa[0] === uzun[0];
    const set = new Set(uzun);
    let ortak = 0;
    kisa.forEach(w => { if(set.has(w)) ortak++; });
    return ortak / kisa.length >= AD_BENZERLIK_ESIK;
  }

  /* Sayı biçimi DETERMİNİSTİK (toLocaleString değil): ICU sürümüne göre
     değişmeyen tek doğru çıktı — 138762 → "138.762", 8.45 → "8,5". */
  function binlik(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function ondalik(n){ return (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }
  /* Gerekçe İKİ YARIM, ikisi de gerçek veri:
       [kullanıcı]  "Felsefe türünde 12 kitap bitirdin, ortalama 8,4 verdin"
       [kaynak]     "1000Kitap'ta 138.762 okur, ★8,5"
     Kullanıcının kendi tür etiketi 1000Kitap'ınkinden FARKLIYSA bu açıkça
     yazılır ("… Felsefe-Düşünce içinde …"): eşleştirmeyi gizlemek, kullanıcının
     12 kitabını sanki 1000Kitap'ın türüne saymak olurdu. Kaynak sayısı yoksa o
     yarım hiç kurulmaz — uydurma sayı yok. */
  function turCumle(sinyal, kaynakTur, aday){
    const parcalar = [sinyal.cumle];
    const ayni = turAnahtar(sinyal.ad) === turAnahtar(kaynakTur.ad);
    const kaynakParca = [];
    if(aday.okuyan > 0) kaynakParca.push(binlik(aday.okuyan) + ' okur');
    if(aday.puan > 0) kaynakParca.push('★' + ondalik(aday.puan));
    if(kaynakParca.length)
      parcalar.push('1000Kitap\'ta ' + (ayni ? '' : turGoster(kaynakTur.ad) + ' içinde ')
        + kaynakParca.join(', '));
    else if(!ayni)
      parcalar.push('1000Kitap\'ta ' + turGoster(kaynakTur.ad) + ' türünden');
    return parcalar.join(' · ');
  }

  /* ---- DİL SÜZGECİ (v65): Keşfet YALNIZ TÜRKÇE önerir ----
     Canlı kanıt: YENİ KİTAPLAR "L'enfance d'un chef", "Pale Blue Dot",
     "Madonna In a Fur Coat" öneriyordu — sevilen yazarın İNGİLİZCE ÇEVİRİSİ
     yazar denetiminden geçer (gerçekten o yazarın kitabı), dili tutmaz.
     ÖLÇÜM (2026-08-13, canlı GB): langRestrict=tr TEK BAŞINA GÜVENİLMEZ —
     Carl Sagan langRestrict=tr'ye rağmen 6/6 İngilizce, Sabahattin Ali'ye bile
     1 İngilizce sızdı. Bu yüzden savunma İKİ katman: sorguya langRestrict=tr
     (ucuz ön eleme) + DÖNEN adayın volumeInfo.language alanı burada denetlenir.
     Dil alanı OLMAYAN aday ELENİR — ölçülen karar: 114 canlı adayın 0'ı
     dilsizdi (%0), yani eleme pratikte hiçbir gerçek Türkçe kitabı kaybettirmez;
     dili bilinmeyeni "muhtemelen Türkçedir" diye geçirmek uydurma olurdu.
     1000Kitap tür adayları MUAF: kaynak zaten Türkçe, dil alanı taşımaz.
     Eleme sonrası bir yazar/seri boş kalırsa o kaynak sessizce atlanır —
     doldurma yok (v53 ilkesinin dil ayağı). Süzgeç TEK fonksiyon ve hem
     sorgu sonunda (kota dilimi Türkçelere kalsın) hem her çizimde (bElenmis —
     24 saatlik bayat önbellekte kalmış yabancı adaylar da düşsün) uygulanır. */
  function bDilUygun(a){
    if(a && a.kaynakTip === 'tur') return true;   // 1000Kitap: dokunulmaz (görev sözleşmesi)
    return String((a && a.dil) || '').toUpperCase() === 'TR';
  }

  function isbnTemiz(s){
    // barkod.js ihraçlı temizleyici; eklenti yüklenmemişse aynı kural (emniyet)
    return (window.__barkod && window.__barkod.isbnTemizle)
      ? window.__barkod.isbnTemizle(s)
      : String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  }
  /* Anahtar HER ZAMAN ad|yazar (araTekillestir emsali) — ISBN-öncelikli anahtar
     iki edisyonu iki satır yapıyor ve gizlemeyi edisyon değişiminde deliyordu
     (v51 inceleme K1/K2). ISBN eleme kütüphane karşılaştırmasında AYRICA yaşar. */
  function bAnahtar(a){
    return katla(a.ad) + '|' + katla(a.yazar || '');
  }
  /* İmzaya tür sinyali de girer: kütüphaneye yeni bir tür işlenip sıralama
     değişince 24 saat beklemeden önbellek düşer. (M.sevilenTurler kontrolü
     bilinçli: SW güncellemesi sırasında taze kesfet.js + bayat oneri.js
     eşleşebilir; eksik API çökme değil, tür dalının sessiz yokluğu olmalı.) */
  function bSevilenTurler(){
    const M = window.__oneri;
    return (M && typeof M.sevilenTurler === 'function') ? M.sevilenTurler() : [];
  }
  /* Sorgulanamaz yazarlar (v53) TEK YERDE elenir: imza, sinyal kontrolü ve
     sorgu döngüsü hep bu listeyi kullanır. Süzgeç kotadan ÖNCE uygulanır —
     yoksa "Anonim" ilk 3 yazar yuvasından birini işgal ederdi. */
  function bYazarlar(){
    const M = window.__oneri;
    return (M.sevilenYazarlar() || []).filter(y => sorulabilirYazar(y.ad));
  }
  function bImza(){
    const M = window.__oneri;
    return JSON.stringify([
      bYazarlar().slice(0, B_YAZAR_KOTA).map(y => katla(y.ad)),
      M.eksikSeriler().slice(0, B_SERI_KOTA).map(s => katla(s.seri)),
      bSevilenTurler().slice(0, B_TUR_KOTA).map(t => katla(t.ad))]);
  }
  function bOnbellekOku(){
    try{
      const v = JSON.parse(localStorage.getItem(B_ONBELLEK) || 'null');
      if(!v || !Array.isArray(v.adaylar)) return null;
      if(v.imza !== bImza() || (Date.now() - v.t) > B_TTL_MS) return null;
      return v.adaylar;
    }catch(e){ return null; }
  }
  /* Eleme HER ÇİZİMDE taze: kütüphanede olan (ad+yazar TR-katlamalı VE ISBN),
     gizlenen ve yinelenen adaylar düşer. Önbellek HAM aday saklar — kitap
     eklenince/gizlenince liste sorgusuz güncellenir. */
  /* Kütüphane bağlamı + "kütüphanede var mı" TEK denetimde (M2): aynı denetim
     hem çizim-anı elemesinde (bElenmis) hem SORGU ANINDA dilimden ÖNCE
     (bGetir/bTurAdaylari) koşar — v53 ilkesinin ("eleme dilimden önce")
     kütüphane ayağı. Eskiden yalnız çizimde koşuyordu: sahip olunan kitaplar
     B_*_ADAY yuvalarını işgal ediyordu (v69 kanıtı: Shakespeare sorgusunda
     Hamlet+Romeo yuvaları yedi, Macbeth/Kral Lear dilimde kesildi; g58 bunu
     kota-altı fixture ile kilitlemek zorunda kalmıştı). Belgeli bedel: sorgu
     anında elenen aday, kitap sonradan kütüphaneden SİLİNİRSE önbellek
     tazelenene kadar geri gelmez (24 sa TTL); gizli/dil/süzgeç elemeleri
     çizim anında taze kalmaya devam eder — önbellek o yönlerden HAM. */
  function bKutuphaneBaglami(){
    const adSet = new Set(), isbnSet = new Set();
    (veri.kitaplar || []).forEach(k => {
      adSet.add(katla(k.ad) + '|' + katla(k.yazar || ''));
      // adTr (v73): kitabın TÜRKÇE ADI da "kütüphanede var" anahtarıdır —
      // kaynak Türkçe baskıyı önerince birebir eleme yakalar
      if(k.adTr) adSet.add(katla(k.adTr) + '|' + katla(k.yazar || ''));
      if(k.isbn){ const t = isbnTemiz(k.isbn); if(t) isbnSet.add(t); }
    });
    // M2 (v69): başlık varyantı elemesi için ad+yazar dolu kütüphane kitapları —
    // eleme tek noktada yaşadığı için yazar/seri/tür ÜÇ kaynağı da kapsanır
    const varyantKaynak = (veri.kitaplar || []).filter(k => k.ad && k.yazar);
    return { adSet, isbnSet, varyantKaynak };
  }
  function bKutuphanede(a, bag){
    if(bag.adSet.has(katla(a.ad) + '|' + katla(a.yazar || ''))) return true;
    const t = a.isbn ? isbnTemiz(a.isbn) : '';
    if(t && bag.isbnSet.has(t)) return true;
    // M2 (v69): aynı yazarın BAŞLIK VARYANTI da kütüphanede-var sayılır
    // ("Romeo and Juliet" raftayken "Romeo ve Juliet" önerilmez); yazar
    // eşleşmiyorsa başlık benzerliğine hiç bakılmaz (farklı yazarın aynı
    // adlı kitabı elenmez). adTr (v73): benzerlik hem ad hem TÜRKÇE AD
    // üzerinden denenir — "Suç ve Ceza"/"Crime and Punishment" tipi
    // ÇAPRAZ-DİL çifti (v69'un bilinen sınırı) adTr kayıtlıysa yakalanır.
    if(a.yazar && bag.varyantKaynak.some(k =>
      yazarEslesir(k.yazar, a.yazar) &&
      (adBenzer(k.ad, a.ad) || (k.adTr && adBenzer(k.adTr, a.ad))))) return true;
    return false;
  }
  function bElenmis(){
    const bag = bKutuphaneBaglami();
    const gorulen = new Set();
    return (B.adaylar || []).filter(a => {
      if(!a || !a.ad) return false;
      if(!bDilUygun(a)) return false;    // v65: bayat önbellekteki yabancı aday da düşer
      const anah = bAnahtar(a);
      if(gorulen.has(anah)) return false;
      gorulen.add(anah);
      if(bKutuphanede(a, bag)) return false;
      if(bGizliMi(anah)) return false;   // v62: geri alınan gizlemeler artık elemez
      return true;
    });
  }
  async function bGetir(){
    const M = window.__oneri, A = window.__ara;
    if(!M || !A || B.durum === 'yukleniyor') return;
    B.durum = 'yukleniyor';
    if(typeof durum === 'object' && durum.sekme === 'kesfet') ciz();
    // imza sorgu BAŞINDA dondurulur (inceleme K4): yükleme sırasında kütüphane
    // değişirse eski sinyalle çekilen adaylar yeni imzayla mühürlenmesin
    const imza = bImza();
    const yazarlar = bYazarlar().slice(0, B_YAZAR_KOTA);
    const seriler = M.eksikSeriler().slice(0, B_SERI_KOTA);
    // zaman aşımı canliAra ile aynı: 9 sn (inceleme K3 — asılı fetch süresiz
    // "yükleniyor"da bırakıyordu)
    const ctl = new AbortController();
    const zam = setTimeout(() => ctl.abort(), 9000);
    let hataOldu = false;
    const dene = p => p.catch(() => { hataOldu = true; return []; });
    const adaylar = [];
    // Kütüphane elemesi dilimden ÖNCE (M2 — v53 ilkesinin kütüphane ayağı):
    // bağlam sorgu başında bir kez kurulur, üç dal da kullanır.
    const bag = bKutuphaneBaglami();
    /* TÜR dalı Google döngülerinden ÖNCE ateşlenir, SONRA toplanır: başka
       kökene giden bağımsız istekler sıradaki ≤6 Google sorgusunun gölgesinde
       koşar, duvar saatine eklediği süre pratikte ~0 (ölçüm: /turler 0,23 sn,
       /tur 0,56 sn; Google döngüsü tipik 1-3 sn). İptal sinyali ORTAK. */
    const turSozu = (A.turler && A.tur) ? dene(bTurAdaylari(A, ctl.signal, bag)) : Promise.resolve([]);
    /* ALAKA SÜZGECİ kotadan ÖNCE (v53): eleme slice'tan sonra yapılsaydı ilk 3
       sıradaki çöp, 4. sıradaki gerçek kitabı listeden dışarıda bırakırdı.
       Eşleşen kalmazsa o yazar/seri sessizce ATLANIR — doldurma yok. */
    // EN GÜÇLÜ sinyal önce: eksik seri sorguları liste başında
    for(const s of seriler){
      const q = s.yazar ? '"' + s.seri + '" inauthor:"' + s.yazar + '"' : '"' + s.seri + '"';
      // Seride ÜÇ denetim: kitap gerçekten o seriden mi, gerçekten o yazarın mı,
      // TÜRKÇE mi (v65 — dil süzgeci kota diliminden ÖNCE: yabancı baskılar
      // B_SERI_ADAY yuvalarını işgal edip Türkçeleri dışarıda bırakmasın).
      // Yazar denetlenemiyorsa (ad yok ya da "Anonim") yalnız seri adı bağlar.
      const yazarDenetli = !!s.yazar && sorulabilirYazar(s.yazar);
      (await dene(A.google(q, null, ctl.signal, 'tr', B_DERINLIK)))
        .filter(a => bDilUygun(a) && seriEslesir(s.seri, a.ad) &&
          (!yazarDenetli || yazarEslesir(s.yazar, a.yazar)) && !bKutuphanede(a, bag))
        .slice(0, B_SERI_ADAY)
        .forEach(a => adaylar.push({ ...a, kaynakTip: 'seri', seriAd: s.seri, neden: s.cumle }));
    }
    for(const y of yazarlar){
      (await dene(A.google(y.ad, 'yazar', ctl.signal, 'tr', B_DERINLIK)))
        .filter(a => bDilUygun(a) && yazarEslesir(y.ad, a.yazar) && !bKutuphanede(a, bag))
        .slice(0, B_YAZAR_ADAY)
        .forEach(a => adaylar.push({ ...a, kaynakTip: 'yazar', neden: y.cumle }));
    }
    (await turSozu).forEach(a => adaylar.push(a));   // en zayıf sinyal en sonda
    clearTimeout(zam);
    if(!adaylar.length && hataOldu){
      B.durum = 'hata';   // hiç sonuç yok VE ağ düştü → dürüst hata; kısmi sonuç gösterilir
    }else{
      B.adaylar = adaylar;
      B.durum = 'hazir';
      B.acik = false;   // yeni havuz kısaltılmış başlar (M2)
      try{ localStorage.setItem(B_ONBELLEK,
        JSON.stringify({ imza, t: Date.now(), adaylar })); }catch(e){ window._iz && window._iz('kesfetBOnbellekYaz', e); }
    }
    if(typeof durum === 'object' && durum.sekme === 'kesfet') ciz();
  }
  /* Tür adayları: önce taksonomi (/turler), sonra eşleşen ≤2 tür için İLK
     SAYFA (türün en çok okunanları — kaynak zaten okunma sırasına dizili,
     hasMore takip edilmiyor: keşif için ilk 16 yeterli, 2. sayfa kuyruğa
     iniyor). Eşleşmeyen kullanıcı türü SESSİZCE atlanır; hiç tür eşleşmezse
     tek istek bile atılmaz. Kısmi arıza kısmi sonuç verir; HİÇ sonuç yokken
     arıza varsa dışarı fırlatılır (dış katmanın "dürüst hata" kuralı). */
  async function bTurAdaylari(A, sinyal, bag){
    const sevilen = bSevilenTurler();
    if(!sevilen.length) return [];
    const kaynakTurler = await A.turler(sinyal);
    const secilen = [], kullanilan = new Set();
    for(const t of sevilen){
      if(secilen.length >= B_TUR_KOTA) break;
      const e = turEslestir(t.ad, kaynakTurler);
      if(!e || kullanilan.has(e.seo)) continue;
      kullanilan.add(e.seo);
      secilen.push({ sinyal: t, kaynakTur: e });
    }
    if(!secilen.length) return [];
    let turHata = false;
    const paketler = await Promise.all(secilen.map(s => A.tur(s.kaynakTur.seo, 1, sinyal)
      .then(p => ({ s, p })).catch(() => { turHata = true; return null; })));
    const adaylar = [];
    paketler.filter(Boolean).forEach(({ s, p }) => {
      // kütüphane elemesi dilimden ÖNCE burada da (M2): sahip olunan kitap
      // B_TUR_ADAY yuvası işgal etmesin (Google dallarıyla aynı ilke)
      (p.sonuclar || [])
        .filter(a => a && a.ad && !bKutuphanede({ ad: a.ad, yazar: a.yazar || '' }, bag))
        .slice(0, B_TUR_ADAY).forEach(a => adaylar.push({
        ad: a.ad, yazar: a.yazar || '', kapak: a.kapak || null,
        // tür MÜHRÜ (v77): adayı getiren kullanıcı türü + kaynağın kendi tür
        // adı sorgu anında donar; süzgeç sonradan tahmin yürütmez
        kaynakTip: 'tur', turSinyal: s.sinyal.ad, turKaynakAd: s.kaynakTur.ad,
        neden: turCumle(s.sinyal, s.kaynakTur, a) }));
    });
    if(!adaylar.length && turHata) throw new Error('tur-kaynagi');
    return adaylar;
  }

  /* ---------- YENİ KİTAPLAR süzgeci (v77) ----------
     KUSUR (canlı kanıt): Tür süzgeci yalnız "Rafından" listesine
     uygulanıyordu; "Bilim-Teknoloji-Mühendislik" çipi seçiliyken YENİ
     KİTAPLAR bölümü "Biyografi türünde 3 kitap bitirdin" gerekçeli
     önerileri göstermeyi sürdürüyordu. Süzgeç bir GÖRÜNÜM sözleşmesidir:
     bir çip seçiliyken ekranda o çipe uymayan satır olmamalı; kullanıcı
     bunu "süzgeç bozuk"tan başka türlü okuyamaz.

     HANGİ SÜZGEÇ UYGULANIR (karar tablosu):
     - Tür      -> EVET. Süzgecin kendisi budur.
     - Uzunluk  -> EVET, dosyanın kendi kuralıyla: sayfası BİLİNMEYEN aday
                   süzgeç açıkken listeye girmez (bilinmeyeni bir kovaya
                   saymak uydurma olur). 1000Kitap tür kaydı sayfa TAŞIMAZ
                   (ölçüldü: worker /tur alanları ad, yazar, puan, okuyan,
                   kapak) -> uzunluk süzgeci açıkken tür kaynağı boşalır.
                   Bu bir kusur değil, aynı kuralın sonucu.
     - Bende / İstek listem -> HAYIR. YENİ KİTAPLAR tanımı gereği
                   kütüphanede OLMAYAN kitaplardır; iki çip de SAHİPLİK
                   kipidir ve bir aday hiçbirine ait değildir. Uygulamak
                   bölümü her iki kipte de kalıcı boş bırakırdı. İstek
                   kipinde bölümü gizlemek de yanlış olurdu: bölümün tek
                   eylemi zaten "İstek listeme ekle".
     - Raf      -> HAYIR. Raf, kullanıcının evindeki FİZİKSEL yerdir;
                   kütüphanede olmayan kitabın rafı olamaz. Uygulamak =
                   daimî boş bölüm.

     ADAYIN TÜRÜ NEREDEN BİLİNİR (kaynağa göre):
     - tur   -> kesin: adayı getiren KULLANICI türü (turSinyal) ve kaynağın
                kendi tür adı (turKaynakAd) sorgu anında adaya mühürlenir.
     - seri  -> önce KÜTÜPHANEDEKİ ciltlerin türü: aynı eserin ciltleridir,
                bu kullanıcının KENDİ verisidir ve süzgeç de onun sözcük
                dağarcığıyla yazılmıştır. Yoksa adayın Google kategorileri.
     - yazar -> yalnızca adayın KENDİ Google kategorileri. Yazarın öbür
                kitaplarının türünden çıkarım YAPILMAZ: bir yazar tek türe
                bağlı değildir (Kafka roman da yazar, mektup da); böyle bir
                çıkarım, hakkında hiçbir şey bilmediğimiz kitap hakkında
                iddia olurdu.
     Kategori -> tür çevirisi zengin.js SÖZLÜĞÜYLE yapılır (turCevirHam):
     kitabın türünü kütüphaneye yazan motorun aynısı. İkinci, ayrışan bir
     eşleme tablosu YOK.

     TÜRÜ BİLİNMEYEN ADAY: süzgeç AÇIKKEN elenir. Gerekçe (1) kullanıcı
     açıkça o türü istedi; bilinmeyeni geçirmek düzeltmeye çalıştığımız
     kusurun kendisini üretir (çipe uymayan satır). (2) Bu dosyanın kurulmuş
     iki emsali aynı yönde: sayfası bilinmeyen aday uzunluk süzgecinde,
     dili bilinmeyen aday dil süzgecinde eleniyor. (3) Hata bedeli
     asimetrik: yanlış GÖSTERİLEN öneri görünür bir iddia taşır, elenen
     öneri süzgeç kalkınca aynen geri gelir (kayıp değil, erteleme) ve kaç
     tanesinin elendiği ekranda YAZAR.

     SERİ MUAFİYETİ YOK: seri devamı en güçlü sinyal olsa da süzgeç bir
     görünüm sözleşmesidir; "güçlü sinyal" muafiyeti kullanıcının gözünde
     bozuk süzgeçten ayırt edilemez. Zaten seri adayının türünü kütüphanedeki
     ciltlerinden okuduğumuz için aynı türdeki seri devamı doğal olarak
     GEÇER; elenen yalnızca gerçekten başka türdeki adaydır.

     SÜZGEÇ DEĞİŞİMİ SORGU ATMAZ: eleme, çekilmiş aday havuzu üzerinde yerel
     çalışır (bElenmis'in her çizimde tazelenmesiyle aynı desen). Gerekçe
     KOTA: bir koşum <=6 Google isteği, Google günlük 1000; çip dokunuşu bir
     keşif jestidir, art arda onlarca kez yapılır — her dokunuşta yeniden
     sormak günlük kotayı ~30 dokunuşta bitirirdi. Üstelik yazar/seri
     dallarının "tür" parametresi yoktur: türe göre yeniden sorgu diye bir
     şey teknik olarak da yok. */
  function bSeriTuru(seriAd){
    if(!seriAd || typeof veri !== 'object') return '';
    const a = katla(seriAd);
    const k = (veri.kitaplar || []).find(x => x.seri && katla(x.seri) === a && x.tur);
    return k ? k.tur : '';
  }
  function bAdayTur(a){
    if(!a) return '';
    if(a.kaynakTip === 'tur') return a.turSinyal || '';
    if(a.kaynakTip === 'seri'){
      const st = bSeriTuru(a.seriAd);
      if(st) return st;
    }
    const Z = window.__zengin;
    return (Z && typeof Z.turCevirHam === 'function') ? (Z.turCevirHam(a.kategoriler) || '') : '';
  }
  function bTurUyar(a){
    const hedef = turAnahtar(S.tur || '');
    if(!hedef) return true;
    /* Tür kaynağında kullanıcı etiketi ile kaynak etiketi FARKLI olabilir
       (Felsefe -> Felsefe-Düşünce); ikisi de adayın gerçek kimliğidir. */
    if(a.kaynakTip === 'tur' && turAnahtar(a.turKaynakAd || '') === hedef) return true;
    return turAnahtar(bAdayTur(a)) === hedef;   // bilinmeyen ('') hiçbir hedefe uymaz
  }
  function bUzunlukUyar(a){
    if(!S.uzunluk) return true;
    return uzunlukKova(a.sayfa) === S.uzunluk;   // sayfasız aday elenir (dosya kuralı)
  }
  function bSuzgecVar(){ return !!(S.tur || S.uzunluk); }
  function bSuzgectenGecer(a){ return bTurUyar(a) && bUzunlukUyar(a); }

  /* Görünen alt-küme (M2): B.acik ya da liste ≤ B_GOSTER ise hepsi iner.
     Aksi hâlde KAYNAK DENGESİ: aktif kaynaklar öncelik sırasıyla (seri >
     yazar > tür — motorun sinyal-gücü sırası) taban payı floor(B_GOSTER/n)
     alır; kalan yuvalar öncelik sırasıyla, az adaylı kaynağın artığı da
     sıradaki kaynaklara dağıtılır. Blok düzeni (seri, yazar, tür) ve blok
     içi sıra DEĞİŞMEZ — dönen değer B.gorunen İNDİSLERİDİR (artan sırada),
     satırların data-i'si bu yüzden hep doğru adaya işaret eder. */
  function bSecilenIdx(liste){
    if(B.acik || liste.length <= B_GOSTER) return liste.map((a, i) => i);
    const gruplar = ['seri', 'yazar', 'tur']
      .map(tip => liste.map((a, i) => (a && a.kaynakTip === tip) ? i : -1).filter(i => i >= 0))
      .filter(g => g.length);
    if(!gruplar.length) return liste.map((a, i) => i);   // emniyet: bilinmeyen kaynak tipi
    const pay = gruplar.map(() => Math.floor(B_GOSTER / gruplar.length));
    let kalan = B_GOSTER - pay.reduce((t, x) => t + x, 0);
    for(let i = 0; kalan > 0 && i < pay.length; i++){ pay[i]++; kalan--; }
    let artik = 0;
    gruplar.forEach((g, i) => {
      if(g.length < pay[i]){ artik += pay[i] - g.length; pay[i] = g.length; }
    });
    for(let i = 0; artik > 0 && i < gruplar.length; i++){
      const bos = gruplar[i].length - pay[i];
      const ek = Math.min(bos, artik); pay[i] += ek; artik -= ek;
    }
    const idx = [];
    gruplar.forEach((g, i) => idx.push(...g.slice(0, pay[i])));
    return idx.sort((x, y) => x - y);
  }
  function bSatirHtml(a, i){
    const kaynakAd = B_KAYNAK_AD[a.kaynakTip] || '';
    return '<div class="ks-b-item">' +
      (typeof ktPlate === 'function'
        ? ktPlate({ ad: a.ad, yazar: a.yazar || '', kapak: a.kapak || null }, 'p-mini') : '') +
      '<div class="ks-ic">' +
        (kaynakAd ? '<span class="ks-b-kaynak">' + esc(kaynakAd) + '</span>' : '') +
        '<span class="ks-b-ad">' + esc(a.ad) + '</span>' +
        (a.yazar ? '<div class="ks-b-yazar">' + esc(a.yazar) + '</div>' : '') +
        '<div class="ks-b-neden">' + esc(a.neden || '') + '</div>' +
        '<div class="ks-eylem">' +
          '<button class="ks-b-ekle" data-act="ks-b-ekle" data-i="' + i + '">İstek listeme ekle</button>' +
          '<button class="ks-b-gizle" data-act="ks-b-gizle" data-i="' + i + '">İlgilenmiyorum</button>' +
        '</div>' +
      '</div></div>';
  }
  function bBolumHtml(){
    const M = window.__oneri;
    if(!M || !M.sevilenYazarlar) return '';
    // sinyal sayımı SORGULANABİLİR yazarlar üzerinden: yalnız "Anonim" okuyan
    // birine "getir" düğmesi göstermek, basınca hiç sorgu atmamak olurdu.
    const sinyalVar = bYazarlar().length || M.eksikSeriler().length
      || bSevilenTurler().length;
    let ic;
    if(!sinyalVar){
      // yetersiz veri: sorgu da atılmaz — uydurma öneri YOK
      ic = '<div class="ks-b-not">Yeni kitap önerisi için önce sinyal gerek: bir yazarın ' +
        'kitabını bitirip 8 ve üzeri puan ver, bir serinin ciltlerini kütüphanene işle ' +
        'ya da aynı türden en az 2 kitabı bitirip 7 ve üzeri puan ver.</div>';
    }else{
      if(B.durum === 'bekliyor'){
        const c = bOnbellekOku();
        if(c){ B.adaylar = c; B.durum = 'hazir'; }   // taze önbellek: ağ maliyeti sıfır
      }
      if(B.durum === 'bekliyor'){
        ic = '<div class="ks-b-not">Sevdiğin yazarların ve eksik serilerinin kütüphanende ' +
          'OLMAYAN kitapları kaynaklardan sorulur — sen istemeden sorgu atılmaz.</div>' +
          '<button class="btn btn-cerceve ks-b-getir" data-act="ks-b-getir">Yeni kitapları getir</button>';
      }else if(B.durum === 'yukleniyor'){
        ic = '<div class="ks-b-not">Kaynaklara soruluyor…</div>';
      }else if(B.durum === 'hata'){
        ic = '<div class="ks-b-not">İnternete ulaşılamadı — yeni kitap önerileri şimdilik yok; ' +
          'rafından öneriler etkilenmez.</div>' +
          '<button class="btn btn-cerceve ks-b-getir" data-act="ks-b-getir">Yeniden dene</button>';
      }else{
        /* Süzgeç HAM havuzun üzerine biner: bElenmis (kütüphane/gizli/dil)
           önce, kullanıcı süzgeci sonra. B.gorunen süzgeçten geçen havuzun
           TAMAMI olarak kalır — data-i indisleri ekle/gizle eylemlerinde
           onunla eşleşir; ekrana inen alt-küme bSecilenIdx'ten gelir ama
           İNDİS B.gorunen'e göre yazılır (kayma imkânsız, g75 sözleşmesi). */
        const ham = bElenmis();
        B.gorunen = ham.filter(bSuzgectenGecer);
        const elenen = ham.length - B.gorunen.length;
        const secilen = bSecilenIdx(B.gorunen);
        const kalanN = B.gorunen.length - secilen.length;
        if(B.gorunen.length)
          ic = (bSuzgecVar() && elenen
              ? '<div class="ks-b-sayim">' + ham.length + ' yeni aday · süzgeçten geçen: ' +
                B.gorunen.length + '</div>'
              : '') + secilen.map(i => bSatirHtml(B.gorunen[i], i)).join('') +
            (kalanN ? '<button class="btn btn-cerceve ks-b-daha" data-act="ks-b-daha">' +
              kalanN + ' öneri daha göster</button>' : '');
        else if(bSuzgecVar() && ham.length)
          /* DÜRÜST boş durum: uydurma doldurma yok, çıkış yolu yazılı */
          ic = '<div class="ks-b-not">Bu süzgeçle eşleşen yeni öneri yok — süzgeci kaldırınca ' +
            ham.length + ' öneri geri gelir.</div>';
        else
          ic = '<div class="ks-b-not">Kaynaklarda kütüphanende olmayan yeni bir şey bulunamadı.</div>';
      }
    }
    return '<div class="ks-b" id="ksB">' +
      '<div class="ks-b-bas"><span class="kicker">Yeni kitaplar</span></div>' + ic +
      bGizliHtml() + '</div>';
  }
  function bEkle(i){
    const a = B.gorunen[+i];
    if(!a || typeof kitapNormalize !== 'function' || typeof uid !== 'function') return;
    // katalog.js kodIsle emsali: normalize + push + depoKaydet + hepsiniCiz
    const yeni = kitapNormalize({ id: uid(), ad: a.ad, yazar: a.yazar || '',
      yayinevi: a.yayinevi || '', yil: a.yil || null, sayfa: a.sayfa || null,
      kapak: a.kapak || null, isbn: a.isbn || '', durum: 'okunacak',
      sahiplik: 'istek', eklenme: Date.now(), g: Date.now() });
    veri.kitaplar.push(yeni);
    depoKaydet();
    /* Otomatik tür (v65): istek listesine eklenen kitap da yeni kitaptır —
       aday Google'dan geldiyse kategorileri bedava taşınır, yoksa kuyruk
       tek sorguyla dener; bulunamazsa boş kalır (formKaydet ile aynı motor). */
    if(!yeni.tur && window.__zengin && window.__zengin.otoTur)
      window.__zengin.otoTur(yeni.id,
        (Array.isArray(a.kategoriler) && a.kategoriler.length) ? a.kategoriler : null);
    /* Taslak özet (v83): otoTur ile AYNI nokta — istek listesine eklenen de
       yeni kitaptır; v82 yalnız form yoluna bağlamıştı (spec eksiği).
       Kapılar taslakAday içinde (ayar kapalıysa sessiz no-op). */
    if(typeof taslakAday === 'function') taslakAday(yeni.id);
    if(typeof toast === 'function') toast('İstek listene eklendi');
    if(typeof hepsiniCiz === 'function') hepsiniCiz();   // sarmalama Keşfet'i tazeler
    ciz();
  }
  /* Gizleme GERİ ALINABİLİR (v62 — erteleme deseninin dengi). Senkron
     semantiği KARARI: kesfetGizli öz-damgalı UNION'dur; union'dan kayıt
     SİLMEK öbür cihazın kopyasından geri dirilir. Bu yüzden geri alma ayrı
     bir öz-damgalı haritada yaşar: kesfetGizliGeri (silinenler mezar taşı
     deseninin birebiri). Etkin gizlilik = gizli damgası > geri damgası;
     yeniden gizlemek daha yeni damgayla geri almayı yener. */
  const GIZLI_AD_ANAHTAR = 'kk_kesfet_gizli_ad_v1';   // cihaz-yerel ad defteri (senkrona girmez)
  function gizliAdDefteri(){
    try{ return JSON.parse(localStorage.getItem(GIZLI_AD_ANAHTAR)) || {}; }
    catch(e){ return {}; }
  }
  function bGizliMi(anah){
    const g = (veri.kesfetGizli || {})[anah];
    const geri = (veri.kesfetGizliGeri || {})[anah];
    return !!g && !(geri > g);
  }
  function bGizliListe(){
    const defter = gizliAdDefteri();
    return Object.keys(veri.kesfetGizli || {}).filter(bGizliMi).sort()
      .map(anah => ({ anah,
        /* başka cihazda gizlenmişse ad defterinde yoktur — anahtarın kendisi
           (katlanmış "ad — yazar") gösterilir: çirkin ama dürüst */
        ad: defter[anah] || anah.split('|').filter(Boolean).join(' — ') }));
  }
  function bGizle(i){
    const a = B.gorunen[+i];
    if(!a) return;
    veri.kesfetGizli = veri.kesfetGizli || {};
    veri.kesfetGizli[bAnahtar(a)] = Date.now();   // kalıcı tercih; senkronda union
    try{
      const defter = gizliAdDefteri();
      defter[bAnahtar(a)] = a.ad + (a.yazar ? ' — ' + a.yazar : '');
      localStorage.setItem(GIZLI_AD_ANAHTAR, JSON.stringify(defter));
    }catch(e){ window._iz && window._iz('kesfetGizliDefter', e); }
    depoKaydet();
    if(typeof toast === 'function') toast('Bir daha önerilmeyecek — alttaki listeden geri alabilirsin');
    ciz();
  }
  function bGeriAl(anah){
    if(!anah || !bGizliMi(anah)) return;
    veri.kesfetGizliGeri = veri.kesfetGizliGeri || {};
    veri.kesfetGizliGeri[anah] = Date.now();
    depoKaydet();
    if(typeof toast === 'function') toast('Öneri geri geldi');
    ciz();
  }
  function bGizliHtml(){
    const gizliler = bGizliListe();
    if(!gizliler.length) return '';
    return '<div class="ks-gizli"><button class="ks-sessiz" data-act="ks-gizli">' +
      gizliler.length + ' öneri gizledin — ' + (S.gizliAcik ? 'gizle' : 'göster') + '</button>' +
      (S.gizliAcik ? gizliler.map(g =>
        '<div class="ks-erteli-item ks-gizli-item"><span class="ks-erteli-ad">' + esc(g.ad) + '</span>' +
        '<span class="ks-erteli-sag"><button class="ks-basla" data-act="ks-gizli-geri" data-anah="' +
        escAttr(g.anah) + '">Geri al</button></span></div>').join('') : '') + '</div>';
  }

  function ciz(){
    const kap = document.getElementById('ksIcerik');
    if(!kap || !window.__oneri || !window.__oneri.hesaplaHam) return;
    const M = window.__oneri;
    const h = M.hesaplaHam();
    const havuz = S.sahiplik === 'istek' ? h.istek : h.sahip;

    // süzgeç seçenekleri adayların KENDİ değerlerinden (uydurma seçenek yok)
    const turler = [...new Set(havuz.map(o => o.kitap.tur).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
    const raflar = [...new Set(havuz.map(o => o.kitap.raf).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
    if(S.tur && turler.indexOf(S.tur) < 0) S.tur = null;   // aday kalmadıysa süzgeç düşer
    if(S.raf && raflar.indexOf(S.raf) < 0) S.raf = null;

    const filtreli = havuz.filter(o => {
      const k = o.kitap;
      if(S.tur && k.tur !== S.tur) return false;
      if(S.raf && k.raf !== S.raf) return false;
      if(S.uzunluk && uzunlukKova(k.sayfa) !== S.uzunluk) return false;
      return true;
    });

    // az-veri: bekleme sırası korunur (çeşitlilik kotası skor listesi içindir)
    const secilen = h.mod === 'az-veri'
      ? filtreli.slice(0, S.limit)
      : M.cesitlilikSec(filtreli, S.limit);
    M.nedenAta(secilen);

    // "daha fazla" DÜRÜST: bir sonraki adım gerçekten yeni öğe getirecekse görünür
    const sonrakiN = h.mod === 'az-veri'
      ? Math.min(filtreli.length, S.limit + SAYFA_ADIMI)
      : M.cesitlilikSec(filtreli, S.limit + SAYFA_ADIMI).length;
    const dahaVar = sonrakiN > secilen.length;

    const skorlar = secilen.map(o => o.skor).filter(s => s !== null);
    const enY = skorlar.length ? Math.max.apply(null, skorlar) : 0;
    const enD = skorlar.length ? Math.min.apply(null, skorlar) : 0;

    const erteliler = (typeof veri === 'object' ? veri.kitaplar : [])
      .filter(k => (k.durum === 'okunacak' || k.durum === 'yarim') && M.ertelemeAktif(k));

    /* D5 (v62): çeşitlilik kotası aday elediyse sayım şeffaf — hangi kota
       kestiği elenen adaylardan bakılarak söylenir, sayı uydurulmaz. */
    let elemeNotu = '';
    if(h.mod !== 'az-veri' && !dahaVar && filtreli.length > secilen.length){
      const gosterilen = new Set(secilen.map(o => o.kitap.id));
      const yazarSay = {};
      secilen.forEach(o => { const y = katla(o.kitap.yazar || '');
        if(y) yazarSay[y] = (yazarSay[y] || 0) + 1; });
      let turKesti = false;
      filtreli.forEach(o => {
        if(gosterilen.has(o.kitap.id)) return;
        const y = katla(o.kitap.yazar || '');
        if(!(y && yazarSay[y] >= 2)) turKesti = true;
      });
      elemeNotu = ' · ' + (filtreli.length - secilen.length) + ' aday gösterilmiyor: aynı yazardan en fazla 2' +
        (turKesti ? ', benzer türden sınırlı sayıda' : '') + ' öneri';
    }
    let html = ustHtml(h, havuz, filtreli.length, elemeNotu);
    html += suzgecHtml(turler, raflar);
    /* M3 (v69): az-aday yönlendirmesi — sayılar GERÇEK veriden, uydurma yok.
       Yalnız "Bende" modunda (istek listesi başka kavram) ve aday azken.
       okunacakN kümesi = SAHİP okunacaklar (taze-göz kusuru: istek-listesi
       okunacakları sayılıyordu, havuzla çelişiyordu); ertelenmişler DAHİL
       (kitaplık gerçeği) ama okunacakN >= eşikse not çıkmaz — "6 kitabı
       ertelemiştin"in yanında "yalnızca 6 kitabın var" çelişkisi doğmasın. */
    if(S.sahiplik !== 'istek' && havuz.length < AZ_ADAY_ESIK){
      const okunacakN = veri.kitaplar.filter(k =>
        k.durum === 'okunacak' && (k.sahiplik || 'sahip') === 'sahip').length;
      const bittiN = veri.kitaplar.filter(k => k.durum === 'bitti').length;
      if(okunacakN < AZ_ADAY_ESIK && bittiN >= AZ_ADAY_BITTI_TABAN)
        html += '<div class="ks-not ks-az-aday">' +
          (okunacakN ? 'Yalnızca ' + okunacakN + ' okunacak kitabın var. ' : 'Hiç okunacak kitabın yok. ') +
          'Kitaplığındaki ' + bittiN + ' kitap “bitti” işaretli — aralarında okumadıkların varsa ' +
          'Kütüphane\'den toplu seçip Okunacak yapabilirsin.</div>';
    }
    if(h.mod === 'az-veri')
      html += '<div class="ks-not">Henüz kişisel öneri için yeterli veri yok: puan verdiğin ' +
        'bitmiş kitap sayısı ' + h.puanliSayi + ' (en az ' + h.esik + ' gerekir). ' +
        'Kitap bitirip puanladıkça bu liste sana göre şekillenir.' +
        (secilen.length ? ' Şimdilik en uzun süredir bekleyenler:' : '') + '</div>';
    if(!secilen.length){
      // boş-durum metni SAHİPLİK moduna göre (inceleme K2: istek modunda
      // "rafına kitap ekle" yanıltıcıydı)
      html += '<div class="ks-not">' + (havuz.length
        ? 'Bu süzgeçlerle eşleşen aday kalmadı — bir süzgeci kaldırmayı dene.'
        : S.sahiplik === 'istek'
          ? 'İstek listende bekleyen kitap yok.'
          : 'Okunacak listende önerilebilecek kitap yok — rafına kitap ekle, ya da ' +
            '"Şimdi değil" dediklerin ' + M.ERTELEME_GUN + ' gün sonra geri gelir.') + '</div>';
    }else{
      html += secilen.map(o => satirHtml(o, enY, enD)).join('');
      if(dahaVar)
        html += '<button class="btn btn-cerceve ks-daha" data-act="ks-daha">Daha fazla göster</button>';
    }
    if(erteliler.length){
      html += '<div class="ks-erteli"><button class="ks-sessiz" data-act="ks-erteli">' +
        erteliler.length + ' kitabı ertelemiştin — ' + (S.erteliAcik ? 'gizle' : 'göster') + '</button>' +
        (S.erteliAcik ? erteliler.map(k => {
          const kalan = Math.max(0, M.ERTELEME_GUN - gunFarki(k.ertelemeTarihi, bugun()));
          return '<div class="ks-erteli-item"><span class="ks-erteli-ad">' + esc(k.ad) + '</span>' +
            '<span class="ks-erteli-sag"><span class="ks-erteli-gun">' + kalan + ' gün sonra döner</span>' +
            '<button class="ks-basla" data-act="ks-geri-al" data-id="' + escAttr(k.id) + '">Geri al</button>' +
            '</span></div>';
        }).join('') : '') + '</div>';
    }
    html += bBolumHtml();   // v51: YENİ KİTAPLAR — Rafından'ın altında, kıl payı ayraçlı
    kap.innerHTML = html;
    if(typeof ktPlateHata === 'function') ktPlateHata(kap);   // levha kapakları tek yedek yoluna (v44)
  }

  function baslat(){
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    /* Bayat-panel panzehiri: veri değişince (detaydan bitir/sil, senkron...)
       Keşfet açıksa yeniden çizilir — çekirdek hepsiniCiz sarmalanır
       (çekirdek eklentiyi bilmez; kesfet.js kendi tazeliğinden sorumlu). */
    if(typeof window.hepsiniCiz === 'function'){
      const cekirdek = window.hepsiniCiz;
      window.hepsiniCiz = function(){
        cekirdek();
        if(typeof durum === 'object' && durum.sekme === 'kesfet') ciz();
      };
    }

    // ?sekme=kesfet derin bağlantısı: sekmeGec bu betik yüklenmeden koştu —
    // açılışta Keşfet aktifse ilk çizimi burada yap (inceleme K1).
    if(typeof durum === 'object' && durum.sekme === 'kesfet') ciz();

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      switch(el.dataset.act){
        case 'sekme':
          // sekmeGec bittikten sonra taze çizim (ampul düğmesi de bu yoldan gelir)
          if(el.dataset.v === 'kesfet') setTimeout(ciz, 0);
          break;
        case 'ks-suz': {
          const g = el.dataset.g, v = el.dataset.v;
          if(g === 'sahiplik') S.sahiplik = v;
          else S[g] = (S[g] === v) ? null : v;   // toggle: seçiliye bas → kaldır
          S.limit = SAYFA_ADIMI;
          ciz(); break; }
        case 'ks-daha': S.limit += SAYFA_ADIMI; ciz(); break;
        case 'ks-erteli': S.erteliAcik = !S.erteliAcik; ciz(); break;
        case 'ks-gizli': S.gizliAcik = !S.gizliAcik; ciz(); break;
        case 'ks-gizli-geri': bGeriAl(el.dataset.anah); break;
        case 'ks-basla':
          if(window.__oneri && window.__oneri.basla(el.dataset.id) &&
             typeof hepsiniCiz === 'function') hepsiniCiz();
          ciz(); break;
        case 'ks-ertele':
          if(window.__oneri && window.__oneri.ertele(el.dataset.id) &&
             typeof hepsiniCiz === 'function') hepsiniCiz();
          ciz(); break;
        case 'ks-geri-al':
          if(window.__oneri && window.__oneri.erteleGeriAl(el.dataset.id) &&
             typeof hepsiniCiz === 'function') hepsiniCiz();
          ciz(); break;
        case 'ks-b-getir': bGetir(); break;
        case 'ks-b-daha': B.acik = true; ciz(); break;
        case 'ks-b-ekle': bEkle(el.dataset.i); break;
        case 'ks-b-gizle': bGizle(el.dataset.i); break;
      }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();

  window.__kesfet = { ciz };   // test/tanı kancası
})();
