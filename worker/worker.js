/* kitaplik-ara — Kitaplık PWA için çok kaynaklı kitap arama + keşif proxy'si
   Uçlar:
     GET /ara?q=...              → { sonuclar:[{ad,yazar,yayinevi,yil,sayfa,kapak,kaynak}], kaynaklar }
     GET /turler                 → { turler:[{seo,ad,kitapSayisi}] }                       (78 tür)
     GET /tur?slug=..&sayfa=1    → { tur:{seo,ad}, sonuclar:[{ad,yazar,puan,okuyan,kapak}], hasMore, sayfa }
     GET /saglik                 → kaynak başına canlı sayaç (asla cache'lenmez)
     GET /isbn?q=<isbn>          → { sonuclar:[{ad,yazar,yayinevi,yil,sayfa,kapak,isbn,kaynak,cevirmen,dil}], kaynaklar }
                                   Türkçe baskılar için 1000Kitap künyesi (v97); bulunamazsa boş dizi, asla fırlatmaz
     POST /ozet-taslak           → { durum:'tamam', metin, kaynak:'1000Kitap', dil:'tr' } |
                                   { durum:'bulunamadi' } | { durum:'hata', mesaj }  (v4)
   Kaynaklar: Goodreads auto_complete · 1000Kitap SSR (__NEXT_DATA__) · 1000Kitap v2 API

   NEDEN WORKER: /tur ve /turler tarayıcıdan atılamaz — kaynakta CORS başlığı yok
   VE Cloudflare sade istemcileri 403'lüyor (ölçüldü: UA'sız curl → 403, gerçek
   Chrome UA'sı → 200). Proxy hem kökeni hem tarayıcı başlıklarını sağlar.

   /ozet-taslak (v4 — MODEL KALKTI): yeni eklenen kitap için kaynaklardan
   HAZIR tanıtım/açıklama metni getirir; v3'ün yapay-zekâ model çağrısı, API
   anahtarı ve günlük sayacı SİLİNDİ (kullanıcı ücretli API kullanmayacak;
   metin artık modelin değil kaynağın — uydurma riski sıfır).
   SIRA: gövde sınırı → köken kapısı → 24s aynı-kitap kilidi (maliyet değil,
   kaynaklara gereksiz yük binmesin) → KAYNAK DOĞRULAMASI → açıklama toplama.
   Açıklama önceliği: 1000Kitap (kitapCek → hakkinda.bilgi, TÜRKÇE — ölçüldü)
   > Google Books (volumeInfo.description, keyless) > Goodreads (description).
   Birden çok aday: TÜRKÇE olan; ikisi de Türkçe ise UZUN olan. Temizlik:
   HTML ayıklanır, boş satırlar teklenir, 4000'de kesilir, <80 kr reddedilir. */

const IZINLI_KOKEN = 'https://dessn7-bit.github.io';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/* Kaynak kendi sitesinin çağırdığı JSON API'si (1000kitap.com/api/... DEĞİL —
   o yol 404; ölçülen taban api.1000kitap.com/v2/). Türkçe içerik için
   Accept-Language açıkça gönderilir; yalnız YENİ uçlara eklenir, /ara'nın
   ölçülmüş davranışı değişmesin. */
const BIN1K_API = 'https://api.1000kitap.com/v2/';
const TR_BASLIK = { 'Accept-Language': 'tr-TR,tr;q=0.9' };

/* ÖNBELLEK SÜRELERİ
   - Tür listesi 7 gün: bu bir TAKSONOMİ, içerik değil. 78 türün slug seti
     pratikte hiç değişmiyor; kitapSayisi ayda bir kaç yüz oynuyor ve hiçbir
     yerde gösterilmiyor (yalnız "0 kitaplı türü eleme" kararında kullanılıyor).
     Bir haftalık gecikmenin görünür bir bedeli yok.
   - Tür sayfası 12 saat: burada GÖSTERİLEN sayı var — okur adedi ve puan
     gerekçe cümlesine giriyor. Bu sıralamalar (bir türün en çok okunan 16
     kitabı) aylar ölçeğinde oynuyor, ama gösterilen sayının yarım günden
     eski olmasına izin vermek istemiyorum: uygulama zaten kendi tarafında 24
     saat önbellekliyor, kenar önbelleğini de 24 saate çekmek en kötü durumda
     48 saatlik bir sayıyı "1000Kitap'ta X okur" diye sunardı. */
const TURLER_ONBELLEK_SN = 7 * 86400;
const TUR_ONBELLEK_SN = 12 * 3600;
/* Slug biçim kapısı: kaynağa yalnız tür-slug'ı şeklindeki metin gider
   (proxy'nin keyfi adres çağırmasını da engeller). */
