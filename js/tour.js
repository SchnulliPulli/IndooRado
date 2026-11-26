// Interaktive Einführung in der ersten Fahrt: hebt nacheinander die wichtigsten Anzeigen hervor und erklärt sie.
// Weiter mit Tippen/Enter, Überspringen mit Esc. Später erneut über „Mehr › Einführung“.
import { profile, saveProfile } from './state.js';
const STEPS = [
  { s: '#hPw', t: 'Deine Leistung', x: 'Hier siehst du deine Watt. Die Farbe zeigt die Trainingszone, der Ring füllt sich bis zu deiner FTP.' },
  { s: '#hSpd', t: 'Tempo und Strecke', x: 'Geschwindigkeit, gefahrene Kilometer und Zeit. Bergauf wirst du langsamer, im Windschatten anderer schneller.' },
  { s: '#hGear', t: 'Virtuelle Gänge', x: 'Mit ↑/↓, den Tasten deines Click-Controllers oder hier antippen schaltest du. Schwerer Gang = mehr Widerstand.' },
  { s: '#elev', t: 'Höhenprofil', x: 'Was vor dir liegt: Anstiege, Sprints und dein Standort. Gipfel und Sprints bringen XP und Bestzeiten.' },
  { s: '#mini', t: 'Karte', x: 'Die Übersicht. Antippen öffnet die große Karte – dort kannst du zoomen und an jede Stelle beamen.' },
  { s: '#riders', t: 'Mitfahrer', x: 'Wer um dich herum fährt. Echte Spieler sind hervorgehoben, Bots kannst du mit N ein- und ausblenden.' },
  { s: '#tPause', t: 'Pause', x: 'Pausiert die Fahrt (Leertaste). Sobald du wieder trittst, geht es weiter.' },
  { s: '#tMore', t: 'Mehr', x: 'Hier findest du Kamera, Wetter, Musik, Demo-Geräte, Fotos, Trainingsbuddy, Anzeige anordnen und Tastenkürzel.' },
  { s: '#tEnd', t: 'Beenden', x: 'Speichert die Fahrt mit Auswertung, Fotos und Bestwerten. Viel Spaß – und tritt einfach los!' },
];
let active = null;
const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); };
export function startTour(root = document, { onEnd } = {}) {
  if (active) return; const steps = STEPS.map(s => ({ ...s, el: root.querySelector(s.s) })).filter(s => visible(s.el));
  if (!steps.length) return;
  const box = document.createElement('div'); box.className = 'tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-live', 'polite');
  box.innerHTML = '<div class="tour-hole"></div><div class="tour-tip"><b class="tour-t"></b><p class="tour-x"></p><div class="row between"><span class="small muted tour-n"></span><span class="row"><button class="btn sm" data-tour="skip">Überspringen</button><button class="btn sm pri" data-tour="next">Weiter</button></span></div></div>';
  document.body.appendChild(box);
  let i = 0;
  const show = () => {
    const st = steps[i], el = st.el.closest('.w, .hudw, .tbtn, .card') || st.el, r = el.getBoundingClientRect(), pad = 6;
    Object.assign(box.querySelector('.tour-hole').style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    box.querySelector('.tour-t').textContent = st.t; box.querySelector('.tour-x').textContent = st.x; box.querySelector('.tour-n').textContent = `${i + 1} / ${steps.length}`;
    box.querySelector('[data-tour="next"]').textContent = i === steps.length - 1 ? 'Los geht’s' : 'Weiter';
    const tip = box.querySelector('.tour-tip'), tw = Math.min(340, innerWidth - 24); tip.style.width = tw + 'px';
    const below = r.bottom + 12 + 150 < innerHeight;
    tip.style.left = Math.max(12, Math.min(innerWidth - tw - 12, r.left + r.width / 2 - tw / 2)) + 'px';
    tip.style.top = below ? r.bottom + 14 + 'px' : ''; tip.style.bottom = below ? '' : innerHeight - r.top + 14 + 'px';
    box.querySelector('[data-tour="next"]').focus();
  };
  const end = () => { box.remove(); document.removeEventListener('keydown', key, true); removeEventListener('resize', show); removeEventListener('hashchange', end); active = null; profile.tourDone = true; saveProfile(); onEnd?.(); };
  const next = () => { if (++i >= steps.length) end(); else show(); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); e.stopPropagation(); i--; show(); } else if (e.key !== 'Tab') e.stopPropagation(); };
  box.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (b?.dataset.tour === 'skip') end(); else next(); });
  document.addEventListener('keydown', key, true); addEventListener('resize', show); addEventListener('hashchange', end);
  active = box; show();
}
export const tourWanted = () => !profile.tourDone;
