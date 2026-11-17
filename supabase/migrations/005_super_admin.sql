-- v4: single super admin, admin-managed users (no self-registration), admin-only delete with
-- recycle bin, inspector editing, admin monitoring functions. Run after 004.
-- NOTE: the super admin's password is NOT stored here; set it in Supabase (see README).

create unique index if not exists profiles_single_admin on public.profiles ((role)) where role = 'admin';

-- No self-registration: signing up creates NO profile, so the account has no access
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  return new;
end;
$$;

drop policy if exists "vehicles_update_authorised" on public.vehicles;
create policy "vehicles_update_authorised" on public.vehicles
  for update to authenticated
  using (public.app_role() in ('admin', 'inspector') or (status = 'pending' and created_by = auth.uid()))
  with check (public.app_role() in ('admin', 'inspector') or (status = 'pending' and created_by = auth.uid()));

drop policy if exists "vehicles_delete_authorised" on public.vehicles;
drop policy if exists "vehicles_delete_admin_only" on public.vehicles;
create policy "vehicles_delete_admin_only" on public.vehicles
  for delete to authenticated using (public.app_role() = 'admin');

create table if not exists public.vehicles_trash (
  trash_id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_by_name text,
  id bigint not null,
  registration_no text,
  document_status text,
  date_of_entry date,
  district text,
  traffic_station text,
  collected_by_or_operator_name text,
  status text,
  certificate_no text,
  created_by uuid,
  created_at timestamptz,
  verified_by uuid,
  verified_by_name text,
  verified_at timestamptz
);
alter table public.vehicles_trash enable row level security;
drop policy if exists "trash_select_admin" on public.vehicles_trash;
create policy "trash_select_admin" on public.vehicles_trash
  for select to authenticated using (public.app_role() = 'admin');
revoke all on public.vehicles_trash from anon, authenticated;
grant select on public.vehicles_trash to authenticated;

create or replace function public.vehicles_archive_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicles_trash
    (deleted_by, deleted_by_name, id, registration_no, document_status, date_of_entry, district,
     traffic_station, collected_by_or_operator_name, status, certificate_no, created_by, created_at,
     verified_by, verified_by_name, verified_at)
  values
    (auth.uid(), (select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid()),
     old.id, old.registration_no, old.document_status, old.date_of_entry, old.district,
     old.traffic_station, old.collected_by_or_operator_name, old.status, old.certificate_no, old.created_by,
     old.created_at, old.verified_by, old.verified_by_name, old.verified_at);
  return old;
end;
$$;
drop trigger if exists vehicles_archive_delete on public.vehicles;
create trigger vehicles_archive_delete before delete on public.vehicles
  for each row execute function public.vehicles_archive_delete();
revoke execute on function public.vehicles_archive_delete() from public, anon, authenticated;

create or replace function public.admin_create_user(p_email text, p_password text, p_full_name text, p_role text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  uid uuid := gen_random_uuid();
  e text := lower(btrim(p_email));
  n text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can add users'; end if;
  if p_role not in ('inspector', 'operator') then raise exception 'Role must be inspector or operator'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if n = '' then raise exception 'Name is required'; end if;
  if exists (select 1 from auth.users where lower(email) = e) then raise exception 'A user with this email already exists'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', n), now(), now(),
    '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
  insert into public.profiles (id, email, full_name, role) values (uid, e, n, p_role);
  return uid;
end;
$$;

create or replace function public.admin_delete_user(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare r text;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can remove users'; end if;
  if p_id = auth.uid() then raise exception 'You cannot remove your own account'; end if;
  select role into r from public.profiles where id = p_id;
  if r = 'admin' then raise exception 'The super admin cannot be removed'; end if;
  delete from auth.users where id = p_id;
end;
$$;

create or replace function public.admin_set_password(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can reset passwords'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
end;
$$;

create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, role text, created_at timestamptz,
               last_sign_in_at timestamptz, entries bigint, verified bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can list users'; end if;
  return query
    select p.id, p.email, p.full_name, p.role, p.created_at, u.last_sign_in_at,
           (select count(*) from public.vehicles v where v.created_by = p.id),
           (select count(*) from public.vehicles v where v.verified_by = p.id)
    from public.profiles p left join auth.users u on u.id = p.id
    order by (p.role = 'admin') desc, p.created_at;
end;
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can view monitoring'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.vehicles),
    'pending', (select count(*) from public.vehicles where status = 'pending'),
    'verified', (select count(*) from public.vehicles where status = 'passed'),
    'today', (select count(*) from public.vehicles where date_of_entry = (now() at time zone 'Asia/Karachi')::date),
    'last7', (select count(*) from public.vehicles where created_at > now() - interval '7 days'),
    'trash', (select count(*) from public.vehicles_trash),
    'admins', (select count(*) from public.profiles where role = 'admin'),
    'inspectors', (select count(*) from public.profiles where role = 'inspector'),
    'operators', (select count(*) from public.profiles where role = 'operator'),
    'last_entry_at', (select max(created_at) from public.vehicles),
    'last_verified_at', (select max(verified_at) from public.vehicles),
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'table_size', pg_size_pretty(pg_total_relation_size('public.vehicles'))
  );
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
    (id, registration_no, document_status, date_of_entry, district, traffic_station,
     collected_by_or_operator_name, status, certificate_no, created_by, created_at,
     verified_by, verified_by_name, verified_at)
  overriding system value
  values
    (t.id, t.registration_no, t.document_status, t.date_of_entry, t.district, t.traffic_station,
     t.collected_by_or_operator_name, t.status, t.certificate_no,
     case when exists (select 1 from auth.users u where u.id = t.created_by) then t.created_by end,
     t.created_at,
     case when exists (select 1 from auth.users u where u.id = t.verified_by) then t.verified_by end,
     t.verified_by_name, t.verified_at);
  delete from public.vehicles_trash where trash_id = p_trash_id;
  return t.id;
end;
$$;

create or replace function public.admin_purge_trash(p_trash_id bigint default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Only the administrator can purge the recycle bin'; end if;
  delete from public.vehicles_trash where p_trash_id is null or trash_id = p_trash_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.admin_create_user(text, text, text, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_restore_vehicle(bigint) from public, anon;
revoke execute on function public.admin_purge_trash(bigint) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_restore_vehicle(bigint) to authenticated;
grant execute on function public.admin_purge_trash(bigint) to authenticated;
