// Trainer-Hinweise: wie ein Abschnitt zu fahren ist (Kadenz, Haltung, Atmung, Gefühl)
const pick = (arr, seed) => arr[Math.abs(seed | 0) % arr.length];

// Kadenzbereich für einen Abschnitt: vorgegeben (seg.cad) oder passend zur Intensität
export function cadRange(g) {
  if (g.cad) return [g.cad - 5, g.cad + 5];
  const f = g.a == null ? null : (g.a + g.b) / 2;
  if (f == null) return null;
  if (f < .56) return [80, 95];
  if (f < .9) return [85, 95];
  if (f < 1.06) return [88, 98];
  if (f < 1.21) return [95, 105];
  return [100, 115];
}

export function tipFor(g, i = 0, prev = null) {
  const f = g.a == null ? null : (g.a + g.b) / 2, c = g.cad, ramp = g.a != null && Math.abs(g.b - g.a) > .08;
  const after = prev && prev.a != null && (prev.a + prev.b) / 2 > 1;
  if (f == null) {
    if (/sprint/i.test(g.text || '')) return 'Aus dem Sattel, hohe Kadenz 110+, die letzten Sekunden nicht nachlassen.';
    if (/20 Minuten/.test(g.text || '')) return 'Gleichmäßig starten, die ersten 5 Minuten eher etwas zu ruhig. Am Ende alles geben.';
    return 'Frei fahren: Gang und Tempo selbst wählen.';
  }
  if (c && c <= 70) return pick([`Kraftausdauer: ${c} U/min sitzend, Rumpf fest, Oberkörper ruhig. Druck über die ganze Kurbelumdrehung.`, `Niedrige Kadenz ${c} U/min. Knie gerade führen, nicht am Lenker ziehen.`], i);
  if (c && c >= 105) return pick([`Hohe Kadenz ${c} U/min: rund treten, Hüfte ruhig auf dem Sattel, nicht hüpfen.`, `Spin-Up auf ${c} U/min. Fußgelenk locker, Zug nach hinten unten am Pedal.`], i);
  if (c && c >= 98) return `Zügige Kadenz um ${c} U/min, Beine leicht halten, Druck gleichmäßig.`;
  if (ramp && g.b > g.a) return pick(['Langsam steigern, Kadenz 85 bis 95. Gelenke und Atmung kommen in Gang.', 'Locker einrollen, Schultern runter, ruhig durch die Nase atmen.'], i);
  if (ramp && g.b < g.a) return 'Ausrollen: leicht kurbeln, trinken, Puls runterkommen lassen.';
  if (f < .56) return after ? pick(['Erholung: ganz locker treten, tief ausatmen, trinken.', 'Pause aktiv nutzen: leichter Gang, 85 bis 95 U/min, Schultern lockern.'], i) : 'Sehr locker, 85 bis 95 U/min.';
  if (f < .76) return pick(['Grundlage: gleichmäßig, du könntest dich noch unterhalten. 85 bis 95 U/min.', 'Ruhige Ausdauer. Sitzposition prüfen, Hände locker am Lenker.'], i);
  if (f < .88) return pick(['Tempo: konzentriert, aber kontrolliert. 85 bis 95 U/min, sprechen nur in Sätzen.', 'Tempobereich. Gleichmäßiger Druck, nicht mit der Kadenz spielen.'], i);
  if (f < .95) return pick(['Sweet Spot: komfortabel hart. 88 bis 95 U/min, Atmung tief und rhythmisch.', 'Sweet Spot. Oberkörper still, ruhig atmen, im Kopf in Abschnitte teilen.'], i);
  if (f < 1.06) return pick(['Schwelle: ruhig bleiben, nicht überziehen. 90 bis 95 U/min.', 'An der Schwelle. Fokus auf die Atmung, Gesicht und Schultern entspannen.'], i);
  if (f < 1.21) return pick(['VO2max: Kadenz hoch, 95 bis 105. Die ersten 30 Sekunden nicht überpacen.', 'Hart! Atmung tief, die zweite Hälfte ist der Teil, der zählt.'], i);
  return pick(['Anaerob: explosiv antreten, 100 bis 115 U/min, kurz und voll.', 'Sehr hart und kurz. Kraftvoll, aber sitzend rund treten.'], i);
}
