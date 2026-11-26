// Saison: Belohnungspfad mit 25 Stufen und Werkstatt für Rad-Upgrades
import { $, esc, toast } from '../util.js';
import { profile, saveProfile, progress } from '../state.js';
import { seasonOf, seasonState, rewardsOf, TIER_XP, TIERS, PARTS, partLv, tokensFree, buyPart, resetParts, upgradeEffect, trophies, seasonTitles } from '../season.js';

const pct = x => (x > 0 ? '−' : '+') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' %';
export async function render(el) {
  const s = seasonOf(), st = seasonState(s), rw = rewardsOf(s), days = Math.ceil((s.end - Date.now()) / 864e5);
  const inTier = st.xp - st.tier * TIER_XP, e = upgradeEffect(), free = tokensFree();
  const fx = x => [x.cda && x.cda !== 1 ? `Luftwiderstand ${pct(1 - x.cda)}` : '', x.crr && x.crr !== 1 ? `Rollwiderstand ${pct(1 - x.crr)}` : '', x.kg ? `Gewicht ${String(x.kg).replace('.', ',').replace('-', '−')} kg` : ''].filter(Boolean).join(' · ') || 'Serie';
  el.innerHTML = `
  <section class="pagehead"><h1>${s.emoji} ${esc(s.name)}</h1><span class="small muted">noch ${days} Tage · danach startet eine neue Saison mit neuen Farben</span></section>
  <section class="card seasonhead">
    <div class="row between"><div><div class="small muted">Saison-Stufe</div><div class="stier num">${st.tier}<small> / ${TIERS}</small></div></div>
      <div class="sxp"><div class="row between small"><span>${st.tier >= TIERS ? 'Saison geschafft! 🏆' : `Stufe ${st.tier + 1}: ${esc(rw[st.tier].label)}`}</span><span class="num">${st.tier >= TIERS ? st.xp + ' XP' : `${inTier} / ${TIER_XP} XP`}</span></div>
      <div class="bar"><i style="width:${st.tier >= TIERS ? 100 : inTier / TIER_XP * 100}%"></i></div></div></div>
    <p class="small muted">Jede Fahrt zählt: alle XP dieser Saison (Fahrt, Missionen, Gipfel, Sprints, Multiplayer) bringen dich Stufe um Stufe weiter. Belohnungen bleiben dir für immer.</p>
  </section>
  <section class="card"><h2>Belohnungspfad</h2>
    <div class="spath" id="spath">${rw.map(r => `<div class="stile ${r.t <= st.tier ? 'got' : r.t === st.tier + 1 ? 'next' : ''} k-${r.kind}"><span class="sn">${r.t}</span><span class="sr">${r.kind === 'color' ? `<i class="sw" style="background:${r.c}"></i>` : ''}${esc(r.label)}</span>${r.t <= st.tier ? '<span class="sok">✓</span>' : ''}</div>`).join('')}</div>
  </section>
  <section class="card"><div class="row between"><h2>🔧 Werkstatt</h2><span class="tok">${free} Gutschein${free === 1 ? '' : 'e'} frei</span></div>
    <p class="small muted">Jede dritte Saison-Stufe bringt einen Teile-Gutschein. Die nächste Ausbaustufe kostet so viele Gutscheine, wie ihre Nummer ist (1, 2, 3). Die Teile machen dich in der virtuellen Welt etwas schneller – wie ein echtes Upgrade.</p>
    <div class="parts">${Object.entries(PARTS).map(([k, P]) => { const l = partLv(k), nx = P.lv[l + 1]; return `<div class="part"><div class="pi">${P.i}</div><div class="pb"><b>${P.n}: ${esc(P.lv[l][0])}</b><div class="plv">${P.lv.map((_, i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</div><div class="small muted">${fx(P.lv[l][1])}</div>
      ${nx ? `<button class="btn sm ${free >= l + 1 ? 'pri' : ''}" data-buy="${k}" ${free >= l + 1 ? '' : 'disabled'}>→ ${esc(nx[0])} (${l + 1} 🔧)</button><div class="small muted">${fx(nx[1])}</div>` : '<span class="prtag">Maximal ausgebaut</span>'}</div></div>`; }).join('')}</div>
    <div class="row between" style="margin-top:12px"><label class="switch"><input type="checkbox" id="upOn" ${profile.upgradesOn !== false ? 'checked' : ''}><span></span> <div class="swt">Upgrades in Fahrten nutzen<small class="muted">Gesamt: ${fx(e)}. Sobald echte Mitfahrer auf deiner Strecke sind, gelten für alle gleiche Bedingungen.</small></div></label>
      <button class="btn sm ghost" id="upReset">Teile zurückgeben</button></div>
  </section>
  <section class="grid2">
    <div class="card"><h2>🏆 Pokale</h2>${trophies().length ? `<div class="chips-row">${trophies().map(t => `<span class="prtag">🏆 ${esc(t.replace(/(\d+)-Q(\d)/, (m, y, q) => ['Winter', 'Frühling', 'Sommer', 'Herbst'][q - 1] + ' ' + y))}</span>`).join('')}</div>` : '<p class="muted small">Erreiche Stufe 25 für den Saison-Pokal und den Gold-Lack.</p>'}</div>
    <div class="card"><h2>🏷️ Titel</h2>${seasonTitles().length ? `<label class="f">Titel neben deinem Namen<select class="inp" id="titleSel"><option value="">Kein Titel</option>${seasonTitles().map(t => `<option ${profile.title === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : '<p class="muted small">Titel gibt es auf den Stufen 8, 14, 20 und 23.</p>'}</div>
  </section>`;
  $('#spath', el).querySelector('.next')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  el.onclick = e => {
    const b = e.target.closest('[data-buy]'); if (b) { if (buyPart(b.dataset.buy)) { toast('🔧 Eingebaut!'); render(el); } return; }
    if (e.target.closest('#upReset')) { resetParts(); toast('Teile zurückgegeben – Gutscheine wieder frei'); render(el); }
  };
  $('#upOn', el).onchange = e => { profile.upgradesOn = e.target.checked; saveProfile(); };
  const ts = $('#titleSel', el); if (ts) ts.onchange = () => { profile.title = ts.value; saveProfile(); toast('Gespeichert', 900); };
}
