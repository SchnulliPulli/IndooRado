// Import und Export von Workouts und Plänen: .zwo, .erg, .mrc, .json (VeloVerse) und .zip mit solchen Dateien
import { parseZwo, parseErg } from './workouts.js';

// ZIP lesen (ohne Bibliothek): zentrales Verzeichnis, gespeicherte oder "deflate"-komprimierte Einträge
export async function unzip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const ln = dv.getUint16(off + 26, true), lx = dv.getUint16(off + 28, true), data = buf.subarray(off + 30 + ln + lx, off + 30 + ln + lx + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push({ name, text: new TextDecoder().decode(bytes) });
  }
  return out;
}

// Eine Textdatei in Workouts oder einen Plan umwandeln
function fromText(name, text, ftp) {
  const base = name.split('/').pop();
  if (/\.json$/i.test(base) || /^\s*[{[]/.test(text)) {
    const j = JSON.parse(text);
    if (j.veloverse === 'plan' || (j.wos && j.perWeek)) return { plan: { name: j.name || base.replace(/\.\w+$/, ''), perWeek: j.perWeek || 3, wos: j.wos } };
    if (j.veloverse === 'workout' || j.segs) return { workout: { ...j, id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), cat: j.cat && !/^Plan:/.test(j.cat) ? j.cat : 'Eigene', builtin: false, created: new Date().toISOString() } };
    throw new Error('Unbekanntes JSON-Format');
  }
  if (/\.zwo$/i.test(base) || /<workout/i.test(text.slice(0, 4000))) return { workout: parseZwo(text, base.replace(/\.\w+$/, '')) };
  if (/\.(erg|mrc)$/i.test(base) || /\[COURSE DATA\]/i.test(text)) return { workout: parseErg(text, base, ftp) };
  return null;
}

// Dateien einlesen: liefert gefundene Workouts, Pläne und Fehler
export async function readFiles(files, ftp) {
  const res = { workouts: [], plans: [], errors: [], zips: [] };
  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        const entries = (await unzip(f)).filter(e => /\.(zwo|erg|mrc|json|xml)$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
        const wos = [];
        for (const e of entries) { try { const r = fromText(e.name, e.text, ftp); if (r?.workout) wos.push(r.workout); if (r?.plan) res.plans.push(r.plan); } catch (err) { res.errors.push(e.name + ': ' + err.message); } }
        if (wos.length) res.zips.push({ name: f.name.replace(/\.zip$/i, ''), wos });
      } else {
        const r = fromText(f.name, await f.text(), ftp);
        if (!r) res.errors.push(f.name + ': Format nicht erkannt'); else { if (r.workout) res.workouts.push(r.workout); if (r.plan) res.plans.push(r.plan); }
      }
    } catch (e) { res.errors.push(f.name + ': ' + e.message); }
  }
  return res;
}

// Export als .zwo (lesbar von Zwift, TrainingPeaks, intervals.icu und vielen anderen)
const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toZwo(w) {
  const r = v => (+v).toFixed(3), segs = w.segs.map((g, i) => {
    const txt = g.text ? `<textevent timeoffset="0" message="${x(g.text)}"/>` : '', cad = g.cad ? ` Cadence="${g.cad}"` : '';
    if (g.a == null) return `<FreeRide Duration="${g.dur}"${cad}>${txt}</FreeRide>`;
    if (Math.abs(g.a - g.b) < .005) return `<SteadyState Duration="${g.dur}" Power="${r(g.a)}"${cad}>${txt}</SteadyState>`;
    const tag = i === 0 && g.b > g.a ? 'Warmup' : i === w.segs.length - 1 && g.b < g.a ? 'Cooldown' : 'Ramp';
    return `<${tag} Duration="${g.dur}" PowerLow="${r(g.a)}" PowerHigh="${r(g.b)}"${cad}>${txt}</${tag}>`;
  });
  return `<workout_file>\n  <author>VeloVerse</author>\n  <name>${x(w.name)}</name>\n  <description>${x(w.desc || '')}</description>\n  <sportType>bike</sportType>\n  <workout>\n    ${segs.join('\n    ')}\n  </workout>\n</workout_file>\n`;
}
export const planToJson = p => JSON.stringify({ veloverse: 'plan', version: 1, name: p.name, perWeek: p.perWeek, wos: p.all.map(w => ({ name: w.name, desc: w.desc, segs: w.segs })) }, null, 1);
export const workoutToJson = w => JSON.stringify({ veloverse: 'workout', version: 1, name: w.name, cat: w.cat, desc: w.desc, segs: w.segs }, null, 1);
