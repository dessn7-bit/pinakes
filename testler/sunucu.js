/* Kitaplik testleri icin yerel statik sunucu — repo kokunu 8124'te servis eder. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

http.createServer((istek, yanit) => {
  let yol;
  try { yol = decodeURIComponent(new URL(istek.url, 'http://x').pathname); }
  catch (e) { yanit.writeHead(400); return yanit.end('bozuk istek'); }
  /* v94 adres-taşıma testleri: /kitaplik/... ve /pinakes/... önekleri köke
     düşer — üretimdeki iki Pages yolunun yerel taklidi. */
  yol = yol.replace(/^\/(kitaplik|pinakes)(?=\/)/, '');
  if (yol === '/') yol = '/index.html';
  const dosya = path.normalize(path.join(KOK, yol));
  if (!dosya.startsWith(KOK) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) {
    yanit.writeHead(404); return yanit.end('yok');
  }
  yanit.writeHead(200, {
    'Content-Type': MIME[path.extname(dosya).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(dosya).pipe(yanit);
}).listen(8124, '127.0.0.1', () => console.log('sunucu 127.0.0.1:8124 hazir'));
