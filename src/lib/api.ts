import { supabase, syncEnabled } from '../supabase';

// Ruft die serverseitige Edge Function "grade" auf. Der API-Key
// liegt NUR dort – hier geht nur die Anfrage raus.
async function callGrade(body: Record<string, unknown>): Promise<string> {
  if (!syncEnabled) {
    return 'Bewertung nicht verfügbar (Sync/Backend nicht konfiguriert).';
  }
  const { data, error } = await supabase.functions.invoke('grade', { body });
  if (error) return 'Fehler bei der Bewertung: ' + error.message;
  return (data as { text?: string })?.text ?? '';
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Prozentwert + Feedback möglichst tolerant aus der KI-Antwort lesen.
 * 1) sauberen JSON-Block parsen (auch wenn Text drumherum steht),
 * 2) falls das scheitert, Prozent notfalls per Regex direkt aus dem
 *    Rohtext ziehen. So gibt es keinen harten Absturz auf 0 % mehr,
 *    nur weil das Format leicht abweicht.
 */
function parseGrade(text: string): { pct: number; fb: string } | null {
  // 1) JSON-Block herausschneiden (erstes { ... letztes })
  const block = text.match(/\{[\s\S]*\}/);
  const candidate = (block ? block[0] : text)
    .replace(/```json|```/g, '')
    .trim();
  try {
    const p = JSON.parse(candidate) as { prozent?: unknown; feedback?: unknown };
    const num = Number(p.prozent);
    if (!Number.isNaN(num)) {
      return { pct: clamp(num), fb: p.feedback ? String(p.feedback) : '' };
    }
  } catch {
    /* weiter zum Regex-Weg */
  }

  // 2) Fallback: Prozent direkt aus dem Text fischen
  const m =
    text.match(/prozent["']?\s*[:=]\s*(\d{1,3})/i) ||
    text.match(/(\d{1,3})\s*%/);
  if (m) {
    const fbM = text.match(/feedback["']?\s*[:=]\s*["']?([^"}\n]+)/i);
    return { pct: clamp(Number(m[1])), fb: fbM ? fbM[1].trim() : '' };
  }
  return null;
}

/** Antwort bewerten -> Prozent + Feedback. */
export async function gradeAnswer(
  frage: string,
  musterantwort: string,
  nutzerantwort: string
): Promise<{ pct: number; fb: string }> {
  const text = await callGrade({
    mode: 'bewerten',
    frage,
    musterantwort,
    nutzerantwort,
  });
  const parsed = parseGrade(text);
  if (parsed) return parsed;
  return { pct: 0, fb: text || 'Antwort konnte nicht bewertet werden.' };
}

/** Ermutigende Zweiterklärung bei niedriger Bewertung. */
export async function helpFor(
  frage: string,
  musterantwort: string
): Promise<string> {
  return callGrade({ mode: 'hilfe', frage, musterantwort });
}
