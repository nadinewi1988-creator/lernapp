import { useMemo, useState } from 'react';
import type { Flashcard, ProgressMap } from '../types';
import { noteFor } from '../lib/grading';
import { recordResult } from '../lib/progress';
import { gradeAnswer, helpFor } from '../lib/api';
import { SessionFilter } from './SessionFilter';
import { ProgressPanel } from './ProgressPanel';
import { MicButton } from './MicButton';

// Karteikarten-Reiter. Enthält die in der Projektanweisung
// geforderten Funktionen: Musterantwort ein-/ausblenden, Tipp,
// Freitext-Bewertung per API (Kreis + Prozent + Note), Hilfe-Button
// bei < 60 %, Spracheingabe. Karten-An-/Abwahl ist über den
// Fortschritts-/Filtermechanismus vorbereitet (flagged/Filter).

interface Props {
  moduleId: string;
  trackId: string;
  cards: Flashcard[];
  sessions: string[];
  progress: ProgressMap;
  onProgress: (next: ProgressMap) => void;
}

export function Flashcards({
  cards,
  sessions,
  progress,
  onProgress,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(sessions));
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [userText, setUserText] = useState('');
  const [result, setResult] = useState<{ pct: number; fb: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<string | null>(null);

  const pool = useMemo(
    () => cards.filter((c) => !c.flagged && selected.has(c.session)),
    [cards, selected]
  );

  const card = pool[idx];

  function reset() {
    setShowAnswer(false);
    setShowHint(false);
    setUserText('');
    setResult(null);
    setHelp(null);
  }

  function go(delta: number) {
    if (pool.length === 0) return;
    setIdx((i) => (i + delta + pool.length) % pool.length);
    reset();
  }

  async function grade() {
    if (!card || !userText.trim()) return;
    setBusy(true);
    setHelp(null);
    try {
      const r = await gradeAnswer(card.q, card.a, userText);
      setResult(r);
      onProgress(recordResult(progress, card.id, r.pct));
    } finally {
      setBusy(false);
    }
  }

  async function requestHelp() {
    if (!card) return;
    setBusy(true);
    try {
      setHelp(await helpFor(card.q, card.a));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ProgressPanel
        cards={cards}
        sessions={sessions}
        progress={progress}
        onChange={onProgress}
      />
      <SessionFilter
        sessions={sessions}
        selected={selected}
        onChange={(s) => {
          setSelected(s);
          setIdx(0);
          reset();
        }}
      />

      {pool.length === 0 ? (
        <p className="muted">Keine Karten im aktuellen Filter.</p>
      ) : (
        <div className="card">
          <div className="card-meta">
            <span className="tag">{card.session}</span>
            <span className="muted">
              {idx + 1} / {pool.length}
              {progress[card.id]
                ? ` · bisher Ø ${progress[card.id].best}% (${noteFor(
                    progress[card.id].best
                  )})`
                : ''}
            </span>
          </div>

          <p className="card-q">{card.q}</p>

          <div className="card-actions">
            <button className="btn ghost sm" onClick={() => setShowAnswer((v) => !v)}>
              {showAnswer ? 'Musterantwort verbergen' : 'Musterantwort anzeigen'}
            </button>
            {card.hint && (
              <button className="btn ghost sm" onClick={() => setShowHint((v) => !v)}>
                {showHint ? 'Tipp verbergen' : 'Tipp anzeigen'}
              </button>
            )}
          </div>

          {showHint && card.hint && <div className="tip-box">💡 {card.hint}</div>}
          {showAnswer && <div className="answer-box shown">{card.a}</div>}

          <div className="answer-input">
            <div className="answer-input-head">
              <label>Deine Antwort</label>
              <MicButton onText={(t) => setUserText((prev) => prev + t)} />
            </div>
            <textarea
              rows={4}
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              placeholder="Antwort formulieren – dann bewerten lassen …"
            />
            <button className="btn primary" disabled={busy} onClick={grade}>
              {busy ? 'Bewerte …' : 'Antwort bewerten'}
            </button>
          </div>

          {result && (
            <div className="result">
              <div
                className="result-circle"
                style={{
                  background: `conic-gradient(var(--sage) ${result.pct}%, var(--line) 0)`,
                }}
              >
                <span>{result.pct}%</span>
              </div>
              <div>
                <strong>Note {noteFor(result.pct)}</strong>
                <p>{result.fb}</p>
                {result.pct < 60 && (
                  <button className="btn ghost sm" onClick={requestHelp}>
                    Hilfe zu diesem Thema anfordern
                  </button>
                )}
              </div>
            </div>
          )}

          {help && <div className="help-box">{help}</div>}

          <div className="nav">
            <button className="btn ghost" onClick={() => go(-1)}>
              ← Zurück
            </button>
            <button className="btn ghost" onClick={() => go(1)}>
              Weiter →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
