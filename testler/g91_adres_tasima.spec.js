'use strict';
/* G91 — ADRES TAŞIMA: /kitaplik → /pinakes (v94).

   SÖZLEŞMELER:
   - İki adres AYNI ORIGIN'dir (dessn7-bit.github.io): localStorage/IDB
     kendiliğinden ortak; Cache Storage da ortak olduğundan sw activate
     temizliği KENDİ önek ailesiyle sınırlıdır — kardeş adresin kovasına
     dokunmaz. sw önbellek adı scope'tan türer: /pinakes → pinakes-v94,
     eski yol → kitaplik-v94.
   - ESKİ adreste (/kitaplik/) Ayarlar'ın üstünde taşıma şeridi + "Taşıma
     yedeğini indir": normal yedek + KAPAKLAR (base64) + senkron odası +
     tema/görünüm tercihi. Kökte ve yeni adreste şerit görünmez.
   - YENİ adreste (/pinakes/) kütüphane boşsa karşılama; yedek yüklenince
     doğrulama özeti (kitap/özet/ontoloji/kapak/not + senkron) ve
     "Uygulamayı başlat". Yükleme AYNI iceAktar borusundan geçer.
   - Yedekteki senkron odası yalnız bu cihazda oda YOKSA yazılır.

   (Mutasyon 1: kk-ice-bitti dispatch kaldırılır → rapor vakaları kırmızı.
    Mutasyon 2: sw activate önek filtresi eski haline döner → kardeş-kova
    vakası kırmızı.) */
const { test, expect, tohumla, sahteKitap, ayarlarAc } = require('./yardim');
const fs = require('fs');
const path = require('path');

/* 2×2 kırmızı PNG — kapak taklidi (yardim.js KAPAK_PNG deseni) */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGOoiDKqiDJigFAAHZYEEWc+D7MAAAAASUVORK5CYII=';
const PNG_DATAURL = 'data:image/png;base64,' + PNG_B64;

test.describe('G91 sw — önek scope\'tan, temizlik önek-sınırlı', () => {

  test('CACHE adı yola göre; activate kardeş adresin kovasına dokunmaz', async () => {
    const kaynak = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    /* v95: sürüm kaynaktan çekilir (g50 deseni) — anahtarlar sabit yazılıydı,
       her CACHE artışı vakayı kırıyordu. Niyet sürümden bağımsız: yalnız
       KENDİ önekinin bayat kovası silinir, kardeş önek + OCR kovası durur. */
    const N = Number(kaynak.match(/const CACHE = ONEK \+ '-v(\d+)'/)[1]);
    async function aktive(yol){
      const dinleyiciler = {};
      const silinen = [];
      const sahteSelf = { location: { pathname: yol },
        addEventListener: (ad, cb) => { dinleyiciler[ad] = cb; },
        skipWaiting: () => {}, clients: { claim: () => {} } };
      const sahteCaches = {
        keys: () => Promise.resolve(['kitaplik-v' + (N - 1), 'kitaplik-v' + N,
          'pinakes-v' + (N - 1), 'pinakes-v' + N, 'kk_ocr_paket_v1']),
        delete: k => { silinen.push(k); return Promise.resolve(true); },
        open: () => Promise.resolve({ addAll: () => Promise.resolve(),
          match: () => Promise.resolve(undefined), put: () => Promise.resolve() })
      };
      new Function('self', 'caches', kaynak)(sahteSelf, sahteCaches);
      let soz = Promise.resolve();
      dinleyiciler.activate({ waitUntil: p => { soz = p; } });
      await soz;
      return silinen;
    }
    expect(await aktive('/kitaplik/sw.js'),
      'eski adres yalnız KENDİ eski sürümünü siler; OCR ve pinakes kovaları durur')
      .toEqual(['kitaplik-v' + (N - 1)]);
    expect(await aktive('/pinakes/sw.js'),
      'yeni adres yalnız pinakes-eskiyi siler — kitaplik kovaları DURUR')
      .toEqual(['pinakes-v' + (N - 1)]);
  });
});

