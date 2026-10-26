-- 26.10.2026: Gibt es Material zur Sitzung? (null = keine Angabe → App entscheidet automatisch)
alter table public.sitzungen add column if not exists material boolean;
