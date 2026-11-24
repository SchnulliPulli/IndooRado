// 3D-Welt mit Three.js: Gelände in Kacheln, Straße, Vegetation, Häuser, Himmel, Fahrer-Avatar
import * as THREE from 'three';
import { rng, hash2, fbm, clamp, lerp, smooth } from './util.js';

const CHUNK = 256;
const QUALITY = {
  high: { pr: 1.75, shadow: 2048, radius: 4, res: 40, trees: 1, aa: true },
  medium: { pr: 1.25, shadow: 1024, radius: 3, res: 32, trees: .75, aa: true },
  low: { pr: 1, shadow: 0, radius: 2, res: 24, trees: .45, aa: false },
};
export function autoQuality() {
  const mobile = navigator.userAgentData?.mobile || /Android|Mobi|iPad|Tablet/i.test(navigator.userAgent);
  return mobile ? 'medium' : 'high';
}
const col = s => new THREE.Color(s);

/* ---------- Texturen aus Canvas ---------- */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8; return t;
}
function roadTexture() {
  return canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = '#4b5056'; x.fillRect(0, 0, w, h);
    const r = rng(42);
    for (let i = 0; i < 9000; i++) { const v = 60 + r() * 50 | 0; x.fillStyle = `rgba(${v},${v},${v + 4},${.25 + r() * .35})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    // Fahrspuren etwas dunkler
    for (const u of [.25, .75]) { const g = x.createLinearGradient(w * (u - .12), 0, w * (u + .12), 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(20,22,26,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(w * (u - .12), 0, w * .24, h); }
    x.fillStyle = '#eceff1'; x.fillRect(w * .03, 0, w * .022, h); x.fillRect(w * .948, 0, w * .022, h);
    x.fillRect(w * .493, 0, w * .016, h * .375);
  });
}
function grassTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 6000; i++) { const v = 100 + r() * 70 | 0; x.fillStyle = `rgba(${v},${v},${v},.5)`; x.fillRect(r() * w, r() * h, 1, 2 + r() * 3); }
  });
}
function labelTex(text, opt = {}) {
  const w = opt.w || 256, h = opt.h || 128;
  return canvasTex(w, h, (x) => {
    x.fillStyle = opt.bg || '#ffffff'; x.fillRect(0, 0, w, h);
    if (opt.border) { x.strokeStyle = opt.border; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10); }
    if (opt.checker) for (let i = 0; i < w / 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 16, j * 16 + (j ? h - 32 : 0), 16, 16); }
    x.fillStyle = opt.fg || '#111'; x.font = `700 ${opt.size || 64}px Barlow, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 2);
  }, false);
}
// Fassade mit Fenstern; wird mit der Hausfarbe multipliziert
function windowTex() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const px = 12 + i * 40, py = 10 + j * 40;
      x.fillStyle = '#56636f'; x.fillRect(px, py, 24, 26);
      x.fillStyle = '#e9e3d9'; x.fillRect(px + 11, py, 2, 26); x.fillRect(px, py + 12, 24, 2);
    }
    x.fillStyle = '#d6cfc2'; x.fillRect(0, h - 6, w, 6);
  }, false);
}
function cloudTex() {
  return canvasTex(256, 128, (x, w, h) => {
    const r = rng(3);
    for (let i = 0; i < 22; i++) { const cx = 40 + r() * 176, cy = 50 + r() * 40, rad = 18 + r() * 34; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  }, false);
}

/* ---------- Geometrie-Helfer ---------- */
function colored(geo, c) { const n = geo.attributes.position.count, a = new Float32Array(n * 3); const cc = col(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
function merge(geos) {
  // einfache Zusammenführung (Position, Normale, Farbe), nicht indiziert
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); colr.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return m;
}
function coniferGeo() {
  const parts = [colored(new THREE.CylinderGeometry(.18, .26, 2.4, 6).translate(0, 1.2, 0), '#5b4030')];
  [[3.6, 2.4, 1.6], [2.9, 2.6, 3.4], [2.1, 2.6, 5.1], [1.3, 2.2, 6.6]].forEach(([r, h, y], i) => parts.push(colored(new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2 - .6, 0), i % 2 ? '#2f6a3a' : '#2a6034')));
  return merge(parts);
}
function leafyGeo() {
  const crown = new THREE.IcosahedronGeometry(2.6, 1);
  const p = crown.attributes.position; const r = rng(11);
  for (let i = 0; i < p.count; i++) { const k = .85 + r() * .3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .9, p.getZ(i) * k); }
  crown.computeVertexNormals();
  return merge([colored(new THREE.CylinderGeometry(.22, .32, 3.4, 6).translate(0, 1.7, 0), '#5d4433'), colored(crown.translate(0, 5, 0), '#4f8f3a'), colored(new THREE.IcosahedronGeometry(1.6, 0).translate(1.2, 4.2, .6), '#5c9c42')]);
}
function rockGeo() {
  const g = new THREE.DodecahedronGeometry(1, 0); const p = g.attributes.position; const r = rng(5);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (.8 + r() * .5), p.getY(i) * (.5 + r() * .3), p.getZ(i) * (.8 + r() * .5));
  g.computeVertexNormals(); return colored(g, '#8b8d8f');
}
function tuftGeo() { return merge([colored(new THREE.ConeGeometry(.35, .9, 4).translate(0, .45, 0), '#5f9a46'), colored(new THREE.ConeGeometry(.25, .7, 4).translate(.3, .35, .2), '#6aa34c')]); }