const SLUG_KALIP = /^[A-Za-z0-9-]{1,60}$/;
const SAGLIK_TUR = 'Felsefe-Dusunce';   // 4114 kitaplı, kalıcı tür — teşhis sabiti
/* /isbn kenar önbelleği 24 saat: künye (yayınevi/sayfa/yıl) kararlı veri; boş
   sonuç yine no-store (/ara kuralı — geçici arıza kendini uzatmasın). */
const ISBN_ONBELLEK_SN = 86400;

/* --- /ozet-taslak sabitleri (v4) --- */
const TASLAK_GOVDE_SINIR = 4096;       // 4 KB üstü istek reddedilir
const TASLAK_KILIT_SN = 86400;         // aynı kitaba 24 saatte tek toplama (kaynak yükü)
const TASLAK_METIN_TAVAN = 4000;       // uzun tanıtım 4000 kr'de kesilir + "…"
const TASLAK_METIN_TABAN = 80;         // "Roman.", "2. baskı" gibi kırıntı özet yerine geçmez
const GB_URL = 'https://www.googleapis.com/books/v1/volumes';   // keyless (index.html'in referrer-kısıtlı anahtarı worker'dan KULLANILAMAZ)

class KaynakHatasi extends Error {
  constructor(kod, ad){ super(ad); this.kod = kod; this.ad = ad; }
}

