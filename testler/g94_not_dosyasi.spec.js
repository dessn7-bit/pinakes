'use strict';
/* G94 — NOT DOSYASI içe aktarımı (v98 ekleme → v99 KİTAP BAZINDA YENİLEME).
   { "surum": 1, "not": [ {ad, yazar, metin, tip} ] } → ad+yazar katla eşleme →
   önizleme → onay → yazım. v99 sözleşmesi:
   · içe aktarımla yazılan her not kaynak işaretli (kayn:'dosya'; kitapNormalize
     yalnız işaret varken taşır — işaretsiz kayıtların parmak izi değişmez);
   · uygulamada dosyada GEÇEN her kitap için YALNIZ işaretli notlar kaldırılır
     (silinenNotlar mezarı, not-sil yolunun aynısı) ve dosyadaki satırlar yazılır;
   · işaretsiz notlar (elle/paylaşım/Goodreads) ve dosyada geçmeyen kitaplar
     HİÇ dokunulmaz; boş "not" dizisi hiçbir şey silmez; onaysız tek bayt yok;
   · önizleme üçünü sayar (yazılacak / değiştirilecek / korunacak), kitap kitap
     gösterir, SİLME içerdiğini açıkça söyler;
   · tip yalnız not|alinti (katla), başkası atlanır+sayılır; eşleşmeyen satır
     listelenir; dosya içi tekrar ve elle nota eş metin "zaten vardı".
   KAYNAK KİLİDİ (daraltılmış, kaldırılmadı): silme yalnız işaretli notlar
   üzerinde ve yalnız iceNotUygula'da serbest; işaretsiz nota dokunan her yol kırmızı. */
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');
const fs = require('fs');
const path = require('path');

const ELLE_ALINTI = { id: 'elle1', tip: 'alinti', metin: 'elle alıntı', tarih: '2024-01-01', sayfa: 12, ng: 5 };
const ELLE_NOT = { id: 'elle2', tip: 'not', metin: 'elle not', tarih: '2024-01-02', sayfa: null, ng: 6 };
const ESKI_ICE = { id: 'ice1', tip: 'not', metin: 'eski içe aktarım notu', tarih: '2024-02-01', sayfa: null, ng: 7, kayn: 'dosya' };
function kitaplik() {
  return [
    sahteKitap({ ad: 'Kitap A', yazar: 'Yazar A', notlar: [ELLE_ALINTI, ELLE_NOT], puan: 8 }),
    sahteKitap({ ad: 'Kitap B', yazar: 'Yazar B', notlar: [] }),
    sahteKitap({ ad: 'Kitap C', yazar: 'Yazar C', notlar: [ESKI_ICE, ELLE_NOT] })];   // dosyada GEÇMEYECEK
}
const DOSYA_V1 = { surum: 1, not: [
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'Dosya alıntısı A1', tip: 'alinti' },
  { ad: 'KİTAP A', yazar: 'yazar a', metin: 'Dosya notu A2', tip: 'not' },          // katla eşleşmesi, aynı kitaba 2. satır
  { ad: 'Kitap B', yazar: 'Yazar B', metin: 'Dosya notu B', tip: 'not' },
  { ad: 'Olmayan Kitap', yazar: 'Kimse', metin: 'boşa gider', tip: 'not' },      // eşleşmeyen
  { ad: 'Kitap B', yazar: 'Yazar B', metin: 'yorum satırı', tip: 'yorum' },     // tip bozuk
  { ad: 'Kitap A', yazar: 'Yazar A', metin: '   ', tip: 'not' },                 // eksik alanlı
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'ELLE ALINTI', tip: 'alinti' }       // elle nota eş → zaten vardı
] };
const DOSYA_V2 = { surum: 1, not: [
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'Dosya alıntısı A1 (düzeltildi)', tip: 'alinti' },
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'Dosya notu A2', tip: 'not' },
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'Dosya notu A3 (yeni satır)', tip: 'not' },
  { ad: 'Kitap B', yazar: 'Yazar B', metin: 'Dosya notu B (düzeltildi)', tip: 'not' }
] };
async function dosyaYukle(page, govde, ad) {
  /* v109: tek giriş — boruyu dosyanın kök anahtarı ("not") seçiyor */
  await dosyadanYukle(page, jsonDosya(govde, ad || 'notlar.json'));
}
async function hazirla(page) {
  await tohumla(page, kitaplik());
  await rafAc(page);
  await ayarlarAc(page);
}
const oku = page => page.evaluate(() => veri.kitaplar.map(k => ({
  ad: k.ad, g: k.g, puan: k.puan, mezar: k.silinenNotlar || {},
  notlar: (k.notlar || []).map(n => ({ id: n.id, tip: n.tip, metin: n.metin, tarih: n.tarih, sayfa: n.sayfa, ng: n.ng, kayn: n.kayn })) })));
