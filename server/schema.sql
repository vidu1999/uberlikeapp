-- QuickBite / SwiftDrop — Supabase schema + DEMO DATA
-- Paste into SQL Editor and Run:
-- https://supabase.com/dashboard/project/_/sql
-- Safe to re-run: fills an empty database, does not wipe live orders.

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

-- Demo snapshot (shops, items, accounts, orders). Only fills empty app_state.
insert into app_state (id, payload, updated_at)
values ('main', $qb${"shops":[{"id":"SHOP_1","name":"Kandy Bakers","category":"Bakery","rating":4.8,"reviews":120,"isOpen":true,"lat":8.3514,"lng":80.3988,"km":2.5,"emoji":"🎂","eta":"20–35 min","fee":200,"hours":"08:00 AM – 10:00 PM","address":"Main Street, Anuradhapura","image":"/img/shop-bakery.jpg","promo":"Buy 1, Get 1 Free"},{"id":"SHOP_2","name":"Burger King","category":"Fast Food","rating":4.6,"reviews":98,"isOpen":true,"lat":8.358,"lng":80.428,"km":3.2,"emoji":"🍔","eta":"25–40 min","fee":200,"hours":"10:00 AM – 11:00 PM","address":"New Town, Anuradhapura","image":"/img/shop-burger.jpg"},{"id":"SHOP_3","name":"Pizza Hut","category":"Pizza","rating":4.5,"reviews":76,"isOpen":true,"lat":8.365,"lng":80.438,"km":4.1,"emoji":"🍕","eta":"30–45 min","fee":200,"hours":"11:00 AM – 11:00 PM","address":"Stage 1, Anuradhapura","image":"/img/shop-pizza.jpg"},{"id":"SHOP_4","name":"Coffee Lab","category":"Coffee","rating":4.7,"reviews":210,"isOpen":true,"lat":8.341,"lng":80.405,"km":1.8,"emoji":"☕","eta":"15–25 min","fee":200,"hours":"07:00 AM – 08:00 PM","address":"Sacred City, Anuradhapura","image":"/img/shop-coffee.jpg"},{"id":"SHOP_11","name":"Ceylon Tea House","category":"Beverages","rating":4.4,"reviews":52,"isOpen":true,"lat":8.348,"lng":80.419,"km":3.6,"emoji":"🍵","eta":"18–28 min","fee":200,"hours":"08:00 AM – 09:00 PM","address":"Lake Road, Anuradhapura","image":"/img/iced-coffee.jpg"},{"id":"SHOP_5","name":"Rice & Curry","category":"Sri Lankan","rating":4.9,"reviews":1024,"isOpen":true,"lat":8.338,"lng":80.418,"km":2.1,"emoji":"🍛","eta":"22–35 min","fee":200,"hours":"11:00 AM – 03:00 PM","address":"Old Town, Anuradhapura","image":"/img/shop-curry.jpg"},{"id":"SHOP_6","name":"Sweet Palace","category":"Dessert","rating":4.4,"reviews":156,"isOpen":true,"lat":8.329,"lng":80.399,"km":3,"emoji":"🧁","eta":"18–30 min","fee":200,"hours":"09:00 AM – 09:00 PM","address":"Mihintale Road","image":"/img/shop-dessert.jpg"},{"id":"SHOP_7","name":"Street Burger SL","category":"Fast Food","rating":4.6,"reviews":430,"isOpen":true,"lat":8.346,"lng":80.422,"km":2.8,"emoji":"🍔","eta":"20–30 min","fee":200,"hours":"11:00 AM – 11:00 PM","address":"New Town","image":"/img/shop-burger.jpg"},{"id":"SHOP_8","name":"Hopper House","category":"Sri Lankan","rating":4.8,"reviews":670,"isOpen":true,"lat":8.332,"lng":80.412,"km":1.4,"emoji":"🥞","eta":"18–28 min","fee":200,"hours":"07:00 AM – 10:00 PM","address":"Market Road","image":"/img/shop-hoppers.jpg"},{"id":"SHOP_9","name":"Dragon Noodles","category":"Chinese","rating":4.3,"reviews":290,"isOpen":true,"lat":8.372,"lng":80.425,"km":4.6,"emoji":"🍜","eta":"30–45 min","fee":200,"hours":"11:00 AM – 10:00 PM","address":"Stage 2","image":"/img/shop-noodles.jpg"},{"id":"SHOP_10","name":"Fresh Mart","category":"Grocery","rating":4.5,"reviews":1200,"isOpen":true,"lat":8.325,"lng":80.408,"km":2.2,"emoji":"🛒","eta":"25–40 min","fee":0,"hours":"08:00 AM – 09:00 PM","address":"Bus Stand","image":"/img/shop-grocery.jpg"}],"items":[{"id":"I1","shopId":"SHOP_1","name":"Chocolate Cake 1kg","category":"Cakes","price":2500,"isAvailable":true,"desc":"Rich ganache, serves 8","image":"/img/cake-chocolate.jpg"},{"id":"I27","shopId":"SHOP_1","name":"Vanilla Cake 1kg","category":"Cakes","price":2200,"isAvailable":true,"desc":"Soft vanilla sponge","image":"/img/cake-vanilla.jpg"},{"id":"I28","shopId":"SHOP_1","name":"Red Velvet Cake 1kg","category":"Cakes","price":2800,"isAvailable":true,"desc":"Cream cheese frosting","image":"/img/cake-redvelvet.jpg"},{"id":"I29","shopId":"SHOP_1","name":"Cup Cake (6 pcs)","category":"Cakes","price":1200,"isAvailable":true,"desc":"Assorted cupcakes","image":"/img/shop-bakery.jpg"},{"id":"I30","shopId":"SHOP_1","name":"Cheese Cake","category":"Cakes","price":2200,"isAvailable":true,"desc":"Baked New York style","image":"/img/cake-vanilla.jpg"},{"id":"I2","shopId":"SHOP_1","name":"Butter Cake Slice","category":"Cakes","price":350,"isAvailable":true,"desc":"Warm vanilla butter cake","image":"/img/cake-vanilla.jpg"},{"id":"I31","shopId":"SHOP_1","name":"Cookies (6 pcs)","category":"Pastries","price":800,"isAvailable":true,"desc":"Chocolate chip cookies","image":"/img/cookies.jpg"},{"id":"I3","shopId":"SHOP_1","name":"Fish Bun","category":"Breads","price":180,"isAvailable":true,"desc":"Spicy fish filling","image":"/img/shop-bakery.jpg"},{"id":"I4","shopId":"SHOP_1","name":"Egg Roll","category":"Breads","price":220,"isAvailable":true,"desc":"Crispy pastry roll","image":"/img/shop-bakery.jpg"},{"id":"I32","shopId":"SHOP_1","name":"Iced Coffee","category":"Drinks","price":600,"isAvailable":true,"desc":"Cold brew, milk, ice","image":"/img/iced-coffee.jpg"},{"id":"I5","shopId":"SHOP_2","name":"Chicken Burger","category":"Burgers","price":1200,"isAvailable":true,"desc":"Crispy fillet, cheese, slaw","image":"/img/shop-burger.jpg"},{"id":"I6","shopId":"SHOP_2","name":"Cheese Fries","category":"Burgers","price":700,"isAvailable":true,"desc":"Loaded cheddar fries","image":"/img/shop-burger.jpg"},{"id":"I7","shopId":"SHOP_2","name":"Beef Burger","category":"Burgers","price":1450,"isAvailable":true,"desc":"Double patty, BBQ sauce","image":"/img/shop-burger.jpg"},{"id":"I8","shopId":"SHOP_3","name":"Cheese Pizza","category":"Pizza","price":2400,"isAvailable":true,"desc":"12\" mozzarella classic","image":"/img/shop-pizza.jpg"},{"id":"I9","shopId":"SHOP_3","name":"Devilled Chicken Pizza","category":"Pizza","price":2800,"isAvailable":true,"desc":"Sri Lankan spicy chicken","image":"/img/shop-pizza.jpg"},{"id":"I10","shopId":"SHOP_4","name":"Iced Coffee","category":"Beverages","price":600,"isAvailable":true,"desc":"Cold brew, milk, ice","image":"/img/iced-coffee.jpg"},{"id":"I11","shopId":"SHOP_4","name":"Cappuccino","category":"Beverages","price":550,"isAvailable":true,"desc":"Double shot, foam art","image":"/img/shop-coffee.jpg"},{"id":"I33","shopId":"SHOP_11","name":"Ceylon Iced Tea","category":"Beverages","price":450,"isAvailable":true,"desc":"Hill-country black tea, ice","image":"/img/iced-coffee.jpg"},{"id":"I12","shopId":"SHOP_5","name":"Chicken Rice & Curry","category":"Sri Lankan","price":850,"isAvailable":true,"desc":"4 curries + papadam","image":"/img/shop-curry.jpg"},{"id":"I13","shopId":"SHOP_5","name":"Kottu Roti","category":"Sri Lankan","price":950,"isAvailable":true,"desc":"Chicken kottu, egg","image":"/img/kottu.jpg"},{"id":"I14","shopId":"SHOP_5","name":"Hoppers (3)","category":"Sri Lankan","price":400,"isAvailable":true,"desc":"Plain hoppers, lunu miris","image":"/img/shop-hoppers.jpg"},{"id":"I15","shopId":"SHOP_5","name":"Pol Sambol Rice","category":"Sri Lankan","price":650,"isAvailable":true,"desc":"Coconut sambol + dhal","image":"/img/shop-curry.jpg"},{"id":"I16","shopId":"SHOP_6","name":"Watalappan","category":"Dessert","price":450,"isAvailable":true,"desc":"Jaggery coconut pudding","image":"/img/shop-dessert.jpg"},{"id":"I17","shopId":"SHOP_6","name":"Chocolate Mousse","category":"Dessert","price":520,"isAvailable":true,"desc":"Dark chocolate cup","image":"/img/cake-chocolate.jpg"},{"id":"I18","shopId":"SHOP_7","name":"Street Smash Burger","category":"Fast Food","price":990,"isAvailable":true,"desc":"Smashed beef, pickles, sauce","image":"/img/shop-burger.jpg"},{"id":"I19","shopId":"SHOP_7","name":"Loaded Fries","category":"Fast Food","price":650,"isAvailable":true,"desc":"Cheese, chilli, mayo","image":"/img/shop-burger.jpg"},{"id":"I20","shopId":"SHOP_8","name":"Egg Hopper (2)","category":"Sri Lankan","price":480,"isAvailable":true,"desc":"Crispy edge, runny yolk","image":"/img/shop-hoppers.jpg"},{"id":"I21","shopId":"SHOP_8","name":"String Hoppers & Curry","category":"Sri Lankan","price":720,"isAvailable":true,"desc":"Chicken curry, pol sambol","image":"/img/shop-hoppers.jpg"},{"id":"I22","shopId":"SHOP_9","name":"Devilled Noodles","category":"Chinese","price":1100,"isAvailable":true,"desc":"Wok-tossed, extra chilli","image":"/img/shop-noodles.jpg"},{"id":"I23","shopId":"SHOP_9","name":"Chicken Fried Rice","category":"Chinese","price":950,"isAvailable":true,"desc":"Egg, spring onion","image":"/img/shop-noodles.jpg"},{"id":"I24","shopId":"SHOP_10","name":"Fresh Milk 1L","category":"Grocery","price":420,"isAvailable":true,"desc":"Chilled full cream","image":"/img/shop-grocery.jpg"},{"id":"I25","shopId":"SHOP_10","name":"Banana (1kg)","category":"Grocery","price":280,"isAvailable":true,"desc":"Embul bananas","image":"/img/shop-grocery.jpg"},{"id":"I26","shopId":"SHOP_10","name":"White Bread","category":"Grocery","price":190,"isAvailable":true,"desc":"Fresh morning loaf","image":"/img/shop-grocery.jpg"}],"accounts":[{"id":"USER_1","name":"Vidura K Jayathilake","phone":"0771234567","email":"vidurakavindadev@gmail.com","pin":"1234","role":"customer","address":"No.123, Lake View Road, Anuradhapura"},{"id":"USER_2","name":"Nimal Silva","phone":"0771112222","email":"nimal@example.com","pin":"1234","role":"customer","address":"Stage 1, Anuradhapura"},{"id":"SHOP_STAFF","name":"Nadeesha Fernando","phone":"0772223333","email":"shop@kandybakers.lk","pin":"1234","role":"shop","shopId":"SHOP_1"},{"id":"RIDER_77","name":"Kamal Perera","phone":"0775556666","email":"kamal@quickbite.lk","pin":"1234","role":"rider","vehicle":"Honda Dio · WP CAB-4521","rating":4.9}],"orders":[],"messages":{},"seq":1000}$qb$::jsonb, now())
on conflict (id) do update
set payload = excluded.payload, updated_at = now()
where jsonb_typeof(app_state.payload->'shops') is distinct from 'array'
   or jsonb_array_length(coalesce(app_state.payload->'shops', '[]'::jsonb)) = 0;

