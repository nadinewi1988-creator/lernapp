// Stabile Karten-ID aus (Sitzung + Fragetext).
//
// WICHTIG (Projektanweisung): IDs dürfen NIEMALS fortlaufende
// Nummern sein. Wird mitten in einer Sitzung eine Frage ergänzt,
// bleiben alle anderen IDs damit unverändert – der gespeicherte
// Fortschritt zeigt weiter auf die richtige Frage.
//
// Deterministischer FNV-1a-Hash -> kurze Base36-ID mit Präfix 'c'.

export function stableId(session: string, question: string): string {
  const input = session + '::' + question;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 => vorzeichenlos, dann Base36
  return 'c' + (h >>> 0).toString(36);
}
