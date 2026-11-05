/**
 * Api.gs - ADAUGA acest fisier in proiectul tau Apps Script (langa Code.gs si Index).
 * Permite aplicatiilor APK / EXE sa apeleze aceleasi functii ca interfata web, fara parola.
 * Dupa adaugare: Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * (Interfata web existenta, doGet din Code.gs, continua sa mearga neschimbat.)
 */
function apiFunctii_() {
  return {
    getAppData: getAppData,
    adaugaDate: adaugaDate,
    stergeRand: stergeRand,
    marcheazaPlata: marcheazaPlata,
    getFacturi: getFacturi,
    salveazaFactura: salveazaFactura,
    editeazaFactura: editeazaFactura,
    stergeFactura: stergeFactura,
    salveazaAvansFactura: salveazaAvansFactura,
    actualizeazaFactura: actualizeazaFactura,
    salveazaTarife: salveazaTarife,
    getTarife: getTarife,
    getEvidentaMotorina: getEvidentaMotorina,
    salveazaFacturaCarburant: salveazaFacturaCarburant,
    stergeFacturaCarburant: stergeFacturaCarburant,
    editeazaMotorina: editeazaMotorina,
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
