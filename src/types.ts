// ============================================================
//  DATENSCHEMA – der zentrale Vertrag für alle Modul-Inhalte.
//
//  Dies ist der Kern der ganzen Architektur: Die App-Hülle
//  (Komponenten, Filter, Timer, Fortschritt) ist konstant.
//  Was sich pro Modul / pro Woche ändert, sind AUSSCHLIESSLICH
//  Daten, die dieser Struktur entsprechen.
//
//  Wenn Claude künftig eine neue Sitzung ergänzt, erzeugt es
//  JSON nach genau diesem Schema – kein HTML mehr.
// ============================================================

/** Kennzeichnung der Herkunft einer Frage (Projektanweisung). */
export type Herkunft =
  | 'direkt'    // grün  – wortnah aus offiziellem Lernziel/Aufgabe
  | 'selbst'    // orange – plausibel selbst aus den Inhalten abgeleitet
  | 'original'; // blau  – wortwörtlich aus Probeklausur/echter Prüfung

/** Eine einzelne Karteikarte. */
export interface Flashcard {
  /**
   * STABILE ID – niemals fortlaufende Nummer!
   * Aus Hash von (Sitzung + Fragetext) erzeugt, damit der
   * gespeicherte Lernfortschritt bei Ergänzungen nicht verrutscht.
   * (Siehe scripts/convert-html.mjs und src/lib/id.ts)
   */
  id: string;
  session: string;          // z.B. "Sitzung 1" oder "Seminar 3"
  q: string;                // Frage (mit korrektem Operator!)
  a: string;                // Musterantwort
  hint?: string;            // Tipp-Button: Denkanstoß, kein Verrat
  herkunft?: Herkunft;      // Kennzeichnung (Default: 'selbst')
  /** true = zugehöriges Material fehlt → aus Pools ausschließen. */
  flagged?: boolean;
  /**
   * Optionaler Aufgaben-Typ – nur für die Probeprüfungs-Feinlogik
   * (Bauform 4). Erlaubt die typgenaue Seminar-Auswahl bei pkb002:
   *  - 'erklaeren'  → Theorie erläutern
   *  - 'vergleich'  → Theorienvergleich
   *  - 'anwendung'  → Theorieanwendung auf einen Fall
   * Karten ohne subtype (z.B. reine Definitions-/Kontextkarten)
   * werden von typgenauen Auswahlen übersprungen.
   */
  subtype?: 'erklaeren' | 'vergleich' | 'anwendung';
}

/** Eine Multiple-Choice-Quizfrage. */
export interface QuizQuestion {
  id: string;
  session: string;
  q: string;
  options: string[];
  correct: number;          // Index der richtigen Option
  expl: string;             // Erklärung nach der Antwort
  herkunft?: Herkunft;
  flagged?: boolean;
}

/** Eine offene Aufgabe der Probeprüfung. */
export interface ExamTask {
  id: string;
  session: string;
  q: string;
  a: string;                // Erwartungshorizont / Musterlösung
  points?: number;          // Punkte laut Klausurstruktur
  kind?: 'offen' | 'mc';    // offene Aufgabe oder Multiple-Choice
  options?: string[];       // nur bei kind === 'mc'
  correct?: number[];       // bei MC: Indizes richtiger Optionen
  herkunft?: Herkunft;
  flagged?: boolean;
}

/**
 * Ein Track = Vorlesung ODER Seminar.
 * Vorlesung und Seminar werden strikt getrennt behandelt
 * (Projektanweisung), leben aber im selben Modul.
 */
export interface Track {
  id: 'vorlesung' | 'seminar' | 'tutorium';
  label: string;            // "Vorlesung" | "Seminare"
  sessions: string[];       // Reihenfolge der Sitzungen/Seminare
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  exam: ExamTask[];
  /** Prüfungsdauer in Minuten (Default 90). */
  examDurationMin?: number;
  /**
   * Wählt die Prüfungs-Bauform + Parameter für diesen Track.
   * Fehlt sie, nutzt die App Bauform 1 (Zufallspool) über alle
   * Karteikarten – so hat jeder Track automatisch eine funktionierende
   * Probeprüfung, ohne dass etwas bricht.
   */
  examConfig?: ExamConfig;
}

