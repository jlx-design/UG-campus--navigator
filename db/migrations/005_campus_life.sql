-- 005: rooms, exams, events, opening hours, live trip sharing, push reminders, privacy-safe insights, business listings.
-- Applied 2026-11-21. Every table has RLS. Official info is editor-managed; personal data is own-row only.

-- ── Business listings live in the same directory, clearly flagged (never mixed up with university facilities).
insert into public.location_categories (slug, label, icon, sort_order) values ('business', 'Businesses', 'shop', 120) on conflict (slug) do nothing;
alter table public.locations
  add column if not exists is_listing   boolean not null default false,
  add column if not exists is_sponsored boolean not null default false,
  add column if not exists listing_phone   text check (listing_phone ~ '^\+?[0-9 ()-]{6,20}$'),
  add column if not exists listing_website text check (listing_website ~ '^https://');

-- ── Rooms inside buildings ("JQB 23", "NNB 1")
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  code         text not null check (char_length(code) between 1 and 40),
  name         text check (char_length(name) <= 120),
  floor        text check (char_length(floor) <= 30),
  capacity     int check (capacity between 1 and 10000),
  directions   text check (char_length(directions) <= 500),
  source_label text not null check (char_length(source_label) between 2 and 120),
  source_url   text,
  verification text not null default 'unverified' check (verification in ('verified','unverified')),
  is_published boolean not null default true,
  updated_at   timestamptz not null default now(),
  unique (location_id, code)
);
create index if not exists rooms_code_trgm on public.rooms using gin (code gin_trgm_ops);
create trigger rooms_touch before update on public.rooms for each row execute function public.touch_updated_at();
create trigger rooms_audit after insert or update or delete on public.rooms for each row execute function public.audit_trigger();

create or replace function public.search_rooms(q text, max_results int default 8)
returns table (id uuid, code text, name text, floor text, directions text, verification text, location_id uuid, building text)
language sql stable as $$
  select r.id, r.code, r.name, r.floor, r.directions, r.verification, r.location_id, l.name
  from public.rooms r join public.locations l on l.id = r.location_id
  where r.is_published and l.is_published and char_length(trim(q)) >= 2
    and (r.code ilike '%' || q || '%' or r.name ilike '%' || q || '%'
         or (l.name || ' ' || r.code) ilike '%' || q || '%'
         or exists (select 1 from unnest(l.alt_names) a where (a || ' ' || r.code) ilike '%' || q || '%')
         or similarity(r.code, q) > 0.3)
  order by (r.code ilike q) desc, similarity(r.code, q) desc, r.code
  limit least(greatest(max_results, 1), 30)
$$;

-- ── Opening hours (any place), with a source
create table if not exists public.location_hours (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- 1 = Monday
  opens       time not null,
  closes      time not null,
  note        text check (char_length(note) <= 120),
  source_label text not null check (char_length(source_label) between 2 and 120),
  source_url  text,
  checked_at  date not null default current_date
);
create index if not exists location_hours_loc on public.location_hours(location_id, weekday);
create trigger hours_audit after insert or update or delete on public.location_hours for each row execute function public.audit_trigger();

-- ── Campus events (editor-published)
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 160),
  description  text check (char_length(description) <= 4000),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location_id  uuid references public.locations(id) on delete set null,
  venue_text   text check (char_length(venue_text) <= 160),
  organiser    text check (char_length(organiser) <= 160),
  category     text not null default 'general' check (category in ('general','academic','sports','culture','religious','career','src','club','health')),
  source_label text not null check (char_length(source_label) between 2 and 120),
  source_url   text,
  status       text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists events_start on public.events(starts_at) where status <> 'draft';
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger events_audit after insert or update or delete on public.events for each row execute function public.audit_trigger();

-- ── Personal exam timetable
create table if not exists public.exams (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  course_code  text not null check (char_length(course_code) between 1 and 20),
  course_title text check (char_length(course_title) <= 120),
  starts_at    timestamptz not null,
  duration_min int not null default 120 check (duration_min between 10 and 600),
  location_id  uuid references public.locations(id) on delete set null,
  venue_text   text check (char_length(venue_text) <= 160),
  seat_note    text check (char_length(seat_note) <= 120),
  created_at   timestamptz not null default now()
);
create index if not exists exams_user on public.exams(user_id, starts_at);

