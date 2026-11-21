-- 007: optional mark (0-100) per course for campuses that grade by cumulative weighted average (KNUST). Applied 2026-11-21.
alter table public.gpa_records add column if not exists mark numeric(5,2) check (mark between 0 and 100);
