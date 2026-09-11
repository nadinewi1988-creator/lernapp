import { useEffect, useMemo, useRef, useState } from 'react';
import type { Module, Flashcard, ExamRun } from '../types';
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

// Probeklausur für ewb001 – baut die ECHTE Modulabschlussprüfung nach.
//
// Grundlage ist das Infoblatt zur Modulabschlussprüfung WiSe 2025/26:
//   • Schreibzeit 60 Minuten
//   • 15 Single-/Multiple-Choice-Fragen zu ewb001.1
//   • 15 Single-/Multiple-Choice-Fragen zu ewb001.2
//   • dazu ein oder zwei offene bzw. Lückentextfragen aus einem der beiden Teile
//   • jede MC-Aufgabe 1 Punkt; eine falsche ODER eine ausgelassene richtige
//     Antwort → 0 Punkte. Keine Teilpunkte.
//
// Wichtig gegenüber der alten Probeprüfung (components/Exam.tsx): Dort wurde
// bei Mehrfachauswahl nur die ERSTE richtige Antwort ausgewertet und man konnte
// nur eine Option anklicken. Das trainierte genau das Gegenteil dessen, was die
// Klausur verlangt. Hier ist es echte Mehrfachauswahl mit Alles-oder-nichts.
//
// Zwei Modi:
//   'echt'     – 15 + 15 zufällig gezogen, bei jedem Start neu
//   'original' – die 32 Aufgaben der Original-Altklausur in fester Reihenfolge

const TEILE = ['ewb001.1', 'ewb001.2'] as const;
type Teil = (typeof TEILE)[number];
type Modus = 'echt' | 'original';

interface McItem {
  id: string;
  teil?: string;
  thema?: string;
  quelle?: string;
  q: string;
  options: string[];
  correct: number[];
  expl?: string;
  unsicher?: boolean;
}

interface Aufgabe {
  id: string;
  kind: 'mc' | 'offen';
  herkunft: string;
  q: string;
  options?: string[];
  correct?: number[];
  expl?: string;
  a?: string;
}

