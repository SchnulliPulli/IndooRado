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
    if (j.veloverse === 'plan' || (j.wos && j.perWeek)) return { plan: { name: j.name || base.replace(/\.\w+$/, ''), perWeek: j.perWeek || 3, wos: j.wos, weeksLayout: j.weeksLayout } };
    if (j.veloverse === 'workout' || j.segs) return { workout: { ...j, id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), cat: j.cat && !/^Plan:/.test(j.cat) ? j.cat : 'Eigene', builtin: false, created: new Date().toISOString() } };
    throw new Error('Unbekanntes JSON-Format');
  }
  if (/\.zwo$/i.test(base) || /<workout/i.test(text.slice(0, 4000))) return { workout: parseZwo(text, base.replace(/\.\w+$/, '')) };
  if (/\.(erg|mrc)$/i.test(base) || /\[COURSE DATA\]/i.test(text)) return { workout: parseErg(text, base, ftp) };
  // Textdatei mit einer kopierten Plan-Übersicht (Wochen, Workouts, Schritte wie „5min @ 196W“)
  if (/\.(txt|md|text)$/i.test(base) || /\d+\s*(min|sec).*@\s*\d+\s*W/i.test(text.slice(0, 4000))) {
    const p = parsePlanText(text); if (p?.wos?.length) return { plan: { ...p, name: p.name && p.name !== 'Plan' ? p.name : base.replace(/\.\w+$/, '') } };
  }
  return null;
}

// Dateien einlesen: liefert gefundene Workouts, Pläne und Fehler
export async function readFiles(files, ftp) {
  const res = { workouts: [], plans: [], errors: [], zips: [] };
  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        const entries = (await unzip(f)).filter(e => /\.(zwo|erg|mrc|json|xml|txt)$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
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
export const planToJson = p => JSON.stringify({ veloverse: 'plan', version: 1, name: p.name, perWeek: p.perWeek, weeksLayout: p.weeks?.map(w => w.length), wos: p.all.map(w => ({ name: w.name, desc: w.desc, segs: w.segs })) }, null, 1);
export const workoutToJson = w => JSON.stringify({ veloverse: 'workout', version: 1, name: w.name, cat: w.cat, desc: w.desc, segs: w.segs }, null, 1);

/* ---------- Plan aus eingefügtem Text (z. B. Wochenübersicht von whatsonzwift) ---------- */
// Erkennt Wochen ("Week 3", "Week 0 Prep"), Workouts (Titel, dann Schritte bis "View %FTP"), Schritte wie
// "10min from 76 to 196W", "3min 30sec @ 244W", "3min @ 55rpm, 257W", "2min free ride", "1hr 10min free ride",
// Wiederholungen "10x 3min @ 271W," + nächste Zeile "1min @ 166W". Watt werden über "Update FTP (300W)" in % FTP umgerechnet.
const T = s => { const m = String(s).trim().match(/^(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*sec)?$/); return m && (m[1] || m[2] || m[3]) ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };
function stepOf(s) {
  s = s.trim().replace(/,$/, '');
  let m = s.match(/^(.+?)\s+from\s+(\d+)\s+to\s+(\d+)\s*W$/i); if (m && T(m[1])) return { dur: T(m[1]), wa: +m[2], wb: +m[3] };
  m = s.match(/^(.+?)\s+free ride$/i); if (m && T(m[1])) return { dur: T(m[1]), free: true };
  m = s.match(/^(.+?)\s+@\s+(?:(\d+)\s*rpm,\s*)?(\d+)\s*W$/i); if (m && T(m[1])) return { dur: T(m[1]), wa: +m[3], wb: +m[3], cad: m[2] ? +m[2] : undefined };
  return null;
}
export function parsePlanText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const wos = []; let week = null, cur = null, pend = null, last = '', name = '';
  for (const l of lines) {
    let m = l.match(/^\d+\.\s*\[Week\s+(\d+)[^\]]*\]/i) || l.match(/^Week\s+(\d+)(\s+\w+)?$/i);
    if (m && !cur) { week = +m[1]; continue; }
    if (!name && !/^(Plan overview|Weeks?:|Duration|Stress|Workouts?:|Total|Zone|Z\d|\d+%|Share|Select|\*|\[|\d+\.)/i.test(l) && !stepOf(l)) name = l;
    const rep = l.match(/^(\d+)x\s+(.+),$/i);
    if (rep && stepOf(rep[2])) { if (!cur) cur = { week, name: last, steps: [] }; pend = { n: +rep[1], on: stepOf(rep[2]) }; continue; }
    const st = stepOf(l);
    if (st) {
      if (!cur) cur = { week, name: last, steps: [] };
      if (pend) { for (let i = 0; i < pend.n; i++) cur.steps.push(pend.on, st); pend = null; } else cur.steps.push(st);
      continue;
    }
    if (cur && /^View %FTP/i.test(l)) {
      const ftp = +(l.match(/FTP\s*\((\d+)\s*W\)/i)?.[1] || 300);
      const segs = cur.steps.map(s => s.free ? { dur: s.dur, a: null, b: null } : { dur: s.dur, a: Math.round(s.wa / ftp * 1000) / 1000, b: Math.round(s.wb / ftp * 1000) / 1000, ...(s.cad ? { cad: s.cad } : {}) });
      if (segs.length) wos.push({ week: cur.week ?? 1, name: cur.name || 'Workout ' + (wos.length + 1), desc: '', segs });
      cur = null; pend = null; continue;
    }
    if (!cur) last = l.replace(/^\d+\.\s*/, '').replace(/^\[(.+)\]\(.+\)$/, '$1');
  }
  if (!wos.length) throw new Error('Keine Workouts im Text erkannt');
  // Wochen in Reihenfolge, Anzahl je Woche
  const weeks = [...new Set(wos.map(w => w.week))].sort((a, b) => a - b);
  const sorted = weeks.flatMap(k => wos.filter(w => w.week === k));
  return { name: name || 'Eingefügter Plan', perWeek: Math.max(...weeks.map(k => wos.filter(w => w.week === k).length)), weeksLayout: weeks.map(k => wos.filter(w => w.week === k).length), wos: sorted.map(({ week, ...w }) => w) };
}
