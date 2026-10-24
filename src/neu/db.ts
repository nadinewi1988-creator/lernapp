import { supabase } from '../supabase';
import { STUDIENGANG, SEMESTER, MODULE, bereichVon } from './data/studienverlauf';
import { KURSE, EXTRA_TEILMODULE, sitzungenVon, entfallGrund, VERPASST_VON, VERPASST_BIS } from './data/kalender';
import { START_EINTRAEGE, START_MARKS } from './data/kalender_start';

export interface Semester { id: string; fachsemester: number; bezeichnung: string; beginn: string | null; ende: string | null; vorlesung_beginn: string | null; vorlesung_ende: string | null }
export interface Modul { id: string; kuerzel: string; name: string; cp: number; bereich: string; lehramt_hrs: boolean; plan_semester_id: string | null; status: string; hinweis: string | null; reihenfolge: number }
export interface Pruefung { id: string; modul_id: string; form: string; semester_id: string | null; verschoben_nach_semester_id: string | null; verschoben_grund: string | null }
export interface Termin { id: string; pruefung_id: string; art: string; datum: string | null; zeit: string | null; anmeldung_ab: string | null; anmeldung_bis: string | null; abmeldung_bis: string | null; quelle: string; stand: string }
export interface Versuch { id: string; pruefung_id: string; nr: number; note: number | null; unbenotet: boolean; datum: string | null }
export interface Voraussetzung { id: string; pruefung_id: string; text: string; erledigt: boolean; reihenfolge: number }
export interface Teilmodul { id: string; modul_id: string; kuerzel: string; name: string; art: string; freiwillig: boolean }
export interface Veranstaltung { id: string; teilmodul_id: string; titel: string; kurz: string | null; wochentag: number | null; von: string | null; bis: string | null; raum: string | null; rhythmus: string; studip_id: string | null }
export interface Sitzung { id: string; veranstaltung_id: string; nr: number | null; datum: string; von: string | null; bis: string | null; raum: string | null; thema: string | null; status: string; entfall_grund: string | null; anwesenheit: string; nachgearbeitet: boolean }
export interface KEintrag { id: string; art: string; titel: string; modul_id: string | null; teilmodul_id: string | null; sitzung_id: string | null; datum: string; zeit: string | null; ende: string | null; ganztaegig: boolean; bis_datum: string | null; wiederholung: { rhythmus: string; tage: number[]; bis?: string; ausnahmen?: string[] } | null; notiz: string | null; erledigt: boolean }
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
  teilmodule: Teilmodul[];
  veranstaltungen: Veranstaltung[];
  sitzungen: Sitzung[];
  eintraege: KEintrag[];
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
  if (vorhanden.length) { await termineNachtragen(); await kalenderEinrichten(); return; }
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
  await kalenderEinrichten();
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

/** Legt einmalig Stundenplan (Teilmodule, Veranstaltungen, Sitzungen) und die Einträge aus dem
 *  bisherigen Studienkalender an. Läuft nur, solange noch keine Veranstaltung gespeichert ist. */
async function kalenderEinrichten(): Promise<void> {
  // Jeder Schritt nur, solange seine Tabelle leer ist – so kann ein abgebrochener Durchlauf beim nächsten Öffnen weitermachen.
  const leer = async (t: string) => (pruef(await supabase.from(t).select('id').limit(1)) as { id: string }[]).length === 0;
  const [vLeer, sLeer, eLeer] = [await leer('veranstaltungen'), await leer('sitzungen'), await leer('eintraege')];
  if (!vLeer && !sLeer && !eLeer) return;
  const mods = pruef(await supabase.from('module').select('id, kuerzel')) as { id: string; kuerzel: string }[];
  const modId = (k: string) => mods.find((m) => m.kuerzel === k.slice(0, 6))?.id;
  const tmRoh = [
    ...KURSE.map((k) => ({ modul_id: modId(k.modul)!, kuerzel: k.modul, name: k.titel.replace(/ \((Gruppe|Gr\.) [^)]*\)$/, ''), art: k.art, freiwillig: false })),
    ...EXTRA_TEILMODULE.map((x) => ({ modul_id: modId(x.modul)!, kuerzel: x.modul, name: x.titel, art: x.art, freiwillig: true })),
  ].filter((t) => t.modul_id);
  const tms = pruef(await supabase.from('teilmodule').upsert(tmRoh, { onConflict: 'modul_id,kuerzel,art' }).select('id, kuerzel, art')) as { id: string; kuerzel: string; art: string }[];
  const tmId = (kuerzel: string, art?: string) => tms.find((t) => t.kuerzel === kuerzel && (!art || t.art === art))?.id ?? null;
  if (vLeer) pruef(await supabase.from('veranstaltungen').insert(KURSE.filter((k) => tmId(k.modul, k.art)).map((k) => ({
    teilmodul_id: tmId(k.modul, k.art), titel: k.titel, kurz: k.kurz, wochentag: k.wd !== undefined ? k.wd + 1 : null,
    von: sitzungenVon(k)[0]?.von ?? null, bis: sitzungenVon(k)[0]?.bis ?? null, raum: k.raum ?? null,
    rhythmus: k.wd !== undefined ? 'woechentlich' : 'einzeltermine', akad_viertel: !k.exakt, studip_id: k.id,
  }))));
  const vs = pruef(await supabase.from('veranstaltungen').select('id, studip_id')) as { id: string; studip_id: string }[];
  const sitz = KURSE.flatMap((k) => {
    const v = vs.find((x) => x.studip_id === k.id); if (!v) return [];
    return sitzungenVon(k).map((s, i) => {
      const m = START_MARKS[k.id + '_' + s.datum] ?? {};
      const grund = entfallGrund(s.datum);
      const anw = m.anwesend === true ? 'ja' : m.anwesend === false ? 'nein' : s.datum >= VERPASST_VON && s.datum <= VERPASST_BIS ? 'nein' : 'offen';
      return { veranstaltung_id: v.id, nr: i + 1, datum: s.datum, von: s.von, bis: s.bis, raum: s.raum, thema: s.thema || null,
        status: grund ? 'entfaellt' : m.ausgefallen ? 'ausgefallen' : 'findet_statt', entfall_grund: grund || null,
        anwesenheit: grund || m.ausgefallen ? 'offen' : anw, nachgearbeitet: !!m.nachgearbeitet };
    });
  });
  if (sLeer && sitz.length) pruef(await supabase.from('sitzungen').insert(sitz));
  const ein = START_EINTRAEGE.map((e) => ({ art: e.art, titel: e.titel, modul_id: e.modul ? modId(e.modul) ?? null : null, teilmodul_id: e.modul.includes('.') ? tmId(e.modul) : null,
    datum: e.datum, zeit: e.zeit || null, notiz: e.notiz || null, erledigt: e.erledigt, erledigt_am: e.erledigt ? new Date().toISOString() : null }));
  if (eLeer && ein.length) pruef(await supabase.from('eintraege').insert(ein));
}

