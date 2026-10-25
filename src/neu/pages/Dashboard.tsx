import { useMemo, useState, type CSSProperties } from 'react';
import type { Studienstand, Sitzung, KEintrag } from '../db';
import { aendereSitzung, speichereEintrag } from '../db';
import { kartenAus, istFaellig, kartenOeffnen } from './Karten';
import { useKlapp } from '../klapp';
import { anwesenheitVon, AnwBalken } from './Statistik';
import { lernStandVon } from './Module';
import { sitzungenVon as inhalteVon } from '../lerninhalte';
import { auswerten, heuteIso, noteText, nachFach, BEREICH_ZIEL } from '../pruefungslogik';
import { WOCHEN, FEIERTAGE, FERIEN, parseIso, plusTage } from '../data/kalender';

// Farben wie im Entwurf: Akzent, Fläche, Rand, Knopftext
const HLF: Record<string, [string, string, string, string]> = { mab004: ['#5f80b5', '#eaf1fc', '#dbe6f7', '#3f5f93'], mab005: ['#4f8f80', '#e6f5f0', '#d3ece5', '#2f6f60'], pkb003: ['#b46b80', '#fbebef', '#f5d9e1', '#8a4458'], ewb001: ['#6d9156', '#edf5e5', '#dcebd0', '#4b6c38'], ewb002: ['#b5845a', '#fcf0e4', '#f3e1cf', '#82593a'], pyb005: ['#8a77b5', '#f1edfa', '#e4ddf5', '#5d4b8c'] };
const farbe = (m: string): [string, string] => { const f = HLF[(m || '').slice(0, 6)]; return f ? [f[0], f[1]] : ['#6b6f76', '#f0f0eb']; };
const TAGS: Record<string, [string, string]> = { Frist: ['#fde9e9', '#c42b2b'], Hausaufgabe: ['#fdf1d6', '#8a5a12'], 'To-do': ['#eef0f3', '#4b5563'], Erinnerung: ['#e6f5f0', '#2f6f60'], 'Prüfung': ['#fde9e9', '#c42b2b'], Termin: ['#eef0f3', '#4b5563'] };
const ARTN: Record<string, string> = { hausaufgabe: 'Hausaufgabe', todo: 'To-do', frist: 'Frist', pruefung: 'Prüfung', termin: 'Termin', privat: 'Privat' };
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WTN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const PRIV_BG = 'repeating-linear-gradient(135deg, #eef1f5 0 6px, #e3e8ef 6px 12px)';
const UNIH: [string, string, string][] = [['vorlesungsfreie Zeit (Weihnachten)', '2026-12-21', '2027-01-03'], ['letzter Vorlesungstag', '2027-01-30', '2027-01-30'], ['Vorlesungsbeginn SoSe 27', '2027-04-05', '2027-04-05'], ['Exkursionstage – keine regulären Veranstaltungen', '2027-05-18', '2027-05-22'], ['letzter Vorlesungstag', '2027-07-17', '2027-07-17'], ['Vorlesungsbeginn WiSe 27/28', '2027-10-11', '2027-10-11'], ['vorlesungsfreie Zeit (Weihnachten)', '2027-12-23', '2028-01-09']];
const dm = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.';
const mitWt = (iso: string) => WT[parseIso(iso).getDay()] + ' ' + dm(iso);
const wdMo = (iso: string) => (parseIso(iso).getDay() + 6) % 7;
const fmtZeit = (sek: number) => { const m = Math.round(sek / 60); return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : ''); };
const ART_KURZ: Record<string, string> = { Vorlesung: 'Vorlesung', Seminar: 'Seminar', 'Übung': 'Seminar', Tutorium: 'Tutorium', 'eÜbung': 'eÜbung' };

interface Props { stand: Studienstand; neuLaden: () => Promise<void>; gehe: (seite: string, unter?: string) => void }

