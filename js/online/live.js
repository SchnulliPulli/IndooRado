// Live-Mitfahrer: ein privater Realtime-Kanal je Strecke (nur angemeldete Nutzer, siehe Regeln in supabase/schema.sql).
// Jeder sendet einmal pro Sekunde Position, Tempo, W/kg und Aussehen. Keine Nutzer-ID, kein Puls, keine E-Mail.
// Alles Empfangene wird streng geprüft, bevor es angezeigt wird (fremde Daten sind nie vertrauenswürdig).
import { online, client, loggedIn, access, realtimeAuth } from './client.js';

import { sid } from './presence.js'; // dieselbe zufällige Sitzungs-ID wie in der Lobby (Gastgeber erkennbar)
const COLOR = /^#[0-9a-f]{6}$/i;
const col = (c, d) => COLOR.test(c || '') ? c : d;
const num = (v, a, b, d = 0) => { v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const txt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const PICK = { pattern: ['plain', 'band', 'stripes', 'hoops', 'split', 'dots', 'chevron'], helmetStyle: ['road', 'aero', 'cap'], glasses: ['none', 'sport', 'round'], extra: ['none', 'crown', 'antlers', 'horn'], bike: ['road', 'city', 'gravel', 'mtb', 'cargo', 'tt'], head: ['human', 'cat', 'fox', 'panda', 'bear', 'penguin', 'frog'] };
function cleanLook(l = {}) {
  const a = l.av || {}, av = {};
  for (const k of ['jersey2', 'shorts', 'socks', 'shoes', 'hair', 'lens', 'bottleColor']) if (COLOR.test(a[k] || '')) av[k] = a[k];
  for (const k in PICK) if (PICK[k].includes(a[k])) av[k] = a[k];
  for (const k of ['beard', 'ponytail', 'bottle']) if (typeof a[k] === 'boolean') av[k] = a[k];
  return { jersey: col(l.jersey, '#ffffff'), bikeColor: col(l.bikeColor, '#e9eef2'), helmet: col(l.helmet, '#f2f4f6'), skin: col(l.skin, '#e3b18c'), av };
}
export function clean(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id.length > 40) return null;
  const T = ['morning', 'day', 'evening', 'night'], W = ['clear', 'cloudy', 'rain', 'fog'];
  const env = m.env && T.includes(m.env.time) && W.includes(m.env.weather) ? { time: m.env.time, weather: m.env.weather } : null;
  return { id: m.id, name: txt(m.name, 30) || 'Fahrer', d: num(m.d, 0, 1e6), v: num(m.v, 0, 30), p: num(m.p, 0, 2500), wkg: num(m.wkg, 0, 25), cad: num(m.cad, 0, 200, 0), look: cleanLook(m.look), env, pause: m.pause === true, odo: num(m.odo, 0, 1e7) };
}