insert into shops (id, name, category, rating, reviews, is_open, lat, lng, km, emoji, eta, fee, hours, address, image, promo)
values
  ('SHOP_1', 'Kandy Bakers', 'Bakery', 4.8, 120, true, 8.3514, 80.3988, 2.5, '🎂', '20–35 min', 200, '08:00 AM – 10:00 PM', 'Main Street, Anuradhapura', '/img/shop-bakery.jpg', 'Buy 1, Get 1 Free'),
  ('SHOP_2', 'Burger King', 'Fast Food', 4.6, 98, true, 8.358, 80.428, 3.2, '🍔', '25–40 min', 200, '10:00 AM – 11:00 PM', 'New Town, Anuradhapura', '/img/shop-burger.jpg', null),
  ('SHOP_3', 'Pizza Hut', 'Pizza', 4.5, 76, true, 8.365, 80.438, 4.1, '🍕', '30–45 min', 200, '11:00 AM – 11:00 PM', 'Stage 1, Anuradhapura', '/img/shop-pizza.jpg', null),
  ('SHOP_4', 'Coffee Lab', 'Coffee', 4.7, 210, true, 8.341, 80.405, 1.8, '☕', '15–25 min', 200, '07:00 AM – 08:00 PM', 'Sacred City, Anuradhapura', '/img/shop-coffee.jpg', null),
  ('SHOP_11', 'Ceylon Tea House', 'Beverages', 4.4, 52, true, 8.348, 80.419, 3.6, '🍵', '18–28 min', 200, '08:00 AM – 09:00 PM', 'Lake Road, Anuradhapura', '/img/iced-coffee.jpg', null),
  ('SHOP_5', 'Rice & Curry', 'Sri Lankan', 4.9, 1024, true, 8.338, 80.418, 2.1, '🍛', '22–35 min', 200, '11:00 AM – 03:00 PM', 'Old Town, Anuradhapura', '/img/shop-curry.jpg', null),
  ('SHOP_6', 'Sweet Palace', 'Dessert', 4.4, 156, true, 8.329, 80.399, 3, '🧁', '18–30 min', 200, '09:00 AM – 09:00 PM', 'Mihintale Road', '/img/shop-dessert.jpg', null),
  ('SHOP_7', 'Street Burger SL', 'Fast Food', 4.6, 430, true, 8.346, 80.422, 2.8, '🍔', '20–30 min', 200, '11:00 AM – 11:00 PM', 'New Town', '/img/shop-burger.jpg', null),
  ('SHOP_8', 'Hopper House', 'Sri Lankan', 4.8, 670, true, 8.332, 80.412, 1.4, '🥞', '18–28 min', 200, '07:00 AM – 10:00 PM', 'Market Road', '/img/shop-hoppers.jpg', null),
  ('SHOP_9', 'Dragon Noodles', 'Chinese', 4.3, 290, true, 8.372, 80.425, 4.6, '🍜', '30–45 min', 200, '11:00 AM – 10:00 PM', 'Stage 2', '/img/shop-noodles.jpg', null),
  ('SHOP_10', 'Fresh Mart', 'Grocery', 4.5, 1200, true, 8.325, 80.408, 2.2, '🛒', '25–40 min', 0, '08:00 AM – 09:00 PM', 'Bus Stand', '/img/shop-grocery.jpg', null)
