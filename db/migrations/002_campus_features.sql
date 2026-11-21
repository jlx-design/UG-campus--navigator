-- 002: admin bootstrap, theme prefs, courses & timetable, emergency contacts, shuttle tracking.
-- Additive only: no existing column or row is dropped.

-- ───── Admin bootstrap: an invited email becomes admin the first time that user signs in ─────
create table if not exists public.admin_invites (
  email text primary key check (email = lower(email)),
  role  text not null default 'admin' check (role in ('editor','admin','driver')),
  note  text,
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;            -- no policies: invisible to clients

alter table public.app_roles drop constraint if exists app_roles_role_check;
alter table public.app_roles add constraint app_roles_role_check check (role in ('editor','admin','driver'));

-- Called by the app after sign-in. Grants a role only if the caller's verified-by-auth email was invited.
create or replace function public.claim_invited_role() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; r text;
begin
  if uid is null then return null; end if;
  select lower(email) into em from neon_auth."user" where id = uid;
  select role into r from public.admin_invites where email = em;
  if r is null then return public.app_role(); end if;
  insert into public.app_roles(user_id, role, granted_by) values (uid, r, 'invite:' || em)
  on conflict (user_id) do update set role = excluded.role
    where app_roles.role <> 'admin';                                   -- never downgrade an admin
  return public.app_role();
end $$;
revoke all on function public.claim_invited_role() from public;
grant execute on function public.claim_invited_role() to authenticated;

insert into public.admin_invites(email, role, note) values ('jnyoape@gmail.com', 'admin', 'Project owner')
on conflict (email) do nothing;

-- ───── Personal appearance preferences (synced across devices) ─────
alter table public.profiles add column if not exists prefs jsonb not null default '{}'::jsonb;

-- ───── Courses & lecture timetable (private to each user) ─────
create table if not exists public.courses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  code       text not null check (char_length(code) between 2 and 20),
  title      text check (char_length(title) <= 160),
  lecturer   text check (char_length(lecturer) <= 120),
  credits    smallint check (credits between 0 and 30),
  color      text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  semester   text check (char_length(semester) <= 40),
  notes      text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();

create table if not exists public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  kind        text not null default 'lecture' check (kind in ('lecture','tutorial','lab','seminar','exam','other')),
  weekday     smallint not null check (weekday between 1 and 7),           -- 1 = Monday
  starts_at   time not null,
  ends_at     time not null check (ends_at > starts_at),
  location_id uuid references public.locations(id) on delete set null,    -- venue from the campus directory
  venue_text  text check (char_length(venue_text) <= 120),                 -- or free text if not in the directory
  created_at  timestamptz not null default now()
);
create index if not exists class_sessions_user_day on public.class_sessions (user_id, weekday, starts_at);

-- ───── Emergency contacts (public, curated, every entry sourced) ─────
create table if not exists public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null check (category in ('national','medical','security','counselling','campus','other')),
  phone        text check (phone ~ '^[0-9 +()-]{3,25}$'),
  is_emergency boolean not null default true,       -- false = information line, shown separately
  description  text,
  location_id  uuid references public.locations(id) on delete set null,
  source_label text not null,
  source_url   text not null,
  checked_at   date not null default current_date,
  sort_order   int not null default 100,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger emergency_touch before update on public.emergency_contacts for each row execute function public.touch_updated_at();
create trigger emergency_audit after insert or update or delete on public.emergency_contacts for each row execute function public.audit_trigger();

insert into public.emergency_contacts(name, category, phone, is_emergency, description, source_label, source_url, checked_at, sort_order)
select * from (values
  ('National emergency line', 'national', '112', true, 'Single emergency number for police, fire and ambulance on all mobile networks.', 'Government of Canada – Ghana travel advice (emergency services)', 'https://travel.gc.ca/assistance/embassies-consulates/ghana', date '2026-11-21', 10),
  ('Police', 'national', '191', true, 'Ghana Police Service emergency line. 18555 is also listed for police.', 'Government of Canada – Ghana travel advice (emergency services)', 'https://travel.gc.ca/assistance/embassies-consulates/ghana', date '2026-11-21', 20),
  ('Ambulance', 'national', '193', true, 'National Ambulance Service.', 'Government of Canada – Ghana travel advice (emergency services)', 'https://travel.gc.ca/assistance/embassies-consulates/ghana', date '2026-11-21', 30),
  ('Fire service', 'national', '192', true, 'Ghana National Fire Service.', 'Government of Canada – Ghana travel advice (emergency services)', 'https://travel.gc.ca/assistance/embassies-consulates/ghana', date '2026-11-21', 40),
  ('University Hospital, Legon', 'medical', null, true, 'Operates 24/7 OPD and emergency care. Located behind the Legon Police Station. (No verified phone line yet.)', 'UG Health Services – FAQs', 'https://www.ug.edu.gh/healthservices/FAQs', date '2026-11-21', 50),
  ('UG Medical Centre (UGMC) – contact centre', 'medical', '+233 302 550843', false, 'Information, appointments and pre-registration. Not listed as an emergency line.', 'UGMC – Contact us', 'https://ugmedicalcentre.org/contactus', date '2026-11-21', 60)
) v(name, category, phone, is_emergency, description, source_label, source_url, checked_at, sort_order)
where not exists (select 1 from public.emergency_contacts);

