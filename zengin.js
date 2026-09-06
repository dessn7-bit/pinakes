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

  /* v97: 1000Kitap yedeği — barkod.js'in workerIsbn'i (TEK uygulama, kopya yok).
     Her arıza null: zenginleştirme döngüsünün "art arda hata" sayacı Google'ı
     ölçer, worker arızası onu KİRLETMEZ; worker kapalıyken eski davranış sürer. */
  async function workerIsbnSessiz(isbn){
    try{
      const B = window.__barkod;
      return (B && typeof B.workerIsbn === 'function') ? await B.workerIsbn(isbn) : null;
    }catch(e){ return null; }
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

  /* ================== KAYNAK BÜTÜNLÜĞÜ + METİN TEMİZLİĞİ (v102) ==================
     KUSUR (ölçüldü, canlı): boru yalnız BOŞ alanları sorguluyordu ve gelen cildin
     kayıttaki mevcut künyeyle AYNI BASKI olup olmadığını hiç denetlemiyordu.
     Kyklops'ta yayınevi (Türkiye İş Bankası) ve sayfa (72) zaten doluydu, yalnız
     ISBN boştu; `intitle:"Kyklops" inauthor:"Euripides"` sorgusunun 0. sonucu
     Walter de Gruyter'in ALMANCA baskısı (dil de, 350 s.) ve ISBN'i oradan
     yazıldı: 9783110457384. Aynı desen Kürk Mantolu Madonna (Elips Kitap, 978-5
     Rusya öneki — ama dili 'tr', yani salt dil kapısı YETMEZ), Antonius ve
     Kleopatra (978-963 Macaristan) ve İş Bankası Shakespeare'lerinde tekrarladı.
     KURAL (Kaan kararı): bir kayda yazılan KÜNYE alanları (isbn, yayinevi, yil,
     sayfa) TEK bir kaynak kaydından gelir; kaynak alanı boş bırakıyorsa alan BOŞ
     KALIR, başka kaynaktan doldurulmaz.
     İSTİSNA (Kaan kararı): kapak ve tür künye sayılmaz — kapak görseldir (yanlış
     baskının kapağı veriyi bozmaz; `isbn:` sorgusundan gelen kapak v74'te 37 ölü
     kapağın 13'ünü kurtarmıştı), tür esere aittir, baskıdan baskıya değişmez
     (v64'te çok cildin kategorilerini havuzlamak isabeti 4/30 → 14/30 yapmıştı).
     BU İKİSİ İÇİN çok-kaynak SÜRÜYOR ve bilerek sürüyor. */

  /* --- Metin temizliği (Kaan md. 6) — HTML varlık kodu + bozuk kodlama.
     Kod tabanında varlık ÇÖZÜCÜ yoktu (esc yalnız kodluyor); 1000Kitap ham
     `&#039;` döndürüyor (canlı kanıt: "Kral John&#039;un Yaşamı ve Ölümü") ve
     bu kayda öyle yazılıyordu. Çözüm yazımdan ÖNCE, tek noktada. */
  const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', shy: '',
    rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
  function varlikCoz(s){
    return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (tam, g) => {
      if(g.charAt(0) === '#'){
        const onalti = g.charAt(1) === 'x' || g.charAt(1) === 'X';
        const n = parseInt(onalti ? g.slice(2) : g.slice(1), onalti ? 16 : 10);
        if(!Number.isFinite(n) || n <= 0 || n > 0x10FFFF) return tam;
        try{ return String.fromCodePoint(n); }catch(e){ return tam; }
      }
      const v = VARLIK[g.toLowerCase()];
      return v === undefined ? tam : v;
    });
  }
  /* UTF-8 baytları Latin-1 sanılarak çözülmüş metin ("Ã¼" → "ü"). Yalnız metnin
     TAMAMI Latin-1 aralığındaysa ve bozulma imzası varsa denenir; TextDecoder
     fatal, çözemezse metin OLDUĞU GİBİ kalır (yanlış "onarım" yapmaktansa). */
  function mojibakeOnar(s){
    if(!/[\u00C2-\u00C5\u00D0][\u0080-\u00BF]/.test(s)) return s;
    for(let i = 0; i < s.length; i++) if(s.charCodeAt(i) > 0xFF) return s;
    try{
      const bayt = new Uint8Array(s.length);
      for(let i = 0; i < s.length; i++) bayt[i] = s.charCodeAt(i);
      return new TextDecoder('utf-8', { fatal: true }).decode(bayt);
    }catch(e){ return s; }
  }
  /* Onarılamaz bozukluk: U+FFFD, ya da harf ARASINDA '?' ("Bankas?", "Yay?nlar").
     Türkçe harflerin '?' ile değiştiği bu desen kayda YAZILMAMALI — soru işareti
     cümle sonunda ya da boşlukla ayrık olduğunda dokunulmaz. */
  function bozukMetin(s){
    return s.indexOf('�') >= 0 || /[A-Za-zÀ-ÿĀ-ſ]\?[A-Za-zÀ-ÿĀ-ſ]/.test(s)
      || /[A-Za-zÀ-ÿĀ-ſ]\?(?=\s|$)/.test(s) && (s.match(/\?/g) || []).length >= 2;
  }
  /* İKİ KATMAN:
     · metinCoz  — çözer ve onarır, ASLA boşaltmaz. Kullanıcının kendi yazdığı
       metinde (form kaydı) bu kullanılır: girdiyi silmek kabul edilemez.
     · metinTemizle — metinCoz + BOZUK KAPISI. Kaynaktan (Google/1000Kitap/OL)
       gelen künye metninde bu kullanılır: onarılamaz bozuksa '' döner ve değer
       YAZILMAZ. Kaan md.6'nın "yazılmadan önce çözülsün" şartı ikisinde de
       sağlanır; fark yalnız bozuk metnin ne olacağı. */
  function metinCoz(ham){
    let s = String(ham == null ? '' : ham);
    s = mojibakeOnar(s);
    s = varlikCoz(varlikCoz(s));            // iki geçiş: "&amp;#039;" gibi çift kodlama
    s = s.replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }
  function metinTemizle(ham){
    const s = metinCoz(ham);
    return bozukMetin(s) ? '' : s;
  }

  /* --- Künye kıyası --- */
  function kunyeKatla(s){
    return katla(String(s || '')).replace(/[^a-z0-9çğıöşü]+/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  function metinCelisir(a, b){   // ikisi de doluysa ve hiçbiri diğerini kapsamıyorsa
    const x = kunyeKatla(a), y = kunyeKatla(b);
    if(!x || !y) return false;
    return x.indexOf(y) < 0 && y.indexOf(x) < 0;
  }
  /* ISBN kayıt grubu → dil/ülke. Yalnız çelişki YAKALAMAYA yeter kadar; listede
     olmayan grup ÇELİŞKİ SAYILMAZ (sessiz geçer — yanlış red üretmemek için).
     Türkiye grupları: 975, 9944, 605, 625. */
  const ISBN_GRUP = [['9944', 'tr'], ['975', 'tr'], ['605', 'tr'], ['625', 'tr'],
    ['963', 'hu'], ['972', 'pt'], ['977', 'ar'], ['987', 'es'],
    ['0', 'en'], ['1', 'en'], ['2', 'fr'], ['3', 'de'], ['4', 'ja'], ['5', 'ru'],
    ['84', 'es'], ['88', 'it'], ['90', 'nl'], ['91', 'sv']];
  /* v108: arama ekranı grup ÖNEKİNİ de gösteriyor ("ISBN 978-605"), yalnız
     dili değil. Tarama tek yerde kaldı — isbnUlke artık bunun dil alanı.
     Önce arama ekranında ikinci bir Türkiye-ISBN listesi vardı (trPuan'ın
     kendi regex'i); o liste silindi, tek otorite bu tablo. */
  function isbnGrup(isbn){
    const bos = { on: '', onek: '', dil: '' };
    const t = String(isbn || '').replace(/[^0-9Xx]/g, '');
    if(t.length !== 13 || (t.slice(0, 3) !== '978' && t.slice(0, 3) !== '979')) return bos;
    const g = t.slice(3);
    let en = '', dil = '';
    for(const [onek, d] of ISBN_GRUP)
      if(g.indexOf(onek) === 0 && onek.length > en.length){ en = onek; dil = d; }
    return { on: t.slice(0, 3), onek: en, dil };
  }
  function isbnUlke(isbn){ return isbnGrup(isbn).dil; }
  /* Yayınevi Türkçe mi — ülke veritabanı yok, GÜVENLİ yönde çalışır: yalnız
     "bu yayınevi Türk" diyebildiğimizde çelişki aranır. Ters yön (Alman yayınevi
     + Türk ISBN'i) BİLİNMEZ sayılır, red üretmez. */
  const TR_YAYIN_IZ = ['yayin', 'yayinlari', 'yayinevi', 'yayincilik', 'kitap', 'kitabevi',
    'kultur', 'basim', 'matbaa', 'nesriyat', 'bankasi', 'universitesi', 'edebiyat'];
  function yayineviTurkMu(s){
    const y = kunyeKatla(s);
    if(!y) return false;
    if(/[çğıöşü]/.test(String(s || ''))) return true;
    return TR_YAYIN_IZ.some(w => y.indexOf(w) >= 0);
  }
  /* Beklenen dil: kaydın kendi dili, yoksa Türk yayınevi imzasından çıkarım.
     Bulunamazsa '' — dil kapısı o kayıtta ÇALIŞMAZ (uydurma red yok). */
  function beklenenDil(k){
    const d = String(k.dil || '').trim().toLowerCase();
    if(d) return d.slice(0, 2);
    return yayineviTurkMu(k.yayinevi) ? 'tr' : '';
  }
  function ciltIsbn13(v){
    const kim = (v && v.industryIdentifiers) || [];
    const a = kim.find(x => x && x.type === 'ISBN_13');
    const b = kim.find(x => x && x.type === 'ISBN_10');
    return (a && a.identifier) || (b && b.identifier) || '';
  }
  /* İki kaynak TEK bir "cilt" biçimine indirgenir: künye artık hangi kaynaktan
     geldiğini bilir ve alanlar TEK cilt nesnesinden okunur — karıştırma
     yapısal olarak imkânsız hâle gelir. */
  function ciltGB(v){
    return { kaynak: 'Google Books', yayinevi: v.publisher || '', sayfa: v.pageCount || 0,
      yil: parseInt(String(v.publishedDate || '').slice(0, 4)) || 0,
      isbn: ciltIsbn13(v), dil: String(v.language || ''), yazarlar: v.authors || [],
      kapak: (v.imageLinks && v.imageLinks.thumbnail) ? kapakTemizle(v.imageLinks.thumbnail) : '' };
  }
  function ciltWorker(w){
    return { kaynak: '1000Kitap', yayinevi: w.yayinevi || '', sayfa: w.sayfa || 0,
      yil: w.yil || 0, isbn: w.isbn || '', dil: w.dil || '',
      yazarlar: w.yazar ? [w.yazar] : [], kapak: w.kapak || '' };
  }
  /* AYNI BASKI MI? Kaydın MEVCUT künyesiyle cildi karşılaştırır. Dönüş: red
     gerekçesi (string) ya da '' (uyumlu). Yalnız İKİSİ DE dolu olan alanlar
     kıyaslanır — eksik bilgi red sebebi DEĞİLDİR. */
  function ciltUyumsuzlugu(k, c, isbnliSorgu){
    if(!c) return 'aday yok';
    if(metinCelisir(k.yayinevi, c.yayinevi))
      return 'yayınevi çelişiyor (kayıt: ' + k.yayinevi + ' · kaynak: ' + c.yayinevi + ')';
    if(k.sayfa > 0 && c.sayfa > 0 && Math.abs(k.sayfa - c.sayfa) > 2)
      return 'sayfa sayısı çelişiyor (kayıt: ' + k.sayfa + ' · kaynak: ' + c.sayfa + ')';
    const kIsbn = String(k.isbn || '').replace(/[^0-9Xx]/g, '');
    const cIsbn = String(c.isbn || '').replace(/[^0-9Xx]/g, '');
    if(kIsbn && cIsbn && kIsbn !== cIsbn) return 'ISBN çelişiyor (başka baskı)';
    /* DİL (Kaan md. 4): ISBN ile sorulduysa cilt baskıya birebirdir, dil kapısı
       gereksiz; başlıkla bulunduysa dil uymuyorsa YAZILMAZ. */
    if(!isbnliSorgu){
      const bek = beklenenDil(k), cd = String(c.dil || '').toLowerCase().slice(0, 2);
      if(bek && cd && bek !== cd) return 'dil uymuyor (beklenen: ' + bek + ' · kaynak: ' + cd + ')';
    }
    return '';
  }
  /* Alan doğrulaması (Kaan md. 5). Dönüş: red gerekçesi ya da ''. */
  function yayineviGecersiz(k, c, yayinevi){
    const y = kunyeKatla(yayinevi);
    if(!y) return 'yayınevi metni boş ya da bozuk';
    if(y === kunyeKatla(k.yazar) || (c.yazarlar || []).some(a => kunyeKatla(a) === y))
      return 'yayınevi alanına yazar adı gelmiş (' + yayinevi + ')';
    return '';
  }
  function isbnGecersiz(k, isbn, yayinevi){
    const B = window.__barkod;
    if(B && B.isbnGecerli && !B.isbnGecerli(isbn)) return 'ISBN sağlama toplamı tutmuyor';
    /* ISBN ülke öneki ↔ yayınevi ülkesi (Kaan md. 5). Yayınevi = aynı kaynaktan
       gelen ya da kayıtta duran; Türk imzası varken ISBN başka gruptan ise
       yazılmaz. Bilinmeyen grup ya da Türk olmayan yayınevi → sessiz geçer. */
    const ulke = isbnUlke(isbn);
    const y = yayinevi || k.yayinevi;
    if(ulke && ulke !== 'tr' && yayineviTurkMu(y))
      return 'ISBN ülke öneki yayıneviyle çelişiyor (ISBN: ' + ulke + ' · yayınevi: ' + y + ')';
    return '';
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
  /* ---------- KURGU KORUMASI (v92) ----------
     v91 teşhisinin sınıfı: "kategoriler arasında geliş sırası kazanır" kuralı
     tarihsel KURGUYU konu etiketine yeniriyordu — Üç Silahşor "History ·
     Fiction · France" → Tarih; Taras Bulba'nın kararı GB'nin o günkü
     sıralamasına bağlıydı (kararlı değil). İki kural:
     1) KURGU ÜSTÜNLÜĞÜ: kategorilerde kurgu İŞARETİ (fiction / novel(s) /
        romanı; 'roman' yalnız TAM kategori — "Roman Empire" tuzağı;
        non(-)fiction'lı kategori işaret DEĞİL) varsa kurgu-dışı hedefler
        bastırılır. İşaret hedef SEÇMEZ: kurgu sınıfı İÇİNDE spesifik tür
        (Tiyatro, Hikaye, Şiir, Bilim-Kurgu…) jenerikten (Roman, Edebiyat)
        önce gelir — "Fiction" kategorisi Tiyatro'yu Roman'a ezmez. Geliş
        sırası artık yalnız EŞİT sınıf içinde hüküm sürer.
     2) KARARSIZLIK KORUMASI: kurgu işareti varken BİRDEN ÇOK FARKLI
        kurgu-dışı aday varsa (Taras Bulba: Felsefe+Mizah+Tarih) kategori
        seti farklı baskı/derlemelerden karışmıştır — tür YAZILMAZ, boş
        kalır: yanlış tür boş türden kötüdür, kullanıcı elle girer. TEK
        kurgu-dışı aday klasik konu-etiketi desenidir (tarihsel roman:
        History) — bastırılır, kurgu yazılır. */
  const KURGU_TURLER = new Set(['Bilim-Kurgu', 'Çocuk', 'Gençlik', 'Fantastik',
    'Korku-Gerilim', 'Polisiye', 'Macera-Aksiyon', 'Aşk', 'Çizgi-Roman', 'Manga',
    'Masal', 'Hikaye (Öykü)', 'Şiir', 'Tiyatro', 'Roman', 'Edebiyat',
    'Dünya Klasikleri', 'Türk Klasikleri', 'Halk Edebiyatı', 'Mitolojiler',
    'Efsaneler-Destanlar']);
  const JENERIK_KURGU = new Set(['Roman', 'Edebiyat']);
  /* UYARLAMA sinyali: yaş/biçim uyarlaması baskıların kategorileri (çocuk
     kısaltması, gençlik baskısı, grafik roman). Canlı kanıt: Sapiens'in
     grafik uyarlama baskılarının "Comics & Graphic Novels" + "Young Adult
     Nonfiction" etiketleri ana kitabı (Tarih) Gençlik'e çeviriyordu. */
  const UYARLAMA_RX = /\bjuvenile\b|\byoung adult\b|\bcomics\b|\bgraphic novels?\b/;
  /* BAŞLIK UYARLAMA SÜZGECİ (v93): uyarlama baskılar kategori kapısından önce
     BAŞLIK eşleşmesinden de yakalanır. Canlı kanıt: GB, "GENÇLER İÇİN NUTUK"
     baskısına düpedüz yanlış "Fiction" basmış — o baskı eşleşmeye girince
     kurgu/kurgu-dışı çelişkisi doğuyor, kararsızlık koruması Nutuk'u boş
     bırakıyordu (v92 öncesi Tarih'ti). Başlığında uyarlama işareti taşıyan
     baskı DIŞLANIR, kategorileri hiç okunmaz. YANLIŞ POZİTİF koruması:
     kullanıcının KENDİ kitap adında da işaret varsa ("Çocuklar İçin Felsefe",
     "Resimli Türk Edebiyatı Tarihi" gerçek adlardır) süzgeç uygulanmaz —
     kitabın kendisi zaten o kitap. Kalıplar katla-normalize + kelime sınırı. */
  const BASLIK_UYARLAMA = ['gencler icin', 'cocuklar icin', 'kisaltilmis',
    'sadelestirilmis', 'ozetlenmis', 'resimli', 'adapted', 'abridged', 'retold',
    'simplified', 'for children', 'for young readers', 'young readers edition',
    'graphic novel', 'illustrated edition', "children's edition", 'junior edition'];
  const BASLIK_UYARLAMA_RX = BASLIK_UYARLAMA.map(k =>
    new RegExp('\\b' + rxKac(k) + '\\b'));
  function baslikUyarlama(baslik){
    const m = katla(baslik);
    if(!m) return false;
    return BASLIK_UYARLAMA_RX.some(rx => rx.test(m));
  }
  function kurguIsaret(kategoriler){
    if(!Array.isArray(kategoriler)) return false;
    for(const kat of kategoriler){
      const m = katla(kat);
      if(/\bnon-?fiction\b/.test(m)) continue;   // "Juvenile Non-Fiction" kurgu işareti değil
      if(UYARLAMA_RX.test(m)) continue;          // uyarlama etiketi kurgu BEYANI değil
      if(/\bfiction\b|\bnovels?\b|\bromani\b/.test(m) || m === 'roman') return true;
    }
    return false;
  }
  function turCevir(kategoriler){
    if(!taksonomi) return '';
    /* taksonomi-geçen adaylar, geliş sırasıyla, tekrarsız (iki kapı AYNEN) */
    const gecenler = [];
    for(const hedefAd of turAdaylari(kategoriler)){
      const hedef = katla(hedefAd);
      const t = taksonomi.find(x => katla(x.ad) === hedef || katla(x.seo) === hedef);
      if(t && gecenler.indexOf(t.ad) < 0) gecenler.push(t.ad);
    }
    if(!gecenler.length) return '';
    if(!kurguIsaret(kategoriler)) return gecenler[0];   // işaretsiz: eski davranış birebir
    const kurgular = gecenler.filter(a => KURGU_TURLER.has(a));
    const kurguDisi = gecenler.filter(a => !KURGU_TURLER.has(a));
    if(kurguDisi.length >= 2) return '';   // kararsızlık: çelişen konu etiketleri
    if(!kurgular.length) return '';        // işaret kurgu diyor ama kurgu hedefi taksonomide yok
    const spesifik = kurgular.find(a => !JENERIK_KURGU.has(a));
    return spesifik || kurgular[0];
  }
  /* KapıSIZ çeviri (v77): yalnız KIYAS için — kitap kaydına ASLA yazılmaz. */
  function turCevirHam(kategoriler){ return turAdaylari(kategoriler)[0] || ''; }
  /* Başlığı uyan adayların kategorileri — aday sırası korunur, tekrarsız.
     UYARLAMA KAPISI (v92, juvenile kuralının genellemesi): uyarlama etiketi
     (Juvenile*, Young Adult*, Comics/Graphic Novels) ancak başlığı uyan TÜM
     adaylar uyarlama-etiketliyse hayatta kalır; kategoriSİZ uyan baskı da
     "uyarlama değil" sayılır. Canlı kanıtlar: Siyah Lale'nin 2 uyan
     baskısından biri kategorisiz, öbürü Juvenile — tek kısaltılmış çocuk
     baskısı klasiği Çocuk yapamaz; Sefiller'in 10 baskısının 3'ü juvenile;
     Sapiens'in grafik/gençlik uyarlamaları ana kitabı Tarih'ten ediyordu.
     Maliyet: kategorisiz baskısı olan GERÇEK çocuk kitabı / çizgi roman
     boş kalır — yanlış tür boş türden kötü (bilinçli). */
  function kategoriTopla(adaylar, kitapAd){
    const gorulen = {}, sonuc = [], uyanlar = [];
    /* v93 başlık süzgeci: kullanıcının kitap adı işaretsizse, başlığı uyarlama
       işaretli baskı hiç değerlendirilmez. Süzgeç sonrası uyan kalmazsa sonuç
       boş — uyarlama baskı dışında kaynak yoksa karar verecek veri yok. */
    const kitapIsaretli = baslikUyarlama(kitapAd);
    for(const v of adaylar){
      if(!baslikUyar(kitapAd, v.title)) continue;
      if(!kitapIsaretli && baslikUyarlama(v.title)) continue;
      uyanlar.push(v);
      for(const kat of (v.categories || [])){
        const anah = katla(kat);
        if(gorulen[anah]) continue;
        gorulen[anah] = 1;
        sonuc.push(kat);
      }
    }
    const hepsiUyarlama = uyanlar.length > 0 && uyanlar.every(v =>
      (v.categories || []).some(kat => UYARLAMA_RX.test(katla(kat))));
    return hepsiUyarlama ? sonuc
      : sonuc.filter(kat => !UYARLAMA_RX.test(katla(kat)));
  }
  /* Tek kitap için bulunanlar. v102 KAYNAK BÜTÜNLÜĞÜ:
     · KÜNYE (isbn, yayinevi, yil, sayfa) TEK cilt nesnesinden okunur — alanlar
       artık ayrı ayrı farklı yanıtlardan toplanamaz, karıştırma YAPISAL olarak
       imkânsız. Cilt reddedilirse künyenin TAMAMI boş kalır.
     · md.4 DİL ÖNCELİĞİ: kayıtta ISBN varsa künye YALNIZ `isbn:` sorgusundan
       (ya da 1000Kitap /isbn'den) gelir — başlık aramasına DÜŞMEZ. ISBN yoksa
       başlık adayı, kaydın mevcut künyesiyle ve diliyle DENETLENİR.
     · md.3 İSTİSNA (Kaan kararı): tür ve kapak künye değildir — tür çok cildin
       kategorilerinden havuzlanmaya, kapak `isbn:` sorgusundan gelmeye DEVAM
       eder. Bilerek.
     · Reddedilen her alan için gerekçe döner (md.5 "işaretle"); önizlemede
       görünür, hiçbir şey sessizce boş kalmaz.
     İstek bütçesi: ISBN'li kayıtta 1 (isbn:) + en çok 2 (tür/kapak için başlık);
     ISBN'siz kayıtta eskisi gibi ≤2. */
  const KUNYE = ['isbn', 'yayinevi', 'yil', 'sayfa'];
  async function kitapSorgula(k){
    const eksikler = ALANLAR.filter(a => alanBos(k, a));
    /* v74: kapak alanı DOLU görünse de OpenLibrary o ISBN'de kapak tutmuyorsa
       (?default=false → 404) kitap kapaksız sayılır ve tazelenir. */
    let kapakOlu = false;
    if(eksikler.indexOf('kapak') < 0 && await olKapakOluMu(k.kapak)){
      eksikler.push('kapak'); kapakOlu = true;
    }
    /* TEKDÜZE DÖNÜŞ: her yol {b, red} verir (eksik alan yokken de) — çağıran
       tek biçim görür,  her zaman güvenli. */
    if(!eksikler.length) return { b: null, red: [] };
    const sIsbn = sorguIsbn(k);
    const kunyeIster = KUNYE.some(a => eksikler.indexOf(a) >= 0);
    const kapakIster = eksikler.indexOf('kapak') >= 0;
    const red = [];

    /* ---------- 1) ISBN sorgusu: künyenin ÖNCELİKLİ kaynağı + kapak ---------- */
    let isbnAdaylar = null, kunye = null, kunyeIsbnli = false;
    if(sIsbn && (kunyeIster || kapakIster)){
      /* Hata YUTULUR: bu yol bir EK yetenek, düşmesi başlık yolunu öldürmemeli
         (v74 dersi — Google bu uçta aralıklı 503 veriyor). */
      try{ isbnAdaylar = await gbSor('isbn:' + sIsbn); }
      catch(e){ isbnAdaylar = null; }
      await bekle(ARALIK_MS);
    }
    if(kunyeIster && sIsbn){
      if(isbnAdaylar && isbnAdaylar.length){ kunye = ciltGB(isbnAdaylar[0]); kunyeIsbnli = true; }
      else{
        const wk = await workerIsbnSessiz(sIsbn);   // 1000Kitap: Türkçe baskılarda birebir
        if(wk){ kunye = ciltWorker(wk); kunyeIsbnli = true; }
      }
      if(!kunye) red.push('ISBN ile künye bulunamadı — başlık aramasına düşülmedi (baskı karışmasın)');
    }

    /* ---------- 2) Başlık araması: tür + kapak için HER ZAMAN, künye için
                     yalnız kayıtta ISBN YOKKEN ---------- */
    const dar = 'intitle:"' + k.ad + '"' + (k.yazar ? ' inauthor:"' + k.yazar + '"' : '');
    const adaylar1 = await gbSor(dar);
    let aday = adaylar1.find(v => baslikUyar(k.ad, v.title));
    let adaylar2 = null;
    if(!aday){
      await bekle(ARALIK_MS);
      adaylar2 = await gbSor('"' + k.ad + '" ' + (k.yazar || ''));
      aday = adaylar2.find(v => baslikUyar(k.ad, v.title));
    }
    if(kunyeIster && !sIsbn){
      if(aday){
        const c = ciltGB(aday);
        const u = ciltUyumsuzlugu(k, c, false);
        if(u) red.push(u); else kunye = c;
      }else{
        red.push('başlığı uyan baskı bulunamadı');
      }
    }

    /* ---------- 3) TÜR (künye DEĞİL — çok cilt havuzu sürüyor) ---------- */
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

    /* ---------- 4) Yazım: künye TEK cilttan, doğrulama kapılarıyla ---------- */
    const bulunan = {};
    if(tur) bulunan.tur = tur;
    if(kunye){
      if(eksikler.indexOf('isbn') >= 0 && kunye.isbn){
        const B = window.__barkod;
        const temiz = (B && B.isbnTemizle) ? B.isbnTemizle(kunye.isbn) : String(kunye.isbn);
        const g = isbnGecersiz(k, temiz, kunye.yayinevi);
        if(g) red.push(g); else bulunan.isbn = temiz;
      }
      if(eksikler.indexOf('yayinevi') >= 0 && kunye.yayinevi){
        const temiz = metinTemizle(kunye.yayinevi);
        const g = yayineviGecersiz(k, kunye, temiz);
        if(g) red.push(g); else bulunan.yayinevi = temiz;
      }
      if(eksikler.indexOf('sayfa') >= 0 && kunye.sayfa > 0) bulunan.sayfa = kunye.sayfa;
      if(eksikler.indexOf('yil') >= 0 && kunye.yil > 1400 && kunye.yil <= new Date().getFullYear() + 1)
        bulunan.yil = kunye.yil;
      if(KUNYE.some(a => bulunan[a] !== undefined)) bulunan.__kaynak = kunye.kaynak;
    }
    /* KAPAK (künye DEĞİL — Kaan istisnası): `isbn:` sonucu öncelikli, yoksa
       başlık-eşleşen aday. İkisi de yoksa alan BOŞ kalır, uydurma kapak yok. */
    if(kapakIster){
      const kpk = kapakAdayBul(isbnAdaylar)
        || (aday && aday.imageLinks && aday.imageLinks.thumbnail ? kapakTemizle(aday.imageLinks.thumbnail) : '')
        || (kunye && !kunyeIsbnli ? '' : (kunye && kunye.kapak) || '');
      if(kpk){ bulunan.kapak = kpk; if(kapakOlu) bulunan.__kapakOlu = true; }
    }
    const gercek = ALANLAR.some(a => bulunan[a] !== undefined);
    return { b: gercek ? bulunan : null, red: red };
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
       (senkronlu union, kesfetGizli deseni). Otomatik yazım bir daha denemez —
       kullanıcı Ayarlar'daki defterden çıkarmadıkça (v91: redAktif). */
    if(redAktif(is.id)) return 'red';
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
    if(tur && canli && alanBos(canli, 'tur') && !redAktif(is.id)){
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
      && !redAktif(k.id)
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
  /* Etkin red (v91): union'dan kayıt SİLMEK öbür cihazdan dirilirdi
     (kesfetGizliGeri dersi) — defterden çıkarma ayrı öz-damgalı haritada
     (veri.turRedGeri, senkronlu union) yaşar. Red ancak damgası geri alma
     damgasından YENİYSE hüküm sürer; yeniden "geri al" denirse yeni red
     damgası geri damgayı geçer, silme gerekmez. */
  function redAktif(id){
    const r = (veri.turRed || {})[id];
    return !!(r && r > (((veri.turRedGeri || {})[id]) || 0));
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
    bildir('Tür geri alındı — bu kitaba bir daha otomatik tür yazılmaz. Ayarlar’dan geri alabilirsin.');
  }
  function otoGeriAlTum(){
    const ids = atananGecerli().map(g => g.id);
    if(!ids.length) return;
    ids.forEach(otoGeriAl);
    if(typeof depoKaydet === 'function') depoKaydet();
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    durumTazele(); otoDurumTazele(); otoListeCiz();
    bildir(ids.length + ' kitabın türü geri alındı — Ayarlar’dan geri alabilirsin');
  }
  /* ---------- Geri alma DEFTERİ (v91): red kalıcıydı, dönüş yolu yoktu ----------
     Yanlışlıkla ✕ / "Tümünü geri al" basılan kitap otomatik türden kalıcı
     mahrum kalıyordu (fiilen yaşandı). "Tekrar dene" kitabı defterden çıkarır:
     turRedGeri damgası basılır (senkronlu — silme union'dan dirilirdi) ve
     yerel deneme damgası düşürülür ki sonraki açılış taraması 90 gün
     beklemeden yeniden sorsun. Tür KENDİLİĞİNDEN DOLMAZ — kitap yalnız
     sonraki taramada yeniden aday olur; arayüz bunu açıkça söyler. */
  function redListesi(){
    return Object.entries(veri.turRed || {})
      .filter(([id]) => redAktif(id))
      .map(([id, t]) => ({ id, t, kitap: (veri.kitaplar || []).find(x => x.id === id) }))
      .filter(g => g.kitap)   // silinmiş kitabın kaydı görünmez (denenecek şey yok)
      .sort((a, b) => (b.t || 0) - (a.t || 0));
  }
  function redCikar(id){
    if(!redAktif(id)) return false;
    veri.turRedGeri = veri.turRedGeri || {};
    veri.turRedGeri[id] = Date.now();
    const d = defterOku(OTO_DENEME_ANAHTAR);
    if(d[id]){ delete d[id]; defterYaz(OTO_DENEME_ANAHTAR, d); }
    return true;
  }
  function redCikarTek(id){
    if(!redCikar(id)) return;
    if(typeof depoKaydet === 'function') depoKaydet();
    durumTazele(); otoDurumTazele(); redListeCiz();
    bildir('Defterden çıkarıldı — türü boşsa sonraki taramada yeniden denenir');
  }
  function redTemizle(){
    const liste = redListesi();
    if(!liste.length) return;
    if(!confirm(liste.length + ' kitap defterden çıkarılsın mı? Türleri kendiliğinden dolmaz — '
      + 'türü boş olanlar sonraki taramada yeniden denenir.')) return;
    liste.forEach(g => redCikar(g.id));
    if(typeof depoKaydet === 'function') depoKaydet();
    durumTazele(); otoDurumTazele(); redListeCiz();
    bildir(liste.length + ' kitap defterden çıkarıldı');
  }
  function redListeCiz(){
    const g = document.getElementById('zgRedOrtuGovde');
    if(!g) return;
    const liste = redListesi();
    if(!liste.length){
      g.innerHTML = '<div class="zg-satir">Defter boş — geri alınmış kitap yok.</div>' +
        '<div class="form-alt"><button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgRedOrtu" style="flex:1">Kapat</button></div>';
      return;
    }
    g.innerHTML =
      '<p class="zg-not">Bu kitapların otomatik türünü geri almıştın; bir daha otomatik tür yazılmıyor. '
      + '"Tekrar dene" kitabı defterden çıkarır: türü KENDİLİĞİNDEN DOLMAZ, '
      + 'türü boşsa bir sonraki taramada yeniden aday olur.</p>'
      + '<div class="zg-onizle-liste">' + liste.map(({ id, kitap }) =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">'
        + '<span class="zg-onizle-ad">' + esc(kitap.ad) + '</span>'
        + (kitap.tur ? '<span class="zg-onizle-alan">Türü şu an dolu: ' + esc(turGoster(kitap.tur)) + '</span>' : '')
        + '</div>'
        + '<button class="btn btn-cerceve" data-act="zg-red-dene" data-kid="' + escAttr(id) + '" '
        + 'style="flex:0 0 auto">Tekrar dene</button></div>').join('') + '</div>'
      + '<div class="form-alt">'
      + '<button class="btn btn-cerceve" data-act="zg-red-temizle" style="flex:1">Defteri temizle</button>'
      + '<button class="btn btn-cerceve" data-act="zg-kapat" data-ortu="zgRedOrtu" style="flex:1">Kapat</button></div>';
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
      + 'Yanlış bulunanı aşağıdan geri alabilirsin — geri aldığın kitaba, defterden çıkarmadıkça '
      + 'bir daha otomatik tür yazılmaz.</p>'
      + '<div class="zg-depo-satir" id="zgOtoDurum">—</div>'
      + '<div class="ay-eylem"><button class="btn btn-cerceve" data-act="zg-oto-liste">'
      + 'Otomatik atanan türler (<span id="zgOtoSayi">0</span>)</button></div>'
      /* v91: defter yolu — defter BOŞKEN hiç görünmez (otoDurumTazele yönetir).
         hidden özniteliği DEĞİL inline display: .ay-eylem'in display:flex kuralı
         [hidden] UA kuralını eziyor (g88 canlı kanıtı). */
      + '<div class="ay-eylem" id="zgRedYol" style="display:none"><button class="btn btn-cerceve" data-act="zg-red-liste">'
      + 'Geri alınanlar (<span id="zgRedSayi">0</span>)</button></div>';
    yuva.appendChild(kart);
    otoDurumTazele();
  }
  function otoDurumTazele(){
    const sayi = document.getElementById('zgOtoSayi');
    if(sayi) sayi.textContent = String(atananGecerli().length);
    /* v91: defter yolu yalnız defter doluyken görünür */
    const redYol = document.getElementById('zgRedYol');
    if(redYol){
      const n = redListesi().length;
      redYol.style.display = n ? '' : 'none';
      const rs = document.getElementById('zgRedSayi');
      if(rs) rs.textContent = String(n);
    }
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
      + 'o kitaba bir daha otomatik tür yazılmaz; elle her zaman girebilirsin. '
      + 'Yanlışlıkla geri alırsan Ayarlar ▸ Otomatik tür ▸ "Geri alınanlar"dan çıkarabilirsin.</p>'
      + '<div class="zg-onizle-liste">' + liste.map(({ id, kitap, kayit }) =>
        '<div class="zg-onizle-satir"><div class="zg-onizle-ic">'
        + '<span class="zg-onizle-ad">' + esc(kitap.ad) + '</span>'
        + '<span class="zg-onizle-alan">Tür: ' + esc(turGoster(kayit.tur)) + '</span></div>'
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
  /* v98/v99: NOT DOSYASI — dördüncü içe aktarım tipi. Özet borusuyla AYNI KALIP
     (dosya seçici → ad+yazar katla eşleme → önizleme → onay → yazım) ama
     planlayıcısı AYRI (iceNotOku/iceNotOnizleCiz/iceNotUygula): boru kitap
     başına TEK değer şemalı (dolacak/değişecek; dosyada çift kayıt → ilk
     kazanır), not dosyası ise kitap başına ÇOK satır taşır. iceOku/iceOnizleCiz'e
     dal eklemek yerine kopya yol: ozetDosyaKur kararının aynısı (tur/adTr/özet
     yolları g56/g59/g79 ile kilitli). Tekil icePlan + iceUygula/iceVazgec ORTAK.
     v99 — KİTAP BAZINDA YENİLEME, yalnız içe aktarımdan gelen notlar için:
     kullanıcı dosyayı zaman zaman yeniden üretir (metin düzelir, satır eklenir);
     salt-ekleme her yüklemede eski+yeni sürümü yan yana biriktiriyordu. Ama aynı
     dizide kullanıcının ELLE girdiği, paylaşımdan ve Goodreads'ten gelen notlar
     da durur — körlemesine "kitabın notlarını sil" onun malzemesini yok ederdi.
     ÇÖZÜM: içe aktarımla yazılan her nota kaynak işareti (kayn:'dosya';
     kitapNormalize taşır, yalnız işaret varken yazılır → işaretsiz kayıtların
     parmak izi değişmez). Uygulamada dosyada GEÇEN her kitap için YALNIZ işaretli
     notlar kaldırılır (senkron için silinenNotlar mezarı, not-sil yolunun
     aynısı), dosyadaki satırlar yazılır; işaretsiz notlara ve dosyada geçmeyen
     kitaplara HİÇ dokunulmaz. Önizleme üçünü sayar (yazılacak / değiştirilecek /
     korunacak), kitap kitap gösterir ve SİLME içerdiğini açıkça söyler.
     KURALLAR: tip yalnız 'not' | 'alinti' (katla ile; başkası → atlanır, sayılır)
     · ad/metin boş → eksik alanlı · eşleşmeyen satır yazılmaz, listelenir ·
     dosya içi tekrar ve elle girilmiş notla aynı metin (katla) → "zaten vardı"
     (yeniden yazılmaz; eski işaretli kopya zaten kaldırılıyor) · kayıt şeması
     detay not-ekle yoluyla birebir: {id: uid(), tip, metin, tarih: bugun(),
     sayfa: null, ng: Date.now()} + kayn — ng/sayfa davranışı DEĞİŞMEDİ; k.g
     kullanıcı-eylemi damgası. Hatırlatma/tekrar için istisna YOK. */
  const ICE_NOT_KAYN = 'dosya';
  /* TEK tanım: silme yalnız bu işaretin doğru olduğu notlarda ve yalnız
     iceNotUygula içinde (g94 kaynak kilidi bu iki gerçeği kilitler). */
  function iceNotIsareti(n){ return !!(n && n.kayn === ICE_NOT_KAYN); }
  const ICE_NOT = {
    anahtar: 'notlar', kaynakAnahtar: 'not',
    ortuId: 'zgNotIceOrtu', ortuBaslik: 'Not dosyası yükle',
    sonTazele(){ durumTazele(); },
    act: { uygula: 'zg-not-uygula', vazgec: 'zg-not-vazgec' },
    metin: {
      bicimYok: 'Bu dosyada not listesi yok — beklenen biçim: { "surum": 1, "not": [ {ad, yazar, metin, tip} ] }',
      yalnizNot: 'Bu işlem SİLME içerir: dosyada geçen kitapların daha önce bu yoldan gelen (dosya işaretli) ' +
        'notları kaldırılır, yerine dosyadaki satırlar yazılır. Elle girdiğin, paylaşımdan ya da Goodreads\'ten ' +
        'gelen not ve alıntılara dokunulmaz; dosyada geçmeyen kitaplara dokunulmaz. ' +
        'Onaylamadan hiçbir şey yazılmaz, silinmez.',
      yazDugme: (n, m) => 'Uygula (' + n + ' yaz' + (m ? ', ' + m + ' sil' : '') + ')',
      toastYazildi: (n, m, kitap) => n + ' not dosyadan yazıldı' +
        (m ? ', ' + m + ' eski içe aktarım notu kaldırıldı' : '') + ' (' + kitap + ' kitap)'
    }
  };
  const NOT_TIPLERI = { not: 'not', alinti: 'alinti' };
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
    if(plan.cfg === ICE_NOT){ iceNotUygula(plan); return; }   // v98: not planı AYRI dal
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
  /* v109: turDosyaKur / ozetDosyaKur / notDosyaKur / kyDosyaKur — DÖRT
     neredeyse birebir kopyaydı (kyDosyaKur'un yorumu bunu zaten söylüyordu).
     Hepsi tek `dyDosyaKur`'a indi; dosyanın hangi boruya gideceğini artık
     düğme değil DOSYANIN KENDİSİ söylüyor (dy- modülü, aşağıda). */

  /* ---------- NOT DOSYASI içe aktarımı (v98 → v99 kitap bazında yenileme) ---------- */
  async function iceNotOku(dosya){
    const cfg = ICE_NOT;
    let govde;
    try{ govde = JSON.parse(await dosya.text()); }
    catch(e){ bildir('Dosya okunamadı — geçerli bir JSON değil'); return; }
    const kayitlar = govde && Array.isArray(govde[cfg.kaynakAnahtar]) ? govde[cfg.kaynakAnahtar] : null;
    /* boş "not" dizisi = işlenecek kayıt yok → dürüst mesaj, hiçbir kitap
       "dosyada geçen" sayılmaz, HİÇBİR ŞEY silinmez */
    if(!kayitlar || !kayitlar.length){ bildir(cfg.metin.bicimYok); return; }
    /* eşleme haritası özet borusuyla BİREBİR: katla(ad)|katla(yazar) */
    const harita = {};
    (veri.kitaplar || []).forEach(k => {
      const anah = katla(k.ad) + '|' + katla(k.yazar || '');
      (harita[anah] = harita[anah] || []).push(k);
    });
    /* plan.kitaplar: dosyada GEÇEN kitaplar (≥1 geçerli eşleşen satır) —
       yalnız bunların işaretli notları yenilenir. Her giriş üç sayı taşır. */
    const plan = { cfg, kitaplar: new Map(), zatenVardi: 0, tipBozuk: 0, gecersiz: 0, eslesmeyen: [] };
    const girdi = k => {
      let e = plan.kitaplar.get(k.id);
      if(!e){
        const notlar = k.notlar || [];
        e = { id: k.id, ad: k.ad, yazilacak: [],
          silinecek: notlar.filter(iceNotIsareti).length,          // eski içe aktarım notları
          korunacak: notlar.filter(n => n && !iceNotIsareti(n)).length,   // elle/paylaşım/Goodreads
          /* tekrar seti YALNIZ korunacak (işaretsiz) notlardan: işaretliler
             zaten kaldırılıyor, onlara göre "zaten vardı" saymak yanlış olurdu */
          gorulen: new Set(notlar.filter(n => n && !iceNotIsareti(n)).map(n => katla(n.metin))) };
        plan.kitaplar.set(k.id, e);
      }
      return e;
    };
    for(const r of kayitlar){
      const metin = r ? String(r.metin == null ? '' : r.metin).trim() : '';
      if(!r || !String(r.ad || '').trim() || !metin){ plan.gecersiz++; continue; }
      const tip = NOT_TIPLERI[katla(r.tip)];
      if(!tip){ plan.tipBozuk++; continue; }
      const kitaplar = harita[katla(r.ad) + '|' + katla(r.yazar || '')];
      if(!kitaplar){ plan.eslesmeyen.push(r); continue; }
      for(const k of kitaplar){
        const e = girdi(k), anah = katla(metin);
        if(e.gorulen.has(anah)){ plan.zatenVardi++; continue; }
        e.gorulen.add(anah);
        e.yazilacak.push({ tip, metin });
      }
    }
    if(icePlan && icePlan.cfg !== cfg) kapat(icePlan.cfg.ortuId);
    icePlan = plan;
    ortuKur(cfg.ortuId, cfg.ortuBaslik);
    iceNotOnizleCiz();
    ac(cfg.ortuId);
  }
  function iceNotToplam(plan){
    let yaz = 0, sil = 0, koru = 0;
    for(const e of plan.kitaplar.values()){ yaz += e.yazilacak.length; sil += e.silinecek; koru += e.korunacak; }
    return { yaz, sil, koru, kitap: plan.kitaplar.size };
  }
  function iceNotOnizleCiz(){
    const plan = icePlan;
    if(!plan || plan.cfg !== ICE_NOT) return;
    const cfg = plan.cfg;
    const g = document.getElementById(cfg.ortuId + 'Govde');
    if(!g) return;
    const t = iceNotToplam(plan);
    const ozet = [];
    if(t.kitap){
      ozet.push('<b>' + t.yaz + '</b> satır yazılacak');
      ozet.push('<b>' + t.sil + '</b> içe aktarım notu değiştirilecek');
      ozet.push('<b>' + t.koru + '</b> elle girilmiş not korunacak');
    }
    if(plan.zatenVardi) ozet.push(plan.zatenVardi + ' satır zaten vardı');
    if(plan.eslesmeyen.length) ozet.push(plan.eslesmeyen.length + ' satır eşleşmedi');
    if(plan.tipBozuk) ozet.push(plan.tipBozuk + ' satır tip alanı bozuk (atlanacak)');
    if(plan.gecersiz) ozet.push(plan.gecersiz + ' satır eksik alanlı (atlanacak)');
    const katla_ = (baslik, satirlar) => satirlar.length
      ? '<details class="zg-katla"><summary>' + baslik + ' (' + satirlar.length + ')</summary>' +
        '<div class="zg-onizle-liste">' + satirlar.join('') + '</div></details>'
      : '';
    const kirp = s => { s = String(s == null ? '' : s); return s.length > 60 ? s.slice(0, 60) + '…' : s; };
    const satir = (ad, alan) => '<div class="zg-onizle-satir"><div class="zg-onizle-ic">' +
      '<span class="zg-onizle-ad">' + esc(ad) + '</span>' +
      '<span class="zg-onizle-alan">' + alan + '</span></div></div>';
    const kitaplar = Array.from(plan.kitaplar.values());
    const yazSatirlari = [];
    for(const e of kitaplar) for(const y of e.yazilacak)
      yazSatirlari.push(satir(e.ad, (y.tip === 'alinti' ? 'alıntı' : 'not') + ': ' + esc(kirp(y.metin))));
    g.innerHTML =
      '<div class="zg-ozet">' + (ozet.join(' · ') || 'Dosyada işlenecek kayıt yok.') + '</div>' +
      '<p class="zg-not">' + cfg.metin.yalnizNot + '</p>' +
      katla_('Kitap kitap', kitaplar.map(e => satir(e.ad,
        e.yazilacak.length + ' yazılacak · ' + e.silinecek + ' değiştirilecek · ' + e.korunacak + ' korunacak'))) +
      katla_('Yazılacak satırlar', yazSatirlari) +
      katla_('Eşleşmeyen satırlar', plan.eslesmeyen.map(r => satir(r.ad, esc(r.yazar || '')))) +
      '<div class="form-alt">' +
        '<button class="btn btn-cerceve" data-act="' + cfg.act.vazgec + '" style="flex:1">Vazgeç</button>' +
        ((t.yaz || t.sil)
          ? '<button class="btn btn-cerceve" data-act="' + cfg.act.uygula + '" style="flex:2">' +
            cfg.metin.yazDugme(t.yaz, t.sil) + '</button>'
          : '') +
      '</div>';
  }
  /* Yazım — dosyada GEÇEN her kitap için: (1) YALNIZ işaretli (kayn:'dosya')
     notlar kaldırılır, her biri için silinenNotlar mezarı (index.html not-sil
     yolunun aynısı — karşı cihazın kopyası dirilmesin); (2) dosyadaki satırlar
     işaretli yazılır. İşaretsiz nota ve dosyada geçmeyen kitaba dokunulmaz.
     Bu fonksiyon zengin.js'te notlar dizisini değiştiren TEK yerdir; silme
     TEK satırdır ve yalnız iceNotIsareti'ne dayanır (g94 kilidi). */
  function iceNotUygula(plan){
    const cfg = plan.cfg;
    icePlan = null;
    let nYaz = 0, nSil = 0, nKitap = 0;
    for(const e of plan.kitaplar.values()){
      const k = (veri.kitaplar || []).find(x => x.id === e.id);
      if(!k) continue;
      k.notlar = k.notlar || [];
      const eski = k.notlar.filter(iceNotIsareti);
      if(eski.length){
        k.silinenNotlar = k.silinenNotlar || {};
        for(const n of eski) if(n.id) k.silinenNotlar[n.id] = Date.now();
        k.notlar = k.notlar.filter(n => !iceNotIsareti(n));
        nSil += eski.length;
      }
      for(const y of e.yazilacak){
        k.notlar.push({ id: uid(), tip: y.tip, metin: y.metin, tarih: bugun(), sayfa: null, ng: Date.now(), kayn: ICE_NOT_KAYN });
        nYaz++;
      }
      k.g = Date.now();
      nKitap++;
    }
    if(typeof depoKaydet === 'function') depoKaydet();
    kapat(cfg.ortuId);
    bildir(cfg.metin.toastYazildi(nYaz, nSil, nKitap));
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    cfg.sonTazele();
  }

  /* ========== KÜTÜPHANE DOSYASI (v100) — TAM DEĞİŞTİRME geri yükleme ==========
     Ayarlar ▸ İçe/dışa aktarım ▸ "Kütüphane dosyası". Uygulamanın kendi JSON
     yedeğini (disaAktar biçimi: surum, tarih, kitaplar, hedef + hedefG,
     hedefSayfa + hedefSayfaG, silinenler, kesfetGizli + kesfetGizliGeri,
     turRed + turRedGeri, ozetler) kütüphanenin YENİ HÂLİ sayar. Çekirdek
     iceAktar BİRLEŞTİRİR (ad+yazar mükerreri atlar, hiç silmez) — dışarıda
     toplu düzeltilmiş bir dosya (ad/künye düzeltmesi, silme, ekleme) o yoldan
     uygulanamıyordu. Bu yol id-bazlı tam değiştirmedir.
     AKIŞ: dosya → DOĞRULAMA (JSON · kitaplar dizisi · her kayıtta ad+yazar ·
     surum === YEDEK_SURUM · id tekrarı yok · boş dizi değil; biri düşerse HİÇ
     yazılmaz, nedenleri pencerede) → PLAN (id eşlemesi: eklenecek /
     güncellenecek / silinecek / aynı) → ONAY penceresi (sayılar + TAM
     DEĞİŞTİRME uyarısı + listeler; onaysız tek bayt yok) → yazımdan HEMEN ÖNCE
     anlık kopya (IndexedDB kk_geri_v1, tek kayıt 'son': veri + özetler) →
     yazım → liste tazelenir, sayılar toast'ta.
     SENKRON UYUMU: silinen kayıt için silinenler mezarı (gorunum.js toplu-sil
     yolunun aynısı: veri.silinenler[id] = t); güncellenen/eklenen kayıt k.g = t
     (LWW'de bu cihaz kazanır); AYNI kalan kayıt mevcut nesnesiyle kalır (damga
     ve parmak izi dokunulmaz); mezarı olan bir id dosyada varsa g = t + mezar
     düşer (zombi engeli). Tercih haritaları (kesfetGizli/turRed + geri) ve
     mezarlar öz-damgalı UNION'dur — senkrondan dirileceği için değiştirme
     değil en-yeni-damga birleşimi. Hedefler dosyadan; değeri değişen yıl
     damgalanır. Özet işaretleri (ozetVar/ozetUzunluk/ozetG) yerel IDB'den
     yeniden türetilir — dosyadaki bayat işaret yerelle çelişmesin.
     ÖZETLER (Kaan kararı, 2026-09-04): DAMGA KAPILI — dosyadaki özet yalnız
     damgası yereldekinden YENİYSE yazılır (iceAktar kuralı); yalnız yeni
     kütüphanede yaşayan kitaplar için (yetim üretmez).
     GERİ AL: kk_geri_v1'deki son anlık kopya AYNI boruya "dosya" olarak girer
     (yapısal doğrulama → önizleme → onay → yazım); yazım yine anlık kopya alır →
     geri almanın kendisi de bir adım geri alınabilir. Yüklemenin yazdığı özet
     id'leri kopyada tutulur; geri almada bunlar damga kapısı OLMADAN (taze
     damgayla) kopyadaki hâline döner — kapı olsaydı yüklemenin taze damgası
     geri almayı yenerdi.
     KAPSAM DIŞI: kapak fotoğrafları (cihaz-yerel blob, yedekte yok) — silinen
     kitabın fotoğrafına DOKUNULMAZ; açılış yetim süpürücüsü (kapak.js) sonraki
     yüklemede toplar; geri alma fotoğrafı geri getiremez.
     AD ALANI: ky- (sınıf / data-act), ky (id). */
  const KY_DB_AD = 'kk_geri_v1', KY_MAGAZA = 'anlik', KY_ANAHTAR = 'son';
  const KY_HATA_TAVAN = 8;   // pencerede listelenen en çok hata; kalanı sayıyla
  let kyDbSoz = null;
  let kyPlan = null;   // tekil: uygula/vazgeç daima SON kurulan plana işler
  function kyYedekSurum(){ return (typeof YEDEK_SURUM === 'number') ? YEDEK_SURUM : 2; }
  function kyDbAc(){
    if(kyDbSoz) return kyDbSoz;
    kyDbSoz = new Promise((cozul, kir) => {
      let istek;
      try{ istek = indexedDB.open(KY_DB_AD, 1); }
      catch(e){ kir(e); return; }
      istek.onupgradeneeded = () => {
        const db = istek.result;
        if(!db.objectStoreNames.contains(KY_MAGAZA)) db.createObjectStore(KY_MAGAZA);
      };
      istek.onsuccess = () => {
        const db = istek.result;
        db.onclose = () => { kyDbSoz = null; };
        db.onversionchange = () => { try{ db.close(); }catch(e){} kyDbSoz = null; };
        cozul(db);
      };
      istek.onerror = () => kir(istek.error || new Error('IDB açılamadı'));
      istek.onblocked = () => kir(new Error('IDB engellendi'));
    });
    kyDbSoz.catch(() => { kyDbSoz = null; });
    return kyDbSoz;
  }
  function kyIslem(mod, gorev){
    return kyDbAc().then(db => new Promise((cozul, kir) => {
      let sonuc, tx;
      try{ tx = db.transaction(KY_MAGAZA, mod); sonuc = gorev(tx.objectStore(KY_MAGAZA)); }
      catch(e){ kyDbSoz = null; kir(e); return; }
      tx.oncomplete = () => cozul(sonuc ? sonuc.result : undefined);
      tx.onerror = () => kir(tx.error || new Error('işlem hatası'));
      tx.onabort = () => kir(tx.error || new Error('işlem iptal'));
    }));
  }
  function kyAnlikOku(){
    return kyIslem('readonly', st => st.get(KY_ANAHTAR)).catch(() => null)
      .then(k => (k && typeof k === 'object') ? k : null);
  }
  function kyAnlikYaz(kayit){ return kyIslem('readwrite', st => st.put(kayit, KY_ANAHTAR)); }

  /* DOĞRULAMA — dönüş: hata dizisi (boş = geçerli). Hiçbir şey yazmaz.
     gevsek: anlık kopya (uygulamanın kendi verisi) — kayıt-düzeyi ad/yazar
     kapısı uygulanmaz (form yazarı zorunlu tutmaz; kopyada yazarsız kitap
     olabilir, geri alma bu yüzden kilitlenmemeli). Yapısal kapılar aynen. */
  function kyDogrula(y, gevsek){
    const h = [];
    if(!y || typeof y !== 'object' || Array.isArray(y)){
      h.push('Dosyanın üst düzeyi bir nesne değil — Pinakes kütüphane yedeği değil.'); return h; }
    if(!Array.isArray(y.kitaplar)){
      h.push('Dosyada "kitaplar" dizisi yok — Pinakes kütüphane yedeği değil.'); return h; }
    const beklenen = kyYedekSurum();
    if(y.surum === undefined || y.surum === null) h.push('Dosyada "surum" alanı yok; uygulama ' + beklenen + ' bekliyor.');
    else if(y.surum !== beklenen) h.push('Yedek sürümü uyumsuz: dosyada ' + esc(String(y.surum)) + ', uygulama ' + beklenen + ' bekliyor.');
    if(!y.kitaplar.length) h.push('Dosyada hiç kitap yok — tam değiştirme kütüphaneyi boşaltırdı. Boşaltmak için Tehlikeli bölge\'yi kullan.');
    const idler = new Set(); let fazla = 0;
    const ekle = m => { if(h.length < KY_HATA_TAVAN) h.push(m); else fazla++; };
    y.kitaplar.forEach((k, i) => {
      const n = i + 1;
      if(!k || typeof k !== 'object' || Array.isArray(k)){ ekle(n + '. kayıt bir nesne değil.'); return; }
      if(!gevsek){
        const ad = String(k.ad == null ? '' : k.ad).trim(), yazar = String(k.yazar == null ? '' : k.yazar).trim();
        if(!ad) ekle(n + '. kayıt: ad alanı boş' + (yazar ? ' (yazar: ' + esc(yazar) + ')' : '') + '.');
        if(!yazar) ekle(n + '. kayıt: yazar alanı boş' + (ad ? ' (ad: ' + esc(ad) + ')' : '') + '.');
      }
      if(k.id != null && k.id !== ''){
        const id = String(k.id);
        if(idler.has(id)) ekle(n + '. kayıt: id tekrar ediyor (' + esc(id) + ').');
        idler.add(id);
      }
    });
    if(fazla) h.push('… ve ' + fazla + ' hata daha.');
    return h;
  }
  /* Karşılaştırma izi: senkron.js kitapParmak'ın aynası — g, ozet* ve notların
     tekrar* alanları DIŞARIDA (türetilmiş / ayrı kanal; onların farkı
     "güncelleme" sayılmaz). İki taraf da kitapNormalize'dan geçer ki alan
     sırası ve şekli birebir olsun. */
  function kyIz(k){
    const c = kitapNormalize(k); delete c.g;
    delete c.ozet; delete c.ozetVar; delete c.ozetUzunluk; delete c.ozetG;
    /* Notların tekrar* alanları da iz DIŞI (tekrar.js'in ayrı kanalı). Dizi
       YERİNDE değiştirilmez: iz nesnesi kopyadan kurulur — g94 kaynak kilidi
       zengin.js'te iceNotUygula dışında notlar dizisine yazım aramaz ve burada
       gerçekten yazım yok. Spread `notlar`ı yerinde tutar → anahtar sırası,
       dolayısıyla iz dizgesi, kayıtlar arasında karşılaştırılabilir kalır. */
    if(Array.isArray(c.notlar)){
      const temizNotlar = c.notlar.map(n => {
        const t = { ...n };
        delete t.tekrarSonraki; delete t.tekrarAralik; delete t.tekrarSayisi; delete t.tekrarDurum;
        return t;
      });
      return JSON.stringify({ ...c, notlar: temizNotlar });
    }
    return JSON.stringify(c);
  }
  const KY_ALAN_AD = { ad: 'ad', adTr: 'Türkçe ad', yazar: 'yazar', yayinevi: 'yayınevi', yil: 'yıl',
    sayfa: 'sayfa', tur: 'tür', isbn: 'ISBN', durum: 'durum', puan: 'puan', puanYok: 'puan yok işareti',
    etiketler: 'etiketler', notlar: 'notlar', cevirmen: 'çevirmen', dil: 'dil', seri: 'seri', ciltNo: 'cilt',
    raf: 'raf', sahiplik: 'sahiplik', kapak: 'kapak', kapakYerel: 'kapak fotoğrafı işareti',
    baslamaTarihi: 'başlama tarihi', bitisTarihi: 'bitiş tarihi', ertelemeTarihi: 'erteleme',
    guncelSayfa: 'güncel sayfa', gsG: 'ilerleme damgası', okumalar: 'okumalar', seanslar: 'seanslar',
    oturumlar: 'oturumlar', odunc: 'ödünç', eklenme: 'eklenme', silinenNotlar: 'not mezarları' };
  function kyDegisenAlanlar(eski, yeni){
    const a = JSON.parse(kyIz(eski)), b = JSON.parse(kyIz(yeni));
    const alanlar = [];
    for(const anah of new Set(Object.keys(a).concat(Object.keys(b))))
      if(JSON.stringify(a[anah]) !== JSON.stringify(b[anah])) alanlar.push(KY_ALAN_AD[anah] || anah);
    return alanlar;
  }
  function kyDamgaBirlestir(a, b){   // öz-damgalı harita UNION'u: anahtar başına en yeni damga
    const c = {};
    for(const kaynak of [a, b]){
      if(!kaynak || typeof kaynak !== 'object' || Array.isArray(kaynak)) continue;
      for(const [k, v] of Object.entries(kaynak)){
        const n = Number(v);
        if(Number.isFinite(n) && n > 0 && !(c[k] >= n)) c[k] = n;
      }
    }
    return c;
  }
  function kyHedefDegisirMi(eski, yeni){
    if(!yeni || typeof yeni !== 'object' || Array.isArray(yeni)) return false;
    const e = eski || {};
    for(const a of new Set(Object.keys(e).concat(Object.keys(yeni))))
      if(String(e[a] == null ? '' : e[a]) !== String(yeni[a] == null ? '' : yeni[a])) return true;
    return false;
  }
  /* DAMGA KAPILI özet girişleri → [id, {m,g,o}, zorla]. Yalnız yeni
     kütüphanede yaşayan id'ler; dosya damgası > yerel damga. zorla: geri
     almada yüklemenin yazdığı id'ler — kapısız, kopyadaki hâline (kopyada
     hiç yoksa MEZAR: boş metin) taze damgayla döner. */
  function kyOzetGirisleri(y, canliIdler, zorla){
    if(!window.__ozet || !y.ozetler || typeof y.ozetler !== 'object' || Array.isArray(y.ozetler)) return [];
    const zorlaSet = new Set((zorla || []).map(String));
    const cikti = [];
    for(const [id, o] of Object.entries(y.ozetler)){
      if(!canliIdler.has(String(id))) continue;
      const kayit = (o && typeof o === 'object') ? o : null;
      if(zorlaSet.has(String(id))){ cikti.push([String(id), kayit || { m: '', g: 0, o: '' }, true]); continue; }
      if(!kayit || typeof kayit.m !== 'string') continue;
      if((parseInt(kayit.g) || 0) > window.__ozet.damga(id)) cikti.push([String(id), kayit, false]);
    }
    for(const id of zorlaSet)
      if(canliIdler.has(id) && !Object.prototype.hasOwnProperty.call(y.ozetler, id))
        cikti.push([id, { m: '', g: 0, o: '' }, true]);
    return cikti;
  }
  /* PLAN — dosya (normalize edilmiş kayıtlar) ↔ MEVCUT veri, id eşlemesi.
     Hiçbir şey yazmaz; uygulama anında YENİDEN kurulur (önizleme açıkken
     senkron veri.kitaplar'ı değiştirmiş olabilir). */
  function kyPlanKur(y, zorla){
    const mevcut = new Map((veri.kitaplar || []).map(k => [String(k.id), k]));
    const dosyaIdler = new Set();
    const plan = { y, ekle: [], guncelle: [], sil: [], ayni: 0,
      dosyaSayi: y.kitaplar.length, mevcutSayi: mevcut.size,
      hedefDegisir: false, ozetYazilacak: 0, ozetToplam: 0, idDegisen: 0 };
    for(const r of y.kitaplar){
      const id = String(r.id); dosyaIdler.add(id);
      const m = mevcut.get(id);
      if(!m) plan.ekle.push({ id, ad: r.ad, yazar: r.yazar });
      else if(kyIz(m) === kyIz(r)) plan.ayni++;
      else plan.guncelle.push({ id, ad: r.ad, yazar: r.yazar, alanlar: kyDegisenAlanlar(m, r) });
    }
    for(const [id, m] of mevcut) if(!dosyaIdler.has(id)) plan.sil.push({ id, ad: m.ad, yazar: m.yazar });
    /* ad + yazar aynı ama id farklı: silinip yeniden eklenecek çift — dosyanın
       id'leri yeniden üretilmişse kullanıcı önizlemede fark etsin (bilgi satırı) */
    const anah = k => katla(k.ad) + '|' + katla(k.yazar || '');
    const silAnah = new Set(plan.sil.map(anah));
    plan.idDegisen = plan.ekle.filter(e => silAnah.has(anah(e))).length;
    plan.hedefDegisir = kyHedefDegisirMi(veri.hedef, y.hedef) || kyHedefDegisirMi(veri.hedefSayfa, y.hedefSayfa);
    if(y.ozetler && typeof y.ozetler === 'object' && !Array.isArray(y.ozetler)){
      plan.ozetToplam = Object.keys(y.ozetler).length;
      plan.ozetYazilacak = kyOzetGirisleri(y, dosyaIdler, zorla).length;
    }
    return plan;
  }
  function kyHedefUygula(alan, damgaAlan, y, t){
    if(!y[alan] || typeof y[alan] !== 'object' || Array.isArray(y[alan])) return;   // dosyada yoksa dokunma
    const eski = veri[alan] || {};
    const damga = kyDamgaBirlestir(veri[damgaAlan], y[damgaAlan]);
    const yeni = {};
    for(const [yil, v] of Object.entries(y[alan])){
      const n = Number(v);
      if(!Number.isFinite(n) || n <= 0) continue;
      yeni[yil] = n;
      if(String(eski[yil] == null ? '' : eski[yil]) !== String(n)) damga[yil] = t;   // değeri değişen yıl: bu cihaz kazanır
    }
    veri[alan] = yeni; veri[damgaAlan] = damga;
  }
  /* özet işaretleri yerel depodan (doğruluk kaynağı IDB) — depo hazır değilse
     dokunma (boş okuma tüm işaretleri söndürürdü) */
  function kyOzetIsaretleriTazele(kitaplar){
    if(!window.__ozet || !window.__ozet.hazir) return;
    for(const k of kitaplar){
      const m = window.__ozet.oku(k.id) || '', g = window.__ozet.damga(k.id);
      if(k.ozetVar !== !!m || k.ozetUzunluk !== m.length || (k.ozetG || 0) !== g){
        k.ozetVar = !!m; k.ozetUzunluk = m.length; k.ozetG = g;
      }
    }
  }
  function kyTarih(t){
    try{ return new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch(e){ return String(t); }
  }
  function kyBaslikYaz(metin){
    const b = document.querySelector('#kyOrtu .sheet-baslik');
    if(b) b.textContent = metin;
  }
  async function kyOku(dosya){
    let govde;
    try{ govde = JSON.parse(await dosya.text()); }
    catch(e){ kyHataCiz(['Dosya okunamadı — geçerli bir JSON değil.'], dosya.name); return; }
    if(window.__ozet && window.__ozet.hazirBekle) await window.__ozet.hazirBekle();   // özet damgaları için
    kyBaslat(govde, { kaynak: 'dosya', dosyaAdi: dosya.name || '' });
  }
  function kyBaslat(govde, ek){
    const hatalar = kyDogrula(govde, ek.kaynak === 'geri');
    if(hatalar.length){ kyHataCiz(hatalar, ek.dosyaAdi); return; }
    const y = { ...govde, kitaplar: govde.kitaplar.map(kitapNormalize) };   // id'siz kayıt burada id alır (plan ve yazım aynı id)
    const plan = Object.assign(kyPlanKur(y, ek.ozetZorla), ek);
    kyPlan = plan;
    kyOnizleCiz(plan);
  }
  function kyHataCiz(hatalar, dosyaAdi){
    kyPlan = null;
    ortuKur('kyOrtu', 'Kütüphane dosyası yükle');
    kyBaslikYaz('Kütüphane dosyası yükle');
    const g = document.getElementById('kyOrtuGovde');
    if(!g) return;
    g.innerHTML =
      '<div class="ky-ozet">' + (dosyaAdi ? esc(dosyaAdi) + ' — ' : '') + 'dosya <b>doğrulamadan geçemedi</b>, hiçbir şey yazılmadı.</div>' +
      '<ul class="ky-hata">' + hatalar.map(h => '<li>' + h + '</li>').join('') + '</ul>' +
      '<p class="ky-uyari">Dosyayı düzeltip yeniden seçebilirsin. Beklenen biçim: uygulamanın "JSON indir" çıktısı ' +
        '(surum ' + kyYedekSurum() + ', "kitaplar" dizisi, her kayıtta ad + yazar).</p>' +
      '<div class="form-alt"><button class="btn btn-cerceve" data-act="ky-vazgec" style="flex:1">Kapat</button></div>';
    ac('kyOrtu');
  }
  function kyOnizleCiz(plan){
    ortuKur('kyOrtu', 'Kütüphane dosyası yükle');
    const geri = plan.kaynak === 'geri';
    kyBaslikYaz(geri ? 'Geri al — önceki duruma dön' : 'Kütüphane dosyası yükle');
    const g = document.getElementById('kyOrtuGovde');
    if(!g) return;
    const satir = (ad, alan) => '<div class="ky-satir"><span class="ky-ad">' + esc(ad) + '</span>' +
      '<span class="ky-alan">' + alan + '</span></div>';
    const katla_ = (baslik, satirlar) => satirlar.length
      ? '<details class="ky-katla"><summary>' + baslik + ' (' + satirlar.length + ')</summary>' +
        '<div class="ky-liste">' + satirlar.join('') + '</div></details>'
      : '';
    const ozet1 = (geri ? 'Anlık kopyada' : 'Dosyada') + ' <b>' + plan.dosyaSayi + '</b> kayıt · mevcut <b>' + plan.mevcutSayi + '</b> kayıt';
    const ozet2 = ['<b>' + plan.ekle.length + '</b> eklenecek', '<b>' + plan.guncelle.length + '</b> güncellenecek',
      '<b>' + plan.sil.length + '</b> silinecek', plan.ayni + ' aynı kalacak'];
    if(plan.idDegisen) ozet2.push(plan.idDegisen + ' kayıt ad + yazar aynı ama id farklı (silinip yeniden eklenecek)');
    if(plan.hedefDegisir) ozet2.push('yıl hedefleri ' + (geri ? 'kopyadaki' : 'dosyadaki') + ' değerlerle değişecek');
    if(plan.ozetToplam) ozet2.push(plan.ozetYazilacak
      ? '<b>' + plan.ozetYazilacak + '</b> özet ' + (geri ? 'kopyadan geri gelecek' : 'dosyadan yazılacak (damgası yereldekinden yeni)')
      : (geri ? 'özetlerde değişiklik yok' : 'dosyadaki ' + plan.ozetToplam + ' özetin hiçbiri yereldekinden yeni değil — özetlere dokunulmayacak'));
    const uyari = geri
      ? 'Önceki duruma dönüş: ' + esc(kyTarih(plan.kopyaTarihi)) + ' tarihli anlık kopya kütüphanenin yeni hâli olur — ' +
        'kopyada olmayan <b>' + plan.sil.length + '</b> kayıt <b>SİLİNİR</b>. Bu geri alma da bir adım geri alınabilir: yazımdan ' +
        'hemen önce şimdiki durumun anlık kopyası alınır. Onaylamadan hiçbir şey değişmez.'
      : 'Bu işlem <b>TAM DEĞİŞTİRME</b>dir, birleştirme değil: kütüphane dosyadaki hâle getirilir. Dosyada olmayan ' +
        '<b>' + plan.sil.length + '</b> kayıt — notları, alıntıları ve oturumlarıyla — <b>SİLİNİR</b>. Yazmadan hemen önce ' +
        'mevcut durumun anlık kopyası alınır; Ayarlar ▸ Kütüphane dosyası altındaki <b>Geri al</b> ile tek adım geri ' +
        'dönebilirsin. Onaylamadan hiçbir şey değişmez.';
    const dugme = (plan.ekle.length + plan.guncelle.length + plan.sil.length)
      ? 'Uygula (' + plan.ekle.length + ' ekle, ' + plan.guncelle.length + ' güncelle, ' + plan.sil.length + ' sil)'
      : 'Uygula (kayıt değişikliği yok)';
    g.innerHTML =
      '<div class="ky-ozet">' + ozet1 + '</div>' +
      '<div class="ky-ozet">' + ozet2.join(' · ') + '</div>' +
      '<p class="ky-uyari">' + uyari + '</p>' +
      katla_('Silinecekler', plan.sil.map(s => satir(s.ad, esc(s.yazar || '')))) +
      katla_('Eklenecekler', plan.ekle.map(s => satir(s.ad, esc(s.yazar || '')))) +
      katla_('Güncellenecekler', plan.guncelle.map(s => satir(s.ad,
        esc(s.yazar || '') + (s.alanlar.length ? ' — değişen: ' + esc(s.alanlar.join(', ')) : '')))) +
      '<div class="form-alt">' +
        '<button class="btn btn-cerceve" data-act="ky-vazgec" style="flex:1">Vazgeç</button>' +
        '<button class="btn btn-cerceve" data-act="ky-uygula" style="flex:2">' + dugme + '</button>' +
      '</div>';
    ac('kyOrtu');
  }
  function kyVazgec(){
    const vardi = !!kyPlan;
    kyPlan = null;
    kapat('kyOrtu');
    if(vardi) bildir('Vazgeçildi — hiçbir şey yazılmadı');
  }
  /* YAZIM — sıra: (1) anlık kopya IDB'ye (alınamazsa HİÇ yazılmaz), (2) plan
     uygulama anında yeniden kurulur, bellek değişir, depoKaydet (senkron
     sarmalı: damgala + iz + planla), liste tazelenir, (3) özetler damga
     kapılı, (4) toast sayılarla. */
  async function kyUygula(){
    const plan = kyPlan;
    if(!plan || plan.calisiyor) return;
    plan.calisiyor = true;
    const y = plan.y;
    const geri = plan.kaynak === 'geri';
    const taze = kyPlanKur(y, geri ? plan.ozetZorla : null);
    const canli = new Set(y.kitaplar.map(r => String(r.id)));
    const ozetGirisler = kyOzetGirisleri(y, canli, geri ? plan.ozetZorla : null);
    const kopya = { tarih: Date.now(), kaynak: plan.kaynak, dosyaAdi: plan.dosyaAdi || '', surum: kyYedekSurum(),
      veri: JSON.parse(JSON.stringify(veri)),
      ozetler: (window.__ozet && window.__ozet.hepsiDisa) ? window.__ozet.hepsiDisa() : {},
      kitapSayi: (veri.kitaplar || []).length,
      ozetYazilan: ozetGirisler.map(g => g[0]),
      sonuc: { ekle: taze.ekle.length, guncelle: taze.guncelle.length, sil: taze.sil.length } };
    try{ await kyAnlikYaz(kopya); }
    catch(e){
      plan.calisiyor = false;
      window._iz && window._iz('kyAnlikYaz', e);
      bildir('Anlık kopya alınamadı — hiçbir şey yazılmadı');
      return;
    }
    const t = Date.now();
    const mevcut = new Map((veri.kitaplar || []).map(k => [String(k.id), k]));
    const yeni = [], eklenen = [];
    for(const r of y.kitaplar){
      const m = mevcut.get(String(r.id));
      if(m && kyIz(m) === kyIz(r)){ yeni.push(m); continue; }   // AYNI: mevcut nesne, damga korunur
      const k = kitapNormalize(r); k.g = t;                      // güncellenen / eklenen: bu cihaz LWW'de kazanır
      if(!m) eklenen.push(k.id);
      yeni.push(k);
    }
    const silinenler = kyDamgaBirlestir(veri.silinenler, y.silinenler);
    for(const s of taze.sil) silinenler[s.id] = t;              // toplu-sil yolunun mezarı
    for(const k of yeni) if(silinenler[k.id]){                   // zombi engeli: mezarlı id dosyada yaşıyorsa
      if(silinenler[k.id] >= (k.g || 0)) k.g = t;
      delete silinenler[k.id];
    }
    veri.kitaplar = yeni;
    veri.silinenler = silinenler;
    kyHedefUygula('hedef', 'hedefG', y, t);
    kyHedefUygula('hedefSayfa', 'hedefSayfaG', y, t);
    for(const a of ['kesfetGizli', 'kesfetGizliGeri', 'turRed', 'turRedGeri']) veri[a] = kyDamgaBirlestir(veri[a], y[a]);
    kyOzetIsaretleriTazele(yeni);
    const depoTamam = (typeof depoKaydet === 'function') ? depoKaydet() : true;
    kyPlan = null;
    kapat('kyOrtu');
    if(typeof hepsiniCiz === 'function') hepsiniCiz();
    let ozetYazildi = 0;
    if(ozetGirisler.length){
      const sonuclar = await Promise.all(ozetGirisler.map(([id, o, zor]) => {
        const g = zor ? Math.max(parseInt(o.g) || 0, Date.now()) : o.g;
        const onto = (o.o === undefined || o.o === null) ? (zor ? '' : undefined) : o.o;
        return Promise.resolve(window.__ozet.kaydetHam(id, o.m, g, onto)).catch(() => false);
      }));
      ozetYazildi = sonuclar.filter(Boolean).length;
      if(ozetYazildi){
        kyOzetIsaretleriTazele(veri.kitaplar);
        if(typeof depoKaydet === 'function') depoKaydet();
        if(typeof listeCiz === 'function') listeCiz();
      }
    }
    if(typeof taslakAday === 'function') eklenen.forEach(id => taslakAday(id));
    durumTazele();
    kyGeriKartTazele();
    bildir((geri ? 'Geri alındı' : 'Kütüphane dosyadan yüklendi') + ' — ' + yeni.length + ' kayıt işlendi: ' +
      taze.ekle.length + ' eklendi, ' + taze.guncelle.length + ' güncellendi, ' + taze.sil.length + ' silindi' +
      (ozetYazildi ? ', ' + ozetYazildi + ' özet yazıldı' : '') +
      (depoTamam === false ? ' — DİKKAT: depo yazılamadı (kota)' : ''));
  }
  async function kyGeriKartTazele(){
    const kart = document.getElementById('kyGeriKart');
    if(!kart) return;
    const kopya = await kyAnlikOku();
    if(!kopya || !kopya.veri || !Array.isArray(kopya.veri.kitaplar)){ kart.hidden = true; kart.innerHTML = ''; return; }
    const ne = kopya.kaynak === 'geri' ? 'geri alma'
      : 'kütüphane dosyası yüklemesi' + (kopya.dosyaAdi ? ' (' + esc(kopya.dosyaAdi) + ')' : '');
    const s = kopya.sonuc || {};
    kart.innerHTML =
      '<b>Geri alınabilir:</b> ' + esc(kyTarih(kopya.tarih)) + ' — ' + ne + ' öncesi durum, <b>' +
      kopya.veri.kitaplar.length + '</b> kayıt' +
      ((s.ekle || s.guncelle || s.sil)
        ? ' (o işlem: ' + (s.ekle || 0) + ' ekleme, ' + (s.guncelle || 0) + ' güncelleme, ' + (s.sil || 0) + ' silme)' : '') +
      '. Anlık kopya bu cihazda, tarayıcının IndexedDB deposunda (' + KY_DB_AD + ') durur; yalnız son işlem ' +
      'saklanır, senkrona ve yedeğe girmez. Geri alma da bir adım geri alınabilir.' +
      '<div><button class="btn btn-cerceve" data-act="ky-geri">Geri al</button></div>';
    kart.hidden = false;
  }
  async function kyGeriBaslat(){
    const kopya = await kyAnlikOku();
    if(!kopya || !kopya.veri || !Array.isArray(kopya.veri.kitaplar)){ bildir('Geri alınacak anlık kopya yok'); return; }
    if(window.__ozet && window.__ozet.hazirBekle) await window.__ozet.hazirBekle();
    const govde = { surum: kopya.surum || kyYedekSurum(), ...kopya.veri, ozetler: kopya.ozetler || {} };
    kyBaslat(govde, { kaynak: 'geri', dosyaAdi: '', kopyaTarihi: kopya.tarih,
      ozetZorla: Array.isArray(kopya.ozetYazilan) ? kopya.ozetYazilan : [] });
  }

  /* ---------- tarama döngüsü ---------- */
  async function taramaBaslat(){
    if(calisiyor) return;
    let kdurum = kuyrukYukle();
    if(!kdurum || kdurum.bitti){
      kdurum = { sira: (veri.kitaplar || []).filter(k => ALANLAR.some(a => alanBos(k, a))).map(k => k.id),
        islenen: {}, bulunan: {}, red: {}, hata: {}, bitti: false };
    }
    if(!kdurum.red) kdurum.red = {};   // v102 öncesi yarım kalmış kuyruk durumu
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
            /* v102: dönüş {b, red} — red = kaynak bütünlüğü / doğrulama
               kapılarının reddettiği alanların gerekçeleri (md.5 "işaretle"),
               önizlemede görünür; hiçbir alan sessizce boş kalmaz. */
            const s = await kitapSorgula(k);
            if(s && s.b) kdurum.bulunan[id] = s.b;
            if(s && s.red && s.red.length) kdurum.red[id] = s.red;
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
  /* v102: kaynak bütünlüğü / doğrulama kapılarının REDDETTİĞİ alanlar.
     "Sessizce boş kalma" kusurunun panzehiri: hangi kitapta neyin neden
     yazılmadığı önizlemede yazılı durur. */
  function redBlokHtml(kdurum){
    const girisler = Object.entries(kdurum.red || {});
    if(!girisler.length) return '';
    const satirlar = girisler.map(([id, nedenler]) => {
      const k = (veri.kitaplar || []).find(x => x.id === id);
      if(!k) return '';
      return '<div class="zg-red-satir"><span class="zg-onizle-ad">' + esc(k.ad) + '</span>' +
        '<span class="zg-onizle-alan">' + nedenler.map(n => esc(n)).join(' · ') + '</span></div>';
    }).filter(Boolean).join('');
    if(!satirlar) return '';
    /* KENDİ sınıfı (zg-red-katla) — mevcut .zg-katla'yı yeniden kullanmak
       testlerin genel ".zg-katla summary" seçicisini gölgeliyordu (projenin
       "yeni UI = yeni önek" kuralı; g53 kırmızısıyla yakalandı). */
    return '<details class="zg-red-katla"><summary>Yazılmayan alanlar (' + girisler.length +
      ' kitap) — kaynak kaydın baskısı tutmadı</summary><div class="zg-red-liste">' +
      satirlar + '</div></details>';
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
        redBlokHtml(kdurum) +
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
      redBlokHtml(kdurum) +
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
      k.tur ? turGoster(k.tur) : ''
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
      k.tur ? turGoster(k.tur) : ''
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

  /* ========== DOSYADAN YÜKLE (dy-, v109) — TEK GİRİŞ, YEDİ VARIŞ ==========
     Ayarlar ▸ İçe aktar'da YEDİ ayrı başlık + yedi paragraf vardı (ölçüldü:
     1737px = 2,2 ekran, 2511 karakter açıklama, 8 düğme, 5 ayrı gizli dosya
     girdisi, 4 neredeyse birebir *DosyaKur kopyası) ve hepsi AYNI cümleyi
     kuruyordu: dosya seç → ne olacağını gör → onayla.

     BİRLEŞEN ŞEY GİRİŞ; BORULAR BİRLEŞMEDİ. Önizleme pencereleri
     (zgTurIceOrtu / zgAdTrOrtu / zgOzetIceOrtu / zgNotIceOrtu / kyOrtu),
     plan kurucular, kapılar ve yazım yolları AYNEN duruyor — bu modül yalnız
     hangisinin çalışacağını seçiyor. Riski ve test maliyetini bir kata
     düşüren karar bu.

     ALGILAMA + ONAY (Kaan kararı). Dosya kendini kök anahtarından söyler,
     kullanıcı doğrular. Saf algılama YETMEZDİ: `{kitaplar}` gövdesi hem
     "birleştir" (yalnız ekler) hem "tam değiştir" (dosyada olmayanı siler)
     için geçerli ve hangisinin istendiği DOSYADAN ÇIKARILAMAZ — o kullanıcı
     niyeti. Orada algılama karar VERMEZ, sorar; yıkıcı olmayan seçenek önce
     ve birincil düğme olarak durur. Saf tür seçici de yetmezdi: yanlış türü
     seçen kullanıcı bugün ancak dosyayı verdikten sonra "bu dosyada X yok"
     duyuyordu.

     KADEME (Kaan kararı: "ekler ve düzeltir" / "değiştirir ve silebilir").
     Tek giriş olunca kademe iki düğme grubu olamaz — onay KARTININ iki
     görünümüne indi: silen borular (not dosyası, tam değiştirme) ayrı zeminli
     uyarı şeridi taşır ve neyin silineceğini onaydan önce yazar. */
  const DY_TANIM = {
    tur: { ad: 'Tür listesi', anahtar: 'tur', birim: 'kayıt', siler: false,
      dugme: 'Türleri oku',
      yazar: 'kayıtların yalnız TÜR alanını (1000Kitap düzenine göre doğrulanır)',
      dokunmaz: 'puan, sayfa, durum, not — başka hiçbir alan',
      calistir: d => iceOku(ICE_TUR, d) },
    adTr: { ad: 'Türkçe ad listesi', anahtar: 'adTr', birim: 'kayıt', siler: false,
      dugme: 'Türkçe adları oku',
      yazar: 'kayıtların yalnız TÜRKÇE AD alanını',
      dokunmaz: 'kitabın adı, türü, puanı, notları — başka hiçbir alan',
      calistir: d => iceOku(ICE_ADTR, d) },
    ozet: { ad: 'Özet dosyası', anahtar: 'ozet', birim: 'kayıt', siler: false,
      dugme: 'Özetleri oku',
      yazar: 'kayıtların ÖZET ve (varsa) ONTOLOJİ alanlarını',
      dokunmaz: 'puan, notlar, durum — başka hiçbir alan',
      calistir: d => iceOku(ICE_OZET, d) },
    not: { ad: 'Not dosyası', anahtar: 'not', birim: 'satır', siler: true, geriAl: false,
      dugme: 'Notları oku',
      yazar: 'dosyada geçen kitaplara not ve alıntı',
      dokunmaz: 'elle girdiğin, paylaşımdan ve Goodreads\'ten gelen notlar',
      silme: 'dosyada geçen kitapların daha önce BU YOLDAN gelen (dosya işaretli) notları kaldırılır.',
      calistir: d => iceNotOku(d) },
    birlestir: { ad: 'JSON yedeği — birleştir', anahtar: 'kitaplar', birim: 'kitap', siler: false,
      dugme: 'Birleştir (yalnız ekler)',
      yazar: 'dosyadaki kitaplardan rafta OLMAYANLARI',
      dokunmaz: 'mevcut kayıtlar; aynı kitap (ad + yazar) iki kez eklenmez',
      calistir: d => window.__iceAktarma.json(d) },
    degistir: { ad: 'JSON yedeği — tam değiştir', anahtar: 'kitaplar', birim: 'kitap',
      siler: true, geriAl: true,
      dugme: 'Tam değiştir',
      yazar: 'dosyayı kütüphanenin YENİ HÂLİ sayar: dosyadaki kayıtlar yazılır',
      dokunmaz: 'yalnız damgası daha yeni olan özetler korunur',
      silme: 'dosyada OLMAYAN kayıt silinir.',
      calistir: d => kyOku(d) },
    goodreads: { ad: 'Goodreads CSV', anahtar: null, birim: '', siler: false,
      dugme: 'Goodreads kitaplarını al',
      yazar: 'rafları, puanları, tarihleri ve yorumlarıyla YENİ kitapları',
      dokunmaz: 'mevcut kayıtlar; rafta olan kitap atlanır',
      calistir: d => window.__iceAktarma.goodreads(d) }
  };
  const DY_JSON_SIRA = ['tur', 'adTr', 'ozet', 'not'];
  /* Kök anahtardan tanır. Dönüş: { bulunan: [{tip, sayi}], hata }.
     Birden çok anahtar taşıyan dosya birden çok seçenek üretir — uydurma
     öncelik sırası koymaktansa SORMAK doğru. */
  function dyTani(metin){
    const ham = String(metin || ''), ilk = ham.trim().charAt(0);
    /* "geçerli bir JSON değil" cümlesi yalnız JSON OLMAYA ÇALIŞAN dosyaya
       söylenir; noktalı virgüllü bir CSV'ye JSON'dan söz etmek yanıltıcı. */
    const jsonDenendi = ilk === '{' || ilk === '[';
    let g = null;
    try{ g = JSON.parse(ham); }catch(e){ g = null; }
    if(g && typeof g === 'object' && !Array.isArray(g)){
      const bulunan = [];
      /* Dizinin BOŞ olması tanımayı bozmaz — boş listeye ne diyeceğini borunun
         KENDİSİ biliyor ("boş not dizisi", "dosyada hiç kitap yok — tam
         değiştirme kütüphaneyi boşaltırdı"). Kapıda eleseydik o dürüst
         mesajların yerini genel bir "tanımadım" alırdı. */
      for(const t of DY_JSON_SIRA){
        const d = g[DY_TANIM[t].anahtar];
        if(Array.isArray(d)) bulunan.push({ tip: t, sayi: d.length });
      }
      /* {kitaplar} BELİRSİZ: yıkıcı olmayan seçenek ÖNCE (varsayılan birleştir) */
      if(Array.isArray(g.kitaplar)){
        bulunan.push({ tip: 'birlestir', sayi: g.kitaplar.length });
        bulunan.push({ tip: 'degistir', sayi: g.kitaplar.length });
      }
      return { bulunan, hata: bulunan.length ? '' : 'liste-yok' };
    }
    /* JSON değil → Goodreads CSV mi? goodreadsAktar'ın KENDİ kapısının aynısı:
       Title + Author sütunları şart. Başlık ilk satırda; satır sonu biçimine
       bağlanmamak için başın ilk 2 KB'sine bakılır. */
    const bas = ham.slice(0, 2048);
    if(bas.indexOf('Title') >= 0 && bas.indexOf('Author') >= 0)
      return { bulunan: [{ tip: 'goodreads', sayi: 0 }], hata: '' };
    return { bulunan: [], hata: jsonDenendi ? 'json-degil' : 'liste-yok' };
  }
  let dyDosya = null;         // onay anına kadar bekleyen dosya (File)
  function dyKapat(){
    dyDosya = null;
    const k = document.getElementById('dyKarar');
    if(k){ k.hidden = true; k.innerHTML = ''; }
  }
  function dyKararCiz(dosyaAdi, sonuc){
    const k = document.getElementById('dyKarar');
    if(!k) return;
    k.hidden = false;
    if(!sonuc.bulunan.length){
      /* Mesaj METNİ değişmedi: bozuk JSON aynı cümleyi duyurur (g56 kilidi). */
      bildir(sonuc.hata === 'json-degil'
        ? 'Dosya okunamadı — geçerli bir JSON değil'
        : 'Bu dosyada tanıdığım bir liste yok');
      k.innerHTML =
        '<div class="dy-tani">' + esc(dosyaAdi) + ' — <b>tanıyamadım</b>. Hiçbir şey yazılmadı.</div>' +
        '<div class="dy-ne">Beklenen biçimler: <b>{ "tur": [...] }</b> · <b>{ "adTr": [...] }</b> · ' +
        '<b>{ "ozet": [...] }</b> · <b>{ "not": [...] }</b> · <b>{ "kitaplar": [...] }</b> (uygulamanın ' +
        'JSON yedeği) · Goodreads dışa aktarımının CSV\'si (Title + Author sütunlu).</div>' +
        '<div class="ay-eylem"><button class="btn btn-cerceve" data-act="dy-vazgec">Kapat</button></div>';
      return;
    }
    const cok = sonuc.bulunan.length > 1;
    const ilk = DY_TANIM[sonuc.bulunan[0].tip];
    const sayi = sonuc.bulunan[0].sayi;
    k.innerHTML =
      '<div class="dy-tani">' + esc(dosyaAdi) + ' — ' +
        (cok
          ? '<b>' + esc(sayi) + ' kitaplık JSON yedeği</b>. İki şey yapabilirim, hangisi?'
          : '<b>' + esc(ilk.ad) + '</b> tanıdım' +
            (sayi ? ' — ' + esc(sayi) + ' ' + esc(ilk.birim) + '.' : '.')) +
      '</div>' +
      sonuc.bulunan.map(b => {
        const t = DY_TANIM[b.tip];
        return '<div class="dy-secenek' + (t.siler ? ' dy-siler' : '') + '">' +
          (cok ? '<div class="dy-ad">' + esc(t.ad) + '</div>' : '') +
          '<div class="dy-ne"><b>Yazar:</b> ' + esc(t.yazar) + '<br><b>Dokunmaz:</b> ' + esc(t.dokunmaz) + '</div>' +
          (t.siler
            ? '<div class="dy-uyari">Bu işlem SİLME içerir — ' + esc(t.silme) + ' ' +
              (t.geriAl ? 'Yazımdan hemen önce anlık kopya alınır, tek adımda geri alınabilir.'
                        : 'Geri alınamaz.') + '</div>'
            : '') +
          /* Hepsi ÇERÇEVELİ (g29/g30/g48: pencere başına TEK birincil, o da
             "JSON indir"). Zaten doğrusu bu: kart bir SORU soruyor, iki varış
             da eşit derecede geçerli. Öneri düğme dolgusuyla değil SIRAYLA
             (yıkıcı olmayan önce) ve silenin uyarı şeridiyle anlatılıyor. */
          '<button class="btn btn-cerceve" data-act="dy-calistir" data-v="'
            + b.tip + '">' + esc(t.dugme) + '</button>' +
          '</div>';
      }).join('') +
      '<div class="ay-eylem"><button class="btn btn-cerceve" data-act="dy-vazgec">Vazgeç</button></div>';
  }
  function dyDosyaKur(){
    let g = document.getElementById('dyDosya');
    if(!g){
      g = document.createElement('input');
      g.type = 'file'; g.id = 'dyDosya';
      g.accept = '.json,.csv,application/json,text/csv'; g.hidden = true;
      /* Girdi örtü ağacının DIŞINDA durur (g30 kilidi): pencere içinde kalsaydı
         üstüne ikinci pencere açılınca inert kapsayıcıya düşer, .click() yutulurdu. */
      document.body.appendChild(g);
    }
    if(!g.__zgBagli){   // dinleyici BİR kez bağlanır — her tıklamada çoğalmasın
      g.__zgBagli = true;
      g.addEventListener('change', async e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';   // aynı dosya ikinci kez seçilebilsin
        if(!f) return;
        dyDosya = f;
        let metin = '';
        try{ metin = await f.text(); }catch(err){ metin = ''; }
        dyKararCiz(f.name || 'dosya', dyTani(metin));
      });
    }
    return g;
  }
  function dyCalistir(tip){
    const t = DY_TANIM[tip], d = dyDosya;
    if(!t || !d) return;
    dyKapat();                 // kart kapanır; sıra borunun KENDİ önizlemesinde
    t.calistir(d);
  }

  /* ---------- bağlama ---------- */
  const CSS = [
    '.dy-karar{margin-top:12px;border:1px solid var(--kontur);border-radius:var(--r-md);padding:12px 13px}',
    '.dy-tani{font-size:.88rem;color:var(--paper);line-height:1.5}',
    '.dy-tani b{font-variant-numeric:tabular-nums}',
    '.dy-secenek{margin-top:12px}',
    '.dy-secenek + .dy-secenek{border-top:1px solid var(--kontur);padding-top:12px}',
    '.dy-ad{font-size:.85rem;color:var(--paper);font-weight:600;margin-bottom:4px}',
    '.dy-ne{font-size:.8rem;color:var(--muted);line-height:1.55;margin-bottom:8px}',
    '.dy-ne b{color:var(--paper);font-weight:600}',
    /* silme kademesi: AYRI ZEMİN (Kaan kararı) — sayılar onaydan önce yazılı */
    '.dy-uyari{font-size:.8rem;color:var(--drop);line-height:1.5;margin-bottom:8px;' +
      'background:color-mix(in srgb,var(--drop) 9%,transparent);border-radius:var(--r-ic);padding:8px 10px}',
    '.dy-secenek .btn{width:100%}',
    '.zg-satir{font-size:.9rem;color:var(--paper);margin:10px 0 8px;font-variant-numeric:tabular-nums}',
    '.zg-ozet{font-size:.85rem;color:var(--muted);margin:8px 0;line-height:1.5}',
    '.zg-ozet b{color:var(--paper);font-variant-numeric:tabular-nums}',
    '.zg-not{font-size:.8rem;color:var(--muted);margin-top:10px;line-height:1.5}',
    /* ky- (v100): kütüphane dosyası önizleme / hata / geri al kartı — zg-
       reçetesinin ayrı kopyası (yeni UI = yeni önek; testlerin genel
       seçicileri gölgelenmesin) */
    '.ky-ozet{font-size:.85rem;color:var(--muted);margin:8px 0;line-height:1.5}',
    '.ky-ozet b{color:var(--paper);font-variant-numeric:tabular-nums}',
    '.ky-uyari{font-size:.8rem;line-height:1.5;margin-top:10px;padding:10px 12px;border:1px solid var(--kontur);border-left:3px solid var(--brass);border-radius:var(--r-md);color:var(--paper)}',
    '.ky-hata{font-size:.85rem;line-height:1.5;margin:8px 0;padding-left:18px;color:var(--paper)}',
    '.ky-katla{margin-top:12px;border:1px solid var(--kontur);border-radius:var(--r-md)}',
    '.ky-katla summary{list-style:none;cursor:pointer;padding:10px 14px;font-size:.85rem;color:var(--muted)}',
    '.ky-katla summary::-webkit-details-marker{display:none}',
    '.ky-liste{padding:0 14px 10px;max-height:44vh;overflow-y:auto}',
    '.ky-satir{padding:9px 0;border-bottom:1px solid var(--cizgi)}',
    '.ky-ad{display:block;font-family:var(--serif);font-weight:600;font-size:.9rem}',
    '.ky-alan{display:block;font-size:.75rem;color:var(--muted);margin-top:2px}',
    '.ky-geri{margin-top:12px;padding:10px 12px;border:1px solid var(--kontur);border-radius:var(--r-md);font-size:.8rem;color:var(--muted);line-height:1.5}',
    '.ky-geri b{color:var(--paper)}',
    '.ky-geri .btn{margin-top:8px}',
    '.ky-geri[hidden]{display:none}',
    '.zg-katla{margin-top:12px;border:1px solid var(--kontur);border-radius:var(--r-md)}',
    '.zg-red-katla{margin-top:12px;border:1px solid var(--kontur);border-radius:var(--r-md)}',
    '.zg-red-katla summary{list-style:none;cursor:pointer;padding:10px 14px;font-size:.85rem;color:var(--muted)}',
    '.zg-red-katla summary::-webkit-details-marker{display:none}',
    '.zg-red-liste{padding:0 14px 10px;max-height:40vh;overflow-y:auto}',
    '.zg-red-satir{padding:9px 0;border-bottom:1px solid var(--cizgi)}',
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
        /* v109: yedi dosya girişi TEK kapıda birleşti. Boru seçimi düğmeden
           değil dosyanın kendisinden geliyor; onay kartı dy-calistir'i çizer. */
        case 'dy-sec': dyKapat(); dyDosyaKur().click(); break;
        case 'dy-calistir': dyCalistir(el.dataset.v); break;
        case 'dy-vazgec': dyKapat(); break;
        case 'zg-tur-hazir': iceHazirYukle(ICE_TUR); break;
        case 'zg-tur-uygula': iceUygula(); break;
        case 'zg-tur-vazgec': iceVazgec(); break;
        case 'zg-adtr-hazir': iceHazirYukle(ICE_ADTR); break;
        case 'zg-adtr-uygula': iceUygula(); break;
        case 'zg-adtr-vazgec': iceVazgec(); break;
        case 'zg-ozet-uygula': iceUygula(); break;   // iceUygula özet planında async dalı seçer
        case 'zg-ozet-vazgec': iceVazgec(); break;
        case 'zg-not-uygula': iceUygula(); break;   // iceUygula not planında iceNotUygula dalını seçer
        case 'zg-not-vazgec': iceVazgec(); break;
        case 'ky-uygula': kyUygula(); break;
        case 'ky-vazgec': kyVazgec(); break;
        case 'ky-geri': kyGeriBaslat(); break;
        case 'zg-oto-liste':
          ortuKur('zgOtoOrtu', 'Otomatik atanan türler');
          otoListeCiz(); ac('zgOtoOrtu');
          break;
        case 'zg-oto-geri': otoGeriAlTek(el.dataset.kid); break;
        case 'zg-oto-geri-tum': otoGeriAlTum(); break;
        case 'zg-red-liste':
          ortuKur('zgRedOrtu', 'Geri alınanlar');
          redListeCiz(); ac('zgRedOrtu');
          break;
        case 'zg-red-dene': redCikarTek(el.dataset.kid); break;
        case 'zg-red-temizle': redTemizle(); break;
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
          kyGeriKartTazele();   // v100: geri alınabilir anlık kopya varsa kartı göster
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
  window.__zengin = { eksikSayim, alanBos, turCevir, turCevirHam, kategoriTopla, kurguIsaret, baslikUyarlama, baslikUyar, kitapSorgula, uygula,
    kuyrukYukle, kuyrukKaydet, kuyrukTemizle, puanlanacaklar, tarihsizler, durumTazele,
    otoTur, otoAdaylar, atananGecerli, taksonomiKur: t => { taksonomi = t; },
    redAktif, redListesi,   // v91: geri alma defteri
    /* v102 kaynak bütünlüğü + metin temizliği. metinTemizle TEK giriş
       noktasıdır: kaynaktan gelen künye metnini yazan HER yol (zengin.js,
       barkod.js, arama→kayıt, form kaydı) bunu çağırır — mevcut bir kayıt da
       elle kaydedildiğinde aynı yoldan geçip temizlenir. */
    metinTemizle, metinCoz, varlikCoz, mojibakeOnar, bozukMetin,
    ciltGB, ciltWorker, ciltUyumsuzlugu, yayineviGecersiz, isbnGecersiz,
    isbnUlke, isbnGrup, yayineviTurkMu, beklenenDil, kunyeKatla, metinCelisir,
    ARALIK_MS, ALANLAR, KUNYE, KUYRUK_ANAHTAR, OTO_DENEME_ANAHTAR, OTO_ATANAN_ANAHTAR };
  /* v109: dosyadan yükle — algılama test kancası (hiçbiri yazmaz) */
  window.__dy = { tani: dyTani, TANIM: DY_TANIM };
  /* v100: kütüphane dosyası (tam değiştirme) test kancaları — hiçbiri yazmaz */
  window.__ky = { dogrula: kyDogrula, planKur: kyPlanKur, iz: kyIz, anlikOku: kyAnlikOku,
    ozetGirisleri: kyOzetGirisleri, DB_AD: KY_DB_AD, MAGAZA: KY_MAGAZA, ANAHTAR: KY_ANAHTAR };
})();
