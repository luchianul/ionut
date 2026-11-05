# Pontaj Ionuț — aplicație Windows (EXE) și Android (APK)

Este aceeași aplicație ca cea din Google Apps Script (Jurnal, Statistici, Facturi, Evidență Motorină, Suivi), fără parolă,
dar instalabilă pe PC și telefon. Datele rămân în același Google Sheets, prin același `Code.gs`.

## Cum funcționează
- `www/index.html` = interfața ta originală (aceleași ecrane și funcții). Bibliotecile (Bootstrap, SweetAlert, confetti, fonturi) sunt incluse local în `www/vendor/`.
- `www/gas-shim.js` înlocuiește `google.script.run` cu apeluri HTTPS către aplicația ta web Apps Script.
- `apps-script/Api.gs` = singurul fișier nou de adăugat în proiectul tău Apps Script (expune aceleași funcții din `Code.gs` aplicațiilor APK/EXE).
- `apps-script/Code.gs` = copia codului tău, neschimbat (folosit la teste).

## Instalare (o singură dată)
1. În proiectul tău Apps Script: **+ → Script**, numește-l `Api` și lipește conținutul din [`apps-script/Api.gs`](apps-script/Api.gs).
2. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Adresa `/exec` rămâne aceeași.
3. Pune adresa `/exec` în [`www/config.js`](www/config.js) (`API_URL`) sau introdu-o în aplicație la prima pornire (se ține minte).
4. Descarcă din **Releases**: `Pontaj-<versiune>-installer.exe` (Windows) și `Pontaj.apk` (Android).

Interfața web veche (cu `?p=...`) continuă să funcționeze neschimbat.

## Actualizări automate
La fiecare push pe `main` care modifică aplicația (`www/`, `electron/` etc.) se construiesc EXE + APK și se publică un Release nou.
- **Windows**: aplicația instalată caută singură versiuni noi (la pornire și din oră în oră) și te întreabă dacă repornești.
- **Android**: la pornire apare bannerul „Actualizează" care descarcă APK-ul nou; îl instalezi peste cel vechi (datele sunt în Sheets, nu se pierd).
- APK-ul este semnat cu o cheie fixă din `android-signing/` (necesar pentru ca Android să accepte actualizarea). Este potrivit pentru uz intern, nu pentru Google Play.

Dacă modifici `Code.gs` în Apps Script, fă din nou **New version** la deployment.

## Dezvoltare
```bash
npm install
npm start          # aplicația desktop
npm run test:e2e   # Code.gs + Api.gs reale peste un Sheets simulat + interfața în Chromium
```