export default {
  async fetch(istek, env, ctx) {
    const url = new URL(istek.url);
    const cors = {
      'Access-Control-Allow-Origin': IZINLI_KOKEN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',   // /ozet-taslak JSON gövdesi preflight ister
      'Vary': 'Origin'
    };
    if (istek.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* --- Taslak özet üretimi (v3) --- */
    if (url.pathname === '/ozet-taslak') {
      if (istek.method !== 'POST')
        return json({ durum: 'hata', mesaj: 'yalniz POST' }, { ...cors, 'Cache-Control': 'no-store' }, 405);
      /* IZINLI_KOKEN kapısı bu uçta AKTİF denetim: diğer uçlar salt-okur
         proxy'dir (CORS başlığı yeter), burası istek başına birden çok
         kaynağı tarar — yabancı kökenli tarayıcı isteği 403 alır. (Origin
         taklit edilebilir; asıl yük freni 24 saat aynı-kitap kilidi.) */
      if ((istek.headers.get('Origin') || '') !== IZINLI_KOKEN)
        return json({ durum: 'hata', mesaj: 'koken izinli degil' }, { ...cors, 'Cache-Control': 'no-store' }, 403);
      return await ozetTaslak(istek, env, ctx, cors);
    }

    /* Sağlık ucu: her kaynağa bilinen bir sorgu atar, kaç sonuç döndüklerini ve
       süreyi bildirir. Kazıma/API yapısı değişirse belirti burada sayı olarak
       görünür. ASLA cache'lenmez — teşhis her seferinde taze olmalı.
       İKİ ALT SİSTEM AYRI raporlanır: `durum` /ara hattını, `turDurum` keşif
       hattını anlatır — biri bozulunca diğerinin yeşili yalan söylemesin. */
    if (url.pathname === '/saglik') {
      const q = url.searchParams.get('q') || 'tanri yanilgisi';
      const t0 = Date.now();
      const [gr, bk, tl, tk] = await Promise.all([
        goodreads(q), binKitap(q), turlerSayimi(), turSayimi(SAGLIK_TUR)]);
      const sonuc = {
        sorgu: q,
        goodreads: gr.length,
        binkitap: bk.length,
        toplam: tekillestir([...gr, ...bk]).length,
        turler: tl,
        tur: tk,
        turSlug: SAGLIK_TUR,
        sureMs: Date.now() - t0,
        durum: (gr.length || bk.length) ? (gr.length && bk.length ? 'iki kaynak da calisiyor' : 'TEK KAYNAK CALISIYOR') : 'HIC KAYNAK CALISMIYOR',
        turDurum: (tl && tk) ? 'tur kaynagi calisiyor'
          : (tl || tk) ? 'TUR KAYNAGI YARIM' : 'TUR KAYNAGI BOZUK'
      };
      return json(sonuc, { ...cors, 'Cache-Control': 'no-store' });
    }

    /* --- Tür listesi (keşfin taksonomisi) --- */
    if (url.pathname === '/turler') {
      return await onbellekli(url.origin + '/turler', ctx, cors, TURLER_ONBELLEK_SN, async () => {
        const j = await binKitapApi('kitap-turleri/turler');
        const turler = (Array.isArray(j.liste) ? j.liste : [])
          .filter(t => t && t.seo_adi && t.adi)
          .map(t => ({ seo: t.seo_adi, ad: t.adi, kitapSayisi: parseInt(t.kitapSayisi, 10) || 0 }));
        // BOŞ liste = kaynak bozulmuş; cache'lenirse arıza 7 gün yaşar
        if (!turler.length) throw new KaynakHatasi(502, 'kaynak-bos');
        return { turler };
      });
    }

    /* --- Tür sayfası: türün en çok okunan kitapları --- */
    if (url.pathname === '/tur') {
      const slug = (url.searchParams.get('slug') || '').trim();
      if (!SLUG_KALIP.test(slug))
        return json({ hata: 'slug-gecersiz' }, { ...cors, 'Cache-Control': 'no-store' }, 400);
      const sayfa = Math.min(50, Math.max(1, parseInt(url.searchParams.get('sayfa'), 10) || 1));
      // Önbellek anahtarı KANONİK (ham istek URL'i değil): sayfa kelepçelenmiş
      // hâliyle girer, tanınmayan parametreler önbelleği bölemez.
      const anahtar = url.origin + '/tur?slug=' + encodeURIComponent(slug) + '&sayfa=' + sayfa;
      return await onbellekli(anahtar, ctx, cors, TUR_ONBELLEK_SN, async () => {
        const j = await binKitapApi('kitaplar/genel-bakis?turSeo='
          + encodeURIComponent(slug) + '&sayfa=' + sayfa);
        /* GEÇERSİZ SLUG İMZASI (ölçüldü): kaynak 200 + boş liste + `kitapTuru`
           ALANI YOK döner. Yani "sonuç yok" ile "tür yok" ayrımı kitapTuru'nun
           varlığından okunur — 404 olarak dışarı verilir, cache'lenmez. */
        if (!j || !j.kitapTuru) throw new KaynakHatasi(404, 'tur-bulunamadi');
        const sonuclar = (Array.isArray(j.liste) ? j.liste : []).map(b => {
          const p = Number(b && b.puan), o = Number(b && b.okuduDuz);
          return {
            ad: (b && b.adi) || '',
            yazar: (b && (b.yazarAdi || b.ilkYazar)) || '',
            puan: p > 0 ? p : null,
            okuyan: o > 0 ? o : null,
            kapak: (b && b.resim) || null
          };
        }).filter(x => x.ad);
        if (!sonuclar.length) throw new KaynakHatasi(404, 'tur-bos');
        return {
          tur: { seo: j.kitapTuru.seo_adi || slug, ad: j.kitapTuru.adi || slug },
          sonuclar, hasMore: !!j.hasMore, sayfa
        };
      });
    }

    /* --- ISBN künyesi (v97): Türkçe baskılar için 1000Kitap zinciri ---
       ÖLÇÜM (2026-09-03, Cloudflare kenarından, 6 gerçek ISBN + 1 yok-ISBN):
       · Google Books Türkçe ISBN'de boş; Open Library seyrek ve yarım
         ("1984 [TURKISH EDITION]", sayfa/yayınevi yok).
       · 1000kitap.com/ara?q=<ISBN13>&bolum=kitaplar SSR listesi ISBN'i tanıyor ve
         BASKININ KENDİ id'sini veriyor (1984'ün İş Bankası/İlya/Anonim baskıları
         ayrı id'lerle geldi). ISBN-10 ile 0 sonuç → önce 13 haneye çevrilir.
       · api.1000kitap.com/v2/kitaplar/kitapCek?id= → liste[renderTuru=kitapHakkinda]
         .hakkinda.baskiBilgileri {adi, yayinevi, isbn, sayfaSayisi, baskiYili, dil}
         + digerBaskilar[].baskiBilgileriArray; 6/6'da ISBN ana baskıda eşleşti.
         kitap.yazarlar[] rol etiketli (Yazar / Çevirmen / Editör). Süre <1 sn.
       · Kitapyurdu site araması ISBN'i BULMUYOR (13 haneli, tireli, 10 haneli;
         yerel + kenar): "Aradım Bulamadım" → kaynak listesine ALINMADI.
       · 1000Kitap kitap sayfası JSON-LD'sinde yayınevi/sayfa YOK; API zengin.
       SÖZLEŞME: çıktı /ara ile AYNI alan seti + isbn (+ cevirmen, dil). Bulunamazsa
       boş dizi, ASLA fırlatmaz. Aranan ISBN'le birebir eşleşmeyen baskı YAZILMAZ
       (arama gevşek dönerse yanlış kitap sessizce rafa girmesin). */
    if (url.pathname === '/isbn') {
      const isbn = isbn13e(url.searchParams.get('q') || '');
      if (!isbn) return json({ sonuclar: [], kaynaklar: { binkitap: 0, isbnEslesme: 0 } },
        { ...cors, 'Cache-Control': 'no-store' });
      const anahtar = new Request(url.origin + '/isbn?q=' + isbn);   // kanonik: 10 hane de aynı kovaya
      const cache = caches.default;
      const vurus = await cache.match(anahtar);
      if (vurus) return vurus;
      const { sonuclar, kaynaklar } = await isbnKunye(isbn);
      if (!sonuclar.length) return json({ sonuclar, kaynaklar }, { ...cors, 'Cache-Control': 'no-store' });
      const yanit = json({ sonuclar, kaynaklar }, { ...cors, 'Cache-Control': 'public, max-age=' + ISBN_ONBELLEK_SN });
      ctx.waitUntil(cache.put(anahtar, yanit.clone()));
      return yanit;
    }

    if (url.pathname !== '/ara')
      return new Response('kitaplik-ara v2', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors } });

    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 3) return json({ sonuclar: [] }, cors);

    // 6 saatlik kenar önbelleği (aynı sorgu tekrar kaynaklara gitmesin)
    const cacheKey = new Request(url.toString());
    const cache = caches.default;
    const onbellek = await cache.match(cacheKey);
    if (onbellek) return onbellek;

    const [gr, bk] = await Promise.all([goodreads(q), binKitap(q)]);
    const sonuclar = tekillestir([...gr, ...bk]).slice(0, 8);
    // kaynak sayaçları: istemci kullanmasa da teşhis için yanıtta dursun
    const kaynaklar = { goodreads: gr.length, binkitap: bk.length };

    // BOŞ sonucu cache'leme: kaynak geçici düşse 6 saat boyunca boş yanıt servis
    // edilip arıza kendi kendini uzatıyordu.
    if (!sonuclar.length) return json({ sonuclar, kaynaklar }, { ...cors, 'Cache-Control': 'no-store' });

    const yanit = json({ sonuclar, kaynaklar }, { ...cors, 'Cache-Control': 'public, max-age=21600' });
    ctx.waitUntil(cache.put(cacheKey, yanit.clone()));
    return yanit;
  }
};

