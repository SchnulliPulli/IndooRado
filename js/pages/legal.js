// Rechtliches: Impressum, Datenschutzerklärung, Nutzungshinweise und Lizenzen.
// Die persönlichen Angaben kommen aus js/legal-config.js. Kein Ersatz für eine Rechtsberatung.
import { $, esc } from '../util.js';
import { LEGAL as L, legalIncomplete } from '../legal-config.js';

const TABS = [['impressum', 'Impressum'], ['datenschutz', 'Datenschutz'], ['nutzung', 'Nutzung und Haftung'], ['lizenzen', 'Lizenzen']];
const addr = () => `${esc(L.name)}<br>${esc(L.street)}<br>${esc(L.city)}${L.country ? '<br>' + esc(L.country) : ''}`;
const mail = () => /@/.test(L.email) ? `<a href="mailto:${esc(L.email)}">${esc(L.email)}</a>` : esc(L.email);

export async function render(el, [tab]) {
  const t = TABS.some(x => x[0] === tab) ? tab : 'impressum';
  el.innerHTML = `
  <section class="pagehead"><h1>Rechtliches</h1><span class="small muted">Stand: ${esc(L.updated)}</span></section>
  ${legalIncomplete() ? '<section class="card accbox bad"><b>⚠️ Angaben fehlen noch</b><p class="small muted">Name, Anschrift und Kontakt in <code>js/legal-config.js</code> eintragen. Ohne vollständiges Impressum sollte die Seite nicht öffentlich beworben werden.</p></section>' : ''}
  <div class="seg legaltabs">${TABS.map(([k, l]) => `<a href="#/legal/${k}" class="${k === t ? 'on' : ''}" aria-current="${k === t}">${l}</a>`).join('')}</div>
  <article class="card legal">${({ impressum, datenschutz, nutzung, lizenzen })[t]()}</article>`;
}

function impressum() {
  return `<h2>Impressum</h2>
  <h3>Angaben gemäß § 5 DDG</h3><p>${addr()}</p>
  <h3>Kontakt</h3><p>E-Mail: ${mail()}${L.phone ? '<br>Telefon: ' + esc(L.phone) : ''}</p>
  <h3>Verantwortlich für den Inhalt</h3><p>${esc(L.name)}, Anschrift wie oben.</p>
  <h3>Art des Angebots</h3><p>VeloVerse ist ein privates, nicht kommerzielles Hobbyprojekt: eine Web-App für Indoor-Radtraining. Es gibt keine kostenpflichtigen Leistungen, keine Werbung und kein Tracking.</p>
  <h3>Verbraucherstreitbeilegung</h3><p>Ich bin weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
  <h3>Haftung für Inhalte und Links</h3><p>Die Inhalte wurden mit Sorgfalt erstellt. Für Richtigkeit, Vollständigkeit und Aktualität kann ich keine Gewähr übernehmen. Für Inhalte verlinkter externer Seiten sind ausschließlich deren Betreiber verantwortlich; bei Bekanntwerden von Rechtsverletzungen entferne ich entsprechende Links umgehend.</p>
  <h3>Urheberrecht</h3><p>Der Programmcode und die Inhalte dieser Seite unterliegen dem Urheberrecht, soweit nicht anders angegeben (siehe „Lizenzen“). Erwähnte Marken (z. B. Strava, Garmin, Wahoo) gehören ihren jeweiligen Inhabern; VeloVerse steht in keiner Verbindung zu diesen Unternehmen.</p>`;
}

