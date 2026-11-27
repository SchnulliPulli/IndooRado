// Videoanrufe zwischen Freunden über Jitsi Meet (eingebettet). Nur angemeldet, nach Zustimmung.
// Ablauf: Raumname (zufällig, nicht erratbar) geht als private Chat-Nachricht an den Freund (nur Freunde können sie lesen),
// über die Lobby-Verbindung nur ein „es klingelt“ ohne Raum. Das Anruffenster bleibt über Seitenwechsel und während der Fahrt offen.
import { $, esc, toast, dialog, bus } from './util.js';
import { profile, sel } from './state.js';
import * as O from './online/client.js';

export const CALL_TERMS = 2;
// Verbindungshelfer (STUN): verraten den Geräten ihre öffentliche Adresse, damit sie sich direkt erreichen. Kein Bild/Ton läuft darüber.
const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.nextcloud.com:443'] }];
const JITSI = 'meet.ffmuc.net'; // Ausweichlösung im eigenen Fenster
const MARK = /^\[\[call:(IndooRado-[A-Za-z0-9]{24})\]\]$/;
export const callRoom = body => (MARK.exec(body || '') || [])[1] || null;
export const call = { room: null, peer: null, win: null, pc: null, ch: null, local: null };
const rand = n => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', u = crypto.getRandomValues(new Uint8Array(n)); return [...u].map(x => a[x % a.length]).join(''); };

async function allowed() {
  if (!O.loggedIn() || !O.access().ok) { toast('Videoanrufe gibt es nur mit Anmeldung'); return false; }
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') { toast('Dieser Browser kann keine Videoanrufe'); return false; }
  const { consent } = await import('./consent.js');
  return consent('call', CALL_TERMS, { title: 'Videoanrufe', html: `
    <p>Bild und Ton gehen <b>direkt und verschlüsselt</b> von deinem Gerät zu deinem Freund (WebRTC, Ende-zu-Ende). Kein Server zeichnet etwas auf, auch IndooRado nicht.</p>
    <p>Für den Verbindungsaufbau tauschen eure Geräte über IndooRado Online (Supabase) kurz technische Verbindungsdaten aus. Dabei sieht dein Gesprächspartner – wie bei jedem direkten Anruf – deine <b>IP-Adresse</b>. Zum Finden der Verbindung werden die STUN-Server von Cloudflare und Nextcloud angefragt (sie sehen ebenfalls nur die IP-Adresse).</p>
    <p>Gespeichert wird nur die Einladung als private Chat-Nachricht zwischen euch beiden (Raumname, Zeitpunkt), gelöscht nach 12 Monaten. Kamera und Mikrofon fragt dein Browser jeweils ab.</p>
    <p class="small muted">Bitte nur Freunde anrufen, die das möchten, und keine Gespräche ohne Einverständnis aufnehmen.</p>` });
}
// Was teile ich? Bild und Ton, nur Ton oder nur Bild (der Browser fragt nur das jeweils Nötige ab)
const MODES = { av: '📹 Bild und Ton', audio: '🎙️ Nur Ton', video: '📷 Nur Bild' };
async function pickMode(title) {
  const last = MODES[profile.callMode] ? profile.callMode : 'av';
  const order = [last, ...Object.keys(MODES).filter(k => k !== last)];
  const v = await dialog({ title, html: '<p class="muted small">Was möchtest du teilen? Du kannst Mikrofon und Kamera im Gespräch zusätzlich stummschalten.</p>', buttons: [{ label: 'Abbrechen', value: null }, ...order.slice().reverse().map(k => ({ label: MODES[k], value: k, cls: k === last ? 'pri' : '' }))], cls: 'modedlg' });
  if (v) { profile.callMode = v; try { (await import('./state.js')).saveProfile(); } catch (e) { } }
  return v;
}
// Anrufen: Raum anlegen, Einladung als private Nachricht, Klingeln an alle Geräte des Freundes
export async function startCall(friend) {
  if (!(await allowed())) return;
  const mode = await pickMode(`${friend.display_name || friend.name} anrufen`); if (!mode) return;
  const sb = await O.client();
  // Raum vom Server: nur unter Freunden, kryptografisch zufällig, Kanal danach nur für euch beide
  const cr = await sb.rpc('call_create', { p_friend: friend.id }); if (cr.error) return toast('Anruf nicht möglich: ' + (/function|schema cache/i.test(cr.error.message) ? 'supabase/schema.sql erneut ausführen' : cr.error.message));
  const room = cr.data;
  const { error } = await sb.from('chat_messages').insert({ recipient: friend.id, body: `[[call:${room}]]` });
  if (error) return toast('Anruf nicht möglich: ' + (/row-level/i.test(error.message) ? 'ihr seid nicht (mehr) befreundet oder zu viele Nachrichten' : error.message));
  const PR = await import('./online/presence.js'); const n = await PR.callSignal(friend.id, 'call');
  openWindow(room, { id: friend.id, name: friend.display_name || friend.name }, mode);
  toast(n ? `📞 Es klingelt bei ${friend.display_name || friend.name} …` : `${friend.display_name || friend.name} ist gerade nicht online – die Einladung liegt im Chat`, 4000);
}
// Beitreten (aus dem Chat oder beim Klingeln)
export async function joinCall(room, peer) { if (!/^IndooRado-[A-Za-z0-9]{24}$/.test(room) || !(await allowed())) return; const mode = await pickMode(`Anruf von ${peer?.name || 'Freund'} annehmen`); if (mode) openWindow(room, peer, mode); }
export async function hangUp(notify = true) {
  const p = call.peer;
  try { call.ch?.send({ type: 'broadcast', event: 'sig', payload: { t: 'bye', from: O.online.user?.id } }); } catch (e) { }
  try { call.pc?.close(); } catch (e) { } call.local?.getTracks().forEach(t => t.stop());
  try { if (call.ch) (await O.client()).removeChannel(call.ch); } catch (e) { }
  call.win?.remove(); Object.assign(call, { win: null, room: null, peer: null, pc: null, ch: null, local: null });
  if (notify && p?.id) { try { (await import('./online/presence.js')).callSignal(p.id, 'callend'); } catch (e) { } }
}

