// Einstellungen der Fahransicht: Anzeige, Kamera, Mitfahrer, Workout und Spiel, Umgebung, Ton, Fahrgefühl
import { $, esc, toast } from '../util.js';
import { profile, sel, saveProfile, saveSel } from '../state.js';
import { STYLES, ACCENTS, PRESET_NAMES } from '../hudlayout.js';
import { sound, music, SOUNDS, MUSIC } from '../sound.js';
import { kv } from '../db.js';

// Bausteine: Schalter, Auswahl, Schieberegler. o = 'p' (Profil) oder 's' (Fahrt-Auswahl)
const get = (o, k, d) => (o === 's' ? sel : profile)[k] ?? d;
const SW = (o, k, label, hint = '', d = true) => `<label class="switch"><input type="checkbox" data-o="${o}" data-k="${k}" ${get(o, k, d) !== false && get(o, k, d) ? 'checked' : ''}><span></span> <div class="swt">${label}${hint ? `<small class="muted">${hint}</small>` : ''}</div></label>`;
const SEL = (o, k, label, opts, d) => `<label class="f">${label}<select class="inp" data-o="${o}" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(get(o, k, d)) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
const RNG = (o, k, label, min, max, step, d, fmt) => `<label class="f">${label}: <b data-v="${k}">${fmt(get(o, k, d))}</b><input type="range" data-o="${o}" data-k="${k}" data-fmt="${k}" min="${min}" max="${max}" step="${step}" value="${get(o, k, d)}"></label>`;
const FMT = {
  hudOpacity: v => Math.round(v * 100) + ' %', npcStrength: v => (v > 0 ? '+' : '') + (+v).toFixed(1).replace('.', ',') + ' W/kg', gearDiff: v => v + ' %', simDiff: v => v + ' %',
  volMaster: v => Math.round(v * 100) + ' %', volAmb: v => Math.round(v * 100) + ' %', volFx: v => Math.round(v * 100) + ' %', drinkEvery: v => v + ' min', shotEvery: v => v + ' min',
};

const sndRow = (k, l) => { const v = profile.snd?.[k] ?? 1; return `<div class="sndrow"><span>${l}</span><input type="range" min="0" max="1.5" step="0.05" value="${v}" data-snd="${k}"><b class="num" data-sv="${k}">${Math.round(v * 100)} %</b><button class="btn xs ghost" data-pv="${k}" title="Probehören">▶</button></div>`; };

export async function render(el, params = []) {
  const sec = params[0] === 'sound' ? 'sound' : 'view';
  const hudOp = profile.hudOpacity ?? .72;
  const head = sec === 'sound'
    ? `<section class="pagehead"><h1>Ton</h1><span class="row"><a class="btn sm pri" href="#/ride">Fahrt starten</a></span></section>
  <p class="muted">Lautstärken, Musik und jedes einzelne Geräusch. In der Fahrt schaltet Taste M den Ton stumm.</p>`
    : `<section class="pagehead"><h1>Fahransicht</h1><span class="row"><a class="btn sm pri" href="#/ride">Fahrt starten</a></span></section>
  <p class="muted">Alles, was du während der Fahrt siehst und wie sie sich anfühlt. Änderungen gelten sofort und auch für die nächste Fahrt. Einzelne Anzeigen verschiebst und vergrößerst du in der Fahrt mit „Anordnen“.</p>`;
  el.innerHTML = head + (sec === 'sound' ? `
  <section class="grid2">
    <div class="card form"><h2>Ton</h2>
      ${SW('p', 'soundOn', 'Ton an', 'In der Fahrt auch mit Taste M')}
      ${RNG('p', 'volMaster', 'Gesamtlautstärke', 0, 1, .05, profile.volMaster, FMT.volMaster)}
      ${RNG('p', 'volAmb', 'Umgebung gesamt', 0, 1, .05, profile.volAmb, FMT.volAmb)}
      ${RNG('p', 'volFx', 'Effekte gesamt', 0, 1, .05, profile.volFx, FMT.volFx)}
      <h2 style="margin-top:14px">Musik</h2>
      ${SEL('p', 'music', 'Musik während der Fahrt', Object.entries(MUSIC), 'off')}
      ${SEL('p', 'musicFollow', 'Musik wird intensiver mit …', [['power', 'der Leistung (Anteil an der FTP)'], ['hr', 'dem Puls (zwischen Ruhe- und Maximalpuls)']], 'power')}
      ${RNG('p', 'volMusic', 'Lautstärke Musik', 0, 1, .05, profile.volMusic ?? .35, FMT.volMaster)}
      <p class="small muted">Die erzeugte Musik passt sich deiner Intensität an: Bei harten Intervallen kommen Hi-Hats und Arpeggios dazu, in Pausen wird sie leiser. „Eigene Musikdateien“ spielt deine Dateien in zufälliger Reihenfolge, sie bleiben nur in diesem Browser.</p>
      <div class="row"><button class="btn sm" id="rsMusTest">Musik probehören</button><label class="btn sm">Eigene Musik hinzufügen<input type="file" id="rsMusFiles" accept="audio/*" multiple hidden></label></div>
      <div class="small" id="rsMusList"></div>
    </div>
  </section>
  <section class="card form"><h2>Einzelne Geräusche</h2>
    <p class="small muted">Jeder Regler wirkt zusätzlich zur Gesamtlautstärke und zum Regler „Umgebung“ bzw. „Effekte“. 0 schaltet das Geräusch ganz ab. ▶ spielt es zur Probe.</p>
    <div class="sndgrid">
      <div><h3 class="sub">Umgebung und Fahrgeräusche</h3>${SOUNDS.amb.map(([k, l]) => sndRow(k, l)).join('')}</div>
      <div><h3 class="sub">Effekte</h3>${SOUNDS.fx.map(([k, l]) => sndRow(k, l)).join('')}</div>
    </div>
    <div class="row"><button class="btn sm ghost" id="rsSndReset">Alle Einzelregler auf 100 %</button><button class="btn sm" id="rsSnd">Probehören</button></div>
  </section>` : `
  <section class="grid2">
    <div class="card form"><h2>Anzeige</h2>
      ${SEL('p', 'hudStyle', 'Stil der Anzeige', Object.entries(STYLES), 'dark')}
      <div class="f">Akzentfarbe<div class="swatches" id="rsAcc">${ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${(profile.hudAccent || '#ff6a3d') === c}" aria-label="Farbe ${c}"></button>`).join('')}<input type="color" id="rsAccC" value="${profile.hudAccent || '#ff6a3d'}" title="Eigene Farbe"></div></div>
      ${RNG('p', 'hudOpacity', 'Deckkraft der Flächen', 0, 1, .05, hudOp, FMT.hudOpacity)}
      <div class="grid2 tight">
        <label class="f">Vorlage kleine Bildschirme<select class="inp" id="rsPreS"><option value="">– unverändert –</option>${Object.entries(PRESET_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="f">Vorlage große Bildschirme<select class="inp" id="rsPreL"><option value="">– unverändert –</option>${Object.entries(PRESET_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      </div>
      <label class="switch"><input type="checkbox" id="rsFit" ${profile.hudLayout?.large?.fit || profile.hudLayout?.small?.fit ? 'checked' : ''}><span></span> <div class="swt">Anzeigen an Fenstergröße anpassen<small class="muted">Werte, Workout und Fahrerliste wachsen und schrumpfen mit dem Fenster, z. B. am großen Fernseher</small></div></label>
      <div class="row"><button class="btn sm ghost danger" id="rsReset">Anordnung zurücksetzen</button></div>
      ${SW('p', 'hudSub', 'Zweite Datenzeile', 'Ø Leistung, NP, kJ, kcal und XP unter den Hauptwerten')}
      ${SW('p', 'xpPops', 'XP-Einblendungen', 'Kurze „+XP“-Hinweise, z. B. beim Überholen')}
      ${SW('p', 'zoneEdge', 'Leuchtrand in Zonenfarbe', 'Bildschirmrand leuchtet in der Farbe deiner Leistungszone')}
      ${SW('p', 'living', 'Lebendige Welt', 'Wolkenschatten, Wind in Bäumen und Gras, Gegenlicht, Laub, Pollen und Staub, jubelnde Zuschauer am Gipfel, glänzende nasse Straße. Auf Grafik „Niedrig“ immer aus.')}
      ${SW('p', 'fx', 'Tempo-Effekte', 'Sichtfeld weitet sich bei hohem Tempo, Tempolinien bei schnellen Abfahrten')}
    </div>
    <div class="card form"><h2>Kamera</h2>
      ${SEL('p', 'camView', 'Standardansicht', [[0, 'Verfolger'], [1, 'Weit'], [2, 'Seite'], [3, 'Vogel'], [4, 'Fahrer (Ich-Perspektive)']], 0)}
      ${SW('p', 'gateCam', 'Kameraschwenk am Zieltor', 'Kurz von vorn auf dich, wenn ein Intervall endet')}
      ${SW('p', 'sprintCam', 'Kameraschwenk beim Sprint', 'Zu Beginn einer Sprintwertung kurz von vorn')}
      ${SW('p', 'steerTilt', 'Lenken durch Neigen (Tablet)', 'Gerät nach links oder rechts kippen wechselt die Spur, z. B. in den Windschatten. Am Computer: Pfeiltasten ← →', false)}
      ${SW('p', 'fsOnRide', 'Beim Fahrtstart ins Vollbild', '', false)}
      <h2 style="margin-top:14px">Umgebung</h2>
      ${SEL('s', 'time', 'Tageszeit', [['auto', 'Automatisch (beginnt nach Uhrzeit, wechselt alle 10 bis 15 min)'], ['morning', 'Morgen'], ['day', 'Tag'], ['evening', 'Abend'], ['night', 'Nacht']], 'auto')}
      ${SEL('s', 'weather', 'Wetter', [['auto', 'Automatisch (wechselt alle 10 bis 15 min)'], ['clear', 'Klar'], ['cloudy', 'Wolken'], ['rain', 'Regen'], ['fog', 'Nebel']], 'auto')}
    </div>
  </section>
  <section class="grid2">
    <div class="card form"><h2>Mitfahrer und Gegner</h2>
      ${SW('s', 'npcs', 'Mitfahrer auf der Strecke', 'Windschatten, Überholen, Ride On, Platz im Feld')}
      ${SEL('p', 'npcCount', 'Anzahl', [['auto', 'Automatisch (nach Grafikqualität)'], [4, '4'], [8, '8'], [12, '12'], [16, '16'], [20, '20 (braucht ein starkes Gerät)']], 'auto')}
      ${RNG('p', 'npcStrength', 'Stärke gegenüber deiner Ausdauerleistung', -1, 1, .1, profile.npcStrength ?? 0, FMT.npcStrength)}
      ${SW('p', 'npcNames', 'Namen über den Fahrern')}
      ${SW('p', 'traffic', 'Autos und Lkw auf Straßen', 'Überholen ab und zu, manchmal ziemlich knapp. Nur auf asphaltierten Strecken.', false)}
      ${SW('s', 'ghost', 'Geist meiner Bestfahrt')}
      ${SEL('s', 'pacer', 'Schrittmacher', [[0, 'Aus'], [2, '2,0 W/kg'], [2.5, '2,5 W/kg'], [3, '3,0 W/kg'], [3.5, '3,5 W/kg'], [4, '4,0 W/kg']], 0)}
    </div>
    <div class="card form"><h2>Workout und Spiel</h2>
      ${SW('p', 'gates', 'Zieltore am Intervallende')}
      ${SW('p', 'powerups', 'Power-ups auf der Strecke', 'Alle 2,5 km einsammeln, mit U oder Antippen einsetzen: Feder, Aero, Windschatten-Magnet')}
      ${SW('p', 'countdown', 'Countdown-Töne 3-2-1 vor dem Intervallwechsel')}
      ${SW('p', 'tips', 'Trainer-Tipps zu Kadenz und Fahrweise')}
      ${SW('s', 'adaptive', 'Adaptive Workouts', 'Widerstand senken bei Kadenzeinbruch, Intensität senken bei Puls am Anschlag')}
      ${SW('p', 'ergSoft', 'Sanfter ERG-Einstieg', 'Große Wattsprünge über 5 Sekunden hochfahren')}
      ${SW('p', 'tripleSkip', 'Zwift Click: dreimal schnell = Intervall vor/zurück')}
      ${SW('p', 'liveShare', 'Live-Fahrt an die Companion-Ansicht senden', 'Über den NAS-Ordner alle 5 Sekunden, so siehst du die Fahrt auf dem Handy')}
    </div>
  </section>
  <section class="grid2">
    <div class="card form"><h2>Fahrgefühl</h2>
      ${SEL('s', 'mode', 'Widerstand bei freier Fahrt', [['gear', 'Virtuelle Gänge'], ['sim', 'Steigung an den Trainer'], ['erg', 'ERG, feste Wattzahl'], ['hr', 'Puls-Ziel']], 'gear')}
      ${RNG('p', 'gearDiff', 'Steigungsgefühl bei virtuellen Gängen', 25, 100, 5, profile.gearDiff, FMT.gearDiff)}
      ${RNG('p', 'simDiff', 'Steigungsgefühl im Steigungsmodus', 10, 100, 5, profile.simDiff, FMT.simDiff)}
      ${SW('p', 'autoPause', 'Automatische Pause, wenn du aufhörst zu treten')}
      ${SW('p', 'drinkTips', 'Ans Trinken erinnern')}
      ${RNG('p', 'drinkEvery', 'Erinnerung alle', 5, 40, 5, profile.drinkEvery ?? 15, FMT.drinkEvery)}
      ${SW('p', 'autoShots', 'Automatische Fotos')}
      ${RNG('p', 'shotEvery', 'Foto alle', 3, 60, 1, profile.shotEvery, FMT.shotEvery)}
    </div>
    <div class="card form"><h2>Grafik</h2>
      <p class="small muted">Grafikqualität, App-Thema und Datensicherung findest du unter <a href="#/appsettings">App</a>, Lautstärken und Musik unter <a href="#/sound">Ton</a>.</p>
    </div>
  </section>`);
  const Q = id => $(id, el) || {}; // Elemente gibt es nur im jeweiligen Abschnitt
  // Speichern bei jeder Änderung
  const store = (o, k, v) => { (o === 's' ? sel : profile)[k] = v; o === 's' ? saveSel() : saveProfile(); sound.apply(); };
  el.onchange = e => {
    const t = e.target, o = t.dataset.o, k = t.dataset.k; if (!o || !k) return;
    if (t.type === 'checkbox') store(o, k, t.checked);
    else if (t.type === 'range') store(o, k, +t.value);
    else { const n = +t.value; store(o, k, t.value !== '' && !isNaN(n) && !['hudStyle', 'quality', 'time', 'weather', 'mode', 'npcCount', 'music', 'musicFollow'].includes(k) ? n : (k === 'npcCount' && t.value !== 'auto' ? n : t.value)); }
    toast('Gespeichert', 900);
  };
  el.oninput = e => { const t = e.target; if (t.type === 'range' && t.dataset.k) { const k = t.dataset.k; $(`[data-v="${k}"]`, el).textContent = FMT[k](+t.value); store(t.dataset.o, k, +t.value); } };
  const setAcc = c => { profile.hudAccent = c; saveProfile(); for (const b of el.querySelectorAll('#rsAcc [data-c]')) b.setAttribute('aria-pressed', String(b.dataset.c === c)); };
  Q('#rsAcc').onclick = e => { const b = e.target.closest('[data-c]'); if (b) setAcc(b.dataset.c); };
  Q('#rsAccC').oninput = e => { e.stopPropagation(); setAcc(e.target.value); };
  const preset = (key, size) => { if (!key) return; profile.hudLayout ||= {}; profile.hudLayout[size] = { preset: key, fit: profile.hudLayout[size]?.fit }; saveProfile(); toast('Vorlage gilt ab der nächsten Fahrt'); };
  Q('#rsPreS').onchange = e => { e.stopPropagation(); preset(e.target.value, 'small'); };
  Q('#rsPreL').onchange = e => { e.stopPropagation(); preset(e.target.value, 'large'); };
  Q('#rsFit').onchange = e => { e.stopPropagation(); profile.hudLayout ||= {}; for (const k of ['small', 'large']) { const L = profile.hudLayout[k] ||= { w: {}, extras: [] }; L.fit = e.target.checked; } saveProfile(); toast('Gespeichert', 900); };
  Q('#rsReset').onclick = () => { profile.hudLayout = {}; saveProfile(); toast('Anordnung zurückgesetzt'); };
  Q('#rsSnd').onclick = () => { sound.unlock(); sound.fanfare(); };
  // Einzelregler
  const prevInput = el.oninput; el.oninput = e => { prevInput?.(e); const k = e.target.dataset.snd; if (!k) return; (profile.snd ||= {})[k] = +e.target.value; $(`[data-sv="${k}"]`, el).textContent = Math.round(e.target.value * 100) + ' %'; saveProfile(); };
  el.onclick = e => { const b = e.target.closest('[data-pv]'); if (b) { sound.unlock(); sound.preview(b.dataset.pv); } };
  Q('#rsSndReset').onclick = () => { profile.snd = {}; saveProfile(); render(el); };
  // Musik
  let testing = false;
  Q('#rsMusTest').onclick = async () => { sound.unlock(); if (testing) { music.stop(); testing = false; Q('#rsMusTest').textContent = 'Musik probehören'; return; } testing = true; Q('#rsMusTest').textContent = 'Musik stoppen'; await music.start(); if (!music.playing) { toast('Musik ist aus oder es sind keine eigenen Dateien da'); testing = false; Q('#rsMusTest').textContent = 'Musik probehören'; } };
  const list = async () => { const f = await kv.get('musicFiles', []); Q('#rsMusList').innerHTML = f.length ? f.map((x, i) => `<div class="row between"><span>🎵 ${esc(x.name)} <span class="muted">${(x.blob.size / 1048576).toFixed(1).replace('.', ',')} MB</span></span><button class="btn xs ghost danger" data-mdel="${i}">✕</button></div>`).join('') : '<span class="muted">Keine eigenen Musikdateien</span>'; };
  list();
  Q('#rsMusFiles').onchange = async e => { const f = await kv.get('musicFiles', []); for (const x of e.target.files) f.push({ name: x.name, type: x.type, blob: x }); await kv.set('musicFiles', f); toast(e.target.files.length + ' Datei(en) hinzugefügt'); list(); };
  Q('#rsMusList').onclick = async e => { const b = e.target.closest('[data-mdel]'); if (!b) return; const f = await kv.get('musicFiles', []); f.splice(+b.dataset.mdel, 1); await kv.set('musicFiles', f); list(); };
  const off = () => { music.stop(); window.removeEventListener('hashchange', off); }; window.addEventListener('hashchange', off);
}
