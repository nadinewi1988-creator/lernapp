import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Studienstand, Sitzung } from '../db';
import { setzeGelernt, speichereLernzeit, lernzeitZuruecksetzen, antwortenZuruecksetzen } from '../db';
import { kartenAus, istFaellig, kartenOeffnen } from './Karten';
import { auswerten, heuteIso, nachFach, aktuellesSemester, type Eintrag } from '../pruefungslogik';
import { parseIso, plusTage, entfallGrund } from '../data/kalender';
import { useKlapp } from '../klapp';
import { BESCHREIBUNGEN } from '../data/modulbeschreibungen';
import { inhaltZu, sitzungenVon, glossarVon, symboleVon, frageRef, mdHtml } from '../lerninhalte';
import { Lernfragen, type LFEintrag } from './Lernfragen';

const C: Record<string, [string, string]> = { mab004: ['#5f80b5', '#eaf1fc'], mab005: ['#4f8f80', '#e6f5f0'], pkb003: ['#b46b80', '#fbebef'], ewb001: ['#6d9156', '#edf5e5'], ewb002: ['#b5845a', '#fcf0e4'], pyb005: ['#8a77b5', '#f1edfa'] };
const FACH: Record<string, [string, string]> = { mathe: ['#8195b8', '#eef1f6'], politik: ['#a98592', '#f6eff1'], profil: ['#8a9683', '#f0f3ee'] };
const fachVon = (k: string) => (k.startsWith('mab') ? 'mathe' : k.startsWith('pkb') ? 'politik' : 'profil');
const DAYN = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmtD = (s: string) => { const d = parseIso(s); return DAYN[d.getDay()] + ' ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; };
const fmtZeit = (sek: number) => { const m = Math.round(sek / 60); return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : ''); };
const wdMo = (iso: string) => (parseIso(iso).getDay() + 6) % 7;
const TAG_WORT = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'];
const istTut = (s: string) => /Tutorium|eÜbung/.test(s);
const themaTitel = (t: string | null | undefined, ersatz = 'Thema der Sitzung …') => (t && !/^\d\d:\d\d/.test(t) ? t.replace(/^\d\d /, '') : ersatz);
const ARTNAME: Record<string, string> = { Vorlesung: 'Vorlesung', Seminar: 'Seminar', 'Übung': 'Seminar', Tutorium: 'Tutorium', 'eÜbung': 'eÜbung' };
const SF: Record<string, [string, string, string]> = { aus: ['ausgefallen', '#f0f0eb', '#6b6f76'], da: ['anwesend', '#e3f2e8', '#2f7a4b'], weg: ['nachholen', '#fcecee', '#b4475a'], frage: ['?', '#f0f0eb', '#6b6f76'], kommt: ['kommt', '#f7f7f4', '#9a9ea5'] };
const lies = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('mod-' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const merke = (k: string, v: unknown) => { try { localStorage.setItem('mod-' + k, JSON.stringify(v)); } catch { /* egal */ } };

interface S { s: Sitzung; vid: string; tid: string; k: string; titel: string; kurz: string; art: string; wochentag: number | null; rhythmus: string }
interface Props { stand: Studienstand; unter: string; teil: string; gehe: (unter: string, teil?: string) => void; neuLaden: () => Promise<void> }

export function Module({ stand, unter, teil, gehe, neuLaden }: Props) {
  const HEUTE = heuteIso();
  const a = useMemo(() => auswerten(stand), [stand]);
  const akt = aktuellesSemester(stand.semester);
  const istModul = !!unter && !/^s\d$/.test(unter);
  const semId = !istModul ? (unter ? stand.semester.find((x) => x.fachsemester === +unter.slice(1))?.id : akt?.id) : undefined;

  // ---------- Liste ----------
  if (!istModul) {
    const ps = a.proSemester.find((x) => x.semester.id === semId) ?? a.proSemester.find((x) => x.aktuell)!;
    const art = ps.aktuell ? 'aktuell' : (ps.semester.fachsemester < (akt?.fachsemester ?? 0) ? 'vorbei' : 'geplant');
    const cp = ps.liste.reduce((x, e) => x + (e.imUrsprung ? 0 : e.modul.cp), 0);
    return (
      <>
        <header className="kopf">
          <div><h1 style={{ margin: 0 }}>Module</h1><div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>Bachelor Combined Studies · Lehramt Haupt- und Realschule</div></div>
        </header>
        <div className="umschalter mod-tabs" role="tablist" style={{ gap: 3, padding: 3, background: '#efefea' }}>
          {stand.semester.map((s) => <button key={s.id} type="button" role="tab" className={s.id === ps.semester.id ? 'aktiv' : ''} onClick={() => gehe('s' + s.fachsemester)} style={{ minHeight: 40, padding: '0 16px' }}>{s.fachsemester}.<span className="nur-gross"> Semester</span></button>)}
        </div>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mod-semkopf" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 12px' }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{ps.semester.fachsemester}. Semester</span>
            {ps.aktuell && <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#e3f2e8', color: '#2f7a4b' }}>aktuell</span>}
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{ps.semester.bezeichnung}</span>
            <span className="mod-seminfo" style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--ink-3)' }}>{ps.liste.length} Module · {cp} CP</span>
          </div>
          <div className="mod-kacheln" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {ps.liste.map((e) => {
              const k = e.modul.kuerzel, f = art === 'aktuell' && C[k] ? C[k] : FACH[fachVon(k)], versch = e.imUrsprung;
              const st = versch ? ['verschoben', '#fff3e0', '#a3580b'] : art === 'aktuell' ? ['läuft', '#e3f2e8', '#2f7a4b'] : art === 'vorbei' ? ['Archiv', '#f0f0eb', '#6b6f76'] : ['geplant', '#f0f0eb', '#6b6f76'];
              const ziel = stand.semester.find((s) => s.id === e.pruefung.verschoben_nach_semester_id);
              const hinweis = versch && ziel ? 'verschoben → ' + ziel.fachsemester + '. Semester' : art !== 'aktuell' ? e.modul.hinweis ?? '' : '';
              const ls = lernStandVon(stand, k, HEUTE);
              return (
                <button key={k + (versch ? 'u' : '')} type="button" onClick={() => { if (!versch) gehe(k); }} style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', padding: 14, border: '1px solid var(--line)', borderRadius: 14, background: '#fff', boxShadow: 'inset 4px 0 0 ' + f[0], color: 'var(--ink)', cursor: versch ? 'default' : 'pointer', opacity: versch ? 0.6 : 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13, color: f[0] }}>{k}</b><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.modul.cp} CP</span>
                    {e.modul.lehramt_hrs && <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#f0f0eb', color: 'var(--ink-3)' }}>Lehramt HRS</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: st[1], color: st[2] }}>{st[0]}</span>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{e.modul.name}</span>
                  {art === 'aktuell' && !versch && <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'block', height: 6, borderRadius: 999, background: '#f0f0eb', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: ls.pct + '%', background: f[0] }} /></span>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{ls.ges ? ls.pct + ' % gelernt · ' + ls.gel + ' von ' + ls.ges + ' Sitzungen' : 'noch keine Sitzungen'}</span>
                  </span>}
                  {hinweis && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{hinweis}</span>}
                </button>);
            })}
          </div>
        </section>
      </>
    );
  }
  return <ModulDetail key={unter} stand={stand} a={a} kuerzel={unter} tab={teil || 'uebersicht'} gehe={gehe} neuLaden={neuLaden} />;
}

/** Anteil gelernter Sitzungen eines Moduls (bisher stattgefunden, ohne Tutorium, ohne Ausfälle) */
export function lernStandVon(stand: Studienstand, k: string, HEUTE: string) {
  const va = Object.fromEntries(stand.veranstaltungen.map((v) => [v.id, v]));
  const tm = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t]));
  const gel = new Set(stand.lernstand.filter((l) => l.gelernt).map((l) => l.sitzung_id));
  const basis = stand.sitzungen.filter((s) => { const v = va[s.veranstaltung_id], t = v && tm[v.teilmodul_id]; return t && t.kuerzel.startsWith(k) && t.art !== 'Tutorium' && s.status === 'findet_statt' && s.datum <= HEUTE; });
  const g = basis.filter((s) => gel.has(s.id)).length;
  return { gel: g, ges: basis.length, pct: basis.length ? Math.round(g / basis.length * 100) : 0 };
}

