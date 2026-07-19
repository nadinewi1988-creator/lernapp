import type { AppData } from '../types';
import mab002 from './mab002.json';

// ============================================================
//  Daten-Index: hier werden Modul-JSONs zu Semestern gebündelt.
//
//  NEUES MODUL HINZUFÜGEN:
//   1. HTML konvertieren:  node scripts/convert-html.mjs <html> vorlesung
//   2. Erzeugte JSON hier importieren und ins passende Semester
//      einsortieren.
//
//  Die Struktur ist Semester -> Module -> Tracks. Dadurch kann die
//  App oben nach Semester und darunter nach Modul filtern.
// ============================================================

export const appData: AppData = {
  semesters: [
    {
      id: 'ws2526',
      label: 'WS 2025/26',
      modules: [
        mab002 as unknown as AppData['semesters'][0]['modules'][0],
      ],
    },
  ],
};
