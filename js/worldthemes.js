// Fantasiewelten: Dinosaurier und Vulkan, Tiefsee mit Fischschwärmen und Quallen, Zuckerland, Weltall-Kristalle.
// Wird von world.js beim Aufbau einer Strecke aufgerufen; update() animiert alles pro Bild.
import * as THREE from 'three';
import { rng } from './util.js';

const col = s => new THREE.Color(s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Punkt neben der Strecke: d (m), seitlicher Abstand off (m, + rechts), Höhe über Gelände
function beside(R, d, off, up = 0) {
  const h = R.headAt(d), x = R.xAt(d) + Math.cos(h) * off, z = R.zAt(d) + Math.sin(h) * off;
  return new THREE.Vector3(x, R.heightAt(x, z) + up, z);
}

/* ---------- Dinosaurier ---------- */
function sauropodGeo(H) {
  const g = '#6f8a5a', b = '#9cae7a', parts = [
    H.colored(box(3, 3, 6.5).translate(0, 4.6, 0), g), H.colored(box(2.6, .8, 5.5).translate(0, 3.2, 0), b),
    H.colored(box(.8, .8, 6.5).rotateX(-1.0).translate(0, 8.2, -5.4), g), H.colored(box(1, .9, 1.6).translate(0, 10.9, -7.6), g),
    H.colored(box(.9, .8, 7).rotateX(.35).translate(0, 3.8, 6.2), g),
  ];
  for (const [x, z] of [[-1.1, -2.2], [1.1, -2.2], [-1.1, 2.2], [1.1, 2.2]]) parts.push(H.colored(box(1, 3.6, 1).translate(x, 1.8, z), g));
  return H.merge(parts);
}
function trexGeo(H) {
  const g = '#7a5a3a', b = '#b08a5a', parts = [
    H.colored(box(1.8, 2, 4).rotateX(.25).translate(0, 3.4, 0), g), H.colored(box(1.4, 1.4, 2.2).translate(0, 4.7, -2.6), g),
    H.colored(box(1.3, .4, 1.9).translate(0, 4, -2.8), '#c23a2a'), H.colored(box(.9, .9, 4.5).rotateX(-.3).translate(0, 3, 3.6), g),
    H.colored(box(1.5, .7, 3).translate(0, 2.6, 0), b), H.colored(box(.3, .7, .3).translate(-.7, 3.2, -1.7), g), H.colored(box(.3, .7, .3).translate(.7, 3.2, -1.7), g),
  ];
  for (const x of [-.7, .7]) parts.push(H.colored(box(.8, 2.6, .9).translate(x, 1.3, .4), g));
  return H.merge(parts);
}
function pteroMesh() {
  const m = new THREE.MeshLambertMaterial({ color: 0x8a4a2a, side: THREE.DoubleSide }), g = new THREE.Group();
  g.add(new THREE.Mesh(box(.5, .4, 2.2), m)); const head = new THREE.Mesh(new THREE.ConeGeometry(.25, 1.4, 5).rotateX(-Math.PI / 2), m); head.position.set(0, .25, -1.5); g.add(head);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.6, 0, 0, .7, 3.4, 0, .2], 3)); wg.computeVertexNormals();
  const l = new THREE.Mesh(wg, m), r = new THREE.Mesh(wg, m); r.scale.x = -1; g.add(l, r); g.userData.wings = [l, r];
  return g;
}

