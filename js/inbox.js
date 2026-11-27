// Posteingang für die Startseite: neueste Nachricht je Freund, Freundschaftsanfragen, Anruf-Einladungen. Nur angemeldet.
import { esc, toast } from './util.js';
import { avatarSvg } from './components.js';
import * as O from './online/client.js';

const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.floor(s / 60)} min` : s < 86400 ? `vor ${Math.floor(s / 3600)} h` : new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); };
export async function mountInbox(anchor) {
  if (!O.configured()) return;
  if (!O.online.ready) await new Promise(r => { const t = setInterval(() => { if (O.online.ready || !anchor.isConnected) { clearInterval(t); r(); } }, 300); });
  if (!anchor.isConnected || !O.loggedIn() || !O.access().ok) return;
  const box = document.createElement('section'); box.className = 'card inbox'; box.innerHTML = '<div class="row between"><h2>💬 Nachrichten</h2><a class="small" href="#/friends">Alle Freunde</a></div><div class="ibl"><div class="pageload"><div class="spinner"></div></div></div>';
  anchor.after(box);
  const sb = await O.client(), me = O.online.user.id, C = await import('./call.js');
  const draw = async () => {
    if (!box.isConnected) { clearInterval(iv); return; }
    const [fl, ms] = await Promise.all([sb.rpc('friend_list'), sb.from('chat_messages').select('id,sender,recipient,body,created_at,read_at').order('created_at', { ascending: false }).limit(60)]);
    if (fl.error) { box.querySelector('.ibl').innerHTML = `<p class="small muted">${/function|schema cache/i.test(fl.error.message) ? 'Freunde fehlen in der Datenbank: supabase/schema.sql erneut ausführen.' : esc(fl.error.message)}</p>`; return; }
    const fr = new Map(fl.data.map(f => [f.id, f])), req = fl.data.filter(f => f.status === 'pending' && f.incoming), last = new Map();
    for (const m of ms.data || []) { const other = m.sender === me ? m.recipient : m.sender; if (!last.has(other) && fr.get(other)?.status === 'accepted') last.set(other, m); }
    const rows = [...last.entries()].slice(0, 6).map(([id, m]) => {
      const f = fr.get(id), room = C.callRoom(m.body), mine = m.sender === me, unread = !mine && !m.read_at, fresh = room && Date.now() - new Date(m.created_at) < 3600e3;
      const text = room ? (fresh ? '📹 Videoanruf' : '📹 Videoanruf (vorbei)') : esc(m.body.length > 90 ? m.body.slice(0, 90) + ' …' : m.body);
      return `<div class="ibrow ${unread ? 'new' : ''}" data-open="${esc(id)}">${avatarSvg(f.avatar || {}, 36)}<div class="ibt"><div class="row between"><b>${esc(f.display_name)}</b><span class="small muted">${ago(m.created_at)}</span></div><div class="small ${unread ? '' : 'muted'}">${mine ? 'Du: ' : ''}${text}</div></div>${fresh && !mine ? `<button class="btn xs pri" data-join="${esc(room)}" data-peer="${esc(id)}">Beitreten</button>` : f.unread ? `<span class="badge">${f.unread}</span>` : ''}</div>`;
    });
    box.querySelector('.ibl').innerHTML = (req.length ? req.map(f => `<div class="ibrow new">${avatarSvg(f.avatar || {}, 36)}<div class="ibt"><b>${esc(f.display_name)}</b><div class="small">möchte mit dir befreundet sein</div></div><span class="row"><button class="btn xs pri" data-acc="${esc(f.id)}">Annehmen</button><button class="btn xs ghost" data-dec="${esc(f.id)}">✕</button></span></div>`).join('') : '')
      + (rows.join('') || (req.length ? '' : `<p class="small muted">${fl.data.some(f => f.status === 'accepted') ? 'Keine Nachrichten. Schreib deinen Freunden unter Online › Freunde.' : 'Noch keine Freunde. Unter Online › Freunde findest du deinen Freundescode.'}</p>`));
  };
  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-acc],[data-dec]');
    if (a) { e.stopPropagation(); const acc = !!a.dataset.acc; const { error } = await sb.rpc('friend_respond', { p_other: a.dataset.acc || a.dataset.dec, p_accept: acc }); if (error) return toast(error.message); toast(acc ? '🎉 Ihr seid jetzt Freunde' : 'Abgelehnt'); draw(); return; }
    const j = e.target.closest('[data-join]'); if (j) { e.stopPropagation(); const f = (await sb.rpc('friend_list')).data?.find(x => x.id === j.dataset.peer); C.joinCall(j.dataset.join, { id: j.dataset.peer, name: f?.display_name || 'Freund' }); return; }
    const r = e.target.closest('[data-open]'); if (r) location.hash = '#/friends?open=' + encodeURIComponent(r.dataset.open);
  });
  draw(); const iv = setInterval(() => document.hidden || draw(), 20e3);
}