test.describe('G91 eski adres — taşıma şeridi ve taşıma yedeği', () => {

  test('şerit yalnız /kitaplik/ altında görünür; kökte görünmez', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Şerit Kitabı' })]);
    await page.goto('/kitaplik/index.html');
    await ayarlarAc(page);
    await expect(page.locator('#tasimaSeridi')).toBeVisible();
    await expect(page.locator('#tasimaSeridi')).toContainText('dessn7-bit.github.io/pinakes');
    await expect(page.locator('[data-act="tasima-yedek"]')).toBeVisible();
    // karşılama eski adreste yok
    await expect(page.locator('#tasimaKarsilama')).toBeHidden();
  });

  test('kökte ne şerit ne karşılama (mevcut testlerin dünyası değişmedi)', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Kök Kitabı' })]);
    await page.goto('/');
    await ayarlarAc(page);
    await expect(page.locator('#tasimaSeridi')).toBeHidden();
    await expect(page.locator('#tasimaKarsilama')).toBeHidden();
  });

  test('taşıma yedeği: kitap + özet/ontoloji + KAPAK base64 + senkron odası + tercihler', async ({ page }) => {
    const k = sahteKitap({ ad: 'Yedek Kitabı', puan: 9,
      notlar: [{ id: 'n1', tip: 'alinti', metin: 'satır', sayfa: 3 }] });
    await tohumla(page, [k], {
      kk_senkron_v1: { oda: 'tasima-odasi', cihaz: 'telefon' },
      kk_tema_v1: 'karanlik' });
    await page.goto('/kitaplik/index.html');
    const yedek = await page.evaluate(async ([id, png]) => {
      await window.__ozet.kaydetHam(id, 'ÖZET METNİ', Date.now(), '{"kavram":1}');
      const bayt = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      await window.__kapak.yaz(id, new Blob([bayt], { type: 'image/png' }));
      return await tasimaYedegiUret();
    }, [k.id, PNG_B64]);
    expect(yedek.tasima).toBe(1);
    expect(yedek.kitaplar.length).toBe(1);
    expect(yedek.kitaplar[0].notlar.length, 'notlar yedek gövdesinde').toBe(1);
    expect(yedek.ozetler[k.id].m).toBe('ÖZET METNİ');
    expect(yedek.ozetler[k.id].o, 'ontoloji özetle birlikte').toBe('{"kavram":1}');
    expect(String(yedek.kapaklar[k.id]).indexOf('data:image/'), 'kapak base64 gömüldü').toBe(0);
    expect(yedek.senkronAyar).toEqual({ oda: 'tasima-odasi', cihaz: 'telefon' });
    expect(yedek.tercihler.tema).toBe('karanlik');
  });
});

