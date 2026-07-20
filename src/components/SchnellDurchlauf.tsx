import { useEffect, useMemo, useState } from 'react';
import type { Flashcard } from '../types';
import { noteFor } from '../lib/grading';
import { gradeAnswer } from '../lib/api';
import {
  type Attempt,
  newAttemptId,
  shortenQ,
  formatWhen,
  attemptsForCard,
  loadAttemptsLocal,
  saveAttemptsLocal,
  mergeAttempts,
  pullAttemptsCloud,
  pushAttemptsCloud,
} from '../lib/attempts';

// ============================================================
// Schnelldurchlauf – Fragen wie die Karteikarten, aber bewertet
// wird gegen die STICHWÖRTER. Kurzantwort tippen -> KI bewertet.
// Unter jeder Karte der Verlauf der letzten Versuche DIESER Karte
// (eigener Verlauf, getrennt von den Karteikarten und den anderen
// Karten). Karteikarten-Fortschritt wird NICHT verändert.
// ============================================================

type KwCard = Flashcard & { keywords?: string[] };

interface Props {
  moduleId: string;
  trackId: string;
  cards: KwCard[];
  sessions: string[];
  userId?: string;
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function SchnellDurchlauf({
  moduleId,
  trackId,
  cards,
  sessions,
  userId,
}: Props) {
  const withKw = useMemo(
    () => cards.filter((c) => c.keywords && c.keywords.length > 0),
    [cards]
  );
  const availSessions = useMemo(
    () => sessions.filter((s) => withKw.some((c) => c.session === s)),
    [withKw, sessions]
  );

  const [bereich, setBereich] = useState<string>('alle');
  const pool = useMemo(
    () =>
      bereich === 'alle'
        ? withKw
        : withKw.filter((c) => c.session === bereich),
    [withKw, bereich]
  );

  const [seq, setSeq] = useState<KwCard[]>([]);
  const [pos, setPos] = useState(0);
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<Attempt[]>([]);

  function resetCard() {
    setAnswer('');
    setGrading(false);
    setPct(null);
    setFeedback('');
    setRevealed(false);
  }

  useEffect(() => {
    setSeq(shuffle(pool));
    setPos(0);
    resetCard();
  }, [pool]);

  useEffect(() => {
    const local = loadAttemptsLocal(moduleId, trackId, 'schnell');
    setHistory(local);
    let cancelled = false;
    void pullAttemptsCloud(moduleId, trackId, 'schnell').then((cloud) => {
      if (cancelled) return;
      const merged = mergeAttempts(local, cloud);
      setHistory(merged);
      saveAttemptsLocal(moduleId, trackId, 'schnell', merged);
      void pushAttemptsCloud(moduleId, trackId, 'schnell', merged);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId, trackId, userId]);

  function recordAttempt(cardId: string, q: string, p: number) {
    const entry: Attempt = {
      id: newAttemptId(),
      cardId,
      q: shortenQ(q),
      pct: p,
      takenAt: new Date().toISOString(),
    };
    setHistory((prev) => {
      const merged = mergeAttempts([entry], prev);
      saveAttemptsLocal(moduleId, trackId, 'schnell', merged);
      void pushAttemptsCloud(moduleId, trackId, 'schnell', merged);
      return merged;
    });
  }

  if (withKw.length === 0) {
    return (
      <p className="muted">
        Für diesen Bereich sind noch keine Schlüsselwörter hinterlegt.
      </p>
    );
  }

  const done = pos >= seq.length;
  const card = !done ? seq[pos] : null;
  const cardHistory = card ? attemptsForCard(history, card.id) : [];

  const next = () => {
    resetCard();
    setPos((p) => p + 1);
  };
  const prev = () => {
    resetCard();
    setPos((p) => Math.max(0, p - 1));
  };
  const restart = () => {
    setSeq(shuffle(pool));
    setPos(0);
    resetCard();
  };

  async function bewerten() {
    if (!card) return;
    setGrading(true);
    const massstab = 'Erwartete Kernpunkte: ' + (card.keywords ?? []).join('; ');
    try {
      const r = await gradeAnswer(card.q, massstab, answer);
      setPct(r.pct);
      if (r.fb) setFeedback(r.fb);
      recordAttempt(card.id, card.q, r.pct);
    } catch {
      setFeedback('Bewertung gerade nicht möglich – Stichwörter siehe unten.');
    }
    setGrading(false);
    setRevealed(true);
  }

  return (
    <div>
      <div className="pickers">
        {availSessions.length > 1 && (
          <label>
            Bereich
            <select
              value={bereich}
              onChange={(e) => setBereich(e.target.value)}
            >
              <option value="alle">Alle Bereiche</option>
              {availSessions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn" onClick={restart}>
          Mischen
        </button>
      </div>

      {done ? (
        <div className="card center">
          <h3>Durchlauf beendet</h3>
          <p className="muted">{seq.length} Karten durchgegangen.</p>
          <button className="btn primary" onClick={restart}>
            Neu starten
          </button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ textAlign: 'center' }}>
            Karte {pos + 1} von {seq.length}
          </p>

          <div className="card">
            <div className="card-meta">
              <span className="tag">{card!.session}</span>
              <span className="muted">Kurzantwort – Bewertung nach Stichwörtern</span>
            </div>
            <p className="card-q">{card!.q}</p>

            <textarea
              rows={4}
              disabled={revealed || grading}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Kurz die wichtigsten Punkte notieren …"
            />

            {!revealed ? (
              <div className="options" style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  className="btn primary"
                  disabled={grading}
                  onClick={bewerten}
                >
                  {grading ? 'Wird bewertet …' : 'Abgeben & bewerten'}
                </button>
                <button
                  className="btn"
                  disabled={grading}
                  onClick={() => setRevealed(true)}
                >
                  Nur Stichwörter zeigen
                </button>
              </div>
            ) : (
              <>
                {pct !== null && (
                  <div className="card center" style={{ margin: '12px 0' }}>
                    <h3 style={{ margin: 0 }}>
                      {pct}% · Note {noteFor(pct)}
                    </h3>
                    {feedback && (
                      <p className="muted" style={{ marginTop: 6 }}>
                        {feedback}
                      </p>
                    )}
                  </div>
                )}
                <p className="muted" style={{ marginTop: 4 }}>
                  Erwartete Stichwörter:
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  {card!.keywords!.map((k, i) => (
                    <span
                      key={i}
                      style={{
                        background: 'rgba(120,150,120,0.16)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: '0.95em',
                        lineHeight: 1.4,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </>
            )}

            {cardHistory.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="muted" style={{ fontWeight: 600, marginBottom: 4 }}>
                  Letzte Versuche dieser Karte
                </p>
                {cardHistory.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '4px 0',
                    }}
                  >
                    <span className="muted">{formatWhen(h.takenAt)}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {h.pct}% · Note {noteFor(h.pct)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="options" style={{ display: 'flex', gap: 10 }}>
            <button className="btn" disabled={pos === 0} onClick={prev}>
              Zurück
            </button>
            <button className="btn primary" onClick={next}>
              {pos + 1 >= seq.length ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
