// Startdaten für die Ersteinrichtung (werden einmal pro Konto in Supabase angelegt).
// Quelle: Entwurf Prüfungsseite (Stand 23./24.10.2026), Studienverlaufspläne BACS,
// Veranstaltungszeiten Studienjahr 2026/27. Noten werden NICHT vorbelegt –
// Nadine trägt alle Ergebnisse selbst ein.

export type Bereich = 'Mathe' | 'Politik' | 'Profil' | 'Praktika' | 'BA-Arbeit';

export interface StartTermin {
  art: 'Ersttermin' | 'Zweittermin' | 'Abgabe';
  datum?: string; // ISO
  zeit?: string;
  anmeldung_ab?: string;
  anmeldung_bis?: string;
  abmeldung_bis?: string;
  hinweis_an?: string; // Freitext, falls Zeitraum unklar
}
export interface StartModul {
  kuerzel: string;
  name: string;
  cp: number;
  form: string;
  sem: number; // geplantes Semester (Fachsemester)
  verschoben_nach?: number; // Prüfung verschoben in Semester
  hinweis?: string;
  lehramt_hrs?: boolean;
  termine?: StartTermin[];
  voraussetzungen?: { text: string; erledigt: boolean }[];
  unbenotet?: boolean;
}

export const STUDIENGANG = {
  name: 'Bachelor Combined Studies',
  abschluss: 'BA',
  option: 'Lehramtsoption Haupt- und Realschule · Mathematik + Politikwissenschaft',
  cp_ziel: 180,
  beginn: '2025-10-01',
};

export const SEMESTER: { fachsemester: number; bezeichnung: string; beginn: string; ende: string; vorlesung_beginn?: string; vorlesung_ende?: string }[] = [
  { fachsemester: 1, bezeichnung: 'WiSe 25/26', beginn: '2025-10-01', ende: '2026-03-31' },
  { fachsemester: 2, bezeichnung: 'SoSe 26', beginn: '2026-04-01', ende: '2026-09-30' },
  { fachsemester: 3, bezeichnung: 'WiSe 26/27', beginn: '2026-10-01', ende: '2027-03-31', vorlesung_beginn: '2026-10-12', vorlesung_ende: '2027-01-29' },
  { fachsemester: 4, bezeichnung: 'SoSe 27', beginn: '2027-04-01', ende: '2027-09-30' },
  { fachsemester: 5, bezeichnung: 'WiSe 27/28', beginn: '2027-10-01', ende: '2028-03-31' },
  { fachsemester: 6, bezeichnung: 'SoSe 28', beginn: '2028-04-01', ende: '2028-09-30' },
];

const HRS = new Set(['ewb001', 'ewb002', 'ewb013', 'pyb005', 'opb001', 'asp001', 'mab012']);

export function bereichVon(k: string): Bereich {
  const p = k.slice(0, 3);
  if (p === 'mab') return 'Mathe';
  if (p === 'pkb') return 'Politik';
  if (p === 'asp' || p === 'opb') return 'Praktika';
  if (p === 'btb') return 'BA-Arbeit';
  return 'Profil';
}