/* ---------- Avatar ---------- */
class Rider {
  constructor(c) {
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    const M = (color, rough) => new THREE.MeshStandardMaterial({ color, roughness: rough ?? .6, metalness: 0 });
    this.mat = { jersey: M(c.jersey, .7), bike: M(c.bikeColor, .35), skin: M(c.skin, .8), helmet: M(c.helmet, .3), dark: M('#1b1e22', .8), tire: M('#151618', .9), rim: M('#c8ccd0', .3), sock: M('#f4f4f4', .8) };
    const g = this.g = new THREE.Group(); this.root.add(g);
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.P = { R: V(0, .34, .5), F: V(0, .34, -.53), BB: V(0, .29, .04), S: V(0, .8, .2), H: V(0, .86, -.36), HB: V(0, .7, -.4) };
    const tube = (a, b, r, mat) => { const m = add(new THREE.CylinderGeometry(r, r, 1, 8), mat); this.limb(m, a, b); return m; };
    const P = this.P;
    tube(P.R, P.BB, .016, this.mat.bike); tube(P.R, P.S, .014, this.mat.bike); tube(P.BB, P.S, .022, this.mat.bike);
    tube(P.S, P.H, .02, this.mat.bike); tube(P.BB, P.HB, .026, this.mat.bike); tube(P.HB, P.F, .016, this.mat.bike); tube(P.HB, P.H, .024, this.mat.bike);
    tube(P.H, V(0, .9, -.46), .016, this.mat.dark);
    const bar = add(new THREE.CylinderGeometry(.013, .013, .42, 8), this.mat.dark); bar.rotation.z = Math.PI / 2; bar.position.set(0, .9, -.47);
    for (const s of [-1, 1]) tube(V(s * .2, .9, -.47), V(s * .2, .8, -.42), .012, this.mat.dark);
    tube(P.S, V(0, .88, .23), .013, this.mat.rim);
    const saddle = add(new THREE.BoxGeometry(.13, .04, .27), this.mat.dark); saddle.position.set(0, .89, .23);
    this.wheels = [P.R, P.F].map(p => {
      const w = new THREE.Group(); w.position.copy(p); g.add(w);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(.335, .022, 8, 32), this.mat.tire); tire.rotation.y = Math.PI / 2; tire.castShadow = true; w.add(tire);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.305, .012, 6, 32), this.mat.rim); rim.rotation.y = Math.PI / 2; w.add(rim);
      for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.004, .6, .012), this.mat.rim); sp.rotation.x = k * Math.PI / 4; w.add(sp); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .1, 10), this.mat.rim); hub.rotation.z = Math.PI / 2; w.add(hub);
      return w;
    });
    const ring = add(new THREE.CylinderGeometry(.1, .1, .01, 20), this.mat.rim); ring.rotation.z = Math.PI / 2; ring.position.copy(P.BB).add(V(.05, 0, 0));
    this.crank = [add(new THREE.BoxGeometry(.015, .17, .025), this.mat.rim), add(new THREE.BoxGeometry(.015, .17, .025), this.mat.rim)];
    // Fahrer
    this.hip = V(0, .96, .2); this.sh = V(0, 1.36, -.2);
    this.torso = add(new THREE.CapsuleGeometry(.15, .32, 4, 10), this.mat.jersey); this.torso.scale.set(1.15, 1, .85);
    this.head = add(new THREE.SphereGeometry(.1, 14, 12), this.mat.skin);
    this.helmet = add(new THREE.SphereGeometry(.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), this.mat.helmet); this.helmet.scale.set(.95, .85, 1.25);
    this.arms = [-1, 1].map(s => ({ s, up: add(new THREE.CylinderGeometry(.045, .04, 1, 8), this.mat.jersey), lo: add(new THREE.CylinderGeometry(.038, .033, 1, 8), this.mat.skin), elb: add(new THREE.SphereGeometry(.042, 8, 6), this.mat.skin) }));
    this.legs = [-1, 1].map(s => ({ s, th: add(new THREE.CylinderGeometry(.075, .055, 1, 10), this.mat.dark), sh: add(new THREE.CylinderGeometry(.052, .04, 1, 10), this.mat.skin), knee: add(new THREE.SphereGeometry(.058, 10, 8), this.mat.dark), sock: add(new THREE.CylinderGeometry(.042, .042, .12, 8), this.mat.sock), shoe: add(new THREE.BoxGeometry(.08, .07, .25), this.mat.dark) }));
    this.wheelA = 0; this.update(0, 0, 0, 0);
  }
  setColors(c) { this.mat.jersey.color.set(c.jersey); this.mat.bike.color.set(c.bikeColor); this.mat.helmet.color.set(c.helmet); this.mat.skin.color.set(c.skin); }
  limb(m, a, b) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    m.position.copy(a).addScaledVector(d, .5); m.scale.set(1, L, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
  update(crank, v, dt, gradePct) {
    const P = this.P, V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.wheelA -= v / .34 * dt; for (const w of this.wheels) w.rotation.x = this.wheelA;
    const bob = Math.sin(crank * 2) * .008 * Math.min(1, v / 3);
    const lean = clamp(gradePct / 100, -.1, .15);
    const hip = this.hip.clone().add(V(0, bob, 0)), sh = this.sh.clone().add(V(0, bob * .6 - lean * .3, lean * .6));
    // Oberkörper
    const mid = hip.clone().lerp(sh, .5); this.torso.position.copy(mid);
    this.torso.quaternion.setFromUnitVectors(V(0, 1, 0), sh.clone().sub(hip).normalize());
    const headP = sh.clone().add(V(0, .15, -.1)); this.head.position.copy(headP); this.helmet.position.copy(headP).add(V(0, .03, .01)); this.helmet.rotation.x = -.35;
    for (const a of this.arms) {
      const s0 = sh.clone().add(V(a.s * .17, .02, .02)), hand = V(a.s * .2, .9, -.46), el = s0.clone().lerp(hand, .5).add(V(a.s * .03, .06, .05));
      this.limb(a.up, s0, el); this.limb(a.lo, el, hand); a.elb.position.copy(el);
    }
    const r = .17, L1 = .45, L2 = .46;
    for (const l of this.legs) {
      const ang = crank + (l.s > 0 ? Math.PI : 0);
      const ped = P.BB.clone().add(V(l.s * .09, -Math.cos(ang) * r, -Math.sin(ang) * r));
      const arm = this.crank[l.s > 0 ? 1 : 0]; this.limb(arm, P.BB.clone().add(V(l.s * .07, 0, 0)), ped.clone().add(V(-l.s * .02, 0, 0)));
      const foot = ped.clone().add(V(0, .055, 0)), h = hip.clone().add(V(l.s * .1, -.02, 0));
      const dv = foot.clone().sub(h); let D = Math.min(dv.length(), L1 + L2 - .005);
      const dir = dv.normalize(), a1 = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
      let perp = V(0, -dir.z, dir.y); if (perp.z > 0) perp.negate();
      const knee = h.clone().addScaledVector(dir, Math.cos(a1) * L1).addScaledVector(perp, Math.sin(a1) * L1);
      this.limb(l.th, h, knee); l.knee.position.copy(knee);
      const ankle = h.clone().addScaledVector(dir, D);
      this.limb(l.sh, knee, ankle);
      l.sock.position.copy(ankle).lerp(knee, .12); l.sock.quaternion.copy(l.sh.quaternion);
      l.shoe.position.copy(ankle).add(V(0, -.02, -.05)); l.shoe.rotation.x = -.15 + Math.sin(ang) * .2;
    }
  }
}

