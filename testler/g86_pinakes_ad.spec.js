'use strict';
/* G86 — GÖRÜNEN AD: Kitaplık → Pinakes (v89).

   KAVRAM: yalnız KULLANICIYA GÖRÜNEN ad değişti. İç kimlikler (adres, repo,
   kk_* localStorage anahtarları, kk_ozet_v1/kk_taslak_v1 IDB depoları,
   'kitaplik-v##' sw önbellek ÖNEKİ, senkron oda/KV biçimleri, worker
   adresleri, manifest start_url/scope) BİLİNÇLİ olarak AYNEN kaldı —
   değişselerdi kullanıcının 244 kitabı ve özetleri erişilemez olurdu.

   BU DOSYANIN KİLİTLEDİĞİ KARARLAR:
   - <title>, detay geri düğmesi, Ayarlar ▸ Hakkında: "Pinakes".
   - manifest: name/short_name Pinakes + description alt başlığı; start_url ve
     scope DEĞİŞMEDİ, id alanı EKLENMEDİ (eklenmesi kurulu PWA'yı ayırırdı).
   - Veri anahtarı sözleşmesi: uygulama kk_kitaplik_v1'den okur ve ORAYA yazar.
   - Yedek dosya ADI pinakes-yedek-*; İÇERİK biçimi (surum 2 + kitaplar +
     ozetler) değişmedi; ESKİ "kitaplik-yedek" dosyası yüklenebilir kalır.
   - sw.js önbellek adı 'kitaplik-v##' önekini korur; senkron/worker adresleri
     kaynakta aynen durur. */
const fs = require('fs');
const path = require('path');
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, ayarlarAc,
  dosyadanYukle } = require('./yardim');

function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
async function detayAc(page, ad) {
  await page.click('#liste .kart:has-text("' + ad + '")');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}

