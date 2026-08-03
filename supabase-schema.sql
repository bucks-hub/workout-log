-- Workout Log Database Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Categories table (muscle groups)
create table categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- Exercises table (equipment/movements)
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid not null references categories(id) on delete cascade,
  name         text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, name)
);

-- Sessions table (one per training day)
create table sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  date           date not null,
  body_weight    numeric,
  sleep_hours    numeric,
  sleep_quality  int check (sleep_quality between 1 and 10),
  energy         int check (energy between 1 and 10),
  created_at     timestamptz not null default now(),
  unique (user_id, date)
);

-- Sets table (individual set logs)
create table sets (
  id           uuid primary key,               -- client-generated, for idempotent sync
  user_id      uuid not null references auth.users(id) on delete cascade,
  session_id   uuid not null references sessions(id) on delete cascade,
  exercise_id  uuid not null references exercises(id) on delete cascade,
  set_number   int not null,
  weight       numeric not null check (weight > 0),
  reps         int not null check (reps > 0),
  created_at   timestamptz not null default now()
);

-- Indexes for performance
create index sets_session_idx  on sets(session_id);
create index sets_exercise_idx on sets(exercise_id);
create index sessions_user_date_idx on sessions(user_id, date desc);

-- Enable Row Level Security
alter table categories enable row level security;
alter table exercises  enable row level security;
alter table sessions   enable row level security;
alter table sets       enable row level security;

-- RLS Policies: Users can only access their own data
create policy "own categories" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own exercises" on exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sessions" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sets" on sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
