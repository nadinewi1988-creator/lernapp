import { sicherungHerunterladen, sicherungAutomatisch } from './sicherung';
/**
 * Schnittstelle für den Stud.IP-Wochencheck (geplante Aufgabe mit Claude in Chrome).
 * Der Wochencheck öffnet die Lernapp im angemeldeten Chrome und ruft diese Funktionen
 * über die Browser-Konsole auf: window.lernapp.ueberblick(), .sitzungAendern(), …
 * Es wird nur mit Nadines eigener Anmeldung geschrieben; nichts wird gelöscht.
 */
import { supabase } from '../supabase';
import { ladeStudienstand } from './db';

const jetzt = () => new Date().toISOString();
const hhmm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : null);
function pruef<T>(r: { data: T; error: { message: string } | null }): T { if (r.error) throw new Error(r.error.message); return r.data; }

async function teilId(kuerzel: string) {
  const r = pruef(await supabase.from('teilmodule').select('id, modul_id, kuerzel').eq('kuerzel', kuerzel)) as { id: string; modul_id: string }[];
  if (!r.length) throw new Error('Teilmodul ' + kuerzel + ' gibt es nicht');
  return r[0];
}

export function wochencheckBereitstellen(nachAenderung: () => void) {
  const api = {
    version: 1,
    hilfe: 'ueberblick() · sitzungAendern(id, {datum, von, bis, raum, status, entfall_grund, thema, material}) · sicherung() · sitzungNeu({veranstaltung_id, datum, von, bis, raum, thema}) · veranstaltungNeu({teil, titel, kurz, wochentag, von, bis, raum}) · eintrag({id?, art, titel, datum, zeit?, teil?, notiz?, erledigt?}) · pruefungstermin({modul, art, datum?, zeit?, anmeldung_ab?, anmeldung_bis?, abmeldung_bis?}) · gesehen() · gesehenErgaenzen([...])',
    /** Alles, was der Abgleich braucht – kompakt. */
    /** Sicherung als Datei herunterladen (Sonntags-Wochencheck) und zusätzlich in Supabase Storage ablegen */
    async sicherung() { const d = await sicherungHerunterladen(); const s2 = await sicherungAutomatisch(true); return { datei: d, storage: s2 }; },
    async ueberblick() {
      const st = await ladeStudienstand();
      const tm = Object.fromEntries(st.teilmodule.map((t) => [t.id, t.kuerzel]));
      const md = Object.fromEntries(st.module.map((m) => [m.id, m.kuerzel]));
      const va = Object.fromEntries(st.veranstaltungen.map((v) => [v.id, v]));
      return {
        heute: new Date().toISOString().slice(0, 10),
        veranstaltungen: st.veranstaltungen.map((v) => ({ id: v.id, teil: tm[v.teilmodul_id], titel: v.titel, kurz: v.kurz, wochentag: v.wochentag, von: v.von, bis: v.bis, raum: v.raum, rhythmus: v.rhythmus })),
        sitzungen: st.sitzungen.map((s) => ({ id: s.id, veranstaltung_id: s.veranstaltung_id, teil: tm[va[s.veranstaltung_id]?.teilmodul_id], kurz: va[s.veranstaltung_id]?.kurz, datum: s.datum, von: s.von, bis: s.bis, raum: s.raum, status: s.status, thema: s.thema, anwesenheit: s.anwesenheit, material: s.material ?? null })),
        eintraege: st.eintraege.filter((e) => e.art !== 'privat').map((e) => ({ id: e.id, art: e.art, titel: e.titel, datum: e.datum, zeit: e.zeit, teil: (e.teilmodul_id && tm[e.teilmodul_id]) || (e.modul_id && md[e.modul_id]) || null, notiz: e.notiz, erledigt: e.erledigt })),
        pruefungstermine: st.termine.map((t) => { const p = st.pruefungen.find((x) => x.id === t.pruefung_id); return { id: t.id, modul: p ? md[p.modul_id] : null, art: t.art, datum: t.datum, zeit: hhmm(t.zeit), anmeldung_ab: t.anmeldung_ab, anmeldung_bis: t.anmeldung_bis, abmeldung_bis: t.abmeldung_bis, quelle: t.quelle }; }),
      };
    },
    async sitzungAendern(id: string, patch: { datum?: string; von?: string; bis?: string; raum?: string; status?: 'findet_statt' | 'ausgefallen' | 'entfaellt'; entfall_grund?: string | null; thema?: string; material?: boolean | null }) {
      const erlaubt = ['datum', 'von', 'bis', 'raum', 'status', 'entfall_grund', 'thema', 'material'];
      const daten = Object.fromEntries(Object.entries(patch).filter(([k]) => erlaubt.includes(k)));
      pruef(await supabase.from('sitzungen').update({ ...daten, geaendert: jetzt() }).eq('id', id));
      nachAenderung(); return 'ok';
    },
    async sitzungNeu(s: { veranstaltung_id: string; datum: string; von?: string; bis?: string; raum?: string; thema?: string }) {
      const r = pruef(await supabase.from('sitzungen').insert({ veranstaltung_id: s.veranstaltung_id, datum: s.datum, von: s.von ?? null, bis: s.bis ?? null, raum: s.raum ?? null, thema: s.thema ?? null, quelle: 'studip' }).select('id').single()) as { id: string };
      nachAenderung(); return r.id;
    },
    async veranstaltungNeu(v: { teil: string; titel: string; kurz?: string; wochentag?: number; von?: string; bis?: string; raum?: string; rhythmus?: string }) {
      const t = await teilId(v.teil);
      const r = pruef(await supabase.from('veranstaltungen').insert({ teilmodul_id: t.id, titel: v.titel, kurz: v.kurz ?? null, wochentag: v.wochentag ?? null, von: v.von ?? null, bis: v.bis ?? null, raum: v.raum ?? null, rhythmus: v.rhythmus ?? 'einzeltermine' }).select('id').single()) as { id: string };
      nachAenderung(); return r.id;
    },
    /** Neuer Eintrag (ohne id) oder Änderung (mit id). art: hausaufgabe | todo | frist | termin */
    async eintrag(e: { id?: string; art: string; titel: string; datum: string; zeit?: string | null; teil?: string | null; notiz?: string | null; erledigt?: boolean }) {
      if (!['hausaufgabe', 'todo', 'frist', 'termin'].includes(e.art)) throw new Error('art muss hausaufgabe, todo, frist oder termin sein (Prüfungen über pruefungstermin)');
      const t = e.teil ? await teilId(e.teil) : null;
      const daten: Record<string, unknown> = { art: e.art, titel: e.titel, datum: e.datum, zeit: e.zeit || null, notiz: e.notiz ?? null, teilmodul_id: t?.id ?? null, modul_id: t?.modul_id ?? null };
      if (e.erledigt !== undefined) { daten.erledigt = e.erledigt; daten.erledigt_am = e.erledigt ? jetzt() : null; }
      let id = e.id;
      if (id) pruef(await supabase.from('eintraege').update(daten).eq('id', id));
      else id = (pruef(await supabase.from('eintraege').insert(daten).select('id').single()) as { id: string }).id;
      nachAenderung(); return id;
    },
    /** Prüfungstermin anlegen/aktualisieren (art: Ersttermin | Zweittermin). Quelle wird „studip“. */
    async pruefungstermin(x: { modul: string; art: string; datum?: string | null; zeit?: string | null; anmeldung_ab?: string | null; anmeldung_bis?: string | null; abmeldung_bis?: string | null }) {
      const m = pruef(await supabase.from('module').select('id').eq('kuerzel', x.modul)) as { id: string }[];
      if (!m.length) throw new Error('Modul ' + x.modul + ' gibt es nicht');
      const p = pruef(await supabase.from('pruefungen').select('id').eq('modul_id', m[0].id)) as { id: string }[];
      if (!p.length) throw new Error('Zu ' + x.modul + ' gibt es keine Prüfung');
      const { modul: _m, ...rest } = x; void _m;
      const daten = { ...rest, quelle: 'studip', stand: jetzt() };
      const vorh = pruef(await supabase.from('pruefungstermine').select('id').eq('pruefung_id', p[0].id).eq('art', x.art)) as { id: string }[];
      if (vorh.length) pruef(await supabase.from('pruefungstermine').update(daten).eq('id', vorh[0].id));
      else pruef(await supabase.from('pruefungstermine').insert({ pruefung_id: p[0].id, ...daten }));
      nachAenderung(); return 'ok';
    },
    /** Schon bearbeitete Stud.IP-Ankündigungen („modul|datum|titel“). */
    async gesehen(): Promise<string[]> {
      const r = pruef(await supabase.from('einstellungen').select('benachrichtigungen').maybeSingle()) as { benachrichtigungen: { wochencheck?: { gesehen?: string[] } } } | null;
      return r?.benachrichtigungen?.wochencheck?.gesehen ?? [];
    },
    async gesehenErgaenzen(neu: string[]) {
      const r = pruef(await supabase.from('einstellungen').select('benachrichtigungen').maybeSingle()) as { benachrichtigungen: Record<string, unknown> } | null;
      const b = r?.benachrichtigungen ?? {}, alt = ((b.wochencheck as { gesehen?: string[] } | undefined)?.gesehen) ?? [];
      const liste = [...new Set([...alt, ...neu])];
      pruef(await supabase.from('einstellungen').upsert({ benachrichtigungen: { ...b, wochencheck: { gesehen: liste, zuletzt: jetzt() } }, geaendert: jetzt() }));
      return liste.length;
    },
  };
  (window as unknown as { lernapp: typeof api }).lernapp = api;
}
