// Online: Lobby für Gruppenfahrten und "Wer ist online" mit Live-Zahlen
import { $, esc, toast, bus } from '../util.js';
import { sel, saveSel } from '../state.js';
import { avatarSvg } from '../components.js';
import { listRoutes } from '../routes.js';
import * as O from '../online/client.js';
import * as PR from '../online/presence.js';

let off = [], tick = null;
export function leave() { off.forEach(f => f()); off = []; clearInterval(tick); }

async function gate(el) {
  await O.loadSiteConfig();
  if (!O.configured()) { el.innerHTML = '<section class="pagehead"><h1>Online</h1></section><section class="card"><p class="muted">VeloVerse Online ist nicht eingerichtet.</p><a class="btn" href="#/account">Zum Konto</a></section>'; return false; }
  if (!O.online.ready) await O.initOnline().catch(() => { });
  if (!O.loggedIn()) { el.innerHTML = '<section class="pagehead"><h1>Online</h1></section><section class="card form"><h2>Mit anderen fahren</h2><p class="muted">Melde dich an, um zu sehen, wer gerade online ist, Gruppenfahrten zu starten und live mit anderen zu fahren.</p><div class="row"><a class="btn pri" href="#/account">Anmelden oder registrieren</a></div></section>'; return false; }
  await O.refreshProfile().catch(() => { }); // Rolle und Freischaltung frisch vom Server (z. B. nach Änderung im Dashboard)
  document.body.classList.toggle('is-admin', O.isAdmin() && !O.needsMfa());
  const A = O.access();
  if (!A.ok) {
    const why = A.noProfile ? 'Zu deinem Login gibt es in der Datenbank kein Profil. Das passiert, wenn das Konto angelegt wurde, bevor <code>supabase/schema.sql</code> ausgeführt war. Das Skript erneut ausführen legt fehlende Profile an.' : A.banned ? 'Dein Konto ist gesperrt.' : 'Deine Testphase ist abgelaufen. Ein Admin muss dein Konto freischalten.';
    el.innerHTML = `<section class="pagehead"><h1>Online</h1></section><section class="card accbox bad"><b>⏳ Kein Online-Zugang</b><p class="small muted">${why}</p><div class="row"><a class="btn sm" href="#/account">Zum Konto (dort: Verbindungstest)</a><button class="btn sm ghost" id="oRetry">Erneut prüfen</button></div>${O.online.profileError ? `<p class="small" style="color:var(--hr)">Fehler beim Laden des Profils: ${esc(O.online.profileError)}</p>` : ''}</section>`;
    el.querySelector('#oRetry').onclick = () => render(el, []); return false;
  }
  await PR.joinPresence();
  return true;
}
const who = (m, extra = '') => `<span class="who">${avatarSvg(m.look || {}, 34)}<span><b>${esc(m.name)}</b>${extra}</span></span>`;
const cd = ms => ms <= 0 ? 'startet jetzt' : ms < 60e3 ? `in ${Math.ceil(ms / 1000)} s` : `in ${Math.floor(ms / 60e3)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} min`;

export async function render(el, params = []) {
  leave();
  const sec = params[0] === 'players' ? 'players' : 'lobby';
  if (!(await gate(el))) return;
  return sec === 'players' ? players(el) : lobby(el);
}

