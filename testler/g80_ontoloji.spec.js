'use strict';
/* G80 — ONTOLOJİ alanı (v81).

   KAVRAM: özetin İKİZİ ikinci metin alanı — ayrı görünür ("Ontoloji" kicker),
   ayrı düzenlenir (onto- ad alanı), ama AYRI DEPO AÇILMADI: kk_ozet_v1 kaydı
   { m, g } → { m, g, o } genişledi; damga g İKİSİNİ BİRDEN kapsar.

   BU DOSYANIN KİLİTLEDİĞİ KARARLAR:
   - o'suz eski kayıt okunduğunda o='' sayılır; HİÇBİR eski kayıt geçersiz olmaz.
   - Özet yazımı (kaydet) o'yu KORUR; ontoloji yazımı (kaydetOnto) m'yi KORUR.
   - kaydetHam 4. parametre o: verilmezse mevcut o korunur (eski yedekler
     ontolojiyi silmesin).
   - Detay (v89 SEKME): ontoloji doluysa [Özetin][Ontoloji] şeridi + tek panel
     (ayrıntılar g87'de); yalnız özet varken şerit YOK — ghost satır özet
     bloğunun hemen altında; ikisi de boşsa HİÇ çizilmez.
   - hepsiDisa o'yu yalnız DOLUYSA yazar (yedek şişmesin); iceAktar o.o'yu
     4. parametreyle geri taşır.
   - Arama aynı katlanmış dizinden ontolojiyi de bulur.
   - CSV'de 'Ontoloji' sütunu Özet'in hemen sağında, tam metin.
   - İçe aktarım TEK dosya TEK onay: { ozet:[{ad,yazar,ozet,ontoloji}] },
     ontoloji isteğe bağlı; alanı olmayan kayıt mevcut ontolojiye DOKUNMAZ.
   - Senkron: AYNI düğüm/paket, o alanı eklenir; ozetBirlesim o'ya m kurallarını
     SİMETRİK uygular. SEMA_SURUM 4→5 (eski istemci PATCH'i o'yu sildiği için).
   (Mutasyon: kaydet'ten o korumasını çıkar → (B) kırmızı; kaydetHam'dan
    undefined-korumasını çıkar → (D) kırmızı; ozetBirlesim'den o'yu çıkar →
    (H)/(I) kırmızı.) */
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc, rafaGec, ayarlarAc,
  dosyadanYukle, jsonDosya } = require('./yardim');

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
async function aktarimYakala(page, cagri) {
  return page.evaluate(fn => {
    const asil = window.dosyaIndir; let yakalanan = null;
    window.dosyaIndir = (icerik, ad) => { yakalanan = { icerik, ad }; };
    try{ new Function(fn)(); }finally{ window.dosyaIndir = asil; }
    return yakalanan;
  }, cagri);
}
/* Sahte oda — g79 deseninin birebiri (özet düğümü ayrımı dahil) */
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

