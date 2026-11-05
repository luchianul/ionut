function doGet(e) {
  // Dacă accesezi link-ul simplu, deschide Index. 
  // Dacă adaugi ?p=interfata, deschide pagina cu animație.
  var page = e.parameter.p || "Index"; 
  
  return HtmlService.createTemplateFromFile(page)
      .evaluate()
      .setTitle('Pontaj Profesional 2026')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function getAppData(anFiltrat) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet1 = ss.getSheetByName("Sheet1") || ss.insertSheet("Sheet1");
  var sheet2 = ss.getSheetByName("Sheet2") || ss.insertSheet("Sheet2");
  
  var anCautat = anFiltrat || "2026";

  // Verificare headere
  if (sheet1.getLastRow() == 0) sheet1.appendRow(["Ziua", "Data", "In", "Out", "Strada", "Ore", "KM", "Nume", "Cash", "Parcare", "TarifH", "TarifKm"]);
  if (sheet2.getLastRow() == 0) sheet2.appendRow(["ID", "TotH", "TotKM", "SumH", "SumKM", "Total", "Sapt", "An", "TotParcare", "Status"]);

  var date1 = sheet1.getDataRange().getDisplayValues();
  var date2 = sheet2.getDataRange().getDisplayValues();
  
  date1.shift(); // Scoatem headerul
  date2.shift();

  // 1. FILTRARE JURNAL (Sheet1)
  var istoricFinal = date1.map(function(r, i) {
    r.push(i + 2); // ID rând original pentru editare/ștergere
    return r;
  }).filter(function(r) {
    // Păstrăm doar ce aparține anului selectat
    return r[1] && r[1].indexOf(anCautat) !== -1;
  });
  // NOTĂ: Am șters .reverse() de aici pentru că tu le pui deja sus în Sheet

  // 2. FILTRARE STATISTICI (Sheet2)
  var statisticiFiltrate = date2.filter(function(s) {
    return s[7] == anCautat;
  });

  return {
    istoric: istoricFinal, // Va respecta ordinea din foaie (cele noi sus)
    statistici: statisticiFiltrate.reverse() // Statisticile de obicei e bine să fie cele mai noi sus
  };
}

function adaugaDate(obj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet1 = ss.getSheetByName("Sheet1");
  var lastRow = sheet1.getLastRow();
  
  // 1. Verificare dubluri (doar pentru înregistrări noi)
  if (!obj.ridx) {
    if (lastRow > 1) {
      var dateExistente = sheet1.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < dateExistente.length; i++) {
        if (dateExistente[i][0].toString().trim() === obj.data.toString().trim()) {
          throw new Error("ALERTA: Există deja un pontaj salvat pe data de " + obj.data);
        }
      }
    }
  }

  // 2. Pregătire date noi
  var h = parseFloat(calculOre(obj.oraIntrare, obj.oraIesire)) || 0;
  var km = parseFloat(obj.km) || 0;
  var prk = parseFloat(obj.parcare) || 0;
    var tH = parseFloat(String(obj.tarifH).replace(",", ".")) || 0;
  var tK = parseFloat(String(obj.tarifKm).replace(",", ".")) || 0;
  var rindData = [obj.ziua, obj.data, obj.oraIntrare, obj.oraIesire, obj.strada, h, km, obj.nume, obj.isCash, prk, tH, tK];

  // --- LOGICA DE ACTUALIZARE STATISTICI ---
  if (obj.ridx) {
    // EDITARE: Trebuie să scădem valorile VECHI înainte de a adăuga pe cele NOI
    var dateVechi = sheet1.getRange(obj.ridx, 1, 1, 12).getValues()[0];
    var dataVeche = dateVechi[1];
    var hVechi = parseFloat(dateVechi[5]) || 0;
    var kmVechi = parseFloat(dateVechi[6]) || 0;
    var prkVechi = parseFloat(dateVechi[9]) || 0;
    var tHVechi = parseFloat(dateVechi[10]) || tH;
    var tKVechi = parseFloat(dateVechi[11]) || tK;

    // SCĂDEM valorile vechi din Sheet2
    actualizeazaSaptamana(dataVeche, hVechi, kmVechi, prkVechi, tHVechi, tKVechi, true);

    // Scriem noile date peste rândul existent
    sheet1.getRange(obj.ridx, 1, 1, 12).setValues([rindData]);
  } else {
    // NOU: Inserăm rând nou
    sheet1.insertRowBefore(2); 
    sheet1.getRange(2, 1, 1, 12).setValues([rindData]);
  }

  // ADĂUGĂM noile valori în Sheet2 (indiferent dacă e editare sau nou)
  actualizeazaSaptamana(obj.data, h, km, prk, obj.tarifH, obj.tarifKm, false);

  // 3. Sortare (opțional, dar recomandat pentru ordine)
  if (sheet1.getLastRow() > 1) {
    sheet1.getRange(2, 1, sheet1.getLastRow() - 1, 12).sort({column: 2, ascending: false});
  }
  
  return getAppData();
}

