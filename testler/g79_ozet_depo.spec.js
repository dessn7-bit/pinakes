'use strict';
/* G79 — ÖZET DEPO ALTYAPISI (v80).

   SORUN (ölçüldü): 242 × 13.024 karakterlik özet planı kitap kaydında
   dursaydı ana senkron PUT gövdesi 3.220 KB olurdu (yalnız işaretlerle
   148 KB); localStorage da 5 MB sınırına yaklaşırdı.

   BU DOSYANIN KİLİTLEDİĞİ KARARLAR:
   - Metin IndexedDB'de (kk_ozet_v1, kapak.js deseni) + bellek dizini;
     localStorage BÜYÜMEZ. Arama bellek dizininden, ölçülür sürede.
   - v79 localStorage özetleri açılışta GÖÇLE taşınır, kayıp yok, göç
     kendiliğinden bir kez koşar (taşınacak şey kalmaz).
   - Özet değişimi kitap damgası (k.g) ÜRETMEZ — kitapParmak ozet* dışlar.
   - ANA PUT gövdesinde özet METNİ YOK (yalnız işaretler). Özet AYRI kardeş
     düğümden (/odalar/<oda>--ozet: izler fihristi + k/<id>) senkronlanır;
     YALNIZ DEĞİŞEN kayıt gider (çok-yollu PATCH, atomik). ETag yok (karar:
     per-kitap yazım + idempotent birleşim; gerekçe senkron.js'te).
   - v79 çakışma eki / kasıtlı silme kuralları düğümde AYNEN (ozetBirlesim).
   - Toplu içe aktarım v73 borusunun üçüncü tipi; parçalı yazım + ilerleme.
   - Ayarlar ▸ Depolama'da özet kartı; %80 kota eşiğinde uyarı (dolmadan önce).
   (Mutasyon: özet metnini ana PUT gövdesine geri koy → (C) kırmızı; göç
    adımını kaldır → (B)/g78(a) kırmızı.) */
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');

function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
async function ozetHazir(page) {
  await page.evaluate(() => window.__ozet.hazirBekle());
}
/* Sahte oda (g27 deseni + özet düğümü ayrımı): durum Node tarafında, test
   kapanışından okunur. Testin route'u yardim.js agTaklit'ten SONRA kurulur —
   Playwright son kaydedileni önce dener, firebase URL'leri buraya düşer. */
async function sahteOda(page, ilkIzler, ilkKayitlar) {
  const s = { anaPutlar: [], ozetPatchler: [], ozetIzlerGet: 0,
    izler: { ...(ilkIzler || {}) }, kayitlar: { ...(ilkKayitlar || {}) }, ana: {} };
  await page.route('**/identitytoolkit.googleapis.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ idToken: 'sahte', refreshToken: 'sahte' }) }));
  await page.route('**/*firebasedatabase.app/**', r => {
    const url = r.request().url(), met = r.request().method();
    const json = g => r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'ETag': 'e1', 'Access-Control-Expose-Headers': 'ETag' },
      body: JSON.stringify(g) });
    if(url.includes('--ozet')){
      if(met === 'GET' && url.includes('izler.json')){ s.ozetIzlerGet++; return json(s.izler); }
      if(met === 'GET' && url.includes('/k/')){
        const id = decodeURIComponent(url.split('/k/')[1].split('.json')[0]);
        return json(s.kayitlar[id] || null);
      }
      if(met === 'PATCH'){
        const b = JSON.parse(r.request().postData() || '{}');
        s.ozetPatchler.push(b);
        for(const [yol, v] of Object.entries(b)){
          if(yol.startsWith('k/')) s.kayitlar[yol.slice(2)] = v;
          if(yol.startsWith('izler/')) s.izler[yol.slice(6)] = v;
        }
        return json({});
      }
      return json(null);
    }
    if(met === 'GET') return json(s.ana);
    if(met === 'PUT'){
      const govde = r.request().postData() || '';
      s.anaPutlar.push(govde);
      s.ana = JSON.parse(govde || '{}');
      return json({});
    }
    return json({});
  });
  return s;
}
async function senkronBaslat(page) {
  return page.evaluate(() => {
    window.__senkron.ayarKaydet({ oda: 'testodasi', cihaz: 'c1', sonSenkron: null });
    return window.__senkron.senkronEt(true);
  });
}

