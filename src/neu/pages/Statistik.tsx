import type { Studienstand } from '../db';
import { heuteIso, aktuellesSemester } from '../pruefungslogik';
import { parseIso, plusTage } from '../data/kalender';
import { C, Karten, kartenAus } from './Karten';

const FACH: Record<string, [string, string]> = { mab: ['#8195b8', '#eef1f6'], pkb: ['#a98592', '#f6eff1'], x: ['#8a9683', '#f0f3ee'] };
const farbe = (k: string): [string, string] => C[k] ?? FACH[k.slice(0, 3)] ?? FACH.x;
const fmtZeit = (sek: number) => { const m = Math.round(sek / 60); return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : ''); };

/** Anwesenheit je Modul (vergangene, stattgefundene Sitzungen) – auch fürs Dashboard */
export function anwesenheitVon(stand: Studienstand, mk: string) {
  const H = heuteIso();
  const va = Object.fromEntries(stand.veranstaltungen.map((v) => [v.id, v.teilmodul_id]));
  const tm = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t.kuerzel]));
  const l = stand.sitzungen.filter((x) => x.datum <= H && x.status === 'findet_statt' && (tm[va[x.veranstaltung_id]] ?? '').slice(0, 6) === mk);
  const da = l.filter((x) => x.anwesenheit === 'ja').length, weg = l.filter((x) => x.anwesenheit === 'nein').length;
  return { n: l.length, da, weg, offen: l.length - da - weg };
}
export function AnwBalken({ z, h = 6 }: { z: { n: number; da: number; weg: number; offen: number }; h?: number }) {
  return <span style={{ display: 'flex', height: h, borderRadius: h / 2, overflow: 'hidden', background: '#f0f0eb' }}>{([[z.da, '#5aa36f'], [z.weg, '#e07a88'], [z.offen, '#d8d8d0']] as const).map(([w, c]) => <span key={c} style={{ width: (z.n ? w / z.n * 100 : 0) + '%', background: c }} />)}</span>;
}

interface Props { stand: Studienstand; unter: string; gehe: (u: string) => void; neuLaden: () => Promise<void> }

