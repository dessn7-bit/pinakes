'use strict';
const fs = require('fs');
const { test, expect, tohumla, sahteKitap, kameraTaklit,
  onaylariKabulEt, rafAc, rafYenile, ayarlarAc } = require('./yardim');

/* --------- M1: not kimliği (aynı metinli iki alıntı) --------- */
const AYNI_METIN = 'Dil, varlığın evidir.';
function ikiAyniAlinti() {
  return [
    sahteKitap({ id: 'kA', ad: 'Kitap A', yazar: 'Yazar A', eklenme: 200,
      notlar: [{ id: 'nA', tip: 'alinti', metin: AYNI_METIN, tarih: '2026-08-01', sayfa: 11, fikir: [] }] }),
    sahteKitap({ id: 'kB', ad: 'Kitap B', yazar: 'Yazar B', eklenme: 100,
      notlar: [{ id: 'nB', tip: 'alinti', metin: AYNI_METIN, tarih: '2026-08-01', sayfa: 22, fikir: [] }] })
  ];
}

test.describe('G13 M1 — not kimliği metin eşleştirmenin yerini aldı', () => {

  test('birebir aynı metinli iki alıntı: etiket DOĞRU nota gider', async ({ page }) => {
    await tohumla(page, ikiAyniAlinti());
    await rafAc(page);
    await page.click('[data-act="sekme"][data-v="alinti"]');
    await expect(page.locator('#alintiIcerik .not-kart')).toHaveCount(2);
    // ikinci kartın (nB) giriş kutusuna yaz
    const ikinci = page.locator('#alintiIcerik .not-kart[data-nid="nB"]');
    await expect(ikinci).toHaveCount(1);
    await ikinci.locator('.fikir-giris').fill('ikinci-nota');
    await ikinci.locator('[data-act="fikir-ekle"]').click();
    await expect(page.locator('#toast')).toContainText('Fikir eklendi');
    const durum = await page.evaluate(() => ({
      A: veri.kitaplar.find(k => k.id === 'kA').notlar[0].fikir,
      B: veri.kitaplar.find(k => k.id === 'kB').notlar[0].fikir
    }));
    expect(durum.B).toEqual(['ikinci-nota']);
    expect(durum.A).toEqual([]);   // birincisi etkilenmedi
  });

  test('aynı metinde kart DOĞRU kitap adıyla üretilir', async ({ page }) => {
    await tohumla(page, ikiAyniAlinti());
    await rafAc(page);
    await page.click('[data-act="sekme"][data-v="alinti"]');
    await page.locator('#alintiIcerik .not-kart[data-nid="nB"] [data-act="alinti-kart"]').click();
    await expect(page.locator('#kartOrtu')).toHaveClass(/acik/);
    const m = await page.evaluate(() => window.__kart.sonCizim());
    expect(m.altBilgi[0]).toBe('Kitap B');       // eskiden hep ilk eşleşen (Kitap A) çıkardı
    expect(m.altBilgi[1]).toContain('sf. 22');
  });

  test('not silme doğru notu siler', async ({ page }) => {
    onaylariKabulEt(page);
    await tohumla(page, ikiAyniAlinti());
    await rafAc(page);
    await page.click('#liste .kart[data-id="kB"]');
    await page.click('#detayIcerik [data-act="not-sil"]');
    const kalan = await page.evaluate(() => ({
      A: veri.kitaplar.find(k => k.id === 'kA').notlar.length,
      B: veri.kitaplar.find(k => k.id === 'kB').notlar.length
    }));
    expect(kalan).toEqual({ A: 1, B: 0 });
  });
});

/* --------- M2: raf gruplama düğmesi --------- */
/* v43 (D2): "Rafa göre" düğmesi gruplama EKSENİNE genelleşti (#grupRaf,
   Durum·Tür·Yazar·Raf satırı). Eksenler her düzende görünür; veri yoksa
   gruplama zorlanmaz, dürüst not çıkar (g37). */
