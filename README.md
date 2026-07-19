# Klausur-Lern-App

Deine bisherige HTML-Lern-App, umgebaut zu einer **richtigen App**:
eine App für alle Module, geräteübergreifender Fortschritt über ein Login,
installierbar auf Handy und Desktop (PWA). Vorlesung und Seminar bleiben
strikt getrennt, oben wählst du Semester → Modul → Teil.

Deine mab002-Daten (83 Karteikarten, 167 Quizfragen, 13 Sitzungen) sind
bereits eingebaut – konvertiert aus `mab002_app-3.html`, ohne Verlust.

---

## Was drin ist

- **Karteikarten** – Musterantwort ein/aus, Tipp-Button, Freitext-Bewertung
  per KI (Prozent + Note), Hilfe-Button bei < 60 %, Spracheingabe (🎤),
  Fortschritts-Panel mit farbcodierten Balken, Export/Import.
- **Quiz** – Score von Anfang an (z. B. 0/14, nicht 0/0), Erklärung nach
  jeder Antwort, Endauswertung mit Kreis + Note.
- **Probeprüfung** – 90-Minuten-Countdown (gelb ab 30, rot+blinkend ab 10),
  Sperre bei Ablauf, Einzel- und Gesamtbewertung. (Aufgaben-Pool ist als
  Grundgerüst angelegt – siehe „Ausbauen".)
- **Sync** – Login per Magic-Link, Fortschritt zentral in Supabase, immer
  gemergt (besserer Wert gewinnt), läuft ohne Cloud lokal weiter.
- **Sicher** – der Anthropic-API-Key liegt serverseitig in einer Edge
  Function, nie im Browser.

---

## Schnellstart lokal (5 Minuten)

Voraussetzung: Node.js 18+ installiert.

```bash
npm install
npm run dev
```

Läuft dann auf `http://localhost:5173`. **Ohne** Supabase-Konfiguration
funktioniert schon alles außer Login/Sync/KI-Bewertung – gut zum Ausprobieren.

---

## Voll einrichten (Sync + KI-Bewertung)

### 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> kostenlos registrieren, **New project** anlegen.
2. Warten, bis das Projekt bereit ist.
3. Unter **Project Settings → API** findest du zwei Werte:
   - *Project URL*
   - *anon public key*

### 2. Datenbank-Tabelle anlegen

1. Im Supabase-Dashboard: **SQL Editor → New query**.
2. Den Inhalt von `supabase/schema.sql` einfügen und **Run** klicken.
   Das legt die Tabelle `progress` an und schaltet den Zugriffsschutz
   (Row Level Security) ein.

### 3. Login aktivieren

- Unter **Authentication → Providers** ist **Email** standardmäßig an.
- Für den Magic-Link genügt das. (Optional kannst du unter
  **Authentication → URL Configuration** deine spätere Vercel-URL als
  Redirect eintragen.)

### 4. Frontend konfigurieren

```bash
cp .env.example .env
```

In `.env` deine beiden Werte aus Schritt 1 eintragen.

### 5. KI-Bewertung: Edge Function deployen

Dafür brauchst du die Supabase CLI (<https://supabase.com/docs/guides/cli>):

```bash
# einmalig
npm install -g supabase
supabase login
supabase link --project-ref DEIN-PROJECT-REF   # steht in der Project URL

# Function + Secret
supabase functions deploy grade
supabase secrets set ANTHROPIC_API_KEY=sk-ant-DEIN-KEY
```

Den Anthropic-Key bekommst du unter <https://console.anthropic.com>.
Er liegt danach nur bei Supabase, nie im Browser.

### 6. Testen

```bash
npm run dev
```

Anmelden, eine Karte bewerten lassen, Seite auf einem zweiten Gerät öffnen,
anmelden – der Fortschritt ist da.

---

## Online stellen + installierbar machen

1. Code in ein GitHub-Repo pushen.
2. Auf <https://vercel.com> mit GitHub anmelden, **Add New → Project**,
   das Repo auswählen.
3. Bei **Environment Variables** dieselben zwei Werte wie in `.env`
   eintragen (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. **Deploy**. Vercel erkennt Vite automatisch.

Danach hast du eine echte URL. Auf dem Handy im Browser öffnen →
„Zum Home-Bildschirm hinzufügen" → die App liegt wie eine native App auf
dem Homescreen und funktioniert offline.

> Tipp: Ersetze `public/icon.svg` durch echte PNG-Icons `icon-192.png`
> und `icon-512.png` (z. B. über <https://realfavicongenerator.net>),
> damit das App-Icon sauber aussieht.

---

## Ein neues Modul hinzufügen

Genau hier zahlt sich der Umbau aus – **kein HTML mehr neu generieren**:

1. Bestehende `<modul>_app.html` konvertieren:
   ```bash
   node scripts/convert-html.mjs pfad/zur/xyz_app.html vorlesung
   # oder für den Seminarteil:
   node scripts/convert-html.mjs pfad/zur/xyz_seminare_app.html seminar
   ```
   Das schreibt `src/data/xyz.json`.
2. In `src/data/index.ts` das neue Modul importieren und ins passende
   Semester einsortieren.
3. Fertig – die App zeigt es oben in der Modul-Auswahl.

Für **neue Sitzungen** in einem bestehenden Modul lässt du dir von Claude
künftig JSON nach dem Schema in `src/types.ts` erzeugen und fügst die
Einträge in die `flashcards`/`quiz`/`exam`-Arrays des Moduls ein.

---

## Projektanweisung anpassen

Schritt 5 deiner Projektanweisung ändert sich: Statt „generiere eine
HTML-Datei" heißt es künftig „erzeuge JSON nach dem Schema in `types.ts`
und ergänze es in `src/data/<modul>.json`". Die Schritte 1–3 (die
Word-Dokumente) bleiben unverändert.

---

## Ausbauen

- **Probeprüfungs-Aufgaben**: Die offenen Aufgaben aus deiner Probeklausur
  gehören ins `exam`-Array eines Tracks (Schema `ExamTask` in `types.ts`).
  Aktuell sind sie noch als Karteikarten hinterlegt; sie lassen sich dorthin
  übernehmen, dann greift der Timer-Modus voll.
- **Einzelkarten an-/abwählen**: Das Fortschritts-/Filter-System ist darauf
  vorbereitet (`flagged` + Session-Filter). Ein feineres „Karten je Sitzung
  an-/abwählen"-Panel wie in der alten App lässt sich als Erweiterung der
  `SessionFilter`-Komponente ergänzen.
- **Farbunterscheidung Vorlesung/Seminar**: über ein `data-track`-Attribut
  am `<body>` und ein paar CSS-Variablen-Overrides.

---

## Struktur auf einen Blick

```
src/
  types.ts            Datenschema (der zentrale Vertrag)
  data/               Modul-JSONs + Semester-Index
  lib/                grading, stabile IDs, Fortschritt+Sync, API
  components/         Auth, Tabs, Filter, Karteikarten, Quiz, Exam, …
supabase/
  schema.sql          Tabelle + Zugriffsschutz
  functions/grade/    Edge Function (sicherer API-Proxy)
scripts/
  convert-html.mjs    alte HTML  ->  Modul-JSON
```
