import { supabase } from '../supabase';
import { STUDIENGANG, SEMESTER, MODULE, bereichVon } from './data/studienverlauf';

export interface Semester { id: string; fachsemester: number; bezeichnung: string; beginn: string | null; ende: string | null; vorlesung_beginn: string | null; vorlesung_ende: string | null }
export interface Modul { id: string; kuerzel: string; name: string; cp: number; bereich: string; lehramt_hrs: boolean; plan_semester_id: string | null; status: string; hinweis: string | null; reihenfolge: number }
export interface Pruefung { id: string; modul_id: string; form: string; semester_id: string | null; verschoben_nach_semester_id: string | null; verschoben_grund: string | null }
export interface Termin { id: string; pruefung_id: string; art: string; datum: string | null; zeit: string | null; anmeldung_ab: string | null; anmeldung_bis: string | null; abmeldung_bis: string | null; quelle: string; stand: string }
export interface Versuch { id: string; pruefung_id: string; nr: number; note: number | null; unbenotet: boolean; datum: string | null }
export interface Voraussetzung { id: string; pruefung_id: string; text: string; erledigt: boolean; reihenfolge: number }
export interface Einstellungen { user_id: string; bafoeg_grenze: number }

export interface Studienstand {
  studiengangId: string;
  semester: Semester[];
  module: Modul[];
  pruefungen: Pruefung[];
  termine: Termin[];
  versuche: Versuch[];
  voraussetzungen: Voraussetzung[];
  einstellungen: Einstellungen | null;
}

function pruef<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

let laeuft: Promise<void> | null = null;
/** Legt beim allerersten Start den Studienverlauf an (nur wenn noch nichts da ist).
 *  Läuft pro Seitenaufruf nur einmal, auch wenn die Anmeldung mehrfach gemeldet wird. */
export function ersteinrichtung(): Promise<void> {
  if (!laeuft) laeuft = einrichten().catch((e) => { laeuft = null; throw e; });
  return laeuft;
}
async function einrichten(): Promise<void> {
  const vorhanden = pruef(await supabase.from('studiengaenge').select('id, erstellt').order('erstellt')) as { id: string }[];
  if (vorhanden.length > 1) {
    // Doppelte Ersteinrichtung (Fehler vom 24.10.2026) bereinigen: den ältesten Studiengang behalten,
    // die versehentlich doppelt angelegten (samt Semestern, Modulen, Prüfungen) entfernen.
    for (const x of vorhanden.slice(1)) pruef(await supabase.from('studiengaenge').delete().eq('id', x.id));
  }
  if (vorhanden.length) { await termineNachtragen(); return; }
  const sg = pruef(await supabase.from('studiengaenge').insert(STUDIENGANG).select('id').single()) as { id: string };
  const sems = pruef(await supabase.from('semester').insert(SEMESTER.map((s) => ({ ...s, studiengang_id: sg.id }))).select('id, fachsemester')) as { id: string; fachsemester: number }[];
  const semId = (n: number) => sems.find((s) => s.fachsemester === n)?.id ?? null;
  const mods = pruef(await supabase.from('module').insert(MODULE.map((m, i) => ({
    studiengang_id: sg.id, kuerzel: m.kuerzel, name: m.name, cp: m.cp, bereich: bereichVon(m.kuerzel), lehramt_hrs: !!m.lehramt_hrs,
    plan_semester_id: semId(m.verschoben_nach ?? m.sem), status: m.sem < 3 && !m.verschoben_nach ? 'offen' : m.sem === 3 || m.verschoben_nach === 3 ? 'laeuft' : 'geplant',
    hinweis: m.hinweis ?? null, reihenfolge: i,
  }))).select('id, kuerzel')) as { id: string; kuerzel: string }[];
  const modId = (k: string) => mods.find((x) => x.kuerzel === k)!.id;
  const prs = pruef(await supabase.from('pruefungen').insert(MODULE.map((m) => ({
    modul_id: modId(m.kuerzel), form: m.form, semester_id: semId(m.sem), verschoben_nach_semester_id: m.verschoben_nach ? semId(m.verschoben_nach) : null,
  }))).select('id, modul_id')) as { id: string; modul_id: string }[];
  const prId = (k: string) => prs.find((p) => p.modul_id === modId(k))!.id;
  const termine = MODULE.flatMap((m) => (m.termine ?? []).map((t) => ({
    pruefung_id: prId(m.kuerzel), art: t.art, datum: t.datum ?? null, zeit: t.zeit ?? null,
    anmeldung_ab: t.anmeldung_ab ?? null, anmeldung_bis: t.anmeldung_bis ?? null, abmeldung_bis: t.abmeldung_bis ?? null, quelle: 'studip',
  })));
  if (termine.length) pruef(await supabase.from('pruefungstermine').insert(termine));
  const vor = MODULE.flatMap((m) => (m.voraussetzungen ?? []).map((v, i) => ({ pruefung_id: prId(m.kuerzel), text: v.text, erledigt: v.erledigt, reihenfolge: i })));
  if (vor.length) pruef(await supabase.from('voraussetzungen').insert(vor));
  pruef(await supabase.from('einstellungen').upsert({ bafoeg_grenze: 90 }));
}