test.describe('G80 ontoloji — detay arayüzü + kalıcılık', () => {

  test('(A) ghost yalnız özet doluyken; yazılır, yenilemede korunur; k.g DEĞİŞMEZ, ozetG basılır', async ({ page }) => {
    await tohumla(page, [
      bitmis({ ad: 'Özetli Kitap', ozet: 'Dolu özet metni.', ozetG: 100 }),
      bitmis({ ad: 'Bomboş Kitap' })]);
    await rafAc(page);
    await ozetHazir(page);
    const gIlk = await page.evaluate(() => {
      depoKaydet();   // ilk damgalama otursun — "k.g değişmez" iddiası ondan sonra
      return veri.kitaplar.find(k => k.ad === 'Özetli Kitap').g;
    });
    // ikisi de boş → ne blok ne ghost (boş düğme kalabalığı yok)
    await detayAc(page, 'Bomboş Kitap');
    await expect(page.locator('#dOntoBlok')).toHaveCount(0);
    await expect(page.locator('.onto-bos')).toHaveCount(0);
    await page.click('#ortuDetay .sheet-kapat');
    // özet dolu → ghost var, blok özet bloğunun HEMEN ALTINDA
    await detayAc(page, 'Özetli Kitap');
    await expect(page.locator('.onto-bos .onto-ghost')).toHaveText('+ Ontoloji yaz');
    const sira = await page.evaluate(() => {
      const oz = document.getElementById('dOzetBlok');
      return !!(oz && oz.nextElementSibling && oz.nextElementSibling.classList.contains('onto-bos'));
    });
    expect(sira, 'ontoloji bloğu özet bloğunun hemen altında').toBe(true);
    await page.click('[data-act="onto-ac"]');
    await page.fill('#ontoMetin', 'Varlık katmanları: doğa, toplum, tin.');
    await page.click('[data-act="onto-kaydet"]');
    // v89: ontoloji artık yazılınca şerit doğar, Ontoloji sekmesi seçili gelir
    await expect(page.locator('#dMetinBlok .ms-sekme.ms-secili')).toHaveText('Ontoloji');
    await expect(page.locator('.onto-metin')).toContainText('Varlık katmanları');
    const k = await page.evaluate(() => {
      const x = veri.kitaplar.find(y => y.ad === 'Özetli Kitap');
      return { onto: window.__ozet.okuOnto(x.id), ozet: window.__ozet.oku(x.id),
        g: x.g, ozetG: x.ozetG };
    });
    expect(k.onto).toBe('Varlık katmanları: doğa, toplum, tin.');
    expect(k.ozet, 'özet metnine dokunulmadı').toBe('Dolu özet metni.');
    expect(k.ozetG, 'tek damga tazelendi').toBeGreaterThan(100);
    expect(k.g, 'kitap damgası DEĞİŞMEZ — aynı ayrı kanal').toBe(gIlk);
    // yenileme: IDB'den geri gelir
    await page.reload();
    await rafaGec(page);
    await ozetHazir(page);
    await detayAc(page, 'Özetli Kitap');
    // v89: iki alan da dolu → şerit, varsayılan Özet; Ontoloji sekmesine geç
    await page.click('#msSekmeOnto');
    await expect(page.locator('.onto-metin')).toContainText('Varlık katmanları');
  });

  test('(B) çapraz koruma: özeti düzenlemek ontolojiyi, ontolojiyi düzenlemek özeti SİLMEZ', async ({ page }) => {
    await tohumla(page, [bitmis({ ad: 'Çift Alanlı', ozet: 'İlk özet.', ozetG: 100 })]);
    await rafAc(page);
    await ozetHazir(page);
    await detayAc(page, 'Çift Alanlı');
    // ontoloji yaz
    await page.click('[data-act="onto-ac"]');
    await page.fill('#ontoMetin', 'Kalıcı ontoloji metni.');
    await page.click('[data-act="onto-kaydet"]');
    await expect(page.locator('.onto-metin')).toContainText('Kalıcı ontoloji');
    // özeti değiştir → ontoloji durmalı (v89: önce Özet sekmesine geç, Düzenle şeritte)
    await page.click('#msSekmeOzet');
    await page.click('#dMetinBlok [data-act="oz-ac"]');
    await page.fill('#ozMetin', 'Değişen özet metni.');
    await page.click('[data-act="oz-kaydet"]');
    await expect(page.locator('.oz-metin')).toContainText('Değişen özet');
    let s = await page.evaluate(() => {
      const k = veri.kitaplar[0];
      return { ozet: window.__ozet.oku(k.id), onto: window.__ozet.okuOnto(k.id) };
    });
    expect(s.onto, 'özet yazımı ontolojiyi silmedi').toBe('Kalıcı ontoloji metni.');
    // ontolojiyi değiştir → özet durmalı (v89: Ontoloji sekmesine geç, Düzenle şeritte)
    await page.click('#msSekmeOnto');
    await page.click('#dMetinBlok [data-act="onto-ac"]');
    await expect(page.locator('#ontoMetin')).toHaveValue('Kalıcı ontoloji metni.');
    await page.fill('#ontoMetin', 'Yeni ontoloji metni.');
    await page.click('[data-act="onto-kaydet"]');
    await expect(page.locator('.onto-metin')).toContainText('Yeni ontoloji metni.');   // async yazım otursun
    s = await page.evaluate(() => {
      const k = veri.kitaplar[0];
      return { ozet: window.__ozet.oku(k.id), onto: window.__ozet.okuOnto(k.id) };
    });
    expect(s.ozet, 'ontoloji yazımı özeti silmedi').toBe('Değişen özet metni.');
    expect(s.onto).toBe('Yeni ontoloji metni.');
  });

  test('(C) GERİYE UYUM: o alanı olmayan eski IDB kaydı hatasız açılır, okuOnto boş döner', async ({ page }) => {
    await tohumla(page, [bitmis({ id: 'eski1', ad: 'Eski Kayıtlı' })]);
    await rafAc(page);
    await ozetHazir(page);
    // v80 biçiminde HAM kayıt ({m,g} — o alanı YOK) doğrudan IDB'ye
    await page.evaluate(() => new Promise((cozul, kir) => {
      const istek = indexedDB.open('kk_ozet_v1', 1);
      istek.onsuccess = () => {
        const db = istek.result;
        const tx = db.transaction('ozetler', 'readwrite');
        tx.objectStore('ozetler').put({ m: 'v80 biçiminde özet.', g: 555 }, 'eski1');
        tx.oncomplete = () => { db.close(); cozul(); };
        tx.onerror = () => kir(tx.error);
      };
      istek.onerror = () => kir(istek.error);
    }));
    const hatalar = [];
    page.on('pageerror', e => hatalar.push(String(e)));
    await page.reload();
    await rafaGec(page);
    await ozetHazir(page);
    const s = await page.evaluate(() => ({
      ozet: window.__ozet.oku('eski1'), onto: window.__ozet.okuOnto('eski1'),
      damga: window.__ozet.damga('eski1') }));
    expect(s.ozet, 'eski kayıt geçersiz olmadı').toBe('v80 biçiminde özet.');
    expect(s.onto, "o'suz kayıt boş ontoloji sayılır").toBe('');
    expect(s.damga).toBe(555);
    await detayAc(page, 'Eski Kayıtlı');
    await expect(page.locator('.oz-metin')).toContainText('v80 biçiminde özet');
    await expect(page.locator('.onto-bos .onto-ghost'), 'özet dolu → ghost çizilir').toBeVisible();
    expect(hatalar, 'sayfa hatası yok').toEqual([]);
  });

  test('(D) YEDEK: o alanı doluysa yedekte, boşsa HİÇ yok; geri yükleme döner; o\'suz eski yedek ontolojiyi KORUR', async ({ page }) => {
    await tohumla(page, [
      bitmis({ id: 'ciftli', ad: 'Çiftli Kitap', ozet: 'Yedek özeti', ozetG: 300 }),
      bitmis({ id: 'tekli', ad: 'Tekli Kitap', ozet: 'Yalnız özet', ozetG: 300 })]);
    await rafAc(page);
    await ozetHazir(page);
    await page.evaluate(() => window.__ozet.kaydetOnto('ciftli', 'Yedek ontolojisi'));
    const yedek = await page.evaluate(() => {
      const asil = window.dosyaIndir; let y = null;
      window.dosyaIndir = icerik => { y = icerik; };
      disaAktar(); window.dosyaIndir = asil; return JSON.parse(y);
    });
    expect(yedek.ozetler.ciftli.o, 'o alanı yedekte görünür').toBe('Yedek ontolojisi');
    expect(yedek.ozetler.ciftli.m).toBe('Yedek özeti');
    expect('o' in yedek.ozetler.tekli, 'boş o alanı yedeğe HİÇ yazılmaz').toBe(false);
    // yereli eski damgalı boşalt → yedekten ikisi de dönsün
    await page.evaluate(async y => {
      await window.__ozet.kaydetHam('ciftli', '', 100, '');
      iceAktar(new File([JSON.stringify(y)], 'yedek.json', { type: 'application/json' }));
    }, yedek);
    await expect.poll(() => page.evaluate(() => window.__ozet.okuOnto('ciftli')),
      { timeout: 10000 }).toBe('Yedek ontolojisi');
    expect(await page.evaluate(() => window.__ozet.oku('ciftli'))).toBe('Yedek özeti');
    // o'suz ESKİ yedek biçimi: m güncellenir, mevcut ontolojiye DOKUNULMAZ
    await page.evaluate(async () => {
      const y = { surum: 2, kitaplar: [],
        ozetler: { ciftli: { m: 'Eski yedekten özet', g: Date.now() + 5000 } } };
      iceAktar(new File([JSON.stringify(y)], 'eski-yedek.json', { type: 'application/json' }));
    });
    await expect.poll(() => page.evaluate(() => window.__ozet.oku('ciftli')),
      { timeout: 10000 }).toBe('Eski yedekten özet');
    expect(await page.evaluate(() => window.__ozet.okuOnto('ciftli')),
      "o'suz yedek ontolojiyi silmedi").toBe('Yedek ontolojisi');
  });

  test('(E) uzun ontoloji sekmesinde TAM gösterilir (v89: kırpma kalktı); arama ontoloji metninde bulur; CSV sütunu', async ({ page }) => {
    const uzunOnto = 'Ontoloji girişi. ' + 'kavram katmanı '.repeat(80) + 'ONTO SONU';
    await tohumla(page, [
      bitmis({ id: 'uzunlu', ad: 'Uzun Ontolojili', ozet: 'kısa özet', ozetG: 100 }),
      bitmis({ ad: 'Sade Kitap' })]);
    await rafAc(page);
    await ozetHazir(page);
    await page.evaluate(o => window.__ozet.kaydetOnto('uzunlu', o), uzunOnto);
    await detayAc(page, 'Uzun Ontolojili');
    // v89: şerit — Ontoloji sekmesine geçince metin TAM, "Devamını göster" yok
    await page.click('#msSekmeOnto');
    await expect(page.locator('.onto-metin')).toContainText('Ontoloji girişi');
    await expect(page.locator('.onto-metin')).toContainText('ONTO SONU');
    await expect(page.locator('[data-act="onto-devam"]')).toHaveCount(0);
    await page.click('#ortuDetay .sheet-kapat');
    // arama: yalnız ontolojide geçen sözcük kitabı bulur
    await page.fill('#arama', 'kavram katmanı');
    await expect(page.locator('#liste .kart')).toHaveCount(1);
    await expect(page.locator('#liste .kart')).toContainText('Uzun Ontolojili');
    await page.fill('#arama', '');
    // CSV: Ontoloji sütunu Özet'in hemen sağında, tam metin
    const csv = await aktarimYakala(page, 'csvAktar()');
    const baslik = csv.icerik.replace(/^﻿/, '').split('\r\n')[0].split(';');
    expect(baslik[baslik.length - 2]).toBe('Özet');
    expect(baslik[baslik.length - 1]).toBe('Ontoloji');
    expect(csv.icerik, 'tam metin — kırpma yok').toContain('ONTO SONU');
  });
});