function json(o, headers, durum) {
  return new Response(JSON.stringify(o), {
    status: durum || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

/* Kenar önbellekli üretici sarmalayıcı (yeni uçlar).
   KURAL KORUNUR: yalnız DOLU ve BAŞARILI yanıt cache'lenir. Üretici boş/bozuk
   kaynağı KaynakHatasi ile bildirir; hata yanıtı no-store döner, böylece geçici
   arıza saatlerce servis edilmez (/ara'daki boş-sonuç kuralının aynısı). */
async function onbellekli(anahtarUrl, ctx, cors, saniye, uret) {
  const cache = caches.default;
  const anahtar = new Request(anahtarUrl);
  const vurus = await cache.match(anahtar);
  if (vurus) return vurus;
  let govde;
  try {
    govde = await uret();
  } catch (e) {
    return json({ hata: (e && e.ad) || 'kaynak-ulasilamadi' },
      { ...cors, 'Cache-Control': 'no-store' }, (e && e.kod) || 502);
  }
  const yanit = json(govde, { ...cors, 'Cache-Control': 'public, max-age=' + saniye });
  ctx.waitUntil(cache.put(anahtar, yanit.clone()));
  return yanit;
}

function norm(s) {
  return String(s || '').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '');
}

function tekillestir(liste) {
  const gorulen = new Set(), cikti = [];
  for (const a of liste) {
    if (!a || !a.ad) continue;
    const k = norm(a.ad) + '|' + norm(a.yazar);
    if (gorulen.has(k)) continue;
    gorulen.add(k); cikti.push(a);
  }
  return cikti;
}

/* ekBaslik parametresiz çağrılar (mevcut /ara kaynakları) BİREBİR eski
   davranışı korur — yalnız User-Agent gider. */
async function zamanli(url, ms, ekBaslik) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, ...(ekBaslik || {}) }, signal: c.signal });
  }
  finally { clearTimeout(t); }
}

