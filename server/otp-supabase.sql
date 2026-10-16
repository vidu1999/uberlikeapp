-- QuickBite OTP (run once in Supabase SQL Editor)
-- https://supabase.com/dashboard/project/ofbirobpstnzlriwscwu/sql

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