async function lobby(el) {
  const routes = await listRoutes();
  el.innerHTML = `
  <section class="pagehead"><h1>Lobby</h1><span class="small muted" id="lbOnline"></span></section>
  <section class="grid2">
    <div class="card form"><h2>Gruppenfahrt anlegen</h2>
      <label class="f">Name<input class="inp" id="gTitle" maxlength="40" placeholder="z. B. Feierabendrunde"></label>
      <label class="f">Strecke<select class="inp" id="gRoute">${routes.map(r => `<option value="${esc(r.id)}" ${r.id === sel.routeId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <div class="grid2 tight"><label class="f">Start in<select class="inp" id="gMin">${[[1, '1 Minute'], [3, '3 Minuten'], [5, '5 Minuten'], [10, '10 Minuten'], [15, '15 Minuten'], [30, '30 Minuten']].map(([v, l]) => `<option value="${v}" ${v === 5 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Art<select class="inp" id="gRace"><option value="0">Gemeinsam fahren</option><option value="1">Rennen (Start an der Linie, Ergebnisliste)</option></select></label></div>
      <div class="row"><button class="btn pri" id="gGo">Anlegen</button></div>
      <p class="small muted">Alle, die beitreten, starten zur gleichen Zeit auf derselben Strecke und sehen sich live. Die Lobby lebt nur, solange du online bist.</p>
    </div>
    <div class="card"><h2>Offene Gruppenfahrten</h2><div id="lbList" class="lblist"></div></div>
  </section>`;
  const draw = () => {
    const L = PR.lobbies(), mine = PR.P.me.joined;
    $('#lbOnline', el).textContent = `🟢 ${PR.P.peers.size + 1} online`;
    $('#lbList', el).innerHTML = L.length ? L.map(l => { const ms = l.startAt - Date.now(), inIt = mine === l.id; return `<div class="lobby ${inIt ? 'in' : ''}" data-id="${esc(l.id)}">
      <div class="row between"><div><b>${esc(l.title)}</b> <span class="prtag">${l.race ? '🏁 Rennen' : '🚴 Gruppenfahrt'}</span><div class="small muted">${esc(l.routeName)} · Start <b class="num">${cd(ms)}</b></div></div>
      <span class="row">${l.mine ? `<button class="btn sm" data-now>Jetzt starten</button><button class="btn sm ghost danger" data-cancel>Absagen</button>` : inIt ? `<button class="btn sm ghost" data-leave>Verlassen</button>` : `<button class="btn sm pri" data-join>Beitreten</button>`}</span></div>
      <div class="members">${l.members.map(m => who(m, m.me ? ' <span class="muted small">(du)</span>' : '')).join('')}</div></div>`; }).join('') : '<p class="muted small">Gerade keine. Leg eine an, andere sehen sie sofort.</p>';
  };
  draw(); off.push(bus.on('presence', draw)); tick = setInterval(draw, 1000);
  $('#gGo', el).onclick = () => { const r = routes.find(x => x.id === $('#gRoute', el).value); PR.createLobby({ title: $('#gTitle', el).value.trim() || 'Gruppenfahrt', route: r.id, routeName: r.name, minutes: +$('#gMin', el).value, race: $('#gRace', el).value === '1' }); toast('Gruppenfahrt angelegt'); draw(); };
  $('#lbList', el).onclick = e => {
    const c = e.target.closest('[data-id]'); if (!c) return; const id = c.dataset.id;
    if (e.target.closest('[data-join]')) { PR.joinLobby(id); toast('Beigetreten, die Fahrt startet automatisch'); }
    if (e.target.closest('[data-leave]') || e.target.closest('[data-cancel]')) PR.leaveLobby();
    if (e.target.closest('[data-now]')) PR.setStatus({ host: { ...PR.P.me.host, startAt: Date.now() + 5000 } });
    draw();
  };
}

async function players(el) {
  el.innerHTML = `<section class="pagehead"><h1>Wer ist online</h1></section>
  <section class="kpis" id="plKpi"></section>
  <section class="grid2"><div class="card"><h2>Spieler</h2><div id="plList" class="pllist"></div></div><div class="card"><h2>Auf den Strecken</h2><div id="plRoutes" class="small"></div></div></section>`;
  const draw = () => {
    const ps = [...PR.P.peers.values()], riding = ps.filter(p => p.where === 'ride'), byRoute = {};
    for (const p of riding) (byRoute[p.route] ||= { name: p.routeName, list: [] }).list.push(p);
    $('#plKpi', el).innerHTML = [['online (mit dir)', ps.length + 1], ['fahren gerade', riding.length + (PR.P.me.where === 'ride' ? 1 : 0)], ['in der Lobby', PR.lobbies().length + ' Fahrten']].map(([l, v]) => `<div class="card kpi"><b class="num">${v}</b><span class="small muted">${l}</span></div>`).join('');
    $('#plList', el).innerHTML = [who({ name: O.online.profile?.display_name || 'Du', look: PR.onlineLook() }, ' <span class="muted small">(du)</span>'), ...ps.map(p => `<div class="row between">${who(p, `<small class="muted">${p.where === 'ride' ? '🚴 fährt ' + esc(p.routeName || '') : '☕ im Menü'}</small>`)}${p.where === 'ride' && p.route ? `<button class="btn xs" data-ride="${esc(p.route)}">Mitfahren</button>` : ''}</div>`)].join('') || '<p class="muted small">Gerade niemand außer dir.</p>';
    $('#plRoutes', el).innerHTML = Object.entries(byRoute).map(([id, r]) => `<div class="row between"><span>${esc(r.name || id)}</span><span class="row"><b class="num">${r.list.length}</b><button class="btn xs" data-ride="${esc(id)}">Mitfahren</button></span></div>`).join('') || '<p class="muted">Gerade fährt niemand. Starte doch eine Gruppenfahrt in der Lobby.</p>';
  };
  draw(); off.push(bus.on('presence', draw));
  el.onclick = e => { const b = e.target.closest('[data-ride]'); if (!b) return; sel.routeId = b.dataset.ride; saveSel(); location.hash = '#/ride'; };
}