function stergeRand(idx, dataS, h, km, prk) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet1 = ss.getSheetByName("Sheet1");
  var rand = sheet1.getRange(idx, 1, 1, 12).getValues()[0];
  var tH = parseFloat(rand[10]) || 30;
  var tK = parseFloat(rand[11]) || 0.45;
  actualizeazaSaptamana(dataS, h, km, prk, tH, tK, true);
  sheet1.deleteRow(idx);
  return getAppData();
}

function actualizeazaSaptamana(dataS, h, km, prk, tH, tK, esteScadere) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet2 = ss.getSheetByName("Sheet2");
  var d = new Date(dataS);
  var s = getWeekNumber(d);
  var a = d.getFullYear();
  var semn = esteScadere ? -1 : 1;

  // Banii generați DOAR de această zi, cu tariful EI (nu al săptămânii întregi)
  var banIntrareH = h * parseFloat(tH) * semn;
  var banIntrareK = km * parseFloat(tK) * semn;
  var banIntrarePrk = prk * semn;

  var rows = sheet2.getDataRange().getValues();
  var gasit = false;

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][6] == s && rows[i][7] == a) {
      var nH  = Math.max(0, parseFloat(rows[i][1]) + (h * semn));
      var nK  = Math.max(0, parseFloat(rows[i][2]) + (km * semn));
      var sH  = Math.max(0, parseFloat(rows[i][3]) + banIntrareH);   // <<< incremental, nu nH*tH
      var sK  = Math.max(0, parseFloat(rows[i][4]) + banIntrareK);   // <<< incremental
      var nP  = Math.max(0, (parseFloat(rows[i][8]) || 0) + banIntrarePrk);

      sheet2.getRange(i + 1, 1, 1, 9).setValues([[i, nH, nK, sH, sK, (sH + sK + nP), s, a, nP]]);
      gasit = true; break;
    }
  }

  if (!gasit && !esteScadere) {
    var sH = banIntrareH;
    var sK = banIntrareK;
    sheet2.appendRow([sheet2.getLastRow(), h, km, sH, sK, (sH + sK + prk), s, a, prk]);
  }
}

function calculOre(s, e) {
  if (!s || !e) return 0;
  var start = new Date("2000/01/01 " + s);
  var end = new Date("2000/01/01 " + e);
  if (end < start) end.setDate(end.getDate() + 1);
  return ((end - start) / 1000 / 60 / 60).toFixed(2);
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function marcheazaPlata(saptamana, an) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Schimbăm numele foii în Sheet2
  var sheet = ss.getSheetByName("Sheet2"); 
  if (!sheet) return "Eroare: Foaia Sheet2 nu a fost găsită!";
  
  var data = sheet.getDataRange().getValues();
  
  // Parcurgem rândurile
  for (var i = 1; i < data.length; i++) {
    // Verificăm săptămâna (presupunem că e tot pe coloana G, adică index 6)
    // Și verificăm eventual și anul dacă ai coloană separată
    if (data[i][6].toString() === saptamana.toString()) {
       // Setăm valoarea în coloana J (care este indexul 10)
       // i + 1 pentru că rândurile în Google Sheets încep de la 1, nu 0
       sheet.getRange(i + 1, 10).setValue("Platit");
    }
  }
  return true;
}
function getScriptUrl() {
  // Această funcție îi spune browserului exact adresa URL a aplicației tale
  return ScriptApp.getService().getUrl() + "?p=interfata";
}

