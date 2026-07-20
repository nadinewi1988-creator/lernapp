import { useEffect, useMemo, useState } from 'react';
import type { AppData, ProgressMap } from './types';
import { appData } from './data';
import { useUser, AuthBar } from './components/Auth';
import { Flashcards } from './components/Flashcards';
import { ModuleOverview } from './components/ModuleOverview';
import { CardSelector } from './components/CardSelector';
import { Quiz } from './components/Quiz';
import { Exam } from './components/Exam';
import { SchnellDurchlauf } from './components/SchnellDurchlauf';
import { ExamCountdown } from './components/ExamCountdown';
import {
  loadLocal,
  saveLocal,
  pullCloud,
  pushCloudDebounced,
  mergeProgress,
  loadHiddenLocal,
  saveHiddenLocal,
  pullHiddenCloud,
  setHiddenCloud,
} from './lib/progress';

type Tab = 'karten' | 'quiz' | 'probe' | 'schnell';

export default function App() {
  const data: AppData = appData;
  const user = useUser();

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
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!module || !track) return;
    const local = loadLocal(module.id, track.id);
    setProgress(local);
    const localHidden = loadHiddenLocal(module.id, track.id);
    setHidden(localHidden);
    let cancelled = false;
    void pullCloud(module.id, track.id).then((cloud) => {
      if (cancelled) return;
      const merged = mergeProgress(local, cloud);
      setProgress(merged);
      saveLocal(module.id, track.id, merged);
      pushCloudDebounced(module.id, track.id, merged);
    });
    void pullHiddenCloud(module.id, track.id).then((cloudHidden) => {
      if (cancelled) return;
      const union = new Set([...localHidden, ...cloudHidden]);
      setHidden(union);
      saveHiddenLocal(module.id, track.id, union);
    });
    return () => {
      cancelled = true;
    };
  }, [module?.id, track?.id, user?.id]);

  function toggleHidden(cardId: string, hide: boolean) {
    if (!module || !track) return;
    setHidden((prev) => {
      const next = new Set(prev);
      hide ? next.add(cardId) : next.delete(cardId);
      saveHiddenLocal(module.id, track.id, next);
      return next;
    });
    void setHiddenCloud(module.id, track.id, cardId, hide);
  }

  function bulkHidden(cardIds: string[], hide: boolean) {
    if (!module || !track) return;
    setHidden((prev) => {
      const next = new Set(prev);
      for (const id of cardIds) hide ? next.add(id) : next.delete(id);
      saveHiddenLocal(module.id, track.id, next);
      return next;
    });
    for (const id of cardIds) void setHiddenCloud(module.id, track.id, id, hide);
  }

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

  // Schnelldurchlauf-Reiter nur anbieten, wenn dieser Bereich
  // überhaupt Schlüsselwörter hinterlegt hat (z. B. pkb002).
  const hasKeywords = track.flashcards.some(
    (c: any) => Array.isArray(c.keywords) && c.keywords.length > 0
  );
  const activeTab: Tab = tab === 'schnell' && !hasKeywords ? 'karten' : tab;

  return (
    <div className="wrap">
      <header className="top">
        <h1>{title}</h1>
        <AuthBar user={user} />
      </header>

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
            Bereich
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

      <ExamCountdown moduleId={module.id} />

      <ModuleOverview module={module} refreshKey={progress} />

      <nav className="tabs">
        <button
          className={activeTab === 'karten' ? 'active' : ''}
          onClick={() => setTab('karten')}
        >
          Karteikarten
        </button>
        <button
          className={activeTab === 'quiz' ? 'active' : ''}
          onClick={() => setTab('quiz')}
        >
          Quiz
        </button>
        <button
          className={activeTab === 'probe' ? 'active' : ''}
          onClick={() => setTab('probe')}
        >
          Probeprüfung
        </button>
        {hasKeywords && (
          <button
            className={activeTab === 'schnell' ? 'active' : ''}
            onClick={() => setTab('schnell')}
          >
            Schnelldurchlauf
          </button>
        )}
      </nav>

      {activeTab === 'karten' && (
        <Flashcards
          moduleId={module.id}
          trackId={track.id}
          cards={track.flashcards.filter((c) => !hidden.has(c.id))}
          sessions={track.sessions}
          progress={progress}
          onProgress={updateProgress}
          userId={user?.id}
          selectorNode={
            <CardSelector
              cards={track.flashcards}
              sessions={track.sessions}
              hidden={hidden}
              onToggle={toggleHidden}
              onBulk={bulkHidden}
            />
          }
        />
      )}
      {activeTab === 'quiz' && (
        <Quiz
          questions={track.quiz.filter((q) => !hidden.has(q.id))}
          sessions={track.sessions}
        />
      )}
      {activeTab === 'probe' && (
        <Exam moduleId={module.id} track={track} hidden={hidden} userId={user?.id} />
      )}
      {activeTab === 'schnell' && (
        <SchnellDurchlauf
          moduleId={module.id}
          trackId={track.id}
          cards={track.flashcards.filter((c) => !hidden.has(c.id))}
          sessions={track.sessions}
          userId={user?.id}
        />
      )}
    </div>
  );
}
