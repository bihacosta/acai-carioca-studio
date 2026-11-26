-- Client details for Content Atelier: branding, social links, contact, and account logins.
-- RLS stays on. Team members of a client can read its profile; only owners/admins can edit.
-- Account logins live in a separate table that only owners/admins can see. Passwords are NOT stored.

create table if not exists public.client_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  tagline text,
  brand_colors text[] not null default '{}',
  brand_fonts text,
  voice_notes text,
  website text,
  socials jsonb not null default '{}'::jsonb,
  contact_name text,
  contact_email text,
  contact_phone text,
  updated_at timestamptz not null default now()
);
alter table public.client_profiles enable row level security;
drop policy if exists "members read client profile" on public.client_profiles;
create policy "members read client profile" on public.client_profiles
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "managers write client profile" on public.client_profiles;
create policy "managers write client profile" on public.client_profiles
  for all to authenticated
  using (public.managed_workspace(workspace_id) is not null)
  with check (public.managed_workspace(workspace_id) is not null);
grant select, insert, update on public.client_profiles to authenticated;

create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null,
  login text,
  password_location text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists client_accounts_ws_idx on public.client_accounts(workspace_id, sort_order);
alter table public.client_accounts enable row level security;
drop policy if exists "managers manage client accounts" on public.client_accounts;
create policy "managers manage client accounts" on public.client_accounts
  for all to authenticated
  using (public.managed_workspace(workspace_id) is not null)
  with check (public.managed_workspace(workspace_id) is not null);
grant select, insert, update, delete on public.client_accounts to authenticated;

-- Owners/admins can rename a client (logo permission was added in add-client-logo.sql).
grant update (name, logo_url) on public.workspaces to authenticated;
