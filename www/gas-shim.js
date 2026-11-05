/*
 * Inlocuieste google.script.run (care exista doar in interiorul Google Apps Script) cu apeluri HTTPS catre
 * aplicatia ta web Apps Script (Api.gs). Restul interfetei ramane exact cum era:
 *   google.script.run.withSuccessHandler(ok).withFailureHandler(err).numeFunctie(arg1, arg2, ...)
 */
(function () {
  'use strict';
  const KEY = 'pontajionut.api';
  const cfg = () => window.APP_CONFIG || {};
  const getUrl = () => { try { return localStorage.getItem(KEY) || cfg().API_URL || ''; } catch (e) { return cfg().API_URL || ''; } };

  // dialog propriu (nu SweetAlert), ca sa nu intre in conflict cu fereastra "Se incarca datele..." din aplicatie
  let asking = null;
  function askUrl() {
    if (asking) return asking;
    asking = new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.id = 'srv-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,sans-serif';
      ov.innerHTML = '<form style="background:#fff;border-radius:18px;padding:24px;max-width:440px;width:100%">' +
        '<h4 class="fw-bold mb-2">Adresa serverului</h4>' +
        '<p class="text-muted small">Lipește adresa aplicației web Google Apps Script (se termină în <b>/exec</b>). Se cere o singură dată.</p>' +
        '<input id="srv-url" type="url" class="form-control" placeholder="https://script.google.com/macros/s/.../exec" required>' +
        '<div id="srv-err" class="text-danger small mt-2" style="min-height:1.2em"></div>' +
        '<button class="btn btn-primary w-100 fw-bold mt-2 p-2">Salvează</button></form>';
      document.body.appendChild(ov);
      const inp = ov.querySelector('#srv-url'); inp.value = getUrl(); inp.focus();
      ov.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        const v = inp.value.trim();
        if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(v)) { ov.querySelector('#srv-err').textContent = 'Adresa trebuie să înceapă cu https://script.google.com și să se termine în /exec'; return; }
        localStorage.setItem(KEY, v); ov.remove(); asking = null; resolve(v);
      };
    });
    return asking;
  }
  window.schimbaServer = askUrl; // se poate apela din consola: schimbaServer()

  async function call(fn, args) {
    let url = getUrl();
    if (!url) url = await askUrl();
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args }) });
    } catch (e) { throw new Error('Nu mă pot conecta la server. Verifică internetul.'); }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Răspuns invalid de la server. Verifică adresa și că ai publicat o versiune nouă (Api.gs).'); }
    if (!j.ok) throw new Error(j.error || 'Eroare necunoscută');
    return j.data;
  }

  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, name) {
        if (typeof name !== 'string') return undefined;
        if (name === 'withSuccessHandler') return (f) => runner(f, fail);
        if (name === 'withFailureHandler') return (f) => runner(ok, f);
        if (name === 'withUserObject') return () => runner(ok, fail);
        return function () {
          call(name, Array.prototype.slice.call(arguments)).then(
            (d) => { if (ok) ok(d); },
            (e) => { if (fail) fail(e); else console.error(e); }
          );
        };
      },
    });
  }

  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
})();
