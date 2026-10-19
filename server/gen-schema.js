#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const seed = require('./seed');

function sqlStr(v) {
  if (v == null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function jsonLit(obj) {
  return "$qb$" + JSON.stringify(obj) + "$qb$::jsonb";
}

const snap = seed.fullSnapshot();

const shopRows = seed.shops
  .map((s) => {
    return `  (${sqlStr(s.id)}, ${sqlStr(s.name)}, ${sqlStr(s.category)}, ${s.rating}, ${s.reviews}, ${s.isOpen ? 'true' : 'false'}, ${s.lat}, ${s.lng}, ${s.km}, ${sqlStr(s.emoji)}, ${sqlStr(s.eta)}, ${s.fee}, ${sqlStr(s.hours)}, ${sqlStr(s.address)}, ${sqlStr(s.image)}, ${sqlStr(s.promo || null)})`;
  })
  .join(',\n');

const itemRows = seed.items
  .map((i) => {
    return `  (${sqlStr(i.id)}, ${sqlStr(i.shopId)}, ${sqlStr(i.name)}, ${sqlStr(i.category)}, ${i.price}, ${i.isAvailable ? 'true' : 'false'}, ${sqlStr(i.desc)}, ${sqlStr(i.image || null)})`;
  })
  .join(',\n');

const accountRows = seed.accounts
  .map((a) => {
    return `  (${sqlStr(a.id)}, ${sqlStr(a.name)}, ${sqlStr(a.phone)}, ${sqlStr(a.email || null)}, ${sqlStr(a.pin)}, ${sqlStr(a.role)}, ${sqlStr(a.address || null)}, ${sqlStr(a.shopId || null)}, ${sqlStr(a.vehicle || null)}, ${a.rating != null ? a.rating : 'null'})`;
  })
  .join(',\n');

const orderRows = snap.orders
  .map((o) => {
    return `  (${sqlStr(o.id)}, ${sqlStr(o.userId)}, ${sqlStr(o.shopId)}, ${sqlStr(o.shopName)}, ${sqlStr(o.customerName)}, ${sqlStr(o.customerPhone)}, ${sqlStr(o.address)}, ${sqlStr(o.status)}, ${o.totalAmount}, ${jsonLit(o)})`;
  })
  .join(',\n');

const msgRows = [];
for (const [orderId, list] of Object.entries(snap.messages)) {
  for (const m of list) {
    msgRows.push(
      `  (${sqlStr(m.id)}, ${sqlStr(orderId)}, ${sqlStr(m.from)}, ${sqlStr(m.role)}, ${sqlStr(m.text)}, ${m.ts})`,
    );
  }
}

const sql = `-- QuickBite / SwiftDrop — Supabase schema (real accounts only)
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

-- Empty snapshot. No demo catalog.
insert into app_state (id, payload, updated_at)
values ('main', ${jsonLit(snap)}, now())
on conflict (id) do update
set payload = excluded.payload, updated_at = now()
where jsonb_typeof(app_state.payload->'shops') is distinct from 'array'
   or jsonb_array_length(coalesce(app_state.payload->'shops', '[]'::jsonb)) = 0;

insert into shops (id, name, category, rating, reviews, is_open, lat, lng, km, emoji, eta, fee, hours, address, image, promo)
values
${shopRows}
on conflict (id) do nothing;

insert into menu_items (id, shop_id, name, category, price, is_available, description, image)
values
${itemRows}
on conflict (id) do nothing;

insert into accounts (id, name, phone, email, pin, role, address, shop_id, vehicle, rating)
values
${accountRows}
on conflict (id) do nothing;

insert into orders (id, user_id, shop_id, shop_name, customer_name, customer_phone, address, status, total_amount, data)
values
${orderRows}
on conflict (id) do nothing;

insert into messages (id, order_id, sender, role, body, ts)
values
${msgRows.join(',\n')}
on conflict (order_id, id) do nothing;
`;

const out = path.join(__dirname, 'schema.sql');
fs.writeFileSync(out, sql);
console.log('wrote', out, 'shops', seed.shops.length, 'items', seed.items.length, 'orders', snap.orders.length);
