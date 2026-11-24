// Geräte im Detail: Verbindungen, Click-Tasten anlernen, Trainertest, Protokoll
import { $, esc, bus, toast } from '../util.js';
import { deviceCards } from '../components.js';
import { click, logLines, setPower, setGrade, status, demo, devs } from '../ble.js';
import { kv } from '../db.js';

let off = [];
export async function render(el) {
  el.innerHTML = `
  <section class="pagehead"><h1>Geräte</h1></section>
  <section class="card"><div id="devs"></div></section>
  <section class="grid2">
    <div class="card"><h2>Zwift Click</h2>
      <p class="small muted">Click v1 funktioniert direkt. Ein Click v2 muss laut Nutzerberichten etwa alle 24 Stunden einmal in der Zwift-App verbunden werden, sonst bleibt er gesperrt. Falls + und − vertauscht sind oder nichts passiert: Taste anlernen.</p>
      <div class="row"><button class="btn" id="lUp">+ anlernen</button><button class="btn" id="lDn">− anlernen</button><button class="btn ghost" id="lRs">Zurücksetzen</button></div>
      <p class="small" id="cmap"></p><p class="small muted" id="clast"></p>
    </div>
    <div class="card"><h2>Trainer testen</h2>
      <p class="small muted">Prüft, ob der Trainer Befehle annimmt. Vorher treten.</p>
      <div class="row"><button class="btn" data-w="100">ERG 100 W</button><button class="btn" data-w="200">ERG 200 W</button><button class="btn" data-g="0">Steigung 0 %</button><button class="btn" data-g="5">Steigung 5 %</button></div>
      <h3 class="sub">So klappt die Verbindung</h3>
      <ul class="small muted tips"><li>Zwift, Onelap und andere Apps schließen. Der D100 nimmt nur eine Verbindung an.</li><li>Den HRM-Dual anfeuchten und anlegen, sonst sendet er nicht.</li><li>Den Kadenzsensor kurz drehen, damit er aufwacht.</li><li>Auf Android braucht Chrome die Berechtigung „Geräte in der Nähe“.</li></ul>
    </div>
  </section>
  <section class="card"><h2>Protokoll</h2><div class="log" id="log"></div></section>`;
  off.push(deviceCards($('#devs', el)));
  const showMap = () => { const n = { up: [], down: [] }; for (const k in click.map || {}) n[click.map[k]]?.push(k); $('#cmap', el).textContent = 'Hochschalten: ' + (n.up.join(', ') || '–') + ' · Runterschalten: ' + (n.down.join(', ') || '–'); };
  showMap(); off.push(bus.on('clickmap', showMap));
  off.push(bus.on('clickpress', id => { $('#clast', el).textContent = 'Zuletzt gedrückt: ' + id; }));
  $('#lUp', el).onclick = () => { click.learn = 'up'; toast('Drücke jetzt die Taste für Hochschalten'); };
  $('#lDn', el).onclick = () => { click.learn = 'down'; toast('Drücke jetzt die Taste für Runterschalten'); };
  $('#lRs', el).onclick = async () => { await kv.set('clickmap', null); click.map = { '37:1': 'up', '37:2': 'down', '23:4096': 'up', '23:8192': 'down', '23:256': 'up', '23:512': 'down', '23:2': 'up', '23:8': 'down' }; kv.set('clickmap', click.map); showMap(); };
  el.querySelectorAll('[data-w],[data-g]').forEach(b => b.onclick = () => {
    if (status.trainer !== 'on' && !demo.on) { toast('Kein Trainer verbunden'); return; }
    if (b.dataset.w) setPower(+b.dataset.w); else setGrade(+b.dataset.g);
    toast('Gesendet');
  });
  const showLog = () => { $('#log', el).textContent = logLines.join('\n') || 'Noch keine Einträge.'; };
  showLog(); off.push(bus.on('log', showLog));
}
export function leave() { off.forEach(f => f()); off = []; }
