-- Açaí Carioca Studio: publication date compatibility fix
-- Run once in Supabase SQL Editor.
-- The app stores dates in publish_date. If an earlier troubleshooting step
-- created a separate "date" column, copy those values across without overwriting
-- any existing publish_date values.

alter table public.posts
  add column if not exists publish_date date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'date'
  ) then
    execute 'update public.posts set publish_date = "date" where publish_date is null and "date" is not null';
  end if;
end $$;

notify pgrst, 'reload schema';
