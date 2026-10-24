import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Studienstand, Sitzung, KEintrag } from '../db';
import { aendereSitzung, speichereEintrag, loescheEintrag } from '../db';
import { kartenOeffnen } from './Karten';
import { auswerten, heuteIso } from '../pruefungslogik';
import { WOCHEN, FEIERTAGE, FERIEN, UNI, MODUL_NAMEN, parseIso, plusTage, isoVon } from '../data/kalender';

// ---------- Konstanten aus dem Entwurf ----------
const C: Record<string, [string, string]> = { mab004: ['#5f80b5', '#eaf1fc'], mab005: ['#4f8f80', '#e6f5f0'], pkb003: ['#b46b80', '#fbebef'], ewb001: ['#6d9156', '#edf5e5'], ewb002: ['#b5845a', '#fcf0e4'], pyb005: ['#8a77b5', '#f1edfa'] };
const MODS = ['mab004', 'mab005', 'pkb003', 'ewb001', 'ewb002', 'pyb005'];
const ARTEN: Record<string, string> = { hausaufgabe: 'Hausaufgabe', todo: 'To-do', frist: 'Frist', pruefung: 'Prüfung', termin: 'Termin', privat: 'Privat' };
const TAG: Record<string, [string, string]> = { hausaufgabe: ['#fdf1d6', '#8a5a12'], todo: ['#f0f0eb', '#6b6f76'], frist: ['#fde9e9', '#c42b2b'], pruefung: ['#fde9e9', '#c42b2b'], termin: ['#f0f0eb', '#6b6f76'], privat: ['#e3e8ef', '#3d4a5c'] };
const DAYN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TAGNAME = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MON = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const PRIV_BG = 'repeating-linear-gradient(135deg, #eef1f5 0 6px, #e3e8ef 6px 12px)';
const H0 = 6, H1 = 22;

