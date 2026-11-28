// Workouts und Pläne per Link importieren (.zwo, .erg, .mrc, .json, .zip, .txt). Nur auf Knopfdruck: die App lädt die
// Adresse direkt vom angegebenen Server (kein Umweg über IndooRado). Viele Webseiten erlauben das Laden aus fremden
// Apps nicht (CORS) – dann hilft nur: Datei herunterladen und über „Importieren“ wählen.
// GitHub- und Gist-Links werden automatisch in Rohdaten-Links umgewandelt; enthält eine Seite Links auf Workout-Dateien,
// werden diese (höchstens 40) geladen.
const OK = /\.(zwo|erg|mrc|json|zip|txt|xml)(\?|#|$)/i;
export function normalize(u) {
  let url; try { url = new URL(String(u).trim()); } catch (e) { throw new Error('Das ist keine gültige Adresse'); }
  if (url.protocol !== 'https:') throw new Error('Nur https-Adressen');
  if (url.hostname === 'github.com') { const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/); if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`; }
  if (url.hostname === 'gist.github.com' && !/\/raw/.test(url.pathname)) return url.href.replace('gist.github.com', 'gist.githubusercontent.com').replace(/\/?$/, '/raw');
  if (/(^|\.)dropbox\.com$/.test(url.hostname)) { url.searchParams.set('dl', '1'); return url.href; }
  return url.href;
}
const nameOf = (u, fallback) => { try { const n = decodeURIComponent(new URL(u).pathname.split('/').pop() || ''); return n || fallback; } catch (e) { return fallback; } };
async function get(u) {
  let r;
  try { r = await fetch(u, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' }); }
  catch (e) { throw new Error('Der Server erlaubt das Laden aus anderen Apps nicht (CORS) oder ist nicht erreichbar. Datei herunterladen und über „Importieren“ wählen.'); }
  if (!r.ok) throw new Error('Server antwortet mit ' + r.status);
  const len = +r.headers.get('content-length') || 0; if (len > 20e6) throw new Error('Datei ist zu groß');
  return r;
}
// Liefert File-Objekte für readFiles()
export async function filesFromUrl(input, onStatus = () => { }) {
  const u = normalize(input);
  onStatus('Lade …');
  const r = await get(u), type = r.headers.get('content-type') || '';
  if (/zip/.test(type) || /\.zip(\?|#|$)/i.test(u)) { const n = nameOf(u, 'import.zip'); return [new File([await r.blob()], /\.zip$/i.test(n) ? n : n + '.zip')]; }
  const text = await r.text(); if (text.length > 5e6) throw new Error('Datei ist zu groß');
  if (!/html/.test(type) && !/^\s*(<!doctype html|<html)/i.test(text)) {
    let name = nameOf(u, 'import'); if (!/\.\w{2,4}$/.test(name)) name += /<workout_file/i.test(text) ? '.zwo' : /^\s*[{[]/.test(text) ? '.json' : '.txt';
    return [new File([text], name)];
  }
  // HTML-Seite: Links auf Workout-Dateien suchen
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const links = [...new Set([...doc.querySelectorAll('a[href]')].map(a => { try { return new URL(a.getAttribute('href'), u).href; } catch (e) { return null; } }).filter(h => h && /^https:/.test(h) && OK.test(h)))].slice(0, 40);
  if (!links.length) throw new Error('Auf dieser Seite wurden keine Workout-Dateien gefunden. Direkt den Link auf die .zwo-Datei nehmen.');
  const out = [];
  for (let i = 0; i < links.length; i++) { onStatus(`Lade ${i + 1} / ${links.length} …`); try { const x = await get(normalize(links[i])); out.push(new File([await x.blob()], nameOf(links[i], 'workout' + (i + 1) + '.zwo'))); } catch (e) { } }
  if (!out.length) throw new Error('Die verlinkten Dateien ließen sich nicht laden (CORS).');
  return out;
}
