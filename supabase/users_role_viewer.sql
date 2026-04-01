-- users.role 에 viewer 권한을 추가하고 기본 권한을 viewer 로 맞춘다.
-- Supabase SQL Editor 에서 1회 실행한다.

do $$
declare
  role_constraint record;
begin
  for role_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = con.connamespace
    where nsp.nspname = 'public'
      and rel.relname = 'users'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.users drop constraint %I', role_constraint.conname);
  end loop;
end $$;

alter table public.users
  alter column role drop default;

update public.users
set role = 'viewer'
where role is null;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'auditor', 'user', 'viewer'));

alter table public.users
  alter column role set default 'viewer';