test.describe('G79 özet deposu — IDB + göç + damga', () => {

  test('(A) 240 özet IDB\'ye yazılır: localStorage BÜYÜMEZ, arama ölçülür sürede', async ({ page }) => {
    await tohumla(page, Array.from({ length: 240 }, (_, i) =>
      bitmis({ ad: 'Kitap ' + i, yazar: 'Yazar ' + i })));
    await rafAc(page);
    await ozetHazir(page);
    const s = await page.evaluate(async () => {
      const govde = ('Uzun özet metni — değerlendirme, ana fikir. ').repeat(60);   // ~2.500 kr
      for(let i = 0; i < veri.kitaplar.length; i++){
        const k = veri.kitaplar[i];
        await window.__ozet.kaydetHam(k.id,
          govde + (i === 7 ? ' benzersizhedefsozcuk' : ''), 1000 + i);
      }
      depoKaydet();
      const t0 = performance.now();
      durum.arama = 'benzersizhedefsozcuk'; listeCiz();
      const sure = performance.now() - t0;
      const gorunen = document.querySelectorAll('#liste .kart').length;
      durum.arama = ''; listeCiz();
      return { lsBoyut: localStorage.getItem('kk_kitaplik_v1').length,
        sayim: window.__ozet.sayim(), sure, gorunen };
    });
    expect(s.sayim.n, '240 özet IDB/bellekte').toBe(240);
    expect(s.sayim.bayt).toBeGreaterThan(1000000);
    // 240 × ~2.500 kr metin localStorage'a girseydi ~700 KB olurdu; işaretli
    // kütüphane eşiğin çok altında kalmalı
    expect(s.lsBoyut, 'localStorage yalnız işaretlerle').toBeLessThan(400000);
    expect(s.gorunen, 'arama özet metninde eşleşti').toBe(1);
    expect(s.sure, '240 uzun özette arama kabul edilebilir sürede').toBeLessThan(500);
  });

  test('(B) özet yazımı kitap damgasını DEĞİŞTİRMEZ (kitapParmak ozet* dışlar)', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Damga Kitabı' })]);
    await rafAc(page);
    await ozetHazir(page);
    const s = await page.evaluate(async () => {
      depoKaydet();                      // ilk tur: taze cihaz damgası oturur
      const g1 = veri.kitaplar[0].g;
      await window.__ozet.kaydet(veri.kitaplar[0].id, 'Yeni özet metni');   // kaydet depoKaydet'i de çağırır
      const g2 = veri.kitaplar[0].g;
      depoKaydet();                      // bir tur daha: parmak değişmediyse damga sabit
      return { g1, g2, g3: veri.kitaplar[0].g, ozetG: veri.kitaplar[0].ozetG };
    });
    expect(s.g1).toBeGreaterThan(0);
    expect(s.g2, 'özet yazımı k.g üretmez').toBe(s.g1);
    expect(s.g3).toBe(s.g1);
    expect(s.ozetG, 'kanal damgası basıldı').toBeGreaterThan(0);
  });
});

