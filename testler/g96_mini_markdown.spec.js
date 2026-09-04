'use strict';
/* G96 — MİNİ MARKDOWN (v101): özet ve ontoloji metinlerinde üç öğe işlenir.

   NEDEN: özetler markdown kalın işaretiyle yazılmış (gerçek veride 243
   kayıttan 185'i, 2487 kullanım; ayrıca 3 gerçek *italik*) ve ekranda HAM
   görünüyordu — okur yıldızlı metin görüyordu.

   BU DOSYANIN KİLİTLEDİĞİ SÖZLEŞME:
   - İŞLENEN ÜÇ ÖĞE: **kalın** → <strong> · *italik* → <em> · boş satır =
     paragraf (<p>); paragraf İÇİNDEKİ tek satır sonu <br> olur.
   - İŞLENMEYEN her şey HAM kalır: başlık (#), madde (-), numaralı liste,
     bağlantı [](), kod (`), tablo (|), alt-çizgi vurgu (_). KARAR: bu
     metinlerde hiçbiri yok; ileride kazara girerse ham görünmesi sessizce
     biçimlenmesinden güvenli.
   - SIRA: kalın ÖNCE, italik SONRA — tek-yıldız kuralı çift-yıldızı YEMEZ.
   - GÜVENLİK: metin içe aktarılan dosyadan gelir, güvenilmezdir. ÖNCE esc(),
     SONRA yıldız dönüşümü; üretilen tek etiketler <p>/<br>/<strong>/<em>.
   - Yıldızın hemen içi boşluk olamaz (`a * b * c` italiğe dönmez); kapanmayan
     yıldız ham kalır.
   - DÜZENLEME kutusu HAM metni gösterir (dönüştürülmüş hâli değil) — yoksa
     kaydetme yıldızları silerdi.
   - CSS: oz-/onto-metin'de pre-wrap YOK (satır sonu artık <br>); ts-govde
     (taslak önizlemesi) ham esc bastığı için pre-wrap'i KORUR.
   (Mutasyon: kalın dönüşümünü kaldır → A kırmızı; italiği kalından ÖNCE
    çalıştır → B kırmızı; esc'i dönüşümden SONRA yap → E kırmızı.) */
const fs = require('fs');
const path = require('path');
const { test, expect, tohumla, sahteKitap, bugunISO, rafAc } = require('./yardim');

function bitmis(ek) {
  return sahteKitap(Object.assign({ durum: 'bitti', bitisTarihi: bugunISO(-30) }, ek));
}
async function detayAc(page, ad) {
  await page.click('#liste .kart:has-text("' + ad + '")');
  await expect(page.locator('#ortuDetay')).toHaveClass(/acik/);
}
const ozetHtml = page => page.locator('#ortuDetay .oz-metin').innerHTML();
const ontoHtml = page => page.locator('#ortuDetay .onto-metin').innerHTML();

/* Tek kitap + özet metni kur; özet GERÇEK depoya (IDB) yazılır — içe aktarılan
   metnin gittiği yer orası. */
async function kur(page, ozet, onto) {
  await tohumla(page, [bitmis({ id: 'md1', ad: 'Markdown Kitabı' })]);
  await rafAc(page);
  await page.evaluate(() => window.__ozet.hazirBekle());
  await page.evaluate(([o, n]) => Promise.all([
    o == null ? null : window.__ozet.kaydet('md1', o),
    n == null ? null : window.__ozet.kaydetOnto('md1', n)]), [ozet, onto]);
  await detayAc(page, 'Markdown Kitabı');
}

