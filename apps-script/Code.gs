/**
 * Pontaj - backend Google Apps Script (datele stau in Google Sheets).
 *
 * Instalare: vezi README.md. Pe scurt:
 *  1. Schimba ADMIN_PAROLA_INITIALA de mai jos.
 *  2. Ruleaza o data functia setup().
 *  3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */
const ADMIN_UTILIZATOR = 'admin';
const ADMIN_PAROLA_INITIALA = 'SCHIMBA-MA-1234';

const TAB_ANG = 'Angajati';
const TAB_PON = 'Pontaje';
const TAB_SET = 'Setari';
const H_ANG = ['id', 'nume', 'utilizator', 'salt', 'hash', 'rol', 'tarif_h', 'tarif_km', 'activ'];
// 'status' ramane ca atare pentru compatibilitate cu foile existente, dar nu mai este folosit
const H_PON = ['id', 'angajat_id', 'data', 'ora_intrare', 'ora_iesire', 'adresa', 'km', 'parcare',
  'tarif_h', 'tarif_km', 'ore', 'total', 'status', 'creat_la', 'modificat_la'];
const TOKEN_ZILE = 30;

/* ---------------------------------------------------------------- setup */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ang = tab_(ss, TAB_ANG, H_ANG);
  const pon = tab_(ss, TAB_PON, H_PON);
  const set = tab_(ss, TAB_SET, ['cheie', 'valoare']);

  // coloane text, ca Sheets sa nu transforme datele/orele/hash-urile in alte tipuri
  ang.getRange(1, 1, ang.getMaxRows(), 6).setNumberFormat('@');
  [1, 2, 3, 4, 5, 6, 13, 14, 15].forEach(function (c) {
    pon.getRange(1, c, pon.getMaxRows(), 1).setNumberFormat('@');
  });

  if (ang.getLastRow() < 2) {
    const salt = Utilities.getUuid();
    write_(ang, 2, H_ANG, {
      id: 'a_' + uid_(), nume: 'Administrator', utilizator: ADMIN_UTILIZATOR, salt: salt,
      hash: hash_(salt, ADMIN_PAROLA_INITIALA), rol: 'admin', tarif_h: 0, tarif_km: 0, activ: true,
    });
  }
  if (set.getLastRow() < 2) set.getRange(2, 1, 1, 2).setValues([['moneda', 'EUR']]);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('Gata. Utilizator admin: ' + ADMIN_UTILIZATOR + ' / parola initiala din cod.');
}

/* ----------------------------------------------------------- entry points */

function doGet() {
  return ContentService.createTextOutput('Pontaj API OK');
}

const WRITE_ACTIONS = ['pon_save', 'pon_delete', 'ang_save', 'parola_schimba'];
let MEMO_ = {}; // citiri memoizate in cadrul unui singur apel (foaia se citeste o singura data)

