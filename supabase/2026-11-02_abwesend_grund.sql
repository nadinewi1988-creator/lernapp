-- 02.11.2026: Grund, wenn Nadine nicht anwesend war (optional)
alter table public.sitzungen add column if not exists abwesend_grund text;
