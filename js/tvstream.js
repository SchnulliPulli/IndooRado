// Live-Bild der Fahrt auf dem Fernseher (WebRTC, nur Video, kein Ton, keine Kamera).
// Verbindungsaufbau über die Datenbank (tv_send/tv_recv, gebunden an den Zuschauer-Link), danach direkt Gerät → Fernseher.
// Ohne Trickle-ICE: Angebot und Antwort enthalten schon alle Verbindungswege, dadurch nur je eine Nachricht.
import * as O from './online/client.js';

const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.nextcloud.com:443'] }];
// Weiterleitung (TURN, Cloudflare) für WLANs mit Client-Isolierung oder gesperrtem UDP: Nur das angemeldete Fahrgerät
// holt kurzlebige Zugangsdaten (Supabase-Funktion „turn“, je Link begrenzt, gilt 2 h) und schickt sie dem Fernseher
// mit dem Angebot. Der Fernseher (ohne Konto) ruft die Funktion nie selbst auf.
let iceP = null, iceTok = '', iceAt = 0;
function iceFor(token) {
  if (iceP && iceTok === token && Date.now() - iceAt < 100 * 60e3) return iceP;
  iceTok = token; iceAt = Date.now();
  iceP = (async () => {
    try {
      const sb = await O.client();
      const r = await Promise.race([sb.functions.invoke('turn', { body: { tv: token } }), new Promise(res => setTimeout(() => res(null), 5000))]);
      const list = r && !r.error && Array.isArray(r.data?.iceServers) ? r.data.iceServers.filter(x => x && x.urls) : [];
      if (!list.length) iceAt = Date.now() - 95 * 60e3; // nichts bekommen: in 5 Minuten erneut versuchen
      return list.length ? [...ICE, ...list] : ICE;
    } catch (e) { iceAt = Date.now() - 95 * 60e3; return ICE; }
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
  const poll = async () => {
    if (!TX.token) return;
    try {
      for (const w of await rpc('tv_recv', { p_token: TX.token, p_viewer: null, p_kind: 'want', p_after: TX.last }) || []) { TX.last = Math.max(TX.last, w.id); offer(w.viewer).catch(e => console.warn('TV-Bild', e)); }
    } catch (e) { }
  };
  poll(); TX.timer = setInterval(poll, 3000);
}
export function stopSender() { clearInterval(TX.timer); TX.timer = null; TX.token = null; for (const p of TX.peers.values()) { try { p.close(); } catch (e) { } } TX.peers.clear(); TX.stream = null; }
async function offer(viewer) {
  if (TX.peers.has(viewer)) { try { TX.peers.get(viewer).close(); } catch (e) { } TX.peers.delete(viewer); }
  if (TX.peers.size >= 2) return; // höchstens zwei Fernseher gleichzeitig (Akku, Upload)
  const st = TX.stream && TX.stream.getVideoTracks()[0]?.readyState === 'live' ? TX.stream : (TX.stream = TX.getStream?.());
  const track = st?.getVideoTracks()[0]; if (!track) return;
  const tok = TX.token, ice = await iceFor(tok); if (TX.token !== tok || TX.peers.size >= 2) return;
  const pc = new RTCPeerConnection({ iceServers: ice }); TX.peers.set(viewer, pc);
  const snd = pc.addTrack(track, st);
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) { TX.peers.delete(viewer); try { pc.close(); } catch (e) { } } };
  await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
  try { const p = snd.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}]; const w = track.getSettings?.().width || 1280; p.encodings[0].maxBitrate = 1800000; p.encodings[0].maxFramerate = 24; if (w > 1280) p.encodings[0].scaleResolutionDownBy = w / 1280; p.degradationPreference = 'maintain-framerate'; await snd.setParameters(p); } catch (e) { }
  await rpc('tv_send', { p_token: TX.token, p_viewer: viewer, p_kind: 'offer', p_payload: { sdp: pc.localDescription.sdp, ice: ice.slice(ICE.length) } });
  for (let i = 0; i < 25 && TX.peers.get(viewer) === pc; i++) {
    await wait(1000);
    const a = (await rpc('tv_recv', { p_token: TX.token, p_viewer: viewer, p_kind: 'answer', p_after: 0 }).catch(() => [])) || [];
    if (a.length) { await pc.setRemoteDescription({ type: 'answer', sdp: a.at(-1).payload.sdp }); return; }
  }
  if (TX.peers.get(viewer) === pc && pc.connectionState !== 'connected') { TX.peers.delete(viewer); pc.close(); }
}

/* ---------- Fernseher: Bild anfordern und anzeigen ---------- */
export function startReceiver(token, video, onState = () => { }) {
  const viewer = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  let pc = null, stopped = false, lastOffer = 0;
  const run = async () => {
    while (!stopped) {
      try {
        onState('wait');
        await rpc('tv_send', { p_token: token, p_viewer: viewer, p_kind: 'want', p_payload: {} });
        let off = null;
        for (let i = 0; i < 12 && !stopped && !off; i++) { await wait(1000); const r = (await rpc('tv_recv', { p_token: token, p_viewer: viewer, p_kind: 'offer', p_after: lastOffer }).catch(() => [])) || []; if (r.length) { off = r.at(-1); lastOffer = off.id; } }
        if (!off) { onState('none'); await wait(15000); continue; } // Fahrgerät sendet (noch) kein Bild
        try { pc?.close(); } catch (e) { }
        const extra = (Array.isArray(off.payload.ice) ? off.payload.ice : []).slice(0, 4).map(x => ({ urls: [].concat(x?.urls || []).filter(u => typeof u === 'string' && /^turns?:/.test(u)).slice(0, 6), username: String(x?.username || ''), credential: String(x?.credential || '') })).filter(x => x.urls.length && x.username); // nur TURN-Einträge vom Fahrgerät übernehmen
        pc = new RTCPeerConnection({ iceServers: [...ICE, ...extra] });
        pc.ontrack = e => { video.srcObject = e.streams[0] || new MediaStream([e.track]); video.play().catch(() => { }); onState('live'); };
        await pc.setRemoteDescription({ type: 'offer', sdp: off.payload.sdp });
        await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
        await rpc('tv_send', { p_token: token, p_viewer: viewer, p_kind: 'answer', p_payload: { sdp: pc.localDescription.sdp } });
        // verbunden halten; bei Abbruch neu anfordern
        for (;;) { await wait(3000); if (stopped) return; const s = pc.connectionState; if (s === 'failed' || s === 'closed' || (s !== 'connected' && s !== 'connecting' && s !== 'new')) break; if (s === 'connected') onState('live'); }
        onState('lost');
      } catch (e) { onState('none'); await wait(8000); }
    }
  };
  run();
  return () => { stopped = true; try { pc?.close(); } catch (e) { } };
}
