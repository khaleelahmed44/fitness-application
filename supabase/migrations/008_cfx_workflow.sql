-- CFX workflow: draft (assistant working queue) -> pending (inspector verification queue) -> passed (verified).
-- Records are tracked by a unique Jumper No (token) - NOT by vehicle number, so a vehicle can come back
-- on a later visit with a new jumper without being merged into its history.

-- 1. status: add 'draft' (default for new entries)
alter table public.vehicles drop constraint if exists vehicles_status_check1;
alter table public.vehicles drop constraint if exists vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check check (status in ('draft', 'pending', 'passed'));
alter table public.vehicles alter column status set default 'draft';

-- 2. jumper_no (unique token number per visit)
alter table public.vehicles add column if not exists jumper_no text;
update public.vehicles set jumper_no = 'J-' || lpad(id::text, 5, '0') where jumper_no is null;
alter table public.vehicles alter column jumper_no set not null;
alter table public.vehicles drop constraint if exists vehicles_jumper_no_len;
alter table public.vehicles add constraint vehicles_jumper_no_len check (length(btrim(jumper_no)) between 1 and 50);
create unique index if not exists vehicles_jumper_no_key on public.vehicles (upper(jumper_no));

-- vehicle number is no longer unique per queue; keep it searchable only
drop index if exists public.vehicles_one_pending_per_plate;
create index if not exists vehicles_reg_idx on public.vehicles (upper(registration_no));

alter table public.vehicles_trash add column if not exists jumper_no text;
update public.vehicles_trash set jumper_no = 'J-' || lpad(id::text, 5, '0') where jumper_no is null;

-- 3. insert normalisation: jumper + collected-by are mandatory
create or replace function public.vehicles_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registration_no := upper(regexp_replace(btrim(new.registration_no), '\s+', ' ', 'g'));
  new.jumper_no := upper(regexp_replace(btrim(coalesce(new.jumper_no, '')), '\s+', ' ', 'g'));
  if new.jumper_no = '' then raise exception 'Jumper No is required'; end if;
  new.document_status := regexp_replace(btrim(coalesce(new.document_status, '')), '\s+', ' ', 'g');
  new.district := nullif(regexp_replace(btrim(coalesce(new.district, '')), '\s+', ' ', 'g'), '');
  new.traffic_station := nullif(regexp_replace(btrim(coalesce(new.traffic_station, '')), '\s+', ' ', 'g'), '');
  new.collected_by_or_operator_name := regexp_replace(btrim(coalesce(new.collected_by_or_operator_name, '')), '\s+', ' ', 'g');
  if new.collected_by_or_operator_name = '' then
    select coalesce(nullif(full_name, ''), email) into new.collected_by_or_operator_name
    from public.profiles where id = coalesce(new.created_by, auth.uid());
    new.collected_by_or_operator_name := coalesce(new.collected_by_or_operator_name, '');
  end if;
  if new.collected_by_or_operator_name = '' then raise exception 'Collected By is required'; end if;
  return new;
end;
$$;

-- 4. update guard with the three-stage workflow
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
  new.jumper_no := upper(regexp_replace(btrim(coalesce(new.jumper_no, '')), '\s+', ' ', 'g'));
  if new.jumper_no = '' then raise exception 'Jumper No is required'; end if;
  new.document_status := regexp_replace(btrim(coalesce(new.document_status, '')), '\s+', ' ', 'g');
  new.district := nullif(regexp_replace(btrim(coalesce(new.district, '')), '\s+', ' ', 'g'), '');
  new.traffic_station := nullif(regexp_replace(btrim(coalesce(new.traffic_station, '')), '\s+', ' ', 'g'), '');
  new.collected_by_or_operator_name := regexp_replace(btrim(coalesce(new.collected_by_or_operator_name, '')), '\s+', ' ', 'g');
  if new.collected_by_or_operator_name = '' then
    new.collected_by_or_operator_name := old.collected_by_or_operator_name;
  end if;

  if old.status = 'draft' and new.status = 'pending' then
    -- Send for Verification: the entry's creator, or an inspector / admin
    if not (v_role in ('inspector', 'admin') or old.created_by = auth.uid()) then
      raise exception 'Only the person who logged this entry can send it for verification';
    end if;
    if new.collected_by_or_operator_name = '' then raise exception 'Collected By is required before sending for verification'; end if;
    new.certificate_no := null; new.verified_by := null; new.verified_by_name := null; new.verified_at := null;
  elsif old.status = 'pending' and new.status = 'passed' then
    if v_role not in ('inspector', 'admin') then
      raise exception 'Only inspectors or admins can approve a record';
    end if;
    select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
    new.verified_by := auth.uid();
    new.verified_by_name := v_name;
    new.verified_at := now();
    new.certificate_no := 'CERT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.certificate_seq')::text, 5, '0');
  elsif old.status = 'passed' and new.status = 'pending' then
    if v_role not in ('inspector', 'admin') then
      raise exception 'Only inspectors or admins can remove verification';
    end if;
    new.verified_by := null; new.verified_by_name := null; new.verified_at := null; new.certificate_no := null;
  elsif new.status is distinct from old.status then
    raise exception 'Invalid status change';
  else
    new.certificate_no := old.certificate_no;
    new.verified_by := old.verified_by;
    new.verified_by_name := old.verified_by_name;
    new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;

