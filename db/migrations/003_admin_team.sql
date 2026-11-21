-- 003: admin team management + dashboard stats (applied 2026-11-21)
create policy invites_admin on public.admin_invites for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.admin_invites to authenticated;
-- Admins manage other people's roles (never their own, so an admin can't lock themselves out by mistake).
create policy roles_admin_write on public.app_roles for all to authenticated using (public.is_admin() and user_id <> auth.uid()) with check (public.is_admin() and user_id <> auth.uid());
grant insert, update, delete on public.app_roles to authenticated;
create or replace function public.admin_team() returns table(user_id uuid, email text, name text, role text, granted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, u.email, u.name, r.role, r.granted_at from public.app_roles r join neon_auth."user" u on u.id = r.user_id
  where public.is_admin() order by r.role, u.email
$$;
create or replace function public.admin_stats() returns json
language sql stable security definer set search_path = public as $$
  select case when public.is_editor() then json_build_object(
    'users', (select count(*) from neon_auth."user"), 'verified_users', (select count(*) from neon_auth."user" where "emailVerified"),
    'locations', (select count(*) from public.locations), 'verified_locations', (select count(*) from public.locations where verification = 'verified'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'published_announcements', (select count(*) from public.announcements where status = 'published'),
    'pending_announcements', (select count(*) from public.announcements where status = 'pending'),
    'guide_items', (select count(*) from public.fresher_resources where is_published),
    'shuttle_routes', (select count(*) from public.shuttle_routes where is_active),
    'live_shuttles', (select count(*) from public.shuttle_positions where updated_at > now() - interval '3 minutes'),
    'courses', (select count(*) from public.courses)) end
$$;
revoke all on function public.admin_team(), public.admin_stats() from public;
grant execute on function public.admin_team(), public.admin_stats() to authenticated;