export function Statistik({ stand, unter, gehe, neuLaden }: Props) {
  if (unter === 'karten') return (<>
    <header className="kopf"><div><h1>Statistik</h1><div className="unter">Eigene Karten – Ergebnisse im Detail</div></div></header>
    <Karten stand={stand} unter="statistik" gehe={() => {}} neuLaden={neuLaden} nurStatistik />
  </>);

  const H = heuteIso(), akt = aktuellesSemester(stand.semester);
  const mods = stand.module.filter((m) => m.plan_semester_id === akt?.id && C[m.kuerzel]).map((m) => m.kuerzel).sort((a, b) => Object.keys(C).indexOf(a) - Object.keys(C).indexOf(b));
  const tmK = Object.fromEntries(stand.teilmodule.map((t) => [t.id, t.kuerzel.slice(0, 6)]));
  const ws = plusTage(H, -((parseIso(H).getDay() + 6) % 7));
  const lz = stand.lernzeit.filter((l) => mods.includes(tmK[l.teilmodul_id]));
  const sum = (l: typeof lz) => l.reduce((x, y) => x + y.sekunden, 0);
  const lzM = mods.map((m) => ({ m, sek: sum(lz.filter((l) => tmK[l.teilmodul_id] === m)), woche: sum(lz.filter((l) => tmK[l.teilmodul_id] === m && l.datum >= ws)) }));
  const lzMax = Math.max(1, ...lzM.map((x) => x.sek));
  const anw = mods.map((m) => ({ m, z: anwesenheitVon(stand, m) }));
  const ges = anw.reduce((x, y) => ({ n: x.n + y.z.n, da: x.da + y.z.da, weg: x.weg + y.z.weg, offen: x.offen + y.z.offen }), { n: 0, da: 0, weg: 0, offen: 0 });
  const quote = ges.da + ges.weg ? Math.round(ges.da / (ges.da + ges.weg) * 100) : null;
  const K = kartenAus(stand).filter((k) => mods.includes(k.mk));
  const kM = mods.map((m) => { const ks = K.filter((k) => k.mk === m), x = { r: 0, t: 0, f: 0 }; ks.forEach((k) => { x.r += k.stat.r; x.t += k.stat.t; x.f += k.stat.f; }); return { m, ks, ...x, n: x.r + x.t + x.f }; });
  const kGes = kM.reduce((x, y) => ({ r: x.r + y.r, t: x.t + y.t, f: x.f + y.f, n: x.n + y.n }), { r: 0, t: 0, f: 0, n: 0 });
  const karte = { background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 10 };
  const raster = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px 18px' };
  const kachel = (l: string, w: string, c = 'var(--ink)') => <div key={l} style={{ background: 'var(--paper)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)' }}>{l}</span><span style={{ fontSize: 20, fontWeight: 700, color: c }}>{w}</span></div>;

  return (<>
    <header className="kopf"><div><h1>Statistik</h1><div className="unter">{akt?.bezeichnung ?? ''} · alle Module auf einen Blick</div></div></header>

    <section style={karte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Anwesenheit</h2><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{ges.da} von {ges.n} Sitzungen da{ges.offen ? ' · ' + ges.offen + ' ohne Angabe' : ''}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{kachel('Quote', quote === null ? '–' : quote + ' %', quote === null ? 'var(--ink)' : quote >= 80 ? '#2f7a4b' : quote >= 50 ? '#a3580b' : '#c42b2b')}{kachel('Gefehlt', String(ges.weg))}{kachel('Ohne Angabe', String(ges.offen))}</div>
      <div style={raster}>{anw.map(({ m, z }) => <a key={m} href={'#/module/' + m + '/statistik'} style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--ink)' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b style={{ color: farbe(m)[0] }}>{m}</b><span style={{ fontWeight: 800 }}>{z.da}/{z.n}</span></span>
        <AnwBalken z={z} />
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{z.n === 0 ? 'noch keine Sitzung' : (z.weg ? z.weg + ' gefehlt' : 'nichts verpasst') + (z.offen ? ' · ' + z.offen + ' ohne Angabe' : '')}</span></a>)}</div>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Vergangene Sitzungen; ausgefallene zählen nicht mit. Antippen öffnet die Statistik des Moduls (dort auch je Veranstaltung).</span>
    </section>

    <section style={karte}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Lernzeit</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{kachel('Heute', fmtZeit(sum(lz.filter((l) => l.datum === H))))}{kachel('Diese Woche', fmtZeit(sum(lz.filter((l) => l.datum >= ws))))}{kachel('Gesamt', fmtZeit(sum(lz)))}</div>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>davon Karten üben {fmtZeit(sum(lz.filter((l) => l.art === 'karten')))} · Lerntexte lesen {fmtZeit(sum(lz.filter((l) => l.art === 'lerntext')))}{lz.some((l) => l.art !== 'karten' && l.art !== 'lerntext') ? ' · Lernfragen ' + fmtZeit(sum(lz.filter((l) => l.art !== 'karten' && l.art !== 'lerntext'))) : ''}</span>
      <div style={raster}>{lzM.map((x) => <div key={x.m} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b style={{ color: farbe(x.m)[0] }}>{x.m}</b><span style={{ fontWeight: 800 }}>{x.sek ? fmtZeit(x.sek) : '–'}</span></span>
        <span style={{ display: 'block', height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: Math.round(x.sek / lzMax * 100) + '%', background: farbe(x.m)[0] }} /></span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>diese Woche {x.woche ? fmtZeit(x.woche) : '–'}</span></div>)}</div>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Gezählt wird nur aktives Lernen. Nach 1 Minute ohne Eingabe oder wenn die App im Hintergrund ist, stoppt die Uhr.</span>
    </section>

    <section style={karte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Eigene Karten</h2><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{K.length} Karten · {kGes.n} Antworten{kGes.n ? ' · ' + Math.round(kGes.r / kGes.n * 100) + ' % richtig' : ''}</span></div>
      <div style={raster}>{kM.map((x) => <div key={x.m} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b style={{ color: farbe(x.m)[0] }}>{x.m}</b><span style={{ fontWeight: 800 }}>{x.n ? Math.round(x.r / x.n * 100) + ' %' : '–'}</span></span>
        <span style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f0f0eb' }}>{([[x.r, '#5aa36f'], [x.t, '#e3a548'], [x.f, '#d06a6a']] as const).map(([w, c]) => <span key={c} style={{ width: (x.n ? w / x.n * 100 : 0) + '%', background: c }} />)}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{x.ks.length ? x.ks.length + (x.ks.length === 1 ? ' Karte' : ' Karten') + (x.n ? ' · ✓ ' + x.r + ' ◐ ' + x.t + ' ✗ ' + x.f : ' · noch nicht geübt') : 'keine Karten'}</span></div>)}</div>
      <button type="button" onClick={() => gehe('karten')} style={{ alignSelf: 'flex-start', minHeight: 34, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 13, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>Karten im Detail →</button>
    </section>
  </>);
}
