// Posteingang für die Startseite: neueste Nachricht je Freund, Freundschaftsanfragen, Anruf-Einladungen. Nur angemeldet.
import { esc, toast, bus } from './util.js';
import { avatarSvg } from './components.js';
import * as O from './online/client.js';
import { kv } from './db.js';

const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.floor(s / 60)} min` : s < 86400 ? `vor ${Math.floor(s / 3600)} h` : new Date(t).toLocaleDateString(document.documentElement.lang, { day: '2-digit', month: '2-digit' }); };
// Anzahl Neues (ungelesene Nachrichten + offene Freundschaftsanfragen); null = nicht angemeldet
export async function newCount() {
  if (!O.configured() || !O.online.ready || !O.loggedIn() || !O.access().ok) return null;
  const { data, error } = await (await O.client()).rpc('friend_list'); if (error) return null;
  return data.reduce((a, f) => a + (+f.unread || 0) + (f.status === 'pending' && f.incoming ? 1 : 0), 0);
}
// Nachrichten als Fenster (Popup)
export async function openInbox() {
  if (!O.loggedIn() || !O.access().ok) { location.hash = '#/account'; return; }
  document.querySelector('.inboxdlg')?.closest('.modal')?.remove();
  const w = document.createElement('div'); w.className = 'modal on';
  w.innerHTML = `<div class="card dlg inboxdlg" role="dialog" aria-modal="true" aria-label="Nachrichten"><div class="ibhead"><h2>💬 Nachrichten</h2><span class="ibbtns"><button class="btn sm ghost" data-clear title="Alle Benachrichtigungen aus der Liste entfernen" aria-label="Alle löschen">🧹<span class="ibl2">Alle löschen</span></button><a class="btn sm ghost" href="#/friends" title="Alle Freunde" aria-label="Alle Freunde">👥<span class="ibl2">Freunde</span></a></span><button class="btn sm ghost ibx" data-x aria-label="Schließen">✕</button></div><div class="ibl"><div class="pageload"><div class="spinner"></div></div></div></div>`;
  document.body.appendChild(w); let iv = null;
  const close = () => { w.remove(); clearInterval(iv); document.removeEventListener('keydown', k, true); bus.emit('inbox'); };
  const k = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }; document.addEventListener('keydown', k, true);
  w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-x]') || e.target.closest('a[href]')) close(); });
  iv = await fill(w.querySelector('.dlg'), close); if (!w.isConnected) clearInterval(iv);
}
// Inhalt füllen und alle 20 s auffrischen; gibt den Takt zurück
async function fill(box, close) {
  const sb = await O.client(), me = O.online.user.id, C = await import('./call.js'); let iv = null;
  const draw = async () => {
    if (!box.isConnected) { clearInterval(iv); return; }
    const [fl, ms] = await Promise.all([sb.rpc('friend_list'), sb.from('chat_messages').select('id,sender,recipient,body,created_at,read_at').order('created_at', { ascending: false }).limit(60)]);
    if (fl.error) { box.querySelector('.ibl').innerHTML = `<p class="small muted">${/function|schema cache/i.test(fl.error.message) ? 'Freunde fehlen in der Datenbank: Datenbankschema erneut ausführen.' : esc(fl.error.message)}</p>`; return; }
    const fr = new Map(fl.data.map(f => [f.id, f])), req = fl.data.filter(f => f.status === 'pending' && f.incoming), last = new Map();
    for (const m of ms.data || []) { const other = m.sender === me ? m.recipient : m.sender; if (!last.has(other) && fr.get(other)?.status === 'accepted') last.set(other, m); }
    const cleared = +(await kv.get('inboxCleared', 0)) || 0; // „Alle löschen“: ältere Einträge ausblenden, neue erscheinen wieder
    for (const [id, m] of [...last]) if (+new Date(m.created_at) <= cleared) last.delete(id);
    const states = await C.callStates([...last.values()].map(m => C.callRoom(m.body)));
    const rows = [...last.entries()].slice(0, 15).map(([id, m]) => {
      const f = fr.get(id), room = C.callRoom(m.body), mine = m.sender === me, unread = !mine && !m.read_at, ci = room ? C.callInfo(states.get(room), m, me) : null, fresh = ci?.active;
      const text = room ? '📹 ' + esc(ci.text.replace(/^📹 /, '')) : esc(m.body.length > 90 ? m.body.slice(0, 90) + ' …' : m.body);
      return `<div class="ibrow ${unread ? 'new' : ''}" data-open="${esc(id)}">${avatarSvg(f.avatar || {}, 36)}<div class="ibt"><div class="row between"><b>${esc(f.display_name)}</b><span class="small muted">${ago(m.created_at)}</span></div><div class="small ${unread ? '' : 'muted'}">${mine && !room ? 'Du: ' : ''}${text}</div></div>${fresh && !mine ? `<button class="btn xs pri" data-join="${esc(room)}" data-peer="${esc(id)}">Beitreten</button>` : f.unread ? `<span class="badge">${f.unread}</span>` : ''}</div>`;
    });
    const N = await import('./notilog.js'), nts = (await N.notes()).filter(n => n.t > cleared);
    const ntHtml = nts.length ? `<div class="ibsec">🔔 Hinweise</div>` + nts.map(n => { const live = n.act && (!n.ttl || Date.now() - n.t < n.ttl); return `<div class="ibrow ibnote" ${live ? `data-note="${esc(n.id)}"` : ''}><div class="ibico" aria-hidden="true">${esc(n.icon || '🔔')}</div><div class="ibt"><div class="row between"><b>${esc(n.title)}</b><span class="small muted">${ago(new Date(n.t).toISOString())}</span></div>${n.body ? `<div class="small muted">${esc(n.body)}</div>` : ''}</div>${live && n.act.t === 'invite' ? '<button class="btn xs pri">Beitreten</button>' : live && n.act.t === 'chat' ? '<button class="btn xs">Chat</button>' : ''}</div>`; }).join('') : '';
    box.querySelector('.ibl').innerHTML = (req.length ? req.map(f => `<div class="ibrow new">${avatarSvg(f.avatar || {}, 36)}<div class="ibt"><b>${esc(f.display_name)}</b><div class="small">möchte mit dir befreundet sein</div></div><span class="row"><button class="btn xs pri" data-acc="${esc(f.id)}">Annehmen</button><button class="btn xs ghost" data-dec="${esc(f.id)}">✕</button></span></div>`).join('') : '')
      + (rows.join('') || (req.length || nts.length ? '' : (fl.data.some(f => f.status === 'accepted') ? (cleared ? '<div class="empty"><div class="emi">✨</div><b>Alles erledigt</b><span>Neue Nachrichten und Anrufe erscheinen wieder hier. Ältere findest du im Chat unter Alle Freunde.</span></div>' : '<div class="empty"><div class="emi">📭</div><b>Keine Nachrichten</b><span>Hier erscheinen Nachrichten, Freundschaftsanfragen und Anruf-Einladungen. Schreib deinen Freunden unter Online › Freunde.</span></div>') : '<div class="empty"><div class="emi">👋</div><b>Noch keine Freunde</b><span>Unter Online › Freunde findest du deinen Freundescode und kannst Spieler suchen.</span></div>'))) + ntHtml;
  };
  box.addEventListener('click', async e => {
    if (e.target.closest('[data-clear]')) {
      e.stopPropagation(); await kv.set('inboxCleared', Date.now()); (await import('./notilog.js')).clearNotes();
      try { const { data } = await sb.rpc('friend_list'); await Promise.all((data || []).filter(f => f.status === 'accepted' && +f.unread > 0).map(f => sb.rpc('chat_read', { p_other: f.id }))); } catch (x) { }
      try { const reg = await navigator.serviceWorker?.getRegistration(); (await reg?.getNotifications() || []).forEach(n => n.close()); } catch (x) { } // auch die Meldungen des Geräts schließen
      toast('🧹 Benachrichtigungen gelöscht'); bus.emit('inbox'); draw(); return;
    }
    const a = e.target.closest('[data-acc],[data-dec]');
    if (a) { e.stopPropagation(); const acc = !!a.dataset.acc; const { error } = await sb.rpc('friend_respond', { p_other: a.dataset.acc || a.dataset.dec, p_accept: acc }); if (error) return toast(error.message); toast(acc ? '🎉 Ihr seid jetzt Freunde' : 'Abgelehnt'); draw(); return; }
    const j = e.target.closest('[data-join]'); if (j) { e.stopPropagation(); close(); const f = (await sb.rpc('friend_list')).data?.find(x => x.id === j.dataset.peer); C.joinCall(j.dataset.join, { id: j.dataset.peer, name: f?.display_name || 'Freund' }); return; }
    const nt = e.target.closest('[data-note]'); if (nt) { e.stopPropagation(); const N = await import('./notilog.js'), n = (await N.notes()).find(x => x.id === nt.dataset.note); if (!n) return; close(); N.removeNote(n.id);
      if (n.act.t === 'invite') (await import('./app.js')).acceptInvite(n.act.inv); else if (n.act.t === 'chat') (await import('./pages/friends.js')).openChatWith(n.act.uid); return; }
    const r = e.target.closest('[data-open]'); if (r) { close(); (await import('./pages/friends.js')).openChatWith(r.dataset.open); }
  });
  await draw();
  // Einmal angezeigt = gelesen (die Hervorhebung bleibt bis zum nächsten Öffnen sichtbar)
  try { const { data } = await sb.rpc('friend_list'); await Promise.all((data || []).filter(f => f.status === 'accepted' && +f.unread > 0).map(f => sb.rpc('chat_read', { p_other: f.id }))); } catch (e) { }
  let dt = null; const offNew = bus.on('chatnew', () => { if (!box.isConnected) return offNew(); clearTimeout(dt); dt = setTimeout(draw, 400); }); // gesendete und neue Nachrichten sofort
  bus.emit('inbox'); iv = setInterval(() => document.hidden || draw(), 20e3); return iv;
}