export const MODULE: StartModul[] = [
  // 1. Semester
  { kuerzel: 'mab001', name: 'Grundstrukturen der Mathematik', cp: 7, form: 'Klausur oder Portfolio', sem: 1 },
  { kuerzel: 'pkb001', name: 'Einführung in die Politikwissenschaft', cp: 6, form: 'Klausur', sem: 1 },
  { kuerzel: 'ewb001', name: 'Grundlagen und Grundbegriffe der Erziehungswissenschaften', cp: 6, form: 'Online-Klausur vor Ort', sem: 1, verschoben_nach: 3, hinweis: '13 Uhr (Einlass 12 Uhr)',
    termine: [
      { art: 'Ersttermin', datum: '2027-02-02', zeit: '13 Uhr', anmeldung_ab: '2026-10-14', anmeldung_bis: '2026-12-31', abmeldung_bis: '2027-01-22' },
      { art: 'Zweittermin', datum: '2027-03-30', zeit: '13 Uhr', anmeldung_ab: '2027-02-14', anmeldung_bis: '2027-03-15', abmeldung_bis: '2027-03-27' },
    ],
    voraussetzungen: [{ text: 'Am Prüfungstag mitbringen: Laptop/Tablet mit Internet + Ausweis', erledigt: false }] },
  { kuerzel: 'ewb002', name: 'Methoden der empirischen Bildungsforschung', cp: 5, form: 'Präsenzklausur', sem: 1, verschoben_nach: 3, hinweis: 'ca. 12 Uhr, überwiegend offene Fragen',
    termine: [
      { art: 'Ersttermin', datum: '2027-02-04', zeit: 'ca. 12 Uhr', hinweis_an: 'ab Januar 2027 (noch nicht bekannt)' },
      { art: 'Zweittermin', datum: '2027-03-18', zeit: 'ca. 12 Uhr', hinweis_an: 'ab Mitte/Ende Februar (noch nicht bekannt)' },
    ] },
  { kuerzel: 'opb001', name: 'Orientierungspraktikum (OP)', cp: 6, form: 'Portfolio (bestanden/nicht bestanden)', sem: 1, unbenotet: true },
  // 2. Semester
  { kuerzel: 'mab002', name: 'Grundlagen des Lernens und Lehrens von Mathematik', cp: 6, form: 'Klausur', sem: 2, termine: [{ art: 'Ersttermin', datum: '2026-09-07' }] },
  { kuerzel: 'mab003', name: 'Geometrie', cp: 6, form: 'Klausur', sem: 2, verschoben_nach: 4 },
  { kuerzel: 'pkb002', name: 'Globalisierung und Internationale Beziehungen', cp: 8, form: 'Klausur', sem: 2, hinweis: 'Ersttermin 21.07. nicht genutzt → geschrieben am 28.09.2026 (zählt als Erstversuch)', termine: [{ art: 'Ersttermin', datum: '2026-09-28' }] },
  { kuerzel: 'ewb013', name: 'Allgemeine Didaktik und Unterrichtsforschung', cp: 8, form: 'Klausur (Sondergenehmigung statt Hausarbeit)', sem: 2 },
  { kuerzel: 'pbb133', name: 'Kaufmännische Grundlagen für die Unternehmenspraxis und Gründung', cp: 6, form: 'angerechnet aus der Ausbildung, ohne Note', sem: 2, unbenotet: true },
  // 3. Semester
  { kuerzel: 'mab004', name: 'Mathematik in den digitalen Medien', cp: 5, form: 'Klausur', sem: 3, hinweis: '8–10 Uhr',
    termine: [
      { art: 'Ersttermin', datum: '2027-02-02', zeit: '8–10 Uhr', anmeldung_ab: '2026-11-23' },
      { art: 'Zweittermin', datum: '2027-03-16', zeit: '8–10 Uhr' },
    ] },
  { kuerzel: 'mab005', name: 'Wahrscheinlichkeitsrechnung', cp: 6, form: 'Klausur, 90 Min.', sem: 3, hinweis: '14–16 Uhr (Termine noch als Vorschlag)',
    termine: [
      { art: 'Ersttermin', datum: '2027-02-08', zeit: '14–16 Uhr', hinweis_an: 'noch nicht bekannt' },
      { art: 'Zweittermin', datum: '2027-03-29', zeit: '14–16 Uhr', hinweis_an: 'noch nicht bekannt' },
    ] },
  { kuerzel: 'pkb003', name: 'Systemanalyse', cp: 10, form: 'Hausarbeit (45.000–55.000 Zeichen)', sem: 3, hinweis: 'freiwillige Präsentation am 12.11.',
    termine: [{ art: 'Abgabe', datum: '2027-03-15', hinweis_an: 'Thema in der Sprechstunde vereinbaren' }],
    voraussetzungen: [{ text: 'Thema in der Sprechstunde vereinbart', erledigt: true }] },
  { kuerzel: 'pyb005', name: 'Grundlagen der Pädagogischen Psychologie für Bildung und Erziehung', cp: 6, form: 'Klausur, 30 MC-Fragen', sem: 3, hinweis: '10–15 Uhr',
    termine: [
      { art: 'Ersttermin', datum: '2027-02-09', zeit: '10–15 Uhr', anmeldung_ab: '2026-11-01', anmeldung_bis: '2027-01-31', abmeldung_bis: '2027-02-05' },
      { art: 'Zweittermin', datum: '2027-03-16', zeit: '10–15 Uhr', hinweis_an: 'neu anmelden, Zeitraum noch nicht bekannt' },
    ],
    voraussetzungen: [{ text: 'In alle pyb005-Veranstaltungen eingetragen (Prüfungsvoraussetzung, bis 26.10.)', erledigt: true }] },
  // 4. Semester
  { kuerzel: 'mab006', name: 'Zahlbereiche und Funktionen', cp: 6, form: 'Klausur', sem: 4 },
  { kuerzel: 'mab007', name: 'Einführung in spezifische mathematikdidaktische Themen', cp: 6, form: 'Portfolio', sem: 4 },
  { kuerzel: 'pkb004', name: 'Europäische Integration', cp: 6, form: 'Hausarbeit', sem: 4 },
  { kuerzel: 'asp001', name: 'Allgemeines Schulpraktikum (ASP)', cp: 9, form: 'Praktikumsbericht (benotet, zählt mit 6 CP)', sem: 4, hinweis: 'Praktikumszeit 30.08.–08.10.2027' },
  { kuerzel: 'pbx', name: 'Profilmodul „Schule und Unterricht“ oder „Bildung und Erziehung“', cp: 5, form: 'offen', sem: 4, hinweis: 'Modul noch wählen' },
  // 5. Semester
  { kuerzel: 'mab008', name: 'Digitale Medien in der Mathematik', cp: 6, form: 'Klausur oder Portfolio oder Hausarbeit', sem: 5 },
  { kuerzel: 'mab009', name: 'Spezialgebiete der Mathematik', cp: 6, form: 'Portfolio', sem: 5, hinweis: 'Wahlpflichtbereich I: mab009 oder mab010 – mab009 für M.Ed. HRS empfohlen' },
  { kuerzel: 'pkb005', name: 'Wissenschaftstheorie', cp: 8, form: 'Klausur', sem: 5 },
  { kuerzel: 'pkb006', name: 'Politische Theorie', cp: 8, form: 'Klausur', sem: 5 },
  // 6. Semester
  { kuerzel: 'mab012', name: 'Schulmathematik der Sekundarstufe I aus fachwissenschaftlicher Perspektive', cp: 6, form: 'offen', sem: 6, hinweis: 'Wahlpflichtbereich II · Empfehlung für Haupt- und Realschule' },
  { kuerzel: 'pkb007', name: 'Politische Bildung', cp: 8, form: 'Referat oder Hausarbeit', sem: 6 },
  { kuerzel: 'pkb008', name: 'Kolloquium zur Demokratieforschung und -vermittlung', cp: 6, form: 'Referat', sem: 6 },
  { kuerzel: 'btb001', name: 'Bachelorarbeit', cp: 10, form: 'Bachelorarbeit (Faktor 1,5)', sem: 6 },
].map((m) => ({ ...m, lehramt_hrs: HRS.has(m.kuerzel) })) as StartModul[];

