import { useRef, useState } from 'react';
import type { Flashcard, ProgressMap } from '../types';
import { noteFor, progressColor } from '../lib/grading';
import { mergeProgress } from '../lib/progress';
import { Modal } from './Modal';

// Fortschritts-Panel (Projektanweisung):
//  - Gesamtanzeige "X / Y Karten geübt · Ø Z%"
//  - Export/Import als JSON (Merge: besserer Wert gewinnt)
//  - Zurücksetzen mit In-App-Bestätigung
//  - Raster pro Sitzung mit farbcodiertem Balken (nach Note, nicht
//    einheitlich grün) + Ø-Note

interface Props {
  cards: Flashcard[];
  sessions: string[];
  progress: ProgressMap;
  onChange: (next: ProgressMap) => void;
}

export function ProgressPanel({ cards, sessions, progress, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [askReset, setAskReset] = useState(false);

  const active = cards.filter((c) => !c.flagged);
  const practiced = active.filter((c) => progress[c.id]);
  const avgAll =
    practiced.length === 0
      ? null
      : Math.round(
          practiced.reduce((s, c) => s + progress[c.id].best, 0) /
            practiced.length
        );

  function exportJson() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lernfortschritt.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result)) as ProgressMap;
        onChange(mergeProgress(progress, incoming)); // Merge, kein Verlust
      } catch {
        /* kaputte Datei ignorieren */
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="progress-panel">
      <div className="progress-panel-head">
        <div>
          <span className="ppt-title">DEIN LERNFORTSCHRITT</span>
          <span className="ppt-summary">
            {practiced.length} / {active.length} Karten geübt
            {avgAll !== null ? ` · Ø ${avgAll}%` : ''}
          </span>
        </div>
        <div>
          <button className="btn ghost sm" onClick={exportJson}>
            Exportieren
          </button>
          <button
            className="btn ghost sm"
            onClick={() => fileRef.current?.click()}
          >
            Importieren
          </button>
          <button className="btn ghost sm" onClick={() => setAskReset(true)}>
            zurücksetzen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="progress-grid">
        {sessions.map((s) => {
          const inS = active.filter((c) => c.session === s);
          const done = inS.filter((c) => progress[c.id]);
          const avg =
            done.length === 0
              ? null
              : Math.round(
                  done.reduce((sum, c) => sum + progress[c.id].best, 0) /
                    done.length
                );
          const pct = inS.length ? (done.length / inS.length) * 100 : 0;
          return (
            <div className="pg-row" key={s}>
              <span className="pg-name">{s}</span>
              <div className="pg-bar">
                <div
                  className="pg-fill"
                  style={{
                    width: `${pct}%`,
                    background: progressColor(avg),
                  }}
                />
              </div>
              <span className="pg-count">
                {done.length}/{inS.length}
              </span>
              <span className="pg-note">
                {avg !== null ? `Ø${avg}% (${noteFor(avg)})` : '–'}
              </span>
            </div>
          );
        })}
      </div>

      <Modal
        open={askReset}
        title="Fortschritt zurücksetzen?"
        confirmLabel="Ja, zurücksetzen"
        cancelLabel="Abbrechen"
        onConfirm={() => {
          onChange({});
          setAskReset(false);
        }}
        onCancel={() => setAskReset(false)}
      >
        Der gesamte Lernfortschritt dieses Tracks wird gelöscht. Das lässt
        sich nicht rückgängig machen.
      </Modal>
    </div>
  );
}
