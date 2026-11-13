import { useRef } from 'react';
import { useKlapp } from './klapp';
import { symboleVon } from './lerninhalte';

/**
 * Zeichenleiste (Nadine, 13.11.2026): Mathe-/Sonderzeichen in Antwortfelder einfügen (Lernfragen, Eigene Karten üben).
 * Fügt an der Cursorstelle des zuletzt angetippten Eingabefelds ein. Auf-/zuklappbar (useKlapp, standardmäßig zu).
 */
const GRUND: [string, string[]][] = [
  ['Mengen', ['∈', '∉', '⊂', '⊆', '∪', '∩', '\\', '∅', 'Ω', '{', '}', '|', '×', '𝔓', 'Ā']],
  ['Zahlen', ['ℕ', 'ℤ', 'ℚ', 'ℝ', '≤', '≥', '≠', '≈', '±', '·', '÷', '√', '²', '³', 'ⁿ', '½', '∞', 'π', '₀', '₁', '₂', 'ₙ', '⁻¹']],
  ['Logik', ['→', '⇒', '⇔', '¬', '∧', '∨', '∀', '∃', '∑', '∏', '∫', 'σ', 'μ', 'λ', 'α', 'β']],
];

export type Eingabe = HTMLInputElement | HTMLTextAreaElement;

/** Merkt sich das zuletzt fokussierte Eingabefeld in einem Bereich: an den umgebenden Container hängen (onFocusCapture). */
export function useLetztesFeld() {
  const ref = useRef<Eingabe | null>(null);
  const onFocusCapture = (ev: React.FocusEvent) => {
    const t = ev.target as HTMLElement;
    if ((t instanceof HTMLTextAreaElement) || (t instanceof HTMLInputElement && (t.type === 'text' || t.type === ''))) ref.current = t as Eingabe;
  };
  return { ref, onFocusCapture };
}

function einfuegen(el: Eingabe | null, z: string) {
  if (!el || !document.body.contains(el)) el = document.querySelector('.ueben-hg textarea, .ueben-hg input[type="text"], .ueben-hg input:not([type])') as Eingabe | null;
  if (!el) return;
  const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
  const neu = el.value.slice(0, a) + z + el.value.slice(b);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, neu);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  const p = a + z.length;
  requestAnimationFrame(() => { try { el.setSelectionRange(p, p); } catch { /* */ } });
}

export function Zeichenleiste({ modul, feld, farbe }: { modul: string; feld: React.MutableRefObject<Eingabe | null>; farbe?: string }) {
  const [auf, setAuf] = useKlapp<boolean>('zeichenleiste', false);
  const eigene = symboleVon(modul).map((s) => s.zeichen).filter((z) => z && z.length <= 4 && !/[\\$]/.test(z));
  const alle = new Set(GRUND.flatMap(([, l]) => l));
  const gruppen: [string, string[]][] = [...(eigene.some((z) => !alle.has(z)) ? [['Aus dem Modul', [...new Set(eigene)].filter((z) => !alle.has(z))] as [string, string[]]] : []), ...GRUND];
  const knopf: React.CSSProperties = { minWidth: 34, height: 34, padding: '0 6px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', fontSize: 17, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => setAuf(!auf)} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: 0, fontSize: 13, fontWeight: 800, color: farbe ?? 'var(--ink-2)', cursor: 'pointer' }}>
        {auf ? '▾' : '▸'} Zeichen einfügen (∈ ∪ ≤ √ …)
      </button>
      {auf && gruppen.map(([name, liste]) => (
        <div key={name} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', width: 86 }}>{name}</span>
          {liste.map((z) => <button key={z} type="button" title={z} onMouseDown={(ev) => ev.preventDefault()} onClick={() => einfuegen(feld.current, z)} style={knopf}>{z}</button>)}
        </div>
      ))}
    </div>
  );
}
