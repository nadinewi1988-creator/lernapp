// Stundenplan WiSe 26/27 (aus Stud.IP, Stand 23.10.2026) und Kalenderdaten Niedersachsen/Uni Vechta.
// Wird einmalig in Supabase angelegt (Teilmodule, Veranstaltungen, Sitzungen). Danach pflegt der
// Stud.IP-Wochencheck bzw. Nadine die Sitzungen in der Datenbank.

export interface StartKurs {
  id: string; modul: string; titel: string; kurz: string; art: string;
  wd?: number; dates?: string[]; sessions?: [string, string, string, string, string][];
  von?: string; bis?: string; raum?: string; raumAus?: Record<string, string>;
  themen?: Record<string, string>; themenListe?: string[]; exakt?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoVon = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const plusTage = (s: string, n: number) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoVon(d); };
const dm = (s: string) => { const [d, m] = s.split('.'); return (m === '01' ? '2027' : '2026') + '-' + m + '-' + d; };

/** Montage der Vorlesungswochen WiSe 26/27 */
export const WOCHEN: string[] = [];
for (let d = '2026-10-12'; d <= '2026-12-14'; d = plusTage(d, 7)) WOCHEN.push(d);
for (let d = '2027-01-04'; d <= '2027-01-25'; d = plusTage(d, 7)) WOCHEN.push(d);