/* ---------- Savanne ---------- */
function giraffeGeo(H) {
  const y = '#d9a441', d = '#8a5a2a', parts = [
    H.colored(box(1, 1.2, 2.2).translate(0, 2.9, 0), y), H.colored(box(.45, 3.2, .45).rotateX(-.35).translate(0, 4.9, -1.4), y),
    H.colored(box(.5, .5, 1).translate(0, 6.4, -2.2), y), H.colored(box(.12, .35, .12).translate(-.15, 6.85, -2), d), H.colored(box(.12, .35, .12).translate(.15, 6.85, -2), d),
    H.colored(box(1.02, .3, 1.6).translate(0, 3.2, .1), d),
  ];
  for (const [x, z] of [[-.35, -.8], [.35, -.8], [-.35, .8], [.35, .8]]) parts.push(H.colored(box(.22, 2.4, .22).translate(x, 1.2, z), y));
  return H.merge(parts);
}
function elephantGeo(H) {
  const g = '#8f8a84', parts = [
    H.colored(box(2.2, 2.2, 3.6).translate(0, 2.6, 0), g), H.colored(box(1.6, 1.6, 1.4).translate(0, 3.1, -2.2), g),
    H.colored(box(.4, 2, .4).rotateX(.2).translate(0, 1.9, -3.1), g), H.colored(box(.15, 1.4, 1.2).translate(-.9, 3.1, -2), '#7f7a74'), H.colored(box(.15, 1.4, 1.2).translate(.9, 3.1, -2), '#7f7a74'),
    H.colored(box(.12, .12, .8).rotateX(-.6).translate(-.4, 2.4, -2.9), '#f1ead8'), H.colored(box(.12, .12, .8).rotateX(-.6).translate(.4, 2.4, -2.9), '#f1ead8'),
  ];
  for (const [x, z] of [[-.7, -1.1], [.7, -1.1], [-.7, 1.1], [.7, 1.1]]) parts.push(H.colored(box(.6, 1.6, .6).translate(x, .8, z), g));
  return H.merge(parts);
}

