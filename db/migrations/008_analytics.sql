-- 008: detailed operator analytics. Applied 2026-11-21.
-- Devices are identified by a random id the app generates (no IP, no fingerprinting). Signed-in activity
-- is linked to the account so the owner can see active users; no search text or GPS is ever stored.
create table if not exists public.device_daily (
  day        date not null default current_date,
  device     text not null check (device ~ '^[a-f0-9]{16,64}$'),
  platform   text not null default 'other' check (platform in ('ios','android','desktop','other')),
  standalone boolean not null default false,
  user_id    uuid references neon_auth."user"(id) on delete set null,
  events     int not null default 0,
  first_hour smallint,
  primary key (day, device)
);
create index if not exists device_daily_user on public.device_daily(user_id, day);
create table if not exists public.usage_hourly (
  day date not null default current_date, hour smallint not null check (hour between 0 and 23), n int not null default 0,
  primary key (day, hour)
);
alter table public.device_daily enable row level security;
alter table public.usage_hourly enable row level security;

drop function if exists public.bump(text, text);
create or replace function public.bump(p_event text, p_key text default '', p_device text default null, p_platform text default null, p_standalone boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('app_open','search','place_view','route','nav_start','nav_arrive','ai_question','install',
                     'sign_up','sign_in','course_add','class_add','exam_add','gpa_add','reminder_on','share_trip',
                     'offline_download','event_view','emergency_call','details_saved','onboard_fresher','onboard_continuing',
                     'onboard_staff','onboard_visitor','room_found','guide_view','checklist_done') then return; end if;
  if p_key <> '' and not exists (select 1 from public.locations where id::text = p_key) then p_key := ''; end if;
  insert into public.usage_daily(day, event, key, n) values (current_date, p_event, p_key, 1)
  on conflict (day, event, key) do update set n = usage_daily.n + 1;
  if p_device is not null and p_device ~ '^[a-f0-9]{16,64}$' then
    insert into public.device_daily(day, device, platform, standalone, user_id, events, first_hour)
    values (current_date, p_device, coalesce(nullif(p_platform, ''), 'other'), coalesce(p_standalone, false), auth.uid(), 1, extract(hour from now())::smallint)
    on conflict (day, device) do update set events = device_daily.events + 1,
      user_id = coalesce(auth.uid(), device_daily.user_id), standalone = device_daily.standalone or excluded.standalone;
  end if;
  if p_event = 'app_open' then
    insert into public.usage_hourly(day, hour, n) values (current_date, extract(hour from now())::smallint, 1)
    on conflict (day, hour) do update set n = usage_hourly.n + 1;
  end if;
exception when check_violation then return;
end $$;
grant execute on function public.bump(text, text, text, text, boolean) to anonymous, authenticated;

create or replace function public.admin_analytics(p_days int default 30)
returns json language sql stable security definer set search_path = public as $$
  with d as (select greatest(1, least(p_days, 365)) as nd),
  dev as (select * from public.device_daily, d where day > current_date - d.nd)
  select case when public.is_editor() then json_build_object(
    'users', json_build_object(
      'total', (select count(*) from neon_auth."user"),
      'verified', (select count(*) from neon_auth."user" where "emailVerified"),
      'new_in_period', (select count(*) from neon_auth."user", d where "createdAt" > now() - make_interval(days => d.nd)),
      'with_details', (select count(*) from public.profiles where programme is not null or level is not null),
      'push_devices', (select count(*) from public.push_subscriptions)),
    'active', json_build_object(
      'dau_devices', (select count(distinct device) from public.device_daily where day = current_date),
      'wau_devices', (select count(distinct device) from public.device_daily where day > current_date - 7),
      'mau_devices', (select count(distinct device) from public.device_daily where day > current_date - 30),
      'dau_users', (select count(distinct user_id) from public.device_daily where day = current_date and user_id is not null),
      'wau_users', (select count(distinct user_id) from public.device_daily where day > current_date - 7 and user_id is not null),
      'mau_users', (select count(distinct user_id) from public.device_daily where day > current_date - 30 and user_id is not null),
      'returning_devices', (select count(*) from (select device from dev group by device having count(*) >= 2) r),
      'devices_in_period', (select count(distinct device) from dev)),
    'daily', (select coalesce(json_agg(t order by t.day), '[]') from (
      select g.day::date as day,
        (select count(distinct device) from public.device_daily x where x.day = g.day) as devices,
        (select count(distinct user_id) from public.device_daily x where x.day = g.day and user_id is not null) as users,
        (select count(*) from neon_auth."user" u where u."createdAt"::date = g.day) as signups,
        (select coalesce(sum(n), 0) from public.usage_daily x where x.day = g.day and x.event = 'app_open') as opens
      from d, generate_series(current_date - d.nd + 1, current_date, interval '1 day') g(day)) t),
    'events', (select coalesce(json_object_agg(event, n), '{}') from (select event, sum(n)::int n from public.usage_daily, d where day > current_date - d.nd group by event) e),
    'platforms', (select coalesce(json_object_agg(platform, n), '{}') from (select platform, count(distinct device) n from dev group by platform) p),
    'installed_devices', (select count(distinct device) from dev where standalone),
    'hours', (select coalesce(json_agg(json_build_object('hour', hour, 'n', n) order by hour), '[]') from (select hour, sum(n)::int n from public.usage_hourly, d where day > current_date - d.nd group by hour) h),
    'students', json_build_object(
      'by_type', (select coalesce(json_object_agg(t, n), '{}') from (select case when affiliation = 'student' and level = '100' then 'fresher' when affiliation = 'student' and level in ('200','300','400','500','600') then 'continuing' when affiliation = 'student' and level in ('masters','mphil','phd') then 'postgraduate' when affiliation = 'student' then 'student (level not set)' else coalesce(affiliation, 'not set') end t, count(*) n from public.profiles group by 1) x),
      'by_level', (select coalesce(json_object_agg(coalesce(level, 'not set'), n), '{}') from (select level, count(*) n from public.profiles group by level) x),
      'by_residence', (select coalesce(json_object_agg(coalesce(residence, 'not set'), n), '{}') from (select residence, count(*) n from public.profiles group by residence) x),
      'top_halls', (select coalesce(json_agg(x), '[]') from (select coalesce(l.name, p.hall_name) as name, count(*) n from public.profiles p left join public.locations l on l.id = p.hall_location_id where coalesce(l.name, p.hall_name) is not null group by 1 order by 2 desc limit 10) x),
      'top_programmes', (select coalesce(json_agg(x), '[]') from (select initcap(trim(programme)) as name, count(*) n from public.profiles where programme is not null group by 1 order by 2 desc limit 10) x)),
    'features', json_build_object(
      'users_with_timetable', (select count(distinct user_id) from public.courses),
      'class_sessions', (select count(*) from public.class_sessions),
      'users_with_exams', (select count(distinct user_id) from public.exams),
      'users_with_gpa', (select count(distinct user_id) from public.gpa_records),
      'saved_places', (select count(*) from public.saved_places),
      'live_shares', (select count(*) from public.live_shares, d where created_at > now() - make_interval(days => d.nd)),
      'reports_open', (select count(*) from public.reports where status = 'open')),
    'top_destinations', (select coalesce(json_agg(t), '[]') from (select l.name, sum(u.n)::int n from public.usage_daily u join public.locations l on l.id::text = u.key, d where u.event = 'route' and u.day > current_date - d.nd group by l.name order by 2 desc limit 10) t),
    'top_viewed', (select coalesce(json_agg(t), '[]') from (select l.name, sum(u.n)::int n from public.usage_daily u join public.locations l on l.id::text = u.key, d where u.event = 'place_view' and u.day > current_date - d.nd group by l.name order by 2 desc limit 10) t)
  ) end
$$;
grant execute on function public.admin_analytics(int) to authenticated;

-- Admin-only member list (no passwords; IDs never collected).
create or replace function public.admin_users(p_q text default '', p_limit int default 200)
returns table (user_id uuid, email text, name text, joined timestamptz, verified boolean, last_active date, active_days int,
               affiliation text, level text, programme text, hall text, role text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email, coalesce(p.display_name, u.name), u."createdAt", u."emailVerified",
         (select max(day) from public.device_daily d where d.user_id = u.id),
         (select count(distinct day)::int from public.device_daily d where d.user_id = u.id),
         p.affiliation, p.level, p.programme, coalesce(l.name, p.hall_name), r.role
  from neon_auth."user" u
  left join public.profiles p on p.user_id = u.id
  left join public.locations l on l.id = p.hall_location_id
  left join public.app_roles r on r.user_id = u.id
  where public.is_admin() and (p_q = '' or u.email ilike '%' || p_q || '%' or coalesce(p.display_name, u.name, '') ilike '%' || p_q || '%')
  order by u."createdAt" desc
  limit least(greatest(p_limit, 1), 1000)
$$;
grant execute on function public.admin_users(text, int) to authenticated;
