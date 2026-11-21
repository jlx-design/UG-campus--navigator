-- 004: student details (no ID / index numbers by design) + GPA records. Applied 2026-11-21.
alter table public.profiles
  add column if not exists programme      text check (char_length(programme) <= 120),
  add column if not exists college        text check (char_length(college) <= 120),
  add column if not exists department     text check (char_length(department) <= 120),
  add column if not exists level          text check (level in ('100','200','300','400','500','600','diploma','masters','mphil','phd','other')),
  add column if not exists hall_location_id uuid references public.locations(id) on delete set null,
  add column if not exists hall_name      text check (char_length(hall_name) <= 120),
  add column if not exists residence      text check (residence in ('resident','non_resident')),
  add column if not exists admission_year smallint check (admission_year between 1948 and 2100),
  add column if not exists graduation_year smallint check (graduation_year between 1948 and 2100),
  add column if not exists emergency_contact_name  text check (char_length(emergency_contact_name) <= 80),
  add column if not exists emergency_contact_phone text check (emergency_contact_phone ~ '^\+?[0-9 ()-]{6,20}$');

create table if not exists public.gpa_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  level        text not null check (level in ('100','200','300','400','500','600','other')),
  semester     smallint not null check (semester between 1 and 3),
  course_code  text not null check (char_length(course_code) between 1 and 20),
  course_title text check (char_length(course_title) <= 120),
  credits      numeric(3,1) not null check (credits > 0 and credits <= 12),
  grade        text not null check (grade in ('A','B+','B','C+','C','D+','D','E','F')),
  created_at   timestamptz not null default now()
);
create index if not exists gpa_records_user on public.gpa_records(user_id, level, semester);
alter table public.gpa_records enable row level security;
create policy gpa_own on public.gpa_records for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.gpa_records to authenticated;
