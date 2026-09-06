'use strict';
/* G106 — satır sonu sözleşmesi (v107).

   SORUN: Git kurulumu sistem düzeyinde core.autocrlf=true getiriyor. Depoda
   saklanan içerik %100 LF'ti, ama autocrlf CHECKOUT tarafında dosyaları CRLF
   olarak indiriyordu. Git'in eline geçen dosya (checkout, stash geri alma,
   mutasyon denetimi sonrası "git checkout -- dosya") CRLF, doğrudan yazılan
   dosya LF kalıyordu — aynı depoda iki sözleşme. 17 dosya bu yüzden CRLF'ti.
   Git bunu GÖSTERMEZ (karşılaştırırken normalize eder, "temiz" der); ama çok
   satırlı metin düzenlemesi LF arayıp CRLF bulunca eşleşme SESSİZCE kaçar.

   ÇÖZÜM İKİ KATMANLI:
   1) .gitattributes "* text=auto eol=lf" — checkout kaynağını kapatır,
      core.autocrlf'i ezer ve makineye değil DEPOYA bağlıdır.
   2) Bu grup — başka bir kaynaktan (editör, betik, elle yapıştırma) gelecek
      kaçağı sprint kapısında tutar. Dosya listesi git'ten geldiği için yeni
      dosya eklendiğinde kendini günceller. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('./yardim');

const KOK = path.join(__dirname, '..');
const CR = 13;
const METIN_UZANTI = ['.js', '.html', '.json', '.md', '.txt', '.toml', '.css'];
const UZANTISIZ_METIN = ['.gitattributes', '.gitignore'];
const ATLA_DIZIN = ['node_modules', '.git', 'test-results', 'playwright-report'];

function metinMi(yol) {
  const ad = path.basename(yol);
  if (UZANTISIZ_METIN.includes(ad)) return true;
  return METIN_UZANTI.includes(path.extname(ad).toLowerCase());
}

/* Kapsam = git'in İZLEDİĞİ dosyalar. Çalışma klasöründeki geçici çıktılar
   (_gozkontrol_ciktisi, *.saklandi) sözleşmenin parçası değil. git yoksa
   dizin yürüyüşüne düşer — test git'in yokluğundan kırmızı yanmasın. */
function izlenenler() {
  try {
    const cikti = execFileSync('git', ['ls-files', '-z'], { cwd: KOK, encoding: 'utf8', windowsHide: true });
    return cikti.split(String.fromCharCode(0)).filter(Boolean);
  } catch (e) {
    const bulunan = [];
    (function yuru(dizin, onek) {
      for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
        if (ATLA_DIZIN.includes(g.name)) continue;
        if (g.name.startsWith('_')) continue;
        const goreli = onek ? onek + '/' + g.name : g.name;
        if (g.isDirectory()) yuru(path.join(dizin, g.name), goreli);
        else bulunan.push(goreli);
      }
    })(KOK, '');
    return bulunan;
  }
}

function crTara(bayt) {
  const yerler = [];
  let i = bayt.indexOf(CR);
  while (i !== -1 && yerler.length < 5) { yerler.push(i); i = bayt.indexOf(CR, i + 1); }
  return yerler;
}

test.describe('G106 — satır sonu sözleşmesi', () => {

  test('tarayıcı gerçekten CR yakalıyor (vaka boş yere yeşil yanmasın)', async () => {
    /* Mutasyon sigortası: crTara bozulursa ya da hep boş dizi dönerse asıl
       vaka sessizce yeşil kalırdı. Sentetik CRLF ile kanıt. */
    const sahte = Buffer.from([0x61, CR, 0x0A, 0x62]);
    expect(crTara(sahte)).toEqual([1]);
    expect(crTara(Buffer.from([0x61, 0x0A, 0x62]))).toEqual([]);
  });

  test('izlenen metin dosyalarının hiçbirinde CR (0x0D) yok', async () => {
    const dosyalar = izlenenler().filter(metinMi);
    expect(dosyalar.length).toBeGreaterThan(50);       // kapsam gerçekten doldu mu
    const kirli = [];
    for (const d of dosyalar) {
      const tam = path.join(KOK, d);
      if (!fs.existsSync(tam)) continue;
      const yerler = crTara(fs.readFileSync(tam));
      if (yerler.length) kirli.push(d + ' (ilk konumlar: ' + yerler.join(', ') + ')');
    }
    expect(kirli, 'CRLF sızmış dosyalar:\n  ' + kirli.join('\n  ')).toEqual([]);
  });

  test('.gitattributes satır sonu kuralını taşıyor', async () => {
    const yol = path.join(KOK, '.gitattributes');
    expect(fs.existsSync(yol), '.gitattributes silinirse checkout yeniden CRLF üretir').toBe(true);
    const m = fs.readFileSync(yol, 'utf8');
    /* eol=lf ŞART: text=auto tek başına yalnız depoyu normalize eder,
       çalışma kopyasını core.autocrlf'e bırakır. */
    expect(m).toMatch(/^\s*\*\s+text=auto\s+eol=lf\s*$/m);
    /* ikili dosyalar muaf kalmalı — aksi halde git font/ikonlara dokunur */
    for (const u of ['*.png', '*.woff2', '*.gz']) expect(m).toContain(u);
  });

});
