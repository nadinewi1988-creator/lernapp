import type { Module } from '../types';
import { loadLocal } from '../lib/progress';
import { noteFor, progressColor } from '../lib/grading';

// Übersicht über ALLE Tracks eines Moduls (Vorlesung/Seminar/Tutorium):
// zeigt je Track "geübt X/Y · Ø Z%" plus einen Gesamtwert über alle
// Tracks. Liest den lokal gespeicherten Stand jedes Tracks direkt aus,
// damit auch die nicht gerade geöffneten Tracks mitzählen.

// Ein kleiner Trigger-Wert (z.B. progress-Version) sorgt dafür, dass
// sich die Übersicht nach einer Bewertung aktualisiert.
interface Props {
  module: Module;
  refreshKey: unknown;
}

function statsFor(moduleId: string, trackId: string, activeCardCount: number) {
  const p = loadLocal(moduleId, trackId);
  const ids = Object.keys(p);
  const practiced = ids.length;
  const avg =
    practiced === 0
      ? null
      : Math.round(ids.reduce((s, id) => s + p[id].best, 0) / practiced);
  return { practiced, total: activeCardCount, avg };
}

export function ModuleOverview({ module }: Props) {
  const rows = module.tracks.map((t) => {
    const activeCards = t.flashcards.filter((c) => !c.flagged).length;
    return { label: t.label, ...statsFor(module.id, t.id, activeCards) };
  });

  // Gesamt über alle Tracks
  let gPract = 0,
    gTotal = 0,
    gSum = 0,
    gCount = 0;
  for (const t of module.tracks) {
    const p = loadLocal(module.id, t.id);
    const ids = Object.keys(p);
    gPract += ids.length;
    gTotal += t.flashcards.filter((c) => !c.flagged).length;
    for (const id of ids) {
      gSum += p[id].best;
      gCount++;
    }
  }
  const gAvg = gCount === 0 ? null : Math.round(gSum / gCount);

  // Nur anzeigen, wenn es mehr als einen Track gibt – sonst ist der
  // normale Fortschrittskasten im Reiter ohnehin identisch.
  if (module.tracks.length < 2) return null;

  return (
    <div className="module-overview">
      <div className="mo-head">
        <span className="mo-title">GESAMTFORTSCHRITT · {module.name}</span>
        <span className="mo-total">
          {gPract} / {gTotal} Karten geübt
          {gAvg !== null ? ` · Ø ${gAvg}% (${noteFor(gAvg)})` : ''}
        </span>
      </div>
      <div className="mo-rows">
        {rows.map((r) => {
          const pct = r.total ? (r.practiced / r.total) * 100 : 0;
          return (
            <div className="mo-row" key={r.label}>
              <span className="mo-name">{r.label}</span>
              <div className="mo-bar">
                <div
                  className="mo-fill"
                  style={{ width: `${pct}%`, background: progressColor(r.avg) }}
                />
              </div>
              <span className="mo-count">
                {r.practiced}/{r.total}
              </span>
              <span className="mo-note">
                {r.avg !== null ? `Ø${r.avg}%` : '–'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
