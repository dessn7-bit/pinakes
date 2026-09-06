'use strict';
/* G93 — ISBN → 1000Kitap YEDEĞİ (v97, worker /isbn).
   Kök: Google Books Türkçe baskıların ISBN'ini tanımıyor (ölçüm: Euripides "Ion",
   Mitos Boyut, 9786059306942 → sonuç yok), Open Library seyrek/yarım. ~150 fiziksel
   Türkçe kitabı seri taramayla eklemek imkânsızdı ("ISBN bulunamadı").
   ÖLÇÜM (kenar): 1000Kitap SSR araması ISBN13'ü tanır ve BASKININ id'sini verir
   (ISBN-10 ile 0 sonuç); kitapCek API'si baskı künyesini (yayınevi/sayfa/yıl/
   çevirmen/dil) ISBN eşleşmesiyle verir, 6/6. Kitapyurdu site araması ISBN'i
   bulmuyor → kaynak değil.
   ZİNCİR (barkod.js isbnAra): Google (dokunulmadı) → OL → Google BOŞSA worker
   /isbn. Google'ın sonucu ASLA ezilmez; worker kapalıysa eski davranış sürer.
   Aynı yedek zenginleştirme taramasına (zengin.js kitapSorgula) bağlı. */
const { test, expect, tohumla, sahteKitap,
  kameraTaklit, kameraYok, rafAc, ayarlarAc } = require('./yardim');
const { test: temel } = require('@playwright/test');   // worker birim vakaları (g20 deseni, sayfa yok)
const fs = require('fs');
const path = require('path');

const ISBN_ION = '9786059306942';   // gerçek: Euripides, İon, Mitos-Boyut (ölçüm kaydı)
const ISBN_ION_10 = '6059306942';
const ISBN_GB = '9780132350884';    // Google Books'ta kesin var (Clean Code)
const ISBN_YOK = '9799999999990';   // sağlaması geçerli, kenarda 0 aday (ölçüldü)

/* Canlı kenar ölçümünden alınan gerçek künye — taklit yanıt bu şekli taşır. */
const ION = { ad: 'İon', yazar: 'Euripides', yayinevi: 'Mitos-Boyut Yayınları', yil: 2018, sayfa: 80,
  kapak: 'https://1k-cdn.com/resimler/kitaplar/338065_6576f_1568096134.jpg', isbn: ISBN_ION,
  kaynak: '1000Kitap', cevirmen: 'Ege Kandemirli', dil: 'tr' };
const ISBN_YANIT = { sonuclar: [ION], kaynaklar: { binkitap: 1, isbnEslesme: 1 } };

function gbIsbnYanit(kitap) {
  return { totalItems: 1, items: [{ volumeInfo: {
    title: kitap.ad, authors: kitap.yazar ? [kitap.yazar] : [],
    publisher: kitap.yayinevi || '', publishedDate: kitap.yil ? String(kitap.yil) : '',
    pageCount: kitap.sayfa || 0, imageLinks: null } }] };
}
async function barkodAc(page) {
  await page.click('.fab[data-act="yeni"]');
  await page.click('[data-act="barkod-ac"]');
}
async function elleOkut(page, isbn) {
  await page.fill('#barkodElle', isbn);
  await page.click('[data-act="barkod-elle"]');
}
async function seriAc(page) {
  await ayarlarAc(page);
  await page.click('#ortuAyar [data-act="seri-ac"]');
  await expect(page.locator('#seriOrtu')).toHaveClass(/acik/);
  await expect.poll(() => page.evaluate(() => window.__akisIstendi)).toBe(true);
}
function hataTopla(page) {
  const hatalar = [];
  page.on('pageerror', e => hatalar.push(String(e)));
  return hatalar;
}

