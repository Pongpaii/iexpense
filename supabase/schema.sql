-- Money Flow: authenticated database setup
-- Run this file in Supabase Dashboard > SQL Editor for a new project.
--
-- This file is the BASELINE. Changes made after the baseline belong in
-- supabase/migrations/ as their own timestamped file (see the README there),
-- and should also be folded back into this file so a brand-new project still
-- gets the complete, current schema in one run.
--
-- Existing projects must first assign every legacy row to a real auth.users UUID
-- before `alter column user_id set not null` can succeed. Back up the table first.
-- Never replace these owner policies with anonymous `using (true)` policies.

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text,
  transaction_date date not null default current_date,
  client_timezone text,
  created_at timestamptz not null default now(),
  idempotency_key uuid,
  deleted_at timestamptz
);

-- Upgrade support for projects created before categories, ownership, idempotency,
-- and soft deletion were added.
alter table public.transactions add column if not exists category text;
alter table public.transactions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.transactions add column if not exists idempotency_key uuid;
alter table public.transactions add column if not exists deleted_at timestamptz;
alter table public.transactions add column if not exists client_timezone text;

alter table public.transactions alter column user_id set default auth.uid();
alter table public.transactions alter column id set generated always;

-- Declarative upper bound so a bad amount is rejected even if the trigger below
-- is ever dropped. Matches AMOUNT_MAX in src/schemas/transaction.schema.ts.
alter table public.transactions drop constraint if exists transactions_amount_max_check;
alter table public.transactions
  add constraint transactions_amount_max_check check (amount <= 999999999);

alter table public.transactions drop constraint if exists transactions_client_timezone_check;
alter table public.transactions add constraint transactions_client_timezone_check check (
  client_timezone is null
  or (
    char_length(client_timezone) between 1 and 64
    and client_timezone ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)*$'
  )
);

-- This intentionally fails if legacy rows have not been assigned to an owner.
alter table public.transactions alter column user_id set not null;
alter table public.transactions enable row level security;

-- Remove retired anonymous policies and recreate all owner policies rerunnably.
drop policy if exists "Public can read transactions" on public.transactions;
drop policy if exists "Public can create transactions" on public.transactions;
drop policy if exists "Public can update transactions" on public.transactions;
drop policy if exists "Public can delete transactions" on public.transactions;
drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can create own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;

revoke select, insert, update, delete on public.transactions from anon;
revoke delete on public.transactions from authenticated;
revoke usage, select on sequence public.transactions_id_seq from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.transactions to authenticated;
grant usage, select on sequence public.transactions_id_seq to authenticated;

-- Deleted rows stay hidden from ordinary reads. The UPDATE policy deliberately
-- remains owner-only without a deleted_at predicate so soft-delete state changes
-- are authorized; restore_transaction handles restoration of rows hidden by SELECT.
create policy "Users can read own transactions"
on public.transactions for select to authenticated
using ((select auth.uid()) = user_id and deleted_at is null);

create policy "Users can create own transactions"
on public.transactions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own transactions"
on public.transactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists transactions_user_id_idx
on public.transactions (user_id);
create index if not exists transactions_date_created_idx
on public.transactions (transaction_date desc, created_at desc);
create unique index if not exists transactions_user_id_idempotency_key_uidx
on public.transactions (user_id, idempotency_key)
where idempotency_key is not null;
create index if not exists transactions_user_transaction_date_idx
on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_type_idx
on public.transactions (user_id, type);
create index if not exists transactions_deleted_at_idx
on public.transactions (deleted_at)
where deleted_at is not null;

-- Server-side validation. RLS decides who may write a row; this trigger decides
-- whether the row itself is sane. Keep these limits in sync with the client schema.
create or replace function public.transactions_validate()
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
    raise exception 'user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  new.description := btrim(new.description);
  if new.description is null or char_length(new.description) = 0 then
    raise exception 'description must not be empty' using errcode = '23514';
  end if;
  if char_length(new.description) > 120 then
    raise exception 'description must be 120 characters or fewer' using errcode = '23514';
  end if;
  new.description := regexp_replace(new.description, '[\u0000-\u001f\u007f]', '', 'g');

  if new.amount is null or new.amount <= 0 then
    raise exception 'amount must be greater than 0' using errcode = '23514';
  end if;
  if new.amount > 999999999 then
    raise exception 'amount exceeds the allowed maximum' using errcode = '23514';
  end if;
  new.amount := round(new.amount, 2);

  if new.type not in ('income', 'expense') then
    raise exception 'type must be income or expense' using errcode = '23514';
  end if;

  if new.category is not null then
    new.category := btrim(new.category);
    if char_length(new.category) = 0 then
      new.category := null;
    elsif char_length(new.category) > 60 then
      raise exception 'category must be 60 characters or fewer' using errcode = '23514';
    end if;
  end if;

  if new.transaction_date is null then
    raise exception 'transaction_date is required' using errcode = '23514';
  end if;
  if new.transaction_date < date '1970-01-01'
     or new.transaction_date > (current_date + interval '1 year') then
    raise exception 'transaction_date is out of the allowed range' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.deleted_at := null;
  else
    new.created_at := old.created_at;
    new.id := old.id;
    new.user_id := old.user_id;
    new.client_timezone := old.client_timezone;

    if new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'idempotency_key cannot be changed' using errcode = '23514';
    end if;

    -- deleted_at is server-owned: setting any non-null value performs a soft
    -- delete at the current server time; clearing it performs a restore.
    if old.deleted_at is null and new.deleted_at is not null then
      new.deleted_at := now();
    elsif old.deleted_at is not null and new.deleted_at is not null then
      new.deleted_at := old.deleted_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_validate_trg on public.transactions;
