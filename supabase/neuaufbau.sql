-- ============================================================
--  Lernapp – Neuaufbau (Herbst 2026): neue Tabellen
--
--  Einmal im Supabase SQL-Editor ausführen:
--  Dashboard -> SQL Editor -> New query -> alles einfügen -> Run.
--  Das Skript kann gefahrlos mehrfach laufen (legt nur an, was fehlt).
--
--  Die bisherigen Tabellen (progress, exam_runs, custom_cards,
--  attempt_history) bleiben unverändert bestehen.
--
--  Prinzip wie bisher: Jede Zeile gehört genau einer angemeldeten
--  Person (user_id). Row Level Security erlaubt nur Zugriff auf die
--  eigenen Zeilen. Feste IDs (uuid) – eine Terminverschiebung ändert
--  nur das Datum, nie die ID.
--  Plan & Erklärung: Projektdokument claude/datenmodell_supabase.md
-- ============================================================

-- ---------- 1. Studium & Struktur ----------------------------

create table if not exists public.studiengaenge (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,                 -- „Bachelor Combined Studies“
  abschluss  text not null default 'BA',    -- BA | M.Ed.
  option     text,                          -- „Lehramt Haupt- und Realschule“
  cp_ziel    int  not null default 180,
  beginn     date,
  aktiv      boolean not null default true,
  erstellt   timestamptz not null default now()
);

create table if not exists public.semester (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  studiengang_id   uuid not null references public.studiengaenge(id) on delete cascade,
  fachsemester     int  not null,           -- 1, 2, 3 …
  bezeichnung      text not null,           -- „WiSe 26/27“
  beginn           date,
  ende             date,
  vorlesung_beginn date,
  vorlesung_ende   date,
  unique (studiengang_id, fachsemester)
);

create table if not exists public.module (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  studiengang_id   uuid not null references public.studiengaenge(id) on delete cascade,
  kuerzel          text not null,           -- mab005
  name             text not null,           -- offizielle Bezeichnung
  cp               int  not null default 0,
  bereich          text not null,           -- Mathe | Politik | Profil | Praktika | BA-Arbeit
  lehramt_hrs      boolean not null default false,
  plan_semester_id uuid references public.semester(id) on delete set null,
  status           text not null default 'geplant',  -- geplant | laeuft | verschoben | bestanden | archiv
  hinweis          text,
  reihenfolge      int  not null default 0,
  unique (studiengang_id, kuerzel)
);

create table if not exists public.teilmodule (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modul_id   uuid not null references public.module(id) on delete cascade,
  kuerzel    text not null,                 -- ewb002.1 | ewb002 (Tutorium)
  name       text not null,
  art        text not null default 'Vorlesung', -- Vorlesung | Seminar | Übung | Tutorium | eÜbung
  freiwillig boolean not null default false,
  unique (modul_id, kuerzel, art)
);

-- ---------- 2. Kalender --------------------------------------

create table if not exists public.veranstaltungen (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  teilmodul_id  uuid not null references public.teilmodule(id) on delete cascade,
  titel         text not null,
  kurz          text,
  gruppe        text,
  wochentag     int,                        -- 1 = Mo … 7 = So
  von           time,
  bis           time,
  raum          text,
  rhythmus      text not null default 'woechentlich', -- woechentlich | 14-taeglich | einzeltermine
  akad_viertel  boolean not null default true,
  studip_id     text,                       -- Kennung aus Stud.IP für den Wochencheck
  erstellt      timestamptz not null default now()
);

create table if not exists public.sitzungen (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  veranstaltung_id     uuid not null references public.veranstaltungen(id) on delete cascade,
  nr                   int,                 -- laufende Nummer innerhalb der Veranstaltung
  datum                date not null,
  von                  time,
  bis                  time,
  raum                 text,
  thema                text,
  status               text not null default 'findet_statt', -- findet_statt | ausgefallen | entfaellt
  entfall_grund        text,                -- Feiertag | Exkursionstage | vorlesungsfreie Zeit …
  anwesenheit          text not null default 'offen',        -- ja | nein | offen
  nachgearbeitet       boolean not null default false,
  nachgearbeitet_am    timestamptz,
  quelle               text not null default 'studip',       -- studip | nadine
  von_nadine_geaendert boolean not null default false,
  geaendert            timestamptz not null default now()
);
create index if not exists sitzungen_datum on public.sitzungen (user_id, datum);

create table if not exists public.eintraege (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  art           text not null,              -- hausaufgabe | todo | frist | termin | privat
  titel         text not null,
  modul_id      uuid references public.module(id) on delete set null,
  teilmodul_id  uuid references public.teilmodule(id) on delete set null,
  sitzung_id    uuid references public.sitzungen(id) on delete set null,
  datum         date not null,
  zeit          time,
  ende          time,
  ganztaegig    boolean not null default false,
  bis_datum     date,
  wiederholung  jsonb,                      -- {rhythmus, tage[], bis, ausnahmen[]}
  notiz         text,
  erledigt      boolean not null default false,
  erledigt_am   timestamptz,
  erstellt      timestamptz not null default now()
);
create index if not exists eintraege_datum on public.eintraege (user_id, datum);

create table if not exists public.kalender_extra (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  art      text not null,                   -- feiertag | ferien | uni | praktikum
  titel    text not null,
  von      date not null,
  bis      date not null,
  quelle   text
);

-- ---------- 3. Prüfungen -------------------------------------

