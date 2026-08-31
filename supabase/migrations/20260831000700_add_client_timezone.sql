alter table public.transactions
add column if not exists client_timezone text;

alter table public.transactions
drop constraint if exists transactions_client_timezone_check;
alter table public.transactions
add constraint transactions_client_timezone_check check (
  client_timezone is null
  or (
    char_length(client_timezone) between 1 and 64
    and client_timezone ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)*$'
  )
);

-- The existing validation trigger remains strict; timezone is an optional,
-- client-recorded IANA identifier protected by the declarative check above.
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
    new.client_timezone := old.client_timezone;
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