create trigger transactions_validate_trg
before insert or update on public.transactions
for each row execute function public.transactions_validate();

-- A deleted row is intentionally invisible to SELECT RLS, which prevents a
-- normal PostgREST UPDATE from finding it. This narrowly scoped function still
-- restores by UPDATE and can only affect the authenticated caller's own row.
create or replace function public.restore_transaction(p_transaction_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_restored boolean;
begin
  if v_user_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  update public.transactions
     set deleted_at = null
   where id = p_transaction_id
     and user_id = v_user_id
     and deleted_at is not null;

  v_restored := found;
  return v_restored;
end;
$$;

revoke all on function public.restore_transaction(bigint) from public, anon;
grant execute on function public.restore_transaction(bigint) to authenticated;

create or replace function public.get_user_balance(p_user_id uuid default auth.uid())
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_balance numeric;
begin
  if v_caller_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if p_user_id is distinct from v_caller_id then
    raise exception 'cannot request another user''s balance' using errcode = '42501';
  end if;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)::numeric
    into v_balance
    from public.transactions
   where user_id = v_caller_id
     and deleted_at is null;

  return v_balance;
end;
$$;

revoke all on function public.get_user_balance(uuid) from public, anon;
grant execute on function public.get_user_balance(uuid) to authenticated;

create or replace function public.get_monthly_summary(p_user_id uuid, p_month text)
returns table(total_income numeric, total_expense numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_month_start date;
begin
  if v_caller_id is null or p_user_id is distinct from v_caller_id then
    raise exception 'cannot request another user''s summary' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'p_month must use YYYY-MM format' using errcode = '22007';
  end if;
  v_month_start := (p_month || '-01')::date;

  return query
  select coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0),
         coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0)
    from public.transactions as t
   where t.user_id = v_caller_id
     and t.transaction_date >= v_month_start
     and t.transaction_date < v_month_start + interval '1 month'
     and t.deleted_at is null;
end;
$$;

revoke all on function public.get_monthly_summary(uuid, text) from public, anon;
grant execute on function public.get_monthly_summary(uuid, text) to authenticated;

-- Remove the retired monthly budget feature when upgrading an existing project.
drop function if exists public.replace_monthly_budgets(date, jsonb);
drop table if exists public.monthly_budgets;

-- One settings row per authenticated user.
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  monthly_salary numeric(12, 2) not null default 17000
    check (monthly_salary > 0 and monthly_salary <= 100000000),
  daily_cap_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings add column if not exists monthly_salary numeric(12, 2) not null default 17000;
alter table public.user_settings add column if not exists daily_cap_json jsonb not null default '{}'::jsonb;
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

-- Achievements: one row per badge a user has unlocked.
create table if not exists public.user_achievements (
  id bigint generated by default as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  badge_id text not null check (char_length(badge_id) between 1 and 60),
  unlocked_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table public.user_achievements enable row level security;
drop policy if exists "Users can read own achievements" on public.user_achievements;
drop policy if exists "Users can create own achievements" on public.user_achievements;
drop policy if exists "Users can delete own achievements" on public.user_achievements;

revoke select, insert, update, delete on public.user_achievements from anon;
revoke usage, select on sequence public.user_achievements_id_seq from anon;
grant select, insert, delete on public.user_achievements to authenticated;
grant usage, select on sequence public.user_achievements_id_seq to authenticated;

create policy "Users can read own achievements"
on public.user_achievements for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can create own achievements"
on public.user_achievements for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can delete own achievements"
on public.user_achievements for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists user_achievements_user_id_idx
on public.user_achievements (user_id);

create or replace function public.user_achievements_validate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.user_id <> auth.uid() then
    raise exception 'user_id must match the authenticated user' using errcode = '42501';
  end if;
  new.badge_id := btrim(new.badge_id);
  if new.badge_id is null or char_length(new.badge_id) = 0 then
    raise exception 'badge_id must not be empty' using errcode = '23514';
  end if;
  new.unlocked_at := now();
  return new;
end;
$$;

drop trigger if exists user_achievements_validate_trg on public.user_achievements;
create trigger user_achievements_validate_trg
before insert on public.user_achievements
for each row execute function public.user_achievements_validate();
