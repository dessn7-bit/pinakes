/* Kütüphane zenginleştirme — üç iş tek modülde (v63):
   M1 toplu zenginleştirme (eksik tür/ISBN/sayfa/yayınevi/yıl/kapak),
   M2 hızlı puanlama (puansız bitmişler), M3 bitiş yılı atama (tarihsiz bitmişler).
   Kendi kendine yeten modül: index.html'de tek satırlık script etiketiyle yüklenir.
   AD ALANI: sınıflar ve data-act değerleri 'zg-' önekli, id'ler 'zg' önekli.

   KARARLAR:
   - KAYNAK (ölçüldü, 20 kitaplık örneklem): kitaplik-ara /ara sonuçları TÜR
     TAŞIMIYOR (alanlar: ad,yazar,yayinevi,yil,sayfa,kapak,kaynak) ve /tur ucu
     ters yön (tür→kitap listesi) — 242 kitaba tür bulmak için kullanılamaz.
     Tek pratik tür kaynağı GOOGLE BOOKS categories. İki aşamalı sorgu:
     dar (intitle+inauthor) → boşsa gevşek ("ad" yazar). Ölçüm: dar 11/20,
     +gevşek ISBN 20/20, kategori 19/20 (taksonomiye güvenle eşlenen ~%60).
   - TÜR EŞLEME (v64'te ÖLÇÜMLE yeniden kuruldu — gerçek yedeğin ilk 30
     kitabında v63 4/30 buluyordu, canlı kullanımda 0/12 çıkmıştı):
     GÜVENLİ-GENİŞ sözlük + canlı taksonomi (worker /turler, 78 tür)
     doğrulaması: eşlenen ad taksonomide yoksa BOŞ, uydurma tür imkânsız.
     Eşleşme KELİME SINIRI ister ('art' "Performing Arts"i yakalayamaz) ve
     kategori BAŞINA denenir: taksonomiye eşlenen İLK güvenli kategori
     kazanır, kapıdan geçemeyen eşleşme aramayı KESMEZ (v63 kesiyordu —
     "Biography"→'Biyografi-Otobiyografi' gibi taksonomide olmayan hedefler
     kitabı boş bırakıyordu). Konu etiketleri (Reference, Education, Art,
     Performing Arts, Turkey, Nature, kişi kategorileri: Novelists/Poets/
     Dramatists/Scientists...) bilerek YOK. TR kategoriler ("Fransız
     romanı", "Dünya klasikleri") katla üzerinden eşlenir. Tür artık tek
     adayın değil BAŞLIĞI UYAN TÜM adayların kategorilerinden aranır;
     bulunamazsa ve 2. istek hakkı duruyorsa tür için gevşek sorgu atılır
     (kitap başına ≤2 istek bütçesi KORUNUR). Ölçüm v64: 14/30 — kalan
     boşların tamamı kategorisiz kaynak ya da bilinçli eleme.
   - KOTA: istekler arası en az ARALIK_MS bekleme; kitap başına en çok 2 istek
     (242×2=484 < günlük 1000). Kuyruk DURDURULABİLİR; durum kk_zengin_v1'de,
     yarım kalırsa kaldığı yerden sürer.
   - ÖNİZLEME ZORUNLU: tarama hiçbir şey YAZMAZ; bulunanlar önce özetle
     (alan başına sayı) gösterilir, "Uygula"ya basılmadan tek bayt yazılmaz.
     242 kitabı tek tek onaylatmak işkence → ORTA YOL: alan-düzeyi toplu onay
     + isteğe bağlı "tek tek gör" listesi ve satır başına çıkarma (✕).
   - DOLU ALANA DOKUNULMAZ: uygulama yalnız boş alanı doldurur; gelen değer
     mevcutla çelişiyorsa mevcut korunur (yazılmaz bile).
   - YAZIM DAMGA BASAR: tur/isbn/sayfa/yayınevi/yıl/kapak senkron parmak
     izinde → depoKaydet sarmalaması k.g'yi tazeler (kullanıcı eylemi).
   - M3 OTOMATİK TARİH YOK: uydurma tarih veri kirliliği. Kullanıcı kitap
     kitap YIL seçer; gün/ay bilinmediği için YYYY-01-01 yazılır (yıl
     istatistiği/raporu doğru olur; aylık şeritte Ocak'a yığılma bilinen
     dürüstlük maliyeti — raporda ŞÜPHE olarak kayıtlı). */