/* ---------- Tiefsee ---------- */
function fishGeo() {
  const b = new THREE.OctahedronGeometry(.5, 0).scale(.45, .5, 1.1), t = new THREE.ConeGeometry(.35, .5, 4).rotateX(Math.PI / 2).translate(0, 0, .75);
  const pos = [...b.toNonIndexed().attributes.position.array, ...t.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function glowTex(c1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 54, 4, 64, 64, 62); g.addColorStop(0, '#ffffff'); g.addColorStop(.25, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
  // Tentakel
  x.strokeStyle = c1; x.lineWidth = 3; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(44 + i * 8, 70); x.bezierCurveTo(40 + i * 8, 90, 52 + i * 8, 105, 44 + i * 8, 126); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- Zuckerland ---------- */
function caneGeo(H) {
  const parts = [];
  for (let i = 0; i < 10; i++) parts.push(H.colored(new THREE.CylinderGeometry(.12, .12, .3, 8).translate(0, .15 + i * .3, 0), i % 2 ? '#ffffff' : '#e2262f'));
  parts.push(H.colored(new THREE.TorusGeometry(.32, .12, 6, 12, Math.PI).translate(.32, 3, 0), '#e2262f'));
  return H.merge(parts);
}
function swirlTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), c = ['#ff4fa3', '#ffffff', '#ffd23f', '#6fe0ff'];
  for (let i = 0; i < 60; i++) { x.strokeStyle = c[i % 4]; x.lineWidth = 14; x.beginPath(); x.arc(128, 128, 4 + i * 2, i * .5, i * .5 + 1.6); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildThemeExtras(world, R, H) {
  const th = R.theme, scene = world.scene, X = { t: 0, walkers: [], ptero: [], fish: null, jelly: [], smoke: [] };
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);

  if (th.dinos) {
    const r = rng(71), sg = sauropodGeo(H), tg = trexGeo(H);
    const n = Math.min(40, Math.floor(R.total / 380)), im = new THREE.InstancedMesh(sg, world.vcMat, n); let k = 0;
    for (let i = 0; i < n; i++) { const d = r() * R.total, p = beside(R, d, (r() < .5 ? -1 : 1) * (35 + r() * 120), -.2); q.setFromAxisAngle(up, r() * 6.28); const s = .8 + r() * .6; m4.compose(p, q, new THREE.Vector3(s, s, s)); im.setMatrixAt(k++, m4); }
    im.count = k; im.castShadow = true; scene.add(im);
    // T-Rex direkt am Wegesrand, schaut auf die Straße
    const nt = Math.max(2, Math.floor(R.total / 2500)), it = new THREE.InstancedMesh(tg, world.vcMat, nt);
    for (let i = 0; i < nt; i++) { const d = (i + .5) / nt * R.total, side = i % 2 ? 1 : -1, p = beside(R, d, side * (R.roadW / 2 + 9), -.1); q.setFromAxisAngle(up, -R.headAt(d) + (side > 0 ? -Math.PI / 2 : Math.PI / 2)); m4.compose(p, q, one); it.setMatrixAt(i, m4); }
    it.castShadow = true; scene.add(it);
    // Einige Langhälse wandern neben der Straße mit
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(sg, world.vcMat); m.castShadow = true; scene.add(m); X.walkers.push({ m, d: R.total * (i + .2) / 4, off: (i % 2 ? 1 : -1) * (22 + i * 6), v: .9 + r() * .5 }); }
    // Flugsaurier kreisen
    for (let i = 0; i < 10; i++) { const p = pteroMesh(); scene.add(p); X.ptero.push({ m: p, c: beside(R, R.total * i / 10, (r() - .5) * 80, 35 + r() * 30), rad: 25 + r() * 40, w: (.25 + r() * .2) * (r() < .5 ? -1 : 1), ph: r() * 6.28 }); }
  }
  if (th.landmark === 'volcano') {
    const d = R.total * .3, p = beside(R, d, 950), mat = new THREE.MeshLambertMaterial({ color: 0x4a3328, flatShading: true });
    const v = new THREE.Mesh(new THREE.CylinderGeometry(70, 620, 720, 22, 3), mat); v.position.set(p.x, p.y + 320, p.z); scene.add(v);
    const lava = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ff7a1a'), color: 0xffaa55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); lava.scale.set(260, 200, 1); lava.position.set(p.x, p.y + 700, p.z); scene.add(lava);
    const smat = new THREE.SpriteMaterial({ map: glowTex('#777777'), color: 0x55504c, transparent: true, opacity: .6, depthWrite: false });
    for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(smat.clone()); s.position.set(p.x, p.y + 720, p.z); scene.add(s); X.smoke.push({ s, base: p.clone().setY(p.y + 720), ph: i / 8 }); }
  }
  if (th.safari) {
    const r = rng(93), gg = giraffeGeo(H), eg = elephantGeo(H);
    for (const [geo, n, near] of [[gg, Math.min(40, Math.floor(R.total / 500)), 18], [eg, Math.min(24, Math.floor(R.total / 900)), 35]]) {
      const im = new THREE.InstancedMesh(geo, world.vcMat, n);
      for (let i = 0; i < n; i++) { const d = r() * R.total, p = beside(R, d, (r() < .5 ? -1 : 1) * (near + r() * 110), -.1); q.setFromAxisAngle(up, r() * 6.28); const sc = .85 + r() * .3; m4.compose(p, q, new THREE.Vector3(sc, sc, sc)); im.setMatrixAt(i, m4); }
      im.castShadow = true; scene.add(im);
    }
    // Ein paar Giraffen laufen gemächlich neben der Piste mit
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(gg, world.vcMat); m.castShadow = true; scene.add(m); X.walkers.push({ m, d: R.total * (i + .4) / 3, off: (i % 2 ? 1 : -1) * (16 + i * 5), v: 1.1 + r() * .4 }); }
  }
  // Riesenpilze (Fliegenpilze) neben dem Weg
  if (th.mushrooms) {
    const r = rng(64), stem = H.colored(new THREE.CylinderGeometry(.9, 1.3, 6, 10).translate(0, 3, 0), '#f3ead8');
    const cap = H.colored(new THREE.SphereGeometry(4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .62, 1).translate(0, 5.8, 0), '#d9262c');
    const dots = []; for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = 1 + (i % 3) * 1.05, yy = 5.8 + Math.sqrt(Math.max(0, 16 - rr * rr)) * .62; dots.push(H.colored(new THREE.SphereGeometry(.42, 8, 6).scale(1, .45, 1).translate(Math.cos(a) * rr, yy, Math.sin(a) * rr), '#ffffff')); }
    const g = H.merge([stem, cap, ...dots]), n = Math.min(260, Math.floor(R.total / 35)), im = new THREE.InstancedMesh(g, world.vcMat, n);
    for (let i = 0; i < n; i++) { const d = r() * R.total, p = beside(R, d, (r() < .5 ? -1 : 1) * (R.roadW / 2 + 5 + r() * 35), -.1); q.setFromAxisAngle(up, r() * 6.28); const sc = 1 + r() * 1.6; m4.compose(p, q, new THREE.Vector3(sc, sc, sc)); im.setMatrixAt(i, m4); }
    im.castShadow = true; scene.add(im);
  }
  if (th.landmark === 'fuji') {
    const d = R.total * .4, p = beside(R, d, -1600), base = p.y - 30;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(40, 900, 1100, 28, 1), new THREE.MeshLambertMaterial({ color: 0x5a6478, flatShading: true })); cone.position.set(p.x, base + 550, p.z); scene.add(cone);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(40, 260, 320, 28, 1), new THREE.MeshLambertMaterial({ color: 0xf4f7fb, flatShading: true })); cap.position.set(p.x, base + 1100 - 160 + 1, p.z); scene.add(cap);
  }
  if (th.fish) {
    const r = rng(88), schools = Math.min(16, Math.floor(R.total / 1100)), per = 14, im = new THREE.InstancedMesh(fishGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff }), schools * per);
    const cols = ['#ffb43a', '#4fd1ff', '#ff5a7a', '#c8f04a', '#ffffff'].map(col);
    X.fish = { im, list: [] };
    for (let s = 0; s < schools; s++) { const c = beside(R, R.total * (s + r()) / schools, (r() - .5) * 60, 4 + r() * 8), cc = cols[s % cols.length]; for (let i = 0; i < per; i++) { X.fish.list.push({ c, rad: 3 + r() * 6, w: (.4 + r() * .3) * (s % 2 ? 1 : -1), ph: r() * 6.28, y: (r() - .5) * 3 }); im.setColorAt(s * per + i, cc); } }
    im.frustumCulled = false; scene.add(im);
    // Leuchtquallen
    const jt = [glowTex('#ff6ad5'), glowTex('#5af0ff'), glowTex('#b47aff')];
    for (let i = 0; i < Math.min(60, R.total / 300); i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: jt[i % 3], blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); const p = beside(R, r() * R.total, (r() - .5) * 70, 5 + r() * 14); s.position.copy(p); const sc = 1.5 + r() * 2.5; s.scale.set(sc, sc * 1.3, 1); scene.add(s); X.jelly.push({ s, y: p.y, ph: r() * 6.28 }); }
  }
  if (th.candy) {
    const r = rng(42), cg = caneGeo(H), n = Math.floor(R.total / 30), im = new THREE.InstancedMesh(cg, world.vcMat, n * 2); let k = 0;
    for (let i = 0; i < n; i++) { const d = i * 30 + 10; if (R.tunnelAt?.(d, 10)) continue; for (const side of [-1, 1]) { const p = beside(R, d, side * (R.roadW / 2 + 1.6), -.05); q.setFromAxisAngle(up, -R.headAt(d) + (side > 0 ? Math.PI : 0)); m4.compose(p, q, one); im.setMatrixAt(k++, m4); } }
    im.count = k; im.castShadow = true; scene.add(im);
    // Riesenlollis
    const lm = new THREE.MeshLambertMaterial({ map: swirlTex() }), sm = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < Math.min(14, R.total / 700); i++) { const d = r() * R.total, p = beside(R, d, (r() < .5 ? -1 : 1) * (14 + r() * 40)), hgt = 6 + r() * 6, g = new THREE.Group();
      const st = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, hgt, 8).translate(0, hgt / 2, 0), sm), disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, .6, 28).rotateX(Math.PI / 2), [sm, lm, lm]); disc.position.y = hgt + 2.4;
      g.add(st, disc); g.position.copy(p); g.rotation.y = r() * 6.28; scene.add(g); }
  }
  if (th.crystals) {
    const r = rng(17), n = Math.floor(R.total / 22), im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0).scale(.6, 2, .6), new THREE.MeshBasicMaterial({ color: 0xffffff }), n), cs = ['#7af7ff', '#ff6af0', '#a98bff', '#6affb4'].map(col);
    for (let i = 0; i < n; i++) { const d = r() * R.total, p = beside(R, d, (r() < .5 ? -1 : 1) * (6 + r() * 70), .5); q.setFromAxisAngle(new THREE.Vector3(r() - .5, 3, r() - .5).normalize(), r() * 6); const s = .5 + r() * 2.5; m4.compose(p, q, new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m4); im.setColorAt(i, cs[i % 4]); }
    scene.add(im);
  }
  return X;
}

