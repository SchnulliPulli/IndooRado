// Admin-Panel für VeloVerse Online: Kennzahlen, Nutzer (Rolle, Sperre, Daten löschen), Ankündigungen.
// Die Datenbank prüft selbst: nur Rolle "admin" mit bestätigter 2FA (aal2) darf hier lesen und schreiben.
import { $, esc, toast, dialog, fmtDate } from '../util.js';
import * as O from '../online/client.js';

export async function render(el) {
  const tok = window.__routeTok, gone = () => tok !== window.__routeTok;
  await O.loadSiteConfig();
  if (!O.configured()) { location.hash = '#/account'; return; }
  if (!O.online.ready) await O.initOnline().catch(() => { }); if (gone()) return;
  if (!O.loggedIn() || !O.isAdmin()) { el.innerHTML = '<section class="card"><h2>Kein Zugriff</h2><p class="muted">Nur für Administratoren.</p><a class="btn" href="#/account">Zum Konto</a></section>'; return; }
  if (O.online.aal?.currentLevel !== 'aal2') { el.innerHTML = '<section class="card"><h2>2FA erforderlich</h2><p class="muted">Admin-Funktionen sind nur mit bestätigter Zwei-Faktor-Anmeldung nutzbar.</p><a class="btn pri" href="#/account">2FA einrichten oder bestätigen</a></section>'; return; }
  const sb = await O.client();
  el.innerHTML = `
  <section class="pagehead"><h1>Admin</h1><span class="row"><button class="btn sm ghost" id="adRefresh">↻ Aktualisieren</button></span></section>
  <section class="kpis" id="adKpi"><div class="pageload"><div class="spinner"></div></div></section>
  <section class="card"><div class="row between"><h2>Nutzer</h2><span class="row"><label class="switch sm"><input type="checkbox" id="adPend"><span></span> nur wartende</label><input class="inp sm" id="adQ" placeholder="Suchen …" style="max-width:240px"></span></div><div class="scroll"><table class="tbl" id="adUsers"></table></div></section>
  <section class="grid2">
    <div class="card form"><h2>Neue Ankündigung</h2>
      <label class="f">Titel<input class="inp" id="anT" maxlength="80"></label>
      <label class="f">Text<textarea class="inp" id="anB" rows="3" maxlength="600"></textarea></label>
      <div class="grid2 tight"><label class="f">Art<select class="inp" id="anL"><option value="info">Info</option><option value="event">Event</option><option value="warn">Wartung / Warnung</option></select></label><label class="f">Sichtbar bis<input class="inp" id="anU" type="date"></label></div>
      <div class="row"><button class="btn pri" id="anGo">Veröffentlichen</button></div></div>
    <div class="card"><h2>Ankündigungen</h2><div id="anList" class="small"></div></div>
  </section>`;
  let users = [];
  const kpis = async () => {
    const { data, error } = await sb.rpc('admin_stats'); if (error) return toast(error.message, 5000);
    $('#adKpi', el).innerHTML = [['Nutzer', data.users], ['warten auf Freischaltung', data.pending ?? '–'], ['aktiv (7 Tage)', data.active7], ['Fahrten', data.rides], ['Fahrten (7 Tage)', data.rides7], ['Kilometer', Math.round(data.km).toLocaleString('de-DE')], ['gesperrt', data.banned]].map(([l, v]) => `<div class="card kpi"><b class="num">${v}</b><span class="small muted">${l}</span></div>`).join('');
  };
  // Status je Nutzer: Admin, freigeschaltet, Testphase (Resttage) oder abgelaufen
  const stat = u => u.role === 'banned' ? ['Gesperrt', 'bad'] : u.role === 'admin' ? ['Admin', 'ok'] : u.approved || u.approved === undefined ? ['Freigeschaltet', 'ok'] : new Date(u.trial_until) > new Date() ? [`Test, noch ${Math.ceil((new Date(u.trial_until) - Date.now()) / 864e5)} T.`, 'trial'] : ['Test abgelaufen', 'bad'];
  const list = () => {
    const q = $('#adQ', el).value.trim().toLowerCase(), onlyP = $('#adPend', el)?.checked;
    const rows = users.filter(u => (!q || u.display_name.toLowerCase().includes(q) || u.id.startsWith(q)) && (!onlyP || (!u.approved && u.role === 'user')))
      .sort((a, b) => (a.approved || a.role !== 'user') - (b.approved || b.role !== 'user') || b.created_at.localeCompare(a.created_at));
    $('#adUsers', el).innerHTML = `<tr><th>Name</th><th>Status</th><th>Rolle</th><th class="n">Level</th><th>Zuletzt</th><th>Seit</th><th class="n">Aktionen</th></tr>` + rows.map(u => { const [st, c] = stat(u), me = u.id === O.online.user.id; return `<tr data-id="${u.id}">
      <td>${esc(u.display_name)}${u.public_profile ? '' : ' <span class="muted small">(privat)</span>'}</td>
      <td><span class="stbadge ${c}">${st}</span></td>
      <td><select class="inp sm" data-role ${me ? 'disabled' : ''}>${['user', 'admin', 'banned'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${{ user: 'Nutzer', admin: 'Admin', banned: 'Gesperrt' }[r]}</option>`).join('')}</select></td>
      <td class="n">${u.level}</td><td>${u.last_seen ? fmtDate(u.last_seen) : '–'}</td><td>${fmtDate(u.created_at)}</td>
      <td class="actcell"><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">${u.role === 'user' ? (u.approved ? `<button class="btn xs ghost" data-appr="0" ${me ? 'disabled' : ''}>Freischaltung entziehen</button>` : `<button class="btn xs pri" data-appr="1">Freischalten</button><button class="btn xs ghost" data-trial>+7 Tage Test</button>`) : ''}<button class="btn xs ghost danger" data-wipe ${me ? 'disabled' : ''}>Daten löschen</button><button class="btn xs danger" data-delacc ${me ? 'disabled title="Eigenes Konto unter Konto löschen"' : ''}>Konto löschen</button></div></td></tr>`; }).join('');
  };
  const loadUsers = async () => { const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(500); if (error) return toast(error.message, 5000); users = data; list(); };
  const anns = async () => {
    const { data } = await sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(30);
    $('#anList', el).innerHTML = (data || []).map(a => `<div class="row between anrow"><span><b>${esc(a.title)}</b> <span class="muted">${{ info: 'Info', event: 'Event', warn: 'Warnung' }[a.level]} · ${fmtDate(a.created_at)}${a.visible_until ? ' bis ' + fmtDate(a.visible_until) : ''}</span></span><button class="btn xs ghost danger" data-and="${a.id}">✕</button></div>`).join('') || '<span class="muted">Keine</span>';
  };
  // Alle Dateien eines Nutzers im Datenpaket (Ordner <id>/…) entfernen; braucht die Admin-Regeln aus schema.sql
  const wipeFiles = async uid => {
    const st = sb.storage.from('vault'), files = [];
    const walk = async dir => { const { data, error } = await st.list(dir, { limit: 1000 }); if (error) throw error; for (const f of data || []) { const p = dir + '/' + f.name; if (f.id) files.push(p); else await walk(p); } };
    await walk(uid);
    for (let i = 0; i < files.length; i += 100) { const { error } = await st.remove(files.slice(i, i + 100)); if (error) throw error; }
  };
  $('#adQ', el).oninput = list; $('#adPend', el).onchange = list;
  $('#adUsers', el).onchange = async e => {
    const s = e.target.closest('[data-role]'); if (!s) return; const id = s.closest('tr').dataset.id;
    const { error } = await sb.from('profiles').update({ role: s.value }).eq('id', id); if (error) return toast(error.message, 5000);
    toast('Rolle geändert'); users.find(u => u.id === id).role = s.value; kpis();
  };
  $('#adUsers', el).onclick = async e => {
    const ap = e.target.closest('[data-appr],[data-trial]');
    if (ap) {
      const id = ap.closest('tr').dataset.id, u = users.find(x => x.id === id);
      const patch = ap.dataset.trial != null ? { trial_until: new Date(Math.max(Date.now(), +new Date(u.trial_until || 0)) + 7 * 864e5).toISOString() } : { approved: ap.dataset.appr === '1' };
      const { error } = await sb.from('profiles').update(patch).eq('id', id); if (error) return toast(error.message, 5000);
      Object.assign(u, patch); list(); kpis(); toast(patch.approved ? esc(u.display_name) + ' freigeschaltet ✅' : patch.trial_until ? 'Testphase verlängert' : 'Freischaltung entzogen'); return;
    }
    const del = e.target.closest('[data-delacc]');
    if (del) {
      const id = del.closest('tr').dataset.id, u = users.find(x => x.id === id);
      // Bestätigung: Name eintippen (der Dialog ist beim Auflösen schon entfernt, darum Eingabe mitlesen)
      let typed = ''; const onIn = e => { if (e.target.id === 'delName') typed = e.target.value.trim(); };
      document.addEventListener('input', onIn);
      const ok = await dialog({ title: 'Konto von ' + u.display_name + ' endgültig löschen?', html: `<p class="muted">Gelöscht werden Login, Profil, alle hochgeladenen Fahrten und das Online-Datenpaket. Das lässt sich nicht rückgängig machen.${u.role === 'admin' ? ' <b>Achtung: Das ist ein Admin-Konto.</b>' : ''}</p><label class="f">Zur Bestätigung den Namen „${esc(u.display_name)}“ eingeben<input class="inp" id="delName" autocomplete="off"></label>`, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Konto löschen', value: true, cls: 'danger' }] });
      document.removeEventListener('input', onIn);
      if (!ok) return;
      if (typed !== u.display_name.trim()) return toast('Name stimmt nicht überein, nichts gelöscht', 4000);
      del.disabled = true; del.textContent = 'Wird gelöscht …';
      try {
        await wipeFiles(id);
        const { error } = await sb.rpc('admin_delete_user', { p_user: id });
        if (error) throw error;
        users = users.filter(x => x.id !== id); list(); kpis(); toast(esc(u.display_name) + ' gelöscht');
      } catch (err) {
        del.disabled = false; del.textContent = 'Konto löschen';
        toast(/admin_delete_user|function/i.test(err.message) ? 'Die Funktion fehlt in der Datenbank: supabase/schema.sql im SQL-Editor erneut ausführen.' : err.message, 7000);
      }
      return;
    }
    const b = e.target.closest('[data-wipe]'); if (!b) return; const id = b.closest('tr').dataset.id, u = users.find(x => x.id === id);
    if (!(await dialog({ title: 'Daten von ' + esc(u.display_name) + ' löschen?', html: '<p class="muted">Fahrten und das Online-Datenpaket werden gelöscht. Das Konto selbst bleibt bestehen (Löschen des Kontos im Supabase-Dashboard).</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] }))) return;
    const { error } = await sb.rpc('admin_wipe_user', { p_user: id }); if (error) return toast(error.message, 5000); toast('Gelöscht'); kpis();
  };
  $('#anGo', el).onclick = async () => {
    const t = $('#anT', el).value.trim(); if (!t) return toast('Titel fehlt');
    const until = $('#anU', el).value; const { error } = await sb.from('announcements').insert({ title: t, body: $('#anB', el).value.trim(), level: $('#anL', el).value, visible_until: until ? new Date(until + 'T23:59:59').toISOString() : null });
    if (error) return toast(error.message, 5000); toast('Veröffentlicht'); $('#anT', el).value = ''; $('#anB', el).value = ''; anns();
  };
  $('#anList', el).onclick = async e => { const b = e.target.closest('[data-and]'); if (!b) return; await sb.from('announcements').delete().eq('id', b.dataset.and); anns(); };
  $('#adRefresh', el).onclick = () => { kpis(); loadUsers(); anns(); };
  kpis(); loadUsers(); anns();
}
