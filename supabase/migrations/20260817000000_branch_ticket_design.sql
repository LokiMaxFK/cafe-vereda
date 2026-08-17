create table public.branch_settings (
  key text primary key check (key = 'ticket_design'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_profiles(id)
);

alter table public.branch_settings enable row level security;

create policy "authenticated read branch settings"
  on public.branch_settings for select to authenticated using (true);

create policy "managers create branch settings"
  on public.branch_settings for insert to authenticated
  with check (private.is_manager());

create policy "managers update branch settings"
  on public.branch_settings for update to authenticated
  using (private.is_manager())
  with check (private.is_manager());

grant select, insert, update on public.branch_settings to authenticated;
