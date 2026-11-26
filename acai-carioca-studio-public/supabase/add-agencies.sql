-- Content Atelier: agências (Nov 2026)
-- Cada agência tem a própria equipe e os próprios clientes. Qualquer pessoa pode criar uma agência (grátis por enquanto).
-- A dona da plataforma (Bianca) vê a lista de agências e números gerais, sem ver o conteúdo delas.
-- Compatível com a versão atual do app: pode rodar antes de publicar as telas novas.

-- 1) Tabelas novas ---------------------------------------------------------
create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  plan text not null default 'free',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_members (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

-- Donas da plataforma (só a Bianca). Sem políticas: ninguém lê direto, só pelas funções abaixo.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.platform_admins enable row level security;

-- Cada cliente pertence a uma agência
alter table public.workspaces add column if not exists agency_id uuid references public.agencies(id) on delete restrict;
create index if not exists workspaces_agency_idx on public.workspaces(agency_id);

-- 2) Funções de apoio ------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;

-- A agência que a pessoa administra (dona ou admin), ou null
create or replace function public.my_agency()
returns uuid language sql stable security definer set search_path=public as $$
  select agency_id from public.agency_members where user_id=auth.uid()
  order by (role='owner') desc, created_at limit 1 $$;

-- 3) Quem lê o quê (RLS) ---------------------------------------------------
drop policy if exists "members read their agency" on public.agencies;
create policy "members read their agency" on public.agencies for select
  using (exists(select 1 from public.agency_members a where a.agency_id=agencies.id and a.user_id=auth.uid()));

drop policy if exists "owners rename their agency" on public.agencies;
create policy "owners rename their agency" on public.agencies for update
  using (exists(select 1 from public.agency_members a where a.agency_id=agencies.id and a.user_id=auth.uid() and a.role='owner'))
  with check (exists(select 1 from public.agency_members a where a.agency_id=agencies.id and a.user_id=auth.uid() and a.role='owner'));

drop policy if exists "people read their own agency membership" on public.agency_members;
create policy "people read their own agency membership" on public.agency_members for select
  using (user_id=auth.uid());

-- Só o nome pode ser mudado pela agência (o plano, não)
revoke update on public.agencies from authenticated, anon;
grant update (name) on public.agencies to authenticated;
grant select on public.agencies, public.agency_members to authenticated;

-- Um cliente não pode ser "mudado" de agência pelo app
create or replace function public.keep_workspace_agency()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.agency_id is not null and new.agency_id is distinct from old.agency_id then
    raise exception 'A client cannot be moved to another agency.';
  end if;
  return new;
end $$;
drop trigger if exists keep_workspace_agency on public.workspaces;
create trigger keep_workspace_agency before update on public.workspaces
  for each row execute function public.keep_workspace_agency();