test.describe('G13 M2 — raf gruplama (v43 eksen)', () => {

  test('raf ekseni her düzende görünür ve gruplamayı açıp kapatır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'K1', raf: 'üst raf' })]);
    await rafAc(page);
    await expect(page.locator('#grupRaf')).toBeVisible();
    await page.click('#duzenIzgara');
    await expect(page.locator('#grupRaf')).toBeVisible();
    await page.click('#grupRaf');
    await expect(page.locator('#grupRaf')).toHaveClass(/aktif/);
    await expect(page.locator('#liste .raf-basligi')).toHaveCount(1);
    await page.click('#grupRaf');   // aynı eksene dokunmak kapatır
    await expect(page.locator('#grupRaf')).not.toHaveClass(/aktif/);
    await expect(page.locator('#liste .raf-basligi')).toHaveCount(0);
  });

  test('gruplama açılınca raf başlıkları çizilir, rafsızlar ayrı grupta', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'Raflı Bir', raf: 'üst raf' }),
      sahteKitap({ ad: 'Raflı İki', raf: 'üst raf' }),
      sahteKitap({ ad: 'Rafsız', raf: '' })
    ]);
    await rafAc(page);
    await page.click('#duzenIzgara');
    await expect(page.locator('#liste .raf-basligi')).toHaveCount(0);
    await page.click('#grupRaf');
    await expect(page.locator('#liste .raf-basligi')).toHaveCount(2);
    await expect(page.locator('#liste .raf-basligi').first()).toContainText('raf belirtilmemiş');
    await expect(page.locator('#liste')).toContainText('üst raf · 2');
    await expect(page.locator('#liste .kart')).toHaveCount(3);
  });

  test('tercih yeniden yüklemede korunur (grup + geriye dönük rafGrupla)', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'K1', raf: 'üst raf' })]);
    await rafAc(page);
    await page.click('#duzenIzgara');
    await page.click('#grupRaf');
    await expect(page.locator('#liste .raf-basligi')).toHaveCount(1);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_gorunum_v1')).rafGrupla)).toBe(true);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_gorunum_v1')).grup)).toBe('raf');
    await rafYenile(page);
    await expect(page.locator('#liste .raf-basligi')).toHaveCount(1);
    await expect(page.locator('#grupRaf')).toHaveClass(/aktif/);
  });
});

/* --------- M3: ISBN ağ hatası teşhisi --------- */
const ISBN = '9780132350884';

test.describe('G13 M3 — ISBN ağ hatası teşhisi', () => {

  test('iki kaynak da ağ hatası → ağ mesajı çıkar, "kayıtlarda yok" ÇIKMAZ', async ({ page }) => {
    await rafAc(page);
    page.__agAyar.google = 'hata';
    page.__agAyar.olKitap = 'hata';
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    await page.fill('#barkodElle', ISBN);
    await page.click('[data-act="barkod-elle"]');
    await expect(page.locator('#olDurum')).toContainText('İnternete ulaşılamadı');
    await expect(page.locator('#olDurum')).not.toContainText('kayıtlarda yok');
  });

  test('iki kaynak da boş yanıt → "kayıtlarda yok" mesajı korunur', async ({ page }) => {
    await rafAc(page);   // varsayılan taklit: boş ama başarılı yanıt
    await page.click('.fab[data-act="yeni"]');
    await page.click('[data-act="barkod-ac"]');
    await page.fill('#barkodElle', ISBN);
    await page.click('[data-act="barkod-elle"]');
    await expect(page.locator('#olDurum')).toContainText('kayıtlarda yok');
    await expect(page.locator('#olDurum')).not.toContainText('İnternete ulaşılamadı');
  });

  test('seri taramada ağ hatası: panelde görünür uyarı, kitap eklenmez', async ({ page }) => {
    await kameraTaklit(page);
    await rafAc(page);
    page.__agAyar.google = 'hata';
    page.__agAyar.olKitap = 'hata';
    await ayarlarAc(page);
    await page.click('#ortuAyar [data-act="seri-ac"]');
    await expect(page.locator('#seriOrtu')).toHaveClass(/acik/);
    await page.evaluate(kod => { window.__sahteKod = kod; }, ISBN);
    await expect(page.locator('#seriNot')).toContainText('İnternete ulaşılamadı', { timeout: 10000 });
    await page.evaluate(() => { window.__sahteKod = null; });
    await expect(page.locator('#seriNot')).toContainText('EKLENMEDİ');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(0);
  });
});

