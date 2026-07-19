import { useState } from 'react';
import type { Flashcard } from '../types';

// "Karten auswählen"-Panel: einzelne Karten an-/abwählen, unabhängig
// vom Sitzungs-Filter. Ausgeblendete Karten fallen aus Karteikarten,
// Quiz und Probeprüfung heraus. Pro Sitzung aufklappbar, mit
// Alle/Keine je Sitzung und global.

interface Props {
  cards: Flashcard[];
  sessions: string[];
  hidden: Set<string>;
  onToggle: (cardId: string, hide: boolean) => void;
  onBulk: (cardIds: string[], hide: boolean) => void;
}

export function CardSelector({
  cards,
  sessions,
  hidden,
  onToggle,
  onBulk,
}: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(s: string) {
    const next = new Set(expanded);
    next.has(s) ? next.delete(s) : next.add(s);
    setExpanded(next);
  }

  const allIds = cards.filter((c) => !c.flagged).map((c) => c.id);

  return (
    <div className="card-selector">
      <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
        📂 Karten auswählen
      </button>

      {open && (
        <div className="cs-panel">
          <div className="cs-head">
            <strong>Karten je Sitzung an-/abwählen</strong>
            <div>
              <button className="btn ghost sm" onClick={() => onBulk(allIds, false)}>
                Alle anzeigen
              </button>
              <button className="btn ghost sm" onClick={() => onBulk(allIds, true)}>
                Alle ausblenden
              </button>
            </div>
          </div>

          {sessions.map((s) => {
            const inS = cards.filter((c) => c.session === s && !c.flagged);
            if (inS.length === 0) return null;
            const activeCount = inS.filter((c) => !hidden.has(c.id)).length;
            const isOpen = expanded.has(s);
            return (
              <div className="cs-session" key={s}>
                <div className="cs-session-head">
                  <button className="cs-arrow" onClick={() => toggleExpand(s)}>
                    {isOpen ? '▼' : '▶'} {s}{' '}
                    <span className="muted">
                      ({activeCount}/{inS.length} aktiv)
                    </span>
                  </button>
                  <div>
                    <button
                      className="btn ghost sm"
                      onClick={() => onBulk(inS.map((c) => c.id), false)}
                    >
                      Alle
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={() => onBulk(inS.map((c) => c.id), true)}
                    >
                      Keine
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="cs-cards">
                    {inS.map((c) => (
                      <label key={c.id} className="cs-card-row">
                        <input
                          type="checkbox"
                          checked={!hidden.has(c.id)}
                          onChange={(e) => onToggle(c.id, !e.target.checked)}
                        />
                        <span>{c.q}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
