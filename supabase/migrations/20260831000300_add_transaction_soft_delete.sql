alter table public.transactions
add column if not exists deleted_at timestamptz;

drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;
revoke delete on public.transactions from authenticated;

create policy "Users can read own transactions"
on public.transactions for select to authenticated
using ((select auth.uid()) = user_id and deleted_at is null);

-- Do not add deleted_at to UPDATE USING: owners must remain authorized to change
-- soft-delete state. Hidden rows are restored through the narrowly scoped RPC below.
create policy "Users can update own transactions"
on public.transactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Preserve all validation and make deleted_at a server-owned timestamp.
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
  if new.user_id is null then new.user_id := auth.uid(); end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'user_id must match the authenticated user' using errcode = '42501';
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
    if char_length(new.category) = 0 then new.category := null;
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
    if new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'idempotency_key cannot be changed' using errcode = '23514';
    end if;
    if old.deleted_at is null and new.deleted_at is not null then
      new.deleted_at := now();
    elsif old.deleted_at is not null and new.deleted_at is not null then
      new.deleted_at := old.deleted_at;
    end if;
  end if;
  return new;
end;
$$;

-- SELECT RLS intentionally hides deleted rows, so this owner-checked function is
-- the safe path that can locate a hidden row and restore it through UPDATE.
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
