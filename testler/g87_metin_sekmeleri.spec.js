'use strict';
/* G87 — ÖZET/ONTOLOJİ SEKMELERİ (v89).

   KAVRAM: detaydaki iki uzun metin bloğu (özet ort. ~660, ontoloji ~410 kelime)
   alt alta dizilmek yerine TEK bölgede sekme oldu: [Özetin][Ontoloji].

   BU DOSYANIN KİLİTLEDİĞİ KARARLAR:
   - Şerit YALNIZ ontoloji varken çizilir (244 kitabın 143'ünde ontoloji yok —
     boş sekme durmaz). Yalnız özet → şeritsiz doğrudan özet + "+ Ontoloji yaz"
     ghost'u (yazma yolu korunur). İkisi boş → yalnız "+ Özetini yaz" (eski).
   - Yalnız ontoloji (içe aktarımla mümkün) → şerit, Ontoloji seçili; Özet
     sekmesi "+ Özetini yaz" ghost'u taşır.
   - 600 kırpma + "Devamını göster" KALKTI: metin sekmede TAM.
   - Sekme geçişi YALNIZ metin bloğunu değiştirir — sheet scroll'u OYNAMAZ.
   - Düzenleme açıkken geçiş ENGELLİ (toast) — kaydedilmemiş metin kaybolmaz.
     KARAR: "uyar ve geç" değil "engelle" (tek dokunuşluk veri kaybı riski yok).
   - durum.metinSekme her taze açılışta sıfırlanır — seçim kitaptan kitaba
     taşınmaz.
   - ARIA: role=tablist/tab/tabpanel + aria-selected; sekmeler gerçek <button>
     (klavyeyle gezilir), dokunma hedefi ≥44px (ms-sekme min-height). */
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, rafaGec } = require('./yardim');

function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
async function detayAc(page, ad) {
  await page.click('#liste .kart:has-text("' + ad + '")');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}
async function ozetHazir(page) {
  await page.evaluate(() => window.__ozet.hazirBekle());
}
async function ontoYaz(page, id, metin) {
  await page.evaluate(([i, m]) => window.__ozet.kaydetOnto(i, m), [id, metin]);
}
const UZUN_OZET = 'Özet başı. ' + 'özet dolgusu '.repeat(80) + 'ÖZET SONU';
const UZUN_ONTO = 'Onto başı. ' + 'kavram dolgusu '.repeat(80) + 'ONTO SONU';

