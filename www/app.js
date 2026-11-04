/* Pontaj - aplicatie (admin + angajat). Fara dependinte, ruleaza identic in Electron (EXE) si Capacitor (APK). */
(function () {
  'use strict';

  const $app = document.getElementById('app');
  const LS = { api: 'pontaj.api', ses: 'pontaj.session' };
  const S = { api: '', token: '', user: null, cfg: { moneda: 'EUR' }, tab: 'acasa', sel: '', employees: [], entries: [], filt: {}, loading: false, seq: 0 };

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
    Object.keys(localStorage).filter((k) => k.indexOf('pontaj.c.') === 0).forEach((k) => localStorage.removeItem(k));
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
        <p class="empty"><a href="#" id="srv">Setari server</a><br><small>Versiunea ${esc(window.APP_VERSION || 'dev')}</small></p>
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

  /* ---------- date + cache (afisare instant, apoi actualizare in fundal) ---------- */
  const cget = (k) => { try { return JSON.parse(localStorage.getItem('pontaj.c.' + k)); } catch (e) { return null; } };
  const cset = (k, v) => { try { localStorage.setItem('pontaj.c.' + k, JSON.stringify(v)); } catch (e) { /* plin */ } };
  const ukey = (k) => S.user.id + '.' + k;
  const byDate = (a, b) => (b.data + b.ora_intrare).localeCompare(a.data + a.ora_intrare);

  function range() {
    return S.user.rol === 'admin' ? { de: S.filt.de, pana: S.filt.pana } : monthRange(S.filt.luna);
  }
  const rkey = () => { const r = range(); return ukey(r.de + '.' + r.pana); };
  const setLd = () => { const el = document.getElementById('ld'); if (el) el.style.display = S.loading ? '' : 'none'; };

  // arata imediat ce stim (cache), apoi aduce datele proaspete (lista angajatilor si pontajele in paralel)
  async function refresh() {
    const admin = S.user.rol === 'admin';
    const r = range(), k = rkey(), seq = ++S.seq;
    S.entries = cget(k) || [];
    if (admin && !S.employees.length) S.employees = cget(ukey('emps')) || [];
    paint();
    S.loading = true; setLd();
    try {
      const [emps, list] = await Promise.all([admin ? api('ang_list') : null, api('pon_list', r)]);
      if (seq !== S.seq) return;
      if (emps) { S.employees = emps; cset(ukey('emps'), emps); }
      S.entries = list; cset(k, list);
    } catch (err) { if (seq === S.seq) toast(err.message); }
    if (seq === S.seq) { S.loading = false; paint(); }
  }

  function inRange(x) { const r = range(); return x.data >= r.de && x.data <= r.pana; }
  function onSaved(x) {
    S.entries = S.entries.filter((y) => y.id !== x.id);
    if (inRange(x)) S.entries.push(x);
    S.entries.sort(byDate); cset(rkey(), S.entries); paint();
  }
  function onDeleted(id) { S.entries = S.entries.filter((y) => y.id !== id); cset(rkey(), S.entries); paint(); }
  const paint = () => (S.user.rol === 'admin' ? paintAdmin() : paintEmployee());

  /* ---------- formular pontaj ---------- */
  function entryModal(entry) {
    const admin = S.user.rol === 'admin';
    const e = entry || { data: isoDate(new Date()), ora_intrare: '', ora_iesire: '', adresa: '', km: '', parcare: '', angajat_id: admin ? S.sel || '' : S.user.id };
    const emps = S.employees.filter((x) => x.activ || x.id === e.angajat_id);
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
          <div><label>Tarif / km</label><input name="tarif_km" inputmode="decimal" value="${esc(entry ? e.tarif_km : '')}" placeholder="din profil"></div></div>` : ''}
        <div class="preview" id="pv"></div>
        <div class="err" id="er"></div>
        <div class="actions"><button class="btn grow">Salveaza</button><button type="button" class="btn sec" id="x">Renunta</button>${entry ? '<button type="button" class="btn bad" id="del">Sterge</button>' : ''}</div>
      </form>`);
    const f = m.querySelector('#f');
    const preview = () => {
      const ore = calcOre(f.ora_intrare.value, f.ora_iesire.value);
      let th = entry ? e.tarif_h : S.user.tarif_h, tk = entry ? e.tarif_km : S.user.tarif_km;
      if (admin) {
        const emp = S.employees.find((x) => x.id === f.angajat_id.value) || {};
        th = f.tarif_h.value !== '' ? num(f.tarif_h.value) : (entry ? e.tarif_h : emp.tarif_h || 0);
        tk = f.tarif_km.value !== '' ? num(f.tarif_km.value) : (entry ? e.tarif_km : emp.tarif_km || 0);
      }
      m.querySelector('#pv').textContent = `${nr(ore)} ore · total ${money(ore * th + num(f.km.value) * tk + num(f.parcare.value))}`;
    };
    f.addEventListener('input', preview); preview();
    m.querySelector('#in').onclick = () => { f.ora_intrare.value = nowTime(); preview(); };
    m.querySelector('#outb').onclick = () => { f.ora_iesire.value = nowTime(); preview(); };
    m.querySelector('#x').onclick = () => m.remove();
    const del = m.querySelector('#del');
    if (del) del.onclick = async () => {
      if (!confirm('Stergi acest pontaj?')) return;
      del.disabled = true;
      try { await api('pon_delete', { id: entry.id }); m.remove(); onDeleted(entry.id); toast('Sters'); }
      catch (err) { m.querySelector('#er').textContent = err.message; del.disabled = false; }
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = { id: entry && entry.id, data: f.data.value, ora_intrare: f.ora_intrare.value, ora_iesire: f.ora_iesire.value, adresa: f.adresa.value, km: f.km.value, parcare: f.parcare.value };
      if (admin) { d.angajat_id = f.angajat_id.value; d.tarif_h = f.tarif_h.value; d.tarif_km = f.tarif_km.value; }
      const b = f.querySelector('.btn.grow'); b.disabled = true; b.textContent = 'Se salveaza…';
      try { const saved = await api('pon_save', d); m.remove(); onSaved(saved); toast('Salvat'); }
      catch (err) { m.querySelector('#er').textContent = err.message; b.disabled = false; b.textContent = 'Salveaza'; }
    };
  }

  const sum = (rows) => rows.reduce((a, x) => ({ ore: a.ore + x.ore, km: a.km + x.km, parcare: a.parcare + x.parcare, total: a.total + x.total }), { ore: 0, km: 0, parcare: 0, total: 0 });
  const ldHtml = '<span class="mut" id="ld" style="display:none">↻ se actualizeaza…</span>';

  /* ---------- ecran angajat ---------- */
  function paintEmployee() {
    const list = S.entries, tot = sum(list);
    shell(`
      <div class="card"><label style="margin-top:0">Luna ${ldHtml}</label><input type="month" id="luna" value="${S.filt.luna}"></div>
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
            ${x.ora_iesire ? '' : '<span class="tag live">in desfasurare</span>'}
          </div>
          <div class="tot">${money(x.total)}</div>
        </div>`).join('') : `<div class="empty">${S.loading ? 'Se incarca…' : 'Niciun pontaj in aceasta luna.'}</div>`}`,
      '<button class="btn fab" id="add">+ Pontaj</button>');
    setLd();
    document.getElementById('luna').onchange = (ev) => { if (ev.target.value) { S.filt.luna = ev.target.value; refresh(); } };
    document.getElementById('add').onclick = () => entryModal(null);
    document.querySelectorAll('.entry').forEach((el) => { el.onclick = () => entryModal(list.find((x) => x.id === el.dataset.id)); });
  }

  /* ---------- ecran admin: acasa = lista angajatilor, apoi pontajele unui angajat ---------- */
  const WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa'];
  const fday = (s) => WD[new Date(s + 'T00:00:00').getDay()] + ' ' + fdate(s);
  const visible = () => S.entries.filter((x) => !S.sel || x.angajat_id === S.sel);

  function periodHtml() {
    return `<div class="card filters">
      <div><label style="margin-top:0">De la</label><input type="date" id="fd" value="${S.filt.de}"></div>
      <div><label style="margin-top:0">Pana la</label><input type="date" id="fp" value="${S.filt.pana}"></div>
      <div class="presets"><button class="btn sec sm" data-p="azi">Azi</button><button class="btn sec sm" data-p="luna">Luna asta</button><button class="btn sec sm" data-p="trecuta">Luna trecuta</button></div>
    </div>`;
  }

  function paintAdmin() {
    const tabs = `<div class="tabs">${[['acasa', 'Angajati'], ['conturi', 'Conturi si tarife']].map(([k, v]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${v}</button>`).join('')}${ldHtml}</div>`;
    if (S.tab === 'conturi') { renderEmployees(tabs); setLd(); return; }
    const emp = S.sel ? S.employees.find((x) => x.id === S.sel) || { nume: (S.entries.find((x) => x.angajat_id === S.sel) || {}).angajat || '?' } : null;
    shell(tabs + periodHtml() + (emp ? detailHtml(emp) : homeHtml()), '<button class="btn fab" id="add">+ Pontaj</button>');
    setLd(); bindTabs();
    document.getElementById('fd').onchange = (ev) => { if (ev.target.value) { S.filt.de = ev.target.value; refresh(); } };
    document.getElementById('fp').onchange = (ev) => { if (ev.target.value) { S.filt.pana = ev.target.value; refresh(); } };
    document.querySelectorAll('[data-p]').forEach((b) => {
      b.onclick = () => {
        const t = new Date(), ym = isoDate(t).slice(0, 7);
        if (b.dataset.p === 'azi') { S.filt.de = S.filt.pana = isoDate(t); }
        else if (b.dataset.p === 'luna') Object.assign(S.filt, monthRange(ym));
        else { const p = new Date(t.getFullYear(), t.getMonth() - 1, 1); Object.assign(S.filt, monthRange(isoDate(p).slice(0, 7))); }
        refresh();
      };
    });
    document.getElementById('add').onclick = () => entryModal(null);
    const csv = document.getElementById('csv'); if (csv) csv.onclick = exportCsv;
    const back = document.getElementById('back'); if (back) back.onclick = () => { S.sel = ''; paint(); };
    document.querySelectorAll('[data-sel]').forEach((el) => { el.onclick = () => { S.sel = el.dataset.sel; paint(); window.scrollTo(0, 0); }; });
    document.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => entryModal(S.entries.find((x) => x.id === b.dataset.edit)); });
    document.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Stergi acest pontaj?')) return;
        b.disabled = true;
        try { await api('pon_delete', { id: b.dataset.del }); onDeleted(b.dataset.del); toast('Sters'); } catch (err) { toast(err.message); b.disabled = false; }
      };
    });
  }

  function bindTabs() {
    document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => { S.tab = b.dataset.t; S.sel = ''; paint(); }; });  // instant, din memorie
  }

  // pagina principala: cate un card pentru fiecare angajat
  function homeHtml() {
    const by = {};
    S.entries.forEach((x) => { (by[x.angajat_id] = by[x.angajat_id] || []).push(x); });
    const ids = S.employees.filter((e) => (e.activ && e.rol !== 'admin') || by[e.id]).map((e) => e.id);
    Object.keys(by).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
    const today = isoDate(new Date());
    const cards = ids.map((id) => {
      const rows = by[id] || [], t = sum(rows), e = S.employees.find((x) => x.id === id) || { nume: rows[0] ? rows[0].angajat : '?' };
      return { id, nume: e.nume, rows, t, live: rows.some((x) => !x.ora_iesire && x.data === today), last: rows[0] };
    }).sort((a, b) => a.nume.localeCompare(b.nume));
    const T = sum(S.entries);
    return `<div class="stats">
        <div class="stat"><b>${cards.filter((c) => c.rows.length).length}</b><span>angajati cu pontaje</span></div>
        <div class="stat"><b>${nr(T.ore)}</b><span>ore</span></div>
        <div class="stat"><b>${nr(T.km, 1)}</b><span>km</span></div>
        <div class="stat"><b>${money(T.total)}</b><span>total de plata</span></div>
      </div>
      <div class="actions" style="margin:6px 0"><button class="btn sec sm" id="csv">Export CSV (toti)</button></div>
      ${cards.length ? `<div class="grid">${cards.map((c) => `
        <div class="card emp" data-sel="${c.id}">
          <div class="emp-h"><h3>${esc(c.nume)}</h3>${c.live ? '<span class="tag ok">pe santier acum</span>' : ''}</div>
          <div class="emp-s"><div><b>${nr(c.t.ore)}</b><span>ore</span></div><div><b>${nr(c.t.km, 1)}</b><span>km</span></div><div><b>${money(c.t.total)}</b><span>total</span></div></div>
          <div class="mut">${c.rows.length ? `${c.rows.length} pontaje · ultimul: ${fdate(c.last.data)}, ${esc(c.last.ora_intrare)}–${esc(c.last.ora_iesire) || '…'}` : 'niciun pontaj in perioada aleasa'}</div>
        </div>`).join('')}</div>` : `<div class="empty">${S.loading ? 'Se incarca…' : 'Nu exista angajati. Adauga-i la „Conturi si tarife”.'}</div>`}`;
  }

  // pontajele unui singur angajat, cu ora de intrare si ora de iesire in coloane separate
  function detailHtml(emp) {
    const rows = visible(), t = sum(rows);
    return `<div class="emp-top"><button class="btn sec sm" id="back">← Toti angajatii</button><h2>${esc(emp.nume)}</h2></div>
      <div class="stats">
        <div class="stat"><b>${rows.length}</b><span>pontaje</span></div>
        <div class="stat"><b>${nr(t.ore)}</b><span>ore</span></div>
        <div class="stat"><b>${nr(t.km, 1)}</b><span>km</span></div>
        <div class="stat"><b>${money(t.total)}</b><span>total de plata</span></div>
      </div>
      <div class="card scroll">
        <div class="actions" style="margin:0 0 8px"><button class="btn sec sm" id="csv">Export CSV</button></div>
        ${rows.length ? `<table><thead><tr><th>Data</th><th>Ora intrare</th><th>Ora iesire</th><th>Adresa santier</th><th class="n">Ore</th><th class="n">Km</th><th class="n">Parcare</th><th class="n">Total</th><th></th></tr></thead><tbody>
        ${rows.map((x) => `<tr>
          <td>${fday(x.data)}</td>
          <td class="hr">${esc(x.ora_intrare)}</td>
          <td class="hr">${x.ora_iesire ? esc(x.ora_iesire) : '<span class="tag live">in desfasurare</span>'}</td>
          <td>${esc(x.adresa)}</td>
          <td class="n">${nr(x.ore)}</td><td class="n">${nr(x.km, 1)}</td><td class="n">${money(x.parcare)}</td><td class="n"><b>${money(x.total)}</b></td>
          <td class="n"><button class="btn sm sec" data-edit="${x.id}">Edit</button> <button class="btn sm bad" data-del="${x.id}">✕</button></td></tr>`).join('')}
        </tbody></table>` : `<div class="empty">${S.loading ? 'Se incarca…' : 'Niciun pontaj in perioada aleasa.'}</div>`}
      </div>`;
  }

  function exportCsv() {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['Data', 'Angajat', 'Ora intrare', 'Ora iesire', 'Adresa', 'Ore', 'Km', 'Parcare', 'Tarif/h', 'Tarif/km', 'Total'];
    const lines = [head.map(q).join(';')].concat(visible().map((x) => [x.data, x.angajat, x.ora_intrare, x.ora_iesire, x.adresa, x.ore, x.km, x.parcare, x.tarif_h, x.tarif_km, x.total].map(q).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `pontaje${S.sel ? '_' + (visible()[0] ? visible()[0].angajat.replace(/\s+/g, '-') : 'angajat') : ''}_${S.filt.de}_${S.filt.pana}.csv`;
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
        const saved = await api('ang_save', { id: emp && emp.id, nume: f.nume.value, utilizator: f.utilizator.value, parola: f.parola.value, tarif_h: f.tarif_h.value, tarif_km: f.tarif_km.value, rol: f.rol.value, activ: f.activ.value === 'true' });
        const i = S.employees.findIndex((x) => x.id === saved.id);
        if (i >= 0) S.employees[i] = saved; else S.employees.push(saved);
        S.employees.sort((x, y) => x.nume.localeCompare(y.nume)); cset(ukey('emps'), S.employees);
        m.remove(); toast('Salvat'); paint();
      } catch (err) { m.querySelector('#er').textContent = err.message; }
    };
  }

  /* ---------- actualizari ---------- */
  const ver = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

  // Android: nu exista update silentios in afara Google Play, deci anuntam versiunea noua si dam descarcarea APK-ului.
  // Windows: actualizarea o face Electron (electron-updater), vezi electron/main.js.
  async function checkUpdate() {
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    const cur = window.APP_VERSION, repo = (window.APP_CONFIG || {}).REPO;
    if (!native || !cur || cur === 'dev' || !repo) return;
    try {
      const r = await (await fetch('https://api.github.com/repos/' + repo + '/releases/latest')).json();
      const apk = (r.assets || []).find((a) => /\.apk$/i.test(a.name));
      if (!apk || !newer(r.tag_name, cur)) return;
      const bar = document.createElement('div');
      bar.className = 'upd';
      bar.innerHTML = `<span>Versiune noua disponibila (${esc(r.tag_name)})</span><button class="btn sm">Actualizeaza</button>`;
      bar.querySelector('button').onclick = () => { window.location.href = apk.browser_download_url; };
      document.body.prepend(bar);
    } catch (e) { /* offline: ignoram */ }
  }

  /* ---------- pornire ---------- */
  function start() {
    if (!S.user) return renderLogin();
    S.filt = S.user.rol === 'admin' ? monthRange(isoDate(new Date()).slice(0, 7)) : { luna: isoDate(new Date()).slice(0, 7) };
    S.tab = 'acasa'; S.sel = ''; S.employees = []; S.entries = [];
    refresh();
  }

  S.api = localStorage.getItem(LS.api) || (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  try {
    const ses = JSON.parse(localStorage.getItem(LS.ses) || 'null');
    if (ses && ses.token) { S.token = ses.token; S.user = ses.user; S.cfg = ses.cfg || S.cfg; }
  } catch (e) { /* ignore */ }
  window.__pontaj = { S };
  start();
  checkUpdate();
})();
