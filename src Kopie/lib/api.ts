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
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as { prozent: number; feedback: string };
    const pct = Math.max(0, Math.min(100, Math.round(parsed.prozent)));
    return { pct, fb: parsed.feedback };
  } catch {
    return { pct: 0, fb: text || 'Antwort konnte nicht bewertet werden.' };
  }
}

/** Ermutigende Zweiterklärung bei niedriger Bewertung. */
export async function helpFor(
  frage: string,
  musterantwort: string
): Promise<string> {
  return callGrade({ mode: 'hilfe', frage, musterantwort });
}
