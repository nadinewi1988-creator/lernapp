// ============================================================
//  Prüfungstermine je Modul (für den Countdown über den Reitern).
//
//  Format: 'YYYY-MM-DD' (Jahr-Monat-Tag), also z. B. der
//  7. September 2026 = '2026-09-07'.
//
//  WICHTIG: Schlüssel ist die Modul-ID (Feld "id" in der Modul-
//  Datei), NICHT der Anzeigename. Beispiel: pkb002 hat die ID
//  "globalisierung". Für ein neues Modul einfach eine Zeile
//  ergänzen. Fehlt ein Modul hier oder steht null, zeigt die
//  App keinen Countdown ("offen").
// ============================================================
export const examDates: Record<string, string | null> = {
  mab002: '2026-09-07',
  globalisierung: '2026-07-21', // Anzeigename: pkb002
};
