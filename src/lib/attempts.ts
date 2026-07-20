import { supabase, syncEnabled } from '../supabase';

// ============================================================
//  Abfrage-Verlauf: die letzten 10 bewerteten Antworten je
//  Modul + Bereich + Modus ('karten' oder 'schnell').
//  Lokal (localStorage) + geräteübergreifend (Supabase).
//
//  Gespeichert wird pro Bucket EINE Zeile mit einem kleinen
//  JSON-Array der letzten 10 Einträge (Frage-Kurzform, Prozent,
//  Zeitpunkt). Gemergt wird die Vereinigung nach id, dann auf
//  die 10 neuesten begrenzt – so geht zwischen Geräten nichts
//  verloren und die Liste bleibt schlank.
// ============================================================

export interface Attempt {
  id: string;
  q: string; // Kurzform der Frage
  pct: number; // 0–100
  takenAt: string; // ISO-Zeitstempel
}

export type AttemptMode = 'karten' | 'schnell';

const MAX = 10;
const LS_PREFIX = 'lernapp:attempts:';

function lsKey(moduleId: string, trackId: string, mode: AttemptMode) {
  return `${LS_PREFIX}${moduleId}:${trackId}:${mode}`;
}

/** Neueste zuerst, auf die letzten 10 begrenzt. */
function trim(list: Attempt[]): Attempt[] {
  return [...list]
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, MAX);
}

export function mergeAttempts(a: Attempt[], b: Attempt[]): Attempt[] {
  const byId = new Map<string, Attempt>();
  for (const x of a) byId.set(x.id, x);
  for (const x of b) if (!byId.has(x.id)) byId.set(x.id, x);
  return trim([...byId.values()]);
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

/** Frage auf eine kurze, einzeilige Form kürzen. */
export function shortenQ(q: string, max = 70): string {
  const s = q.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
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
