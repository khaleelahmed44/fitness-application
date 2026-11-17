-- Inspectors may delete too (admin keeps the recycle bin: every delete is archived by the trigger).
drop policy if exists "vehicles_delete_admin_only" on public.vehicles;
drop policy if exists "vehicles_delete_admin_inspector" on public.vehicles;
create policy "vehicles_delete_admin_inspector" on public.vehicles
  for delete to authenticated using (public.app_role() in ('admin','inspector'));
