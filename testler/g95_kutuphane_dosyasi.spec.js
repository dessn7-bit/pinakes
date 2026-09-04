'use strict';
/* G95 — KÜTÜPHANE DOSYASI (v100): JSON yedeğini TAM DEĞİŞTİRME ile geri yükleme.
   Ayarlar ▸ İçe/dışa aktarım ▸ "Kütüphane dosyası" (Özet/Not dosyası girişlerinin
   altında). Sözleşme:
   · DOĞRULAMA önce: JSON · kitaplar dizisi · her kayıtta ad + yazar · surum ===
     YEDEK_SURUM (2) · id tekrarı yok · boş dizi değil — biri düşerse HİÇ yazılmaz,
     nedenler pencerede listelenir;
   · ONAY penceresi: dosyadaki / mevcut kayıt sayısı + eklenecek / güncellenecek /
     silinecek / aynı; TAM DEĞİŞTİRME (birleştirme değil) ve dosyada olmayanın
     SİLİNECEĞİ açıkça yazılır; onaysız tek bayt yok;
   · YAZIM: dosya sırası; güncellenen/eklenen k.g taze, aynı kalan nesne dokunulmaz,
     silinen için silinenler mezarı (senkron dirilmesin), tercih haritaları union;
   · ANLIK KOPYA yazımdan hemen önce IndexedDB kk_geri_v1 ('anlik'/'son') — Geri al
     kartı; geri alma AYNI borudan (önizleme + onay) ve kendisi de geri alınabilir;
   · ÖZETLER damga kapılı (dosya damgası > yerel); geri almada yüklemenin yazdığı
     özetler kapısız kopyadaki hâline döner;
   · TAM TUR: yedek indir → değiştirmeden yükle → 0/0/0, sayı ve alanlar birebir. */
const fs = require('fs');
const path = require('path');
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc } = require('./yardim');

const G0 = 1700000000000;   // sıfırdan farklı damga: damgala g=0 kitapları taze damgalar, bunları değil
function dortlu() {
  return [
    sahteKitap({ id: 'ka', ad: 'Kitap A', yazar: 'Yazar A', yayinevi: 'Yayın A', sayfa: 100, g: G0 + 1 }),
    sahteKitap({ id: 'kb', ad: 'Kitap B', yazar: 'Yazar B', yayinevi: 'Yayın B', sayfa: 200, g: G0 + 2,
      notlar: [{ id: 'nb1', tip: 'alinti', metin: 'B alıntısı', tarih: '2024-01-01', sayfa: 3, ng: 9 }] }),
    sahteKitap({ id: 'kc', ad: 'Kitap C', yazar: 'Yazar C', puan: 7, durum: 'bitti', bitisTarihi: '2024-05-05', g: G0 + 3,
      etiketler: ['deneme'] }),
    sahteKitap({ id: 'kd', ad: 'Kitap D', yazar: 'Yazar D', g: G0 + 4 })];
}
const kitaplarOku = page => page.evaluate(() => JSON.parse(JSON.stringify(veri.kitaplar)));
const veriOku = page => page.evaluate(() => JSON.parse(JSON.stringify(veri)));
async function dosyaYukle(page, govde, ad) {
  await page.click('[data-act="ky-ice"]');
  const buffer = Buffer.isBuffer(govde) ? govde
    : Buffer.from(typeof govde === 'string' ? govde : JSON.stringify(govde), 'utf8');
  await page.setInputFiles('#kyDosya', { name: ad || 'kutuphane.json', mimeType: 'application/json', buffer });
}
/* Dosya = "dışa aktarım + dış düzeltme": A aynı, B ad + yayınevi düzeltilmiş,
   E yeni (id'siz), C ve D dosyada yok (silinecek); ayrıca dosya mezarı + hedef */
