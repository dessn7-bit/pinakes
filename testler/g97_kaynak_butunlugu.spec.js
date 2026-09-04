'use strict';
/* G97 — KAYNAK BÜTÜNLÜĞÜ + DİL ÖNCELİĞİ + METİN TEMİZLİĞİ (v102).

   KUSUR: zenginleştirme yalnız BOŞ alanları dolduruyor ve gelen cildin kayıttaki
   künyeyle AYNI BASKI olup olmadığını denetlemiyordu. Kyklops'ta yayınevi
   (İş Bankası) ve sayfa (72) doluydu, ISBN boştu; başlık araması Almanca
   De Gruyter cildini getirdi ve ISBN oradan yazıldı (9783110457384).

   SÖZLEŞME:
   · KÜNYE = isbn + yayinevi + yil + sayfa. TEK cilt nesnesinden okunur; cilt
     reddedilirse künyenin tamamı boş kalır. Farklı kaynaklardan alan
     BİRLEŞTİRİLMEZ.
   · İSTİSNA (Kaan kararı): tür ve kapak künye değildir — çok kaynaklı kalır.
   · md.4 ISBN varsa arama `isbn:` ile; künye başlık aramasına DÜŞMEZ.
     ISBN yoksa gelen cildin dili kaydın diliyle uyuşmalı.
   · md.5 yayınevi alanına yazar adı yazılmaz; ISBN ülke öneki yayıneviyle
     çelişirse ISBN yazılmaz — ikisi de gerekçesiyle İŞARETLENİR.
   · md.6 HTML varlık kodu ve bozuk kodlama yazımdan ÖNCE çözülür.
   · md.7 mevcut bozuk kayıtlar DÜZELTİLMEZ — yalnız boru onarılır.

   ÖLÇÜLMÜŞ VAKALAR: Kyklops (De Gruyter), Kürk Mantolu Madonna (Elips Kitap,
   978-5) ve Antonius ve Kleopatra (978-963) canlı Google Books yanıtlarından
   BİREBİR alındı. Titus/Cardenio/Ölüler Evi için yabancı baskı KURGU (Kaan
   "ABD baskısı" dedi); kapının davranışı aynı.
   (Mutasyon: ciltUyumsuzlugu'nu '' döndür → A kırmızı; isbnGecersiz'i kaldır →
    B kırmızı; metinTemizle'yi kimlik yap → F kırmızı.) */
const fs = require('fs');
const path = require('path');
const { test, expect, tohumla, sahteKitap, agTaklit, rafAc } = require('./yardim');

/* Google Books yanıtı: tek cilt */
function gb(v) {
  return { totalItems: 1, items: [{ volumeInfo: v }] };
}
function cilt(ek) {
  return Object.assign({ title: '', authors: [], publisher: '', publishedDate: '',
    pageCount: 0, language: '', industryIdentifiers: [] }, ek || {});
}
function isbn13(s) { return [{ type: 'ISBN_13', identifier: s }]; }
/* Kapak alanı DOLU sayılsın diye: boş değil ama covers.openlibrary.org da
   değil (olKapakOluMu yalnız OL kapaklarına HEAD atar) ve tarayıcı bunu
   indirmez → taklit edilmemiş dış istek doğmaz. */
const KAPAK_DOLU = 'data:,kapak';
const sorgula = (page, k) => page.evaluate(kk => window.__zengin.kitapSorgula(kk), k);

/* Kaan'ın kütüphanesindeki DOĞRULANMIŞ hâl: Türkçe baskının yayınevi + sayfası
   dolu, ISBN boş. Boruyu bu durumdan geçiriyoruz. */