test.describe('G79 özet deposu — senkron düğümü', () => {

  test('(C) ANA PUT gövdesinde özet METNİ YOK, işaretler VAR (mutasyon hedefi)', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Senkron Kitabı',
      ozet: 'BENZERSIZ_OZET_METNI_XYZ ' + 'dolgu '.repeat(50), ozetG: 500 })]);
    const oda = await sahteOda(page);
    await rafAc(page);
    await ozetHazir(page);   // göç bitti: metin IDB'de, kitapta yalnız işaret
    const tamam = await senkronBaslat(page);
    expect(tamam).toBe(true);
    expect(oda.anaPutlar.length).toBeGreaterThan(0);
    const govde = oda.anaPutlar[oda.anaPutlar.length - 1];
    expect(govde, 'ana gövdede özet metni YOK').not.toContain('BENZERSIZ_OZET_METNI_XYZ');
    expect(govde, 'işaretler ana gövdede taşınır').toContain('"ozetVar":true');
    expect(govde).toContain('"ozetG":500');
  });

  test('(D) özet AYRI düğümden, YALNIZ DEĞİŞEN gönderilir; ikinci tur boş', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Değişen Kitap', ozet: 'Gönderilecek özet', ozetG: 700 })]);
    const oda = await sahteOda(page);
    await rafAc(page);
    await ozetHazir(page);
    await senkronBaslat(page);
    await expect.poll(() => oda.ozetPatchler.length, { timeout: 10000 }).toBe(1);
    const p = oda.ozetPatchler[0];
    const kAnah = Object.keys(p).find(x => x.startsWith('k/'));
    expect(p[kAnah].m).toBe('Gönderilecek özet');
    expect(p[kAnah].g).toBe(700);
    expect(Object.keys(p).some(x => x.startsWith('izler/')), 'fihrist aynı PATCH\'te').toBe(true);
    // ikinci tur: uzak fihrist artık eşit → PATCH atılmaz (yalnız-değişen kanıtı)
    await page.evaluate(() => window.__senkron.ozetSenkronEt());
    await expect.poll(() => oda.ozetIzlerGet, { timeout: 10000 }).toBeGreaterThan(1);
    expect(oda.ozetPatchler.length, 'değişmeyen özet yeniden GÖNDERİLMEZ').toBe(1);
  });

  test('(E) indirme + çakışma eki düğümde: iki cihazın metni de korunur, birleşik geri yazılır', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'cakisan1', ad: 'Çakışan Kitap', ozet: 'Yerel metin', ozetG: 800 })]);
    const oda = await sahteOda(page,
      { cakisan1: 900 }, { cakisan1: { m: 'Uzak metin', g: 900 } });
    await rafAc(page);
    await ozetHazir(page);
    await senkronBaslat(page);
    await expect.poll(() => page.evaluate(() => window.__ozet.oku('cakisan1')),
      { timeout: 10000 }).toContain('Uzak metin');
    const yerel = await page.evaluate(() => window.__ozet.oku('cakisan1'));
    expect(yerel, 'yerel metin kaybolmadı (çakışma eki)').toContain('Yerel metin');
    expect(yerel.indexOf('Uzak metin'), 'yeni damgalı önde').toBeLessThan(yerel.indexOf('Yerel metin'));
    await expect.poll(() => oda.ozetPatchler.length, { timeout: 10000 }).toBeGreaterThan(0);
    const son = oda.ozetPatchler[oda.ozetPatchler.length - 1];
    const kAnah = Object.keys(son).find(x => x.startsWith('k/'));
    expect(son[kAnah].m, 'birleşik metin uzağa da yazıldı').toContain('Yerel metin');
  });

  test('(F) kasıtlı silme düğümde kazanır: boş + taze damga uzak eski metni diriltmez', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'silinen1', ad: 'Silinen Kitap' })]);
    const oda = await sahteOda(page,
      { silinen1: 500 }, { silinen1: { m: 'Uzak eski metin', g: 500 } });
    await rafAc(page);
    await ozetHazir(page);
    await page.evaluate(() => window.__ozet.kaydetHam('silinen1', '', 600));   // yerel kasıtlı silme, damga yeni
    await senkronBaslat(page);
    await expect.poll(() => oda.ozetPatchler.length, { timeout: 10000 }).toBeGreaterThan(0);
    const yerel = await page.evaluate(() => window.__ozet.oku('silinen1'));
    expect(yerel, 'silme kazandı — uzak metin dirilmedi').toBe('');
    const son = oda.ozetPatchler[oda.ozetPatchler.length - 1];
    const kAnah = Object.keys(son).find(x => x.startsWith('k/'));
    expect(son[kAnah].m, 'mezar (boş+damga) uzağa yazıldı').toBe('');
    expect(son[kAnah].g).toBe(600);
  });
});