export function Dashboard({ stand, neuLaden }: Props) {
  const HEUTE = heuteIso();
  const a = useMemo(() => auswerten(stand), [stand]);
  const [lokalS, setLokalS] = useState<Record<string, Partial<Sitzung>>>({});
  const [lokalE, setLokalE] = useState<Record<string, boolean>>({});
  const [nhModul, setNhModul] = useState<string | null>(null);
  const [nhZeigeErl, setNhZeigeErl] = useKlapp('db-nh-erledigt', false);
  const [ed, setEd] = useState<null | { titel: string; art: string; mod: string; datum: string; zeit: string; bis: string; notiz: string; ganztag: boolean; bisDatum: string; wdh: string; tage: number[]; wdhBis: string; fehler?: string }>(null);
  const [fehler, setFehler] = useState('');
  async function los(f: () => Promise<void>) { setFehler(''); try { await f(); await neuLaden(); } catch (e) { setFehler('Speichern hat nicht geklappt: ' + String((e as Error).message || e)); } }

  const tm = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t]));
  const md = Object.fromEntries(stand.module.map((m) => [m.id, m]));
  const va = Object.fromEntries(stand.veranstaltungen.map((v) => [v.id, v]));
  const sitz = stand.sitzungen.map((s) => ({ ...s, ...(lokalS[s.id] ?? {}) }) as Sitzung);
  const kuerzelVon = (s: Sitzung) => tm[va[s.veranstaltung_id]?.teilmodul_id]?.kuerzel ?? '';

  // ---------- Kopf ----------
  const hd = new Date();
  const datumTitel = WTN[hd.getDay()] + ', ' + hd.getDate() + '. ' + MONN[hd.getMonth()];
  const wi = WOCHEN.indexOf(plusTage(HEUTE, -wdMo(HEUTE)));
  const vlWoche = wi >= 0 ? 'Vorlesungswoche ' + (wi + 1) + ' von ' + WOCHEN.length : 'Vorlesungsfreie Zeit';

  // ---------- Klausuren ----------
  const offenAlle = a.proSemester.flatMap((ps) => ps.liste).filter((e) => !e.imUrsprung && !e.bestanden);
  const zeitVon = (z: string | null) => { const m = /(\d{1,2})/.exec(z ?? ''); return m ? m[1].padStart(2, '0') : '10'; };
  const klausuren = offenAlle.filter((e) => e.naechster?.termin?.datum && e.naechster.termin.datum >= HEUTE)
    .map((e) => ({ e, t: e.naechster!.termin!, versuch: e.naechster!.versuch }))
    .sort((x, y) => x.t.datum!.localeCompare(y.t.datum!) || zeitVon(x.t.zeit).localeCompare(zeitVon(y.t.zeit)));
  const klausurTage: { datum: string; liste: typeof klausuren }[] = [];
  klausuren.forEach((k) => { const g = klausurTage[klausurTage.length - 1]; if (g && g.datum === dm(k.t.datum!)) g.liste.push(k); else klausurTage.push({ datum: dm(k.t.datum!), liste: [k] }); });
  const naechste = klausuren[0]?.t.datum;
  const ersteIn = naechste ? 'nächste in ' + Math.round((parseIso(naechste).getTime() - parseIso(HEUTE).getTime()) / 864e5) + ' Tagen' : 'alle geschrieben';
  const ersteAm = naechste ? 'nächste am ' + dm(naechste) + naechste.slice(0, 4) : 'alle geschrieben';
  const nt = (n: number | null) => (n !== null ? noteText(n) : '–');

  // ---------- Heute ----------
  const hinweise: { text: string; bg: string; fg: string }[] = [];
  if (FEIERTAGE[HEUTE]) hinweise.push({ text: 'Feiertag · ' + FEIERTAGE[HEUTE], bg: '#fff0e5', fg: '#b35c1e' });
  FERIEN.forEach((f) => { if (HEUTE >= f[1] && HEUTE <= f[2]) hinweise.push({ text: 'Ferien · ' + f[0] + (HEUTE === f[2] && f[1] !== f[2] ? ' (letzter Tag)' : HEUTE === f[1] && f[1] !== f[2] ? ' (erster Tag)' : ''), bg: '#f3efe6', fg: '#7a6a4f' }); });
  UNIH.forEach((u) => { if (HEUTE >= u[1] && HEUTE <= u[2]) hinweise.push({ text: 'Uni · ' + u[0], bg: '#e8ecef', fg: '#3f5160' }); });
  if (HEUTE >= '2027-08-30' && HEUTE <= '2027-10-08') hinweise.push({ text: 'ASP · Woche ' + (Math.floor((parseIso(HEUTE).getTime() - parseIso('2027-08-30').getTime()) / (7 * 864e5)) + 1) + ' von 6', bg: '#e3f2e8', fg: '#2f7a4b' });
  const heuteS = sitz.filter((s) => s.datum === HEUTE).map((s) => {
    const k = kuerzelVon(s), f = farbe(k), aus = s.status !== 'findet_statt';
    return { sort: s.von ?? '', zeit: s.von ?? '', label: k + (s.anwesenheit === 'ja' ? ' ✓' : ''), fg: f[0], bg: f[1], titel: va[s.veranstaltung_id]?.kurz ?? '', info: s.status === 'entfaellt' ? 'entfällt – ' + (s.entfall_grund ?? '') : aus ? 'ausgefallen' : 'bis ' + s.bis + ' · ' + (s.raum ?? ''), opazitaet: aus ? 0.5 : 1 };
  });
  const amTag = (e: KEintrag, d: string) => {
    const w = e.wiederholung;
    if (w?.ausnahmen?.includes(d)) return false;
    if (e.art === 'privat' && w?.rhythmus && w.tage?.length) {
      if (d < e.datum || d > (w.bis || '2027-03-31') || !w.tage.includes(wdMo(d))) return false;
      if (w.rhythmus === 'w2') { const n = Math.round((parseIso(plusTage(d, -wdMo(d))).getTime() - parseIso(plusTage(e.datum, -wdMo(e.datum))).getTime()) / (7 * 864e5)); if (n % 2 !== 0) return false; }
      return true;
    }
    return e.datum === d || (e.ganztaegig && !!e.bis_datum && e.datum <= d && e.bis_datum >= d);
  };
  const heuteP = stand.eintraege.filter((e) => e.art === 'privat' && amTag(e, HEUTE)).map((e) => ({ sort: e.zeit ?? '00:00', zeit: e.zeit ?? 'ganzt.', label: 'Privat', fg: '#3d4a5c', bg: PRIV_BG, titel: e.titel, info: e.ganztaegig && e.bis_datum ? 'ganztägig bis ' + dm(e.bis_datum) : e.ende ? 'bis ' + e.ende : e.notiz ?? '', opazitaet: 1 }));
  const heuteListe = [...heuteS, ...heuteP].sort((x, y) => x.sort.localeCompare(y.sort));

  // ---------- Aufgaben & Fristen (offene, plus Erinnerungen aus den Prüfungsfristen) ----------
  const modulVon = (e: KEintrag) => (e.teilmodul_id && tm[e.teilmodul_id]?.kuerzel) || (e.modul_id && md[e.modul_id]?.kuerzel) || '';
  const offeneE = stand.eintraege.filter((e) => e.art !== 'privat' && !(lokalE[e.id] ?? e.erledigt)).map((e) => ({ id: e.id, roh: e as KEintrag | null, tag: ARTN[e.art] ?? 'To-do', iso: e.datum + (e.zeit ?? ''), datum: mitWt(e.datum) + (e.zeit ? ', ' + e.zeit : ''), modul: modulVon(e), titel: e.titel }));
  const erinnerungen = offenAlle.flatMap((e) => e.termine.filter((t) => t.anmeldung_ab && t.anmeldung_ab >= HEUTE && (!t.datum || t.datum >= HEUTE)).map((t) => ({ id: 'er-' + t.id, roh: null, tag: 'Erinnerung', iso: t.anmeldung_ab!, datum: mitWt(t.anmeldung_ab!), modul: e.modul.kuerzel, titel: 'Anmeldung öffnet' + (t.anmeldung_bis ? ' – anmelden bis ' + dm(t.anmeldung_bis) : '') })));
  const aufgaben = [...offeneE, ...erinnerungen].sort((x, y) => x.iso.localeCompare(y.iso)).slice(0, 5);
  const abhaken = (e: KEintrag) => { setLokalE((l) => ({ ...l, [e.id]: true })); los(() => speichereEintrag({ id: e.id, art: e.art, titel: e.titel, datum: e.datum, erledigt: true })); };

  // ---------- Nachholen ----------
  const aktMods = a.aktListe.map((e) => e.modul.kuerzel).filter((k) => HLF[k]).sort((x, y) => nachFach({ kuerzel: x }, { kuerzel: y }));
  const NH: Record<string, { s: Sitzung; k: string; titel: string; zeile: string; kopfArt: string }[]> = Object.fromEntries(aktMods.map((k) => [k, []]));
  sitz.filter((s) => s.status === 'findet_statt' && s.anwesenheit === 'nein').sort((x, y) => (x.datum + kuerzelVon(x)).localeCompare(y.datum + kuerzelVon(y))).forEach((s) => {
    const k = kuerzelVon(s), m = k.slice(0, 6); if (!NH[m]) return;
    const v = va[s.veranstaltung_id], t = tm[v?.teilmodul_id], gr = /\(Gruppe ([A-Z0-9]+)\)/.exec(v?.titel ?? '');
    const art = ART_KURZ[t?.art ?? ''] ?? t?.art ?? '';
    NH[m].push({ s, k, titel: (v?.titel ?? '').replace(/ \(Gruppe [A-Z0-9]+\)/, ''), zeile: art + (gr ? ', Gruppe ' + gr[1] : '') + (s.thema ? ' · ' + s.thema : ''), kopfArt: art });
  });
  const nhGes = Object.values(NH).reduce((x, l) => x + l.length, 0), nhErl = Object.values(NH).reduce((x, l) => x + l.filter((n) => n.s.nachgearbeitet).length, 0);
  const pruefDatum = (k: string) => offenAlle.find((e) => e.modul.kuerzel === k)?.naechster?.termin?.datum ?? '9999';
  const rang = Object.keys(NH).map((k) => ({ k, offen: NH[k].filter((n) => !n.s.nachgearbeitet) })).filter((x) => x.offen.length).sort((x, y) => y.offen.length - x.offen.length || pruefDatum(x.k).localeCompare(pruefDatum(y.k)));
  const top = rang[0], alt = rang[1];

  // ---------- Module ----------
  const pruefText = (k: string, kurz: boolean) => {
    const e = offenAlle.find((x) => x.modul.kuerzel === k);
    if (!e) return 'bestanden';
    const t = e.naechster?.termin, abgabe = t?.art === 'Abgabe' || /Hausarbeit/.test(e.pruefung.form);
    const d = t?.datum ? dm(t.datum) : 'offen', v = e.naechster && e.naechster.versuch > 1 ? ' · ' + e.naechster.versuch + '. Versuch' : '';
    return kurz ? d + v : (abgabe ? 'Abgabe ' : 'Klausur ') + d + v;
  };
  const module = a.aktListe.map((e) => e.modul).filter((m) => HLF[m.kuerzel]).sort(nachFach).map((m) => {
    const p = /Präsentation am (\d\d\.\d\d\.)/.exec(m.hinweis ?? '');
    const n = inhalteVon(m.kuerzel).length, ls = lernStandVon(stand, m.kuerzel, HEUTE);
    const inhalt = (n ? n + (n === 1 ? ' Lerntext' : ' Lerntexte') + ' · gelernt ' + ls.gel + '/' + ls.ges : 'Noch keine Lerninhalte') + (p ? ' · Präsentation ' + p[1] : '');
    return { k: m.kuerzel, name: m.name, inhalt, pct: ls.pct };
  });

  // ---------- Woche ----------
  const wsIso = plusTage(HEUTE, -wdMo(HEUTE));
  const tmK = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t.kuerzel.slice(0, 6)]));
  const lzWoche = stand.lernzeit.filter((l) => l.datum >= wsIso), proM: Record<string, number> = {};
  lzWoche.forEach((l) => { const m = tmK[l.teilmodul_id]; if (m) proM[m] = (proM[m] ?? 0) + l.sekunden; });
  const lzGes = lzWoche.reduce((x, l) => x + l.sekunden, 0), lzHeute = stand.lernzeit.filter((l) => l.datum === HEUTE).reduce((x, l) => x + l.sekunden, 0);
  const topM = Object.keys(proM).sort((x, y) => proM[y] - proM[x]);
  const nichtDran = aktMods.filter((m) => !proM[m]);
  const alleK = kartenAus(stand), faeK = alleK.filter((k) => aktMods.includes(k.mk) && istFaellig(k));
  const wr = { titel: 'Deine Woche · ' + mitWt(wsIso) + ' bis heute', zeit: fmtZeit(lzGes), karten: String(alleK.filter((k) => k.stat.zuletzt && k.stat.zuletzt >= wsIso).length), nachholen: (nhGes - nhErl) + ' offen', meist: topM.length ? 'Am meisten gelernt: ' + topM.slice(0, 2).map((m) => m + ' (' + fmtZeit(proM[m]) + ')').join(', ') : 'Diese Woche noch nichts gelernt.', wenig: nichtDran.length ? 'Noch gar nicht dran: ' + nichtDran.join(', ') : 'Alle Module waren diese Woche dran – stark!' };

  // ---------- Heute lernen ----------
  let hl: { vorschlag: string; kopf: string; kurz: string; unter: string; titel: string; fg: string; bg: string; rand: string; btnBg: string; btnFg: string; knopf: string; altText: string; start: () => void; altStart: () => void };
  if (top) {
    const x0 = top.offen[0], f = HLF[top.k];
    hl = { vorschlag: 'Vorschlag: In ' + top.k + ' ist am meisten nachzuholen – ' + top.offen.length + (top.offen.length === 1 ? ' Sitzung.' : ' Sitzungen.'),
      kopf: x0.k + ' · ' + x0.kopfArt + ' vom ' + dm(x0.s.datum) + (x0.s.thema ? ' · ' + x0.s.thema : ''), kurz: x0.k + ' · ' + x0.kopfArt + ' ' + dm(x0.s.datum), unter: 'am meisten nachzuholen (' + top.offen.length + ')',
      titel: x0.titel, fg: f[0], bg: f[1], rand: f[2], btnBg: f[2], btnFg: f[3], knopf: 'Nachholen starten', altText: alt ? 'oder: ' + alt.k + ' – ' + alt.offen.length + ' offen →' : '',
      start: () => { setNhModul(top.k); setNhZeigeErl(false); }, altStart: () => { if (alt) { setNhModul(alt.k); setNhZeigeErl(false); } } };
  } else {
    const nk = klausuren[0]?.e.modul.kuerzel ?? aktMods[0] ?? '', f = HLF[nk] ?? ['#2f7a4b', '#e3f2e8', '#cfe8d8', '#2f7a4b'];
    hl = { vorschlag: 'Alles nachgeholt – stark! Weiter nach Lernplan: als Nächstes ist ' + nk + ' dran (' + pruefText(nk, false) + ').', kopf: nk + ' · Lernplan', kurz: nk + ' · Lernplan', unter: 'alles nachgeholt – weiter nach Lernplan',
      titel: stand.module.find((m) => m.kuerzel === nk)?.name ?? '', fg: f[0], bg: f[1], rand: f[2], btnBg: f[2], btnFg: f[0], knopf: 'Zum Lernplan', altText: 'Lernplan von ' + nk + ' öffnen →',
      start: () => { window.location.hash = '/module/' + nk; }, altStart: () => { window.location.hash = '/module/' + nk; } };
  }

  // ---------- Eintrag ----------
  const modulOptionen = stand.teilmodule.filter((t) => stand.veranstaltungen.some((v) => v.teilmodul_id === t.id) || t.freiwillig)
    .sort((x, y) => nachFach({ kuerzel: x.kuerzel.slice(0, 6) }, { kuerzel: y.kuerzel.slice(0, 6) }) || (x.kuerzel.includes('.') ? 0 : 1) - (y.kuerzel.includes('.') ? 0 : 1) || x.kuerzel.localeCompare(y.kuerzel))
    .map((t) => ({ wert: t.id, text: t.kuerzel.includes('.') ? t.kuerzel : t.kuerzel + ' · ' + t.art + (t.freiwillig ? ' (freiwillig)' : '') }));
  const oeffneNeu = () => setEd({ titel: '', art: 'hausaufgabe', mod: modulOptionen[0]?.wert ?? '', datum: '', zeit: '', bis: '', notiz: '', ganztag: false, bisDatum: '', wdh: '', tage: [], wdhBis: '' });
  function speichern() {
    const x = ed!; const pv = x.art === 'privat';
    if (!x.titel.trim()) { setEd({ ...x, fehler: 'Bitte einen Titel eingeben.' }); return; }
    if (!x.datum) { setEd({ ...x, fehler: 'Bitte ein Datum wählen.' }); return; }
    if (pv && x.wdh && !x.ganztag && !x.tage.length) { setEd({ ...x, fehler: 'Bitte mindestens einen Wochentag wählen.' }); return; }
    const t = pv ? null : tm[x.mod];
    const daten = { art: x.art, titel: x.titel.trim(), datum: x.datum, zeit: pv && x.ganztag ? null : x.zeit || null, ende: pv && !x.ganztag ? x.bis || null : null, ganztaegig: pv && x.ganztag, bis_datum: pv && x.ganztag && x.bisDatum > x.datum ? x.bisDatum : null,
      wiederholung: pv && !x.ganztag && x.wdh ? { rhythmus: x.wdh, tage: x.tage, bis: x.wdhBis || undefined, ausnahmen: [] } : null, teilmodul_id: t?.id ?? null, modul_id: t?.modul_id ?? null, notiz: x.notiz || null, erledigt: false };
    setEd(null);
    los(() => speichereEintrag(daten));
  }

  // ---------- Stile ----------
  const karte: CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column' };
  const feld: CSSProperties = { minHeight: 44, border: '1px solid var(--line)', borderRadius: 12, padding: '0 12px', fontSize: 15, background: '#fff', boxSizing: 'border-box', width: '100%' };
  const lab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 };
  const knopfG: CSSProperties = { minHeight: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer' };
  const Pfeil = ({ klein }: { klein?: boolean }) => <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}><span aria-hidden="true" style={{ fontSize: klein ? 10 : 11, fontWeight: 800, visibility: 'hidden' }}>00.00.</span><span style={{ display: 'inline-flex', alignItems: 'center', padding: klein ? '3px 0' : '4px 0', fontSize: klein ? 12 : 13, lineHeight: 'normal' }}><span style={{ color: '#b8bcc2', fontWeight: 800 }}>→</span></span></span>;
  const Klausurzeile = ({ klein }: { klein?: boolean }) => (<>
    {klausurTage.map((t) => (
      <span key={t.datum} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: klein ? 5 : 8 }}>
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
          <span style={{ fontSize: klein ? 10 : 11, fontWeight: 800, color: 'var(--ink-3)' }}>{t.datum}</span>
          {t.liste.map((k) => { const f = farbe(k.e.modul.kuerzel); return <span key={k.t.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', padding: klein ? '3px 9px' : '4px 10px', borderRadius: 999, fontSize: klein ? 12 : 13, background: f[1], color: 'var(--ink)' }}><b style={{ color: f[0] }}>{k.e.modul.kuerzel}</b>{k.versuch > 1 ? ' · ' + k.versuch + '. Versuch' : ''}</span>; })}
        </span>
        <Pfeil klein={klein} />
      </span>))}
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}><span aria-hidden="true" style={{ fontSize: klein ? 10 : 11, fontWeight: 800, visibility: 'hidden' }}>00.00.</span><span style={{ display: 'inline-flex', alignItems: 'center', padding: klein ? '3px 9px' : '4px 12px', borderRadius: 999, fontSize: klein ? 12 : 13, fontWeight: 800, background: '#fff', border: '1.5px solid #5aa36f', boxSizing: 'border-box', color: '#2f7a4b' }}>geschafft :-)</span></span>
  </>);
  const AufgabeZeile = ({ x, klein }: { x: typeof aufgaben[number]; klein?: boolean }) => { const tg = TAGS[x.tag] ?? TAGS['To-do'], f = farbe(x.modul); return (
    <label style={{ display: 'flex', gap: klein ? 10 : 12, alignItems: 'flex-start', padding: klein ? '6px 0' : '8px 0', borderBottom: '1px solid var(--line-2)', cursor: x.roh ? 'pointer' : 'default' }}>
      <input type="checkbox" disabled={!x.roh} checked={false} onChange={() => x.roh && abhaken(x.roh)} style={{ width: klein ? 18 : 20, height: klein ? 18 : 20, margin: klein ? '1px 0 0' : '2px 0 0', accentColor: '#4f8f80' }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: klein ? 2 : 3 }}>
        <span style={{ fontWeight: 700, fontSize: klein ? 13 : 14 }}>{x.titel}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: klein ? 11 : 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
          <span style={{ padding: klein ? '0 6px' : '1px 8px', borderRadius: 999, fontWeight: 700, background: tg[0], color: tg[1] }}>{x.tag}</span>
          {x.datum}{x.modul && <> · <b style={{ color: f[0] }}>{x.modul}</b></>}
        </span>
      </span>
    </label>); };
  const NachholKnoepfe = ({ klein }: { klein?: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
      {Object.keys(NH).map((k) => { const f = farbe(k), l = NH[k]; return <button key={k} type="button" onClick={() => { setNhModul(k); setNhZeigeErl(false); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, padding: klein ? '6px 8px' : '5px 8px', border: 0, borderRadius: 10, background: f[1], fontSize: 12, cursor: 'pointer' }}><b style={{ color: f[0] }}>{k}</b><span style={{ color: 'var(--ink-2)' }}>{l.filter((n) => n.s.nachgearbeitet).length}/{l.length}</span></button>; })}
    </div>);
  const nhBreite = (nhGes ? Math.round(nhErl / nhGes * 100) : 0) + '%';
  const klText = { faellig: faeK.length ? faeK.length + (faeK.length === 1 ? ' Karte heute fällig' : ' Karten heute fällig') : 'Heute keine Karten fällig', zeit: 'Lernzeit diese Woche: ' + fmtZeit(lzGes) + ' · heute ' + fmtZeit(lzHeute) };
  const klUeben = faeK.length > 0 && <button type="button" onClick={() => kartenOeffnen({ aktion: 'faellig' })} style={{ flex: '0 0 auto', minHeight: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 13, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>Üben</button>;
  const Wochenkarte = ({ klein }: { klein?: boolean }) => (
    <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: klein ? 14 : 18, padding: klein ? 12 : 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: klein ? 15 : 17, fontWeight: 800 }}>{wr.titel}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {([['Lernzeit', wr.zeit], ['Karten geübt', wr.karten], ['Nachholen', wr.nachholen]] as const).map(([l, w]) => <div key={l} style={{ background: 'var(--paper)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>{l}</span><span style={{ fontSize: 18, fontWeight: 800 }}>{w}</span></div>)}
      </div>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{wr.meist}</span>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{wr.wenig}</span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sonntags als Rückblick – in der App zusätzlich als Benachrichtigung.</span>
    </section>);

  const nhListe = nhModul ? NH[nhModul] ?? [] : [];
  const nhOffen = nhListe.filter((n) => !n.s.nachgearbeitet), nhFertig = nhListe.filter((n) => n.s.nachgearbeitet);
  const nhZeile = (n: typeof nhListe[number], fertig: boolean) => (
    <div key={n.s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
      <input type="checkbox" checked={fertig} onChange={() => { const p = { nachgearbeitet: !fertig }; setLokalS((l) => ({ ...l, [n.s.id]: p })); los(() => aendereSitzung(n.s.id, p)); }} aria-label="nachgearbeitet" style={{ width: 20, height: 20, margin: '2px 0 0', accentColor: '#4f8f80', flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{mitWt(n.s.datum)} · <b style={{ color: farbe(n.k)[0] }}>{n.k}</b> · {n.zeile}</div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, textDecoration: fertig ? 'line-through' : 'none' }}>{n.titel}</div>
      </div>
      <a href={'#/module/' + n.k.slice(0, 6)} style={{ flex: '0 0 auto', padding: '6px 10px', borderRadius: 10, background: 'var(--paper)', fontSize: 12, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Lernstoff →</a>
    </div>);

  return (
    <>
      {fehler && <div className="karte fehler">{fehler}</div>}
      {/* ================= Rechner / Tablet ================= */}
      <div className="nur-gross" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="kopf">
          <div>
            <h1 style={{ margin: 0 }}>{datumTitel}</h1>
            <div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{vlWoche}</div>
          </div>
          <button type="button" onClick={oeffneNeu} style={knopfG}>+ Eintrag</button>
        </header>
        <section aria-label="Klausuren" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, padding: '12px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 16 }}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', marginRight: 6 }}><span aria-hidden="true" style={{ fontSize: 11, fontWeight: 800, visibility: 'hidden' }}>00.00.</span><span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 0', fontSize: 12, lineHeight: 'normal' }}><span style={{ fontWeight: 800, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>KLAUSUREN</span></span><span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{ersteIn}</span></span>
          <Klausurzeile />
        </section>
        <section aria-label="Studienstand" className="db-stand">
          <a href="#/pruefungen/meine" className="db-kachel"><span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>Notenschnitt</span><span className="kachel-wert">{nt(a.noten.gesamt)}</span><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Mathe {nt(a.noten.mathe)} · Politik {nt(a.noten.politik)} · Profil {nt(a.noten.profil)} · Praktika {nt(a.noten.praktika)}</span></a>
          <a href="#/pruefungen/meine" className="db-kachel"><span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>Dieses Semester</span><span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>{a.aktListe.length} Prüfungen</span><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{ersteAm}</span></a>
          <a href="#/pruefungen/meine" className="db-kachel db-cp">
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>Credit Points</span><span style={{ fontSize: 13, color: 'var(--ink-3)' }}><b style={{ color: 'var(--ink)', fontSize: 15 }}>{a.cpGesamt} von 180 CP</b> · noch {180 - a.cpGesamt} offen</span></span>
            <span style={{ display: 'block', height: 8, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', borderRadius: 999, background: '#4f8f80', width: Math.min(100, a.cpGesamt / 1.8) + '%' }} /></span>
            <span style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, fontSize: 12, color: 'var(--ink-2)' }}>{Object.keys(BEREICH_ZIEL).map((b) => <span key={b}><b>{b}</b><br />{a.cpBereich[b] ?? 0} / {BEREICH_ZIEL[b]}</span>)}</span>
          </a>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <section style={{ ...karte, gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Heute</h2>
            {hinweise.map((h) => <div key={h.text} style={{ padding: '8px 12px', borderRadius: 12, fontSize: 13, fontWeight: 800, background: h.bg, color: h.fg }}>{h.text}</div>)}
            {heuteS.length === 0 && <div style={{ padding: 12, borderRadius: 14, background: 'var(--paper)', fontSize: 14, color: 'var(--ink-2)' }}>Heute keine Veranstaltungen – genieß den Tag.</div>}
            {heuteListe.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, background: p.bg, opacity: p.opazitaet }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', width: 48 }}>{p.zeit}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 800, color: p.fg }}>{p.label}</div><div style={{ fontWeight: 700, fontSize: 15 }}>{p.titel}</div><div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{p.info}</div></div>
              </div>))}
          </section>
          <section style={{ ...karte, gap: 10 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Aufgaben &amp; Fristen</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -2 }}>„Erinnerung“ = automatisch aus deinen Prüfungsfristen</div>
            {aufgaben.map((x) => <AufgabeZeile key={x.id} x={x} />)}
            {aufgaben.length === 0 && <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>Nichts offen.</div>}
            <a href="#/kalender" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', textDecoration: 'none', marginTop: 4 }}>Alle im Kalender →</a>
          </section>
          <section style={{ ...karte, gap: 14, border: '1.5px solid ' + hl.rand }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Heute lernen</h2>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{hl.vorschlag}</div>
            <div style={{ background: hl.bg, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: hl.fg }}>{hl.kopf}</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{hl.titel}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Verstehen → Üben → Prüfen</div>
            </div>
            <button type="button" onClick={hl.start} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, border: 0, borderRadius: 999, background: hl.btnBg, color: hl.btnFg, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>{hl.knopf}</button>
            {hl.altText && <button type="button" onClick={hl.altStart} style={{ alignSelf: 'center', padding: '6px 10px', borderRadius: 10, border: 0, background: 'none', color: 'var(--ink-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{hl.altText}</button>}
            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 13, fontWeight: 800 }}>Eigene Karten</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{klText.faellig}</span></span>{klUeben}</div>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{klText.zeit}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 13, fontWeight: 800 }}>Nachholen gesamt</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{nhErl} von {nhGes} erledigt</span></div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: nhBreite, background: '#2f7a4b', borderRadius: 999 }} /></div>
              <NachholKnoepfe />
            </div>
          </section>
        </div>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Meine Module</h2><a href="#/module" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', textDecoration: 'none' }}>Alle →</a></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {module.map((m) => { const f = farbe(m.k); return (
              <a key={m.k} href={'#/module/' + m.k} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 18, background: f[1], textDecoration: 'none', color: 'var(--ink)', minHeight: 128, boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ color: f[0], fontSize: 14 }}>{m.k}</b><span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 700 }}>{pruefText(m.k, false)}</span></div>
                <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25 }}>{m.name}</div>
                <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--ink-2)' }}>{m.inhalt}</div>
                {(() => { const z = anwesenheitVon(stand, m.k); return z.n > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)' }}><span style={{ flex: '0 0 48px' }}><AnwBalken z={z} h={5} /></span><span>Anwesend {z.da}/{z.n}{z.weg ? ' · ' + z.weg + ' gefehlt' : ''}{z.offen ? ' · ' + z.offen + ' ?' : ''}</span></div>; })()}
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.75)', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 999, background: f[0], width: m.pct + '%' }} /></div>
              </a>); })}
          </div>
        </section>
        <Wochenkarte />
      </div>

      {/* ================= Handy ================= */}
      <div className="nur-klein" style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '-8px -2px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 4px' }}>
          <span className="logo-symbol"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1f2328" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7l10-4 10 4-10 4z" /><path d="M6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9" /></svg></span>
          <div><div style={{ fontWeight: 800, fontSize: 17 }}>Lernapp</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.akt?.bezeichnung}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.akt ? a.akt.fachsemester + '. Fachsemester' : ''}</div></div>
        </div>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{datumTitel}</h1><div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{vlWoche}</div></div>
          <button type="button" onClick={oeffneNeu} aria-label="Eintrag hinzufügen" style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', fontWeight: 700, fontSize: 20, cursor: 'pointer' }}>+</button>
        </header>
        <section aria-label="Klausuren" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 5px', alignItems: 'flex-start' }}><Klausurzeile klein /></section>
        <a href="#/pruefungen/meine" aria-label="Studienstand" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, textDecoration: 'none', color: 'var(--ink)' }}>
          {([['Notenschnitt', nt(a.noten.gesamt)], ['Dieses Semester', a.aktListe.length + ' Prüf.'], ['Credit Points', a.cpGesamt + ' / 180']] as const).map(([l, w]) => <span key={l} style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{l}</span><span style={{ fontSize: 17, fontWeight: 800 }}>{w}</span></span>)}
          <span style={{ gridColumn: '1 / -1', display: 'block', height: 6, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', borderRadius: 999, background: '#4f8f80', width: Math.min(100, a.cpGesamt / 1.8) + '%' }} /></span>
        </a>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Heute</h2>
          {hinweise.map((h) => <div key={h.text} style={{ padding: '5px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800, background: h.bg, color: h.fg }}>{h.text}</div>)}
          {heuteS.length === 0 && <div style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--paper)', fontSize: 13, color: 'var(--ink-2)' }}>Heute keine Veranstaltungen – genieß den Tag.</div>}
          {heuteListe.map((p, i) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 10, background: p.bg, fontSize: 13, opacity: p.opazitaet }}><b style={{ width: 40, color: 'var(--ink-2)' }}>{p.zeit}</b><b style={{ color: p.fg }}>{p.label}</b><span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.titel}</span></div>)}
        </section>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Aufgaben &amp; Fristen</h2>
          {aufgaben.map((x) => <AufgabeZeile key={x.id} x={x} klein />)}
        </section>
        <button type="button" onClick={hl.start} style={{ background: '#fff', color: 'var(--ink)', border: '1.5px solid ' + hl.rand, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>HEUTE LERNEN</span><span style={{ fontSize: 14, fontWeight: 800, color: hl.fg }}>{hl.kurz}</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{hl.unter}</span></span>
          <span style={{ flex: '0 0 auto', padding: '8px 14px', borderRadius: 999, background: hl.btnBg, color: hl.btnFg, fontSize: 13, fontWeight: 800 }}>Start</span>
        </button>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 15, fontWeight: 800 }}>Eigene Karten</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{klText.faellig}</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{klText.zeit}</span></span>
          {klUeben}
        </section>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Nachholen</h2><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{nhErl} von {nhGes} erledigt</span></div>
          <div style={{ height: 5, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: nhBreite, background: '#2f7a4b', borderRadius: 999 }} /></div>
          <NachholKnoepfe klein />
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Meine Module</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {module.map((m) => { const f = farbe(m.k); return (
              <a key={m.k} href={'#/module/' + m.k} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 10, borderRadius: 12, background: f[1], textDecoration: 'none', color: 'var(--ink)', minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}><b style={{ color: f[0], fontSize: 13 }}>{m.k}</b><span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 700 }}>{pruefText(m.k, true)}</span></span>
                <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3, hyphens: 'auto', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.name}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{m.inhalt}</span>
                {(() => { const z = anwesenheitVon(stand, m.k); return z.n > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-2)' }}><span style={{ flex: '0 0 28px' }}><AnwBalken z={z} h={4} /></span>da {z.da}/{z.n}</span>; })()}
                <span style={{ display: 'block', height: 5, marginTop: 2, borderRadius: 999, background: 'rgba(255,255,255,0.75)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', borderRadius: 999, background: f[0], width: m.pct + '%' }} /></span>
              </a>); })}
          </div>
        </section>
        <Wochenkarte klein />
      </div>

      {/* ---------- Dialog Nachholen ---------- */}
      {nhModul && (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setNhModul(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Nachholen" className="dialog" style={{ maxWidth: 540, gap: 10, borderRadius: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>NACHHOLEN</div><h2 style={{ margin: '2px 0 0', color: farbe(nhModul)[0] }}>{nhModul} · {stand.module.find((m) => m.kuerzel === nhModul)?.name}</h2></div>
              <span style={{ padding: '4px 10px', borderRadius: 999, background: farbe(nhModul)[1], fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{nhFertig.length} von {nhListe.length} erledigt</span>
            </div>
            <div>{nhOffen.map((n) => nhZeile(n, false))}</div>
            {nhOffen.length === 0 && <div style={{ padding: 14, borderRadius: 12, background: '#e3f2e8', color: '#2f7a4b', fontWeight: 800, textAlign: 'center' }}>Alles nachgeholt – stark!</div>}
            {nhFertig.length > 0 && <button type="button" onClick={() => setNhZeigeErl(!nhZeigeErl)} style={{ alignSelf: 'flex-start', minHeight: 36, padding: '0 10px', border: 0, background: 'transparent', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', cursor: 'pointer' }}>{nhZeigeErl ? 'Erledigte ausblenden' : nhFertig.length + ' erledigte anzeigen'}</button>}
            {nhZeigeErl && <div style={{ opacity: 0.6 }}>{nhFertig.map((n) => nhZeile(n, true))}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={() => setNhModul(null)} style={{ ...knopfG, padding: '0 20px' }}>Schließen</button></div>
          </div>
        </div>
      )}

      {/* ---------- Dialog Eintrag ---------- */}
      {ed && (() => { const x = ed, pv = x.art === 'privat', set = (p: Partial<typeof x>) => setEd({ ...x, ...p }); return (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setEd(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Eintrag hinzufügen" className="dialog" style={{ maxWidth: 480, borderRadius: 20 }}>
            <h2 style={{ fontSize: 20 }}>Eintrag hinzufügen</h2>
            <label style={lab}>Titel<input type="text" value={x.titel} onChange={(ev) => set({ titel: ev.target.value })} placeholder="z. B. Aufgabenblatt 03 bearbeiten" style={feld} autoFocus /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={lab}>Art<select value={x.art} onChange={(ev) => set({ art: ev.target.value })} style={feld}><option value="hausaufgabe">Hausaufgabe</option><option value="todo">To-do</option><option value="frist">Frist</option><option value="termin">Termin</option><option value="privat">Privat</option></select></label>
              {!pv && <label style={lab}>Modul<select value={x.mod} onChange={(ev) => set({ mod: ev.target.value })} style={feld}>{modulOptionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}</select></label>}
              <label style={lab}>Datum<input type="date" value={x.datum} onChange={(ev) => set({ datum: ev.target.value })} style={feld} /></label>
              {!pv && <label style={lab}>Uhrzeit (optional)<input type="time" value={x.zeit} onChange={(ev) => set({ zeit: ev.target.value })} style={feld} /></label>}
            </div>
            {pv && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12, background: 'var(--paper)' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={x.ganztag} onChange={() => set({ ganztag: !x.ganztag })} style={{ width: 18, height: 18, accentColor: '#4f8f80' }} />Ganztägig (z. B. Urlaub, mehrere Tage in Vechta)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {!x.ganztag && <><label style={lab}>Beginn<input type="time" value={x.zeit} onChange={(ev) => set({ zeit: ev.target.value })} style={feld} /></label><label style={lab}>Ende<input type="time" value={x.bis} onChange={(ev) => set({ bis: ev.target.value })} style={feld} /></label></>}
                  {x.ganztag && <label style={{ ...lab, gridColumn: '1 / -1' }}>bis einschließlich (optional)<input type="date" value={x.bisDatum} onChange={(ev) => set({ bisDatum: ev.target.value })} style={feld} /></label>}
                </div>
                {!x.ganztag && <label style={lab}>Wiederholen<select value={x.wdh} onChange={(ev) => set({ wdh: ev.target.value, tage: ev.target.value && !x.tage.length && x.datum ? [wdMo(x.datum)] : x.tage })} style={feld}><option value="">nicht wiederholen</option><option value="w1">jede Woche</option><option value="w2">alle 2 Wochen</option></select></label>}
                {!x.ganztag && x.wdh && <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((n, i) => { const an = x.tage.includes(i); return <button key={n} type="button" onClick={() => set({ tage: an ? x.tage.filter((y) => y !== i) : [...x.tage, i].sort() })} style={{ minHeight: 36, borderRadius: 8, border: '1.5px solid ' + (an ? 'var(--ink)' : 'var(--line)'), background: an ? '#fff' : 'transparent', fontSize: 13, fontWeight: 800, color: an ? 'var(--ink)' : 'var(--ink-3)', cursor: 'pointer' }}>{n}</button>; })}</div>
                  <label style={lab}>bis einschließlich (ohne Datum: Semesterende)<input type="date" value={x.wdhBis} onChange={(ev) => set({ wdhBis: ev.target.value })} style={feld} /></label>
                </>}
              </div>
            )}
            <label style={lab}>Notiz (optional)<textarea value={x.notiz} onChange={(ev) => set({ notiz: ev.target.value })} rows={3} style={{ ...feld, minHeight: 80, padding: '10px 12px', resize: 'vertical' }} /></label>
            {x.fehler && <div style={{ fontSize: 13, color: '#c42b2b' }}>{x.fehler}</div>}
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Der Eintrag erscheint sofort im Kalender und – außer private Termine – unter „Aufgaben &amp; Fristen“. Prüfungen und ihre Termine pflegst du auf der Prüfungsseite.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setEd(null)} style={knopfG}>Abbrechen</button>
              <button type="button" onClick={speichern} style={{ ...knopfG, fontWeight: 800 }}>Speichern</button>
            </div>
          </div>
        </div>); })()}
    </>
  );
}
