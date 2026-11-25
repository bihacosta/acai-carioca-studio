-- Açaí Carioca Studio: approval workflow
-- Adds an "approver" member role, review fields on posts, and a safe review function.
-- Safe to run more than once.

-- 1. New member role: approver (can see everything, can only approve / request changes)
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('owner','admin','editor','viewer','approver'));

-- 2. Review fields on posts
alter table public.posts add column if not exists approval_note text;
alter table public.posts add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists reviewed_at timestamptz;

-- 3. Who can create and edit content: owner, admin and editor only
create or replace function public.can_edit_workspace(target_workspace uuid)
returns boolean language sql security definer stable set search_path=public
as $$ select exists(select 1 from public.workspace_members m
  where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role in ('owner','admin','editor')) $$;

-- Who can review posts: owner and approver
create or replace function public.can_review_workspace(target_workspace uuid)
returns boolean language sql security definer stable set search_path=public
as $$ select exists(select 1 from public.workspace_members m
  where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role in ('owner','approver')) $$;

drop policy if exists "members can create posts" on public.posts;
create policy "members can create posts" on public.posts
for insert with check (public.can_edit_workspace(workspace_id) and created_by=auth.uid());

drop policy if exists "members can update posts" on public.posts;
create policy "members can update posts" on public.posts
for update using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "workspace members can create tasks" on public.tasks;
create policy "workspace members can create tasks" on public.tasks
for insert with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());

drop policy if exists "workspace members can update tasks" on public.tasks;
create policy "workspace members can update tasks" on public.tasks
for update using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "workspace members can delete tasks" on public.tasks;
create policy "workspace members can delete tasks" on public.tasks
for delete using (public.can_edit_workspace(workspace_id));

-- 4. Only reviewers may set a post to "Approved" or "Changes requested"
create or replace function public.guard_review_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('Approved','Changes requested')
     and new.status is distinct from old.status
     and not public.can_review_workspace(new.workspace_id) then
    raise exception 'Only the approver can approve posts or request changes.';
  end if;
  return new;
end $$;

drop trigger if exists guard_review_status on public.posts;
create trigger guard_review_status before update on public.posts
for each row execute function public.guard_review_status();

-- 5. Review one or many posts at once (used by the Approvals screen)
create or replace function public.review_posts(post_ids uuid[], decision text, note text default null)
returns setof public.posts language plpgsql security definer set search_path=public as $$
begin
  if decision not in ('Approved','Changes requested') then
    raise exception 'Invalid decision.';
  end if;
  if decision = 'Changes requested' and coalesce(trim(note),'') = '' then
    raise exception 'Please add a comment explaining what should change.';
  end if;
  return query
    update public.posts p
       set status = decision,
           approval_note = nullif(trim(note),''),
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at = now()
     where p.id = any(post_ids)
       and p.status = 'Awaiting approval'
       and public.can_review_workspace(p.workspace_id)
    returning p.*;
end $$;

revoke all on function public.review_posts(uuid[],text,text) from public, anon;
grant execute on function public.review_posts(uuid[],text,text) to authenticated;
