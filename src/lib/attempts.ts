import { supabase, syncEnabled } from '../supabase';

// ============================================================
//  Abfrage-Verlauf PRO KARTE, je Modul + Bereich + Modus
//  ('karten' oder 'schnell'). Lokal (localStorage) +
//  geräteübergreifend (Supabase, eine Zeile pro Bucket mit
//  einem JSON-Array in "entries").
//
//  Jeder Eintrag trägt die Karten-ID (cardId). Angezeigt wird
//  unter der jeweiligen Karte nur deren eigener Verlauf. Pro
//  Karte werden die letzten 10 Versuche behalten; gemergt wird
//  die Vereinigung nach id, damit zwischen Geräten nichts
//  verloren geht.
// ============================================================

export interface Attempt {
  id: string;
  cardId: string; // zu welcher Karte der Versuch gehört
  q: string; // Kurzform der Frage (nur informativ)
  pct: number; // 0–100
  takenAt: string; // ISO-Zeitstempel
}

export type AttemptMode = 'karten' | 'schnell';

const MAX_PER_CARD = 10;
const LS_PREFIX = 'lernapp:attempts:';

function lsKey(moduleId: string, trackId: string, mode: AttemptMode) {
  return `${LS_PREFIX}${moduleId}:${trackId}:${mode}`;
}

/** Neueste zuerst, je Karte auf die letzten 10 begrenzt. */
function trim(list: Attempt[]): Attempt[] {
  const sorted = [...list].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const counts = new Map<string, number>();
  const out: Attempt[] = [];
  for (const a of sorted) {
    const cid = a.cardId ?? '';
    const n = counts.get(cid) ?? 0;
    if (n < MAX_PER_CARD) {
      out.push(a);
      counts.set(cid, n + 1);
    }
  }
  return out;
}

export function mergeAttempts(a: Attempt[], b: Attempt[]): Attempt[] {
  const byId = new Map<string, Attempt>();
  for (const x of a) byId.set(x.id, x);
  for (const x of b) if (!byId.has(x.id)) byId.set(x.id, x);
  return trim([...byId.values()]);
}

/** Nur die Versuche einer bestimmten Karte (neueste zuerst). */
export function attemptsForCard(
  list: Attempt[],
  cardId: string,
  max = MAX_PER_CARD
): Attempt[] {
  return list
    .filter((a) => a.cardId === cardId)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, max);
}

export function newAttemptId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID)
      return crypto.randomUUID();
  } catch {
    /* Fallback unten */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function shortenQ(q: string, max = 70): string {
  const s = q.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Zeitpunkt kurz und lesbar (z. B. 20.07., 08:25). */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function loadAttemptsLocal(
  moduleId: string,
  trackId: string,
  mode: AttemptMode
): Attempt[] {
  try {
    const raw = localStorage.getItem(lsKey(moduleId, trackId, mode));
    return raw ? trim(JSON.parse(raw) as Attempt[]) : [];
  } catch {
    return [];
  }
}

export function saveAttemptsLocal(
  moduleId: string,
  trackId: string,
  mode: AttemptMode,
  list: Attempt[]
) {
  try {
    localStorage.setItem(
      lsKey(moduleId, trackId, mode),
      JSON.stringify(trim(list))
    );
  } catch {
    /* ignore */
  }
}

// ---- Cloud (Supabase) ------------------------------------------

export async function pullAttemptsCloud(
  moduleId: string,
  trackId: string,
  mode: AttemptMode
): Promise<Attempt[]> {
  if (!syncEnabled) return [];
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return [];

  const { data, error } = await supabase
    .from('attempt_history')
    .select('entries')
    .eq('module_id', moduleId)
    .eq('track_id', trackId)
    .eq('mode', mode)
    .maybeSingle();

  if (error || !data) return [];
  const entries = (data.entries as Attempt[]) ?? [];
  return trim(entries);
}

export async function pushAttemptsCloud(
  moduleId: string,
  trackId: string,
  mode: AttemptMode,
  list: Attempt[]
): Promise<void> {
  if (!syncEnabled) return;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;

  await supabase.from('attempt_history').upsert(
    {
      user_id: user.id,
      module_id: moduleId,
      track_id: trackId,
      mode,
      entries: trim(list),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,module_id,track_id,mode' }
  );
}
