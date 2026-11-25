-- Açaí Carioca Studio: who receives approval emails
-- kind = 'submitted' → called by owner/admin/editor, returns the approvers' emails
-- kind = 'reviewed'  → called by owner/approver, returns the editing team's emails (owner, admin, editor)
-- Safe to run more than once. Requires add-approvals.sql.

create or replace function public.notification_recipients(kind text)
returns table(email text) language plpgsql security definer stable set search_path=public as $$
declare ws uuid; my_role text;
begin
  select m.workspace_id, m.role into ws, my_role
    from public.workspace_members m where m.user_id=auth.uid() limit 1;
  if ws is null then raise exception 'You are not a member of this workspace.'; end if;

  if kind = 'submitted' then
    if my_role not in ('owner','admin','editor') then raise exception 'Only the editing team can notify the approver.'; end if;
    return query select u.email::text from public.workspace_members m join auth.users u on u.id=m.user_id
      where m.workspace_id=ws and m.role='approver' and u.email is not null;
  elsif kind = 'reviewed' then
    if my_role not in ('owner','approver') then raise exception 'Only approvers can send review updates.'; end if;
    return query select u.email::text from public.workspace_members m join auth.users u on u.id=m.user_id
      where m.workspace_id=ws and m.role in ('owner','admin','editor') and m.user_id<>auth.uid() and u.email is not null;
  else
    raise exception 'Invalid notification type.';
  end if;
end $$;

revoke all on function public.notification_recipients(text) from public, anon;
grant execute on function public.notification_recipients(text) to authenticated;
