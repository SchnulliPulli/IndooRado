// Zuschauerseite (#/watch/<link>): Fahrt eines Freundes live verfolgen und anfeuern – auch ohne Konto.
// Holt alle 4 s den Stand über die Datenbankfunktion watch_get. Nichts wird gespeichert außer dem eigenen Namen (lokal).
import { $, esc, fmtKm, fmtT, toast } from '../util.js';
import * as O from '../online/client.js';

const EMO = ['👏', '🔥', '💪', '🚴', '🎉', '❤️', '⚡', '🏔️'];
let timer = null;
let stopRx = null;
export function leave() { clearInterval(timer); timer = null; stopRx?.(); stopRx = null; document.body.classList.remove('watching', 'watchtv'); }

export async function render(el, [token, mode]) {
  leave(); document.body.classList.add('watching');
  if (mode === 'tv') return renderTv(el, token);
  if (!/^[A-Za-z0-9]{20}$/.test(token || '')) { el.innerHTML = '<section class="card watch"><h1>📺 Zuschauen</h1><p class="muted">Dieser Link ist unvollständig. Bitte den ganzen Link aus der Nachricht öffnen.</p></section>'; return; }
  if (!O.configured()) { el.innerHTML = '<section class="card watch"><h1>📺 Zuschauen</h1><p class="muted">Zuschauen geht nur auf der Online-Version von IndooRado.</p></section>'; return; }
  let me = ''; try { me = localStorage.getItem('vvWatchName') || ''; } catch (e) { }
  el.innerHTML = `<section class="watch">
    <div class="card"><div class="row between"><div><div class="small muted">📺 Live zuschauen</div><h1 id="wN">…</h1><div class="small muted" id="wR"></div></div><span class="wlive" id="wSt">verbinde …</span></div>
      <div class="tiles wtiles" id="wT"></div>
      <canvas id="wProf" class="profc"></canvas>
      <div class="small muted" id="wPos"></div>
    </div>
    <div class="card"><h2>Anfeuern</h2>
      <div class="emorow">${EMO.map(e => `<button class="btn emob" data-e="${e}" aria-label="Anfeuern mit ${e}">${e}</button>`).join('')}</div>
      <label class="f">Dein Name (optional, sieht nur der Fahrer)<input class="inp" id="wMe" maxlength="20" value="${esc(me)}" placeholder="z. B. Oma"></label>
      <div class="row" id="wCall"></div>
    </div>
    <p class="small muted">Kein Konto nötig. Gespeichert wird nur deine Anfeuerung (Emoji und optional dein Name) für höchstens 10 Minuten. Der Fahrer hat diesen Link selbst geteilt und kann ihn jederzeit beenden. <a href="#/legal/datenschutz">Datenschutz</a></p>
  </section>`;
  const sb = await O.client();
  let last = null, busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const { data, error } = await sb.rpc('watch_get', { p_token: token });
      if (error) throw error;
      if (!data) { $('#wSt', el).textContent = 'beendet'; $('#wSt', el).className = 'wlive off'; $('#wR', el).textContent = 'Dieser Zuschauer-Link ist beendet oder abgelaufen.'; leave(); document.body.classList.add('watching'); return; }
      last = data; draw(el, data);
      if (data.uid && !$('#wCall', el).dataset.ok) { $('#wCall', el).dataset.ok = 1; $('#wCall', el).innerHTML = '<button class="btn pri" id="wCallB">📹 Anrufen</button>'; $('#wCallB', el).onclick = async () => { const C = await import('../call.js'); C.startCall({ id: data.uid, display_name: data.name }); }; }
    } catch (e) { $('#wSt', el).textContent = 'keine Verbindung'; }
    finally { busy = false; }
  };
  await tick(); timer = setInterval(tick, 4000);
  $('#wMe', el).oninput = e => { try { localStorage.setItem('vvWatchName', e.target.value.trim()); } catch (er) { } };
  let cool = 0;
  el.querySelector('.emorow').onclick = async e => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    if (Date.now() < cool) { toast('Kurz durchatmen 🙂', 1200); return; } cool = Date.now() + 2500;
    b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 500);
    const { data, error } = await sb.rpc('watch_cheer', { p_token: token, p_emoji: b.dataset.e, p_name: $('#wMe', el).value.trim() });
    toast(error ? 'Ging gerade nicht' : data ? `${b.dataset.e} geschickt!` : 'Gerade sehr viele Anfeuerungen – gleich nochmal', 1600);
  };
}