test.describe('G93 barkod: Google boşsa 1000Kitap yedeği', () => {

  test('a) Türkçe baskı: Google boş → 1000Kitap künyesi forma dolar; bildirim kaynağı söyler', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    page.__agAyar.isbn = ISBN_YANIT;           // Google varsayılan BOŞ (totalItems 0), OL boş
    await barkodAc(page);
    await elleOkut(page, ISBN_ION);
    await expect(page.locator('#f-ad')).toHaveValue('İon');
    await expect(page.locator('#f-yazar')).toHaveValue('Euripides');
    await expect(page.locator('#f-yayinevi')).toHaveValue('Mitos-Boyut Yayınları');
    await expect(page.locator('#f-sayfa')).toHaveValue('80');
    await expect(page.locator('#f-yil')).toHaveValue('2018');
    await expect(page.locator('#f-isbn')).toHaveValue(ISBN_ION);
    await expect(page.locator('#f-cevirmen')).toHaveValue('Ege Kandemirli');   // rol etiketli, uydurma değil
    await expect(page.locator('#toast')).toContainText("1000Kitap'tan okundu: İon");
    expect(page.__agSayac.google).toBeGreaterThanOrEqual(1);   // Google ÖNCE soruldu
    expect(page.__agSayac.isbn).toBe(1);                       // boş dönünce yedek
    expect(page.__agSayac.sonIsbnUrl).toContain('/isbn?q=' + ISBN_ION);
    await expect(page.locator('#barkodOrtu')).not.toHaveClass(/acik/);   // panel kapandı (eski akış)
  });

  test('seri tarama: Google boş → 1000Kitap künyesiyle EKLENİR (isbn/yayınevi/sayfa/yıl/çevirmen/dil/kapak)', async ({ page }) => {
    await kameraTaklit(page);
    await rafAc(page);
    page.__agAyar.isbn = ISBN_YANIT;
    await seriAc(page);
    await page.fill('#seriElle', ISBN_ION);
    await page.click('[data-act="seri-elle"]');
    await expect(page.locator('#seriNot')).toContainText('Eklendi: İon', { timeout: 10000 });
    const k = await page.evaluate(() => veri.kitaplar[0]);
    expect(k.isbn).toBe(ISBN_ION);
    expect(k.yazar).toBe('Euripides');
    expect(k.yayinevi).toBe('Mitos-Boyut Yayınları');
    expect(k.sayfa).toBe(80);
    expect(k.yil).toBe(2018);
    expect(k.cevirmen).toBe('Ege Kandemirli');
    expect(k.dil).toBe('tr');
    expect(k.kapak).toContain('1k-cdn.com');
    expect(k.tur).toBe('');                                     // tür bu yoldan yazılmaz
    expect(page.__agSayac.isbn).toBe(1);
    // yenilemede alanlar kalıcı (kitapNormalize cevirmen/dil taşır)
    await page.reload();
    const k2 = await page.evaluate(() => veri.kitaplar[0]);
    expect(k2.cevirmen).toBe('Ege Kandemirli');
    expect(k2.yayinevi).toBe('Mitos-Boyut Yayınları');
  });

  test('b) Google Books bulunca sonuç ESKİSİ gibi Google\'dan; worker /isbn HİÇ çağrılmaz (tuzaklı)', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    page.__agAyar.google = gbIsbnYanit({ ad: 'Clean Code', yazar: 'Robert C. Martin',
      yayinevi: 'Prentice Hall', yil: 2008, sayfa: 464 });
    page.__agAyar.isbn = ISBN_YANIT;           // TUZAK: worker sorulsaydı "İon" gelirdi
    await barkodAc(page);
    await elleOkut(page, ISBN_GB);
    await expect(page.locator('#f-ad')).toHaveValue('Clean Code');
    await expect(page.locator('#f-yayinevi')).toHaveValue('Prentice Hall');
    await expect(page.locator('#f-sayfa')).toHaveValue('464');
    await expect(page.locator('#toast')).toContainText("Google Books'tan okundu: Clean Code");
    expect(page.__agSayac.isbn).toBe(0);       // worker'a gidilmedi — kanıt sayaç
    expect(page.__agSayac.google).toBeGreaterThanOrEqual(1);
  });

  test('c) uydurma ISBN: "ISBN bulunamadı" mesajı değişmedi, hata fırlamadı', async ({ page }) => {
    await kameraYok(page);
    const hatalar = hataTopla(page);
    await rafAc(page);
    // Google boş + OL boş + worker /isbn boş (varsayılan { sonuclar: [] })
    await barkodAc(page);
    await elleOkut(page, ISBN_YOK);
    await expect(page.locator('#olDurum')).toContainText('Bu ISBN kayıtlarda yok');
    await expect(page.locator('#toast')).toContainText('ISBN bulunamadı');
    await expect(page.locator('#f-ad')).toHaveValue('');
    expect(page.__agSayac.isbn).toBe(1);       // yedek DENENDİ, boş döndü
    expect(hatalar).toEqual([]);
  });

  test('d) worker KAPALI: Google bulunca eskisi gibi çalışır; Google boşsa dürüst "bulunamadı", hata yok', async ({ page }) => {
    await kameraYok(page);
    const hatalar = hataTopla(page);
    await rafAc(page);
    page.__agAyar.isbn = 'hata';               // worker ulaşılamaz (abort)
    page.__agAyar.google = gbIsbnYanit({ ad: 'Clean Code', yazar: 'Robert C. Martin', sayfa: 464 });
    await barkodAc(page);
    await elleOkut(page, ISBN_GB);
    await expect(page.locator('#f-ad')).toHaveValue('Clean Code');
    await expect(page.locator('#toast')).toContainText("Google Books'tan okundu");
    expect(page.__agSayac.isbn).toBe(0);
    // Google boş + worker kapalı: "bulunamadı" (ağ arızası DEĞİL — Google/OL yanıt verdi)
    page.__agAyar.google = null;
    await page.click('[data-act="barkod-ac"]');
    await elleOkut(page, ISBN_ION);
    await expect(page.locator('#olDurum')).toContainText('Bu ISBN kayıtlarda yok');
    await expect(page.locator('#toast')).toContainText('ISBN bulunamadı');
    expect(page.__agSayac.isbn).toBe(1);
    expect(hatalar).toEqual([]);
  });

  test('ağ teşhisi: ÜÇ kaynak da düşerse "İnternete ulaşılamadı" (worker sessizliği teşhisi bozmaz)', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    page.__agAyar.google = 'hata';
    page.__agAyar.olKitap = 'hata';
    page.__agAyar.isbn = 'hata';
    await barkodAc(page);
    await elleOkut(page, ISBN_ION);
    await expect(page.locator('#olDurum')).toContainText('İnternete ulaşılamadı');
    // Google/OL düşük ama worker AYAKTA ve buluyor → sonuç gelir (arıza raporu yok)
    page.__agAyar.isbn = ISBN_YANIT;
    await elleOkut(page, ISBN_ION);
    await expect(page.locator('#f-ad')).toHaveValue('İon');
    await expect(page.locator('#toast')).toContainText("1000Kitap'tan okundu: İon");
  });

  /* v102: "OL boşlukları doldurur" kısmı KALKTI (kaynak bütünlüğü). 1000Kitap
     künyesinin ÖNE alınması — yani kaynak önceliği — aynen sınanıyor. */
  test('Open Library yarım kayıt: 1000Kitap künyesi SEÇİLİR, OL ile BİRLEŞTİRİLMEZ', async ({ page }) => {
    await kameraYok(page);
    await rafAc(page);
    page.__agAyar.olKitap = { ['ISBN:' + ISBN_ION]: { title: 'Ion [TURKISH EDITION]', publish_date: '2019' } };
    page.__agAyar.isbn = { sonuclar: [Object.assign({}, ION, { yil: null })] };   // künyede yıl yok
    await barkodAc(page);
    await elleOkut(page, ISBN_ION);
    await expect(page.locator('#f-ad')).toHaveValue('İon');                       // künye önde
    await expect(page.locator('#f-yayinevi')).toHaveValue('Mitos-Boyut Yayınları');
    await expect(page.locator('#f-yil')).toHaveValue('');   // v102: OL'nin yılı künyeye EKLENMEZ
    await expect(page.locator('#toast')).toContainText("1000Kitap'tan okundu: İon");
  });
});