/* ---------- Welt ---------- */
export class World {
  constructor(canvas, route, profile, opt = {}) {
    this.route = route; this.profile = profile;
    this.qKey = (profile.quality === 'auto' || !QUALITY[profile.quality]) ? autoQuality() : profile.quality;
    const Q = this.Q = QUALITY[this.qKey];
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    if (Q.shadow) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    const th = route.theme;
    this.scene = new THREE.Scene();
    const sky0 = col(th.sky[0]), sky1 = col(th.sky[1]);
    this.scene.background = sky1.clone();
    const viewR = (Q.radius + .5) * CHUNK;
    this.scene.fog = new THREE.Fog(sky1.clone(), viewR * .35, viewR * .98);
    this.camera = new THREE.PerspectiveCamera(62, 1, .1, 9000);
    // Himmelskuppel
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: sky0 }, hor: { value: sky1 }, sun: { value: new THREE.Vector3(.45, .55, -.7).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sun; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.55)); float s = max(dot(vP, sun),0.0); c += vec3(1.0,0.92,0.75)*(pow(s,600.0)*2.5 + pow(s,12.0)*0.18); if(vP.y<0.0) c = hor; gl_FragColor = vec4(c,1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyMat); this.sky.renderOrder = -10; this.scene.add(this.sky);
    // Licht
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.15));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sunDir = new THREE.Vector3(.45, .55, -.7).normalize();
    if (Q.shadow) { sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400; sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; }
    this.scene.add(sun); this.scene.add(sun.target);
    // Materialien
    this.grassTex = grassTexture(); this.grassTex.colorSpace = THREE.NoColorSpace;
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grassTex });
    this.vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.chunks = new Map(); this.queue = [];
    this.buildRoad(); this.buildInstances(); this.buildFar(); this.buildClouds(); this.buildProps(); this.buildTunnels();
    this.npcs = [];
    if (route.water != null) {
      const wm = new THREE.MeshPhongMaterial({ color: 0x1f5f8f, specular: 0x5f8fb8, shininess: 60, transparent: true, opacity: .94 });
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), wm); this.water.rotation.x = -Math.PI / 2; this.water.position.y = route.water; this.water.receiveShadow = true; this.scene.add(this.water);
    }
    this.rider = new Rider(profile); this.scene.add(this.rider.root);
    this.pacer = null;
    this.view = 0; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camInit = false;
    this.lastInst = 0; this.instDirty = true;
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /* Straße als Band entlang der Strecke */
  buildRoad() {
    const R = this.route, N = R.N, W = 3.3, SH = 1.7;
    const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2);
    const sp = new Float32Array((N + 1) * 4 * 3), sc = new Float32Array((N + 1) * 4 * 3);
    const gravel = col('#8a8275'), grass = col(R.theme.grass[0]);
    for (let i = 0; i <= N; i++) {
      const h = R.head[i], rx = Math.cos(h), rz = Math.sin(h), x = R.x[i], z = R.z[i], y = R.e[i] + .1;
      pos.set([x - rx * W, y, z - rz * W, x + rx * W, y, z + rz * W], i * 6);
      uv.set([0, i * R.step / 8, 1, i * R.step / 8], i * 4);
      sp.set([x - rx * (W + SH), y - .32, z - rz * (W + SH), x - rx * W, y - .02, z - rz * W, x + rx * W, y - .02, z + rz * W, x + rx * (W + SH), y - .32, z + rz * (W + SH)], i * 12);
      for (let k = 0; k < 4; k++) { const c = (k === 0 || k === 3) ? grass : gravel; sc.set([c.r, c.g, c.b], i * 12 + k * 3); }
    }
    const idx = [], sidx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c);
      const s = i * 4, t = s + 4; sidx.push(s, s + 1, t, s + 1, t + 1, t, s + 2, s + 3, t + 2, s + 3, t + 3, t + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const tex = roadTexture();
    const road = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    road.receiveShadow = true; this.scene.add(road);
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(sp, 3)); g2.setAttribute('color', new THREE.BufferAttribute(sc, 3)); g2.setIndex(sidx); g2.computeVertexNormals();
    const sh = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); sh.receiveShadow = true; this.scene.add(sh);
    // Steigungsband am Straßenrand: Farbe zeigt die Steigung (blau bergab, grün flach, gelb, orange, rot steil)
    const gb = new Float32Array((N + 1) * 4 * 3), gcol = new Float32Array((N + 1) * 4 * 3), gidx = [];
    const gc = g => col(g > 8 ? '#ef4458' : g > 5 ? '#ff8a3d' : g > 2.5 ? '#f5c542' : g > -1.5 ? '#4fd18b' : '#3fa7f5');
    for (let i = 0; i <= N; i++) {
      const h = R.head[i], rx = Math.cos(h), rz = Math.sin(h), x = R.x[i], z = R.z[i], y = R.e[i] + .11, c = gc(R.grade[i]);
      gb.set([x - rx * (W + .5), y - .08, z - rz * (W + .5), x - rx * (W + .02), y, z - rz * (W + .02), x + rx * (W + .02), y, z + rz * (W + .02), x + rx * (W + .5), y - .08, z + rz * (W + .5)], i * 12);
      for (let k = 0; k < 4; k++) gcol.set([c.r, c.g, c.b], i * 12 + k * 3);
    }
    for (let i = 0; i < N; i++) { const s = i * 4, t = s + 4; gidx.push(s, s + 1, t, s + 1, t + 1, t, s + 2, s + 3, t + 2, s + 3, t + 3, t + 2); }
    const g3 = new THREE.BufferGeometry(); g3.setAttribute('position', new THREE.BufferAttribute(gb, 3)); g3.setAttribute('color', new THREE.BufferAttribute(gcol, 3)); g3.setIndex(gidx);
    const band = new THREE.Mesh(g3, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    this.scene.add(band);
    this.roadMeshes = [road, sh, band];
  }

  /* Tunnel: Gewölbe entlang der Straße, Portale, Lampen */
  buildTunnels() {
    const R = this.route; if (!R.tunnels.length) return;
    const SEG = 12, HW = 5.6, HH = 6.4;
    const mat = new THREE.MeshLambertMaterial({ color: 0x77736c, side: THREE.DoubleSide });
    const lampM = new THREE.MeshBasicMaterial({ color: 0xffe3a0 });
    const portalM = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    for (const t of R.tunnels) {
      const a = t.from - 32, b = t.to + 32, n = Math.max(2, Math.round((b - a) / 4));
      const pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const d = a + (b - a) * i / n, h = R.headAt(d), rx = Math.cos(h), rz = Math.sin(h), x = R.xAt(d), z = R.zAt(d), y = R.eleAt(d);
        for (let k = 0; k <= SEG; k++) { const ang = Math.PI * k / SEG, lx = -Math.cos(ang) * HW, ly = Math.sin(ang) * HH - .3; pos.push(x + rx * lx, y + ly, z + rz * lx); }
        if (i < n) for (let k = 0; k < SEG; k++) { const p = i * (SEG + 1) + k, q = p + SEG + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const tube = new THREE.Mesh(g, mat); tube.castShadow = true; tube.receiveShadow = true; this.scene.add(tube);
      // Lampen an der Decke
      const cnt = Math.floor((b - a) / 18), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .12, 1.6), lampM, cnt), m = new THREE.Matrix4();
      for (let k = 0; k < cnt; k++) { const d = a + 9 + k * 18, h = R.headAt(d); m.makeRotationY(-h); m.setPosition(R.xAt(d), R.eleAt(d) + HH - .45, R.zAt(d)); lamps.setMatrixAt(k, m); }
      this.scene.add(lamps);
      // Portale
      for (const [d, dir] of [[a, 1], [b, -1]]) {
        const grp = new THREE.Group(), h = R.headAt(d); grp.position.set(R.xAt(d), R.eleAt(d), R.zAt(d)); grp.rotation.y = -h;
        for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 1.4), portalM); p.position.set(s * (HW + 1.4), 4.2, 0); p.castShadow = true; grp.add(p); }
        const top = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 5.8, 2.6, 1.4), portalM); top.position.y = HH + 1; top.castShadow = true; grp.add(top);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, .9), new THREE.MeshBasicMaterial({ map: labelTex('TUNNEL ' +Math.round(t.to - t.from) + ' m', { w: 512, h: 90, size: 52, bg: '#f2f2f2', fg: '#1b1e22' }) }));
        sign.position.set(0, HH + 1, dir * .72); if (dir < 0) sign.rotation.y = Math.PI; grp.add(sign);
        this.scene.add(grp);
      }
    }
  }

  /* Leitpfosten, Kilometersteine, Start/Ziel, Anstiegsbanner */
  buildProps() {
    const R = this.route, at = (d, off, y = 0) => { const x = R.xAt(d), z = R.zAt(d), h = R.headAt(d); return new THREE.Vector3(x + Math.cos(h) * off, R.eleAt(d) + y, z + Math.sin(h) * off); };
    // Leitpfosten
    const n = Math.floor(R.total / 50) * 2;
    const post = new THREE.InstancedMesh(merge([colored(new THREE.BoxGeometry(.12, 1, .12).translate(0, .5, 0), '#f2f2f2'), colored(new THREE.BoxGeometry(.125, .2, .125).translate(0, .82, 0), '#222')]), this.vcMat, n);
    const m = new THREE.Matrix4(); let k = 0;
    for (let d = 25; d < R.total && k < n; d += 50) for (const s of [-1, 1]) { const p = at(d, s * 5.4, -.1); m.makeRotationY(-R.headAt(d)); m.setPosition(p); post.setMatrixAt(k++, m); }
    post.count = k; post.castShadow = true; this.scene.add(post);
    // Kilometersteine
    for (let km = 1; km * 1000 < R.total; km++) {
      const d = km * 1000, p = at(d, 5.6), grp = new THREE.Group(); grp.position.copy(p); grp.rotation.y = -R.headAt(d) + Math.PI / 2;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(.25, 1.1, .55), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 })); stone.position.y = .45; stone.castShadow = true; grp.add(stone);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(.5, .32), new THREE.MeshBasicMaterial({ map: labelTex(String(km), { w: 128, h: 80, size: 56, bg: '#ffd23f' }) })); plate.position.set(-.13, .7, 0); plate.rotation.y = -Math.PI / 2; grp.add(plate);
      this.scene.add(grp);
    }
    // Torbögen
    const arch = (d, text, opt) => {
      const g = new THREE.Group(), h = R.headAt(d), p = at(d, 0); g.position.copy(p); g.rotation.y = -h;
      const pm = new THREE.MeshLambertMaterial({ color: opt.pole || 0x2b2f35 });
      for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(.45, 6, .45), pm); pole.position.set(s * 5, 3, 0); pole.castShadow = true; g.add(pole); }
      const ban = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.5, .3), [pm, pm, pm, pm, new THREE.MeshBasicMaterial({ map: labelTex(text, { w: 512, h: 80, size: 50, ...opt }) }), new THREE.MeshBasicMaterial({ map: labelTex(text, { w: 512, h: 80, size: 50, ...opt }) })]);
      ban.position.y = 5.6; ban.castShadow = true; g.add(ban); this.scene.add(g);
    };
    arch(8, R.loop ? 'START · ZIEL' : 'START', { bg: '#ffffff', fg: '#111', checker: true });
    if (!R.loop) arch(R.total - 6, 'ZIEL', { bg: '#ffffff', fg: '#111', checker: true });
    for (const c of R.climbs) { arch(c.from, c.name.toUpperCase(), { bg: '#c8102e', fg: '#fff' }); arch(c.to, 'GIPFEL ' + c.name.toUpperCase(), { bg: '#ffffff', fg: '#c8102e', border: '#c8102e' }); }
    for (const s of R.sprints) { arch(s.from, s.name.toUpperCase(), { bg: '#2f9e57', fg: '#fff' }); arch(s.to, 'SPRINT ENDE', { bg: '#ffffff', fg: '#2f9e57', border: '#2f9e57' }); }
    // Steigungsschilder an Anstiegen: alle 500 m mit Steigung des nächsten Abschnitts
    const signMat = new THREE.MeshLambertMaterial({ color: 0x9aa1a8 });
    for (const c of R.climbs) for (let d = c.from + 20; d < c.to - 150; d += 500) {
      const end = Math.min(c.to, d + 500), g = (R.eleAt(end) - R.eleAt(d)) / (end - d) * 100, left = (c.to - d) / 1000;
      const grp = new THREE.Group(), p = at(d, -5.8); grp.position.copy(p); grp.rotation.y = -R.headAt(d);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.2, 6), signMat); post.position.y = 1.1; grp.add(post);
      const bg = g > 8 ? '#ef4458' : g > 5 ? '#ff8a3d' : '#f5c542';
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .9), new THREE.MeshBasicMaterial({ map: labelTex(`▲ ${g.toFixed(0)} %`, { w: 256, h: 176, size: 70, bg, fg: '#111', border: '#111' }) }));
      pl.position.set(0, 2.4, .04); grp.add(pl);
      const pl2 = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .4), new THREE.MeshBasicMaterial({ map: labelTex(`noch ${left.toFixed(1).replace('.', ',')} km`, { w: 256, h: 80, size: 40, bg: '#fff', fg: '#111' }) }));
      pl2.position.set(0, 1.75, .04); grp.add(pl2);
      this.scene.add(grp);
    }
    // Ortschaften: Ortstafeln, Laternen, Kirchturm
    const lampPole = new THREE.MeshLambertMaterial({ color: 0x3a3f45 }), lampHead = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
    for (const t of R.towns) {
      for (const [d, txt, back] of [[t.from - 15, t.name, false], [t.to + 15, t.name, true]]) {
        const grp = new THREE.Group(), p = at(d, 5.9); grp.position.copy(p); grp.rotation.y = -R.headAt(d);
        for (const s of [-.55, .55]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2, 6), signMat); post.position.set(s, 1, 0); grp.add(post); }
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .8), new THREE.MeshBasicMaterial({ map: labelTex(txt, { w: 320, h: 160, size: txt.length > 10 ? 40 : 54, bg: '#ffd23f', fg: '#111', border: '#111' }) }));
        pl.position.set(0, 1.9, .03); grp.add(pl);
        if (back) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .08), new THREE.MeshBasicMaterial({ color: 0xc8102e })); bar.position.set(0, 1.9, .04); bar.rotation.z = -.42; grp.add(bar); }
        this.scene.add(grp);
      }
      const n = Math.floor((t.to - t.from) / 40), poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .09, 5, 6).translate(0, 2.5, 0), lampPole, n), heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, .14, .3), lampHead, n), m = new THREE.Matrix4();
      for (let k = 0; k < n; k++) { const d = t.from + 20 + k * 40, s = k % 2 ? 1 : -1, p = at(d, s * 5.2, -.1); m.makeRotationY(-R.headAt(d)); m.setPosition(p); poles.setMatrixAt(k, m); m.setPosition(at(d, s * 4.7, 4.95)); heads.setMatrixAt(k, m); }
      poles.castShadow = true; this.scene.add(poles, heads);
      // Kirchturm in der Ortsmitte
      const dm = (t.from + t.to) / 2, side = R.tunnelAt(dm) ? 0 : 1, cp = at(dm, side * 26, -.5);
      cp.y = R.heightAt(cp.x, cp.z) - .5;
      const tower = new THREE.Group(); tower.position.copy(cp); tower.rotation.y = -R.headAt(dm);
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 20, 4.5), new THREE.MeshLambertMaterial({ color: 0xf1ebdf })); body.position.y = 10; body.castShadow = true; tower.add(body);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(3.4, 9, 4), new THREE.MeshLambertMaterial({ color: 0x4f6a5a })); spire.position.y = 24.5; spire.rotation.y = Math.PI / 4; spire.castShadow = true; tower.add(spire);
      const clock = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff })); clock.position.set(0, 16, 2.26); tower.add(clock);
      const nave = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 16), new THREE.MeshLambertMaterial({ color: 0xece4d6 })); nave.position.set(0, 4, -10); nave.castShadow = true; tower.add(nave);
      const roofM = new THREE.MeshLambertMaterial({ color: 0x8b3a2b });
      for (const s of [-1, 1]) { const rf = new THREE.Mesh(new THREE.BoxGeometry(5.6, .3, 16.6), roofM); rf.position.set(s * 2.3, 9.6, -10); rf.rotation.z = -s * .62; rf.castShadow = true; tower.add(rf); }
      this.scene.add(tower);
    }
    // Küste: Leuchtturm und Segelboote auf dem Meer
    if (R.theme.coast && R.water != null) {
      const dl = R.total * .55, h = R.headAt(dl), side = R.theme.coast;
      const lx = R.xAt(dl) - Math.cos(h) * side * 34, lz = R.zAt(dl) - Math.sin(h) * side * 34;
      const lh = new THREE.Group(); lh.position.set(lx, Math.max(R.heightAt(lx, lz), R.water + .5), lz);
      for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.1 - k * .18, 2.3 - k * .18, 4, 16), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xc8102e : 0xffffff })); seg.position.y = 2 + k * 4; seg.castShadow = true; lh.add(seg); }
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 12), new THREE.MeshBasicMaterial({ color: 0xfff5b0 })); lamp.position.y = 21; lh.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2, 12), new THREE.MeshLambertMaterial({ color: 0x2b2f35 })); cap.position.y = 23; lh.add(cap);
      this.scene.add(lh);
      const r = rng(77); this.boats = [];
      const hullM = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), sailM = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      for (let k = 0; k < 14; k++) {
        const d = r() * R.total, hh = R.headAt(d), off = (120 + r() * 700) * side;
        const bx = R.xAt(d) - Math.cos(hh) * off, bz = R.zAt(d) - Math.sin(hh) * off;
        if (R.heightAt(bx, bz) > R.water - 1) continue;
        const b = new THREE.Group(); b.position.set(bx, R.water, bz); b.rotation.y = r() * 6.28;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, .9, 7).translate(0, .2, 0), hullM); b.add(hull);
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, .7, -2.5, 0, 9, -.3, 0, .7, 2.4], 3)); sg.computeVertexNormals();
        b.add(new THREE.Mesh(sg, k % 3 ? sailM : new THREE.MeshLambertMaterial({ color: 0xff6a3d, side: THREE.DoubleSide })));
        b.userData = { ph: r() * 6 }; this.scene.add(b); this.boats.push(b);
      }
    }
    // Intervall-Zieltor (wird bei Bedarf positioniert)
    const gate = this.gate = new THREE.Group(); gate.visible = false;
    const gm = new THREE.MeshLambertMaterial({ color: 0x1b1e22 });
    for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(.5, 6.2, .5), gm); pole.position.set(s * 5.1, 3.1, 0); pole.castShadow = true; gate.add(pole); }
    this.gateMat = new THREE.MeshBasicMaterial({ map: labelTex('INTERVALL', { w: 512, h: 96, size: 54, bg: '#ff6a3d', fg: '#111' }), side: THREE.DoubleSide });
    const gb = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 1.8), this.gateMat); gb.position.y = 5.6; gate.add(gb);
    this.gateRing = new THREE.Mesh(new THREE.PlaneGeometry(10.2, .25), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 })); this.gateRing.position.y = .25; this.gateRing.rotation.x = -Math.PI / 2; gate.add(this.gateRing);
    this.scene.add(gate);
  }
  setGate(d, text, color = '#ff6a3d') {
    if (d == null) { this.gate.visible = false; this.gateKey = null; return; }
    const key = text + color;
    if (key !== this.gateKey) { this.gateKey = key; this.gateMat.map?.dispose(); this.gateMat.map = labelTex(text, { w: 512, h: 96, size: text.length > 16 ? 40 : 54, bg: color, fg: '#111' }); this.gateMat.needsUpdate = true; }
    const R = this.route, h = R.headAt(d); this.gate.position.set(R.xAt(d), R.eleAt(d) + .05, R.zAt(d)); this.gate.rotation.y = -h; this.gate.visible = true;
  }

  /* Instanzen für Bäume, Felsen, Häuser, Grasbüschel */
  buildInstances() {
    const cap = Math.round(18000 * this.Q.trees);
    const mk = (geo, mat, n, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.castShadow = shadow; im.receiveShadow = false; im.frustumCulled = false; this.scene.add(im); return im; };
    this.inst = {
      conifer: mk(coniferGeo(), this.vcMat, cap), leafy: mk(leafyGeo(), this.vcMat, cap),
      rock: mk(rockGeo(), this.vcMat, 1500), tuft: mk(tuftGeo(), this.vcMat, 24000, false),
      wall: mk(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.MeshLambertMaterial({ map: windowTex() }), 2000),
      roof: mk(new THREE.CylinderGeometry(.62, .62, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).scale(1, .5, 1).translate(0, .25, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), 2000),
    };
    for (const k of ['wall', 'roof', 'leafy', 'conifer']) this.inst[k].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.inst[k].instanceMatrix.count * 3).fill(1), 3);
  }

  /* Ferne Berge als Ring und Wolken */
  buildFar() {
    const R = this.route, amp = R.theme.mountains || .3, seg = 256, rad = 4200;
    const pos = [], colr = [], idx = [], horizon = col(R.theme.sky[1]), rock = col('#6f8297').lerp(horizon, .45), snow = col('#f4f7fa').lerp(horizon, .25);
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, hgt = 180 + amp * 520 * Math.max(0, fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, 5, 21) + .45);
      pos.push(Math.cos(a) * rad, -250, Math.sin(a) * rad, Math.cos(a) * rad, hgt, Math.sin(a) * rad);
      const c = hgt > 520 && amp > .6 ? snow : rock; colr.push(rock.r, rock.g, rock.b, c.r, c.g, c.b);
      if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
    this.far = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false })); this.far.renderOrder = -5; this.scene.add(this.far);
  }
  buildClouds() {
    const tex = cloudTex(), r = rng(9); this.clouds = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: .85, fog: false, depthWrite: false }));
      const sc = 400 + r() * 700; s.scale.set(sc, sc * .45, 1); s.userData = { ox: (r() - .5) * 6000, oz: (r() - .5) * 6000, y: 650 + r() * 500 };
      this.scene.add(s); this.clouds.push(s);
    }
  }

  /* Geländekacheln */
  chunkKey(cx, cz) { return cx + ',' + cz; }
  buildChunk(cx, cz) {
    const R = this.route, th = R.theme, res = this.Q.res, n = res + 1, s = CHUNK / res;
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), colr = new Float32Array(n * n * 3);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const g0 = col(th.grass[0]), g1 = col(th.grass[1]), g2 = col(th.grass[2]), rockC = col('#7d7a74'), snowC = col('#f3f6f8'), sand = col('#d8c99a');
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * s, z = z0 + j * s, k = j * n + i;
      pos[k * 3] = x; pos[k * 3 + 1] = R.heightAt(x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
    }
    const idx = [];
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const nor = g.attributes.normal.array, c = new THREE.Color();
    for (let k = 0; k < n * n; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], ny = nor[k * 3 + 1];
      const nz = fbm(x / 140, z / 140, 3, 4) * .5 + .5, nz2 = fbm(x / 35, z / 35, 2, 8) * .5 + .5;
      c.copy(g0).lerp(g1, nz).lerp(g2, smooth(.55, .9, nz2) * .6);
      if (ny < .82) c.lerp(rockC, smooth(.82, .62, ny));
      if (R.water != null && y < R.water + 2.2) c.lerp(sand, smooth(R.water + 2.2, R.water + .3, y));
      if (y > th.snow + (nz - .5) * 120) c.lerp(snowC, smooth(th.snow, th.snow + 90, y + (nz - .5) * 120) * (ny > .6 ? 1 : .4));
      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const mesh = new THREE.Mesh(g, this.terrainMat); mesh.receiveShadow = true; this.scene.add(mesh);
    // Objekte
    const objs = { conifer: [], leafy: [], rock: [], tuft: [], house: [] };
    const r = rng(hash2(cx + 5000, cz + 9000));
    const Q = this.Q.trees, treeline = th.snow - 220;
    const tries = Math.round(420 * th.trees * Q);
    for (let t = 0; t < tries; t++) {
      const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, nn = R.nearest(x, z), dist = nn ? nn.dist : 999;
      if (dist < 9) continue;
      if (nn && dist < 60 && R.townAt(nn.i * R.step)) continue;
      const y = R.heightAt(x, z);
      if (R.water != null && y < R.water + 1.5) continue;
      if (y > treeline) continue;
      // Waldflächen: Rauschen bündelt Bäume
      if (fbm(x / 260, z / 260, 2, 13) < (th.trees > .8 ? -.35 : -.05) && dist > 30) continue;
      const kind = r() < th.conifer ? 'conifer' : 'leafy';
      objs[kind].push([x, y - .2, z, .75 + r() * .75, r() * 6.28, .85 + r() * .3]);
    }
    for (let t = 0; t < Math.round(40 * th.rocks * 4 * Q); t++) {
      const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, nn = R.nearest(x, z); if (nn && nn.dist < 7) continue;
      const y = R.heightAt(x, z); if (R.water != null && y < R.water) continue;
      objs.rock.push([x, y - .3, z, .6 + r() * 2.6, r() * 6.28, 1]);
    }
    for (let t = 0; t < Math.round(420 * Q); t++) {
      const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, nn = R.nearest(x, z); if (!nn || nn.dist < 5.5 || nn.dist > 45) continue;
      const y = R.heightAt(x, z); if (R.water != null && y < R.water + 1) continue; if (y > th.snow) continue;
      objs.tuft.push([x, y - .05, z, .6 + r() * .9, r() * 6.28, 1]);
    }
    const hc = Math.round(th.houses * 40);
    for (let t = 0; t < hc; t++) {
      const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, nn = R.nearest(x, z);
      if (!nn || nn.dist < 16 || nn.dist > 70) continue;
      if (fbm(x / 400, z / 400, 2, 17) < .05) continue;
      const y = R.heightAt(x, z); if (R.water != null && y < R.water + 1.5) continue;
      const h = R.head[nn.i];
      objs.house.push([x, y - .3, z, 7 + r() * 5, -h + (r() < .5 ? 0 : Math.PI / 2), 5 + r() * 3, 8 + r() * 6, (r() * 4) | 0]);
    }
    // Ortschaften: dichte Bebauung direkt an der Straße, mehrstöckig
    if (R.towns.length) {
      const placed = [];
      for (let t = 0; t < 260; t++) {
        const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, nn = R.nearest(x, z);
        if (!nn || nn.dist < 10 || nn.dist > 48 || !R.townAt(nn.i * R.step) || R.tunnelAt(nn.i * R.step, 40)) continue;
        if (placed.some(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 < 150)) continue;
        const near = nn.dist < 24, w = near ? 7 + r() * 4 : 8 + r() * 5, dd = near ? 8 + r() * 3 : 8 + r() * 6;
        // Abstand der Hauskante zur Straße einhalten
        if (nn.dist - Math.max(w, dd) / 2 < 7.5) continue;
        placed.push([x, z]);
        const y = R.heightAt(x, z), h = R.head[nn.i];
        objs.house.push([x, y - .4, z, w, -h, near ? 7 + r() * 8 : 5 + r() * 4, dd, (r() * 4) | 0]);
      }
    }
    return { mesh, objs };
  }
  updateChunks(px, pz, budgetMs = 6) {
    const rad = this.Q.radius, cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const want = new Set();
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) if (a * a + b * b <= rad * rad + 1) want.add(this.chunkKey(cx + a, cz + b));
    for (const [k, c] of this.chunks) if (!want.has(k)) {
      const [a, b] = k.split(',').map(Number);
      if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) > rad + 1) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); this.chunks.delete(k); this.instDirty = true; }
    }
    const missing = [...want].filter(k => !this.chunks.has(k)).map(k => { const [a, b] = k.split(',').map(Number); return { k, a, b, d: (a - cx) ** 2 + (b - cz) ** 2 }; }).sort((p, q) => p.d - q.d);
    const t0 = performance.now();
    for (const m of missing) {
      this.chunks.set(m.k, this.buildChunk(m.a, m.b)); this.instDirty = true;
      if (performance.now() - t0 > budgetMs) break;
    }
    return missing.length;
  }
  rebuildInstances() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const cnt = { conifer: 0, leafy: 0, rock: 0, tuft: 0, wall: 0, roof: 0 };
    const wallCols = ['#f4efe6', '#efe2c4', '#e8d3b0', '#f6f6f2'].map(col), roofCols = ['#a8442f', '#8b3a2b', '#5e5650', '#b5562c'].map(col);
    for (const ch of this.chunks.values()) {
      for (const k of ['conifer', 'leafy', 'rock', 'tuft']) {
        const im = this.inst[k];
        for (const o of ch.objs[k]) {
          if (cnt[k] >= im.instanceMatrix.count) break;
          q.setFromAxisAngle(up, o[4]); s.set(o[3], o[3] * (k === 'rock' ? .8 : 1), o[3]); p.set(o[0], o[1], o[2]);
          m.compose(p, q, s); im.setMatrixAt(cnt[k], m);
          if (k === 'conifer' || k === 'leafy') { c.setRGB(o[5] * .95, o[5], o[5] * .9); im.setColorAt(cnt[k], c); }
          cnt[k]++;
        }
      }
      for (const o of ch.objs.house) {
        if (cnt.wall >= this.inst.wall.instanceMatrix.count) break;
        q.setFromAxisAngle(up, o[4]); s.set(o[3], o[5], o[6]); p.set(o[0], o[1], o[2]); m.compose(p, q, s); this.inst.wall.setMatrixAt(cnt.wall, m); this.inst.wall.setColorAt(cnt.wall, wallCols[o[7]]);
        s.set(o[3] * 1.12, o[3] * .55, o[6] * 1.08); p.set(o[0], o[1] + o[5], o[2]); m.compose(p, q, s); this.inst.roof.setMatrixAt(cnt.roof, m); this.inst.roof.setColorAt(cnt.roof, roofCols[o[7]]);
        cnt.wall++; cnt.roof++;
      }
    }
    for (const k in cnt) { const im = this.inst[k]; im.count = cnt[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.instDirty = false;
  }

  setPacer(on) {
    if (on && !this.pacer) { this.pacer = new Rider({ jersey: '#7b4fd6', bikeColor: '#222831', helmet: '#7b4fd6', skin: '#c99272' }); this.scene.add(this.pacer.root); }
    if (!on && this.pacer) { this.scene.remove(this.pacer.root); this.pacer = null; }
  }
  // Mitfahrer: Liste von { jersey, bikeColor, helmet, skin, name }
  setRiders(list) {
    for (const n of this.npcs) { this.scene.remove(n.rider.root); }
    this.npcs = list.map(c => {
      const rider = new Rider(c); rider.root.visible = false; this.scene.add(rider.root);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(c.name, { w: 256, h: 56, size: 34, bg: c.jersey, fg: '#fff' }), depthWrite: false, transparent: true, opacity: .92 }));
      lab.scale.set(1.1, .24, 1); lab.position.set(0, 2.05, 0); rider.root.add(lab);
      return { rider, lab };
    });
  }
  setColors(p) { this.rider.setColors(p); }
  cycleView() { this.view = (this.view + 1) % 5; this.camInit = false; return this.view; }
  // Kurzer Kameraschwenk (z. B. am Zieltor), danach zurück zur gewählten Ansicht
  cinematic(sec = 3, view = 2) { this.cine = { until: performance.now() + sec * 1000, view }; this.camInit = false; }

  // Position auf der Strecke mit Seitenversatz
  place(obj, d, lat) {
    const R = this.route, h = R.headAt(d), x = R.xAt(d) + Math.cos(h) * lat, z = R.zAt(d) + Math.sin(h) * lat;
    obj.position.set(x, R.eleAt(d) + .1, z); obj.rotation.y = -h;
    obj.rotation.x = Math.atan(R.gradeAt(d) / 100);
  }
  update(st, dt) {
    const R = this.route, d = st.dist;
    this.place(this.rider.root, d, 1.5); this.rider.root.visible = this.view !== 4;
    this.rider.update(st.crank, st.v, dt, R.gradeAt(d));
    if (this.pacer && st.pacerDist != null) { this.place(this.pacer.root, st.pacerDist, .6); this.pacer.update(st.pacerCrank, st.pacerV, dt, R.gradeAt(st.pacerDist)); }
    // Mitfahrer
    if (st.npcs) st.npcs.forEach((n, i) => {
      const o = this.npcs[i]; if (!o) return;
      let gap = n.d - d; if (R.loop) { if (gap > R.total / 2) gap -= R.total; if (gap < -R.total / 2) gap += R.total; }
      const vis = Math.abs(gap) < (this.qKey === 'low' ? 90 : 170);
      o.rider.root.visible = vis; if (!vis) return;
      this.place(o.rider.root, n.d, n.lat); o.rider.update(n.crank, n.v, dt, R.gradeAt(n.d));
      o.lab.visible = gap > 7 && gap < 45 && this.view !== 3;
    });
    // Boote schaukeln
    if (this.boats) { const t = performance.now() / 1000; for (const b of this.boats) { b.rotation.z = Math.sin(t * .9 + b.userData.ph) * .06; b.position.y = R.water + Math.sin(t * .7 + b.userData.ph) * .15; } }
    if (this.gate?.visible) this.gateRing.material.opacity = .55 + .4 * Math.sin(performance.now() / 160);
    // Im Tunnel: dunkler, Kamera bleibt hinter dem Fahrer
    const inTun = !!R.tunnelAt(d, 25);
    const expo = inTun ? .62 : 1.05; this.renderer.toneMappingExposure += (expo - this.renderer.toneMappingExposure) * Math.min(1, dt * 2.5);
    if (this.cine && performance.now() > this.cine.until) { this.cine = null; this.camInit = false; }
    let view = this.cine ? this.cine.view : this.view;
    if (inTun && view !== 4) view = 0;
    this.rider.root.visible = view !== 4;
    // Kamera
    const rp = this.rider.root.position, h = R.headAt(d);
    const fwd = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)), right = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
    const pt = (dd, lat, up) => { const hh = R.headAt(dd); return new THREE.Vector3(R.xAt(dd) + Math.cos(hh) * lat, R.eleAt(dd) + up, R.zAt(dd) + Math.sin(hh) * lat); };
    let cp, look;
    switch (view) {
      case 5: cp = pt(d + 9, -2.2, 1.4); look = pt(d - 1, 1.5, 1.1); break;
      case 0: cp = pt(d - 5.2, 1.3, 2.05); look = pt(d + 7, 1.4, 1.05); break;
      case 1: cp = pt(d - 12, 1.2, 4.8); look = pt(d + 12, 1.4, .8); break;
      case 2: cp = rp.clone().addScaledVector(right, 4.2).addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, 1.3, 0)); look = rp.clone().add(new THREE.Vector3(0, .9, 0)); break;
      case 3: cp = pt(d - 26, 1.5, 32); look = pt(d + 18, 1.5, 0); break;
      default: cp = pt(d + .2, 1.5, 1.62); look = pt(d + 30, 1.5, 1.2); break;
    }
    if (!inTun) { const ground = R.heightAt(cp.x, cp.z) + .8; if (cp.y < ground) cp.y = ground; }
    const k = this.camInit ? 1 - Math.pow(view === 4 ? .0001 : .02, dt) : 1;
    this.camPos.lerp(cp, k); this.camLook.lerp(look, k); this.camInit = true;
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    // Umgebung mitführen
    const cx = this.camPos.x, cz = this.camPos.z;
    this.sky.position.set(cx, this.camPos.y, cz); this.far.position.set(cx, R.minE - 60, cz);
    if (this.water) this.water.position.set(cx, R.water, cz);
    for (const cl of this.clouds) { const u = cl.userData; let ox = ((u.ox - cx * .15) % 6000 + 9000) % 6000 - 3000, oz = ((u.oz - cz * .15) % 6000 + 9000) % 6000 - 3000; cl.position.set(cx + ox, R.maxE + u.y, cz + oz); }
    this.sun.position.copy(rp).addScaledVector(this.sunDir, 200); this.sun.target.position.copy(rp);
    this.updateChunks(rp.x, rp.z, st.loading ? 40 : 5);
    const now = performance.now();
    if (this.instDirty && now - this.lastInst > 400) { this.rebuildInstances(); this.lastInst = now; }
    this.renderer.render(this.scene, this.camera);
  }
  // Ladebildschirm: nahe Kacheln vorab bauen
  preload(d) {
    const R = this.route; const x = R.xAt(d), z = R.zAt(d);
    let left = 1; let guard = 0;
    while (left > 0 && guard++ < 400) left = this.updateChunks(x, z, 1000);
    this.rebuildInstances();
  }
  capture(w = 1280) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement, h = Math.round(w * src.height / src.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }
  dispose() {
    this.renderer.dispose();
    this.scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
  }
}