function draw(el, w) {
  const s = w.state || {}, age = (Date.now() - new Date(w.updated)) / 1000;
  if ($('#wN', el)) {
  $('#wN', el).textContent = w.name || 'Fahrer';
  $('#wR', el).textContent = s.route ? `${s.route}${s.wo ? ' · Workout: ' + s.wo : ''}` : 'Wartet auf den Start …';
  const st = s.state === 'ended' ? ['beendet', 'off'] : age > 30 ? ['keine Daten', 'off'] : s.state === 'riding' ? ['● LIVE', ''] : s.state === 'paused' || s.state === 'auto' ? ['Pause', 'pause'] : ['bereit', 'pause'];
  $('#wSt', el).textContent = st[0]; $('#wSt', el).className = 'wlive ' + st[1];
  const tiles = [[s.v != null ? String(s.v).replace('.', ',') : '–', 'km/h'], [s.p ?? '–', 'Watt'], [fmtKm(s.odo || 0), 'km'], [s.asc ?? 0, 'Hm'], [fmtT(s.t || 0), 'Zeit']];
  if (s.hr) tiles.splice(2, 0, [s.hr, 'Puls']);
  if (s.cad) tiles.splice(2, 0, [s.cad, 'U/min']);
  $('#wT', el).innerHTML = tiles.map(([v, l]) => `<div class="tile"><b class="num">${esc(String(v))}</b><span>${l}</span></div>`).join('');
  } // Ende normale Zuschauerseite (die Fernseher-Anzeige hat eigene Kacheln)
  $('#wPos', el).textContent = s.total ? `${s.grade != null ? 'Steigung ' + String(s.grade).replace('.', ',') + ' % · ' : ''}${s.loop ? 'Runde' : 'noch ' + fmtKm(Math.max(0, s.total - (s.d || 0))) + ' km'}` : '';
  // Höhenprofil mit Position
  const c = $('#wProf', el), P = s.prof; if (!c || !P?.length) return;
  const dpr = devicePixelRatio || 1, W = c.clientWidth || 600, H = 110; c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const mn = Math.min(...P), mx = Math.max(...P, mn + 20), y = v => H - 8 - (v - mn) / (mx - mn) * (H - 24), x = i => i / (P.length - 1) * W;
  g.beginPath(); g.moveTo(0, H); P.forEach((v, i) => g.lineTo(x(i), y(v))); g.lineTo(W, H); g.closePath();
  g.fillStyle = 'rgba(255,106,61,.25)'; g.fill(); g.strokeStyle = '#ff6a3d'; g.lineWidth = 2; g.beginPath(); P.forEach((v, i) => i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))); g.stroke();
  const f = Math.min(1, Math.max(0, (s.d || 0) / s.total)), px = f * W, pi = f * (P.length - 1), pv = P[Math.floor(pi)] + (P[Math.min(P.length - 1, Math.floor(pi) + 1)] - P[Math.floor(pi)]) * (pi % 1);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(px, y(pv), 6, 0, 7); g.fill(); g.strokeStyle = '#ff6a3d'; g.lineWidth = 3; g.stroke();
}

/* ---------- Große Anzeige für den Fernseher (#/watch/<link>/tv) ----------
   Für Chromecast, Fire TV, Android TV, Smart-TV-Browser. Keine Bedienung nötig, aktualisiert sich alle 2 s. */
