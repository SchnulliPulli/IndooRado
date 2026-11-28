// Live-Bild der Fahrt auf dem Fernseher (WebRTC, nur Video, kein Ton, keine Kamera).
// Verbindungsaufbau über die Datenbank (tv_send/tv_recv, gebunden an den Zuschauer-Link), danach direkt Gerät → Fernseher.
// Ohne Trickle-ICE: Angebot und Antwort enthalten schon alle Verbindungswege, dadurch nur je eine Nachricht.
import * as O from './online/client.js';

const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.nextcloud.com:443'] }];
// Weiterleitung (TURN, Cloudflare) für WLANs mit Client-Isolierung oder gesperrtem UDP: Nur das angemeldete Fahrgerät
// holt kurzlebige Zugangsdaten (Supabase-Funktion „turn“, je Link begrenzt, gilt 2 h) und schickt sie dem Fernseher
// mit dem Angebot. Der Fernseher (ohne Konto) ruft die Funktion nie selbst auf.
let iceP = null, iceTok = '', iceAt = 0, iceWhy = '';
function iceFor(token) {
  if (iceP && iceTok === token && Date.now() - iceAt < 100 * 60e3) return iceP;
  iceTok = token; iceAt = Date.now();
  iceP = (async () => {
    const retry = why => { iceWhy = why; iceAt = Date.now() - 95 * 60e3; return ICE; }; // nichts bekommen: in 5 Minuten erneut
    try {
      const sb = await O.client();
      const r = await Promise.race([sb.functions.invoke('turn', { body: { tv: token } }), new Promise(res => setTimeout(() => res(null), 6000))]);
      if (!r) return retry('Zeitüberschreitung');
      if (r.error) return retry('Fehler ' + (r.error.context?.status || r.error.message || ''));
      const list = Array.isArray(r.data?.iceServers) ? r.data.iceServers.filter(x => x && x.urls) : [];
      if (!list.length) return retry(r.data?.limited ? 'Limit erreicht' : 'nicht eingerichtet');
      iceWhy = 'ok'; return [...ICE, ...list];
    } catch (e) { return retry(e.message || 'Fehler'); }
  })();
  return iceP;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const gathered = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 5000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
const rpc = async (n, a) => { const { data, error } = await (await O.client()).rpc(n, a); if (error) throw error; return data; };

/* ---------- Fahrgerät: auf Fernseher warten und das Bild senden ---------- */
const TX = { token: null, timer: null, last: 0, peers: new Map(), stream: null, getStream: null };
export function startSender(token, getStream) {
  if (TX.token === token) return; stopSender(); Object.assign(TX, { token, getStream, last: 0 });
  iceFor(token); // Weiterleitung schon vorab holen, damit das Angebot den Fernseher schnell erreicht
  const poll = async () => {
    if (!TX.token) return;
    try {
      for (const w of await rpc('tv_recv', { p_token: TX.token, p_viewer: null, p_kind: 'want', p_after: TX.last }) || []) { TX.last = Math.max(TX.last, w.id); offer(w.viewer, String(w.payload?.rid || '')).catch(e => console.warn('TV-Bild', e)); }
    } catch (e) { }
  };
  poll(); TX.timer = setInterval(poll, 2000);
}
export function stopSender() { clearInterval(TX.timer); TX.timer = null; TX.token = null; for (const p of TX.peers.values()) { try { p.close(); } catch (e) { } } TX.peers.clear(); TX.stream = null; }
async function offer(viewer, rid) {
  if (TX.peers.has(viewer)) { try { TX.peers.get(viewer).close(); } catch (e) { } TX.peers.delete(viewer); }
  if (TX.peers.size >= 2) return; // höchstens zwei Fernseher gleichzeitig (Akku, Upload)
  const st = TX.stream && TX.stream.getVideoTracks()[0]?.readyState === 'live' ? TX.stream : (TX.stream = TX.getStream?.());
  const track = st?.getVideoTracks()[0]; if (!track) return;
  const tok = TX.token, ice = await iceFor(tok); if (TX.token !== tok || TX.peers.has(viewer) || TX.peers.size >= 2) return;
  const pc = new RTCPeerConnection({ iceServers: ice }); TX.peers.set(viewer, pc);
  const snd = pc.addTrack(track, st);
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) { if (TX.peers.get(viewer) === pc) TX.peers.delete(viewer); try { pc.close(); } catch (e) { } } };
  await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
  try { const p = snd.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}]; const w = track.getSettings?.().width || 1280; p.encodings[0].maxBitrate = 1800000; p.encodings[0].maxFramerate = 24; if (w > 1280) p.encodings[0].scaleResolutionDownBy = w / 1280; p.degradationPreference = 'maintain-framerate'; await snd.setParameters(p); } catch (e) { }
  if (TX.peers.get(viewer) !== pc) return;
  // rid: gehört zu genau dieser Anfrage des Fernsehers; turn: Stand der Weiterleitung (für die Anzeige am Fernseher)
  const sent = await rpc('tv_send', { p_token: tok, p_viewer: viewer, p_kind: 'offer', p_payload: { sdp: pc.localDescription.sdp, ice: ice.slice(ICE.length), rid, turn: iceWhy || '?' } }).catch(() => false);
  if (!sent) { TX.peers.delete(viewer); pc.close(); return; }
  for (let i = 0; i < 40 && TX.peers.get(viewer) === pc; i++) {
    await wait(1000);
    const a = ((await rpc('tv_recv', { p_token: tok, p_viewer: viewer, p_kind: 'answer', p_after: 0 }).catch(() => [])) || []).filter(x => x.payload?.rid === rid);
    if (a.length) { if (TX.peers.get(viewer) === pc) await pc.setRemoteDescription({ type: 'answer', sdp: a.at(-1).payload.sdp }); return; }
  }
  if (TX.peers.get(viewer) === pc && pc.connectionState !== 'connected') { TX.peers.delete(viewer); pc.close(); }
}