export function updateThemeExtras(X, R, dt) {
  if (!X) return; X.t += dt; const t = X.t;
  for (const w of X.walkers) {
    w.d = (w.d + w.v * dt) % R.total; const p = beside(R, w.d, w.off, -.2);
    w.m.position.copy(p); w.m.position.y += Math.abs(Math.sin(t * 2 + w.off)) * .25; w.m.rotation.y = -R.headAt(w.d) + Math.PI;
  }
  for (const p of X.ptero) {
    const a = t * p.w + p.ph; p.m.position.set(p.c.x + Math.cos(a) * p.rad, p.c.y + Math.sin(t * .7 + p.ph) * 4, p.c.z + Math.sin(a) * p.rad);
    p.m.rotation.y = -a + (p.w > 0 ? Math.PI : 0); const f = Math.sin(t * 5 + p.ph) * .5; p.m.userData.wings[0].rotation.z = f; p.m.userData.wings[1].rotation.z = -f;
  }
  for (const s of X.smoke) { const k = (t * .05 + s.ph) % 1; s.s.position.set(s.base.x + k * 120, s.base.y + k * 420, s.base.z + k * 40); const sc = 120 + k * 380; s.s.scale.set(sc, sc, 1); s.s.material.opacity = .6 * (1 - k); }
  if (X.fish) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    X.fish.list.forEach((f, i) => { const a = t * f.w + f.ph; v.set(f.c.x + Math.cos(a) * f.rad, f.c.y + f.y + Math.sin(t * 1.3 + f.ph) * .4, f.c.z + Math.sin(a) * f.rad); e.set(0, -a + (f.w > 0 ? Math.PI : 0), Math.sin(t * 8 + i) * .15); q.setFromEuler(e); m.compose(v, q, one); X.fish.im.setMatrixAt(i, m); });
    X.fish.im.instanceMatrix.needsUpdate = true;
  }
  for (const j of X.jelly) { j.s.position.y = j.y + Math.sin(t * .8 + j.ph) * 1.2; j.s.material.opacity = .7 + Math.sin(t * 2 + j.ph) * .3; }
}

