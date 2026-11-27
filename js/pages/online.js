// Online: Lobby für Gruppenfahrten und "Wer ist online" mit Live-Zahlen
import { $, esc, toast, bus } from '../util.js';
import { sel, saveSel } from '../state.js';
import { avatarSvg } from '../components.js';
import { listRoutes } from '../routes.js';
import { listWorkouts, total as woTotal } from '../workouts.js';
import { nextWorkout, plan as planState, getPlan } from '../plans.js';
import * as O from '../online/client.js';
import * as PR from '../online/presence.js';

let off = [], tick = null;
export function leave() { off.forEach(f => f()); off = []; clearInterval(tick); }

export async function gate(el) {
  if (!el.querySelector('.acc-loading')) el.innerHTML = '<div class="pageload acc-loading"><div class="spinner"></div><div class="small muted">Online-Infos werden geladen …</div></div>';
  const tok = window.__routeTok, gone = () => tok !== window.__routeTok;
  await O.loadSiteConfig(); if (gone()) return false;
  if (!O.configured()) { el.innerHTML = '<section class="pagehead"><h1>Online</h1></section><section class="card"><p class="muted">IndooRado Online ist nicht eingerichtet.</p><a class="btn" href="#/account">Zum Konto</a></section>'; return false; }
  if (!O.online.ready) await O.initOnline().catch(() => { }); if (gone()) return false;
  if (!O.loggedIn()) { el.innerHTML = '<section class="pagehead"><h1>Online</h1></section><section class="card form"><h2>Mit anderen fahren</h2><p class="muted">Melde dich an, um zu sehen, wer gerade online ist, Gruppenfahrten zu starten und live mit anderen zu fahren.</p><div class="row"><a class="btn pri" href="#/account">Anmelden oder registrieren</a></div></section>'; return false; }
  await O.refreshProfile().catch(() => { }); if (gone()) return false; // Rolle und Freischaltung frisch vom Server (z. B. nach Änderung im Dashboard)
  document.body.classList.toggle('is-admin', O.isAdmin() && !O.needsMfa());
  const A = O.access();
  if (A.mfa) {
    el.innerHTML = `<section class="pagehead"><h1>Online</h1></section><section class="card accbox warn"><b>🔐 Anmeldung noch nicht abgeschlossen</b><p class="small muted">Dein Konto ist mit Zwei-Faktor-Schutz gesichert. Gib den 6-stelligen Code aus deiner Authenticator-App ein – erst danach werden Lobby, Mitfahren, Events, Teams und der Online-Abgleich freigeschaltet.</p><div class="row"><a class="btn pri" href="#/account">Code eingeben</a></div></section>`;
    const off = bus.on('online', () => { if (!el.isConnected) return off(); if (!O.access().mfa) { off(); window.__route?.(); } }); return false;
  }
  if (!A.ok) {
    const why = A.noProfile ? 'Zu deinem Login gibt es in der Datenbank kein Profil. Das passiert, wenn das Konto angelegt wurde, bevor <code>supabase/schema.sql</code> ausgeführt war. Das Skript erneut ausführen legt fehlende Profile an.' : A.banned ? 'Dein Konto ist gesperrt.' : 'Deine Testphase ist abgelaufen. Ein Admin muss dein Konto freischalten.';
    el.innerHTML = `<section class="pagehead"><h1>Online</h1></section><section class="card accbox bad"><b>⏳ Kein Online-Zugang</b><p class="small muted">${why}</p><div class="row"><a class="btn sm" href="#/account">Zum Konto (dort: Verbindungstest)</a><button class="btn sm ghost" id="oRetry">Erneut prüfen</button></div>${O.online.profileError ? `<p class="small" style="color:var(--hr)">Fehler beim Laden des Profils: ${esc(O.online.profileError)}</p>` : ''}</section>`;
    el.querySelector('#oRetry').onclick = () => render(el, []); return false;
  }
  await PR.joinPresence(); if (gone()) return false;
  return true;
}
const who = (m, extra = '') => `<span class="who">${avatarSvg(m.look || {}, 34)}<span><b>${esc(m.name)}</b>${extra}</span></span>`;
const TL = { auto: 'Auto', morning: 'Morgen', day: 'Tag', evening: 'Abend', night: 'Nacht', clear: 'klar', cloudy: 'Wolken', rain: 'Regen', fog: 'Nebel' };
const setTxt = (g = {}) => `${g.workout === 'plan' ? '📅 jeder seine nächste Plan-Einheit · ' : g.workout ? '🏋️ ' + esc(g.woName || 'Workout') + ' · ' : ''}🕒 ${TL[g.time] || 'Auto'} · 🌦️ ${g.weather === 'auto' || !g.weather ? 'Auto' : TL[g.weather]} · ${g.npcs !== false ? '🚴 Mitfahrer' : '🚫 ohne Mitfahrer'}${g.powerups !== false ? ' · ⚡ Power-ups' : ''}${g.traffic ? ' · 🚗 Verkehr' : ''}`;
const cd = ms => ms <= 0 ? 'startet jetzt' : ms < 60e3 ? `in ${Math.ceil(ms / 1000)} s` : `in ${Math.floor(ms / 60e3)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} min`;