function ModulDetail({ stand, a, kuerzel, tab, gehe, neuLaden }: { stand: Studienstand; a: ReturnType<typeof auswerten>; kuerzel: string; tab: string; gehe: Props['gehe']; neuLaden: () => Promise<void> }) {
  const HEUTE = heuteIso();
  const akt = aktuellesSemester(stand.semester);
  const modul = stand.module.find((m) => m.kuerzel === kuerzel);
  const [sitzOffen, setSitzOffen] = useKlapp<Record<string, boolean>>('mod-sitzungen', {});
  const [lernOffen, setLernOffen] = useKlapp<Record<string, boolean>>('mod-lernen', {});
  const [lernZukunft, setLernZukunft] = useKlapp<Record<string, boolean>>('mod-zukunft', {});
  const [ltOffen, setLtOffen] = useKlapp<Record<string, boolean>>('mod-lerntext', {});
  const [lernFilter, setLernFilter] = useState<string>(() => lies('filter', 'alle'));
  const [lt, setLt] = useState<null | { sid: string; kopf: string; titel: string; ausf: boolean; begr: boolean; aufg: boolean }>(null);
  const [lokalGel, setLokalGel] = useState<Record<string, boolean>>({});
  const [glossar, setGlossar] = useState<null | { suche: string }>(null);
  const [hinweis, setHinweis] = useState(false);
  const [lf, setLf] = useState<null | { titel: string; liste: LFEintrag[] }>(null);
  const [loesung, setLoesung] = useKlapp<Record<string, boolean>>('mod-loesung', {});
  const [resetArm, setResetArm] = useState<string | null>(null);
  const [fehler, setFehler] = useState('');
  useEffect(() => { merke('filter', lernFilter); }, [lernFilter]);
  useEffect(() => { setLokalGel({}); }, [stand.lernstand]);

  const eintrag: Eintrag | undefined = a.proSemester.flatMap((p) => p.liste).find((e) => e.modul.kuerzel === kuerzel && !e.imUrsprung);
  const semPlan = stand.semester.find((s) => s.id === modul?.plan_semester_id);
  const art = !semPlan || !akt ? 'geplant' : semPlan.id === akt.id ? 'aktuell' : semPlan.fachsemester < akt.fachsemester ? 'vorbei' : 'geplant';
  const istAkt = art === 'aktuell';
  const f: [string, string] = istAkt && C[kuerzel] ? C[kuerzel] : FACH[fachVon(kuerzel)];
  const KK = kartenAus(stand).filter((k) => k.mk === kuerzel);
  const kSich = KK.filter((k) => k.stand === 'sicher').length, kUns = KK.filter((k) => k.stand === 'unsicher').length, kFae = KK.filter(istFaellig).length, kPct = KK.length ? Math.round(kSich / KK.length * 100) : 0;
  const ksm = { r: 0, t: 0, f: 0 }; KK.forEach((k) => { ksm.r += k.stat.r; ksm.t += k.stat.t; ksm.f += k.stat.f; }); const ksN = ksm.r + ksm.t + ksm.f;
  const kfq = (k: (typeof KK)[number]) => { const n = k.stat.r + k.stat.t + k.stat.f; return n ? (k.stat.f + k.stat.t * 0.5) / n : -1; };
  const kSchwer = KK.filter((k) => kfq(k) > 0).sort((a2, b2) => kfq(b2) - kfq(a2)).slice(0, 3);

  // ---------- Sitzungen des Moduls ----------
  const va = Object.fromEntries(stand.veranstaltungen.map((v) => [v.id, v]));
  const tm = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t]));
  const gelernt = (id: string) => (id in lokalGel ? lokalGel[id] : stand.lernstand.some((l) => l.sitzung_id === id && l.gelernt));
  const SESS: S[] = stand.sitzungen.flatMap((s) => { const v = va[s.veranstaltung_id], t = v && tm[v.teilmodul_id]; if (!t || !t.kuerzel.startsWith(kuerzel)) return []; return [{ s, vid: v.id, tid: t.id, k: t.kuerzel, titel: v.titel, kurz: v.kurz ?? v.titel, art: t.art, wochentag: v.wochentag, rhythmus: v.rhythmus }]; })
    .sort((x, y) => (x.s.datum + (x.s.von ?? '')).localeCompare(y.s.datum + (y.s.von ?? '')));
  const inhaltVon = (x: S) => inhaltZu(x.s.id, x.k, x.s.datum);
  const GLOSSAR = glossarVon(kuerzel), SYMBOLE = symboleVon(kuerzel), LSITZ = sitzungenVon(kuerzel);
  const alleFragen: LFEintrag[] = LSITZ.flatMap((s) => s.fragen.map((f) => ({ s, f })));
  const wdRef = Object.fromEntries(stand.wiederholung.map((w) => [w.frage_ref, w]));
  const faelligZuerst = (l: LFEintrag[]) => { const h = heuteIso(); const r = (e: LFEintrag) => { const w = wdRef[frageRef(e.s, e.f)]; return !w ? 1 : w.faellig && w.faellig <= h ? 0 : 2; }; return [...l].sort((a2, b2) => r(a2) - r(b2)); };
  const status = (x: S) => (x.s.status !== 'findet_statt' ? 'aus' : x.s.anwesenheit === 'ja' ? 'da' : x.s.anwesenheit === 'nein' ? 'weg' : x.s.datum <= HEUTE ? 'frage' : 'kommt');
  const ss = istAkt ? SESS : [];
  const freiwillig = stand.teilmodule.filter((t) => t.freiwillig && t.kuerzel === kuerzel && !stand.veranstaltungen.some((v) => v.teilmodul_id === t.id));
  const gruppenIds = [...new Set(ss.map((x) => x.vid))].sort((x, y) => { const ax = ss.find((q) => q.vid === x)!, ay = ss.find((q) => q.vid === y)!; return (istTut(ax.titel) ? 1 : 0) - (istTut(ay.titel) ? 1 : 0) || ax.k.localeCompare(ay.k); });
  // Ausgefallene Sitzungen zählen mit (Nummer wie im Kursplan); nur „entfällt“ (Feiertag, vorlesungsfrei) wird übersprungen.
  const nrIn = (x: S) => ss.filter((y) => y.vid === x.vid && y.s.status !== 'entfaellt').indexOf(x) + 1;
  const ltOeffnen = (x: S) => setLt({ sid: x.s.id, kopf: x.k + ' · Sitzung ' + nrIn(x) + ' · ' + fmtD(x.s.datum), titel: themaTitel(x.s.thema, inhaltZu(x.s.id, x.k, x.s.datum)?.thema), ausf: false, begr: false, aufg: false });

  // ---------- Kopf ----------
  const t0 = eintrag?.naechster?.termin;
  const abgabe = t0?.art === 'Abgabe' || /Hausarbeit/.test(eintrag?.pruefung.form ?? '');
  const formKurz = (eintrag?.pruefung.form ?? '').split(/[ ,(]/)[0] || 'Prüfung';
  const pruefZeile = istAkt && eintrag ? (eintrag.bestanden ? formKurz + ' · bestanden' : formKurz + (t0?.datum ? ' · ' + (abgabe ? 'Abgabe ' + t0.datum.split('-').reverse().join('.') : fmtD(t0.datum) + t0.datum.slice(0, 4) + (t0.zeit ? ', ' + t0.zeit : '')) : ' · Termin offen'))
    : art === 'vorbei' ? 'Ergebnis: siehe Prüfungsseite' : modul?.hinweis || 'Geplant';
  const tage = t0?.datum ? Math.round((parseIso(t0.datum).getTime() - parseIso(HEUTE).getTime()) / 864e5) : null;
  const tageText = eintrag && eintrag.naechster && eintrag.naechster.versuch > 1 ? 'Tage bis zum ' + eintrag.naechster.versuch + '. Versuch (' + (t0?.art ?? '') + ')' : abgabe ? 'Tage bis zur Abgabe' : 'Tage bis zur Klausur';
  const ls = lernStandVon({ ...stand, lernstand: stand.lernstand.map((l) => (l.sitzung_id in lokalGel ? { ...l, gelernt: lokalGel[l.sitzung_id] } : l)).concat(Object.keys(lokalGel).filter((id) => !stand.lernstand.some((l) => l.sitzung_id === id)).map((id) => ({ sitzung_id: id, gelesen: false, gelernt: lokalGel[id], gelernt_am: null }))) }, kuerzel, HEUTE);
  const wsM = plusTage(HEUTE, -wdMo(HEUTE));
  const basisM = ss.filter((x) => status(x) !== 'aus' && x.art !== 'Tutorium');
  const neuW = basisM.filter((x) => x.s.datum >= wsM && x.s.datum <= HEUTE).length;

  // ---------- Lernzeit (nur während der Lerntext offen ist und Nadine aktiv ist) ----------
  const aktiv = useRef(Date.now()); const zaehler = useRef<{ sek: number; tid: string } | null>(null);
  useEffect(() => { const auf = () => { aktiv.current = Date.now(); }; const ev = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel']; ev.forEach((e) => document.addEventListener(e, auf, { passive: true, capture: true })); return () => ev.forEach((e) => document.removeEventListener(e, auf, { capture: true })); }, []);
  const flush = () => { const z = zaehler.current; if (!z || z.sek < 5) return; const basis = stand.lernzeit.find((l) => l.datum === HEUTE && l.teilmodul_id === z.tid && l.art === 'lerntext')?.sekunden ?? 0; const neu = basis + z.sek; zaehler.current = { sek: 0, tid: z.tid }; speichereLernzeit({ datum: HEUTE, teilmodul_id: z.tid, art: 'lerntext', sekunden: neu }).then(neuLaden).catch(() => {}); };
  useEffect(() => {
    if (!lt) { flush(); return; }
    const tid = SESS.find((x) => x.s.id === lt.sid)?.tid; if (!tid) return;
    zaehler.current = { sek: zaehler.current?.tid === tid ? zaehler.current.sek : 0, tid };
    const t = setInterval(() => { if (document.visibilityState !== 'hidden' && Date.now() - aktiv.current < 60000 && zaehler.current) zaehler.current.sek += 5; }, 5000);
    const s = setInterval(flush, 60000);
    return () => { clearInterval(t); clearInterval(s); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lt?.sid]);

  const umschaltenGelernt = (sid: string) => { const n = !gelernt(sid); setLokalGel((l) => ({ ...l, [sid]: n })); setzeGelernt(sid, n).then(neuLaden).catch((e) => setFehler('Speichern hat nicht geklappt: ' + String((e as Error).message || e))); };

  // ---------- Stile ----------
  const kachel: CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 };
  const klein: CSSProperties = { minHeight: 34, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 13, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
  const TABS: [string, string][] = [['uebersicht', 'Übersicht'], ['sitzungen', 'Sitzungen'], ['lernen', 'Lernen'], ['statistik', 'Statistik'], ['beschreibung', 'Modulbeschreibung']];

  if (!modul) return <div className="karte klein-text">Modul {kuerzel} nicht gefunden. <button className="link-knopf" onClick={() => gehe('')}>Alle Module</button></div>;

  // Übersicht
  const weg = ss.filter((x) => status(x) === 'weg').length;
  const naechsteS = ss.find((x) => x.s.datum > HEUTE);
  const bisher = ss.filter((x) => x.s.datum <= HEUTE && status(x) !== 'aus' && x.art !== 'Tutorium');
  const teile = gruppenIds.map((vid) => { const x = ss.find((q) => q.vid === vid)!; return { vid, k: x.k, name: x.titel, zeit: x.rhythmus === 'einzeltermine' ? (x.k === 'pkb003.3' ? '14-täglich, ' : 'Blocktermine') + (x.k === 'pkb003.3' ? x.s.von + '–' + x.s.bis : '') : DAYN[((x.wochentag ?? 1)) % 7] + ' ' + x.s.von + '–' + x.s.bis }; });
  const lp = istAkt && tage !== null && tage > 0 ? (() => {
    const wo = Math.max(1, Math.ceil((tage - 14) / 7)), offenM = basisM.filter((x) => x.s.datum <= HEUTE && !gelernt(x.s.id)), kommtM = basisM.filter((x) => x.s.datum > HEUTE);
    const pro = Math.max(1, Math.ceil((offenM.length + kommtM.length) / wo));
    return { kopf: 'Lernplan bis zur ' + (abgabe ? 'Abgabe' : 'Klausur'), text: 'Noch ' + Math.ceil(tage / 7) + ' Wochen · ' + offenM.length + ' Sitzungen offen · ' + kommtM.length + ' kommen noch. Vorschlag: pro Woche ca. ' + pro + (pro === 1 ? ' Sitzung' : ' Sitzungen') + ' lernen + fällige Karten.', liste: offenM.slice(0, pro), schluss: tage > 14 ? 'Die letzten 2 Wochen sind fürs Wiederholen frei: Probeprüfung, unsichere Karten, Schnelldurchlauf.' : 'Jetzt Endspurt: Probeprüfung, unsichere Karten und Schnelldurchlauf.' };
  })() : null;

  // Statistik
  const tmIds = stand.teilmodule.filter((t) => t.kuerzel.startsWith(kuerzel)).map((t) => t.id);
  const lzM = stand.lernzeit.filter((l) => tmIds.includes(l.teilmodul_id));
  const sum = (l: typeof lzM) => l.reduce((x, y) => x + y.sekunden, 0);
  const lzTeile = stand.teilmodule.filter((t) => t.kuerzel.startsWith(kuerzel)).sort((x, y) => (x.kuerzel.includes('.') ? '0' : '1').concat(x.kuerzel).localeCompare((y.kuerzel.includes('.') ? '0' : '1').concat(y.kuerzel)));
  const lzMax = Math.max(1, ...lzTeile.map((t) => sum(lzM.filter((l) => l.teilmodul_id === t.id))));
  const beschr = BESCHREIBUNGEN[kuerzel];
  const LF = /Hausarbeit/.test(eintrag?.pruefung.form ?? '') ? 'Hausarbeit' : (eintrag?.pruefung.form ?? 'Klausur').replace(/^Klausur, /, 'Klausur (') + ((eintrag?.pruefung.form ?? '').startsWith('Klausur, ') ? ')' : '');

  return (
    <>
      {fehler && <div className="karte fehler">{fehler}</div>}
      <div className="mod-schnell" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => gehe(semPlan ? 's' + semPlan.fachsemester : '')} style={{ border: 0, background: 'none', padding: 0, marginRight: 8, fontSize: 14, fontWeight: 700, color: 'var(--ink-3)', cursor: 'pointer', whiteSpace: 'nowrap' }}>← Alle Module</button>
        {(a.proSemester.find((p) => p.semester.id === semPlan?.id)?.liste ?? []).filter((e) => !e.imUrsprung).map((e) => e.modul.kuerzel).sort((x, y) => nachFach({ kuerzel: x }, { kuerzel: y })).map((k) => { const an = k === kuerzel, fk: [string, string] = istAkt && C[k] ? C[k] : FACH[fachVon(k)]; return (
          <button key={k} type="button" aria-current={an ? 'page' : undefined} onClick={() => !an && gehe(k, tab)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 999, border: '1.5px solid ' + (an ? fk[0] : 'var(--line)'), background: an ? fk[1] : '#fff', fontSize: 12, fontWeight: 800, color: fk[0], cursor: an ? 'default' : 'pointer' }}>{k}</button>); })}
      </div>
      <header style={{ background: f[1], borderRadius: 18, padding: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '12px 20px' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <b style={{ color: f[0] }}>{kuerzel}</b><span style={{ color: 'var(--ink-2)' }}>{modul.cp} CP · {semPlan ? semPlan.fachsemester + '. Semester · ' + semPlan.bezeichnung : ''}</span>
            {modul.lehramt_hrs && <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fff', color: 'var(--ink-3)' }}>Lehramt HRS</span>}
          </span>
          <h1 className="mod-titel" style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.25 }}>{modul.name}</h1>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{pruefZeile}</span>
        </div>
        {istAkt && (
          <div title="Bezug: bisher stattgefundene Sitzungen ohne Tutorium – neue Unterlagen werden automatisch mitgezählt." style={{ flex: 'none', background: '#fff', borderRadius: 14, padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 150, boxSizing: 'border-box' }}>
            <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: f[0] }}>{ls.pct} %</span>
            <span style={{ display: 'block', width: '100%', height: 5, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: ls.pct + '%', background: f[0] }} /></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>{ls.ges ? 'gelernt · ' + ls.gel + '/' + ls.ges + ' Sitzungen' : 'noch keine Inhalte'}</span>
            {neuW > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: f[0] }}>+{neuW} {neuW === 1 ? 'neue Sitzung' : 'neue Sitzungen'} diese Woche</span>}
          </div>
        )}
        {istAkt && eintrag && !eintrag.bestanden && (
          <div style={{ flex: 'none', background: '#fff', borderRadius: 14, padding: '10px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 150, boxSizing: 'border-box' }}>
            <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: f[0] }}>{tage !== null ? tage : '–'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>{tage !== null ? tageText : (eintrag.naechster?.versuch ?? 1) + '. Versuch: Termin noch offen'}</span>
          </div>
        )}
      </header>

      <div className="umschalter mod-tabs" role="tablist" style={{ gap: 3, padding: 3, background: '#efefea' }}>
        {TABS.map(([id, n]) => <button key={id} type="button" className={tab === id ? 'aktiv' : ''} onClick={() => { gehe(kuerzel, id); setResetArm(null); }} style={{ minHeight: 38, padding: '0 16px' }}>{n}</button>)}
      </div>

      {tab === 'uebersicht' && <>
        <div className="mod-kacheln" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {(istAkt ? [
            { label: 'Nächste Sitzung', wert: naechsteS ? fmtD(naechsteS.s.datum) + ', ' + naechsteS.s.von : '–', info: naechsteS ? naechsteS.kurz + ' · ' + (naechsteS.s.raum ?? '') : '' },
            { label: 'Nachholen', wert: weg + ' offen', info: 'von ' + ss.filter((x) => x.s.datum <= HEUTE).length + ' bisherigen Sitzungen' },
            { label: 'Prüfung', wert: eintrag?.bestanden ? 'bestanden' : t0?.datum ? fmtD(t0.datum) + t0.datum.slice(0, 4) : 'Termin offen', info: formKurz + (eintrag?.naechster && eintrag.naechster.versuch > 1 ? ' · ' + eintrag.naechster.versuch + '. Versuch' : ''), link: true },
            { label: 'Aufbereitet', wert: '0 von ' + bisher.length, info: bisher.length ? bisher.length + (bisher.length === 1 ? ' Sitzung' : ' Sitzungen') + ' noch im Modul-Chat aufzubereiten' : 'alles aufbereitet' },
          ] : [
            { label: 'Semester', wert: semPlan ? semPlan.fachsemester + '. Semester' : '–', info: semPlan?.bezeichnung ?? '' },
            { label: 'Credit Points', wert: modul.cp + ' CP', info: art === 'vorbei' ? 'Ergebnis auf der Prüfungsseite' : 'geplant' },
            { label: 'Lernfortschritt', wert: '–', info: art === 'vorbei' ? 'Lerninhalte im Archiv' : 'startet im ' + (semPlan ? semPlan.fachsemester + '. Semester' : 'Semester') },
          ]).map((k) => (
            <div key={k.label} style={kachel}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{k.label}</span>
              <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{k.wert}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{k.info}</span>
              {'link' in k && k.link && <a href="#/pruefungen/meine" style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none' }}>Zur Prüfungsseite →</a>}
            </div>))}
        </div>
        {lp && (
          <section style={{ background: '#fff', border: '1.5px solid ' + f[1], borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{lp.kopf}</h2>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{lp.text}</span>
            {lp.liste.length > 0 && <>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>Diese Woche dran</span>
              {lp.liste.map((x) => (
                <button key={x.s.id} type="button" onClick={() => { setLernOffen({ [x.vid]: true }); gehe(kuerzel, 'lernen'); ltOeffnen(x); }} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', padding: '8px 0', border: 0, borderTop: '1px solid #f0f0eb', background: 'none', textAlign: 'left', color: 'var(--ink)', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 13, color: f[0] }}>{x.k} · Sitzung {nrIn(x)} · {fmtD(x.s.datum)}</b><span style={{ fontSize: 14 }}>{themaTitel(x.s.thema, 'Thema folgt')}</span></span><span style={{ color: '#9a9ea5' }}>›</span>
                </button>))}
            </>}
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{lp.schluss}</span>
          </section>
        )}
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Teilmodule</h2>
          {teile.map((t) => <button key={t.vid} type="button" onClick={() => { setLernOffen(Object.fromEntries(gruppenIds.map((g) => [g, g === t.vid]))); setLernFilter('alle'); gehe(kuerzel, 'lernen'); }} title="Zum Lernen" style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 0', border: 0, borderTop: '1px solid #f0f0eb', background: 'transparent', fontSize: 14, color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}><b style={{ color: f[0], minWidth: '5.5em' }}>{t.k}</b><span style={{ flex: 1 }}>{t.name}</span><span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t.zeit}</span><span style={{ color: '#9a9ea5' }}>›</span></button>)}
          {freiwillig.map((t) => <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 0', borderTop: '1px solid #f0f0eb', fontSize: 14 }}><b style={{ color: f[0], minWidth: '5.5em' }}>{t.kuerzel}</b><span style={{ flex: 1 }}>{t.name}</span><span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Termin folgt</span><span style={{ color: '#9a9ea5' }}>›</span></div>)}
          {teile.length === 0 && freiwillig.length === 0 && <span className="klein-text">{art === 'vorbei' ? 'Vergangenes Semester – keine Termine hinterlegt.' : 'Termine kommen, sobald das Semester im Kalender ist.'}</span>}
        </section>
      </>}

      {tab === 'sitzungen' && <>
        {ss.length === 0 && <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, fontSize: 14, color: 'var(--ink-3)' }}>{art === 'vorbei' ? 'Vergangenes Semester – keine Termine hinterlegt.' : 'Termine kommen, sobald das Semester im Kalender ist.'}</div>}
        {gruppenIds.map((vid) => {
          const arr = ss.filter((x) => x.vid === vid), x0 = arr[0], offen = sitzOffen[vid] ?? false, nach = arr.filter((x) => status(x) === 'weg').length;
          const gr = /\(Gruppe ([A-Z0-9]+)\)/.exec(x0.titel);
          const name = x0.titel.replace(/ \(Gruppe [A-Z0-9]+\)/, '') + (gr ? ' · Gruppe ' + gr[1] : '') + (x0.art === 'Tutorium' ? ' (freiwillig)' : '');
          const zeit = x0.rhythmus === 'einzeltermine' ? (x0.k === 'pkb003.3' ? '14-täglich, donnerstags ' + x0.s.von + '–' + x0.s.bis + ' Uhr · Raum ' + x0.s.raum : 'Blocktermine, meist mittwochs 10:00 Uhr') : 'wöchentlich, ' + TAG_WORT[(x0.wochentag ?? 1) - 1] + ' ' + x0.s.von + '–' + x0.s.bis + ' Uhr · Raum ' + x0.s.raum;
          return (
            <section key={vid} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', boxShadow: 'inset 4px 0 0 ' + f[0] }}>
              <button type="button" onClick={() => setSitzOffen({ ...sitzOffen, [vid]: !offen })} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '14px 16px 14px 20px', border: 0, background: f[1], color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ width: '1em', color: 'var(--ink-3)' }}>{offen ? '▾' : '▸'}</span>
                <b style={{ color: f[0], fontSize: 13 }}>{x0.k}</b>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fff', color: 'var(--ink-2)' }}>{ARTNAME[x0.art] ?? x0.art}</span>
                <span style={{ fontSize: 15, fontWeight: 800, flex: '1 1 200px', minWidth: 0 }}>{name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{arr.length} Termine{nach ? ' · ' + nach + ' nachholen' : ''}</span>
              </button>
              {offen && <div style={{ display: 'flex', flexDirection: 'column', padding: '0 16px 6px 20px' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '8px 0 4px' }}>{zeit}</div>
                {arr.map((x) => { const st = status(x), t = SF[st].slice() as string[], eg = entfallGrund(x.s.datum), lernbar = x.s.status !== 'entfaellt'; if (eg) t[0] = 'entfällt – ' + eg;
                  return (
                    <button key={x.s.id} type="button" onClick={() => { if (!lernbar) return; setLernOffen(Object.fromEntries(gruppenIds.map((g) => [g, g === vid]))); if (st === 'kommt') setLernZukunft({ ...lernZukunft, [vid]: true }); setLernFilter('alle'); gehe(kuerzel, 'lernen'); ltOeffnen(x); }} title={lernbar ? 'Zum Lernstoff dieser Sitzung' : ''} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', border: 0, borderTop: '1px solid #f0f0eb', background: 'transparent', fontSize: 14, color: 'var(--ink)', textAlign: 'left', cursor: lernbar ? 'pointer' : 'default', opacity: st === 'kommt' ? 0.65 : 1 }}>
                      <span style={{ minWidth: '5.5em', color: 'var(--ink-3)' }}>{fmtD(x.s.datum)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{(x.s.thema || 'Thema folgt') + (x0.rhythmus === 'einzeltermine' && x0.k !== 'pkb003.3' ? ' · ' + x.s.von + '–' + x.s.bis + ' Uhr, ' + x.s.raum : x.s.raum !== x0.s.raum ? ' · Raum ' + x.s.raum : '')}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: t[1], color: t[2], whiteSpace: 'nowrap' }}>{t[0]}</span>
                      <span style={{ color: '#9a9ea5', visibility: lernbar ? 'visible' : 'hidden' }}>›</span>
                    </button>); })}
              </div>}
            </section>);
        })}
        {istAkt && freiwillig.map((t) => (
          <section key={t.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', boxShadow: 'inset 4px 0 0 ' + f[0] }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '14px 16px 14px 20px', background: f[1] }}>
              <span style={{ width: '1em', color: 'var(--ink-3)' }}>▸</span><b style={{ color: f[0], fontSize: 13 }}>{kuerzel}</b>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fff', color: 'var(--ink-2)' }}>Tutorium</span>
              <span style={{ fontSize: 15, fontWeight: 800, flex: '1 1 200px', minWidth: 0 }}>Tutorium {kuerzel} (freiwillig)</span><span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Termine folgen</span>
            </div>
          </section>))}
      </>}

      {tab === 'lernen' && (istAkt ? <>
        <div className="mod-kacheln" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ background: '#fff', border: '1.5px solid ' + f[1], borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Eigene Karten</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{KK.length ? KK.length + (KK.length === 1 ? ' Karte' : ' Karten') + ' · ' + kFae + ' heute fällig · ' + kSich + ' sicher · ' + kUns + ' unsicher' : 'Noch keine eigenen Karten zu diesem Modul.'}</span>
            {KK.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', width: kPct + '%', background: f[0] }} /></div><span style={{ fontSize: 12, fontWeight: 800, color: f[0] }}>{kPct} %</span></div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>{KK.length > 0 && <button type="button" onClick={() => kartenOeffnen({ aktion: 'ueben', modul: kuerzel })} style={klein}>Üben</button>}<button type="button" onClick={() => kartenOeffnen({ aktion: 'neu', modul: kuerzel })} style={klein}>+ Karte</button></div>
          </div>
          <div style={{ background: '#fff', border: '1.5px solid ' + f[1], borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Begriffe</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{GLOSSAR.length} Begriffe{kuerzel.startsWith('mab') ? ' · ' + SYMBOLE.length + ' Symbole' : ''}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Alle Definitionen des Moduls – Wortlaut aus den Unterlagen und Erklärung.</span>
            <button type="button" onClick={() => setGlossar({ suche: '' })} style={{ ...klein, alignSelf: 'flex-start', marginTop: 'auto' }}>Öffnen</button>
          </div>
          <div style={{ background: f[1], borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Schnelldurchlauf</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{alleFragen.length ? alleFragen.length + ' Fragen aus ' + LSITZ.length + (LSITZ.length === 1 ? ' Sitzung' : ' Sitzungen') + ' – fällige zuerst.' : 'Alle Fragen des Moduls kurz durchgehen – ideal für zwischendurch.'}</span>
            <button type="button" onClick={() => alleFragen.length ? setLf({ titel: kuerzel + ' · Schnelldurchlauf', liste: faelligZuerst(alleFragen) }) : setHinweis(true)} style={{ ...klein, alignSelf: 'flex-start', marginTop: 'auto' }}>Starten</button>
          </div>
          <div style={{ background: f[1], borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Probeprüfung</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Wie die echte {LF} – mit Zeit und Auswertung. {tage !== null ? 'Noch ' + tage + ' Tage.' : ''}</span>
            <button type="button" onClick={() => setHinweis(true)} style={{ ...klein, alignSelf: 'flex-start', marginTop: 'auto' }}>Starten</button>
          </div>
        </div>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Nach Sitzungen</h2>
            <div className="umschalter" style={{ gap: 3, padding: 3, background: '#efefea', alignSelf: 'auto' }}>
              {[['alle', 'Alle'], ['nach', 'Nachholen'], ['offen', 'Noch offen']].map(([id, n]) => <button key={id} type="button" className={lernFilter === id ? 'aktiv' : ''} onClick={() => setLernFilter(id)} style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}>{n}</button>)}
            </div>
          </div>
          {gruppenIds.map((vid) => {
            const arr = ss.filter((x) => x.vid === vid && x.s.status !== 'entfaellt'), x0 = ss.find((x) => x.vid === vid)!;
            const rows = arr.map((x, i) => ({ x, i, st: status(x), g: gelernt(x.s.id) }));
            const gel = rows.filter((r) => r.g && r.st !== 'aus').length, statt = rows.filter((r) => r.st !== 'kommt' && r.st !== 'aus').length, nach = rows.filter((r) => r.st === 'weg' && !r.g).length;
            const gef = rows.filter((r) => lernFilter === 'alle' || (lernFilter === 'nach' ? r.st === 'weg' && !r.g : !r.g && r.st !== 'kommt'));
            const verg = gef.filter((r) => r.st !== 'kommt'), zuk = gef.filter((r) => r.st === 'kommt'), zeigeZ = !!lernZukunft[vid], offen = lernOffen[vid] ?? false;
            const liste = [...verg, ...(zeigeZ ? zuk : [])];
            return (
              <div key={vid} style={{ border: '1px solid #f0f0eb', borderRadius: 12, overflow: 'hidden' }}>
                <button type="button" onClick={() => setLernOffen({ ...lernOffen, [vid]: !offen })} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '12px 14px', border: 0, background: '#fff', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ width: '1em', color: 'var(--ink-3)' }}>{offen ? '▾' : '▸'}</span>
                  <b style={{ color: f[0], fontSize: 13 }}>{x0.k}</b>
                  <span style={{ fontSize: 14, fontWeight: 800, flex: '1 1 160px', minWidth: 0 }}>{x0.art === 'Tutorium' ? 'Tutorium (freiwillig)' : x0.titel.replace(/ \(Gruppe [A-Z0-9]+\)/, '')}</span>
                  {nach > 0 && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fcecee', color: '#b4475a' }}>{nach} nachholen</span>}
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{gel} von {statt} gelernt{statt ? ' · ' + Math.round(gel / statt * 100) + ' %' : ''}</span>
                </button>
                {offen && <div style={{ display: 'flex', flexDirection: 'column', padding: '0 14px 6px' }}>
                  {liste.map((r) => { const t = r.g ? ['gelernt', '#e3f2e8', '#2f7a4b'] : r.st === 'aus' ? ['ausgefallen', '#f0f0eb', '#6b6f76'] : r.st === 'weg' ? ['nachholen', '#fcecee', '#b4475a'] : r.st === 'kommt' ? ['kommt', '#f7f7f4', '#9a9ea5'] : ['offen', '#f0f0eb', '#6b6f76'];
                    return (
                      <button key={r.x.s.id} type="button" onClick={() => ltOeffnen(r.x)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', border: 0, borderTop: '1px solid #f0f0eb', background: 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', opacity: r.st === 'kommt' ? 0.6 : 1 }}>
                        <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: r.g ? f[0] : r.st === 'weg' ? '#fcecee' : '#f0f0eb', color: r.g ? '#fff' : r.st === 'weg' ? '#b4475a' : 'var(--ink-3)' }}>{r.i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{themaTitel(r.x.s.thema, inhaltVon(r.x)?.thema)}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtD(r.x.s.datum)}</span>
                            {inhaltVon(r.x) ? <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: f[1], color: f[0] }}>aufbereitet · {inhaltVon(r.x)!.fragen.length} Fragen</span> : r.st !== 'kommt' && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, border: '1px dashed #d8d8d0', background: '#fff', color: '#9a9ea5' }}>noch nicht aufbereitet</span>}
                            <span style={{ width: 64, height: 5, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden', visibility: r.st === 'kommt' ? 'hidden' : 'visible' }}><span style={{ display: 'block', height: '100%', width: (r.g ? 100 : 0) + '%', background: f[0] }} /></span>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.st === 'kommt' ? 'noch keine Inhalte' : r.g ? '100 %' : '0 %'}</span>
                          </span>
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: t[1], color: t[2], whiteSpace: 'nowrap' }}>{t[0]}</span>
                        <span style={{ color: '#9a9ea5' }}>›</span>
                      </button>); })}
                  {zuk.length > 0 && <button type="button" onClick={() => setLernZukunft({ ...lernZukunft, [vid]: !zeigeZ })} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: '8px 0 4px', fontSize: 13, color: 'var(--ink-3)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>{zeigeZ ? 'Kommende Termine ausblenden' : zuk.length + ' kommende Termine anzeigen'}</button>}
                  {liste.length === 0 && zuk.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>Nichts in dieser Auswahl.</div>}
                </div>}
              </div>);
          })}
          {freiwillig.map((t) => <div key={t.id} style={{ border: '1px solid #f0f0eb', borderRadius: 12, overflow: 'hidden' }}><div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '12px 14px' }}><span style={{ width: '1em', color: 'var(--ink-3)' }}>·</span><b style={{ color: f[0], fontSize: 13 }}>{kuerzel}</b><span style={{ fontSize: 14, fontWeight: 800, flex: '1 1 160px', minWidth: 0 }}>Tutorium (freiwillig)</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Termine folgen</span></div></div>)}
        </section>
        {hinweis && <div style={{ fontSize: 13, color: 'var(--ink-3)', background: '#fff', border: '1px dashed #d8d8d0', borderRadius: 12, padding: '10px 12px' }}>Startet, sobald die ersten Lerninhalte im Modul-Chat aufbereitet sind.</div>}
      </> : <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, fontSize: 14, color: 'var(--ink-3)' }}>{art === 'vorbei' ? 'Die Lerninhalte aus diesem Semester bleiben im Archiv erhalten.' : 'Die Lerninhalte kommen, sobald dieses Modul in deinem aktuellen Semester startet.'}</div>)}

      {tab === 'statistik' && <>
        {(() => {
          const verg = SESS.filter((x) => x.s.datum <= HEUTE && x.s.status !== 'entfaellt');
          const zaehl = (l: S[]) => { const st = l.filter((x) => x.s.status === 'findet_statt'); return { da: st.filter((x) => x.s.anwesenheit === 'ja').length, weg: st.filter((x) => x.s.anwesenheit === 'nein').length, offen: st.filter((x) => x.s.anwesenheit !== 'ja' && x.s.anwesenheit !== 'nein').length, aus: l.length - st.length, n: st.length }; };
          const ges = zaehl(verg), quote = ges.da + ges.weg ? Math.round(ges.da / (ges.da + ges.weg) * 100) : null;
          const gruppen = [...new Set(verg.map((x) => x.vid))].map((vid) => verg.filter((x) => x.vid === vid)).sort((a2, b2) => (a2[0].art === 'Tutorium' ? 1 : 0) - (b2[0].art === 'Tutorium' ? 1 : 0) || a2[0].k.localeCompare(b2[0].k));
          const text = (z: ReturnType<typeof zaehl>) => [z.da + ' von ' + z.n + ' da', z.weg ? z.weg + ' gefehlt' : '', z.offen ? z.offen + ' ohne Angabe' : '', z.aus ? z.aus + ' ausgefallen' : ''].filter(Boolean).join(' · ');
          const balken = (z: ReturnType<typeof zaehl>, h: number) => <div style={{ display: 'flex', height: h, borderRadius: h / 2, overflow: 'hidden', background: '#f0f0eb' }}>{([[z.da, '#5aa36f'], [z.weg, '#e07a88'], [z.offen, '#d8d8d0']] as const).map(([w, c]) => <div key={c} style={{ width: (z.n ? w / z.n * 100 : 0) + '%', background: c }} />)}</div>;
          return (
            <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Anwesenheit</h2>
                {quote !== null && <span style={{ fontSize: 20, fontWeight: 800, color: quote >= 80 ? '#2f7a4b' : quote >= 50 ? '#a3580b' : '#c42b2b' }}>{quote} % <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>da</span></span>}
              </div>
              {verg.length === 0 ? <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Noch keine Sitzungen vorbei.</span> : <>
                {balken(ges, 12)}
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Bisher {text(ges)}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>Nach Veranstaltung</span>
                {gruppen.map((l) => { const x0 = l[0], z = zaehl(l), gr = /\(Gruppe ([A-Z0-9]+)\)/.exec(x0.titel); return (
                  <div key={x0.vid} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ color: f[0] }}>{x0.k}</b> · {x0.titel.replace(/ \(Gruppe [A-Z0-9]+\)/, '') + (gr ? ' · Gruppe ' + gr[1] : '') + (x0.art === 'Tutorium' ? ' (freiwillig)' : '')}</span>
                    {balken(z, 6)}
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{text(z)}</span>
                  </div>); })}
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Gezählt werden vergangene Sitzungen. Ausgefallene Sitzungen zählen nicht mit; „ohne Angabe“ trägst du im Kalender beim „?“ nach.</span>
              </>}
            </section>);
        })()}
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Lernzeit</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {([['Heute', sum(lzM.filter((l) => l.datum === HEUTE))], ['Diese Woche', sum(lzM.filter((l) => l.datum >= wsM))], ['Gesamt', sum(lzM)]] as const).map(([n, w]) => <div key={n} style={{ background: f[1], borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>{n}</span><span style={{ fontSize: 20, fontWeight: 800 }}>{fmtZeit(w)}</span></div>)}
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>davon Karten üben {fmtZeit(sum(lzM.filter((l) => l.art === 'karten')))} · Lerntexte lesen {fmtZeit(sum(lzM.filter((l) => l.art === 'lerntext')))}</span>
          {lzTeile.length > 0 && <>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>Nach Teilmodul</span>
            {lzTeile.map((t) => { const z = sum(lzM.filter((l) => l.teilmodul_id === t.id)); return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 10px', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.kuerzel} · {t.name.replace(/ \((Gruppe [^)]*|freiwillig)\)/, '')}</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{fmtZeit(z)}</span>
                <div style={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', width: Math.round(z / lzMax * 100) + '%', background: f[0] }} /></div>
                <span style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--ink-3)' }}>{(() => { const kt = KK.filter((k) => k.teilId === t.id), x = { r: 0, t: 0, f: 0 }; kt.forEach((k) => { x.r += k.stat.r; x.t += k.stat.t; x.f += k.stat.f; }); const n = x.r + x.t + x.f; return kt.length ? kt.length + (kt.length === 1 ? ' Karte' : ' Karten') + (n ? ' · ' + Math.round(x.r / n * 100) + ' % richtig (✓ ' + x.r + ' ◐ ' + x.t + ' ✗ ' + x.f + ')' : ' · noch nicht geübt') : 'keine Karten'; })()}</span>
              </div>); })}
          </>}
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Gezählt wird nur aktives Lernen (Karten üben, Lerntexte lesen) – nicht Karten anlegen oder Herumklicken. Nach 1 Minute ohne Eingabe oder im Hintergrund stoppt die Uhr.</span>
        </section>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Eigene Karten</h2>
            {KK.length > 0 && <span style={{ fontSize: 20, fontWeight: 800, color: '#2f7a4b' }}>{ksN ? Math.round(ksm.r / ksN * 100) + ' %' : '–'} <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Trefferquote</span></span>}
          </div>
          {KK.length > 0 ? <>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{KK.length + (KK.length === 1 ? ' Karte' : ' Karten') + ' · ' + ksN + ' Antworten · ' + kSich + ' sicher'}</span>
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: '#f0f0eb' }}>{([[ksm.r, '#5aa36f'], [ksm.t, '#e3a548'], [ksm.f, '#d06a6a']] as const).map(([w, c]) => <div key={c} style={{ width: (ksN ? Math.round(w / ksN * 100) : 0) + '%', background: c }} />)}</div>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>✓ richtig {ksm.r} · ◐ teilweise {ksm.t} · ✗ falsch {ksm.f}</span>
            {kSchwer.length > 0 && <><span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>Am häufigsten falsch</span>
              {kSchwer.map((k) => <div key={k.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid #f0f0eb', paddingTop: 6 }}><span style={{ fontSize: 14, fontWeight: 700 }}><b style={{ fontSize: 12, color: f[0] }}>{k.teil}</b> · {k.vorne.replace(/\[\[(.+?)\]\]/g, '_____')}</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>✓ {k.stat.r} · ◐ {k.stat.t} · ✗ {k.stat.f}</span></div>)}</>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><button type="button" onClick={() => kartenOeffnen({ aktion: 'ueben', modul: kuerzel })} style={{ ...klein, minHeight: 32 }}>Karten üben</button></div>
          </> : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Noch keine eigenen Karten – sobald du übst, erscheinen hier Trefferquote und schwierigste Karten.</span>}
        </section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => { if (resetArm !== 'karten') { setResetArm('karten'); return; } setResetArm(null); antwortenZuruecksetzen(KK.map((k) => 'karte:' + k.id)).then(neuLaden).catch((e) => setFehler(String((e as Error).message || e))); }} style={{ ...klein, minHeight: 32, color: resetArm === 'karten' ? '#c42b2b' : 'var(--ink)' }}>{resetArm === 'karten' ? 'Wirklich zurücksetzen?' : 'Karten-Ergebnisse zurücksetzen'}</button>
          <button type="button" onClick={() => { if (resetArm !== 'zeit') { setResetArm('zeit'); return; } setResetArm(null); lernzeitZuruecksetzen(tmIds).then(neuLaden).catch((e) => setFehler(String((e as Error).message || e))); }} style={{ ...klein, minHeight: 32, color: resetArm === 'zeit' ? '#c42b2b' : 'var(--ink)' }}>{resetArm === 'zeit' ? 'Wirklich zurücksetzen?' : 'Lernzeit zurücksetzen'}</button>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{resetArm ? 'Betrifft nur ' + kuerzel + '. Zum Bestätigen noch einmal tippen.' : 'Der Stand deiner Karten (neu/unsicher/sicher) bleibt erhalten.'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Später kommen hier auch die Ergebnisse der Lernfragen, des Schnelldurchlaufs und der Probeprüfungen dazu.</div>
      </>}

      {tab === 'beschreibung' && (
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {beschr ? <>
            {beschr.zeilen.map(([label, punkte]) => (
              <div key={label} className="mod-beschr" style={{ display: 'grid', gridTemplateColumns: '11em minmax(0, 1fr)', gap: 12, paddingTop: 10, borderTop: '1px solid #f0f0eb', fontSize: 14, lineHeight: 1.45 }}>
                <span style={{ color: 'var(--ink-3)', fontWeight: 700 }}>{label}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{punkte.map((p, i) => <span key={i} style={{ display: 'flex', gap: 6 }}><span style={{ color: f[0], visibility: punkte.length > 1 ? 'visible' : 'hidden' }}>•</span><span>{p}</span></span>)}</span>
              </div>))}
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{beschr.link ? 'Zusammenfassung der Modulbeschreibung, Stand ' + beschr.stand + '.' : 'Aus der Modulbeschreibung, Stand ' + beschr.stand + ' (Projekt-Ordner „modulbeschreibungen“).'} {beschr.link && <a href={beschr.link} target="_blank" rel="noopener" style={{ color: 'var(--ink-3)' }}>Original-PDF der Uni öffnen ↗</a>}</div>
          </> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              <b style={{ fontSize: 15 }}>Noch keine Modulbeschreibung</b>
              <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{kuerzel === 'pbx' ? 'Sobald du dein Profilmodul gewählt hast, erscheint hier seine Modulbeschreibung.' : 'Für dieses Modul liegt noch keine Modulbeschreibung vor.'}</span>
            </div>
          )}
        </section>
      )}

      {/* ---------- Lerntext ---------- */}
      {lt && (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setLt(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Lerntext" className="dialog" style={{ maxWidth: 620, gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: f[0] }}>{lt.kopf}</div>
            <h2 style={{ margin: '-8px 0 0', fontSize: 20 }}>{lt.titel}</h2>
            {(() => { const xS = SESS.find((q) => q.s.id === lt.sid); const LI = xS ? inhaltVon(xS) : null; if (!LI) return <>
            <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1px dashed #d8d8d0', background: '#fff', color: '#9a9ea5' }}>noch nicht aufbereitet</span>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', border: '1px dashed #d8d8d0', borderRadius: 10, padding: '8px 10px' }}>Diese Sitzung ist noch nicht aufbereitet – im Modul-Chat mit deinen Unterlagen (Schema in claude/lerninhalte_schema.md). Bis dahin zeigt das Fenster den Aufbau.</div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <b style={{ fontSize: 14 }}>Lernziele</b>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>○ Lernziel aus den Unterlagen (vorgegeben) – Haken, sobald die Fragen dazu richtig beantwortet sind</span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>○ …</span>
              </div>
              <div style={{ background: f[1], borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <b style={{ fontSize: 14 }}>Kurzfassung</b>
                {[92, 80, 86].map((w) => <span key={w} style={{ display: 'block', height: 10, width: w + '%', borderRadius: 5, background: 'rgba(255,255,255,0.9)' }} />)}
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Platzhalter – hier steht später die Kurzfassung der Sitzung.</span>
              </div>
              {([['ausf', 'Ausführliche Erklärung', 14], ['begr', 'Begriffe', 15], ['aufg', 'Aufgaben aus dem Material', 15]] as const).map(([key, name, fs]) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button type="button" onClick={() => setLtOffen({ ...ltOffen, [lt.sid + ':' + key]: !ltOffen[lt.sid + ':' + key] })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 12, background: '#fff', fontSize: fs, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{name}<span style={{ fontSize: key === 'ausf' ? 14 : 12, color: 'var(--ink-3)' }}>{ltOffen[lt.sid + ':' + key] ? '▾' : '▸'}</span></button>
                  {ltOffen[lt.sid + ':' + key] && key === 'ausf' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>{[96, 90, 94, 70].map((w) => <span key={w} style={{ display: 'block', height: 10, width: w + '%', borderRadius: 5, background: '#f0f0eb' }} />)}</div>}
                  {ltOffen[lt.sid + ':' + key] && key === 'begr' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px', fontSize: 13, color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>Begriff</b><span>„Wortlaut der Definition aus den Unterlagen“ (Folie x)</span><span>In eigenen Worten: …</span></div>}
                  {ltOffen[lt.sid + ':' + key] && key === 'aufg' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px', fontSize: 13, color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>Aufgabe 1 (Übungsblatt / Folie)</b><span>Aufgabentext wie im Material …</span><span style={{ textDecoration: 'underline' }}>Lösung mit Lösungsweg anzeigen</span></div>}
                </div>))}
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Quellen: Folien/Unterlagen der Sitzung mit Seitenangaben</div>
            </>;
              const sicher = (fid: string) => wdRef[frageRef(LI, LI.fragen.find((q) => q.id === fid) ?? LI.fragen[0])]?.stand === 'sicher';
              const md = (t: string) => <div className="lt-md" style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: mdHtml(t) }} />;
              const fol = (t?: string) => t ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>{LI.teilmodul.endsWith('.1') ? 'Folie ' : ''}{t}</span> : null;
              return <>
                {LI.pruefungshinweise.length > 0 && <div style={{ background: '#fde9e9', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}><b style={{ fontSize: 14, color: '#c42b2b' }}>Prüfungshinweise</b>{LI.pruefungshinweise.map((p) => <span key={p} style={{ fontSize: 13 }}>{p}</span>)}</div>}
                <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <b style={{ fontSize: 14 }}>Lernziele</b>
                  {LI.lernziele.map((z) => { const ok = z.fragen.length > 0 && z.fragen.every(sicher); return <span key={z.text} style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', gap: 8 }}><span style={{ color: ok ? '#2f7a4b' : 'var(--ink-3)' }}>{ok ? '✓' : '○'}</span><span>{z.text}{z.art === 'vorgegeben' ? '' : ' '}<span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{z.art === 'vorgegeben' ? '(vorgegeben)' : ''}</span></span></span>; })}
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Haken, sobald alle Fragen zum Lernziel sicher sitzen.</span>
                </div>
                <div style={{ background: f[1], borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <b style={{ fontSize: 14 }}>Kurzfassung</b>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, lineHeight: 1.45 }}>{LI.kurzfassung.map((k) => <li key={k}>{k}</li>)}</ul>
                </div>
                {([['ausf', 'Ausführliche Erklärung', 14], ['begr', 'Begriffe (' + LI.definitionen.length + ')', 15], ['aufg', 'Aufgaben aus dem Material (' + LI.aufgaben.length + ')', 15]] as const).map(([key, name, fs]) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" onClick={() => setLtOffen({ ...ltOffen, [lt.sid + ':' + key]: !ltOffen[lt.sid + ':' + key] })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 12, background: '#fff', fontSize: fs, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{name}<span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{ltOffen[lt.sid + ':' + key] ? '▾' : '▸'}</span></button>
                    {ltOffen[lt.sid + ':' + key] && key === 'ausf' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 4px' }}>{LI.erklaerung.map((a2) => <div key={a2.titel} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><b style={{ fontSize: 15 }}>{a2.titel}</b>{fol(a2.folien)}</span>{md(a2.text)}
                      {a2.beispiel && <div style={{ background: f[1], borderRadius: 10, padding: '8px 12px', fontSize: 13 }}><b>Beispiel: </b><span dangerouslySetInnerHTML={{ __html: mdHtml(a2.beispiel).replace(/^<p>|<\/p>$/g, '') }} /></div>}</div>)}</div>}
                    {ltOffen[lt.sid + ':' + key] && key === 'begr' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>{LI.definitionen.map((d) => <div key={d.begriff} style={{ display: 'flex', flexDirection: 'column', gap: 3, borderLeft: '3px solid ' + f[0], paddingLeft: 10 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><b style={{ fontSize: 14 }}>{d.begriff}</b>{fol(d.folie)}</span>
                      <span style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-2)' }}>„{d.wortlaut}“</span><span style={{ fontSize: 13 }}>{d.erklaerung}</span></div>)}</div>}
                    {ltOffen[lt.sid + ':' + key] && key === 'aufg' && <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 4px' }}>{LI.aufgaben.map((a2) => { const k2 = LI.datei + a2.id, auf = !!loesung[k2]; return <div key={a2.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '3px solid ' + f[0], paddingLeft: 10 }}>
                      <b style={{ fontSize: 13 }}>{a2.quelle}</b><span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{a2.text}</span>
                      <button type="button" onClick={() => setLoesung({ ...loesung, [k2]: !auf })} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: f[0], textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>{auf ? 'Lösung ausblenden' : 'Lösung mit Lösungsweg anzeigen'}</button>
                      {auf && <div style={{ background: f[1], borderRadius: 10, padding: '8px 12px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}><span><b>Lösung: </b>{a2.loesung}</span><span style={{ whiteSpace: 'pre-wrap' }}><b>Lösungsweg: </b>{a2.loesungsweg}</span></div>}
                    </div>; })}</div>}
                  </div>))}
                {LI.offene_fragen.length > 0 && <details style={{ fontSize: 13, color: 'var(--ink-2)', background: '#fffaf0', borderRadius: 12, padding: '8px 12px' }}><summary style={{ cursor: 'pointer', fontWeight: 800, color: '#9a6b00' }}>Nachfragen in der Uni ({LI.offene_fragen.length})</summary><ol style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>{LI.offene_fragen.map((q) => <li key={q}>{q}</li>)}</ol></details>}
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Quellen: {LI.quellen.map((q) => q.datei.split('/').pop() + ' (' + q.seiten + ')').join(' · ')} · „Ergänzung“ = nicht aus der Vorlesung</div>
              </>; })()}
            {hinweis && <div style={{ fontSize: 13, color: 'var(--ink-3)', border: '1px dashed #d8d8d0', borderRadius: 10, padding: '8px 10px' }}>Die Lernfragen entstehen im Modul-Chat aus deinen Unterlagen zu dieser Sitzung (Definitionen, Kernaussagen, Aufgaben, Lernziele) – deine eigenen Karteikarten übst du daneben.</div>}
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={gelernt(lt.sid)} onChange={() => umschaltenGelernt(lt.sid)} style={{ width: 18, height: 18, accentColor: '#4f8f80' }} />Als gelernt markieren
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {(() => { const xS = SESS.find((q) => q.s.id === lt.sid); const LI = xS ? inhaltVon(xS) : null; return <button type="button" onClick={() => { if (LI && LI.fragen.length) setLf({ titel: LI.teilmodul + ' · ' + lt.titel, liste: LI.fragen.map((q) => ({ s: LI, f: q })) }); else setHinweis(true); }} style={LI ? { ...klein, background: f[0], borderColor: f[0], color: '#fff' } : klein}>Lernfragen üben{LI ? ' (' + LI.fragen.length + ')' : ''}</button>; })()}
              {(() => { const n = KK.filter((k) => k.sitzungId === lt.sid).length; return n ? <button type="button" onClick={() => { setLt(null); kartenOeffnen({ aktion: 'ueben', modul: kuerzel, sitzung: lt.sid }); }} style={klein}>Karteikarten üben ({n})</button> : <span title="Noch keine Karten zu dieser Sitzung" style={{ ...klein, opacity: 0.45, cursor: 'default' }}>Karteikarten üben (0)</span>; })()}
              <button type="button" onClick={() => { setLt(null); kartenOeffnen({ aktion: 'neu', modul: kuerzel, sitzung: lt.sid }); }} style={klein}>+ Karte zu dieser Sitzung</button>
              <button type="button" onClick={() => { setLt(null); setHinweis(false); }} style={klein}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Begriffe ---------- */}
      {glossar && (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setGlossar(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Begriffe" className="dialog" style={{ maxWidth: 620 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: f[0] }}>{kuerzel} · Begriffe</div>
            <input type="search" value={glossar.suche} onChange={(ev) => setGlossar({ suche: ev.target.value })} placeholder="Begriff suchen …" style={{ border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 999, padding: '8px 14px', fontSize: 14, color: 'var(--ink)' }} />
            {GLOSSAR.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink-3)', border: '1px dashed #d8d8d0', borderRadius: 10, padding: '10px 12px' }}>Noch keine Begriffe. Sie kommen automatisch dazu, sobald Sitzungen im Modul-Chat aufbereitet sind – mit Wortlaut aus deinen Unterlagen, Erklärung und Quelle.</div>
              : (() => { const q = glossar.suche.trim().toLowerCase(); const l = GLOSSAR.filter((g) => !q || (g.begriff + ' ' + g.wortlaut + ' ' + g.erklaerung).toLowerCase().includes(q)).sort((x, y) => x.begriff.localeCompare(y.begriff, 'de'));
                return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{l.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Kein Begriff gefunden.</span>}{l.map((g) => <div key={g.begriff} style={{ display: 'flex', flexDirection: 'column', gap: 3, borderLeft: '3px solid ' + f[0], paddingLeft: 10 }}>
                  <b style={{ fontSize: 14 }}>{g.begriff}</b><span style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-2)' }}>„{g.wortlaut}“</span><span style={{ fontSize: 13 }}>{g.erklaerung}</span><span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{g.quelle}</span></div>)}</div>; })()}
            {kuerzel.startsWith('mab') && <><b style={{ fontSize: 14 }}>Symbole</b>{SYMBOLE.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink-3)', border: '1px dashed #d8d8d0', borderRadius: 10, padding: '10px 12px' }}>Die Symbolliste wird mit den ersten aufbereiteten mab-Sitzungen angelegt.</div>
              : <div style={{ display: 'flex', flexDirection: 'column' }}>{SYMBOLE.map((y) => <div key={y.zeichen} style={{ display: 'grid', gridTemplateColumns: '5.5em minmax(0, 1fr)', gap: 10, padding: '7px 0', borderTop: '1px solid #f0f0eb', fontSize: 13 }}><b style={{ fontSize: 16, color: f[0] }}>{y.zeichen}</b><span>{y.bedeutung}{y.gelesen ? <span style={{ color: 'var(--ink-3)' }}> · gelesen: {y.gelesen}</span> : null}</span></div>)}</div>}</>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={() => setGlossar(null)} style={klein}>Schließen</button></div>
          </div>
        </div>
      )}

      {lf && <Lernfragen titel={lf.titel} liste={lf.liste} stand={stand} farbe={f} onClose={() => setLf(null)} neuLaden={neuLaden} />}
    </>
  );
}

export { nachFach };
