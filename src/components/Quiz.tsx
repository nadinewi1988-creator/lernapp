import { useMemo, useState } from 'react';
import type { QuizQuestion } from '../types';
import { noteFor } from '../lib/grading';
import { SessionFilter } from './SessionFilter';

interface Props {
  questions: QuizQuestion[];
  sessions: string[];
}

export function Quiz({ questions, sessions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(sessions));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const pool = useMemo(
    () => questions.filter((q) => !q.flagged && selected.has(q.session)),
    [questions, selected]
  );

  const q = pool[i];

  function restart(next: Set<string>) {
    setSelected(next);
    setI(0);
    setPicked(null);
    setCorrect(0);
    setDone(false);
  }

  function pick(opt: number) {
    if (picked !== null) return;
    setPicked(opt);
    if (opt === q.correct) setCorrect((c) => c + 1);
  }

  function next() {
    if (i + 1 >= pool.length) setDone(true);
    else {
      setI((x) => x + 1);
      setPicked(null);
    }
  }

  const pct = pool.length ? Math.round((correctCount / pool.length) * 100) : 0;

  return (
    <div>
      <SessionFilter sessions={sessions} selected={selected} onChange={restart} />
      {pool.length === 0 ? (
        <p className="muted">Keine Quizfragen im aktuellen Filter.</p>
      ) : done ? (
        <div className="card center">
          <div className="result-circle big" style={{ background: `conic-gradient(var(--sage) ${pct}%, var(--line) 0)` }}>
            <span>{pct}%</span>
          </div>
          <h3>{correctCount} / {pool.length} richtig · Note {noteFor(pct)}</h3>
          <button className="btn primary" onClick={() => restart(selected)}>Neu mischen</button>
        </div>
      ) : (
        <div className="card">
          <div className="card-meta">
            <span className="tag">{q.session}</span>
            <span className="muted">{correctCount} / {pool.length} richtig · Frage {i + 1}/{pool.length}</span>
          </div>
          <p className="card-q">{q.q}</p>
          <div className="options">
            {q.options.map((opt, idx) => {
              let cls = 'option';
              if (picked !== null) {
                if (idx === q.correct) cls += ' correct';
                else if (idx === picked) cls += ' wrong';
              }
              return (
                <button key={idx} className={cls} disabled={picked !== null} onClick={() => pick(idx)}>{opt}</button>
              );
            })}
          </div>
          {picked !== null && (
            <>
              <div className="expl">{q.expl}</div>
              <button className="btn primary" onClick={next}>{i + 1 >= pool.length ? 'Auswertung' : 'Weiter'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