/* --- Kaynak 1: Goodreads --- */
async function goodreads(q) {
  try {
    const r = await zamanli('https://www.goodreads.com/book/auto_complete?format=json&q=' + encodeURIComponent(q), 4500);
    if (!r.ok) return [];
    const j = await r.json();
    return grDonustur(j);
  } catch (e) { return []; }
}
function grDonustur(j) {
  return (Array.isArray(j) ? j : []).slice(0, 6).map(b => ({
    ad: b.bookTitleBare || b.title || '',
    yazar: (b.author && b.author.name) || '',
    yayinevi: '', yil: null,
    sayfa: parseInt(b.numPages) || null,
    kapak: b.imageUrl ? b.imageUrl.replace(/\._S[XY]\d+_\./, '.') : null,
    kaynak: 'Goodreads'
  })).filter(x => x.ad);
}

/* --- Kaynak 2: 1000Kitap arama (SSR __NEXT_DATA__) --- */
async function binKitap(q) {
  try {
    const r = await zamanli('https://1000kitap.com/ara?q=' + encodeURIComponent(q) + '&bolum=kitaplar', 4500);
    if (!r.ok) return [];
    const h = await r.text();
    return bkDonustur(h);
  } catch (e) { return []; }
}
function bkDonustur(h) {
  const es = h.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
  if (!es) return [];
  let j;
  try { j = JSON.parse(es[1]); } catch (e) { return []; }
  const liste = listeBul(j) || [];
  return liste.slice(0, 6).map(b => ({
    ad: b.adi || '',
    yazar: b.yazarAdi || b.ilkYazar || '',
    yayinevi: '', yil: null, sayfa: null,
    kapak: b.resim || null,
    kaynak: '1000Kitap' + (b.puan ? ` ★${b.puan}` : '')
  })).filter(x => x.ad);
}
function listeBul(o) {
  if (o && typeof o === 'object') {
    if (Array.isArray(o.liste) && o.liste[0] && typeof o.liste[0] === 'object' && 'adi' in o.liste[0]) return o.liste;
    for (const v of Object.values(o)) { const r = listeBul(v); if (r) return r; }
  }
  return null;
}

/* --- ISBN yardımcıları (v97) --- */
/* Temizle + sağlama + 10 haneyi 13'e çevir. Geçersiz sağlama → '' (kaynağa gitmez). */
function isbn13e(s) {
  const t = String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^\d{13}$/.test(t)) {
    let top = 0; for (let i = 0; i < 12; i++) top += (+t[i]) * (i % 2 ? 3 : 1);
    return ((10 - top % 10) % 10) === +t[12] ? t : '';
  }
  if (/^\d{9}[\dX]$/.test(t)) {
    let top = 0; for (let i = 0; i < 10; i++) top += (t[i] === 'X' ? 10 : +t[i]) * (10 - i);
    if (top % 11 !== 0) return '';
    const g = '978' + t.slice(0, 9);
    let top13 = 0; for (let i = 0; i < 12; i++) top13 += (+g[i]) * (i % 2 ? 3 : 1);
    return g + ((10 - top13 % 10) % 10);
  }
  return '';
}
/* Zincir: SSR arama (ISBN → baskı id) → kitapCek → ISBN'i eşleşen baskı. Her
   arıza boş sonuç; kaynaklar sayacı teşhis için (binkitap = arama adayı sayısı,
   isbnEslesme = künye ISBN'le doğrulandı mı). */
async function isbnKunye(isbn) {
  let liste = [];
  try { liste = await bkHamListe(isbn); } catch (e) { liste = []; }
  const kaynaklar = { binkitap: liste.length, isbnEslesme: 0 };
  const ilk = liste[0];
  if (!ilk || !ilk.id) return { sonuclar: [], kaynaklar };
  let j = null;
  try { j = await binKitapApi('kitaplar/kitapCek?id=' + encodeURIComponent(ilk.id)); } catch (e) { j = null; }
  const kayit = j ? isbnDonustur(j, isbn) : null;
  if (!kayit) return { sonuclar: [], kaynaklar };
  kaynaklar.isbnEslesme = 1;
  return { sonuclar: [kayit], kaynaklar };
}
/* SAF dönüştürücü (test kancası): kitapCek JSON'u + aranan ISBN13 → /ara alan seti.
   Baskı adayları: hakkinda.baskiBilgileri (ana) + digerBaskilar[].baskiBilgileriArray;
   ISBN'i aranan ile birebir eşleşen baskı seçilir, eşleşen yoksa null. */
