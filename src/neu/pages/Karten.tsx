import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import type { Studienstand, Karte, KarteNeu } from '../db';
import { speichereKarte, speichereKarten, karteAusblenden, kartenVerschieben, speichereAntwort, antwortenZuruecksetzen, bildHochladen, bildUrl, speichereLernzeit, lernzeitZuruecksetzen } from '../db';
import { heuteIso, aktuellesSemester } from '../pruefungslogik';
import { parseIso, plusTage } from '../data/kalender';
import { gradeAnswer } from '../../lib/api';

// ---------- Konstanten aus dem Entwurf ----------
const C: Record<string, [string, string]> = { mab004: ['#5f80b5', '#eaf1fc'], mab005: ['#4f8f80', '#e6f5f0'], pkb003: ['#b46b80', '#fbebef'], ewb001: ['#6d9156', '#edf5e5'], ewb002: ['#b5845a', '#fcf0e4'], pyb005: ['#8a77b5', '#f1edfa'] };
const FACH: Record<string, [string, string]> = { mab: ['#8195b8', '#eef1f6'], pkb: ['#a98592', '#f6eff1'], x: ['#8a9683', '#f0f3ee'] };
const FORM: Record<string, string> = { frage: 'Frage → Antwort', mc: 'Multiple Choice', offen: 'Offene Aufgabe (KI)', luecke: 'Lückentext', zuordnung: 'Zuordnung' };
const FKURZ: Record<string, string> = { frage: 'Frage', mc: 'Multiple Choice', offen: 'Offen · KI', luecke: 'Lückentext', zuordnung: 'Zuordnung' };
const STAND: Record<string, [string, string, string]> = { neu: ['neu', '#f0f0eb', '#6b6f76'], unsicher: ['unsicher', '#fff3e0', '#a3580b'], sicher: ['sicher', '#e3f2e8', '#2f7a4b'] };
const STUFEN = [1, 3, 7, 14, 30, 60];
const KF: [string, string][] = [['#eaf1fc', '#3f5f93'], ['#fcf0e4', '#82593a'], ['#e6f5f0', '#2f6f60'], ['#f1edfa', '#5d4b8c'], ['#fbebef', '#8a4458']];
const SYM: [string, string][] = [['²', 'hoch 2'], ['³', 'hoch 3'], ['ⁿ', 'hoch n'], ['√', 'Wurzel'], ['∛', 'dritte Wurzel'], ['π', 'Pi'], ['∞', 'unendlich'], ['±', 'plus/minus'], ['·', 'mal'], ['÷', 'geteilt'], ['≠', 'ungleich'], ['≈', 'ungefähr'], ['≤', 'kleiner gleich'], ['≥', 'größer gleich'], ['∑', 'Summe'], ['∏', 'Produkt'], ['∫', 'Integral'], ['∈', 'Element von'], ['∉', 'nicht Element'], ['⊂', 'Teilmenge'], ['⊆', 'Teilmenge oder gleich'], ['∪', 'Vereinigung'], ['∩', 'Schnitt'], ['∅', 'leere Menge'], ['ℕ', 'natürliche Zahlen'], ['ℤ', 'ganze Zahlen'], ['ℚ', 'rationale Zahlen'], ['ℝ', 'reelle Zahlen'], ['→', 'Pfeil'], ['⇒', 'daraus folgt'], ['⇔', 'genau dann'], ['∀', 'für alle'], ['∃', 'es gibt'], ['¬', 'nicht'], ['∧', 'und'], ['∨', 'oder'], ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['Δ', 'Delta'], ['μ', 'mü'], ['σ', 'sigma'], ['₁', 'Index 1'], ['₂', 'Index 2'], ['ₙ', 'Index n'], ['½', 'ein halb'], ['°', 'Grad'], ['∠', 'Winkel'], ['⊥', 'senkrecht'], ['∥', 'parallel'], ['△', 'Dreieck'], ['≅', 'kongruent'], ['∼', 'ähnlich']];
const MODNAME: Record<string, string> = { mab004: 'Mathematik in den digitalen Medien', mab005: 'Wahrscheinlichkeitsrechnung', pkb003: 'Systemanalyse', ewb001: 'Grundlagen und Grundbegriffe der Erziehungswissenschaften', ewb002: 'Methoden der empirischen Bildungsforschung', pyb005: 'Grundlagen der Pädagogischen Psychologie für Bildung und Erziehung' };
const WTK = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const fmtS = (iso: string) => { const d = parseIso(iso); return WTK[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'; };
const tageZw = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 864e5);
const fmtZeit = (sek: number) => { const m = Math.round(sek / 60); return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : ''); };
const verdeckt = (t: string) => t.replace(/\[\[(.+?)\]\]/g, '_____');
const offenT = (t: string) => t.replace(/\[\[(.+?)\]\]/g, '$1');
const norm = (s: string) => String(s || '').toLowerCase().replace(/[.,;:!?„“"'()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
const lies = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('kar-' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const merke = (k: string, v: unknown) => { try { localStorage.setItem('kar-' + k, JSON.stringify(v)); } catch { /* egal */ } };
const neueId = () => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? 'neu-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Von anderen Seiten aus: Karten-Seite öffnen und üben / neue Karte anlegen. */
export function kartenOeffnen(z: { aktion: 'ueben' | 'neu' | 'faellig'; modul?: string; teil?: string; sitzung?: string }) {
  try { sessionStorage.setItem('karten-oeffnen', JSON.stringify(z)); } catch { /* egal */ }
  window.location.hash = '/karten/aktuell';
}

function naechste(stufe: number, erg: 'r' | 't' | 'f') {
  const h = heuteIso();
  if (erg === 'r') { const s2 = Math.min(stufe + 1, STUFEN.length); return { stufe: s2, faellig: plusTage(h, STUFEN[s2 - 1]) }; }
  if (erg === 't') return { stufe: Math.max(stufe - 1, 0), faellig: plusTage(h, 1) };
  return { stufe: 0, faellig: plusTage(h, 1) };
}

/** Karte, wie die Seite sie verwendet */
export interface K { id: string; teilId: string | null; teil: string; modulId: string | null; mk: string; sitzungId: string | null; format: string; vorne: string; hinten: string; optionen: string[]; richtig: number[]; kategorien: string[]; elemente: { text: string; kat: number | null }[]; bild: string | null; stand: string; stufe: number; faellig: string | null; stat: { r: number; t: number; f: number; zuletzt: string } }

export function kartenAus(stand: Studienstand, lokalW: Record<string, { stand: string; stufe: number; faellig: string }> = {}, lokalA: { ref: string; erg: string }[] = []): K[] {
  const tm = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t]));
  const md = Object.fromEntries(stand.module.map((m) => [m.id, m]));
  const wd = Object.fromEntries(stand.wiederholung.map((w) => [w.frage_ref, w]));
  const st: Record<string, { r: number; t: number; f: number; zuletzt: string }> = {};
  stand.antworten.forEach((a) => { const s = (st[a.frage_ref] ??= { r: 0, t: 0, f: 0, zuletzt: '' }); s[a.ergebnis === 'richtig' ? 'r' : a.ergebnis === 'teilweise' ? 't' : 'f']++; const z = a.zeitpunkt.slice(0, 10); if (z > s.zuletzt) s.zuletzt = z; });
  lokalA.forEach((a) => { const s = (st[a.ref] ??= { r: 0, t: 0, f: 0, zuletzt: '' }); s[a.erg as 'r']++; s.zuletzt = heuteIso(); });
  return stand.karten.map((k: Karte) => {
    const ref = 'karte:' + k.id, w = lokalW[k.id] ?? wd[ref], t = k.teilmodul_id ? tm[k.teilmodul_id] : null, m = k.modul_id ? md[k.modul_id] : null;
    const teil = t?.kuerzel ?? m?.kuerzel ?? '';
    return { id: k.id, teilId: k.teilmodul_id, teil, modulId: k.modul_id ?? t?.modul_id ?? null, mk: (teil || '').slice(0, 6), sitzungId: k.sitzung_id, format: k.format, vorne: k.inhalt.vorne ?? '', hinten: k.inhalt.hinten ?? '', optionen: k.inhalt.optionen ?? ['', '', '', ''], richtig: k.inhalt.richtig ?? [0], kategorien: k.inhalt.kategorien ?? ['', ''], elemente: k.inhalt.elemente ?? [], bild: k.bild_pfad, stand: w?.stand ?? 'neu', stufe: w?.stufe ?? 0, faellig: w?.faellig ?? null, stat: st[ref] ?? { r: 0, t: 0, f: 0, zuletzt: '' } };
  });
}
export const istFaellig = (k: { faellig: string | null }) => !k.faellig || k.faellig <= heuteIso();
function wdhText(k: K) { const h = heuteIso(); if (!k.faellig) return 'neu · heute fällig'; if (k.faellig < h) { const n = tageZw(k.faellig, h); return 'überfällig seit ' + n + (n === 1 ? ' Tag' : ' Tagen'); } if (k.faellig === h) return 'heute fällig'; const n = tageZw(h, k.faellig); return n === 1 ? 'morgen fällig' : 'fällig in ' + n + ' Tagen'; }

interface Props { stand: Studienstand; unter: string; gehe: (u: string) => void; neuLaden: () => Promise<void> }
type Dlg = { id: string; teilId: string | null; sitzungId: string | null; format: string; vorne: string; hinten: string; optionen: string[]; richtig: number[]; kategorien: string[]; elemente: { text: string; kat: number | null }[]; bild: string | null; bildNeu?: Blob | null; bildVorschau?: string; feld: 'vorne' | 'hinten'; armed?: boolean; fehler?: string; kopie?: boolean };
type U = { ids: string[]; i: number; auf: boolean; wahl: number[]; eingabe: string; sicher: number; unsicher: number; zu: Record<number, number>; sel: number | null; luecken: Record<number, string>; profi: boolean };