const pad = (n: number) => String(n).padStart(2, '0');
const wd = (s: string) => (parseIso(s).getDay() + 6) % 7;
const montagVon = (s: string) => plusTage(s, -wd(s));
const fmtD = (s: string) => DAYN[wd(s)] + ' ' + s.slice(8, 10) + '.' + s.slice(5, 7) + '.';
const fmtKurz = (s: string) => s.slice(8, 10) + '.' + s.slice(5, 7) + '.';
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const modKey = (m: string) => (MODS.includes((m || '').slice(0, 6)) ? m.slice(0, 6) : '');
const farbe = (m: string): [string, string] => C[modKey(m)] ?? ['#6b6f76', '#f0f0eb'];
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
const lies = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('kal-' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const merke = (k: string, v: unknown) => { try { localStorage.setItem('kal-' + k, JSON.stringify(v)); } catch { /* egal */ } };

/** Eintrag, wie ihn die Seite verwendet (echte Einträge + Prüfungstermine von der Prüfungsseite) */
interface E { id: string; art: string; titel: string; datum: string; zeit: string; bis: string; modul: string; notiz: string; erledigt: boolean; ganztag: boolean; bisDatum: string; wdh: string; tage: number[]; wdhBis: string; ausnahmen: string[]; virtuell?: boolean; versuch?: number; roh?: KEintrag }
interface S { id: string; key: string; datum: string; von: string; bis: string; raum: string; thema: string; modul: string; titel: string; kurz: string; roh: Sitzung }

function startZeit(z: string | null) {
  const m = /(\d{1,2})(?::(\d\d))?\s*(?:–|-|Uhr)/.exec(z ?? '') || /(\d{1,2})(?::(\d\d))?/.exec(z ?? '');
  return m ? pad(+m[1]) + ':' + (m[2] ?? '00') : '';
}

interface Props { stand: Studienstand; neuLaden: () => Promise<void> }

export function Kalender({ stand, neuLaden }: Props) {
  const HEUTE = heuteIso();
  const [woche, setWoche] = useState(montagVon(HEUTE));
  const [tag, setTag] = useState<number | null>(null);
  const [lokalS, setLokalS] = useState<Record<string, Partial<Sitzung>>>({});
  const [lokalE, setLokalE] = useState<Record<string, Partial<KEintrag> | null>>({});
  const [sitzung, setSitzung] = useState<string | null>(null);
  const [pInfo, setPInfo] = useState<E | null>(null);
  const [eintrag, setEintrag] = useState<(E & { _armed?: boolean; _fehler?: string; _klick?: string; _mod?: string }) | null>(null);
  const [foldN, setFoldN] = useState<Record<string, boolean>>(() => lies('foldN', {}));
  const [foldA, setFoldA] = useState<Record<string, boolean>>(() => lies('foldA', {}));
  const [nhKarte, setNhKarte] = useState<boolean>(() => lies('nhKarte', false));
  const [afKarte, setAfKarte] = useState<boolean>(() => lies('afKarte', false));
  const [zeigeErl, setZeigeErl] = useState(false);
  const [zeigeErlN, setZeigeErlN] = useState(false);
  const [haAlle, setHaAlle] = useState(false);
  const [fehler, setFehler] = useState('');
  const [jetzt, setJetzt] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setJetzt(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { merke('foldN', foldN); merke('foldA', foldA); merke('nhKarte', nhKarte); merke('afKarte', afKarte); }, [foldN, foldA, nhKarte, afKarte]);
  // Lokale Änderungen verwerfen, sobald die Datenbank sie bestätigt hat
  useEffect(() => { setLokalS({}); setLokalE({}); }, [stand]);
  const wisch = useRef<{ x: number; y: number } | null>(null);

  const ausw = useMemo(() => auswerten(stand), [stand]);
  const tmById = useMemo(() => Object.fromEntries(stand.teilmodule.map((t) => [t.id, t])), [stand.teilmodule]);
  const modById = useMemo(() => Object.fromEntries(stand.module.map((m) => [m.id, m])), [stand.module]);

  // ---------- Sitzungen ----------
  const SESS: S[] = useMemo(() => {
    const va = Object.fromEntries(stand.veranstaltungen.map((v) => [v.id, v]));
    return stand.sitzungen.map((r0) => {
      const r = { ...r0, ...(lokalS[r0.id] ?? {}) } as Sitzung;
      const v = va[r.veranstaltung_id]; const tm = v && tmById[v.teilmodul_id];
      return { id: r.id, key: (v?.studip_id ?? v?.id ?? '') + '_' + r.datum, datum: r.datum, von: r.von ?? '00:00', bis: r.bis ?? '00:00', raum: r.raum ?? '', thema: r.thema ?? '', modul: tm?.kuerzel ?? '', titel: v?.titel ?? '', kurz: v?.kurz ?? v?.titel ?? '', roh: r };
    });
  }, [stand.sitzungen, stand.veranstaltungen, tmById, lokalS]);
  const att = (s: S) => (s.roh.status !== 'findet_statt' ? 'aus' : s.roh.anwesenheit === 'ja' ? 'da' : s.roh.anwesenheit === 'nein' ? 'weg' : null);
  const isDone = (s: S) => !!s.roh.nachgearbeitet;
  const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();
  const isPast = (s: S) => (s.datum < HEUTE ? true : s.datum > HEUTE ? false : toMin(s.bis) <= jetztMin);
  const ausText = (s: S) => (s.roh.status === 'entfaellt' ? 'entfällt – ' + (s.roh.entfall_grund ?? '') : 'ausgefallen');

  // ---------- Einträge ----------
  const entries: E[] = useMemo(() => {
    const echte: E[] = stand.eintraege.flatMap((r0) => {
      const ov = lokalE[r0.id]; if (ov === null) return [];
      const r = { ...r0, ...(ov ?? {}) } as KEintrag;
      const w = r.wiederholung;
      const modul = (r.teilmodul_id && tmById[r.teilmodul_id]?.kuerzel) || (r.modul_id && modById[r.modul_id]?.kuerzel) || '';
      return [{ id: r.id, art: r.art, titel: r.titel, datum: r.datum, zeit: r.zeit ?? '', bis: r.ende ?? '', modul, notiz: r.notiz ?? '', erledigt: r.erledigt, ganztag: r.ganztaegig, bisDatum: r.bis_datum ?? '', wdh: w?.rhythmus ?? '', tage: w?.tage ?? [], wdhBis: w?.bis ?? '', ausnahmen: w?.ausnahmen ?? [], roh: r }];
    });
    const neu = Object.entries(lokalE).filter(([id, v]) => id.startsWith('neu-') && v).map(([id, v]) => ({ id, art: v!.art!, titel: v!.titel!, datum: v!.datum!, zeit: v!.zeit ?? '', bis: v!.ende ?? '', modul: '', notiz: v!.notiz ?? '', erledigt: false, ganztag: !!v!.ganztaegig, bisDatum: v!.bis_datum ?? '', wdh: '', tage: [], wdhBis: '', ausnahmen: [] }));
    // Prüfungstermine kommen von der Prüfungsseite
    const pr: E[] = ausw.proSemester.flatMap((ps) => ps.liste).filter((e) => !e.imUrsprung && !e.bestanden).flatMap((e) => e.termine.filter((t) => t.datum).map((t) => {
      const form = e.pruefung.form.split(/[ ,(]/)[0] || 'Prüfung';
      const abgabe = t.art === 'Abgabe';
      return { id: 'pt-' + t.id, art: abgabe ? 'frist' : 'pruefung', titel: abgabe ? 'Abgabe ' + form + ' ' + e.modul.kuerzel : form + ' ' + e.modul.kuerzel + ' (' + t.art + ')' + (t.zeit ? ' ' + t.zeit : ''), datum: t.datum!, zeit: startZeit(t.zeit), bis: '', modul: e.modul.kuerzel, notiz: '', erledigt: t.datum! < HEUTE, ganztag: false, bisDatum: '', wdh: '', tage: [], wdhBis: '', ausnahmen: [], virtuell: true };
    }));
    return [...echte, ...neu, ...pr];
  }, [stand.eintraege, lokalE, tmById, modById, ausw, HEUTE]);

  const amTag = (e: E, d: string) => {
    if (e.ausnahmen.includes(d)) return false;
    if (e.art === 'privat' && e.wdh && e.tage.length) {
      const ende = e.wdhBis || '2027-03-31';
      if (d < e.datum || d > ende || !e.tage.includes(wd(d))) return false;
      if (e.wdh === 'w2') { const w0 = Math.round((parseIso(montagVon(d)).getTime() - parseIso(montagVon(e.datum)).getTime()) / (7 * 864e5)); if (w0 % 2 !== 0) return false; }
      return true;
    }
    return e.datum === d;
  };
  const imRaster = (e: E) => e.art === 'privat' && !e.ganztag && !!e.zeit && toMin(e.zeit) >= 360 && toMin(e.zeit) < 1320;

  // ---------- Speichern ----------
  async function los(f: () => Promise<void>) {
    setFehler('');
    try { await f(); await neuLaden(); } catch (e) { setFehler('Speichern hat nicht geklappt: ' + String((e as Error).message || e)); }
  }
  const setMark = (s: S, patch: Partial<Sitzung>) => { setLokalS((x) => ({ ...x, [s.id]: { ...(x[s.id] ?? {}), ...patch } })); los(() => aendereSitzung(s.id, patch)); };
  const umschaltenErledigt = (e: E) => { if (e.virtuell) return; setLokalE((x) => ({ ...x, [e.id]: { ...(x[e.id] ?? {}), erledigt: !e.erledigt } })); los(() => speichereEintrag({ id: e.id, art: e.art, titel: e.titel, datum: e.datum, erledigt: !e.erledigt })); };
  const oeffneEintrag = (e: Partial<E> & { _klick?: string }) => {
    if (e.virtuell || e.art === 'pruefung') { setPInfo(e as E); setSitzung(null); return; }
    setEintrag({ id: '', art: 'hausaufgabe', titel: '', datum: HEUTE, zeit: '', bis: '', modul: '', notiz: '', erledigt: false, ganztag: false, bisDatum: '', wdh: '', tage: [], wdhBis: '', ausnahmen: [], ...e, _armed: false, _fehler: '', _mod: modulWert(e) });
    setSitzung(null);
  };

  // Modul-Auswahl: Teilmodule (z. B. mab004.1) und ganze Module (z. B. asp001)
  const modulOptionen = useMemo(() => {
    const akt = ausw.akt?.id;
    const tms = stand.teilmodule.filter((t) => { const m = modById[t.modul_id]; return m && (m.plan_semester_id === akt || stand.veranstaltungen.some((v) => v.teilmodul_id === t.id)); })
      .sort((a, b) => MODS.indexOf(a.kuerzel.slice(0, 6)) - MODS.indexOf(b.kuerzel.slice(0, 6)) || (a.kuerzel.includes('.') ? 0 : 1) - (b.kuerzel.includes('.') ? 0 : 1) || a.kuerzel.localeCompare(b.kuerzel));
    return tms.map((t) => ({ wert: 't:' + t.id, text: t.kuerzel.includes('.') ? t.kuerzel : t.kuerzel + ' · ' + t.art + (t.freiwillig ? ' (freiwillig)' : '') }));
  }, [stand.teilmodule, stand.veranstaltungen, modById, ausw]);
  function modulWert(e: Partial<E>) {
    const r = e.roh; if (r?.teilmodul_id) return 't:' + r.teilmodul_id; if (r?.modul_id) return 'm:' + r.modul_id;
    if (e.modul) { const t = stand.teilmodule.find((x) => x.kuerzel === e.modul); if (t) return 't:' + t.id; const m = stand.module.find((x) => x.kuerzel === e.modul); if (m) return 'm:' + m.id; }
    return '';
  }

  // ---------- Woche ----------
  const tage = [0, 1, 2, 3, 4, 5, 6].map((i) => plusTage(woche, i));
  const wi = WOCHEN.indexOf(woche), ende = tage[6];
  const wocheTitel = wi >= 0 ? 'Vorlesungswoche ' + (wi + 1) + ' von ' + WOCHEN.length : 'Vorlesungsfrei';
  const ws = parseIso(woche), we = parseIso(ende);
  const wocheDatum = ws.getDate() + '. ' + (ws.getMonth() !== we.getMonth() ? MON[ws.getMonth()] + ' ' : '') + '– ' + we.getDate() + '. ' + MON[we.getMonth()] + ' ' + we.getFullYear();
  const geheWoche = (n: number) => { setWoche(plusTage(woche, 7 * n)); setTag(0); };

  type Chip = { text: string; titel: string; bg: string; fg: string; gewicht: number; deko?: string; opazitaet?: number; oeffne?: () => void };
  const streifen: Chip[][] = tage.map((d, di) => {
    const extra: Chip[] = [];
    if (FEIERTAGE[d]) extra.push({ text: FEIERTAGE[d], titel: 'Feiertag in Niedersachsen: ' + FEIERTAGE[d], bg: '#fff0e5', fg: '#b35c1e', gewicht: 800 });
    if (d >= '2027-08-30' && d <= '2027-10-08') extra.push({ text: d === '2027-08-30' || di === 0 ? 'ASP – Allgemeines Schulpraktikum (bis 08.10.)' : '↳ ASP', titel: 'Praktikumszeit ASP: 30.08.–08.10.2027', bg: '#e3f2e8', fg: '#2f7a4b', gewicht: 800 });
    UNI.filter((u) => d >= u[1] && d <= u[2]).forEach((u) => extra.push({ text: d === u[1] || di === 0 ? 'Uni · ' + u[0] : '↳ Uni · ' + u[0].replace(/ \(.*\)| – .*/, ''), titel: 'Semestertermin Uni Vechta: ' + u[0] + (u[1] !== u[2] ? ' (' + fmtKurz(u[1]) + '–' + fmtKurz(u[2]) + ')' : ''), bg: '#e8ecef', fg: '#3f5160', gewicht: 700 }));
    const fe = FERIEN.find((f) => d >= f[1] && d <= f[2]);
    if (fe) extra.push({ text: d === fe[1] || di === 0 ? 'Ferien · ' + fe[0] : 'Ferien', titel: 'Ferien Niedersachsen: ' + fe[0] + ' (' + fmtKurz(fe[1]) + '–' + fmtKurz(fe[2]) + ')', bg: '#f3efe6', fg: '#7a6a4f', gewicht: 600 });
    const mehr = entries.filter((e) => e.art === 'privat' && e.ganztag && e.bisDatum && e.datum < d && e.bisDatum >= d).map((e) => ({ text: (di === 0 ? '' : '↳ ') + e.titel + (di === 0 ? ' (bis ' + fmtKurz(e.bisDatum) + ')' : ''), titel: 'Privat · ' + e.titel, bg: PRIV_BG, fg: '#3d4a5c', gewicht: 600, oeffne: () => oeffneEintrag(e) }));
    const ch = entries.filter((e) => amTag(e, d) && !imRaster(e) && !e.erledigt).sort((a, b) => a.zeit.localeCompare(b.zeit)).map((e) => {
      const t = TAG[e.art] ?? TAG.todo;
      return { text: (e.ganztag ? '' : e.zeit ? e.zeit + ' ' : '') + e.titel + (e.ganztag && e.bisDatum ? ' (bis ' + fmtKurz(e.bisDatum) + ')' : ''), titel: ARTEN[e.art] + (e.modul ? ' · ' + e.modul : '') + ' · ' + e.titel, bg: e.art === 'privat' ? PRIV_BG : t[0], fg: t[1], gewicht: e.art === 'frist' || e.art === 'pruefung' ? 800 : 600, oeffne: () => oeffneEintrag({ ...e, _klick: d }) };
    });
    return [...extra, ...mehr, ...ch];
  });

  type Ev = { key: string; top: number; hoehe: number; links: string; breite: string; bg: string; fg: string; rand: string; opazitaet: number; modul: string; kurz: string; meta: string; metaLang: string; punkt: boolean; haken: boolean; frage: boolean; deko: string; titel: string; oeffne: () => void };
  const spalten = tage.map((d) => {
    type Roh = { s?: S; p?: E; a: number; b: number; lane?: number; n?: number };
    const evs: Roh[] = [
      ...SESS.filter((s) => s.datum === d).map((s) => ({ s, a: toMin(s.von), b: toMin(s.bis) })),
      ...entries.filter((e) => amTag(e, d) && imRaster(e)).map((e) => { const a = toMin(e.zeit); return { p: e, a, b: e.bis && toMin(e.bis) > a ? Math.min(toMin(e.bis), 1320) : Math.min(a + 60, 1320) }; }),
    ].sort((x, y) => x.a - y.a || y.b - x.b);
    const clusters: Roh[][] = []; let cl: Roh[] = [], cEnd = -1;
    evs.forEach((e) => { if (e.a >= cEnd && cl.length) { clusters.push(cl); cl = []; } cl.push(e); cEnd = Math.max(cEnd, e.b); }); if (cl.length) clusters.push(cl);
    clusters.forEach((c) => { const lanes: number[] = []; c.forEach((e) => { let l = lanes.findIndex((x) => x <= e.a); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = e.b; e.lane = l; }); c.forEach((e) => { e.n = lanes.length; }); });
    const termine: Ev[] = evs.map((e) => {
      const pos = { top: (e.a / 60 - H0) * 60 + 2, links: 'calc(' + (e.lane! / e.n! * 100) + '% + 3px)', breite: 'calc(' + (100 / e.n!) + '% - 6px)' };
      if (e.p) {
        const p = e.p, zt = p.zeit + (p.bis ? '–' + p.bis : '');
        return { key: p.id + d, ...pos, hoehe: Math.max(e.b - e.a - 4, 26), bg: PRIV_BG, fg: '#3d4a5c', rand: 'rgba(61,74,92,0.55)', opazitaet: p.erledigt ? 0.6 : 1, modul: 'Privat', kurz: p.titel, meta: zt, metaLang: zt + (p.notiz ? ' · ' + p.notiz : ''), punkt: false, haken: false, frage: false, deko: 'none', titel: 'Privat · ' + p.titel + ' · ' + zt, oeffne: () => oeffneEintrag({ ...p, _klick: d }) };
      }
      const s = e.s!, a = att(s), done = a === 'weg' && isDone(s), miss = a === 'weg', aus = a === 'aus', f = farbe(s.modul);
      return { key: s.id, ...pos, hoehe: e.b - e.a - 4, bg: f[1], fg: f[0], rand: rgba(f[0], 0.35), opazitaet: aus ? 0.45 : done ? 0.6 : 1, modul: s.modul, kurz: s.kurz,
        meta: aus ? ausText(s) : s.von + '–' + s.bis + (e.n! > 1 ? '' : ' · ' + s.raum), metaLang: aus ? ausText(s) : s.von + '–' + s.bis + ' · ' + s.raum,
        punkt: miss && !done, haken: (miss && done) || a === 'da', frage: a === null && isPast(s), deko: aus ? 'line-through' : 'none',
        titel: s.modul + ' · ' + s.titel + ' · ' + s.von + '–' + s.bis + ' · ' + s.raum + (s.thema ? ' · ' + s.thema : ''), oeffne: () => setSitzung(s.id) };
    });
    const istHeute = d === HEUTE;
    return { termine, istHeute, jetzt: istHeute && jetztMin > H0 * 60 && jetztMin < H1 * 60, jetztTop: (jetztMin / 60 - H0) * 60 };
  });
  const stunden = Array.from({ length: H1 - H0 }, (_, i) => ({ text: H0 + i + ':00', sicht: i === 0 ? 'hidden' : 'visible' })) as { text: string; sicht: 'hidden' | 'visible' }[];

  // Tagesansicht (Handy)
  const hi = tage.indexOf(HEUTE), ti = tag !== null ? tag : hi >= 0 ? hi : 0;
  const geheTag = (n: number) => { const z = ti + n; if (z < 0) { setWoche(plusTage(woche, -7)); setTag(6); } else if (z > 6) { setWoche(plusTage(woche, 7)); setTag(0); } else setTag(z); };
  const td = parseIso(tage[ti]);
  const tagName = TAGNAME[ti] + ', ' + td.getDate() + '. ' + MON[td.getMonth()] + (tage[ti] === HEUTE ? ' · heute' : '');

  // ---------- Klausuren + Hausaufgaben ----------
  const klausuren = ausw.proSemester.flatMap((ps) => ps.liste).filter((e) => !e.imUrsprung && !e.bestanden && e.naechster?.termin?.datum && e.naechster.termin.datum >= HEUTE)
    .map((e) => ({ e, t: e.naechster!.termin!, versuch: e.naechster!.versuch }))
    .sort((a, b) => a.t.datum!.localeCompare(b.t.datum!) || startZeit(a.t.zeit).localeCompare(startZeit(b.t.zeit)));
  const klausurTage: { datum: string; liste: typeof klausuren }[] = [];
  klausuren.forEach((k) => { const g = klausurTage[klausurTage.length - 1]; const dt = fmtKurz(k.t.datum!); if (g && g.datum === dt) g.liste.push(k); else klausurTage.push({ datum: dt, liste: [k] }); });
  const klausurHinweis = klausuren.length ? 'nächste in ' + Math.round((parseIso(klausuren[0].t.datum!).getTime() - parseIso(HEUTE).getTime()) / 864e5) + ' Tagen' : 'Noch keine Termine eingetragen.';
  const haAll = entries.filter((e) => e.art === 'hausaufgabe' && !e.erledigt).sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit));
  const bis7 = plusTage(HEUTE, 7);
  const ha = haAlle ? haAll : haAll.filter((e) => e.datum <= bis7);

  // ---------- Nachholen ----------
  const miss = SESS.filter((s) => att(s) === 'weg').sort((a, b) => (a.datum + a.von).localeCompare(b.datum + b.von));
  const nDone = miss.filter(isDone).length;
  const gr: Record<string, S[]> = {}; miss.forEach((s) => { const k = s.modul.split('.')[0]; (gr[k] = gr[k] || []).push(s); });
  const nhGruppen = Object.keys(gr).sort((a, b) => MODS.indexOf(a) - MODS.indexOf(b)).filter((k) => zeigeErlN || gr[k].filter(isDone).length < gr[k].length);

  // ---------- Aufgaben & Fristen ----------
  const aufgaben = entries.filter((e) => e.art !== 'privat');
  const wEnde = plusTage(montagVon(HEUTE), 6), in4w = plusTage(HEUTE, 28);
  const liste = aufgaben.filter((e) => zeigeErl || !e.erledigt).sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit));
  const BUCK: [string, (e: E) => boolean][] = [['Überfällig', (e) => e.datum < HEUTE && !e.erledigt], ['Diese Woche', (e) => e.datum >= HEUTE && e.datum <= wEnde], ['Nächste 4 Wochen', (e) => e.datum > wEnde && e.datum <= in4w], ['Später', (e) => e.datum > in4w], ['Erledigt', (e) => e.erledigt && e.datum < HEUTE]];
  const STANDARD: Record<string, boolean> = { 'Später': false, 'Erledigt': false };

  // ---------- Dialog-Daten ----------
  const ss = sitzung ? SESS.find((x) => x.id === sitzung) ?? null : null;

  function speichern() {
    const x = eintrag!; const privat = x.art === 'privat';
    if (!x.titel.trim()) { setEintrag({ ...x, _fehler: 'Bitte einen Titel eingeben.' }); return; }
    if (!x.datum) { setEintrag({ ...x, _fehler: 'Bitte ein Datum wählen.' }); return; }
    if (privat && x.wdh && !x.ganztag && !x.tage.length) { setEintrag({ ...x, _fehler: 'Bitte mindestens einen Wochentag wählen.' }); return; }
    if (privat && x.ganztag && x.bisDatum && x.bisDatum < x.datum) { setEintrag({ ...x, _fehler: 'Das Enddatum liegt vor dem Startdatum.' }); return; }
    const mw = privat ? '' : x._mod ?? '';
    const tId = mw.startsWith('t:') ? mw.slice(2) : null;
    const mId = mw.startsWith('m:') ? mw.slice(2) : tId ? tmById[tId]?.modul_id ?? null : null;
    const daten: Partial<KEintrag> & { art: string; titel: string; datum: string } = {
      ...(x.id ? { id: x.id } : {}), art: x.art, titel: x.titel.trim(), datum: x.datum,
      zeit: privat && x.ganztag ? null : x.zeit || null, ende: privat && !x.ganztag ? x.bis || null : null,
      ganztaegig: privat && x.ganztag, bis_datum: privat && x.ganztag && x.bisDatum > x.datum ? x.bisDatum : null,
      wiederholung: privat && !x.ganztag && x.wdh ? { rhythmus: x.wdh, tage: x.tage, bis: x.wdhBis || undefined, ausnahmen: x.ausnahmen } : x.ausnahmen.length ? { rhythmus: '', tage: [], ausnahmen: x.ausnahmen } : null,
      modul_id: mId, teilmodul_id: tId, notiz: x.notiz || null, erledigt: x.erledigt,
    };
    if (x.id) setLokalE((l) => ({ ...l, [x.id]: daten })); else setLokalE((l) => ({ ...l, ['neu-' + Date.now()]: daten }));
    setEintrag(null);
    los(() => speichereEintrag(daten));
  }

  // ---------- Stile ----------
  const rundKnopf: CSSProperties = { width: 40, height: 40, border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 18, color: 'var(--ink)', cursor: 'pointer' };
  const knopf: CSSProperties = { minHeight: 40, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 14, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
  const feld: CSSProperties = { border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 8, padding: 8, fontSize: 15, color: 'var(--ink)' };
  const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-3)', fontWeight: 800 };
  const toggle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', fontSize: 14, color: 'var(--ink)', cursor: 'pointer' };
  const gruppenKopf: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 34, padding: '0 4px', border: 0, background: 'transparent', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--ink-3)', cursor: 'pointer' };

  const EvKnopf = ({ ev, gross }: { ev: Ev; gross?: boolean }) => ev.hoehe < 58 ? (
    // Kurze Termine (unter einer Stunde): Kürzel und Titel in einer Zeile, darunter die Zeit – sonst würde der Text abgeschnitten
    <button type="button" onClick={ev.oeffne} title={ev.titel} style={{ position: 'absolute', top: ev.top, height: ev.hoehe, left: ev.links, width: ev.breite, boxSizing: 'border-box', border: 0, borderRadius: 8, padding: ev.hoehe < 36 ? '2px 8px' : '4px 8px', textAlign: 'left', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, fontSize: gross ? 13 : 12, lineHeight: 1.2, cursor: 'pointer', color: 'var(--ink)', background: ev.bg, boxShadow: 'inset 3px 0 0 ' + ev.rand, opacity: ev.opazitaet }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: ev.deko }}>{ev.modul !== 'Privat' && <b style={{ fontSize: 11, color: ev.fg, marginRight: 5 }}>{ev.modul}</b>}<b>{ev.kurz}</b></span>
      {ev.hoehe >= 36 && <span style={{ color: 'var(--ink-3)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gross ? ev.metaLang : ev.meta}</span>}
    </button>
  ) : (
    <button type="button" onClick={ev.oeffne} title={ev.titel} style={{ position: 'absolute', top: ev.top, height: ev.hoehe, left: ev.links, width: ev.breite, boxSizing: 'border-box', border: 0, borderRadius: 8, padding: '6px 8px', textAlign: 'left', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, fontSize: gross ? 13 : 12, lineHeight: 1.25, cursor: 'pointer', color: 'var(--ink)', background: ev.bg, boxShadow: 'inset 3px 0 0 ' + ev.rand, opacity: ev.opazitaet }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, color: ev.fg }}>{ev.modul}
        {ev.punkt && <span title="noch nachholen" style={{ width: 7, height: 7, borderRadius: '50%', background: '#e07a88', flex: 'none' }} />}
        {ev.haken && <span title="erledigt" style={{ fontSize: 12, lineHeight: 1 }}>✓</span>}
        {ev.frage && <span title="Anwesenheit noch nicht angegeben" style={{ display: 'inline-grid', placeItems: 'center', width: 15, height: 15, borderRadius: '50%', background: '#fff', color: 'var(--ink-3)', fontSize: 10, fontWeight: 800, boxShadow: '0 0 0 1px var(--line)' }}>?</span>}
      </span>
      {gross
        ? <span style={{ textDecoration: ev.deko, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.kurz}</span>
        : <span style={{ textDecoration: ev.deko, fontWeight: 800, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', hyphens: 'auto', overflowWrap: 'break-word' }}>{ev.kurz}</span>}
      <span style={{ color: 'var(--ink-3)', fontSize: gross ? 12 : 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gross ? ev.metaLang : ev.meta}</span>
    </button>
  );
  const ChipKnopf = ({ c, gross }: { c: Chip; gross?: boolean }) => (
    <button type="button" onClick={c.oeffne} title={c.titel} style={{ border: 0, borderRadius: 6, padding: gross ? '5px 8px' : '3px 7px', fontSize: gross ? 13 : 12, textAlign: 'left', lineHeight: 1.25, width: '100%', whiteSpace: gross ? undefined : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: c.oeffne ? 'pointer' : 'default', background: c.bg, color: c.fg, fontWeight: c.gewicht, textDecoration: c.deko ?? 'none', opacity: c.opazitaet ?? 1 }}>{c.text}</button>
  );
  const Raster = { backgroundImage: 'linear-gradient(#f0f0eb 1px, transparent 1px)', backgroundSize: '100% 60px' };

  return (
    <div className="kal">
      <header className="kopf kal-kopf" style={{ alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>{wocheTitel}</h1>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{wocheDatum}</div>
        </div>
        <div className="kal-nav" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => geheWoche(-1)} aria-label="Vorige Woche" style={rundKnopf}>‹</button>
          <button type="button" onClick={() => { setWoche(montagVon(HEUTE)); setTag(null); }} style={knopf}>Heute</button>
          <button type="button" onClick={() => geheWoche(1)} aria-label="Nächste Woche" style={rundKnopf}>›</button>
          <button type="button" onClick={() => oeffneEintrag({})} className="neu-knopf" style={{ ...knopf, padding: '0 16px', fontWeight: 800 }}>+ Eintrag</button>
        </div>
      </header>
      {fehler && <div className="karte fehler">{fehler}</div>}

      <section className="zeilen" style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '14px 16px', alignItems: 'center', padding: '12px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 16 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignSelf: 'start', paddingTop: klausurTage.length ? 22 : 0 }}><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>KLAUSUREN</span><span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{klausurHinweis}</span></span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'flex-start' }}>
          {klausurTage.map((t) => (
            <span key={t.datum} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)' }}>{t.datum}</span>
                {t.liste.map((k) => { const f = farbe(k.e.modul.kuerzel); const ev = entries.find((x) => x.id === 'pt-' + k.t.id);
                  return <button key={k.t.id} type="button" onClick={() => { setWoche(montagVon(k.t.datum!)); if (ev) oeffneEintrag(ev); }} title={ev?.titel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 999, padding: '4px 11px', fontSize: 13, background: f[1], color: 'var(--ink)', cursor: 'pointer' }}><b style={{ color: f[0] }}>{k.e.modul.kuerzel}</b>{k.versuch > 1 ? ' · ' + k.versuch + '. Versuch' : ''}</button>; })}
              </span>
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}><span aria-hidden="true" style={{ fontSize: 11, fontWeight: 800, visibility: 'hidden' }}>00.00.</span><span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 0', fontSize: 13 }}><span style={{ color: '#b8bcc2', fontWeight: 800 }}>→</span></span></span>
            </span>
          ))}
          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>{klausurTage.length > 0 && <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 800, visibility: 'hidden' }}>00.00.</span>}<span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 11px', borderRadius: 999, fontSize: 13, fontWeight: 800, background: '#fff', border: '1.5px solid #5aa36f', boxSizing: 'border-box', color: '#2f7a4b' }}>geschafft :-)</span></span>
        </div>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>HAUSAUFGABEN</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>nächste 7 Tage</span></span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
          {ha.map((e) => { const f = farbe(e.modul), spaet = e.datum < HEUTE; return (
            <button key={e.id} type="button" onClick={() => oeffneEintrag(e)} title={e.titel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 999, padding: '4px 11px', fontSize: 13, background: f[1], color: 'var(--ink)', cursor: 'pointer', maxWidth: '100%' }}>
              <span style={{ color: spaet ? '#c42b2b' : 'var(--ink)', fontWeight: spaet ? 800 : 400 }}>{fmtKurz(e.datum)}</span> <b style={{ color: f[0] }}>{modKey(e.modul)}</b> <span style={{ maxWidth: '24ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.titel}</span>
            </button>); })}
          {ha.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{haAll.length ? 'In den nächsten 7 Tagen nichts fällig.' : 'Keine offenen Hausaufgaben.'}</span>}
          {!haAlle && haAll.length > ha.length && <button type="button" onClick={() => setHaAlle(true)} style={{ border: '1px dashed #d8d8d0', borderRadius: 999, padding: '4px 11px', background: '#fff', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', cursor: 'pointer' }}>+ {haAll.length - ha.length} später</button>}
          {haAlle && haAll.some((e) => e.datum > bis7) && <button type="button" onClick={() => setHaAlle(false)} style={{ border: 0, background: 'none', padding: '4px 6px', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', textDecoration: 'underline', cursor: 'pointer' }}>nur nächste 7 Tage</button>}
        </div>
      </section>

      {/* Handy: Tagesansicht */}
      <section className="woche-klein" style={{ flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
          {tage.map((d, i) => { const akt = i === ti; return (
            <button key={d} type="button" onClick={() => setTag(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '6px 0', borderRadius: 12, cursor: 'pointer', background: akt ? '#fff' : 'transparent', border: akt ? '1.5px solid var(--ink)' : '1.5px solid transparent', color: 'var(--ink)' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: d === HEUTE ? '#e5484d' : 'var(--ink-3)' }}>{DAYN[i].toUpperCase()}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{parseIso(d).getDate()}</span>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: SESS.some((s) => s.datum === d) ? '#b8bcc2' : 'transparent' }} />
            </button>); })}
        </div>
        <div onTouchStart={(ev) => { wisch.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }; }} onTouchEnd={(ev) => { const w = wisch.current; if (!w) return; const dx = ev.changedTouches[0].clientX - w.x, dy = ev.changedTouches[0].clientY - w.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) geheTag(dx < 0 ? 1 : -1); }} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
            <button type="button" onClick={() => geheTag(-1)} aria-label="Voriger Tag" style={{ ...rundKnopf, width: 32, height: 32, fontSize: 16 }}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{tagName}</span>
            <button type="button" onClick={() => geheTag(1)} aria-label="Nächster Tag" style={{ ...rundKnopf, width: 32, height: 32, fontSize: 16 }}>›</button>
          </div>
          {streifen[ti].length > 0 && <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 4 }}>{streifen[ti].map((c, i) => <ChipKnopf key={i} c={c} gross />)}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', paddingTop: 10 }}>
            <div>{stunden.map((s) => <div key={s.text} style={{ height: 60, fontSize: 11, color: 'var(--ink-3)', textAlign: 'right', paddingRight: 6, transform: 'translateY(-0.65em)', visibility: s.sicht }}>{s.text}</div>)}</div>
            <div style={{ position: 'relative', height: (H1 - H0) * 60, borderLeft: '1px solid #f0f0eb', ...Raster }}>
              {spalten[ti].termine.map((ev) => <EvKnopf key={ev.key} ev={ev} gross />)}
              {spalten[ti].jetzt && <div style={{ position: 'absolute', left: 0, right: 0, top: spalten[ti].jetztTop, height: 2, background: '#e5484d', zIndex: 3 }} />}
              {spalten[ti].termine.length === 0 && <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', fontSize: 14, color: 'var(--ink-3)' }}>Keine Veranstaltungen an diesem Tag.</div>}
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="woche-gross" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflowX: 'auto' }}>
          <div style={{ minWidth: 900, display: 'grid', gridTemplateColumns: '52px repeat(5, minmax(0, 1fr)) repeat(2, minmax(0, 0.8fr))' }}>
            <div />
            {tage.map((d, i) => { const h = d === HEUTE; return (
              <div key={d} style={{ padding: '10px 10px 8px', borderLeft: '1px solid #f0f0eb', display: 'flex', alignItems: 'baseline', gap: 6, background: h ? '#fffaf0' : i > 4 ? '#fafaf7' : 'transparent' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 800, letterSpacing: '0.05em' }}>{DAYN[i].toUpperCase()}</span>
                <span style={{ fontSize: 13, fontWeight: 800, padding: '0 8px', borderRadius: 999, background: h ? 'var(--ink)' : 'transparent', color: h ? '#fff' : 'var(--ink)' }}>{parseIso(d).getDate()}</span>
              </div>); })}
            <div style={{ borderBottom: '1px solid var(--line)' }} />
            {tage.map((d, i) => (
              <div key={d} style={{ borderLeft: '1px solid #f0f0eb', borderBottom: '1px solid var(--line)', padding: '0 6px 8px', display: 'flex', flexDirection: 'column', gap: 3, minHeight: 12, minWidth: 0, background: d === HEUTE ? '#fffaf0' : 'transparent' }}>
                {streifen[i].map((c, j) => <ChipKnopf key={j} c={c} />)}
              </div>))}
            <div>{stunden.map((s) => <div key={s.text} style={{ height: 60, fontSize: 11, color: 'var(--ink-3)', textAlign: 'right', paddingRight: 8, transform: 'translateY(-0.65em)', visibility: s.sicht }}>{s.text}</div>)}</div>
            {spalten.map((col, i) => (
              <div key={tage[i]} style={{ position: 'relative', height: (H1 - H0) * 60, borderLeft: '1px solid #f0f0eb', backgroundColor: col.istHeute ? '#fffaf0' : 'transparent', ...Raster }}>
                {col.termine.map((ev) => <EvKnopf key={ev.key} ev={ev} />)}
                {col.jetzt && <div style={{ position: 'absolute', left: 0, right: 0, top: col.jetztTop, height: 2, background: '#e5484d', zIndex: 3 }} />}
              </div>))}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, color: 'var(--ink-3)' }}>
          {MODS.map((m) => <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 14, borderRadius: 3, display: 'inline-block', background: C[m][1], boxShadow: 'inset 0 0 0 1.5px ' + rgba(C[m][0], 0.45) }} /><b style={{ color: 'var(--ink)' }}>{m}</b> {MODUL_NAMEN[m]}</span>)}
          {([['Privat', PRIV_BG, 'rgba(61,74,92,0.45)'], ['Feiertag', '#fff0e5', 'rgba(179,92,30,0.4)'], ['Ferien', '#f3efe6', 'rgba(122,106,79,0.4)'], ['Uni-Termin', '#e8ecef', 'rgba(63,81,96,0.4)'], ['Praktikum', '#e3f2e8', 'rgba(47,122,75,0.4)']] as const).map(([n, bg, r]) => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 14, borderRadius: 3, display: 'inline-block', background: bg, boxShadow: 'inset 0 0 0 1.5px ' + r }} /><b style={{ color: 'var(--ink)' }}>{n}</b></span>)}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', background: '#e07a88' }} />noch nachholen</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 14, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: '#fff', boxShadow: '0 0 0 1px var(--line)', fontStyle: 'normal', fontSize: 10, fontWeight: 800 }}>?</i>Anwesenheit noch nicht angegeben</span>
        </div>
      </section>

      <div className="listen" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20, alignItems: 'start' }}>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <button type="button" onClick={() => setNhKarte(!nhKarte)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, border: 0, background: 'transparent', padding: 0, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}><span style={{ display: 'inline-block', width: '1.1em', color: 'var(--ink-3)' }}>{nhKarte ? '▾' : '▸'}</span>Nachholen</h2>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{nDone} von {miss.length} erledigt</span>
          </button>
          {nhKarte && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, background: '#2f7a4b', width: (miss.length ? Math.round(nDone / miss.length * 100) : 0) + '%' }} /></div>
              {nhGruppen.map((k) => { const arr = gr[k], dn = arr.filter(isDone).length, offen = k in foldN ? foldN[k] : dn < arr.length; return (
                <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => setFoldN({ ...foldN, [k]: !offen })} style={gruppenKopf}><span><span style={{ display: 'inline-block', width: '1em' }}>{offen ? '▾' : '▸'}</span><span style={{ color: farbe(k)[0] }}>{k}</span></span><span>{dn}/{arr.length}</span></button>
                  {offen && <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {arr.filter((s) => zeigeErlN || !isDone(s)).map((s) => { const dd = isDone(s); return (
                      <label key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 4px', borderRadius: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={dd} onChange={() => setMark(s, { nachgearbeitet: !dd })} aria-label="nachgearbeitet" style={{ width: 18, height: 18, margin: '2px 0 0', accentColor: '#4f8f80', flex: 'none' }} />
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 14, textDecoration: dd ? 'line-through' : 'none', color: dd ? 'var(--ink-3)' : 'var(--ink)' }}>
                          <span><span style={{ display: 'inline-block', minWidth: '4.8em', color: 'var(--ink-3)' }}>{fmtD(s.datum)}</span>{s.modul} · {s.kurz.replace(/ · .*/, '')}</span>
                          {s.thema && <small style={{ color: 'var(--ink-3)', fontSize: 12 }}>{s.thema}</small>}
                        </span>
                      </label>); })}
                  </div>}
                </div>); })}
              {miss.length > 0 && nhGruppen.length === 0 && <div style={{ fontSize: 14, color: 'var(--ink-3)', padding: '6px 4px' }}>Alles nachgeholt.</div>}
              {miss.length === 0 && <div style={{ fontSize: 14, color: 'var(--ink-3)', padding: '6px 4px' }}>Nichts nachzuholen.</div>}
              {nDone > 0 && <button type="button" onClick={() => setZeigeErlN(!zeigeErlN)} className="kal-textknopf">{zeigeErlN ? 'Erledigte ausblenden' : nDone === 1 ? '1 erledigte anzeigen' : nDone + ' erledigte anzeigen'}</button>}
            </div>
          )}
        </section>

        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <button type="button" onClick={() => setAfKarte(!afKarte)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, border: 0, background: 'transparent', padding: 0, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}><span style={{ display: 'inline-block', width: '1.1em', color: 'var(--ink-3)' }}>{afKarte ? '▾' : '▸'}</span>Aufgaben &amp; Fristen</h2>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{aufgaben.filter((e) => !e.erledigt).length} offen</span>
          </button>
          {afKarte && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BUCK.map(([name, f]) => { const arr = liste.filter(f); if (!arr.length) return null; const offen = name in foldA ? foldA[name] : STANDARD[name] !== false; return (
                <div key={name} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => setFoldA({ ...foldA, [name]: !offen })} style={{ ...gruppenKopf, color: name === 'Überfällig' ? '#c42b2b' : 'var(--ink-3)' }}><span><span style={{ display: 'inline-block', width: '1em' }}>{offen ? '▾' : '▸'}</span>{name.toUpperCase()}</span><span style={{ color: 'var(--ink-3)' }}>{arr.length}</span></button>
                  {offen && <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {arr.map((e) => { const t = TAG[e.art] ?? TAG.todo; return (
                      <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 4px', borderRadius: 8 }}>
                        <input type="checkbox" checked={e.erledigt} disabled={e.virtuell} title={e.virtuell ? 'Prüfungstermine pflegst du auf der Prüfungsseite' : undefined} onChange={() => umschaltenErledigt(e)} aria-label="erledigt" style={{ width: 18, height: 18, margin: '2px 0 0', accentColor: '#4f8f80', flex: 'none', visibility: e.virtuell ? 'hidden' : 'visible' }} />
                        <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button type="button" onClick={() => oeffneEintrag(e)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', fontSize: 14, fontWeight: 800, color: e.erledigt ? 'var(--ink-3)' : 'var(--ink)', textDecoration: e.erledigt ? 'line-through' : 'none', cursor: 'pointer' }}>{e.titel}</button>
                          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}><span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 4, marginRight: 4, background: t[0], color: t[1] }}>{ARTEN[e.art]}</span>{fmtD(e.datum)}{e.zeit ? ' ' + e.zeit : ''}{e.modul ? ' · ' + e.modul : ''}</span>
                        </span>
                      </div>); })}
                  </div>}
                </div>); })}
              <button type="button" onClick={() => setZeigeErl(!zeigeErl)} className="kal-textknopf">{zeigeErl ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}</button>
            </div>
          )}
        </section>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Termine aus Stud.IP, Stand 23.10.2026. Häkchen und eigene Einträge werden in der App gespeichert.</div>

      {/* ---------- Dialog Sitzung ---------- */}
      {ss && (() => { const a = att(ss), f = farbe(ss.modul); const seg = (an: boolean): CSSProperties => ({ flex: 1, border: 0, borderRadius: 8, padding: '9px 10px', fontWeight: 800, cursor: 'pointer', background: an ? '#fff' : 'transparent', boxShadow: an ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }); return (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setSitzung(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Sitzung" className="dialog" style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: f[0] }}>{ss.modul}</div>
            <h2 style={{ margin: '-6px 0 0' }}>{ss.titel}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14 }}>
              <span style={{ color: 'var(--ink-3)' }}>Termin</span><span>{fmtD(ss.datum)}, {ss.von}–{ss.bis} Uhr</span>
              <span style={{ color: 'var(--ink-3)' }}>Raum</span><span>{ss.raum}</span>
              <span style={{ color: 'var(--ink-3)', alignSelf: 'center' }}>Thema</span>
              <input type="text" defaultValue={ss.thema} key={ss.id} onBlur={(ev) => { if (ev.target.value !== ss.thema) setMark(ss, { thema: ev.target.value || null }); }} placeholder="Thema eintragen …" style={{ ...feld, padding: '6px 8px', fontSize: 14, minWidth: 0 }} />
            </div>
            {ss.roh.status === 'entfaellt' && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Entfällt: {ss.roh.entfall_grund}</div>}
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 800 }}>Warst du da?</div>
            <div style={{ display: 'flex', background: 'var(--paper)', borderRadius: 10, padding: 3, gap: 3 }}>
              <button type="button" onClick={() => setMark(ss, { anwesenheit: 'ja', status: ss.roh.status === 'ausgefallen' ? 'findet_statt' : ss.roh.status })} style={{ ...seg(a === 'da'), color: a === 'da' ? 'var(--ink)' : 'var(--ink-3)' }}>Anwesend</button>
              <button type="button" onClick={() => setMark(ss, { anwesenheit: 'nein', status: ss.roh.status === 'ausgefallen' ? 'findet_statt' : ss.roh.status })} style={{ ...seg(a === 'weg'), color: a === 'weg' ? '#e07a88' : 'var(--ink-3)' }}>Nicht anwesend</button>
              <button type="button" onClick={() => setMark(ss, { status: 'ausgefallen', anwesenheit: 'offen' })} style={{ ...seg(a === 'aus'), color: a === 'aus' ? 'var(--ink)' : 'var(--ink-3)' }}>Ausgefallen</button>
            </div>
            {a === 'weg' && <label style={toggle}><input type="checkbox" checked={isDone(ss)} onChange={() => setMark(ss, { nachgearbeitet: !isDone(ss) })} style={{ width: 18, height: 18, accentColor: '#4f8f80' }} />Nachgearbeitet (steht unter „Nachholen“)</label>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <a href={'#/module/' + ss.modul.slice(0, 6)} style={{ ...knopf, marginRight: 'auto' }}>Lernstoff →</a>
              <button type="button" onClick={() => kartenOeffnen({ aktion: 'neu', modul: ss.modul.slice(0, 6), teil: ss.modul, sitzung: ss.roh.id })} style={knopf}>+ Karte</button>
              <button type="button" onClick={() => oeffneEintrag({ datum: ss.datum, art: 'hausaufgabe', modul: ss.modul })} style={knopf}>Hausaufgabe anlegen</button>
              <button type="button" onClick={() => setSitzung(null)} style={{ ...knopf, fontWeight: 800 }}>Schließen</button>
            </div>
          </div>
        </div>); })()}

      {/* ---------- Dialog Prüfungstermin ---------- */}
      {pInfo && (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setPInfo(null); }}>
          <div role="dialog" aria-label="Prüfungstermin" className="dialog" style={{ maxWidth: 440, gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: farbe(pInfo.modul)[0] }}>{pInfo.modul.slice(0, 6)} · Prüfungstermin</div>
            <h2 style={{ margin: 0 }}>{pInfo.titel}</h2>
            <div style={{ fontSize: 15 }}>{fmtD(pInfo.datum)}{pInfo.datum.slice(0, 4)}{pInfo.zeit ? ', ' + pInfo.zeit + ' Uhr' : ''}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Prüfungstermine, Anmelde- und Abmeldefristen pflegst du nur auf der Prüfungsseite – Kalender und Dashboard übernehmen sie automatisch.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <a href="#/pruefungen/meine" style={knopf}>Auf der Prüfungsseite ändern →</a>
              <button type="button" onClick={() => setPInfo(null)} style={knopf}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Dialog Eintrag ---------- */}
      {eintrag && (() => { const x = eintrag, privat = x.art === 'privat', gzt = privat && x.ganztag, set = (p: Partial<typeof x>) => setEintrag({ ...x, ...p }); return (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setEintrag(null); }}>
          <div role="dialog" aria-label="Eintrag" className="dialog" style={{ maxWidth: 460 }}>
            <h2>{x.id ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={{ ...label, gridColumn: '1 / -1' }}>Titel<input type="text" value={x.titel} onChange={(ev) => set({ titel: ev.target.value })} placeholder="z. B. Übungsblatt 2 bearbeiten" style={feld} autoFocus /></label>
              <label style={label}>Art
                <select value={x.art} onChange={(ev) => set({ art: ev.target.value })} style={feld}>
                  <option value="hausaufgabe">Hausaufgabe</option><option value="todo">To-do</option><option value="frist">Frist</option><option value="termin">Termin</option><option value="privat">Privat</option>
                </select>
              </label>
              {!privat && <label style={label}>Modul
                <select value={x._mod ?? ''} onChange={(ev) => set({ _mod: ev.target.value })} style={feld}>
                  <option value="">–</option>
                  {modulOptionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
                  {x._mod?.startsWith('m:') && !modulOptionen.some((o) => o.wert === x._mod) && <option value={x._mod}>{modById[x._mod.slice(2)]?.kuerzel}</option>}
                </select>
              </label>}
              <label style={label}>Datum<input type="date" value={x.datum} onChange={(ev) => set({ datum: ev.target.value })} style={feld} /></label>
              {privat && <label style={{ ...toggle, gridColumn: '1 / -1' }}><input type="checkbox" checked={x.ganztag} onChange={() => set({ ganztag: !x.ganztag })} style={{ width: 18, height: 18, accentColor: '#4f8f80' }} />Ganztägig (z. B. Urlaub, mehrere Tage in Vechta)</label>}
              {privat && !gzt && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--paper)' }}>
                  <label style={label}>Wiederholen
                    <select value={x.wdh} onChange={(ev) => set({ wdh: ev.target.value, tage: ev.target.value && !x.tage.length && x.datum ? [wd(x.datum)] : x.tage })} style={{ ...feld, background: '#fff' }}>
                      <option value="">nicht wiederholen</option><option value="w1">jede Woche</option><option value="w2">alle 2 Wochen</option>
                    </select>
                  </label>
                  {x.wdh && <>
                    <div style={label}>an diesen Tagen
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                        {DAYN.map((n, i) => { const an = x.tage.includes(i); return <button key={n} type="button" onClick={() => set({ tage: an ? x.tage.filter((y) => y !== i) : [...x.tage, i].sort() })} style={{ minHeight: 36, borderRadius: 8, border: '1.5px solid ' + (an ? 'var(--ink)' : 'var(--line)'), background: an ? '#fff' : 'transparent', fontSize: 13, fontWeight: 800, color: an ? 'var(--ink)' : 'var(--ink-3)', cursor: 'pointer' }}>{n}</button>; })}
                      </div>
                    </div>
                    <label style={label}>bis einschließlich<input type="date" value={x.wdhBis} onChange={(ev) => set({ wdhBis: ev.target.value })} style={{ ...feld, background: '#fff' }} /></label>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Ohne Enddatum läuft die Wiederholung bis Semesterende (31.03.2027). Ein Tipp auf einen Termin öffnet die ganze Serie.</span>
                  </>}
                </div>
              )}
              {!gzt && <label style={label}>{privat ? 'Beginn' : 'Uhrzeit (optional)'}<input type="time" value={x.zeit} onChange={(ev) => set({ zeit: ev.target.value })} style={feld} /></label>}
              {privat && !gzt && <label style={label}>Ende<input type="time" value={x.bis} onChange={(ev) => set({ bis: ev.target.value })} style={feld} /></label>}
              {gzt && <label style={label}>bis einschließlich (optional)<input type="date" value={x.bisDatum} onChange={(ev) => set({ bisDatum: ev.target.value })} style={feld} /></label>}
              <label style={{ ...label, gridColumn: '1 / -1' }}>Notiz<textarea value={x.notiz} onChange={(ev) => set({ notiz: ev.target.value })} rows={3} style={{ ...feld, resize: 'vertical' }} /></label>
              {x.id && <label style={{ ...toggle, gridColumn: '1 / -1' }}><input type="checkbox" checked={x.erledigt} onChange={() => set({ erledigt: !x.erledigt })} style={{ width: 18, height: 18, accentColor: '#4f8f80' }} />Erledigt</label>}
            </div>
            {x._fehler && <div style={{ fontSize: 13, color: '#c42b2b' }}>{x._fehler}</div>}
            {x.id && privat && x.wdh && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', fontSize: 13 }}>
                {x._klick && <button type="button" onClick={() => { const n = { ...x, ausnahmen: [...x.ausnahmen, x._klick!] }; setEintrag(n); }} style={{ ...knopf, alignSelf: 'flex-start', minHeight: 36, padding: '0 12px', fontSize: 13 }}>Nur diesen Termin auslassen ({fmtD(x._klick)})</button>}
                {x.ausnahmen.length > 0 && <span style={{ color: 'var(--ink-3)' }}>Ausgelassen: {x.ausnahmen.slice().sort().map(fmtD).join(', ')} · <button type="button" onClick={() => set({ ausnahmen: [] })} style={{ border: 0, background: 'none', padding: 0, fontSize: 13, color: 'var(--ink-3)', textDecoration: 'underline', cursor: 'pointer' }}>alle wiederherstellen</button></span>}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {x.id && <button type="button" onClick={() => { if (!x._armed) { set({ _armed: true }); return; } setLokalE((l) => ({ ...l, [x.id]: null })); setEintrag(null); los(() => loescheEintrag(x.id)); }} style={{ ...knopf, color: '#c42b2b', marginRight: 'auto' }}>{x._armed ? 'Wirklich löschen?' : 'Löschen'}</button>}
              <button type="button" onClick={() => setEintrag(null)} style={knopf}>Abbrechen</button>
              <button type="button" onClick={speichern} style={{ ...knopf, fontWeight: 800 }}>Speichern</button>
            </div>
          </div>
        </div>); })()}
    </div>
  );
}

export { isoVon };
