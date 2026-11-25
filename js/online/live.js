// Live-Mitfahrer: ein Realtime-Kanal je Strecke. Jeder sendet einmal pro Sekunde Position, Tempo, Leistung und Aussehen,
// die anderen erscheinen als Fahrer in der Welt (zwischen den Paketen mit ihrem Tempo weitergerechnet).
import { online, client, loggedIn } from './client.js';

export function joinRoute(routeId, me) {
  const peers = new Map(); let ch = null, timer = null, closed = false;
  const api = {
    peers, // id -> { name, look, d, v, p, wkg, lat, t }
    onChange: null,
    leave() { closed = true; clearInterval(timer); try { ch?.unsubscribe(); } catch (e) { } peers.clear(); },
  };
  if (!loggedIn()) return api;
  (async () => {
    const sb = await client(); if (closed) return;
    ch = sb.channel('ride:' + routeId, { config: { broadcast: { self: false, ack: false }, presence: { key: online.user.id } } });
    ch.on('broadcast', { event: 'pos' }, ({ payload: m }) => {
      if (!m?.id || m.id === online.user.id) return;
      const known = peers.has(m.id);
      peers.set(m.id, { ...(peers.get(m.id) || {}), ...m, t: performance.now() });
      if (!known) api.onChange?.();
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => { if (peers.delete(key)) api.onChange?.(); });
    ch.subscribe(async st => {
      if (st !== 'SUBSCRIBED') return;
      await ch.track({ name: online.profile?.display_name || 'Fahrer', since: Date.now() });
      timer = setInterval(() => { const s = me(); if (s) ch.send({ type: 'broadcast', event: 'pos', payload: { id: online.user.id, name: online.profile?.display_name || 'Fahrer', ...s } }); }, 1000);
    });
    // Wer 10 s nichts sendet, verschwindet
    setInterval(() => { let ch2 = false; for (const [k, p] of peers) if (performance.now() - p.t > 10000) { peers.delete(k); ch2 = true; } if (ch2) api.onChange?.(); }, 3000);
  })().catch(e => console.warn('Live:', e.message));
  return api;
}