test.describe('G96 mini markdown (v101)', () => {

  test('A) kalın: **…** <strong> olur, ham yıldız kalmaz', async ({ page }) => {
    await kur(page, 'Bu bir **kalın** parça ve **ikinci kalın** da var.');
    expect(await ozetHtml(page))
      .toBe('<p>Bu bir <strong>kalın</strong> parça ve <strong>ikinci kalın</strong> da var.</p>');
    await expect(page.locator('#ortuDetay .oz-metin')).not.toContainText('*');
    // gerçek veri deseni: derlemede öykü adları bitişik kalınlarla sıralanır
    await page.evaluate(() => window.__ozet.kaydet('md1', '**Köpekli Kadın**, **6 Numaralı Koğuş**.'));
    await page.evaluate(() => detayAc('md1'));
    expect(await ozetHtml(page))
      .toBe('<p><strong>Köpekli Kadın</strong>, <strong>6 Numaralı Koğuş</strong>.</p>');
  });

  test('B) italik ve SIRA: tek yıldız kuralı çift yıldızı yemez', async ({ page }) => {
    await kur(page, '**kalın** ve *italik* yan yana.');
    expect(await ozetHtml(page))
      .toBe('<p><strong>kalın</strong> ve <em>italik</em> yan yana.</p>');
    /* SIRA KANITI: italik önce çalışsaydı **a** içindeki ilk iki yıldız
       <em></em>'e dönüp kalın kaybolurdu. Kalın hâlâ ayakta mı? */
    await page.evaluate(() => window.__ozet.kaydet('md1', '*Percy Jackson ve Bronz Ejderha* — **1831** yılı.'));
    await page.evaluate(() => detayAc('md1'));
    const h = await ozetHtml(page);
    expect(h).toContain('<em>Percy Jackson ve Bronz Ejderha</em>');
    expect(h).toContain('<strong>1831</strong>');
    expect(h).not.toContain('*');
  });

  test('C) paragraf: boş satır <p>, paragraf içi satır sonu <br>', async ({ page }) => {
    await kur(page, 'BAĞLAM\nBirinci paragrafın gövdesi.\n\nİkinci paragraf.');
    expect(await ozetHtml(page))
      .toBe('<p>BAĞLAM<br>Birinci paragrafın gövdesi.</p><p>İkinci paragraf.</p>');
    // birden çok boş satır TEK ayraç; baştaki/sondaki boşluk paragraf üretmez
    await page.evaluate(() => window.__ozet.kaydet('md1', '\n\nbir\n\n\n\niki\n\n'));
    await page.evaluate(() => detayAc('md1'));
    expect(await ozetHtml(page)).toBe('<p>bir</p><p>iki</p>');
  });

  test('D) işlenmeyen markdown öğeleri HAM kalır', async ({ page }) => {
    await kur(page, '# Başlık\n- madde\n1. numaralı\n[bağ](http://x)\n`kod`\n| tablo |\n_alt çizgi_');
    const h = await ozetHtml(page);
    for (const ham of ['# Başlık', '- madde', '1. numaralı', '[bağ](http://x)', '`kod`', '| tablo |', '_alt çizgi_'])
      expect(h).toContain(ham);
    // hiçbiri etikete dönüşmedi: yalnız p/br üretildi
    expect([...new Set(h.match(/<\/?[a-z]+[^>]*>/g) || [])].sort()).toEqual(['</p>', '<br>', '<p>']);
    expect(await page.locator('#ortuDetay .oz-metin').evaluate(
      e => ['h1', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'table'].filter(t => !!e.querySelector(t)))).toEqual([]);
  });

  test('E) XSS: ham HTML kaçırılır, canlı etiket üretilmez', async ({ page }) => {
    await kur(page, '<img src=x onerror="window.__xss=1">\n\n<script>window.__xss=2<\/script>\n\n**<b>kalın içinde etiket</b>**');
    const h = await ozetHtml(page);
    expect(h).toContain('&lt;img src=x onerror="window.__xss=1"&gt;');
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('<strong>&lt;b&gt;kalın içinde etiket&lt;/b&gt;</strong>');
    /* üretilen etiket kümesi yalnız p/strong — girdide tek satır sonu yok,
       bu yüzden <br> de yok (üç blok boş satırla ayrılmış) */
    expect([...new Set(h.match(/<\/?[a-z]+[^>]*>/g) || [])].sort())
      .toEqual(['</p>', '</strong>', '<p>', '<strong>']);
    // DOM'da canlı düğüm ve yan etki yok
    expect(await page.locator('#ortuDetay .oz-metin').evaluate(
      e => e.querySelectorAll('img,script,b').length)).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('F) ontoloji sekmesi aynı dönüşümden geçer', async ({ page }) => {
    await kur(page, 'Özet gövdesi **kalın**.', 'Ontoloji **kavramı** ve *vurgu*.\n\nİkinci paragraf.');
    await page.click('#ortuDetay #msSekmeOnto');
    expect(await ontoHtml(page))
      .toBe('<p>Ontoloji <strong>kavramı</strong> ve <em>vurgu</em>.</p><p>İkinci paragraf.</p>');
  });

  test('G) kalınsız düz metin bozulmaz: içerik birebir korunur', async ({ page }) => {
    const duz = 'KONU: Kendini "olağanüstü insan" sayan yoksul bir öğrencinin çöküşü.\n\n'
      + 'BAĞLAM VE YAZILIŞ\n1866\'da tefrika edildi & yayıncı baskısı altında yazıldı.\n\n'
      + 'Üçüncü paragraf: 5 * 3 = 15 gibi bir çarpım da italiğe dönmemeli.';
    await kur(page, duz);
    const h = await ozetHtml(page);
    expect(h).not.toContain('<strong>');
    expect(h).not.toContain('<em>');
    expect(h.match(/<p>/g).length).toBe(3);
    expect(h).toContain('5 * 3 = 15');   // yıldızın iki yanı boşluk → italik DEĞİL
    // etiketleri soyunca metin birebir (satır sonu ve paragraf ayracı geri konur)
    const geri = h.replace(/<\/p><p>/g, '\n\n').replace(/^<p>|<\/p>$/g, '').replace(/<br>/g, '\n')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    expect(geri).toBe(duz);
  });

  test('H) düzenleme kutusu HAM metni gösterir (yıldızlar durur)', async ({ page }) => {
    const ham = 'Bu **kalın** ve *italik* metin.';
    await kur(page, ham);
    await page.click('#ortuDetay [data-act="oz-ac"]');
    expect(await page.inputValue('#ozMetin')).toBe(ham);
  });

  test('I) kaynak sözleşmesi: sw ≥ v101, oz/onto-metin pre-wrap YOK, ts-govde KORUR', async ({ page }) => {
    const kok = path.join(__dirname, '..');
    const sw = fs.readFileSync(path.join(kok, 'sw.js'), 'utf8');
    const m = sw.match(/const CACHE = ONEK \+ '-v(\d+)';/);
    expect(m, 'sw CACHE sürüm satırı').toBeTruthy();
    expect(parseInt(m[1])).toBeGreaterThanOrEqual(101);
    // canlı hesaplanmış stil: dönüşüm <br> ürettiği için pre-wrap çift sayardı
    await kur(page, 'bir\niki');
    expect(await page.locator('#ortuDetay .oz-metin')
      .evaluate(e => getComputedStyle(e).whiteSpace)).toBe('normal');
    const html = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
    expect(html).toContain('.ts-govde{white-space:pre-wrap}');
  });
});