test.describe('G93 zenginleştirme: Google boşsa ISBN\'li kayıt 1000Kitap\'tan dolar', () => {
  const TURLER = [
    { seo: 'Roman', ad: 'Roman', kitapSayisi: 25393 },
    { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1000 }];

  test('eksik sayfa/yayınevi/yıl/kapak künyeden dolar; tür ve DOLU alan korunur; önizleme kapısı aynen', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'İon', yazar: 'Euripides', isbn: ISBN_ION, sayfa: null, yayinevi: '', yil: null, tur: '', kapak: null }),
      sahteKitap({ ad: 'Dolu Sayfa', yazar: 'Euripides', isbn: ISBN_ION, sayfa: 999, yayinevi: '', yil: null, tur: '', kapak: null })]);
    await rafAc(page);
    await ayarlarAc(page);
    page.__agAyar.turler = TURLER;
    page.__agAyar.isbn = ISBN_YANIT;           // Google varsayılan BOŞ
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTaramaGovde')).toContainText('Bulunanları uygula', { timeout: 20000 });
    // önizlemeden ÖNCE yazılmadı
    let k = await page.evaluate(() => veri.kitaplar.find(x => x.ad === 'İon'));
    expect(k.sayfa).toBeNull();
    await page.click('#zgTaramaGovde [data-act="zg-uygula"]');
    k = await page.evaluate(() => veri.kitaplar.find(x => x.ad === 'İon'));
    expect(k.sayfa).toBe(80);
    expect(k.yayinevi).toBe('Mitos-Boyut Yayınları');
    expect(k.yil).toBe(2018);
    expect(k.kapak).toContain('1k-cdn.com');
    expect(k.tur).toBe('');                                     // tür bu yoldan YAZILMAZ
    const d = await page.evaluate(() => veri.kitaplar.find(x => x.ad === 'Dolu Sayfa'));
    expect(d.sayfa).toBe(999);                                  // dolu alan korundu
    expect(d.yayinevi).toBe('Mitos-Boyut Yayınları');          // boşu doldu
    expect(page.__agSayac.isbn).toBe(2);                        // ISBN'li kitap başına 1
  });

  test('worker kapalıyken zenginleştirme eski davranışta: yazılmaz, çökmez, "kaynağa ulaşılamıyor" DEMEZ', async ({ page }) => {
    const hatalar = hataTopla(page);
    await tohumla(page, [sahteKitap({ ad: 'İon', yazar: 'Euripides', isbn: ISBN_ION, sayfa: null, yayinevi: '', yil: null, tur: '' })]);
    await rafAc(page);
    await ayarlarAc(page);
    page.__agAyar.turler = TURLER;
    page.__agAyar.isbn = 'hata';
    await page.click('#ortuAyar [data-act="zg-tara"]');
    await expect(page.locator('#zgTaramaGovde')).not.toContainText('Hesaplanıyor', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('#toast')).not.toContainText('Kaynağa ulaşılamıyor');   // worker arızası Google sayacına girmez
    const k = await page.evaluate(() => veri.kitaplar[0]);
    expect(k.sayfa).toBeNull();
    expect(hatalar).toEqual([]);
  });

  test('ayar metni tek kaynak demiyor', async ({ page }) => {
    await rafAc(page);
    await ayarlarAc(page);
    await expect(page.locator('#ayBolumZengin')).toContainText('1000Kitap');
    await expect(page.locator('#ayBolumZengin')).toContainText('Google Books');
  });
});

