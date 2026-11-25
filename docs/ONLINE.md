# VeloVerse Online mit Supabase

## Grundidee: eine Codebasis, zwei Versionen

| | Statische Version | Online-Version |
|---|---|---|
| Wo | GitHub Pages, NAS, `python -m http.server` | eigener Webserver oder VPS |
| Code | `main` | **derselbe** `main` |
| Unterschied | keine `online.json` | `online.json` mit Supabase-Zugang liegt neben `index.html` |
| Daten | nur im Browser (plus NAS/OneDrive/… wie bisher) | zusätzlich im Konto, Live-Fahrten, Bestenlisten |

Du arbeitest wie bisher an der statischen App. Alles unter `js/online/` und die Seiten `account.js` und `admin.js`
schalten sich nur ein, wenn `online.json` gefunden wird (oder unter Einstellungen › Konto ein Zugang eingetragen ist).
Jeder Push auf `main` geht automatisch auf beide Versionen:

- GitHub Pages veröffentlicht `main` wie bisher (ohne `online.json`, die steht in `.gitignore`).
- Der Workflow `.github/workflows/deploy-online.yml` kopiert denselben Stand per `rsync` auf deinen Webserver und erzeugt dort `online.json` aus den Repository-Secrets.

Regel für die Weiterentwicklung: **Online-Code nie in Kernmodule hart verdrahten**, sondern immer über `loggedIn()` / `configured()` abfragen
und dynamisch importieren. Dann funktioniert die statische Version immer.

## Plan

### Phase 1: Konto und Datensicherung (in diesem Branch umgesetzt)
- Supabase-Projekt (Free-Tier), `supabase/schema.sql` ausführen.
- Login per **OAuth** (Google, GitHub, Apple) oder E-Mail mit Passwort oder Magic Link.
- **2FA** mit TOTP (Authenticator-App), freiwillig für alle, **Pflicht für Admins**. Die Datenbank prüft `aal2` selbst in `is_admin()`.
- Datenpaket (`veloverse-data`, gleiches Format wie die Datei-Sicherung) im privaten Storage-Ordner des Nutzers.
  Nach jeder Fahrt automatische Sicherung, „Von online laden“ auf neuen Geräten.
- Fahrt-Zusammenfassungen in der Tabelle `rides` (für Statistik und Bestenlisten).

### Phase 2: Gemeinsam fahren (Grundgerüst umgesetzt)
- Realtime-Kanal je Strecke (`ride:<routeId>`), 1 Nachricht pro Sekunde und Fahrer, Presence für „wer ist da“.
- Echte Fahrer erscheinen als Figuren mit eigenem Avatar, zwischen den Paketen mit ihrem Tempo weitergerechnet.
- Windschatten hinter echten Fahrern funktioniert wie bei den computergesteuerten.
- Noch offen: Gruppenfahrten mit Startzeit, Treffpunkt-Lobby, Ride On zwischen echten Fahrern, Chat.

### Phase 3: Community und Betrieb
- Bestenlisten je Strecke (`route_leaderboard`, nur öffentliche Profile), Wochen-Challenges, Clubs.
- Admin-Panel (umgesetzt): Kennzahlen, Nutzer suchen, Rolle setzen, sperren, Daten löschen, Ankündigungen.
- Noch offen: Edge Function zum Löschen von Konten (braucht den Service-Key, darf nie in den Browser),
  Plausibilitätsprüfung gegen Schummeln (Watt/kg-Grenzen, Sprünge), Datenschutzerklärung und Impressum.

### Kosten und Grenzen (Free-Tier, Stand Ende 2026 bitte im Dashboard prüfen)
Rund 50.000 aktive Nutzer pro Monat für Auth, 500 MB Datenbank, 1 GB Storage, 200 gleichzeitige Realtime-Verbindungen.
Projekte ohne Aktivität werden nach einer Woche pausiert. Für eine Community darüber hinaus: Pro-Tarif oder Supabase selbst hosten (Docker).

## Einrichtung Schritt für Schritt

1. Auf supabase.com ein Projekt anlegen (Region EU, z. B. Frankfurt).
2. **SQL Editor** › Inhalt von `supabase/schema.sql` einfügen und ausführen.
3. **Authentication › URL Configuration**: Site URL = Adresse deiner Online-Version, unter Redirect URLs dieselbe Adresse mit `/**` eintragen.
4. **Authentication › Providers**:
   - E-Mail: an, „Confirm email“ an.
   - Google: in der Google Cloud Console einen OAuth-Client (Web) anlegen, Redirect `https://<projekt>.supabase.co/auth/v1/callback`, Client-ID und Secret in Supabase eintragen.
   - GitHub: unter GitHub › Settings › Developer settings › OAuth Apps eine App anlegen, gleiche Callback-URL.
5. **Authentication › Multi-Factor**: TOTP aktivieren (Standard).
6. **Project Settings › API**: `URL` und `anon public` kopieren und
   - lokal testen: Einstellungen › Konto, Werte eintragen, oder
   - Server: `online.json` nach dem Muster von `online.example.json` neben `index.html` legen.
7. Ersten Admin festlegen: registrieren, 2FA einrichten, dann im SQL Editor
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'DEINE@MAIL');`
8. Automatisches Ausrollen (optional): im Repository unter Settings › Secrets die Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
   `DEPLOY_PATH`, `SUPABASE_URL` und `SUPABASE_ANON_KEY` anlegen und unter Variables `ONLINE_DEPLOY = on` setzen.

## Sicherheit

- Der `anon`-Schlüssel ist öffentlich. Geschützt wird alles über Row Level Security in `schema.sql`:
  Jeder sieht nur seine Fahrten und seinen Storage-Ordner, Admin-Funktionen prüfen Rolle **und** 2FA.
- Der `service_role`-Schlüssel gehört nie in die App, in `online.json` oder ins Repository.
- Gesperrte Nutzer (`role = 'banned'`) können nichts mehr schreiben.
- Lokale Zugangsdaten (Strava, NAS) bleiben im Browser und landen nur verschlüsselt in einer Sicherung, wenn du das willst.

## Dateien

| Datei | Inhalt |
|---|---|
| `supabase/schema.sql` | Tabellen, Regeln (RLS), Funktionen, Storage-Bucket |
| `js/online/config.js` | optionaler fester Zugang |
| `js/online/client.js` | Verbindung, Login, OAuth, Magic Link, 2FA |
| `js/online/sync.js` | Datenpaket online sichern/laden, Fahrten, Bestenliste, Ankündigungen |
| `js/online/live.js` | Realtime-Kanal für Live-Fahrten |
| `js/pages/account.js` | Einstellungen › Konto |
| `js/pages/admin.js` | Admin-Panel |
| `.github/workflows/deploy-online.yml` | Ausrollen auf den Webserver |