/* =========================================================
   FACTURI — gestionare avans / status plată
   Coloane Facturi: A ID, B Numar, C Saptamani, D TotalH, E TotalKM,
   F TotalParcare, G Total, H An, I DataCreare, J Observatii,
   K Avans, L Status
   ========================================================= */

// Se asigură că foaia Facturi are coloanele Avans / Status.
// Dacă foaia a fost creată înainte de această actualizare, adaugă
// coloanele lipsă și completează valori implicite pentru rândurile vechi.
function asigHeaderFacturi(sheet) {
  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (header.indexOf("Avans") === -1) {
    sheet.getRange(1, lastCol + 1).setValue("Avans");
    sheet.getRange(1, lastCol + 2).setValue("Status");
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var nrRanduri = lastRow - 1;
      var avansuri = [];
      var statusuri = [];
      for (var i = 0; i < nrRanduri; i++) { avansuri.push([0]); statusuri.push(["Neplatit"]); }
      sheet.getRange(2, lastCol + 1, nrRanduri, 1).setValues(avansuri);
      sheet.getRange(2, lastCol + 2, nrRanduri, 1).setValues(statusuri);
    }
  }
}

function getFacturi(an) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Facturi");
  if (!sheet) {
    sheet = ss.insertSheet("Facturi");
    sheet.appendRow(["ID", "Numar", "Saptamani", "TotalH", "TotalKM", "TotalParcare", "Total", "An", "DataCreare", "Observatii", "Avans", "Status"]);
  }
  asigHeaderFacturi(sheet);
  var data = sheet.getDataRange().getDisplayValues();
  data.shift();
  return data.map(function(r, i) {
    r.push(i + 2); // rândul real din sheet, folosit pentru editare/ștergere/plată
    return r;
  }).filter(function(r) { return r[7] == an; });
}

function salveazaFactura(obj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Facturi");
  if (!sheet) {
    sheet = ss.insertSheet("Facturi");
    sheet.appendRow(["ID", "Numar", "Saptamani", "TotalH", "TotalKM", "TotalParcare", "Total", "An", "DataCreare", "Observatii", "Avans", "Status"]);
  }
  asigHeaderFacturi(sheet);
  var newId = sheet.getLastRow();
  var azi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  sheet.appendRow([
    newId,
    obj.numar,
    obj.saptamani.join(", "),
    obj.totalH,
    obj.totalKM,
    obj.totalParcare,
    obj.total,
    obj.an,
    azi,
    obj.observatii,
    0,
    "Neplatit"
  ]);
  return true;
}

function editeazaFactura(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Facturi');
  if (!sh) throw new Error('Sheet inexistent');

  sh.getRange(params.row, 2).setValue(params.numar);       // coloana B = numărul facturii
  sh.getRange(params.row, 10).setValue(params.observatii); // coloana J = observații
}

function stergeFactura(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Facturi');
  if (!sh) throw new Error('Sheet inexistent');

  sh.deleteRow(params.row);
}

