'use strict';
/* G56 — TÜR LİSTESİ İÇE AKTARIMI (v67): yalnız tür alanına dokunan yükleme.

   SÖZLEŞMELER (bu dosyanın koruduğu):
   - {surum, tur:[{ad,yazar,tur}]} dosyası ad+yazar TR-katlamalı eşlenir,
     YALNIZ tür alanı yazılır — puan/sayfa/durum/notlar/bitisTarihi/kapak
     hiçbiri değişmez.
   - Dolu tür dosyadaki değerle DEĞİŞİR ama önizlemede AYRI sayılır.
   - TAKSONOMİ KAPISI: /turler'de olmayan tür atlanır + raporlanır; çevrimdışı
     (taksonomi doğrulanamıyor) → içe aktarım hiç başlamaz, sıfır yazım.
   - ÖNİZLEME ZORUNLU: onaysız tek bayt yazılmaz; Vazgeç iz bırakmaz.
   - Yazım k.g senkron damgası basar; kitap denendi defterine girer (açılış
     taraması yeniden sormaz) ama otomatik-atanan defterine GİRMEZ.
   - Bozuk JSON / eşleşmeyen kayıt: dürüst mesaj, çökme yok.

   (Mutasyon 1: taksonomi kapısı kaldırılır → taksonomi-dışı vakası kırmızı.
    Mutasyon 2: uygulamada tür dışında bir alana da yazılır → koruma vakası
    kırmızı.) */
const { test, expect, tohumla, sahteKitap, ayarlarAc, dosyadanYukle } = require('./yardim');

const TURLER = [
  { seo: 'Tiyatro', ad: 'Tiyatro', kitapSayisi: 1200 },
  { seo: 'Hikaye-Oyku', ad: 'Hikaye (Öykü)', kitapSayisi: 9508 },
  { seo: 'Gezi', ad: 'Gezi', kitapSayisi: 660 },
  { seo: 'Bilim-Kurgu', ad: 'Bilim-Kurgu', kitapSayisi: 3000 }
];
function dosya(kayitlar) {
  return {
    name: 'kitaplik-turler.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ surum: 1, tur: kayitlar }), 'utf8')
  };
}
/* v109: Dosya seç → ALGILAMA KARTI → onay → önizleme. Tek giriş olduğu için
   boruyu artık düğme değil dosyanın kök anahtarı ("tur") seçiyor. */
async function yukle(page, kayitlar) {
  await ayarlarAc(page);
  await dosyadanYukle(page, dosya(kayitlar));
}

