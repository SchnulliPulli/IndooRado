// Anleitung
const S = (id, title, body) => `<section class="card help" id="${id}"><h2>${title}</h2>${body}</section>`;

export async function render(el) {
  el.innerHTML = `
  <section class="pagehead"><h1>Anleitung</h1></section>
  <nav class="chips-row helpnav">${[['start', 'Erste Schritte'], ['geraete', 'Geräte'], ['fahren', 'Fahren'], ['tasten', 'Tasten und Click'], ['companion', 'Companion'], ['workouts', 'Workouts und Pläne'], ['import', 'Dateien importieren'], ['strecken', 'Strecken und Gelände'], ['spiel', 'Level und Missionen'], ['daten', 'Daten, NAS, Strava'], ['tipps', 'Tipps']].map(([k, l]) => `<a class="chipb" href="#/help" data-go="${k}">${l}</a>`).join('')}</nav>
  ${S('start', 'Erste Schritte', `<ol class="tips">
    <li>Unter <a href="#/profile">Profil</a> Name, <b>FTP</b> und Gewicht eintragen. Alle Workout-Ziele hängen an der FTP.</li>
    <li>Unter <a href="#/devices">Geräte</a> Smart-Trainer, Pulsgurt, Trittfrequenz-Sensor und Click-Controller verbinden. Ohne Geräte lässt sich alles im Demo-Modus testen.</li>
    <li>Auf der <a href="#/">Startseite</a> Strecke und Workout wählen, dann „Fahrt starten“. Die Fahrt beginnt, sobald du trittst.</li>
    <li>Am Ende „Beenden“ → „Speichern“. Erst gespeicherte Fahrten zählen für Level, Missionen, Plan und Bestzeiten.</li>
  </ol><p class="small muted">Bluetooth funktioniert in Chrome und Edge (Windows, macOS, Android, ChromeOS), nicht in Safari und nicht unter iOS. Der Knopf oben rechts schaltet das Vollbild ein, es bleibt beim Seitenwechsel erhalten.</p>`)}
  ${S('geraete', 'Geräte', `<ul class="tips">
    <li><b>Smart-Trainer</b> (FTMS): liefert Leistung und Kadenz und wird von der App gesteuert, entweder mit festen Watt (ERG) oder über die Steigung.</li>
    <li><b>Pulsgurt</b>: für Pulsanzeige, Pulszonen und die adaptive Steuerung.</li>
    <li><b>Click-Controller</b>: virtuelles Schalten. Die Tasten lassen sich unter Geräte anlernen.</li>
    <li>Bekannte Geräte verbindet die App beim Start selbst wieder, wenn der Browser das unterstützt.</li>
  </ul>`)}
  ${S('fahren', 'Fahren', `<ul class="tips">
    <li><b>Widerstand</b>: „Virtuelle Gänge“ (wie draußen schalten, die App rechnet Leistung aus Gang, Kadenz und Steigung), „Steigung“ (geht direkt an den Trainer) oder „ERG fix“ (feste Wattzahl).</li>
    <li><b>Mitfahrer</b> fahren mit, geben Windschatten (bis 33 % weniger Luftwiderstand, wenn du dicht dahinter bist) und zählen beim Überholen.</li>
    <li><b>Zieltore</b>: Kurz vor Ende eines Intervalls steht ein Tor auf der Straße, beim Durchfahren schwenkt die Kamera.</li>
    <li><b>Karte</b> (Minikarte antippen oder Taste K): ganze Strecke, Schnellziele und <b>Beamen</b> an jede Stelle. Gebeamte Fahrten zählen nicht als Streckenbestzeit.</li>
    <li><b>Menü</b>: pausiert die Fahrt und öffnet das Startmenü. Mit dem Balken „Zurück zur Fahrt“ geht es weiter, treten setzt die Fahrt fort.</li>
    <li><b>Wetter</b> (Taste W): Morgen, Tag, Abend, Nacht und klar, Wolken, Regen, Nebel oder automatisch nach Uhrzeit.</li>
    <li><b>Anordnen</b>: Anzeigen ziehen. Größe über den Eckgriff unten rechts oder mit zwei Fingern direkt auf dem Widget. Einzelne Widgets ein- und ausblenden und eigene hinzufügen (z. B. NP, TSS, Rundenzeit, Platz im Feld, Abstand zum Geist, Leistungs- und Pulskurve). Vorlagen (Kompakt, Minimal, Rennen, Workout-Fokus, Datenfreak), Stile (Dunkel, Glas, Farbig, Neon, Kontrast, Hell, Durchsichtig), eigene Akzentfarbe und Deckkraft. Das Fenster lässt sich an der Kopfzeile verschieben und einklappen. Die Knopfleiste bleibt unten rechts, ihre Breite stellst du am linken Rand ein.</li>
    <li><b>Ride On</b>: Mitfahrer geben dir ab und zu einen Daumen hoch. Mit dem Knopf „Ride On“ oder der Taste R gibst du dem nächsten Fahrer einen. Beides bringt ein wenig XP.</li>
    <li><b>Geist</b>: Auf einer bereits gefahrenen Strecke fährt ein halbdurchsichtiger Fahrer deine Bestfahrt nach. Der Abstand steht im Widget „Abstand zum Geist“.</li>
    <li><b>Puls-Ziel</b>: Widerstandsart, bei der der Trainer die Watt alle 5 Sekunden so nachregelt, dass dein Puls am Zielwert bleibt. Mit + und − den Zielpuls ändern.</li>
    <li><b>Sanfter ERG-Einstieg</b>: Bei großen Sprüngen nach oben fährt der Trainer die Leistung über 5 Sekunden hoch.</li>
    <li><b>Ton und Musik</b> (Taste M): Fahrtwind, Reifen, Kette und Kurbel, Natur, Countdown und Fanfaren, jedes Geräusch mit eigenem Regler. Musik in drei Stilen (Chill, Drive, Synthwave), die sich deiner Intensität anpasst, oder eigene Musikdateien. Alles unter <a href="#/ridesettings">Fahransicht</a>.</li>
    <li><b>Fahransicht-Einstellungen</b>: Anzeige, Farben, Vorlagen, Kamera, Mitfahrer (Anzahl, Stärke, Namen), Zieltore, Countdown, Fahrgefühl, Trinkerinnerung, Ton und Musik auf einer Seite.</li>
  </ul>`)}
  ${S('tasten', 'Tasten und Click-Controller', `<table class="tbl"><tr><th>Taste</th><th>Funktion</th></tr>${[['↑ / + und ↓ / −', 'Schalten, im ERG ±10 W, im Workout Intensität ±2 %'], ['Leertaste', 'Pause / weiter'], ['C oder 1–5', 'Kamera'], ['P', 'Foto'], ['K', 'Karte und Beamen'], ['W', 'Wetter und Tageszeit'], ['M', 'Ton an/aus'], ['N', 'Mitfahrer an/aus'], ['R', 'Ride On an den nächsten Fahrer'], ['Esc', 'Karte und Fenster schließen']].map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join('')}</table>
    <p><b>Click-Controller</b>: einzelner Klick schaltet. <b>Dreimal schnell Plus</b> springt zum nächsten Intervall, <b>dreimal schnell Minus</b> startet das Intervall neu (in den ersten 10 Sekunden eins zurück). Die drei Schaltvorgänge werden dabei zurückgenommen. Abschaltbar unter Profil.</p>`)}
  ${S('workouts', 'Workouts und Pläne', `<ul class="tips">
    <li>Ziele sind Prozent deiner FTP. Ändert sich die FTP (z. B. nach einem FTP-Test), passen sich alle Workouts und Pläne an.</li>
    <li><b>Adaptiv</b>: Bricht die Kadenz ein, wird der Widerstand kurz gesenkt. Ist der Puls lange am Anschlag, sinkt die Intensität um 3 %. Schafft der Trainer das Ziel nicht, gibt es einen Hinweis. Umschalten mit dem Feld „adaptiv“.</li>
    <li>Jedes Intervall zeigt einen <b>Tipp</b> zu Kadenz und Fahrweise sowie einen Kadenz-Zielbereich.</li>
    <li><b>Empfehlung für heute</b> (Startseite): schlägt nach deiner Frische (TSB) und dem Trainingsplan eine passende Einheit vor, von Erholung bis Intensität.</li>
    <li><b>FTP-Erkennung</b>: Fährst du ohne Test deutlich über deiner FTP (beste 20 Minuten × 0,95 oder beste 8 Minuten × 0,9), bietet die Auswertung an, die neue FTP zu übernehmen.</li>
    <li><b>Auswertung</b> nach der Fahrt wie bei Strava: Karte, Distanz, Bewegungs- und Gesamtzeit, Höhenmeter, Tempo, Leistung, NP, Kalorien (aus der Leistung, sonst aus dem Puls mit Alter, Gewicht und Geschlecht), Anstrengung aus dem Puls, Bestleistungen mit Platzierung, Abschnitte je Kilometer und Segmente. „Bild teilen“ erzeugt ein Übersichtsbild.</li>
    <li><b>Kalender</b>: Im aktiven Plan stehen zu jeder Woche die Daten, die laufende Woche ist markiert.</li>
    <li><b>Workout-Editor</b> (Workouts → „Neues Workout“ oder „Anpassen“): aus Bausteinen wie Aufwärmen, Konstant, Intervalle, Rampe, Frei und Ausrollen ein eigenes Workout bauen, mit Kadenz und Hinweis je Baustein.</li>
    <li><b>Plan aus Text</b> (Pläne → Plan importieren → „Plan aus Text einfügen“): kopierte Wochenübersicht einer Workout-Sammlung einfügen, Wochen, Workouts, Watt, Kadenz und Wiederholungen werden erkannt und in % FTP umgerechnet. Der Plan bleibt nur in deinem Browser.</li>
    <li><b>Plan-Editor</b> (Pläne → „+ Neuer Plan“, oder „Anpassen“ bei einem eingebauten Plan): Wochen anlegen, je Woche beliebig viele Einheiten aus deiner Workout-Bibliothek einplanen, Wochen kopieren und verschieben.</li>
    <li><b>Pläne</b> führen Woche für Woche durch passende Workouts. Eine Einheit zählt ab 90 % als erledigt, du kannst Einheiten überspringen.</li>
  </ul>`)}
  ${S('import', 'Dateien importieren und exportieren', `<table class="tbl"><tr><th>Format</th><th>Wo</th><th>Hinweis</th></tr>
    ${[['.zwo', 'Workouts, Pläne', 'Workout im verbreiteten XML-Format, z. B. aus Workout-Sammlungen im Internet'], ['.erg / .mrc', 'Workouts, Pläne', 'Watt- bzw. Prozent-Kurven (TrainerRoad, Golden Cheetah u. a.)'], ['.zip', 'Workouts, Pläne', 'Archiv mit .zwo/.erg/.mrc, wird auf Wunsch als Plan angelegt (Reihenfolge nach Dateiname)'], ['.json', 'Workouts, Pläne', 'VeloVerse-Export eines Workouts oder ganzen Plans'], ['.gpx', 'Strecken', 'Track aus Komoot, Strava, Garmin usw., auf Wunsch mit echtem Gelände']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="small">${r[2]}</td></tr>`).join('')}</table>
    <p class="small muted">Alles Importierte landet im Browser-Speicher (und, falls eingerichtet, auf dem NAS). Workouts lassen sich als .zwo exportieren, Pläne als .json, um sie zu teilen oder auf ein anderes Gerät zu bringen.</p>`)}
  ${S('strecken', 'Strecken und echtes Gelände', `<p><b>Strava-Routen</b>: Mit verbundenem Strava unter Strecken „Von Strava laden“, deine gespeicherten Rad-Routen erscheinen zur Auswahl und werden mit echtem Gelände angelegt.</p><p>Eingebaute Welten haben Orte mit Sprintwertung, Tunnel, Küste und Berge. Eigene Strecken als GPX importieren: Der Verlauf und die Höhen kommen aus der Datei, die Umgebung entsteht passend dazu.</p>
    <p><b>Echtes Gelände</b>: Beim Import (oder später über „Echtes Gelände laden“) lädt die App ein Höhenmodell der Umgebung (frei verfügbare Terrain-Kacheln von AWS Open Data). Dann stehen die echten Berge und Täler rund um die Strecke und am Horizont. Wälder, Häuser und Orte werden weiterhin erzeugt, echte Gebäude oder Satellitenbilder gibt es nicht.</p>`)}
  ${S('spiel', 'Level, Missionen und Abzeichen', `<ul class="tips"><li>XP gibt es für Kilometer, Zeit, Höhenmeter, Gipfel, Sprints, Zieltore, Überholen, Bestwerte, Plan-Einheiten und Missionen.</li><li>Fährst du an mehreren Tagen hintereinander, gibt es einen <b>Serienbonus</b> bis +50 %.</li><li>Jede Woche gibt es drei neue <b>Missionen</b>. Mit höheren Leveln schaltest du Titel und Trikotfarben frei.</li></ul>`)}
  ${S('companion', 'Companion auf dem Handy', `<ul class="tips">
    <li>Öffne VeloVerse auf dem Handy, melde dich unter Einstellungen › Verbindungen beim NAS an und öffne Start › <b>Handy-Ansicht</b>. Am besten „Zum Startbildschirm hinzufügen“, dann gibt es eine eigene Verknüpfung.</li>
    <li>Du siehst deine Woche, Fitness und Form, Missionen und alle Fahrten mit Auswertung und kannst Workout und Strecke für die nächste Fahrt <b>vormerken</b>. Das geht über das NAS an den PC und ist dort beim nächsten Öffnen bereit.</li>
    <li>Läuft am PC eine Fahrt, erscheint oben eine <b>Live</b>-Karte mit Leistung, Puls, Kadenz, Intervall, Platz und Streckenfortschritt (alle 5 Sekunden über den NAS-Ordner, abschaltbar unter Fahransicht).</li>
  </ul>`)}
  ${S('daten', 'Daten, Cloud und Strava', `<ul class="tips">
    <li>Alle Daten liegen im Browser dieses Geräts unter dieser Adresse. Unter Profil gibt es eine <b>Sicherungsdatei</b> zum Herunterladen und Einspielen sowie „Alle lokalen Daten löschen“.</li>
    <li><b>NAS (Synology)</b>: Unter Profil mit deinem DSM-Konto anmelden, auf Wunsch mit 2FA-Code und gemerktem Gerät. Dann landen Einstellungen, Fahrten und Fotos zusätzlich in einem Ordner, z. B. in Synology Drive. Damit der Browser zugreifen darf, braucht das NAS einmalig einen Reverse-Proxy-Eintrag mit CORS-Kopfzeile, die Schritte stehen dort unter „Einrichtung“.</li>
    <li><b>OneDrive, Google Drive, Dropbox</b>: statt NAS geht auch einer dieser Dienste. Unter Einstellungen › Verbindungen den Dienst wählen, einmalig eine kostenlose eigene App beim Anbieter anlegen (Schritt-für-Schritt-Anleitung steht dort), Kennung eintragen und verbinden. Es ist immer nur ein Speicher gleichzeitig aktiv.</li>
    <li><b>Mehrere Geräte</b>: Ein neu verbundenes Gerät holt zuerst nur. Danach gewinnt je Einstellung die zuletzt geänderte Seite, Fahrten, Fotos und Pläne werden ergänzt, Gelöschtes verschwindet überall. Unter Profil siehst du alle verbundenen Geräte.</li>
    <li><b>Strava</b>: eigene Strava-API-App anlegen, Client-ID und Secret unter Einstellungen › Verbindungen eintragen und verbinden. Dann gehen Fahrten mit Titel und Beschreibung automatisch hoch. Fotos nimmt die Strava-Schnittstelle nicht an, Übersichtsbild und Fahrtfoto werden mitgespeichert.</li>
    <li><b>Bisherige Fahrten übernehmen</b> (Verlauf): „Aus Strava übernehmen“ holt Rad- und virtuelle Fahrten, auch die von anderen Trainings-Apps übertragenen. „FIT-Dateien importieren“ liest .fit, .fit.gz und ZIP (z. B. Strava-Kontoexport oder aus anderen Apps heruntergeladene Fahrten). Sie zählen für Fitness, Form und Leistungskurve, bringen aber keine XP.</li>
    <li>Die <b>Wolke</b> in der Kopfleiste zeigt, wenn Daten außerhalb des Browsers landen: grün NAS abgeglichen, gelb Abgleich läuft, rot Fehler oder Anmeldung abgelaufen, orange nur Strava.</li>
    <li>Ohne Verbindung: „Zu Strava“ speichert FIT-Datei und Bilder und kopiert Titel und Beschreibung in die Zwischenablage.</li>
  </ul>`)}
  ${S('tipps', 'Tipps', `<ul class="tips"><li>Ruckelt die Fahrt, senkt die App die Auflösung automatisch. Zusätzlich hilft unter Einstellungen › App die Grafikqualität „Mittel“ oder „Niedrig“.</li><li>Auf dem Tablet die App über das Browser-Menü „Zum Startbildschirm hinzufügen“, dann startet sie im Vollbild.</li><li>Für Bluetooth die Seite über https öffnen (z. B. die GitHub-Pages-Adresse), nicht über eine IP-Adresse.</li></ul>`)}`;
  el.querySelector('.helpnav').onclick = e => { const a = e.target.closest('[data-go]'); if (!a) return; e.preventDefault(); el.querySelector('#' + a.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}
