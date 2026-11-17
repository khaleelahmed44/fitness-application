-- v5: 3-tier hierarchy (admin > inspector > assistant), username/password login (no email / OTP).
-- Users get a synthetic, never-mailed auth address <username>@vehicle.local.

-- roles: operator -> assistant
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
update public.profiles set role = 'assistant' where role = 'operator';
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'inspector', 'assistant'));
alter table public.profiles alter column role set default 'assistant';

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists created_by uuid references public.profiles(id) on delete set null;
update public.profiles set username = 'khaleel.ahmed' where role = 'admin' and username is null;
update public.profiles set username = lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9._-]', '', 'gi')) where username is null;
alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- replace the v4 admin-only user functions
drop function if exists public.admin_create_user(text, text, text, text);
drop function if exists public.admin_delete_user(uuid);
drop function if exists public.admin_set_password(uuid, text);
drop function if exists public.admin_list_users();

create or replace function public.create_user(p_username text, p_password text, p_full_name text, p_role text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  me text := public.app_role();
  uid uuid := gen_random_uuid();
  u text := lower(regexp_replace(btrim(coalesce(p_username, '')), '\s+', '.', 'g'));
  e text;
  n text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
begin
  if me is null or me not in ('admin', 'inspector') then raise exception 'You are not allowed to add users'; end if;
  if me = 'admin' and p_role <> 'inspector' then raise exception 'The super admin adds inspectors; inspectors add their own assistants'; end if;
  if me = 'inspector' and p_role <> 'assistant' then raise exception 'Inspectors can only add assistants'; end if;
  if u !~ '^[a-z0-9._-]{3,30}$' then raise exception 'Username must be 3-30 characters: letters, numbers, dot, dash or underscore'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if n = '' then raise exception 'Name is required'; end if;
  if exists (select 1 from public.profiles where lower(username) = u) then raise exception 'This username is already taken'; end if;
  e := u || '@vehicle.local';

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
  insert into public.profiles (id, email, full_name, role, username, created_by)
  values (uid, e, n, p_role, u, auth.uid());
  return uid;
end;
$$;

create or replace function public.remove_user(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare me text := public.app_role(); t public.profiles;
begin
  select * into t from public.profiles where id = p_id;
  if not found then raise exception 'User not found'; end if;
  if t.role = 'admin' then raise exception 'The super admin cannot be removed'; end if;
  if me = 'admin' then
    delete from auth.users where id in (select id from public.profiles where created_by = p_id);  -- their assistants
    delete from auth.users where id = p_id;
  elsif me = 'inspector' and t.role = 'assistant' and t.created_by = auth.uid() then
    delete from auth.users where id = p_id;
  else
    raise exception 'You can only remove your own assistants';
  end if;
end;
$$;

create or replace function public.set_user_password(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare me text := public.app_role(); t public.profiles;
begin
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  select * into t from public.profiles where id = p_id;
  if not found then raise exception 'User not found'; end if;
  if not (me = 'admin' or (me = 'inspector' and (t.id = auth.uid() or (t.role = 'assistant' and t.created_by = auth.uid())))) then
    raise exception 'You can only reset passwords for your own assistants';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
end;
$$;

create or replace function public.list_managed_users()
returns table (id uuid, username text, full_name text, role text, created_by_name text,
               created_at timestamptz, last_sign_in_at timestamptz, entries bigint, verified bigint)
language plpgsql security definer set search_path = public, auth as $$
declare me text := public.app_role();
begin
  if me is null or me not in ('admin', 'inspector') then raise exception 'Not allowed'; end if;
  return query
    select p.id, p.username, p.full_name, p.role,
           (select c.full_name from public.profiles c where c.id = p.created_by),
           p.created_at, u.last_sign_in_at,
           (select count(*) from public.vehicles v where v.created_by = p.id),
           (select count(*) from public.vehicles v where v.verified_by = p.id)
    from public.profiles p left join auth.users u on u.id = p.id
    where me = 'admin' or (p.role = 'assistant' and p.created_by = auth.uid())
    order by (p.role = 'admin') desc, (p.role = 'inspector') desc, p.created_at;
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
    'assistants', (select count(*) from public.profiles where role = 'assistant'),
    'last_entry_at', (select max(created_at) from public.vehicles),
    'last_verified_at', (select max(verified_at) from public.vehicles),
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'table_size', pg_size_pretty(pg_total_relation_size('public.vehicles'))
  );
end;
$$;

revoke execute on function public.create_user(text, text, text, text) from public, anon;
revoke execute on function public.remove_user(uuid) from public, anon;
revoke execute on function public.set_user_password(uuid, text) from public, anon;
revoke execute on function public.list_managed_users() from public, anon;
grant execute on function public.create_user(text, text, text, text) to authenticated;
grant execute on function public.remove_user(uuid) to authenticated;
grant execute on function public.set_user_password(uuid, text) to authenticated;
grant execute on function public.list_managed_users() to authenticated;
