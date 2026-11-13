/**
 * Lückentext-Prüfung (13.11.2026, nach Nadines Hinweis „nicht leere Menge“ ≠ „nicht-leere“):
 * großzügig bei Schreibweise, streng beim Inhalt.
 * - Groß/klein, Bindestrich/Leerzeichen, Satzzeichen, ä/ae, ß/ss egal
 * - Mitgeschriebene Nachbarwörter aus dem Satz sind ok („nicht leere Menge“, wenn „Menge“ direkt folgt)
 * - kleiner Tippfehler bei längeren Wörtern ok (1 Zeichen ab 6 Buchstaben, 2 ab 12) – nie bei Zahlen/Formeln
 */
const basis = (s: string) => String(s || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/\$|\\[a-z]+|[{}]/g, ' ')
  .replace(/[.,;:!?„“"'()\-–‐]/g, ' ').replace(/\s+/g, ' ').trim();
const kompakt = (s: string) => basis(s).replace(/ /g, '');

function abstand(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

const gleich = (a: string, s: string) => {
  const A = kompakt(a), S = kompakt(s);
  if (!A) return false;
  if (A === S) return true;
  if (/\d/.test(S) || /[=<>+*/^_\\]/.test(s)) return false;
  const erlaubt = S.length >= 12 ? 2 : S.length >= 6 ? 1 : 0;
  return erlaubt > 0 && abstand(A, S) <= erlaubt;
};

/** eingabe = getippt, soll = Lösung, vor/nach = Text direkt vor bzw. nach der Lücke */
export function lueckeRichtig(eingabe: string, soll: string, vor = '', nach = ''): boolean {
  if (gleich(eingabe, soll)) return true;
  const e = basis(eingabe), s = basis(soll);
  if (!e) return false;
  const vw = basis(vor).split(' ').filter(Boolean), nw = basis(nach).split(' ').filter(Boolean);
  for (let a = 0; a <= Math.min(3, vw.length); a++) {
    for (let b = 0; b <= Math.min(3, nw.length); b++) {
      if (!a && !b) continue;
      const kand = [...vw.slice(vw.length - a), s, ...nw.slice(0, b)].join(' ');
      if (gleich(e, kand)) return true;
    }
  }
  return false;
}

/** Text vor/nach der k-ten Lücke in einem Text mit [[…]] */
export function lueckeUmfeld(text: string, k: number): { vor: string; nach: string } {
  const teile = String(text || '').split(/\[\[.+?\]\]/);
  return { vor: teile[k] ?? '', nach: teile[k + 1] ?? '' };
}
