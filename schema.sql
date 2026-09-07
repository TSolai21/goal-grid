-- Enable UUID extension just in case it isn't enabled
create extension if not exists "uuid-ossp";

-- Create the goals table
create table public.goals (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    start_date date not null,
    end_date date not null,
    created_at timestamptz default now()
);

-- Create the goal_day_checkins table
create table public.goal_day_checkins (
    id uuid primary key default uuid_generate_v4(),
    goal_id uuid not null references public.goals(id) on delete cascade,
    checkin_date date not null,
    completed boolean default false,
    created_at timestamptz default now(),
    -- Ensure a goal can only have one check-in per day
    constraint unique_goal_checkin unique (goal_id, checkin_date)
);

-- Set up Row Level Security (RLS) for testing purposes
-- Since this is an unauthenticated client application right now, we will allow anonymous access.
-- WARNING: For production, you should implement authentication and restrict policies.

alter table public.goals enable row level security;
alter table public.goal_day_checkins enable row level security;

-- Policy to allow anonymous read and insert/update for goals
create policy "Allow anonymous access to goals" 
on public.goals 
for all 
using (true)
with check (true);

-- Policy to allow anonymous read and insert/update for checkins
create policy "Allow anonymous access to goal_day_checkins" 
on public.goal_day_checkins 
for all 
using (true)
with check (true);
