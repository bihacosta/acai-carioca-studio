-- Açaí Carioca Studio: planner features (crop, carousel, Reel cover, drafts,
-- caption templates & hashtag groups, post comments, link in bio).
-- Safe to run more than once. Requires add-approvals.sql (can_edit_workspace).

-- 1. Posts: framing, carousel, Reel cover, drafts
alter table public.posts add column if not exists crop_x smallint not null default 50;
alter table public.posts add column if not exists crop_y smallint not null default 50;
alter table public.posts add column if not exists extra_images text[] not null default '{}';
alter table public.posts add column if not exists cover_url text;
alter table public.posts add column if not exists on_grid boolean not null default true;
do $$ begin
  alter table public.posts add constraint posts_crop_range check (crop_x between 0 and 100 and crop_y between 0 and 100);
exception when duplicate_object then null; end $$;

-- 2. Saved caption templates and hashtag groups
create table if not exists public.post_snippets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('caption','hashtags')),
  name text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.post_snippets enable row level security;
drop policy if exists "members read snippets" on public.post_snippets;
create policy "members read snippets" on public.post_snippets for select using (public.is_workspace_member(workspace_id));
drop policy if exists "editors write snippets" on public.post_snippets;
create policy "editors write snippets" on public.post_snippets for all
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
grant select, insert, update, delete on public.post_snippets to authenticated;

-- 3. Comments on posts (everyone on the team, including approvers)
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_email text,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);
alter table public.post_comments enable row level security;
drop policy if exists "members read comments" on public.post_comments;
create policy "members read comments" on public.post_comments for select using (public.is_workspace_member(workspace_id));
drop policy if exists "members add comments" on public.post_comments;
create policy "members add comments" on public.post_comments for insert
  with check (public.is_workspace_member(workspace_id) and author_id = auth.uid()
    and exists(select 1 from public.posts p where p.id = post_id and p.workspace_id = post_comments.workspace_id));
drop policy if exists "authors delete own comments" on public.post_comments;
create policy "authors delete own comments" on public.post_comments for delete using (author_id = auth.uid());
grant select, insert, delete on public.post_comments to authenticated;

create or replace function public.set_comment_author()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.author_id := auth.uid();
  new.author_email := (select email from auth.users where id = auth.uid());
  return new;
end $$;
drop trigger if exists set_comment_author on public.post_comments;
create trigger set_comment_author before insert on public.post_comments
for each row execute function public.set_comment_author();

-- 4. Link in bio (public page when published)
create table if not exists public.bio_pages (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title text not null default 'Açaí Carioca',
  subtitle text,
  avatar_url text,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.bio_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  url text not null check (url ~* '^(https?://|mailto:|tel:)'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.bio_pages enable row level security;
alter table public.bio_links enable row level security;

drop policy if exists "public reads published bio page" on public.bio_pages;
create policy "public reads published bio page" on public.bio_pages for select
  using (published or public.is_workspace_member(workspace_id));
drop policy if exists "editors write bio page" on public.bio_pages;
create policy "editors write bio page" on public.bio_pages for all
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));

drop policy if exists "public reads published bio links" on public.bio_links;
create policy "public reads published bio links" on public.bio_links for select
  using (exists(select 1 from public.bio_pages b where b.workspace_id = bio_links.workspace_id and b.published)
         or public.is_workspace_member(workspace_id));
drop policy if exists "editors write bio links" on public.bio_links;
create policy "editors write bio links" on public.bio_links for all
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));

grant select on public.bio_pages, public.bio_links to anon;
grant select, insert, update, delete on public.bio_pages, public.bio_links to authenticated;

-- Instagram profile details for the phone preview (added Nov 25, 2026)
alter table public.bio_pages add column if not exists instagram_handle text check (instagram_handle is null or instagram_handle ~ '^[a-z0-9._]{1,30}$');
alter table public.bio_pages add column if not exists website text;
alter table public.bio_pages add column if not exists highlights text[] not null default '{}';