create table if not exists public.pruefungen (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modul_id                    uuid not null references public.module(id) on delete cascade,
  form                        text not null,   -- Klausur | Hausarbeit | Portfolio …
  semester_id                 uuid references public.semester(id) on delete set null,
  verschoben_nach_semester_id uuid references public.semester(id) on delete set null,
  verschoben_grund            text,
  unique (modul_id)
);

create table if not exists public.pruefungstermine (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pruefung_id    uuid not null references public.pruefungen(id) on delete cascade,
  art            text not null default 'Ersttermin', -- Ersttermin | Zweittermin
  datum          date,
  zeit           text,                      -- „8–10 Uhr“
  anmeldung_ab   date,
  anmeldung_bis  date,
  abmeldung_bis  date,
  quelle         text not null default 'studip',      -- studip | qispos | nadine
  stand          timestamptz not null default now()
);

create table if not exists public.versuche (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pruefung_id  uuid not null references public.pruefungen(id) on delete cascade,
  nr           int  not null check (nr between 1 and 3),
  note         numeric(2,1) check (note in (1.0,1.3,1.7,2.0,2.3,2.7,3.0,3.3,3.7,4.0,5.0)),
  unbenotet    boolean not null default false,
  datum        date,
  termin_id    uuid references public.pruefungstermine(id) on delete set null,
  unique (pruefung_id, nr)
);

create table if not exists public.voraussetzungen (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pruefung_id  uuid not null references public.pruefungen(id) on delete cascade,
  text         text not null,
  erledigt     boolean not null default false,
  reihenfolge  int not null default 0
);

-- ---------- 4. Lernen ----------------------------------------
-- Die Lerninhalte selbst liegen als Dateien im Repo (content/).

create table if not exists public.lernstand (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sitzung_id  uuid not null references public.sitzungen(id) on delete cascade,
  gelesen     boolean not null default false,
  gelernt     boolean not null default false,
  gelernt_am  timestamptz,
  primary key (user_id, sitzung_id)
);

create table if not exists public.karten (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modul_id      uuid references public.module(id) on delete set null,
  teilmodul_id  uuid references public.teilmodule(id) on delete set null,
  sitzung_id    uuid references public.sitzungen(id) on delete set null,
  format        text not null,              -- frage | mc | offen | luecke | zuordnung
  inhalt        jsonb not null,             -- vorne, hinten, optionen, richtig, kategorien, elemente
  bild_pfad     text,                       -- Storage: kartenbilder/<user_id>/<id>.jpg
  geloescht     boolean not null default false,
  erstellt      timestamptz not null default now(),
  geaendert     timestamptz not null default now()
);

-- Gemeinsamer Wiederholungsstand für eigene Karten, Lernfragen und Begriffe.
-- frage_ref: 'karte:<uuid>' | 'lf:<datei>#f01' | 'begriff:<modul>:<begriff>'
create table if not exists public.wiederholung (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  frage_ref  text not null,
  stand      text not null default 'neu',   -- neu | unsicher | sicher
  stufe      int  not null default 0 check (stufe between 0 and 6),
  faellig    date,
  geaendert  timestamptz not null default now(),
  primary key (user_id, frage_ref)
);

create table if not exists public.antworten (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  frage_ref   text not null,
  modul_id    uuid references public.module(id) on delete set null,
  teilmodul_id uuid references public.teilmodule(id) on delete set null,
  ergebnis    text not null check (ergebnis in ('richtig','teilweise','falsch')),
  modus       text,                         -- anfaenger | profi
  ki_prozent  int,
  zeitpunkt   timestamptz not null default now()
);
create index if not exists antworten_frage on public.antworten (user_id, frage_ref);

create table if not exists public.lernzeit (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum         date not null,
  teilmodul_id  uuid not null references public.teilmodule(id) on delete cascade,
  art           text not null,              -- karten | lerntext | lernfragen | probepruefung
  sekunden      int  not null default 0,
  primary key (user_id, datum, teilmodul_id, art)
);

create table if not exists public.probepruefungen (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modul_id          uuid not null references public.module(id) on delete cascade,
  ergebnis_prozent  int check (ergebnis_prozent between 0 and 100),
  dauer_sek         int not null default 0,
  aufgaben          int not null default 0,
  details           jsonb,
  zeitpunkt         timestamptz not null default now()
);

-- ---------- 5. Einstellungen ---------------------------------

create table if not exists public.einstellungen (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  bafoeg_grenze int not null default 90,
  uebungsmodus text not null default 'anfaenger',
  lernzeit_grenze_sek int not null default 60,
  wiederholung_tage int[] not null default '{1,3,7,14,30,60}',
  benachrichtigungen jsonb not null default '{}'::jsonb,
  geaendert    timestamptz not null default now()
);

-- ---------- Row Level Security für alle neuen Tabellen ------

do $$
declare t text;
begin
  foreach t in array array[
    'studiengaenge','semester','module','teilmodule','veranstaltungen','sitzungen',
    'eintraege','kalender_extra','pruefungen','pruefungstermine','versuche','voraussetzungen',
    'lernstand','karten','wiederholung','antworten','lernzeit','probepruefungen','einstellungen'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    begin
      execute format(
        'create policy "eigene Zeilen" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Speicher für Kartenbilder (privat) --------------

insert into storage.buckets (id, name, public)
values ('kartenbilder', 'kartenbilder', false)
on conflict (id) do nothing;

do $$
begin
  begin
    create policy "kartenbilder eigene Dateien" on storage.objects for all
      using (bucket_id = 'kartenbilder' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'kartenbilder' and (storage.foldername(name))[1] = auth.uid()::text);
  exception when duplicate_object then null;
  end;
end $$;