function isbnDonustur(j, isbn) {
  const hk = (((j && j.liste) || []).find(x => x && x.renderTuru === 'kitapHakkinda') || {}).hakkinda || {};
  const adaylar = [];
  if (hk.baskiBilgileri) adaylar.push(hk.baskiBilgileri);
  for (const d of (hk.digerBaskilar || [])) if (d && d.baskiBilgileriArray) adaylar.push(d.baskiBilgileriArray);
  const b = adaylar.find(x => x && isbn13e(x.isbn) === isbn);
  if (!b) return null;
  const k = (j && j.kitap) || {};
  const rol = ad => (Array.isArray(k.yazarlar) ? k.yazarlar : [])
    .filter(y => y && y.adi && String(y.kitapYazarTurBaslik || '') === ad).map(y => String(y.adi).trim());
  const yazarlar = rol('Yazar');
  const ad = String(b.adi || k.adi || '').trim();
  if (!ad) return null;
  const yil = parseInt(b.baskiYili, 10), sayfa = parseInt(b.sayfaSayisi, 10);
  return {
    ad,
    yazar: (yazarlar.length ? yazarlar : [String(k.ilkYazar || '').trim()]).filter(Boolean).slice(0, 2).join(', '),
    yayinevi: String(b.yayinevi || '').trim(),
    yil: yil > 0 ? yil : null,
    sayfa: sayfa > 0 ? sayfa : null,
    kapak: k.resim || null,
    isbn,
    kaynak: '1000Kitap',
    cevirmen: rol('Çevirmen').slice(0, 2).join(', '),
    dil: (b.dil && b.dil.kod) ? String(b.dil.kod).toLowerCase() : ''
  };
}

/* --- Kaynak 3: 1000Kitap v2 API (tür keşfi) --- */
async function binKitapApi(yol) {
  const r = await zamanli(BIN1K_API + yol, 5000, TR_BASLIK);
  if (!r.ok) throw new KaynakHatasi(502, 'kaynak-' + r.status);
  return await r.json();
}
/* Sağlık sayaçları: ASLA fırlatmaz, bozukluğu 0 olarak bildirir. */
async function turlerSayimi() {
  try { const j = await binKitapApi('kitap-turleri/turler');
    return (Array.isArray(j.liste) ? j.liste : []).length; } catch (e) { return 0; }
}
async function turSayimi(slug) {
  try {
    const j = await binKitapApi('kitaplar/genel-bakis?turSeo=' + encodeURIComponent(slug) + '&sayfa=1');
    return (j && j.kitapTuru && Array.isArray(j.liste)) ? j.liste.length : 0;
  } catch (e) { return 0; }
}

/* ================= /ozet-taslak (v4 — kaynak açıklaması) ================= */
/* SIRA: gövde → 24s kilit → doğrulama → açıklama toplama. Model/anahtar/
   günlük sayaç v4'te SİLİNDİ. Başarılı yanıt 24 saat kenar önbelleğinde:
   aynı kitaba ikinci istek kaynakları değil önceki yanıtı bulur (kilit =
   önbelleğin kendisi; amaç maliyet değil, kaynaklara gereksiz yük binmesin). */
async function ozetTaslak(istek, env, ctx, cors) {
  const ns = { ...cors, 'Cache-Control': 'no-store' };
  let ham = '';
  try { ham = await istek.text(); } catch (e) { return json({ durum: 'hata', mesaj: 'govde okunamadi' }, ns, 400); }
  if (ham.length > TASLAK_GOVDE_SINIR)
    return json({ durum: 'hata', mesaj: 'govde cok buyuk' }, ns, 413);
  let g;
  try { g = JSON.parse(ham); } catch (e) { return json({ durum: 'hata', mesaj: 'gecersiz JSON' }, ns, 400); }
  const ad = String((g && g.ad) || '').trim().slice(0, 200);
  const yazar = String((g && g.yazar) || '').trim().slice(0, 120);
  const isbn = String((g && g.isbn) || '').replace(/[^0-9Xx]/g, '').slice(0, 13);
  if (!ad) return json({ durum: 'hata', mesaj: 'ad gerekli' }, ns, 400);

  const cache = caches.default;
  const kok = new URL(istek.url).origin;
  // 24 saat kilidi = önceki başarılı yanıtın kendisi
  const kilit = new Request(kok + '/ozet-taslak-kilit?k=' + encodeURIComponent(norm(ad) + '|' + norm(yazar)));
  const onceki = await cache.match(kilit);
  if (onceki) return onceki;

  // KAYNAK DOĞRULAMASI — kitap kaynaklarda yoksa açıklama da aranmaz
  let kunye = null;
  try { kunye = await taslakDogrula(ad, yazar, isbn); } catch (e) { kunye = null; }
  if (!kunye) return json({ durum: 'bulunamadi' }, ns);

  // açıklama toplama: 1000Kitap > Google Books > Goodreads
  let aday = null;
  try { aday = await aciklamaTopla(kunye, ad, yazar); } catch (e) { aday = null; }
  if (!aday) return json({ durum: 'bulunamadi' }, ns);

  const yanit = json({ durum: 'tamam', metin: aday.metin, kaynak: aday.kaynak, dil: aday.dil },
    { ...cors, 'Cache-Control': 'public, max-age=' + TASLAK_KILIT_SN });
  ctx.waitUntil(cache.put(kilit, yanit.clone()));
  return yanit;
}

