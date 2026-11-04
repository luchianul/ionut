# Pontaj

Aplicație de pontaj pentru angajați: **EXE pentru Windows** (administrator) și **APK pentru Android** (angajați).
Toate datele stau într-un **Google Sheets** al tău, deci toți văd aceleași informații.

- **Angajat**: se loghează, adaugă pontaje (data, ora intrare / ieșire, adresa șantierului, km, parcare), vede totalul lunii. Butoane „Intrare acum" / „Iesire acum".
- **Administrator**: vede pontajele tuturor, filtrează pe angajat și perioadă, modifică / șterge, rezumat pe angajat, export CSV, creează și gestionează conturile angajaților și tarifele (tarif/oră, tarif/km).
- **Total pontaj** = ore × tarif/oră + km × tarif/km + parcare. Tariful se copiază din profilul angajatului la crearea pontajului, deci modificările de tarif nu schimbă istoricul. Tura peste miezul nopții se calculează corect.
- Angajatul nu poate seta tarife; își poate modifica sau șterge propriile pontaje. Nu există aprobare.

## 1. Pregătește Google Sheets (o singură dată, ~5 minute)

1. Creează un Google Sheets nou (de ex. „Pontaj").
2. **Extensii → Apps Script**. Șterge codul existent și lipește tot conținutul din [`apps-script/Code.gs`](apps-script/Code.gs).
3. În primele rânduri schimbă `ADMIN_PAROLA_INITIALA` cu parola ta de administrator.
4. Alege funcția `setup` din bara de sus și apasă **Run**. Acceptă permisiunile cerute. Se creează foile `Angajati`, `Pontaje`, `Setari` și contul `admin`.
5. **Deploy → New deployment → Web app**: *Execute as* = **Me**, *Who has access* = **Anyone**. Copiază URL-ul (se termină în `/exec`).
6. Moneda se schimbă în foaia `Setari` (implicit `EUR`).

> Cine are URL-ul nu are acces la date fără utilizator și parolă. Nu edita manual coloanele `salt` și `hash` din foaia `Angajati`; parolele se schimbă din aplicație.
> Dacă modifici `Code.gs` mai târziu: **Deploy → Manage deployments → Edit → New version**.

## 2. Pune URL-ul în aplicație

Fie editezi [`www/config.js`](www/config.js) și pui URL-ul în `API_URL` (recomandat, înainte de build, ca angajații să nu îl scrie), fie îl introduci în aplicație la **Setări server** (ecranul de login).

## 3. Build și actualizări automate

La **fiecare push pe `main`** care modifică aplicația (`www/`, `electron/` etc.), GitHub construiește EXE + APK și publică automat un **Release** nou (`v1.1.N`) la [Releases](../../releases). Nu trebuie să faci nimic manual. Poți porni și manual: **Actions → Build si publica versiune noua → Run workflow**.

- **Windows**: instalează o singură dată `Pontaj-<versiune>-installer.exe`. De acolo aplicația verifică singură Releases la pornire (și din oră în oră), descarcă versiunea nouă și te întreabă dacă repornești ca să o instaleze.
- **Android**: instalează `Pontaj.apk` o singură dată. La pornire aplicația verifică Releases; dacă există o versiune mai nouă apare sus un banner **„Actualizează"** care descarcă APK-ul, iar tu îl instalezi peste cel vechi (datele nu se pierd). Android nu permite instalarea complet silențioasă în afara Google Play.
- APK-ul este semnat cu o cheie fixă din `android-signing/` (aceeași la fiecare build, altfel Android nu acceptă actualizarea). Cheia este în repo, deci este potrivită pentru distribuție internă, nu pentru Google Play.

Ca să schimbi ceva în aplicație: modifici fișierele din `www/`, faci push pe `main`, iar în câteva minute toți primesc update-ul. Dacă modifici `apps-script/Code.gs`, trebuie să-l lipești în Apps Script și să faci **Deploy → Manage deployments → Edit → New version**.

## Dezvoltare locală

```bash
npm install
npm run start       # deschide aplicația desktop (Electron)
npm run test:e2e    # test complet cu Google Sheets simulat (Code.gs real + interfața în Chromium)
```

## Structură

| Cale | Rol |
|---|---|
| `apps-script/Code.gs` | API pe Google Sheets (login, angajați, pontaje) |
| `www/` | interfața (HTML/CSS/JS, fără dependențe), folosită și de EXE și de APK |
| `electron/` | împachetare Windows |
| `capacitor.config.json` | împachetare Android (proiectul `android/` se generează în build) |
| `.github/workflows/build.yml` | build automat EXE + APK |
| `test/` | teste cap-coadă |