interface Props {
  moduleId: string;
  module: Module;
  hidden: Set<string>;
  userId?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gleich(a: Set<number>, b: number[]) {
  return a.size === b.length && b.every((x) => a.has(x));
}

function schluessel(q: string) {
  return q.toLowerCase().replace(/\W+/g, '').slice(0, 80);
}

export function Probeklausur({ moduleId, module, hidden, userId }: Props) {
  const [modus, setModus] = useState<Modus | null>(null);
  const [tasks, setTasks] = useState<Aufgabe[]>([]);
  const [picks, setPicks] = useState<Record<string, Set<number>>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [left, setLeft] = useState(3600);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [grading, setGrading] = useState(false);
  const [runs, setRuns] = useState<ExamRun[]>([]);
  const [runsOffen, setRunsOffen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const runKey = modus === 'original' ? 'originalklausur' : 'probeklausur';

  // ---- Aufgabenpools -------------------------------------------------
  // MC-Pool je Teil: die modulweiten mcPool-Aufgaben (echte Mehrfachauswahl)
  // plus die Quizfragen des zugehörigen Bereichs (Single Choice). Beide
  // Formen kommen in der Klausur vor.
  const mcNach = useMemo(() => {
    const pool = ((module as any).mcPool ?? []) as McItem[];
    const out: Record<Teil, Aufgabe[]> = { 'ewb001.1': [], 'ewb001.2': [] };
    const gesehen = new Set<string>();
    pool.forEach((p) => {
      const teil = (p.teil as Teil) ?? 'ewb001.1';
      if (!out[teil] || hidden.has(p.id)) return;
      const k = schluessel(p.q);
      if (gesehen.has(k)) return;
      gesehen.add(k);
      out[teil].push({
        id: p.id,
        kind: 'mc',
        herkunft: p.quelle ?? teil,
        q: p.q,
        options: p.options,
        correct: p.correct,
        expl: p.expl,
      });
    });
    const trackTeil: Record<string, Teil> = {
      vorlesung: 'ewb001.1',
      seminar: 'ewb001.2',
    };
    module.tracks.forEach((t) => {
      const teil = trackTeil[t.id];
      if (!teil) return;
      t.quiz.forEach((q) => {
        if (q.flagged || hidden.has(q.id)) return;
        const k = schluessel(q.q);
        if (gesehen.has(k)) return;
        gesehen.add(k);
        out[teil].push({
          id: q.id,
          kind: 'mc',
          herkunft: q.session,
          q: q.q,
          options: q.options,
          correct: [q.correct],
          expl: q.expl,
        });
      });
    });
    return out;
  }, [module, hidden]);

  const offenePool = useMemo(() => {
    const cards: Flashcard[] = [];
    module.tracks.forEach((t) => {
      if (t.id === 'tutorium') return;
      t.flashcards.forEach((c) => {
        if (!c.flagged && !hidden.has(c.id)) cards.push(c);
      });
    });
    return cards;
  }, [module, hidden]);

  const originalAufgaben = useMemo(() => {
    const out: Aufgabe[] = [];
    module.tracks.forEach((t) => {
      t.exam.forEach((e) => {
        if (e.kind === 'mc' && e.options && e.correct) {
          out.push({
            id: e.id,
            kind: 'mc',
            herkunft: t.label,
            q: e.q,
            options: e.options,
            correct: e.correct,
            expl: e.a,
          });
        }
      });
    });
    return out;
  }, [module]);

  // ---- Durchläufe laden ----------------------------------------------
  useEffect(() => {
    const lokal = loadRunsLocal(moduleId, runKey);
    setRuns(lokal);
    let abgebrochen = false;
    void pullRunsCloud(moduleId, runKey).then((wolke) => {
      if (abgebrochen) return;
      setRuns(mergeRuns(lokal, wolke));
    });
    return () => {
      abgebrochen = true;
    };
    // userId in den Abhängigkeiten: nach einem Login-Wechsel werden die
    // Durchläufe neu aus der Cloud geholt (gleiches Vorgehen wie in Exam.tsx).
  }, [moduleId, runKey, userId]);

  // ---- Timer ----------------------------------------------------------
  useEffect(() => {
    if (!started || finished) return;
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current!);
  }, [started, finished]);

  const abgelaufen = left <= 0;

  function starten(m: Modus) {
    let gebaut: Aufgabe[] = [];
    if (m === 'original') {
      gebaut = originalAufgaben;
    } else {
      TEILE.forEach((teil) => {
        gebaut = gebaut.concat(shuffle(mcNach[teil]).slice(0, 15));
      });
      const anzahlOffen = 1 + Math.floor(Math.random() * 2); // ein oder zwei
      shuffle(offenePool)
        .slice(0, anzahlOffen)
        .forEach((c) =>
          gebaut.push({
            id: c.id,
            kind: 'offen',
            herkunft: c.session,
            q: c.q,
            a: c.a,
          })
        );
    }
    setModus(m);
    setTasks(gebaut);
    setPicks({});
    setAnswers({});
    setGrades({});
    setFinished(false);
    setLeft(3600);
    setStarted(true);
  }

  function toggle(taskId: string, idx: number) {
    if (finished || abgelaufen) return;
    setPicks((p) => {
      const next = new Set(p[taskId] ?? []);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { ...p, [taskId]: next };
    });
  }

  async function abgeben() {
    if (timer.current) clearInterval(timer.current);
    const gebraucht = 3600 - left;
    setGrading(true);
    const g: Record<string, number> = {};
    for (const t of tasks) {
      if (t.kind === 'offen') {
        const r = await gradeAnswer(t.q, t.a ?? '', answers[t.id] ?? '');
        g[t.id] = r.pct;
      } else {
        // Alles oder nichts – exakt die Regel des Infoblatts.
        g[t.id] = gleich(picks[t.id] ?? new Set(), t.correct ?? []) ? 100 : 0;
      }
    }
    setGrades(g);
    setGrading(false);
    setFinished(true);

    const schnitt = tasks.length
      ? Math.round(Object.values(g).reduce((a, b) => a + b, 0) / tasks.length)
      : 0;
    const lauf: ExamRun = {
      id: newRunId(),
      takenAt: new Date().toISOString(),
      avg: schnitt,
      durationSec: gebraucht,
      taskCount: tasks.length,
    };
    setRuns((prev) => {
      const next = addRun(prev, lauf);
      saveRunsLocal(moduleId, runKey, next);
      void pushRunsCloud(moduleId, runKey, next);
      return next;
    });
  }

  const mcAufgaben = tasks.filter((t) => t.kind === 'mc');
  const mcRichtig = mcAufgaben.filter((t) => grades[t.id] === 100).length;
  const schnitt = tasks.length
    ? Math.round(
        Object.values(grades).reduce((a, b) => a + b, 0) / tasks.length
      )
    : 0;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const timerCls = left <= 300 ? 'timer red' : left <= 900 ? 'timer amber' : 'timer';

  // ---- Startbildschirm -------------------------------------------------
  if (!started) {
    return (
      <div>
        <div className="card">
          <h3>Klausur im echten Format</h3>
          <p className="muted">
            Nachgebaut nach dem Infoblatt zur Modulabschlussprüfung:{' '}
            <strong>60 Minuten</strong>, 15 Single- oder
            Multiple-Choice-Fragen zu ewb001.1, 15 zu ewb001.2 und ein bis zwei
            offene Fragen. Jede MC-Aufgabe zählt einen Punkt – eine falsch
            angekreuzte <em>oder</em> eine ausgelassene richtige Antwort bedeutet
            0 Punkte für die ganze Aufgabe. Die Aufgaben werden bei jedem Start
            neu gezogen.
          </p>
          <p className="muted">
            Pool: {mcNach['ewb001.1'].length} Aufgaben zu ewb001.1,{' '}
            {mcNach['ewb001.2'].length} zu ewb001.2, {offenePool.length} mögliche
            offene Fragen.
          </p>
          <button className="btn primary" onClick={() => starten('echt')}>
            Klausur starten
          </button>
        </div>

        <div className="card">
          <h3>Originalklausur</h3>
          <p className="muted">
            Die {originalAufgaben.length} Aufgaben der echten Altklausur in
            fester Reihenfolge, ebenfalls mit 60 Minuten und
            Alles-oder-nichts-Bewertung. Achtung: Bei einigen Aufgaben war der
            Wortlaut der Antwortoptionen auf den Fotos nicht lesbar und ist aus
            den Unterlagen rekonstruiert – das steht dann in der Auflösung.
          </p>
          <button
            className="btn"
            onClick={() => starten('original')}
            disabled={originalAufgaben.length === 0}
          >
            Originalklausur starten
          </button>
        </div>

        {runs.length > 0 && (
          <div className="card">
            <button
              className="btn ghost sm"
              onClick={() => setRunsOffen((v) => !v)}
            >
              Bisherige Durchläufe ({runs.length})
            </button>
            {runsOffen && (
              <ul className="runs">
                {runs.map((r, i) => (
                  <li key={r.id}>
                    #{i + 1} · {r.avg}% · Note {noteFor(r.avg)} ·{' '}
                    {Math.round(r.durationSec / 60)} Min · {r.taskCount} Aufgaben
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- Klausur ----------------------------------------------------------
  return (
    <div>
      <div className="center">
        <span className={timerCls}>
          {mm}:{ss}
        </span>
        {abgelaufen && !finished && (
          <p className="muted">
            Die Schreibzeit ist um. In der echten Klausur schließt sich das
            Fenster hier – gib jetzt ab.
          </p>
        )}
      </div>

      {finished && (
        <div className="card center">
          <div
            className="result-circle big"
            style={{
              background: `conic-gradient(var(--sage) ${schnitt}%, var(--line) 0)`,
            }}
          >
            <span>{schnitt}%</span>
          </div>
          <h3>
            {mcRichtig} / {mcAufgaben.length} MC-Aufgaben richtig · Note{' '}
            {noteFor(schnitt)}
          </h3>
          <button
            className="btn primary"
            onClick={() => {
              setStarted(false);
              setFinished(false);
            }}
          >
            Zurück zur Auswahl
          </button>
        </div>
      )}

      {tasks.map((t, i) => {
        const gewaehlt = picks[t.id] ?? new Set<number>();
        const richtig = finished && grades[t.id] === 100;
        return (
          <div className="card" key={t.id}>
            <div className="card-meta">
              <span className="tag">{t.herkunft}</span>
              <span className="muted">
                Aufgabe {i + 1}/{tasks.length}
                {t.kind === 'mc' ? ' · 1 Punkt' : ' · offene Frage'}
              </span>
            </div>
            <p className="card-q">{t.q}</p>

            {t.kind === 'offen' ? (
              <textarea
                rows={5}
                disabled={finished || abgelaufen}
                value={answers[t.id] ?? ''}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [t.id]: e.target.value }))
                }
                placeholder="Antwort – Stichpunkte sind erlaubt …"
              />
            ) : (
              <div className="options">
                {t.options!.map((opt, idx) => {
                  let cls = 'option';
                  if (finished) {
                    const istRichtig = t.correct!.includes(idx);
                    if (istRichtig && gewaehlt.has(idx)) cls += ' correct';
                    else if (istRichtig) cls += ' missed';
                    else if (gewaehlt.has(idx)) cls += ' wrong';
                  } else if (gewaehlt.has(idx)) {
                    cls += ' chosen';
                  }
                  return (
                    <button
                      key={idx}
                      className={cls}
                      disabled={finished || abgelaufen}
                      onClick={() => toggle(t.id, idx)}
                    >
                      <span className="mc-box">
                        {gewaehlt.has(idx) ? '☑' : '☐'}
                      </span>{' '}
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {finished && t.kind === 'mc' && (
              <div className="expl">
                <strong>
                  {richtig
                    ? '✓ Richtig – 1 Punkt.'
                    : '✗ Falsch – 0 Punkte für die ganze Aufgabe.'}
                </strong>
                {!richtig && (
                  <>
                    {' '}
                    Richtig wäre gewesen:{' '}
                    {t.correct!.map((c) => String.fromCharCode(65 + c)).join(', ')}.
                  </>
                )}
                {t.expl ? (
                  <>
                    <br />
                    <br />
                    {t.expl}
                  </>
                ) : null}
              </div>
            )}
            {finished && t.kind === 'offen' && (
              <div className="expl">
                <strong>Erwartet wurde:</strong>
                <br />
                {t.a}
              </div>
            )}
            {grades[t.id] !== undefined && t.kind === 'offen' && (
              <div className="muted">
                Bewertung: {grades[t.id]}% · Note {noteFor(grades[t.id])}
              </div>
            )}
          </div>
        );
      })}

      {!finished && (
        <button className="btn primary" disabled={grading} onClick={abgeben}>
          {grading ? 'Wird bewertet …' : 'Abgeben & bewerten'}
        </button>
      )}
    </div>
  );
}
