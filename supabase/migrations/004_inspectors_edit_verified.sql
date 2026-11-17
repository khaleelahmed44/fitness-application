-- Any inspector may edit verified records (delete stays with the verifier / admin).
drop policy if exists "vehicles_update_authorised" on public.vehicles;
create policy "vehicles_update_authorised" on public.vehicles
  for update to authenticated
  using (
    public.app_role() = 'admin'
    or (status = 'pending' and (created_by = auth.uid() or public.app_role() = 'inspector'))
    or (status = 'passed' and public.app_role() = 'inspector')
  )
  with check (
    public.app_role() = 'admin'
    or (status = 'pending' and (created_by = auth.uid() or public.app_role() = 'inspector'))
    or (status = 'passed' and public.app_role() = 'inspector')
  );