export function joinRoute(routeId, me) {
  const peers = new Map(); let ch = null, timer = null, sweep = null, closed = false;
  const api = { peers, status: 'off', sent: 0, recv: 0, sendNow() { }, onChange: null, onEnv: null, onStatus: null, // Gezielte Nachrichten an einen Mitspieler (Ride On, Duell-Herausforderung)
    emit(t, to, data = {}) { try { ch?.send({ type: 'broadcast', event: 'mp', payload: { t, to, from: sid, name: online.profile?.display_name || 'Fahrer', ...data } }); } catch (e) { } },
    onMp: null,
    sendEnv(gid, env) { try { ch?.send({ type: 'broadcast', event: 'env', payload: { gid, from: sid, env } }); } catch (e) { } }, leave() { closed = true; clearInterval(timer); clearInterval(sweep); const c = ch; if (c) client().then(sb => sb.removeChannel(c)).catch(() => { }); peers.clear(); } };
  if (!loggedIn() || !access().ok) { api.status = 'nologin'; return api; }
  if (online.profile?.public_profile === false) { api.status = 'private'; return api; }
  (async () => {
    const sb = await client(); await realtimeAuth(); if (closed) return;
    const topic = 'ride:' + String(routeId).replace(/[^\w:-]/g, '').slice(0, 60);
    // Die Bibliothek gibt einen noch offenen (oder gerade schließenden) Kanal gleichen Namens zurück, statt einen neuen anzulegen.
    // Darum einen alten Kanal dieser Strecke erst vollständig entfernen, sonst scheitert das Beitreten still.
    const purge = async () => { for (const c of sb.getChannels().filter(c => c.topic === 'realtime:' + topic)) { try { await sb.removeChannel(c); } catch (e) { } } };
    const mk = () => { const c = sb.channel(topic, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: sid } } }); bind(c); return c; };
    const bind = ch => {
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
      const m = clean(payload); if (!m || m.id === sid) return; api.recv++;
      const known = peers.has(m.id);
      if (!known && peers.size >= 40) return; // Obergrenze gegen Fluten
      peers.set(m.id, { ...m, t: performance.now() });
      if (!known) api.onChange?.();
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => { if (peers.delete(key)) api.onChange?.(); });
    ch.on('broadcast', { event: 'mp' }, ({ payload: m }) => {
      if (!m || m.to !== sid || typeof m.from !== 'string' || m.from.length > 40 || !['rideon', 'ch'].includes(m.t)) return;
      const kind = ['chase', 'defend', 'sprint'].includes(m.kind) ? m.kind : null;
      api.onMp?.({ t: m.t, from: m.from, name: txt(m.name, 30) || 'Fahrer', kind, id: txt(m.id, 16) });
    });
    // Gruppenfahrt: Tageszeit/Wetter vom Gastgeber
    ch.on('broadcast', { event: 'env' }, ({ payload: m }) => {
      const T = ['morning', 'day', 'evening', 'night'], W = ['clear', 'cloudy', 'rain', 'fog'];
      if (!m || typeof m.gid !== 'string' || typeof m.from !== 'string' || !T.includes(m.env?.time) || !W.includes(m.env?.weather)) return;
      api.onEnv?.(m.gid, { time: m.env.time, weather: m.env.weather }, m.from);
    });
    };
    await purge(); if (closed) return;
    ch = mk();
    const setSt = st => { api.status = st; api.onStatus?.(st); };
    setSt('connecting');
    // Bei Fehlern oder Verbindungsabbruch nach kurzer Pause neu beitreten
    const sub = () => { const c = ch; let failed = false; try { c.subscribe(async (st, err) => {
      if (closed || c !== ch) return; // veralteter Kanal (nach Neuaufbau) oder Fahrt beendet
      if (st === 'SUBSCRIBED') {
        setSt('on'); clearInterval(timer); failed = false; import('./connlog.js').then(L => L.log('ok', 'Fahrt', 'Fahrt-Kanal verbunden'));
        try { await ch.track({ since: Date.now() }); } catch (e) { }
        const tx = () => { const s = me(); if (s) { api.sent++; ch.send({ type: 'broadcast', event: 'pos', payload: { id: sid, name: online.profile?.display_name || 'Fahrer', ...s } }); } };
        api.sendNow = tx; // z. B. direkt nach dem Beamen, damit die anderen einen sofort an der neuen Stelle sehen
        tx(); timer = setInterval(tx, 1000);
      } else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') && !failed) {
        failed = true; clearInterval(timer); setSt('error'); import('./connlog.js').then(L => L.log('bad', 'Fahrt', 'Fahrt-Kanal: ' + st + (err ? ' – ' + err.message : ''))); if (err) console.warn('Live:', st, err.message);
        // Erst abwarten: meist verbindet die Bibliothek den Kanal selbst wieder. Nur einen weiterhin toten Kanal ersetzen.
        setTimeout(async () => { if (closed || c !== ch) return; if (c.state === 'joined') { failed = false; return; } await purge(); await realtimeAuth().catch(() => { }); if (closed) return; ch = mk(); sub(); }, 12000);
      }
    }); } catch (e) { setSt('error'); console.warn('Live:', e.message); setTimeout(async () => { if (closed) return; await purge(); ch = mk(); sub(); }, 5000); } };
    sub();
    sweep = setInterval(() => { let c = false; for (const [k, p] of peers) if (performance.now() - p.t > 30000) { peers.delete(k); c = true; } if (c) api.onChange?.(); }, 3000);
  })().catch(e => console.warn('Live:', e.message));
  return api;
}