test.describe('G87 metin sekmeleri', () => {

  test('(A) iki alan dolu: şerit + varsayılan Özet + TAM metin + ARIA nitelikleri; tek panel', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'cift1', ad: 'Çift Metinli', ozet: UZUN_OZET, ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await ontoYaz(page, 'cift1', UZUN_ONTO);
    await detayAc(page, 'Çift Metinli');
    await expect(page.locator('#dMetinBlok [role="tablist"]')).toBeVisible();
    await expect(page.locator('#msSekmeOzet')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#msSekmeOnto')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#dOzetBlok')).toHaveAttribute('role', 'tabpanel');
    // kırpma kalktı: >600 karakter tek seferde tam
    await expect(page.locator('.oz-metin')).toContainText('ÖZET SONU');
    await expect(page.locator('[data-act="oz-devam"]')).toHaveCount(0);
    // tek panel: seçili olmayan sekmenin metni DOM'da değil
    await expect(page.locator('.onto-metin')).toHaveCount(0);
  });

  test('(B) geçiş yalnız metin bloğunu değiştirir: panel döner, scroll OYNAMAZ', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'cift2', ad: 'Kaydırmalı', ozet: UZUN_OZET, ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await ontoYaz(page, 'cift2', UZUN_ONTO);
    await detayAc(page, 'Kaydırmalı');
    await page.evaluate(() => document.getElementById('dMetinBlok').scrollIntoView());
    const olc = () => page.evaluate(() => ({
      ortu: document.getElementById('ortuDetay').scrollTop,
      sheet: document.querySelector('#ortuDetay .sheet').scrollTop,
      pencere: Math.round(window.scrollY) }));
    const once = await olc();
    await page.click('#msSekmeOnto');
    await expect(page.locator('.onto-metin')).toContainText('ONTO SONU');
    await expect(page.locator('.oz-metin')).toHaveCount(0);
    await expect(page.locator('#msSekmeOnto')).toHaveAttribute('aria-selected', 'true');
    expect(await olc(), 'sekme geçişi sayfayı kaydırmadı').toEqual(once);
    // geri dön: özet paneli aynı kapıdan
    await page.click('#msSekmeOzet');
    await expect(page.locator('.oz-metin')).toContainText('ÖZET SONU');
  });

  test('(C) yalnız özet: şerit YOK, özet doğrudan + "+ Ontoloji yaz" ghost; ikisi boş: yalnız özet ghost', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Yalnız Özetli', ozet: UZUN_OZET, ozetG: 100 }),
      bitmis({ ad: 'Bomboş Kitap' })]);
    await rafAc(page);
    await ozetHazir(page);
    await detayAc(page, 'Yalnız Özetli');
    await expect(page.locator('#ortuDetay [role="tablist"]')).toHaveCount(0);
    await expect(page.locator('#dOzetBlok .oz-metin')).toContainText('ÖZET SONU');
    await expect(page.locator('.onto-bos .onto-ghost')).toHaveText('+ Ontoloji yaz');
    await page.click('#ortuDetay .sheet-kapat');
    await detayAc(page, 'Bomboş Kitap');
    await expect(page.locator('#ortuDetay [role="tablist"]')).toHaveCount(0);
    await expect(page.locator('.oz-bos .oz-ghost')).toHaveText('+ Özetini yaz');
    await expect(page.locator('.onto-bos')).toHaveCount(0);
  });

  test('(D) yalnız ontoloji: şerit var, Ontoloji seçili açılır; Özet sekmesi ghost taşır', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'salt1', ad: 'Salt Ontolojili' })]);
    await rafAc(page);
    await ozetHazir(page);
    await ontoYaz(page, 'salt1', 'İçe aktarımdan gelen salt ontoloji.');
    await detayAc(page, 'Salt Ontolojili');
    await expect(page.locator('#msSekmeOnto')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.onto-metin')).toContainText('salt ontoloji');
    await page.click('#msSekmeOzet');
    await expect(page.locator('#dOzetBlok .oz-ghost')).toHaveText('+ Özetini yaz');
  });

  test('(E) düzenleme açıkken geçiş ENGELLİ: toast, metin korunur; Vazgeç sonrası geçiş çalışır', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'cift3', ad: 'Düzenlemeli', ozet: 'Kısa özet.', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await ontoYaz(page, 'cift3', 'Kısa ontoloji.');
    await detayAc(page, 'Düzenlemeli');
    await page.click('#dMetinBlok [data-act="oz-ac"]');
    await page.fill('#ozMetin', 'Kaydedilmemiş taze metin');
    await page.click('#msSekmeOnto');
    await expect(page.locator('#toast')).toContainText('kaybolmasın');
    await expect(page.locator('#ozMetin'), 'yazılan metin duruyor').toHaveValue('Kaydedilmemiş taze metin');
    await expect(page.locator('#msSekmeOzet')).toHaveAttribute('aria-selected', 'true');
    await page.click('[data-act="oz-vazgec"]');
    await page.click('#msSekmeOnto');
    await expect(page.locator('.onto-metin')).toContainText('Kısa ontoloji');
  });

  test('(F) seçim taşınmaz: Ontoloji açıkken kapat-aç → Özet; başka kitaba geçiş de sıfırlar', async ({ page }) => {
    await tohumla(page, [
      bitmis({ id: 'cift4', ad: 'Birinci Kitap', ozet: 'Özet bir.', ozetG: 100 }),
      bitmis({ id: 'cift5', ad: 'İkinci Kitap', ozet: 'Özet iki.', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await ontoYaz(page, 'cift4', 'Onto bir.');
    await ontoYaz(page, 'cift5', 'Onto iki.');
    await detayAc(page, 'Birinci Kitap');
    await page.click('#msSekmeOnto');
    await expect(page.locator('.onto-metin')).toContainText('Onto bir');
    await page.click('#ortuDetay .sheet-kapat');
    // aynı kitabı yeniden aç: taze açılış → Özet
    await detayAc(page, 'Birinci Kitap');
    await expect(page.locator('#msSekmeOzet')).toHaveAttribute('aria-selected', 'true');
    await page.click('#msSekmeOnto');
    await page.click('#ortuDetay .sheet-kapat');
    // başka kitap: önceki seçim taşınmaz
    await detayAc(page, 'İkinci Kitap');
    await expect(page.locator('#msSekmeOzet')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.oz-metin')).toContainText('Özet iki');
  });

  test('(G) dokunma hedefi ≥44px; sekme klavyeyle çalışır (odak + Enter)', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'cift6', ad: 'Erişilebilir', ozet: 'Özet metni.', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await ontoYaz(page, 'cift6', 'Ontoloji metni.');
    await detayAc(page, 'Erişilebilir');
    const kutu = await page.locator('#msSekmeOzet').boundingBox();
    expect(kutu.height, '44px dokunma hedefi').toBeGreaterThanOrEqual(44);
    await page.locator('#msSekmeOnto').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.onto-metin')).toContainText('Ontoloji metni');
    // geçiş sonrası odak yeni seçili sekmede (outerHTML eskisini yok etti)
    await expect(page.locator('#msSekmeOnto')).toBeFocused();
  });

  test('(H) şeritte düzenleme akışı: Ontoloji sekmesinde Düzenle→Kaydet; ghost yolundan yeni ontoloji şeridi doğurur', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'cift7', ad: 'Akış Kitabı', ozet: 'Akış özeti.', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await detayAc(page, 'Akış Kitabı');
    // özet-only: ghost'tan ontoloji yaz → onto-ac sekmeyi Ontoloji'ye indirir
    await page.click('.onto-bos [data-act="onto-ac"]');
    await page.fill('#ontoMetin', 'İlk ontoloji metni.');
    await page.click('[data-act="onto-kaydet"]');
    await expect(page.locator('#dMetinBlok .ms-sekme.ms-secili')).toHaveText('Ontoloji');
    await expect(page.locator('.onto-metin')).toContainText('İlk ontoloji metni');
    // şeritte Düzenle → değiştir → kaydet; özet öbür sekmede aynen
    await page.click('#dMetinBlok [data-act="onto-ac"]');
    await expect(page.locator('#ontoMetin')).toHaveValue('İlk ontoloji metni.');
    await page.fill('#ontoMetin', 'Güncel ontoloji metni.');
    await page.click('[data-act="onto-kaydet"]');
    await expect(page.locator('.onto-metin')).toContainText('Güncel ontoloji metni');
    await page.click('#msSekmeOzet');
    await expect(page.locator('.oz-metin')).toContainText('Akış özeti');
  });
});
