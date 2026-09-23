import { examDates, examDatesZweittermin } from '../data/examDates';

// ============================================================
// Countdown bis zur Prüfung – wird über den Reitern angezeigt.
// Zeigt nur die verbleibenden Tage (kein Datum). Farbe eskaliert:
// grün (viel Zeit) -> gelb -> rot (letzte Woche). Am Prüfungstag
// ein aufmunternder Text, danach "Prüfung vorbei".
//
// Ist in examDates.ts zusätzlich ein Zweittermin hinterlegt,
// steht er in Klammern dahinter ("(Zweittermin: 189 Tage)").
// Sobald der Ersttermin vorbei ist, zählt der Countdown
// automatisch auf den Zweittermin weiter.
//
// Termine stehen zentral in data/examDates.ts. Fehlt der Termin
// für ein Modul, wird nichts angezeigt.
// ============================================================

interface Props {
  moduleId: string;
}

function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const exam = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam.getTime() - today.getTime()) / 86400000);
}

function tageWort(n: number): string {
  return n === 1 ? 'Tag' : 'Tage';
}

export function ExamCountdown({ moduleId }: Props) {
  const date = examDates[moduleId];
  const zweit = examDatesZweittermin[moduleId];
  if (!date) return null;

  const days = daysUntil(date);
  const daysZweit = zweit ? daysUntil(zweit) : null;

  let text: string;
  let color: string;

  if (days > 0) {
    text = `Noch ${days} ${tageWort(days)} bis zur Prüfung`;
    if (daysZweit !== null && daysZweit > 0) {
      text += ` (Zweittermin: ${daysZweit} ${tageWort(daysZweit)})`;
    }
    color =
      days > 14 ? 'var(--sage)' : days > 7 ? 'var(--amber)' : 'var(--danger)';
  } else if (days === 0) {
    text = 'Heute ist die Prüfung 🍀';
    color = 'var(--danger)';
  } else if (daysZweit !== null && daysZweit > 0) {
    text = `Noch ${daysZweit} ${tageWort(daysZweit)} bis zum Zweittermin`;
    color =
      daysZweit > 14
        ? 'var(--sage)'
        : daysZweit > 7
          ? 'var(--amber)'
          : 'var(--danger)';
  } else if (daysZweit === 0) {
    text = 'Heute ist der Zweittermin 🍀';
    color = 'var(--danger)';
  } else {
    text = 'Prüfung vorbei';
    color = 'var(--line)';
  }

  return (
    <div
      style={{
        textAlign: 'center',
        margin: '4px 0 12px',
        padding: '8px 14px',
        borderRadius: 10,
        fontWeight: 600,
        color,
        background: 'rgba(127,127,127,0.08)',
        border: '1px solid ' + color,
      }}
    >
      ⏳ {text}
    </div>
  );
}
