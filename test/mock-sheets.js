/* Simulator minimal Google Apps Script + Sheets: ruleaza Code.gs si Api.gs REALE local (doar pentru teste). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function load() {
  const sheets = {};
  const props = {};

  function makeSheet(name) {
    const sh = { name, rows: [] };
    const get = (r, c) => (sh.rows[r - 1] && sh.rows[r - 1][c - 1] !== undefined ? sh.rows[r - 1][c - 1] : '');
    const set = (r, c, v) => { while (sh.rows.length < r) sh.rows.push([]); (sh.rows[r - 1] = sh.rows[r - 1] || [])[c - 1] = v; };
    const lastRow = () => { let l = 0; sh.rows.forEach((r, i) => { if (r.some((x) => x !== '' && x !== undefined)) l = i + 1; }); return l; };
    const lastCol = () => sh.rows.reduce((m, r) => Math.max(m, r.length), 0);
    const range = (r, c, nr = 1, nc = 1) => {
      const grid = (f) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => f(get(r + i, c + j))));
      const rg = {
        getValues: () => grid((x) => x),
        getDisplayValues: () => grid((x) => (typeof x === 'number' ? String(x).replace('.', ',') : String(x))), // foaie in limba romana: virgula zecimala
        getValue: () => get(r, c), getDisplayValue: () => { const x = get(r, c); return typeof x === 'number' ? String(x).replace('.', ',') : String(x); },
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => set(r + i, c + j, x))); return rg; },
        setValue(x) { set(r, c, x); return rg; },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); return rg; },
        sort(o) {
          const part = sh.rows.slice(r - 1, r - 1 + nr);
          part.sort((a, b) => { const x = String(a[o.column - 1]), y = String(b[o.column - 1]); return (x < y ? -1 : x > y ? 1 : 0) * (o.ascending === false ? -1 : 1); });
          part.forEach((row, i) => { sh.rows[r - 1 + i] = row; });
          return rg;
        },
      };
      return rg;
    };
    return Object.assign(sh, {
      getRange: range,
      getDataRange: () => range(1, 1, lastRow(), lastCol()),
      getLastRow: lastRow, getLastColumn: lastCol,
      appendRow(arr) { sh.rows[lastRow()] = arr.slice(); },
      insertRowBefore(n) { sh.rows.splice(n - 1, 0, []); },
      deleteRow(n) { sh.rows.splice(n - 1, 1); },
    });
  }

  const ctx = {
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: { flush() {}, getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n)),
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'Europe/Brussels' },
    UrlFetchApp: { fetch() { throw new Error('offline'); } },
    ScriptApp: { getService: () => ({ getUrl: () => 'http://x' }) },
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  const src = ['Code.gs', 'Api.gs'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + '\n;this.__doPost = doPost;';
  vm.runInContext(src, ctx);
  return { post: (body) => JSON.parse(ctx.__doPost({ postData: { contents: JSON.stringify(body) } }).text), sheets };
}

module.exports = { load };
