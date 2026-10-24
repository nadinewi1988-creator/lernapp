import type { Studienstand, Modul, Pruefung, Termin, Versuch, Semester } from './db';

export const heuteIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export function tageBis(iso: string) { return Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(heuteIso() + 'T12:00:00').getTime()) / 864e5); }
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const datumLang = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
export const datumKurz = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.';
export const mitTag = (iso: string) => WT[new Date(iso + 'T12:00:00').getDay()] + ' ' + datumLang(iso);
export const noteText = (n: number) => n.toFixed(1).replace('.', ',');

export type Status = 'Bestanden' | 'Geplant' | 'Verschoben' | 'Ergebnis offen' | 'Nicht bestanden' | 'Endgültig nicht bestanden';
export const STATUS_FARBE: Record<Status, [string, string]> = {
  'Bestanden': ['#e3f2e8', '#2f7a4b'], 'Geplant': ['#eef0f3', '#4b5563'], 'Verschoben': ['#fdf1e2', '#9a5b14'],
  'Ergebnis offen': ['#f1edfa', '#6a58a0'], 'Nicht bestanden': ['#fde9e9', '#c42b2b'], 'Endgültig nicht bestanden': ['#fde9e9', '#c42b2b'],
};

export const BEREICH_ZIEL: Record<string, number> = { Mathe: 60, Politik: 60, Profil: 35, Praktika: 15, 'BA-Arbeit': 10 };
const RANG = (k: string) => (k.startsWith('mab') ? 0 : k.startsWith('pkb') ? 1 : 2);
export const nachFach = (a: { kuerzel: string }, b: { kuerzel: string }) => RANG(a.kuerzel) - RANG(b.kuerzel) || a.kuerzel.localeCompare(b.kuerzel);

export interface Eintrag {
  modul: Modul; pruefung: Pruefung; termine: Termin[]; versuche: Versuch[];
  status: Status; bestanden: boolean; note: number | null; unbenotet: boolean;
  naechster: { termin: Termin | null; versuch: number; offen: boolean } | null;
  imUrsprung: boolean; // Anzeige im ursprünglichen Semester einer verschobenen Prüfung
}

export function aktuellesSemester(sem: Semester[]): Semester | undefined {
  const h = heuteIso();
  return sem.find((s) => s.beginn && s.ende && s.beginn <= h && h <= s.ende) ?? sem.find((s) => s.beginn && s.beginn > h) ?? sem[sem.length - 1];
}