/* ================= worker /isbn (node, g20 deseni) ================= */
const KOK = path.join(__dirname, '..');
function sahteYanit(govde, ok) {
  return { ok: ok !== false, status: ok === false ? 500 : 200,
    json: async () => govde, text: async () => (typeof govde === 'string' ? govde : JSON.stringify(govde)) };
}
/* Şekiller CANLI kaynaktan ölçüldü (2026-09-03): SSR liste öğesi id taşır;
   kitapCek → liste[kitapHakkinda].hakkinda.baskiBilgileri + digerBaskilar,
   kitap.yazarlar rol etiketli. */
const BK_ARA_HTML = id => '<script id="__NEXT_DATA__" type="application/json">'
  + JSON.stringify({ props: { liste: [{ id, adi: 'İon', yazarAdi: 'Euripides', ilkYazar: 'Euripides',
      resim: ION.kapak, puan: 8.1 }] } }) + '</script>';
const KITAPCEK = isbn => ({
  kitap: { id: '179312', adi: 'İon', ilkYazar: 'Euripides', yazarAdi: 'Euripides, Ege Kandemirli (Çevirmen)',
    resim: ION.kapak, isbn,
    yazarlar: [{ adi: 'Euripides', kitapYazarTurBaslik: 'Yazar' },
      { adi: 'Ege Kandemirli', kitapYazarTurBaslik: 'Çevirmen' }] },
  liste: [
    { renderTuru: 'reklam' },
    { renderTuru: 'kitapHakkinda', hakkinda: {
      baskiBilgileri: { adi: 'İon', altBaslik: 'Eski Yunan Tragedyaları 20', yayinevi: 'Mitos-Boyut Yayınları',
        isbn, sayfaSayisi: '80', baskiYili: '2018', dil: { kod: 'tr', baslik: 'Türkçe' } },
      digerBaskilar: [{ id: '179312', baskiBilgileriArray: { adi: 'İon', isbn, yayinevi: 'Mitos-Boyut Yayınları',
        sayfaSayisi: '80', baskiYili: '2018' } }] } }] });

