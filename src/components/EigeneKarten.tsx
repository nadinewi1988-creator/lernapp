import { useEffect, useMemo, useState } from 'react';
import { noteFor } from '../lib/grading';
import { gradeAnswer, helpFor } from '../lib/api';
import { MicButton } from './MicButton';
import {
  type CustomCard,
  type CustomKind,
  KIND_LABEL,
  loadCardsLocal,
  saveCardsLocal,
  pullCardsCloud,
  pushCardsCloud,
  mergeCards,
  visible,
  newCardId,
  parseLuecken,
  lueckeRichtig,
} from '../lib/customCards';

// ============================================================
//  Reiter "Eigene Karten"
//
//  Karten, die Nadine selbst anlegt – je Modul + Bereich.
//  Vier Formate: Frage/Antwort, Multiple Choice, offene Aufgabe
//  mit KI-Bewertung und Lueckentext. Gespeichert wird lokal UND
//  (bei Login) in Supabase, siehe lib/customCards.ts.
//
//  Der Lernfortschritt der Modul-Karten wird NICHT beruehrt –
//  eigene Karten sind ein eigenes Uebungswerkzeug.
// ============================================================

interface Props {
  moduleId: string;
  trackId: string;
  sessions: string[];
  userId?: string;
}

type View = 'ueben' | 'verwalten';

interface Entwurf {
  id: string | null;
  kind: CustomKind;
  thema: string;
  q: string;
  a: string;
  hint: string;
  options: string[];
  correct: number[];
}

function leererEntwurf(thema: string): Entwurf {
  return {
    id: null,
    kind: 'qa',
    thema,
    q: '',
    a: '',
    hint: '',
    options: ['', '', '', ''],
    correct: [],
  };
}

