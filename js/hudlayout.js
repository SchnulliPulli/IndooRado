// Anordnung der Fahransicht: Elemente weichen sich automatisch aus, lassen sich per Drag & Drop verschieben
import { profile, saveProfile } from './state.js';

const cls = () => (innerWidth <= 820 || innerHeight <= 560) ? 'small' : 'large';
const saved = () => ((profile.hudLayout ||= {})[cls()] ||= {});
const ORDER = ['top', 'right', 'mini', 'elev', 'left', 'msg'];
const GAP = 6;

// Gespeicherte Positionen anwenden (Anteile der Fenstergröße, damit Drehen/Größenänderung passt)
export function applySaved(root) {
  const L = saved();
  for (const el of root.querySelectorAll('[data-drag]')) {
    const p = L[el.dataset.drag];
    if (p) place(el, p.x * innerWidth, p.y * innerHeight); else unplace(el);
  }
}
function place(el, x, y) {
  const r = el.getBoundingClientRect();
  x = Math.max(0, Math.min(innerWidth - r.width, x)); y = Math.max(0, Math.min(innerHeight - r.height, y));
  Object.assign(el.style, { position: 'fixed', left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', transform: 'none', translate: 'none', margin: '0' });
  el.dataset.user = '1';
}
function unplace(el) { for (const k of ['position', 'left', 'top', 'right', 'bottom', 'transform', 'translate', 'margin']) el.style[k] = ''; delete el.dataset.user; }

// Überlappungen auflösen: Elemente nacheinander platzieren, kollidierende nach unten (bzw. oben) schieben
export function arrange(root) {
  if (root.classList.contains('hudedit')) return;
  const obst = [];
  const add = el => { if (el && !el.hidden && el.offsetParent !== null) { const r = el.getBoundingClientRect(); if (r.width && r.height) obst.push(r); } };
  add(root.querySelector('.toolbar'));
  const els = ORDER.map(k => root.querySelector(`[data-drag="${k}"]`)).filter(Boolean);
  for (const el of els) if (el.dataset.user) add(el);
  for (const el of els) {
    if (el.dataset.user || el.hidden) continue;
    el.style.translate = '';
    const fromBottom = el.dataset.drag === 'mini' || el.dataset.drag === 'elev';
    let dy = 0, r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    for (let it = 0; it < 12; it++) {
      const R = { left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy };
      const hit = obst.find(o => R.left < o.right - 1 && R.right > o.left + 1 && R.top < o.bottom - 1 && R.bottom > o.top + 1);
      if (!hit) break;
      dy += fromBottom ? -(R.bottom - hit.top + GAP) : (hit.bottom - R.top + GAP);
    }
    // nicht aus dem Bild schieben
    dy = Math.max(-r.top, Math.min(innerHeight - r.bottom, dy));
    if (dy) el.style.translate = `0 ${Math.round(dy)}px`;
    obst.push({ left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy });
  }
}

// Anordnen-Modus: Ziehen mit Maus oder Finger
export function editMode(root, on, onDone) {
  root.classList.toggle('hudedit', on);
  if (!on) { root.onpointerdown = null; return; }
  for (const el of root.querySelectorAll('[data-drag]')) el.style.translate = '';
  root.onpointerdown = e => {
    const el = e.target.closest('[data-drag]'); if (!el || e.target.closest('.editbar')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    place(el, r.left, r.top); el.classList.add('grab');
    const mv = ev => place(el, ev.clientX - ox, ev.clientY - oy);
    const up = () => {
      el.classList.remove('grab'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const q = el.getBoundingClientRect(); saved()[el.dataset.drag] = { x: q.left / innerWidth, y: q.top / innerHeight }; saveProfile();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  root.querySelector('#edDone').onclick = () => { editMode(root, false); onDone?.(); };
  root.querySelector('#edReset').onclick = () => { profile.hudLayout[cls()] = {}; saveProfile(); for (const el of root.querySelectorAll('[data-drag]')) unplace(el); };
}
