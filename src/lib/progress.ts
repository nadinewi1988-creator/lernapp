import { supabase, syncEnabled } from '../supabase';
import type { ProgressMap, CardProgress } from '../types';

// ============================================================
//  Fortschritt: lokal (localStorage) + optional Cloud (Supabase)
//
//  Grundprinzip aus der Projektanweisung: IMMER MERGEN, nie
//  überschreiben. Pro Karte gewinnt der bessere Wert. So kann
//  zwischen Geräten kein Fortschritt verloren gehen.
//
//  Ablauf:
//   - App lädt: lokalen Stand lesen, dann (falls eingeloggt)
//     Cloud-Stand holen und mergen, gemergt zurückschreiben.
//   - Nach jeder Bewertung: lokal speichern + (debounced) in die
//     Cloud pushen. Fällt die Cloud aus, läuft alles lokal weiter.
// ============================================================

const LS_PREFIX = 'lernapp:progress:';

function lsKey(moduleId: string, trackId: string) {
  return `${LS_PREFIX}${moduleId}:${trackId}`;
}

export function loadLocal(moduleId: string, trackId: string): ProgressMap {
  try {
    const raw = localStorage.getItem(lsKey(moduleId, trackId));
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function saveLocal(moduleId: string, trackId: string, p: ProgressMap) {
  try {
    localStorage.setItem(lsKey(moduleId, trackId), JSON.stringify(p));
  } catch {
    /* Speicher voll o.ä. – ignorieren, App läuft weiter */
  }
}

/** Merge zweier Fortschritts-Maps: besserer best-Wert, größere attempts. */
export function mergeProgress(a: ProgressMap, b: ProgressMap): ProgressMap {
  const out: ProgressMap = { ...a };
  for (const [id, inc] of Object.entries(b)) {
    const ex = out[id];
    if (!ex) {
      out[id] = { ...inc };
    } else {
      out[id] = {
        best: Math.max(ex.best, inc.best),
        attempts: Math.max(ex.attempts, inc.attempts),
      };
    }
  }
  return out;
}

/** Ein Kartenergebnis verbuchen (nur bessern, nie verschlechtern). */
export function recordResult(
  map: ProgressMap,
  cardId: string,
  percent: number
): ProgressMap {
  const cur = map[cardId];
  const next: CardProgress = {
    best: cur ? Math.max(cur.best, percent) : percent,
    attempts: cur ? cur.attempts + 1 : 1,
  };
  return { ...map, [cardId]: next };
}

// ---- Cloud (Supabase) ------------------------------------------

/** Cloud-Stand für ein Track laden und als ProgressMap zurückgeben. */
export async function pullCloud(
  moduleId: string,
  trackId: string
): Promise<ProgressMap> {
  if (!syncEnabled) return {};
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return {};

  const { data, error } = await supabase
    .from('progress')
    .select('card_id,best,attempts')
    .eq('module_id', moduleId)
    .eq('track_id', trackId);

  if (error || !data) return {};
  const map: ProgressMap = {};
  for (const row of data) {
    // attempts = -1 markiert eine ausgeblendete Karte, kein echter
    // Fortschritt – diese Einträge hier überspringen.
    if (row.attempts === -1) continue;
    map[row.card_id] = { best: row.best, attempts: row.attempts };
  }
  return map;
}

/** Gemergten Stand in die Cloud schreiben (upsert). */
export async function pushCloud(
  moduleId: string,
  trackId: string,
  map: ProgressMap
): Promise<void> {
  if (!syncEnabled) return;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;

  const rows = Object.entries(map).map(([card_id, p]) => ({
    user_id: user.id,
    module_id: moduleId,
    track_id: trackId,
    card_id,
    best: p.best,
    attempts: p.attempts,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  await supabase
    .from('progress')
    .upsert(rows, { onConflict: 'user_id,module_id,track_id,card_id' });
}

// ---- Debounce-Helfer für Hintergrund-Sync ----------------------

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Push in die Cloud, gebündelt (z.B. 1,5s nach der letzten Aktion). */
export function pushCloudDebounced(
  moduleId: string,
  trackId: string,
  map: ProgressMap,
  delay = 1500
) {
  const key = `${moduleId}:${trackId}`;
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    void pushCloud(moduleId, trackId, map);
  }, delay);
}

// ============================================================
//  Ausgeblendete Karten ("Karten auswählen")
//
//  Einzelne Karten dauerhaft ausblenden – sie fallen dann aus
//  Karteikarten, Quiz UND Probeprüfung heraus. Wird lokal
//  gespeichert und geräteübergreifend synchronisiert.
//
//  Trick: Wir nutzen dieselbe progress-Tabelle. Ein versteckter
//  Eintrag bekommt attempts = -1 (eindeutige Markierung, stört
//  die Notenlogik nicht, da wir solche Einträge dort ignorieren).
// ============================================================

const HIDDEN_PREFIX = 'lernapp:hidden:';

function hiddenKey(moduleId: string, trackId: string) {
  return `${HIDDEN_PREFIX}${moduleId}:${trackId}`;
}

export function loadHiddenLocal(moduleId: string, trackId: string): Set<string> {
  try {
    const raw = localStorage.getItem(hiddenKey(moduleId, trackId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function saveHiddenLocal(
  moduleId: string,
  trackId: string,
  hidden: Set<string>
) {
  try {
    localStorage.setItem(
      hiddenKey(moduleId, trackId),
      JSON.stringify(Array.from(hidden))
    );
  } catch {
    /* ignore */
  }
}

/** Ausgeblendete Karten aus der Cloud laden (attempts = -1). */
export async function pullHiddenCloud(
  moduleId: string,
  trackId: string
): Promise<Set<string>> {
  if (!syncEnabled) return new Set();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return new Set();

  const { data, error } = await supabase
    .from('progress')
    .select('card_id,attempts')
    .eq('module_id', moduleId)
    .eq('track_id', trackId)
    .eq('attempts', -1);

  if (error || !data) return new Set();
  return new Set(data.map((r) => r.card_id));
}

/** Eine Karte in der Cloud als versteckt / sichtbar markieren. */
export async function setHiddenCloud(
  moduleId: string,
  trackId: string,
  cardId: string,
  hidden: boolean
): Promise<void> {
  if (!syncEnabled) return;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;

  if (hidden) {
    await supabase.from('progress').upsert(
      {
        user_id: user.id,
        module_id: moduleId,
        track_id: trackId,
        card_id: cardId,
        best: 0,
        attempts: -1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,module_id,track_id,card_id' }
    );
  } else {
    // Wieder sichtbar: den Versteck-Eintrag entfernen
    await supabase
      .from('progress')
      .delete()
      .eq('user_id', user.id)
      .eq('module_id', moduleId)
      .eq('track_id', trackId)
      .eq('card_id', cardId)
      .eq('attempts', -1);
  }
}
