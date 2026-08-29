-- Dealflow schema (consolidated from the live project as of this migration)
-- This reflects what's already running in Supabase project ocwscdgeamejvcyxsmhy.
-- Kept here so the repo has a source of truth / can rebuild a fresh environment.

create type deal_status as enum ('searching', 'sent', 'responded', 'closed');

create table deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  business_name text not null,
  category text,
  city text,
  state text,
  rating numeric,
  status deal_status not null default 'searching',
  price numeric,
  site_url text,
  site_color text,
  phone text,
  address text,
  site_html text,
  date_sent date,
  date_closed date,
  follow_up_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  owner_id uuid,
  direction text check (direction in ('in','out')) not null,
  body text not null,
  sent_at timestamptz default now()
);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  label text not null,
  city text not null,
  state text not null,
  category text not null,
  min_rating numeric default 4.5,
  max_results int default 20,
  active boolean default true,
  created_at timestamptz default now()
);

create table prospects_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  place_id text not null,
  business_name text,
  category text,
  city text,
  state text,
  rating numeric,
  phone text,
  address text,
  status text default 'pending', -- pending / approved / rejected
  found_at timestamptz default now(),
  unique(owner_id, place_id)
);

alter table deals enable row level security;
alter table messages enable row level security;
alter table saved_searches enable row level security;
alter table prospects_queue enable row level security;

create policy "owner full access" on deals
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on messages
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on saved_searches
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on prospects_queue
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Weekly automated prospect search (requires pg_cron + pg_net extensions,
-- and the actual cron.schedule(...) call to be re-run with your service role key
-- since that key should never be committed to this repo).
create extension if not exists pg_cron;
create extension if not exists pg_net;
