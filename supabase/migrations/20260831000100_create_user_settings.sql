-- One owner-scoped settings row per authenticated user.
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  monthly_salary numeric(12, 2) not null default 17000
    check (monthly_salary > 0 and monthly_salary <= 100000000),
  daily_cap_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings
add column if not exists monthly_salary numeric(12, 2) not null default 17000;
alter table public.user_settings
add column if not exists daily_cap_json jsonb not null default '{}'::jsonb;
alter table public.user_settings drop constraint if exists user_settings_monthly_salary_check;
alter table public.user_settings add constraint user_settings_monthly_salary_check
  check (monthly_salary > 0 and monthly_salary <= 100000000);

alter table public.user_settings enable row level security;

drop policy if exists "Users can read own settings" on public.user_settings;
drop policy if exists "Users can create own settings" on public.user_settings;
drop policy if exists "Users can update own settings" on public.user_settings;
drop policy if exists "Users can delete own settings" on public.user_settings;

revoke select, insert, update, delete on public.user_settings from anon;
revoke delete on public.user_settings from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.user_settings to authenticated;

create policy "Users can read own settings"
on public.user_settings for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own settings"
on public.user_settings for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own settings"
on public.user_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.user_settings_validate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'user_id must match the authenticated user' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_validate_trg on public.user_settings;
create trigger user_settings_validate_trg
before insert or update on public.user_settings
for each row execute function public.user_settings_validate();
