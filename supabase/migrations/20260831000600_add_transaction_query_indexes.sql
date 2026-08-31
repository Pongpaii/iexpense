create index if not exists transactions_user_transaction_date_idx
on public.transactions (user_id, transaction_date desc);

create index if not exists transactions_user_type_idx
on public.transactions (user_id, type);

create index if not exists transactions_deleted_at_idx
on public.transactions (deleted_at)
where deleted_at is not null;