const IS_BANKASI = 'Türkiye İş Bankası Kültür Yayınları';
const VAKALAR = [
  { ad: 'Kyklops', yazar: 'Euripides', yayinevi: IS_BANKASI, sayfa: 72,
    yanlis: cilt({ title: 'Kyklops', publisher: 'Walter de Gruyter GmbH & Co KG',
      publishedDate: '2020-06-08', pageCount: 350, language: 'de',
      industryIdentifiers: isbn13('9783110457384') }), olculdu: true },
  { ad: 'Kürk Mantolu Madonna', yazar: 'Sabahattin Ali', yayinevi: 'Yapı Kredi Yayınları', sayfa: 168,
    yanlis: cilt({ title: 'Kürk Mantolu Madonna', publisher: 'Elips Kitap', language: 'tr',
      industryIdentifiers: isbn13('9785048939994') }), olculdu: true },
  { ad: 'Antonius ve Kleopatra', yazar: 'William Shakespeare', yayinevi: IS_BANKASI, sayfa: 164,
    yanlis: cilt({ title: 'Antonius ve Kleopatra', pageCount: 0, language: 'hu',
      industryIdentifiers: isbn13('9789635278152') }), olculdu: true },
  { ad: 'Titus Andronicus', yazar: 'William Shakespeare', yayinevi: IS_BANKASI, sayfa: 132,
    yanlis: cilt({ title: 'Titus Andronicus', publisher: 'Simon & Schuster', pageCount: 240,
      language: 'en', industryIdentifiers: isbn13('9780743484972') }), olculdu: false },
  { ad: 'Cardenio', yazar: 'William Shakespeare', yayinevi: IS_BANKASI, sayfa: 116,
    yanlis: cilt({ title: 'Double Falsehood (Cardenio)', publisher: 'Arden Shakespeare',
      pageCount: 464, language: 'en', industryIdentifiers: isbn13('9781903436776') }), olculdu: false },
  { ad: 'Ölüler Evinden Anılar', yazar: 'Fyodor Dostoyevski', yayinevi: IS_BANKASI, sayfa: 376,
    yanlis: cilt({ title: 'The House of the Dead', publisher: 'Penguin Classics', pageCount: 384,
      language: 'en', industryIdentifiers: isbn13('9780140444568') }), olculdu: false }
];