test.describe('G86 Pinakes — görünen ad', () => {

  test('(a) sekme başlığı, detay geri düğmesi ve Ayarlar ▸ Hakkında yeni adı taşır', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Ad Denemesi' })]);
    await rafAc(page);
    await expect(page).toHaveTitle('Pinakes');
    await detayAc(page, 'Ad Denemesi');
    await expect(page.locator('.d-geri')).toHaveText('‹ Pinakes');
    await page.click('#ortuDetay .sheet-kapat');
    await ayarlarAc(page);
    await expect(page.locator('#hkHakkinda')).toContainText('Pinakes');
    await expect(page.locator('#hkHakkinda')).toContainText('okuduklarının kataloğu ve ontolojisi');
    await expect(page.locator('#hkHakkinda'), 'adın kaynağı bir cümleyle anlatılır')
      .toContainText('Kallimakhos');
    /* g48 kilitleri bozulmadı: Hakkında dipnotu kicker/ay-bolum SAYMAZ */
    expect(await page.locator('#ortuAyar .kicker').count(), '9 bölüm kickerı aynı').toBe(9);   // v104: Okuma tipografisi
  });

  test('(b) manifest: ad/alt başlık yeni; start_url ve scope AYNEN, id alanı YOK', async ({ page }) => {
    await rafAc(page);
    const m = await page.evaluate(() => fetch('./manifest.json').then(r => r.json()));
    expect(m.name).toBe('Pinakes');
    expect(m.short_name).toBe('Pinakes');
    expect(m.description).toBe('Okuduklarının kataloğu ve ontolojisi');
    expect(m.start_url, 'adres sözleşmesi — DOKUNULMAZ').toBe('./index.html');
    expect(m.scope, 'adres sözleşmesi — DOKUNULMAZ').toBe('./');
    expect('id' in m, 'id alanı eklenmedi (kurulu PWA kimliği değişmesin)').toBe(false);
  });

  test('(c) veri anahtarı sözleşmesi: kk_kitaplik_v1 okunur/yazılır; özet IDB köprüsü yaşıyor', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Kalıcı Kitap', ozet: 'Ad değişimini atlatan özet.', ozetG: 100 })]);
    await rafAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    await expect(page.locator('#liste .kart')).toContainText('Kalıcı Kitap');
    const s = await page.evaluate(() => {
      veri.kitaplar[0].raf = 'Ad Sonrası';
      veri.kitaplar[0].g = Date.now();
      depoKaydet();
      return { yazilan: JSON.parse(localStorage.getItem('kk_kitaplik_v1')).kitaplar[0].raf,
        ozet: window.__ozet.oku(veri.kitaplar[0].id) };
    });
    expect(s.yazilan, 'uygulama AYNI anahtara yazıyor').toBe('Ad Sonrası');
    expect(s.ozet, 'özet göçü/okuma kanalı aynı').toBe('Ad değişimini atlatan özet.');
  });

  test('(d) yedek: dosya ADI pinakes-*, İÇERİK biçimi aynı; eski "kitaplik" adlı yedek yüklenir', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Yedeklenen', ozet: 'Yedek özeti', ozetG: 100 })]);
    await rafAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    await ayarlarAc(page);
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#ortuAyar [data-act="disa-aktar"]')
    ]);
    expect(indirme.suggestedFilename()).toMatch(/^pinakes-yedek-.*\.json$/);
    const icerik = JSON.parse(fs.readFileSync(await indirme.path(), 'utf8'));
    expect(icerik.surum, 'içerik biçimi DEĞİŞMEDİ').toBe(2);
    expect(icerik.kitaplar[0].ad).toBe('Yedeklenen');
    expect(icerik.ozetler[icerik.kitaplar[0].id].m).toBe('Yedek özeti');
    // eski ADLA kaydedilmiş yedek dosyası: ad süsleme, içerik sözleşme — yüklenir
    const eski = JSON.stringify({ surum: 2, kitaplar: [
      { ad: 'Eski Yedekten Gelen', yazar: 'Eski Yazar' }], hedef: {} });
    await dosyadanYukle(page,
      { name: 'kitaplik-yedek-2025-01-01.json', mimeType: 'application/json',
        buffer: Buffer.from(eski, 'utf8') }, 'birlestir');
    await expect(page.locator('#toast')).toContainText('1 kitap geri yüklendi');
    expect(await page.evaluate(() => veri.kitaplar.length)).toBe(2);
  });

  test('(f) header markası: app-title "Pinakes"; iki tonlu span deseni korunmuş (v90 — v89 kaçağı)', async ({ page }) => {
    await rafAc(page);
    /* v89 DERSİ: Kitap<span>lık</span> kaynak grep'inde "Kitaplık" olarak
       görünmüyordu; textContent parçaları BİRLEŞTİRİR — iddia tam ada. */
    await expect(page.locator('header .app-title')).toHaveText('Pinakes');
    await expect(page.locator('header .app-title span'), 'iki tonlu kesme yaşıyor').toHaveText('es');
  });

  test('(g) GÖRSEL TARAMA: render edilmiş hiçbir yüzeyde marka "Kitaplık" kalmadı (metin + nitelikler)', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Tarama Kitabı', ozet: 'Tarama özeti.', ozetG: 100 })]);
    await rafAc(page);
    await page.evaluate(() => window.__ozet.hazirBekle());
    const bulgular = [];
    const tara = async yuzey => {
      const b = await page.evaluate(() => {
        /* Marka biçimleri: "Kitaplık" / "KİTAPLIK". "kitap", "KİTAPLAR" gibi
           genel sözcükler bilerek DIŞARIDA. innerText (textContent DEĞİL):
           body'deki <script> kaynağını ve gizli panelleri katmaz, KULLANICININ
           GÖRDÜĞÜNÜ verir; etiketle bölünmüş metni (Kitap<span>lık</span> —
           v89'un grep'e yakalanmayan kaçağı) yine birleştirir. */
        const marka = /Kitaplık|K[İI]TAPLIK/;
        const sonuc = [];
        if(marka.test(document.body.innerText)) sonuc.push('görünen metin');
        for(const el of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]'))
          for(const n of ['aria-label', 'title', 'placeholder', 'alt']){
            const d = el.getAttribute(n);
            if(d && marka.test(d)) sonuc.push(n + '="' + d + '"');
          }
        return sonuc;
      });
      bulgular.push(...b.map(x => yuzey + ' → ' + x));
    };
    await tara('Kütüphane');
    await detayAc(page, 'Tarama Kitabı');
    await tara('detay');
    await page.click('#ortuDetay .sheet-kapat');
    await page.click('.fab[data-act="yeni"]');
    await tara('form');
    await page.click('[data-act="form-kapat"]');
    for(const sekme of ['ana', 'kesfet', 'alinti', 'ist']){
      await page.click('nav [data-act="sekme"][data-v="' + sekme + '"]');
      await tara(sekme);
    }
    await ayarlarAc(page);   // Hakkında dahil en son; kapatma gerekmez
    await tara('Ayarlar');
    expect(bulgular, 'render edilmiş yüzeylerde marka kalıntısı').toEqual([]);
  });

  test('(e) iç kimlikler kaynakta AYNEN: sw önbellek öneki, DEPO sabiti, senkron/worker adresleri', async () => {
    const kok = path.join(__dirname, '..');
    const sw = fs.readFileSync(path.join(kok, 'sw.js'), 'utf8');
    /* v94 adres taşıma: önek scope'tan türer — VARSAYILAN 'kitaplik' kalır
       (location'sız sandbox ve eski adres eski önekle sürer), 'pinakes' yalnız
       /pinakes/ scope'unda. Kilit yeni sözleşmeyi korur. */
    expect(sw, "önek scope'tan; varsayılan 'kitaplik' kalır (v94)")
      .toMatch(/const ONEK = SW_YOL\.indexOf\('\/pinakes\/'\) === 0 \? 'pinakes' : 'kitaplik';/);
    expect(sw, "önbellek adı ONEK + '-v##' — yalnız sürüm artar")
      .toMatch(/const CACHE = ONEK \+ '-v\d+';/);
    const index = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
    expect(index, 'DEPO anahtarı değişmedi').toContain("const DEPO = 'kk_kitaplik_v1'");
    expect(index, 'arama worker adresi değişmedi')
      .toContain("https://kitaplik-ara.dessn7.workers.dev");
    const senkron = fs.readFileSync(path.join(kok, 'senkron.js'), 'utf8');
    expect(senkron, 'senkron RTDB adresi değişmedi')
      .toContain('kitaplik-sync-default-rtdb');
    const bildirim = fs.readFileSync(path.join(kok, 'bildirim.js'), 'utf8');
    expect(bildirim, 'bildirim worker adresi değişmedi')
      .toContain('https://kitaplik-bildirim.dessn7.workers.dev');
  });
});
