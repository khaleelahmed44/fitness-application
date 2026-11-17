-- =====================================================================
-- v2: notebook-format register (S.No, Vehicle No, Document, Date of Entry,
-- District, Traffic Station, Name) + owner/inspector/admin edit & delete rules.
-- Run AFTER 001_init.sql. Existing rows are carried over; the v1 table is
-- kept as public.vehicles_v1_backup (no API access).
-- =====================================================================

drop trigger if exists vehicles_before_update on public.vehicles;
drop policy if exists "vehicles_select_operator_pending" on public.vehicles;
drop policy if exists "vehicles_select_inspector_all" on public.vehicles;
drop policy if exists "vehicles_insert_pending" on public.vehicles;
drop policy if exists "vehicles_update_inspector" on public.vehicles;
drop index if exists public.vehicles_status_created_idx;
drop index if exists public.vehicles_certificate_no_key;
drop index if exists public.vehicles_one_pending_per_plate;
drop index if exists public.vehicles_registration_idx;
drop function if exists public.vehicles_before_update();
alter table public.vehicles rename constraint vehicles_pkey to vehicles_v1_backup_pkey;
alter table public.vehicles rename to vehicles_v1_backup;
revoke all on public.vehicles_v1_backup from anon, authenticated;

create table public.vehicles (
  id                            bigint generated always as identity primary key,           -- S.No
  registration_no               text not null check (length(btrim(registration_no)) between 1 and 50),
  document_status               text not null default 'No' check (document_status in ('Yes', 'No')),
  date_of_entry                 date not null default ((now() at time zone 'Asia/Karachi')::date),
  district                      text check (district is null or length(district) <= 80),
  traffic_station               text check (traffic_station is null or length(traffic_station) <= 80),
  collected_by_or_operator_name text not null default '' check (length(collected_by_or_operator_name) <= 80),
  status                        text not null default 'pending' check (status in ('pending', 'passed')),
  certificate_no                text,
  created_by                    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at                    timestamptz not null default now(),
  verified_by                   uuid references auth.users(id) on delete set null,
  verified_by_name              text,
  verified_at                   timestamptz
);

create index vehicles_status_id_idx on public.vehicles (status, id desc);
create index vehicles_date_idx on public.vehicles (date_of_entry);
create unique index vehicles_certificate_no_key on public.vehicles (certificate_no) where certificate_no is not null;
create unique index vehicles_one_pending_per_plate on public.vehicles (upper(registration_no)) where status = 'pending';

insert into public.vehicles
  (registration_no, document_status, date_of_entry, collected_by_or_operator_name, status,
   certificate_no, created_by, created_at, verified_by, verified_by_name, verified_at)
select registration_no,
       case when documents_status = 'Verified' then 'Yes' else 'No' end,
       (created_at at time zone 'Asia/Karachi')::date,
       coalesce((select coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = v.created_by), ''),
       status, certificate_no, created_by, created_at, inspected_by, inspector_name, inspected_at
from public.vehicles_v1_backup v
where status in ('pending', 'passed')
order by created_at;

create or replace function public.vehicles_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registration_no := upper(regexp_replace(btrim(new.registration_no), '\s+', ' ', 'g'));
  new.district := nullif(regexp_replace(btrim(coalesce(new.district, '')), '\s+', ' ', 'g'), '');
  new.traffic_station := nullif(regexp_replace(btrim(coalesce(new.traffic_station, '')), '\s+', ' ', 'g'), '');
  new.collected_by_or_operator_name := regexp_replace(btrim(coalesce(new.collected_by_or_operator_name, '')), '\s+', ' ', 'g');
  if new.collected_by_or_operator_name = '' then
    select coalesce(nullif(full_name, ''), email) into new.collected_by_or_operator_name
    from public.profiles where id = coalesce(new.created_by, auth.uid());
    new.collected_by_or_operator_name := coalesce(new.collected_by_or_operator_name, '');
  end if;
  return new;
end;
$$;
create trigger vehicles_before_insert before insert on public.vehicles
  for each row execute function public.vehicles_before_insert();

create or replace function public.vehicles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.app_role();
  v_name text;
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.date_of_entry := old.date_of_entry;

  new.registration_no := upper(regexp_replace(btrim(new.registration_no), '\s+', ' ', 'g'));
  new.district := nullif(regexp_replace(btrim(coalesce(new.district, '')), '\s+', ' ', 'g'), '');
  new.traffic_station := nullif(regexp_replace(btrim(coalesce(new.traffic_station, '')), '\s+', ' ', 'g'), '');
  new.collected_by_or_operator_name := regexp_replace(btrim(coalesce(new.collected_by_or_operator_name, '')), '\s+', ' ', 'g');
  if new.collected_by_or_operator_name = '' then
    new.collected_by_or_operator_name := old.collected_by_or_operator_name;
  end if;

  if old.status = 'pending' and new.status = 'passed' then
    if v_role not in ('inspector', 'admin') then
      raise exception 'Only inspectors or admins can verify a vehicle';
    end if;
    if new.document_status <> 'Yes' then
      raise exception 'Original documents must be submitted (Yes) before verification';
    end if;
    select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
    new.verified_by := auth.uid();
    new.verified_by_name := v_name;
    new.verified_at := now();
    new.certificate_no := 'CERT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.certificate_seq')::text, 5, '0');
  elsif new.status is distinct from old.status then
    raise exception 'Status cannot be changed from % to %', old.status, new.status;
  else
    new.certificate_no := old.certificate_no;
    new.verified_by := old.verified_by;
    new.verified_by_name := old.verified_by_name;
    new.verified_at := old.verified_at;
  end if;

  if new.status = 'passed' and new.document_status <> 'Yes' then
    raise exception 'A verified record must keep Document = Yes';
  end if;
  return new;
end;
$$;
create trigger vehicles_guard before update on public.vehicles
  for each row execute function public.vehicles_guard();

alter table public.vehicles enable row level security;

create policy "vehicles_select_signed_in" on public.vehicles
  for select to authenticated
  using (public.app_role() is not null);

create policy "vehicles_insert_own_pending" on public.vehicles
  for insert to authenticated
  with check (
    public.app_role() is not null
    and status = 'pending'
    and certificate_no is null
    and verified_by is null and verified_by_name is null and verified_at is null
    and created_by = auth.uid()
  );

-- Edit / delete: admin | pending: creator or inspector | verified: the inspector who verified it
create policy "vehicles_update_authorised" on public.vehicles
  for update to authenticated
  using (
    public.app_role() = 'admin'
    or (status = 'pending' and (created_by = auth.uid() or public.app_role() = 'inspector'))
    or (status = 'passed' and verified_by = auth.uid())
  )
  with check (
    public.app_role() = 'admin'
    or (status = 'pending' and (created_by = auth.uid() or public.app_role() = 'inspector'))
    or (status = 'passed' and verified_by = auth.uid())
  );

create policy "vehicles_delete_authorised" on public.vehicles
  for delete to authenticated
  using (
    public.app_role() = 'admin'
    or (status = 'pending' and (created_by = auth.uid() or public.app_role() = 'inspector'))
    or (status = 'passed' and verified_by = auth.uid())
  );

revoke all on public.vehicles from anon;
grant select, insert, update, delete on public.vehicles to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.vehicles;
exception when duplicate_object or undefined_object then
  null;
end $$;
