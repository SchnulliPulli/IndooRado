// Wiederverwendbare Bausteine der Oberfläche
import { esc, bus, fmtKm, fmtDur, fmtDate, fmtT } from './util.js';
import { KINDS, status, devs, connect, disconnect, support, demo, setDemo, reconnectKnown, click } from './ble.js';
import { live, levelOf, progress } from './state.js';
import { titleOf } from './game.js';

// Karte der Wochenmissionen
export function missionCard(ms) {
  return `<div class="missions">${ms.map(m => `<div class="mission ${m.done ? 'done' : ''}"><span class="mi">${m.done ? '✅' : m.icon}</span><div style="flex:1"><div class="row between small"><b>${esc(m.text)}</b><span class="muted num">+${m.xp} XP</span></div><div class="bar"><i style="width:${(m.frac * 100).toFixed(1)}%"></i></div><div class="small muted num">${Math.floor(Math.min(m.v, m.goal))} / ${m.goal}</div></div></div>`).join('')}</div>`;
}

export const ICON = {
  trainer: '<svg viewBox="0 0 24 24"><circle cx="7" cy="16" r="4"/><path d="M7 16 12 7h5M12 7l4 9M15 4h3"/><path d="M14 16h6l1 4H11z"/></svg>',
  hr: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z"/><path d="M5 12h3l2-3 3 6 2-3h4"/></svg>',
  cad: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 12 17 7M12 12v-3"/><circle cx="12" cy="12" r="1.5"/></svg>',
  click: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4M10 9h4M10 16h4"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg>',
  ride: '<svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="m6 17 4-8h5l3 8M10 9 9 6H7M15 9l-3 8"/></svg>',
  workout: '<svg viewBox="0 0 24 24"><path d="M3 20V14h3v6M8 20V9h3v11M13 20v-8h3v8M18 20V5h3v15"/></svg>',
  plan: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 14l2 2 4-4"/></svg>',
  route: '<svg viewBox="0 0 24 24"><path d="M3 19c4-1 3-6 7-6s3 5 7 4 3-8 4-10"/><circle cx="3" cy="19" r="1.5"/><circle cx="21" cy="7" r="1.5"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4M12 8v4l3 2"/></svg>',
  progress: '<svg viewBox="0 0 24 24"><path d="M4 19h16"/><path d="m5 15 4-4 3 3 7-7"/><path d="M15 7h4v4"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  devices: '<svg viewBox="0 0 24 24"><path d="m7 7 10 10-5 4V3l5 4L7 17"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  view: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 20h8"/></svg>',
};

const unit = { trainer: 'W', hr: 'bpm', cad: 'rpm' };
function liveVal(kind) {
  if (kind === 'trainer') return live.fresh ? Math.round(live.power) : '–';
  if (kind === 'hr') return live.heart ?? '–';
  if (kind === 'cad') return live.cadence != null ? Math.round(live.cadence) : '–';
  return click.lastId ? 'Taste ' + click.lastId : 'bereit';
}
const stText = { off: 'Nicht verbunden', busy: 'Verbinde …', on: 'Verbunden', error: 'Verbindung verloren, versuche neu', demo: 'Demo' };

// Gerätekarten mit Live-Werten
export function deviceCards(el) {
  const sup = support();
  el.innerHTML = `
    ${sup.ok ? '' : `<div class="warn"><b>Bluetooth ist hier nicht verfügbar.</b> ${esc(sup.text)}<div class="small" style="margin-top:6px">Ohne Geräte kannst du alles im Demo-Modus ausprobieren.</div></div>`}
    <div class="devgrid">${Object.keys(KINDS).map(k => `
      <div class="devcard" data-kind="${k}">
        <div class="devicon">${ICON[k]}</div>
        <div class="devinfo"><div class="devname">${KINDS[k].label}</div><div class="devstate small"></div></div>
        <div class="devval num"></div>
        <div class="devbtns"><button class="btn sm pri" data-act="conn">Verbinden</button><button class="btn sm ghost" data-act="disc">Trennen</button></div>
      </div>`).join('')}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn sm" data-act="known">Bekannte Geräte suchen</button>
      <label class="switch"><input type="checkbox" data-act="demo" ${demo.on ? 'checked' : ''}><span></span> Demo-Geräte</label>
      ${demo.on ? `<label class="small muted row" style="gap:6px">Demo-Kadenz <input type="range" min="0" max="120" value="${demo.cad}" data-act="dcad" style="width:110px"></label>` : ''}
    </div>`;
  const upd = () => {
    for (const card of el.querySelectorAll('.devcard')) {
      const k = card.dataset.kind, st = status[k], d = devs[k];
      card.dataset.st = st;
      card.querySelector('.devstate').textContent = (d?.device?.name ? d.device.name + ' · ' : (st === 'off' ? KINDS[k].hint + ' · ' : '')) + stText[st] + (d?.battery != null ? ` · Akku ${d.battery} %` : '');
      const v = liveVal(k);
      card.querySelector('.devval').innerHTML = (st === 'on' || st === 'demo') ? `${esc(v)}${unit[k] && v !== '–' ? `<small> ${unit[k]}</small>` : ''}` : '';
      card.querySelector('[data-act=conn]').hidden = st === 'on' || st === 'busy';
      card.querySelector('[data-act=disc]').hidden = !d;
    }
  };
  el.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const k = b.closest('.devcard')?.dataset.kind;
    if (b.dataset.act === 'conn') connect(k);
    if (b.dataset.act === 'disc') disconnect(k);
    if (b.dataset.act === 'known') reconnectKnown().then(n => { if (!n) bus.emit('toast', 'Keine bekannten Geräte gespeichert oder der Browser unterstützt das nicht.'); });
  };
  el.onchange = e => { if (e.target.dataset.act === 'demo') { setDemo(e.target.checked); deviceCards(el); } };
  el.oninput = e => { if (e.target.dataset.act === 'dcad') demo.cad = +e.target.value; };
  upd();
  const offs = [bus.on('dev', upd)];
  let t = setInterval(upd, 500);
  return () => { offs.forEach(f => f()); clearInterval(t); };
}

export function levelBar() {
  const L = levelOf(progress.xp);
  return `<div class="level"><div class="lvbadge">${L.lv}</div><div style="flex:1"><div class="row between small"><span>Level ${L.lv} · <b>${titleOf(L.lv)}</b></span><span class="muted">${progress.xp - L.lo} / ${L.hi - L.lo} XP</span></div><div class="bar"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div></div></div>`;
}

export function rideRow(r) {
  return `<a class="riderow" href="#/summary/${esc(r.id)}">
    <div><div class="t">${esc(r.title)}</div><div class="small muted">${fmtDate(r.date)}</div></div>
    <div class="riderow-stats num"><span>${fmtKm(r.sum.dist)} km</span><span>${fmtDur(r.sum.dur)}</span><span>${r.sum.avgP} W</span><span>${r.sum.tss} TSS</span></div></a>`;
}

export function statTiles(items) {
  return `<div class="tiles">${items.map(([v, l, cls]) => `<div class="tile ${cls || ''}"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>`;
}
