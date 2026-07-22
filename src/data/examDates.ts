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
  mab003: '2026-07-31', // Erstversuch; nach dem 31.07. ggf. auf '2026-09-25' (Zweitversuch) ändern
};
