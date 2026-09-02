-- งบประมาณรายหมวดต่อเดือน
--
-- เก็บใน user_settings เพราะเป็นค่าตั้งค่าของผู้ใช้ ไม่ใช่ข้อมูลธุรกรรม
-- และผูกกับ user_id เดิมอยู่แล้ว จึงได้ RLS ชุดเดียวกันโดยไม่ต้องเพิ่มตาราง
--
-- รูปแบบ: [{"category": "อาหาร", "budget": 5000}, ...]
-- ไม่มีฟิลด์เดือน = งบนี้ใช้ทุกเดือน (เทียบกับยอดจ่ายจริงของเดือนที่ผู้ใช้เลือกดู)

alter table public.user_settings
add column if not exists category_budgets_json jsonb not null default '[]'::jsonb;

-- โครงระดับนอกเช็คด้วย constraint ได้ ส่วนโครงของแต่ละ element ต้องใช้ trigger
-- เพราะ check constraint ใช้ subquery ไม่ได้
alter table public.user_settings
  drop constraint if exists user_settings_category_budgets_valid;
alter table public.user_settings
  add constraint user_settings_category_budgets_valid
  check (
    jsonb_typeof(category_budgets_json) = 'array'
    and jsonb_array_length(category_budgets_json) <= 20
  );

-- ต่อยอดจาก trigger เดิม เพิ่มการตรวจ element ของ category_budgets_json
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

  if new.category_budgets_json is null then
    new.category_budgets_json := '[]'::jsonb;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.category_budgets_json) as entry
    where jsonb_typeof(entry) <> 'object'
      or jsonb_typeof(entry -> 'category') <> 'string'
      or char_length(entry ->> 'category') not between 1 and 40
      or jsonb_typeof(entry -> 'budget') <> 'number'
      or (entry ->> 'budget')::numeric <= 0
      or (entry ->> 'budget')::numeric > 100000000
  ) then
    raise exception 'category_budgets_json contains an invalid entry' using errcode = '23514';
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