// Salvează un avans (plată parțială) pentru o factură, sau o marchează
// ca plătită integral dacă params.marcheazaPlatit === true.
function salveazaAvansFactura(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Facturi");
  if (!sheet) throw new Error("Sheet Facturi nu a fost găsit!");
  asigHeaderFacturi(sheet);

  var row = params.row;
  var total = parseFloat(sheet.getRange(row, 7).getValue()) || 0; // coloana G = Total
  var avans;

  if (params.marcheazaPlatit) {
    avans = total;
  } else {
    avans = parseFloat(params.avans) || 0;
    if (avans < 0) avans = 0;
    if (avans > total) avans = total;
  }

  var status = avans <= 0 ? "Neplatit" : (avans >= total ? "Platit" : "Partial");

  sheet.getRange(row, 11).setValue(avans);  // coloana K = Avans
  sheet.getRange(row, 12).setValue(status); // coloana L = Status
  return { avans: avans, status: status, rest: Math.max(0, total - avans) };
}
function salveazaTarife(tH, tK) {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('tarifH_curent', tH);
  p.setProperty('tarifKm_curent', tK);
}

function getTarife() {
  var p = PropertiesService.getScriptProperties();
  return {
    tH: p.getProperty('tarifH_curent') || "30",
    tK: p.getProperty('tarifKm_curent') || "0.45"
  };
}
// functie pentru populat automat tarife

function backfillTarife() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet1 = ss.getSheetByName("Sheet1");
  var lastRow = sheet1.getLastRow();
  if (lastRow < 2) return;

  var TARIF_H_VECHI = 30;      // <-- pune aici tariful/h pe care l-ai folosit
  var TARIF_KM_VECHI = 0.45;   // <-- pune aici tariful/km pe care l-ai folosit

  var range = sheet1.getRange(2, 11, lastRow - 1, 2); // coloanele K și L
  var valori = range.getValues();

  for (var i = 0; i < valori.length; i++) {
    if (!valori[i][0]) valori[i][0] = TARIF_H_VECHI;
    if (!valori[i][1]) valori[i][1] = TARIF_KM_VECHI;
  }

  range.setValues(valori);
  Logger.log("Backfill complet pentru " + valori.length + " rânduri.");
}

// scriptul de recalculare completă

function recalculeazaSheet2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet1 = ss.getSheetByName("Sheet1");
  var sheet2 = ss.getSheetByName("Sheet2");
  if (!sheet1 || !sheet2) throw new Error("Sheet1 sau Sheet2 lipsă!");

  // 1. Salvăm statusurile "Platit" existente, ca să nu le pierdem (cheie: saptamana_an)
  var dateVechi = sheet2.getDataRange().getValues();
  dateVechi.shift(); // scoatem header
  var statusuriSalvate = {};
  dateVechi.forEach(function(r) {
    var cheie = r[6] + "_" + r[7]; // Sapt_An
    if (r[9] === "Platit") statusuriSalvate[cheie] = "Platit";
  });

  // 2. Citim toate zilele din Sheet1
  var lastRow1 = sheet1.getLastRow();
  if (lastRow1 < 2) {
    Logger.log("Sheet1 este gol, nimic de recalculat.");
    return;
  }
  var dateZile = sheet1.getRange(2, 1, lastRow1 - 1, 12).getValues();

  // 3. Agregăm pe săptămână+an, folosind tariful SALVAT pe fiecare zi (col K=index10, L=index11)
  var agregat = {}; // cheie: "sapt_an" -> { h, km, sumaH, sumaKm, prk }

  dateZile.forEach(function(r) {
    var data = r[1];
    if (!data) return;
    var d = new Date(data);
    var sapt = getWeekNumber(d);
    var an = d.getFullYear();
    var cheie = sapt + "_" + an;

    var h = parseFloat(r[5]) || 0;
    var km = parseFloat(r[6]) || 0;
    var prk = parseFloat(r[9]) || 0;
    var tH = parseFloat(r[10]) || 30;    // tarif h salvat pe zi (fallback 30 dacă lipsește)
    var tK = parseFloat(r[11]) || 0.45;  // tarif km salvat pe zi (fallback 0.45 dacă lipsește)

    if (!agregat[cheie]) {
      agregat[cheie] = { h: 0, km: 0, sumaH: 0, sumaKm: 0, prk: 0, sapt: sapt, an: an };
    }
    agregat[cheie].h += h;
    agregat[cheie].km += km;
    agregat[cheie].sumaH += h * tH;
    agregat[cheie].sumaKm += km * tK;
    agregat[cheie].prk += prk;
  });

  // 4. Golim Sheet2 (păstrăm doar headerul) și rescriem
  var lastRow2 = sheet2.getLastRow();
  if (lastRow2 > 1) {
    sheet2.getRange(2, 1, lastRow2 - 1, sheet2.getLastColumn()).clearContent();
  }

  var randuriNoi = [];
  var id = 1;
  Object.keys(agregat).forEach(function(cheie) {
    var g = agregat[cheie];
    var total = g.sumaH + g.sumaKm + g.prk;
    var status = statusuriSalvate[cheie] || "Neplatit"; // păstrăm Platit dacă exista
    randuriNoi.push([id, g.h, g.km, g.sumaH, g.sumaKm, total, g.sapt, g.an, g.prk, status]);
    id++;
  });

  // Sortăm după an, apoi săptămână (opțional, pentru claritate)
  randuriNoi.sort(function(a, b) {
    if (a[7] !== b[7]) return a[7] - b[7];
    return a[6] - b[6];
  });

  if (randuriNoi.length > 0) {
    sheet2.getRange(2, 1, randuriNoi.length, 10).setValues(randuriNoi);
  }

  Logger.log("Recalculare completă: " + randuriNoi.length + " săptămâni rescrise.");
}

