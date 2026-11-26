// Herzschlag für die Live-Verbindung (Supabase Realtime) in einem Web Worker:
// Timer in Hintergrund-Tabs werden vom Browser stark gedrosselt, im Worker nicht – sonst trennt der Server die Verbindung.
addEventListener('message', e => {
  if (e.data.event === 'start') setInterval(() => postMessage({ event: 'keepAlive' }), e.data.interval);
});
