-- QuickBite / SwiftDrop — Supabase schema (real accounts only)
-- Paste into SQL Editor and Run:
-- https://supabase.com/dashboard/project/_/sql
-- Safe to re-run: wipes demo catalog/accounts/tickets, keeps live shops and orders.

create table if not exists app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists shops (
  id text primary key,
  name text not null,
  category text,
  rating numeric,
  reviews int,
  is_open boolean default true,
  lat numeric,
  lng numeric,
  km numeric,
  emoji text,
  eta text,
  fee numeric,
  hours text,
  address text,
  image text,
  promo text
);

create table if not exists menu_items (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  name text not null,
  category text,
  price numeric not null default 0,
  is_available boolean default true,
  description text,
  image text
);

create table if not exists accounts (
  id text primary key,
  name text not null,
  phone text not null,
  email text,
  pin text,
  role text not null,
  address text,
  shop_id text,
  vehicle text,
  rating numeric
);

create table if not exists orders (
  id text primary key,
  user_id text,
  shop_id text,
  shop_name text,
  customer_name text,
  customer_phone text,
  address text,
  status text,
  total_amount numeric,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists messages (
  id text not null,
  order_id text not null,
  sender text,
  role text,
  body text,
  ts bigint,
  primary key (order_id, id)
);

alter table app_state enable row level security;
alter table shops enable row level security;
alter table menu_items enable row level security;
alter table accounts enable row level security;
alter table orders enable row level security;
alter table messages enable row level security;

drop policy if exists "app_state read" on app_state;
drop policy if exists "app_state write" on app_state;
drop policy if exists "app_state update" on app_state;
create policy "app_state read" on app_state for select using (true);
create policy "app_state write" on app_state for insert with check (true);
create policy "app_state update" on app_state for update using (true);

drop policy if exists "shops read" on shops;
drop policy if exists "shops write" on shops;
drop policy if exists "shops update" on shops;
create policy "shops read" on shops for select using (true);
create policy "shops write" on shops for insert with check (true);
create policy "shops update" on shops for update using (true);

drop policy if exists "items read" on menu_items;
drop policy if exists "items write" on menu_items;
drop policy if exists "items update" on menu_items;
create policy "items read" on menu_items for select using (true);
create policy "items write" on menu_items for insert with check (true);
create policy "items update" on menu_items for update using (true);

drop policy if exists "accounts read" on accounts;
drop policy if exists "accounts write" on accounts;
drop policy if exists "accounts update" on accounts;
create policy "accounts read" on accounts for select using (true);
create policy "accounts write" on accounts for insert with check (true);
create policy "accounts update" on accounts for update using (true);

drop policy if exists "orders read" on orders;
drop policy if exists "orders write" on orders;
drop policy if exists "orders update" on orders;
create policy "orders read" on orders for select using (true);
create policy "orders write" on orders for insert with check (true);
create policy "orders update" on orders for update using (true);

drop policy if exists "messages read" on messages;
drop policy if exists "messages write" on messages;
drop policy if exists "messages update" on messages;
create policy "messages read" on messages for select using (true);
create policy "messages write" on messages for insert with check (true);
create policy "messages update" on messages for update using (true);

grant all on table app_state, shops, menu_items, accounts, orders, messages to anon, authenticated, service_role;

create table if not exists otp_codes (
  id text primary key,
  phone text not null,
  role text not null,
  code text not null,
  body text,
  expires_at timestamptz not null,
  attempts int default 0
);
alter table otp_codes enable row level security;
drop policy if exists "otp read" on otp_codes;
drop policy if exists "otp write" on otp_codes;
drop policy if exists "otp update" on otp_codes;
drop policy if exists "otp delete" on otp_codes;
create policy "otp read" on otp_codes for select using (true);
create policy "otp write" on otp_codes for insert with check (true);
create policy "otp update" on otp_codes for update using (true);
create policy "otp delete" on otp_codes for delete using (true);
grant all on table otp_codes to anon, authenticated, service_role;

drop policy if exists "shops delete" on shops;
create policy "shops delete" on shops for delete using (true);
drop policy if exists "items delete" on menu_items;
create policy "items delete" on menu_items for delete using (true);
drop policy if exists "accounts delete" on accounts;
create policy "accounts delete" on accounts for delete using (true);
drop policy if exists "orders delete" on orders;
create policy "orders delete" on orders for delete using (true);
drop policy if exists "messages delete" on messages;
create policy "messages delete" on messages for delete using (true);

do $$ begin
  alter publication supabase_realtime add table shops;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table menu_items;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table orders;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table accounts;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Real accounts only. Wipe catalog demo shops, demo phones, leftover demo tickets.
delete from messages
where order_id in ('ORD-1001','ORD-1002','ORD-1003','ORD-1004','ORD-NONE')
   or order_id in (
     select id from orders
     where shop_id in ('SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11')
        or user_id in ('USER_1','USER_2')
        or customer_phone in ('0771234567','0771112222','0772223333','0775556666')
   );

delete from orders
where id in ('ORD-1001','ORD-1002','ORD-1003','ORD-1004','ORD-NONE')
   or shop_id in ('SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11')
   or user_id in ('USER_1','USER_2')
   or customer_phone in ('0771234567','0771112222','0772223333','0775556666');

delete from menu_items
where shop_id in ('SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11')
   or id in ('I1','I2','I3','I4','I5','I6','I7','I8','I9','I10','I11','I12','I13','I14','I15','I16','I17','I18','I19','I20','I21','I22','I23','I24','I25','I26','I27','I28','I29','I30','I31','I32','I33');

delete from shops
where id in ('SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11');

delete from accounts
where id in ('USER_1','USER_2','SHOP_STAFF','RIDER_77')
   or phone in ('0771234567','0771112222','0772223333','0775556666');

-- One phone number, one account, one role (match last 9 digits: 077… / 94…).
delete from accounts a
using accounts b
where a.ctid > b.ctid
  and right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 9)
    = right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 9)
  and length(right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 9)) = 9;

create unique index if not exists accounts_phone_uidx on accounts (phone);
create unique index if not exists accounts_phone_tail_uidx
  on accounts ((right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)))
  where length(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)) = 9;

insert into app_state (id, payload, updated_at)
values ('main', '{"shops":[],"items":[],"accounts":[],"orders":[],"messages":{},"seq":1000}'::jsonb, now())
on conflict (id) do update
set payload = excluded.payload, updated_at = now();
