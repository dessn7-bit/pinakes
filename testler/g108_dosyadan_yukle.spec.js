'use strict';
/* G108 — DOSYADAN YÜKLE: yedi giriş tek kapıda (v109).

   ÖNCESİ (ölçüldü): Ayarlar ▸ İçe aktar 1737px = 2,2 ekran, 7 başlık, 7
   paragraf (2511 karakter), 8 düğme, 5 ayrı gizli dosya girdisi, 4 neredeyse
   birebir *DosyaKur kopyası. Hepsi aynı cümleyi kuruyordu.

   SÖZLEŞMELER:
   - BİRLEŞEN GİRİŞ, borular değil. Önizleme pencereleri (zgTurIceOrtu /
     zgAdTrOrtu / zgOzetIceOrtu / zgNotIceOrtu / kyOrtu), plan kurucular,
     kapılar ve yazım yolları AYNEN duruyor — bu grup yalnız kapıyı sınar,
     boruların kendi sözleşmeleri g56/g62/g79/g80/g94/g95'te.
   - Boru seçimi düğmeden değil DOSYANIN KÖK ANAHTARINDAN geliyor; seçim
     kullanıcıya DOĞRULATILIR (onay kartı).
   - `{kitaplar}` BELİRSİZ: birleştir (ekler) / tam değiştir (siler) ikisi de
     geçerli, dosyadan çıkarılamaz. Algılama karar VERMEZ, sorar; yıkıcı
     olmayan seçenek ÖNCE ve birincil düğme olarak durur.
   - Boş dizi tanımayı BOZMAZ: boş listeye ne diyeceğini borunun kendisi bilir.
   - KADEME: silen borular (not dosyası, tam değiştirme) ayrı zeminli uyarı
     şeridi taşır ve neyin silineceğini onaydan ÖNCE yazar.
   - Onaysız tek bayt yazılmaz; Vazgeç iz bırakmaz.

   (Mutasyon 1: dyTani'nin JSON dalı daima boş dizi döndürür → 6 vaka kırmızı.
    Mutasyon 2: dyKararCiz'de dy-calistir düğmesi çizilmez → 8 vaka kırmızı.
    Mutasyon 3: {kitaplar} için yalnız 'degistir' üretilir → belirsizlik ve
    sıra vakaları kırmızı.) */

const fs = require('fs');
const path = require('path');
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');

const KOK = path.join(__dirname, '..');
const TURLER = [{ seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1200 }];
const csvDosya = (metin, ad) =>
  ({ name: ad || 'goodreads.csv', mimeType: 'text/csv', buffer: Buffer.from(metin, 'utf8') });
const GR_CSV = [
  'Title,Author,Exclusive Shelf,My Rating,Number of Pages',
  '"Dune","Frank Herbert",to-read,0,712'
].join('\n');

