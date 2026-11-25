// Live-Mitfahrer: ein privater Realtime-Kanal je Strecke (nur angemeldete Nutzer, siehe Regeln in supabase/schema.sql).
// Jeder sendet einmal pro Sekunde Position, Tempo, W/kg und Aussehen. Keine Nutzer-ID, kein Puls, keine E-Mail.
// Alles Empfangene wird streng geprüft, bevor es angezeigt wird (fremde Daten sind nie vertrauenswürdig).
import { online, client, loggedIn, access, realtimeAuth } from './client.js';

const sid = crypto.getRandomValues(new Uint32Array(2)).join('-'); // zufällige Kennung nur für diese Sitzung
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
  return { id: m.id, name: txt(m.name, 30) || 'Fahrer', d: num(m.d, 0, 1e6), v: num(m.v, 0, 30), p: num(m.p, 0, 2500), wkg: num(m.wkg, 0, 25), cad: num(m.cad, 0, 200, 85), look: cleanLook(m.look) };
}

export function joinRoute(routeId, me) {
  const peers = new Map(); let ch = null, timer = null, sweep = null, closed = false;
  const api = { peers, onChange: null, leave() { closed = true; clearInterval(timer); clearInterval(sweep); try { ch?.unsubscribe(); } catch (e) { } peers.clear(); } };
  if (!loggedIn() || online.profile?.public_profile === false || !access().ok) return api;
  (async () => {
    const sb = await client(); await realtimeAuth(); if (closed) return;
    const topic = 'ride:' + String(routeId).replace(/[^\w:-]/g, '').slice(0, 60);
    ch = sb.channel(topic, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: sid } } });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
      const m = clean(payload); if (!m || m.id === sid) return;
      const known = peers.has(m.id);
      if (!known && peers.size >= 40) return; // Obergrenze gegen Fluten
      peers.set(m.id, { ...m, t: performance.now() });
      if (!known) api.onChange?.();
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => { if (peers.delete(key)) api.onChange?.(); });
    ch.subscribe(async st => {
      if (st !== 'SUBSCRIBED') return;
      await ch.track({ since: Date.now() });
      timer = setInterval(() => { const s = me(); if (s) ch.send({ type: 'broadcast', event: 'pos', payload: { id: sid, name: online.profile?.display_name || 'Fahrer', ...s } }); }, 1000);
    });
    sweep = setInterval(() => { let c = false; for (const [k, p] of peers) if (performance.now() - p.t > 10000) { peers.delete(k); c = true; } if (c) api.onChange?.(); }, 3000);
  })().catch(e => console.warn('Live:', e.message));
  return api;
}