export function EigeneKarten({ moduleId, trackId, sessions, userId }: Props) {
  const [all, setAll] = useState<CustomCard[]>([]);
  const [view, setView] = useState<View>('ueben');
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [fehler, setFehler] = useState('');
  const [importText, setImportText] = useState('');
  const [importOffen, setImportOffen] = useState(false);

  // Laden: lokal sofort, danach mit der Cloud mergen.
  useEffect(() => {
    const local = loadCardsLocal(moduleId, trackId);
    setAll(local);
    let cancelled = false;
    void pullCardsCloud(moduleId, trackId).then((cloud) => {
      if (cancelled) return;
      const merged = mergeCards(local, cloud);
      setAll(merged);
      saveCardsLocal(moduleId, trackId, merged);
      if (merged.length > 0) void pushCardsCloud(moduleId, trackId, merged);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId, trackId, userId]);

  function speichern(next: CustomCard[]) {
    setAll(next);
    saveCardsLocal(moduleId, trackId, next);
    void pushCardsCloud(moduleId, trackId, next);
  }

  const karten = useMemo(() => visible(all), [all]);
  const themen = useMemo(() => {
    const set = new Set<string>();
    for (const c of karten) if (c.thema) set.add(c.thema);
    return [...set];
  }, [karten]);

  // ---- Karte speichern / loeschen -------------------------------

  function pruefen(e: Entwurf): string {
    if (!e.q.trim()) return 'Die Frage darf nicht leer sein.';
    if ((e.kind === 'qa' || e.kind === 'offen') && !e.a.trim())
      return 'Bitte eine Musterantwort eintragen.';
    if (e.kind === 'mc') {
      const opts = e.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) return 'Bitte mindestens zwei Antwortmöglichkeiten.';
      if (e.correct.filter((i) => (e.options[i] ?? '').trim()).length === 0)
        return 'Bitte mindestens eine richtige Antwort ankreuzen.';
    }
    if (e.kind === 'luecke' && !/\[[^\]]+\]/.test(e.q))
      return 'Bitte mindestens eine Lücke in eckige Klammern setzen, z. B. [Paris].';
    return '';
  }

  function entwurfSpeichern() {
    if (!entwurf) return;
    const problem = pruefen(entwurf);
    if (problem) {
      setFehler(problem);
      return;
    }
    const jetzt = new Date().toISOString();
    // Optionen aufraeumen: leere raus, Indizes der richtigen mitziehen.
    let options: string[] | undefined;
    let correct: number[] | undefined;
    if (entwurf.kind === 'mc') {
      options = [];
      correct = [];
      entwurf.options.forEach((o, i) => {
        if (!o.trim()) return;
        if (entwurf.correct.includes(i)) correct!.push(options!.length);
        options!.push(o.trim());
      });
    }
    const basis: CustomCard = {
      id: entwurf.id ?? newCardId(),
      kind: entwurf.kind,
      thema: entwurf.thema.trim() || 'Eigene Karten',
      q: entwurf.q.trim(),
      a: entwurf.a.trim(),
      hint: entwurf.hint.trim() || undefined,
      options,
      correct,
      createdAt: entwurf.id
        ? all.find((c) => c.id === entwurf.id)?.createdAt ?? jetzt
        : jetzt,
      updatedAt: jetzt,
    };
    speichern(mergeCards(all, [basis]));
    setEntwurf(null);
    setFehler('');
  }

  function loeschen(id: string) {
    const karte = all.find((c) => c.id === id);
    if (!karte) return;
    speichern(
      mergeCards(all, [
        { ...karte, deleted: true, updatedAt: new Date().toISOString() },
      ])
    );
  }

  function bearbeiten(c: CustomCard) {
    setEntwurf({
      id: c.id,
      kind: c.kind,
      thema: c.thema,
      q: c.q,
      a: c.a,
      hint: c.hint ?? '',
      options: [...(c.options ?? []), '', '', '', ''].slice(
        0,
        Math.max(4, (c.options ?? []).length)
      ),
      correct: [...(c.correct ?? [])],
    });
    setFehler('');
    setView('verwalten');
  }

  function importieren() {
    const jetzt = new Date().toISOString();
    const neue: CustomCard[] = [];
    for (const zeile of importText.split('\n')) {
      const t = zeile.trim();
      if (!t) continue;
      const teile = t.split(/\s*[;|]\s*|\s+-\s+/);
      if (teile.length < 2) continue;
      neue.push({
        id: newCardId(),
        kind: 'qa',
        thema: 'Eigene Karten',
        q: teile[0].trim(),
        a: teile.slice(1).join(' – ').trim(),
        createdAt: jetzt,
        updatedAt: jetzt,
      });
    }
    if (neue.length === 0) {
      setFehler('Keine Zeile im Format "Frage; Antwort" gefunden.');
      return;
    }
    speichern(mergeCards(all, neue));
    setImportText('');
    setImportOffen(false);
    setFehler('');
  }

  // ---- Ansicht --------------------------------------------------

  return (
    <div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        <button
          className={view === 'ueben' ? 'on' : ''}
          onClick={() => setView('ueben')}
        >
          Üben ({karten.length})
        </button>
        <button
          className={view === 'verwalten' ? 'on' : ''}
          onClick={() => setView('verwalten')}
        >
          Meine Karten
        </button>
      </div>

      {view === 'ueben' ? (
        <Ueben karten={karten} themen={themen} />
      ) : (
        <div>
          {!entwurf && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                className="btn primary"
                onClick={() => {
                  setEntwurf(leererEntwurf(sessions[0] ?? 'Eigene Karten'));
                  setFehler('');
                }}
              >
                + Neue Karte
              </button>
              <button
                className="btn ghost"
                onClick={() => setImportOffen((v) => !v)}
              >
                Mehrere auf einmal
              </button>
            </div>
          )}

          {importOffen && !entwurf && (
            <div className="card">
              <p className="muted" style={{ marginTop: 0 }}>
                Eine Karte je Zeile, Frage und Antwort mit Semikolon getrennt:
                <br />
                <code>Was ist Globalisierung?; Verdichtung weltweiter Beziehungen</code>
              </p>
              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Frage; Antwort"
              />
              <button className="btn primary" onClick={importieren}>
                Karten anlegen
              </button>
            </div>
          )}

          {entwurf && (
            <Editor
              entwurf={entwurf}
              setEntwurf={setEntwurf}
              sessions={sessions}
              themen={themen}
              onSpeichern={entwurfSpeichern}
              onAbbrechen={() => {
                setEntwurf(null);
                setFehler('');
              }}
            />
          )}

          {fehler && (
            <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{fehler}</p>
          )}

          {karten.length === 0 && !entwurf && (
            <p className="muted">
              Noch keine eigenen Karten in diesem Bereich. Mit „+ Neue Karte"
              anfangen – die Karten werden gespeichert und sind auf allen
              Geräten da, auf denen du angemeldet bist.
            </p>
          )}

          {karten.map((c) => (
            <div key={c.id} className="card">
              <div className="card-meta">
                <span className="tag">{c.thema}</span>
                <span className="muted">{KIND_LABEL[c.kind]}</span>
              </div>
              <p className="card-q" style={{ fontSize: '1rem' }}>
                {c.q}
              </p>
              {c.kind === 'mc' ? (
                <ul className="muted" style={{ margin: '0 0 10px 18px' }}>
                  {(c.options ?? []).map((o, i) => (
                    <li key={i}>
                      {(c.correct ?? []).includes(i) ? '✓ ' : '– '}
                      {o}
                    </li>
                  ))}
                </ul>
              ) : (
                c.a && <div className="answer-box shown">{c.a}</div>
              )}
              <div className="card-actions">
                <button className="btn ghost sm" onClick={() => bearbeiten(c)}>
                  Bearbeiten
                </button>
                <button className="btn ghost sm" onClick={() => loeschen(c.id)}>
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Editor ----------------------------------------------------

function Editor({
  entwurf,
  setEntwurf,
  sessions,
  themen,
  onSpeichern,
  onAbbrechen,
}: {
  entwurf: Entwurf;
  setEntwurf: (e: Entwurf) => void;
  sessions: string[];
  themen: string[];
  onSpeichern: () => void;
  onAbbrechen: () => void;
}) {
  const set = (teil: Partial<Entwurf>) => setEntwurf({ ...entwurf, ...teil });
  const listId = 'eigene-themen';

  return (
    <div className="card">
      <datalist id={listId}>
        {[...new Set([...themen, ...sessions])].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <label style={{ display: 'block', marginBottom: 10 }}>
        Format
        <select
          value={entwurf.kind}
          onChange={(e) => set({ kind: e.target.value as CustomKind })}
          style={{ marginLeft: 8 }}
        >
          {(Object.keys(KIND_LABEL) as CustomKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 10 }}>
        Thema
        <input
          className="input sm"
          list={listId}
          value={entwurf.thema}
          onChange={(e) => set({ thema: e.target.value })}
          placeholder="z. B. Sitzung 3 oder Eigene Karten"
          style={{ marginLeft: 8, minWidth: 240 }}
        />
      </label>

      <label style={{ display: 'block' }}>
        {entwurf.kind === 'luecke'
          ? 'Satz mit Lücken – Lücken in eckige Klammern, mehrere Lösungen mit |'
          : 'Frage'}
      </label>
      <textarea
        rows={entwurf.kind === 'luecke' ? 4 : 3}
        value={entwurf.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder={
          entwurf.kind === 'luecke'
            ? 'Die Hauptstadt von Frankreich ist [Paris].'
            : 'Was besagt …?'
        }
      />

      {entwurf.kind === 'mc' ? (
        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Antwortmöglichkeiten – richtige ankreuzen
          </label>
          {entwurf.options.map((o, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
            >
              <input
                type="checkbox"
                checked={entwurf.correct.includes(i)}
                onChange={(e) =>
                  set({
                    correct: e.target.checked
                      ? [...entwurf.correct, i]
                      : entwurf.correct.filter((x) => x !== i),
                  })
                }
              />
              <input
                className="input sm"
                style={{ flex: 1 }}
                value={o}
                onChange={(e) => {
                  const next = [...entwurf.options];
                  next[i] = e.target.value;
                  set({ options: next });
                }}
                placeholder={`Antwort ${i + 1}`}
              />
            </div>
          ))}
          <button
            className="btn ghost sm"
            onClick={() => set({ options: [...entwurf.options, ''] })}
          >
            + Antwort
          </button>
          <label style={{ display: 'block', marginTop: 12 }}>
            Erklärung (erscheint nach dem Antworten, optional)
          </label>
          <textarea
            rows={2}
            value={entwurf.a}
            onChange={(e) => set({ a: e.target.value })}
          />
        </div>
      ) : entwurf.kind === 'luecke' ? (
        <>
          <label style={{ display: 'block' }}>
            Erklärung (erscheint nach dem Prüfen, optional)
          </label>
          <textarea
            rows={2}
            value={entwurf.a}
            onChange={(e) => set({ a: e.target.value })}
          />
        </>
      ) : (
        <>
          <label style={{ display: 'block' }}>
            {entwurf.kind === 'offen'
              ? 'Musterlösung – gegen sie bewertet die KI deine Antwort'
              : 'Antwort'}
          </label>
          <textarea
            rows={4}
            value={entwurf.a}
            onChange={(e) => set({ a: e.target.value })}
          />
          <label style={{ display: 'block' }}>Tipp (optional)</label>
          <input
            className="input sm"
            style={{ width: '100%' }}
            value={entwurf.hint}
            onChange={(e) => set({ hint: e.target.value })}
            placeholder="Denkanstoß, der die Antwort nicht verrät"
          />
        </>
      )}

      <div className="card-actions" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={onSpeichern}>
          Speichern
        </button>
        <button className="btn ghost" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ---- Üben ------------------------------------------------------

function Ueben({ karten, themen }: { karten: CustomCard[]; themen: string[] }) {
  const [aktiv, setAktiv] = useState<Set<string>>(new Set());
  const [reihenfolge, setReihenfolge] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);

  // Antwort-Zustand der aktuellen Karte
  const [gezeigt, setGezeigt] = useState(false);
  const [tipp, setTipp] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<number[]>([]);
  const [geprueft, setGeprueft] = useState(false);
  const [luecken, setLuecken] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [ergebnis, setErgebnis] = useState<{ pct: number; fb: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [hilfe, setHilfe] = useState<string | null>(null);

  const gefiltert = useMemo(
    () => karten.filter((c) => aktiv.size === 0 || aktiv.has(c.thema)),
    [karten, aktiv]
  );

  const pool = useMemo(() => {
    if (!reihenfolge) return gefiltert;
    const byId = new Map(gefiltert.map((c) => [c.id, c]));
    const sortiert = reihenfolge
      .map((id) => byId.get(id))
      .filter((c): c is CustomCard => Boolean(c));
    const rest = gefiltert.filter((c) => !reihenfolge.includes(c.id));
    return [...sortiert, ...rest];
  }, [gefiltert, reihenfolge]);

  const karte = pool[idx];

  function zuruecksetzen() {
    setGezeigt(false);
    setTipp(false);
    setGewaehlt([]);
    setGeprueft(false);
    setLuecken([]);
    setText('');
    setErgebnis(null);
    setHilfe(null);
  }

  function gehe(delta: number) {
    if (pool.length === 0) return;
    setIdx((i) => (i + delta + pool.length) % pool.length);
    zuruecksetzen();
  }

  function mischen() {
    const ids = [...gefiltert.map((c) => c.id)];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setReihenfolge(ids);
    setIdx(0);
    zuruecksetzen();
  }

  async function bewerten() {
    if (!karte || !text.trim()) return;
    setBusy(true);
    setHilfe(null);
    try {
      setErgebnis(await gradeAnswer(karte.q, karte.a, text));
    } finally {
      setBusy(false);
    }
  }

  async function hilfeHolen() {
    if (!karte) return;
    setBusy(true);
    try {
      setHilfe(await helpFor(karte.q, karte.a));
    } finally {
      setBusy(false);
    }
  }

  if (karten.length === 0) {
    return (
      <p className="muted">
        Noch keine eigenen Karten in diesem Bereich. Lege unter „Meine Karten"
        die erste an.
      </p>
    );
  }

  const teile = karte && karte.kind === 'luecke' ? parseLuecken(karte.q) : [];
  const lueckenIdx = teile
    .map((t, i) => (t.luecke ? i : -1))
    .filter((i) => i >= 0);

  return (
    <div>
      {themen.length > 1 && (
        <div className="filterbar">
          <div className="checks">
            {themen.map((t) => (
              <label key={t} className={aktiv.has(t) ? 'checked' : ''}>
                <input
                  type="checkbox"
                  checked={aktiv.size === 0 || aktiv.has(t)}
                  onChange={() => {
                    const next = new Set(aktiv.size === 0 ? themen : aktiv);
                    next.has(t) ? next.delete(t) : next.add(t);
                    setAktiv(next.size === themen.length ? new Set() : next);
                    setIdx(0);
                    zuruecksetzen();
                  }}
                />
                {t}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={mischen}>
          Mischen
        </button>
      </div>

      {pool.length === 0 || !karte ? (
        <p className="muted">Keine Karten im aktuellen Filter.</p>
      ) : (
        <div className="card">
          <div className="card-meta">
            <span className="tag">{karte.thema}</span>
            <span className="muted">
              {idx + 1} / {pool.length} · {KIND_LABEL[karte.kind]}
            </span>
          </div>

          {karte.kind === 'luecke' ? (
            <p className="card-q">
              {teile.map((t, i) =>
                t.luecke ? (
                  <input
                    key={i}
                    className="input sm"
                    style={{
                      width: `${Math.max(6, t.loesungen[0]?.length ?? 8)}ch`,
                      margin: '0 4px',
                      borderColor: geprueft
                        ? lueckeRichtig(
                            luecken[lueckenIdx.indexOf(i)] ?? '',
                            t.loesungen
                          )
                          ? 'var(--sage)'
                          : 'var(--danger)'
                        : undefined,
                    }}
                    value={luecken[lueckenIdx.indexOf(i)] ?? ''}
                    onChange={(e) => {
                      const next = [...luecken];
                      next[lueckenIdx.indexOf(i)] = e.target.value;
                      setLuecken(next);
                    }}
                  />
                ) : (
                  <span key={i}>{t.text}</span>
                )
              )}
            </p>
          ) : (
            <p className="card-q">{karte.q}</p>
          )}

          {karte.kind === 'qa' && (
            <>
              <div className="card-actions">
                <button
                  className="btn ghost sm"
                  onClick={() => setGezeigt((v) => !v)}
                >
                  {gezeigt ? 'Antwort verbergen' : 'Antwort anzeigen'}
                </button>
                {karte.hint && (
                  <button
                    className="btn ghost sm"
                    onClick={() => setTipp((v) => !v)}
                  >
                    {tipp ? 'Tipp verbergen' : 'Tipp anzeigen'}
                  </button>
                )}
              </div>
              {tipp && karte.hint && <div className="tip-box">💡 {karte.hint}</div>}
              {gezeigt && <div className="answer-box shown">{karte.a}</div>}
            </>
          )}

          {karte.kind === 'mc' && (
            <>
              <div className="options">
                {(karte.options ?? []).map((opt, i) => {
                  let cls = 'option';
                  if (geprueft) {
                    if ((karte.correct ?? []).includes(i)) cls += ' correct';
                    else if (gewaehlt.includes(i)) cls += ' wrong';
                  } else if (gewaehlt.includes(i)) cls += ' chosen';
                  return (
                    <button
                      key={i}
                      className={cls}
                      disabled={geprueft}
                      onClick={() =>
                        setGewaehlt((prev) =>
                          prev.includes(i)
                            ? prev.filter((x) => x !== i)
                            : [...prev, i]
                        )
                      }
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {!geprueft ? (
                <button
                  className="btn primary"
                  disabled={gewaehlt.length === 0}
                  onClick={() => setGeprueft(true)}
                >
                  Prüfen
                </button>
              ) : (
                <div className="expl">
                  {[...gewaehlt].sort().join(',') ===
                  [...(karte.correct ?? [])].sort().join(',')
                    ? '✓ Richtig.'
                    : '✗ Nicht ganz – richtig ist oben grün markiert.'}
                  {karte.a ? ' ' + karte.a : ''}
                </div>
              )}
            </>
          )}

          {karte.kind === 'luecke' && (
            <>
              {!geprueft ? (
                <button className="btn primary" onClick={() => setGeprueft(true)}>
                  Prüfen
                </button>
              ) : (
                <div className="expl">
                  {lueckenIdx.every((i, n) =>
                    lueckeRichtig(luecken[n] ?? '', teile[i].loesungen)
                  )
                    ? '✓ Alle Lücken richtig.'
                    : 'Lösung: ' +
                      lueckenIdx
                        .map((i) => teile[i].loesungen[0])
                        .join(' · ')}
                  {karte.a ? ' ' + karte.a : ''}
                </div>
              )}
            </>
          )}

          {karte.kind === 'offen' && (
            <>
              {karte.hint && (
                <div className="card-actions">
                  <button
                    className="btn ghost sm"
                    onClick={() => setTipp((v) => !v)}
                  >
                    {tipp ? 'Tipp verbergen' : 'Tipp anzeigen'}
                  </button>
                </div>
              )}
              {tipp && karte.hint && <div className="tip-box">💡 {karte.hint}</div>}
              <div className="answer-input">
                <div className="answer-input-head">
                  <label>Deine Antwort</label>
                  <MicButton onText={(t) => setText((prev) => prev + t)} />
                </div>
                <textarea
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Antwort formulieren – dann bewerten lassen …"
                />
                <button className="btn primary" disabled={busy} onClick={bewerten}>
                  {busy ? 'Bewerte …' : 'Antwort bewerten'}
                </button>
              </div>
              {ergebnis && (
                <div className="result">
                  <div
                    className="result-circle"
                    style={{
                      background: `conic-gradient(var(--sage) ${ergebnis.pct}%, var(--line) 0)`,
                    }}
                  >
                    <span>{ergebnis.pct}%</span>
                  </div>
                  <div>
                    <strong>Note {noteFor(ergebnis.pct)}</strong>
                    <p>{ergebnis.fb}</p>
                    {ergebnis.pct < 60 && (
                      <button className="btn ghost sm" onClick={hilfeHolen}>
                        Hilfe zu diesem Thema anfordern
                      </button>
                    )}
                  </div>
                </div>
              )}
              {hilfe && <div className="help-box">{hilfe}</div>}
              <div className="card-actions">
                <button
                  className="btn ghost sm"
                  onClick={() => setGezeigt((v) => !v)}
                >
                  {gezeigt ? 'Musterlösung verbergen' : 'Musterlösung anzeigen'}
                </button>
              </div>
              {gezeigt && <div className="answer-box shown">{karte.a}</div>}
            </>
          )}

          <div className="nav">
            <button className="btn ghost" onClick={() => gehe(-1)}>
              ← Zurück
            </button>
            <button className="btn ghost" onClick={() => gehe(1)}>
              Weiter →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