export const REGELN = [
  { titel: '3 Versuche pro Prüfung', text: 'Eine nicht bestandene Modulprüfung kann zweimal wiederholt werden. Die 2. Wiederholung ist in der Regel mündlich (20 Min.). Danach ist sie endgültig nicht bestanden – bei Pflichtmodulen endet damit der Prüfungsanspruch.', quelle: 'RPO § 25 Abs. 1, § 26' },
  { titel: 'Wann wiederholen?', text: 'Die 1. Wiederholung spätestens zum nächsten regulären Prüfungstermin. Für die 2. Wiederholung meldest du dich über das Prüfungsamt an – keine automatische Anmeldung.', quelle: 'RPO § 25 Abs. 3 und 5' },
  { titel: 'Keine Notenverbesserung', text: 'Eine bestandene Prüfung darf nicht wiederholt werden, um die Note zu verbessern. Einen Freiversuch gibt es nicht.', quelle: 'RPO § 25 Abs. 2' },
  { titel: 'Abmelden', text: 'Spätestens 3 Tage vor dem Prüfungstermin, sofern für die Prüfung nichts anderes angegeben ist (z. B. ewb001: bis 22.01.). Danach nur Rücktritt aus wichtigem Grund.', quelle: 'RPO § 16 Abs. 4' },
  { titel: 'Krank am Prüfungstag', text: 'Sofort schriftlich melden (E-Mail vom Uni-Account reicht) und ärztliches Attest innerhalb von 5 Werktagen. Beim letzten Versuch ist ein amtsärztliches Attest nötig. Sonst gilt die Prüfung als nicht bestanden.', quelle: 'RPO § 27' },
  { titel: 'Familienaufgaben', text: 'Wer ein Kind unter 14 Jahren betreut, kann auf Antrag Prüfungen in anderer Form, zu anderen Terminen oder mit anderen Fristen ablegen.', quelle: 'RPO § 30 Abs. 4' },
  { titel: 'Noten', text: '1,0–4,0 bestanden, 5,0 nicht bestanden. Gesamtnote: nach CP gewichtetes Mittel, nur die erste Nachkommastelle zählt, es wird nicht gerundet (2,48 → 2,4).', quelle: 'RPO § 22, § 23 · PO BACS § 10' },
  { titel: 'Gesamtnote BACS', text: 'Mathematik 60 CP · Politikwissenschaft 60 CP · Profilierungsbereich 35 CP · Praktikumsbericht 6 CP · Bachelorarbeit 10 CP mit Faktor 1,5. Unbenotete Module zählen nicht.', quelle: 'PO BACS § 9, § 10' },
];

