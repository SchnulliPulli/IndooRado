// Fahrten von außen übernehmen: Strava-Aktivitäten (z. B. von anderen Trainings-Apps übertragen) und FIT-Dateien.
// Übernommene Fahrten zählen für Fitness, Form, Leistungskurve und Summen, bringen aber keine XP.
import { db } from './db.js';
import { profile } from './state.js';
import { summarize } from './analysis.js';
import { unzip } from './fileio.js';

// Gleichmäßige Sekundenwerte erzeugen (Lücken werden mit dem letzten Wert aufgefüllt)
function toSamples(pts) {
  if (!pts.length) return [];
  const t0 = pts[0].t, end = pts[pts.length - 1].t - t0, out = [];
  let j = 0;
  for (let s = 0; s <= end && s < 6 * 3600 * 4; s++) {
    while (j < pts.length - 1 && pts[j + 1].t - t0 <= s) j++;
    const p = pts[j];
    out.push({ ts: s, p: Math.round(p.p || 0), hr: p.hr || null, cad: p.cad ?? null, v: +(p.v || 0).toFixed(2), d: +(p.d || 0).toFixed(1), e: +(p.e || 0).toFixed(1), la: p.la ?? null, lo: p.lo ?? null, g: null, tg: null, wt: null, gr: null, rd: null });
  }
  return out;
}
function makeRide(id, start, title, source, samples) {
  const sum = summarize(samples, profile);
  return {
    id, date: start, start, title, routeId: null, routeName: title, loop: false, workoutId: null, workoutName: null, workout: null, workoutDone: false,
    mode: 'import', sum, samples, climbs: [], sprints: [], intervals: [], prs: [], laps: 0, test: null, routePr: null, overtakes: 0,
    xp: 0, xpParts: [], lvBefore: null, lvAfter: null, ftpUsed: profile.ftp, shots: 0, newBadges: [], missionsDone: [], imported: source,
  };
}

/* ---------- Strava ---------- */
export function rideFromStrava(act, st) {
  const T = st.time?.data || [], at = (k, i) => st[k]?.data?.[i];
  const pts = T.map((t, i) => ({ t, p: at('watts', i), hr: at('heartrate', i), cad: at('cadence', i), d: at('distance', i), e: at('altitude', i), v: at('velocity_smooth', i), la: at('latlng', i)?.[0], lo: at('latlng', i)?.[1] }));
  return makeRide('s-' + act.id, new Date(act.start_date).toISOString(), act.name || 'Strava-Fahrt', 'strava', toSamples(pts));
}

