// "Lebendige Welt": Effekte mit sehr wenig Rechenaufwand
// - Wolkenschatten wandern über das Gelände (ein paar Sinus-Zeilen im Gelände-Shader)
// - Bäume und Gras wiegen sich im Wind (Verschiebung im Vertex-Shader, keine zusätzlichen Objekte)
// - nasse Straße glänzt bei Regen, Gegenlicht bei tief stehender Sonne
// - Partikel je Landschaft: Laub im Wald, Pollen auf Wiesen, Staub auf Schotter und Mond, Schnee im Hochgebirge
// - Zuschauer an Gipfeln, die jubeln und hüpfen, wenn du vorbeikommst
import * as THREE from 'three';

export const U = { time: { value: 0 }, wind: { value: 1 }, clouds: { value: 1 } };

// Wolkenschatten im Gelände
export function cloudShadows(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uClouds = U.clouds;
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWp;\nuniform float uTime;\nuniform float uClouds;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      vec2 cp = vWp.xz * 0.0045 + vec2(uTime * 0.018, uTime * 0.011);
      float c = sin(cp.x) * sin(cp.y * 1.3) + 0.55 * sin(cp.x * 2.3 + cp.y * 1.7 + 1.3) + 0.3 * sin(cp.y * 3.7 - cp.x * 1.1);
      gl_FragColor.rgb *= mix(1.0, 0.74, smoothstep(0.45, 0.95, c) * uClouds);`);
  };
  mat.customProgramCacheKey = () => 'cloudshadow';
  mat.needsUpdate = true;
}
// Wind: je höher über dem Boden, desto mehr Ausschlag; jede Pflanze schwingt etwas anders
export function windSway(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.13;
        float hh = max(position.y - 0.6, 0.0);
        transformed.x += (sin(uTime * 1.7 + ph) + 0.4 * sin(uTime * 4.1 + ph * 2.0)) * hh * 0.022 * uWind;
        transformed.z += cos(uTime * 1.3 + ph) * hh * 0.014 * uWind;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'windsway';
  mat.needsUpdate = true;
}

// Gegenlicht: zwei weiche Leuchtflecken in Richtung Sonne
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,210,1)'); g.addColorStop(.25, 'rgba(255,220,170,.45)'); g.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeFlare(scene) {
  const tex = glowTex(), mk = (s, o) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, opacity: o, depthWrite: false, depthTest: false, fog: false })); sp.scale.set(s, s, 1); sp.renderOrder = 10; scene.add(sp); return sp; };
  return { main: mk(520, .55), ghost: mk(140, .25), ghost2: mk(70, .2) };
}
export function updateFlare(F, cam, sunDir, on) {
  const v = new THREE.Vector3(), fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const k = on ? Math.max(0, fwd.dot(sunDir) - .55) / .45 : 0;
  for (const s of [F.main, F.ghost, F.ghost2]) s.visible = k > .01;
  if (k <= .01) return;
  v.copy(cam.position).addScaledVector(sunDir, 3000); F.main.position.copy(v); F.main.material.opacity = .6 * k;
  // Geisterflecken auf der Linie Sonne → Bildmitte
  const center = cam.position.clone().addScaledVector(fwd, 3000);
  F.ghost.position.copy(v).lerp(center, 1.45); F.ghost.material.opacity = .22 * k;
  F.ghost2.position.copy(v).lerp(center, 1.8); F.ghost2.material.opacity = .18 * k;
}

// Partikel rund um die Kamera
const PK = { leaves: ['#d98a2b', '#b5651d', '#8fae3a', '#e0b030'], pollen: ['#ffffff', '#fff6c8'], dust: ['#b9a689', '#a08a6a'], moon: ['#c8cacf'], snow: ['#ffffff'] };
export function makeParticles(scene, kind, n = 260) {
  if (!kind) return null;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { pos.set([(Math.random() - .5) * 40, Math.random() * 12, (Math.random() - .5) * 40], i * 3); c.set(PK[kind][i % PK[kind].length]); col.set([c.r, c.g, c.b], i * 3); vel.set([(Math.random() - .5) * .6, kind === 'leaves' ? -.5 - Math.random() * .5 : kind === 'snow' ? -.8 : (Math.random() - .3) * .25, (Math.random() - .5) * .6], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: kind === 'leaves' ? .13 : kind === 'pollen' ? .05 : .07, vertexColors: true, transparent: true, opacity: kind === 'dust' || kind === 'moon' ? .55 : .9, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  return { pts, vel, n, kind, base: new THREE.Vector3(), t: 0 };
}
export function updateParticles(P, cam, dt, v, ground) {
  if (!P) return;
  const a = P.pts.geometry.attributes.position.array, cx = cam.position.x, cy = ground ?? cam.position.y - 2, cz = cam.position.z; P.t += dt;
  for (let i = 0; i < P.n; i++) {
    const k = i * 3;
    a[k] += (P.vel[k] + Math.sin(P.t * 1.3 + i) * .3) * dt; a[k + 1] += P.vel[k + 1] * dt; a[k + 2] += (P.vel[k + 2] + Math.cos(P.t + i * .7) * .3) * dt;
    // aus dem Würfel um die Kamera gefallen: auf der anderen Seite neu einsetzen
    let x = a[k] - cx, y = a[k + 1] - cy, z = a[k + 2] - cz;
    if (x > 20) a[k] -= 40; else if (x < -20) a[k] += 40;
    if (z > 20) a[k + 2] -= 40; else if (z < -20) a[k + 2] += 40;
    if (y < -.5) a[k + 1] = cy + (P.kind === 'dust' || P.kind === 'moon' ? Math.random() * 1.5 : 8 + Math.random() * 4); else if (y > 14) a[k + 1] = cy + Math.random();
  }
  P.pts.geometry.attributes.position.needsUpdate = true;
  // Staub nur bei Fahrt sichtbar, je schneller desto mehr
  if (P.kind === 'dust' || P.kind === 'moon') P.pts.material.opacity = Math.min(.6, .1 + v * .05);
}
export const particleKind = th => th.moon ? 'moon' : th.cactus || th.dry ? 'dust' : th.snow < 2000 ? 'snow' : th.trees >= .8 ? 'leaves' : 'pollen';

// Zuschauer an den letzten 300 m jedes Anstiegs
export function makeSpectators(world, R, mat) {
  if (!R.climbs.length) return null;
  const body = new THREE.CapsuleGeometry(.22, .7, 3, 6).translate(0, .62, 0), head = new THREE.SphereGeometry(.17, 8, 6).translate(0, 1.38, 0);
  const merged = mergeGeo([body, head]);
  const list = [];
  for (const c of R.climbs) for (let d = Math.max(c.from, c.to - 300); d < c.to; d += 7 + Math.random() * 6) for (const s of [-1, 1]) if (Math.random() < .8) list.push({ d, lat: s * (4.4 + Math.random() * 2.2) });
  const im = new THREE.InstancedMesh(merged, mat, list.length), m4 = new THREE.Matrix4(), cols = ['#ef4458', '#3fa7f5', '#f5c542', '#4fd18b', '#ff6a3d', '#f2f4f6', '#7b4fd6', '#1b1e22'];
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
  const c3 = new THREE.Color();
  list.forEach((p, i) => { const x = R.xAt(p.d), z = R.zAt(p.d), h = R.headAt(p.d), px = x + Math.cos(h) * p.lat, pz = z + Math.sin(h) * p.lat; p.pos = new THREE.Vector3(px, R.heightAt(px, pz), pz); p.ph = Math.random() * 6; m4.makeTranslation(p.pos.x, p.pos.y, p.pos.z); im.setMatrixAt(i, m4); im.setColorAt(i, c3.set(cols[i % cols.length])); });
  im.castShadow = true; world.scene.add(im);
  return { im, list };
}
export function updateSpectators(SP, d, t) {
  if (!SP) return;
  const m4 = new THREE.Matrix4(); let dirty = false;
  for (const [i, p] of SP.list.entries()) {
    const near = Math.abs(p.d - d) < 45, j = near ? Math.abs(Math.sin(t * 7 + p.ph)) * .35 : 0;
    if (!near && !p.j) continue;
    p.j = j; m4.makeTranslation(p.pos.x, p.pos.y + j, p.pos.z); SP.im.setMatrixAt(i, m4); dirty = true;
  }
  if (dirty) SP.im.instanceMatrix.needsUpdate = true;
}
function mergeGeo(geos) {
  // einfache Zusammenführung ohne Zusatzbibliothek (nur Position und Normale)
  let n = 0, ni = 0; for (const g of geos) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    const I = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()]; for (let k = 0; k < I.length; k++) idx[oi + k] = I[k] + o;
    o += g.attributes.position.count; oi += I.length;
  }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
}
