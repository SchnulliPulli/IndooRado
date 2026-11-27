// Übersicht der Tastenkürzel (Taste ? überall in der App)
import { dialog } from './util.js';
export const RIDE = [
  ['Leertaste', 'Pause / weiter'], ['↑ / +', 'Hochschalten (schwerer)'], ['↓ / −', 'Runterschalten (leichter)'], ['← / →', 'Spur wechseln, überholen'],
  ['1 – 6', 'Kamera-Ansicht (6 = Rückblick)'], ['C', 'Nächste Kamera'], ['K', 'Karte öffnen / schließen (beamen)'], ['W', 'Tageszeit und Wetter'],
  ['N', 'Mitfahrer (Bots) an/aus'], ['R', 'Ride On geben'], ['U', 'Power-up benutzen'], ['P', 'Foto speichern'], ['O', 'Fotomodus'],
  ['M', 'Ton an/aus'], ['T', 'Nächstes Musikstück'], ['Esc', 'Karte und Menüs schließen'], ['?', 'Diese Übersicht'],
];
const APP = [['?', 'Tastenkürzel anzeigen'], ['Tab / Umschalt+Tab', 'Durch Knöpfe und Felder springen'], ['Enter / Leertaste', 'Knopf auslösen'], ['Esc', 'Dialog schließen']];
const tbl = rows => `<table class="keys">${rows.map(([k, l]) => `<tr><td>${k.split(' / ').map(x => `<kbd>${x}</kbd>`).join(' / ')}</td><td>${l}</td></tr>`).join('')}</table>`;
let open = false;
export function showShortcuts() {
  if (open) return; open = true;
  dialog({ title: 'Tastenkürzel', html: `<h3>In der Fahrt</h3>${tbl(RIDE)}<h3>Überall</h3>${tbl(APP)}<p class="small muted">Lenkertasten deiner Rolle oder einer Bluetooth-Fernbedienung kannst du unter Geräte › Tasten anlernen belegen.</p>`, buttons: [{ label: 'Schließen', value: 1, cls: 'pri' }] }).then(() => { open = false; });
}
export function initShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.key !== '?' || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    e.preventDefault(); showShortcuts();
  });
}