function doPost(e) {
  let out, lock = null;
  MEMO_ = {};
  try {
    const req = JSON.parse(e.postData.contents);
    if (WRITE_ACTIONS.indexOf(req.action) >= 0) { lock = LockService.getScriptLock(); lock.waitLock(20000); } // citirile nu asteapta
    out = { ok: true, data: dispatch_(req) };
  } catch (err) {
    out = { ok: false, error: String(err.message || err), auth: !!err.auth };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (x) { /* ignore */ }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(req) {
  const a = req.action, d = req.data || {};
  if (a === 'login') return login_(d);
  const u = verify_(req.token);
  const admin = u.rol === 'admin';
  switch (a) {
    case 'me': return { user: publicUser_(u), config: config_() };
    case 'parola_schimba': return changePass_(u, d);
    case 'pon_list': return ponList_(u, d);
    case 'pon_save': return ponSave_(u, d);
    case 'pon_delete': return ponDelete_(u, d);
    case 'ang_list': need_(admin); return readAll_(TAB_ANG, H_ANG).map(publicUser_);
    case 'ang_save': need_(admin); return angSave_(u, d);
    default: throw new Error('Actiune necunoscuta: ' + a);
  }
}

function need_(ok) { if (!ok) { const e = new Error('Doar administratorul poate face asta.'); throw e; } }

/* ----------------------------------------------------------------- auth */

function login_(d) {
  const user = String(d.utilizator || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const key = 'fail_' + user;
  if (Number(cache.get(key) || 0) >= 10) throw new Error('Prea multe incercari. Reincearca peste 15 minute.');
  const u = readAll_(TAB_ANG, H_ANG).find(function (x) { return String(x.utilizator).toLowerCase() === user; });
  if (!u || !isTrue_(u.activ) || hash_(u.salt, String(d.parola || '')) !== u.hash) {
    cache.put(key, String(Number(cache.get(key) || 0) + 1), 900);
    throw new Error('Utilizator sau parola gresite.');
  }
  cache.remove(key);
  return { token: sign_({ u: u.id, e: Date.now() + TOKEN_ZILE * 864e5 }), user: publicUser_(u), config: config_() };
}

function verify_(token) {
  const authErr = function () { const e = new Error('Sesiune expirata. Autentifica-te din nou.'); e.auth = true; return e; };
  const p = String(token || '').split('.');
  if (p.length !== 2) throw authErr();
  const sig = b64_(Utilities.computeHmacSha256Signature(p[0], secret_()));
  if (sig !== p[1]) throw authErr();
  const body = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString());
  if (body.e < Date.now()) throw authErr();
  const u = readAll_(TAB_ANG, H_ANG).find(function (x) { return x.id === body.u; });
  if (!u || !isTrue_(u.activ)) throw authErr();
  return u;
}

function sign_(body) {
  const p = Utilities.base64EncodeWebSafe(JSON.stringify(body), Utilities.Charset.UTF_8);
  return p + '.' + b64_(Utilities.computeHmacSha256Signature(p, secret_()));
}

function changePass_(u, d) {
  if (hash_(u.salt, String(d.veche || '')) !== u.hash) throw new Error('Parola veche este gresita.');
  if (String(d.noua || '').length < 4) throw new Error('Parola noua trebuie sa aiba minim 4 caractere.');
  setPass_(u, d.noua);
  writeRow_(TAB_ANG, H_ANG, u);
  return true;
}

/* ------------------------------------------------------------- angajati */

function angSave_(me, d) {
  const all = readAll_(TAB_ANG, H_ANG);
  const user = String(d.utilizator || '').trim().toLowerCase();
  if (!String(d.nume || '').trim()) throw new Error('Numele este obligatoriu.');
  if (!/^[a-z0-9._-]{3,30}$/.test(user)) throw new Error('Utilizator: 3-30 caractere (litere, cifre, . _ -).');
  if (all.some(function (x) { return x.id !== d.id && String(x.utilizator).toLowerCase() === user; })) {
    throw new Error('Acest utilizator exista deja.');
  }
  let o = d.id ? all.find(function (x) { return x.id === d.id; }) : null;
  if (d.id && !o) throw new Error('Angajatul nu exista.');
  if (!o) {
    if (String(d.parola || '').length < 4) throw new Error('Parola trebuie sa aiba minim 4 caractere.');
    o = { id: 'a_' + uid_() };
  }
  const rol = d.rol === 'admin' ? 'admin' : 'angajat';
  const activ = d.activ === undefined ? true : isTrue_(d.activ);
  if (o.id === me.id && (!activ || rol !== 'admin')) throw new Error('Nu iti poti dezactiva sau retrograda propriul cont.');
  o.nume = String(d.nume).trim();
  o.utilizator = user;
  o.rol = rol;
  o.activ = activ;
  o.tarif_h = num_(d.tarif_h);
  o.tarif_km = num_(d.tarif_km);
  if (d.parola) setPass_(o, d.parola);
  writeRow_(TAB_ANG, H_ANG, o);
  return publicUser_(o);
}

function setPass_(o, parola) {
  o.salt = Utilities.getUuid();
  o.hash = hash_(o.salt, String(parola));
}

function publicUser_(u) {
  return { id: u.id, nume: u.nume, utilizator: u.utilizator, rol: u.rol,
    tarif_h: num_(u.tarif_h), tarif_km: num_(u.tarif_km), activ: isTrue_(u.activ) };
}

/* -------------------------------------------------------------- pontaje */

function ponList_(u, d) {
  const names = {};
  readAll_(TAB_ANG, H_ANG).forEach(function (a) { names[a.id] = a.nume; });
  let rows = readAll_(TAB_PON, H_PON);
  if (u.rol !== 'admin') rows = rows.filter(function (p) { return p.angajat_id === u.id; });
  else if (d.angajat_id) rows = rows.filter(function (p) { return p.angajat_id === d.angajat_id; });
  if (d.de) rows = rows.filter(function (p) { return String(p.data) >= d.de; });
  if (d.pana) rows = rows.filter(function (p) { return String(p.data) <= d.pana; });
  rows.sort(function (a, b) {
    return (String(b.data) + String(b.ora_intrare)).localeCompare(String(a.data) + String(a.ora_intrare));
  });
  return rows.map(function (p) { return pubPon_(p, names); });
}

function pubPon_(p, names) {
  return { id: p.id, angajat_id: p.angajat_id, angajat: names[p.angajat_id] || '?', data: String(p.data),
    ora_intrare: String(p.ora_intrare), ora_iesire: String(p.ora_iesire || ''), adresa: String(p.adresa || ''),
    km: num_(p.km), parcare: num_(p.parcare), tarif_h: num_(p.tarif_h), tarif_km: num_(p.tarif_km),
    ore: num_(p.ore), total: num_(p.total) };
}

function ponSave_(u, d) {
  const admin = u.rol === 'admin';
  const emps = readAll_(TAB_ANG, H_ANG);
  const ex = d.id ? readAll_(TAB_PON, H_PON).find(function (p) { return p.id === d.id; }) : null;
  if (d.id && !ex) throw new Error('Pontajul nu exista.');
  if (!admin && ex && ex.angajat_id !== u.id) throw new Error('Nu poti modifica pontajul altcuiva.');
  const angId = admin ? (d.angajat_id || (ex && ex.angajat_id)) : u.id;
  const emp = emps.find(function (e) { return e.id === angId; });
  if (!emp) throw new Error('Alege un angajat.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.data || ''))) throw new Error('Data invalida.');
  if (!/^\d{2}:\d{2}$/.test(String(d.ora_intrare || ''))) throw new Error('Ora de intrare este obligatorie.');
  if (d.ora_iesire && !/^\d{2}:\d{2}$/.test(String(d.ora_iesire))) throw new Error('Ora de iesire invalida.');

  const now = new Date().toISOString();
  const o = ex || { id: 'p_' + uid_(), creat_la: now };
  o.angajat_id = angId;
  o.data = d.data;
  o.ora_intrare = d.ora_intrare;
  o.ora_iesire = d.ora_iesire || '';
  o.adresa = String(d.adresa || '').slice(0, 300);
  o.km = Math.max(0, num_(d.km));
  o.parcare = Math.max(0, num_(d.parcare));
  if (admin) {
    o.tarif_h = hasVal_(d.tarif_h) ? num_(d.tarif_h) : (ex ? num_(ex.tarif_h) : num_(emp.tarif_h));
    o.tarif_km = hasVal_(d.tarif_km) ? num_(d.tarif_km) : (ex ? num_(ex.tarif_km) : num_(emp.tarif_km));
  } else if (!ex) {
    o.tarif_h = num_(emp.tarif_h);
    o.tarif_km = num_(emp.tarif_km);
  }
  o.ore = calcOre_(o.ora_intrare, o.ora_iesire);
  o.total = round2_(o.ore * o.tarif_h + o.km * o.tarif_km + o.parcare);
  o.modificat_la = now;
  writeRow_(TAB_PON, H_PON, o);
  const names = {}; names[emp.id] = emp.nume;
  return pubPon_(o, names);
}

function ponDelete_(u, d) {
  const sh = sheet_(TAB_PON);
  const p = readAll_(TAB_PON, H_PON).find(function (x) { return x.id === d.id; });
  if (!p) throw new Error('Pontajul nu exista.');
  if (u.rol !== 'admin' && p.angajat_id !== u.id) throw new Error('Nu poti sterge pontajul altcuiva.');
  sh.deleteRow(p._row);
  MEMO_ = {};
  return true;
}

/* -------------------------------------------------------------- helpers */

function calcOre_(i, o) {
  if (!i || !o) return 0;
  const a = i.split(':'), b = o.split(':');
  let m = (Number(b[0]) * 60 + Number(b[1])) - (Number(a[0]) * 60 + Number(a[1]));
  if (m < 0) m += 1440; // tura peste miezul noptii
  return round2_(m / 60);
}

function config_() {
  const cfg = { moneda: 'EUR' };
  readAll_(TAB_SET, ['cheie', 'valoare']).forEach(function (r) { if (r.cheie) cfg[r.cheie] = r.valoare; });
  return cfg;
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Lipseste foaia "' + name + '". Ruleaza setup().');
  return sh;
}

function tab_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function readAll_(name, head) {
  if (MEMO_[name]) return MEMO_[name];
  const sh = sheet_(name);
  const last = sh.getLastRow();
  const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, head.length).getValues().map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
  MEMO_[name] = rows;
  return rows;
}

function write_(sh, row, head, o) {
  sh.getRange(row, 1, 1, head.length).setValues([head.map(function (h) { return o[h] === undefined ? '' : o[h]; })]);
}

function writeRow_(name, head, o) {
  const sh = sheet_(name);
  write_(sh, o._row || (sh.getLastRow() + 1), head, o);
  delete MEMO_[name];
}

function hash_(salt, parola) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + parola, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) throw new Error('Ruleaza intai functia setup().');
  return s;
}

function b64_(bytes) { return Utilities.base64EncodeWebSafe(bytes); }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function num_(v) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
function hasVal_(v) { return v !== undefined && v !== null && v !== ''; }
function round2_(n) { return Math.round(n * 100) / 100; }
function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true'; }
