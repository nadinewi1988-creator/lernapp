import { useMemo, useState } from 'react';
import { noteFor } from '../lib/grading';

// Reiter "MC-Training": ein Pool aller Multiple-Choice-Aufgaben eines Moduls,
// quer über alle Bereiche und aus allen Quellen (Altklausur, Lernzielkontrollen,
// BrainYoo, Lernzettel).
//
// Anders als der Quiz-Reiter ist das hier ECHTE Mehrfachauswahl mit der
// Alles-oder-nichts-Bewertung der Klausur: Eine falsch angekreuzte ODER eine
// ausgelassene richtige Antwort kostet die ganze Aufgabe. Genau deshalb gibt es
// den Reiter – vorsichtiges Weniger-Ankreuzen muss sich als Reflex abgewöhnen,
// wer hier übt.
//
// Der Pool steht im optionalen Feld `mcPool` der Modul-JSON. types.ts wird dafür
// NICHT angefasst (gleiches Vorgehen wie bei `lessons` und `keywords`), der Typ
// lebt lokal hier.

export interface McItem {
  id: string;
  /** Altklausur | Lernzielkontrolle | BrainYoo | Lernzettel */
  quelle: string;
  /** Themenblock bzw. Sitzung, aus der die Aufgabe stammt. */
  thema: string;
  q: string;
  options: string[];
  /** Indizes ALLER richtigen Optionen – auch bei nur einer. */
  correct: number[];
  /** Kann leer sein (BrainYoo liefert keine Erklärung mit). */
  expl?: string;
  /** Lösung war in der Vorlage nicht eindeutig belegt. */
  unsicher?: boolean;
}

