// Geräte im Detail: Verbindungen, Click-Tasten anlernen, Trainertest, Protokoll
import { $, esc, bus, toast, dialog } from '../util.js';
import { deviceCards } from '../components.js';
import { click, logLines, setPower, setGrade, status, demo, devs } from '../ble.js';
import { kv } from '../db.js';
import { profile, saveProfile } from '../state.js';
import * as SN from '../sensors.js';

let off = [];
export async function render(el) {
  el.innerHTML = `
  <section class="pagehead"><h1>Geräte</h1></section>
  <section class="card"><div id="devs"></div></section>
  <section class="grid2">
    <div class="card"><h2>Click-Controller</h2>
      <p class="small muted">Click v1 funktioniert direkt. Ein Click v2 muss laut Nutzerberichten etwa alle 24 Stunden einmal in der App des Herstellers verbunden werden, sonst bleibt er gesperrt. Falls + und − vertauscht sind oder nichts passiert: Taste anlernen.</p>
      <div class="row"><button class="btn" id="lUp">+ anlernen</button><button class="btn" id="lDn">− anlernen</button><button class="btn ghost" id="lRs">Zurücksetzen</button></div>
      <p class="small" id="cmap"></p><p class="small muted" id="clast"></p>
    </div>
    <div class="card"><h2>Trainer testen</h2>
      <p class="small muted">Prüft, ob der Trainer Befehle annimmt. Vorher treten.</p>
      <div class="row"><button class="btn" data-w="100">ERG 100 W</button><button class="btn" data-w="200">ERG 200 W</button><button class="btn" data-g="0">Steigung 0 %</button><button class="btn" data-g="5">Steigung 5 %</button></div>
      <h3 class="sub">So klappt die Verbindung</h3>
      <ul class="small muted tips"><li>Andere Trainings-Apps schließen. Der D100 nimmt nur eine Verbindung an.</li><li>Den HRM-Dual anfeuchten und anlegen, sonst sendet er nicht.</li><li>Den Kadenzsensor kurz drehen, damit er aufwacht.</li><li>Auf Android braucht Chrome die Berechtigung „Geräte in der Nähe“.</li></ul>
    </div>
  </section>
  <section class="card form" id="snCard"></section>
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
  const snCard = $('#snCard', el);
  const renderSn = () => {
    const open = new Set([...snCard.querySelectorAll('details[open]')].map(d => d.dataset.k));
    snCard.innerHTML = `<div class="row between"><h2>Weitere Sensoren</h2><button class="btn pri sm" id="snAdd">+ Sensor hinzufügen</button></div>
      <p class="small muted">Powermeter, Geschwindigkeitssensor, zweiter Puls- oder Kadenzsensor, Temperatursensor oder ein ganz unbekanntes Gerät. Bekannte Standards werden automatisch gelesen. Bei unbekannten Geräten siehst du alle Messwerte als Rohdaten und ordnest ihnen selbst eine Bedeutung zu.</p>
      <div class="grid2 tight"><label class="f">Leistung kommt von<select class="inp" id="snSrc"><option value="trainer" ${profile.powerSource !== 'meter' ? 'selected' : ''}>Trainer</option><option value="meter" ${profile.powerSource === 'meter' ? 'selected' : ''}>Powermeter (falls verbunden)</option></select></label>
      <label class="f">Zusätzliche Dienst-UUIDs (optional)<input class="inp" id="snUuids" placeholder="z. B. 0000fff0-0000-1000-8000-00805f9b34fb" value="${esc(localStorage.getItem('vvSnUuids') || '')}"></label></div>
      <p class="small muted">Der Browser zeigt nur Dienste, die vorher genannt wurden. Alle Standard-Dienste und bekannte Herstellerdienste sind schon dabei. Fehlt etwas, die UUID aus der Herstellerdoku oder einer App wie nRF Connect hier eintragen (mehrere mit Komma).</p>
      ${SN.sensors.list.map(en => { const c = SN.sensors.conn.get(en.id); return `<div class="sncard" data-id="${esc(en.id)}">
        <div class="row between"><b>${esc(en.name)}</b><span class="row small"><span class="snst ${c?.status || 'off'}">${{ on: 'verbunden', busy: 'verbindet …', error: 'getrennt' }[c?.status] || 'nicht verbunden'}</span>${c?.battery != null ? `<span class="muted">🔋 ${c.battery} %</span>` : ''}<button class="btn xs" data-snre>Verbinden</button><button class="btn xs ghost danger" data-sndel>Entfernen</button></span></div>
        ${(c?.services || []).filter(sv => sv.chars.length && !/^0x180[01a]$/.test(SN.short(sv.uuid))).map(sv => `<details data-k="${esc(en.id + sv.uuid)}" ${open.has(en.id + sv.uuid) ? 'open' : ''}><summary>${esc(sv.label)} <span class="muted small">${esc(SN.short(sv.uuid))}</span></summary>
          ${sv.chars.map(ch => { const mp = (en.maps || []).find(m => m.key === ch.key); return `<div class="snchar" data-key="${esc(ch.key)}"><div class="row between small"><span>${esc(SN.short(ch.uuid))} ${ch.notify ? '· live' : ch.read ? '· lesbar' : ''}</span><code class="snhex" data-hex="${esc(ch.key)}">${SN.hexOf(c.values[ch.key])}</code></div>
            ${mp ? `<div class="small">→ <b>${esc(mp.metric === 'custom' ? mp.label : SN.METRICS[mp.metric])}</b> aus ${SN.FORMATS[mp.fmt]} ab Byte ${mp.off} × ${mp.scale}${+mp.add ? ' + ' + mp.add : ''} = <b class="num" data-dec="${esc(ch.key)}">–</b> <button class="btn xs ghost" data-unmap>Zuordnung lösen</button></div>` : `<button class="btn xs ghost" data-map>Diesem Wert eine Bedeutung geben</button>`}</div>`; }).join('')}
        </details>`).join('') || (c?.status === 'on' ? '<p class="small muted">Keine lesbaren Messwerte gefunden.</p>' : '')}
        ${c?.services?.some(sv => ['0x1818', '0x1816', '0x180d'].includes(SN.short(sv.uuid))) ? `<div class="row small">Automatisch übernehmen: ${[['power', 'Leistung'], ['cad', 'Trittfrequenz'], ['speed', 'Tempo'], ['hr', 'Puls']].map(([k, l]) => `<label class="switch sm"><input type="checkbox" data-use="${k}" ${en.use?.[k] !== false ? 'checked' : ''}><span></span> ${l}</label>`).join('')}</div>` : ''}
      </div>`; }).join('') || '<p class="small muted">Noch keine weiteren Sensoren.</p>'}`;
  };
  renderSn(); SN.loadSensors().then(renderSn);
  off.push(bus.on('sensors', renderSn));
  off.push(bus.on('sensorvalue', ({ id, key }) => {
    const c = SN.sensors.conn.get(id), v = c?.values[key], h = snCard.querySelector(`[data-hex="${CSS.escape(key)}"]`); if (h) h.textContent = SN.hexOf(v);
    const mp = (c?.entry.maps || []).find(m => m.key === key), d = snCard.querySelector(`[data-dec="${CSS.escape(key)}"]`);
    if (mp && d) { const r = SN.decode(v, mp.fmt, +mp.off || 0); d.textContent = r == null ? '–' : (+(r * (+mp.scale || 1) + (+mp.add || 0)).toFixed(2)).toLocaleString('de-DE'); }
  }));
  snCard.onchange = async e => {
    if (e.target.id === 'snSrc') { profile.powerSource = e.target.value; saveProfile(); toast('Gespeichert', 900); return; }
    if (e.target.id === 'snUuids') { localStorage.setItem('vvSnUuids', e.target.value); return; }
    const u = e.target.dataset.use; if (u) { const en = SN.sensors.list.find(x => x.id === e.target.closest('[data-id]').dataset.id); (en.use ||= {})[u] = e.target.checked; SN.updateSensor(en); }
  };
  snCard.onclick = async e => {
    if (e.target.id === 'snAdd') { try { await SN.addSensor(($('#snUuids', el).value || '').split(',')); } catch (err) { if (err.name !== 'NotFoundError') toast(err.message, 5000); } return; }
    const card = e.target.closest('[data-id]'); if (!card) return; const en = SN.sensors.list.find(x => x.id === card.dataset.id);
    if (e.target.closest('[data-sndel]')) { if (confirm('Sensor ' + en.name + ' entfernen?')) SN.removeSensor(en.id); return; }
    if (e.target.closest('[data-snre]')) { const c = SN.sensors.conn.get(en.id); if (c?.device) SN.connectSensor(en, c.device); else try { await SN.addSensor(($('#snUuids', el).value || '').split(',')); } catch (err) { } return; }
    const key = e.target.closest('[data-key]')?.dataset.key; if (!key) return;
    if (e.target.closest('[data-unmap]')) { en.maps = (en.maps || []).filter(m => m.key !== key); SN.updateSensor(en); return; }
    if (e.target.closest('[data-map]')) {
      const pr = dialog({ title: 'Messwert zuordnen', html: `<div class="form"><p class="small muted">Rohdaten gerade: <code>${SN.hexOf(SN.sensors.conn.get(en.id)?.values[key])}</code>. Tipp: Sensor bewegen oder belasten und beobachten, welche Bytes sich ändern.</p>
        <label class="f">Bedeutung<select class="inp" id="mMet">${Object.entries(SN.METRICS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="f">Name (bei eigenem Wert)<input class="inp" id="mLab" placeholder="z. B. Kerntemperatur" maxlength="24"></label>
        <div class="grid2 tight"><label class="f">Format<select class="inp" id="mFmt">${Object.entries(SN.FORMATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label class="f">ab Byte<input class="inp" id="mOff" type="number" min="0" max="19" value="0"></label></div>
        <div class="grid2 tight"><label class="f">Faktor<input class="inp" id="mSc" type="number" step="any" value="1"></label><label class="f">plus<input class="inp" id="mAdd" type="number" step="any" value="0"></label></div>
        <p class="small">Ergebnis jetzt: <b id="mPrev">–</b></p></div>`, buttons: [{ label: 'Abbrechen', value: null }, { label: 'Zuordnen', value: 'ok', cls: 'pri' }] });
      const m = { key, metric: 'power', label: '', fmt: 'u8', off: 0, scale: 1, add: 0 }, g = id => document.getElementById(id);
      const upd = () => { Object.assign(m, { metric: g('mMet').value, label: g('mLab').value.trim(), fmt: g('mFmt').value, off: +g('mOff').value || 0, scale: +g('mSc').value || 1, add: +g('mAdd').value || 0 }); const r = SN.decode(SN.sensors.conn.get(en.id)?.values[key], m.fmt, m.off); g('mPrev').textContent = r == null ? '– (Byte außerhalb der Daten)' : (+(r * m.scale + m.add).toFixed(3)).toLocaleString('de-DE'); };
      for (const id of ['mMet', 'mLab', 'mFmt', 'mOff', 'mSc', 'mAdd']) g(id).oninput = g(id).onchange = upd;
      upd(); const live = bus.on('sensorvalue', x => x.key === key && g('mPrev') && upd());
      const res = await pr; live();
      if (res !== 'ok') return;
      if (m.metric === 'custom' && !m.label) m.label = 'Wert';
      en.maps = [...(en.maps || []).filter(x => x.key !== key), m]; SN.updateSensor(en); toast('Zugeordnet');
    }
  };
  const showLog = () => { $('#log', el).textContent = logLines.join('\n') || 'Noch keine Einträge.'; };
  showLog(); off.push(bus.on('log', showLog));
}
export function leave() { off.forEach(f => f()); off = []; }
