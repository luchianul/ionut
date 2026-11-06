/* Test cap-coada: Code.gs + Api.gs reale (peste Sheets simulat) + interfata ta originala in Chromium. Rulare: node test/e2e.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { load } = require('./mock-sheets');

const WWW = path.join(__dirname, '..', 'www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const backend = load();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c));
    return req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(backend.post(JSON.parse(b)))); });
  }
  const f = path.join(WWW, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const call = (fn, ...args) => backend.post({ fn, args });

  /* ---- 1. API (Api.gs peste Code.gs) ---- */
  assert.strictEqual(call('nuExista').ok, false, 'functii necunoscute sunt refuzate');
  assert.strictEqual(call('doGet').ok, false, 'doar functiile din lista sunt expuse');
  const empty = call('getAppData', '2026');
  assert(empty.ok && empty.data.istoric.length === 0);
  const z1 = call('adaugaDate', { ridx: null, isCash: false, nume: 'Ionut', data: '2026-11-02', ziua: 'Luni', oraIntrare: '08:00', oraIesire: '16:30', strada: 'Str. Lunga 5', km: '20', parcare: '3.5', tarifH: '30', tarifKm: '0.45' });
  assert(z1.ok, JSON.stringify(z1));
  assert.strictEqual(Number(z1.data.istoric[0][5]), 8.5, 'ore calculate');
  assert.strictEqual(call('adaugaDate', { data: '2026-11-02', oraIntrare: '09:00', oraIesire: '10:00', tarifH: '30', tarifKm: '0.45' }).ok, false, 'dublura pe aceeasi data');
  const st = call('getAppData', '2026').data.statistici;
  assert.strictEqual(st.length, 1);
  assert.strictEqual(Number(st[0][5]), 8.5 * 30 + 20 * 0.45 + 3.5, 'total saptamana');
  // numere cu virgula: foaia afiseaza "610,14" iar aplicatia trebuia sa arate 610.14 (nu 610)
  assert(call('salveazaFacturaCarburant', { nume: 'Motorina test', suma: '610,14', an: '2026' }).ok);
  const mot = call('getEvidentaMotorina', '2026').data;
  assert.strictEqual(mot.facturi[0][2], '610.14', 'suma motorina cu zecimale');
  assert.strictEqual(Math.round(mot.totalFacturi * 100) / 100, 610.14);
  assert.strictEqual(call('getAppData', '2026').data.istoric[0][5], '8.5', 'ore cu zecimale chiar daca foaia afiseaza virgula');
  assert.strictEqual(call('getAppData', '2026').data.statistici[0][5], '267.5');
  assert(call('editeazaMotorina', { row: 2, nume: 'Motorina test', suma: '700,5' }).ok);
  assert.strictEqual(call('getEvidentaMotorina', '2026').data.facturi[0][2], '700.5');
  assert(call('stergeFacturaCarburant', 2).ok); // curatam, ca sa nu influenteze testul de interfata
  console.log('API ok');

  /* ---- 2. Interfata ---- */
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const shots = path.join(__dirname, '.tmp'); fs.mkdirSync(shots, { recursive: true });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxB.route((u) => !u.href.startsWith(base), (r) => r.abort()); // fara internet in test
  const pg = await ctxB.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
  await pg.goto(base);

  // prima pornire: cere adresa serverului
  await pg.waitForSelector('#srv-url');
  await pg.fill('#srv-url', 'https://exemplu.ro/gresit');
  await pg.click('#srv-overlay button');
  assert.match(await pg.textContent('#srv-err'), /script\.google\.com/);
  await pg.fill('#srv-url', 'https://script.google.com/macros/s/TEST/exec');
  await pg.click('#srv-overlay button');
  assert.strictEqual(await pg.evaluate(() => localStorage.getItem('pontajionut.api')), 'https://script.google.com/macros/s/TEST/exec');
  await pg.evaluate((b) => { localStorage.setItem('pontajionut.api', b); }, base); // in test indreptam spre serverul local
  await pg.reload();

  await pg.waitForSelector('#tbody-jurnal tr:not(.week-row)');
  assert.match(await pg.textContent('#tbody-jurnal'), /Str\. Lunga 5/);
  assert.match(await pg.textContent('.side-foot'), /dev/);
  await pg.screenshot({ path: path.join(shots, '1-jurnal.png') });

  // adauga zi
  await pg.click('text=Adaugă zi');
  await pg.waitForSelector('#addModal.show');
  await pg.fill('#data', '2026-11-03'); await pg.fill('#intrare', '07:30'); await pg.fill('#iesire', '15:45');
  await pg.fill('#strada', 'Santier Nord'); await pg.fill('#km', '42'); await pg.fill('#parcare', '6');
  await pg.click('#btnS');
  await pg.waitForSelector('td:has-text("Santier Nord")');
  assert.match(await pg.textContent('#tbody-jurnal'), /8\.25h/);

  // dublura -> alerta
  await pg.click('text=Adaugă zi'); await pg.waitForSelector('#addModal.show');
  await pg.fill('#data', '2026-11-03'); await pg.click('#btnS');
  await pg.waitForSelector('.swal2-popup:has-text("Există deja un pontaj")');
  await pg.click('.swal2-confirm');
  await pg.click('#addModal .modal-close-x');

  // statistici
  await pg.click('.side-link[data-view=stats]');
  await pg.waitForSelector('.week-card');
  assert.match(await pg.textContent('#total-de-incasat'), /539\.90/);
  await pg.screenshot({ path: path.join(shots, '2-statistici.png') });

  // factura din saptamana
  await pg.click('.side-link[data-view=facturi]');
  await pg.waitForSelector('#sapt-list input[type=checkbox]');
  await pg.check('#sapt-list input[type=checkbox]');
  await pg.fill('#fact-numar', 'Factura #1');
  await pg.click('text=Salvează factura');
  await pg.waitForSelector('#tbody-facturi td:has-text("Factura #1")');
  await pg.screenshot({ path: path.join(shots, '3-facturi.png') });
  await pg.click('#tbody-facturi .status-pill'); await pg.waitForSelector('#avansModal.show');
  await pg.click('text=Plătit integral'); await pg.waitForSelector('#tbody-facturi .status-Platit');

  // motorina
  await pg.click('.side-link[data-view=motorina]');
  await pg.click('text=Adaugă Factură'); await pg.waitForSelector('#motorinaModal.show');
  await pg.fill('#mot-nume', 'OMV 05.11'); await pg.fill('#mot-suma', '610.14');
  await pg.click('#motorinaModal button:has-text("SALVEAZĂ")');
  await pg.waitForSelector('#tbody-motorina td:has-text("OMV 05.11")');
  assert.match(await pg.textContent('#mot-total-facturi'), /610\.14/);
  assert.match(await pg.textContent('#tbody-motorina'), /610\.14€/, 'lista arata 610.14, nu 610');
  await pg.screenshot({ path: path.join(shots, '4-motorina.png') });

  // marcheaza plata saptamanii (Sheet2), stergere zi
  await pg.click('.side-link[data-view=pontaje]'); await pg.waitForSelector('#tbody-jurnal tr:not(.week-row)');
  await pg.click('#tbody-jurnal tr:has-text("Santier Nord") .icon-btn.danger');
  await pg.click('.swal2-confirm');
  await pg.waitForFunction(() => !document.querySelector('#tbody-jurnal').textContent.includes('Santier Nord'));
  assert.match(await pg.textContent('#tbody-jurnal'), /Str\. Lunga 5/);

  // telefon
  const ph = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ph.route((u) => !u.href.startsWith(base), (r) => r.abort());
  const pp = await ph.newPage(); pp.on('pageerror', (e) => errors.push(e.message));
  await pp.addInitScript((b) => localStorage.setItem('pontajionut.api', b), base);
  await pp.goto(base); await pp.waitForSelector('#tbody-jurnal tr:not(.week-row)');
  await pp.screenshot({ path: path.join(shots, '5-telefon.png') });

  assert.deepStrictEqual(errors, [], 'erori JS: ' + errors.join('; '));
  await browser.close(); server.close();
  console.log('UI ok - capturi in test/.tmp');
})().catch((e) => { console.error(e); process.exit(1); });
