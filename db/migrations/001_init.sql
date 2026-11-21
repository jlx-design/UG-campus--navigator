-- UG Campus Navigator — initial schema
-- Target: Neon Postgres 17 with Neon Auth (Managed Better Auth) + Neon Data API.
-- auth.uid() returns the JWT `sub` as uuid (matches neon_auth."user".id).
-- Roles: `anonymous` (no JWT), `authenticated` (signed-in), owner (migrations / server functions).

create extension if not exists pg_trgm;

-- ───────────────────────── Roles & helpers ─────────────────────────
create table if not exists public.app_roles (
  user_id    uuid primary key references neon_auth."user"(id) on delete cascade,
  role       text not null check (role in ('editor','admin')),
  granted_by text not null,                      -- who granted it (trusted admin process)
  granted_at timestamptz not null default now()
);

-- Role of the caller, read with definer rights so RLS on app_roles can stay strict.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.app_roles where user_id = auth.uid()), 'user')
$$;

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() in ('editor','admin')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() = 'admin'
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── Audit log ─────────────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  table_name text not null,
  row_id     text,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  at         timestamptz not null default now()
);

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  begin uid := auth.uid(); exception when others then uid := null; end;
  insert into public.audit_log(actor_id, table_name, row_id, action, old_data, new_data)
  values (uid, tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'user_id'),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ───────────────────────── Profiles ─────────────────────────