on conflict (id) do nothing;

insert into menu_items (id, shop_id, name, category, price, is_available, description, image)
values
  ('I1', 'SHOP_1', 'Chocolate Cake 1kg', 'Cakes', 2500, true, 'Rich ganache, serves 8', '/img/cake-chocolate.jpg'),
  ('I27', 'SHOP_1', 'Vanilla Cake 1kg', 'Cakes', 2200, true, 'Soft vanilla sponge', '/img/cake-vanilla.jpg'),
  ('I28', 'SHOP_1', 'Red Velvet Cake 1kg', 'Cakes', 2800, true, 'Cream cheese frosting', '/img/cake-redvelvet.jpg'),
  ('I29', 'SHOP_1', 'Cup Cake (6 pcs)', 'Cakes', 1200, true, 'Assorted cupcakes', '/img/shop-bakery.jpg'),
  ('I30', 'SHOP_1', 'Cheese Cake', 'Cakes', 2200, true, 'Baked New York style', '/img/cake-vanilla.jpg'),
  ('I2', 'SHOP_1', 'Butter Cake Slice', 'Cakes', 350, true, 'Warm vanilla butter cake', '/img/cake-vanilla.jpg'),
  ('I31', 'SHOP_1', 'Cookies (6 pcs)', 'Pastries', 800, true, 'Chocolate chip cookies', '/img/cookies.jpg'),
  ('I3', 'SHOP_1', 'Fish Bun', 'Breads', 180, true, 'Spicy fish filling', '/img/shop-bakery.jpg'),
  ('I4', 'SHOP_1', 'Egg Roll', 'Breads', 220, true, 'Crispy pastry roll', '/img/shop-bakery.jpg'),
  ('I32', 'SHOP_1', 'Iced Coffee', 'Drinks', 600, true, 'Cold brew, milk, ice', '/img/iced-coffee.jpg'),
  ('I5', 'SHOP_2', 'Chicken Burger', 'Burgers', 1200, true, 'Crispy fillet, cheese, slaw', '/img/shop-burger.jpg'),
  ('I6', 'SHOP_2', 'Cheese Fries', 'Burgers', 700, true, 'Loaded cheddar fries', '/img/shop-burger.jpg'),
  ('I7', 'SHOP_2', 'Beef Burger', 'Burgers', 1450, true, 'Double patty, BBQ sauce', '/img/shop-burger.jpg'),
  ('I8', 'SHOP_3', 'Cheese Pizza', 'Pizza', 2400, true, '12" mozzarella classic', '/img/shop-pizza.jpg'),
  ('I9', 'SHOP_3', 'Devilled Chicken Pizza', 'Pizza', 2800, true, 'Sri Lankan spicy chicken', '/img/shop-pizza.jpg'),
  ('I10', 'SHOP_4', 'Iced Coffee', 'Beverages', 600, true, 'Cold brew, milk, ice', '/img/iced-coffee.jpg'),
  ('I11', 'SHOP_4', 'Cappuccino', 'Beverages', 550, true, 'Double shot, foam art', '/img/shop-coffee.jpg'),
  ('I33', 'SHOP_11', 'Ceylon Iced Tea', 'Beverages', 450, true, 'Hill-country black tea, ice', '/img/iced-coffee.jpg'),
  ('I12', 'SHOP_5', 'Chicken Rice & Curry', 'Sri Lankan', 850, true, '4 curries + papadam', '/img/shop-curry.jpg'),
  ('I13', 'SHOP_5', 'Kottu Roti', 'Sri Lankan', 950, true, 'Chicken kottu, egg', '/img/kottu.jpg'),
  ('I14', 'SHOP_5', 'Hoppers (3)', 'Sri Lankan', 400, true, 'Plain hoppers, lunu miris', '/img/shop-hoppers.jpg'),
  ('I15', 'SHOP_5', 'Pol Sambol Rice', 'Sri Lankan', 650, true, 'Coconut sambol + dhal', '/img/shop-curry.jpg'),
  ('I16', 'SHOP_6', 'Watalappan', 'Dessert', 450, true, 'Jaggery coconut pudding', '/img/shop-dessert.jpg'),
  ('I17', 'SHOP_6', 'Chocolate Mousse', 'Dessert', 520, true, 'Dark chocolate cup', '/img/cake-chocolate.jpg'),
  ('I18', 'SHOP_7', 'Street Smash Burger', 'Fast Food', 990, true, 'Smashed beef, pickles, sauce', '/img/shop-burger.jpg'),
  ('I19', 'SHOP_7', 'Loaded Fries', 'Fast Food', 650, true, 'Cheese, chilli, mayo', '/img/shop-burger.jpg'),
  ('I20', 'SHOP_8', 'Egg Hopper (2)', 'Sri Lankan', 480, true, 'Crispy edge, runny yolk', '/img/shop-hoppers.jpg'),
  ('I21', 'SHOP_8', 'String Hoppers & Curry', 'Sri Lankan', 720, true, 'Chicken curry, pol sambol', '/img/shop-hoppers.jpg'),
  ('I22', 'SHOP_9', 'Devilled Noodles', 'Chinese', 1100, true, 'Wok-tossed, extra chilli', '/img/shop-noodles.jpg'),
  ('I23', 'SHOP_9', 'Chicken Fried Rice', 'Chinese', 950, true, 'Egg, spring onion', '/img/shop-noodles.jpg'),
  ('I24', 'SHOP_10', 'Fresh Milk 1L', 'Grocery', 420, true, 'Chilled full cream', '/img/shop-grocery.jpg'),
  ('I25', 'SHOP_10', 'Banana (1kg)', 'Grocery', 280, true, 'Embul bananas', '/img/shop-grocery.jpg'),
  ('I26', 'SHOP_10', 'White Bread', 'Grocery', 190, true, 'Fresh morning loaf', '/img/shop-grocery.jpg')
on conflict (id) do nothing;

insert into accounts (id, name, phone, email, pin, role, address, shop_id, vehicle, rating)
values
  ('USER_1', 'Vidura K Jayathilake', '0771234567', 'vidurakavindadev@gmail.com', '1234', 'customer', 'No.123, Lake View Road, Anuradhapura', null, null, null),
  ('USER_2', 'Nimal Silva', '0771112222', 'nimal@example.com', '1234', 'customer', 'Stage 1, Anuradhapura', null, null, null),
  ('SHOP_STAFF', 'Nadeesha Fernando', '0772223333', 'shop@kandybakers.lk', '1234', 'shop', null, 'SHOP_1', null, null),
  ('RIDER_77', 'Kamal Perera', '0775556666', 'kamal@quickbite.lk', '1234', 'rider', null, null, 'Honda Dio · WP CAB-4521', 4.9)
on conflict (id) do nothing;

-- live orders are created by the User app (no demo tickets)
-- live orders are created by the User app (no demo tickets)

