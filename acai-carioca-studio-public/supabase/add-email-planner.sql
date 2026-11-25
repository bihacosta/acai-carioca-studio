-- Açaí Carioca Studio: email marketing planner (campaigns sent with Square Marketing)
-- Safe to run more than once. Requires add-approvals.sql (can_edit_workspace, can_review_workspace).

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  series text,
  series_number integer,
  subject text,
  preview_text text,
  send_date date,
  audience text not null default 'All customers',
  status text not null default 'Idea',
  body text,
  hero_image_url text,
  cta_label text,
  cta_url text,
  square_url text,
  recipients integer,
  opens integer,
  clicks integer,
  revenue numeric(12,2),
  results_notes text,
  approval_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_campaigns_ws_date_idx on public.email_campaigns(workspace_id, send_date);
alter table public.email_campaigns enable row level security;

drop policy if exists "members read emails" on public.email_campaigns;
create policy "members read emails" on public.email_campaigns for select using (public.is_workspace_member(workspace_id));
drop policy if exists "editors create emails" on public.email_campaigns;
create policy "editors create emails" on public.email_campaigns for insert with check (public.can_edit_workspace(workspace_id));
drop policy if exists "editors update emails" on public.email_campaigns;
create policy "editors update emails" on public.email_campaigns for update
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
drop policy if exists "admins delete emails" on public.email_campaigns;
create policy "admins delete emails" on public.email_campaigns for delete
  using (exists(select 1 from public.workspace_members m where m.workspace_id=email_campaigns.workspace_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
grant select, insert, update, delete on public.email_campaigns to authenticated;

-- Only reviewers may set "Approved" / "Changes requested" (same rule as posts)
drop trigger if exists guard_review_status on public.email_campaigns;
create trigger guard_review_status before update on public.email_campaigns
for each row execute function public.guard_review_status();

-- Review one or many emails at once (Approvals tab)
create or replace function public.review_emails(email_ids uuid[], decision text, note text default null)
returns setof public.email_campaigns language plpgsql security definer set search_path=public as $$
begin
  if decision not in ('Approved','Changes requested') then raise exception 'Invalid decision.'; end if;
  if decision = 'Changes requested' and coalesce(trim(note),'') = '' then
    raise exception 'Please add a comment explaining what should change.';
  end if;
  return query
    update public.email_campaigns e
       set status = decision, approval_note = nullif(trim(note),''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     where e.id = any(email_ids) and e.status = 'Awaiting approval' and public.can_review_workspace(e.workspace_id)
    returning e.*;
end $$;
revoke all on function public.review_emails(uuid[],text,text) from public, anon;
grant execute on function public.review_emails(uuid[],text,text) to authenticated;
