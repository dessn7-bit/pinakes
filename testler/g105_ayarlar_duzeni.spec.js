'use strict';
/* G105 — AYARLAR DÜZENİ (v106): 4 katlı grup + salt-okur durum şeridi.

   KAVRAM: Ayarlar 9 düz bölümdü, 8,7 ekran kaydırıyordu ve üç ayrı cins işi
   tek listede tutuyordu — AYARLADIĞIN (tema, tipografi, senkron, hatırlatma),
   ÇALIŞTIRDIĞIN (tara, içe aktar; bunlar fiil), BAKTIĞIN (depolama sayaçları).

   BU DOSYANIN KİLİTLEDİĞİ KARARLAR:
   - Dört grup, sabit sıra, hepsi KAPALI açılır → panel tek ekrana sığar.
     Sıra gerekçesi SIKLIK x RİSK: en sık dokunulan üstte, yıkıcı en altta.
   - DURUM ŞERİDİ KATLANMAZ (Kaan kararı): "baktığın şeyler" kapağın arkasında
     durmaz. İçinde YALNIZ senkron + depolama var; hatırlatma BİLEREK yok
     (kurulduktan sonra merak edilen bir bilgi değil).
   - Şerit SALT-OKUR: senkron kontrolleri "Bu cihaz" grubunun içinde kalır.
   - Şeridin cümlesi kendi dili ama VERİSİ senkron.js durumOzet'ten gelir —
     pencere içi uzun cümleyle şerit sapmasın.
   - Tehlikeli bölge kendi kapağını taşır (zaten <details>); üstüne ikinci
     kapak konmadı, yoksa iki tıkla açılırdı. */
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc } = require('./yardim');

const KITAP = () => sahteKitap({ ad: 'Duzen Kitabi', yazar: 'Yazar' });

/* HAM açılış: ortak ayarlarAc yardımcısı grupları AÇAR (v106 öncesi vakaların
   görünürlük beklentisi korunsun diye), bu yüzden varsayılan durumu sınayan
   vakalar pencereyi doğrudan açar. */
async function hamAc(page, ek) {
  await tohumla(page, [KITAP()], ek);
  await rafAc(page);
  await page.click('header [data-act="ayar-ac"]');
  await expect(page.locator('#ortuAyar')).toHaveClass(/acik/);
}