const kayitsiz = n => { const c = { ...n }; delete c.kayn; return c; };

test.describe('G94 not dosyası — kitap bazında yenileme (v99)', () => {

  test('a+f) önizleme üç sayı + kitap kitap + SİLME uyarısı; onaysız yazım yok; elle notlar AYNEN; aynı kitaba 2 satır', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, DOSYA_V1);
    await expect(page.locator('#zgNotIceOrtu')).toHaveClass(/acik/);
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('3 satır yazılacak');
    await expect(ozet).toContainText('0 içe aktarım notu değiştirilecek');
    await expect(ozet).toContainText('2 elle girilmiş not korunacak');
    await expect(ozet).toContainText('1 satır zaten vardı');
    await expect(ozet).toContainText('1 satır eşleşmedi');
    await expect(ozet).toContainText('1 satır tip alanı bozuk');
    await expect(ozet).toContainText('1 satır eksik alanlı');
    await expect(page.locator('#zgNotIceOrtu .zg-not')).toContainText('SİLME içerir');
    await expect(page.locator('#zgNotIceOrtu')).toContainText('2 yazılacak · 0 değiştirilecek · 2 korunacak');   // Kitap A satırı
    await expect(page.locator('#zgNotIceOrtu')).toContainText('Olmayan Kitap');
    await expect(page.locator('[data-act="zg-not-uygula"]')).toHaveText('Uygula (3 yaz)');
    // ONAYSIZ HİÇBİR ŞEY YAZILMADI
    let d = await oku(page);
    expect(d[0].notlar.map(kayitsiz)).toEqual([ELLE_ALINTI, ELLE_NOT]);
    expect(d[1].notlar.length).toBe(0);
    await page.click('[data-act="zg-not-uygula"]');
    await expect(page.locator('#toast')).toContainText('3 not dosyadan yazıldı (2 kitap)');
    await expect(page.locator('#zgNotIceOrtu')).not.toHaveClass(/acik/);
    d = await oku(page);
    // elle girilenler AYNEN (id/ng/sayfa dahil), işaretsiz
    expect(d[0].notlar.slice(0, 2)).toEqual([{ ...ELLE_ALINTI, kayn: undefined }, { ...ELLE_NOT, kayn: undefined }]);
    // f) aynı kitaba 2 satır, ikisi de işaretli yazıldı
    expect(d[0].notlar.slice(2).map(n => [n.tip, n.metin, n.kayn]))
      .toEqual([['alinti', 'Dosya alıntısı A1', 'dosya'], ['not', 'Dosya notu A2', 'dosya']]);
    expect(d[1].notlar.map(n => [n.metin, n.kayn])).toEqual([['Dosya notu B', 'dosya']]);   // 'yorum satırı' YOK
    // şema: id, tarih (bugün), sayfa null, ng damgası; k.g kullanıcı eylemi; puan dokunulmadı
    const yeni = d[0].notlar[2];
    expect(yeni.id).toMatch(/^[a-z0-9]{8,}$/);
    expect(yeni.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(yeni.sayfa).toBeNull();
    expect(yeni.ng).toBeGreaterThan(0);
    expect(d[0].g).toBeGreaterThan(0);
    expect(d[0].puan).toBe(8);
    expect(Object.keys(d[0].mezar).length, 'ilk yüklemede silinecek işaretli not yoktu → mezar yok').toBe(0);
    // yenilemede kalıcı: işaret korunur, işaretsizde alan HİÇ oluşmaz (parmak izi kararlılığı)
    await page.reload();
    const ham = await page.evaluate(() => veri.kitaplar[0].notlar.map(n => ({ metin: n.metin, kaynVar: 'kayn' in n, kayn: n.kayn })));
    expect(ham).toEqual([
      { metin: 'elle alıntı', kaynVar: false, kayn: undefined },
      { metin: 'elle not', kaynVar: false, kayn: undefined },
      { metin: 'Dosya alıntısı A1', kaynVar: true, kayn: 'dosya' },
      { metin: 'Dosya notu A2', kaynVar: true, kayn: 'dosya' }]);
  });

  test('b) düzeltilmiş dosya ikinci kez: eski içe aktarım notları gider (mezar taşıyla), yenileri gelir, elle notlar durur', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, DOSYA_V1);
    await page.click('[data-act="zg-not-uygula"]');
    await expect(page.locator('#toast')).toContainText('3 not dosyadan yazıldı');
    const once = await oku(page);
    const eskiIdler = once[0].notlar.slice(2).map(n => n.id).concat(once[1].notlar.map(n => n.id));
    expect(eskiIdler.length).toBe(3);
    await dosyaYukle(page, DOSYA_V2);
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('4 satır yazılacak');
    await expect(ozet).toContainText('3 içe aktarım notu değiştirilecek');
    await expect(ozet).toContainText('2 elle girilmiş not korunacak');
    await expect(page.locator('#zgNotIceOrtu')).toContainText('3 yazılacak · 2 değiştirilecek · 2 korunacak');   // Kitap A
    await expect(page.locator('[data-act="zg-not-uygula"]')).toHaveText('Uygula (4 yaz, 3 sil)');
    await page.click('[data-act="zg-not-uygula"]');
    await expect(page.locator('#toast')).toContainText('4 not dosyadan yazıldı, 3 eski içe aktarım notu kaldırıldı (2 kitap)');
    const sonra = await oku(page);
    expect(sonra[0].notlar.slice(0, 2)).toEqual(once[0].notlar.slice(0, 2));     // elle notlar birebir
    expect(sonra[0].notlar.slice(2).map(n => n.metin))
      .toEqual(['Dosya alıntısı A1 (düzeltildi)', 'Dosya notu A2', 'Dosya notu A3 (yeni satır)']);
    expect(sonra[1].notlar.map(n => n.metin)).toEqual(['Dosya notu B (düzeltildi)']);
    // eski içe aktarım notları YOK; her biri için senkron mezar taşı var (karşı cihazda dirilmesin)
    const kalanIdler = sonra[0].notlar.concat(sonra[1].notlar).map(n => n.id);
    for (const id of eskiIdler) {
      expect(kalanIdler).not.toContain(id);
      const mezar = { ...sonra[0].mezar, ...sonra[1].mezar };
      expect(mezar[id]).toBeGreaterThan(0);
    }
    // elle notların id'si mezarda DEĞİL
    expect(sonra[0].mezar.elle1).toBeUndefined();
    expect(sonra[0].mezar.elle2).toBeUndefined();
    // aynı dosya değişmeden üçüncü kez: yine yenilenir, içerik aynı kalır, elle notlar durur
    await dosyaYukle(page, DOSYA_V2);
    await page.click('[data-act="zg-not-uygula"]');
    const uc = await oku(page);
    expect(uc[0].notlar.map(n => n.metin)).toEqual(sonra[0].notlar.map(n => n.metin));
    expect(uc[0].notlar.slice(0, 2)).toEqual(once[0].notlar.slice(0, 2));
  });

  test('c) dosyada geçmeyen kitabın notlarına (işaretli dahi olsa) dokunulmaz', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, DOSYA_V1);
    await page.click('[data-act="zg-not-uygula"]');
    await expect(page.locator('#toast')).toContainText('dosyadan yazıldı');
    const d = await oku(page);
    expect(d[2].ad).toBe('Kitap C');
    expect(d[2].notlar).toEqual([{ ...ESKI_ICE }, { ...ELLE_NOT, kayn: undefined }]);
    expect(Object.keys(d[2].mezar).length).toBe(0);
  });

  test('d) boş "not" dizisi: dürüst mesaj, hiçbir şey silinmez; e) vazgeç: yazılmaz ve silinmez', async ({ page }) => {
    await hazirla(page);
    // Kitap A\'ya bir işaretli not ekle ki "silinebilecek" bir şey olsun
    await page.evaluate(() => { veri.kitaplar[0].notlar.push({ id: 'iceA', tip: 'not', metin: 'önceki içe aktarım', tarih: '2024-03-01', sayfa: null, ng: 9, kayn: 'dosya' }); depoKaydet(); });
    const once = await oku(page);
    await dosyaYukle(page, { surum: 1, not: [] }, 'bos.json');
    await expect(page.locator('#toast')).toContainText('Bu dosyada not listesi yok');
    await expect(page.locator('#zgNotIceOrtu.acik')).toHaveCount(0);   // önizleme hiç kurulmadı bile
    expect(await oku(page)).toEqual(once);
    // e) vazgeç: önizleme silme vaat ediyor ama onay yok → hiçbir şey değişmez
    await dosyaYukle(page, DOSYA_V2);
    await expect(page.locator('#zgNotIceOrtu .zg-ozet')).toContainText('1 içe aktarım notu değiştirilecek');
    await page.click('[data-act="zg-not-vazgec"]');
    await expect(page.locator('#toast')).toContainText('Vazgeçildi — hiçbir şey yazılmadı');
    expect(await oku(page)).toEqual(once);
  });

  test('yalnız eşleşmeyen satırlar: hiçbir kitap "dosyada geçen" sayılmaz, düğme yok, sıfır yazım/silme', async ({ page }) => {
    await hazirla(page);
    const once = await oku(page);
    await dosyaYukle(page, { surum: 1, not: [
      { ad: 'Yok Bir', yazar: 'Kimse', metin: 'a', tip: 'not' },
      { ad: 'Yok İki', yazar: 'Kimse', metin: 'b', tip: 'alinti' }] });
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('2 satır eşleşmedi');
    await expect(ozet).not.toContainText('yazılacak');
    await expect(page.locator('[data-act="zg-not-uygula"]')).toHaveCount(0);
    await expect(page.locator('#zgNotIceOrtu')).toContainText('Yok İki');
    await page.click('[data-act="zg-not-vazgec"]');
    expect(await oku(page)).toEqual(once);
  });

  test('dosya içi tekrar ve tip yazımı: "Alıntı"/"NOT" kabul, tekrar satır zaten vardı; yalnız-sil de uygulanır', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, { surum: 1, not: [
      { ad: 'Kitap B', yazar: 'Yazar B', metin: 'Tekrarlı metin', tip: 'Alıntı' },
      { ad: 'Kitap B', yazar: 'Yazar B', metin: 'tekrarli METİN', tip: 'NOT' }] });
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('1 satır yazılacak');
    await expect(ozet).toContainText('1 satır zaten vardı');
    await page.click('[data-act="zg-not-uygula"]');
    let d = await oku(page);
    expect(d[1].notlar.map(n => [n.tip, n.metin, n.kayn])).toEqual([['alinti', 'Tekrarlı metin', 'dosya']]);
    // dosya B için yalnız elle nota eş satır taşıyor → 0 yaz, 1 sil: düğme yine var, eski işaretli gider
    await page.evaluate(() => { veri.kitaplar[1].notlar.push({ id: 'elleB', tip: 'not', metin: 'B elle', tarih: '2024-01-01', sayfa: null, ng: 3 }); depoKaydet(); });
    await dosyaYukle(page, { surum: 1, not: [{ ad: 'Kitap B', yazar: 'Yazar B', metin: 'b elle', tip: 'not' }] });
    await expect(ozet).toContainText('0 satır yazılacak');
    await expect(ozet).toContainText('1 içe aktarım notu değiştirilecek');
    await expect(ozet).toContainText('1 elle girilmiş not korunacak');
    await expect(page.locator('[data-act="zg-not-uygula"]')).toHaveText('Uygula (0 yaz, 1 sil)');
    await page.click('[data-act="zg-not-uygula"]');
    d = await oku(page);
    expect(d[1].notlar.map(n => [n.id, n.metin])).toEqual([['elleB', 'B elle']]);
  });

  test('ayar metni + sürüm kilidi (kaynaktan) + DARALTILMIŞ kaynak kilidi', async ({ page }) => {
    await rafAc(page);
    await ayarlarAc(page);
    /* v109: not dosyasının kendi paragrafı Ayarlar'dan kalktı — yedi giriş tek
       kapıda birleşti. Sözleşme kaybolmadı, KARAR ANINA taşındı: ne yazılacağı,
       neye dokunulmayacağı ve neyin silineceği onay kartında duruyor. */
    await expect(page.locator('#ortuAyar')).toContainText('not–alıntı dosyası');
    await page.click('#ortuAyar [data-act="dy-sec"]');
    await page.setInputFiles('#dyDosya', jsonDosya(DOSYA_V1, 'notlar.json'));
    const kart = page.locator('#dyKarar');
    await expect(kart).toContainText('Not dosyası');
    await expect(kart).toContainText('SİLME içerir');
    await expect(kart).toContainText('daha önce BU YOLDAN gelen (dosya işaretli) notları kaldırılır');
    await expect(kart).toContainText('elle girdiğin, paylaşımdan ve Goodreads');
    await expect(kart).toContainText('Geri alınamaz');
    await page.click('#dyKarar [data-act="dy-vazgec"]');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const swN = Number((sw.match(/const CACHE = ONEK \+ '-v(\d+)'/) || [])[1]);
    expect(swN).toBeGreaterThanOrEqual(99);
    /* KAYNAK KİLİDİ (v99 daraltıldı, kaldırılmadı): notlar dizisine dokunan
       tek yer iceNotUygula; orada silme TEK satır ve yalnız iceNotIsareti'ne
       dayanır; işaret tanımı kayn === 'dosya'. İşaretsiz nota dokunan her yol
       (splice, metin değiştirme, koşulsuz filter, dizi sıfırlama) kırmızı. */
    const z = fs.readFileSync(path.join(__dirname, '..', 'zengin.js'), 'utf8');
    expect(z).toContain("const ICE_NOT_KAYN = 'dosya';");
    expect(z).toContain("function iceNotIsareti(n){ return !!(n && n.kayn === ICE_NOT_KAYN); }");
    const bas = z.indexOf('function iceNotUygula('), son = z.indexOf('KÜTÜPHANE DOSYASI (v100)');
    expect(bas).toBeGreaterThan(0); expect(son).toBeGreaterThan(bas);
    const govde = z.slice(bas, son);
    expect(govde).toContain('k.notlar.push(');
    expect(govde).not.toMatch(/splice|\.metin\s*=|notlar\s*=\s*\[/);
    // izin verilen biçimler dışında filter ve notlar ataması YOK:
    // sayım (salt-okur), TEK silme satırı (yalnız işaretli), boş-güvence
    const izinli = ['const eski = k.notlar.filter(iceNotIsareti);',
      'k.notlar = k.notlar.filter(n => !iceNotIsareti(n));',
      'k.notlar = k.notlar || [];'];
    let kalan = govde;
    for (const p of izinli) { expect(govde.split(p).length - 1, p).toBe(1); kalan = kalan.split(p).join(''); }
    expect(kalan).not.toContain('filter(');
    expect(kalan).not.toMatch(/notlar\s*=/);
    // fonksiyon DIŞINDA zengin.js notlar dizisine hiç yazmaz
    const dis = z.slice(0, bas) + z.slice(son);
    expect(dis).not.toMatch(/notlar\.push\(|notlar\.splice\(|\.notlar\s*=\s*[^=]/);
  });
});
