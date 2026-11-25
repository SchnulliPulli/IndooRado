// Einrichtungs-Assistent beim ersten Start: Einführung und alle wichtigen Einstellungen
import { esc, toast } from './util.js';
import { profile, sel, saveProfile, saveSel } from './state.js';
import { kv } from './db.js';
import { deviceCards } from './components.js';
import { STYLES, PRESET_NAMES } from './hudlayout.js';
import { PLANS, startPlan, plan } from './plans.js';

const SW = (id, on, label) => `<label class="switch"><input type="checkbox" data-k="${id}" ${on ? 'checked' : ''}><span></span> ${label}</label>`;
const steps = [
  { t: 'Willkommen bei VeloVerse', h: () => `
    <p>Indoor-Radtraining direkt im Browser: eine 3D-Welt mit Mitfahrern, Workouts und Trainingsplänen, Steuerung deines Smart-Trainers, Level und Missionen.</p>
    <ul class="tips">
      <li><b>Fahren</b>: Strecke wählen, treten, die Fahrt startet von selbst. Virtuelle Gänge, Steigung, ERG oder Puls-Ziel.</li>
      <li><b>Trainieren</b>: Workouts und mehrwöchige Pläne passen sich an deine FTP, Kadenz und deinen Puls an.</li>
      <li><b>Spielen</b>: Mitfahrer, Sprints und Gipfel, Zieltore, ein Geist deiner Bestfahrt, XP, Missionen, Abzeichen.</li>
      <li><b>Deine Daten</b>: bleiben im Browser, auf Wunsch auch auf deinem NAS oder in OneDrive, Google Drive oder Dropbox, Fahrten gehen auf Wunsch zu Strava.</li>
    </ul><p class="small muted">Die Einrichtung dauert etwa zwei Minuten. Alles lässt sich später unter Profil ändern.</p>` },
  { t: 'Über dich', h: () => `
    <label class="f">Name<input class="inp" data-p="name" value="${esc(profile.name)}" maxlength="30"></label>
    <div class="grid2 tight"><label class="f">FTP (Watt)<input class="inp" data-p="ftp" type="number" min="50" max="600" value="${profile.ftp}"></label><label class="f">Gewicht (kg)<input class="inp" data-p="kg" type="number" min="30" max="200" step="0.5" value="${profile.kg}"></label></div>
    <div class="grid2 tight"><label class="f">Max. Puls<input class="inp" data-p="hrMax" type="number" min="120" max="230" value="${profile.hrMax}"></label><label class="f">Max. Trainerleistung (W)<input class="inp" data-p="maxW" type="number" min="200" max="2500" value="${profile.maxW}"></label></div>
    <p class="small muted">FTP unbekannt? Schätzung: etwa 2,5 W/kg für Einsteiger, 3 W/kg für regelmäßig Fahrende. Ein FTP-Test liegt unter Workouts bereit.</p>` },
  { t: 'Geräte verbinden', h: () => `<p class="small muted">Smart-Trainer, Pulsgurt, Trittfrequenz-Sensor und Zwift Click. Ohne Geräte einfach Demo-Geräte einschalten und alles ausprobieren.</p><div id="obDev"></div>`, after: box => deviceCards(box.querySelector('#obDev')) },
  { t: 'Fahrgefühl', h: () => `
    <h3 class="sub">Widerstand bei freier Fahrt</h3>
    <div class="seg" data-sel="mode">${[['gear', 'Virtuelle Gänge'], ['sim', 'Steigung'], ['erg', 'ERG fix'], ['hr', 'Puls-Ziel']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${sel.mode === k}">${l}</button>`).join('')}</div>
    <div class="form" style="margin-top:12px">
      ${SW('s:npcs', sel.npcs !== false, 'Mitfahrer auf der Strecke')}
      ${SW('s:ghost', sel.ghost !== false, 'Geist meiner Bestfahrt')}
      ${SW('s:adaptive', sel.adaptive !== false, 'Workouts adaptiv anpassen (Kadenz, Puls, Trainer)')}
      ${SW('p:ergSoft', profile.ergSoft !== false, 'Sanfter ERG-Einstieg bei großen Sprüngen')}
      ${SW('p:autoPause', profile.autoPause, 'Automatische Pause, wenn du aufhörst zu treten')}
      ${SW('p:tripleSkip', profile.tripleSkip !== false, 'Zwift Click: dreimal Plus/Minus springt im Workout vor/zurück')}
    </div>` },
  { t: 'Anzeige, Ton und Hinweise', h: () => `
    <div class="grid2 tight">
      <label class="f">Grafik<select class="inp" data-p="quality">${[['auto', 'Automatisch'], ['high', 'Hoch'], ['medium', 'Mittel'], ['low', 'Niedrig']].map(([v, l]) => `<option value="${v}" ${profile.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Stil der Anzeige<select class="inp" data-p="hudStyle">${Object.entries(STYLES).map(([v, l]) => `<option value="${v}" ${profile.hudStyle === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="f">Tageszeit und Wetter<select class="inp" data-s="time"><option value="auto">Automatisch nach Uhrzeit und Tag</option>${[['morning', 'Immer Morgen'], ['day', 'Immer Tag'], ['evening', 'Immer Abend'], ['night', 'Immer Nacht']].map(([v, l]) => `<option value="${v}" ${sel.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="form">
      ${SW('p:soundOn', profile.soundOn !== false, 'Ton (Fahrgeräusche, Umgebung, Countdown, Fanfaren)')}
      ${SW('p:tips', profile.tips !== false, 'Trainer-Tipps zu Kadenz und Fahrweise')}
      ${SW('p:drinkTips', profile.drinkTips !== false, 'Ans Trinken erinnern')}
      ${SW('p:autoShots', profile.autoShots, 'Automatische Fotos während der Fahrt')}
    </div>
    <p class="small muted">In der Fahrt lässt sich mit „Anordnen“ jede Anzeige verschieben, vergrößern, ausblenden oder ergänzen. Vorlagen: ${Object.values(PRESET_NAMES).join(', ')}.</p>` },
  { t: 'Ziel und Plan', h: () => `
    <p>Möchtest du gleich mit einem Trainingsplan starten?</p>
    <div class="obplans"><label class="obplan"><input type="radio" name="obp" value="" ${plan.active ? '' : 'checked'}><span><b>Erst mal frei fahren</b><small>Plan später unter „Pläne“ wählen</small></span></label>
    ${PLANS.map(p => `<label class="obplan" style="--pc:${p.color}"><input type="radio" name="obp" value="${p.id}" ${plan.active?.id === p.id ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.level)} · ${p.weeks.length} Wochen · ${p.perWeek}× pro Woche</small></span></label>`).join('')}</div>` },
  { t: 'Daten und Verbindungen', h: () => `
    <p>Alles wird in diesem Browser gespeichert. Zusätzlich kannst du unter <b>Profil</b>:</p>
    <ul class="tips"><li>dich mit deiner <b>Synology</b> anmelden (mit 2FA), dann liegen alle Daten auch auf dem NAS, z. B. in Synology Drive,</li><li><b>Strava</b> verbinden, dann gehen Fahrten automatisch hoch,</li><li>jederzeit eine <b>Sicherungsdatei</b> herunterladen.</li></ul>
    <p class="small muted">Die <a href="#/help">Anleitung</a> erklärt alle Funktionen und Tasten.</p>` },
];

let open = false;
export async function onboarding(force = false) {
  if (open || (!force && await kv.get('onboarded', false))) return;
  open = true;
  let i = 0, off = null;
  const w = document.createElement('div'); w.className = 'modal on onboard';
  document.body.appendChild(w);
  const read = () => {
    for (const inp of w.querySelectorAll('[data-p]')) { const k = inp.dataset.p, num = inp.type === 'number'; const v = num ? parseFloat(inp.value) : inp.value.trim(); if (num && isNaN(v)) continue; if (k === 'ftp' && v !== profile.ftp) profile.ftpHistory = [...(profile.ftpHistory || []), { date: new Date().toISOString(), ftp: v, source: 'Einrichtung' }]; profile[k] = v; }
    for (const inp of w.querySelectorAll('[data-s]')) sel[inp.dataset.s] = inp.value;
    for (const c of w.querySelectorAll('[data-k]')) { const [o, k] = c.dataset.k.split(':'); (o === 's' ? sel : profile)[k] = c.checked; }
    const seg = w.querySelector('[data-sel] [aria-pressed=true]'); if (seg) sel.mode = seg.dataset.v;
    const pp = w.querySelector('[name=obp]:checked'); if (pp) w.dataset.plan = pp.value;
    saveProfile(); saveSel();
  };
  const show = () => {
    off?.(); off = null;
    const s = steps[i];
    w.innerHTML = `<div class="card dlg obcard"><div class="obsteps">${steps.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div>
      <h2>${s.t}</h2><div class="obbody">${s.h()}</div>
      <div class="row between"><button class="btn ghost" data-a="skip">${i === 0 ? 'Überspringen' : 'Zurück'}</button><button class="btn pri" data-a="next">${i === steps.length - 1 ? 'Los geht’s' : 'Weiter'}</button></div></div>`;
    off = s.after?.(w) || null;
  };
  w.addEventListener('click', async e => {
    const seg = e.target.closest('[data-sel] [data-v]'); if (seg) { for (const b of seg.parentElement.children) b.setAttribute('aria-pressed', String(b === seg)); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    read();
    if (a === 'skip' && i === 0) return finish();
    if (a === 'skip') { i--; show(); return; }
    if (i < steps.length - 1) { i++; show(); } else finish();
  });
  const finish = async () => {
    off?.();
    if (w.dataset.plan && plan.active?.id !== w.dataset.plan) startPlan(w.dataset.plan);
    await kv.set('onboarded', true); w.remove(); open = false;
    toast('Viel Spaß mit VeloVerse!'); window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  show();
}