test.describe('G91 yeni adres — karşılama, yükleme, doğrulama özeti', () => {

  function tasimaYedegi(){
    const k1 = sahteKitap({ ad: 'Gelen Bir', puan: 8, durum: 'bitti',
      bitisTarihi: '2026-01-05',
      notlar: [{ id: 'n1', tip: 'alinti', metin: 'ilk satır', sayfa: 1 },
               { id: 'n2', tip: 'not', metin: 'düşünce', sayfa: 2 }],
      okumalar: [{ bas: '2025-01-01', bit: '2025-02-01', puan: 7, not: '' }],
      kapakYerel: true });
    const k2 = sahteKitap({ ad: 'Gelen İki', tur: 'Roman' });
    const k3 = sahteKitap({ ad: 'Gelen Üç' });
    return { surum: 2, tasima: 1, kitaplar: [k1, k2, k3], hedef: {},
      ozetler: { [k1.id]: { m: 'BİR ÖZETİ', g: 5, o: '{"onto":1}' },
                 [k2.id]: { m: 'İKİ ÖZETİ', g: 5 } },
      kapaklar: { [k1.id]: PNG_DATAURL },
      senkronAyar: { oda: 'gelen-oda', cihaz: 'eski-cihaz' },
      tercihler: { tema: 'karanlik' } };
  }

  test('boş kütüphane karşılaması; yükleme → rakamlar; veri birebir; başlat görünür', async ({ page }) => {
    await tohumla(page, []);
    await page.goto('/pinakes/index.html');
    const kart = page.locator('#tasimaKarsilama');
    await expect(kart).toBeVisible();
    await expect(kart).toContainText('Eski adreste');
    const y = tasimaYedegi();
    const [k1, k2] = y.kitaplar;
    await page.locator('#tasimaDosya').setInputFiles({
      name: 'pinakes-tasima.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(y)) });
    // doğrulama özeti — rakamlar ekranda
    await expect(kart).toContainText('rakamları doğrula');
    await expect(kart).toContainText('3');           // kitap
    await expect(kart).toContainText('2');           // özet ve not sayısı 2
    await expect(kart).toContainText('1');           // ontoloji + kapak
    await expect(kart).toContainText('Senkron odası: geldi');
    await expect(kart).toContainText('Hatırlatma');  // bildirim yeniden kurulmalı notu
    await expect(page.locator('[data-act="tasima-basla"]')).toBeVisible();
    // veri birebir: kitap alanları, özet+ontoloji, kapak blobu, senkron ayarı
    const d = await page.evaluate(async ([id1, id2]) => {
      const b = await window.__kapak.oku(id1);
      const k = veri.kitaplar.find(x => x.id === id1);
      return {
        n: veri.kitaplar.length,
        puan: k.puan, notlar: k.notlar.length, okumalar: k.okumalar.length,
        kapakYerel: k.kapakYerel,
        ozet1: window.__ozet.oku(id1), onto1: window.__ozet.okuOnto(id1),
        ozet2: window.__ozet.oku(id2),
        blobBoy: b ? b.size : 0,
        senkron: JSON.parse(localStorage.getItem('kk_senkron_v1')),
        tema: localStorage.getItem('kk_tema_v1')
      };
    }, [k1.id, k2.id]);
    expect(d.n).toBe(3);
    expect(d.puan).toBe(8);
    expect(d.notlar, 'notlar/alıntılar geldi').toBe(2);
    expect(d.okumalar, 'okuma geçmişi geldi').toBe(1);
    expect(d.kapakYerel).toBe(true);
    expect(d.ozet1).toBe('BİR ÖZETİ');
    expect(d.onto1, 'ontoloji geldi').toBe('{"onto":1}');
    expect(d.ozet2).toBe('İKİ ÖZETİ');
    expect(d.blobBoy, 'kapak blobu IDB\'ye yazıldı').toBeGreaterThan(0);
    expect(d.senkron.oda, 'senkron odası yedekten kuruldu').toBe('gelen-oda');
    expect(d.tema).toBe('karanlik');
  });

  test('bu cihazda oda VARSA yedekteki oda EZMEZ; kütüphane doluysa karşılama görünmez', async ({ page }) => {
    await tohumla(page, [sahteKitap({ ad: 'Yerli Kitap' })],
      { kk_senkron_v1: { oda: 'yerli-oda', cihaz: 'buradaki' } });
    await page.goto('/pinakes/index.html');
    await expect(page.locator('#tasimaKarsilama'), 'dolu kütüphanede karşılama yok').toBeHidden();
    await page.evaluate(y =>
      iceAktar(new File([JSON.stringify(y)], 't.json', { type: 'application/json' })),
      tasimaYedegi());
    await expect.poll(() => page.evaluate(() => veri.kitaplar.length)).toBe(4);
    const oda = await page.evaluate(() => JSON.parse(localStorage.getItem('kk_senkron_v1')).oda);
    expect(oda, 'mevcut oda korundu').toBe('yerli-oda');
  });

  test('NORMAL yedek (kapaksız/odasız eski biçim) aynı borudan sorunsuz geçer', async ({ page }) => {
    await tohumla(page, []);
    await page.goto('/pinakes/index.html');
    const k = sahteKitap({ ad: 'Eski Biçim' });
    await page.evaluate(y =>
      iceAktar(new File([JSON.stringify(y)], 'y.json', { type: 'application/json' })),
      { surum: 2, kitaplar: [k], hedef: {} });
    await expect(page.locator('#tasimaKarsilama')).toContainText('rakamları doğrula');
    await expect(page.locator('#tasimaKarsilama')).toContainText('0 kapak');
    await expect(page.locator('#tasimaKarsilama'))
      .toContainText('yedekte yoktu');   // senkron satırı dürüst
  });
});
