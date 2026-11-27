// Videoanrufe zwischen Freunden über Jitsi Meet (eingebettet). Nur angemeldet, nach Zustimmung.
// Ablauf: Raumname (zufällig, nicht erratbar) geht als private Chat-Nachricht an den Freund (nur Freunde können sie lesen),
// über die Lobby-Verbindung nur ein „es klingelt“ ohne Raum. Das Anruffenster bleibt über Seitenwechsel und während der Fahrt offen.
import { $, esc, toast, dialog, bus } from './util.js';
import { profile, sel } from './state.js';
import * as O from './online/client.js';

export const CALL_TERMS = 1;
const HOSTS = ['meet.ffmuc.net', 'meet.jit.si']; // muss zur Sicherheitsrichtlinie (frame-src) in index.html passen
const host = () => HOSTS.includes(profile.jitsiHost) ? profile.jitsiHost : HOSTS[0];
const MARK = /^\[\[call:(IndooRado-[A-Za-z0-9]{24})\]\]$/;
export const callRoom = body => (MARK.exec(body || '') || [])[1] || null;
export const call = { room: null, peer: null, win: null };
const rand = n => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', u = crypto.getRandomValues(new Uint8Array(n)); return [...u].map(x => a[x % a.length]).join(''); };

async function allowed() {
  if (!O.loggedIn() || !O.access().ok) { toast('Videoanrufe gibt es nur mit Anmeldung'); return false; }
  const { consent } = await import('./consent.js');
  return consent('call', CALL_TERMS, { title: 'Videoanrufe mit Jitsi', html: `
    <p>Videoanrufe laufen über <b>Jitsi Meet</b> auf dem Server <b>${host()}</b> (${host() === 'meet.ffmuc.net' ? 'Freifunk München e.V., Deutschland' : '8x8 Inc.'}). Bild, Ton, dein Anzeigename und – technisch bedingt – deine IP-Adresse gehen an diesen Server und an deinen Gesprächspartner. Die Übertragung ist verschlüsselt; der Server-Betreiber verarbeitet die Daten nach seiner eigenen Datenschutzerklärung.</p>
    <p>IndooRado speichert keine Bilder oder Töne. Gespeichert wird nur die Einladung als Chat-Nachricht zwischen euch beiden (Raumname, Zeitpunkt), die nach 12 Monaten gelöscht wird. Kamera und Mikrofon fragt dein Browser jeweils ab.</p>
    <p class="small muted">Bitte nur Freunde anrufen, die das möchten, und keine Gespräche ohne Einverständnis aufnehmen.</p>` });
}
const url = room => {
  const name = JSON.stringify(O.online.profile?.display_name || profile.name || 'IndooRado');
  const c = { 'config.prejoinConfig.enabled': false, 'config.prejoinPageEnabled': false, 'config.disableDeepLinking': true, 'config.startWithAudioMuted': false, 'config.startWithVideoMuted': false, 'config.toolbarButtons': '["microphone","camera","tileview","toggle-camera","settings","fullscreen"]', 'interfaceConfig.MOBILE_APP_PROMO': false, 'config.disableInviteFunctions': true, 'userInfo.displayName': name };
  return `https://${host()}/${encodeURIComponent(room)}#` + Object.entries(c).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' && !v.startsWith('[') && !v.startsWith('"') ? JSON.stringify(v) : v)}`).join('&');
};

// Anrufen: Raum anlegen, Einladung als private Nachricht, Klingeln an alle Geräte des Freundes
export async function startCall(friend) {
  if (!(await allowed())) return;
  const sb = await O.client(), room = 'IndooRado-' + rand(24);
  const { error } = await sb.from('chat_messages').insert({ recipient: friend.id, body: `[[call:${room}]]` });
  if (error) return toast('Anruf nicht möglich: ' + (/row-level/i.test(error.message) ? 'ihr seid nicht (mehr) befreundet oder zu viele Nachrichten' : error.message));
  const PR = await import('./online/presence.js'); const n = await PR.callSignal(friend.id, 'call');
  openWindow(room, { id: friend.id, name: friend.display_name || friend.name });
  toast(n ? `📞 Es klingelt bei ${friend.display_name || friend.name} …` : `${friend.display_name || friend.name} ist gerade nicht online – die Einladung liegt im Chat`, 4000);
}
// Beitreten (aus dem Chat oder beim Klingeln)
export async function joinCall(room, peer) { if (!/^IndooRado-[A-Za-z0-9]{24}$/.test(room) || !(await allowed())) return; openWindow(room, peer); }
export async function hangUp(notify = true) {
  const p = call.peer; call.win?.remove(); call.win = null; call.room = null; call.peer = null;
  if (notify && p?.id) { try { (await import('./online/presence.js')).callSignal(p.id, 'callend'); } catch (e) { } }
}

// Schwebendes, verschieb- und größenveränderbares Anruffenster (auch über der Fahrt)
function openWindow(room, peer) {
  hangUp(false); call.room = room; call.peer = peer;
  let g = {}; try { g = JSON.parse(localStorage.getItem('vvCallWin') || '{}'); } catch (e) { }
  const w = document.createElement('div'); w.className = 'callwin'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Videoanruf');
  Object.assign(w.style, { width: (g.w || 340) + 'px', height: (g.h || 260) + 'px', left: (g.x ?? Math.max(8, innerWidth - (g.w || 340) - 16)) + 'px', top: (g.y ?? 80) + 'px' });
  w.innerHTML = `<div class="cwhead"><span class="cwt">📹 ${esc(peer?.name || 'Anruf')}</span><span class="row"><button class="btn xs ghost" data-cw="lobby" title="Zur Gruppenfahrt einladen">👥 Lobby</button><button class="btn xs ghost" data-cw="pop" title="In neuem Fenster öffnen">↗</button><button class="btn xs danger" data-cw="end" title="Auflegen">✕</button></span></div>
    <iframe src="${esc(url(room))}" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write" referrerpolicy="no-referrer" title="Videoanruf"></iframe>`;
  document.body.appendChild(w); call.win = w;
  // Verschieben am Kopf, Größe über die Ecke (CSS resize); Lage merken
  const head = w.querySelector('.cwhead'); let drag = null;
  const keep = () => { const r = w.getBoundingClientRect(); try { localStorage.setItem('vvCallWin', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })); } catch (e) { } };
  head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = w.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); w.classList.add('drag'); });
  head.addEventListener('pointermove', e => { if (!drag) return; w.style.left = Math.min(innerWidth - 60, Math.max(-w.offsetWidth + 80, e.clientX - drag.dx)) + 'px'; w.style.top = Math.min(innerHeight - 40, Math.max(0, e.clientY - drag.dy)) + 'px'; });
  head.addEventListener('pointerup', () => { drag = null; w.classList.remove('drag'); keep(); });
  new ResizeObserver(() => keep()).observe(w);
  w.addEventListener('click', async e => {
    const b = e.target.closest('[data-cw]'); if (!b) return;
    if (b.dataset.cw === 'end') return hangUp();
    if (b.dataset.cw === 'pop') { window.open(url(room), '_blank', 'noopener'); hangUp(false); return; }
    if (b.dataset.cw === 'lobby') return inviteToLobby();
  });
}
// Während des Anrufs zur Gruppenfahrt einladen (legt bei Bedarf eine an: gewählte Strecke, Start in 3 Minuten)
async function inviteToLobby() {
  const p = call.peer; if (!p?.id) return;
  const PR = await import('./online/presence.js'), sids = PR.sidsOf(p.id);
  if (!sids.length) return toast(`${p.name} ist gerade nicht in IndooRado online`);
  if (!PR.inviteOffer()) {
    const { getRaw } = await import('./routes.js'), r = await getRaw(sel.routeId), kit = await (await import('./online/sharedroute.js')).kitOf(sel.routeId);
    PR.createLobby({ title: `Fahrt mit ${p.name}`, route: sel.routeId, routeName: r?.name || 'Strecke', minutes: 3, race: false, settings: {}, kit });
    await new Promise(f => setTimeout(f, 800));
  }
  try { for (const s of sids) await PR.invite(s); toast(`📨 ${p.name} zur Gruppenfahrt eingeladen – Start in der Lobby`); location.hash = '#/lobby'; } catch (e) { toast(e.message, 4000); }
}

