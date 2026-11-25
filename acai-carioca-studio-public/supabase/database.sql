-- Açaí Carioca Studio: initial schema
create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Açaí Carioca',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  image_url text not null,
  publish_date date,
  format text not null default 'Post',
  location text not null default 'Both',
  pillar text not null default 'Product',
  status text not null default 'Idea',
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bootstrap workspace: after creating your first account, run the INSERT below
-- using that account's UUID from Authentication > Users.
-- insert into public.workspaces(name) values ('Açaí Carioca') returning id;
-- insert into public.workspace_members(workspace_id,user_id,role)
-- values ('WORKSPACE_UUID','YOUR_AUTH_USER_UUID','owner');

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.posts enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql security definer stable set search_path=public
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid()) $$;

create policy "members can read their workspaces" on public.workspaces
for select using (public.is_workspace_member(id));
create policy "members can read memberships" on public.workspace_members
for select using (public.is_workspace_member(workspace_id));
create policy "members can read posts" on public.posts
for select using (public.is_workspace_member(workspace_id));
create policy "members can create posts" on public.posts
for insert with check (public.is_workspace_member(workspace_id) and created_by=auth.uid());
create policy "members can update posts" on public.posts
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "admins can delete posts" on public.posts
for delete using (exists(select 1 from public.workspace_members m where m.workspace_id=posts.workspace_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

-- Create a private storage bucket named creative-assets in Supabase Storage.
-- Add storage policies that restrict each object to the workspace's members.


-- Storage policies for the starter's user-scoped upload paths:
-- The app uploads to: {authenticated-user-uuid}/{random-file-name}
insert into storage.buckets (id, name, public)
values ('creative-assets', 'creative-assets', true)
on conflict (id) do update set public = true;

create policy "authenticated users can upload their creative assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated users can update their creative assets"
on storage.objects for update to authenticated
using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated users can delete their creative assets"
on storage.objects for delete to authenticated
using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = auth.uid()::text);
