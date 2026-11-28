// Versionsanzeige: build.json entsteht beim Veröffentlichen (GitHub Actions) mit Commit, Datum und Build-Nummer.
// Wird vom eigenen Server geladen (keine externe Verbindung). Lokal ohne build.json: nur die App-Version.
export const APP_VERSION = '2026.11';
let info = null;
export async function buildInfo() {
  if (info) return info;
  let b = null; try { const r = await fetch('build.json', { cache: 'no-cache' }); if (r.ok) b = await r.json(); } catch (e) { }
  let cache = ''; try { cache = (await caches.keys()).find(k => k.startsWith('indoorado-')) || ''; } catch (e) { }
  return info = { version: APP_VERSION, cache, ...(b && typeof b.commit === 'string' ? { commit: b.commit.replace(/[^0-9a-f]/gi, '').slice(0, 40), short: String(b.short || '').replace(/[^0-9a-f]/gi, '').slice(0, 12), date: b.date, build: +b.build || null, message: String(b.message || '').slice(0, 120), repo: /^[\w.-]+\/[\w.-]+$/.test(b.repo || '') ? b.repo : null } : {}) };
}
// Kurzer Text, z. B. „2026.11 · Build 87 · a1b2c3d · 26.11.2026“
export function buildText(i) {
  const d = i.date ? new Date(i.date).toLocaleString(document.documentElement.lang, { dateStyle: 'short', timeStyle: 'short' }) : '';
  return [i.version, i.build ? 'Build ' + i.build : null, i.short || null, d || null].filter(Boolean).join(' · ') + (i.commit ? '' : ' · lokaler Stand');
}
export const commitUrl = i => i.commit && i.repo ? `https://github.com/${i.repo}/commit/${i.commit}` : null;