export async function render(el, params = []) {
  leave();
  const sec = params[0] === 'players' ? 'players' : 'lobby';
  if (!(await gate(el))) return;
  if (sec === 'players') return players(el);
  // Lobby und „Wer ist online“ auf einer Seite
  el.innerHTML = '<div class="combo"></div><div class="combo"></div>'; const [a, b] = el.children;
  await lobby(a); return players(b);
}

async function lobby(el) {
  const tok = window.__routeTok; const [routes, wos] = await Promise.all([listRoutes(), listWorkouts()]); if (tok !== window.__routeTok) return;
  const nx = nextWorkout(), pl = planState.active && getPlan(planState.active.id);
  const cats = [...new Set(wos.filter(w => w.builtin).map(w => w.cat))], own = wos.filter(w => !w.builtin);
  const woOpt = w => `<option value="${esc(w.id)}">${esc(w.name)} · ${Math.round(woTotal(w) / 60)} min</option>`;
  el.innerHTML = `
  <section class="pagehead"><h1>Lobby</h1><span class="small muted" id="lbOnline"></span></section>
  <section class="grid2">
    <div class="card form"><h2>Gruppenfahrt anlegen</h2>
      <label class="f">Name<input class="inp" id="gTitle" maxlength="40" placeholder="z. B. Feierabendrunde"></label>
      <label class="f">Strecke<select class="inp" id="gRoute">${routes.map(r => `<option value="${esc(r.id)}" ${r.id === sel.routeId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <div class="grid2 tight"><label class="f">Start in<select class="inp" id="gMin">${[[1, '1 Minute'], [3, '3 Minuten'], [5, '5 Minuten'], [10, '10 Minuten'], [15, '15 Minuten'], [30, '30 Minuten']].map(([v, l]) => `<option value="${v}" ${v === 5 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Art<select class="inp" id="gRace"><option value="0">Gemeinsam fahren</option><option value="1">Rennen (Start an der Linie, Ergebnisliste)</option></select></label></div>
      <label class="f">Training<select class="inp" id="gWo"><option value="">Freie Fahrt (ohne Workout)</option><option value="plan">📅 Jeder fährt seine nächste Plan-Einheit${nx ? ' (bei dir: ' + esc(nx.name) + ')' : pl ? '' : ' (du hast keinen aktiven Plan)'}</option>${cats.map(c => `<optgroup label="${esc(c)}">${wos.filter(w => w.builtin && w.cat === c).map(woOpt).join('')}</optgroup>`).join('')}${own.length ? `<optgroup label="Eigene Workouts">${own.map(woOpt).join('')}</optgroup>` : ''}</select></label>
      <div class="grid2 tight"><label class="f">Tageszeit<select class="inp" id="gTime">${[['auto', 'Auto (wechselt)'], ['morning', 'Morgen'], ['day', 'Tag'], ['evening', 'Abend'], ['night', 'Nacht']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label class="f">Wetter<select class="inp" id="gWeather">${[['auto', 'Auto (wechselt)'], ['clear', 'Klar'], ['cloudy', 'Wolken'], ['rain', 'Regen'], ['fog', 'Nebel']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label></div>
      <div class="row"><label class="switch sm"><input type="checkbox" id="gNpcs" checked><span></span> Computer-Mitfahrer</label><label class="switch sm"><input type="checkbox" id="gPups" checked><span></span> Power-ups</label><label class="switch sm"><input type="checkbox" id="gTraffic"><span></span> Autos und Lkw</label></div>
      <div class="row"><button class="btn pri" id="gGo">Anlegen</button></div>
      <p class="small muted">Alle, die beitreten, starten zur gleichen Zeit auf derselben Strecke mit denselben Einstellungen und sehen sich live. Mit Workout fahren alle dasselbe Training, jeweils nach der eigenen FTP; mit „Plan-Einheit“ fährt jeder seine eigene nächste Einheit, aber gemeinsam. Tageszeit- und Wetterwechsel bestimmt der Gastgeber für alle. Die Lobby lebt nur, solange du online bist.</p>
    </div>
    <div class="card"><h2>Offene Gruppenfahrten</h2><div id="lbList" class="lblist"></div></div>
  </section>`;
  // Workout für die Lobby: eingebaute per ID, eigene mit ihren Abschnitten (die anderen haben sie nicht)
  const woSet = v => { if (!v) return { workout: '' }; if (v === 'plan') return { workout: 'plan' }; const w = wos.find(x => x.id === v); return w ? { workout: w.id, woName: w.name, ...(w.builtin ? {} : { woSegs: w.segs.slice(0, 120) }) } : { workout: '' }; };
  const draw = () => {
    const L = PR.lobbies(), mine = PR.P.me.joined;
    $('#lbOnline', el).textContent = `🟢 ${PR.P.peers.size + 1} online`;
    $('#lbList', el).innerHTML = L.length ? L.map(l => { const ms = l.startAt - Date.now(), inIt = mine === l.id; return `<div class="lobby ${inIt ? 'in' : ''}" data-id="${esc(l.id)}">
      <div class="row between"><div><b>${esc(l.title)}</b> <span class="prtag">${l.race ? '🏁 Rennen' : '🚴 Gruppenfahrt'}</span><div class="small muted">${esc(l.routeName)} · Start <b class="num">${cd(ms)}</b></div><div class="small muted">${setTxt(l.settings)}</div></div>
      <span class="row">${l.mine || inIt ? `<button class="btn sm ghost" data-invpick>📨 Einladen</button>` : ''}${l.mine ? `<button class="btn sm" data-now>Jetzt starten</button><button class="btn sm ghost danger" data-cancel>Absagen</button>` : inIt ? `<button class="btn sm ghost" data-leave>Verlassen</button>` : `<button class="btn sm pri" data-join>Beitreten</button>`}</span></div>
      <div class="members">${l.members.map(m => who(m, m.me ? ' <span class="muted small">(du)</span>' : '')).join('')}</div></div>`; }).join('') : '<p class="muted small">Gerade keine. Leg eine an, andere sehen sie sofort.</p>';
  };
  draw(); off.push(bus.on('presence', draw)); tick = setInterval(draw, 1000);
  $('#gGo', el).onclick = async () => { const r = routes.find(x => x.id === $('#gRoute', el).value), kit = await (await import('../online/sharedroute.js')).kitOf(r.id); PR.createLobby({ kit, title: $('#gTitle', el).value.trim() || 'Gruppenfahrt', route: r.id, routeName: r.name, minutes: +$('#gMin', el).value, race: $('#gRace', el).value === '1', settings: { ...woSet($('#gWo', el).value), time: $('#gTime', el).value, weather: $('#gWeather', el).value, npcs: $('#gNpcs', el).checked, powerups: $('#gPups', el).checked, traffic: $('#gTraffic', el).checked } }); toast('Gruppenfahrt angelegt'); draw(); };
  $('#lbList', el).onclick = e => {
    const c = e.target.closest('[data-id]'); if (!c) return; const id = c.dataset.id;
    if (e.target.closest('[data-join]')) { PR.joinLobby(id); toast('Beigetreten, die Fahrt startet automatisch'); }
    if (e.target.closest('[data-leave]') || e.target.closest('[data-cancel]')) PR.leaveLobby();
    if (e.target.closest('[data-invpick]')) { pickInvite(id); return; }
    if (e.target.closest('[data-now]')) PR.setStatus({ host: { ...PR.P.me.host, startAt: Date.now() + 5000 } });
    draw();
  };
}

// Einladung senden (mit Rückmeldung)
async function sendInvite(sidTo, name) {
  try { const o = await PR.invite(sidTo); toast(`📨 ${name} zu ${o.kind === 'lobby' ? '„' + o.title + '“' : 'deiner Fahrt'} eingeladen`); }
  catch (e) { toast(e.message, 4000); }
}
// Auswahl, wen man in die Lobby einlädt: alle Online-Spieler, die noch nicht dabei sind
async function pickInvite(lobbyId) {
  const cand = [...PR.P.peers.entries()].filter(([, m]) => m.joined !== lobbyId && m.host?.id !== lobbyId);
  if (!cand.length) return toast('Gerade ist niemand anderes online, den du einladen könntest');
  const w = document.createElement('div'); w.className = 'modal on';
  w.innerHTML = `<div class="card dlg"><h2>Wen einladen?</h2><div class="invlist">${cand.map(([k, m]) => `<button class="srow" data-sid="${esc(k)}" data-name="${esc(m.name)}">${who(m, `<small class="muted">${m.where === 'ride' ? '🚴 fährt gerade' : '☕ im Menü'}</small>`)}<span class="btn xs pri">Einladen</span></button>`).join('')}</div><div class="row end"><button class="btn" data-x>Fertig</button></div></div>`;
  document.body.appendChild(w);
  w.onclick = async e => {
    if (e.target === w || e.target.closest('[data-x]')) return w.remove();
    const b = e.target.closest('[data-sid]'); if (!b || b.disabled) return;
    b.disabled = true; await sendInvite(b.dataset.sid, b.dataset.name); b.querySelector('.btn').textContent = 'Eingeladen ✓';
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
    $('#plList', el).innerHTML = [who({ name: O.online.profile?.display_name || 'Du', look: PR.onlineLook() }, ' <span class="muted small">(du)</span>'), ...[...PR.P.peers.entries()].map(([k, p]) => `<div class="row between">${who(p, `<small class="muted">${p.where === 'ride' ? '🚴 fährt ' + esc(p.routeName || '') : '☕ im Menü'}</small>`)}<span class="row">${p.where === 'ride' && p.route ? `<button class="btn xs" data-ride="${esc(p.route)}" data-sid="${esc(k)}" data-name="${esc(p.name)}">Mitfahren</button>` : ''}<button class="btn xs ghost" data-inv="${esc(k)}" data-name="${esc(p.name)}" title="${PR.inviteOffer() ? 'Zu deiner Gruppenfahrt bzw. Fahrt einladen' : 'Leg zuerst eine Gruppenfahrt an'}">📨 Einladen</button>${p.uid ? `<button class="btn xs ghost" data-fr="${esc(p.uid)}" title="Freundschaftsanfrage senden">➕ Freund</button>` : ''}</span></div>`)].join('') || '<p class="muted small">Gerade niemand außer dir.</p>';
    $('#plRoutes', el).innerHTML = Object.entries(byRoute).map(([id, r]) => `<div class="row between"><span>${esc(r.name || id)}</span><span class="row"><b class="num">${r.list.length}</b><button class="btn xs" data-ride="${esc(id)}">Mitfahren</button></span></div>`).join('') || '<p class="muted">Gerade fährt niemand. Starte doch eine Gruppenfahrt in der Lobby.</p>';
  };
  draw(); off.push(bus.on('presence', draw));
  el.onclick = async e => {
    const fr = e.target.closest('[data-fr]');
    if (fr) { fr.disabled = true; const { data, error } = await (await O.client()).rpc('friend_request', { p_to: fr.dataset.fr }); if (error) { fr.disabled = false; return toast(/function|schema cache/i.test(error.message) ? 'Freunde fehlen in der Datenbank: supabase/schema.sql erneut ausführen' : error.message); } fr.textContent = data === 'friend' ? '✓ Freunde' : '✓ Angefragt'; toast(data === 'friend' ? 'Ihr seid jetzt Freunde' : 'Freundschaftsanfrage gesendet'); return; }
    const iv = e.target.closest('[data-inv]'); if (iv) { sendInvite(iv.dataset.inv, iv.dataset.name); return; } const b = e.target.closest('[data-ride]'); if (!b) return;
    if (!(await (await import('../online/sharedroute.js')).prepareJoin(b.dataset.sid, b.dataset.ride, toast))) return;
    sel.routeId = b.dataset.ride; saveSel(); if (b.dataset.sid) sessionStorage.setItem('joinRider', JSON.stringify({ sid: b.dataset.sid, name: b.dataset.name })); location.hash = '#/ride'; };
}