async function workerKos(url, ayar) {
  const a = ayar || {};
  const cacheKayit = [];
  const istekKayit = [];
  global.caches = { default: {
    match: async () => undefined,
    put: async (istek, yanit) => { cacheKayit.push({ url: istek.url, yanit }); }
  } };
  global.fetch = async (u, secenek) => {
    istekKayit.push({ url: String(u), baslik: (secenek && secenek.headers) || {} });
    if (String(u).includes('api.1000kitap.com')) {
      if (a.apiHata) throw new Error('ag');
      return sahteYanit(a.kitapCek || KITAPCEK(ISBN_ION));
    }
    if (String(u).includes('1000kitap.com/ara')) {
      if (a.bkHata) throw new Error('ag');
      return sahteYanit(a.bkBos ? '<html>bos</html>' : BK_ARA_HTML('179312'));
    }
    throw new Error('beklenmeyen adres: ' + u);
  };
  const mod = await import('file://' + path.join(KOK, 'worker', 'worker.js').replace(/\\/g, '/'));
  const bekleyenler = [];
  const yanit = await mod.default.fetch(new Request(url), {}, { waitUntil: p => bekleyenler.push(p) });
  await Promise.all(bekleyenler);
  return { yanit, govde: await yanit.json(), cacheKayit, istekKayit, mod };
}

