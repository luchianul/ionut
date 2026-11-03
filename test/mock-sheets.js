/* Simulator minimal de Google Apps Script + Sheets, ca sa rulam Code.gs real local (teste). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function load() {
  const sheets = {};
  const props = {};
  const cache = {};
  const toBytes = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  const fromAny = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => b & 0xff)));

  function makeSheet(name) {
    const sh = { name, rows: [] };
    const get = (r, c) => (sh.rows[r - 1] && sh.rows[r - 1][c - 1] !== undefined ? sh.rows[r - 1][c - 1] : '');
    return Object.assign(sh, {
      getRange(r, c, nr = 1, nc = 1) {
        const rng = {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
          setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || [])[c - 1 + j] = x; })); return rng; },
          setNumberFormat: () => rng, setFontWeight: () => rng,
        };
        return rng;
      },
      getLastRow: () => { let l = 0; sh.rows.forEach((r, i) => { if (r && r.some((x) => x !== '' && x !== undefined)) l = i + 1; }); return l; },
      getMaxRows: () => 1000, setFrozenRows() {},
      deleteRow(r) { sh.rows.splice(r - 1, 1); },
    });
  }

  const ctx = {
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n)),
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (_a, s) => toBytes(crypto.createHash('sha256').update(fromAny(s)).digest()),
      computeHmacSha256Signature: (m, k) => toBytes(crypto.createHmac('sha256', fromAny(k)).update(fromAny(m)).digest()),
      base64EncodeWebSafe: (x) => fromAny(x).toString('base64url') + '==='.slice(0, 0),
      base64DecodeWebSafe: (s) => toBytes(Buffer.from(s, 'base64url')),
      newBlob: (b) => ({ getDataAsString: () => Buffer.from(b.map((x) => x & 0xff)).toString('utf8') }),
    },
  };
  vm.createContext(ctx);
  // const/let din script nu devin proprietati ale contextului, deci expunem functiile explicit
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8') +
    '\n;this.__doPost = doPost; this.__setup = setup;';
  vm.runInContext(src, ctx);
  ctx.__setup();
  return { post: (body) => JSON.parse(ctx.__doPost({ postData: { contents: JSON.stringify(body) } }).text), sheets };
}

module.exports = { load };
