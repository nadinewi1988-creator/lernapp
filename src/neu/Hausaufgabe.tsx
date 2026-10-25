// Hausaufgaben aus den Sitzungsdateien (aufgaben mit art „Hausaufgabe“):
// verknüpft mit dem Kalendereintrag (kalender_id) und der Sitzung, für die sie gebraucht wird (fuer_sitzung).
import { useEffect, useRef, useState } from 'react';
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
  const [pdf, setPdf] = useState(false);
  const { s, a } = ha;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      {pdf && a.pdf && <PdfAnsicht url={a.pdf} titel={a.titel ?? 'Hausaufgabe'} zu={() => setPdf(false)} />}
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>aufgegeben in {s.teilmodul} · Sitzung {s.sitzung_nr} ({dm(s.datum)}){a.frist ? ' · fällig ' + dm(a.frist) : ''} · {a.quelle}</span>
      <span style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{a.text}</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {a.pdf && <button type="button" onClick={() => setPdf(true)} style={{ border: 0, background: 'none', padding: 0, fontSize: 13, fontWeight: 800, color: farbe, cursor: 'pointer' }}>📄 Hausaufgabe als PDF öffnen</button>}
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

/** PDF innerhalb der App anzeigen (wichtig auf Tablet/Handy als installierte App: kein neues Fenster, aus dem man nicht zurückkommt). */
export function PdfAnsicht({ url, titel, zu }: { url: string; titel: string; zu: () => void }) {
  const knopf = { minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #e6e6e0', background: '#fff', color: '#1f2328', fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' } as const;
  return (
    <div role="dialog" aria-label={titel} style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f7f7f4', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #e6e6e0', background: '#fff' }}>
        <button type="button" onClick={zu} style={{ ...knopf, fontWeight: 800 }} autoFocus>← Zurück zur App</button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titel}</span>
        <a href={url} download style={knopf}>Herunterladen</a>
      </div>
      <PdfSeiten url={url} />
    </div>
  );
}

/** Rendert alle PDF-Seiten mit pdf.js als Bilder – funktioniert auch auf iPad/iPhone (dort zeigt ein iframe oft nur Seite 1). */
function PdfSeiten({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('lädt …');
  useEffect(() => {
    let abbruch = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const doc = await pdfjs.getDocument(url).promise;
        const el = box.current; if (!el || abbruch) return;
        el.innerHTML = '';
        const breite = Math.min(el.clientWidth - 24, 900);
        for (let i = 1; i <= doc.numPages; i++) {
          const seite = await doc.getPage(i); if (abbruch) return;
          const v1 = seite.getViewport({ scale: 1 });
          const scale = (breite / v1.width) * (window.devicePixelRatio || 1);
          const vp = seite.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height;
          c.style.width = breite + 'px'; c.style.maxWidth = '100%'; c.style.display = 'block'; c.style.margin = '12px auto'; c.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)'; c.style.background = '#fff';
          el.appendChild(c);
          await seite.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        }
        setStatus('');
      } catch (e) { setStatus('PDF konnte nicht angezeigt werden – bitte „Herunterladen“ nutzen.'); }
    })();
    return () => { abbruch = true; };
  }, [url]);
  return (
    <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 12px 24px' }}>
      {status && <div style={{ padding: 16, fontSize: 14, color: '#6b6f76' }}>{status}</div>}
      <div ref={box} />
    </div>
  );
}