test.describe('G56 tür listesi içe aktarımı', () => {

  test('geçerli dosya: önizleme → onay → eşleşen kitapların türü yazılır + damga', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' }),
      sahteKitap({ ad: 'Palto', yazar: 'Nikolai Gogol' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await yukle(page, [
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' },
      { ad: 'Palto', yazar: 'Nikolai Gogol', tur: 'Hikaye (Öykü)' }]);
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('2');
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('boş tür dolacak');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('2 kitabın türü dosyadan yazıldı');
    const d = await page.evaluate(() => veri.kitaplar.map(k => ({ tur: k.tur, g: k.g })));
    expect(d.map(x => x.tur).sort()).toEqual(['Hikaye (Öykü)', 'Tiyatro']);
    d.forEach(x => expect(x.g, 'senkron damgası basıldı').toBeGreaterThan(0));
    // kalıcı: depoya da düştü
    const depo = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_kitaplik_v1')));
    expect(depo.kitaplar.map(k => k.tur).sort()).toEqual(['Hikaye (Öykü)', 'Tiyatro']);
  });

  test('YALNIZ tür değişir: puan/sayfa/durum/notlar/bitişTarihi/kapak BOZULMAZ', async ({ page }) => {
    const k = sahteKitap({ ad: 'Erzurum Yolculuğu', yazar: 'Alexandr Puškin',
      durum: 'bitti', puan: 9, sayfa: 120, bitisTarihi: '2026-05-01', kapak: 'https://covers.openlibrary.org/b/id/1-M.jpg',
      guncelSayfa: 120, etiketler: ['klasik'],
      notlar: [{ id: 'n1', tip: 'alinti', metin: 'yol notu', t: 1754000000000 }] });
    await tohumla(page, [k]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    const once = await page.evaluate(() => JSON.parse(JSON.stringify(veri.kitaplar[0])));
    await yukle(page, [{ ad: 'Erzurum Yolculuğu', yazar: 'Alexandr Puškin', tur: 'Gezi' }]);
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın türü');
    const sonra = await page.evaluate(() => JSON.parse(JSON.stringify(veri.kitaplar[0])));
    expect(sonra.tur).toBe('Gezi');
    // tür ve damga DIŞINDA her şey bire bir aynı
    for (const alan of Object.keys(once)) {
      if (alan === 'tur' || alan === 'g') continue;
      expect(sonra[alan], alan + ' alanı değişmemeli').toEqual(once[alan]);
    }
    expect(sonra.puan).toBe(9); expect(sonra.sayfa).toBe(120);
    expect(sonra.durum).toBe('bitti'); expect(sonra.bitisTarihi).toBe('2026-05-01');
    expect(sonra.notlar.length).toBe(1); expect(sonra.kapak).toBe('https://covers.openlibrary.org/b/id/1-M.jpg');
  });

  test('dolu tür üzerine yazılır VE önizlemede "DEĞİŞECEK" olarak ayrıca sayılır', async ({ page }) => {
    await tohumla(page, [
      sahteKitap({ ad: '1984', yazar: 'George Orwell', tur: 'Roman' }),
      sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await yukle(page, [
      { ad: '1984', yazar: 'George Orwell', tur: 'Bilim-Kurgu' },
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }]);
    const ozet = page.locator('#zgTurIceOrtu .zg-ozet');
    await expect(ozet).toContainText('1</b> kitapta boş tür dolacak'.replace(/<\/?b>/g, ''));
    await expect(ozet).toContainText('DEĞİŞECEK');
    // değişecekler listesi eski → yeni gösterir
    await expect(page.locator('#zgTurIceOrtu .zg-katla')).toContainText('Roman → Bilim-Kurgu');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('2 kitabın türü');
    expect(await page.evaluate(() =>
      veri.kitaplar.find(k => k.ad === '1984').tur)).toBe('Bilim-Kurgu');
  });

  test('taksonomide olmayan tür ATLANIR ve raporlanır', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Poetika', yazar: 'Aristotle' }),
      sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await yukle(page, [
      { ad: 'Poetika', yazar: 'Aristotle', tur: 'Uydurma Tür' },
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }]);
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('1 kayıt taksonomi dışı');
    await expect(page.locator('#zgTurIceOrtu')).toContainText('tanınmayan tür: Uydurma Tür');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın türü');
    const d = await page.evaluate(() => veri.kitaplar.map(k => [k.ad, k.tur]));
    expect(d).toContainEqual(['Persler', 'Tiyatro']);
    expect(d).toContainEqual(['Poetika', '']);   // uydurma tür YAZILMADI
  });

  test('eşleşmeyen kayıt raporlanır, çökme yok', async ({ page }) => {
    const hatalar = [];
    page.on('pageerror', e => hatalar.push(String(e)));
    await tohumla(page, [sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await yukle(page, [
      { ad: 'Kütüphanede Olmayan Kitap', yazar: 'Kimse', tur: 'Tiyatro' },
      { ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }]);
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('1 kayıt kütüphanede bulunamadı');
    await expect(page.locator('#zgTurIceOrtu')).toContainText('Kütüphanede Olmayan Kitap');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın türü');
    expect(hatalar, 'çökme yok').toEqual([]);
  });

  test('önizleme olmadan yazma YOK; Vazgeç iz bırakmaz', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await yukle(page, [{ ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }]);
    // önizleme AÇIK ama onay verilmedi: tek bayt yazılmadı
    await expect(page.locator('#zgTurIceOrtu')).toHaveClass(/acik/);
    expect(await page.evaluate(() => veri.kitaplar[0].tur)).toBe('');
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kk_kitaplik_v1')).kitaplar[0].tur)).toBe('');
    await page.click('[data-act="zg-tur-vazgec"]');
    await expect(page.locator('#toast')).toContainText('hiçbir şey yazılmadı');
    await expect(page.locator('#zgTurIceOrtu')).not.toHaveClass(/acik/);
    expect(await page.evaluate(() => veri.kitaplar[0].tur)).toBe('');
  });

  test('bozuk JSON: dürüst hata, çökme yok, önizleme açılmaz', async ({ page }) => {
    const hatalar = [];
    page.on('pageerror', e => hatalar.push(String(e)));
    await tohumla(page, [sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await ayarlarAc(page);
    /* v109: red KAPIDA — bozuk dosya boruya hiç ulaşmıyor, önizleme açılmıyor */
    await page.click('#ortuAyar [data-act="dy-sec"]');
    await page.setInputFiles('#dyDosya', {
      name: 'bozuk.json', mimeType: 'application/json',
      buffer: Buffer.from('{ bozuk json ---', 'utf8') });
    await expect(page.locator('#toast')).toContainText('geçerli bir JSON değil');
    await expect(page.locator('#zgTurIceOrtu')).toHaveCount(0);
    // tanınan hiçbir liste taşımayan geçerli JSON da dürüst mesaj verir
    await page.click('#dyKarar [data-act="dy-vazgec"]');
    await page.click('#ortuAyar [data-act="dy-sec"]');
    await page.setInputFiles('#dyDosya', {
      name: 'alakasiz.json', mimeType: 'application/json',
      buffer: Buffer.from('{"birsey":[1,2]}', 'utf8') });
    await expect(page.locator('#toast')).toContainText('tanıdığım bir liste yok');
    expect(hatalar, 'çökme yok').toEqual([]);
    expect(await page.evaluate(() => veri.kitaplar[0].tur)).toBe('');
  });

  test('ÇEVRİMDIŞI: taksonomi doğrulanamıyor → içe aktarım hiç başlamaz, sıfır yazım', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' })]);
    page.__agAyar.turler = 'hata';
    await page.goto('/');
    await yukle(page, [{ ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }]);
    await expect(page.locator('#toast')).toContainText('doğrulanamadı');
    await expect(page.locator('#zgTurIceOrtu')).toHaveCount(0);   // önizleme bile açılmaz
    expect(await page.evaluate(() => veri.kitaplar[0].tur)).toBe('');
  });

  test('TR katlamalı eşleşme: "KRAL OIDIPUS" dosyası "Kral Oidipus" kitabını bulur', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Kral Oidipus', yazar: 'Sophocles' })]);
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    await yukle(page, [{ ad: 'KRAL OIDIPUS', yazar: 'SOPHOCLES', tur: 'Tiyatro' }]);
    await expect(page.locator('#zgTurIceOrtu .zg-ozet')).toContainText('boş tür dolacak');
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın türü');
    expect(await page.evaluate(() => veri.kitaplar[0].tur)).toBe('Tiyatro');
  });

  test('yüklenen türler otomatik-atanan listesine GİRMEZ; denendi damgası düşer, tarama yeniden sormaz', async ({ page }) => {
    const k = sahteKitap({ ad: 'Persler', yazar: 'Aeschylus' });
    // deneme defteri sentinelle KAPALI: açılış taraması gerçekten koşabilir olsun —
    // damgayı İÇE AKTARIMIN bastığını kanıtlayacağız
    await tohumla(page, [k], { kk_zg_oto_deneme_v1: null });
    page.__agAyar.turler = TURLER;
    await page.goto('/');
    // tarama penceresinden ÖNCE yükle (tarama 1500ms'de başlar; yükleme anında tür dolar,
    // dolu kitap zaten aday olmaz)
    await yukle(page, [{ ad: 'Persler', yazar: 'Aeschylus', tur: 'Tiyatro' }]);
    await page.click('[data-act="zg-tur-uygula"]');
    await expect(page.locator('#toast')).toContainText('1 kitabın türü');
    const defterler = await page.evaluate(() => ({
      deneme: JSON.parse(localStorage.getItem('kk_zg_oto_deneme_v1') || '{}'),
      atanan: JSON.parse(localStorage.getItem('kk_zg_oto_atanan_v1') || '{}') }));
    expect(Object.keys(defterler.deneme), 'denendi damgası düştü').toEqual([k.id]);
    expect(Object.keys(defterler.atanan), 'otomatik-atanan defterine GİRMEDİ').toEqual([]);
    // kullanıcı türü sonradan boşaltsa bile: ikinci açılışta tarama bu kitabı SORMAZ
    await page.evaluate(() => { veri.kitaplar[0].tur = ''; veri.kitaplar[0].g = Date.now(); depoKaydet(); });
    await page.reload();
    await page.waitForTimeout(3000);
    expect(page.__agSayac.google, 'denendi damgalı kitap taramada sorulmadı').toBe(0);
  });
});
