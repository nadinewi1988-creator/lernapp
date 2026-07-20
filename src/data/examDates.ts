// ============================================================
//  Prüfungstermine je Modul (für den Countdown über den Reitern).
//
//  Format: 'YYYY-MM-DD' (Jahr-Monat-Tag), also z. B. der
//  7. September 2026 = '2026-09-07'.
//
//  Für ein NEUES Modul einfach eine Zeile ergänzen (Modul-ID
//  wie in data/index.ts). Ist ein Modul hier nicht eingetragen
//  oder steht null, zeigt die App für dieses Modul keinen
//  Countdown an ("offen").
// ============================================================
export const examDates: Record<string, string | null> = {
  mab002: '2026-09-07',
  pkb002: '2026-07-21',
};
