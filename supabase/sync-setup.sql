-- sync-setup.sql
-- شغّلي هذا الملف مرة واحدة في: Supabase → SQL Editor → New query → Run
-- لا يحتاج أيّ إعداد آخر في لوحة Supabase.

create table if not exists public.mawhiba_attempts (
  code        text        not null,
  attempt_id  text        not null,
  payload     jsonb       not null,
  finished_at timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (code, attempt_id)
);

create index if not exists mawhiba_attempts_code_idx
  on public.mawhiba_attempts (code, finished_at);

-- لا سياسات = لا وصول مباشر من العميل إطلاقاً.
-- كل الوصول يمرّ عبر الدالتين أدناه، وكلتاهما تشترط معرفة رمز المزامنة.
alter table public.mawhiba_attempts enable row level security;
revoke all on table public.mawhiba_attempts from anon, authenticated;

-- سحب محاولات رمز معيّن -------------------------------------------------
create or replace function public.mawhiba_pull(p_code text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or length(p_code) <> 12 then
    raise exception 'invalid code';
  end if;
  return query
    select payload
    from mawhiba_attempts
    where code = p_code
    order by finished_at
    limit 500;
end;
$$;

-- دفع محاولات جديدة ------------------------------------------------------
create or replace function public.mawhiba_push(p_code text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_code is null or length(p_code) <> 12 then
    raise exception 'invalid code';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'invalid payload';
  end if;
  if (select count(*) from mawhiba_attempts where code = p_code) > 2000 then
    raise exception 'quota exceeded';
  end if;

  insert into mawhiba_attempts (code, attempt_id, payload, finished_at)
  select p_code,
         r ->> 'id',
         r,
         coalesce((r ->> 'finishedAt')::timestamptz, now())
  from jsonb_array_elements(p_rows) r
  where r ->> 'id' is not null
  on conflict (code, attempt_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mawhiba_pull(text) from public;
revoke all on function public.mawhiba_push(text, jsonb) from public;
grant execute on function public.mawhiba_pull(text) to anon, authenticated;
grant execute on function public.mawhiba_push(text, jsonb) to anon, authenticated;