async function renderTv(el, token) {
  document.body.classList.add('watchtv');
  if (!/^[A-Za-z0-9]{20}$/.test(token || '') || !O.configured()) { el.innerHTML = '<section class="tvw"><h1>📺 IndooRado</h1><p>Link ungültig.</p></section>'; return; }
  el.innerHTML = `<section class="tvw"><header><div><span class="tvlive" id="tSt">verbinde …</span> <b id="tN">IndooRado</b> <span class="tvr" id="tR"></span></div><div class="tvclock num" id="tClock"></div></header>
    <div class="tvmain"><div class="tvvid" id="tVid" hidden><video muted playsinline autoplay></video><span class="tvvidst" id="tVidSt"></span></div>
    <div class="tvside"><div class="tvbig" id="tBig"></div><div class="tviv" id="tIv" hidden></div></div></div>
    <canvas id="wProf" class="tvprof"></canvas><div class="tvpos" id="wPos"></div><div class="tvdiag small muted" id="tVidDiag"></div></section>`;
  // Live-Bild der Fahrt (3D-Welt bzw. Videofahrt) vom Fahrgerät, sobald es sendet
  const sec = el.querySelector('.tvw'), vbox = $('#tVid', el);
  stopRx = (await import('../tvstream.js')).startReceiver(token, vbox.querySelector('video'), (st, txt) => {
    if (!el.isConnected) return;
    if (st === 'info') { const d = $('#tVidDiag', el); if (d) d.textContent = '📺 ' + txt; return; }
    if (st === 'live') { vbox.hidden = false; sec.classList.add('withvid'); $('#tVidSt', el).textContent = ''; }
    else if (st === 'lost') { $('#tVidSt', el).textContent = 'Bild wird neu verbunden …'; }
    else if (st === 'none' && !sec.classList.contains('withvid')) vbox.hidden = true;
  });
  try { document.documentElement.requestFullscreen?.().catch(() => { }); } catch (e) { }
  const sb = await O.client(); let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      $('#tClock', el).textContent = new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' });
      const { data, error } = await sb.rpc('watch_get', { p_token: token }); if (error) throw error;
      if (!data) { $('#tSt', el).textContent = 'beendet'; $('#tSt', el).className = 'tvlive off'; $('#tBig', el).innerHTML = '<div class="tvend">Die Fahrt ist beendet. Danke fürs Zuschauen! 👋</div>'; leave(); document.body.classList.add('watching', 'watchtv'); return; }
      const s = data.state || {}, age = (Date.now() - new Date(data.updated)) / 1000;
      $('#tN', el).textContent = data.name || 'Fahrer'; $('#tR', el).textContent = s.route ? '· ' + s.route : '';
      const st = s.state === 'ended' ? ['beendet', 'off'] : age > 30 ? ['keine Daten', 'off'] : s.state === 'riding' ? ['● LIVE', ''] : ['Pause', 'pause'];
      $('#tSt', el).textContent = st[0]; $('#tSt', el).className = 'tvlive ' + st[1];
      const zc = s.p && s.ftp ? zoneColorOf(s.p / s.ftp) : '#fff';
      $('#tBig', el).innerHTML = [[s.p ?? '–', 'Watt', zc], [s.v != null ? String(s.v).replace('.', ',') : '–', 'km/h'], [s.cad ?? '–', 'U/min'], [fmtKm(s.odo || 0), 'km'], [s.asc ?? 0, 'Hm'], [fmtT(s.t || 0), 'Zeit']]
        .map(([v, l, c]) => `<div class="tvt"><b class="num" ${c ? `style="color:${c}"` : ''}>${esc(String(v))}</b><span>${l}</span></div>`).join('');
      const iv = s.iv, ib = $('#tIv', el); ib.hidden = !iv;
      if (iv) ib.innerHTML = `<span>🏋️ ${esc(s.wo || 'Workout')} · Intervall ${iv.i}/${iv.n}${iv.txt ? ' · ' + esc(iv.txt) : ''}</span><b class="num">${iv.tg ? iv.tg + ' W · ' : ''}noch ${fmtT(iv.left)}</b>`;
      draw(el, data);
    } catch (e) { $('#tSt', el).textContent = 'keine Verbindung'; $('#tSt', el).className = 'tvlive off'; }
    finally { busy = false; }
  };
  await tick(); timer = setInterval(tick, 2000);
}
const zoneColorOf = r => r < .56 ? '#9aa7b3' : r < .76 ? '#3fa7f5' : r < .91 ? '#4fd18b' : r < 1.06 ? '#f5c542' : r < 1.21 ? '#ff8a3d' : '#ef4458';

/* ---------- indoorado.de/tv: Code vom Handy eingeben ---------- */
export async function renderCode(el) {
  leave(); document.body.classList.add('watching', 'watchtv');
  el.innerHTML = `<section class="tvw tvcodepage"><h1>📺 IndooRado auf dem Fernseher</h1>
    <p>Starte auf dem Handy oder PC eine Fahrt und tippe dort auf <b>⋯ › Auf Fernseher</b>. Gib dann hier den angezeigten Code ein:</p>
    <form id="tvF" class="row"><input class="inp tvcodein num" id="tvC" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD 1234" aria-label="Code"><button class="btn pri">Anzeigen</button></form>
    <p class="small muted" id="tvMsg">Mit der Fernbedienung: Pfeiltasten und OK.</p></section>`;
  const inp = $('#tvC', el); inp.focus();
  $('#tvF', el).onsubmit = async e => {
    e.preventDefault(); const code = inp.value.replace(/[^A-Za-z0-9]/g, ''); const msg = $('#tvMsg', el);
    if (code.length !== 8) { msg.textContent = 'Der Code hat 8 Zeichen.'; return; }
    if (!O.configured()) { msg.textContent = 'Diese Version ist nicht mit dem Online-Dienst verbunden.'; return; }
    msg.textContent = 'Suche Fahrt …';
    try { const { data, error } = await (await O.client()).rpc('watch_code', { p_code: code }); if (error) throw error; if (!data) { msg.textContent = 'Keine laufende Fahrt mit diesem Code gefunden.'; return; } location.hash = '#/watch/' + data + '/tv'; }
    catch (er) { msg.textContent = /viele/i.test(er.message) ? 'Zu viele Versuche, bitte eine Minute warten.' : 'Verbindung fehlgeschlagen: ' + er.message; }
  };
}
