// ============================================================
// Prüfungstermine je Modul — Grundlage für den Countdown
// über den Reitern ("Noch X Tage bis zur Prüfung").
//
// WICHTIG: Schlüssel ist die Modul-ID (Feld "id" der Modul-JSON),
// NICHT der Anzeigename! (Beispiel: pkb002 hat die id "globalisierung".)
//
// Format: 'YYYY-MM-DD'. Fehlt ein Modul hier oder steht null,
// wird für dieses Modul kein Countdown angezeigt.
// ============================================================

export const examDates: Record<string, string | null> = {
  mab002: '2026-09-07',
  globalisierung: '2026-09-28',
  mab003: '2026-07-31',
  ewb001: '2027-02-02',
};

// ============================================================
// Zweittermine (Nachschreibtermine). Optional — nur eintragen,
// wo ein zweiter Termin bekannt ist.
//
// Anzeige im Countdown:
//   solange der Ersttermin in der Zukunft liegt, steht der
//   Zweittermin in Klammern dahinter;
//   ist der Ersttermin vorbei, zaehlt der Countdown automatisch
//   auf den Zweittermin weiter.
// ============================================================

export const examDatesZweittermin: Record<string, string | null> = {
  mab003: '2026-09-25',
  ewb001: '2027-03-31',
};