function datenschutz() {
  return `<h2>Datenschutzerklärung</h2>
  <p>Diese Erklärung beschreibt, welche personenbezogenen Daten bei der Nutzung von VeloVerse verarbeitet werden. Kurz gesagt: <b>Ohne Anmeldung bleibt alles in deinem Browser.</b> Erst wenn du dich bei VeloVerse Online anmeldest oder selbst einen Dienst (z. B. Strava oder einen Cloud-Speicher) verbindest, gehen Daten an diese Dienste.</p>

  <h3>1. Verantwortlicher</h3><p>${addr()}<br>E-Mail: ${mail()}</p>

  <h3>2. Aufruf der Website (Hosting)</h3>
  <p>Die Website wird über <b>GitHub Pages</b> bereitgestellt (GitHub Inc., 88 Colin P Kelly Jr St, San Francisco, CA 94107, USA). Beim Aufruf verarbeitet GitHub technisch notwendige Verbindungsdaten, insbesondere deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Datei und Browserinformationen, um die Seite auszuliefern und vor Missbrauch zu schützen. Ich selbst erhalte diese Daten nicht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sichere und stabile Bereitstellung). GitHub kann Daten in den USA verarbeiten; GitHub ist nach dem EU-US Data Privacy Framework zertifiziert, zusätzlich gelten Standardvertragsklauseln. Details: <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">Datenschutzerklärung von GitHub</a>.</p>
  <p>Schriften, Grafikbibliotheken und alle übrigen Dateien liegen auf demselben Server; es werden keine Inhalte von Drittanbietern (z. B. Google Fonts, CDNs) nachgeladen. Es gibt <b>keine Cookies, keine Analyse- und keine Werbedienste</b>.</p>

  <h3>3. Speicherung in deinem Browser</h3>
  <p>Profil, Einstellungen, Fahrten (inkl. Leistung, Herzfrequenz, Trittfrequenz, virtueller Strecke), Fotos, Fortschritt, Pläne und Workouts speichert die App <b>lokal in deinem Browser</b> (IndexedDB, localStorage). Diese Daten verlassen dein Gerät nicht, solange du keinen der unten genannten Dienste nutzt. Die lokale Speicherung ist für die von dir gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst die Daten jederzeit in der App (Optionen › App › Daten) oder über die Browser-Einstellungen löschen.</p>
  <p><b>Bluetooth-Geräte</b> (Trainer, Pulsgurt, Sensoren) verbindet der Browser direkt mit der App; dabei werden keine Daten an mich oder Dritte übertragen.</p>

  <h3>4. VeloVerse Online (nur mit Konto)</h3>
  <p>Wenn du ein Konto anlegst, nutzt VeloVerse den Dienst <b>Supabase</b> (Supabase Inc.) für Anmeldung, Datenbank, Dateispeicher und Live-Funktionen. Serverregion: ${esc(L.supabaseRegion)}. Mit Supabase besteht ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO); soweit Daten in Drittländer gelangen können, gelten Standardvertragsklauseln. Verarbeitet werden:</p>
  <ul>
    <li><b>Konto:</b> E-Mail-Adresse, Passwort (nur als Hash), optional Zwei-Faktor-Geheimnis, Anmeldezeitpunkte sowie technische Protokolldaten (IP-Adresse, Browser). Zweck: Anmeldung und Schutz des Kontos.</li>
    <li><b>Profil:</b> Anzeigename, Avatar, Level, Sichtbarkeit, letzte Aktivität, Freischaltungsstatus. Anzeigename, Avatar und Level sehen andere angemeldete Nutzer. Deine E-Mail-Adresse sieht niemand außer dir.</li>
    <li><b>Abgleich zwischen deinen Geräten:</b> Einstellungen, Körperdaten (z. B. Gewicht, FTP), Fortschritt, Pläne, eigene Strecken und Workouts sowie Fahrten in dem Umfang, den du unter Konto › „Was online gespeichert wird“ festlegst (z. B. ohne Verlauf, ohne GPS, ohne Fotos). Während einer Fahrt werden außerdem alle 5 Sekunden aktuelle Werte gespeichert, damit du sie auf einem anderen Gerät live sehen kannst.</li>
    <li><b>Herzfrequenz:</b> Puls ist ein Gesundheitsdatum (Art. 9 DSGVO). Er wird nur mit deiner ausdrücklichen Einwilligung online gespeichert (Art. 9 Abs. 2 lit. a DSGVO). Du kannst die Einwilligung jederzeit unter Konto › „Was online gespeichert wird“ widerrufen.</li>
    <li><b>Bestenlisten (freiwillig):</b> je Fahrt Strecke, Titel, Datum, Distanz, Zeit, Höhenmeter, optional Leistung, TSS und XP. Andere Nutzer sehen in der Bestenliste deinen Anzeigenamen und deine Bestzeit. Abschaltbar; dann werden die Einträge gelöscht.</li>
    <li><b>Live-Funktionen:</b> In der Lobby und beim gemeinsamen Fahren werden Anzeigename, Avatar, Strecke und während der Fahrt etwa einmal pro Sekunde Position, Tempo, Leistung bzw. W/kg und Trittfrequenz an die anderen Teilnehmenden weitergeleitet (kein Puls). Diese Live-Daten werden nicht dauerhaft gespeichert. Mit „Für andere sichtbar: aus“ fährst du unsichtbar.</li>
  </ul>
  <p><b>Tresor-Verschlüsselung (empfohlen):</b> Auf Wunsch werden alle Abgleich-Daten (Fahrten, Fotos, Einstellungen, Live-Fahrt) bereits in deinem Browser mit einem nur dir bekannten Tresor-Passwort verschlüsselt (AES-256-GCM). Supabase und ich als Betreiber können diese Daten dann nicht lesen. Nicht verschlüsselt werden können Anmeldedaten, Profil, Bestenlisten-Einträge und Live-Daten, weil der Dienst bzw. andere Nutzer sie lesen müssen.</p>
  <p><b>Rechtsgrundlagen:</b> Bereitstellung des Kontos und der von dir gewählten Funktionen: Art. 6 Abs. 1 lit. b DSGVO. Herzfrequenz: Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO. Sicherheit und Missbrauchsschutz: Art. 6 Abs. 1 lit. f DSGVO.</p>
  <p><b>Admin-Zugriff:</b> Als Betreiber sehe ich Anzeigename, Rolle, Freischaltungsstatus, Level und Zeitpunkte der letzten Aktivität sowie Gesamtsummen. Einzelne Fahrten und Datenpakete anderer Nutzer kann ich nicht einsehen; Dateien eines Kontos kann ich nur im Rahmen einer Kontolöschung entfernen.</p>

  <h3>5. E-Mails</h3>
  <p>Bestätigungs-, Anmelde- und Sicherheitsmails verschickt Supabase über den Versanddienst <b>Resend</b> (resend.com) als Auftragsverarbeiter. Verarbeitet werden deine E-Mail-Adresse und der Mailinhalt. Es gibt keinen Newsletter und keine Werbung.</p>

  <h3>6. Dienste, die du selbst verbindest</h3>
  <p>Die folgenden Dienste werden nur kontaktiert, wenn du sie ausdrücklich einrichtest bzw. die Funktion auslöst. Dann gelten zusätzlich deren Datenschutzbestimmungen, und du bist gegenüber diesen Anbietern selbst Vertragspartner:</p>
  <ul>
    <li><b>Strava</b> (Strava Inc., USA): Hochladen von Fahrten und Laden von Routen mit deiner eigenen Strava-App.</li>
    <li><b>Cloud-Speicher</b> Google Drive (Google Ireland Ltd.), Microsoft OneDrive (Microsoft Ireland Operations Ltd.), Dropbox (Dropbox International Unlimited Company) oder dein eigenes NAS/WebDAV: Abgleich deiner Daten in deinen eigenen Speicher.</li>
    <li><b>Geländedaten:</b> Beim Laden von „echtem Gelände“ für eigene Strecken werden Höhendaten-Kacheln aus dem öffentlichen Datensatz „Terrain Tiles“ bei Amazon Web Services (AWS) abgerufen. Dabei wird deine IP-Adresse an AWS übermittelt.</li>
  </ul>

  <h3>7. Speicherdauer und Löschung</h3>
  <p>Online-Daten bleiben gespeichert, bis du sie löschst. Unter Konto kannst du jederzeit nur die Online-Daten löschen oder dein gesamtes Konto mit allen Daten. Technische Protokolle der Dienstleister werden nach deren Vorgaben automatisch gelöscht. Lokale Daten in deinem Browser löschst du selbst.</p>

  <h3>8. Deine Rechte</h3>
  <p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20; die App bietet dafür Export und Sicherungsdatei) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Erteilte Einwilligungen kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3). Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, z. B. bei: ${esc(L.authority)}.</p>

  <h3>9. Mindestalter</h3><p>VeloVerse Online richtet sich an Personen ab 16 Jahren. Jüngere dürfen ein Konto nur mit Zustimmung der Erziehungsberechtigten anlegen.</p>

  <h3>10. Sicherheit</h3><p>Verbindungen sind verschlüsselt (HTTPS/TLS). Zugriffsregeln in der Datenbank stellen sicher, dass jede Person nur ihre eigenen Daten lesen kann. Zwei-Faktor-Anmeldung und die Tresor-Verschlüsselung sind verfügbar und empfohlen. Eine absolute Sicherheit kann bei Internetdiensten niemand garantieren.</p>

  <h3>11. Änderungen</h3><p>Ich passe diese Erklärung an, wenn sich Funktionen oder Rechtslage ändern. Es gilt die jeweils hier veröffentlichte Fassung (Stand oben).</p>`;
}

