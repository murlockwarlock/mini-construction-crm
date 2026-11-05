alter table public.tasks add column activity_seq bigint not null default 0 check (activity_seq >= 0);
alter table public.task_status_history add column activity_order bigint;

with ordered_history as (
  select
    id,
    row_number() over (
      partition by task_id
      order by created_at asc, case when from_status is null then 0 else 1 end asc, id asc
    )::bigint as activity_order
  from public.task_status_history
)
update public.task_status_history history
set activity_order = ordered_history.activity_order
from ordered_history
where history.id = ordered_history.id;

update public.tasks task
set activity_seq = coalesce((
  select max(history.activity_order)
  from public.task_status_history history
  where history.task_id = task.id
), 0);

alter table public.task_status_history alter column activity_order set not null;
create unique index task_history_task_activity_order_idx on public.task_status_history(task_id, activity_order);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  activity_order bigint not null check (activity_order > 0),
  body text not null check (char_length(btrim(body)) between 1 and 2000)
);

create index task_comments_task_activity_idx on public.task_comments(task_id, activity_order, created_at, id);

revoke all on table public.task_comments from anon, authenticated;
grant select on table public.task_comments to authenticated;
alter table public.task_comments enable row level security;

create policy task_comments_select on public.task_comments for select to authenticated using (
  private.readable_task(task_id)
);

create or replace function private.commentable_task(p_task_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.tasks task
    where task.id = p_task_id
      and task.deleted_at is null
      and (private.is_manager() or task.assignee_id = auth.uid())
  );
$$;

create or replace function private.create_task(p_title text, p_description text, p_object_id uuid, p_assignee_id uuid)
returns public.tasks
language plpgsql
security definer
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
  update public.tasks set activity_seq = activity_seq + 1 where id = result.id returning * into result;
  insert into public.task_status_history(task_id, actor_id, from_status, to_status, activity_order)
  values (result.id, auth.uid(), null, 'new', result.activity_seq);
  return result;
end;
$$;

create or replace function private.change_task_status(p_task_id uuid, p_expected_status public.task_status, p_new_status public.task_status, p_comment text default null)
returns public.tasks
language plpgsql
security definer
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
  update public.tasks set status = p_new_status, activity_seq = activity_seq + 1 where id = p_task_id returning * into result;
  insert into public.task_status_history(task_id, actor_id, from_status, to_status, comment, activity_order)
  values (p_task_id, auth.uid(), p_expected_status, p_new_status, normalized_comment, result.activity_seq);
  return result;
end;
$$;

create or replace function private.add_task_comment(p_task_id uuid, p_body text)
returns public.task_comments
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.task_comments;
declare normalized_body text := nullif(btrim(coalesce(p_body, '')), '');
declare next_order bigint;
begin
  if normalized_body is null or char_length(normalized_body) > 2000 then raise exception using errcode = '22023', message = 'Комментарий должен содержать от 1 до 2000 символов'; end if;
  if not private.commentable_task(p_task_id) then raise exception using errcode = '42501', message = 'Комментарий недоступен'; end if;
  update public.tasks set activity_seq = activity_seq + 1 where id = p_task_id and deleted_at is null returning activity_seq into next_order;
  if next_order is null then raise exception using errcode = 'P0002', message = 'Комментарий недоступен'; end if;
  insert into public.task_comments(task_id, author_id, body, activity_order)
  values (p_task_id, auth.uid(), normalized_body, next_order)
  returning * into result;
  return result;
end;
$$;

create or replace function public.add_task_comment(p_task_id uuid, p_body text)
returns public.task_comments
language sql
security invoker
set search_path = public, private, auth, pg_catalog
as $$ select private.add_task_comment(p_task_id, p_body); $$;

revoke execute on function private.commentable_task(uuid) from public, anon, authenticated;
revoke execute on function private.add_task_comment(uuid, text) from public, anon, authenticated;
grant execute on function private.commentable_task(uuid) to authenticated;
grant execute on function private.add_task_comment(uuid, text) to authenticated;
revoke execute on function public.add_task_comment(uuid, text) from public, anon;
grant execute on function public.add_task_comment(uuid, text) to authenticated;
