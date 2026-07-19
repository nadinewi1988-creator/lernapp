import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Track,
  Flashcard,
  ExamConfig,
  ExamCount,
  ExamRun,
} from '../types';
import { noteFor } from '../lib/grading';
import { gradeAnswer } from '../lib/api';
import {
  loadRunsLocal,
  saveRunsLocal,
  mergeRuns,
  addRun,
  newRunId,
  pullRunsCloud,
  pushRunsCloud,
} from '../lib/examRuns';

// ============================================================
// Probeprüfungs-Reiter – zentrale Bauform-Engine.
//
// Die Logik lebt EINMAL hier (SPEC_Probepruefung.md). Ein Modul
// wählt über track.examConfig nur die Bauform + Parameter; die
// Inhalte kommen aus den Karteikarten bzw. dem Quiz des Tracks.
//
//  Bauform 1 'zufallspool'  – N zufällige offene Aufgaben (+ opt. MC)
//  Bauform 2 'mc'           – reine Multiple-Choice-Klausur
//  Bauform 3 'feste'        – festes Set aus track.exam
//  Bauform 4 'verteilung'   – "X aus A + Y aus B" (+ opt. Feinlogik)
//
// Timer: gelb ab letzten 30 Min, rot+blinkend ab letzten 10 Min;
// bei Ablauf wird gesperrt und ruhig zur Auswertung geführt.
// Jede Aufgabe einzeln bewertet, am Ende Gesamtdurchschnitt.
//
// Jeder abgeschlossene Durchlauf wird pro Modul + Bereich
// gespeichert (Zeitpunkt, Ø, Zeit, Aufgabenzahl) – lokal und
// geräteübergreifend (siehe lib/examRuns.ts). Vor dem Start
// erscheint eine aufklappbare Liste der bisherigen Durchläufe.
// ============================================================

interface Props {
  moduleId: string;
  track: Track;
  hidden: Set<string>;
  /** Nur für Re-Sync bei Login-Wechsel (aus App durchgereicht). */
  userId?: string;
}

/** Eine für einen Prüfungsdurchlauf konkret gezogene Aufgabe. */
interface BuiltTask {
  id: string;
  kind: 'offen' | 'mc';
  session: string;
  q: string;
  a?: string; // offen: Musterlösung
  options?: string[]; // mc
  correct?: number; // mc: Index der richtigen Option
  expl?: string; // mc: Erklärung
  points?: number;
  heading?: string; // Trennüberschrift vor dieser Aufgabe (Bauform 4)
}

