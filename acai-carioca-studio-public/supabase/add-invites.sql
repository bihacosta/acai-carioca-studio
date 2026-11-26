-- Invites by email: an owner/admin invites an email to ONE client with a role.
-- When that person signs in with that (verified) email, they join that client automatically.
-- RLS stays on. Only the client's owners/admins can see, create or cancel its invites.

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'viewer' check (role in ('admin', 'editor', 'approver', 'viewer')),
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index if not exists workspace_invites_email_idx on public.workspace_invites(email);

alter table public.workspace_invites enable row level security;

drop policy if exists "managers see invites" on public.workspace_invites;
create policy "managers see invites" on public.workspace_invites
  for select to authenticated using (public.managed_workspace(workspace_id) is not null);

drop policy if exists "managers create invites" on public.workspace_invites;
create policy "managers create invites" on public.workspace_invites
  for insert to authenticated
  with check (public.managed_workspace(workspace_id) is not null and invited_by = auth.uid());

drop policy if exists "managers change invites" on public.workspace_invites;
create policy "managers change invites" on public.workspace_invites
  for update to authenticated
  using (public.managed_workspace(workspace_id) is not null)
  with check (public.managed_workspace(workspace_id) is not null);

drop policy if exists "managers cancel invites" on public.workspace_invites;
create policy "managers cancel invites" on public.workspace_invites
  for delete to authenticated using (public.managed_workspace(workspace_id) is not null);

revoke all on public.workspace_invites from anon;
revoke update on public.workspace_invites from authenticated;
grant select, insert, delete on public.workspace_invites to authenticated;
grant update (role) on public.workspace_invites to authenticated;

-- Called by the app right after sign-in. Turns the signed-in person's invites into memberships.
-- Only for a verified email, so nobody can claim an invite by typing someone else's address.
-- Never lowers an existing role. Returns how many clients were joined.
create or replace function public.accept_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare me_email text; joined integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into me_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if me_email is null then return 0; end if;
  insert into public.workspace_members(workspace_id, user_id, role)
    select i.workspace_id, auth.uid(), i.role from public.workspace_invites i where i.email = me_email
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics joined = row_count;
  delete from public.workspace_invites where email = me_email;
  if exists(select 1 from public.workspace_members where user_id = auth.uid()) then
    delete from public.access_requests where user_id = auth.uid();
  end if;
  return joined;
end $$;

revoke all on function public.accept_invites() from public, anon;
grant execute on function public.accept_invites() to authenticated;