/* Doğrulama: ISBN varsa ÖNCE onunla (Goodreads auto_complete ISBN'i tanır).
   Yoksa iki kaynak HAM kayıtlarla ad üzerinden taranır — ham gerekli çünkü
   açıklama toplama Goodreads kaydının description'ını ve 1000Kitap kaydının
   id'sini ister; /ara dönüştürücüleri (grDonustur/bkDonustur) bu alanları
   bilerek taşımıyor, o sözleşmeye dokunulmadı. */
async function grHamListe(q) {
  try {
    const r = await zamanli('https://www.goodreads.com/book/auto_complete?format=json&q=' + encodeURIComponent(q), 4500);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (e) { return []; }
}
async function bkHamListe(q) {
  try {
    const r = await zamanli('https://1000kitap.com/ara?q=' + encodeURIComponent(q) + '&bolum=kitaplar', 4500);
    if (!r.ok) return [];
    const h = await r.text();
    const es = h.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
    if (!es) return [];
    let j;
    try { j = JSON.parse(es[1]); } catch (e) { return []; }
    return listeBul(j) || [];
  } catch (e) { return []; }
}
function grAciklama(b) {
  const d = b && b.description;   // kaynakta string YA DA { html } gelebiliyor
  const h = typeof d === 'string' ? d : (d && typeof d.html === 'string' ? d.html : '');
  return h;
}
/* Eşleşme normu: norm() + AKSAN DÜZLEŞTİRMESİ (canlı kanıt: kullanıcı
   "Simyaci" yazınca kaynaktaki "Simyacı" eşleşmiyordu — index.html katla()
   ilkesinin aynısı: kaçırmak yanlış eşleşmekten pahalı). norm()'un kendisi
   DEĞİŞMEZ: /ara tekilleştirmesi ve kilit anahtarı onu kullanıyor. */
function esNorm(s) {
  return norm(s).replace(/[çğıöşü]/g, c =>
    ({ 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c] || c));
}
function adUyar(a, b) {
  const x = esNorm(a), y = esNorm(b);
  return !!(x && y && (x === y || x.includes(y) || y.includes(x)));
}
function yazarUyar(kaynakY, istekY) {
  const y = esNorm(istekY);
  if (!y) return true;                    // istekte yazar yoksa ad eşleşmesi yeter
  const x = esNorm(kaynakY);
  return !!(x && (x.includes(y) || y.includes(x)));
}
async function taslakDogrula(ad, yazar, isbn) {
  if (isbn && isbn.length >= 10) {
    const ham = await grHamListe(isbn);
    if (ham.length) {
      const b = ham[0];
      return { ad: b.bookTitleBare || b.title || ad,
        yazar: (b.author && b.author.name) || yazar,
        grKayit: b, bkId: null };
    }
  }
  const [grH, bkH] = await Promise.all([grHamListe(ad), bkHamListe(ad)]);
  const grB = grH.find(b => adUyar(b.bookTitleBare || b.title || '', ad)
    && yazarUyar((b.author && b.author.name) || '', yazar)) || null;
  const bkB = bkH.find(b => adUyar((b && b.adi) || '', ad)
    && yazarUyar((b && (b.yazarAdi || b.ilkYazar)) || '', yazar)) || null;
  if (!grB && !bkB) return null;
  return {
    ad: (bkB && bkB.adi) || (grB && (grB.bookTitleBare || grB.title)) || ad,
    yazar: (bkB && (bkB.yazarAdi || bkB.ilkYazar)) || (grB && grB.author && grB.author.name) || yazar,
    grKayit: grB, bkId: bkB ? bkB.id : null
  };
}

/* ---- açıklama toplama (v4) ----
   1000Kitap kitapCek?id= → liste[?].hakkinda.bilgi (ÖLÇÜLDÜ: TR tanıtım
   metni, HTML-entity'li). Google Books keyless volumes araması —
   volumeInfo.description + language; 429 kota dahil her arıza SESSİZ düşer,
   zincir Goodreads'e iner. Seçim: TR adaylar varsa aralarından UZUN olan;
   TR yoksa kaynak önceliği sırasındaki ilk (1000K > GB > GR). */
async function aciklamaTopla(kunye, ad, yazar) {
  let bkId = kunye.bkId;
  /* İkinci aramalarda KULLANICININ adı kullanılır, kunye.ad DEĞİL — canlı
     kanıt: GR containment kuralı "Üç Roman: ... - Kürk Mantolu Madonna"
     DERLEMESİYLE eşleşebiliyor; derleme adıyla 1000K/GB araması boşa düşer.
     Kullanıcının adı zaten kaynaklarda doğrulandı. */
  if (!bkId) {   // ISBN yolu 1000K'yı hiç taramamıştı — açıklama için bir kez ara
    const bkH = await bkHamListe(ad);
    const b = bkH.find(x => adUyar((x && x.adi) || '', ad)
      && yazarUyar((x && (x.yazarAdi || x.ilkYazar)) || '', yazar || kunye.yazar));
    if (b) bkId = b.id;
  }
  const [bkMetin, gb] = await Promise.all([
    bkId ? binKitapAciklama(bkId) : Promise.resolve(''),
    googleAciklama(ad, yazar || kunye.yazar)
  ]);
  const adaylar = [];   // öncelik sırasıyla pushlanır — TR yoksa [0] kazanır
  if (bkMetin) adaylar.push({ metin: bkMetin, kaynak: '1000Kitap', dil: dilTahmin(bkMetin) });
  if (gb) adaylar.push({ metin: gb.metin, kaynak: 'Google Books', dil: gb.dil });
  const grMetin = metinTemizle(grAciklama(kunye.grKayit));
  if (grMetin) adaylar.push({ metin: grMetin, kaynak: 'Goodreads', dil: dilTahmin(grMetin) });
  if (!adaylar.length) return null;
  const trler = adaylar.filter(a => a.dil === 'tr');
  if (!trler.length) return adaylar[0];
  return trler.reduce((u, a) => a.metin.length > u.metin.length ? a : u);
}
async function binKitapAciklama(id) {
  try {
    const j = await binKitapApi('kitaplar/kitapCek?id=' + encodeURIComponent(id));
    const liste = Array.isArray(j && j.liste) ? j.liste : [];
    const oge = liste.find(x => x && x.hakkinda && typeof x.hakkinda.bilgi === 'string');
    return oge ? metinTemizle(oge.hakkinda.bilgi) : '';
  } catch (e) { return ''; }
}
async function googleAciklama(ad, yazar) {
  try {
    let q = 'intitle:"' + String(ad).replace(/"/g, '') + '"';
    if (yazar) q += ' inauthor:"' + String(yazar).replace(/"/g, '') + '"';
    const r = await zamanli(GB_URL + '?q=' + encodeURIComponent(q) + '&maxResults=5&country=TR', 4500);
    if (!r.ok) return null;   // keyless kota (429) dahil: sessiz düşüş
    const j = await r.json();
    const es = (Array.isArray(j && j.items) ? j.items : []).find(it => {
      const v = it && it.volumeInfo;
      return v && adUyar(v.title || '', ad)
        && yazarUyar(((v.authors || [])[0]) || '', yazar)
        && typeof v.description === 'string' && v.description.trim();
    });
    if (!es) return null;
    const metin = metinTemizle(es.volumeInfo.description);
    if (!metin) return null;
    const dil = es.volumeInfo.language
      ? String(es.volumeInfo.language).toLowerCase().slice(0, 2) : dilTahmin(metin);
    return { metin, dil };
  } catch (e) { return null; }
}
/* HTML ayıkla + temel entity'leri çöz + boşluk/boş satır düzelt + sınırlar.
   <80 kr kırıntı ("Roman.", "2. baskı") özet yerine geçmez → '' (aday değil). */
function metinTemizle(s) {
  let m = String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  m = m.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  m = m.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (m.length < TASLAK_METIN_TABAN) return '';
  if (m.length > TASLAK_METIN_TAVAN) m = m.slice(0, TASLAK_METIN_TAVAN) + '…';
  return m;
}
function dilTahmin(m) { return /[çğışöüÇĞİŞÖÜ]/.test(m) ? 'tr' : 'en'; }

/* test kancası (node testleri için, Worker çalışmasını etkilemez) */
export { grDonustur, bkDonustur, tekillestir, norm, adUyar, yazarUyar,
  taslakDogrula, metinTemizle, dilTahmin, isbn13e, isbnDonustur };