test.describe('G105 ayarlar düzeni', () => {
  test('(a) dört grup, sabit sıra, hepsi kapalı açılır', async ({ page }) => {
    await hamAc(page);
    const g = await page.evaluate(() =>
      [...document.querySelectorAll('#ortuAyar details.ayg-grup')]
        .map(x => ({ id: x.id, acik: x.open, bas: x.querySelector('.ayg-ust').textContent.trim() })));
    expect(g.map(x => x.id)).toEqual(['aygGorunum', 'aygCihaz', 'aygVeri']);
    expect(g.map(x => x.bas)).toEqual(['Görünüm ve okuma', 'Bu cihaz', 'Kütüphane verisi']);
    expect(g.every(x => !x.acik), 'kapalı açılır').toBe(true);
    /* Tehlikeli bölge dördüncü grup: kendi <details>'i, en altta, kapalı. */
    const t = await page.evaluate(() => {
      const d = document.getElementById('ayBolumTehlike');
      const hepsi = [...document.querySelectorAll('#ortuAyar .ay-bolum')];
      return { sonuncu: hepsi[hepsi.length - 1].id === 'ayBolumTehlike',
               katli: d.tagName === 'DETAILS', acik: d.open };
    });
    expect(t).toEqual({ sonuncu: true, katli: true, acik: false });
  });

  test('(b) kapalıyken panel tek ekrana sığar', async ({ page }) => {
    await hamAc(page);
    await page.setViewportSize({ width: 390, height: 820 });
    await page.waitForTimeout(200);
    const o = await page.evaluate(() => {
      const sh = document.querySelector('#ortuAyar .sheet');
      return { kaydirma: sh.scrollHeight, gorunur: sh.clientHeight };
    });
    /* v106 öncesi 8,7 ekrandı. Eşik 1,5: küçük içerik dalgalanmasına yer var
       ama gruplama çözülürse (biri açık kalırsa) vaka kırmızıya döner. */
    expect(o.kaydirma / o.gorunur, 'kapalı panel ~1 ekran').toBeLessThan(1.5);
  });

  test('(c) grup açılıp kapanır, içindeki bölümler görünür olur', async ({ page }) => {
    await hamAc(page);
    await expect(page.locator('#ayBolumTipografi .tp-chip').first()).toBeHidden();
    await page.click('#aygGorunum summary.ayg-bas');
    await expect(page.locator('#ayBolumTipografi .tp-chip').first()).toBeVisible();
    await expect(page.locator('#ayBolumGorunum .tm-dugme').first()).toBeVisible();
    await page.click('#aygGorunum summary.ayg-bas');
    await expect(page.locator('#ayBolumTipografi .tp-chip').first()).toBeHidden();
  });

  test('(d) durum şeridi KATLANMAZ — gruplar kapalıyken de görünür', async ({ page }) => {
    await hamAc(page, { kk_senkron_v1: { oda: 'testodasi', cihaz: 'Cihaz', sonSenkron: Date.now() } });
    await expect(page.locator('#aydSerit')).toBeVisible();
    await page.waitForSelector('#aydSerit .ayd-satir');
    /* Şerit hiçbir <details> içinde OLMAMALI — katlanabilir bir ataya
       taşınırsa bu vaka kırmızıya döner. */
    const katliIcinde = await page.evaluate(() =>
      !!document.getElementById('aydSerit').closest('details'));
    expect(katliIcinde, 'şerit katlanabilir bir atanın içinde değil').toBe(false);
    const satir = await page.locator('#aydSerit .ayd-satir').count();
    expect(satir, 'iki satır: senkron + depolama').toBe(2);
  });

  test('(e) şerit senkron durumunu okur; BAĞLI ve KAPALI ayrı dil kurar', async ({ page }) => {
    await hamAc(page, { kk_senkron_v1: { oda: 'testodasi', cihaz: 'Cihaz', sonSenkron: Date.now() } });
    await page.waitForSelector('#aydSerit .ayd-satir');
    const bagli = await page.locator('#aydSerit .ayd-satir').first().textContent();
    expect(bagli).toContain('Bağlı');
    expect(bagli).toContain('testodasi');
    expect(await page.locator('#aydSerit .ayd-satir').first()
      .evaluate(e => e.classList.contains('ayd-kopuk')), 'bağlıyken kopuk değil').toBe(false);

    /* senkron KAPALI: ayrı cümle + kopuk işaret */
    await page.evaluate(() => localStorage.removeItem('kk_senkron_v1'));
    await page.reload();
    await rafAc(page);
    await page.click('header [data-act="ayar-ac"]');
    await page.waitForSelector('#aydSerit .ayd-satir');
    const kapali = await page.locator('#aydSerit .ayd-satir').first().textContent();
    expect(kapali).toContain('kapalı');
    expect(kapali).not.toContain('Bağlı ·');
    expect(await page.locator('#aydSerit .ayd-satir').first()
      .evaluate(e => e.classList.contains('ayd-kopuk')), 'kapalıyken kopuk').toBe(true);
  });

  test('(f) şerit depolamayı okur ve küçük boyutu KB gösterir', async ({ page }) => {
    await hamAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    const id = await page.evaluate(() => veri.kitaplar[0].id);
    await page.evaluate(([i, o]) => window.__ozet.kaydet(i, o), [id, 'Ozet metni. '.repeat(60)]);
    await page.evaluate(() => aydSeritCiz());
    await page.waitForTimeout(200);
    const depo = await page.locator('#aydSerit .ayd-satir').nth(1).textContent();
    expect(depo).toContain('özet');
    expect(depo).toContain('kapak');
    /* 0,00 MB hiçliği anlatırdı — 1 MB altı KB/B olmalı. */
    expect(depo, 'küçük boyut "0,00 MB" yazmaz').not.toContain('0,00 MB');
  });

  test('(g) şerit SALT-OKUR: içinde eylem yok, kontroller grubun içinde', async ({ page }) => {
    await hamAc(page, { kk_senkron_v1: { oda: 'testodasi', cihaz: 'Cihaz', sonSenkron: Date.now() } });
    await page.waitForSelector('#aydSerit .ayd-satir');
    expect(await page.locator('#aydSerit button, #aydSerit [data-act]').count(),
      'şeritte eylem yok').toBe(0);
    /* kontroller "Bu cihaz" grubunun içinde duruyor */
    await page.click('#aygCihaz summary.ayg-bas');
    await expect(page.locator('#aygCihaz [data-act="senkron-simdi"]')).toBeVisible();
  });

  test('(h) aktarım yöne göre ayrıldı, zenginleştirme birleşti', async ({ page }) => {
    await tohumla(page, [KITAP()]);
    await rafAc(page);
    await ayarlarAc(page);   // gruplar açık gelir
    /* Dışa aktar YALNIZ dışarı giden yolları taşır */
    const disa = await page.evaluate(() =>
      [...document.querySelectorAll('#ayBolumDisa [data-act]')].map(e => e.dataset.act));
    expect(disa.sort()).toEqual(['csv-aktar', 'disa-aktar', 'md-alinti', 'md-hepsi']);
    /* İçe aktar dosya borularının hepsini taşır */
    const ice = await page.evaluate(() =>
      [...document.querySelectorAll('#ayBolumIce [data-act]')].map(e => e.dataset.act));
    for (const a of ['gr-aktar', 'ice-aktar', 'zg-tur-hazir', 'zg-tur-ice', 'zg-adtr-hazir',
                     'zg-ozet-ice', 'zg-not-ice', 'ky-ice'])
      expect(ice, 'İçe aktar: ' + a).toContain(a);
    /* Katalog araçları Zenginleştir'e katıldı; yuvası KORUNDU (eklentiler oraya yazıyor) */
    await expect(page.locator('#ayBolumZengin #ayYuvaKatalog')).toHaveCount(1);
    await expect(page.locator('#ayBolumZengin [data-act="seri-ac"]')).toHaveCount(1);
    await expect(page.locator('#ayBolumZengin [data-act="zg-tara"]')).toHaveCount(1);
    await expect(page.locator('#ayBolumKatalog')).toHaveCount(0);
    await expect(page.locator('#ayBolumAktarim')).toHaveCount(0);
  });
});
