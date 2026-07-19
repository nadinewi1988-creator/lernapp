// Einheitlicher Sitzungs-/Seminar-Filter (Projektanweisung):
// Checkboxen + "Alle"/"Keine"-Buttons. Jeder Reiter hält seinen
// EIGENEN Filterzustand – deshalb wird selected von außen gesteuert.

interface Props {
  sessions: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Probeprüfung: zusätzlicher "Alle Bereiche"-Button für Zufallsauswahl. */
  showAllAreas?: boolean;
  onAllAreas?: () => void;
}

export function SessionFilter({
  sessions,
  selected,
  onChange,
  showAllAreas,
  onAllAreas,
}: Props) {
  function toggle(s: string) {
    const next = new Set(selected);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange(next);
  }

  return (
    <div className="filterbar">
      <div className="fbhead">
        <strong>Bereiche</strong>
        <div className="fbactions">
          <button onClick={() => onChange(new Set(sessions))}>Alle</button>
          <button onClick={() => onChange(new Set())}>Keine</button>
          {showAllAreas && (
            <button onClick={onAllAreas}>Alle Bereiche (Zufall)</button>
          )}
        </div>
      </div>
      <div className="checks">
        {sessions.map((s) => (
          <label key={s} className={selected.has(s) ? 'checked' : ''}>
            <input
              type="checkbox"
              checked={selected.has(s)}
              onChange={() => toggle(s)}
            />
            {s}
          </label>
        ))}
      </div>
    </div>
  );
}
