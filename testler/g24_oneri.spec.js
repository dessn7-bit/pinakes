'use strict';
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, rafYenile } = require('./yardim');

/* G24 — "Ne okusam?" öneri motoru (oneri.js, on- ad alanı)
   Tamamen yerel, açıklanabilir skorlama. Ana havuz: okunacak + sahip.
   Neden cümleleri GERÇEK veriden türer; az veride skor uydurulmaz. */

/* Puanlı bitmiş kitap fixture'ı — skorlama eşiği (3) bunlarla sağlanır. */
function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
function okunacak(ek) {
  return sahteKitap(Object.assign({ durum: 'okunacak', sahiplik: 'sahip' }, ek));
}
/* v50 GÖÇ: ampul paneli emekli — ampul düğmesi Keşfet sekmesine götürür,
   öneri UI'si orada (kesfet.js, ks-). Bu yardımcı aynı zamanda "ampul
   Keşfet'e gidiyor" sözleşmesinin kanıtıdır. */
async function kesfetAc(page) {
  await page.click('.on-ac-btn');
  await expect(page.locator('#panel-kesfet')).toHaveClass(/active/);
  await expect(page.locator('#ksIcerik .ks-ust')).toBeVisible();
}
/* Skorlamayı dolduran nötr taban: 3 puanlı bitmiş kitap (eşik), alakasız yazar/tür */
function taban() {
  return [
    bitmis({ ad: 'Taban 1', yazar: 'Taban Yazar 1', tur: 'Deneme', puan: 6 }),
    bitmis({ ad: 'Taban 2', yazar: 'Taban Yazar 2', tur: 'Anı', puan: 5 }),
    bitmis({ ad: 'Taban 3', yazar: 'Taban Yazar 3', tur: 'Gezi', puan: 6 })
  ];
}

