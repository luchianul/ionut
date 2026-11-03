/* Pontaj - aplicatie (admin + angajat). Fara dependinte, ruleaza identic in Electron (EXE) si Capacitor (APK). */
(function () {
  'use strict';

  const $app = document.getElementById('app');
  const LS = { api: 'pontaj.api', ses: 'pontaj.session' };
  const S = { api: '', token: '', user: null, cfg: { moneda: 'EUR' }, tab: 'pontaje', employees: [], entries: [], filt: {} };

  /* ---------- utilitare ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const money = (n) => { try { return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: S.cfg.moneda || 'EUR' }).format(n || 0); } catch (e) { return (n || 0).toFixed(2); } };
  const nr = (n, z) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: z == null ? 2 : z }).format(n || 0);
  const fdate = (s) => { const p = String(s).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; };
  const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return { de: ym + '-01', pana: ym + '-' + pad(new Date(y, m, 0).getDate()) }; };
  const calcOre = (i, o) => {
    if (!i || !o) return 0;
    const a = i.split(':').map(Number), b = o.split(':').map(Number);
    let m = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
    if (m < 0) m += 1440;
    return Math.round(m / 60 * 100) / 100;
  };
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };

  let toastT;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- API ---------- */
  async function api(action, data, opts) {
    if (!S.api) throw new Error('Serverul nu este configurat.');
    let res;
    try {
      res = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S.token, data: data || {} }) });
    } catch (e) { throw new Error('Nu ma pot conecta la server. Verifica internetul si adresa serverului.'); }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Raspuns invalid de la server (verifica URL-ul si deploy-ul).'); }
    if (!j.ok) {
      if (j.auth) { logout(true); }
      throw new Error(j.error || 'Eroare necunoscuta');
    }
    return j.data;
  }

  function saveSession() { localStorage.setItem(LS.ses, JSON.stringify({ token: S.token, user: S.user, cfg: S.cfg })); }
  function logout(expired) {
    S.token = ''; S.user = null; localStorage.removeItem(LS.ses);
    renderLogin(expired ? 'Sesiune expirata. Autentifica-te din nou.' : '');
  }

  /* ---------- login ---------- */
  function renderLogin(msg) {
    $app.innerHTML = `
      <div class="login">
        <h1>Pontaj</h1>
        <form class="card" id="f">
          <label>Utilizator</label><input name="u" autocomplete="username" autocapitalize="none" required>
          <label>Parola</label><input name="p" type="password" autocomplete="current-password" required>
          <div class="err" id="e">${esc(msg || '')}</div>
          <div class="actions"><button class="btn grow">Autentificare</button></div>
        </form>
        <p class="empty"><a href="#" id="srv">Setari server</a></p>
      </div>`;
    document.getElementById('srv').onclick = (ev) => { ev.preventDefault(); askServer(); };
    if (!S.api) askServer();
    document.getElementById('f').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target, b = f.querySelector('button'), e = document.getElementById('e');
      b.disabled = true; e.textContent = '';
      try {
        const r = await api('login', { utilizator: f.u.value, parola: f.p.value });
        S.token = r.token; S.user = r.user; S.cfg = r.config || S.cfg; saveSession();
        start();
      } catch (err) { e.textContent = err.message; b.disabled = false; }
    };
  }

  function askServer() {
    const m = modal(`<h2>Setari server</h2><form id="f">
      <label>Adresa Google Apps Script (se termina in /exec)</label>
      <input name="u" type="url" value="${esc(S.api)}" placeholder="https://script.google.com/macros/s/.../exec" required>
      <div class="actions"><button class="btn grow">Salveaza</button><button type="button" class="btn sec" id="x">Renunta</button></div></form>`);
    m.querySelector('#x').onclick = () => m.remove();
    m.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      S.api = ev.target.u.value.trim(); localStorage.setItem(LS.api, S.api);
      m.remove(); toast('Adresa salvata');
    };
  }

  /* ---------- schelet ---------- */
  function shell(inner, extra) {
    $app.innerHTML = `
      <header class="top">
        <h1>Pontaj <small>· ${esc(S.user.nume)}${S.user.rol === 'admin' ? ' (admin)' : ''}</small></h1>
        <button class="btn ghost sm" id="pw">Parola</button>
        <button class="btn ghost sm" id="out">Iesire</button>
      </header>
      <div class="wrap">${inner}</div>${extra || ''}`;
    document.getElementById('out').onclick = () => logout(false);
    document.getElementById('pw').onclick = changePassModal;
  }

  function modal(html) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  function changePassModal() {
    const m = modal(`<h2>Schimba parola</h2><form id="f">
      <label>Parola veche</label><input name="v" type="password" required>
      <label>Parola noua (min. 4 caractere)</label><input name="n" type="password" required minlength="4">
      <div class="err" id="e"></div>
      <div class="actions"><button class="btn grow">Salveaza</button><button type="button" class="btn sec" id="x">Renunta</button></div></form>`);
    m.querySelector('#x').onclick = () => m.remove();
    m.querySelector('#f').onsubmit = async (ev) => {
      ev.preventDefault();
      try { await api('parola_schimba', { veche: ev.target.v.value, noua: ev.target.n.value }); m.remove(); toast('Parola a fost schimbata'); }
      catch (err) { m.querySelector('#e').textContent = err.message; }
    };
  }

  /* ---------- formular pontaj ---------- */
  function entryModal(entry, done) {
    const admin = S.user.rol === 'admin';
    const e = entry || { data: isoDate(new Date()), ora_intrare: '', ora_iesire: '', adresa: '', km: '', parcare: '', angajat_id: admin ? '' : S.user.id, status: 'in asteptare' };
    const emps = S.employees.filter((x) => x.activ || x.id === e.angajat_id);
    const locked = !admin && e.status === 'aprobat';
    const m = modal(`<h2>${entry ? 'Modifica pontaj' : 'Pontaj nou'}</h2>
      <form id="f">
        ${admin ? `<label>Angajat</label><select name="angajat_id" required><option value="">— alege —</option>${emps.map((x) => `<option value="${x.id}" ${x.id === e.angajat_id ? 'selected' : ''}>${esc(x.nume)}</option>`).join('')}</select>` : ''}
        <label>Data</label><input type="date" name="data" value="${esc(e.data)}" required>
        <div class="row">
          <div><label>Ora intrare</label><input type="time" name="ora_intrare" value="${esc(e.ora_intrare)}" required></div>
          <div><label>Ora iesire</label><input type="time" name="ora_iesire" value="${esc(e.ora_iesire)}"></div>
        </div>
        <div class="row"><button type="button" class="btn sec sm" id="in">Intrare acum</button><button type="button" class="btn sec sm" id="outb">Iesire acum</button></div>
        <label>Adresa santier</label><input name="adresa" value="${esc(e.adresa)}" placeholder="Strada, numar, localitate">
        <div class="row">
          <div><label>Km parcursi</label><input name="km" inputmode="decimal" value="${esc(e.km)}" placeholder="0"></div>
          <div><label>Parcare (${esc(S.cfg.moneda)})</label><input name="parcare" inputmode="decimal" value="${esc(e.parcare)}" placeholder="0"></div>
        </div>
        ${admin ? `<div class="row">
          <div><label>Tarif / ora</label><input name="tarif_h" inputmode="decimal" value="${esc(entry ? e.tarif_h : '')}" placeholder="din profil"></div>
          <div><label>Tarif / km</label><input name="tarif_km" inputmode="decimal" value="${esc(entry ? e.tarif_km : '')}" placeholder="din profil"></div></div>
          <label>Status</label><select name="status"><option value="in asteptare" ${e.status !== 'aprobat' ? 'selected' : ''}>In asteptare</option><option value="aprobat" ${e.status === 'aprobat' ? 'selected' : ''}>Aprobat</option></select>` : ''}
        <div class="preview" id="pv"></div>
        <div class="err" id="er">${locked ? 'Pontajul este aprobat si nu mai poate fi modificat.' : ''}</div>
        <div class="actions"><button class="btn grow" ${locked ? 'disabled' : ''}>Salveaza</button><button type="button" class="btn sec" id="x">Renunta</button></div>
      </form>`);
    const f = m.querySelector('#f');
    const preview = () => {
      const ore = calcOre(f.ora_intrare.value, f.ora_iesire.value);
      let th = entry ? e.tarif_h : 0, tk = entry ? e.tarif_km : 0;
      if (admin) {
        const emp = S.employees.find((x) => x.id === f.angajat_id.value) || {};
        th = f.tarif_h.value !== '' ? num(f.tarif_h.value) : (entry ? e.tarif_h : emp.tarif_h || 0);
        tk = f.tarif_km.value !== '' ? num(f.tarif_km.value) : (entry ? e.tarif_km : emp.tarif_km || 0);
      } else if (!entry) { th = S.user.tarif_h; tk = S.user.tarif_km; }
      const tot = ore * th + num(f.km.value) * tk + num(f.parcare.value);
      m.querySelector('#pv').textContent = `${nr(ore)} ore · total ${money(tot)}`;
    };
    f.addEventListener('input', preview); preview();
    m.querySelector('#in').onclick = () => { f.ora_intrare.value = nowTime(); preview(); };
    m.querySelector('#outb').onclick = () => { f.ora_iesire.value = nowTime(); preview(); };
    m.querySelector('#x').onclick = () => m.remove();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = { id: entry && entry.id, data: f.data.value, ora_intrare: f.ora_intrare.value, ora_iesire: f.ora_iesire.value, adresa: f.adresa.value, km: f.km.value, parcare: f.parcare.value };
      if (admin) { d.angajat_id = f.angajat_id.value; d.tarif_h = f.tarif_h.value; d.tarif_km = f.tarif_km.value; d.status = f.status.value; }
      const b = f.querySelector('.btn.grow'); b.disabled = true;
      try { await api('pon_save', d); m.remove(); toast('Salvat'); done(); }
      catch (err) { m.querySelector('#er').textContent = err.message; b.disabled = false; }
    };
  }

  /* ---------- ecran angajat ---------- */
  async function renderEmployee() {
    const ym = S.filt.luna || isoDate(new Date()).slice(0, 7);
    S.filt.luna = ym;
    const r = monthRange(ym);
    shell('<div class="empty">Se incarca…</div>');
    let list;
    try { list = await api('pon_list', r); } catch (err) { return toast(err.message); }
    const tot = list.reduce((a, x) => ({ ore: a.ore + x.ore, km: a.km + x.km, parcare: a.parcare + x.parcare, total: a.total + x.total }), { ore: 0, km: 0, parcare: 0, total: 0 });
    shell(`
      <div class="card"><label style="margin-top:0">Luna</label><input type="month" id="luna" value="${ym}"></div>
      <div class="stats">
        <div class="stat"><b>${nr(tot.ore)}</b><span>ore</span></div>
        <div class="stat"><b>${nr(tot.km, 1)}</b><span>km</span></div>
        <div class="stat"><b>${money(tot.parcare)}</b><span>parcare</span></div>
        <div class="stat"><b>${money(tot.total)}</b><span>total de incasat</span></div>
      </div>
      ${list.length ? list.map((x) => `
        <div class="card entry" data-id="${x.id}">
          <div>
            <h3>${fdate(x.data)} · ${esc(x.ora_intrare)}–${x.ora_iesire ? esc(x.ora_iesire) : '…'}</h3>
            <div class="mut">${esc(x.adresa) || 'fara adresa'}</div>
            <div class="mut">${nr(x.ore)} h · ${nr(x.km, 1)} km · parcare ${money(x.parcare)}</div>
            <span class="tag ${x.status === 'aprobat' ? 'ok' : ''}">${x.status === 'aprobat' ? 'aprobat' : 'in asteptare'}</span>
            ${x.ora_iesire ? '' : '<span class="tag live">in desfasurare</span>'}
          </div>
          <div class="tot">${money(x.total)}</div>
        </div>`).join('') : '<div class="empty">Niciun pontaj in aceasta luna.</div>'}`,
      '<button class="btn fab" id="add">+ Pontaj</button>');
    document.getElementById('luna').onchange = (ev) => { if (ev.target.value) { S.filt.luna = ev.target.value; renderEmployee(); } };
    document.getElementById('add').onclick = () => entryModal(null, renderEmployee);
    document.querySelectorAll('.entry').forEach((el) => {
      el.onclick = () => entryModal(list.find((x) => x.id === el.dataset.id), renderEmployee);
    });
  }

  /* ---------- ecran admin ---------- */
  async function renderAdmin() {
    if (!S.filt.de) { const t = new Date(); Object.assign(S.filt, monthRange(isoDate(t).slice(0, 7)), { angajat_id: '' }); }
    try { S.employees = await api('ang_list'); } catch (err) { return toast(err.message); }
    const tabs = `<div class="tabs">${[['pontaje', 'Pontaje'], ['rezumat', 'Rezumat'], ['angajati', 'Angajati']].map(([k, v]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
    if (S.tab === 'angajati') return renderEmployees(tabs);
    shell(tabs + '<div class="empty">Se incarca…</div>');
    bindTabs();
    try { S.entries = await api('pon_list', { de: S.filt.de, pana: S.filt.pana, angajat_id: S.filt.angajat_id }); } catch (err) { return toast(err.message); }
    const filters = `<div class="card filters">
      <div><label style="margin-top:0">Angajat</label><select id="fa"><option value="">Toti</option>${S.employees.map((x) => `<option value="${x.id}" ${x.id === S.filt.angajat_id ? 'selected' : ''}>${esc(x.nume)}</option>`).join('')}</select></div>
      <div><label style="margin-top:0">De la</label><input type="date" id="fd" value="${S.filt.de}"></div>
      <div><label style="margin-top:0">Pana la</label><input type="date" id="fp" value="${S.filt.pana}"></div>
    </div>`;
    const body = S.tab === 'rezumat' ? summaryHtml() : entriesHtml();
    shell(tabs + filters + body, S.tab === 'pontaje' ? '<button class="btn fab" id="add">+ Pontaj</button>' : '');
    bindTabs();
    document.getElementById('fa').onchange = (ev) => { S.filt.angajat_id = ev.target.value; renderAdmin(); };
    document.getElementById('fd').onchange = (ev) => { S.filt.de = ev.target.value; renderAdmin(); };
    document.getElementById('fp').onchange = (ev) => { S.filt.pana = ev.target.value; renderAdmin(); };
    const add = document.getElementById('add'); if (add) add.onclick = () => entryModal(null, renderAdmin);
    const csv = document.getElementById('csv'); if (csv) csv.onclick = exportCsv;
    document.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => entryModal(S.entries.find((x) => x.id === b.dataset.edit), renderAdmin); });
    document.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Stergi acest pontaj?')) return;
        try { await api('pon_delete', { id: b.dataset.del }); toast('Sters'); renderAdmin(); } catch (err) { toast(err.message); }
      };
    });
    document.querySelectorAll('[data-ok]').forEach((b) => {
      b.onclick = async () => {
        try { await api('pon_status', { id: b.dataset.ok, status: b.dataset.to }); renderAdmin(); } catch (err) { toast(err.message); }
      };
    });
  }

  function bindTabs() {
    document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => { S.tab = b.dataset.t; renderAdmin(); }; });
  }

  const sum = (rows) => rows.reduce((a, x) => ({ ore: a.ore + x.ore, km: a.km + x.km, parcare: a.parcare + x.parcare, total: a.total + x.total }), { ore: 0, km: 0, parcare: 0, total: 0 });

  function entriesHtml() {
    const t = sum(S.entries);
    return `<div class="stats">
        <div class="stat"><b>${S.entries.length}</b><span>pontaje</span></div>
        <div class="stat"><b>${nr(t.ore)}</b><span>ore</span></div>
        <div class="stat"><b>${nr(t.km, 1)}</b><span>km</span></div>
        <div class="stat"><b>${money(t.total)}</b><span>total</span></div>
      </div>
      <div class="card scroll">
        <div class="actions" style="margin:0 0 8px"><button class="btn sec sm" id="csv">Export CSV</button></div>
        ${S.entries.length ? `<table><thead><tr><th>Data</th><th>Angajat</th><th>Interval</th><th>Adresa</th><th class="n">Ore</th><th class="n">Km</th><th class="n">Parcare</th><th class="n">Total</th><th></th></tr></thead><tbody>
        ${S.entries.map((x) => `<tr>
          <td>${fdate(x.data)}</td><td>${esc(x.angajat)}</td><td>${esc(x.ora_intrare)}–${esc(x.ora_iesire) || '…'}</td><td>${esc(x.adresa)}</td>
          <td class="n">${nr(x.ore)}</td><td class="n">${nr(x.km, 1)}</td><td class="n">${money(x.parcare)}</td><td class="n"><b>${money(x.total)}</b></td>
          <td class="n">
            ${x.status === 'aprobat' ? `<button class="btn sm ok" data-ok="${x.id}" data-to="in asteptare" title="Anuleaza aprobarea">✔</button>` : `<button class="btn sm sec" data-ok="${x.id}" data-to="aprobat">Aproba</button>`}
            <button class="btn sm sec" data-edit="${x.id}">Edit</button>
            <button class="btn sm bad" data-del="${x.id}">✕</button>
          </td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">Niciun pontaj in intervalul ales.</div>'}
      </div>`;
  }

  function summaryHtml() {
    const by = {};
    S.entries.forEach((x) => { (by[x.angajat_id] = by[x.angajat_id] || { nume: x.angajat, rows: [] }).rows.push(x); });
    const rows = Object.values(by).map((g) => Object.assign({ nume: g.nume, n: g.rows.length }, sum(g.rows))).sort((a, b) => a.nume.localeCompare(b.nume));
    const t = sum(S.entries);
    return `<div class="card scroll">${rows.length ? `<table><thead><tr><th>Angajat</th><th class="n">Pontaje</th><th class="n">Ore</th><th class="n">Km</th><th class="n">Parcare</th><th class="n">Total</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.nume)}</td><td class="n">${r.n}</td><td class="n">${nr(r.ore)}</td><td class="n">${nr(r.km, 1)}</td><td class="n">${money(r.parcare)}</td><td class="n"><b>${money(r.total)}</b></td></tr>`).join('')}
      <tr><td><b>TOTAL</b></td><td class="n"><b>${S.entries.length}</b></td><td class="n"><b>${nr(t.ore)}</b></td><td class="n"><b>${nr(t.km, 1)}</b></td><td class="n"><b>${money(t.parcare)}</b></td><td class="n"><b>${money(t.total)}</b></td></tr>
      </tbody></table>` : '<div class="empty">Nimic in intervalul ales.</div>'}</div>`;
  }

  function exportCsv() {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['Data', 'Angajat', 'Ora intrare', 'Ora iesire', 'Adresa', 'Ore', 'Km', 'Parcare', 'Tarif/h', 'Tarif/km', 'Total', 'Status'];
    const lines = [head.map(q).join(';')].concat(S.entries.map((x) => [x.data, x.angajat, x.ora_intrare, x.ora_iesire, x.adresa, x.ore, x.km, x.parcare, x.tarif_h, x.tarif_km, x.total, x.status].map(q).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `pontaje_${S.filt.de}_${S.filt.pana}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- angajati (admin) ---------- */
  function renderEmployees(tabs) {
    shell(tabs + (S.employees.length ? S.employees.map((x) => `
      <div class="card entry" data-id="${x.id}">
        <div><h3>${esc(x.nume)} ${x.rol === 'admin' ? '<span class="tag live">admin</span>' : ''} ${x.activ ? '' : '<span class="tag">inactiv</span>'}</h3>
        <div class="mut">utilizator: ${esc(x.utilizator)}</div>
        <div class="mut">${money(x.tarif_h)} / ora · ${money(x.tarif_km)} / km</div></div>
        <button class="btn sec sm">Edit</button>
      </div>`).join('') : '<div class="empty">Niciun angajat.</div>'),
      '<button class="btn fab" id="add">+ Angajat</button>');
    bindTabs();
    document.getElementById('add').onclick = () => employeeModal(null);
    document.querySelectorAll('.entry').forEach((el) => { el.onclick = () => employeeModal(S.employees.find((x) => x.id === el.dataset.id)); });
  }

  function employeeModal(emp) {
    const e = emp || { nume: '', utilizator: '', rol: 'angajat', tarif_h: '', tarif_km: '', activ: true };
    const m = modal(`<h2>${emp ? 'Modifica angajat' : 'Angajat nou'}</h2><form id="f">
      <label>Nume complet</label><input name="nume" value="${esc(e.nume)}" required>
      <label>Utilizator (pentru login)</label><input name="utilizator" value="${esc(e.utilizator)}" autocapitalize="none" required>
      <label>${emp ? 'Parola noua (lasa gol ca sa nu o schimbi)' : 'Parola (min. 4 caractere)'}</label><input name="parola" type="text" ${emp ? '' : 'required minlength="4"'}>
      <div class="row">
        <div><label>Tarif / ora (${esc(S.cfg.moneda)})</label><input name="tarif_h" inputmode="decimal" value="${esc(e.tarif_h)}"></div>
        <div><label>Tarif / km (${esc(S.cfg.moneda)})</label><input name="tarif_km" inputmode="decimal" value="${esc(e.tarif_km)}"></div>
      </div>
      <div class="row">
        <div><label>Rol</label><select name="rol"><option value="angajat" ${e.rol !== 'admin' ? 'selected' : ''}>Angajat</option><option value="admin" ${e.rol === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
        <div><label>Cont</label><select name="activ"><option value="true" ${e.activ ? 'selected' : ''}>Activ</option><option value="false" ${e.activ ? '' : 'selected'}>Inactiv</option></select></div>
      </div>
      <p class="mut">Modificarea tarifelor se aplica doar pontajelor noi; cele existente isi pastreaza tariful.</p>
      <div class="err" id="er"></div>
      <div class="actions"><button class="btn grow">Salveaza</button><button type="button" class="btn sec" id="x">Renunta</button></div></form>`);
    m.querySelector('#x').onclick = () => m.remove();
    m.querySelector('#f').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await api('ang_save', { id: emp && emp.id, nume: f.nume.value, utilizator: f.utilizator.value, parola: f.parola.value, tarif_h: f.tarif_h.value, tarif_km: f.tarif_km.value, rol: f.rol.value, activ: f.activ.value === 'true' });
        m.remove(); toast('Salvat'); renderAdmin();
      } catch (err) { m.querySelector('#er').textContent = err.message; }
    };
  }

  /* ---------- pornire ---------- */
  function start() {
    if (!S.user) return renderLogin();
    S.filt = {}; S.tab = 'pontaje';
    if (S.user.rol === 'admin') renderAdmin(); else renderEmployee();
  }

  S.api = localStorage.getItem(LS.api) || (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  try {
    const ses = JSON.parse(localStorage.getItem(LS.ses) || 'null');
    if (ses && ses.token) { S.token = ses.token; S.user = ses.user; S.cfg = ses.cfg || S.cfg; }
  } catch (e) { /* ignore */ }
  window.__pontaj = { S };
  start();
})();