// Klingeln und Auflegen vom Gegenüber
bus.on('callsignal', async s => {
  if (s.kind === 'callend') { if (call.peer?.id === s.uid) { toast(`📴 ${s.name} hat aufgelegt`); hangUp(false); } return; }
  if (call.room) return; // schon im Gespräch
  // Einladung aus dem privaten Chat holen (nur Freunde können sie schreiben); älter als 3 Minuten = verpasst
  const sb = await O.client(), me = O.online.user?.id; if (!me) return;
  const { data } = await sb.from('chat_messages').select('body,created_at').eq('sender', s.uid).eq('recipient', me).like('body', '[[call:%').order('created_at', { ascending: false }).limit(1);
  const room = callRoom(data?.[0]?.body); if (!room || Date.now() - new Date(data[0].created_at) > 180e3) return;
  const { avatarSvg } = await import('./components.js');
  const c = document.createElement('div'); c.className = 'invcard callring'; c.setAttribute('role', 'alertdialog');
  c.innerHTML = `<div class="row">${avatarSvg(s.look || {}, 40)}<div><b>📹 ${esc(s.name)} ruft an</b><div class="small muted">Videoanruf</div></div></div><div class="row end"><button class="btn sm ghost" data-no>Ablehnen</button><button class="btn sm pri" data-ok>Annehmen</button></div>`;
  document.body.appendChild(c); const t = setTimeout(() => c.remove(), 60e3);
  try { (await import('./sound.js')).sound.beep(true); } catch (e) { }
  c.onclick = async e => {
    if (e.target.closest('[data-no]')) { clearTimeout(t); c.remove(); (await import('./online/presence.js')).callSignal(s.uid, 'callend'); return; }
    if (e.target.closest('[data-ok]')) { clearTimeout(t); c.remove(); joinCall(room, { id: s.uid, name: s.name }); }
  };
});
// Abmelden beendet ein laufendes Gespräch
bus.on('online', () => { if (call.room && !O.loggedIn()) hangUp(false); });