async function kapiAc(page, kitaplar) {
  await tohumla(page, kitaplar || [sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
  await rafAc(page);
  await ayarlarAc(page);
}
/* Kartta DUR — algılamayı sınayan vakalar boruyu çalıştırmaz. */
async function kartAc(page, dosya) {
  await dosyadanYukle(page, dosya, false);
  return page.locator('#dyKarar');
}

test.describe('G108 dosyadan yükle — algılama', () => {

  test('kök anahtar doğru boruyu açar: tur → tür önizlemesi', async ({ page }) => {
    await kapiAc(page);
    page.__agAyar.turler = TURLER;
    await dosyadanYukle(page, jsonDosya(
      { surum: 1, tur: [{ ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }] }, 'turler.json'));
    await expect(page.locator('#zgTurIceOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('boş tür dolacak');
  });

  test('kök anahtar doğru boruyu açar: not → not önizlemesi (SİLME uyarısıyla)', async ({ page }) => {
    await kapiAc(page);
    await dosyadanYukle(page, jsonDosya(
      { surum: 1, not: [{ ad: 'Persler', yazar: 'Aeschylus', metin: 'Bir not', tip: 'not' }] }, 'notlar.json'));
    await expect(page.locator('#zgNotIceOrtu')).toHaveClass(/acik/);
  });

  test('adTr dosyası ARTIK kabul ediliyor — v73 kararı birleşmeyle çözüldü', async ({ page }) => {
    /* v73'te Türkçe ad listesinin dosya seçicisi bilerek YOKTU (tek giriş
       yerleşik liste). Boru cfg-parametreli olduğu için tek kapı onu bedavaya
       getirdi: ayrı düğme açmadan dosya da kabul ediliyor. */
    await kapiAc(page, [sahteKitap({ ad: 'The Little Prince', yazar: 'Antoine de Saint-Exupéry' })]);
    await dosyadanYukle(page, jsonDosya({ surum: 1, adTr: [
      { ad: 'The Little Prince', yazar: 'Antoine de Saint-Exupéry', adTr: 'Küçük Prens' }] }, 'adlar.json'));
    await expect(page.locator('#zgAdTrOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#zgAdTrOrtu .zg-ozet')).toContainText('boş Türkçe ad dolacak');
    await page.click('[data-act="zg-adtr-uygula"]');
    expect(await page.evaluate(() => veri.kitaplar[0].adTr)).toBe('Küçük Prens');
  });

  test('Goodreads CSV aynı kapıdan giriyor (JSON değil → başlık sütunlarından tanınır)', async ({ page }) => {
    await kapiAc(page, []);
    const kart = await kartAc(page, csvDosya(GR_CSV));
    await expect(kart).toContainText('Goodreads CSV');
    await page.click('#dyKarar [data-act="dy-calistir"]');
    await expect(page.locator('#toast')).toContainText('1 kitap aktarıldı');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(1);
  });

  test('tanınmayan dosya: kart beklenen biçimleri sayar, HİÇBİR boru açılmaz', async ({ page }) => {
    await kapiAc(page);
    const kart = await kartAc(page, jsonDosya({ birsey: [1, 2] }, 'alakasiz.json'));
    await expect(page.locator('#toast')).toContainText('tanıdığım bir liste yok');
    await expect(kart).toContainText('tanıyamadım');
    await expect(kart).toContainText('{ "tur": [...] }');
    await expect(kart).toContainText('Goodreads');
    await expect(kart.locator('[data-act="dy-calistir"]')).toHaveCount(0);
    for (const o of ['#zgTurIceOrtu', '#zgAdTrOrtu', '#zgOzetIceOrtu', '#zgNotIceOrtu', '#kyOrtu'])
      await expect(page.locator(o + '.acik')).toHaveCount(0);
  });

  test('boş dizi tanımayı BOZMAZ — dürüst mesajın sahibi borunun kendisi', async ({ page }) => {
    await kapiAc(page);
    const kart = await kartAc(page, jsonDosya({ surum: 1, not: [] }, 'bos.json'));
    await expect(kart).toContainText('Not dosyası');
    await page.click('#dyKarar [data-act="dy-calistir"]');
    /* kapı susar, boru konuşur (v98 metni) */
    await expect(page.locator('#toast')).toContainText('not');
  });

});

test.describe('G108 belirsizlik: {kitaplar} iki varış', () => {

  const YEDEK = { surum: 2, kitaplar: [
    { ad: 'Yedekten Gelen', yazar: 'Yedek Yazar' }], hedef: {} };

  test('iki seçenek sunulur; yıkıcı olmayan ÖNCE, ikisi de çerçeveli', async ({ page }) => {
    await kapiAc(page);
    const kart = await kartAc(page, jsonDosya(YEDEK, 'yedek.json'));
    const dugmeler = kart.locator('[data-act="dy-calistir"]');
    await expect(dugmeler).toHaveCount(2);
    await expect(dugmeler.nth(0)).toHaveAttribute('data-v', 'birlestir');
    await expect(dugmeler.nth(1)).toHaveAttribute('data-v', 'degistir');
    /* İkisi de çerçeveli: g29/g30/g48 "pencere başına TEK birincil" diyor ve
       o birincil "JSON indir". Kart bir SORU soruyor — öneri dolgu değil SIRA
       ve silenin uyarı şeridi. */
    await expect(dugmeler.nth(0)).not.toHaveClass(/btn-brass/);
    await expect(dugmeler.nth(1)).not.toHaveClass(/btn-brass/);
    await expect(kart).toContainText('1 kitaplık JSON yedeği');
  });

  test('birleştir SİLMEZ: mevcut kayıt durur, yeni kayıt eklenir', async ({ page }) => {
    await kapiAc(page);
    await dosyadanYukle(page, jsonDosya(YEDEK, 'yedek.json'), 'birlestir');
    await expect(page.locator('#toast')).toContainText('1 kitap geri yüklendi');
    const adlar = await page.evaluate(() => veri.kitaplar.map(k => k.ad));
    expect(adlar).toContain('Persler');            // dosyada YOK ama silinmedi
    expect(adlar).toContain('Yedekten Gelen');
  });

  test('tam değiştir SİLER: dosyada olmayan kayıt gider (onaydan sonra)', async ({ page }) => {
    await kapiAc(page);
    await dosyadanYukle(page, jsonDosya(YEDEK, 'yedek.json'), 'degistir');
    await expect(page.locator('#kyOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#kyOrtu')).toContainText('silinecek');
    expect(await page.evaluate(() => veri.kitaplar.map(k => k.ad)), 'onaysız yazım yok')
      .toContain('Persler');
    await page.click('#kyOrtu [data-act="ky-uygula"]');
    await expect.poll(() => page.evaluate(() => veri.kitaplar.map(k => k.ad)))
      .toEqual(['Yedekten Gelen']);
  });

});

test.describe('G108 kademe, vazgeçme ve kaynak', () => {

  test('SİLME kademesi ayrı zeminli: yalnız not ve tam değiştir uyarı şeridi taşır', async ({ page }) => {
    await kapiAc(page);
    const notKart = await kartAc(page, jsonDosya({ surum: 1, not: [
      { ad: 'Persler', yazar: 'Aeschylus', metin: 'n', tip: 'not' }] }, 'n.json'));
    await expect(notKart.locator('.dy-siler')).toHaveCount(1);
    await expect(notKart.locator('.dy-uyari')).toContainText('SİLME içerir');
    await page.click('#dyKarar [data-act="dy-vazgec"]');

    const turKart = await kartAc(page, jsonDosya({ surum: 1, tur: [
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }] }, 't.json'));
    await expect(turKart.locator('.dy-siler')).toHaveCount(0);
    await expect(turKart.locator('.dy-uyari')).toHaveCount(0);
    await page.click('#dyKarar [data-act="dy-vazgec"]');

    const yedekKart = await kartAc(page, jsonDosya(
      { surum: 2, kitaplar: [{ ad: 'A', yazar: 'B' }], hedef: {} }, 'y.json'));
    await expect(yedekKart.locator('.dy-siler'), 'yalnız tam değiştir').toHaveCount(1);
  });

  test('Vazgeç iz bırakmaz: kart kapanır, hiçbir boru açılmaz, tek bayt yazılmaz', async ({ page }) => {
    await kapiAc(page);
    const once = await page.evaluate(() => JSON.stringify(veri));
    await kartAc(page, jsonDosya({ surum: 1, tur: [
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }] }, 't.json'));
    await page.click('#dyKarar [data-act="dy-vazgec"]');
    await expect(page.locator('#dyKarar')).toBeHidden();
    await expect(page.locator('#zgTurIceOrtu.acik')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(veri))).toBe(once);
  });

  test('dyTani sözleşmesi (saf fonksiyon, hiçbir şey yazmaz)', async ({ page }) => {
    await rafAc(page);
    const s = await page.evaluate(() => {
      const t = m => window.__dy.tani(m).bulunan.map(b => b.tip);
      return {
        tur: t('{"tur":[{"ad":"a"}]}'),
        adTr: t('{"adTr":[{"ad":"a"}]}'),
        ozet: t('{"ozet":[{"ad":"a"}]}'),
        not: t('{"not":[{"ad":"a"}]}'),
        kitaplar: t('{"kitaplar":[{"ad":"a"}]}'),
        bosNot: t('{"not":[]}'),
        csv: t('Title,Author\nA,B'),
        bozuk: window.__dy.tani('{bozuk').hata,
        alakasiz: window.__dy.tani('{"x":1}').hata,
        /* JSON olmaya ÇALIŞMAYAN dosyaya JSON'dan söz edilmez */
        csvAlakasiz: window.__dy.tani('a;b;c').hata,
        cokluAnahtar: t('{"ozet":[{"ad":"a"}],"not":[{"ad":"b"}]}')
      };
    });
    expect(s.tur).toEqual(['tur']);
    expect(s.adTr).toEqual(['adTr']);
    expect(s.ozet).toEqual(['ozet']);
    expect(s.not).toEqual(['not']);
    expect(s.kitaplar, 'yıkıcı olmayan önce').toEqual(['birlestir', 'degistir']);
    expect(s.bosNot, 'boş dizi tanımayı bozmaz').toEqual(['not']);
    expect(s.csv).toEqual(['goodreads']);
    expect(s.bozuk).toBe('json-degil');
    expect(s.alakasiz).toBe('liste-yok');
    expect(s.csvAlakasiz, 'CSV\'ye "JSON değil" demek yanıltıcı olurdu').toBe('liste-yok');
    expect(s.cokluAnahtar, 'iki liste taşıyan dosya iki seçenek sunar').toEqual(['ozet', 'not']);
  });

  test('KAYNAK KİLİDİ: dört *DosyaKur kopyası ve beş gizli girdi TEK girişe indi', async ({ page }) => {
    const z = fs.readFileSync(path.join(KOK, 'zengin.js'), 'utf8');
    const h = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
    /* kopya dosya-seçici kurucuları geri gelirse bu iddia kırılır */
    for (const eski of ['zgTurDosya', 'zgOzetDosya', 'zgNotDosya', "'kyDosya'"])
      expect(z, eski + ' geri gelmiş').not.toContain(eski);
    expect(z.split("g.id = 'dyDosya'").length - 1, 'tek dosya girdisi').toBe(1);
    /* index.html'deki iki statik girdi ve düğmeleri de kalktı */
    for (const eski of ['id="grDosya"', 'id="iceDosya"', 'gr-aktar', 'ice-aktar'])
      expect(h, eski + ' geri gelmiş').not.toContain(eski);
    /* iceAktar/goodreadsAktar fonksiyonları DEĞİŞMEDİ, köprüyle çağrılıyor */
    expect(h).toContain('window.__iceAktarma = { json: iceAktar, goodreads: goodreadsAktar };');
    const sw = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');
    expect(Number((sw.match(/const CACHE = ONEK \+ '-v(\d+)'/) || [])[1])).toBeGreaterThanOrEqual(109);
  });

});
