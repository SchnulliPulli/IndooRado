// Neue Chat-Nachricht bei offener App: Hinweis unten rechts (wie beim Anruf) mit „Lesen“ und „Antworten“.
// Das Signal kommt ohne Inhalt über die Live-Verbindung; den Text holt die App selbst aus der Datenbank (nur Empfänger).
import { esc, bus } from './util.js';
import * as O from './online/client.js';

const shown = new Set();
// Ersatzweg: Kommt kein Live-Signal an, aber der Zähler steigt, die neueste ungelesene Nachricht als Hinweis zeigen
let lastN = null;
bus.on('msgCount', async n => {
  const up = n != null && lastN != null && n > lastN; if (n != null) lastN = n; if (!up) return;
  const me = O.online.user?.id; if (!me) return;
  try { const { data } = await (await O.client()).from('chat_messages').select('sender').eq('recipient', me).is('read_at', null).order('created_at', { ascending: false }).limit(1); if (data?.[0]) bus.emit('chatsignal', { uid: data[0].sender }); } catch (e) { }
});
bus.on('chatsignal', async s => {
  bus.emit('chatnew', { uid: s.uid }); bus.emit('inbox');
  if (document.querySelector(`.frdlg[data-chat="${CSS.escape(s.uid)}"]`)) return; // Chat ist schon offen
  if (!(await (await import('./push.js')).appActive())) return; // gesperrt oder im Hintergrund: dafür gibt es die Gerätemeldung
  const me = O.online.user?.id; if (!me) return;
  let m = null; try { const { data } = await (await O.client()).from('chat_messages').select('id,body,created_at').eq('sender', s.uid).eq('recipient', me).order('created_at', { ascending: false }).limit(1); m = data?.[0]; } catch (e) { }
  if (!m || /^\[\[call:/.test(m.body) || shown.has(m.id) || Date.now() - new Date(m.created_at) > 120e3) return;
  shown.add(m.id); show(s, m);
});
async function show(s, m) {
  document.querySelector(`.msgpop[data-uid="${CSS.escape(s.uid)}"]`)?.remove();
  const { avatarSvg } = await import('./components.js');
  if (!s.look) try { const { data } = await (await O.client()).rpc('friend_list'); const f = (data || []).find(x => x.id === s.uid); s = { ...s, look: f?.avatar || {}, name: s.name || f?.display_name }; } catch (e) { }
  const c = document.createElement('div'); c.className = 'invcard msgpop'; c.dataset.uid = s.uid; c.setAttribute('role', 'status');
  const txt = m.body.length > 140 ? m.body.slice(0, 140) + ' …' : m.body;
  c.innerHTML = `<button class="mpx" data-x aria-label="Schließen">✕</button><div class="row mprow">${avatarSvg(s.look || {}, 38)}<div class="mpt"><b>💬 ${esc(s.name || 'Freund')}</b><div class="small mpbody" data-noi18n>${esc(txt)}</div></div></div>
    <div class="row end"><button class="btn sm ghost" data-read>Lesen</button><button class="btn sm pri" data-reply>Antworten</button></div>`;
  document.body.appendChild(c);
  try { (await import('./sound.js')).sound.beep(false); } catch (e) { }
  let t = setTimeout(() => c.remove(), 12e3);
  c.addEventListener('mouseenter', () => clearTimeout(t)); c.addEventListener('mouseleave', () => { t = setTimeout(() => c.remove(), 6e3); });
  c.onclick = async e => {
    if (e.target.closest('[data-x]')) { c.remove(); return; }
    const reply = !!e.target.closest('[data-reply]'); if (!reply && !e.target.closest('[data-read]') && !e.target.closest('.mprow')) return;
    c.remove(); (await import('./pages/friends.js')).openChatWith(s.uid, { focus: reply });
  };
}
