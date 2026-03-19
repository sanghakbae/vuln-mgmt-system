create table if not exists public.assets (
  id bigint generated always as identity primary key,
  asset_code text not null unique,
  asset_type text default 'ETC',
  hostname text,
  ip_address text,
  os_version text,
  related_service text,
  purpose text,
  location text,
  department text,
  owner_name text,
  manager_name text,
  confidentiality int not null,
  integrity int not null,
  availability int not null,
  criticality_score int not null,
  criticality_grade text not null,
  status text default '운영',
  registered_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.assets
  add column if not exists asset_type text default 'ETC';
