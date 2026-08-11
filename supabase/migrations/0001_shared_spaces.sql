-- Money Flow: shared spaces (แชร์ข้อมูลชุดเดียวกันหลายอีเมล)
--
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor หลังจากรัน supabase/schema.sql แล้ว
-- สคริปต์นี้เปลี่ยนเกณฑ์ของ Row Level Security จาก "เจ้าของแถว" เป็น "สมาชิกของ space"
-- สำรองตาราง public.transactions ก่อนรันบนข้อมูลจริง
--
-- สิ่งที่จะเกิดขึ้น
--   1. สร้างตาราง spaces / space_members
--   2. เพิ่มคอลัมน์ transactions.space_id แล้วย้ายข้อมูลเดิมเข้ากระเป๋าส่วนตัวของแต่ละ user
--   3. เปลี่ยน policy ของ transactions ให้ยึดตามสมาชิกของ space
--   4. เพิ่มฟังก์ชันสำหรับสร้าง / เข้าร่วม / สลับ space ด้วยรหัสเชิญ

-- ── 1. ฟังก์ชันสร้างรหัสเชิญ ────────────────────────────────────────────────
-- ใช้ gen_random_uuid() ที่มีมาให้ในตัว จึงไม่ต้องพึ่ง extension ใด ๆ
create or replace function public.generate_invite_code()
returns text
language sql
volatile
set search_path = public
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- ── 2. ตาราง ────────────────────────────────────────────────────────────────
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'กระเป๋าเงินของฉัน' check (char_length(name) between 1 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('owner', 'member')),
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_members_user_idx on public.space_members (user_id);

alter table public.transactions
add column if not exists space_id uuid references public.spaces(id) on delete cascade;

create index if not exists transactions_space_date_idx
on public.transactions (space_id, transaction_date desc, created_at desc);

-- ── 3. ตรวจสมาชิก (security definer เพื่อไม่ให้ policy เรียกวนซ้ำตัวเอง) ────
create or replace function public.is_space_member(target_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members
    where space_id = target_space
      and user_id = auth.uid()
  );
$$;

-- ── 4. ย้ายข้อมูลเดิมเข้ากระเป๋าส่วนตัวของเจ้าของแถว ─────────────────────────
do $$
declare
  legacy record;
  new_space uuid;
begin
  for legacy in
    select distinct user_id
    from public.transactions
    where space_id is null
  loop
    select m.space_id
      into new_space
    from public.space_members m
    join public.spaces s on s.id = m.space_id
    where m.user_id = legacy.user_id
      and s.owner_id = legacy.user_id
    order by m.joined_at
    limit 1;

    if new_space is null then
      insert into public.spaces (owner_id)
      values (legacy.user_id)
      returning id into new_space;

      insert into public.space_members (space_id, user_id, role, is_active)
      values (new_space, legacy.user_id, 'owner', true)
      on conflict (space_id, user_id) do nothing;
    end if;

    update public.transactions
    set space_id = new_space
    where user_id = legacy.user_id
      and space_id is null;
  end loop;
end $$;

-- ล้มเหลวโดยเจตนาถ้ายังมีแถวที่ไม่มี space เพื่อไม่ให้ข้อมูลหลุดจากทุก policy
alter table public.transactions
alter column space_id set not null;

