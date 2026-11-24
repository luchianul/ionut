/* Versiune, setări aplicație (adresa serverului + căutare actualizări) și anunț de actualizare (Android).
   Pe Windows actualizarea o face Electron (electron/main.js); aici doar o cerem manual din dialog. */
(function () {
  'use strict';
  const ver = window.APP_VERSION;
  const verText = (ver && ver !== 'dev') ? 'v' + ver : 'dev';
  const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const repo = () => (window.APP_CONFIG || {}).REPO;

  window.addEventListener('DOMContentLoaded', () => {
    const f = document.querySelector('.side-foot');
    if (f) { f.style.cursor = 'pointer'; f.innerHTML = '<i class="bi bi-gear-fill"></i> Setări · ' + verText; f.onclick = () => window.deschideSetariApp(); }
  });

  const num = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

  async function ultima() {
    const r = await (await fetch('https://api.github.com/repos/' + repo() + '/releases/latest')).json();
    return { tag: String(r.tag_name || ''), apk: (r.assets || []).find((a) => /\.apk$/i.test(a.name)) };
  }

  // anunț automat la pornire (Android): bară galbenă cu butonul „Actualizează”
  async function checkUpdate() {
    if (!native() || !ver || ver === 'dev' || !repo()) return;
    try {
      const u = await ultima();
      if (!u.apk || !newer(u.tag, ver)) return;
      const bar = document.createElement('div');
      bar.style.cssText = 'position:sticky;top:0;width:100%;z-index:3000;background:#FEF3C7;color:#78350F;padding:10px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;font:600 14px Inter,sans-serif';
      bar.innerHTML = '<span>Versiune nouă disponibilă (' + u.tag.replace(/[<>&]/g, '') + ')</span><button class="btn btn-sm btn-warning fw-bold">Actualizează</button>';
      bar.querySelector('button').onclick = () => { window.location.href = u.apk.browser_download_url; };
      document.body.prepend(bar);     // în fluxul paginii: împinge conținutul în jos, nu acoperă iconița de setări
    } catch (e) { /* fără internet: ignorăm */ }
  }
  window.addEventListener('load', checkUpdate);

  // căutare manuală din dialog
  async function verificaManual() {
    if (window.electronApp && window.electronApp.checkUpdates) {
      let r; try { r = await window.electronApp.checkUpdates(); } catch (e) { r = { status: 'error' }; }
      if (r.status === 'available') return { kind: 'noua', text: 'Versiunea ' + r.version + ' se descarcă acum. Când e gata, aplicația te întreabă dacă repornești.' };
      if (r.status === 'none') return { kind: 'ok', text: 'Ai cea mai nouă versiune (' + verText + ').' };
      if (r.status === 'dev') return { kind: 'info', text: 'Varianta de dezvoltare nu se actualizează.' };
      return { kind: 'eroare', text: 'Nu pot verifica acum. Ai internet?' };
    }
    if (!native()) return { kind: 'info', text: 'Actualizările merg doar în aplicația instalată (Android sau Windows).' };
    if (!ver || ver === 'dev') return { kind: 'info', text: 'Varianta de dezvoltare nu se actualizează.' };
    try {
      const u = await ultima();
      if (!u.apk) return { kind: 'eroare', text: 'Versiunea nouă nu are încă fișierul pentru telefon.' };
      if (!newer(u.tag, ver)) return { kind: 'ok', text: 'Ai cea mai nouă versiune (' + verText + ').' };
      return { kind: 'noua', text: 'Versiune nouă: ' + u.tag + '. Descarcă fișierul, deschide-l și apasă Instalează. Datele rămân.', apkUrl: u.apk.browser_download_url };
    } catch (e) { return { kind: 'eroare', text: 'Nu pot verifica acum. Ai internet?' }; }
  }

  // dialog propriu (nu SweetAlert), ca să nu intre în conflict cu fereastra „Se încarcă datele...”
  window.deschideSetariApp = function () {
    if (document.getElementById('app-settings')) return;
    const ov = document.createElement('div');
    ov.id = 'app-settings';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,sans-serif';
    ov.innerHTML = '<div style="background:#fff;border-radius:18px;padding:22px;max-width:460px;width:100%;max-height:92vh;overflow:auto">' +
      '<div class="d-flex justify-content-between align-items-center mb-2"><h4 class="fw-bold m-0">Setări aplicație</h4><button type="button" class="btn-close" id="as-close" aria-label="Închide"></button></div>' +
      '<div class="text-muted small mb-3">Versiune: <b>' + verText + '</b></div>' +
      '<label class="fw-bold small mb-1">Adresa serverului (Google Apps Script, se termină în /exec)</label>' +
      '<input id="as-url" type="url" class="form-control" placeholder="https://script.google.com/macros/s/.../exec">' +
      '<div id="as-err" class="text-danger small mt-1" style="min-height:1.2em"></div>' +
      '<button type="button" id="as-save" class="btn btn-primary w-100 fw-bold mb-3">Salvează adresa</button>' +
      '<hr><button type="button" id="as-upd" class="btn btn-outline-primary w-100 fw-bold">Caută actualizări</button>' +
      '<div id="as-msg" class="small mt-2" style="min-height:1.2em"></div></div>';
    document.body.appendChild(ov);
    const q = (s) => ov.querySelector(s);
    const close = () => ov.remove();
    q('#as-url').value = window.getServerUrl ? window.getServerUrl() : '';
    q('#as-close').onclick = close;
    ov.onclick = (e) => { if (e.target === ov) close(); };

    q('#as-save').onclick = () => {
      const v = q('#as-url').value.trim();
      if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(v)) { q('#as-err').textContent = 'Adresa trebuie să înceapă cu https://script.google.com și să se termine în /exec'; return; }
      if (v === (window.getServerUrl ? window.getServerUrl() : '')) { close(); return; }
      window.setServerUrl(v);
      location.reload();             // reîncarcă datele de la noul server
    };

    q('#as-upd').onclick = async () => {
      const b = q('#as-upd'), m = q('#as-msg');
      b.disabled = true; b.textContent = 'Se caută...'; m.textContent = '';
      const r = await verificaManual();
      b.disabled = false; b.textContent = 'Caută actualizări';
      m.style.color = r.kind === 'eroare' ? '#B91C1C' : r.kind === 'noua' ? '#B45309' : '#047857';
      m.textContent = r.text;
      if (r.apkUrl) {
        const d = document.createElement('button');
        d.type = 'button'; d.className = 'btn btn-warning w-100 fw-bold mt-2'; d.textContent = 'Descarcă și instalează';
        d.onclick = () => { window.location.href = r.apkUrl; };
        m.after(d);
      }
    };
  };
})();
