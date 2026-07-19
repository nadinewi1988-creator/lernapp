import type { AppData } from '../types';
import mab002 from './mab002.json';
import globalisierung from './globalisierung.json';

// ============================================================
//  Daten-Index: hier werden Modul-JSONs zu Semestern gebündelt.
//
//  NEUES MODUL HINZUFÜGEN:
//   1. HTML konvertieren (Konverter im scripts-Ordner)
//   2. Erzeugte JSON hier importieren und ins passende Semester
//      einsortieren.
// ============================================================

type Mod = AppData['semesters'][0]['modules'][0];

export const appData: AppData = {
  semesters: [
    {
      id: 'ws2526',
      label: 'WS 2025/26',
      modules: [
        mab002 as unknown as Mod,
        globalisierung as unknown as Mod,
      ],
    },
  ],
};
