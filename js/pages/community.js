// Online › Events (geplante Gruppenfahrten) und Teams
import { $, esc, toast, fmtKm } from '../util.js';
import { sel, saveSel } from '../state.js';
import { listRoutes, getRaw } from '../routes.js';
import { listWorkouts } from '../workouts.js';
import * as O from '../online/client.js';
import { gate } from './online.js';

const KIND = { group: ['👥', 'Gruppenfahrt'], race: ['🏁', 'Rennen'], workout: ['🏋️', 'Gemeinsames Workout'], fun: ['🎉', 'Spaßfahrt'] };
const when = d => { const t = new Date(d), ms = t - Date.now(), day = t.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }), hm = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${hm} Uhr${ms > 0 && ms < 864e5 ? ` · in ${ms < 3600e3 ? Math.ceil(ms / 60e3) + ' min' : Math.floor(ms / 3600e3) + ' h ' + Math.round(ms % 3600e3 / 60e3) + ' min'}` : ''}`; };
const missing = e => /function|relation|does not exist|schema cache/i.test(e?.message || '') ? 'Events und Teams fehlen in der Datenbank: supabase/schema.sql im SQL-Editor erneut ausführen.' : e?.message;
let timer = null;
export function leave() { clearInterval(timer); }
export async function render(el, params = []) {
  if (params[0] !== 'clubs') leave(); // auf der gemeinsamen Seite nicht den Events-Takt stoppen
  if (!(await gate(el))) return;
  return params[0] === 'clubs' ? clubs(el) : events(el);
}

async function events(el) {
  const sb = await O.client(), [routes, wos] = await Promise.all([listRoutes(), listWorkouts()]);
  const rn = (id, kit) => routes.find(r => r.id === id)?.name || kit?.n || id;
  el.innerHTML = `<section class="pagehead"><h1>📅 Events</h1><span class="small muted">Geplante Gruppenfahrten: anmelden, zur Startzeit beitreten, zusammen fahren</span></section><div id="evList"><div class="pageload"><div class="spinner"></div></div></div>`;
  const draw = async () => {
    const { data, error } = await sb.rpc('event_list'); if (!el.isConnected) return;
    if (error) { $('#evList', el).innerHTML = `<section class="card"><p class="muted">${esc(missing(error))}</p></section>`; return; }
    if (!data.length) { $('#evList', el).innerHTML = `<section class="card"><p class="muted">Gerade sind keine Events geplant.${O.isAdmin() ? ' Lege unter Admin eins an.' : ''}</p></section>`; return; }
    $('#evList', el).innerHTML = data.map(e => {
      const t0 = new Date(e.starts_at), live = Date.now() >= t0 - 10 * 60e3 && Date.now() < +t0 + e.duration_min * 60e3, [ic, kl] = KIND[e.kind] || KIND.group;
      const wo = e.workout_id ? wos.find(w => w.id === e.workout_id) : null;
      return `<section class="card evcard ${live ? 'live' : ''}" data-id="${e.id}"><div class="evhead"><span class="evic">${ic}</span><div style="flex:1"><div class="small muted">${kl} · ${when(e.starts_at)} · ${e.duration_min} min</div><h2>${esc(e.title)}</h2>
        <div class="small">🛣️ ${esc(rn(e.route_id, e.route_kit))}${wo ? ' · 🏋️ ' + esc(wo.name) : ''} · 👥 ${e.riders} angemeldet</div>${e.description ? `<p class="small muted">${esc(e.description)}</p>` : ''}</div></div>
        <div class="row end">${live ? `<button class="btn pri" data-go>🚴 Jetzt beitreten</button>` : ''}<button class="btn ${e.me ? '' : live ? '' : 'pri'}" data-sign="${e.me ? 0 : 1}">${e.me ? '✓ Angemeldet (abmelden)' : 'Anmelden'}</button></div></section>`;
    }).join('');
    el.onclick = async ev => {
      const card = ev.target.closest('.evcard'); if (!card) return; const e = data.find(x => x.id === card.dataset.id);
      const s = ev.target.closest('[data-sign]');
      if (s) { const on = s.dataset.sign === '1'; const r = on ? await sb.from('event_signups').insert({ event_id: e.id }) : await sb.from('event_signups').delete().eq('event_id', e.id).eq('user_id', O.online.user.id); if (r.error) return toast(missing(r.error)); toast(on ? '✓ Angemeldet – du bekommst auf der Startseite einen Hinweis' : 'Abgemeldet'); draw(); return; }
      if (ev.target.closest('[data-go]')) {
        if (!(await (await import('../online/sharedroute.js')).ensureRoute(e.route_id, e.route_kit, 'Event'))) return toast('Diese Strecke gibt es in deiner App nicht (eigene, importierte Strecke des Erstellers)');
        sel.routeId = e.route_id; sel.workoutId = e.workout_id || null; saveSel(); sessionStorage.setItem('eventRide', JSON.stringify({ id: e.id, title: e.title })); location.hash = '#/ride';
      }
    };
  };
  draw(); timer = setInterval(draw, 60e3);
}

async function clubs(el) {
  const sb = await O.client();
  el.innerHTML = `<section class="pagehead"><h1>🛡️ Teams</h1><span class="small muted">Zusammen Kilometer sammeln – Wertung nach den letzten 7 Tagen</span></section><div id="clMine"></div><section class="card"><h2>Alle Teams</h2><div id="clList"><div class="pageload"><div class="spinner"></div></div></div></section>`;
  const draw = async () => {
    const { data, error } = await sb.rpc('club_overview'); if (!el.isConnected) return;
    if (error) { $('#clList', el).innerHTML = `<p class="muted">${esc(missing(error))}</p>`; return; }
    const mine = data.find(c => c.mine);
    $('#clList', el).innerHTML = data.length ? `<ol class="cllist">${data.map((c, i) => `<li class="${c.mine ? 'me' : ''}"><span class="clrank">${i + 1}</span><span class="cltag" style="background:${esc(c.color)}">${esc(c.tag)}</span><div class="clname"><b>${esc(c.name)}</b>${c.description ? `<div class="small muted">${esc(c.description)}</div>` : ''}</div><span class="num small">${c.members} 👤</span><span class="num"><b>${String(c.km7).replace('.', ',')}</b> km</span>${c.mine ? '<span class="prtag">Dein Team</span>' : `<button class="btn sm" data-join="${c.id}">Beitreten</button>`}</li>`).join('')}</ol>` : '<p class="muted">Noch keine Teams. Gründe das erste!</p>';
    if (mine) {
      const { data: mem } = await sb.rpc('club_members_list', { p_club: mine.id });
      $('#clMine', el).innerHTML = `<section class="card clmine" style="--cc:${esc(mine.color)}"><div class="row between"><h2><span class="cltag" style="background:${esc(mine.color)}">${esc(mine.tag)}</span> ${esc(mine.name)}</h2><button class="btn sm ghost danger" id="clLeave">Team verlassen</button></div>
        <div class="kpis"><div class="kpi"><b class="num">${mine.members}</b><span>Mitglieder</span></div><div class="kpi"><b class="num">${String(mine.km7).replace('.', ',')}</b><span>km in 7 Tagen</span></div><div class="kpi"><b class="num">${data.indexOf(mine) + 1}.</b><span>Platz</span></div></div>
        <ol class="cllist">${(mem || []).map((m, i) => `<li class="${m.is_me ? 'me' : ''}"><span class="clrank">${i + 1}</span><div class="clname"><b>${esc(m.display_name)}</b>${m.is_owner ? ' <span class="small muted">👑 Gründer</span>' : ''}</div><span class="small muted">Level ${m.level}</span><span class="num"><b>${String(m.km7).replace('.', ',')}</b> km</span></li>`).join('')}</ol>
        <p class="small muted">Lade Freunde ein: Sie finden dein Team unter Online › Teams. Ein Team hat bis zu 50 Mitglieder.</p></section>`;
      $('#clLeave', el).onclick = async () => { const { error } = await sb.rpc('club_leave'); if (error) return toast(missing(error)); toast('Team verlassen'); draw(); };
    } else {
      $('#clMine', el).innerHTML = `<section class="card form"><h2>Team gründen</h2><div class="grid2 tight"><label class="f">Name<input class="inp" id="cN" maxlength="40" placeholder="z. B. Kurbelkumpels"></label><label class="f">Kürzel (2–5 Zeichen)<input class="inp" id="cT" maxlength="5" placeholder="KK"></label></div>
        <div class="grid2 tight"><label class="f">Farbe<input type="color" class="inp" id="cC" value="#ff6a3d"></label><label class="f">Beschreibung<input class="inp" id="cD" maxlength="300" placeholder="Wer seid ihr?"></label></div><div class="row end"><button class="btn pri" id="cGo">Gründen</button></div></section>`;
      $('#cGo', el).onclick = async () => { const { error } = await sb.rpc('club_create', { p_name: $('#cN', el).value, p_tag: $('#cT', el).value, p_color: $('#cC', el).value, p_desc: $('#cD', el).value }); if (error) return toast(/clubs_name_key|unique/i.test(error.message) ? 'Den Namen gibt es schon' : /check/i.test(error.message) ? 'Name 3–40 Zeichen, Kürzel 2–5 Buchstaben oder Ziffern' : missing(error)); toast('🛡️ Team gegründet'); draw(); };
    }
  };
  el.onclick = async e => { const b = e.target.closest('[data-join]'); if (!b) return; const { error } = await sb.rpc('club_join', { p_club: b.dataset.join }); if (error) return toast(missing(error)); toast('Willkommen im Team!'); draw(); };
  draw();
}