temel.describe('G93 worker /isbn', () => {

  temel('ISBN13: SSR arama → kitapCek → künye; /ara alan seti + isbn/cevirmen/dil; 24 saat cache', async () => {
    const { govde, cacheKayit, istekKayit, yanit } = await workerKos('https://x.dev/isbn?q=' + ISBN_ION);
    expect(govde.sonuclar).toEqual([ION]);
    expect(govde.kaynaklar).toEqual({ binkitap: 1, isbnEslesme: 1 });
    expect(istekKayit[0].url).toContain('1000kitap.com/ara?q=' + ISBN_ION + '&bolum=kitaplar');
    expect(istekKayit[1].url).toContain('kitapCek?id=179312');
    expect(istekKayit[1].baslik['Accept-Language']).toContain('tr');
    expect(yanit.headers.get('Cache-Control')).toContain('max-age=86400');
    expect(cacheKayit.length).toBe(1);
    expect(cacheKayit[0].url).toContain('/isbn?q=' + ISBN_ION);
    expect(yanit.headers.get('Access-Control-Allow-Origin')).toBe('https://dessn7-bit.github.io');
  });

  temel('ISBN-10 girişi 13 haneye çevrilip aranır (kaynak 10 haneyle 0 sonuç veriyor — ölçüldü)', async () => {
    const { govde, istekKayit, cacheKayit } = await workerKos('https://x.dev/isbn?q=' + ISBN_ION_10);
    expect(istekKayit[0].url).toContain('ara?q=' + ISBN_ION + '&');
    expect(govde.sonuclar[0].isbn).toBe(ISBN_ION);
    expect(cacheKayit[0].url).toContain('/isbn?q=' + ISBN_ION);   // kanonik kova
  });

  temel('aday yok → boş dizi, no-store, cache YOK, fırlatma yok', async () => {
    const { govde, cacheKayit, yanit } = await workerKos('https://x.dev/isbn?q=' + ISBN_YOK, { bkBos: true });
    expect(govde).toEqual({ sonuclar: [], kaynaklar: { binkitap: 0, isbnEslesme: 0 } });
    expect(cacheKayit.length).toBe(0);
    expect(yanit.headers.get('Cache-Control')).toContain('no-store');
  });

  temel('künye ISBN\'i aranandan FARKLI → yazılmaz (yanlış kitap rafa girmez), no-store', async () => {
    const { govde, cacheKayit, yanit } = await workerKos('https://x.dev/isbn?q=' + ISBN_ION,
      { kitapCek: KITAPCEK('9789750718533') });
    expect(govde.sonuclar).toEqual([]);
    expect(govde.kaynaklar).toEqual({ binkitap: 1, isbnEslesme: 0 });
    expect(cacheKayit.length).toBe(0);
    expect(yanit.headers.get('Cache-Control')).toContain('no-store');
  });

  temel('kaynak çökerse (SSR ya da API) 200 + boş dizi — asla 5xx/fırlatma', async () => {
    const a = await workerKos('https://x.dev/isbn?q=' + ISBN_ION, { bkHata: true });
    expect(a.yanit.status).toBe(200);
    expect(a.govde.sonuclar).toEqual([]);
    const b = await workerKos('https://x.dev/isbn?q=' + ISBN_ION, { apiHata: true });
    expect(b.yanit.status).toBe(200);
    expect(b.govde.sonuclar).toEqual([]);
    expect(b.govde.kaynaklar).toEqual({ binkitap: 1, isbnEslesme: 0 });
  });

  temel('sağlaması bozuk ISBN kaynağa HİÇ gitmez', async () => {
    const { govde, istekKayit } = await workerKos('https://x.dev/isbn?q=9786059306943');
    expect(govde.sonuclar).toEqual([]);
    expect(istekKayit.length).toBe(0);
  });

  temel('isbn13e / isbnDonustur sözleşmesi', async () => {
    const { mod } = await workerKos('https://x.dev/isbn?q=' + ISBN_ION);
    expect(mod.isbn13e('978-605-9306-94-2')).toBe(ISBN_ION);
    expect(mod.isbn13e(ISBN_ION_10)).toBe(ISBN_ION);
    expect(mod.isbn13e('0132350882')).toBe(ISBN_GB);
    expect(mod.isbn13e('9786059306943')).toBe('');
    expect(mod.isbn13e('0132350881')).toBe('');
    expect(mod.isbn13e('12345')).toBe('');
    // diğer baskıdan eşleşme: ana baskı farklı, digerBaskilar'da aranan ISBN
    const j = KITAPCEK('9789750718533');
    j.liste[1].hakkinda.digerBaskilar = [{ id: '259963', baskiBilgileriArray: { adi: '1984', isbn: '9786254052286',
      yayinevi: 'Türkiye İş Bankası Kültür Yayınları', sayfaSayisi: '352', baskiYili: '2021' } }];
    const d = mod.isbnDonustur(j, '9786254052286');
    expect(d.yayinevi).toBe('Türkiye İş Bankası Kültür Yayınları');
    expect(d.sayfa).toBe(352);
    expect(d.yil).toBe(2021);
    expect(d.yazar).toBe('Euripides');               // yazar rolü kitap düzeyinden
    expect(d.cevirmen).toBe('Ege Kandemirli');
    expect(d.dil).toBe('');                            // bu baskıda dil yok → uydurulmaz
    expect(mod.isbnDonustur(j, ISBN_ION)).toBeNull(); // hiçbir baskı eşleşmiyor
  });
});

