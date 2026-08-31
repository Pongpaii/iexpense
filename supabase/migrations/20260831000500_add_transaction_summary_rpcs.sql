create or replace function public.get_user_balance(p_user_id uuid default auth.uid())
returns numeric
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_balance numeric;
begin
  if v_caller_id is null or p_user_id is distinct from v_caller_id then
    raise exception 'cannot request another user''s balance' using errcode = '42501';
  end if;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_balance
    from public.transactions
   where user_id = v_caller_id and deleted_at is null;
  return v_balance;
end;
$$;

revoke all on function public.get_user_balance(uuid) from public, anon;
grant execute on function public.get_user_balance(uuid) to authenticated;

create or replace function public.get_monthly_summary(p_user_id uuid, p_month text)
returns table(total_income numeric, total_expense numeric)
language plpgsql stable security invoker set search_path = ''
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