-- ───── Shuttle tracking (routes/stops entered by admins; positions shared live by authorised drivers) ─────
create table if not exists public.shuttle_routes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#0ea5e9' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description text,
  hours       text,                       -- operating hours, only when verified
  source_label text, source_url text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger shuttle_routes_touch before update on public.shuttle_routes for each row execute function public.touch_updated_at();
create trigger shuttle_routes_audit after insert or update or delete on public.shuttle_routes for each row execute function public.audit_trigger();

create table if not exists public.shuttle_stops (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.shuttle_routes(id) on delete cascade,
  seq         int not null,
  name        text not null,
  lat         double precision not null check (lat between 5.60 and 5.70),
  lng         double precision not null check (lng between -0.23 and -0.15),
  location_id uuid references public.locations(id) on delete set null,
  unique (route_id, seq)
);

create table if not exists public.shuttle_vehicles (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,                 -- e.g. fleet / plate label
  route_id   uuid references public.shuttle_routes(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shuttle_positions (
  vehicle_id  uuid primary key references public.shuttle_vehicles(id) on delete cascade,
  driver_id   uuid not null,
  route_id    uuid references public.shuttle_routes(id) on delete set null,
  lat         double precision not null check (lat between 5.55 and 5.75),
  lng         double precision not null check (lng between -0.30 and -0.08),
  heading     real, speed_mps real, accuracy_m real,
  updated_at  timestamptz not null default now()
);

-- Drivers report through this function only (validated, rate-safe single row per vehicle).
create or replace function public.report_shuttle_position(p_vehicle uuid, p_lat float8, p_lng float8,
  p_heading real default null, p_speed real default null, p_accuracy real default null) returns void
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if public.app_role() not in ('driver','admin') then raise exception 'Only authorised drivers can share shuttle positions'; end if;
  select route_id into r from public.shuttle_vehicles where id = p_vehicle and is_active;
  if not found then raise exception 'Unknown or inactive vehicle'; end if;
  insert into public.shuttle_positions(vehicle_id, driver_id, route_id, lat, lng, heading, speed_mps, accuracy_m, updated_at)
  values (p_vehicle, auth.uid(), r, p_lat, p_lng, p_heading, p_speed, p_accuracy, now())
  on conflict (vehicle_id) do update set driver_id = excluded.driver_id, route_id = excluded.route_id, lat = excluded.lat, lng = excluded.lng,
    heading = excluded.heading, speed_mps = excluded.speed_mps, accuracy_m = excluded.accuracy_m, updated_at = now();
end $$;
create or replace function public.stop_shuttle_sharing(p_vehicle uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() not in ('driver','admin') then raise exception 'Not authorised'; end if;
  delete from public.shuttle_positions where vehicle_id = p_vehicle and (driver_id = auth.uid() or public.is_admin());
end $$;
revoke all on function public.report_shuttle_position(uuid, float8, float8, real, real, real) from public;
revoke all on function public.stop_shuttle_sharing(uuid) from public;
grant execute on function public.report_shuttle_position(uuid, float8, float8, real, real, real), public.stop_shuttle_sharing(uuid) to authenticated;

-- ───── RLS ─────
alter table public.courses            enable row level security;
alter table public.class_sessions     enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.shuttle_routes     enable row level security;
alter table public.shuttle_stops      enable row level security;
alter table public.shuttle_vehicles   enable row level security;
alter table public.shuttle_positions  enable row level security;

create policy courses_own  on public.courses        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_own on public.class_sessions for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()));

create policy emergency_public on public.emergency_contacts for select to anonymous, authenticated using (is_published or public.is_editor());
create policy emergency_editor on public.emergency_contacts for all to authenticated using (public.is_editor()) with check (public.is_editor());

create policy routes_public   on public.shuttle_routes   for select to anonymous, authenticated using (is_active or public.is_editor());
create policy routes_admin    on public.shuttle_routes   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy stops_public    on public.shuttle_stops    for select to anonymous, authenticated using (true);
create policy stops_admin     on public.shuttle_stops    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vehicles_public on public.shuttle_vehicles for select to anonymous, authenticated using (is_active or public.is_admin());
create policy vehicles_admin  on public.shuttle_vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Only fresh positions are visible; stale ones disappear automatically.
create policy positions_public on public.shuttle_positions for select to anonymous, authenticated
  using (updated_at > now() - interval '3 minutes');

grant select on public.emergency_contacts, public.shuttle_routes, public.shuttle_stops, public.shuttle_vehicles, public.shuttle_positions to anonymous;
grant select on public.courses, public.class_sessions, public.emergency_contacts, public.shuttle_routes, public.shuttle_stops,
                public.shuttle_vehicles, public.shuttle_positions to authenticated;
grant insert, update, delete on public.courses, public.class_sessions to authenticated;
grant insert, update, delete on public.emergency_contacts, public.shuttle_routes, public.shuttle_stops, public.shuttle_vehicles to authenticated; -- RLS limits to editors/admins
-- shuttle_positions: no direct writes; only via report_shuttle_position().