/* ---------- FIT (Garmin, Wahoo, andere Trainings-Apps …) ---------- */
// Liest die "record"-Nachrichten: Zeit, Position, Höhe, Puls, Kadenz, Distanz, Tempo, Leistung
export function parseFit(buf) {
  const dv = new DataView(buf), hl = dv.getUint8(0), size = dv.getUint32(4, true);
  if (String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11)) !== '.FIT') throw new Error('Keine FIT-Datei');
  let p = hl; const end = Math.min(buf.byteLength, hl + size), defs = {}, recs = []; let lastTs = 0;
  const read = (base, sz, little, off) => {
    switch (base & 0x1f) {
      case 0: case 2: case 10: case 13: return sz === 1 ? dv.getUint8(off) : null;
      case 1: return dv.getInt8(off);
      case 3: return dv.getInt16(off, little); case 4: case 11: return dv.getUint16(off, little);
      case 5: return dv.getInt32(off, little); case 6: case 12: return dv.getUint32(off, little);
      default: return null;
    }
  };
  while (p < end) {
    const h = dv.getUint8(p++);
    if (h & 0x80) { // komprimierter Zeitstempel
      const lt = (h >> 5) & 3, d = defs[lt]; if (!d) break;
      const off5 = h & 0x1f; lastTs = (lastTs & ~0x1f) + off5 + (off5 < (lastTs & 0x1f) ? 0x20 : 0);
      const v = {}; let q = p; for (const f of d.f) { v[f.n] = read(f.b, f.s, d.le, q); q += f.s; } q += d.dev; p = q;
      if (d.g === 20) { v[253] = lastTs; recs.push(v); } continue;
    }
    const lt = h & 0x0f;
    if (h & 0x40) { // Definition
      const le = dv.getUint8(p + 1) === 0, g = dv.getUint16(p + 2, le), n = dv.getUint8(p + 4); p += 5;
      const f = []; for (let i = 0; i < n; i++) { f.push({ n: dv.getUint8(p), s: dv.getUint8(p + 1), b: dv.getUint8(p + 2) }); p += 3; }
      let dev = 0; if (h & 0x20) { const dn = dv.getUint8(p++); for (let i = 0; i < dn; i++) { dev += dv.getUint8(p + 1); p += 3; } }
      defs[lt] = { le, g, f, dev }; continue;
    }
    const d = defs[lt]; if (!d) break;
    const v = {}; for (const f of d.f) { v[f.n] = read(f.b, f.s, d.le, p); p += f.s; } p += d.dev;
    if (v[253] != null && v[253] !== 0xFFFFFFFF) lastTs = v[253];
    if (d.g === 20) recs.push(v);
  }
  const inv = (x, bad) => x == null || x === bad ? null : x, semi = x => x == null || x === 0x7FFFFFFF ? null : x * 180 / 2 ** 31;
  const pts = recs.filter(r => r[253] != null).map(r => ({
    t: r[253], la: semi(r[0]), lo: semi(r[1]),
    e: inv(r[78], 0xFFFFFFFF) != null ? r[78] / 5 - 500 : inv(r[2], 0xFFFF) != null ? r[2] / 5 - 500 : null,
    hr: inv(r[3], 0xFF), cad: inv(r[4], 0xFF), d: inv(r[5], 0xFFFFFFFF) != null ? r[5] / 100 : null,
    v: inv(r[73], 0xFFFFFFFF) != null ? r[73] / 1000 : inv(r[6], 0xFFFF) != null ? r[6] / 1000 : null, p: inv(r[7], 0xFFFF),
  }));
  if (pts.length < 30) throw new Error('Zu wenige Messpunkte');
  return { start: new Date((pts[0].t + 631065600) * 1000).toISOString(), pts };
}
async function fitFrom(file) {
  let blob = file;
  if (/\.gz$/i.test(file.name)) blob = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  return parseFit(await blob.arrayBuffer());
}
// Mehrere Dateien (.fit, .fit.gz, .zip mit solchen) übernehmen; doppelte Fahrten werden übersprungen
export async function importFitFiles(files, onStatus = () => { }) {
  const list = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) { for (const e of await unzipBinary(f)) if (/\.fit(\.gz)?$/i.test(e.name)) list.push(e); }
    else list.push(f);
  }
  const have = new Set((await db.all('rides')).map(r => r.start?.slice(0, 16)));
  let n = 0, skip = 0, err = 0;
  for (let i = 0; i < list.length; i++) {
    onStatus(`Datei ${i + 1} von ${list.length} …`);
    try {
      const { start, pts } = await fitFrom(list[i]);
      if (have.has(start.slice(0, 16))) { skip++; continue; }
      const name = list[i].name.replace(/\.fit(\.gz)?$/i, '').replace(/^.*\//, '');
      await db.put('rides', makeRide('f-' + Date.parse(start).toString(36), start, name, 'fit', toSamples(pts)));
      have.add(start.slice(0, 16)); n++;
    } catch (e) { err++; }
  }
  return { n, skip, err };
}
// ZIP mit Binärdateien (FIT) entpacken: nutzt den Text-Entpacker nicht, sondern liefert Blobs
async function unzipBinary(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const out = [];
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const ln = dv.getUint16(off + 26, true), lx = dv.getUint16(off + 28, true), data = buf.subarray(off + 30 + ln + lx, off + 30 + ln + lx + csize);
    let b = method === 0 ? new Blob([data]) : method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob() : null;
    if (b) { b = new File([b], name.split('/').pop()); out.push(b); }
  }
  return out;
}
export { makeRide, toSamples };
void unzip;
