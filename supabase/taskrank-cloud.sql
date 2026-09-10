-- Run this once in Supabase: SQL Editor > New query > Run.
-- The rank remains derived in the app from active_task_ids; it is not stored per task.

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  done boolean not null default false,
  created_at timestamptz not null,
  completed_at timestamptz,
  constraint completed_tasks_have_timestamp check ((done and completed_at is not null) or (not done and completed_at is null))
);

create table if not exists public.task_lists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_task_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.task_lists enable row level security;

create policy "Users manage their own tasks" on public.tasks
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users manage their own task order" on public.task_lists
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Enables prompt updates from another signed-in device. If these tables are already
-- in the publication, Supabase will report that harmlessly.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_lists;