export function Karten({ stand, unter, gehe, neuLaden }: Props) {
  const HEUTE = heuteIso();
  const tab = unter === 'statistik' || unter === 'archiv' ? unter : 'aktuell';
  const akt = aktuellesSemester(stand.semester);
  const [modul, setModul] = useState('alle');
  const [sitzFilter, setSitzFilter] = useState<string[]>([]);
  const [modus, setModus] = useState<string>(() => lies('modus', 'anfaenger'));
  const [dialog, setDialog] = useState<Dlg | null>(null);
  const [ueben, setUeben] = useState<U | null>(null);
  const [io, setIo] = useState<null | { tab: string; teilId: string | null; sitzungId: string | null; text: string }>(null);
  const [vs, setVs] = useState<null | { teilId: string | null; sitzungId: string | null }>(null);
  const [am, setAm] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [selArm, setSelArm] = useState(false);
  const [grpOffen, setGrpOffen] = useState<Record<string, boolean>>({});
  const [statOffen, setStatOffen] = useState<Record<string, boolean>>({});
  const [statSort, setStatSort] = useState('schwach'), [statFil, setStatFil] = useState('alle'), [statSuche, setStatSuche] = useState(''), [statZahl, setStatZahl] = useState(20);
  const [resetArm, setResetArm] = useState<string | null>(null);
  const [lokalW, setLokalW] = useState<Record<string, { stand: string; stufe: number; faellig: string }>>({});
  const [lokalA, setLokalA] = useState<{ ref: string; erg: string }[]>([]);
  const [fehler, setFehler] = useState('');
  const [bilder, setBilder] = useState<Record<string, string>>({});
  const [ki, setKi] = useState<null | { id: string; lade: boolean; pct?: number; fb?: string; fehler?: string }>(null);
  useEffect(() => { merke('modus', modus); }, [modus]);
  useEffect(() => { setLokalW({}); setLokalA([]); }, [stand]);
  async function los(f: () => Promise<void>) { setFehler(''); try { await f(); await neuLaden(); } catch (e) { setFehler('Speichern hat nicht geklappt: ' + String((e as Error).message || e)); } }

  const tm = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t]));
  const va = Object.fromEntries(stand.veranstaltungen.map((v) => [v.id, v]));
  const aktMods = useMemo(() => stand.module.filter((m) => m.plan_semester_id === akt?.id && C[m.kuerzel]).map((m) => m.kuerzel).sort((a, b) => Object.keys(C).indexOf(a) - Object.keys(C).indexOf(b)), [stand.module, akt]);
  const alle = useMemo(() => kartenAus(stand, lokalW, lokalA), [stand, lokalW, lokalA]);
  const farbeT = (teil: string): [string, string] => C[teil.slice(0, 6)] ?? FACH[teil.slice(0, 3)] ?? FACH.x;
  const istAktK = (k: K) => aktMods.includes(k.mk);
  const ersterTeil = (m: string) => stand.teilmodule.filter((t) => t.kuerzel.startsWith(m)).sort((a, b) => (a.kuerzel.includes('.') ? 0 : 1) - (b.kuerzel.includes('.') ? 0 : 1) || a.kuerzel.localeCompare(b.kuerzel))[0]?.id;

  // Sitzungen je Teilmodul
  const sitzungen = useMemo(() => stand.sitzungen.filter((s) => s.status !== 'entfaellt').map((s) => { const v = va[s.veranstaltung_id]; return { s, v, tid: v?.teilmodul_id ?? '', teil: tm[v?.teilmodul_id ?? '']?.kuerzel ?? '' }; }).sort((a, b) => (a.s.datum + (a.s.von ?? '')).localeCompare(b.s.datum + (b.s.von ?? ''))), [stand.sitzungen, va, tm]);
  const sitzVon = (tid: string | null) => sitzungen.filter((x) => x.tid === tid);
  const sitzLabel = (sid: string | null) => { const x = sitzungen.find((y) => y.s.id === sid); if (!x) return ''; const arr = sitzungen.filter((y) => y.v?.id === x.v?.id); return 'Sitzung ' + (arr.indexOf(x) + 1) + ' · ' + fmtS(x.s.datum); };

  // Öffnen von anderen Seiten (Modul, Lerntext, Dashboard, Kalender)
  useEffect(() => {
    let z: { aktion: string; modul?: string; teil?: string; sitzung?: string } | null = null;
    try { const v = sessionStorage.getItem('karten-oeffnen'); if (v) { sessionStorage.removeItem('karten-oeffnen'); z = JSON.parse(v); } } catch { /* egal */ }
    if (!z) return;
    if (z.aktion === 'faellig') { const fk = alle.filter((k) => istAktK(k) && istFaellig(k)).sort((a, b) => (a.faellig ?? HEUTE).localeCompare(b.faellig ?? HEUTE)); if (fk.length) starten(fk); return; }
    if (z.modul) setModul(z.modul);
    const sid = z.sitzung ? stand.sitzungen.find((s) => s.id === z!.sitzung)?.id ?? null : null;
    if (z.aktion === 'neu') {
      const tid = (z.teil && stand.teilmodule.find((t) => t.kuerzel === z!.teil)?.id) || (sid && va[stand.sitzungen.find((s) => s.id === sid)!.veranstaltung_id]?.teilmodul_id) || ersterTeil(z!.modul ?? '') || null;
      neuDialog(tid, sid); return;
    }
    if (sid) setSitzFilter([sid]);
    const ks = alle.filter((k) => k.mk === z!.modul && (!sid || k.sitzungId === sid));
    if (ks.length) starten(ordneUnsicher(ks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Auswahl ----------
  const imTab = alle.filter((k) => (tab === 'archiv' ? !istAktK(k) : istAktK(k)));
  let mods: string[] = []; imTab.forEach((k) => { if (!mods.includes(k.mk)) mods.push(k.mk); });
  if (tab !== 'archiv') mods = aktMods.slice();
  const auswahl = modul === 'alle' || !mods.includes(modul) ? 'alle' : modul;
  const imModul = imTab.filter((k) => auswahl === 'alle' || k.mk === auswahl);
  const SF = auswahl === 'alle' ? [] : sitzFilter.filter((x) => imModul.some((k) => (k.sitzungId ?? '') === x));
  const liste = SF.length ? imModul.filter((k) => SF.includes(k.sitzungId ?? '')) : imModul;
  const ordneUnsicher = (ks: K[]) => ks.slice().sort((a, b) => (a.stand === 'unsicher' ? 0 : a.stand === 'neu' ? 1 : 2) - (b.stand === 'unsicher' ? 0 : b.stand === 'neu' ? 1 : 2));
  function starten(arr: K[]) { if (!arr.length) return; setUeben({ ids: arr.map((k) => k.id), i: 0, auf: false, wahl: [], eingabe: '', sicher: 0, unsicher: 0, zu: {}, sel: null, luecken: {}, profi: modus === 'profi' }); }
  const faellig = liste.filter(istFaellig).sort((a, b) => (a.faellig ?? HEUTE).localeCompare(b.faellig ?? HEUTE)), unsicher = liste.filter((k) => k.stand === 'unsicher');
  const spaeter = liste.filter((k) => !istFaellig(k)).sort((a, b) => (a.faellig ?? '').localeCompare(b.faellig ?? ''));
  const naechsteF = spaeter.length ? wdhText(spaeter[0]).replace(' fällig', '').replace('fällig ', '') : '';

  // ---------- Dialog Karte ----------
  function neuDialog(teilId?: string | null, sitzungId?: string | null) {
    const t0 = teilId ?? (auswahl !== 'alle' ? ersterTeil(auswahl) : stand.teilmodule.find((t) => t.kuerzel === 'ewb001.1')?.id) ?? null;
    setDialog({ id: '', teilId: t0, sitzungId: sitzungId ?? null, format: 'frage', vorne: '', hinten: '', optionen: ['', '', '', ''], richtig: [0], kategorien: ['', ''], elemente: [{ text: '', kat: null }, { text: '', kat: null }], bild: null, feld: 'vorne' });
  }
  function bearbeiten(k: K) {
    if (am) { const s2 = { ...sel }; if (s2[k.id]) delete s2[k.id]; else s2[k.id] = true; setSel(s2); setSelArm(false); return; }
    setDialog({ id: k.id, teilId: k.teilId, sitzungId: k.sitzungId, format: k.format, vorne: k.vorne, hinten: k.hinten, optionen: k.optionen.slice(), richtig: k.richtig.slice(), kategorien: k.kategorien.slice(), elemente: k.elemente.map((e) => ({ ...e })), bild: k.bild, feld: 'vorne' });
  }
  useEffect(() => { const p = dialog?.bild; if (p && !bilder[p]) bildUrl(p).then((u) => setBilder((b) => ({ ...b, [p]: u }))); }, [dialog?.bild, bilder]);
  function bildWaehlen(file: File) {
    const rd = new FileReader();
    rd.onload = () => { const url = String(rd.result), img = new Image();
      img.onload = () => { const m = 1200, s = Math.min(1, m / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s); cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); cv.toBlob((b) => setDialog((d) => d && { ...d, bildNeu: b, bildVorschau: cv.toDataURL('image/jpeg', 0.85) }), 'image/jpeg', 0.85); };
      img.src = url; };
    rd.readAsDataURL(file);
  }
  function dialogSpeichern() {
    const x = dialog!, fehl = (m: string) => setDialog({ ...x, fehler: m });
    if (!x.vorne.trim()) return fehl('Bitte die Vorderseite ausfüllen.');
    if (x.format === 'luecke' && !/\[\[.+?\]\]/.test(x.vorne)) return fehl('Bitte mindestens eine Lücke mit [[…]] markieren.');
    if (x.format === 'mc' && x.optionen.filter((o) => o.trim()).length < 2) return fehl('Bitte mindestens zwei Antwortmöglichkeiten eintragen.');
    if (x.format === 'mc' && !x.richtig.length) return fehl('Bitte mindestens eine richtige Antwort markieren.');
    if (x.format === 'mc' && x.richtig.some((r) => !x.optionen[r]?.trim())) return fehl('Eine als richtig markierte Antwort ist leer.');
    if (x.format === 'zuordnung') { if (x.kategorien.filter((k) => k.trim()).length < 2) return fehl('Bitte mindestens zwei Kategorien benennen.'); const el = x.elemente.filter((e) => e.text.trim()); if (el.length < 2) return fehl('Bitte mindestens zwei Elemente eintragen.'); if (el.some((e) => e.kat === null || e.kat === undefined)) return fehl('Bitte jedem Element eine Kategorie zuordnen.'); }
    const id = x.id || neueId();
    const t = x.teilId ? tm[x.teilId] : null;
    setDialog(null);
    los(async () => {
      let pfad = x.bild;
      if (x.bildNeu) pfad = await bildHochladen(id, x.bildNeu);
      const k: KarteNeu = { id: x.id || (id.startsWith('neu-') ? undefined : id), modul_id: t?.modul_id ?? null, teilmodul_id: x.teilId, sitzung_id: x.sitzungId, format: x.format, bild_pfad: pfad ?? null,
        inhalt: { vorne: x.vorne.trim(), hinten: x.hinten || '', optionen: x.optionen, richtig: x.richtig, kategorien: x.kategorien, elemente: x.elemente.filter((e) => e.text.trim()) } };
      if (!x.id && !id.startsWith('neu-')) await speichereKarte({ ...k, id }); else await speichereKarte(k);
    });
  }

  // ---------- Üben ----------
  const kOf = (id: string) => alle.find((k) => k.id === id);
  const lzBasis = useRef<Record<string, number>>({}); const aktiv = useRef(Date.now()); const lzZ = useRef<{ tid: string; sek: number } | null>(null);
  useEffect(() => { const auf = () => { aktiv.current = Date.now(); }; const ev = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel']; ev.forEach((e) => document.addEventListener(e, auf, { passive: true, capture: true })); return () => ev.forEach((e) => document.removeEventListener(e, auf, { capture: true })); }, []);
  const lzFlush = () => { const z = lzZ.current; if (!z || z.sek < 5) return; const key = HEUTE + '|' + z.tid; const basis = lzBasis.current[key] ?? (stand.lernzeit.find((l) => l.datum === HEUTE && l.teilmodul_id === z.tid && l.art === 'karten')?.sekunden ?? 0); const neu = basis + z.sek; lzBasis.current[key] = neu; lzZ.current = { tid: z.tid, sek: 0 }; speichereLernzeit({ datum: HEUTE, teilmodul_id: z.tid, art: 'karten', sekunden: neu }).catch(() => {}); };
  const aktKarte = ueben && ueben.i < ueben.ids.length ? kOf(ueben.ids[ueben.i]) : undefined;
  useEffect(() => {
    if (!ueben || !aktKarte?.teilId) return;
    if (lzZ.current && lzZ.current.tid !== aktKarte.teilId) lzFlush();
    if (!lzZ.current || lzZ.current.tid !== aktKarte.teilId) lzZ.current = { tid: aktKarte.teilId, sek: 0 };
    const t = setInterval(() => { if (document.visibilityState !== 'hidden' && Date.now() - aktiv.current < 60000 && lzZ.current) lzZ.current.sek += 5; }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ueben?.i, !!ueben, aktKarte?.teilId]);
  const uebenBeenden = () => { lzFlush(); lzZ.current = null; setUeben(null); neuLaden(); };
  function weiter(k: K, standNeu: string, erg?: 'r' | 't' | 'f') {
    const e = erg ?? (standNeu === 'sicher' ? 'r' : 'f'); const n = naechste(k.stufe, e);
    setLokalW((w) => ({ ...w, [k.id]: { stand: standNeu, ...n } })); setLokalA((a) => [...a, { ref: 'karte:' + k.id, erg: e }]);
    speichereAntwort({ frage_ref: 'karte:' + k.id, modul_id: k.modulId, teilmodul_id: k.teilId, ergebnis: e === 'r' ? 'richtig' : e === 't' ? 'teilweise' : 'falsch', modus: ueben!.profi ? 'profi' : 'anfaenger' }, { stand: standNeu, ...n }).catch((x) => setFehler('Speichern hat nicht geklappt: ' + String((x as Error).message || x)));
    setUeben((u) => u && { ...u, i: u.i + 1, auf: false, wahl: [], eingabe: '', zu: {}, sel: null, luecken: {}, [standNeu]: (u[standNeu as 'sicher'] || 0) + 1 });
  }
  useEffect(() => { const p = aktKarte?.bild; if (p && !bilder[p]) bildUrl(p).then((u) => setBilder((b) => ({ ...b, [p]: u }))); }, [aktKarte?.bild, bilder]);

  // Bewertung der aktuellen Karte
  const bew = (() => {
    if (!ueben || !aktKarte) return null;
    const k = aktKarte, U = ueben;
    const wahlOk = k.format === 'mc' && U.wahl.slice().sort().join() === k.richtig.slice().sort().join();
    const LU = (k.vorne.match(/\[\[(.+?)\]\]/g) || []).map((g) => g.slice(2, -2));
    const luOk = LU.filter((g, i) => (U.luecken[i] || '').trim().toLowerCase() === g.trim().toLowerCase()).length;
    const zRichtig = k.format === 'zuordnung' ? k.elemente.filter((e, i) => U.zu[i] === e.kat).length : 0;
    const getippt = k.format === 'frage' && !!U.eingabe.trim(), frOk = getippt && norm(U.eingabe) === norm(k.hinten);
    const kiOk = k.format === 'offen' && ki?.id === k.id && !ki.lade && !ki.fehler && ki.pct !== undefined, kiLaedt = k.format === 'offen' && ki?.id === k.id && ki.lade;
    const teilw = (k.format === 'luecke' && luOk > 0) || (k.format === 'zuordnung' && zRichtig > 0) || (k.format === 'mc' && U.wahl.some((w) => k.richtig.includes(w))) || (kiOk && ki!.pct! >= 40);
    const objektiv = frOk || kiOk || k.format === 'mc' || k.format === 'luecke' || k.format === 'zuordnung';
    const alles = kiOk ? ki!.pct! >= 80 : frOk ? true : k.format === 'mc' ? wahlOk : k.format === 'luecke' ? luOk === LU.length : k.format === 'zuordnung' ? zRichtig === k.elemente.length : false;
    return { wahlOk, LU, luOk, zRichtig, getippt, frOk, teilw, objektiv, alles, kiLaedt };
  })();
  // KI-Rückmeldung bei offenen Aufgaben (Edge Function „grade“ im Supabase-Projekt)
  useEffect(() => {
    const k = aktKarte;
    if (!ueben?.auf || !k || k.format !== 'offen' || !ueben.eingabe.trim() || ki?.id === k.id) return;
    setKi({ id: k.id, lade: true });
    gradeAnswer(offenT(k.vorne), k.hinten, ueben.eingabe).then((r) => {
      const fehl = /^(fehler|bewertung nicht verfügbar|antwort konnte nicht)/i.test(r.fb.trim());
      setKi({ id: k.id, lade: false, ...(fehl ? { fehler: r.fb } : { pct: r.pct, fb: r.fb }) });
    }).catch((e) => setKi({ id: k.id, lade: false, fehler: String((e as Error).message || e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ueben?.auf, aktKarte?.id]);
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (!ueben || !aktKarte || !bew || bew.kiLaedt || ev.key !== 'Enter' || ev.shiftKey) return;
      const t = ev.target as HTMLElement, tag = (t?.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' && aktKarte.format !== 'frage') return;
      ev.preventDefault();
      if (!ueben.auf) { setUeben({ ...ueben, auf: true }); return; }
      if (bew.objektiv) { if (bew.alles) weiter(aktKarte, 'sicher', 'r'); else weiter(aktKarte, 'unsicher', bew.teilw ? 't' : 'f'); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  });

  // ---------- Stile ----------
  const knopf: CSSProperties = { minHeight: 34, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 13, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
  const feld: CSSProperties = { border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 8, padding: 8, fontSize: 15, color: 'var(--ink)' };
  const lab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-3)', fontWeight: 800 };
  const pill = (an: boolean, f: [string, string], rund = 999): CSSProperties => ({ minHeight: 32, padding: '0 12px', borderRadius: rund, border: '1.5px solid ' + (an ? f[0] : 'var(--line)'), background: an ? f[1] : '#fff', fontSize: 13, fontWeight: rund === 999 ? 800 : 700, color: rund === 999 ? f[0] : 'var(--ink)', cursor: 'pointer', textAlign: 'left' });
  const seg = (an: boolean): CSSProperties => ({ background: an ? '#fff' : 'transparent', boxShadow: an ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' });

  // Ziel-Auswahl (Modul / Bereich / Sitzung) für Dialog, Verschieben, Import
  const Ziel = ({ z, setz }: { z: { teilId: string | null; sitzungId: string | null }; setz: (p: { teilId?: string | null; sitzungId?: string | null }) => void }) => {
    const zt = z.teilId ? tm[z.teilId] : null, zm = (zt?.kuerzel ?? '').slice(0, 6), ms = aktMods.slice(); if (zm && !ms.includes(zm)) ms.unshift(zm);
    const ber = stand.teilmodule.filter((t) => t.kuerzel.startsWith(zm)).sort((a, b) => (/Tutorium|eÜbung/.test(a.art) ? 1 : 0) - (/Tutorium|eÜbung/.test(b.art) ? 1 : 0) || a.kuerzel.localeCompare(b.kuerzel));
    const sz = sitzVon(z.teilId); const mehrGr = new Set(sz.map((x) => x.v?.id)).size > 1;
    const gew = sitzungen.find((x) => x.s.id === z.sitzungId);
    return (<>
      <div style={lab}>Modul<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{ms.map((m) => { const f = C[m] ?? FACH[m.slice(0, 3)] ?? FACH.x; return <button key={m} type="button" onClick={() => setz({ teilId: ersterTeil(m) ?? null, sitzungId: null })} style={pill(m === zm, f)}>{m}</button>; })}</div></div>
      <div style={lab}>Bereich<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{ber.map((t) => <button key={t.id} type="button" title={t.kuerzel} onClick={() => setz({ teilId: t.id, sitzungId: null })} style={pill(t.id === z.teilId, farbeT(t.kuerzel), 10)}>{(t.kuerzel.includes('.') ? t.kuerzel.slice(7) + ' · ' : '') + t.name.replace(/ \((Gruppe [^)]*|freiwillig)\)/, '')}</button>)}</div></div>
      {sz.length > 0 && <div style={lab}>Sitzung (optional)
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" onClick={() => setz({ sitzungId: null })} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1.5px solid ' + (!z.sitzungId ? 'var(--ink)' : 'var(--line)'), background: !z.sitzungId ? '#fff' : 'transparent', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>keine bestimmte</button>
          {sz.map((x) => { const an = z.sitzungId === x.s.id, nr = sz.filter((y) => y.v?.id === x.v?.id).indexOf(x) + 1, f = farbeT(zt?.kuerzel ?? ''); return <button key={x.s.id} type="button" title={(x.s.thema || 'Thema folgt') + ' (' + fmtS(x.s.datum) + ')'} onClick={() => setz({ sitzungId: x.s.id })} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1.5px solid ' + (an ? f[0] : 'var(--line)'), background: an ? f[1] : '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: x.s.datum > HEUTE ? 0.6 : 1 }}>{(mehrGr ? (x.v?.kurz ?? '').split(' · ').pop() + ' ' : '') + nr + ' · ' + fmtS(x.s.datum).slice(3)}</button>; })}
        </div>
        <span style={{ fontSize: 12, fontWeight: 400 }}>{gew ? 'Thema: ' + (gew.s.thema || 'folgt') + ' – die Karte erscheint dann auch im Modul unter „Lernen“ bei dieser Sitzung.' : 'Ordne die Karte einer Sitzung zu, damit du sie gezielt mit der Sitzung üben kannst.'}</span>
      </div>}
    </>);
  };

  // ---------- Kartenliste ----------
  const Kachel = ({ k }: { k: K }) => { const f = farbeT(k.teil), st = STAND[k.stand] ?? STAND.neu, an = !!sel[k.id];
    const info = wdhText(k) + ' · ' + (k.bild ? '🖼 ' : '') + (k.sitzungId ? sitzLabel(k.sitzungId) + ' · ' : '') + (k.format === 'mc' ? k.optionen.filter(Boolean).length + ' Antwortmöglichkeiten' + (k.richtig.length > 1 ? ', ' + k.richtig.length + ' richtig' : '') : k.format === 'offen' ? 'mit Musterlösung · KI-Rückmeldung' : k.format === 'luecke' ? (k.vorne.match(/\[\[/g) || []).length + ' Lücke(n)' : k.format === 'zuordnung' ? k.elemente.length + ' Elemente · ' + k.kategorien.filter(Boolean).length + ' Kategorien' : 'Tippen zum Bearbeiten');
    return (
      <button type="button" onClick={() => bearbeiten(k)} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 14, border: '1.5px solid ' + (an ? f[0] : 'var(--line)'), borderRadius: 14, background: '#fff', boxShadow: 'inset 4px 0 0 ' + f[0], color: 'var(--ink)', cursor: 'pointer', minHeight: 130 }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {am && <span style={{ width: 20, height: 20, borderRadius: 6, border: '1.5px solid ' + (an ? f[0] : '#c9ccd1'), background: an ? f[0] : '#fff', color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-grid', placeItems: 'center' }}>{an ? '✓' : ''}</span>}
          <b style={{ fontSize: 12, color: f[0] }}>{k.teil}</b>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#f0f0eb', color: 'var(--ink-2)' }}>{FKURZ[k.format]}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: st[1], color: st[2] }}>{st[0]}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{k.format === 'luecke' ? verdeckt(k.vorne) : k.vorne}</span>
        <span style={{ marginTop: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>{info}</span>
      </button>); };
  type Gruppe = { id: string; titel: string; sub: string; ks: K[]; fg: string; haken: boolean };
  let gruppen: Gruppe[];
  if (auswahl === 'alle') gruppen = mods.map((mo) => ({ id: 'm:' + mo, titel: mo, sub: MODNAME[mo] ?? stand.module.find((m) => m.kuerzel === mo)?.name ?? '', ks: imModul.filter((k) => k.mk === mo), fg: (C[mo] ?? FACH[mo.slice(0, 3)] ?? FACH.x)[0], haken: false })).filter((g) => g.ks.length);
  else {
    const keys = [...new Set(imModul.map((k) => k.sitzungId).filter(Boolean))] as string[];
    const sx = (id: string) => sitzungen.find((x) => x.s.id === id);
    keys.sort((a, b) => { const A = sx(a), B = sx(b); const ka = A ? (A.teil.includes('.') ? '0' : '1') + A.teil + A.s.datum : '2', kb = B ? (B.teil.includes('.') ? '0' : '1') + B.teil + B.s.datum : '2'; return ka.localeCompare(kb); });
    gruppen = keys.map((id) => { const x = sx(id); return { id, titel: (x ? x.teil + ' · ' : '') + sitzLabel(id).replace('Sitzung ', 'S'), sub: x ? (x.s.thema || 'Thema folgt') + (x.teil.includes('.') ? '' : ' · ' + (x.v?.kurz ?? '')) : '', ks: imModul.filter((k) => k.sitzungId === id), fg: farbeT(x ? x.teil : auswahl)[0], haken: true }; });
    if (imModul.some((k) => !k.sitzungId)) gruppen.push({ id: '', titel: 'ohne Sitzung', sub: 'Karten, die keiner Sitzung zugeordnet sind', ks: imModul.filter((k) => !k.sitzungId), fg: '#6b6f76', haken: true });
  }
  const selIds = Object.keys(sel).filter((id) => alle.some((k) => k.id === id));

  // ---------- Statistik ----------
  const ST = imModul, sum = { r: 0, t: 0, f: 0 }; ST.forEach((k) => { sum.r += k.stat.r; sum.t += k.stat.t; sum.f += k.stat.f; });
  const ges = sum.r + sum.t + sum.f, nie = ST.filter((k) => !(k.stat.r || k.stat.t || k.stat.f)), pz = (n: number) => (ges ? Math.round(n / ges * 100) : 0);
  const fq = (k: K) => { const n = k.stat.r + k.stat.t + k.stat.f; return n ? (k.stat.f + k.stat.t * 0.5) / n : -1; };
  const quoteV = (k: K) => { const n = k.stat.r + k.stat.t + k.stat.f; return n ? k.stat.r / n : -1; };
  const schwer = ST.filter((k) => fq(k) > 0).sort((a, b) => fq(b) - fq(a));
  const su = statSuche.trim().toLowerCase();
  const gef = ST.filter((k) => { const q = quoteV(k); if (statFil === 'schwach' && !(q >= 0 && q < 0.6)) return false; if (statFil === 'nie' && q >= 0) return false; if (statFil === 'unsicher' && k.stand !== 'unsicher') return false; if (su && (k.vorne + ' ' + k.hinten + ' ' + k.teil).toLowerCase().indexOf(su) < 0) return false; return true; })
    .sort((a, b) => statSort === 'zuletzt' ? b.stat.zuletzt.localeCompare(a.stat.zuletzt) : statSort === 'oft' ? (b.stat.r + b.stat.t + b.stat.f) - (a.stat.r + a.stat.t + a.stat.f) : statSort === 'modul' ? a.teil.localeCompare(b.teil) : fq(b) - fq(a));
  const lzListe = stand.lernzeit.filter((l) => { const t = tm[l.teilmodul_id]; return t && (auswahl === 'alle' ? (tab === 'archiv' ? !aktMods.includes(t.kuerzel.slice(0, 6)) : aktMods.includes(t.kuerzel.slice(0, 6))) : t.kuerzel.startsWith(auswahl)); });
  const wsIso = plusTage(HEUTE, -((parseIso(HEUTE).getDay() + 6) % 7));
  const lzSum = (l: typeof lzListe) => l.reduce((x, y) => x + y.sekunden, 0);
  const lzZeilen = auswahl === 'alle' ? mods.map((mo) => ({ key: mo, name: mo, fg: (C[mo] ?? FACH[mo.slice(0, 3)] ?? FACH.x)[0], sek: lzSum(lzListe.filter((l) => tm[l.teilmodul_id]?.kuerzel.startsWith(mo))) }))
    : [...new Set(lzListe.map((l) => l.teilmodul_id))].map((id) => tm[id]).sort((a, b) => a.kuerzel.localeCompare(b.kuerzel)).map((t) => ({ key: t.id, name: t.kuerzel + ' · ' + t.name.replace(/ \((Gruppe [^)]*|freiwillig)\)/, ''), fg: farbeT(t.kuerzel)[0], sek: lzSum(lzListe.filter((l) => l.teilmodul_id === t.id)) }));
  const lzMax = Math.max(1, ...lzZeilen.map((z) => z.sek));
  const zeile = (k: K) => { const n = k.stat.r + k.stat.t + k.stat.f, f = farbeT(k.teil), q = n ? Math.round(k.stat.r / n * 100) : 0; return { k, n, f, q, zl: 'zuletzt: ' + (k.stat.zuletzt ? fmtS(k.stat.zuletzt) : 'noch nie'), rB: n ? Math.round(k.stat.r / n * 100) + '%' : '0%', tB: n ? Math.round(k.stat.t / n * 100) + '%' : '0%', fB: n ? Math.round(k.stat.f / n * 100) + '%' : '0%' }; };
  const Balken3 = ({ r, t, f, h = 12 }: { r: string; t: string; f: string; h?: number }) => <span style={{ display: 'flex', height: h, borderRadius: h / 2, overflow: 'hidden', background: '#f0f0eb' }}><span style={{ width: r, background: '#5aa36f' }} /><span style={{ width: t, background: '#e3a548' }} /><span style={{ width: f, background: '#d06a6a' }} /></span>;

  // ---------- Import ----------
  const parseImport = (text: string) => String(text || '').split(/\r?\n/).map((z) => z.trim()).filter(Boolean).map((z) => { const tl = z.includes('\t') ? z.split('\t') : z.split(';'); const v = (tl[0] || '').trim(), h = tl.slice(1).join(';').trim(); if (/^(frage|vorderseite)$/i.test(v)) return null; if (!h && /\[\[.+?\]\]/.test(v)) return { format: 'luecke', vorne: v, hinten: '' }; if (!h) return { fehler: z }; return { format: 'frage', vorne: v, hinten: h }; }).filter(Boolean) as ({ format: string; vorne: string; hinten: string } | { fehler: string })[];
  const P = io ? parseImport(io.text) : [], ok = P.filter((x) => !('fehler' in x)) as { format: string; vorne: string; hinten: string }[], bad = P.filter((x) => 'fehler' in x);
  const exportDaten = () => {
    const q = (s: unknown) => { const t = String(s ?? ''); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const zeilen = [['Teilmodul', 'Sitzung', 'Format', 'Vorderseite', 'Rückseite/Lösung', 'Stand', 'nächste Wiederholung', 'richtig', 'teilweise', 'falsch'], ...alle.map((k) => [k.teil, k.sitzungId ? sitzLabel(k.sitzungId) : '', FORM[k.format], k.vorne, k.format === 'mc' ? k.richtig.map((r) => k.optionen[r]).join(' | ') : k.hinten, k.stand, k.faellig || 'heute', k.stat.r, k.stat.t, k.stat.f])];
    const csv = URL.createObjectURL(new Blob(['﻿' + zeilen.map((z) => z.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    const json = URL.createObjectURL(new Blob([JSON.stringify({ app: 'Lernapp', art: 'Karten-Sicherung', stand: HEUTE, karten: alle }, null, 1)], { type: 'application/json' }));
    return { csv, json };
  };
  const exp = io?.tab === 'export' ? exportDaten() : null;

  const tabs: [string, string][] = [['aktuell', 'Aktuelles Semester'], ['statistik', 'Statistik'], ['archiv', 'Archiv']];
  const kopfInfo = alle.length + ' Karten · ' + alle.filter((k) => istAktK(k) && istFaellig(k)).length + ' heute fällig';
  const wo = auswahl === 'alle' ? 'aller Module' : 'von ' + auswahl;

  return (
    <>
      {fehler && <div className="karte fehler">{fehler}</div>}
      <header className="kopf kar-kopf">
        <div><h1 style={{ margin: 0 }}>Eigene Karten</h1><div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{kopfInfo}</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setIo({ tab: 'import', teilId: (auswahl !== 'alle' ? ersterTeil(auswahl) : stand.teilmodule.find((t) => t.kuerzel === 'ewb001.1')?.id) ?? null, sitzungId: null, text: '' })} className="kar-io" style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 14, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>Import / Export</button>
          <button type="button" onClick={() => neuDialog()} className="neu-knopf" style={{ minHeight: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 15, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>+ Karte</button>
        </div>
      </header>
      <div className="umschalter kar-tabs" role="tablist" style={{ gap: 3, padding: 3, background: '#efefea' }}>
        {tabs.map(([id, n]) => <button key={id} type="button" role="tab" className={tab === id ? 'aktiv' : ''} onClick={() => { gehe(id); setModul('alle'); setResetArm(null); }}>{n}</button>)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[{ k: 'alle', n: imTab.length, f: ['#1f2328', '#fff'] as [string, string] }, ...mods.map((m) => ({ k: m, n: imTab.filter((k) => k.mk === m).length, f: C[m] ?? FACH[m.slice(0, 3)] ?? FACH.x }))].map((x) => { const an = auswahl === x.k; return <button key={x.k} type="button" onClick={() => { setModul(x.k); setSitzFilter([]); }} style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1.5px solid ' + (an ? x.f[0] : 'var(--line)'), background: an && x.k !== 'alle' ? x.f[1] : '#fff', fontSize: 13, fontWeight: 800, color: x.f[0], cursor: 'pointer' }}>{x.k === 'alle' ? 'Alle' : x.k} <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{x.n}</span></button>; })}
      </div>

      {tab !== 'statistik' && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>Übungsmodus</span>
          <div style={{ display: 'flex', gap: 3, padding: 3, background: '#efefea', borderRadius: 999 }}>
            {[['anfaenger', 'Anfänger'], ['profi', 'Profi']].map(([id, n]) => <button key={id} type="button" onClick={() => setModus(id)} style={{ minHeight: 34, padding: '0 14px', border: 0, borderRadius: 999, ...seg(modus === id), fontSize: 13, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{n}</button>)}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{modus === 'profi' ? 'Wie in der Prüfung: keine Hinweise, bei Multiple Choice immer selbst „Prüfen“.' : 'Mit Hilfen: Hinweis, wie viele Antworten richtig sind, und Anfangsbuchstabe bei Lücken.'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Wiederholung mit Abständen: richtig → nach 1, 3, 7, 14, 30, 60 Tagen wieder · teilweise oder falsch → morgen wieder.</div>
        <div className="kar-kacheln" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { titel: 'Fällige üben', text: faellig.length ? faellig.length + (faellig.length === 1 ? ' Karte' : ' Karten') + ' heute fällig – überfällige zuerst' : 'Heute nichts fällig' + (naechsteF ? ' · nächste ' + naechsteF : ''), an: faellig.length > 0, start: () => starten(faellig) },
            { titel: 'Nur unsichere', text: unsicher.length + ' Karten, die du noch nicht sicher weißt', an: unsicher.length > 0, start: () => starten(unsicher) },
            { titel: 'Alle durchgehen', text: liste.length + (liste.length === 1 ? ' Karte' : ' Karten') + ' in gemischter Reihenfolge', an: liste.length > 0, start: () => starten(liste.slice().sort(() => Math.random() - 0.5)) },
          ].map((u) => (
            <div key={u.titel} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{u.titel}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{u.text}</span>
              <button type="button" onClick={u.start} style={{ ...knopf, alignSelf: 'flex-start', marginTop: 'auto', minHeight: 36, padding: '0 14px', fontWeight: 800, opacity: u.an ? 1 : 0.45 }}>Starten</button>
            </div>))}
        </div>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{auswahl === 'alle' ? (tab === 'aktuell' ? 'Alle Karten · ' + (akt?.bezeichnung ?? '') : 'Archiv · frühere Semester') : 'Karten · ' + auswahl + (SF.length ? ' · ' + SF.length + (SF.length === 1 ? ' Sitzung' : ' Sitzungen') : '')}</h2>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{liste.length} {liste.length === 1 ? 'Karte' : 'Karten'}</span><button type="button" onClick={() => { setAm(!am); setSel({}); setSelArm(false); }} style={knopf}>{am ? 'Fertig' : 'Auswählen'}</button></span>
          </div>
          {liste.length === 0 && <div style={{ background: '#fff', border: '1px dashed #d8d8d0', borderRadius: 16, padding: 20, fontSize: 14, color: 'var(--ink-3)' }}>{tab === 'aktuell' ? 'Noch keine Karten für dieses Modul. Tippe auf „+ Karte“, um die erste anzulegen.' : 'Im Archiv liegen noch keine Karten.'}</div>}
          {am && (
            <div style={{ position: 'sticky', top: 8, zIndex: 5, background: '#fff', border: '1.5px solid var(--ink)', borderRadius: 14, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, marginRight: 'auto' }}>{selIds.length ? selIds.length + (selIds.length === 1 ? ' Karte ausgewählt' : ' Karten ausgewählt') : 'Karten antippen, um sie auszuwählen'}</span>
              <button type="button" onClick={() => setSel(Object.fromEntries(liste.map((k) => [k.id, true])))} style={knopf}>Alle {liste.length} auswählen</button>
              {selIds.length > 0 && <>
                <button type="button" onClick={() => { setSel({}); setSelArm(false); }} style={knopf}>Auswahl aufheben</button>
                <button type="button" onClick={() => starten(alle.filter((k) => sel[k.id]))} style={knopf}>Üben</button>
                <button type="button" onClick={() => { const e = alle.find((k) => sel[k.id]); setVs({ teilId: e?.teilId ?? null, sitzungId: null }); }} style={knopf}>Verschieben …</button>
                <button type="button" onClick={() => { const neu = alle.filter((k) => sel[k.id]).map((k) => ({ modul_id: k.modulId, teilmodul_id: k.teilId, sitzung_id: k.sitzungId, format: k.format, bild_pfad: k.bild, inhalt: { vorne: k.vorne, hinten: k.hinten, optionen: k.optionen, richtig: k.richtig, kategorien: k.kategorien, elemente: k.elemente } })); setSel({}); los(() => speichereKarten(neu)); }} style={knopf}>Kopieren</button>
                <button type="button" onClick={() => { if (!selArm) { setSelArm(true); return; } const ids = selIds; setSel({}); setSelArm(false); los(() => karteAusblenden(ids)); }} style={{ ...knopf, color: '#c42b2b' }}>{selArm ? 'Wirklich löschen?' : 'Löschen'}</button>
              </>}
            </div>
          )}
          {auswahl !== 'alle' && SF.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>Übungen gelten für {SF.length} {SF.length === 1 ? 'abgehakte Sitzung' : 'abgehakte Sitzungen'} ({liste.length} {liste.length === 1 ? 'Karte' : 'Karten'}). <button type="button" onClick={() => setSitzFilter([])} style={{ border: 0, background: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'underline', cursor: 'pointer' }}>Auswahl aufheben</button></div>}
          {auswahl !== 'alle' && !SF.length && gruppen.length > 0 && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Sitzungen abhaken, um nur deren Karten zu üben – oder direkt „Üben“ an einer Sitzung.</div>}
          {gruppen.map((g) => { const si = g.ks.filter((k) => k.stand === 'sicher').length, p = g.ks.length ? Math.round(si / g.ks.length * 100) : 0, offen = !!grpOffen[g.id], an = SF.includes(g.id); return (
            <div key={g.id || 'ohne'} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => setGrpOffen({ ...grpOffen, [g.id]: !offen })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', boxShadow: 'inset 4px 0 0 ' + g.fg }}>
                {g.haken && <button type="button" onClick={(ev) => { ev.stopPropagation(); setSitzFilter(an ? sitzFilter.filter((x) => x !== g.id) : [...sitzFilter, g.id]); }} aria-label="zum Üben auswählen" style={{ width: 24, height: 24, flex: 'none', borderRadius: 6, border: '1.5px solid ' + (an ? g.fg : '#c9ccd1'), background: an ? g.fg : '#fff', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}>{an ? '✓' : ''}</button>}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: g.fg }}>{g.titel}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.sub}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-3)' }}><div style={{ width: 90, height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', width: p + '%', background: g.fg }} /></div>{g.ks.length} {g.ks.length === 1 ? 'Karte' : 'Karten'} · {si} sicher</div>
                </div>
                <button type="button" onClick={(ev) => { ev.stopPropagation(); starten(ordneUnsicher(g.ks)); }} style={{ ...knopf, padding: '0 14px', fontWeight: 800 }}>Üben</button>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{offen ? '▾' : '▸'}</span>
              </div>
              {offen && <div style={{ padding: '0 14px 14px' }}><div className="kar-karten" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>{g.ks.map((k) => <Kachel key={k.id} k={k} />)}</div></div>}
            </div>); })}
        </section>
      </>}

      {tab === 'statistik' && <>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{auswahl === 'alle' ? 'Statistik · alle Module (' + (akt?.bezeichnung ?? '') + ')' : 'Statistik · ' + auswahl}</h2>
        <div className="kar-kacheln" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {([['Antworten gesamt', String(ges), 'var(--ink)'], ['Trefferquote', pz(sum.r) + ' %', '#2f7a4b'], ['Teilweise richtig', String(sum.t), '#a3580b']] as const).map(([l, w, c]) => <div key={l} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>{l}</span><span style={{ fontSize: 26, fontWeight: 700, color: c }}>{w}</span></div>)}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>{nie.length === 1 ? 'Karte noch nie geübt' : 'Karten noch nie geübt'}</span><span style={{ fontSize: 26, fontWeight: 700 }}>{nie.length}</span>{nie.length > 0 && <button type="button" onClick={() => starten(nie)} style={{ ...knopf, alignSelf: 'flex-start', minHeight: 30, fontSize: 12, fontWeight: 800 }}>Jetzt üben</button>}</div>
        </div>
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Lernzeit</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {([['Heute', lzSum(lzListe.filter((l) => l.datum === HEUTE))], ['Diese Woche', lzSum(lzListe.filter((l) => l.datum >= wsIso))], ['Gesamt', lzSum(lzListe)]] as const).map(([n, w]) => <div key={n} style={{ background: 'var(--paper)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>{n}</span><span style={{ fontSize: 20, fontWeight: 700 }}>{fmtZeit(w)}</span></div>)}
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>davon Karten üben {fmtZeit(lzSum(lzListe.filter((l) => l.art === 'karten')))} · Lerntexte lesen {fmtZeit(lzSum(lzListe.filter((l) => l.art === 'lerntext')))}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>{auswahl === 'alle' ? 'Lernzeit nach Modul' : 'Lernzeit nach Bereich'}</span>
          {lzZeilen.map((z) => <div key={z.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 10px', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 700, color: z.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span><span style={{ fontSize: 13, fontWeight: 800 }}>{z.sek ? fmtZeit(z.sek) : '–'}</span><div style={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', width: Math.round(z.sek / lzMax * 100) + '%', background: z.fg }} /></div></div>)}
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Gezählt wird nur aktives Lernen: Karten üben und Lerntexte lesen. Karten anlegen oder bearbeiten und Herumklicken zählen nicht. Nach 1 Minute ohne Eingabe oder wenn die App im Hintergrund ist, stoppt die Uhr.</span>
        </section>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Balken3 r={pz(sum.r) + '%'} t={pz(sum.t) + '%'} f={pz(sum.f) + '%'} />
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>✓ richtig {sum.r} · ◐ teilweise {sum.t} · ✗ falsch {sum.f}</span>
        </div>
        {auswahl === 'alle' && <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div onClick={() => setStatOffen({ ...statOffen, modul: !statOffen.modul })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Nach Modul</h3><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{statOffen.modul ? '▾' : '▸'}</span></div>
          {statOffen.modul && mods.map((mo) => { const ks = ST.filter((k) => k.mk === mo), x = { r: 0, t: 0, f: 0 }; ks.forEach((k) => { x.r += k.stat.r; x.t += k.stat.t; x.f += k.stat.f; }); const n = x.r + x.t + x.f, f = C[mo] ?? FACH[mo.slice(0, 3)] ?? FACH.x; return (
            <button key={mo} type="button" onClick={() => setModul(mo)} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, alignItems: 'center', border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
              <b style={{ fontSize: 13, color: f[0] }}>{mo}</b>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><Balken3 h={8} r={n ? Math.round(x.r / n * 100) + '%' : '0%'} t={n ? Math.round(x.t / n * 100) + '%' : '0%'} f={n ? Math.round(x.f / n * 100) + '%' : '0%'} /><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{n ? Math.round(x.r / n * 100) + ' % richtig · ' + n + ' Antworten' : ks.length ? 'noch nicht geübt' : 'keine Karten'}</span></span>
            </button>); })}
        </section>}
        {schwer.length > 0 && <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div onClick={() => setStatOffen({ ...statOffen, schwer: !statOffen.schwer })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Am häufigsten falsch <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-3)' }}>{schwer.length} {schwer.length === 1 ? 'Karte' : 'Karten'}</span></h3>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button type="button" onClick={(ev) => { ev.stopPropagation(); starten(schwer.slice(0, 10)); }} style={{ ...knopf, minHeight: 32, fontWeight: 800 }}>Diese gezielt üben</button><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{statOffen.schwer ? '▾' : '▸'}</span></span>
          </div>
          {statOffen.schwer && schwer.slice(0, 5).map(zeile).map((z) => <button key={z.k.id} type="button" onClick={() => bearbeiten(z.k)} style={{ display: 'flex', flexDirection: 'column', gap: 4, border: 0, borderTop: '1px solid #f0f0eb', background: 'none', padding: '8px 0 0', textAlign: 'left', color: 'var(--ink)', cursor: 'pointer' }}><span style={{ fontSize: 14, fontWeight: 700 }}><b style={{ fontSize: 12, color: z.f[0] }}>{z.k.teil}</b> · {z.k.format === 'luecke' ? verdeckt(z.k.vorne) : z.k.vorne}</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>✓ {z.k.stat.r} · ◐ {z.k.stat.t} · ✗ {z.k.stat.f} · {z.zl}</span></button>)}
        </section>}
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={() => setStatOffen({ ...statOffen, alle: !statOffen.alle })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Alle Karten <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-3)' }}>{ST.length} {ST.length === 1 ? 'Karte' : 'Karten'}</span></h3><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{statOffen.alle ? '▾' : '▸'}</span></div>
          {statOffen.alle && <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input type="search" value={statSuche} onChange={(ev) => { setStatSuche(ev.target.value); setStatZahl(20); }} placeholder="Karte suchen …" style={{ flex: '1 1 180px', minWidth: 0, border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 999, padding: '8px 14px', fontSize: 14, color: 'var(--ink)' }} />
              <select value={statSort} onChange={(ev) => setStatSort(ev.target.value)} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 999, padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                {[['schwach', 'Schwächste zuerst'], ['zuletzt', 'Zuletzt geübt'], ['oft', 'Am meisten geübt'], ['modul', 'Nach Teilmodul']].map(([w, n]) => <option key={w} value={w}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 3, background: '#efefea', borderRadius: 999 }}>{[['alle', 'Alle'], ['schwach', 'Unter 60 %'], ['unsicher', 'Unsicher'], ['nie', 'Nie geübt']].map(([id, n]) => <button key={id} type="button" onClick={() => { setStatFil(id); setStatZahl(20); }} style={{ minHeight: 30, padding: '0 12px', border: 0, borderRadius: 999, ...seg(statFil === id), fontSize: 12, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{n}</button>)}</div>
              {gef.length !== ST.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{gef.length} von {ST.length} Karten</span>}
              <button type="button" onClick={() => starten(gef)} style={{ ...knopf, marginLeft: 'auto', minHeight: 30, fontSize: 12, fontWeight: 800 }}>{gef.length} {gef.length === 1 ? 'Karte üben' : 'Karten üben'}</button>
            </div>
            {gef.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Keine Karten gefunden.</span>}
            <div style={{ display: 'flex', flexDirection: 'column' }}>{gef.slice(0, statZahl).map(zeile).map((z) => (
              <button key={z.k.id} type="button" onClick={() => bearbeiten(z.k)} title={'✓ ' + z.k.stat.r + ' · ◐ ' + z.k.stat.t + ' · ✗ ' + z.k.stat.f + ' · ' + z.n + '× geübt · ' + z.zl} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 64px 40px', gap: 10, alignItems: 'center', border: 0, borderTop: '1px solid #f0f0eb', background: 'none', padding: '7px 0', textAlign: 'left', color: 'var(--ink)', cursor: 'pointer' }}>
                <b style={{ fontSize: 12, color: z.f[0] }}>{z.k.teil}</b>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.k.format === 'luecke' ? verdeckt(z.k.vorne) : z.k.vorne}</span><span style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {z.k.stat.r} ◐ {z.k.stat.t} ✗ {z.k.stat.f} · {z.zl}</span></span>
                <Balken3 h={6} r={z.rB} t={z.tB} f={z.fB} />
                <span style={{ fontSize: 13, fontWeight: 800, textAlign: 'right' }}>{z.n ? z.q + ' %' : '–'}</span>
              </button>))}</div>
            {gef.length > statZahl && <button type="button" onClick={() => setStatZahl(statZahl + 20)} style={{ ...knopf, alignSelf: 'center', minHeight: 32, padding: '0 14px' }}>Weitere {Math.min(20, gef.length - statZahl)} anzeigen ({gef.length - statZahl} übrig)</button>}
          </>}
        </section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => { if (resetArm !== 'karten') { setResetArm('karten'); return; } setResetArm(null); los(() => antwortenZuruecksetzen(ST.map((k) => 'karte:' + k.id))); }} style={{ ...knopf, minHeight: 32, color: resetArm === 'karten' ? '#c42b2b' : 'var(--ink)' }}>{resetArm === 'karten' ? 'Wirklich zurücksetzen?' : 'Karten-Ergebnisse zurücksetzen'}</button>
          <button type="button" onClick={() => { if (resetArm !== 'zeit') { setResetArm('zeit'); return; } setResetArm(null); los(() => lernzeitZuruecksetzen([...new Set(lzListe.map((l) => l.teilmodul_id))])); }} style={{ ...knopf, minHeight: 32, color: resetArm === 'zeit' ? '#c42b2b' : 'var(--ink)' }}>{resetArm === 'zeit' ? 'Wirklich zurücksetzen?' : 'Lernzeit zurücksetzen'}</button>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{resetArm ? 'Betrifft ' + (resetArm === 'karten' ? 'die Ergebnisse (✓ ◐ ✗)' : 'die Lernzeit') + ' ' + wo + '. Zum Bestätigen noch einmal tippen.' : 'Der Stand deiner Karten (neu/unsicher/sicher) bleibt erhalten.'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>✓ richtig · ◐ teilweise richtig (z. B. 2 von 3 Lücken) · ✗ falsch bzw. „Noch unsicher“.</div>
      </>}
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Deine Karten werden geräteübergreifend gespeichert.</div>

      {/* ---------- Dialog Karte ---------- */}
      {dialog && (() => { const x = dialog, set = (p: Partial<Dlg>) => setDialog({ ...x, ...p }), dMod = (x.teilId ? tm[x.teilId]?.kuerzel : '')?.slice(0, 6) ?? '';
        const istL = x.format === 'luecke', istO = x.format === 'offen', istZ = x.format === 'zuordnung';
        const feldName = x.feld === 'vorne' ? (istL ? 'Text mit Lücken' : istO || istZ ? 'Aufgabe' : 'Frage') : istO ? 'Musterlösung' : 'Antwort';
        const vorschau = x.bildVorschau ?? (x.bild ? bilder[x.bild] : '');
        return (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setDialog(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Karte" className="dialog" style={{ maxWidth: 520 }}>
            <h2>{x.id ? 'Karte bearbeiten' : x.kopie ? 'Kopie der Karte – anpassen und speichern' : 'Neue Karte'}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 3, background: '#efefea', borderRadius: 12 }}>{['frage', 'mc', 'offen', 'luecke', 'zuordnung'].map((f) => <button key={f} type="button" onClick={() => set({ format: f })} style={{ flex: '1 1 auto', minHeight: 38, padding: '0 10px', border: 0, borderRadius: 10, ...seg(x.format === f), fontSize: 12, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{FORM[f].replace(' (KI)', '')}</button>)}</div>
            <Ziel z={x} setz={(p) => set(p)} />
            {dMod.startsWith('mab') && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: '#eef1f6' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#3f5f93' }}>Mathe-Symbole · fügt in „{feldName}“ ein</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{SYM.map(([z, t]) => <button key={z} type="button" title={t} onClick={() => set({ [x.feld]: (x[x.feld] || '') + z } as Partial<Dlg>)} style={{ minWidth: 34, height: 34, padding: '0 6px', border: '1px solid #d5dcea', borderRadius: 8, background: '#fff', fontFamily: "'Cambria Math', 'STIX Two Math', serif", fontSize: 16, color: 'var(--ink)', cursor: 'pointer' }}>{z}</button>)}</div>
            </div>}
            <label style={lab}>{istL ? 'Text mit Lücken' : istO || istZ ? 'Aufgabe' : 'Frage (Vorderseite)'}<textarea value={x.vorne} onFocus={() => x.feld !== 'vorne' && set({ feld: 'vorne' })} onChange={(ev) => set({ vorne: ev.target.value })} rows={3} placeholder={istL ? 'z. B. Die [[Reliabilität]] beschreibt …' : 'Was möchtest du abfragen?'} style={{ ...feld, resize: 'vertical' }} /></label>
            <div style={lab}>Bild (optional)
              {vorschau && <img src={vorschau} alt="Bild der Karte" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', alignSelf: 'flex-start', borderRadius: 8, border: '1px solid var(--line)' }} />}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label style={{ ...knopf, padding: '0 14px' }}>Bild auswählen …<input type="file" accept="image/*" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) bildWaehlen(f); ev.target.value = ''; }} style={{ display: 'none' }} /></label>
                {(x.bild || x.bildNeu) && <button type="button" onClick={() => set({ bild: null, bildNeu: null, bildVorschau: undefined })} style={{ ...knopf, padding: '0 14px', color: '#c42b2b' }}>Bild entfernen</button>}
                <span style={{ fontSize: 12, fontWeight: 400 }}>z. B. Foto einer Folie, Grafik oder Tabelle – erscheint beim Üben auf der Vorderseite.</span>
              </div>
            </div>
            {x.format === 'frage' && <label style={lab}>Antwort (Rückseite)<textarea value={x.hinten} onFocus={() => x.feld !== 'hinten' && set({ feld: 'hinten' })} onChange={(ev) => set({ hinten: ev.target.value })} rows={3} style={{ ...feld, resize: 'vertical' }} /></label>}
            {x.format === 'mc' && <div style={lab}>Antwortmöglichkeiten – Kreis antippen = richtig (auch mehrere)
              {x.optionen.map((o, i) => { const r = x.richtig.includes(i); return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" onClick={() => set({ richtig: r ? x.richtig.filter((y) => y !== i) : [...x.richtig, i].sort() })} aria-label="als richtig markieren" style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', border: '1.5px solid ' + (r ? '#2f7a4b' : '#c9ccd1'), background: r ? '#2f7a4b' : '#fff', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{r ? '✓' : ''}</button>
                  <input type="text" value={o} onChange={(ev) => { const op = x.optionen.slice(); op[i] = ev.target.value; set({ optionen: op }); }} placeholder={'Antwort ' + String.fromCharCode(65 + i) + (i >= 2 ? ' (optional)' : '')} style={{ ...feld, flex: 1, minWidth: 0 }} />
                </div>); })}
              {x.optionen.length < 6 && <button type="button" onClick={() => set({ optionen: [...x.optionen, ''] })} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: '2px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'underline', cursor: 'pointer' }}>+ Antwort (bis zu 6)</button>}
              <span style={{ fontSize: 12, fontWeight: 400 }}>Leere Felder werden beim Üben nicht angezeigt.</span>
            </div>}
            {istO && <><label style={lab}>Musterlösung / Bewertungspunkte<textarea value={x.hinten} onFocus={() => x.feld !== 'hinten' && set({ feld: 'hinten' })} onChange={(ev) => set({ hinten: ev.target.value })} rows={4} style={{ ...feld, resize: 'vertical' }} /></label><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Beim Üben schreibst du deine Antwort frei – die KI vergleicht sie mit der Musterlösung und gibt dir Rückmeldung.</div></>}
            {istL && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Lücken in eckige Doppelklammern setzen, z. B.: Die [[Reliabilität]] beschreibt die Zuverlässigkeit einer Messung.</div>}
            {istZ && <>
              <div style={lab}>Kategorien
                {x.kategorien.map((k, i) => <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 22, height: 22, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: KF[i % 5][0], color: KF[i % 5][1] }}>{String.fromCharCode(65 + i)}</span><input type="text" value={k} onChange={(ev) => { const a = x.kategorien.slice(); a[i] = ev.target.value; set({ kategorien: a }); }} placeholder="z. B. quantitativer Forschungsansatz" style={{ ...feld, flex: 1, minWidth: 0 }} /><button type="button" onClick={() => { if (x.kategorien.length <= 2) return; const a = x.kategorien.slice(); a.splice(i, 1); set({ kategorien: a, elemente: x.elemente.map((e) => ({ ...e, kat: e.kat === i ? null : e.kat !== null && e.kat > i ? e.kat - 1 : e.kat })) }); }} aria-label="entfernen" style={{ width: 32, height: 32, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink-3)', cursor: 'pointer' }}>×</button></div>)}
                <button type="button" onClick={() => set({ kategorien: [...x.kategorien, ''] })} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: '2px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'underline', cursor: 'pointer' }}>+ Kategorie</button>
              </div>
              <div style={lab}>Elemente – jeweils die richtige Kategorie antippen
                {x.elemente.map((e, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, borderRadius: 10, background: 'var(--paper)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="text" value={e.text} onChange={(ev) => { const a = x.elemente.map((y) => ({ ...y })); a[i].text = ev.target.value; set({ elemente: a }); }} placeholder="Beschreibung …" style={{ ...feld, background: '#fff', flex: 1, minWidth: 0 }} /><button type="button" onClick={() => { const a = x.elemente.slice(); a.splice(i, 1); set({ elemente: a }); }} aria-label="entfernen" style={{ width: 32, height: 32, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink-3)', cursor: 'pointer' }}>×</button></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{x.kategorien.map((k, ki) => { const an = e.kat === ki; return <button key={ki} type="button" onClick={() => { const a = x.elemente.map((y) => ({ ...y })); a[i].kat = ki; set({ elemente: a }); }} style={{ minHeight: 28, padding: '0 10px', borderRadius: 999, border: '1.5px solid ' + (an ? KF[ki % 5][1] : 'var(--line)'), background: an ? KF[ki % 5][0] : '#fff', fontSize: 12, fontWeight: 700, color: an ? KF[ki % 5][1] : 'var(--ink-3)', cursor: 'pointer' }}>{String.fromCharCode(65 + ki) + (k ? ' · ' + (k.length > 22 ? k.slice(0, 22) + '…' : k) : '')}</button>; })}</div>
                </div>)}
                <button type="button" onClick={() => set({ elemente: [...x.elemente, { text: '', kat: null }] })} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: '2px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'underline', cursor: 'pointer' }}>+ Element</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Beim Üben werden die Elemente gemischt; du tippst ein Element und dann die passende Kategorie an oder ziehst es hinein.</div>
            </>}
            {x.fehler && <div style={{ fontSize: 13, color: '#c42b2b' }}>{x.fehler}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {x.id && <button type="button" onClick={() => { if (!x.armed) { set({ armed: true }); return; } const id = x.id; setDialog(null); los(() => karteAusblenden([id])); }} style={{ ...knopf, minHeight: 40, padding: '0 14px', fontSize: 14, color: '#c42b2b', marginRight: 'auto' }}>{x.armed ? 'Wirklich löschen?' : 'Löschen'}</button>}
              {x.id && <button type="button" onClick={() => set({ id: '', armed: false, kopie: true })} style={{ ...knopf, minHeight: 40, padding: '0 14px', fontSize: 14 }}>Kopieren</button>}
              <button type="button" onClick={() => setDialog(null)} style={{ ...knopf, minHeight: 40, padding: '0 14px', fontSize: 14 }}>Abbrechen</button>
              <button type="button" onClick={dialogSpeichern} style={{ ...knopf, minHeight: 40, padding: '0 14px', fontSize: 14, fontWeight: 800 }}>Speichern</button>
            </div>
          </div>
        </div>); })()}

      {/* ---------- Verschieben ---------- */}
      {vs && (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setVs(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Verschieben" className="dialog" style={{ maxWidth: 520 }}>
            <h2>{selIds.length} {selIds.length === 1 ? 'Karte verschieben' : 'Karten verschieben'}</h2>
            <Ziel z={vs} setz={(p) => setVs({ ...vs, ...p })} />
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Stand, Statistik und Wiederholungstermine bleiben erhalten.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setVs(null)} style={knopf}>Abbrechen</button>
              <button type="button" onClick={() => { const z = vs, ids = selIds; setVs(null); setSel({}); los(() => kartenVerschieben(ids, { teilmodul_id: z.teilId, modul_id: z.teilId ? tm[z.teilId]?.modul_id ?? null : null, sitzung_id: z.sitzungId })); }} style={{ ...knopf, fontWeight: 800 }}>Verschieben</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Import / Export ---------- */}
      {io && (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) setIo(null); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Import und Export" className="dialog" style={{ maxWidth: 520 }}>
            <h2>Import / Export</h2>
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 3, padding: 3, background: '#efefea', borderRadius: 999 }}>{[['import', 'Importieren'], ['export', 'Exportieren']].map(([id, n]) => <button key={id} type="button" onClick={() => setIo({ ...io, tab: id })} style={{ minHeight: 34, padding: '0 14px', border: 0, borderRadius: 999, ...seg(io.tab === id), fontSize: 13, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{n}</button>)}</div>
            {io.tab === 'import' ? <>
              <Ziel z={io} setz={(p) => setIo({ ...io, ...p })} />
              <label style={lab}>Karten einfügen<textarea value={io.text} onChange={(ev) => setIo({ ...io, text: ev.target.value })} rows={7} placeholder={'Eine Karte pro Zeile: Frage ; Antwort\nz. B. Was ist Reliabilität? ; Zuverlässigkeit einer Messung\noder Lückentext: Die [[Validität]] beschreibt …'} style={{ ...feld, fontSize: 14, resize: 'vertical' }} /></label>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Aus Excel/Numbers kopierte Tabellen (Spalte 1 Frage, Spalte 2 Antwort) gehen auch. {!io.text.trim() ? 'Noch nichts eingefügt.' : ok.length + (ok.length === 1 ? ' Karte erkannt' : ' Karten erkannt') + (bad.length ? ' · ' + bad.length + ' Zeile(n) ohne Antwort werden übersprungen' : '') + '.'}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', border: '1px dashed #d8d8d0', borderRadius: 10, padding: '8px 10px' }}>Gedacht für Karten, die du schon woanders hast (z. B. aus einer Tabelle). Aus der alten Lernapp wird nichts übernommen.</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setIo(null)} style={knopf}>Abbrechen</button>
                {ok.length > 0 && <button type="button" onClick={() => { const z = io, t = z.teilId ? tm[z.teilId] : null; setIo(null); if (t) setModul(t.kuerzel.slice(0, 6)); los(() => speichereKarten(ok.map((o) => ({ modul_id: t?.modul_id ?? null, teilmodul_id: z.teilId, sitzung_id: z.sitzungId, format: o.format, inhalt: { vorne: o.vorne, hinten: o.hinten } })))); }} style={{ ...knopf, fontWeight: 800 }}>{ok.length} {ok.length === 1 ? 'Karte importieren' : 'Karten importieren'}</button>}
              </div>
            </> : <>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{alle.length} Karten (alle Semester). Bilder sind in der Sicherung nicht enthalten – sie liegen getrennt im Speicher.</div>
              <a href={exp!.csv} download={'lernapp-karten-' + HEUTE + '.csv'} style={{ ...knopf, alignSelf: 'flex-start' }}>Als Tabelle herunterladen (CSV, für Excel)</a>
              <a href={exp!.json} download={'lernapp-karten-' + HEUTE + '.json'} style={{ ...knopf, alignSelf: 'flex-start' }}>Komplett-Sicherung herunterladen (JSON)</a>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Eine Gesamtsicherung (Karten, Noten, Kalender, Lernzeit) kommt später unter Einstellungen dazu.</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={() => setIo(null)} style={knopf}>Schließen</button></div>
            </>}
          </div>
        </div>
      )}

      {/* ---------- Üben ---------- */}
      {ueben && (() => {
        const U = ueben, n = U.ids.length, fertig = U.i >= n, k = aktKarte;
        const set = (p: Partial<U>) => setUeben({ ...U, ...p });
        return (
        <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) uebenBeenden(); }} style={{ zIndex: 20 }}>
          <div role="dialog" aria-label="Üben" className="dialog" style={{ maxWidth: 560, gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)' }}>{fertig ? n + ' von ' + n + ' Karten' : 'Karte ' + (U.i + 1) + ' von ' + n}</span>
              <button type="button" onClick={uebenBeenden} style={{ border: 0, background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--ink-3)', cursor: 'pointer' }}>Beenden</button>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', background: k ? farbeT(k.teil)[0] : '#1f2328', width: Math.round(Math.min(U.i, n) / n * 100) + '%' }} /></div>
            {!fertig && k && bew && (() => {
              const f = farbeT(k.teil), PROFI = U.profi; let nrL = 0;
              const vorne = k.format === 'luecke' ? k.vorne.replace(/\[\[(.+?)\]\]/g, () => { nrL++; return '(' + nrL + ') _____'; }) : k.vorne;
              const zeigeAufdecken = !U.auf && (k.format !== 'mc' || k.richtig.length > 1 || PROFI);
              const aufText = (k.format === 'frage' && U.eingabe.trim()) || k.format !== 'frage' ? 'Prüfen' : 'Antwort zeigen';
              const reihe = k.elemente.map((_, i) => i).sort((a, b) => { const h = (x: number) => { let s = 0; const str = k.id + x; for (let q = 0; q < str.length; q++) s = (s * 31 + str.charCodeAt(q)) % 997; return s; }; return h(a) - h(b); });
              const inT = (erg: 'r' | 't' | 'f') => { const t = tageZw(HEUTE, naechste(k.stufe, erg).faellig); return t === 1 ? 'morgen' : 'in ' + t + ' Tagen'; };
              const lege = (s: number | null, ki: number) => { if (s === null || U.auf) return; set({ zu: { ...U.zu, [s]: ki }, sel: null }); };
              const loesungLabel = k.format === 'zuordnung' ? bew.zRichtig + ' von ' + k.elemente.length + ' richtig zugeordnet' : k.format === 'luecke' ? bew.luOk + ' von ' + bew.LU.length + ' Lücken richtig' : k.format === 'mc' ? (bew.wahlOk ? 'Richtig!' : k.richtig.length > 1 ? 'Nicht ganz – richtig sind:' : 'Leider falsch – richtig ist:') : k.format === 'offen' ? 'Musterlösung' : !bew.getippt ? 'Antwort' : bew.frOk ? 'Richtig!' : 'Vergleiche mit der richtigen Antwort';
              const loesung = k.format === 'zuordnung' ? (bew.zRichtig === k.elemente.length ? 'Alles richtig!' : 'Rot markierte Elemente gehören in eine andere Kategorie.') : k.format === 'mc' ? k.richtig.map((r) => k.optionen[r]).join(' · ') : k.format === 'luecke' ? offenT(k.vorne) : k.hinten;
              return (<>
                <div style={{ background: f[1], borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: f[0] }}>{k.teil} · {FORM[k.format]}{k.sitzungId ? ' · ' + sitzLabel(k.sitzungId) : ''}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>{vorne}</span>
                  {k.bild && bilder[k.bild] && <img src={bilder[k.bild]} alt="Bild zur Frage" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', alignSelf: 'center', borderRadius: 10, background: '#fff' }} />}
                </div>
                {k.format === 'mc' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {!PROFI && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>{k.richtig.length > 1 ? 'Mehrere Antworten sind richtig – alle passenden antippen, dann „Prüfen“.' : 'Eine Antwort ist richtig.'}</span>}
                  {k.optionen.map((o, i) => ({ o, i })).filter((x) => x.o).map((x) => { const gew = U.wahl.includes(x.i), richtig = k.richtig.includes(x.i), z = U.auf; return (
                    <button key={x.i} type="button" onClick={() => { if (U.auf) return; const einzeln = k.richtig.length === 1 && !PROFI; const w = einzeln ? [x.i] : gew ? U.wahl.filter((y) => y !== x.i) : [...U.wahl, x.i]; set({ wahl: w, auf: einzeln }); }} style={{ textAlign: 'left', minHeight: 44, padding: '8px 12px', borderRadius: 10, border: '1.5px solid ' + (z && richtig ? '#2f7a4b' : z && gew ? '#c42b2b' : gew ? 'var(--ink)' : 'var(--line)'), background: z && richtig ? '#e3f2e8' : z && gew ? '#fde9e9' : '#fff', fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>{x.o}</button>); })}
                </div>}
                {k.format === 'zuordnung' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reihe.some((i) => U.zu[i] === undefined) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, border: '1.5px dashed #d8d8d0', borderRadius: 12 }}>
                    {reihe.filter((i) => U.zu[i] === undefined).map((i) => <button key={i} type="button" draggable onDragStart={(ev: DragEvent) => ev.dataTransfer.setData('text/plain', String(i))} onClick={() => !U.auf && set({ sel: U.sel === i ? null : i })} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: '1.5px solid ' + (U.sel === i ? 'var(--ink)' : 'var(--line)'), background: '#fff', fontSize: 14, color: 'var(--ink)', cursor: 'grab' }}>{k.elemente[i].text}</button>)}
                  </div>}
                  <div className="kar-zuord" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    {k.kategorien.map((kn, ki) => { const aktivK = U.sel !== null && !U.auf; return (
                      <div key={ki} onClick={() => lege(U.sel, ki)} onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); const v = ev.dataTransfer.getData('text/plain'); if (v !== '') lege(parseInt(v, 10), ki); }} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 12, border: '1.5px solid ' + (aktivK ? 'var(--ink)' : 'var(--line)'), background: aktivK ? '#fff' : 'var(--paper)', minHeight: 90, cursor: aktivK ? 'pointer' : 'default' }}>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{kn} <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{aktivK ? '– hier antippen' : ''}</span></span>
                        {reihe.filter((i) => U.zu[i] === ki).map((i) => { const okE = k.elemente[i].kat === ki; return <button key={i} type="button" onClick={(ev) => { ev.stopPropagation(); if (U.auf) return; const z = { ...U.zu }; delete z[i]; set({ zu: z, sel: null }); }} style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 8, border: '1.5px solid ' + (U.auf ? (okE ? '#2f7a4b' : '#c42b2b') : 'var(--line)'), background: U.auf ? (okE ? '#e3f2e8' : '#fde9e9') : '#fff', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>{k.elemente[i].text}</button>; })}
                      </div>); })}
                  </div>
                </div>}
                {k.format === 'luecke' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {bew.LU.map((g, i) => { const w = U.luecken[i] || '', okL = w.trim().toLowerCase() === g.trim().toLowerCase(); return (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: 'var(--ink-3)' }}>({i + 1})
                      <input type="text" autoFocus={i === 0} value={w} onChange={(ev) => set({ luecken: { ...U.luecken, [i]: ev.target.value } })} placeholder={PROFI ? 'Lücke ' + (i + 1) + ' ausfüllen …' : 'beginnt mit „' + g.slice(0, 1).toUpperCase() + '…“'} style={{ flex: 1, minWidth: 0, border: '1.5px solid ' + (U.auf ? (okL ? '#2f7a4b' : '#c42b2b') : 'var(--line)'), background: U.auf ? (okL ? '#e3f2e8' : '#fde9e9') : 'var(--paper)', borderRadius: 8, padding: 8, fontSize: 15, color: 'var(--ink)' }} />
                      {U.auf && !okL && <span style={{ fontSize: 13, color: '#2f7a4b', whiteSpace: 'nowrap' }}>✓ {g}</span>}
                    </label>); })}
                </div>}
                {(k.format === 'offen' || k.format === 'frage') && !U.auf && <textarea autoFocus value={U.eingabe} onChange={(ev) => set({ eingabe: ev.target.value })} rows={3} placeholder={k.format === 'frage' ? 'Deine Antwort (optional) …' : 'Deine Antwort …'} style={{ ...feld, padding: 10, resize: 'vertical' }} />}
                {zeigeAufdecken && <button type="button" onClick={() => set({ auf: true })} style={{ alignSelf: 'center', minHeight: 44, padding: '0 20px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 15, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>{aufText}</button>}
                {U.auf && <>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(k.format === 'frage' || k.format === 'offen') && U.eingabe.trim() && <><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>Deine Antwort</span><span style={{ fontSize: 15, lineHeight: 1.45, paddingBottom: 6, borderBottom: '1px solid #f0f0eb', whiteSpace: 'pre-wrap' }}>{U.eingabe}</span></>}
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>{loesungLabel}</span>
                    <span style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{loesung}</span>
                    {k.format === 'offen' && U.eingabe.trim() && ki?.id === k.id && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #f0f0eb', paddingTop: 8 }}>
                      {ki.lade ? <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>KI prüft deine Antwort …</span>
                        : ki.fehler ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Die KI-Rückmeldung hat gerade nicht geklappt – schätze dich bitte selbst ein. ({ki.fehler.slice(0, 120)})</span>
                        : <><span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>KI-Rückmeldung</span><span style={{ fontSize: 18, fontWeight: 800, color: ki.pct! >= 80 ? '#2f7a4b' : ki.pct! >= 40 ? '#a3580b' : '#c42b2b' }}>{ki.pct} %</span></span><span style={{ fontSize: 14, lineHeight: 1.45 }}>{ki.fb}</span></>}
                    </div>}
                    {k.format === 'offen' && !U.eingabe.trim() && <span style={{ fontSize: 12, color: 'var(--ink-3)', borderTop: '1px solid #f0f0eb', paddingTop: 6 }}>Für eine KI-Rückmeldung vor dem Aufdecken eine Antwort schreiben.</span>}
                  </div>
                  {!bew.objektiv && !bew.kiLaedt && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    <button type="button" onClick={() => weiter(k, 'unsicher')} style={{ minHeight: 46, border: '1px solid var(--line)', borderRadius: 999, background: '#fff3e0', fontSize: 15, fontWeight: 800, color: '#a3580b', cursor: 'pointer' }}>Noch unsicher</button>
                    <button type="button" onClick={() => weiter(k, 'sicher')} style={{ minHeight: 46, border: '1px solid var(--line)', borderRadius: 999, background: '#e3f2e8', fontSize: 15, fontWeight: 800, color: '#2f7a4b', cursor: 'pointer' }}>Wusste ich</button>
                  </div>}
                  {!bew.kiLaedt && <span style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>{!bew.objektiv ? 'Nächste Wiederholung: „Wusste ich“ → ' + inT('r') + ' · „Noch unsicher“ → ' + inT('f') : bew.alles ? 'Kommt wieder ' + inT('r') + '.' : 'Kommt ' + inT(bew.teilw ? 't' : 'f') + ' wieder.'}</span>}
                  {bew.objektiv && bew.alles && <button type="button" onClick={() => weiter(k, 'sicher', 'r')} style={{ minHeight: 46, border: '1px solid var(--line)', borderRadius: 999, background: '#e3f2e8', fontSize: 15, fontWeight: 800, color: '#2f7a4b', cursor: 'pointer' }}>Richtig – weiter</button>}
                  {bew.objektiv && !bew.alles && <>
                    <button type="button" onClick={() => weiter(k, 'unsicher', bew.teilw ? 't' : 'f')} style={{ minHeight: 46, border: '1px solid var(--line)', borderRadius: 999, background: '#fff3e0', fontSize: 15, fontWeight: 800, color: '#a3580b', cursor: 'pointer' }}>Weiter <span style={{ fontWeight: 600 }}>(kommt wieder)</span></button>
                    <button type="button" onClick={() => weiter(k, 'sicher')} style={{ alignSelf: 'center', border: 0, background: 'none', padding: '2px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', textDecoration: 'underline', cursor: 'pointer' }}>War nur ein Tippfehler – als gewusst zählen</button>
                  </>}
                </>}
              </>);
            })()}
            {fertig && <>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0' }}><span style={{ fontSize: 20, fontWeight: 800 }}>Geschafft!</span><span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{U.sicher} sicher · {U.unsicher} noch unsicher – unsichere Karten kommen beim nächsten Mal zuerst.</span></div>
              <button type="button" onClick={uebenBeenden} style={{ alignSelf: 'center', minHeight: 44, padding: '0 20px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 15, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>Fertig</button>
            </>}
          </div>
        </div>); })()}
    </>
  );
}