// ---- Probeprüfungs-Bauformen ------------------------------------
//
// Leitprinzip (siehe SPEC_Probepruefung.md): Die Logik lebt EINMAL
// zentral in der App (components/Exam.tsx). Ein Modul wählt über
// diese Konfiguration NUR aus, welche Bauform es nutzt und mit
// welchen Parametern. Inhalte kommen aus den Karteikarten/dem Quiz.

/** Feste Anzahl (z.B. 8) oder zufällige Spanne (z.B. [7, 10]). */
export type ExamCount = number | [number, number];

/** Bauform 1 – Zufallspool: N zufällige offene Aufgaben. */
export interface ZufallspoolConfig {
  bauform: 'zufallspool';
  durationMin?: number;
  /** Nur aus diesen Sitzungen ziehen (Default: alle). */
  sessions?: string[];
  /** Anzahl offener Aufgaben – fest oder Spanne. */
  count: ExamCount;
  /** Aufgaben möglichst aus verschiedenen Sitzungen streuen. */
  spreadSessions?: boolean;
  /** Zusätzliche MC-Aufgaben am Ende (aus dem Quiz-Pool). */
  plusMc?: number;
}

/** Bauform 2 – Reine MC-Klausur: N Multiple-Choice-Fragen. */
export interface McConfig {
  bauform: 'mc';
  durationMin?: number;
  sessions?: string[];
  count: ExamCount;
}

/** Bauform 3 – Feste Aufgaben: festes Set in fester Reihenfolge (aus track.exam). */
export interface FesteConfig {
  bauform: 'feste';
  durationMin?: number;
  /** Konkrete Aufgaben-IDs in gewünschter Reihenfolge (leer = alle aus track.exam). */
  taskIds?: string[];
}

/** Eine typgenaue Einzel-Auswahl innerhalb einer Verteilungs-Quelle. */
export interface ExamPick {
  /** Nur Karten mit diesem subtype. */
  subtype?: 'erklaeren' | 'vergleich' | 'anwendung';
  /** Auswahl auf diese Sitzungen einschränken. */
  fromSessions?: string[];
}

/** Eine Quelle innerhalb von Bauform 4. */
export interface VerteilungQuelle {
  /** Trennüberschrift, z.B. "Vorlesungsteil". */
  label: string;
  /** Aus welchen Sitzungen diese Quelle zieht. */
  sessions: string[];
  /** Wie viele Aufgaben aus dieser Quelle. */
  count: number;
  /** Je Ziehung eine andere Sitzung bevorzugen. */
  distinctSessions?: boolean;
  /**
   * Optionale Feinlogik: statt zufällig `count` Karten zu ziehen,
   * exakt diese (typgenauen) Auswahlen der Reihe nach. Ist `picks`
   * gesetzt, bestimmt seine Länge die Aufgabenzahl.
   */
  picks?: ExamPick[];
}

/** Bauform 4 – Verteilung "X aus A + Y aus B" (ggf. mit Feinlogik). */
export interface VerteilungConfig {
  bauform: 'verteilung';
  durationMin?: number;
  quellen: VerteilungQuelle[];
  /**
   * Erlaubt vor dem Start die Wahl einzelner Quellen statt aller
   * (z.B. pkb002: nur Vorlesung / nur Seminar / beide).
   */
  modes?: boolean;
}

export type ExamConfig =
  | ZufallspoolConfig
  | McConfig
  | FesteConfig
  | VerteilungConfig;

/** Ein Modul, z.B. "mab002 – Mathematikdidaktik". */
export interface Module {
  id: string;               // z.B. "mab002"
  name: string;             // Anzeigename
  tracks: Track[];
}

/** Ein Semester bündelt mehrere Module. */
export interface Semester {
  id: string;               // z.B. "ws2526"
  label: string;            // "WS 2025/26"
  modules: Module[];
}

/** Die gesamte Lern-Datenbasis der App. */
export interface AppData {
  semesters: Semester[];
}

// ---- Fortschritt ------------------------------------------------

/** Fortschritt pro Karte: bester Prozentwert + Anzahl Versuche. */
export interface CardProgress {
  best: number;             // 0–100
  attempts: number;
}

/** Fortschritt-Map: cardId -> CardProgress. */
export type ProgressMap = Record<string, CardProgress>;
