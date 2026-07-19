import { supabase, syncEnabled } from '../supabase';
import type { ExamRun } from '../types';

// ============================================================
//  Probeprüfungs-Durchläufe: lokal (localStorage) + optional
//  Cloud (Supabase).
//
//  Gleiches Prinzip wie beim Fortschritt (progress.ts): IMMER
//  MERGEN, nie überschreiben. Gemergt wird die VEREINIGUNG aller
//  Durchläufe (nach stabiler id) – so kann zwischen Geräten kein
//  Durchlauf verloren gehen.
//
//  Gespeichert wird pro Modul + Bereich (track): Zeitpunkt,
//  Durchschnitt (%), benötigte Zeit und Aufgabenzahl. Note und
//  laufende Nummer werden im Frontend daraus abgeleitet.
// ============================================================

const LS_PREFIX = 'lernapp:examruns:';

function lsKey(moduleId: string, trackId: string) {
  return `${LS_PREFIX}${moduleId}:${trackId}`;
}

export function loadRunsLocal(moduleId: string, trackId: string): ExamRun[] {
  try {
    const raw = localStorage.getItem(lsKey(moduleId, trackId));
    return raw ? (JSON.parse(raw) as ExamRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRunsLocal(
  moduleId: string,
  trackId: string,
  runs: ExamRun[]
) {
  try {
    localStorage.setItem(lsKey(moduleId, trackId), JSON.stringify(runs));
  } catch {
    /* Speicher voll o.ä. – ignorieren, App läuft weiter */
  }
}

/** Vereinigung zweier Durchlauf-Listen (nach id), chronologisch sortiert. */
export function mergeRuns(a: ExamRun[], b: ExamRun[]): ExamRun[] {
  const byId = new Map<string, ExamRun>();
  for (const r of a) byId.set(r.id, r);
  for (const r of b) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => x.takenAt.localeCompare(y.takenAt));
}

/** Einen neuen Durchlauf anhängen (chronologisch sortiert). */
export function addRun(runs: ExamRun[], run: ExamRun): ExamRun[] {
  return mergeRuns(runs, [run]);
}

/** Neue stabile ID für einen Durchlauf. */
export function newRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* fällt unten zurück */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---- Cloud (Supabase) ------------------------------------------

/** Alle Durchläufe eines Tracks aus der Cloud laden. */
export async function pullRunsCloud(
  moduleId: string,
  trackId: string
): Promise<ExamRun[]> {
  if (!syncEnabled) return [];
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return [];

  const { data, error } = await supabase
    .from('exam_runs')
    .select('run_id,avg,duration_sec,task_count,taken_at')
    .eq('module_id', moduleId)
    .eq('track_id', trackId);

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.run_id,
    avg: row.avg,
    durationSec: row.duration_sec,
    taskCount: row.task_count,
    takenAt: row.taken_at,
  }));
}

/** Durchläufe in die Cloud schreiben (upsert nach id). */
export async function pushRunsCloud(
  moduleId: string,
  trackId: string,
  runs: ExamRun[]
): Promise<void> {
  if (!syncEnabled) return;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;
  if (runs.length === 0) return;

  const rows = runs.map((r) => ({
    user_id: user.id,
    module_id: moduleId,
    track_id: trackId,
    run_id: r.id,
    avg: r.avg,
    duration_sec: r.durationSec,
    task_count: r.taskCount,
    taken_at: r.takenAt,
  }));

  await supabase
    .from('exam_runs')
    .upsert(rows, { onConflict: 'user_id,module_id,track_id,run_id' });
}