temel.describe('G93 kaynak kilitleri', () => {
  temel('barkod.js: worker yalnız Google boşken; Google sonucu ezilmez; sw v97', async () => {
    const b = fs.readFileSync(path.join(KOK, 'barkod.js'), 'utf8');
    /* v102: değişken adı gbSonuc oldu (her kaynak kendi kaydını üretir,
       birleştirme yok) — KİLİDİN NİYETİ aynı: worker YALNIZ Google boşken. */
    const i = b.indexOf('const gbBulundu = !!(gbSonuc && gbSonuc.ad)');
    const j = b.indexOf('if(!gbBulundu){');
    const w = b.indexOf('await workerIsbn(t)');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(w).toBeGreaterThan(j);                      // worker çağrısı gbBulundu kapısının İÇİNDE
    // v102: alan-alan geri doldurma deseni KALMADI
    expect(b).not.toMatch(/if\(!sonuc\[k\] && ol\[k\]\) sonuc\[k\] = ol\[k\]/);
    expect(b).toContain('sonuc = gbSonuc || wkSonuc || olSonuc || null;');
    expect(b).toContain("bildir(kaynakOkundu(k.kaynak, kaynakMetni) + ': ' + k.ad)");
    const z = fs.readFileSync(path.join(KOK, 'zengin.js'), 'utf8');
    expect(z).toContain('workerIsbnSessiz(sIsbn)');
    /* v102: worker artık ISBN-ÖNCELİKLİ dalın yedeği —  sorgusu boş
       dönerse çağrılır (baskıya birebir kalır). Kilit yeni yapıya taşındı;
       niyet aynı: worker BİRİNCİL kaynak değil, yedek. */
    expect(z.indexOf('workerIsbnSessiz(sIsbn)'))
      .toBeGreaterThan(z.indexOf('if(isbnAdaylar && isbnAdaylar.length)'));
    const sw = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');
    /* g91 deseni: sürüm KAYNAKTAN okunur, sabit anahtar her bump'ta kırılırdı */
    const swN = Number((sw.match(/const CACHE = ONEK \+ '-v(\d+)'/) || [])[1]);
    expect(swN).toBeGreaterThanOrEqual(97);
    // repo worker == canlı deploy kopyası (kalıcı kural: ikisi birlikte düzenlenir)
    /* v107: kıyas satır sonundan ARINDIRILMIŞ (g51'in deseni). Canlı kopya
       depo DIŞINDA duruyor — .gitattributes oraya ulaşmaz, kopyalanırken
       CRLF'e dönebilir. Kilit KODU sınıyor, satır sonunu değil. */
    const canli = 'C:/Users/Kaan/_kitaplik_worker/worker.js';
    const duz = s => s.split(String.fromCharCode(13)).join('');
    if (fs.existsSync(canli))
      expect(duz(fs.readFileSync(canli, 'utf8'))).toBe(duz(fs.readFileSync(path.join(KOK, 'worker', 'worker.js'), 'utf8')));
  });
});
