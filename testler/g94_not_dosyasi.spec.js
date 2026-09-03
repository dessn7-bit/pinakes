'use strict';
/* G94 — NOT DOSYASI içe aktarımı (v98). Özet dosyası kalıbının eşi:
   { "surum": 1, "not": [ {ad, yazar, metin, tip} ] } → ad+yazar katla eşleme →
   önizleme → onay → YALNIZ EKLEME. Mevcut not/alıntı asla silinmez/değişmez;
   aynı kitapta aynı metin (katla) yeniden eklenmez ("zaten vardı"); eşleşmeyen
   satır yazılmaz, listelenir; tip yalnız not|alinti, başkası atlanır ve sayılır.
   Eklenen kayıt mevcut not şemasıyla birebir (id/tip/metin/tarih + ng damgası). */
const { test, expect, tohumla, sahteKitap, rafAc, ayarlarAc } = require('./yardim');
const fs = require('fs');
const path = require('path');

const ESKI_NOT = { id: 'eski1', tip: 'not', metin: 'eski not', tarih: '2024-01-01', sayfa: 12, ng: 5 };
function kitaplik() {
  return [
    sahteKitap({ ad: 'Kitap A', yazar: 'Yazar A', notlar: [ESKI_NOT], puan: 8 }),
    sahteKitap({ ad: 'Kitap B', yazar: 'Yazar B', notlar: [] })];
}
const DOSYA = { surum: 1, not: [
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'Yeni alıntı A', tip: 'alinti' },
  { ad: 'KİTAP A', yazar: 'yazar a', metin: 'İkinci not', tip: 'not' },          // katla eşleşmesi
  { ad: 'Kitap B', yazar: 'Yazar B', metin: 'B notu', tip: 'not' },
  { ad: 'Olmayan Kitap', yazar: 'Kimse', metin: 'boşa gider', tip: 'not' },      // eşleşmeyen
  { ad: 'Kitap B', yazar: 'Yazar B', metin: 'yorum satırı', tip: 'yorum' },     // tip bozuk
  { ad: 'Kitap A', yazar: 'Yazar A', metin: '   ', tip: 'not' },                 // eksik alanlı
  { ad: 'Kitap A', yazar: 'Yazar A', metin: 'ESKİ NOT', tip: 'not' }             // zaten var (katla)
] };
async function dosyaYukle(page, govde, ad) {
  await page.click('[data-act="zg-not-ice"]');
  await page.setInputFiles('#zgNotDosya', { name: ad || 'notlar.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(govde), 'utf8') });
}
async function hazirla(page) {
  await tohumla(page, kitaplik());
  await rafAc(page);
  await ayarlarAc(page);
}
const notlarOku = page => page.evaluate(() => veri.kitaplar.map(k => ({
  ad: k.ad, g: k.g, puan: k.puan,
  notlar: (k.notlar || []).map(n => ({ id: n.id, tip: n.tip, metin: n.metin, tarih: n.tarih, sayfa: n.sayfa, ng: n.ng })) })));

test.describe('G94 not dosyası içe aktarımı (v98)', () => {

  test('a+c+d) önizleme sayıları; onaysız yazım yok; ekleme sonrası eski not YERİNDE, eşleşmeyen/bozuk yazılmaz', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, DOSYA);
    await expect(page.locator('#zgNotIceOrtu')).toHaveClass(/acik/);
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('3 not eklenecek (2 kitap)');
    await expect(ozet).toContainText('1 satır zaten vardı');
    await expect(ozet).toContainText('1 satır eşleşmedi');
    await expect(ozet).toContainText('1 satır tip alanı bozuk');
    await expect(ozet).toContainText('1 satır eksik alanlı');
    await expect(page.locator('#zgNotIceOrtu')).toContainText('Olmayan Kitap');   // eşleşmeyen listelendi
    // ÖNİZLEME ONAYI OLMADAN HİÇBİR ŞEY YAZILMADI
    let d = await notlarOku(page);
    expect(d[0].notlar.length).toBe(1);
    expect(d[1].notlar.length).toBe(0);
    await page.click('[data-act="zg-not-uygula"]');
    await expect(page.locator('#toast')).toContainText('3 not dosyadan eklendi (2 kitap)');
    await expect(page.locator('#zgNotIceOrtu')).not.toHaveClass(/acik/);
    d = await notlarOku(page);
    // eski not ilk sırada, birebir korundu
    expect(d[0].notlar[0]).toEqual(ESKI_NOT);
    expect(d[0].notlar.map(n => n.metin)).toEqual(['eski not', 'Yeni alıntı A', 'İkinci not']);
    expect(d[0].notlar[1].tip).toBe('alinti');
    expect(d[0].notlar[2].tip).toBe('not');
    expect(d[1].notlar.map(n => n.metin)).toEqual(['B notu']);            // 'yorum satırı' YOK
    // şema mevcut notla birebir: id, tarih (bugün), sayfa null, ng damgası; k.g kullanıcı eylemi
    const yeni = d[0].notlar[1];
    expect(yeni.id).toMatch(/^[a-z0-9]{8,}$/);
    expect(yeni.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(yeni.sayfa).toBeNull();
    expect(yeni.ng).toBeGreaterThan(0);
    expect(d[0].g).toBeGreaterThan(0);
    expect(d[0].puan, 'başka alana dokunulmaz').toBe(8);
    // yenilemede kalıcı (kitapNormalize notları taşır) → JSON yedeği/senkron aynı diziyi görür
    await page.reload();
    const d2 = await notlarOku(page);
    expect(d2[0].notlar.map(n => n.metin)).toEqual(['eski not', 'Yeni alıntı A', 'İkinci not']);
    expect(d2[0].notlar[1].ng).toBe(yeni.ng);
  });

  test('b) aynı dosya ikinci kez: hiçbir şey eklenmez, "zaten vardı" sayar, yaz düğmesi yok', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, DOSYA);
    await page.click('[data-act="zg-not-uygula"]');
    await expect(page.locator('#toast')).toContainText('3 not dosyadan eklendi');
    const once = await notlarOku(page);
    await dosyaYukle(page, DOSYA);
    await expect(page.locator('#zgNotIceOrtu')).toHaveClass(/acik/);
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('4 satır zaten vardı');          // 3 eklenen + eski not satırı
    await expect(ozet).not.toContainText('eklenecek');
    await expect(page.locator('[data-act="zg-not-uygula"]')).toHaveCount(0);
    await page.click('[data-act="zg-not-vazgec"]');
    await expect(page.locator('#toast')).toContainText('Vazgeçildi');
    const sonra = await notlarOku(page);
    expect(sonra).toEqual(once);
  });

  test('vazgeç: hiçbir şey yazılmaz; biçimsiz dosya: dürüst mesaj', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, DOSYA);
    await expect(page.locator('#zgNotIceOrtu')).toHaveClass(/acik/);
    await page.click('[data-act="zg-not-vazgec"]');
    await expect(page.locator('#toast')).toContainText('Vazgeçildi — hiçbir şey yazılmadı');
    const d = await notlarOku(page);
    expect(d[0].notlar.length).toBe(1);
    expect(d[1].notlar.length).toBe(0);
    await dosyaYukle(page, { surum: 1, ozet: [{ ad: 'Kitap A', yazar: 'Yazar A', ozet: 'x' }] }, 'yanlis.json');
    await expect(page.locator('#toast')).toContainText('Bu dosyada not listesi yok');
    await expect(page.locator('#zgNotIceOrtu')).not.toHaveClass(/acik/);
  });

  test('yalnız eşleşmeyen satırlar: yaz düğmesi yok, sıfır yazım', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, { surum: 1, not: [
      { ad: 'Yok Bir', yazar: 'Kimse', metin: 'a', tip: 'not' },
      { ad: 'Yok İki', yazar: 'Kimse', metin: 'b', tip: 'alinti' }] });
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('2 satır eşleşmedi');
    await expect(page.locator('[data-act="zg-not-uygula"]')).toHaveCount(0);
    await expect(page.locator('#zgNotIceOrtu')).toContainText('Yok İki');
    const d = await notlarOku(page);
    expect(d[0].notlar.length + d[1].notlar.length).toBe(1);
  });

  test('dosya içi tekrar ve tip yazımı: "Alıntı"/"NOT" kabul, tekrar satır zaten vardı sayılır', async ({ page }) => {
    await hazirla(page);
    await dosyaYukle(page, { surum: 1, not: [
      { ad: 'Kitap B', yazar: 'Yazar B', metin: 'Tekrarlı metin', tip: 'Alıntı' },
      { ad: 'Kitap B', yazar: 'Yazar B', metin: 'tekrarli METİN', tip: 'NOT' }] });
    const ozet = page.locator('#zgNotIceOrtu .zg-ozet');
    await expect(ozet).toContainText('1 not eklenecek (1 kitap)');
    await expect(ozet).toContainText('1 satır zaten vardı');
    await page.click('[data-act="zg-not-uygula"]');
    const d = await notlarOku(page);
    expect(d[1].notlar.map(n => [n.tip, n.metin])).toEqual([['alinti', 'Tekrarlı metin']]);
  });

  test('ayar metni + sürüm kilidi (sw sürümü kaynaktan, g91 deseni)', async ({ page }) => {
    await rafAc(page);
    await ayarlarAc(page);
    const b = page.locator('#ortuAyar');
    await expect(b).toContainText('Not dosyası');
    await expect(b).toContainText('Dışarıda hazırlanan not ve alıntı dosyasını toplu yükler');
    await expect(b).toContainText('yalnızca ekleme yapar, var olan notlarına dokunmaz');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const swN = Number((sw.match(/const CACHE = ONEK \+ '-v(\d+)'/) || [])[1]);
    expect(swN).toBeGreaterThanOrEqual(98);
    // kaynak kilidi: yazım yolu YALNIZ push — splice/silme/değiştirme yok
    const z = fs.readFileSync(path.join(__dirname, '..', 'zengin.js'), 'utf8');
    const govde = z.slice(z.indexOf('function iceNotUygula('), z.indexOf('function notDosyaKur('));
    expect(govde).toContain('k.notlar.push(');
    expect(govde).not.toMatch(/notlar\s*=\s*\[|splice|filter\(|\.metin\s*=/);
  });
});