test.describe('G80 ontoloji — içe aktarım (tek dosya, tek onay)', () => {

  test('(F) önizleme iki sayıyı ayrı gösterir; ontosuz kayıt mevcut ontolojiye dokunmaz; toast iki sayılı', async ({ page }) => {
    await tohumla(page, [
      bitmis({ id: 'bosk', ad: 'Boş Kitap', yazar: 'Yazar A' }),
      bitmis({ id: 'ontolu', ad: 'Ontolu Kitap', yazar: 'Yazar B' }),
      bitmis({ id: 'salt', ad: 'Salt Ontoloji', yazar: 'Yazar C', ozet: 'değişmeyecek özet', ozetG: 50 })]);
    await rafAc(page);
    await ozetHazir(page);
    await page.evaluate(() => window.__ozet.kaydetOnto('ontolu', 'Korunacak eski ontoloji'));
    await ayarlarAc(page);
    await dosyadanYukle(page, jsonDosya({ surum: 1, ozet: [
      { ad: 'Boş Kitap', yazar: 'Yazar A', ozet: 'Dosyadan özet.', ontoloji: 'Dosyadan ontoloji.' },
      { ad: 'Ontolu Kitap', yazar: 'Yazar B', ozet: 'Yalnız özet gelen kayıt.' },
      { ad: 'Salt Ontoloji', yazar: 'Yazar C', ontoloji: 'Özetsiz kayıttan ontoloji.' }] }, 'ozetler.json'));
    await expect(page.locator('#zgOzetIceOrtu')).toHaveClass(/acik/);
    const ozet = page.locator('#zgOzetIceOrtu .zg-ozet');
    await expect(ozet).toContainText('2 kitapta boş özet dolacak');
    await expect(ozet).toContainText('2 kitapta ontoloji yazılacak');
    await expect(page.locator('#zgOzetIceOrtuGovde')).toContainText('Ontolojisi yazılacaklar');
    // buton sayısı = kitap birleşimi (3), alan toplamı (4) değil
    await expect(page.locator('[data-act="zg-ozet-uygula"]')).toContainText('(3)');
    await page.click('[data-act="zg-ozet-uygula"]');
    await expect(page.locator('#toast')).toContainText('2 kitabın özeti ve 2 kitabın ontolojisi dosyadan yazıldı');
    const s = await page.evaluate(() => ({
      bosOzet: window.__ozet.oku('bosk'), bosOnto: window.__ozet.okuOnto('bosk'),
      ontoluOzet: window.__ozet.oku('ontolu'), ontoluOnto: window.__ozet.okuOnto('ontolu'),
      saltOzet: window.__ozet.oku('salt'), saltOnto: window.__ozet.okuOnto('salt') }));
    expect(s.bosOzet).toBe('Dosyadan özet.');
    expect(s.bosOnto).toBe('Dosyadan ontoloji.');
    expect(s.ontoluOzet).toBe('Yalnız özet gelen kayıt.');
    expect(s.ontoluOnto, 'ontoloji alanı olmayan kayıt DOKUNMADI').toBe('Korunacak eski ontoloji');
    expect(s.saltOzet, 'özetsiz kayıt mevcut özeti ezmedi').toBe('değişmeyecek özet');
    expect(s.saltOnto).toBe('Özetsiz kayıttan ontoloji.');
  });
});

