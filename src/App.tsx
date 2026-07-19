import { useEffect, useMemo, useState } from 'react';
import type { AppData, ProgressMap } from './types';
import { appData } from './data';
import { useUser, AuthBar } from './components/Auth';
import { Flashcards } from './components/Flashcards';
import { Quiz } from './components/Quiz';
import { Exam } from './components/Exam';
import {
  loadLocal,
  saveLocal,
  pullCloud,
  pushCloudDebounced,
  mergeProgress,
} from './lib/progress';

type Tab = 'karten' | 'quiz' | 'probe';

export default function App() {
  const data: AppData = appData;
  const user = useUser();

  // Auswahl: Semester -> Modul -> Track
  // Starte mit dem ersten Semester, das tatsächlich Module enthält
  // (leere Semester wie noch nicht belegte werden übersprungen).
  const firstFilled =
    data.semesters.find((s) => s.modules.length > 0) ?? data.semesters[0];
  const [semId, setSemId] = useState(firstFilled?.id ?? '');
  const semester =
    data.semesters.find((s) => s.id === semId) ?? data.semesters[0];

  const [modId, setModId] = useState(semester?.modules[0]?.id ?? '');
  const module =
    semester?.modules.find((m) => m.id === modId) ?? semester?.modules[0];

  const [trackId, setTrackId] = useState(module?.tracks[0]?.id ?? 'vorlesung');
  const track =
    module?.tracks.find((t) => t.id === trackId) ?? module?.tracks[0];

  const [tab, setTab] = useState<Tab>('karten');
  const [progress, setProgress] = useState<ProgressMap>({});

  // Beim Wechsel von Modul/Track: lokalen Stand laden, dann Cloud mergen.
  useEffect(() => {
    if (!module || !track) return;
    const local = loadLocal(module.id, track.id);
    setProgress(local);
    let cancelled = false;
    void pullCloud(module.id, track.id).then((cloud) => {
      if (cancelled) return;
      const merged = mergeProgress(local, cloud);
      setProgress(merged);
      saveLocal(module.id, track.id, merged);
      pushCloudDebounced(module.id, track.id, merged);
    });
    return () => {
      cancelled = true;
    };
  }, [module?.id, track?.id, user?.id]);

  function updateProgress(next: ProgressMap) {
    if (!module || !track) return;
    setProgress(next);
    saveLocal(module.id, track.id, next);
    pushCloudDebounced(module.id, track.id, next);
  }

  const semesters = data.semesters;
  const modules = semester?.modules ?? [];
  const tracks = module?.tracks ?? [];

  const title = useMemo(
    () => `${module?.name ?? ''} – ${track?.label ?? ''}`,
    [module, track]
  );

  if (!semester || !module || !track) {
    return <div className="wrap">Keine Daten vorhanden.</div>;
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>{title}</h1>
        <AuthBar user={user} />
      </header>

      {/* Auswahl: Semester -> Modul -> Track */}
      <div className="pickers">
        <label>
          Semester
          <select
            value={semId}
            onChange={(e) => {
              const s = data.semesters.find((x) => x.id === e.target.value)!;
              setSemId(s.id);
              setModId(s.modules[0]?.id ?? '');
              setTrackId(s.modules[0]?.tracks[0]?.id ?? 'vorlesung');
            }}
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Modul
          <select
            value={modId}
            onChange={(e) => {
              const m = modules.find((x) => x.id === e.target.value)!;
              setModId(m.id);
              setTrackId(m.tracks[0]?.id ?? 'vorlesung');
            }}
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {tracks.length > 1 && (
          <label>
            Teil
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value as typeof trackId)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav className="tabs">
        <button
          className={tab === 'karten' ? 'active' : ''}
          onClick={() => setTab('karten')}
        >
          Karteikarten
        </button>
        <button
          className={tab === 'quiz' ? 'active' : ''}
          onClick={() => setTab('quiz')}
        >
          Quiz
        </button>
        <button
          className={tab === 'probe' ? 'active' : ''}
          onClick={() => setTab('probe')}
        >
          Probeprüfung
        </button>
      </nav>

      {tab === 'karten' && (
        <Flashcards
          moduleId={module.id}
          trackId={track.id}
          cards={track.flashcards}
          sessions={track.sessions}
          progress={progress}
          onProgress={updateProgress}
        />
      )}
      {tab === 'quiz' && (
        <Quiz questions={track.quiz} sessions={track.sessions} />
      )}
      {tab === 'probe' && (
        <Exam
          tasks={track.exam}
          durationMin={track.examDurationMin ?? 90}
        />
      )}
    </div>
  );
}