export async function ladeStudienstand(): Promise<Studienstand> {
  const [sg, sem, mod, pr, te, ve, vo, ei, tm, va, si, en] = await Promise.all([
    supabase.from('studiengaenge').select('id').eq('aktiv', true).order('erstellt').limit(1),
    supabase.from('semester').select('*').order('fachsemester'),
    supabase.from('module').select('*').order('reihenfolge'),
    supabase.from('pruefungen').select('*'),
    supabase.from('pruefungstermine').select('*'),
    supabase.from('versuche').select('*').order('nr'),
    supabase.from('voraussetzungen').select('*').order('reihenfolge'),
    supabase.from('einstellungen').select('*').maybeSingle(),
    supabase.from('teilmodule').select('*'),
    supabase.from('veranstaltungen').select('*'),
    supabase.from('sitzungen').select('*').order('datum').range(0, 4999),
    supabase.from('eintraege').select('*').order('datum').range(0, 4999),
  ]);
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : t);
  return {
    studiengangId: (pruef(sg) as { id: string }[])[0]?.id ?? '',
    semester: pruef(sem) as Semester[],
    module: pruef(mod) as Modul[],
    pruefungen: pruef(pr) as Pruefung[],
    termine: pruef(te) as Termin[],
    versuche: pruef(ve) as Versuch[],
    voraussetzungen: pruef(vo) as Voraussetzung[],
    einstellungen: (ei.data as Einstellungen | null) ?? null,
    teilmodule: pruef(tm) as Teilmodul[],
    veranstaltungen: (pruef(va) as Veranstaltung[]).map((v) => ({ ...v, von: hhmm(v.von), bis: hhmm(v.bis) })),
    sitzungen: (pruef(si) as Sitzung[]).map((x) => ({ ...x, von: hhmm(x.von), bis: hhmm(x.bis) })),
    eintraege: (pruef(en) as KEintrag[]).map((x) => ({ ...x, zeit: hhmm(x.zeit), ende: hhmm(x.ende) })),
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

// ---------- Kalender ----------
export async function aendereSitzung(id: string, patch: Partial<Pick<Sitzung, 'anwesenheit' | 'nachgearbeitet' | 'status' | 'thema'>>) {
  const extra: Record<string, unknown> = { geaendert: new Date().toISOString(), von_nadine_geaendert: true };
  if (patch.nachgearbeitet !== undefined) extra.nachgearbeitet_am = patch.nachgearbeitet ? new Date().toISOString() : null;
  pruef(await supabase.from('sitzungen').update({ ...patch, ...extra }).eq('id', id));
}
export async function speichereEintrag(e: Partial<KEintrag> & { art: string; titel: string; datum: string }) {
  const daten = { ...e, erledigt_am: e.erledigt ? new Date().toISOString() : null };
  if (e.id) pruef(await supabase.from('eintraege').update(daten).eq('id', e.id));
  else { const { id: _weg, ...rest } = daten; void _weg; pruef(await supabase.from('eintraege').insert(rest)); }
}
export async function loescheEintrag(id: string) {
  pruef(await supabase.from('eintraege').delete().eq('id', id));
}