// Himmelskörper im Weltall: Ringplanet
export function ringPlanetTex(canvasTex) {
  return canvasTex(512, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const ring = front => { x.save(); x.translate(w / 2, h / 2); x.rotate(-.25); x.beginPath(); x.ellipse(0, 0, 240, 52, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); x.lineWidth = 22; x.strokeStyle = 'rgba(230,200,150,.75)'; x.stroke(); x.lineWidth = 8; x.strokeStyle = 'rgba(255,235,200,.6)'; x.beginPath(); x.ellipse(0, 0, 205, 42, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); x.stroke(); x.restore(); };
    ring(false);
    const g = x.createRadialGradient(w / 2 - 30, h / 2 - 30, 10, w / 2, h / 2, 100); g.addColorStop(0, '#ffe3b0'); g.addColorStop(.6, '#d99a5a'); g.addColorStop(1, '#8a5a30');
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, h / 2, 100, 0, 7); x.fill();
    x.save(); x.beginPath(); x.arc(w / 2, h / 2, 100, 0, 7); x.clip(); x.globalAlpha = .25; x.fillStyle = '#7a4a20'; for (const y of [-40, -10, 25, 55]) x.fillRect(w / 2 - 100, h / 2 + y, 200, 8); x.restore();
    ring(true);
  }, false);
}