export function auswerten(st: Studienstand) {
  const h = heuteIso();
  const akt = aktuellesSemester(st.semester);
  const semNr = (id: string | null) => st.semester.find((s) => s.id === id)?.fachsemester ?? 0;
  const eintraege: Eintrag[] = st.pruefungen.map((p) => {
    const modul = st.module.find((m) => m.id === p.modul_id)!;
    const termine = st.termine.filter((t) => t.pruefung_id === p.id).sort((a, b) => (a.art === 'Zweittermin' ? 1 : 0) - (b.art === 'Zweittermin' ? 1 : 0) || (a.datum ?? '').localeCompare(b.datum ?? ''));
    const versuche = st.versuche.filter((v) => v.pruefung_id === p.id).sort((a, b) => a.nr - b.nr);
    const best = versuche.find((v) => v.unbenotet || (v.note !== null && v.note <= 4));
    const fehl = versuche.filter((v) => !v.unbenotet && v.note !== null && v.note > 4);
    let status: Status;
    if (best) status = 'Bestanden';
    else if (fehl.length >= 3) status = 'Endgültig nicht bestanden';
    else if (fehl.length) status = 'Nicht bestanden';
    else {
      const ziel = semNr(p.verschoben_nach_semester_id ?? p.semester_id);
      status = ziel < (akt?.fachsemester ?? 0) ? 'Ergebnis offen' : 'Geplant';
    }
    let naechster: Eintrag['naechster'] = null;
    if (!best && fehl.length < 3) {
      const nach = fehl.length ? (fehl[fehl.length - 1].datum ?? h) : '';
      const kand = termine.filter((t) => t.datum && t.datum >= h && (!nach || t.datum > nach)).sort((a, b) => a.datum!.localeCompare(b.datum!));
      naechster = { termin: kand[0] ?? null, versuch: fehl.length + 1, offen: !kand[0] };
    }
    return { modul, pruefung: p, termine, versuche, status, bestanden: !!best, note: best && !best.unbenotet ? best.note : null, unbenotet: !!best?.unbenotet, naechster, imUrsprung: false };
  });

  // Semesterlisten: verschobene Prüfungen erscheinen im Ursprung als „Verschoben“ und im Ziel regulär.
  const proSemester = st.semester.map((s) => {
    const liste: Eintrag[] = [];
    for (const e of eintraege) {
      const ursprung = e.pruefung.semester_id, ziel = e.pruefung.verschoben_nach_semester_id;
      if (ziel && ursprung === s.id && ziel !== s.id) liste.push({ ...e, imUrsprung: true, status: e.bestanden ? 'Bestanden' : 'Verschoben' });
      else if ((ziel ?? ursprung) === s.id) liste.push(e);
    }
    liste.sort((a, b) => nachFach(a.modul, b.modul));
    const cpSoll = liste.reduce((x, e) => x + e.modul.cp, 0);
    const cpIst = liste.filter((e) => e.bestanden && !e.imUrsprung).reduce((x, e) => x + e.modul.cp, 0);
    return { semester: s, liste, cpSoll, cpIst, aktuell: s.id === akt?.id };
  });

  // CP & Noten
  const bestanden = eintraege.filter((e) => e.bestanden);
  const cpBereich: Record<string, number> = { Mathe: 0, Politik: 0, Profil: 0, Praktika: 0, 'BA-Arbeit': 0 };
  bestanden.forEach((e) => { cpBereich[e.modul.bereich] = (cpBereich[e.modul.bereich] ?? 0) + e.modul.cp; });
  const cpGesamt = Object.values(cpBereich).reduce((a, b) => a + b, 0);
  const abschneiden = (x: number) => Math.floor(x * 10 + 1e-9) / 10;
  function schnitt(filter: (e: Eintrag) => boolean, gewicht: (e: Eintrag) => number = (e) => e.modul.cp) {
    const l = bestanden.filter((e) => e.note !== null && filter(e));
    const g = l.reduce((a, e) => a + gewicht(e), 0);
    return g ? abschneiden(l.reduce((a, e) => a + (e.note as number) * gewicht(e), 0) / g) : null;
  }
  const noten = {
    gesamt: schnitt(() => true, (e) => (e.modul.kuerzel === 'asp001' ? 6 : e.modul.kuerzel.startsWith('btb') ? e.modul.cp * 1.5 : e.modul.cp)),
    mathe: schnitt((e) => e.modul.bereich === 'Mathe'),
    politik: schnitt((e) => e.modul.bereich === 'Politik'),
    profil: schnitt((e) => e.modul.bereich === 'Profil'),
  };

  // Dieses Semester
  const aktListe = proSemester.find((x) => x.aktuell)?.liste.filter((e) => !e.imUrsprung) ?? [];
  const naechsteTermine = aktListe.map((e) => e.naechster?.termin?.datum).filter(Boolean).sort() as string[];
  const verschoben = eintraege.filter((e) => e.pruefung.verschoben_nach_semester_id && !e.bestanden);

  // Fristen (nächste 14 Tage bzw. laufende Anmeldung)
  const fristen: { tage: number; kuerzel: string; text: string }[] = [];
  aktListe.forEach((e) => {
    if (e.bestanden) return;
    e.termine.forEach((t) => {
      const fh = fristHinweis(t);
      if (fh && fh.liste) fristen.push({ tage: fh.tage, kuerzel: e.modul.kuerzel, text: fh.liste });
    });
  });
  fristen.sort((a, b) => a.tage - b.tage);

  // BAföG: erreicht vs. bis Ende 4. Semester möglich
  const bis4 = eintraege.filter((e) => !e.bestanden && semNr(e.pruefung.verschoben_nach_semester_id ?? e.pruefung.semester_id) <= 4 && e.status !== 'Endgültig nicht bestanden');
  const bafoegMoeglich = cpGesamt + bis4.reduce((a, e) => a + e.modul.cp, 0);

  return { akt, eintraege, proSemester, cpBereich, cpGesamt, noten, aktListe, naechsteTermine, verschoben, bestanden, fristen, bafoegMoeglich };
}

export function fristHinweis(t: Termin): { text: string; bg: string; fg: string; tage: number; liste?: string } | null {
  const k = (iso: string) => datumKurz(iso);
  if (t.anmeldung_ab && tageBis(t.anmeldung_ab) > 0) {
    const n = tageBis(t.anmeldung_ab);
    return { text: 'Anmeldung öffnet in ' + n + (n === 1 ? ' Tag' : ' Tagen'), bg: '#eef0f3', fg: '#4b5563', tage: n, liste: n <= 14 ? 'Anmeldung öffnet am ' + k(t.anmeldung_ab) + ' (' + t.art + ')' : undefined };
  }
  if (t.anmeldung_bis && tageBis(t.anmeldung_bis) >= 0) {
    const r = tageBis(t.anmeldung_bis);
    return { text: 'Anmeldung offen · noch ' + r + (r === 1 ? ' Tag' : ' Tage'), bg: r <= 3 ? '#fde9e9' : '#e3f2e8', fg: r <= 3 ? '#c42b2b' : '#2f7a4b', tage: r, liste: 'Anmeldung offen bis ' + k(t.anmeldung_bis) + ' (' + t.art + ')' };
  }
  if (t.abmeldung_bis && tageBis(t.abmeldung_bis) >= 0 && tageBis(t.abmeldung_bis) <= 14) {
    const a = tageBis(t.abmeldung_bis);
    return { text: 'Abmeldung noch ' + a + (a === 1 ? ' Tag' : ' Tage'), bg: '#fdf1e2', fg: '#9a5b14', tage: a, liste: 'Abmeldung bis ' + k(t.abmeldung_bis) };
  }
  return null;
}
