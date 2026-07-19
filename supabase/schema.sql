-- ============================================================
--  Supabase-Schema für die Lern-App
--
--  Einmal im Supabase SQL-Editor ausführen (Dashboard ->
--  SQL Editor -> New query -> einfügen -> Run).
--
--  Kernidee: EINE Tabelle "progress". Jede Zeile gehört genau
--  einer angemeldeten Person (user_id) und speichert den
--  Fortschritt EINER Karte in EINEM Track EINES Moduls.
--  Row Level Security stellt sicher, dass niemand fremde
--  Zeilen lesen oder schreiben kann – deshalb ist der im
--  Frontend liegende anon-Key ungefährlich.
-- ============================================================
create table if not exists public.progress (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  module_id  text        not null,
  track_id   text        not null,
  card_id    text        not null,
  best       int         not null default 0 check (best between 0 and 100),
  attempts   int         not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id, track_id, card_id)
);
alter table public.progress enable row level security;
-- Jede Person darf ausschließlich ihre eigenen Zeilen sehen …
create policy "own rows - select"
  on public.progress for select
  using (auth.uid() = user_id);
-- … einfügen …
create policy "own rows - insert"
  on public.progress for insert
  with check (auth.uid() = user_id);
-- … und aktualisieren.
create policy "own rows - update"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- Optional: Löschen der eigenen Zeilen (für "Fortschritt zurücksetzen").
create policy "own rows - delete"
  on public.progress for delete
  using (auth.uid() = user_id);

-- ============================================================
--  Probeprüfungs-Durchläufe
--
--  Speichert je angemeldeter Person einen Durchlauf der
--  Probeprüfung pro Modul + Bereich (track): Durchschnitt,
--  benötigte Zeit, Aufgabenzahl und Zeitpunkt. Note und
--  laufende Nummer werden im Frontend daraus abgeleitet.
--  Gleiches RLS-Prinzip wie bei progress: nur eigene Zeilen.
--
--  Diesen Block einmal im SQL-Editor ausführen (Run). Beim
--  ersten Mal läuft er sauber durch; ein zweiter Lauf meldet
--  nur "policy already exists" – das ist harmlos.
-- ============================================================
create table if not exists public.exam_runs (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  module_id    text        not null,
  track_id     text        not null,
  run_id       text        not null,
  avg          int         not null check (avg between 0 and 100),
  duration_sec int         not null default 0,
  task_count   int         not null default 0,
  taken_at     timestamptz not null default now(),
  primary key (user_id, module_id, track_id, run_id)
);
alter table public.exam_runs enable row level security;
create policy "own exam_runs - select"
  on public.exam_runs for select
  using (auth.uid() = user_id);
create policy "own exam_runs - insert"
  on public.exam_runs for insert
  with check (auth.uid() = user_id);
create policy "own exam_runs - update"
  on public.exam_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "own exam_runs - delete"
  on public.exam_runs for delete
  using (auth.uid() = user_id);
