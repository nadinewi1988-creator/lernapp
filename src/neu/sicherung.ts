import { supabase } from '../supabase';

/**
 * Datensicherung und Push-Erinnerungen (26.10.2026).
 * - „Alles sichern“: alle eigenen Daten als JSON-Datei herunterladen.
 * - Automatisch: höchstens alle 7 Tage beim Öffnen der App eine Kopie in Supabase Storage
 *   (kartenbilder/<user_id>/sicherungen/lernapp-sicherung_<datum>.json).
 * - Push: Abo im Feld einstellungen.benachrichtigungen.push.abos; gesendet von /api/push (Vercel-Cron).
 */
export const VAPID_PUBLIC = 'BElmoUWKDfve-caglxRKehuM_rHP2VhfJ1T2LjJhvujDisn_aeQ-Aq79HuZF73gon12JSnS7L2Ose8PcbIexCBY';

const TABELLEN = ['studiengaenge', 'semester', 'module', 'teilmodule', 'veranstaltungen', 'sitzungen', 'eintraege', 'kalender_extra',
  'pruefungen', 'pruefungstermine', 'versuche', 'voraussetzungen', 'lernstand', 'karten', 'wiederholung', 'antworten', 'lernzeit', 'probepruefungen', 'einstellungen'];

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

export async function allesExportieren() {
  const tabellen: Record<string, unknown[]> = {};
  for (const t of TABELLEN) {
    const alle: unknown[] = [];
    for (let ab = 0; ; ab += 1000) {
      const { data, error } = await supabase.from(t).select('*').range(ab, ab + 999);
      if (error) { tabellen[t] = [{ fehler: error.message }]; break; }
      alle.push(...(data ?? []));
      if (!data || data.length < 1000) { tabellen[t] = alle; break; }
    }
  }
  return { art: 'lernapp-sicherung', version: 1, erstellt: new Date().toISOString(), tabellen };
}

export async function sicherungHerunterladen() {
  const daten = await allesExportieren();
  const blob = new Blob([JSON.stringify(daten, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lernapp-sicherung_' + heute() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  await merkeEinstellung('sicherung', { ...(await leseEinstellung('sicherung')), heruntergeladen: new Date().toISOString() });
  return a.download;
}

async function leseAlle(): Promise<Record<string, unknown>> {
  const { data } = await supabase.from('einstellungen').select('benachrichtigungen').maybeSingle();
  return ((data as { benachrichtigungen?: Record<string, unknown> } | null)?.benachrichtigungen) ?? {};
}
async function leseEinstellung<T = Record<string, unknown>>(k: string): Promise<T> { return ((await leseAlle())[k] ?? {}) as T; }
async function merkeEinstellung(k: string, wert: unknown) {
  const b = await leseAlle();
  const { error } = await supabase.from('einstellungen').upsert({ benachrichtigungen: { ...b, [k]: wert }, geaendert: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function sicherungsStand() { return leseEinstellung<{ zuletzt?: string; heruntergeladen?: string; datei?: string }>('sicherung'); }

/** Automatische Sicherung: wenn die letzte älter als 7 Tage ist. Fehler werden ignoriert. */
export async function sicherungAutomatisch(erzwingen = false) {
  try {
    const st = await sicherungsStand();
    if (!erzwingen && st.zuletzt && Date.now() - new Date(st.zuletzt).getTime() < 7 * 864e5) return null;
    const { data: u } = await supabase.auth.getUser(); if (!u.user) return null;
    const daten = await allesExportieren();
    const pfad = u.user.id + '/sicherungen/lernapp-sicherung_' + heute() + '.json';
    const { error } = await supabase.storage.from('kartenbilder').upload(pfad, new Blob([JSON.stringify(daten)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    if (error) throw new Error(error.message);
    await merkeEinstellung('sicherung', { ...st, zuletzt: new Date().toISOString(), datei: pfad });
    return pfad;
  } catch (e) { console.warn('[Sicherung]', e); return null; }
}

// ---------- Push ----------
type PushEinst = { abos?: { endpoint: string; keys?: Record<string, string>; geraet?: string; seit?: string }[]; morgen?: boolean; woche?: boolean };
const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };

export function pushMoeglich() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

export async function pushStatus(): Promise<'nicht-moeglich' | 'blockiert' | 'an' | 'aus'> {
  if (!pushMoeglich()) return 'nicht-moeglich';
  if (Notification.permission === 'denied') return 'blockiert';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'aus';
  const p = await leseEinstellung<PushEinst>('push');
  return p.abos?.some((a) => a.endpoint === sub.endpoint) ? 'an' : 'aus';
}

export async function pushAktivieren() {
  if (!pushMoeglich()) throw new Error('Dieses Gerät/dieser Browser kann keine Push-Nachrichten. Auf dem iPhone: Lernapp vom Home-Bildschirm öffnen.');
  const erl = await Notification.requestPermission();
  if (erl !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) }));
  const j = sub.toJSON() as { endpoint: string; keys?: Record<string, string> };
  const p = await leseEinstellung<PushEinst>('push');
  const geraet = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Gerät';
  const abos = [...(p.abos ?? []).filter((a) => a.endpoint !== j.endpoint), { endpoint: j.endpoint, keys: j.keys, geraet, seit: new Date().toISOString() }];
  await merkeEinstellung('push', { morgen: true, woche: true, ...p, abos });
}

export async function pushDeaktivieren() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  const p = await leseEinstellung<PushEinst>('push');
  if (sub) { await merkeEinstellung('push', { ...p, abos: (p.abos ?? []).filter((a) => a.endpoint !== sub.endpoint) }); await sub.unsubscribe(); }
}

export async function pushTesten() {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/api/push?art=test', { headers: { Authorization: 'Bearer ' + (data.session?.access_token ?? '') } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { fehler?: string }).fehler ?? 'Fehler ' + r.status);
  return j as { gesendet: number };
}