function nutzung() {
  return `<h2>Nutzungshinweise und Haftung</h2>
  <ul>
    <li><b>Experimentelles Hobbyprojekt:</b> VeloVerse wird privat und unentgeltlich entwickelt. Funktionen können sich ändern, fehlerhaft sein oder eingestellt werden. Es besteht kein Anspruch auf Verfügbarkeit oder Datensicherung; erstelle regelmäßig eine Sicherung (Optionen › App › Daten).</li>
    <li><b>Training auf eigene Verantwortung:</b> VeloVerse ersetzt keine ärztliche oder trainingswissenschaftliche Beratung. Kläre vor intensivem Training deine Belastbarkeit ab, achte auf Warnzeichen und höre bei Beschwerden sofort auf. Leistungs-, Puls- und Kalorienangaben sind Schätzungen.</li>
    <li><b>Geräte:</b> Die Ansteuerung von Smart-Trainern erfolgt über offene Bluetooth-Standards. Halte die Sicherheitshinweise des Herstellers ein und stelle sicher, dass Rad und Trainer fest stehen.</li>
    <li><b>Online-Funktionen:</b> Der Zugang kann nach einer Testphase von einer Freischaltung abhängen und bei Missbrauch gesperrt werden. Wähle einen Anzeigenamen, der keine Rechte Dritter verletzt und nicht beleidigend ist. Belästigung anderer Nutzer, das Fälschen von Bestenlisten oder Angriffe auf den Dienst sind untersagt.</li>
    <li><b>Haftung:</b> Ich hafte unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im Übrigen ist die Haftung, soweit gesetzlich zulässig, ausgeschlossen, insbesondere für Datenverlust und für Schäden durch die Nutzung von Trainingsgeräten.</li>
    <li><b>Dienste Dritter:</b> Für Strava, Cloud-Speicher und andere selbst verbundene Dienste gelten deren Bedingungen.</li>
  </ul>`;
}

function lizenzen() {
  return `<h2>Verwendete Software und Lizenzen</h2>
  <ul>
    <li><b>three.js</b> (3D-Grafik), © three.js authors, MIT-Lizenz.</li>
    <li><b>supabase-js</b> (Online-Anbindung), © Supabase, MIT-Lizenz.</li>
    <li><b>Barlow</b> und <b>Barlow Condensed</b> (Schriften), © Jeremy Tribby, SIL Open Font License 1.1; lokal eingebunden.</li>
    <li><b>Höhendaten</b> für „echtes Gelände“: „Terrain Tiles“ (Mapzen/Linux Foundation, AWS Open Data) mit Daten u. a. von SRTM, GMTED, ETOPO1 und weiteren Quellen gemäß deren Lizenzen.</li>
  </ul>
  <p>Alle Strecken, Workouts, Grafiken und Texte von VeloVerse sind eigene Inhalte, soweit nicht anders angegeben.</p>`;
}