test.describe('G97 kaynak bütünlüğü (v102)', () => {

  test('A) Kaan\'ın 6 kitabı: yanlış ISBN YAZILMAZ, alan boş kalır, gerekçe işaretlenir', async ({ page }) => {
    await agTaklit(page, {});
    await tohumla(page, VAKALAR.map((v, i) => sahteKitap({
      id: 'v' + i, ad: v.ad, yazar: v.yazar, yayinevi: v.yayinevi, sayfa: v.sayfa,
      isbn: '', tur: 'Roman', yil: 2020 })));
    await rafAc(page);
    const rapor = [];
    for (let i = 0; i < VAKALAR.length; i++) {
      const v = VAKALAR[i];
      page.__agAyar.google = gb(v.yanlis);         // her iki sorgu da bu yanlış cildi döndürür
      const s = await sorgula(page, { id: 'v' + i, ad: v.ad, yazar: v.yazar,
        yayinevi: v.yayinevi, sayfa: v.sayfa, isbn: '', tur: 'Roman', kapak: KAPAK_DOLU, yil: 2020 });
      const yazilanIsbn = s && s.b ? s.b.isbn : undefined;
      rapor.push(v.ad + ' → ISBN ' + (yazilanIsbn === undefined ? 'YAZILMADI' : yazilanIsbn) +
        ' | gerekçe: ' + ((s && s.red) || []).join('; '));
      expect(yazilanIsbn, v.ad + ': yanlış ISBN yazılmamalı').toBeUndefined();
      expect((s && s.red) || [], v.ad + ': gerekçe işaretlenmeli').not.toHaveLength(0);
    }
    console.log('\n' + rapor.join('\n'));
  });

  test('B) yayınevi ve sayfa da yazılmaz: künye TEK cilttan, cilt reddedilince tamamı boş', async ({ page }) => {
    await agTaklit(page, { google: gb(VAKALAR[0].yanlis) });
    await tohumla(page, [sahteKitap({ id: 'b1', ad: 'Kyklops', yazar: 'Euripides' })]);
    await rafAc(page);
    /* Kayıtta yayınevi/sayfa BOŞ ama dil 'tr' — Almanca cilt dil kapısından döner
       ve künyenin HİÇBİR alanı yazılmaz (birleştirme olsaydı sayfa/yıl geçerdi). */
    const s = await sorgula(page, { id: 'b1', ad: 'Kyklops', yazar: 'Euripides',
      yayinevi: '', sayfa: 0, yil: null, isbn: '', dil: 'tr', tur: 'Roman', kapak: KAPAK_DOLU });
    for (const alan of ['isbn', 'yayinevi', 'sayfa', 'yil'])
      expect(s.b ? s.b[alan] : undefined, alan + ' yazılmamalı').toBeUndefined();
    expect(s.red.join(' ')).toContain('dil uymuyor');
  });

  test('C) md.4 ISBN önceliği: kayıtta ISBN varsa künye `isbn:` sorgusundan gelir, başlığa DÜŞMEZ', async ({ page }) => {
    await agTaklit(page, {});
    await tohumla(page, [sahteKitap({ id: 'c1', ad: 'Kyklops', yazar: 'Euripides' })]);
    await rafAc(page);
    /* isbn: sorgusu DOĞRU baskıyı, başlık sorgusu YANLIŞ baskıyı döndürsün;
       künye doğrudan gelmeli. agTaklit tek yanıt verdiği için URL'e bakarak
       ayrıştıran kendi yönlendiricimizi kuruyoruz. */
    await page.route(/googleapis\.com\/books/, r => {
      const u = decodeURIComponent(r.request().url());
      const dogru = cilt({ title: 'Kyklops', publisher: 'Türkiye İş Bankası Kültür Yayınları',
        publishedDate: '2020', pageCount: 72, language: 'tr',
        industryIdentifiers: isbn13('9786257070164') });
      const govde = u.includes('q=isbn:') ? gb(dogru) : gb(VAKALAR[0].yanlis);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(govde) });
    });
    const s = await sorgula(page, { id: 'c1', ad: 'Kyklops', yazar: 'Euripides',
      isbn: '9786257070164', yayinevi: '', sayfa: 0, yil: null, tur: 'Roman', kapak: KAPAK_DOLU });
    expect(s.b.yayinevi).toBe('Türkiye İş Bankası Kültür Yayınları');
    expect(s.b.sayfa).toBe(72);
    expect(s.b.yil).toBe(2020);
    expect(s.b.__kaynak).toBe('Google Books');
  });

  test('D) md.5 yayınevi alanına yazar adı gelirse yazılmaz ve işaretlenir', async ({ page }) => {
    await agTaklit(page, { google: gb(cilt({ title: 'Mrs Dalloway', authors: ['Virginia Woolf'],
      publisher: 'Virginia Woolf', pageCount: 0, language: 'en' })) });
    await tohumla(page, [sahteKitap({ id: 'd1', ad: 'Mrs Dalloway', yazar: 'Virginia Woolf' })]);
    await rafAc(page);
    const s = await sorgula(page, { id: 'd1', ad: 'Mrs Dalloway', yazar: 'Virginia Woolf',
      yayinevi: '', sayfa: 0, yil: null, isbn: '', tur: 'Roman', kapak: KAPAK_DOLU });
    expect(s.b ? s.b.yayinevi : undefined).toBeUndefined();
    expect(s.red.join(' ')).toContain('yazar adı');
  });

  test('E) md.5 ISBN ülke öneki ↔ yayınevi çelişkisi: ISBN yazılmaz, yayınevi yazılır', async ({ page }) => {
    /* Aynı cilt: yayınevi Türk ama ISBN 978-963 (Macaristan). Kaynak bütünlüğü
       sağlam (tek cilt) ama cildin KENDİSİ tutarsız — ISBN reddedilir. */
    await agTaklit(page, { google: gb(cilt({ title: 'Antonius ve Kleopatra',
      publisher: 'Türkiye İş Bankası Kültür Yayınları', language: 'tr', pageCount: 164,
      industryIdentifiers: isbn13('9789635278152') })) });
    await tohumla(page, [sahteKitap({ id: 'e1', ad: 'Antonius ve Kleopatra', yazar: 'William Shakespeare' })]);
    await rafAc(page);
    const s = await sorgula(page, { id: 'e1', ad: 'Antonius ve Kleopatra', yazar: 'William Shakespeare',
      yayinevi: '', sayfa: 0, yil: null, isbn: '', tur: 'Roman', kapak: KAPAK_DOLU });
    expect(s.b.isbn).toBeUndefined();
    expect(s.b.yayinevi).toBe('Türkiye İş Bankası Kültür Yayınları');
    expect(s.red.join(' ')).toContain('ülke öneki');
  });

  test('F) md.6 metin temizliği: varlık kodu çözülür, onarılamaz bozuk yazılmaz', async ({ page }) => {
    await agTaklit(page, { google: gb(cilt({ title: 'Kral John', publisher: 'Türkiye İş Bankası K&#252;lt&#252;r Yayınları',
      language: 'tr', pageCount: 120 })) });
    await tohumla(page, [sahteKitap({ id: 'f1', ad: 'Kral John', yazar: 'William Shakespeare' })]);
    await rafAc(page);
    const s = await sorgula(page, { id: 'f1', ad: 'Kral John', yazar: 'William Shakespeare',
      yayinevi: '', sayfa: 0, yil: null, isbn: '', tur: 'Roman', kapak: KAPAK_DOLU });
    expect(s.b.yayinevi).toBe('Türkiye İş Bankası Kültür Yayınları');
    // saf işlev sözleşmesi
    const t = await page.evaluate(() => ({
      varlik: window.__zengin.metinTemizle('A&#039;dan Z&#039;ye Astronomi'),
      bozuk: window.__zengin.metinTemizle('?? Bankas? Kültür Yay?nlar'),
      kullanici: window.__zengin.metinCoz('?? Bankas? Kültür Yay?nlar'),
      soru: window.__zengin.metinTemizle('Ne Yapmalı?')
    }));
    expect(t.varlik).toBe("A'dan Z'ye Astronomi");
    expect(t.bozuk).toBe('');                                   // KAYNAK verisi: yazılmaz
    expect(t.kullanici).toBe('?? Bankas? Kültür Yay?nlar');      // KULLANICI girdisi: silinmez
    expect(t.soru).toBe('Ne Yapmalı?');
  });

  test('G) istisna korunur: tür ve kapak künye değil, çok kaynaklı kalır', async ({ page }) => {
    await agTaklit(page, {});
    await tohumla(page, [sahteKitap({ id: 'g1', ad: 'Kyklops', yazar: 'Euripides' })]);
    await rafAc(page);
    await page.evaluate(() => window.__zengin.taksonomiKur([{ seo: 'Tiyatro', ad: 'Tiyatro' }]));
    await page.route(/googleapis\.com\/books/, r => {
      const u = decodeURIComponent(r.request().url());
      const kapakCilt = cilt({ title: 'Kyklops', language: 'tr',
        imageLinks: { thumbnail: 'https://books.google.com/books/content?id=ISBNKAPAK' } });
      const baslikCilt = Object.assign({}, VAKALAR[0].yanlis, { categories: ['Drama'] });
      const govde = u.includes('q=isbn:') ? gb(kapakCilt) : gb(baslikCilt);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(govde) });
    });
    const s = await sorgula(page, { id: 'g1', ad: 'Kyklops', yazar: 'Euripides',
      isbn: '9786257070164', yayinevi: 'Türkiye İş Bankası Kültür Yayınları', sayfa: 72,
      yil: 2020, tur: '', kapak: '' });
    // kapak isbn: cildinden, tür başlık cildinin kategorisinden — künye ise
    // isbn: cildinden; alanlar KARIŞMIYOR ama tür/kapak muaf
    expect(s.b.kapak).toContain('id=ISBNKAPAK');
    expect(s.b.tur).toBe('Tiyatro');
  });

  test('H) barkod.js: kaynaklar BİRLEŞTİRİLMEZ, biri seçilir', async ({ page }) => {
    await agTaklit(page, {});
    await tohumla(page, [sahteKitap({ ad: 'X' })]);
    await rafAc(page);
    /* Google yayınevsiz bir kayıt, Open Library ise yayınevi dolu bir kayıt
       döndürsün. v102 öncesi OL'nin yayınevi Google kaydına EKLENİRDİ. */
    await page.route(/googleapis\.com\/books/, r => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify(gb(cilt({
        title: 'Tek Kaynak', authors: ['Yazar'], pageCount: 0, publisher: '' }))) }));
    await page.route(/openlibrary\.org\/api\/books/, r => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ 'ISBN:9786257070164': {
        title: 'Tek Kaynak', publishers: [{ name: 'BAŞKA YAYINEVİ' }], number_of_pages: 999 } }) }));
    const s = await page.evaluate(() => window.__barkod.isbnAra('9786257070164'));
    expect(s.sonuc.ad).toBe('Tek Kaynak');
    expect(s.sonuc.yayinevi, 'OL yayınevi Google kaydına EKLENMEMELİ').toBeFalsy();
    expect(s.sonuc.sayfa, 'OL sayfası Google kaydına EKLENMEMELİ').toBeFalsy();
    expect(s.sonuc.kaynak).toBe('Google Books');
  });

  test('I) kaynak sözleşmesi: sw ≥ v102, künye tek cilttan okunuyor', async ({ page }) => {
    const kok = path.join(__dirname, '..');
    const sw = fs.readFileSync(path.join(kok, 'sw.js'), 'utf8');
    const m = sw.match(/const CACHE = ONEK \+ '-v(\d+)';/);
    expect(m, 'sw CACHE sürüm satırı').toBeTruthy();
    expect(parseInt(m[1])).toBeGreaterThanOrEqual(102);
    const z = fs.readFileSync(path.join(kok, 'zengin.js'), 'utf8');
    expect(z).toContain("const KUNYE = ['isbn', 'yayinevi', 'yil', 'sayfa'];");
    // barkod.js'te alan-alan geri doldurma deseni KALMAMALI
    const b = fs.readFileSync(path.join(kok, 'barkod.js'), 'utf8');
    expect(b).not.toMatch(/if\(!sonuc\[k\] && ol\[k\]\) sonuc\[k\] = ol\[k\]/);
    expect(b).toContain('sonuc = gbSonuc || wkSonuc || olSonuc || null;');
  });
});
