create table if not exists public.app_data (
  key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

drop policy if exists "server can manage app data" on public.app_data;

create policy "server can manage app data"
on public.app_data
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
