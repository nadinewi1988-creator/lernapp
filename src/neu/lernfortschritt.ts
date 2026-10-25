import type { Studienstand, Sitzung } from './db';
import { inhaltZu, frageRef } from './lerninhalte';

/**
 * Lernfortschritt einer Sitzung (0–100), automatisch:
 * Lerntext gelesen (zählt wie eine Frage) + Lernfragen, die „sicher“ sitzen.
 * „Als gelernt markieren“ setzt die Sitzung von Hand auf 100 %.
 */
const cache = new WeakMap<object, Record<string, string>>();
function standJeFrage(stand: Studienstand) {
  let m = cache.get(stand.wiederholung);
  if (!m) { m = Object.fromEntries(stand.wiederholung.map((w) => [w.frage_ref, w.stand])); cache.set(stand.wiederholung, m); }
  return m;
}
export function sitzungsFortschritt(stand: Studienstand, s: Sitzung, teil: string, lokalGelernt?: boolean) {
  const l = stand.lernstand.find((x) => x.sitzung_id === s.id);
  if (lokalGelernt ?? l?.gelernt) return { pct: 100, sicher: 0, fragen: 0, gelesen: !!l?.gelesen, hand: true };
  const LI = inhaltZu(s.id, teil, s.datum);
  if (!LI) return { pct: 0, sicher: 0, fragen: 0, gelesen: !!l?.gelesen, hand: false };
  const wd = standJeFrage(stand), n = LI.fragen.length, sicher = LI.fragen.filter((f) => wd[frageRef(LI, f)] === 'sicher').length;
  return { pct: Math.round(((l?.gelesen ? 1 : 0) + sicher) / (1 + n) * 100), sicher, fragen: n, gelesen: !!l?.gelesen, hand: false };
}