/* --------- M4: markdown dışa aktarım --------- */
function notluKitaplar() {
  return [
    sahteKitap({ ad: 'Varlık ve Zaman', yazar: 'Martin Heidegger', notlar: [
      { id: 'x1', tip: 'alinti', metin: 'Dil, varlığın evidir.', tarih: '2026-08-01', sayfa: 42, fikir: ['varlık', 'dil felsefesi'] },
      { id: 'x2', tip: 'not', metin: 'Bu bölümü tekrar oku — şüpheli çıkarım.', tarih: '2026-08-02', sayfa: null, fikir: [] }
    ] }),
    sahteKitap({ ad: 'Ağaç Kitabı', yazar: 'Bir Yazar', notlar: [
      { id: 'x3', tip: 'alinti', metin: 'İlk satır\nikinci satır', tarih: '2026-08-03', sayfa: null, fikir: [] }
    ] })
  ];
}
async function mdIndir(page, act) {
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click(`[data-act="${act}"]`)
  ]);
  return { indirme, icerik: fs.readFileSync(await indirme.path(), 'utf8') };
}

test.describe('G13 M4 — alıntı/not markdown dışa aktarımı', () => {

  test('üretilen md kitap başlıkları ve alıntı bloklarını içerir', async ({ page }) => {
    await tohumla(page, notluKitaplar());
    await rafAc(page);
    await ayarlarAc(page);
    const { indirme, icerik } = await mdIndir(page, 'md-hepsi');
    expect(indirme.suggestedFilename()).toMatch(/^pinakes-alinti-not-.*\.md$/);
    expect(icerik).toContain('## Varlık ve Zaman — Martin Heidegger');
    expect(icerik).toContain('> Dil, varlığın evidir.');
    expect(icerik).toContain('> İlk satır\n> ikinci satır');   // çok satırlı alıntı
    expect(icerik).toContain('Bu bölümü tekrar oku');           // not düz paragraf
    expect(icerik).not.toContain('> Bu bölümü tekrar oku');
  });

  test('sadece-alıntılar seçeneği notları dışlar', async ({ page }) => {
    await tohumla(page, notluKitaplar());
    await rafAc(page);
    await ayarlarAc(page);
    const { indirme, icerik } = await mdIndir(page, 'md-alinti');
    expect(indirme.suggestedFilename()).toMatch(/^pinakes-alintilar-.*\.md$/);
    expect(icerik).toContain('Dil, varlığın evidir.');
    expect(icerik).not.toContain('Bu bölümü tekrar oku');
  });

  test('sayfa numarası ve fikir etiketleri çıkar, Türkçe bozulmaz', async ({ page }) => {
    await tohumla(page, notluKitaplar());
    await rafAc(page);
    await ayarlarAc(page);
    const { icerik } = await mdIndir(page, 'md-hepsi');
    expect(icerik).toContain('(sf. 42) #varlık #dil-felsefesi');   // boşluk tireye döndü
    expect(icerik).toContain('Ağaç Kitabı');
    expect(icerik.charCodeAt(0)).not.toBe(0xFEFF);                 // BOM yok (md editörleri için)
    expect(icerik).toMatch(/^# Pinakes/);
    expect(icerik).toContain('2 kitap');
  });

  test('hiç not yoksa anlamlı uyarı, dosya inmez', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Notsuz Kitap' })]);
    await rafAc(page);
    await ayarlarAc(page);
    let indi = false;
    page.on('download', () => { indi = true; });
    await page.click('[data-act="md-hepsi"]');
    await expect(page.locator('#toast')).toContainText('Dışa aktarılacak alıntı veya not yok');
    await page.waitForTimeout(500);
    expect(indi).toBe(false);
  });
});

