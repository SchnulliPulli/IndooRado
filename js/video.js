// Videofahrten: eigene Aufnahme (GoPro, Handy) + GPX. Das Video läuft passend zur eigenen Geschwindigkeit,
// der Widerstand folgt wie bei jeder GPX-Strecke dem Anstieg. Das Video bleibt auf dem Gerät: gespeichert wird nur
// ein Verweis auf die Datei (Chrome/Edge am Computer) – sonst wählt man die Datei vor der Fahrt kurz neu aus.
import { kv } from './db.js';

export const canKeepHandle = typeof window !== 'undefined' && 'showOpenFilePicker' in window;
const KEY = 'videoHandles'; // nur lokal (siehe LOCAL_ONLY in sync.js)

// Datei wählen: mit Verweis (merkt sich die Datei) oder klassisch per Dateiauswahl
export async function pickVideo() {
  if (canKeepHandle) {
    try {
      const [h] = await window.showOpenFilePicker({ types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv'] } }], multiple: false });
      return { file: await h.getFile(), handle: h };
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*,.mp4,.mov,.m4v,.webm,.mkv';
    i.onchange = () => res(i.files[0] ? { file: i.files[0], handle: null } : null);
    i.addEventListener('cancel', () => res(null)); i.click();
  });
}
export async function rememberHandle(routeId, handle) { if (!handle) return; const m = await kv.get(KEY, {}); m[routeId] = handle; await kv.set(KEY, m); }
export async function forgetHandle(routeId) { const m = await kv.get(KEY, {}); delete m[routeId]; await kv.set(KEY, m); }
// Gemerkte Datei öffnen (muss aus einem Klick heraus aufgerufen werden, wegen der Berechtigungsabfrage)
export async function openRemembered(routeId) {
  const h = (await kv.get(KEY, {}))[routeId]; if (!h) return null;
  try {
    let st = await h.queryPermission?.({ mode: 'read' }); if (st !== 'granted') st = await h.requestPermission?.({ mode: 'read' });
    if (st && st !== 'granted') return null;
    return await h.getFile();
  } catch (e) { return null; }
}
export const hasRemembered = async routeId => !!(await kv.get(KEY, {}))[routeId];

// Länge des Videos (Sekunden) und ob der Browser es abspielen kann
export function probe(file) {
  return new Promise(res => {
    const v = document.createElement('video'), url = URL.createObjectURL(file); v.preload = 'metadata'; v.muted = true;
    const done = r => { URL.revokeObjectURL(url); res(r); };
    v.onloadedmetadata = () => done({ ok: true, dur: v.duration, w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => done({ ok: false }); setTimeout(() => done({ ok: false, timeout: true }), 15000);
    v.src = url;
  });
}
// Versatz schätzen: Video-Datei wurde am Ende der Aufnahme gespeichert (Änderungsdatum), GPX-Zeit des Starts bekannt
export function guessOffset(raw, file, dur) {
  if (!raw.t0 || !file.lastModified || !dur) return 0;
  const vStart = file.lastModified / 1000 - dur, gStart = Date.parse(raw.t0) / 1000, off = gStart - vStart; // Videozeit beim GPX-Start
  return Math.abs(off) < 6 * 3600 && off > -dur ? Math.round(off) : 0;
}

/* ---------- Abgleich während der Fahrt ----------
   Strecke d (m) → Aufnahmezeit t(d) aus den GPX-Zeitstempeln (oder gleichmäßig, wenn keine da sind) → Videozeit.
   Die Abspielgeschwindigkeit folgt dem Verhältnis eigene/aufgenommene Geschwindigkeit, kleine Abweichungen werden
   sanft nachgeregelt, große (z. B. nach Zurückspringen) per Sprung. */
const hav = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r, x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
export class VideoSync {
  constructor(el, raw, total, meta) {
    this.v = el; this.total = total; this.off = meta.offset || 0; this.dur = meta.dur || el.duration || 0;
    const P = raw.pts, cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + hav(P[i - 1], P[i]));
    this.fr = cum.map(c => c / (cum[cum.length - 1] || 1));
    this.tm = raw.tm?.length === P.length ? raw.tm : null;
    this.span = this.tm ? this.tm[this.tm.length - 1] : Math.max(1, this.dur - this.off);
    this.last = -1;
  }
  // Aufnahmezeit an Stelle d
  timeAt(d) {
    const f = Math.min(1, Math.max(0, d / this.total)); if (!this.tm) return f * this.span;
    const F = this.fr; let lo = 0, hi = F.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m] <= f) lo = m; else hi = m; }
    const k = F[hi] > F[lo] ? (f - F[lo]) / (F[hi] - F[lo]) : 0; return this.tm[lo] + (this.tm[hi] - this.tm[lo]) * k;
  }
  // aufgenommene Geschwindigkeit (m/s) um d herum
  recSpeed(d) { const a = Math.max(0, d - 25), b = Math.min(this.total, d + 25), dt = this.timeAt(b) - this.timeAt(a); return dt > .2 ? (b - a) / dt : 0; }
  update(d, v, moving) {
    const V = this.v; if (!V.duration) return;
    const target = Math.min(V.duration - .05, Math.max(0, this.off + this.timeAt(d)));
    if (!moving || v < .3) { if (!V.paused) V.pause(); if (Math.abs(V.currentTime - target) > .6) V.currentTime = target; return; }
    const err = target - V.currentTime;
    if (Math.abs(err) > 4) { V.currentTime = target; return; }
    const rec = this.recSpeed(d), base = rec > .5 ? v / rec : 1;
    const rate = Math.min(4, Math.max(.25, base + err * .5));
    if (Math.abs(V.playbackRate - rate) > .03) V.playbackRate = rate;
    if (V.paused) V.play().catch(() => { });
  }
}
