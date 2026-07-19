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
  id: 'vorlesung' | 'seminar';
  label: string;            // "Vorlesung" | "Seminare"
  sessions: string[];       // Reihenfolge der Sitzungen/Seminare
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  exam: ExamTask[];
  /** Prüfungsdauer in Minuten (Default 90). */
  examDurationMin?: number;
}

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
