# Indoorado

**Online: [indoorado.de](https://indoorado.de)**

Indoor-Radtraining im Browser: Smart-Trainer per Bluetooth verbinden und durch eine 3D-Welt fahren, mit Workouts, Trainingsplänen, Fortschritt und auf Wunsch gemeinsam mit anderen.

Indoorado ist eine rein statische Web-App (HTML, CSS, JavaScript-Module). Es gibt keinen eigenen Server und keinen Build-Schritt. Ohne Anmeldung bleibt alles im Browser, es gibt dann keine Verbindung ins Internet.

> **Experimentell.** Das Projekt ist ein privates Hobbyprojekt in Entwicklung. Nutzung auf eigene Verantwortung.

## Funktionen

- **Geräte:** Smart-Trainer (FTMS, ERG und Steigungssimulation), Pulsgurt, Trittfrequenzsensor, Bluetooth-Schaltknöpfe (Click-Controller) und weitere Sensoren. Ohne Geräte lässt sich alles mit Demo-Geräten ausprobieren.
- **Fahren:** 3D-Welt mit Tageszeiten und Wetter, virtuelle Gänge, Windschatten, Computer-Mitfahrer, Power-ups, Bot-Rennen, Zeitfahren, Tagesherausforderung und Fotomodus. Die Anzeigen lassen sich frei anordnen.
- **Strecken:** über 20 eingebaute Strecken, von Alpenpässen und Küsten über Schotter und Singletrails bis zu Fantasiewelten wie Mond, Weltall, Tiefsee, Dinosaurier-Tal und Zuckerland. Eigene Strecken per GPX oder aus Strava, auf Wunsch mit echtem Gelände.
- **Training:** Workout-Bibliothek, eigener Workout-Editor, Import von .zwo, .erg und .mrc, Trainingspläne mit Anpassung an die Form sowie FTP- und Rampentest.
- **Fortschritt:** Level und XP, Abzeichen, Wochenmissionen, Leistungskurve, Fitness und Form (CTL, ATL, TSB) und Bestzeiten je Strecke und Anstieg.
- **Daten:** Speicherung lokal im Browser (IndexedDB), Sicherung als Datei und optionaler Abgleich über NAS (WebDAV oder Synology), OneDrive, Google Drive oder Dropbox. Upload zu Strava ist möglich.
- **Online (optional, mit Konto):** Lobby für Gruppenfahrten mit gemeinsamem Workout, „Wer ist online“ und live mit anderen fahren und Mitfahren. Dazu kommen Duelle, Gruppenziele, Ride Ons, Ankündigungen, ein Admin-Bereich und Zwei-Faktor-Anmeldung. Das Backend ist Supabase.

## Starten

Bluetooth funktioniert nur in **Chrome oder Edge** und nur über **https://** oder **http://localhost**.

Lokal:

```bash
python3 -m http.server 8000
```

Danach im Browser `http://localhost:8000/` öffnen. Ein Start per Doppelklick (`file://`) funktioniert nicht.

Hosting: Der Ordner lässt sich auf jeden statischen Webspace legen, zum Beispiel GitHub Pages, eine Synology Web Station, Netlify oder Cloudflare Pages. `index.html` ist der Einstieg. Weitere Hinweise stehen in `LIESMICH.txt`.

## Online-Funktionen einrichten

Die Online-Funktionen sind optional. Ohne `online.json` (oder mit leerer Adresse) läuft die App rein lokal.

1. In Supabase ein Projekt anlegen und `supabase/schema.sql` im SQL-Editor ausführen.
2. `online.example.json` nach `online.json` kopieren und dort die Projekt-URL und den **öffentlichen** Schlüssel (publishable/anon key) eintragen.
3. Die ausführliche Anleitung steht in `docs/ONLINE.md`.

Niemals den `service_role`- bzw. Secret-Key in die App oder ins Repository legen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `index.html`, `css/`, `fonts/`, `icons/` | Einstieg, Gestaltung, selbst gehostete Schriften |
| `js/app.js` | Navigation, Start und Kopfleiste |
| `js/pages/` | Seiten (Start, Fahrt, Strecken, Workouts, Online, Konto, Admin …) |
| `js/world.js`, `js/worldfx.js`, `js/worldthemes.js` | 3D-Welt (three.js) |
| `js/ble.js`, `js/sensors.js` | Bluetooth-Geräte |
| `js/routes.js`, `js/workouts.js`, `js/plans.js` | Strecken, Workouts, Trainingspläne |
| `js/online/`, `js/multiplayer.js` | Konto, Anwesenheit, Live-Fahren und Multiplayer-Spiel (Supabase) |
| `js/sync.js`, `js/cloud.js`, `js/db.js` | Speicherung und Abgleich |
| `supabase/schema.sql` | Datenbank, Regeln und Funktionen für den Online-Teil |
| `vendor/` | three.js und supabase-js als lokale Kopien |
| `sw.js` | Offline-Cache |

## Tests

Bei jedem Push laufen auf GitHub automatisch drei Prüfungen (`.github/workflows/tests.yml`):

- **Syntax**: alle JavaScript-Module (`tests/syntax.sh`)
- **Datenbank**: `supabase/schema.sql` in einem echten Postgres zweimal hintereinander, danach Rechte-Tests (fremde Daten unsichtbar, keine Rollen-Eskalation, Admin nur mit 2FA, Teams, Events) (`tests/sql/`)
- **Browser**: alle Seiten auf Desktop- und Handygröße, eine Demo-Fahrt, Baukasten, Saison und Geister (`tests/smoke.mjs`)

Lokal: `python3 -m http.server 8765` im Projektordner, dann `node tests/smoke.mjs` (Playwright nötig).

## Hinweise

- Fahrten, Einstellungen und Fortschritt hängen an der Adresse, unter der die App läuft. Unter einer anderen Adresse liegen andere Daten.
- Erwähnte Marken (z. B. Strava, Garmin, Wahoo) gehören ihren jeweiligen Inhabern. Indoorado steht in keiner Verbindung zu diesen Unternehmen.
