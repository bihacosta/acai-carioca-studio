-- Açaí Carioca Studio: manage team access inside the app
-- People who sign in without access create an "access request".
-- The workspace owner (or an admin) approves, changes roles or removes people from the Team tab.
-- Safe to run more than once. Requires add-approvals.sql (approver role).

create table if not exists public.access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.access_requests enable row level security;
-- No direct table access: everything goes through the functions below.
revoke all on public.access_requests from anon, authenticated;

-- Which workspace the caller manages (owner or admin), if any
create or replace function public.managed_workspace()
returns uuid language sql security definer stable set search_path=public
as $$ select workspace_id from public.workspace_members
  where user_id=auth.uid() and role in ('owner','admin') limit 1 $$;

-- Called by a signed-in person who has no access yet
create or replace function public.request_access()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if exists(select 1 from public.workspace_members where user_id=auth.uid()) then return; end if;
  insert into public.access_requests(user_id,email)
  values (auth.uid(), (select email from auth.users where id=auth.uid()))
  on conflict (user_id) do nothing;
end $$;

-- Team list for the owner / admins: members and pending requests
create or replace function public.list_team()
returns table(user_id uuid, email text, role text, since timestamptz, pending boolean)
language plpgsql security definer stable set search_path=public as $$
declare ws uuid := public.managed_workspace();
begin
  if ws is null then raise exception 'Only the workspace owner can manage the team.'; end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at, false
      from public.workspace_members m join auth.users u on u.id=m.user_id
     where m.workspace_id=ws
    union all
    select r.user_id, coalesce(r.email,u.email)::text, null::text, r.created_at, true
      from public.access_requests r join auth.users u on u.id=r.user_id
     where not exists(select 1 from public.workspace_members m where m.user_id=r.user_id)
    order by 5 desc, 4;
end $$;

-- Give access or change someone's role
create or replace function public.set_member_role(target_user uuid, new_role text)
returns void language plpgsql security definer set search_path=public as $$
declare ws uuid := public.managed_workspace();
begin
  if ws is null then raise exception 'Only the workspace owner can manage the team.'; end if;
  if new_role not in ('admin','editor','approver','viewer') then raise exception 'Invalid role.'; end if;
  if target_user = auth.uid() then raise exception 'You cannot change your own access.'; end if;
  if exists(select 1 from public.workspace_members where user_id=target_user and workspace_id=ws and role='owner') then
    raise exception 'The owner''s access cannot be changed.';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role) values (ws,target_user,new_role)
  on conflict (workspace_id,user_id) do update set role=excluded.role;
  delete from public.access_requests where user_id=target_user;
end $$;

-- Remove someone's access (their posts stay in the workspace)
create or replace function public.remove_member(target_user uuid)
returns void language plpgsql security definer set search_path=public as $$
declare ws uuid := public.managed_workspace();
begin
  if ws is null then raise exception 'Only the workspace owner can manage the team.'; end if;
  if target_user = auth.uid() then raise exception 'You cannot remove yourself.'; end if;
  if exists(select 1 from public.workspace_members where user_id=target_user and workspace_id=ws and role='owner') then
    raise exception 'The owner cannot be removed.';
  end if;
  delete from public.workspace_members where user_id=target_user and workspace_id=ws;
end $$;

-- Decline a pending request
create or replace function public.dismiss_request(target_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if public.managed_workspace() is null then raise exception 'Only the workspace owner can manage the team.'; end if;
  delete from public.access_requests where user_id=target_user;
end $$;

revoke all on function public.request_access() from public, anon;
revoke all on function public.list_team() from public, anon;
revoke all on function public.set_member_role(uuid,text) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.dismiss_request(uuid) from public, anon;
revoke all on function public.managed_workspace() from public, anon;
grant execute on function public.request_access() to authenticated;
grant execute on function public.list_team() to authenticated;
grant execute on function public.set_member_role(uuid,text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.dismiss_request(uuid) to authenticated;
grant execute on function public.managed_workspace() to authenticated;