// ---- Hilfsfunktionen -------------------------------------------

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveCount(count: ExamCount): number {
  if (Array.isArray(count)) {
    const [lo, hi] = count;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  return count;
}

function groupBySession(cards: Flashcard[]): Map<string, Flashcard[]> {
  const m = new Map<string, Flashcard[]>();
  for (const c of cards) {
    const g = m.get(c.session);
    if (g) g.push(c);
    else m.set(c.session, [c]);
  }
  return m;
}

/** Round-robin über Sitzungen: möglichst je Aufgabe eine andere Sitzung. */
function spread(cards: Flashcard[], n: number): Flashcard[] {
  const groups = shuffle([...groupBySession(shuffle(cards)).values()]);
  const out: Flashcard[] = [];
  let idx = 0;
  while (out.length < n) {
    let added = false;
    for (const g of groups) {
      if (g[idx]) {
        out.push(g[idx]);
        added = true;
        if (out.length >= n) break;
      }
    }
    if (!added) break;
    idx++;
  }
  return out;
}

const offen = (c: Flashcard, heading?: string): BuiltTask => ({
  id: c.id,
  kind: 'offen',
  session: c.session,
  q: c.q,
  a: c.a,
  heading,
});

// ---- Aufbau je Bauform -----------------------------------------

function build(
  cfg: ExamConfig,
  cards: Flashcard[],
  quiz: Track['quiz'],
  exam: Track['exam'],
  activeQuellen: number[] | null
): BuiltTask[] {
  switch (cfg.bauform) {
    case 'mc': {
      const pool = cfg.sessions
        ? quiz.filter((q) => cfg.sessions!.includes(q.session))
        : quiz;
      const n = Math.min(resolveCount(cfg.count), pool.length);
      return shuffle(pool)
        .slice(0, n)
        .map((m) => ({
          id: m.id,
          kind: 'mc',
          session: m.session,
          q: m.q,
          options: m.options,
          correct: m.correct,
          expl: m.expl,
        }));
    }

    case 'feste': {
      let list = exam;
      if (cfg.taskIds && cfg.taskIds.length) {
        const order = cfg.taskIds;
        list = exam
          .filter((t) => order.includes(t.id))
          .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      return list.map((t) =>
        t.kind === 'mc' && t.options
          ? {
              id: t.id,
              kind: 'mc',
              session: t.session,
              q: t.q,
              options: t.options,
              correct: (t.correct ?? [0])[0],
              expl: t.a,
              points: t.points,
            }
          : {
              id: t.id,
              kind: 'offen',
              session: t.session,
              q: t.q,
              a: t.a,
              points: t.points,
            }
      );
    }

    case 'verteilung': {
      const tasks: BuiltTask[] = [];
      const used = new Set<string>();
      cfg.quellen.forEach((qsrc, qi) => {
        if (activeQuellen && !activeQuellen.includes(qi)) return;
        let first = true;
        const push = (c: Flashcard | undefined) => {
          if (!c || used.has(c.id)) return;
          used.add(c.id);
          tasks.push(offen(c, first ? qsrc.label : undefined));
          first = false;
        };
        if (qsrc.picks && qsrc.picks.length) {
          // Feinlogik: exakt diese typgenauen Auswahlen der Reihe nach.
          for (const p of qsrc.picks) {
            const sessions = p.fromSessions ?? qsrc.sessions;
            let cand = cards.filter(
              (c) => sessions.includes(c.session) && !used.has(c.id)
            );
            if (p.subtype) cand = cand.filter((c) => c.subtype === p.subtype);
            push(shuffle(cand)[0]);
          }
        } else {
          const pool = cards.filter(
            (c) => qsrc.sessions.includes(c.session) && !used.has(c.id)
          );
          const picked = qsrc.distinctSessions
            ? spread(pool, qsrc.count)
            : shuffle(pool).slice(0, qsrc.count);
          for (const c of picked) push(c);
        }
      });
      return tasks;
    }

    case 'zufallspool':
    default: {
      const pool = cfg.sessions
        ? cards.filter((c) => cfg.sessions!.includes(c.session))
        : cards;
      const n = Math.min(resolveCount(cfg.count), pool.length);
      const chosen = cfg.spreadSessions
        ? spread(pool, n)
        : shuffle(pool).slice(0, n);
      const tasks: BuiltTask[] = chosen.map((c) => offen(c));
      if (cfg.plusMc && quiz.length) {
        const mcs = shuffle(quiz).slice(0, cfg.plusMc);
        for (const m of mcs)
          tasks.push({
            id: m.id,
            kind: 'mc',
            session: m.session,
            q: m.q,
            options: m.options,
            correct: m.correct,
            expl: m.expl,
          });
      }
      return tasks;
    }
  }
}

// ---- Komponente -------------------------------------------------

const DEFAULT_CFG: ExamConfig = {
  bauform: 'zufallspool',
  count: [6, 10],
  spreadSessions: true,
};

export function Exam({ moduleId, track, hidden, userId }: Props) {
  const cfg: ExamConfig = track.examConfig ?? DEFAULT_CFG;
  const durationMin = cfg.durationMin ?? track.examDurationMin ?? 90;

  const cards = useMemo(
    () => track.flashcards.filter((c) => !c.flagged && !hidden.has(c.id)),
    [track, hidden]
  );
  const quiz = useMemo(
    () => track.quiz.filter((q) => !q.flagged && !hidden.has(q.id)),
    [track, hidden]
  );
  const exam = useMemo(
    () => track.exam.filter((t) => !t.flagged && !hidden.has(t.id)),
    [track, hidden]
  );

  const [tasks, setTasks] = useState<BuiltTask[]>([]);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(durationMin * 60);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mcPicks, setMcPicks] = useState<Record<string, number>>({});
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const [grading, setGrading] = useState(false);
  const [runs, setRuns] = useState<ExamRun[]>([]);
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

  // Beim Track-Wechsel zurücksetzen.
  useEffect(() => {
    setStarted(false);
    setFinished(false);
    setTasks([]);
    setAnswers({});
    setMcPicks({});
    setGrades({});
    setLeft(durationMin * 60);
  }, [track.id, durationMin]);

  // Bisherige Durchläufe laden: lokal + Cloud mergen (pro Modul + Bereich).
  // moduleId ist mit im Schlüssel, damit sich Module mit gleichem Track-Namen
  // (z.B. beide "vorlesung") nicht überschneiden.
  useEffect(() => {
    const local = loadRunsLocal(moduleId, track.id);
    setRuns(local);
    let cancelled = false;
    void pullRunsCloud(moduleId, track.id).then((cloud) => {
      if (cancelled) return;
      const merged = mergeRuns(local, cloud);
      setRuns(merged);
      saveRunsLocal(moduleId, track.id, merged);
      void pushRunsCloud(moduleId, track.id, merged);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId, track.id, userId]);

  function startWith(quellen: number[] | null) {
    const built = build(cfg, cards, quiz, exam, quellen);
    setTasks(built);
    setAnswers({});
    setMcPicks({});
    setGrades({});
    setFinished(false);
    setLeft(durationMin * 60);
    setStarted(true);
  }

  async function gradeAll() {
    clearInterval(timer.current!);
    // Benötigte Zeit im Moment der Abgabe festhalten (Timer steht jetzt).
    const usedSec = total - left;
    setGrading(true);
    const g: Record<string, number> = {};
    for (const t of tasks) {
      if (t.kind === 'offen') {
        const r = await gradeAnswer(t.q, t.a ?? '', answers[t.id] ?? '');
        g[t.id] = r.pct;
      } else {
        g[t.id] = mcPicks[t.id] === t.correct ? 100 : 0;
      }
    }
    setGrades(g);
    setGrading(false);
    setFinished(true);

    // Durchlauf speichern (gleiche Ø-Formel wie in der Anzeige).
    const runAvg = tasks.length
      ? Math.round(Object.values(g).reduce((a, b) => a + b, 0) / tasks.length)
      : 0;
    const run: ExamRun = {
      id: newRunId(),
      takenAt: new Date().toISOString(),
      avg: runAvg,
      durationSec: usedSec,
      taskCount: tasks.length,
    };
    setRuns((prev) => {
      const next = addRun(prev, run);
      saveRunsLocal(moduleId, track.id, next);
      void pushRunsCloud(moduleId, track.id, next);
      return next;
    });
  }

  const timerCls =
    left <= 600 ? 'timer red' : left <= 1800 ? 'timer amber' : 'timer';

  // -- leerer Pool --------------------------------------------------
  const isVerteilung = cfg.bauform === 'verteilung';
  const poolEmpty = isVerteilung
    ? cards.length === 0
    : cfg.bauform === 'mc'
    ? quiz.length === 0
    : cfg.bauform === 'feste'
    ? exam.length === 0
    : cards.length === 0;

  if (poolEmpty) {
    return (
      <p className="muted">
        Für diese Bauform sind im aktuellen Filter keine Aufgaben verfügbar.
        {cfg.bauform === 'feste'
          ? ' (Feste Aufgaben werden unter track.exam hinterlegt.)'
          : ' (Aufgaben werden aus den Karteikarten bzw. dem Quiz gezogen.)'}
      </p>
    );
  }

  // -- aufklappbare Liste bisheriger Durchläufe --------------------
  const history =
    runs.length > 0 ? (
      <details className="card" style={{ marginTop: 16, textAlign: 'left' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Bisherige Durchläufe ({runs.length})
        </summary>
        <div style={{ marginTop: 10 }}>
          {[...runs]
            .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
            .map((r, i) => {
              const nr = runs.length - i; // neueste oben = höchste Nummer
              const datum = new Date(r.takenAt).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
              });
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '6px 0',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.08)',
                  }}
                >
                  <span className="muted">
                    #{nr} · {datum}
                  </span>
                  <span>
                    Ø {r.avg}% · Note {noteFor(r.avg)} · {fmt(r.durationSec)}
                  </span>
                </div>
              );
            })}
        </div>
      </details>
    ) : null;

  // -- Startbildschirm ---------------------------------------------
  if (!started) {
    // Bauform 4 mit Modus-Wahl: einzelne Quellen oder alle.
    if (cfg.bauform === 'verteilung' && cfg.modes) {
      return (
        <>
          <div className="card center">
            <h3>Probeprüfung</h3>
            <p className="muted">
              Wähle den Prüfungsteil. {durationMin} Minuten, Timer startet
              sofort.
            </p>
            <div className="options" style={{ marginTop: 12 }}>
              {cfg.quellen.map((qs, i) => (
                <button key={i} className="btn" onClick={() => startWith([i])}>
                  Nur {qs.label}
                </button>
              ))}
              <button
                className="btn primary"
                onClick={() => startWith(cfg.quellen.map((_, i) => i))}
              >
                Beide Teile
              </button>
            </div>
          </div>
          {history}
        </>
      );
    }
    return (
      <>
        <div className="card center">
          <h3>Probeprüfung</h3>
          <p className="muted">
            {durationMin} Minuten. Der Timer startet sofort und sperrt die
            Bearbeitung bei Ablauf. Die Aufgaben werden bei jedem Start neu
            zusammengestellt.
          </p>
          <button className="btn primary" onClick={() => startWith(null)}>
            Prüfung starten
          </button>
        </div>
        {history}
      </>
    );
  }

  const avg =
    tasks.length > 0 && Object.keys(grades).length === tasks.length
      ? Math.round(
          Object.values(grades).reduce((a, b) => a + b, 0) / tasks.length
        )
      : null;

  return (
    <div>
      <div className={timerCls}>{fmt(left)}</div>

      {finished && left === 0 && avg === null && !grading && (
        <div className="overlay">
          <div className="overlay-box">
            <strong>Zeit abgelaufen</strong>
            <p>Die Bearbeitung ist gesperrt.</p>
            <button className="btn primary" onClick={gradeAll}>
              Zur Auswertung
            </button>
          </div>
        </div>
      )}

      {tasks.map((t, n) => (
        <div key={`${t.kind}:${t.id}`}>
          {t.heading && <h3 style={{ margin: '20px 0 8px' }}>{t.heading}</h3>}
          <div className="card">
            <div className="card-meta">
              <span className="tag">{t.session}</span>
              <span className="muted">
                Aufgabe {n + 1}
                {t.kind === 'mc' ? ' · Multiple Choice' : ''}
                {t.points ? ` · ${t.points} Punkte` : ''}
              </span>
            </div>
            <p className="card-q">{t.q}</p>

            {t.kind === 'offen' ? (
              <textarea
                rows={5}
                disabled={finished}
                value={answers[t.id] ?? ''}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [t.id]: e.target.value }))
                }
                placeholder="Antwort …"
              />
            ) : (
              <div className="options">
                {t.options!.map((opt, idx) => {
                  let cls = 'option';
                  if (finished) {
                    if (idx === t.correct) cls += ' correct';
                    else if (idx === mcPicks[t.id]) cls += ' wrong';
                  } else if (mcPicks[t.id] === idx) {
                    cls += ' correct';
                  }
                  return (
                    <button
                      key={idx}
                      className={cls}
                      disabled={finished}
                      onClick={() =>
                        setMcPicks((m) => ({ ...m, [t.id]: idx }))
                      }
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {finished && t.kind === 'mc' && t.expl && (
              <div className="expl">{t.expl}</div>
            )}
            {grades[t.id] !== undefined && (
              <div className="muted">
                Bewertung: {grades[t.id]}% · Note {noteFor(grades[t.id])}
              </div>
            )}
          </div>
        </div>
      ))}

      {!finished && (
        <button className="btn primary" disabled={grading} onClick={gradeAll}>
          {grading ? 'Wird bewertet …' : 'Abgeben & bewerten'}
        </button>
      )}
      {grading && avg === null && (
        <p className="muted">
          Die offenen Antworten werden von der KI bewertet …
        </p>
      )}

      {avg !== null && (
        <div className="card center">
          <h3>
            Gesamt: Ø {avg}% · Note {noteFor(avg)}
          </h3>
          <p className="muted">
            {tasks.length} Aufgaben · benötigte Zeit: {fmt(used)} von{' '}
            {fmt(total)}
          </p>
          <button className="btn" onClick={() => setStarted(false)}>
            Neue Probeprüfung
          </button>
        </div>
      )}
    </div>
  );
}