/* =========================================================
   EVIDENȚĂ MOTORINĂ — facturi carburant
   Sheet: FacturiCarburant → ID, Nume, Suma, Data, An
   ========================================================= */

function getMotorina(an) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("FacturiCarburant");
  if (!sheet) {
    sheet = ss.insertSheet("FacturiCarburant");
    sheet.appendRow(["ID", "Nume", "Suma", "Data", "An"]);
  }
  var data = sheet.getDataRange().getDisplayValues();
  data.shift();
  return data.map(function(r, i) {
    r.push(i + 2); // rândul real, folosit la ștergere
    return r;
  }).filter(function(r) { return r[4] == an; });
}

function salveazaFacturaCarburant(obj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("FacturiCarburant");
  if (!sheet) {
    sheet = ss.insertSheet("FacturiCarburant");
    sheet.appendRow(["ID", "Nume", "Suma", "Data", "An"]);
  }
  var newId = sheet.getLastRow();
  var azi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var an = obj.an || azi.substring(0, 4);
  sheet.appendRow([newId, obj.nume, parseFloat(obj.suma) || 0, azi, an]);
  return true;
}

function stergeFacturaCarburant(row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("FacturiCarburant");
  if (!sheet) throw new Error("Sheet inexistent");
  sheet.deleteRow(row);
}

