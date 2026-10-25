// Hausaufgaben aus den Sitzungsdateien (aufgaben mit art „Hausaufgabe“):
// verknüpft mit dem Kalendereintrag (kalender_id) und der Sitzung, für die sie gebraucht wird (fuer_sitzung).
import { useState } from 'react';
import { alleSitzungen, mdHtml, type LSitzung, type LAufgabe } from './lerninhalte';

export interface HA { s: LSitzung; a: LAufgabe }
const istHA = (a: LAufgabe) => /hausaufgabe/i.test(a.art);
export const hausaufgabeZuEintrag = (id: string | undefined | null): HA | null => {
  if (!id) return null;
  for (const s of alleSitzungen()) for (const a of s.aufgaben ?? []) if (istHA(a) && a.kalender_id === id) return { s, a };
  return null;
};
export const hausaufgabenFuer = (teil: string, datum: string): HA[] =>
  alleSitzungen().flatMap((s) => (s.aufgaben ?? []).filter((a) => istHA(a) && a.fuer_sitzung === teil + '_' + datum).map((a) => ({ s, a })));
/** Hausaufgaben, die in dieser Sitzung gestellt wurden. */
export const hausaufgabenAus = (teil: string, datum: string): HA[] =>
  alleSitzungen().filter((s) => s.teilmodul === teil && s.datum === datum).flatMap((s) => (s.aufgaben ?? []).filter(istHA).map((a) => ({ s, a })));
const dm = (iso?: string) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' : '');

/** Inhalt einer Hausaufgabe: Aufgabentext, Lösung (aufklappbar), PDF. */
export function HausaufgabeInhalt({ ha, farbe }: { ha: HA; farbe: string }) {
  const [auf, setAuf] = useState(false);
  const { s, a } = ha;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>aufgegeben in {s.teilmodul} · Sitzung {s.sitzung_nr} ({dm(s.datum)}){a.frist ? ' · fällig ' + dm(a.frist) : ''} · {a.quelle}</span>
      <span style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{a.text}</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {a.pdf && <a href={a.pdf} target="_blank" rel="noopener" style={{ fontWeight: 800, color: farbe }}>📄 Hausaufgabe als PDF öffnen</a>}
        <button type="button" onClick={() => setAuf(!auf)} style={{ border: 0, background: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: farbe, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>{auf ? 'Lösung ausblenden' : 'Lösung / Ausarbeitung anzeigen'}</button>
      </div>
      {auf && <div style={{ background: '#f7f7f4', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="lt-md" dangerouslySetInnerHTML={{ __html: mdHtml(a.loesung) }} />
        {a.loesungsweg && <span style={{ whiteSpace: 'pre-wrap' }}><b>Vorgehen: </b>{a.loesungsweg}</span>}
      </div>}
    </div>
  );
}

/** Kasten mit Überschrift (für Kalender-/Sitzungsfenster). */
export function HausaufgabeKasten({ ha, farbe, titel }: { ha: HA; farbe: string; titel?: string }) {
  return (
    <div style={{ background: '#fdf1d6', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <b style={{ fontSize: 14, color: '#8a5a12' }}>{titel ?? 'Hausaufgabe'}{ha.a.titel ? ': ' + ha.a.titel : ''}</b>
      <HausaufgabeInhalt ha={ha} farbe={farbe} />
    </div>
  );
}

/** Eigenes Fenster (z. B. vom Dashboard aus). */
export function HausaufgabeFenster({ ha, farbe, zu }: { ha: HA; farbe: string; zu: () => void }) {
  return (
    <div className="dialog-hg" onClick={(ev) => { if (ev.target === ev.currentTarget) zu(); }} style={{ zIndex: 30 }}>
      <div role="dialog" aria-label="Hausaufgabe" className="dialog" style={{ maxWidth: 560, gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: farbe }}>{ha.s.teilmodul} · Hausaufgabe</div>
        <h2 style={{ margin: 0 }}>{ha.a.titel ?? 'Hausaufgabe'}</h2>
        <HausaufgabeInhalt ha={ha} farbe={farbe} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={zu} style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: '1px solid #e6e6e0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Schließen</button></div>
      </div>
    </div>
  );
}
