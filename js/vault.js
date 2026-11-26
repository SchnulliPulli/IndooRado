// Tresor-Verschlüsselung für den Online-Speicher (Ende-zu-Ende): Daten werden im Browser verschlüsselt, bevor sie zu
// Supabase gehen. Der Schlüssel entsteht aus einem eigenen Tresor-Passwort (nicht dem Login-Passwort, das sieht der Server).
// Verfahren: PBKDF2-SHA-256 (600 000 Runden) → AES-256-GCM, je Datei ein zufälliger IV. Alles über die Web Crypto API.
// Online liegt nur „vault.json“ (Salz, Rundenzahl, Prüfwert) – daraus lässt sich der Schlüssel ohne Passwort nicht gewinnen.
// Der Schlüssel bleibt auf jedem Gerät lokal gespeichert (nicht exportierbar) und wird nie hochgeladen.
import { kv } from './db.js';

const MAGIC = new Uint8Array([86, 86, 69, 49]); // "VVE1"
const CHECK = 'veloverse-vault-ok';
const ITER = 600000;
export const vault = { key: null, meta: null, status: 'unknown' }; // status: unknown | off | locked | on
const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(pass, salt, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export const isEncrypted = u8 => u8.length > 16 && MAGIC.every((b, i) => u8[i] === b);
export async function encrypt(data, key = vault.key) {
  const plain = data instanceof Uint8Array ? data : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new TextEncoder().encode(String(data));
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(4 + 12 + ct.length); out.set(MAGIC); out.set(iv, 4); out.set(ct, 16); return out;
}
export async function decrypt(u8, key = vault.key) {
  if (!key) { const e = new Error('Deine Online-Daten sind verschlüsselt. Bitte unter Konto › Tresor das Tresor-Passwort eingeben.'); e.locked = true; throw e; }
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(4, 16) }, key, u8.slice(16)));
}
// Zustand aus dem Online-Speicher (vault.json) und dem lokal gespeicherten Schlüssel ermitteln
export async function loadVault(io) {
  let meta = null; try { const b = await io.getRaw('vault.json'); if (b) meta = JSON.parse(await b.text()); } catch (e) { if (!/not.?found/i.test(e.message)) throw e; }
  vault.meta = meta; vault.key = meta ? await kv.get('vaultKey:' + meta.id, null) : null;
  vault.status = !meta ? 'off' : vault.key ? 'on' : 'locked';
  return vault.status;
}
// Einschalten: Schlüssel erzeugen, Prüfwert und Salz online ablegen, Schlüssel lokal speichern
export async function enableVault(io, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive(pass, salt), id = b64(crypto.getRandomValues(new Uint8Array(9)));
  const meta = { v: 1, id, alg: 'PBKDF2-SHA256/AES-256-GCM', iter: ITER, salt: b64(salt), check: b64(await encrypt(CHECK, key)), created: new Date().toISOString() };
  await kv.set('vaultKey:' + id, key);
  vault.key = key; vault.meta = meta; vault.status = 'on';
  await io.putRaw('vault.json', JSON.stringify(meta), 'application/json');
}
// Entsperren auf einem weiteren Gerät: Passwort prüfen (über den Prüfwert), Schlüssel lokal speichern
export async function unlockVault(pass) {
  const m = vault.meta; if (!m) throw new Error('Kein Tresor eingerichtet');
  const key = await derive(pass, unb64(m.salt), m.iter);
  let ok = false; try { ok = new TextDecoder().decode(await decrypt(unb64(m.check), key)) === CHECK; } catch (e) { }
  if (!ok) throw new Error('Tresor-Passwort stimmt nicht');
  await kv.set('vaultKey:' + m.id, key); vault.key = key; vault.status = 'on';
}
export async function forgetLocalKey() { if (vault.meta) await kv.del('vaultKey:' + vault.meta.id); vault.key = null; vault.status = vault.meta ? 'locked' : 'off'; }
export async function disableVaultMeta(io) { const id = vault.meta?.id; await io.delRaw('vault.json'); if (id) await kv.del('vaultKey:' + id); vault.meta = null; vault.key = null; vault.status = 'off'; }