test.describe('G80 ontoloji — senkron', () => {

  test('(H) ozetBirlesim o taşır: LWW + çakışma eki + kasıtlı silme + damgasız yedek', async ({ page }) => {
    await rafAc(page);
    const s = await page.evaluate(() => {
      const f = window.__senkron.ozetBirlesim;
      const ek = f({ m: 'aynı', g: 300, o: 'A ontolojisi' }, { m: 'aynı', g: 250, o: 'B ontolojisi' });
      return {
        /* iki taraf da dolu + farklı ise m gibi ÇAKIŞMA EKİ üretir (kayıp yok);
           saf LWW yalnız karşı taraf boş/kapsanmışken — m kurallarının simetrisi */
        lww: f({ m: 'aynı', g: 300, o: 'yeni onto' }, { m: 'aynı', g: 200, o: '' }),
        ek,
        ek2: f(ek, { m: 'aynı', g: 250, o: 'B ontolojisi' }),
        silme: f({ m: 'x', g: 300, o: '' }, { m: 'x', g: 250, o: 'silinen onto' }),
        yedek: f({ m: '', g: 0 }, { m: '', g: 0, o: 'yedekten onto' }),
        sema: window.__senkron.SEMA_SURUM
      };
    });
    expect(s.lww.o, 'yeni damgalı ontoloji kazanır').toBe('yeni onto');
    expect(s.lww.m).toBe('aynı');
    expect(s.ek.o).toContain('A ontolojisi');
    expect(s.ek.o).toContain('B ontolojisi');
    expect(s.ek.o.indexOf('A ontolojisi'), 'yeni damgalı önde').toBeLessThan(s.ek.o.indexOf('B ontolojisi'));
    expect(s.ek.g, 'ek üretilince taze damga').toBeGreaterThan(300);
    expect(s.ek.m, 'özet metni etkilenmez').toBe('aynı');
    expect(s.ek2.o, 'ikinci tur ek üretmez (idempotent)').toBe(s.ek.o);
    expect(s.silme.o, 'kasıtlı silme (boş + taze damga) kazanır').toBe('');
    expect(s.yedek.o, 'damgasız dış yedekten ontoloji taşınır').toBe('yedekten onto');
    expect(s.sema, 'SEMA 5: eski istemci o alanını sildiği için donar').toBe(5);
  });

  test('(I) düğüm: dolu o PATCH gövdesinde, boş o HİÇ yazılmaz; uzak o yerele iner', async ({ page }) => {
    await tohumla(page, [
      bitmis({ id: 'ontolu1', ad: 'Ontolu Senkron', ozet: 'Özet metni', ozetG: 700 }),
      bitmis({ id: 'ontosuz1', ad: 'Ontosuz Senkron', ozet: 'Sade özet', ozetG: 700 }),
      bitmis({ id: 'inen1', ad: 'İnen Kitap' })]);
    const oda = await sahteOda(page,
      { inen1: 900 }, { inen1: { m: 'Uzak özet', g: 900, o: 'Uzak ontoloji' } });
    await rafAc(page);
    await ozetHazir(page);
    await page.evaluate(() => window.__ozet.kaydetOnto('ontolu1', 'Giden ontoloji'));
    await senkronBaslat(page);
    await expect.poll(() => oda.ozetPatchler.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    const kayitBul = id => {
      for(const p of oda.ozetPatchler) if(p['k/' + id]) return p['k/' + id];
      return null;
    };
    const ontolu = kayitBul('ontolu1'), ontosuz = kayitBul('ontosuz1');
    expect(ontolu, 'ontolojili kayıt gönderildi').not.toBeNull();
    expect(ontolu.o).toBe('Giden ontoloji');
    expect(ontolu.m, 'özet aynı pakette').toBe('Özet metni');
    expect(ontosuz, 'ontolojisiz kayıt da gönderildi').not.toBeNull();
    expect('o' in ontosuz, 'boş o alanı pakete HİÇ yazılmaz').toBe(false);
    // indirme: uzak kayıttaki o yerel IDB/belleğe iner
    await expect.poll(() => page.evaluate(() => window.__ozet.okuOnto('inen1')),
      { timeout: 10000 }).toBe('Uzak ontoloji');
    expect(await page.evaluate(() => window.__ozet.oku('inen1'))).toBe('Uzak özet');
  });
});
