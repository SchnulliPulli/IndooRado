// Familienprofile: mehrere Personen auf einem Gerät, jede mit eigenen Fahrten, Einstellungen und Fortschritt
// (eigene lokale Datenbank). Kinderprofile: ohne Online-Bereich, sanfter Widerstand, kurze bunte Fahrten.
// Online-Konten (Supabase) behalten ihren eigenen Wechsel; ein Familienprofil ist immer abgemeldet.
import { profile, saveProfile, sel, saveSel } from './state.js';
import { kv } from './db.js';

const KEY = 'vvFamily', CUR = 'vvFamCur', SEED = 'vvFamSeed';
export function family() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
const save = l => localStorage.setItem(KEY, JSON.stringify(l.slice(0, 8)));
export const currentId = () => localStorage.getItem(CUR) || 'main';
export const isKid = () => !!profile.kid;
const rid = () => Math.random().toString(36).slice(2, 10);

export function addMember(name, kid) {
  const m = { id: rid(), name: String(name).trim().slice(0, 30) || (kid ? 'Kind' : 'Fahrer'), kid: !!kid, created: Date.now() };
  m.db = 'trittwerk-fam-' + m.id; save([...family(), m]);
  localStorage.setItem(SEED + ':' + m.db, JSON.stringify({ name: m.name, kid: m.kid }));
  return m;
}
export function removeMember(id) { save(family().filter(m => m.id !== id)); try { indexedDB.deleteDatabase('trittwerk-fam-' + id); } catch (e) { } }
export function renameMember(id, name) { save(family().map(m => m.id === id ? { ...m, name: String(name).trim().slice(0, 30) || m.name } : m)); }

// Wechseln: laufende Anmeldung merken (wie beim Kontowechsel) und für das Familienprofil abmelden, dann neu laden
export async function switchTo(id) {
  const O = await import('./online/client.js');
  if (O.loggedIn()) O.rememberAccount();
  for (const st of [localStorage, sessionStorage]) for (const k of Object.keys(st)) if (k.startsWith('vv-auth')) st.removeItem(k);
  if (id === 'main') {
    localStorage.removeItem(CUR); const mainDb = localStorage.getItem('vvMainDb') || 'trittwerk'; localStorage.setItem('vvDb', mainDb);
    // War das Hauptprofil online angemeldet: diese Anmeldung wiederherstellen
    const acc = O.accounts().find(a => a.session?.refresh_token && O.dbFor(a.uid) === mainDb); if (acc) return O.switchAccount(acc.uid);
  }
  else {
    const m = family().find(x => x.id === id); if (!m) return;
    if (currentId() === 'main') localStorage.setItem('vvMainDb', localStorage.getItem('vvDb') || 'trittwerk');
    localStorage.setItem(CUR, id); localStorage.setItem('vvDb', m.db);
  }
  location.hash = '#/'; location.reload();
}
// Nach dem Laden einmalig: neues Profil mit Namen und (für Kinder) sanften Voreinstellungen füllen
export async function applySeed() {
  const db = localStorage.getItem('vvDb') || 'trittwerk', k = SEED + ':' + db, raw = localStorage.getItem(k); if (!raw) return;
  localStorage.removeItem(k);
  const s = JSON.parse(raw); profile.name = s.name;
  if (s.kid) Object.assign(profile, { kid: true, kg: 35, ftp: 90, simDiff: 35, askForm: false, drinkTips: true, drinkEvery: 10, voice: false });
  saveProfile();
  if (s.kid) { sel.routeId = 'b-candy'; sel.workoutId = null; sel.npcs = true; sel.mode = 'gear'; saveSel(); }
  await kv.set('onboarded', true);
}
// Name des aktiven Profils (für die Kopfleiste)
export const currentName = () => currentId() === 'main' ? null : family().find(m => m.id === currentId())?.name || null;

/* ---------- Karte „Familienprofile“ (Einstellungen › Profil) ---------- */
export function familyCardHtml(esc) {
  const L = family(), cur = currentId();
  const row = (id, name, kid, extra = '') => `<div class="famrow ${id === cur ? 'on' : ''}"><span class="famic">${kid ? '🧒' : '🚴'}</span><b>${esc(name)}</b>${kid ? '<span class="prtag" style="background:#7ad">Kind</span>' : ''}<span class="grow"></span>${id === cur ? '<span class="small muted">aktiv</span>' : `<button class="btn xs pri" data-fam-sw="${id}">Wechseln</button>`}${extra}</div>`;
  return `<h2>👨‍👩‍👧 Familienprofile</h2>
    <p class="small muted">Mehrere Personen auf diesem Gerät: Jedes Profil hat eigene Fahrten, Einstellungen, Level und Pläne. Kinderprofile haben einen sanften Widerstand, kurze bunte Fahrten und keinen Online-Bereich.</p>
    <div class="famlist">${row('main', cur === 'main' ? (profile.name || 'Hauptprofil') : 'Hauptprofil', false)}${L.map(m => row(m.id, m.name, m.kid, m.id !== cur ? `<button class="btn xs ghost danger" data-fam-del="${m.id}" title="Profil und seine Daten löschen">✕</button>` : '')).join('')}</div>
    <div class="row famadd"><input class="inp sm" id="famName" maxlength="30" placeholder="Name"><label class="switch"><input type="checkbox" id="famKid"><span></span> <div class="swt">Kind</div></label><button class="btn sm" id="famAdd" ${L.length >= 8 ? 'disabled' : ''}>+ Profil</button></div>`;
}
export function wireFamilyCard(box, esc, dialog, toast) {
  box.addEventListener('click', async e => {
    const sw = e.target.closest('[data-fam-sw]');
    if (sw) { if (document.querySelector('.resumebar:not([hidden])')) { toast('Bitte erst die Fahrt beenden'); return; } return switchTo(sw.dataset.famSw); }
    const del = e.target.closest('[data-fam-del]');
    if (del) { const m = family().find(x => x.id === del.dataset.famDel); if (await dialog({ title: `Profil „${esc(m?.name || '')}“ löschen?`, html: '<p class="muted">Alle Fahrten, Einstellungen und der Fortschritt dieses Profils auf diesem Gerät werden gelöscht.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { removeMember(m.id); box.innerHTML = familyCardHtml(esc); } return; }
    if (e.target.closest('#famAdd')) { const n = box.querySelector('#famName').value.trim(); if (!n) { toast('Bitte einen Namen eingeben'); return; } const m = addMember(n, box.querySelector('#famKid').checked); toast(`Profil „${m.name}“ angelegt`); box.innerHTML = familyCardHtml(esc); }
  });
}