interface Props {
  pool: McItem[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sameSet(a: Set<number>, b: number[]) {
  return a.size === b.length && b.every((x) => a.has(x));
}

/** Mehrfachauswahl-Filter als Chip-Reihe, wie der Sitzungsfilter. */
function ChipFilter({
  titel,
  werte,
  selected,
  onChange,
}: {
  titel: string;
  werte: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(w: string) {
    const next = new Set(selected);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    onChange(next);
  }
  return (
    <div className="filterbar">
      <div className="fbhead">
        <strong>{titel}</strong>
        <div className="fbactions">
          <button onClick={() => onChange(new Set(werte))}>Alle</button>
          <button onClick={() => onChange(new Set())}>Keine</button>
        </div>
      </div>
      <div className="checks">
        {werte.map((w) => (
          <label key={w} className={selected.has(w) ? 'checked' : ''}>
            <input
              type="checkbox"
              checked={selected.has(w)}
              onChange={() => toggle(w)}
            />
            {w}
          </label>
        ))}
      </div>
    </div>
  );
}

export function MCTraining({ pool }: Props) {
  const quellen = useMemo(
    () => Array.from(new Set(pool.map((p) => p.quelle))).sort(),
    [pool]
  );
  const themen = useMemo(
    () => Array.from(new Set(pool.map((p) => p.thema))).sort(),
    [pool]
  );

  const [selQuellen, setSelQuellen] = useState<Set<string>>(new Set(quellen));
  const [selThemen, setSelThemen] = useState<Set<string>>(new Set(themen));
  const [runde, setRunde] = useState(0);
  const [i, setI] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [richtig, setRichtig] = useState(0);
  const [done, setDone] = useState(false);

  const aufgaben = useMemo(() => {
    const gefiltert = pool.filter(
      (p) => selQuellen.has(p.quelle) && selThemen.has(p.thema)
    );
    return shuffle(gefiltert);
    // runde ist bewusst Teil der Abhängigkeiten: neu mischen bei "Neu starten".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, selQuellen, selThemen, runde]);

  function neustart(q = selQuellen, t = selThemen) {
    setSelQuellen(q);
    setSelThemen(t);
    setRunde((r) => r + 1);
    setI(0);
    setChecked(new Set());
    setSubmitted(false);
    setRichtig(0);
    setDone(false);
  }

  const a = aufgaben[i];

  function toggleOption(idx: number) {
    if (submitted) return;
    const next = new Set(checked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setChecked(next);
  }

  function pruefen() {
    if (submitted || checked.size === 0) return;
    setSubmitted(true);
    if (sameSet(checked, a.correct)) setRichtig((r) => r + 1);
  }

  function weiter() {
    if (i + 1 >= aufgaben.length) setDone(true);
    else {
      setI((x) => x + 1);
      setChecked(new Set());
      setSubmitted(false);
    }
  }

  const pct = aufgaben.length
    ? Math.round((richtig / aufgaben.length) * 100)
    : 0;
  const warRichtig = submitted && a ? sameSet(checked, a.correct) : false;

  return (
    <div>
      <p className="muted">
        Alle Multiple-Choice-Aufgaben des Moduls in einem Pool – aus der
        Altklausur, den Lernzielkontrollen, dem BrainYoo-Kartensatz und dem
        Lernzettel. Bewertet wird wie in der echten Klausur:{' '}
        <strong>alles oder nichts</strong>. Eine falsch angekreuzte oder eine
        ausgelassene richtige Antwort kostet die ganze Aufgabe.
      </p>

      <ChipFilter
        titel="Quelle"
        werte={quellen}
        selected={selQuellen}
        onChange={(next) => neustart(next, selThemen)}
      />
      <ChipFilter
        titel="Thema"
        werte={themen}
        selected={selThemen}
        onChange={(next) => neustart(selQuellen, next)}
      />

      {aufgaben.length === 0 ? (
        <p className="muted">Keine Aufgaben im aktuellen Filter.</p>
      ) : done ? (
        <div className="card center">
          <div
            className="result-circle big"
            style={{
              background: `conic-gradient(var(--sage) ${pct}%, var(--line) 0)`,
            }}
          >
            <span>{pct}%</span>
          </div>
          <h3>
            {richtig} / {aufgaben.length} richtig · Note {noteFor(pct)}
          </h3>
          <button className="btn primary" onClick={() => neustart()}>
            Neu mischen
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-meta">
            <span className="tag">{a.quelle}</span>
            <span className="muted">
              {richtig} / {aufgaben.length} richtig · Aufgabe {i + 1}/
              {aufgaben.length}
            </span>
          </div>
          <p className="card-q">{a.q}</p>
          <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
            {a.thema} · {a.correct.length === 1 ? 'eine' : a.correct.length}{' '}
            {a.correct.length === 1 ? 'richtige Antwort' : 'richtige Antworten'}
          </p>

          <div className="options">
            {a.options.map((opt, idx) => {
              let cls = 'option';
              if (submitted) {
                const istRichtig = a.correct.includes(idx);
                if (istRichtig && checked.has(idx)) cls += ' correct';
                else if (istRichtig) cls += ' missed';
                else if (checked.has(idx)) cls += ' wrong';
              } else if (checked.has(idx)) {
                cls += ' chosen';
              }
              return (
                <button
                  key={idx}
                  className={cls}
                  disabled={submitted}
                  onClick={() => toggleOption(idx)}
                >
                  <span className="mc-box">{checked.has(idx) ? '☑' : '☐'}</span>{' '}
                  {opt}
                </button>
              );
            })}
          </div>

          {!submitted ? (
            <button
              className="btn primary"
              disabled={checked.size === 0}
              onClick={pruefen}
            >
              Antwort prüfen
            </button>
          ) : (
            <>
              <div className="expl">
                <strong>
                  {warRichtig
                    ? '✓ Richtig – 1 Punkt.'
                    : '✗ Falsch – 0 Punkte für die ganze Aufgabe.'}
                </strong>
                {!warRichtig && (
                  <>
                    {' '}
                    Richtig wäre gewesen:{' '}
                    {a.correct
                      .map((c) => String.fromCharCode(65 + c))
                      .join(', ')}
                    .
                  </>
                )}
                {a.expl ? (
                  <>
                    <br />
                    <br />
                    {a.expl}
                  </>
                ) : null}
                {a.unsicher ? (
                  <>
                    <br />
                    <br />
                    <em>
                      Hinweis: Die Lösung dieser Aufgabe war in der Vorlage nicht
                      eindeutig zu erkennen.
                    </em>
                  </>
                ) : null}
              </div>
              <button className="btn primary" onClick={weiter}>
                {i + 1 >= aufgaben.length ? 'Auswertung' : 'Weiter'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
