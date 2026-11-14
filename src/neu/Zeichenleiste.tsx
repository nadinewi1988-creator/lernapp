import { useRef } from 'react';
import { useKlapp } from './klapp';
import { symboleVon } from './lerninhalte';

/**
 * Zeichenleiste (Nadine, 13.11.2026): Mathe-/Sonderzeichen in Antwortfelder einfügen (Lernfragen, Eigene Karten üben).
 * Fügt an der Cursorstelle des zuletzt angetippten Eingabefelds ein. Auf-/zuklappbar (useKlapp, standardmäßig zu).
 */
// ▮ = Cursorposition nach dem Einfügen (Vorlagen)
const GRUND: [string, string[]][] = [
  ['Vorlagen', ['(▮)/()', '[▮; ]', ']▮; [', '[▮; [', ']▮; ]', '{▮}', '|▮|', 'P(▮)', 'P(▮|)', '√(▮)', '^(▮)', '_(▮)']],
  ['Mengen', ['∈', '∉', '⊂', '⊆', '∪', '∩', '\\', '∅', 'Ω', 'ω', '{', '}', '|', '×', '𝔓', 'Ā']],
  ['Zahlen', ['ℕ', 'ℤ', 'ℚ', 'ℝ', '≤', '≥', '≠', '≈', '±', '·', '÷', '/', '√', '²', '³', 'ⁿ', '½', '⅓', '¼', '∞', 'π', '₀', '₁', '₂', 'ₙ', '⁻¹', '[', ']', ';']],
  ['Karten · Würfel', ['♥\uFE0E', '♦\uFE0E', '♠\uFE0E', '♣\uFE0E', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']],
  ['Logik · Griechisch', ['→', '⇒', '⇔', '¬', '∧', '∨', '∀', '∃', '∑', '∏', '∫', 'ω', 'σ', 'μ', 'λ', 'α', 'β', 'ε']],
];
const LABEL: Record<string, string> = { '(▮)/()': 'a⁄b', '[▮; ]': '[a; b]', ']▮; [': ']a; b[', '[▮; [': '[a; b[', ']▮; ]': ']a; b]', '{▮}': '{ }', '|▮|': '| |', 'P(▮)': 'P( )', 'P(▮|)': 'P(A|B)', '√(▮)': '√( )', '^(▮)': 'xⁿ', '_(▮)': 'xₙ' };
const TITEL: Record<string, string> = { '(▮)/()': 'Bruch – schreibt (Zähler)/(Nenner)', '^(▮)': 'hoch …', '_(▮)': 'Index …' };

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
  const marke = z.indexOf('▮'); z = z.replace('▮', '');
  const neu = el.value.slice(0, a) + z + el.value.slice(b);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, neu);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  const p = a + (marke >= 0 ? marke : z.length);
  const setze = () => { try { el!.setSelectionRange(p, p); } catch { /* */ } };
  setze(); requestAnimationFrame(setze);
}

export function Zeichenleiste({ modul, feld, farbe }: { modul: string; feld: React.MutableRefObject<Eingabe | null>; farbe?: string }) {
  const [auf, setAuf] = useKlapp<boolean>('zeichenleiste', false);
  const eigene = symboleVon(modul).map((s) => s.zeichen).filter((z) => z && [...z].length <= 14 && !/[\\$]/.test(z)).map((z) => z.replace('…', '▮'));
  // „Modul“ = ALLE Zeichen, die in diesem Modul vorkommen (auch wenn sie zusätzlich in einer anderen Gruppe stehen) – damit man nicht hin und her springen muss
  const gruppen: [string, string[]][] = [...(eigene.length ? [['Aus dem Modul', [...new Set(eigene)]] as [string, string[]]] : []), ...GRUND];
  const [gr, setGr] = useKlapp<string>('zeichenleiste-gruppe', '');
  const aktiv = gruppen.find(([n]) => n === gr) ?? gruppen[0];
  const kurz = (n: string) => (n === 'Aus dem Modul' ? 'Modul' : n);
  const keinFokus = (ev: React.MouseEvent) => ev.preventDefault();
  const BEDEUTUNG: Record<string, string> = Object.fromEntries(symboleVon(modul).map((y) => [y.zeichen.replace('…', '▮'), y.bedeutung + (y.gelesen ? ' – gesprochen: ' + y.gelesen : '')]));
  // Reiter „Modul“ geordnet statt durcheinander: erst einzelne Zeichen, dann Ausdrücke nach Thema (Nadine, 14.11.)
  const abschnitte = ([name, liste]: [string, string[]]): [string, string[]][] => {
    if (name !== 'Aus dem Modul') return [['', liste]];
    const art = (z: string) => [...z.replace('▮', '')].length <= 2 && !/[([]/.test(z) ? 'Zeichen'
      : /[∑∏⋃⋂]/.test(z) ? 'Summen · Vereinigungen · Produkte'
      : /^[\[\]]|∞/.test(z) ? 'Intervalle'
      : /^(P|B\(|L\(|h|H|p,|\|A\|\/)/.test(z) ? 'Wahrscheinlichkeit'
      : 'Mengen · Räume · Tupel';
    const reihen = ['Zeichen', 'Mengen · Räume · Tupel', 'Intervalle', 'Wahrscheinlichkeit', 'Summen · Vereinigungen · Produkte'];
    return reihen.map((r) => [r, liste.filter((z) => art(z) === r)] as [string, string[]]).filter(([, l]) => l.length);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" onMouseDown={keinFokus} onClick={() => setAuf(!auf)} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: 0, fontSize: 13, fontWeight: 800, color: farbe ?? 'var(--ink-2)', cursor: 'pointer' }}>
        {auf ? '▾' : '▸'} Zeichen einfügen
      </button>
      {auf && <div style={{ background: 'var(--paper)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {gruppen.map(([n]) => <button key={n} type="button" onMouseDown={keinFokus} onClick={() => setGr(n)} style={{ border: 0, borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer', background: aktiv[0] === n ? '#fff' : 'transparent', color: aktiv[0] === n ? (farbe ?? 'var(--ink)') : 'var(--ink-3)', boxShadow: aktiv[0] === n ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}>{kurz(n)}</button>)}
        </div>
        {abschnitte(aktiv).map(([titel, liste]) => (
          <div key={titel || 'alle'} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {titel && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', padding: '4px 4px 0' }}>{titel}</span>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {liste.map((z) => <button key={z} type="button" title={BEDEUTUNG[z] ?? TITEL[z] ?? LABEL[z] ?? z} onMouseDown={keinFokus} onClick={() => einfuegen(feld.current, z)} style={{ minWidth: 40, height: 38, border: 0, borderRadius: 8, background: 'transparent', fontSize: [...z].length > 2 ? 16 : 18, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', padding: '0 8px' }} onMouseEnter={(ev) => { ev.currentTarget.style.background = '#fff'; }} onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}>{LABEL[z] ?? z.replace('▮', '…')}</button>)}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}