// Schwebendes, verschieb- und größenveränderbares Anruffenster (auch über der Fahrt) mit direkter WebRTC-Verbindung
async function openWindow(room, peer, mode = 'av') {
  await hangUp(false); call.room = room; call.peer = peer; call.mode = mode;
  let g = {}; try { g = JSON.parse(localStorage.getItem('vvCallWin') || '{}'); } catch (e) { }
  const w = document.createElement('div'); w.className = 'callwin'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Videoanruf');
  Object.assign(w.style, { width: (g.w || 340) + 'px', height: (g.h || 260) + 'px', left: (g.x ?? Math.max(8, innerWidth - (g.w || 340) - 16)) + 'px', top: (g.y ?? 80) + 'px' });
  w.innerHTML = `<div class="cwhead"><span class="cwt">📹 ${esc(peer?.name || 'Anruf')} <small class="cwst">verbinde …</small></span><span class="row"><button class="btn xs ghost" data-cw="lobby" title="Zur Gruppenfahrt einladen">👥</button><button class="btn xs ghost" data-cw="jitsi" title="Klappt die direkte Verbindung nicht: über Jitsi in neuem Fenster">↗</button><button class="btn xs danger" data-cw="end" title="Auflegen">✕</button></span></div>
    <div class="cwsas" hidden title="Sicherheitscode: Seht ihr beide dieselbe Zahl, ist die Verbindung Ende-zu-Ende verschlüsselt und niemand sitzt dazwischen – auch kein Server."></div>
    <div class="cwbody"><video class="cwremote" autoplay playsinline></video><video class="cwlocal" autoplay playsinline muted></video><div class="cwwait">Warte auf ${esc(peer?.name || 'deinen Freund')} …</div>
    <div class="cwctl">${mode !== 'video' ? '<button class="btn xs" data-cw="mic" title="Mikrofon an/aus">🎙️</button>' : ''}${mode !== 'audio' ? '<button class="btn xs" data-cw="cam" title="Kamera an/aus">📷</button>' : ''}</div></div>`;
  document.body.appendChild(w); call.win = w;
  const st = t => { const e = w.querySelector('.cwst'); if (e) e.textContent = t; };
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
    if (b.dataset.cw === 'jitsi') { window.open(`https://${JITSI}/${encodeURIComponent(room)}`, '_blank', 'noopener'); return; }
    if (b.dataset.cw === 'lobby') return inviteToLobby();
    if (b.dataset.cw === 'mic' || b.dataset.cw === 'cam') { const tr = call.local?.getTracks().filter(t => t.kind === (b.dataset.cw === 'mic' ? 'audio' : 'video')) || []; tr.forEach(t => t.enabled = !t.enabled); b.classList.toggle('off', tr.length && !tr[0].enabled); }
  });
  // Kamera und Mikrofon
  const want = { audio: mode !== 'video' ? { echoCancellation: true, noiseSuppression: true } : false, video: mode !== 'audio' ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } : false };
  try { call.local = await navigator.mediaDevices.getUserMedia(want); }
  catch (e) { toast(`Kein Zugriff auf ${mode === 'audio' ? 'das Mikrofon' : mode === 'video' ? 'die Kamera' : 'Kamera/Mikrofon'}: ${e.message}`, 5000); return hangUp(false); }
  if (call.room !== room) return;
  if (mode === 'audio') w.querySelector('.cwlocal').remove(); else w.querySelector('.cwlocal').srcObject = call.local;
  // Direkte Verbindung mit „perfekter Aushandlung“: der Höflichere (größere Nutzer-ID) gibt bei gleichzeitigen Angeboten nach
  const me = O.online.user.id, polite = me > (peer?.id || ''), pc = call.pc = new RTCPeerConnection({ iceServers: ICE });
  let makingOffer = false, ignoreOffer = false, started = false;
  const sb = await O.client(); await O.realtimeAuth().catch(() => { });
  const ch = call.ch = sb.channel('call:' + room, { config: { private: true, broadcast: { self: false } } });
  const send = payload => ch.send({ type: 'broadcast', event: 'sig', payload: { ...payload, from: me } });
  const start = () => { if (started) return; started = true; for (const t of call.local.getTracks()) pc.addTrack(t, call.local); };
  pc.onnegotiationneeded = async () => { try { makingOffer = true; await pc.setLocalDescription(); send({ desc: pc.localDescription.toJSON() }); } catch (e) { console.warn('Anruf', e); } finally { makingOffer = false; } };
  pc.onicecandidate = ({ candidate }) => { if (candidate) send({ cand: candidate.toJSON() }); };
  // Gegenüber ohne Kamera: Hinweis statt schwarzem Bild
  const showRemote = st => { const v = w.querySelector('.cwremote'), hasV = st.getVideoTracks().length > 0, wait = w.querySelector('.cwwait'); if (v.srcObject !== st) v.srcObject = st; v.hidden = !hasV;
    if (hasV) wait?.remove(); else if (wait) wait.innerHTML = `🎙️ ${esc(peer?.name || 'Dein Freund')} ist nur mit Ton dabei`; else { const d = document.createElement('div'); d.className = 'cwwait'; d.innerHTML = `🎙️ ${esc(peer?.name || 'Dein Freund')} ist nur mit Ton dabei`; w.querySelector('.cwbody').prepend(d); } };
  pc.ontrack = ({ streams, track }) => { const st = streams[0] || new MediaStream([track]); showRemote(st); st.onaddtrack = () => showRemote(st); };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') sas(pc).then(c => { const e = w.querySelector('.cwsas'); if (c && e) { e.hidden = false; e.innerHTML = `🔒 Sicherheitscode <b class="num">${c}</b> <span class="small">– sieht ${esc(peer?.name || 'dein Freund')} dieselbe Zahl?</span>`; } });
    st({ connecting: 'verbinde …', connected: 'verbunden', disconnected: 'Verbindung wackelt …', failed: 'keine direkte Verbindung', closed: 'beendet' }[s] || s);
    if (s === 'failed') toast('Keine direkte Verbindung möglich (strenges Netzwerk). Tipp: ↗ öffnet den Anruf über Jitsi in einem neuen Fenster.', 7000);
  };
  ch.on('broadcast', { event: 'sig' }, async ({ payload: m }) => {
    if (!m || m.from !== peer?.id || call.room !== room) return; // nur der eingeladene Freund
    try {
      if (m.t === 'hello') { if (!m.reply) send({ t: 'hello', reply: true }); start(); return; }
      if (m.t === 'bye') { toast(`📴 ${peer.name} hat aufgelegt`); return hangUp(false); }
      if (m.desc) {
        const collision = m.desc.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
        ignoreOffer = !polite && collision; if (ignoreOffer) return;
        await pc.setRemoteDescription(m.desc);
        if (m.desc.type === 'offer') { start(); await pc.setLocalDescription(); send({ desc: pc.localDescription.toJSON() }); }
      } else if (m.cand) { try { await pc.addIceCandidate(m.cand); } catch (e) { if (!ignoreOffer) throw e; } }
    } catch (e) { console.warn('Anruf-Signal', e); }
  });
  ch.subscribe(stt => { if (stt === 'SUBSCRIBED') send({ t: 'hello' }); else if (stt === 'CHANNEL_ERROR' || stt === 'TIMED_OUT') st('Signal gestört – supabase/schema.sql aktuell?'); });
}
// Sicherheitscode aus den Schlüssel-Fingerabdrücken beider Geräte (DTLS): gleich auf beiden Seiten, wenn niemand dazwischen sitzt
async function sas(pc) {
  try {
    const fp = sdp => (String(sdp).match(/a=fingerprint:sha-256 ([0-9A-F:]+)/i) || [])[1]?.toUpperCase();
    const a = fp(pc.localDescription?.sdp), b = fp(pc.remoteDescription?.sdp); if (!a || !b) return null;
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode([a, b].sort().join('|'))));
    const n = ((h[0] << 16) | (h[1] << 8) | h[2]) % 1000000; return String(n).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1 $2');
  } catch (e) { return null; }
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
