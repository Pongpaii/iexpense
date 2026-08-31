-- Prevent clients from choosing transaction primary keys. SET GENERATED ALWAYS
-- is safe to repeat and preserves the existing sequence and values.
alter table public.transactions
alter column id set generated always;
