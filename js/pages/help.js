// Anleitung
const S = (id, title, body) => `<section class="card help" id="${id}"><h2>${title}</h2>${body}</section>`;

export async function render(el) {
  el.innerHTML = `
  <section class="pagehead"><h1>Anleitung</h1></section>
  <nav class="chips-row helpnav">${[['start', 'Erste Schritte'], ['geraete', 'Geräte'], ['fahren', 'Fahren'], ['tasten', 'Tasten und Click'], ['workouts', 'Workouts und Pläne'], ['import', 'Dateien importieren'], ['strecken', 'Strecken und Gelände'], ['spiel', 'Level und Missionen'], ['daten', 'Daten, NAS, Strava'], ['tipps', 'Tipps']].map(([k, l]) => `<a class="chipb" href="#/help" data-go="${k}">${l}</a>`).join('')}</nav>
  ${S('start', 'Erste Schritte', `<ol class="tips">
    <li>Unter <a href="#/profile">Profil</a> Name, <b>FTP</b> und Gewicht eintragen. Alle Workout-Ziele hängen an der FTP.</li>
    <li>Unter <a href="#/devices">Geräte</a> Smart-Trainer, Pulsgurt, Trittfrequenz-Sensor und Zwift Click verbinden. Ohne Geräte lässt sich alles im Demo-Modus testen.</li>
    <li>Auf der <a href="#/">Startseite</a> Strecke und Workout wählen, dann „Fahrt starten“. Die Fahrt beginnt, sobald du trittst.</li>
    <li>Am Ende „Beenden“ → „Speichern“. Erst gespeicherte Fahrten zählen für Level, Missionen, Plan und Bestzeiten.</li>
  </ol><p class="small muted">Bluetooth funktioniert in Chrome und Edge (Windows, macOS, Android, ChromeOS), nicht in Safari und nicht unter iOS. Der Knopf oben rechts schaltet das Vollbild ein, es bleibt beim Seitenwechsel erhalten.</p>`)}
  ${S('geraete', 'Geräte', `<ul class="tips">
    <li><b>Smart-Trainer</b> (FTMS): liefert Leistung und Kadenz und wird von der App gesteuert, entweder mit festen Watt (ERG) oder über die Steigung.</li>
    <li><b>Pulsgurt</b>: für Pulsanzeige, Pulszonen und die adaptive Steuerung.</li>
    <li><b>Zwift Click</b>: virtuelles Schalten. Die Tasten lassen sich unter Geräte anlernen.</li>
    <li>Bekannte Geräte verbindet die App beim Start selbst wieder, wenn der Browser das unterstützt.</li>
  </ul>`)}
  ${S('fahren', 'Fahren', `<ul class="tips">
    <li><b>Widerstand</b>: „Virtuelle Gänge“ (wie draußen schalten, die App rechnet Leistung aus Gang, Kadenz und Steigung), „Steigung“ (geht direkt an den Trainer) oder „ERG fix“ (feste Wattzahl).</li>
    <li><b>Mitfahrer</b> fahren mit, geben Windschatten (bis 33 % weniger Luftwiderstand, wenn du dicht dahinter bist) und zählen beim Überholen.</li>
    <li><b>Zieltore</b>: Kurz vor Ende eines Intervalls steht ein Tor auf der Straße, beim Durchfahren schwenkt die Kamera.</li>
    <li><b>Karte</b> (Minikarte antippen oder Taste K): ganze Strecke, Schnellziele und <b>Beamen</b> an jede Stelle. Gebeamte Fahrten zählen nicht als Streckenbestzeit.</li>
    <li><b>Menü</b>: pausiert die Fahrt und öffnet das Startmenü. Mit dem Balken „Zurück zur Fahrt“ geht es weiter, treten setzt die Fahrt fort.</li>
    <li><b>Wetter</b> (Taste W): Morgen, Tag, Abend, Nacht und klar, Wolken, Regen, Nebel oder automatisch nach Uhrzeit.</li>
    <li><b>Anordnen</b>: Anzeigen per Ziehen verschieben (eigene Anordnung für kleine und große Bildschirme), „Zurücksetzen“ stellt alles zurück. Die Workout-Box lässt sich durch Antippen der Kopfzeile einklappen.</li>
    <li><b>Ton</b> (Taste M): Fahrtwind, Reifen, Kette und Kurbel, Natur, Countdown und Fanfaren. Lautstärken unter Profil.</li>
  </ul>`)}
  ${S('tasten', 'Tasten und Zwift Click', `<table class="tbl"><tr><th>Taste</th><th>Funktion</th></tr>${[['↑ / + und ↓ / −', 'Schalten, im ERG ±10 W, im Workout Intensität ±2 %'], ['Leertaste', 'Pause / weiter'], ['C oder 1–5', 'Kamera'], ['P', 'Foto'], ['K', 'Karte und Beamen'], ['W', 'Wetter und Tageszeit'], ['M', 'Ton an/aus'], ['N', 'Mitfahrer an/aus'], ['Esc', 'Karte und Fenster schließen']].map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join('')}</table>
    <p><b>Zwift Click</b>: einzelner Klick schaltet. <b>Dreimal schnell Plus</b> springt zum nächsten Intervall, <b>dreimal schnell Minus</b> startet das Intervall neu (in den ersten 10 Sekunden eins zurück). Die drei Schaltvorgänge werden dabei zurückgenommen. Abschaltbar unter Profil.</p>`)}
  ${S('workouts', 'Workouts und Pläne', `<ul class="tips">
    <li>Ziele sind Prozent deiner FTP. Ändert sich die FTP (z. B. nach einem FTP-Test), passen sich alle Workouts und Pläne an.</li>
    <li><b>Adaptiv</b>: Bricht die Kadenz ein, wird der Widerstand kurz gesenkt. Ist der Puls lange am Anschlag, sinkt die Intensität um 3 %. Schafft der Trainer das Ziel nicht, gibt es einen Hinweis. Umschalten mit dem Feld „adaptiv“.</li>
    <li>Jedes Intervall zeigt einen <b>Tipp</b> zu Kadenz und Fahrweise sowie einen Kadenz-Zielbereich.</li>
    <li><b>Pläne</b> führen Woche für Woche durch passende Workouts. Eine Einheit zählt ab 90 % als erledigt, du kannst Einheiten überspringen.</li>
  </ul>`)}
  ${S('import', 'Dateien importieren und exportieren', `<table class="tbl"><tr><th>Format</th><th>Wo</th><th>Hinweis</th></tr>
    ${[['.zwo', 'Workouts, Pläne', 'Zwift-Workout, auch von Sammlungen wie whatsonzwift (dort „Download .zwo“)'], ['.erg / .mrc', 'Workouts, Pläne', 'Watt- bzw. Prozent-Kurven (TrainerRoad, Golden Cheetah u. a.)'], ['.zip', 'Workouts, Pläne', 'Archiv mit .zwo/.erg/.mrc, wird auf Wunsch als Plan angelegt (Reihenfolge nach Dateiname)'], ['.json', 'Workouts, Pläne', 'VeloVerse-Export eines Workouts oder ganzen Plans'], ['.gpx', 'Strecken', 'Track aus Komoot, Strava, Garmin usw., auf Wunsch mit echtem Gelände']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="small">${r[2]}</td></tr>`).join('')}</table>
    <p class="small muted">Alles Importierte landet im Browser-Speicher (und, falls eingerichtet, auf dem NAS). Workouts lassen sich als .zwo exportieren, Pläne als .json, um sie zu teilen oder auf ein anderes Gerät zu bringen.</p>`)}
  ${S('strecken', 'Strecken und echtes Gelände', `<p>Eingebaute Welten haben Orte mit Sprintwertung, Tunnel, Küste und Berge. Eigene Strecken als GPX importieren: Der Verlauf und die Höhen kommen aus der Datei, die Umgebung entsteht passend dazu.</p>
    <p><b>Echtes Gelände</b>: Beim Import (oder später über „Echtes Gelände laden“) lädt die App ein Höhenmodell der Umgebung (frei verfügbare Terrain-Kacheln von AWS Open Data). Dann stehen die echten Berge und Täler rund um die Strecke und am Horizont. Wälder, Häuser und Orte werden weiterhin erzeugt, echte Gebäude oder Satellitenbilder gibt es nicht.</p>`)}
  ${S('spiel', 'Level, Missionen und Abzeichen', `<ul class="tips"><li>XP gibt es für Kilometer, Zeit, Höhenmeter, Gipfel, Sprints, Zieltore, Überholen, Bestwerte, Plan-Einheiten und Missionen.</li><li>Fährst du an mehreren Tagen hintereinander, gibt es einen <b>Serienbonus</b> bis +50 %.</li><li>Jede Woche gibt es drei neue <b>Missionen</b>. Mit höheren Leveln schaltest du Titel und Trikotfarben frei.</li></ul>`)}
  ${S('daten', 'Daten, NAS und Strava', `<ul class="tips">
    <li>Alle Daten liegen im Browser dieses Geräts unter dieser Adresse. Unter Profil gibt es eine <b>Sicherungsdatei</b> zum Herunterladen und Einspielen sowie „Alle lokalen Daten löschen“.</li>
    <li><b>NAS (Synology)</b>: Unter Profil mit deinem DSM-Konto anmelden, auf Wunsch mit 2FA-Code und gemerktem Gerät. Dann landen Einstellungen, Fahrten und Fotos zusätzlich in einem Ordner, z. B. in Synology Drive. Damit der Browser zugreifen darf, braucht das NAS einmalig einen Reverse-Proxy-Eintrag mit CORS-Kopfzeile, die Schritte stehen dort unter „Einrichtung“.</li>
    <li><b>Strava</b>: eigene Strava-API-App anlegen, Client-ID und Secret unter Profil eintragen und verbinden. Dann gehen Fahrten mit Titel und Beschreibung automatisch hoch. Fotos nimmt die Strava-Schnittstelle nicht an, Übersichtsbild und Fahrtfoto werden mitgespeichert.</li>
    <li>Ohne Verbindung: „Zu Strava“ speichert FIT-Datei und Bilder und kopiert Titel und Beschreibung in die Zwischenablage.</li>
  </ul>`)}
  ${S('tipps', 'Tipps', `<ul class="tips"><li>Ruckelt die Fahrt, senkt die App die Auflösung automatisch. Zusätzlich hilft unter Profil die Grafikqualität „Mittel“ oder „Niedrig“.</li><li>Auf dem Tablet die App über das Browser-Menü „Zum Startbildschirm hinzufügen“, dann startet sie im Vollbild.</li><li>Für Bluetooth die Seite über https öffnen (z. B. die GitHub-Pages-Adresse), nicht über eine IP-Adresse.</li></ul>`)}`;
  el.querySelector('.helpnav').onclick = e => { const a = e.target.closest('[data-go]'); if (!a) return; e.preventDefault(); el.querySelector('#' + a.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}
