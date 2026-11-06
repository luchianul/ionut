/**
 * Api.gs - ADAUGA acest fisier in proiectul tau Apps Script (langa Code.gs si Index).
 * Permite aplicatiilor APK / EXE sa apeleze aceleasi functii ca interfata web, fara parola.
 * Dupa adaugare: Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * (Interfata web existenta, doGet din Code.gs, continua sa mearga neschimbat.)
 */
function apiFunctii_() {
  return {
    getAppData: api_getAppData,
    adaugaDate: api_adaugaDate,
    stergeRand: api_stergeRand,
    marcheazaPlata: marcheazaPlata,
    getFacturi: api_getFacturi,
    salveazaFactura: salveazaFactura,
    editeazaFactura: editeazaFactura,
    stergeFactura: stergeFactura,
    salveazaAvansFactura: salveazaAvansFactura,
    actualizeazaFactura: actualizeazaFactura,
    salveazaTarife: salveazaTarife,
    getTarife: getTarife,
    getEvidentaMotorina: api_getEvidentaMotorina,
    salveazaFacturaCarburant: api_salveazaFacturaCarburant,
    stergeFacturaCarburant: stergeFacturaCarburant,
    editeazaMotorina: api_editeazaMotorina,
    getSuiviBadge: getSuiviBadge
  };
}

function doPost(e) {
  var out, lock = null;
  try {
    var req = JSON.parse(e.postData.contents);
    var API_FUNCTII = apiFunctii_();
    if (!Object.prototype.hasOwnProperty.call(API_FUNCTII, req.fn)) throw new Error('Functie necunoscuta: ' + req.fn);
    // scrierile ruleaza pe rand (evita suprapuneri la actualizarea Sheet2); citirile nu asteapta
    if (req.fn.indexOf('get') !== 0) { lock = LockService.getScriptLock(); lock.waitLock(30000); }
    var data = API_FUNCTII[req.fn].apply(null, req.args || []);
    out = { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (x) { /* ignore */ }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   Numere sigure: citim valoarea REALA din celula (numar), nu textul afisat.
   Textul afisat depinde de limba foii (ex. "610,14") sau de formatul celulei (ex. "610"),
   iar parseFloat("610,14") da 610 si pierdea zecimalele.
   ========================================================= */

// "610,14" / "610.14" / "1.234,56" / "1,234.56" / "610,14 €" / numar -> numar
function nrSigur_(v) {
  if (typeof v === 'number') return v;
  var s = String(v === null || v === undefined ? '' : v).replace(/[^\d,.\-]/g, '');
  if (s === '' || s === '-') return 0;
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  return parseFloat(s) || 0;
}

// numar -> text cu punct zecimal (celule goale raman goale)
function strNr_(v) { return (v === '' || v === null || v === undefined) ? '' : String(nrSigur_(v)); }

function foaie_(nume) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nume); }

function api_getAppData(an) {
  var res = getAppData(an);
  var raw1 = foaie_('Sheet1').getDataRange().getValues();
  var raw2 = foaie_('Sheet2').getDataRange().getValues();
  res.istoric.forEach(function (r) {
    var raw = raw1[r[r.length - 1] - 1]; // ultimul element = randul din foaie
    if (!raw) return;
    [5, 6, 9, 10, 11].forEach(function (c) { r[c] = strNr_(raw[c]); }); // Ore, KM, Parcare, TarifH, TarifKm
  });
  var dupaSapt = {};
  raw2.forEach(function (r, i) { if (i > 0) dupaSapt[r[6] + '_' + r[7]] = r; });
  res.statistici.forEach(function (st) {
    var raw = dupaSapt[st[6] + '_' + st[7]];
    if (!raw) return;
    [1, 2, 3, 4, 5, 8].forEach(function (c) { st[c] = strNr_(raw[c]); }); // TotH, TotKM, SumH, SumKM, Total, TotParcare
  });
  return res;
}

function api_adaugaDate(obj) {
  obj.km = nrSigur_(obj.km);
  obj.parcare = nrSigur_(obj.parcare);
  obj.tarifH = nrSigur_(obj.tarifH);
  obj.tarifKm = nrSigur_(obj.tarifKm);
  adaugaDate(obj);
  return api_getAppData();
}

function api_stergeRand(idx, dataS, h, km, prk) {
  stergeRand(idx, dataS, nrSigur_(h), nrSigur_(km), nrSigur_(prk));
  return api_getAppData();
}

function api_getFacturi(an) {
  var rows = getFacturi(an);
  var raw = foaie_('Facturi').getDataRange().getValues();
  rows.forEach(function (r) {
    var rw = raw[r[r.length - 1] - 1];
    if (!rw) return;
    [3, 4, 5, 6, 10].forEach(function (c) { r[c] = strNr_(rw[c]); }); // TotalH, TotalKM, TotalParcare, Total, Avans
  });
  return rows;
}

function api_getMotorina(an) {
  var rows = getMotorina(an);
  var raw = foaie_('FacturiCarburant').getDataRange().getValues();
  rows.forEach(function (r) {
    var rw = raw[r[r.length - 1] - 1];
    if (rw) r[2] = strNr_(rw[2]); // Suma
  });
  return rows;
}

function api_getEvidentaMotorina(an) {
  var totalKm = 0, totalIncasatKm = 0;
  var s2 = foaie_('Sheet2');
  if (s2) {
    s2.getDataRange().getValues().forEach(function (r, i) {
      if (i > 0 && r[7] == an) { totalKm += nrSigur_(r[2]); totalIncasatKm += nrSigur_(r[4]); }
    });
  }
  var facturi = api_getMotorina(an);
  var totalFacturi = facturi.reduce(function (sum, f) { return sum + nrSigur_(f[2]); }, 0);
  return {
    totalKm: totalKm,
    totalIncasatKm: totalIncasatKm,
    rataMedie: totalKm > 0 ? totalIncasatKm / totalKm : 0,
    facturi: facturi,
    totalFacturi: totalFacturi,
    profitNet: totalIncasatKm - totalFacturi
  };
}

function api_salveazaFacturaCarburant(obj) {
  obj.suma = nrSigur_(obj.suma);
  return salveazaFacturaCarburant(obj);
}

function api_editeazaMotorina(params) {
  params.suma = nrSigur_(params.suma);
  return editeazaMotorina(params);
}