create table if not exists public.profiles (
  user_id      uuid primary key default auth.uid() references neon_auth."user"(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  affiliation  text check (affiliation in ('student','staff','visitor','other')),
  theme        text not null default 'system' check (theme in ('light','dark','system')),
  notify_announcements boolean not null default true,
  notify_categories    text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ───────────────────────── Campus locations ─────────────────────────
create table if not exists public.location_categories (
  slug       text primary key,
  label      text not null,
  icon       text not null,          -- icon key used by the frontend
  sort_order int  not null default 100
);

create or replace function public.imm_join(text[]) returns text
language sql immutable parallel safe as $$ select array_to_string($1, ' ') $$;

create table if not exists public.locations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 2 and 160),
  category         text not null references public.location_categories(slug),
  description      text,
  lat              double precision not null check (lat between 5.60 and 5.70),
  lng              double precision not null check (lng between -0.23 and -0.15),
  location_context text,
  alt_names        text[] not null default '{}',
  accessibility    text,                                -- only verified notes
  source_label     text not null,                       -- e.g. 'OpenStreetMap'
  source_url       text,
  source_ref       text unique,                         -- e.g. 'osm:way/123' for idempotent imports
  verification     text not null default 'unverified'
                   check (verification in ('verified','unverified','osm_imported')),
  last_verified_at timestamptz,
  is_published     boolean not null default true,
  search_doc       tsvector generated always as (
                     setweight(to_tsvector('simple', coalesce(name,'')), 'A') ||
                     setweight(to_tsvector('simple', public.imm_join(alt_names)), 'A') ||
                     setweight(to_tsvector('simple', coalesce(category,'')), 'B') ||
                     setweight(to_tsvector('english', coalesce(description,'') || ' ' || coalesce(location_context,'')), 'C')
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists locations_search_idx on public.locations using gin (search_doc);
create index if not exists locations_name_trgm on public.locations using gin (name gin_trgm_ops);
create index if not exists locations_category_idx on public.locations (category);
create trigger locations_touch before update on public.locations for each row execute function public.touch_updated_at();
create trigger locations_audit after insert or update or delete on public.locations for each row execute function public.audit_trigger();

-- Ranked search across names, alternative names, categories, descriptions.
create or replace function public.search_locations(q text, max_results int default 20)
returns setof public.locations
language sql stable as $$
  select l.* from public.locations l
  where l.is_published
    and char_length(trim(q)) >= 2
    and ( l.search_doc @@ websearch_to_tsquery('simple', q)
       or l.name ilike '%' || q || '%'
       or exists (select 1 from unnest(l.alt_names) a where a ilike '%' || q || '%')
       or similarity(l.name, q) > 0.25 )
  order by (l.name ilike q) desc,
           (l.name ilike q || '%') desc,
           ts_rank(l.search_doc, websearch_to_tsquery('simple', q)) desc,
           similarity(l.name, q) desc,
           (l.verification = 'verified') desc
  limit least(greatest(max_results, 1), 50)
$$;

-- ───────────────────────── Saved places ─────────────────────────
create table if not exists public.saved_places (
  user_id     uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  label       text check (char_length(label) <= 60),
  created_at  timestamptz not null default now(),
  primary key (user_id, location_id)
);

-- ───────────────────────── Announcements ─────────────────────────
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 4 and 200),
  summary       text not null check (char_length(summary) <= 600),
  body          text,
  category      text not null check (category in
                  ('official','registration','orientation','accommodation','academic_calendar',
                   'student_services','disruption','industrial_action','deadline','other')),
  source_org    text not null,
  source_url    text,
  location_id   uuid references public.locations(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','pending','published','unpublished')),
  published_at  timestamptz,            -- when the SOURCE published it
  expires_at    timestamptz,
  created_by    uuid default auth.uid(),
  approved_by   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists announcements_pub_idx on public.announcements (status, published_at desc);
create trigger announcements_touch before update on public.announcements for each row execute function public.touch_updated_at();
create trigger announcements_audit after insert or update or delete on public.announcements for each row execute function public.audit_trigger();

-- Only admins may move an announcement into 'published'; editors can draft / submit.
create or replace function public.guard_announcement_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    if current_user in ('authenticated','anonymous') and not public.is_admin() then
      raise exception 'Only administrators can publish announcements';
    end if;
    new.approved_by := auth.uid();
    if new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end $$;
create trigger announcements_guard before insert or update on public.announcements
  for each row execute function public.guard_announcement_publish();

-- Per-user read state for the notification centre (notifications = published announcements).
create table if not exists public.announcement_reads (
  user_id         uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

-- ───────────────────────── Fresher hub ─────────────────────────
create table if not exists public.fresher_resources (
  id                uuid primary key default gen_random_uuid(),
  section           text not null check (section in
                      ('getting_started','registration','orientation','academic','facilities',
                       'student_services','accommodation','navigation','faq','terminology','official_links')),
  title             text not null,
  body              text not null,
  is_official       boolean not null default false,   -- true only when backed by a UG source
  source_label      text,
  source_url        text,
  source_updated_at date,
  location_id       uuid references public.locations(id) on delete set null,
  contact_phone     text,
  contact_email     text,
  opening_hours     text,
  sort_order        int not null default 100,
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (not is_official or source_url is not null)
);
create trigger fresher_touch before update on public.fresher_resources for each row execute function public.touch_updated_at();
create trigger fresher_audit after insert or update or delete on public.fresher_resources for each row execute function public.audit_trigger();

create table if not exists public.checklist_items (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  explanation         text,
  kind                text not null check (kind in ('official','suggestion')),
  source_label        text,
  source_url          text,
  deadline            date,
  related_location_id uuid references public.locations(id) on delete set null,
  sort_order          int not null default 100,
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (kind <> 'official' or source_url is not null),
  check (deadline is null or source_url is not null)
);
create trigger checklist_touch before update on public.checklist_items for each row execute function public.touch_updated_at();
create trigger checklist_audit after insert or update or delete on public.checklist_items for each row execute function public.audit_trigger();

create table if not exists public.checklist_progress (
  user_id      uuid not null default auth.uid() references neon_auth."user"(id) on delete cascade,
  item_id      uuid not null references public.checklist_items(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ───────────────────────── Reports ─────────────────────────
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  kind        text not null check (kind in
                ('wrong_location','wrong_info','missing_place','route_issue','accessibility','broken_link','outdated_announcement','other')),
  location_id uuid references public.locations(id) on delete set null,
  announcement_id uuid references public.announcements(id) on delete set null,
  message     text not null check (char_length(message) between 5 and 2000),
  suggested_lat double precision,
  suggested_lng double precision,
  status      text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  reviewer_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

-- AI usage counter for rate limiting (written only by the server function).
create table if not exists public.ai_usage (
  subject    text not null,          -- user id or hashed IP
  window_start timestamptz not null,
  count      int not null default 0,
  primary key (subject, window_start)
);

-- ───────────────────────── Row-Level Security ─────────────────────────
alter table public.app_roles           enable row level security;
alter table public.audit_log           enable row level security;
alter table public.profiles            enable row level security;
alter table public.location_categories enable row level security;
alter table public.locations           enable row level security;
alter table public.saved_places        enable row level security;
alter table public.announcements       enable row level security;
alter table public.announcement_reads  enable row level security;
alter table public.fresher_resources   enable row level security;
alter table public.checklist_items     enable row level security;
alter table public.checklist_progress  enable row level security;
alter table public.reports             enable row level security;
alter table public.ai_usage            enable row level security;

-- app_roles: users can see their own role; admins see all. No client writes (granted via trusted SQL only).
create policy roles_self_read on public.app_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy audit_editor_read on public.audit_log for select to authenticated using (public.is_editor());

create policy profiles_own on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy categories_public on public.location_categories for select to anonymous, authenticated using (true);
create policy categories_admin  on public.location_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy locations_public on public.locations for select to anonymous, authenticated
  using (is_published or public.is_editor());
create policy locations_editor_ins on public.locations for insert to authenticated with check (public.is_editor());
create policy locations_editor_upd on public.locations for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy locations_admin_del on public.locations for delete to authenticated using (public.is_admin());

create policy saved_own on public.saved_places for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ann_public on public.announcements for select to anonymous, authenticated
  using ((status = 'published' and (expires_at is null or expires_at > now())) or public.is_editor());
create policy ann_editor_ins on public.announcements for insert to authenticated with check (public.is_editor());
create policy ann_editor_upd on public.announcements for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy ann_admin_del on public.announcements for delete to authenticated using (public.is_admin());

create policy reads_own on public.announcement_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy fresher_public on public.fresher_resources for select to anonymous, authenticated
  using (is_published or public.is_editor());
create policy fresher_editor on public.fresher_resources for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy checklist_public on public.checklist_items for select to anonymous, authenticated
  using (is_published or public.is_editor());
create policy checklist_editor on public.checklist_items for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy progress_own on public.checklist_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reports_insert_own on public.reports for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');
create policy reports_read on public.reports for select to authenticated
  using (user_id = auth.uid() or public.is_editor());
create policy reports_editor_upd on public.reports for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
-- ai_usage: no policies → no client access at all.

-- ───────────────────────── Grants (Data API) ─────────────────────────
grant usage on schema public to anonymous, authenticated;
grant select on public.location_categories, public.locations, public.announcements,
                public.fresher_resources, public.checklist_items to anonymous;
grant select on all tables in schema public to authenticated;
revoke select on public.ai_usage from authenticated;
grant insert, update, delete on public.profiles, public.saved_places, public.announcement_reads,
                public.checklist_progress to authenticated;
grant insert, update, delete on public.locations, public.announcements, public.fresher_resources,
                public.checklist_items, public.location_categories to authenticated;   -- RLS restricts to editors/admins
grant insert, update on public.reports to authenticated;
grant execute on function public.search_locations(text, int) to anonymous, authenticated;
grant execute on function public.app_role(), public.is_editor(), public.is_admin() to anonymous, authenticated;

-- Column guard: ordinary users cannot change report status via insert (enforced by policy) nor
-- reviewer fields; editors update via policy above.

-- ───────────────────────── Reference data (not campus facts) ─────────────────────────
insert into public.location_categories(slug, label, icon, sort_order) values
  ('academic','Academic building','school',10),
  ('lecture_hall','Lecture hall','lecture',20),
  ('library','Library','library',30),
  ('administration','Administration','admin',40),
  ('hall','Hall of residence','hall',50),
  ('student_services','Student services','services',60),
  ('health','Health','health',70),
  ('sports','Sports','sports',80),
  ('food','Food & retail','food',90),
  ('worship','Place of worship','worship',95),
  ('bank','Bank / ATM','bank',96),
  ('transport','Transport & gates','transport',100),
  ('other','Other','pin',200)
on conflict (slug) do nothing;
