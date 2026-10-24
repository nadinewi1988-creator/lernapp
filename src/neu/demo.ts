// Nur für den lokalen Bildvergleich mit dem Entwurf (npm run dev, Adresse mit ?demo).
// Baut den Studienstand aus den Startdaten, ohne Supabase. Im fertigen Build nicht aktiv.
import { SEMESTER, MODULE, bereichVon } from './data/studienverlauf';
import type { Studienstand } from './db';

export const DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

export function demoStand(): Studienstand {
  const semester = SEMESTER.map((s) => ({ id: 's' + s.fachsemester, fachsemester: s.fachsemester, bezeichnung: s.bezeichnung, beginn: s.beginn, ende: s.ende, vorlesung_beginn: s.vorlesung_beginn ?? null, vorlesung_ende: s.vorlesung_ende ?? null }));
  const module = MODULE.map((m, i) => ({ id: 'm' + i, kuerzel: m.kuerzel, name: m.name, cp: m.cp, bereich: bereichVon(m.kuerzel), lehramt_hrs: !!m.lehramt_hrs, plan_semester_id: 's' + (m.verschoben_nach ?? m.sem), status: 'geplant', hinweis: m.hinweis ?? null, reihenfolge: i }));
  const pruefungen = MODULE.map((m, i) => ({ id: 'p' + i, modul_id: 'm' + i, form: m.form, semester_id: 's' + m.sem, verschoben_nach_semester_id: m.verschoben_nach ? 's' + m.verschoben_nach : null, verschoben_grund: null }));
  const termine = MODULE.flatMap((m, i) => (m.termine ?? []).map((t, j) => ({ id: 't' + i + '_' + j, pruefung_id: 'p' + i, art: t.art, datum: t.datum ?? null, zeit: t.zeit ?? null, anmeldung_ab: t.anmeldung_ab ?? null, anmeldung_bis: t.anmeldung_bis ?? null, abmeldung_bis: t.abmeldung_bis ?? null, quelle: 'studip', stand: '2026-10-24T00:00:00Z' })));
  const voraussetzungen = MODULE.flatMap((m, i) => (m.voraussetzungen ?? []).map((v, j) => ({ id: 'v' + i + '_' + j, pruefung_id: 'p' + i, text: v.text, erledigt: v.erledigt, reihenfolge: j })));
  return { studiengangId: 'demo', semester, module, pruefungen, termine, versuche: demoVersuche(), voraussetzungen, einstellungen: { user_id: 'demo', bafoeg_grenze: 90 } };
}

// Beispielnoten nur für den Bildvergleich (wie auf Nadines Bildschirmfoto), nicht ihre echten Daten.
function demoVersuche() {
  const id = (k: string) => 'p' + MODULE.findIndex((m) => m.kuerzel === k);
  return [
    { id: 'x1', pruefung_id: id('mab001'), nr: 1, note: 5, unbenotet: false, datum: '2026-02-09' },
    { id: 'x2', pruefung_id: id('mab001'), nr: 2, note: 2.3, unbenotet: false, datum: '2026-03-16' },
    { id: 'x3', pruefung_id: id('pkb001'), nr: 1, note: 2.3, unbenotet: false, datum: '2026-02-06' },
    { id: 'x4', pruefung_id: id('opb001'), nr: 1, note: null, unbenotet: true, datum: '2026-04-06' },
  ];
}
