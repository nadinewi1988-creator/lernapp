import { examDates } from '../data/examDates';

// ============================================================
// Countdown bis zur Prüfung – wird über den Reitern angezeigt.
// Zeigt nur die verbleibenden Tage (kein Datum). Farbe eskaliert:
// grün (viel Zeit) -> gelb -> rot (letzte Woche). Am Prüfungstag
// ein aufmunternder Text, danach "Prüfung vorbei".
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

export function ExamCountdown({ moduleId }: Props) {
  const date = examDates[moduleId];
  if (!date) return null;

  const days = daysUntil(date);

  let text: string;
  let color: string;
  if (days > 0) {
    text = `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} bis zur Prüfung`;
    color =
      days > 14 ? 'var(--sage)' : days > 7 ? 'var(--amber)' : 'var(--danger)';
  } else if (days === 0) {
    text = 'Heute ist die Prüfung 🍀';
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