'use strict';
(function(){
  const KUYRUK_ANAHTAR = 'kk_zengin_v1';
  const ARALIK_MS = 650;          // istekler arası en az bekleme (kota nezaketi)
  const ALANLAR = ['tur', 'isbn', 'sayfa', 'yayinevi', 'yil', 'kapak'];
  const ALAN_AD = { tur: 'Tür', isbn: 'ISBN', sayfa: 'Sayfa', yayinevi: 'Yayınevi', yil: 'Yıl', kapak: 'Kapak' };
  const YIL_SAYISI = 15;          // M3 yıl ızgarası: bu yıldan geriye

  /* Google kategori → 1000Kitap taksonomi adı. Kurallar:
     (1) anahtarlar katla-katlanmış küçük harf yazılır;
     (2) eşleşme KELİME SINIRI ister ('art' "Performing Arts"i yakalayamaz);
     (3) 3. eleman 'tam' ise anahtar kategorinin TAMAMI olmalı
         ('roman' ↔ "Roman Empire" karışmasın);
     (4) SIRA ÖNEMLİ: spesifik önce, jenerikler (literature/novel/fiction)
         EN SONDA; sıra yalnız AYNI kategori metni içinde hüküm sürer,
         kategoriler arasında geliş sırası kazanır;
     (5) konu etiketleri (Reference, Education, Art, Turkey, Nature, Beer,
         Human anatomy, kişi kategorileri) BİLEREK YOK — tür değildir;
     (6) her satır "bu kategori GERÇEKTEN bu türü mü işaret ediyor"
         süzgecinden geçti; şüphelide eleme tarafında kalındı
         (ör. Atheism→Felsefe reddedildi: 1000Kitap rafı doğrulamadı).
     Eşlenen ad canlı taksonomide yoksa yine boş (ikinci kapı). */
  const TUR_ESLEME = [
    /* kurgu alt-türleri (spesifik) */
    ['science fiction', 'Bilim-Kurgu'],
    ['juvenile fiction', 'Çocuk'],
    ['juvenile nonfiction', 'Çocuk'],
    ['juvenile', 'Çocuk'],
    ['young adult', 'Gençlik'],
    ['fantasy', 'Fantastik'],
    ['horror', 'Korku-Gerilim'],
    ['ghost stories', 'Korku-Gerilim'],
    ['thrillers', 'Polisiye'],
    ['thriller', 'Polisiye'],
    ['mystery', 'Polisiye'],
    ['detective', 'Polisiye'],
    ['crime fiction', 'Polisiye'],
    ['adventure stories', 'Macera-Aksiyon'],
    ['adventure fiction', 'Macera-Aksiyon'],
    ['romance', 'Aşk'],
    ['love stories', 'Aşk'],
    ['graphic novels', 'Çizgi-Roman'],
    ['graphic novel', 'Çizgi-Roman'],
    ['comics', 'Çizgi-Roman'],
    ['manga', 'Manga'],
    ['fairy tales', 'Masal'],
    ['short stories', 'Hikaye (Öykü)'],
    /* sahne / şiir */
    ['poetry', 'Şiir'],
    ['drama', 'Tiyatro'],
    ['tragedies', 'Tiyatro'],
    ['tragedy', 'Tiyatro'],
    ['theater', 'Tiyatro'],
    ['theatre', 'Tiyatro'],
    ['plays', 'Tiyatro'],
    /* kurgu-dışı — spesifik bileşikler jeneriklerden ÖNCE */
    ['literary criticism', 'Eleştiri-Kuram'],
    ['history and criticism', 'Eleştiri-Kuram'],
    ['natural history', 'Bilim-Teknoloji-Mühendislik'],
    ['political science', 'Siyaset-Politika'],
    ['social sciences', 'Sosyoloji'],
    ['social science', 'Sosyoloji'],
    ['self-help', 'Kişisel Gelişim'],
    ['self-improvement', 'Kişisel Gelişim'],
    ['philosophy', 'Felsefe-Düşünce'],
    ['psychology', 'Psikoloji'],
    ['psychoanalysis', 'Psikoloji'],
    ['sociology', 'Sosyoloji'],
    ['politics', 'Siyaset-Politika'],
    ['history', 'Tarih'],
    ['biography', 'Biyografi'],
    ['autobiography', 'Biyografi'],
    ['memoirs', 'Anı-Mektup-Günlük'],
    ['memoir', 'Anı-Mektup-Günlük'],
    ['diaries', 'Anı-Mektup-Günlük'],
    ['correspondence', 'Anı-Mektup-Günlük'],
    ['essays', 'Deneme-İnceleme'],
    ['travel', 'Gezi'],
    ['music', 'Müzik'],
    ['mythology', 'Mitolojiler'],
    ['legends', 'Efsaneler-Destanlar'],
    ['folklore', 'Halk Edebiyatı'],
    ['islam', 'Din (İslam)'],
    ['sufism', 'Tasavvuf-Mezhepler-Tarikatlar'],
    ['christianity', 'Diğer İnançlar'],
    ['judaism', 'Diğer İnançlar'],
    ['buddhism', 'Diğer İnançlar'],
    ['economics', 'Ekonomi-Emek-İş Dünyası'],
    ['business', 'Ekonomi-Emek-İş Dünyası'],
    ['law', 'Hukuk'],
    ['medical', 'Sağlık-Tıp'],
    ['medicine', 'Sağlık-Tıp'],
    ['health', 'Sağlık-Tıp'],
    ['humor', 'Eğlence-Mizah'],
    ['humour', 'Eğlence-Mizah'],
    ['anthropology', 'Antropoloji-Etnoloji'],
    ['ethnology', 'Antropoloji-Etnoloji'],
    ['archaeology', 'Arkeoloji'],
    ['archeology', 'Arkeoloji'],
    ['astronomy', 'Astronomi'],
    ['astrophysics', 'Astronomi'],
    ['geography', 'Coğrafya'],
    ['linguistics', 'Dilbilimi-Etimoloji'],
    ['etymology', 'Dilbilimi-Etimoloji'],
    ['cooking', 'Yemek'],
    ['cookery', 'Yemek'],
    ['sports', 'Spor'],
    ['computers', 'Bilgisayar-İnternet'],
    ['ecology', 'Ekoloji'],
    ['interviews', 'Söyleşi-Röportaj'],
    ['aphorisms', 'Özlü Sözler-Duvar Yazıları'],
    ['encyclopedias', 'Sözlük-Kılavuz Kitap-Ansiklopedi'],
    ['dictionaries', 'Sözlük-Kılavuz Kitap-Ansiklopedi'],
    ['evolution', 'Bilim-Teknoloji-Mühendislik'],
    ['physics', 'Bilim-Teknoloji-Mühendislik'],
    ['biology', 'Bilim-Teknoloji-Mühendislik'],
    ['chemistry', 'Bilim-Teknoloji-Mühendislik'],
    ['technology', 'Bilim-Teknoloji-Mühendislik'],
    ['engineering', 'Bilim-Teknoloji-Mühendislik'],
    ['sciences', 'Bilim-Teknoloji-Mühendislik'],
    ['science', 'Bilim-Teknoloji-Mühendislik'],
    /* Türkçe kategoriler (Google TR kayıtları; katla katlanmış gelir) */
    ['dunya klasikleri', 'Dünya Klasikleri'],
    ['turk klasikleri', 'Türk Klasikleri'],
    ['romani', 'Roman'],            // "Fransız romanı", "Türk romanı"
    ['siiri', 'Şiir'],              // "Türk şiiri"
    ['siir', 'Şiir'],
    ['felsefe', 'Felsefe-Düşünce'],
    ['tiyatro', 'Tiyatro'],
    ['oykusu', 'Hikaye (Öykü)'],
    ['oyku', 'Hikaye (Öykü)'],
    ['hikaye', 'Hikaye (Öykü)'],
    ['tarihi', 'Tarih'],
    ['tarih', 'Tarih'],
    ['edebiyati', 'Edebiyat'],
    ['edebiyat', 'Edebiyat'],
    ['cocuk', 'Çocuk'],
    ['psikoloji', 'Psikoloji'],
    ['roman', 'Roman', 'tam'],      // TAM eşleşme: "Roman Empire" tuzağı
    /* jenerikler EN SONDA */
    ['literature', 'Edebiyat'],
    ['novels', 'Roman'],
    ['novel', 'Roman'],
    ['fiction', 'Roman']
  ];

  const GB_ANAHTAR = (function(){
    const m = /books\/v1\/volumes\?key=([A-Za-z0-9_-]+)/.exec(document.documentElement.innerHTML);
    return m ? m[1] : '';
  })();

  let calisiyor = false;          // tarama döngüsü aktif mi
  let durdur = false;             // kullanıcı duraklattı
  let taksonomi = null;           // canlı /turler önbelleği (oturumluk)
  let puanKuyruk = null, puanSira = 0, puanBasi = 0;   // M2 oturum durumu
  let tarihKuyruk = null, tarihSira = 0;               // M3 oturum durumu

  function bildir(m){ if(typeof toast === 'function') toast(m); }
  function bekle(ms){ return new Promise(r => setTimeout(r, ms)); }

  /* ---------- kuyruk durumu (localStorage — cihaz-yerel, senkrona girmez) ---------- */
  function kuyrukYukle(){
    try{ return JSON.parse(localStorage.getItem(KUYRUK_ANAHTAR)) || null; }
    catch(e){ return null; }
  }
  function kuyrukKaydet(k){
    try{ localStorage.setItem(KUYRUK_ANAHTAR, JSON.stringify(k)); }catch(e){ window._iz && window._iz('zenginKuyrukKaydet', e); }
  }
  function kuyrukTemizle(){
    try{ localStorage.removeItem(KUYRUK_ANAHTAR); }catch(e){ window._iz && window._iz('zenginKuyrukTemizle', e); }
  }

  /* ---------- eksik alan sayımı ---------- */
  /* v74 kapak tazeleme yardımcıları.
     ÖLÜ KAPAK: kitapta kapak URL'si VAR ama OpenLibrary o ISBN için kapak
     tutmuyor. ÖLÇÜM (kullanıcının 174 kapaklı kütüphanesi, 2026-08-18):
     `?default=false` eklenmiş URL, kapağı OLMAYAN 37 ISBN'in 37'sinde HTTP 404,
     kapağı OLAN 137'sinin 137'sinde HTTP 200 döndü — TAM ayrım, sıfır çakışma.
     Bu yüzden piksel/parlaklık sezgisi KULLANILMAZ: ölçüldü ve kümedeki en
     düşük varyanslı görselin (Oxford "Peace") gerçek bir kapak olduğu görüldü;
     eşik, kullanıcının çok sayıda sahip olduğu krem/minimal klasik baskıyı
     (İş Bankası, Gallimard) silerdi. HTTP durumu kesin, ucuz ve yanlış
     pozitif üretmez.
     EMNİYET YÖNÜ: yalnız KESİN 404 ölü sayılır; ağ hatası/CORS/başka durum →
     kapak GEÇERLİ kabul edilir (geçerli kapağı ezmemek esastır). */
  async function olKapakOluMu(u){
    if(!u || String(u).indexOf('covers.openlibrary.org') < 0) return false;
    const src = window.kapakSrc ? window.kapakSrc(u) : u;
    try{
      const r = await fetch(src, { method: 'HEAD' });
      return r.status === 404;
    }catch(e){ return false; }
  }
  /* Google Books thumbnail temizliği: http:// → https:// (karma içerik engellenir)
     ve &edge=curl kaldırılır (kıvrık kenar çizimi levha diline uymuyor).
     ÖLÇÜM: ölü kapaklı 37 kitabın isbn: sorgusunda dönen 13 thumbnail'in
     13'ü (%100) http:// ile başlıyordu, 1'i edge=curl taşıyordu. */
  function kapakTemizle(u){
    return String(u || '')
      .replace(/^http:\/\//i, 'https://')
      .replace(/([?&])edge=curl(&|$)/gi, (m, p1, p2) => p2 === '&' ? p1 : '');
  }
  /* Sorguda kullanilacak ISBN. Alan doluysa o; DEĞİLSE ölü OpenLibrary kapak
     URL'sinde gömülü olan ISBN (/b/isbn/<ISBN>-M.jpg).
     GEREKÇE (ölçüm): tazelemenin asıl hedefi olan 37 kitabın `isbn` ALANI boş,
     ISBN'leri yalnız kapak URL'sinde duruyor — yalnız alana bakılsaydı `isbn:`
     sorgusu tam da bu kitaplarda hiç çalışmazdı (canlı uçtan uca koşumda
     görüldü). URL'den okunan ISBN yalnız SORGUDA kullanılır, kitabın isbn
     alanına YAZILMAZ (doğrulanmamış veri kaydedilmez). */
  function sorguIsbn(k){
    if(k.isbn && String(k.isbn).trim()) return String(k.isbn).replace(/[^0-9Xx]/g, '');
    const m = String(k.kapak || '').match(/\/b\/isbn\/(\d{9}[\dXx]|\d{13})[-_.]/);
    return m ? m[1] : '';
  }
  function kapakAdayBul(liste){
    const a = (liste || []).find(v => v && v.imageLinks && v.imageLinks.thumbnail);
    return a ? kapakTemizle(a.imageLinks.thumbnail) : '';
  }
  function alanBos(k, alan){
    if(alan === 'sayfa' || alan === 'yil') return !k[alan];
    return !(k[alan] && String(k[alan]).trim());
  }
  /* BİLİNEN SINIR (v74): kapak sayacı ÖLÜ kapakları göremez — ölülük ancak ağ
     isteğiyle (HTTP 404) anlaşılır, sayaç ise eşzamanlı koşar. Yani "N kitapta
     kapak eksik" sayısı GERÇEKTEN eksik olandan düşüktür (kullanıcının
     verisinde 68 yazar, tarama 105'e kadar dokunur). Eksik göstermek fazla
     göstermekten iyidir; tarama sonunda önizleme gerçek sayıyı verir. */
  function eksikSayim(){
    const s = { toplam: 0 };
    ALANLAR.forEach(a => { s[a] = 0; });
    (veri.kitaplar || []).forEach(k => {
      s.toplam++;
      ALANLAR.forEach(a => { if(alanBos(k, a)) s[a]++; });
    });
    return s;
  }

  /* ---------- Google Books sorgusu (categories DAHİL — mevcut aramaGoogle
     categories okumadığı için burada kendi ayrıştırıcımız var) ---------- */
  async function gbSor(q, sinyal){
    const y = await fetch('https://www.googleapis.com/books/v1/volumes?key=' + GB_ANAHTAR +
      '&country=TR&maxResults=10&printType=books&q=' + encodeURIComponent(q),
      sinyal ? { signal: sinyal } : undefined);
    const j = await y.json();
    if(j.error) throw new Error('google-' + j.error.code);
    return (j.items || []).map(it => it.volumeInfo || {});
  }
  function baslikUyar(kitapAd, adayBaslik){
    const a = katla(kitapAd), b = katla(String(adayBaslik || ''));
    if(!a || !b) return false;
    return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }
  function rxKac(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* Kategori listesi (geliş SIRASI korunur) → taksonomiye eşlenen İLK güvenli
     tür. Kategori başına sözlük sırayla denenir; kelime sınırı zorunlu; 'tam'
     işaretli anahtar kategorinin tamamını ister. Taksonomi kapısından
     geçemeyen eşleşme aramayı KESMEZ — UYDURMA yine imkânsız (iki kapı). */
  function turAdaylari(kategoriler){
    /* Sözlüğe uyan tür adları, GELİŞ SIRASIYLA (kategori × sözlük sırası).
       turCevir'in iç döngüsü buraya çıkarıldı — davranış AYNI, tek fark
       taksonomi kapısının dışarıda kalması. Kapısız sürümü (turCevirHam)
       yalnız KIYAS yapan çağıran kullanır (v77: Keşfet tür süzgeci); oraya
       çıkan değer hiçbir kayda yazılmadığı için doğrulama gerekmez — dahası,
       gerekseydi taksonomi henüz yüklenmemişken TÜM adaylar "bilinmeyen"
       olurdu (süzgeç sessizce her şeyi elerdi). */
    const sonuc = [];
    if(!Array.isArray(kategoriler)) return sonuc;
    for(const kat of kategoriler){
      const metin = katla(kat);
      if(!metin) continue;
      for(const es of TUR_ESLEME){
        const uydu = es[2] === 'tam' ? metin === es[0]
          : new RegExp('\\b' + rxKac(es[0]) + '\\b').test(metin);
        if(uydu) sonuc.push(es[1]);
      }
    }
    return sonuc;
  }
  function turCevir(kategoriler){
    if(!taksonomi) return '';
    for(const hedefAd of turAdaylari(kategoriler)){
      /* canlı taksonomi doğrulaması: ad ya da seo katlaması eşleşmeli */
      const hedef = katla(hedefAd);
      const t = taksonomi.find(x => katla(x.ad) === hedef || katla(x.seo) === hedef);
      if(t) return t.ad;   // İLK güvenli eşleşme kazanır
    }
    return '';
  }
  /* KapıSIZ çeviri (v77): yalnız KIYAS için — kitap kaydına ASLA yazılmaz. */
  function turCevirHam(kategoriler){ return turAdaylari(kategoriler)[0] || ''; }
  /* Başlığı uyan adayların kategorileri — aday sırası korunur, tekrarsız. */
  function kategoriTopla(adaylar, kitapAd){
    const gorulen = {}, sonuc = [];
    for(const v of adaylar){
      if(!baslikUyar(kitapAd, v.title)) continue;
      for(const kat of (v.categories || [])){
        const anah = katla(kat);
        if(gorulen[anah]) continue;
        gorulen[anah] = 1;
        sonuc.push(kat);
      }
    }
    return sonuc;
  }
  /* Tek kitap için bulunanlar: yalnız EKSİK alanlar sorgulanır/derlenir.
     İstek bütçesi kitap başına ≤2 KORUNUR: dar + en çok BİR gevşek sorgu.
     Gevşek, v63'te yalnız dar SIFIR sonuç verince atılıyordu; artık uyan
     aday bulunamayınca da (aynı düşüş, daha erken yakalanır) ya da tür
     hâlâ boşken (kategori kaynağını genişletmek için) atılır. */
  async function kitapSorgula(k){
    const eksikler = ALANLAR.filter(a => alanBos(k, a));
    /* v74: kapak alanı DOLU görünse de OpenLibrary o ISBN'de kapak tutmuyorsa
       (?default=false → 404) kitap kapaksız sayılır ve tazelenir. Kullanıcının
       kütüphanesinde bu durumda 37 kitap ölçüldü; alan dolu olduğu için
       zenginleştirmeye hiç girmiyorlardı. Tek ek istek, yalnız OpenLibrary
       kapağı olan kitaplar için. */
    let kapakOlu = false;
    if(eksikler.indexOf('kapak') < 0 && await olKapakOluMu(k.kapak)){
      eksikler.push('kapak'); kapakOlu = true;
    }
    if(!eksikler.length) return null;
    /* v74 KAYNAK SIRASI — kapak için ÖNCE isbn: sorgusu.
       Gerekçe (ölçüm): ISBN sorgusu BASKIYA birebirdir; başlık eşleşmesi farklı
       baskının kapağını getirebiliyor. Ölü kapaklı 37 kitapta isbn: sorgusu
       13 kapak buldu (%35,1). İstek yalnız kapak eksikken ve ISBN varken atılır
       (kota: kitap başına +1). Diğer alanlar mevcut ad+yazar yolundan gelir —
       tür/sayfa/yıl mantığı DEĞİŞMEDİ. */
    let isbnAdaylar = null;
    const sIsbn = sorguIsbn(k);
    if(eksikler.indexOf('kapak') >= 0 && sIsbn){
      /* isbn: sorgusu bir EK yol; başarısız olması MEVCUT ad+yazar yolunu
         ÖLDÜRMEMELİ. Google Books bu uçta aralıklı 503 veriyor (canlı koşumda
         ölçüldü: sorgu patlayınca kitapSorgula tümden düşüyor ve daha önce
         kapak BULUNAN kitap bile kapaksız kalıyordu — eklenen yetenek mevcut
         yeteneği geriletmiş oluyordu). Hata yutulur, akış ad+yazar ile sürer. */
      try{
        isbnAdaylar = await gbSor('isbn:' + sIsbn);
      }catch(e){ isbnAdaylar = null; }
      await bekle(ARALIK_MS);
    }
    const dar = 'intitle:"' + k.ad + '"' + (k.yazar ? ' inauthor:"' + k.yazar + '"' : '');
    const adaylar1 = await gbSor(dar);
    let aday = adaylar1.find(v => baslikUyar(k.ad, v.title));
    let adaylar2 = null;
    if(!aday){
      await bekle(ARALIK_MS);
      adaylar2 = await gbSor('"' + k.ad + '" ' + (k.yazar || ''));
      aday = adaylar2.find(v => baslikUyar(k.ad, v.title));
    }
    /* TÜR: tek adayın değil, başlığı uyan TÜM adayların kategorileri
       (geliş sırası korunur); hâlâ boşsa ve gevşek daha atılmadıysa
       tür için gevşek de denenir — istek sınırı yine ≤2. */
    let tur = '';
    if(eksikler.indexOf('tur') >= 0){
      tur = turCevir(kategoriTopla(adaylar1, k.ad)
        .concat(adaylar2 ? kategoriTopla(adaylar2, k.ad) : []));
      if(!tur && adaylar2 === null){
        await bekle(ARALIK_MS);
        adaylar2 = await gbSor('"' + k.ad + '" ' + (k.yazar || ''));
        tur = turCevir(kategoriTopla(adaylar2, k.ad));
      }
    }
    /* Başlık eşleşmesi tutmasa bile ISBN'den gelen kapak KAYBOLMAZ: isbn:
       sorgusu baskıya birebir olduğu için başlık doğrulamasına ihtiyaç duymaz.
       (Ölü kapaklı kitapların bir kısmında başlık eşleşmesi tutmuyor.) */
    const isbnKapak = kapakAdayBul(isbnAdaylar);
    if(!aday) return isbnKapak ? (kapakOlu ? { kapak: isbnKapak, __kapakOlu: true }
                                           : { kapak: isbnKapak }) : null;
    const kimlik = aday.industryIdentifiers || [];
    const i13 = kimlik.find(x => x && x.type === 'ISBN_13');
    const i10 = kimlik.find(x => x && x.type === 'ISBN_10');
    const bulunan = {};
    if(tur) bulunan.tur = tur;
    if(eksikler.indexOf('isbn') >= 0){
      const ham = (i13 && i13.identifier) || (i10 && i10.identifier) || '';
      const B = window.__barkod;
      /* checksum'dan geçmeyen ISBN yazılmaz (barkod.js doğrulayıcısı) */
      if(ham && (!B || !B.isbnGecerli || B.isbnGecerli(ham))) bulunan.isbn = B && B.isbnTemizle ? B.isbnTemizle(ham) : ham;
    }
    if(eksikler.indexOf('sayfa') >= 0 && aday.pageCount > 0) bulunan.sayfa = aday.pageCount;
    if(eksikler.indexOf('yayinevi') >= 0 && aday.publisher) bulunan.yayinevi = String(aday.publisher);
    if(eksikler.indexOf('yil') >= 0 && aday.publishedDate){
      const y = parseInt(String(aday.publishedDate).slice(0, 4));
      if(y > 1400 && y <= new Date().getFullYear() + 1) bulunan.yil = y;
    }
    /* Kapak: isbn: sonucu öncelikli, yoksa başlık-eşleşen aday. İkisi de yoksa
       alan BOŞ KALIR — uydurma kapak yazılmaz. OpenLibrary'ye "son çare" olarak
       DÖNÜLMEZ (karar): tazelenen kapakların 37'si zaten OpenLibrary'nin
       kapağı olmayan ISBN'leri; doğrulanmamış bir URL yazmak aynı ölü-kapak
       kusurunu yeniden üretirdi. */
    if(eksikler.indexOf('kapak') >= 0){
      const kpk = isbnKapak || (aday.imageLinks && aday.imageLinks.thumbnail
        ? kapakTemizle(aday.imageLinks.thumbnail) : '');
      if(kpk){ bulunan.kapak = kpk; if(kapakOlu) bulunan.__kapakOlu = true; }
    }
    return Object.keys(bulunan).length ? bulunan : null;
  }

  /* ---------- OTOMATİK TÜR (v65): yeni eklenen kitaba kayıt anında ----------
     Zenginleştirme MEVCUT kitapları dolduruyordu; yeni eklenen kitapta tür yine
     boş kalıyor, kullanıcı elle seçmek zorunda kalıyordu. AYNI motor (turCevir +
     kategoriTopla + gbSor + canlı taksonomi) kayıt anında da çalışır — kod
     kopyası yok. SÖZLEŞME:
     · Kayıt GECİKMEZ: çağıran push+depoKaydet'ini yapar, kuyruk arkadan koşar;
       tür bulununca alan + k.g damgası güncellenir (senkron taşır).
     · Kitap başına EN FAZLA 1 Google isteği; ekleme akışının kendi yanıtındaki
       kategoriler eşlenirse 0 istek. Taksonomi (/turler) oturumda bir kez,
       tarama döngüsüyle ORTAK önbellek.
     · Kuyruk ARALIK_MS ile serileştirir (seri taramada kota nezaketi).
     · Tür bulunamazsa BOŞ kalır — uydurma yok; kullanıcı formdan girebilir.
     · Yazım anında alanBos YENİDEN denetlenir: arka plan yanıtı gelene kadar
       kullanıcı türü elle doldurduysa EZİLMEZ (v63 çift-katman dersinin dengi).
     · Kuyruk cihaz-belleğinde, kalıcı DEĞİL (karar): sayfa kapanırsa kalan
       işler düşer; kurtarma yolu zaten var — Ayarlar ▸ Zenginleştir aynı
       motorla boşları tarar. İkinci bir kalıcı kuyruk onun işini kopyalardı. */
  const otoKuyruk = [];
  const otoKuyrukta = new Set();
  let otoCalisiyor = false;
  let otoSonIstek = 0;   // son Google isteğinin zamanı — aralık KUYRUKTAN BAĞIMSIZ tutulur
  function otoTur(id, kategoriler){
    if(!id || otoKuyrukta.has(id)) return;
    otoKuyrukta.add(id);
    otoKuyruk.push({ id, kategoriler: (Array.isArray(kategoriler) && kategoriler.length)
      ? kategoriler : null });
    otoSur();
  }
  async function otoSur(){
    if(otoCalisiyor) return;
    otoCalisiyor = true;
    try{
      while(otoKuyruk.length){
        const is = otoKuyruk.shift();
        try{ await otoIsle(is); }
        catch(e){ /* ağ/kota hatası: tür boş kalır — sessiz, kayıt zaten tamam */ }
        otoKuyrukta.delete(is.id);
      }
    }finally{ otoCalisiyor = false; }
  }
  /* otoIsle dönüşü (v66): 'yazildi' | 'bulunamadi' | 'dolu' | 'red' |
     'taksonomi-yok'. Ağ/kota hatasını FIRLATIR — çağıran ayırt etsin: açılış
     taraması hata fırlayan kitaba "denendi" DAMGASI BASMAZ (hiç sorulamamış
     kitabı 90 gün bloklamak yanlış olurdu), tamamlanan sorguya (bulunan YA DA
     bulunamayan) basar. */
  async function otoIsle(is){
    const k = (veri.kitaplar || []).find(x => x.id === is.id);
    if(!k || !alanBos(k, 'tur')) return 'dolu';
    /* turRed: kullanıcı bu kitapta otomatik türü GERİ ALDI — kalıcı red
       (senkronlu union, kesfetGizli deseni). Otomatik yazım bir daha denemez. */
    if((veri.turRed || {})[is.id]) return 'red';
    if(!taksonomi){
      try{ taksonomi = await window.__ara.turler(); }
      catch(e){ return 'taksonomi-yok'; }   // eşleme imkânsız — boş kalır, damga YOK
    }
    let tur = is.kategoriler ? turCevir(is.kategoriler) : '';
    if(!tur){
      /* Aralık kuyruk döngüsüne değil SON İSTEĞE bağlı: kuyruk boşalıp yeni
         kitapla yeniden başlasa da iki Google isteği arasında en az ARALIK_MS
         geçer. while: iki bekleyen aynı bayat damgadan uyanıp çifte istek
         atmasın (açılış taraması + ekleme kuyruğu eşzamanlı koşabilir). */
      let kalan;
      while((kalan = otoSonIstek + ARALIK_MS - Date.now()) > 0) await bekle(kalan);
      otoSonIstek = Date.now();
      // kitap başına TEK istek — gevşek 2. sorgu bilerek YOK (kota bütçesi)
      const adaylar = await gbSor('intitle:"' + k.ad + '"'
        + (k.yazar ? ' inauthor:"' + k.yazar + '"' : ''));
      tur = turCevir(kategoriTopla(adaylar, k.ad));
    }
    /* Sorgu TAMAMLANDI (ağ hatası fırlamadı) → "denendi" damgası: bulunamayan
       kitap her açılışta yeniden sorulup kotayı yakmasın (90 günlük defter). */
    denemeDamgala(is.id);
    /* await SONRASI taze arama (kapak.js dersi: senkron veri.kitaplar'ı yeni
       diziyle değiştirebilir, eski referansa yazmak ölü nesneye yazar). Yazım
       anında alanBos + turRed YENİDEN denetlenir: yanıt beklenirken kullanıcı
       türü elle doldurduysa ya da geri aldıysa arka plan onu EZMEZ. */
    const canli = (veri.kitaplar || []).find(x => x.id === is.id);
    if(tur && canli && alanBos(canli, 'tur') && !(veri.turRed || {})[is.id]){
      canli.tur = tur;
      canli.g = Date.now();   // kullanıcı-görünür alan değişti — damga (senkron taşır)
      /* Geri alma defteri: OTOMATİK yazılan her tür kaydedilir (hangi kitap,
         hangi tür, ne zaman) — elle girilen tür buraya asla girmez, çünkü
         elle dolu alan yukarıdaki alanBos kapısından zaten geçemez. */
      const atanan = atananOku();
      atanan[is.id] = { tur, t: Date.now() };
      atananYaz(atanan);
      if(typeof depoKaydet === 'function') depoKaydet();
      if(typeof hepsiniCiz === 'function') hepsiniCiz();
      durumTazele(); otoDurumTazele();
      return 'yazildi';
    }
    return tur ? 'dolu' : 'bulunamadi';
  }

  /* ---------- AÇILIŞ TARAMASI (v66): tür ARKA PLANDA kendiliğinden ----------
     Kullanıcı kararı: türü eksik kitap için elle "zenginleştir" koşturmak
     istemiyor — uygulama açılınca türü boş kitaplar sessizce, önizlemesiz
     doldurulur (yanlışın telafisi geri alma yüzeyi, aşağıda). SÖZLEŞME:
     · TETİK: açılıştan OTO_BASLANGIC_MS sonra kendiliğinden — açılışı
       geciktirmez (ilk boyama/etkileşim ağ işinden önce biter), ilerleme
       çubuğu dayatmaz; durum Ayarlar ▸ Katalog araçları kartında.
     · KOTA: oturum başına en çok OTO_OTURUM_SINIR kitap (60×≤1 istek =
       günlük 1000 kotasının ≤%6'sı; 650ms aralıkla ≈40 sn arka plan işi;
       242'lik kütüphane ~4 açılışta biter) — kalan sonraki açılışa.
     · DENENDİ DEFTERİ (cihaz-yerel kk_zg_oto_deneme_v1, SENKRONA GİRMEZ —
       karar): bulunamayan kitap da damgalanır, OTO_YENIDEN_MS (90 gün)
       geçmeden yeniden sorulmaz. Neden kitap alanı değil: sessiz arka plan
       işi kitap damgası (k.g) basamaz — 60 kitaba damga basmak çevrimdışı
       cihazın gerçek düzenlemelerini senkron birleşiminde ezebilirdi; salt
       "denedim" notu için ANLIK_SURUM artışı + tüm kütüphane yeniden
       damgalama göçü orantısız. Maliyeti: ikinci cihaz kendi defterini
       sıfırdan doldurur — ama bulunan türler senkronla yayıldığından onun
       gerçek yükü yalnız BULUNAMAYANLARDIR (kategorisiz kaynak, ~%40-50).
     · 90 GÜN gerekçesi: GB kayıtları zamanla zenginleşiyor (v64 ölçümü:
       kategoriler koşumdan koşuma değişken); çeyrek dönemde ~100 bulunamayan
       × ≤1 istek önemsiz, daha sık denemek kota israfı.
     · AĞ HATASI: art arda 3 hata → sessizce dur; hata fırlayan kitaba damga
       basılmadığı için sonraki açılış kaldığı yerden sürer.
     · turRed'li (geri alınmış) kitap HİÇ aday olmaz. */
  const OTO_DENEME_ANAHTAR = 'kk_zg_oto_deneme_v1';
  const OTO_ATANAN_ANAHTAR = 'kk_zg_oto_atanan_v1';
  const OTO_YENIDEN_MS = 90 * 24 * 3600 * 1000;
  const OTO_OTURUM_SINIR = 60;
  const OTO_BASLANGIC_MS = 1500;
  function defterOku(anahtar){
    try{ return JSON.parse(localStorage.getItem(anahtar)) || {}; }
    catch(e){ return {}; }
  }
  function defterYaz(anahtar, d){
    try{ localStorage.setItem(anahtar, JSON.stringify(d)); }catch(e){ window._iz && window._iz('zenginDefterYaz', e); }
  }
  function denemeDamgala(id){
    const d = defterOku(OTO_DENEME_ANAHTAR);
    d[id] = Date.now();
    defterYaz(OTO_DENEME_ANAHTAR, d);
  }
  function atananOku(){ return defterOku(OTO_ATANAN_ANAHTAR); }
  function atananYaz(d){ defterYaz(OTO_ATANAN_ANAHTAR, d); }
  /* Geçerli "otomatik atanan" kayıtları: kitap duruyor VE tür hâlâ otomatik
     yazılanla aynı. Kullanıcı türü elle DEĞİŞTİRDİYSE kayıt düşer — geri alma
     listesi kullanıcının düzeltmesini asla geri çeviremez. */
  function atananGecerli(){
    const atanan = atananOku();
    const sonuc = [];
    let temizlendi = false;
    for(const [id, kayit] of Object.entries(atanan)){
      const k = (veri.kitaplar || []).find(x => x.id === id);
      if(k && kayit && k.tur === kayit.tur) sonuc.push({ id, kitap: k, kayit });
      else { delete atanan[id]; temizlendi = true; }
    }
    if(temizlendi) atananYaz(atanan);
    return sonuc;
  }
  let otoOturum = { durum: 'bekliyor', bakilan: 0, bulunan: 0 };
  let otoTaraKostu = false;
  function otoAdaylar(){
    const deneme = defterOku(OTO_DENEME_ANAHTAR);
    const simdi = Date.now();
    return (veri.kitaplar || []).filter(k => alanBos(k, 'tur')
      && !(veri.turRed || {})[k.id]
      && !(deneme[k.id] && (simdi - deneme[k.id]) < OTO_YENIDEN_MS));
  }
  async function otoTara(){
    if(otoTaraKostu || calisiyor) return;   // oturumda bir kez; elle tarama açıksa ona bırak
    otoTaraKostu = true;
    /* window.__KK_OTO_SINIR: test kancası (oturum sınırını 60 kitap tohumlamadan
       sınayabilmek için) — üründe tanımsız, varsayılan sabit geçerli. */
    const sinir = (typeof window.__KK_OTO_SINIR === 'number')
      ? window.__KK_OTO_SINIR : OTO_OTURUM_SINIR;
    const adaylar = otoAdaylar().slice(0, sinir);
    if(!adaylar.length){ otoOturum.durum = 'bitti'; otoDurumTazele(); return; }
    otoOturum.durum = 'araniyor';
    otoDurumTazele();
    let ardArdaHata = 0;
    for(const k of adaylar){
      if(calisiyor) break;   // kullanıcı elle taramayı açtı — arka plan çekilir
      let sonuc;
      try{ sonuc = await otoIsle({ id: k.id, kategoriler: null }); }
      catch(e){
        /* ağ/kota hatası: damga BASILMADI (otoIsle sözleşmesi) — bu kitap
           sonraki açılışta yeniden denenir; art arda 3 hata = kaynak düşmüş,
           sessizce dur. */
        if(++ardArdaHata >= 3){ otoOturum.durum = 'ag-yok'; otoDurumTazele(); return; }
        continue;
      }
      ardArdaHata = 0;
      if(sonuc === 'taksonomi-yok'){ otoOturum.durum = 'ag-yok'; otoDurumTazele(); return; }
      otoOturum.bakilan++;
      if(sonuc === 'yazildi') otoOturum.bulunan++;
      otoDurumTazele();
    }
    otoOturum.durum = 'bitti';
    otoDurumTazele();
  }
  /* Geri alma: tür temizlenir (kullanıcı eylemi — damga meşru) + kalıcı red.
     Red SENKRONLU (veri.turRed union, kesfetGizli emsali) — cihaz-yerel kalsa
     öbür cihazın açılış taraması aynı yanlış türü yeniden yazar, senkron da
     bu cihaza geri taşırdı. Union kitap damgasına dokunmaz, ANLIK_SURUM
     artışı istemez (hedefSayfa/kesfetGizli emsali, aynı kabul edilen risk). */
  function otoGeriAl(id){
    const atanan = atananOku();
    const kayit = atanan[id];
    if(!kayit) return false;
    veri.turRed = veri.turRed || {};
    veri.turRed[id] = Date.now();
    const k = (veri.kitaplar || []).find(x => x.id === id);
    if(k && k.tur === kayit.tur){ k.tur = ''; k.g = Date.now(); }
    delete atanan[id];
    atananYaz(atanan);
    return true;
  }
  function otoGeriAlTek(id){
    if(!otoGeriAl(id)) return;
    if(typeof depoKaydet === 'function') depoKaydet();
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    durumTazele(); otoDurumTazele(); otoListeCiz();
    bildir('Tür geri alındı — bu kitaba bir daha otomatik tür yazılmaz');
  }
  function otoGeriAlTum(){
    const ids = atananGecerli().map(g => g.id);
    if(!ids.length) return;
    ids.forEach(otoGeriAl);
    if(typeof depoKaydet === 'function') depoKaydet();
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    durumTazele(); otoDurumTazele(); otoListeCiz();
    bildir(ids.length + ' kitabın türü geri alındı');
  }

  /* ---------- Otomatik tür kartı (Ayarlar ▸ Katalog araçları) ---------- */
  function otoKartEkle(){
    const yuva = document.getElementById('ayYuvaKatalog');
    if(!yuva || document.getElementById('zgOtoKart')) return;
    const kart = document.createElement('div');
    kart.className = 'ay-blok'; kart.id = 'zgOtoKart';
    kart.innerHTML = '<h3 class="ay-baslik">Otomatik tür</h3>'
      + '<p class="ay-not">Türü boş kitapların türü, uygulama açıkken arka planda sessizce aranır '
      + 've bulunursa doğrudan yazılır (1000Kitap düzenine eşlenemeyen boş kalır). '
      + 'Yanlış bulunanı aşağıdan geri alabilirsin — geri aldığın kitaba bir daha otomatik tür yazılmaz.</p>'
      + '<div class="zg-depo-satir" id="zgOtoDurum">—</div>'
      + '<div class="ay-eylem"><button class="btn btn-cerceve" data-act="zg-oto-liste">'
      + 'Otomatik atanan türler (<span id="zgOtoSayi">0</span>)</button></div>';
    yuva.appendChild(kart);
    otoDurumTazele();
  }
  function otoDurumTazele(){
    const sayi = document.getElementById('zgOtoSayi');
    if(sayi) sayi.textContent = String(atananGecerli().length);
    const el = document.getElementById('zgOtoDurum');
    if(!el) return;
    const kalanN = otoAdaylar().length;
    el.textContent = otoOturum.durum === 'araniyor'
      ? kalanN + ' kitapta tür aranıyor… (bu oturumda ' + otoOturum.bakilan + ' bakıldı, '
        + otoOturum.bulunan + ' bulundu)'
      : otoOturum.durum === 'ag-yok'
        ? 'Kaynağa ulaşılamadı — sonraki açılışta kaldığı yerden sürer.'
        : otoOturum.durum === 'bitti'
          ? (otoOturum.bakilan
            ? 'Bu oturumda ' + otoOturum.bakilan + ' kitaba bakıldı, ' + otoOturum.bulunan
              + ' tür bulundu.' + (kalanN ? ' Sırada ' + kalanN + ' kitap — sonraki açılışta.' : '')
            : (kalanN ? kalanN + ' kitap sırada — sonraki açılışta.' : 'Türü boş kitap kalmadı.'))
          : (kalanN ? kalanN + ' kitapta tür aranacak.' : 'Türü boş kitap yok.');
  }
  function otoListeCiz(){
    const g = document.getElementById('zgOtoOrtuGovde');
    if(!g) return;
    const liste = atananGecerli().sort((a, b) => (b.kayit.t || 0) - (a.kayit.t || 0));
    if(!liste.length){
      g.innerHTML = '<div class="zg-satir">Otomatik atanmış tür yok.</div>' +
        '<div class="form-alt"><button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgOtoOrtu" style="flex:1">Kapat</button></div>';
      return;
    }
    g.innerHTML =
      '<p class="zg-not">Bu türleri uygulama kendisi yazdı. Geri aldığın kitabın türü boşalır ve '
      + 'o kitaba bir daha otomatik tür yazılmaz; elle her zaman girebilirsin.</p>'
      + '<div class="zg-onizle-liste">' + liste.map(({ id, kitap, kayit }) =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">'
        + '<span class="zg-onizle-ad">' + esc(kitap.ad) + '</span>'
        + '<span class="zg-onizle-alan">Tür: ' + esc(kayit.tur) + '</span></div>'
        + '<button class="zg-cikar" data-act="zg-oto-geri" data-kid="' + escAttr(id) + '" '
        + 'aria-label="Bu kitabın türünü geri al">✕</button></div>').join('') + '</div>'
      + '<div class="form-alt">'
      + '<button class="btn btn-cerceve" data-act="zg-oto-geri-tum" style="flex:1">Tümünü geri al</button>'
      + '<button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgOtoOrtu" style="flex:1">Kapat</button></div>';
  }

  /* ---------- TÜR LİSTESİ İÇE AKTARIMI (v67) ----------
     Elle hazırlanmış {surum, tur:[{ad,yazar,tur}]} dosyası YALNIZ tür alanına
     dokunur — "yedekten geri yükleme" son değişiklikleri (puan, yeni kitap,
     otomatik dolan tür) ezerdi, bu yol ezmez. SÖZLEŞME:
     · Eşleme ad+yazar, TR-katlamalı (katla) — "KRAL OIDIPUS" = "Kral Oidipus".
     · TAKSONOMİ KAPISI: dosyadaki tür canlı /turler'de yoksa kayıt ATLANIR ve
       raporlanır; yazılan değer her zaman taksonominin KENDİ adıdır.
       ÇEVRİMDIŞI KARARI: taksonomi doğrulanamıyorsa içe aktarım HİÇ BAŞLAMAZ
       (dürüst mesaj, sıfır yazım). Gerekçe: kapısız 242 değer tek seferde tüm
       kütüphaneyi kirletebilir; "uydurma tür imkânsız" (v63'ten beri değişmez)
       tek istisnayla delinmez; içe aktarım bilinçli, tekrarlanabilir bir iş —
       internet varken yeniden denenir. Kapıyı "uyarıyla geç" yapmak, yazım
       hatalı bir dosyayı sessizce kalıcılaştırırdı.
     · Dolu tür dosyadaki değerle DEĞİŞİR (elle liste otomatik tahminden
       güvenilir — kullanıcı kararı) ama önizlemede AYRI sayılır/listelenir.
     · ÖNİZLEME ZORUNLU: özet + ayrıntı listeleri + onay; onaysız tek bayt yok.
     · Yazım k.g damgası basar (kullanıcı eylemi, senkron taşır) ve kitabı
       denendi defterine işler (otomatik tarama yeniden sormasın). Otomatik-
       atanan defterine BİLEREK dokunulmaz: elle yüklenen tür "otomatik" değil;
       üzerine yazılan eski otomatik kayıt atananGecerli'de kendiliğinden düşer,
       "geri al" elle yükleneni asla silemez. */
  /* ---------- alan içe aktarım borusu (v73: cfg-parametreli) ----------
     v67/v70 tür borusu ALAN-PARAMETRELİ genelleştirildi (KARAR): adTr için
     ikinci bir boru kopyalamak yerine alan-özel ~25 nokta cfg nesnesine
     taşındı. Tür cfg'sindeki TÜM id/act/metinler eski değerlerle BİREBİR —
     g56/g59/g60 seçici ve metin kilitleri bozulmadan. Plan TEKİL (icePlan):
     aynı anda tek akış; iceOku başka akışın açık ortusunu kapatır (paylaşılan
     uygula düğmesinin yanlış plana yazma riski sıfırlanır).
     v80: ÜÇÜNCÜ tip ÖZET (M3) için cfg'ye iki OPSİYONEL kanca eklendi —
     oku(k) (varsayılan k[cfg.anahtar]) ve yazHam(k, deger) (varsayılan senkron
     k[anahtar]=deger + k.g damgası). Kancasız cfg'lerde (tur/adTr) davranış
     BİREBİR eski. Özet metni kitapta değil IndexedDB'de yaşadığından oku
     window.__ozet.oku'ya gider; yazım ise iceUygula'nın AYRI async dalında
     (iceUygulaOzet) __ozet.kaydetHam ile parçalı koşar — yazHam'a girmez. */
  const ICE_TUR = {
    anahtar: 'tur', kaynakAnahtar: 'tur', taksonomiKapisi: true,
    ortuId: 'zgTurIceOrtu', ortuBaslik: 'Tür listesi yükle',
    hazirYol: 'veri/turler-yerlesik.json',
    /* deneme damgası YALNIZ tür: açılış TUR taraması dolan kitabı yeniden
       sormasın. adTr'de damga basılmaz — basılsaydı türü hâlâ boş kitabın
       gelecekteki tur taramasını 90 gün bastırırdı (çapraz-alan yan etki). */
    denemeDamgala: true,
    sonTazele(){ durumTazele(); otoDurumTazele(); },
    act: { uygula: 'zg-tur-uygula', vazgec: 'zg-tur-vazgec' },
    metin: {
      bicimYok: 'Bu dosyada tür listesi yok — beklenen biçim: { "tur": [ {ad, yazar, tur} ] }',
      dolacak: ' kitapta boş tür dolacak',
      degisecek: ' kitapta mevcut tür DEĞİŞECEK',
      yalnizNot: 'Yalnız TÜR alanı yazılır; puan, sayfa, durum, not gibi hiçbir başka alana ' +
        'dokunulmaz. Onaylamadan hiçbir şey yazılmaz.',
      degisecekBaslik: 'Mevcut türü değişecekler',
      yazDugme: n => 'Türleri yaz (' + n + ')',
      toastYazildi: n => n + ' kitabın türü dosyadan yazıldı'
    }
  };
  const ICE_ADTR = {
    anahtar: 'adTr', kaynakAnahtar: 'adTr', taksonomiKapisi: false,
    ortuId: 'zgAdTrOrtu', ortuBaslik: 'Türkçe ad listesi',
    // KARAR: adTr için dosya seçici yok — tek giriş yerleşik liste
    hazirYol: 'veri/turkce-adlar-yerlesik.json',
    denemeDamgala: false,
    sonTazele(){ durumTazele(); },
    act: { uygula: 'zg-adtr-uygula', vazgec: 'zg-adtr-vazgec' },
    metin: {
      bicimYok: 'Bu dosyada Türkçe ad listesi yok — beklenen biçim: { "adTr": [ {ad, yazar, adTr} ] }',
      dolacak: ' kitapta boş Türkçe ad dolacak',
      degisecek: ' kitapta mevcut Türkçe ad DEĞİŞECEK',
      yalnizNot: 'Yalnız TÜRKÇE AD alanı yazılır; kitabın adı, türü, puanı, notları — hiçbir başka ' +
        'alana dokunulmaz. Onaylamadan hiçbir şey yazılmaz.',
      degisecekBaslik: 'Mevcut Türkçe adı değişecekler',
      yazDugme: n => 'Türkçe adları yaz (' + n + ')',
      toastYazildi: n => n + ' kitabın Türkçe adı dosyadan yazıldı'
    }
  };
  /* v80 M3: ÖZET DOSYASI — üçüncü içe aktarım tipi. hazirYol BİLİNÇLİ yok:
     ~2 MB kişisel veri repoya gömülmez, tek giriş dosya seçici. Metin kitapta
     değil IndexedDB'de (window.__ozet) — oku kancası oradan okur; yazım
     iceUygulaOzet'te kaydetHam ile (depoKaydet döngü SONUNDA tek sefer).
     kisalt: önizlemede eski→yeni özet metinleri 60 karakterde kırpılır —
     uzun metinler listeyi şişirmesin (tur/adTr'de bayrak yok, davranış aynı). */
  const ICE_OZET = {
    anahtar: 'ozet', kaynakAnahtar: 'ozet', taksonomiKapisi: false,
    ortuId: 'zgOzetIceOrtu', ortuBaslik: 'Özet dosyası yükle',
    denemeDamgala: false,
    kisalt: true,
    /* v81: ontoAnahtar — AYNI dosyadaki isteğe bağlı ikinci alan (ontoloji).
       TEK dosya, TEK onay: kullanıcı iki kez dosya seçmez; önizleme özet ve
       ontoloji sayılarını AYRI gösterir. Alanı olmayan kayıt o kitabın mevcut
       ontolojisine DOKUNMAZ. tur/adTr cfg'lerinde bayrak yok — boru birebir. */
    ontoAnahtar: 'ontoloji',
    hazirla(){ return window.__ozet.hazirBekle(); },
    oku: k => window.__ozet.oku(k.id),
    sonTazele(){ durumTazele(); },
    act: { uygula: 'zg-ozet-uygula', vazgec: 'zg-ozet-vazgec' },
    metin: {
      bicimYok: 'Bu dosyada özet listesi yok — beklenen biçim: ' +
        '{ "ozet": [ {ad, yazar, ozet, ontoloji} ] } (ontoloji isteğe bağlı)',
      dolacak: ' kitapta boş özet dolacak',
      degisecek: ' kitapta mevcut özet DEĞİŞECEK',
      yalnizNot: 'Yalnız ÖZET ve ONTOLOJİ alanları yazılır; puan, notlar, durum — hiçbir başka ' +
        'alana dokunulmaz. Onaylamadan hiçbir şey yazılmaz.',
      degisecekBaslik: 'Mevcut özeti değişecekler',
      yazDugme: n => 'Özetleri yaz (' + n + ')'
      /* toastYazildi yok (v81): özet borusunun toast'ı iceUygulaOzet'te
         iki-sayılı kurulur (özet + ontoloji ayrı söylenir) */
    }
  };
  let icePlan = null;   // tekil: uygula/vazgec daima SON okunan plana işler
  /* v80 kancalar: varsayılanlar eski davranışla BİREBİR (tur/adTr değişmez) */
  function iceDegerOku(cfg, k){
    return cfg.oku ? cfg.oku(k) : k[cfg.anahtar];
  }
  function iceYazHam(cfg, k, deger){
    if(cfg.yazHam){ cfg.yazHam(k, deger); return; }
    k[cfg.anahtar] = deger;
    k.g = Date.now();          // kullanıcı eylemi — senkron damgası
  }
  /* dosya: File YA DA fetch Response — yalnız .text() kullanılır (v70: yerleşik
     liste aynı borudan Response ile girer; boru tek, kopya mantık yok). */
  async function iceOku(cfg, dosya){
    let govde;
    try{ govde = JSON.parse(await dosya.text()); }
    catch(e){ bildir('Dosya okunamadı — geçerli bir JSON değil'); return; }
    const kayitlar = govde && Array.isArray(govde[cfg.kaynakAnahtar]) ? govde[cfg.kaynakAnahtar] : null;
    if(!kayitlar || !kayitlar.length){
      bildir(cfg.metin.bicimYok);
      return;
    }
    if(cfg.taksonomiKapisi){
      if(!taksonomi){
        try{ taksonomi = await window.__ara.turler(); }
        catch(e){ taksonomi = null; }
      }
      if(!Array.isArray(taksonomi) || !taksonomi.length){
        bildir('Tür düzeni doğrulanamadı (internet gerekli) — hiçbir şey yazılmadı, sonra yeniden dene');
        return;
      }
    }
    /* v80 opsiyonel hazirla kancası (özet): bellek dizini açılışta async dolar,
       dolmadan oku '' verir — mevcut özet "dolacak" sanılır, DEĞİŞECEK uyarısı
       kaçardı. Hata yutulur: dizin yoksa yazım da zaten başarısız sayılacak. */
    if(cfg.hazirla){ try{ await cfg.hazirla(); }catch(e){} }
    const harita = {};
    (veri.kitaplar || []).forEach(k => {
      const anah = katla(k.ad) + '|' + katla(k.yazar || '');
      (harita[anah] = harita[anah] || []).push(k);
    });
    const plan = { cfg, dolacak: [], degisecek: [], onto: [], ayni: 0, gecersiz: 0,
      eslesmeyen: [], taksonomiDisi: [] };
    const planli = new Set();   // dosyada çift kayıt: İLK kayıt kazanır
    for(const r of kayitlar){
      /* v81 ontoloji (yalnız cfg.ontoAnahtar'lı boruda): kayıttaki isteğe
         bağlı ikinci alan. null = alan yok/boş → o kitabın ontolojisine
         DOKUNULMAZ (içe aktarım ontoloji SİLMEZ). tur/adTr'de ontoAnahtar
         yok → ontoHam hep null, kapı ve döngü bayt bayt eski davranış. */
      const ontoHam = (cfg.ontoAnahtar && r && typeof r[cfg.ontoAnahtar] === 'string'
        && r[cfg.ontoAnahtar].trim()) ? r[cfg.ontoAnahtar].trim() : null;
      const anaVar = !!(r && String(r[cfg.kaynakAnahtar] || '').trim());
      if(!r || !String(r.ad || '').trim() || (!anaVar && !ontoHam)){ plan.gecersiz++; continue; }
      let yeniDeger = '';
      if(anaVar){
        if(cfg.taksonomiKapisi){
          const hedef = taksonomi.find(x =>
            katla(x.ad) === katla(r[cfg.kaynakAnahtar]) || katla(x.seo) === katla(r[cfg.kaynakAnahtar]));
          if(!hedef){ plan.taksonomiDisi.push(r); continue; }
          yeniDeger = hedef.ad;   // yazılan değer her zaman taksonominin KENDİ adı
        }else{
          yeniDeger = String(r[cfg.kaynakAnahtar]).trim();   // serbest metin alanı
        }
      }
      const kitaplar = harita[katla(r.ad) + '|' + katla(r.yazar || '')];
      if(!kitaplar){ plan.eslesmeyen.push(r); continue; }
      for(const k of kitaplar){
        if(planli.has(k.id)) continue;
        planli.add(k.id);
        /* v80: mevcut değer cfg.oku kancasından — varsayılan k[cfg.anahtar],
           boşluk sınaması alanBos'un metin dalıyla BİREBİR aynı */
        const mevcut = iceDegerOku(cfg, k);
        let ontoSatir = null;
        if(ontoHam !== null){
          const mevcutO = window.__ozet.okuOnto(k.id);
          if(mevcutO !== ontoHam) ontoSatir = { id: k.id, ad: k.ad, eski: mevcutO, yeni: ontoHam };
        }
        const anaYaz = anaVar && mevcut !== yeniDeger;
        if(!anaYaz && !ontoSatir){ plan.ayni++; continue; }
        if(ontoSatir) plan.onto.push(ontoSatir);
        if(anaYaz) ((mevcut && String(mevcut).trim()) ? plan.degisecek : plan.dolacak)
          .push({ id: k.id, ad: k.ad, eski: mevcut, yeni: yeniDeger });
      }
    }
    // başka akışın önizlemesi açıksa kapat: paylaşılan tekil plan yanlış
    // pencereden yazılamasın
    if(icePlan && icePlan.cfg !== cfg) kapat(icePlan.cfg.ortuId);
    icePlan = plan;
    ortuKur(cfg.ortuId, cfg.ortuBaslik);
    iceOnizleCiz();
    ac(cfg.ortuId);
  }
  function iceOnizleCiz(){
    const plan = icePlan;
    if(!plan) return;
    const cfg = plan.cfg;
    const g = document.getElementById(cfg.ortuId + 'Govde');
    if(!g) return;
    /* v81: yazılacak = KİTAP sayısı (özet ∪ ontoloji) — aynı kitapta ikisi de
       değişse tek sayılır. tur/adTr'de plan.onto yok → eski toplamla birebir. */
    const yazIdler = new Set(plan.dolacak.concat(plan.degisecek).map(y => y.id));
    (plan.onto || []).forEach(y => yazIdler.add(y.id));
    const yazilacak = yazIdler.size;
    const ozet = [];
    if(plan.dolacak.length) ozet.push('<b>' + plan.dolacak.length + '</b>' + cfg.metin.dolacak);
    if(plan.degisecek.length) ozet.push('<b>' + plan.degisecek.length + '</b>' + cfg.metin.degisecek);
    if((plan.onto || []).length) ozet.push('<b>' + plan.onto.length + '</b> kitapta ontoloji yazılacak');
    if(plan.ayni) ozet.push(plan.ayni + ' kitap zaten aynı');
    if(plan.eslesmeyen.length) ozet.push(plan.eslesmeyen.length + ' kayıt kütüphanede bulunamadı');
    if(plan.taksonomiDisi.length) ozet.push(plan.taksonomiDisi.length + ' kayıt taksonomi dışı (atlanacak)');
    if(plan.gecersiz) ozet.push(plan.gecersiz + ' kayıt eksik alanlı (atlanacak)');
    const katla_ = (baslik, satirlar) => satirlar.length
      ? '<details class="zg-katla"><summary>' + baslik + ' (' + satirlar.length + ')</summary>' +
        '<div class="zg-onizle-liste">' + satirlar.join('') + '</div></details>'
      : '';
    /* v80: kisalt bayraklı cfg'de (özet) eski→yeni metinler 60 karakterde
       kırpılır; bayraksız (tur/adTr) kirp KİMLİK — çıktı bayt bayt eski. */
    const kirp = cfg.kisalt
      ? (s => { s = String(s == null ? '' : s); return s.length > 60 ? s.slice(0, 60) + '…' : s; })
      : (s => s);
    g.innerHTML =
      '<div class="zg-ozet">' + (ozet.join(' · ') || 'Dosyada işlenecek kayıt yok.') + '</div>' +
      '<p class="zg-not">' + cfg.metin.yalnizNot + '</p>' +
      katla_(cfg.metin.degisecekBaslik, plan.degisecek.map(y =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">' +
        '<span class="zg-onizle-ad">' + esc(y.ad) + '</span>' +
        '<span class="zg-onizle-alan">' + esc(kirp(y.eski)) + ' → ' + esc(kirp(y.yeni)) + '</span></div></div>')) +
      katla_('Ontolojisi yazılacaklar', (plan.onto || []).map(y =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">' +
        '<span class="zg-onizle-ad">' + esc(y.ad) + '</span>' +
        '<span class="zg-onizle-alan">' + esc(kirp(y.eski)) + ' → ' + esc(kirp(y.yeni)) + '</span></div></div>')) +
      katla_('Kütüphanede bulunamayanlar', plan.eslesmeyen.map(r =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">' +
        '<span class="zg-onizle-ad">' + esc(r.ad) + '</span>' +
        '<span class="zg-onizle-alan">' + esc(r.yazar || '') + '</span></div></div>')) +
      katla_('Taksonomi dışı türler', plan.taksonomiDisi.map(r =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">' +
        '<span class="zg-onizle-ad">' + esc(r.ad) + '</span>' +
        '<span class="zg-onizle-alan">tanınmayan tür: ' + esc(r.tur) + '</span></div></div>')) +
      '<div class="form-alt">' +
        '<button class="btn btn-cerceve" data-act="' + cfg.act.vazgec + '" style="flex:1">Vazgeç</button>' +
        (yazilacak
          ? '<button class="btn btn-cerceve" data-act="' + cfg.act.uygula + '" style="flex:2">' +
            cfg.metin.yazDugme(yazilacak) + '</button>'
          : '') +
      '</div>';
  }
  function iceUygula(){
    const plan = icePlan;
    if(!plan) return;
    /* v80: özet planı AYRI async dala — tur/adTr yolu aşağıda BİREBİR eski
       senkron gövde (g56 toast zamanlaması değişmesin) */
    if(plan.cfg === ICE_OZET){ iceUygulaOzet(plan); return; }
    const cfg = plan.cfg;
    const deneme = cfg.denemeDamgala ? defterOku(OTO_DENEME_ANAHTAR) : null;
    let n = 0;
    for(const y of plan.dolacak.concat(plan.degisecek)){
      const k = (veri.kitaplar || []).find(x => x.id === y.id);
      if(!k) continue;
      iceYazHam(cfg, k, y.yeni);   // v80 kanca — varsayılan: k[anahtar]=yeni + k.g damgası
      if(deneme) deneme[k.id] = Date.now(); // açılış taraması bu kitabı yeniden sormasın
      n++;
    }
    if(deneme) defterYaz(OTO_DENEME_ANAHTAR, deneme);
    icePlan = null;
    if(typeof depoKaydet === 'function') depoKaydet();
    kapat(cfg.ortuId);
    bildir(cfg.metin.toastYazildi(n));
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    cfg.sonTazele();
  }
  /* v80: özet planının PARÇALI async yazımı. 2 MB'lık dosyada arayüz
     KİLİTLENMESİN diye 25'lik dilimler; her dilim sonunda ilerleme satırı
     güncellenir ve setTimeout(0) ile kare bırakılır. __ozet.kaydetHam verilen
     damgayla IDB'ye yazar + kitap işaretlerini (ozetVar/ozetUzunluk/ozetG)
     günceller ama depoKaydet YAPMAZ — döngü SONUNDA TEK depoKaydet.
     k.g BASILMAZ (v80 kararı: özet ayrı kanal). Yazılamayan kayıt sayılır
     ve toast'ta belirtilir. */
  async function iceUygulaOzet(plan){
    const cfg = plan.cfg;
    icePlan = null;   // yeniden giriş kilidi: koşum boyunca plan yalnız burada
    /* v81: kitap başına TEK yazım — özet ve ontoloji AYNI kayda gider (damga
       tek, ikisini kapsar). m: null = özet değişmiyor (mevcut korunur);
       o: undefined = ontoloji değişmiyor (kaydetHam korur). */
    const isler = new Map();   // id -> { m: yeniÖzet | null, o: yeniOntoloji | undefined }
    for(const y of plan.dolacak.concat(plan.degisecek)) isler.set(y.id, { m: y.yeni });
    for(const y of (plan.onto || [])){
      const v = isler.get(y.id) || { m: null };
      v.o = y.yeni; isler.set(y.id, v);
    }
    const hepsi = Array.from(isler.entries());
    const g = document.getElementById(cfg.ortuId + 'Govde');
    if(g) g.innerHTML = '<div class="zg-ozet" id="zgOzetIceIlerleme">0 / ' +
      hepsi.length + ' yazıldı…</div>';
    let nOzet = 0, nOnto = 0, olmadi = 0, islenen = 0;
    for(let i = 0; i < hepsi.length; i += 25){
      for(const [id, y] of hepsi.slice(i, i + 25)){
        islenen++;
        const k = (veri.kitaplar || []).find(x => x.id === id);
        if(!k){ olmadi++; continue; }
        const m = (y.m === null) ? window.__ozet.oku(k.id) : y.m;   // özet değişmiyorsa mevcut korunur
        let tamam = false;
        try{ tamam = await window.__ozet.kaydetHam(k.id, m, Date.now(), y.o); }
        catch(e){ window._iz && window._iz('zenginKaydetHam', e); }
        if(tamam){ if(y.m !== null) nOzet++; if(y.o !== undefined) nOnto++; }
        else olmadi++;
      }
      const il = document.getElementById('zgOzetIceIlerleme');
      if(il) il.textContent = islenen + ' / ' + hepsi.length + ' yazıldı…';
      await new Promise(r => setTimeout(r, 0));   // kareyi bırak — arayüz nefes alsın
    }
    if(typeof depoKaydet === 'function') depoKaydet();   // toplu iş: sonda TEK kayıt
    kapat(cfg.ortuId);
    /* toast iki sayıyı ayrı söyler; ontosuz dosyada metin ESKİSİYLE birebir */
    const par = [];
    if(nOzet) par.push(nOzet + ' kitabın özeti');
    if(nOnto) par.push(nOnto + ' kitabın ontolojisi');
    bildir((par.length ? par.join(' ve ') + ' dosyadan yazıldı' : 'Hiçbir kayıt yazılamadı')
      + (olmadi ? ' — ' + olmadi + ' kayıt yazılamadı' : ''));
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    cfg.sonTazele();
  }
  function iceVazgec(){
    const cfg = icePlan && icePlan.cfg;
    icePlan = null;
    if(cfg) kapat(cfg.ortuId);
    bildir('Vazgeçildi — hiçbir şey yazılmadı');
  }
  /* YERLEŞİK liste (v70): uygulamayla gelen liste (sw ASSETS'te — çevrimdışı da
     okunur) dosya seçiciyle AYNI borudan Response ile girer. KARAR: düğme
     tekrar uygulanabilir kalır — iş idempotent, "uygulandı" durumunu önizleme
     özeti zaten taşır; kütüphane değiştikçe yeniden uygulamak değerli (v67). */
  async function iceHazirYukle(cfg){
    let y = null;
    try{ y = await fetch(cfg.hazirYol); }catch(e){ /* ağ hatası hemen altta ele alınıyor (!y dalı) — kasıtlı */ }
    if(!y || !y.ok){
      bildir('Hazır liste okunamadı — uygulamanın güncel sürümü ve bir kez internet gerekli');
      return;
    }
    iceOku(cfg, y);
  }
  function turDosyaKur(){
    let g = document.getElementById('zgTurDosya');
    if(!g){
      g = document.createElement('input');
      g.type = 'file'; g.id = 'zgTurDosya';
      g.accept = '.json,application/json'; g.hidden = true;
      document.body.appendChild(g);
    }
    if(!g.__zgBagli){   // dinleyici BİR kez bağlanır — her tıklamada çoğalmasın
      g.__zgBagli = true;
      g.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if(f) iceOku(ICE_TUR, f);
        e.target.value = '';   // aynı dosya ikinci kez seçilebilsin
      });
    }
    return g;
  }
  /* v80: özet dosya seçici — turDosyaKur'un AYRI kopyası (KARAR: g56
     #zgTurDosya seçicisini ve davranışını kilitliyor; paylaşılan fonksiyona
     genellemek yerine kopya, tür yolunu sıfır riskle korur). */
  function ozetDosyaKur(){
    let g = document.getElementById('zgOzetDosya');
    if(!g){
      g = document.createElement('input');
      g.type = 'file'; g.id = 'zgOzetDosya';
      g.accept = '.json,application/json'; g.hidden = true;
      document.body.appendChild(g);
    }
    if(!g.__zgBagli){   // dinleyici BİR kez bağlanır — her tıklamada çoğalmasın
      g.__zgBagli = true;
      g.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if(f) iceOku(ICE_OZET, f);
        e.target.value = '';   // aynı dosya ikinci kez seçilebilsin
      });
    }
    return g;
  }

  /* ---------- tarama döngüsü ---------- */
  async function taramaBaslat(){
    if(calisiyor) return;
    let kdurum = kuyrukYukle();
    if(!kdurum || kdurum.bitti){
      kdurum = { sira: (veri.kitaplar || []).filter(k => ALANLAR.some(a => alanBos(k, a))).map(k => k.id),
        islenen: {}, bulunan: {}, hata: {}, bitti: false };
    }
    kuyrukKaydet(kdurum);
    calisiyor = true; durdur = false;
    ortuKur('zgTarama', 'Kütüphaneyi zenginleştir');
    ac('zgTarama');
    taramaCiz(kdurum);
    try{
      if(!taksonomi){
        try{ taksonomi = await window.__ara.turler(); }
        catch(e){ taksonomi = null; }   // taksonomi yoksa tür eşlenmez (boş kalır), diğer alanlar sürer
      }
      const kalanlar = kdurum.sira.filter(id => !kdurum.islenen[id]);
      let ardArdaHata = 0;
      for(const id of kalanlar){
        if(durdur) break;
        const k = (veri.kitaplar || []).find(x => x.id === id);
        if(k){
          try{
            const b = await kitapSorgula(k);
            if(b) kdurum.bulunan[id] = b;
            ardArdaHata = 0;
          }catch(e){
            kdurum.hata[id] = 1;
            ardArdaHata++;
            if(ardArdaHata >= 5){
              /* ağ ya da kota düşmüş: dürüst mesaj + duraklat — yarım veri yazılmaz,
                 kuyruk durumu duruyor, "Devam et" kaldığı yerden sürer */
              durdur = true;
              bildir('Kaynağa ulaşılamıyor — tarama duraklatıldı, sonra kaldığı yerden sürdürebilirsin');
            }
          }
        }
        kdurum.islenen[id] = 1;
        kuyrukKaydet(kdurum);
        taramaCiz(kdurum);
        if(!durdur) await bekle(ARALIK_MS);
      }
      if(kdurum.sira.every(id => kdurum.islenen[id])) kdurum.bitti = true;
      kuyrukKaydet(kdurum);
    }finally{
      calisiyor = false;
    }
    onizlemeCiz(kdurum);
  }

  /* ---------- ÖNİZLEME + UYGULAMA ---------- */
  function onizlemeOzet(kdurum){
    const alanSayi = {};
    ALANLAR.forEach(a => { alanSayi[a] = 0; });
    let kitapSayi = 0;
    Object.values(kdurum.bulunan).forEach(b => {
      kitapSayi++;
      ALANLAR.forEach(a => { if(b[a] !== undefined) alanSayi[a]++; });
    });
    return { alanSayi, kitapSayi };
  }
  /* UYGULA: yalnız hâlâ BOŞ olan alana yazar — dolu alan (bu arada elle
     doldurulmuş olsa bile) KORUNUR; çelişen değer yazılmaz.
     v74 TEK İSTİSNA — ÖLÜ KAPAK: kapak alanı dolu görünse de OpenLibrary o
     ISBN için kapak tutmuyorsa (sorgu anında ?default=false → HTTP 404 ölçüldü)
     yeni kapak YAZILIR. Bu istisna olmadan tazeleme, asıl hedefi olan 37 kitapta
     kapağı bulup sessizce yazmadan geçerdi. İstisna YALNIZ kapak alanına ve
     YALNIZ ölü damgası taşıyan kayda uygulanır; geçerli kapak asla ezilmez. */
  function uygula(kdurum){
    let kitapN = 0, alanN = 0;
    Object.entries(kdurum.bulunan).forEach(([id, b]) => {
      const k = (veri.kitaplar || []).find(x => x.id === id);
      if(!k) return;
      let yazildi = false;
      ALANLAR.forEach(a => {
        if(b[a] === undefined) return;
        const oluKapakIstisnasi = (a === 'kapak' && b.__kapakOlu === true);
        if(!alanBos(k, a) && !oluKapakIstisnasi) return;   // DOLU ALANA DOKUNMA
        k[a] = b[a];
        yazildi = true; alanN++;
      });
      if(yazildi) kitapN++;
    });
    if(typeof depoKaydet === 'function') depoKaydet();   // parmak izi değişti → damga
    kuyrukTemizle();
    kapat('zgTarama');
    bildir(kitapN + ' kitapta ' + alanN + ' alan dolduruldu');
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    durumTazele();
  }

  /* ---------- pencereler (eklenti-enjekte, katalog.js ortuEkle deseni) ---------- */
  function ortuKur(id, baslik){
    if(document.getElementById(id)) return;
    const o = document.createElement('div');
    o.className = 'ortu'; o.id = id;
    o.innerHTML = '<div class="sheet">' +
      '<div class="tutamac"></div>' +
      '<button class="sheet-kapat" data-act="zg-kapat" data-ortu="' + id + '" aria-label="Kapat">✕</button>' +
      '<div class="sheet-baslik">' + baslik + '</div>' +
      '<div class="zg-govde" id="' + id + 'Govde"></div>' +
    '</div>';
    document.body.appendChild(o);
    // v73 onarımı (taze-göz): ortuKapat bu modülde TANIMSIZDI — fon tıklaması
    // v63'ten beri ReferenceError atıyor, zengin pencereleri fonla kapanmıyordu
    o.addEventListener('click', e => { if(e.target === o) kapat(id); });
  }
  function ac(id){
    const o = document.getElementById(id);
    if(!o) return;
    o.classList.add('acik');
    if(typeof ortuAriaKur === 'function') ortuAriaKur(o);
  }
  function kapat(id){
    const o = document.getElementById(id);
    if(o) o.classList.remove('acik');
  }

  function taramaCiz(kdurum){
    const g = document.getElementById('zgTaramaGovde');
    if(!g) return;
    const toplam = kdurum.sira.length;
    const islenen = Object.keys(kdurum.islenen).length;
    const yuzde = toplam ? Math.round(islenen * 100 / toplam) : 100;
    const { kitapSayi } = onizlemeOzet(kdurum);
    g.innerHTML =
      '<div class="zg-satir">' + islenen + ' / ' + toplam + ' kitap tarandı · ' +
        kitapSayi + ' kitapta yeni bilgi bulundu</div>' +
      '<div class="ilerleme"><div style="width:' + yuzde + '%"></div></div>' +
      '<p class="zg-not">Kaynaklara aralıklı sorulur (kota nezaketi). Durdurabilirsin — ' +
        'kaldığı yerden devam eder. Hiçbir şey şu anda YAZILMIYOR; bitince önce önizleme göreceksin.</p>' +
      '<div class="form-alt"><button class="btn btn-cerceve" data-act="zg-durdur" style="flex:1">' +
        (calisiyor ? 'Duraklat' : 'Kapat') + '</button></div>';
  }
  function onizlemeCiz(kdurum){
    const g = document.getElementById('zgTaramaGovde');
    if(!g) return;
    const { alanSayi, kitapSayi } = onizlemeOzet(kdurum);
    const toplam = kdurum.sira.length;
    const islenen = Object.keys(kdurum.islenen).length;
    const hataN = Object.keys(kdurum.hata).length;
    if(!kitapSayi){
      g.innerHTML = '<div class="zg-satir">' + islenen + ' / ' + toplam + ' kitap tarandı' +
        (kdurum.bitti ? ' — yazılacak yeni bilgi bulunamadı' : ' (yarım — devam edebilirsin)') +
        (hataN ? ' · ' + hataN + ' kitapta kaynak hatası' : '') + '.</div>' +
        '<div class="form-alt">' +
        (kdurum.bitti ? '' : '<button class="btn btn-cerceve" data-act="zg-tara" style="flex:1">Devam et</button>') +
        '<button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgTarama" style="flex:1">Kapat</button></div>';
      if(kdurum.bitti) kuyrukTemizle();
      return;
    }
    const ozetler = ALANLAR.filter(a => alanSayi[a])
      .map(a => ALAN_AD[a] + ': <b>' + alanSayi[a] + '</b> kitap').join(' · ');
    const satirlar = Object.entries(kdurum.bulunan).map(([id, b]) => {
      const k = (veri.kitaplar || []).find(x => x.id === id);
      if(!k) return '';
      const parcalar = ALANLAR.filter(a => b[a] !== undefined)
        .map(a => ALAN_AD[a] + ': ' + esc(String(b[a]).length > 34 ? String(b[a]).slice(0, 33) + '…' : b[a]));
      return '<div class="zg-onizle-satir" data-kid="' + escAttr(id) + '">' +
        '<div class="zg-onizle-ic"><span class="zg-onizle-ad">' + esc(k.ad) + '</span>' +
        '<span class="zg-onizle-alan">' + parcalar.join(' · ') + '</span></div>' +
        '<button class="zg-cikar" data-act="zg-cikar" data-kid="' + escAttr(id) + '" ' +
          'aria-label="Bu kitabı listeden çıkar">✕</button></div>';
    }).join('');
    g.innerHTML =
      '<div class="zg-satir">' + islenen + ' / ' + toplam + ' kitap tarandı' +
        (kdurum.bitti ? '' : ' (yarım — devam edebilirsin)') +
        (hataN ? ' · ' + hataN + ' kitapta kaynak hatası' : '') + '</div>' +
      '<div class="zg-ozet">' + kitapSayi + ' kitapta yeni bilgi: ' + ozetler + '</div>' +
      '<p class="zg-not">Yalnız BOŞ alanlar doldurulur; elle girdiğin hiçbir değere dokunulmaz. ' +
        'Tür, 1000Kitap taksonomisine eşlenemezse boş bırakılır — uydurma tür yazılmaz.</p>' +
      '<details class="zg-katla"><summary>Tek tek gör (' + kitapSayi + ' kitap)</summary>' +
        '<div class="zg-onizle-liste">' + satirlar + '</div></details>' +
      '<div class="form-alt">' +
        (kdurum.bitti ? '' : '<button class="btn btn-cerceve" data-act="zg-tara" style="flex:1">Devam et</button>') +
        '<button class="btn btn-cerceve" data-act="zg-vazgec" style="flex:1">Vazgeç</button>' +
        '<button class="btn btn-cerceve" data-act="zg-uygula" style="flex:2">Bulunanları uygula</button>' +
      '</div>';
  }

  /* ---------- Ayarlar bölümü durumu ---------- */
  function durumTazele(){
    const el = document.getElementById('zgDurum');
    if(!el) return;
    const s = eksikSayim();
    const parcalar = ALANLAR.filter(a => s[a])
      .map(a => s[a] + ' kitapta ' + ALAN_AD[a].toLowerCase());
    el.textContent = s.toplam
      ? (parcalar.length
        ? s.toplam + ' kitabın: ' + parcalar.join(', ') + ' eksik.'
        : 'Tüm kitapların temel alanları dolu görünüyor.')
      : 'Kütüphanen boş.';
    const dugme = document.querySelector('#ayBolumZengin [data-act="zg-tara"]');
    if(dugme){
      const kdurum = kuyrukYukle();
      dugme.textContent = (kdurum && !kdurum.bitti && Object.keys(kdurum.islenen).length)
        ? 'Taramaya devam et'
        : (kdurum && kdurum.bitti && Object.keys(kdurum.bulunan).length)
          ? 'Bulunanları gözden geçir'
          : 'Taramayı başlat';
    }
  }

  /* ---------- M2: hızlı puanlama ---------- */
  /* v72 akış revizyonu (canlı ölçüm, 412px, 195 puansız kütüphane):
     · Otomatik geçiş zaten vardı ama GÖRSEL ONAY yoktu ("geçmedi" algısı) →
       üstte SATIR İÇİ onay ("✓ Ad → 8 · Geri") — toast değil, akışın içinde.
     · GERİ salt konum hareketi: puan SİLİNMEZ (yanlış basışta panel kapansa
       bile kayıp olmaz); önceki kitabın bu-oturum puanı VURGULU gösterilir,
       yeni basış üzerine yazar. Üzerine yazma yalnız bu oturumda BENİM
       yazdıklarımda (puanYazdigim kapısı) — dışarıdan gelen puan ezilmez.
     · KAPAK: ktPlate 'iz-plate zg-pkapak' — ızgara karosu dalı; kapak yoksa
       plateKapakYedek'in mevcut AD-KAROSU yedeği. Üretici + yedek TEK yol.
     · "HATIRLAMIYORUM" = kitapta puanYok işareti (kitapNormalize, senkronlu):
       kuyruktan KALICI düşer, bitti ekranındaki listeden geri alınabilir.
       ATLA GEÇİCİ: bu turda ilerler, puan yazılmaz → sonraki açılışta döner.
     · Puan şeridi TEK SATIR: bitişik segment (gap 0, kenar dolgusuna taşan
       negatif margin) — 412px'te düğme başına >=40px dokunma hedefi. Ayrık
       10 düğme + aralıklar 412'ye 40px hedefle SIĞMAZDI (ölçüm: 8+2
       kırılıyordu); bitişik segmentte şeridin TÜM genişliği dokunma alanıdır. */
  function puanlanacaklar(){
    return (veri.kitaplar || []).filter(k => k.durum === 'bitti' && !k.puan && !k.puanYok)
      .sort((a, b) => String(b.bitisTarihi || '').localeCompare(String(a.bitisTarihi || '')));
  }
  function puanYoklular(){
    return (veri.kitaplar || []).filter(k => k.durum === 'bitti' && k.puanYok);
  }
  let puanYazdigim = new Set();   // bu oturumda yazdıklarım — geri dönüşte üzerine yazma izni
  function puanBaslat(){
    puanKuyruk = puanlanacaklar();
    puanSira = 0; puanBasi = puanKuyruk.length;
    puanYazdigim = new Set();
    // kuyruk boş ama "hatırlamıyorum" işaretli kitap varsa panel yine açılır:
    // geri alma yüzeyi kaybolmasın (bitti ekranı listeyi taşır)
    if(!puanBasi && !puanYoklular().length){ bildir('Puansız bitmiş kitap kalmadı'); return; }
    ortuKur('zgPuanOrtu', 'Hızlı puanlama');
    puanCiz_();
    ac('zgPuanOrtu');
  }
  function puanOnayHtml_(){
    if(!puanSira) return '';
    const onceki = puanKuyruk[puanSira - 1];
    const canli = (veri.kitaplar || []).find(x => x.id === onceki.id) || onceki;
    const sonuc = canli.puanYok ? 'hatırlamıyorum'
      : (canli.puan && puanYazdigim.has(canli.id)) ? String(canli.puan) : 'atlandı';
    return '<div class="zg-onay"><span class="zg-onay-metin">' +
      (sonuc === 'atlandı' ? '' : '✓ ') + esc(canli.ad) + ' → ' + sonuc + '</span>' +
      '<button class="d-link" data-act="zg-puan-geri">Geri</button></div>';
  }
  function puanCiz_(){
    const g = document.getElementById('zgPuanOrtuGovde');
    if(!g) return;
    if(puanSira >= puanKuyruk.length){
      const yoklar = puanYoklular();
      g.innerHTML = puanOnayHtml_() +
        '<div class="zg-satir">' + (puanBasi
          ? 'Bitti — ' + puanBasi + ' kitabın tümü gözden geçirildi.'
          : 'Puansız bitmiş kitap kalmadı.') + '</div>' +
        (yoklar.length
          ? '<details class="zg-katla"><summary>Hatırlamıyorum dediklerin (' + yoklar.length + ')</summary>' +
            '<div class="zg-onizle-liste">' + yoklar.map(k =>
              '<div class="zg-onizle-satir"><div class="zg-onizle-ic">' +
              '<span class="zg-onizle-ad">' + esc(k.ad) + '</span></div>' +
              '<button class="zg-cikar" data-act="zg-puanyok-geri" data-id="' + escAttr(k.id) + '">Geri al</button>' +
              '</div>').join('') + '</div></details>'
          : '') +
        '<div class="form-alt"><button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgPuanOrtu" style="flex:1">Kapat</button></div>';
      return;
    }
    const k = puanKuyruk[puanSira];
    const canli = (veri.kitaplar || []).find(x => x.id === k.id) || k;
    const mevcutPuan = puanYazdigim.has(k.id) ? canli.puan : null;
    // yardımcı bilgi: yıl + sayfa + tür — yıllar önce okunan kitabı hatırlatır
    const alt = [
      k.bitisTarihi ? String(k.bitisTarihi).slice(0, 4) + ' yılında bitti' : '',
      k.sayfa > 0 ? k.sayfa + ' sayfa' : '',
      k.tur || ''
    ].filter(Boolean).join(' · ');
    g.innerHTML = puanOnayHtml_() +
      '<div class="zg-sayac-satir"><span class="zg-sayac">' + (puanSira + 1) + ' / ' + puanBasi + '</span>' +
        '<span class="zg-kalan">kalan ' + (puanKuyruk.length - puanSira) + '</span></div>' +
      '<div class="zg-kitap">' + (typeof ktPlate === 'function' ? ktPlate(k, 'iz-plate zg-pkapak') : '') +
        '<div class="zg-kitap-ic"><span class="zg-kitap-ad">' + esc(k.ad) + '</span>' +
        (k.yazar ? '<span class="zg-kitap-yazar">' + esc(k.yazar) + '</span>' : '') +
        (alt ? '<span class="zg-kitap-alt">' + esc(alt) + '</span>' : '') +
        '</div></div>' +
      '<div class="zg-puan-secim">' + Array.from({ length: 10 }, (_, i) =>
        '<button class="zg-puan-btn' + (mevcutPuan === i + 1 ? ' zg-secili' : '') +
        '" data-act="zg-puan" data-v="' + (i + 1) + '"' +
        ' aria-pressed="' + (mevcutPuan === i + 1 ? 'true' : 'false') + '"' +
        '>' + (i + 1) + '</button>').join('') + '</div>' +
      '<div class="zg-eylem"><button class="zg-sessiz" data-act="zg-atla">Atla</button>' +
        '<button class="zg-sessiz' + (canli.puanYok ? ' zg-secili-metin' : '') +
        '" data-act="zg-puan-yok">Hatırlamıyorum</button></div>';
    if(typeof ktPlateHata === 'function') ktPlateHata(g);
  }
  function puanVer(p){
    const k = puanKuyruk && puanKuyruk[puanSira];
    if(!k) return;
    const canli = (veri.kitaplar || []).find(x => x.id === k.id);
    // üzerine yazma yalnız BU oturumda benim yazdığım puanda (geri → düzeltme);
    // dışarıdan (detay, başka cihaz) gelen puan ezilmez — bayat-kuyruk koruması
    if(canli && p >= 1 && p <= 10 && (!canli.puan || puanYazdigim.has(canli.id))){
      canli.puan = p;
      canli.puanYok = false;   // puan verildiyse "hatırlamıyorum" işareti düşer
      canli.g = Date.now();    // kullanıcı eylemi — açık damga (d-puan ile aynı kalıp)
      puanYazdigim.add(canli.id);
      if(typeof depoKaydet === 'function') depoKaydet();
    }
    puanSira++;
    puanCiz_();
  }
  function puanYokVer(){
    const k = puanKuyruk && puanKuyruk[puanSira];
    if(!k) return;
    const canli = (veri.kitaplar || []).find(x => x.id === k.id);
    if(canli && (!canli.puan || puanYazdigim.has(canli.id))){
      canli.puan = null;       // geri dönülüp fikir değişmişse bu-oturum puanı düşer
      canli.puanYok = true;
      canli.g = Date.now();
      if(typeof depoKaydet === 'function') depoKaydet();
    }
    puanSira++;
    puanCiz_();
  }
  function puanGeri(){
    // salt konum: veri değişmez — önceki ekran mevcut işaretiyle (vurgulu) gelir
    if(puanSira > 0){ puanSira--; puanCiz_(); }
  }
  function puanYokGeri(id){
    const canli = (veri.kitaplar || []).find(x => x.id === id);
    if(canli && canli.puanYok){
      canli.puanYok = false;   // işaret kalkar; sonraki başlatmada kuyruğa döner
      canli.g = Date.now();
      if(typeof depoKaydet === 'function') depoKaydet();
    }
    puanCiz_();
  }

  /* ---------- Sırayla özet yazma (v79 M4) ----------
     Hızlı puanlamanın (v72) METİN hali. DEĞERLENDİRME: puan tek dokunuş, özet
     düşünmek + yazmak ister — aynı RİTİM kurulamaz; ama akışın değeri ritim
     değil GEZİNME maliyetini sıfırlamak: 239 bitmiş kitapta "listeden kitap
     seç + detay aç + bölüme in + kapat" döngüsü asıl işkence. Burada kitap
     kartı + tek metin kutusu + "Kaydet ve sonraki". Bu yüzden KURULDU.
     Farklar: 1-10 şeridi yerine textarea; "Hatırlamıyorum" muadili YOK —
     kalıcı "özet yazmayacağım" işareti kanıtlanmamış ihtiyaç, Atla geçicidir
     (kitap sonraki oturumda kuyruğa döner). Sınıflar zg- ailesinde: aynı
     eklentinin kardeş ekranı; zgOzetOrtu tembel kurulur (ortuKur), puan
     paneli açık değilken DOM'da yoktur — test seçicileri çakışmaz.
     v80: özet METNİ artık kitap kaydında değil — IndexedDB + bellek dizini
     (window.__ozet). Kitapta yalnız işaret: ozetVar/ozetUzunluk/ozetG.
     Okuma __ozet.oku(id) (senkron, bellekten), yazma __ozet.kaydet(id, metin)
     (async; işaretleri + depoKaydet'i KENDİ basar, k.g BASILMAZ — özet ayrı
     kanal). */
  let ozKuyruk = null, ozSira = 0, ozBasi = 0;
  let ozYazdigim = new Set();   // bu oturumda yazdıklarım — geri dönüşte düzeltme izni
  function ozetsizler(){
    return (veri.kitaplar || []).filter(k => k.durum === 'bitti' && !k.ozetVar)
      .sort((a, b) => String(b.bitisTarihi || '').localeCompare(String(a.bitisTarihi || '')));
  }
  function ozetBaslat(){
    ozKuyruk = ozetsizler();
    ozSira = 0; ozBasi = ozKuyruk.length;
    ozYazdigim = new Set();
    if(!ozBasi){ bildir('Özetsiz bitmiş kitap kalmadı'); return; }
    ortuKur('zgOzetOrtu', 'Sırayla özet');
    ozetCiz_();
    ac('zgOzetOrtu');
  }
  function ozetOnayHtml_(){
    if(!ozSira) return '';
    const onceki = ozKuyruk[ozSira - 1];
    const canli = (veri.kitaplar || []).find(x => x.id === onceki.id) || onceki;
    const yazdim = canli.ozetVar && ozYazdigim.has(canli.id);
    return '<div class="zg-onay"><span class="zg-onay-metin">' +
      (yazdim ? '✓ ' : '') + esc(canli.ad) + ' → ' + (yazdim ? 'kaydedildi' : 'atlandı') + '</span>' +
      '<button class="d-link" data-act="zg-oz-geri">Geri</button></div>';
  }
  function ozetCiz_(){
    const g = document.getElementById('zgOzetOrtuGovde');
    if(!g) return;
    if(ozSira >= ozKuyruk.length){
      g.innerHTML = ozetOnayHtml_() +
        '<div class="zg-satir">Bitti — bu oturumda ' + ozBasi + ' kitap gözden geçirildi.</div>' +
        '<div class="form-alt"><button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgOzetOrtu" style="flex:1">Kapat</button></div>';
      return;
    }
    const k = ozKuyruk[ozSira];
    const alt = [
      k.bitisTarihi ? String(k.bitisTarihi).slice(0, 4) + ' yılında bitti' : '',
      k.sayfa > 0 ? k.sayfa + ' sayfa' : '',
      k.tur || ''
    ].filter(Boolean).join(' · ');
    g.innerHTML = ozetOnayHtml_() +
      '<div class="zg-sayac-satir"><span class="zg-sayac">' + (ozSira + 1) + ' / ' + ozBasi + '</span>' +
        '<span class="zg-kalan">kalan ' + (ozKuyruk.length - ozSira) + '</span></div>' +
      '<div class="zg-kitap">' + (typeof ktPlate === 'function' ? ktPlate(k, 'iz-plate zg-pkapak') : '') +
        '<div class="zg-kitap-ic"><span class="zg-kitap-ad">' + esc(k.ad) + '</span>' +
        (k.yazar ? '<span class="zg-kitap-yazar">' + esc(k.yazar) + '</span>' : '') +
        (alt ? '<span class="zg-kitap-alt">' + esc(alt) + '</span>' : '') +
        '</div></div>' +
      '<textarea class="zg-oz-metin" id="zgOzMetin" rows="7" maxlength="10000"' +
        ' placeholder="Bu kitap sana ne bıraktı? Ana fikri, kendi değerlendirmen…"></textarea>' +
      '<div class="zg-eylem"><button class="btn btn-cerceve btn-kucuk" data-act="zg-oz-kaydet">Kaydet ve sonraki</button>' +
        '<button class="zg-sessiz" data-act="zg-oz-atla">Atla</button></div>';
    if(typeof ktPlateHata === 'function') ktPlateHata(g);
    const ta = document.getElementById('zgOzMetin');
    if(ta){
      if(ozYazdigim.has(k.id)) ta.value = window.__ozet.oku(k.id);   // geri dönüşte düzeltme (v80: metin bellek dizininden)
      ta.focus();
    }
  }
  function ozetYaz(){
    const k = ozKuyruk && ozKuyruk[ozSira];
    if(!k) return;
    const ta = document.getElementById('zgOzMetin');
    const metin = ta ? ta.value.trim() : '';
    const canli = (veri.kitaplar || []).find(x => x.id === k.id);
    /* boş metinle "Kaydet" = Atla (yazmadan geç); üzerine yazma yalnız BU
       oturumda benim yazdığım özette — dışarıdan (detay, başka cihaz) gelen
       özet ezilmez (puanVer bayat-kuyruk koruması kalıbı).
       v80: yazım async — __ozet.kaydet işaretleri (ozetVar/ozetUzunluk/ozetG)
       + depoKaydet'i KENDİ basar; k.g BASILMAZ. BAŞARISIZSA aynı ekranda
       kalınır ki metin kaybolmasın. */
    if(canli && metin && (!canli.ozetVar || ozYazdigim.has(canli.id))){
      window.__ozet.kaydet(canli.id, metin).then(tamam => {
        if(tamam){
          ozYazdigim.add(canli.id);
          ozSira++;
          ozetCiz_();
        }else{
          bildir('Özet kaydedilemedi — cihaz depolama alanını kontrol et');
        }
      });
      return;
    }
    ozSira++;
    ozetCiz_();
  }
  function ozetGeri(){
    // salt konum: veri değişmez (puanGeri kalıbı)
    if(ozSira > 0){ ozSira--; ozetCiz_(); }
  }

  /* ---------- M3: bitiş yılı atama ---------- */
  function tarihsizler(){
    return (veri.kitaplar || []).filter(k => k.durum === 'bitti' && !k.bitisTarihi);
  }
  function tarihBaslat(){
    tarihKuyruk = tarihsizler();
    tarihSira = 0;
    if(!tarihKuyruk.length){ bildir('Bitiş tarihi eksik bitmiş kitap kalmadı'); return; }
    ortuKur('zgTarihOrtu', 'Bitiş yılı ata');
    tarihCiz_();
    ac('zgTarihOrtu');
  }
  function tarihCiz_(){
    const g = document.getElementById('zgTarihOrtuGovde');
    if(!g) return;
    if(tarihSira >= tarihKuyruk.length){
      g.innerHTML = '<div class="zg-satir">Bitti — kalan kitap yok.</div>' +
        '<div class="form-alt"><button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgTarihOrtu" style="flex:1">Kapat</button></div>';
      return;
    }
    const k = tarihKuyruk[tarihSira];
    const buYil = new Date().getFullYear();
    g.innerHTML =
      '<div class="zg-sayac">' + (tarihSira + 1) + ' / ' + tarihKuyruk.length + '</div>' +
      '<div class="zg-kitap">' + (typeof ktPlate === 'function' ? ktPlate(k, 'p-mini') : '') +
        '<div class="zg-kitap-ic"><span class="zg-kitap-ad">' + esc(k.ad) + '</span>' +
        (k.yazar ? '<span class="zg-kitap-yazar">' + esc(k.yazar) + '</span>' : '') +
        '</div></div>' +
      '<p class="zg-not">Hangi YIL bitirdin? Gün/ay uydurulmaz — kayda yılın ilk günü yazılır, ' +
        'yıl istatistikleri ve yıl raporu doğru çalışır.</p>' +
      '<div class="zg-yil-izgara">' + Array.from({ length: YIL_SAYISI }, (_, i) => {
        const y = buYil - i;
        return '<button class="zg-yil-btn" data-act="zg-yil" data-v="' + y + '">' + y + '</button>';
      }).join('') + '</div>' +
      '<div class="zg-eylem"><button class="zg-sessiz" data-act="zg-atla-tarih">Atla</button></div>';
    if(typeof ktPlateHata === 'function') ktPlateHata(g);
  }
  function yilVer(y){
    const k = tarihKuyruk && tarihKuyruk[tarihSira];
    if(!k) return;
    const canli = (veri.kitaplar || []).find(x => x.id === k.id);
    if(canli && !canli.bitisTarihi && y >= 1900 && y <= new Date().getFullYear()){
      canli.bitisTarihi = y + '-01-01';
      canli.g = Date.now();
      if(typeof depoKaydet === 'function') depoKaydet();
    }
    tarihSira++;
    tarihCiz_();
  }

  /* ---------- bağlama ---------- */
  const CSS = [
    '.zg-satir{font-size:.9rem;color:var(--paper);margin:10px 0 8px;font-variant-numeric:tabular-nums}',
    '.zg-ozet{font-size:.85rem;color:var(--muted);margin:8px 0;line-height:1.5}',
    '.zg-ozet b{color:var(--paper);font-variant-numeric:tabular-nums}',
    '.zg-not{font-size:.8rem;color:var(--muted);margin-top:10px;line-height:1.5}',
    '.zg-katla{margin-top:12px;border:1px solid var(--kontur);border-radius:var(--r-md)}',
    '.zg-katla summary{list-style:none;cursor:pointer;padding:10px 14px;font-size:.85rem;color:var(--muted)}',
    '.zg-katla summary::-webkit-details-marker{display:none}',
    '.zg-onizle-liste{padding:0 14px 10px;max-height:44vh;overflow-y:auto}',
    '.zg-onizle-satir{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--cizgi)}',
    '.zg-onizle-ic{flex:1;min-width:0}',
    '.zg-onizle-ad{display:block;font-family:var(--serif);font-weight:600;font-size:.9rem}',
    '.zg-onizle-alan{display:block;font-size:.75rem;color:var(--muted);margin-top:2px}',
    '.zg-cikar{flex:0 0 auto;color:var(--muted2);font-size:.9rem;padding:2px 6px;background:transparent;border:none;position:relative}',
    '.zg-cikar::after{content:"";position:absolute;inset:-8px}',
    '.zg-sayac{font-size:.75rem;letter-spacing:.06em;color:var(--muted2);margin:8px 0;font-variant-numeric:tabular-nums}',
    '.zg-kitap{display:flex;gap:12px;align-items:flex-start;margin:6px 0 12px}',
    '.zg-kitap-ic{flex:1;min-width:0}',
    '.zg-kitap-ad{display:block;font-family:var(--serif);font-size:1.15rem;font-weight:600;line-height:1.25}',
    '.zg-kitap-yazar{display:block;font-style:italic;font-size:.82rem;color:var(--muted);margin-top:2px}',
    '.zg-kitap-alt{display:block;font-size:.75rem;color:var(--muted2);margin-top:4px}',
    /* puan/yıl düğmeleri: .puan-btn görsel reçetesinin zg- kopyası (sınıf
       yeniden kullanılmaz — test seçici sözleşmesi) */
    '.zg-yil-izgara{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}',
    /* v72: puan şeridi TEK SATIR bitişik segment — gap 0 + panel dolgusuna
       taşan negatif kenar; 412px'te düğme başına >=40px dokunma hedefi
       (ayrık düğme + aralık bu genişliğe 40px hedefle sığmıyordu, ölçüldü).
       Kontur dili: dolgu yok, seçili durum kontur + %7 tint (gorunum-dugme
       .aktif reçetesi). */
    '.zg-puan-secim{display:flex;gap:0;flex-wrap:nowrap;margin:4px -10px 0}',
    '.zg-puan-btn{flex:1 1 0;min-width:0;height:44px;border-radius:0;border:1px solid var(--kontur);' +
      'margin-left:-1px;background:transparent;color:var(--muted);font-size:.9rem;font-variant-numeric:tabular-nums}',
    '.zg-puan-btn:first-child{margin-left:0;border-radius:var(--r-md) 0 0 var(--r-md)}',
    '.zg-puan-btn:last-child{border-radius:0 var(--r-md) var(--r-md) 0}',
    '.zg-puan-btn.zg-secili{border-color:var(--brass);color:var(--brass);font-weight:600;' +
      'position:relative;z-index:1;background:color-mix(in srgb,var(--brass) 7%,transparent)}',
    '.zg-secili-metin{color:var(--brass);font-weight:600;text-decoration-color:var(--brass)}',
    '.zg-onay{display:flex;align-items:baseline;gap:10px;justify-content:space-between;' +
      'font-size:.8rem;color:var(--muted);margin:2px 0 6px;padding-bottom:8px;border-bottom:1px solid var(--cizgi)}',
    '.zg-onay-metin{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.zg-sayac-satir{display:flex;justify-content:space-between;align-items:baseline}',
    '.zg-kalan{font-size:.72rem;color:var(--muted2);font-variant-numeric:tabular-nums}',
    /* büyük kapak levhası: ktPlate iz-plate dalı — yedek ad-karosu (iz-yedek)
       reçetesi gorunum.js'tekiyle aynı ama o kural #liste.izgara'ya kilitli,
       ortü kapsamı için burada yinelenir (davranış üreticisi TEK: plateKapakYedek) */
    '.zg-pkapak{width:88px;height:auto;aspect-ratio:96/150;flex:0 0 auto}',
    '.zg-pkapak .iz-yedek{position:absolute;inset:0;padding:7px 8px;overflow:hidden;' +
      'font-family:var(--serif);font-size:.78rem;font-weight:600;color:var(--paper);' +
      'line-height:1.25;text-align:left;overflow-wrap:break-word}',
    '.zg-yil-btn{padding:9px 12px;border-radius:var(--r-md);border:1px solid var(--kontur);' +
      'background:transparent;color:var(--muted);font-size:.85rem;font-variant-numeric:tabular-nums}',
    '.zg-puan-btn:active,.zg-yil-btn:active{background:color-mix(in srgb,var(--brass) 12%,transparent)}',
    '.zg-eylem{display:flex;gap:16px;margin-top:14px}',
    // sırayla özet (v79): metin kutusu panel genişliğinde, dikey büyür
    '.zg-oz-metin{width:100%;min-height:150px;margin-top:12px;line-height:1.55}',
    '.zg-sessiz{font-size:.8rem;color:var(--muted);text-decoration:underline;text-underline-offset:3px;' +
      'text-decoration-color:var(--muted2);padding:2px 0;background:transparent;border:none;position:relative}',
    '.zg-sessiz::after{content:"";position:absolute;inset:-10px}'
  ].join('\n');

  function baslat(){
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(!el) return;
      switch(el.dataset.act){
        case 'zg-tara': {
          ortuKur('zgTarama', 'Kütüphaneyi zenginleştir');
          const kdurum = kuyrukYukle();
          if(kdurum && kdurum.bitti && Object.keys(kdurum.bulunan).length){
            ac('zgTarama'); onizlemeCiz(kdurum);   // bitmiş tarama: doğrudan önizleme
          }else{
            taramaBaslat();
          }
          break; }
        case 'zg-durdur':
          if(calisiyor){ durdur = true; }
          else kapat('zgTarama');
          break;
        case 'zg-vazgec':
          kuyrukTemizle(); kapat('zgTarama'); durumTazele();
          bildir('Bulunanlar silindi — hiçbir şey yazılmadı');
          break;
        case 'zg-uygula': {
          const kdurum2 = kuyrukYukle();
          if(kdurum2) uygula(kdurum2);
          break; }
        case 'zg-cikar': {
          const kdurum3 = kuyrukYukle();
          if(kdurum3 && kdurum3.bulunan[el.dataset.kid]){
            delete kdurum3.bulunan[el.dataset.kid];
            kuyrukKaydet(kdurum3);
            onizlemeCiz(kdurum3);
          }
          break; }
        case 'zg-kapat': kapat(el.dataset.ortu); break;
        case 'zg-tur-ice': turDosyaKur(); document.getElementById('zgTurDosya').click(); break;
        case 'zg-tur-hazir': iceHazirYukle(ICE_TUR); break;
        case 'zg-tur-uygula': iceUygula(); break;
        case 'zg-tur-vazgec': iceVazgec(); break;
        case 'zg-adtr-hazir': iceHazirYukle(ICE_ADTR); break;
        case 'zg-adtr-uygula': iceUygula(); break;
        case 'zg-adtr-vazgec': iceVazgec(); break;
        // v80 M3: özet dosyası — düğme HTML'i index.html'de (data-act="zg-ozet-ice")
        case 'zg-ozet-ice': ozetDosyaKur(); document.getElementById('zgOzetDosya').click(); break;
        case 'zg-ozet-uygula': iceUygula(); break;   // iceUygula özet planında async dalı seçer
        case 'zg-ozet-vazgec': iceVazgec(); break;
        case 'zg-oto-liste':
          ortuKur('zgOtoOrtu', 'Otomatik atanan türler');
          otoListeCiz(); ac('zgOtoOrtu');
          break;
        case 'zg-oto-geri': otoGeriAlTek(el.dataset.kid); break;
        case 'zg-oto-geri-tum': otoGeriAlTum(); break;
        case 'zg-puanla': puanBaslat(); break;
        case 'zg-puan': puanVer(parseInt(el.dataset.v)); break;
        case 'zg-atla': puanSira++; puanCiz_(); break;   // GEÇİCİ: puan yazılmaz, sonraki turda döner
        case 'zg-puan-yok': puanYokVer(); break;
        case 'zg-puan-geri': puanGeri(); break;
    case 'zg-ozetle': ozetBaslat(); break;
    case 'zg-oz-kaydet': ozetYaz(); break;
    case 'zg-oz-atla': ozSira++; ozetCiz_(); break;   // geçici: yazılmaz, sonraki oturumda döner
    case 'zg-oz-geri': ozetGeri(); break;
        case 'zg-puanyok-geri': puanYokGeri(el.dataset.id); break;
        case 'zg-tarih': tarihBaslat(); break;
        case 'zg-yil': yilVer(parseInt(el.dataset.v)); break;
        case 'zg-atla-tarih': tarihSira++; tarihCiz_(); break;
        case 'ayar-ac':   // kapak/ocr/bildirim ile aynı kalıp
          durumTazele(); otoKartEkle(); otoDurumTazele();
          break;
      }
    });
    durumTazele();
    otoKartEkle();
    /* Açılış taraması: KENDİLİĞİNDEN, gecikmeli — açılış çizimi ve ilk
       etkileşim ağ işinden önce biter (g55 açılış-süresi vakası). */
    setTimeout(otoTara, OTO_BASLANGIC_MS);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();

  /* test kancaları + otoTur (v65: ekleme akışlarının kayıt-anı tür motoru)
     + v66: açılış taraması / geri alma yüzeyi */
  window.__zengin = { eksikSayim, alanBos, turCevir, turCevirHam, baslikUyar, kitapSorgula, uygula,
    kuyrukYukle, kuyrukKaydet, kuyrukTemizle, puanlanacaklar, tarihsizler, durumTazele,
    otoTur, otoAdaylar, atananGecerli, taksonomiKur: t => { taksonomi = t; },
    ARALIK_MS, ALANLAR, KUYRUK_ANAHTAR, OTO_DENEME_ANAHTAR, OTO_ATANAN_ANAHTAR };
})();