-- 5. policies
drop policy if exists "vehicles_select_signed_in" on public.vehicles;
drop policy if exists "vehicles_select_workflow" on public.vehicles;
create policy "vehicles_select_workflow" on public.vehicles for select to authenticated
  using (public.app_role() is not null
         and (status <> 'draft' or public.app_role() in ('admin', 'inspector') or created_by = auth.uid()));

drop policy if exists "vehicles_insert_own_pending" on public.vehicles;
drop policy if exists "vehicles_insert_workflow" on public.vehicles;
create policy "vehicles_insert_workflow" on public.vehicles for insert to authenticated
  with check (public.app_role() is not null and created_by = auth.uid()
              and certificate_no is null and verified_by is null and verified_by_name is null and verified_at is null
              and (status = 'draft' or (status = 'pending' and public.app_role() in ('admin', 'inspector'))));

drop policy if exists "vehicles_update_authorised" on public.vehicles;
drop policy if exists "vehicles_update_workflow" on public.vehicles;
create policy "vehicles_update_workflow" on public.vehicles for update to authenticated
  using (public.app_role() in ('admin', 'inspector') or (status = 'draft' and created_by = auth.uid()))
  with check (public.app_role() in ('admin', 'inspector') or (status in ('draft', 'pending') and created_by = auth.uid()));

-- 6. recycle bin keeps the jumper number
create or replace function public.vehicles_archive_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicles_trash
    (deleted_by, deleted_by_name, id, registration_no, jumper_no, document_status, date_of_entry, district,
     traffic_station, collected_by_or_operator_name, status, certificate_no, created_by, created_at,
     verified_by, verified_by_name, verified_at)
  values
    (auth.uid(), (select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid()),
     old.id, old.registration_no, old.jumper_no, old.document_status, old.date_of_entry, old.district,
     old.traffic_station, old.collected_by_or_operator_name, old.status, old.certificate_no, old.created_by,
     old.created_at, old.verified_by, old.verified_by_name, old.verified_at);
  return old;
end;
$$;

create or replace function public.admin_restore_vehicle(p_trash_id bigint)
returns bigint language plpgsql security definer set search_path = public, auth as $$
declare t public.vehicles_trash;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can restore records'; end if;
  select * into t from public.vehicles_trash where trash_id = p_trash_id;
  if not found then raise exception 'Record not found in the recycle bin'; end if;
  insert into public.vehicles
    (id, registration_no, jumper_no, document_status, date_of_entry, district, traffic_station,
     collected_by_or_operator_name, status, certificate_no, created_by, created_at,
     verified_by, verified_by_name, verified_at)
  overriding system value
  values
    (t.id, t.registration_no, coalesce(t.jumper_no, 'J-' || lpad(t.id::text, 5, '0')), t.document_status,
     t.date_of_entry, t.district, t.traffic_station,
     t.collected_by_or_operator_name, t.status, t.certificate_no,
     case when exists (select 1 from auth.users u where u.id = t.created_by) then t.created_by end,
     t.created_at,
     case when exists (select 1 from auth.users u where u.id = t.verified_by) then t.verified_by end,
     t.verified_by_name, t.verified_at);
  delete from public.vehicles_trash where trash_id = p_trash_id;
  return t.id;
end;
$$;
