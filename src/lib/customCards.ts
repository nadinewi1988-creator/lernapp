import { supabase, syncEnabled } from '../supabase';

// ============================================================
//  EIGENE KARTEIKARTEN
//
//  Karten, die Nadine selbst IN der App anlegt – getrennt von
//  den Modul-Inhalten aus der JSON. Gespeichert wird
//  geraeteuebergreifend in Supabase (Tabelle `custom_cards`,
//  eine Zeile je Person + Modul + Bereich mit einem JSON-Array)
//  und zusaetzlich lokal, damit die Karten auch ohne Login und
//  ohne Netz da sind.
//
//  Gleiches Grundprinzip wie bei attempts.ts: IMMER MERGEN,
//  nie stumpf ueberschreiben. Geloeschte Karten bleiben als
//  "Grabstein" (deleted: true) erhalten, damit eine Loeschung
//  auch auf den anderen Geraeten ankommt und nicht von einem
//  alten Stand wieder auferstehen kann.
// ============================================================

/** Die vier Kartenformate. */
export type CustomKind = 'qa' | 'mc' | 'offen' | 'luecke';

export const KIND_LABEL: Record<CustomKind, string> = {
  qa: 'Frage → Antwort',
  mc: 'Multiple Choice',
  offen: 'Offene Aufgabe (KI-Bewertung)',
  luecke: 'Lückentext',
};

export interface CustomCard {
  id: string;
  kind: CustomKind;
  /** Freies Thema (Vorschlaege: die Sitzungen des Bereichs). */
  thema: string;
  /** Frage; bei 'luecke' der Satz mit [Lücken]. */
  q: string;
  /** Musterantwort ('qa', 'offen') bzw. Erklaerung ('mc', 'luecke'). */
  a: string;
  hint?: string;
  /** nur bei 'mc' */
  options?: string[];
  /** nur bei 'mc': Indizes der richtigen Optionen */
  correct?: number[];
  createdAt: string;
  updatedAt: string;
  /** Grabstein – wird nirgends angezeigt. */
  deleted?: boolean;
}

const LS_PREFIX = 'lernapp:eigene:';

function lsKey(moduleId: string, trackId: string) {
  return `${LS_PREFIX}${moduleId}:${trackId}`;
}

export function newCardId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'e' + crypto.randomUUID();
    }
  } catch {
    /* faellt unten zurueck */
  }
  return `e${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Vereinigung zweier Listen: je ID gewinnt der neuere Stand. */
export function mergeCards(a: CustomCard[], b: CustomCard[]): CustomCard[] {
  const byId = new Map<string, CustomCard>();
  for (const c of [...a, ...b]) {
    const prev = byId.get(c.id);
    if (!prev || (c.updatedAt ?? '') > (prev.updatedAt ?? '')) byId.set(c.id, c);
  }
  return [...byId.values()].sort((x, y) =>
    (x.createdAt ?? '').localeCompare(y.createdAt ?? '')
  );
}

/** Nur die sichtbaren Karten (ohne Grabsteine). */
export function visible(list: CustomCard[]): CustomCard[] {
  return list.filter((c) => !c.deleted);
}

// ---- Lückentext ------------------------------------------------
//
//  Schreibweise: "Die Hauptstadt von [Frankreich|Frankr.] ist [Paris]."
//  Alles in eckigen Klammern ist eine Luecke; mit | koennen mehrere
//  gueltige Loesungen angegeben werden.

export interface LueckenTeil {
  text: string;
  luecke: boolean;
  /** akzeptierte Loesungen (nur wenn luecke === true) */
  loesungen: string[];
}

export function parseLuecken(text: string): LueckenTeil[] {
  const out: LueckenTeil[] = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ text: text.slice(last, m.index), luecke: false, loesungen: [] });
    }
    const loesungen = m[1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    out.push({ text: m[1], luecke: true, loesungen });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last), luecke: false, loesungen: [] });
  }
  return out;
}

/** Tolerant vergleichen: Gross/Klein, Umlaute-Schreibweise, Leerzeichen. */
export function lueckeRichtig(eingabe: string, loesungen: string[]): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[.,;:!?"'()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const e = norm(eingabe);
  if (!e) return false;
  return loesungen.some((l) => norm(l) === e);
}

// ---- Lokal -----------------------------------------------------

export function loadCardsLocal(moduleId: string, trackId: string): CustomCard[] {
  try {
    const raw = localStorage.getItem(lsKey(moduleId, trackId));
    return raw ? (JSON.parse(raw) as CustomCard[]) : [];
  } catch {
    return [];
  }
}

export function saveCardsLocal(
  moduleId: string,
  trackId: string,
  list: CustomCard[]
) {
  try {
    localStorage.setItem(lsKey(moduleId, trackId), JSON.stringify(list));
  } catch {
    /* Speicher voll o.ae. – ignorieren, App laeuft weiter */
  }
}

// ---- Cloud (Supabase) ------------------------------------------

export async function pullCardsCloud(
  moduleId: string,
  trackId: string
): Promise<CustomCard[]> {
  if (!syncEnabled) return [];
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return [];

  const { data, error } = await supabase
    .from('custom_cards')
    .select('cards')
    .eq('module_id', moduleId)
    .eq('track_id', trackId)
    .maybeSingle();

  if (error || !data) return [];
  return ((data.cards as CustomCard[]) ?? []).filter((c) => c && c.id);
}

export async function pushCardsCloud(
  moduleId: string,
  trackId: string,
  list: CustomCard[]
): Promise<void> {
  if (!syncEnabled) return;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;

  await supabase.from('custom_cards').upsert(
    {
      user_id: user.id,
      module_id: moduleId,
      track_id: trackId,
      cards: list,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,module_id,track_id' }
  );
}
