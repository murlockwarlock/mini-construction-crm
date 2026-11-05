create extension if not exists pgcrypto;
create schema if not exists extensions;

create schema if not exists private;

create type public.app_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  role public.app_role not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  address text not null check (char_length(btrim(address)) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  object_id uuid not null references public.objects(id) on delete restrict,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  status public.task_status not null default 'new',
  author_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  from_status public.task_status,
  to_status public.task_status not null,
  comment text check (comment is null or char_length(comment) <= 2000),
  check (from_status is null or from_status <> to_status),
  check (from_status is not null or to_status = 'new')
);

create index tasks_object_idx on public.tasks(object_id) where deleted_at is null;
create index tasks_assignee_idx on public.tasks(assignee_id) where deleted_at is null;
create index task_history_task_created_idx on public.task_status_history(task_id, created_at, id);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.objects from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.task_status_history from anon, authenticated;
grant select on table public.profiles, public.objects, public.tasks, public.task_status_history to authenticated;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_profile()
returns public.profiles
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select p.* from public.profiles p where p.id = auth.uid(); $$;

create or replace function private.is_manager()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'::public.app_role);
$$;

create or replace function private.is_executor()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'executor'::public.app_role);
$$;

create or replace function private.readable_task(p_task_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select private.is_manager() or exists (
    select 1 from public.tasks t where t.id = p_task_id and t.assignee_id = auth.uid() and t.deleted_at is null
  );
$$;

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (
  private.is_manager() or id = auth.uid()
  or exists (select 1 from public.tasks t where t.assignee_id = auth.uid() and t.deleted_at is null and (t.assignee_id = profiles.id or t.author_id = profiles.id))
  or exists (select 1 from public.task_status_history h join public.tasks t on t.id = h.task_id where t.assignee_id = auth.uid() and t.deleted_at is null and h.actor_id = profiles.id)
);

create policy objects_select on public.objects for select to authenticated using (
  private.is_manager() or (deleted_at is null and exists (
    select 1 from public.tasks t where t.object_id = objects.id and t.assignee_id = auth.uid() and t.deleted_at is null
  ))
);

create policy tasks_select on public.tasks for select to authenticated using (
  private.is_manager() or (deleted_at is null and assignee_id = auth.uid())
);

create policy history_select on public.task_status_history for select to authenticated using (private.readable_task(task_id));

create or replace function private.create_object(p_name text, p_address text)
returns public.objects language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.objects;
begin
  if not private.is_manager() then raise exception using errcode = '42501', message = 'Недостаточно прав'; end if;
  insert into public.objects(name, address) values (btrim(p_name), btrim(p_address)) returning * into result;
  return result;
end;
$$;

create or replace function private.update_object(p_id uuid, p_name text, p_address text)
returns public.objects language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.objects;
begin
  if not private.is_manager() then raise exception using errcode = '42501', message = 'Недостаточно прав'; end if;
  update public.objects set name = btrim(p_name), address = btrim(p_address) where id = p_id and deleted_at is null returning * into result;
  if result.id is null then raise exception using errcode = 'P0002', message = 'Объект недоступен'; end if;
  return result;
end;
$$;

create or replace function private.delete_object(p_id uuid)
returns public.objects language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.objects;
begin
  if not private.is_manager() then raise exception using errcode = '42501', message = 'Недостаточно прав'; end if;
  select * into result from public.objects where id = p_id for update;
  if result.id is null or result.deleted_at is not null then raise exception using errcode = 'P0002', message = 'Объект недоступен'; end if;
  update public.objects set deleted_at = timezone('utc', now()) where id = p_id returning * into result;
  update public.tasks set deleted_at = timezone('utc', now()) where object_id = p_id and deleted_at is null;
  return result;
end;
$$;

create or replace function private.create_task(p_title text, p_description text, p_object_id uuid, p_assignee_id uuid)
returns public.tasks language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.tasks;
declare object_row public.objects;
begin
  if not private.is_manager() then raise exception using errcode = '42501', message = 'Недостаточно прав'; end if;
  select * into object_row from public.objects where id = p_object_id for update;
  if object_row.id is null or object_row.deleted_at is not null then raise exception using errcode = 'P0002', message = 'Объект недоступен'; end if;
  if not exists (select 1 from public.profiles where id = p_assignee_id and role = 'executor'::public.app_role) then raise exception using errcode = '22023', message = 'Исполнитель недоступен'; end if;
  insert into public.tasks(title, description, object_id, assignee_id, status, author_id)
  values (btrim(p_title), coalesce(p_description, ''), p_object_id, p_assignee_id, 'new', auth.uid()) returning * into result;
  insert into public.task_status_history(task_id, actor_id, from_status, to_status) values (result.id, auth.uid(), null, 'new');
  return result;
end;
$$;

create or replace function private.update_task(p_id uuid, p_title text, p_description text, p_object_id uuid, p_assignee_id uuid)
returns public.tasks language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.tasks;
declare object_row public.objects;
begin
  if not private.is_manager() then raise exception using errcode = '42501', message = 'Недостаточно прав'; end if;
  select * into object_row from public.objects where id = p_object_id for update;
  if object_row.id is null or object_row.deleted_at is not null then raise exception using errcode = 'P0002', message = 'Объект недоступен'; end if;
  if not exists (select 1 from public.profiles where id = p_assignee_id and role = 'executor'::public.app_role) then raise exception using errcode = '22023', message = 'Исполнитель недоступен'; end if;
  update public.tasks set title = btrim(p_title), description = coalesce(p_description, ''), object_id = p_object_id, assignee_id = p_assignee_id where id = p_id and deleted_at is null returning * into result;
  if result.id is null then raise exception using errcode = 'P0002', message = 'Задача недоступна'; end if;
  return result;
end;
$$;

create or replace function private.delete_task(p_id uuid)
returns public.tasks language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.tasks;
begin
  if not private.is_manager() then raise exception using errcode = '42501', message = 'Недостаточно прав'; end if;
  update public.tasks set deleted_at = timezone('utc', now()) where id = p_id and deleted_at is null returning * into result;
  if result.id is null then raise exception using errcode = 'P0002', message = 'Задача недоступна'; end if;
  return result;
end;
$$;

create or replace function private.change_task_status(p_task_id uuid, p_expected_status public.task_status, p_new_status public.task_status, p_comment text default null)
returns public.tasks language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.tasks;
declare actor_role public.app_role;
declare normalized_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role is null then raise exception using errcode = '42501', message = 'Профиль недоступен'; end if;
  select * into result from public.tasks where id = p_task_id for update;
  if result.id is null or result.deleted_at is not null then raise exception using errcode = 'P0002', message = 'Задача недоступна'; end if;
  if result.status <> p_expected_status then raise exception using errcode = '40001', message = 'Задача уже изменилась'; end if;
  if p_new_status = p_expected_status then raise exception using errcode = '22023', message = 'Недопустимый переход'; end if;
  if actor_role = 'executor' and result.assignee_id = auth.uid() and ((result.status = 'new' and p_new_status = 'in_progress') or (result.status = 'in_progress' and p_new_status = 'review') or (result.status = 'rework' and p_new_status = 'in_progress')) then
    null;
  elsif actor_role = 'manager' and result.status = 'review' and p_new_status in ('accepted', 'rework') then
    if p_new_status = 'rework' and normalized_comment is null then raise exception using errcode = '22023', message = 'Комментарий обязателен'; end if;
  else
    raise exception using errcode = '42501', message = 'Недопустимый переход';
  end if;
  update public.tasks set status = p_new_status where id = p_task_id returning * into result;
  insert into public.task_status_history(task_id, actor_id, from_status, to_status, comment) values (p_task_id, auth.uid(), p_expected_status, p_new_status, normalized_comment);
  return result;
end;
$$;

create or replace function public.create_object(p_name text, p_address text)
returns public.objects language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.create_object(p_name, p_address); $$;
create or replace function public.update_object(p_id uuid, p_name text, p_address text)
returns public.objects language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.update_object(p_id, p_name, p_address); $$;
create or replace function public.delete_object(p_id uuid)
returns public.objects language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.delete_object(p_id); $$;
create or replace function public.create_task(p_title text, p_description text, p_object_id uuid, p_assignee_id uuid)
returns public.tasks language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.create_task(p_title, p_description, p_object_id, p_assignee_id); $$;
create or replace function public.update_task(p_id uuid, p_title text, p_description text, p_object_id uuid, p_assignee_id uuid)
returns public.tasks language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.update_task(p_id, p_title, p_description, p_object_id, p_assignee_id); $$;
create or replace function public.delete_task(p_id uuid)
returns public.tasks language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.delete_task(p_id); $$;
create or replace function public.change_task_status(p_task_id uuid, p_expected_status public.task_status, p_new_status public.task_status, p_comment text default null)
returns public.tasks language sql security invoker set search_path = public, private, auth, pg_catalog
as $$ select private.change_task_status(p_task_id, p_expected_status, p_new_status, p_comment); $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_profile() to authenticated;
grant execute on function private.is_manager() to authenticated;
grant execute on function private.is_executor() to authenticated;
grant execute on function private.readable_task(uuid) to authenticated;
grant execute on function private.create_object(text, text) to authenticated;
grant execute on function private.update_object(uuid, text, text) to authenticated;
grant execute on function private.delete_object(uuid) to authenticated;
grant execute on function private.create_task(text, text, uuid, uuid) to authenticated;
grant execute on function private.update_task(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function private.delete_task(uuid) to authenticated;
grant execute on function private.change_task_status(uuid, public.task_status, public.task_status, text) to authenticated;

revoke all on function public.create_object(text, text) from public, anon;
revoke all on function public.update_object(uuid, text, text) from public, anon;
revoke all on function public.delete_object(uuid) from public, anon;
revoke all on function public.create_task(text, text, uuid, uuid) from public, anon;
revoke all on function public.update_task(uuid, text, text, uuid, uuid) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
revoke all on function public.change_task_status(uuid, public.task_status, public.task_status, text) from public, anon;
grant execute on function public.create_object(text, text) to authenticated;
grant execute on function public.update_object(uuid, text, text) to authenticated;
grant execute on function public.delete_object(uuid) to authenticated;
grant execute on function public.create_task(text, text, uuid, uuid) to authenticated;
grant execute on function public.update_task(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.change_task_status(uuid, public.task_status, public.task_status, text) to authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