-- ── Web Push subscriptions + reminder settings (own rows only)
create table if not exists public.push_subscriptions (
  endpoint    text primary key check (endpoint ~ '^https://'),
  user_id     uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  p256dh      text not null, auth text not null,
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
alter table public.profiles
  add column if not exists remind_classes boolean not null default true,
  add column if not exists remind_exams   boolean not null default true,
  add column if not exists remind_lead_min smallint not null default 15 check (remind_lead_min between 5 and 120),
  add column if not exists notify_push_announcements boolean not null default true;
-- Delivery log so the same reminder is never sent twice.
create table if not exists public.push_log (
  user_id uuid not null, ref text not null, sent_at timestamptz not null default now(), primary key (user_id, ref)
);

-- ── "Walk with me": time-limited live location shared by link
create table if not exists public.live_shares (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id     uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  sharer_name text check (char_length(sharer_name) <= 60),
  dest_location_id uuid references public.locations(id) on delete set null,
  lat double precision, lng double precision, accuracy real, heading real,
  eta_s       int, status text not null default 'active' check (status in ('active','arrived','stopped')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '2 hours'
);
create or replace function public.get_live_share(p_token text)
returns table (sharer_name text, dest_name text, dest_lat double precision, dest_lng double precision, lat double precision, lng double precision,
               accuracy real, heading real, eta_s int, status text, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.sharer_name, l.name, l.lat, l.lng, s.lat, s.lng, s.accuracy, s.heading, s.eta_s,
         case when s.expires_at < now() and s.status = 'active' then 'expired' else s.status end, s.updated_at, s.expires_at
  from public.live_shares s left join public.locations l on l.id = s.dest_location_id
  where s.token = p_token and char_length(p_token) = 32
$$;

-- ── Privacy-safe insights: daily counters only (no user ids, no free text)
create table if not exists public.usage_daily (
  day date not null default current_date, event text not null, key text not null default '', n int not null default 0,
  primary key (day, event, key)
);
create or replace function public.bump(p_event text, p_key text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('app_open','search','place_view','route','nav_start','nav_arrive','ai_question','install') then return; end if;
  -- keys may only be ids of real places (never what someone typed)
  if p_key <> '' and not exists (select 1 from public.locations where id::text = p_key) then p_key := ''; end if;
  insert into public.usage_daily(day, event, key, n) values (current_date, p_event, p_key, 1)
  on conflict (day, event, key) do update set n = usage_daily.n + 1;
end $$;
create or replace function public.admin_insights(p_days int default 30)
returns json language sql stable security definer set search_path = public as $$
  select case when public.is_editor() then json_build_object(
    'daily', (select coalesce(json_agg(d order by d.day), '[]') from (select day, event, sum(n)::int n from public.usage_daily where day > current_date - p_days group by day, event) d),
    'top_destinations', (select coalesce(json_agg(t), '[]') from (select l.name, sum(u.n)::int n from public.usage_daily u join public.locations l on l.id::text = u.key where u.event = 'route' and u.day > current_date - p_days group by l.name order by 2 desc limit 10) t),
    'top_viewed', (select coalesce(json_agg(t), '[]') from (select l.name, sum(u.n)::int n from public.usage_daily u join public.locations l on l.id::text = u.key where u.event = 'place_view' and u.day > current_date - p_days group by l.name order by 2 desc limit 10) t)
  ) end
$$;

-- ── RLS
alter table public.rooms enable row level security;
alter table public.location_hours enable row level security;
alter table public.events enable row level security;
alter table public.exams enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;
alter table public.live_shares enable row level security;
alter table public.usage_daily enable row level security;

create policy rooms_read on public.rooms for select to anonymous, authenticated using (is_published or public.is_editor());
create policy rooms_edit on public.rooms for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy hours_read on public.location_hours for select to anonymous, authenticated using (true);
create policy hours_edit on public.location_hours for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy events_read on public.events for select to anonymous, authenticated using (status <> 'draft' or public.is_editor());
create policy events_edit on public.events for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy exams_own on public.exams for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy live_own on public.live_shares for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- push_log and usage_daily: no client policies (server / security-definer functions only).

grant select on public.rooms, public.location_hours, public.events to anonymous, authenticated;
grant insert, update, delete on public.rooms, public.location_hours, public.events to authenticated;
grant select, insert, update, delete on public.exams, public.push_subscriptions, public.live_shares to authenticated;
grant execute on function public.search_rooms(text, int), public.get_live_share(text), public.bump(text, text) to anonymous, authenticated;
grant execute on function public.admin_insights(int) to authenticated;