-- ── 5. ฟังก์ชันจัดการ space ─────────────────────────────────────────────────
-- คืน space ที่ใช้งานอยู่ ถ้ายังไม่มีจะสร้างกระเป๋าส่วนตัวให้อัตโนมัติ
create or replace function public.ensure_active_space()
returns table (
  space_id uuid,
  space_name text,
  invite_code text,
  member_role text,
  is_owner boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uemail text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  target uuid;
begin
  if uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนใช้งาน space';
  end if;

  select m.space_id into target
  from public.space_members m
  where m.user_id = uid
    and m.is_active
  order by m.joined_at desc
  limit 1;

  if target is null then
    select m.space_id into target
    from public.space_members m
    where m.user_id = uid
    order by m.joined_at desc
    limit 1;
  end if;

  if target is null then
    insert into public.spaces (owner_id)
    values (uid)
    returning id into target;

    insert into public.space_members (space_id, user_id, email, role, is_active)
    values (target, uid, uemail, 'owner', true);
  else
    update public.space_members m
    set email = coalesce(uemail, m.email),
        is_active = (m.space_id = target)
    where m.user_id = uid;
  end if;

  return query
  select s.id, s.name, s.invite_code, m.role, s.owner_id = uid
  from public.spaces s
  join public.space_members m on m.space_id = s.id and m.user_id = uid
  where s.id = target;
end $$;

-- เข้าร่วม space ของคนอื่นด้วยรหัสเชิญ แล้วตั้งเป็น space ที่ใช้งานอยู่
create or replace function public.join_space_with_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uemail text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  target uuid;
begin
  if uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนเข้าร่วม space';
  end if;

  select id into target
  from public.spaces
  where invite_code = upper(trim(code));

  if target is null then
    raise exception 'รหัสเชิญไม่ถูกต้องหรือถูกเปลี่ยนไปแล้ว';
  end if;

  insert into public.space_members (space_id, user_id, email, role, is_active)
  values (target, uid, uemail, 'member', true)
  on conflict (space_id, user_id)
  do update set is_active = true, email = coalesce(uemail, space_members.email);

  update public.space_members
  set is_active = false
  where user_id = uid
    and space_id <> target;

  return target;
end $$;

-- สลับกลับไปใช้ space อื่นที่ตัวเองเป็นสมาชิกอยู่แล้ว
create or replace function public.set_active_space(target_space uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนสลับ space';
  end if;

  if not exists (
    select 1 from public.space_members
    where user_id = uid and space_id = target_space
  ) then
    raise exception 'คุณไม่ได้เป็นสมาชิกของ space นี้';
  end if;

  update public.space_members
  set is_active = (space_id = target_space)
  where user_id = uid;

  return target_space;
end $$;

-- เจ้าของ space ออกรหัสเชิญใหม่ (ยกเลิกรหัสเดิมทันที)
create or replace function public.rotate_space_invite_code(target_space uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  next_code text;
begin
  if uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (
    select 1 from public.spaces
    where id = target_space and owner_id = uid
  ) then
    raise exception 'เฉพาะเจ้าของ space เท่านั้นที่ออกรหัสใหม่ได้';
  end if;

  update public.spaces
  set invite_code = public.generate_invite_code()
  where id = target_space
  returning invite_code into next_code;

  return next_code;
end $$;

-- ── 6. Row Level Security ───────────────────────────────────────────────────
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

drop policy if exists "Members can read their spaces" on public.spaces;
drop policy if exists "Owners can rename their space" on public.spaces;
drop policy if exists "Members can read space members" on public.space_members;
drop policy if exists "Members can leave a space" on public.space_members;

create policy "Members can read their spaces"
on public.spaces for select
to authenticated
using (public.is_space_member(id));

create policy "Owners can rename their space"
on public.spaces for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Members can read space members"
on public.space_members for select
to authenticated
using (public.is_space_member(space_id));

create policy "Members can leave a space"
on public.space_members for delete
to authenticated
using (user_id = (select auth.uid()));

-- policy เดิมที่ยึดเจ้าของแถว ใช้แทนด้วยเกณฑ์สมาชิก space
drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can create own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;

drop policy if exists "Space members can read transactions" on public.transactions;
drop policy if exists "Space members can create transactions" on public.transactions;
drop policy if exists "Space members can update transactions" on public.transactions;
drop policy if exists "Space members can delete transactions" on public.transactions;

create policy "Space members can read transactions"
on public.transactions for select
to authenticated
using (public.is_space_member(space_id));

-- บันทึกใหม่ต้องอยู่ใน space ที่ตัวเองเป็นสมาชิก และต้องเซ็นชื่อว่าใครบันทึก
create policy "Space members can create transactions"
on public.transactions for insert
to authenticated
with check (
  public.is_space_member(space_id)
  and user_id = (select auth.uid())
);

create policy "Space members can update transactions"
on public.transactions for update
to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

create policy "Space members can delete transactions"
on public.transactions for delete
to authenticated
using (public.is_space_member(space_id));

-- ── 7. สิทธิ์ ───────────────────────────────────────────────────────────────
revoke all on public.spaces from anon;
revoke all on public.space_members from anon;
revoke all on function public.generate_invite_code() from public, anon;
revoke all on function public.is_space_member(uuid) from public, anon;
revoke all on function public.ensure_active_space() from public, anon;
revoke all on function public.join_space_with_code(text) from public, anon;
revoke all on function public.set_active_space(uuid) from public, anon;
revoke all on function public.rotate_space_invite_code(uuid) from public, anon;

grant select, update on public.spaces to authenticated;
grant select, delete on public.space_members to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.ensure_active_space() to authenticated;
grant execute on function public.join_space_with_code(text) to authenticated;
grant execute on function public.set_active_space(uuid) to authenticated;
grant execute on function public.rotate_space_invite_code(uuid) to authenticated;