test.describe('G79 özet deposu — içe aktarım + bütçe', () => {

  test('(G) özet dosyası borusu: önizleme sayıları + yalnız-özet yazımı + değişecek uyarısı', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Boş Özetli', yazar: 'Yazar A' }),
      bitmis({ ad: 'Dolu Özetli', yazar: 'Yazar B', ozet: 'eski özet', ozetG: 100, puan: 7 })]);
    await rafAc(page);
    await ozetHazir(page);
    await ayarlarAc(page);
    await dosyadanYukle(page, jsonDosya({ surum: 1, ozet: [
      { ad: 'Boş Özetli', yazar: 'Yazar A', ozet: 'Dosyadan gelen yeni özet.' },
      { ad: 'Dolu Özetli', yazar: 'Yazar B', ozet: 'Dosyadan gelen değişik özet.' },
      { ad: 'Olmayan Kitap', yazar: 'Kimse', ozet: 'boşa gider' }] }, 'ozetler.json'));
    await expect(page.locator('#zgOzetIceOrtu')).toHaveClass(/acik/);
    const ozet = page.locator('#zgOzetIceOrtu .zg-ozet');
    await expect(ozet).toContainText('1 kitapta boş özet dolacak');
    await expect(ozet).toContainText('1 kitapta mevcut özet DEĞİŞECEK');
    await expect(ozet).toContainText('1 kayıt kütüphanede bulunamadı');
    await page.click('[data-act="zg-ozet-uygula"]');
    await expect(page.locator('#toast')).toContainText('2 kitabın özeti dosyadan yazıldı');
    const s = await page.evaluate(() => ({
      bos: window.__ozet.oku(veri.kitaplar[0].id),
      dolu: window.__ozet.oku(veri.kitaplar[1].id),
      puan: veri.kitaplar[1].puan,
      isaret: veri.kitaplar[0].ozetVar }));
    expect(s.bos).toBe('Dosyadan gelen yeni özet.');
    expect(s.dolu, 'kullanıcı bilerek yükledi — dosyadaki kazanır').toBe('Dosyadan gelen değişik özet.');
    expect(s.puan, 'başka alana dokunulmaz').toBe(7);
    expect(s.isaret).toBe(true);
  });

  test('(H) Ayarlar ▸ Depolama özet kartı doğru sayar', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'K1', ozet: 'Bir özet metni', ozetG: 1 }),
      bitmis({ ad: 'K2', ozet: 'İkinci özet metni', ozetG: 2 }),
      bitmis({ ad: 'K3' })]);
    await rafAc(page);
    await ozetHazir(page);
    await ayarlarAc(page);
    await expect(page.locator('#ozDepoBilgi')).toContainText('2 özet ·');
  });

  test('(I) kota uyarısı %80 EŞİĞİNDE tetiklenir (dolmadan önce)', async ({ page }) => {
    await page.addInitScript(() => {
      if(navigator.storage) Object.defineProperty(navigator.storage, 'estimate',
        { value: async () => ({ usage: 850, quota: 1000 }), configurable: true });
    });
    await tohumla(page, [bitmis({ ad: 'Eşik Kitabı' })]);
    await rafAc(page);
    await ozetHazir(page);
    await page.evaluate(() => window.__ozet.kaydet(veri.kitaplar[0].id, 'eşik denemesi'));
    await expect(page.locator('#toast')).toContainText('%80');
  });

  test('(J) JSON yedek özetleri taşır; geri yükleme IDB\'ye döner', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'yedek1', ad: 'Yedekli Kitap', ozet: 'Yedeğe girecek özet', ozetG: 321 })]);
    await rafAc(page);
    await ozetHazir(page);
    const yedek = await page.evaluate(() => {
      const asil = window.dosyaIndir; let y = null;
      window.dosyaIndir = icerik => { y = icerik; };
      disaAktar(); window.dosyaIndir = asil; return JSON.parse(y);
    });
    expect(yedek.ozetler && yedek.ozetler.yedek1 && yedek.ozetler.yedek1.m)
      .toBe('Yedeğe girecek özet');
    expect(yedek.ozetler.yedek1.g).toBe(321);
    // geri yükleme: özeti yerelden düşür (daha eski damga bırak), yedekten dönsün
    await page.evaluate(async y => {
      await window.__ozet.kaydetHam('yedek1', '', 100);   // eski damgalı boş — yedek (321) daha yeni
      iceAktar(new File([JSON.stringify(y)], 'yedek.json', { type: 'application/json' }));
    }, yedek);
    await expect.poll(() => page.evaluate(() => window.__ozet.oku('yedek1')),
      { timeout: 10000 }).toBe('Yedeğe girecek özet');
  });
});
