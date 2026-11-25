-- Açaí Carioca Studio: shared team To-do lists
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  details text,
  list_name text not null default 'General',
  due_date date,
  priority text not null default 'Normal' check (priority in ('Low','Normal','High')),
  status text not null default 'To do' check (status in ('To do','In progress','Done')),
  assignee text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "workspace members can read tasks" on public.tasks;
create policy "workspace members can read tasks" on public.tasks
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create tasks" on public.tasks;
create policy "workspace members can create tasks" on public.tasks
for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "workspace members can update tasks" on public.tasks;
create policy "workspace members can update tasks" on public.tasks
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can delete tasks" on public.tasks;
create policy "workspace members can delete tasks" on public.tasks
for delete using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.tasks to authenticated;