/* --------- M5: paylaş hedefi --------- */
test.describe('G13 M5 — paylaş hedefinden alıntı kaydetme', () => {

  test('?text= ile açılınca panel açılır ve metin dolu gelir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Hedef Kitap' })]);
    await page.goto('/index.html?text=' + encodeURIComponent('Paylaşılan güzel bir cümle.'));
    await expect(page.locator('#ortuGelen')).toHaveClass(/acik/);
    await expect(page.locator('#gelen-metin')).toHaveValue('Paylaşılan güzel bir cümle.');
  });

  test('kitap seçip kaydedince not doğru kitaba yazılır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'h1', ad: 'Birinci Kitap' }),
      sahteKitap({ id: 'h2', ad: 'İkinci Kitap' })]);
    await page.goto('/index.html?text=' + encodeURIComponent('Kaydedilecek alıntı.') + '&url=' + encodeURIComponent('https://ornek.site/yazi'));
    await expect(page.locator('#gelen-metin')).toHaveValue(/Kaydedilecek alıntı\./);
    await expect(page.locator('#gelen-metin')).toHaveValue(/ornek\.site/);   // kaynak URL de geldi
    await page.fill('#gelen-ara', 'İkinci');
    await page.click('#gelen-liste [data-act="gelen-kitap"]');
    await expect(page.locator('#gelen-secili')).toContainText('İkinci Kitap');
    await page.fill('#gelen-sayfa', '77');
    await page.click('[data-act="gelen-kaydet"]');
    await expect(page.locator('#toast')).toContainText('Alıntı kaydedildi');
    const s = await page.evaluate(() => ({
      birinci: veri.kitaplar.find(k => k.id === 'h1').notlar.length,
      ikinci: veri.kitaplar.find(k => k.id === 'h2').notlar
    }));
    expect(s.birinci).toBe(0);
    expect(s.ikinci.length).toBe(1);
    expect(s.ikinci[0].tip).toBe('alinti');
    expect(s.ikinci[0].sayfa).toBe(77);
  });

  test('kayıttan sonra URL temizlenir, yenilemede panel AÇILMAZ', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'h1', ad: 'Tek Kitap' })]);
    await page.goto('/index.html?text=' + encodeURIComponent('Bir alıntı.'));
    await page.click('#gelen-liste [data-act="gelen-kitap"]');
    await page.click('[data-act="gelen-kaydet"]');
    await expect(page.locator('#ortuGelen')).not.toHaveClass(/acik/);
    expect(new URL(page.url()).search).toBe('');
    await rafYenile(page);
    await expect(page.locator('#ortuGelen')).not.toHaveClass(/acik/);
    expect(await page.evaluate(() => veri.kitaplar[0].notlar.length)).toBe(1); // mükerrer yok
  });

  test('parametresiz normal açılışta panel açılmaz', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Normal' })]);
    await rafAc(page);
    await expect(page.locator('#ortuGelen')).not.toHaveClass(/acik/);
  });

  test('kitap seçilmeden kaydet reddedilir', async ({ page }) => {
    await tohumla(page, [sahteKitap({ id: 'h1', ad: 'Tek Kitap' })]);
    await page.goto('/index.html?text=' + encodeURIComponent('Seçimsiz alıntı.'));
    await page.click('[data-act="gelen-kaydet"]');
    await expect(page.locator('#toast')).toContainText('Önce kitap seç');
    await expect(page.locator('#ortuGelen')).toHaveClass(/acik/);   // panel açık kaldı
    expect(await page.evaluate(() => veri.kitaplar[0].notlar.length)).toBe(0);
  });

  test('kütüphane boşken kaydetmeye izin verilmez', async ({ page }) => {
    await page.goto('/index.html?text=' + encodeURIComponent('Kitapsız alıntı.'));
    await expect(page.locator('#ortuGelen')).toHaveClass(/acik/);
    await expect(page.locator('#gelen-liste')).toContainText('Kütüphanen boş');
    await page.click('[data-act="gelen-kaydet"]');
    await expect(page.locator('#toast')).toContainText('önce kütüphanene bir kitap ekle', { ignoreCase: true });
  });
});