export const KURSE: StartKurs[] = [
  { id: 'mab004-1', modul: 'mab004.1', art: 'Vorlesung', titel: 'Mathematik in den digitalen Medien I', kurz: 'Digitale Medien I · VL', wd: 1, von: '08:00', bis: '10:00', raum: 'B1' },
  { id: 'mab004-2', modul: 'mab004.2', art: 'Seminar', titel: 'Mathematik in den digitalen Medien II (Gruppe A)', kurz: 'Digitale Medien II · Gr. A', wd: 1, von: '10:00', bis: '12:00', raum: 'J11' },
  { id: 'mab005-1', modul: 'mab005.1', art: 'Vorlesung', titel: 'Wahrscheinlichkeitsrechnung I', kurz: 'Wahrscheinlichkeitsrechnung I · VL', wd: 0, von: '14:00', bis: '16:00', raum: 'B1', themen: { '2026-10-12': 'Kapitel 0 (Organisatorisches) und Einstieg Kapitel 1', '2026-10-19': 'Kapitel 1, Stand danach: bis Folie 32 von 54', '2026-10-26': 'Kapitel 1 ab Folie 33' } },
  { id: 'mab005-2', modul: 'mab005.2', art: 'Übung', titel: 'Wahrscheinlichkeitsrechnung II (Gruppe C)', kurz: 'Wahrscheinlichkeitsr. II · Gr. C', wd: 0, von: '18:00', bis: '20:00', raum: 'E033', exakt: true, themen: { '2026-10-12': 'Aufgabenblatt 01', '2026-10-19': 'Aufgabenblatt 02' } },
  { id: 'pkb003-1', modul: 'pkb003.1', art: 'Seminar', titel: 'Politische Ordnung: Das politische System der Bundesrepublik', kurz: 'Politische Ordnung', wd: 1, von: '12:00', bis: '14:00', raum: 'E137b' },
  { id: 'pkb003-2', modul: 'pkb003.2', art: 'Seminar', titel: 'Wirtschaft und Soziales: Wirtschaft und Gesellschaft der Bundesrepublik', kurz: 'Wirtschaft und Soziales', wd: 0, von: '12:00', bis: '14:00', raum: 'E137b' },
  { id: 'pkb003-3', modul: 'pkb003.3', art: 'Seminar', titel: 'Verwaltung: Einführung in die öffentliche Verwaltung', kurz: 'Verwaltung (14-täglich)', von: '14:00', bis: '18:00', raum: 'B1', dates: ['22.10', '12.11', '19.11', '03.12', '17.12', '14.01', '28.01'].map(dm) },
  { id: 'ewb001-a', modul: 'ewb001.1', art: 'Vorlesung', titel: 'Einführung in die Erziehungswissenschaften (Gruppe B)', kurz: 'Einführung Erziehungswiss. · Gr. B', wd: 1, von: '18:00', bis: '20:00', raum: 'Q016' },
  { id: 'ewb001-b', modul: 'ewb001.2', art: 'Seminar', titel: 'Kompetenzorientiertes Lehren und Lernen (Gruppe B)', kurz: 'Kompetenzorient. Lehren · Gr. B', wd: 1, von: '14:00', bis: '16:00', raum: 'Q016' },
  { id: 'ewb001-t', modul: 'ewb001', art: 'Tutorium', titel: 'Tutorium ewb001 (Gruppe 3)', kurz: 'Tutorium ewb001', wd: 4, von: '10:15', bis: '11:45', raum: 'digital', exakt: true },
  { id: 'ewb002-v', modul: 'ewb002.1', art: 'Vorlesung', titel: 'Wissenschaftstheoretische und methodische Grundlagen der empirischen Bildungsforschung (Gruppe A)', kurz: 'Empirische Bildungsforschung · VL', wd: 2, von: '10:00', bis: '12:00', raum: 'F144 (gr. Aula)', raumAus: { '2026-12-02': 'B1' } },
  { id: 'ewb002-m', modul: 'ewb002.2', art: 'Seminar', titel: 'Methoden der empirischen Bildungsforschung in Anwendung und Praxis (Gruppe M)', kurz: 'Methoden emp. Bildungsf. · Gr. M', wd: 1, von: '14:00', bis: '16:00', raum: 'R005' },
  { id: 'pyb005-v', modul: 'pyb005.1', art: 'Vorlesung', titel: 'Grundlagen der Pädagogischen Psychologie für Bildung und Erziehung', kurz: 'Päd. Psychologie · VL', exakt: true, sessions: [
    ['2026-10-14', '10:00', '12:00', 'Q016', '01 Grundlegende Studieneinführung'],
    ['2026-10-21', '10:00', '14:00', 'B1', '02 Zentrale psychologische Paradigmen und Grundlagen psychologischer Forschung'],
    ['2026-10-28', '10:00', '14:00', 'Q016, ab 12 Uhr B1', '03 Grundlagen der Entwicklungspsychologie I+II'],
    ['2026-11-04', '10:00', '14:00', 'Q016, ab 12 Uhr B1', '04 Grundlagen der Lernpsychologie I+II'],
    ['2026-11-11', '10:00', '12:00', 'digital', '05 Kognition – Emotion – Motivation – Verhalten'],
    ['2026-11-25', '10:00', '14:00', 'B1', '06 Grundlagen der Sozialpsychologie I+II'],
    ['2026-12-02', '10:00', '12:00', 'digital', '07 Neuro- und biopsychologische Grundlagen'],
    ['2026-12-16', '10:00', '12:00', 'B1', '08 Grundlagen der differentiellen Psychologie'],
    ['2027-01-06', '10:00', '12:00', 'digital', ''],
    ['2027-01-27', '10:00', '12:00', 'B1', '09 Abschlussbesprechung']] },
  { id: 'pyb005-e', modul: 'pyb005', art: 'eÜbung', titel: 'Vertiefende eÜbung (Gruppe B)', kurz: 'Päd. Psychologie · eÜbung', wd: 3, von: '12:00', bis: '14:00', raum: 'digital', themen: {
    '2026-10-15': '01 Grundlegende Studieneinführung', '2026-10-22': '02 Zentrale psychologische Paradigmen und Grundlagen psychologischer Forschung',
    '2026-10-29': '03 Grundlagen der Entwicklungspsychologie I+II', '2026-11-05': '04 Grundlagen der Lernpsychologie I+II',
    '2026-11-12': '05 Kognition – Emotion – Motivation – Verhalten', '2026-11-26': '06 Grundlagen der Sozialpsychologie I+II',
    '2026-12-03': '07 Neuro- und biopsychologische Grundlagen', '2026-12-17': '08 Grundlagen der differentiellen Psychologie', '2027-01-28': '09 Abschlussbesprechung' } },
  { id: 'pyb005-s', modul: 'pyb005.2', art: 'Seminar', titel: 'Vertiefende Thematiken für Handlungsfelder der Bildung und Erziehung (Gruppe D)', kurz: 'Päd. Psychologie · Seminar Gr. D', wd: 0, von: '16:00', bis: '18:00', raum: 'Q113', themenListe: [
    '01 Einführung', '02 Zentrale Paradigmen', '03 Ausgewählte Aspekte psychologischer Forschung', '04 Entwicklungspsychologische Aspekte I', '05 Entwicklungspsychologische Aspekte II',
    '06 Lernpsychologische Aspekte I', '07 Lernpsychologische Aspekte II', '08 Kognition – Emotion – Motivation – Verhalten I', '09 Kognition – Emotion – Motivation – Verhalten II',
    '10 Sozialpsychologische Aspekte I', '11 Sozialpsychologische Aspekte II', '12 Neuro- und biopsychologische Aspekte', '13 Differentiell-psychologische Aspekte', '14 Abschlussbesprechung'] },
];

/** Freiwillige Tutorien ohne festen Termin (nur für die Auswahl beim Eintrag) */
export const EXTRA_TEILMODULE = [
  { modul: 'mab004', art: 'Tutorium', titel: 'Tutorium mab004 (freiwillig)' },
  { modul: 'ewb002', art: 'Tutorium', titel: 'Tutorium ewb002 (freiwillig)' },
];

const verschiebe = (t: string, m: number) => { const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); };

