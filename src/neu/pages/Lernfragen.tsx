import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Studienstand } from '../db';
import { speichereAntwort, speichereLernzeit } from '../db';
import { gradeAnswer } from '../../lib/api';
import { heuteIso } from '../pruefungslogik';
import { plusTage } from '../data/kalender';
import { frageRef, mdHtml, mdInline, type LFrage, type LSitzung } from '../lerninhalte';
const H = (t?: string) => ({ __html: mdInline(t ?? '') });


const STUFEN = [1, 3, 7, 14, 30, 60];
function naechste(stufe: number, erg: 'r' | 't' | 'f') {
  const h = heuteIso();
  if (erg === 'r') { const s2 = Math.min(stufe + 1, STUFEN.length); return { stufe: s2, faellig: plusTage(h, STUFEN[s2 - 1]) }; }
  if (erg === 't') return { stufe: Math.max(stufe - 1, 0), faellig: plusTage(h, 1) };
  return { stufe: 0, faellig: plusTage(h, 1) };
}
const norm = (s: string) => String(s || '').toLowerCase().replace(/[.,;:!?„“"'()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
const FORM: Record<string, string> = { frage: 'Frage', mc: 'Multiple Choice', luecke: 'Lückentext', zuordnung: 'Zuordnung', offen: 'Offene Aufgabe' };
const ERG: Record<'r' | 't' | 'f', [string, string, string]> = { r: ['Richtig', '#e3f2e8', '#2f7a4b'], t: ['Teilweise', '#fff3e0', '#a3580b'], f: ['Noch nicht', '#fcecee', '#b4475a'] };

export interface LFEintrag { s: LSitzung; f: LFrage }

export function Lernfragen({ titel, liste, stand, farbe, onClose, neuLaden }: { titel: string; liste: LFEintrag[]; stand: Studienstand; farbe: [string, string]; onClose: () => void; neuLaden: () => Promise<void> }) {
  const wd = useMemo(() => Object.fromEntries(stand.wiederholung.map((w) => [w.frage_ref, w])), [stand.wiederholung]);
  const [i, setI] = useState(0);
  const [antwort, setAntwort] = useState<{ mc: number[]; luecken: string[]; zuord: Record<number, string>; text: string }>({ mc: [], luecken: [], zuord: {}, text: '' });
  const [geprueft, setGeprueft] = useState(false);
  const [erg, setErg] = useState<null | 'r' | 't' | 'f'>(null);
  const [protokoll, setProtokoll] = useState<('r' | 't' | 'f')[]>([]);
  const [fehler, setFehler] = useState('');
  const [ki, setKi] = useState<null | { lade: boolean; pct?: number; fb?: string; fehler?: string }>(null);
  const fertig = i >= liste.length;
  const e = liste[i];

  const knopf: CSSProperties = { minHeight: 40, padding: '0 16px', border: '1px solid var(--line)', borderRadius: 999, background: '#fff', fontSize: 14, fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' };
  const haupt: CSSProperties = { ...knopf, background: farbe[0], borderColor: farbe[0], color: '#fff' };

  function speichern(r: 'r' | 't' | 'f') {
    const ref = frageRef(e.s, e.f);
    const t = stand.teilmodule.find((x) => x.kuerzel === e.s.teilmodul);
    const n = naechste(wd[ref]?.stufe ?? 0, r);
    setErg(r); setProtokoll((p) => [...p, r]);
    speichereAntwort({ frage_ref: ref, modul_id: t?.modul_id ?? null, teilmodul_id: t?.id ?? null, ergebnis: r === 'r' ? 'richtig' : r === 't' ? 'teilweise' : 'falsch', modus: 'anfaenger' }, { stand: r === 'r' ? 'sicher' : 'unsicher', ...n })
      .catch((x) => setFehler('Speichern hat nicht geklappt: ' + String((x as Error).message || x)));
  }
  function pruefen() {
    const f = e.f; setGeprueft(true);
    if (f.format === 'mc') { const soll = [...(f.richtig ?? [])].sort().join(','), ist = [...antwort.mc].sort().join(','); speichern(soll === ist ? 'r' : antwort.mc.some((x) => f.richtig?.includes(x)) ? 't' : 'f'); }
    else if (f.format === 'luecke') { const soll = [...(f.text ?? '').matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1]); const ok = soll.filter((s, k) => norm(antwort.luecken[k] ?? '') === norm(s)).length; speichern(ok === soll.length ? 'r' : ok > 0 ? 't' : 'f'); }
    else if (f.format === 'zuordnung') { const el = f.elemente ?? []; const ok = el.filter((x, k) => antwort.zuord[k] === x.kategorie).length; speichern(ok === el.length ? 'r' : ok >= el.length / 2 ? 't' : 'f'); }
  }
  function weiter() { setI(i + 1); setGeprueft(false); setErg(null); setKi(null); setAntwort({ mc: [], luecken: [], zuord: {}, text: '' }); }
  // Freitext (Frage → Antwort, offene Aufgabe): mit eigener Antwort bewertet die KI – ab 90 % gewusst, 50–89 % teilweise, darunter nicht gewusst
  function aufdecken() {
    setGeprueft(true);
    const f = e.f, text = antwort.text.trim();
    if (!text) return;
    const muster = f.format === 'offen' ? (f.musterloesung ?? '') + ((f.bewertungspunkte ?? []).length ? '\nBewertungspunkte: ' + f.bewertungspunkte!.join('; ') : '') : (f.antwort ?? '');
    setKi({ lade: true });
    gradeAnswer(f.frage ?? '', muster, text).then((r) => {
      const fehl = /^(fehler|bewertung nicht verfügbar|antwort konnte nicht)/i.test(r.fb.trim());
      setKi(fehl ? { lade: false, fehler: r.fb } : { lade: false, pct: r.pct, fb: r.fb });
    }).catch((x) => setKi({ lade: false, fehler: String((x as Error).message || x) }));
  }
  const kiErg: 'r' | 't' | 'f' | null = ki && !ki.lade && !ki.fehler && ki.pct !== undefined ? (ki.pct >= 90 ? 'r' : ki.pct >= 50 ? 't' : 'f') : null;
  // Lernzeit (art „lernfragen“): zählt nur, solange das Fenster offen ist und Nadine aktiv ist
  const aktiv = useRef(Date.now()), lz = useRef<{ tid: string; sek: number } | null>(null), basis = useRef<Record<string, number>>({});
  const tidAkt = e ? stand.teilmodule.find((t) => t.kuerzel === e.s.teilmodul)?.id ?? null : null;
  const lzFlush = () => { const z = lz.current; if (!z || z.sek < 5) return; const H = heuteIso(), key = H + '|' + z.tid; const b = basis.current[key] ?? (stand.lernzeit.find((l) => l.datum === H && l.teilmodul_id === z.tid && l.art === 'lernfragen')?.sekunden ?? 0); basis.current[key] = b + z.sek; lz.current = { tid: z.tid, sek: 0 }; speichereLernzeit({ datum: H, teilmodul_id: z.tid, art: 'lernfragen', sekunden: b + z.sek }).catch(() => {}); };
  useEffect(() => { const auf = () => { aktiv.current = Date.now(); }; const ev = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel']; ev.forEach((x) => document.addEventListener(x, auf, { passive: true, capture: true })); return () => ev.forEach((x) => document.removeEventListener(x, auf, { capture: true })); }, []);
  useEffect(() => {
    if (!tidAkt) return;
    if (lz.current && lz.current.tid !== tidAkt) lzFlush();
    if (!lz.current || lz.current.tid !== tidAkt) lz.current = { tid: tidAkt, sek: 0 };
    const t = setInterval(() => { if (document.visibilityState !== 'hidden' && Date.now() - aktiv.current < 60000 && lz.current) lz.current.sek += 5; }, 5000);
    const f = setInterval(lzFlush, 60000);
    return () => { clearInterval(t); clearInterval(f); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tidAkt]);
  useEffect(() => () => lzFlush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  function schliessen() { lzFlush(); neuLaden().catch(() => {}); onClose(); }

  const anz = { r: protokoll.filter((x) => x === 'r').length, t: protokoll.filter((x) => x === 't').length, f: protokoll.filter((x) => x === 'f').length };

  return (
    <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) schliessen(); }} style={{ zIndex: 30 }}>
      <div role="dialog" aria-label="Lernfragen" className="dialog" style={{ maxWidth: 640, gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: farbe[0] }}>{titel}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fertig ? 'fertig' : 'Frage ' + (i + 1) + ' von ' + liste.length}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: '#f0f0eb', overflow: 'hidden' }}><div style={{ height: '100%', width: Math.round(Math.min(i, liste.length) / Math.max(1, liste.length) * 100) + '%', background: farbe[0] }} /></div>
        {fehler && <div className="karte fehler">{fehler}</div>}

        {fertig ? <>
          <h2 style={{ margin: 0, fontSize: 20 }}>Geschafft</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {(['r', 't', 'f'] as const).map((k) => <div key={k} style={{ background: ERG[k][1], borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, fontWeight: 800, color: ERG[k][2] }}>{ERG[k][0]}</span><span style={{ fontSize: 22, fontWeight: 800 }}>{anz[k]}</span></div>)}
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Richtige Fragen kommen nach 1, 3, 7, 14, 30, 60 Tagen wieder, die anderen morgen.</span>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={schliessen} style={haupt}>Schließen</button></div>
        </> : <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: farbe[1], color: farbe[0] }}>{FORM[e.f.format]}</span>
            {e.f.pruefungsrelevant && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fde9e9', color: '#c42b2b' }}>prüfungsrelevant</span>}
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{e.s.teilmodul} · {e.s.datum.split('-').reverse().join('.')}{e.f.folie ? ' · ' + (e.s.teilmodul.endsWith('.1') ? 'Folie ' : '') + e.f.folie : ''}</span>
          </div>

          {e.f.format !== 'luecke' && <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }} dangerouslySetInnerHTML={H(e.f.frage)} />}

          {e.f.format === 'mc' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(e.f.optionen ?? []).map((o, k) => { const an = antwort.mc.includes(k), ok = e.f.richtig?.includes(k);
              const bg = geprueft ? (ok ? '#e3f2e8' : an ? '#fcecee' : '#fff') : an ? farbe[1] : '#fff';
              return <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid ' + (an && !geprueft ? farbe[0] : 'var(--line)'), borderRadius: 12, background: bg, cursor: geprueft ? 'default' : 'pointer', fontSize: 14 }}>
                <input type="checkbox" disabled={geprueft} checked={an} onChange={() => setAntwort({ ...antwort, mc: an ? antwort.mc.filter((x) => x !== k) : [...antwort.mc, k] })} style={{ width: 18, height: 18, marginTop: 1, accentColor: farbe[0] }} />
                <span><span dangerouslySetInnerHTML={H(o)} />{geprueft && ok ? ' ✓' : ''}</span></label>; })}
            {!geprueft && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Es können auch mehrere Antworten richtig sein.</span>}
          </div>}

          {e.f.format === 'luecke' && (() => { let k = -1; const teile = (e.f.text ?? '').split(/(\[\[.+?\]\])/);
            return <div style={{ fontSize: 16, lineHeight: 2.2 }}>{teile.map((t, j) => { const m = /^\[\[(.+?)\]\]$/.exec(t); if (!m) return <span key={j} dangerouslySetInnerHTML={H(t)} />; k++; const idx = k; const richtig = norm(antwort.luecken[idx] ?? '') === norm(m[1]);
              return geprueft ? <b key={j} style={{ padding: '2px 6px', borderRadius: 6, background: richtig ? '#e3f2e8' : '#fcecee', color: richtig ? '#2f7a4b' : '#b4475a' }}>{richtig ? m[1] : (antwort.luecken[idx] ? antwort.luecken[idx] + ' → ' : '') + m[1]}</b>
                : <input key={j} aria-label={'Lücke ' + (idx + 1)} value={antwort.luecken[idx] ?? ''} onChange={(ev) => { const l = [...antwort.luecken]; l[idx] = ev.target.value; setAntwort({ ...antwort, luecken: l }); }} style={{ width: Math.max(6, m[1].length + 2) + 'ch', border: 0, borderBottom: '2px solid ' + farbe[0], background: farbe[1], borderRadius: 4, padding: '2px 6px', fontSize: 15, color: 'var(--ink)' }} />; })}</div>; })()}

          {e.f.format === 'zuordnung' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(e.f.elemente ?? []).map((x, k) => { const w = antwort.zuord[k] ?? '', ok = w === x.kategorie;
              return <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: geprueft ? (ok ? '#e3f2e8' : '#fcecee') : '#fff', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: 14 }} dangerouslySetInnerHTML={H(x.text)} />
                {geprueft ? <span style={{ fontSize: 13, fontWeight: 800, color: ok ? '#2f7a4b' : '#b4475a' }}>{ok ? x.kategorie : (w ? w + ' → ' : '') + x.kategorie}</span>
                  : <select aria-label={'Zuordnung für ' + x.text} value={w} onChange={(ev) => setAntwort({ ...antwort, zuord: { ...antwort.zuord, [k]: ev.target.value } })} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', minWidth: 0 }}>
                    <option value="">wählen …</option>{(e.f.kategorien ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</select>}
              </div>; })}
          </div>}

          {(e.f.format === 'frage' || e.f.format === 'offen') && !geprueft && <textarea value={antwort.text} onChange={(ev) => setAntwort({ ...antwort, text: ev.target.value })} rows={e.f.format === 'offen' ? 5 : 3} placeholder="Deine Antwort (optional) – mit Antwort bewertet die KI, sonst aufdecken und selbst bewerten" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 10, fontSize: 14, background: 'var(--paper)', color: 'var(--ink)', resize: 'vertical' }} />}
          {(e.f.format === 'frage' || e.f.format === 'offen') && geprueft && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {antwort.text && <div style={{ fontSize: 13, color: 'var(--ink-2)', borderLeft: '3px solid var(--line)', paddingLeft: 10, whiteSpace: 'pre-wrap' }}><b>Deine Antwort:</b> {antwort.text}</div>}
            <div style={{ background: farbe[1], borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 1.5 }}><b>{e.f.format === 'offen' ? 'Musterlösung' : 'Antwort'}:</b> <span dangerouslySetInnerHTML={H(e.f.format === 'offen' ? e.f.musterloesung : e.f.antwort)} /></div>
            {ki && <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ki.lade ? <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>KI prüft deine Antwort …</span>
                : ki.fehler ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Die KI-Rückmeldung hat gerade nicht geklappt – bitte selbst bewerten. ({ki.fehler.slice(0, 120)})</span>
                : <><span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: 12, color: 'var(--ink-3)' }}>KI-Rückmeldung</b><span style={{ fontSize: 18, fontWeight: 800, color: ki.pct! >= 90 ? '#2f7a4b' : ki.pct! >= 50 ? '#a3580b' : '#c42b2b' }}>{ki.pct} %</span></span><span style={{ fontSize: 14, lineHeight: 1.45 }}>{ki.fb}</span></>}
            </div>}
            {e.f.format === 'offen' && (e.f.bewertungspunkte ?? []).length > 0 && <div style={{ fontSize: 13, color: 'var(--ink-2)' }}><b>Darauf kommt es an{e.f.punkte ? ' (' + e.f.punkte + ' Punkte)' : ''}:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{e.f.bewertungspunkte!.map((p) => <li key={p} dangerouslySetInnerHTML={H(p)} />)}</ul></div>}
          </div>}

          {geprueft && e.f.erklaerung && e.f.format !== 'frage' && <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: '<b>Erklärung:</b> ' + mdHtml(e.f.erklaerung).replace(/^<p>|<\/p>$/g, '') }} />}
          {erg && <span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: ERG[erg][1], color: ERG[erg][2] }}>{ERG[erg][0]}</span>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={schliessen} style={knopf}>Beenden</button>
            {!geprueft && (e.f.format === 'frage' || e.f.format === 'offen' ? <button type="button" onClick={aufdecken} style={haupt}>{antwort.text.trim() ? 'Prüfen' : 'Aufdecken'}</button> : <button type="button" onClick={pruefen} style={haupt}>Prüfen</button>)}
            {geprueft && !erg && kiErg && <>{kiErg !== 'r' && <button type="button" onClick={() => speichern('r')} style={knopf}>Trotzdem als gewusst zählen</button>}<button type="button" onClick={() => speichern(kiErg)} style={haupt}>Übernehmen: {kiErg === 'r' ? 'Gewusst' : kiErg === 't' ? 'Teilweise' : 'Nicht gewusst'}</button></>}
            {geprueft && !erg && !kiErg && !ki?.lade && (['r', 't', 'f'] as const).map((k) => <button key={k} type="button" onClick={() => speichern(k)} style={{ ...knopf, background: ERG[k][1], color: ERG[k][2], borderColor: ERG[k][1] }}>{k === 'r' ? 'Gewusst' : k === 't' ? 'Teilweise' : 'Nicht gewusst'}</button>)}
            {erg && <button type="button" onClick={weiter} style={haupt}>{i + 1 < liste.length ? 'Weiter' : 'Auswertung'}</button>}
          </div>
        </>}
      </div>
    </div>
  );
}