/* ---------- Fernseher: Bild anfordern und anzeigen ---------- */
const TURN_TXT = { ok: 'Weiterleitung bereit', 'Limit erreicht': 'Weiterleitung: Limit erreicht', 'nicht eingerichtet': 'Weiterleitung nicht eingerichtet' };
// Weg der Verbindung (direkt im WLAN, über das Internet oder über die Weiterleitung)
async function route(pc) {
  try {
    const st = await pc.getStats(); let pair = null; const c = {};
    st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); if (r.type === 'candidate-pair' && r.selected) pair = pair || r; if (r.type === 'local-candidate' || r.type === 'remote-candidate') c[r.id] = r; });
    const t = [c[pair?.localCandidateId]?.candidateType, c[pair?.remoteCandidateId]?.candidateType];
    return t.includes('relay') ? 'über Weiterleitung' : t.includes('srflx') || t.includes('prflx') ? 'über das Internet' : t[0] ? 'direkt im WLAN' : '';
  } catch (e) { return ''; }
}
export function startReceiver(token, video, onState = () => { }) {
  const viewer = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  let pc = null, stopped = false;
  const info = t => onState('info', t);
  const run = async () => {
    while (!stopped) {
      try {
        onState('wait'); info('Bild wird beim Fahrgerät angefragt …');
        const rid = Math.random().toString(36).slice(2, 10);
        await rpc('tv_send', { p_token: token, p_viewer: viewer, p_kind: 'want', p_payload: { rid } });
        let off = null;
        for (let i = 0; i < 25 && !stopped && !off; i++) { await wait(1000); const r = ((await rpc('tv_recv', { p_token: token, p_viewer: viewer, p_kind: 'offer', p_after: 0 }).catch(() => [])) || []).filter(x => x.payload?.rid === rid); if (r.length) off = r.at(-1); }
        if (!off) { onState('none'); info('Kein Bild vom Fahrgerät (Fahrt offen und Zuschauer-Link aktiv?)'); await wait(10000); continue; }
        try { pc?.close(); } catch (e) { }
        const extra = (Array.isArray(off.payload.ice) ? off.payload.ice : []).slice(0, 4).map(x => ({ urls: [].concat(x?.urls || []).filter(u => typeof u === 'string' && /^turns?:/.test(u)).slice(0, 6), username: String(x?.username || ''), credential: String(x?.credential || '') })).filter(x => x.urls.length && x.username); // nur TURN-Einträge vom Fahrgerät übernehmen
        const turn = extra.length ? 'Weiterleitung bereit' : TURN_TXT[off.payload.turn] || 'Weiterleitung fehlt' + (off.payload.turn ? ' (' + String(off.payload.turn).slice(0, 40) + ')' : ' (alte App-Version am Fahrgerät?)');
        info('Verbinde … · ' + turn);
        pc = new RTCPeerConnection({ iceServers: [...ICE, ...extra] });
        pc.ontrack = e => { video.srcObject = e.streams[0] || new MediaStream([e.track]); video.play().catch(() => { }); };
        await pc.setRemoteDescription({ type: 'offer', sdp: off.payload.sdp });
        await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
        await rpc('tv_send', { p_token: token, p_viewer: viewer, p_kind: 'answer', p_payload: { sdp: pc.localDescription.sdp, rid } });
        // verbunden halten; bei Abbruch neu anfordern
        let t0 = Date.now(), shown = false;
        for (;;) {
          await wait(1500); if (stopped) return; const s = pc.connectionState;
          if (s === 'connected') { if (!shown) { shown = true; onState('live'); info('Live · ' + (await route(pc))); } }
          else if (s === 'failed' || s === 'closed' || s === 'disconnected' && shown || (!shown && Date.now() - t0 > 30000)) break;
        }
        onState('lost'); info(shown ? 'Verbindung abgerissen – neuer Versuch …' : 'Verbindung fehlgeschlagen · ' + turn + ' – neuer Versuch …');
        await wait(3000);
      } catch (e) { onState('none'); info('Fehler: ' + (e.message || e)); await wait(8000); }
    }
  };
  run();
  return () => { stopped = true; try { pc?.close(); } catch (e) { } };
}