async function duzeltilmisDosya(page) {
  const ks = await kitaplarOku(page);
  const A = ks.find(k => k.id === 'ka'), B = ks.find(k => k.id === 'kb');
  return { surum: 2, tarih: '2026-09-04T10:00:00.000Z',
    kitaplar: [A, { ...B, ad: 'Kitap B (düzeltildi)', yayinevi: 'Yayın B2' }, { ad: 'Kitap E', yazar: 'Yazar E' }],
    hedef: { 2026: 12 }, hedefG: { 2026: G0 }, hedefSayfa: {}, hedefSayfaG: {},
    silinenler: { eskiMezar: 5 }, kesfetGizli: { 'x|y': 7 }, kesfetGizliGeri: {}, turRed: {}, turRedGeri: {}, ozetler: {} };
}
async function hazirla(page, kitaplar, ekstraVeri) {
  await tohumla(page, Object.assign({ kitaplar: kitaplar || dortlu(), hedef: { 2026: 10 }, hedefG: { 2026: G0 } }, ekstraVeri || {}));
  await rafAc(page);
  await ayarlarAc(page);
}

test.describe('G95 kütüphane dosyası — tam değiştirme geri yükleme (v100)', () => {

  test('g) Ayarlar girişi: "Kütüphane dosyası" başlığı Not dosyasının altında, düğme + gizli geri-al kartı; sw ≥ v100', async ({ page }) => {
    await hazirla(page);
    const basliklar = await page.evaluate(() =>
      [...document.querySelectorAll('#ayBolumAktarim .ay-baslik')].map(h => h.textContent.trim()));
    const i = basliklar.indexOf('Kütüphane dosyası');
    expect(i).toBeGreaterThan(0);
    expect(basliklar[i - 1]).toBe('Not dosyası');
    expect(basliklar[i - 2]).toBe('Özet dosyası');
    await expect(page.locator('#ayBolumAktarim [data-act="ky-ice"]')).toHaveText('Kütüphane dosyası seç');
    await expect(page.locator('#kyGeriKart')).toBeHidden();   // anlık kopya yok → kart yok
    await expect(page.locator('#ayBolumAktarim')).toContainText('tam değiştirme');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const m = sw.match(/const CACHE = ONEK \+ '-v(\d+)';/);
    expect(m, 'sw CACHE sürüm satırı').toBeTruthy();
    expect(parseInt(m[1])).toBeGreaterThanOrEqual(100);
  });

  test('a) doğrulama: bozuk JSON / kitaplar yok / sürüm / ad-yazar / id tekrarı / boş dizi → pencerede neden, HİÇ yazılmaz', async ({ page }) => {
    await hazirla(page);
    const once = await veriOku(page);
    const lsOnce = await page.evaluate(() => localStorage.getItem('kk_kitaplik_v1'));
    const vakalar = [
      ['{bozuk', 'geçerli bir JSON değil'],
      [{ surum: 2, kitap: [] }, '"kitaplar" dizisi yok'],
      [{ surum: 3, kitaplar: [{ id: 'x', ad: 'A', yazar: 'B' }] }, 'dosyada 3, uygulama 2 bekliyor'],
      [{ kitaplar: [{ id: 'x', ad: 'A', yazar: 'B' }] }, '"surum" alanı yok'],
      [{ surum: 2, kitaplar: [{ id: 'x', ad: 'Adlı', yazar: '' }, { id: 'y', ad: '  ', yazar: 'Yazarlı' }] },
        ['1. kayıt: yazar alanı boş (ad: Adlı)', '2. kayıt: ad alanı boş (yazar: Yazarlı)']],
      [{ surum: 2, kitaplar: [{ id: 'x', ad: 'A', yazar: 'B' }, { id: 'x', ad: 'C', yazar: 'D' }] }, '2. kayıt: id tekrar ediyor (x)'],
      [{ surum: 2, kitaplar: [] }, 'hiç kitap yok']
    ];
    for (const [govde, beklenen] of vakalar) {
      await dosyaYukle(page, govde, 'bozuk.json');
      await expect(page.locator('#kyOrtu')).toHaveClass(/acik/);
      await expect(page.locator('#kyOrtu .ky-ozet')).toContainText('doğrulamadan geçemedi');
      for (const b of [].concat(beklenen)) await expect(page.locator('#kyOrtu .ky-hata')).toContainText(b);
      await expect(page.locator('#kyOrtu [data-act="ky-uygula"]')).toHaveCount(0);   // uygula düğmesi YOK
      await page.click('#kyOrtu [data-act="ky-vazgec"]');
      await expect(page.locator('#kyOrtu.acik')).toHaveCount(0);
    }
    expect(await veriOku(page)).toEqual(once);
    expect(await page.evaluate(() => localStorage.getItem('kk_kitaplik_v1'))).toBe(lsOnce);
    // saf doğrulayıcı: geçerli dosya sıfır hata; hata tavanı sayıyla kapanır
    const sonuc = await page.evaluate(() => ({
      gecerli: window.__ky.dogrula({ surum: 2, kitaplar: [{ ad: 'A', yazar: 'B' }] }),
      tavan: window.__ky.dogrula({ surum: 2, kitaplar: Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, ad: 'A' + i })) })
    }));
    expect(sonuc.gecerli).toEqual([]);
    expect(sonuc.tavan.length).toBe(9);
    expect(sonuc.tavan[8]).toBe('… ve 4 hata daha.');
  });

  test('b) önizleme: sayılar, TAM DEĞİŞTİRME uyarısı, listeler, düğme metni; onaysız yazım yok; Vazgeç', async ({ page }) => {
    await hazirla(page);
    const once = await veriOku(page);
    await dosyaYukle(page, await duzeltilmisDosya(page), 'duzeltme.json');
    await expect(page.locator('#kyOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#kyOrtu .sheet-baslik')).toHaveText('Kütüphane dosyası yükle');
    const ozet = page.locator('#kyOrtu .ky-ozet');
    await expect(ozet.nth(0)).toContainText('Dosyada 3 kayıt · mevcut 4 kayıt');
    await expect(ozet.nth(1)).toContainText('1 eklenecek · 1 güncellenecek · 2 silinecek · 1 aynı kalacak');
    await expect(ozet.nth(1)).toContainText('yıl hedefleri dosyadaki değerlerle değişecek');
    const uyari = page.locator('#kyOrtu .ky-uyari');
    await expect(uyari).toContainText('TAM DEĞİŞTİRME');
    await expect(uyari).toContainText('birleştirme değil');
    await expect(uyari).toContainText('Dosyada olmayan 2 kayıt');
    await expect(uyari).toContainText('SİLİNİR');
    await expect(uyari).toContainText('anlık kopyası alınır');
    await expect(page.locator('#kyOrtu .ky-katla', { hasText: 'Silinecekler (2)' })).toContainText('Kitap C');
    await expect(page.locator('#kyOrtu .ky-katla', { hasText: 'Silinecekler (2)' })).toContainText('Kitap D');
    await expect(page.locator('#kyOrtu .ky-katla', { hasText: 'Eklenecekler (1)' })).toContainText('Kitap E');
    await expect(page.locator('#kyOrtu .ky-katla', { hasText: 'Güncellenecekler (1)' })).toContainText('değişen: ad, yayınevi');
    await expect(page.locator('#kyOrtu [data-act="ky-uygula"]')).toHaveText('Uygula (1 ekle, 1 güncelle, 2 sil)');
    // ONAYSIZ HİÇBİR ŞEY YAZILMADI (bellek + depo + anlık kopya)
    expect(await veriOku(page)).toEqual(once);
    expect(await page.evaluate(() => window.__ky.anlikOku())).toBeNull();
    await page.click('#kyOrtu [data-act="ky-vazgec"]');
    await expect(page.locator('#toast')).toContainText('Vazgeçildi — hiçbir şey yazılmadı');
    await expect(page.locator('#kyOrtu.acik')).toHaveCount(0);
    expect(await veriOku(page)).toEqual(once);
    await expect(page.locator('#kyGeriKart')).toBeHidden();
  });

  test('c+d) uygula: dosya sırası + içerik, mezar, damga, aynı kalan dokunulmaz, toast, liste; anlık kopya + Geri al aynı borudan; geri almanın geri alınması', async ({ page }) => {
    await hazirla(page);
    const once = await veriOku(page);
    const t0 = Date.now();
    await dosyaYukle(page, await duzeltilmisDosya(page), 'duzeltme.json');
    await page.click('#kyOrtu [data-act="ky-uygula"]');
    await expect(page.locator('#toast')).toContainText('Kütüphane dosyadan yüklendi — 3 kayıt işlendi: 1 eklendi, 1 güncellendi, 2 silindi');
    await expect(page.locator('#kyOrtu.acik')).toHaveCount(0);
    let v = await veriOku(page);
    expect(v.kitaplar.map(k => k.ad)).toEqual(['Kitap A', 'Kitap B (düzeltildi)', 'Kitap E']);   // dosya sırası
    const A = v.kitaplar[0], B = v.kitaplar[1], E = v.kitaplar[2];
    expect(A).toEqual(once.kitaplar[0]);                    // AYNI kalan: alanlar ve damga birebir
    expect(B.yayinevi).toBe('Yayın B2');
    expect(B.notlar.map(n => n.metin)).toEqual(['B alıntısı']);   // dosyadaki not aynen taşındı
    expect(B.g).toBeGreaterThanOrEqual(t0);                  // güncellenen: taze damga (LWW)
    expect(E.id).toBeTruthy();
    expect(E.g).toBeGreaterThanOrEqual(t0);
    expect(v.silinenler.kc).toBeGreaterThanOrEqual(t0);      // silinen: mezar (senkron dirilmesin)
    expect(v.silinenler.kd).toBeGreaterThanOrEqual(t0);
    expect(v.silinenler.eskiMezar).toBe(5);                  // dosya mezarları union
    expect(v.kesfetGizli['x|y']).toBe(7);                    // tercih haritası union
    expect(v.hedef['2026']).toBe(12);                         // hedef dosyadan, değişen yıl damgalı
    expect(v.hedefG['2026']).toBeGreaterThanOrEqual(t0);
    // depo + liste
    const depo = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1')));
    expect(depo.kitaplar.map(k => k.ad)).toEqual(['Kitap A', 'Kitap B (düzeltildi)', 'Kitap E']);
    await expect(page.locator('#panel-raf')).toContainText('Kitap E');
    await expect(page.locator('#panel-raf')).not.toContainText('Kitap C');
    // ANLIK KOPYA: yazımdan önceki durum, IDB kk_geri_v1
    const kopya = await page.evaluate(() => window.__ky.anlikOku());
    expect(kopya.kaynak).toBe('dosya');
    expect(kopya.dosyaAdi).toBe('duzeltme.json');
    expect(kopya.veri).toEqual(once);
    expect(kopya.sonuc).toEqual({ ekle: 1, guncelle: 1, sil: 2 });
    expect(kopya.ozetYazilan).toEqual([]);
    const kart = page.locator('#kyGeriKart');
    await expect(kart).toBeVisible();
    await expect(kart).toContainText('kütüphane dosyası yüklemesi (duzeltme.json) öncesi durum, 4 kayıt');
    await expect(kart).toContainText('1 ekleme, 1 güncelleme, 2 silme');
    await expect(kart).toContainText('kk_geri_v1');
    // GERİ AL — aynı boru: önizleme + onay
    const t1 = Date.now();
    await kart.locator('[data-act="ky-geri"]').click();
    await expect(page.locator('#kyOrtu')).toHaveClass(/acik/);
    await expect(page.locator('#kyOrtu .sheet-baslik')).toHaveText('Geri al — önceki duruma dön');
    await expect(page.locator('#kyOrtu .ky-ozet').nth(0)).toContainText('Anlık kopyada 4 kayıt · mevcut 3 kayıt');
    await expect(page.locator('#kyOrtu .ky-ozet').nth(1)).toContainText('2 eklenecek · 1 güncellenecek · 1 silinecek · 1 aynı kalacak');
    await expect(page.locator('#kyOrtu .ky-uyari')).toContainText('kopyada olmayan 1 kayıt SİLİNİR');
    expect((await veriOku(page)).kitaplar.length).toBe(3);   // onaysız değişmedi
    await page.click('#kyOrtu [data-act="ky-uygula"]');
    await expect(page.locator('#toast')).toContainText('Geri alındı — 4 kayıt işlendi: 2 eklendi, 1 güncellendi, 1 silindi');
    v = await veriOku(page);
    expect(v.kitaplar.map(k => k.id)).toEqual(['ka', 'kb', 'kc', 'kd']);
    const g_siz = k => { const c = { ...k }; delete c.g; return c; };
    expect(v.kitaplar.map(g_siz)).toEqual(once.kitaplar.map(g_siz));   // içerik birebir geri geldi
    expect(v.kitaplar[0].g).toBe(once.kitaplar[0].g);                    // A hiç dokunulmadı
    expect(v.kitaplar[2].g).toBeGreaterThanOrEqual(t1);                  // C/D yeniden eklendi: taze damga > eski mezar
    expect(v.silinenler.kc).toBeUndefined();
    expect(v.silinenler.kd).toBeUndefined();
    expect(v.silinenler[E.id]).toBeGreaterThanOrEqual(t1);              // E silindi: mezar
    expect(v.hedef['2026']).toBe(10);
    await expect(kart).toContainText('geri alma öncesi durum, 3 kayıt');   // geri alma da geri alınabilir
    const kopya2 = await page.evaluate(() => window.__ky.anlikOku());
    expect(kopya2.kaynak).toBe('geri');
    expect(kopya2.veri.kitaplar.map(k => k.ad)).toEqual(['Kitap A', 'Kitap B (düzeltildi)', 'Kitap E']);
    // yenilemede kalıcı
    await page.reload();
    expect(await page.evaluate(() => veri.kitaplar.map(k => k.id))).toEqual(['ka', 'kb', 'kc', 'kd']);
  });

  test('e) TAM TUR: yedek indir → hiçbir şey değiştirmeden yükle → 0 ekle / 0 güncelle / 0 sil, kayıt sayısı ve alanlar birebir', async ({ page }) => {
    const zengin = [
      sahteKitap({ id: 'z1', ad: 'Zengin Bir', yazar: 'Yazar Z', yayinevi: 'Yayın Z', yil: 1999, sayfa: 321, tur: 'Roman',
        durum: 'bitti', puan: 9, baslamaTarihi: '2024-01-02', bitisTarihi: '2024-02-03', etiketler: ['klasik', 'favori'],
        isbn: '9780132350884', seri: 'Seri Z', ciltNo: 2, cevirmen: 'Çevirmen Z', dil: 'tr', raf: 'Salon', g: G0 + 11,
        notlar: [{ id: 'n1', tip: 'alinti', metin: 'İlk alıntı', tarih: '2024-01-10', sayfa: 12, ng: 4, fikir: ['zaman'] },
          { id: 'n2', tip: 'not', metin: 'Bir not', tarih: '2024-01-11', sayfa: null, ng: 5 }],
        seanslar: [{ t: '2024-01-05', s: 30 }], oturumlar: [{ b: 1704000000000, e: 1704003600000, bs: 1, es: 40 }],
        okumalar: [{ bas: '2020-01-01', bit: '2020-02-01', puan: 7, not: 'ilk okuma' }] }),
      sahteKitap({ id: 'z2', ad: 'Zengin İki', yazar: 'Yazar Y', durum: 'okunuyor', guncelSayfa: 55, sayfa: 300, g: G0 + 12,
        odunc: [{ kisi: 'Ali', t: '2024-03-01' }] }),
      sahteKitap({ id: 'z3', ad: 'Zengin Üç', yazar: 'Yazar X', sahiplik: 'istek', g: G0 + 13 }),
      sahteKitap({ id: 'z4', ad: 'Zengin Dört', yazar: 'Yazar W', puan: 3, durum: 'yarim', g: G0 + 14 }),
      sahteKitap({ id: 'z5', ad: 'Zengin Beş', yazar: 'Yazar V', g: G0 + 15, etiketler: ['şiir'] })];
    await hazirla(page, zengin, { hedefSayfa: { 2026: 5000 }, hedefSayfaG: { 2026: G0 }, silinenler: { eski1: G0 } });
    const once = await veriOku(page);
    const lsOnce = await page.evaluate(() => localStorage.getItem('kk_kitaplik_v1'));
    // 1) uygulamadan yedek al
    const [indirme] = await Promise.all([page.waitForEvent('download'), page.click('#ortuAyar [data-act="disa-aktar"]')]);
    const yedek = fs.readFileSync(await indirme.path());
    const y = JSON.parse(yedek.toString('utf8'));
    expect(y.surum).toBe(2);
    expect(y.kitaplar.length).toBe(5);
    // 2) hiçbir şey değiştirmeden geri yükle
    await dosyaYukle(page, yedek, indirme.suggestedFilename());
    await expect(page.locator('#kyOrtu .ky-ozet').nth(0)).toContainText('Dosyada 5 kayıt · mevcut 5 kayıt');
    await expect(page.locator('#kyOrtu .ky-ozet').nth(1)).toContainText('0 eklenecek · 0 güncellenecek · 0 silinecek · 5 aynı kalacak');
    await expect(page.locator('#kyOrtu .ky-ozet').nth(1)).not.toContainText('hedefleri');
    await expect(page.locator('#kyOrtu .ky-katla')).toHaveCount(0);
    await expect(page.locator('#kyOrtu [data-act="ky-uygula"]')).toHaveText('Uygula (kayıt değişikliği yok)');
    await page.click('#kyOrtu [data-act="ky-uygula"]');
    await expect(page.locator('#toast')).toContainText('5 kayıt işlendi: 0 eklendi, 0 güncellendi, 0 silindi');
    // 3) sayı ve alanlar birebir (damga dahil), depo baytı aynı, anlık kopya = önceki durum
    const sonra = await veriOku(page);
    expect(sonra.kitaplar.length).toBe(5);
    expect(sonra.kitaplar).toEqual(once.kitaplar);
    expect(sonra.hedef).toEqual(once.hedef);
    expect(sonra.hedefSayfa).toEqual(once.hedefSayfa);
    expect(sonra.silinenler).toEqual(once.silinenler);
    expect(await page.evaluate(() => localStorage.getItem('kk_kitaplik_v1'))).toBe(lsOnce);
    const kopya = await page.evaluate(() => window.__ky.anlikOku());
    expect(kopya.veri.kitaplar).toEqual(once.kitaplar);
    expect(kopya.sonuc).toEqual({ ekle: 0, guncelle: 0, sil: 0 });
    // örnek kayıtların alanları: not, oturum, okuma, etiket, seri, ödünç
    const z1 = sonra.kitaplar.find(k => k.id === 'z1');
    expect(z1.notlar.map(n => [n.id, n.tip, n.metin, n.sayfa, n.fikir])).toEqual([['n1', 'alinti', 'İlk alıntı', 12, ['zaman']], ['n2', 'not', 'Bir not', null, []]]);
    expect(z1.okumalar).toEqual([{ bas: '2020-01-01', bit: '2020-02-01', puan: 7, not: 'ilk okuma' }]);
    expect([z1.seri, z1.ciltNo, z1.cevirmen, z1.isbn, z1.raf, z1.etiketler]).toEqual(['Seri Z', 2, 'Çevirmen Z', '9780132350884', 'Salon', ['klasik', 'favori']]);
    expect(sonra.kitaplar.find(k => k.id === 'z2').odunc).toEqual([{ kisi: 'Ali', t: '2024-03-01' }]);
    expect(sonra.kitaplar.find(k => k.id === 'z3').sahiplik).toBe('istek');
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(JSON.stringify(veri.kitaplar)))).toEqual(once.kitaplar);
  });

  test('f) özetler damga kapılı: yeni damga yazılır, eski damga yereli korur; geri alma yüklemenin yazdığı özeti kopyadaki hâline döndürür', async ({ page }) => {
    await hazirla(page);
    const damgalar = await page.evaluate(async () => {
      await window.__ozet.hazirBekle();
      await window.__ozet.kaydet('ka', 'yerel özet A');
      await window.__ozet.kaydet('kb', 'yerel özet B');
      return { a: window.__ozet.damga('ka'), b: window.__ozet.damga('kb') };
    });
    const ks = await kitaplarOku(page);
    const dosya = { surum: 2, kitaplar: ks, hedef: { 2026: 10 }, hedefG: { 2026: G0 }, silinenler: {},
      ozetler: { ka: { m: 'dosya özeti A', g: damgalar.a + 1000, o: 'dosya ontolojisi A' },
                 kb: { m: 'dosya özeti B', g: damgalar.b - 1000 },
                 yok: { m: 'kütüphanede olmayan kitabın özeti', g: damgalar.a + 5000 } } };   // yetim üretilmez
    await dosyaYukle(page, dosya, 'ozetli.json');
    await expect(page.locator('#kyOrtu .ky-ozet').nth(1)).toContainText('0 eklenecek · 0 güncellenecek · 0 silinecek · 4 aynı kalacak');
    await expect(page.locator('#kyOrtu .ky-ozet').nth(1)).toContainText('1 özet dosyadan yazılacak');
    expect(await page.evaluate(() => window.__ozet.oku('ka'))).toBe('yerel özet A');   // onaysız yazılmadı
    await page.click('#kyOrtu [data-act="ky-uygula"]');
    await expect(page.locator('#toast')).toContainText('0 silindi, 1 özet yazıldı');
    let oz = await page.evaluate(() => ({ a: window.__ozet.oku('ka'), ao: window.__ozet.okuOnto('ka'), b: window.__ozet.oku('kb'),
      yok: window.__ozet.oku('yok'), isaret: veri.kitaplar.map(k => [k.id, k.ozetVar, k.ozetUzunluk, k.ozetG]) }));
    expect(oz.a).toBe('dosya özeti A');
    expect(oz.ao).toBe('dosya ontolojisi A');
    expect(oz.b).toBe('yerel özet B');            // dosya damgası eski → yerel korundu
    expect(oz.yok).toBe('');                       // kütüphanede olmayan id'ye yazılmadı
    expect(oz.isaret.find(i => i[0] === 'ka')).toEqual(['ka', true, 'dosya özeti A'.length, damgalar.a + 1000]);
    expect(oz.isaret.find(i => i[0] === 'kb')).toEqual(['kb', true, 'yerel özet B'.length, damgalar.b]);
    const kopya = await page.evaluate(() => window.__ky.anlikOku());
    expect(kopya.ozetYazilan).toEqual(['ka']);
    expect(kopya.ozetler.ka.m).toBe('yerel özet A');
    // GERİ AL: ka kapısız kopyadaki hâline (taze damgayla), kb'ye dokunulmaz
    const t1 = Date.now();
    await page.locator('#kyGeriKart [data-act="ky-geri"]').click();
    await expect(page.locator('#kyOrtu .ky-ozet').nth(1)).toContainText('1 özet kopyadan geri gelecek');
    await page.click('#kyOrtu [data-act="ky-uygula"]');
    await expect(page.locator('#toast')).toContainText('Geri alındı — 4 kayıt işlendi: 0 eklendi, 0 güncellendi, 0 silindi, 1 özet yazıldı');
    oz = await page.evaluate(() => ({ a: window.__ozet.oku('ka'), ao: window.__ozet.okuOnto('ka'), ga: window.__ozet.damga('ka'), b: window.__ozet.oku('kb') }));
    expect(oz.a).toBe('yerel özet A');
    expect(oz.ao).toBe('');                        // yüklemenin yazdığı ontoloji de geri alındı
    expect(oz.ga).toBeGreaterThanOrEqual(t1);      // taze damga: yüklemenin damgasını yener
    expect(oz.b).toBe('yerel özet B');
  });
});
