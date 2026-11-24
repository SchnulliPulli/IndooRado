// Profil, Avatar, Grafik und Datensicherung
import { $, esc, toast, dialog, download } from '../util.js';
import { profile, saveProfile, progress, levelOf } from '../state.js';
import { UNLOCKS } from '../game.js';
import { backup, restore, wipe, usage, persist } from '../db.js';
import { autoQuality } from '../world.js';

const F = (id, label, type, extra = '', hint = '') => `<label class="f">${label}<input class="inp" id="${id}" type="${type}" ${extra} value="${esc(profile[id])}">${hint ? `<span class="small muted">${hint}</span>` : ''}</label>`;
const SW = (id, label) => `<label class="switch"><input type="checkbox" id="${id}" ${profile[id] ? 'checked' : ''}><span></span> ${label}</label>`;
export async function render(el) {
  const u = await usage(), pers = await persist(), lv = levelOf(progress.xp).lv;
  el.innerHTML = `
  <section class="pagehead"><h1>Profil</h1></section>
  <section class="grid2">
    <div class="card form"><h2>Fahrer</h2>
      ${F('name', 'Name', 'text', 'maxlength="30"')}
      <div class="grid2 tight">${F('ftp', 'FTP (Watt)', 'number', 'min="50" max="600" inputmode="numeric"')}${F('kg', 'Gewicht (kg)', 'number', 'min="30" max="200" step="0.5" inputmode="decimal"')}</div>
      <div class="grid2 tight">${F('hrMax', 'Max. Puls', 'number', 'min="120" max="230" inputmode="numeric"')}${F('bike', 'Radgewicht (kg)', 'number', 'min="5" max="25" step="0.5" inputmode="decimal"')}</div>
      <label class="f">Sitzposition<select class="inp" id="cda">${[['0.40', 'Aufrecht (CdA 0,40)'], ['0.32', 'Oberlenker (CdA 0,32)'], ['0.28', 'Unterlenker (CdA 0,28)'], ['0.24', 'Zeitfahren (CdA 0,24)']].map(([v, l]) => `<option value="${v}" ${+v === +profile.cda ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="small muted">Leistungszonen: ${[['Z2', .56, .75], ['Z3', .76, .9], ['Z4', .91, 1.05], ['Z5', 1.06, 1.2]].map(([z, a, b]) => `${z} ${Math.round(a * profile.ftp)}–${Math.round(b * profile.ftp)} W`).join(' · ')}</p>
    </div>
    <div class="card form"><h2>Trainer und Fahrgefühl</h2>
      <div class="grid2 tight">${F('circ', 'Radumfang (mm)', 'number', 'min="1800" max="2400" inputmode="numeric"', '700×25c: 2105, 700×28c: 2136')}${F('maxW', 'Max. Trainerleistung (W)', 'number', 'min="200" max="2500" inputmode="numeric"', 'D100: 600 W')}</div>
      <label class="f">Steigungsgefühl bei virtuellen Gängen: <b id="gdV">${profile.gearDiff} %</b><input type="range" id="gearDiff" min="25" max="100" step="5" value="${profile.gearDiff}"></label>
      <label class="f">Steigungsgefühl im Steigungsmodus: <b id="sdV">${profile.simDiff} %</b><input type="range" id="simDiff" min="10" max="100" step="5" value="${profile.simDiff}"></label>
      ${SW('autoPause', 'Automatische Pause, wenn du aufhörst zu treten')}
      ${SW('autoShots', 'Automatische Fotos während der Fahrt')}
      <label class="f">Foto-Abstand (Minuten)<input class="inp" id="shotEvery" type="number" min="3" max="60" value="${profile.shotEvery}"></label>
    </div>
  </section>
  <section class="grid2">
    <div class="card form"><h2>Avatar</h2>
      <p class="small muted">Weitere Farben schaltest du mit höheren Leveln frei (aktuell Level ${lv}).</p>
      ${['jersey', 'helmet', 'bikeColor'].map(k => `<div class="f">${{ jersey: 'Trikot', helmet: 'Helm', bikeColor: 'Rahmen' }[k]}<div class="swatches" data-k="${k}">${UNLOCKS.map(u => u.lv <= lv ? `<button style="background:${u.c}" data-c="${u.c}" aria-pressed="${profile[k] === u.c}" aria-label="${u.name || u.c}" title="${u.name || ''}"></button>` : `<button class="locked" style="background:${u.c}" disabled title="Ab Level ${u.lv}" aria-label="Gesperrt bis Level ${u.lv}"><small>${u.lv}</small></button>`).join('')}${lv >= 10 ? `<input type="color" value="${profile[k]}" data-k="${k}" title="Freie Farbe">` : '<span class="small muted">Freie Farbwahl ab Level 10</span>'}</div></div>`).join('')}
      <div class="f">Hautton<div class="swatches" data-k="skin">${['#f1c7a5', '#e3b18c', '#c99272', '#9a6a4b', '#6b4532'].map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${profile.skin === c}"></button>`).join('')}</div></div>
    </div>
    <div class="card form"><h2>Grafik</h2>
      <label class="f">Qualität der 3D-Welt<select class="inp" id="quality">${[['auto', 'Automatisch (' + ({ high: 'hoch', medium: 'mittel' }[autoQuality()]) + ')'], ['high', 'Hoch: Schatten, weite Sicht'], ['medium', 'Mittel: für Tablets'], ['low', 'Niedrig: für ältere Geräte']].map(([v, l]) => `<option value="${v}" ${profile.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <h2 style="margin-top:18px">Daten</h2>
      <p class="small muted">Gespeichert werden Profil, Einstellungen, gekoppelte Geräte und Tastenbelegung, Fahrten mit Fotos, Level, Abzeichen, Missionen, Bestzeiten, Trainingsplan-Fortschritt sowie eigene Strecken und Workouts. Die Sicherung enthält alles davon in einer Datei.</p>
      <p class="small muted">Alles wird nur in diesem Browser unter <b>${esc(location.origin)}</b> gespeichert. Unter einer anderen Adresse (z. B. NAS statt localhost) siehst du andere Daten. Sichere regelmäßig und spiele die Datei dort wieder ein.</p>
      <p class="small muted">Belegt: ${u ? (u.usage / 1048576).toFixed(1).replace('.', ',') + ' MB' : 'unbekannt'} · Dauerhafter Speicher: ${pers ? 'ja' : 'nicht bestätigt'}</p>
      <div class="row"><button class="btn" id="bk">Sicherung herunterladen</button><label class="btn">Sicherung einspielen<input type="file" id="rs" accept=".json" hidden></label><button class="btn ghost danger" id="wp">Alles löschen</button></div>
    </div>
  </section>`;
  const num = ['ftp', 'kg', 'hrMax', 'bike', 'circ', 'maxW', 'shotEvery'];
  for (const k of ['name', ...num]) $('#' + k, el).onchange = e => { const v = num.includes(k) ? parseFloat(e.target.value) : e.target.value.trim(); if (num.includes(k) && isNaN(v)) return; if (k === 'ftp' && v !== profile.ftp) profile.ftpHistory = [...(profile.ftpHistory || []), { date: new Date().toISOString(), ftp: v, source: 'manuell' }]; profile[k] = v; saveProfile(); toast('Gespeichert', 1200); };
  $('#cda', el).onchange = e => { profile.cda = +e.target.value; saveProfile(); };
  $('#quality', el).onchange = e => { profile.quality = e.target.value; saveProfile(); };
  for (const k of ['autoPause', 'autoShots']) $('#' + k, el).onchange = e => { profile[k] = e.target.checked; saveProfile(); };
  $('#gearDiff', el).oninput = e => { profile.gearDiff = +e.target.value; $('#gdV', el).textContent = profile.gearDiff + ' %'; saveProfile(); };
  $('#simDiff', el).oninput = e => { profile.simDiff = +e.target.value; $('#sdV', el).textContent = profile.simDiff + ' %'; saveProfile(); };
  el.querySelectorAll('.swatches').forEach(sw => {
    sw.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; profile[sw.dataset.k] = b.dataset.c; saveProfile(); for (const x of sw.querySelectorAll('[data-c]')) x.setAttribute('aria-pressed', String(x === b)); };
    sw.oninput = e => { if (e.target.type === 'color') { profile[sw.dataset.k] = e.target.value; saveProfile(); } };
  });
  $('#bk', el).onclick = async () => { download('trittwerk-sicherung-' + new Date().toISOString().slice(0, 10) + '.json', await backup(), 'application/json'); };
  $('#rs', el).onchange = async e => { try { await restore(await e.target.files[0].text()); toast('Sicherung eingespielt, App wird neu geladen'); setTimeout(() => location.reload(), 1200); } catch (err) { toast('Fehler: ' + err.message, 5000); } };
  $('#wp', el).onclick = async () => { if (await dialog({ title: 'Alle Daten löschen?', html: '<p>Fahrten, Fotos, Fortschritt, eigene Strecken und Workouts werden unwiderruflich gelöscht.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Alles löschen', value: true, cls: 'danger' }] })) { await wipe(); location.reload(); } };
}
