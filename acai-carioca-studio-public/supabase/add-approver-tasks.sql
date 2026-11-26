-- Approvers can ADD tasks to the To-do (e.g. requests for the team).
-- They still can't edit, move, complete or delete tasks: those stay with owners, admins and editors.
-- RLS stays on.
drop policy if exists "workspace members can create tasks" on public.tasks;
create policy "workspace members can create tasks" on public.tasks
  for insert to authenticated
  with check ((public.can_edit_workspace(workspace_id) or public.can_review_workspace(workspace_id))
              and created_by = auth.uid());
