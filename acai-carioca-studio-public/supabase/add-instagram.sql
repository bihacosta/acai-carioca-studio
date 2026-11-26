-- Instagram (read-only sync): connect a client's Instagram professional account and keep a copy of its
-- published posts and their numbers, so the team can see the real feed and how each post did.
-- RLS stays on.
--   * Everyone on the client's team can SEE the connection (username, last sync) and the synced posts.
--   * Only owners/admins can CONNECT or DISCONNECT. Owners/admins/editors can SYNC (refresh the numbers).
--   * The Instagram access key is stored ENCRYPTED (the app server holds the key) and the browser
--     can't read it at all: only a guarded function returns it, to the server, for syncing.

create table if not exists public.instagram_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  ig_user_id text not null,
  username text,
  account_type text,
  profile_picture_url text,
  token_enc text not null,
  token_expires_at timestamptz,
  connected_by uuid default auth.uid() references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);
alter table public.instagram_connections enable row level security;

drop policy if exists "members see instagram connection" on public.instagram_connections;
create policy "members see instagram connection" on public.instagram_connections
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "managers connect instagram" on public.instagram_connections;
create policy "managers connect instagram" on public.instagram_connections
  for insert to authenticated with check (public.managed_workspace(workspace_id) is not null);
drop policy if exists "editors update instagram connection" on public.instagram_connections;
create policy "editors update instagram connection" on public.instagram_connections
  for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
drop policy if exists "managers disconnect instagram" on public.instagram_connections;
create policy "managers disconnect instagram" on public.instagram_connections
  for delete to authenticated using (public.managed_workspace(workspace_id) is not null);

revoke all on public.instagram_connections from anon, authenticated;
-- Browser can read everything EXCEPT the (encrypted) token.
grant select (workspace_id, ig_user_id, username, account_type, profile_picture_url, token_expires_at,
              connected_by, connected_at, last_synced_at, last_error) on public.instagram_connections to authenticated;
grant insert, delete on public.instagram_connections to authenticated;
grant update (ig_user_id, username, account_type, profile_picture_url, token_enc, token_expires_at,
              last_synced_at, last_error) on public.instagram_connections to authenticated;

-- The server (acting as the signed-in owner/admin/editor) reads the encrypted token through this.
create or replace function public.instagram_token(target_workspace uuid)
returns text language sql stable security definer set search_path = public as $$
  select c.token_enc from public.instagram_connections c
   where c.workspace_id = target_workspace and public.can_edit_workspace(target_workspace)
$$;
revoke all on function public.instagram_token(uuid) from public, anon;
grant execute on function public.instagram_token(uuid) to authenticated;

create table if not exists public.instagram_media (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ig_id text not null,
  caption text,
  media_type text,
  product_type text,
  media_url text,
  thumbnail_url text,
  permalink text,
  posted_at timestamptz,
  like_count integer,
  comments_count integer,
  reach integer,
  views integer,
  saves integer,
  shares integer,
  synced_at timestamptz not null default now(),
  primary key (workspace_id, ig_id)
);
create index if not exists instagram_media_ws_idx on public.instagram_media(workspace_id, posted_at desc);
alter table public.instagram_media enable row level security;

drop policy if exists "members see instagram posts" on public.instagram_media;
create policy "members see instagram posts" on public.instagram_media
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "editors sync instagram posts" on public.instagram_media;
create policy "editors sync instagram posts" on public.instagram_media
  for all to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));

revoke all on public.instagram_media from anon;
grant select, insert, update, delete on public.instagram_media to authenticated;