-- 4) Criar agência e clientes ----------------------------------------------
create or replace function public.create_agency(agency_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare ag uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if coalesce(trim(agency_name),'') = '' then raise exception 'Give your agency a name.'; end if;
  if length(trim(agency_name)) > 80 then raise exception 'Use a shorter name (up to 80 characters).'; end if;
  if exists(select 1 from public.agency_members where user_id=auth.uid() and role='owner') then
    raise exception 'You already have an agency.';
  end if;
  insert into public.agencies(name, created_by) values (trim(agency_name), auth.uid()) returning id into ag;
  insert into public.agency_members(agency_id, user_id, role) values (ag, auth.uid(), 'owner');
  delete from public.access_requests where user_id=auth.uid();
  return ag;
end $$;

-- Novo cliente: agora quem cria é a dona/admin de uma agência, e o cliente fica nessa agência
create or replace function public.create_workspace(client_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare ws uuid; ag uuid := public.my_agency();
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if ag is null then raise exception 'Create your agency first.'; end if;
  if coalesce(trim(client_name),'') = '' then raise exception 'Give the client a name.'; end if;
  if (select count(*) from public.workspaces where agency_id=ag) >= 50 then
    raise exception 'Your agency reached the limit of 50 clients.';
  end if;
  insert into public.workspaces(name, created_by, agency_id) values (trim(client_name), auth.uid(), ag) returning id into ws;
  insert into public.workspace_members(workspace_id,user_id,role) values (ws, auth.uid(), 'owner');
  return ws;
end $$;

-- 5) Pedidos de acesso: só a dona da plataforma vê (antes, qualquer dona de cliente veria) ---
create or replace function public.dismiss_request(target_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only the platform owner can manage requests.'; end if;
  delete from public.access_requests where user_id=target_user;
end $$;

create or replace function public.list_team(target_workspace uuid default null)
returns table(user_id uuid, email text, role text, since timestamptz, pending boolean)
language plpgsql stable security definer set search_path=public as $$
declare ws uuid := public.managed_workspace(target_workspace);
declare sees_requests boolean := public.is_platform_admin();
begin
  if ws is null then raise exception 'Only the client owner can manage the team.'; end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at, false
      from public.workspace_members m join auth.users u on u.id=m.user_id
     where m.workspace_id=ws
    union all
    select r.user_id, coalesce(r.email,u.email)::text, null::text, r.created_at, true
      from public.access_requests r join auth.users u on u.id=r.user_id
     where sees_requests and not exists(select 1 from public.workspace_members m2 where m2.user_id=r.user_id)
       and not exists(select 1 from public.agency_members a2 where a2.user_id=r.user_id)
    order by 5 desc, 4;
end $$;

-- Só a dona da plataforma pode puxar para um cliente alguém que ainda não é da equipe
-- (pessoas de fora entram por convite por e-mail)
create or replace function public.set_member_role(target_user uuid, new_role text, target_workspace uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare ws uuid := public.managed_workspace(target_workspace);
begin
  if ws is null then raise exception 'Only the client owner can manage the team.'; end if;
  if new_role not in ('admin','editor','approver','viewer') then raise exception 'Invalid role.'; end if;
  if target_user = auth.uid() then raise exception 'You cannot change your own access.'; end if;
  if exists(select 1 from public.workspace_members where user_id=target_user and workspace_id=ws and role='owner') then
    raise exception 'The owner''s access cannot be changed.';
  end if;
  if not exists(select 1 from public.workspace_members where user_id=target_user and workspace_id=ws)
     and not public.is_platform_admin() then
    raise exception 'Invite this person by email instead.';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role) values (ws,target_user,new_role)
  on conflict (workspace_id,user_id) do update set role=excluded.role;
  delete from public.access_requests where user_id=target_user;
end $$;

-- 6) Painel da plataforma (só números, nunca o conteúdo) -------------------
create or replace function public.platform_overview()
returns table(agency_id uuid, agency_name text, owner_email text, plan text, created_at timestamptz,
              clients bigint, people bigint, posts bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only the platform owner can see this.'; end if;
  return query
    select a.id, a.name, (select u.email::text from public.agency_members am join auth.users u on u.id=am.user_id
                          where am.agency_id=a.id and am.role='owner' order by am.created_at limit 1),
           a.plan, a.created_at,
           (select count(*) from public.workspaces w where w.agency_id=a.id),
           (select count(distinct m.user_id) from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where w.agency_id=a.id),
           (select count(*) from public.posts p join public.workspaces w on w.id=p.workspace_id where w.agency_id=a.id),
           (select max(p.created_at) from public.posts p join public.workspaces w on w.id=p.workspace_id where w.agency_id=a.id)
      from public.agencies a
     order by a.created_at desc;
end $$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.my_agency() from public, anon;
revoke all on function public.create_agency(text) from public, anon;
revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.dismiss_request(uuid) from public, anon;
revoke all on function public.list_team(uuid) from public, anon;
revoke all on function public.set_member_role(uuid,text,uuid) from public, anon;
revoke all on function public.platform_overview() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.my_agency() to authenticated;
grant execute on function public.create_agency(text) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.dismiss_request(uuid) to authenticated;
grant execute on function public.list_team(uuid) to authenticated;
grant execute on function public.set_member_role(uuid,text,uuid) to authenticated;
grant execute on function public.platform_overview() to authenticated;

-- 7) O que já existe vira a agência da Bianca ------------------------------
do $$
declare bianca uuid; ag uuid;
begin
  select id into bianca from auth.users where lower(email)='bihacosta@gmail.com';
  if bianca is null then raise exception 'Owner account not found.'; end if;
  insert into public.platform_admins(user_id) values (bianca) on conflict do nothing;
  select agency_id into ag from public.agency_members where user_id=bianca and role='owner' limit 1;
  if ag is null then
    insert into public.agencies(name, created_by) values ('Bianca Costa', bianca) returning id into ag;
    insert into public.agency_members(agency_id, user_id, role) values (ag, bianca, 'owner');
  end if;
  update public.workspaces set agency_id=ag where agency_id is null;
end $$;

alter table public.workspaces alter column agency_id set not null;
