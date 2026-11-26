// Sprachansagen über die eingebaute Sprachausgabe des Browsers (Web Speech API, läuft offline auf dem Gerät).
// Einstellungen: profile.voiceOn, voiceKm (Ansage alle n km, 0 = aus), voiceRate, voiceName, voiceWhat (Liste der Themen)
import { profile } from './state.js';
const SS = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
export const voiceAvailable = !!SS;
export const VOICE_TOPICS = { workout: 'Intervalle im Workout', climb: 'Anstiege, Sprints und Gipfelzeiten', km: 'Zwischenstand (Kilometer)', record: 'Neue Bestleistungen', lap: 'Runden und Ziel', mp: 'Mitspieler (Beitritt, Ride On)' };
export const voices = () => (SS?.getVoices() || []).filter(v => /^de/i.test(v.lang)).concat((SS?.getVoices() || []).filter(v => !/^de/i.test(v.lang)));
let last = '', lastT = 0;
// Text vorlesbar machen: Emojis weg, Einheiten ausschreiben, Zeiten als Minuten/Sekunden
export function speakable(t) {
  return String(t)
    .replace(/(\d+):(\d\d):(\d\d)/g, (_, h, m, s) => `${+h} Stunden ${+m} Minuten`)
    .replace(/(\d+):(\d\d)/g, (_, m, s) => (+m ? `${+m} Minute${+m === 1 ? '' : 'n'}` : '') + (+s ? ` ${+s} Sekunden` : ''))
    .replace(/(\d)\s?W\b/g, '$1 Watt').replace(/km\/h/g, 'Kilometer pro Stunde').replace(/(\d)\s?km\b/g, '$1 Kilometer').replace(/(\d)\s?hm\b/g, '$1 Höhenmeter').replace(/(\d)\s?bpm\b/gi, '$1 Schläge').replace(/(\d)\s?%/g, '$1 Prozent').replace(/(\d)\s?min\b/g, '$1 Minuten').replace(/(\d)\s?s\b/g, '$1 Sekunden')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/[·|]/g, ',').replace(/\s+/g, ' ').replace(/\s+([,.!?:])/g, '$1').trim();
}
export const topicOn = topic => profile.voiceOn && voiceAvailable && (profile.voiceWhat?.[topic] ?? true);
export function say(text, topic = 'workout', { urgent = false } = {}) {
  if (!topicOn(topic)) return false;
  const t = speakable(text); if (!t || (t === last && performance.now() - lastT < 8000)) return false;
  last = t; lastT = performance.now();
  if (urgent) SS.cancel();
  const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE'; u.rate = +profile.voiceRate || 1.05; u.volume = Math.min(1, (profile.volMaster ?? 1) * 1.2);
  const v = voices().find(v => v.name === profile.voiceName) || voices().find(v => /^de/i.test(v.lang)); if (v) { u.voice = v; u.lang = v.lang; }
  SS.speak(u); return true;
}
export const hush = () => SS?.cancel();
