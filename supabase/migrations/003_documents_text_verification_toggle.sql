-- v3: "Documents Original Submitted" becomes free text; verification can be toggled both ways.
-- Run after 002. (Trigger functions are replaced; see vehicles_before_insert / vehicles_guard.)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.vehicles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%document_status%'
  loop
    execute format('alter table public.vehicles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.vehicles alter column document_status set default '';
alter table public.vehicles add constraint vehicles_document_status_len check (length(document_status) <= 300);
update public.vehicles set document_status = '' where document_status = 'No';

create or replace function public.vehicles_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registration_no := upper(regexp_replace(btrim(new.registration_no), '\s+', ' ', 'g'));
  new.document_status := regexp_replace(btrim(coalesce(new.document_status, '')), '\s+', ' ', 'g');
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
  new.document_status := regexp_replace(btrim(coalesce(new.document_status, '')), '\s+', ' ', 'g');
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
    select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
    new.verified_by := auth.uid();
    new.verified_by_name := v_name;
    new.verified_at := now();
    new.certificate_no := 'CERT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.certificate_seq')::text, 5, '0');
  elsif old.status = 'passed' and new.status = 'pending' then
    if v_role not in ('inspector', 'admin') then
      raise exception 'Only inspectors or admins can remove verification';
    end if;
    new.verified_by := null;
    new.verified_by_name := null;
    new.verified_at := null;
    new.certificate_no := null;
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
