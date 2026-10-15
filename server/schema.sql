-- Supabase (free Postgres). Run once in SQL Editor:
-- https://supabase.com/dashboard/project/_/sql

create table if not exists app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table app_state enable row level security;

drop policy if exists "app_state read" on app_state;
drop policy if exists "app_state write" on app_state;
drop policy if exists "app_state update" on app_state;

create policy "app_state read" on app_state for select using (true);
create policy "app_state write" on app_state for insert with check (true);
create policy "app_state update" on app_state for update using (true);

insert into app_state (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
