create table if not exists public.workflow_confirmations (
  step_key text primary key,
  is_confirmed boolean not null default false,
  confirmed_by_email text,
  confirmed_by_user_id uuid,
  confirmed_at timestamptz,
  last_changed_by_email text,
  last_changed_by_user_id uuid,
  updated_at timestamptz not null default now(),
  constraint workflow_confirmations_step_key_check
    check (step_key in ('assets', 'checklist', 'inspection', 'inspectionResult', 'vuln'))
);

insert into public.workflow_confirmations (step_key, is_confirmed, updated_at)
values
  ('assets', false, now()),
  ('checklist', false, now()),
  ('inspection', false, now()),
  ('inspectionResult', false, now()),
  ('vuln', false, now())
on conflict (step_key) do nothing;

alter table public.workflow_confirmations enable row level security;

drop policy if exists "workflow_confirmations_read_authenticated" on public.workflow_confirmations;
create policy "workflow_confirmations_read_authenticated"
on public.workflow_confirmations
for select
to authenticated
using (true);

drop policy if exists "workflow_confirmations_write_authenticated" on public.workflow_confirmations;
create policy "workflow_confirmations_write_authenticated"
on public.workflow_confirmations
for insert
to authenticated
with check (true);

drop policy if exists "workflow_confirmations_update_authenticated" on public.workflow_confirmations;
create policy "workflow_confirmations_update_authenticated"
on public.workflow_confirmations
for update
to authenticated
using (true)
with check (true);
