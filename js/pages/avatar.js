// Avatar-Designer: 3D-Vorschau zum Drehen, Farben, Trikotmuster, Helm, Brille, Bart, Zubehör und freischaltbare Extras
import * as THREE from 'three';
import { $, esc, toast } from '../util.js';
import { profile, saveProfile, progress, levelOf } from '../state.js';
import { UNLOCKS } from '../game.js';
import { Rider, AV_DEFAULT } from '../world.js';

const SKINS = ['#f6d5bd', '#f1c7a5', '#e3b18c', '#c99272', '#9a6a4b', '#6b4532', '#4a2f22'];
const HAIR = ['#1b1410', '#3a2a1e', '#6b4a2a', '#a8763e', '#d9b46a', '#e8e2d6', '#b23a2a', '#7b4fd6'];
const NEUTRAL = ['#1b1e22', '#f2f4f6', '#3b4450', '#0b3d91', '#8a1538', '#2e7d4f', '#ff6a3d', '#f5c542', '#3fa7f5', '#ff4fa3'];
// Optionen mit Mindest-Level; "egg" = nur über ein Easter Egg freischaltbar
const OPTS = {
  pattern: [['plain', 'Einfarbig', 1], ['band', 'Brustband', 1], ['stripes', 'Streifen', 2], ['hoops', 'Ringel', 3], ['split', 'Geteilt', 4], ['dots', 'Punkte', 6], ['chevron', 'Zickzack', 8]],
  helmetStyle: [['road', 'Straßenhelm', 1], ['aero', 'Aerohelm', 5], ['cap', 'Retro-Kappe', 3]],
  glasses: [['none', 'Keine', 1], ['sport', 'Sportbrille', 1], ['round', 'Rund', 3]],
  bike: [['road', '🚲 Rennrad', 1], ['city', '🧺 Hollandrad', 1], ['gravel', '🪨 Gravelbike', 3], ['mtb', '⛰️ Mountainbike', 5], ['cargo', '🐕 Lastenrad mit Hund', 8], ['tt', '⏱️ Zeitfahrrad', 12]],
  head: [['human', '🙂 Mensch', 1], ['cat', '🐱 Katze', 2], ['fox', '🦊 Fuchs', 4], ['panda', '🐼 Panda', 7], ['bear', '🐻 Bär', 12], ['penguin', '🐧 Pinguin', 'egg:roof'], ['frog', '🐸 Frosch', 'egg:logo']],
  extra: [['none', 'Nichts', 1], ['crown', 'Krone', 20], ['antlers', 'Geweih', 'egg:xmas'], ['horn', 'Einhorn', 'egg:konami']],
};