export const DOKUMENTE = [
  { titel: 'Rahmenprüfungsordnung (Amtliches Mitteilungsblatt 14/2026)', info: 'gilt seit 09.09.2026', url: 'https://www.uni-vechta.de/fileadmin/user_upload/Amtliche_Mitteilungsblaetter/Jahrgang_2026/14-26_Rahmenpruefungsordnung.pdf' },
  { titel: 'Prüfungsordnung Bachelor Combined Studies (2024)', info: 'gilt ab WiSe 24/25', url: 'https://www.uni-vechta.de/fileadmin/user_upload/Zentrale_Studienberatung_Career_Service/01_DC_Studienprogramme/BACS_Allgemeine_Ordnungen_und_Anlagen/BACS_allgemein_Studienbeginn_ab_WiSe_2024_25/15_2024_BACS_Pruefungsordnung.pdf' },
  { titel: 'Studienverlaufspläne mit und ohne Lehramtsoption', info: 'allgemein', url: 'https://www.uni-vechta.de/fileadmin/user_upload/Zentrale_Studienberatung_Career_Service/01_DC_Studienprogramme/BACS_Allgemeine_Ordnungen_und_Anlagen/BACS_allgemein_Studienbeginn_ab_WiSe_2024_25/15_2024_BACS_Studienverlaufsplaene_mit_und_ohne_Lehramtsoption.pdf' },
  { titel: 'Studienverlaufsplan Mathematik', info: 'Teilstudiengang', url: 'https://www.uni-vechta.de/fileadmin/user_upload/Zentrale_Studienberatung_Career_Service/01_DC_Studienprogramme/BACS_Faecher/BACS_Mathematik/MA_Studienbeginn_ab_WiSe_2024_25/15_2024_BACS_Mathematik_Studienverlaufsplan.pdf' },
  { titel: 'Studienverlaufsplan Politikwissenschaft', info: 'Teilstudiengang', url: 'https://www.uni-vechta.de/fileadmin/user_upload/Zentrale_Studienberatung_Career_Service/01_DC_Studienprogramme/BACS_Faecher/BACS_Politikwissenschaft/PK_Studienbeginn_ab_WiSe_2024_25/15_2024_BACS_Politikwissenschaft_Studienverlaufsplaene.pdf' },
];

/** Modulfarben (Text, Fläche) – aktuelles Semester in Pastell, sonst gedämpft je Fach. */
export const FARBEN: Record<string, [string, string]> = {
  mab004: ['#5f80b5', '#eaf1fc'], mab005: ['#4f8f80', '#e6f5f0'], pkb003: ['#b46b80', '#fbebef'],
  ewb001: ['#6d9156', '#edf5e5'], ewb002: ['#b5845a', '#fcf0e4'], pyb005: ['#8a77b5', '#f1edfa'],
};
export function farbe(k: string): [string, string] {
  if (FARBEN[k]) return FARBEN[k];
  const b = bereichVon(k);
  return b === 'Mathe' ? ['#5c6f94', '#eef1f6'] : b === 'Politik' ? ['#8a6573', '#f6eff2'] : ['#66705f', '#f0f2ee'];
}
