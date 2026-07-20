import { useEffect, useMemo, useState } from 'react';
import type { Flashcard } from '../types';

// ============================================================
// Schnelldurchlauf – dieselben Fragen wie die Karteikarten,
// aber statt der ausformulierten Musterlösung nur die wichtigen
// Schlüsselwörter. Für schnelle Wiederholungen ohne Tippen:
// Frage lesen, im Kopf beantworten, antippen zum Aufdecken.
//
// Die Schlüsselwörter kommen aus dem optionalen Feld `keywords`
// je Karte (nur dort, wo hinterlegt). types.ts bleibt unberührt –
// wir erweitern den Typ nur lokal.
// ============================================================

type KwCard = Flashcard & { keywords?: string[] };

interface Props {
  cards: KwCard[];
  sessions: string[];
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function SchnellDurchlauf({ cards, sessions }: Props) {
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
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setSeq(shuffle(pool));
    setPos(0);
    setRevealed(false);
  }, [pool]);

  if (withKw.length === 0) {
    return (
      <p className="muted">
        Für diesen Bereich sind noch keine Schlüsselwörter hinterlegt.
      </p>
    );
  }

  const done = pos >= seq.length;
  const card = !done ? seq[pos] : null;

  const next = () => {
    setRevealed(false);
    setPos((p) => p + 1);
  };
  const prev = () => {
    setRevealed(false);
    setPos((p) => Math.max(0, p - 1));
  };
  const restart = () => {
    setSeq(shuffle(pool));
    setPos(0);
    setRevealed(false);
  };

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

          <div
            className="card"
            onClick={() => !revealed && setRevealed(true)}
            style={{ cursor: revealed ? 'default' : 'pointer' }}
          >
            <div className="card-meta">
              <span className="tag">{card!.session}</span>
            </div>
            <p className="card-q">{card!.q}</p>

            {!revealed ? (
              <p className="muted" style={{ marginTop: 8 }}>
                Erst selbst beantworten – dann tippen, um die Schlüsselwörter
                aufzudecken.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 10,
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
            )}
          </div>

          <div className="options" style={{ display: 'flex', gap: 10 }}>
            <button className="btn" disabled={pos === 0} onClick={prev}>
              Zurück
            </button>
            {!revealed && (
              <button className="btn" onClick={() => setRevealed(true)}>
                Aufdecken
              </button>
            )}
            <button className="btn primary" onClick={next}>
              {pos + 1 >= seq.length ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
