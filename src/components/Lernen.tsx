import { useMemo, useState } from 'react';

// ============================================================
// Lernen – der Wegweiser durch den Stoff.
//
// Anders als Karteikarten, Quiz, Probeprüfung und Schnelldurchlauf
// wird hier NICHTS abgefragt. Der Reiter erklärt die Inhalte:
// pro Thema erst eine Kurzfassung, darunter aufklappbar die
// ausführliche Erklärung mit Begriffen, Vorgehen, Stolperfallen
// und dem, was in der Klausur davon verlangt wird.
//
// Der Reiter blendet sich automatisch nur ein, wenn der Bereich
// das optionale Feld `lessons` in der Modul-JSON hat – genau wie
// der Schnelldurchlauf sich nur bei hinterlegten Stichwörtern
// einblendet. `types.ts` wird dafür NICHT angefasst.
//
// "Durchgearbeitet"-Häkchen liegen nur im localStorage dieses
// Geräts – sie sind kein Lernfortschritt und wandern nicht in die
// Datenbank.
// ============================================================

export interface LessonSection {
  h: string;
  body: string;
}

export interface Lesson {
  id: string;
  /** Muss einem Eintrag aus track.sessions entsprechen.
   *  Fehlt das Feld, ist es die Überblicksseite (steht ganz oben). */
  session?: string;
  title: string;
  /** Kurzfassung – immer sichtbar. */
  kurz: string;
  /** Ausführliche Erklärung – aufklappbar. */
  sections?: LessonSection[];
  begriffe?: { t: string; d: string }[];
  stolperfallen?: string[];
  klausur?: string[];
}

interface Props {
  moduleId: string;
  trackId: string;
  lessons: Lesson[];
  sessions: string[];
}

// ---- Mini-Textformatierung -----------------------------------
// Absätze durch Leerzeile, Aufzählungen mit "• " am Zeilenanfang,
// **fett** für Begriffe. Bewusst ohne Markdown-Bibliothek.

function inline(text: string, keyBase: string) {
  return text.split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyBase}-${i}`}>{part}</strong> : <span key={`${keyBase}-${i}`}>{part}</span>
  );
}

function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim() !== '');
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isList = lines.every((l) => l.trim().startsWith('•'));
        if (isList) {
          return (
            <ul key={bi} style={{ margin: '0 0 12px', paddingLeft: 20 }}>
              {lines.map((l, li) => (
                <li key={li} style={{ marginBottom: 4 }}>
                  {inline(l.trim().replace(/^•\s*/, ''), `${bi}-${li}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ margin: '0 0 12px' }}>
            {inline(block, String(bi))}
          </p>
        );
      })}
    </>
  );
}

// ---- gelesen-Markierung (nur lokal) ---------------------------

function doneKey(moduleId: string, trackId: string) {
  return `lernen-done:${moduleId}:${trackId}`;
}