/** Ergänzt Prüfungstermine aus den Startdaten, die bei der Ersteinrichtung noch fehlten
 *  (z. B. bereits geschriebene Klausuren). Vorhandene oder von Nadine geänderte Termine bleiben unberührt. */
async function termineNachtragen(): Promise<void> {
  const mods = pruef(await supabase.from('module').select('id, kuerzel')) as { id: string; kuerzel: string }[];
  const prs = pruef(await supabase.from('pruefungen').select('id, modul_id')) as { id: string; modul_id: string }[];
  const tes = pruef(await supabase.from('pruefungstermine').select('pruefung_id, art')) as { pruefung_id: string; art: string }[];
  const neu = MODULE.flatMap((m) => {
    const mod = mods.find((x) => x.kuerzel === m.kuerzel); const pr = mod && prs.find((x) => x.modul_id === mod.id);
    if (!pr) return [];
    return (m.termine ?? []).filter((t) => !tes.some((x) => x.pruefung_id === pr.id && x.art === t.art)).map((t) => ({
      pruefung_id: pr.id, art: t.art, datum: t.datum ?? null, zeit: t.zeit ?? null, anmeldung_ab: t.anmeldung_ab ?? null, anmeldung_bis: t.anmeldung_bis ?? null, abmeldung_bis: t.abmeldung_bis ?? null, quelle: 'studip',
    }));
  });
  if (neu.length) pruef(await supabase.from('pruefungstermine').insert(neu));
}

export async function ladeStudienstand(): Promise<Studienstand> {
  const [sg, sem, mod, pr, te, ve, vo, ei] = await Promise.all([
    supabase.from('studiengaenge').select('id').eq('aktiv', true).order('erstellt').limit(1),
    supabase.from('semester').select('*').order('fachsemester'),
    supabase.from('module').select('*').order('reihenfolge'),
    supabase.from('pruefungen').select('*'),
    supabase.from('pruefungstermine').select('*'),
    supabase.from('versuche').select('*').order('nr'),
    supabase.from('voraussetzungen').select('*').order('reihenfolge'),
    supabase.from('einstellungen').select('*').maybeSingle(),
  ]);
  return {
    studiengangId: (pruef(sg) as { id: string }[])[0]?.id ?? '',
    semester: pruef(sem) as Semester[],
    module: pruef(mod) as Modul[],
    pruefungen: pruef(pr) as Pruefung[],
    termine: pruef(te) as Termin[],
    versuche: pruef(ve) as Versuch[],
    voraussetzungen: pruef(vo) as Voraussetzung[],
    einstellungen: (ei.data as Einstellungen | null) ?? null,
  };
}

export async function speichereVersuch(v: { pruefung_id: string; nr: number; note: number | null; unbenotet: boolean; datum: string | null }) {
  pruef(await supabase.from('versuche').upsert(v, { onConflict: 'pruefung_id,nr' }));
}
export async function entferneVersuch(id: string) {
  pruef(await supabase.from('versuche').delete().eq('id', id));
}
export async function speichereTermin(t: Partial<Termin> & { pruefung_id: string; art: string }) {
  const daten = { ...t, quelle: 'nadine', stand: new Date().toISOString() };
  if (t.id) pruef(await supabase.from('pruefungstermine').update(daten).eq('id', t.id));
  else pruef(await supabase.from('pruefungstermine').insert(daten));
}
export async function setzeVoraussetzung(id: string, erledigt: boolean) {
  pruef(await supabase.from('voraussetzungen').update({ erledigt }).eq('id', id));
}
export async function verschiebePruefung(pruefungId: string, modulId: string, zielSemesterId: string, grund: string) {
  pruef(await supabase.from('pruefungen').update({ verschoben_nach_semester_id: zielSemesterId, verschoben_grund: grund || null }).eq('id', pruefungId));
  pruef(await supabase.from('module').update({ plan_semester_id: zielSemesterId, status: 'verschoben' }).eq('id', modulId));
}
export async function neuePruefung(sgId: string, x: { kuerzel: string; name: string; cp: number; form: string; semester_id: string; datum: string | null }) {
  const m = pruef(await supabase.from('module').insert({ studiengang_id: sgId, kuerzel: x.kuerzel, name: x.name, cp: x.cp, bereich: bereichVon(x.kuerzel), plan_semester_id: x.semester_id, status: 'geplant', reihenfolge: 999 }).select('id').single()) as { id: string };
  const p = pruef(await supabase.from('pruefungen').insert({ modul_id: m.id, form: x.form || 'offen', semester_id: x.semester_id }).select('id').single()) as { id: string };
  if (x.datum) pruef(await supabase.from('pruefungstermine').insert({ pruefung_id: p.id, art: 'Ersttermin', datum: x.datum, quelle: 'nadine' }));
}
export async function setzeBafoegGrenze(grenze: number) {
  pruef(await supabase.from('einstellungen').upsert({ bafoeg_grenze: grenze, geaendert: new Date().toISOString() }));
}