let R = null; // Vorschau-Zustand
export async function render(el) {
  // Admins (mit bestätigtem zweitem Faktor) haben alle Fahrzeuge, Zubehörteile und Stile frei
  const O = await import('../online/client.js'), admin = O.online.ready && O.loggedIn() && O.isAdmin() && !O.needsMfa();
  const lv = admin ? 9999 : levelOf(progress.xp).lv, eggs = admin ? new Proxy({}, { get: () => true }) : progress.eggs || {};
  const av = profile.av = { ...AV_DEFAULT, ...(profile.av || {}) };
  const ok = need => typeof need === 'number' ? lv >= need : !!eggs[need.slice(4)];
  const lockTxt = need => typeof need === 'number' ? `ab Level ${need}` : need === 'egg:roof' ? 'Im Himalaya über 5100 m fahren' : 'geheim';
  const colorRow = (k, label, list, cur) => `<div class="f">${label}<div class="swatches" data-k="${k}">${list.map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${cur === c}" aria-label="${c}"></button>`).join('')}<input type="color" value="${cur}" title="Eigene Farbe"></div></div>`;
  const unlockRow = (k, label) => `<div class="f">${label}<div class="swatches" data-k="${k}">${UNLOCKS.map(u => u.lv <= lv ? `<button style="background:${u.c}" data-c="${u.c}" aria-pressed="${profile[k] === u.c}" aria-label="${u.name || u.c}" title="${u.name || ''}"></button>` : `<button class="locked" style="background:${u.c}" disabled title="ab Level ${u.lv}"></button>`).join('')}</div></div>`;
  const chips = k => `<div class="chips-row" data-opt="${k}">${OPTS[k].map(([v, l, need]) => `<button class="chipbtn ${av[k] === v ? 'on' : ''}" data-v="${v}" ${ok(need) ? '' : 'disabled'} title="${ok(need) ? '' : lockTxt(need)}">${ok(need) ? '' : '🔒 '}${l}</button>`).join('')}</div>`;
  const sw = (k, l) => `<label class="switch"><input type="checkbox" data-b="${k}" ${av[k] ? 'checked' : ''}><span></span> ${l}</label>`;
  el.innerHTML = `
  <section class="pagehead"><h1>Avatar${admin ? ' <span class="prtag">🛠️ Admin: alles freigeschaltet</span>' : ''}</h1><span class="row"><button class="btn sm ghost" id="avRandom">🎲 Zufall</button><button class="btn sm ghost" id="avReset">Zurücksetzen</button></span></section>
  <section class="avlayout">
    <div class="card avstage"><canvas id="avC"></canvas><div class="avhint small muted">Ziehen zum Drehen · Mausrad oder zwei Finger zum Zoomen</div>
      <div class="row avviews"><button class="btn xs" data-cam="front">Vorne</button><button class="btn xs" data-cam="side">Seite</button><button class="btn xs" data-cam="back">Hinten</button><button class="btn xs" data-cam="face">Kopf</button><label class="switch sm"><input type="checkbox" id="avSpin" checked><span></span> Treten</label></div></div>
    <div class="avpanel">
      <div class="card form"><h2>Fahrzeug und Figur</h2>${chips('bike')}<h3 class="sub">Wer fährt?</h3>${chips('head')}<p class="small muted">Weitere Räder und Tiere gibt es mit höherem Level, ein paar nur für Entdecker.</p></div>
      <div class="card form"><h2>Trikot</h2>${unlockRow('jersey', 'Grundfarbe')}${chips('pattern')}${colorRow('jersey2', 'Musterfarbe', NEUTRAL, av.jersey2)}${colorRow('shorts', 'Hose', NEUTRAL, av.shorts)}</div>
      <div class="card form"><h2>Kopf</h2>${chips('helmetStyle')}${unlockRow('helmet', 'Helmfarbe')}${chips('glasses')}${colorRow('lens', 'Glasfarbe', ['#20262c', '#3fa7f5', '#ff6a3d', '#f5c542', '#ff4fa3', '#4fd18b'], av.lens)}
        <div class="f">Hautton<div class="swatches" data-k="skin">${SKINS.map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${profile.skin === c}"></button>`).join('')}</div></div>
        ${colorRow('hair', 'Haare und Bart', HAIR, av.hair)}<div class="row">${sw('beard', 'Bart')}${sw('ponytail', 'Zopf')}</div></div>
      <div class="card form"><h2>Rad und Zubehör</h2>${unlockRow('bikeColor', 'Rahmen')}${colorRow('socks', 'Socken', NEUTRAL, av.socks)}${colorRow('shoes', 'Schuhe', NEUTRAL, av.shoes)}
        <div class="row">${sw('bottle', 'Trinkflasche')}</div>${colorRow('bottleColor', 'Flasche', NEUTRAL, av.bottleColor)}
        <h3 class="sub">Extras</h3>${chips('extra')}<p class="small muted">Manche Extras gibt es erst mit höherem Level, andere nur für Entdecker 🥚.</p></div>
    </div>
  </section>`;

  // 3D-Vorschau
  const cv = $('#avC', el), rr = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  rr.setPixelRatio(Math.min(2, devicePixelRatio || 1)); rr.toneMapping = THREE.ACESFilmicToneMapping; rr.outputColorSpace = THREE.SRGBColorSpace; rr.shadowMap.enabled = true;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 1, .05, 50);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x404850, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: '#2b343e', roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  R = { rr, scene, cam, yaw: Math.PI - .9, pitch: .18, dist: 3.2, target: new THREE.Vector3(0, .8, 0), rider: null, crank: 0, spin: true, alive: true, last: performance.now() };
  const build = () => {
    if (R.rider) { scene.remove(R.rider.root); R.rider.root.traverse(o => { o.geometry?.dispose(); }); }
    R.rider = new Rider(profile); R.rider.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(R.rider.root);
  };
  build();
  const size = () => { const r = cv.getBoundingClientRect(); rr.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(size); ro.observe(cv); size();
  const loop = now => {
    if (!R?.alive || !document.body.contains(cv)) return;
    const dt = Math.min(.05, (now - R.last) / 1000); R.last = now;
    if (R.spin) R.crank += 85 / 60 * Math.PI * 2 * dt;
    R.rider.update(R.crank, R.spin ? 8 : 0, dt, 0);
    const cp = Math.cos(R.pitch); cam.position.set(R.target.x + Math.sin(R.yaw) * cp * R.dist, R.target.y + Math.sin(R.pitch) * R.dist, R.target.z + Math.cos(R.yaw) * cp * R.dist); cam.lookAt(R.target);
    rr.render(scene, cam); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Drehen und Zoomen
  const pts = new Map(); let pinch0 = 0, dist0 = 0;
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = R.dist; } };
  cv.onpointermove = e => {
    if (!pts.has(e.pointerId)) return; const [px, py] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; R.dist = Math.min(6, Math.max(1, dist0 * pinch0 / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1))); return; }
    R.yaw -= (e.clientX - px) * .01; R.pitch = Math.min(1.3, Math.max(-.1, R.pitch + (e.clientY - py) * .006));
  };
  cv.onpointerup = cv.onpointercancel = e => pts.delete(e.pointerId);
  cv.onwheel = e => { e.preventDefault(); R.dist = Math.min(6, Math.max(1, R.dist * (e.deltaY > 0 ? 1.1 : .9))); };
  const CAMS = { front: [Math.PI, .15, 3, .8], side: [-Math.PI / 2, .12, 3.2, .8], back: [0, .2, 3, .8], face: [Math.PI - .45, .05, 1.1, 1.38] }; // Fahrer schaut nach −z
  el.querySelector('.avviews').onclick = e => { const b = e.target.closest('[data-cam]'); if (!b) return; const [y, p, d, ty] = CAMS[b.dataset.cam]; Object.assign(R, { yaw: y, pitch: p, dist: d }); R.target.y = ty; };
  $('#avSpin', el).onchange = e => R.spin = e.target.checked;

  // Änderungen
  const save = (rebuild = true) => { saveProfile(); if (rebuild) build(); else R.rider.setColors(profile); };
  const isAv = k => k in AV_DEFAULT;
  el.querySelectorAll('.swatches[data-k]').forEach(sw => {
    const k = sw.dataset.k, set = c => { if (isAv(k)) av[k] = c; else profile[k] = c; for (const x of sw.querySelectorAll('[data-c]')) x.setAttribute('aria-pressed', String(x.dataset.c === c)); save(isAv(k) || k === 'jersey'); };
    sw.onclick = e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) set(b.dataset.c); };
    sw.oninput = e => { if (e.target.type === 'color') set(e.target.value); };
  });
  el.querySelectorAll('[data-opt]').forEach(row => row.onclick = e => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; av[row.dataset.opt] = b.dataset.v; for (const x of row.children) x.classList.toggle('on', x === b); save(); });
  el.querySelectorAll('[data-b]').forEach(c => c.onchange = () => { av[c.dataset.b] = c.checked; save(); });
  $('#avReset', el).onclick = () => { profile.av = { ...AV_DEFAULT }; saveProfile(); render(el); };
  $('#avRandom', el).onclick = () => {
    const pick = a => a[Math.random() * a.length | 0], open = k => OPTS[k].filter(o => ok(o[2])).map(o => o[0]);
    Object.assign(av, { bike: pick(open('bike')), head: Math.random() < .35 ? pick(open('head')) : 'human', pattern: pick(open('pattern')), helmetStyle: pick(open('helmetStyle')), glasses: pick(open('glasses')), jersey2: pick(NEUTRAL), shorts: pick(NEUTRAL), socks: pick(NEUTRAL), shoes: pick(NEUTRAL), hair: pick(HAIR), beard: Math.random() < .3, ponytail: Math.random() < .25 });
    const cols = UNLOCKS.filter(u => u.lv <= lv).map(u => u.c); profile.jersey = pick(cols); profile.helmet = pick(cols); profile.bikeColor = pick(cols);
    saveProfile(); render(el); toast('Neuer Look 🎲', 1200);
  };
}
export function leave() { if (R) { R.alive = false; try { R.rr.dispose(); R.rr.forceContextLoss(); } catch (e) { } R = null; } }