function loadDone(moduleId: string, trackId: string): Set<string> {
  try {
    const raw = localStorage.getItem(doneKey(moduleId, trackId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDone(moduleId: string, trackId: string, done: Set<string>) {
  try {
    localStorage.setItem(doneKey(moduleId, trackId), JSON.stringify([...done]));
  } catch {
    /* Speichern nicht möglich (privater Modus o. Ä.) – nicht schlimm */
  }
}

// ---- Eine Lerneinheit -----------------------------------------

function LessonCard({
  lesson,
  isDone,
  onToggleDone,
}: {
  lesson: Lesson;
  isDone: boolean;
  onToggleDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasLong =
    (lesson.sections?.length ?? 0) > 0 ||
    (lesson.begriffe?.length ?? 0) > 0 ||
    (lesson.stolperfallen?.length ?? 0) > 0 ||
    (lesson.klausur?.length ?? 0) > 0;

  return (
    <div className="card">
      <div className="card-meta">
        <span className="tag">{lesson.session ?? 'Überblick'}</span>
        <label
          className="muted"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={isDone}
            onChange={onToggleDone}
            style={{ accentColor: 'var(--sage)' }}
          />
          durchgearbeitet
        </label>
      </div>

      <p className="card-q" style={{ fontSize: '1.15rem' }}>
        {lesson.title}
      </p>

      <div className="answer-box">
        <RichText text={lesson.kurz} />
      </div>

      {hasLong && (
        <>
          <div className="card-actions">
            <button className="btn" onClick={() => setOpen((o) => !o)}>
              {open ? 'Ausführliche Erklärung zuklappen' : 'Ausführlich erklären'}
            </button>
          </div>

          {open && (
            <div>
              {lesson.sections?.map((s, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <p
                    className="muted"
                    style={{
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      fontSize: '0.76rem',
                      marginBottom: 6,
                    }}
                  >
                    {s.h}
                  </p>
                  <RichText text={s.body} />
                </div>
              ))}

              {lesson.begriffe && lesson.begriffe.length > 0 && (
                <div className="expl" style={{ marginBottom: 14 }}>
                  <p style={{ fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
                    Die wichtigsten Begriffe
                  </p>
                  <dl style={{ margin: 0 }}>
                    {lesson.begriffe.map((b, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <dt style={{ fontWeight: 600, display: 'inline' }}>{b.t}</dt>
                        <dd style={{ display: 'inline', margin: '0 0 0 6px' }}>– {b.d}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {lesson.stolperfallen && lesson.stolperfallen.length > 0 && (
                <div className="tip-box" style={{ marginBottom: 14 }}>
                  <p style={{ fontWeight: 700, marginTop: 0, marginBottom: 8 }}>Stolperfallen</p>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {lesson.stolperfallen.map((s, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {inline(s, `sf-${i}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {lesson.klausur && lesson.klausur.length > 0 && (
                <div className="help-box">
                  <p style={{ fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
                    Das musst du für die Klausur können
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {lesson.klausur.map((s, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {inline(s, `kl-${i}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {lesson.session && (
                <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
                  Zum Üben: Dieses Thema heißt bei den Karteikarten, im Quiz und im
                  Schnelldurchlauf „{lesson.session}".
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Der Reiter ------------------------------------------------

export function Lernen({ moduleId, trackId, lessons, sessions }: Props) {
  const [done, setDone] = useState<Set<string>>(() => loadDone(moduleId, trackId));
  const [thema, setThema] = useState<string>('alle');

  // Überblick zuerst, danach in der Reihenfolge der Sitzungen.
  const sorted = useMemo(() => {
    const rank = (l: Lesson) =>
      l.session ? sessions.indexOf(l.session) + 1 : 0;
    return [...lessons].sort((a, b) => rank(a) - rank(b));
  }, [lessons, sessions]);

  const availSessions = useMemo(
    () => sessions.filter((s) => sorted.some((l) => l.session === s)),
    [sorted, sessions]
  );

  const shown = useMemo(
    () => (thema === 'alle' ? sorted : sorted.filter((l) => l.session === thema)),
    [sorted, thema]
  );

  function toggleDone(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveDone(moduleId, trackId, next);
      return next;
    });
  }

  if (sorted.length === 0) {
    return <p className="muted">Für diesen Bereich sind noch keine Lerntexte hinterlegt.</p>;
  }

  const withSession = sorted.filter((l) => l.session);
  const doneCount = withSession.filter((l) => done.has(l.id)).length;

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Hier wird nichts abgefragt – hier wird erklärt. Erst die Kurzfassung lesen; wenn
        etwas unklar bleibt, die ausführliche Erklärung aufklappen. Die Häkchen merkt sich
        nur dieses Gerät.
      </p>

      <div className="pickers">
        <label>
          Thema
          <select value={thema} onChange={(e) => setThema(e.target.value)}>
            <option value="alle">Alle Themen</option>
            {availSessions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {withSession.length > 0 && (
          <label>
            Durchgearbeitet
            <span
              style={{
                padding: '7px 10px',
                fontSize: '0.92rem',
                color: 'var(--sage-dark)',
                fontWeight: 700,
              }}
            >
              {doneCount} von {withSession.length}
            </span>
          </label>
        )}
      </div>

      {shown.map((l) => (
        <LessonCard
          key={l.id}
          lesson={l}
          isDone={done.has(l.id)}
          onToggleDone={() => toggleDone(l.id)}
        />
      ))}
    </div>
  );
}