function getEvidentaMotorina(an) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet2 = ss.getSheetByName("Sheet2");
  var totalKm = 0, totalIncasatKm = 0;

  if (sheet2) {
    var data = sheet2.getDataRange().getValues();
    data.shift();
    data.forEach(function(r) {
      if (r[7] == an) {
        totalKm += parseFloat(r[2]) || 0;       // TotKM
        totalIncasatKm += parseFloat(r[4]) || 0; // SumKM = venit generat de km
      }
    });
  }

  var rataMedie = totalKm > 0 ? (totalIncasatKm / totalKm) : 0;
  var facturi = getMotorina(an);
  var totalFacturi = facturi.reduce(function(sum, f) { return sum + (parseFloat(f[2]) || 0); }, 0);

  return {
    totalKm: totalKm,
    totalIncasatKm: totalIncasatKm,
    rataMedie: rataMedie,
    facturi: facturi,
    totalFacturi: totalFacturi,
    profitNet: totalIncasatKm - totalFacturi
  };
}
function editeazaMotorina(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("FacturiCarburant");

  if (!sheet) {
    throw new Error("Sheet FacturiCarburant nu a fost găsit!");
  }

  var row = parseInt(params.row, 10);

  if (!row || row < 2) {
    throw new Error("Rând invalid: " + params.row);
  }

  var nume = String(params.nume || '').trim();
  var suma = parseFloat(params.suma);

  if (!nume) {
    throw new Error("Numele facturii este gol.");
  }

  if (isNaN(suma) || suma <= 0) {
    throw new Error("Suma este invalidă.");
  }

  sheet.getRange(row, 2).setValue(nume);
  sheet.getRange(row, 3).setValue(suma);

  SpreadsheetApp.flush();

  return true;
}
function diagnosticKm() {
  var an = "2026";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s1 = ss.getSheetByName("Sheet1");
  var rows = s1.getRange(2, 1, s1.getLastRow() - 1, 12).getValues();
  var disp = s1.getRange(2, 2, s1.getLastRow() - 1, 1).getDisplayValues();

  var totKm = 0, totSum = 0;
  rows.forEach(function(r, i) {
    if (String(disp[i][0]).indexOf(an) === -1) return;
    var km = parseFloat(r[6]) || 0;
    var tk = parseFloat(r[11]) || 0;
    totKm += km;
    totSum += km * tk;
    if (tk !== 0.45) {
      Logger.log("Rând " + (i + 2) + " | " + disp[i][0] + " | " + km + " km | tarif " + r[11] + " | diferență " + (km * (tk - 0.45)).toFixed(2));
    }
  });
  Logger.log("Sheet1 -> KM: " + totKm + " | SumKM real: " + totSum.toFixed(2) + " | KM*0.45: " + (totKm * 0.45).toFixed(2));

  var s2 = ss.getSheetByName("Sheet2").getDataRange().getValues();
  s2.shift();
  var k2 = 0, sum2 = 0;
  s2.forEach(function(r) { if (r[7] == an) { k2 += parseFloat(r[2]) || 0; sum2 += parseFloat(r[4]) || 0; } });
  Logger.log("Sheet2 -> KM: " + k2 + " | SumKM: " + sum2.toFixed(2));
}

