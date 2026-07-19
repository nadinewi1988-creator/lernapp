// Notenskala aus der Projektanweisung (falls keine andere gilt).
// Prozent -> deutsche Note.

const SCALE: Array<[number, string]> = [
  [95, '1,0'],
  [90, '1,3'],
  [85, '1,7'],
  [80, '2,0'],
  [75, '2,3'],
  [70, '2,7'],
  [65, '3,0'],
  [60, '3,3'],
  [55, '3,7'],
  [50, '4,0'],
];

export function noteFor(percent: number): string {
  for (const [min, note] of SCALE) {
    if (percent >= min) return note;
  }
  return '5,0';
}

/** Farbe für Fortschrittsbalken – nach Notenqualität, NICHT einheitlich grün. */
export function progressColor(percent: number | null): string {
  if (percent === null) return 'var(--line)';   // grau: noch nicht geübt
  if (percent < 50) return 'var(--danger)';      // rot
  if (percent < 80) return 'var(--amber)';       // amber
  return 'var(--sage)';                          // grün ab 80%
}
