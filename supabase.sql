-- Run once in Supabase SQL editor
create table if not exists public.workspaces (
  id text primary key,
  tabs jsonb not null default '[]'::jsonb,
  writer text,
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
-- Anyone who knows a workspace id can read/write it (the id is the secret).
create policy "ws select" on public.workspaces for select using (true);
create policy "ws insert" on public.workspaces for insert with check (true);
create policy "ws update" on public.workspaces for update using (true);
alter publication supabase_realtime add table public.workspaces;