function comparaSheet1Sheet2() {
  var TOL = 0.01;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s1 = ss.getSheetByName("Sheet1");
  var s2 = ss.getSheetByName("Sheet2");

  // 1. Agregăm Sheet1 pe săptămână + an (cu tariful salvat pe fiecare zi)
  var agregat = {};
  var n1 = s1.getLastRow() - 1;
  if (n1 > 0) {
    var vals = s1.getRange(2, 1, n1, 12).getValues();
    var disp = s1.getRange(2, 2, n1, 1).getDisplayValues();
    vals.forEach(function(r, i) {
      var dataStr = disp[i][0];
      if (!dataStr) return;
      var d = new Date(dataStr);
      var sapt = getWeekNumber(d);
      var an = d.getFullYear();
      var cheie = sapt + "_" + an;

      var h = parseFloat(r[5]) || 0;
      var km = parseFloat(r[6]) || 0;
      var prk = parseFloat(r[9]) || 0;
      var tH = parseFloat(r[10]) || 30;
      var tK = parseFloat(r[11]) || 0.45;

      if (!agregat[cheie]) agregat[cheie] = { sapt: sapt, an: an, h: 0, km: 0, sumH: 0, sumKm: 0, prk: 0 };
      var g = agregat[cheie];
      g.h += h; g.km += km; g.prk += prk;
      g.sumH += h * tH;
      g.sumKm += km * tK;
    });
  }

  // 2. Citim Sheet2
  var sheet2 = {};
  var n2 = s2.getLastRow() - 1;
  if (n2 > 0) {
    s2.getRange(2, 1, n2, 10).getValues().forEach(function(r) {
      var cheie = r[6] + "_" + r[7];
      sheet2[cheie] = {
        sapt: r[6], an: r[7],
        h: parseFloat(r[1]) || 0, km: parseFloat(r[2]) || 0,
        sumH: parseFloat(r[3]) || 0, sumKm: parseFloat(r[4]) || 0,
        prk: parseFloat(r[8]) || 0
      };
    });
  }

  // 3. Comparăm
  var toate = {};
  Object.keys(agregat).forEach(function(k) { toate[k] = true; });
  Object.keys(sheet2).forEach(function(k) { toate[k] = true; });

  var campuri = [["h", "Ore"], ["km", "KM"], ["sumH", "SumH"], ["sumKm", "SumKM"], ["prk", "Parcare"]];
  var nrProbleme = 0;

  Object.keys(toate).sort(function(a, b) {
    var pa = a.split("_"), pb = b.split("_");
    return (pa[1] - pb[1]) || (pa[0] - pb[0]);
  }).forEach(function(k) {
    var a = agregat[k], b = sheet2[k];
    if (!a) { Logger.log("Săpt. " + k + ": există în Sheet2, dar NU are zile în Sheet1"); nrProbleme++; return; }
    if (!b) { Logger.log("Săpt. " + k + ": există în Sheet1, dar LIPSEȘTE din Sheet2"); nrProbleme++; return; }

    var difs = [];
    campuri.forEach(function(c) {
      var diff = b[c[0]] - a[c[0]];
      if (Math.abs(diff) > TOL) {
        difs.push(c[1] + ": Sheet1=" + a[c[0]].toFixed(2) + " | Sheet2=" + b[c[0]].toFixed(2) + " | dif=" + diff.toFixed(2));
      }
    });
    if (difs.length) {
      nrProbleme++;
      Logger.log("Săpt. " + a.sapt + "/" + a.an + " -> " + difs.join("  ||  "));
    }
  });

  if (nrProbleme === 0) {
    Logger.log("Totul e în regulă: Sheet1 și Sheet2 sunt sincronizate.");
  } else {
    Logger.log("Au fost găsite " + nrProbleme + " săptămâni cu diferențe. Rulează recalculeazaSheet2() ca să le repari.");
  }
}
// Actualizează totalurile unei facturi după modificări în jurnal
function actualizeazaFactura(params) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Facturi');
  if (!sh) throw new Error('Sheet Facturi inexistent');

  var row = parseInt(params.row, 10);
  var numar = String(params.numar || '').trim();
  if (row < 2 || row > sh.getLastRow() ||
      String(sh.getRange(row, 2).getDisplayValue()).trim() !== numar) {
    throw new Error('Factura nu a fost găsită pe rândul indicat. Reîncarcă pagina.');
  }

  var total = parseFloat(params.total) || 0;
  sh.getRange(row, 4, 1, 4).setValues([[
    parseFloat(params.totalH) || 0,
    parseFloat(params.totalKM) || 0,
    parseFloat(params.totalParcare) || 0,
    total
  ]]);

  // Reajustăm avansul și statusul, în caz că totalul s-a schimbat
  var avans = parseFloat(sh.getRange(row, 11).getValue()) || 0;
  if (avans > total) avans = total;
  var status = avans <= 0 ? "Neplatit" : (avans >= total ? "Platit" : "Partial");
  sh.getRange(row, 11).setValue(avans);
  sh.getRange(row, 12).setValue(status);
  return true;
}
function getSuiviBadge() {
  try {
    var r = UrlFetchApp.fetch(
      "https://script.google.com/macros/s/AKfycbzmllvljiDAE50xaaLQJDxY94ef63_Ru0HjCtX2kv_GZmcLR_g7lR_r2nWjk-F0PRc83A/exec?api=compteurs",
      { muteHttpExceptions: true, followRedirects: true }
    );
    return JSON.parse(r.getContentText()).materiel || 0;
  } catch (e) {
    return 0;
  }
}
function repairaTarifeText() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var rng = sh.getRange(2, 11, n, 2); // coloanele K și L
  var vals = rng.getValues();
  for (var i = 0; i < vals.length; i++) {
    for (var j = 0; j < 2; j++) {
      if (typeof vals[i][j] === "string") {
        vals[i][j] = parseFloat(vals[i][j].replace(",", ".")) || 0;
      }
    }
  }
  rng.setValues(vals);
}