test.describe('G24 öneri motoru', () => {

  test('yüksek puanlı yazarın okunmamış kitabı en üstte, neden cümlesiyle', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilen A1', yazar: 'Ursula K. Le Guin', puan: 9 }),
      bitmis({ ad: 'Sevilen A2', yazar: 'Ursula K. Le Guin', puan: 10 }),
      okunacak({ ad: 'Mülksüzler', yazar: 'Ursula K. Le Guin' }),
      okunacak({ ad: 'Nötr Kitap', yazar: 'Bilinmeyen Yazar' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    expect(s.mod).toBe('skor');
    expect(s.ana[0].kitap.ad).toBe('Mülksüzler');
    expect(s.ana[0].neden).toContain('Ursula K. Le Guin');
    expect(s.ana[0].neden).toContain('2 kitaba ortalama 9,5 verdin');
    // arayüzde de ilk öğe bu (Keşfet — motorla AYNI gerekçe)
    await kesfetAc(page);
    await expect(page.locator('#ksIcerik .ks-item').first()).toContainText('Mülksüzler');
    await expect(page.locator('#ksIcerik .ks-item').first()).toContainText('ortalama 9,5');
  });

  test('düşük puanlı yazarın kitabı ilk 5\'e giremez', async ({ page }) => {
    const notrler = [];
    for (let i = 1; i <= 5; i++) notrler.push(okunacak({ ad: 'Nötr ' + i, yazar: 'Yazar ' + i }));
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilmeyen B1', yazar: 'Kötü Yazar', puan: 2 }),
      bitmis({ ad: 'Sevilmeyen B2', yazar: 'Kötü Yazar', puan: 3 }),
      okunacak({ ad: 'Kötü Yazarın Yenisi', yazar: 'Kötü Yazar' }),
      ...notrler
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const adlar = s.ana.map(o => o.kitap.ad);
    expect(adlar.length).toBe(5);
    expect(adlar).not.toContain('Kötü Yazarın Yenisi'); // negatif yazar skoru altta bıraktı
  });

  test('seri devamı güçlü sinyal: yarım serinin sonraki cildi ilk 3\'te', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Vakıf', yazar: 'Isaac Asimov', seri: 'Vakıf', ciltNo: 1, puan: 7 }),
      bitmis({ ad: 'Vakıf ve İmparatorluk', yazar: 'Isaac Asimov', seri: 'Vakıf', ciltNo: 2, puan: 7 }),
      okunacak({ ad: 'İkinci Vakıf', yazar: 'Isaac Asimov', seri: 'Vakıf', ciltNo: 3 }),
      okunacak({ ad: 'Alakasız 1', yazar: 'Başka Yazar 1' }),
      okunacak({ ad: 'Alakasız 2', yazar: 'Başka Yazar 2' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const sira = s.ana.findIndex(o => o.kitap.ad === 'İkinci Vakıf');
    expect(sira).toBeGreaterThanOrEqual(0);
    expect(sira).toBeLessThan(3);
    const oge = s.ana[sira];
    expect(oge.bilesenler.seri).toBe(35);
    expect(oge.neden).toContain('Vakıf serisinin 3. cildi');
    expect(oge.neden).toContain('önceki 2 cildi bitirdin');
  });

  test('"Şimdi değil": kitap listeden çıkar, 30 gün sonra geri gelir', async ({ page }) => {
    const k = okunacak({ ad: 'Ertelenecek Kitap', yazar: 'Herhangi Yazar' });
    await tohumla(page, [...taban(), k, okunacak({ ad: 'Kalan Kitap' })]);
    await rafAc(page);
    await kesfetAc(page);
    await page.click(`#ksIcerik [data-act="ks-ertele"][data-id="${k.id}"]`);
    await expect(page.locator('#toast')).toContainText('30 gün sonra');
    await expect(page.locator('#ksIcerik')).not.toContainText('Ertelenecek Kitap'); // liste tazelendi
    expect(await page.evaluate(id =>
      veri.kitaplar.find(x => x.id === id).ertelemeTarihi, k.id)).toBe(bugunISO(0));
    // tarih taklidi: 29 gün önce ertelenmiş → hâlâ gizli; 31 gün önce → geri gelir
    const gizliMi = async kayma => page.evaluate(([id, t]) => {
      veri.kitaplar.find(x => x.id === id).ertelemeTarihi = t;
      return !window.__oneri.hesapla().ana.some(o => o.kitap.id === id);
    }, [k.id, bugunISO(kayma)]);
    expect(await gizliMi(-29)).toBe(true);
    expect(await gizliMi(-31)).toBe(false);
  });

  test('ertelemeTarihi yenilemede KORUNUR ve senkron PUT\'unda taşınır', async ({ page }) => {
    let putGovde = null;
    await page.route('**/identitytoolkit.googleapis.com/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ idToken: 'sahte-token', refreshToken: 'sahte-yenile' }) }));
    await page.route('**/*firebasedatabase.app/**', route => {
      if (route.request().method() === 'PUT') putGovde = route.request().postData();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    const k = okunacak({ ad: 'Ertelenmiş Senkronlu', ertelemeTarihi: '2026-08-01', g: 5 });
    await tohumla(page, [k]);
    await rafAc(page);
    expect(await page.evaluate(() => veri.kitaplar[0].ertelemeTarihi)).toBe('2026-08-01');
    await rafYenile(page);
    expect(await page.evaluate(() => veri.kitaplar[0].ertelemeTarihi)).toBe('2026-08-01'); // normalize elemedi
    const tamam = await page.evaluate(() => {
      window.__senkron.ayarKaydet({ oda: 'g24-test-odasi', cihaz: 'testcihaz', sonSenkron: null });
      return window.__senkron.senkronEt(true);
    });
    expect(tamam).toBe(true);
    expect(JSON.parse(putGovde).kitaplar[0].ertelemeTarihi).toBe('2026-08-01'); // senkronla taşındı
  });

  test('senkron göçü v4: sürüm atlaması kütüphaneyi yeniden damgalamaz', async ({ page }) => {
    const k = okunacak({ ad: 'Göç Kitabı v4', g: 9 });
    await tohumla(page, [k], { kk_senkron_anlik_v1: { s: 3, p: { eskiId: 'x-yz' } } });
    await rafAc(page);
    await page.evaluate(() => depoKaydet()); // damgala göç turunda koşsun
    expect(await page.evaluate(() => veri.kitaplar[0].g)).toBe(9); // damga korundu
    const anlik = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_senkron_anlik_v1')));
    expect(anlik.s).toBe(await page.evaluate(() => window.__senkron.ANLIK_SURUM)); // yeni sürümle yazıldı
  });

  test('çeşitlilik: ilk 5\'te aynı yazardan en fazla 2, aynı türden en fazla 3', async ({ page }) => {
    const cokYazar = [];
    for (let i = 1; i <= 6; i++)
      cokYazar.push(okunacak({ ad: 'Tolstoy ' + i, yazar: 'Tolstoy', tur: 'Roman' }));
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilen T', yazar: 'Tolstoy', tur: 'Roman', puan: 10 }),
      bitmis({ ad: 'Sevilen T2', yazar: 'Tolstoy', tur: 'Roman', puan: 9 }),
      ...cokYazar,
      okunacak({ ad: 'Başka Roman 1', yazar: 'Farklı Yazar 1', tur: 'Roman' }),
      okunacak({ ad: 'Başka Roman 2', yazar: 'Farklı Yazar 2', tur: 'Roman' }),
      okunacak({ ad: 'Şiir Kitabı', yazar: 'Şair', tur: 'Şiir' }),
      okunacak({ ad: 'Öykü Kitabı', yazar: 'Öykücü', tur: 'Öykü' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    expect(s.ana.length).toBe(5);
    const yazarSay = {}, turSay = {};
    s.ana.forEach(o => {
      yazarSay[o.kitap.yazar] = (yazarSay[o.kitap.yazar] || 0) + 1;
      turSay[o.kitap.tur] = (turSay[o.kitap.tur] || 0) + 1;
    });
    expect(yazarSay['Tolstoy']).toBe(2);              // en sevilen yazar bile kotayı aşamaz
    Object.values(yazarSay).forEach(n => expect(n).toBeLessThanOrEqual(2));
    Object.values(turSay).forEach(n => expect(n).toBeLessThanOrEqual(3));
  });

  test('yetersiz veride uydurma gerekçe YOK: dürüst mesaj + en uzun bekleyenler', async ({ page }) => {
    // yalnız 2 puanlı bitmiş kitap (eşik 3'ün altında)
    const eski = okunacak({ ad: 'En Eski Bekleyen', eklenme: 1700000000000 });
    const yeni = okunacak({ ad: 'Daha Yeni Bekleyen', eklenme: 1753000000000 });
    await tohumla(page, [
      bitmis({ ad: 'Puanlı 1', yazar: 'X', puan: 8 }),
      bitmis({ ad: 'Puanlı 2', yazar: 'X', puan: 9 }),
      yeni, eski
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    expect(s.mod).toBe('az-veri');
    expect(s.ana[0].kitap.ad).toBe('En Eski Bekleyen'); // en uzun bekleyen başta
    expect(s.ana[0].skor).toBe(null);                    // skor uydurulmadı
    await kesfetAc(page);
    const metin = await page.locator('#ksIcerik').textContent();
    expect(metin).toContain('yeterli veri yok');
    expect(metin).toContain('rafta bekliyor');           // gerçek neden
    expect(metin).not.toContain('ortalama');             // uydurma yakınlık gerekçesi YOK
  });

  test('neden cümlesindeki sayılar hesaplanan veriyle birebir aynı', async ({ page }) => {
    const puanlar = [7, 9, 10]; // ort 8.666... → "8,7"
    await tohumla(page, [
      ...puanlar.map((p, i) => bitmis({ ad: 'Borges ' + i, yazar: 'Borges', puan: p })),
      okunacak({ ad: 'Alef', yazar: 'Borges' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Alef');
    const beklenenOrt = (puanlar.reduce((a, b) => a + b, 0) / puanlar.length);
    const beklenenMetin = beklenenOrt.toFixed(1).replace('.', ',');   // bağımsız hesap
    expect(oge.neden).toContain('bitirdiğin 3 kitaba ortalama ' + beklenenMetin + ' verdin');
    // bileşen değeri de aynı ortalamadan türemiş olmalı
    expect(oge.bilesenler.yazar).toBeCloseTo((beklenenOrt - 5.5) / 4.5 * 30, 5);
  });

  test('istek listesindeki kitap ana listede değil, ayrı bölümde rozetle', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilen W1', yazar: 'Woolf', puan: 10 }),
      okunacak({ ad: 'Elimde Olan', yazar: 'Sıradan Yazar' }),
      sahteKitap({ ad: 'Dalgalar', yazar: 'Woolf', durum: 'okunacak', sahiplik: 'istek' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    expect(s.ana.some(o => o.kitap.ad === 'Dalgalar')).toBe(false);   // ana havuz yalnız sahip
    expect(s.istek.some(o => o.kitap.ad === 'Dalgalar')).toBe(true);  // ayrı bölümde
    // v50: Keşfet'te istekler ayrı bölüm değil SAHİPLİK SÜZGECİ — İstek listem çipi
    await kesfetAc(page);
    await expect(page.locator('#ksIcerik')).not.toContainText('Dalgalar'); // varsayılan: Bende
    await page.click('#ksIcerik [data-act="ks-suz"][data-g="sahiplik"][data-v="istek"]');
    const istekOge = page.locator('#ksIcerik .ks-item', { hasText: 'Dalgalar' });
    await expect(istekOge.locator('.ks-rozet')).toContainText('İstek listende');
    await expect(istekOge.locator('[data-act="ks-basla"]')).toHaveCount(0); // elinde yok → başlanamaz
  });

  test('"Okumaya başla": durum okunuyor olur, okuma OTURUMU başlamaz', async ({ page }) => {
    const k = okunacak({ ad: 'Başlanacak Kitap' });
    await tohumla(page, [...taban(), k]);
    await rafAc(page);
    await kesfetAc(page);
    await page.click(`#ksIcerik [data-act="ks-basla"][data-id="${k.id}"]`);
    await expect(page.locator('#toast')).toContainText('İyi okumalar');
    const d = await page.evaluate(id => {
      const x = veri.kitaplar.find(b => b.id === id);
      return { durum: x.durum, bas: x.baslamaTarihi, oturum: localStorage.getItem('kk_oturum_v1') };
    }, k.id);
    expect(d.durum).toBe('okunuyor');
    expect(d.bas).toBe(bugunISO(0));
    expect(d.oturum).toBeFalsy();                       // oturum başlatılmadı (bilinçli)
    await expect(page.locator('#ksIcerik')).not.toContainText('Başlanacak Kitap'); // aday değil artık
  });

  test('tür eşiği: tek kitaplık tür NÖTR, iki kitaplık tür sinyal verir', async ({ page }) => {
    await tohumla(page, [
      ...taban(), // Deneme/Anı/Gezi 1'er kitap
      bitmis({ ad: 'Korku 1', yazar: 'K1', tur: 'Korku', puan: 9 }),
      bitmis({ ad: 'Korku 2', yazar: 'K2', tur: 'Korku', puan: 9 }),
      okunacak({ ad: 'Tek Kitaplık Türden', yazar: 'Y1', tur: 'Deneme' }),
      okunacak({ ad: 'Çift Kitaplık Türden', yazar: 'Y2', tur: 'Korku' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const tek = s.ana.find(o => o.kitap.ad === 'Tek Kitaplık Türden');
    const cift = s.ana.find(o => o.kitap.ad === 'Çift Kitaplık Türden');
    expect(tek.bilesenler.tur).toBeUndefined();         // eşik altı → bileşen hiç yok
    expect(cift.bilesenler.tur).toBeGreaterThan(0);
    expect(cift.neden).toContain('Korku türünde 2 kitaba ortalama 9,0 verdin');
  });

  test('sayfa bilgisi olmayan kitap cezalandırılmaz', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Yeni Biten 1', yazar: 'Z1', puan: 7, sayfa: 300, bitisTarihi: bugunISO(-10) }),
      bitmis({ ad: 'Yeni Biten 2', yazar: 'Z2', puan: 7, sayfa: 320, bitisTarihi: bugunISO(-20) }),
      bitmis({ ad: 'Yeni Biten 3', yazar: 'Z3', puan: 7, sayfa: 280, bitisTarihi: bugunISO(-15) }),
      okunacak({ ad: 'Sayfasız Kitap', yazar: 'Aynı Yazar', sayfa: null }),
      okunacak({ ad: 'Uygun Uzunluk', yazar: 'Aynı Yazar', sayfa: 300 })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const sayfasiz = s.ana.find(o => o.kitap.ad === 'Sayfasız Kitap');
    expect(sayfasiz).toBeTruthy();                          // listeden düşmedi
    expect(sayfasiz.bilesenler.uzunluk).toBeUndefined();    // 0 bileşen, NEGATİF ceza yok
    Object.values(sayfasiz.bilesenler).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    const uygun = s.ana.find(o => o.kitap.ad === 'Uygun Uzunluk');
    expect(uygun.bilesenler.uzunluk).toBeGreaterThan(6);    // uygunluk bonusu çalışıyor
  });

  test('ana havuz yalnız okunacak: okunuyor/bitti kitaplar önerilmez', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      sahteKitap({ ad: 'Zaten Okunuyor', durum: 'okunuyor' }),
      sahteKitap({ ad: 'Zaten Bitti', durum: 'bitti', puan: 10 }),
      okunacak({ ad: 'Tek Aday' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const adlar = s.ana.map(o => o.kitap.ad);
    expect(adlar).toEqual(['Tek Aday']);
  });

  test('yeniden okunan kitabın arşiv puanı sayılır: az-veriye düşmez, yazar sinyali korunur', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Normal Bitmiş 1', yazar: 'N1', puan: 6 }),
      bitmis({ ad: 'Normal Bitmiş 2', yazar: 'N2', puan: 6 }),
      // üçüncü puanlı kitap ŞU AN yeniden okunuyor: puan arşivde (yeniden-oku akışı)
      sahteKitap({ ad: 'Yeniden Okunan', yazar: 'Calvino', durum: 'okunuyor', puan: null,
        okumalar: [{ bas: '2026-01-01', bit: '2026-03-01', puan: 9, not: '' }] }),
      okunacak({ ad: 'Calvino Yenisi', yazar: 'Calvino' })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    expect(s.mod).toBe('skor');                              // arşiv sayıldı, az-veriye düşmedi
    const oge = s.ana.find(o => o.kitap.ad === 'Calvino Yenisi');
    expect(oge.bilesenler.yazar).toBeGreaterThan(0);         // arşiv puanı yazar sinyali verdi
    expect(oge.neden).toContain('Calvino: bitirdiğin 1 kitaba ortalama 9,0 verdin');
  });

  test('yeniden okunan cilt seri sinyalini düşürmez: sonraki cilt bonusu korunur', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      // cilt 1 şu an yeniden okunuyor ama arşivinde bitmiş okuma var
      sahteKitap({ ad: 'Dune', yazar: 'Herbert', seri: 'Dune', ciltNo: 1, durum: 'okunuyor',
        okumalar: [{ bas: '2026-01-01', bit: '2026-02-01', puan: 8, not: '' }] }),
      okunacak({ ad: 'Dune Mesihi', yazar: 'Herbert', seri: 'Dune', ciltNo: 2 })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Dune Mesihi');
    expect(oge.bilesenler.seri).toBe(35);
    expect(oge.neden).toContain('Dune serisinin 2. cildi');
  });

  test('uygunluk çizgisi her koşulda 0-100 arası: tek adayda ve istek süzgecinde', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilmeyen K', yazar: 'Kötü Yazar', puan: 1 }),
      okunacak({ ad: 'Tek Sahip Aday', yazar: 'Nötr Yazar' }),
      // düşük puanlı yazarın İSTEK kitabı: negatif skor → kelepçe testi
      sahteKitap({ ad: 'Kötü İstek', yazar: 'Kötü Yazar', durum: 'okunacak', sahiplik: 'istek' })
    ]);
    await rafAc(page);
    await kesfetAc(page);
    // tek adaylı listede aralık 0 → kelepçe NaN/negatif üretmemeli
    const genislikler = await page.evaluate(() =>
      [...document.querySelectorAll('#ksIcerik .ks-skor > span')].map(b => parseFloat(b.style.width)));
    expect(genislikler.length).toBeGreaterThan(0);
    genislikler.forEach(g => { expect(Number.isFinite(g)).toBe(true); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(100); });
    // istek süzgecine geç: negatif skorlu tek öğe → yine kelepçeli
    await page.click('#ksIcerik [data-act="ks-suz"][data-g="sahiplik"][data-v="istek"]');
    await expect(page.locator('#ksIcerik')).toContainText('Kötü İstek');
    const sonra = await page.evaluate(() =>
      [...document.querySelectorAll('#ksIcerik .ks-skor > span')].map(b => parseFloat(b.style.width)));
    sonra.forEach(g => { expect(Number.isFinite(g)).toBe(true); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(100); });
  });

  test('Keşfet\'ten detaya geçip bitirince detayda kalınır: puan şeridi çıkar, liste tazelenir', async ({ page }) => {
    // Detay tasarımı sprintinden beri "bitir" form AÇMAZ: detayda kalınır,
    // puan sorusu birincil bloktaki şerittir (d-puan). Bu vaka yeni akışı kilitler.
    const k = okunacak({ ad: 'Panelden Bitirilecek' });
    await tohumla(page, [...taban(), k]);
    await rafAc(page);
    await kesfetAc(page);
    // Keşfet → detay → okumaya başla → bitir (detayda kal, puan şeridi)
    await page.click(`#ksIcerik .ks-ad[data-act="detay"][data-id="${k.id}"]`);
    await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
    await page.click('#detayIcerik [data-act="baslat"]');
    await page.click('#detayIcerik [data-act="bitir"]');
    // form açılmadı, detay açık ve puan şeridi görünür (panel altta kalsa da detay üstte)
    await expect(page.locator('#ortuForm')).not.toHaveClass(/acik/);
    await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
    await expect(page.locator('#detayIcerik #dPuan')).toBeVisible();
    const d1 = await page.evaluate(id => {
      const x = veri.kitaplar.find(b => b.id === id);
      return { durum: x.durum, bit: x.bitisTarihi };
    }, k.id);
    expect(d1.durum).toBe('bitti');
    expect(d1.bit).toBe(bugunISO(0));
    // şeritten puan ver: form hâlâ yok, puan yazıldı
    await page.click('#detayIcerik #dPuan [data-act="d-puan"][data-v="8"]');
    await expect(page.locator('#ortuForm')).not.toHaveClass(/acik/);
    expect(await page.evaluate(id => veri.kitaplar.find(b => b.id === id).puan, k.id)).toBe(8);
    // kapat: Keşfet sekmesi hâlâ aktif ve veri değişince kendini tazeledi
    // (hepsiniCiz sarmalaması) — bitmiş kitap artık öneri listesinde değil
    await page.click('#detayIcerik [data-act="detay-kapat"]');
    await expect(page.locator('#panel-kesfet')).toHaveClass(/active/);
    await expect(page.locator('#ksIcerik')).not.toContainText('Panelden Bitirilecek');
  });

  test('zar düğmesi hâlâ çalışıyor (regresyon)', async ({ page }) => {
    await tohumla(page, [okunacak({ ad: 'Zarlık Kitap' })]);
    await rafAc(page);
    await page.click('.search-row [data-act="zar"]');
    await expect(page.locator('#toast')).toContainText('Zar böyle dedi');
    await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
    await expect(page.locator('#detayIcerik')).toContainText('Zarlık Kitap');
  });
});

/* ===================================================================== */
/* v48 — gerekçe tekilleştirme + bekleme geçerliliği (ORTAK motorda;
   Keşfet de aynı motoru kullanacak). Canlı v47 kanıtı: iki öneri BİREBİR
   aynı "tür ortalaması · 689 aydır rafta bekliyor" cümlesini taşıyordu. */
test.describe('G24 gerekçe tekilleştirme (v48)', () => {

  /* Kanıt kurgusu: aynı türde 3 puanlı bitmiş + aynı türde 2 aday —
     tür cümlesi ikisi için de aynı üretilirdi. */
  function ayniTurVeri() {
    return [
      bitmis({ ad: 'Roman 1', yazar: 'R Yazar 1', tur: 'Roman', puan: 9 }),
      bitmis({ ad: 'Roman 2', yazar: 'R Yazar 2', tur: 'Roman', puan: 9 }),
      bitmis({ ad: 'Roman 3', yazar: 'R Yazar 3', tur: 'Roman', puan: 9 }),
      okunacak({ ad: 'Tanrı Yanılgısı', yazar: 'Dawkins', tur: 'Roman' }),
      okunacak({ ad: 'Böyle Buyurdu Zerdüşt', yazar: 'Nietzsche', tur: 'Roman' }),
    ];
  }

  test('(a) iki öneri aynı gerekçe cümlesini göstermez — motorda VE Ana Sayfa\'da', async ({ page }) => {
    await tohumla(page, ayniTurVeri());
    await page.goto('/');
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const nedenler = s.ana.map(o => o.neden).filter(Boolean);
    expect(new Set(nedenler).size, 'motor nedenleri benzersiz').toBe(nedenler.length);
    // ilk öneri tür ortalamasını taşır; ikincisi AYNI cümleyi taşımaz
    expect(s.ana[0].neden).toContain('Roman türünde 3 kitaba ortalama 9,0 verdin');
    expect(s.ana[1].neden).not.toBe(s.ana[0].neden);
    expect(s.ana[1].neden).not.toContain('ortalama 9,0');
    // gerçek render (v47 kanıtının yüzeyi): Ana Sayfa SIRADAKİ iki farklı gerekçe
    const uiNedenler = await page.locator('#asSiradaki .as-neden').allTextContents();
    expect(uiNedenler.length).toBe(2);
    expect(uiNedenler[0]).not.toBe(uiNedenler[1]);
  });

  test('(b) yazar yakınlığı olan kitapta gerekçe yazarı anar (birincil)', async ({ page }) => {
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilen Y1', yazar: 'Bilge Karasu', puan: 9 }),
      bitmis({ ad: 'Sevilen Y2', yazar: 'Bilge Karasu', puan: 10 }),
      okunacak({ ad: 'Gece', yazar: 'Bilge Karasu', tur: 'Deneme' }),
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Gece');
    expect(oge.neden.indexOf('Bilge Karasu'), 'yazar cümlesi BİRİNCİL').toBe(0);
    expect(oge.neden).toContain('2 kitaba ortalama 9,5 verdin');
  });

  test('(c) seri devamı olan kitapta gerekçe seriyi anar (yazar sinyalsiz kurgu)', async ({ page }) => {
    await tohumla(page, [
      ...taban(),   // puanlılar başka yazarlardan — Asimov yazar istatistiği almaz
      bitmis({ ad: 'Vakıf 1', yazar: 'Isaac Asimov', seri: 'Vakıf', ciltNo: 1, puan: null }),
      bitmis({ ad: 'Vakıf 2', yazar: 'Isaac Asimov', seri: 'Vakıf', ciltNo: 2, puan: null }),
      okunacak({ ad: 'İkinci Vakıf', yazar: 'Isaac Asimov', seri: 'Vakıf', ciltNo: 3 }),
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'İkinci Vakıf');
    expect(oge.neden.indexOf('Vakıf serisinin 3. cildi'), 'seri cümlesi BİRİNCİL').toBe(0);
    expect(oge.neden).toContain('önceki 2 cildi bitirdin');
  });

  test('(d) eklenme damgası geçersiz/absürtse bekleme ifadesi HİÇ çıkmaz', async ({ page }) => {
    const bozukEski = okunacak({ ad: 'Epoch Kitabı', tur: 'Roman' });
    bozukEski.eklenme = 1;                                   // 1970 → ~683 ay: absürt
    const gelecek = okunacak({ ad: 'Gelecekten Gelen', tur: 'Roman' });
    gelecek.eklenme = Date.now() + 30 * 86400000;            // gelecekte: geçersiz
    await tohumla(page, [
      bitmis({ ad: 'Roman 1', yazar: 'R Yazar 1', tur: 'Roman', puan: 9 }),
      bitmis({ ad: 'Roman 2', yazar: 'R Yazar 2', tur: 'Roman', puan: 9 }),
      bitmis({ ad: 'Roman 3', yazar: 'R Yazar 3', tur: 'Roman', puan: 9 }),
      bozukEski, gelecek,
    ]);
    await page.goto('/');
    const s = await page.evaluate(() => window.__oneri.hesapla());
    for (const o of s.ana) {
      expect(o.neden, o.kitap.ad + ' sayılı bekleme taşımaz').not.toMatch(/aydır|gündür/);
    }
    // gerçek render: Ana Sayfa'da da absürt süre yok
    const ui = await page.locator('#asSiradaki').textContent();
    expect(ui).not.toMatch(/aydır rafta|gündür rafta/);
  });

  test('(e) hiçbir güçlü sinyal yoksa dürüst genel cümle — uydurma sayı YOK', async ({ page }) => {
    const issiz = okunacak({ ad: 'Sinyalsiz Kitap', yazar: 'Tanınmayan Yazar' });
    issiz.eklenme = 1;   // bekleme de geçersiz: hiçbir özgül sinyal kalmaz
    await tohumla(page, [...taban(), issiz]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Sinyalsiz Kitap');
    // v49 GÖÇ: hiç sinyali olmayan kitap dürüst itiraf alır (raf cümlesi değil)
    expect(oge.neden).toBe('Hakkında yeterli veri yok — denemeye değer.');
    expect(oge.neden).not.toMatch(/\d/);
  });

  /* ---------- v49: bekleme gerekçe eşiği (90 gün) + sinyalsiz kitap kararı ---------- */

  test('(a-v49) 1 günlük kitapta "gündür rafta bekliyor" gerekçesi ÇIKMAZ', async ({ page }) => {
    const dunku = okunacak({ ad: 'Dün Eklenen', yazar: 'Yeni Yazar' });
    dunku.eklenme = Date.now() - 1 * 86400000;   // 1 gün: eşik (90) ALTINDA
    await tohumla(page, [...taban(), dunku]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Dün Eklenen');
    expect(oge.neden).not.toMatch(/gündür rafta|aydır rafta/);
  });

  test('(b-v49) 74 aylık kitapta bekleme gerekçesi ÇIKAR (uzun bekleme anlamlı sinyal)', async ({ page }) => {
    const eski = okunacak({ ad: 'Unutulmuş Kitap', yazar: 'Eski Yazar' });
    eski.eklenme = Date.now() - 74 * 30 * 86400000;   // ~74 ay: eşik üstü, tavan (600 ay) altı
    await tohumla(page, [...taban(), eski]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Unutulmuş Kitap');
    expect(oge.neden).toContain('74 aydır rafta bekliyor');
  });

  test('(c-v49) sinyalsiz kitap KARARI: listede kalır, dürüst itiraf cümlesi alır', async ({ page }) => {
    /* KARAR: listeden atmak yerine göster — veri yokluğu kitabın aleyhine
       kanıt değil; küçük kütüphanede liste boşalırdı. Cümle sayı uydurmaz. */
    const dunku = okunacak({ ad: 'Dün Eklenen', yazar: 'Yeni Yazar' });
    dunku.eklenme = Date.now() - 1 * 86400000;
    await tohumla(page, [...taban(), dunku]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const oge = s.ana.find(o => o.kitap.ad === 'Dün Eklenen');
    expect(oge, 'sinyalsiz kitap listeye GİRER').toBeTruthy();
    expect(oge.neden).toBe('Hakkında yeterli veri yok — denemeye değer.');
    expect(oge.neden).not.toMatch(/\d/);
  });

  test('(d-v49) yeni eklenen sinyalsiz kitap, güçlü sinyalli kitabın ÜSTÜNE çıkmaz', async ({ page }) => {
    const dunku = okunacak({ ad: 'Dün Eklenen', yazar: 'Yeni Yazar' });
    dunku.eklenme = Date.now() - 1 * 86400000;
    await tohumla(page, [
      ...taban(),
      bitmis({ ad: 'Sevilen G1', yazar: 'Güçlü Yazar', puan: 9 }),
      bitmis({ ad: 'Sevilen G2', yazar: 'Güçlü Yazar', puan: 10 }),
      okunacak({ ad: 'Güçlü Aday', yazar: 'Güçlü Yazar' }),
      dunku,
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    expect(s.ana[0].kitap.ad).toBe('Güçlü Aday');
    const yeniSira = s.ana.findIndex(o => o.kitap.ad === 'Dün Eklenen');
    expect(yeniSira, 'yeni kitap üstte değil').toBeGreaterThan(0);
  });

  test('tür-genel yedeği: tür cümlesi kullanılmışsa ikinci kitap sayısız tür cümlesi alır', async ({ page }) => {
    /* 3 aday, hepsi aynı tür, bekleme damgaları geçersiz: 1.si tür ortalamasını
       alır, 2.si sayısız tür-geneline düşer, 3.sü genel havuzdan varyant alır
       (v50: '' emekli — gerekçesiz satır kalmaz, havuz döngüseldir). */
    const adaylar = ['Aday 1', 'Aday 2', 'Aday 3'].map((ad, i) => {
      const k = okunacak({ ad, yazar: 'A Yazar ' + i, tur: 'Roman' });
      k.eklenme = 1;
      return k;
    });
    await tohumla(page, [
      bitmis({ ad: 'Roman 1', yazar: 'R Yazar 1', tur: 'Roman', puan: 9 }),
      bitmis({ ad: 'Roman 2', yazar: 'R Yazar 2', tur: 'Roman', puan: 9 }),
      bitmis({ ad: 'Roman 3', yazar: 'R Yazar 3', tur: 'Roman', puan: 9 }),
      ...adaylar,
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.hesapla());
    const nedenler = s.ana.map(o => o.neden);
    expect(nedenler[0]).toContain('ortalama 9,0');
    expect(nedenler[1]).toBe('Roman türünden kitapları beğeniyorsun');
    expect(nedenler[2]).toBe('Rafında seni bekliyor.');   // v50: genel havuz — '' emekli
    nedenler.forEach(n => expect(n.trim().length).toBeGreaterThan(0));
    expect(new Set(nedenler).size).toBe(nedenler.length);
  });

  /* ===== v88 EKSİK CİLT TAVANI (denetim bulgusu + bildirim tetiği önkoşulu) =====
     eksikSeriler cümlesinde tavan yoktu: ciltNo'ya yanlışlıkla 2023 girilirse
     binlerce elemanlı cümle kuruluyordu. Artık en fazla 3 cilt yazılır, kalanı
     "(ve N cilt daha)" ile söylenir; `eksik` dizisi TAM kalır.
     (Mutasyon E: slice(0,3) kaldırılır → "üç cilt + sayı" vakası kırmızı.) */
  test('v88 eksik cilt TAVANI: ciltNo 2023 girilse bile cümle 3 cilt + "ve N cilt daha" ile sınırlı', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Seri Cilt 1', seri: 'Kazim', ciltNo: 1, puan: 8 }),
      okunacak({ ad: 'Seri Cilt 2023', seri: 'Kazim', ciltNo: 2023 })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.eksikSeriler());
    expect(s.length).toBe(1);
    expect(s[0].eksik.length).toBe(2021);                 // dizi TAM (2..2022)
    expect(s[0].cumle).toContain('2 ve 3 ve 4. cildi eksik (ve 2018 cilt daha)');
    expect(s[0].cumle).toContain('1. cildi bitirdin');
    expect(s[0].cumle.length).toBeLessThan(120);          // cümle patlamıyor
  });

  test('v88 eksik cilt: 3 ve daha az eksikte cümle ESKİSİ gibi (tavan eki yok)', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Vakif 1', seri: 'Vakif', ciltNo: 1, puan: 8 }),
      okunacak({ ad: 'Vakif 3', seri: 'Vakif', ciltNo: 3 })
    ]);
    await rafAc(page);
    const s = await page.evaluate(() => window.__oneri.eksikSeriler());
    expect(s[0].cumle).toBe('Vakif serisinin 2. cildi eksik — 1. cildi bitirdin');
    expect(s[0].cumle).not.toContain('cilt daha');
  });
});

