-- Content Atelier: remember the order of To-do cards when they're dragged (Nov 25, 2026)
alter table public.tasks add column if not exists sort_order integer not null default 0;
create index if not exists tasks_ws_status_order_idx on public.tasks(workspace_id, status, sort_order);
