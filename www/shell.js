/* Versiune + anunt de actualizare (Android). Pe Windows actualizarea o face Electron (electron/main.js). */
(function () {
  'use strict';
  const ver = window.APP_VERSION;
  window.addEventListener('DOMContentLoaded', () => {
    const f = document.querySelector('.side-foot');
    if (f) f.textContent = 'Interfață desktop · ' + (ver && ver !== 'dev' ? 'v' + ver : 'dev');
  });

  const num = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

  async function checkUpdate() {
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    const repo = (window.APP_CONFIG || {}).REPO;
    if (!native || !ver || ver === 'dev' || !repo) return;
    try {
      const r = await (await fetch('https://api.github.com/repos/' + repo + '/releases/latest')).json();
      const apk = (r.assets || []).find((a) => /\.apk$/i.test(a.name));
      if (!apk || !newer(r.tag_name, ver)) return;
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:3000;background:#FEF3C7;color:#78350F;padding:10px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;font:600 14px Inter,sans-serif';
      bar.innerHTML = '<span>Versiune nouă disponibilă (' + String(r.tag_name).replace(/[<>&]/g, '') + ')</span><button class="btn btn-sm btn-warning fw-bold">Actualizează</button>';
      bar.querySelector('button').onclick = () => { window.location.href = apk.browser_download_url; };
      document.body.appendChild(bar);
    } catch (e) { /* fara internet: ignoram */ }
  }
  window.addEventListener('load', checkUpdate);
})();
