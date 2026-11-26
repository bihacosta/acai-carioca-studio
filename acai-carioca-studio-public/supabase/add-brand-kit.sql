-- Brand kit: a place per client to keep branding files (logos, fonts, guidelines, photos, other).
-- RLS stays on.
--   * Everyone on the client's team can SEE the files.
--   * Owners, admins and editors can ADD files and change a file's name or folder.
--   * A file can be removed by whoever uploaded it, or by an owner/admin.
-- The files themselves go in the existing "creative-assets" storage bucket, inside the uploader's
-- own folder (the existing storage rules already allow that), so no storage change is needed.

create table if not exists public.brand_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null default 'other'
    check (category in ('logo', 'font', 'guideline', 'photo', 'other')),
  name text not null check (length(trim(name)) between 1 and 200),
  file_path text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists brand_files_ws_idx on public.brand_files(workspace_id, category, created_at desc);

alter table public.brand_files enable row level security;

drop policy if exists "members read brand files" on public.brand_files;
create policy "members read brand files" on public.brand_files
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists "editors add brand files" on public.brand_files;
create policy "editors add brand files" on public.brand_files
  for insert to authenticated
  with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid()
              and split_part(file_path, '/', 1) = auth.uid()::text);

drop policy if exists "editors rename brand files" on public.brand_files;
create policy "editors rename brand files" on public.brand_files
  for update to authenticated
  using (public.can_edit_workspace(workspace_id))
  with check (public.can_edit_workspace(workspace_id));

drop policy if exists "uploader or managers remove brand files" on public.brand_files;
create policy "uploader or managers remove brand files" on public.brand_files
  for delete to authenticated
  using (created_by = auth.uid() or public.managed_workspace(workspace_id) is not null);

revoke all on public.brand_files from anon;
revoke update on public.brand_files from authenticated;
grant select, insert, delete on public.brand_files to authenticated;
grant update (name, category) on public.brand_files to authenticated;
