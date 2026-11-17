-- =====================================================================
-- Vehicle Fitness Inspection System — Supabase migration
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------- 1. Profiles (one row per auth user, holds the role) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'operator'
              check (role in ('operator', 'inspector', 'admin')),
  created_at  timestamptz not null default now()
);

-- Auto-create a profile (role = operator) whenever someone signs up.
-- Roles can only be raised by an admin / SQL (see README), never by the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookup used by RLS policies. SECURITY DEFINER so it bypasses RLS on
-- profiles (avoids recursive policy evaluation).
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------- 2. Vehicles ----------
create sequence if not exists public.certificate_seq start 1;

create table if not exists public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  registration_no  text not null check (length(trim(registration_no)) > 0),
  chassis_no       text not null check (length(trim(chassis_no)) > 0),
  engine_no        text not null check (length(trim(engine_no)) > 0),
  documents_status text not null default 'Pending'
                   check (documents_status in ('Verified', 'Pending')),
  status           text not null default 'pending'
                   check (status in ('pending', 'passed', 'failed')),
  inspector_name   text,
  certificate_no   text,
  remarks          text,
  created_at       timestamptz not null default now(),
  -- audit columns
  created_by       uuid default auth.uid() references auth.users(id),
  inspected_by     uuid references auth.users(id),
  inspected_at     timestamptz
);

-- Indexes
create index if not exists vehicles_status_created_idx
  on public.vehicles (status, created_at desc);
create unique index if not exists vehicles_certificate_no_key
  on public.vehicles (certificate_no) where certificate_no is not null;
-- Stop the same plate being queued twice while still pending
create unique index if not exists vehicles_one_pending_per_plate
  on public.vehicles (upper(registration_no)) where status = 'pending';
create index if not exists vehicles_registration_idx
  on public.vehicles (upper(registration_no));

-- ---------- 3. Server-side guard: certificate + inspector name are generated
--              in the database, so a client can never forge them ----------
create or replace function public.vehicles_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if app_role() not in ('inspector', 'admin') then
    raise exception 'Only inspectors or admins can update vehicle records';
  end if;

  if old.status <> 'pending' then
    raise exception 'This record is finalised (%) and can no longer be changed', old.status;
  end if;

  -- Identity fields are immutable once entered
  new.id              := old.id;
  new.registration_no := old.registration_no;
  new.chassis_no      := old.chassis_no;
  new.engine_no       := old.engine_no;
  new.created_at      := old.created_at;
  new.created_by      := old.created_by;

  -- Still pending (e.g. inspector toggled documents_status or edited remarks)
  if new.status = 'pending' then
    new.certificate_no := null;
    new.inspector_name := null;
    new.inspected_by   := null;
    new.inspected_at   := null;
    return new;
  end if;

  select coalesce(nullif(full_name, ''), email) into v_name
  from public.profiles where id = auth.uid();

  new.inspector_name := v_name;
  new.inspected_by   := auth.uid();
  new.inspected_at   := now();

  if new.status = 'passed' then
    if new.documents_status <> 'Verified' then
      raise exception 'Documents must be Verified before a vehicle can pass';
    end if;
    new.certificate_no :=
      'CERT-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.certificate_seq')::text, 5, '0');
  elsif new.status = 'failed' then
    if coalesce(trim(new.remarks), '') = '' then
      raise exception 'Remarks (failure reason) are required when failing a vehicle';
    end if;
    new.certificate_no := null;
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_before_update on public.vehicles;
create trigger vehicles_before_update
  before update on public.vehicles
  for each row execute function public.vehicles_before_update();

-- ---------- 4. Row-Level Security ----------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;

-- profiles: read your own; admins read all. No client-side writes at all.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.app_role() = 'admin');

-- vehicles --------------------------------------------------------------
drop policy if exists "vehicles_select_operator_pending" on public.vehicles;
drop policy if exists "vehicles_select_inspector_all"    on public.vehicles;
drop policy if exists "vehicles_insert_pending"          on public.vehicles;
drop policy if exists "vehicles_update_inspector"        on public.vehicles;

-- Operators: view the pending queue only
create policy "vehicles_select_operator_pending" on public.vehicles
  for select to authenticated
  using (public.app_role() = 'operator' and status = 'pending');

-- Inspectors / Admins: view everything
create policy "vehicles_select_inspector_all" on public.vehicles
  for select to authenticated
  using (public.app_role() in ('inspector', 'admin'));

-- Everyone with a role can insert, but ONLY as a clean pending record
create policy "vehicles_insert_pending" on public.vehicles
  for insert to authenticated
  with check (
    public.app_role() in ('operator', 'inspector', 'admin')
    and status = 'pending'
    and certificate_no is null
    and inspector_name is null
    and inspected_by is null
    and created_by = auth.uid()
  );

-- Inspectors / Admins: update pending rows (pass / fail / remarks)
create policy "vehicles_update_inspector" on public.vehicles
  for update to authenticated
  using (public.app_role() in ('inspector', 'admin') and status = 'pending')
  with check (public.app_role() in ('inspector', 'admin'));

-- No DELETE policy => nobody can delete records through the API (audit trail).

-- ---------- 5. Privileges ----------
revoke all on public.vehicles, public.profiles from anon;
grant select, insert, update on public.vehicles to authenticated;
grant select on public.profiles to authenticated;

-- =====================================================================
-- Promote a user to inspector / admin (run in SQL editor after they sign up):
--   update public.profiles set role = 'inspector', full_name = 'Inspector Ali'
--   where email = 'ali@example.com';
-- =====================================================================
