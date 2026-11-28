// Echte Straßenbilder zur GPX-Strecke (Mapillary, frei unter CC BY-SA). Nur mit Konto und Einwilligung.
// Der Zugangsschlüssel ist ein öffentlicher Client-Schlüssel (MLY|…) aus online.json („mapillary“) oder aus den
// Einstellungen. Bilder werden per Abruf als Blob geladen (strenge Content-Security-Policy bleibt unverändert).
import { profile } from './state.js';
import { esc } from './util.js';

export const MLY_TERMS = 1;
const API = 'https://graph.mapillary.com/images';
export async function token() { const O = await import('./online/client.js'); return (profile.mlyToken || O.config?.().mapillary || '').trim(); }
export async function possible(route) {
  if (!route?.vraw && !route?.geo) return false;
  const O = await import('./online/client.js');
  return !route.builtin && !route.kit && O.loggedIn() && !!(await token()) && profile.streetImgs !== false;
}
export async function askConsent() {
  const { consent } = await import('./consent.js');
  return consent('mly', MLY_TERMS, { title: 'Echte Straßenbilder', html: `<p>Für Fotos der echten Straße fragt IndooRado den Dienst <b>Mapillary</b> (Meta Platforms Ireland Ltd.) nach Bildern entlang deiner Strecke. Dabei werden Kartenausschnitte deiner Strecke und – technisch bedingt – deine IP-Adresse an Mapillary übertragen.</p><p class="small muted">Die Bilder stammen von Freiwilligen und stehen unter CC BY-SA 4.0. Abschalten jederzeit unter Einstellungen › Fahrt &amp; Ton; Widerruf unter App &amp; Daten › Einwilligungen.</p>` });
}

/* Bilder entlang der Strecke: Abschnitte von ~600 m nacheinander vorausladen, jedem Bild die Streckenposition zuordnen */
export class StreetImages {
  constructor(route, box) {
    this.R = route; this.box = box; this.imgs = []; this.done = new Set(); this.busy = false; this.cur = null; this.blobs = new Map(); this.fail = 0;
    this.SEG = 600;
  }
  async seg(i) {
    if (this.done.has(i) || this.busy || this.fail > 3) return; this.busy = true; this.done.add(i);
    try {
      const R = this.R, d0 = i * this.SEG, d1 = Math.min(R.total, d0 + this.SEG); let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
      for (let d = d0; d <= d1; d += 50) { const la = R.latAt(d), lo = R.lonAt(d); la0 = Math.min(la0, la); la1 = Math.max(la1, la); lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); }
      const pad = .0004, q = new URLSearchParams({ access_token: await token(), fields: 'id,thumb_1024_url,computed_geometry,captured_at,compass_angle', bbox: [lo0 - pad, la0 - pad, lo1 + pad, la1 + pad].map(v => v.toFixed(6)).join(','), limit: '200' });
      const r = await fetch(API + '?' + q, { referrerPolicy: 'no-referrer' }); if (!r.ok) { this.fail++; return; }
      const j = await r.json();
      for (const im of j.data || []) {
        const c = im.computed_geometry?.coordinates; if (!c || !im.thumb_1024_url) continue;
        // nächste Streckenposition im Abschnitt suchen (Abstand höchstens 25 m)
        let best = null, bd = 25; const kx = 111320 * Math.cos(c[1] * Math.PI / 180);
        for (let d = d0; d <= d1; d += 10) { const dx = (R.lonAt(d) - c[0]) * kx, dy = (R.latAt(d) - c[1]) * 110540, dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = d; } }
        if (best != null) this.imgs.push({ id: im.id, d: best, url: im.thumb_1024_url, at: im.captured_at });
      }
      this.imgs.sort((a, b) => a.d - b.d);
    } catch (e) { this.fail++; } finally { this.busy = false; }
  }
  // je Bildposition nur das neueste Bild (alte Aufnahmen ausblenden)
  pick(d) { let p = null; for (const im of this.imgs) { if (im.d < d - 5) continue; if (im.d > d + 80) break; if (!p || Math.abs(im.d - d - 15) < Math.abs(p.d - d - 15) || (Math.abs(im.d - p.d) < 8 && (im.at || 0) > (p.at || 0))) p = im; } return p; }
  async update(d) {
    const i = Math.floor(d / this.SEG); this.seg(i); if (!this.busy) this.seg(i + 1);
    const im = this.pick(d); if (!im || im.id === this.cur) return; this.cur = im.id;
    try {
      let u = this.blobs.get(im.id);
      if (!u) { const r = await fetch(im.url, { referrerPolicy: 'no-referrer' }); if (!r.ok) return; u = URL.createObjectURL(await r.blob()); this.blobs.set(im.id, u); if (this.blobs.size > 12) { const [k, v] = this.blobs.entries().next().value; URL.revokeObjectURL(v); this.blobs.delete(k); } }
      if (this.cur !== im.id) return;
      const img = this.box.querySelector('img'); img.classList.remove('on'); img.onload = () => img.classList.add('on'); img.src = u;
      this.box.hidden = false; this.box.querySelector('.siat').textContent = im.at ? new Date(im.at).toLocaleDateString(document.documentElement.lang, { month: 'short', year: 'numeric' }) : '';
    } catch (e) { }
  }
  destroy() { for (const u of this.blobs.values()) URL.revokeObjectURL(u); this.blobs.clear(); this.box?.remove(); }
}
export const boxHtml = () => `<img alt="Straßenbild an dieser Stelle"><span class="siattr">© Mapillary · CC BY-SA <span class="siat"></span></span><button class="sibig" title="Größer/kleiner">⤢</button>`;
