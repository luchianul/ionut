/* Test cap-coada: Code.gs real (peste Sheets simulat) + interfata in Chromium. Rulare: node test/e2e.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { load } = require('./mock-sheets');

const WWW = path.join(__dirname, '..', 'www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const backend = load();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c));
    return req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(backend.post(JSON.parse(b)))); });
  }
  const f = path.join(WWW, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const call = (action, data, token) => backend.post({ action, data, token });

  /* ---- 1. API ---- */
  assert.strictEqual(call('login', { utilizator: 'admin', parola: 'gresita' }).ok, false);
  const adm = call('login', { utilizator: 'admin', parola: 'SCHIMBA-MA-1234' });
  assert(adm.ok && adm.data.user.rol === 'admin');
  const A = adm.data.token;
  const ana = call('ang_save', { nume: 'Ana Pop', utilizator: 'ana', parola: 'ana123', tarif_h: 15, tarif_km: 0.4 }, A);
  assert(ana.ok, JSON.stringify(ana));
  assert(call('ang_save', { nume: 'Alt', utilizator: 'ANA', parola: 'xxxx' }, A).ok === false, 'utilizator duplicat');
  call('ang_save', { nume: 'Bogdan Ene', utilizator: 'bogdan', parola: 'bog123', tarif_h: 20, tarif_km: 0.5 }, A);

  const ln = call('login', { utilizator: 'ana', parola: 'ana123' }); assert(ln.ok);
  const T = ln.data.token;
  assert.strictEqual(call('ang_list', {}, T).ok, false, 'angajatul nu are voie la lista angajatilor');
  const p1 = call('pon_save', { data: '2026-11-02', ora_intrare: '08:00', ora_iesire: '16:30', adresa: 'Str. Lunga 5', km: 20, parcare: 3.5, tarif_h: 999 }, T);
  assert(p1.ok, JSON.stringify(p1));
  assert.strictEqual(p1.data.ore, 8.5);
  assert.strictEqual(p1.data.tarif_h, 15, 'angajatul nu isi poate seta tariful');
  assert.strictEqual(p1.data.total, 8.5 * 15 + 20 * 0.4 + 3.5); // 139
  const night = call('pon_save', { data: '2026-11-02', ora_intrare: '22:00', ora_iesire: '06:00' }, T);
  assert.strictEqual(night.data.ore, 8, 'tura peste miezul noptii');

  const tb = call('login', { utilizator: 'bogdan', parola: 'bog123' }).data.token;
  assert.strictEqual(call('pon_list', {}, tb).data.length, 0, 'Bogdan nu vede pontajele Anei');
  assert.strictEqual(call('pon_save', { id: p1.data.id, data: '2026-11-02', ora_intrare: '08:00' }, tb).ok, false);
  assert.strictEqual(call('pon_delete', { id: p1.data.id }, tb).ok, false);

  const ed = call('pon_save', { id: p1.data.id, data: '2026-11-02', ora_intrare: '08:00', ora_iesire: '17:00', adresa: 'Str. Lunga 5', km: 20, parcare: 3.5 }, T);
  assert(ed.ok && ed.data.ore === 9, 'angajatul isi poate modifica pontajul (fara aprobare)');
  assert.strictEqual(ed.data.status, undefined, 'nu mai exista status');
  assert(call('pon_delete', { id: night.data.id }, T).ok, 'angajatul isi poate sterge pontajul');
  assert(call('pon_save', { data: '2026-11-02', ora_intrare: '22:00', ora_iesire: '06:00' }, T).ok);
  assert.strictEqual(call('pon_list', { angajat_id: ana.data.id }, A).data.length, 2);
  assert.strictEqual(call('pon_status', { id: p1.data.id, status: 'aprobat' }, A).ok, false, 'aprobarea a fost eliminata');
  assert.strictEqual(call('pon_list', {}, 'token.fals').auth, true);
  console.log('API ok');

  /* ---- 2. UI ---- */
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const shots = path.join(__dirname, '.tmp'); fs.mkdirSync(shots, { recursive: true });

  const phone = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await phone.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
  await pg.addInitScript((u) => localStorage.setItem('pontaj.api', u), base);
  await pg.goto(base);
  await pg.fill('[name=u]', 'bogdan'); await pg.fill('[name=p]', 'bog123'); await pg.click('button:has-text("Autentificare")');
  await pg.waitForSelector('#add');
  await pg.fill('#luna', '2026-11');
  await pg.click('#add');
  await pg.fill('[name=data]', '2026-11-03');
  await pg.fill('[name=ora_intrare]', '07:30'); await pg.fill('[name=ora_iesire]', '15:45');
  await pg.fill('[name=adresa]', 'Santier Nord, Bd. Unirii 10'); await pg.fill('[name=km]', '42'); await pg.fill('[name=parcare]', '6');
  assert.match(await pg.textContent('#pv'), /8,25 ore/);
  await pg.screenshot({ path: path.join(shots, 'angajat-form.png') });
  await pg.click('button:has-text("Salveaza")');
  await pg.waitForSelector('.entry');
  assert.match(await pg.textContent('.entry'), /Santier Nord/);
  assert.match(await pg.textContent('.stats'), /8,25/);
  await pg.screenshot({ path: path.join(shots, 'angajat-lista.png') });

  const desk = await browser.newContext({ viewport: { width: 1200, height: 760 }, acceptDownloads: true });
  const pa = await desk.newPage(); pa.on('pageerror', (e) => errors.push(e.message));
  let posts = 0; pa.on('request', (r) => { if (r.method() === 'POST') posts++; });
  pa.on('dialog', (d) => d.accept());
  await pa.addInitScript((u) => localStorage.setItem('pontaj.api', u), base);
  await pa.goto(base);
  await pa.fill('[name=u]', 'admin'); await pa.fill('[name=p]', 'SCHIMBA-MA-1234'); await pa.click('button:has-text("Autentificare")');
  await pa.waitForSelector('#fa');
  await pa.fill('#fd', '2026-11-01'); await pa.fill('#fp', '2026-11-30');
  await pa.waitForSelector('td:has-text("Santier Nord")');
  assert.match(await pa.textContent('table'), /Ana Pop/); // pontajele ambilor angajati
  assert.strictEqual(await pa.locator('text=Aproba').count(), 0);
  await pa.screenshot({ path: path.join(shots, 'admin-pontaje.png') });
  const [dl] = await Promise.all([pa.waitForEvent('download'), pa.click('#csv')]);
  assert.match(dl.suggestedFilename(), /pontaje_2026-11-01_2026-11-30\.csv/);
  await pa.waitForFunction(() => !window.__pontaj.S.loading);
  const before = posts;
  await pa.click('[data-t=rezumat]'); await pa.waitForSelector('td:has-text("TOTAL")');
  await pa.selectOption('#fa', { label: 'Ana Pop' }); await pa.click('[data-t=pontaje]'); await pa.click('[data-t=rezumat]');
  assert.strictEqual(posts, before, 'tab-urile si filtrul de angajat nu mai fac apeluri la server');
  await pa.screenshot({ path: path.join(shots, 'admin-rezumat.png') });
  await pa.selectOption('#fa', ''); await pa.click('[data-t=angajati]'); await pa.waitForSelector('.entry');
  await pa.screenshot({ path: path.join(shots, 'admin-angajati.png') });

  assert.deepStrictEqual(errors, [], 'erori JS: ' + errors.join('; '));
  await browser.close(); server.close();
  console.log('UI ok - capturi in test/.tmp');
})().catch((e) => { console.error(e); process.exit(1); });
