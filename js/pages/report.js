// Trainingsbericht für eine Woche oder einen Monat: Summen mit Vergleich zum Zeitraum davor, Tage, Leistungszonen,
// Bestwerte, Form und alle Fahrten. „Als PDF“ nutzt den Druckdialog des Browsers (Ziel „Als PDF speichern“),
// „Teilen“ schickt eine kurze Zusammenfassung als Text. Alles wird nur im Browser berechnet.
import { $, esc, fmtKm, fmtDur, fmtT, ZONES, toast } from '../util.js';
import { db } from '../db.js';
import { profile } from '../state.js';
import { bestCurve, fitness } from '../analysis.js';

const loc = () => document.documentElement.lang || 'de';
function period(kind, off) {
  const now = new Date(); let s, e;
  if (kind === 'month') { s = new Date(now.getFullYear(), now.getMonth() + off, 1); e = new Date(s.getFullYear(), s.getMonth() + 1, 1); }
  else { s = new Date(now); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7) + off * 7); e = new Date(+s + 7 * 864e5); }
  const label = kind === 'month' ? s.toLocaleDateString(loc(), { month: 'long', year: 'numeric' })
    : `${s.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' })} – ${new Date(+e - 864e5).toLocaleDateString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  return { s, e, label };
}
const inP = (r, p) => { const t = +new Date(r.date); return t >= +p.s && t < +p.e; };
function sums(list) {
  const o = { n: list.length, dur: 0, dist: 0, asc: 0, tss: 0, kj: 0, kcal: 0, wo: 0, pw: 0 };
  for (const r of list) { const m = r.sum || {}; o.dur += m.dur || 0; o.dist += m.dist || 0; o.asc += m.asc || 0; o.tss += m.tss || 0; o.kj += m.kj || 0; o.kcal += m.kcal || 0; o.pw += (m.avgP || 0) * (m.dur || 0); if (r.workoutDone) o.wo++; }
  o.avgP = o.dur ? o.pw / o.dur : 0; return o;
}
// Zeit je Leistungszone aus den Messpunkten (Abstand der Zeitstempel, höchstens 5 s je Punkt)
function zoneTime(list, ftp) {
  const z = ZONES.map(() => 0);
  for (const r of list) { const S = r.samples || [], f = r.ftpUsed || ftp; for (let i = 1; i < S.length; i++) { const p = S[i].p; if (p == null) continue; const dt = Math.min(5, Math.max(0, (S[i].ts - S[i - 1].ts) || 1)); const k = ZONES.findIndex(q => p / f < q.max); if (k >= 0) z[k] += dt; } }
  return z;
}
const delta = (a, b) => { if (!b) return a ? '<span class="rpup">neu</span>' : ''; const d = Math.round((a - b) / b * 100); return d ? `<span class="${d > 0 ? 'rpup' : 'rpdn'}">${d > 0 ? '+' : ''}${d} %</span>` : '<span class="muted">±0 %</span>'; };

export async function render(el, [kind0, off0]) {
  const kind = kind0 === 'month' ? 'month' : 'week', off = Math.min(0, Math.max(-60, parseInt(off0) || 0));
  const all = (await db.all('rides')).sort((a, b) => a.date.localeCompare(b.date));
  const P = period(kind, off), prev = period(kind, off - 1);
  const list = all.filter(r => inP(r, P)), before = all.filter(r => inP(r, prev));
  const t = sums(list), b = sums(before);
  // Tage
  const days = []; for (let d = new Date(P.s); d < P.e; d.setDate(d.getDate() + 1)) { const k = new Date(d); const l = list.filter(r => new Date(r.date).toDateString() === k.toDateString()); days.push({ d: k, min: l.reduce((a, r) => a + (r.sum?.dur || 0), 0) / 60, tss: l.reduce((a, r) => a + (r.sum?.tss || 0), 0) }); }
  const maxMin = Math.max(30, ...days.map(x => x.min)), W = 640, H = 120, bw = W / days.length;
  const bars = days.map((x, i) => { const h = x.min / maxMin * (H - 22); return `<rect x="${i * bw + bw * .15}" y="${H - 16 - h}" width="${bw * .7}" height="${Math.max(h, x.min ? 2 : 0)}" rx="3" fill="var(--acc)"/>${days.length <= 7 || x.d.getDate() % 5 === 1 ? `<text x="${i * bw + bw / 2}" y="${H - 3}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${kind === 'week' ? x.d.toLocaleDateString(loc(), { weekday: 'short' }) : x.d.getDate()}</text>` : ''}`; }).join('');
  const z = zoneTime(list, profile.ftp), zsum = z.reduce((a, x) => a + x, 0) || 1;
  const bc = bestCurve(list), bp = bestCurve(all.filter(r => +new Date(r.date) < +P.s));
  const fit = fitness(all, 400).filter(x => x.day < P.e.toISOString().slice(0, 10)).at(-1) || { ctl: 0, atl: 0, tsb: 0 };
  const longest = [...list].sort((a, c) => (c.sum?.dur || 0) - (a.sum?.dur || 0))[0];
  const tile = (v, l, d = '') => `<div class="rptile"><b class="num">${v}</b><span>${l}</span>${d ? `<small>${d}</small>` : ''}</div>`;
  el.innerHTML = `<section class="pagehead noprint"><h1>📄 Trainingsbericht</h1><div class="row">
      <div class="seg sm" id="rpKind"><button data-k="week" aria-pressed="${kind === 'week'}">Woche</button><button data-k="month" aria-pressed="${kind === 'month'}">Monat</button></div>
      <button class="btn sm" id="rpPrev" aria-label="Zeitraum davor">‹</button><button class="btn sm" id="rpNext" aria-label="Zeitraum danach" ${off >= 0 ? 'disabled' : ''}>›</button>
      <button class="btn sm pri" id="rpPdf">🖨️ Als PDF / Drucken</button><button class="btn sm" id="rpShare">📤 Teilen</button></div></section>
    <article class="card rpdoc" id="rpDoc">
      <header class="rphead"><div><div class="small muted">IndooRado · Trainingsbericht</div><h2>${esc(P.label)}</h2></div><div class="rpname">${esc(profile.name || '')}<small class="muted">FTP ${profile.ftp} W · ${profile.kg} kg</small></div></header>
      ${list.length ? `
      <div class="rptiles">${tile(t.n, 'Fahrten', delta(t.n, b.n))}${tile(fmtDur(t.dur), 'Fahrzeit', delta(t.dur, b.dur))}${tile(fmtKm(t.dist), 'km', delta(t.dist, b.dist))}${tile(Math.round(t.asc).toLocaleString(loc()), 'Höhenmeter', delta(t.asc, b.asc))}${tile(Math.round(t.tss), 'TSS', delta(t.tss, b.tss))}${tile(Math.round(t.kj).toLocaleString(loc()), 'kJ', delta(t.kj, b.kj))}${tile(Math.round(t.avgP) + ' W', 'Ø Leistung')}${tile(t.wo, 'Workouts komplett')}</div>
      <p class="small muted">Vergleich mit dem Zeitraum davor (${esc(prev.label)}).</p>
      <h3 class="sub">Fahrzeit je Tag</h3><svg class="rpbars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minuten je Tag">${bars}</svg>
      <div class="grid2"><div><h3 class="sub">Zeit in Leistungszonen</h3><div class="rpzones">${ZONES.map((q, i) => z[i] ? `<div class="rpz"><span>${esc(q.n)}</span><i style="--w:${(z[i] / zsum * 100).toFixed(1)}%;--c:${q.c}"></i><b class="num">${fmtDur(z[i])}</b></div>` : '').join('') || '<p class="small muted">Keine Leistungsdaten.</p>'}</div></div>
        <div><h3 class="sub">Bestwerte im Zeitraum</h3><table class="rptab">${[[5, '5 s'], [60, '1 min'], [300, '5 min'], [1200, '20 min']].map(([k, l]) => bc[k] ? `<tr><td>${l}</td><td class="num"><b>${Math.round(bc[k].w)} W</b></td><td class="small">${!bp[k] || bc[k].w > bp[k].w ? '🏆 Allzeit-Bestwert' : `<span class="muted">Bestwert ${Math.round(bp[k].w)} W</span>`}</td></tr>` : '').join('')}</table>
          <h3 class="sub">Form am Ende</h3><p class="num">Fitness ${Math.round(fit.ctl)} · Ermüdung ${Math.round(fit.atl)} · Frische ${fit.ctl - fit.atl > 0 ? '+' : ''}${Math.round(fit.ctl - fit.atl)}</p>
          ${longest ? `<p class="small">Längste Fahrt: <b>${esc(longest.title || longest.routeName || '')}</b> · ${fmtDur(longest.sum?.dur || 0)}</p>` : ''}</div></div>
      <h3 class="sub">Alle Fahrten</h3><table class="rptab rplist"><thead><tr><th>Datum</th><th>Fahrt</th><th>Zeit</th><th>km</th><th>Ø W</th><th>TSS</th></tr></thead><tbody>
        ${list.map(r => `<tr><td>${new Date(r.date).toLocaleDateString(loc(), { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td>${esc(r.title || r.routeName || '')}${r.workoutDone ? ' ✅' : ''}</td><td class="num">${fmtT(r.sum?.dur || 0)}</td><td class="num">${fmtKm(r.sum?.dist || 0)}</td><td class="num">${Math.round(r.sum?.avgP || 0)}</td><td class="num">${Math.round(r.sum?.tss || 0)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">In diesem Zeitraum gibt es keine Fahrten.</p>`}
      <footer class="small muted rpfoot">Erstellt mit IndooRado · ${new Date().toLocaleDateString(loc())}</footer>
    </article>`;
  const go = (k, o) => { location.hash = `#/report/${k}/${o}`; };
  el.querySelectorAll('#rpKind button').forEach(x => x.onclick = () => go(x.dataset.k, 0));
  $('#rpPrev', el).onclick = () => go(kind, off - 1); $('#rpNext', el).onclick = () => go(kind, Math.min(0, off + 1));
  $('#rpPdf', el).onclick = () => { document.body.classList.add('printrep'); const done = () => { document.body.classList.remove('printrep'); removeEventListener('afterprint', done); }; addEventListener('afterprint', done); setTimeout(() => window.print(), 50); };
  $('#rpShare', el).onclick = async () => {
    const txt = `🚴 IndooRado · ${P.label}\n${t.n} Fahrten · ${fmtDur(t.dur)} · ${fmtKm(t.dist)} km · ${Math.round(t.asc)} Hm · TSS ${Math.round(t.tss)}${t.wo ? ` · ${t.wo} Workouts komplett` : ''}`;
    try { if (navigator.share) { await navigator.share({ text: txt }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(txt); toast('Zusammenfassung kopiert'); } catch (e) { toast('Kopieren nicht möglich'); }
  };
}
