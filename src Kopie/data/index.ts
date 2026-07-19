import type { AppData } from '../types';
import mab002 from './mab002.json';
import globalisierung from './globalisierung.json';
import ewb002 from './ewb002.json';

// ============================================================
// Daten-Index: hier werden Modul-JSONs zu Semestern gebündelt.
//
// NEUES MODUL HINZUFÜGEN:
// 1. HTML konvertieren (Konverter im scripts-Ordner)
// 2. Erzeugte JSON hier importieren und ins passende Semester
//    einsortieren (im entsprechenden "modules"-Array).
//
// Semester sind von 1 bis 6 vorbereitet. Leere Semester zeigt
// die App automatisch ohne Module – du füllst sie später einfach.
// ============================================================

type Mod = AppData['semesters'][0]['modules'][0];

export const appData: AppData = {
  semesters: [
    { id: 'sem1', label: '1. Semester', modules: [] },
    {
      id: 'sem2',
      label: '2. Semester',
      modules: [
        mab002 as unknown as Mod,
        globalisierung as unknown as Mod,
      ],
    },
    {
      id: 'sem3',
      label: '3. Semester',
      modules: [
        ewb002 as unknown as Mod,
      ],
    },
    { id: 'sem4', label: '4. Semester', modules: [] },
    { id: 'sem5', label: '5. Semester', modules: [] },
    { id: 'sem6', label: '6. Semester', modules: [] },
  ],
};