/** Alle Sitzungen eines Kurses (akademisches Viertel schon eingerechnet) */
export function sitzungenVon(k: StartKurs) {
  const roh: { datum: string; von: string; bis: string; raum: string; thema: string }[] = [];
  if (k.sessions) k.sessions.forEach(([datum, von, bis, raum, thema]) => roh.push({ datum, von, bis, raum, thema }));
  else (k.dates ?? WOCHEN.map((m) => plusTage(m, k.wd!))).forEach((d, i) => roh.push({ datum: d, von: k.von!, bis: k.bis!, raum: k.raumAus?.[d] ?? k.raum!, thema: k.themen?.[d] ?? k.themenListe?.[i] ?? '' }));
  return roh.map((s) => (k.exakt ? s : { ...s, von: verschiebe(s.von, 15), bis: verschiebe(s.bis, -15) }));
}

// ---------- Feiertage, Ferien, Uni-Termine ----------
function ostern(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return isoVon(new Date(y, mo - 1, da));
}
export const FEIERTAGE: Record<string, string> = {};
[2026, 2027, 2028].forEach((y) => {
  const o = ostern(y);
  ([[y + '-01-01', 'Neujahr'], [plusTage(o, -2), 'Karfreitag'], [plusTage(o, 1), 'Ostermontag'], [y + '-05-01', 'Tag der Arbeit'], [plusTage(o, 39), 'Christi Himmelfahrt'], [plusTage(o, 50), 'Pfingstmontag'], [y + '-10-03', 'Tag der Deutschen Einheit'], [y + '-10-31', 'Reformationstag'], [y + '-12-25', '1. Weihnachtstag'], [y + '-12-26', '2. Weihnachtstag']] as [string, string][]).forEach(([d, n]) => { FEIERTAGE[d] = n; });
});
export const FERIEN: [string, string, string][] = [['Sommerferien', '2026-07-02', '2026-08-12'], ['Herbstferien', '2026-10-12', '2026-10-24'], ['Weihnachtsferien', '2026-12-23', '2027-01-09'], ['Halbjahresferien', '2027-02-01', '2027-02-02'], ['Osterferien', '2027-03-22', '2027-04-03'], ['Ferientag', '2027-05-07', '2027-05-07'], ['Ferientag', '2027-05-18', '2027-05-18'], ['Sommerferien', '2027-07-08', '2027-08-18'], ['Herbstferien', '2027-10-16', '2027-10-30'], ['Weihnachtsferien', '2027-12-23', '2028-01-08'], ['Halbjahresferien', '2028-01-31', '2028-02-01'], ['Osterferien', '2028-04-10', '2028-04-22'], ['Ferientag', '2028-05-26', '2028-05-26'], ['Ferientag', '2028-06-06', '2028-06-06'], ['Sommerferien', '2028-07-20', '2028-08-30']];
export const UNI: [string, string, string][] = [['vorlesungsfrei (Weihnachten)', '2026-12-21', '2027-01-03'], ['letzter Vorlesungstag', '2027-01-30', '2027-01-30'], ['Semesterende WiSe 26/27', '2027-03-31', '2027-03-31'], ['Semesterbeginn SoSe 27', '2027-04-01', '2027-04-01'], ['Vorlesungsbeginn SoSe 27', '2027-04-05', '2027-04-05'], ['Exkursionstage – keine regulären Veranstaltungen', '2027-05-18', '2027-05-22'], ['letzter Vorlesungstag', '2027-07-17', '2027-07-17'], ['Vorlesungsbeginn WiSe 27/28', '2027-10-11', '2027-10-11'], ['vorlesungsfrei (Weihnachten)', '2027-12-23', '2028-01-09'], ['letzter Vorlesungstag', '2028-01-29', '2028-01-29']];
const FREI: [string, string, string][] = [['vorlesungsfreie Zeit', '2026-12-21', '2027-01-03'], ['Exkursionstage', '2027-05-18', '2027-05-22'], ['vorlesungsfreie Zeit', '2027-12-23', '2028-01-09'], ['Exkursionstage', '2028-06-06', '2028-06-10']];
/** Grund, warum eine Sitzung an diesem Tag entfällt (Feiertag, vorlesungsfrei) – sonst leer */
export function entfallGrund(d: string) {
  if (FEIERTAGE[d]) return 'Feiertag (' + FEIERTAGE[d] + ')';
  return FREI.find((f) => d >= f[1] && d <= f[2])?.[0] ?? '';
}
/** Ägyptenreise 11.–20.10.: ohne Angabe gelten Sitzungen bis 21.10. als verpasst */
export const VERPASST_VON = '2026-10-12', VERPASST_BIS = '2026-10-21';

export const MODUL_NAMEN: Record<string, string> = { mab004: 'Mathematik in den digitalen Medien', mab005: 'Wahrscheinlichkeitsrechnung', pkb003: 'Systemanalyse', ewb001: 'Grundlagen und Grundbegriffe der Erziehungswissenschaften', ewb002: 'Methoden der empirischen Bildungsforschung', pyb005: 'Grundlagen der Pädagogischen Psychologie für Bildung und Erziehung' };
