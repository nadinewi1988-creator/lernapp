// Nur für den lokalen Bildvergleich mit dem Entwurf (npm run dev, Adresse mit ?demo).
// Baut den Studienstand aus den Startdaten, ohne Supabase. Im fertigen Build nicht aktiv.
import { SEMESTER, MODULE, bereichVon } from './data/studienverlauf';
import { KURSE, EXTRA_TEILMODULE, sitzungenVon, entfallGrund, VERPASST_VON, VERPASST_BIS } from './data/kalender';
import { START_EINTRAEGE, START_MARKS } from './data/kalender_start';
import type { Studienstand, KEintrag } from './db';

export const DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

export function demoStand(): Studienstand {
  const semester = SEMESTER.map((s) => ({ id: 's' + s.fachsemester, fachsemester: s.fachsemester, bezeichnung: s.bezeichnung, beginn: s.beginn, ende: s.ende, vorlesung_beginn: s.vorlesung_beginn ?? null, vorlesung_ende: s.vorlesung_ende ?? null }));
  const module = MODULE.map((m, i) => ({ id: 'm' + i, kuerzel: m.kuerzel, name: m.name, cp: m.cp, bereich: bereichVon(m.kuerzel), lehramt_hrs: !!m.lehramt_hrs, plan_semester_id: 's' + (m.verschoben_nach ?? m.sem), status: 'geplant', hinweis: m.hinweis ?? null, reihenfolge: i }));
  const pruefungen = MODULE.map((m, i) => ({ id: 'p' + i, modul_id: 'm' + i, form: m.form, semester_id: 's' + m.sem, verschoben_nach_semester_id: m.verschoben_nach ? 's' + m.verschoben_nach : null, verschoben_grund: null }));
  const termine = MODULE.flatMap((m, i) => (m.termine ?? []).map((t, j) => ({ id: 't' + i + '_' + j, pruefung_id: 'p' + i, art: t.art, datum: t.datum ?? null, zeit: t.zeit ?? null, anmeldung_ab: t.anmeldung_ab ?? null, anmeldung_bis: t.anmeldung_bis ?? null, abmeldung_bis: t.abmeldung_bis ?? null, quelle: 'studip', stand: '2026-10-24T00:00:00Z' })));
  const voraussetzungen = MODULE.flatMap((m, i) => (m.voraussetzungen ?? []).map((v, j) => ({ id: 'v' + i + '_' + j, pruefung_id: 'p' + i, text: v.text, erledigt: v.erledigt, reihenfolge: j })));
  const modId = (k: string) => module.find((m) => m.kuerzel === k.slice(0, 6))?.id ?? '';
  const teilmodule = [...KURSE.map((k, i) => ({ id: 'tm' + i, modul_id: modId(k.modul), kuerzel: k.modul, name: k.titel, art: k.art, freiwillig: false })),
    ...EXTRA_TEILMODULE.map((x, i) => ({ id: 'tx' + i, modul_id: modId(x.modul), kuerzel: x.modul, name: x.titel, art: x.art, freiwillig: true }))];
  const veranstaltungen = KURSE.map((k, i) => ({ id: 'v' + i, teilmodul_id: 'tm' + i, titel: k.titel, kurz: k.kurz, wochentag: k.wd !== undefined ? k.wd + 1 : null, von: null, bis: null, raum: k.raum ?? null, rhythmus: 'woechentlich', studip_id: k.id }));
  const sitzungen = KURSE.flatMap((k, i) => sitzungenVon(k).map((x, j) => { const m = START_MARKS[k.id + '_' + x.datum] ?? {}; const g = entfallGrund(x.datum);
    return { id: 's' + i + '_' + j, veranstaltung_id: 'v' + i, nr: j + 1, datum: x.datum, von: x.von, bis: x.bis, raum: x.raum, thema: x.thema || null, status: g ? 'entfaellt' : m.ausgefallen ? 'ausgefallen' : 'findet_statt', entfall_grund: g || null,
      anwesenheit: g || m.ausgefallen ? 'offen' : m.anwesend === true ? 'ja' : m.anwesend === false ? 'nein' : x.datum >= VERPASST_VON && x.datum <= VERPASST_BIS ? 'nein' : 'offen', nachgearbeitet: !!m.nachgearbeitet }; }));
  const tmId = (k: string) => teilmodule.find((t) => t.kuerzel === k)?.id ?? null;
  const eintraege: KEintrag[] = START_EINTRAEGE.map((e, i) => ({ id: 'e' + i, art: e.art, titel: e.titel, modul_id: e.modul ? modId(e.modul) || null : null, teilmodul_id: e.modul.includes('.') ? tmId(e.modul) : null, sitzung_id: null, datum: e.datum, zeit: e.zeit || null, ende: null, ganztaegig: false, bis_datum: null, wiederholung: null, notiz: e.notiz || null, erledigt: e.erledigt }));
  eintraege.push({ id: 'dp1', art: 'privat', titel: 'Experiment Großbritannien', modul_id: null, teilmodul_id: null, sitzung_id: null, datum: '2026-10-30', zeit: '10:00', ende: '10:45', ganztaegig: false, bis_datum: null, wiederholung: null, notiz: null, erledigt: false },
    { id: 'dp2', art: 'privat', titel: 'Zahnarzt', modul_id: null, teilmodul_id: null, sitzung_id: null, datum: '2026-10-30', zeit: '08:00', ende: '08:30', ganztaegig: false, bis_datum: null, wiederholung: null, notiz: null, erledigt: false });
  return { studiengangId: 'demo', semester, module, pruefungen, termine, versuche: demoVersuche(), voraussetzungen, einstellungen: { user_id: 'demo', bafoeg_grenze: 90 }, teilmodule, veranstaltungen, sitzungen, eintraege, lernstand: [], lernzeit: [], karten: demoKarten(module, teilmodule), wiederholung: [], antworten: [] };
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

// Beispielkarten (nur Demo), damit Üben und Statistik im Bildvergleich etwas zeigen.
function demoKarten(module: { id: string; kuerzel: string }[], tms: { id: string; kuerzel: string; modul_id: string }[]) {
  const t = (k: string) => tms.find((x) => x.kuerzel === k)!;
  const mk = (id: string, k: string, format: string, inhalt: Record<string, unknown>) => ({ id, modul_id: t(k).modul_id, teilmodul_id: t(k).id, sitzung_id: null, format, inhalt: inhalt as never, bild_pfad: null, geloescht: false, erstellt: '2026-10-20T10:00:00Z' });
  void module;
  return [
    mk('k1', 'ewb001.1', 'frage', { vorne: 'Beispielfrage: Was versteht man unter … ?', hinten: 'Beispielantwort: …' }),
    mk('k2', 'ewb001.2', 'mc', { vorne: 'Beispielfrage mit Auswahl: Welche Aussagen treffen zu? (mehrere richtig)', optionen: ['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D'], richtig: [1, 3] }),
    mk('k3', 'ewb002.1', 'luecke', { vorne: 'Beispiel: Die [[Objektivität]] ist eines der drei Gütekriterien.' }),
    mk('k4', 'pyb005.1', 'offen', { vorne: 'Beispielaufgabe: Erläutere in eigenen Worten …', hinten: 'Musterlösung: Punkt 1 … Punkt 2 … Punkt 3 …' }),
    mk('k5', 'mab005.1', 'frage', { vorne: 'Beispielfrage: Wie lautet die Definition von … ?', hinten: 'Beispielantwort: …' }),
    mk('k6', 'pkb003.1', 'frage', { vorne: 'Beispielfrage: Welche Rolle spielt … im politischen System?', hinten: 'Beispielantwort: …' }),
  ];
}
