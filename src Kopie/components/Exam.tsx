import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExamTask } from '../types';
import { noteFor } from '../lib/grading';
import { gradeAnswer } from '../lib/api';

// Probeprüfungs-Reiter. Projektanweisung: Countdown (Default 90 Min),
// gelb ab letzten 30, rot+blinkend ab letzten 10 Min; bei Ablauf wird
// die Bearbeitung gesperrt und eine ruhige Overlay-Meldung gezeigt.
// Jede Aufgabe einzeln bewertet, am Ende Gesamtdurchschnitt.
//
// Hinweis: Dieser Reiter ist als funktionierendes Grundgerüst angelegt.
// Die Feinheiten (z.B. gemischte MC-Aufgaben, Auswahl-Pool) lassen sich
// nach demselben Muster ergänzen – siehe README, Abschnitt "Ausbauen".

interface Props {
  tasks: ExamTask[];
  durationMin: number;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Exam({ tasks, durationMin }: Props) {
  const pool = useMemo(() => tasks.filter((t) => !t.flagged), [tasks]);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(durationMin * 60);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = durationMin * 60;
  const used = total - left;

  useEffect(() => {
    if (!started || finished) return;
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(timer.current!);
          setFinished(true);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current!);
  }, [started, finished]);

  const timerCls =
    left <= 600 ? 'timer red' : left <= 1800 ? 'timer amber' : 'timer';

  async function gradeAll() {
    clearInterval(timer.current!);
    const g: Record<string, number> = {};
    for (const t of pool) {
      const r = await gradeAnswer(t.q, t.a, answers[t.id] ?? '');
      g[t.id] = r.pct;
    }
    setGrades(g);
    setFinished(true);
  }

  if (pool.length === 0) {
    return (
      <p className="muted">
        Für diesen Track sind noch keine Probeprüfungs-Aufgaben hinterlegt.
        (Sie lassen sich im Datenschema unter <code>track.exam</code> ergänzen.)
      </p>
    );
  }

  if (!started) {
    return (
      <div className="card center">
        <h3>Probeprüfung</h3>
        <p className="muted">
          {pool.length} Aufgaben · {durationMin} Minuten. Der Timer startet
          sofort und sperrt die Bearbeitung bei Ablauf.
        </p>
        <button className="btn primary" onClick={() => setStarted(true)}>
          Prüfung starten
        </button>
      </div>
    );
  }

  const avg =
    Object.keys(grades).length === pool.length
      ? Math.round(
          Object.values(grades).reduce((a, b) => a + b, 0) / pool.length
        )
      : null;

  return (
    <div>
      <div className={timerCls}>{fmt(left)}</div>

      {finished && left === 0 && avg === null && (
        <div className="overlay">
          <div className="overlay-box">
            <strong>Zeit abgelaufen</strong>
            <p>Die Bearbeitung ist gesperrt.</p>
            <button className="btn primary" onClick={gradeAll}>
              Zur Zusammenfassung
            </button>
          </div>
        </div>
      )}

      {pool.map((t, n) => (
        <div className="card" key={t.id}>
          <div className="card-meta">
            <span className="tag">{t.session}</span>
            <span className="muted">
              Aufgabe {n + 1}
              {t.points ? ` · ${t.points} Punkte` : ''}
            </span>
          </div>
          <p className="card-q">{t.q}</p>
          <textarea
            rows={5}
            disabled={finished}
            value={answers[t.id] ?? ''}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [t.id]: e.target.value }))
            }
            placeholder="Antwort …"
          />
          {grades[t.id] !== undefined && (
            <div className="muted">
              Bewertung: {grades[t.id]}% · Note {noteFor(grades[t.id])}
            </div>
          )}
        </div>
      ))}

      {!finished && (
        <button className="btn primary" onClick={gradeAll}>
          Abgeben & bewerten
        </button>
      )}

      {avg !== null && (
        <div className="card center">
          <h3>
            Gesamt: Ø {avg}% · Note {noteFor(avg)}
          </h3>
          <p className="muted">Benötigte Zeit: {fmt(used)} von {fmt(total)}</p>
        </div>
      )}
    </div>
  );
}
