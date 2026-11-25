-- Content Atelier: one platform, many clients (each client is a workspace).
-- Safe to run more than once. Older single-client calls keep working (new parameters are optional).

-- 1. Client brand settings
alter table public.workspaces add column if not exists logo_url text;
alter table public.workspaces add column if not exists voice_rules text[] not null default '{}';
alter table public.workspaces add column if not exists locations text[] not null default '{}';
alter table public.workspaces add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Owners/admins can update their client's settings
drop policy if exists "managers update workspace" on public.workspaces;
create policy "managers update workspace" on public.workspaces for update
  using (exists(select 1 from public.workspace_members m where m.workspace_id=workspaces.id and m.user_id=auth.uid() and m.role in ('owner','admin')))
  with check (exists(select 1 from public.workspace_members m where m.workspace_id=workspaces.id and m.user_id=auth.uid() and m.role in ('owner','admin')));
grant update (name, logo_url, voice_rules, locations) on public.workspaces to authenticated;

-- 2. Create a new client (only people who already own a client can create more)
create or replace function public.create_workspace(client_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if not exists(select 1 from public.workspace_members where user_id=auth.uid() and role='owner') then
    raise exception 'Only the platform owner can create clients.';
  end if;
  if coalesce(trim(client_name),'') = '' then raise exception 'Give the client a name.'; end if;
  insert into public.workspaces(name, created_by) values (trim(client_name), auth.uid()) returning id into ws;
  insert into public.workspace_members(workspace_id,user_id,role) values (ws, auth.uid(), 'owner');
  return ws;
end $$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- 3. Team management for a chosen client
drop function if exists public.managed_workspace();
create or replace function public.managed_workspace(target_workspace uuid default null)
returns uuid language sql security definer stable set search_path=public
as $$ select workspace_id from public.workspace_members
  where user_id=auth.uid() and role in ('owner','admin') and (target_workspace is null or workspace_id=target_workspace)
  order by (role='owner') desc, created_at limit 1 $$;

drop function if exists public.list_team();
create or replace function public.list_team(target_workspace uuid default null)
returns table(user_id uuid, email text, role text, since timestamptz, pending boolean)
language plpgsql security definer stable set search_path=public as $$
declare ws uuid := public.managed_workspace(target_workspace);
declare is_owner boolean;
begin
  if ws is null then raise exception 'Only the client owner can manage the team.'; end if;
  is_owner := exists(select 1 from public.workspace_members wm where wm.user_id=auth.uid() and wm.workspace_id=ws and wm.role='owner');
  return query
    select m.user_id, u.email::text, m.role, m.created_at, false
      from public.workspace_members m join auth.users u on u.id=m.user_id
     where m.workspace_id=ws
    union all
    -- Sign-in requests from people with no access anywhere: only platform owners see them
    select r.user_id, coalesce(r.email,u.email)::text, null::text, r.created_at, true
      from public.access_requests r join auth.users u on u.id=r.user_id
     where is_owner and not exists(select 1 from public.workspace_members m2 where m2.user_id=r.user_id)
    order by 5 desc, 4;
end $$;

drop function if exists public.set_member_role(uuid,text);
create or replace function public.set_member_role(target_user uuid, new_role text, target_workspace uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare ws uuid := public.managed_workspace(target_workspace);
begin
  if ws is null then raise exception 'Only the client owner can manage the team.'; end if;
  if new_role not in ('admin','editor','approver','viewer') then raise exception 'Invalid role.'; end if;
  if target_user = auth.uid() then raise exception 'You cannot change your own access.'; end if;
  if exists(select 1 from public.workspace_members where user_id=target_user and workspace_id=ws and role='owner') then
    raise exception 'The owner''s access cannot be changed.';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role) values (ws,target_user,new_role)
  on conflict (workspace_id,user_id) do update set role=excluded.role;
  delete from public.access_requests where user_id=target_user;
end $$;

drop function if exists public.remove_member(uuid);
create or replace function public.remove_member(target_user uuid, target_workspace uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare ws uuid := public.managed_workspace(target_workspace);
begin
  if ws is null then raise exception 'Only the client owner can manage the team.'; end if;
  if target_user = auth.uid() then raise exception 'You cannot remove yourself.'; end if;
  if exists(select 1 from public.workspace_members where user_id=target_user and workspace_id=ws and role='owner') then
    raise exception 'The owner cannot be removed.';
  end if;
  delete from public.workspace_members where user_id=target_user and workspace_id=ws;
end $$;

-- 4. Approval emails for a chosen client
drop function if exists public.notification_recipients(text);
create or replace function public.notification_recipients(kind text, target_workspace uuid default null)
returns table(email text) language plpgsql security definer stable set search_path=public as $$
declare ws uuid; my_role text;
begin
  select m.workspace_id, m.role into ws, my_role
    from public.workspace_members m
   where m.user_id=auth.uid() and (target_workspace is null or m.workspace_id=target_workspace)
   order by m.created_at limit 1;
  if ws is null then raise exception 'You are not a member of this client.'; end if;
  if kind = 'submitted' then
    if my_role not in ('owner','admin','editor') then raise exception 'Only the editing team can notify the approver.'; end if;
    return query select u.email::text from public.workspace_members m join auth.users u on u.id=m.user_id
      where m.workspace_id=ws and m.role='approver' and u.email is not null;
  elsif kind = 'reviewed' then
    if my_role not in ('owner','approver') then raise exception 'Only approvers can send review updates.'; end if;
    return query select u.email::text from public.workspace_members m join auth.users u on u.id=m.user_id
      where m.workspace_id=ws and m.role in ('owner','admin','editor') and m.user_id<>auth.uid() and u.email is not null;
  else
    raise exception 'Invalid notification type.';
  end if;
end $$;

revoke all on function public.managed_workspace(uuid) from public, anon;
revoke all on function public.list_team(uuid) from public, anon;
revoke all on function public.set_member_role(uuid,text,uuid) from public, anon;
revoke all on function public.remove_member(uuid,uuid) from public, anon;
revoke all on function public.notification_recipients(text,uuid) from public, anon;
grant execute on function public.managed_workspace(uuid) to authenticated;
grant execute on function public.list_team(uuid) to authenticated;
grant execute on function public.set_member_role(uuid,text,uuid) to authenticated;
grant execute on function public.remove_member(uuid,uuid) to authenticated;
grant execute on function public.notification_recipients(text,uuid) to authenticated;

-- dismiss_request also needs a platform owner now
create or replace function public.dismiss_request(target_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.workspace_members where user_id=auth.uid() and role='owner') then
    raise exception 'Only the platform owner can manage requests.';
  end if;
  delete from public.access_requests where user_id=target_user;
end $$;

-- Fix (Nov 25, 2026): qualify columns in list_team; let members read their clients
-- (list_team is redefined above with qualified names in the applied version)
grant select on public.workspaces to authenticated;
